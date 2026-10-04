<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('LichLamViec', function (Blueprint $table) {
            $table->id('ID');
            $table->unsignedBigInteger('ID_CaLamViec');
            $table->date('NgayLam');
            $table->unsignedBigInteger('ID_NhanVien')->nullable(); // Có thể rỗng nếu chưa ai nhận
            
            $table->string('GhiChu')->nullable();
            $table->string('CongViec', 50)->nullable(); // Thu Ngân / Phục Vụ
            
            $table->enum('TrangThaiXepLich', ['DangKy', 'DaDuyet', 'TuChoi'])->default('DangKy');
            $table->enum('TrangThaiDiemDanh', ['ChuaLam', 'DaLam', 'VangMat'])->default('ChuaLam');
            
            // Xử lý phạt/thưởng
            $table->integer('SoPhutDiMuon')->nullable(); // Tính bằng phút
            $table->decimal('TienPhat', 15, 2)->nullable();
            $table->decimal('TienThuong', 15, 2)->nullable();
            $table->string('LyDoDieuChinh')->nullable();
            
            $table->foreign('ID_CaLamViec')->references('ID')->on('CaLamViec')->onDelete('cascade');
            $table->foreign('ID_NhanVien')->references('ID')->on('NguoiDung')->onDelete('set null');
        });
    }

    public function down()
    {
        Schema::dropIfExists('LichLamViec');
    }
};
