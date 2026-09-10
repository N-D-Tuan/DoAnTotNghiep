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

        // 1. Doanh thu hôm nay (Tổng tiền các Giao dịch "Cộng" vào ví trong hôm nay)
        $datSansHomNay = DatSan::whereDate('NgayDa', $today)
                            ->whereIn('TrangThai', ['HoanThanh', 'KhongDen'])
                            ->get();
        
        $doanhThuHomNay = 0;
        foreach ($datSansHomNay as $ds) {
            // Nếu là Hoàn thành HOẶC thuộc Giải đấu -> Thu đủ (TongTien)
            // Nếu Phong trào mà Không đến -> Chỉ thu Cọc (TienCoc)
            if ($ds->TrangThai === 'HoanThanh' || !is_null($ds->ID_GiaiDau)) {
                $doanhThuHomNay += $ds->TongTien;
            } else {
                $doanhThuHomNay += $ds->TienCoc;
            }
        }

        // 2. Tổng booking đá trong hôm nay
        $bookingHoanThanhHomNay = DatSan::where('TrangThai', 'HoanThanh')
                                    ->whereDate('NgayDa', $today)
                                    ->count();

        $bookingHomNay = DatSan::whereIn('TrangThai', ['HoanThanh', 'KhongDen'])
                            ->whereDate('NgayDa', $today)
                            ->count();

        // 3. Tổng khách hàng
        $tongKhachHang = NguoiDung::where('VaiTro', 'KhachHang')->count();

        // 4. Số yêu cầu đang chờ duyệt (Gộp Giải đấu, Hủy gấp, Rút tiền)
        $choDuyetGD = GiaiDau::where('TrangThai', 'ChoDuyet')->count();
        $choDuyetHuy = YeuCauHuyGap::where('TrangThai', 'ChoDuyet')->count();
        $choDuyetRut = YeuCauRutTien::where('TrangThai', 'ChoDuyet')->count();
        $tongChoDuyet = $choDuyetGD + $choDuyetHuy + $choDuyetRut;

        // 5. Số sân QUÊN CHỐT (Trạng thái Đã cọc nhưng Ngày đá nhỏ hơn hôm nay)
        $soSanQuenChot = DatSan::where('TrangThai', 'DaCoc')
                            ->whereDate('NgayDa', '<', $today)
                            ->count();

        // 6. Biểu đồ doanh thu 7 ngày gần nhất
        $doanhThu7Ngay = [];
        for ($i = 6; $i >= 0; $i--) {
            $date = Carbon::today()->subDays($i);
            
            $datSansNgay = DatSan::whereDate('NgayDa', $date)
                            ->whereIn('TrangThai', ['HoanThanh', 'KhongDen'])
                            ->get();
            
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

        // 7. Lấy 5 Booking mới nhất
        $bookingMoiNhat = DatSan::with(['nguoiDung', 'sanBong.cumSan', 'khungGio'])
                                ->orderBy('ID', 'desc')
                                ->take(5)
                                ->get();

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
