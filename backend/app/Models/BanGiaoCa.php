<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class BanGiaoCa extends Model
{
    use GeneratesCustomId;

    protected $table = 'BanGiaoCa';
    protected $primaryKey = 'MaBanGiaoCa';
    protected $idPrefix = 'BGC';
    public $timestamps = false;

    protected $fillable = [
        'MaBanGiaoCa',
        'MaCumSan',
        'MaCaLamViec',
        'Ngay',
        'MaNhanVienNhan',
        'ThoiGianNhan',
        'TienHeThong',
        'TienNhan',
        'GhiChuNhan',
        'MaNhanVienGiao',
        'ThoiGianGiao',
        'TienGiao',
        'TienNopDoanhThu',
        'GhiChuGiao',
        'TrangThai'
    ];

    public function cumSan()
    {
        return $this->belongsTo(CumSan::class, 'MaCumSan', 'MaCumSan');
    }

    public function caLamViec()
    {
        return $this->belongsTo(CaLamViec::class, 'MaCaLamViec', 'MaCaLamViec');
    }

    public function nhanVienNhan()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNhanVienNhan', 'MaNguoiDung');
    }

    public function nhanVienGiao()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNhanVienGiao', 'MaNguoiDung');
    }

    public function chiPhiPhatSinhs()
    {
        return $this->hasMany(ChiPhiPhatSinh::class, 'MaBanGiaoCa', 'MaBanGiaoCa');
    }
}