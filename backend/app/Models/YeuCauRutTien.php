<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class YeuCauRutTien extends Model
{
    use HasFactory;

    protected $table = 'yeucauruttien';
    protected $primaryKey = 'ID';

    // Trỏ cột created_at mặc định sang NgayTao
    const CREATED_AT = 'NgayTao';
    // Tắt tính năng tự động ghi updated_at
    const UPDATED_AT = null;

    protected $fillable = [
        'ID_NguoiDung',
        'ID_GiaoDich',
        'SoTien',
        'NoiDung',
        'TrangThai',
        'NgayDuyet'
    ];

    // Liên kết với bảng NguoiDung
    public function nguoiDung()
    {
        return $this->belongsTo(NguoiDung::class, 'ID_NguoiDung', 'ID');
    }

    // Liên kết 1-1 ngược lại với bảng GiaoDich
    public function giaoDich()
    {
        return $this->belongsTo(GiaoDich::class, 'ID_GiaoDich', 'ID');
    }
}
