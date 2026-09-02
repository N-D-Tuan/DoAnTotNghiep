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
        $cumSans = CumSan::withTrashed()->with('phuong')->orderBy('ID', 'desc')->get();
        return response()->json(['success' => true, 'data' => $cumSans]);
    }

    // 2. Thêm mới Cụm Sân
    public function store(Request $request)
    {
        $validated = $request->validate([
            'ID_Phuong'  => 'required|exists:Phuong,ID',
            'TenCumSan'  => 'required|string|max:255',
            'DiaChi'     => 'required|string|max:255',
            'GioMoCua'   => 'required|date_format:H:i',
            'GioDongCua' => 'required|date_format:H:i',
            'HinhAnh'    => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:2048'
        ]);

        if ($request->hasFile('HinhAnh')) {
            // Lưu file vào public/cumsan
            $path = $request->file('HinhAnh')->store('cumsan', 'public');
            // Cập nhật lại đường dẫn để lưu vào Database
            $validated['HinhAnh'] = '/storage/' . $path; 
        }

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

        $validated = $request->validate([
            'ID_Phuong'  => 'required|exists:Phuong,ID',
            'TenCumSan'  => 'required|string|max:255',
            'DiaChi'     => 'required|string|max:255',
            'GioMoCua'   => 'required|date_format:H:i',
            'GioDongCua' => 'required|date_format:H:i',
            'HinhAnh'    => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:2048'
        ]);

        if ($request->hasFile('HinhAnh')) {
            // Lưu file vào public/cumsan
            $path = $request->file('HinhAnh')->store('cumsan', 'public');
            // Cập nhật lại đường dẫn để lưu vào Database
            $validated['HinhAnh'] = '/storage/' . $path; 
        }

        $cumSan->update($validated);
        return response()->json(['success' => true, 'message' => 'Cập nhật thành công!', 'data' => $cumSan]);
    }

    // 4. Xóa Cụm Sân
    public function destroy($id)
    {
        $cumSan = CumSan::find($id);
        if (!$cumSan) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy cụm sân!'], 404);
        }

        $cumSan->delete();
        return response()->json(['success' => true, 'message' => 'Xóa Cụm Sân thành công!']);
    }

    public function show($id)
    {
        $cumSan = CumSan::withTrashed()->with('phuong')->find($id);
        if (!$cumSan) return response()->json(['success' => false, 'message' => 'Không tìm thấy!']);
        return response()->json(['success' => true, 'data' => $cumSan]);
    }

    public function restore($id)
    {
        $cumSan = CumSan::withTrashed()->find($id);
        if (!$cumSan) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy cụm sân!'], 404);
        }

        $cumSan->restore(); // Xóa giá trị trong cột deleted_at (trở về NULL)
        return response()->json(['success' => true, 'message' => 'Khôi phục Cụm Sân thành công!']);
    }
}
