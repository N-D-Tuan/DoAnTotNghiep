<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('DatSan', function (Blueprint $table) {
            // 1. Cho phép ID_NguoiDung được để trống (NULL) khi là Khách vãng lai
            $table->unsignedBigInteger('ID_NguoiDung')->nullable()->change();
            
            // 2. Thêm cột lưu trữ Tên, SĐT và Email khách vãng lai
            $table->string('TenKhachVangLai', 100)->nullable()->after('ID_NguoiDung');
            $table->string('SDTKhachVangLai', 20)->nullable()->after('TenKhachVangLai');
            $table->string('EmailKhachVangLai', 100)->nullable()->after('SDTKhachVangLai');
        });
    }

    public function down(): void
    {
        Schema::table('DatSan', function (Blueprint $table) {
            // Xóa 3 cột thông tin khách vãng lai khi rollback
            $table->dropColumn(['TenKhachVangLai', 'SDTKhachVangLai', 'EmailKhachVangLai']);
            
            // Chuyển ID_NguoiDung về lại bắt buộc (Lưu ý: sẽ lỗi nếu trong DB đang có sẵn dữ liệu NULL)
            $table->unsignedBigInteger('ID_NguoiDung')->nullable(false)->change();
        });
    }
};
