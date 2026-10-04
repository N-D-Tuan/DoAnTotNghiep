<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        // 1. Cập nhật Enum VaiTro trong bảng NguoiDung
        // Tùy thuộc vào các Role hiện tại của bạn, hãy sửa lại danh sách cho khớp. Ở đây tôi thêm 'NhanVien'
        DB::statement("ALTER TABLE NguoiDung MODIFY VaiTro ENUM('Admin', 'QuanLySan', 'KhachHang', 'NhanVien') NOT NULL");

        // 2. Thêm cột và khóa ngoại cho bảng DatSan
        Schema::table('DatSan', function (Blueprint $table) {
            $table->unsignedBigInteger('ID_NhanVienXuLy')->nullable()->after('ID_GiaiDau');
            $table->foreign('ID_NhanVienXuLy')->references('ID')->on('NguoiDung')->onDelete('set null');
        });

        // 3. Cập nhật bảng GiaoDich
        Schema::table('GiaoDich', function (Blueprint $table) {
            $table->unsignedBigInteger('ID_NhanVienXuLy')->nullable()->after('ID_DatSan');
            $table->foreign('ID_NhanVienXuLy')->references('ID')->on('NguoiDung')->onDelete('set null');
        });
    }

    public function down()
    {
        Schema::table('GiaoDich', function (Blueprint $table) {
            $table->dropForeign(['ID_NhanVienXuLy']);
            $table->dropColumn('ID_NhanVienXuLy');
        });

        Schema::table('DatSan', function (Blueprint $table) {
            $table->dropForeign(['ID_NhanVienXuLy']);
            $table->dropColumn('ID_NhanVienXuLy');
        });
    }
};
