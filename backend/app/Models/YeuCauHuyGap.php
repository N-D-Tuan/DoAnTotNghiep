<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class YeuCauHuyGap extends Model
{
    use HasFactory, GeneratesCustomId;

    protected $table = 'YeuCauHuyGap';
    protected $primaryKey = 'MaYeuCauHuyGap';
    protected $idPrefix = 'YCHG';

    const CREATED_AT = 'NgayTao';
    const UPDATED_AT = null;

    protected $fillable = [
        'MaYeuCauHuyGap',
        'MaNguoiDung',
        'MaDatSan',
        'NoiDung',
        'TrangThai',
        'LyDoHuy',
        'NgayDuyet'
    ];

    public function nguoiDung()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNguoiDung', 'MaNguoiDung');
    }

    public function datSan()
    {
        return $this->belongsTo(DatSan::class, 'MaDatSan', 'MaDatSan');
    }
}