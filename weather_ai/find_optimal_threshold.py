import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import f1_score, accuracy_score

def find_optimal_threshold():
    print("🔍 BẮT ĐẦU QUÉT TOÁN HỌC TÌM NGƯỠNG TỐI ƯU (GRID SEARCH)...")
    
    df = pd.read_csv("danang_weather_history.csv")
    df["thoi_gian"] = pd.to_datetime(df["thoi_gian"])
    
    bundle = joblib.load("weather_ai_model.pkl")
    models = bundle["models"]
    
    for m in models.values():
        if hasattr(m, 'n_jobs'): m.n_jobs = 1

    df_c1 = df[df["cum_san_id"] == 1].sort_values("thoi_gian").reset_index(drop=True)
    test_actual = df_c1.tail(168).copy()
    history_base = df_c1.iloc[-336:-168].copy()
    
    y_true_rain = (test_actual["luong_mua"] > 0.1).astype(int).tolist()
    thresholds_to_test = np.arange(0.20, 0.62, 0.02)

    print(f"{'Ngưỡng (Threshold)':<20} | {'Độ chính xác (Acc)':<20} | {'Điểm F1-Macro':<20}")
    print("-" * 65)

    best_threshold = 0.5
    max_f1 = 0

    for threshold in thresholds_to_test:
        y_pred_rain = []
        history = history_base.copy()
        
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
            rain_flag = int(rain_prob >= threshold)
            y_pred_rain.append(rain_flag)
            
            new_row = {"thoi_gian": current_time}
            for c in bundle["base_columns"]:
                new_row[c] = float(models[c].predict(X)[0])
            history = pd.concat([history, pd.DataFrame([new_row])], ignore_index=True)
        
        acc = accuracy_score(y_true_rain, y_pred_rain)
        f1_macro = f1_score(y_true_rain, y_pred_rain, average='macro')
        print(f"{threshold:<20.2f} | {acc*100:<18.2f}% | {f1_macro:<20.4f}")
        
        if f1_macro > max_f1:
            max_f1 = f1_macro
            best_threshold = threshold

    print("-" * 65)
    print(f"🏆 NGƯỠNG TOÁN HỌC TỐI ƯU NHẤT LÀ: {best_threshold:.2f}")
    print(f"Đạt điểm F1-Macro cao nhất: {max_f1:.4f}")

    pd.DataFrame([{"threshold": best_threshold}]).to_csv("optimal_threshold.csv", index=False)
    print("=> TỰ ĐỘNG HÓA: Đã lưu ngưỡng tối ưu vào file 'optimal_threshold.csv'")
    print("=> File Evaluate và Predict sẽ tự động lấy con số này!")

if __name__ == "__main__":
    find_optimal_threshold()