<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HoaDonBanHang extends Model
{
    protected $table = 'HoaDonBanHang';
    protected $primaryKey = 'ID';
    
    // Bật timestamps nhưng tùy chỉnh lại
    public $timestamps = false;
    
    // Gán cột created_at của Laravel thành NgayTao
    const CREATED_AT = 'NgayTao';
    
    // Vô hiệu hóa updated_at, giữ lại created_at (đóng vai trò là NgayTao)
    const UPDATED_AT = null;

    protected $fillable = ['ID_NhanVien', 'ID_CumSan', 'TongTien', 'NgayTao'];

    public function nhanVien()
    {
        return $this->belongsTo(NguoiDung::class, 'ID_NhanVien', 'ID');
    }

    public function cumSan()
    {
        return $this->belongsTo(CumSan::class, 'ID_CumSan', 'ID');
    }

    public function chiTietHoaDons()
    {
        return $this->hasMany(ChiTietHoaDon::class, 'ID_HoaDon', 'ID');
    }
}