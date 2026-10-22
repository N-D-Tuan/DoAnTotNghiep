<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\NguoiDung;
use App\Models\DatSan;
use App\Models\HoaDonDatSan;
use App\Models\GiaoDich;
use App\Models\ThongBao;

class KhachHangController extends Controller
{
    public function layDanhSach()
    {
        $userDangNhap = auth()->user();

        if ($userDangNhap->VaiTro === 'Admin') {
            $query = NguoiDung::with('cumSan')->where('MaNguoiDung', '!=', $userDangNhap->MaNguoiDung);
        } else {
            $query = NguoiDung::with('cumSan')->where(function ($q) use ($userDangNhap) {
                $q->where('VaiTro', 'KhachHang')
                  ->whereHas('datSans.sanBong', function ($subQ) use ($userDangNhap) {
                      $subQ->where('MaCumSan', $userDangNhap->MaCumSan);
                  });

                $q->orWhere(function ($subQ) use ($userDangNhap) {
                    $subQ->where('VaiTro', 'NhanVien')
                         ->where('MaCumSan', $userDangNhap->MaCumSan);
                });
            });
        }

        $danhSach = $query->orderBy('VaiTro')->orderBy('MaNguoiDung', 'desc')->get();

        $data = $danhSach->map(function ($user) use ($userDangNhap) {
            if ($user->VaiTro !== 'KhachHang') {
                $user->tong_hoan_thanh = 0;
                $user->tong_bung_san = 0;
                $user->tong_tran_da_chot = 0;
                $user->ty_le_bung = 0;
                return $user;
            }

            $hoanThanhQuery = DatSan::where('MaNguoiDung', $user->MaNguoiDung)->where('TrangThai', 'HoanThanh');
            $bungSanQuery = DatSan::where('MaNguoiDung', $user->MaNguoiDung)->where('TrangThai', 'KhongDen');

            if ($userDangNhap->VaiTro === 'QuanLySan') {
                $hoanThanhQuery->whereHas('sanBong', function ($q) use ($userDangNhap) { $q->where('MaCumSan', $userDangNhap->MaCumSan); });
                $bungSanQuery->whereHas('sanBong', function ($q) use ($userDangNhap) { $q->where('MaCumSan', $userDangNhap->MaCumSan); });
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

    public function layChiTiet($id)
    {
        $userDangNhap = auth()->user();
        $khachHang = NguoiDung::find($id);

        if (!$khachHang) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy khách hàng']);
        }

        if ($userDangNhap->VaiTro === 'QuanLySan') {
            $daTungDatSan = DatSan::where('MaNguoiDung', $id)
                ->whereHas('sanBong', function ($q) use ($userDangNhap) {
                    $q->where('MaCumSan', $userDangNhap->MaCumSan);
                })->exists();

            if (!$daTungDatSan && $khachHang->MaCumSan !== $userDangNhap->MaCumSan) {
                return response()->json(['success' => false, 'message' => 'Bạn không có quyền xem thông tin của khách hàng này do họ chưa từng đặt sân của bạn!'], 403);
            }
        }

        $queryDatSan = DatSan::with(['sanBong.cumSan', 'khungGio', 'giaiDau'])
            ->where('MaNguoiDung', $id);

        if ($userDangNhap->VaiTro === 'QuanLySan') {
            $queryDatSan->whereHas('sanBong', function ($q) use ($userDangNhap) {
                $q->where('MaCumSan', $userDangNhap->MaCumSan);
            });
        }
        $lichSuDatSan = $queryDatSan->orderBy('NgayDa', 'desc')->get();

        // CÁCH LY LỊCH SỬ GIAO DỊCH QUA BẢNG HoaDonDatSan
        $queryGiaoDich = GiaoDich::where('MaNguoiDung', $id);

        if ($userDangNhap->VaiTro === 'QuanLySan') {
            $danhSachMaHoaDon = $lichSuDatSan->pluck('MaHoaDonDatSan')->filter()->unique();
            $danhSachMaGiaoDich = HoaDonDatSan::whereIn('MaHoaDonDatSan', $danhSachMaHoaDon)
                ->whereNotNull('MaGiaoDich')
                ->pluck('MaGiaoDich');

            $queryGiaoDich->whereIn('MaGiaoDich', $danhSachMaGiaoDich);
        }

        $lichSuGiaoDich = $queryGiaoDich->orderBy('NgayTao', 'desc')->get();

        if ($userDangNhap->VaiTro === 'QuanLySan') {
            $tongTienDaNap = null;
            $tongSoTran = $lichSuDatSan->count();
            $tongHoanThanh = $lichSuDatSan->where('TrangThai', 'HoanThanh')->count();
            $tongBungSan = $lichSuDatSan->where('TrangThai', 'KhongDen')->count();
        } else {
            $tongTienDaNap = GiaoDich::where('MaNguoiDung', $id)
                                     ->where('LoaiGiaoDich', 'NapTien')
                                     ->sum('SoTien');

            $tongSoTran = DatSan::where('MaNguoiDung', $id)->count();
            $tongHoanThanh = DatSan::where('MaNguoiDung', $id)->where('TrangThai', 'HoanThanh')->count();
            $tongBungSan = DatSan::where('MaNguoiDung', $id)->where('TrangThai', 'KhongDen')->count();
        }

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
            'success'           => true,
            'khach_hang'        => $khachHang,
            'thong_ke'          => $thongKe,
            'lich_su_dat_san'   => $lichSuDatSan,
            'lich_su_giao_dich' => $lichSuGiaoDich
        ]);
    }

    public function thayDoiTrangThaiKhoa($id)
    {
        $userDangNhap = auth()->user();
        $khachHang = NguoiDung::find($id);

        if (!$khachHang) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy người dùng']);
        }

        // CHỐT CHẶN BẢO MẬT: Tuyệt đối không cho phép khóa Super Admin (ND001)
        if ($khachHang->MaNguoiDung === 'ND001') {
            return response()->json(['success' => false, 'message' => 'Lỗi bảo mật: Không thể khóa Super Admin tối cao!'], 403);
        }

        if ($userDangNhap->VaiTro === 'QuanLySan') {
            if ($khachHang->VaiTro === 'Admin' || $khachHang->VaiTro === 'QuanLySan') {
                return response()->json(['success' => false, 'message' => 'Lỗi phân quyền: Quản lý sân không được khóa Admin hoặc Quản lý khác!'], 403);
            }
            if ($khachHang->VaiTro === 'NhanVien' && $khachHang->MaCumSan !== $userDangNhap->MaCumSan) {
                return response()->json(['success' => false, 'message' => 'Lỗi phân quyền: Bạn không thể khóa nhân viên của cơ sở khác!'], 403);
            }
        }

        $khachHang->TrangThaiKhoa = !$khachHang->TrangThaiKhoa;
        $khachHang->save();

        if ($khachHang->VaiTro === 'KhachHang') {
            $tieuDe = $khachHang->TrangThaiKhoa ? 'Tài khoản bị hạn chế' : 'Tài khoản được mở khóa';
            $noiDung = $khachHang->TrangThaiKhoa
                ? 'Tài khoản của bạn đã bị KHÓA chức năng đặt sân do vi phạm quy định (Bùng sân, hủy gấp nhiều lần...). Vui lòng liên hệ Admin để được giải quyết.'
                : 'Tài khoản của bạn đã được MỞ KHÓA chức năng đặt sân. Chúc bạn có những trải nghiệm tuyệt vời cùng DN FOOTBALL.';
        } else {
            $tieuDe = $khachHang->TrangThaiKhoa ? 'Tài khoản nội bộ bị khóa' : 'Tài khoản nội bộ được mở khóa';

            $nguoiLienHe = 'Admin';
            if ($khachHang->VaiTro === 'NhanVien') {
                $nguoiLienHe = 'Quản lý cơ sở của bạn';
            } elseif ($khachHang->VaiTro === 'QuanLySan') {
                $nguoiLienHe = 'Admin hệ thống';
            } elseif ($khachHang->VaiTro === 'Admin') {
                $nguoiLienHe = 'Admin tối cao';
            }

            $noiDung = $khachHang->TrangThaiKhoa
                ? "Tài khoản nội bộ của bạn đã bị KHÓA quyền truy cập. Bạn sẽ không thể thao tác trên hệ thống quản trị. Vui lòng liên hệ {$nguoiLienHe} để được giải quyết."
                : 'Tài khoản nội bộ của bạn đã được MỞ KHÓA. Bạn có thể tiếp tục công việc trên hệ thống.';
        }

        ThongBao::create([
            'MaNguoiDung'  => $khachHang->MaNguoiDung,
            'TieuDe'       => $tieuDe,
            'NoiDung'      => $noiDung,
            'LoaiThongBao' => 'HeThong'
        ]);

        broadcast(new \App\Events\UserDataUpdated($khachHang->MaNguoiDung))->toOthers();
        broadcast(new \App\Events\AdminDataUpdated())->toOthers();

        return response()->json([
            'success'         => true,
            'message'         => $khachHang->TrangThaiKhoa ? 'Đã khóa tài khoản thành công!' : 'Đã mở khóa tài khoản thành công!',
            'trang_thai_khoa' => $khachHang->TrangThaiKhoa
        ]);
    }
}