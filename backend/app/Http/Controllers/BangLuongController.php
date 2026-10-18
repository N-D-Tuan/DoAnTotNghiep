<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use App\Models\BangLuong;
use App\Models\LichLamViec;
use App\Models\NguoiDung;
use App\Models\ThongBao;
use Carbon\Carbon;

class BangLuongController extends Controller
{
    // ==========================================
    // MODULE 1: DÀNH CHO QUẢN LÝ / ADMIN
    // ==========================================

    // 1. Quản lý / Admin xem danh sách tổng quát lương của nhân viên theo tháng
    public function layDanhSachLuongQuanLy(Request $request)
    {
        $user = $request->user();
        $thangNam = $request->query('thang_nam', Carbon::now()->format('m-Y'));

        $parts = explode('-', $thangNam);
        if (count($parts) !== 2) {
            return response()->json(['success' => false, 'message' => 'Định dạng tháng năm sai (MM-YYYY)']);
        }
        $thang = $parts[0];
        $nam = $parts[1];

        $queryNhanVien = NguoiDung::with('cumSan')->whereIn('VaiTro', ['NhanVien']);
        if ($user->VaiTro === 'QuanLySan') {
            $queryNhanVien->where('ID_CumSan', $user->ID_CumSan);
        } elseif ($request->filled('id_cum_san') && $request->query('id_cum_san') !== 'All') {
            $queryNhanVien->where('ID_CumSan', $request->query('id_cum_san'));
        }

        $nhanViens = $queryNhanVien->orderBy('ID_CumSan', 'asc')->orderBy('ID', 'asc')->get();
        $danhSach = [];

        foreach ($nhanViens as $nv) {
            $bangLuongChot = BangLuong::where('ID_NhanVien', $nv->ID)
                ->where('ThangNam', $thangNam)
                ->first();

            $tenCumSan = $nv->cumSan ? $nv->cumSan->TenCumSan : 'Chưa phân cơ sở';

            // NẾU ĐÃ CÓ BẢNG LƯƠNG (Bất kể trạng thái ChoXacNhan, KhieuNai, ChoThanhToan, DaThanhToan)
            // -> LUÔN GIỮ NGUYÊN TongTienLuong ĐÃ CHỐT TRONG BẢNG LƯƠNG
            if ($bangLuongChot) {
                if ($bangLuongChot->TrangThai === 'KhieuNai') {
                    // Khi đang Khiếu nại: Giữ nguyên Lương cơ bản lúc chốt, chỉ cập nhật lại Thưởng/Phạt nếu Quản lý vừa sửa công
                    $lichLamThang = LichLamViec::where('ID_NhanVien', $nv->ID)
                        ->where('TrangThaiXepLich', 'DaDuyet')
                        ->whereMonth('NgayLam', $thang)
                        ->whereYear('NgayLam', $nam)
                        ->get();

                    $tongCa = $lichLamThang->where('TrangThaiDiemDanh', 'DaLam')->count();
                    $tongLuong = (int) $bangLuongChot->TongTienLuong; // CỐ ĐỊNH LƯƠNG CƠ BẢN ĐÃ CHỐT
                    $tongThuong = (int) $lichLamThang->sum('TienThuong');
                    $tongPhat = (int) $lichLamThang->sum('TienPhat');
                    $thucLanh = max(0, $tongLuong + $tongThuong - $tongPhat);
                } else {
                    $tongCa = (int) $bangLuongChot->TongCaLam;
                    $tongLuong = (int) $bangLuongChot->TongTienLuong;
                    $tongThuong = (int) $bangLuongChot->TongTienThuong;
                    $tongPhat = (int) $bangLuongChot->TongTienPhat;
                    $thucLanh = (int) $bangLuongChot->ThucLanh;
                }

                $danhSach[] = [
                    'id_nhan_vien'        => $nv->ID,
                    'ten_nhan_vien'       => $nv->HoTen,
                    'so_dien_thoai'       => $nv->SoDienThoai,
                    'id_cum_san'          => $nv->ID_CumSan,
                    'ten_cum_san'         => $tenCumSan,
                    'bang_luong_id'       => $bangLuongChot->ID,
                    'tong_ca_lam'         => $tongCa,
                    'tong_luong'          => $tongLuong,
                    'tong_thuong'         => $tongThuong,
                    'tong_phat'           => $tongPhat,
                    'thuc_lanh'           => $thucLanh,
                    'trang_thai'          => $bangLuongChot->TrangThai,
                    'thong_tin_ngan_hang' => $bangLuongChot->ThongTinNganHang,
                    'ly_do_khieu_nai'     => $bangLuongChot->LyDoKhieuNai,
                    'ngay_chot'           => $bangLuongChot->NgayChot,
                    'ngay_xac_nhan'       => $bangLuongChot->NgayXacNhan,
                    'ngay_thanh_toan'     => $bangLuongChot->NgayThanhToan,
                    'is_chot'             => ($bangLuongChot->TrangThai !== 'KhieuNai')
                ];
            } else {
                // CHƯA CÓ BẢNG LƯƠNG (ChuaChot): Tính động theo cấu hình CaLamViec hiện tại
                $lichLamThang = LichLamViec::join('CaLamViec', 'LichLamViec.ID_CaLamViec', '=', 'CaLamViec.ID')
                    ->where('LichLamViec.ID_NhanVien', $nv->ID)
                    ->where('LichLamViec.TrangThaiXepLich', 'DaDuyet')
                    ->whereMonth('LichLamViec.NgayLam', $thang)
                    ->whereYear('LichLamViec.NgayLam', $nam)
                    ->select('LichLamViec.*', 'CaLamViec.LuongThuNgan', 'CaLamViec.LuongPhucVu')
                    ->get();

                $tongCa = 0;
                $tongLuong = 0;
                $tongThuong = 0;
                $tongPhat = 0;

                foreach ($lichLamThang as $lich) {
                    if ($lich->TrangThaiDiemDanh === 'DaLam') {
                        $tongCa++;
                        $tongLuong += ($lich->CongViec === 'ThuNgan') ? $lich->LuongThuNgan : $lich->LuongPhucVu;
                    }
                    $tongThuong += ($lich->TienThuong ?? 0);
                    $tongPhat += ($lich->TienPhat ?? 0);
                }

                $thucLanh = max(0, $tongLuong + $tongThuong - $tongPhat);

                $danhSach[] = [
                    'id_nhan_vien'        => $nv->ID,
                    'ten_nhan_vien'       => $nv->HoTen,
                    'so_dien_thoai'       => $nv->SoDienThoai,
                    'id_cum_san'          => $nv->ID_CumSan,
                    'ten_cum_san'         => $tenCumSan,
                    'bang_luong_id'       => null,
                    'tong_ca_lam'         => $tongCa,
                    'tong_luong'          => $tongLuong,
                    'tong_thuong'         => $tongThuong,
                    'tong_phat'           => $tongPhat,
                    'thuc_lanh'           => $thucLanh,
                    'trang_thai'          => 'ChuaChot',
                    'thong_tin_ngan_hang' => null,
                    'ly_do_khieu_nai'     => null,
                    'ngay_chot'           => null,
                    'ngay_xac_nhan'       => null,
                    'ngay_thanh_toan'     => null,
                    'is_chot'             => false
                ];
            }
        }

        return response()->json(['success' => true, 'data' => $danhSach]);
    }

    // 2. Quản lý Chốt Lương
    public function chotLuong(Request $request)
    {
        $request->validate([
            'id_nhan_vien' => 'required',
            'thang_nam' => 'required'
        ]);

        $thangNam = $request->thang_nam;
        $idNhanVien = $request->id_nhan_vien;

        $exist = BangLuong::where('ID_NhanVien', $idNhanVien)->where('ThangNam', $thangNam)->first();
        if ($exist && $exist->TrangThai !== 'KhieuNai') {
            return response()->json(['success' => false, 'message' => 'Lương tháng này đã được chốt.']);
        }

        $parts = explode('-', $thangNam);
        $thang = $parts[0]; $nam = $parts[1];

        $lichLamThang = LichLamViec::join('CaLamViec', 'LichLamViec.ID_CaLamViec', '=', 'CaLamViec.ID')
            ->where('LichLamViec.ID_NhanVien', $idNhanVien)
            ->where('LichLamViec.TrangThaiXepLich', 'DaDuyet')
            ->whereMonth('LichLamViec.NgayLam', $thang)
            ->whereYear('LichLamViec.NgayLam', $nam)
            ->select('LichLamViec.*', 'CaLamViec.LuongThuNgan', 'CaLamViec.LuongPhucVu')
            ->get();

        // Key lưu Snapshot mức lương cơ bản của từng ca lúc chốt
        $snapshotKey = "salary_snapshot_{$idNhanVien}_{$thangNam}";
        $existingSnapshot = Cache::get($snapshotKey, []);
        $newSnapshot = $existingSnapshot;

        $tongCa = 0;
        $tongLuong = 0; $tongThuong = 0; $tongPhat = 0;

        foreach ($lichLamThang as $lich) {
            if ($lich->TrangThaiDiemDanh === 'DaLam') {
                $tongCa++;
                // Nếu ca này đã từng được lưu mức lương lúc chốt lần đầu (trường hợp chốt lại sau Khiếu nại) -> Giữ nguyên mức lương cũ
                // Nếu là ca mới được chấm công bổ sung -> Lấy mức lương tại thời điểm chốt này và khóa lại
                if (isset($existingSnapshot[$lich->ID])) {
                    $mucLuongCa = (int) $existingSnapshot[$lich->ID];
                } else {
                    $mucLuongCa = (int) (($lich->CongViec === 'ThuNgan') ? $lich->LuongThuNgan : $lich->LuongPhucVu);
                    $newSnapshot[$lich->ID] = $mucLuongCa;
                }
                $tongLuong += $mucLuongCa;
            }
            $tongThuong += ($lich->TienThuong ?? 0);
            $tongPhat += ($lich->TienPhat ?? 0);
        }

        // Lưu cứng bảng giá từng ca vào Cache vĩnh viễn
        Cache::forever($snapshotKey, $newSnapshot);

        $ngayHienTai = Carbon::now()->toDateTimeString();

        if ($exist && $exist->TrangThai === 'KhieuNai') {
            $exist->TongCaLam = $tongCa;
            $exist->TongTienLuong = $tongLuong;
            $exist->TongTienThuong = $tongThuong;
            $exist->TongTienPhat = $tongPhat;
            $exist->ThucLanh = max(0, $tongLuong + $tongThuong - $tongPhat);
            $exist->TrangThai = 'ChoXacNhan';
            $exist->NgayChot = $ngayHienTai;
            $exist->save();
        } else {
            BangLuong::create([
                'ID_NhanVien'    => $idNhanVien,
                'ThangNam'       => $thangNam,
                'TongCaLam'      => $tongCa,
                'TongTienLuong'  => $tongLuong,
                'TongTienThuong' => $tongThuong,
                'TongTienPhat'   => $tongPhat,
                'ThucLanh'       => max(0, $tongLuong + $tongThuong - $tongPhat),
                'TrangThai'      => 'ChoXacNhan',
                'NgayChot'       => $ngayHienTai
            ]);
        }

        ThongBao::create([
            'ID_NguoiDung' => $idNhanVien,
            'TieuDe'       => 'Quản lý đã chốt bảng lương',
            'NoiDung'      => "Bảng lương tháng {$thangNam} của bạn đã được chốt. Vui lòng vào kiểm tra và xác nhận thanh toán.",
            'LoaiThongBao' => 'HeThong'
        ]);

        broadcast(new \App\Events\UserDataUpdated($idNhanVien))->toOthers();
        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Đã chốt và gửi bảng lương cho nhân viên.']);
    }

    // 3. Quản lý hoàn tất thanh toán
    public function thanhToan(Request $request, $id)
    {
        $bg = BangLuong::find($id);
        if (!$bg || $bg->TrangThai !== 'ChoThanhToan') {
            return response()->json(['success' => false, 'message' => 'Lỗi trạng thái! Nhân viên chưa xác nhận.']);
        }

        $bg->TrangThai = 'DaThanhToan';
        $bg->NgayThanhToan = Carbon::now()->toDateTimeString();
        $bg->save();

        ThongBao::create([
            'ID_NguoiDung' => $bg->ID_NhanVien,
            'TieuDe'       => 'Đã chuyển khoản tiền lương',
            'NoiDung'      => "Lương tháng {$bg->ThangNam} đã được thanh toán. Vui lòng kiểm tra tài khoản ngân hàng.",
            'LoaiThongBao' => 'ViTien'
        ]);

        broadcast(new \App\Events\UserDataUpdated($bg->ID_NhanVien))->toOthers();
        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Xác nhận thanh toán thành công.']);
    }

    // ==========================================
    // MODULE 2: DÀNH CHO NHÂN VIÊN
    // ==========================================

    // 4. Nhân viên lấy Lịch sử các tháng
    public function lichSuLuongNhanVien(Request $request)
    {
        $user = $request->user();
        
        $history = BangLuong::where('ID_NhanVien', $user->ID)
            ->orderBy('ID', 'desc')
            ->get();

        return response()->json(['success' => true, 'data' => $history]);
    }

    // 5. Nhân viên/Quản lý/Admin Xem chi tiết 1 tháng
    public function xemChiTietThang(Request $request)
    {
        $id = $request->query('bang_luong_id');
        $thangNam = $request->query('thang_nam');
        $idNhanVien = $request->query('id_nhan_vien', $request->user()->ID);

        $bangLuong = null;
        if ($id) {
            $bangLuong = BangLuong::find($id);
            $thangNam = $bangLuong->ThangNam;
            $idNhanVien = $bangLuong->ID_NhanVien;
        } elseif ($thangNam) {
            $bangLuong = BangLuong::where('ID_NhanVien', $idNhanVien)->where('ThangNam', $thangNam)->first();
        }

        if (!$thangNam) return response()->json(['success' => false, 'message' => 'Thiếu tham số.']);

        $parts = explode('-', $thangNam);
        $thang = $parts[0]; $nam = $parts[1];

        $lichLamViec = LichLamViec::with('caLamViec')
            ->where('ID_NhanVien', $idNhanVien)
            ->where('TrangThaiXepLich', 'DaDuyet')
            ->whereMonth('NgayLam', $thang)
            ->whereYear('NgayLam', $nam)
            ->orderBy('NgayLam', 'asc')
            ->get();

        // Lấy Snapshot lương từng ca nếu tháng này đã có Bảng lương
        $snapshotKey = "salary_snapshot_{$idNhanVien}_{$thangNam}";
        $snapshot = $bangLuong ? Cache::get($snapshotKey, []) : [];

        $lichThang = $lichLamViec->map(function($lich) use ($bangLuong, $snapshot) {
            $luongHienThi = 0;
            if ($lich->caLamViec) {
                $luongHienThi = ($lich->CongViec === 'ThuNgan')
                    ? (int) $lich->caLamViec->LuongThuNgan
                    : (int) $lich->caLamViec->LuongPhucVu;
            }

            // Nếu đã có Bảng lương và có lưu Snapshot của ca này -> Lấy đúng số tiền nguyên bản lúc chốt (VD: 150.000đ, 170.000đ)
            if ($bangLuong && isset($snapshot[$lich->ID])) {
                $luongHienThi = (int) $snapshot[$lich->ID];
            }

            return [
                'ngay_lam'             => $lich->NgayLam,
                'ten_ca'               => $lich->caLamViec ? $lich->caLamViec->TenCa : 'N/A',
                'cong_viec'            => $lich->CongViec,
                'trang_thai_diem_danh' => $lich->TrangThaiDiemDanh, 
                'luong_co_ban'         => (int) $luongHienThi,
                'tien_thuong'          => (int) ($lich->TienThuong ?? 0),
                'tien_phat'            => (int) ($lich->TienPhat ?? 0),
                'ly_do'                => $lich->LyDoDieuChinh
            ];
        });

        $tongCa = 0; $tongLuong = 0; $tongThuong = 0; $tongPhat = 0;
        foreach ($lichThang as $l) {
            if ($l['trang_thai_diem_danh'] === 'DaLam') {
                $tongCa++;
                $tongLuong += $l['luong_co_ban'];
            }
            $tongThuong += $l['tien_thuong'];
            $tongPhat += $l['tien_phat'];
        }

        if (!$bangLuong) {
            $thucLanh = max(0, $tongLuong + $tongThuong - $tongPhat);
            $tongTin = [
                'is_chot'        => false,
                'ThangNam'       => $thangNam,
                'TongCaLam'      => $tongCa,
                'TongTienLuong'  => $tongLuong,
                'TongTienThuong' => $tongThuong,
                'TongTienPhat'   => $tongPhat,
                'ThucLanh'       => $thucLanh,
                'TrangThai'      => 'ChuaChot'
            ];
        } else {
            $tongTin = clone $bangLuong;
            $tongTin->is_chot = true;
            $tongTin->TongTienLuong = (int) $bangLuong->TongTienLuong;
            if ($bangLuong->TrangThai === 'KhieuNai') {
                $tongTin->TongCaLam = $tongCa;
                $tongTin->TongTienThuong = $tongThuong;
                $tongTin->TongTienPhat = $tongPhat;
                $tongTin->ThucLanh = max(0, (int) $bangLuong->TongTienLuong + $tongThuong - $tongPhat);
            }
        }

        return response()->json([
            'success'    => true,
            'tong_quan'  => $tongTin,
            'lich_thang' => $lichThang 
        ]);
    }

    // 6. Nhân viên xác nhận đồng ý
    public function xacNhan(Request $request, $id)
    {
        $user = $request->user();
        $request->validate([
            'thong_tin_ngan_hang' => 'required|string'
        ]);

        $bg = BangLuong::where('ID', $id)->where('ID_NhanVien', $user->ID)->first();
        if (!$bg || $bg->TrangThai !== 'ChoXacNhan') {
            return response()->json(['success' => false, 'message' => 'Dữ liệu không hợp lệ.']);
        }

        $bg->ThongTinNganHang = $request->thong_tin_ngan_hang;
        $bg->NgayXacNhan = Carbon::now()->toDateTimeString();
        $bg->TrangThai = 'ChoThanhToan';
        $bg->LyDoKhieuNai = null;
        $bg->save();

        $managers = NguoiDung::where('VaiTro', 'QuanLySan')->where('ID_CumSan', $user->ID_CumSan)->get();
        foreach ($managers as $mgr) {
            ThongBao::create([
                'ID_NguoiDung' => $mgr->ID,
                'TieuDe'       => 'Nhân viên đã xác nhận lương',
                'NoiDung'      => "Nhân viên {$user->HoTen} đã xác nhận bảng lương tháng {$bg->ThangNam}. Vui lòng kiểm tra và tiến hành thanh toán.",
                'LoaiThongBao' => 'HeThong'
            ]);
            broadcast(new \App\Events\UserDataUpdated($mgr->ID))->toOthers();
        }

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Đã gửi xác nhận. Quản lý sẽ sớm chuyển khoản cho bạn.']);
    }

    // 7. Nhân viên Báo Cáo Sai Sót (Khiếu nại)
    public function khieuNai(Request $request, $id)
    {
        $user = $request->user();
        $request->validate([
            'ly_do' => 'required|string'
        ]);

        $bg = BangLuong::where('ID', $id)->where('ID_NhanVien', $user->ID)->first();
        if (!$bg || $bg->TrangThai !== 'ChoXacNhan') {
            return response()->json(['success' => false, 'message' => 'Dữ liệu không hợp lệ.']);
        }

        $bg->TrangThai = 'KhieuNai';
        $bg->LyDoKhieuNai = $request->ly_do;
        $bg->save();

        $managers = NguoiDung::where('VaiTro', 'QuanLySan')->where('ID_CumSan', $user->ID_CumSan)->get();
        foreach ($managers as $mgr) {
            ThongBao::create([
                'ID_NguoiDung' => $mgr->ID,
                'TieuDe'       => 'Khiếu nại bảng lương',
                'NoiDung'      => "Nhân viên {$user->HoTen} vừa báo cáo sai sót bảng lương tháng {$bg->ThangNam}. Vui lòng kiểm tra lại bảng công.",
                'LoaiThongBao' => 'HeThong'
            ]);
            broadcast(new \App\Events\UserDataUpdated($mgr->ID))->toOthers();
        }

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Đã gửi báo cáo sai sót. Quản lý sẽ kiểm tra lại.']);
    }
}