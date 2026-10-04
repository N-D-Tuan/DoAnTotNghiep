<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChiPhiPhatSinh extends Model
{
    protected $table = 'ChiPhiPhatSinh';
    protected $primaryKey = 'ID';
    public $timestamps = false;

    protected $fillable = [
        'ID_BanGiaoCa', 'SoTien', 'NoiDung', 'ThoiGian'
    ];

    public function banGiaoCa()
    {
        return $this->belongsTo(BanGiaoCa::class, 'ID_BanGiaoCa', 'ID');
    }
}