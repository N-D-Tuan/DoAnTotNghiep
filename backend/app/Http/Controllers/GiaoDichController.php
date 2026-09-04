<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\GiaoDich;
use Illuminate\Support\Facades\Auth;

class GiaoDichController extends Controller
{
    public function layGiaoDichCuaToi(Request $request)
    {
        $userId = Auth::id() ?? $request->user()->ID;

        // Lấy tất cả giao dịch, sắp xếp mới nhất lên đầu
        $giaoDich = GiaoDich::where('ID_NguoiDung', $userId)
            ->orderBy('NgayTao', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $giaoDich
        ]);
    }
}
