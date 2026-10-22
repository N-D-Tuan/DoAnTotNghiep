<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class ThongBao extends Model
{
    use HasFactory, GeneratesCustomId;

    protected $table = 'ThongBao';
    protected $primaryKey = 'MaThongBao';
    protected $idPrefix = 'TB';

    public $timestamps = true;
    const CREATED_AT = 'NgayTao';
    const UPDATED_AT = null;

    protected $fillable = [
        'MaThongBao',
        'MaNguoiDung',
        'TieuDe',
        'NoiDung',
        'LoaiThongBao',
        'DaDoc',
        'NgayTao'
    ];

    public function nguoiDung()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNguoiDung', 'MaNguoiDung');
    }
}