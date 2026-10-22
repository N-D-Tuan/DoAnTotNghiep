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
    private function formatNganHang(NguoiDung $nv): ?string
    {
        if (!$nv->TenNganHang && !$nv->STKNganHang) {
            return null;
        }
        $parts = array_filter([$nv->TenNganHang, $nv->STKNganHang, $nv->TenTaiKhoan]);
        return implode(' - ', $parts);
    }

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

        $maCumSanFilter = $request->query('ma_cum_san', $request->query('id_cum_san'));

        $queryNhanVien = NguoiDung::with('cumSan')->whereIn('VaiTro', ['NhanVien']);
        if ($user->VaiTro === 'QuanLySan') {
            $queryNhanVien->where('MaCumSan', $user->MaCumSan);
        } elseif (!empty($maCumSanFilter) && $maCumSanFilter !== 'All') {
            $queryNhanVien->where('MaCumSan', $maCumSanFilter);
        }

        $nhanViens = $queryNhanVien->orderBy('MaCumSan', 'asc')->orderBy('MaNguoiDung', 'asc')->get();
        $danhSach = [];

        foreach ($nhanViens as $nv) {
            $bangLuongChot = BangLuong::where('MaNhanVien', $nv->MaNguoiDung)
                ->where('ThangNam', $thangNam)
                ->first();

            $tenCumSan = $nv->cumSan ? $nv->cumSan->TenCumSan : 'Chưa phân cơ sở';
            $thongTinNH = $this->formatNganHang($nv);

            if ($bangLuongChot) {
                if ($bangLuongChot->TrangThai === 'KhieuNai') {
                    $lichLamThang = LichLamViec::where('MaNhanVien', $nv->MaNguoiDung)
                        ->where('TrangThaiXepLich', 'DaDuyet')
                        ->whereMonth('NgayLam', $thang)
                        ->whereYear('NgayLam', $nam)
                        ->get();

                    $tongCa = $lichLamThang->where('TrangThaiDiemDanh', 'DaLam')->count();
                    $tongLuong = (int) $bangLuongChot->TongTienLuong;
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
                    'id_nhan_vien'        => $nv->MaNguoiDung,
                    'ma_nhan_vien'        => $nv->MaNguoiDung,
                    'ten_nhan_vien'       => $nv->HoTen,
                    'so_dien_thoai'       => $nv->SoDienThoai,
                    'id_cum_san'          => $nv->MaCumSan,
                    'ma_cum_san'          => $nv->MaCumSan,
                    'ten_cum_san'         => $tenCumSan,
                    'bang_luong_id'       => $bangLuongChot->MaBangLuong,
                    'ma_bang_luong'       => $bangLuongChot->MaBangLuong,
                    'tong_ca_lam'         => $tongCa,
                    'tong_luong'          => $tongLuong,
                    'tong_thuong'         => $tongThuong,
                    'tong_phat'           => $tongPhat,
                    'thuc_lanh'           => $thucLanh,
                    'trang_thai'          => $bangLuongChot->TrangThai,
                    'thong_tin_ngan_hang' => $thongTinNH,
                    'ten_ngan_hang'       => $nv->TenNganHang,
                    'stk_ngan_hang'       => $nv->STKNganHang,
                    'ten_tai_khoan'       => $nv->TenTaiKhoan,
                    'ly_do_khieu_nai'     => $bangLuongChot->LyDoKhieuNai,
                    'ngay_chot'           => $bangLuongChot->NgayChot,
                    'ngay_xac_nhan'       => $bangLuongChot->NgayXacNhan,
                    'ngay_thanh_toan'     => $bangLuongChot->NgayThanhToan,
                    'is_chot'             => ($bangLuongChot->TrangThai !== 'KhieuNai')
                ];
            } else {
                $lichLamThang = LichLamViec::join('CaLamViec', 'LichLamViec.MaCaLamViec', '=', 'CaLamViec.MaCaLamViec')
                    ->where('LichLamViec.MaNhanVien', $nv->MaNguoiDung)
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
                    'id_nhan_vien'        => $nv->MaNguoiDung,
                    'ma_nhan_vien'        => $nv->MaNguoiDung,
                    'ten_nhan_vien'       => $nv->HoTen,
                    'so_dien_thoai'       => $nv->SoDienThoai,
                    'id_cum_san'          => $nv->MaCumSan,
                    'ma_cum_san'          => $nv->MaCumSan,
                    'ten_cum_san'         => $tenCumSan,
                    'bang_luong_id'       => null,
                    'ma_bang_luong'       => null,
                    'tong_ca_lam'         => $tongCa,
                    'tong_luong'          => $tongLuong,
                    'tong_thuong'         => $tongThuong,
                    'tong_phat'           => $tongPhat,
                    'thuc_lanh'           => $thucLanh,
                    'trang_thai'          => 'ChuaChot',
                    'thong_tin_ngan_hang' => $thongTinNH,
                    'ten_ngan_hang'       => $nv->TenNganHang,
                    'stk_ngan_hang'       => $nv->STKNganHang,
                    'ten_tai_khoan'       => $nv->TenTaiKhoan,
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
        $maNhanVien = $request->input('ma_nhan_vien', $request->input('id_nhan_vien'));
        $request->merge(['ma_nhan_vien_check' => $maNhanVien]);

        $request->validate([
            'ma_nhan_vien_check' => 'required|string',
            'thang_nam'          => 'required|string'
        ]);

        $thangNam = $request->thang_nam;

        $exist = BangLuong::where('MaNhanVien', $maNhanVien)->where('ThangNam', $thangNam)->first();
        if ($exist && $exist->TrangThai !== 'KhieuNai') {
            return response()->json(['success' => false, 'message' => 'Lương tháng này đã được chốt.']);
        }

        $parts = explode('-', $thangNam);
        $thang = $parts[0]; $nam = $parts[1];

        $lichLamThang = LichLamViec::join('CaLamViec', 'LichLamViec.MaCaLamViec', '=', 'CaLamViec.MaCaLamViec')
            ->where('LichLamViec.MaNhanVien', $maNhanVien)
            ->where('LichLamViec.TrangThaiXepLich', 'DaDuyet')
            ->whereMonth('LichLamViec.NgayLam', $thang)
            ->whereYear('LichLamViec.NgayLam', $nam)
            ->select('LichLamViec.*', 'CaLamViec.LuongThuNgan', 'CaLamViec.LuongPhucVu')
            ->get();

        $snapshotKey = "salary_snapshot_{$maNhanVien}_{$thangNam}";
        $existingSnapshot = Cache::get($snapshotKey, []);
        $newSnapshot = $existingSnapshot;

        $tongCa = 0;
        $tongLuong = 0; $tongThuong = 0; $tongPhat = 0;

        foreach ($lichLamThang as $lich) {
            if ($lich->TrangThaiDiemDanh === 'DaLam') {
                $tongCa++;
                $maLLV = $lich->MaLichLamViec;
                if (isset($existingSnapshot[$maLLV])) {
                    $mucLuongCa = (int) $existingSnapshot[$maLLV];
                } else {
                    $mucLuongCa = (int) (($lich->CongViec === 'ThuNgan') ? $lich->LuongThuNgan : $lich->LuongPhucVu);
                    $newSnapshot[$maLLV] = $mucLuongCa;
                }
                $tongLuong += $mucLuongCa;
            }
            $tongThuong += ($lich->TienThuong ?? 0);
            $tongPhat += ($lich->TienPhat ?? 0);
        }

        Cache::forever($snapshotKey, $newSnapshot);

        $ngayHienTai = Carbon::now()->toDateTimeString();

        if ($exist && $exist->TrangThai === 'KhieuNai') {
            $exist->TongCaLam = $tongCa;
            $exist->TongTienLuong = $tongLuong;
            $exist->TongTienThuong = $tongThuong;
            $exist->TongTienPhat = $tongPhat;
            $exist->TrangThai = 'ChoXacNhan';
            $exist->NgayChot = $ngayHienTai;
            $exist->save();
        } else {
            BangLuong::create([
                'MaNhanVien'     => $maNhanVien,
                'ThangNam'       => $thangNam,
                'TongCaLam'      => $tongCa,
                'TongTienLuong'  => $tongLuong,
                'TongTienThuong' => $tongThuong,
                'TongTienPhat'   => $tongPhat,
                'TrangThai'      => 'ChoXacNhan',
                'NgayChot'       => $ngayHienTai
            ]);
        }

        ThongBao::create([
            'MaNguoiDung'  => $maNhanVien,
            'TieuDe'       => 'Quản lý đã chốt bảng lương',
            'NoiDung'      => "Bảng lương tháng {$thangNam} của bạn đã được chốt. Vui lòng vào kiểm tra và xác nhận thanh toán.",
            'LoaiThongBao' => 'HeThong'
        ]);

        broadcast(new \App\Events\UserDataUpdated($maNhanVien))->toOthers();
        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Đã chốt và gửi bảng lương cho nhân viên.']);
    }

    // 3. Quản lý hoàn tất thanh toán
    public function thanhToan(Request $request, $id)
    {
        $bg = BangLuong::find($id);
        if (!$bg || !in_array($bg->TrangThai, ['ChoThanhToan', 'DaXacNhan'])) {
            return response()->json(['success' => false, 'message' => 'Lỗi trạng thái! Nhân viên chưa xác nhận.']);
        }

        $bg->TrangThai = 'DaThanhToan';
        $bg->NgayThanhToan = Carbon::now()->toDateTimeString();
        $bg->save();

        ThongBao::create([
            'MaNguoiDung'  => $bg->MaNhanVien,
            'TieuDe'       => 'Đã chuyển khoản tiền lương',
            'NoiDung'      => "Lương tháng {$bg->ThangNam} đã được thanh toán. Vui lòng kiểm tra tài khoản ngân hàng.",
            'LoaiThongBao' => 'ViTien'
        ]);

        broadcast(new \App\Events\UserDataUpdated($bg->MaNhanVien))->toOthers();
        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Xác nhận thanh toán thành công.']);
    }

    // 4. Nhân viên lấy Lịch sử các tháng
    public function lichSuLuongNhanVien(Request $request)
    {
        $user = $request->user();
        $thongTinNH = $this->formatNganHang($user);

        $history = BangLuong::where('MaNhanVien', $user->MaNguoiDung)
            ->orderBy('MaBangLuong', 'desc')
            ->get()
            ->map(function ($item) use ($thongTinNH, $user) {
                $item->ThongTinNganHang = $thongTinNH;
                $item->TenNganHang = $user->TenNganHang;
                $item->STKNganHang = $user->STKNganHang;
                $item->TenTaiKhoan = $user->TenTaiKhoan;
                return $item;
            });

        return response()->json(['success' => true, 'data' => $history]);
    }

    // 5. Xem chi tiết 1 tháng
    public function xemChiTietThang(Request $request)
    {
        $id = $request->query('ma_bang_luong', $request->query('bang_luong_id'));
        $thangNam = $request->query('thang_nam');
        $maNhanVien = $request->query('ma_nhan_vien', $request->query('id_nhan_vien', $request->user()->MaNguoiDung));

        $bangLuong = null;
        if ($id) {
            $bangLuong = BangLuong::find($id);
            if ($bangLuong) {
                $thangNam = $bangLuong->ThangNam;
                $maNhanVien = $bangLuong->MaNhanVien;
            }
        } elseif ($thangNam) {
            $bangLuong = BangLuong::where('MaNhanVien', $maNhanVien)->where('ThangNam', $thangNam)->first();
        }

        if (!$thangNam) return response()->json(['success' => false, 'message' => 'Thiếu tham số.']);

        $parts = explode('-', $thangNam);
        $thang = $parts[0]; $nam = $parts[1];

        $lichLamViec = LichLamViec::with('caLamViec')
            ->where('MaNhanVien', $maNhanVien)
            ->where('TrangThaiXepLich', 'DaDuyet')
            ->whereMonth('NgayLam', $thang)
            ->whereYear('NgayLam', $nam)
            ->orderBy('NgayLam', 'asc')
            ->get();

        $snapshotKey = "salary_snapshot_{$maNhanVien}_{$thangNam}";
        $snapshot = $bangLuong ? Cache::get($snapshotKey, []) : [];

        $lichThang = $lichLamViec->map(function($lich) use ($bangLuong, $snapshot) {
            $luongHienThi = 0;
            if ($lich->caLamViec) {
                $luongHienThi = ($lich->CongViec === 'ThuNgan')
                    ? (int) $lich->caLamViec->LuongThuNgan
                    : (int) $lich->caLamViec->LuongPhucVu;
            }

            if ($bangLuong && isset($snapshot[$lich->MaLichLamViec])) {
                $luongHienThi = (int) $snapshot[$lich->MaLichLamViec];
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

        $nvInfo = NguoiDung::find($maNhanVien);
        $thongTinNH = $nvInfo ? $this->formatNganHang($nvInfo) : null;

        if (!$bangLuong) {
            $thucLanh = max(0, $tongLuong + $tongThuong - $tongPhat);
            $tongTin = [
                'is_chot'          => false,
                'ThangNam'         => $thangNam,
                'TongCaLam'        => $tongCa,
                'TongTienLuong'    => $tongLuong,
                'TongTienThuong'   => $tongThuong,
                'TongTienPhat'     => $tongPhat,
                'ThucLanh'         => $thucLanh,
                'ThongTinNganHang' => $thongTinNH,
                'TrangThai'        => 'ChuaChot'
            ];
        } else {
            $tongTin = clone $bangLuong;
            $tongTin->is_chot = true;
            $tongTin->ThongTinNganHang = $thongTinNH;
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

    // 6. Nhân viên xác nhận đồng ý (Cập nhật luôn thông tin Ngân hàng vào bảng NguoiDung)
    public function xacNhan(Request $request, $id)
    {
        $user = $request->user();

        $bg = BangLuong::where('MaBangLuong', $id)->where('MaNhanVien', $user->MaNguoiDung)->first();
        if (!$bg || $bg->TrangThai !== 'ChoXacNhan') {
            return response()->json(['success' => false, 'message' => 'Dữ liệu không hợp lệ.']);
        }

        // Hỗ trợ nhận 3 cột riêng (ten_ngan_hang, stk_ngan_hang, ten_tai_khoan) hoặc tách từ chuỗi thong_tin_ngan_hang
        if ($request->filled('ten_ngan_hang') || $request->filled('stk_ngan_hang')) {
            $user->TenNganHang = trim($request->input('ten_ngan_hang', $user->TenNganHang));
            $user->STKNganHang = trim($request->input('stk_ngan_hang', $user->STKNganHang));
            $user->TenTaiKhoan = trim($request->input('ten_tai_khoan', $user->TenTaiKhoan ?? $user->HoTen));
            $user->save();
        } elseif ($request->filled('thong_tin_ngan_hang')) {
            $raw = trim($request->thong_tin_ngan_hang);
            $parts = array_map('trim', explode('-', $raw));
            $user->TenNganHang = $parts[0] ?? $raw;
            $user->STKNganHang = $parts[1] ?? ($user->STKNganHang ?? '');
            $user->TenTaiKhoan = $parts[2] ?? ($user->TenTaiKhoan ?? mb_strtoupper($user->HoTen, 'UTF-8'));
            $user->save();
        }

        $bg->NgayXacNhan = Carbon::now()->toDateTimeString();
        $bg->TrangThai = 'ChoThanhToan';
        $bg->LyDoKhieuNai = null;
        $bg->save();

        $managers = NguoiDung::where('VaiTro', 'QuanLySan')->where('MaCumSan', $user->MaCumSan)->get();
        foreach ($managers as $mgr) {
            ThongBao::create([
                'MaNguoiDung'  => $mgr->MaNguoiDung,
                'TieuDe'       => 'Nhân viên đã xác nhận lương',
                'NoiDung'      => "Nhân viên {$user->HoTen} đã xác nhận bảng lương tháng {$bg->ThangNam}. Vui lòng kiểm tra và tiến hành thanh toán.",
                'LoaiThongBao' => 'HeThong'
            ]);
            broadcast(new \App\Events\UserDataUpdated($mgr->MaNguoiDung))->toOthers();
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

        $bg = BangLuong::where('MaBangLuong', $id)->where('MaNhanVien', $user->MaNguoiDung)->first();
        if (!$bg || $bg->TrangThai !== 'ChoXacNhan') {
            return response()->json(['success' => false, 'message' => 'Dữ liệu không hợp lệ.']);
        }

        $bg->TrangThai = 'KhieuNai';
        $bg->LyDoKhieuNai = $request->ly_do;
        $bg->save();

        $managers = NguoiDung::where('VaiTro', 'QuanLySan')->where('MaCumSan', $user->MaCumSan)->get();
        foreach ($managers as $mgr) {
            ThongBao::create([
                'MaNguoiDung'  => $mgr->MaNguoiDung,
                'TieuDe'       => 'Khiếu nại bảng lương',
                'NoiDung'      => "Nhân viên {$user->HoTen} vừa báo cáo sai sót bảng lương tháng {$bg->ThangNam}. Vui lòng kiểm tra lại bảng công.",
                'LoaiThongBao' => 'HeThong'
            ]);
            broadcast(new \App\Events\UserDataUpdated($mgr->MaNguoiDung))->toOthers();
        }

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Đã gửi báo cáo sai sót. Quản lý sẽ kiểm tra lại.']);
    }
}