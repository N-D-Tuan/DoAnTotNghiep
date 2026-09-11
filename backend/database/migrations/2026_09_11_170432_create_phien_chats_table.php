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
        Schema::create('PhienChat', function (Blueprint $table) {
            $table->id('ID');
            $table->unsignedBigInteger('ID_NguoiDung');
            $table->string('TieuDe', 255)->nullable();
            
            // Custom Timestamps & Soft Deletes
            $table->timestamp('NgayTao')->nullable();
            $table->timestamp('NgayCapNhat')->nullable();
            $table->softDeletes('NgayXoa');

            // Khóa ngoại liên kết tới bảng NguoiDung
            $table->foreign('ID_NguoiDung')->references('ID')->on('NguoiDung')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('PhienChat');
    }
};
