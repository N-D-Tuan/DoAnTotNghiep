<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Models\GiaoDich;
use App\Models\NguoiDung;
use App\Models\ThongBao;

class GiaoDichController extends Controller
{
    public function layGiaoDichCuaToi(Request $request)
    {
        $userId = Auth::id() ?? $request->user()->MaNguoiDung;

        $giaoDich = GiaoDich::where('MaNguoiDung', $userId)
            ->orderBy('NgayTao', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data'    => $giaoDich
        ]);
    }

    public function rutTien(Request $request)
    {
        $request->validate([
            'so_tien'       => 'required|numeric|min:50000',
            'ngan_hang'     => 'required|string|max:100',
            'so_tai_khoan'  => 'required|string|max:100',
            'chu_tai_khoan' => 'required|string|max:50',
        ], [
            'so_tien.required'       => 'Vui lòng nhập số tiền cần rút!',
            'so_tien.min'            => 'Số tiền rút tối thiểu là 50.000đ!',
            'ngan_hang.required'     => 'Vui lòng nhập tên ngân hàng!',
            'so_tai_khoan.required'  => 'Vui lòng nhập số tài khoản!',
            'chu_tai_khoan.required' => 'Vui lòng nhập tên chủ tài khoản!',
        ]);

        $userId = Auth::id() ?? $request->user()->MaNguoiDung;

        DB::beginTransaction();
        try {
            $user = NguoiDung::where('MaNguoiDung', $userId)->lockForUpdate()->first();

            if (!$user) {
                DB::rollBack();
                return response()->json(['success' => false, 'message' => 'Không tìm thấy tài khoản!'], 404);
            }

            $soTienRut = (float) $request->so_tien;

            if ($soTienRut > $user->SoDuVi) {
                DB::rollBack();
                return response()->json([
                    'success' => false,
                    'message' => 'Số dư trong ví không đủ để thực hiện giao dịch này!'
                ], 400);
            }

            $soDuTruoc = $user->SoDuVi;
            $soDuSau = $soDuTruoc - $soTienRut;

            $nganHang = trim($request->ngan_hang);
            $stk = trim($request->so_tai_khoan);
            $chuTk = mb_strtoupper(trim($request->chu_tai_khoan), 'UTF-8');

            // Kiểm tra xem người dùng đã có thông tin ngân hàng trong hồ sơ chưa
            $daCoThongTinNganHang = !empty(trim($user->TenNganHang ?? '')) 
                                 && !empty(trim($user->STKNganHang ?? '')) 
                                 && !empty(trim($user->TenTaiKhoan ?? ''));

            // 1. Trừ tiền trong ví. Chỉ lưu thông tin ngân hàng vào NguoiDung nếu CHƯA CÓ
            $updateData = ['SoDuVi' => $soDuSau];
            if (!$daCoThongTinNganHang) {
                $updateData['TenNganHang'] = $nganHang;
                $updateData['STKNganHang'] = $stk;
                $updateData['TenTaiKhoan'] = $chuTk;
            }
            $user->update($updateData);

            // 2. Tạo bản ghi Giao dịch
            GiaoDich::create([
                'MaNguoiDung'    => $user->MaNguoiDung,
                'MaNhanVienXuLy' => null,
                'LoaiGiaoDich'   => 'RutTien',
                'DongTien'       => 'Tru',
                'SoTien'         => $soTienRut,
                'SoDuTruoc'      => $soDuTruoc,
                'SoDuSau'        => $soDuSau,
                'NoiDung'        => "Rút tiền về {$nganHang} - STK: {$stk} ({$chuTk})"
            ]);

            // 3. Tạo thông báo cho khách hàng
            ThongBao::create([
                'MaNguoiDung'  => $user->MaNguoiDung,
                'TieuDe'       => 'Rút tiền thành công',
                'NoiDung'      => 'Bạn đã rút thành công ' . number_format($soTienRut, 0, ',', '.') . "đ từ ví về tài khoản {$nganHang} - {$stk}.",
                'LoaiThongBao' => 'ViTien'
            ]);

            DB::commit();

            broadcast(new \App\Events\UserDataUpdated($user->MaNguoiDung))->toOthers();
            broadcast(new \App\Events\AdminDataUpdated())->toOthers();

            return response()->json([
                'success' => true,
                'message' => 'Rút tiền thành công! Số dư ví đã được cập nhật.',
                'user'    => $user
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'message' => 'Lỗi hệ thống: ' . $e->getMessage()
            ], 500);
        }
    }
}