<?php

namespace App\Http\Controllers;

use App\Models\SanBong;
use Illuminate\Http\Request;

class SanBongController extends Controller
{
    public function index(Request $request)
    {
        $cumSanId = $request->query('cum_san_id');
        // Load kèm relationship loaiSan để hiển thị tên loại sân
        $sanBongs = SanBong::with('loaiSan')->where('ID_CumSan', $cumSanId)->get();
        
        return response()->json(['success' => true, 'data' => $sanBongs]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'ID_CumSan' => 'required|exists:CumSan,ID',
            'ID_LoaiSan' => 'required|exists:LoaiSan,ID',
            'TenSan' => 'required|string|max:255',
            'TrangThai' => 'required|in:HoatDong,BaoTri'
        ]);

        $sanBong = SanBong::create($validated);
        return response()->json(['success' => true, 'message' => 'Thêm sân con thành công', 'data' => $sanBong]);
    }

    public function update(Request $request, $id)
    {
        $sanBong = SanBong::find($id);
        if (!$sanBong) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy sân!'], 404);
        }

        $validated = $request->validate([
            'ID_LoaiSan' => 'required|exists:LoaiSan,ID',
            'TenSan' => 'required|string|max:255',
            'TrangThai' => 'required|in:HoatDong,BaoTri'
        ]);

        $sanBong->update($validated);

        broadcast(new \App\Events\SystemDataUpdated());
        
        return response()->json(['success' => true, 'message' => 'Cập nhật thành công', 'data' => $sanBong]);
    }
}
