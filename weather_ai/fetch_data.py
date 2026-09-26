import os
import requests
import pandas as pd
import time
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from dotenv import load_dotenv

load_dotenv()
DB_URI = os.getenv("DB_URI")

def get_clusters_from_db():
    try:
        engine = create_engine(DB_URI)
        # Chỉ lấy những sân có tọa độ
        query = """
            SELECT 
                ID as cum_san_id, 
                TenCumSan as ten_cum_san, 
                ViDo as latitude, 
                KinhDo as longitude 
            FROM CumSan 
            WHERE ViDo IS NOT NULL AND KinhDo IS NOT NULL
        """
        df_clusters = pd.read_sql(query, engine)
        return df_clusters.to_dict('records')
    except Exception as e:
        print(f" Lỗi kết nối Database: {e}")
        return []

CLUSTERS = get_clusters_from_db()

OUTPUT_FILE = "danang_weather_history.csv"
YEARS_TO_FETCH = 3
TIMEZONE = "Asia/Bangkok"


def request_with_retry(url, params, max_retries=3):
    for attempt in range(1, max_retries + 1):
        try:
            response = requests.get(url, params=params, timeout=60)
            if response.status_code == 200:
                return response.json()
            print(f"   [LỖI] HTTP {response.status_code}, lần thử {attempt}/{max_retries}")
        except requests.RequestException as error:
            print(f"   [LỖI MẠNG] {error}, lần thử {attempt}/{max_retries}")
        time.sleep(3)
    return None


def fetch_historical_weather():
    print("Bắt đầu tải dữ liệu thời tiết lịch sử cho các cụm sân...")

    end_date = datetime.now() - timedelta(days=1)
    all_dataframes = []

    for cluster in CLUSTERS:
        print(
            f"\n=== {cluster['ten_cum_san']} "
            f"({cluster['latitude']}, {cluster['longitude']}) ==="
        )

        for year_index in range(YEARS_TO_FETCH):
            chunk_end = end_date - timedelta(days=year_index * 365)
            chunk_start = chunk_end - timedelta(days=364)

            start_str = chunk_start.strftime("%Y-%m-%d")
            end_str = chunk_end.strftime("%Y-%m-%d")

            params = {
                "latitude": cluster["latitude"],
                "longitude": cluster["longitude"],
                "start_date": start_str,
                "end_date": end_str,
                "hourly": (
                    "temperature_2m,relative_humidity_2m,precipitation,"
                    "weather_code,cloud_cover,surface_pressure,wind_speed_10m"
                ),
                "timezone": TIMEZONE
            }

            print(f"-> Tải từ {start_str} đến {end_str}...")
            data = request_with_retry(
                "https://archive-api.open-meteo.com/v1/archive",
                params
            )

            if not data or "hourly" not in data:
                print("   [BỎ QUA] Không lấy được dữ liệu khoảng thời gian này.")
                continue

            hourly = data["hourly"]
            frame = pd.DataFrame({
                "thoi_gian": hourly["time"],
                "nhiet_do": hourly["temperature_2m"],
                "do_am": hourly["relative_humidity_2m"],
                "luong_mua": hourly["precipitation"],
                "ma_thoi_tiet": hourly["weather_code"],
                "do_che_phu_may": hourly["cloud_cover"],
                "ap_suat": hourly["surface_pressure"],
                "toc_do_gio": hourly["wind_speed_10m"],
                "cum_san_id": cluster["cum_san_id"],
                "ten_cum_san": cluster["ten_cum_san"],
                "latitude": cluster["latitude"],
                "longitude": cluster["longitude"]
            })
            all_dataframes.append(frame)
            print(f"   [OK] {len(frame)} dòng.")

    if not all_dataframes:
        print("Không có dữ liệu để lưu.")
        return

    result = pd.concat(all_dataframes, ignore_index=True)
    result["thoi_gian"] = pd.to_datetime(result["thoi_gian"])
    result = (
        result.drop_duplicates(subset=["cum_san_id", "thoi_gian"])
              .sort_values(["cum_san_id", "thoi_gian"])
              .dropna()
    )
    result.to_csv(OUTPUT_FILE, index=False, encoding="utf-8-sig")

    print(f"\nHoàn tất: {len(result)} dòng được lưu vào {OUTPUT_FILE}")


if __name__ == "__main__":
    fetch_historical_weather()
