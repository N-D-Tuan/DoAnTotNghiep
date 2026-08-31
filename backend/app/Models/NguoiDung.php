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
}