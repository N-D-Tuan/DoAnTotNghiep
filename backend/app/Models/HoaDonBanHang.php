<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class HoaDonBanHang extends Model
{
    use GeneratesCustomId;

    protected $table = 'HoaDonBanHang';
    protected $primaryKey = 'MaHoaDonBanHang';
    protected $idPrefix = 'HDBH';

    public $timestamps = false;
    const CREATED_AT = 'NgayTao';
    const UPDATED_AT = null;

    protected $fillable = [
        'MaHoaDonBanHang',
        'MaNhanVien',
        'MaCumSan',
        'TongTien',
        'NgayTao'
    ];

    public function nhanVien()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNhanVien', 'MaNguoiDung');
    }

    public function cumSan()
    {
        return $this->belongsTo(CumSan::class, 'MaCumSan', 'MaCumSan');
    }

    public function chiTietHoaDons()
    {
        return $this->hasMany(ChiTietHoaDon::class, 'MaHoaDon', 'MaHoaDonBanHang');
    }
}