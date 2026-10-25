<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class HoaDonDatSan extends Model
{
    use HasFactory, GeneratesCustomId;

    protected $table = 'HoaDonDatSan';
    protected $primaryKey = 'MaHoaDonDatSan';
    protected $idPrefix = 'HDDS';

    const CREATED_AT = 'NgayTao';
    const UPDATED_AT = null;

    protected $fillable = [
        'MaHoaDonDatSan',
        'MaNguoiDung',
        'MaGiaoDich',
        'MaKhuyenMai',
        'TongTien',
        'ThueVAT',
        'PhuongThucThanhToan',
        'TrangThai',
        'NgayTao',
    ];

    // Tự động đính kèm TongTienSan và TienDaCoc ảo vào JSON để Frontend JS không bị gãy
    protected $appends = [
        'TongTienSan',
        'TienDaCoc',
    ];

    public function nguoiDung()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNguoiDung', 'MaNguoiDung');
    }

    public function giaoDich()
    {
        return $this->belongsTo(GiaoDich::class, 'MaGiaoDich', 'MaGiaoDich');
    }

    public function khuyenMai()
    {
        return $this->belongsTo(KhuyenMai::class, 'MaKhuyenMai', 'MaKhuyenMai');
    }

    // Quan hệ 1-N tới bảng ChiTietHoaDon
    public function chiTietHoaDons()
    {
        return $this->hasMany(ChiTietHoaDon::class, 'MaHoaDonDatSan', 'MaHoaDonDatSan');
    }

    // Quan hệ lấy danh sách các trận DatSan thông qua bảng trung gian ChiTietHoaDon
    public function datSans()
    {
        return $this->belongsToMany(
            DatSan::class,
            'ChiTietHoaDon',
            'MaHoaDonDatSan',
            'MaDatSan',
            'MaHoaDonDatSan',
            'MaDatSan'
        )->withPivot('DonGia');
    }

    // Accessor tương thích ngược: Khi code gọi $hoaDon->TongTienSan sẽ tự lấy cột TongTien mới
    public function getTongTienSanAttribute()
    {
        return $this->attributes['TongTien'] ?? 0;
    }

    // Accessor tương thích ngược: Tính tổng TienDaCoc từ các trận DatSan thuộc hóa đơn này
    public function getTienDaCocAttribute()
    {
        if ($this->relationLoaded('datSans')) {
            $validMatches = $this->datSans->where('TrangThai', '!=', 'DaHuy');
            if ($validMatches->isNotEmpty()) {
                return $validMatches->sum('TienCoc');
            }
            return $this->datSans->sum('TienCoc');
        }

        // Nếu chưa eager load thì tính nhanh qua bảng ChiTietHoaDon -> DatSan
        $sumValid = DatSan::whereHas('chiTietHoaDon', function ($q) {
            $q->where('MaHoaDonDatSan', $this->MaHoaDonDatSan);
        })->where('TrangThai', '!=', 'DaHuy')->sum('TienCoc');

        if ($sumValid > 0) return $sumValid;

        return DatSan::whereHas('chiTietHoaDon', function ($q) {
            $q->where('MaHoaDonDatSan', $this->MaHoaDonDatSan);
        })->sum('TienCoc');
    }
}