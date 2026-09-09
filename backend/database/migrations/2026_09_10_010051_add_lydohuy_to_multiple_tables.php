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
        // 1. Thêm vào bảng YeuCauHuyGap
        Schema::table('YeuCauHuyGap', function (Blueprint $table) {
            $table->text('LyDoHuy')->nullable()->after('TrangThai');
        });

        // 2. Thêm vào bảng yeucauruttien
        Schema::table('yeucauruttien', function (Blueprint $table) {
            $table->text('LyDoHuy')->nullable()->after('TrangThai');
        });

        // 3. Thêm vào bảng giaidau
        Schema::table('giaidau', function (Blueprint $table) {
            $table->text('LyDoHuy')->nullable()->after('TrangThai');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('YeuCauHuyGap', function (Blueprint $table) {
            $table->dropColumn('LyDoHuy');
        });

        Schema::table('yeucauruttien', function (Blueprint $table) {
            $table->dropColumn('LyDoHuy');
        });

        Schema::table('giaidau', function (Blueprint $table) {
            $table->dropColumn('LyDoHuy');
        });
    }
};
