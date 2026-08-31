<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;

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
