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

        $maCumSanInput = $request->input('MaCumSan');
        $cleanMaCS = null;
        if ($maCumSanInput !== null && trim((string) $maCumSanInput) !== '') {
            $cleanMaCS = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $maCumSanInput));
            if ($cleanMaCS === '') {
                return response()->json(['success' => false, 'message' => 'Mã cụm sân chỉ được chứa chữ cái không dấu và số viết liền (A-Z, 0-9)!'], 422);
            }
            if (CumSan::where('MaCumSan', $cleanMaCS)->exists()) {
                return response()->json(['success' => false, 'message' => "Mã cụm sân [{$cleanMaCS}] đã tồn tại! Vui lòng chọn mã khác."], 422);
            }
        }

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

        if ($cleanMaCS) {
            $validated['MaCumSan'] = $cleanMaCS;
        }

        if ($request->hasFile('HinhAnh')) {
            $path = $request->file('HinhAnh')->store('cumsan', 'public');
            $validated['HinhAnh'] = '/storage/' . $path;
        }

        $validated['TrangThai'] = $validated['TrangThai'] ?? 'HoatDong';

        $cumSan = CumSan::create($validated);
        return response()->json(['success' => true, 'message' => 'Thêm Cụm Sân thành công!', 'data' => $cumSan], 201);
    }

    // 3. Cập nhật Cụm Sân (Hỗ trợ đổi luôn cả MaCumSan và tự động đồng bộ khóa ngoại)
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

        // Kiểm tra nếu người dùng sửa cả Mã Cụm Sân (MaCumSan)
        $oldId = $cumSan->MaCumSan;
        $newIdInput = $request->input('MaCumSan');
        $newId = $oldId;

        if ($newIdInput !== null && trim((string) $newIdInput) !== '') {
            $cleanNewId = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $newIdInput));
            if ($cleanNewId === '') {
                return response()->json(['success' => false, 'message' => 'Mã cụm sân chỉ được chứa chữ cái không dấu và số viết liền (A-Z, 0-9)!'], 422);
            }
            if ($cleanNewId !== $oldId) {
                if (CumSan::where('MaCumSan', $cleanNewId)->exists()) {
                    return response()->json(['success' => false, 'message' => "Mã cụm sân mới [{$cleanNewId}] đã tồn tại! Vui lòng chọn mã khác."], 422);
                }
                $newId = $cleanNewId;
            }
        }

        if ($request->hasFile('HinhAnh')) {
            $path = $request->file('HinhAnh')->store('cumsan', 'public');
            $validated['HinhAnh'] = '/storage/' . $path;
        }

        \Illuminate\Support\Facades\DB::beginTransaction();
        try {
            if ($newId !== $oldId) {
                $validated['MaCumSan'] = $newId;
                \Illuminate\Support\Facades\DB::statement('SET FOREIGN_KEY_CHECKS=0');
                \Illuminate\Support\Facades\DB::table('CumSan')->where('MaCumSan', $oldId)->update($validated);

                // Đồng bộ khóa ngoại MaCumSan ở các bảng liên quan
                foreach (['SanBong', 'GiaTien', 'NguoiDung', 'GiaiDau', 'DanhGia', 'CaLamViec'] as $childTable) {
                    if (\Illuminate\Support\Facades\Schema::hasTable($childTable)) {
                        \Illuminate\Support\Facades\DB::table($childTable)
                            ->where('MaCumSan', $oldId)
                            ->update(['MaCumSan' => $newId]);
                    }
                }
                \Illuminate\Support\Facades\DB::statement('SET FOREIGN_KEY_CHECKS=1');
                $cumSan = CumSan::find($newId);
            } else {
                $cumSan->update($validated);
            }

            \Illuminate\Support\Facades\DB::commit();
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            return response()->json([
                'success' => true,
                'message' => 'Cập nhật thành công!',
                'data'    => $cumSan,
                'new_id'  => $newId
            ]);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\DB::rollBack();
            \Illuminate\Support\Facades\DB::statement('SET FOREIGN_KEY_CHECKS=1');
            return response()->json(['success' => false, 'message' => 'Lỗi cập nhật: ' . $e->getMessage()], 422);
        }
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