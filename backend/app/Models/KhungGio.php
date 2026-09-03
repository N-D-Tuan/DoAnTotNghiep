<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class KhungGio extends Model
{
    protected $table = 'KhungGio';
    protected $primaryKey = 'ID';
    public $timestamps = false;
    protected $fillable = ['GioBatDau', 'GioKetThuc'];

    public function giaTiens()
    {
        return $this->hasMany(GiaTien::class, 'ID_KhungGio', 'ID');
    }

    public function datSans()
    {
        return $this->hasMany(DatSan::class, 'ID_KhungGio', 'ID');
    }
}
