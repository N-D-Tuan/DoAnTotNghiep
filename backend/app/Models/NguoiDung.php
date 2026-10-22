<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use App\Traits\GeneratesCustomId;

class NguoiDung extends Authenticatable
{
    use Notifiable, HasApiTokens, GeneratesCustomId;

    protected $table = 'NguoiDung';
    protected $primaryKey = 'MaNguoiDung';
    protected $idPrefix = 'ND';
    public $timestamps = false;

    protected $fillable = [
        'MaNguoiDung',
        'HoTen',
        'SoDienThoai',
        'Email',
        'Vneid',
        'MatKhau',
        'VaiTro',
        'MaCumSan',
        'SoDuVi',
        'TenNganHang',
        'STKNganHang',
        'TenTaiKhoan',
        'TrangThaiKhoa',
        'Token',
        'MaOTP',
        'ThoiGianHetHanOTP',
    ];

    protected $casts = [
        'TrangThaiKhoa' => 'boolean',
    ];

    protected $hidden = [
        'MatKhau',
        'MaOTP',
        'ThoiGianHetHanOTP',
        'Token'
    ];

    public function getAuthPassword()
    {
        return $this->MatKhau;
    }

    public function giaiDaus()
    {
        return $this->hasMany(GiaiDau::class, 'MaNguoiDung', 'MaNguoiDung');
    }

    public function datSans()
    {
        return $this->hasMany(DatSan::class, 'MaNguoiDung', 'MaNguoiDung');
    }

    public function hoaDonDatSans()
    {
        return $this->hasMany(HoaDonDatSan::class, 'MaNguoiDung', 'MaNguoiDung');
    }

    public function giaoDichs()
    {
        return $this->hasMany(GiaoDich::class, 'MaNguoiDung', 'MaNguoiDung');
    }

    public function yeuCauHuyGaps()
    {
        return $this->hasMany(YeuCauHuyGap::class, 'MaNguoiDung', 'MaNguoiDung');
    }

    public function thongBaos()
    {
        return $this->hasMany(ThongBao::class, 'MaNguoiDung', 'MaNguoiDung');
    }

    public function phienChats()
    {
        return $this->hasMany(PhienChat::class, 'MaNguoiDung', 'MaNguoiDung');
    }

    public function cumSan()
    {
        return $this->belongsTo(CumSan::class, 'MaCumSan', 'MaCumSan');
    }

    public function lichLamViecs()
    {
        return $this->hasMany(LichLamViec::class, 'MaNhanVien', 'MaNguoiDung');
    }

    public function bangLuongs()
    {
        return $this->hasMany(BangLuong::class, 'MaNhanVien', 'MaNguoiDung');
    }

    public function banGiaoCasNhan()
    {
        return $this->hasMany(BanGiaoCa::class, 'MaNhanVienNhan', 'MaNguoiDung');
    }

    public function banGiaoCasGiao()
    {
        return $this->hasMany(BanGiaoCa::class, 'MaNhanVienGiao', 'MaNguoiDung');
    }

    public function datSansXuLy()
    {
        return $this->hasMany(DatSan::class, 'MaNhanVienXuLy', 'MaNguoiDung');
    }

    public function giaoDichsXuLy()
    {
        return $this->hasMany(GiaoDich::class, 'MaNhanVienXuLy', 'MaNguoiDung');
    }

    public function hoaDonBanHangs()
    {
        return $this->hasMany(HoaDonBanHang::class, 'MaNhanVien', 'MaNguoiDung');
    }

    public function phieuNhapHangs()
    {
        return $this->hasMany(PhieuNhapHang::class, 'MaNhanVien', 'MaNguoiDung');
    }

    public function danhGias()
    {
        return $this->hasMany(DanhGia::class, 'MaNguoiDung', 'MaNguoiDung');
    }
}