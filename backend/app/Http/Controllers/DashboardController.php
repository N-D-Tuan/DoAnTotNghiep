<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\DatSan;
use App\Models\GiaiDau;
use App\Models\NguoiDung;
use App\Models\YeuCauHuyGap;
use Carbon\Carbon;

class DashboardController extends Controller
{
    /**
     * Tính số tiền doanh thu thực tế thu vào của 1 lịch đặt sân ($ds) đã chốt ('HoanThanh' hoặc 'KhongDen')
     * 1. Nếu 'KhongDen' (Cả Phong trào & Giải đấu):
     *    -> Chỉ tính đúng tiền cọc ($ds->TienCoc), KHÔNG có Thuế VAT.
     * 2. Nếu 'HoanThanh' (Cả Phong trào & Giải đấu):
     *    -> Tính số tiền thực thu của trận đó sau khi đã trừ Khuyến mãi (nếu có) và cộng Thuế VAT 8% trên Hóa đơn.
     */
    public static function tinhDoanhThuThucTeDatSan($ds)
    {
        if (!in_array($ds->TrangThai, ['HoanThanh', 'KhongDen'])) {
            return 0;
        }

        // TRƯỜNG HỢP 1: Khách KHÔNG ĐẾN -> Chỉ thu đúng tiền cọc (30% phong trào hoặc 50% giải đấu), không tính VAT
        if ($ds->TrangThai === 'KhongDen') {
            return (float) $ds->TienCoc;
        }

        // TRƯỜNG HỢP 2: Khách HOÀN THÀNH trận đấu
        $tienGocTranNay = (float) $ds->TongTien;
        $hoaDon = $ds->hoaDonDatSan;

        if (!$hoaDon) {
            $vatLe = floor(($tienGocTranNay * 0.08) / 1000) * 1000;
            return $tienGocTranNay + $vatLe;
        }

        $cacTranTrongHD = $hoaDon->datSans ?? collect([]);

        // Tổng tiền gốc của các trận chịu thuế (DaCoc + HoanThanh) và tổng tiền cọc của các trận KhongDen trong cùng Hóa đơn
        $tongGocChiuThue = (float) $cacTranTrongHD->whereIn('TrangThai', ['DaCoc', 'HoanThanh'])->sum('TongTien');
        $tongCocKhongDen = (float) $cacTranTrongHD->where('TrangThai', 'KhongDen')->sum('TienCoc');

        if ($tongGocChiuThue <= 0) {
            return $tienGocTranNay;
        }

        // Phần tổng tiền Hóa đơn thực tế thuộc về các trận (DaCoc + HoanThanh) = TongTien Hóa đơn - Tổng cọc các trận KhongDen
        $tongThucThuCacTranChiuThue = max(0, (float) $hoaDon->TongTien - $tongCocKhongDen);

        // Phân bổ cho trận Hoàn thành này theo đúng tỷ lệ giá sân gốc
        return round($tongThucThuCacTranChiuThue * ($tienGocTranNay / $tongGocChiuThue));
    }

    public function layThongKe(Request $request)
    {
        $today = Carbon::today();
        $userDangNhap = auth()->user();
        $isQuanLy = $userDangNhap->VaiTro === 'QuanLySan';

        $idCumSan = $isQuanLy ? $userDangNhap->MaCumSan : ($request->input('ma_cum_san', $request->input('id_cum_san', 'all')));
        $timeFilter = $request->time_filter ?? 'hom_nay';

        // 1. DOANH THU HÔM NAY (Tính theo số tiền thực thu từ các trận HoanThanh / KhongDen trong hôm nay)
        $queryDatSansHomNay = DatSan::with(['hoaDonDatSan.datSans'])
            ->whereDate('NgayDa', $today)
            ->whereIn('TrangThai', ['HoanThanh', 'KhongDen']);

        if ($idCumSan !== 'all') {
            $queryDatSansHomNay->whereHas('sanBong', function ($q) use ($idCumSan) {
                $q->where('MaCumSan', $idCumSan);
            });
        }

        $doanhThuHomNay = 0;
        foreach ($queryDatSansHomNay->get() as $ds) {
            $doanhThuHomNay += self::tinhDoanhThuThucTeDatSan($ds);
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

        // 6. BIỂU ĐỒ DOANH THU / LỢI NHUẬN THU VÀO TỪ ĐẶT SÂN (ĐÃ BỎ CHI PHÍ)
        $doanhThuChart = [];

        if ($timeFilter === 'hom_nay' || $timeFilter === 'hom_truoc') {
            $targetDate = $timeFilter === 'hom_nay' ? Carbon::today() : Carbon::yesterday();

            for ($i = 0; $i < 24; $i++) {
                $timeKey = sprintf("%02d:00", $i);
                $doanhThuChart[$timeKey] = 0;
            }

            $queryDS = DatSan::with(['khungGio', 'hoaDonDatSan.datSans'])
                ->whereDate('NgayDa', $targetDate)
                ->whereIn('TrangThai', ['HoanThanh', 'KhongDen']);

            if ($idCumSan !== 'all') {
                $queryDS->whereHas('sanBong', function ($q) use ($idCumSan) {
                    $q->where('MaCumSan', $idCumSan);
                });
            }

            foreach ($queryDS->get() as $ds) {
                if ($ds->khungGio) {
                    $hour = substr($ds->khungGio->GioBatDau, 0, 2) . ':00';
                    $dt = self::tinhDoanhThuThucTeDatSan($ds);
                    if (isset($doanhThuChart[$hour])) {
                        $doanhThuChart[$hour] += $dt;
                    }
                }
            }

            $formattedChart = [];
            foreach ($doanhThuChart as $hour => $amount) {
                $formattedChart[] = [
                    'ngay'      => $hour,
                    'doanh_thu' => $amount
                ];
            }
            $doanhThuChart = $formattedChart;

        } elseif ($timeFilter === 'nam') {
            for ($i = 1; $i <= 12; $i++) {
                $queryDS = DatSan::with(['hoaDonDatSan.datSans'])
                    ->whereYear('NgayDa', $today->year)
                    ->whereMonth('NgayDa', $i)
                    ->whereIn('TrangThai', ['HoanThanh', 'KhongDen']);

                if ($idCumSan !== 'all') {
                    $queryDS->whereHas('sanBong', function ($q) use ($idCumSan) {
                        $q->where('MaCumSan', $idCumSan);
                    });
                }

                $dt = 0;
                foreach ($queryDS->get() as $ds) {
                    $dt += self::tinhDoanhThuThucTeDatSan($ds);
                }

                $doanhThuChart[] = [
                    'ngay'      => "Tháng $i",
                    'doanh_thu' => $dt
                ];
            }
        } else {
            $days = $timeFilter === '30_ngay' ? 30 : 7;
            for ($i = $days - 1; $i >= 0; $i--) {
                $date = Carbon::today()->subDays($i);

                $queryDS = DatSan::with(['hoaDonDatSan.datSans'])
                    ->whereDate('NgayDa', $date)
                    ->whereIn('TrangThai', ['HoanThanh', 'KhongDen']);

                if ($idCumSan !== 'all') {
                    $queryDS->whereHas('sanBong', function ($q) use ($idCumSan) {
                        $q->where('MaCumSan', $idCumSan);
                    });
                }

                $dt = 0;
                foreach ($queryDS->get() as $ds) {
                    $dt += self::tinhDoanhThuThucTeDatSan($ds);
                }

                $doanhThuChart[] = [
                    'ngay'      => $date->format('d/m'),
                    'doanh_thu' => $dt
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