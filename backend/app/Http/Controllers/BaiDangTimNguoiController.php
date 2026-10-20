<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\BaiDangTimNguoi;
use App\Models\DatSan;
use App\Models\ThongBao;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class BaiDangTimNguoiController extends Controller
{
    // 1. LẤY DANH SÁCH BÀI ĐĂNG TRÊN SÀN CÁP KÈO
    public function danhSach(Request $request)
    {
        $now = Carbon::now('Asia/Ho_Chi_Minh');
        $todayStr = $now->toDateString();
        $currentTimeStr = $now->toTimeString();

        // Lấy các bài đăng đang tìm hoặc đã ghép của những vé chưa diễn ra
        $allPosts = BaiDangTimNguoi::with([
            'nguoiTao:ID,HoTen,SoDienThoai',
            'nguoiNhan:ID,HoTen,SoDienThoai',
            'datSan.sanBong.loaiSan',
            'datSan.sanBong.cumSan.phuong',
            'datSan.khungGio',
            'datSan.baiDangTimNguois' => function ($q) {
                $q->whereIn('TrangThai', ['DangTim', 'DaGhep'])
                  ->whereNotNull('ID_NguoiNhan')
                  ->with('nguoiNhan:ID,HoTen,SoDienThoai');
            }
        ])
        ->whereIn('TrangThai', ['DangTim', 'DaGhep'])
        ->whereHas('datSan', function ($q) use ($todayStr, $currentTimeStr) {
            $q->where('TrangThai', 'DaCoc')
              ->where(function ($sub) use ($todayStr, $currentTimeStr) {
                  $sub->where('NgayDa', '>', $todayStr)
                      ->orWhere(function ($todayQuery) use ($todayStr, $currentTimeStr) {
                          $todayQuery->where('NgayDa', '=', $todayStr)
                                     ->whereHas('khungGio', function ($kg) use ($currentTimeStr) {
                                         $kg->where('GioBatDau', '>', $currentTimeStr);
                                     });
                      });
              });
        })
        ->orderByRaw("CASE WHEN TrangThai = 'DangTim' THEN 0 ELSE 1 END")
        ->orderByDesc('ID')
        ->get();

        // Gom theo ID_DatSan để mỗi vé chỉ hiển thị 1 thẻ kèo chính duy nhất trên Sàn
        // (Các bản ghi con của Tuyển quân nhiều người sẽ được gom vào danh_sach_nguoi_nhan của thẻ chính)
        $groupedPosts = $allPosts->groupBy('ID_DatSan')->map(function ($group) {
            // Ưu tiên lấy dòng đang 'DangTim', nếu đã đủ người hết thì lấy dòng mới nhất
            $mainPost = $group->firstWhere('TrangThai', 'DangTim') ?? $group->first();
            $danhSachNguoiNhan = $group->whereNotNull('ID_NguoiNhan')->values()->map(function ($item) {
                return [
                    'ID_BaiDang'  => $item->ID,
                    'ID_NguoiNhan'=> $item->ID_NguoiNhan,
                    'TenHienThi'  => $item->TenDoiKhach ?: ($item->nguoiNhan->HoTen ?? 'Người chơi'),
                    'SDT'         => $item->SDTKhach ?: ($item->nguoiNhan->SoDienThoai ?? '')
                ];
            });
            $mainPost->setAttribute('danh_sach_nguoi_nhan', $danhSachNguoiNhan);
            return $mainPost;
        })->values();

        return response()->json([
            'success' => true,
            'data'    => $groupedPosts
        ]);
    }

    // 2. ĐĂNG BÀI TÌM ĐỐI / TUYỂN QUÂN TỪ VÉ ĐÃ ĐẶT
    public function taoBaiDang(Request $request)
    {
        $user = $request->user();

        $request->validate([
            'id_dat_san'      => 'required|integer',
            'ten_doi_chu_nha' => 'nullable|string|max:150',
            'loai_keo'        => 'required|in:TimDoi,TuyenQuan',
            'trinh_do'        => 'required|string|max:100',
            'chia_tien_san'   => 'required|string|max:100',
            'so_luong_can'    => 'nullable|integer|min:1|max:20',
            'ghi_chu'         => 'nullable|string|max:500',
        ]);

        $datSan = DatSan::with(['sanBong.cumSan', 'khungGio'])->find($request->id_dat_san);

        if (!$datSan || $datSan->ID_NguoiDung !== $user->ID) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy vé đặt sân hợp lệ của bạn!'], 403);
        }

        if ($datSan->TrangThai !== 'DaCoc' || $datSan->ID_GiaiDau !== null) {
            return response()->json(['success' => false, 'message' => 'Chỉ có thể đăng ghép kèo cho vé đá phong trào đang ở trạng thái Đã cọc!'], 400);
        }

        // Kiểm tra trận đấu đã qua giờ chưa
        $gioBatDau = $datSan->khungGio ? $datSan->khungGio->GioBatDau : '00:00:00';
        $matchTime = Carbon::parse($datSan->NgayDa . ' ' . $gioBatDau, 'Asia/Ho_Chi_Minh');
        if ($matchTime->lte(Carbon::now('Asia/Ho_Chi_Minh'))) {
            return response()->json(['success' => false, 'message' => 'Trận đấu này đã diễn ra hoặc quá giờ, không thể đăng tìm đối!'], 400);
        }

        // Kiểm tra xem vé này đã có bài đăng nào đang hoạt động chưa
        $existing = BaiDangTimNguoi::where('ID_DatSan', $datSan->ID)
            ->whereIn('TrangThai', ['DangTim', 'DaGhep'])
            ->first();

        if ($existing) {
            return response()->json(['success' => false, 'message' => 'Vé đặt sân này đang có bài đăng ghép kèo hoạt động!'], 400);
        }

        // Nếu người tạo để trống Tên đội chủ nhà -> Lấy tên của chủ kèo ($user->HoTen)
        $tenDoiChuNha = trim($request->ten_doi_chu_nha ?? '');
        if ($tenDoiChuNha === '') {
            $tenDoiChuNha = $user->HoTen;
        }

        $post = BaiDangTimNguoi::create([
            'ID_DatSan'    => $datSan->ID,
            'ID_NguoiTao'  => $user->ID,
            'TenDoiChuNha' => $tenDoiChuNha,
            'LoaiKeo'      => $request->loai_keo,
            'TrinhDo'      => $request->trinh_do,
            'ChiaTienSan'  => $request->chia_tien_san,
            'SoLuongCan'   => $request->loai_keo === 'TuyenQuan' ? (int)($request->so_luong_can ?? 1) : 1,
            'GhiChu'       => $request->ghi_chu,
            'TrangThai'    => 'DangTim',
            'NgayTao'      => Carbon::now('Asia/Ho_Chi_Minh')
        ]);

        try {
            broadcast(new \App\Events\SystemDataUpdated());
        } catch (\Exception $e) {}

        return response()->json([
            'success' => true,
            'message' => 'Đã đăng bài lên Sàn Cáp Kèo thành công!',
            'data'    => $post
        ]);
    }

    // 3. NHẬN KÈO / ĐĂNG KÝ THAM GIA
    public function nhanKeo(Request $request, $id)
    {
        $user = $request->user();

        $request->validate([
            'ten_doi_khach' => 'nullable|string|max:150',
            'sdt_khach'     => ['required', 'regex:/^0[0-9]{9}$/'],
        ], [
            'sdt_khach.regex' => 'Số điện thoại liên hệ phải gồm 10 chữ số và bắt đầu bằng số 0!'
        ]);

        return DB::transaction(function () use ($request, $user, $id) {
            $post = BaiDangTimNguoi::with(['datSan.sanBong.cumSan', 'datSan.khungGio', 'nguoiTao'])
                ->lockForUpdate()
                ->find($id);

            if (!$post || $post->TrangThai !== 'DangTim') {
                return response()->json(['success' => false, 'message' => 'Rất tiếc! Kèo này đã đủ người hoặc vừa bị hủy.'], 400);
            }

            if ((int)$post->ID_NguoiTao === (int)$user->ID) {
                return response()->json(['success' => false, 'message' => 'Bạn không thể tự nhận kèo do chính mình đăng!'], 400);
            }

            // Kiểm tra xem người dùng này đã nhận kèo của chính trận đặt sân này trước đó chưa
            $daThamGia = BaiDangTimNguoi::where('ID_DatSan', $post->ID_DatSan)
                ->where('ID_NguoiNhan', $user->ID)
                ->whereIn('TrangThai', ['DangTim', 'DaGhep'])
                ->exists();

            if ($daThamGia) {
                return response()->json(['success' => false, 'message' => 'Bạn đã đăng ký nhận kèo/tham gia trận đấu này rồi!'], 400);
            }

            // Nếu người nhận để trống tên đội khách -> Lấy họ tên của người nhận ($user->HoTen)
            $tenNguoiNhanHienThi = trim($request->ten_doi_khach ?? '');
            if ($tenNguoiNhanHienThi === '') {
                $tenNguoiNhanHienThi = $user->HoTen;
            }

            // Nếu chủ kèo để trống TenDoiChuNha -> Lấy họ tên của người tạo kèo
            $tenChuKeoHienThi = trim($post->TenDoiChuNha ?? '');
            if ($tenChuKeoHienThi === '') {
                $tenChuKeoHienThi = $post->nguoiTao->HoTen ?? 'Chủ sân';
            }

            $loaiKeoText = $post->LoaiKeo === 'TimDoi' ? 'Tìm đối giao hữu' : 'Tuyển quân';

            // XỬ LÝ LƯU DATABASE KHI TUYỂN QUÂN NHIỀU NGƯỜI (SoLuongCan > 1)
            if ($post->LoaiKeo === 'TuyenQuan' && (int)$post->SoLuongCan > 1) {
                // Giảm số lượng cần ở bài đăng gốc đi 1 (vẫn giữ TrangThai = 'DangTim' cho người tiếp theo)
                $post->SoLuongCan = (int)$post->SoLuongCan - 1;
                $post->save();

                // Tạo 1 bản ghi lưu thông tin người vừa tham gia
                BaiDangTimNguoi::create([
                    'ID_DatSan'    => $post->ID_DatSan,
                    'ID_NguoiTao'  => $post->ID_NguoiTao,
                    'TenDoiChuNha' => $post->TenDoiChuNha,
                    'LoaiKeo'      => $post->LoaiKeo,
                    'TrinhDo'      => $post->TrinhDo,
                    'ChiaTienSan'  => $post->ChiaTienSan,
                    'SoLuongCan'   => 0,
                    'GhiChu'       => $post->GhiChu,
                    'ID_NguoiNhan' => $user->ID,
                    'TenDoiKhach'  => $tenNguoiNhanHienThi,
                    'SDTKhach'     => $request->sdt_khach,
                    'TrangThai'    => 'DaGhep',
                    'NgayTao'      => Carbon::now('Asia/Ho_Chi_Minh')
                ]);
            } else {
                // Nếu chỉ cần 1 đối (TimDoi) hoặc đây là người cuối cùng của TuyenQuan (SoLuongCan == 1)
                $post->SoLuongCan   = 0;
                $post->ID_NguoiNhan = $user->ID;
                $post->TenDoiKhach  = $tenNguoiNhanHienThi;
                $post->SDTKhach     = $request->sdt_khach;
                $post->TrangThai    = 'DaGhep';
                $post->save();
            }

            $tenSan = $post->datSan->sanBong->TenSan ?? 'Sân bóng';
            $tenCum = $post->datSan->sanBong->cumSan->TenCumSan ?? '';
            $khungGio = $post->datSan->khungGio
                ? substr($post->datSan->khungGio->GioBatDau, 0, 5) . ' - ' . substr($post->datSan->khungGio->GioKetThuc, 0, 5)
                : '';
            $ngayDa = Carbon::parse($post->datSan->NgayDa)->format('d/m/Y');

            // Thông báo cho Chủ Sân (Người tạo kèo)
            $conLaiText = ($post->LoaiKeo === 'TuyenQuan' && $post->TrangThai === 'DangTim')
                ? " (Còn cần thêm {$post->SoLuongCan} người nữa)."
                : " (Đã chốt đủ người).";

            ThongBao::create([
                'ID_NguoiDung' => $post->ID_NguoiTao,
                'TieuDe'       => '⚡ Có người nhận kèo thành công!',
                'NoiDung'      => "Kèo {$loaiKeoText} tại {$tenSan} ({$tenCum}) lúc {$khungGio} ngày {$ngayDa} đã được nhận bởi \"{$tenNguoiNhanHienThi}\" (SĐT: {$request->sdt_khach}){$conLaiText}",
                'LoaiThongBao' => 'DatSan',
                'DaDoc'        => 0,
                'NgayTao'      => Carbon::now('Asia/Ho_Chi_Minh')
            ]);

            // Thông báo cho Người Nhận Kèo
            $sdtChuNha = $post->nguoiTao->SoDienThoai ?? '';
            ThongBao::create([
                'ID_NguoiDung' => $user->ID,
                'TieuDe'       => '🤝 Nhận kèo thành công!',
                'NoiDung'      => "Bạn đã chốt kèo {$loaiKeoText} với \"{$tenChuKeoHienThi}\" tại {$tenSan} ({$tenCum}) lúc {$khungGio} ngày {$ngayDa}. SĐT chủ sân: {$sdtChuNha}.",
                'LoaiThongBao' => 'DatSan',
                'DaDoc'        => 0,
                'NgayTao'      => Carbon::now('Asia/Ho_Chi_Minh')
            ]);

            try {
                broadcast(new \App\Events\UserDataUpdated($post->ID_NguoiTao));
                broadcast(new \App\Events\UserDataUpdated($user->ID));
                broadcast(new \App\Events\SystemDataUpdated());
            } catch (\Exception $e) {}

            return response()->json([
                'success' => true,
                'message' => "Nhận kèo thành công! Hãy liên hệ chủ sân ({$tenChuKeoHienThi}) qua SĐT: {$sdtChuNha}",
                'data'    => $post
            ]);
        });
    }

    // 4. HỦY BÀI ĐĂNG CÁP KÈO (DÀNH CHO CHỦ KÈO) HOẶC HỦY NHẬN KÈO (DÀNH CHO NGƯỜI NHẬN)
    public function huyBaiDang(Request $request, $id)
    {
        $user = $request->user();
        $post = BaiDangTimNguoi::with(['datSan.sanBong.cumSan', 'datSan.khungGio', 'nguoiTao'])->find($id);

        if (!$post) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy bài đăng!'], 404);
        }

        $tenSan = $post->datSan->sanBong->TenSan ?? 'Sân bóng';
        $tenCum = $post->datSan->sanBong->cumSan->TenCumSan ?? '';
        $gioBatDau = $post->datSan->khungGio ? $post->datSan->khungGio->GioBatDau : '00:00:00';
        $khungGio = $post->datSan->khungGio
            ? substr($post->datSan->khungGio->GioBatDau, 0, 5) . ' - ' . substr($post->datSan->khungGio->GioKetThuc, 0, 5)
            : '';
        $ngayDa = Carbon::parse($post->datSan->NgayDa)->format('d/m/Y');

        // Tính số phút còn lại trước giờ bóng lăn (3 tiếng = 180 phút)
        $now = Carbon::now('Asia/Ho_Chi_Minh');
        $matchTime = Carbon::parse($post->datSan->NgayDa . ' ' . $gioBatDau, 'Asia/Ho_Chi_Minh');
        $minutesLeft = $now->diffInMinutes($matchTime, false);

        // TRƯỜNG HỢP 1: CHỦ KÈO GỠ TOÀN BỘ BÀI ĐĂNG CỦA VÉ NÀY
        if ((int)$post->ID_NguoiTao === (int)$user->ID) {
            $cacBaiDangCungVe = BaiDangTimNguoi::where('ID_DatSan', $post->ID_DatSan)
                ->whereIn('TrangThai', ['DangTim', 'DaGhep'])
                ->get();

            // Lấy danh sách ID tất cả những người đã nhận kèo của vé này (không trùng lặp)
            $danhSachIdNguoiNhan = $cacBaiDangCungVe->pluck('ID_NguoiNhan')->filter()->unique();

            // Nếu ĐÃ có người nhận kèo và trận đấu còn dưới 3 tiếng (180 phút) -> Chặn hủy kèo tự do
            if ($danhSachIdNguoiNhan->isNotEmpty() && $minutesLeft < 180) {
                return response()->json([
                    'success' => false,
                    'message' => 'Kèo đã có người nhận và chỉ còn dưới 3 tiếng trước giờ bóng lăn! Bạn không thể tự ý hủy kèo lúc này, vui lòng liên hệ trực tiếp SĐT người tham gia.'
                ], 400);
            }

            // Chuyển toàn bộ các bản ghi của vé này sang DaHuy
            BaiDangTimNguoi::where('ID_DatSan', $post->ID_DatSan)
                ->whereIn('TrangThai', ['DangTim', 'DaGhep'])
                ->update(['TrangThai' => 'DaHuy']);

            $tenChuKeo = trim($post->TenDoiChuNha ?? '') ?: ($post->nguoiTao->HoTen ?? 'Chủ sân');

            foreach ($danhSachIdNguoiNhan as $idNguoiNhan) {
                ThongBao::create([
                    'ID_NguoiDung' => $idNguoiNhan,
                    'TieuDe'       => 'Thông báo hủy kèo giao hữu',
                    'NoiDung'      => "Chủ sân \"{$tenChuKeo}\" đã đóng/hủy kèo tại {$tenSan} ({$tenCum}) lúc {$khungGio} ngày {$ngayDa}.",
                    'LoaiThongBao' => 'DatSan',
                    'DaDoc'        => 0,
                    'NgayTao'      => Carbon::now('Asia/Ho_Chi_Minh')
                ]);
                try {
                    broadcast(new \App\Events\UserDataUpdated($idNguoiNhan));
                } catch (\Exception $e) {}
            }

            try {
                broadcast(new \App\Events\SystemDataUpdated());
            } catch (\Exception $e) {}

            return response()->json([
                'success' => true,
                'message' => 'Đã gỡ bài đăng ghép kèo thành công!'
            ]);
        }

        // TRƯỜNG HỢP 2: NGƯỜI NHẬN KÈO XIN RÚT LUI (HỦY NHẬN KÈO)
        $banGhiNhanKeo = BaiDangTimNguoi::where('ID_DatSan', $post->ID_DatSan)
            ->where('ID_NguoiNhan', $user->ID)
            ->whereIn('TrangThai', ['DangTim', 'DaGhep'])
            ->first();

        if ($banGhiNhanKeo) {
            // Kiểm tra điều kiện phải hủy trước giờ bóng lăn tối thiểu 3 tiếng (180 phút)
            if ($minutesLeft < 180) {
                $sdtChu = $post->nguoiTao->SoDienThoai ?? '';
                return response()->json([
                    'success' => false,
                    'message' => "Chỉ được phép rút khỏi kèo trước giờ bóng lăn tối thiểu 3 tiếng! Vui lòng liên hệ trực tiếp chủ sân qua SĐT: {$sdtChu}."
                ], 400);
            }

            $tenNguoiRut = $banGhiNhanKeo->TenDoiKhach ?: $user->HoTen;

            // Kiểm tra xem có bài đăng gốc đang mở ('DangTim') không
            $mainOpenPost = BaiDangTimNguoi::where('ID_DatSan', $post->ID_DatSan)
                ->where('TrangThai', 'DangTim')
                ->where('ID', '!=', $banGhiNhanKeo->ID)
                ->first();

            if ($mainOpenPost) {
                // Nếu bài đăng chính vẫn đang mở -> Cộng trả lại 1 slot vào bài đăng chính và hủy bản ghi con
                $mainOpenPost->SoLuongCan = (int)$mainOpenPost->SoLuongCan + 1;
                $mainOpenPost->save();
                $banGhiNhanKeo->TrangThai = 'DaHuy';
                $banGhiNhanKeo->save();
            } else {
                // Nếu bài đăng này chính là bài đăng gốc đã chuyển sang DaGhep -> Mở lại thành DangTim
                $banGhiNhanKeo->ID_NguoiNhan = null;
                $banGhiNhanKeo->TenDoiKhach  = null;
                $banGhiNhanKeo->SDTKhach     = null;
                $banGhiNhanKeo->SoLuongCan   = 1;
                $banGhiNhanKeo->TrangThai    = 'DangTim';
                $banGhiNhanKeo->save();
            }

            ThongBao::create([
                'ID_NguoiDung' => $post->ID_NguoiTao,
                'TieuDe'       => '⚠️ Đối tác vừa hủy nhận kèo',
                'NoiDung'      => "\"{$tenNguoiRut}\" vừa rút khỏi kèo tại {$tenSan} ({$tenCum}) lúc {$khungGio} ngày {$ngayDa}. Hệ thống đã tự động mở lại kèo trên Sàn cho bạn!",
                'LoaiThongBao' => 'DatSan',
                'DaDoc'        => 0,
                'NgayTao'      => Carbon::now('Asia/Ho_Chi_Minh')
            ]);

            try {
                broadcast(new \App\Events\UserDataUpdated($post->ID_NguoiTao));
                broadcast(new \App\Events\SystemDataUpdated());
            } catch (\Exception $e) {}

            return response()->json([
                'success' => true,
                'message' => 'Bạn đã hủy nhận kèo thành công!'
            ]);
        }

        return response()->json(['success' => false, 'message' => 'Bạn không có quyền thực hiện thao tác này!'], 403);
    }
}