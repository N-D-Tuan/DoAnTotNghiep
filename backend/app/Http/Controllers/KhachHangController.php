<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\NguoiDung;
use App\Models\DatSan;
use App\Models\GiaoDich;
use App\Models\ThongBao;

class KhachHangController extends Controller
{
    // API 1: Lấy danh sách khách hàng + Thống kê số trận
    public function layDanhSach()
    {
        $khachHangs = NguoiDung::where('VaiTro', 'KhachHang')
            ->orderBy('ID')
            ->get();

        // Gắn thêm thống kê cho từng khách hàng
        $data = $khachHangs->map(function ($kh) {
            // 1. Lấy số trận hoàn thành và số trận bùng
            $hoanThanh = DatSan::where('ID_NguoiDung', $kh->ID)->where('TrangThai', 'HoanThanh')->count();
            $bungSan = DatSan::where('ID_NguoiDung', $kh->ID)->where('TrangThai', 'KhongDen')->count();
            
            // 2. Tính mẫu số (tổng số trận đã chốt)
            $tongDaChot = $hoanThanh + $bungSan;
            
            // 3. Tính tỷ lệ %
            $tyLe = $tongDaChot > 0 ? round(($bungSan / $tongDaChot) * 100) : 0;

            // 4. Gắn vào biến trả về
            $kh->tong_hoan_thanh = $hoanThanh;
            $kh->tong_bung_san = $bungSan;
            $kh->tong_tran_da_chot = $tongDaChot;
            $kh->ty_le_bung = $tyLe;
            $kh->tong_dat_san = DatSan::where('ID_NguoiDung', $kh->ID)->count(); // Vẫn giữ để tham khảo nếu cần

            return $kh;
        });

        return response()->json([
            'success' => true,
            'data' => $data
        ]);
    }

    // API 2: Lấy chi tiết 1 khách hàng cụ thể
    public function layChiTiet($id)
    {
        $khachHang = NguoiDung::find($id);
        if (!$khachHang) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy khách hàng']);
        }

        // Lấy lịch sử đặt sân của khách này
        $lichSuDatSan = DatSan::with(['sanBong.cumSan', 'khungGio', 'giaiDau'])
            ->where('ID_NguoiDung', $id)
            ->orderBy('NgayDa', 'desc')
            ->get();

        // Lấy lịch sử giao dịch ví của khách này
        $lichSuGiaoDich = GiaoDich::where('ID_NguoiDung', $id)
            ->orderBy('NgayTao', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'khach_hang' => $khachHang,
            'lich_su_dat_san' => $lichSuDatSan,
            'lich_su_giao_dich' => $lichSuGiaoDich
        ]);
    }

    // API 3: Mở / Khóa tài khoản
    public function thayDoiTrangThaiKhoa($id)
    {
        $khachHang = NguoiDung::find($id);
        if (!$khachHang) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy khách hàng']);
        }

        // Đảo ngược trạng thái hiện tại (Đang khóa -> Mở, Đang mở -> Khóa)
        $khachHang->TrangThaiKhoa = !$khachHang->TrangThaiKhoa;
        $khachHang->save();

        // Gửi thông báo hệ thống cho khách hàng
        $tieuDe = $khachHang->TrangThaiKhoa ? 'Tài khoản bị hạn chế' : 'Tài khoản được mở khóa';
        $noiDung = $khachHang->TrangThaiKhoa 
            ? 'Tài khoản của bạn đã bị KHÓA chức năng đặt sân do vi phạm quy định (Bùng sân, hủy gấp nhiều lần...). Vui lòng liên hệ Admin để được giải quyết.'
            : 'Tài khoản của bạn đã được MỞ KHÓA chức năng đặt sân. Chúc bạn có những trải nghiệm tuyệt vời cùng DN FOOTBALL.';

        ThongBao::create([
            'ID_NguoiDung' => $khachHang->ID,
            'TieuDe'       => $tieuDe,
            'NoiDung'      => $noiDung,
            'LoaiThongBao' => 'HeThong'
        ]);

        // Kích hoạt socket để khách hàng nhận thông báo ngay lập tức
        broadcast(new \App\Events\UserDataUpdated($khachHang->ID))->toOthers();

        return response()->json([
            'success' => true,
            'message' => $khachHang->TrangThaiKhoa ? 'Đã khóa tài khoản khách hàng!' : 'Đã mở khóa tài khoản!',
            'trang_thai_khoa' => $khachHang->TrangThaiKhoa
        ]);
    }
}
