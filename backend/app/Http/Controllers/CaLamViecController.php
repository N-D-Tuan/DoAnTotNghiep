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
            $snapshotKey = "week_shift_snapshot_data_{$idCumSan}_{$tuNgay}";

            // Kiểm tra tuần này đã có bất kỳ ca nào ở trạng thái 'DaDuyet' HOẶC 'DangKy' chưa
            $usedCaIds = LichLamViec::whereHas('caLamViec', function ($q) use ($idCumSan) {
                    $q->where('ID_CumSan', $idCumSan);
                })
                ->whereBetween('NgayLam', [$tuNgay, $denNgay])
                ->whereIn('TrangThaiXepLich', ['DaDuyet', 'DangKy'])
                ->pluck('ID_CaLamViec')
                ->unique()
                ->toArray();

            if (!empty($usedCaIds)) {
                // TUẦN NÀY ĐÃ CÓ NHÂN VIÊN ĐĂNG KÝ HOẶC ĐÃ DUYỆT LỊCH
                // 1. Nếu đã có bản chụp (Snapshot) bộ ca của tuần này trước khi Quản lý sửa
                $savedSnapshot = Cache::get($snapshotKey);
                if (is_array($savedSnapshot) && !empty($savedSnapshot)) {
                    // Lọc bỏ các dòng bị trùng Tên ca trong Snapshot cũ và chỉ giữ các ca còn tồn tại hoặc đang có lịch
                    $existingDbIds = $allCa->pluck('ID')->toArray();
                    $validSnapshot = collect($savedSnapshot)
                        ->filter(function ($item) use ($existingDbIds, $usedCaIds) {
                            $id = $item['ID'] ?? null;
                            return in_array($id, $existingDbIds) || in_array($id, $usedCaIds);
                        })
                        ->unique('TenCa')
                        ->values()
                        ->toArray();

                    // Nếu Snapshot cũ bị dính dữ liệu rác trước đây -> Tự động cập nhật lại Snapshot sạch
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

                // 2. Nếu chưa có bản chụp (tức là Quản lý chưa sửa cấu hình kể từ lúc nhân viên đăng ký)
                // -> Lấy bộ ca hiện hành + các ca đang được đăng ký và lưu làm Snapshot cố định cho tuần này luôn
                $mergedIds = array_unique(array_merge($activeIds, $usedCaIds));
                $caTheoTuan = $allCa->whereIn('ID', $mergedIds)->unique('TenCa')->values();
                Cache::put($snapshotKey, $caTheoTuan->toArray(), now()->addDays(30));

                return response()->json([
                    'success'           => true,
                    'data'              => $caTheoTuan,
                    'is_locked_by_week' => true,
                    'gio_mo_cua'        => $cumSan ? substr($cumSan->GioMoCua, 0, 5) : '06:00',
                    'gio_dong_cua'      => $cumSan ? substr($cumSan->GioDongCua, 0, 5) : '22:00',
                ]);
            } else {
                // NẾU TUẦN NÀY HOÀN TOÀN TRỐNG (Nhân viên đã hủy hết đăng ký hoặc chưa ai đăng ký)
                // -> Xóa Snapshot cũ (nếu có) để tuần này nhận ngay bộ Ca làm việc mới nhất!
                Cache::forget($snapshotKey);
            }
        }

        // TUẦN HOÀN TOÀN TRỐNG HOẶC MỞ MODAL CẤU HÌNH -> Render bộ Ca mới nhất
        $activeShifts = $allCa->whereIn('ID', $activeIds)->values();

        return response()->json([
            'success'           => true,
            'data'              => $activeShifts,
            'is_locked_by_week' => false,
            'gio_mo_cua'        => $cumSan ? substr($cumSan->GioMoCua, 0, 5) : '06:00',
            'gio_dong_cua'      => $cumSan ? substr($cumSan->GioDongCua, 0, 5) : '22:00',
        ]);
    }

    // 2. Quản lý lưu cấu hình ca: Chỉnh sửa theo ID_CumSan & TenCa, không sinh dòng trùng lặp
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

                // Lấy bộ ca ĐANG HIỆN HÀNH TRƯỚC KHI SỬA để đóng băng (Snapshot) cho tuần nào đã có lịch
                $oldActiveIds = Cache::get("active_shift_ids_cumsan_{$idCumSan}");
                $allCurrentCa = CaLamViec::where('ID_CumSan', $idCumSan)
                    ->orderBy('GioBatDau', 'asc')
                    ->orderBy('ID', 'asc')
                    ->get();

                if (!is_array($oldActiveIds) || empty($oldActiveIds)) {
                    $oldActiveIds = $allCurrentCa->pluck('ID')->toArray();
                }
                $oldActiveShiftsArray = $allCurrentCa->whereIn('ID', $oldActiveIds)->values()->toArray();

                // Kiểm tra Tuần Hiện Tại: Nếu đã có DaDuyet hoặc DangKy thì khóa Snapshot bộ ca cũ lại
                $curWeekHasSchedule = LichLamViec::whereHas('caLamViec', fn($q) => $q->where('ID_CumSan', $idCumSan))
                    ->whereBetween('NgayLam', [$curMonday, $curSunday])
                    ->whereIn('TrangThaiXepLich', ['DaDuyet', 'DangKy'])
                    ->exists();
                $curSnapshotKey = "week_shift_snapshot_data_{$idCumSan}_{$curMonday}";
                if ($curWeekHasSchedule) {
                    if (!Cache::has($curSnapshotKey)) {
                        Cache::put($curSnapshotKey, $oldActiveShiftsArray, now()->addDays(30));
                    }
                } else {
                    Cache::forget($curSnapshotKey);
                }

                // Kiểm tra Tuần Sau: Nếu đã có DaDuyet hoặc DangKy thì khóa Snapshot bộ ca cũ lại ngay từ lần sửa đầu tiên!
                $nextWeekHasSchedule = LichLamViec::whereHas('caLamViec', fn($q) => $q->where('ID_CumSan', $idCumSan))
                    ->whereBetween('NgayLam', [$nextMonday, $nextSunday])
                    ->whereIn('TrangThaiXepLich', ['DaDuyet', 'DangKy'])
                    ->exists();
                $nextSnapshotKey = "week_shift_snapshot_data_{$idCumSan}_{$nextMonday}";
                if ($nextWeekHasSchedule) {
                    if (!Cache::has($nextSnapshotKey)) {
                        Cache::put($nextSnapshotKey, $oldActiveShiftsArray, now()->addDays(30));
                    }
                } else {
                    Cache::forget($nextSnapshotKey);
                }

                // CẬP NHẬT HOẶC THÊM MỚI CA LÀM VIỆC THEO (ID_CumSan + TenCa) HOẶC ID
                $newActiveIds = [];

                foreach ($shifts as $s) {
                    $idCa = isset($s['ID']) && $s['ID'] ? (int) $s['ID'] : null;
                    $tenCa = trim($s['TenCa']);
                    $gioBD = substr(trim($s['GioBatDau']), 0, 5) . ':00';
                    $gioKT = substr(trim($s['GioKetThuc']), 0, 5) . ':00';

                    // 1. Ưu tiên tìm theo ID_CumSan và TenCa (để tái sử dụng ca cùng tên, không sinh dòng mới)
                    $existingCa = CaLamViec::where('ID_CumSan', $idCumSan)
                        ->where('TenCa', $tenCa)
                        ->orderBy('ID', 'asc')
                        ->first();

                    // 2. Nếu đổi tên ca từ một ca cũ đang chọn (có ID) và tên mới chưa tồn tại
                    if (!$existingCa && $idCa) {
                        $existingCa = CaLamViec::where('ID_CumSan', $idCumSan)
                            ->where('ID', $idCa)
                            ->whereNotIn('ID', $newActiveIds)
                            ->first();
                    }

                    if ($existingCa) {
                        // Chỉnh sửa trực tiếp dữ liệu cũ
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
                        // Chỉ tạo mới khi thực sự là ca mới (chưa có TenCa này trong Cụm sân)
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

                // Dọn dẹp các dòng CaLamViec thừa/trùng lặp không nằm trong bộ mới (nếu chưa có lịch sử gắn vào)
                $unusedShifts = CaLamViec::where('ID_CumSan', $idCumSan)
                    ->whereNotIn('ID', $newActiveIds)
                    ->get();

                foreach ($unusedShifts as $oldCa) {
                    $hasSchedule = LichLamViec::where('ID_CaLamViec', $oldCa->ID)
                        ->whereIn('TrangThaiXepLich', ['DaDuyet', 'DangKy'])
                        ->exists();
                    $hasHandover = DB::table('BanGiaoCa')->where('ID_CaLamViec', $oldCa->ID)->exists();

                    if (!$hasSchedule && !$hasHandover) {
                        LichLamViec::where('ID_CaLamViec', $oldCa->ID)->delete();
                        $oldCa->delete();
                    }
                }

                Cache::forever("active_shift_ids_cumsan_{$idCumSan}", $newActiveIds);

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