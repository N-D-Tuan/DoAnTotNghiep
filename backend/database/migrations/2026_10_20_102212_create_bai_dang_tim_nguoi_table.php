<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('BaiDangTimNguoi')) {
            Schema::create('BaiDangTimNguoi', function (Blueprint $table) {
                $table->id('ID');
                $table->unsignedBigInteger('ID_DatSan');
                $table->unsignedBigInteger('ID_NguoiTao');
                $table->string('TenDoiChuNha', 150)->nullable();
                $table->enum('LoaiKeo', ['TimDoi', 'TuyenQuan'])->default('TimDoi');
                $table->string('TrinhDo', 100)->default('Vui vẻ / Giao lưu');
                $table->string('ChiaTienSan', 100)->default('50 - 50');
                $table->integer('SoLuongCan')->nullable();
                $table->text('GhiChu')->nullable();
                $table->unsignedBigInteger('ID_NguoiNhan')->nullable();
                $table->string('TenDoiKhach', 150)->nullable();
                $table->string('SDTKhach', 20)->nullable();
                $table->enum('TrangThai', ['DangTim', 'DaGhep', 'DaHuy'])->default('DangTim');
                $table->timestamp('NgayTao')->useCurrent();

                // Khóa ngoại
                $table->foreign('ID_DatSan')->references('ID')->on('DatSan')->onDelete('cascade');
                $table->foreign('ID_NguoiTao')->references('ID')->on('NguoiDung')->onDelete('cascade');
                $table->foreign('ID_NguoiNhan')->references('ID')->on('NguoiDung')->onDelete('set null');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('BaiDangTimNguoi');
    }
};