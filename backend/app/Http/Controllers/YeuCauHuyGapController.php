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

        // Hỗ trợ nhận mảng ma_dat_sans (chọn nhiều trận cùng lúc) VÀ tương thích ngược với id_dat_san / ma_dat_san đơn lẻ
        $rawList = $request->input('ma_dat_sans', []);
        if (!is_array($rawList) || empty($rawList)) {
            $singleId = $request->input('ma_dat_san', $request->input('id_dat_san'));
            $rawList = $singleId ? [$singleId] : [];
        }

        $maDatSans = array_values(array_unique(array_filter(array_map('strval', $rawList))));

        if (empty($maDatSans)) {
            return response()->json(['success' => false, 'message' => 'Vui lòng tích chọn ít nhất 1 lịch đặt sân muốn hủy gấp!'], 422);
        }

        $request->validate([
            'noi_dung' => 'required|string|max:500'
        ], [
            'noi_dung.required' => 'Vui lòng nhập lý do xin hủy sân gấp!'
        ]);

        $danhSachDatSan = DatSan::with(['sanBong.cumSan', 'khungGio', 'giaiDau'])
            ->whereIn('MaDatSan', $maDatSans)
            ->get();

        if ($danhSachDatSan->count() !== count($maDatSans)) {
            return response()->json(['success' => false, 'message' => 'Một số lịch đặt sân không tồn tại trên hệ thống!'], 422);
        }

        $processedTournaments = [];
        $finalBookingsToCreate = [];

        foreach ($danhSachDatSan as $datSan) {
            if ((string) $datSan->MaNguoiDung !== (string) $user->MaNguoiDung) {
                return response()->json(['success' => false, 'message' => 'Bạn không có quyền thao tác trên lịch đặt này!']);
            }
            if ($datSan->TrangThai !== 'DaCoc') {
                return response()->json(['success' => false, 'message' => "Vé #{$datSan->MaDatSan} không còn ở trạng thái Đã cọc để hủy gấp!"]);
            }

            if ($datSan->MaGiaiDau != null) {
                // Nếu khách chọn nhiều trận của cùng 1 giải đấu, chỉ tạo 1 yêu cầu đại diện cho cả giải đấu đó
                if (in_array($datSan->MaGiaiDau, $processedTournaments, true)) {
                    continue;
                }

                $daTonTaiGiaiDau = YeuCauHuyGap::whereHas('datSan', function ($query) use ($datSan) {
                    $query->where('MaGiaiDau', $datSan->MaGiaiDau);
                })->where('TrangThai', 'ChoDuyet')->exists();

                if ($daTonTaiGiaiDau) {
                    $tenGiai = $datSan->giaiDau ? $datSan->giaiDau->TenGiaiDau : ('#GD-' . $datSan->MaGiaiDau);
                    return response()->json([
                        'success' => false,
                        'message' => "Giải đấu [{$tenGiai}] đang có yêu cầu hủy chờ xử lý! Vui lòng không gửi trùng lặp."
                    ]);
                }

                $processedTournaments[] = $datSan->MaGiaiDau;
                $finalBookingsToCreate[] = $datSan;
            } else {
                $daTonTai = YeuCauHuyGap::where('MaDatSan', $datSan->MaDatSan)
                    ->where('TrangThai', 'ChoDuyet')
                    ->exists();

                if ($daTonTai) {
                    $tenSan = $datSan->sanBong ? $datSan->sanBong->TenSan : $datSan->MaDatSan;
                    return response()->json([
                        'success' => false,
                        'message' => "Vé #PT-{$datSan->MaDatSan} ({$tenSan}) đã có yêu cầu hủy đang chờ xử lý!"
                    ]);
                }

                $finalBookingsToCreate[] = $datSan;
            }
        }

        DB::beginTransaction();
        try {
            $soYeuCauTao = 0;
            $soYeuCauTheoCumSan = [];

            foreach ($finalBookingsToCreate as $datSan) {
                YeuCauHuyGap::create([
                    'MaNguoiDung' => $user->MaNguoiDung,
                    'MaDatSan'    => $datSan->MaDatSan,
                    'NoiDung'     => $request->noi_dung,
                    'TrangThai'   => 'ChoDuyet'
                ]);
                $soYeuCauTao++;

                $maCS = $datSan->sanBong ? $datSan->sanBong->MaCumSan : null;
                if ($maCS) {
                    $soYeuCauTheoCumSan[$maCS] = ($soYeuCauTheoCumSan[$maCS] ?? 0) + 1;
                }
            }

            // Gửi 1 thông báo gọn gàng cho Quản lý của từng Cụm sân có lịch xin hủy
            foreach ($soYeuCauTheoCumSan as $maCumSanTuongUng => $soLuongYC) {
                $nguoiNhanThongBao = NguoiDung::where('VaiTro', 'QuanLySan')
                    ->where('MaCumSan', $maCumSanTuongUng)
                    ->get();

                foreach ($nguoiNhanThongBao as $nhanSu) {
                    ThongBao::create([
                        'MaNguoiDung'  => $nhanSu->MaNguoiDung,
                        'TieuDe'       => 'Yêu cầu hủy sân gấp mới',
                        'NoiDung'      => "Khách hàng {$user->HoTen} vừa gửi {$soLuongYC} yêu cầu hủy sân gấp tại cơ sở của bạn.",
                        'LoaiThongBao' => 'DatSan'
                    ]);

                    broadcast(new \App\Events\UserDataUpdated($nhanSu->MaNguoiDung))->toOthers();
                }
            }

            DB::commit();

            broadcast(new \App\Events\AdminDataUpdated())->toOthers();

            return response()->json([
                'success' => true,
                'message' => "Đã gửi thành công {$soYeuCauTao} yêu cầu hủy sân gấp! Vui lòng chờ Quản lý sân phê duyệt."
            ]);
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
                            'NoiDung'        => "Hoàn cọc hủy gấp: " . $tenSan . ""
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