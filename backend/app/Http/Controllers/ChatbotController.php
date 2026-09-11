<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Auth;
use App\Models\PhienChat;
use App\Models\TinNhan;
use App\Models\NguoiDung;

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

        // Bảo vệ an toàn nếu rớt phiên đăng nhập
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
                'TieuDe' => mb_substr($noiDung, 0, 40) . '...', // Tự động lấy 40 ký tự đầu làm tiêu đề
            ]);
            $idPhienChat = $phienChat->ID;
        } else {
            $phienChat = PhienChat::findOrFail($idPhienChat);
        }

        // 2. Lưu tin nhắn của Khách hàng (User) vào Database
        TinNhan::create([
            'ID_PhienChat' => $idPhienChat,
            'NguoiGui' => 'User',
            'NoiDung' => $noiDung,
        ]);

        // 3. Chuẩn bị lịch sử Chat (Ngữ cảnh) để gửi cho Gemini
        // Gemini API yêu cầu format: ['role' => 'user'/'model', 'parts' => [['text' => '...']]]
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

        // 4. Payload gửi lên Gemini
        $payload = [
            'contents' => $contents,
            'systemInstruction' => [
                'parts' => [
                    [
                        'text' => "Bạn là một trợ lý ảo CSKH chuyên nghiệp, thân thiện và nhiệt tình của hệ thống sân bóng đá mini mang tên 'DN FOOTBALL' ở thành phố Đà Nẵng.
                        Quy tắc giao tiếp của bạn:
                        1. Xưng hô là 'mình' hoặc 'trợ lý DN', gọi khách hàng là 'bạn' hoặc 'anh/chị'.
                        2. Luôn trả lời ngắn gọn, súc tích, xuống dòng rõ ràng, sử dụng emoji phù hợp để tạo sự thân thiện.
                        3. Tuyệt đối KHÔNG ĐƯỢC bịa đặt giá cả, lịch trống hay thông tin sân. Nếu không biết, hãy nói: 'Hiện tại mình chưa có thông tin này, bạn đợi mình kiểm tra lại nhé'.
                        4. Nhiệm vụ chính của bạn là giúp khách hàng kiểm tra lịch trống, tìm sân, báo giá và hỗ trợ đặt sân."
                    ]
                ]
            ]
        ];

        // 5. Gọi API Gemini với cơ chế xoay vòng Key
        try {
            $geminiResponse = $this->callGeminiWithKeyRotation($payload);
            
            // Trích xuất text phản hồi từ Gemini
            $botReply = $geminiResponse['candidates'][0]['content']['parts'][0]['text'] ?? 'Xin lỗi, tôi không thể xử lý yêu cầu lúc này.';

            // 6. Lưu tin nhắn của AI (Bot) vào Database
            $tinNhanBot = TinNhan::create([
                'ID_PhienChat' => $idPhienChat,
                'NguoiGui' => 'Bot',
                'NoiDung' => $botReply,
                // 'DuLieuBocThem' => ... Sẽ xử lý lưu JSON ở các bước sau khi có Function Calling
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
            return response()->json([
                'success' => false,
                'message' => 'Hệ thống AI đang bảo trì, vui lòng thử lại sau!'
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

            // HTTP 429: Too Many Requests (Hết token phút) hoặc 403 (Lỗi phân quyền/Quota)
            if ($response->status() === 429 || $response->status() === 403) {
                Log::warning("Gemini API Key " . ($index + 1) . " bị quá tải hoặc hết hạn ngạch. Chuyển sang key tiếp theo.");
                continue; // Lặp sang key tiếp theo
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
}
