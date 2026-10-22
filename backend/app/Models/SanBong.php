<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class SanBong extends Model
{
    use GeneratesCustomId;

    protected $table = 'SanBong';
    protected $primaryKey = 'MaSanBong';
    protected $idPrefix = 'SB';
    public $timestamps = false;

    protected $fillable = [
        'MaSanBong',
        'MaCumSan',
        'MaLoaiSan',
        'TenSan',
        'DienTich',
        'KichThuoc',
        'MoTa',
        'TrangThai'
    ];

    public function cumSan()
    {
        return $this->belongsTo(CumSan::class, 'MaCumSan', 'MaCumSan');
    }

    public function loaiSan()
    {
        return $this->belongsTo(LoaiSan::class, 'MaLoaiSan', 'MaLoaiSan');
    }

    public function datSans()
    {
        return $this->hasMany(DatSan::class, 'MaSanBong', 'MaSanBong');
    }
}