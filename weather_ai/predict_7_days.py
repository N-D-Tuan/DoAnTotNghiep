import os
import joblib
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from dotenv import load_dotenv

MODEL_FILE = "weather_ai_model.pkl"
OUTPUT_FILE = "du_bao_thoi_tiet_7_ngay.csv"
FORECAST_DAYS = 7

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
    if luong_mua > 10: return "Mưa lớn"
    if co_mua and luong_mua > 0.1: return "Mưa"
    if cloud_cover > 90 and humidity > 88:
        if pressure < 1005 and wind_speed > 15:
            return "Mưa lớn"
        return "Mưa"
    if cloud_cover >= 80: return "Âm u"
    if cloud_cover >= 30: return "Có mây"
    return "Nắng"

def du_doan_7_ngay_toi():
    print("1. Nạp bộ mô hình AI...")

    # --- TỰ ĐỘNG NẠP NGƯỠNG TỪ FILE CSV VÀO BIẾN TOÀN CỤC ---
    global RAIN_PROBABILITY_THRESHOLD
    try:
        RAIN_PROBABILITY_THRESHOLD = float(pd.read_csv("optimal_threshold.csv")["threshold"].iloc[0])
        print(f"[*] Hệ thống nạp thành công Threshold tự động: {RAIN_PROBABILITY_THRESHOLD:.2f}")
    except FileNotFoundError:
        RAIN_PROBABILITY_THRESHOLD = 0.28
        print(f"[*] Lỗi: Không thấy optimal_threshold.csv, dùng mức dự phòng: {RAIN_PROBABILITY_THRESHOLD}")
    # --------------------------------------------------------

    bundle = joblib.load(MODEL_FILE)
    models = bundle["models"]

    for model_name, model in models.items():
        if hasattr(model, 'n_jobs'):
            model.n_jobs = 1

    history_all = pd.read_csv("danang_weather_history.csv")
    history_all["thoi_gian"] = pd.to_datetime(history_all["thoi_gian"])
    
    forecast_times = tao_khung_gio_du_bao()
    results = []

    for cluster in CLUSTERS:
        print(f"2. Đang dự báo cho {cluster['ten_cum_san']}...")
        history = history_all[history_all["cum_san_id"] == cluster["cum_san_id"]].copy()
        history = history.sort_values("thoi_gian").tail(168).copy()
        
        for forecast_time in forecast_times:
            # --- Tính mỏ neo Mean và Std từ lịch sử ---
            current_anchor = {}
            for col in bundle["base_columns"]:
                current_anchor[f"{col}_mean_7d"] = history[col].tail(168).mean()
                
            for col in ["do_am", "do_che_phu_may"]:
                std_val = history[col].tail(168).std()
                current_anchor[f"{col}_std_7d"] = 0.0 if pd.isna(std_val) else std_val
            # ------------------------------------------
                
            row = {
                "gio": forecast_time.hour,
                "thang": forecast_time.month,
                "sin_gio": np.sin(2 * np.pi * forecast_time.hour / 24),
                "cos_gio": np.cos(2 * np.pi * forecast_time.hour / 24)
            }
            row.update(current_anchor)
            X = pd.DataFrame([row])[bundle["feature_columns"]]

            rain_prob = float(models["co_mua"].predict_proba(X)[0][1])
            rain_flag = int(rain_prob >= RAIN_PROBABILITY_THRESHOLD)

            predicted = {}
            for name in bundle["base_columns"]:
                predicted[name] = float(models[name].predict(X)[0])

            rain_mm = 0.0
            if rain_flag == 1 and models.get("luong_mua") is not None:
                base_rain = float(models["luong_mua"].predict(X)[0])
                noise = (rain_prob - RAIN_PROBABILITY_THRESHOLD) * 4
                rain_mm = max(0.1, base_rain + noise)

            predicted_row = {
                "cum_san_id": cluster["cum_san_id"],
                "ten_cum_san": cluster["ten_cum_san"],
                "latitude": cluster["latitude"],
                "longitude": cluster["longitude"],
                "thoi_gian": forecast_time.strftime("%Y-%m-%d %H:%M:%S"),
                "xac_suat_mua_mo_hinh": round(rain_prob * 100, 2),
                "co_mua": "Có" if rain_flag else "Không",
                "luong_mua_mm": round(rain_mm, 2) if rain_flag else 0.0,
                "kieu_thoi_tiet": phan_loai_thoi_tiet(
                    rain_flag, 
                    rain_mm, 
                    predicted["do_che_phu_may"],
                    predicted["do_am"],
                    predicted["ap_suat"],
                    predicted["toc_do_gio"]
                ),
                "nhiet_do": round(predicted["nhiet_do"], 2),
                "do_am": round(np.clip(predicted["do_am"], 0, 100), 2),
                "do_che_phu_may": round(np.clip(predicted["do_che_phu_may"], 0, 100), 2),
                "ap_suat": round(predicted["ap_suat"], 2),
                "toc_do_gio": round(predicted["toc_do_gio"], 2)
            }
            results.append(predicted_row)

            new_history_row = {
                "thoi_gian": forecast_time,
                "nhiet_do": predicted["nhiet_do"],
                "do_am": predicted["do_am"],
                "do_che_phu_may": predicted["do_che_phu_may"],
                "ap_suat": predicted["ap_suat"],
                "toc_do_gio": predicted["toc_do_gio"]
            }
            history = pd.concat([history, pd.DataFrame([new_history_row])], ignore_index=True)

    result_df = pd.DataFrame(results)
    result_df.to_csv(OUTPUT_FILE, index=False, encoding="utf-8-sig")
    print(f"\nHoàn tất: {len(result_df)} dòng được lưu vào {OUTPUT_FILE}")

if __name__ == "__main__":
    du_doan_7_ngay_toi()