<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\DanhGia;
use App\Models\DatSan;
use App\Models\CumSan;

class DanhGiaController extends Controller
{
    // 1. Lấy danh sách đánh giá & điểm trung bình của 1 Cụm sân (hoặc tất cả cụm sân)
    public function layDanhSachTheoCumSan(Request $request)
    {
        $idCumSan = $request->query('id_cum_san');

        // Nếu truyền id_cum_san -> Trả về chi tiết đánh giá của cụm sân đó
        if ($idCumSan) {
            $danhSach = DanhGia::with([
                    'nguoiDung:ID,HoTen',
                    'datSan.sanBong:ID,TenSan',
                    'datSan.khungGio:ID,GioBatDau,GioKetThuc',
                    'datSan.giaiDau:ID,TenGiaiDau'
                ])
                ->where('ID_CumSan', $idCumSan)
                ->orderBy('NgayTao', 'desc')
                ->get();

            $tongSo = $danhSach->count();
            $trungBinh = $tongSo > 0 ? round($danhSach->avg('SoSao'), 1) : 0;

            // Thống kê số lượng theo từng mức sao (1 -> 5)
            $phanBoSao = [
                5 => $danhSach->where('SoSao', 5)->count(),
                4 => $danhSach->where('SoSao', 4)->count(),
                3 => $danhSach->where('SoSao', 3)->count(),
                2 => $danhSach->where('SoSao', 2)->count(),
                1 => $danhSach->where('SoSao', 1)->count(),
            ];

            return response()->json([
                'success'     => true,
                'trung_binh'  => $trungBinh,
                'tong_so'     => $tongSo,
                'phan_bo_sao' => $phanBoSao,
                'data'        => $danhSach
            ]);
        }

        // Nếu không truyền id_cum_san -> Trả về bảng tổng hợp số sao trung bình của tất cả các cụm sân
        $thongKeCumSan = DanhGia::selectRaw('ID_CumSan, COUNT(*) as tong_danh_gia, ROUND(AVG(SoSao), 1) as trung_binh_sao')
            ->groupBy('ID_CumSan')
            ->get()
            ->keyBy('ID_CumSan');

        return response()->json([
            'success' => true,
            'data'    => $thongKeCumSan
        ]);
    }

    // 2. Khách hàng gửi đánh giá cho đơn đặt sân / giải đấu đã Hoàn thành (Chỉ 1 lần duy nhất)
    public function taoDanhGia(Request $request)
    {
        $user = $request->user();

        $request->validate([
            'id_dat_san' => 'required|integer',
            'so_sao'     => 'required|integer|min:1|max:5',
            'noi_dung'   => 'nullable|string|max:1000'
        ], [
            'so_sao.required' => 'Vui lòng chọn số sao đánh giá!',
            'so_sao.min'      => 'Số sao tối thiểu là 1 sao!',
            'so_sao.max'      => 'Số sao tối đa là 5 sao!',
            'noi_dung.max'    => 'Nội dung đánh giá không vượt quá 1000 ký tự!'
        ]);

        // Tìm lịch đặt sân của chính khách hàng này
        $datSan = DatSan::with(['sanBong', 'giaiDau'])
                        ->where('ID', $request->id_dat_san)
                        ->where('ID_NguoiDung', $user->ID)
                        ->first();

        if (!$datSan) {
            return response()->json([
                'success' => false,
                'message' => 'Không tìm thấy lịch đặt sân hợp lệ!'
            ], 404);
        }

        // TRƯỜNG HỢP 1: ĐƠN THUỘC GIẢI ĐẤU -> CẢ GIẢI ĐẤU CHỈ ĐƯỢC ĐÁNH GIÁ 1 LẦN DUY NHẤT
        if (!empty($datSan->ID_GiaiDau)) {
            $idGiaiDau = $datSan->ID_GiaiDau;

            // Lấy tất cả các trận thuộc giải đấu này
            $cacTranTrongGiai = DatSan::where('ID_GiaiDau', $idGiaiDau)
                                      ->where('ID_NguoiDung', $user->ID)
                                      ->get();

            // Kiểm tra giải đấu đã hoàn thành chưa (giaiDau->TrangThai === 'HoanThanh' hoặc tất cả các trận đã chốt xong và có trận HoanThanh)
            $trangThaiGiai = $datSan->giaiDau ? $datSan->giaiDau->TrangThai : '';
            $conTranChuaChot = $cacTranTrongGiai->contains('TrangThai', 'DaCoc');
            $coTranHoanThanh = $cacTranTrongGiai->contains('TrangThai', 'HoanThanh');

            if ($trangThaiGiai !== 'HoanThanh' && ($conTranChuaChot || !$coTranHoanThanh)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Bạn chỉ có thể đánh giá sau khi giải đấu đã hoàn thành!'
                ], 400);
            }

            // Kiểm tra xem bất kỳ trận nào trong giải đấu này đã có đánh giá chưa
            $idsDatSanTrongGiai = $cacTranTrongGiai->pluck('ID');
            $daDanhGiaGiai = DanhGia::whereIn('ID_DatSan', $idsDatSanTrongGiai)->exists();

            if ($daDanhGiaGiai) {
                return response()->json([
                    'success' => false,
                    'message' => 'Giải đấu này đã được bạn đánh giá trước đó (mỗi giải đấu chỉ đánh giá 1 lần)!'
                ], 400);
            }
        } 
        // TRƯỜNG HỢP 2: ĐÁ PHONG TRÀO (LẺ)
        else {
            if ($datSan->TrangThai !== 'HoanThanh') {
                return response()->json([
                    'success' => false,
                    'message' => 'Bạn chỉ có thể đánh giá sau khi trận đấu đã hoàn thành!'
                ], 400);
            }

            $daDanhGia = DanhGia::where('ID_DatSan', $datSan->ID)->exists();
            if ($daDanhGia) {
                return response()->json([
                    'success' => false,
                    'message' => 'Lịch đặt sân này đã được bạn đánh giá trước đó (mỗi trận chỉ đánh giá 1 lần)!'
                ], 400);
            }
        }

        $idCumSan = $datSan->sanBong ? $datSan->sanBong->ID_CumSan : null;
        if (!$idCumSan) {
            return response()->json([
                'success' => false,
                'message' => 'Không xác định được cụm sân của lịch đặt này!'
            ], 400);
        }

        $danhGia = DanhGia::create([
            'ID_DatSan'    => $datSan->ID,
            'ID_CumSan'    => $idCumSan,
            'ID_NguoiDung' => $user->ID,
            'SoSao'        => $request->so_sao,
            'NoiDung'      => $request->noi_dung ? trim($request->noi_dung) : null
        ]);

        try {
            broadcast(new \App\Events\SystemDataUpdated());
        } catch (\Exception $e) {}

        return response()->json([
            'success' => true,
            'message' => 'Cảm ơn bạn đã gửi đánh giá cho cụm sân!',
            'data'    => $danhGia
        ]);
    }
}