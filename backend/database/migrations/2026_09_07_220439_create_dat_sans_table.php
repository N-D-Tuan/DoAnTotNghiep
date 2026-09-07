<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('DatSan', function (Blueprint $table) {
            $table->id('ID');
            $table->unsignedBigInteger('ID_NguoiDung');
            $table->unsignedBigInteger('ID_SanBong');
            $table->unsignedBigInteger('ID_KhungGio');
            $table->unsignedBigInteger('ID_GiaiDau')->nullable();
            
            $table->date('NgayDa');
            $table->integer('TongTien')->default(0);
            $table->integer('TienCoc')->default(0);
            $table->enum('TrangThai', ['DaCoc', 'HoanThanh', 'DaHuy', 'KhongDen'])->default('DaCoc');

            // Khóa ngoại
            $table->foreign('ID_NguoiDung')->references('ID')->on('NguoiDung')->onDelete('cascade');
            $table->foreign('ID_SanBong')->references('ID')->on('SanBong')->onDelete('cascade');
            $table->foreign('ID_KhungGio')->references('ID')->on('KhungGio')->onDelete('cascade');
            $table->foreign('ID_GiaiDau')->references('ID')->on('GiaiDau')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('DatSan');
    }
};
