<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\File;

class ExportToCustomSeeder extends Command
{
    protected $signature = 'db:export-seeder';
    protected $description = 'Xuất toàn bộ dữ liệu MySQL hiện tại sang DatabaseSeeder.php với mã VARCHAR(36) mới';

    private function fmt($prefix, $val)
    {
        if ($val === null || $val === '') return null;
        if (!is_numeric($val)) return (string)$val; // Nếu đã là mã chuỗi rồi thì giữ nguyên
        return $prefix . str_pad((string)$val, 3, '0', STR_PAD_LEFT);
    }

    public function handle()
    {
        $this->info('Đang đọc dữ liệu từ MySQL và chuyển đổi sang chuẩn Mã mới...');

        $data = [];

        // 1. Phuong (P)
        if (Schema::hasTable('Phuong')) {
            $data['Phuong'] = DB::table('Phuong')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaPhuong'  => $this->fmt('P', $r['ID'] ?? $r['MaPhuong'] ?? null),
                    'TenPhuong' => $r['TenPhuong'] ?? '',
                ];
            })->toArray();
        }

        // 2. LoaiSan (LS)
        if (Schema::hasTable('LoaiSan')) {
            $data['LoaiSan'] = DB::table('LoaiSan')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaLoaiSan'  => $this->fmt('LS', $r['ID'] ?? $r['MaLoaiSan'] ?? null),
                    'TenLoaiSan' => $r['TenLoaiSan'] ?? '',
                ];
            })->toArray();
        }

        // 3. KhungGio (KG)
        if (Schema::hasTable('KhungGio')) {
            $data['KhungGio'] = DB::table('KhungGio')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaKhungGio' => $this->fmt('KG', $r['ID'] ?? $r['MaKhungGio'] ?? null),
                    'GioBatDau'  => $r['GioBatDau'] ?? null,
                    'GioKetThuc' => $r['GioKetThuc'] ?? null,
                ];
            })->toArray();
        }

        // 4. CumSan (CS)
        if (Schema::hasTable('CumSan')) {
            $data['CumSan'] = DB::table('CumSan')->get()->map(function ($r) {
                $r = (array)$r;
                
                // Kiểm tra: nếu deleted_at (hoặc NgayXoa) có giá trị -> 'BaoTri', nếu null -> 'HoatDong'
                $coNgayXoa = !empty($r['deleted_at']) || !empty($r['NgayXoa']);
                $trangThai = $r['TrangThai'] ?? ($coNgayXoa ? 'BaoTri' : 'HoatDong');

                return [
                    'MaCumSan'   => $this->fmt('CS', $r['ID'] ?? $r['MaCumSan'] ?? null),
                    'MaPhuong'   => $this->fmt('P', $r['ID_Phuong'] ?? $r['MaPhuong'] ?? null),
                    'TenCumSan'  => $r['TenCumSan'] ?? '',
                    'DiaChi'     => $r['DiaChi'] ?? '',
                    'ViDo'       => $r['ViDo'] ?? null,
                    'KinhDo'     => $r['KinhDo'] ?? null,
                    'GioMoCua'   => $r['GioMoCua'] ?? '06:00:00',
                    'GioDongCua' => $r['GioDongCua'] ?? '22:00:00',
                    'HinhAnh'    => $r['HinhAnh'] ?? null,
                    'TrangThai'  => $trangThai,
                ];
            })->toArray();
        }

        // 5. NguoiDung (ND)
        if (Schema::hasTable('NguoiDung')) {
            $data['NguoiDung'] = DB::table('NguoiDung')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaNguoiDung'      => $this->fmt('ND', $r['ID'] ?? $r['MaNguoiDung'] ?? null),
                    'HoTen'            => $r['HoTen'] ?? '',
                    'SoDienThoai'      => $r['SoDienThoai'] ?? '',
                    'Email'            => $r['Email'] ?? '',
                    'Vneid'            => $r['Vneid'] ?? null,
                    'MatKhau'          => $r['MatKhau'] ?? '',
                    'VaiTro'           => $r['VaiTro'] ?? 'KhachHang',
                    'MaCumSan'         => $this->fmt('CS', $r['ID_CumSan'] ?? $r['MaCumSan'] ?? null),
                    'SoDuVi'           => $r['SoDuVi'] ?? 0,
                    'TenNganHang'      => $r['TenNganHang'] ?? null,
                    'STKNganHang'      => $r['STKNganHang'] ?? null,
                    'TenTaiKhoan'      => $r['TenTaiKhoan'] ?? null,
                    'TrangThaiKhoa'    => $r['TrangThaiKhoa'] ?? 0,
                    'Token'            => $r['Token'] ?? null,
                    'MaOTP'            => $r['MaOTP'] ?? null,
                    'ThoiGianHetHanOTP'=> $r['ThoiGianHetHanOTP'] ?? null,
                ];
            })->toArray();
        }

        // 6. SanBong (SB) - Bổ sung DienTich, KichThuoc, MoTa
        if (Schema::hasTable('SanBong')) {
            $data['SanBong'] = DB::table('SanBong')->get()->map(function ($r) {
                $r = (array)$r;
                $idLoai = $r['ID_LoaiSan'] ?? $r['MaLoaiSan'] ?? 1;
                $isSan7 = ((string)$idLoai === '2' || (string)$idLoai === 'LS002');
                return [
                    'MaSanBong' => $this->fmt('SB', $r['ID'] ?? $r['MaSanBong'] ?? null),
                    'MaCumSan'  => $this->fmt('CS', $r['ID_CumSan'] ?? $r['MaCumSan'] ?? null),
                    'MaLoaiSan' => $this->fmt('LS', $idLoai),
                    'TenSan'    => $r['TenSan'] ?? '',
                    'DienTich'  => $r['DienTich'] ?? ($isSan7 ? 1800.00 : 800.00),
                    'KichThuoc' => $r['KichThuoc'] ?? ($isSan7 ? '30m x 60m' : '20m x 40m'),
                    'MoTa'      => $r['MoTa'] ?? 'Mặt cỏ nhân tạo cao cấp, hệ thống đèn LED chống chói tiêu chuẩn.',
                    'TrangThai' => $r['TrangThai'] ?? 'HoatDong',
                ];
            })->toArray();
        }

        // 7. GiaTien (GT)
        if (Schema::hasTable('GiaTien')) {
            $data['GiaTien'] = DB::table('GiaTien')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaGiaTien'  => $this->fmt('GT', $r['ID'] ?? $r['MaGiaTien'] ?? null),
                    'MaCumSan'   => $this->fmt('CS', $r['ID_CumSan'] ?? $r['MaCumSan'] ?? null),
                    'MaLoaiSan'  => $this->fmt('LS', $r['ID_LoaiSan'] ?? $r['MaLoaiSan'] ?? null),
                    'MaKhungGio' => $this->fmt('KG', $r['ID_KhungGio'] ?? $r['MaKhungGio'] ?? null),
                    'SoTien'     => $r['SoTien'] ?? 0,
                ];
            })->toArray();
        }

        // 8. GiaiDau (GDAU)
        if (Schema::hasTable('GiaiDau')) {
            $data['GiaiDau'] = DB::table('GiaiDau')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaGiaiDau'   => $this->fmt('GDAU', $r['ID'] ?? $r['MaGiaiDau'] ?? null),
                    'MaNguoiDung' => $this->fmt('ND', $r['ID_NguoiDung'] ?? $r['MaNguoiDung'] ?? null),
                    'MaCumSan'    => $this->fmt('CS', $r['ID_CumSan'] ?? $r['MaCumSan'] ?? null),
                    'TenGiaiDau'  => $r['TenGiaiDau'] ?? '',
                    'NgayBatDau'  => $r['NgayBatDau'] ?? null,
                    'NgayKetThuc' => $r['NgayKetThuc'] ?? null,
                    'NoiDung'     => $r['NoiDung'] ?? null,
                    'TrangThai'   => $r['TrangThai'] ?? 'ChoDuyet',
                    'LyDoHuy'     => $r['LyDoHuy'] ?? null,
                    'NgayTao'     => $r['NgayTao'] ?? null,
                    'NgayDuyet'   => $r['NgayDuyet'] ?? null,
                ];
            })->toArray();
        }

        // 9. GiaoDich (GD)
        if (Schema::hasTable('GiaoDich')) {
            $data['GiaoDich'] = DB::table('GiaoDich')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaGiaoDich'     => $this->fmt('GD', $r['ID'] ?? $r['MaGiaoDich'] ?? null),
                    'MaNguoiDung'    => $this->fmt('ND', $r['ID_NguoiDung'] ?? $r['MaNguoiDung'] ?? null),
                    'MaNhanVienXuLy' => $this->fmt('ND', $r['ID_NhanVienXuLy'] ?? $r['MaNhanVienXuLy'] ?? null),
                    'LoaiGiaoDich'   => $r['LoaiGiaoDich'] ?? 'DatSan',
                    'DongTien'       => $r['DongTien'] ?? 'Tru',
                    'SoTien'         => $r['SoTien'] ?? 0,
                    'SoDuTruoc'      => $r['SoDuTruoc'] ?? 0,
                    'SoDuSau'        => $r['SoDuSau'] ?? 0,
                    'NoiDung'        => $r['NoiDung'] ?? null,
                    'NgayTao'        => $r['NgayTao'] ?? null,
                ];
            })->toArray();
        }

        // 10 & 11. HoaDonDatSan (HDDS) + DatSan (DS)
        $data['HoaDonDatSan'] = [];
        $data['DatSan'] = [];

        if (Schema::hasTable('DatSan')) {
            $rawDatSans = DB::table('DatSan')->orderBy('ID')->get();
            $invoiceMap = []; // Gom nhóm theo ID_GiaoDich (nếu có), nếu không thì tạo riêng cho từng vé
            $hdIndex = 1;

            foreach ($rawDatSans as $r) {
                $r = (array)$r;
                $oldId = $r['ID'] ?? $r['MaDatSan'];
                $oldGd = $r['ID_GiaoDich'] ?? null;
                $groupKey = $oldGd ? ('TX_' . $oldGd) : ('SINGLE_' . $oldId);

                if (!isset($invoiceMap[$groupKey])) {
                    $maHD = $this->fmt('HDDS', $hdIndex++);
                    $phuongThuc = ($r['ID_NguoiDung'] ?? null) ? 'ViDienTu' : 'ChuyenKhoan';
                    $invoiceMap[$groupKey] = [
                        'MaHoaDonDatSan'      => $maHD,
                        'MaNguoiDung'         => $this->fmt('ND', $r['ID_NguoiDung'] ?? $r['MaNguoiDung'] ?? null),
                        'MaGiaoDich'          => $this->fmt('GD', $oldGd),
                        'TongTienSan'         => 0,
                        'TienDaCoc'           => 0,
                        'PhuongThucThanhToan' => $phuongThuc,
                        'TrangThai'           => $r['TrangThai'] ?? 'DaCoc',
                        'NgayTao'             => ($r['NgayDa'] ?? date('Y-m-d')) . ' 08:00:00',
                    ];
                }

                $invoiceMap[$groupKey]['TongTienSan'] += (float)($r['TongTien'] ?? 0);
                $invoiceMap[$groupKey]['TienDaCoc']   += (float)($r['TienCoc'] ?? 0);

                $data['DatSan'][] = [
                    'MaDatSan'          => $this->fmt('DS', $oldId),
                    'MaNguoiDung'       => $this->fmt('ND', $r['ID_NguoiDung'] ?? $r['MaNguoiDung'] ?? null),
                    'TenKhachVangLai'   => $r['TenKhachVangLai'] ?? null,
                    'SDTKhachVangLai'   => $r['SDTKhachVangLai'] ?? null,
                    'EmailKhachVangLai' => $r['EmailKhachVangLai'] ?? null,
                    'MaSanBong'         => $this->fmt('SB', $r['ID_SanBong'] ?? $r['MaSanBong'] ?? null),
                    'MaKhungGio'        => $this->fmt('KG', $r['ID_KhungGio'] ?? $r['MaKhungGio'] ?? null),
                    'MaGiaiDau'         => $this->fmt('GDAU', $r['ID_GiaiDau'] ?? $r['MaGiaiDau'] ?? null),
                    'MaHoaDonDatSan'    => $invoiceMap[$groupKey]['MaHoaDonDatSan'],
                    'MaNhanVienXuLy'    => $this->fmt('ND', $r['ID_NhanVienXuLy'] ?? $r['MaNhanVienXuLy'] ?? null),
                    'NgayDa'            => $r['NgayDa'] ?? null,
                    'TongTien'          => $r['TongTien'] ?? 0,
                    'TienCoc'           => $r['TienCoc'] ?? 0,
                    'TrangThai'         => $r['TrangThai'] ?? 'DaCoc',
                ];
            }

            $data['HoaDonDatSan'] = array_values($invoiceMap);
        }

        // 12. YeuCauHuyGap (YCHG)
        if (Schema::hasTable('YeuCauHuyGap')) {
            $data['YeuCauHuyGap'] = DB::table('YeuCauHuyGap')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaYeuCauHuyGap' => $this->fmt('YCHG', $r['ID'] ?? $r['MaYeuCauHuyGap'] ?? null),
                    'MaNguoiDung'    => $this->fmt('ND', $r['ID_NguoiDung'] ?? $r['MaNguoiDung'] ?? null),
                    'MaDatSan'       => $this->fmt('DS', $r['ID_DatSan'] ?? $r['MaDatSan'] ?? null),
                    'NoiDung'        => $r['NoiDung'] ?? '',
                    'TrangThai'      => $r['TrangThai'] ?? 'ChoDuyet',
                    'LyDoHuy'        => $r['LyDoHuy'] ?? null,
                    'NgayTao'        => $r['NgayTao'] ?? null,
                    'NgayDuyet'      => $r['NgayDuyet'] ?? null,
                ];
            })->toArray();
        }

        // 13. DanhGia (DG)
        if (Schema::hasTable('DanhGia')) {
            $data['DanhGia'] = DB::table('DanhGia')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaDanhGia'   => $this->fmt('DG', $r['ID'] ?? $r['MaDanhGia'] ?? null),
                    'MaNguoiDung' => $this->fmt('ND', $r['ID_NguoiDung'] ?? $r['MaNguoiDung'] ?? null),
                    'MaCumSan'    => $this->fmt('CS', $r['ID_CumSan'] ?? $r['MaCumSan'] ?? null),
                    'MaDatSan'    => $this->fmt('DS', $r['ID_DatSan'] ?? $r['MaDatSan'] ?? null),
                    'SoSao'       => $r['SoSao'] ?? 5,
                    'NoiDung'     => $r['NoiDung'] ?? null,
                    'NgayTao'     => $r['NgayTao'] ?? null,
                ];
            })->toArray();
        }

        // 14. ThongBao (TB)
        if (Schema::hasTable('ThongBao')) {
            $data['ThongBao'] = DB::table('ThongBao')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaThongBao'   => $this->fmt('TB', $r['ID'] ?? $r['MaThongBao'] ?? null),
                    'MaNguoiDung'  => $this->fmt('ND', $r['ID_NguoiDung'] ?? $r['MaNguoiDung'] ?? null),
                    'TieuDe'       => $r['TieuDe'] ?? '',
                    'NoiDung'      => $r['NoiDung'] ?? '',
                    'LoaiThongBao' => $r['LoaiThongBao'] ?? 'HeThong',
                    'DaDoc'        => $r['DaDoc'] ?? 0,
                    'NgayTao'      => $r['NgayTao'] ?? null,
                ];
            })->toArray();
        }

        // 15. PhienChat (PC)
        if (Schema::hasTable('PhienChat')) {
            $data['PhienChat'] = DB::table('PhienChat')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaPhienChat' => $this->fmt('PC', $r['ID'] ?? $r['MaPhienChat'] ?? null),
                    'MaNguoiDung' => $this->fmt('ND', $r['ID_NguoiDung'] ?? $r['MaNguoiDung'] ?? null),
                    'TieuDe'      => $r['TieuDe'] ?? null,
                    'NgayTao'     => $r['NgayTao'] ?? null,
                    'NgayCapNhat' => $r['NgayCapNhat'] ?? null,
                    'NgayXoa'     => $r['NgayXoa'] ?? null,
                ];
            })->toArray();
        }

        // 16. TinNhan (TN)
        if (Schema::hasTable('TinNhan')) {
            $data['TinNhan'] = DB::table('TinNhan')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaTinNhan'     => $this->fmt('TN', $r['ID'] ?? $r['MaTinNhan'] ?? null),
                    'MaPhienChat'   => $this->fmt('PC', $r['ID_PhienChat'] ?? $r['MaPhienChat'] ?? null),
                    'NguoiGui'      => $r['NguoiGui'] ?? 'User',
                    'NoiDung'       => $r['NoiDung'] ?? '',
                    'DuLieuBocThem' => $r['DuLieuBocThem'] ?? null,
                    'NgayTao'       => $r['NgayTao'] ?? null,
                ];
            })->toArray();
        }

        // 17. SanPham (SP)
        if (Schema::hasTable('SanPham')) {
            $data['SanPham'] = DB::table('SanPham')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaSanPham'  => $this->fmt('SP', $r['ID'] ?? $r['MaSanPham'] ?? null),
                    'MaCumSan'   => $this->fmt('CS', $r['ID_CumSan'] ?? $r['MaCumSan'] ?? null),
                    'TenSanPham' => $r['TenSanPham'] ?? '',
                    'GiaBan'     => $r['GiaBan'] ?? 0,
                    'SoLuongTon' => $r['SoLuongTon'] ?? 0,
                    'HinhAnh'    => $r['HinhAnh'] ?? null,
                ];
            })->toArray();
        }

        // 18. PhieuNhapHang (PNH)
        if (Schema::hasTable('PhieuNhapHang')) {
            $data['PhieuNhapHang'] = DB::table('PhieuNhapHang')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaPhieuNhapHang'   => $this->fmt('PNH', $r['ID'] ?? $r['MaPhieuNhapHang'] ?? null),
                    'MaCumSan'          => $this->fmt('CS', $r['ID_CumSan'] ?? $r['MaCumSan'] ?? null),
                    'MaNhanVien'        => $this->fmt('ND', $r['ID_NhanVien'] ?? $r['MaNhanVien'] ?? null),
                    'TongTienThanhToan' => $r['TongTienThanhToan'] ?? 0,
                    'ChiTietNhap'       => $r['ChiTietNhap'] ?? null,
                    'NgayNhap'          => $r['NgayNhap'] ?? null,
                ];
            })->toArray();
        }

        // 19. HoaDonBanHang (HDBH)
        if (Schema::hasTable('HoaDonBanHang')) {
            $data['HoaDonBanHang'] = DB::table('HoaDonBanHang')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaHoaDonBanHang' => $this->fmt('HDBH', $r['ID'] ?? $r['MaHoaDonBanHang'] ?? null),
                    'MaCumSan'        => $this->fmt('CS', $r['ID_CumSan'] ?? $r['MaCumSan'] ?? null),
                    'MaNhanVien'      => $this->fmt('ND', $r['ID_NhanVien'] ?? $r['MaNhanVien'] ?? null),
                    'TongTien'        => $r['TongTien'] ?? 0,
                    'NgayTao'         => $r['NgayTao'] ?? null,
                ];
            })->toArray();
        }

        // 20. ChiTietHoaDon
        if (Schema::hasTable('ChiTietHoaDon')) {
            $data['ChiTietHoaDon'] = DB::table('ChiTietHoaDon')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaHoaDon'  => $this->fmt('HDBH', $r['ID_HoaDon'] ?? $r['MaHoaDon'] ?? null),
                    'MaSanPham' => $this->fmt('SP', $r['ID_SanPham'] ?? $r['MaSanPham'] ?? null),
                    'SoLuong'   => $r['SoLuong'] ?? 1,
                    'DonGia'    => $r['DonGia'] ?? 0,
                ];
            })->toArray();
        }

        // 21. CaLamViec (CLV)
        if (Schema::hasTable('CaLamViec')) {
            $data['CaLamViec'] = DB::table('CaLamViec')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaCaLamViec'     => $this->fmt('CLV', $r['ID'] ?? $r['MaCaLamViec'] ?? null),
                    'MaCumSan'        => $this->fmt('CS', $r['ID_CumSan'] ?? $r['MaCumSan'] ?? null),
                    'TenCa'           => $r['TenCa'] ?? '',
                    'GioBatDau'       => $r['GioBatDau'] ?? null,
                    'GioKetThuc'      => $r['GioKetThuc'] ?? null,
                    'SoLuongNhanVien' => $r['SoLuongNhanVien'] ?? 1,
                    'LuongThuNgan'    => $r['LuongThuNgan'] ?? 0,
                    'LuongPhucVu'     => $r['LuongPhucVu'] ?? 0,
                ];
            })->toArray();
        }

        // 22. LichLamViec (LLV)
        if (Schema::hasTable('LichLamViec')) {
            $data['LichLamViec'] = DB::table('LichLamViec')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaLichLamViec'     => $this->fmt('LLV', $r['ID'] ?? $r['MaLichLamViec'] ?? null),
                    'MaCaLamViec'       => $this->fmt('CLV', $r['ID_CaLamViec'] ?? $r['MaCaLamViec'] ?? null),
                    'NgayLam'           => $r['NgayLam'] ?? null,
                    'MaNhanVien'        => $this->fmt('ND', $r['ID_NhanVien'] ?? $r['MaNhanVien'] ?? null),
                    'GhiChu'            => $r['GhiChu'] ?? null,
                    'CongViec'          => $r['CongViec'] ?? null,
                    'TrangThaiXepLich'  => $r['TrangThaiXepLich'] ?? null,
                    'TrangThaiDiemDanh' => $r['TrangThaiDiemDanh'] ?? null,
                    'SoPhutDiMuon'      => $r['SoPhutDiMuon'] ?? 0,
                    'TienPhat'          => $r['TienPhat'] ?? 0,
                    'TienThuong'        => $r['TienThuong'] ?? 0,
                    'LyDoDieuChinh'     => $r['LyDoDieuChinh'] ?? null,
                ];
            })->toArray();
        }

        // 23. BanGiaoCa (BGC)
        if (Schema::hasTable('BanGiaoCa')) {
            $data['BanGiaoCa'] = DB::table('BanGiaoCa')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaBanGiaoCa'       => $this->fmt('BGC', $r['ID'] ?? $r['MaBanGiaoCa'] ?? null),
                    'MaCumSan'          => $this->fmt('CS', $r['ID_CumSan'] ?? $r['MaCumSan'] ?? null),
                    'MaCaLamViec'       => $this->fmt('CLV', $r['ID_CaLamViec'] ?? $r['MaCaLamViec'] ?? null),
                    'Ngay'              => $r['Ngay'] ?? null,
                    'MaNhanVienNhan'    => $this->fmt('ND', $r['ID_NhanVienNhan'] ?? $r['MaNhanVienNhan'] ?? null),
                    'ThoiGianNhan'      => $r['ThoiGianNhan'] ?? null,
                    'TienHeThong'       => $r['TienHeThong'] ?? 0,
                    'TienNhan'          => $r['TienNhan'] ?? 0,
                    'GhiChuNhan'        => $r['GhiChuNhan'] ?? null,
                    'MaNhanVienGiao'    => $this->fmt('ND', $r['ID_NhanVienGiao'] ?? $r['MaNhanVienGiao'] ?? null),
                    'ThoiGianGiao'      => $r['ThoiGianGiao'] ?? null,
                    'TienGiao'          => $r['TienGiao'] ?? null,
                    'TienNopDoanhThu'   => $r['TienNopDoanhThu'] ?? null,
                    'GhiChuGiao'        => $r['GhiChuGiao'] ?? null,
                    'TrangThai'         => $r['TrangThai'] ?? null,
                ];
            })->toArray();
        }

        // 24. ChiPhiPhatSinh (CPPS)
        if (Schema::hasTable('ChiPhiPhatSinh')) {
            $data['ChiPhiPhatSinh'] = DB::table('ChiPhiPhatSinh')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaChiPhiPhatSinh' => $this->fmt('CPPS', $r['ID'] ?? $r['MaChiPhiPhatSinh'] ?? null),
                    'MaBanGiaoCa'      => $this->fmt('BGC', $r['ID_BanGiaoCa'] ?? $r['MaBanGiaoCa'] ?? null),
                    'SoTien'           => $r['SoTien'] ?? 0,
                    'NoiDung'          => $r['NoiDung'] ?? '',
                    'ThoiGian'         => $r['ThoiGian'] ?? null,
                ];
            })->toArray();
        }

        // 25. BangLuong (BL)
        if (Schema::hasTable('BangLuong')) {
            $data['BangLuong'] = DB::table('BangLuong')->get()->map(function ($r) {
                $r = (array)$r;
                return [
                    'MaBangLuong'      => $this->fmt('BL', $r['ID'] ?? $r['MaBangLuong'] ?? null),
                    'MaNhanVien'       => $this->fmt('ND', $r['ID_NhanVien'] ?? $r['MaNhanVien'] ?? null),
                    'ThangNam'         => $r['ThangNam'] ?? '',
                    'TongCaLam'        => $r['TongCaLam'] ?? 0,
                    'TongTienLuong'    => $r['TongTienLuong'] ?? 0,
                    'TongTienThuong'   => $r['TongTienThuong'] ?? 0,
                    'TongTienPhat'     => $r['TongTienPhat'] ?? 0,
                    'LyDoKhieuNai'     => $r['LyDoKhieuNai'] ?? null,
                    'TrangThai'        => $r['TrangThai'] ?? null,
                    'NgayChot'         => $r['NgayChot'] ?? null,
                    'NgayXacNhan'      => $r['NgayXacNhan'] ?? null,
                    'NgayThanhToan'    => $r['NgayThanhToan'] ?? null,
                ];
            })->toArray();
        }

        // Ghi ra file database/seeders/DatabaseSeeder.php
        $seederContent = "<?php\n\nnamespace Database\\Seeders;\n\nuse Illuminate\\Database\\Seeder;\nuse Illuminate\\Support\\Facades\\DB;\nuse Illuminate\\Support\\Facades\\Schema;\n\nclass DatabaseSeeder extends Seeder\n{\n    public function run(): void\n    {\n        Schema::disableForeignKeyConstraints();\n\n";

        foreach ($data as $tableName => $rows) {
            if (empty($rows)) continue;
            $exportedArray = var_export($rows, true);
            $seederContent .= "        if (Schema::hasTable('{$tableName}')) {\n";
            $seederContent .= "            DB::table('{$tableName}')->truncate();\n";
            $seederContent .= "            foreach (array_chunk({$exportedArray}, 200) as \$chunk) {\n";
            $seederContent .= "                DB::table('{$tableName}')->insert(\$chunk);\n";
            $seederContent .= "            }\n";
            $seederContent .= "        }\n\n";
        }

        $seederContent .= "        Schema::enableForeignKeyConstraints();\n    }\n}\n";

        File::put(database_path('seeders/DatabaseSeeder.php'), $seederContent);

        $this->info('✅ Đã xuất toàn bộ dữ liệu sang database/seeders/DatabaseSeeder.php thành công!');
        $this->info('Bạn có thể mở file database/seeders/DatabaseSeeder.php để kiểm tra toàn bộ dữ liệu.');
    }
}