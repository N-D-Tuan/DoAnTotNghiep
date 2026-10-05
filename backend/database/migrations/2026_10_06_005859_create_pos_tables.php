<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        // 1. Bảng Sản Phẩm
        Schema::create('SanPham', function (Blueprint $table) {
            $table->id('ID');
            $table->unsignedBigInteger('ID_CumSan');
            $table->string('TenSanPham');
            $table->integer('GiaBan');
            $table->integer('SoLuongTon')->default(0);
            $table->string('HinhAnh')->nullable();
            
            $table->foreign('ID_CumSan')->references('ID')->on('CumSan')->onDelete('cascade');
        });

        // 2. Bảng Hóa Đơn Bán Hàng
        Schema::create('HoaDonBanHang', function (Blueprint $table) {
            $table->id('ID');
            $table->unsignedBigInteger('ID_NhanVien');
            $table->unsignedBigInteger('ID_CumSan');
            $table->integer('TongTien');
            
            // Chỉ tạo cột created_at (ánh xạ thành NgayTao), bỏ qua updated_at
            $table->timestamp('NgayTao')->useCurrent();

            $table->foreign('ID_NhanVien')->references('ID')->on('NguoiDung');
            $table->foreign('ID_CumSan')->references('ID')->on('CumSan')->onDelete('cascade');
        });

        // 3. Bảng Chi Tiết Hóa Đơn
        Schema::create('ChiTietHoaDon', function (Blueprint $table) {
            $table->unsignedBigInteger('ID_HoaDon');
            $table->unsignedBigInteger('ID_SanPham');
            $table->integer('SoLuong');
            $table->integer('DonGia');
            
            $table->primary(['ID_HoaDon', 'ID_SanPham']);
            $table->foreign('ID_HoaDon')->references('ID')->on('HoaDonBanHang')->onDelete('cascade');
            $table->foreign('ID_SanPham')->references('ID')->on('SanPham');
        });

        // 4. Bảng Phiếu Nhập Hàng
        Schema::create('PhieuNhapHang', function (Blueprint $table) {
            $table->id('ID');
            $table->unsignedBigInteger('ID_CumSan');
            $table->unsignedBigInteger('ID_NhanVien'); // ID Quản lý sân
            $table->integer('TongTienThanhToan');
            $table->json('ChiTietNhap');
            
            // Chỉ tạo cột created_at (ánh xạ thành NgayNhap), bỏ qua updated_at
            $table->timestamp('NgayNhap')->useCurrent();

            $table->foreign('ID_CumSan')->references('ID')->on('CumSan')->onDelete('cascade');
            $table->foreign('ID_NhanVien')->references('ID')->on('NguoiDung');
        });
    }

    public function down()
    {
        Schema::dropIfExists('PhieuNhapHang');
        Schema::dropIfExists('ChiTietHoaDon');
        Schema::dropIfExists('HoaDonBanHang');
        Schema::dropIfExists('SanPham');
    }
};
