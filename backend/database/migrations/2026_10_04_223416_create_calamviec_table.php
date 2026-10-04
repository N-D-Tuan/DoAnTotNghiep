<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('CaLamViec', function (Blueprint $table) {
            $table->id('ID');
            $table->unsignedBigInteger('ID_CumSan');
            $table->string('TenCa', 50); // VD: Ca Sáng, Ca Tối
            $table->time('GioBatDau');
            $table->time('GioKetThuc');
            $table->integer('SoLuongNhanVien');
            $table->decimal('LuongThuNgan', 15, 2);
            $table->decimal('LuongPhucVu', 15, 2);
            
            $table->foreign('ID_CumSan')->references('ID')->on('CumSan')->onDelete('cascade');
        });
    }

    public function down()
    {
        Schema::dropIfExists('CaLamViec');
    }
};
