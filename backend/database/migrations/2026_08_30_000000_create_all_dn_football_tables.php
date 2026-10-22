<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 0. Bảng Token đăng nhập của Laravel Sanctum (Hỗ trợ MaNguoiDung kiểu VARCHAR(36))
        Schema::dropIfExists('personal_access_tokens');
        Schema::create('personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->string('tokenable_type');
            $table->string('tokenable_id', 36); // Lưu 'ND001', 'ND002'...
            $table->index(['tokenable_type', 'tokenable_id']);
            $table->string('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });

        // 1. Bảng Phuong (PK: MaPhuong - P001)
        Schema::create('Phuong', function (Blueprint $table) {
            $table->string('MaPhuong', 36)->primary();
            $table->string('TenPhuong', 255);
        });

        // 2. Bảng LoaiSan (PK: MaLoaiSan - LS001)
        Schema::create('LoaiSan', function (Blueprint $table) {
            $table->string('MaLoaiSan', 36)->primary();
            $table->string('TenLoaiSan', 255);
        });

        // 3. Bảng KhungGio (PK: MaKhungGio - KG001)
        Schema::create('KhungGio', function (Blueprint $table) {
            $table->string('MaKhungGio', 36)->primary();
            $table->time('GioBatDau');
            $table->time('GioKetThuc');
        });

        // 4. Bảng CumSan (PK: MaCumSan - CS001)
        Schema::create('CumSan', function (Blueprint $table) {
            $table->string('MaCumSan', 36)->primary();
            $table->string('MaPhuong', 36);
            $table->string('TenCumSan', 255);
            $table->string('DiaChi', 255);
            $table->decimal('ViDo', 10, 7)->nullable();
            $table->decimal('KinhDo', 10, 7)->nullable();
            $table->time('GioMoCua');
            $table->time('GioDongCua');
            $table->string('HinhAnh', 255)->nullable();
            $table->enum('TrangThai', ['HoatDong', 'BaoTri'])->default('HoatDong');

            $table->foreign('MaPhuong')->references('MaPhuong')->on('Phuong')->onDelete('cascade');
        });

        // 5. Bảng NguoiDung (PK: MaNguoiDung - ND001)
        Schema::create('NguoiDung', function (Blueprint $table) {
            $table->string('MaNguoiDung', 36)->primary();
            $table->string('HoTen', 255);
            $table->string('SoDienThoai', 20)->unique();
            $table->string('Email', 255)->unique();
            $table->string('Vneid', 50)->nullable();
            $table->string('MatKhau', 255);
            $table->enum('VaiTro', ['Admin', 'QuanLySan', 'NhanVien', 'KhachHang'])->default('KhachHang');
            $table->string('MaCumSan', 36)->nullable();
            $table->decimal('SoDuVi', 15, 2)->default(0);
            $table->string('TenNganHang', 100)->nullable();
            $table->string('STKNganHang', 100)->nullable();
            $table->string('TenTaiKhoan', 50)->nullable();
            $table->boolean('TrangThaiKhoa')->default(false);
            $table->string('Token', 100)->nullable();
            $table->string('MaOTP', 6)->nullable();
            $table->dateTime('ThoiGianHetHanOTP')->nullable();

            $table->foreign('MaCumSan')->references('MaCumSan')->on('CumSan')->onDelete('set null');
        });

        // 6. Bảng SanBong (PK: MaSanBong - SB001)
        Schema::create('SanBong', function (Blueprint $table) {
            $table->string('MaSanBong', 36)->primary();
            $table->string('MaCumSan', 36);
            $table->string('MaLoaiSan', 36);
            $table->string('TenSan', 255);
            $table->decimal('DienTich', 8, 2)->nullable();
            $table->string('KichThuoc', 50)->nullable();
            $table->text('MoTa')->nullable();
            $table->enum('TrangThai', ['HoatDong', 'BaoTri'])->default('HoatDong');

            $table->foreign('MaCumSan')->references('MaCumSan')->on('CumSan')->onDelete('cascade');
            $table->foreign('MaLoaiSan')->references('MaLoaiSan')->on('LoaiSan')->onDelete('cascade');
        });

        // 7. Bảng GiaTien (PK: MaGiaTien - GT001)
        Schema::create('GiaTien', function (Blueprint $table) {
            $table->string('MaGiaTien', 36)->primary();
            $table->string('MaCumSan', 36);
            $table->string('MaLoaiSan', 36);
            $table->string('MaKhungGio', 36);
            $table->decimal('SoTien', 15, 2);

            $table->foreign('MaCumSan')->references('MaCumSan')->on('CumSan')->onDelete('cascade');
            $table->foreign('MaLoaiSan')->references('MaLoaiSan')->on('LoaiSan')->onDelete('cascade');
            $table->foreign('MaKhungGio')->references('MaKhungGio')->on('KhungGio')->onDelete('cascade');
        });

        // 8. Bảng GiaiDau (PK: MaGiaiDau - GDAU001)
        Schema::create('GiaiDau', function (Blueprint $table) {
            $table->string('MaGiaiDau', 36)->primary();
            $table->string('MaNguoiDung', 36);
            $table->string('MaCumSan', 36);
            $table->string('TenGiaiDau', 255);
            $table->date('NgayBatDau');
            $table->date('NgayKetThuc');
            $table->text('NoiDung')->nullable();
            $table->enum('TrangThai', ['ChoDuyet', 'DaDuyet', 'TuChoi', 'HetHan', 'HoanThanh', 'DaHuy'])->default('ChoDuyet');
            $table->text('LyDoHuy')->nullable();
            $table->timestamp('NgayTao')->useCurrent();
            $table->timestamp('NgayDuyet')->nullable();

            $table->foreign('MaNguoiDung')->references('MaNguoiDung')->on('NguoiDung')->onDelete('cascade');
            $table->foreign('MaCumSan')->references('MaCumSan')->on('CumSan')->onDelete('cascade');
        });

        // 9. Bảng GiaoDich (PK: MaGiaoDich - GD001)
        Schema::create('GiaoDich', function (Blueprint $table) {
            $table->string('MaGiaoDich', 36)->primary();
            $table->string('MaNguoiDung', 36);
            $table->string('MaNhanVienXuLy', 36)->nullable();
            $table->enum('LoaiGiaoDich', ['NapTien', 'DatSan', 'RutTien', 'HoanTienHuyGap', 'HoanTienHuySan']);
            $table->enum('DongTien', ['Cong', 'Tru']);
            $table->decimal('SoTien', 15, 2);
            $table->decimal('SoDuTruoc', 15, 2);
            $table->decimal('SoDuSau', 15, 2);
            $table->text('NoiDung')->nullable();
            $table->timestamp('NgayTao')->useCurrent();

            $table->foreign('MaNguoiDung')->references('MaNguoiDung')->on('NguoiDung')->onDelete('cascade');
            $table->foreign('MaNhanVienXuLy')->references('MaNguoiDung')->on('NguoiDung')->onDelete('set null');
        });

        // 10. Bảng HoaDonDatSan (PK: MaHoaDonDatSan - HDDS001)
        Schema::create('HoaDonDatSan', function (Blueprint $table) {
            $table->string('MaHoaDonDatSan', 36)->primary();
            $table->string('MaNguoiDung', 36)->nullable();
            $table->string('MaGiaoDich', 36)->nullable();
            $table->decimal('TongTienSan', 15, 2);
            $table->decimal('TienDaCoc', 15, 2);
            $table->enum('PhuongThucThanhToan', ['ViDienTu', 'ChuyenKhoan', 'TienMat'])->default('ViDienTu');
            $table->enum('TrangThai', ['DaCoc', 'HoanThanh', 'DaHuy', 'KhongDen'])->default('DaCoc');
            $table->timestamp('NgayTao')->useCurrent();

            $table->foreign('MaNguoiDung')->references('MaNguoiDung')->on('NguoiDung')->onDelete('set null');
            $table->foreign('MaGiaoDich')->references('MaGiaoDich')->on('GiaoDich')->onDelete('set null');
        });

        // 11. Bảng DatSan (PK: MaDatSan - DS001)
        Schema::create('DatSan', function (Blueprint $table) {
            $table->string('MaDatSan', 36)->primary();
            $table->string('MaNguoiDung', 36)->nullable();
            $table->string('TenKhachVangLai', 100)->nullable();
            $table->string('SDTKhachVangLai', 20)->nullable();
            $table->string('EmailKhachVangLai', 100)->nullable();
            $table->string('MaSanBong', 36);
            $table->string('MaKhungGio', 36);
            $table->string('MaGiaiDau', 36)->nullable();
            $table->string('MaHoaDonDatSan', 36)->nullable();
            $table->string('MaNhanVienXuLy', 36)->nullable();
            $table->date('NgayDa');
            $table->decimal('TongTien', 15, 2);
            $table->decimal('TienCoc', 15, 2);
            $table->enum('TrangThai', ['DaCoc', 'HoanThanh', 'DaHuy', 'KhongDen'])->default('DaCoc');

            $table->foreign('MaNguoiDung')->references('MaNguoiDung')->on('NguoiDung')->onDelete('set null');
            $table->foreign('MaSanBong')->references('MaSanBong')->on('SanBong')->onDelete('cascade');
            $table->foreign('MaKhungGio')->references('MaKhungGio')->on('KhungGio')->onDelete('cascade');
            $table->foreign('MaGiaiDau')->references('MaGiaiDau')->on('GiaiDau')->onDelete('set null');
            $table->foreign('MaHoaDonDatSan')->references('MaHoaDonDatSan')->on('HoaDonDatSan')->onDelete('set null');
            $table->foreign('MaNhanVienXuLy')->references('MaNguoiDung')->on('NguoiDung')->onDelete('set null');
        });

        // 12. Bảng YeuCauHuyGap (PK: MaYeuCauHuyGap - YCHG001)
        Schema::create('YeuCauHuyGap', function (Blueprint $table) {
            $table->string('MaYeuCauHuyGap', 36)->primary();
            $table->string('MaNguoiDung', 36);
            $table->string('MaDatSan', 36);
            $table->text('NoiDung');
            $table->enum('TrangThai', ['ChoDuyet', 'DaDuyet', 'TuChoi'])->default('ChoDuyet');
            $table->text('LyDoHuy')->nullable();
            $table->timestamp('NgayTao')->useCurrent();
            $table->timestamp('NgayDuyet')->nullable();

            $table->foreign('MaNguoiDung')->references('MaNguoiDung')->on('NguoiDung')->onDelete('cascade');
            $table->foreign('MaDatSan')->references('MaDatSan')->on('DatSan')->onDelete('cascade');
        });

        // 13. Bảng DanhGia (PK: MaDanhGia - DG001)
        Schema::create('DanhGia', function (Blueprint $table) {
            $table->string('MaDanhGia', 36)->primary();
            $table->string('MaNguoiDung', 36);
            $table->string('MaCumSan', 36);
            $table->string('MaDatSan', 36);
            $table->smallInteger('SoSao')->default(5);
            $table->text('NoiDung')->nullable();
            $table->timestamp('NgayTao')->useCurrent();

            $table->foreign('MaNguoiDung')->references('MaNguoiDung')->on('NguoiDung')->onDelete('cascade');
            $table->foreign('MaCumSan')->references('MaCumSan')->on('CumSan')->onDelete('cascade');
            $table->foreign('MaDatSan')->references('MaDatSan')->on('DatSan')->onDelete('cascade');
        });

        // 14. Bảng ThongBao (PK: MaThongBao - TB001)
        Schema::create('ThongBao', function (Blueprint $table) {
            $table->string('MaThongBao', 36)->primary();
            $table->string('MaNguoiDung', 36);
            $table->string('TieuDe', 255);
            $table->text('NoiDung');
            $table->enum('LoaiThongBao', ['ViTien', 'DatSan', 'GiaiDau', 'HeThong', 'ThoiTiet'])->default('HeThong');
            $table->boolean('DaDoc')->default(false);
            $table->timestamp('NgayTao')->useCurrent();

            $table->foreign('MaNguoiDung')->references('MaNguoiDung')->on('NguoiDung')->onDelete('cascade');
        });

        // 15. Bảng PhienChat (PK: MaPhienChat - PC001)
        Schema::create('PhienChat', function (Blueprint $table) {
            $table->string('MaPhienChat', 36)->primary();
            $table->string('MaNguoiDung', 36);
            $table->string('TieuDe', 255)->nullable();
            $table->timestamp('NgayTao')->useCurrent();
            $table->timestamp('NgayCapNhat')->useCurrent()->useCurrentOnUpdate();
            $table->timestamp('NgayXoa')->nullable();

            $table->foreign('MaNguoiDung')->references('MaNguoiDung')->on('NguoiDung')->onDelete('cascade');
        });

        // 16. Bảng TinNhan (PK: MaTinNhan - TN001)
        Schema::create('TinNhan', function (Blueprint $table) {
            $table->string('MaTinNhan', 36)->primary();
            $table->string('MaPhienChat', 36);
            $table->enum('NguoiGui', ['User', 'Bot']);
            $table->text('NoiDung');
            $table->json('DuLieuBocThem')->nullable();
            $table->timestamp('NgayTao')->useCurrent();

            $table->foreign('MaPhienChat')->references('MaPhienChat')->on('PhienChat')->onDelete('cascade');
        });

        // 17. Bảng SanPham (PK: MaSanPham - SP001)
        Schema::create('SanPham', function (Blueprint $table) {
            $table->string('MaSanPham', 36)->primary();
            $table->string('MaCumSan', 36);
            $table->string('TenSanPham', 255);
            $table->decimal('GiaBan', 15, 2);
            $table->integer('SoLuongTon')->default(0);
            $table->string('HinhAnh', 255)->nullable();

            $table->foreign('MaCumSan')->references('MaCumSan')->on('CumSan')->onDelete('cascade');
        });

        // 18. Bảng PhieuNhapHang (PK: MaPhieuNhapHang - PNH001)
        Schema::create('PhieuNhapHang', function (Blueprint $table) {
            $table->string('MaPhieuNhapHang', 36)->primary();
            $table->string('MaCumSan', 36);
            $table->string('MaNhanVien', 36);
            $table->decimal('TongTienThanhToan', 15, 2);
            $table->json('ChiTietNhap')->nullable();
            $table->timestamp('NgayNhap')->useCurrent();

            $table->foreign('MaCumSan')->references('MaCumSan')->on('CumSan')->onDelete('cascade');
            $table->foreign('MaNhanVien')->references('MaNguoiDung')->on('NguoiDung')->onDelete('cascade');
        });

        // 19. Bảng HoaDonBanHang (PK: MaHoaDonBanHang - HDBH001)
        Schema::create('HoaDonBanHang', function (Blueprint $table) {
            $table->string('MaHoaDonBanHang', 36)->primary();
            $table->string('MaCumSan', 36);
            $table->string('MaNhanVien', 36);
            $table->decimal('TongTien', 15, 2);
            $table->timestamp('NgayTao')->useCurrent();

            $table->foreign('MaCumSan')->references('MaCumSan')->on('CumSan')->onDelete('cascade');
            $table->foreign('MaNhanVien')->references('MaNguoiDung')->on('NguoiDung')->onDelete('cascade');
        });

        // 20. Bảng ChiTietHoaDon (FK: MaHoaDon, MaSanPham)
        Schema::create('ChiTietHoaDon', function (Blueprint $table) {
            $table->string('MaHoaDon', 36);
            $table->string('MaSanPham', 36);
            $table->integer('SoLuong');
            $table->decimal('DonGia', 15, 2);

            $table->primary(['MaHoaDon', 'MaSanPham']);
            $table->foreign('MaHoaDon')->references('MaHoaDonBanHang')->on('HoaDonBanHang')->onDelete('cascade');
            $table->foreign('MaSanPham')->references('MaSanPham')->on('SanPham')->onDelete('cascade');
        });

        // 21. Bảng CaLamViec (PK: MaCaLamViec - CLV001)
        Schema::create('CaLamViec', function (Blueprint $table) {
            $table->string('MaCaLamViec', 36)->primary();
            $table->string('MaCumSan', 36);
            $table->string('TenCa', 50);
            $table->time('GioBatDau');
            $table->time('GioKetThuc');
            $table->integer('SoLuongNhanVien')->default(1);
            $table->decimal('LuongThuNgan', 15, 2)->default(0);
            $table->decimal('LuongPhucVu', 15, 2)->default(0);

            $table->foreign('MaCumSan')->references('MaCumSan')->on('CumSan')->onDelete('cascade');
        });

        // 22. Bảng LichLamViec (PK: MaLichLamViec - LLV001)
        Schema::create('LichLamViec', function (Blueprint $table) {
            $table->string('MaLichLamViec', 36)->primary();
            $table->string('MaCaLamViec', 36);
            $table->date('NgayLam');
            $table->string('MaNhanVien', 36)->nullable();
            $table->string('GhiChu', 255)->nullable();
            $table->string('CongViec', 50)->nullable();
            $table->enum('TrangThaiXepLich', ['DangKy', 'DaDuyet', 'TuChoi'])->default('DangKy');
            $table->enum('TrangThaiDiemDanh', ['ChuaLam', 'DaLam', 'VangMat'])->default('ChuaLam');
            $table->integer('SoPhutDiMuon')->default(0);
            $table->decimal('TienPhat', 15, 2)->default(0);
            $table->decimal('TienThuong', 15, 2)->default(0);
            $table->string('LyDoDieuChinh', 255)->nullable();

            $table->foreign('MaCaLamViec')->references('MaCaLamViec')->on('CaLamViec')->onDelete('cascade');
            $table->foreign('MaNhanVien')->references('MaNguoiDung')->on('NguoiDung')->onDelete('set null');
        });

        // 23. Bảng BanGiaoCa (PK: MaBanGiaoCa - BGC001)
        Schema::create('BanGiaoCa', function (Blueprint $table) {
            $table->string('MaBanGiaoCa', 36)->primary();
            $table->string('MaCumSan', 36);
            $table->string('MaCaLamViec', 36);
            $table->date('Ngay');
            $table->string('MaNhanVienNhan', 36);
            $table->dateTime('ThoiGianNhan');
            $table->decimal('TienHeThong', 15, 2)->default(0);
            $table->decimal('TienNhan', 15, 2)->default(0);
            $table->string('GhiChuNhan', 255)->nullable();
            $table->string('MaNhanVienGiao', 36)->nullable();
            $table->dateTime('ThoiGianGiao')->nullable();
            $table->decimal('TienGiao', 15, 2)->nullable();
            $table->decimal('TienNopDoanhThu', 15, 2)->nullable();
            $table->string('GhiChuGiao', 255)->nullable();
            $table->enum('TrangThai', ['DangTrongCa', 'DaChotCa', 'ChotCuongChe'])->default('DangTrongCa');

            $table->foreign('MaCumSan')->references('MaCumSan')->on('CumSan')->onDelete('cascade');
            $table->foreign('MaCaLamViec')->references('MaCaLamViec')->on('CaLamViec')->onDelete('cascade');
            $table->foreign('MaNhanVienNhan')->references('MaNguoiDung')->on('NguoiDung')->onDelete('cascade');
            $table->foreign('MaNhanVienGiao')->references('MaNguoiDung')->on('NguoiDung')->onDelete('set null');
        });

        // 24. Bảng ChiPhiPhatSinh (PK: MaChiPhiPhatSinh - CPPS001)
        Schema::create('ChiPhiPhatSinh', function (Blueprint $table) {
            $table->string('MaChiPhiPhatSinh', 36)->primary();
            $table->string('MaBanGiaoCa', 36);
            $table->decimal('SoTien', 15, 2);
            $table->string('NoiDung', 255);
            $table->dateTime('ThoiGian');

            $table->foreign('MaBanGiaoCa')->references('MaBanGiaoCa')->on('BanGiaoCa')->onDelete('cascade');
        });

        // 25. Bảng BangLuong (PK: MaBangLuong - BL001)
        Schema::create('BangLuong', function (Blueprint $table) {
            $table->string('MaBangLuong', 36)->primary();
            $table->string('MaNhanVien', 36);
            $table->string('ThangNam', 20);
            $table->integer('TongCaLam')->default(0);
            $table->decimal('TongTienLuong', 15, 2)->default(0);
            $table->decimal('TongTienThuong', 15, 2)->nullable()->default(0);
            $table->decimal('TongTienPhat', 15, 2)->nullable()->default(0);
            $table->text('LyDoKhieuNai')->nullable();
            $table->enum('TrangThai', ['ChoXacNhan', 'KhieuNai', 'ChoThanhToan', 'DaThanhToan'])->default('ChoXacNhan');
            $table->timestamp('NgayChot')->useCurrent();
            $table->dateTime('NgayXacNhan')->nullable();
            $table->dateTime('NgayThanhToan')->nullable();

            $table->foreign('MaNhanVien')->references('MaNguoiDung')->on('NguoiDung')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::disableForeignKeyConstraints();
        $tables = [
            'BangLuong', 'ChiPhiPhatSinh', 'BanGiaoCa', 'LichLamViec', 'CaLamViec',
            'ChiTietHoaDon', 'HoaDonBanHang', 'PhieuNhapHang', 'SanPham',
            'TinNhan', 'PhienChat', 'ThongBao', 'DanhGia', 'YeuCauHuyGap',
            'DatSan', 'HoaDonDatSan', 'GiaoDich', 'GiaiDau', 'GiaTien',
            'SanBong', 'NguoiDung', 'CumSan', 'KhungGio', 'LoaiSan', 'Phuong',
            'personal_access_tokens'
        ];
        foreach ($tables as $t) {
            Schema::dropIfExists($t);
        }
        Schema::enableForeignKeyConstraints();
    }
};