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

// Bọc TẤT CẢ trong middleware 'web' để đồng bộ Session Cookie
Route::middleware('web')->group(function () {
    
    // 1. Nhóm không yêu cầu đăng nhập (Dành cho mọi khách truy cập)
    Route::post('/dang-ky', [AuthController::class, 'dangKy']);
    Route::post('/dang-nhap', [AuthController::class, 'dangNhap']);
    Route::post('/gui-otp', [AuthController::class, 'guiOTP']);
    Route::post('/dat-lai-mat-khau', [AuthController::class, 'datLaiMatKhau']);

    // 2. Nhóm bắt buộc phải có phiên đăng nhập (Dành cho User/Admin)
    Route::post('/dang-xuat', [AuthController::class, 'dangXuat'])->middleware('auth:web');
    Route::put('/cap-nhat-profile', [AuthController::class, 'capNhatProfile'])->middleware('auth:web');
    Route::get('/thong-tin-ca-nhan', [AuthController::class, 'layThongTin'])->middleware('auth:web');

    //3. Thông báo của user
    Route::get('/thong-bao', [ThongBaoController::class, 'layDanhSachCuaToi']);
    Route::put('/thong-bao/doc-tat-ca', [ThongBaoController::class, 'danhDauDaDocTatCa']);
    Route::put('/thong-bao/{id}/doc', [ThongBaoController::class, 'danhDauDaDocTheoId']);
    
});

Route::middleware('web')->group(function () {
    // Chatbot API
    Route::post('/chatbot/chat', [ChatbotController::class, 'nhanTinNhan']);
    Route::get('/chatbot/phien-chat', [ChatbotController::class, 'layDanhSachPhienChat']);
    Route::put('/chatbot/phien-chat/{id}/doi-ten', [ChatbotController::class, 'doiTenPhienChat']);
    Route::delete('/chatbot/phien-chat/{id}', [ChatbotController::class, 'xoaPhienChat']);
    Route::get('/chatbot/phien-chat/{id}', [ChatbotController::class, 'layChiTietPhienChat']);

    //Admin Dashboard
    Route::get('/admin/thong-ke', [DashboardController::class, 'layThongKe']);

    //Admin quản lý khách hàng
    Route::prefix('admin/khach-hang')->group(function () {
        Route::get('/', [KhachHangController::class, 'layDanhSach']);
        Route::get('/{id}', [KhachHangController::class, 'layChiTiet']);
        Route::put('/{id}/khoa', [KhachHangController::class, 'thayDoiTrangThaiKhoa']);
    });

    // API Đặt Sân
    Route::post('/dat-san', [DatSanController::class, 'datSan']);
    Route::get('/dat-san/da-dat', [DatSanController::class, 'layDanhSachDaDat']);
    Route::get('/dat-san/cua-toi', [DatSanController::class, 'layDanhSachCuaToi']);
    Route::put('/dat-san/{id}/huy', [DatSanController::class, 'huySanPhongTrao']);
    Route::put('/giai-dau/{idGiaiDau}/huy-lich', [DatSanController::class, 'huySanGiaiDau']);
    Route::get('/admin/dat-san', [DatSanController::class, 'layDanhSachAdmin']);
    Route::put('/admin/dat-san/{id}/chot', [DatSanController::class, 'chotTrangThaiAdmin']);

    // API Yêu cầu hủy gấp
    Route::post('/yeu-cau-huy-gap', [YeuCauHuyGapController::class, 'taoYeuCau']);
    Route::put('/admin/yeu-cau-huy-gap/{id}/xu-ly', [YeuCauHuyGapController::class, 'xuLyYeuCau']);
    Route::get('/yeu-cau-huy-gap/cua-toi', [YeuCauHuyGapController::class, 'layDanhSachCuaToi']);
    Route::get('/admin/yeu-cau-huy-gap', [YeuCauHuyGapController::class, 'layDanhSachAdmin']);

    // API Giải Đấu
    Route::get('/giai-dau/cua-toi', [GiaiDauController::class, 'layDanhSachCuaToi']);
    Route::post('/giai-dau/tao-yeu-cau', [GiaiDauController::class, 'taoYeuCau']);
    Route::get('/admin/giai-dau', [GiaiDauController::class, 'layDanhSachAdmin']);
    Route::put('/admin/giai-dau/{id}/xu-ly', [GiaiDauController::class, 'xuLyYeuCau']);
    Route::get('/admin/giai-dau/{id}/ma-tran', [GiaiDauController::class, 'layMaTranLich']);
    
    // API Cụm Sân
    Route::get('/cum-san', [CumSanController::class, 'index']);
    Route::post('/cum-san', [CumSanController::class, 'store']);
    Route::put('/cum-san/{id}', [CumSanController::class, 'update']);
    Route::delete('/cum-san/{id}', [CumSanController::class, 'destroy']);
    Route::get('/cum-san/{id}', [CumSanController::class, 'show']);
    Route::put('/cum-san/{id}/restore', [CumSanController::class, 'restore']);

    // API Sân Bóng
    Route::get('/san-bong', [SanBongController::class, 'index']);
    Route::post('/san-bong', [SanBongController::class, 'store']);
    Route::put('/san-bong/{id}', [SanBongController::class, 'update']);
    
    // API Giá Tiền & Khung Giờ
    Route::get('/gia-tien', [GiaTienController::class, 'index']);
    Route::post('/gia-tien/save', [GiaTienController::class, 'saveBulk']);
    Route::get('/khung-gio', [KhungGioController::class, 'index']);
    
    // API Danh mục (Dropdown)
    Route::get('/phuong', [PhuongController::class, 'index']);
    Route::get('/loai-san', [LoaiSanController::class, 'index']);

    // API VNPAY
    Route::post('/vnpay/nap-tien', [VNPayController::class, 'createPayment'])->middleware('auth:web');
    Route::get('/vnpay-return', [VNPayController::class, 'vnpayReturn']);

    //API Giao dịch
    Route::get('/giao-dich/cua-toi', [GiaoDichController::class, 'layGiaoDichCuaToi']);

    //API Yêu cầu rút tiền
    Route::post('/yeu-cau-rut-tien', [YeuCauRutTienController::class, 'taoYeuCau']);
    Route::get('/yeu-cau-rut-tien/cua-toi', [YeuCauRutTienController::class, 'layDanhSachCuaToi']);
    Route::get('/admin/yeu-cau-rut-tien', [YeuCauRutTienController::class, 'layDanhSachAdmin']);
    Route::put('/admin/yeu-cau-rut-tien/{id}/xu-ly', [YeuCauRutTienController::class, 'xuLyYeuCau']);
});