<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('DanhGia', function (Blueprint $table) {
            $table->id('ID');
            $table->unsignedBigInteger('ID_DatSan')->unique(); // Mỗi đơn đặt sân chỉ đánh giá 1 lần
            $table->unsignedBigInteger('ID_CumSan');
            $table->unsignedBigInteger('ID_NguoiDung');
            $table->unsignedTinyInteger('SoSao'); // 1 -> 5 sao
            $table->text('NoiDung')->nullable();
            $table->timestamp('NgayTao')->useCurrent();

            $table->foreign('ID_DatSan')->references('ID')->on('DatSan')->onDelete('cascade');
            $table->foreign('ID_CumSan')->references('ID')->on('CumSan')->onDelete('cascade');
            $table->foreign('ID_NguoiDung')->references('ID')->on('NguoiDung')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('DanhGia');
    }
};