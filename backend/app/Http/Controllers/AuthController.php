<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\NguoiDung;
use App\Models\GiaiDau;
use App\Models\ThongBao;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Mail;
use Carbon\Carbon;
use Illuminate\Support\Str;

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

        broadcast(new \App\Events\AdminDataUpdated())->toOthers();

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

            $user->tokens()->delete();

            $token = $user->createToken('auth_token')->plainTextToken;

            $user->Token = $token;
            $user->save();
            
            $this->tuDongCapNhatHeThong();

            return response()->json([
                'message' => 'Đăng nhập thành công',
                'user' => $user,
                'token' => $token 
            ]);
        }

        return response()->json([
            'message' => 'Số điện thoại hoặc mật khẩu không chính xác'
        ], 401);
    }
    
    // Chức năng Đăng xuất
    public function dangXuat(Request $request)
    {
        $user = $request->user();
        
        if ($user) {
            $user->currentAccessToken()->delete();
            
            $user->Token = null;
            $user->save();
        }
        
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

        broadcast(new \App\Events\AdminDataUpdated())->toOthers();

        return response()->json([
            'message' => 'Cập nhật thông tin thành công',
            'user' => $user
        ]);
    }

    public function layThongTin(Request $request)
    {
        return response()->json([
            'success' => true,
            'user' => $request->user()
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
        // Tính theo mốc ngày (không theo giờ)
        $today = now()->toDateString();
        $ngayHetHan = now()->subDays(3)->toDateString();

        $cacGiaiDauHetHan = GiaiDau::where('TrangThai', 'DaDuyet')
            ->whereDate('NgayDuyet', '<=', $ngayHetHan)
            ->get();

        if ($cacGiaiDauHetHan->count() > 0) {
            
            $thongBaoMoi = [];
            $userIdsToUpdate = [];

            // 2. Tạo mảng thông báo cho từng giải đấu
            foreach ($cacGiaiDauHetHan as $giaiDau) {
                $thongBaoMoi[] = [
                    'ID_NguoiDung' => $giaiDau->ID_NguoiDung,
                    'LoaiThongBao' => 'GiaiDau',
                    'TieuDe'       => 'Giải đấu hết hạn đặt sân',
                    'NoiDung'      => "Hạn đặt sân 3 ngày cho giải đấu '{$giaiDau->TenGiaiDau}' của bạn đã hết hạn. Hệ thống đã tự động khóa lịch giải đấu này."
                ];
                
                // Gom ID user để bắn WebSocket chính xác
                if (!in_array($giaiDau->ID_NguoiDung, $userIdsToUpdate)) {
                    $userIdsToUpdate[] = $giaiDau->ID_NguoiDung;
                }
            }

            // 3. Chèn thông báo vào DB
            ThongBao::insert($thongBaoMoi);

            // 4. Cập nhật trạng thái Giải Đấu thành HetHan
            GiaiDau::where('TrangThai', 'DaDuyet')
                ->whereDate('NgayDuyet', '<=', $ngayHetHan)
                ->update(['TrangThai' => 'HetHan']);

            // 5. Bắn tín hiệu WebSocket đến các khách hàng bị ảnh hưởng để cập nhật chuông
            foreach ($userIdsToUpdate as $userId) {
                broadcast(new \App\Events\UserDataUpdated($userId));
            }
        }
    }
}