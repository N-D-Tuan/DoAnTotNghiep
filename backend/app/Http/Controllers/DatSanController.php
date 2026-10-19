<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Carbon\Carbon;
use App\Models\DatSan;
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
        $user = NguoiDung::find(Auth::id() ?? $request->user()->ID);

        if ($user && $user->TrangThaiKhoa) {
            return response()->json([
                'success' => false,
                'message' => 'Tài khoản của bạn đã bị hạn chế chức năng đặt sân do vi phạm quy định. Vui lòng liên hệ Hotline để được hỗ trợ!'
            ]);
        }

        $slots = $request->slots;
        $purpose = $request->purpose; // 'normal' hoặc ID của Giải đấu

        if (!$slots || count($slots) == 0) {
            return response()->json(['success' => false, 'message' => 'Giỏ hàng trống!']);
        }

        if ($purpose !== 'normal') {
            // Điều kiện 1: Bắt buộc đặt ít nhất 5 khung giờ
            if (count($slots) < 5) {
                return response()->json([
                    'success' => false, 
                    'message' => 'Theo quy định, tổ chức giải đấu phải đặt tối thiểu 5 khung giờ!'
                ]);
            }

            // Điều kiện 2: Kiểm tra thời hạn 3 ngày kể từ NgayDuyet
            $giaiDau = GiaiDau::find($purpose);
            if (!$giaiDau) {
                return response()->json(['success' => false, 'message' => 'Không tìm thấy thông tin giải đấu!']);
            }

            // Cộng 3 ngày vào Ngày Duyệt và so sánh với thời gian hiện tại
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
            // 1. TẠO GIAO DỊCH TRƯỚC (ĐỂ LẤY ID)
            $soDuTruoc = $user->SoDuVi;
            $soDuSau = $soDuTruoc - $tienCoc;
            
            $giaoDich = GiaoDich::create([
                'ID_NguoiDung' => $user->ID,
                'LoaiGiaoDich' => 'DatSan',
                'DongTien'     => 'Tru',
                'SoTien'       => $tienCoc,
                'SoDuTruoc'    => $soDuTruoc,
                'SoDuSau'      => $soDuSau,
                'NoiDung'      => "Thanh toán cọc đặt sân (" . count($slots) . " khung giờ)"
            ]);

            // 2. CẬP NHẬT SỐ DƯ NGAY
            $user->update(['SoDuVi' => $soDuSau]);

            // 3. TẠO CÁC LỊCH ĐẶT SÂN
            $failed_slots = [];
            $failed_messages = [];
            $cacVeVuaTao = [];

            foreach ($slots as $slot) {
                // Chuyển đổi định dạng ngày DD/MM/YYYY sang Y-m-d
                $ngayDa = Carbon::createFromFormat('d/m/Y', $slot['date'])->format('Y-m-d');
                $gioBatDau = explode(' - ', $slot['time'])[0] . ':00';
                
                $khungGio = KhungGio::where('GioBatDau', $gioBatDau)->first();
                if (!$khungGio) {
                    throw new \Exception("Lỗi dữ liệu khung giờ: {$slot['time']}");
                }

                // CƠ CHẾ CHỐNG RACE CONDITION (Khóa Pessimistic Locking)
                // lockForUpdate() sẽ khóa dòng này lại, ai truy cập cùng lúc phải đứng chờ
                $daDat = DatSan::where('ID_SanBong', $slot['pitchId'])
                               ->where('NgayDa', $ngayDa)
                               ->where('ID_KhungGio', $khungGio->ID)
                               ->where('TrangThai', '!=', 'DaHuy')
                               ->lockForUpdate() 
                               ->first();

                if ($daDat) {   
                    $failed_slots[] = isset($slot['id']) ? $slot['id'] : null;
                    $failed_messages[] = "[{$slot['time']} ngày {$slot['date']}]";
                } else if (empty($failed_slots)) {
                    // Chỉ Insert nếu CHƯA phát hiện bất kỳ lỗi nào trong toàn bộ vòng lặp
                    $veMoi = DatSan::create([
                        'ID_NguoiDung' => $user->ID,
                        'ID_SanBong'   => $slot['pitchId'],
                        'ID_KhungGio'  => $khungGio->ID,
                        'ID_GiaiDau'   => ($purpose !== 'normal') ? $purpose : null,
                        'ID_GiaoDich'  => $giaoDich->ID,
                        'NgayDa'       => $ngayDa,
                        'TongTien'     => $slot['price'],
                        'TienCoc'      => $slot['price'] * $tyLeCoc,
                        'TrangThai'    => 'DaCoc' 
                    ]);

                    $cacVeVuaTao[] = [
                        'maVe'    => ($purpose !== 'normal') ? ('GD-' . $purpose) : ('PT-' . $veMoi->ID),
                        'tenSan'  => $slot['pitchName'] ?? 'Sân bóng',
                        'cumSan'  => $slot['clusterName'] ?? '',
                        'ngay'    => $slot['date'],
                        'gio'     => $slot['time'],
                        'tienCoc' => number_format($slot['price'] * $tyLeCoc, 0, ',', '.') . 'đ',
                        'conLai'  => number_format($slot['price'] * (1 - $tyLeCoc), 0, ',', '.') . 'đ'
                    ];
                }
            }

            // Nếu có bất kỳ slot nào bị trùng, Rollback và báo lỗi hàng loạt
            if (!empty($failed_slots)) {
                DB::rollBack();
                $msg_gop = implode(', ', $failed_messages);
                return response()->json([
                    'success' => false,
                    'message' => "Rất tiếc! Các khung giờ sau vừa bị khách khác đặt mất: {$msg_gop}. Hệ thống đã tự động gỡ chúng khỏi giỏ hàng!",
                    'failed_slot_ids' => $failed_slots // Trả về dạng Mảng (Array)
                ]);
            }

            // 5. CẬP NHẬT TRẠNG THÁI GIẢI ĐẤU
            if ($purpose !== 'normal') {
                $giaiDau = GiaiDau::find($purpose);
                if ($giaiDau) {
                    // Cập nhật thành 'HetHan' để khóa giải đấu lại, tránh bị lợi dụng đặt thêm
                    $giaiDau->update(['TrangThai' => 'HetHan']);
                }
            }

            // MỌI THỨ AN TOÀN -> LƯU VÀO DB
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
                    Mail::html("<h2>Xác nhận đặt sân thành công - DN Football</h2><p>Chào <strong>{$user->HoTen}</strong>, dưới đây là vé điện tử kèm mã QR nhận sân của bạn:</p>{$htmlVe}", function ($message) use ($user) {
                        $message->to($user->Email)->subject('Vé Điện Tử QR Code - DN Football');
                    });
                } catch (\Exception $mailEx) {}
            }
            
            broadcast(new \App\Events\AdminDataUpdated())->toOthers();
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            return response()->json(['success' => true, 'message' => 'Đặt sân thành công! Số dư đã được trừ.', 'data' => $cacVeVuaTao]);

        } catch (\Exception $e) {
            // NẾU CÓ LỖI (Người khác đặt trước, lỗi DB) -> HOÀN TÁC TOÀN BỘ VÀ KHÔNG TRỪ TIỀN
            DB::rollBack();
            return response()->json(['success' => false, 'message' => $e->getMessage()]);
        }
    }

    public function layDanhSachDaDat(Request $request)
    {
        $idSanBong = $request->query('id_san_bong');
        
        // Lấy các khung giờ đã đặt (Trạng thái khác DaHuy) của sân này
        $daDat = DatSan::where('ID_SanBong', $idSanBong)
                       ->where('TrangThai', '!=', 'DaHuy')
                       ->get(['NgayDa', 'ID_KhungGio']); // Chỉ lấy 2 cột cần thiết cho nhẹ
                       
        return response()->json([
            'success' => true,
            'data' => $daDat
        ]);
    }

    public function layDanhSachCuaToi(Request $request)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()->ID);
        
        $danhSach = DatSan::with(['sanBong.cumSan', 'khungGio', 'giaiDau'])
                          ->where('ID_NguoiDung', $user->ID)
                          ->orderBy('NgayDa', 'desc')
                          ->get();

        return response()->json(['success' => true, 'data' => $danhSach]);
    }

    public function huySanPhongTrao(Request $request, $id)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()->ID);
        
        $datSan = DatSan::with('khungGio', 'sanBong')->where('ID', $id)->where('ID_NguoiDung', $user->ID)->first();

        if (!$datSan) return response()->json(['success' => false, 'message' => 'Không tìm thấy lịch đặt!']);
        if ($datSan->ID_GiaiDau != null) return response()->json(['success' => false, 'message' => 'Đây là lịch đá giải. Vui lòng hủy theo toàn bộ giải đấu!']);
        if ($datSan->TrangThai !== 'DaCoc') return response()->json(['success' => false, 'message' => 'Chỉ có thể hủy tự động đối với sân ở trạng thái Đã cọc!']);

        // Nghiệp vụ: Phải hủy trước 10 tiếng
        $thoiGianDa = Carbon::parse($datSan->NgayDa . ' ' . $datSan->khungGio->GioBatDau);
        if (now()->diffInHours($thoiGianDa, false) < 10) {
            return response()->json(['success' => false, 'message' => 'Đã quá hạn hủy miễn phí (phải hủy trước 10 tiếng). Vui lòng tạo Yêu cầu hủy gấp!']);
        }

        DB::beginTransaction();
        try {
            $tienHoan = $datSan->TienCoc;
            $datSan->update(['TrangThai' => 'DaHuy']);

            $soDuTruoc = $user->SoDuVi;
            $soDuSau = $soDuTruoc + $tienHoan;
            $user->update(['SoDuVi' => $soDuSau]);

            GiaoDich::create([
                'ID_NguoiDung' => $user->ID,
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
        $user = NguoiDung::find(Auth::id() ?? $request->user()->ID);
        
        $giaiDau = GiaiDau::where('ID', $idGiaiDau)->where('ID_NguoiDung', $user->ID)->first();
        if (!$giaiDau) return response()->json(['success' => false, 'message' => 'Không tìm thấy giải đấu!']);

        // Lấy tất cả lịch đặt chưa diễn ra thuộc giải đấu này
        $danhSachDat = DatSan::with('khungGio')->where('ID_GiaiDau', $idGiaiDau)->where('TrangThai', 'DaCoc')->get();

        if ($danhSachDat->isEmpty()) {
            return response()->json(['success' => false, 'message' => 'Giải đấu này không còn lịch đặt hợp lệ để hủy!']);
        }

        // Nghiệp vụ: Tìm trận khai mạc sớm nhất, phải hủy trước 7 ngày
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
            
            // Cập nhật trạng thái hàng loạt
            DatSan::where('ID_GiaiDau', $idGiaiDau)->where('TrangThai', 'DaCoc')->update(['TrangThai' => 'DaHuy']);
            $giaiDau->update(['TrangThai' => 'DaHuy']);

            $soDuTruoc = $user->SoDuVi;
            $soDuSau = $soDuTruoc + $tongTienHoan;
            $user->update(['SoDuVi' => $soDuSau]);

            GiaoDich::create([
                'ID_NguoiDung' => $user->ID,
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

        $query = DatSan::with(['nguoiDung', 'nhanVienXuLy', 'sanBong.cumSan', 'khungGio', 'giaiDau']);

        // CHÈN LOGIC CÁCH LY
        if ($userDangNhap->VaiTro === 'QuanLySan') {
            $query->whereHas('sanBong', function ($q) use ($userDangNhap) {
                $q->where('ID_CumSan', $userDangNhap->ID_CumSan);
            });
        }

        $danhSach = $query->orderBy('NgayDa', 'desc')
                          ->orderBy('ID_KhungGio', 'asc')
                          ->get();
            
        return response()->json(['success' => true, 'data' => $danhSach]);
    }

    public function guiOtpHuySanGuest(Request $request, $id)
    {
        $datSan = DatSan::with(['sanBong.cumSan', 'khungGio'])->find($id);
        if (!$datSan) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy dữ liệu đặt sân!']);
        }

        if ($datSan->ID_NguoiDung !== null) {
            return response()->json(['success' => false, 'message' => 'Đây là lịch của khách có tài khoản, không cần dùng OTP!']);
        }

        if ($datSan->TrangThai !== 'DaCoc') {
            return response()->json(['success' => false, 'message' => 'Chỉ có thể hủy sân đang ở trạng thái Đã cọc!']);
        }

        if (!$datSan->EmailKhachVangLai) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy địa chỉ Email của khách vãng lai này!']);
        }

        // Sinh mã OTP 6 chữ số và lưu vào Cache trong 5 phút
        $otp = (string) rand(100000, 999999);
        \Illuminate\Support\Facades\Cache::put('guest_cancel_otp_' . $datSan->ID, $otp, now()->addMinutes(5));

        $tenSan = $datSan->sanBong ? $datSan->sanBong->TenSan : 'Sân bóng';
        $cumSan = ($datSan->sanBong && $datSan->sanBong->cumSan) ? $datSan->sanBong->cumSan->TenCumSan : '';
        $ngayDa = date('d/m/Y', strtotime($datSan->NgayDa));
        $gioDa = $datSan->khungGio ? substr($datSan->khungGio->GioBatDau, 0, 5) . ' - ' . substr($datSan->khungGio->GioKetThuc, 0, 5) : '';
        $tienCoc = number_format($datSan->TienCoc, 0, ',', '.') . 'đ';

        try {
            $noiDungMail = "
                <h2>Mã xác thực (OTP) hủy lịch đặt sân</h2>
                <p>Chào <strong>{$datSan->TenKhachVangLai}</strong>,</p>
                <p>Hệ thống DN Football vừa nhận được yêu cầu hủy lịch đặt sân và hoàn tiền cọc cho vé <strong>#PT-{$datSan->ID}</strong>:</p>
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

            // NẾU LÀ HỦY SÂN: TÁCH 2 LUỒNG (KHÁCH TÀI KHOẢN vs KHÁCH VÃNG LAI)
            if ($request->trang_thai === 'DaHuy') {
                if ($datSan->ID_NguoiDung !== null) {
                    // --- LUỒNG 1: KHÁCH HÀNG CÓ TÀI KHOẢN ---
                    $user = NguoiDung::find($datSan->ID_NguoiDung);
                    if ($user) {
                        $soDuTruoc = $user->SoDuVi;
                        $tienHoan = $datSan->TienCoc;
                        $soDuSau = $soDuTruoc + $tienHoan;
                        
                        $user->update(['SoDuVi' => $soDuSau]);

                        GiaoDich::create([
                            'ID_NguoiDung'    => $user->ID,
                            'ID_NhanVienXuLy' => $userDangNhap->ID,
                            'LoaiGiaoDich'    => 'HoanTienHuySan',
                            'DongTien'        => 'Cong',
                            'SoTien'          => $tienHoan,
                            'SoDuTruoc'       => $soDuTruoc,
                            'SoDuSau'         => $soDuSau,
                            'NoiDung'         => "Hỗ trợ hủy lịch gấp và hoàn cọc: " . $tenSan
                        ]);
                    }
                } else {
                    // --- LUỒNG 2: KHÁCH VÃNG LAI ---
                    // Kiểm tra mã OTP xác thực
                    $otpInput = trim($request->input('otp', ''));
                    $cachedOtp = \Illuminate\Support\Facades\Cache::get('guest_cancel_otp_' . $datSan->ID);

                    if (!$otpInput || !$cachedOtp || $otpInput !== (string) $cachedOtp) {
                   DB::rollBack();
                   return response()->json([
                       'success' => false,
                       'message' => 'Mã OTP không chính xác hoặc đã bị hết hạn!<br>Vui lòng kiểm tra lại.'
                   ]);
               }

                    // Xóa OTP sau khi xác thực thành công
                    \Illuminate\Support\Facades\Cache::forget('guest_cancel_otp_' . $datSan->ID);
                }
            }

            // 1. Cập nhật trạng thái trận đấu và lưu người xử lý
            $datSan->update([
                'TrangThai'       => $request->trang_thai,
                'ID_NhanVienXuLy' => $userDangNhap->ID
            ]);

            // 2. KÍCH HOẠT AUTO-CHỐT GIẢI ĐẤU (Nếu có)
            if ($datSan->ID_GiaiDau != null) {
                $giaiDau = GiaiDau::find($datSan->ID_GiaiDau);
                if ($giaiDau) {
                    $conTranDaCoc = DatSan::where('ID_GiaiDau', $giaiDau->ID)
                                          ->where('TrangThai', 'DaCoc')
                                          ->exists();
                    if (!$conTranDaCoc) {
                        $giaiDau->update(['TrangThai' => 'HoanThanh']);
                    }
                }
            }

            // 3. TẠO THÔNG BÁO (CHỈ DÀNH CHO KHÁCH CÓ TÀI KHOẢN) HOẶC GỬI MAIL (CHO KHÁCH VÃNG LAI)
            if ($datSan->ID_NguoiDung !== null) {
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
                    'ID_NguoiDung' => $datSan->ID_NguoiDung,
                    'TieuDe'       => $tieuDe,
                    'NoiDung'      => $noiDung,
                    'LoaiThongBao' => 'DatSan'
                ]);
            } else if ($request->trang_thai === 'DaHuy' && $datSan->EmailKhachVangLai) {
                // Gửi Email xác nhận đã hủy vé cho khách vãng lai
                try {
                    $tienCocStr = number_format($datSan->TienCoc, 0, ',', '.') . 'đ';
                    $mailHuy = "
                        <h2>Xác nhận hủy lịch đặt sân thành công</h2>
                        <p>Chào <strong>{$datSan->TenKhachVangLai}</strong>,</p>
                        <p>Lịch đặt sân <strong>#PT-{$datSan->ID}</strong> tại <strong>{$tenSan} ({$cumSan})</strong> lúc <strong>{$gioDa} ngày {$ngayDa}</strong> đã được hủy thành công theo yêu cầu của bạn.</p>
                        <p><strong>Số tiền cọc hoàn lại:</strong> <span style='color:#10b981; font-weight:bold;'>{$tienCocStr}</span></p>
                        <p>Cảm ơn bạn đã sử dụng dịch vụ của DN Football!</p>
                    ";
                    Mail::html($mailHuy, function ($message) use ($datSan) {
                        $message->to($datSan->EmailKhachVangLai)
                                ->subject('Xác nhận hủy vé đặt sân #PT-' . $datSan->ID . ' - DN Football');
                    });
                } catch (\Exception $mailEx) {
                    \Illuminate\Support\Facades\Log::error('Lỗi gửi mail hủy sân khách vãng lai: ' . $mailEx->getMessage());
                }
            }

            DB::commit();

            if ($datSan->ID_NguoiDung !== null) {
                broadcast(new \App\Events\UserDataUpdated($datSan->ID_NguoiDung))->toOthers();
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
            // 1. TÌM HOẶC TẠO NHANH TÀI KHOẢN KHÁCH HÀNG
            $khachHang = NguoiDung::where('SoDienThoai', $request->sdt_khach)->first();
            
            if (!$khachHang) {
                $tenKhach = $request->ho_ten ? $request->ho_ten : 'Khách Offline';
                $emailAo = $request->sdt_khach . '@dnfootball.offline';
                $khachHang = NguoiDung::create([
                    'HoTen' => $tenKhach,
                    'SoDienThoai' => $request->sdt_khach,
                    'Email' => $emailAo,
                    'MatKhau' => \Illuminate\Support\Facades\Hash::make('123456'), // Mật khẩu mặc định
                    'VaiTro' => 'KhachHang',
                    'SoDuVi' => 0
                ]);
            }

            // 2. TẠO GIAO DỊCH TRƯỚC
            $giaoDich = null;
            if ($request->tien_coc > 0) {
                $giaoDich = GiaoDich::create([
                    'ID_NguoiDung'    => $khachHang->ID,
                    'ID_NhanVienXuLy' => $userDangNhap->ID,
                    'LoaiGiaoDich'    => 'DatSan',
                    'DongTien'        => 'Tru',
                    'SoTien'          => $request->tien_coc,
                    'SoDuTruoc'       => $khachHang->SoDuVi,
                    'SoDuSau'         => $khachHang->SoDuVi, // Không trừ ví
                    'NoiDung'         => "Thu tiền cọc trực tiếp tại sân (" . count($request->slots) . " khung giờ)"
                ]);
            }

            $failed_slots = [];
            $failed_messages = [];

            // Thuật toán chia đều tiền cọc
            $soLuongSlot = count($request->slots);
            $tienCocMoiSlot = ($request->tien_coc > 0) ? round($request->tien_coc / $soLuongSlot) : 0;

            // 3. LẶP QUA CÁC SLOT ĐỂ CHỐNG TRÙNG LỊCH (Pessimistic Locking)
            foreach ($request->slots as $index => $slot) {
                $daDat = DatSan::where('ID_SanBong', $slot['pitchId'])
                               ->where('NgayDa', $slot['dateDb'])
                               ->where('ID_KhungGio', $slot['kgId'])
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

                    // 3. TẠO LỊCH ĐẶT SÂN
                    DatSan::create([
                        'ID_NguoiDung' => $khachHang->ID,
                        'ID_SanBong'   => $slot['pitchId'],
                        'ID_KhungGio'  => $slot['kgId'],
                        'ID_GiaiDau'   => null,
                        'ID_NhanVienXuLy' => $userDangNhap->ID,
                        'ID_GiaoDich'     => $giaoDich ? $giaoDich->ID : null,
                        'NgayDa'       => $slot['dateDb'],
                        'TongTien'     => $slot['price'],
                        'TienCoc'      => $cocThucTe,
                        'TrangThai'    => 'DaCoc' 
                    ]);
                }
            }

            // Nếu có bất kỳ slot nào bị trùng, Rollback và báo lỗi hàng loạt
            if (!empty($failed_slots)) {
                DB::rollBack();
                $msg_gop = implode(', ', $failed_messages);
                return response()->json([
                    'success' => false,
                    'message' => "Lỗi! Các khung giờ sau vừa bị khách hàng khác đặt mất: {$msg_gop}. Đã tự động gỡ khỏi giỏ!",
                    'failed_slot_ids' => $failed_slots
                ]);
            }

            DB::commit();

            // Phát tín hiệu làm mới giao diện cho TẤT CẢ mọi người
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

        // Kiểm tra trước xem các khung giờ khách chọn có bị ai đặt mất chưa (Chưa INSERT vào DB)
        foreach ($slots as $slot) {
            $ngayDa = $slot['dateDb'];
            $khungGio = KhungGio::find($slot['kgId']);
            
            if (!$khungGio) {
                return response()->json(['success' => false, 'message' => 'Lỗi dữ liệu khung giờ!']);
            }

            $daDat = DatSan::where('ID_SanBong', $slot['pitchId'])
                           ->where('NgayDa', $ngayDa)
                           ->where('ID_KhungGio', $khungGio->ID)
                           ->where('TrangThai', '!=', 'DaHuy')
                           ->first();

            if ($daDat) {
                $failed_slots[] = $slot['id'];
                $failed_messages[] = "[{$slot['timeStr']} ngày {$slot['dateDisplay']}]";
            } else {
                $tongTienCoc += ($slot['price'] * 0.3); // Cọc 30%
            }
        }

        if (!empty($failed_slots)) {
            $msg_gop = implode(', ', $failed_messages);
            return response()->json([
                'success' => false,
                'message' => "Rất tiếc! Các khung giờ sau vừa bị đặt mất: {$msg_gop}.",
                'failed_slot_ids' => $failed_slots
            ]);
        }

        // Sinh mã giao dịch duy nhất và lưu thông tin đặt sân tạm vào Cache (15 phút)
        $vnp_TxnRef = 'GUEST_' . time() . '_' . rand(1000, 9999);
        \Illuminate\Support\Facades\Cache::put('guest_booking_' . $vnp_TxnRef, [
            'ho_ten'      => $request->ho_ten,
            'sdt_khach'   => $request->sdt_khach,
            'email_khach' => $request->email_khach,
            'slots'       => $slots,
        ], now()->addMinutes(15));

        // Tạo URL thanh toán VNPay
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

    // XỬ LÝ KẾT QUẢ VNPAY TRẢ VỀ: THÀNH CÔNG MỚI TẠO DATSAN
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

        // Kiểm tra chữ ký bảo mật
        if ($secureHash !== $vnp_SecureHash) {
            return redirect($frontendUrl . '?vnpay_status=invalid_signature#fields-section');
        }

        // Nếu thanh toán thất bại hoặc người dùng bấm Hủy trên VNPay
        if ($request->vnp_ResponseCode !== '00') {
            \Illuminate\Support\Facades\Cache::forget('guest_booking_' . $request->vnp_TxnRef);
            return redirect($frontendUrl . '?vnpay_status=failed#fields-section');
        }

        // Thanh toán thành công (ResponseCode == '00') -> Lấy dữ liệu từ Cache ra để tạo DatSan
        $bookingData = \Illuminate\Support\Facades\Cache::pull('guest_booking_' . $request->vnp_TxnRef);
        if (!$bookingData) {
            return redirect($frontendUrl . '?vnpay_status=error#fields-section');
        }

        $slots = $bookingData['slots'];
        $cacVeVuaTao = [];
        $idCumSan = null;

        DB::beginTransaction();
        try {
            foreach ($slots as $slot) {
                $ngayDa = $slot['dateDb'];
                $khungGio = KhungGio::find($slot['kgId']);
                
                $sanBong = SanBong::find($slot['pitchId']);
                if ($sanBong && $idCumSan == null) {
                    $idCumSan = $sanBong->ID_CumSan;
                }

                // Khóa dòng chống trùng lặp
                $daDat = DatSan::where('ID_SanBong', $slot['pitchId'])
                               ->where('NgayDa', $ngayDa)
                               ->where('ID_KhungGio', $khungGio->ID)
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
                    'ID_SanBong'        => $slot['pitchId'],
                    'ID_KhungGio'       => $khungGio->ID,
                    'NgayDa'            => $ngayDa,
                    'TongTien'          => $slot['price'],
                    'TienCoc'           => $tienCoc,
                    'TrangThai'         => 'DaCoc'
                ]);

                $cacVeVuaTao[] = [
                    'maVe'    => 'PT-' . $veMoi->ID,
                    'tenSan'  => $slot['pitchName'],
                    'cumSan'  => $slot['clusterName'],
                    'ngay'    => $slot['dateDisplay'],
                    'gio'     => $slot['timeStr'],
                    'tienCoc' => number_format($tienCoc, 0, ',', '.') . 'đ',
                    'conLai'  => number_format($slot['price'] - $tienCoc, 0, ',', '.') . 'đ'
                ];
            }

            DB::commit();

            // Tìm thông tin Admin và Quản lý cụm sân để gửi Email vé
            $adminInfo = NguoiDung::where('VaiTro', 'Admin')->first();
            $sdtAdmin = $adminInfo ? $adminInfo->SoDienThoai : '0899244124';

            $sdtQuanLy = 'Đang cập nhật';
            if ($idCumSan) {
                $quanLy = NguoiDung::where('VaiTro', 'QuanLySan')->where('ID_CumSan', $idCumSan)->first();
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
                    <p>Cảm ơn bạn đã đặt sân tại DN Football. Dưới đây là thông tin vé của bạn:</p>
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
}
