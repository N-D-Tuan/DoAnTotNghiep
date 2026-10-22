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
        $request->validate([
            'trang_thai' => 'required|in:DaDuyet,TuChoi',
            'ly_do_huy'  => 'required_if:trang_thai,TuChoi|string|nullable'
        ], [
            'ly_do_huy.required_if' => 'Vui lòng nhập lý do từ chối.'
        ]);

        DB::beginTransaction();
        try {
            $yeuCau = YeuCauHuyGap::with('datSan.sanBong')->find($id);
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
                    $danhSachDat = DatSan::where('MaGiaiDau', $datSan->MaGiaiDau)
                                         ->where('TrangThai', 'DaCoc')
                                         ->get();
                    $tongHoan = $danhSachDat->sum('TienCoc');
                    $maHoaDonIds = $danhSachDat->pluck('MaHoaDonDatSan')->filter()->unique();

                    DatSan::where('MaGiaiDau', $datSan->MaGiaiDau)
                          ->where('TrangThai', 'DaCoc')
                          ->update(['TrangThai' => 'DaHuy']);

                    $daCoTranHoanThanh = DatSan::where('MaGiaiDau', $datSan->MaGiaiDau)
                                               ->where('TrangThai', 'HoanThanh')
                                               ->exists();
                    GiaiDau::where('MaGiaiDau', $datSan->MaGiaiDau)->update([
                        'TrangThai' => $daCoTranHoanThanh ? 'HoanThanh' : 'DaHuy'
                    ]);

                    foreach ($maHoaDonIds as $maHD) {
                        \App\Http\Controllers\DatSanController::dongBoHoaDonDatSan($maHD);
                    }

                    if ($tongHoan > 0) {
                        $soDuSau = $user->SoDuVi + $tongHoan;

                        GiaoDich::create([
                            'MaNguoiDung'  => $user->MaNguoiDung,
                            'LoaiGiaoDich' => 'HoanTienHuyGap',
                            'DongTien'     => 'Cong',
                            'SoTien'       => $tongHoan,
                            'SoDuTruoc'    => $user->SoDuVi,
                            'SoDuSau'      => $soDuSau,
                            'NoiDung'      => "Hoàn cọc hủy gấp toàn bộ Giải đấu (Admin phê duyệt)"
                        ]);
                        $user->update(['SoDuVi' => $soDuSau]);
                    }
                } else {
                    $datSan->update(['TrangThai' => 'DaHuy']);

                    if ($datSan->MaHoaDonDatSan) {
                        \App\Http\Controllers\DatSanController::dongBoHoaDonDatSan($datSan->MaHoaDonDatSan);
                    }

                    $tienHoan = $datSan->TienCoc;
                    $soDuSau = $user->SoDuVi + $tienHoan;

                    GiaoDich::create([
                        'MaNguoiDung'  => $user->MaNguoiDung,
                        'LoaiGiaoDich' => 'HoanTienHuyGap',
                        'DongTien'     => 'Cong',
                        'SoTien'       => $tienHoan,
                        'SoDuTruoc'    => $user->SoDuVi,
                        'SoDuSau'      => $soDuSau,
                        'NoiDung'      => "Hoàn cọc hủy gấp: Sân " . $datSan->sanBong->TenSan . " (Admin phê duyệt)"
                    ]);
                    $user->update(['SoDuVi' => $soDuSau]);
                }

                $tieuDeTB = "Yêu cầu hủy sân được phê duyệt";
                $noiDungTB = "Yêu cầu hủy sân gấp của bạn đã được Admin duyệt. Tiền cọc đã được cộng lại vào ví.";
            } else {
                $tieuDeTB = "Yêu cầu hủy sân bị từ chối";
                $noiDungTB = "Yêu cầu hủy sân gấp của bạn không được Admin chấp thuận. Lý do: " . $request->ly_do_huy . ". Lịch đặt vẫn được giữ nguyên.";
            }

            ThongBao::create([
                'MaNguoiDung'  => $user->MaNguoiDung,
                'TieuDe'       => $tieuDeTB,
                'NoiDung'      => $noiDungTB,
                'LoaiThongBao' => 'DatSan'
            ]);

            DB::commit();

            broadcast(new \App\Events\UserDataUpdated($user->MaNguoiDung))->toOthers();
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