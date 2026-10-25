<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\GeneratesCustomId;

class DatSan extends Model
{
    use HasFactory, GeneratesCustomId;

    protected $table = 'DatSan';
    protected $primaryKey = 'MaDatSan';
    protected $idPrefix = 'DS';
    public $timestamps = false;

    protected $fillable = [
        'MaDatSan',
        'MaNguoiDung',
        'TenNguoiDat',
        'SDTNguoiDat',
        'EmailNguoiDat',
        'MaSanBong',
        'MaKhungGio',
        'MaGiaiDau',
        'MaNhanVienXuLy',
        'NgayDa',
        'TongTien',
        'TienCoc',
        'TrangThai',
    ];

    // Tự động đính kèm các thuộc tính ánh xạ để Frontend (admin.js, staff.js, customer.js) hoạt động trơn tru
    protected $appends = [
        'ID',
        'ID_NguoiDung',
        'ID_SanBong',
        'ID_KhungGio',
        'ID_GiaiDau',
        'ID_NhanVienXuLy',
        'MaHoaDonDatSan',
        'TenKhachVangLai',
        'SDTKhachVangLai',
        'EmailKhachVangLai',
    ];

    public function nguoiDung()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNguoiDung', 'MaNguoiDung');
    }

    public function nhanVienXuLy()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNhanVienXuLy', 'MaNguoiDung');
    }

    public function sanBong()
    {
        return $this->belongsTo(SanBong::class, 'MaSanBong', 'MaSanBong');
    }

    public function khungGio()
    {
        return $this->belongsTo(KhungGio::class, 'MaKhungGio', 'MaKhungGio');
    }

    public function giaiDau()
    {
        return $this->belongsTo(GiaiDau::class, 'MaGiaiDau', 'MaGiaiDau');
    }

    // Quan hệ 1-1 với bảng ChiTietHoaDon
    public function chiTietHoaDon()
    {
        return $this->hasOne(ChiTietHoaDon::class, 'MaDatSan', 'MaDatSan');
    }

    // Quan hệ 1-1 thông qua bảng trung gian ChiTietHoaDon để lấy HoaDonDatSan
    public function hoaDonDatSan()
    {
        return $this->hasOneThrough(
            HoaDonDatSan::class,
            ChiTietHoaDon::class,
            'MaDatSan',        // Khóa ngoại trên bảng ChiTietHoaDon
            'MaHoaDonDatSan',  // Khóa chính trên bảng HoaDonDatSan
            'MaDatSan',        // Khóa chính trên bảng DatSan
            'MaHoaDonDatSan'   // Khóa ngoại trên bảng ChiTietHoaDon nối tới HoaDonDatSan
        );
    }

    public function yeuCauHuyGap()
    {
        return $this->hasOne(YeuCauHuyGap::class, 'MaDatSan', 'MaDatSan');
    }

    public function danhGia()
    {
        return $this->hasOne(DanhGia::class, 'MaDatSan', 'MaDatSan');
    }

    // ================= ACCESSORS & MUTATORS TƯƠNG THÍCH NGƯỢC =================
    public function getIDAttribute() { return $this->MaDatSan; }
    public function getIDNguoiDungAttribute() { return $this->MaNguoiDung; }
    public function getIDSanBongAttribute() { return $this->MaSanBong; }
    public function getIDKhungGioAttribute() { return $this->MaKhungGio; }
    public function getIDGiaiDauAttribute() { return $this->MaGiaiDau; }
    public function getIDNhanVienXuLyAttribute() { return $this->MaNhanVienXuLy; }

    public function getMaHoaDonDatSanAttribute()
    {
        if ($this->relationLoaded('chiTietHoaDon')) {
            return $this->chiTietHoaDon ? $this->chiTietHoaDon->MaHoaDonDatSan : null;
        }
        if ($this->relationLoaded('hoaDonDatSan')) {
            return $this->hoaDonDatSan ? $this->hoaDonDatSan->MaHoaDonDatSan : null;
        }
        return ChiTietHoaDon::where('MaDatSan', $this->MaDatSan)->value('MaHoaDonDatSan');
    }

    public function getTenKhachVangLaiAttribute() { return $this->TenNguoiDat; }
    public function getSDTKhachVangLaiAttribute() { return $this->SDTNguoiDat; }
    public function getEmailKhachVangLaiAttribute() { return $this->EmailNguoiDat; }
}