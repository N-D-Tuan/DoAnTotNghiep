<?php

namespace App\Http\Controllers;

use App\Models\KhungGio;
use Illuminate\Http\Request;

class KhungGioController extends Controller
{
    public function index()
    {
        return response()->json(['success' => true, 'data' => KhungGio::orderBy('GioBatDau')->get()]);
    }
}
