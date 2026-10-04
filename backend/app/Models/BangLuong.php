<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BangLuong extends Model
{
    protected $table = 'BangLuong';
    protected $primaryKey = 'ID';
    public $timestamps = false;

    protected $fillable = [
        'ID_NhanVien', 'ThangNam', 'TongCaLam', 'TongTienLuong', 
        'TongTienThuong', 'TongTienPhat', 'ThongTinNganHang', 
        'LyDoKhieuNai', 'TrangThai', 'NgayChot', 'NgayXacNhan', 'NgayThanhToan'
    ];
    
    // Thêm ThucLanh vào mảng appends để API/Frontend luôn nhận được trường ảo này
    protected $appends = ['ThucLanh'];

    public function nhanVien()
    {
        return $this->belongsTo(NguoiDung::class, 'ID_NhanVien', 'ID');
    }

    // Accessor tính toán Thực Lãnh tự động (Dạng chuẩn 3NF)
    public function getThucLanhAttribute()
    {
        $luong = $this->TongTienLuong ?? 0;
        $thuong = $this->TongTienThuong ?? 0;
        $phat = $this->TongTienPhat ?? 0;
        
        return $luong + $thuong - $phat;
    }
}