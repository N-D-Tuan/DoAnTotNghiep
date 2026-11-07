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
     * Tự động cập nhật dây chuyền (Cascade) khóa chính sang toàn bộ các bảng con có khóa ngoại tham chiếu
     * và bảng personal_access_tokens (nếu đổi MaNguoiDung)
     */
    private static function cascadeUpdatePrimaryKey(string $table, string $pkCol, string $oldVal, string $newVal): int
    {
        $dbName = DB::connection()->getDatabaseName();

        // Tìm tất cả các bảng và cột khóa ngoại trong CSDL đang tham chiếu tới ($table, $pkCol)
        $references = DB::select("
            SELECT TABLE_NAME as table_name, COLUMN_NAME as column_name
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = ?
              AND REFERENCED_TABLE_NAME = ?
              AND REFERENCED_COLUMN_NAME = ?
        ", [$dbName, $table, $pkCol]);

        $affectedChildren = 0;

        // Tắt kiểm tra khóa ngoại tạm thời trong phiên kết nối để đổi cả bảng cha lẫn bảng con mượt mà
        DB::statement('SET FOREIGN_KEY_CHECKS=0');
        try {
            foreach ($references as $ref) {
                $childTable = $ref->table_name;
                $childCol   = $ref->column_name;
                $affectedChildren += DB::table($childTable)
                    ->where($childCol, $oldVal)
                    ->update([$childCol => $newVal]);
            }

            // Nếu đổi MaNguoiDung thì cập nhật luôn tokenable_id trong bảng personal_access_tokens
            if ($table === 'NguoiDung' && $pkCol === 'MaNguoiDung' && Schema::hasTable('personal_access_tokens')) {
                DB::table('personal_access_tokens')
                    ->where('tokenable_id', $oldVal)
                    ->update(['tokenable_id' => $newVal]);
            }
        } finally {
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
        }

        return $affectedChildren;
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
            if ($col === 'HinhAnh' && $request->hasFile('HinhAnh')) {
                $folder = ($table === 'CumSan') ? 'cumsan' : strtolower($table);
                $path = $request->file('HinhAnh')->store($folder, 'public');
                $payload['HinhAnh'] = '/storage/' . $path;
            } elseif ($request->has($col)) {
                $val = $request->input($col);
                $payload[$col] = ($val === '' || $val === null) ? null : $val;
            }
        }

        // Xử lý khóa chính đơn: Nếu để trống thì tự sinh, nếu có nhập thì chuẩn hóa IN HOA viết liền (A-Z0-9) và kiểm tra trùng
        if (count($cfg['pk']) === 1) {
            $pkCol = $cfg['pk'][0];
            if (empty($payload[$pkCol]) && $cfg['prefix']) {
                $payload[$pkCol] = self::generateNextId($table, $pkCol, $cfg['prefix']);
            } elseif (!empty($payload[$pkCol])) {
                $cleanId = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $payload[$pkCol]));
                if ($cleanId === '') {
                    return response()->json(['success' => false, 'message' => "Mã khóa chính {$pkCol} chỉ được chứa chữ cái không dấu và số viết liền (A-Z, 0-9)!"], 422);
                }
                if (DB::table($table)->where($pkCol, $cleanId)->exists()) {
                    return response()->json(['success' => false, 'message' => "Mã khóa chính [{$cleanId}] đã tồn tại trong bảng {$table}! Vui lòng chọn mã khác."], 422);
                }
                $payload[$pkCol] = $cleanId;
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
     * 3. Cập nhật bản ghi (UPDATE) — Hỗ trợ đổi luôn cả Mã Khóa Chính và tự động cập nhật Khóa Ngoại ở các bảng con
     */
    public function update(Request $request, string $table)
    {
        $configs = self::getTableConfigs();
        if (!isset($configs[$table]) || !Schema::hasTable($table)) {
            return response()->json(['success' => false, 'message' => "Bảng {$table} không tồn tại!"], 404);
        }

        $cfg = $configs[$table];
        $pkValues = $request->input('_pk', []);
        if (is_string($pkValues)) {
            $pkValues = json_decode($pkValues, true) ?? [];
        }
        if (empty($pkValues)) {
            return response()->json(['success' => false, 'message' => 'Thiếu thông tin khóa chính để cập nhật!'], 400);
        }

        $columns = Schema::getColumnListing($table);
        $data = $request->input('data', []);
        if (is_string($data)) {
            $data = json_decode($data, true) ?? [];
        }
        if (empty($data)) {
            $data = $request->except(['_pk', '_method']);
        }
        $payload = [];

        foreach ($columns as $col) {
            if ($col === 'HinhAnh' && $request->hasFile('HinhAnh')) {
                $folder = ($table === 'CumSan') ? 'cumsan' : strtolower($table);
                $path = $request->file('HinhAnh')->store($folder, 'public');
                $payload['HinhAnh'] = '/storage/' . $path;
            } elseif (array_key_exists($col, $data)) {
                $val = $data[$col];
                if ($col === 'HinhAnh' && ($val === '' || $val === null)) {
                    continue;
                }
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

        DB::beginTransaction();
        try {
            $cascadeMsg = '';

            // Kiểm tra nếu người dùng thay đổi Mã Khóa Chính (trên bảng có khóa chính đơn)
            if (count($cfg['pk']) === 1) {
                $pkCol  = $cfg['pk'][0];
                $oldPk  = (string) ($pkValues[$pkCol] ?? '');
                $newRaw = isset($payload[$pkCol]) ? trim((string) $payload[$pkCol]) : $oldPk;

                if ($newRaw === '') {
                    $payload[$pkCol] = $oldPk;
                } else {
                    $newPk = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $newRaw));
                    if ($newPk === '') {
                        DB::rollBack();
                        return response()->json(['success' => false, 'message' => "Mã khóa chính {$pkCol} chỉ được chứa chữ cái không dấu và số viết liền (A-Z, 0-9)!"], 422);
                    }

                    if ($newPk !== $oldPk) {
                        // Bảo vệ mã ND001 của Admin tối cao
                        if ($table === 'NguoiDung' && strtoupper($oldPk) === 'ND001') {
                            DB::rollBack();
                            return response()->json(['success' => false, 'message' => 'Mã ND001 là tài khoản Admin tối cao mặc định của hệ thống, không được phép đổi mã!'], 422);
                        }

                        // Kiểm tra trùng mã mới trong bảng hiện tại
                        if (DB::table($table)->where($pkCol, $newPk)->exists()) {
                            DB::rollBack();
                            return response()->json(['success' => false, 'message' => "Mã khóa chính mới [{$newPk}] đã tồn tại trong bảng {$table}! Vui lòng chọn mã khác."], 422);
                        }

                        $payload[$pkCol] = $newPk;

                        // Tắt kiểm tra khóa ngoại tạm thời, cập nhật cả bảng gốc và các bảng con
                        DB::statement('SET FOREIGN_KEY_CHECKS=0');
                        DB::table($table)->where($pkCol, $oldPk)->update($payload);
                        DB::statement('SET FOREIGN_KEY_CHECKS=1');

                        $updatedChildCount = self::cascadeUpdatePrimaryKey($table, $pkCol, $oldPk, $newPk);
                        $cascadeMsg = " (Đã đổi mã [{$oldPk}] -> [{$newPk}] và tự động đồng bộ {$updatedChildCount} bản ghi khóa ngoại liên quan)";

                        DB::commit();
                        return response()->json([
                            'success' => true,
                            'message' => "Đã cập nhật bản ghi trong bảng {$table} thành công!{$cascadeMsg}"
                        ]);
                    }
                }
            }

            // Trường hợp giữ nguyên khóa chính, chỉ cập nhật các cột thông thường
            $query = DB::table($table);
            foreach ($cfg['pk'] as $pkCol) {
                $query->where($pkCol, $pkValues[$pkCol] ?? null);
            }
            $query->update($payload);

            DB::commit();
            return response()->json([
                'success' => true,
                'message' => "Đã cập nhật bản ghi trong bảng {$table} thành công!"
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
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