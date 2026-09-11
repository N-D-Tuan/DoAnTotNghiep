<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TinNhan extends Model
{
    use HasFactory;

    protected $table = 'TinNhan';
    protected $primaryKey = 'ID';

    const CREATED_AT = 'NgayTao';
    const UPDATED_AT = null;

    protected $fillable = [
        'ID_PhienChat',
        'NguoiGui',
        'NoiDung',
        'DuLieuBocThem',
    ];

    // Ép kiểu cột DuLieuBocThem tự động chuyển thành Mảng (Array) trong PHP khi lấy từ dạng JSON ra
    protected $casts = [
        'DuLieuBocThem' => 'array',
    ];

    // Quan hệ với bảng PhienChat
    public function phienChat()
    {
        return $this->belongsTo(PhienChat::class, 'ID_PhienChat', 'ID');
    }
}
