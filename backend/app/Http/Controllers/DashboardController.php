<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\DatSan;
use App\Models\GiaiDau;
use App\Models\NguoiDung;
use App\Models\YeuCauHuyGap;
use App\Models\LichLamViec;
use Carbon\Carbon;

class DashboardController extends Controller
{
    /**
     * Hàm phụ trợ tính chi phí nhân sự của 1 ca làm việc đã điểm danh ('DaLam')
     * Dựa trên bảng LichLamViec + CaLamViec (vì đã bỏ bảng BangLuong, PhieuNhapHang, ChiPhiPhatSinh)
     */
    private function tinhChiPhiCaLam($lich)
    {
        if ($lich->TrangThaiDiemDanh !== 'DaLam') {
            return 0;
        }
        $ca = $lich->caLamViec;
        $luongCa = 0;
        if ($ca) {
            $luongCa = ($lich->CongViec === 'ThuNgan')
                ? (float) $ca->LuongThuNgan
                : (float) $ca->LuongPhucVu;
        }
        $thuong = (float) ($lich->TienThuong ?? 0);
        $phat   = (float) ($lich->TienPhat ?? 0);

        return max(0, $luongCa + $thuong - $phat);
    }

    public function layThongKe(Request $request)
    {
        $today = Carbon::today();
        $userDangNhap = auth()->user();
        $isQuanLy = $userDangNhap->VaiTro === 'QuanLySan';

        $idCumSan = $isQuanLy ? $userDangNhap->MaCumSan : ($request->input('ma_cum_san', $request->input('id_cum_san', 'all')));
        $timeFilter = $request->time_filter ?? 'hom_nay';

        // 1. DOANH THU HÔM NAY (Chỉ tính các trận HoanThanh lấy TongTien, KhongDen lấy TienCoc)
        $queryDatSansHomNay = DatSan::whereDate('NgayDa', $today)
            ->whereIn('TrangThai', ['HoanThanh', 'KhongDen']);

        if ($idCumSan !== 'all') {
            $queryDatSansHomNay->whereHas('sanBong', function ($q) use ($idCumSan) {
                $q->where('MaCumSan', $idCumSan);
            });
        }

        $doanhThuHomNay = 0;
        foreach ($queryDatSansHomNay->get() as $ds) {
            $doanhThuHomNay += ($ds->TrangThai === 'HoanThanh') ? (float) $ds->TongTien : (float) $ds->TienCoc;
        }

        // 2. TỔNG BOOKING ĐÁ TRONG HÔM NAY
        $queryBookingHoanThanh = DatSan::where('TrangThai', 'HoanThanh')->whereDate('NgayDa', $today);
        $queryBookingTong = DatSan::whereIn('TrangThai', ['HoanThanh', 'KhongDen'])->whereDate('NgayDa', $today);

        if ($idCumSan !== 'all') {
            $queryBookingHoanThanh->whereHas('sanBong', function ($q) use ($idCumSan) {
                $q->where('MaCumSan', $idCumSan);
            });
            $queryBookingTong->whereHas('sanBong', function ($q) use ($idCumSan) {
                $q->where('MaCumSan', $idCumSan);
            });
        }

        $bookingHoanThanhHomNay = $queryBookingHoanThanh->count();
        $bookingHomNay = $queryBookingTong->count();

        // 3. TỔNG KHÁCH HÀNG
        if ($isQuanLy) {
            $tongKhachHang = DatSan::whereHas('sanBong', function ($q) use ($idCumSan) {
                    $q->where('MaCumSan', $idCumSan);
                })
                ->whereNotNull('MaNguoiDung')
                ->distinct('MaNguoiDung')
                ->count('MaNguoiDung');
        } else {
            $tongKhachHang = NguoiDung::where('VaiTro', 'KhachHang')->count();
        }

        // 4. SỐ YÊU CẦU ĐANG CHỜ DUYỆT (Giải đấu + Yêu cầu hủy sân gấp)
        $queryGiaiDau = GiaiDau::where('TrangThai', 'ChoDuyet');
        $queryHuyGap = YeuCauHuyGap::where('TrangThai', 'ChoDuyet');

        if ($idCumSan !== 'all') {
            $queryGiaiDau->where('MaCumSan', $idCumSan);
            $queryHuyGap->whereHas('datSan.sanBong', function ($q) use ($idCumSan) {
                $q->where('MaCumSan', $idCumSan);
            });
        }

        $tongChoDuyet = $queryGiaiDau->count() + $queryHuyGap->count();

        // 5. SỐ SÂN QUÊN CHỐT
        $queryQuenChot = DatSan::where('TrangThai', 'DaCoc')->whereDate('NgayDa', '<', $today);
        if ($isQuanLy) {
            $queryQuenChot->whereHas('sanBong', function ($q) use ($idCumSan) {
                $q->where('MaCumSan', $idCumSan);
            });
        }
        $soSanQuenChot = $queryQuenChot->count();

        // 6. BIỂU ĐỒ DOANH THU (ĐẶT SÂN) & CHI PHÍ (CA LÀM NHÂN VIÊN)
        $doanhThuChart = [];
        $chiPhiChart = [];

        if ($timeFilter === 'hom_nay' || $timeFilter === 'hom_truoc') {
            $targetDate = $timeFilter === 'hom_nay' ? Carbon::today() : Carbon::yesterday();

            for ($i = 0; $i < 24; $i++) {
                $timeKey = sprintf("%02d:00", $i);
                $doanhThuChart[$timeKey] = 0;
                $chiPhiChart[$timeKey] = 0;
            }

            $queryDS = DatSan::with('khungGio')
                ->whereDate('NgayDa', $targetDate)
                ->whereIn('TrangThai', ['HoanThanh', 'KhongDen']);

            $queryLich = LichLamViec::with('caLamViec')
                ->whereDate('NgayLam', $targetDate)
                ->where('TrangThaiDiemDanh', 'DaLam');

            if ($idCumSan !== 'all') {
                $queryDS->whereHas('sanBong', function ($q) use ($idCumSan) {
                    $q->where('MaCumSan', $idCumSan);
                });
                $queryLich->whereHas('caLamViec', function ($q) use ($idCumSan) {
                    $q->where('MaCumSan', $idCumSan);
                });
            }

            foreach ($queryDS->get() as $ds) {
                if ($ds->khungGio) {
                    $hour = substr($ds->khungGio->GioBatDau, 0, 2) . ':00';
                    $dt = ($ds->TrangThai === 'HoanThanh') ? (float) $ds->TongTien : (float) $ds->TienCoc;
                    if (isset($doanhThuChart[$hour])) {
                        $doanhThuChart[$hour] += $dt;
                    }
                }
            }

            foreach ($queryLich->get() as $lich) {
                if ($lich->caLamViec) {
                    $hour = substr($lich->caLamViec->GioBatDau, 0, 2) . ':00';
                    if (isset($chiPhiChart[$hour])) {
                        $chiPhiChart[$hour] += $this->tinhChiPhiCaLam($lich);
                    }
                }
            }

            $formattedChart = [];
            foreach ($doanhThuChart as $hour => $amount) {
                $formattedChart[] = [
                    'ngay'      => $hour,
                    'doanh_thu' => $amount,
                    'chi_phi'   => $chiPhiChart[$hour]
                ];
            }
            $doanhThuChart = $formattedChart;

        } elseif ($timeFilter === 'nam') {
            for ($i = 1; $i <= 12; $i++) {
                $queryDS = DatSan::whereYear('NgayDa', $today->year)
                    ->whereMonth('NgayDa', $i)
                    ->whereIn('TrangThai', ['HoanThanh', 'KhongDen']);

                $queryLich = LichLamViec::with('caLamViec')
                    ->whereYear('NgayLam', $today->year)
                    ->whereMonth('NgayLam', $i)
                    ->where('TrangThaiDiemDanh', 'DaLam');

                if ($idCumSan !== 'all') {
                    $queryDS->whereHas('sanBong', function ($q) use ($idCumSan) {
                        $q->where('MaCumSan', $idCumSan);
                    });
                    $queryLich->whereHas('caLamViec', function ($q) use ($idCumSan) {
                        $q->where('MaCumSan', $idCumSan);
                    });
                }

                $dt = 0;
                foreach ($queryDS->get() as $ds) {
                    $dt += ($ds->TrangThai === 'HoanThanh') ? (float) $ds->TongTien : (float) $ds->TienCoc;
                }

                $cp = 0;
                foreach ($queryLich->get() as $lich) {
                    $cp += $this->tinhChiPhiCaLam($lich);
                }

                $doanhThuChart[] = [
                    'ngay'      => "Tháng $i",
                    'doanh_thu' => $dt,
                    'chi_phi'   => $cp
                ];
            }
        } else {
            $days = $timeFilter === '30_ngay' ? 30 : 7;
            for ($i = $days - 1; $i >= 0; $i--) {
                $date = Carbon::today()->subDays($i);

                $queryDS = DatSan::whereDate('NgayDa', $date)
                    ->whereIn('TrangThai', ['HoanThanh', 'KhongDen']);

                $queryLich = LichLamViec::with('caLamViec')
                    ->whereDate('NgayLam', $date)
                    ->where('TrangThaiDiemDanh', 'DaLam');

                if ($idCumSan !== 'all') {
                    $queryDS->whereHas('sanBong', function ($q) use ($idCumSan) {
                        $q->where('MaCumSan', $idCumSan);
                    });
                    $queryLich->whereHas('caLamViec', function ($q) use ($idCumSan) {
                        $q->where('MaCumSan', $idCumSan);
                    });
                }

                $dt = 0;
                foreach ($queryDS->get() as $ds) {
                    $dt += ($ds->TrangThai === 'HoanThanh') ? (float) $ds->TongTien : (float) $ds->TienCoc;
                }

                $cp = 0;
                foreach ($queryLich->get() as $lich) {
                    $cp += $this->tinhChiPhiCaLam($lich);
                }

                $doanhThuChart[] = [
                    'ngay'      => $date->format('d/m'),
                    'doanh_thu' => $dt,
                    'chi_phi'   => $cp
                ];
            }
        }

        // 7. THỐNG KÊ HIỆU SUẤT NHÂN VIÊN CHỐT SÂN
        $staffMonthYear = $request->staff_month ?? $today->format('m-Y');
        $parts = explode('-', $staffMonthYear);
        $filterMonth = isset($parts[0]) ? (int) $parts[0] : $today->month;
        $filterYear  = isset($parts[1]) ? (int) $parts[1] : $today->year;

        $staffCumSan = $isQuanLy ? $userDangNhap->MaCumSan : ($request->staff_cum_san ?? $idCumSan);
        $daysInMonth = Carbon::createFromDate($filterYear, $filterMonth, 1)->daysInMonth;

        $queryStaffs = NguoiDung::with('cumSan')->where('VaiTro', 'NhanVien');
        if ($staffCumSan !== 'all') {
            $queryStaffs->where('MaCumSan', $staffCumSan);
        }
        $staffList = $queryStaffs->orderBy('MaCumSan', 'asc')->orderBy('HoTen', 'asc')->get();

        $queryChotSan = DatSan::whereYear('NgayDa', $filterYear)
            ->whereMonth('NgayDa', $filterMonth)
            ->whereIn('TrangThai', ['HoanThanh', 'KhongDen'])
            ->whereNotNull('MaNhanVienXuLy')
            ->whereHas('nhanVienXuLy', function ($q) {
                $q->where('VaiTro', 'NhanVien');
            });

        if ($staffCumSan !== 'all') {
            $queryChotSan->whereHas('sanBong', function ($q) use ($staffCumSan) {
                $q->where('MaCumSan', $staffCumSan);
            });
        }

        $chotSanRecords = $queryChotSan->get(['MaDatSan', 'MaNhanVienXuLy', 'NgayDa', 'TrangThai']);

        $thongKeNhanVien = [];
        foreach ($staffList as $nv) {
            $chiTietNgay = [];
            for ($d = 1; $d <= $daysInMonth; $d++) {
                $chiTietNgay[$d] = [
                    'tong'       => 0,
                    'hoan_thanh' => 0,
                    'khong_den'  => 0
                ];
            }

            $thongKeNhanVien[$nv->MaNguoiDung] = [
                'id_nhan_vien'    => $nv->MaNguoiDung,
                'ma_nhan_vien'    => $nv->MaNguoiDung,
                'ho_ten'          => $nv->HoTen,
                'so_dien_thoai'   => $nv->SoDienThoai,
                'ten_cum_san'     => $nv->cumSan ? $nv->cumSan->TenCumSan : 'Chưa phân bổ',
                'tong_chot_thang' => 0,
                'tong_hoan_thanh' => 0,
                'tong_khong_den'  => 0,
                'ngay'            => $chiTietNgay
            ];
        }

        foreach ($chotSanRecords as $rec) {
            $nvId = $rec->MaNhanVienXuLy;
            if (!isset($thongKeNhanVien[$nvId])) continue;

            $dayNum = (int) Carbon::parse($rec->NgayDa)->format('j');
            if (isset($thongKeNhanVien[$nvId]['ngay'][$dayNum])) {
                $thongKeNhanVien[$nvId]['ngay'][$dayNum]['tong']++;
                $thongKeNhanVien[$nvId]['tong_chot_thang']++;

                if ($rec->TrangThai === 'HoanThanh') {
                    $thongKeNhanVien[$nvId]['ngay'][$dayNum]['hoan_thanh']++;
                    $thongKeNhanVien[$nvId]['tong_hoan_thanh']++;
                } elseif ($rec->TrangThai === 'KhongDen') {
                    $thongKeNhanVien[$nvId]['ngay'][$dayNum]['khong_den']++;
                    $thongKeNhanVien[$nvId]['tong_khong_den']++;
                }
            }
        }

        return response()->json([
            'success' => true,
            'data' => [
                'doanh_thu_hom_nay'          => $doanhThuHomNay,
                'booking_hom_nay'            => $bookingHomNay,
                'booking_hoan_thanh_hom_nay' => $bookingHoanThanhHomNay,
                'tong_khach_hang'            => $tongKhachHang,
                'cho_duyet'                  => $tongChoDuyet,
                'so_san_quen_chot'           => $soSanQuenChot,
                'chart'                      => $doanhThuChart,
                'staff_performance'          => [
                    'thang_nam'     => sprintf('%02d-%04d', $filterMonth, $filterYear),
                    'days_in_month' => $daysInMonth,
                    'list'          => array_values($thongKeNhanVien)
                ]
            ]
        ]);
    }
}