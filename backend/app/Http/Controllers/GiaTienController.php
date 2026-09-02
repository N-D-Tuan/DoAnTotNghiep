<?php

namespace App\Http\Controllers;

use App\Models\GiaTien;
use Illuminate\Http\Request;

class GiaTienController extends Controller
{
    public function index(Request $request)
    {
        $cumSanId = $request->query('cum_san_id');
        $giaTien = GiaTien::where('ID_CumSan', $cumSanId)->get();
        
        return response()->json(['success' => true, 'data' => $giaTien]);
    }

    public function saveBulk(Request $request)
    {
        $request->validate([
            'ID_CumSan' => 'required',
            'ID_LoaiSan' => 'required',
            'prices' => 'required|array'
        ]);

        foreach ($request->prices as $price) {
            if (empty($price['SoTien'])) {
                // Nếu xóa trống ô input -> Xóa record trong Database (Đóng sân giờ đó)
                GiaTien::where('ID_CumSan', $request->ID_CumSan)
                    ->where('ID_LoaiSan', $request->ID_LoaiSan)
                    ->where('ID_KhungGio', $price['ID_KhungGio'])
                    ->delete();
            } else {
                // updateOrCreate: Nếu có rồi thì Cập nhật, chưa có thì Thêm mới
                GiaTien::updateOrCreate(
                    [
                        'ID_CumSan' => $request->ID_CumSan,
                        'ID_LoaiSan' => $request->ID_LoaiSan,
                        'ID_KhungGio' => $price['ID_KhungGio']
                    ],
                    [
                        'SoTien' => $price['SoTien']
                    ]
                );
            }
        }
        return response()->json(['success' => true, 'message' => 'Lưu bảng giá thành công']);
    }
}
