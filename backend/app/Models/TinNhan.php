<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class TinNhan extends Model
{
    use HasFactory, GeneratesCustomId;

    protected $table = 'TinNhan';
    protected $primaryKey = 'MaTinNhan';
    protected $idPrefix = 'TN';

    const CREATED_AT = 'NgayTao';
    const UPDATED_AT = null;

    protected $fillable = [
        'MaTinNhan',
        'MaPhienChat',
        'NguoiGui',
        'NoiDung',
        'DuLieuBocThem',
    ];

    protected $casts = [
        'DuLieuBocThem' => 'array',
    ];

    public function phienChat()
    {
        return $this->belongsTo(PhienChat::class, 'MaPhienChat', 'MaPhienChat');
    }
}