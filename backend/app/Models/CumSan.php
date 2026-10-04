<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class CumSan extends Model
{
    use SoftDeletes;
    
    protected $table = 'CumSan';
    protected $primaryKey = 'ID';
    public $timestamps = false;
    protected $fillable = ['ID_Phuong', 'TenCumSan', 'DiaChi', 'ViDo', 'KinhDo', 'GioMoCua', 'GioDongCua', 'HinhAnh'];

    public function phuong()
    {
        return $this->belongsTo(Phuong::class, 'ID_Phuong', 'ID');
    }

    public function sanBongs()
    {
        return $this->hasMany(SanBong::class, 'ID_CumSan', 'ID');
    }

    public function giaTiens()
    {
        return $this->hasMany(GiaTien::class, 'ID_CumSan', 'ID');
    }

    public function giaiDaus()
    {
        return $this->hasMany(GiaiDau::class, 'ID_CumSan', 'ID');
    }

    public function quanLySans()
    {
        return $this->hasMany(NguoiDung::class, 'ID_CumSan', 'ID');
    }

    public function caLamViecs()
    {
        return $this->hasMany(CaLamViec::class, 'ID_CumSan', 'ID');
    }

    public function banGiaoCas()
    {
        return $this->hasMany(BanGiaoCa::class, 'ID_CumSan', 'ID');
    }
}
