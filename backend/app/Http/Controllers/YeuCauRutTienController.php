<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\YeuCauRutTien;
use App\Models\GiaoDich;
use App\Models\NguoiDung;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class YeuCauRutTienController extends Controller
{
    // 1. TẠO YÊU CẦU RÚT TIỀN (CUSTOMER)
    public function taoYeuCau(Request $request)
    {
        $request->validate([
            'SoTien' => 'required|numeric|min:50000',
            'NoiDung' => 'required|string'
        ]);

        $user = NguoiDung::find(Auth::id() ?? $request->user()->ID);

        $tongTienDangCho = YeuCauRutTien::where('ID_NguoiDung', $user->ID)
                                        ->where('TrangThai', 'ChoDuyet')
                                        ->sum('SoTien');
        
        $soDuKhaDung = $user->SoDuVi - $tongTienDangCho;

        // Kiểm tra tiền rút không được vượt quá số dư khả dụng
        if ($request->SoTien > $soDuKhaDung) {
            if ($tongTienDangCho > 0) {
                return response()->json([
                    'success' => false, 
                    'message' => 'Bạn đang có ' . number_format($tongTienDangCho) . 'đ chờ duyệt. Số dư khả dụng còn lại để rút là ' . number_format($soDuKhaDung) . 'đ!'
                ]);
            } else {
                return response()->json([
                    'success' => false, 
                    'message' => 'Số dư trong ví không đủ để rút!'
                ]);
            }
        }

        YeuCauRutTien::create([
            'ID_NguoiDung' => $user->ID,
            'SoTien'       => $request->SoTien,
            'NoiDung'      => $request->NoiDung,
            'TrangThai'    => 'ChoDuyet'
        ]);

        return response()->json(['success' => true, 'message' => 'Tạo yêu cầu rút tiền thành công!']);
    }

    // 2. LẤY DANH SÁCH RÚT TIỀN CỦA TÔI (CUSTOMER)
    public function layDanhSachCuaToi(Request $request)
    {
        $userId = Auth::id() ?? $request->user()->ID;
        $data = YeuCauRutTien::where('ID_NguoiDung', $userId)->orderBy('NgayTao', 'desc')->get();
        return response()->json(['success' => true, 'data' => $data]);
    }

    // 3. LẤY TẤT CẢ YÊU CẦU (ADMIN)
    public function layDanhSachAdmin()
    {
        $data = YeuCauRutTien::with('nguoiDung')->orderBy('NgayTao', 'desc')->get();
        return response()->json(['success' => true, 'data' => $data]);
    }

    // 4. XỬ LÝ DUYỆT/TỪ CHỐI (ADMIN)
    public function xuLyYeuCau(Request $request, $id)
    {
        $yeuCau = YeuCauRutTien::find($id);
        if (!$yeuCau || $yeuCau->TrangThai !== 'ChoDuyet') {
            return response()->json(['success' => false, 'message' => 'Yêu cầu không hợp lệ hoặc đã được xử lý!']);
        }

        $trangThaiMoi = $request->trang_thai; // 'DaDuyet' hoặc 'TuChoi'
        
        DB::beginTransaction();
        try {
            if ($trangThaiMoi === 'DaDuyet') {
                $user = NguoiDung::find($yeuCau->ID_NguoiDung);
                
                if ($yeuCau->SoTien > $user->SoDuVi) {
                    return response()->json(['success' => false, 'message' => 'Số dư ví khách hàng hiện không đủ!']);
                }

                $soDuTruoc = $user->SoDuVi;
                $soDuSau = $soDuTruoc - $yeuCau->SoTien;

                // 1. Trừ tiền user
                $user->update(['SoDuVi' => $soDuSau]);

                // 2. Tạo Giao dịch trừ tiền
                $giaoDich = GiaoDich::create([
                    'ID_NguoiDung' => $user->ID,
                    'ID_DatSan'    => null,
                    'LoaiGiaoDich' => 'RutTien',
                    'DongTien'     => 'Tru',
                    'SoTien'       => $yeuCau->SoTien,
                    'SoDuTruoc'    => $soDuTruoc,
                    'SoDuSau'      => $soDuSau,
                    'NoiDung'      => 'Rút tiền từ ví (Yêu cầu ID: ' . $yeuCau->ID . ')'
                ]);

                // 3. Cập nhật Yêu cầu rút tiền
                $yeuCau->update([
                    'TrangThai'   => 'DaDuyet',
                    'ID_GiaoDich' => $giaoDich->ID,
                    'NgayDuyet'   => now()
                ]);
            } else {
                $yeuCau->update(['TrangThai' => 'TuChoi', 'NgayDuyet' => now()]);
            }
            DB::commit();
            return response()->json(['success' => true]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Lỗi hệ thống: ' . $e->getMessage()]);
        }
    }
}
