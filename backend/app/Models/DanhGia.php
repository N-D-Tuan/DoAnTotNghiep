<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class DanhGia extends Model
{
    use HasFactory, GeneratesCustomId;

    protected $table = 'DanhGia';
    protected $primaryKey = 'MaDanhGia';
    protected $idPrefix = 'DG';

    const CREATED_AT = 'NgayTao';
    const UPDATED_AT = null;

    protected $fillable = [
        'MaDanhGia',
        'MaDatSan',
        'MaCumSan',
        'MaNguoiDung',
        'SoSao',
        'NoiDung',
        'NgayTao',
    ];

    public function datSan()
    {
        return $this->belongsTo(DatSan::class, 'MaDatSan', 'MaDatSan');
    }

    public function cumSan()
    {
        return $this->belongsTo(CumSan::class, 'MaCumSan', 'MaCumSan');
    }

    public function nguoiDung()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNguoiDung', 'MaNguoiDung');
    }
}