<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ThongBao extends Model
{
    use HasFactory;

    protected $table = 'ThongBao';
    protected $primaryKey = 'ID';

    // Bật timestamps nhưng tùy chỉnh lại
    public $timestamps = true;
    
    // Gán cột created_at của Laravel thành NgayTao
    const CREATED_AT = 'NgayTao';
    
    // Tắt hoàn toàn cột updated_at
    const UPDATED_AT = null;

    protected $fillable = [
        'ID_NguoiDung',
        'TieuDe',
        'NoiDung',
        'LoaiThongBao',
        'DaDoc',
        'NgayTao'
    ];

    // Quan hệ với bảng NguoiDung
    public function nguoiDung()
    {
        return $this->belongsTo(NguoiDung::class, 'ID_NguoiDung', 'ID');
    }
}
