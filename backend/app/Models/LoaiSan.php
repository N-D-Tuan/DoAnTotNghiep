<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LoaiSan extends Model
{
    protected $table = 'LoaiSan';
    protected $primaryKey = 'ID';
    public $timestamps = false;
    protected $fillable = ['TenLoaiSan'];

    public function sanBongs()
    {
        return $this->hasMany(SanBong::class, 'ID_LoaiSan', 'ID');
    }

    public function giaTiens()
    {
        return $this->hasMany(GiaTien::class, 'ID_LoaiSan', 'ID');
    }
}
