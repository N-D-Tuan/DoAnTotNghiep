<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;

Route::post('/dang-ky', [AuthController::class, 'dangKy']);
Route::post('/dang-nhap', [AuthController::class, 'dangNhap']);
Route::post('/dang-xuat', [AuthController::class, 'dangXuat'])->middleware('auth');
