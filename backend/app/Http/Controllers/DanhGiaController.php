<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\DanhGia;
use App\Models\DatSan;
use App\Models\CumSan;

class DanhGiaController extends Controller
{
    public function layDanhSachTheoCumSan(Request $request)
    {
        $maCumSan = $request->query('ma_cum_san', $request->query('id_cum_san'));

        if ($maCumSan) {
            $danhSach = DanhGia::with([
                    'nguoiDung:MaNguoiDung,HoTen',
                    'datSan.sanBong:MaSanBong,TenSan',
                    'datSan.khungGio:MaKhungGio,GioBatDau,GioKetThuc',
                    'datSan.giaiDau:MaGiaiDau,TenGiaiDau'
                ])
                ->where('MaCumSan', $maCumSan)
                ->orderBy('NgayTao', 'desc')
                ->get();

            $tongSo = $danhSach->count();
            $trungBinh = $tongSo > 0 ? round($danhSach->avg('SoSao'), 1) : 0;

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

        $thongKeCumSan = DanhGia::selectRaw('MaCumSan, COUNT(*) as tong_danh_gia, ROUND(AVG(SoSao), 1) as trung_binh_sao')
            ->groupBy('MaCumSan')
            ->get()
            ->keyBy('MaCumSan');

        return response()->json([
            'success' => true,
            'data'    => $thongKeCumSan
        ]);
    }

    public function taoDanhGia(Request $request)
    {
        $user = $request->user();
        $maDatSan = $request->input('ma_dat_san', $request->input('id_dat_san'));
        $request->merge(['ma_dat_san_check' => $maDatSan]);

        $request->validate([
            'ma_dat_san_check' => 'required|string',
            'so_sao'           => 'required|integer|min:1|max:5',
            'noi_dung'         => 'nullable|string|max:1000'
        ], [
            'so_sao.required' => 'Vui lòng chọn số sao đánh giá!',
            'so_sao.min'      => 'Số sao tối thiểu là 1 sao!',
            'so_sao.max'      => 'Số sao tối đa là 5 sao!',
            'noi_dung.max'    => 'Nội dung đánh giá không vượt quá 1000 ký tự!'
        ]);

        $datSan = DatSan::with(['sanBong', 'giaiDau'])
                        ->where('MaDatSan', $maDatSan)
                        ->where('MaNguoiDung', $user->MaNguoiDung)
                        ->first();

        if (!$datSan) {
            return response()->json([
                'success' => false,
                'message' => 'Không tìm thấy lịch đặt sân hợp lệ!'
            ], 404);
        }

        if (!empty($datSan->MaGiaiDau)) {
            $maGiaiDau = $datSan->MaGiaiDau;

            $cacTranTrongGiai = DatSan::where('MaGiaiDau', $maGiaiDau)
                                      ->where('MaNguoiDung', $user->MaNguoiDung)
                                      ->get();

            $trangThaiGiai = $datSan->giaiDau ? $datSan->giaiDau->TrangThai : '';
            $conTranChuaChot = $cacTranTrongGiai->contains('TrangThai', 'DaCoc');
            $coTranHoanThanh = $cacTranTrongGiai->contains('TrangThai', 'HoanThanh');

            if ($trangThaiGiai !== 'HoanThanh' && ($conTranChuaChot || !$coTranHoanThanh)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Bạn chỉ có thể đánh giá sau khi giải đấu đã hoàn thành!'
                ], 400);
            }

            $idsDatSanTrongGiai = $cacTranTrongGiai->pluck('MaDatSan');
            $daDanhGiaGiai = DanhGia::whereIn('MaDatSan', $idsDatSanTrongGiai)->exists();

            if ($daDanhGiaGiai) {
                return response()->json([
                    'success' => false,
                    'message' => 'Giải đấu này đã được bạn đánh giá trước đó (mỗi giải đấu chỉ đánh giá 1 lần)!'
                ], 400);
            }
        } else {
            if ($datSan->TrangThai !== 'HoanThanh') {
                return response()->json([
                    'success' => false,
                    'message' => 'Bạn chỉ có thể đánh giá sau khi trận đấu đã hoàn thành!'
                ], 400);
            }

            $daDanhGia = DanhGia::where('MaDatSan', $datSan->MaDatSan)->exists();
            if ($daDanhGia) {
                return response()->json([
                    'success' => false,
                    'message' => 'Lịch đặt sân này đã được bạn đánh giá trước đó (mỗi trận chỉ đánh giá 1 lần)!'
                ], 400);
            }
        }

        $maCumSan = $datSan->sanBong ? $datSan->sanBong->MaCumSan : null;
        if (!$maCumSan) {
            return response()->json([
                'success' => false,
                'message' => 'Không xác định được cụm sân của lịch đặt này!'
            ], 400);
        }

        $danhGia = DanhGia::create([
            'MaDatSan'    => $datSan->MaDatSan,
            'MaCumSan'    => $maCumSan,
            'MaNguoiDung' => $user->MaNguoiDung,
            'SoSao'       => $request->so_sao,
            'NoiDung'     => $request->noi_dung ? trim($request->noi_dung) : null
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