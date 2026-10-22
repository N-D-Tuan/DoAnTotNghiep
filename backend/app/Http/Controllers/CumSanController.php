<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Http\Controllers\Controller;
use App\Models\CumSan;

class CumSanController extends Controller
{
    // 1. Lấy danh sách Cụm Sân (kèm tên Phường)
    public function index()
    {
        $cumSans = CumSan::with('phuong')
            ->withCount('danhGias')
            ->withAvg('danhGias', 'SoSao')
            ->get();

        return response()->json(['success' => true, 'data' => $cumSans]);
    }

    // 2. Thêm mới Cụm Sân
    public function store(Request $request)
    {
        $maPhuong = $request->input('MaPhuong', $request->input('ID_Phuong'));
        $request->merge(['MaPhuong' => $maPhuong]);

        $validated = $request->validate([
            'MaPhuong'   => 'required|exists:Phuong,MaPhuong',
            'TenCumSan'  => 'required|string|max:255',
            'DiaChi'     => 'required|string|max:255',
            'ViDo'       => 'required|numeric',
            'KinhDo'     => 'required|numeric',
            'GioMoCua'   => 'required|date_format:H:i',
            'GioDongCua' => 'required|date_format:H:i',
            'TrangThai'  => 'nullable|in:HoatDong,BaoTri',
            'HinhAnh'    => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:2048'
        ]);

        if ($request->hasFile('HinhAnh')) {
            $path = $request->file('HinhAnh')->store('cumsan', 'public');
            $validated['HinhAnh'] = '/storage/' . $path;
        }

        $validated['TrangThai'] = $validated['TrangThai'] ?? 'HoatDong';

        $cumSan = CumSan::create($validated);
        return response()->json(['success' => true, 'message' => 'Thêm Cụm Sân thành công!', 'data' => $cumSan], 201);
    }

    // 3. Cập nhật Cụm Sân
    public function update(Request $request, $id)
    {
        $cumSan = CumSan::find($id);
        if (!$cumSan) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy cụm sân!'], 404);
        }

        $maPhuong = $request->input('MaPhuong', $request->input('ID_Phuong'));
        $request->merge(['MaPhuong' => $maPhuong]);

        $validated = $request->validate([
            'MaPhuong'   => 'required|exists:Phuong,MaPhuong',
            'TenCumSan'  => 'required|string|max:255',
            'DiaChi'     => 'required|string|max:255',
            'ViDo'       => 'required|numeric',
            'KinhDo'     => 'required|numeric',
            'GioMoCua'   => 'required|date_format:H:i',
            'GioDongCua' => 'required|date_format:H:i',
            'TrangThai'  => 'nullable|in:HoatDong,BaoTri',
            'HinhAnh'    => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:2048'
        ]);

        if ($request->hasFile('HinhAnh')) {
            $path = $request->file('HinhAnh')->store('cumsan', 'public');
            $validated['HinhAnh'] = '/storage/' . $path;
        }

        $cumSan->update($validated);

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Cập nhật thành công!', 'data' => $cumSan]);
    }

    // 4. Chuyển Cụm Sân sang trạng thái Bảo Trì (Thay cho xóa mềm cũ)
    public function destroy($id)
    {
        $cumSan = CumSan::find($id);
        if (!$cumSan) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy cụm sân!'], 404);
        }

        $cumSan->update(['TrangThai' => 'BaoTri']);

        broadcast(new \App\Events\SystemDataUpdated());

        return response()->json(['success' => true, 'message' => 'Đã chuyển Cụm Sân sang trạng thái Bảo trì!']);
    }

    public function show($id)
    {
        $cumSan = CumSan::with('phuong')
            ->withCount('danhGias')
            ->withAvg('danhGias', 'SoSao')
            ->find($id);

        if (!$cumSan) return response()->json(['success' => false, 'message' => 'Không tìm thấy!']);

        return response()->json(['success' => true, 'data' => $cumSan]);
    }

    // 5. Mở hoạt động lại Cụm Sân (Chuyển từ BaoTri -> HoatDong)
    public function restore($id)
    {
        $cumSan = CumSan::find($id);
        if (!$cumSan) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy cụm sân!'], 404);
        }

        $cumSan->update(['TrangThai' => 'HoatDong']);

        broadcast(new \App\Events\SystemDataUpdated());

        return response()->json(['success' => true, 'message' => 'Đã kích hoạt Cụm Sân hoạt động trở lại!']);
    }
}