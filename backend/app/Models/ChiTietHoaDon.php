<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChiTietHoaDon extends Model
{
    protected $table = 'ChiTietHoaDon';
    public $incrementing = false; // Bảng này dùng khóa ngoại kép
    protected $primaryKey = null;
    public $timestamps = false;

    protected $fillable = ['ID_HoaDon', 'ID_SanPham', 'SoLuong', 'DonGia'];
    
    // Tự động thêm trường 'ThanhTien' vào JSON response
    protected $appends = ['ThanhTien'];

    // Accessor: Tính toán Thành Tiền ở Backend
    public function getThanhTienAttribute()
    {
        return $this->SoLuong * $this->DonGia;
    }

    public function hoaDon()
    {
        return $this->belongsTo(HoaDonBanHang::class, 'ID_HoaDon', 'ID');
    }

    public function sanPham()
    {
        return $this->belongsTo(SanPham::class, 'ID_SanPham', 'ID');
    }
}