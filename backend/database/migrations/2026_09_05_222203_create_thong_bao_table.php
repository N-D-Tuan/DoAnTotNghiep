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
        Schema::create('ThongBao', function (Blueprint $table) {
            $table->id('ID');
            $table->unsignedBigInteger('ID_NguoiDung');
            $table->string('TieuDe');
            $table->text('NoiDung');
            $table->enum('LoaiThongBao', ['ViTien', 'DatSan', 'GiaiDau', 'HeThong', 'ThoiTiet']);
            $table->boolean('DaDoc')->default(0);
            
            // Chỉ tạo cột NgayTao, không tạo updated_at
            $table->timestamp('NgayTao')->useCurrent();

            // Khóa ngoại
            $table->foreign('ID_NguoiDung')->references('ID')->on('NguoiDung')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ThongBao');
    }
};
