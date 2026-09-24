<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('NguoiDung', function (Blueprint $table) {
            $table->string('Token', 100)->nullable()->after('TrangThaiKhoa');
        });
    }

    public function down()
    {
        Schema::table('NguoiDung', function (Blueprint $table) {
            $table->dropColumn('Token');
        });
    }
};
