<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\DatSan;
use App\Models\GiaiDau;
use App\Models\NguoiDung;
use App\Models\YeuCauHuyGap;
use App\Models\GiaoDich;
use App\Models\HoaDonBanHang;
use App\Models\PhieuNhapHang;
use App\Models\ChiPhiPhatSinh;
use App\Models\BangLuong;
use Carbon\Carbon;

class DashboardController extends Controller
{
    public function layThongKe(Request $request)
    {
        $today = Carbon::today();
        $userDangNhap = auth()->user();
        $isQuanLy = $userDangNhap->VaiTro === 'QuanLySan';
        
        $idCumSan = $isQuanLy ? $userDangNhap->ID_CumSan : ($request->id_cum_san ?? 'all');
        $timeFilter = $request->time_filter ?? 'hom_nay';

        // =========================================================
        // 1. DOANH THU HÔM NAY (Đặt sân + Bán hàng + Phiếu Thu phát sinh trong ca)
        // =========================================================
        $queryDatSansHomNay = DatSan::whereDate('NgayDa', $today)->whereIn('TrangThai', ['HoanThanh', 'KhongDen']);
        $queryBanHangHomNay = HoaDonBanHang::whereDate('NgayTao', $today);
        $queryPhieuThuHomNay = DB::table('ChiPhiPhatSinh')->whereDate('ThoiGian', $today)->where('SoTien', '<', 0);
        
        if ($idCumSan !== 'all') {
            $queryDatSansHomNay->whereHas('sanBong', function($q) use ($idCumSan) { $q->where('ID_CumSan', $idCumSan); });
            $queryBanHangHomNay->where('ID_CumSan', $idCumSan);
            $queryPhieuThuHomNay->whereIn('ID_BanGiaoCa', function($q) use ($idCumSan) {
                $q->select('ID')->from('BanGiaoCa')->where('ID_CumSan', $idCumSan);
            });
        }
        
        $doanhThuHomNay = 0;
        foreach ($queryDatSansHomNay->get() as $ds) {
            $doanhThuHomNay += ($ds->TrangThai === 'HoanThanh' || !is_null($ds->ID_GiaiDau)) ? $ds->TongTien : $ds->TienCoc;
        }
        $doanhThuHomNay += $queryBanHangHomNay->sum('TongTien');
        $doanhThuHomNay += abs($queryPhieuThuHomNay->sum('SoTien'));

        // =========================================================
        // 2. TỔNG BOOKING ĐÁ TRONG HÔM NAY
        // =========================================================
        $queryBookingHoanThanh = DatSan::where('TrangThai', 'HoanThanh')->whereDate('NgayDa', $today);
        $queryBookingTong = DatSan::whereIn('TrangThai', ['HoanThanh', 'KhongDen'])->whereDate('NgayDa', $today);

        if ($idCumSan !== 'all') {
            $queryBookingHoanThanh->whereHas('sanBong', function($q) use ($idCumSan) { $q->where('ID_CumSan', $idCumSan); });
            $queryBookingTong->whereHas('sanBong', function($q) use ($idCumSan) { $q->where('ID_CumSan', $idCumSan); });
        }

        $bookingHoanThanhHomNay = $queryBookingHoanThanh->count();
        $bookingHomNay = $queryBookingTong->count();

        // =========================================================
        // 3. TỔNG KHÁCH HÀNG
        // =========================================================
        if ($isQuanLy) {
            $tongKhachHang = DatSan::whereHas('sanBong', function($q) use ($idCumSan) {
                                        $q->where('ID_CumSan', $idCumSan);
                                    })
                                    ->distinct('ID_NguoiDung')
                                    ->count('ID_NguoiDung');
        } else {
            $tongKhachHang = NguoiDung::where('VaiTro', 'KhachHang')->count();
        }

        // =========================================================
        // 4. SỐ YÊU CẦU ĐANG CHỜ DUYỆT (Giải đấu + Hủy sân + Lương chờ xử lý)
        // =========================================================
        $queryGiaiDau = GiaiDau::where('TrangThai', 'ChoDuyet');
        $queryHuyGap = YeuCauHuyGap::where('TrangThai', 'ChoDuyet');
        $queryBangLuongCho = BangLuong::whereIn('TrangThai', ['KhieuNai', 'ChoThanhToan']);

        if ($idCumSan !== 'all') {
            $queryGiaiDau->where('ID_CumSan', $idCumSan);
            $queryHuyGap->whereHas('datSan.sanBong', function($q) use ($idCumSan) {
                $q->where('ID_CumSan', $idCumSan);
            });
            $queryBangLuongCho->whereHas('nhanVien', function($q) use ($idCumSan) {
                $q->where('ID_CumSan', $idCumSan);
            });
        }

        $tongChoDuyet = $queryGiaiDau->count() + $queryHuyGap->count() + $queryBangLuongCho->count();

        // =========================================================
        // 5. SỐ SÂN QUÊN CHỐT
        // =========================================================
        $queryQuenChot = DatSan::where('TrangThai', 'DaCoc')->whereDate('NgayDa', '<', $today);
        if ($isQuanLy) {
            $queryQuenChot->whereHas('sanBong', function($q) use ($idCumSan) { $q->where('ID_CumSan', $idCumSan); });
        }
        $soSanQuenChot = $queryQuenChot->count();

        // =========================================================
        // 6. BIỂU ĐỒ DOANH THU & CHI PHÍ (Đã gồm Nhập hàng + Thu/Chi ca + Lương NV)
        // =========================================================
        $doanhThuChart = [];
        $chiPhiChart = []; 
        
        if ($timeFilter === 'hom_nay' || $timeFilter === 'hom_truoc') {
            $targetDate = $timeFilter === 'hom_nay' ? Carbon::today() : Carbon::yesterday();
            
            for ($i = 0; $i < 24; $i++) {
                $timeKey = sprintf("%02d:00", $i);
                $doanhThuChart[$timeKey] = 0; 
                $chiPhiChart[$timeKey] = 0;
            }

            $queryDS = DatSan::with('khungGio')->whereDate('NgayDa', $targetDate)->whereIn('TrangThai', ['HoanThanh', 'KhongDen']);
            $queryBH = HoaDonBanHang::whereDate('NgayTao', $targetDate);
            $queryPN = DB::table('PhieuNhapHang')->whereDate('NgayNhap', $targetDate);
            $queryCP = DB::table('ChiPhiPhatSinh')->whereDate('ThoiGian', $targetDate);
            $queryBL = BangLuong::where('TrangThai', 'DaThanhToan')->whereDate('NgayThanhToan', $targetDate);

            if ($idCumSan !== 'all') {
                $queryDS->whereHas('sanBong', function($q) use ($idCumSan) { $q->where('ID_CumSan', $idCumSan); });
                $queryBH->where('ID_CumSan', $idCumSan);
                $queryPN->where('ID_CumSan', $idCumSan);
                $queryCP->whereIn('ID_BanGiaoCa', function($q) use ($idCumSan) {
                    $q->select('ID')->from('BanGiaoCa')->where('ID_CumSan', $idCumSan);
                });
                $queryBL->whereHas('nhanVien', function($q) use ($idCumSan) {
                    $q->where('ID_CumSan', $idCumSan);
                });
            }

            foreach ($queryDS->get() as $ds) {
                if ($ds->khungGio) {
                    $hour = substr($ds->khungGio->GioBatDau, 0, 2) . ':00';
                    $dt = ($ds->TrangThai === 'HoanThanh' || !is_null($ds->ID_GiaiDau)) ? $ds->TongTien : $ds->TienCoc;
                    if (isset($doanhThuChart[$hour])) $doanhThuChart[$hour] += $dt;
                }
            }
            foreach ($queryBH->get() as $bh) {
                if ($bh->NgayTao) {
                    $hour = Carbon::parse($bh->NgayTao)->format('H') . ':00';
                    if (isset($doanhThuChart[$hour])) $doanhThuChart[$hour] += $bh->TongTien;
                }
            }
            foreach ($queryPN->get() as $pn) {
                if ($pn->NgayNhap) {
                    $hour = Carbon::parse($pn->NgayNhap)->format('H') . ':00';
                    if (isset($chiPhiChart[$hour])) $chiPhiChart[$hour] += $pn->TongTienThanhToan;
                }
            }
            foreach ($queryCP->get() as $cp) {
                if ($cp->ThoiGian) {
                    $hour = Carbon::parse($cp->ThoiGian)->format('H') . ':00';
                    if ($cp->SoTien < 0) {
                        // Số âm là Phiếu Thu phát sinh -> Cộng vào Doanh thu
                        if (isset($doanhThuChart[$hour])) $doanhThuChart[$hour] += abs($cp->SoTien);
                    } else {
                        // Số dương là Phiếu Chi phát sinh -> Cộng vào Chi phí
                        if (isset($chiPhiChart[$hour])) $chiPhiChart[$hour] += $cp->SoTien;
                    }
                }
            }
            foreach ($queryBL->get() as $bl) {
                if ($bl->NgayThanhToan) {
                    $hour = Carbon::parse($bl->NgayThanhToan)->format('H') . ':00';
                    $thucLanh = max(0, $bl->TongTienLuong + $bl->TongTienThuong - $bl->TongTienPhat);
                    if (isset($chiPhiChart[$hour])) $chiPhiChart[$hour] += $thucLanh;
                }
            }

            $formattedChart = [];
            foreach ($doanhThuChart as $hour => $amount) {
                $formattedChart[] = ['ngay' => $hour, 'doanh_thu' => $amount, 'chi_phi' => $chiPhiChart[$hour]];
            }
            $doanhThuChart = $formattedChart;

        } elseif ($timeFilter === 'nam') {
            for ($i = 1; $i <= 12; $i++) {
                $queryDS = DatSan::whereYear('NgayDa', $today->year)->whereMonth('NgayDa', $i)->whereIn('TrangThai', ['HoanThanh', 'KhongDen']);
                $queryBH = HoaDonBanHang::whereYear('NgayTao', $today->year)->whereMonth('NgayTao', $i);
                $queryPN = DB::table('PhieuNhapHang')->whereYear('NgayNhap', $today->year)->whereMonth('NgayNhap', $i);
                $queryPhieuThu = DB::table('ChiPhiPhatSinh')->whereYear('ThoiGian', $today->year)->whereMonth('ThoiGian', $i)->where('SoTien', '<', 0);
                $queryPhieuChi = DB::table('ChiPhiPhatSinh')->whereYear('ThoiGian', $today->year)->whereMonth('ThoiGian', $i)->where('SoTien', '>', 0);
                $queryBL = BangLuong::where('TrangThai', 'DaThanhToan')->whereYear('NgayThanhToan', $today->year)->whereMonth('NgayThanhToan', $i);
                
                if ($idCumSan !== 'all') {
                    $queryDS->whereHas('sanBong', function($q) use ($idCumSan) { $q->where('ID_CumSan', $idCumSan); });
                    $queryBH->where('ID_CumSan', $idCumSan);
                    $queryPN->where('ID_CumSan', $idCumSan);
                    $queryPhieuThu->whereIn('ID_BanGiaoCa', function($q) use ($idCumSan) {
                        $q->select('ID')->from('BanGiaoCa')->where('ID_CumSan', $idCumSan);
                    });
                    $queryPhieuChi->whereIn('ID_BanGiaoCa', function($q) use ($idCumSan) {
                        $q->select('ID')->from('BanGiaoCa')->where('ID_CumSan', $idCumSan);
                    });
                    $queryBL->whereHas('nhanVien', function($q) use ($idCumSan) {
                        $q->where('ID_CumSan', $idCumSan);
                    });
                }

                $dt = 0;
                foreach ($queryDS->get() as $ds) {
                    $dt += ($ds->TrangThai === 'HoanThanh' || !is_null($ds->ID_GiaiDau)) ? $ds->TongTien : $ds->TienCoc;
                }
                $dt += $queryBH->sum('TongTien') + abs($queryPhieuThu->sum('SoTien'));
                
                $chiLuong = 0;
                foreach ($queryBL->get() as $bl) {
                    $chiLuong += max(0, $bl->TongTienLuong + $bl->TongTienThuong - $bl->TongTienPhat);
                }
                $cp = $queryPN->sum('TongTienThanhToan') + $queryPhieuChi->sum('SoTien') + $chiLuong;
                
                $doanhThuChart[] = ['ngay' => "Tháng $i", 'doanh_thu' => $dt, 'chi_phi' => $cp];
            }
        } else {
            $days = $timeFilter === '30_ngay' ? 30 : 7;
            for ($i = $days - 1; $i >= 0; $i--) {
                $date = Carbon::today()->subDays($i);
                
                $queryDS = DatSan::whereDate('NgayDa', $date)->whereIn('TrangThai', ['HoanThanh', 'KhongDen']);
                $queryBH = HoaDonBanHang::whereDate('NgayTao', $date);
                $queryPN = DB::table('PhieuNhapHang')->whereDate('NgayNhap', $date);
                $queryPhieuThu = DB::table('ChiPhiPhatSinh')->whereDate('ThoiGian', $date)->where('SoTien', '<', 0);
                $queryPhieuChi = DB::table('ChiPhiPhatSinh')->whereDate('ThoiGian', $date)->where('SoTien', '>', 0);
                $queryBL = BangLuong::where('TrangThai', 'DaThanhToan')->whereDate('NgayThanhToan', $date);

                if ($idCumSan !== 'all') {
                    $queryDS->whereHas('sanBong', function($q) use ($idCumSan) { $q->where('ID_CumSan', $idCumSan); });
                    $queryBH->where('ID_CumSan', $idCumSan);
                    $queryPN->where('ID_CumSan', $idCumSan);
                    $queryPhieuThu->whereIn('ID_BanGiaoCa', function($q) use ($idCumSan) {
                        $q->select('ID')->from('BanGiaoCa')->where('ID_CumSan', $idCumSan);
                    });
                    $queryPhieuChi->whereIn('ID_BanGiaoCa', function($q) use ($idCumSan) {
                        $q->select('ID')->from('BanGiaoCa')->where('ID_CumSan', $idCumSan);
                    });
                    $queryBL->whereHas('nhanVien', function($q) use ($idCumSan) {
                        $q->where('ID_CumSan', $idCumSan);
                    });
                }

                $dt = 0;
                foreach ($queryDS->get() as $ds) {
                    $dt += ($ds->TrangThai === 'HoanThanh' || !is_null($ds->ID_GiaiDau)) ? $ds->TongTien : $ds->TienCoc;
                }
                $dt += $queryBH->sum('TongTien') + abs($queryPhieuThu->sum('SoTien'));
                
                $chiLuong = 0;
                foreach ($queryBL->get() as $bl) {
                    $chiLuong += max(0, $bl->TongTienLuong + $bl->TongTienThuong - $bl->TongTienPhat);
                }
                $cp = $queryPN->sum('TongTienThanhToan') + $queryPhieuChi->sum('SoTien') + $chiLuong;
                
                $doanhThuChart[] = ['ngay' => $date->format('d/m'), 'doanh_thu' => $dt, 'chi_phi' => $cp];
            }
        }

        // =========================================================
        // 7. LẤY 5 BOOKING MỚI NHẤT
        // =========================================================
        $queryRecent = DatSan::with(['nguoiDung', 'sanBong.cumSan', 'khungGio']);
        if ($idCumSan !== 'all') { 
            $queryRecent->whereHas('sanBong', function($q) use ($idCumSan) { $q->where('ID_CumSan', $idCumSan); });
        }
        $bookingMoiNhat = $queryRecent->orderBy('ID', 'desc')->take(5)->get();

        return response()->json([
            'success' => true,
            'data' => [
                'doanh_thu_hom_nay' => $doanhThuHomNay,
                'booking_hom_nay' => $bookingHomNay,
                'booking_hoan_thanh_hom_nay' => $bookingHoanThanhHomNay,
                'tong_khach_hang' => $tongKhachHang,
                'cho_duyet' => $tongChoDuyet,
                'so_san_quen_chot' => $soSanQuenChot,
                'chart' => $doanhThuChart,
                'recent_bookings' => $bookingMoiNhat
            ]
        ]);
    }
}