<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class KhuyenMai extends Model
{
    use HasFactory, GeneratesCustomId;

    protected $table = 'KhuyenMai';
    protected $primaryKey = 'MaKhuyenMai';
    protected $idPrefix = 'KM';
    public $timestamps = false;

    protected $fillable = [
        'MaKhuyenMai',
        'MaNguoiDung',
        'TenKhuyenMai',
        'MoTa',
        'LoaiKhuyenMai',          // 'PhanTram' | 'CoDinh'
        'GiaTri',
        'GiaTriToiDa',
        'GiaTriHoaDonToiThieu',
        'SoLuong',
        'SoLuongDaDung',
        'NgayBatDau',
        'NgayKetThuc',
        'TrangThai',              // 'DangApDung' | 'HetHan'
    ];

    // Quan hệ: Khuyến mãi thuộc về 1 Người dùng (nếu là voucher riêng) hoặc NULL (nếu là voucher toàn hệ thống)
    public function nguoiDung()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNguoiDung', 'MaNguoiDung');
    }

    // Quan hệ 1-N: 1 Khuyến mãi có thể được áp dụng cho nhiều HoaDonDatSan
    public function hoaDonDatSans()
    {
        return $this->hasMany(HoaDonDatSan::class, 'MaKhuyenMai', 'MaKhuyenMai');
    }
}