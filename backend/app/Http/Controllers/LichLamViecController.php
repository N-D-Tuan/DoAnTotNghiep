<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use App\Models\NguoiDung;
use App\Models\LichLamViec;
use App\Models\CaLamViec;
use App\Models\ThongBao;
use Carbon\Carbon;

class LichLamViecController extends Controller
{
    public function layLichLamViec(Request $request)
    {
        $maCumSan = $request->user()->MaCumSan;

        $tuNgay = $request->query('tu_ngay', Carbon::now()->startOfWeek()->toDateString());
        $denNgay = $request->query('den_ngay', Carbon::now()->endOfWeek()->toDateString());

        $lichLamViec = LichLamViec::with(['nhanVien:MaNguoiDung,HoTen,VaiTro', 'caLamViec'])
            ->whereHas('caLamViec', function($q) use ($maCumSan) {
                $q->where('MaCumSan', $maCumSan);
            })
            ->whereBetween('NgayLam', [$tuNgay, $denNgay])
            ->get();

        $todayStr = Carbon::now()->toDateString();
        $user = $request->user();
        $quyenKhanCapCuaToi = Cache::get("emergency_reg_{$user->MaNguoiDung}_{$todayStr}", false);

        return response()->json([
            'success'        => true,
            'data'           => $lichLamViec,
            'quyen_khan_cap' => (bool) $quyenKhanCapCuaToi
        ]);
    }

    public function nhanVienDangKyCa(Request $request)
    {
        $user = $request->user();
        $maCaLamViec = $request->input('ma_ca_lam_viec', $request->input('id_ca_lam_viec'));
        $request->merge(['ma_ca_lam_viec_check' => $maCaLamViec]);

        $request->validate([
            'ma_ca_lam_viec_check' => 'required|exists:CaLamViec,MaCaLamViec',
            'ngay_lam'             => 'required|date',
            'ghi_chu'              => 'nullable|string|max:255'
        ]);

        $lich = LichLamViec::where('MaNhanVien', $user->MaNguoiDung)
                           ->where('MaCaLamViec', $maCaLamViec)
                           ->where('NgayLam', $request->ngay_lam)
                           ->first();

        if ($lich) {
            $lich->GhiChu = $request->ghi_chu;
            $lich->save();
        } else {
            $lich = LichLamViec::create([
                'MaCaLamViec'       => $maCaLamViec,
                'MaNhanVien'        => $user->MaNguoiDung,
                'NgayLam'           => $request->ngay_lam,
                'CongViec'          => null,
                'GhiChu'            => $request->ghi_chu,
                'TrangThaiXepLich'  => 'DangKy',
                'TrangThaiDiemDanh' => 'ChuaLam'
            ]);
        }

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Đăng ký ca thành công! Vui lòng chờ duyệt.', 'data' => $lich]);
    }

    public function quanLyTrucTiepXepCa(Request $request)
    {
        $maCaLamViec = $request->input('ma_ca_lam_viec', $request->input('id_ca_lam_viec'));
        $maNhanVien  = $request->input('ma_nhan_vien', $request->input('id_nhan_vien'));
        $request->merge([
            'ma_ca_lam_viec_check' => $maCaLamViec,
            'ma_nhan_vien_check'   => $maNhanVien,
        ]);

        $request->validate([
            'ma_ca_lam_viec_check' => 'required|exists:CaLamViec,MaCaLamViec',
            'ngay_lam'             => 'required|date',
            'ma_nhan_vien_check'   => 'required|exists:NguoiDung,MaNguoiDung',
            'cong_viec'            => 'required|in:ThuNgan,PhucVu',
            'thong_bao_thay_doi'   => 'nullable|boolean'
        ]);

        $todayStr = Carbon::now()->toDateString();
        if ($request->ngay_lam < $todayStr) {
            return response()->json([
                'success' => false,
                'message' => 'Không thể phân công hoặc chỉnh sửa lịch làm việc của ngày đã qua!'
            ], 422);
        }

        $lich = LichLamViec::updateOrCreate(
            [
                'MaCaLamViec' => $maCaLamViec,
                'MaNhanVien'  => $maNhanVien,
                'NgayLam'     => $request->ngay_lam
            ],
            [
                'CongViec'          => $request->cong_viec,
                'TrangThaiXepLich'  => 'DaDuyet',
                'TrangThaiDiemDanh' => 'ChuaLam'
            ]
        );

        if ($request->thong_bao_thay_doi) {
            $quanLyId = $request->user()->MaNguoiDung;
            if ($maNhanVien != $quanLyId) {
                ThongBao::create([
                    'MaNguoiDung'  => $maNhanVien,
                    'TieuDe'       => 'Cập nhật lịch làm việc đột xuất',
                    'NoiDung'      => 'Quản lý vừa xếp bạn vào ca ' . $request->cong_viec . ' ngày ' . $request->ngay_lam,
                    'LoaiThongBao' => 'HeThong'
                ]);
                broadcast(new \App\Events\UserDataUpdated($maNhanVien))->toOthers();
            }
        }

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Đã xếp nhân viên vào lịch thành công!', 'data' => $lich]);
    }

    public function chotLichTuan(Request $request)
    {
        $request->validate([
            'tu_ngay'  => 'required|date',
            'den_ngay' => 'required|date'
        ]);

        $maCumSan = $request->user()->MaCumSan;

        $nhanVienIds = LichLamViec::whereHas('caLamViec', function($q) use ($maCumSan) {
                $q->where('MaCumSan', $maCumSan);
            })
            ->whereBetween('NgayLam', [$request->tu_ngay, $request->den_ngay])
            ->where('TrangThaiXepLich', 'DaDuyet')
            ->pluck('MaNhanVien')
            ->unique();

        $count = 0;
        foreach ($nhanVienIds as $nvId) {
            if ($nvId != $request->user()->MaNguoiDung) {
                ThongBao::create([
                    'MaNguoiDung'  => $nvId,
                    'TieuDe'       => 'Lịch làm việc tuần mới đã chốt',
                    'NoiDung'      => 'Quản lý đã chốt lịch tuần từ ' . date('d/m', strtotime($request->tu_ngay)) . '. Vui lòng kiểm tra ca làm của bạn!',
                    'LoaiThongBao' => 'HeThong'
                ]);
                broadcast(new \App\Events\UserDataUpdated($nvId))->toOthers();
                $count++;
            }
        }

        LichLamViec::whereHas('caLamViec', function($q) use ($maCumSan) {
            $q->where('MaCumSan', $maCumSan);
        })
        ->whereBetween('NgayLam', [$request->tu_ngay, $request->den_ngay])
        ->where('TrangThaiXepLich', 'DangKy')
        ->update(['TrangThaiXepLich' => 'TuChoi']);

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => "Đã chốt lịch và thông báo cho $count nhân viên."]);
    }

    public function nhanVienHuyDangKyCa(Request $request)
    {
        $user = $request->user();
        $maCaLamViec = $request->input('ma_ca_lam_viec', $request->input('id_ca_lam_viec'));
        $maNhanVien  = $request->input('ma_nhan_vien', $request->input('id_nhan_vien'));
        $request->merge(['ma_ca_lam_viec_check' => $maCaLamViec]);

        $request->validate([
            'ma_ca_lam_viec_check' => 'required|exists:CaLamViec,MaCaLamViec',
            'ngay_lam'             => 'required|date'
        ]);

        if (in_array($user->VaiTro, ['Admin', 'QuanLySan']) && !empty($maNhanVien)) {
            if ($request->ngay_lam < Carbon::now()->toDateString()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Ca làm việc đã qua ngày, không thể gỡ nhân sự!'
                ], 422);
            }
            $lich = LichLamViec::where('MaNhanVien', $maNhanVien)
                               ->where('MaCaLamViec', $maCaLamViec)
                               ->where('NgayLam', $request->ngay_lam)
                               ->first();
        } else {
            $lich = LichLamViec::where('MaNhanVien', $user->MaNguoiDung)
                               ->where('MaCaLamViec', $maCaLamViec)
                               ->where('NgayLam', $request->ngay_lam)
                               ->where('TrangThaiXepLich', 'DangKy')
                               ->first();
        }

        if ($lich) {
            if (in_array($user->VaiTro, ['Admin', 'QuanLySan']) && !empty($maNhanVien)) {
                $lich->TrangThaiXepLich = 'TuChoi';
                $lich->CongViec = null;
                $lich->save();

                broadcast(new \App\Events\SystemDataUpdated())->toOthers();
                return response()->json(['success' => true, 'message' => 'Đã gỡ nhân sự khỏi ca làm việc!']);
            } else {
                $lich->delete();
                broadcast(new \App\Events\SystemDataUpdated())->toOthers();
                return response()->json(['success' => true, 'message' => 'Đã hủy đăng ký ca làm việc!']);
            }
        }

        return response()->json(['success' => false, 'message' => 'Không tìm thấy ca làm việc để hủy!']);
    }

    public function nhanVienDiemDanh(Request $request, $id)
    {
        $user = $request->user();

        $lich = LichLamViec::with('caLamViec')
            ->where('MaLichLamViec', $id)
            ->where('MaNhanVien', $user->MaNguoiDung)
            ->where('TrangThaiXepLich', 'DaDuyet')
            ->first();

        if (!$lich) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy ca làm việc hợp lệ.']);
        }

        if ($lich->TrangThaiDiemDanh !== 'ChuaLam') {
            return response()->json(['success' => false, 'message' => 'Ca này đã được điểm danh hoặc đã chốt.']);
        }

        $now = Carbon::now();
        $ngayLam = Carbon::parse($lich->NgayLam);

        if (!$now->isSameDay($ngayLam)) {
            return response()->json(['success' => false, 'message' => 'Chỉ có thể điểm danh trong đúng ngày làm việc.']);
        }

        $gioBatDau = Carbon::parse($lich->NgayLam . ' ' . $lich->caLamViec->GioBatDau);
        $gioKetThuc = Carbon::parse($lich->NgayLam . ' ' . $lich->caLamViec->GioKetThuc);

        if ($gioKetThuc->lessThan($gioBatDau)) {
            $gioKetThuc->addDay();
        }

        $thoiGianChoPhepDiemDanh = $gioBatDau->copy()->subMinutes(30);
        if ($now->lessThan($thoiGianChoPhepDiemDanh)) {
            return response()->json(['success' => false, 'message' => 'Chưa đến giờ nhận ca (Chỉ được nhận ca trước 30 phút).']);
        }

        if ($now->greaterThan($gioKetThuc)) {
            return response()->json(['success' => false, 'message' => 'Ca làm việc đã kết thúc, không thể tự điểm danh.']);
        }

        $soPhutDiMuon = 0;
        if ($now->greaterThan($gioBatDau)) {
            $soPhutDiMuon = $gioBatDau->diffInMinutes($now);
        }

        $lich->TrangThaiDiemDanh = 'DaLam';
        $lich->SoPhutDiMuon = $soPhutDiMuon;
        $lich->save();

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json([
            'success'         => true,
            'message'         => 'Điểm danh nhận ca thành công!',
            'so_phut_di_muon' => $soPhutDiMuon
        ]);
    }

    public function quanLyChotCong(Request $request, $id)
    {
        $request->validate([
            'trang_thai_diem_danh' => 'required|in:ChuaLam,DaLam,VangMat',
            'so_phut_di_muon'      => 'nullable|integer|min:0',
            'tien_phat'            => 'nullable|numeric|min:0',
            'tien_thuong'          => 'nullable|numeric|min:0',
            'ly_do_dieu_chinh'     => 'nullable|string|max:255'
        ]);

        $lich = LichLamViec::find($id);

        if (!$lich) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy ca làm việc.']);
        }

        $lich->TrangThaiDiemDanh = $request->trang_thai_diem_danh;
        $lich->SoPhutDiMuon = $request->so_phut_di_muon ?? 0;
        $lich->TienPhat = $request->tien_phat ?? 0;
        $lich->TienThuong = $request->tien_thuong ?? 0;
        $lich->LyDoDieuChinh = $request->ly_do_dieu_chinh;
        $lich->save();

        if ($request->trang_thai_diem_danh === 'VangMat' || $request->tien_phat > 0 || $request->tien_thuong > 0) {
            ThongBao::create([
                'MaNguoiDung'  => $lich->MaNhanVien,
                'TieuDe'       => 'Cập nhật chấm công',
                'NoiDung'      => 'Quản lý vừa cập nhật trạng thái chấm công ca ' . date('d/m/Y', strtotime($lich->NgayLam)) . ' của bạn.',
                'LoaiThongBao' => 'HeThong'
            ]);
            broadcast(new \App\Events\UserDataUpdated($lich->MaNhanVien))->toOthers();
        }

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Đã cập nhật trạng thái điểm danh.']);
    }

    public function moDangKyKhanCap(Request $request)
    {
        $maNhanVien = $request->input('ma_nhan_vien', $request->input('id_nhan_vien'));
        $request->merge(['ma_nhan_vien_check' => $maNhanVien]);

        $request->validate([
            'ma_nhan_vien_check' => 'required|exists:NguoiDung,MaNguoiDung'
        ]);

        if (Carbon::now()->dayOfWeek !== Carbon::SUNDAY) {
            return response()->json([
                'success' => false,
                'message' => 'Chức năng này chỉ hoạt động vào Chủ Nhật (khi đã hết hạn đăng ký tự do)!'
            ]);
        }

        $todayStr = Carbon::now()->toDateString();

        Cache::put("emergency_reg_{$maNhanVien}_{$todayStr}", true, Carbon::now()->endOfDay());

        ThongBao::create([
            'MaNguoiDung'  => $maNhanVien,
            'TieuDe'       => 'Được mở đăng ký lịch khẩn cấp (1 lần)',
            'NoiDung'      => 'Quản lý vừa mở khóa cho phép bạn đăng ký/chỉnh sửa lịch làm việc tuần sau (1 lượt gửi duy nhất trong hôm nay).',
            'LoaiThongBao' => 'HeThong'
        ]);

        broadcast(new \App\Events\UserDataUpdated($maNhanVien))->toOthers();
        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json([
            'success' => true,
            'message' => 'Đã mở quyền đăng ký khẩn cấp (1 lần) và gửi thông báo cho nhân viên!'
        ]);
    }

    public function hoanTatGuiLichKhanCap(Request $request)
    {
        $user = $request->user();
        $todayStr = Carbon::now()->toDateString();
        $cacheKey = "emergency_reg_{$user->MaNguoiDung}_{$todayStr}";

        if (Cache::has($cacheKey)) {
            Cache::forget($cacheKey);

            $managers = NguoiDung::where('VaiTro', 'QuanLySan')
                ->where('MaCumSan', $user->MaCumSan)
                ->get();
            foreach ($managers as $mgr) {
                ThongBao::create([
                    'MaNguoiDung'  => $mgr->MaNguoiDung,
                    'TieuDe'       => 'Nhân viên đã gửi lịch bổ sung',
                    'NoiDung'      => "Nhân viên {$user->HoTen} đã hoàn tất gửi lịch làm việc tuần sau từ lượt mở khẩn cấp.",
                    'LoaiThongBao' => 'HeThong'
                ]);
                broadcast(new \App\Events\UserDataUpdated($mgr->MaNguoiDung))->toOthers();
            }
        }

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true]);
    }

    public function trangThaiKhanCapTuanSau(Request $request)
    {
        $maCumSan = $request->user()->MaCumSan;
        $todayStr = Carbon::now()->toDateString();

        $staffIds = NguoiDung::where('MaCumSan', $maCumSan)
            ->where('VaiTro', 'NhanVien')
            ->pluck('MaNguoiDung');

        $unlockedIds = [];
        foreach ($staffIds as $id) {
            if (Cache::get("emergency_reg_{$id}_{$todayStr}", false)) {
                $unlockedIds[] = $id;
            }
        }

        return response()->json(['success' => true, 'unlocked_ids' => $unlockedIds]);
    }
}