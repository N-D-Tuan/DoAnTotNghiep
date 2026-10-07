<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;
use App\Models\DatSan;
use App\Models\NguoiDung;
use App\Models\GiaoDich;
use App\Models\GiaiDau;
use App\Models\KhungGio;

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
                    DatSan::create([
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
            
            broadcast(new \App\Events\AdminDataUpdated())->toOthers();
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();

            return response()->json(['success' => true, 'message' => 'Đặt sân thành công! Số dư đã được trừ.']);

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

        $query = DatSan::with(['nguoiDung', 'sanBong.cumSan', 'khungGio', 'giaiDau']);

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

    public function chotTrangThaiAdmin(Request $request, $id)
    {
        $userDangNhap = auth()->user();

        $request->validate(['trang_thai' => 'required|in:HoanThanh,KhongDen,DaHuy']);

        DB::beginTransaction();
        try {
            // Load kèm sanBong và khungGio để lấy thông tin đưa vào nội dung thông báo
            $datSan = DatSan::with(['sanBong', 'khungGio'])->find($id);
            if (!$datSan) return response()->json(['success' => false, 'message' => 'Không tìm thấy dữ liệu đặt sân!']);

            if ($datSan->TrangThai !== 'DaCoc') {
                return response()->json(['success' => false, 'message' => 'Chỉ có thể chốt trạng thái đối với sân Đã cọc!']);
            }

            // 1. Cập nhật trận đấu lẻ
            $datSan->update(['TrangThai' => $request->trang_thai]);

            if ($request->trang_thai === 'DaHuy') {
                $user = NguoiDung::find($datSan->ID_NguoiDung);
                
                $soDuTruoc = $user->SoDuVi;
                $tienHoan = $datSan->TienCoc;
                $soDuSau = $soDuTruoc + $tienHoan;
                
                $user->update(['SoDuVi' => $soDuSau]);

                GiaoDich::create([
                    'ID_NguoiDung' => $user->ID,
                    'ID_NhanVienXuLy' => $userDangNhap->ID,
                    'LoaiGiaoDich' => 'HoanTienHuySan',
                    'DongTien'     => 'Cong',
                    'SoTien'       => $tienHoan,
                    'SoDuTruoc'    => $soDuTruoc,
                    'SoDuSau'      => $soDuSau,
                    'NoiDung'      => "Quản lý hỗ trợ hủy lịch gấp và hoàn cọc: " . ($datSan->sanBong ? $datSan->sanBong->TenSan : 'Sân bóng')
                ]);
            }

            // 2. KÍCH HOẠT AUTO-CHỐT GIẢI ĐẤU
            if ($datSan->ID_GiaiDau != null) {
                $giaiDau = GiaiDau::find($datSan->ID_GiaiDau);
                if ($giaiDau) {
                    // Kiểm tra xem giải đấu này CÒN trận nào chưa đá (Trạng thái DaCoc) không?
                    $conTranDaCoc = DatSan::where('ID_GiaiDau', $giaiDau->ID)
                                          ->where('TrangThai', 'DaCoc')
                                          ->exists();
                    
                    // Nếu KHÔNG CÒN trận nào, tự động đóng sổ Giải đấu
                    if (!$conTranDaCoc) {
                        $giaiDau->update(['TrangThai' => 'HoanThanh']);
                    }
                }
            }

            // 3. TẠO THÔNG BÁO CHO KHÁCH HÀNG
            $tenSan = $datSan->sanBong ? $datSan->sanBong->TenSan : 'Sân bóng';
            $ngayDa = date('d/m/Y', strtotime($datSan->NgayDa));
            $gioDa = $datSan->khungGio ? substr($datSan->khungGio->GioBatDau, 0, 5) . ' - ' . substr($datSan->khungGio->GioKetThuc, 0, 5) : '';

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

            // Lưu thông báo vào CSDL
            \App\Models\ThongBao::create([
                'ID_NguoiDung' => $datSan->ID_NguoiDung,
                'TieuDe'       => $tieuDe,
                'NoiDung'      => $noiDung,
                'LoaiThongBao' => 'DatSan'
            ]);

            DB::commit();

            // Phát tín hiệu Realtime cho khách hàng
            broadcast(new \App\Events\UserDataUpdated($datSan->ID_NguoiDung))->toOthers();
            broadcast(new \App\Events\AdminDataUpdated())->toOthers();
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();
            
            return response()->json(['success' => true, 'message' => 'Đã chốt trạng thái sân thành công!']);
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
}
