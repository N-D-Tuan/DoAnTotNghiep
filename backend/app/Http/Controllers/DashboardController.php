<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\DatSan;
use App\Models\GiaiDau;
use App\Models\NguoiDung;
use App\Models\YeuCauHuyGap;
use App\Models\YeuCauRutTien;
use App\Models\GiaoDich;
use Carbon\Carbon;

class DashboardController extends Controller
{
    public function layThongKe()
    {
        $today = Carbon::today();
        $userDangNhap = auth()->user();
        $isQuanLy = $userDangNhap->VaiTro === 'QuanLySan';
        $idCumSan = $userDangNhap->ID_CumSan;

        // =========================================================
        // 1. DOANH THU HÔM NAY
        // =========================================================
        $queryDatSansHomNay = DatSan::whereDate('NgayDa', $today)
                            ->whereIn('TrangThai', ['HoanThanh', 'KhongDen']);
        
        if ($isQuanLy) {
            $queryDatSansHomNay->whereHas('sanBong', function($q) use ($idCumSan) {
                $q->where('ID_CumSan', $idCumSan);
            });
        }
        $datSansHomNay = $queryDatSansHomNay->get();
        
        $doanhThuHomNay = 0;
        foreach ($datSansHomNay as $ds) {
            if ($ds->TrangThai === 'HoanThanh' || !is_null($ds->ID_GiaiDau)) {
                $doanhThuHomNay += $ds->TongTien;
            } else {
                $doanhThuHomNay += $ds->TienCoc;
            }
        }

        // =========================================================
        // 2. TỔNG BOOKING ĐÁ TRONG HÔM NAY
        // =========================================================
        $queryBookingHoanThanh = DatSan::where('TrangThai', 'HoanThanh')->whereDate('NgayDa', $today);
        $queryBookingTong = DatSan::whereIn('TrangThai', ['HoanThanh', 'KhongDen'])->whereDate('NgayDa', $today);

        if ($isQuanLy) {
            $queryBookingHoanThanh->whereHas('sanBong', function($q) use ($idCumSan) { $q->where('ID_CumSan', $idCumSan); });
            $queryBookingTong->whereHas('sanBong', function($q) use ($idCumSan) { $q->where('ID_CumSan', $idCumSan); });
        }

        $bookingHoanThanhHomNay = $queryBookingHoanThanh->count();
        $bookingHomNay = $queryBookingTong->count();

        // =========================================================
        // 3. TỔNG KHÁCH HÀNG
        // =========================================================
        if ($isQuanLy) {
            // Quản lý sân: Chỉ đếm số lượng khách hàng ĐÃ TỪNG đặt sân tại cụm sân này (Loại bỏ trùng lặp bằng distinct)
            $tongKhachHang = DatSan::whereHas('sanBong', function($q) use ($idCumSan) {
                                        $q->where('ID_CumSan', $idCumSan);
                                    })
                                    ->distinct('ID_NguoiDung')
                                    ->count('ID_NguoiDung');
        } else {
            // Admin: Đếm tổng toàn bộ khách hàng trên hệ thống
            $tongKhachHang = NguoiDung::where('VaiTro', 'KhachHang')->count();
        }

        // =========================================================
        // 4. SỐ YÊU CẦU ĐANG CHỜ DUYỆT
        // =========================================================
        $queryGiaiDau = GiaiDau::where('TrangThai', 'ChoDuyet');
        $queryHuyGap = YeuCauHuyGap::where('TrangThai', 'ChoDuyet');
        $choDuyetRut = 0;

        if ($isQuanLy) {
            // Quản lý sân: Cách ly giải đấu và yêu cầu hủy theo cụm sân
            $queryGiaiDau->where('ID_CumSan', $idCumSan);
            $queryHuyGap->whereHas('datSan.sanBong', function($q) use ($idCumSan) {
                $q->where('ID_CumSan', $idCumSan);
            });
            // Quản lý sân KHÔNG CÓ QUYỀN duyệt rút tiền, nên $choDuyetRut giữ nguyên bằng 0
        } else {
            // Admin: Thấy toàn bộ, cộng thêm số lượng yêu cầu rút tiền
            $choDuyetRut = YeuCauRutTien::where('TrangThai', 'ChoDuyet')->count();
        }

        $tongChoDuyet = $queryGiaiDau->count() + $queryHuyGap->count() + $choDuyetRut;

        // =========================================================
        // 5. SỐ SÂN QUÊN CHỐT (Đã cọc nhưng quá hạn)
        // =========================================================
        $queryQuenChot = DatSan::where('TrangThai', 'DaCoc')->whereDate('NgayDa', '<', $today);
        if ($isQuanLy) {
            $queryQuenChot->whereHas('sanBong', function($q) use ($idCumSan) { $q->where('ID_CumSan', $idCumSan); });
        }
        $soSanQuenChot = $queryQuenChot->count();

        // =========================================================
        // 6. BIỂU ĐỒ DOANH THU 7 NGÀY GẦN NHẤT
        // =========================================================
        $doanhThu7Ngay = [];
        for ($i = 6; $i >= 0; $i--) {
            $date = Carbon::today()->subDays($i);
            
            $queryChart = DatSan::whereDate('NgayDa', $date)->whereIn('TrangThai', ['HoanThanh', 'KhongDen']);
            if ($isQuanLy) {
                $queryChart->whereHas('sanBong', function($q) use ($idCumSan) { $q->where('ID_CumSan', $idCumSan); });
            }
            $datSansNgay = $queryChart->get();
            
            $dt = 0;
            foreach ($datSansNgay as $ds) {
                if ($ds->TrangThai === 'HoanThanh' || !is_null($ds->ID_GiaiDau)) {
                    $dt += $ds->TongTien;
                } else {
                    $dt += $ds->TienCoc;
                }
            }

            $doanhThu7Ngay[] = [
                'ngay' => $date->format('d/m'),
                'doanh_thu' => $dt
            ];
        }

        // =========================================================
        // 7. LẤY 5 BOOKING MỚI NHẤT
        // =========================================================
        $queryRecent = DatSan::with(['nguoiDung', 'sanBong.cumSan', 'khungGio']);
        if ($isQuanLy) {
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
                'chart' => $doanhThu7Ngay,
                'recent_bookings' => $bookingMoiNhat
            ]
        ]);
    }
}
