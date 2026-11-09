<?php

namespace App\Http\Controllers;

use App\Models\LoaiSan;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class LoaiSanController extends Controller
{
    /**
     * 1. Lấy danh sách Loại Sân (kèm số lượng Sân con đang sử dụng)
     */
    public function index()
    {
        $loaiSans = LoaiSan::orderBy('MaLoaiSan', 'asc')->get()->map(function ($ls) {
            $ls->so_san_con = DB::table('SanBong')->where('MaLoaiSan', $ls->MaLoaiSan)->count();
            $ls->so_bang_gia = DB::table('GiaTien')->where('MaLoaiSan', $ls->MaLoaiSan)->count();
            return $ls;
        });

        return response()->json([
            'success' => true,
            'data'    => $loaiSans
        ]);
    }

    /**
     * 2. Thêm mới Loại Sân (CHỈ DÀNH CHO ADMIN)
     */
    public function store(Request $request)
    {
        $user = auth()->user();
        if (!$user || $user->VaiTro !== 'Admin') {
            return response()->json([
                'success' => false,
                'message' => 'Truy cập bị từ chối! Chỉ Admin hệ thống mới có quyền thêm loại sân.'
            ], 403);
        }

        $maInput = $request->input('MaLoaiSan');
        $cleanMaLS = null;
        if ($maInput !== null && trim((string) $maInput) !== '') {
            $cleanMaLS = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $maInput));
            if ($cleanMaLS === '') {
                return response()->json([
                    'success' => false,
                    'message' => 'Mã loại sân chỉ được chứa chữ cái không dấu và số viết liền (A-Z, 0-9)!'
                ], 422);
            }
            if (LoaiSan::where('MaLoaiSan', $cleanMaLS)->exists()) {
                return response()->json([
                    'success' => false,
                    'message' => "Mã loại sân [{$cleanMaLS}] đã tồn tại trên hệ thống! Vui lòng chọn mã khác."
                ], 422);
            }
        }

        $tenLoaiSan = trim((string) $request->input('TenLoaiSan', ''));
        if ($tenLoaiSan === '') {
            return response()->json([
                'success' => false,
                'message' => 'Vui lòng nhập Tên loại sân (VD: Sân 5 người, Sân 7 người...)!'
            ], 422);
        }

        if (LoaiSan::whereRaw('LOWER(TenLoaiSan) = ?', [mb_strtolower($tenLoaiSan, 'UTF-8')])->exists()) {
            return response()->json([
                'success' => false,
                'message' => "Tên loại sân \"{$tenLoaiSan}\" đã tồn tại! Vui lòng nhập tên khác."
            ], 422);
        }

        // Nếu bỏ trống Mã loại sân -> Tự sinh mã LS001, LS002...
        if (!$cleanMaLS) {
            $existingCodes = LoaiSan::pluck('MaLoaiSan')->toArray();
            $maxNum = 0;
            foreach ($existingCodes as $code) {
                if (preg_match('/^LS(\d+)$/i', $code, $matches)) {
                    $num = (int) $matches[1];
                    if ($num > $maxNum) $maxNum = $num;
                }
            }
            do {
                $maxNum++;
                $cleanMaLS = 'LS' . str_pad($maxNum, 3, '0', STR_PAD_LEFT);
            } while (in_array($cleanMaLS, $existingCodes));
        }

        $loaiSan = LoaiSan::create([
            'MaLoaiSan'  => $cleanMaLS,
            'TenLoaiSan' => $tenLoaiSan
        ]);

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json([
            'success' => true,
            'message' => "Đã thêm loại sân [{$loaiSan->TenLoaiSan}] (Mã: #{$loaiSan->MaLoaiSan}) thành công!",
            'data'    => $loaiSan
        ], 201);
    }

    /**
     * 3. Cập nhật Loại Sân & Đồng bộ khóa ngoại MaLoaiSan (CHỈ DÀNH CHO ADMIN)
     */
    public function update(Request $request, $id)
    {
        $user = auth()->user();
        if (!$user || $user->VaiTro !== 'Admin') {
            return response()->json([
                'success' => false,
                'message' => 'Truy cập bị từ chối! Chỉ Admin hệ thống mới có quyền chỉnh sửa loại sân.'
            ], 403);
        }

        $loaiSan = LoaiSan::find($id);
        if (!$loaiSan) {
            return response()->json([
                'success' => false,
                'message' => 'Không tìm thấy loại sân cần chỉnh sửa!'
            ], 404);
        }

        $oldId = $loaiSan->MaLoaiSan;
        $newIdInput = $request->input('MaLoaiSan');
        $newId = $oldId;

        if ($newIdInput !== null && trim((string) $newIdInput) !== '') {
            $cleanNewId = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $newIdInput));
            if ($cleanNewId === '') {
                return response()->json([
                    'success' => false,
                    'message' => 'Mã loại sân chỉ được chứa chữ cái không dấu và số viết liền (A-Z, 0-9)!'
                ], 422);
            }
            if ($cleanNewId !== $oldId) {
                if (LoaiSan::where('MaLoaiSan', $cleanNewId)->exists()) {
                    return response()->json([
                        'success' => false,
                        'message' => "Mã loại sân mới [{$cleanNewId}] đã tồn tại! Vui lòng chọn mã khác."
                    ], 422);
                }
                $newId = $cleanNewId;
            }
        }

        $tenLoaiSan = trim((string) $request->input('TenLoaiSan', ''));
        if ($tenLoaiSan === '') {
            return response()->json([
                'success' => false,
                'message' => 'Vui lòng nhập Tên loại sân!'
            ], 422);
        }

        $trungTen = LoaiSan::where('MaLoaiSan', '!=', $oldId)
            ->whereRaw('LOWER(TenLoaiSan) = ?', [mb_strtolower($tenLoaiSan, 'UTF-8')])
            ->exists();
        if ($trungTen) {
            return response()->json([
                'success' => false,
                'message' => "Tên loại sân \"{$tenLoaiSan}\" đã được sử dụng ở mã khác!"
            ], 422);
        }

        DB::beginTransaction();
        try {
            if ($newId !== $oldId) {
                DB::statement('SET FOREIGN_KEY_CHECKS=0');
                DB::table('LoaiSan')->where('MaLoaiSan', $oldId)->update([
                    'MaLoaiSan'  => $newId,
                    'TenLoaiSan' => $tenLoaiSan
                ]);

                // Đồng bộ khóa ngoại MaLoaiSan ở bảng SanBong và GiaTien
                foreach (['SanBong', 'GiaTien'] as $childTable) {
                    if (Schema::hasTable($childTable)) {
                        DB::table($childTable)
                            ->where('MaLoaiSan', $oldId)
                            ->update(['MaLoaiSan' => $newId]);
                    }
                }
                DB::statement('SET FOREIGN_KEY_CHECKS=1');
                $loaiSan = LoaiSan::find($newId);
            } else {
                $loaiSan->update(['TenLoaiSan' => $tenLoaiSan]);
            }

            DB::commit();
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            return response()->json([
                'success' => true,
                'message' => 'Cập nhật thông tin loại sân thành công!',
                'data'    => $loaiSan
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
            return response()->json([
                'success' => false,
                'message' => 'Lỗi cập nhật loại sân: ' . $e->getMessage()
            ], 422);
        }
    }

    /**
     * 4. Xóa Loại Sân (CHỈ DÀNH CHO ADMIN - Chặn xóa nếu đang có Sân con hoặc Bảng giá sử dụng)
     */
    public function destroy($id)
    {
        $user = auth()->user();
        if (!$user || $user->VaiTro !== 'Admin') {
            return response()->json([
                'success' => false,
                'message' => 'Truy cập bị từ chối! Chỉ Admin hệ thống mới có quyền xóa loại sân.'
            ], 403);
        }

        $loaiSan = LoaiSan::find($id);
        if (!$loaiSan) {
            return response()->json([
                'success' => false,
                'message' => 'Không tìm thấy loại sân!'
            ], 404);
        }

        $soSanCon = DB::table('SanBong')->where('MaLoaiSan', $loaiSan->MaLoaiSan)->count();
        $soBangGia = DB::table('GiaTien')->where('MaLoaiSan', $loaiSan->MaLoaiSan)->count();

        if ($soSanCon > 0 || $soBangGia > 0) {
            return response()->json([
                'success' => false,
                'message' => "Không thể xóa loại sân [{$loaiSan->TenLoaiSan}] vì đang có {$soSanCon} sân con và {$soBangGia} cấu hình giá trực thuộc!"
            ], 422);
        }

        $tenDaXoa = $loaiSan->TenLoaiSan;
        $maDaXoa = $loaiSan->MaLoaiSan;
        $loaiSan->delete();

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json([
            'success' => true,
            'message' => "Đã xóa loại sân [{$tenDaXoa}] (#{$maDaXoa}) khỏi hệ thống!"
        ]);
    }
}