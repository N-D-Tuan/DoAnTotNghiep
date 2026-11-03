<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

class DatabaseFormController extends Controller
{
    /**
     * Danh sách 20 bảng hiện có trong CSDL DN Football và cấu hình Khóa chính + Tiền tố tự tăng
     */
    private static function getTableConfigs(): array
    {
        return [
            'Phuong'          => ['pk' => ['MaPhuong'],          'prefix' => 'P'],
            'LoaiSan'         => ['pk' => ['MaLoaiSan'],         'prefix' => 'LS'],
            'KhungGio'        => ['pk' => ['MaKhungGio'],        'prefix' => 'KG'],
            'CumSan'          => ['pk' => ['MaCumSan'],          'prefix' => 'CS'],
            'NguoiDung'       => ['pk' => ['MaNguoiDung'],       'prefix' => 'ND'],
            'SanBong'         => ['pk' => ['MaSanBong'],         'prefix' => 'SB'],
            'GiaTien'         => ['pk' => ['MaGiaTien'],         'prefix' => 'GT'],
            'KhuyenMai'       => ['pk' => ['MaKhuyenMai'],       'prefix' => 'KM'],
            'GiaiDau'         => ['pk' => ['MaGiaiDau'],         'prefix' => 'GDAU'],
            'GiaoDich'        => ['pk' => ['MaGiaoDich'],        'prefix' => 'GD'],
            'HoaDonDatSan'    => ['pk' => ['MaHoaDonDatSan'],    'prefix' => 'HDDS'],
            'DatSan'          => ['pk' => ['MaDatSan'],          'prefix' => 'DS'],
            'ChiTietHoaDon'   => ['pk' => ['MaHoaDonDatSan', 'MaDatSan'], 'prefix' => null],
            'YeuCauHuyGap'    => ['pk' => ['MaYeuCauHuyGap'],    'prefix' => 'YCHG'],
            'DanhGia'         => ['pk' => ['MaDanhGia'],         'prefix' => 'DG'],
            'ThongBao'        => ['pk' => ['MaThongBao'],        'prefix' => 'TB'],
            'PhienChat'       => ['pk' => ['MaPhienChat'],       'prefix' => 'PC'],
            'TinNhan'         => ['pk' => ['MaTinNhan'],         'prefix' => 'TN'],
            'CaLamViec'       => ['pk' => ['MaCaLamViec'],       'prefix' => 'CLV'],
            'LichLamViec'     => ['pk' => ['MaLichLamViec'],     'prefix' => 'LLV'],
        ];
    }

    /**
     * Tự động sinh mã tiếp theo (VD: P001 -> P002, HDDS015 -> HDDS016) nếu người dùng để trống ô khóa chính
     */
    private static function generateNextId(string $table, string $pkCol, string $prefix): string
    {
        $rows = DB::table($table)->pluck($pkCol);
        $maxNum = 0;
        foreach ($rows as $val) {
            if (preg_match('/^' . preg_quote($prefix, '/') . '(\d+)$/i', (string) $val, $m)) {
                $num = (int) $m[1];
                if ($num > $maxNum) {
                    $maxNum = $num;
                }
            }
        }
        return $prefix . str_pad((string) ($maxNum + 1), 3, '0', STR_PAD_LEFT);
    }

    /**
     * 1. Lấy tổng số bản ghi của toàn bộ 20 bảng và dữ liệu của bảng đang chọn
     */
    public function index(Request $request)
    {
        $configs = self::getTableConfigs();
        $counts = [];

        foreach ($configs as $tableName => $cfg) {
            $counts[$tableName] = Schema::hasTable($tableName) ? DB::table($tableName)->count() : 0;
        }

        $activeTable = $request->query('table', 'Phuong');
        if (!isset($configs[$activeTable])) {
            $activeTable = 'Phuong';
        }

        $rows = [];
        if (Schema::hasTable($activeTable)) {
            $pkFirst = $configs[$activeTable]['pk'][0];
            $rows = DB::table($activeTable)->orderBy($pkFirst, 'asc')->limit(500)->get();
        }

        return response()->json([
            'success'      => true,
            'counts'       => $counts,
            'active_table' => $activeTable,
            'rows'         => $rows,
        ]);
    }

    /**
     * 2. Thêm mới bản ghi (INSERT)
     */
    public function store(Request $request, string $table)
    {
        $configs = self::getTableConfigs();
        if (!isset($configs[$table]) || !Schema::hasTable($table)) {
            return response()->json(['success' => false, 'message' => "Bảng {$table} không tồn tại!"], 404);
        }

        $cfg = $configs[$table];
        $columns = Schema::getColumnListing($table);
        $payload = [];

        foreach ($columns as $col) {
            if ($request->has($col)) {
                $val = $request->input($col);
                $payload[$col] = ($val === '' || $val === null) ? null : $val;
            }
        }

        // Nếu bảng có khóa chính đơn và người dùng bỏ trống -> Tự sinh mã tiếp theo
        if (count($cfg['pk']) === 1 && $cfg['prefix']) {
            $pkCol = $cfg['pk'][0];
            if (empty($payload[$pkCol])) {
                $payload[$pkCol] = self::generateNextId($table, $pkCol, $cfg['prefix']);
            }
        }

        // Băm mật khẩu tự động nếu thêm mới NguoiDung mà mật khẩu chưa được hash
        if ($table === 'NguoiDung' && !empty($payload['MatKhau']) && !str_starts_with($payload['MatKhau'], '$2y$')) {
            $payload['MatKhau'] = Hash::make($payload['MatKhau']);
        }

        // Loại bỏ các trường timestamp có default CURRENT_TIMESTAMP nếu để trống
        foreach (['NgayTao', 'NgayCapNhat', 'NgayNhap'] as $tsCol) {
            if (array_key_exists($tsCol, $payload) && $payload[$tsCol] === null) {
                unset($payload[$tsCol]);
            }
        }

        try {
            DB::table($table)->insert($payload);
            return response()->json([
                'success' => true,
                'message' => "Đã thêm bản ghi mới vào bảng {$table} thành công!"
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Lỗi MySQL: ' . $e->getMessage()
            ], 422);
        }
    }

    /**
     * 3. Cập nhật bản ghi (UPDATE)
     */
    public function update(Request $request, string $table)
    {
        $configs = self::getTableConfigs();
        if (!isset($configs[$table]) || !Schema::hasTable($table)) {
            return response()->json(['success' => false, 'message' => "Bảng {$table} không tồn tại!"], 404);
        }

        $cfg = $configs[$table];
        $pkValues = $request->input('_pk', []);
        if (empty($pkValues)) {
            return response()->json(['success' => false, 'message' => 'Thiếu thông tin khóa chính để cập nhật!'], 400);
        }

        $columns = Schema::getColumnListing($table);
        $data = $request->input('data', []);
        $payload = [];

        foreach ($columns as $col) {
            if (array_key_exists($col, $data)) {
                $val = $data[$col];
                $payload[$col] = ($val === '' || $val === null) ? null : $val;
            }
        }

        if ($table === 'NguoiDung' && array_key_exists('MatKhau', $payload)) {
            if (empty($payload['MatKhau'])) {
                unset($payload['MatKhau']); // Giữ nguyên mật khẩu cũ nếu để trống khi sửa
            } elseif (!str_starts_with($payload['MatKhau'], '$2y$')) {
                $payload['MatKhau'] = Hash::make($payload['MatKhau']);
            }
        }

        try {
            $query = DB::table($table);
            foreach ($cfg['pk'] as $pkCol) {
                $query->where($pkCol, $pkValues[$pkCol] ?? null);
            }
            $query->update($payload);

            return response()->json([
                'success' => true,
                'message' => "Đã cập nhật bản ghi trong bảng {$table} thành công!"
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Lỗi MySQL: ' . $e->getMessage()
            ], 422);
        }
    }

    /**
     * 4. Xóa bản ghi (DELETE)
     */
    public function destroy(Request $request, string $table)
    {
        $configs = self::getTableConfigs();
        if (!isset($configs[$table]) || !Schema::hasTable($table)) {
            return response()->json(['success' => false, 'message' => "Bảng {$table} không tồn tại!"], 404);
        }

        $cfg = $configs[$table];
        $pkValues = $request->input('_pk', []);

        try {
            $query = DB::table($table);
            foreach ($cfg['pk'] as $pkCol) {
                $query->where($pkCol, $pkValues[$pkCol] ?? null);
            }
            $query->delete();

            return response()->json([
                'success' => true,
                'message' => "Đã xóa dòng dữ liệu khỏi bảng {$table}!"
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Không thể xóa (có thể do ràng buộc khóa ngoại): ' . $e->getMessage()
            ], 422);
        }
    }
}