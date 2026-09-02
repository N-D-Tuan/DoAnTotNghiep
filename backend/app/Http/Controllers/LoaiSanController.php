<?php

namespace App\Http\Controllers;

use App\Models\LoaiSan;
use Illuminate\Http\Request;

class LoaiSanController extends Controller
{
    public function index()
    {
        $loaiSan = LoaiSan::all();
        return response()->json([
            'success' => true, 
            'data' => $loaiSan
        ]);
    }
}
