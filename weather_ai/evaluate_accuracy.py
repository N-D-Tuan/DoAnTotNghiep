import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, mean_absolute_error, classification_report

def run_backtest():
    print("Đang chạy Backtesting (Kiểm thử ngược) đánh giá AI...")
    
    # 1. Nạp dữ liệu và mô hình
    df = pd.read_csv("danang_weather_history.csv")
    df["thoi_gian"] = pd.to_datetime(df["thoi_gian"])
    
    bundle = joblib.load("weather_ai_model.pkl")
    models = bundle["models"]
    
    # Tắt đa luồng để tránh warning
    for m in models.values():
        if hasattr(m, 'n_jobs'): m.n_jobs = 1

    # Lấy dữ liệu Sân Đa Phước làm mẫu test
    df_c1 = df[df["cum_san_id"] == 1].sort_values("thoi_gian").reset_index(drop=True)
    
    # 2. Chia tập dữ liệu
    # - Tập thực tế (7 ngày cuối - 168 giờ) để đối chiếu đáp án
    test_actual = df_c1.tail(168).copy()
    
    # - Tập lịch sử (7 ngày trước đó) dùng làm Mỏ neo ban đầu
    history = df_c1.iloc[-336:-168].copy()
    
    y_true_rain = (test_actual["luong_mua"] > 0.1).astype(int).tolist()
    y_true_temp = test_actual["nhiet_do"].tolist()
    
    y_pred_rain = []
    y_pred_temp = []
    
    print(f"Khoảng thời gian test: {test_actual['thoi_gian'].min()} đến {test_actual['thoi_gian'].max()}")

    # 3. Chạy dự đoán cuốn chiếu y hệt hệ thống thật
    for _, row in test_actual.iterrows():
        current_time = row["thoi_gian"]
        
        # Tính mỏ neo hiện tại
        current_anchor = {}
        for col in bundle["base_columns"]:
            current_anchor[f"{col}_mean_7d"] = history[col].tail(168).mean()
            
        X_dict = {
            "gio": current_time.hour,
            "thang": current_time.month,
            "sin_gio": np.sin(2 * np.pi * current_time.hour / 24),
            "cos_gio": np.cos(2 * np.pi * current_time.hour / 24)
        }
        X_dict.update(current_anchor)
        X = pd.DataFrame([X_dict])[bundle["feature_columns"]]
        
        # Dự đoán Mưa
        rain_prob = models["co_mua"].predict_proba(X)[0][1]
        rain_flag = int(rain_prob >= 0.66)

        predicted = {}
        for name in bundle["base_columns"]:
            if name == "luong_mua": continue
            predicted[name] = float(models[name].predict(X)[0])
          
        # Dự đoán Nhiệt độ
        y_pred_rain.append(rain_flag)
        temp_pred = float(models["nhiet_do"].predict(X)[0])
        y_pred_temp.append(temp_pred)
        
        # Cập nhật lịch sử (Dùng kết quả dự đoán để nội suy tương lai)
        new_row = {
            "thoi_gian": current_time,
            "nhiet_do": temp_pred,
            "do_am": float(models["do_am"].predict(X)[0]),
            "do_che_phu_may": float(models["do_che_phu_may"].predict(X)[0]),
            "ap_suat": float(models["ap_suat"].predict(X)[0]),
            "toc_do_gio": float(models["toc_do_gio"].predict(X)[0]),
            "luong_mua": float(models["luong_mua"].predict(X)[0]) if rain_flag else 0.0
        }
        history = pd.concat([history, pd.DataFrame([new_row])], ignore_index=True)

    # 4. Chấm điểm
    print("\n========== KẾT QUẢ ĐÁNH GIÁ (BACKTESTING) ==========")
    acc = accuracy_score(y_true_rain, y_pred_rain)
    mae_temp = mean_absolute_error(y_true_temp, y_pred_temp)
    
    print(f"Độ chính xác dự báo Mưa / Không mưa: {acc * 100:.2f}%")
    print(f"Sai số nhiệt độ trung bình (MAE): {mae_temp:.2f} °C")
    print("\nBáo cáo chi tiết Trạng thái Mưa:")
    print(classification_report(y_true_rain, y_pred_rain, target_names=["Không mưa", "Có mưa"]))

if __name__ == "__main__":
    run_backtest()