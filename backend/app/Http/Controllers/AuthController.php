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

class AuthController extends Controller
{
    // Chức năng Đăng ký
    public function dangKy(Request $request)
    {
        $request->validate([
            'ho_ten'        => 'required|string|max:255',
            'so_dien_thoai' => 'required|string|max:20|unique:NguoiDung,SoDienThoai',
            'email'         => 'required|string|email|max:255|unique:NguoiDung,Email',
            'vneid'         => 'required|string|regex:/^[0-9]{9,12}$/|unique:NguoiDung,Vneid',
            'mat_khau'      => 'required|string|min:6',
        ], [
            'ho_ten.required'        => 'Vui lòng nhập họ và tên.',
            'so_dien_thoai.required' => 'Vui lòng nhập số điện thoại.',
            'so_dien_thoai.unique'   => 'Số điện thoại này đã được đăng ký.',
            'email.required'         => 'Vui lòng nhập địa chỉ email.',
            'email.email'            => 'Địa chỉ email không hợp lệ.',
            'email.unique'           => 'Email này đã được đăng ký.',
            'vneid.required'         => 'Vui lòng nhập số định danh VNeID / CCCD.',
            'vneid.regex'            => 'Số định danh VNeID / CCCD phải gồm từ 9 đến 12 chữ số.',
            'vneid.unique'           => 'Số định danh VNeID / CCCD này đã tồn tại trên hệ thống.',
            'mat_khau.required'      => 'Vui lòng nhập mật khẩu.',
            'mat_khau.min'           => 'Mật khẩu phải có ít nhất 6 ký tự.'
        ]);

        $user = NguoiDung::create([
            'HoTen'       => $request->ho_ten,
            'SoDienThoai' => $request->so_dien_thoai,
            'Email'       => $request->email,
            'Vneid'       => $request->vneid,
            'MatKhau'     => Hash::make($request->mat_khau),
            'VaiTro'      => 'KhachHang',
            'SoDuVi'      => 0
        ]);

        broadcast(new \App\Events\AdminDataUpdated())->toOthers();

        return response()->json([
            'message' => 'Đăng ký thành công',
            'user'    => $user
        ], 201);
    }

    public function capTaiKhoan(Request $request)
    {
        $nguoiThucHien = $request->user();
        if (!$nguoiThucHien || !in_array($nguoiThucHien->VaiTro, ['Admin', 'QuanLySan'])) {
            return response()->json(['message' => 'Lỗi phân quyền: Bạn không có quyền cấp tài khoản.'], 403);
        }

        if ($nguoiThucHien->VaiTro === 'QuanLySan' && $request->vai_tro !== 'NhanVien') {
            return response()->json(['message' => 'Lỗi phân quyền: Quản lý sân chỉ được cấp tài khoản Nhân viên!'], 403);
        }

        $maCumSanInput = $request->input('ma_cum_san', $request->input('id_cum_san'));
        $request->merge(['ma_cum_san_check' => $maCumSanInput]);

        $rules = [
            'ho_ten'        => 'required|string|max:255',
            'so_dien_thoai' => 'required|string|max:20|unique:NguoiDung,SoDienThoai',
            'email'         => 'required|string|email|max:255|unique:NguoiDung,Email',
            'vneid'         => 'required|string|regex:/^[0-9]{9,12}$/|unique:NguoiDung,Vneid',
            'mat_khau'      => 'required|string|min:6',
            'vai_tro'       => ['required', Rule::in(['NhanVien', 'Admin', 'QuanLySan'])],
        ];

        if ($nguoiThucHien->VaiTro === 'Admin') {
            $rules['ma_cum_san_check'] = 'required_if:vai_tro,QuanLySan,NhanVien|nullable|exists:CumSan,MaCumSan';
        }

        $request->validate($rules, [
            'ho_ten.required'              => 'Vui lòng nhập họ và tên.',
            'so_dien_thoai.required'       => 'Vui lòng nhập số điện thoại.',
            'so_dien_thoai.unique'         => 'Số điện thoại này đã tồn tại trên hệ thống.',
            'email.required'               => 'Vui lòng nhập địa chỉ email.',
            'email.email'                  => 'Địa chỉ email không đúng định dạng.',
            'email.unique'                 => 'Email này đã tồn tại trên hệ thống.',
            'vneid.required'               => 'Vui lòng nhập số định danh VNeID / CCCD.',
            'vneid.regex'                  => 'Số định danh VNeID / CCCD phải gồm từ 9 đến 12 chữ số.',
            'vneid.unique'                 => 'Số định danh VNeID / CCCD này đã tồn tại trên hệ thống.',
            'mat_khau.required'            => 'Vui lòng nhập mật khẩu.',
            'mat_khau.min'                 => 'Mật khẩu phải có ít nhất 6 ký tự.',
            'vai_tro.required'             => 'Vui lòng chọn vai trò phân quyền.',
            'ma_cum_san_check.required_if' => 'Vui lòng chọn Cụm sân cho tài khoản này.',
            'ma_cum_san_check.exists'      => 'Cụm sân đã chọn không tồn tại trên hệ thống.'
        ]);

        $maCumSanGanVao = null;
        if ($request->vai_tro !== 'Admin') {
            $maCumSanGanVao = ($nguoiThucHien->VaiTro === 'QuanLySan')
                              ? $nguoiThucHien->MaCumSan
                              : $maCumSanInput;
        }

        $user = NguoiDung::create([
            'HoTen'       => $request->ho_ten,
            'SoDienThoai' => $request->so_dien_thoai,
            'Email'       => $request->email,
            'Vneid'       => $request->vneid,
            'MatKhau'     => Hash::make($request->mat_khau),
            'VaiTro'      => $request->vai_tro,
            'MaCumSan'    => $maCumSanGanVao,
            'SoDuVi'      => 0
        ]);

        broadcast(new \App\Events\AdminDataUpdated())->toOthers();

        return response()->json([
            'message' => 'Cấp tài khoản ' . $request->vai_tro . ' thành công',
            'user'    => $user
        ], 201);
    }

    // Chức năng Đăng nhập
    public function dangNhap(Request $request)
    {
        $request->validate([
            'so_dien_thoai' => 'required|string',
            'mat_khau'      => 'required|string',
        ]);

        $credentials = [
            'SoDienThoai' => $request->so_dien_thoai,
            'password'    => $request->mat_khau
        ];

        if (Auth::attempt($credentials)) {
            $user = Auth::user();

            if (in_array($user->VaiTro, ['Admin', 'QuanLySan', 'NhanVien']) && $user->TrangThaiKhoa) {
                Auth::logout();
                return response()->json([
                    'message' => 'Tài khoản của bạn đã bị khóa quyền truy cập. Vui lòng liên hệ Admin hệ thống!'
                ], 403);
            }

            $user->tokens()->delete();

            $token = $user->createToken('auth_token')->plainTextToken;

            $user->Token = $token;
            $user->save();

            $this->tuDongCapNhatHeThong();

            return response()->json([
                'message' => 'Đăng nhập thành công',
                'user'    => $user,
                'token'   => $token
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
            $user->currentAccessToken()?->delete();
            $user->Token = null;
            $user->save();
        }

        return response()->json(['message' => 'Đã đăng xuất']);
    }

    public function capNhatProfile(Request $request)
    {
        $user = Auth::user();

        $request->validate([
            'ho_ten' => 'required|string|max:255',
            'so_dien_thoai' => [
                'required',
                'string',
                'max:20',
                Rule::unique('NguoiDung', 'SoDienThoai')->ignore($user->MaNguoiDung, 'MaNguoiDung')
            ],
            'email' => [
                'required',
                'string',
                'email',
                'max:255',
                Rule::unique('NguoiDung', 'Email')->ignore($user->MaNguoiDung, 'MaNguoiDung')
            ],
            'vneid'         => 'nullable|string|max:50',
            'ten_ngan_hang' => 'nullable|string|max:100',
            'stk_ngan_hang' => 'nullable|string|max:100',
            'ten_tai_khoan' => 'nullable|string|max:50',
        ]);

        $user->HoTen = $request->ho_ten;
        $user->SoDienThoai = $request->so_dien_thoai;
        $user->Email = $request->email;

        if ($request->has('vneid')) {
            $user->Vneid = $request->vneid;
        }
        if ($request->has('ten_ngan_hang')) {
            $user->TenNganHang = $request->ten_ngan_hang;
        }
        if ($request->has('stk_ngan_hang')) {
            $user->STKNganHang = $request->stk_ngan_hang;
        }
        if ($request->has('ten_tai_khoan')) {
            $user->TenTaiKhoan = $request->ten_tai_khoan;
        }

        $user->save();

        broadcast(new \App\Events\AdminDataUpdated())->toOthers();

        return response()->json([
            'message' => 'Cập nhật thông tin thành công',
            'user'    => $user
        ]);
    }

    public function layThongTin(Request $request)
    {
        return response()->json([
            'success' => true,
            'user'    => $request->user()
        ]);
    }

    public function guiOTP(Request $request)
    {
        $request->validate(['email' => 'required|email']);

        $user = NguoiDung::where('Email', $request->email)->first();
        if (!$user) {
            return response()->json(['message' => 'Email không tồn tại trong hệ thống'], 404);
        }

        $otp = sprintf("%06d", mt_rand(1, 999999));
        $user->MaOTP = $otp;
        $user->ThoiGianHetHanOTP = Carbon::now()->addMinutes(5);
        $user->save();

        Mail::raw("Mã OTP của bạn là: $otp. Mã có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.", function ($message) use ($user) {
            $message->to($user->Email)->subject('Mã xác nhận OTP - DN FOOTBALL');
        });

        return response()->json(['message' => 'Đã gửi mã OTP đến email của bạn.']);
    }

    public function datLaiMatKhau(Request $request)
    {
        $request->validate([
            'email'        => 'required|email',
            'otp'          => 'required|string|size:6',
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

        $user->MatKhau = Hash::make($request->mat_khau_moi);
        $user->MaOTP = null;
        $user->ThoiGianHetHanOTP = null;
        $user->save();

        return response()->json(['message' => 'Đổi mật khẩu thành công!']);
    }

    public function doiMatKhau(Request $request)
    {
        $user = $request->user();

        $request->validate([
            'mat_khau_cu'       => 'required|string',
            'mat_khau_moi'      => 'required|string|min:6',
            'xac_nhan_mat_khau' => 'required|string|same:mat_khau_moi'
        ], [
            'mat_khau_cu.required'       => 'Vui lòng nhập mật khẩu hiện tại.',
            'mat_khau_moi.required'      => 'Vui lòng nhập mật khẩu mới.',
            'mat_khau_moi.min'           => 'Mật khẩu mới phải có ít nhất 6 ký tự.',
            'xac_nhan_mat_khau.required' => 'Vui lòng nhập lại mật khẩu mới.',
            'xac_nhan_mat_khau.same'     => 'Xác nhận mật khẩu không khớp.'
        ]);

        if (!Hash::check($request->mat_khau_cu, $user->MatKhau)) {
            return response()->json([
                'success' => false,
                'message' => 'Mật khẩu hiện tại không chính xác!'
            ], 400);
        }

        $user->MatKhau = Hash::make($request->mat_khau_moi);
        $user->save();

        return response()->json([
            'success' => true,
            'message' => 'Đổi mật khẩu thành công!'
        ]);
    }

    private function tuDongCapNhatHeThong()
    {
        $ngayHetHan = now()->subDays(3)->toDateString();

        $cacGiaiDauHetHan = GiaiDau::where('TrangThai', 'DaDuyet')
            ->whereDate('NgayDuyet', '<=', $ngayHetHan)
            ->get();

        if ($cacGiaiDauHetHan->count() > 0) {
            $userIdsToUpdate = [];

            foreach ($cacGiaiDauHetHan as $giaiDau) {
                // Dùng create() thay vì insert() để Trait tự động sinh MaThongBao (TB001, TB002...)
                ThongBao::create([
                    'MaNguoiDung'  => $giaiDau->MaNguoiDung,
                    'LoaiThongBao' => 'GiaiDau',
                    'TieuDe'       => 'Giải đấu hết hạn đặt sân',
                    'NoiDung'      => "Hạn đặt sân 3 ngày cho giải đấu '{$giaiDau->TenGiaiDau}' của bạn đã hết hạn. Hệ thống đã tự động khóa lịch giải đấu này."
                ]);

                if (!in_array($giaiDau->MaNguoiDung, $userIdsToUpdate)) {
                    $userIdsToUpdate[] = $giaiDau->MaNguoiDung;
                }
            }

            GiaiDau::where('TrangThai', 'DaDuyet')
                ->whereDate('NgayDuyet', '<=', $ngayHetHan)
                ->update(['TrangThai' => 'HetHan']);

            foreach ($userIdsToUpdate as $userId) {
                broadcast(new \App\Events\UserDataUpdated($userId));
            }
        }
    }
}