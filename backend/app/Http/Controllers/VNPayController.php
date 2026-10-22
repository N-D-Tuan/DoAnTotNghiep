<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Models\NguoiDung;
use App\Models\GiaoDich;
use App\Models\ThongBao;

class VNPayController extends Controller
{
    public function createPayment(Request $request)
    {
        $request->validate([
            'so_tien' => 'required|numeric|min:10000'
        ]);

        $vnp_TmnCode = config('vnpay.tmn_code');
        $vnp_HashSecret = config('vnpay.hash_secret');
        $vnp_Url = config('vnpay.url');
        $vnp_Returnurl = config('vnpay.return_url');

        $userId = Auth::id() ?? $request->user()->MaNguoiDung;
        $vnp_TxnRef = $userId . '_' . time();
        $vnp_OrderInfo = "Nạp tiền vào ví điện tử DN FOOTBALL";
        $vnp_OrderType = 'billpayment';
        $vnp_Amount = $request->so_tien * 100;
        $vnp_Locale = 'vn';
        $vnp_IpAddr = $request->ip();

        $inputData = array(
            "vnp_Version"    => "2.1.0",
            "vnp_TmnCode"    => $vnp_TmnCode,
            "vnp_Amount"     => $vnp_Amount,
            "vnp_Command"    => "pay",
            "vnp_CreateDate" => date('YmdHis'),
            "vnp_CurrCode"   => "VND",
            "vnp_IpAddr"     => $vnp_IpAddr,
            "vnp_Locale"     => $vnp_Locale,
            "vnp_OrderInfo"  => $vnp_OrderInfo,
            "vnp_OrderType"  => $vnp_OrderType,
            "vnp_ReturnUrl"  => $vnp_Returnurl,
            "vnp_TxnRef"     => $vnp_TxnRef,
        );

        ksort($inputData);
        $query = "";
        $i = 0;
        $hashdata = "";

        foreach ($inputData as $key => $value) {
            if ($i == 1) {
                $hashdata .= '&' . urlencode($key) . "=" . urlencode($value);
            } else {
                $hashdata .= urlencode($key) . "=" . urlencode($value);
                $i = 1;
            }
            $query .= urlencode($key) . "=" . urlencode($value) . '&';
        }

        $vnp_Url = $vnp_Url . "?" . $query;

        if (isset($vnp_HashSecret)) {
            $vnpSecureHash = hash_hmac('sha512', $hashdata, $vnp_HashSecret);
            $vnp_Url .= 'vnp_SecureHash=' . $vnpSecureHash;
        }

        return response()->json([
            'success' => true,
            'url'     => $vnp_Url
        ]);
    }

    public function vnpayReturn(Request $request)
    {
        $vnp_HashSecret = config('vnpay.hash_secret');
        $inputData = array();

        foreach ($request->all() as $key => $value) {
            if (substr($key, 0, 4) == "vnp_") {
                $inputData[$key] = $value;
            }
        }

        $vnp_SecureHash = $inputData['vnp_SecureHash'] ?? '';
        unset($inputData['vnp_SecureHash']);
        ksort($inputData);
        $i = 0;
        $hashData = "";

        foreach ($inputData as $key => $value) {
            if ($i == 1) {
                $hashData = $hashData . '&' . urlencode($key) . "=" . urlencode($value);
            } else {
                $hashData = $hashData . urlencode($key) . "=" . urlencode($value);
                $i = 1;
            }
        }

        $secureHash = hash_hmac('sha512', $hashData, $vnp_HashSecret);
        $frontendUrl = 'http://127.0.0.1:5500/html/customer.html';

        if ($secureHash == $vnp_SecureHash) {
            if ($request->vnp_ResponseCode == '00') {
                DB::beginTransaction();
                try {
                    $parts = explode('_', $request->vnp_TxnRef);
                    $userId = $parts[0];

                    $nguoiDung = NguoiDung::find($userId);
                    if ($nguoiDung) {
                        $soTienNap = $request->vnp_Amount / 100;
                        $soDuTruoc = $nguoiDung->SoDuVi;
                        $soDuSau = $soDuTruoc + $soTienNap;

                        $isProcessed = GiaoDich::where('NoiDung', 'LIKE', "%{$request->vnp_TxnRef}%")->exists();

                        if (!$isProcessed) {
                            $nguoiDung->update(['SoDuVi' => $soDuSau]);

                            GiaoDich::create([
                                'MaNguoiDung'  => $nguoiDung->MaNguoiDung,
                                'LoaiGiaoDich' => 'NapTien',
                                'DongTien'     => 'Cong',
                                'SoTien'       => $soTienNap,
                                'SoDuTruoc'    => $soDuTruoc,
                                'SoDuSau'      => $soDuSau,
                                'NoiDung'      => 'Nạp tiền VNPay (Mã GD: ' . $request->vnp_TxnRef . ')'
                            ]);

                            ThongBao::create([
                                'MaNguoiDung'  => $nguoiDung->MaNguoiDung,
                                'TieuDe'       => 'Nạp tiền thành công',
                                'NoiDung'      => 'Bạn đã nạp thành công ' . number_format($soTienNap) . 'đ vào ví điện tử từ VNPay.',
                                'LoaiThongBao' => 'ViTien'
                            ]);

                            broadcast(new \App\Events\AdminDataUpdated())->toOthers();
                        }
                    }
                    DB::commit();
                    return redirect($frontendUrl . '?vnpay_status=success');
                } catch (\Exception $e) {
                    DB::rollBack();
                    return redirect($frontendUrl . '?vnpay_status=error');
                }
            } else {
                return redirect($frontendUrl . '?vnpay_status=failed');
            }
        } else {
            return redirect($frontendUrl . '?vnpay_status=invalid_signature');
        }
    }
}