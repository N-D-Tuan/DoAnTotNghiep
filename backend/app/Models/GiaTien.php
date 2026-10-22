<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class GiaTien extends Model
{
    use GeneratesCustomId;

    protected $table = 'GiaTien';
    protected $primaryKey = 'MaGiaTien';
    protected $idPrefix = 'GT';
    public $timestamps = false;

    protected $fillable = [
        'MaGiaTien',
        'MaCumSan',
        'MaLoaiSan',
        'MaKhungGio',
        'SoTien'
    ];

    public function cumSan()
    {
        return $this->belongsTo(CumSan::class, 'MaCumSan', 'MaCumSan');
    }

    public function loaiSan()
    {
        return $this->belongsTo(LoaiSan::class, 'MaLoaiSan', 'MaLoaiSan');
    }

    public function khungGio()
    {
        return $this->belongsTo(KhungGio::class, 'MaKhungGio', 'MaKhungGio');
    }
}