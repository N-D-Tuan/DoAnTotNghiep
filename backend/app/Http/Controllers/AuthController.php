<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\NguoiDung;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Auth;

class AuthController extends Controller
{
    // Chức năng Đăng ký
    public function dangKy(Request $request)
    {
        // 1. Kiểm tra dữ liệu đầu vào
        $request->validate([
            'ho_ten' => 'required|string|max:255',
            'so_dien_thoai' => 'required|string|max:20|unique:NguoiDung,SoDienThoai',
            'email' => 'required|string|email|max:255|unique:NguoiDung,Email',
            'mat_khau' => 'required|string|min:6',
        ]);

        // 2. Tạo tài khoản và băm mật khẩu
        $user = NguoiDung::create([
            'HoTen' => $request->ho_ten,
            'SoDienThoai' => $request->so_dien_thoai,
            'Email' => $request->email,
            'MatKhau' => Hash::make($request->mat_khau), // Mã hóa an toàn
            'VaiTro' => 'KhachHang',
            'SoDuVi' => 0
        ]);

        return response()->json([
            'message' => 'Đăng ký thành công',
            'user' => $user
        ], 201);
    }

    // Chức năng Đăng nhập
    public function dangNhap(Request $request)
    {
        $request->validate([
            'so_dien_thoai' => 'required|string',
            'mat_khau' => 'required|string',
        ]);

        // 3. Khai báo mảng xác thực
        // Lưu ý: Bắt buộc dùng key 'password' để Laravel tự động map với hàm getAuthPassword() trong Model NguoiDung
        $credentials = [
            'SoDienThoai' => $request->so_dien_thoai,
            'password' => $request->mat_khau 
        ];

        // 4. Thực hiện kiểm tra
        if (Auth::attempt($credentials)) {
            $user = Auth::user();
            
            // Nếu bạn dùng API (Sanctum/Passport), bạn sẽ tạo Token ở đây.
            // Ví dụ với Sanctum: $token = $user->createToken('auth_token')->plainTextToken;

            return response()->json([
                'message' => 'Đăng nhập thành công',
                'user' => $user,
                // 'token' => $token 
            ]);
        }

        return response()->json([
            'message' => 'Số điện thoại hoặc mật khẩu không chính xác'
        ], 401);
    }
    
    // Chức năng Đăng xuất
    public function dangXuat(Request $request)
    {
        Auth::logout();
        // Nếu dùng token: $request->user()->currentAccessToken()->delete();
        
        return response()->json(['message' => 'Đã đăng xuất']);
    }
}