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
    // 1. Lấy danh sách Phiếu Giao Ca trong ngày
    public function layDanhSachTrongNgay(Request $request)
    {
        $user = $request->user();
        $ngay = $request->query('ngay', Carbon::now()->toDateString());
        
        $data = BanGiaoCa::where('ID_CumSan', $user->ID_CumSan)
            ->where('Ngay', $ngay)
            ->get();
            
        return response()->json(['success' => true, 'data' => $data]);
    }

    // 2. Tạo Phiếu Nhận Ca
    public function nhanCa(Request $request)
    {
        $user = $request->user();
        $request->validate([
            'id_ca_lam_viec' => 'required',
            'ngay' => 'required|date',
            'tien_nhan' => 'required|numeric|min:0',
            'ghi_chu_nhan' => 'nullable|string'
        ]);

        $exist = BanGiaoCa::where('ID_CaLamViec', $request->id_ca_lam_viec)
            ->where('Ngay', $request->ngay)
            ->where('ID_CumSan', $user->ID_CumSan)
            ->first();

        if ($exist) {
            return response()->json(['success' => false, 'message' => 'Ca này đã có phiếu nhận ca!']);
        }

        $bgc = BanGiaoCa::create([
            'ID_CumSan' => $user->ID_CumSan,
            'ID_CaLamViec' => $request->id_ca_lam_viec,
            'Ngay' => $request->ngay,
            'ID_NhanVienNhan' => $user->ID,
            'ThoiGianNhan' => Carbon::now(),
            'TienNhan' => $request->tien_nhan,
            'TienHeThong' => $request->tien_nhan,
            'GhiChuNhan' => $request->ghi_chu_nhan,
            'TrangThai' => 'DangTrongCa'
        ]);

        return response()->json(['success' => true, 'message' => 'Tạo phiếu nhận ca thành công!', 'data' => $bgc]);
    }

    // 3. Lấy thông tin chốt ca (Tính tổng chi, doanh thu)
    public function thongTinChotCa(Request $request, $id)
    {
        $bgc = BanGiaoCa::find($id);
        if (!$bgc) return response()->json(['success' => false, 'message' => 'Không tìm thấy phiếu.']);

        // ==========================================
        // 1. LẤY THÔNG TIN CA LÀM VIỆC ĐỂ XÁC ĐỊNH MỐC THỜI GIAN
        // ==========================================
        $caLamViec = CaLamViec::find($bgc->ID_CaLamViec);
        if (!$caLamViec) return response()->json(['success' => false, 'message' => 'Không tìm thấy thông tin Ca làm.']);

        $ngayCaLam = $bgc->Ngay; // Ví dụ: '2026-10-11'
        
        $thoiGianBatDauCa = Carbon::parse($ngayCaLam . ' ' . $caLamViec->GioBatDau);
        $thoiGianKetThucCa = Carbon::parse($ngayCaLam . ' ' . $caLamViec->GioKetThuc);

        // Xử lý ca qua đêm (ví dụ Ca Tối: 15:00 -> 05:00 hôm sau)
        if ($thoiGianKetThucCa->lessThan($thoiGianBatDauCa)) {
            $thoiGianKetThucCa->addDay();
        }

        // ==========================================
        // 2. TÍNH DOANH THU ĐẶT SÂN THEO KHUNG GIỜ CỦA CA
        // ==========================================
        // Join với bảng KhungGio để lấy GioBatDau và SanBong để lọc theo CumSan
        $datSans = DatSan::join('KhungGio', 'DatSan.ID_KhungGio', '=', 'KhungGio.ID')
            ->join('SanBong', 'DatSan.ID_SanBong', '=', 'SanBong.ID')
            ->where('SanBong.ID_CumSan', $bgc->ID_CumSan)
            ->whereIn('DatSan.TrangThai', ['HoanThanh', 'KhongDen'])
            // Khoanh vùng ngày để tối ưu Query
            ->whereBetween('DatSan.NgayDa', [
                $thoiGianBatDauCa->copy()->subDay()->toDateString(), 
                $thoiGianKetThucCa->copy()->addDay()->toDateString()
            ])
            ->select('DatSan.*', 'KhungGio.GioBatDau as KhungGio_GioBatDau')
            ->get();

        $tienThuSan = 0;
        $tienThuKhongDen = 0;

        foreach ($datSans as $ds) {
            // Lấy thời gian bắt đầu của trận đấu
            $thoiGianBatDauTran = Carbon::parse($ds->NgayDa . ' ' . $ds->KhungGio_GioBatDau);

            if ($thoiGianBatDauTran->greaterThanOrEqualTo($thoiGianBatDauCa) && $thoiGianBatDauTran->lessThan($thoiGianKetThucCa)) {
                
                // Nếu trận đấu thuộc Giải đấu (!empty ID_GiaiDau), dù HoanThanh hay KhongDen đều tính thu đủ tiền dư
                if (!empty($ds->ID_GiaiDau)) {
                    $tienThuSan += ($ds->TongTien - ($ds->TienCoc ?? 0));
                } 
                // Nếu là đá phong trào (Khách lẻ) thì áp dụng quy tắc cũ
                else {
                    if ($ds->TrangThai === 'HoanThanh') {
                        $tienThuSan += ($ds->TongTien - ($ds->TienCoc ?? 0));
                    } elseif ($ds->TrangThai === 'KhongDen') {
                        $tienThuKhongDen += ($ds->TienCoc ?? 0);
                    }
                }
                
            }
        }

        // ==========================================
        // 3. TÍNH CHI PHÍ PHÁT SINH (Lấy theo ID_BanGiaoCa)
        // ==========================================
        $tongPhiChi = ChiPhiPhatSinh::where('ID_BanGiaoCa', $id)->sum('SoTien');

        // ==========================================
        // 4. TÍNH DOANH THU BÁN NƯỚC (POS)
        // ==========================================
        // Tiền bán nước xuất hóa đơn lúc nào lấy lúc đó (Từ lúc nhận ca đến lúc bàn giao ca)
        $tienBanNuoc = HoaDonBanHang::where('ID_CumSan', $bgc->ID_CumSan)
            ->whereBetween('NgayTao', [
                $thoiGianBatDauCa->format('Y-m-d H:i:s'), 
                $thoiGianKetThucCa->format('Y-m-d H:i:s')
            ])
            ->sum('TongTien');

        // ==========================================
        // 5. TỔNG HỢP LẠI (Tồn cuối = Tồn đầu + Thu - Chi)
        // ==========================================
        $doanhThuTienMat = $tienThuSan + $tienThuKhongDen + $tienBanNuoc;
        $tienHeThong = $bgc->TienNhan + $doanhThuTienMat - $tongPhiChi;

        return response()->json([
            'success' => true, 
            'tien_nhan' => $bgc->TienNhan,
            'doanh_thu_tien_mat' => $doanhThuTienMat,
            'tong_chi' => $tongPhiChi,
            'tien_he_thong' => $tienHeThong
        ]);
    }

    // 4. Bàn giao ca (Kết thúc ca)
    public function giaoCa(Request $request, $id)
    {
        $user = $request->user();
        $request->validate([
            'tien_giao' => 'required|numeric|min:0',
            'tien_nop_doanh_thu' => 'required|numeric|min:0',
            'tien_he_thong' => 'required|numeric',
            'ghi_chu_giao' => 'nullable|string'
        ]);

        $bgc = BanGiaoCa::find($id);
        if (!$bgc) return response()->json(['success' => false, 'message' => 'Không tìm thấy phiếu.']);

        $bgc->ID_NhanVienGiao = $user->ID;
        $bgc->ThoiGianGiao = Carbon::now();
        $bgc->TienGiao = $request->tien_giao;
        $bgc->TienNopDoanhThu = $request->tien_nop_doanh_thu;
        $bgc->TienHeThong = $request->tien_he_thong;
        $bgc->GhiChuGiao = $request->ghi_chu_giao;
        $bgc->TrangThai = 'DaChot';
        $bgc->save();

        if ($request->tien_nop_doanh_thu > 0) {
            // Lấy danh sách Quản lý của cụm sân này
            $managers = NguoiDung::where('VaiTro', 'QuanLySan')
                ->where('ID_CumSan', $bgc->ID_CumSan)
                ->get();

            $formattedTienNop = number_format($request->tien_nop_doanh_thu, 0, ',', '.');
            
            foreach ($managers as $mgr) {
                ThongBao::create([
                    'ID_NguoiDung' => $mgr->ID,
                    'TieuDe' => 'Báo cáo chốt két cuối ngày',
                    'NoiDung' => "Thu ngân {$user->HoTen} vừa chốt ca và báo nộp {$formattedTienNop}đ doanh thu tiền mặt. Vui lòng đối soát két!",
                    'LoaiThongBao' => 'HeThong'
                ]);
                
                // Gắn realtime để rung chuông phía Quản lý ngay lập tức
                broadcast(new \App\Events\UserDataUpdated($mgr->ID))->toOthers();
            }
        }

        return response()->json(['success' => true, 'message' => 'Đã chốt và bàn giao ca thành công!']);
    }

    // 5. Lập phiếu chi (Phát sinh)
    public function taoPhieuChi(Request $request)
    {
        $request->validate([
            'id_ban_giao_ca' => 'required|exists:BanGiaoCa,ID',
            'loai_phieu' => 'required|in:Thu,Chi',
            'so_tien' => 'required|numeric|min:1000',
            'noi_dung' => 'required|string|max:255'
        ]);

        $bgc = BanGiaoCa::find($request->id_ban_giao_ca);
        if ($bgc->TrangThai !== 'DangTrongCa') {
            return response()->json(['success' => false, 'message' => 'Ca này đã chốt, không thể lập phiếu.']);
        }

        // THỦ THUẬT: Thu thì lưu số Âm, Chi thì lưu số Dương
        $soTienLuu = $request->loai_phieu === 'Thu' ? -$request->so_tien : $request->so_tien;

        $chi = ChiPhiPhatSinh::create([
            'ID_BanGiaoCa' => $request->id_ban_giao_ca,
            'SoTien' => $soTienLuu,
            'NoiDung' => $request->noi_dung,
            'ThoiGian' => Carbon::now()
        ]);

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        $msg = $request->loai_phieu === 'Thu' ? 'Đã lập phiếu THU phát sinh thành công!' : 'Đã lập phiếu CHI thành công!';
        return response()->json(['success' => true, 'message' => $msg]);
    }

    // 6. Lấy danh sách phiếu Thu/Chi phát sinh của ca đó
    public function layDanhSachPhieuChi($id)
    {
        $bgc = BanGiaoCa::find($id);
        if (!$bgc) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy ca làm việc.']);
        }

        // Lấy toàn bộ phiếu phát sinh xếp theo thời gian mới nhất lên đầu
        $danhSach = ChiPhiPhatSinh::where('ID_BanGiaoCa', $id)
            ->orderBy('ThoiGian', 'desc')
            ->get();

        return response()->json(['success' => true, 'data' => $danhSach]);
    }

    // 7. Chốt cưỡng chế (Admin)
    public function chotCuongChe(Request $request, $id)
    {
        $bgc = BanGiaoCa::find($id);
        if (!$bgc || $bgc->TrangThai !== 'DangTrongCa') {
            return response()->json(['success' => false, 'message' => 'Phiếu không hợp lệ hoặc đã chốt.']);
        }

        // Tái sử dụng lại logic hàm thongTinChotCa để lấy Tiền Hệ Thống
        $req = new Request();
        $thongTin = $this->thongTinChotCa($req, $id)->getData();
        if (!$thongTin->success) return response()->json(['success' => false, 'message' => 'Lỗi tính toán.']);
        
        $tienHeThong = $thongTin->tien_he_thong;
        $caLamViec = CaLamViec::find($bgc->ID_CaLamViec);
        
        // Phân biệt Ca Sáng / Ca Tối dựa vào Giờ bắt đầu (Ví dụ: trước 14:00 là Ca Sáng)
        $isCaToi = Carbon::parse($caLamViec->GioBatDau)->hour >= 14;

        if ($isCaToi) {
            $tienGiao = 200000;
            $tienNop = $tienHeThong - 200000;
            if ($tienNop < 0) { $tienNop = 0; $tienGiao = $tienHeThong; }
        } else {
            $tienNop = 0;
            $tienGiao = $tienHeThong;
        }

        $bgc->ThoiGianGiao = Carbon::now();
        $bgc->TienGiao = $tienGiao;
        $bgc->TienNopDoanhThu = $tienNop;
        $bgc->TienHeThong = $tienHeThong;
        $bgc->GhiChuGiao = 'Hệ thống chốt cưỡng chế do nhân viên quên chốt ca.';
        $bgc->TrangThai = 'ChotCuongChe';
        $bgc->save();

        return response()->json(['success' => true, 'message' => 'Đã chốt cưỡng chế thành công!']);
    }

    // 8. Xóa phiếu Thu/Chi phát sinh
    public function xoaPhieuChi($id)
    {
        $phieu = ChiPhiPhatSinh::find($id);
        if (!$phieu) return response()->json(['success' => false, 'message' => 'Không tìm thấy phiếu.']);

        $bgc = BanGiaoCa::find($phieu->ID_BanGiaoCa);
        if ($bgc->TrangThai !== 'DangTrongCa') {
            return response()->json(['success' => false, 'message' => 'Ca làm việc đã chốt, không thể xóa phiếu!']);
        }

        $phieu->delete();

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Đã xóa phiếu thành công!']);
    }
}