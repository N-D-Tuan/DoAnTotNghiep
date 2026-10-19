<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DanhGia extends Model
{
    use HasFactory;

    protected $table = 'DanhGia';
    protected $primaryKey = 'ID';

    const CREATED_AT = 'NgayTao';
    const UPDATED_AT = null; // Bỏ cột updated_at

    protected $fillable = [
        'ID_DatSan',
        'ID_CumSan',
        'ID_NguoiDung',
        'SoSao',
        'NoiDung',
        'NgayTao',
    ];

    // Quan hệ: Thuộc về 1 đơn Đặt sân
    public function datSan()
    {
        return $this->belongsTo(DatSan::class, 'ID_DatSan', 'ID');
    }

    // Quan hệ: Thuộc về 1 Cụm sân
    public function cumSan()
    {
        return $this->belongsTo(CumSan::class, 'ID_CumSan', 'ID');
    }

    // Quan hệ: Thuộc về 1 Người dùng (Khách hàng)
    public function nguoiDung()
    {
        return $this->belongsTo(NguoiDung::class, 'ID_NguoiDung', 'ID');
    }
}