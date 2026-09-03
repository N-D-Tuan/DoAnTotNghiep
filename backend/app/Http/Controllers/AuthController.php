<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\NguoiDung;
use App\Models\GiaiDau;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Mail;
use Carbon\Carbon;

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
            
            $this->tuDongCapNhatHeThong();

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

    public function capNhatProfile(Request $request)
    {
        // Lấy thông tin user đang đăng nhập từ Session
        $user = Auth::user(); 

        $request->validate([
            'ho_ten' => 'required|string|max:255',
            'so_dien_thoai' => [
                'required',
                'string',
                'max:20',
                // Bắt buộc duy nhất, nhưng bỏ qua ID của chính user hiện tại
                Rule::unique('NguoiDung', 'SoDienThoai')->ignore($user->ID, 'ID')
            ],
            'email' => [
                'required',
                'string',
                'email',
                'max:255',
                Rule::unique('NguoiDung', 'Email')->ignore($user->ID, 'ID')
            ],
        ]);

        // Cập nhật dữ liệu mới
        $user->HoTen = $request->ho_ten;
        $user->SoDienThoai = $request->so_dien_thoai;
        $user->Email = $request->email;
        $user->save();

        return response()->json([
            'message' => 'Cập nhật thông tin thành công',
            'user' => $user
        ]);
    }

    // Hàm 1: Gửi mã OTP
    public function guiOTP(Request $request)
    {
        $request->validate(['email' => 'required|email']);
        
        $user = NguoiDung::where('Email', $request->email)->first();
        if (!$user) {
            return response()->json(['message' => 'Email không tồn tại trong hệ thống'], 404);
        }

        // Tạo mã 6 số ngẫu nhiên và lưu hạn 5 phút
        $otp = sprintf("%06d", mt_rand(1, 999999));
        $user->MaOTP = $otp;
        $user->ThoiGianHetHanOTP = Carbon::now()->addMinutes(5);
        $user->save();

        // Gửi email không cần tạo template phức tạp
        Mail::raw("Mã OTP của bạn là: $otp. Mã có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.", function ($message) use ($user) {
            $message->to($user->Email)->subject('Mã xác nhận OTP - DN FOOTBALL');
        });

        return response()->json(['message' => 'Đã gửi mã OTP đến email của bạn.']);
    }

    // Hàm 2: Xác nhận OTP và đặt lại mật khẩu
    public function datLaiMatKhau(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'otp' => 'required|string|size:6',
            'mat_khau_moi' => 'required|string|min:6'
        ]);

        $user = NguoiDung::where('Email', $request->email)->first();
        if (!$user) return response()->json(['message' => 'Lỗi xác thực'], 404);

        if ($user->MaOTP !== $request->otp) {
            return response()->json(['message' => 'Mã OTP không chính xác'], 400);
        }

        if (Carbon::now()->isAfter($user->ThoiGianHetHanOTP)) {
            return response()->json(['message' => 'Mã OTP đã hết hạn'], 400);
        }

        // Đổi mật khẩu và xóa dấu vết OTP
        $user->MatKhau = Hash::make($request->mat_khau_moi);
        $user->MaOTP = null;
        $user->ThoiGianHetHanOTP = null;
        $user->save();

        return response()->json(['message' => 'Đổi mật khẩu thành công!']);
    }

    private function tuDongCapNhatHeThong()
    {
        $today = now();
        $ngayHetHan = now()->subDays(3);

        // Cập nhật Giải đấu
        GiaiDau::where('TrangThai', 'DaDuyet')
            ->where('NgayDuyet', '<', $ngayHetHan)
            ->update(['TrangThai' => 'HetHan']);

        GiaiDau::whereIn('TrangThai', ['DaDuyet', 'HetHan'])
            ->whereDate('NgayBatDau', '<=', $today->toDateString())
            ->update(['TrangThai' => 'HoanThanh']);
    }
}