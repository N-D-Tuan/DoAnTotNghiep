<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Models\YeuCauHuyGap;
use App\Models\DatSan;
use App\Models\HoaDonDatSan;
use App\Models\NguoiDung;
use App\Models\GiaoDich;
use App\Models\GiaiDau;
use App\Models\ThongBao;

class YeuCauHuyGapController extends Controller
{
    public function taoYeuCau(Request $request)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()->MaNguoiDung);
        $maDatSan = $request->input('ma_dat_san', $request->input('id_dat_san'));
        $request->merge(['ma_dat_san_check' => $maDatSan]);

        $request->validate([
            'ma_dat_san_check' => 'required|exists:DatSan,MaDatSan',
            'noi_dung'         => 'required|string|max:500'
        ]);

        $datSan = DatSan::with('sanBong')->find($maDatSan);

        if ($datSan->MaNguoiDung !== $user->MaNguoiDung) {
            return response()->json(['success' => false, 'message' => 'Bạn không có quyền thao tác trên lịch đặt này!']);
        }
        if ($datSan->TrangThai !== 'DaCoc') {
            return response()->json(['success' => false, 'message' => 'Chỉ có thể tạo yêu cầu hủy gấp đối với sân đang ở trạng thái Đã cọc!']);
        }

        if ($datSan->MaGiaiDau != null) {
            $daTonTaiGiaiDau = YeuCauHuyGap::whereHas('datSan', function ($query) use ($datSan) {
                $query->where('MaGiaiDau', $datSan->MaGiaiDau);
            })->where('TrangThai', 'ChoDuyet')->exists();

            if ($daTonTaiGiaiDau) {
                return response()->json([
                    'success' => false,
                    'message' => 'Giải đấu này đang có yêu cầu hủy chờ xử lý! Vui lòng không gửi thêm yêu cầu trùng lặp.'
                ]);
            }
        } else {
            $daTonTai = YeuCauHuyGap::where('MaDatSan', $datSan->MaDatSan)
                                    ->where('TrangThai', 'ChoDuyet')
                                    ->exists();
            if ($daTonTai) {
                return response()->json([
                    'success' => false,
                    'message' => 'Sân này đã có yêu cầu hủy đang chờ xử lý!'
                ]);
            }
        }

        DB::beginTransaction();
        try {
            YeuCauHuyGap::create([
                'MaNguoiDung' => $user->MaNguoiDung,
                'MaDatSan'    => $datSan->MaDatSan,
                'NoiDung'     => $request->noi_dung,
                'TrangThai'   => 'ChoDuyet'
            ]);

            $maCumSanTuongUng = $datSan->sanBong->MaCumSan;
            $nguoiNhanThongBao = NguoiDung::where('VaiTro', 'QuanLySan')
                                   ->where('MaCumSan', $maCumSanTuongUng)
                                   ->get();

            foreach ($nguoiNhanThongBao as $nhanSu) {
                ThongBao::create([
                    'MaNguoiDung'  => $nhanSu->MaNguoiDung,
                    'TieuDe'       => 'Yêu cầu hủy sân gấp mới',
                    'NoiDung'      => "Khách hàng {$user->HoTen} vừa gửi 1 yêu cầu hủy sân gấp.",
                    'LoaiThongBao' => 'DatSan'
                ]);

                broadcast(new \App\Events\UserDataUpdated($nhanSu->MaNguoiDung))->toOthers();
            }

            DB::commit();

            broadcast(new \App\Events\AdminDataUpdated())->toOthers();

            return response()->json(['success' => true, 'message' => 'Đã gửi yêu cầu hủy gấp thành công! Vui lòng chờ Admin phê duyệt.']);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Lỗi hệ thống: ' . $e->getMessage()]);
        }
    }

    public function xuLyYeuCau(Request $request, $id)
    {
        $userDangNhap = auth()->user();
        $maNhanVienXuLy = $userDangNhap ? $userDangNhap->MaNguoiDung : null;

        $request->validate([
            'trang_thai' => 'required|in:DaDuyet,TuChoi',
            'ly_do_huy'  => 'required_if:trang_thai,TuChoi|string|nullable'
        ], [
            'ly_do_huy.required_if' => 'Vui lòng nhập lý do từ chối.'
        ]);

        DB::beginTransaction();
        try {
            // Nạp sẵn cả sanBong và chiTietHoaDon để lấy MaHoaDonDatSan chính xác
            $yeuCau = YeuCauHuyGap::with(['datSan.sanBong', 'datSan.chiTietHoaDon'])->find($id);
            if (!$yeuCau || $yeuCau->TrangThai !== 'ChoDuyet') {
                return response()->json(['success' => false, 'message' => 'Yêu cầu không tồn tại hoặc đã được xử lý trước đó!']);
            }

            $yeuCau->update([
                'TrangThai' => $request->trang_thai,
                'NgayDuyet' => now(),
                'LyDoHuy'   => $request->trang_thai === 'TuChoi' ? $request->ly_do_huy : null
            ]);

            $datSan = $yeuCau->datSan;
            $user = NguoiDung::find($yeuCau->MaNguoiDung);

            if ($request->trang_thai === 'DaDuyet') {
                if ($datSan->MaGiaiDau != null) {
                    // 1. Lấy danh sách các trận đang Đã cọc thuộc Giải đấu kèm chiTietHoaDon
                    $danhSachDat = DatSan::with('chiTietHoaDon')
                                         ->where('MaGiaiDau', $datSan->MaGiaiDau)
                                         ->where('TrangThai', 'DaCoc')
                                         ->get();

                    $tongHoan = (float) $danhSachDat->sum('TienCoc');

                    // Lấy toàn bộ MaHoaDonDatSan liên quan (từ accessor hoặc trực tiếp từ quan hệ chiTietHoaDon)
                    $maHoaDonIds = $danhSachDat->map(function ($item) {
                        return $item->MaHoaDonDatSan ?? $item->chiTietHoaDon?->MaHoaDonDatSan;
                    })->filter()->unique()->values();

                    // 2. Cập nhật trạng thái các trận Đã cọc sang Đã hủy và lưu MaNhanVienXuLy
                    DatSan::where('MaGiaiDau', $datSan->MaGiaiDau)
                          ->where('TrangThai', 'DaCoc')
                          ->update([
                              'TrangThai'      => 'DaHuy',
                              'MaNhanVienXuLy' => $maNhanVienXuLy
                          ]);

                    // 3. Đồng bộ trạng thái Giải đấu (giống bên DatSanController)
                    $coTranDaXong = DatSan::where('MaGiaiDau', $datSan->MaGiaiDau)
                                          ->whereIn('TrangThai', ['HoanThanh', 'KhongDen'])
                                          ->exists();
                    GiaiDau::where('MaGiaiDau', $datSan->MaGiaiDau)->update([
                        'TrangThai' => $coTranDaXong ? 'HoanThanh' : 'DaHuy'
                    ]);

                    // 4. Đồng bộ lại toàn bộ các Hóa đơn đặt sân liên quan (Tính lại Tổng tiền, VAT, Khuyến mãi, Trạng thái HĐ)
                    foreach ($maHoaDonIds as $maHD) {
                        \App\Http\Controllers\DatSanController::dongBoHoaDonDatSan($maHD);
                    }

                    // 5. Hoàn tiền cọc vào ví cho khách hàng
                    if ($tongHoan > 0 && $user) {
                        $soDuTruoc = (float) $user->SoDuVi;
                        $soDuSau = $soDuTruoc + $tongHoan;

                        GiaoDich::create([
                            'MaNguoiDung'    => $user->MaNguoiDung,
                            'MaNhanVienXuLy' => $maNhanVienXuLy,
                            'LoaiGiaoDich'   => 'HoanTienHuyGap',
                            'DongTien'       => 'Cong',
                            'SoTien'         => $tongHoan,
                            'SoDuTruoc'      => $soDuTruoc,
                            'SoDuSau'        => $soDuSau,
                            'NoiDung'        => "Hoàn cọc hủy gấp toàn bộ Giải đấu (Admin phê duyệt)"
                        ]);
                        $user->update(['SoDuVi' => $soDuSau]);
                    }
                } else {
                    // TRƯỜNG HỢP SÂN PHONG TRÀO LẺ
                    $maHoaDon = $datSan->MaHoaDonDatSan ?? $datSan->chiTietHoaDon?->MaHoaDonDatSan;
                    $tienHoan = (float) $datSan->TienCoc;

                    // 1. Cập nhật trạng thái Đặt sân sang Đã hủy và lưu MaNhanVienXuLy
                    $datSan->update([
                        'TrangThai'      => 'DaHuy',
                        'MaNhanVienXuLy' => $maNhanVienXuLy
                    ]);

                    // 2. Đồng bộ lại Hóa đơn đặt sân (Tính lại Tổng tiền, VAT, Khuyến mãi, Trạng thái HĐ)
                    if ($maHoaDon) {
                        \App\Http\Controllers\DatSanController::dongBoHoaDonDatSan($maHoaDon);
                    }

                    // 3. Hoàn tiền cọc vào ví cho khách hàng
                    if ($tienHoan > 0 && $user) {
                        $soDuTruoc = (float) $user->SoDuVi;
                        $soDuSau = $soDuTruoc + $tienHoan;
                        $tenSan = $datSan->sanBong ? $datSan->sanBong->TenSan : 'Sân bóng';

                        GiaoDich::create([
                            'MaNguoiDung'    => $user->MaNguoiDung,
                            'MaNhanVienXuLy' => $maNhanVienXuLy,
                            'LoaiGiaoDich'   => 'HoanTienHuyGap',
                            'DongTien'       => 'Cong',
                            'SoTien'         => $tienHoan,
                            'SoDuTruoc'      => $soDuTruoc,
                            'SoDuSau'        => $soDuSau,
                            'NoiDung'        => "Hoàn cọc hủy gấp: Sân " . $tenSan . " (Admin phê duyệt)"
                        ]);
                        $user->update(['SoDuVi' => $soDuSau]);
                    }
                }

                $tieuDeTB = "Yêu cầu hủy sân được phê duyệt";
                $noiDungTB = "Yêu cầu hủy sân gấp của bạn đã được phê duyệt. Tiền cọc đã được cộng lại vào ví.";
            } else {
                $tieuDeTB = "Yêu cầu hủy sân bị từ chối";
                $noiDungTB = "Yêu cầu hủy sân gấp của bạn không được chấp thuận. Lý do: " . $request->ly_do_huy . ". Lịch đặt vẫn được giữ nguyên.";
            }

            if ($user) {
                ThongBao::create([
                    'MaNguoiDung'  => $user->MaNguoiDung,
                    'TieuDe'       => $tieuDeTB,
                    'NoiDung'      => $noiDungTB,
                    'LoaiThongBao' => 'DatSan'
                ]);
            }

            DB::commit();

            if ($user) {
                broadcast(new \App\Events\UserDataUpdated($user->MaNguoiDung))->toOthers();
            }
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();
            broadcast(new \App\Events\AdminDataUpdated())->toOthers();

            return response()->json(['success' => true, 'message' => 'Đã xử lý yêu cầu hủy sân!']);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Lỗi hệ thống: ' . $e->getMessage()]);
        }
    }

    public function layDanhSachCuaToi(Request $request)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()->MaNguoiDung);

        $danhSach = YeuCauHuyGap::with(['datSan.sanBong.cumSan', 'datSan.khungGio', 'datSan.giaiDau'])
            ->where('MaNguoiDung', $user->MaNguoiDung)
            ->orderBy('NgayTao', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data'    => $danhSach
        ]);
    }

    public function layDanhSachAdmin(Request $request)
    {
        $userDangNhap = auth()->user();

        $query = YeuCauHuyGap::with(['nguoiDung', 'datSan.sanBong.cumSan', 'datSan.khungGio', 'datSan.giaiDau']);

        if ($userDangNhap->VaiTro === 'QuanLySan') {
            $query->whereHas('datSan.sanBong', function ($q) use ($userDangNhap) {
                $q->where('MaCumSan', $userDangNhap->MaCumSan);
            });
        }

        $danhSach = $query->orderBy('NgayTao', 'desc')->get();

        return response()->json(['success' => true, 'data' => $danhSach]);
    }
}