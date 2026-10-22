<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\ThongBao;
use Illuminate\Support\Facades\Auth;

class ThongBaoController extends Controller
{
    public function layDanhSachCuaToi(Request $request)
    {
        $userId = Auth::id() ?? $request->user()->MaNguoiDung;

        $danhSach = ThongBao::where('MaNguoiDung', $userId)
            ->orderBy('NgayTao', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data'    => $danhSach
        ], 200);
    }

    public function danhDauDaDocTatCa(Request $request)
    {
        $userId = Auth::id() ?? $request->user()->MaNguoiDung;

        ThongBao::where('MaNguoiDung', $userId)
            ->where('DaDoc', 0)
            ->update(['DaDoc' => 1]);

        return response()->json([
            'success' => true,
            'message' => 'Đã đánh dấu đọc tất cả thông báo'
        ], 200);
    }

    public function danhDauDaDocTheoId(Request $request, $id)
    {
        $userId = Auth::id() ?? $request->user()->MaNguoiDung;

        $thongBao = ThongBao::where('MaThongBao', $id)
            ->where('MaNguoiDung', $userId)
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