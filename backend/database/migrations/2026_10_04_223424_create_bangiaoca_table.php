<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('BanGiaoCa', function (Blueprint $table) {
            $table->id('ID');
            $table->unsignedBigInteger('ID_CumSan');
            $table->unsignedBigInteger('ID_CaLamViec');
            $table->date('Ngay');
            
            // Khâu nhận ca (Bắt buộc)
            $table->unsignedBigInteger('ID_NhanVienNhan');
            $table->dateTime('ThoiGianNhan');
            $table->decimal('TienHeThong', 15, 2); // Số tiền mốc bắt buộc
            $table->decimal('TienNhan', 15, 2);
            $table->string('GhiChuNhan')->nullable(); // Rỗng nếu tiền khớp
            
            // Khâu giao ca (Nullable vì cuối ca mới chốt)
            $table->unsignedBigInteger('ID_NhanVienGiao')->nullable();
            $table->dateTime('ThoiGianGiao')->nullable();
            $table->decimal('TienGiao', 15, 2)->nullable();
            $table->decimal('TienNopDoanhThu', 15, 2)->nullable();
            $table->string('GhiChuGiao')->nullable();
            
            $table->enum('TrangThai', ['DangTrongCa', 'DaChotCa', 'ChotCuongChe'])->default('DangTrongCa');
            
            $table->foreign('ID_CumSan')->references('ID')->on('CumSan')->onDelete('cascade');
            $table->foreign('ID_CaLamViec')->references('ID')->on('CaLamViec')->onDelete('cascade');
            $table->foreign('ID_NhanVienNhan')->references('ID')->on('NguoiDung')->onDelete('cascade');
            $table->foreign('ID_NhanVienGiao')->references('ID')->on('NguoiDung')->onDelete('set null');
        });
    }

    public function down()
    {
        Schema::dropIfExists('BanGiaoCa');
    }
};
