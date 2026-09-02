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
        Schema::create('GiaTien', function (Blueprint $table) {
            $table->id('ID');
            $table->unsignedBigInteger('ID_CumSan');
            $table->unsignedBigInteger('ID_LoaiSan');
            $table->unsignedBigInteger('ID_KhungGio');
            $table->integer('SoTien');

            // Khóa ngoại
            $table->foreign('ID_CumSan')->references('ID')->on('CumSan')->onDelete('cascade');
            $table->foreign('ID_LoaiSan')->references('ID')->on('LoaiSan')->onDelete('cascade');
            $table->foreign('ID_KhungGio')->references('ID')->on('KhungGio')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('GiaTien');
    }
};
