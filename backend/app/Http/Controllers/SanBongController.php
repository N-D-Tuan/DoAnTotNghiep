<?php

namespace App\Http\Controllers;

use App\Models\SanBong;
use Illuminate\Http\Request;

class SanBongController extends Controller
{
    public function index(Request $request)
    {
        $cumSanId = $request->query('ma_cum_san', $request->query('cum_san_id'));
        $sanBongs = SanBong::with('loaiSan')->where('MaCumSan', $cumSanId)->get();

        return response()->json(['success' => true, 'data' => $sanBongs]);
    }

    public function store(Request $request)
    {
        $request->merge([
            'MaCumSan'  => $request->input('MaCumSan', $request->input('ID_CumSan')),
            'MaLoaiSan' => $request->input('MaLoaiSan', $request->input('ID_LoaiSan')),
        ]);

        $validated = $request->validate([
            'MaCumSan'  => 'required|exists:CumSan,MaCumSan',
            'MaLoaiSan' => 'required|exists:LoaiSan,MaLoaiSan',
            'TenSan'    => 'required|string|max:255',
            'DienTich'  => 'nullable|numeric|min:0',
            'KichThuoc' => 'nullable|string|max:50',
            'MoTa'      => 'nullable|string',
            'TrangThai' => 'required|in:HoatDong,BaoTri'
        ]);

        // Nếu không truyền DienTich / KichThuoc, gán mặc định theo loại sân (LS002 là sân 7, LS001 là sân 5)
        $isSan7 = ($validated['MaLoaiSan'] === 'LS002');
        $validated['DienTich']  = $validated['DienTich'] ?? ($isSan7 ? 1800.00 : 800.00);
        $validated['KichThuoc'] = $validated['KichThuoc'] ?? ($isSan7 ? '30m x 60m' : '20m x 40m');
        $validated['MoTa']      = $validated['MoTa'] ?? 'Mặt cỏ nhân tạo cao cấp, hệ thống đèn LED chống chói tiêu chuẩn.';

        $sanBong = SanBong::create($validated);
        return response()->json(['success' => true, 'message' => 'Thêm sân con thành công', 'data' => $sanBong]);
    }

    public function update(Request $request, $id)
    {
        $sanBong = SanBong::find($id);
        if (!$sanBong) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy sân!'], 404);
        }

        $request->merge([
            'MaLoaiSan' => $request->input('MaLoaiSan', $request->input('ID_LoaiSan')),
        ]);

        $validated = $request->validate([
            'MaLoaiSan' => 'required|exists:LoaiSan,MaLoaiSan',
            'TenSan'    => 'required|string|max:255',
            'DienTich'  => 'nullable|numeric|min:0',
            'KichThuoc' => 'nullable|string|max:50',
            'MoTa'      => 'nullable|string',
            'TrangThai' => 'required|in:HoatDong,BaoTri'
        ]);

        $sanBong->update($validated);

        broadcast(new \App\Events\SystemDataUpdated());

        return response()->json(['success' => true, 'message' => 'Cập nhật thành công', 'data' => $sanBong]);
    }
}