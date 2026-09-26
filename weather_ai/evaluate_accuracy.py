import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, mean_absolute_error, classification_report

def run_backtest():
    print("Đang chạy Backtesting (Kiểm thử ngược) đánh giá AI...")
    
    # --- TỰ ĐỘNG NẠP NGƯỠNG TỪ FILE CSV ---
    try:
        RAIN_THRESHOLD = float(pd.read_csv("optimal_threshold.csv")["threshold"].iloc[0])
        print(f"[*] Hệ thống nạp thành công Threshold tự động: {RAIN_THRESHOLD:.2f}")
    except FileNotFoundError:
        RAIN_THRESHOLD = 0.28 # Mức dự phòng an toàn
        print(f"[*] Lỗi: Không thấy optimal_threshold.csv, dùng mức dự phòng: {RAIN_THRESHOLD}")
    # ----------------------------------------
    
    df = pd.read_csv("danang_weather_history.csv")
    df["thoi_gian"] = pd.to_datetime(df["thoi_gian"])
    
    bundle = joblib.load("weather_ai_model.pkl")
    models = bundle["models"]
    
    for m in models.values():
        if hasattr(m, 'n_jobs'): m.n_jobs = 1

    df_c1 = df[df["cum_san_id"] == 1].sort_values("thoi_gian").reset_index(drop=True)
    test_actual = df_c1.tail(168).copy()
    history = df_c1.iloc[-336:-168].copy()
    
    y_true_rain = (test_actual["luong_mua"] > 0.1).astype(int).tolist()
    y_true_temp = test_actual["nhiet_do"].tolist()
    
    y_pred_rain = []
    y_pred_temp = []
    
    print(f"Khoảng thời gian test: {test_actual['thoi_gian'].min()} đến {test_actual['thoi_gian'].max()}")

    for _, row in test_actual.iterrows():
        current_time = row["thoi_gian"]
        
        # --- Tính mỏ neo Mean và Std từ lịch sử ---
        current_anchor = {}
        for col in bundle["base_columns"]:
            current_anchor[f"{col}_mean_7d"] = history[col].tail(168).mean()
            
        for col in ["do_am", "do_che_phu_may"]:
            std_val = history[col].tail(168).std()
            current_anchor[f"{col}_std_7d"] = 0.0 if pd.isna(std_val) else std_val
        # ------------------------------------------
            
        X_dict = {
            "gio": current_time.hour,
            "thang": current_time.month,
            "sin_gio": np.sin(2 * np.pi * current_time.hour / 24),
            "cos_gio": np.cos(2 * np.pi * current_time.hour / 24)
        }
        X_dict.update(current_anchor)
        X = pd.DataFrame([X_dict])[bundle["feature_columns"]]
        
        rain_prob = models["co_mua"].predict_proba(X)[0][1]
        rain_flag = int(rain_prob >= RAIN_THRESHOLD)

        temp_pred = float(models["nhiet_do"].predict(X)[0])
        y_pred_rain.append(rain_flag)
        y_pred_temp.append(temp_pred)
        
        new_row = {
            "thoi_gian": current_time,
            "nhiet_do": temp_pred,
            "do_am": float(models["do_am"].predict(X)[0]),
            "do_che_phu_may": float(models["do_che_phu_may"].predict(X)[0]),
            "ap_suat": float(models["ap_suat"].predict(X)[0]),
            "toc_do_gio": float(models["toc_do_gio"].predict(X)[0])
        }
        history = pd.concat([history, pd.DataFrame([new_row])], ignore_index=True)

    print("\n========== KẾT QUẢ ĐÁNH GIÁ (BACKTESTING) ==========")
    acc = accuracy_score(y_true_rain, y_pred_rain)
    mae_temp = mean_absolute_error(y_true_temp, y_pred_temp)
    
    print(f"Độ chính xác dự báo Mưa / Không mưa: {acc * 100:.2f}%")
    print(f"Sai số nhiệt độ trung bình (MAE): {mae_temp:.2f} °C")
    print("\nBáo cáo chi tiết Trạng thái Mưa:")
    print(classification_report(y_true_rain, y_pred_rain, target_names=["Không mưa", "Có mưa"]))

if __name__ == "__main__":
    run_backtest()