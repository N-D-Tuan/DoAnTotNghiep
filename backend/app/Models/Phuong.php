<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Phuong extends Model
{
    protected $table = 'Phuong';
    protected $primaryKey = 'ID';
    public $timestamps = false;
    protected $fillable = ['TenPhuong'];

    public function cumSans()
    {
        return $this->hasMany(CumSan::class, 'ID_Phuong', 'ID');
    }
}
