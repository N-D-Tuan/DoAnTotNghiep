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
        Schema::create('CumSan', function (Blueprint $table) {
            $table->id('ID');
            $table->unsignedBigInteger('ID_Phuong');
            $table->string('TenCumSan', 255);
            $table->string('DiaChi', 255);
            $table->time('GioMoCua');
            $table->time('GioDongCua');
            $table->string('HinhAnh', 255)->nullable();

            // Khóa ngoại
            $table->foreign('ID_Phuong')->references('ID')->on('Phuong')->onDelete('restrict');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('CumSan');
    }
};
