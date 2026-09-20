import joblib
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

MODEL_FILE = "weather_ai_model.pkl"
OUTPUT_FILE = "du_bao_thoi_tiet_7_ngay.csv"

# Phải trùng với các cụm sân đã khai báo trong fetch_data_RF.py
CLUSTERS = [
    {
        "cum_san_id": 1,
        "ten_cum_san": "Sân Đa Phước",
        "latitude": 16.0763069,
        "longitude": 108.2045825
    },
    {
        "cum_san_id": 4,
        "ten_cum_san": "Sân An Phúc",
        "latitude": 16.0873684,
        "longitude": 108.2168627
    },
    {
        "cum_san_id": 5,
        "ten_cum_san": "Sân Chuyên Việt",
        "latitude": 16.0447858,
        "longitude": 108.2146174
    },
    {
        "cum_san_id": 6,
        "ten_cum_san": "Sân Win Win",
        "latitude": 16.0610116,
        "longitude": 108.2399103
    }
]

SLOTS_PER_DAY = 18
FORECAST_DAYS = 7
FORECAST_HOURS = SLOTS_PER_DAY * FORECAST_DAYS
START_HOUR = 6
END_HOUR = 23
RAIN_PROBABILITY_THRESHOLD = 0.5


def tao_dac_trung(history, forecast_time, cluster, bundle):
    """Tạo đúng bộ đặc trưng đã sử dụng lúc huấn luyện."""
    row = {
        "latitude": cluster["latitude"],
        "longitude": cluster["longitude"],
        "gio": forecast_time.hour,
        "thu_trong_tuan": forecast_time.weekday(),
        "thang": forecast_time.month,
        "ngay_trong_nam": forecast_time.timetuple().tm_yday,
        "is_weekend": int(forecast_time.weekday() >= 5),
        "sin_gio": np.sin(2 * np.pi * forecast_time.hour / 24),
        "cos_gio": np.cos(2 * np.pi * forecast_time.hour / 24),
        "sin_ngay_trong_nam": np.sin(
            2 * np.pi * forecast_time.timetuple().tm_yday / 365
        ),
        "cos_ngay_trong_nam": np.cos(
            2 * np.pi * forecast_time.timetuple().tm_yday / 365
        )
    }

    history = history.sort_values("thoi_gian").reset_index(drop=True)

    for column in bundle["base_columns"] + ["trang_thai_mua"]:
        values = (
            history["trang_thai_mua"].tolist()
            if column == "trang_thai_mua"
            else history[column].tolist()
        )
        for lag in bundle["lag_values"]:
            row[f"{column}_lag_{lag}"] = (
                values[-lag] if len(values) >= lag else np.nan
            )

    for column in ["nhiet_do", "do_am", "luong_mua"]:
        values = history[column].tail(6)
        row[f"{column}_rolling_6"] = values.mean() if len(values) else np.nan

    return pd.DataFrame([row])[bundle["feature_columns"]]


def tao_khung_gio_du_bao():
    """
    Tạo các mốc giờ liên tục trong 7 ngày:
    - Dự đoán nội bộ đủ 24 giờ/ngày để đảm bảo lag chính xác.
    - Chỉ xuất kết quả từ 06:00 đến 23:00.
    - Tổng số kết quả xuất ra: 18 × 7 = 126 mốc giờ.
    """
    now = datetime.now()

    # Bắt đầu từ 00:00 của ngày hiện tại
    first_day = now.replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0
    )

    times = []

    # Tạo đủ 24 giờ/ngày trong 7 ngày
    for day in range(FORECAST_DAYS):
        current_day = first_day + timedelta(days=day)

        for hour in range(24):
            times.append(current_day.replace(hour=hour))

    return times


def phan_loai_thoi_tiet(co_mua, luong_mua, cloud_cover):
    if luong_mua > 10:
        return "Mưa lớn"
    if co_mua and luong_mua > 0.1:
        return "Mưa"
    if cloud_cover >= 80:
        return "Âm u"
    if cloud_cover >= 30:
        return "Có mây"
    return "Nắng"


def du_doan_7_ngay_toi():
    print("1. Nạp bộ mô hình Random Forest...")
    bundle = joblib.load(MODEL_FILE)
    models = bundle["models"]

    for model in models.values():
        if model is not None and hasattr(model, "n_jobs"):
            model.n_jobs = 1

    history_all = pd.read_csv("danang_weather_history.csv")
    history_all["thoi_gian"] = pd.to_datetime(history_all["thoi_gian"])

    forecast_times = tao_khung_gio_du_bao()
    results = []

    for cluster in CLUSTERS:
        print(f"\n2. Dự báo cho {cluster['ten_cum_san']}...")
        history = history_all[
            history_all["cum_san_id"] == cluster["cum_san_id"]
        ].copy()

        if history.empty:
            print("   Không có dữ liệu lịch sử cho cụm sân này.")
            continue

        history = history.sort_values("thoi_gian").copy()
        history["trang_thai_mua"] = (
            history["luong_mua"] > bundle["rain_threshold"]
        ).astype(int)

        for forecast_time in forecast_times:
            X = tao_dac_trung(history, forecast_time, cluster, bundle)
            if X.isna().any().any():
                raise ValueError(
                    "Không đủ dữ liệu lịch sử để tạo lag features."
                )

            rain_probability = float(
                models["co_mua"].predict_proba(X)[0][1]
            )

            rain_flag = int(
                rain_probability >= RAIN_PROBABILITY_THRESHOLD
            )

            # ==========================================================
            # DỰ ĐOÁN LƯỢNG MƯA
            # ==========================================================

            rain_mm_model = 0.0

            if models.get("luong_mua") is not None:
                # Mô hình hiện đã được huấn luyện trực tiếp bằng mm,
                # không còn sử dụng log1p().
                rain_mm_model = float(
                    models["luong_mua"].predict(X)[0]
                )

                # Không cho phép lượng mưa âm.
                rain_mm_model = max(0.0, rain_mm_model)

            # Trạng thái mưa chỉ dựa trên mô hình phân loại.
            # Không bắt buộc mô hình lượng mưa phải đồng thuận,
            # nhằm hạn chế bỏ sót các trường hợp có mưa.
            rain_flag = int(
                rain_probability >= RAIN_PROBABILITY_THRESHOLD
            )

            # Nếu mô hình phân loại dự báo có mưa,
            # giữ lại lượng mưa dự báo của mô hình hồi quy.
            if rain_flag == 1:
                rain_mm = rain_mm_model
            else:
                rain_mm = 0.0

            predicted = {}
            for name in [
                "nhiet_do", "do_am", "do_che_phu_may",
                "ap_suat", "toc_do_gio"
            ]:
                predicted[name] = float(models[name].predict(X)[0])

            predicted["do_am"] = np.clip(predicted["do_am"], 0, 100)
            predicted["do_che_phu_may"] = np.clip(
                predicted["do_che_phu_may"], 0, 100
            )
            predicted["luong_mua"] = rain_mm
            predicted["trang_thai_mua"] = rain_flag

            results.append({
                "cum_san_id": cluster["cum_san_id"],
                "ten_cum_san": cluster["ten_cum_san"],
                "latitude": cluster["latitude"],
                "longitude": cluster["longitude"],
                "thoi_gian": forecast_time.strftime("%Y-%m-%d %H:%M:%S"),
                "xac_suat_mua_mo_hinh": round(rain_probability * 100, 2),
                "co_mua": "Có" if predicted["trang_thai_mua"] else "Không",
                "luong_mua_mm": round(rain_mm, 2),
                "kieu_thoi_tiet": phan_loai_thoi_tiet(
                    predicted["trang_thai_mua"],
                    rain_mm,
                    predicted["do_che_phu_may"]
                ),
                "nhiet_do": round(predicted["nhiet_do"], 2),
                "do_am": round(predicted["do_am"], 2),
                "do_che_phu_may": round(predicted["do_che_phu_may"], 2),
                "ap_suat": round(predicted["ap_suat"], 2),
                "toc_do_gio": round(predicted["toc_do_gio"], 2)
            })

            # Cập nhật lịch sử bằng dự báo vừa tạo để dự báo bước tiếp theo.
            # new_row = {
            #     "thoi_gian": forecast_time,
            #     **predicted
            # }
            # history = pd.concat(
            #     [history, pd.DataFrame([new_row])],
            #     ignore_index=True
            # )

    result_df = pd.DataFrame(results)
    result_df.to_csv(OUTPUT_FILE, index=False, encoding="utf-8-sig")
    print(f"\nHoàn tất: {len(result_df)} dòng được lưu vào {OUTPUT_FILE}")
    print(result_df.head(10).to_string(index=False))


if __name__ == "__main__":
    du_doan_7_ngay_toi()
