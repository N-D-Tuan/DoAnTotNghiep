import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import f1_score, accuracy_score, recall_score
from train_model import create_features, split_time_series_3_ways

def find_optimal_threshold():
    print("🔍 BẮT ĐẦU QUÉT TOÁN HỌC TÌM NGƯỠNG TỐI ƯU TRÊN TẬP VALIDATION (15% ĐỘC LẬP)...")

    raw = pd.read_csv("danang_weather_history.csv")
    df = create_features(raw)

    bundle = joblib.load("weather_ai_model.pkl")
    models = bundle["models"]
    feature_columns = bundle["feature_columns"]

    _, val_df, test_df = split_time_series_3_ways(df, feature_columns)
    all_clusters = val_df["cum_san_id"].unique()

    print(f"[*] Tập Validation gồm {len(val_df):,} giờ trên {len(all_clusters)} cụm sân (Trải đều 12 tháng)")
    print(f"[*] Tập Test gồm {len(test_df):,} giờ được giữ kín hoàn toàn để chấm điểm độc lập.")

    X_val = val_df[feature_columns]
    y_true_val = val_df["target_co_mua"].astype(int).to_numpy()
    rain_probs_val = models["co_mua"].predict_proba(X_val)[:, 1]

    thresholds_to_test = np.arange(0.34, 0.72, 0.02)
    print("-" * 95)
    print(f"{'Threshold':<12} | {'Accuracy':<12} | {'Recall K.Mưa':<14} | {'Recall Có Mưa':<14} | {'F1-Macro':<12} | {'Điểm Cân Bằng':<14}")
    print("-" * 95)

    best_threshold = 0.48
    max_score = -1.0

    for threshold in thresholds_to_test:
        y_pred = (rain_probs_val >= threshold).astype(int)
        acc = accuracy_score(y_true_val, y_pred)
        f1_macro = f1_score(y_true_val, y_pred, average='macro', zero_division=0)
        rec_no_rain = recall_score(y_true_val, y_pred, pos_label=0, zero_division=0)
        rec_rain = recall_score(y_true_val, y_pred, pos_label=1, zero_division=0)

        balanced_recall = (2 * rec_no_rain * rec_rain) / max(rec_no_rain + rec_rain, 1e-6)
        combined_score = 0.50 * f1_macro + 0.30 * balanced_recall + 0.20 * acc

        print(f"{threshold:<12.2f} | {acc*100:<11.2f}% | {rec_no_rain:<14.2f} | {rec_rain:<14.2f} | {f1_macro:<12.4f} | {combined_score:<14.4f}")

        if combined_score > max_score:
            max_score = combined_score
            best_threshold = threshold

    print("-" * 95)
    print(f"🏆 NGƯỠNG TỐI ƯU CÂN BẰNG HAI LỚP LÀ: {best_threshold:.2f} (Điểm cân bằng: {max_score:.4f})")
    pd.DataFrame([{"threshold": round(float(best_threshold), 2)}]).to_csv("optimal_threshold.csv", index=False)
    print("=> Đã lưu ngưỡng tối ưu vào file 'optimal_threshold.csv'")

if __name__ == "__main__":
    find_optimal_threshold()