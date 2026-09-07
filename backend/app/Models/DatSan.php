<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DatSan extends Model
{
    use HasFactory;

    protected $table = 'DatSan';
    protected $primaryKey = 'ID';
    
    // Tắt hoàn toàn tự động timestamps của Laravel
    public $timestamps = false;

    protected $fillable = [
        'ID_NguoiDung', 
        'ID_SanBong', 
        'ID_KhungGio', 
        'ID_GiaiDau', 
        'NgayDa', 
        'TongTien', 
        'TienCoc', 
        'TrangThai'
    ];

    public function nguoiDung() { return $this->belongsTo(NguoiDung::class, 'ID_NguoiDung', 'ID'); }
    public function sanBong() { return $this->belongsTo(SanBong::class, 'ID_SanBong', 'ID'); }
    public function khungGio() { return $this->belongsTo(KhungGio::class, 'ID_KhungGio', 'ID'); }
    public function giaiDau() { return $this->belongsTo(GiaiDau::class, 'ID_GiaiDau', 'ID'); }
    public function yeuCauHuyGaps() { return $this->hasMany(YeuCauHuyGap::class, 'ID_DatSan', 'ID'); }
    public function giaoDichs() { return $this->hasMany(GiaoDich::class, 'ID_DatSan', 'ID'); }
}
