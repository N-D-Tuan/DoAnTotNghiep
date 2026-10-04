<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CaLamViec extends Model
{
    protected $table = 'CaLamViec';
    protected $primaryKey = 'ID';
    public $timestamps = false;

    protected $fillable = [
        'ID_CumSan', 'TenCa', 'GioBatDau', 'GioKetThuc', 
        'SoLuongNhanVien', 'LuongThuNgan', 'LuongPhucVu'
    ];

    public function cumSan()
    {
        return $this->belongsTo(CumSan::class, 'ID_CumSan', 'ID');
    }

    public function lichLamViecs()
    {
        return $this->hasMany(LichLamViec::class, 'ID_CaLamViec', 'ID');
    }

    public function banGiaoCas()
    {
        return $this->hasMany(BanGiaoCa::class, 'ID_CaLamViec', 'ID');
    }
}