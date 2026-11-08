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

        $maSanBongInput = $request->input('MaSanBong');
        $cleanMaSB = null;
        if ($maSanBongInput !== null && trim((string) $maSanBongInput) !== '') {
            $cleanMaSB = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $maSanBongInput));
            if ($cleanMaSB === '') {
                return response()->json(['success' => false, 'message' => 'Mã sân bóng chỉ được chứa chữ cái không dấu và số viết liền (A-Z, 0-9)!'], 422);
            }
            if (SanBong::where('MaSanBong', $cleanMaSB)->exists()) {
                return response()->json(['success' => false, 'message' => "Mã sân bóng [{$cleanMaSB}] đã tồn tại! Vui lòng chọn mã khác."], 422);
            }
        }

        $validated = $request->validate([
            'MaCumSan'  => 'required|exists:CumSan,MaCumSan',
            'MaLoaiSan' => 'required|exists:LoaiSan,MaLoaiSan',
            'TenSan'    => 'required|string|max:255',
            'DienTich'  => 'nullable|numeric|min:0',
            'KichThuoc' => 'nullable|string|max:50',
            'MoTa'      => 'nullable|string',
            'TrangThai' => 'required|in:HoatDong,BaoTri'
        ]);

        if ($cleanMaSB) {
            $validated['MaSanBong'] = $cleanMaSB;
        }

        // Nhận diện sân 7 cho cả mã cũ (LS002) và mã mới (LS7, LS7V...)
        $maLSUpper = strtoupper($validated['MaLoaiSan']);
        $isSan7 = ($maLSUpper === 'LS002' || str_starts_with($maLSUpper, 'LS7'));
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

        $oldId = $sanBong->MaSanBong;
        $newIdInput = $request->input('MaSanBong');
        $newId = $oldId;

        if ($newIdInput !== null && trim((string) $newIdInput) !== '') {
            $cleanNewId = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $newIdInput));
            if ($cleanNewId === '') {
                return response()->json(['success' => false, 'message' => 'Mã sân bóng chỉ được chứa chữ cái không dấu và số viết liền (A-Z, 0-9)!'], 422);
            }
            if ($cleanNewId !== $oldId) {
                if (SanBong::where('MaSanBong', $cleanNewId)->exists()) {
                    return response()->json(['success' => false, 'message' => "Mã sân bóng mới [{$cleanNewId}] đã tồn tại! Vui lòng chọn mã khác."], 422);
                }
                $newId = $cleanNewId;
            }
        }

        \Illuminate\Support\Facades\DB::beginTransaction();
        try {
            if ($newId !== $oldId) {
                $validated['MaSanBong'] = $newId;
                \Illuminate\Support\Facades\DB::statement('SET FOREIGN_KEY_CHECKS=0');
                \Illuminate\Support\Facades\DB::table('SanBong')->where('MaSanBong', $oldId)->update($validated);
                \Illuminate\Support\Facades\DB::table('DatSan')->where('MaSanBong', $oldId)->update(['MaSanBong' => $newId]);
                \Illuminate\Support\Facades\DB::statement('SET FOREIGN_KEY_CHECKS=1');
                $sanBong = SanBong::find($newId);
            } else {
                $sanBong->update($validated);
            }

            \Illuminate\Support\Facades\DB::commit();
            broadcast(new \App\Events\SystemDataUpdated());

            return response()->json(['success' => true, 'message' => 'Cập nhật thành công', 'data' => $sanBong]);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\DB::rollBack();
            \Illuminate\Support\Facades\DB::statement('SET FOREIGN_KEY_CHECKS=1');
            return response()->json(['success' => false, 'message' => 'Lỗi cập nhật: ' . $e->getMessage()], 422);
        }
    }
}