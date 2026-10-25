<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Carbon\Carbon;
use App\Models\DatSan;
use App\Models\HoaDonDatSan;
use App\Models\ChiTietHoaDon;
use App\Models\KhuyenMai;
use App\Models\NguoiDung;
use App\Models\GiaoDich;
use App\Models\GiaiDau;
use App\Models\KhungGio;
use App\Models\SanBong;
use App\Models\ThongBao;

class DatSanController extends Controller
{
    // Tỷ lệ thuế VAT hiển thị trên Hóa đơn: 8% (0.08)
    const VAT_RATE = 0.08;

    /**
     * Tính thuế VAT 8% và luôn làm tròn xuống hàng nghìn (VD: 17000 -> 17000, 17350 -> 17000, 17890 -> 17000)
     */
    public static function tinhThueVATLamTronDuoi($soTienSauGiam)
    {
        $rawVat = max(0, (float) $soTienSauGiam) * self::VAT_RATE;
        return (float) (floor($rawVat / 1000) * 1000);
    }

    /**
     * Hàm phụ trợ: Gom nhóm mảng slots theo từng Cụm sân (MaCumSan)
     * Đảm bảo mỗi Cụm sân sẽ được tách thành 1 Hóa đơn (HoaDonDatSan) độc lập
     */
    public static function gomNhomSlotsTheoCumSan(array $slots)
    {
        $groups = [];
        foreach ($slots as $slot) {
            $clusterId = $slot['clusterId'] ?? null;
            $clusterName = $slot['clusterName'] ?? '';

            if (!$clusterId && !empty($slot['pitchId'])) {
                $sb = SanBong::with('cumSan')->find($slot['pitchId']);
                if ($sb) {
                    $clusterId = $sb->MaCumSan;
                    if (!$clusterName && $sb->cumSan) {
                        $clusterName = $sb->cumSan->TenCumSan;
                    }
                }
            }

            $key = $clusterId ?: 'UNKNOWN';
            if (!isset($groups[$key])) {
                $groups[$key] = [
                    'ma_cum_san'  => $key,
                    'ten_cum_san' => $clusterName ?: ('Cụm sân #' . $key),
                    'slots'       => []
                ];
            }
            $groups[$key]['slots'][] = $slot;
        }
        return $groups;
    }

    /**
     * Hàm dùng chung: Kiểm tra Mã Khuyến Mãi (trước VAT) và tính Thuế VAT + Tổng tiền cho 1 Hóa đơn Cụm sân
     */
    public static function tinhToanKhuyenMaiVaVAT($tongTienGoc, $maKhuyenMai = null, $maNguoiDung = null, $slots = [], $maCumSanHoaDon = null)
    {
        $soTienGiam = 0;
        $khuyenMaiHopLe = null;
        $tongTienGoc = (float) $tongTienGoc;

        if ($maKhuyenMai) {
            $km = KhuyenMai::with('nguoiDung.cumSan')
                ->where('MaKhuyenMai', $maKhuyenMai)
                ->lockForUpdate()
                ->first();

            if (!$km) {
                throw new \Exception("Mã khuyến mãi #{$maKhuyenMai} không tồn tại!");
            }
            if ($km->TrangThai !== 'DangApDung' || now()->lt(Carbon::parse($km->NgayBatDau)) || now()->gt(Carbon::parse($km->NgayKetThuc))) {
                throw new \Exception("Mã khuyến mãi #{$maKhuyenMai} đã hết hạn hoặc ngừng áp dụng!");
            }
            if ($km->SoLuongDaDung >= $km->SoLuong) {
                throw new \Exception("Mã khuyến mãi #{$maKhuyenMai} đã hết lượt sử dụng!");
            }

            $nguoiSoHuu = $km->nguoiDung;

            if ($km->MaNguoiDung !== null && $nguoiSoHuu) {
                if ($nguoiSoHuu->VaiTro === 'QuanLySan') {
                    // ĐÂY LÀ MÃ RIÊNG CỦA CỤM SÂN
                    $maCumSanApDung = $nguoiSoHuu->MaCumSan;
                    $tenCumSan = $nguoiSoHuu->cumSan ? $nguoiSoHuu->cumSan->TenCumSan : $maCumSanApDung;

                    if ($maCumSanHoaDon && (string) $maCumSanHoaDon !== (string) $maCumSanApDung) {
                        throw new \Exception("Mã khuyến mãi [{$km->TenKhuyenMai}] chỉ áp dụng riêng cho [{$tenCumSan}], không thể áp dụng cho cụm sân khác!");
                    }
                } elseif ($nguoiSoHuu->VaiTro === 'KhachHang') {
                    // ĐÂY LÀ MÃ TẶNG RIÊNG CHO 1 KHÁCH HÀNG
                    if ((string) $km->MaNguoiDung !== (string) $maNguoiDung) {
                        throw new \Exception("Mã khuyến mãi [{$km->TenKhuyenMai}] dành riêng cho khách hàng khác, bạn không có quyền sử dụng!");
                    }
                }
            }

            // Kiểm tra điều kiện tối thiểu trên Tổng tiền sân gốc của Hóa đơn cụm sân này
            if ($tongTienGoc < (float) $km->GiaTriHoaDonToiThieu) {
                throw new \Exception("Tổng tiền sân của cụm sân phải đạt tối thiểu " . number_format($km->GiaTriHoaDonToiThieu, 0, ',', '.') . "đ mới được áp dụng mã [{$km->TenKhuyenMai}]!");
            }

            // Tính số tiền được giảm
            if ($km->LoaiKhuyenMai === 'PhanTram') {
                $soTienGiam = round($tongTienGoc * ((float) $km->GiaTri / 100));
                if ((float) $km->GiaTriToiDa > 0 && $soTienGiam > (float) $km->GiaTriToiDa) {
                    $soTienGiam = (float) $km->GiaTriToiDa;
                }
            } else {
                $soTienGiam = (float) $km->GiaTri;
            }

            $soTienGiam = min($tongTienGoc, $soTienGiam);
            $khuyenMaiHopLe = $km;
        }

        $tienSauGiam = max(0, $tongTienGoc - $soTienGiam);
        $thueVAT = self::tinhThueVATLamTronDuoi($tienSauGiam);
        $tongTienHoaDon = $tienSauGiam + $thueVAT;

        return [
            'khuyen_mai'        => $khuyenMaiHopLe,
            'tong_tien_goc'     => $tongTienGoc,
            'so_tien_giam'      => $soTienGiam,
            'tien_sau_giam'     => $tienSauGiam,
            'thue_vat'          => $thueVAT,
            'tong_tien_hoa_don' => $tongTienHoaDon,
        ];
    }

    /**
     * 1. KHÁCH HÀNG ĐẶT SÂN ONLINE
     *    - Tự động tách Hóa đơn (HoaDonDatSan) theo từng Cụm sân
     *    - Hỗ trợ:
     *      + Áp 1 Mã Toàn hệ thống / Mã Cá nhân cho toàn bộ giỏ hàng (xét điều kiện trên Tổng giỏ & phân bổ tiền giảm theo tỷ lệ từng Cụm sân)
     *      + Hoặc áp Mã riêng cho từng Cụm sân (mỗi Cụm sân 1 mã riêng)
     */
    public function datSan(Request $request)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()->MaNguoiDung);

        if ($user && $user->TrangThaiKhoa) {
            return response()->json([
                'success' => false,
                'message' => 'Tài khoản của bạn đã bị hạn chế chức năng đặt sân do vi phạm quy định. Vui lòng liên hệ Hotline để được hỗ trợ!'
            ]);
        }

        $slots = $request->slots;
        $purpose = $request->purpose; // 'normal' hoặc MaGiaiDau
        $maKhuyenMaiToanGio = $request->input('ma_khuyen_mai', null);
        $khuyenMaiTheoCum = $request->input('khuyen_mai_theo_cum', []);

        if (!$slots || count($slots) == 0) {
            return response()->json(['success' => false, 'message' => 'Giỏ hàng trống!']);
        }

        if ($purpose !== 'normal') {
            if (count($slots) < 5) {
                return response()->json([
                    'success' => false,
                    'message' => 'Theo quy định, tổ chức giải đấu phải đặt tối thiểu 5 khung giờ!'
                ]);
            }

            $giaiDau = GiaiDau::find($purpose);
            if (!$giaiDau) {
                return response()->json(['success' => false, 'message' => 'Không tìm thấy thông tin giải đấu!']);
            }

            $ngayHetHan = Carbon::parse($giaiDau->NgayDuyet)->addDays(3);
            if (now()->greaterThan($ngayHetHan)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Giải đấu đã quá hạn 3 ngày kể từ lúc được duyệt. Bạn không thể đặt sân cho giải này nữa!'
                ]);
            }
        }

        // 1. TÍNH TỔNG TIỀN SÂN GỐC & TIỀN CỌC TOÀN GIỎ HÀNG
        $tongTienGocToanGio = array_reduce($slots, function ($carry, $slot) {
            return $carry + (float) $slot['price'];
        }, 0);

        $tyLeCoc = ($purpose === 'normal') ? 0.3 : 0.5;
        $tongTienCocToanGio = $tongTienGocToanGio * $tyLeCoc;

        // 2. KIỂM TRA SỐ DƯ VÍ
        if ($user->SoDuVi < $tongTienCocToanGio) {
            return response()->json([
                'success' => false,
                'message' => 'Số dư ví không đủ (' . number_format($user->SoDuVi) . 'đ). Vui lòng nạp thêm tối thiểu ' . number_format($tongTienCocToanGio - $user->SoDuVi) . 'đ để cọc!'
            ]);
        }

        // 3. GOM NHÓM CÁC SLOTS THEO TỪNG CỤM SÂN
        $clusterGroups = self::gomNhomSlotsTheoCumSan($slots);

        DB::beginTransaction();
        try {
            // BƯỚC A: KIỂM TRA TRÙNG LỊCH TOÀN BỘ SLOTS TRƯỚC KHI TẠO HÓA ĐƠN
            $failed_slots = [];
            $failed_messages = [];

            foreach ($slots as $slot) {
                $ngayDa = Carbon::createFromFormat('d/m/Y', $slot['date'])->format('Y-m-d');
                $gioBatDau = explode(' - ', $slot['time'])[0] . ':00';

                $khungGio = KhungGio::where('GioBatDau', $gioBatDau)->first();
                if (!$khungGio) {
                    throw new \Exception("Lỗi dữ liệu khung giờ: {$slot['time']}");
                }

                $daDat = DatSan::where('MaSanBong', $slot['pitchId'])
                               ->where('NgayDa', $ngayDa)
                               ->where('MaKhungGio', $khungGio->MaKhungGio)
                               ->where('TrangThai', '!=', 'DaHuy')
                               ->lockForUpdate()
                               ->first();

                if ($daDat) {
                    $failed_slots[] = $slot['id'] ?? null;
                    $failed_messages[] = "[{$slot['time']} ngày {$slot['date']}]";
                }
            }

            if (!empty($failed_slots)) {
                DB::rollBack();
                $msg_gop = implode(', ', $failed_messages);
                return response()->json([
                    'success'         => false,
                    'message'         => "Rất tiếc! Các khung giờ sau vừa bị khách khác đặt mất: {$msg_gop}. Hệ thống đã tự động gỡ chúng khỏi giỏ hàng!",
                    'failed_slot_ids' => $failed_slots
                ]);
            }

            // BƯỚC B: TẠO GIAO DỊCH TRỪ TIỀN CỌC TỪ VÍ
            $soDuTruoc = $user->SoDuVi;
            $soDuSau = $soDuTruoc - $tongTienCocToanGio;
            $soCumSan = count($clusterGroups);

            $giaoDich = GiaoDich::create([
                'MaNguoiDung'  => $user->MaNguoiDung,
                'LoaiGiaoDich' => 'DatSan',
                'DongTien'     => 'Tru',
                'SoTien'       => $tongTienCocToanGio,
                'SoDuTruoc'    => $soDuTruoc,
                'SoDuSau'      => $soDuSau,
                'NoiDung'      => "Thanh toán cọc đặt sân (" . count($slots) . " khung giờ" . ($soCumSan > 1 ? " - {$soCumSan} cụm sân" : "") . ")"
            ]);

            $user->update(['SoDuVi' => $soDuSau]);

            // BƯỚC C: XỬ LÝ NẾU KHÁCH CHỌN 1 MÃ TOÀN HỆ THỐNG HOẶC MÃ CÁ NHÂN ÁP CHO CẢ GIỎ HÀNG
            $kmToanGioObj = null;
            $tongGiamToanGio = 0;

            if ($maKhuyenMaiToanGio) {
                $checkKM = KhuyenMai::with('nguoiDung')->where('MaKhuyenMai', $maKhuyenMaiToanGio)->lockForUpdate()->first();
                if ($checkKM && $checkKM->MaNguoiDung && $checkKM->nguoiDung && $checkKM->nguoiDung->VaiTro === 'QuanLySan') {
                    // Nếu mã gửi lên ở biến chung thực chất là mã của 1 Cụm sân -> Chuyển nó vào khuyen_mai_theo_cum của đúng Cụm đó
                    $khuyenMaiTheoCum[$checkKM->nguoiDung->MaCumSan] = $maKhuyenMaiToanGio;
                    $maKhuyenMaiToanGio = null;
                } else {
                    // Đây là Mã Toàn hệ thống hoặc Mã Cá nhân -> Xét điều kiện dựa trên TỔNG TIỀN TOÀN GIỎ HÀNG ($tongTienGocToanGio)
                    $calcGlobal = self::tinhToanKhuyenMaiVaVAT($tongTienGocToanGio, $maKhuyenMaiToanGio, $user->MaNguoiDung, $slots, null);
                    $kmToanGioObj = $calcGlobal['khuyen_mai'];
                    $tongGiamToanGio = (float) $calcGlobal['so_tien_giam'];

                    // Chỉ cộng 1 lượt dùng duy nhất cho mã Toàn hệ thống / Cá nhân này dù tách thành 2 hay 3 hóa đơn!
                    if ($kmToanGioObj) {
                        $kmToanGioObj->increment('SoLuongDaDung');
                        if ($kmToanGioObj->SoLuongDaDung >= $kmToanGioObj->SoLuong) {
                            $kmToanGioObj->update(['TrangThai' => 'HetHan']);
                        }
                    }
                }
            }

            // Nếu dùng khuyen_mai_theo_cum (mỗi cụm sân chọn 1 mã riêng), kiểm tra không được chọn trùng 1 mã cho 2 cụm
            if (!$kmToanGioObj && !empty($khuyenMaiTheoCum)) {
                $usedCodes = [];
                foreach ($khuyenMaiTheoCum as $cKey => $code) {
                    if (!$code) continue;
                    if (in_array($code, $usedCodes)) {
                        throw new \Exception("Mã khuyến mãi #{$code} chỉ được áp dụng 1 lần trong cùng đơn hàng!");
                    }
                    $usedCodes[] = $code;
                }
            }

            // BƯỚC D: TẠO TỪNG HÓA ĐƠN RIÊNG CHO TỪNG CỤM SÂN
            $danhSachMaHoaDon = [];
            $cacVeVuaTao = [];
            $htmlTatCaHoaDonEmail = '';

            $tongGiamDaPhanBo = 0;
            $groupKeys = array_keys($clusterGroups);
            $lastGroupKey = end($groupKeys);

            foreach ($clusterGroups as $maCumSan => $groupInfo) {
                $clusterSlots = $groupInfo['slots'];
                $tongTienGocCum = array_reduce($clusterSlots, fn($c, $s) => $c + (float) $s['price'], 0);

                $maKMLuuHoaDon = null;
                $soTienGiamCumNay = 0;

                if ($kmToanGioObj) {
                    // TRƯỜNG HỢP 1: Đang áp 1 Mã Toàn hệ thống / Cá nhân cho toàn giỏ -> Phân bổ tiền giảm theo tỷ lệ tiền sân của Cụm này
                    $maKMLuuHoaDon = $kmToanGioObj->MaKhuyenMai;
                    if ($tongTienGocToanGio > 0 && $tongGiamToanGio > 0) {
                        if ($maCumSan === $lastGroupKey) {
                            $soTienGiamCumNay = max(0, $tongGiamToanGio - $tongGiamDaPhanBo);
                        } else {
                            $soTienGiamCumNay = round($tongGiamToanGio * ($tongTienGocCum / $tongTienGocToanGio));
                            $tongGiamDaPhanBo += $soTienGiamCumNay;
                        }
                        $soTienGiamCumNay = min($tongTienGocCum, $soTienGiamCumNay);
                    }
                } else {
                    // TRƯỜNG HỢP 2: Áp mã riêng theo từng Cụm sân (khuyen_mai_theo_cum)
                    $maKMChoCumNay = $khuyenMaiTheoCum[$maCumSan] ?? null;
                    if ($maKMChoCumNay) {
                        $calcCum = self::tinhToanKhuyenMaiVaVAT($tongTienGocCum, $maKMChoCumNay, $user->MaNguoiDung, $clusterSlots, $maCumSan);
                        $kmCumObj = $calcCum['khuyen_mai'];
                        if ($kmCumObj) {
                            $kmCumObj->increment('SoLuongDaDung');
                            if ($kmCumObj->SoLuongDaDung >= $kmCumObj->SoLuong) {
                                $kmCumObj->update(['TrangThai' => 'HetHan']);
                            }
                            $maKMLuuHoaDon = $kmCumObj->MaKhuyenMai;
                            $soTienGiamCumNay = (float) $calcCum['so_tien_giam'];
                        }
                    }
                }

                // Tính tiền sau giảm và Thuế VAT 8% của Hóa đơn Cụm sân này
                $tienSauGiamCum = max(0, $tongTienGocCum - $soTienGiamCumNay);
                $thueVATCum     = self::tinhThueVATLamTronDuoi($tienSauGiamCum);
                $tongTienHDCum  = $tienSauGiamCum + $thueVATCum;

                $hoaDon = HoaDonDatSan::create([
                    'MaNguoiDung'         => $user->MaNguoiDung,
                    'MaGiaoDich'          => $giaoDich->MaGiaoDich,
                    'MaKhuyenMai'         => $maKMLuuHoaDon,
                    'TongTien'            => $tongTienHDCum,
                    'ThueVAT'             => $thueVATCum,
                    'PhuongThucThanhToan' => 'ViDienTu',
                    'TrangThai'           => 'DaCoc'
                ]);

                $danhSachMaHoaDon[] = $hoaDon->MaHoaDonDatSan;
                $cacVeCuaHoaDonNay = [];

                foreach ($clusterSlots as $slot) {
                    $ngayDa = Carbon::createFromFormat('d/m/Y', $slot['date'])->format('Y-m-d');
                    $gioBatDau = explode(' - ', $slot['time'])[0] . ':00';
                    $khungGio = KhungGio::where('GioBatDau', $gioBatDau)->first();

                    $giaKhungGio = (float) $slot['price'];
                    $cocKhungGio = $giaKhungGio * $tyLeCoc;

                    $veMoi = DatSan::create([
                        'MaNguoiDung' => $user->MaNguoiDung,
                        'MaSanBong'   => $slot['pitchId'],
                        'MaKhungGio'  => $khungGio->MaKhungGio,
                        'MaGiaiDau'   => ($purpose !== 'normal') ? $purpose : null,
                        'NgayDa'      => $ngayDa,
                        'TongTien'    => $giaKhungGio,
                        'TienCoc'     => $cocKhungGio,
                        'TrangThai'   => 'DaCoc'
                    ]);

                    ChiTietHoaDon::create([
                        'MaHoaDonDatSan' => $hoaDon->MaHoaDonDatSan,
                        'MaDatSan'       => $veMoi->MaDatSan,
                        'DonGia'         => $giaKhungGio,
                    ]);

                    $thongTinVe = [
                        'maHoaDon' => $hoaDon->MaHoaDonDatSan,
                        'maVe'     => ($purpose !== 'normal') ? ('GD-' . $purpose) : ('PT-' . $veMoi->MaDatSan),
                        'tenSan'   => $slot['pitchName'] ?? 'Sân bóng',
                        'cumSan'   => $slot['clusterName'] ?? $groupInfo['ten_cum_san'],
                        'ngay'     => $slot['date'],
                        'gio'      => $slot['time'],
                        'donGia'   => number_format($giaKhungGio, 0, ',', '.') . 'đ',
                        'tienCoc'  => number_format($cocKhungGio, 0, ',', '.') . 'đ',
                        'conLai'   => number_format($giaKhungGio - $cocKhungGio, 0, ',', '.') . 'đ'
                    ];

                    $cacVeCuaHoaDonNay[] = $thongTinVe;
                    $cacVeVuaTao[] = $thongTinVe;
                }

                $hoaDon->load(['datSans', 'khuyenMai']);
                $htmlTatCaHoaDonEmail .= self::buildEmailHoaDonHtml($hoaDon, $user->HoTen, $user->SoDienThoai, $cacVeCuaHoaDonNay, $soTienGiamCumNay);
            }

            if ($purpose !== 'normal') {
                $giaiDau = GiaiDau::find($purpose);
                if ($giaiDau) {
                    $giaiDau->update(['TrangThai' => 'HetHan']);
                }
            }

            DB::commit();

            if ($user->Email && !str_ends_with($user->Email, '.offline')) {
                try {
                    $htmlVe = '';
                    foreach ($cacVeVuaTao as $ve) {
                        $qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=6&data=" . urlencode($ve['maVe']);
                        $htmlVe .= "
                            <div style='border:1px solid #cbd5e1; padding:16px; margin-bottom:15px; border-radius:10px; display:flex; align-items:center; justify-content:space-between; background:#ffffff;'>
                                <div style='padding-right:15px;'>
                                    <h3 style='margin:0 0 10px 0; color:#10B981; font-size:18px;'>Mã vé: #{$ve['maVe']} <span style='font-size:13px; color:#475569;'>(HĐ #{$ve['maHoaDon']})</span></h3>
                                    <p style='margin:4px 0;'><strong>Sân:</strong> {$ve['tenSan']} ({$ve['cumSan']})</p>
                                    <p style='margin:4px 0;'><strong>Ngày:</strong> {$ve['ngay']} | <strong>Giờ:</strong> {$ve['gio']}</p>
                                    <hr style='border:0; border-top:1px dashed #cbd5e1; margin:10px 0;'/>
                                    <p style='margin:4px 0;'><strong>Đã cọc:</strong> {$ve['tienCoc']}</p>
                                </div>
                                <div style='text-align:center; border-left:1px dashed #cbd5e1; padding-left:15px;'>
                                    <img src='{$qrUrl}' alt='QR {$ve['maVe']}' style='width:120px; height:120px; display:block; margin:0 auto; border:1px solid #e2e8f0; border-radius:8px;' />
                                    <div style='font-size:11px; color:#64748b; margin-top:5px;'>Quét mã khi đến sân</div>
                                </div>
                            </div>
                        ";
                    }
                    $dsMaHDStr = implode(', #', $danhSachMaHoaDon);
                    Mail::html("<h2>Xác nhận đặt sân & Hóa đơn điện tử - DN Football</h2><p>Chào <strong>{$user->HoTen}</strong>, cảm ơn bạn đã đặt sân. Dưới đây là <strong>Hóa đơn đặt sân (#{$dsMaHDStr})</strong> và <strong>Vé điện tử QR Code</strong> của bạn:</p>{$htmlTatCaHoaDonEmail}<h3 style='margin-top:24px; color:#0f172a;'>Danh sách Vé Điện Tử (Check-in tại sân):</h3>{$htmlVe}", function ($message) use ($user, $dsMaHDStr) {
                        $message->to($user->Email)->subject("Hóa Đơn #{$dsMaHDStr} & Vé Điện Tử - DN Football");
                    });
                } catch (\Exception $mailEx) {}
            }

            broadcast(new \App\Events\AdminDataUpdated())->toOthers();
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            $msgThanhCong = count($danhSachMaHoaDon) > 1
                ? 'Đặt sân thành công! Hệ thống đã tự động tách thành ' . count($danhSachMaHoaDon) . ' hóa đơn riêng theo từng Cụm sân.'
                : 'Đặt sân thành công! Số dư đã được trừ.';

            return response()->json([
                'success'     => true,
                'message'     => $msgThanhCong,
                'ma_hoa_don'  => $danhSachMaHoaDon[0] ?? null,
                'ma_hoa_dons' => $danhSachMaHoaDon,
                'data'        => $cacVeVuaTao
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => $e->getMessage()]);
        }
    }

    public function layDanhSachDaDat(Request $request)
    {
        $maSanBong = $request->query('ma_san_bong', $request->query('id_san_bong'));

        $daDat = DatSan::where('MaSanBong', $maSanBong)
                       ->where('TrangThai', '!=', 'DaHuy')
                       ->get(['NgayDa', 'MaKhungGio'])
                       ->map(function ($item) {
                           return [
                               'NgayDa'      => $item->NgayDa,
                               'MaKhungGio'  => $item->MaKhungGio,
                               'ID_KhungGio' => $item->MaKhungGio,
                            ];
                       });

        return response()->json([
            'success' => true,
            'data'    => $daDat
        ]);
    }

    public function layDanhSachCuaToi(Request $request)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()->MaNguoiDung);

        $danhSach = DatSan::with(['sanBong.cumSan', 'khungGio', 'giaiDau', 'danhGia', 'chiTietHoaDon', 'hoaDonDatSan.khuyenMai'])
                        ->where('MaNguoiDung', $user->MaNguoiDung)
                        ->orderBy('NgayDa', 'desc')
                        ->get();

        return response()->json(['success' => true, 'data' => $danhSach]);
    }

    public function huySanPhongTrao(Request $request, $id)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()->MaNguoiDung);

        $datSan = DatSan::with(['khungGio', 'sanBong', 'chiTietHoaDon'])
                        ->where('MaDatSan', $id)
                        ->where('MaNguoiDung', $user->MaNguoiDung)
                        ->first();

        if (!$datSan) return response()->json(['success' => false, 'message' => 'Không tìm thấy lịch đặt!']);
        if ($datSan->MaGiaiDau != null) return response()->json(['success' => false, 'message' => 'Đây là lịch đá giải. Vui lòng hủy theo toàn bộ giải đấu!']);
        if ($datSan->TrangThai !== 'DaCoc') return response()->json(['success' => false, 'message' => 'Chỉ có thể hủy tự động đối với sân ở trạng thái Đã cọc!']);

        $thoiGianDa = Carbon::parse($datSan->NgayDa . ' ' . $datSan->khungGio->GioBatDau);
        if (now()->diffInHours($thoiGianDa, false) < 10) {
            return response()->json(['success' => false, 'message' => 'Đã quá hạn hủy miễn phí (phải hủy trước 10 tiếng). Vui lòng tạo Yêu cầu hủy gấp!']);
        }

        DB::beginTransaction();
        try {
            $tienHoan = $datSan->TienCoc;
            $maHoaDon = $datSan->MaHoaDonDatSan;

            $datSan->update(['TrangThai' => 'DaHuy']);

            if ($maHoaDon) {
                self::dongBoHoaDonDatSan($maHoaDon);
            }

            $soDuTruoc = $user->SoDuVi;
            $soDuSau = $soDuTruoc + $tienHoan;
            $user->update(['SoDuVi' => $soDuSau]);

            GiaoDich::create([
                'MaNguoiDung'  => $user->MaNguoiDung,
                'LoaiGiaoDich' => 'HoanTienHuySan',
                'DongTien'     => 'Cong',
                'SoTien'       => $tienHoan,
                'SoDuTruoc'    => $soDuTruoc,
                'SoDuSau'      => $soDuSau,
                'NoiDung'      => "Hoàn cọc hủy sân phong trào: " . $datSan->sanBong->TenSan . " ngày " . Carbon::parse($datSan->NgayDa)->format('d/m/Y')
            ]);

            DB::commit();

            broadcast(new \App\Events\AdminDataUpdated())->toOthers();
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            return response()->json(['success' => true, 'message' => 'Hủy sân thành công! Tiền cọc đã được hoàn vào ví.']);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Lỗi hệ thống: ' . $e->getMessage()]);
        }
    }

    public function huySanGiaiDau(Request $request, $idGiaiDau)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()->MaNguoiDung);

        $giaiDau = GiaiDau::where('MaGiaiDau', $idGiaiDau)->where('MaNguoiDung', $user->MaNguoiDung)->first();
        if (!$giaiDau) return response()->json(['success' => false, 'message' => 'Không tìm thấy giải đấu!']);

        $danhSachDat = DatSan::with(['khungGio', 'chiTietHoaDon'])
                             ->where('MaGiaiDau', $idGiaiDau)
                             ->where('TrangThai', 'DaCoc')
                             ->get();

        if ($danhSachDat->isEmpty()) {
            return response()->json(['success' => false, 'message' => 'Giải đấu này không còn lịch đặt hợp lệ để hủy!']);
        }

        $tranSomNhat = $danhSachDat->sortBy(function($ds) {
            return Carbon::parse($ds->NgayDa . ' ' . $ds->khungGio->GioBatDau);
        })->first();

        $thoiGianDa = Carbon::parse($tranSomNhat->NgayDa . ' ' . $tranSomNhat->khungGio->GioBatDau);

        if (now()->diffInDays($thoiGianDa, false) < 7) {
            return response()->json(['success' => false, 'message' => 'Đã quá hạn hủy giải đấu miễn phí (phải trước 7 ngày khai mạc). Vui lòng tạo Yêu cầu hủy gấp!']);
        }

        DB::beginTransaction();
        try {
            $tongTienHoan = $danhSachDat->sum('TienCoc');
            $maHoaDonIds = $danhSachDat->pluck('MaHoaDonDatSan')->filter()->unique();

            DatSan::where('MaGiaiDau', $idGiaiDau)->where('TrangThai', 'DaCoc')->update(['TrangThai' => 'DaHuy']);
            $giaiDau->update(['TrangThai' => 'DaHuy']);

            foreach ($maHoaDonIds as $maHD) {
                self::dongBoHoaDonDatSan($maHD);
            }

            $soDuTruoc = $user->SoDuVi;
            $soDuSau = $soDuTruoc + $tongTienHoan;
            $user->update(['SoDuVi' => $soDuSau]);

            GiaoDich::create([
                'MaNguoiDung'  => $user->MaNguoiDung,
                'LoaiGiaoDich' => 'HoanTienHuySan',
                'DongTien'     => 'Cong',
                'SoTien'       => $tongTienHoan,
                'SoDuTruoc'    => $soDuTruoc,
                'SoDuSau'      => $soDuSau,
                'NoiDung'      => "Hoàn cọc hủy toàn bộ giải đấu: " . $giaiDau->TenGiaiDau
            ]);

            DB::commit();

            broadcast(new \App\Events\AdminDataUpdated())->toOthers();
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            return response()->json(['success' => true, 'message' => 'Hủy giải đấu thành công! Toàn bộ cọc đã được hoàn vào ví.']);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Lỗi hệ thống: ' . $e->getMessage()]);
        }
    }

    public function layDanhSachAdmin(Request $request)
    {
        $userDangNhap = auth()->user();

        $query = DatSan::with(['nguoiDung', 'nhanVienXuLy', 'sanBong.cumSan', 'khungGio', 'giaiDau', 'chiTietHoaDon', 'hoaDonDatSan.khuyenMai']);

        if ($userDangNhap->VaiTro === 'QuanLySan') {
            $query->whereHas('sanBong', function ($q) use ($userDangNhap) {
                $q->where('MaCumSan', $userDangNhap->MaCumSan);
            });
        }

        $danhSach = $query->orderBy('NgayDa', 'desc')
                          ->orderBy('MaKhungGio', 'asc')
                          ->get();

        return response()->json(['success' => true, 'data' => $danhSach]);
    }

    public function guiOtpHuySanGuest(Request $request, $id)
    {
        $datSan = DatSan::with(['sanBong.cumSan', 'khungGio'])->find($id);
        if (!$datSan) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy dữ liệu đặt sân!']);
        }

        if ($datSan->MaNguoiDung !== null) {
            return response()->json(['success' => false, 'message' => 'Đây là lịch của khách có tài khoản, không cần dùng OTP!']);
        }

        if ($datSan->TrangThai !== 'DaCoc') {
            return response()->json(['success' => false, 'message' => 'Chỉ có thể hủy sân đang ở trạng thái Đã cọc!']);
        }

        if (!$datSan->EmailNguoiDat) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy địa chỉ Email của khách vãng lai này!']);
        }

        $otp = (string) rand(100000, 999999);
        \Illuminate\Support\Facades\Cache::put('guest_cancel_otp_' . $datSan->MaDatSan, $otp, now()->addMinutes(5));

        $tenSan = $datSan->sanBong ? $datSan->sanBong->TenSan : 'Sân bóng';
        $cumSan = ($datSan->sanBong && $datSan->sanBong->cumSan) ? $datSan->sanBong->cumSan->TenCumSan : '';
        $ngayDa = date('d/m/Y', strtotime($datSan->NgayDa));
        $gioDa = $datSan->khungGio ? substr($datSan->khungGio->GioBatDau, 0, 5) . ' - ' . substr($datSan->khungGio->GioKetThuc, 0, 5) : '';
        $tienCoc = number_format($datSan->TienCoc, 0, ',', '.') . 'đ';

        try {
            $noiDungMail = "
                <h2>Mã xác thực (OTP) hủy lịch đặt sân</h2>
                <p>Chào <strong>{$datSan->TenNguoiDat}</strong>,</p>
                <p>Hệ thống DN Football vừa nhận được yêu cầu hủy lịch đặt sân và hoàn tiền cọc cho vé <strong>#PT-{$datSan->MaDatSan}</strong>:</p>
                <ul>
                    <li><strong>Sân:</strong> {$tenSan} ({$cumSan})</li>
                    <li><strong>Thời gian:</strong> {$gioDa} ngày {$ngayDa}</li>
                    <li><strong>Số tiền cọc hoàn trả:</strong> {$tienCoc}</li>
                </ul>
                <p>Mã OTP xác nhận hủy sân của bạn là: <strong style='font-size: 20px; color: #e11d48; letter-spacing: 2px;'>{$otp}</strong></p>
                <p><em>Lưu ý: Mã này có hiệu lực trong vòng 5 phút. Vui lòng đọc mã này cho nhân viên/quản lý sân để hoàn tất thủ tục hủy sân.</em></p>
            ";

            Mail::html($noiDungMail, function ($message) use ($datSan) {
                $message->to($datSan->EmailNguoiDat)
                        ->subject('Mã OTP Xác Nhận Hủy Sân - DN Football');
            });

            return response()->json([
                'success' => true,
                'message' => 'Đã gửi mã OTP (hiệu lực 5 phút) tới email: ' . $datSan->EmailNguoiDat
            ]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Lỗi gửi email OTP: ' . $e->getMessage()]);
        }
    }

    public function chotTrangThaiAdmin(Request $request, $id)
    {
        $userDangNhap = auth()->user();

        $request->validate(['trang_thai' => 'required|in:HoanThanh,KhongDen,DaHuy']);

        DB::beginTransaction();
        try {
            $datSan = DatSan::with(['sanBong.cumSan', 'khungGio', 'chiTietHoaDon', 'hoaDonDatSan'])->find($id);
            if (!$datSan) return response()->json(['success' => false, 'message' => 'Không tìm thấy dữ liệu đặt sân!']);

            if ($datSan->TrangThai !== 'DaCoc') {
                return response()->json(['success' => false, 'message' => 'Chỉ có thể chốt trạng thái đối với sân Đã cọc!']);
            }

            $tenSan = $datSan->sanBong ? $datSan->sanBong->TenSan : 'Sân bóng';
            $cumSan = ($datSan->sanBong && $datSan->sanBong->cumSan) ? $datSan->sanBong->cumSan->TenCumSan : '';
            $ngayDa = date('d/m/Y', strtotime($datSan->NgayDa));
            $gioDa = $datSan->khungGio ? substr($datSan->khungGio->GioBatDau, 0, 5) . ' - ' . substr($datSan->khungGio->GioKetThuc, 0, 5) : '';

            $phuongThucHoan = $request->input('phuong_thuc_hoan', 'vi'); // 'vi' | 'chuyen_khoan'
            $thongTinCK = '';

            if ($request->trang_thai === 'DaHuy') {
                if ($datSan->MaNguoiDung !== null) {
                    $user = NguoiDung::find($datSan->MaNguoiDung);
                    if ($user) {
                        $tienHoan = $datSan->TienCoc;
                        $soDuTruoc = $user->SoDuVi;

                        if ($phuongThucHoan === 'chuyen_khoan') {
                            $nganHang = trim($request->input('ngan_hang', ''));
                            $soTaiKhoan = trim($request->input('so_tai_khoan', ''));
                            $chuTaiKhoan = strtoupper(trim($request->input('chu_tai_khoan', '')));

                            if (!$nganHang || !$soTaiKhoan || !$chuTaiKhoan) {
                                DB::rollBack();
                                return response()->json([
                                    'success' => false,
                                    'message' => 'Vui lòng nhập đầy đủ Tên ngân hàng, Số tài khoản và Tên chủ tài khoản để hoàn tiền chuyển khoản!'
                                ]);
                            }

                            if ($tienHoan > 0) {
                                DB::rollBack(); // Chưa hủy sân ngay, chờ VNPay trả về thành công mới hủy!
                                $returnPage = $request->input('return_url') ?: 'http://127.0.0.1:5500/html/admin.html';
                                $vnpayUrl = self::taoUrlVnPayHoanTienDatHo($request, [
                                    'type'               => 'single',
                                    'ma_dat_san'         => $datSan->MaDatSan,
                                    'ma_nhan_vien_xu_ly' => $userDangNhap->MaNguoiDung,
                                    'ngan_hang'          => $nganHang,
                                    'so_tai_khoan'       => $soTaiKhoan,
                                    'chu_tai_khoan'      => $chuTaiKhoan,
                                    'return_page'        => $returnPage,
                                ], $tienHoan, "Hoan tien coc dat san " . $datSan->MaDatSan);

                                return response()->json([
                                    'success'   => true,
                                    'vnpay_url' => $vnpayUrl,
                                    'message'   => 'Đang chuyển hướng sang cổng VNPay để hoàn tiền...'
                                ]);
                            }
                        } else {
                            $soDuSau = $soDuTruoc + $tienHoan;
                            $user->update(['SoDuVi' => $soDuSau]);

                            if ($tienHoan > 0) {
                                GiaoDich::create([
                                    'MaNguoiDung'    => $user->MaNguoiDung,
                                    'MaNhanVienXuLy' => $userDangNhap->MaNguoiDung,
                                    'LoaiGiaoDich'   => 'HoanTienHuySan',
                                    'DongTien'       => 'Cong',
                                    'SoTien'         => $tienHoan,
                                    'SoDuTruoc'      => $soDuTruoc,
                                    'SoDuSau'        => $soDuSau,
                                    'NoiDung'        => "Hỗ trợ hủy lịch gấp và hoàn cọc vào ví: " . $tenSan
                                ]);
                            }
                        }
                    }
                } else {
                    $otpInput = trim($request->input('otp', ''));
                    $cachedOtp = \Illuminate\Support\Facades\Cache::get('guest_cancel_otp_' . $datSan->MaDatSan);

                    if (!$otpInput || !$cachedOtp || $otpInput !== (string) $cachedOtp) {
                        DB::rollBack();
                        return response()->json([
                            'success' => false,
                            'message' => 'Mã OTP không chính xác hoặc đã bị hết hạn!<br>Vui lòng kiểm tra lại.'
                        ]);
                    }

                    \Illuminate\Support\Facades\Cache::forget('guest_cancel_otp_' . $datSan->MaDatSan);
                }
            }

            $maHoaDon = $datSan->MaHoaDonDatSan;

            $datSan->update([
                'TrangThai'      => $request->trang_thai,
                'MaNhanVienXuLy' => $userDangNhap->MaNguoiDung
            ]);

            if ($maHoaDon) {
                self::dongBoHoaDonDatSan($maHoaDon);
            }

            if ($datSan->MaGiaiDau != null) {
                $giaiDau = GiaiDau::find($datSan->MaGiaiDau);
                if ($giaiDau) {
                    $conTranDaCoc = DatSan::where('MaGiaiDau', $giaiDau->MaGiaiDau)
                                          ->where('TrangThai', 'DaCoc')
                                          ->exists();
                    if (!$conTranDaCoc) {
                        $coTranDaXong = DatSan::where('MaGiaiDau', $giaiDau->MaGiaiDau)
                                              ->whereIn('TrangThai', ['HoanThanh', 'KhongDen'])
                                              ->exists();
                        $giaiDau->update(['TrangThai' => $coTranDaXong ? 'HoanThanh' : 'DaHuy']);
                    }
                }
            }
            
            if ($datSan->MaNguoiDung !== null) {
                $tieuDe = '';
                $noiDung = '';

                if ($request->trang_thai === 'HoanThanh') {
                    $tieuDe = 'Trận đấu đã hoàn thành';
                    $noiDung = "Trận đấu tại {$tenSan} lúc {$gioDa} ngày {$ngayDa} đã hoàn tất. Cảm ơn bạn đã sử dụng dịch vụ!";
                } else if ($request->trang_thai === 'KhongDen') {
                    $tieuDe = 'Vắng mặt và mất cọc';
                    $noiDung = "Hệ thống ghi nhận bạn đã không đến nhận sân tại {$tenSan} lúc {$gioDa} ngày {$ngayDa}. Tiền cọc của lịch đặt này sẽ không được hoàn lại theo quy định.";
                } else if ($request->trang_thai === 'DaHuy') {
                    $tieuDe = 'Lịch đặt sân đã bị hủy';
                    $hinhThucStr = ($phuongThucHoan === 'chuyen_khoan')
                        ? "đã được hoàn trả qua chuyển khoản ngân hàng{$thongTinCK}."
                        : "đã được hoàn lại vào ví của bạn.";
                    $noiDung = "Ban quản lý đã hỗ trợ hủy lịch đặt sân tại {$tenSan} lúc {$gioDa} ngày {$ngayDa}. Số tiền cọc " . number_format($datSan->TienCoc, 0, ',', '.') . "đ {$hinhThucStr}";
                }

                ThongBao::create([
                    'MaNguoiDung'  => $datSan->MaNguoiDung,
                    'TieuDe'       => $tieuDe,
                    'NoiDung'      => $noiDung,
                    'LoaiThongBao' => 'DatSan'
                ]);
            } else if ($request->trang_thai === 'DaHuy' && $datSan->EmailNguoiDat) {
                try {
                    $tienCocStr = number_format($datSan->TienCoc, 0, ',', '.') . 'đ';
                    $mailHuy = "
                        <h2>Xác nhận hủy lịch đặt sân thành công</h2>
                        <p>Chào <strong>{$datSan->TenNguoiDat}</strong>,</p>
                        <p>Lịch đặt sân <strong>#PT-{$datSan->MaDatSan}</strong> tại <strong>{$tenSan} ({$cumSan})</strong> lúc <strong>{$gioDa} ngày {$ngayDa}</strong> đã được hủy thành công theo yêu cầu của bạn.</p>
                        <p><strong>Số tiền cọc hoàn lại:</strong> <span style='color:#10b981; font-weight:bold;'>{$tienCocStr}</span></p>
                        <p>Cảm ơn bạn đã sử dụng dịch vụ của DN Football!</p>
                    ";
                    Mail::html($mailHuy, function ($message) use ($datSan) {
                        $message->to($datSan->EmailNguoiDat)
                                ->subject('Xác nhận hủy vé đặt sân #PT-' . $datSan->MaDatSan . ' - DN Football');
                    });
                } catch (\Exception $mailEx) {
                    \Illuminate\Support\Facades\Log::error('Lỗi gửi mail hủy sân khách vãng lai: ' . $mailEx->getMessage());
                }
            }

            DB::commit();

            if ($datSan->MaNguoiDung !== null) {
                broadcast(new \App\Events\UserDataUpdated($datSan->MaNguoiDung))->toOthers();
            }
            broadcast(new \App\Events\AdminDataUpdated())->toOthers();
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            return response()->json(['success' => true, 'message' => 'Đã cập nhật trạng thái sân thành công!']);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Lỗi hệ thống: ' . $e->getMessage()]);
        }
    }

    /**
     * 2. ADMIN / QUẢN LÝ / NHÂN VIÊN ĐẶT SÂN HỘ (Tự động tách Hóa đơn theo từng Cụm sân)
     */
    public function datSanOffline(Request $request)
    {
        $userDangNhap = auth()->user();
        if (!in_array($userDangNhap->VaiTro, ['Admin', 'QuanLySan', 'NhanVien'])) {
            return response()->json(['success' => false, 'message' => 'Không có quyền thực hiện!'], 403);
        }

        $request->validate([
            'sdt_khach' => 'required|string|max:20',
            'ho_ten'    => 'nullable|string|max:255',
            'tien_coc'  => 'required|numeric|min:0',
            'slots'     => 'required|array|min:1'
        ]);

        DB::beginTransaction();
        try {
            // BƯỚC A: Kiểm tra trùng lịch toàn bộ slots trước
            $failed_slots = [];
            $failed_messages = [];

            foreach ($request->slots as $slot) {
                $daDat = DatSan::where('MaSanBong', $slot['pitchId'])
                               ->where('NgayDa', $slot['dateDb'])
                               ->where('MaKhungGio', $slot['kgId'])
                               ->where('TrangThai', '!=', 'DaHuy')
                               ->lockForUpdate()
                               ->first();

                if ($daDat) {
                    $failed_slots[] = $slot['id'];
                    $failed_messages[] = "[{$slot['timeStr']} ngày {$slot['dateDisplay']}]";
                }
            }

            if (!empty($failed_slots)) {
                DB::rollBack();
                $msg_gop = implode(', ', $failed_messages);
                return response()->json([
                    'success'         => false,
                    'message'         => "Lỗi! Các khung giờ sau vừa bị khách hàng khác đặt mất: {$msg_gop}. Đã tự động gỡ khỏi giỏ!",
                    'failed_slot_ids' => $failed_slots
                ]);
            }

            $khachHang = NguoiDung::where('SoDienThoai', $request->sdt_khach)->first();

            if (!$khachHang) {
                $tenKhach = $request->ho_ten ? $request->ho_ten : 'Khách Offline';
                $emailAo = $request->sdt_khach . '@dnfootball.offline';
                $khachHang = NguoiDung::create([
                    'HoTen'       => $tenKhach,
                    'SoDienThoai' => $request->sdt_khach,
                    'Email'       => $emailAo,
                    'MatKhau'     => \Illuminate\Support\Facades\Hash::make('123456'),
                    'VaiTro'      => 'KhachHang',
                    'SoDuVi'      => 0
                ]);
            }

            $tongTienGocToanBo = array_reduce($request->slots, function ($carry, $s) {
                return $carry + (float) ($s['price'] ?? 0);
            }, 0);

            $clusterGroups = self::gomNhomSlotsTheoCumSan($request->slots);
            $soCumSan = count($clusterGroups);

            $giaoDich = null;
            if ($request->tien_coc > 0) {
                $giaoDich = GiaoDich::create([
                    'MaNguoiDung'    => $khachHang->MaNguoiDung,
                    'MaNhanVienXuLy' => $userDangNhap->MaNguoiDung,
                    'LoaiGiaoDich'   => 'DatSan',
                    'DongTien'       => 'Tru',
                    'SoTien'         => $request->tien_coc,
                    'SoDuTruoc'      => $khachHang->SoDuVi,
                    'SoDuSau'        => $khachHang->SoDuVi,
                    'NoiDung'        => "Thu tiền cọc trực tiếp tại sân (" . count($request->slots) . " khung giờ" . ($soCumSan > 1 ? " - {$soCumSan} cụm sân" : "") . ")"
                ]);
            }

            // BƯỚC B: Tách Hóa đơn theo từng Cụm sân và phân bổ tiền cọc theo đúng tỷ lệ
            $danhSachMaHoaDon = [];
            $tongCocDaPhanBo = 0;
            $groupKeys = array_keys($clusterGroups);
            $lastGroupKey = end($groupKeys);

            foreach ($clusterGroups as $maCumSan => $groupInfo) {
                $clusterSlots = $groupInfo['slots'];
                $tongTienGocCum = array_reduce($clusterSlots, fn($c, $s) => $c + (float) ($s['price'] ?? 0), 0);

                // Phân bổ tiền cọc của Cụm sân này theo tỷ lệ tiền sân
                if ($request->tien_coc <= 0 || $tongTienGocToanBo <= 0) {
                    $tienCocCumNay = 0;
                } elseif ($maCumSan === $lastGroupKey) {
                    $tienCocCumNay = max(0, (float) $request->tien_coc - $tongCocDaPhanBo);
                } else {
                    $tienCocCumNay = round(((float) $request->tien_coc) * ($tongTienGocCum / $tongTienGocToanBo));
                    $tongCocDaPhanBo += $tienCocCumNay;
                }

                // Tính thuế VAT 8% cho riêng Hóa đơn Cụm sân này
                $calc = self::tinhToanKhuyenMaiVaVAT($tongTienGocCum, null, $khachHang->MaNguoiDung, $clusterSlots, $maCumSan);

                $hoaDon = HoaDonDatSan::create([
                    'MaNguoiDung'         => $khachHang->MaNguoiDung,
                    'MaGiaoDich'          => $giaoDich ? $giaoDich->MaGiaoDich : null,
                    'MaKhuyenMai'         => null,
                    'TongTien'            => $calc['tong_tien_hoa_don'],
                    'ThueVAT'             => $calc['thue_vat'],
                    'PhuongThucThanhToan' => 'TienMat',
                    'TrangThai'           => 'DaCoc'
                ]);

                $danhSachMaHoaDon[] = $hoaDon->MaHoaDonDatSan;

                $soLuongSlotCum = count($clusterSlots);
                $tienCocMoiSlot = ($tienCocCumNay > 0 && $soLuongSlotCum > 0) ? round($tienCocCumNay / $soLuongSlotCum) : 0;

                foreach ($clusterSlots as $index => $slot) {
                    $giaKhungGio = (float) $slot['price'];
                    $cocThucTe = $tienCocMoiSlot;
                    if ($index === $soLuongSlotCum - 1) {
                        $cocThucTe = max(0, $tienCocCumNay - ($tienCocMoiSlot * ($soLuongSlotCum - 1)));
                    }

                    $veMoi = DatSan::create([
                        'MaNguoiDung'    => $khachHang->MaNguoiDung,
                        'MaSanBong'      => $slot['pitchId'],
                        'MaKhungGio'     => $slot['kgId'],
                        'MaGiaiDau'      => null,
                        'MaNhanVienXuLy' => $userDangNhap->MaNguoiDung,
                        'NgayDa'         => $slot['dateDb'],
                        'TongTien'       => $giaKhungGio,
                        'TienCoc'        => $cocThucTe,
                        'TrangThai'      => 'DaCoc'
                    ]);

                    ChiTietHoaDon::create([
                        'MaHoaDonDatSan' => $hoaDon->MaHoaDonDatSan,
                        'MaDatSan'       => $veMoi->MaDatSan,
                        'DonGia'         => $giaKhungGio,
                    ]);
                }
            }

            DB::commit();

            broadcast(new \App\Events\SystemDataUpdated())->toOthers();
            broadcast(new \App\Events\AdminDataUpdated())->toOthers();

            return response()->json([
                'success'     => true,
                'message'     => 'Giữ sân thành công!',
                'ma_hoa_don'  => $danhSachMaHoaDon[0] ?? null,
                'ma_hoa_dons' => $danhSachMaHoaDon
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Lỗi hệ thống: ' . $e->getMessage()]);
        }
    }

    public function thanhToanGuest(Request $request)
    {
        $request->validate([
            'ho_ten'      => ['required', 'string', 'min:2', 'max:100', 'regex:/^[\p{L}\s]+$/u'],
            'sdt_khach'   => ['required', 'regex:/^0[0-9]{9}$/'],
            'email_khach' => ['required', 'email', 'max:100'],
            'slots'       => ['required', 'array', 'min:1']
        ], [
            'ho_ten.required'      => 'Vui lòng nhập họ và tên!',
            'ho_ten.min'           => 'Họ và tên phải có ít nhất 2 ký tự!',
            'ho_ten.regex'         => 'Họ và tên chỉ được chứa chữ cái và khoảng trắng!',
            'sdt_khach.required'   => 'Vui lòng nhập số điện thoại!',
            'sdt_khach.regex'      => 'Số điện thoại không hợp lệ (phải gồm 10 chữ số, bắt đầu bằng số 0)!',
            'email_khach.required' => 'Vui lòng nhập địa chỉ Email!',
            'email_khach.email'    => 'Địa chỉ Email không đúng định dạng!',
            'slots.required'       => 'Giỏ hàng đặt sân đang trống!'
        ]);

        $slots = $request->slots;
        $tongTienCoc = 0;
        $failed_slots = [];
        $failed_messages = [];

        foreach ($slots as $slot) {
            $ngayDa = $slot['dateDb'];
            $khungGio = KhungGio::find($slot['kgId']);

            if (!$khungGio) {
                return response()->json(['success' => false, 'message' => 'Lỗi dữ liệu khung giờ!']);
            }

            $daDat = DatSan::where('MaSanBong', $slot['pitchId'])
                           ->where('NgayDa', $ngayDa)
                           ->where('MaKhungGio', $khungGio->MaKhungGio)
                           ->where('TrangThai', '!=', 'DaHuy')
                           ->first();

            if ($daDat) {
                $failed_slots[] = $slot['id'];
                $failed_messages[] = "[{$slot['timeStr']} ngày {$slot['dateDisplay']}]";
            } else {
                $tongTienCoc += ($slot['price'] * 0.3);
            }
        }

        if (!empty($failed_slots)) {
            $msg_gop = implode(', ', $failed_messages);
            return response()->json([
                'success'         => false,
                'message'         => "Rất tiếc! Các khung giờ sau vừa bị đặt mất: {$msg_gop}.",
                'failed_slot_ids' => $failed_slots
            ]);
        }

        $vnp_TxnRef = 'GUEST_' . time() . '_' . rand(1000, 9999);
        \Illuminate\Support\Facades\Cache::put('guest_booking_' . $vnp_TxnRef, [
            'ho_ten'      => $request->ho_ten,
            'sdt_khach'   => $request->sdt_khach,
            'email_khach' => $request->email_khach,
            'slots'       => $slots,
        ], now()->addMinutes(15));

        $vnp_TmnCode = config('vnpay.tmn_code');
        $vnp_HashSecret = config('vnpay.hash_secret');
        $vnp_Url = config('vnpay.url');
        $vnp_Returnurl = url('/api/dat-san-guest/vnpay-return');

        $vnp_OrderInfo = "Thanh toan tien coc dat san khach vang lai";
        $vnp_OrderType = 'billpayment';
        $vnp_Amount = $tongTienCoc * 100;
        $vnp_Locale = 'vn';
        $vnp_IpAddr = $request->ip();

        $inputData = array(
            "vnp_Version"    => "2.1.0",
            "vnp_TmnCode"    => $vnp_TmnCode,
            "vnp_Amount"     => $vnp_Amount,
            "vnp_Command"    => "pay",
            "vnp_CreateDate" => date('YmdHis'),
            "vnp_CurrCode"   => "VND",
            "vnp_IpAddr"     => $vnp_IpAddr,
            "vnp_Locale"     => $vnp_Locale,
            "vnp_OrderInfo"  => $vnp_OrderInfo,
            "vnp_OrderType"  => $vnp_OrderType,
            "vnp_ReturnUrl"  => $vnp_Returnurl,
            "vnp_TxnRef"     => $vnp_TxnRef,
        );

        ksort($inputData);
        $query = "";
        $i = 0;
        $hashdata = "";
        foreach ($inputData as $key => $value) {
            if ($i == 1) {
                $hashdata .= '&' . urlencode($key) . "=" . urlencode($value);
            } else {
                $hashdata .= urlencode($key) . "=" . urlencode($value);
                $i = 1;
            }
            $query .= urlencode($key) . "=" . urlencode($value) . '&';
        }

        $vnp_Url = $vnp_Url . "?" . $query;
        if (isset($vnp_HashSecret)) {
            $vnpSecureHash = hash_hmac('sha512', $hashdata, $vnp_HashSecret);
            $vnp_Url .= 'vnp_SecureHash=' . $vnpSecureHash;
        }

        return response()->json([
            'success'   => true,
            'message'   => 'Đang chuyển hướng đến cổng thanh toán VNPay...',
            'vnpay_url' => $vnp_Url
        ]);
    }

    /**
     * 3. KHÁCH VÃNG LAI THANH TOÁN VNPAY RETURN (Tự động tách Hóa đơn theo từng Cụm sân)
     */
    public function vnpayReturnGuest(Request $request)
    {
        $vnp_HashSecret = config('vnpay.hash_secret');
        $inputData = array();

        foreach ($request->all() as $key => $value) {
            if (substr($key, 0, 4) == "vnp_") {
                $inputData[$key] = $value;
            }
        }

        $vnp_SecureHash = $inputData['vnp_SecureHash'] ?? '';
        unset($inputData['vnp_SecureHash']);
        ksort($inputData);
        $i = 0;
        $hashData = "";

        foreach ($inputData as $key => $value) {
            if ($i == 1) {
                $hashData = $hashData . '&' . urlencode($key) . "=" . urlencode($value);
            } else {
                $hashData = $hashData . urlencode($key) . "=" . urlencode($value);
                $i = 1;
            }
        }

        $secureHash = hash_hmac('sha512', $hashData, $vnp_HashSecret);
        $frontendUrl = 'http://127.0.0.1:5500/html/index.html';

        if ($secureHash !== $vnp_SecureHash) {
            return redirect($frontendUrl . '?vnpay_status=invalid_signature#fields-section');
        }

        if ($request->vnp_ResponseCode !== '00') {
            \Illuminate\Support\Facades\Cache::forget('guest_booking_' . $request->vnp_TxnRef);
            return redirect($frontendUrl . '?vnpay_status=failed#fields-section');
        }

        $bookingData = \Illuminate\Support\Facades\Cache::pull('guest_booking_' . $request->vnp_TxnRef);
        if (!$bookingData) {
            return redirect($frontendUrl . '?vnpay_status=error#fields-section');
        }

        $slots = $bookingData['slots'];
        $clusterGroups = self::gomNhomSlotsTheoCumSan($slots);
        $danhSachMaHoaDon = [];
        $cacVeVuaTao = [];
        $htmlTatCaHoaDonEmail = '';

        DB::beginTransaction();
        try {
            foreach ($clusterGroups as $maCumSan => $groupInfo) {
                $clusterSlots = $groupInfo['slots'];
                $tongTienGocCum = array_reduce($clusterSlots, function ($carry, $s) {
                    return $carry + (float) ($s['price'] ?? 0);
                }, 0);

                // Thuế VAT 8% tính riêng trên từng Hóa đơn Cụm sân
                $thueVAT = self::tinhThueVATLamTronDuoi($tongTienGocCum);
                $tongTienHoaDon = $tongTienGocCum + $thueVAT;

                $hoaDon = HoaDonDatSan::create([
                    'MaNguoiDung'         => null,
                    'MaGiaoDich'          => null,
                    'MaKhuyenMai'         => null,
                    'TongTien'            => $tongTienHoaDon,
                    'ThueVAT'             => $thueVAT,
                    'PhuongThucThanhToan' => 'ChuyenKhoan',
                    'TrangThai'           => 'DaCoc'
                ]);

                $danhSachMaHoaDon[] = $hoaDon->MaHoaDonDatSan;
                $cacVeCuaHoaDonNay = [];

                foreach ($clusterSlots as $slot) {
                    $ngayDa = $slot['dateDb'];
                    $khungGio = KhungGio::find($slot['kgId']);

                    $daDat = DatSan::where('MaSanBong', $slot['pitchId'])
                                   ->where('NgayDa', $ngayDa)
                                   ->where('MaKhungGio', $khungGio->MaKhungGio)
                                   ->where('TrangThai', '!=', 'DaHuy')
                                   ->lockForUpdate()
                                   ->first();

                    if ($daDat) {
                        throw new \Exception("Khung giờ đã bị đặt trong lúc chờ thanh toán");
                    }

                    $giaKhungGio = (float) $slot['price'];
                    $tienCoc = $giaKhungGio * 0.3;

                    $veMoi = DatSan::create([
                        'TenNguoiDat'   => $bookingData['ho_ten'],
                        'SDTNguoiDat'   => $bookingData['sdt_khach'],
                        'EmailNguoiDat' => $bookingData['email_khach'],
                        'MaSanBong'     => $slot['pitchId'],
                        'MaKhungGio'    => $khungGio->MaKhungGio,
                        'NgayDa'        => $ngayDa,
                        'TongTien'      => $giaKhungGio,
                        'TienCoc'       => $tienCoc,
                        'TrangThai'     => 'DaCoc'
                    ]);

                    ChiTietHoaDon::create([
                        'MaHoaDonDatSan' => $hoaDon->MaHoaDonDatSan,
                        'MaDatSan'       => $veMoi->MaDatSan,
                        'DonGia'         => $giaKhungGio,
                    ]);

                    $thongTinVe = [
                        'maHoaDon' => $hoaDon->MaHoaDonDatSan,
                        'maVe'     => 'PT-' . $veMoi->MaDatSan,
                        'tenSan'   => $slot['pitchName'],
                        'cumSan'   => $slot['clusterName'],
                        'ngay'     => $slot['dateDisplay'],
                        'gio'      => $slot['timeStr'],
                        'donGia'   => number_format($giaKhungGio, 0, ',', '.') . 'đ',
                        'tienCoc'  => number_format($tienCoc, 0, ',', '.') . 'đ',
                        'conLai'   => number_format($giaKhungGio - $tienCoc, 0, ',', '.') . 'đ'
                    ];

                    $cacVeCuaHoaDonNay[] = $thongTinVe;
                    $cacVeVuaTao[] = $thongTinVe;
                }

                $hoaDon->load('datSans');
                $htmlTatCaHoaDonEmail .= self::buildEmailHoaDonHtml($hoaDon, $bookingData['ho_ten'], $bookingData['sdt_khach'], $cacVeCuaHoaDonNay, 0);
            }

            DB::commit();

            $adminInfo = NguoiDung::where('VaiTro', 'Admin')->first();
            $sdtAdmin = $adminInfo ? $adminInfo->SoDienThoai : '0899244124';

            $hotlineQuanLyHtml = '';
            foreach ($clusterGroups as $maCS => $gInfo) {
                $quanLy = NguoiDung::where('VaiTro', 'QuanLySan')->where('MaCumSan', $maCS)->first();
                $sdtQL = $quanLy ? $quanLy->SoDienThoai : 'Đang cập nhật';
                $hotlineQuanLyHtml .= "<li><strong>- Quản lý {$gInfo['ten_cum_san']}:</strong> {$sdtQL}</li>";
            }

            try {
                $htmlVe = '';
                foreach ($cacVeVuaTao as $ve) {
                    $qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=6&data=" . urlencode($ve['maVe']);
                    $htmlVe .= "
                        <div style='border:1px solid #cbd5e1; padding:16px; margin-bottom:15px; border-radius:10px; display:flex; align-items:center; justify-content:space-between; background:#ffffff;'>
                            <div style='padding-right:15px;'>
                                <h3 style='margin:0 0 10px 0; color:#10B981; font-size:18px;'>Mã vé: #{$ve['maVe']} <span style='font-size:13px; color:#475569;'>(HĐ #{$ve['maHoaDon']})</span></h3>
                                <p style='margin:4px 0;'><strong>Sân:</strong> {$ve['tenSan']} ({$ve['cumSan']})</p>
                                <p style='margin:4px 0;'><strong>Ngày:</strong> {$ve['ngay']} | <strong>Giờ:</strong> {$ve['gio']}</p>
                                <hr style='border:0; border-top:1px dashed #cbd5e1; margin:10px 0;'/>
                                <p style='margin:4px 0;'><strong>Đã cọc:</strong> {$ve['tienCoc']}</p>
                            </div>
                            <div style='text-align:center; border-left:1px dashed #cbd5e1; padding-left:15px;'>
                                <img src='{$qrUrl}' alt='QR {$ve['maVe']}' style='width:120px; height:120px; display:block; margin:0 auto; border:1px solid #e2e8f0; border-radius:8px;' />
                                <div style='font-size:11px; color:#64748b; margin-top:5px;'>Quét mã khi đến sân</div>
                            </div>
                        </div>
                    ";
                }

                $dsMaHDStr = implode(', #', $danhSachMaHoaDon);
                $noiDungMail = "
                    <h2>Xác nhận đặt sân & Hóa đơn điện tử - DN Football</h2>
                    <p>Chào <strong>{$bookingData['ho_ten']}</strong>,</p>
                    <p>Cảm ơn bạn đã đặt sân tại DN Football. Dưới đây là <strong>Hóa đơn đặt sân (#{$dsMaHDStr})</strong> và thông tin vé của bạn:</p>
                    {$htmlTatCaHoaDonEmail}
                    <h3 style='margin-top:24px; color:#0f172a;'>Danh sách Vé Điện Tử:</h3>
                    {$htmlVe}
                    <div style='background:#fef2f2; border:1px solid #fca5a5; padding:15px; border-radius:8px; margin-top:20px;'>
                        <h4 style='margin:0 0 10px 0; color:#b91c1c;'>Lưu ý quan trọng:</h4>
                        <ul style='margin:0; padding-left:20px; color:#991b1b;'>
                            <li>Khách vãng lai không thể tự hủy sân trên hệ thống.</li>
                            <li>Nếu cần hỗ trợ hoặc hủy sân, vui lòng liên hệ:</li>
                            <li><strong>- Hotline Admin hệ thống:</strong> {$sdtAdmin}</li>
                            {$hotlineQuanLyHtml}
                            <li>Bạn sẽ cần cung cấp Email này để nhận mã xác thực (OTP) nếu yêu cầu hủy sân để hoàn cọc.</li>
                        </ul>
                    </div>
                ";

                Mail::html($noiDungMail, function ($message) use ($bookingData, $dsMaHDStr) {
                    $message->to($bookingData['email_khach'])
                            ->subject("Hóa Đơn #{$dsMaHDStr} & Vé Đặt Sân - DN Football");
                });
            } catch (\Exception $mailEx) {
                \Illuminate\Support\Facades\Log::error('Lỗi gửi mail vé khách vãng lai: ' . $mailEx->getMessage());
            }

            broadcast(new \App\Events\AdminDataUpdated())->toOthers();
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            $maHoaDonParam = implode(',', $danhSachMaHoaDon);
            return redirect($frontendUrl . '?vnpay_status=success&ma_hoa_don=' . urlencode($maHoaDonParam) . '#fields-section');

        } catch (\Exception $e) {
            DB::rollBack();
            return redirect($frontendUrl . '?vnpay_status=error#fields-section');
        }
    }

    /**
     * Đồng bộ lại TongTien, ThueVAT, MaKhuyenMai và TrangThai của HoaDonDatSan khi có trận bị hủy / chốt
     * - Nếu sau khi hủy lẻ 1 sân mà không còn đủ điều kiện tối thiểu của Khuyến mãi:
     *   + Tự động hoàn lại 1 lượt dùng (decrement SoLuongDaDung)
     *   + Gỡ MaKhuyenMai = null khỏi HoaDonDatSan để ẩn khỏi lịch sử đặt sân
     * - Thuế VAT 8% luôn làm tròn dưới về hàng nghìn
     */
    public static function dongBoHoaDonDatSan($maHoaDon)
    {
        if (!$maHoaDon) return;

        $hoaDon = HoaDonDatSan::with(['datSans.sanBong', 'khuyenMai.nguoiDung'])->where('MaHoaDonDatSan', $maHoaDon)->first();
        if (!$hoaDon || $hoaDon->datSans->isEmpty()) return;

        $km = $hoaDon->khuyenMai;
        $laMaToanSanHoacCaNhan = ($km && (!$km->MaNguoiDung || ($km->nguoiDung && $km->nguoiDung->VaiTro !== 'QuanLySan')));

        // TRƯỜNG HỢP A: Nhiều Hóa đơn tách theo Cụm sân dùng chung 1 Mã Toàn hệ thống / Cá nhân (cùng MaGiaoDich)
        if ($laMaToanSanHoacCaNhan && $hoaDon->MaGiaoDich) {
            $cacHoaDonCungGiaoDich = HoaDonDatSan::with(['datSans.sanBong'])
                ->where('MaGiaoDich', $hoaDon->MaGiaoDich)
                ->where('MaKhuyenMai', $km->MaKhuyenMai)
                ->get();

            if ($cacHoaDonCungGiaoDich->count() > 1) {
                $tongTienHieuLucToanGio = 0;
                $tienTheoTungHD = [];
                $trangThaiTheoTungHD = [];

                foreach ($cacHoaDonCungGiaoDich as $hdItem) {
                    $dsList = $hdItem->datSans;
                    if ($dsList->contains('TrangThai', 'DaCoc')) $st = 'DaCoc';
                    elseif ($dsList->contains('TrangThai', 'HoanThanh')) $st = 'HoanThanh';
                    elseif ($dsList->contains('TrangThai', 'KhongDen')) $st = 'KhongDen';
                    else $st = 'DaHuy';

                    $trangThaiTheoTungHD[$hdItem->MaHoaDonDatSan] = $st;

                    if ($st === 'DaHuy') {
                        $tienTheoTungHD[$hdItem->MaHoaDonDatSan] = 0;
                    } else {
                        $sub = 0;
                        foreach ($dsList->where('TrangThai', '!=', 'DaHuy') as $d) {
                            $sub += ($d->TrangThai === 'KhongDen') ? (float) $d->TienCoc : (float) $d->TongTien;
                        }
                        $tienTheoTungHD[$hdItem->MaHoaDonDatSan] = $sub;
                        $tongTienHieuLucToanGio += $sub;
                    }
                }

                $tatCaDaHuy = collect($trangThaiTheoTungHD)->every(fn($st) => $st === 'DaHuy');
                $khongDuDieuKienNua = ($tongTienHieuLucToanGio < (float) $km->GiaTriHoaDonToiThieu);

                // Nếu tất cả bị hủy HOẶC tổng tiền còn hiệu lực không còn đủ điều kiện tối thiểu của mã -> Hoàn lại 1 lượt dùng & gỡ mã!
                if ($tatCaDaHuy || $khongDuDieuKienNua) {
                    if ($km->SoLuongDaDung > 0) {
                        $km->decrement('SoLuongDaDung');
                        if ($km->TrangThai === 'HetHan' && now()->lte(Carbon::parse($km->NgayKetThuc))) {
                            $km->update(['TrangThai' => 'DangApDung']);
                        }
                    }

                    foreach ($cacHoaDonCungGiaoDich as $hdItem) {
                        $idHD = $hdItem->MaHoaDonDatSan;
                        $stHD = $trangThaiTheoTungHD[$idHD];
                        $tienGocHD = ($stHD === 'DaHuy')
                            ? (float) $hdItem->datSans->sum('TongTien')
                            : $tienTheoTungHD[$idHD];
                        $vatMoi = self::tinhThueVATLamTronDuoi($tienGocHD);

                        $hdItem->update([
                            'MaKhuyenMai' => null,
                            'TongTien'    => $tienGocHD + $vatMoi,
                            'ThueVAT'     => $vatMoi,
                            'TrangThai'   => $stHD
                        ]);
                    }
                    return;
                }

                // Nếu vẫn đủ điều kiện tối thiểu -> Tính lại tổng giảm giá và phân bổ lại
                $tongGiamMoi = 0;
                if ($km->LoaiKhuyenMai === 'PhanTram') {
                    $tongGiamMoi = round($tongTienHieuLucToanGio * ((float) $km->GiaTri / 100));
                    if ((float) $km->GiaTriToiDa > 0 && $tongGiamMoi > (float) $km->GiaTriToiDa) {
                        $tongGiamMoi = (float) $km->GiaTriToiDa;
                    }
                } else {
                    $tongGiamMoi = (float) $km->GiaTri;
                }
                $tongGiamMoi = min($tongTienHieuLucToanGio, $tongGiamMoi);

                $daPhanBo = 0;
                $activeHDIds = array_keys(array_filter($tienTheoTungHD, fn($v) => $v > 0));
                $lastActiveId = end($activeHDIds);

                foreach ($cacHoaDonCungGiaoDich as $hdItem) {
                    $idHD = $hdItem->MaHoaDonDatSan;
                    $stHD = $trangThaiTheoTungHD[$idHD];

                    if ($stHD === 'DaHuy') {
                        $tienGocHuy = (float) $hdItem->datSans->sum('TongTien');
                        $vatHuy = self::tinhThueVATLamTronDuoi($tienGocHuy);
                        // Hóa đơn cụm sân bị hủy hết thì gỡ MaKhuyenMai khỏi hóa đơn bị hủy đó
                        $hdItem->update([
                            'MaKhuyenMai' => null,
                            'TongTien'    => $tienGocHuy + $vatHuy,
                            'ThueVAT'     => $vatHuy,
                            'TrangThai'   => 'DaHuy'
                        ]);
                    } else {
                        $tienCum = $tienTheoTungHD[$idHD];
                        $giamCum = 0;
                        if ($tongGiamMoi > 0 && $tongTienHieuLucToanGio > 0) {
                            if ($idHD === $lastActiveId) {
                                $giamCum = max(0, $tongGiamMoi - $daPhanBo);
                            } else {
                                $giamCum = round($tongGiamMoi * ($tienCum / $tongTienHieuLucToanGio));
                                $daPhanBo += $giamCum;
                            }
                            $giamCum = min($tienCum, $giamCum);
                        }
                        $sauGiam = max(0, $tienCum - $giamCum);
                        $vatMoi  = self::tinhThueVATLamTronDuoi($sauGiam);
                        $hdItem->update([
                            'TongTien'  => $sauGiam + $vatMoi,
                            'ThueVAT'   => $vatMoi,
                            'TrangThai' => $stHD
                        ]);
                    }
                }
                return;
            }
        }

        // TRƯỜNG HỢP B: Xử lý cho 1 Hóa đơn độc lập
        $cacDatSan = $hoaDon->datSans;
        $trangThaiCu = $hoaDon->TrangThai;

        if ($cacDatSan->contains('TrangThai', 'DaCoc')) {
            $trangThaiHoaDon = 'DaCoc';
        } elseif ($cacDatSan->contains('TrangThai', 'HoanThanh')) {
            $trangThaiHoaDon = 'HoanThanh';
        } elseif ($cacDatSan->contains('TrangThai', 'KhongDen')) {
            $trangThaiHoaDon = 'KhongDen';
        } else {
            $trangThaiHoaDon = 'DaHuy';
        }

        $tienXetKhuyenMai = 0;
        $maKhuyenMaiMoi = $hoaDon->MaKhuyenMai;

        if ($trangThaiHoaDon === 'DaHuy') {
            $tongTienSanGoc = (float) $cacDatSan->sum('TongTien');
            $tienXetKhuyenMai = 0;

            if ($trangThaiCu !== 'DaHuy' && $hoaDon->MaKhuyenMai && $km) {
                if ($km->SoLuongDaDung > 0) {
                    $km->decrement('SoLuongDaDung');
                    if ($km->TrangThai === 'HetHan' && now()->lte(Carbon::parse($km->NgayKetThuc))) {
                        $km->update(['TrangThai' => 'DangApDung']);
                    }
                }
            }
            $maKhuyenMaiMoi = null;
        } else {
            $cacSanHieuLuc = $cacDatSan->where('TrangThai', '!=', 'DaHuy');
            $tongTienSanGoc = 0;

            foreach ($cacSanHieuLuc as $ds) {
                $tienTran = ($ds->TrangThai === 'KhongDen') ? (float) $ds->TienCoc : (float) $ds->TongTien;
                $tongTienSanGoc += $tienTran;
                $tienXetKhuyenMai += $tienTran;
            }

            // Nếu Hóa đơn có gắn mã Khuyến mãi nhưng sau khi hủy bớt sân thì không còn đủ điều kiện tối thiểu nữa:
            // -> Hoàn trả 1 lượt dùng khuyến mãi VÀ gỡ MaKhuyenMai = null khỏi hóa đơn!
            if ($hoaDon->MaKhuyenMai && $km && $tienXetKhuyenMai < (float) $km->GiaTriHoaDonToiThieu) {
                if ($km->SoLuongDaDung > 0) {
                    $km->decrement('SoLuongDaDung');
                    if ($km->TrangThai === 'HetHan' && now()->lte(Carbon::parse($km->NgayKetThuc))) {
                        $km->update(['TrangThai' => 'DangApDung']);
                    }
                }
                $maKhuyenMaiMoi = null;
            }
        }

        $soTienGiam = 0;
        if ($maKhuyenMaiMoi && $km && $tienXetKhuyenMai >= (float) $km->GiaTriHoaDonToiThieu) {
            if ($km->LoaiKhuyenMai === 'PhanTram') {
                $soTienGiam = round($tienXetKhuyenMai * ((float) $km->GiaTri / 100));
                if ((float) $km->GiaTriToiDa > 0 && $soTienGiam > (float) $km->GiaTriToiDa) {
                    $soTienGiam = (float) $km->GiaTriToiDa;
                }
            } else {
                $soTienGiam = (float) $km->GiaTri;
            }
            $soTienGiam = min($tienXetKhuyenMai, $soTienGiam);
        }

        $tienSauGiam = max(0, $tongTienSanGoc - $soTienGiam);
        $thueVATMoi  = self::tinhThueVATLamTronDuoi($tienSauGiam);
        $tongTienMoi = $tienSauGiam + $thueVATMoi;

        $hoaDon->update([
            'MaKhuyenMai' => $maKhuyenMaiMoi,
            'TongTien'    => $tongTienMoi,
            'ThueVAT'     => $thueVATMoi,
            'TrangThai'   => $trangThaiHoaDon,
        ]);
    }

    public static function buildEmailHoaDonHtml($hoaDon, $tenKhach, $sdtKhach, $cacVe, $soTienGiam = 0)
    {
        $tongThanhToan = number_format($hoaDon->TongTien, 0, ',', '.') . 'đ';
        $thueVAT       = number_format($hoaDon->ThueVAT ?? 0, 0, ',', '.') . 'đ';
        $tienCoc       = number_format($hoaDon->TienDaCoc, 0, ',', '.') . 'đ';
        $conLai        = number_format(max(0, $hoaDon->TongTien - $hoaDon->TienDaCoc), 0, ',', '.') . 'đ';
        $ngayTao       = date('H:i - d/m/Y', strtotime($hoaDon->NgayTao ?? now()));
        $tenCumSanHD   = $cacVe[0]['cumSan'] ?? 'DN Football';

        $ptMap = [
            'ViDienTu'    => 'Ví điện tử DN Football',
            'ChuyenKhoan' => 'Chuyển khoản VNPay',
            'TienMat'     => 'Tiền mặt tại quầy'
        ];
        $ptText = $ptMap[$hoaDon->PhuongThucThanhToan] ?? $hoaDon->PhuongThucThanhToan;

        $rowsHtml = '';
        foreach ($cacVe as $idx => $ve) {
            $stt = $idx + 1;
            $rowsHtml .= "
                <tr>
                    <td style='border:1px solid #cbd5e1; padding:8px; text-align:center;'>{$stt}</td>
                    <td style='border:1px solid #cbd5e1; padding:8px; font-weight:bold;'>#{$ve['maVe']}</td>
                    <td style='border:1px solid #cbd5e1; padding:8px;'>{$ve['tenSan']} ({$ve['cumSan']})</td>
                    <td style='border:1px solid #cbd5e1; padding:8px; text-align:center;'>{$ve['gio']} | {$ve['ngay']}</td>
                    <td style='border:1px solid #cbd5e1; padding:8px; text-align:right; color:#047857; font-weight:bold;'>{$ve['tienCoc']}</td>
                    <td style='border:1px solid #cbd5e1; padding:8px; text-align:right; color:#e11d48; font-weight:bold;'>{$ve['conLai']}</td>
                </tr>
            ";
        }

        $giamGiaHtml = ($soTienGiam > 0)
            ? "<div style='margin-bottom:4px; color:#2563eb;'>Khuyến mãi giảm: <strong>-" . number_format($soTienGiam, 0, ',', '.') . "đ</strong></div>"
            : "";

        return "
            <div style='border:2px solid #0b5d3b; border-radius:12px; overflow:hidden; margin:16px 0; background:#ffffff; font-family:Arial,sans-serif;'>
                <div style='background:#0b5d3b; color:#ffffff; padding:14px 18px; display:flex; justify-content:space-between; align-items:center;'>
                    <div>
                        <h3 style='margin:0; font-size:17px; text-transform:uppercase;'>HÓA ĐƠN ĐẶT SÂN ĐIỆN TỬ - {$tenCumSanHD}</h3>
                        <div style='font-size:12px; opacity:0.9; margin-top:3px;'>Mã hóa đơn: <strong>#{$hoaDon->MaHoaDonDatSan}</strong> | Ngày lập: {$ngayTao}</div>
                    </div>
                </div>
                <div style='padding:16px 18px;'>
                    <p style='margin:0 0 8px 0;'><strong>Khách hàng:</strong> {$tenKhach} - <strong>SĐT:</strong> {$sdtKhach}</p>
                    <p style='margin:0 0 14px 0;'><strong>Phương thức thanh toán cọc:</strong> {$ptText}</p>
                    <table style='width:100%; border-collapse:collapse; font-size:13px; margin-bottom:14px;'>
                        <thead>
                            <tr style='background:#f1f5f9; color:#0f172a;'>
                                <th style='border:1px solid #cbd5e1; padding:8px;'>STT</th>
                                <th style='border:1px solid #cbd5e1; padding:8px;'>Mã Vé</th>
                                <th style='border:1px solid #cbd5e1; padding:8px; text-align:left;'>Sân Bóng</th>
                                <th style='border:1px solid #cbd5e1; padding:8px;'>Khung Giờ & Ngày Đá</th>
                                <th style='border:1px solid #cbd5e1; padding:8px; text-align:right;'>Tiền Đã Cọc</th>
                                <th style='border:1px solid #cbd5e1; padding:8px; text-align:right;'>Còn Thu Tại Sân</th>
                            </tr>
                        </thead>
                        <tbody>{$rowsHtml}</tbody>
                    </table>
                    <div style='background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 15px; text-align:right;'>
                        {$giamGiaHtml}
                        <div style='margin-bottom:4px; color:#475569;'>Thuế VAT (8%): <strong>{$thueVAT}</strong></div>
                        <div style='margin-bottom:4px;'>Tổng tiền hóa đơn (" . count($cacVe) . " trận): <strong>{$tongThanhToan}</strong></div>
                        <div style='margin-bottom:4px; color:#047857;'>Tổng tiền đã cọc: <strong>{$tienCoc}</strong></div>
                        <div style='font-size:15px; color:#e11d48;'><strong>TỔNG CẦN THANH TOÁN THÊM: {$conLai}</strong></div>
                    </div>
                </div>
            </div>
        ";
    }

    public function layChiTietHoaDonDatSan($maHoaDon)
    {
        $hoaDon = HoaDonDatSan::with(['nguoiDung', 'khuyenMai', 'chiTietHoaDons', 'datSans.sanBong.cumSan', 'datSans.khungGio', 'datSans.giaiDau'])
            ->where('MaHoaDonDatSan', $maHoaDon)
            ->first();

        if (!$hoaDon) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy hóa đơn đặt sân!'], 404);
        }

        return response()->json(['success' => true, 'data' => $hoaDon]);
    }

    public function huyHoaDonKhachHang(Request $request, $maHoaDon)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()->MaNguoiDung);
        $hoaDon = HoaDonDatSan::where('MaHoaDonDatSan', $maHoaDon)->where('MaNguoiDung', $user->MaNguoiDung)->first();

        if (!$hoaDon) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy hóa đơn đặt sân!']);
        }

        $cacTranDaCoc = DatSan::with(['khungGio', 'sanBong'])
            ->whereHas('chiTietHoaDon', function ($q) use ($maHoaDon) {
                $q->where('MaHoaDonDatSan', $maHoaDon);
            })
            ->where('TrangThai', 'DaCoc')
            ->get();

        if ($cacTranDaCoc->isEmpty()) {
            return response()->json(['success' => false, 'message' => 'Hóa đơn này không còn trận nào ở trạng thái Đã cọc để hủy!']);
        }

        foreach ($cacTranDaCoc as $ds) {
            if ($ds->MaGiaiDau !== null) {
                return response()->json(['success' => false, 'message' => 'Hóa đơn giải đấu vui lòng hủy tại tab Giải đấu!']);
            }
            $thoiGianDa = Carbon::parse($ds->NgayDa . ' ' . $ds->khungGio->GioBatDau);
            if (now()->diffInHours($thoiGianDa, false) < 10) {
                $ngayFormat = Carbon::parse($ds->NgayDa)->format('d/m/Y');
                $gioFormat = substr($ds->khungGio->GioBatDau, 0, 5);
                return response()->json([
                    'success' => false,
                    'message' => "Không thể hủy cả hóa đơn vì trận [{$ds->sanBong->TenSan} - {$gioFormat} ngày {$ngayFormat}] đã sát giờ đá (< 10 tiếng). Bạn có thể hủy lẻ các trận khác hoặc gửi Yêu cầu hủy gấp!"
                ]);
            }
        }

        DB::beginTransaction();
        try {
            $tongTienHoan = $cacTranDaCoc->sum('TienCoc');
            $soTranHuy = $cacTranDaCoc->count();

            DatSan::whereHas('chiTietHoaDon', function ($q) use ($maHoaDon) {
                    $q->where('MaHoaDonDatSan', $maHoaDon);
                })
                ->where('TrangThai', 'DaCoc')
                ->update(['TrangThai' => 'DaHuy']);

            self::dongBoHoaDonDatSan($maHoaDon);

            $soDuTruoc = $user->SoDuVi;
            $soDuSau = $soDuTruoc + $tongTienHoan;
            $user->update(['SoDuVi' => $soDuSau]);

            GiaoDich::create([
                'MaNguoiDung'  => $user->MaNguoiDung,
                'LoaiGiaoDich' => 'HoanTienHuySan',
                'DongTien'     => 'Cong',
                'SoTien'       => $tongTienHoan,
                'SoDuTruoc'    => $soDuTruoc,
                'SoDuSau'      => $soDuSau,
                'NoiDung'      => "Hoàn cọc hủy toàn bộ hóa đơn #{$maHoaDon} ({$soTranHuy} trận)"
            ]);

            DB::commit();

            broadcast(new \App\Events\AdminDataUpdated())->toOthers();
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            return response()->json([
                'success' => true,
                'message' => "Đã hủy thành công toàn bộ {$soTranHuy} trận trong hóa đơn #{$maHoaDon} và hoàn " . number_format($tongTienHoan, 0, ',', '.') . "đ vào ví!"
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Lỗi hệ thống: ' . $e->getMessage()]);
        }
    }

    public function guiOtpHuyHoaDonGuest(Request $request, $maHoaDon)
    {
        $cacTran = DatSan::with(['sanBong.cumSan', 'khungGio'])
            ->whereHas('chiTietHoaDon', function ($q) use ($maHoaDon) {
                $q->where('MaHoaDonDatSan', $maHoaDon);
            })
            ->where('TrangThai', 'DaCoc')
            ->get();

        if ($cacTran->isEmpty()) {
            return response()->json(['success' => false, 'message' => 'Không còn trận Đã cọc nào trong hóa đơn này để hủy!']);
        }

        $first = $cacTran->first();
        if ($first->MaNguoiDung !== null || !$first->EmailNguoiDat) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy email khách vãng lai của hóa đơn này!']);
        }

        $otp = (string) rand(100000, 999999);
        \Illuminate\Support\Facades\Cache::put('guest_cancel_invoice_otp_' . $maHoaDon, $otp, now()->addMinutes(5));

        $tongCoc = number_format($cacTran->sum('TienCoc'), 0, ',', '.') . 'đ';
        $soTran = $cacTran->count();

        try {
            $noiDungMail = "
                <h2>Mã xác thực (OTP) hủy toàn bộ Hóa đơn đặt sân #{$maHoaDon}</h2>
                <p>Chào <strong>{$first->TenNguoiDat}</strong>,</p>
                <p>Hệ thống DN Football vừa nhận được yêu cầu hủy toàn bộ <strong>{$soTran} trận</strong> trong hóa đơn <strong>#{$maHoaDon}</strong>.</p>
                <p><strong>Tổng số tiền cọc hoàn trả:</strong> <span style='color:#10b981; font-weight:bold;'>{$tongCoc}</span></p>
                <p>Mã OTP xác nhận của bạn là: <strong style='font-size: 20px; color: #e11d48; letter-spacing: 2px;'>{$otp}</strong> (Hiệu lực 5 phút)</p>
            ";
            Mail::html($noiDungMail, function ($message) use ($first, $maHoaDon) {
                $message->to($first->EmailNguoiDat)
                        ->subject("Mã OTP Hủy Hóa Đơn #{$maHoaDon} - DN Football");
            });

            return response()->json([
                'success' => true,
                'message' => 'Đã gửi mã OTP hủy hóa đơn tới email: ' . $first->EmailNguoiDat
            ]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Lỗi gửi email OTP: ' . $e->getMessage()]);
        }
    }

    public function huyHoaDonAdmin(Request $request, $maHoaDon)
    {
        $userDangNhap = auth()->user();

        $cacTranDaCoc = DatSan::with(['sanBong.cumSan', 'khungGio'])
            ->whereHas('chiTietHoaDon', function ($q) use ($maHoaDon) {
                $q->where('MaHoaDonDatSan', $maHoaDon);
            })
            ->where('TrangThai', 'DaCoc')
            ->get();

        if ($cacTranDaCoc->isEmpty()) {
            return response()->json(['success' => false, 'message' => 'Hóa đơn này không còn trận nào ở trạng thái Đã cọc để hủy!']);
        }

        $first = $cacTranDaCoc->first();
        $tongTienHoan = $cacTranDaCoc->sum('TienCoc');
        $soTranHuy = $cacTranDaCoc->count();
        $phuongThucHoan = $request->input('phuong_thuc_hoan', 'vi');
        $thongTinCK = '';

        DB::beginTransaction();
        try {
            if ($first->MaNguoiDung !== null) {
                $khach = NguoiDung::find($first->MaNguoiDung);
                if ($khach) {
                    $soDuTruoc = $khach->SoDuVi;

                    if ($phuongThucHoan === 'chuyen_khoan') {
                        $nganHang = trim($request->input('ngan_hang', ''));
                        $soTaiKhoan = trim($request->input('so_tai_khoan', ''));
                        $chuTaiKhoan = strtoupper(trim($request->input('chu_tai_khoan', '')));

                        if (!$nganHang || !$soTaiKhoan || !$chuTaiKhoan) {
                            DB::rollBack();
                            return response()->json([
                                'success' => false,
                                'message' => 'Vui lòng nhập đầy đủ Tên ngân hàng, Số tài khoản và Tên chủ tài khoản để hoàn tiền chuyển khoản!'
                            ]);
                        }

                        if ($tongTienHoan > 0) {
                            DB::rollBack(); // Chờ VNPay thanh toán thành công mới hoàn tất hủy hóa đơn!
                            $returnPage = $request->input('return_url') ?: 'http://127.0.0.1:5500/html/admin.html';
                            $vnpayUrl = self::taoUrlVnPayHoanTienDatHo($request, [
                                'type'               => 'invoice',
                                'ma_hoa_don'         => $maHoaDon,
                                'ma_nhan_vien_xu_ly' => $userDangNhap->MaNguoiDung,
                                'ngan_hang'          => $nganHang,
                                'so_tai_khoan'       => $soTaiKhoan,
                                'chu_tai_khoan'      => $chuTaiKhoan,
                                'return_page'        => $returnPage,
                            ], $tongTienHoan, "Hoan tien coc hoa don " . $maHoaDon);

                            return response()->json([
                                'success'   => true,
                                'vnpay_url' => $vnpayUrl,
                                'message'   => 'Đang chuyển hướng sang cổng VNPay để hoàn tiền hóa đơn...'
                            ]);
                        }
                    } else {
                        $soDuSau = $soDuTruoc + $tongTienHoan;
                        $khach->update(['SoDuVi' => $soDuSau]);

                        if ($tongTienHoan > 0) {
                            GiaoDich::create([
                                'MaNguoiDung'    => $khach->MaNguoiDung,
                                'MaNhanVienXuLy' => $userDangNhap->MaNguoiDung,
                                'LoaiGiaoDich'   => 'HoanTienHuySan',
                                'DongTien'       => 'Cong',
                                'SoTien'         => $tongTienHoan,
                                'SoDuTruoc'      => $soDuTruoc,
                                'SoDuSau'        => $soDuSau,
                                'NoiDung'        => "Hỗ trợ hủy toàn bộ hóa đơn đặt sân #{$maHoaDon} ({$soTranHuy} trận) - Hoàn vào ví"
                            ]);
                        }
                    }

                    $hinhThucStr = ($phuongThucHoan === 'chuyen_khoan')
                        ? "đã được hoàn trả qua chuyển khoản ngân hàng{$thongTinCK}."
                        : "đã được hoàn lại vào ví của bạn.";

                    ThongBao::create([
                        'MaNguoiDung'  => $khach->MaNguoiDung,
                        'TieuDe'       => "Hóa đơn đặt sân #{$maHoaDon} đã được hủy",
                        'NoiDung'      => "Ban quản lý đã hỗ trợ hủy toàn bộ {$soTranHuy} trận trong hóa đơn #{$maHoaDon}. Số tiền cọc " . number_format($tongTienHoan, 0, ',', '.') . "đ {$hinhThucStr}",
                        'LoaiThongBao' => 'DatSan'
                    ]);
                }
            } else {
                $otpInput = trim($request->input('otp', ''));
                $cachedOtp = \Illuminate\Support\Facades\Cache::get('guest_cancel_invoice_otp_' . $maHoaDon);

                if (!$otpInput || !$cachedOtp || $otpInput !== (string) $cachedOtp) {
                    DB::rollBack();
                    return response()->json([
                        'success' => false,
                        'message' => 'Mã OTP hủy hóa đơn không chính xác hoặc đã hết hạn!'
                    ]);
                }
                \Illuminate\Support\Facades\Cache::forget('guest_cancel_invoice_otp_' . $maHoaDon);
            }

            DatSan::whereHas('chiTietHoaDon', function ($q) use ($maHoaDon) {
                    $q->where('MaHoaDonDatSan', $maHoaDon);
                })
                ->where('TrangThai', 'DaCoc')
                ->update([
                    'TrangThai'      => 'DaHuy',
                    'MaNhanVienXuLy' => $userDangNhap->MaNguoiDung
                ]);

            self::dongBoHoaDonDatSan($maHoaDon);

            if ($first->MaGiaiDau !== null) {
                $giaiDau = GiaiDau::find($first->MaGiaiDau);
                if ($giaiDau) {
                    $conTranDaCoc = DatSan::where('MaGiaiDau', $giaiDau->MaGiaiDau)->where('TrangThai', 'DaCoc')->exists();
                    if (!$conTranDaCoc) {
                        $coTranDaXong = DatSan::where('MaGiaiDau', $giaiDau->MaGiaiDau)->whereIn('TrangThai', ['HoanThanh', 'KhongDen'])->exists();
                        $giaiDau->update(['TrangThai' => $coTranDaXong ? 'HoanThanh' : 'DaHuy']);
                    }
                }
            }

            DB::commit();

            if ($first->MaNguoiDung !== null) {
                broadcast(new \App\Events\UserDataUpdated($first->MaNguoiDung))->toOthers();
            }
            broadcast(new \App\Events\AdminDataUpdated())->toOthers();
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            $msgSuccess = ($phuongThucHoan === 'chuyen_khoan')
                ? "Đã hủy toàn bộ {$soTranHuy} trận trong hóa đơn #{$maHoaDon} và ghi nhận hoàn cọc qua Chuyển khoản!"
                : "Đã hủy toàn bộ {$soTranHuy} trận trong hóa đơn #{$maHoaDon} và hoàn cọc vào ví khách hàng!";

            return response()->json([
                'success' => true,
                'message' => $msgSuccess
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Lỗi hệ thống: ' . $e->getMessage()]);
        }
    }

    /**
     * Tạo URL cổng thanh toán VNPay để Admin / Quản lý / Nhân viên chuyển khoản hoàn tiền cọc đơn đặt hộ
     */
    private static function taoUrlVnPayHoanTienDatHo(Request $request, array $cachePayload, $soTienHoan, $noiDungOrder)
    {
        $vnp_TxnRef = 'REFUND_' . time() . '_' . rand(1000, 9999);
        \Illuminate\Support\Facades\Cache::put('admin_refund_' . $vnp_TxnRef, $cachePayload, now()->addMinutes(15));

        $vnp_TmnCode    = config('vnpay.tmn_code');
        $vnp_HashSecret = config('vnpay.hash_secret');
        $vnp_Url        = config('vnpay.url');
        $vnp_Returnurl  = url('/api/admin/hoan-tien-vnpay-return');

        $inputData = [
            "vnp_Version"    => "2.1.0",
            "vnp_TmnCode"    => $vnp_TmnCode,
            "vnp_Amount"     => (int) round($soTienHoan * 100),
            "vnp_Command"    => "pay",
            "vnp_CreateDate" => date('YmdHis'),
            "vnp_CurrCode"   => "VND",
            "vnp_IpAddr"     => $request->ip(),
            "vnp_Locale"     => 'vn',
            "vnp_OrderInfo"  => $noiDungOrder,
            "vnp_OrderType"  => 'billpayment',
            "vnp_ReturnUrl"  => $vnp_Returnurl,
            "vnp_TxnRef"     => $vnp_TxnRef,
        ];

        ksort($inputData);
        $query = "";
        $i = 0;
        $hashdata = "";
        foreach ($inputData as $key => $value) {
            if ($i == 1) {
                $hashdata .= '&' . urlencode($key) . "=" . urlencode($value);
            } else {
                $hashdata .= urlencode($key) . "=" . urlencode($value);
                $i = 1;
            }
            $query .= urlencode($key) . "=" . urlencode($value) . '&';
        }

        $vnp_Url = $vnp_Url . "?" . $query;
        if (isset($vnp_HashSecret)) {
            $vnpSecureHash = hash_hmac('sha512', $hashdata, $vnp_HashSecret);
            $vnp_Url .= 'vnp_SecureHash=' . $vnpSecureHash;
        }

        return $vnp_Url;
    }

    /**
     * Callback VNPay trả về sau khi Admin / Quản lý / Nhân viên thanh toán hoàn cọc đơn đặt hộ
     */
    public function vnpayReturnHoanTienAdmin(Request $request)
    {
        $vnp_HashSecret = config('vnpay.hash_secret');
        $inputData = [];

        foreach ($request->all() as $key => $value) {
            if (substr($key, 0, 4) == "vnp_") {
                $inputData[$key] = $value;
            }
        }

        $vnp_SecureHash = $inputData['vnp_SecureHash'] ?? '';
        unset($inputData['vnp_SecureHash']);
        ksort($inputData);
        $i = 0;
        $hashData = "";

        foreach ($inputData as $key => $value) {
            if ($i == 1) {
                $hashData .= '&' . urlencode($key) . "=" . urlencode($value);
            } else {
                $hashData .= urlencode($key) . "=" . urlencode($value);
                $i = 1;
            }
        }

        $secureHash = hash_hmac('sha512', $hashData, $vnp_HashSecret);
        $refundData = \Illuminate\Support\Facades\Cache::pull('admin_refund_' . $request->vnp_TxnRef);

        $returnPage = $refundData['return_page'] ?? 'http://127.0.0.1:5500/html/admin.html';

        if ($secureHash !== $vnp_SecureHash) {
            return redirect($returnPage . '?vnpay_refund=invalid_signature');
        }

        if ($request->vnp_ResponseCode !== '00' || !$refundData) {
            return redirect($returnPage . '?vnpay_refund=failed');
        }

        DB::beginTransaction();
        try {
            $type           = $refundData['type']; // 'single' | 'invoice'
            $maNhanVienXuLy = $refundData['ma_nhan_vien_xu_ly'];
            $nganHang       = $refundData['ngan_hang'];
            $soTaiKhoan     = $refundData['so_tai_khoan'];
            $chuTaiKhoan    = $refundData['chu_tai_khoan'];
            $thongTinCK     = " ({$nganHang} - {$soTaiKhoan} - {$chuTaiKhoan})";

            if ($type === 'single') {
                $datSan = DatSan::with(['sanBong.cumSan', 'khungGio', 'chiTietHoaDon'])->find($refundData['ma_dat_san']);
                if (!$datSan || $datSan->TrangThai !== 'DaCoc') {
                    throw new \Exception('Lịch đặt sân không còn ở trạng thái Đã cọc!');
                }

                $tenSan = $datSan->sanBong ? $datSan->sanBong->TenSan : 'Sân bóng';
                $ngayDa = date('d/m/Y', strtotime($datSan->NgayDa));
                $gioDa  = $datSan->khungGio ? substr($datSan->khungGio->GioBatDau, 0, 5) . ' - ' . substr($datSan->khungGio->GioKetThuc, 0, 5) : '';
                $tienHoan = (float) $datSan->TienCoc;

                $user = NguoiDung::find($datSan->MaNguoiDung);
                if ($user) {
                    if (!$user->TenNganHang || !$user->STKNganHang || !$user->TenTaiKhoan) {
                        $user->update([
                            'TenNganHang' => $nganHang,
                            'STKNganHang' => $soTaiKhoan,
                            'TenTaiKhoan' => $chuTaiKhoan
                        ]);
                    }

                    if ($tienHoan > 0) {
                        GiaoDich::create([
                            'MaNguoiDung'    => $user->MaNguoiDung,
                            'MaNhanVienXuLy' => $maNhanVienXuLy,
                            'LoaiGiaoDich'   => 'HoanTienHuySan',
                            'DongTien'       => 'Cong',
                            'SoTien'         => $tienHoan,
                            'SoDuTruoc'      => $user->SoDuVi,
                            'SoDuSau'        => $user->SoDuVi,
                            'NoiDung'        => "Hoàn cọc hủy sân đặt hộ qua VNPay{$thongTinCK}: {$tenSan}"
                        ]);
                    }

                    ThongBao::create([
                        'MaNguoiDung'  => $user->MaNguoiDung,
                        'TieuDe'       => 'Lịch đặt sân đã bị hủy & hoàn cọc',
                        'NoiDung'      => "Ban quản lý đã hỗ trợ hủy lịch đặt sân tại {$tenSan} lúc {$gioDa} ngày {$ngayDa}. Số tiền cọc " . number_format($tienHoan, 0, ',', '.') . "đ đã được hoàn trả qua cổng VNPay{$thongTinCK}.",
                        'LoaiThongBao' => 'DatSan'
                    ]);
                }

                $maHoaDon = $datSan->MaHoaDonDatSan;
                $datSan->update([
                    'TrangThai'      => 'DaHuy',
                    'MaNhanVienXuLy' => $maNhanVienXuLy
                ]);

                if ($maHoaDon) {
                    self::dongBoHoaDonDatSan($maHoaDon);
                }

                DB::commit();

                if ($datSan->MaNguoiDung !== null) {
                    broadcast(new \App\Events\UserDataUpdated($datSan->MaNguoiDung))->toOthers();
                }
            } else {
                // Hủy toàn bộ Hóa đơn đặt hộ
                $maHoaDon = $refundData['ma_hoa_don'];
                $cacTranDaCoc = DatSan::with(['sanBong.cumSan', 'khungGio'])
                    ->whereHas('chiTietHoaDon', function ($q) use ($maHoaDon) {
                        $q->where('MaHoaDonDatSan', $maHoaDon);
                    })
                    ->where('TrangThai', 'DaCoc')
                    ->get();

                if ($cacTranDaCoc->isEmpty()) {
                    throw new \Exception('Hóa đơn không còn trận Đã cọc nào!');
                }

                $first = $cacTranDaCoc->first();
                $tongTienHoan = (float) $cacTranDaCoc->sum('TienCoc');
                $soTranHuy = $cacTranDaCoc->count();

                $khach = NguoiDung::find($first->MaNguoiDung);
                if ($khach) {
                    if (!$khach->TenNganHang || !$khach->STKNganHang || !$khach->TenTaiKhoan) {
                        $khach->update([
                            'TenNganHang' => $nganHang,
                            'STKNganHang' => $soTaiKhoan,
                            'TenTaiKhoan' => $chuTaiKhoan
                        ]);
                    }

                    if ($tongTienHoan > 0) {
                        GiaoDich::create([
                            'MaNguoiDung'    => $khach->MaNguoiDung,
                            'MaNhanVienXuLy' => $maNhanVienXuLy,
                            'LoaiGiaoDich'   => 'HoanTienHuySan',
                            'DongTien'       => 'Cong',
                            'SoTien'         => $tongTienHoan,
                            'SoDuTruoc'      => $khach->SoDuVi,
                            'SoDuSau'        => $khach->SoDuVi,
                            'NoiDung'        => "Hoàn cọc hủy hóa đơn đặt hộ #{$maHoaDon} ({$soTranHuy} trận) qua VNPay{$thongTinCK}"
                        ]);
                    }

                    ThongBao::create([
                        'MaNguoiDung'  => $khach->MaNguoiDung,
                        'TieuDe'       => "Hóa đơn đặt sân #{$maHoaDon} đã được hủy",
                        'NoiDung'      => "Ban quản lý đã hỗ trợ hủy toàn bộ {$soTranHuy} trận trong hóa đơn #{$maHoaDon}. Số tiền cọc " . number_format($tongTienHoan, 0, ',', '.') . "đ đã được hoàn trả qua cổng VNPay{$thongTinCK}.",
                        'LoaiThongBao' => 'DatSan'
                    ]);
                }

                DatSan::whereHas('chiTietHoaDon', function ($q) use ($maHoaDon) {
                        $q->where('MaHoaDonDatSan', $maHoaDon);
                    })
                    ->where('TrangThai', 'DaCoc')
                    ->update([
                        'TrangThai'      => 'DaHuy',
                        'MaNhanVienXuLy' => $maNhanVienXuLy
                    ]);

                self::dongBoHoaDonDatSan($maHoaDon);

                DB::commit();

                if ($first->MaNguoiDung !== null) {
                    broadcast(new \App\Events\UserDataUpdated($first->MaNguoiDung))->toOthers();
                }
            }

            broadcast(new \App\Events\AdminDataUpdated())->toOthers();
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            return redirect($returnPage . '?vnpay_refund=success');
        } catch (\Exception $e) {
            DB::rollBack();
            return redirect($returnPage . '?vnpay_refund=error');
        }
    }
}