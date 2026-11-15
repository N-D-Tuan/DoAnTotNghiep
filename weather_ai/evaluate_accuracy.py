import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, mean_absolute_error, classification_report, roc_auc_score
from train_model import create_features, split_time_series_3_ways

def run_backtest():
    print("===========================================================================")
    print("   ĐÁNH GIÁ ĐỘC LẬP MÔ HÌNH AI DỰ BÁO THỜI TIẾT (CHUẨN TIME-SERIES)       ")
    print("===========================================================================")

    try:
        RAIN_THRESHOLD = float(pd.read_csv("optimal_threshold.csv")["threshold"].iloc[0])
        print(f"[*] Hệ thống nạp thành công Threshold từ tập Validation: {RAIN_THRESHOLD:.2f}")
    except FileNotFoundError:
        RAIN_THRESHOLD = 0.34
        print(f"[*] Không thấy optimal_threshold.csv, dùng mức dự phòng: {RAIN_THRESHOLD}")

    raw = pd.read_csv("danang_weather_history.csv")
    df = create_features(raw)

    bundle = joblib.load("weather_ai_model.pkl")
    models = bundle["models"]
    stage1_features = bundle["stage1_features"]
    feature_columns = bundle["feature_columns"]

    for m in models.values():
        if hasattr(m, 'n_jobs'):
            m.n_jobs = 1

    # Lấy tập Test độc lập 15% (Hoàn toàn tách biệt với 70% Train và 15% Validation)
    _, _, test_df = split_time_series_3_ways(df, feature_columns)
    all_clusters = test_df["cum_san_id"].unique()

    print(f"[*] Tổng số mẫu kiểm thử độc lập (Test 15%): {len(test_df):,} giờ trên {len(all_clusters)} cụm sân")
    print("-" * 75)

    for cid in all_clusters:
        sub_c = test_df[test_df["cum_san_id"] == cid]
        ten_san = sub_c["ten_cum_san"].iloc[-1]

        X_c_s2 = sub_c[feature_columns]
        X_c_s1 = sub_c[stage1_features]
        y_c_rain = sub_c["target_co_mua"].astype(int)
        y_c_temp = sub_c["target_nhiet_do"]

        probs_c = models["co_mua"].predict_proba(X_c_s2)[:, 1]
        preds_c_rain = (probs_c >= RAIN_THRESHOLD).astype(int)
        preds_c_temp = models["nhiet_do"].predict(X_c_s1)

        c_acc = accuracy_score(y_c_rain, preds_c_rain) * 100
        c_auc = roc_auc_score(y_c_rain, probs_c)
        c_mae = mean_absolute_error(y_c_temp, preds_c_temp)
        print(f"✔ {ten_san:<18} ({cid:<12}) | Acc Mưa: {c_acc:.2f}% | ROC-AUC: {c_auc:.4f} | MAE Nhiệt độ: {c_mae:.2f}°C")

    X_test_s2 = test_df[feature_columns]
    X_test_s1 = test_df[stage1_features]
    y_test_rain = test_df["target_co_mua"].astype(int)
    y_test_temp = test_df["target_nhiet_do"]

    probs_test = models["co_mua"].predict_proba(X_test_s2)[:, 1]
    preds_test_rain = (probs_test >= RAIN_THRESHOLD).astype(int)
    preds_test_temp = models["nhiet_do"].predict(X_test_s1)

    print("\n========== KẾT QUẢ ĐÁNH GIÁ TỔNG HỢP TOÀN HỆ THỐNG ==========")
    print(f"✔ Độ chính xác dự báo Mưa / Không mưa (Accuracy): {accuracy_score(y_test_rain, preds_test_rain) * 100:.2f}%")
    print(f"✔ Chỉ số phân tách ROC-AUC Tập Test độc lập:       {roc_auc_score(y_test_rain, probs_test):.4f}")
    print(f"✔ Sai số Nhiệt độ trung bình (MAE):                {mean_absolute_error(y_test_temp, preds_test_temp):.2f} °C")
    print("\nBáo cáo chi tiết Trạng thái Mưa (Tập Test độc lập):")
    print(classification_report(y_test_rain, preds_test_rain, target_names=["Không mưa", "Có mưa"], zero_division=0))

if __name__ == "__main__":
    run_backtest()