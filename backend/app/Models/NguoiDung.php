<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class NguoiDung extends Authenticatable
{
    use Notifiable;

    protected $table = 'NguoiDung';
    protected $primaryKey = 'ID';
    public $timestamps = false;

    protected $fillable = [
        'HoTen', 'SoDienThoai', 'Email', 'MatKhau', 'VaiTro', 'SoDuVi', 'MaOTP', 'ThoiGianHetHanOTP'
    ];

    protected $hidden = [
        'MatKhau', 'MaOTP', 'ThoiGianHetHanOTP'
    ];

    // Ghi đè phương thức lấy mật khẩu mặc định của Laravel
    public function getAuthPassword()
    {
        return $this->MatKhau;
    }

    public function giaiDaus()
    {
        return $this->hasMany(GiaiDau::class, 'ID_NguoiDung', 'ID');
    }

    public function datSans()
    {
        return $this->hasMany(DatSan::class, 'ID_NguoiDung', 'ID');
    }

    public function giaoDichs()
    {
        return $this->hasMany(GiaoDich::class, 'ID_NguoiDung', 'ID');
    }

    public function yeuCauHuyGaps()
    {
        return $this->hasMany(YeuCauHuyGap::class, 'ID_NguoiDung', 'ID');
    }

    public function yeuCauRutTiens()
    {
        return $this->hasMany(YeuCauRutTien::class, 'ID_NguoiDung', 'ID');
    }

    public function thongBaos()
    {
        return $this->hasMany(ThongBao::class, 'ID_NguoiDung', 'ID');
    }
}