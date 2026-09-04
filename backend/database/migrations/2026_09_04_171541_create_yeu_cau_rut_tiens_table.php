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
        Schema::create('yeucauruttien', function (Blueprint $table) {
            $table->id('ID');
            $table->unsignedBigInteger('ID_NguoiDung');
            
            // ID_GiaoDich có thể rỗng lúc người dùng mới tạo yêu cầu (chưa duyệt)
            $table->unsignedBigInteger('ID_GiaoDich')->nullable(); 
            
            $table->decimal('SoTien', 15, 0);
            $table->text('NoiDung')->nullable();
            $table->enum('TrangThai', ['ChoDuyet', 'DaDuyet', 'TuChoi'])->default('ChoDuyet');
            
            // Ngày tạo và ngày duyệt
            $table->timestamp('NgayTao')->useCurrent();
            $table->timestamp('NgayDuyet')->nullable();

            // Khóa ngoại
            $table->foreign('ID_NguoiDung')->references('ID')->on('nguoidung')->onDelete('cascade');
            $table->foreign('ID_GiaoDich')->references('ID')->on('giaodich')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('yeucauruttien');
    }
};
