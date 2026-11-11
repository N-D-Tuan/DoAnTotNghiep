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

            if ($user->Email) {
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
        // Tự động gộp các hóa đơn giải đấu bị tách lẻ thành 1 hóa đơn duy nhất
        self::gopHoaDonGiaiDauBiTach();

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
        // Tự động gộp các hóa đơn giải đấu bị tách lẻ thành 1 hóa đơn duy nhất
        self::gopHoaDonGiaiDauBiTach();

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

            if ($request->trang_thai === 'DaHuy') {
                if ($datSan->MaNguoiDung !== null) {
                    // Khách thành viên -> Hoàn 100% cọc về Ví
                    $user = NguoiDung::find($datSan->MaNguoiDung);
                    if ($user) {
                        $tienHoan = $datSan->TienCoc;
                        $soDuTruoc = $user->SoDuVi;
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
                } else {
                    // Khách vãng lai & Đặt sân hộ -> Kiểm tra OTP gửi qua EmailNguoiDat
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
                    $noiDung = "Ban quản lý đã hỗ trợ hủy lịch đặt sân tại {$tenSan} lúc {$gioDa} ngày {$ngayDa}. Số tiền cọc " . number_format($datSan->TienCoc, 0, ',', '.') . "đ đã được hoàn lại vào ví của bạn.";
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
     * 2. ADMIN / QUẢN LÝ / NHÂN VIÊN ĐẶT SÂN HỘ (Lưu trực tiếp vào TenNguoiDat, SDTNguoiDat, EmailNguoiDat như Khách vãng lai - Không tạo tài khoản)
     */
    public function datSanOffline(Request $request)
    {
        $userDangNhap = auth()->user();
        if (!in_array($userDangNhap->VaiTro, ['Admin', 'QuanLySan', 'NhanVien'])) {
            return response()->json(['success' => false, 'message' => 'Không có quyền thực hiện!'], 403);
        }

        $request->validate([
            'ho_ten'      => ['required', 'string', 'min:2', 'max:100', 'regex:/^[\p{L}\s]+$/u'],
            'sdt_khach'   => ['required', 'regex:/^0[0-9]{9}$/'],
            'email_khach' => ['required', 'email', 'max:100'],
            'tien_coc'    => ['required', 'numeric', 'min:0'],
            'slots'       => ['required', 'array', 'min:1']
        ], [
            'ho_ten.required'      => 'Vui lòng nhập họ và tên khách hàng!',
            'ho_ten.min'           => 'Họ và tên phải có ít nhất 2 ký tự!',
            'ho_ten.regex'         => 'Họ và tên chỉ được chứa chữ cái và khoảng trắng!',
            'sdt_khach.required'   => 'Vui lòng nhập số điện thoại khách hàng!',
            'sdt_khach.regex'      => 'Số điện thoại không hợp lệ (phải gồm 10 chữ số, bắt đầu bằng số 0)!',
            'email_khach.required' => 'Vui lòng nhập địa chỉ Email khách hàng!',
            'email_khach.email'    => 'Địa chỉ Email không đúng định dạng!',
            'tien_coc.required'    => 'Vui lòng nhập số tiền đặt cọc!',
            'slots.required'       => 'Giỏ hàng đặt sân đang trống!'
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

            $hoTenKhach = trim($request->ho_ten);
            $sdtKhach   = trim($request->sdt_khach);
            $emailKhach = trim($request->email_khach);

            $tongTienGocToanBo = array_reduce($request->slots, function ($carry, $s) {
                return $carry + (float) ($s['price'] ?? 0);
            }, 0);

            $clusterGroups = self::gomNhomSlotsTheoCumSan($request->slots);

            // BƯỚC B: Tách Hóa đơn theo từng Cụm sân và lưu thông tin vào TenNguoiDat, SDTNguoiDat, EmailNguoiDat (MaNguoiDung = null)
            $danhSachMaHoaDon = [];
            $cacVeVuaTao = [];
            $htmlTatCaHoaDonEmail = '';
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
                $calc = self::tinhToanKhuyenMaiVaVAT($tongTienGocCum, null, null, $clusterSlots, $maCumSan);

                $hoaDon = HoaDonDatSan::create([
                    'MaNguoiDung'         => null,
                    'MaGiaoDich'          => null,
                    'MaKhuyenMai'         => null,
                    'TongTien'            => $calc['tong_tien_hoa_don'],
                    'ThueVAT'             => $calc['thue_vat'],
                    'PhuongThucThanhToan' => 'TienMat',
                    'TrangThai'           => 'DaCoc'
                ]);

                $danhSachMaHoaDon[] = $hoaDon->MaHoaDonDatSan;
                $cacVeCuaHoaDonNay = [];

                $soLuongSlotCum = count($clusterSlots);
                $tienCocMoiSlot = ($tienCocCumNay > 0 && $soLuongSlotCum > 0) ? round($tienCocCumNay / $soLuongSlotCum) : 0;

                foreach ($clusterSlots as $index => $slot) {
                    $giaKhungGio = (float) $slot['price'];
                    $cocThucTe = $tienCocMoiSlot;
                    if ($index === $soLuongSlotCum - 1) {
                        $cocThucTe = max(0, $tienCocCumNay - ($tienCocMoiSlot * ($soLuongSlotCum - 1)));
                    }

                    $veMoi = DatSan::create([
                        'MaNguoiDung'    => null,
                        'TenNguoiDat'    => $hoTenKhach,
                        'SDTNguoiDat'    => $sdtKhach,
                        'EmailNguoiDat'  => $emailKhach,
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

                    $thongTinVe = [
                        'maHoaDon' => $hoaDon->MaHoaDonDatSan,
                        'maVe'     => 'PT-' . $veMoi->MaDatSan,
                        'tenSan'   => $slot['pitchName'] ?? 'Sân bóng',
                        'cumSan'   => $slot['clusterName'] ?? $groupInfo['ten_cum_san'],
                        'ngay'     => $slot['dateDisplay'] ?? date('d/m/Y', strtotime($slot['dateDb'])),
                        'gio'      => $slot['timeStr'] ?? '',
                        'donGia'   => number_format($giaKhungGio, 0, ',', '.') . 'đ',
                        'tienCoc'  => number_format($cocThucTe, 0, ',', '.') . 'đ',
                        'conLai'   => number_format(max(0, $giaKhungGio - $cocThucTe), 0, ',', '.') . 'đ'
                    ];

                    $cacVeCuaHoaDonNay[] = $thongTinVe;
                    $cacVeVuaTao[] = $thongTinVe;
                }

                $hoaDon->load('datSans');
                $htmlTatCaHoaDonEmail .= self::buildEmailHoaDonHtml($hoaDon, $hoTenKhach, $sdtKhach, $cacVeCuaHoaDonNay, 0);
            }

            DB::commit();

            // Gửi Email Hóa đơn điện tử & Vé QR Code tới Email khách
            if ($emailKhach) {
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
                        <p>Chào <strong>{$hoTenKhach}</strong>,</p>
                        <p>Cảm ơn bạn đã đặt sân trực tiếp tại quầy DN Football. Dưới đây là <strong>Hóa đơn đặt sân (#{$dsMaHDStr})</strong> và <strong>Vé điện tử QR Code</strong> của bạn:</p>
                        {$htmlTatCaHoaDonEmail}
                        <h3 style='margin-top:24px; color:#0f172a;'>Danh sách Vé Điện Tử (Check-in tại sân):</h3>
                        {$htmlVe}
                    ";

                    Mail::html($noiDungMail, function ($message) use ($emailKhach, $dsMaHDStr) {
                        $message->to($emailKhach)
                                ->subject("Hóa Đơn #{$dsMaHDStr} & Vé Đặt Sân - DN Football");
                    });
                } catch (\Exception $mailEx) {
                    \Illuminate\Support\Facades\Log::error('Lỗi gửi mail đặt sân hộ: ' . $mailEx->getMessage());
                }
            }

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
     * - Trận 'KhongDen' (bùng sân): Chỉ thu đúng TienCoc (KHÔNG tính Thuế VAT 8%, KHÔNG tính vào điều kiện Khuyến mãi)
     * - Trận 'DaCoc' / 'HoanThanh': Tính Khuyến mãi và Thuế VAT 8% (làm tròn dưới về hàng nghìn)
     * - Nếu sau khi hủy/bùng sân mà tổng tiền các trận (DaCoc + HoanThanh) không còn đủ điều kiện tối thiểu của Khuyến mãi:
     *   + Tự động hoàn lại 1 lượt dùng (decrement SoLuongDaDung)
     *   + Gỡ MaKhuyenMai = null khỏi HoaDonDatSan
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
                $tongTienChiuThueToanGio = 0; // Chỉ tính các trận DaCoc và HoanThanh
                $tienChiuThueTheoHD = [];
                $tienCocKhongDenTheoHD = [];
                $trangThaiTheoTungHD = [];

                foreach ($cacHoaDonCungGiaoDich as $hdItem) {
                    $dsList = $hdItem->datSans;
                    if ($dsList->contains('TrangThai', 'DaCoc')) $st = 'DaCoc';
                    elseif ($dsList->contains('TrangThai', 'HoanThanh')) $st = 'HoanThanh';
                    elseif ($dsList->contains('TrangThai', 'KhongDen')) $st = 'KhongDen';
                    else $st = 'DaHuy';

                    $trangThaiTheoTungHD[$hdItem->MaHoaDonDatSan] = $st;

                    if ($st === 'DaHuy') {
                        $tienChiuThueTheoHD[$hdItem->MaHoaDonDatSan] = 0;
                        $tienCocKhongDenTheoHD[$hdItem->MaHoaDonDatSan] = 0;
                    } else {
                        $subTaxable = (float) $dsList->whereIn('TrangThai', ['DaCoc', 'HoanThanh'])->sum('TongTien');
                        $subNoShow  = (float) $dsList->where('TrangThai', 'KhongDen')->sum('TienCoc');

                        $tienChiuThueTheoHD[$hdItem->MaHoaDonDatSan] = $subTaxable;
                        $tienCocKhongDenTheoHD[$hdItem->MaHoaDonDatSan] = $subNoShow;
                        $tongTienChiuThueToanGio += $subTaxable;
                    }
                }

                $tatCaDaHuy = collect($trangThaiTheoTungHD)->every(fn($st) => $st === 'DaHuy');
                $khongDuDieuKienNua = ($tongTienChiuThueToanGio <= 0 || $tongTienChiuThueToanGio < (float) $km->GiaTriHoaDonToiThieu);

                // Nếu tất cả bị hủy HOẶC tổng tiền sân (DaCoc + HoanThanh) không còn đủ điều kiện tối thiểu -> Hoàn lại 1 lượt dùng & gỡ mã!
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
                        if ($stHD === 'DaHuy') {
                            $tienGocHD = (float) $hdItem->datSans->sum('TongTien');
                            $vatMoi = self::tinhThueVATLamTronDuoi($tienGocHD);
                            $hdItem->update([
                                'MaKhuyenMai' => null,
                                'TongTien'    => $tienGocHD + $vatMoi,
                                'ThueVAT'     => $vatMoi,
                                'TrangThai'   => 'DaHuy'
                            ]);
                        } else {
                            // VAT chỉ tính trên phần tiền chịu thuế (DaCoc + HoanThanh), KHÔNG tính VAT trên phần tiền cọc KhongDen
                            $taxable = $tienChiuThueTheoHD[$idHD];
                            $noShow  = $tienCocKhongDenTheoHD[$idHD];
                            $vatMoi  = self::tinhThueVATLamTronDuoi($taxable);
                            $hdItem->update([
                                'MaKhuyenMai' => null,
                                'TongTien'    => $taxable + $vatMoi + $noShow,
                                'ThueVAT'     => $vatMoi,
                                'TrangThai'   => $stHD
                            ]);
                        }
                    }
                    return;
                }

                // Nếu vẫn đủ điều kiện tối thiểu -> Tính lại tổng giảm giá và phân bổ lại
                $tongGiamMoi = 0;
                if ($km->LoaiKhuyenMai === 'PhanTram') {
                    $tongGiamMoi = round($tongTienChiuThueToanGio * ((float) $km->GiaTri / 100));
                    if ((float) $km->GiaTriToiDa > 0 && $tongGiamMoi > (float) $km->GiaTriToiDa) {
                        $tongGiamMoi = (float) $km->GiaTriToiDa;
                    }
                } else {
                    $tongGiamMoi = (float) $km->GiaTri;
                }
                $tongGiamMoi = min($tongTienChiuThueToanGio, $tongGiamMoi);

                $daPhanBo = 0;
                $activeHDIds = array_keys(array_filter($tienChiuThueTheoHD, fn($v) => $v > 0));
                $lastActiveId = end($activeHDIds);

                foreach ($cacHoaDonCungGiaoDich as $hdItem) {
                    $idHD = $hdItem->MaHoaDonDatSan;
                    $stHD = $trangThaiTheoTungHD[$idHD];

                    if ($stHD === 'DaHuy') {
                        $tienGocHuy = (float) $hdItem->datSans->sum('TongTien');
                        $vatHuy = self::tinhThueVATLamTronDuoi($tienGocHuy);
                        $hdItem->update([
                            'MaKhuyenMai' => null,
                            'TongTien'    => $tienGocHuy + $vatHuy,
                            'ThueVAT'     => $vatHuy,
                            'TrangThai'   => 'DaHuy'
                        ]);
                    } else {
                        $tienCum = $tienChiuThueTheoHD[$idHD];
                        $noShow  = $tienCocKhongDenTheoHD[$idHD];
                        $giamCum = 0;

                        if ($tongGiamMoi > 0 && $tongTienChiuThueToanGio > 0 && $tienCum > 0) {
                            if ($idHD === $lastActiveId) {
                                $giamCum = max(0, $tongGiamMoi - $daPhanBo);
                            } else {
                                $giamCum = round($tongGiamMoi * ($tienCum / $tongTienChiuThueToanGio));
                                $daPhanBo += $giamCum;
                            }
                            $giamCum = min($tienCum, $giamCum);
                        }

                        $sauGiam = max(0, $tienCum - $giamCum);
                        $vatMoi  = self::tinhThueVATLamTronDuoi($sauGiam);

                        $hdItem->update([
                            'MaKhuyenMai' => ($tienCum > 0) ? $km->MaKhuyenMai : null,
                            'TongTien'    => $sauGiam + $vatMoi + $noShow,
                            'ThueVAT'     => $vatMoi,
                            'TrangThai'   => $stHD
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

        $maKhuyenMaiMoi = $hoaDon->MaKhuyenMai;

        if ($trangThaiHoaDon === 'DaHuy') {
            $tongTienSanGoc = (float) $cacDatSan->sum('TongTien');
            $vatHuy = self::tinhThueVATLamTronDuoi($tongTienSanGoc);

            if ($trangThaiCu !== 'DaHuy' && $hoaDon->MaKhuyenMai && $km) {
                if ($km->SoLuongDaDung > 0) {
                    $km->decrement('SoLuongDaDung');
                    if ($km->TrangThai === 'HetHan' && now()->lte(Carbon::parse($km->NgayKetThuc))) {
                        $km->update(['TrangThai' => 'DangApDung']);
                    }
                }
            }

            $hoaDon->update([
                'MaKhuyenMai' => null,
                'TongTien'    => $tongTienSanGoc + $vatHuy,
                'ThueVAT'     => $vatHuy,
                'TrangThai'   => 'DaHuy',
            ]);
            return;
        }

        // Tách riêng:
        // 1. Các trận DaCoc + HoanThanh -> Được xét Khuyến mãi và tính Thuế VAT 8%
        // 2. Các trận KhongDen -> Chỉ thu đúng TienCoc (KHÔNG tính Thuế VAT, KHÔNG xét Khuyến mãi)
        $tienSanChiuThue = (float) $cacDatSan->whereIn('TrangThai', ['DaCoc', 'HoanThanh'])->sum('TongTien');
        $tienCocKhongDen = (float) $cacDatSan->where('TrangThai', 'KhongDen')->sum('TienCoc');

        if ($hoaDon->MaKhuyenMai && $km && ($tienSanChiuThue <= 0 || $tienSanChiuThue < (float) $km->GiaTriHoaDonToiThieu)) {
            if ($km->SoLuongDaDung > 0) {
                $km->decrement('SoLuongDaDung');
                if ($km->TrangThai === 'HetHan' && now()->lte(Carbon::parse($km->NgayKetThuc))) {
                    $km->update(['TrangThai' => 'DangApDung']);
                }
            }
            $maKhuyenMaiMoi = null;
        }

        $soTienGiam = 0;
        if ($maKhuyenMaiMoi && $km && $tienSanChiuThue >= (float) $km->GiaTriHoaDonToiThieu) {
            if ($km->LoaiKhuyenMai === 'PhanTram') {
                $soTienGiam = round($tienSanChiuThue * ((float) $km->GiaTri / 100));
                if ((float) $km->GiaTriToiDa > 0 && $soTienGiam > (float) $km->GiaTriToiDa) {
                    $soTienGiam = (float) $km->GiaTriToiDa;
                }
            } else {
                $soTienGiam = (float) $km->GiaTri;
            }
            $soTienGiam = min($tienSanChiuThue, $soTienGiam);
        }

        $tienSauGiam = max(0, $tienSanChiuThue - $soTienGiam);
        $thueVATMoi  = self::tinhThueVATLamTronDuoi($tienSauGiam);
        $tongTienMoi = $tienSauGiam + $thueVATMoi + $tienCocKhongDen;

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

    /**
     * Tự động gộp các Hóa đơn đặt sân bị tách lẻ của cùng 1 Giải đấu (MaGiaiDau) về 1 Hóa đơn duy nhất
     */
    public static function gopHoaDonGiaiDauBiTach()
    {
        $danhSachMaGiaiDau = DatSan::whereNotNull('MaGiaiDau')
            ->distinct()
            ->pluck('MaGiaiDau');

        if ($danhSachMaGiaiDau->isEmpty()) {
            return;
        }

        foreach ($danhSachMaGiaiDau as $maGiaiDau) {
            $cacDatSan = DatSan::with('chiTietHoaDon')
                ->where('MaGiaiDau', $maGiaiDau)
                ->orderBy('MaDatSan', 'asc')
                ->get();

            if ($cacDatSan->isEmpty()) {
                continue;
            }

            // Lấy danh sách các MaHoaDonDatSan đang gắn với các trận của giải đấu này
            $maHoaDonIds = $cacDatSan->map(function ($ds) {
                return $ds->chiTietHoaDon ? $ds->chiTietHoaDon->MaHoaDonDatSan : null;
            })->filter()->unique()->values();

            $chuaDuChiTiet = $cacDatSan->contains(function ($ds) {
                return $ds->chiTietHoaDon === null;
            });

            // Nếu tất cả các trận của giải đã nằm chung trong đúng 1 Hóa đơn và đủ ChiTietHoaDon
            if ($maHoaDonIds->count() === 1 && !$chuaDuChiTiet) {
                $maHD = $maHoaDonIds->first();
                self::dongBoHoaDonDatSan($maHD);
                continue;
            }

            DB::beginTransaction();
            try {
                $firstDS = $cacDatSan->first();
                $maHoaDonChinh = $maHoaDonIds->first();

                // Nếu giải đấu chưa có hóa đơn nào thì tạo mới 1 hóa đơn chính
                if (!$maHoaDonChinh) {
                    $tongGoc = (float) $cacDatSan->sum('TongTien');
                    $vat = self::tinhThueVATLamTronDuoi($tongGoc);
                    $hdMoi = HoaDonDatSan::create([
                        'MaNguoiDung'         => $firstDS->MaNguoiDung,
                        'MaGiaoDich'          => null,
                        'MaKhuyenMai'         => null,
                        'TongTien'            => $tongGoc + $vat,
                        'ThueVAT'             => $vat,
                        'PhuongThucThanhToan' => 'ViDienTu',
                        'TrangThai'           => 'DaCoc'
                    ]);
                    $maHoaDonChinh = $hdMoi->MaHoaDonDatSan;
                }

                // Gom toàn bộ ChiTietHoaDon của tất cả các trận trong giải đấu về $maHoaDonChinh
                foreach ($cacDatSan as $ds) {
                    DB::table('ChiTietHoaDon')->updateOrInsert(
                        ['MaDatSan' => $ds->MaDatSan],
                        [
                            'MaHoaDonDatSan' => $maHoaDonChinh,
                            'DonGia'         => $ds->TongTien ?? 0
                        ]
                    );
                }

                // Xóa các hóa đơn bị tách lẻ dư thừa của giải đấu này
                $maHoaDonThua = $maHoaDonIds->filter(fn($id) => $id !== $maHoaDonChinh)->values();
                if ($maHoaDonThua->isNotEmpty()) {
                    foreach ($maHoaDonThua as $idThua) {
                        $conTranKhac = DB::table('ChiTietHoaDon')
                            ->where('MaHoaDonDatSan', $idThua)
                            ->exists();
                        if (!$conTranKhac) {
                            HoaDonDatSan::where('MaHoaDonDatSan', $idThua)->delete();
                        }
                    }
                }

                // Đồng bộ lại Tổng tiền, Thuế VAT (8%) và Trạng thái của Hóa đơn chính sau khi đã gộp đủ các trận
                self::dongBoHoaDonDatSan($maHoaDonChinh);

                DB::commit();
            } catch (\Exception $e) {
                DB::rollBack();
            }
        }
    }

    public function layChiTietHoaDonDatSan($maHoaDon)
    {
        // Ghi nhận MaGiaiDau (nếu $maHoaDon thuộc về 1 trận giải đấu trước khi gộp)
        $datSanThuocHD = DatSan::whereHas('chiTietHoaDon', function ($q) use ($maHoaDon) {
            $q->where('MaHoaDonDatSan', $maHoaDon);
        })->first();
        $maGiaiDauLienQuan = $datSanThuocHD ? $datSanThuocHD->MaGiaiDau : null;

        // Tự động gộp các hóa đơn giải đấu bị tách lẻ
        self::gopHoaDonGiaiDauBiTach();

        $hoaDon = HoaDonDatSan::with(['nguoiDung', 'khuyenMai', 'chiTietHoaDons', 'datSans.sanBong.cumSan', 'datSans.khungGio', 'datSans.giaiDau'])
            ->where('MaHoaDonDatSan', $maHoaDon)
            ->first();

        // Nếu người dùng bấm vào mã hóa đơn lẻ cũ đã được gộp sang hóa đơn chính của giải đấu
        if (!$hoaDon && $maGiaiDauLienQuan) {
            $hoaDon = HoaDonDatSan::with(['nguoiDung', 'khuyenMai', 'chiTietHoaDons', 'datSans.sanBong.cumSan', 'datSans.khungGio', 'datSans.giaiDau'])
                ->whereHas('datSans', function ($q) use ($maGiaiDauLienQuan) {
                    $q->where('MaGiaiDau', $maGiaiDauLienQuan);
                })
                ->first();
        }

        if (!$hoaDon) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy hóa đơn đặt sân!'], 404);
        }

        // Sắp xếp toàn bộ các trận trong hóa đơn theo Ngày đá và Khung giờ tăng dần
        $sortedDatSans = $hoaDon->datSans->sortBy(function ($ds) {
            $ngay = $ds->NgayDa ?? '';
            $gio  = $ds->khungGio ? $ds->khungGio->GioBatDau : '';
            return $ngay . ' ' . $gio;
        })->values();
        $hoaDon->setRelation('datSans', $sortedDatSans);

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
        $selectedIds = $request->input('ma_dat_sans', []);

        $query = DatSan::with(['sanBong.cumSan', 'khungGio'])
            ->whereHas('chiTietHoaDon', function ($q) use ($maHoaDon) {
                $q->where('MaHoaDonDatSan', $maHoaDon);
            })
            ->where('TrangThai', 'DaCoc');

        if (is_array($selectedIds) && count($selectedIds) > 0) {
            $query->whereIn('MaDatSan', $selectedIds);
        }

        $cacTran = $query->get();

        if ($cacTran->isEmpty()) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy trận Đã cọc nào hợp lệ để gửi OTP hủy!']);
        }

        $first = $cacTran->first();
        if ($first->MaNguoiDung !== null || !$first->EmailNguoiDat) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy email khách vãng lai của hóa đơn này!']);
        }

        // Đếm tổng số trận đang Đã cọc của cả hóa đơn để phân biệt Hủy 1 phần hay Hủy toàn bộ
        $tongTranDaCocTrongHD = DatSan::whereHas('chiTietHoaDon', function ($q) use ($maHoaDon) {
                $q->where('MaHoaDonDatSan', $maHoaDon);
            })
            ->where('TrangThai', 'DaCoc')
            ->count();

        $sortedIds = $cacTran->pluck('MaDatSan')->map(fn($id) => (string) $id)->sort()->values()->toArray();
        $otp = (string) rand(100000, 999999);

        // Lưu kèm danh sách ID các trận được chọn vào Cache để đảm bảo lúc bấm Xác nhận không bị lệch trận
        \Illuminate\Support\Facades\Cache::put('guest_cancel_invoice_otp_' . $maHoaDon, [
            'otp'         => $otp,
            'ma_dat_sans' => $sortedIds
        ], now()->addMinutes(5));

        $tongCoc = number_format($cacTran->sum('TienCoc'), 0, ',', '.') . 'đ';
        $soTran = $cacTran->count();
        $laHuyToanBo = ($soTran === $tongTranDaCocTrongHD);

        $danhSachTranHtml = '';
        foreach ($cacTran as $dsItem) {
            $tenSanItem = $dsItem->sanBong ? $dsItem->sanBong->TenSan : 'Sân bóng';
            $cumSanItem = ($dsItem->sanBong && $dsItem->sanBong->cumSan) ? $dsItem->sanBong->cumSan->TenCumSan : '';
            $ngayDaItem = date('d/m/Y', strtotime($dsItem->NgayDa));
            $gioDaItem  = $dsItem->khungGio ? substr($dsItem->khungGio->GioBatDau, 0, 5) . ' - ' . substr($dsItem->khungGio->GioKetThuc, 0, 5) : '';
            $cocItem    = number_format($dsItem->TienCoc, 0, ',', '.') . 'đ';

            $danhSachTranHtml .= "
                <li style='margin-bottom: 4px;'>
                    <strong>Vé #PT-{$dsItem->MaDatSan}:</strong> {$tenSanItem} ({$cumSanItem}) — {$gioDaItem} ngày {$ngayDaItem} (Cọc: <strong>{$cocItem}</strong>)
                </li>
            ";
        }

        $moTaYeuCau = $laHuyToanBo
            ? "hủy toàn bộ <strong>{$soTran} trận</strong> trong hóa đơn <strong>#{$maHoaDon}</strong>"
            : "hủy <strong>{$soTran}/{$tongTranDaCocTrongHD} trận</strong> được chọn trong hóa đơn <strong>#{$maHoaDon}</strong>";

        try {
            $noiDungMail = "
                <h2>Mã xác thực (OTP) hủy lịch đặt sân - Hóa đơn #{$maHoaDon}</h2>
                <p>Chào <strong>{$first->TenNguoiDat}</strong>,</p>
                <p>Hệ thống DN Football vừa nhận được yêu cầu {$moTaYeuCau}:</p>
                <ul>
                    {$danhSachTranHtml}
                </ul>
                <p><strong>Tổng số tiền cọc hoàn trả (1 lần):</strong> <span style='color:#10b981; font-weight:bold; font-size:16px;'>{$tongCoc}</span></p>
                <p>Mã OTP xác nhận của bạn là: <strong style='font-size: 22px; color: #e11d48; letter-spacing: 2px;'>{$otp}</strong> (Hiệu lực 5 phút)</p>
                <p><em>Vui lòng đọc mã OTP này cho nhân viên/quản lý sân để hoàn tất thủ tục hủy lịch và nhận lại tiền cọc.</em></p>
            ";
            Mail::html($noiDungMail, function ($message) use ($first, $maHoaDon, $soTran) {
                $message->to($first->EmailNguoiDat)
                        ->subject("Mã OTP Xác Nhận Hủy {$soTran} Trận (HĐ #{$maHoaDon}) - DN Football");
            });

            return response()->json([
                'success' => true,
                'message' => "Đã gửi mã OTP xác nhận hủy {$soTran} trận tới email: {$first->EmailNguoiDat}"
            ]);
        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => 'Lỗi gửi email OTP: ' . $e->getMessage()]);
        }
    }

    public function huyHoaDonAdmin(Request $request, $maHoaDon)
    {
        $userDangNhap = auth()->user();
        $selectedIds = $request->input('ma_dat_sans', []);

        $tatCaTranDaCoc = DatSan::with(['sanBong.cumSan', 'khungGio'])
            ->whereHas('chiTietHoaDon', function ($q) use ($maHoaDon) {
                $q->where('MaHoaDonDatSan', $maHoaDon);
            })
            ->where('TrangThai', 'DaCoc')
            ->get();

        if ($tatCaTranDaCoc->isEmpty()) {
            return response()->json(['success' => false, 'message' => 'Hóa đơn này không còn trận nào ở trạng thái Đã cọc để hủy!']);
        }

        // Lọc ra các trận được chọn hủy (nếu không truyền ma_dat_sans thì mặc định hủy toàn bộ trận Đã cọc)
        if (is_array($selectedIds) && count($selectedIds) > 0) {
            $selectedStrIds = array_map('strval', $selectedIds);
            $cacTranCanHuy = $tatCaTranDaCoc->filter(function ($ds) use ($selectedStrIds) {
                return in_array((string) $ds->MaDatSan, $selectedStrIds, true);
            })->values();
        } else {
            $cacTranCanHuy = $tatCaTranDaCoc;
        }

        if ($cacTranCanHuy->isEmpty()) {
            return response()->json(['success' => false, 'message' => 'Vui lòng chọn ít nhất 1 trận ở trạng thái Đã cọc để hủy!']);
        }

        $first = $cacTranCanHuy->first();
        $tongSoTranDaCocBanDau = $tatCaTranDaCoc->count();
        $soTranHuy = $cacTranCanHuy->count();
        $laHuyToanBo = ($soTranHuy === $tongSoTranDaCocBanDau);
        $tongTienHoan = (float) $cacTranCanHuy->sum('TienCoc');
        $idsCanHuy = $cacTranCanHuy->pluck('MaDatSan')->map(fn($id) => (string) $id)->sort()->values()->toArray();

        DB::beginTransaction();
        try {
            if ($first->MaNguoiDung !== null) {
                // LUỒNG 1: KHÁCH THÀNH VIÊN -> Hoàn cọc vào Ví điện tử
                $khach = NguoiDung::find($first->MaNguoiDung);
                if ($khach) {
                    $soDuTruoc = $khach->SoDuVi;
                    $soDuSau = $soDuTruoc + $tongTienHoan;
                    $khach->update(['SoDuVi' => $soDuSau]);

                    $noiDungGD = $laHuyToanBo
                        ? "Hỗ trợ hủy toàn bộ hóa đơn đặt sân #{$maHoaDon} ({$soTranHuy} trận) - Hoàn vào ví"
                        : "Hỗ trợ hủy {$soTranHuy} trận trong hóa đơn #{$maHoaDon} - Hoàn vào ví";

                    if ($tongTienHoan > 0) {
                        GiaoDich::create([
                            'MaNguoiDung'    => $khach->MaNguoiDung,
                            'MaNhanVienXuLy' => $userDangNhap->MaNguoiDung,
                            'LoaiGiaoDich'   => 'HoanTienHuySan',
                            'DongTien'       => 'Cong',
                            'SoTien'         => $tongTienHoan,
                            'SoDuTruoc'      => $soDuTruoc,
                            'SoDuSau'        => $soDuSau,
                            'NoiDung'        => $noiDungGD
                        ]);
                    }

                    $tieuDeTB = $laHuyToanBo
                        ? "Hóa đơn đặt sân #{$maHoaDon} đã được hủy"
                        : "Đã hủy {$soTranHuy} trận trong hóa đơn #{$maHoaDon}";

                    $noiDungTB = $laHuyToanBo
                        ? "Ban quản lý đã hỗ trợ hủy toàn bộ {$soTranHuy} trận trong hóa đơn #{$maHoaDon}. Số tiền cọc " . number_format($tongTienHoan, 0, ',', '.') . "đ đã được hoàn lại vào ví của bạn."
                        : "Ban quản lý đã hỗ trợ hủy {$soTranHuy} trận được chọn trong hóa đơn #{$maHoaDon}. Số tiền cọc " . number_format($tongTienHoan, 0, ',', '.') . "đ đã được hoàn lại vào ví của bạn.";

                    ThongBao::create([
                        'MaNguoiDung'  => $khach->MaNguoiDung,
                        'TieuDe'       => $tieuDeTB,
                        'NoiDung'      => $noiDungTB,
                        'LoaiThongBao' => 'DatSan'
                    ]);
                }
            } else {
                // LUỒNG 2: KHÁCH VÃNG LAI & ĐẶT SÂN HỘ -> Xác thực OTP qua Email
                $otpInput = trim($request->input('otp', ''));
                $cachedData = \Illuminate\Support\Facades\Cache::get('guest_cancel_invoice_otp_' . $maHoaDon);

                $cachedOtp = is_array($cachedData) ? ($cachedData['otp'] ?? null) : $cachedData;
                $cachedIds = is_array($cachedData) ? ($cachedData['ma_dat_sans'] ?? null) : null;

                if (!$otpInput || !$cachedOtp || $otpInput !== (string) $cachedOtp) {
                    DB::rollBack();
                    return response()->json([
                        'success' => false,
                        'message' => 'Mã OTP không chính xác hoặc đã hết hạn! Vui lòng kiểm tra lại.'
                    ]);
                }

                // Kiểm tra danh sách trận lúc bấm Xác nhận phải khớp với danh sách trận lúc gửi OTP
                if (is_array($cachedIds) && $cachedIds !== $idsCanHuy) {
                    DB::rollBack();
                    return response()->json([
                        'success' => false,
                        'message' => 'Danh sách trận chọn hủy đã thay đổi sau khi gửi OTP! Vui lòng bấm "Gửi lại OTP" để cập nhật đúng số tiền hoàn trả.'
                    ]);
                }

                \Illuminate\Support\Facades\Cache::forget('guest_cancel_invoice_otp_' . $maHoaDon);
            }

            // Chỉ cập nhật trạng thái DaHuy cho đúng các trận được chọn
            DatSan::whereIn('MaDatSan', $idsCanHuy)
                ->where('TrangThai', 'DaCoc')
                ->update([
                    'TrangThai'      => 'DaHuy',
                    'MaNhanVienXuLy' => $userDangNhap->MaNguoiDung
                ]);

            // Đồng bộ lại TongTien, ThueVAT, KhuyenMai và TrangThai của HoaDonDatSan
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

            // GỬI 1 EMAIL XÁC NHẬN HỦY & HOÀN CỌC DUY NHẤT CHO KHÁCH VÃNG LAI / ĐẶT SÂN HỘ
            if ($first->MaNguoiDung === null && $first->EmailNguoiDat) {
                try {
                    $tongCocStr = number_format($tongTienHoan, 0, ',', '.') . 'đ';
                    $danhSachTranHtml = '';

                    foreach ($cacTranCanHuy as $dsItem) {
                        $tenSanItem = $dsItem->sanBong ? $dsItem->sanBong->TenSan : 'Sân bóng';
                        $cumSanItem = ($dsItem->sanBong && $dsItem->sanBong->cumSan) ? $dsItem->sanBong->cumSan->TenCumSan : '';
                        $ngayDaItem = date('d/m/Y', strtotime($dsItem->NgayDa));
                        $gioDaItem  = $dsItem->khungGio ? substr($dsItem->khungGio->GioBatDau, 0, 5) . ' - ' . substr($dsItem->khungGio->GioKetThuc, 0, 5) : '';
                        $cocItem    = number_format($dsItem->TienCoc, 0, ',', '.') . 'đ';

                        $danhSachTranHtml .= "
                            <li style='margin-bottom: 4px;'>
                                <strong>Vé #PT-{$dsItem->MaDatSan}:</strong> {$tenSanItem} ({$cumSanItem}) — {$gioDaItem} ngày {$ngayDaItem} (Cọc: <strong>{$cocItem}</strong>)
                            </li>
                        ";
                    }

                    $tieuDeMail = $laHuyToanBo
                        ? "Xác nhận hủy toàn bộ Hóa đơn đặt sân #{$maHoaDon} thành công"
                        : "Xác nhận hủy {$soTranHuy} trận trong Hóa đơn đặt sân #{$maHoaDon} thành công";

                    $moTaMail = $laHuyToanBo
                        ? "Toàn bộ <strong>{$soTranHuy} trận</strong> trong hóa đơn đặt sân <strong>#{$maHoaDon}</strong> của bạn đã được hủy thành công theo yêu cầu:"
                        : "<strong>{$soTranHuy} trận</strong> dưới đây trong hóa đơn đặt sân <strong>#{$maHoaDon}</strong> của bạn đã được hủy thành công theo yêu cầu (các trận còn lại trong hóa đơn vẫn giữ nguyên hiệu lực):";

                    $mailHuyHD = "
                        <h2>{$tieuDeMail}</h2>
                        <p>Chào <strong>{$first->TenNguoiDat}</strong>,</p>
                        <p>{$moTaMail}</p>
                        <ul>
                            {$danhSachTranHtml}
                        </ul>
                        <p><strong>Tổng số tiền cọc hoàn lại:</strong> <span style='color:#10b981; font-weight:bold; font-size:16px;'>{$tongCocStr}</span></p>
                        <p>Cảm ơn bạn đã sử dụng dịch vụ của DN Football!</p>
                    ";

                    Mail::html($mailHuyHD, function ($message) use ($first, $maHoaDon, $soTranHuy, $laHuyToanBo) {
                        $subj = $laHuyToanBo
                            ? "Xác nhận hủy Hóa đơn đặt sân #{$maHoaDon} - DN Football"
                            : "Xác nhận hủy {$soTranHuy} trận (HĐ #{$maHoaDon}) - DN Football";
                        $message->to($first->EmailNguoiDat)->subject($subj);
                    });
                } catch (\Exception $mailEx) {
                    \Illuminate\Support\Facades\Log::error('Lỗi gửi mail hủy hóa đơn khách vãng lai: ' . $mailEx->getMessage());
                }
            }

            DB::commit();

            if ($first->MaNguoiDung !== null) {
                broadcast(new \App\Events\UserDataUpdated($first->MaNguoiDung))->toOthers();
            }
            broadcast(new \App\Events\AdminDataUpdated())->toOthers();
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            $phamViText = $laHuyToanBo
                ? "toàn bộ {$soTranHuy} trận trong hóa đơn #{$maHoaDon}"
                : "{$soTranHuy}/{$tongSoTranDaCocBanDau} trận trong hóa đơn #{$maHoaDon}";

            $msgSuccess = ($first->MaNguoiDung === null)
                ? "Đã hủy thành công {$phamViText} (Tổng hoàn cọc: " . number_format($tongTienHoan, 0, ',', '.') . "đ) và gửi Email xác nhận!"
                : "Đã hủy thành công {$phamViText} và hoàn " . number_format($tongTienHoan, 0, ',', '.') . "đ vào ví khách hàng!";

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
     * Hàm dùng chung: Gửi Email xác nhận dời lịch đặt sân (kèm QR Code vé điện tử & thông tin hóa đơn cập nhật)
     * Áp dụng cho cả lúc Khách hàng tự dời lịch lẫn lúc Quản lý sân / Nhân viên dời lịch hộ khách
     */
    private static function guiEmailXacNhanDoiLich(
        $emailNhan,
        $tenKhach,
        $maVeRaw,
        $maHoaDon,
        $tenCumSan,
        $tenSanCu,
        $gioCuStr,
        $ngayCuStr,
        $tenSanMoi,
        $gioMoiStr,
        $ngayMoiStr,
        $donGiaMoi,
        $tienCocVe,
        $conThuTaiSanHD = null,
        $laAdminHoTro = false
    ) {
        if (!$emailNhan) {
            return;
        }

        try {
            $qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=6&data=" . urlencode($maVeRaw);
            $donGiaMoiFormat = number_format((float) $donGiaMoi, 0, ',', '.') . 'đ';
            $tienCocFormat   = number_format((float) $tienCocVe, 0, ',', '.') . 'đ';
            $conThuHtml      = ($conThuTaiSanHD !== null)
                ? "<li><strong>Còn thu tại sân (Hóa đơn #{$maHoaDon}):</strong> <span style='color:#e11d48; font-weight:bold;'>" . number_format((float) $conThuTaiSanHD, 0, ',', '.') . "đ</span></li>"
                : "";

            $loiMoDau = $laAdminHoTro
                ? "Theo yêu cầu của bạn, Ban quản lý <strong>{$tenCumSan}</strong> đã hỗ trợ dời lịch đặt sân cho vé <strong>#{$maVeRaw}</strong>:"
                : "Hệ thống DN Football xác nhận bạn đã thực hiện dời lịch đặt sân thành công cho vé <strong>#{$maVeRaw}</strong> tại <strong>{$tenCumSan}</strong>:";

            $noiDungMail = "
                <div style='font-family:Arial,sans-serif; color:#0f172a; line-height:1.6; max-width:640px;'>
                    <h2 style='color:#0b5d3b; margin-bottom:10px;'>Xác nhận dời lịch đặt sân #{$maVeRaw} - DN Football</h2>
                    <p>Chào <strong>{$tenKhach}</strong>,</p>
                    <p>{$loiMoDau}</p>
                    <div style='background:#f8fafc; border:1px solid #cbd5e1; border-left:4px solid #10b981; border-radius:10px; padding:14px 18px; margin:16px 0;'>
                        <ul style='margin:0; padding-left:18px;'>
                            <li><strong>Cụm sân:</strong> {$tenCumSan}</li>
                            <li><strong>Lịch cũ:</strong> <span style='color:#64748b; text-decoration:line-through;'>{$tenSanCu} — {$gioCuStr} ngày {$ngayCuStr}</span></li>
                            <li><strong>Lịch mới:</strong> <span style='color:#059669; font-weight:bold;'>{$tenSanMoi} — {$gioMoiStr} ngày {$ngayMoiStr}</span></li>
                            <li><strong>Đơn giá khung giờ mới:</strong> <strong>{$donGiaMoiFormat}</strong></li>
                            <li><strong>Tiền đã đặt cọc (Giữ nguyên):</strong> <span style='color:#047857; font-weight:bold;'>{$tienCocFormat}</span></li>
                            {$conThuHtml}
                        </ul>
                    </div>
                    <div style='border:1px solid #cbd5e1; padding:16px; margin-top:16px; border-radius:10px; display:flex; align-items:center; justify-content:space-between; background:#ffffff;'>
                        <div style='padding-right:15px;'>
                            <h3 style='margin:0 0 8px 0; color:#10B981; font-size:17px;'>Vé điện tử cập nhật: #{$maVeRaw} " . ($maHoaDon ? "<span style='font-size:13px; color:#475569;'>(HĐ #{$maHoaDon})</span>" : "") . "</h3>
                            <p style='margin:4px 0;'><strong>Sân mới:</strong> {$tenSanMoi} ({$tenCumSan})</p>
                            <p style='margin:4px 0;'><strong>Ngày mới:</strong> {$ngayMoiStr} | <strong>Giờ mới:</strong> {$gioMoiStr}</p>
                            <p style='margin:4px 0; font-size:13px; color:#64748b;'><em>* Mã QR Code của bạn vẫn giữ nguyên hiệu lực để Check-in tại sân.</em></p>
                        </div>
                        <div style='text-align:center; border-left:1px dashed #cbd5e1; padding-left:15px;'>
                            <img src='{$qrUrl}' alt='QR {$maVeRaw}' style='width:115px; height:115px; display:block; margin:0 auto; border:1px solid #e2e8f0; border-radius:8px;' />
                            <div style='font-size:11px; color:#64748b; margin-top:5px;'>Quét mã khi đến sân</div>
                        </div>
                    </div>
                    <p style='margin-top:16px;'>Cảm ơn bạn đã tin tưởng và sử dụng dịch vụ của <strong>DN Football</strong>!</p>
                </div>
            ";

            Mail::html($noiDungMail, function ($message) use ($emailNhan, $maVeRaw) {
                $message->to($emailNhan)
                        ->subject("Xác nhận dời lịch vé #{$maVeRaw} - DN Football");
            });
        } catch (\Exception $mailEx) {
            \Illuminate\Support\Facades\Log::error('Lỗi gửi email xác nhận dời lịch: ' . $mailEx->getMessage());
        }
    }

    /**
     * 4. KHÁCH HÀNG TỰ DỜI LỊCH ĐẶT SÂN (Áp dụng cho cả Đá phong trào & Trận lẻ trong Giải đấu)
     * - Chỉ cho phép dời sang các sân thuộc CÙNG CỤM SÂN
     * - Giữ nguyên tiền đã đặt cọc (TienCoc), cập nhật lại TongTien, ChiTietHoaDon.DonGia và đồng bộ HoaDonDatSan
     */
    public function doiLichKhachHang(Request $request, $id)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()->MaNguoiDung);

        $request->validate([
            'ma_san_bong_moi'  => 'required',
            'ma_khung_gio_moi' => 'required',
            'ngay_da_moi'      => 'required|date_format:Y-m-d',
        ]);

        $datSan = DatSan::with(['sanBong.cumSan', 'khungGio', 'giaiDau', 'chiTietHoaDon', 'hoaDonDatSan'])
                        ->where('MaDatSan', $id)
                        ->where('MaNguoiDung', $user->MaNguoiDung)
                        ->first();

        if (!$datSan) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy lịch đặt sân!']);
        }

        if ($datSan->TrangThai !== 'DaCoc') {
            return response()->json(['success' => false, 'message' => 'Chỉ có thể dời lịch đối với trận đấu đang ở trạng thái Đã cọc!']);
        }

        // Kiểm tra điều kiện thời gian trước trận cũ tối thiểu 10 tiếng
        $thoiGianDaCu = Carbon::parse($datSan->NgayDa . ' ' . $datSan->khungGio->GioBatDau);
        if (now()->diffInHours($thoiGianDaCu, false) < 10) {
            return response()->json([
                'success' => false,
                'message' => 'Đã quá hạn tự dời lịch (phải thực hiện trước giờ bóng lăn tối thiểu 10 tiếng). Vui lòng liên hệ Quản lý/Nhân viên sân để được hỗ trợ!'
            ]);
        }

        $maSanMoi = $request->input('ma_san_bong_moi');
        $maKhungGioMoi = $request->input('ma_khung_gio_moi');
        $ngayDaMoi = $request->input('ngay_da_moi');

        if ((string) $datSan->MaSanBong === (string) $maSanMoi &&
            (string) $datSan->MaKhungGio === (string) $maKhungGioMoi &&
            $datSan->NgayDa === $ngayDaMoi) {
            return response()->json(['success' => false, 'message' => 'Lịch mới trùng với lịch hiện tại của bạn!']);
        }

        // Kiểm tra Sân mới phải thuộc cùng Cụm sân và đang Hoạt động
        $sanMoi = SanBong::with('cumSan')->find($maSanMoi);
        if (!$sanMoi || $sanMoi->TrangThai !== 'HoatDong') {
            return response()->json(['success' => false, 'message' => 'Sân bóng mới không tồn tại hoặc đang bảo trì!']);
        }

        $cumSanCuId = $datSan->sanBong ? $datSan->sanBong->MaCumSan : null;
        if ((string) $sanMoi->MaCumSan !== (string) $cumSanCuId) {
            return response()->json(['success' => false, 'message' => 'Chỉ được phép dời lịch sang các sân bóng trong cùng một Cụm sân!']);
        }

        if (!$sanMoi->cumSan || $sanMoi->cumSan->TrangThai === 'BaoTri' || $sanMoi->cumSan->deleted_at !== null) {
            return response()->json(['success' => false, 'message' => 'Cụm sân này hiện đang tạm ngưng hoặc bảo trì!']);
        }

        // Kiểm tra Khung giờ mới và Giờ hoạt động của cụm sân
        $khungGioMoi = KhungGio::find($maKhungGioMoi);
        if (!$khungGioMoi) {
            return response()->json(['success' => false, 'message' => 'Khung giờ mới không hợp lệ!']);
        }

        $moCua = substr($sanMoi->cumSan->GioMoCua, 0, 5);
        $dongCua = substr($sanMoi->cumSan->GioDongCua, 0, 5);
        $gioBD = substr($khungGioMoi->GioBatDau, 0, 5);
        $gioKT = substr($khungGioMoi->GioKetThuc, 0, 5);

        if ($gioBD < $moCua || $gioKT > $dongCua) {
            return response()->json(['success' => false, 'message' => 'Khung giờ mới nằm ngoài giờ hoạt động của cụm sân!']);
        }

        // Kiểm tra thời điểm mới không được ở quá khứ
        $thoiGianDaMoi = Carbon::parse($ngayDaMoi . ' ' . $khungGioMoi->GioBatDau);
        if ($thoiGianDaMoi->lte(now())) {
            return response()->json(['success' => false, 'message' => 'Không thể dời lịch sang khung giờ đã qua!']);
        }

        // Kiểm tra phạm vi ngày đá (Phong trào: 7 ngày tới | Giải đấu: nằm trong NgayBatDau -> NgayKetThuc)
        if ($datSan->MaGiaiDau !== null && $datSan->giaiDau) {
            $ngayBDGiai = Carbon::parse($datSan->giaiDau->NgayBatDau)->startOfDay();
            $ngayKTGiai = Carbon::parse($datSan->giaiDau->NgayKetThuc)->endOfDay();
            $ngayMoiCheck = Carbon::parse($ngayDaMoi);
            if ($ngayMoiCheck->lt($ngayBDGiai) || $ngayMoiCheck->gt($ngayKTGiai)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Ngày đá mới của trận giải đấu phải nằm trong thời gian diễn ra giải (' . $ngayBDGiai->format('d/m/Y') . ' - ' . $ngayKTGiai->format('d/m/Y') . ')!'
                ]);
            }
        } else {
            $maxDatePhongTrao = Carbon::today()->addDays(6)->endOfDay();
            if (Carbon::parse($ngayDaMoi)->gt($maxDatePhongTrao)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Đặt sân phong trào chỉ được phép dời lịch trong phạm vi 7 ngày tính từ hôm nay!'
                ]);
            }
        }

        // Lấy đơn giá mới từ bảng GiaTien
        $giaTienRecord = DB::table('GiaTien')
            ->where('MaCumSan', $sanMoi->MaCumSan)
            ->where('MaLoaiSan', $sanMoi->MaLoaiSan)
            ->where('MaKhungGio', $khungGioMoi->MaKhungGio)
            ->first();

        if (!$giaTienRecord || (float) $giaTienRecord->SoTien <= 0) {
            return response()->json(['success' => false, 'message' => 'Khung giờ này chưa được cấu hình giá hoặc đang đóng!']);
        }

        $donGiaMoi = (float) $giaTienRecord->SoTien;

        DB::beginTransaction();
        try {
            // Kiểm tra trùng lịch có lockForUpdate (loại trừ chính bản ghi $datSan->MaDatSan)
            $daDat = DatSan::where('MaSanBong', $maSanMoi)
                           ->where('NgayDa', $ngayDaMoi)
                           ->where('MaKhungGio', $maKhungGioMoi)
                           ->where('TrangThai', '!=', 'DaHuy')
                           ->where('MaDatSan', '!=', $datSan->MaDatSan)
                           ->lockForUpdate()
                           ->first();

            if ($daDat) {
                DB::rollBack();
                return response()->json([
                    'success' => false,
                    'message' => 'Rất tiếc! Khung giờ bạn chọn vừa có khách hàng khác đặt mất. Vui lòng chọn khung giờ khác!'
                ]);
            }

            $tenSanCu = $datSan->sanBong ? $datSan->sanBong->TenSan : 'Sân';
            $tenCumSan = $sanMoi->cumSan ? $sanMoi->cumSan->TenCumSan : 'DN Football';
            $ngayCuStr = Carbon::parse($datSan->NgayDa)->format('d/m/Y');
            $gioCuStr = substr($datSan->khungGio->GioBatDau, 0, 5) . ' - ' . substr($datSan->khungGio->GioKetThuc, 0, 5);

            $tenSanMoi = $sanMoi->TenSan;
            $ngayMoiStr = Carbon::parse($ngayDaMoi)->format('d/m/Y');
            $gioMoiStr = $gioBD . ' - ' . $gioKT;

            $maHoaDon = $datSan->MaHoaDonDatSan;
            $conThuTaiSanHD = null;

            // Cập nhật DatSan (Giữ nguyên TienCoc theo Cách 2A, cập nhật TongTien mới)
            $datSan->update([
                'MaSanBong'  => $maSanMoi,
                'MaKhungGio' => $maKhungGioMoi,
                'NgayDa'     => $ngayDaMoi,
                'TongTien'   => $donGiaMoi,
            ]);

            // Cập nhật DonGia trong ChiTietHoaDon
            if ($maHoaDon) {
                DB::table('ChiTietHoaDon')
                    ->where('MaHoaDonDatSan', $maHoaDon)
                    ->where('MaDatSan', $datSan->MaDatSan)
                    ->update(['DonGia' => $donGiaMoi]);

                self::dongBoHoaDonDatSan($maHoaDon);

                // Kiểm tra Tổng tiền hóa đơn sau khi đổi không được nhỏ hơn Tổng tiền đã cọc của hóa đơn
                $hdSauDongBo = HoaDonDatSan::with('datSans')->find($maHoaDon);
                if ($hdSauDongBo) {
                    $tongCocHD = (float) $hdSauDongBo->datSans->where('TrangThai', '!=', 'DaHuy')->sum('TienCoc');
                    if ((float) $hdSauDongBo->TongTien < $tongCocHD) {
                        DB::rollBack();
                        return response()->json([
                            'success' => false,
                            'message' => 'Tổng tiền hóa đơn sau khi đổi (' . number_format($hdSauDongBo->TongTien, 0, ',', '.') . 'đ) không được nhỏ hơn số tiền đã đặt cọc (' . number_format($tongCocHD, 0, ',', '.') . 'đ). Vui lòng chọn khung giờ/sân khác!'
                        ]);
                    }
                    $conThuTaiSanHD = max(0, (float) $hdSauDongBo->TongTien - $tongCocHD);
                }
            }

            // Gửi thông báo trên hệ thống
            $maVeRaw = $datSan->MaGiaiDau ? ('GD-' . $datSan->MaGiaiDau) : ('PT-' . $datSan->MaDatSan);
            $maVeThongBao = '#' . $maVeRaw;

            $quanLyCum = NguoiDung::where('VaiTro', 'QuanLySan')->where('MaCumSan', $sanMoi->MaCumSan)->first();
            if ($quanLyCum) {
                ThongBao::create([
                    'MaNguoiDung'  => $quanLyCum->MaNguoiDung,
                    'TieuDe'       => "Khách hàng dời lịch đặt sân ({$maVeThongBao})",
                    'NoiDung'      => "Khách hàng {$user->HoTen} ({$user->SoDienThoai}) vừa dời lịch vé {$maVeThongBao} từ [{$tenSanCu} | {$gioCuStr} ngày {$ngayCuStr}] sang [{$tenSanMoi} | {$gioMoiStr} ngày {$ngayMoiStr}].",
                    'LoaiThongBao' => 'DatSan'
                ]);
            }

            ThongBao::create([
                'MaNguoiDung'  => $user->MaNguoiDung,
                'TieuDe'       => "Dời lịch đặt sân thành công ({$maVeThongBao})",
                'NoiDung'      => "Bạn đã dời lịch thành công từ [{$tenSanCu} | {$gioCuStr} ngày {$ngayCuStr}] sang [{$tenSanMoi} | {$gioMoiStr} ngày {$ngayMoiStr}].",
                'LoaiThongBao' => 'DatSan'
            ]);

            DB::commit();

            // GỬI EMAIL XÁC NHẬN DỜI LỊCH CHO KHÁCH HÀNG
            self::guiEmailXacNhanDoiLich(
                $user->Email,
                $user->HoTen,
                $maVeRaw,
                $maHoaDon,
                $tenCumSan,
                $tenSanCu,
                $gioCuStr,
                $ngayCuStr,
                $tenSanMoi,
                $gioMoiStr,
                $ngayMoiStr,
                $donGiaMoi,
                $datSan->TienCoc,
                $conThuTaiSanHD,
                false
            );

            if ($quanLyCum) {
                broadcast(new \App\Events\UserDataUpdated($quanLyCum->MaNguoiDung))->toOthers();
            }
            broadcast(new \App\Events\UserDataUpdated($user->MaNguoiDung))->toOthers();
            broadcast(new \App\Events\AdminDataUpdated())->toOthers();
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            return response()->json([
                'success' => true,
                'message' => "Dời lịch thành công sang {$tenSanMoi} ({$gioMoiStr} ngày {$ngayMoiStr})!"
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Lỗi hệ thống: ' . $e->getMessage()]);
        }
    }

    /**
     * 5. QUẢN LÝ SÂN / NHÂN VIÊN DỜI LỊCH ĐẶT SÂN HỘ KHÁCH (Hỗ trợ cả Khách thành viên & Khách vãng lai, Phong trào & Giải đấu)
     */
    public function doiLichAdmin(Request $request, $id)
    {
        $userDangNhap = auth()->user();
        if (!in_array($userDangNhap->VaiTro, ['Admin', 'QuanLySan', 'NhanVien'])) {
            return response()->json(['success' => false, 'message' => 'Không có quyền thực hiện!'], 403);
        }

        $request->validate([
            'ma_san_bong_moi'  => 'required',
            'ma_khung_gio_moi' => 'required',
            'ngay_da_moi'      => 'required|date_format:Y-m-d',
        ]);

        $datSan = DatSan::with(['sanBong.cumSan', 'khungGio', 'giaiDau', 'chiTietHoaDon', 'hoaDonDatSan', 'nguoiDung'])->find($id);
        if (!$datSan) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy dữ liệu đặt sân!']);
        }

        if ($datSan->TrangThai !== 'DaCoc') {
            return response()->json(['success' => false, 'message' => 'Chỉ có thể dời lịch đối với sân đang ở trạng thái Đã cọc!']);
        }

        $maSanMoi = $request->input('ma_san_bong_moi');
        $maKhungGioMoi = $request->input('ma_khung_gio_moi');
        $ngayDaMoi = $request->input('ngay_da_moi');

        if ((string) $datSan->MaSanBong === (string) $maSanMoi &&
            (string) $datSan->MaKhungGio === (string) $maKhungGioMoi &&
            $datSan->NgayDa === $ngayDaMoi) {
            return response()->json(['success' => false, 'message' => 'Lịch mới trùng với lịch hiện tại!']);
        }

        $sanMoi = SanBong::with('cumSan')->find($maSanMoi);
        if (!$sanMoi || $sanMoi->TrangThai !== 'HoatDong') {
            return response()->json(['success' => false, 'message' => 'Sân bóng mới không tồn tại hoặc đang bảo trì!']);
        }

        $cumSanCuId = $datSan->sanBong ? $datSan->sanBong->MaCumSan : null;
        if ((string) $sanMoi->MaCumSan !== (string) $cumSanCuId) {
            return response()->json(['success' => false, 'message' => 'Chỉ được phép dời lịch sang các sân bóng trong cùng một Cụm sân!']);
        }

        if (in_array($userDangNhap->VaiTro, ['QuanLySan', 'NhanVien']) && (string) $userDangNhap->MaCumSan !== (string) $sanMoi->MaCumSan) {
            return response()->json(['success' => false, 'message' => 'Bạn chỉ được phép dời lịch cho các sân thuộc cơ sở của mình!']);
        }

        $khungGioMoi = KhungGio::find($maKhungGioMoi);
        if (!$khungGioMoi) {
            return response()->json(['success' => false, 'message' => 'Khung giờ mới không hợp lệ!']);
        }

        $moCua = substr($sanMoi->cumSan->GioMoCua, 0, 5);
        $dongCua = substr($sanMoi->cumSan->GioDongCua, 0, 5);
        $gioBD = substr($khungGioMoi->GioBatDau, 0, 5);
        $gioKT = substr($khungGioMoi->GioKetThuc, 0, 5);

        if ($gioBD < $moCua || $gioKT > $dongCua) {
            return response()->json(['success' => false, 'message' => 'Khung giờ mới nằm ngoài giờ hoạt động của cụm sân!']);
        }

        $thoiGianDaMoi = Carbon::parse($ngayDaMoi . ' ' . $khungGioMoi->GioBatDau);
        if ($thoiGianDaMoi->lte(now())) {
            return response()->json(['success' => false, 'message' => 'Không thể dời lịch sang khung giờ đã qua!']);
        }

        // Lấy đơn giá mới từ bảng GiaTien
        $giaTienRecord = DB::table('GiaTien')
            ->where('MaCumSan', $sanMoi->MaCumSan)
            ->where('MaLoaiSan', $sanMoi->MaLoaiSan)
            ->where('MaKhungGio', $khungGioMoi->MaKhungGio)
            ->first();

        if (!$giaTienRecord || (float) $giaTienRecord->SoTien <= 0) {
            return response()->json(['success' => false, 'message' => 'Khung giờ này chưa được cấu hình giá hoặc đang đóng!']);
        }

        $donGiaMoi = (float) $giaTienRecord->SoTien;

        DB::beginTransaction();
        try {
            $daDat = DatSan::where('MaSanBong', $maSanMoi)
                           ->where('NgayDa', $ngayDaMoi)
                           ->where('MaKhungGio', $maKhungGioMoi)
                           ->where('TrangThai', '!=', 'DaHuy')
                           ->where('MaDatSan', '!=', $datSan->MaDatSan)
                           ->lockForUpdate()
                           ->first();

            if ($daDat) {
                DB::rollBack();
                return response()->json([
                    'success' => false,
                    'message' => 'Khung giờ mới vừa có người đặt mất. Vui lòng chọn khung giờ khác!'
                ]);
            }

            $tenSanCu = $datSan->sanBong ? $datSan->sanBong->TenSan : 'Sân';
            $tenCumSan = ($datSan->sanBong && $datSan->sanBong->cumSan) ? $datSan->sanBong->cumSan->TenCumSan : ($sanMoi->cumSan ? $sanMoi->cumSan->TenCumSan : 'DN Football');
            $ngayCuStr = Carbon::parse($datSan->NgayDa)->format('d/m/Y');
            $gioCuStr = substr($datSan->khungGio->GioBatDau, 0, 5) . ' - ' . substr($datSan->khungGio->GioKetThuc, 0, 5);

            $tenSanMoi = $sanMoi->TenSan;
            $ngayMoiStr = Carbon::parse($ngayDaMoi)->format('d/m/Y');
            $gioMoiStr = $gioBD . ' - ' . $gioKT;

            $maHoaDon = $datSan->MaHoaDonDatSan;
            $conThuTaiSanHD = null;

            $datSan->update([
                'MaSanBong'      => $maSanMoi,
                'MaKhungGio'     => $maKhungGioMoi,
                'NgayDa'         => $ngayDaMoi,
                'TongTien'       => $donGiaMoi,
                'MaNhanVienXuLy' => $userDangNhap->MaNguoiDung
            ]);

            // Nếu là trận thuộc Giải đấu và ngày đá mới nằm ngoài NgayBatDau..NgayKetThuc (ví dụ đá bù do mưa bão), tự động mở rộng khoảng ngày giải đấu
            if ($datSan->MaGiaiDau !== null && $datSan->giaiDau) {
                $gd = $datSan->giaiDau;
                if ($ngayDaMoi < $gd->NgayBatDau) {
                    $gd->update(['NgayBatDau' => $ngayDaMoi]);
                } elseif ($ngayDaMoi > $gd->NgayKetThuc) {
                    $gd->update(['NgayKetThuc' => $ngayDaMoi]);
                }
            }

            if ($maHoaDon) {
                DB::table('ChiTietHoaDon')
                    ->where('MaHoaDonDatSan', $maHoaDon)
                    ->where('MaDatSan', $datSan->MaDatSan)
                    ->update(['DonGia' => $donGiaMoi]);

                self::dongBoHoaDonDatSan($maHoaDon);

                $hdSauDongBo = HoaDonDatSan::with('datSans')->find($maHoaDon);
                if ($hdSauDongBo) {
                    $tongCocHD = (float) $hdSauDongBo->datSans->where('TrangThai', '!=', 'DaHuy')->sum('TienCoc');
                    if ((float) $hdSauDongBo->TongTien < $tongCocHD) {
                        DB::rollBack();
                        return response()->json([
                            'success' => false,
                            'message' => 'Tổng tiền hóa đơn sau khi đổi (' . number_format($hdSauDongBo->TongTien, 0, ',', '.') . 'đ) không được nhỏ hơn số tiền khách đã cọc (' . number_format($tongCocHD, 0, ',', '.') . 'đ)!'
                        ]);
                    }
                    $conThuTaiSanHD = max(0, (float) $hdSauDongBo->TongTien - $tongCocHD);
                }
            }

            $maVeRaw = $datSan->MaGiaiDau ? ('GD-' . $datSan->MaGiaiDau) : ('PT-' . $datSan->MaDatSan);
            $maVeStr = '#' . $maVeRaw;

            if ($datSan->MaNguoiDung !== null) {
                ThongBao::create([
                    'MaNguoiDung'  => $datSan->MaNguoiDung,
                    'TieuDe'       => "Lịch đặt sân {$maVeStr} đã được dời lịch",
                    'NoiDung'      => "Ban quản lý sân đã hỗ trợ dời lịch vé {$maVeStr} tại {$tenCumSan} từ [{$tenSanCu} | {$gioCuStr} ngày {$ngayCuStr}] sang [{$tenSanMoi} | {$gioMoiStr} ngày {$ngayMoiStr}]. Đơn giá khung giờ mới: " . number_format($donGiaMoi, 0, ',', '.') . "đ.",
                    'LoaiThongBao' => 'DatSan'
                ]);
            }

            DB::commit();

            // Lấy email & họ tên của khách (Hỗ trợ cả Khách thành viên có tài khoản VÀ Khách vãng lai)
            $emailKhach = ($datSan->MaNguoiDung !== null && $datSan->nguoiDung)
                ? $datSan->nguoiDung->Email
                : $datSan->EmailNguoiDat;

            $tenKhach = ($datSan->MaNguoiDung !== null && $datSan->nguoiDung)
                ? $datSan->nguoiDung->HoTen
                : ($datSan->TenNguoiDat ?: 'Quý khách');

            // GỬI EMAIL XÁC NHẬN DỜI LỊCH CHO KHÁCH HÀNG (Cả Thành viên & Vãng lai)
            self::guiEmailXacNhanDoiLich(
                $emailKhach,
                $tenKhach,
                $maVeRaw,
                $maHoaDon,
                $tenCumSan,
                $tenSanCu,
                $gioCuStr,
                $ngayCuStr,
                $tenSanMoi,
                $gioMoiStr,
                $ngayMoiStr,
                $donGiaMoi,
                $datSan->TienCoc,
                $conThuTaiSanHD,
                true
            );

            if ($datSan->MaNguoiDung !== null) {
                broadcast(new \App\Events\UserDataUpdated($datSan->MaNguoiDung))->toOthers();
            }
            broadcast(new \App\Events\AdminDataUpdated())->toOthers();
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            return response()->json([
                'success' => true,
                'message' => "Đã dời lịch vé {$maVeStr} sang {$tenSanMoi} ({$gioMoiStr} ngày {$ngayMoiStr}) thành công!"
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Lỗi hệ thống: ' . $e->getMessage()]);
        }
    }

    // =========================================================================
    // TỰ ĐỘNG KIỂM TRA & PHÁT THÔNG BÁO NHẮC LỊCH ĐẶT SÂN TRONG NGÀY (PHƯƠNG ÁN A)
    // - Hoạt động tự động khi gọi API Xem Cụm Sân hoặc Đăng Nhập
    // - Áp dụng cho cả Khách thành viên (Web + Mail) và Khách vãng lai (Mail)
    // =========================================================================
    public static function kiemTraVaPhatThongBaoNhacLichHomNay($forceScan = false)
    {
        $now = \Carbon\Carbon::now('Asia/Ho_Chi_Minh');
        $todayYmd = $now->toDateString(); // YYYY-MM-DD
        $todayDisplay = $now->format('d/m/Y');

        // Phương án A: Bắt đầu phát thông báo nhắc lịch trong ngày từ 06:00 sáng trở đi
        if (!$forceScan && $now->hour < 6) {
            return;
        }

        // Khóa Cache 5 phút để tránh nhiều request cùng lúc quét trùng lặp
        $scanLockKey = "auto_reminder_scan_lock_{$todayYmd}";
        if (!$forceScan && \Illuminate\Support\Facades\Cache::has($scanLockKey)) {
            return;
        }
        \Illuminate\Support\Facades\Cache::put($scanLockKey, true, now()->addMinutes(5));

        // 1. Lấy tất cả các lịch đặt có NgayDa = Hôm nay và đang ở trạng thái Đã cọc (DaCoc)
        $danhSachHomNay = DatSan::with(['sanBong.cumSan', 'khungGio', 'nguoiDung', 'giaiDau', 'chiTietHoaDon.hoaDonDatSan'])
            ->whereDate('NgayDa', $todayYmd)
            ->where('TrangThai', 'DaCoc')
            ->get();

        if ($danhSachHomNay->isEmpty()) {
            return;
        }

        // 2. Lọc ra các trận chưa được nhắc trong hôm nay và chưa kết thúc ca đá
        $cacTranCanNhac = $danhSachHomNay->filter(function ($ds) use ($todayYmd, $todayDisplay, $now) {
            $cacheKey = "reminded_match_{$todayYmd}_{$ds->MaDatSan}";
            if (\Illuminate\Support\Facades\Cache::has($cacheKey)) {
                return false;
            }

            // Kiểm tra thêm trong bảng ThongBao (đối với khách có tài khoản) để phòng trường hợp xóa Cache vẫn không gửi trùng
            if ($ds->MaNguoiDung) {
                $maVeCheck = $ds->MaGiaiDau ? "#GD-{$ds->MaGiaiDau}" : "#PT-{$ds->MaDatSan}";
                $daCoThongBaoDB = ThongBao::where('MaNguoiDung', $ds->MaNguoiDung)
                    ->where('LoaiThongBao', 'DatSan')
                    ->where('TieuDe', 'like', "%Nhắc lịch đá bóng hôm nay ({$todayDisplay})%")
                    ->where('NoiDung', 'like', "%{$maVeCheck}%")
                    ->exists();

                if ($daCoThongBaoDB) {
                    \Illuminate\Support\Facades\Cache::put($cacheKey, true, $now->copy()->endOfDay());
                    return false;
                }
            }

            // Bỏ qua nếu ca đá hôm nay đã kết thúc
            if ($ds->khungGio && $ds->khungGio->GioKetThuc) {
                $endTime = \Carbon\Carbon::parse($todayYmd . ' ' . $ds->khungGio->GioKetThuc, 'Asia/Ho_Chi_Minh');
                if ($now->greaterThanOrEqualTo($endTime)) {
                    return false;
                }
            }

            // Nếu khách vừa mới đặt sân ngay trong hôm nay cách đây < 15 phút (vừa nhận mail đặt sân xong) -> Tạm hoãn lại lần quét sau
            if ($ds->NgayTao) {
                $createdTime = \Carbon\Carbon::parse($ds->NgayTao, 'Asia/Ho_Chi_Minh');
                if ($createdTime->isSameDay($now) && $createdTime->diffInMinutes($now) < 15) {
                    return false;
                }
            }

            return true;
        });

        if ($cacTranCanNhac->isEmpty()) {
            return;
        }

        // 3. Gom nhóm các trận trong ngày hôm nay theo từng Hóa đơn / Khách hàng
        // (Ví dụ: Hóa đơn có 3 trận ngày 12 và 2 trận ngày 13 -> Ngày 12 gom 3 trận thành 1 thông báo, Ngày 13 gom 2 trận thành 1 thông báo)
        $groups = $cacTranCanNhac->groupBy(function ($ds) {
            $maHD = $ds->chiTietHoaDon ? $ds->chiTietHoaDon->MaHoaDonDatSan : null;
            if ($ds->MaNguoiDung) {
                return 'MEMBER_' . $ds->MaNguoiDung . '_' . ($maHD ?? 'NOHD');
            }
            $email = strtolower(trim($ds->EmailNguoiDat ?? 'noemail'));
            return 'GUEST_' . $email . '_' . ($maHD ?? $ds->MaDatSan);
        });

        foreach ($groups as $groupKey => $matches) {
            $sortedMatches = $matches->sortBy(function ($m) {
                return $m->khungGio ? $m->khungGio->GioBatDau : '00:00:00';
            })->values();

            $first = $sortedMatches->first();
            $soTranHomNay = $sortedMatches->count();
            $maHoaDon = $first->chiTietHoaDon ? $first->chiTietHoaDon->MaHoaDonDatSan : null;
            $isMember = ($first->MaNguoiDung !== null);
            $isGiaiDau = ($first->MaGiaiDau !== null);

            $tenKhach = $isMember
                ? ($first->nguoiDung ? $first->nguoiDung->HoTen : 'Quý khách')
                : ($first->TenNguoiDat ?: 'Quý khách');

            $emailNhan = $isMember
                ? ($first->nguoiDung ? $first->nguoiDung->Email : null)
                : $first->EmailNguoiDat;

            // Đánh dấu ngay vào Cache (hiệu lực đến hết ngày) để chỉ gửi đúng 1 lần duy nhất trong ngày
            foreach ($sortedMatches as $m) {
                \Illuminate\Support\Facades\Cache::put("reminded_match_{$todayYmd}_{$m->MaDatSan}", true, $now->copy()->endOfDay());
            }

            $danhSachTranMailHtml = '';
            $tomTatWebArr = [];
            $tongTienSanHomNay = 0;
            $tongDaCocHomNay = 0;

            foreach ($sortedMatches as $idx => $dsItem) {
                $tenSan = $dsItem->sanBong ? $dsItem->sanBong->TenSan : 'Sân bóng';
                $tenCumSan = ($dsItem->sanBong && $dsItem->sanBong->cumSan) ? $dsItem->sanBong->cumSan->TenCumSan : 'Cơ sở DN Football';
                $diaChiCum = ($dsItem->sanBong && $dsItem->sanBong->cumSan) ? $dsItem->sanBong->cumSan->DiaChi : 'Đà Nẵng';
                $gioStr = $dsItem->khungGio
                    ? substr($dsItem->khungGio->GioBatDau, 0, 5) . ' - ' . substr($dsItem->khungGio->GioKetThuc, 0, 5)
                    : '';
                $maVe = $dsItem->MaGiaiDau ? "GD-{$dsItem->MaGiaiDau}" : "PT-{$dsItem->MaDatSan}";

                $donGia = (float) $dsItem->TongTien;
                $tienCoc = (float) $dsItem->TienCoc;
                $tongTienSanHomNay += $donGia;
                $tongDaCocHomNay += $tienCoc;

                $tomTatWebArr[] = "{$tenSan} ({$gioStr} - #{$maVe})";

                $danhSachTranMailHtml .= "
                    <tr>
                        <td style='padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;'>" . ($idx + 1) . "</td>
                        <td style='padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; font-weight: bold; color: #0b5d3b;'>#{$maVe}</td>
                        <td style='padding: 10px; border: 1px solid #cbd5e1;'>
                            <strong>{$tenSan}</strong><br>
                            <span style='font-size: 12px; color: #475569;'>{$tenCumSan} — {$diaChiCum}</span>
                        </td>
                        <td style='padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #15803d;'>{$gioStr}<br><span style='font-size: 12px; color: #64748b; font-weight: normal;'>{$todayDisplay}</span></td>
                        <td style='padding: 10px; border: 1px solid #cbd5e1; text-align: right;'>" . number_format($donGia, 0, ',', '.') . "đ</td>
                        <td style='padding: 10px; border: 1px solid #cbd5e1; text-align: right; color: #047857; font-weight: bold;'>" . number_format($tienCoc, 0, ',', '.') . "đ</td>
                    </tr>
                ";
            }

            $maCumSanChinh = $first->sanBong ? $first->sanBong->MaCumSan : null;
            $tenCumSanChinh = ($first->sanBong && $first->sanBong->cumSan) ? $first->sanBong->cumSan->TenCumSan : 'DN Football';
            $diaChiChinh = ($first->sanBong && $first->sanBong->cumSan) ? $first->sanBong->cumSan->DiaChi : 'Đà Nẵng';
            $chuoiTomTatCa = implode(', ', $tomTatWebArr);

            // Lấy đúng Số điện thoại của Quản lý cụm sân (VaiTro = 'QuanLySan') mà khách đã đặt
            // (Nếu cụm sân chưa gán quản lý thì fallback về số điện thoại của Admin hệ thống)
            $quanLyCum = $maCumSanChinh
                ? NguoiDung::where('VaiTro', 'QuanLySan')
                    ->where('MaCumSan', $maCumSanChinh)
                    ->where('TrangThaiKhoa', 0)
                    ->first()
                : null;

            if (!$quanLyCum && $maCumSanChinh) {
                $quanLyCum = NguoiDung::where('VaiTro', 'QuanLySan')
                    ->where('MaCumSan', $maCumSanChinh)
                    ->first();
            }

            $adminInfo = NguoiDung::where('VaiTro', 'Admin')->first();
            $sdtQuanLySan = ($quanLyCum && $quanLyCum->SoDienThoai)
                ? $quanLyCum->SoDienThoai
                : ($adminInfo && $adminInfo->SoDienThoai ? $adminInfo->SoDienThoai : '0899244124');
            $tenQuanLyHienThi = ($quanLyCum && $quanLyCum->HoTen)
                ? "Quản lý {$quanLyCum->HoTen} ({$tenCumSanChinh})"
                : "Quản lý {$tenCumSanChinh}";

            // =================================================================
            // A. NẾU LÀ KHÁCH CÓ TÀI KHOẢN -> TẠO THÔNG BÁO WEB + PHÁT REALTIME
            // =================================================================
            if ($isMember) {
                try {
                    $tieuDeWeb = "Nhắc lịch đá bóng hôm nay ({$todayDisplay})";
                    $noiDungWeb = "Hôm nay bạn có {$soTranHomNay} lịch đặt sân tại {$tenCumSanChinh}: {$chuoiTomTatCa}"
                        . ($maHoaDon ? " (Hóa đơn #{$maHoaDon})" : "")
                        . ". Vui lòng đến sân trước 10-15 phút để check-in (Hotline cơ sở: {$sdtQuanLySan}). Nếu có việc đột xuất quá thời hạn tự hủy, bạn có thể gửi 'Yêu cầu hủy sân gấp' tại mục Các yêu cầu.";

                    ThongBao::create([
                        'MaNguoiDung'  => $first->MaNguoiDung,
                        'TieuDe'       => $tieuDeWeb,
                        'NoiDung'      => $noiDungWeb,
                        'LoaiThongBao' => 'DatSan'
                    ]);

                    broadcast(new \App\Events\UserDataUpdated($first->MaNguoiDung))->toOthers();
                } catch (\Exception $e) {
                    \Illuminate\Support\Facades\Log::error('Lỗi tạo thông báo web nhắc lịch: ' . $e->getMessage());
                }
            }

            // =================================================================
            // B. GỬI EMAIL NHẮC LỊCH CHI TIẾT (CHO CẢ KHÁCH THÀNH VIÊN & VÃNG LAI)
            // =================================================================
            if ($emailNhan) {
                try {
                    $hdLabel = $maHoaDon ? " (Thuộc Hóa đơn <strong>#{$maHoaDon}</strong>)" : "";
                    $loaiHinhText = ($isGiaiDau && $first->giaiDau)
                        ? "Giải đấu: <strong>{$first->giaiDau->TenGiaiDau} (#GD-{$first->MaGiaiDau})</strong>"
                        : "Đá phong trào";

                    // Tính số tiền còn thu tại sân của Hóa đơn (nếu có Hóa đơn)
                    $hdObj = $first->chiTietHoaDon ? $first->chiTietHoaDon->hoaDonDatSan : null;
                    $dongConThuHtml = '';
                    if ($hdObj) {
                        $conThuHD = max(0, (float) $hdObj->TongTien - (float) $hdObj->TienDaCoc);
                        $dongConThuHtml = "<div>&bull; Tổng số tiền còn cần thanh toán tại sân (Hóa đơn #{$maHoaDon}, đã gồm VAT/Khuyến mãi): <strong style='color: #e11d48;'>" . number_format($conThuHD, 0, ',', '.') . "đ</strong></div>";
                    }

                    if ($isMember) {
                        $huongDanHuyHtml = "
                            <div style='background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 14px 18px; margin-top: 18px;'>
                                <h4 style='margin: 0 0 8px 0; color: #92400e; font-size: 15px;'>📌 Hướng dẫn Dời lịch, Hủy sân & Yêu cầu hủy sân gấp:</h4>
                                <ul style='margin: 0; padding-left: 20px; color: #334155; font-size: 13.5px; line-height: 1.65;'>
                                    <li><strong>Tự hủy hoặc Dời lịch trực tiếp trên Web:</strong> Bạn có thể đăng nhập vào hệ thống &rarr; mục <strong>Lịch sử đặt sân</strong> để tự dời lịch hoặc hủy miễn phí (hoàn 100% tiền cọc vào Ví điện tử) nếu còn trước giờ bóng lăn tối thiểu <strong>10 tiếng</strong> (đối với đá phong trào) hoặc trước <strong>7 ngày</strong> (đối với giải đấu).</li>
                                    <li style='margin-top: 6px;'><strong>Trường hợp đã quá thời hạn tự hủy (Sát giờ thi đấu):</strong> Nếu có việc đột xuất hoặc lý do bất khả kháng không thể ra sân khi thời gian còn dưới 10 tiếng, bạn hãy vào mục <strong>Các yêu cầu &rarr; Yêu cầu hủy sân gấp &rarr; Tạo yêu cầu hủy gấp</strong>, chọn lịch đặt và ghi rõ lý do để Ban quản lý cụm sân xem xét hỗ trợ duyệt hủy và hoàn trả 100% tiền cọc về Ví.</li>
                                    <li style='margin-top: 6px;'><strong>Hotline Quản lý sân hỗ trợ trực tiếp:</strong> <strong>{$sdtQuanLySan}</strong> — {$tenQuanLyHienThi}.</li>
                                </ul>
                            </div>
                        ";
                    } else {
                        $huongDanHuyHtml = "
                            <div style='background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 14px 18px; margin-top: 18px;'>
                                <h4 style='margin: 0 0 8px 0; color: #92400e; font-size: 15px;'>📌 Hướng dẫn Hỗ trợ Dời lịch, Hủy sân & Hoàn tiền cọc:</h4>
                                <ul style='margin: 0; padding-left: 20px; color: #334155; font-size: 13.5px; line-height: 1.65;'>
                                    <li><strong>Cách thức yêu cầu hủy hoặc dời lịch:</strong> Đối với khách đặt sân không qua tài khoản thành viên, khi có việc đột xuất cần dời khung giờ hoặc hủy lịch đặt sân, quý khách vui lòng liên hệ trực tiếp với Nhân viên / Quản lý sân qua số <strong>Hotline: {$sdtQuanLySan}</strong> ({$tenQuanLyHienThi}).</li>
                                    <li style='margin-top: 6px;'><strong>Xác thực OTP bảo mật & Hoàn cọc:</strong> Nhân viên tại cơ sở sẽ gửi <strong>1 mã xác thực OTP (6 chữ số)</strong> về chính địa chỉ Email này của bạn. Quý khách chỉ cần đọc mã OTP để hoàn tất hủy lịch và nhận lại 100% tiền đặt cọc.</li>
                                </ul>
                            </div>
                        ";
                    }

                    $noiDungEmail = "
                        <div style='font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; color: #0f172a; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;'>
                            <div style='background: linear-gradient(135deg, #0b5d3b 0%, #16a34a 100%); color: #ffffff; padding: 20px 24px;'>
                                <h2 style='margin: 0; font-size: 20px;'>⚽ THÔNG BÁO NHẮC LỊCH ĐẶT SÂN HÔM NAY ({$todayDisplay})</h2>
                                <p style='margin: 4px 0 0 0; font-size: 13.5px; opacity: 0.92;'>Hệ thống sân bóng đá trực tuyến DN Football — Đà Nẵng</p>
                            </div>

                            <div style='padding: 22px 24px; background: #ffffff;'>
                                <p style='margin-top: 0;'>Xin chào <strong>{$tenKhach}</strong>,</p>
                                <p>Hệ thống <strong>DN Football</strong> xin nhắc bạn có <strong>{$soTranHomNay} ca đặt sân</strong> sẽ diễn ra trong ngày hôm nay (<strong>{$todayDisplay}</strong>){$hdLabel} tại cơ sở <strong>{$tenCumSanChinh}</strong> ({$diaChiChinh}):</p>
                                <p style='margin-bottom: 10px; font-size: 13.5px;'>&bull; Hình thức: {$loaiHinhText}</p>

                                <table style='width: 100%; border-collapse: collapse; font-size: 13.5px; margin-bottom: 16px;'>
                                    <thead>
                                        <tr style='background: #f1f5f9; color: #0f172a;'>
                                            <th style='padding: 10px; border: 1px solid #cbd5e1;'>STT</th>
                                            <th style='padding: 10px; border: 1px solid #cbd5e1;'>Mã Vé</th>
                                            <th style='padding: 10px; border: 1px solid #cbd5e1; text-align: left;'>Sân Bóng & Địa Chỉ</th>
                                            <th style='padding: 10px; border: 1px solid #cbd5e1;'>Khung Giờ Đá</th>
                                            <th style='padding: 10px; border: 1px solid #cbd5e1; text-align: right;'>Đơn Giá</th>
                                            <th style='padding: 10px; border: 1px solid #cbd5e1; text-align: right;'>Đã Cọc</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {$danhSachTranMailHtml}
                                    </tbody>
                                </table>

                                <div style='background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; font-size: 14px;'>
                                    <div>&bull; Tổng đơn giá các ca đá hôm nay ({$soTranHomNay} trận): <strong>" . number_format($tongTienSanHomNay, 0, ',', '.') . "đ</strong></div>
                                    <div>&bull; Tiền cọc đã thanh toán cho các ca hôm nay: <strong style='color: #047857;'>" . number_format($tongDaCocHomNay, 0, ',', '.') . "đ</strong></div>
                                    {$dongConThuHtml}
                                    <div style='margin-top: 6px; font-size: 13px; color: #15803d;'><em>* Lưu ý: Quý khách vui lòng có mặt tại sân trước giờ bóng lăn 10 - 15 phút và xuất trình Mã vé / Mã QR cho nhân viên trực sân để Check-in nhận sân.</em></div>
                                </div>

                                {$huongDanHuyHtml}

                                <p style='margin-top: 22px; margin-bottom: 0; font-size: 13.5px; color: #475569;'>Chúc bạn và đội bóng có những trận cầu thật sôi nổi tại <strong>DN Football</strong>!</p>
                            </div>
                        </div>
                    ";

                    Mail::html($noiDungEmail, function ($message) use ($emailNhan, $todayDisplay, $soTranHomNay, $tenCumSanChinh) {
                        $message->to($emailNhan)
                                ->subject("Nhắc lịch đá bóng hôm nay ({$todayDisplay}) - {$soTranHomNay} trận tại {$tenCumSanChinh}");
                    });
                } catch (\Exception $mailEx) {
                    \Illuminate\Support\Facades\Log::error('Lỗi gửi email nhắc lịch hôm nay: ' . $mailEx->getMessage());
                }
            }
        }
    }
}