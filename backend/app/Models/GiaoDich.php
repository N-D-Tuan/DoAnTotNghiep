<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;
use App\Traits\GeneratesCustomId;

class GiaoDich extends Model
{
    use HasFactory, GeneratesCustomId;

    protected $table = 'GiaoDich';
    protected $primaryKey = 'MaGiaoDich';
    protected $idPrefix = 'GD';

    const CREATED_AT = 'NgayTao';
    const UPDATED_AT = null;

    protected $fillable = [
        'MaGiaoDich',
        'MaNguoiDung',
        'MaNhanVienXuLy',
        'LoaiGiaoDich',
        'DongTien',
        'SoTien',
        'SoDuTruoc',
        'SoDuSau',
        'NoiDung',
        'NgayTao',
    ];

    /**
     * Hàm này được Trait GeneratesCustomId gọi trực tiếp khi tạo bản ghi GiaoDich mới
     */
    public function generateCustomPrimaryKey(): string
    {
        if (empty($this->NgayTao)) {
            $this->NgayTao = Carbon::now('Asia/Ho_Chi_Minh');
        }

        return self::taoMaGiaoDich(
            $this->MaNguoiDung ?? null,
            $this->LoaiGiaoDich ?? null,
            $this->NgayTao
        );
    }

    /**
     * Hàm sinh Mã Giao Dịch có ý nghĩa:
     * Cấu trúc: GD + [3 số MaNguoiDung] + [Giờ Phút HHmm] + [Ngày DD]
     * Ví dụ: Khách ND002 giao dịch lúc 20:32 ngày 10 -> GD002203210
     */
    public static function taoMaGiaoDich(?string $maNguoiDung = null, ?string $loaiGiaoDich = null, $thoiGian = null): string
    {
        $now = $thoiGian
            ? Carbon::parse($thoiGian)->timezone('Asia/Ho_Chi_Minh')
            : Carbon::now('Asia/Ho_Chi_Minh');

        // 1. Trích xuất 3 ký tự số từ MaNguoiDung (VD: 'ND002' -> '002', 'ND15' -> '015')
        $rawUser = strtoupper(trim((string) $maNguoiDung));
        $digits = preg_replace('/\D/', '', $rawUser);
        if ($digits !== '') {
            $userCode = str_pad(substr($digits, -3), 3, '0', STR_PAD_LEFT);
        } else {
            // Dự phòng nếu MaNguoiDung không có số (VD: 'NDADMIN' -> 'ADM')
            $cleanAlpha = preg_replace('/^ND/i', '', preg_replace('/[^A-Z0-9]/', '', $rawUser));
            $userCode = str_pad(substr($cleanAlpha ?: '000', 0, 3), '0', STR_PAD_LEFT);
        }

        // 2. Lấy chuỗi thời gian: Giờ (H - 24h) + Phút (i) + Ngày (d) -> VD: 203210
        $timeCode = $now->format('Hid');

        // Ghép thành mã chuẩn: GD002203210
        $baseId = 'GD' . $userCode . $timeCode;

        // 3. Chống trùng khóa chính tuyệt đối nếu khách phát sinh 2 giao dịch trong cùng 1 phút
        $candidate = $baseId;
        if (DB::table('GiaoDich')->where('MaGiaoDich', $candidate)->exists()) {
            // Nối thêm 2 số Giây (s) -> VD: GD00220321036
            $candidate = $baseId . $now->format('s');
            $counter = 1;
            while (DB::table('GiaoDich')->where('MaGiaoDich', $candidate)->exists()) {
                $candidate = $baseId . $now->format('s') . $counter;
                $counter++;
            }
        }

        return $candidate;
    }

    public function nguoiDung()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNguoiDung', 'MaNguoiDung');
    }

    public function nhanVienXuLy()
    {
        return $this->belongsTo(NguoiDung::class, 'MaNhanVienXuLy', 'MaNguoiDung');
    }

    // Quan hệ 1-1 với HoaDonDatSan
    public function hoaDonDatSan()
    {
        return $this->hasOne(HoaDonDatSan::class, 'MaGiaoDich', 'MaGiaoDich');
    }
}