<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('CumSan', function (Blueprint $table) {
            // Đặt sau cột DiaChi cho đúng logic chuẩn
            $table->decimal('ViDo', 10, 8)->nullable()->after('DiaChi');
            $table->decimal('KinhDo', 11, 8)->nullable()->after('ViDo');
        });
    }

    public function down()
    {
        Schema::table('CumSan', function (Blueprint $table) {
            $table->dropColumn(['ViDo', 'KinhDo']);
        });
    }
};
