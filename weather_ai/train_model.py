import warnings
warnings.filterwarnings("ignore")
import time
import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score, mean_absolute_error
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor

start_time = time.time()
INPUT_FILE = "danang_weather_history.csv"
MODEL_FILE = "weather_ai_model.pkl"

BASE_COLUMNS = ["nhiet_do", "do_am", "do_che_phu_may", "ap_suat", "toc_do_gio"]

def create_features(df):
    """
    Tạo bộ đặc trưng Khí tượng Vật lý + Chuỗi thời gian (Chuẩn .shift(1), không dùng .bfill()):
    - Tầng 1 (stage1_features): Chỉ dùng lịch sử quá khứ + chu kỳ thời gian để AI tự dự báo 5 chỉ số khí tượng.
    - Tầng 2 (feature_columns): Kết hợp 5 chỉ số khí tượng + biến vật lý (Điểm sương, Tụt áp, Ngưng tụ) để phân loại Mưa.
    """
    df = df.copy()
    df["cum_san_id"] = df["cum_san_id"].astype(str)
    df["thoi_gian"] = pd.to_datetime(df["thoi_gian"])
    df = df.sort_values(["cum_san_id", "thoi_gian"]).reset_index(drop=True)

    # 1. Đặc trưng chu kỳ Thời gian
    df["gio"] = df["thoi_gian"].dt.hour
    df["thang"] = df["thoi_gian"].dt.month
    day_of_year = df["thoi_gian"].dt.dayofyear
    df["sin_gio"] = np.sin(2 * np.pi * df["gio"] / 24.0)
    df["cos_gio"] = np.cos(2 * np.pi * df["gio"] / 24.0)
    df["sin_mua"] = np.sin(2 * np.pi * day_of_year / 365.25)
    df["cos_mua"] = np.cos(2 * np.pi * day_of_year / 365.25)

    grouped = df.groupby("cum_san_id", group_keys=False)

    # 2. Đặc trưng Quá khứ (Tất cả đều dịch .shift(1) trở về trước, không rò rỉ tương lai)
    for col in BASE_COLUMNS:
        df[f"{col}_lag_1h"]  = grouped[col].shift(1)
        df[f"{col}_lag_3h"]  = grouped[col].shift(3)
        df[f"{col}_mean_6h"] = grouped[col].transform(lambda s: s.shift(1).rolling(6, min_periods=3).mean())
        df[f"{col}_mean_24h"]= grouped[col].transform(lambda s: s.shift(1).rolling(24, min_periods=12).mean())
        df[f"{col}_mean_7d"] = grouped[col].transform(lambda s: s.shift(1).rolling(168, min_periods=24).mean())
        df[f"{col}_same_hour_3d"] = (
            grouped[col].shift(24) + grouped[col].shift(48) + grouped[col].shift(72)
        ) / 3.0

    for col in ["do_am", "do_che_phu_may", "ap_suat"]:
        df[f"{col}_std_24h"] = grouped[col].transform(lambda s: s.shift(1).rolling(24, min_periods=6).std())

    # 3. Đặc trưng Vật lý Khí tượng (Điểm sương, Độ hụt điểm sương, Độ tụt áp, Chỉ số ngưng tụ)
    df["dew_point"] = df["nhiet_do"] - ((100.0 - df["do_am"]) / 5.0)
    df["dew_point_spread"] = df["nhiet_do"] - df["dew_point"]
    df["ap_suat_diff_3h"] = df["ap_suat"] - df["ap_suat_lag_3h"]
    df["ap_suat_diff_24h"] = df["ap_suat"] - df["ap_suat_mean_24h"]
    df["do_am_diff_3h"] = df["do_am"] - df["do_am_lag_3h"]
    df["chi_so_ngung_tu"] = (df["do_am"] * df["do_che_phu_may"]) / 100.0

    if "luong_mua" in df.columns:
        df["trang_thai_mua"] = (df["luong_mua"] > 0.1).astype(int)
        df["target_co_mua"] = df["trang_thai_mua"]
        df["target_luong_mua"] = df["luong_mua"]

    for col in BASE_COLUMNS:
        df[f"target_{col}"] = df[col]

    return df

def get_stage1_features():
    """Đặc trưng Tầng 1 để AI tự dự báo Nhiệt độ, Độ ẩm, Mây, Áp suất, Tốc độ gió cho 7 ngày tới"""
    cols = ["gio", "thang", "sin_gio", "cos_gio", "sin_mua", "cos_mua"]
    for col in BASE_COLUMNS:
        cols.extend([f"{col}_mean_24h", f"{col}_mean_7d", f"{col}_same_hour_3d"])
    return cols

def get_feature_columns():
    """Đặc trưng Tầng 2 để AI Phân loại Mưa & Dự báo Lượng mưa"""
    cols = [
        "gio", "thang", "sin_gio", "cos_gio", "sin_mua", "cos_mua",
        "nhiet_do", "do_am", "do_che_phu_may", "ap_suat", "toc_do_gio",
        "dew_point", "dew_point_spread",
        "ap_suat_diff_3h", "ap_suat_diff_24h", "do_am_diff_3h", "chi_so_ngung_tu",
        "do_am_std_24h", "do_che_phu_may_std_24h", "ap_suat_std_24h"
    ]
    for col in BASE_COLUMNS:
        cols.extend([f"{col}_lag_1h", f"{col}_lag_3h", f"{col}_mean_6h", f"{col}_mean_24h", f"{col}_mean_7d", f"{col}_same_hour_3d"])
    return cols

def split_time_series_3_ways(df, feature_columns):
    """
    Chia dữ liệu theo thời gian bên trong từng Tháng của từng Cụm sân (70% Train - 15% Validation - 15% Test):
    - Đảm bảo cả 3 tập Train, Validation, Test đều có đủ 12 tháng (cả mùa mưa lẫn mùa khô),
      không bị lệch mùa khi chọn Threshold mà vẫn giữ đúng thứ tự thời gian!
    """
    clean_df = df.dropna(subset=feature_columns + ["target_co_mua", "target_luong_mua"]).copy()
    train_list, val_list, test_list = [], [], []

    for (cid, month), group in clean_df.groupby(["cum_san_id", "thang"]):
        group = group.sort_values("thoi_gian").reset_index(drop=True)
        n = len(group)
        train_end = int(n * 0.70)
        val_end = int(n * 0.85)

        train_list.append(group.iloc[:train_end])
        val_list.append(group.iloc[train_end:val_end])
        test_list.append(group.iloc[val_end:])

    return (
        pd.concat(train_list, ignore_index=True),
        pd.concat(val_list, ignore_index=True),
        pd.concat(test_list, ignore_index=True)
    )

def simulate_ai_7d_forecast(history_df, forecast_times, bundle):
    """
    Hàm lõi giúp AI TỰ DỰ ĐOÁN 100% cho 168 giờ (7 ngày) mà KHÔNG gọi API ngoài:
    - Kết hợp dự báo từ 5 mô hình RandomForest Tầng 1 với Đường cong Chu kỳ Ngày-Đêm (Diurnal Cycle)
      và Quán tính Khí tượng giảm dần theo khoảng cách ngày dự báo (Exponential Horizon Decay).
    - Không copy nhiễu ngẫu nhiên của tuần trước, không cộng hằng số cứng gây báo mưa giả.
    """
    models = bundle["models"]
    stage1_features = bundle["stage1_features"]
    feature_columns = bundle["feature_columns"]
    base_columns = bundle["base_columns"]

    hist = history_df.sort_values("thoi_gian").tail(336).copy()
    hist["thoi_gian"] = pd.to_datetime(hist["thoi_gian"])
    recent_168 = hist.tail(168).copy()
    recent_24 = hist.tail(24).copy()

    overall_means = {c: float(recent_168[c].mean()) for c in base_columns}
    recent_24_means = {c: float(recent_24[c].mean()) for c in base_columns}

    # Đường cong chu kỳ 24 giờ trong ngày (Diurnal Profile: Sáng - Trưa - Chiều - Đêm)
    hourly_profile = {}
    for h in range(24):
        sub_h = recent_168[recent_168["thoi_gian"].dt.hour == h]
        hourly_profile[h] = {}
        for c in base_columns:
            hourly_profile[h][c] = float(sub_h[c].mean()) - overall_means[c] if len(sub_h) > 0 else 0.0

    work_hist = recent_168[["thoi_gian"] + base_columns].copy()
    predicted_meteo_rows = []

    for idx, t in enumerate(forecast_times):
        t_dt = pd.to_datetime(t)
        h = t_dt.hour
        day_of_year = t_dt.timetuple().tm_yday
        tail_168 = work_hist.tail(168)
        tail_72 = work_hist.tail(72)
        tail_24 = work_hist.tail(24)
        same_h = tail_168[tail_168["thoi_gian"].dt.hour == h]
        if len(same_h) == 0:
            same_h = tail_168

        s1_row = {
            "gio": h,
            "thang": t_dt.month,
            "sin_gio": np.sin(2 * np.pi * h / 24.0),
            "cos_gio": np.cos(2 * np.pi * h / 24.0),
            "sin_mua": np.sin(2 * np.pi * day_of_year / 365.25),
            "cos_mua": np.cos(2 * np.pi * day_of_year / 365.25),
        }
        for c in base_columns:
            s1_row[f"{c}_mean_24h"] = float(tail_24[c].mean())
            s1_row[f"{c}_mean_7d"]  = float(tail_168[c].mean())
            s1_row[f"{c}_same_hour_3d"] = float(same_h[c].tail(3).mean())

        X_s1 = pd.DataFrame([s1_row])[stage1_features]

        # Trọng số quán tính giảm dần theo khoảng cách giờ dự báo (Ngày 1 bám sát 24h cuối, ngày 3-7 hội tụ về chu kỳ tuần)
        decay_w = np.exp(-idx / 72.0)
        # Nhịp dao động thời tiết tự nhiên theo chu kỳ ngày để phân tách ngày nắng và ngày mưa trong tuần
        day_wave = np.sin(2 * np.pi * (idx - 12) / 96.0)

        new_meteo = {"thoi_gian": t_dt, "luong_mua": 0.0}
        for c in base_columns:
            rf_val = float(models[c].predict(X_s1)[0])
            anchor_val = decay_w * recent_24_means[c] + (1.0 - decay_w) * overall_means[c]

            if c == "nhiet_do":
                blended_val = 0.65 * rf_val + 0.35 * anchor_val + 0.85 * hourly_profile[h][c] - (0.6 * day_wave)
            elif c in ["do_am", "do_che_phu_may"]:
                wave_amp = 6.0 if c == "do_am" else 14.0
                blended_val = 0.60 * rf_val + 0.40 * anchor_val + 0.90 * hourly_profile[h][c] + (wave_amp * day_wave)
                blended_val = float(np.clip(blended_val, 15.0, 100.0))
            elif c == "ap_suat":
                blended_val = 0.65 * rf_val + 0.35 * anchor_val + 0.80 * hourly_profile[h][c] - (1.2 * day_wave)
            else:
                blended_val = max(0.5, 0.65 * rf_val + 0.35 * anchor_val + 0.80 * hourly_profile[h][c])

            new_meteo[c] = blended_val

        predicted_meteo_rows.append(new_meteo)
        work_hist = pd.concat([work_hist, pd.DataFrame([{k: new_meteo[k] for k in ["thoi_gian"] + base_columns}])], ignore_index=True)

    future_df = pd.DataFrame(predicted_meteo_rows)
    cid = str(hist["cum_san_id"].iloc[-1]) if "cum_san_id" in hist.columns else "CS"
    future_df["cum_san_id"] = cid
    hist_for_join = recent_168[["thoi_gian"] + base_columns].copy()
    hist_for_join["cum_san_id"] = cid
    hist_for_join["luong_mua"] = 0.0

    combined = pd.concat([hist_for_join, future_df], ignore_index=True)
    featured_all = create_features(combined)
    forecast_featured = featured_all.tail(len(future_df)).copy().reset_index(drop=True)

    X_s2 = forecast_featured[feature_columns]
    raw_probs = models["co_mua"].predict_proba(X_s2)[:, 1]
    rain_amounts = models["luong_mua"].predict(X_s2) if models.get("luong_mua") is not None else np.zeros(len(forecast_featured))

    forecast_featured["rain_prob"] = np.clip(raw_probs, 0.01, 0.99)
    forecast_featured["base_rain_mm"] = rain_amounts
    return forecast_featured

def train_weather_ai():
    print("1. Đọc dữ liệu và trích xuất bộ đặc trưng Khí tượng Hai Tầng (Two-Stage AI)...")
    raw = pd.read_csv(INPUT_FILE)
    df = create_features(raw)
    stage1_features = get_stage1_features()
    feature_columns = get_feature_columns()

    train_df, val_df, test_df = split_time_series_3_ways(df, feature_columns)
    print(f"   -> Phân chia chuẩn: Train = {len(train_df):,} giờ (70%) | Validation = {len(val_df):,} giờ (15%) | Test = {len(test_df):,} giờ (15%)")

    X_train, y_train_clf = train_df[feature_columns], train_df["target_co_mua"]
    X_val, y_val_clf = val_df[feature_columns], val_df["target_co_mua"]

    models = {}

    print("2. Huấn luyện mô hình Tầng 2 - Phân loại Mưa trên tập Train (70%)...")
    rain_classifier = RandomForestClassifier(
        n_estimators=300,
        max_depth=16,
        min_samples_split=6,
        min_samples_leaf=3,
        max_features="sqrt",
        class_weight="balanced_subsample",
        random_state=42,
        n_jobs=-1
    )
    rain_classifier.fit(X_train, y_train_clf)
    models["co_mua"] = rain_classifier

    print("3. Huấn luyện mô hình Tầng 2 - Dự báo Lượng Mưa (mm)...")
    rainy_train = train_df[train_df["target_luong_mua"] > 0.1]
    if len(rainy_train) > 50:
        rain_regressor = RandomForestRegressor(
            n_estimators=200, max_depth=14, min_samples_leaf=3, random_state=42, n_jobs=-1
        )
        rain_regressor.fit(rainy_train[feature_columns], rainy_train["target_luong_mua"])
        models["luong_mua"] = rain_regressor

    print("4. Huấn luyện 5 mô hình Tầng 1 - Tự dự báo Nhiệt độ, Độ ẩm, Mây, Áp suất, Gió...")
    X_train_s1 = train_df[stage1_features]
    X_val_s1 = val_df[stage1_features]
    for target in BASE_COLUMNS:
        model = RandomForestRegressor(
            n_estimators=120, max_depth=12, min_samples_leaf=3, random_state=42, n_jobs=-1
        )
        model.fit(X_train_s1, train_df[f"target_{target}"])
        models[target] = model

    train_probs = rain_classifier.predict_proba(X_train)[:, 1]
    val_probs = rain_classifier.predict_proba(X_val)[:, 1]
    val_temp_pred = models["nhiet_do"].predict(X_val_s1)
    val_temp_mae = mean_absolute_error(val_df["target_nhiet_do"], val_temp_pred)

    print("\n========== KẾT QUẢ HUẤN LUYỆN MÔ HÌNH (TRÊN TẬP TRAIN & VALIDATION) ==========")
    print(f"✔ ROC-AUC Phân loại Mưa (Tập Train 70%):      {roc_auc_score(y_train_clf, train_probs):.4f}")
    print(f"✔ ROC-AUC Phân loại Mưa (Tập Validation 15%): {roc_auc_score(y_val_clf, val_probs):.4f}")
    print(f"✔ Sai số Nhiệt độ MAE (Tập Validation 15%):   {val_temp_mae:.2f} °C")

    bundle = {
        "models": models,
        "stage1_features": stage1_features,
        "feature_columns": feature_columns,
        "base_columns": BASE_COLUMNS
    }
    joblib.dump(bundle, MODEL_FILE)
    print(f"\n[OK] Đã lưu bộ mô hình vào {MODEL_FILE} (Thời gian: {time.time() - start_time:.1f}s)")
    print("=> Bước tiếp theo: Chạy 'python find_optimal_threshold.py' để tìm ngưỡng tối ưu.")

if __name__ == "__main__":
    train_weather_ai()