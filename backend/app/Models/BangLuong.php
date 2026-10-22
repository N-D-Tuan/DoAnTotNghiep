<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class BangLuong extends Model
{
    use GeneratesCustomId;

    protected $table = 'BangLuong';
    protected $primaryKey = 'MaBangLuong';
    protected $idPrefix = 'BL';
    public $timestamps = false;

    protected $fillable = [
        'MaBangLuong',
        'MaNhanVien',
        'ThangNam',
        'TongCaLam',
        'TongTienLuong',
        'TongTienThuong',
        'TongTienPhat',
        'LyDoKhieuNai',
        'TrangThai',
        'NgayChot',
        'NgayXacNhan',
        'NgayThanhToan'
    ];

    protected $appends = ['ThucLanh'];

    public function nhanVien()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNhanVien', 'MaNguoiDung');
    }

    public function getThucLanhAttribute()
    {
        $luong = $this->TongTienLuong ?? 0;
        $thuong = $this->TongTienThuong ?? 0;
        $phat = $this->TongTienPhat ?? 0;

        return $luong + $thuong - $phat;
    }
}