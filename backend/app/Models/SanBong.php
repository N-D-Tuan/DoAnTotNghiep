<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SanBong extends Model
{
    protected $table = 'SanBong';
    protected $primaryKey = 'ID';
    public $timestamps = false;
    protected $fillable = ['ID_CumSan', 'ID_LoaiSan', 'TenSan', 'TrangThai'];

    public function cumSan()
    {
        return $this->belongsTo(CumSan::class, 'ID_CumSan', 'ID');
    }

    public function loaiSan()
    {
        return $this->belongsTo(LoaiSan::class, 'ID_LoaiSan', 'ID');
    }
}
