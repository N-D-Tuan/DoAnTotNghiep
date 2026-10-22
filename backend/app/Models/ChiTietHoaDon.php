<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChiTietHoaDon extends Model
{
    protected $table = 'ChiTietHoaDon';
    public $incrementing = false;
    protected $primaryKey = null;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $fillable = [
        'MaHoaDon',
        'MaSanPham',
        'SoLuong',
        'DonGia'
    ];

    protected $appends = ['ThanhTien'];

    public function getThanhTienAttribute()
    {
        return $this->SoLuong * $this->DonGia;
    }

    public function hoaDon()
    {
        return $this->belongsTo(HoaDonBanHang::class, 'MaHoaDon', 'MaHoaDonBanHang');
    }

    public function sanPham()
    {
        return $this->belongsTo(SanPham::class, 'MaSanPham', 'MaSanPham');
    }
}