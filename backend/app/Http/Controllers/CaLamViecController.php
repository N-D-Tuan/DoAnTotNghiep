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
    public function layDanhSach(Request $request)
    {
        $maCumSan = $request->user()->MaCumSan;
        $cumSan = CumSan::find($maCumSan);

        $allCa = CaLamViec::where('MaCumSan', $maCumSan)
            ->orderBy('GioBatDau', 'asc')
            ->orderBy('MaCaLamViec', 'asc')
            ->get();

        $activeIds = Cache::get("active_shift_ids_cumsan_{$maCumSan}");
        if (!is_array($activeIds) || empty($activeIds)) {
            $activeIds = $allCa->pluck('MaCaLamViec')->toArray();
        }

        if ($request->filled('tu_ngay') && $request->filled('den_ngay') && $request->query('mode') !== 'config') {
            $tuNgay = $request->query('tu_ngay');
            $denNgay = $request->query('den_ngay');
            $snapshotKey = "week_shift_snapshot_data_{$maCumSan}_{$tuNgay}";

            $usedCaIds = LichLamViec::whereHas('caLamViec', function ($q) use ($maCumSan) {
                    $q->where('MaCumSan', $maCumSan);
                })
                ->whereBetween('NgayLam', [$tuNgay, $denNgay])
                ->whereIn('TrangThaiXepLich', ['DaDuyet', 'DangKy'])
                ->pluck('MaCaLamViec')
                ->unique()
                ->toArray();

            if (!empty($usedCaIds)) {
                $savedSnapshot = Cache::get($snapshotKey);
                if (is_array($savedSnapshot) && !empty($savedSnapshot)) {
                    $existingDbIds = $allCa->pluck('MaCaLamViec')->toArray();
                    $validSnapshot = collect($savedSnapshot)
                        ->filter(function ($item) use ($existingDbIds, $usedCaIds) {
                            $id = $item['MaCaLamViec'] ?? $item['ID'] ?? null;
                            return in_array($id, $existingDbIds) || in_array($id, $usedCaIds);
                        })
                        ->unique('TenCa')
                        ->values()
                        ->toArray();

                    if (count($validSnapshot) !== count($savedSnapshot)) {
                        Cache::put($snapshotKey, $validSnapshot, now()->addDays(30));
                    }

                    return response()->json([
                        'success'           => true,
                        'data'              => $validSnapshot,
                        'is_locked_by_week' => true,
                        'gio_mo_cua'        => $cumSan ? substr($cumSan->GioMoCua, 0, 5) : '06:00',
                        'gio_dong_cua'      => $cumSan ? substr($cumSan->GioDongCua, 0, 5) : '22:00',
                    ]);
                }

                $mergedIds = array_unique(array_merge($activeIds, $usedCaIds));
                $caTheoTuan = $allCa->whereIn('MaCaLamViec', $mergedIds)->unique('TenCa')->values();
                Cache::put($snapshotKey, $caTheoTuan->toArray(), now()->addDays(30));

                return response()->json([
                    'success'           => true,
                    'data'              => $caTheoTuan,
                    'is_locked_by_week' => true,
                    'gio_mo_cua'        => $cumSan ? substr($cumSan->GioMoCua, 0, 5) : '06:00',
                    'gio_dong_cua'      => $cumSan ? substr($cumSan->GioDongCua, 0, 5) : '22:00',
                ]);
            } else {
                Cache::forget($snapshotKey);
            }
        }

        $activeShifts = $allCa->whereIn('MaCaLamViec', $activeIds)->values();

        return response()->json([
            'success'           => true,
            'data'              => $activeShifts,
            'is_locked_by_week' => false,
            'gio_mo_cua'        => $cumSan ? substr($cumSan->GioMoCua, 0, 5) : '06:00',
            'gio_dong_cua'      => $cumSan ? substr($cumSan->GioDongCua, 0, 5) : '22:00',
        ]);
    }

    public function luuCauHinhCa(Request $request)
    {
        $maCumSan = $request->user()->MaCumSan;
        $cumSan = CumSan::find($maCumSan);

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

                if ($i === count($shifts) - 1 && $ketThuc !== $dongCua) {
                    return response()->json([
                        'success' => false,
                        'message' => "Ca cuối cùng (\"{$tenCa}\") phải kết thúc đúng giờ đóng cửa của cụm sân ({$dongCua})!"
                    ], 422);
                }
            }

            DB::beginTransaction();
            try {
                $curMonday = \Carbon\Carbon::now()->startOfWeek()->toDateString();
                $curSunday = \Carbon\Carbon::now()->endOfWeek()->toDateString();
                $nextMonday = \Carbon\Carbon::now()->addWeek()->startOfWeek()->toDateString();
                $nextSunday = \Carbon\Carbon::now()->addWeek()->endOfWeek()->toDateString();

                $oldActiveIds = Cache::get("active_shift_ids_cumsan_{$maCumSan}");
                $allCurrentCa = CaLamViec::where('MaCumSan', $maCumSan)
                    ->orderBy('GioBatDau', 'asc')
                    ->orderBy('MaCaLamViec', 'asc')
                    ->get();

                if (!is_array($oldActiveIds) || empty($oldActiveIds)) {
                    $oldActiveIds = $allCurrentCa->pluck('MaCaLamViec')->toArray();
                }
                $oldActiveShiftsArray = $allCurrentCa->whereIn('MaCaLamViec', $oldActiveIds)->values()->toArray();

                $curWeekHasSchedule = LichLamViec::whereHas('caLamViec', fn($q) => $q->where('MaCumSan', $maCumSan))
                    ->whereBetween('NgayLam', [$curMonday, $curSunday])
                    ->whereIn('TrangThaiXepLich', ['DaDuyet', 'DangKy'])
                    ->exists();
                $curSnapshotKey = "week_shift_snapshot_data_{$maCumSan}_{$curMonday}";
                if ($curWeekHasSchedule) {
                    if (!Cache::has($curSnapshotKey)) {
                        Cache::put($curSnapshotKey, $oldActiveShiftsArray, now()->addDays(30));
                    }
                } else {
                    Cache::forget($curSnapshotKey);
                }

                $nextWeekHasSchedule = LichLamViec::whereHas('caLamViec', fn($q) => $q->where('MaCumSan', $maCumSan))
                    ->whereBetween('NgayLam', [$nextMonday, $nextSunday])
                    ->whereIn('TrangThaiXepLich', ['DaDuyet', 'DangKy'])
                    ->exists();
                $nextSnapshotKey = "week_shift_snapshot_data_{$maCumSan}_{$nextMonday}";
                if ($nextWeekHasSchedule) {
                    if (!Cache::has($nextSnapshotKey)) {
                        Cache::put($nextSnapshotKey, $oldActiveShiftsArray, now()->addDays(30));
                    }
                } else {
                    Cache::forget($nextSnapshotKey);
                }

                $newActiveIds = [];

                foreach ($shifts as $s) {
                    $maCa = $s['MaCaLamViec'] ?? $s['ID'] ?? null;
                    $tenCa = trim($s['TenCa']);
                    $gioBD = substr(trim($s['GioBatDau']), 0, 5) . ':00';
                    $gioKT = substr(trim($s['GioKetThuc']), 0, 5) . ':00';

                    $existingCa = CaLamViec::where('MaCumSan', $maCumSan)
                        ->where('TenCa', $tenCa)
                        ->orderBy('MaCaLamViec', 'asc')
                        ->first();

                    if (!$existingCa && $maCa) {
                        $existingCa = CaLamViec::where('MaCumSan', $maCumSan)
                            ->where('MaCaLamViec', $maCa)
                            ->whereNotIn('MaCaLamViec', $newActiveIds)
                            ->first();
                    }

                    if ($existingCa) {
                        $existingCa->update([
                            'TenCa'           => $tenCa,
                            'GioBatDau'       => $gioBD,
                            'GioKetThuc'      => $gioKT,
                            'SoLuongNhanVien' => $s['SoLuongNhanVien'],
                            'LuongThuNgan'    => $s['LuongThuNgan'],
                            'LuongPhucVu'     => $s['LuongPhucVu'],
                        ]);
                        $newActiveIds[] = $existingCa->MaCaLamViec;
                    } else {
                        $created = CaLamViec::create([
                            'MaCumSan'        => $maCumSan,
                            'TenCa'           => $tenCa,
                            'GioBatDau'       => $gioBD,
                            'GioKetThuc'      => $gioKT,
                            'SoLuongNhanVien' => $s['SoLuongNhanVien'],
                            'LuongThuNgan'    => $s['LuongThuNgan'],
                            'LuongPhucVu'     => $s['LuongPhucVu'],
                        ]);
                        $newActiveIds[] = $created->MaCaLamViec;
                    }
                }

                $unusedShifts = CaLamViec::where('MaCumSan', $maCumSan)
                    ->whereNotIn('MaCaLamViec', $newActiveIds)
                    ->get();

                foreach ($unusedShifts as $oldCa) {
                    $hasSchedule = LichLamViec::where('MaCaLamViec', $oldCa->MaCaLamViec)
                        ->whereIn('TrangThaiXepLich', ['DaDuyet', 'DangKy'])
                        ->exists();
                    $hasHandover = DB::table('BanGiaoCa')->where('MaCaLamViec', $oldCa->MaCaLamViec)->exists();

                    if (!$hasSchedule && !$hasHandover) {
                        LichLamViec::where('MaCaLamViec', $oldCa->MaCaLamViec)->delete();
                        $oldCa->delete();
                    }
                }

                Cache::forever("active_shift_ids_cumsan_{$maCumSan}", $newActiveIds);

                DB::commit();
                broadcast(new \App\Events\SystemDataUpdated())->toOthers();

                $msg = ($curWeekHasSchedule || $nextWeekHasSchedule)
                    ? 'Đã lưu cấu hình ca! Tuần đã có nhân viên đăng ký/duyệt lịch sẽ giữ nguyên lịch cũ; cấu hình mới sẽ áp dụng cho tuần trống.'
                    : 'Đã cập nhật cấu hình ca làm việc thành công!';

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