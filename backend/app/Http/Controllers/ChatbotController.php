<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Auth;
use App\Models\PhienChat;
use App\Models\TinNhan;
use App\Models\NguoiDung;
use App\Models\Phuong;
use App\Models\CumSan;
use App\Models\LoaiSan;
use App\Models\GiaTien;
use App\Models\SanBong;
use App\Models\KhungGio;
use App\Models\DatSan;
use App\Models\GiaiDau;
use App\Models\GiaoDich;

class ChatbotController extends Controller
{
    public function nhanTinNhan(Request $request)
    {
        $request->validate([
            'noi_dung' => 'required|string',
            'id_phien_chat' => 'nullable|integer'
        ]);

        $noiDung = $request->input('noi_dung');
        $idPhienChat = $request->input('id_phien_chat');
        
        $user = NguoiDung::find(Auth::id() ?? $request->user()->ID);

        if (!$user) {
            return response()->json([
                'success' => false, 
                'message' => 'Phiên đăng nhập đã hết hạn, vui lòng tải lại trang!'
            ], 401);
        }

        // 1. Lấy hoặc tạo Phiên Chat
        if (!$idPhienChat) {
            $phienChat = PhienChat::create([
                'ID_NguoiDung' => $user->ID,
                'TieuDe' => mb_substr($noiDung, 0, 40) . '...',
            ]);
            $idPhienChat = $phienChat->ID;
        } else {
            $phienChat = PhienChat::findOrFail($idPhienChat);
        }

        // 2. Lưu tin nhắn của Khách hàng
        TinNhan::create([
            'ID_PhienChat' => $idPhienChat,
            'NguoiGui' => 'User',
            'NoiDung' => $noiDung,
        ]);

        // 3. Chuẩn bị lịch sử Chat
        $lichSuChat = TinNhan::where('ID_PhienChat', $idPhienChat)
            ->orderBy('NgayTao', 'asc')
            ->get();

        $contents = [];
        foreach ($lichSuChat as $tinNhan) {
            $contents[] = [
                'role' => $tinNhan->NguoiGui === 'User' ? 'user' : 'model',
                'parts' => [['text' => $tinNhan->NoiDung]]
            ];
        }

        // 4. Khai báo danh sách Tools (Function Declarations)
        $tools = [
            [
                'functionDeclarations' => [
                    [
                        'name' => 'traCuuGiaTien',
                        'description' => 'Tra cứu bảng giá thuê sân bóng theo tên cụm sân, loại sân hoặc khung giờ cụ thể.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'ten_cum_san' => [
                                    'type' => 'STRING',
                                    'description' => 'Tên hoặc từ khóa tên cụm sân bóng'
                                ],
                                'ten_loai_san' => [
                                    'type' => 'STRING',
                                    'description' => 'Loại sân bóng (VD: Sân 5, Sân 7)'
                                ],
                                'gio_da' => [
                                    'type' => 'STRING',
                                    'description' => 'Giờ bắt đầu đá mà khách quan tâm (VD: 15:00, 17h00)'
                                ]
                            ]
                        ]
                    ],
                    [
                        'name' => 'traCuuDanhSachCumSan',
                        'description' => 'Tra cứu danh sách tất cả các cụm sân bóng hiện đang hoạt động. Dữ liệu trả về bao gồm thông tin chi tiết về địa chỉ, và khu vực (phường/quận). Hãy gọi hàm này nếu khách hỏi sân ở một khu vực cụ thể.'
                    ],
                    [
                        'name' => 'traCuuChiTietCumSan',
                        'description' => 'Tra cứu chi tiết thông tin của một cụm sân cụ thể, bao gồm: giờ mở/đóng cửa (khung giờ hoạt động), địa chỉ, và danh sách các sân bóng con (sân 5, sân 7...).',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'ten_cum_san' => [
                                    'type' => 'STRING',
                                    'description' => 'Tên hoặc từ khóa của cụm sân cần xem chi tiết (ví dụ: Đa Phước, Tuyên Sơn...)'
                                ]
                            ],
                            'required' => ['ten_cum_san']
                        ]
                    ],
                    [
                        'name' => 'kiemTraLichTrong',
                        'description' => 'Kiểm tra xem một sân bóng cụ thể tại một thời gian (ngày, giờ) cụ thể đã có người đặt hay chưa.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'ten_cum_san' => [
                                    'type' => 'STRING',
                                    'description' => 'Tên cụm sân (VD: Đa Phước, Tuyên Sơn)'
                                ],
                                'ten_san_bong' => [
                                    'type' => 'STRING',
                                    'description' => 'Tên sân con cụ thể (VD: Sân 1, Sân 2, Sân VIP)'
                                ],
                                'ngay_da' => [
                                    'type' => 'STRING',
                                    'description' => 'Ngày khách muốn đá, bắt buộc định dạng YYYY-MM-DD. Hãy tự suy luận năm dựa vào thời gian hiện tại nếu khách chỉ nói ngày/tháng.'
                                ],
                                'gio_da' => [
                                    'type' => 'STRING',
                                    'description' => 'Giờ bắt đầu đá (VD: 15:00, 17:30)'
                                ]
                            ],
                            'required' => ['ten_cum_san', 'ten_san_bong', 'ngay_da', 'gio_da']
                        ]
                    ],
                    [
                        'name' => 'traCuuLichSuDatSan',
                        'description' => 'Tra cứu danh sách các lịch đặt sân SẮP TỚI (từ hôm nay trở đi) và ĐANG Ở TRẠNG THÁI ĐÃ CỌC của chính khách hàng này. Dữ liệu trả về sẽ bao gồm phân loại "Đá phong trào" hoặc "Đá giải" kèm tên giải đấu.'
                    ],
                    [
                        'name' => 'traCuuLichSuGiaoDich',
                        'description' => 'Tra cứu lịch sử giao dịch (nạp tiền, thanh toán, hoàn tiền...) và kiểm tra số dư ví hiện tại của chính khách hàng.'
                    ],
                    [
                        'name' => 'traCuuGiaiDauCaNhan',
                        'description' => 'Tra cứu số lượng và thông tin chi tiết các giải đấu (tên giải, thời gian, trạng thái) do chính khách hàng tạo ra hoặc quản lý.'
                    ]
                ]
            ]
        ];

        $homNay = date('d/m/Y');

        // 5. Payload gửi lên Gemini
        $payload = [
            'contents' => $contents,
            'tools' => $tools,
            'systemInstruction' => [
                'parts' => [
                    [
                        'text' => "Bạn là một trợ lý ảo CSKH chuyên nghiệp, thân thiện và nhiệt tình của hệ thống sân bóng đá mini mang tên 'DN FOOTBALL' ở thành phố Đà Nẵng. (HÔM NAY LÀ: {$homNay}).

                        Quy tắc giao tiếp của bạn:
                        1. Xưng hô là 'mình' hoặc 'trợ lý DN', gọi khách hàng là 'bạn' hoặc 'anh/chị'.
                        2. BẢO MẬT TUYỆT ĐỐI (QUAN TRỌNG): 
                           - Không bao giờ được tiết lộ thông tin cá nhân (tên, SĐT, ID...) của người đã đặt sân. 
                           - ĐỐI VỚI LỊCH SỬ GIAO DỊCH VÀ GIẢI ĐẤU: Tuyệt đối từ chối nếu khách hàng yêu cầu kiểm tra giao dịch, số dư hoặc giải đấu của người khác. BẠN CHỈ ĐƯỢC PHÉP trả lời thông tin giao dịch/giải đấu của CHÍNH KHÁCH HÀNG đang trò chuyện (dựa vào tool đã cung cấp).
                        3. Luôn trả lời ngắn gọn, súc tích, xuống dòng rõ ràng, sử dụng emoji phù hợp để tạo sự thân thiện. Nếu người dùng hỏi về các vấn đề không liên quan thì hãy từ chối 1 cách khéo léo và nhẹ nhàng.
                        4. Tuyệt đối KHÔNG tự bịa đặt dữ liệu sân bãi. Phải luôn dùng Tool để tra cứu MySQL. (Lưu ý: Chỉ dùng câu 'Hiện tại mình chưa có thông tin...' đối với các câu hỏi về dữ liệu sân bãi mà Tool không tìm ra. Còn các câu hỏi giao tiếp thông thường hoặc hỏi về ngày tháng thì cứ trả lời tự nhiên).
                        5. CÁCH SỬ DỤNG TOOL CHUẨN XÁC:
                           - Khách hỏi hệ thống có những cụm sân nào, HOẶC hỏi sân bóng ở một khu vực/phường/quận cụ thể (VD: Hải Châu có sân nào) -> Gọi `traCuuDanhSachCumSan`. (LƯU Ý: Hãy tự động quét mảng JSON trả về, đối chiếu trường 'khu_vuc' hoặc 'dia_chi' để lọc ra đúng các sân thuộc khu vực khách hỏi rồi mới trả lời).
                           - Khách hỏi giờ mở cửa, địa chỉ, hoặc có các sân con nào ở 1 cụm -> Gọi `traCuuChiTietCumSan`.
                           - Khách hỏi giá tiền -> Gọi `traCuuGiaTien`.
                           - Khách hỏi lịch trống (VD: 15h sân 2 Đa Phước trống không?) -> Gọi `kiemTraLichTrong`.
                           - Khách hỏi về lịch sử đặt sân -> Gọi `traCuuLichSuDatSan`. (BẮT BUỘC: Bạn PHẢI ĐỌC trường 'loai_hinh' trong JSON trả về để xác định là 'Đá phong trào' hay 'Đá giải'. TUYỆT ĐỐI KHÔNG tự phỏng đoán dựa trên tên sân hay thời gian. Luôn luôn kiểm tra trường này trước khi trả lời).
                           - Khách hỏi về TIỀN (nạp tiền, số dư ví, trừ tiền, lịch sử thanh toán) -> Gọi `traCuuLichSuGiaoDich`.
                           - Khách hỏi về THÔNG TIN GIẢI ĐẤU do họ quản lý (số lượng giải, ngày bắt đầu/kết thúc giải) -> Gọi `traCuuGiaiDauCaNhan`. (BẮT BUỘC: Nếu khách hỏi giải đấu đó có bao nhiêu trận/bao nhiêu lượt đặt sân, hãy TỪ CHỐI khéo léo, giải thích rằng số lượng đặt sân của giải quá lớn nên hệ thống không thể đếm chính xác, mong khách thông cảm. TUYỆT ĐỐI KHÔNG TỰ Ý ĐẾM).
                        6. Khi có kết quả từ Database, hãy tổng hợp lại thành câu văn tự nhiên, thân thiện và dễ đọc.
                        7. Các câu hỏi về ngày, tháng và thời gian thì trả lời tự nhiên. Với dữ liệu ngày hôm nay là {$homNay}."
                    ]
                ]
            ]
        ];

        // 5. Gọi API Gemini với cơ chế xoay vòng Key
        try {
            $geminiResponse = $this->callGeminiWithKeyRotation($payload);
            $parts = $geminiResponse['candidates'][0]['content']['parts'] ?? [];

            $botReply = '';
            $functionCall = null;
            $modelText = '';

            // Quét toàn bộ mảng parts để tìm lệnh gọi hàm (tránh bị che khuất bởi câu chào)
            foreach ($parts as $key => $part) {
                if (isset($part['functionCall'])) {
                    $functionCall = $part['functionCall'];
                    
                    // Ép kiểu trực tiếp lên mảng $parts gốc để trị tận gốc lỗi 400
                    if (empty($parts[$key]['functionCall']['args'])) {
                        $parts[$key]['functionCall']['args'] = new \stdClass();
                    }
                } elseif (isset($part['text'])) {
                    $modelText .= $part['text'];
                }
            }

            // 6. Kiểm tra xem Gemini có yêu cầu gọi Function không
            if ($functionCall) {
                $functionName = $functionCall['name'];
                $arguments = $functionCall['args'] ?? [];

                $functionResult = null;
                if ($functionName === 'traCuuGiaTien') {
                    $functionResult = $this->thucHienTraCuuGiaTien(
                        $arguments['ten_cum_san'] ?? null,
                        $arguments['ten_loai_san'] ?? null,
                        $arguments['gio_da'] ?? null
                    );
                } elseif ($functionName === 'traCuuDanhSachCumSan') {
                    $functionResult = $this->thucHienTraCuuDanhSachCumSan();
                } elseif ($functionName === 'traCuuChiTietCumSan') {
                    $functionResult = $this->thucHienTraCuuChiTietCumSan($arguments['ten_cum_san'] ?? '');
                } elseif ($functionName === 'kiemTraLichTrong') {
                    $functionResult = $this->thucHienKiemTraLichTrong(
                        $arguments['ten_cum_san'] ?? '',
                        $arguments['ten_san_bong'] ?? '',
                        $arguments['ngay_da'] ?? '',
                        $arguments['gio_da'] ?? ''
                    );
                } elseif ($functionName === 'traCuuLichSuDatSan') {
                    $functionResult = $this->thucHienTraCuuLichSuDatSan($user->ID);
                } elseif ($functionName === 'traCuuLichSuGiaoDich') {
                    $functionResult = $this->thucHienTraCuuLichSuGiaoDich($user->ID);
                } elseif ($functionName === 'traCuuGiaiDauCaNhan') {
                    $functionResult = $this->thucHienTraCuuGiaiDauCaNhan($user->ID);
                }

                // Đưa lượt Function Call vào hội thoại (Bắt buộc phải trả lại nguyên vẹn $parts cũ cho Google)
                $contents[] = [
                    'role' => 'model',
                    'parts' => $parts
                ];

                // Đưa kết quả từ Database trả lại cho Gemini
                $contents[] = [
                    'role' => 'user',
                    'parts' => [
                        [
                            'functionResponse' => [
                                'name' => $functionName,
                                'response' => [
                                    'name' => $functionName,
                                    'content' => $functionResult
                                ]
                            ]
                        ]
                    ]
                ];

                // Lần gọi 2: Gửi lại để Gemini tổng hợp câu trả lời cho khách
                $payload['contents'] = $contents;
                $secondResponse = $this->callGeminiWithKeyRotation($payload);
                
                // Trích xuất toàn bộ text từ lần gọi 2
                $secondParts = $secondResponse['candidates'][0]['content']['parts'] ?? [];
                foreach ($secondParts as $p) {
                    if (isset($p['text'])) {
                        $botReply .= $p['text'];
                    }
                }
                
                if (empty($botReply)) {
                    $botReply = 'Dạ hiện mình đã lấy được thông tin nhưng chưa phản hồi được, bạn vui lòng thử lại nhé!';
                }
            } else {
                // Trả lời văn bản thông thường nếu không có gọi hàm
                $botReply = $modelText ?: 'Xin lỗi, mình chưa hiểu ý bạn.';
            }

            // 7. Lưu tin nhắn Bot vào DB
            $tinNhanBot = TinNhan::create([
                'ID_PhienChat' => $idPhienChat,
                'NguoiGui' => 'Bot',
                'NoiDung' => $botReply,
            ]);

            $phienChat->touch();

            return response()->json([
                'success' => true,
                'id_phien_chat' => $idPhienChat,
                'reply' => $botReply,
                'tin_nhan_id' => $tinNhanBot->ID
            ]);

        } catch (\Exception $e) {
            Log::error('Lỗi Gemini API: ' . $e->getMessage());
            
            // Tự động xóa tin nhắn User vừa lưu để bảo vệ tính luân phiên của ngữ cảnh
            TinNhan::where('ID_PhienChat', $idPhienChat)
                ->where('NguoiGui', 'User')
                ->orderBy('ID', 'desc')
                ->first()
                ?->delete();

            return response()->json([
                'success' => false,
                'message' => 'Máy chủ AI của Google đang quá tải, bạn vui lòng thử lại sau vài phút nhé!'
            ], 500);
        }
    }

    private function callGeminiWithKeyRotation($payload)
    {
        $keys = config('services.gemini.keys', []);

        $keys = array_values(array_filter($keys));

        if (empty($keys)) {
            throw new \Exception('Không tìm thấy GEMINI_API_KEY trong file .env');
        }

        foreach ($keys as $index => $key) {
            if (empty($key)) continue;

            $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={$key}";

            // Gửi HTTP POST request
            $response = Http::withoutVerifying()->post($url, $payload);

            if ($response->successful()) {
                return $response->json();
            }

            if ($response->status() === 429 || $response->status() === 403 || $response->status() >= 500) {
                Log::warning("Gemini API Key " . ($index + 1) . " bị lỗi " . $response->status() . ". Chuyển sang key tiếp theo.");
                sleep(1); // Nghỉ 1 giây để tránh spam dồn dập khiến Google chặn IP
                continue; 
            }

            // Các lỗi khác (vd 400 Bad Request do sai format payload) thì văng lỗi luôn
            throw new \Exception("Lỗi từ Gemini: " . $response->body());
        }

        // Nếu chạy hết vòng lặp mà vẫn không return được -> Toàn bộ key đều tèo
        throw new \Exception("Tất cả GEMINI_API_KEY đều đã hết hạn ngạch hoặc bị chặn!");
    }

    public function layDanhSachPhienChat(Request $request)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()->ID);

        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Lỗi xác thực!'], 401);
        }

        // Lấy các phiên chat chưa bị xóa (SoftDeletes tự động loại bỏ các dòng có NgayXoa)
        $danhSach = PhienChat::where('ID_NguoiDung', $user->ID)
            ->orderBy('NgayCapNhat', 'desc') // Đưa phiên chat có tương tác mới nhất lên trên cùng
            ->get();

        return response()->json([
            'success' => true,
            'data' => $danhSach
        ]);
    }

    public function doiTenPhienChat(Request $request, $id)
    {
        $request->validate([
            'tieu_de' => 'required|string|max:255'
        ]);

        $user = NguoiDung::find(Auth::id() ?? $request->user()->ID);

        // Tìm phiên chat thuộc về user này
        $phienChat = PhienChat::where('ID', $id)->where('ID_NguoiDung', $user->ID)->first();

        if (!$phienChat) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy phiên chat!'], 404);
        }

        $phienChat->TieuDe = $request->tieu_de;
        $phienChat->save();

        return response()->json(['success' => true, 'message' => 'Đổi tên phiên chat thành công!']);
    }

    public function xoaPhienChat(Request $request, $id)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()->ID);

        $phienChat = PhienChat::where('ID', $id)->where('ID_NguoiDung', $user->ID)->first();

        if (!$phienChat) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy phiên chat!'], 404);
        }

        // Hàm delete() sẽ tự động điền thời gian hiện tại vào cột NgayXoa (SoftDeletes)
        $phienChat->delete();

        return response()->json(['success' => true, 'message' => 'Đã xóa phiên chat!']);
    }

    public function layChiTietPhienChat(Request $request, $id)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()->ID);

        // Kiểm tra xem phiên chat này có đúng là của user đang đăng nhập không
        $phienChat = PhienChat::where('ID', $id)->where('ID_NguoiDung', $user->ID)->first();

        if (!$phienChat) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy phiên chat!'], 404);
        }

        // Lấy toàn bộ tin nhắn của phiên này, sắp xếp cũ nhất lên trước (để chat cuộn từ trên xuống dưới)
        $tinNhans = TinNhan::where('ID_PhienChat', $phienChat->ID)
            ->orderBy('NgayTao', 'asc')
            ->get();

        return response()->json([
            'success' => true,
            'phien_chat' => $phienChat,
            'data' => $tinNhans
        ]);
    }

    private function thucHienTraCuuGiaTien($tenCumSan = null, $tenLoaiSan = null, $gioDa = null)
    {
        $query = GiaTien::query()
            ->join('CumSan', 'GiaTien.ID_CumSan', '=', 'CumSan.ID')
            ->join('LoaiSan', 'GiaTien.ID_LoaiSan', '=', 'LoaiSan.ID')
            ->join('KhungGio', 'GiaTien.ID_KhungGio', '=', 'KhungGio.ID')
            ->whereNull('CumSan.deleted_at');

        if (!empty($tenCumSan)) {
            $query->where('CumSan.TenCumSan', 'LIKE', '%' . trim($tenCumSan) . '%');
        }

        if (!empty($tenLoaiSan)) {
            $query->where('LoaiSan.TenLoaiSan', 'LIKE', '%' . trim($tenLoaiSan) . '%');
        }

        if (!empty($gioDa)) {
            // Chuyển đổi định dạng "15h" thành "15:00:00" để so sánh với CSDL
            $gioFormat = date('H:i:00', strtotime($gioDa));
            $query->where('KhungGio.GioBatDau', '<=', $gioFormat)
                  ->where('KhungGio.GioKetThuc', '>', $gioFormat);
        }

        $danhSachGia = $query->select([
            'CumSan.TenCumSan',
            'LoaiSan.TenLoaiSan',
            'KhungGio.GioBatDau',
            'KhungGio.GioKetThuc',
            'GiaTien.SoTien'
        ])
        ->orderBy('CumSan.TenCumSan')
        ->orderBy('KhungGio.GioBatDau')
        ->get();

        if ($danhSachGia->isEmpty()) {
            return [
                'trang_thai' => 'khong_tim_thay',
                'thong_bao' => 'Không tìm thấy thông tin giá sân phù hợp với yêu cầu.'
            ];
        }

        return [
            'trang_thai' => 'thanh_cong',
            'tong_so_ket_qua' => $danhSachGia->count(),
            'du_lieu' => $danhSachGia->map(function ($item) {
                return [
                    'cum_san' => $item->TenCumSan,
                    'loai_san' => $item->TenLoaiSan,
                    'khung_gio' => substr($item->GioBatDau, 0, 5) . ' - ' . substr($item->GioKetThuc, 0, 5),
                    'gia_tien' => number_format($item->SoTien, 0, ',', '.') . ' VNĐ'
                ];
            })->toArray()
        ];
    }

    private function thucHienTraCuuDanhSachCumSan()
    {
        $danhSach = CumSan::whereNull('CumSan.deleted_at')
            ->join('Phuong', 'CumSan.ID_Phuong', '=', 'Phuong.ID')
            ->get([
                'CumSan.TenCumSan', 
                'CumSan.DiaChi', 
                'CumSan.GioMoCua', 
                'CumSan.GioDongCua',
                'Phuong.TenPhuong'
            ]);

        if ($danhSach->isEmpty()) {
            return [
                'trang_thai' => 'khong_tim_thay',
                'thong_bao' => 'Hiện tại chưa có cụm sân nào hoạt động trên hệ thống.'
            ];
        }

        return [
            'trang_thai' => 'thanh_cong',
            'tong_so_cum_san' => $danhSach->count(),
            'du_lieu' => $danhSach->map(function ($item) {
                return [
                    'ten_cum_san' => $item->TenCumSan,
                    'dia_chi' => $item->DiaChi . ', ' . $item->TenPhuong,
                    'khu_vuc' => $item->TenPhuong,
                    'thoi_gian_hoat_dong' => substr($item->GioMoCua, 0, 5) . ' đến ' . substr($item->GioDongCua, 0, 5)
                ];
            })->toArray()
        ];
    }

    private function thucHienTraCuuChiTietCumSan($tenCumSan)
    {
        if (empty($tenCumSan)) {
            return [
                'trang_thai' => 'loi',
                'thong_bao' => 'Vui lòng cung cấp tên cụm sân để tra cứu.'
            ];
        }

        $danhSach = SanBong::query()
            ->join('CumSan', 'SanBong.ID_CumSan', '=', 'CumSan.ID')
            ->join('LoaiSan', 'SanBong.ID_LoaiSan', '=', 'LoaiSan.ID')
            ->where('CumSan.TenCumSan', 'LIKE', '%' . trim($tenCumSan) . '%')
            ->whereNull('CumSan.deleted_at')
            ->select([
                'CumSan.TenCumSan',
                'CumSan.DiaChi',
                'CumSan.GioMoCua',
                'CumSan.GioDongCua',
                'SanBong.TenSan',
                'LoaiSan.TenLoaiSan',
                'SanBong.TrangThai'
            ])
            ->orderBy('LoaiSan.TenLoaiSan') 
            ->orderBy('SanBong.TenSan')
            ->get();

        if ($danhSach->isEmpty()) {
            return [
                'trang_thai' => 'khong_tim_thay',
                'thong_bao' => "Không tìm thấy cụm sân '{$tenCumSan}' hoặc cụm này chưa có sân con nào hoạt động."
            ];
        }

        $thongTinCumSan = $danhSach->first();

        return [
            'trang_thai' => 'thanh_cong',
            'cum_san' => $thongTinCumSan->TenCumSan,
            'dia_chi' => $thongTinCumSan->DiaChi,
            'khung_gio_hoat_dong' => substr($thongTinCumSan->GioMoCua, 0, 5) . ' đến ' . substr($thongTinCumSan->GioDongCua, 0, 5),
            'tong_so_san_con' => $danhSach->count(),
            'danh_sach_san_con' => $danhSach->map(function ($item) {
                return [
                    'ten_san' => $item->TenSan,
                    'loai_san' => $item->TenLoaiSan,
                    'trang_thai' => $item->TrangThai === 'HoatDong' ? 'Đang hoạt động' : 'Đang bảo trì'
                ];
            })->toArray()
        ];
    }

    private function thucHienKiemTraLichTrong($tenCumSan, $tenSanBong, $ngayDa, $gioDa)
    {
        if (!$tenCumSan || !$tenSanBong || !$ngayDa || !$gioDa) {
            return ['trang_thai' => 'loi', 'thong_bao' => 'Cần cung cấp đủ tên cụm sân, tên sân, ngày và giờ để kiểm tra.'];
        }

        // 1. Tìm thông tin ID Sân bóng
        $sanBong = SanBong::join('CumSan', 'SanBong.ID_CumSan', '=', 'CumSan.ID')
            ->where('CumSan.TenCumSan', 'LIKE', '%' . trim($tenCumSan) . '%')
            ->where('SanBong.TenSan', 'LIKE', '%' . trim($tenSanBong) . '%')
            ->whereNull('CumSan.deleted_at')
            ->select('SanBong.ID', 'SanBong.TenSan', 'CumSan.TenCumSan')
            ->first();

        if (!$sanBong) {
            return ['trang_thai' => 'khong_tim_thay_san', 'thong_bao' => "Không tìm thấy sân '{$tenSanBong}' tại cụm '{$tenCumSan}'."];
        }

        // 2. Chuyển đổi định dạng giờ (VD: 15h -> 15:00:00)
        $gioBatDau = date('H:i:00', strtotime($gioDa));
        $khungGio = KhungGio::where('GioBatDau', $gioBatDau)->first();

        if (!$khungGio) {
            return ['trang_thai' => 'loi_khung_gio', 'thong_bao' => "Hệ thống không có khung giờ bắt đầu lúc {$gioBatDau}."];
        }

        // 3. Chuẩn hóa ngày về Y-m-d để tra cứu CSDL
        $ngayDaFormat = date('Y-m-d', strtotime($ngayDa));

        // 4. Kiểm tra trong bảng DatSan (Ngoại trừ các lịch đã hủy)
        $daDat = DatSan::where('ID_SanBong', $sanBong->ID)
            ->where('ID_KhungGio', $khungGio->ID)
            ->where('NgayDa', $ngayDaFormat)
            ->where('TrangThai', '!=', 'DaHuy')
            ->first();

        if ($daDat) {
            return [
                'trang_thai' => 'da_co_nguoi_dat',
                'thong_bao' => "Rất tiếc, sân {$sanBong->TenSan} ({$sanBong->TenCumSan}) lúc {$gioBatDau} ngày {$ngayDaFormat} ĐÃ CÓ NGƯỜI ĐẶT."
            ];
        }

        return [
            'trang_thai' => 'con_trong',
            'thong_bao' => "Tuyệt vời, sân {$sanBong->TenSan} ({$sanBong->TenCumSan}) lúc {$gioBatDau} ngày {$ngayDaFormat} HIỆN ĐANG TRỐNG và có thể đặt."
        ];
    }

    private function thucHienTraCuuLichSuDatSan($idNguoiDung)
    {
        // Lấy ngày hiện tại theo chuẩn YYYY-MM-DD
        $homNay = date('Y-m-d');

        $danhSach = DatSan::where('DatSan.ID_NguoiDung', $idNguoiDung)
            ->where('DatSan.NgayDa', '>=', $homNay)
            ->where('DatSan.TrangThai', 'DaCoc')
            ->join('SanBong', 'DatSan.ID_SanBong', '=', 'SanBong.ID')
            ->join('CumSan', 'SanBong.ID_CumSan', '=', 'CumSan.ID')
            ->join('KhungGio', 'DatSan.ID_KhungGio', '=', 'KhungGio.ID')
            ->leftJoin('GiaiDau', 'DatSan.ID_GiaiDau', '=', 'GiaiDau.ID')
            ->select([
                'CumSan.TenCumSan',
                'SanBong.TenSan',
                'KhungGio.GioBatDau',
                'KhungGio.GioKetThuc',
                'DatSan.NgayDa',
                'DatSan.TienCoc',
                'DatSan.ID_GiaiDau',
                'GiaiDau.TenGiaiDau'
            ])
            // Xếp tăng dần (ASC) để các lịch đá sắp diễn ra gần nhất nằm ở trên cùng
            ->orderBy('DatSan.NgayDa', 'asc')
            ->orderBy('KhungGio.GioBatDau', 'asc')
            ->limit(5)
            ->get();

        if ($danhSach->isEmpty()) {
            return [
                'trang_thai' => 'trong',
                'thong_bao' => 'Hiện tại bạn không có lịch đặt sân nào sắp tới (đã cọc).'
            ];
        }

        return [
            'trang_thai' => 'thanh_cong',
            'tong_so_lich_sap_toi' => $danhSach->count(),
            'du_lieu' => $danhSach->map(function ($item) {

                $loaiHinhDa = is_null($item->ID_GiaiDau) 
                    ? 'Đá phong trào' 
                    : 'Đá giải (Tên giải: ' . $item->TenGiaiDau . ')';

                return [
                    'cum_san' => $item->TenCumSan,
                    'san_bong' => $item->TenSan,
                    'ngay_da' => date('d/m/Y', strtotime($item->NgayDa)),
                    'khung_gio' => substr($item->GioBatDau, 0, 5) . ' - ' . substr($item->GioKetThuc, 0, 5),
                    'loai_hinh' => $loaiHinhDa,
                    'tien_coc' => number_format($item->TienCoc, 0, ',', '.') . ' VNĐ',
                    'trang_thai' => 'Đã cọc (Chờ đá)' // Hardcode luôn vì SQL đã lọc chuẩn 100%
                ];
            })->toArray()
        ];
    }

    private function thucHienTraCuuLichSuGiaoDich($idNguoiDung)
    {
        $giaoDich = GiaoDich::where('ID_NguoiDung', $idNguoiDung)
            ->orderBy('NgayTao', 'desc')
            ->limit(5)
            ->get(['LoaiGiaoDich', 'SoTien', 'SoDuSau', 'NoiDung', 'NgayTao']);

        if ($giaoDich->isEmpty()) {
            return [
                'trang_thai' => 'trong',
                'thong_bao' => 'Khách hàng chưa có bất kỳ giao dịch nào trên hệ thống.'
            ];
        }

        // Số dư hiện tại chính là SoDuSau của giao dịch mới nhất
        $soDuHienTai = $giaoDich->first()->SoDuSau;

        return [
            'trang_thai' => 'thanh_cong',
            'so_du_vi_hien_tai' => number_format($soDuHienTai, 0, ',', '.') . ' VNĐ',
            'danh_sach_giao_dich_gan_day' => $giaoDich->map(function ($item) {
                return [
                    'loai_giao_dich' => $item->LoaiGiaoDich,
                    'so_tien' => number_format($item->SoTien, 0, ',', '.') . ' VNĐ',
                    'noi_dung' => $item->NoiDung,
                    'thoi_gian' => date('d/m/Y H:i', strtotime($item->NgayTao))
                ];
            })->toArray()
        ];
    }

    private function thucHienTraCuuGiaiDauCaNhan($idNguoiDung)
    {
        $homNay = date('Y-m-d');

        // Lấy các giải đấu chưa kết thúc (hoặc kết thúc tính từ hôm nay trở đi)
        $giaiDau = GiaiDau::where('ID_NguoiDung', $idNguoiDung)
            ->where('NgayKetThuc', '>=', $homNay)
            ->where('TrangThai', 'HetHan') // Điều kiện 1: Trạng thái phải là HetHan (Hết hạn đăng ký)
            ->whereIn('ID', function($query) use ($idNguoiDung) {
                // Điều kiện 2: ID_GiaiDau phải tồn tại trong bảng DatSan của user này
                $query->select('ID_GiaiDau')
                      ->from('DatSan')
                      ->where('ID_NguoiDung', $idNguoiDung)
                      ->whereNotNull('ID_GiaiDau');
            })
            ->orderBy('NgayBatDau', 'asc')
            ->get(['TenGiaiDau', 'NgayBatDau', 'NgayKetThuc', 'TrangThai', 'NoiDung']);

        if ($giaiDau->isEmpty()) {
            return [
                'trang_thai' => 'trong',
                'thong_bao' => 'Khách hàng hiện không có giải đấu nào sắp diễn ra hoặc đang tổ chức.'
            ];
        }

        return [
            'trang_thai' => 'thanh_cong',
            'tong_so_giai_dau' => $giaiDau->count(),
            'danh_sach_giai_dau' => $giaiDau->map(function ($item) {
                return [
                    'ten_giai' => $item->TenGiaiDau,
                    'thoi_gian' => date('d/m/Y', strtotime($item->NgayBatDau)) . ' đến ' . date('d/m/Y', strtotime($item->NgayKetThuc)),
                    'trang_thai' => 'Đã chốt danh sách, đang thi đấu',
                    'ghi_chu' => $item->NoiDung ?? 'Không có'
                ];
            })->toArray()
        ];
    }
}
