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
                    throw new \Exception("Khung giờ {$slot['time']} ngày {$slot['date']} tại {$slot['pitchName']} vừa bị người khác đặt mất. Vui lòng chọn giờ khác!");
                }

                // Lưu dòng dữ liệu Đặt Sân với trạng thái 'DaCoc'
                DatSan::create([
                    'ID_NguoiDung' => $user->ID,
                    'ID_SanBong'   => $slot['pitchId'],
                    'ID_KhungGio'  => $khungGio->ID,
                    'ID_GiaiDau'   => ($purpose !== 'normal') ? $purpose : null,
                    'NgayDa'       => $ngayDa,
                    'TongTien'     => $slot['price'],
                    'TienCoc'      => $slot['price'] * $tyLeCoc,
                    'TrangThai'    => 'DaCoc' 
                ]);
            }

            // 4. TRỪ TIỀN USER VÀ TẠO GIAO DỊCH
            $soDuTruoc = $user->SoDuVi;
            $soDuSau = $soDuTruoc - $tienCoc;
            $user->update(['SoDuVi' => $soDuSau]);

            GiaoDich::create([
                'ID_NguoiDung' => $user->ID,
                'LoaiGiaoDich' => 'DatSan',
                'DongTien'     => 'Tru',
                'SoTien'       => $tienCoc,
                'SoDuTruoc'    => $soDuTruoc,
                'SoDuSau'      => $soDuSau,
                'NoiDung'      => "Thanh toán cọc đặt sân (" . count($slots) . " khung giờ)"
            ]);

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
            
            // Gửi tín hiệu để Frontend của Admin tự động Refresh giao diện
            broadcast(new \App\Events\AdminDataUpdated())->toOthers();

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
            return response()->json(['success' => true, 'message' => 'Hủy giải đấu thành công! Toàn bộ cọc đã được hoàn vào ví.']);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Lỗi hệ thống: ' . $e->getMessage()]);
        }
    }

    public function layDanhSachAdmin(Request $request)
    {
        $danhSach = DatSan::with(['nguoiDung', 'sanBong.cumSan', 'khungGio', 'giaiDau'])
            ->orderBy('NgayDa', 'desc')
            ->orderBy('ID_KhungGio', 'asc')
            ->get();
            
        return response()->json(['success' => true, 'data' => $danhSach]);
    }

    public function chotTrangThaiAdmin(Request $request, $id)
    {
        $request->validate(['trang_thai' => 'required|in:HoanThanh,KhongDen']);

        DB::beginTransaction();
        try {
            $datSan = DatSan::find($id);
            if (!$datSan) return response()->json(['success' => false, 'message' => 'Không tìm thấy dữ liệu đặt sân!']);

            if ($datSan->TrangThai !== 'DaCoc') {
                return response()->json(['success' => false, 'message' => 'Chỉ có thể chốt trạng thái đối với sân Đã cọc!']);
            }

            // 1. Cập nhật trận đấu lẻ
            $datSan->update(['TrangThai' => $request->trang_thai]);

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

            DB::commit();
            return response()->json(['success' => true, 'message' => 'Đã chốt trạng thái sân thành công!']);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Lỗi hệ thống: ' . $e->getMessage()]);
        }
    }
}
