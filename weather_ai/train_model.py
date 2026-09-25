import warnings
warnings.filterwarnings("ignore")
import time
import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import classification_report
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor

start_time = time.time()
INPUT_FILE = "danang_weather_history.csv"
MODEL_FILE = "weather_ai_model.pkl"

BASE_COLUMNS = ["nhiet_do", "do_am", "do_che_phu_may", "ap_suat", "toc_do_gio", "luong_mua"]

def create_features(df):
    df = df.copy()
    df["thoi_gian"] = pd.to_datetime(df["thoi_gian"])
    df = df.sort_values(["cum_san_id", "thoi_gian"])

    # 1. Đặc trưng thời gian & chu kỳ
    df["gio"] = df["thoi_gian"].dt.hour
    df["thang"] = df["thoi_gian"].dt.month
    df["sin_gio"] = np.sin(2 * np.pi * df["gio"] / 24)
    df["cos_gio"] = np.cos(2 * np.pi * df["gio"] / 24)

    # 2. Đặc trưng mỏ neo (Anchor Features): Trung bình 7 ngày gần nhất của thực tế
    grouped = df.groupby("cum_san_id", group_keys=False)
    for col in BASE_COLUMNS:
        # Shift(1) để không nhìn trộm đáp án tương lai, lấy trung bình 168 giờ
        df[f"{col}_mean_7d"] = grouped[col].shift(1).rolling(168, min_periods=24).mean().reset_index(level=0, drop=True)

    # 3. Tạo Target
    df["trang_thai_mua"] = (df["luong_mua"] > 0.1).astype(int)
    df["target_co_mua"] = df["trang_thai_mua"]
    for col in BASE_COLUMNS:
        df[f"target_{col}"] = df[col]

    return df

def train_weather_ai():
    print("1. Đọc dữ liệu và tạo đặc trưng mỏ neo...")
    raw = pd.read_csv(INPUT_FILE)
    df = create_features(raw)

    feature_columns = ["gio", "thang", "sin_gio", "cos_gio"]
    for col in BASE_COLUMNS:
        feature_columns.append(f"{col}_mean_7d")

    df = df.dropna(subset=feature_columns + ["target_co_mua"]).copy()

    split_index = int(len(df) * 0.8)
    train_df = df.iloc[:split_index]
    test_df = df.iloc[split_index:]

    X_train, y_train_clf = train_df[feature_columns], train_df["target_co_mua"]
    X_test, y_test_clf = test_df[feature_columns], test_df["target_co_mua"]

    models = {}

    print("2. Huấn luyện mô hình Phân loại Mưa...")
    rain_classifier = RandomForestClassifier(
        n_estimators=350, max_depth=16, min_samples_leaf=2,
        class_weight={0: 1.0, 1: 1.0}, random_state=42, n_jobs=-1
    )
    rain_classifier.fit(X_train, y_train_clf)
    models["co_mua"] = rain_classifier

    print("3. Huấn luyện mô hình Lượng Mưa...")
    rainy_train = train_df[train_df["target_luong_mua"] > 0.1]
    if len(rainy_train) > 50:
        rain_regressor = RandomForestRegressor(
            n_estimators=150, max_depth=12, min_samples_leaf=2, random_state=42, n_jobs=-1
        )
        rain_regressor.fit(rainy_train[feature_columns], rainy_train["target_luong_mua"])
        models["luong_mua"] = rain_regressor

    print("4. Huấn luyện các thông số thời tiết khác...")
    for target in BASE_COLUMNS:
        if target == "luong_mua": continue
        model = RandomForestRegressor(n_estimators=100, max_depth=12, random_state=42, n_jobs=-1)
        model.fit(X_train, train_df[f"target_{target}"])
        models[target] = model

    print("\nĐÁNH GIÁ MÔ HÌNH PHÂN LOẠI MƯA:")
    rain_pred = rain_classifier.predict(X_test)
    print(classification_report(y_test_clf, rain_pred, target_names=["Không mưa", "Có mưa"]))

    bundle = {
        "models": models,
        "feature_columns": feature_columns,
        "base_columns": BASE_COLUMNS,
        "rain_threshold": 0.1
    }
    joblib.dump(bundle, MODEL_FILE)
    print(f"\nĐã lưu bộ mô hình ỔN ĐỊNH vào {MODEL_FILE}")

if __name__ == "__main__":
    train_weather_ai()