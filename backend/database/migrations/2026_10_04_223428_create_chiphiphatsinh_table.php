<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('ChiPhiPhatSinh', function (Blueprint $table) {
            $table->id('ID');
            $table->unsignedBigInteger('ID_BanGiaoCa');
            $table->decimal('SoTien', 15, 2);
            $table->string('NoiDung');
            $table->dateTime('ThoiGian');
            
            $table->foreign('ID_BanGiaoCa')->references('ID')->on('BanGiaoCa')->onDelete('cascade');
        });
    }

    public function down()
    {
        Schema::dropIfExists('ChiPhiPhatSinh');
    }
};
