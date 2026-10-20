<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BaiDangTimNguoi extends Model
{
    use HasFactory;

    protected $table = 'BaiDangTimNguoi';
    protected $primaryKey = 'ID';
    public $timestamps = false;

    protected $fillable = [
        'ID_DatSan',
        'ID_NguoiTao',
        'TenDoiChuNha',
        'LoaiKeo',
        'TrinhDo',
        'ChiaTienSan',
        'SoLuongCan',
        'GhiChu',
        'ID_NguoiNhan',
        'TenDoiKhach',
        'SDTKhach',
        'TrangThai',
        'NgayTao'
    ];

    public function datSan()
    {
        return $this->belongsTo(DatSan::class, 'ID_DatSan', 'ID');
    }

    public function nguoiTao()
    {
        return $this->belongsTo(NguoiDung::class, 'ID_NguoiTao', 'ID');
    }

    public function nguoiNhan()
    {
        return $this->belongsTo(NguoiDung::class, 'ID_NguoiNhan', 'ID');
    }
}