<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\NguoiDung;
use App\Models\ThongBao;
use App\Models\BanGiaoCa;
use App\Models\ChiPhiPhatSinh;
use App\Models\CaLamViec;
use App\Models\DatSan;
use App\Models\HoaDonBanHang;
use Carbon\Carbon;

class BanGiaoCaController extends Controller
{
    public function layDanhSachTrongNgay(Request $request)
    {
        $user = $request->user();
        $ngay = $request->query('ngay', Carbon::now()->toDateString());

        $data = BanGiaoCa::where('MaCumSan', $user->MaCumSan)
            ->where('Ngay', $ngay)
            ->get();

        return response()->json(['success' => true, 'data' => $data]);
    }

    public function nhanCa(Request $request)
    {
        $user = $request->user();
        $maCaLamViec = $request->input('ma_ca_lam_viec', $request->input('id_ca_lam_viec'));
        $request->merge(['ma_ca_lam_viec_check' => $maCaLamViec]);

        $request->validate([
            'ma_ca_lam_viec_check' => 'required|string',
            'ngay'                 => 'required|date',
            'tien_nhan'            => 'required|numeric|min:0',
            'ghi_chu_nhan'         => 'nullable|string'
        ]);

        $exist = BanGiaoCa::where('MaCaLamViec', $maCaLamViec)
            ->where('Ngay', $request->ngay)
            ->where('MaCumSan', $user->MaCumSan)
            ->first();

        if ($exist) {
            return response()->json(['success' => false, 'message' => 'Ca này đã có phiếu nhận ca!']);
        }

        $bgc = BanGiaoCa::create([
            'MaCumSan'       => $user->MaCumSan,
            'MaCaLamViec'    => $maCaLamViec,
            'Ngay'           => $request->ngay,
            'MaNhanVienNhan' => $user->MaNguoiDung,
            'ThoiGianNhan'   => Carbon::now(),
            'TienNhan'       => $request->tien_nhan,
            'TienHeThong'    => $request->tien_nhan,
            'GhiChuNhan'     => $request->ghi_chu_nhan,
            'TrangThai'      => 'DangTrongCa'
        ]);

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Tạo phiếu nhận ca thành công!', 'data' => $bgc]);
    }

    public function thongTinChotCa(Request $request, $id)
    {
        $bgc = BanGiaoCa::find($id);
        if (!$bgc) return response()->json(['success' => false, 'message' => 'Không tìm thấy phiếu.']);

        $caLamViec = CaLamViec::find($bgc->MaCaLamViec);
        if (!$caLamViec) return response()->json(['success' => false, 'message' => 'Không tìm thấy thông tin Ca làm.']);

        $ngayCaLam = $bgc->Ngay;

        $thoiGianBatDauCa = Carbon::parse($ngayCaLam . ' ' . $caLamViec->GioBatDau);
        $thoiGianKetThucCa = Carbon::parse($ngayCaLam . ' ' . $caLamViec->GioKetThuc);

        if ($thoiGianKetThucCa->lessThan($thoiGianBatDauCa)) {
            $thoiGianKetThucCa->addDay();
        }

        $datSans = DatSan::join('KhungGio', 'DatSan.MaKhungGio', '=', 'KhungGio.MaKhungGio')
            ->join('SanBong', 'DatSan.MaSanBong', '=', 'SanBong.MaSanBong')
            ->where('SanBong.MaCumSan', $bgc->MaCumSan)
            ->whereIn('DatSan.TrangThai', ['HoanThanh', 'KhongDen'])
            ->whereBetween('DatSan.NgayDa', [
                $thoiGianBatDauCa->copy()->subDay()->toDateString(),
                $thoiGianKetThucCa->copy()->addDay()->toDateString()
            ])
            ->select('DatSan.*', 'KhungGio.GioBatDau as KhungGio_GioBatDau')
            ->get();

        $tienThuSan = 0;
        $tienThuKhongDen = 0;

        foreach ($datSans as $ds) {
            $thoiGianBatDauTran = Carbon::parse($ds->NgayDa . ' ' . $ds->KhungGio_GioBatDau);

            if ($thoiGianBatDauTran->greaterThanOrEqualTo($thoiGianBatDauCa) && $thoiGianBatDauTran->lessThan($thoiGianKetThucCa)) {
                if ($ds->TrangThai === 'HoanThanh') {
                    // Khách đến nhận sân và đá hoàn tất -> Thu ngân thu nốt phần tiền mặt còn lại tại sân
                    $tienThuSan += ($ds->TongTien - ($ds->TienCoc ?? 0));
                }
            }
        }

        $tongPhiChi = ChiPhiPhatSinh::where('MaBanGiaoCa', $id)->sum('SoTien');

        $tienBanNuoc = HoaDonBanHang::where('MaCumSan', $bgc->MaCumSan)
            ->whereBetween('NgayTao', [
                $thoiGianBatDauCa->format('Y-m-d H:i:s'),
                $thoiGianKetThucCa->format('Y-m-d H:i:s')
            ])
            ->sum('TongTien');

        $doanhThuTienMat = $tienThuSan + $tienThuKhongDen + $tienBanNuoc;
        $tienHeThong = $bgc->TienNhan + $doanhThuTienMat - $tongPhiChi;

        return response()->json([
            'success'            => true,
            'tien_nhan'          => $bgc->TienNhan,
            'doanh_thu_tien_mat' => $doanhThuTienMat,
            'tong_chi'           => $tongPhiChi,
            'tien_he_thong'      => $tienHeThong
        ]);
    }

    public function giaoCa(Request $request, $id)
    {
        $user = $request->user();
        $request->validate([
            'tien_giao'          => 'required|numeric|min:0',
            'tien_nop_doanh_thu' => 'required|numeric|min:0',
            'tien_he_thong'      => 'required|numeric',
            'ghi_chu_giao'       => 'nullable|string'
        ]);

        $bgc = BanGiaoCa::find($id);
        if (!$bgc) return response()->json(['success' => false, 'message' => 'Không tìm thấy phiếu.']);

        $caLamViec = CaLamViec::find($bgc->MaCaLamViec);
        if ($caLamViec) {
            $now = Carbon::now();
            $gioKetThucCa = Carbon::parse($bgc->Ngay . ' ' . $caLamViec->GioKetThuc);

            if ($gioKetThucCa->lessThan(Carbon::parse($bgc->Ngay . ' ' . $caLamViec->GioBatDau))) {
                $gioKetThucCa->addDay();
            }

            $thoiGianChoPhepChot = $gioKetThucCa->copy()->subMinutes(30);

            if ($now->lessThan($thoiGianChoPhepChot)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Bạn không được chốt ca quá sớm! Vui lòng chờ đến ' . $thoiGianChoPhepChot->format('H:i') . ' mới có thể bàn giao.'
                ]);
            }
        }

        $bgc->MaNhanVienGiao = $user->MaNguoiDung;
        $bgc->ThoiGianGiao = Carbon::now();
        $bgc->TienGiao = $request->tien_giao;
        $bgc->TienNopDoanhThu = $request->tien_nop_doanh_thu;
        $bgc->TienHeThong = $request->tien_he_thong;
        $bgc->GhiChuGiao = $request->ghi_chu_giao;
        $bgc->TrangThai = 'DaChotCa';
        $bgc->save();

        if ($request->tien_nop_doanh_thu > 0) {
            $managers = NguoiDung::where('VaiTro', 'QuanLySan')
                ->where('MaCumSan', $bgc->MaCumSan)
                ->get();

            $formattedTienNop = number_format($request->tien_nop_doanh_thu, 0, ',', '.');

            foreach ($managers as $mgr) {
                ThongBao::create([
                    'MaNguoiDung'  => $mgr->MaNguoiDung,
                    'TieuDe'       => 'Báo cáo chốt két cuối ngày',
                    'NoiDung'      => "Thu ngân {$user->HoTen} vừa chốt ca và báo nộp {$formattedTienNop}đ doanh thu tiền mặt. Vui lòng đối soát két!",
                    'LoaiThongBao' => 'HeThong'
                ]);

                broadcast(new \App\Events\UserDataUpdated($mgr->MaNguoiDung))->toOthers();
            }
        }

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Đã chốt và bàn giao ca thành công!']);
    }

    public function taoPhieuChi(Request $request)
    {
        $maBanGiaoCa = $request->input('ma_ban_giao_ca', $request->input('id_ban_giao_ca'));
        $request->merge(['ma_ban_giao_ca_check' => $maBanGiaoCa]);

        $request->validate([
            'ma_ban_giao_ca_check' => 'required|exists:BanGiaoCa,MaBanGiaoCa',
            'loai_phieu'           => 'required|in:Thu,Chi',
            'so_tien'              => 'required|numeric|min:1000',
            'noi_dung'             => 'required|string|max:255'
        ]);

        $bgc = BanGiaoCa::find($maBanGiaoCa);
        if ($bgc->TrangThai !== 'DangTrongCa') {
            return response()->json(['success' => false, 'message' => 'Ca này đã chốt, không thể lập phiếu.']);
        }

        $soTienLuu = $request->loai_phieu === 'Thu' ? -$request->so_tien : $request->so_tien;

        ChiPhiPhatSinh::create([
            'MaBanGiaoCa' => $maBanGiaoCa,
            'SoTien'      => $soTienLuu,
            'NoiDung'     => $request->noi_dung,
            'ThoiGian'    => Carbon::now()
        ]);

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        $msg = $request->loai_phieu === 'Thu' ? 'Đã lập phiếu THU phát sinh thành công!' : 'Đã lập phiếu CHI thành công!';
        return response()->json(['success' => true, 'message' => $msg]);
    }

    public function layDanhSachPhieuChi($id)
    {
        $bgc = BanGiaoCa::find($id);
        if (!$bgc) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy ca làm việc.']);
        }

        $danhSach = ChiPhiPhatSinh::where('MaBanGiaoCa', $id)
            ->orderBy('ThoiGian', 'desc')
            ->get();

        return response()->json(['success' => true, 'data' => $danhSach]);
    }

    public function chotCuongChe(Request $request, $id)
    {
        $user = $request->user();

        $bgc = BanGiaoCa::find($id);
        if (!$bgc || $bgc->TrangThai !== 'DangTrongCa') {
            return response()->json(['success' => false, 'message' => 'Phiếu không hợp lệ hoặc đã chốt.']);
        }

        $req = new Request();
        $thongTin = $this->thongTinChotCa($req, $id)->getData();
        if (!$thongTin->success) return response()->json(['success' => false, 'message' => 'Lỗi tính toán.']);

        $tienHeThong = $thongTin->tien_he_thong;
        $caLamViec = CaLamViec::find($bgc->MaCaLamViec);

        $isCaToi = Carbon::parse($caLamViec->GioBatDau)->hour >= 14;

        if ($isCaToi) {
            $tienGiao = 200000;
            $tienNop = $tienHeThong - 200000;
            if ($tienNop < 0) { $tienNop = 0; $tienGiao = $tienHeThong; }
        } else {
            $tienNop = 0;
            $tienGiao = $tienHeThong;
        }

        $bgc->MaNhanVienGiao = $user->MaNguoiDung;
        $bgc->ThoiGianGiao = Carbon::now();
        $bgc->TienGiao = $tienGiao;
        $bgc->TienNopDoanhThu = $tienNop;
        $bgc->TienHeThong = $tienHeThong;
        $bgc->GhiChuGiao = 'Hệ thống chốt cưỡng chế do nhân viên quên chốt ca.';
        $bgc->TrangThai = 'ChotCuongChe';
        $bgc->save();

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Đã chốt cưỡng chế thành công!']);
    }

    public function xoaPhieuChi($id)
    {
        $phieu = ChiPhiPhatSinh::find($id);
        if (!$phieu) return response()->json(['success' => false, 'message' => 'Không tìm thấy phiếu.']);

        $bgc = BanGiaoCa::find($phieu->MaBanGiaoCa);
        if ($bgc->TrangThai !== 'DangTrongCa') {
            return response()->json(['success' => false, 'message' => 'Ca làm việc đã chốt, không thể xóa phiếu!']);
        }

        $phieu->delete();

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Đã xóa phiếu thành công!']);
    }
}