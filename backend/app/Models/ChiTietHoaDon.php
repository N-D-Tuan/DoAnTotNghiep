<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChiTietHoaDon extends Model
{
    protected $table = 'ChiTietHoaDon';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $fillable = [
        'MaHoaDonDatSan',
        'MaDatSan',
        'DonGia',
    ];

    // Quan hệ N-1 với HoaDonDatSan
    public function hoaDonDatSan()
    {
        return $this->belongsTo(HoaDonDatSan::class, 'MaHoaDonDatSan', 'MaHoaDonDatSan');
    }

    // Quan hệ 1-1 với DatSan
    public function datSan()
    {
        return $this->belongsTo(DatSan::class, 'MaDatSan', 'MaDatSan');
    }
}