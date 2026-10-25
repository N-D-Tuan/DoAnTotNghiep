<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Tắt kiểm tra khóa ngoại tạm thời để xóa các bảng cũ an toàn
        Schema::disableForeignKeyConstraints();

        // =================================================================
        // 1. XÓA 7 BẢNG NỘI BỘ / BÁN HÀNG ĐÃ LƯỢC BỎ KHỎI ERD
        // =================================================================
        Schema::dropIfExists('ChiTietHoaDon');   // Bảng chi tiết bán nước cũ
        Schema::dropIfExists('HoaDonBanHang');
        Schema::dropIfExists('PhieuNhapHang');
        Schema::dropIfExists('SanPham');
        Schema::dropIfExists('ChiPhiPhatSinh');
        Schema::dropIfExists('BanGiaoCa');
        Schema::dropIfExists('BangLuong');

        Schema::enableForeignKeyConstraints();

        // =================================================================
        // 2. TẠO BẢNG MỚI: KhuyenMai
        // =================================================================
        if (!Schema::hasTable('KhuyenMai')) {
            Schema::create('KhuyenMai', function (Blueprint $table) {
                $table->string('MaKhuyenMai', 36)->primary();
                $table->string('MaNguoiDung', 36)->nullable();
                $table->string('TenKhuyenMai', 255);
                $table->text('MoTa')->nullable();
                $table->enum('LoaiKhuyenMai', ['PhanTram', 'CoDinh'])->default('PhanTram');
                $table->decimal('GiaTri', 15, 2)->default(0);
                $table->decimal('GiaTriToiDa', 15, 2)->default(0);
                $table->decimal('GiaTriHoaDonToiThieu', 15, 2)->default(0);
                $table->integer('SoLuong')->default(1);
                $table->integer('SoLuongDaDung')->default(0);
                $table->dateTime('NgayBatDau');
                $table->dateTime('NgayKetThuc');
                $table->enum('TrangThai', ['DangApDung', 'HetHan'])->default('DangApDung');

                $table->foreign('MaNguoiDung')
                      ->references('MaNguoiDung')->on('NguoiDung')
                      ->nullOnDelete();
            });
        }

        // =================================================================
        // 3. CẬP NHẬT BẢNG: HoaDonDatSan
        // (Đổi TongTienSan -> TongTien, Bỏ TienDaCoc, Thêm MaKhuyenMai & ThueVAT)
        // =================================================================
        Schema::table('HoaDonDatSan', function (Blueprint $table) {
            if (!Schema::hasColumn('HoaDonDatSan', 'MaKhuyenMai')) {
                $table->string('MaKhuyenMai', 36)->nullable()->after('MaGiaoDich');
                $table->foreign('MaKhuyenMai')
                      ->references('MaKhuyenMai')->on('KhuyenMai')
                      ->nullOnDelete();
            }

            if (!Schema::hasColumn('HoaDonDatSan', 'TongTien')) {
                $table->decimal('TongTien', 15, 2)->default(0)->after('MaKhuyenMai');
            }

            if (!Schema::hasColumn('HoaDonDatSan', 'ThueVAT')) {
                $table->decimal('ThueVAT', 15, 2)->default(0)->after('TongTien');
            }
        });

        // Chép dữ liệu từ TongTienSan cũ sang TongTien mới (nếu có) trước khi xóa cột cũ
        if (Schema::hasColumn('HoaDonDatSan', 'TongTienSan')) {
            DB::statement('UPDATE HoaDonDatSan SET TongTien = TongTienSan WHERE TongTien = 0');
            Schema::table('HoaDonDatSan', function (Blueprint $table) {
                $table->dropColumn('TongTienSan');
            });
        }

        if (Schema::hasColumn('HoaDonDatSan', 'TienDaCoc')) {
            Schema::table('HoaDonDatSan', function (Blueprint $table) {
                $table->dropColumn('TienDaCoc');
            });
        }

        // =================================================================
        // 4. TẠO BẢNG MỚI: ChiTietHoaDon (Của HoaDonDatSan)
        // =================================================================
        Schema::create('ChiTietHoaDon', function (Blueprint $table) {
            $table->string('MaHoaDonDatSan', 36);
            $table->string('MaDatSan', 36);
            $table->decimal('DonGia', 15, 2)->default(0);

            // Khóa chính phức hợp (PK, FK) như trên ERD
            $table->primary(['MaHoaDonDatSan', 'MaDatSan']);
            // Đảm bảo quan hệ 1-1 giữa DatSan và ChiTietHoaDon
            $table->unique('MaDatSan');

            $table->foreign('MaHoaDonDatSan')
                  ->references('MaHoaDonDatSan')->on('HoaDonDatSan')
                  ->cascadeOnDelete();

            $table->foreign('MaDatSan')
                  ->references('MaDatSan')->on('DatSan')
                  ->cascadeOnDelete();
        });

        // Tự động chuyển dữ liệu liên kết MaHoaDonDatSan cũ từ bảng DatSan sang bảng ChiTietHoaDon
        if (Schema::hasColumn('DatSan', 'MaHoaDonDatSan')) {
            $oldBookings = DB::table('DatSan')->whereNotNull('MaHoaDonDatSan')->get();
            foreach ($oldBookings as $b) {
                $exists = DB::table('HoaDonDatSan')->where('MaHoaDonDatSan', $b->MaHoaDonDatSan)->exists();
                if ($exists) {
                    DB::table('ChiTietHoaDon')->insertOrIgnore([
                        'MaHoaDonDatSan' => $b->MaHoaDonDatSan,
                        'MaDatSan'       => $b->MaDatSan,
                        'DonGia'         => $b->TongTien ?? 0,
                    ]);
                }
            }
        }

        // =================================================================
        // 5. CẬP NHẬT BẢNG: DatSan
        // (Đổi tên 3 cột khách vãng lai -> NguoiDat và bỏ cột MaHoaDonDatSan)
        // =================================================================
        Schema::table('DatSan', function (Blueprint $table) {
            if (!Schema::hasColumn('DatSan', 'TenNguoiDat')) {
                $table->string('TenNguoiDat', 100)->nullable()->after('MaNguoiDung');
            }
            if (!Schema::hasColumn('DatSan', 'SDTNguoiDat')) {
                $table->string('SDTNguoiDat', 20)->nullable()->after('TenNguoiDat');
            }
            if (!Schema::hasColumn('DatSan', 'EmailNguoiDat')) {
                $table->string('EmailNguoiDat', 100)->nullable()->after('SDTNguoiDat');
            }
        });

        // Chép dữ liệu từ 3 cột KhachVangLai cũ sang 3 cột NguoiDat mới
        if (Schema::hasColumn('DatSan', 'TenKhachVangLai')) {
            DB::statement('UPDATE DatSan SET TenNguoiDat = TenKhachVangLai, SDTNguoiDat = SDTKhachVangLai, EmailNguoiDat = EmailKhachVangLai');
            Schema::table('DatSan', function (Blueprint $table) {
                $table->dropColumn(['TenKhachVangLai', 'SDTKhachVangLai', 'EmailKhachVangLai']);
            });
        }

        // Gỡ khóa ngoại và xóa cột MaHoaDonDatSan khỏi bảng DatSan
        if (Schema::hasColumn('DatSan', 'MaHoaDonDatSan')) {
            Schema::disableForeignKeyConstraints();
            Schema::table('DatSan', function (Blueprint $table) {
                // Thử gỡ foreign key nếu có đặt tên mặc định của Laravel
                try {
                    $table->dropForeign(['MaHoaDonDatSan']);
                } catch (\Exception $e) {}
                $table->dropColumn('MaHoaDonDatSan');
            });
            Schema::enableForeignKeyConstraints();
        }
    }

    public function down(): void
    {
        // Không cần rollback các bảng đã loại bỏ khỏi thiết kế
    }
};