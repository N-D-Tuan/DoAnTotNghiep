<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('BangLuong', function (Blueprint $table) {
            $table->id('ID');
            $table->unsignedBigInteger('ID_NhanVien');
            
            $table->string('ThangNam', 20); // Lưu dạng '10/2026'
            $table->integer('TongCaLam');
            $table->decimal('TongTienLuong', 15, 2);
            $table->decimal('TongTienThuong', 15, 2)->nullable();
            $table->decimal('TongTienPhat', 15, 2)->nullable();
            
            $table->text('ThongTinNganHang')->nullable();
            $table->text('LyDoKhieuNai')->nullable();
            
            $table->enum('TrangThai', ['ChoXacNhan', 'KhieuNai', 'ChoThanhToan', 'DaThanhToan'])->default('ChoXacNhan');
            
            $table->dateTime('NgayChot')->default(DB::raw('CURRENT_TIMESTAMP'));
            $table->dateTime('NgayXacNhan')->nullable();
            $table->dateTime('NgayThanhToan')->nullable();
            
            $table->foreign('ID_NhanVien')->references('ID')->on('NguoiDung')->onDelete('cascade');
        });
    }

    public function down()
    {
        Schema::dropIfExists('BangLuong');
    }
};
