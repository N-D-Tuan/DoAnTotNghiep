<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GiaoDich extends Model
{
    use HasFactory;

    protected $table = 'giaodich';
    protected $primaryKey = 'ID';

    // Trỏ cột created_at mặc định sang NgayTao
    const CREATED_AT = 'NgayTao';
    // Tắt tính năng tự động ghi updated_at
    const UPDATED_AT = null;

    protected $fillable = [
        'ID_NguoiDung',
        'ID_DatSan',
        'LoaiGiaoDich',
        'DongTien',
        'SoTien',
        'SoDuTruoc',
        'SoDuSau',
        'NoiDung',
    ];

    // Liên kết với bảng NguoiDung
    public function nguoiDung()
    {
        return $this->belongsTo(NguoiDung::class, 'ID_NguoiDung', 'ID');
    }

    // Liên kết với bảng DatSan (Khi nào tạo Model DatSan mới có tác dụng)
    public function datSan()
    {
        return $this->belongsTo(DatSan::class, 'ID_DatSan', 'ID');
    }

    // Liên kết 1-1 với YeuCauRutTien
    public function yeuCauRutTien()
    {
        return $this->hasOne(YeuCauRutTien::class, 'ID_GiaoDich', 'ID');
    }
}
