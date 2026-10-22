<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class CumSan extends Model
{
    use GeneratesCustomId;

    protected $table = 'CumSan';
    protected $primaryKey = 'MaCumSan';
    protected $idPrefix = 'CS';
    public $timestamps = false;

    protected $fillable = [
        'MaCumSan',
        'MaPhuong',
        'TenCumSan',
        'DiaChi',
        'ViDo',
        'KinhDo',
        'GioMoCua',
        'GioDongCua',
        'HinhAnh',
        'TrangThai'
    ];

    public function phuong()
    {
        return $this->belongsTo(Phuong::class, 'MaPhuong', 'MaPhuong');
    }

    public function sanBongs()
    {
        return $this->hasMany(SanBong::class, 'MaCumSan', 'MaCumSan');
    }

    public function giaTiens()
    {
        return $this->hasMany(GiaTien::class, 'MaCumSan', 'MaCumSan');
    }

    public function giaiDaus()
    {
        return $this->hasMany(GiaiDau::class, 'MaCumSan', 'MaCumSan');
    }

    public function quanLySans()
    {
        return $this->hasMany(NguoiDung::class, 'MaCumSan', 'MaCumSan');
    }

    public function caLamViecs()
    {
        return $this->hasMany(CaLamViec::class, 'MaCumSan', 'MaCumSan');
    }

    public function banGiaoCas()
    {
        return $this->hasMany(BanGiaoCa::class, 'MaCumSan', 'MaCumSan');
    }

    public function sanPhams()
    {
        return $this->hasMany(SanPham::class, 'MaCumSan', 'MaCumSan');
    }

    public function hoaDonBanHangs()
    {
        return $this->hasMany(HoaDonBanHang::class, 'MaCumSan', 'MaCumSan');
    }

    public function phieuNhapHangs()
    {
        return $this->hasMany(PhieuNhapHang::class, 'MaCumSan', 'MaCumSan');
    }

    public function danhGias()
    {
        return $this->hasMany(DanhGia::class, 'MaCumSan', 'MaCumSan');
    }
}