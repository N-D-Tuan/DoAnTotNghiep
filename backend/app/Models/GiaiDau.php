<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GiaiDau extends Model
{
    use HasFactory;

    protected $table = 'giaidau';
    protected $primaryKey = 'ID';

    // Trỏ cột created_at mặc định sang NgayTao
    const CREATED_AT = 'NgayTao';
    // Tắt tính năng tự động ghi updated_at
    const UPDATED_AT = null;

    protected $fillable = [
        'ID_NguoiDung',
        'ID_CumSan',
        'TenGiaiDau',
        'NgayBatDau',
        'NgayKetThuc',
        'NoiDung',
        'TrangThai',
        'NgayDuyet'
    ];

    public function nguoiDung()
    {
        return $this->belongsTo(NguoiDung::class, 'ID_NguoiDung', 'ID');
    }

    public function cumSan()
    {
        return $this->belongsTo(CumSan::class, 'ID_CumSan', 'ID');
    }

    public function datSans()
    {
        return $this->hasMany(DatSan::class, 'ID_GiaiDau', 'ID');
    }
}
