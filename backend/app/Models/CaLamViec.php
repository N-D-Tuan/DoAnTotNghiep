<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class CaLamViec extends Model
{
    use GeneratesCustomId;

    protected $table = 'CaLamViec';
    protected $primaryKey = 'MaCaLamViec';
    protected $idPrefix = 'CLV';
    public $timestamps = false;

    protected $fillable = [
        'MaCaLamViec',
        'MaCumSan',
        'TenCa',
        'GioBatDau',
        'GioKetThuc',
        'SoLuongNhanVien',
        'LuongThuNgan',
        'LuongPhucVu'
    ];

    public function cumSan()
    {
        return $this->belongsTo(CumSan::class, 'MaCumSan', 'MaCumSan');
    }

    public function lichLamViecs()
    {
        return $this->hasMany(LichLamViec::class, 'MaCaLamViec', 'MaCaLamViec');
    }

    public function banGiaoCas()
    {
        return $this->hasMany(BanGiaoCa::class, 'MaCaLamViec', 'MaCaLamViec');
    }
}