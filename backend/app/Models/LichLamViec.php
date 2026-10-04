<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LichLamViec extends Model
{
    protected $table = 'LichLamViec';
    protected $primaryKey = 'ID';
    public $timestamps = false;

    protected $fillable = [
        'ID_CaLamViec', 'NgayLam', 'ID_NhanVien', 'GhiChu', 'CongViec',
        'TrangThaiXepLich', 'TrangThaiDiemDanh', 'SoPhutDiMuon', 
        'TienPhat', 'TienThuong', 'LyDoDieuChinh'
    ];

    public function caLamViec()
    {
        return $this->belongsTo(CaLamViec::class, 'ID_CaLamViec', 'ID');
    }

    public function nhanVien()
    {
        return $this->belongsTo(NguoiDung::class, 'ID_NhanVien', 'ID');
    }
}