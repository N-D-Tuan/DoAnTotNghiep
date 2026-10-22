<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Carbon\Carbon;
use App\Models\DatSan;
use App\Models\HoaDonDatSan;
use App\Models\NguoiDung;
use App\Models\GiaoDich;
use App\Models\GiaiDau;
use App\Models\KhungGio;
use App\Models\SanBong;
use App\Models\ThongBao;

class DatSanController extends Controller
{
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

        // 1. TÍNH TOÁN TIỀN CỌC
        $tongTien = array_reduce($slots, function ($carry, $slot) {
            return $carry + $slot['price'];
        }, 0);

        $tyLeCoc = ($purpose === 'normal') ? 0.3 : 0.5;
        $tienCoc = $tongTien * $tyLeCoc;

        // 2. KIỂM TRA SỐ DƯ VÍ
        if ($user->SoDuVi < $tienCoc) {
            return response()->json([
                'success' => false,
                'message' => 'Số dư ví không đủ (' . number_format($user->SoDuVi) . 'đ). Vui lòng nạp thêm tối thiểu ' . number_format($tienCoc - $user->SoDuVi) . 'đ để cọc!'
            ]);
        }

        // 3. BẮT ĐẦU TRANSACTION
        DB::beginTransaction();
        try {
            // 1. TẠO GIAO DỊCH TRƯỚC
            $soDuTruoc = $user->SoDuVi;
            $soDuSau = $soDuTruoc - $tienCoc;

            $giaoDich = GiaoDich::create([
                'MaNguoiDung'  => $user->MaNguoiDung,
                'LoaiGiaoDich' => 'DatSan',
                'DongTien'     => 'Tru',
                'SoTien'       => $tienCoc,
                'SoDuTruoc'    => $soDuTruoc,
                'SoDuSau'      => $soDuSau,
                'NoiDung'      => "Thanh toán cọc đặt sân (" . count($slots) . " khung giờ)"
            ]);

            // 2. CẬP NHẬT SỐ DƯ NGAY
            $user->update(['SoDuVi' => $soDuSau]);

            // 3. TẠO HÓA ĐƠN ĐẶT SÂN (1-1 VỚI GIAO DỊCH, 1-N VỚI ĐẶT SÂN)
            $hoaDon = HoaDonDatSan::create([
                'MaNguoiDung'         => $user->MaNguoiDung,
                'MaGiaoDich'          => $giaoDich->MaGiaoDich,
                'TongTienSan'         => $tongTien,
                'TienDaCoc'           => $tienCoc,
                'PhuongThucThanhToan' => 'ViDienTu',
                'TrangThai'           => 'DaCoc'
            ]);

            // 4. TẠO CÁC LỊCH ĐẶT SÂN CHI TIẾT
            $failed_slots = [];
            $failed_messages = [];
            $cacVeVuaTao = [];

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
                    $failed_slots[] = isset($slot['id']) ? $slot['id'] : null;
                    $failed_messages[] = "[{$slot['time']} ngày {$slot['date']}]";
                } else if (empty($failed_slots)) {
                    $veMoi = DatSan::create([
                        'MaNguoiDung'    => $user->MaNguoiDung,
                        'MaSanBong'      => $slot['pitchId'],
                        'MaKhungGio'     => $khungGio->MaKhungGio,
                        'MaGiaiDau'      => ($purpose !== 'normal') ? $purpose : null,
                        'MaHoaDonDatSan' => $hoaDon->MaHoaDonDatSan,
                        'NgayDa'         => $ngayDa,
                        'TongTien'       => $slot['price'],
                        'TienCoc'        => $slot['price'] * $tyLeCoc,
                        'TrangThai'      => 'DaCoc'
                    ]);

                    $cacVeVuaTao[] = [
                        'maVe'    => ($purpose !== 'normal') ? ('GD-' . $purpose) : ('PT-' . $veMoi->MaDatSan),
                        'tenSan'  => $slot['pitchName'] ?? 'Sân bóng',
                        'cumSan'  => $slot['clusterName'] ?? '',
                        'ngay'    => $slot['date'],
                        'gio'     => $slot['time'],
                        'tienCoc' => number_format($slot['price'] * $tyLeCoc, 0, ',', '.') . 'đ',
                        'conLai'  => number_format($slot['price'] * (1 - $tyLeCoc), 0, ',', '.') . 'đ'
                    ];
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
                                    <h3 style='margin:0 0 10px 0; color:#10B981; font-size:18px;'>Mã vé: #{$ve['maVe']}</h3>
                                    <p style='margin:4px 0;'><strong>Sân:</strong> {$ve['tenSan']} ({$ve['cumSan']})</p>
                                    <p style='margin:4px 0;'><strong>Ngày:</strong> {$ve['ngay']} | <strong>Giờ:</strong> {$ve['gio']}</p>
                                    <hr style='border:0; border-top:1px dashed #cbd5e1; margin:10px 0;'/>
                                    <p style='margin:4px 0;'><strong>Đã cọc:</strong> {$ve['tienCoc']}</p>
                                    <p style='margin:4px 0; color:#e11d48;'><strong>Cần thanh toán tại sân:</strong> {$ve['conLai']}</p>
                                </div>
                                <div style='text-align:center; border-left:1px dashed #cbd5e1; padding-left:15px;'>
                                    <img src='{$qrUrl}' alt='QR {$ve['maVe']}' style='width:120px; height:120px; display:block; margin:0 auto; border:1px solid #e2e8f0; border-radius:8px;' />
                                    <div style='font-size:11px; color:#64748b; margin-top:5px;'>Quét mã khi đến sân</div>
                                </div>
                            </div>
                        ";
                    }
                    Mail::html("<h2>Xác nhận đặt sân thành công - DN Football</h2><p>Chào <strong>{$user->HoTen}</strong>, dưới đây là vé điện tử kèm mã QR nhận sân của bạn (Mã hóa đơn: <strong>{$hoaDon->MaHoaDonDatSan}</strong>):</p>{$htmlVe}", function ($message) use ($user) {
                        $message->to($user->Email)->subject('Vé Điện Tử QR Code - DN Football');
                    });
                } catch (\Exception $mailEx) {}
            }

            broadcast(new \App\Events\AdminDataUpdated())->toOthers();
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            return response()->json(['success' => true, 'message' => 'Đặt sân thành công! Số dư đã được trừ.', 'data' => $cacVeVuaTao]);

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
                       ->get(['NgayDa', 'MaKhungGio']);

        return response()->json([
            'success' => true,
            'data'    => $daDat
        ]);
    }

    public function layDanhSachCuaToi(Request $request)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()->MaNguoiDung);

        $danhSach = DatSan::with(['sanBong.cumSan', 'khungGio', 'giaiDau', 'danhGia', 'hoaDonDatSan'])
                        ->where('MaNguoiDung', $user->MaNguoiDung)
                        ->orderBy('NgayDa', 'desc')
                        ->get();

        return response()->json(['success' => true, 'data' => $danhSach]);
    }

    public function huySanPhongTrao(Request $request, $id)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()->MaNguoiDung);

        $datSan = DatSan::with('khungGio', 'sanBong')->where('MaDatSan', $id)->where('MaNguoiDung', $user->MaNguoiDung)->first();

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
            $datSan->update(['TrangThai' => 'DaHuy']);

            if ($datSan->MaHoaDonDatSan) {
                self::dongBoHoaDonDatSan($datSan->MaHoaDonDatSan);
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

        $danhSachDat = DatSan::with('khungGio')->where('MaGiaiDau', $idGiaiDau)->where('TrangThai', 'DaCoc')->get();

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

        $query = DatSan::with(['nguoiDung', 'nhanVienXuLy', 'sanBong.cumSan', 'khungGio', 'giaiDau', 'hoaDonDatSan']);

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

        if (!$datSan->EmailKhachVangLai) {
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
                <p>Chào <strong>{$datSan->TenKhachVangLai}</strong>,</p>
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
                $message->to($datSan->EmailKhachVangLai)
                        ->subject('Mã OTP Xác Nhận Hủy Sân - DN Football');
            });

            return response()->json([
                'success' => true,
                'message' => 'Đã gửi mã OTP (hiệu lực 5 phút) tới email: ' . $datSan->EmailKhachVangLai
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
            $datSan = DatSan::with(['sanBong.cumSan', 'khungGio'])->find($id);
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
                    $user = NguoiDung::find($datSan->MaNguoiDung);
                    if ($user) {
                        $soDuTruoc = $user->SoDuVi;
                        $tienHoan = $datSan->TienCoc;
                        $soDuSau = $soDuTruoc + $tienHoan;

                        $user->update(['SoDuVi' => $soDuSau]);

                        GiaoDich::create([
                            'MaNguoiDung'    => $user->MaNguoiDung,
                            'MaNhanVienXuLy' => $userDangNhap->MaNguoiDung,
                            'LoaiGiaoDich'   => 'HoanTienHuySan',
                            'DongTien'       => 'Cong',
                            'SoTien'         => $tienHoan,
                            'SoDuTruoc'      => $soDuTruoc,
                            'SoDuSau'        => $soDuSau,
                            'NoiDung'        => "Hỗ trợ hủy lịch gấp và hoàn cọc: " . $tenSan
                        ]);
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

            $datSan->update([
                'TrangThai'      => $request->trang_thai,
                'MaNhanVienXuLy' => $userDangNhap->MaNguoiDung
            ]);

            if ($datSan->MaHoaDonDatSan) {
                self::dongBoHoaDonDatSan($datSan->MaHoaDonDatSan);
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
            } else if ($request->trang_thai === 'DaHuy' && $datSan->EmailKhachVangLai) {
                try {
                    $tienCocStr = number_format($datSan->TienCoc, 0, ',', '.') . 'đ';
                    $mailHuy = "
                        <h2>Xác nhận hủy lịch đặt sân thành công</h2>
                        <p>Chào <strong>{$datSan->TenKhachVangLai}</strong>,</p>
                        <p>Lịch đặt sân <strong>#PT-{$datSan->MaDatSan}</strong> tại <strong>{$tenSan} ({$cumSan})</strong> lúc <strong>{$gioDa} ngày {$ngayDa}</strong> đã được hủy thành công theo yêu cầu của bạn.</p>
                        <p><strong>Số tiền cọc hoàn lại:</strong> <span style='color:#10b981; font-weight:bold;'>{$tienCocStr}</span></p>
                        <p>Cảm ơn bạn đã sử dụng dịch vụ của DN Football!</p>
                    ";
                    Mail::html($mailHuy, function ($message) use ($datSan) {
                        $message->to($datSan->EmailKhachVangLai)
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
                    'NoiDung'        => "Thu tiền cọc trực tiếp tại sân (" . count($request->slots) . " khung giờ)"
                ]);
            }

            $tongTienSan = array_reduce($request->slots, function ($carry, $s) {
                return $carry + ($s['price'] ?? 0);
            }, 0);

            $hoaDon = HoaDonDatSan::create([
                'MaNguoiDung'         => $khachHang->MaNguoiDung,
                'MaGiaoDich'          => $giaoDich ? $giaoDich->MaGiaoDich : null,
                'TongTienSan'         => $tongTienSan,
                'TienDaCoc'           => $request->tien_coc,
                'PhuongThucThanhToan' => 'TienMat',
                'TrangThai'           => 'DaCoc'
            ]);

            $failed_slots = [];
            $failed_messages = [];

            $soLuongSlot = count($request->slots);
            $tienCocMoiSlot = ($request->tien_coc > 0) ? round($request->tien_coc / $soLuongSlot) : 0;

            foreach ($request->slots as $index => $slot) {
                $daDat = DatSan::where('MaSanBong', $slot['pitchId'])
                               ->where('NgayDa', $slot['dateDb'])
                               ->where('MaKhungGio', $slot['kgId'])
                               ->where('TrangThai', '!=', 'DaHuy')
                               ->lockForUpdate()
                               ->first();

                if ($daDat) {
                    $failed_slots[] = $slot['id'];
                    $failed_messages[] = "[{$slot['timeStr']} ngày {$slot['dateDisplay']}]";
                } else if (empty($failed_slots)) {
                    $cocThucTe = $tienCocMoiSlot;
                    if ($index === $soLuongSlot - 1) {
                        $cocThucTe = $request->tien_coc - ($tienCocMoiSlot * ($soLuongSlot - 1));
                    }

                    DatSan::create([
                        'MaNguoiDung'    => $khachHang->MaNguoiDung,
                        'MaSanBong'      => $slot['pitchId'],
                        'MaKhungGio'     => $slot['kgId'],
                        'MaGiaiDau'      => null,
                        'MaHoaDonDatSan' => $hoaDon->MaHoaDonDatSan,
                        'MaNhanVienXuLy' => $userDangNhap->MaNguoiDung,
                        'NgayDa'         => $slot['dateDb'],
                        'TongTien'       => $slot['price'],
                        'TienCoc'        => $cocThucTe,
                        'TrangThai'      => 'DaCoc'
                    ]);
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

            DB::commit();

            broadcast(new \App\Events\SystemDataUpdated())->toOthers();
            broadcast(new \App\Events\AdminDataUpdated())->toOthers();

            return response()->json(['success' => true, 'message' => 'Giữ sân thành công!']);

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
        $cacVeVuaTao = [];
        $maCumSan = null;

        DB::beginTransaction();
        try {
            $tongTienSan = array_reduce($slots, function ($carry, $s) {
                return $carry + ($s['price'] ?? 0);
            }, 0);
            $tongCocGuest = $tongTienSan * 0.3;

            $hoaDon = HoaDonDatSan::create([
                'MaNguoiDung'         => null,
                'MaGiaoDich'          => null,
                'TongTienSan'         => $tongTienSan,
                'TienDaCoc'           => $tongCocGuest,
                'PhuongThucThanhToan' => 'ChuyenKhoan',
                'TrangThai'           => 'DaCoc'
            ]);

            foreach ($slots as $slot) {
                $ngayDa = $slot['dateDb'];
                $khungGio = KhungGio::find($slot['kgId']);

                $sanBong = SanBong::find($slot['pitchId']);
                if ($sanBong && $maCumSan == null) {
                    $maCumSan = $sanBong->MaCumSan;
                }

                $daDat = DatSan::where('MaSanBong', $slot['pitchId'])
                               ->where('NgayDa', $ngayDa)
                               ->where('MaKhungGio', $khungGio->MaKhungGio)
                               ->where('TrangThai', '!=', 'DaHuy')
                               ->lockForUpdate()
                               ->first();

                if ($daDat) {
                    throw new \Exception("Khung giờ đã bị đặt trong lúc chờ thanh toán");
                }

                $tienCoc = $slot['price'] * 0.3;

                $veMoi = DatSan::create([
                    'TenKhachVangLai'   => $bookingData['ho_ten'],
                    'SDTKhachVangLai'   => $bookingData['sdt_khach'],
                    'EmailKhachVangLai' => $bookingData['email_khach'],
                    'MaSanBong'         => $slot['pitchId'],
                    'MaKhungGio'        => $khungGio->MaKhungGio,
                    'MaHoaDonDatSan'    => $hoaDon->MaHoaDonDatSan,
                    'NgayDa'            => $ngayDa,
                    'TongTien'          => $slot['price'],
                    'TienCoc'           => $tienCoc,
                    'TrangThai'         => 'DaCoc'
                ]);

                $cacVeVuaTao[] = [
                    'maVe'    => 'PT-' . $veMoi->MaDatSan,
                    'tenSan'  => $slot['pitchName'],
                    'cumSan'  => $slot['clusterName'],
                    'ngay'    => $slot['dateDisplay'],
                    'gio'     => $slot['timeStr'],
                    'tienCoc' => number_format($tienCoc, 0, ',', '.') . 'đ',
                    'conLai'  => number_format($slot['price'] - $tienCoc, 0, ',', '.') . 'đ'
                ];
            }

            DB::commit();

            $adminInfo = NguoiDung::where('VaiTro', 'Admin')->first();
            $sdtAdmin = $adminInfo ? $adminInfo->SoDienThoai : '0899244124';

            $sdtQuanLy = 'Đang cập nhật';
            if ($maCumSan) {
                $quanLy = NguoiDung::where('VaiTro', 'QuanLySan')->where('MaCumSan', $maCumSan)->first();
                if ($quanLy) {
                    $sdtQuanLy = $quanLy->SoDienThoai;
                }
            }

            try {
                $htmlVe = '';
                foreach ($cacVeVuaTao as $ve) {
                    $qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=6&data=" . urlencode($ve['maVe']);
                    $htmlVe .= "
                        <div style='border:1px solid #cbd5e1; padding:16px; margin-bottom:15px; border-radius:10px; display:flex; align-items:center; justify-content:space-between; background:#ffffff;'>
                            <div style='padding-right:15px;'>
                                <h3 style='margin:0 0 10px 0; color:#10B981; font-size:18px;'>Mã vé: #{$ve['maVe']}</h3>
                                <p style='margin:4px 0;'><strong>Sân:</strong> {$ve['tenSan']} ({$ve['cumSan']})</p>
                                <p style='margin:4px 0;'><strong>Ngày:</strong> {$ve['ngay']} | <strong>Giờ:</strong> {$ve['gio']}</p>
                                <hr style='border:0; border-top:1px dashed #cbd5e1; margin:10px 0;'/>
                                <p style='margin:4px 0;'><strong>Đã cọc:</strong> {$ve['tienCoc']}</p>
                                <p style='margin:4px 0; color:#e11d48;'><strong>Cần thanh toán tại sân:</strong> {$ve['conLai']}</p>
                            </div>
                            <div style='text-align:center; border-left:1px dashed #cbd5e1; padding-left:15px;'>
                                <img src='{$qrUrl}' alt='QR {$ve['maVe']}' style='width:120px; height:120px; display:block; margin:0 auto; border:1px solid #e2e8f0; border-radius:8px;' />
                                <div style='font-size:11px; color:#64748b; margin-top:5px;'>Quét mã khi đến sân</div>
                            </div>
                        </div>
                    ";
                }

                $noiDungMail = "
                    <h2>Xác nhận đặt sân thành công</h2>
                    <p>Chào {$bookingData['ho_ten']},</p>
                    <p>Cảm ơn bạn đã đặt sân tại DN Football. Dưới đây là thông tin vé của bạn (Mã hóa đơn: <strong>{$hoaDon->MaHoaDonDatSan}</strong>):</p>
                    {$htmlVe}
                    <div style='background:#fef2f2; border:1px solid #fca5a5; padding:15px; border-radius:8px; margin-top:20px;'>
                        <h4 style='margin:0 0 10px 0; color:#b91c1c;'>Lưu ý quan trọng:</h4>
                        <ul style='margin:0; padding-left:20px; color:#991b1b;'>
                            <li>Khách vãng lai không thể tự hủy sân trên hệ thống.</li>
                            <li>Nếu cần hỗ trợ hoặc hủy sân, vui lòng liên hệ:</li>
                            <li><strong>- Hotline Admin hệ thống:</strong> {$sdtAdmin}</li>
                            <li><strong>- Hotline Quản lý cụm sân:</strong> {$sdtQuanLy}</li>
                            <li>Bạn sẽ cần cung cấp Email này để nhận mã xác thực (OTP) nếu yêu cầu hủy sân để hoàn cọc.</li>
                        </ul>
                    </div>
                ";

                Mail::html($noiDungMail, function ($message) use ($bookingData) {
                    $message->to($bookingData['email_khach'])
                            ->subject('Vé Đặt Sân - DN Football');
                });
            } catch (\Exception $mailEx) {
                \Illuminate\Support\Facades\Log::error('Lỗi gửi mail vé khách vãng lai: ' . $mailEx->getMessage());
            }

            broadcast(new \App\Events\AdminDataUpdated())->toOthers();
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            return redirect($frontendUrl . '?vnpay_status=success#fields-section');

        } catch (\Exception $e) {
            DB::rollBack();
            return redirect($frontendUrl . '?vnpay_status=error#fields-section');
        }
    }

    public static function dongBoHoaDonDatSan($maHoaDon)
    {
        if (!$maHoaDon) return;

        $cacDatSan = DatSan::where('MaHoaDonDatSan', $maHoaDon)->get();
        if ($cacDatSan->isEmpty()) return;

        // 1. Xác định TrangThai của HoaDonDatSan theo thứ tự ưu tiên
        if ($cacDatSan->contains('TrangThai', 'DaCoc')) {
            $trangThaiHoaDon = 'DaCoc';
        } elseif ($cacDatSan->contains('TrangThai', 'HoanThanh')) {
            $trangThaiHoaDon = 'HoanThanh';
        } elseif ($cacDatSan->contains('TrangThai', 'KhongDen')) {
            $trangThaiHoaDon = 'KhongDen';
        } else {
            // Tất cả 100% các ca trong hóa đơn đều là 'DaHuy'
            $trangThaiHoaDon = 'DaHuy';
        }

        // 2. Tính toán lại TongTienSan và TienDaCoc của HoaDonDatSan
        if ($trangThaiHoaDon === 'DaHuy') {
            // Nếu toàn bộ hóa đơn bị hủy hết: giữ nguyên tổng tiền ban đầu để lưu lịch sử hóa đơn hủy
            $tongTienSan = $cacDatSan->sum('TongTien');
            $tienDaCoc   = $cacDatSan->sum('TienCoc');
        } else {
            // Chỉ tính các sân KHÔNG BỊ HỦY (loại bỏ các sân lẻ đã hủy và đã hoàn cọc)
            $cacSanHieuLuc = $cacDatSan->where('TrangThai', '!=', 'DaHuy');

            $tongTienSan = 0;
            $tienDaCoc   = 0;

            foreach ($cacSanHieuLuc as $ds) {
                $tienDaCoc += (float) $ds->TienCoc;

                // Nếu khách KhongDen (bùng sân, dù Phong trào hay Giải đấu) -> Chỉ thu đúng phần TienCoc đã cọc
                if ($ds->TrangThai === 'KhongDen') {
                    $tongTienSan += (float) $ds->TienCoc;
                } else {
                    $tongTienSan += (float) $ds->TongTien;
                }
            }
        }

        HoaDonDatSan::where('MaHoaDonDatSan', $maHoaDon)->update([
            'TongTienSan' => $tongTienSan,
            'TienDaCoc'   => $tienDaCoc,
            'TrangThai'   => $trangThaiHoaDon,
        ]);
    }
}