<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class LichLamViec extends Model
{
    use GeneratesCustomId;

    protected $table = 'LichLamViec';
    protected $primaryKey = 'MaLichLamViec';
    protected $idPrefix = 'LLV';
    public $timestamps = false;

    protected $fillable = [
        'MaLichLamViec',
        'MaCaLamViec',
        'NgayLam',
        'MaNhanVien',
        'GhiChu',
        'CongViec',
        'TrangThaiXepLich',
        'TrangThaiDiemDanh',
        'SoPhutDiMuon',
        'TienPhat',
        'TienThuong',
        'LyDoDieuChinh'
    ];

    public function caLamViec()
    {
        return $this->belongsTo(CaLamViec::class, 'MaCaLamViec', 'MaCaLamViec');
    }

    public function nhanVien()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNhanVien', 'MaNguoiDung');
    }
}