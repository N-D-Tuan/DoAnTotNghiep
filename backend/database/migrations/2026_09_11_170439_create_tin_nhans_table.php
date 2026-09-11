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
        Schema::create('TinNhan', function (Blueprint $table) {
            $table->id('ID');
            $table->unsignedBigInteger('ID_PhienChat');
            $table->enum('NguoiGui', ['User', 'Bot']);
            $table->text('NoiDung');
            $table->json('DuLieuBocThem')->nullable();
            
            // Custom Timestamps (Chỉ có created_at, loại bỏ updated_at)
            $table->timestamp('NgayTao')->nullable();

            // Khóa ngoại liên kết tới bảng PhienChat
            $table->foreign('ID_PhienChat')->references('ID')->on('PhienChat')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('TinNhan');
    }
};
