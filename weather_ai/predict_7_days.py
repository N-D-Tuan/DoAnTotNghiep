import os
import joblib
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from dotenv import load_dotenv
from train_model import simulate_ai_7d_forecast

MODEL_FILE = "weather_ai_model.pkl"
OUTPUT_FILE = "du_bao_thoi_tiet_7_ngay.csv"
FORECAST_DAYS = 7

load_dotenv()
DB_URI = os.getenv("DB_URI")

def get_clusters_from_db():
    try:
        engine = create_engine(DB_URI)
        # Lấy TẤT CẢ cụm sân có tọa độ (Bỏ điều kiện lọc TrangThai = 'HoatDong')
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
        return df_clusters.to_dict('records')
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

def du_doan_7_ngay_toi():
    print("1. Nạp bộ mô hình AI (weather_ai_model.pkl)...")

    try:
        RAIN_PROBABILITY_THRESHOLD = float(pd.read_csv("optimal_threshold.csv")["threshold"].iloc[0])
        print(f"[*] Hệ thống nạp thành công Threshold tự động: {RAIN_PROBABILITY_THRESHOLD:.2f}")
    except FileNotFoundError:
        RAIN_PROBABILITY_THRESHOLD = 0.46
        print(f"[*] Không thấy optimal_threshold.csv, dùng mức dự phòng: {RAIN_PROBABILITY_THRESHOLD}")

    bundle = joblib.load(MODEL_FILE)
    for model in bundle["models"].values():
        if hasattr(model, 'n_jobs'):
            model.n_jobs = 1

    history_all = pd.read_csv("danang_weather_history.csv")
    history_all["cum_san_id"] = history_all["cum_san_id"].astype(str)
    history_all["thoi_gian"] = pd.to_datetime(history_all["thoi_gian"])

    clusters = get_clusters_from_db()
    forecast_times = tao_khung_gio_du_bao()
    results = []

    for cluster in clusters:
        cid = str(cluster["cum_san_id"])
        print(f"2. Bot AI đang tự dự báo 7 ngày tới cho {cluster['ten_cum_san']} ({cid})...")

        hist_c = history_all[history_all["cum_san_id"] == cid].sort_values("thoi_gian")
        if len(hist_c) < 168:
            hist_c = history_all.sort_values("thoi_gian")

        # Lấy đúng 14 ngày lịch sử gần nhất sát với thời điểm hiện tại để dự báo 7 ngày tới
        recent_hist = hist_c.tail(336).copy()
        sim_df = simulate_ai_7d_forecast(recent_hist, forecast_times, bundle)

        for _, row in sim_df.iterrows():
            prob = float(row["rain_prob"])
            rain_flag = int(prob >= RAIN_PROBABILITY_THRESHOLD)

            rain_mm = 0.0
            if rain_flag == 1:
                rain_mm = max(0.2, float(row["base_rain_mm"]) * (prob / max(RAIN_PROBABILITY_THRESHOLD, 0.25)))

            results.append({
                "cum_san_id": cid,
                "ten_cum_san": cluster["ten_cum_san"],
                "latitude": cluster["latitude"],
                "longitude": cluster["longitude"],
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
                    row["toc_do_gio"]
                ),
                "nhiet_do": round(float(row["nhiet_do"]), 2),
                "do_am": round(float(np.clip(row["do_am"], 0, 100)), 2),
                "do_che_phu_may": round(float(np.clip(row["do_che_phu_may"], 0, 100)), 2),
                "ap_suat": round(float(row["ap_suat"]), 2),
                "toc_do_gio": round(float(row["toc_do_gio"]), 2)
            })

    result_df = pd.DataFrame(results)
    result_df.to_csv(OUTPUT_FILE, index=False, encoding="utf-8-sig")

    rain_count = (result_df["co_mua"] == "Có").sum()
    print(f"\n[HOÀN TẤT] Đã xuất {len(result_df)} dòng dự báo thuần AI vào {OUTPUT_FILE}")
    print(f"=> Thống kê 7 ngày tới: {rain_count} giờ Có mưa ({rain_count/len(result_df)*100:.1f}%) | {len(result_df)-rain_count} giờ Không mưa ({(len(result_df)-rain_count)/len(result_df)*100:.1f}%)")
    print("=> Phân bố kiểu thời tiết:", result_df["kieu_thoi_tiet"].value_counts().to_dict())

if __name__ == "__main__":
    du_doan_7_ngay_toi()