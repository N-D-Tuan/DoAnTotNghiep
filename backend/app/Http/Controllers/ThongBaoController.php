<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\ThongBao;
use Illuminate\Support\Facades\Auth;

class ThongBaoController extends Controller
{
    // 1. Lấy danh sách thông báo của khách hàng đang đăng nhập
    public function layDanhSachCuaToi(Request $request)
    {
        // Lấy ID người dùng từ Session hoặc Token
        $userId = Auth::id() ?? $request->user()->ID;

        // Lấy toàn bộ thông báo, sắp xếp mới nhất lên đầu
        $danhSach = ThongBao::where('ID_NguoiDung', $userId)
            ->orderBy('NgayTao', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $danhSach
        ], 200);
    }

    // 2. Chuyển tất cả thông báo chưa đọc (0) thành đã đọc (1)
    public function danhDauDaDocTatCa(Request $request)
    {
        $userId = Auth::id() ?? $request->user()->ID;

        // Chỉ update những thông báo chưa đọc để tối ưu hiệu suất Database
        ThongBao::where('ID_NguoiDung', $userId)
            ->where('DaDoc', 0)
            ->update(['DaDoc' => 1]);

        return response()->json([
            'success' => true,
            'message' => 'Đã đánh dấu đọc tất cả thông báo'
        ], 200);
    }

    // 3. Chuyển trạng thái 1 thông báo cụ thể thành đã đọc (1)
    public function danhDauDaDocTheoId(Request $request, $id)
    {
        $userId = Auth::id() ?? $request->user()->ID;

        $thongBao = ThongBao::where('ID', $id)
            ->where('ID_NguoiDung', $userId)
            ->first();

        if ($thongBao) {
            $thongBao->update(['DaDoc' => 1]);
            return response()->json([
                'success' => true,
                'message' => 'Đã đánh dấu đã đọc'
            ], 200);
        }

        return response()->json([
            'success' => false,
            'message' => 'Không tìm thấy thông báo'
        ], 404);
    }
}
