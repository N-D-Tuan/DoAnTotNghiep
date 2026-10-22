<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class PhieuNhapHang extends Model
{
    use GeneratesCustomId;

    protected $table = 'PhieuNhapHang';
    protected $primaryKey = 'MaPhieuNhapHang';
    protected $idPrefix = 'PNH';

    public $timestamps = false;
    const CREATED_AT = 'NgayNhap';
    const UPDATED_AT = null;

    protected $fillable = [
        'MaPhieuNhapHang',
        'MaCumSan',
        'MaNhanVien',
        'TongTienThanhToan',
        'ChiTietNhap',
        'NgayNhap'
    ];

    protected $casts = [
        'ChiTietNhap' => 'array',
    ];

    public function cumSan()
    {
        return $this->belongsTo(CumSan::class, 'MaCumSan', 'MaCumSan');
    }

    public function nhanVien()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNhanVien', 'MaNguoiDung');
    }
}