import os
import sys
import subprocess
import logging
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
LOG_FILE = BASE_DIR / "pipeline.log"
LOCK_DATE_FILE = BASE_DIR / "last_run_date.txt"

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    encoding="utf-8"
)

def run_step(script_name: str):
    msg = f"Bắt đầu chạy {script_name}..."
    print(msg)
    logging.info(msg)

    env = os.environ.copy()
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"

    result = subprocess.run(
        [sys.executable, str(BASE_DIR / script_name)],
        cwd=str(BASE_DIR),
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace"
    )
    if result.returncode != 0:
        err_msg = f"Lỗi khi chạy {script_name}:\n{result.stderr}"
        print(err_msg)
        logging.error(err_msg)
        raise RuntimeError(f"{script_name} thất bại (exit code {result.returncode})")

    done_msg = f"Hoàn tất {script_name}."
    print(done_msg)
    logging.info(done_msg)

def main():
    today_str = datetime.now().strftime("%Y-%m-%d")
    force_run = "--force" in sys.argv

    # Kiểm tra xem hôm nay đã chạy thành công chưa
    if not force_run and LOCK_DATE_FILE.exists():
        last_date = LOCK_DATE_FILE.read_text(encoding="utf-8").strip()
        if last_date == today_str:
            skip_msg = f"Hôm nay ({today_str}) pipeline đã chạy thành công trước đó. Bỏ qua để không chạy trùng lặp!\n"
            print(skip_msg)
            logging.info(skip_msg)
            return

    logging.info(f"=== BẮT ĐẦU PIPELINE FULL TRỌN BỘ NGÀY {today_str} ===")
    print(f"=== BẮT ĐẦU PIPELINE FULL TRỌN BỘ NGÀY {today_str} ===")

    try:
        # Chạy trọn bộ 4 bước mỗi ngày
        run_step("fetch_data.py")
        run_step("train_model.py")
        run_step("find_optimal_threshold.py")
        run_step("predict_7_days.py")

        # Lưu dấu đã hoàn thành ngày hôm nay
        LOCK_DATE_FILE.write_text(today_str, encoding="utf-8")

        logging.info("=== HOÀN TẤT TOÀN BỘ PIPELINE THÀNH CÔNG ===\n")
        print("=== HOÀN TẤT TOÀN BỘ PIPELINE THÀNH CÔNG ===")
    except Exception as e:
        logging.error(f"Pipeline dừng do lỗi: {e}\n")
        print(f"Pipeline dừng do lỗi: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()