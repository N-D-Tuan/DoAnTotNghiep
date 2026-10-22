<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Auth;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\GiaiDau;
use App\Models\CumSan;
use App\Models\SanBong;
use App\Models\KhungGio;
use App\Models\DatSan;
use App\Models\ThongBao;
use App\Models\NguoiDung;

class GiaiDauController extends Controller
{
    public function layDanhSachCuaToi()
    {
        $userId = Auth::id();

        $danhSach = GiaiDau::with('cumSan')
            ->where('MaNguoiDung', $userId)
            ->orderBy('NgayTao', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data'    => $danhSach
        ], 200);
    }

    public function taoYeuCau(Request $request)
    {
        $maCumSan = $request->input('ma_cum_san', $request->input('id_cum_san'));
        $request->merge(['ma_cum_san_check' => $maCumSan]);

        $request->validate([
            'ma_cum_san_check' => 'required|exists:CumSan,MaCumSan',
            'ten_giai_dau'     => 'required|string|max:255',
            'ngay_bat_dau'     => 'required|date|after_or_equal:today',
            'ngay_ket_thuc'    => 'required|date|after_or_equal:ngay_bat_dau',
            'noi_dung'         => 'nullable|string'
        ], [
            'ngay_bat_dau.after_or_equal'  => 'Ngày bắt đầu không được trong quá khứ.',
            'ngay_ket_thuc.after_or_equal' => 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.'
        ]);

        $user = NguoiDung::find(Auth::id());
        if ($user && $user->TrangThaiKhoa) {
            return response()->json([
                'success' => false,
                'message' => 'Tài khoản của bạn đang bị khóa. Không thể tạo yêu cầu tổ chức giải đấu!'
            ]);
        }

        $giaiDau = GiaiDau::create([
            'MaNguoiDung' => Auth::id(),
            'MaCumSan'    => $maCumSan,
            'TenGiaiDau'  => $request->ten_giai_dau,
            'NgayBatDau'  => $request->ngay_bat_dau,
            'NgayKetThuc' => $request->ngay_ket_thuc,
            'NoiDung'     => $request->noi_dung
        ]);

        $nguoiTao = NguoiDung::find(Auth::id());
        $nguoiNhanThongBao = NguoiDung::where('VaiTro', 'QuanLySan')
                               ->where('MaCumSan', $maCumSan)
                               ->get();

        foreach ($nguoiNhanThongBao as $nhanSu) {
            ThongBao::create([
                'MaNguoiDung'  => $nhanSu->MaNguoiDung,
                'TieuDe'       => 'Yêu cầu Giải đấu mới',
                'NoiDung'      => 'Khách hàng ' . ($nguoiTao ? $nguoiTao->HoTen : '') . ' vừa gửi yêu cầu tổ chức giải đấu "' . $giaiDau->TenGiaiDau . '".',
                'LoaiThongBao' => 'GiaiDau'
            ]);

            broadcast(new \App\Events\UserDataUpdated($nhanSu->MaNguoiDung))->toOthers();
        }

        broadcast(new \App\Events\AdminDataUpdated())->toOthers();

        return response()->json([
            'success' => true,
            'message' => 'Gửi yêu cầu tổ chức giải đấu thành công!',
            'data'    => $giaiDau
        ], 201);
    }

    public function layDanhSachAdmin()
    {
        $userDangNhap = auth()->user();

        $query = GiaiDau::with(['cumSan', 'nguoiDung']);

        if ($userDangNhap->VaiTro === 'QuanLySan') {
            $query->where('MaCumSan', $userDangNhap->MaCumSan);
        }

        $danhSach = $query->orderBy('NgayTao', 'desc')->get();

        return response()->json(['success' => true, 'data' => $danhSach]);
    }

    public function xuLyYeuCau(Request $request, $id)
    {
        $request->validate([
            'trang_thai' => 'required|in:DaDuyet,TuChoi',
            'ly_do_huy'  => 'required_if:trang_thai,TuChoi|string|nullable'
        ], [
            'ly_do_huy.required_if' => 'Vui lòng nhập lý do từ chối.'
        ]);

        $giaiDau = GiaiDau::find($id);

        if (!$giaiDau) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy giải đấu!'], 404);
        }

        $trangThaiMoi = $request->trang_thai;
        $giaiDau->TrangThai = $trangThaiMoi;

        if ($trangThaiMoi === 'DaDuyet') {
            $giaiDau->NgayDuyet = now();
        } else {
            $giaiDau->LyDoHuy = $request->ly_do_huy;
        }

        $giaiDau->save();

        $tieuDe = $trangThaiMoi === 'DaDuyet' ? 'Giải đấu đã được duyệt' : 'Giải đấu bị từ chối';
        $noiDung = $trangThaiMoi === 'DaDuyet'
            ? 'Yêu cầu tổ chức giải đấu "' . $giaiDau->TenGiaiDau . '" của bạn đã được duyệt thành công.'
            : 'Yêu cầu tổ chức giải đấu "' . $giaiDau->TenGiaiDau . '" của bạn đã bị từ chối. Lý do: ' . $request->ly_do_huy;

        ThongBao::create([
            'MaNguoiDung'  => $giaiDau->MaNguoiDung,
            'TieuDe'       => $tieuDe,
            'NoiDung'      => $noiDung,
            'LoaiThongBao' => 'GiaiDau'
        ]);

        broadcast(new \App\Events\UserDataUpdated($giaiDau->MaNguoiDung))->toOthers();
        broadcast(new \App\Events\AdminDataUpdated())->toOthers();

        return response()->json([
            'success' => true,
            'message' => 'Đã xử lý yêu cầu thành công!'
        ], 200);
    }

    public function layMaTranLich($id)
    {
        $giaiDau = GiaiDau::find($id);
        if (!$giaiDau) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy giải đấu!'], 404);
        }

        $cumSan = CumSan::find($giaiDau->MaCumSan);
        if (!$cumSan) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy thông tin cụm sân!'], 404);
        }

        $sanBongs = SanBong::where('MaCumSan', $giaiDau->MaCumSan)
            ->where('TrangThai', 'HoatDong')
            ->get();

        $khungGios = KhungGio::where('GioBatDau', '>=', $cumSan->GioMoCua)
            ->where('GioKetThuc', '<=', $cumSan->GioDongCua)
            ->orderBy('GioBatDau')
            ->get();

        $sanBongIds = $sanBongs->pluck('MaSanBong');

        $datSans = DatSan::whereIn('MaSanBong', $sanBongIds)
            ->whereBetween('NgayDa', [$giaiDau->NgayBatDau, $giaiDau->NgayKetThuc])
            ->whereIn('TrangThai', ['DaCoc', 'HoanThanh', 'KhongDen'])
            ->get(['MaSanBong', 'MaKhungGio', 'NgayDa']);

        return response()->json([
            'success'    => true,
            'giai_dau'   => $giaiDau,
            'san_bongs'  => $sanBongs,
            'khung_gios' => $khungGios,
            'dat_sans'   => $datSans
        ]);
    }
}