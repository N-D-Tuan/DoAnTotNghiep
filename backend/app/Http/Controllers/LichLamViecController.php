<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\LichLamViec;
use App\Models\CaLamViec;
use App\Models\ThongBao;
use Carbon\Carbon;

class LichLamViecController extends Controller
{
    // 1. API GET dùng chung để lấy dữ liệu vẽ lưới Calendar
    public function layLichLamViec(Request $request)
    {
        $idCumSan = $request->user()->ID_CumSan;
        
        // Lấy từ ngày đến ngày (Frontend truyền lên, ví dụ: 1 tuần)
        $tuNgay = $request->query('tu_ngay', Carbon::now()->startOfWeek()->toDateString());
        $denNgay = $request->query('den_ngay', Carbon::now()->endOfWeek()->toDateString());

        $lichLamViec = LichLamViec::with(['nhanVien:ID,HoTen,VaiTro', 'caLamViec'])
            ->whereHas('caLamViec', function($q) use ($idCumSan) {
                $q->where('ID_CumSan', $idCumSan);
            })
            ->whereBetween('NgayLam', [$tuNgay, $denNgay])
            ->get();

        return response()->json(['success' => true, 'data' => $lichLamViec]);
    }

    // 2. NHÂN VIÊN ĐĂNG KÝ CA (Mặc định TrangThaiXepLich = 'DangKy')
    public function nhanVienDangKyCa(Request $request)
    {
        $user = $request->user();
        
        $request->validate([
            'id_ca_lam_viec' => 'required|exists:CaLamViec,ID',
            'ngay_lam' => 'required|date',
            'ghi_chu' => 'nullable|string|max:255'
        ]);

        // Kiểm tra xem nhân viên này đã đăng ký ca này vào ngày này chưa
        $lich = LichLamViec::where('ID_NhanVien', $user->ID)
                           ->where('ID_CaLamViec', $request->id_ca_lam_viec)
                           ->where('NgayLam', $request->ngay_lam)
                           ->first();

        if ($lich) {
            // NẾU ĐÃ TỒN TẠI (Đang chờ duyệt hoặc Đã duyệt) -> Chỉ Cập nhật ghi chú
            $lich->GhiChu = $request->ghi_chu;
            $lich->save();
        } else {
            // NẾU CHƯA TỒN TẠI -> Khởi tạo lịch làm việc mới
            $lich = LichLamViec::create([
                'ID_CaLamViec' => $request->id_ca_lam_viec,
                'ID_NhanVien' => $user->ID,
                'NgayLam' => $request->ngay_lam,
                'CongViec' => null,
                'GhiChu'            => $request->ghi_chu,
                'TrangThaiXepLich' => 'DangKy',
                'TrangThaiDiemDanh' => 'ChuaLam'
            ]);
        }

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Đăng ký ca thành công! Vui lòng chờ duyệt.', 'data' => $lich]);
    }

    // 3. QUẢN LÝ DUYỆT HOẶC TỪ CHỐI ĐƠN ĐĂNG KÝ
    public function quanLyDuyetCa(Request $request, $id)
    {
        $request->validate([
            'trang_thai' => 'required|in:DaDuyet,TuChoi',
            'cong_viec' => 'required_if:trang_thai,DaDuyet|in:ThuNgan,PhucVu'
        ]);

        $lich = LichLamViec::find($id);
        if (!$lich || $lich->TrangThaiXepLich !== 'DangKy') {
            return response()->json(['success' => false, 'message' => 'Lịch không tồn tại hoặc không ở trạng thái chờ duyệt!']);
        }

        $lich->TrangThaiXepLich = $request->trang_thai;
        if ($request->trang_thai === 'DaDuyet') {
            $lich->CongViec = $request->cong_viec;
        }
        $lich->save();

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Đã ' . ($request->trang_thai == 'DaDuyet' ? 'duyệt' : 'từ chối') . ' ca làm việc!']);
    }

    // 4. QUẢN LÝ TRỰC TIẾP XẾP CA
    public function quanLyTrucTiepXepCa(Request $request)
    {
        $request->validate([
            'id_ca_lam_viec' => 'required|exists:CaLamViec,ID',
            'ngay_lam' => 'required|date',
            'id_nhan_vien' => 'required|exists:NguoiDung,ID',
            'cong_viec' => 'required|in:ThuNgan,PhucVu',
            'thong_bao_thay_doi' => 'nullable|boolean'
        ]);

        $lich = LichLamViec::updateOrCreate(
            [
                'ID_CaLamViec' => $request->id_ca_lam_viec,
                'ID_NhanVien' => $request->id_nhan_vien,
                'NgayLam' => $request->ngay_lam
            ],
            [
                'CongViec' => $request->cong_viec,
                'TrangThaiXepLich' => 'DaDuyet',
                'TrangThaiDiemDanh' => 'ChuaLam'
            ]
        );

        // Phát thông báo nếu là hành động "Chỉnh sửa đột xuất" và người bị thay/được thay không phải là Quản lý
        if ($request->thong_bao_thay_doi) {
            $quanLyId = $request->user()->ID;
            if ($request->id_nhan_vien != $quanLyId) {
                ThongBao::create([
                    'ID_NguoiDung' => $request->id_nhan_vien,
                    'TieuDe' => 'Cập nhật lịch làm việc đột xuất',
                    'NoiDung' => 'Quản lý vừa xếp bạn vào ca ' . $request->cong_viec . ' ngày ' . $request->ngay_lam,
                    'LoaiThongBao' => 'HeThong'
                ]);
                broadcast(new \App\Events\UserDataUpdated($request->id_nhan_vien))->toOthers();
            }
        }

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => 'Đã xếp nhân viên vào lịch thành công!', 'data' => $lich]);
    }

    // 5. CHỐT LỊCH TUẦN SAU (GỬI THÔNG BÁO CHO NHÂN VIÊN)
    public function chotLichTuan(Request $request)
    {
        $request->validate([
            'tu_ngay' => 'required|date',
            'den_ngay' => 'required|date'
        ]);

        $idCumSan = $request->user()->ID_CumSan;

        // Lấy danh sách ID nhân viên đã được duyệt trong tuần đó
        $nhanVienIds = LichLamViec::whereHas('caLamViec', function($q) use ($idCumSan) {
                $q->where('ID_CumSan', $idCumSan);
            })
            ->whereBetween('NgayLam', [$request->tu_ngay, $request->den_ngay])
            ->where('TrangThaiXepLich', 'DaDuyet')
            ->pluck('ID_NhanVien')
            ->unique();

        $count = 0;
        foreach ($nhanVienIds as $nvId) {
            if ($nvId != $request->user()->ID) { // Không tự thông báo cho quản lý
                ThongBao::create([
                    'ID_NguoiDung' => $nvId,
                    'TieuDe' => 'Lịch làm việc tuần mới đã chốt',
                    'NoiDung' => 'Quản lý đã chốt lịch tuần từ ' . date('d/m', strtotime($request->tu_ngay)) . '. Vui lòng kiểm tra ca làm của bạn!',
                    'LoaiThongBao' => 'HeThong'
                ]);
                broadcast(new \App\Events\UserDataUpdated($nvId))->toOthers();
                $count++;
            }
        }

        // Tùy chọn: Từ chối tất cả các đơn 'DangKy' còn sót lại trong tuần đó
        LichLamViec::whereHas('caLamViec', function($q) use ($idCumSan) {
            $q->where('ID_CumSan', $idCumSan);
        })
        ->whereBetween('NgayLam', [$request->tu_ngay, $request->den_ngay])
        ->where('TrangThaiXepLich', 'DangKy')
        ->update(['TrangThaiXepLich' => 'TuChoi']);

        broadcast(new \App\Events\SystemDataUpdated())->toOthers();

        return response()->json(['success' => true, 'message' => "Đã chốt lịch và thông báo cho $count nhân viên."]);
    }

    // 6. NHÂN VIÊN HỦY ĐĂNG KÝ CA (Chỉ hủy được khi đang chờ duyệt)
    public function nhanVienHuyDangKyCa(Request $request)
    {
        $user = $request->user();
        
        $request->validate([
            'id_ca_lam_viec' => 'required|exists:CaLamViec,ID',
            'ngay_lam' => 'required|date'
        ]);

        // Tìm ca đúng của nhân viên này và phải đang ở trạng thái 'DangKy'
        $lich = LichLamViec::where('ID_NhanVien', $user->ID)
                           ->where('ID_CaLamViec', $request->id_ca_lam_viec)
                           ->where('NgayLam', $request->ngay_lam)
                           ->where('TrangThaiXepLich', 'DangKy')
                           ->first();

        if ($lich) {
            $lich->delete(); // Xóa khỏi DB
            broadcast(new \App\Events\SystemDataUpdated())->toOthers();
            return response()->json(['success' => true, 'message' => 'Đã hủy đăng ký ca làm việc!']);
        }

        return response()->json(['success' => false, 'message' => 'Không tìm thấy ca chờ duyệt để hủy!']);
    }
}