<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PhieuNhapHang extends Model
{
    protected $table = 'PhieuNhapHang';
    protected $primaryKey = 'ID';
    
    // Bật timestamps nhưng tùy chỉnh lại
    public $timestamps = false;
    
    // Gán cột created_at của Laravel thành NgayNhap
    const CREATED_AT = 'NgayNhap';

    // Vô hiệu hóa updated_at, giữ lại created_at (đóng vai trò là NgayNhap)
    const UPDATED_AT = null;

    protected $fillable = ['ID_CumSan', 'ID_NhanVien', 'TongTienThanhToan', 'ChiTietNhap', 'NgayNhap'];

    // Ép kiểu JSON thành Array tự động
    protected $casts = [
        'ChiTietNhap' => 'array',
    ];

    public function cumSan()
    {
        return $this->belongsTo(CumSan::class, 'ID_CumSan', 'ID');
    }

    public function nhanVien() // Nhân viên ở đây là Quản lý sân
    {
        return $this->belongsTo(NguoiDung::class, 'ID_NhanVien', 'ID');
    }
}