<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class KhungGio extends Model
{
    use GeneratesCustomId;

    protected $table = 'KhungGio';
    protected $primaryKey = 'MaKhungGio';
    protected $idPrefix = 'KG';
    public $timestamps = false;

    protected $fillable = [
        'MaKhungGio',
        'GioBatDau',
        'GioKetThuc'
    ];

    public function giaTiens()
    {
        return $this->hasMany(GiaTien::class, 'MaKhungGio', 'MaKhungGio');
    }

    public function datSans()
    {
        return $this->hasMany(DatSan::class, 'MaKhungGio', 'MaKhungGio');
    }
}