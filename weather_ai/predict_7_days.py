import os
import time
import joblib
import requests
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from dotenv import load_dotenv
from train_model import create_features, simulate_ai_7d_forecast

MODEL_FILE = "weather_ai_model.pkl"
OUTPUT_FILE = "du_bao_thoi_tiet_7_ngay.csv"
FORECAST_DAYS = 7

load_dotenv()
DB_URI = os.getenv("DB_URI")

def get_clusters_from_db():
    try:
        engine = create_engine(DB_URI)
        query = """
            SELECT 
                MaCumSan as cum_san_id, 
                TenCumSan as ten_cum_san, 
                ViDo as latitude, 
                KinhDo as longitude 
            FROM CumSan 
            WHERE ViDo IS NOT NULL AND KinhDo IS NOT NULL
        """
        df_clusters = pd.read_sql(query, engine)
        df_clusters["cum_san_id"] = df_clusters["cum_san_id"].astype(str)
        return df_clusters.to_dict("records")
    except Exception as e:
        print(f"🚨 Lỗi kết nối Database: {e}")
        return []

def tao_khung_gio_du_bao():
    now = datetime.now()
    first_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    times = []
    for day in range(FORECAST_DAYS):
        current_day = first_day + timedelta(days=day)
        for hour in range(24):
            times.append(current_day.replace(hour=hour))
    return times

def phan_loai_thoi_tiet(co_mua, luong_mua, cloud_cover, humidity, pressure, wind_speed):
    if co_mua == 1:
        if luong_mua >= 8.0 or (cloud_cover > 92 and humidity > 90 and wind_speed > 18):
            return "Mưa lớn"
        return "Mưa"
    if cloud_cover >= 82:
        return "Âm u"
    if cloud_cover >= 35:
        return "Có mây"
    return "Nắng"

def lay_5_chi_so_tu_open_meteo(lat, lon, cid):
    """
    Gọi Open-Meteo Forecast API lấy 5 chỉ số khí tượng theo tọa độ cụm sân:
    - past_days=7: 7 ngày quá khứ gần nhất để tính đặc trưng chuỗi thời gian (lag, rolling mean, std)
    - forecast_days=7: 7 ngày tương lai (168 giờ) để đưa vào AI Tầng 2 dự báo mưa
    """
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "temperature_2m,relative_humidity_2m,cloud_cover,surface_pressure,wind_speed_10m",
        "timezone": "Asia/Ho_Chi_Minh",
        "past_days": 7,
        "forecast_days": FORECAST_DAYS,
    }

    resp = requests.get(url, params=params, timeout=15)
    resp.raise_for_status()
    hourly = resp.json().get("hourly", {})

    if not hourly or "time" not in hourly:
        raise ValueError("Dữ liệu trả về từ Open-Meteo không hợp lệ")

    df = pd.DataFrame({
        "cum_san_id": str(cid),
        "thoi_gian": pd.to_datetime(hourly["time"]),
        "nhiet_do": hourly["temperature_2m"],
        "do_am": hourly["relative_humidity_2m"],
        "do_che_phu_may": hourly["cloud_cover"],
        "ap_suat": hourly["surface_pressure"],
        "toc_do_gio": hourly["wind_speed_10m"],
        "luong_mua": 0.0,  # Placeholder cho create_features, không dùng làm đầu vào dự báo
    })

    # Xử lý an toàn nếu có ô trống hiếm gặp từ API
    df = df.sort_values("thoi_gian").ffill().bfill().reset_index(drop=True)
    return df


def du_bao_bang_ai_tang_2(meteo_14d_df, bundle):
    """
    Trích xuất đặc trưng vật lý + chuỗi thời gian từ 14 ngày (7 quá khứ + 7 tương lai),
    sau đó lọc đúng 7 ngày tới (từ 00:00 hôm nay) và đưa qua mô hình AI Tầng 2 (co_mua, luong_mua).
    """
    models = bundle["models"]
    feature_columns = bundle["feature_columns"]

    featured_all = create_features(meteo_14d_df)

    # Lọc đúng 7 ngày tới bắt đầu từ 00:00 hôm nay
    start_today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    end_7d = start_today + timedelta(days=FORECAST_DAYS)

    forecast_df = featured_all[
        (featured_all["thoi_gian"] >= start_today) & (featured_all["thoi_gian"] < end_7d)
    ].copy().reset_index(drop=True)

    # Đảm bảo không còn NaN trước khi đưa vào RandomForest
    X_s2 = forecast_df[feature_columns].ffill().bfill()

    raw_probs = models["co_mua"].predict_proba(X_s2)[:, 1]
    rain_amounts = (
        models["luong_mua"].predict(X_s2)
        if models.get("luong_mua") is not None
        else np.zeros(len(forecast_df))
    )

    forecast_df["rain_prob"] = np.clip(raw_probs, 0.01, 0.99)
    forecast_df["base_rain_mm"] = np.maximum(0.0, rain_amounts)
    return forecast_df


def du_doan_7_ngay_toi():
    print("1. Nạp bộ mô hình AI Tầng 2 (weather_ai_model.pkl)...")

    try:
        RAIN_PROBABILITY_THRESHOLD = float(pd.read_csv("optimal_threshold.csv")["threshold"].iloc[0])
        print(f"[*] Nạp thành công Threshold tối ưu: {RAIN_PROBABILITY_THRESHOLD:.2f}")
    except FileNotFoundError:
        RAIN_PROBABILITY_THRESHOLD = 0.46
        print(f"[*] Không thấy optimal_threshold.csv, dùng mức dự phòng: {RAIN_PROBABILITY_THRESHOLD}")

    bundle = joblib.load(MODEL_FILE)
    for model in bundle["models"].values():
        if hasattr(model, "n_jobs"):
            model.n_jobs = 1

    # Nạp sẵn file lịch sử chỉ để dự phòng (fallback) khi mất mạng
    history_all = None
    if os.path.exists("danang_weather_history.csv"):
        history_all = pd.read_csv("danang_weather_history.csv")
        history_all["cum_san_id"] = history_all["cum_san_id"].astype(str)
        history_all["thoi_gian"] = pd.to_datetime(history_all["thoi_gian"])

    clusters = get_clusters_from_db()
    forecast_times = tao_khung_gio_du_bao()
    results = []

    for cluster in clusters:
        cid = str(cluster["cum_san_id"])
        lat = float(cluster["latitude"])
        lon = float(cluster["longitude"])
        print(f"2. Đang lấy 5 chỉ số khí tượng & chạy AI Tầng 2 cho {cluster['ten_cum_san']} ({cid})...")

        try:
            # LUỒNG CHÍNH: Lấy 5 chỉ số tương lai từ Open-Meteo -> Chạy AI Tầng 2
            meteo_14d = lay_5_chi_so_tu_open_meteo(lat, lon, cid)
            sim_df = du_bao_bang_ai_tang_2(meteo_14d, bundle)
            time.sleep(0.2)  # Nghỉ nhẹ tránh gửi request quá dồn dập
        except Exception as api_err:
            # LUỒNG DỰ PHÒNG: Nếu mất mạng / Open-Meteo lỗi -> Tự động chuyển về thuần AI
            print(f"   ⚠️ Không gọi được Open-Meteo ({api_err}). Chuyển sang chế độ dự phòng thuần AI...")
            if history_all is None:
                continue
            hist_c = history_all[history_all["cum_san_id"] == cid].sort_values("thoi_gian")
            if len(hist_c) < 168:
                hist_c = history_all.sort_values("thoi_gian")
            recent_hist = hist_c.tail(336).copy()
            sim_df = simulate_ai_7d_forecast(recent_hist, forecast_times, bundle)

        for _, row in sim_df.iterrows():
            prob = float(row["rain_prob"])
            rain_flag = int(prob >= RAIN_PROBABILITY_THRESHOLD)

            rain_mm = 0.0
            if rain_flag == 1:
                rain_mm = max(0.2, float(row["base_rain_mm"]))

            results.append({
                "cum_san_id": cid,
                "ten_cum_san": cluster["ten_cum_san"],
                "latitude": lat,
                "longitude": lon,
                "thoi_gian": pd.to_datetime(row["thoi_gian"]).strftime("%Y-%m-%d %H:%M:%S"),
                "xac_suat_mua_mo_hinh": round(prob * 100, 2),
                "co_mua": "Có" if rain_flag == 1 else "Không",
                "luong_mua_mm": round(rain_mm, 2) if rain_flag == 1 else 0.0,
                "kieu_thoi_tiet": phan_loai_thoi_tiet(
                    rain_flag,
                    rain_mm,
                    row["do_che_phu_may"],
                    row["do_am"],
                    row["ap_suat"],
                    row["toc_do_gio"],
                ),
                "nhiet_do": round(float(row["nhiet_do"]), 2),
                "do_am": round(float(np.clip(row["do_am"], 0, 100)), 2),
                "do_che_phu_may": round(float(np.clip(row["do_che_phu_may"], 0, 100)), 2),
                "ap_suat": round(float(row["ap_suat"]), 2),
                "toc_do_gio": round(float(row["toc_do_gio"]), 2),
            })

    if not results:
        print("🚨 Không có dữ liệu dự báo nào được tạo!")
        return

    result_df = pd.DataFrame(results)
    result_df.to_csv(OUTPUT_FILE, index=False, encoding="utf-8-sig")

    rain_count = (result_df["co_mua"] == "Có").sum()
    print(f"\n[HOÀN TẤT] Đã xuất {len(result_df)} dòng dự báo (Open-Meteo + AI Tầng 2) vào {OUTPUT_FILE}")
    print(f"=> Thống kê 7 ngày tới: {rain_count} giờ Có mưa ({rain_count/len(result_df)*100:.1f}%) | {len(result_df)-rain_count} giờ Không mưa ({(len(result_df)-rain_count)/len(result_df)*100:.1f}%)")
    print("=> Phân bố kiểu thời tiết:", result_df["kieu_thoi_tiet"].value_counts().to_dict())

if __name__ == "__main__":
    du_doan_7_ngay_toi()