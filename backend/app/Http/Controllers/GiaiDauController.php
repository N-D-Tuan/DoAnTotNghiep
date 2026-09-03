<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Auth;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\GiaiDau;
use App\Models\CumSan;

class GiaiDauController extends Controller
{
    // 1. API Lấy danh sách giải đấu của người dùng đang đăng nhập
    public function layDanhSachCuaToi()
    {
        $userId = Auth::id(); // Lấy ID khách hàng từ phiên đăng nhập

        $danhSach = GiaiDau::with('cumSan')
            ->where('ID_NguoiDung', $userId)
            ->orderBy('NgayTao', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $danhSach
        ], 200);
    }

    // 2. API Tạo yêu cầu giải đấu mới
    public function taoYeuCau(Request $request)
    {
        // Kiểm tra dữ liệu đầu vào
        $request->validate([
            'id_cum_san' => 'required|exists:CumSan,ID',
            'ten_giai_dau' => 'required|string|max:255',
            'ngay_bat_dau' => 'required|date|after_or_equal:today',
            'ngay_ket_thuc' => 'required|date|after_or_equal:ngay_bat_dau',
            'noi_dung' => 'nullable|string'
        ], [
            'ngay_bat_dau.after_or_equal' => 'Ngày bắt đầu không được trong quá khứ.',
            'ngay_ket_thuc.after_or_equal' => 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.'
        ]);

        // Trạng thái 'ChoDuyet' và 'NgayTao' đã được tự động xử lý ở DB và Model
        $giaiDau = GiaiDau::create([
            'ID_NguoiDung' => Auth::id(),
            'ID_CumSan' => $request->id_cum_san,
            'TenGiaiDau' => $request->ten_giai_dau,
            'NgayBatDau' => $request->ngay_bat_dau,
            'NgayKetThuc' => $request->ngay_ket_thuc,
            'NoiDung' => $request->noi_dung
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Gửi yêu cầu tổ chức giải đấu thành công!',
            'data' => $giaiDau
        ], 201);
    }

    // 3. API Lấy toàn bộ danh sách giải đấu (Dành cho Admin)
    public function layDanhSachAdmin()
    {
        // Nối 2 bảng CumSan và NguoiDung để lấy Tên sân và Tên người đặt
        $danhSach = GiaiDau::with(['cumSan', 'nguoiDung'])
            ->orderBy('NgayTao', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $danhSach
        ], 200);
    }

    // 4. API Cập nhật trạng thái duyệt/từ chối
    public function xuLyYeuCau(Request $request, $id)
    {
        $giaiDau = GiaiDau::find($id);
        
        if (!$giaiDau) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy giải đấu!'], 404);
        }

        $trangThaiMoi = $request->trang_thai; // 'DaDuyet' hoặc 'TuChoi'
        
        $giaiDau->TrangThai = $trangThaiMoi;
        
        // Nếu duyệt, hệ thống tự động ghi nhận mốc thời gian hiện tại vào cột NgayDuyet
        if ($trangThaiMoi === 'DaDuyet') {
            $giaiDau->NgayDuyet = now();
        }

        $giaiDau->save();

        return response()->json([
            'success' => true,
            'message' => 'Đã xử lý yêu cầu thành công!'
        ], 200);
    }
}
