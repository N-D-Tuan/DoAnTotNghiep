<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SanPham extends Model
{
    protected $table = 'SanPham';
    protected $primaryKey = 'ID';
    public $timestamps = false;

    protected $fillable = ['ID_CumSan', 'TenSanPham', 'GiaBan', 'SoLuongTon', 'HinhAnh'];

    public function cumSan()
    {
        return $this->belongsTo(CumSan::class, 'ID_CumSan', 'ID');
    }

    public function chiTietHoaDons()
    {
        return $this->hasMany(ChiTietHoaDon::class, 'ID_SanPham', 'ID');
    }
}