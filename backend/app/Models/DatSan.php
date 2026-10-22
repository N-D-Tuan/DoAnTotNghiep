<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class DatSan extends Model
{
    use HasFactory, GeneratesCustomId;

    protected $table = 'DatSan';
    protected $primaryKey = 'MaDatSan';
    protected $idPrefix = 'DS';
    public $timestamps = false;

    protected $fillable = [
        'MaDatSan',
        'MaNguoiDung',
        'TenKhachVangLai',
        'SDTKhachVangLai',
        'EmailKhachVangLai',
        'MaSanBong',
        'MaKhungGio',
        'MaGiaiDau',
        'MaHoaDonDatSan',
        'MaNhanVienXuLy',
        'NgayDa',
        'TongTien',
        'TienCoc',
        'TrangThai'
    ];

    public function nguoiDung()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNguoiDung', 'MaNguoiDung');
    }

    public function sanBong()
    {
        return $this->belongsTo(SanBong::class, 'MaSanBong', 'MaSanBong');
    }

    public function khungGio()
    {
        return $this->belongsTo(KhungGio::class, 'MaKhungGio', 'MaKhungGio');
    }

    public function giaiDau()
    {
        return $this->belongsTo(GiaiDau::class, 'MaGiaiDau', 'MaGiaiDau');
    }

    public function hoaDonDatSan()
    {
        return $this->belongsTo(HoaDonDatSan::class, 'MaHoaDonDatSan', 'MaHoaDonDatSan');
    }

    public function yeuCauHuyGaps()
    {
        return $this->hasMany(YeuCauHuyGap::class, 'MaDatSan', 'MaDatSan');
    }

    public function nhanVienXuLy()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNhanVienXuLy', 'MaNguoiDung');
    }

    public function danhGia()
    {
        return $this->hasOne(DanhGia::class, 'MaDatSan', 'MaDatSan');
    }
}