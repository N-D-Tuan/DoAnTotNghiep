<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE NguoiDung MODIFY COLUMN VaiTro ENUM('KhachHang', 'Admin', 'QuanLySan') DEFAULT 'KhachHang'");
        
        Schema::table('NguoiDung', function (Blueprint $table) {
            $table->unsignedBigInteger('ID_CumSan')->nullable()->after('VaiTro');
            
            $table->foreign('ID_CumSan')->references('ID')->on('CumSan')->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::table('NguoiDung', function (Blueprint $table) {
            $table->dropForeign(['ID_CumSan']);
            $table->dropColumn('ID_CumSan');
        });

        DB::statement("ALTER TABLE NguoiDung MODIFY COLUMN VaiTro ENUM('KhachHang', 'Admin') DEFAULT 'KhachHang'");
    }
};
