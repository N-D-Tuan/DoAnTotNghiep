<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class SanPham extends Model
{
    use GeneratesCustomId;

    protected $table = 'SanPham';
    protected $primaryKey = 'MaSanPham';
    protected $idPrefix = 'SP';
    public $timestamps = false;

    protected $fillable = [
        'MaSanPham',
        'MaCumSan',
        'TenSanPham',
        'GiaBan',
        'SoLuongTon',
        'HinhAnh'
    ];

    public function cumSan()
    {
        return $this->belongsTo(CumSan::class, 'MaCumSan', 'MaCumSan');
    }

    public function chiTietHoaDons()
    {
        return $this->hasMany(ChiTietHoaDon::class, 'MaSanPham', 'MaSanPham');
    }
}