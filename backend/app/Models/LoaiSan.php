<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class LoaiSan extends Model
{
    use GeneratesCustomId;

    protected $table = 'LoaiSan';
    protected $primaryKey = 'MaLoaiSan';
    protected $idPrefix = 'LS';
    public $timestamps = false;

    protected $fillable = [
        'MaLoaiSan',
        'TenLoaiSan'
    ];

    public function sanBongs()
    {
        return $this->hasMany(SanBong::class, 'MaLoaiSan', 'MaLoaiSan');
    }

    public function giaTiens()
    {
        return $this->hasMany(GiaTien::class, 'MaLoaiSan', 'MaLoaiSan');
    }
}