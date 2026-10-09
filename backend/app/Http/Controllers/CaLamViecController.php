<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\CaLamViec;
use App\Models\CumSan;

class CaLamViecController extends Controller
{
    // Lấy danh sách ca mẫu của Cụm sân
    public function layDanhSach(Request $request)
    {
        $idCumSan = $request->user()->ID_CumSan; // Lấy ID Cụm sân của Quản lý hoặc Nhân viên
        $caLamViecs = CaLamViec::where('ID_CumSan', $idCumSan)->get();
        return response()->json(['success' => true, 'data' => $caLamViecs]);
    }

    // Quản lý lưu cấu hình ca (Tự động tính giờ)
    public function luuCauHinhCa(Request $request)
    {
        $idCumSan = $request->user()->ID_CumSan;
        $cumSan = CumSan::find($idCumSan);

        if (!$cumSan) {
            return response()->json(['success' => false, 'message' => 'Lỗi: Không tìm thấy cụm sân!']);
        }

        $request->validate([
            'TenCa' => 'required|in:Ca Sáng,Ca Tối',
            'SoLuongNhanVien' => 'required|integer|min:1',
            'LuongThuNgan' => 'required|numeric|min:0',
            'LuongPhucVu' => 'required|numeric|min:0',
        ]);

        // Logic tự động set giờ theo Cụm Sân và mốc 15h
        $gioBatDau = '';
        $gioKetThuc = '';

        if ($request->TenCa === 'Ca Sáng') {
            $gioBatDau = $cumSan->GioMoCua;
            $gioKetThuc = '15:00:00';
        } else if ($request->TenCa === 'Ca Tối') {
            $gioBatDau = '15:00:00';
            $gioKetThuc = $cumSan->GioDongCua;
        }

        // Dùng updateOrCreate: Nếu "Ca Sáng" đã có thì update lương/số lượng, chưa có thì tạo mới
        $caLamViec = CaLamViec::updateOrCreate(
            ['ID_CumSan' => $idCumSan, 'TenCa' => $request->TenCa],
            [
                'GioBatDau' => $gioBatDau,
                'GioKetThuc' => $gioKetThuc,
                'SoLuongNhanVien' => $request->SoLuongNhanVien,
                'LuongThuNgan' => $request->LuongThuNgan,
                'LuongPhucVu' => $request->LuongPhucVu
            ]
        );

        return response()->json([
            'success' => true, 
            'message' => 'Lưu cấu hình ' . $request->TenCa . ' thành công!',
            'data' => $caLamViec
        ]);
    }
}