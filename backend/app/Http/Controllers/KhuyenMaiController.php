<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Carbon\Carbon;
use App\Models\KhuyenMai;
use App\Models\NguoiDung;
use App\Models\ThongBao;

class KhuyenMaiController extends Controller
{
    /**
     * Tự động đồng bộ trạng thái Hết hạn nếu quá NgayKetThuc hoặc hết SoLuong
     */
    public static function dongBoTrangThaiKhuyenMai()
    {
        KhuyenMai::where('TrangThai', 'DangApDung')
            ->where(function ($q) {
                $q->where('NgayKetThuc', '<', now())
                  ->orWhereColumn('SoLuongDaDung', '>=', 'SoLuong');
            })
            ->update(['TrangThai' => 'HetHan']);
    }

    /**
     * Hàm phụ trợ: Phân tích cột MaNguoiDung để xác định Phạm vi áp dụng của Mã khuyến mãi
     */
    public static function dinhKemThongTinPhamVi($km)
    {
        $nd = $km->nguoiDung;

        if (!$km->MaNguoiDung || ($nd && $nd->VaiTro === 'Admin')) {
            $km->pham_vi = 'HE_THONG';
            $km->ma_cum_san_ap_dung = null;
            $km->ten_cum_san_ap_dung = 'Toàn hệ thống';
        } elseif ($nd && $nd->VaiTro === 'QuanLySan') {
            $km->pham_vi = 'CUM_SAN';
            $km->ma_cum_san_ap_dung = $nd->MaCumSan;
            $km->ten_cum_san_ap_dung = $nd->cumSan ? $nd->cumSan->TenCumSan : ('Cụm sân #' . $nd->MaCumSan);
        } else {
            $km->pham_vi = 'KHACH_HANG';
            $km->ma_cum_san_ap_dung = null;
            $km->ten_cum_san_ap_dung = null;
        }

        $km->so_luong_con_lai = max(0, (int) $km->SoLuong - (int) $km->SoLuongDaDung);
        return $km;
    }

    /**
     * 1. DÀNH CHO KHÁCH HÀNG: Lấy danh sách khuyến mãi khả dụng để chọn trong Giỏ hàng
     */
    public function layKhuyenMaiKhaDung(Request $request)
    {
        self::dongBoTrangThaiKhuyenMai();

        $user = NguoiDung::find(Auth::id() ?? $request->user()?->MaNguoiDung);
        $tongTienTamTinh = (float) $request->query('tong_tien', 0);

        $query = KhuyenMai::with('nguoiDung.cumSan')
            ->where('TrangThai', 'DangApDung')
            ->where('NgayBatDau', '<=', now())
            ->where('NgayKetThuc', '>=', now())
            ->whereColumn('SoLuongDaDung', '<', 'SoLuong');

        if ($user) {
            $query->where(function ($q) use ($user) {
                $q->whereNull('MaNguoiDung')
                  ->orWhere('MaNguoiDung', $user->MaNguoiDung)
                  ->orWhereHas('nguoiDung', function ($sub) {
                      $sub->whereIn('VaiTro', ['QuanLySan', 'Admin']);
                  });
            });
        } else {
            $query->where(function ($q) {
                $q->whereNull('MaNguoiDung')
                  ->orWhereHas('nguoiDung', function ($sub) {
                      $sub->whereIn('VaiTro', ['QuanLySan', 'Admin']);
                  });
            });
        }

        $danhSach = $query->orderBy('GiaTri', 'desc')->get()->map(function ($km) use ($tongTienTamTinh) {
            self::dinhKemThongTinPhamVi($km);

            $duDieuKien = $tongTienTamTinh <= 0 || $tongTienTamTinh >= (float) $km->GiaTriHoaDonToiThieu;
            $soTienGiamDuKien = 0;

            if ($tongTienTamTinh > 0 && $duDieuKien) {
                if ($km->LoaiKhuyenMai === 'PhanTram') {
                    $soTienGiamDuKien = round($tongTienTamTinh * ((float) $km->GiaTri / 100));
                    if ((float) $km->GiaTriToiDa > 0 && $soTienGiamDuKien > (float) $km->GiaTriToiDa) {
                        $soTienGiamDuKien = (float) $km->GiaTriToiDa;
                    }
                } else {
                    $soTienGiamDuKien = (float) $km->GiaTri;
                }
                $soTienGiamDuKien = min($tongTienTamTinh, $soTienGiamDuKien);
            }

            $km->du_dieu_kien = $duDieuKien;
            $km->so_tien_giam_du_kien = $soTienGiamDuKien;
            return $km;
        });

        return response()->json([
            'success' => true,
            'data'    => $danhSach
        ]);
    }

    /**
     * 2. DÀNH CHO ADMIN / QUẢN LÝ: Lấy danh sách khuyến mãi
     *    - Admin: Xem được toàn bộ (Toàn hệ thống, mọi Cụm sân, mọi Khách hàng cá nhân)
     *    - Quản lý sân: Chỉ xem được Mã ở Cụm sân của mình VÀ Mã Toàn hệ thống (Tuyệt đối ẩn mã của Cụm sân khác và mã tặng Cá nhân)
     */
    public function index()
    {
        self::dongBoTrangThaiKhuyenMai();

        $userDangNhap = auth()->user();

        $query = KhuyenMai::with('nguoiDung.cumSan')->orderBy('NgayBatDau', 'desc');

        if ($userDangNhap && $userDangNhap->VaiTro === 'QuanLySan') {
            $myCumSan = $userDangNhap->MaCumSan;
            $query->where(function ($q) use ($myCumSan) {
                $q->whereNull('MaNguoiDung')
                  ->orWhereHas('nguoiDung', function ($sub) use ($myCumSan) {
                      $sub->where('VaiTro', 'Admin')
                          ->orWhere(function ($q2) use ($myCumSan) {
                              $q2->where('VaiTro', 'QuanLySan')->where('MaCumSan', $myCumSan);
                          });
                  });
            });
        }

        $danhSach = $query->get()->map(function ($km) {
            return self::dinhKemThongTinPhamVi($km);
        });

        // Lấy danh sách Quản lý sân (đại diện cho từng Cụm sân) để Admin chọn
        $danhSachQuanLyCumSan = NguoiDung::with('cumSan')
            ->where('VaiTro', 'QuanLySan')
            ->whereNotNull('MaCumSan')
            ->orderBy('MaCumSan', 'asc')
            ->get()
            ->unique('MaCumSan')
            ->values();

        return response()->json([
            'success'               => true,
            'data'                  => $danhSach,
            'danh_sach_quan_ly_cum' => $danhSachQuanLyCumSan
        ]);
    }

    /**
     * Hàm phụ trợ: Xác định MaNguoiDung cần lưu vào bảng KhuyenMai dựa theo vai trò người tạo
     * - Quản lý sân: Mặc định chỉ được tạo mã cho Cụm sân của chính mình
     * - Admin: Được phép tạo mã Toàn hệ thống, mã theo Cụm sân, hoặc mã tặng riêng cho Cá nhân
     */
    private function xacDinhMaNguoiDungKhuyenMai(Request $request, $userDangNhap)
    {
        $loaiDoiTuong = $request->input('loai_doi_tuong'); // 'HE_THONG' | 'CUM_SAN' | 'KHACH_HANG'

        if ($userDangNhap->VaiTro === 'QuanLySan') {
            // Quản lý sân mặc định chỉ được cấp mã cho Cụm sân của mình
            if ($loaiDoiTuong === 'HE_THONG' || $loaiDoiTuong === 'KHACH_HANG') {
                throw new \Exception('Quản lý sân chỉ được phép tạo mã khuyến mãi cho Cụm sân của mình!');
            }
            return $userDangNhap->MaNguoiDung;
        }

        // Nếu là Admin:
        if ($loaiDoiTuong === 'HE_THONG') {
            return null;
        } elseif ($loaiDoiTuong === 'CUM_SAN') {
            $maTarget = $request->input('MaNguoiDung');
            $maCumSan = $request->input('ma_cum_san');

            if ($maTarget) {
                $ql = NguoiDung::where('MaNguoiDung', $maTarget)->where('VaiTro', 'QuanLySan')->first();
                if ($ql) return $ql->MaNguoiDung;
            }
            if ($maCumSan) {
                $ql = NguoiDung::where('VaiTro', 'QuanLySan')->where('MaCumSan', $maCumSan)->first();
                if ($ql) return $ql->MaNguoiDung;
                throw new \Exception('Cụm sân này hiện chưa có tài khoản Quản lý sân đại diện!');
            }
            throw new \Exception('Vui lòng chọn Cụm sân áp dụng khuyến mãi!');
        } elseif ($loaiDoiTuong === 'KHACH_HANG') {
            $maKH = $request->input('MaNguoiDung');
            $kh = NguoiDung::where('MaNguoiDung', $maKH)->where('VaiTro', 'KhachHang')->first();
            if (!$kh) {
                throw new \Exception('Vui lòng chọn một Khách hàng hợp lệ!');
            }
            return $kh->MaNguoiDung;
        }

        return $request->input('MaNguoiDung') ?: null;
    }

    /**
     * 3. DÀNH CHO ADMIN / QUẢN LÝ: Tạo mới mã khuyến mãi
     *    (Nếu tạo mã cho riêng Khách hàng cá nhân -> Phát thông báo Realtime tới khách hàng đó)
     */
    public function store(Request $request)
    {
        $userDangNhap = auth()->user();

        $request->validate([
            'TenKhuyenMai'         => 'required|string|max:255',
            'MoTa'                 => 'nullable|string',
            'MaNguoiDung'          => 'nullable|string|exists:NguoiDung,MaNguoiDung',
            'LoaiKhuyenMai'        => 'required|in:PhanTram,CoDinh',
            'GiaTri'               => 'required|numeric|min:1',
            'GiaTriToiDa'          => 'nullable|numeric|min:0',
            'GiaTriHoaDonToiThieu' => 'nullable|numeric|min:0',
            'SoLuong'              => 'required|integer|min:1',
            'NgayBatDau'           => 'required|date',
            'NgayKetThuc'          => 'required|date|after_or_equal:NgayBatDau',
        ]);

        if ($request->LoaiKhuyenMai === 'PhanTram' && $request->GiaTri > 100) {
            return response()->json([
                'success' => false,
                'message' => 'Khuyến mãi theo phần trăm không được vượt quá 100%!'
            ], 422);
        }

        try {
            $maNguoiDungLuu = $this->xacDinhMaNguoiDungKhuyenMai($request, $userDangNhap);
        } catch (\Exception $ex) {
            return response()->json(['success' => false, 'message' => $ex->getMessage()], 422);
        }

        $giaTriToiDa = ($request->LoaiKhuyenMai === 'CoDinh')
            ? $request->GiaTri
            : ($request->GiaTriToiDa ?? 0);

        $km = KhuyenMai::create([
            'MaNguoiDung'          => $maNguoiDungLuu,
            'TenKhuyenMai'         => $request->TenKhuyenMai,
            'MoTa'                 => $request->MoTa,
            'LoaiKhuyenMai'        => $request->LoaiKhuyenMai,
            'GiaTri'               => $request->GiaTri,
            'GiaTriToiDa'          => $giaTriToiDa,
            'GiaTriHoaDonToiThieu' => $request->GiaTriHoaDonToiThieu ?? 0,
            'SoLuong'              => $request->SoLuong,
            'SoLuongDaDung'        => 0,
            'NgayBatDau'           => Carbon::parse($request->NgayBatDau)->format('Y-m-d H:i:s'),
            'NgayKetThuc'          => Carbon::parse($request->NgayKetThuc)->format('Y-m-d H:i:s'),
            'TrangThai'            => 'DangApDung',
        ]);

        // PHÁT THÔNG BÁO NẾU MÃ ĐƯỢC TẶNG RIÊNG CHO KHÁCH HÀNG CÁ NHÂN
        if ($maNguoiDungLuu) {
            $nguoiNhan = NguoiDung::find($maNguoiDungLuu);
            if ($nguoiNhan && $nguoiNhan->VaiTro === 'KhachHang') {
                $mucGiamText = ($km->LoaiKhuyenMai === 'PhanTram')
                    ? ("giảm " . (int) $km->GiaTri . "% (tối đa " . number_format($km->GiaTriToiDa, 0, ',', '.') . "đ)")
                    : ("giảm trực tiếp " . number_format($km->GiaTri, 0, ',', '.') . "đ");
                $donToiThieuText = ((float) $km->GiaTriHoaDonToiThieu > 0)
                    ? (" cho đơn đặt sân từ " . number_format($km->GiaTriHoaDonToiThieu, 0, ',', '.') . "đ")
                    : "";
                $hanDungText = Carbon::parse($km->NgayKetThuc)->format('d/m/Y');

                ThongBao::create([
                    'MaNguoiDung'  => $nguoiNhan->MaNguoiDung,
                    'TieuDe'       => '🎁 Bạn vừa nhận được mã ưu đãi dành riêng!',
                    'NoiDung'      => "Hệ thống vừa tặng riêng cho bạn mã khuyến mãi #{$km->MaKhuyenMai} ({$km->TenKhuyenMai}) - {$mucGiamText}{$donToiThieuText}. Hạn sử dụng đến {$hanDungText}. Hãy áp dụng ngay khi đặt sân nhé!",
                    'LoaiThongBao' => 'HeThong'
                ]);

                broadcast(new \App\Events\UserDataUpdated($nguoiNhan->MaNguoiDung))->toOthers();
            }
        }

        broadcast(new \App\Events\AdminDataUpdated())->toOthers();
        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json([
            'success' => true,
            'message' => 'Tạo chương trình khuyến mãi thành công!',
            'data'    => $km
        ]);
    }

    /**
     * 4. DÀNH CHO ADMIN / QUẢN LÝ: Cập nhật thông tin mã khuyến mãi
     */
    public function update(Request $request, $maKhuyenMai)
    {
        $userDangNhap = auth()->user();

        $km = KhuyenMai::with('nguoiDung')->find($maKhuyenMai);
        if (!$km) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy mã khuyến mãi!'], 404);
        }

        if ($userDangNhap->VaiTro === 'QuanLySan') {
            $nd = $km->nguoiDung;
            if (!$km->MaNguoiDung || ($nd && $nd->VaiTro !== 'QuanLySan') || ($nd && $nd->MaCumSan !== $userDangNhap->MaCumSan)) {
                return response()->json(['success' => false, 'message' => 'Bạn chỉ có quyền chỉnh sửa mã khuyến mãi thuộc Cụm sân của mình!'], 403);
            }
        }

        $request->validate([
            'TenKhuyenMai'         => 'required|string|max:255',
            'MoTa'                 => 'nullable|string',
            'MaNguoiDung'          => 'nullable|string|exists:NguoiDung,MaNguoiDung',
            'LoaiKhuyenMai'        => 'required|in:PhanTram,CoDinh',
            'GiaTri'               => 'required|numeric|min:1',
            'GiaTriToiDa'          => 'nullable|numeric|min:0',
            'GiaTriHoaDonToiThieu' => 'nullable|numeric|min:0',
            'SoLuong'              => 'required|integer|min:1',
            'NgayBatDau'           => 'required|date',
            'NgayKetThuc'          => 'required|date|after_or_equal:NgayBatDau',
            'TrangThai'            => 'required|in:DangApDung,HetHan',
        ]);

        try {
            $maNguoiDungLuu = $this->xacDinhMaNguoiDungKhuyenMai($request, $userDangNhap);
        } catch (\Exception $ex) {
            return response()->json(['success' => false, 'message' => $ex->getMessage()], 422);
        }

        $giaTriToiDa = ($request->LoaiKhuyenMai === 'CoDinh')
            ? $request->GiaTri
            : ($request->GiaTriToiDa ?? 0);

        $km->update([
            'MaNguoiDung'          => $maNguoiDungLuu,
            'TenKhuyenMai'         => $request->TenKhuyenMai,
            'MoTa'                 => $request->MoTa,
            'LoaiKhuyenMai'        => $request->LoaiKhuyenMai,
            'GiaTri'               => $request->GiaTri,
            'GiaTriToiDa'          => $giaTriToiDa,
            'GiaTriHoaDonToiThieu' => $request->GiaTriHoaDonToiThieu ?? 0,
            'SoLuong'              => $request->SoLuong,
            'NgayBatDau'           => Carbon::parse($request->NgayBatDau)->format('Y-m-d H:i:s'),
            'NgayKetThuc'          => Carbon::parse($request->NgayKetThuc)->format('Y-m-d H:i:s'),
            'TrangThai'            => $request->TrangThai,
        ]);

        broadcast(new \App\Events\AdminDataUpdated())->toOthers();
        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json([
            'success' => true,
            'message' => 'Cập nhật khuyến mãi thành công!',
            'data'    => $km
        ]);
    }

    /**
     * 5. DÀNH CHO ADMIN / QUẢN LÝ: Xóa mã khuyến mãi
     */
    public function destroy($maKhuyenMai)
    {
        $userDangNhap = auth()->user();

        $km = KhuyenMai::with('nguoiDung')->withCount('hoaDonDatSans')->find($maKhuyenMai);
        if (!$km) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy mã khuyến mãi!'], 404);
        }

        if ($userDangNhap->VaiTro === 'QuanLySan') {
            $nd = $km->nguoiDung;
            if (!$km->MaNguoiDung || ($nd && $nd->VaiTro !== 'QuanLySan') || ($nd && $nd->MaCumSan !== $userDangNhap->MaCumSan)) {
                return response()->json(['success' => false, 'message' => 'Bạn chỉ có quyền xóa mã khuyến mãi thuộc Cụm sân của mình!'], 403);
            }
        }

        if ($km->hoa_don_dat_sans_count > 0) {
            $km->update(['TrangThai' => 'HetHan']);
            broadcast(new \App\Events\AdminDataUpdated())->toOthers();
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            return response()->json([
                'success' => true,
                'message' => 'Mã khuyến mãi này đã có hóa đơn sử dụng nên được chuyển sang trạng thái Ngừng áp dụng (Hết hạn).'
            ]);
        }

        $km->delete();

        broadcast(new \App\Events\AdminDataUpdated())->toOthers();
        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json([
            'success' => true,
            'message' => 'Đã xóa mã khuyến mãi thành công!'
        ]);
    }
}