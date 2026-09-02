<?php

namespace App\Http\Controllers;

use App\Models\Phuong;
use Illuminate\Http\Request;

class PhuongController extends Controller
{
    public function index()
    {
        $phuong = Phuong::all();
        return response()->json([
            'success' => true, 
            'data' => $phuong
        ]);
    }
}
