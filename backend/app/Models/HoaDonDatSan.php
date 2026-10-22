<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class HoaDonDatSan extends Model
{
    use HasFactory, GeneratesCustomId;

    protected $table = 'HoaDonDatSan';
    protected $primaryKey = 'MaHoaDonDatSan';
    protected $idPrefix = 'HDDS';

    const CREATED_AT = 'NgayTao';
    const UPDATED_AT = null;

    protected $fillable = [
        'MaHoaDonDatSan',
        'MaNguoiDung',
        'MaGiaoDich',
        'TongTienSan',
        'TienDaCoc',
        'PhuongThucThanhToan',
        'TrangThai',
        'NgayTao',
    ];

    public function nguoiDung()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNguoiDung', 'MaNguoiDung');
    }

    public function giaoDich()
    {
        return $this->belongsTo(GiaoDich::class, 'MaGiaoDich', 'MaGiaoDich');
    }

    public function datSans()
    {
        return $this->hasMany(DatSan::class, 'MaHoaDonDatSan', 'MaHoaDonDatSan');
    }
}