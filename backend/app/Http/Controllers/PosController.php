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
        $request->validate([
            'id_cum_san' => 'required|integer'
        ]);

        $sanPhams = SanPham::where('ID_CumSan', $request->id_cum_san)->get();
        return response()->json(['success' => true, 'data' => $sanPhams]);
    }

    public function storeSanPham(Request $request)
    {
       // 1. Cập nhật Validate cho phép nhận file ảnh
        $request->validate([
            'ID_CumSan' => 'required|integer',
            'TenSanPham' => 'required|string|max:255',
            'GiaBan' => 'required|integer|min:0',
            'HinhAnh' => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:2048'
        ]);

        // 2. Xử lý lưu file ảnh tương tự CumSan
        $hinhAnhPath = null;
        if ($request->hasFile('HinhAnh')) {
            $path = $request->file('HinhAnh')->store('sanpham', 'public');
            $hinhAnhPath = '/storage/' . $path; 
        }

        $sanPham = SanPham::create([
            'ID_CumSan' => $request->ID_CumSan,
            'TenSanPham' => $request->TenSanPham,
            'GiaBan' => $request->GiaBan,
            'SoLuongTon' => 0, // Mới tạo mặc định là 0, phải nhập hàng mới có
            'HinhAnh' => $hinhAnhPath
        ]);

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Thêm sản phẩm thành công', 'data' => $sanPham]);
    }

    public function updateSanPham(Request $request, $id)
    {
        $sanPham = SanPham::find($id);
        if (!$sanPham) return response()->json(['success' => false, 'message' => 'Không tìm thấy sản phẩm'], 404);

        // 1. Validate form update
        $request->validate([
            'TenSanPham' => 'required|string|max:255',
            'GiaBan' => 'required|integer|min:0',
            'HinhAnh' => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:2048'
        ]);

        $updateData = [
            'TenSanPham' => $request->TenSanPham,
            'GiaBan' => $request->GiaBan,
        ];

        // 2. Nếu có ảnh mới upload lên thì mới ghi đè
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
        $request->validate(['id_cum_san' => 'required|integer']);
        
        $phieuNhaps = PhieuNhapHang::with('nhanVien:ID,HoTen') // Lấy tên quản lý đã nhập
            ->where('ID_CumSan', $request->id_cum_san)
            ->orderBy('NgayNhap', 'desc')
            ->get();

        return response()->json(['success' => true, 'data' => $phieuNhaps]);
    }

    public function storePhieuNhap(Request $request)
    {
        $request->validate([
            'ID_CumSan' => 'required|integer',
            'ID_NhanVien' => 'required|integer',
            'TongTienThanhToan' => 'required|integer',
            'ChiTietNhap' => 'required|array'
        ]);

        DB::beginTransaction();
        try {
            // 1. Tạo Phiếu Nhập
            $phieuNhap = PhieuNhapHang::create([
                'ID_CumSan' => $request->ID_CumSan,
                'ID_NhanVien' => $request->ID_NhanVien,
                'TongTienThanhToan' => $request->TongTienThanhToan,
                'ChiTietNhap' => $request->ChiTietNhap,
                'NgayNhap' => now()
            ]);

            // 2. Cập nhật Số lượng tồn kho cho từng sản phẩm
            foreach ($request->ChiTietNhap as $item) {
                SanPham::where('ID', $item['id_san_pham'])->increment('SoLuongTon', $item['so_luong']);
            }

            DB::commit();

            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            return response()->json(['success' => true, 'message' => 'Nhập hàng thành công']);
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
        $request->validate([
            'ID_CumSan' => 'required|integer',
            'ID_NhanVien' => 'required|integer',
            'TongTien' => 'required|integer',
            'ChiTietHoaDon' => 'required|array'
        ]);

        DB::beginTransaction();
        try {
            // 1. Kiểm tra tồn kho trước khi xuất bill để chống lỗi âm kho
            foreach ($request->ChiTietHoaDon as $item) {
                $sp = SanPham::lockForUpdate()->find($item['id_san_pham']);
                if (!$sp || $sp->SoLuongTon < $item['so_luong']) {
                    throw new \Exception("Sản phẩm {$item['ten_san_pham']} không đủ số lượng tồn kho.");
                }
            }

            // 2. Tạo Hóa Đơn
            $hoaDon = HoaDonBanHang::create([
                'ID_CumSan' => $request->ID_CumSan,
                'ID_NhanVien' => $request->ID_NhanVien,
                'TongTien' => $request->TongTien,
                'NgayTao' => now()
            ]);

            // 3. Tạo Chi Tiết Hóa Đơn và Trừ Kho
            foreach ($request->ChiTietHoaDon as $item) {
                ChiTietHoaDon::create([
                    'ID_HoaDon' => $hoaDon->ID,
                    'ID_SanPham' => $item['id_san_pham'],
                    'SoLuong' => $item['so_luong'],
                    'DonGia' => $item['don_gia']
                ]);

                // Trừ tồn kho
                SanPham::where('ID', $item['id_san_pham'])->decrement('SoLuongTon', $item['so_luong']);
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
        $request->validate(['id_cum_san' => 'required|integer']);
        
        $hoaDons = HoaDonBanHang::with(['nhanVien:ID,HoTen', 'chiTietHoaDons.sanPham'])
            ->where('ID_CumSan', $request->id_cum_san)
            ->orderBy('NgayTao', 'desc')
            ->get();

        return response()->json(['success' => true, 'data' => $hoaDons]);
    }
}
