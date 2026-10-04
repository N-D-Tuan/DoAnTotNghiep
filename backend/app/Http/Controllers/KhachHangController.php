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
        $userDangNhap = auth()->user();

        // 1. Phân luồng Query theo vai trò
        if ($userDangNhap->VaiTro === 'Admin') {
            // Admin: Lấy tất cả user trên hệ thống, TRỪ chính bản thân Admin đang đăng nhập
            $query = NguoiDung::with('cumSan')->where('ID', '!=', $userDangNhap->ID);
        } else {
            // Quản lý sân: Lấy Khách Hàng (từng đặt sân của mình) HOẶC Nhân Viên (của cụm sân mình)
            $query = NguoiDung::with('cumSan')->where(function ($q) use ($userDangNhap) {
                // Điều kiện 1: Khách hàng từng đặt sân
                $q->where('VaiTro', 'KhachHang')
                  ->whereHas('datSans.sanBong', function ($subQ) use ($userDangNhap) {
                      $subQ->where('ID_CumSan', $userDangNhap->ID_CumSan);
                  });
                  
                // Điều kiện 2: Hoặc là Nhân viên của cơ sở này
                $q->orWhere(function ($subQ) use ($userDangNhap) {
                    $subQ->where('VaiTro', 'NhanVien')
                         ->where('ID_CumSan', $userDangNhap->ID_CumSan);
                });
            });
        }

        $danhSach = $query->orderBy('VaiTro')->orderBy('ID', 'desc')->get();

        // 2. Gắn thêm thống kê (Chỉ tính toán có ý nghĩa với Khách Hàng)
        $data = $danhSach->map(function ($user) use ($userDangNhap) {
            
            // Nếu là Admin hoặc Quản lý sân, không cần tính tỷ lệ bùng sân
            if ($user->VaiTro !== 'KhachHang') {
                $user->tong_hoan_thanh = 0;
                $user->tong_bung_san = 0;
                $user->tong_tran_da_chot = 0;
                $user->ty_le_bung = 0;
                return $user;
            }

            // Tính toán cho Khách Hàng
            $hoanThanhQuery = DatSan::where('ID_NguoiDung', $user->ID)->where('TrangThai', 'HoanThanh');
            $bungSanQuery = DatSan::where('ID_NguoiDung', $user->ID)->where('TrangThai', 'KhongDen');

            if ($userDangNhap->VaiTro === 'QuanLySan') {
                $hoanThanhQuery->whereHas('sanBong', function ($q) use ($userDangNhap) { $q->where('ID_CumSan', $userDangNhap->ID_CumSan); });
                $bungSanQuery->whereHas('sanBong', function ($q) use ($userDangNhap) { $q->where('ID_CumSan', $userDangNhap->ID_CumSan); });
            }

            $hoanThanh = $hoanThanhQuery->count();
            $bungSan = $bungSanQuery->count();
            $tongDaChot = $hoanThanh + $bungSan;
            
            $user->tong_hoan_thanh = $hoanThanh;
            $user->tong_bung_san = $bungSan;
            $user->tong_tran_da_chot = $tongDaChot;
            $user->ty_le_bung = $tongDaChot > 0 ? round(($bungSan / $tongDaChot) * 100) : 0;

            return $user;
        });

        return response()->json(['success' => true, 'data' => $data]);
    }

    // API 2: Lấy chi tiết 1 khách hàng cụ thể
    public function layChiTiet($id)
    {
        $userDangNhap = auth()->user(); // Lấy người đang gọi API

        $khachHang = NguoiDung::find($id);

        if (!$khachHang) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy khách hàng']);
        }

        // ==================================================
        // CHỐT 1: KIỂM TRA QUYỀN TRUY CẬP PROFILE
        // ==================================================
        if ($userDangNhap->VaiTro === 'QuanLySan') {
            $daTungDatSan = DatSan::where('ID_NguoiDung', $id)
                ->whereHas('sanBong', function ($q) use ($userDangNhap) {
                    $q->where('ID_CumSan', $userDangNhap->ID_CumSan);
                })->exists();

            if (!$daTungDatSan) {
                return response()->json(['success' => false, 'message' => 'Bạn không có quyền xem thông tin của khách hàng này do họ chưa từng đặt sân của bạn!'], 403);
            }
        }

        // ==================================================
        // CHỐT 2: CÁCH LY LỊCH SỬ ĐẶT SÂN
        // ==================================================
        $queryDatSan = DatSan::with(['sanBong.cumSan', 'khungGio', 'giaiDau'])
            ->where('ID_NguoiDung', $id);

        if ($userDangNhap->VaiTro === 'QuanLySan') {
            $queryDatSan->whereHas('sanBong', function ($q) use ($userDangNhap) {
                $q->where('ID_CumSan', $userDangNhap->ID_CumSan);
            });
        }
        $lichSuDatSan = $queryDatSan->orderBy('NgayDa', 'desc')->get();

        // ==================================================
        // CHỐT 3: CÁCH LY LỊCH SỬ GIAO DỊCH BẢO MẬT
        // ==================================================
        $queryGiaoDich = GiaoDich::where('ID_NguoiDung', $id);

        if ($userDangNhap->VaiTro === 'QuanLySan') {
            // Dùng hàm pluck để lấy mảng chứa toàn bộ ID_DatSan thuộc cụm sân này (đã lọc ở Chốt 2)
            $danhSachIdDatSanCuaToi = $lichSuDatSan->pluck('ID');
            
            // Quản lý sân chỉ được xem các giao dịch CÓ GẮN ID của những trận đấu trên.
            // Các giao dịch Nạp tiền/Rút tiền (ID_DatSan = null) sẽ tự động bị ẩn.
            $queryGiaoDich->whereIn('ID_DatSan', $danhSachIdDatSanCuaToi);
        }
        
        $lichSuGiaoDich = $queryGiaoDich->orderBy('NgayTao', 'desc')->get();

        // ==================================================
        // CHỐT 4: TÍNH TOÁN 4 THẺ THỐNG KÊ (DATA ISOLATION)
        // ==================================================
        $tongTienDaNap = 0;
        $tongSoTran = 0;
        $tongHoanThanh = 0;
        $tongBungSan = 0;

        if ($userDangNhap->VaiTro === 'QuanLySan') {
            // Quản lý sân: Dữ liệu tính toán bị cô lập trong cụm sân của họ
            $tongTienDaNap = null; // Gán null để Frontend biết đường ẩn thẻ này đi
            $tongSoTran = $lichSuDatSan->count();
            $tongHoanThanh = $lichSuDatSan->where('TrangThai', 'HoanThanh')->count();
            $tongBungSan = $lichSuDatSan->where('TrangThai', 'KhongDen')->count();
        } else {
            // Admin: Lấy dữ liệu toàn hệ thống
            // Lưu ý: Nếu loại giao dịch nạp tiền trong DB của bạn tên khác, hãy sửa lại chữ 'NapTien' bên dưới
            $tongTienDaNap = GiaoDich::where('ID_NguoiDung', $id)
                                     ->where('LoaiGiaoDich', 'NapTien') 
                                     ->sum('SoTien');
                                     
            $tongSoTran = DatSan::where('ID_NguoiDung', $id)->count();
            $tongHoanThanh = DatSan::where('ID_NguoiDung', $id)->where('TrangThai', 'HoanThanh')->count();
            $tongBungSan = DatSan::where('ID_NguoiDung', $id)->where('TrangThai', 'KhongDen')->count();
        }

        // Tính tỷ lệ bùng
        $tongDaChot = $tongHoanThanh + $tongBungSan;
        $tyLeBung = $tongDaChot > 0 ? round(($tongBungSan / $tongDaChot) * 100) : 0;

        $thongKe = [
            'so_du_vi'         => $khachHang->SoDuVi, 
            'tong_tien_da_nap' => $tongTienDaNap,
            'tong_so_tran'     => $tongSoTran,
            'tong_hoan_thanh'  => $tongHoanThanh,
            'tong_bung_san'    => $tongBungSan,
            'tong_da_chot'     => $tongDaChot,
            'ty_le_bung'       => $tyLeBung
        ];

        return response()->json([
            'success' => true,
            'khach_hang' => $khachHang,
            'thong_ke' => $thongKe,
            'lich_su_dat_san' => $lichSuDatSan,
            'lich_su_giao_dich' => $lichSuGiaoDich
        ]);
    }

    // API 3: Mở / Khóa tài khoản
    public function thayDoiTrangThaiKhoa($id)
    {
        $userDangNhap = auth()->user();
        $khachHang = NguoiDung::find($id);
        
        if (!$khachHang) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy người dùng']);
        }

        // CHỐT CHẶN BẢO MẬT: Tuyệt đối không cho phép khóa Super Admin (ID = 1)
        if ($khachHang->ID === 1) {
            return response()->json(['success' => false, 'message' => 'Lỗi bảo mật: Không thể khóa Super Admin tối cao!'], 403);
        }

        // CHỐT CHẶN BẢO MẬT: Quản lý sân chỉ được khóa Khách hàng hoặc Nhân viên CỦA SÂN MÌNH
        if ($userDangNhap->VaiTro === 'QuanLySan') {
            if ($khachHang->VaiTro === 'Admin' || $khachHang->VaiTro === 'QuanLySan') {
                return response()->json(['success' => false, 'message' => 'Lỗi phân quyền: Quản lý sân không được khóa Admin hoặc Quản lý khác!'], 403);
            }
            if ($khachHang->VaiTro === 'NhanVien' && $khachHang->ID_CumSan !== $userDangNhap->ID_CumSan) {
                return response()->json(['success' => false, 'message' => 'Lỗi phân quyền: Bạn không thể khóa nhân viên của cơ sở khác!'], 403);
            }
        }

        // Đảo ngược trạng thái hiện tại
        $khachHang->TrangThaiKhoa = !$khachHang->TrangThaiKhoa;
        $khachHang->save();

        // 1. PHÂN LUỒNG NỘI DUNG THÔNG BÁO
        if ($khachHang->VaiTro === 'KhachHang') {
            $tieuDe = $khachHang->TrangThaiKhoa ? 'Tài khoản bị hạn chế' : 'Tài khoản được mở khóa';
            $noiDung = $khachHang->TrangThaiKhoa 
                ? 'Tài khoản của bạn đã bị KHÓA chức năng đặt sân do vi phạm quy định (Bùng sân, hủy gấp nhiều lần...). Vui lòng liên hệ Admin để được giải quyết.'
                : 'Tài khoản của bạn đã được MỞ KHÓA chức năng đặt sân. Chúc bạn có những trải nghiệm tuyệt vời cùng DN FOOTBALL.';
        } else {
            $tieuDe = $khachHang->TrangThaiKhoa ? 'Tài khoản quản trị bị khóa' : 'Tài khoản quản trị được mở khóa';
            $noiDung = $khachHang->TrangThaiKhoa 
                ? 'Tài khoản nội bộ của bạn đã bị KHÓA quyền truy cập. Bạn sẽ không thể thao tác trên hệ thống quản trị. Vui lòng liên hệ Admin.'
                : 'Tài khoản nội bộ của bạn đã được MỞ KHÓA. Bạn có thể tiếp tục công việc quản trị trên hệ thống.';
        }

        ThongBao::create([
            'ID_NguoiDung' => $khachHang->ID,
            'TieuDe'       => $tieuDe,
            'NoiDung'      => $noiDung,
            'LoaiThongBao' => 'HeThong'
        ]);

        // 2. PHÂN LUỒNG KÊNH REALTIME

        // LUÔN LUÔN phát thông báo vào kênh CÁ NHÂN của người bị khóa (để họ nhảy chuông đỏ)
        broadcast(new \App\Events\UserDataUpdated($khachHang->ID))->toOthers();
        broadcast(new \App\Events\AdminDataUpdated())->toOthers();
        
        return response()->json([
            'success' => true,
            'message' => $khachHang->TrangThaiKhoa ? 'Đã khóa tài khoản thành công!' : 'Đã mở khóa tài khoản thành công!',
            'trang_thai_khoa' => $khachHang->TrangThaiKhoa
        ]);
    }
}
