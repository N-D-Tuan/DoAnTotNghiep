<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class PhienChat extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'PhienChat';
    protected $primaryKey = 'ID';

    // Cấu hình tên cột Timestamps
    const CREATED_AT = 'NgayTao';
    const UPDATED_AT = 'NgayCapNhat';
    const DELETED_AT = 'NgayXoa';
    
    protected $fillable = [
        'ID_NguoiDung',
        'TieuDe',
    ];

    // Quan hệ với bảng NguoiDung
    public function nguoiDung()
    {
        return $this->belongsTo(NguoiDung::class, 'ID_NguoiDung', 'ID');
    }

    // Quan hệ với bảng TinNhan
    public function tinNhans()
    {
        return $this->hasMany(TinNhan::class, 'ID_PhienChat', 'ID');
    }
}
