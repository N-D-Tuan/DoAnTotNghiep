<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GiaTien extends Model
{
    protected $table = 'GiaTien';
    protected $primaryKey = 'ID';
    public $timestamps = false;
    protected $fillable = ['ID_CumSan', 'ID_LoaiSan', 'ID_KhungGio', 'SoTien'];

    public function cumSan()
    {
        return $this->belongsTo(CumSan::class, 'ID_CumSan', 'ID');
    }

    public function loaiSan()
    {
        return $this->belongsTo(LoaiSan::class, 'ID_LoaiSan', 'ID');
    }

    public function khungGio()
    {
        return $this->belongsTo(KhungGio::class, 'ID_KhungGio', 'ID');
    }
}
