<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Models\YeuCauHuyGap;
use App\Models\DatSan;
use App\Models\NguoiDung;
use App\Models\GiaoDich;
use App\Models\GiaiDau;
use App\Models\ThongBao;

class YeuCauHuyGapController extends Controller
{
    // =========================================================
    // 1. KHÁCH HÀNG TẠO YÊU CẦU HỦY GẤP
    // =========================================================
    public function taoYeuCau(Request $request)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()->ID);
        $request->validate([
            'id_dat_san' => 'required|exists:DatSan,ID',
            'noi_dung'   => 'required|string|max:500'
        ]);

        $datSan = DatSan::find($request->id_dat_san);

        if ($datSan->ID_NguoiDung !== $user->ID) {
            return response()->json(['success' => false, 'message' => 'Bạn không có quyền thao tác trên lịch đặt này!']);
        }
        if ($datSan->TrangThai !== 'DaCoc') {
            return response()->json(['success' => false, 'message' => 'Chỉ có thể tạo yêu cầu hủy gấp đối với sân đang ở trạng thái Đã cọc!']);
        }

        // Kiểm tra xem đã có yêu cầu nào đang chờ duyệt chưa
        if ($datSan->ID_GiaiDau != null) {
            // TRƯỜNG HỢP GIẢI ĐẤU: Kiểm tra xem có bất kỳ khung giờ nào thuộc giải này đang xin hủy không
            $daTonTaiGiaiDau = YeuCauHuyGap::whereHas('datSan', function ($query) use ($datSan) {
                $query->where('ID_GiaiDau', $datSan->ID_GiaiDau);
            })->where('TrangThai', 'ChoDuyet')->exists();

            if ($daTonTaiGiaiDau) {
                return response()->json([
                    'success' => false, 
                    'message' => 'Giải đấu này đang có yêu cầu hủy chờ xử lý! Vui lòng không gửi thêm yêu cầu trùng lặp.'
                ]);
            }
        } else {
            // TRƯỜNG HỢP PHONG TRÀO: Chỉ kiểm tra chính xác ID_DatSan này
            $daTonTai = YeuCauHuyGap::where('ID_DatSan', $datSan->ID)
                                    ->where('TrangThai', 'ChoDuyet')
                                    ->exists();
            if ($daTonTai) {
                return response()->json([
                    'success' => false, 
                    'message' => 'Sân này đã có yêu cầu hủy đang chờ xử lý!'
                ]);
            }
        }

        DB::beginTransaction();
        try {
            // Tạo yêu cầu mới
            YeuCauHuyGap::create([
                'ID_NguoiDung' => $user->ID,
                'ID_DatSan'    => $datSan->ID,
                'NoiDung'      => $request->noi_dung,
                'TrangThai'    => 'ChoDuyet'
            ]);

            // Tạo thông báo cho toàn bộ Admin
            $admins = NguoiDung::where('VaiTro', 'Admin')->get();
            foreach ($admins as $admin) {
                ThongBao::create([
                    'ID_NguoiDung' => $admin->ID,
                    'TieuDe'       => 'Yêu cầu hủy sân gấp mới',
                    'NoiDung'      => "Khách hàng {$user->HoTen} vừa gửi 1 yêu cầu hủy sân gấp.",
                    'LoaiThongBao' => 'DatSan'
                ]);
            }

            DB::commit();

            // Phát tín hiệu cho Admin ngay lập tức
            broadcast(new \App\Events\AdminDataUpdated())->toOthers();

            return response()->json(['success' => true, 'message' => 'Đã gửi yêu cầu hủy gấp thành công! Vui lòng chờ Admin phê duyệt.']);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Lỗi hệ thống: ' . $e->getMessage()]);
        }
    }

    // =========================================================
    // 2. ADMIN XỬ LÝ YÊU CẦU HỦY GẤP
    // =========================================================
    public function xuLyYeuCau(Request $request, $id)
    {
        $request->validate([
            'trang_thai' => 'required|in:DaDuyet,TuChoi',
            'ly_do_huy'  => 'required_if:trang_thai,TuChoi|string|nullable'
        ], [
            'ly_do_huy.required_if' => 'Vui lòng nhập lý do từ chối.'
        ]);
        
        DB::beginTransaction();
        try {
            $yeuCau = YeuCauHuyGap::with('datSan.sanBong')->find($id);
            if (!$yeuCau || $yeuCau->TrangThai !== 'ChoDuyet') {
                return response()->json(['success' => false, 'message' => 'Yêu cầu không tồn tại hoặc đã được xử lý trước đó!']);
            }

            // Lưu trạng thái, ngày duyệt và Lý do hủy
            $yeuCau->update([
                'TrangThai' => $request->trang_thai,
                'NgayDuyet' => now(),
                'LyDoHuy'   => $request->trang_thai === 'TuChoi' ? $request->ly_do_huy : null
            ]);

            $datSan = $yeuCau->datSan;
            $user = NguoiDung::find($yeuCau->ID_NguoiDung);

            $tieuDeTB = '';
            $noiDungTB = '';

            if ($request->trang_thai === 'DaDuyet') {
                // KIỂM TRA: LÀ SÂN PHONG TRÀO HAY SÂN GIẢI ĐẤU?
                if ($datSan->ID_GiaiDau != null) {
                    // XỬ LÝ GIẢI ĐẤU: Hủy toàn bộ trận đấu đang ở trạng thái DaCoc
                    $danhSachDat = DatSan::where('ID_GiaiDau', $datSan->ID_GiaiDau)
                                         ->where('TrangThai', 'DaCoc')
                                         ->get();
                    $tongHoan = $danhSachDat->sum('TienCoc');

                    DatSan::where('ID_GiaiDau', $datSan->ID_GiaiDau)
                          ->where('TrangThai', 'DaCoc')
                          ->update(['TrangThai' => 'DaHuy']);
                    
                    GiaiDau::where('ID', $datSan->ID_GiaiDau)->update(['TrangThai' => 'DaHuy']);

                    if ($tongHoan > 0) {
                        $soDuSau = $user->SoDuVi + $tongHoan;
                        
                        GiaoDich::create([
                            'ID_NguoiDung' => $user->ID,
                            'LoaiGiaoDich' => 'HoanTienHuyGap',
                            'DongTien'     => 'Cong',
                            'SoTien'       => $tongHoan,
                            'SoDuTruoc'    => $user->SoDuVi,
                            'SoDuSau'      => $soDuSau,
                            'NoiDung'      => "Hoàn cọc hủy gấp toàn bộ Giải đấu (Admin phê duyệt)"
                        ]);
                        $user->update(['SoDuVi' => $soDuSau]);
                    }
                } else {
                    // XỬ LÝ PHONG TRÀO: Chỉ hủy 1 trận
                    $datSan->update(['TrangThai' => 'DaHuy']);
                    $tienHoan = $datSan->TienCoc;

                    $soDuSau = $user->SoDuVi + $tienHoan;

                    GiaoDich::create([
                        'ID_NguoiDung' => $user->ID,
                        'LoaiGiaoDich' => 'HoanTienHuyGap',
                        'DongTien'     => 'Cong',
                        'SoTien'       => $tienHoan,
                        'SoDuTruoc'    => $user->SoDuVi,
                        'SoDuSau'      => $soDuSau,
                        'NoiDung'      => "Hoàn cọc hủy gấp: Sân " . $datSan->sanBong->TenSan . " (Admin phê duyệt)"
                    ]);
                    $user->update(['SoDuVi' => $soDuSau]);
                }

                $tieuDeTB = "Yêu cầu hủy sân được phê duyệt";
                $noiDungTB = "Yêu cầu hủy sân gấp của bạn đã được Admin duyệt. Tiền cọc đã được cộng lại vào ví.";
            } else {
                // TRƯỜNG HỢP TỪ CHỐI
                $tieuDeTB = "Yêu cầu hủy sân bị từ chối";
                $noiDungTB = "Yêu cầu hủy sân gấp của bạn không được Admin chấp thuận. Lý do: " . $request->ly_do_huy . ". Lịch đặt vẫn được giữ nguyên.";
            }

            // Gửi thông báo cho Customer
            ThongBao::create([
                'ID_NguoiDung' => $user->ID,
                'TieuDe'       => $tieuDeTB,
                'NoiDung'      => $noiDungTB,
                'LoaiThongBao' => 'DatSan'
            ]);

            DB::commit();

            // Phát tín hiệu cho Customer cập nhật UI ngầm
            broadcast(new \App\Events\UserDataUpdated($user->ID))->toOthers();

            return response()->json(['success' => true, 'message' => 'Đã xử lý yêu cầu hủy sân!']);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => 'Lỗi hệ thống: ' . $e->getMessage()]);
        }
    }

    // =========================================================
    // 3. LẤY DANH SÁCH YÊU CẦU HỦY GẤP CỦA KHÁCH HÀNG
    // =========================================================
    public function layDanhSachCuaToi(Request $request)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()->ID);

        // Load kèm thông tin Sân, Cụm sân, Khung giờ và Giải đấu (nếu có) để Frontend dễ hiển thị
        $danhSach = YeuCauHuyGap::with(['datSan.sanBong.cumSan', 'datSan.khungGio', 'datSan.giaiDau'])
            ->where('ID_NguoiDung', $user->ID)
            ->orderBy('NgayTao', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $danhSach
        ]);
    }

    // =========================================================
    // 4. LẤY TẤT CẢ YÊU CẦU HỦY GẤP CHO ADMIN
    // =========================================================
    public function layDanhSachAdmin(Request $request)
    {
        // Admin cần biết thêm thông tin người gửi yêu cầu (nguoiDung)
        $danhSach = YeuCauHuyGap::with(['nguoiDung', 'datSan.sanBong.cumSan', 'datSan.khungGio', 'datSan.giaiDau'])
            ->orderBy('NgayTao', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $danhSach
        ]);
    }
}
