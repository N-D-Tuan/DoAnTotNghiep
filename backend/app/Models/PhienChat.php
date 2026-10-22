<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Traits\GeneratesCustomId;

class PhienChat extends Model
{
    use HasFactory, SoftDeletes, GeneratesCustomId;

    protected $table = 'PhienChat';
    protected $primaryKey = 'MaPhienChat';
    protected $idPrefix = 'PC';

    const CREATED_AT = 'NgayTao';
    const UPDATED_AT = 'NgayCapNhat';
    const DELETED_AT = 'NgayXoa';

    protected $fillable = [
        'MaPhienChat',
        'MaNguoiDung',
        'TieuDe',
    ];

    public function nguoiDung()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNguoiDung', 'MaNguoiDung');
    }

    public function tinNhans()
    {
        return $this->hasMany(TinNhan::class, 'MaPhienChat', 'MaPhienChat');
    }
}