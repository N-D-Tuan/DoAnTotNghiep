<?php

namespace App\Http\Controllers;

use App\Models\GiaTien;
use Illuminate\Http\Request;

class GiaTienController extends Controller
{
    public function index(Request $request)
    {
        $cumSanId = $request->query('ma_cum_san', $request->query('cum_san_id'));
        $giaTien = GiaTien::where('MaCumSan', $cumSanId)->get();

        return response()->json(['success' => true, 'data' => $giaTien]);
    }

    public function saveBulk(Request $request)
    {
        $maCumSan  = $request->input('MaCumSan', $request->input('ID_CumSan'));
        $maLoaiSan = $request->input('MaLoaiSan', $request->input('ID_LoaiSan'));
        $request->merge([
            'MaCumSan'  => $maCumSan,
            'MaLoaiSan' => $maLoaiSan,
        ]);

        $request->validate([
            'MaCumSan'  => 'required|string',
            'MaLoaiSan' => 'required|string',
            'prices'    => 'required|array'
        ]);

        foreach ($request->prices as $price) {
            $maKhungGio = $price['MaKhungGio'] ?? $price['ID_KhungGio'] ?? null;
            if (!$maKhungGio) continue;

            if (empty($price['SoTien'])) {
                GiaTien::where('MaCumSan', $maCumSan)
                    ->where('MaLoaiSan', $maLoaiSan)
                    ->where('MaKhungGio', $maKhungGio)
                    ->delete();
            } else {
                GiaTien::updateOrCreate(
                    [
                        'MaCumSan'   => $maCumSan,
                        'MaLoaiSan'  => $maLoaiSan,
                        'MaKhungGio' => $maKhungGio
                    ],
                    [
                        'SoTien' => $price['SoTien']
                    ]
                );
            }
        }

        broadcast(new \App\Events\SystemDataUpdated());

        return response()->json(['success' => true, 'message' => 'Lưu bảng giá thành công']);
    }
}