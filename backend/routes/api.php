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
    
});

Route::middleware('web')->group(function () {
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
});