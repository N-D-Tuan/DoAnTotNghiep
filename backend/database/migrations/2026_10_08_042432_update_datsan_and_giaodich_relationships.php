<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. THÊM CỘT ID_GiaoDich VÀO BẢNG DatSan
        Schema::table('DatSan', function (Blueprint $table) {
            // Đặt cột này sau ID_GiaiDau, cho phép null, kiểu unsignedBigInteger để làm khóa ngoại
            $table->unsignedBigInteger('ID_GiaoDich')->nullable()->after('ID_GiaiDau');
            
            // Thiết lập khóa ngoại (tùy chọn nhưng khuyên dùng)
            $table->foreign('ID_GiaoDich')->references('ID')->on('giaodich')->onDelete('set null');
        });

        // 2. XÓA CỘT ID_DatSan KHỎI BẢNG giaodich
        Schema::table('giaodich', function (Blueprint $table) {
            // Nếu bạn có tạo Foreign Key cho ID_DatSan trước đó thì phải drop nó trước
            // Lệnh dropForeign dùng tên convention: 'tenbang_tencot_foreign'
            // $table->dropForeign(['ID_DatSan']); 
            
            $table->dropColumn('ID_DatSan');
        });
    }
    
    public function down(): void
    {
        // THAO TÁC NGƯỢC LẠI KHI ROLLBACK
        Schema::table('giaodich', function (Blueprint $table) {
            $table->unsignedBigInteger('ID_DatSan')->nullable()->after('ID_NguoiDung');
        });

        Schema::table('DatSan', function (Blueprint $table) {
            $table->dropForeign(['ID_GiaoDich']);
            $table->dropColumn('ID_GiaoDich');
        });
    }
};
