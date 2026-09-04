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
        Schema::create('giaodich', function (Blueprint $table) {
            $table->id('ID');
            $table->unsignedBigInteger('ID_NguoiDung');
            // ID_DatSan có thể rỗng và CHƯA set khóa ngoại theo yêu cầu
            $table->unsignedBigInteger('ID_DatSan')->nullable(); 
            
            $table->enum('LoaiGiaoDich', ['NapTien', 'DatSan', 'HoanTienHuySan', 'HoanTienHuyGap', 'RutTien']);
            $table->enum('DongTien', ['Cong', 'Tru']);
            
            // Dùng decimal 15,0 cho tiền tệ VNĐ để tránh lỗi làm tròn
            $table->decimal('SoTien', 15, 0); 
            $table->decimal('SoDuTruoc', 15, 0);
            $table->decimal('SoDuSau', 15, 0);
            
            $table->text('NoiDung')->nullable();
            
            // Chỉ tạo cột NgayTao, không dùng $table->timestamps() để tránh sinh ra updated_at
            $table->timestamp('NgayTao')->useCurrent();

            // Ràng buộc khóa ngoại với bảng NguoiDung
            $table->foreign('ID_NguoiDung')->references('ID')->on('nguoidung')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('giaodich');
    }
};
