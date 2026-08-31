<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up()
    {
        Schema::create('NguoiDung', function (Blueprint $table) {
            $table->id('ID');
            $table->string('HoTen', 255);
            $table->string('SoDienThoai', 20)->unique();
            $table->string('Email', 255)->unique();
            $table->string('MatKhau', 255);
            $table->enum('VaiTro', ['KhachHang', 'Admin'])->default('KhachHang');
            $table->decimal('SoDuVi', 15, 2)->default(0);
            $table->string('MaOTP', 6)->nullable();
            $table->dateTime('ThoiGianHetHanOTP')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('nguoi_dungs');
    }
};
