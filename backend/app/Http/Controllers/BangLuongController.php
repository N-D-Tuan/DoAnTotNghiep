<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
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

    // 1. Quản lý xem danh sách tổng quát lương của nhân viên theo tháng
    public function layDanhSachLuongQuanLy(Request $request)
    {
        $user = $request->user();
        $thangNam = $request->query('thang_nam', Carbon::now()->format('m-Y')); // Mặc định tháng hiện tại (VD: 10-2026)

        // Phân tách tháng năm
        $parts = explode('-', $thangNam);
        if (count($parts) !== 2) return response()->json(['success' => false, 'message' => 'Định dạng tháng năm sai (MM-YYYY)']);
        $thang = $parts[0];
        $nam = $parts[1];

        // Lấy danh sách nhân viên thuộc cơ sở của Quản lý
        $nhanViens = NguoiDung::where('ID_CumSan', $user->ID_CumSan)
            ->whereIn('VaiTro', ['NhanVien'])
            ->get();

        $danhSach = [];

        foreach ($nhanViens as $nv) {
            // Kiểm tra xem tháng này đã có record chốt lương trong DB chưa
            $bangLuongChot = BangLuong::where('ID_NhanVien', $nv->ID)
                ->where('ThangNam', $thangNam)
                ->first();

            if ($bangLuongChot && $bangLuongChot->TrangThai !== 'KhieuNai') {
                $danhSach[] = [
                    'id_nhan_vien' => $nv->ID,
                    'ten_nhan_vien' => $nv->HoTen,
                    'bang_luong_id' => $bangLuongChot->ID,
                    'tong_ca_lam' => $bangLuongChot->TongCaLam,
                    'tong_luong' => $bangLuongChot->TongTienLuong,
                    'tong_thuong' => $bangLuongChot->TongTienThuong,
                    'tong_phat' => $bangLuongChot->TongTienPhat,
                    'thuc_lanh' => $bangLuongChot->ThucLanh, 
                    'trang_thai' => $bangLuongChot->TrangThai,
                    'is_chot' => true
                ];
            } else {
                // NẾU CHƯA CHỐT: Tính toán động Realtime từ bảng LichLamViec
                // Tính dựa trên những ca Đã làm (DaLam)
                $lichLamThang = LichLamViec::join('CaLamViec', 'LichLamViec.ID_CaLamViec', '=', 'CaLamViec.ID')
                    ->where('LichLamViec.ID_NhanVien', $nv->ID)
                    ->where('LichLamViec.TrangThaiXepLich', 'DaDuyet')
                    ->whereMonth('LichLamViec.NgayLam', $thang)
                    ->whereYear('LichLamViec.NgayLam', $nam)
                    ->select('LichLamViec.*', 'CaLamViec.LuongThuNgan', 'CaLamViec.LuongPhucVu')
                    ->get();

                $tongCa = count($lichLamThang);
                $tongLuong = 0;
                $tongThuong = 0;
                $tongPhat = 0;

                foreach ($lichLamThang as $lich) {
                    // Chỉ đếm số lượng ca và tính lương CB cho ca DaLam
                    if ($lich->TrangThaiDiemDanh === 'DaLam') {
                        $tongCa++;
                        $tongLuong += ($lich->CongViec === 'ThuNgan') ? $lich->LuongThuNgan : $lich->LuongPhucVu;
                    }
                    
                    // Thưởng và Phạt tính cho TẤT CẢ các ca (Vắng mặt vẫn bị phạt)
                    $tongThuong += ($lich->TienThuong ?? 0);
                    $tongPhat += ($lich->TienPhat ?? 0);
                }

                $thucLanh = $tongLuong + $tongThuong - $tongPhat;
                if ($thucLanh < 0) $thucLanh = 0;

                $danhSach[] = [
                    'id_nhan_vien' => $nv->ID,
                    'ten_nhan_vien' => $nv->HoTen,
                    'bang_luong_id' => $bangLuongChot ? $bangLuongChot->ID : null, 
                    'tong_ca_lam' => $tongCa,
                    'tong_luong' => $tongLuong,
                    'tong_thuong' => $tongThuong,
                    'tong_phat' => $tongPhat,
                    'thuc_lanh' => $thucLanh,
                    // Nếu đã có bảng lương nhưng bị khiếu nại thì giữ nguyên chữ KhieuNai, nếu không thì ChuaChot
                    'trang_thai' => $bangLuongChot ? $bangLuongChot->TrangThai : 'ChuaChot',
                    'is_chot' => false // Báo cho UI biết là số liệu này chưa được chốt cứng
                ];
            }
        }

        return response()->json(['success' => true, 'data' => $danhSach]);
    }

    // 2. Quản lý Chốt Lương (Yêu cầu 3)
    public function chotLuong(Request $request)
    {
        $request->validate([
            'id_nhan_vien' => 'required',
            'thang_nam' => 'required'
        ]);

        $thangNam = $request->thang_nam;
        $idNhanVien = $request->id_nhan_vien;

        // Tránh chốt đúp
        $exist = BangLuong::where('ID_NhanVien', $idNhanVien)->where('ThangNam', $thangNam)->first();
        if ($exist && $exist->TrangThai !== 'KhieuNai') {
            return response()->json(['success' => false, 'message' => 'Lương tháng này đã được chốt.']);
        }

        // Tính toán lại lần cuối để lưu cứng
        $parts = explode('-', $thangNam);
        $thang = $parts[0]; $nam = $parts[1];

        $lichLamThang = LichLamViec::join('CaLamViec', 'LichLamViec.ID_CaLamViec', '=', 'CaLamViec.ID')
            ->where('LichLamViec.ID_NhanVien', $idNhanVien)
            ->where('LichLamViec.TrangThaiXepLich', 'DaDuyet')
            ->whereMonth('LichLamViec.NgayLam', $thang)
            ->whereYear('LichLamViec.NgayLam', $nam)
            ->select('LichLamViec.*', 'CaLamViec.LuongThuNgan', 'CaLamViec.LuongPhucVu')
            ->get();

        $tongCa = count($lichLamThang);
        $tongLuong = 0; $tongThuong = 0; $tongPhat = 0;

        foreach ($lichLamThang as $lich) {
            if ($lich->TrangThaiDiemDanh === 'DaLam') {
                $tongCa++;
                $tongLuong += ($lich->CongViec === 'ThuNgan') ? $lich->LuongThuNgan : $lich->LuongPhucVu;
            }
            $tongThuong += ($lich->TienThuong ?? 0);
            $tongPhat += ($lich->TienPhat ?? 0);
        }

        $ngayHienTai = Carbon::now()->toDateTimeString();

        if ($exist && $exist->TrangThai === 'KhieuNai') {
            // Chốt lại (Cập nhật) - Không gán $exist->ThucLanh vì nó là accessor
            $exist->TongCaLam = $tongCa;
            $exist->TongTienLuong = $tongLuong;
            $exist->TongTienThuong = $tongThuong;
            $exist->TongTienPhat = $tongPhat;
            $exist->TrangThai = 'ChoXacNhan'; // Chuyển lại cho nhân viên xem
            $exist->NgayChot = $ngayHienTai; // Yêu cầu 3: Ghi nhận ngày chốt
            $exist->save();
        } else {
            // Chốt mới (Thêm mới) - Không truyền 'ThucLanh' vào mảng create
            BangLuong::create([
                'ID_NhanVien' => $idNhanVien,
                'ThangNam' => $thangNam,
                'TongCaLam' => $tongCa,
                'TongTienLuong' => $tongLuong,
                'TongTienThuong' => $tongThuong,
                'TongTienPhat' => $tongPhat,
                'TrangThai' => 'ChoXacNhan',
                'NgayChot' => $ngayHienTai // Yêu cầu 3
            ]);
        }

        // Bắn thông báo (Yêu cầu 1)
        ThongBao::create([
            'ID_NguoiDung' => $idNhanVien,
            'TieuDe' => 'Quản lý đã chốt bảng lương',
            'NoiDung' => "Bảng lương tháng {$thangNam} của bạn đã được chốt. Vui lòng vào kiểm tra và xác nhận thanh toán.",
            'LoaiThongBao' => 'HeThong'
        ]);

        broadcast(new \App\Events\UserDataUpdated($idNhanVien))->toOthers();

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
            'TieuDe' => 'Đã chuyển khoản tiền lương',
            'NoiDung' => "Lương tháng {$bg->ThangNam} đã được thanh toán. Vui lòng kiểm tra tài khoản ngân hàng.",
            'LoaiThongBao' => 'ViTien'
        ]);

        broadcast(new \App\Events\UserDataUpdated($bg->ID_NhanVien))->toOthers();

        return response()->json(['success' => true, 'message' => 'Xác nhận thanh toán thành công.']);
    }

    // ==========================================
    // MODULE 2: DÀNH CHO NHÂN VIÊN
    // ==========================================

    // 4. Nhân viên lấy Lịch sử các tháng
    public function lichSuLuongNhanVien(Request $request)
    {
        $user = $request->user();
        
        // Trả về tất cả các bản ghi có trong BangLuong (Trường ThucLanh tự động được lấy ra do $appends)
        $history = BangLuong::where('ID_NhanVien', $user->ID)
            ->orderBy('ID', 'desc')
            ->get();

        return response()->json(['success' => true, 'data' => $history]);
    }

    // 5. Nhân viên/Quản lý Xem chi tiết 1 tháng (Yêu cầu 5: Render Lịch tháng)
    public function xemChiTietThang(Request $request)
    {
        // Có thể truyền bang_luong_id HOẶC (thang_nam + id_nhan_vien)
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

        // Lấy lịch sử ca làm của tháng (Đã duyệt)
        $lichLamViec = LichLamViec::with('caLamViec')
            ->where('ID_NhanVien', $idNhanVien)
            ->where('TrangThaiXepLich', 'DaDuyet')
            ->whereMonth('NgayLam', $thang)
            ->whereYear('NgayLam', $nam)
            ->orderBy('NgayLam', 'asc')
            ->get();

        $lichThang = $lichLamViec->map(function($lich) {
            $luong = 0;
            if ($lich->caLamViec) {
                $luong = ($lich->CongViec === 'ThuNgan') ? $lich->caLamViec->LuongThuNgan : $lich->caLamViec->LuongPhucVu;
            }
            
            return [
                'ngay_lam' => $lich->NgayLam,
                'ten_ca' => $lich->caLamViec ? $lich->caLamViec->TenCa : 'N/A',
                'cong_viec' => $lich->CongViec,
                'trang_thai_diem_danh' => $lich->TrangThaiDiemDanh, 
                'luong_co_ban' => (int) $luong,
                'tien_thuong' => (int) ($lich->TienThuong ?? 0),
                'tien_phat' => (int) ($lich->TienPhat ?? 0),
                'ly_do' => $lich->LyDoDieuChinh
            ];
        });

        // Tính toán lại tổng để chắc chắn khớp 100% với lưới (kể cả khi đã chốt lương)
        $tongCa = 0; $tongLuong = 0; $tongThuong = 0; $tongPhat = 0;
        foreach ($lichThang as $l) {
           // Lương cơ bản và số ca làm chỉ tính cho ca đã làm
            if ($l['trang_thai_diem_danh'] === 'DaLam') {
                $tongCa++;
                $tongLuong += $l['luong_co_ban'];
            }
            // Thưởng và Phạt tính cho TẤT CẢ các ca (kể cả Vắng mặt)
            $tongThuong += $l['tien_thuong'];
            $tongPhat += $l['tien_phat'];
        }
        $thucLanh = max(0, $tongLuong + $tongThuong - $tongPhat);

        if (!$bangLuong) {
            $tongTin = [
                'is_chot' => false,
                'ThangNam' => $thangNam,
                'TongCaLam' => $tongCa,
                'TongTienLuong' => $tongLuong,
                'TongTienThuong' => $tongThuong,
                'TongTienPhat' => $tongPhat,
                'ThucLanh' => $thucLanh,
                'TrangThai' => 'ChuaChot'
            ];
        } else {
            // Khi đã chốt, lấy data từ Database để hiển thị trạng thái, nhưng tiền hiển thị ở header Modal phải luôn chuẩn theo các dòng cộng lại
            $tongTin = clone $bangLuong;
            $tongTin->is_chot = true;
            $tongTin->TongTienThuong = $tongThuong;
            $tongTin->TongTienPhat = $tongPhat;
            $tongTin->ThucLanh = $thucLanh;
        }

        return response()->json([
            'success' => true,
            'tong_quan' => $tongTin,
            'lich_thang' => $lichThang 
        ]);
    }

    // 6. Nhân viên xác nhận đồng ý (Yêu cầu 2: Lưu Ngân hàng và chuyển trạng thái)
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

        $bg->ThongTinNganHang = $request->thong_tin_ngan_hang; // Lưu chuỗi VD: "VCB - 10123 - Nguyen Van A"
        $bg->NgayXacNhan = Carbon::now()->toDateTimeString(); // Lưu thời gian bấm xác nhận
        $bg->TrangThai = 'ChoThanhToan'; // Trạng thái sẵn sàng cho Quản lý ck
        $bg->LyDoKhieuNai = null; // Xóa trắng khiếu nại (nếu có từ trước)
        $bg->save();

        // Gửi thông báo cho Quản lý
        $managers = NguoiDung::where('VaiTro', 'QuanLySan')->where('ID_CumSan', $user->ID_CumSan)->get();
        foreach ($managers as $mgr) {
            ThongBao::create([
                'ID_NguoiDung' => $mgr->ID,
                'TieuDe' => 'Nhân viên đã xác nhận lương',
                'NoiDung' => "Nhân viên {$user->HoTen} đã xác nhận bảng lương tháng {$bg->ThangNam}. Vui lòng kiểm tra và tiến hành thanh toán.",
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

        // Gửi thông báo cho Quản lý
        $managers = NguoiDung::where('VaiTro', 'QuanLySan')->where('ID_CumSan', $user->ID_CumSan)->get();
        foreach ($managers as $mgr) {
            ThongBao::create([
                'ID_NguoiDung' => $mgr->ID,
                'TieuDe' => 'Khiếu nại bảng lương',
                'NoiDung' => "Nhân viên {$user->HoTen} vừa báo cáo sai sót bảng lương tháng {$bg->ThangNam}. Vui lòng kiểm tra lại bảng công.",
                'LoaiThongBao' => 'HeThong'
            ]);
            broadcast(new \App\Events\UserDataUpdated($mgr->ID))->toOthers();
        }

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Đã gửi báo cáo sai sót. Quản lý sẽ kiểm tra lại.']);
    }
}