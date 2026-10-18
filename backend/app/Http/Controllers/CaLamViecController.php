<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\CaLamViec;
use App\Models\CumSan;
use App\Models\LichLamViec;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class CaLamViecController extends Controller
{
    // 1. Lấy danh sách ca của Cụm sân (Kiểm tra cả DaDuyet và DangKy cho Tuần Hiện Tại & Tuần Sau)
    public function layDanhSach(Request $request)
    {
        $idCumSan = $request->user()->ID_CumSan;
        $cumSan = CumSan::find($idCumSan);

        $allCa = CaLamViec::where('ID_CumSan', $idCumSan)
            ->orderBy('GioBatDau', 'asc')
            ->orderBy('ID', 'asc')
            ->get();

        // Lấy danh sách ID các ca thuộc "Bộ cấu hình mới nhất" đang kích hoạt
        $activeIds = Cache::get("active_shift_ids_cumsan_{$idCumSan}");
        if (!is_array($activeIds) || empty($activeIds)) {
            $activeIds = $allCa->pluck('ID')->toArray();
        }

        // Nếu truy vấn kèm khoảng ngày của tuần (tu_ngay, den_ngay) và không phải mở Modal cấu hình (mode != config)
        if ($request->filled('tu_ngay') && $request->filled('den_ngay') && $request->query('mode') !== 'config') {
            $tuNgay = $request->query('tu_ngay');
            $denNgay = $request->query('den_ngay');

            // Kiểm tra tuần này đã có ca nào ở trạng thái 'DaDuyet' HOẶC 'DangKy' chưa
            $usedCaIds = LichLamViec::whereHas('caLamViec', function ($q) use ($idCumSan) {
                    $q->where('ID_CumSan', $idCumSan);
                })
                ->whereBetween('NgayLam', [$tuNgay, $denNgay])
                ->whereIn('TrangThaiXepLich', ['DaDuyet', 'DangKy'])
                ->pluck('ID_CaLamViec')
                ->unique()
                ->toArray();

            if (!empty($usedCaIds)) {
                // NẾU TUẦN NÀY ĐÃ CÓ LỊCH (Dù là Đã duyệt hay Nhân viên mới Đăng ký)
                // -> Giữ nguyên bộ ca đang có của tuần đó, không render đè bộ ca mới làm mất/loạn lịch
                $hasOldShift = array_diff($usedCaIds, $activeIds);
                if (!empty($hasOldShift)) {
                    // Tìm toàn bộ bộ ca cùng thế hệ (hoặc các ca đang có lịch trong tuần đó)
                    $snapshotWeekIds = Cache::get("week_shift_snapshot_{$idCumSan}_{$tuNgay}");
                    if (is_array($snapshotWeekIds) && !empty($snapshotWeekIds)) {
                        $mergedOldIds = array_unique(array_merge($snapshotWeekIds, $usedCaIds));
                        $caTheoTuan = $allCa->whereIn('ID', $mergedOldIds)->values();
                    } else {
                        $caTheoTuan = $allCa->whereIn('ID', $usedCaIds)->values();
                    }
                } else {
                    $mergedIds = array_unique(array_merge($activeIds, $usedCaIds));
                    $caTheoTuan = $allCa->whereIn('ID', $mergedIds)->values();
                }

                return response()->json([
                    'success'           => true,
                    'data'              => $caTheoTuan,
                    'is_locked_by_week' => true,
                    'gio_mo_cua'        => $cumSan ? substr($cumSan->GioMoCua, 0, 5) : '06:00',
                    'gio_dong_cua'      => $cumSan ? substr($cumSan->GioDongCua, 0, 5) : '22:00',
                ]);
            }
        }

        // CHỈ KHI TUẦN HOÀN TOÀN TRỐNG (Không có DaDuyet và không có DangKy) -> Render bộ Ca mới nhất
        $activeShifts = $allCa->whereIn('ID', $activeIds)->values();

        return response()->json([
            'success'           => true,
            'data'              => $activeShifts,
            'is_locked_by_week' => false,
            'gio_mo_cua'        => $cumSan ? substr($cumSan->GioMoCua, 0, 5) : '06:00',
            'gio_dong_cua'      => $cumSan ? substr($cumSan->GioDongCua, 0, 5) : '22:00',
        ]);
    }

    // 2. Quản lý lưu danh sách nhiều ca làm việc & giờ giao ca tùy ý
    public function luuCauHinhCa(Request $request)
    {
        $idCumSan = $request->user()->ID_CumSan;
        $cumSan = CumSan::find($idCumSan);

        if (!$cumSan) {
            return response()->json(['success' => false, 'message' => 'Lỗi: Không tìm thấy cụm sân!']);
        }

        if ($request->has('shifts') && is_array($request->shifts)) {
            $shifts = $request->shifts;

            if (count($shifts) < 1) {
                return response()->json(['success' => false, 'message' => 'Vui lòng cấu hình ít nhất 1 ca làm việc!'], 422);
            }

            $moCua = substr($cumSan->GioMoCua, 0, 5);
            $dongCua = substr($cumSan->GioDongCua, 0, 5);

            for ($i = 0; $i < count($shifts); $i++) {
                $s = $shifts[$i];
                $tenCa = trim($s['TenCa'] ?? '');
                $batDau = substr(trim($s['GioBatDau'] ?? ''), 0, 5);
                $ketThuc = substr(trim($s['GioKetThuc'] ?? ''), 0, 5);
                $soLuong = (int) ($s['SoLuongNhanVien'] ?? 0);
                $luongTN = (float) ($s['LuongThuNgan'] ?? -1);
                $luongPV = (float) ($s['LuongPhucVu'] ?? -1);

                if ($tenCa === '' || !$batDau || !$ketThuc || $soLuong < 1 || $luongTN <= 0 || $luongPV <= 0) {
                    return response()->json([
                        'success' => false,
                        'message' => "Vui lòng điền đầy đủ thông tin hợp lệ cho ca thứ " . ($i + 1) . "!"
                    ], 422);
                }

                if ($batDau >= $ketThuc) {
                    return response()->json([
                        'success' => false,
                        'message' => "Ca \"{$tenCa}\": Giờ kết thúc ({$ketThuc}) phải lớn hơn giờ bắt đầu ({$batDau})!"
                    ], 422);
                }

                if ($i === 0 && $batDau !== $moCua) {
                    return response()->json([
                        'success' => false,
                        'message' => "Ca đầu tiên (\"{$tenCa}\") phải bắt đầu từ giờ mở cửa của cụm sân ({$moCua})!"
                    ], 422);
                }

                if ($i > 0) {
                    $prevKetThuc = substr(trim($shifts[$i - 1]['GioKetThuc']), 0, 5);
                    if ($batDau !== $prevKetThuc) {
                        return response()->json([
                            'success' => false,
                            'message' => "Giờ giao ca không khớp: Ca \"{$tenCa}\" phải bắt đầu lúc {$prevKetThuc} (nối tiếp ca trước)!"
                        ], 422);
                    }
                }

                if ($i === count($shifts - 1) && $ketThuc !== $dongCua) {
                    // Đảm bảo kiểm tra ca cuối cùng
                }
                if ($i === count($shifts) - 1 && $ketThuc !== $dongCua) {
                    return response()->json([
                        'success' => false,
                        'message' => "Ca cuối cùng (\"{$tenCa}\") phải kết thúc đúng giờ đóng cửa của cụm sân ({$dongCua})!"
                    ], 422);
                }
            }

            DB::beginTransaction();
            try {
                // Lấy khoảng ngày của Tuần Hiện Tại và Tuần Sau
                $curMonday = \Carbon\Carbon::now()->startOfWeek()->toDateString();
                $curSunday = \Carbon\Carbon::now()->endOfWeek()->toDateString();
                $nextMonday = \Carbon\Carbon::now()->addWeek()->startOfWeek()->toDateString();
                $nextSunday = \Carbon\Carbon::now()->addWeek()->endOfWeek()->toDateString();

                // Lưu lại snapshot bộ ca cũ cho tuần hiện tại / tuần sau nếu tuần đó ĐÃ CÓ LỊCH (DaDuyet hoặc DangKy)
                $oldActiveIds = Cache::get("active_shift_ids_cumsan_{$idCumSan}");
                if (!is_array($oldActiveIds) || empty($oldActiveIds)) {
                    $oldActiveIds = CaLamViec::where('ID_CumSan', $idCumSan)->pluck('ID')->toArray();
                }

                $curWeekHasSchedule = LichLamViec::whereHas('caLamViec', fn($q) => $q->where('ID_CumSan', $idCumSan))
                    ->whereBetween('NgayLam', [$curMonday, $curSunday])
                    ->whereIn('TrangThaiXepLich', ['DaDuyet', 'DangKy'])
                    ->exists();
                if ($curWeekHasSchedule && !Cache::has("week_shift_snapshot_{$idCumSan}_{$curMonday}")) {
                    Cache::put("week_shift_snapshot_{$idCumSan}_{$curMonday}", $oldActiveIds, now()->addDays(30));
                }

                $nextWeekHasSchedule = LichLamViec::whereHas('caLamViec', fn($q) => $q->where('ID_CumSan', $idCumSan))
                    ->whereBetween('NgayLam', [$nextMonday, $nextSunday])
                    ->whereIn('TrangThaiXepLich', ['DaDuyet', 'DangKy'])
                    ->exists();
                if ($nextWeekHasSchedule && !Cache::has("week_shift_snapshot_{$idCumSan}_{$nextMonday}")) {
                    Cache::put("week_shift_snapshot_{$idCumSan}_{$nextMonday}", $oldActiveIds, now()->addDays(30));
                }

                // Danh sách tất cả ID ca đang bận được gắn lịch (DaDuyet hoặc DangKy) ở tuần này hoặc tuần sau
                $busyCaIds = LichLamViec::whereHas('caLamViec', function ($q) use ($idCumSan) {
                        $q->where('ID_CumSan', $idCumSan);
                    })
                    ->whereBetween('NgayLam', [$curMonday, $nextSunday])
                    ->whereIn('TrangThaiXepLich', ['DaDuyet', 'DangKy'])
                    ->pluck('ID_CaLamViec')
                    ->unique()
                    ->toArray();

                $newActiveIds = [];

                foreach ($shifts as $s) {
                    $idCa = isset($s['ID']) && $s['ID'] ? (int) $s['ID'] : null;
                    $tenCa = trim($s['TenCa']);
                    $batDauHHMM = substr(trim($s['GioBatDau']), 0, 5);
                    $ketThucHHMM = substr(trim($s['GioKetThuc']), 0, 5);
                    $gioBD = $batDauHHMM . ':00';
                    $gioKT = $ketThucHHMM . ':00';

                    $existingCa = null;
                    if ($idCa) {
                        $existingCa = CaLamViec::where('ID_CumSan', $idCumSan)->where('ID', $idCa)->first();
                    }

                    // Nếu ca này đang có lịch (DaDuyet hoặc DangKy) VÀ bị đổi Tên ca hoặc đổi Giờ
                    // -> Tách ra tạo bản ghi mới để lịch đang có không bị nhảy giờ/nhảy tên
                    if ($existingCa && in_array($existingCa->ID, $busyCaIds)) {
                        $isTimeOrNameChanged = ($existingCa->TenCa !== $tenCa)
                            || (substr($existingCa->GioBatDau, 0, 5) !== $batDauHHMM)
                            || (substr($existingCa->GioKetThuc, 0, 5) !== $ketThucHHMM);

                        if ($isTimeOrNameChanged) {
                            $existingCa = null;
                        }
                    }

                    if ($existingCa) {
                        // CẬP NHẬT DỮ LIỆU CŨ (Khi không đổi giờ/tên của ca đang có lịch, hoặc chỉ đổi lương/số lượng NV)
                        $existingCa->update([
                            'TenCa'           => $tenCa,
                            'GioBatDau'       => $gioBD,
                            'GioKetThuc'      => $gioKT,
                            'SoLuongNhanVien' => $s['SoLuongNhanVien'],
                            'LuongThuNgan'    => $s['LuongThuNgan'],
                            'LuongPhucVu'     => $s['LuongPhucVu'],
                        ]);
                        $newActiveIds[] = $existingCa->ID;
                    } else {
                        // THÊM DỮ LIỆU MỚI (Khi thêm ca mới hoặc tách ca mới cho tuần trống)
                        $created = CaLamViec::create([
                            'ID_CumSan'       => $idCumSan,
                            'TenCa'           => $tenCa,
                            'GioBatDau'       => $gioBD,
                            'GioKetThuc'      => $gioKT,
                            'SoLuongNhanVien' => $s['SoLuongNhanVien'],
                            'LuongThuNgan'    => $s['LuongThuNgan'],
                            'LuongPhucVu'     => $s['LuongPhucVu'],
                        ]);
                        $newActiveIds[] = $created->ID;
                    }
                }

                // Dọn dẹp các ca cũ không nằm trong bộ mới và chưa từng có bất kỳ lịch (DaDuyet / DangKy) nào
                $oldUnusedShifts = CaLamViec::where('ID_CumSan', $idCumSan)
                    ->whereNotIn('ID', $newActiveIds)
                    ->get();

                foreach ($oldUnusedShifts as $oldCa) {
                    $hasAnySchedule = LichLamViec::where('ID_CaLamViec', $oldCa->ID)
                        ->whereIn('TrangThaiXepLich', ['DaDuyet', 'DangKy'])
                        ->exists();

                    if (!$hasAnySchedule) {
                        LichLamViec::where('ID_CaLamViec', $oldCa->ID)->delete();
                        $oldCa->delete();
                    }
                }

                Cache::forever("active_shift_ids_cumsan_{$idCumSan}", $newActiveIds);

                DB::commit();
                broadcast(new \App\Events\SystemDataUpdated())->toOthers();

                $msg = ($curWeekHasSchedule || $nextWeekHasSchedule)
                    ? 'Đã lưu cấu hình ca! Các tuần đã có nhân viên đăng ký/duyệt lịch sẽ giữ nguyên ca cũ; cấu hình mới sẽ hiển thị ở các tuần trống.'
                    : 'Đã lưu cấu hình ca làm việc và cập nhật lên lịch thành công!';

                return response()->json([
                    'success' => true,
                    'message' => $msg,
                ]);
            } catch (\Exception $e) {
                DB::rollBack();
                return response()->json(['success' => false, 'message' => 'Lỗi lưu cấu hình: ' . $e->getMessage()], 500);
            }
        }

        return response()->json(['success' => false, 'message' => 'Dữ liệu cấu hình không hợp lệ!'], 422);
    }
}