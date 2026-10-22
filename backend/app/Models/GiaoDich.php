<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class GiaoDich extends Model
{
    use HasFactory, GeneratesCustomId;

    protected $table = 'GiaoDich';
    protected $primaryKey = 'MaGiaoDich';
    protected $idPrefix = 'GD';

    const CREATED_AT = 'NgayTao';
    const UPDATED_AT = null;

    protected $fillable = [
        'MaGiaoDich',
        'MaNguoiDung',
        'MaNhanVienXuLy',
        'LoaiGiaoDich',
        'DongTien',
        'SoTien',
        'SoDuTruoc',
        'SoDuSau',
        'NoiDung',
    ];

    public function nguoiDung()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNguoiDung', 'MaNguoiDung');
    }

    public function nhanVienXuLy()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNhanVienXuLy', 'MaNguoiDung');
    }

    // Quan hệ 1-1 với HoaDonDatSan
    public function hoaDonDatSan()
    {
        return $this->hasOne(HoaDonDatSan::class, 'MaGiaoDich', 'MaGiaoDich');
    }
}