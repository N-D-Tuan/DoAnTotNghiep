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
        Schema::create('giaidau', function (Blueprint $table) {
            $table->id('ID');
            $table->unsignedBigInteger('ID_NguoiDung');
            $table->unsignedBigInteger('ID_CumSan'); // Ràng buộc giải đấu thuộc về 1 cụm
            $table->string('TenGiaiDau', 255);
            $table->date('NgayBatDau');
            $table->date('NgayKetThuc');
            $table->text('NoiDung')->nullable();
            $table->enum('TrangThai', [
                'ChoDuyet', 'DaDuyet', 'TuChoi', 'HetHan', 'HoanThanh', 'DaHuy'
            ])->default('ChoDuyet');
            
            $table->timestamp('NgayTao')->useCurrent(); // Tự động lấy giờ hệ thống lúc INSERT
            $table->timestamp('NgayDuyet')->nullable();

            $table->foreign('ID_NguoiDung')->references('ID')->on('nguoidung')->onDelete('cascade');
            $table->foreign('ID_CumSan')->references('ID')->on('cumsan')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('giaidau');
    }
};
