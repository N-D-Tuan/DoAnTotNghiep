<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BanGiaoCa extends Model
{
    protected $table = 'BanGiaoCa';
    protected $primaryKey = 'ID';
    public $timestamps = false;

    protected $fillable = [
        'ID_CumSan', 'ID_CaLamViec', 'Ngay', 
        'ID_NhanVienNhan', 'ThoiGianNhan', 'TienHeThong', 'TienNhan', 'GhiChuNhan',
        'ID_NhanVienGiao', 'ThoiGianGiao', 'TienGiao', 'TienNopDoanhThu', 'GhiChuGiao', 
        'TrangThai'
    ];

    public function cumSan()
    {
        return $this->belongsTo(CumSan::class, 'ID_CumSan', 'ID');
    }

    public function caLamViec()
    {
        return $this->belongsTo(CaLamViec::class, 'ID_CaLamViec', 'ID');
    }

    public function nhanVienNhan()
    {
        return $this->belongsTo(NguoiDung::class, 'ID_NhanVienNhan', 'ID');
    }

    public function nhanVienGiao()
    {
        return $this->belongsTo(NguoiDung::class, 'ID_NhanVienGiao', 'ID');
    }

    public function chiPhiPhatSinhs()
    {
        return $this->hasMany(ChiPhiPhatSinh::class, 'ID_BanGiaoCa', 'ID');
    }
}