<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CumSanController;
use App\Http\Controllers\LoaiSanController;
use App\Http\Controllers\PhuongController;
use App\Http\Controllers\SanBongController;
use App\Http\Controllers\GiaTienController;
use App\Http\Controllers\KhungGioController;
use App\Http\Controllers\GiaiDauController;
use App\Http\Controllers\VNPayController;
use App\Http\Controllers\GiaoDichController;
use App\Http\Controllers\YeuCauRutTienController;
use App\Http\Controllers\ThongBaoController;
use App\Http\Controllers\DatSanController;
use App\Http\Controllers\YeuCauHuyGapController;
use App\Http\Controllers\KhachHangController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\ChatbotController;
use App\Services\ChromaDBService;

Route::get('/seed-chromadb', function (ChromaDBService $chroma) {
    return $chroma->napDuLieuQuyDinh();
});

// ==========================================================
// NHÓM 1: PUBLIC API (KHÔNG BỌC MIDDLEWARE)
// Các API ai cũng có thể truy cập mà không cần Token
// ==========================================================
Route::post('/dang-ky', [AuthController::class, 'dangKy']);
Route::post('/dang-nhap', [AuthController::class, 'dangNhap']);
Route::post('/gui-otp', [AuthController::class, 'guiOTP']);
Route::post('/dat-lai-mat-khau', [AuthController::class, 'datLaiMatKhau']);

// Các API lấy dữ liệu hiển thị (Khách chưa đăng nhập vẫn xem được sân)
Route::get('/cum-san', [CumSanController::class, 'index']);
Route::get('/cum-san/{id}', [CumSanController::class, 'show']);
Route::get('/san-bong', [SanBongController::class, 'index']);
Route::get('/gia-tien', [GiaTienController::class, 'index']);
Route::get('/khung-gio', [KhungGioController::class, 'index']);
Route::get('/dat-san/da-dat', [DatSanController::class, 'layDanhSachDaDat']);
Route::get('/phuong', [PhuongController::class, 'index']);
Route::get('/loai-san', [LoaiSanController::class, 'index']);
Route::get('/vnpay-return', [VNPayController::class, 'vnpayReturn']);

// ==========================================================
// NHÓM 2: PROTECTED API (BẮT BUỘC TRUYỀN TOKEN TRONG HEADER)
// Sử dụng auth:sanctum để tự động kiểm tra Token
// ==========================================================
Route::middleware('auth:sanctum')->group(function () {
    
    // 1. Quản lý Tài khoản & Profile
    Route::post('/dang-xuat', [AuthController::class, 'dangXuat']);
    Route::put('/cap-nhat-profile', [AuthController::class, 'capNhatProfile']);
    Route::get('/thong-tin-ca-nhan', [AuthController::class, 'layThongTin']);

    // 2. Thông báo
    Route::get('/thong-bao', [ThongBaoController::class, 'layDanhSachCuaToi']);
    Route::put('/thong-bao/doc-tat-ca', [ThongBaoController::class, 'danhDauDaDocTatCa']);
    Route::put('/thong-bao/{id}/doc', [ThongBaoController::class, 'danhDauDaDocTheoId']);

    // 3. Khách hàng: Nghiệp vụ Đặt Sân, Rút Tiền, Giải Đấu
    Route::post('/dat-san', [DatSanController::class, 'datSan']);
    Route::get('/dat-san/cua-toi', [DatSanController::class, 'layDanhSachCuaToi']);
    Route::put('/dat-san/{id}/huy', [DatSanController::class, 'huySanPhongTrao']);
    
    Route::post('/yeu-cau-huy-gap', [YeuCauHuyGapController::class, 'taoYeuCau']);
    Route::get('/yeu-cau-huy-gap/cua-toi', [YeuCauHuyGapController::class, 'layDanhSachCuaToi']);
    
    Route::get('/giai-dau/cua-toi', [GiaiDauController::class, 'layDanhSachCuaToi']);
    Route::post('/giai-dau/tao-yeu-cau', [GiaiDauController::class, 'taoYeuCau']);
    Route::put('/giai-dau/{idGiaiDau}/huy-lich', [DatSanController::class, 'huySanGiaiDau']);
    
    Route::post('/vnpay/nap-tien', [VNPayController::class, 'createPayment']);
    Route::get('/giao-dich/cua-toi', [GiaoDichController::class, 'layGiaoDichCuaToi']);
    Route::post('/yeu-cau-rut-tien', [YeuCauRutTienController::class, 'taoYeuCau']);
    Route::get('/yeu-cau-rut-tien/cua-toi', [YeuCauRutTienController::class, 'layDanhSachCuaToi']);

    // 4. Chatbot
    Route::post('/chatbot/chat', [ChatbotController::class, 'nhanTinNhan']);
    Route::get('/chatbot/phien-chat', [ChatbotController::class, 'layDanhSachPhienChat']);
    Route::put('/chatbot/phien-chat/{id}/doi-ten', [ChatbotController::class, 'doiTenPhienChat']);
    Route::delete('/chatbot/phien-chat/{id}', [ChatbotController::class, 'xoaPhienChat']);
    Route::get('/chatbot/phien-chat/{id}', [ChatbotController::class, 'layChiTietPhienChat']);
    Route::post('/chatbot/admin-chat', [ChatbotController::class, 'nhanTinNhanAdmin']);

    // 5. Admin: Dashboard & Quản lý khách hàng
    Route::get('/admin/thong-ke', [DashboardController::class, 'layThongKe']);
    Route::prefix('admin/khach-hang')->group(function () {
        Route::get('/', [KhachHangController::class, 'layDanhSach']);
        Route::get('/{id}', [KhachHangController::class, 'layChiTiet']);
        Route::put('/{id}/khoa', [KhachHangController::class, 'thayDoiTrangThaiKhoa']);
    });

    // 6. Admin: Duyệt yêu cầu
    Route::get('/admin/dat-san', [DatSanController::class, 'layDanhSachAdmin']);
    Route::put('/admin/dat-san/{id}/chot', [DatSanController::class, 'chotTrangThaiAdmin']);
    Route::get('/admin/yeu-cau-huy-gap', [YeuCauHuyGapController::class, 'layDanhSachAdmin']);
    Route::put('/admin/yeu-cau-huy-gap/{id}/xu-ly', [YeuCauHuyGapController::class, 'xuLyYeuCau']);
    Route::get('/admin/giai-dau', [GiaiDauController::class, 'layDanhSachAdmin']);
    Route::put('/admin/giai-dau/{id}/xu-ly', [GiaiDauController::class, 'xuLyYeuCau']);
    Route::get('/admin/giai-dau/{id}/ma-tran', [GiaiDauController::class, 'layMaTranLich']);
    Route::get('/admin/yeu-cau-rut-tien', [YeuCauRutTienController::class, 'layDanhSachAdmin']);
    Route::put('/admin/yeu-cau-rut-tien/{id}/xu-ly', [YeuCauRutTienController::class, 'xuLyYeuCau']);
    
    // 7. Admin: Quản lý hạ tầng (Thêm, sửa, xóa sân)
    Route::post('/cum-san', [CumSanController::class, 'store']);
    Route::put('/cum-san/{id}', [CumSanController::class, 'update']);
    Route::delete('/cum-san/{id}', [CumSanController::class, 'destroy']);
    Route::put('/cum-san/{id}/restore', [CumSanController::class, 'restore']);
    
    Route::post('/san-bong', [SanBongController::class, 'store']);
    Route::put('/san-bong/{id}', [SanBongController::class, 'update']);
    
    Route::post('/gia-tien/save', [GiaTienController::class, 'saveBulk']);
});