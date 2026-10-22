<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\SanPham;
use App\Models\PhieuNhapHang;
use App\Models\HoaDonBanHang;
use App\Models\ChiTietHoaDon;

class PosController extends Controller
{
    // ====================================================
    // MODULE 1: QUẢN LÝ SẢN PHẨM (Dùng chung cho Quản lý & Staff)
    // ====================================================

    public function getSanPham(Request $request)
    {
        $maCumSan = $request->query('ma_cum_san', $request->query('id_cum_san'));
        if (!$maCumSan) {
            return response()->json(['success' => false, 'message' => 'Thiếu mã cụm sân!'], 422);
        }

        $sanPhams = SanPham::where('MaCumSan', $maCumSan)->get();
        return response()->json(['success' => true, 'data' => $sanPhams]);
    }

    public function storeSanPham(Request $request)
    {
        $maCumSan = $request->input('MaCumSan', $request->input('ID_CumSan'));
        $request->merge(['MaCumSan' => $maCumSan]);

        $request->validate([
            'MaCumSan'   => 'required|string',
            'TenSanPham' => 'required|string|max:255',
            'GiaBan'     => 'required|numeric|min:0',
            'HinhAnh'    => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:2048'
        ]);

        $hinhAnhPath = null;
        if ($request->hasFile('HinhAnh')) {
            $path = $request->file('HinhAnh')->store('sanpham', 'public');
            $hinhAnhPath = '/storage/' . $path;
        }

        $sanPham = SanPham::create([
            'MaCumSan'   => $maCumSan,
            'TenSanPham' => $request->TenSanPham,
            'GiaBan'     => $request->GiaBan,
            'SoLuongTon' => 0,
            'HinhAnh'    => $hinhAnhPath
        ]);

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Thêm sản phẩm thành công', 'data' => $sanPham]);
    }

    public function updateSanPham(Request $request, $id)
    {
        $sanPham = SanPham::find($id);
        if (!$sanPham) return response()->json(['success' => false, 'message' => 'Không tìm thấy sản phẩm'], 404);

        $request->validate([
            'TenSanPham' => 'required|string|max:255',
            'GiaBan'     => 'required|numeric|min:0',
            'HinhAnh'    => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:2048'
        ]);

        $updateData = [
            'TenSanPham' => $request->TenSanPham,
            'GiaBan'     => $request->GiaBan,
        ];

        if ($request->hasFile('HinhAnh')) {
            $path = $request->file('HinhAnh')->store('sanpham', 'public');
            $updateData['HinhAnh'] = '/storage/' . $path;
        }

        $sanPham->update($updateData);

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Cập nhật thành công', 'data' => $sanPham]);
    }

    // ====================================================
    // MODULE 2: NHẬP HÀNG (Chỉ Quản lý Sân)
    // ====================================================

    public function getPhieuNhap(Request $request)
    {
        $maCumSan = $request->query('ma_cum_san', $request->query('id_cum_san'));

        $query = PhieuNhapHang::with(['nhanVien:MaNguoiDung,HoTen', 'cumSan:MaCumSan,TenCumSan'])
            ->orderBy('NgayNhap', 'desc');

        if (!empty($maCumSan)) {
            $query->where('MaCumSan', $maCumSan);
        }

        return response()->json(['success' => true, 'data' => $query->get()]);
    }

    public function storePhieuNhap(Request $request)
    {
        $maCumSan   = $request->input('MaCumSan', $request->input('ID_CumSan'));
        $maNhanVien = $request->input('MaNhanVien', $request->input('ID_NhanVien'));
        $request->merge([
            'MaCumSan'   => $maCumSan,
            'MaNhanVien' => $maNhanVien,
        ]);

        $request->validate([
            'MaCumSan'          => 'required|string',
            'MaNhanVien'        => 'required|string',
            'TongTienThanhToan' => 'required|numeric',
            'ChiTietNhap'       => 'required|array'
        ]);

        DB::beginTransaction();
        try {
            $phieuNhap = PhieuNhapHang::create([
                'MaCumSan'          => $maCumSan,
                'MaNhanVien'        => $maNhanVien,
                'TongTienThanhToan' => $request->TongTienThanhToan,
                'ChiTietNhap'       => $request->ChiTietNhap,
                'NgayNhap'          => now()
            ]);

            foreach ($request->ChiTietNhap as $item) {
                $maSP = $item['ma_san_pham'] ?? $item['id_san_pham'] ?? null;
                if ($maSP) {
                    SanPham::where('MaSanPham', $maSP)->increment('SoLuongTon', $item['so_luong']);
                }
            }

            DB::commit();

            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            return response()->json(['success' => true, 'message' => 'Nhập hàng thành công', 'data' => $phieuNhap]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Lỗi hệ thống: ' . $e->getMessage()], 500);
        }
    }

    // ====================================================
    // MODULE 3: BÁN HÀNG POS (Chỉ Nhân viên)
    // ====================================================

    public function storeHoaDonBanHang(Request $request)
    {
        $maCumSan   = $request->input('MaCumSan', $request->input('ID_CumSan'));
        $maNhanVien = $request->input('MaNhanVien', $request->input('ID_NhanVien'));
        $request->merge([
            'MaCumSan'   => $maCumSan,
            'MaNhanVien' => $maNhanVien,
        ]);

        $request->validate([
            'MaCumSan'      => 'required|string',
            'MaNhanVien'    => 'required|string',
            'TongTien'      => 'required|numeric',
            'ChiTietHoaDon' => 'required|array'
        ]);

        DB::beginTransaction();
        try {
            foreach ($request->ChiTietHoaDon as $item) {
                $maSP = $item['ma_san_pham'] ?? $item['id_san_pham'] ?? null;
                $sp = SanPham::lockForUpdate()->find($maSP);
                if (!$sp || $sp->SoLuongTon < $item['so_luong']) {
                    throw new \Exception("Sản phẩm {$item['ten_san_pham']} không đủ số lượng tồn kho.");
                }
            }

            $hoaDon = HoaDonBanHang::create([
                'MaCumSan'   => $maCumSan,
                'MaNhanVien' => $maNhanVien,
                'TongTien'   => $request->TongTien,
                'NgayTao'    => now()
            ]);

            foreach ($request->ChiTietHoaDon as $item) {
                $maSP = $item['ma_san_pham'] ?? $item['id_san_pham'] ?? null;
                ChiTietHoaDon::create([
                    'MaHoaDon'  => $hoaDon->MaHoaDonBanHang,
                    'MaSanPham' => $maSP,
                    'SoLuong'   => $item['so_luong'],
                    'DonGia'    => $item['don_gia']
                ]);

                SanPham::where('MaSanPham', $maSP)->decrement('SoLuongTon', $item['so_luong']);
            }

            DB::commit();

            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            return response()->json(['success' => true, 'message' => 'Thanh toán thành công']);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => $e->getMessage()], 400);
        }
    }

    public function getHoaDonBanHang(Request $request)
    {
        $maCumSan = $request->query('ma_cum_san', $request->query('id_cum_san'));

        $query = HoaDonBanHang::with(['nhanVien:MaNguoiDung,HoTen', 'chiTietHoaDons.sanPham', 'cumSan:MaCumSan,TenCumSan'])
            ->orderBy('NgayTao', 'desc');

        if (!empty($maCumSan)) {
            $query->where('MaCumSan', $maCumSan);
        }

        return response()->json(['success' => true, 'data' => $query->get()]);
    }
}