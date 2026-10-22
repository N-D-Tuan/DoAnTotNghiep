<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class GiaiDau extends Model
{
    use HasFactory, GeneratesCustomId;

    protected $table = 'GiaiDau';
    protected $primaryKey = 'MaGiaiDau';
    protected $idPrefix = 'GDAU';

    const CREATED_AT = 'NgayTao';
    const UPDATED_AT = null;

    protected $fillable = [
        'MaGiaiDau',
        'MaNguoiDung',
        'MaCumSan',
        'TenGiaiDau',
        'NgayBatDau',
        'NgayKetThuc',
        'NoiDung',
        'TrangThai',
        'LyDoHuy',
        'NgayDuyet'
    ];

    public function nguoiDung()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNguoiDung', 'MaNguoiDung');
    }

    public function cumSan()
    {
        return $this->belongsTo(CumSan::class, 'MaCumSan', 'MaCumSan');
    }

    public function datSans()
    {
        return $this->hasMany(DatSan::class, 'MaGiaiDau', 'MaGiaiDau');
    }
}