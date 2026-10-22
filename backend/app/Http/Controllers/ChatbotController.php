<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Auth;
use App\Services\ChromaDBService;
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
use App\Models\YeuCauHuyGap;

class ChatbotController extends Controller
{
    public function nhanTinNhan(Request $request)
    {
        $request->validate([
            'noi_dung'      => 'required|string',
            'id_phien_chat' => 'nullable|string',
            'gio_hang'      => 'nullable|array'
        ]);

        $noiDung =$request->input('noi_dung');
        $idPhienChat =$request->input('id_phien_chat');
        $gioHang =$request->input('gio_hang', []);

        $user = NguoiDung::find(Auth::id() ?? $request->user()->MaNguoiDung);

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Phiên đăng nhập đã hết hạn, vui lòng tải lại trang!'
            ], 401);
        }

        if (!$idPhienChat) {$phienChat = PhienChat::create([
                'MaNguoiDung' => $user->MaNguoiDung,
                'TieuDe'      => mb_substr($noiDung, 0, 40) . '...',
            ]);
            $idPhienChat =$phienChat->MaPhienChat;
        } else {
            $phienChat = PhienChat::findOrFail($idPhienChat);
        }

        TinNhan::create([
            'MaPhienChat' => $idPhienChat,
            'NguoiGui'    => 'User',
            'NoiDung'     => $noiDung,
        ]);

        $lichSuChat = TinNhan::where('MaPhienChat',$idPhienChat)
            ->orderBy('NgayTao', 'asc')
            ->get();

        $contents = [];
        foreach ($lichSuChat as $tinNhan) {$contents[] = [
                'role'  => $tinNhan->NguoiGui === 'User' ? 'user' : 'model',
                'parts' => [['text' => $tinNhan->NoiDung]]
            ];
        }

        $tools = [
            [
                'functionDeclarations' => [
                    [
                        'name' => 'traCuuQuyDinhHeThong',
                        'description' => 'Tìm kiếm và tra cứu các quy định, chính sách, hướng dẫn sử dụng của hệ thống DN FOOTBALL (ví dụ: luật hủy sân, hoàn tiền, rút tiền, tạo giải đấu, đặt cọc, thời tiết, tài khoản, đổi/quên mật khẩu...).',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'tu_khoa' => [
                                    'type' => 'STRING',
                                    'description' => 'Từ khóa tìm kiếm quy định (VD: "cách hủy sân gấp", "hướng dẫn rút tiền"). QUAN TRỌNG: Nếu khách nói những câu tiếp nối ngắn gọn như "hướng dẫn tôi", "làm thế nào", "ở đâu", bạn PHẢI tự ghép thêm ngữ cảnh của câu trước đó để tạo thành từ khóa tra cứu đầy đủ (Ví dụ: "hướng dẫn hủy sân gấp").'
                                ]
                            ],
                            'required' => ['tu_khoa']
                        ]
                    ],
                    [
                        'name' => 'traCuuGiaTien',
                        'description' => 'Tra cứu bảng giá thuê sân bóng theo tên cụm sân, loại sân hoặc khung giờ cụ thể.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'ten_cum_san' => ['type' => 'STRING', 'description' => 'Tên hoặc từ khóa tên cụm sân bóng'],
                                'ten_loai_san' => ['type' => 'STRING', 'description' => 'Loại sân bóng (VD: Sân 5, Sân 7)'],
                                'gio_da' => ['type' => 'STRING', 'description' => 'Giờ bắt đầu đá (VD: "15:00", "17:30". BẮT BUỘC đổi "h" thành ":" và thêm số phút trước khi gọi hàm).'],
                                'danh_sach_gio' => [
                                    'type' => 'ARRAY',
                                    'items' => ['type' => 'STRING'],
                                    'description' => 'Danh sách số giờ khách muốn kiểm tra. ĐẶC BIỆT LƯU Ý: Nếu khách hỏi 1 KHOẢNG thời gian (VD: "từ 17h đến 20h"), BẮT BUỘC liệt kê TẤT CẢ các số giờ trong khoảng đó thành mảng (VD: ["17", "18", "19", "20"]). Nếu khách không nói giờ, gửi mảng rỗng [].'
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
                                'ten_cum_san' => ['type' => 'STRING', 'description' => 'Tên hoặc từ khóa của cụm sân cần xem chi tiết (ví dụ: Đa Phước, Tuyên Sơn...)']
                            ],
                            'required' => ['ten_cum_san']
                        ]
                    ],
                    [
                        'name' => 'kiemTraLichTrong',
                        'description' => 'Kiểm tra xem một sân bóng cụ thể tại một ngày cụ thể còn những khung giờ nào trống. Hỗ trợ kiểm tra 1 giờ, nhiều giờ cùng lúc, hoặc toàn bộ các giờ trong ngày.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'ten_cum_san' => ['type' => 'STRING', 'description' => 'Tên cụm sân (VD: Đa Phước, Tuyên Sơn)'],
                                'ten_san_bong' => ['type' => 'STRING', 'description' => 'Tên sân con cụ thể (VD: Sân 1, Sân 2, Sân VIP)'],
                                'ngay_da' => ['type' => 'STRING', 'description' => 'Ngày khách muốn đá, bắt buộc định dạng YYYY-MM-DD. Hãy tự suy luận năm dựa vào thời gian hiện tại nếu khách chỉ nói ngày/tháng.'],
                                'gio_da' => ['type' => 'STRING', 'description' => 'Giờ bắt đầu đá (VD: "15:00", "17:30". BẮT BUỘC đổi "h" thành ":" và thêm số phút trước khi gọi hàm).'],
                                'danh_sach_gio' => [
                                    'type' => 'ARRAY',
                                    'items' => ['type' => 'STRING'],
                                    'description' => 'Danh sách số giờ khách muốn kiểm tra. ĐẶC BIỆT LƯU Ý: Nếu khách hỏi 1 KHOẢNG thời gian (VD: "từ 17h đến 20h"), BẮT BUỘC liệt kê TẤT CẢ các số giờ trong khoảng đó thành mảng (VD: ["17", "18", "19", "20"]). Nếu khách không nói giờ, gửi mảng rỗng [].'
                                ]
                            ],
                            'required' => ['ten_cum_san', 'ten_san_bong', 'ngay_da']
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
                    ],
                    [
                        'name' => 'themVaoGioHang',
                        'description' => 'Thực hiện việc thêm lịch sân vào giỏ hàng ngay khi khách hàng yêu cầu đặt sân. BẮT BUỘC phải hỏi và thu thập đủ 4 thông tin (cụm sân, sân, ngày, giờ) trước khi gọi hàm này.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'ten_cum_san' => ['type' => 'STRING', 'description' => 'Tên cụm sân (VD: Đa Phước)'],
                                'ten_san_bong' => ['type' => 'STRING', 'description' => 'Tên sân con (VD: Sân 1, Sân 2)'],
                                'ngay_da' => ['type' => 'STRING', 'description' => 'Định dạng YYYY-MM-DD'],
                                'danh_sach_gio' => [
                                    'type' => 'ARRAY',
                                    'items' => ['type' => 'STRING'],
                                    'description' => 'Danh sách số giờ khách muốn kiểm tra. ĐẶC BIỆT LƯU Ý: Nếu khách hỏi 1 KHOẢNG thời gian (VD: "từ 17h đến 20h"), BẮT BUỘC liệt kê TẤT CẢ các số giờ trong khoảng đó thành mảng (VD: ["17", "18", "19", "20"]). Nếu khách không nói giờ, gửi mảng rỗng [].'
                                ]
                            ],
                            'required' => ['ten_cum_san', 'ten_san_bong', 'ngay_da', 'danh_sach_gio']
                        ]
                    ]
                ]
            ]
        ];

        $homNay = date('d/m/Y');

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
                        4. LUẬT CẤM BỊA ĐẶT (RẤT QUAN TRỌNG): 
                            - Tuyệt đối KHÔNG tự bịa đặt dữ liệu sân bãi.
                            - Tuyệt đối KHÔNG tự bịa đặt các bước thao tác trên website (ví dụ: bấm nút nào, vào menu nào). Mọi hướng dẫn cách làm (rút tiền, hủy sân, tạo giải...) BẮT BUỘC phải trích xuất y hệt từng bước từ kết quả của tool traCuuQuyDinhHeThong. Nếu tool không trả về các bước thao tác, hãy báo rằng bạn chưa có thông tin.
                        5. CÁCH SỬ DỤNG TOOL CHUẨN XÁC:
                            - Khách hỏi CÁCH THỨC, HƯỚNG DẪN (cách nạp tiền, rút tiền, đặt sân, tạo giải, đổi mật khẩu, quên mật khẩu) HOẶC hỏi LUẬT, CHÍNH SÁCH (hủy sân, hoàn tiền, thời tiết) -> BẮT BUỘC gọi `traCuuQuyDinhHeThong`.
                            - Khách hỏi hệ thống có những cụm sân nào, HOẶC hỏi sân bóng ở một khu vực/phường/quận cụ thể (VD: Hải Châu có sân nào) -> Gọi `traCuuDanhSachCumSan`.
                            - Khách hỏi giờ mở cửa, địa chỉ, hoặc có các sân con nào ở 1 cụm -> Gọi `traCuuChiTietCumSan`.
                            - Khách hỏi giá tiền của khung giờ của sân cụ thể nào đó -> Gọi `traCuuGiaTien`.
                            - Khách hỏi lịch trống -> Gọi `kiemTraLichTrong`.
                            - Khách hỏi về lịch sử đặt sân -> Gọi `traCuuLichSuDatSan`.
                            - Khách yêu cầu KIỂM TRA DỮ LIỆU CÁ NHÂN VỀ TIỀN -> Gọi `traCuuLichSuGiaoDich`.
                            - Khách hỏi về THÔNG TIN GIẢI ĐẤU do họ quản lý -> Gọi `traCuuGiaiDauCaNhan`.
                            - Khách yêu cầu ĐẶT SÂN / CHỐT LỊCH / THÊM VÀO GIỎ HÀNG -> Gọi `themVaoGioHang`.
                        6. Khi có kết quả từ Database, hãy tổng hợp lại thành câu văn tự nhiên, thân thiện và dễ đọc.
                        7. Các câu hỏi về ngày, tháng và thời gian thì trả lời tự nhiên. Với dữ liệu ngày hôm nay là {$homNay}.
                        8. QUY ĐỊNH VỀ THỜI GIAN: Hệ thống CHỈ hỗ trợ các khung giờ chẵn theo từng tiếng (VD: 17:00 - 18:00, 18:00 - 19:00). TUYỆT ĐỐI KHÔNG hỗ trợ giờ lẻ (như 17:30, 18h30) và KHÔNG cho phép đặt 1 tiếng rưỡi."
                    ]
                ]
            ]
        ];

        try {
            $geminiResponse = $this->callGeminiWithKeyRotation($payload);
            $parts = $geminiResponse['candidates'][0]['content']['parts'] ?? [];

            $botReply = '';
            $functionCall = null;
            $modelText = '';
            $clientAction = null;

            foreach ($parts as $key => $part) {
                if (isset($part['functionCall'])) {
                    $functionCall = $part['functionCall'];
                    if (empty($parts[$key]['functionCall']['args'])) {
                        $parts[$key]['functionCall']['args'] = new \stdClass();
                    }
                } elseif (isset($part['text'])) {
                    $modelText .= $part['text'];
                }
            }

            if ($functionCall) {
                $functionName = $functionCall['name'];
                $arguments = $functionCall['args'] ?? [];

                $functionResult = null;
                if ($functionName === 'traCuuQuyDinhHeThong') {
                    $chromaService = app(ChromaDBService::class);
                    $functionResult = $chromaService->timKiemQuyDinh($arguments['tu_khoa'] ?? $noiDung);
                } elseif ($functionName === 'traCuuGiaTien') {
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
                        $arguments['danh_sach_gio'] ?? []
                    );
                } elseif ($functionName === 'traCuuLichSuDatSan') {
                    $functionResult = $this->thucHienTraCuuLichSuDatSan($user->MaNguoiDung);
                } elseif ($functionName === 'traCuuLichSuGiaoDich') {
                    $functionResult = $this->thucHienTraCuuLichSuGiaoDich($user->MaNguoiDung);
                } elseif ($functionName === 'traCuuGiaiDauCaNhan') {
                    $functionResult = $this->thucHienTraCuuGiaiDauCaNhan($user->MaNguoiDung);
                } elseif ($functionName === 'themVaoGioHang') {
                    $datSanResult = $this->thucHienThemVaoGioHang(
                        $arguments['ten_cum_san'] ?? '',
                        $arguments['ten_san_bong'] ?? '',
                        $arguments['ngay_da'] ?? '',
                        $arguments['danh_sach_gio'] ?? [],
                        $gioHang
                    );
                    $functionResult = $datSanResult['gemini_text'];
                    if (isset($datSanResult['client_action'])) {
                        $clientAction = $datSanResult['client_action'];
                    }
                }

                $contents[] = [
                    'role'  => 'model',
                    'parts' => $parts
                ];

                $contents[] = [
                    'role'  => 'user',
                    'parts' => [
                        [
                            'functionResponse' => [
                                'name'     => $functionName,
                                'response' => [
                                    'name'    => $functionName,
                                    'content' => $functionResult
                                ]
                            ]
                        ]
                    ]
                ];

                $payload['contents'] = $contents;
                $secondResponse = $this->callGeminiWithKeyRotation($payload);

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
                $botReply = $modelText ?: 'Xin lỗi, mình chưa hiểu ý bạn.';
            }

            // Lưu tin nhắn Bot kèm DuLieuBocThem (nếu có client_action)
            $tinNhanBot = TinNhan::create([
                'MaPhienChat'   => $idPhienChat,
                'NguoiGui'      => 'Bot',
                'NoiDung'       => $botReply,
                'DuLieuBocThem' => $clientAction,
            ]);

            $phienChat->touch();

            return response()->json([
                'success'       => true,
                'id_phien_chat' => $idPhienChat,
                'reply'         => $botReply,
                'tin_nhan_id'   => $tinNhanBot->MaTinNhan,
                'client_action' => $clientAction
            ]);

        } catch (\Exception $e) {
            Log::error('Lỗi Gemini API: ' . $e->getMessage());

            TinNhan::where('MaPhienChat', $idPhienChat)
                ->where('NguoiGui', 'User')
                ->orderBy('NgayTao', 'desc')
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
            $response = Http::withoutVerifying()->post($url, $payload);

            if ($response->successful()) {
                return $response->json();
            }

            if ($response->status() === 429 || $response->status() === 403 || $response->status() >= 500) {
                Log::warning("Gemini API Key " . ($index + 1) . " bị lỗi " . $response->status() . ". Chuyển sang key tiếp theo.");
                sleep(1);
                continue;
            }

            throw new \Exception("Lỗi từ Gemini: " . $response->body());
        }

        throw new \Exception("Tất cả GEMINI_API_KEY đều đã hết hạn ngạch hoặc bị chặn!");
    }

    public function layDanhSachPhienChat(Request $request)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()->MaNguoiDung);

        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Lỗi xác thực!'], 401);
        }

        $danhSach = PhienChat::where('MaNguoiDung', $user->MaNguoiDung)
            ->orderBy('NgayCapNhat', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data'    => $danhSach
        ]);
    }

    public function doiTenPhienChat(Request $request, $id)
    {
        $request->validate([
            'tieu_de' => 'required|string|max:255'
        ]);

        $user = NguoiDung::find(Auth::id() ?? $request->user()->MaNguoiDung);
        $phienChat = PhienChat::where('MaPhienChat', $id)->where('MaNguoiDung', $user->MaNguoiDung)->first();

        if (!$phienChat) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy phiên chat!'], 404);
        }

        $phienChat->timestamps = false;
        $phienChat->TieuDe = $request->tieu_de;
        $phienChat->save();

        return response()->json(['success' => true, 'message' => 'Đổi tên phiên chat thành công!']);
    }

    public function xoaPhienChat(Request $request, $id)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()->MaNguoiDung);
        $phienChat = PhienChat::where('MaPhienChat', $id)->where('MaNguoiDung', $user->MaNguoiDung)->first();

        if (!$phienChat) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy phiên chat!'], 404);
        }

        $phienChat->delete();

        return response()->json(['success' => true, 'message' => 'Đã xóa phiên chat!']);
    }

    public function layChiTietPhienChat(Request $request, $id)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()->MaNguoiDung);
        $phienChat = PhienChat::where('MaPhienChat', $id)->where('MaNguoiDung', $user->MaNguoiDung)->first();

        if (!$phienChat) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy phiên chat!'], 404);
        }

        $tinNhans = TinNhan::where('MaPhienChat', $phienChat->MaPhienChat)
            ->orderBy('NgayTao', 'asc')
            ->get();

        return response()->json([
            'success'    => true,
            'phien_chat' => $phienChat,
            'data'       => $tinNhans
        ]);
    }

    private function thucHienTraCuuGiaTien($tenCumSan = null, $tenLoaiSan = null, $gioDa = null)
    {
        $query = GiaTien::query()
            ->join('CumSan', 'GiaTien.MaCumSan', '=', 'CumSan.MaCumSan')
            ->join('LoaiSan', 'GiaTien.MaLoaiSan', '=', 'LoaiSan.MaLoaiSan')
            ->join('KhungGio', 'GiaTien.MaKhungGio', '=', 'KhungGio.MaKhungGio')
            ->where('CumSan.TrangThai', 'HoatDong');

        if (!empty($tenCumSan)) {
            $query->where('CumSan.TenCumSan', 'LIKE', '%' . trim($tenCumSan) . '%');
        }

        if (!empty($tenLoaiSan)) {
            $query->where('LoaiSan.TenLoaiSan', 'LIKE', '%' . trim($tenLoaiSan) . '%');
        }

        if (!empty($gioDa)) {
            preg_match('/(\d{1,2})(?:h|:)?(\d{2})?/i', trim($gioDa), $matches);
            if (!empty($matches[1])) {
                $hour = str_pad($matches[1], 2, '0', STR_PAD_LEFT);
                $minute = !empty($matches[2]) ? str_pad($matches[2], 2, '0', STR_PAD_LEFT) : '00';

                if ($minute !== '00') {
                    return [
                        'trang_thai' => 'loi',
                        'thong_bao'  => 'Hệ thống chỉ có các khung giờ chẵn theo từng tiếng (VD: 17:00, 18:00), không hỗ trợ giờ lẻ.'
                    ];
                }
                $gioFormat = "$hour:$minute:00";
                $query->where('KhungGio.GioBatDau', '<=', $gioFormat)
                      ->where('KhungGio.GioKetThuc', '>', $gioFormat);
            }
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
                'thong_bao'  => 'Không tìm thấy thông tin giá sân phù hợp với yêu cầu.'
            ];
        }

        return [
            'trang_thai'      => 'thanh_cong',
            'tong_so_ket_qua' => $danhSachGia->count(),
            'du_lieu'         => $danhSachGia->map(function ($item) {
                return [
                    'cum_san'   => $item->TenCumSan,
                    'loai_san'  => $item->TenLoaiSan,
                    'khung_gio' => substr($item->GioBatDau, 0, 5) . ' - ' . substr($item->GioKetThuc, 0, 5),
                    'gia_tien'  => number_format($item->SoTien, 0, ',', '.') . ' VNĐ'
                ];
            })->toArray()
        ];
    }

    private function thucHienTraCuuDanhSachCumSan()
    {
        $danhSach = CumSan::where('CumSan.TrangThai', 'HoatDong')
            ->join('Phuong', 'CumSan.MaPhuong', '=', 'Phuong.MaPhuong')
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
                'thong_bao'  => 'Hiện tại chưa có cụm sân nào hoạt động trên hệ thống.'
            ];
        }

        return [
            'trang_thai'      => 'thanh_cong',
            'tong_so_cum_san' => $danhSach->count(),
            'du_lieu'         => $danhSach->map(function ($item) {
                return [
                    'ten_cum_san'         => $item->TenCumSan,
                    'dia_chi'             => $item->DiaChi . ', ' . $item->TenPhuong,
                    'khu_vuc'             => $item->TenPhuong,
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
                'thong_bao'  => 'Vui lòng cung cấp tên cụm sân để tra cứu.'
            ];
        }

        $danhSach = SanBong::query()
            ->join('CumSan', 'SanBong.MaCumSan', '=', 'CumSan.MaCumSan')
            ->join('LoaiSan', 'SanBong.MaLoaiSan', '=', 'LoaiSan.MaLoaiSan')
            ->where('CumSan.TenCumSan', 'LIKE', '%' . trim($tenCumSan) . '%')
            ->where('CumSan.TrangThai', 'HoatDong')
            ->select([
                'CumSan.TenCumSan',
                'CumSan.DiaChi',
                'CumSan.GioMoCua',
                'CumSan.GioDongCua',
                'SanBong.TenSan',
                'SanBong.DienTich',
                'SanBong.KichThuoc',
                'SanBong.MoTa',
                'LoaiSan.TenLoaiSan',
                'SanBong.TrangThai'
            ])
            ->orderBy('LoaiSan.TenLoaiSan')
            ->orderBy('SanBong.TenSan')
            ->get();

        if ($danhSach->isEmpty()) {
            return [
                'trang_thai' => 'khong_tim_thay',
                'thong_bao'  => "Không tìm thấy cụm sân '{$tenCumSan}' hoặc cụm này chưa có sân con nào hoạt động."
            ];
        }

        $thongTinCumSan = $danhSach->first();

        return [
            'trang_thai'          => 'thanh_cong',
            'cum_san'             => $thongTinCumSan->TenCumSan,
            'dia_chi'             => $thongTinCumSan->DiaChi,
            'khung_gio_hoat_dong' => substr($thongTinCumSan->GioMoCua, 0, 5) . ' đến ' . substr($thongTinCumSan->GioDongCua, 0, 5),
            'tong_so_san_con'     => $danhSach->count(),
            'danh_sach_san_con'   => $danhSach->map(function ($item) {
                return [
                    'ten_san'    => $item->TenSan,
                    'loai_san'   => $item->TenLoaiSan,
                    'kich_thuoc' => $item->KichThuoc,
                    'dien_tich'  => $item->DienTich ? ($item->DienTich . ' m2') : null,
                    'trang_thai' => $item->TrangThai === 'HoatDong' ? 'Đang hoạt động' : 'Đang bảo trì'
                ];
            })->toArray()
        ];
    }

    private function thucHienKiemTraLichTrong($tenCumSan, $tenSanBong, $ngayDa, $danhSachGio = [])
    {
        if (!$tenCumSan || !$tenSanBong || !$ngayDa) {
            return ['trang_thai' => 'loi', 'thong_bao' => 'Cần cung cấp đủ tên cụm sân, tên sân, ngày để kiểm tra.'];
        }

        $sanBong = SanBong::join('CumSan', 'SanBong.MaCumSan', '=', 'CumSan.MaCumSan')
            ->where('CumSan.TenCumSan', 'LIKE', '%' . trim($tenCumSan) . '%')
            ->where('SanBong.TenSan', 'LIKE', '%' . trim($tenSanBong) . '%')
            ->where('CumSan.TrangThai', 'HoatDong')
            ->select('SanBong.MaSanBong', 'SanBong.TenSan', 'CumSan.TenCumSan', 'CumSan.GioMoCua', 'CumSan.GioDongCua')
            ->first();

        if (!$sanBong) {
            return ['trang_thai' => 'khong_tim_thay_san', 'thong_bao' => "Không tìm thấy sân '{$tenSanBong}' tại cụm '{$tenCumSan}'."];
        }

        $ngayDaFormat = date('Y-m-d', strtotime($ngayDa));

        $requestedHours = [];
        if (!empty($danhSachGio) && is_array($danhSachGio)) {
            foreach ($danhSachGio as $g) {
                if (preg_match('/(\d{1,2})(?:h|:)?(\d{2})?/i', trim($g), $matches)) {
                    $hour = (int)$matches[1];
                    $minute = !empty($matches[2]) ? str_pad($matches[2], 2, '0', STR_PAD_LEFT) : '00';

                    if ($minute !== '00') {
                        return ['trang_thai' => 'loi_khung_gio', 'thong_bao' => "Hệ thống chỉ hỗ trợ đặt sân chẵn từng tiếng (VD: 17:00, 18:00). Không hỗ trợ giờ lẻ như {$g} hoặc 1.5 tiếng."];
                    }
                    $requestedHours[] = $hour;
                }
            }
        }

        $danhSachKhungGio = KhungGio::orderBy('GioBatDau', 'asc')->get();

        $daDatKhungGioIds = DatSan::where('MaSanBong', $sanBong->MaSanBong)
            ->where('NgayDa', $ngayDaFormat)
            ->where('TrangThai', '!=', 'DaHuy')
            ->pluck('MaKhungGio')
            ->toArray();

        $ketQuaLich = [];
        foreach ($danhSachKhungGio as $kg) {
            if ($kg->GioBatDau < $sanBong->GioMoCua || $kg->GioKetThuc > $sanBong->GioDongCua) {
                continue;
            }

            if (!empty($requestedHours)) {
                $hourKg = (int)date('H', strtotime($kg->GioBatDau));
                if (!in_array($hourKg, $requestedHours)) {
                    continue;
                }
            }

            $gioStr = substr($kg->GioBatDau, 0, 5) . ' - ' . substr($kg->GioKetThuc, 0, 5);
            $isBooked = in_array($kg->MaKhungGio, $daDatKhungGioIds);
            $isPast = strtotime($ngayDaFormat . ' ' . $kg->GioBatDau) <= time();

            if ($isPast) {
                $trangThai = 'Đã qua giờ (KHÔNG ĐẶT ĐƯỢC)';
            } elseif ($isBooked) {
                $trangThai = 'Đã có người đặt (KHÔNG TRỐNG)';
            } else {
                $trangThai = 'CÒN TRỐNG (CÓ THỂ ĐẶT)';
            }

            $ketQuaLich[$gioStr] = $trangThai;
        }

        if (empty($ketQuaLich)) {
            return ['trang_thai' => 'loi_khung_gio', 'thong_bao' => "Hệ thống không có các khung giờ như yêu cầu hoặc sân đóng cửa."];
        }

        return [
            'trang_thai'    => 'thanh_cong',
            'thong_bao'     => "Dưới đây là tình trạng các khung giờ ngày " . date('d/m/Y', strtotime($ngayDaFormat)) . " tại {$sanBong->TenSan} ({$sanBong->TenCumSan}). Hãy thông báo rõ ràng tình trạng của TỪNG KHUNG GIỜ cho khách biết:",
            'chi_tiet_lich' => $ketQuaLich
        ];
    }

    private function thucHienTraCuuLichSuDatSan($maNguoiDung)
    {
        $homNay = date('Y-m-d');

        $danhSach = DatSan::where('DatSan.MaNguoiDung', $maNguoiDung)
            ->where('DatSan.NgayDa', '>=', $homNay)
            ->where('DatSan.TrangThai', 'DaCoc')
            ->join('SanBong', 'DatSan.MaSanBong', '=', 'SanBong.MaSanBong')
            ->join('CumSan', 'SanBong.MaCumSan', '=', 'CumSan.MaCumSan')
            ->join('KhungGio', 'DatSan.MaKhungGio', '=', 'KhungGio.MaKhungGio')
            ->leftJoin('GiaiDau', 'DatSan.MaGiaiDau', '=', 'GiaiDau.MaGiaiDau')
            ->select([
                'CumSan.TenCumSan',
                'SanBong.TenSan',
                'KhungGio.GioBatDau',
                'KhungGio.GioKetThuc',
                'DatSan.NgayDa',
                'DatSan.TienCoc',
                'DatSan.MaGiaiDau',
                'GiaiDau.TenGiaiDau'
            ])
            ->orderBy('DatSan.NgayDa', 'asc')
            ->orderBy('KhungGio.GioBatDau', 'asc')
            ->limit(5)
            ->get();

        if ($danhSach->isEmpty()) {
            return [
                'trang_thai' => 'trong',
                'thong_bao'  => 'Hiện tại bạn không có lịch đặt sân nào sắp tới (đã cọc).'
            ];
        }

        return [
            'trang_thai'           => 'thanh_cong',
            'tong_so_lich_sap_toi' => $danhSach->count(),
            'du_lieu'              => $danhSach->map(function ($item) {
                $loaiHinhDa = is_null($item->MaGiaiDau)
                    ? 'Đá phong trào'
                    : 'Đá giải (Tên giải: ' . $item->TenGiaiDau . ')';

                return [
                    'cum_san'    => $item->TenCumSan,
                    'san_bong'   => $item->TenSan,
                    'ngay_da'    => date('d/m/Y', strtotime($item->NgayDa)),
                    'khung_gio'  => substr($item->GioBatDau, 0, 5) . ' - ' . substr($item->GioKetThuc, 0, 5),
                    'loai_hinh'  => $loaiHinhDa,
                    'tien_coc'   => number_format($item->TienCoc, 0, ',', '.') . ' VNĐ',
                    'trang_thai' => 'Đã cọc (Chờ đá)'
                ];
            })->toArray()
        ];
    }

    private function thucHienTraCuuLichSuGiaoDich($maNguoiDung)
    {
        $giaoDich = GiaoDich::where('MaNguoiDung', $maNguoiDung)
            ->orderBy('NgayTao', 'desc')
            ->limit(5)
            ->get(['LoaiGiaoDich', 'SoTien', 'SoDuSau', 'NoiDung', 'NgayTao']);

        if ($giaoDich->isEmpty()) {
            return [
                'trang_thai' => 'trong',
                'thong_bao'  => 'Khách hàng chưa có bất kỳ giao dịch nào trên hệ thống.'
            ];
        }

        $soDuHienTai = $giaoDich->first()->SoDuSau;

        return [
            'trang_thai'                  => 'thanh_cong',
            'so_du_vi_hien_tai'           => number_format($soDuHienTai, 0, ',', '.') . ' VNĐ',
            'danh_sach_giao_dich_gan_day' => $giaoDich->map(function ($item) {
                return [
                    'loai_giao_dich' => $item->LoaiGiaoDich,
                    'so_tien'        => number_format($item->SoTien, 0, ',', '.') . ' VNĐ',
                    'noi_dung'       => $item->NoiDung,
                    'thoi_gian'      => date('d/m/Y H:i', strtotime($item->NgayTao))
                ];
            })->toArray()
        ];
    }

    private function thucHienTraCuuGiaiDauCaNhan($maNguoiDung)
    {
        $homNay = date('Y-m-d');

        $giaiDau = GiaiDau::where('MaNguoiDung', $maNguoiDung)
            ->where('NgayKetThuc', '>=', $homNay)
            ->where('TrangThai', 'HetHan')
            ->whereIn('MaGiaiDau', function($query) use ($maNguoiDung) {
                $query->select('MaGiaiDau')
                      ->from('DatSan')
                      ->where('MaNguoiDung', $maNguoiDung)
                      ->whereNotNull('MaGiaiDau');
            })
            ->orderBy('NgayBatDau', 'asc')
            ->get(['TenGiaiDau', 'NgayBatDau', 'NgayKetThuc', 'TrangThai', 'NoiDung']);

        if ($giaiDau->isEmpty()) {
            return [
                'trang_thai' => 'trong',
                'thong_bao'  => 'Khách hàng hiện không có giải đấu nào sắp diễn ra hoặc đang tổ chức.'
            ];
        }

        return [
            'trang_thai'        => 'thanh_cong',
            'tong_so_giai_dau'  => $giaiDau->count(),
            'danh_sach_giai_dau'=> $giaiDau->map(function ($item) {
                return [
                    'ten_giai'   => $item->TenGiaiDau,
                    'thoi_gian'  => date('d/m/Y', strtotime($item->NgayBatDau)) . ' đến ' . date('d/m/Y', strtotime($item->NgayKetThuc)),
                    'trang_thai' => 'Đã chốt danh sách, đang thi đấu',
                    'ghi_chu'    => $item->NoiDung ?? 'Không có'
                ];
            })->toArray()
        ];
    }

    private function thucHienThemVaoGioHang($tenCumSan, $tenSanBong, $ngayDa, $danhSachGio, $gioHang)
    {
        if (!$tenCumSan || !$tenSanBong || !$ngayDa || empty($danhSachGio)) {
            return ['gemini_text' => ['trang_thai' => 'loi', 'thong_bao' => 'Cần cung cấp đủ tên cụm sân, tên sân, ngày và giờ.']];
        }

        $sanBong = SanBong::join('CumSan', 'SanBong.MaCumSan', '=', 'CumSan.MaCumSan')
            ->where('CumSan.TenCumSan', 'LIKE', '%' . trim($tenCumSan) . '%')
            ->where('SanBong.TenSan', 'LIKE', '%' . trim($tenSanBong) . '%')
            ->where('CumSan.TrangThai', 'HoatDong')
            ->select('SanBong.*', 'CumSan.TenCumSan', 'CumSan.MaCumSan as CumSanID', 'CumSan.GioMoCua', 'CumSan.GioDongCua')
            ->first();

        if (!$sanBong || $sanBong->TrangThai === 'BaoTri') {
            return ['gemini_text' => ['trang_thai' => 'loi', 'thong_bao' => 'Sân không tồn tại hoặc đang bảo trì.']];
        }

        $ngayDaFormat = date('Y-m-d', strtotime($ngayDa));
        $dateStr = date('d/m/Y', strtotime($ngayDa));

        $thongBaoKetQua = [];
        $newSlots = [];

        foreach ($danhSachGio as $g) {
            preg_match('/(\d{1,2})(?:h|:)?(\d{2})?/i', trim($g), $matches);
            if (empty($matches[1])) {
                $thongBaoKetQua[] = "Giờ $g không hợp lệ.";
                continue;
            }
            $hour = str_pad($matches[1], 2, '0', STR_PAD_LEFT);
            $minute = !empty($matches[2]) ? str_pad($matches[2], 2, '0', STR_PAD_LEFT) : '00';

            if ($minute !== '00') {
                $thongBaoKetQua[] = "Giờ {$g} bị từ chối vì hệ thống chỉ cho thuê chẵn từng tiếng (VD: 17:00), không hỗ trợ giờ lẻ hay 1.5 tiếng.";
                continue;
            }
            $gioBatDau = "$hour:$minute:00";

            $khungGio = KhungGio::where('GioBatDau', $gioBatDau)->first();
            if (!$khungGio || $khungGio->GioBatDau < $sanBong->GioMoCua || $khungGio->GioKetThuc > $sanBong->GioDongCua) {
                $thongBaoKetQua[] = "Khung giờ $gioBatDau ngoài giờ hoạt động.";
                continue;
            }

            $giaTien = GiaTien::where('MaCumSan', $sanBong->CumSanID)->where('MaLoaiSan', $sanBong->MaLoaiSan)->where('MaKhungGio', $khungGio->MaKhungGio)->first();
            if (!$giaTien || $giaTien->SoTien <= 0) {
                $thongBaoKetQua[] = "Khung giờ $gioBatDau đang ngừng kinh doanh.";
                continue;
            }

            $daDat = DatSan::where('MaSanBong', $sanBong->MaSanBong)->where('MaKhungGio', $khungGio->MaKhungGio)->where('NgayDa', $ngayDaFormat)->where('TrangThai', '!=', 'DaHuy')->first();
            if ($daDat) {
                $thongBaoKetQua[] = "Khung giờ $gioBatDau đã có người đặt.";
                continue;
            }

            if (strtotime($ngayDaFormat . ' ' . $gioBatDau) <= time()) {
                $thongBaoKetQua[] = "Khung giờ $gioBatDau đã qua giờ thi đấu.";
                continue;
            }

            $timeStr = substr($khungGio->GioBatDau, 0, 5) . ' - ' . substr($khungGio->GioKetThuc, 0, 5);
            $slotId = "{$sanBong->TenCumSan}-{$sanBong->TenSan}-{$dateStr}-{$timeStr}";

            $isAlreadyInCart = false;
            foreach ($gioHang as $item) {
                if (isset($item['id']) && $item['id'] === $slotId) {
                    $isAlreadyInCart = true;
                    break;
                }
            }

            if ($isAlreadyInCart) {
                $thongBaoKetQua[] = "Khung giờ $timeStr đã có sẵn trong giỏ hàng.";
            } else {
                $newSlots[] = [
                    'id'          => $slotId,
                    'clusterId'   => $sanBong->CumSanID,
                    'clusterName' => $sanBong->TenCumSan,
                    'pitchId'     => $sanBong->MaSanBong,
                    'pitchName'   => $sanBong->TenSan,
                    'date'        => $dateStr,
                    'time'        => $timeStr,
                    'price'       => $giaTien->SoTien
                ];
                $thongBaoKetQua[] = "Khung giờ $timeStr hợp lệ có thể thêm vào giỏ.";
            }
        }

        if (empty($newSlots)) {
            return [
                'gemini_text' => [
                    'trang_thai' => 'khong_co_slot_moi',
                    'thong_bao'  => implode(" ", $thongBaoKetQua) . " Hãy báo cho khách hàng biết tình trạng này."
                ]
            ];
        }

        if (!empty($gioHang)) {
            return [
                'gemini_text' => [
                    'trang_thai' => 'can_xac_nhan',
                    'thong_bao'  => implode(" ", $thongBaoKetQua) . " Tuy nhiên, giỏ hàng của khách ĐANG CÓ SẴN sân khác. Hệ thống đã hiển thị 2 nút (Thêm mới / Thêm vào) trên màn hình. Hãy nói với khách vui lòng click chọn trên màn hình để xác nhận."
                ],
                'client_action' => [
                    'type'    => 'PROMPT_CART_CHOICE',
                    'payload' => $newSlots
                ]
            ];
        }

        return [
            'gemini_text' => [
                'trang_thai' => 'thanh_cong',
                'thong_bao'  => implode(" ", $thongBaoKetQua) . " Đã tự động thêm thành công vào giỏ hàng trống. Hãy báo khách kiểm tra giỏ hàng."
            ],
            'client_action' => [
                'type'    => 'ADD_TO_CART',
                'payload' => $newSlots
            ]
        ];
    }

    public function nhanTinNhanAdmin(Request $request)
    {
        $request->validate([
            'noi_dung'      => 'required|string',
            'id_phien_chat' => 'nullable|string'
        ]);

        $noiDung = $request->input('noi_dung');
        $idPhienChat = $request->input('id_phien_chat');

        $user = NguoiDung::find(Auth::id() ?? $request->user()->MaNguoiDung);

        if (!$user || !in_array($user->VaiTro, ['Admin', 'QuanLySan'])) {
            return response()->json([
                'success' => false,
                'message' => 'Lỗi phân quyền: Chỉ Ban quản trị mới được phép sử dụng Trợ lý này!'
            ], 403);
        }

        $maCumSan = ($user->VaiTro === 'QuanLySan') ? $user->MaCumSan : null;

        if (!$idPhienChat) {
            $phienChat = PhienChat::create([
                'MaNguoiDung' => $user->MaNguoiDung,
                'TieuDe'      => mb_substr($noiDung, 0, 40) . '...',
            ]);
            $idPhienChat = $phienChat->MaPhienChat;
        } else {
            $phienChat = PhienChat::findOrFail($idPhienChat);
        }

        TinNhan::create([
            'MaPhienChat' => $idPhienChat,
            'NguoiGui'    => 'User',
            'NoiDung'     => $noiDung,
        ]);

        $lichSuChat = TinNhan::where('MaPhienChat', $idPhienChat)->orderBy('NgayTao', 'asc')->get();
        $contents = [];
        foreach ($lichSuChat as $tinNhan) {
            $contents[] = [
                'role'  => $tinNhan->NguoiGui === 'User' ? 'user' : 'model',
                'parts' => [['text' => $tinNhan->NoiDung]]
            ];
        }

        $mieuTaKiemTraYeuCau = 'Kiểm tra xem hệ thống đang có bao nhiêu yêu cầu đang ở trạng thái "Chờ duyệt" (bao gồm: Giải đấu, Hủy sân gấp).';

        $tools = [
            [
                'functionDeclarations' => [
                    [
                        'name' => 'thongKeTongQuan',
                        'description' => 'Lấy số liệu thống kê hệ thống (số lượng trận đấu, doanh thu cọc) theo một khoảng thời gian. NẾU LÀ 1 NGÀY CỤ THỂ, tu_ngay và den_ngay phải GIỐNG NHAU.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'tu_ngay'  => ['type' => 'STRING', 'description' => 'Ngày bắt đầu thống kê (định dạng YYYY-MM-DD).'],
                                'den_ngay' => ['type' => 'STRING', 'description' => 'Ngày kết thúc thống kê (định dạng YYYY-MM-DD).']
                            ],
                            'required' => ['tu_ngay', 'den_ngay']
                        ]
                    ],
                    [
                        'name' => 'kiemTraYeuCauChoDuyet',
                        'description' => $mieuTaKiemTraYeuCau
                    ],
                    [
                        'name' => 'traCuuGiaiDauSapToi',
                        'description' => 'Kiểm tra xem hiện tại và sắp tới hệ thống có đang tổ chức giải đấu nào không.'
                    ],
                    [
                        'name' => 'traCuuDanhSachTranDau',
                        'description' => 'Lấy danh sách chi tiết TỪNG TRẬN ĐẤU (ai đá, sân nào, giờ nào, đá giải hay phong trào) diễn ra trong một khoảng thời gian cụ thể.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'tu_ngay'  => ['type' => 'STRING', 'description' => 'Ngày bắt đầu (định dạng YYYY-MM-DD).'],
                                'den_ngay' => ['type' => 'STRING', 'description' => 'Ngày kết thúc (định dạng YYYY-MM-DD).']
                            ],
                            'required' => ['tu_ngay', 'den_ngay']
                        ]
                    ],
                    [
                        'name' => 'kiemTraLichTrong',
                        'description' => 'Kiểm tra xem một sân bóng cụ thể tại một ngày cụ thể còn những khung giờ nào trống.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'ten_cum_san'   => ['type' => 'STRING', 'description' => 'Tên cụm sân (VD: Đa Phước, Tuyên Sơn)'],
                                'ten_san_bong'  => ['type' => 'STRING', 'description' => 'Tên sân con cụ thể (VD: Sân 1, Sân 2)'],
                                'ngay_da'       => ['type' => 'STRING', 'description' => 'Định dạng YYYY-MM-DD.'],
                                'danh_sach_gio' => ['type' => 'ARRAY', 'items' => ['type' => 'STRING'], 'description' => 'Danh sách số giờ.']
                            ],
                            'required' => ['ten_cum_san', 'ten_san_bong', 'ngay_da']
                        ]
                    ]
                ]
            ]
        ];

        $homNay = date('d/m/Y');

        if ($user->VaiTro === 'Admin') {
            $danhXung = "Admin hoặc Sếp";
            $cauLenhBaoMat = "Bạn đang phục vụ Admin, nên bạn ĐƯỢC PHÉP xem và báo cáo mọi thông tin nội bộ trên toàn hệ thống.";
        } else {
            $cumSan = CumSan::find($maCumSan);
            $tenCumSan = $cumSan ? $cumSan->TenCumSan : 'cơ sở của bạn';
            $danhXung = "Quản lý";
            $cauLenhBaoMat = "BẢO MẬT NGHIÊM NGẶT: Bạn là AI Trợ lý dành riêng cho Quản lý của cụm sân {$tenCumSan}. Bạn CHỈ ĐƯỢC PHÉP báo cáo số liệu thuộc cụm sân này. TUYỆT ĐỐI TỪ CHỐI KHÉO LÉO nếu bị hỏi về cụm sân khác.";
        }

        $payload = [
            'contents' => $contents,
            'tools' => $tools,
            'systemInstruction' => [
                'parts' => [
                    [
                        'text' => "Bạn là AI Trợ lý cấp cao của hệ thống DN FOOTBALL. (HÔM NAY LÀ: {$homNay}).
                        
                        Quy tắc làm việc:
                        1. Xưng hô là 'tôi' hoặc 'trợ lý', gọi người dùng là '{$danhXung}'.
                        2. {$cauLenhBaoMat}
                        3. GIỚI HẠN QUYỀN HẠN: Bạn là trợ lý 'Chỉ Đọc' (Read-only).
                        4. Báo cáo số liệu tài chính luôn phải có định dạng VNĐ (VD: 1.500.000đ)."
                    ]
                ]
            ]
        ];

        try {
            $geminiResponse = $this->callGeminiWithKeyRotation($payload);
            $parts = $geminiResponse['candidates'][0]['content']['parts'] ?? [];

            $botReply = '';
            $functionCall = null;
            $modelText = '';

            foreach ($parts as $key => $part) {
                if (isset($part['functionCall'])) {
                    $functionCall = $part['functionCall'];
                    if (empty($parts[$key]['functionCall']['args'])) {
                        $parts[$key]['functionCall']['args'] = new \stdClass();
                    }
                } elseif (isset($part['text'])) {
                    $modelText .= $part['text'];
                }
            }

            if ($functionCall) {
                $functionName = $functionCall['name'];
                $arguments = $functionCall['args'] ?? [];
                $functionResult = null;

                if ($functionName === 'thongKeTongQuan') {
                    $functionResult = $this->thucHienThongKeTongQuan(
                        $arguments['tu_ngay'] ?? date('Y-m-d'),
                        $arguments['den_ngay'] ?? date('Y-m-d'),
                        $maCumSan
                    );
                } elseif ($functionName === 'kiemTraYeuCauChoDuyet') {
                    $functionResult = $this->thucHienKiemTraYeuCauChoDuyet($maCumSan);
                } elseif ($functionName === 'traCuuGiaiDauSapToi') {
                    $functionResult = $this->thucHienTraCuuGiaiDauSapToi($maCumSan);
                } elseif ($functionName === 'traCuuDanhSachTranDau') {
                    $functionResult = $this->thucHienTraCuuDanhSachTranDau(
                        $arguments['tu_ngay'] ?? date('Y-m-d'),
                        $arguments['den_ngay'] ?? date('Y-m-d'),
                        $maCumSan
                    );
                } elseif ($functionName === 'kiemTraLichTrong') {
                    $functionResult = $this->thucHienKiemTraLichTrong(
                        $arguments['ten_cum_san'] ?? '',
                        $arguments['ten_san_bong'] ?? '',
                        $arguments['ngay_da'] ?? '',
                        $arguments['danh_sach_gio'] ?? []
                    );
                }

                $contents[] = ['role' => 'model', 'parts' => $parts];
                $contents[] = [
                    'role'  => 'user',
                    'parts' => [['functionResponse' => ['name' => $functionName, 'response' => ['name' => $functionName, 'content' => $functionResult]]]]
                ];

                $payload['contents'] = $contents;
                $secondResponse = $this->callGeminiWithKeyRotation($payload);

                $secondParts = $secondResponse['candidates'][0]['content']['parts'] ?? [];
                foreach ($secondParts as $p) {
                    if (isset($p['text'])) $botReply .= $p['text'];
                }
                if (empty($botReply)) $botReply = 'Lỗi tổng hợp dữ liệu báo cáo.';
            } else {
                $botReply = $modelText ?: 'Xin lỗi, tôi chưa hiểu ý.';
            }

            TinNhan::create([
                'MaPhienChat' => $idPhienChat,
                'NguoiGui'    => 'Bot',
                'NoiDung'     => $botReply,
            ]);
            $phienChat->touch();

            return response()->json([
                'success'       => true,
                'id_phien_chat' => $idPhienChat,
                'reply'         => $botReply
            ]);

        } catch (\Exception $e) {
            Log::error('Lỗi Gemini API Admin: ' . $e->getMessage());
            TinNhan::where('MaPhienChat', $idPhienChat)->where('NguoiGui', 'User')->orderBy('NgayTao', 'desc')->first()?->delete();
            return response()->json(['success' => false, 'message' => 'Lỗi kết nối AI.'], 500);
        }
    }

    private function thucHienThongKeTongQuan($tuNgay, $denNgay, $maCumSan = null)
    {
        try {
            $query = DatSan::whereDate('NgayDa', '>=', $tuNgay)
                ->whereDate('NgayDa', '<=', $denNgay)
                ->whereIn('TrangThai', ['DaCoc', 'HoanThanh', 'KhongDen']);

            if ($maCumSan) {
                $query->whereHas('sanBong', function($q) use ($maCumSan) {
                    $q->where('MaCumSan', $maCumSan);
                });
            }

            $soTranDau = (clone $query)->count();
            $doanhThuCoc = (clone $query)->sum('TienCoc');

            $khoangThoiGian = ($tuNgay === $denNgay)
                ? date('d/m/Y', strtotime($tuNgay))
                : date('d/m/Y', strtotime($tuNgay)) . ' đến ' . date('d/m/Y', strtotime($denNgay));

            return [
                'trang_thai' => 'thanh_cong',
                'du_lieu'    => [
                    'thoi_gian_thong_ke' => $khoangThoiGian,
                    'tong_so_tran_dau'   => $soTranDau . ' trận',
                    'doanh_thu_coc'      => number_format($doanhThuCoc, 0, ',', '.') . ' VNĐ'
                ]
            ];
        } catch (\Exception $e) {
            return ['trang_thai' => 'loi', 'thong_bao' => 'Lỗi truy xuất cơ sở dữ liệu.'];
        }
    }

    private function thucHienKiemTraYeuCauChoDuyet($maCumSan = null)
    {
        try {
            $qGiaiDau = GiaiDau::where('TrangThai', 'ChoDuyet');
            if ($maCumSan) $qGiaiDau->where('MaCumSan', $maCumSan);
            $giaiDauChoDuyet = $qGiaiDau->count();

            $qHuySan = YeuCauHuyGap::join('DatSan', 'YeuCauHuyGap.MaDatSan', '=', 'DatSan.MaDatSan')
                ->join('SanBong', 'DatSan.MaSanBong', '=', 'SanBong.MaSanBong')
                ->where('YeuCauHuyGap.TrangThai', 'ChoDuyet');
            if ($maCumSan) $qHuySan->where('SanBong.MaCumSan', $maCumSan);
            $huySanChoDuyet = $qHuySan->count();

            $tongChoDuyet = $giaiDauChoDuyet + $huySanChoDuyet;

            return [
                'trang_thai' => 'thanh_cong',
                'du_lieu'    => [
                    'tong_yeu_cau_cho_duyet' => $tongChoDuyet . ' đơn',
                    'chi_tiet'               => [
                        'giai_dau_cho_duyet'    => $giaiDauChoDuyet . ' đơn',
                        'huy_san_gap_cho_duyet' => $huySanChoDuyet . ' đơn'
                    ]
                ]
            ];
        } catch (\Exception $e) {
            return ['trang_thai' => 'loi', 'thong_bao' => 'Lỗi truy xuất cơ sở dữ liệu.'];
        }
    }

    private function thucHienTraCuuGiaiDauSapToi($maCumSan = null)
    {
        $homNay = date('Y-m-d');
        try {
            $query = GiaiDau::where('NgayKetThuc', '>=', $homNay)
                ->where('TrangThai', 'HetHan')
                ->whereIn('MaGiaiDau', function($query) {
                    $query->select('MaGiaiDau')
                          ->from('DatSan')
                          ->whereNotNull('MaGiaiDau')
                          ->where('TrangThai', 'DaCoc');
                });

            if ($maCumSan) $query->where('MaCumSan', $maCumSan);

            $giaiDau = $query->orderBy('NgayBatDau', 'asc')->get(['TenGiaiDau', 'NgayBatDau', 'NgayKetThuc', 'TrangThai']);

            if ($giaiDau->isEmpty()) {
                return ['trang_thai' => 'trong', 'thong_bao' => 'Không có giải đấu nào đang được tổ chức.'];
            }

            return [
                'trang_thai'   => 'thanh_cong',
                'tong_so_giai' => $giaiDau->count(),
                'danh_sach'    => $giaiDau->map(function ($item) {
                    return [
                        'ten_giai'  => $item->TenGiaiDau,
                        'thoi_gian' => date('d/m/Y', strtotime($item->NgayBatDau)) . ' đến ' . date('d/m/Y', strtotime($item->NgayKetThuc)),
                    ];
                })->toArray()
            ];
        } catch (\Exception $e) {
            return ['trang_thai' => 'loi', 'thong_bao' => 'Lỗi truy xuất cơ sở dữ liệu.'];
        }
    }

    private function thucHienTraCuuDanhSachTranDau($tuNgay, $denNgay, $maCumSan = null)
    {
        try {
            $query = DatSan::whereDate('DatSan.NgayDa', '>=', $tuNgay)
                ->whereDate('DatSan.NgayDa', '<=', $denNgay)
                ->whereIn('DatSan.TrangThai', ['DaCoc', 'HoanThanh', 'KhongDen'])
                ->leftJoin('NguoiDung', 'DatSan.MaNguoiDung', '=', 'NguoiDung.MaNguoiDung')
                ->join('SanBong', 'DatSan.MaSanBong', '=', 'SanBong.MaSanBong')
                ->join('CumSan', 'SanBong.MaCumSan', '=', 'CumSan.MaCumSan')
                ->join('KhungGio', 'DatSan.MaKhungGio', '=', 'KhungGio.MaKhungGio')
                ->leftJoin('GiaiDau', 'DatSan.MaGiaiDau', '=', 'GiaiDau.MaGiaiDau');

            if ($maCumSan) {
                $query->where('CumSan.MaCumSan', $maCumSan);
            }

            $danhSach = $query->select([
                    'DatSan.NgayDa',
                    'DatSan.TenKhachVangLai',
                    'KhungGio.GioBatDau',
                    'KhungGio.GioKetThuc',
                    'NguoiDung.HoTen as TenKhach',
                    'SanBong.TenSan',
                    'CumSan.TenCumSan',
                    'DatSan.MaGiaiDau',
                    'GiaiDau.TenGiaiDau'
                ])
                ->orderBy('DatSan.NgayDa', 'asc')
                ->orderBy('KhungGio.GioBatDau', 'asc')
                ->limit(30)
                ->get();

            $khoangThoiGian = ($tuNgay === $denNgay)
                ? date('d/m/Y', strtotime($tuNgay))
                : date('d/m/Y', strtotime($tuNgay)) . ' đến ' . date('d/m/Y', strtotime($denNgay));

            if ($danhSach->isEmpty()) {
                return ['trang_thai' => 'trong', 'thong_bao' => "Không có lịch đặt sân nào trong thời gian $khoangThoiGian."];
            }

            return [
                'trang_thai'   => 'thanh_cong',
                'thoi_gian'    => $khoangThoiGian,
                'tong_so_tran' => $danhSach->count(),
                'danh_sach'    => $danhSach->map(function ($item) {
                    $loaiHinhDa = is_null($item->MaGiaiDau) ? 'Đá phong trào' : 'Đá giải (' . $item->TenGiaiDau . ')';
                    return [
                        'ngay_da'    => date('d/m/Y', strtotime($item->NgayDa)),
                        'gio_da'     => substr($item->GioBatDau, 0, 5) . '-' . substr($item->GioKetThuc, 0, 5),
                        'khach_hang' => $item->TenKhach ?? ($item->TenKhachVangLai . ' (Vãng lai)'),
                        'san_bong'   => $item->TenSan . ' (' . $item->TenCumSan . ')',
                        'loai_hinh'  => $loaiHinhDa
                    ];
                })->toArray()
            ];
        } catch (\Exception $e) {
            return ['trang_thai' => 'loi', 'thong_bao' => 'Lỗi truy xuất cơ sở dữ liệu.'];
        }
    }
}