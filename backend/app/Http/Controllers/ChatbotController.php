<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use App\Services\ChromaDBService;
use App\Models\PhienChat;
use App\Models\TinNhan;
use App\Models\NguoiDung;
use App\Models\CumSan;
use App\Models\GiaTien;
use App\Models\SanBong;
use App\Models\KhungGio;
use App\Models\DatSan;
use App\Models\GiaiDau;
use App\Models\GiaoDich;
use App\Models\KhuyenMai;
use App\Models\DanhGia;

class ChatbotController extends Controller
{
    public function nhanTinNhan(Request $request)
    {
        $request->validate([
            'noi_dung'      => 'required|string',
            'id_phien_chat' => 'nullable|string',
            'gio_hang'      => 'nullable|array'
        ]);

        $noiDung = $request->input('noi_dung');
        $idPhienChat = $request->input('id_phien_chat');
        $gioHang = $request->input('gio_hang', []);

        $user = NguoiDung::find(Auth::id() ?? $request->user()?->MaNguoiDung);

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Phiên đăng nhập đã hết hạn, vui lòng tải lại trang!'
            ], 401);
        }

        if ($user->VaiTro !== 'KhachHang') {
            return response()->json([
                'success' => false,
                'message' => 'Trợ lý ảo Chatbot hiện chỉ dành riêng cho tài khoản Khách hàng!'
            ], 403);
        }

        if (!$idPhienChat) {
            $phienChat = PhienChat::create([
                'MaNguoiDung' => $user->MaNguoiDung,
                'TieuDe'      => mb_substr($noiDung, 0, 40) . '...',
            ]);
            $idPhienChat = $phienChat->MaPhienChat;
        } else {
            $phienChat = PhienChat::where('MaPhienChat', $idPhienChat)
                ->where('MaNguoiDung', $user->MaNguoiDung)
                ->firstOrFail();
        }

        TinNhan::create([
            'MaPhienChat' => $idPhienChat,
            'NguoiGui'    => 'User',
            'NoiDung'     => $noiDung,
        ]);

        $lichSuChat = TinNhan::where('MaPhienChat', $idPhienChat)
            ->orderBy('NgayTao', 'asc')
            ->get();

        $contents = [];
        foreach ($lichSuChat as $tinNhan) {
            $contents[] = [
                'role'  => $tinNhan->NguoiGui === 'User' ? 'user' : 'model',
                'parts' => [['text' => $tinNhan->NoiDung]]
            ];
        }

        $tools = [
            [
                'functionDeclarations' => [
                    [
                        'name' => 'traCuuQuyDinhHeThong',
                        'description' => 'Tìm kiếm và tra cứu các quy định, chính sách, hướng dẫn sử dụng của hệ thống DN FOOTBALL (ví dụ: luật hủy sân, hủy sân gấp, dời lịch đặt sân, hoàn tiền cọc, nạp tiền, rút tiền, thuế VAT 8%, hóa đơn, mã khuyến mãi voucher, tạo giải đấu, đặt cọc, thời tiết mưa bão, đổi/quên mật khẩu, đánh giá sân...).',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'tu_khoa' => [
                                    'type' => 'STRING',
                                    'description' => 'Từ khóa tìm kiếm quy định (VD: "hướng dẫn dời lịch đặt sân", "cách áp mã khuyến mãi", "quy định hủy sân gấp"). QUAN TRỌNG: Nếu khách nói những câu tiếp nối ngắn gọn như "hướng dẫn tôi", "làm thế nào", "ở đâu", bạn PHẢI tự ghép thêm ngữ cảnh của câu trước đó để tạo thành từ khóa tra cứu đầy đủ.'
                                ]
                            ],
                            'required' => ['tu_khoa']
                        ]
                    ],
                    [
                        'name' => 'traCuuGiaTien',
                        'description' => 'Tra cứu bảng giá thuê sân bóng theo tên cụm sân, loại sân hoặc một/nhiều khung giờ cụ thể.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'ten_cum_san' => ['type' => 'STRING', 'description' => 'Tên hoặc từ khóa tên cụm sân bóng (VD: Đa Phước, An Phúc). Chú ý lấy lại tên cụm sân từ câu hỏi trước nếu khách đang hỏi nối tiếp.'],
                                'ten_loai_san' => ['type' => 'STRING', 'description' => 'Loại sân bóng (VD: Sân 5, Sân 7, Sân 11). Chú ý lấy lại loại sân từ câu hỏi trước nếu khách đang hỏi nối tiếp.'],
                                'gio_da' => ['type' => 'STRING', 'description' => 'Giờ bắt đầu đá nếu khách chỉ hỏi 1 giờ đơn lẻ (VD: "15:00", "17:30"). Nếu khách hỏi khoảng giờ (từ Xh đến Yh), hãy để trống trường này và dùng danh_sach_gio.'],
                                'danh_sach_gio' => [
                                    'type' => 'ARRAY',
                                    'items' => ['type' => 'STRING'],
                                    'description' => 'Danh sách các giờ bắt đầu cần tra cứu giá. ĐẶC BIỆT LƯU Ý: Nếu khách hỏi 1 KHOẢNG thời gian (VD: "từ 17h đến 20h"), BẮT BUỘC liệt kê các giờ bắt đầu ca trong khoảng đó (VD: ["17:00", "18:00", "19:00"]). Nếu khách hỏi giờ lẻ như "17h30", truyền ["17:30"].'
                                ]
                            ]
                        ]
                    ],
                    [
                        'name' => 'traCuuDanhSachCumSan',
                        'description' => 'Tra cứu danh sách tất cả các cụm sân bóng hiện đang hoạt động kèm địa chỉ, khu vực (phường/xã), giờ mở/đóng cửa và điểm đánh giá sao trung bình.'
                    ],
                    [
                        'name' => 'traCuuChiTietCumSan',
                        'description' => 'Tra cứu chi tiết thông tin của một cụm sân cụ thể, bao gồm: giờ mở/đóng cửa, địa chỉ, điểm đánh giá và danh sách các sân bóng con (sân 5, sân 7, diện tích, kích thước, mô tả...).',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'ten_cum_san' => ['type' => 'STRING', 'description' => 'Tên hoặc từ khóa của cụm sân cần xem chi tiết (ví dụ: Đa Phước, An Phúc...)']
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
                                'ten_cum_san' => ['type' => 'STRING', 'description' => 'Tên cụm sân (VD: Đa Phước, An Phúc)'],
                                'ten_san_bong' => ['type' => 'STRING', 'description' => 'Tên sân con cụ thể (VD: Sân 1, Sân 2)'],
                                'ngay_da' => ['type' => 'STRING', 'description' => 'Ngày khách muốn đá, bắt buộc định dạng YYYY-MM-DD. Hãy tự suy luận năm dựa vào thời gian hiện tại nếu khách chỉ nói ngày/tháng.'],
                                'gio_da' => ['type' => 'STRING', 'description' => 'Giờ bắt đầu đá nếu chỉ hỏi 1 giờ (VD: "15:00", "17:30").'],
                                'danh_sach_gio' => [
                                    'type' => 'ARRAY',
                                    'items' => ['type' => 'STRING'],
                                    'description' => 'Danh sách giờ khách muốn kiểm tra. Nếu khách hỏi 1 KHOẢNG thời gian (VD: "từ 17h đến 20h"), liệt kê các giờ bắt đầu ca (VD: ["17:00", "18:00", "19:00"]). Nếu khách hỏi giờ lẻ như "17h30", truyền ["17:30"] để hệ thống báo lỗi giờ lẻ.'
                                ]
                            ],
                            'required' => ['ten_cum_san', 'ten_san_bong', 'ngay_da']
                        ]
                    ],
                    [
                        'name' => 'traCuuKhuyenMaiKhaDung',
                        'description' => 'Tra cứu danh sách các chương trình khuyến mãi (mã giảm giá / voucher) đang có hiệu lực dành cho khách hàng (bao gồm mã Toàn hệ thống, mã theo Cụm sân và mã tặng riêng cá nhân).'
                    ],
                    [
                        'name' => 'traCuuDanhGiaCumSan',
                        'description' => 'Tra cứu điểm đánh giá sao trung bình và các nhận xét, bình luận của khách hàng về một cụm sân cụ thể.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'ten_cum_san' => ['type' => 'STRING', 'description' => 'Tên cụm sân cần xem đánh giá (VD: Đa Phước, An Phúc)']
                            ],
                            'required' => ['ten_cum_san']
                        ]
                    ],
                    [
                        'name' => 'traCuuLichSuDatSan',
                        'description' => 'Tra cứu danh sách các lịch đặt sân SẮP TỚI (từ hôm nay trở đi) và ĐANG Ở TRẠNG THÁI ĐÃ CỌC của chính khách hàng này (kèm mã vé #PT-..., #GD-... và mã hóa đơn).'
                    ],
                    [
                        'name' => 'traCuuLichSuGiaoDich',
                        'description' => 'Tra cứu số dư ví hiện tại và 5 lịch sử giao dịch gần nhất (nạp tiền, thanh toán cọc, hoàn tiền, rút tiền...) của chính khách hàng.'
                    ],
                    [
                        'name' => 'traCuuGiaiDauCaNhan',
                        'description' => 'Tra cứu danh sách và trạng thái các giải đấu (Chờ duyệt, Đã duyệt chờ đặt sân, Đã đặt lịch sân, Hoàn thành, Từ chối...) do chính khách hàng tạo ra.'
                    ],
                    [
                        'name' => 'themVaoGioHang',
                        'description' => 'Thực hiện việc thêm lịch sân vào giỏ hàng ngay khi khách hàng yêu cầu đặt sân. BẮT BUỘC phải hỏi và thu thập đủ 4 thông tin (cụm sân, sân con, ngày, giờ) trước khi gọi hàm này.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'ten_cum_san' => ['type' => 'STRING', 'description' => 'Tên cụm sân (VD: Đa Phước)'],
                                'ten_san_bong' => ['type' => 'STRING', 'description' => 'Tên sân con (VD: Sân 1, Sân 2)'],
                                'ngay_da' => ['type' => 'STRING', 'description' => 'Định dạng YYYY-MM-DD'],
                                'danh_sach_gio' => [
                                    'type' => 'ARRAY',
                                    'items' => ['type' => 'STRING'],
                                    'description' => 'Danh sách giờ bắt đầu của các ca muốn đặt. Ví dụ khách đặt "từ 17h đến 19h" (2 tiếng) thì gửi ["17:00", "18:00"]. Nếu khách nói giờ lẻ như "17h30", gửi ["17:30"].'
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
                        'text' => "Bạn là trợ lý ảo CSKH chuyên nghiệp, thân thiện và nhiệt tình của hệ thống sân bóng đá mini 'DN FOOTBALL' tại thành phố Đà Nẵng. (HÔM NAY LÀ: {$homNay}).

                        Quy tắc giao tiếp của bạn:
                        1. Xưng hô là 'mình' hoặc 'trợ lý DN', gọi khách hàng là 'bạn' hoặc 'anh/chị' (Tên khách hàng hiện tại là: {$user->HoTen}).
                        2. BẢO MẬT TUYỆT ĐỐI (QUAN TRỌNG): 
                           - Không bao giờ tiết lộ thông tin cá nhân (tên, SĐT, ID...) của người khác đã đặt sân.
                           - Tuyệt đối từ chối nếu khách hàng yêu cầu kiểm tra giao dịch, số dư hoặc giải đấu của người khác. BẠN CHỈ ĐƯỢC PHÉP trả lời thông tin giao dịch/lịch đặt/giải đấu của CHÍNH KHÁCH HÀNG đang trò chuyện (dựa vào tool đã cung cấp).
                        3. Trả lời ngắn gọn, súc tích, xuống dòng rõ ràng, dùng emoji hợp lý. Nếu câu hỏi không liên quan đến bóng đá hoặc hệ thống sân DN FOOTBALL thì từ chối khéo léo.
                        4. LUẬT CẤM BỊA ĐẶT (RẤT QUAN TRỌNG): 
                           - Tuyệt đối KHÔNG tự bịa đặt dữ liệu sân bãi, giá tiền hay mã khuyến mãi.
                           - Tuyệt đối KHÔNG tự bịa đặt các bước thao tác trên website. Mọi hướng dẫn cách làm (nạp/rút tiền, dời lịch, hủy sân, áp voucher, tạo giải, đổi mật khẩu...) BẮT BUỘC phải lấy từ kết quả của tool `traCuuQuyDinhHeThong`.
                        5. CÁCH SỬ DỤNG TOOL CHUẨN XÁC:
                           - Khách hỏi CÁCH THỨC, HƯỚNG DẪN (nạp tiền, rút tiền, đặt sân, dời lịch, hủy sân, tạo giải, áp mã khuyến mãi, đổi mật khẩu, quên mật khẩu, đánh giá sân) HOẶC hỏi LUẬT, CHÍNH SÁCH (hoàn tiền, thuế VAT 8%, thời tiết) -> BẮT BUỘC gọi `traCuuQuyDinhHeThong`.
                           - Khách hỏi hệ thống có những cụm sân nào, hoặc hỏi sân ở một phường/khu vực -> Gọi `traCuuDanhSachCumSan`.
                           - Khách hỏi giờ mở cửa, địa chỉ, diện tích/kích thước hoặc danh sách các sân con ở 1 cụm sân -> Gọi `traCuuChiTietCumSan`.
                           - Khách hỏi giá tiền thuê sân -> Gọi `traCuuGiaTien` (Lưu ý giữ nguyên ngữ cảnh `ten_cum_san` và `ten_loai_san` ở câu trước nếu khách hỏi nối tiếp).
                           - Khách hỏi lịch trống -> Gọi `kiemTraLichTrong`.
                           - Khách hỏi có mã giảm giá / khuyến mãi / voucher nào không -> Gọi `traCuuKhuyenMaiKhaDung`.
                           - Khách hỏi đánh giá / review của 1 cụm sân -> Gọi `traCuuDanhGiaCumSan`.
                           - Khách hỏi lịch đặt sân sắp tới của mình -> Gọi `traCuuLichSuDatSan`.
                           - Khách hỏi số dư ví hoặc lịch sử giao dịch của mình -> Gọi `traCuuLichSuGiaoDich`.
                           - Khách hỏi về giải đấu của mình -> Gọi `traCuuGiaiDauCaNhan`.
                           - Khách yêu cầu ĐẶT SÂN / THÊM VÀO GIỎ HÀNG -> Gọi `themVaoGioHang`.
                        6. QUY ĐỊNH NGHIÊM NGẶT VỀ THỜI GIAN (CẤM GIỜ LẺ):
                           - Hệ thống CHỈ hỗ trợ các khung giờ chẵn theo từng tiếng (VD: 06:00 - 07:00, 17:00 - 18:00, 18:00 - 19:00, 19:00 - 20:00).
                           - TUYỆT ĐỐI KHÔNG hỗ trợ giờ lẻ (như 17:30, 18h30) và KHÔNG cho phép đặt 1 tiếng rưỡi (1.5h). Nếu khách hỏi giá, kiểm tra lịch hoặc đặt sân vào giờ lẻ (VD: 17h30), hãy trả lời rõ ràng là hệ thống không có khung giờ lẻ đó và gợi ý các khung giờ chẵn liền kề."
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
                $arguments = json_decode(json_encode($functionCall['args'] ?? []), true) ?: [];

                $functionResult = null;
                if ($functionName === 'traCuuQuyDinhHeThong') {
                    $chromaService = app(ChromaDBService::class);
                    $functionResult = $chromaService->timKiemQuyDinh($arguments['tu_khoa'] ?? $noiDung);
                } elseif ($functionName === 'traCuuGiaTien') {
                    $functionResult = $this->thucHienTraCuuGiaTien(
                        $arguments['ten_cum_san'] ?? null,
                        $arguments['ten_loai_san'] ?? null,
                        $arguments['gio_da'] ?? null,
                        $arguments['danh_sach_gio'] ?? []
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
                        $arguments['danh_sach_gio'] ?? [],
                        $arguments['gio_da'] ?? null
                    );
                } elseif ($functionName === 'traCuuKhuyenMaiKhaDung') {
                    $functionResult = $this->thucHienTraCuuKhuyenMaiKhaDung($user->MaNguoiDung);
                } elseif ($functionName === 'traCuuDanhGiaCumSan') {
                    $functionResult = $this->thucHienTraCuuDanhGiaCumSan($arguments['ten_cum_san'] ?? '');
                } elseif ($functionName === 'traCuuLichSuDatSan') {
                    $functionResult = $this->thucHienTraCuuLichSuDatSan($user->MaNguoiDung);
                } elseif ($functionName === 'traCuuLichSuGiaoDich') {
                    $functionResult = $this->thucHienTraCuuLichSuGiaoDich($user);
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
                'message' => 'Máy chủ AI đang bận, bạn vui lòng thử lại sau giây lát nhé!'
            ], 500);
        }
    }

    // Tự động lấy toàn bộ Gemini API Keys từ cả config/services.php lẫn .env (GEMINI_API_KEY_1 -> 20)
    private function getAllGeminiKeys(): array
    {
        $keys = config('services.gemini.keys', []);
        if (!is_array($keys)) {
            $keys = [];
        }

        $envSingle = env('GEMINI_API_KEY');
        if (!empty($envSingle)) {
            $keys[] = trim($envSingle);
        }

        for ($i = 1; $i <= 20; $i++) {
            $k = env("GEMINI_API_KEY_{$i}");
            if (!empty($k)) {
                $keys[] = trim($k);
            }
        }

        return array_values(array_unique(array_filter($keys)));
    }

    // Tự động xoay Key và lưu nhớ Key đang sống vào Cache để không thử lại các Key đã hết quota 429
    private function callGeminiWithKeyRotation($payload)
    {
        $keys = $this->getAllGeminiKeys();

        if (empty($keys)) {
            throw new \Exception('Không tìm thấy GEMINI_API_KEY trong file .env');
        }

        $totalKeys = count($keys);
        $startIndex = (int) Cache::get('gemini_working_key_index', 0);
        if ($startIndex >= $totalKeys) {
            $startIndex = 0;
        }

        for ($attempt = 0; $attempt < $totalKeys; $attempt++) {
            $currentIndex = ($startIndex + $attempt) % $totalKeys;
            $key = $keys[$currentIndex];
            if (empty($key)) continue;

            $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={$key}";
            $response = Http::withoutVerifying()->timeout(20)->post($url, $payload);

            if ($response->successful()) {
                // Lưu lại vị trí Key đang hoạt động tốt để lần gọi kế tiếp dùng ngay lập tức
                if ($currentIndex !== $startIndex) {
                    Cache::put('gemini_working_key_index', $currentIndex, now()->addHours(2));
                }
                return $response->json();
            }

            if (in_array($response->status(), [429, 403]) || $response->status() >= 500) {
                Log::warning("Gemini API Key " . ($currentIndex + 1) . "/{$totalKeys} bị lỗi " . $response->status() . ". Chuyển sang key tiếp theo.");
                continue;
            }

            throw new \Exception("Lỗi từ Gemini: " . $response->body());
        }

        throw new \Exception("Tất cả {$totalKeys} GEMINI_API_KEY đều đã hết hạn ngạch hoặc bị chặn!");
    }

    private function cleanClusterKeyword(?string $tenCumSan): string
    {
        if (empty($tenCumSan)) return '';
        $cleaned = preg_replace('/^(cụm\s+sân\s+bóng|cụm\s+sân|sân\s+bóng|cơ\s+sở)\s+/iu', '', trim($tenCumSan));
        return trim($cleaned ?: $tenCumSan);
    }

    // Hàm dùng chung để bóc tách danh sách giờ & khoảng giờ (VD: "17h đến 20h", ["17:00", "18:00"]) và bắt lỗi giờ lẻ (:30)
    private function parseRequestedHoursInput($gioDa = null, $danhSachGio = [], bool $isRangeInclusive = false): array
    {
        $rawItems = [];
        if (!empty($gioDa)) {
            if (is_string($gioDa) || is_numeric($gioDa)) {
                $rawItems[] = (string) $gioDa;
            } elseif (is_array($gioDa) || is_object($gioDa)) {
                foreach ((array) $gioDa as $gItem) {
                    if (is_scalar($gItem)) $rawItems[] = (string) $gItem;
                }
            }
        }

        if (!empty($danhSachGio)) {
            if (is_string($danhSachGio)) {
                // Phòng trường hợp Gemini truyền chuỗi JSON hoặc chuỗi ngăn cách bằng dấu phẩy "17:00, 18:00, 19:00"
                $decoded = json_decode($danhSachGio, true);
                if (is_array($decoded)) {
                    foreach ($decoded as $dItem) {
                        if (is_scalar($dItem)) $rawItems[] = (string) $dItem;
                    }
                } else {
                    foreach (explode(',', $danhSachGio) as $piece) {
                        $rawItems[] = trim($piece);
                    }
                }
            } elseif (is_array($danhSachGio) || is_object($danhSachGio)) {
                foreach ((array) $danhSachGio as $item) {
                    if (is_scalar($item)) {
                        $rawItems[] = (string) $item;
                    }
                }
            }
        }

        $hours = [];
        foreach ($rawItems as $raw) {
            $str = trim((string) $raw);
            if ($str === '') continue;

            // Trường hợp 1: Chuỗi chứa khoảng giờ (VD: "17:00 - 20:00", "17h đến 20h", "từ 17h tới 20h")
            if (preg_match('/(\d{1,2})(?:h|:)?(\d{2})?\s*(?:-|–|đến|tới|to)\s*(\d{1,2})(?:h|:)?(\d{2})?/iu', $str, $rangeMatches)) {
                $hStart = (int) $rangeMatches[1];
                $mStart = !empty($rangeMatches[2]) ? str_pad($rangeMatches[2], 2, '0', STR_PAD_LEFT) : '00';
                $hEnd = (int) $rangeMatches[3];
                $mEnd = !empty($rangeMatches[4]) ? str_pad($rangeMatches[4], 2, '0', STR_PAD_LEFT) : '00';

                if ($mStart !== '00' || $mEnd !== '00') {
                    return ['has_odd_minute' => true, 'invalid_token' => $str, 'hours' => []];
                }

                if ($hStart < $hEnd) {
                    // Ví dụ "từ 17h đến 20h" -> lấy các ca bắt đầu lúc 17h (17-18), 18h (18-19), 19h (19-20)
                    $limit = $isRangeInclusive ? $hEnd : ($hEnd - 1);
                    for ($h = $hStart; $h <= $limit; $h++) {
                        $hours[] = $h;
                    }
                } else {
                    $hours[] = $hStart;
                }
                continue;
            }

            // Trường hợp 2: Giờ đơn lẻ (VD: "17", "17h", "17:00", "17:00:00", "17h30")
            if (preg_match('/(\d{1,2})(?:h|:)?(\d{2})?/i', $str, $matches)) {
                $hour = (int) $matches[1];
                $minute = !empty($matches[2]) ? str_pad($matches[2], 2, '0', STR_PAD_LEFT) : '00';

                if ($minute !== '00') {
                    return ['has_odd_minute' => true, 'invalid_token' => $str, 'hours' => []];
                }
                $hours[] = $hour;
            }
        }

        $hours = array_values(array_unique($hours));
        sort($hours);

        // Nếu AI gửi ["17:00", "20:00"] cho câu "từ 17h đến 20h", tự động lấp đầy các giờ ở giữa [17, 18, 19]
        if (count($hours) >= 2) {
            $minH = min($hours);
            $maxH = max($hours);
            if ($maxH - $minH <= 8) {
                // Nếu khoảng cách >= 2 mà chỉ có 2 phần tử đầu cuối (VD [17, 20]), lấy từ 17 đến 19 (tức 17:00-20:00)
                if (count($hours) === 2 && ($maxH - $minH) > 1) {
                    $hours = range($minH, $maxH - 1);
                } else {
                    $hours = range($minH, $maxH);
                }
            }
        }

        return ['has_odd_minute' => false, 'invalid_token' => null, 'hours' => $hours];
    }

    public function layDanhSachPhienChat(Request $request)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()?->MaNguoiDung);

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

        $user = NguoiDung::find(Auth::id() ?? $request->user()?->MaNguoiDung);
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
        $user = NguoiDung::find(Auth::id() ?? $request->user()?->MaNguoiDung);
        $phienChat = PhienChat::where('MaPhienChat', $id)->where('MaNguoiDung', $user->MaNguoiDung)->first();

        if (!$phienChat) {
            return response()->json(['success' => false, 'message' => 'Không tìm thấy phiên chat!'], 404);
        }

        $phienChat->delete();

        return response()->json(['success' => true, 'message' => 'Đã xóa phiên chat!']);
    }

    public function layChiTietPhienChat(Request $request, $id)
    {
        $user = NguoiDung::find(Auth::id() ?? $request->user()?->MaNguoiDung);
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

    // =========================================================================
    // CÁC HÀM TOOL PHỤC VỤ KHÁCH HÀNG (CHUẨN HÓA THEO 20 BẢNG MỚI)
    // =========================================================================

    private function thucHienTraCuuGiaTien($tenCumSan = null, $tenLoaiSan = null, $gioDa = null, $danhSachGio = [])
    {
        $parsed = $this->parseRequestedHoursInput($gioDa, $danhSachGio, false);
        if ($parsed['has_odd_minute']) {
            return [
                'trang_thai' => 'loi_gio_le',
                'thong_bao'  => "Hệ thống chỉ có các khung giờ chẵn theo từng tiếng (VD: 17:00 - 18:00, 18:00 - 19:00), không có khung giờ lẻ như {$parsed['invalid_token']}."
            ];
        }

        $buildBaseQuery = function () use ($tenCumSan, $tenLoaiSan) {
            $q = GiaTien::query()
                ->join('CumSan', 'GiaTien.MaCumSan', '=', 'CumSan.MaCumSan')
                ->join('LoaiSan', 'GiaTien.MaLoaiSan', '=', 'LoaiSan.MaLoaiSan')
                ->join('KhungGio', 'GiaTien.MaKhungGio', '=', 'KhungGio.MaKhungGio')
                ->where('CumSan.TrangThai', 'HoatDong')
                ->where('GiaTien.SoTien', '>', 0);

            if (!empty($tenCumSan)) {
                $cleanCum = $this->cleanClusterKeyword($tenCumSan);
                $q->where('CumSan.TenCumSan', 'LIKE', '%' . $cleanCum . '%');
            }

            if (!empty($tenLoaiSan)) {
                if (preg_match('/(\d+)/', (string) $tenLoaiSan, $mLoai)) {
                    $q->where('LoaiSan.TenLoaiSan', 'LIKE', '%' . $mLoai[1] . '%');
                } else {
                    $q->where('LoaiSan.TenLoaiSan', 'LIKE', '%' . trim((string) $tenLoaiSan) . '%');
                }
            }

            return $q;
        };

        $query = $buildBaseQuery();

        // Lọc bằng HOUR() trực tiếp trong MySQL để không bao giờ bị lệch định dạng chuỗi TIME
        if (!empty($parsed['hours'])) {
            $hoursList = array_map('intval', $parsed['hours']);
            $placeholders = implode(',', array_fill(0, count($hoursList), '?'));
            $query->whereRaw("HOUR(KhungGio.GioBatDau) IN ({$placeholders})", $hoursList);
        }

        $danhSachGia = $query->select([
            'CumSan.TenCumSan',
            'LoaiSan.TenLoaiSan',
            'KhungGio.GioBatDau',
            'KhungGio.GioKetThuc',
            'GiaTien.SoTien'
        ])
        ->orderBy('CumSan.TenCumSan')
        ->orderBy('LoaiSan.TenLoaiSan')
        ->orderBy('KhungGio.GioBatDau')
        ->get();

        // FALLBACK THÔNG MINH: Nếu Gemini truyền tham số giờ bị lệch khiến lọc rỗng,
        // tự động lấy toàn bộ bảng giá của cụm sân + loại sân đó để Gemini nhìn thấy và trích xuất đúng giờ khách hỏi!
        if ($danhSachGia->isEmpty() && !empty($parsed['hours'])) {
            $danhSachGia = $buildBaseQuery()->select([
                'CumSan.TenCumSan',
                'LoaiSan.TenLoaiSan',
                'KhungGio.GioBatDau',
                'KhungGio.GioKetThuc',
                'GiaTien.SoTien'
            ])
            ->orderBy('CumSan.TenCumSan')
            ->orderBy('LoaiSan.TenLoaiSan')
            ->orderBy('KhungGio.GioBatDau')
            ->get();
        }

        if ($danhSachGia->isEmpty()) {
            return [
                'trang_thai' => 'khong_tim_thay',
                'thong_bao'  => 'Không tìm thấy thông tin bảng giá phù hợp với yêu cầu.'
            ];
        }

        return [
            'trang_thai'      => 'thanh_cong',
            'tong_so_ket_qua' => $danhSachGia->count(),
            'luu_y_thue'      => 'Đơn giá dưới đây là giá thuê sân gốc (chưa bao gồm thuế VAT 8% trên hóa đơn và chưa trừ mã khuyến mãi nếu có).',
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
                'CumSan.MaCumSan',
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
                $ratingQuery = DanhGia::join('DatSan', 'DanhGia.MaDatSan', '=', 'DatSan.MaDatSan')
                    ->join('SanBong', 'DatSan.MaSanBong', '=', 'SanBong.MaSanBong')
                    ->where('SanBong.MaCumSan', $item->MaCumSan);
                $soDanhGia = (clone $ratingQuery)->count();
                $diemTB = $soDanhGia > 0 ? round((clone $ratingQuery)->avg('DanhGia.SoSao'), 1) : 0;

                return [
                    'ma_cum_san'          => $item->MaCumSan,
                    'ten_cum_san'         => $item->TenCumSan,
                    'dia_chi'             => $item->DiaChi . ', ' . $item->TenPhuong,
                    'khu_vuc'             => $item->TenPhuong,
                    'thoi_gian_hoat_dong' => substr($item->GioMoCua, 0, 5) . ' đến ' . substr($item->GioDongCua, 0, 5),
                    'danh_gia'            => $soDanhGia > 0 ? "{$diemTB}/5.0 sao ({$soDanhGia} lượt đánh giá)" : 'Chưa có đánh giá'
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

        $cleanCum = $this->cleanClusterKeyword($tenCumSan);

        $danhSach = SanBong::query()
            ->join('CumSan', 'SanBong.MaCumSan', '=', 'CumSan.MaCumSan')
            ->join('LoaiSan', 'SanBong.MaLoaiSan', '=', 'LoaiSan.MaLoaiSan')
            ->where('CumSan.TenCumSan', 'LIKE', '%' . ($cleanCum ?: trim($tenCumSan)) . '%')
            ->where('CumSan.TrangThai', 'HoatDong')
            ->select([
                'CumSan.MaCumSan',
                'CumSan.TenCumSan',
                'CumSan.DiaChi',
                'CumSan.GioMoCua',
                'CumSan.GioDongCua',
                'SanBong.MaSanBong',
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
                'thong_bao'  => "Không tìm thấy cụm sân '{$tenCumSan}' hoặc cụm sân này đang bảo trì / chưa có sân con."
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
                    'kich_thuoc' => $item->KichThuoc ?? 'Tiêu chuẩn',
                    'dien_tich'  => $item->DienTich ? (number_format($item->DienTich, 0) . ' m²') : null,
                    'mo_ta'      => $item->MoTa,
                    'trang_thai' => $item->TrangThai === 'HoatDong' ? 'Đang hoạt động' : 'Đang bảo trì'
                ];
            })->toArray()
        ];
    }

    private function thucHienKiemTraLichTrong($tenCumSan, $tenSanBong, $ngayDa, $danhSachGio = [], $gioDa = null)
    {
        if (!$tenCumSan || !$tenSanBong || !$ngayDa) {
            return ['trang_thai' => 'loi', 'thong_bao' => 'Cần cung cấp đủ tên cụm sân, tên sân và ngày đá để kiểm tra.'];
        }

        $parsed = $this->parseRequestedHoursInput($gioDa, $danhSachGio, false);
        if ($parsed['has_odd_minute']) {
            return [
                'trang_thai' => 'loi_khung_gio_le',
                'thong_bao'  => "Hệ thống chỉ hỗ trợ các khung giờ chẵn từng tiếng (VD: 17:00 - 18:00, 18:00 - 19:00). Không có khung giờ lẻ như {$parsed['invalid_token']} hoặc đặt 1.5 tiếng."
            ];
        }

        $cleanCum = trim(str_ireplace(['cụm sân', 'sân bóng'], '', $tenCumSan));

        $sanBong = SanBong::join('CumSan', 'SanBong.MaCumSan', '=', 'CumSan.MaCumSan')
            ->where('CumSan.TenCumSan', 'LIKE', '%' . ($cleanCum ?: trim($tenCumSan)) . '%')
            ->where('SanBong.TenSan', 'LIKE', '%' . trim($tenSanBong) . '%')
            ->where('CumSan.TrangThai', 'HoatDong')
            ->select(
                'SanBong.MaSanBong',
                'SanBong.MaLoaiSan',
                'SanBong.TenSan',
                'SanBong.TrangThai as TrangThaiSan',
                'CumSan.MaCumSan',
                'CumSan.TenCumSan',
                'CumSan.GioMoCua',
                'CumSan.GioDongCua'
            )
            ->first();

        if (!$sanBong) {
            return ['trang_thai' => 'khong_tim_thay_san', 'thong_bao' => "Không tìm thấy sân '{$tenSanBong}' tại cụm '{$tenCumSan}'."];
        }

        if ($sanBong->TrangThaiSan === 'BaoTri') {
            return ['trang_thai' => 'san_bao_tri', 'thong_bao' => "Sân '{$sanBong->TenSan}' thuộc '{$sanBong->TenCumSan}' hiện đang tạm đóng để bảo trì."];
        }

        $ngayDaFormat = date('Y-m-d', strtotime($ngayDa));
        $requestedHours = $parsed['hours'];

        $bangGiaMap = GiaTien::where('MaCumSan', $sanBong->MaCumSan)
            ->where('MaLoaiSan', $sanBong->MaLoaiSan)
            ->where('SoTien', '>', 0)
            ->pluck('SoTien', 'MaKhungGio')
            ->toArray();

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
            if (!isset($bangGiaMap[$kg->MaKhungGio])) {
                continue;
            }

            if (!empty($requestedHours)) {
                $hourKg = (int) date('H', strtotime($kg->GioBatDau));
                if (!in_array($hourKg, $requestedHours)) {
                    continue;
                }
            }

            $gioStr = substr($kg->GioBatDau, 0, 5) . ' - ' . substr($kg->GioKetThuc, 0, 5);
            $giaStr = number_format($bangGiaMap[$kg->MaKhungGio], 0, ',', '.') . 'đ';
            $isBooked = in_array($kg->MaKhungGio, $daDatKhungGioIds);
            $isPast = strtotime($ngayDaFormat . ' ' . $kg->GioBatDau) <= time();

            if ($isPast) {
                $trangThai = "Đã qua giờ (KHÔNG ĐẶT ĐƯỢC)";
            } elseif ($isBooked) {
                $trangThai = "Đã có người đặt (KHÔNG TRỐNG)";
            } else {
                $trangThai = "CÒN TRỐNG (Giá: {$giaStr} - CÓ THỂ ĐẶT)";
            }

            $ketQuaLich[$gioStr] = $trangThai;
        }

        if (empty($ketQuaLich)) {
            return ['trang_thai' => 'loi_khung_gio', 'thong_bao' => "Khung giờ yêu cầu nằm ngoài giờ hoạt động (" . substr($sanBong->GioMoCua, 0, 5) . " - " . substr($sanBong->GioDongCua, 0, 5) . ") hoặc chưa mở kinh doanh."];
        }

        return [
            'trang_thai'    => 'thanh_cong',
            'thong_bao'     => "Tình trạng các khung giờ ngày " . date('d/m/Y', strtotime($ngayDaFormat)) . " tại {$sanBong->TenSan} ({$sanBong->TenCumSan}):",
            'chi_tiet_lich' => $ketQuaLich
        ];
    }

    private function thucHienTraCuuKhuyenMaiKhaDung($maNguoiDung)
    {
        $now = now();

        $khuyenMais = KhuyenMai::with(['nguoiDung.cumSan'])
            ->where('TrangThai', 'DangApDung')
            ->where('NgayBatDau', '<=', $now)
            ->where('NgayKetThuc', '>=', $now)
            ->whereColumn('SoLuongDaDung', '<', 'SoLuong')
            ->where(function ($q) use ($maNguoiDung) {
                $q->whereNull('MaNguoiDung')
                  ->orWhere('MaNguoiDung', $maNguoiDung)
                  ->orWhereHas('nguoiDung', function ($sub) {
                      $sub->where('VaiTro', 'QuanLySan');
                  });
            })
            ->orderBy('GiaTri', 'desc')
            ->get();

        if ($khuyenMais->isEmpty()) {
            return [
                'trang_thai' => 'trong',
                'thong_bao'  => 'Hiện tại hệ thống chưa có mã khuyến mãi nào đang mở.'
            ];
        }

        return [
            'trang_thai'         => 'thanh_cong',
            'tong_so_khuyen_mai' => $khuyenMais->count(),
            'danh_sach_voucher'  => $khuyenMais->map(function ($km) {
                $phamVi = 'Toàn hệ thống (Áp dụng cho mọi cụm sân)';
                if ($km->MaNguoiDung) {
                    if ($km->nguoiDung && $km->nguoiDung->VaiTro === 'QuanLySan') {
                        $tenCS = $km->nguoiDung->cumSan->TenCumSan ?? ('Cụm sân #' . $km->nguoiDung->MaCumSan);
                        $phamVi = "Áp dụng riêng tại {$tenCS}";
                    } else {
                        $phamVi = "Mã tặng riêng cá nhân bạn";
                    }
                }

                $mucGiam = $km->LoaiKhuyenMai === 'PhanTram'
                    ? "Giảm {$km->GiaTri}% (Tối đa " . number_format($km->GiaTriToiDa, 0, ',', '.') . " VNĐ)"
                    : "Giảm trực tiếp " . number_format($km->GiaTri, 0, ',', '.') . " VNĐ";

                return [
                    'ma_voucher'     => $km->MaKhuyenMai,
                    'ten_khuyen_mai' => $km->TenKhuyenMai,
                    'muc_giam'       => $mucGiam,
                    'don_toi_thieu'  => number_format($km->GiaTriHoaDonToiThieu, 0, ',', '.') . ' VNĐ',
                    'pham_vi'        => $phamVi,
                    'so_luong_con'   => ($km->SoLuong - $km->SoLuongDaDung) . '/' . $km->SoLuong,
                    'han_su_dung'    => date('d/m/Y', strtotime($km->NgayKetThuc))
                ];
            })->toArray()
        ];
    }

    private function thucHienTraCuuDanhGiaCumSan($tenCumSan)
    {
        $cleanCum = $this->cleanClusterKeyword($tenCumSan);

        $cumSan = CumSan::where('TenCumSan', 'LIKE', '%' . ($cleanCum ?: trim($tenCumSan)) . '%')
            ->where('TrangThai', 'HoatDong')
            ->first();

        if (!$cumSan) {
            return [
                'trang_thai' => 'khong_tim_thay',
                'thong_bao'  => "Không tìm thấy cụm sân '{$tenCumSan}'."
            ];
        }

        $danhGias = DanhGia::join('DatSan', 'DanhGia.MaDatSan', '=', 'DatSan.MaDatSan')
            ->join('SanBong', 'DatSan.MaSanBong', '=', 'SanBong.MaSanBong')
            ->leftJoin('NguoiDung', 'DanhGia.MaNguoiDung', '=', 'NguoiDung.MaNguoiDung')
            ->where('SanBong.MaCumSan', $cumSan->MaCumSan)
            ->orderBy('DanhGia.NgayTao', 'desc')
            ->select([
                'DanhGia.SoSao',
                'DanhGia.NoiDung',
                'DanhGia.NgayTao',
                'SanBong.TenSan',
                'NguoiDung.HoTen'
            ])
            ->get();

        if ($danhGias->isEmpty()) {
            return [
                'trang_thai'  => 'chua_co_danh_gia',
                'ten_cum_san' => $cumSan->TenCumSan,
                'thong_bao'   => "Cụm sân {$cumSan->TenCumSan} hiện chưa có đánh giá nào từ khách hàng."
            ];
        }

        $trungBinh = round($danhGias->avg('SoSao'), 1);

        return [
            'trang_thai'        => 'thanh_cong',
            'ten_cum_san'       => $cumSan->TenCumSan,
            'diem_trung_binh'   => "{$trungBinh}/5.0 sao",
            'tong_luot_danh_gia'=> $danhGias->count(),
            'nhan_xet_gan_day'  => $danhGias->take(5)->map(function ($dg) {
                return [
                    'khach_hang' => $dg->HoTen ? (mb_substr($dg->HoTen, 0, 1) . '***') : 'Khách hàng',
                    'san_bong'   => $dg->TenSan,
                    'so_sao'     => $dg->SoSao . ' sao',
                    'noi_dung'   => $dg->NoiDung ?: '(Đánh giá sao không kèm lời bình)',
                    'ngay'       => date('d/m/Y', strtotime($dg->NgayTao))
                ];
            })->toArray()
        ];
    }

    // ĐÃ SỬA LỖI: Lấy MaHoaDonDatSan thông qua leftJoin bảng trung gian ChiTietHoaDon (vì bảng DatSan không có cột MaHoaDonDatSan)
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
            ->leftJoin('ChiTietHoaDon', 'DatSan.MaDatSan', '=', 'ChiTietHoaDon.MaDatSan')
            ->select([
                'DatSan.MaDatSan',
                'ChiTietHoaDon.MaHoaDonDatSan',
                'CumSan.TenCumSan',
                'SanBong.TenSan',
                'KhungGio.GioBatDau',
                'KhungGio.GioKetThuc',
                'DatSan.NgayDa',
                'DatSan.TongTien',
                'DatSan.TienCoc',
                'DatSan.MaGiaiDau',
                'GiaiDau.TenGiaiDau'
            ])
            ->orderBy('DatSan.NgayDa', 'asc')
            ->orderBy('KhungGio.GioBatDau', 'asc')
            ->limit(10)
            ->get();

        if ($danhSach->isEmpty()) {
            return [
                'trang_thai' => 'trong',
                'thong_bao'  => 'Hiện tại bạn không có lịch đặt sân nào sắp tới đang ở trạng thái Đã cọc.'
            ];
        }

        return [
            'trang_thai'           => 'thanh_cong',
            'tong_so_lich_sap_toi' => $danhSach->count(),
            'du_lieu'              => $danhSach->map(function ($item) {
                $maVe = $item->MaGiaiDau ? "#GD-{$item->MaGiaiDau}" : "#PT-{$item->MaDatSan}";
                $loaiHinhDa = is_null($item->MaGiaiDau)
                    ? 'Đá phong trào'
                    : 'Đá giải (' . $item->TenGiaiDau . ')';

                return [
                    'ma_ve'       => $maVe,
                    'ma_hoa_don'  => $item->MaHoaDonDatSan ? "#{$item->MaHoaDonDatSan}" : 'Chưa gán',
                    'cum_san'     => $item->TenCumSan,
                    'san_bong'    => $item->TenSan,
                    'ngay_da'     => date('d/m/Y', strtotime($item->NgayDa)),
                    'khung_gio'   => substr($item->GioBatDau, 0, 5) . ' - ' . substr($item->GioKetThuc, 0, 5),
                    'loai_hinh'   => $loaiHinhDa,
                    'don_gia_san' => number_format($item->TongTien, 0, ',', '.') . ' VNĐ',
                    'tien_da_coc' => number_format($item->TienCoc, 0, ',', '.') . ' VNĐ',
                    'trang_thai'  => 'Đã đặt cọc (Chờ thi đấu)'
                ];
            })->toArray()
        ];
    }

    private function thucHienTraCuuLichSuGiaoDich(NguoiDung $user)
    {
        $giaoDich = GiaoDich::where('MaNguoiDung', $user->MaNguoiDung)
            ->orderBy('NgayTao', 'desc')
            ->limit(5)
            ->get(['MaGiaoDich', 'LoaiGiaoDich', 'DongTien', 'SoTien', 'SoDuSau', 'NoiDung', 'NgayTao']);

        $soDuHienTai = number_format($user->SoDuVi ?? 0, 0, ',', '.') . ' VNĐ';

        if ($giaoDich->isEmpty()) {
            return [
                'trang_thai'        => 'thanh_cong',
                'so_du_vi_hien_tai' => $soDuHienTai,
                'thong_bao'         => "Số dư ví hiện tại của bạn là {$soDuHienTai}. Bạn chưa có lịch sử giao dịch nào."
            ];
        }

        return [
            'trang_thai'                  => 'thanh_cong',
            'so_du_vi_hien_tai'           => $soDuHienTai,
            'danh_sach_giao_dich_gan_day' => $giaoDich->map(function ($item) {
                $dau = $item->DongTien === 'Cong' ? '+' : '-';
                return [
                    'ma_giao_dich'   => '#' . $item->MaGiaoDich,
                    'loai_giao_dich' => $item->LoaiGiaoDich,
                    'bien_dong'      => $dau . number_format($item->SoTien, 0, ',', '.') . ' VNĐ',
                    'so_du_sau_gd'   => number_format($item->SoDuSau, 0, ',', '.') . ' VNĐ',
                    'noi_dung'       => $item->NoiDung,
                    'thoi_gian'      => date('d/m/Y H:i', strtotime($item->NgayTao))
                ];
            })->toArray()
        ];
    }

    private function thucHienTraCuuGiaiDauCaNhan($maNguoiDung)
    {
        $giaiDaus = GiaiDau::with('cumSan')
            ->withCount(['datSans as so_tran_da_dat' => function ($q) {
                $q->where('TrangThai', '!=', 'DaHuy');
            }])
            ->where('MaNguoiDung', $maNguoiDung)
            ->orderBy('NgayTao', 'desc')
            ->limit(10)
            ->get();

        if ($giaiDaus->isEmpty()) {
            return [
                'trang_thai' => 'trong',
                'thong_bao'  => 'Bạn hiện chưa gửi yêu cầu tạo giải đấu nào trên hệ thống.'
            ];
        }

        return [
            'trang_thai'        => 'thanh_cong',
            'tong_so_giai_dau'  => $giaiDaus->count(),
            'danh_sach_giai_dau'=> $giaiDaus->map(function ($item) {
                $soTran = (int) ($item->so_tran_da_dat ?? 0);
                $trangThaiText = match ($item->TrangThai) {
                    'ChoDuyet'  => 'Đang chờ Quản lý sân phê duyệt',
                    'DaDuyet'   => 'Đã duyệt (Bạn cần chọn khung giờ đặt sân trong vòng 3 ngày kể từ lúc duyệt)',
                    'HetHan'    => $soTran > 0 ? "Đã chốt lịch sân ({$soTran} trận)" : 'Hết hạn (Quá 3 ngày không đặt sân)',
                    'HoanThanh' => "Đã hoàn thành ({$soTran} trận)",
                    'TuChoi'    => 'Bị từ chối' . ($item->LyDoHuy ? " (Lý do: {$item->LyDoHuy})" : ''),
                    'DaHuy'     => 'Đã hủy',
                    default     => $item->TrangThai
                };

                return [
                    'ma_giai_dau' => '#GD-' . $item->MaGiaiDau,
                    'ten_giai'    => $item->TenGiaiDau,
                    'cum_san'     => $item->cumSan->TenCumSan ?? 'N/A',
                    'thoi_gian'   => date('d/m/Y', strtotime($item->NgayBatDau)) . ' đến ' . date('d/m/Y', strtotime($item->NgayKetThuc)),
                    'trang_thai'  => $trangThaiText,
                    'ghi_chu'     => $item->NoiDung ?? 'Không có'
                ];
            })->toArray()
        ];
    }

    private function thucHienThemVaoGioHang($tenCumSan, $tenSanBong, $ngayDa, $danhSachGio, $gioHang)
    {
        if (!$tenCumSan || !$tenSanBong || !$ngayDa || empty($danhSachGio)) {
            return ['gemini_text' => ['trang_thai' => 'loi', 'thong_bao' => 'Cần cung cấp đủ tên cụm sân, tên sân, ngày và giờ bắt đầu.']];
        }

        $parsed = $this->parseRequestedHoursInput(null, $danhSachGio, false);
        if ($parsed['has_odd_minute']) {
            return [
                'gemini_text' => [
                    'trang_thai' => 'loi_gio_le',
                    'thong_bao'  => "Giờ {$parsed['invalid_token']} bị từ chối vì hệ thống chỉ cho thuê khung giờ chẵn từng tiếng (VD: 17:00 - 18:00), không hỗ trợ giờ lẻ hay 1.5 tiếng."
                ]
            ];
        }

        $cleanCum = trim(str_ireplace(['cụm sân', 'sân bóng'], '', $tenCumSan));

        $sanBong = SanBong::join('CumSan', 'SanBong.MaCumSan', '=', 'CumSan.MaCumSan')
            ->where('CumSan.TenCumSan', 'LIKE', '%' . ($cleanCum ?: trim($tenCumSan)) . '%')
            ->where('SanBong.TenSan', 'LIKE', '%' . trim($tenSanBong) . '%')
            ->where('CumSan.TrangThai', 'HoatDong')
            ->select('SanBong.*', 'CumSan.TenCumSan', 'CumSan.MaCumSan as CumSanID', 'CumSan.GioMoCua', 'CumSan.GioDongCua')
            ->first();

        if (!$sanBong || $sanBong->TrangThai === 'BaoTri') {
            return ['gemini_text' => ['trang_thai' => 'loi', 'thong_bao' => 'Sân bóng không tồn tại hoặc đang bảo trì.']];
        }

        $ngayDaFormat = date('Y-m-d', strtotime($ngayDa));
        $dateStr = date('d/m/Y', strtotime($ngayDa));

        // Kiểm tra phạm vi 7 ngày cho đặt sân phong trào qua Chatbot
        $todayYmd = date('Y-m-d');
        $maxYmd = date('Y-m-d', strtotime('+6 days'));
        if ($ngayDaFormat < $todayYmd || $ngayDaFormat > $maxYmd) {
            return [
                'gemini_text' => [
                    'trang_thai' => 'loi_ngay_dat',
                    'thong_bao'  => "Đặt sân phong trào chỉ áp dụng trong phạm vi 7 ngày kể từ hôm nay (" . date('d/m/Y') . " đến " . date('d/m/Y', strtotime('+6 days')) . ")."
                ]
            ];
        }

        $thongBaoKetQua = [];
        $newSlots = [];

        foreach ($parsed['hours'] as $hourInt) {
            $hour = str_pad($hourInt, 2, '0', STR_PAD_LEFT);
            $gioBatDau = "{$hour}:00:00";

            $khungGio = KhungGio::where('GioBatDau', $gioBatDau)->first();
            if (!$khungGio || $khungGio->GioBatDau < $sanBong->GioMoCua || $khungGio->GioKetThuc > $sanBong->GioDongCua) {
                $thongBaoKetQua[] = "Khung giờ {$hour}:00 nằm ngoài giờ hoạt động của cụm sân.";
                continue;
            }

            $giaTien = GiaTien::where('MaCumSan', $sanBong->CumSanID)
                ->where('MaLoaiSan', $sanBong->MaLoaiSan)
                ->where('MaKhungGio', $khungGio->MaKhungGio)
                ->first();
            if (!$giaTien || $giaTien->SoTien <= 0) {
                $thongBaoKetQua[] = "Khung giờ {$hour}:00 hiện đang ngừng kinh doanh.";
                continue;
            }

            $daDat = DatSan::where('MaSanBong', $sanBong->MaSanBong)
                ->where('MaKhungGio', $khungGio->MaKhungGio)
                ->where('NgayDa', $ngayDaFormat)
                ->where('TrangThai', '!=', 'DaHuy')
                ->first();
            if ($daDat) {
                $thongBaoKetQua[] = "Khung giờ {$hour}:00 đã có người đặt.";
                continue;
            }

            if (strtotime($ngayDaFormat . ' ' . $gioBatDau) <= time()) {
                $thongBaoKetQua[] = "Khung giờ {$hour}:00 đã qua giờ thi đấu.";
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
                $thongBaoKetQua[] = "Khung giờ {$timeStr} đã có sẵn trong giỏ hàng của bạn.";
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
                $thongBaoKetQua[] = "Khung giờ {$timeStr} (Giá: " . number_format($giaTien->SoTien, 0, ',', '.') . "đ) hợp lệ.";
            }
        }

        if (empty($newSlots)) {
            return [
                'gemini_text' => [
                    'trang_thai' => 'khong_co_slot_moi',
                    'thong_bao'  => implode(" ", $thongBaoKetQua) . " Hãy thông báo rõ lý do cho khách hàng."
                ]
            ];
        }

        if (!empty($gioHang)) {
            return [
                'gemini_text' => [
                    'trang_thai' => 'can_xac_nhan',
                    'thong_bao'  => implode(" ", $thongBaoKetQua) . " Tuy nhiên, giỏ hàng của khách ĐANG CÓ SẴN sân khác. Hệ thống đã hiển thị 2 nút (Thêm mới / Thêm vào) trên màn hình chat. Hãy nhắc khách bấm chọn 1 trong 2 nút trên màn hình để xác nhận."
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
                'thong_bao'  => implode(" ", $thongBaoKetQua) . " Đã tự động thêm vào giỏ hàng thành công. Hãy báo khách bấm nút 'Tiến hành đặt sân' ở thanh giỏ hàng phía dưới để áp mã giảm giá (nếu có) và thanh toán cọc."
            ],
            'client_action' => [
                'type'    => 'ADD_TO_CART',
                'payload' => $newSlots
            ]
        ];
    }
}