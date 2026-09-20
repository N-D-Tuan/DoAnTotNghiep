import warnings
warnings.filterwarnings("ignore")
import time
import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import (
    classification_report, mean_absolute_error, mean_squared_error
)

start_time = time.time()

INPUT_FILE = "danang_weather_history.csv"
MODEL_FILE = "weather_ai_model.pkl"

BASE_COLUMNS = [
    "nhiet_do", "do_am", "do_che_phu_may",
    "ap_suat", "toc_do_gio", "luong_mua"
]

# Mô hình dự báo 1 giờ tiếp theo.
# Khi dự báo 126 khung giờ, chương trình sẽ chạy cuốn chiếu.
LAG_VALUES = [1, 3, 6, 24, 168]


def create_features(df):
    df = df.copy()
    df["thoi_gian"] = pd.to_datetime(df["thoi_gian"])
    df = df.sort_values(["cum_san_id", "thoi_gian"])

    # Đặc trưng thời gian
    df["gio"] = df["thoi_gian"].dt.hour
    df["thu_trong_tuan"] = df["thoi_gian"].dt.dayofweek
    df["thang"] = df["thoi_gian"].dt.month
    df["ngay_trong_nam"] = df["thoi_gian"].dt.dayofyear
    df["is_weekend"] = (df["thu_trong_tuan"] >= 5).astype(int)

    # Đặc trưng chu kỳ
    df["sin_gio"] = np.sin(2 * np.pi * df["gio"] / 24)
    df["cos_gio"] = np.cos(2 * np.pi * df["gio"] / 24)
    df["sin_ngay_trong_nam"] = np.sin(
        2 * np.pi * df["ngay_trong_nam"] / 365
    )
    df["cos_ngay_trong_nam"] = np.cos(
        2 * np.pi * df["ngay_trong_nam"] / 365
    )

    # Tạo trạng thái mưa
    df["trang_thai_mua"] = (df["luong_mua"] > 0.1).astype(int)

    # Lag features: chỉ dùng dữ liệu quá khứ
    grouped = df.groupby("cum_san_id", group_keys=False)
    for column in BASE_COLUMNS + ["trang_thai_mua"]:
        for lag in LAG_VALUES:
            df[f"{column}_lag_{lag}"] = grouped[column].shift(lag)

    # Trung bình trượt, có shift(1) để tránh rò rỉ dữ liệu
    for column in ["nhiet_do", "do_am", "luong_mua"]:
        df[f"{column}_rolling_6"] = (
            grouped[column].shift(1).rolling(6).mean()
            .reset_index(level=0, drop=True)
        )

    # Target là giá trị của giờ tiếp theo
    for column in BASE_COLUMNS:
        df[f"target_{column}"] = grouped[column].shift(-1)

    return df


def train_weather_ai():
    print("1. Đọc dữ liệu lịch sử...")
    raw = pd.read_csv(INPUT_FILE)

    required = set(
        ["thoi_gian", "cum_san_id", "latitude", "longitude"] + BASE_COLUMNS
    )
    missing = required - set(raw.columns)
    if missing:
        raise ValueError(f"Thiếu cột dữ liệu: {sorted(missing)}")

    df = create_features(raw)

    print("\n===== KIỂM TRA PHÂN BỐ DỮ LIỆU MƯA =====")

    print(
        raw["luong_mua"]
        .describe()
    )

    print("\nSố lượng mẫu mưa/không mưa:")

    rain_distribution = (
        (raw["luong_mua"] > 0.1)
        .value_counts()
        .rename(index={
            False: "Không mưa",
            True: "Có mưa"
        })
    )

    print(rain_distribution)

    print("\nTỷ lệ phần trăm:")

    print(
        (rain_distribution / rain_distribution.sum() * 100)
        .round(2)
    )

    feature_columns = [
        "latitude", "longitude", "gio", "thu_trong_tuan", "thang",
        "ngay_trong_nam", "is_weekend", "sin_gio", "cos_gio",
        "sin_ngay_trong_nam", "cos_ngay_trong_nam"
    ]

    for column in BASE_COLUMNS + ["trang_thai_mua"]:
        feature_columns += [f"{column}_lag_{lag}" for lag in LAG_VALUES]

    feature_columns += [
        "nhiet_do_rolling_6", "do_am_rolling_6", "luong_mua_rolling_6"
    ]

    target_columns = {
        "nhiet_do": "target_nhiet_do",
        "do_am": "target_do_am",
        "do_che_phu_may": "target_do_che_phu_may",
        "ap_suat": "target_ap_suat",
        "toc_do_gio": "target_toc_do_gio"
    }

    # Tạo target lượng mưa riêng
    # target_luong_mua chính là lượng mưa ở giờ tiếp theo.
    if "target_luong_mua" not in df.columns:
        df["target_luong_mua"] = df["luong_mua_lag_1"]  # sẽ được thay bên dưới

    # Sửa target lượng mưa chính xác bằng shift(-1) theo từng cụm sân
    df = df.sort_values(
        ["cum_san_id", "thoi_gian"]
    ).reset_index(drop=True)

    grouped_target = df.groupby("cum_san_id")

    # Lượng mưa của giờ tiếp theo
    df["target_luong_mua"] = (
        grouped_target["luong_mua"].shift(-1)
    )

    # Trạng thái mưa được tạo trực tiếp từ lượng mưa giờ tiếp theo
    df["target_co_mua"] = (
        df["target_luong_mua"] > 0.1
    ).astype(int)

    required_columns = (
        feature_columns
        + list(target_columns.values())
        + ["target_co_mua", "target_luong_mua"]
    )

    df = df.dropna(subset=required_columns).copy()

    # Chia theo thời gian, không dùng train_test_split ngẫu nhiên
    df = df.sort_values("thoi_gian")
    split_index = int(len(df) * 0.8)
    train_df = df.iloc[:split_index]
    test_df = df.iloc[split_index:]

    X_train, X_test = train_df[feature_columns], test_df[feature_columns]

    models = {}

    print("2. Huấn luyện mô hình phân loại có mưa/không mưa...")
    rain_classifier = RandomForestClassifier(
        n_estimators=200,
        max_depth=16,
        min_samples_leaf=5,
        class_weight="balanced",
        max_features="sqrt",
        random_state=42,
        n_jobs=-1
    )
    rain_classifier.fit(X_train, train_df["target_co_mua"].astype(int))
    models["co_mua"] = rain_classifier

    print("3. Huấn luyện mô hình hồi quy lượng mưa...")
    rainy_train = train_df[
        train_df["target_luong_mua"] > 0.1
    ].copy()

    print(
        f"Số mẫu dùng để huấn luyện lượng mưa: "
        f"{len(rainy_train)}"
    )

    if len(rainy_train) >= 100:
        print("   Huấn luyện mô hình dự báo lượng mưa thực tế...")

        rain_regressor = RandomForestRegressor(
            n_estimators=300,
            max_depth=20,
            min_samples_leaf=2,
            max_features="sqrt",
            random_state=42,
            n_jobs=-1
        )

        rain_regressor.fit(
            rainy_train[feature_columns],
            rainy_train["target_luong_mua"]
        )

        models["luong_mua"] = rain_regressor

    else:
        models["luong_mua"] = None

        print(
            "Cảnh báo: Không đủ dữ liệu mưa để huấn luyện "
            "mô hình lượng mưa."
        )

    print("4. Huấn luyện các mô hình hồi quy thời tiết...")
    for name, target in target_columns.items():
        model = RandomForestRegressor(
            n_estimators=150, max_depth=18, min_samples_leaf=2,
            random_state=42, n_jobs=-1
        )
        model.fit(X_train, train_df[target])
        models[name] = model

    # Đánh giá mô hình trên phần dữ liệu tương lai
    print("\n5. ĐÁNH GIÁ TRÊN 20% DỮ LIỆU CUỐI:")
    rain_pred = rain_classifier.predict(X_test)

    print("\nMa trận nhầm lẫn:")
    print(confusion_matrix(
        test_df["target_co_mua"].astype(int),
        rain_pred
    ))

    print(classification_report(
        test_df["target_co_mua"].astype(int), rain_pred,
        target_names=["Không mưa", "Có mưa"], zero_division=0
    ))

    for name, target in target_columns.items():
        pred = models[name].predict(X_test)
        print(f"{name}: MAE = {mean_absolute_error(test_df[target], pred):.3f}")

    # =====================================================
    # ĐÁNH GIÁ MÔ HÌNH DỰ BÁO LƯỢNG MƯA
    # =====================================================
    if models.get("luong_mua") is not None:
        rainy_test = test_df[
            test_df["target_luong_mua"] > 0.1
        ].copy()

        if not rainy_test.empty:
            rain_amount_pred = models["luong_mua"].predict(
                rainy_test[feature_columns]
            )

            rain_amount_pred = np.maximum(rain_amount_pred, 0)

            rain_amount_mae = mean_absolute_error(
                rainy_test["target_luong_mua"],
                rain_amount_pred
            )

            rain_amount_rmse = np.sqrt(
                mean_squared_error(
                    rainy_test["target_luong_mua"],
                    rain_amount_pred
                )
            )

            print("\nĐÁNH GIÁ MÔ HÌNH LƯỢNG MƯA:")
            print(f"MAE lượng mưa: {rain_amount_mae:.3f} mm")
            print(f"RMSE lượng mưa: {rain_amount_rmse:.3f} mm")

    bundle = {
        "models": models,
        "feature_columns": feature_columns,
        "base_columns": BASE_COLUMNS,
        "lag_values": LAG_VALUES,
        "rain_threshold": 0.1,
        "history": raw
    }
    joblib.dump(bundle, MODEL_FILE)
    print(f"\nĐã lưu bộ mô hình vào {MODEL_FILE}")

    # Tính thời gian huấn luyện
    elapsed_time = time.time() - start_time

    print(f"\nThời gian huấn luyện: {elapsed_time:.2f} giây")
    print(f"Tương đương: {elapsed_time / 60:.2f} phút")


if __name__ == "__main__":
    train_weather_ai()
