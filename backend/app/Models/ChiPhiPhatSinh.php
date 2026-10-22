<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class ChiPhiPhatSinh extends Model
{
    use GeneratesCustomId;

    protected $table = 'ChiPhiPhatSinh';
    protected $primaryKey = 'MaChiPhiPhatSinh';
    protected $idPrefix = 'CPPS';
    public $timestamps = false;

    protected $fillable = [
        'MaChiPhiPhatSinh',
        'MaBanGiaoCa',
        'SoTien',
        'NoiDung',
        'ThoiGian'
    ];

    public function banGiaoCa()
    {
        return $this->belongsTo(BanGiaoCa::class, 'MaBanGiaoCa', 'MaBanGiaoCa');
    }
}