<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class Phuong extends Model
{
    use GeneratesCustomId;

    protected $table = 'Phuong';
    protected $primaryKey = 'MaPhuong';
    protected $idPrefix = 'P';
    public $timestamps = false;

    protected $fillable = [
        'MaPhuong',
        'TenPhuong'
    ];

    public function cumSans()
    {
        return $this->hasMany(CumSan::class, 'MaPhuong', 'MaPhuong');
    }
}