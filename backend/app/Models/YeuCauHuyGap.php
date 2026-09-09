<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class YeuCauHuyGap extends Model
{
    use HasFactory;

    protected $table = 'YeuCauHuyGap';
    protected $primaryKey = 'ID';
    
    // Đổi tên created_at thành NgayTao
    const CREATED_AT = 'NgayTao';
    // Tắt hoàn toàn updated_at
    const UPDATED_AT = null;

    protected $fillable = [
        'ID_NguoiDung', 
        'ID_DatSan', 
        'NoiDung', 
        'TrangThai', 
        'LyDoHuy', 
        'NgayDuyet'
    ];

    public function nguoiDung() { return $this->belongsTo(NguoiDung::class, 'ID_NguoiDung', 'ID'); }
    public function datSan() { return $this->belongsTo(DatSan::class, 'ID_DatSan', 'ID'); }
}
