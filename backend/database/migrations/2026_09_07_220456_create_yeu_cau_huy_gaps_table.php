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
        Schema::create('YeuCauHuyGap', function (Blueprint $table) {
            $table->id('ID');
            $table->unsignedBigInteger('ID_NguoiDung');
            $table->unsignedBigInteger('ID_DatSan');
            
            $table->text('NoiDung')->nullable();
            $table->enum('TrangThai', ['ChoDuyet', 'DaDuyet', 'TuChoi'])->default('ChoDuyet');
            
            // Cột NgayTao sẽ hoạt động như created_at, NgayDuyet là cột riêng
            $table->timestamp('NgayTao')->useCurrent();
            $table->timestamp('NgayDuyet')->nullable();
            
            // Khóa ngoại
            $table->foreign('ID_NguoiDung')->references('ID')->on('NguoiDung')->onDelete('cascade');
            $table->foreign('ID_DatSan')->references('ID')->on('DatSan')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('YeuCauHuyGap');
    }
};
