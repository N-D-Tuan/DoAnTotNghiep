<?php

namespace App\Services;

use Codewithkyrian\ChromaDB\ChromaDB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ChromaDBService
{
    public $client;

    public function __construct()
    {
        try {
            $host = str_replace('http://', '', env('CHROMADB_HOST', '127.0.0.1'));
            $port = env('CHROMADB_PORT', 8001);
            
            $this->client = ChromaDB::factory()
                ->withHost($host)
                ->withPort($port)
                ->connect();
        } catch (\Exception $e) {
            die("🚨 LỖI KẾT NỐI CHROMADB: " . $e->getMessage() . "\n");
        }
    }

    // Lấy toàn bộ danh sách Gemini API Keys từ config và .env (Hỗ trợ tới 20 keys)
    private function getAllGeminiKeys(): array
    {
        $keys = config('services.gemini.keys', []);
        if (!is_array($keys)) {
            $keys = [];
        }

        // Quét thêm trực tiếp từ env phòng trường hợp config/services.php chỉ khai báo 2 key
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

    // 1. Hàm gọi Gemini API để biến văn bản thành Vector (Có tự động xoay Key & nhớ Key sống)
    public function taoVectorTuVanBan($vanBan)
    {
        $keys = $this->getAllGeminiKeys();

        if (empty($keys)) {
            Log::error("Thiếu API Key Gemini trong ChromaDBService.");
            return null;
        }

        $totalKeys = count($keys);
        $startIndex = (int) \Illuminate\Support\Facades\Cache::get('gemini_working_key_index', 0);
        if ($startIndex >= $totalKeys) {
            $startIndex = 0;
        }

        $modelName = 'gemini-embedding-2';

        for ($attempt = 0; $attempt < $totalKeys; $attempt++) {
            $currentIndex = ($startIndex + $attempt) % $totalKeys;
            $key = $keys[$currentIndex];
            $url = "https://generativelanguage.googleapis.com/v1beta/models/{$modelName}:embedContent?key={$key}";

            try {
                $response = Http::withHeaders([
                    'Content-Type' => 'application/json'
                ])->withoutVerifying()->timeout(15)->post($url, [
                    'model' => "models/{$modelName}",
                    'content' => [
                        'parts' => [['text' => $vanBan]]
                    ]
                ]);

                if ($response->successful()) {
                    if ($currentIndex !== $startIndex) {
                        \Illuminate\Support\Facades\Cache::put('gemini_working_key_index', $currentIndex, now()->addHours(2));
                    }
                    return $response->json()['embedding']['values'];
                }

                if (in_array($response->status(), [429, 403]) || $response->status() >= 500) {
                    Log::warning("Gemini Vector Key " . ($currentIndex + 1) . "/{$totalKeys} bị lỗi " . $response->status() . ". Chuyển sang key tiếp theo.");
                    continue;
                }

                Log::error("Lỗi Gemini Vector: " . $response->body());
                break;
            } catch (\Exception $e) {
                Log::warning("Lỗi kết nối API Vector ở Key " . ($currentIndex + 1) . ": " . $e->getMessage());
                continue;
            }
        }

        return null;
    }

    // 2. Hàm nạp dữ liệu quy định vào bộ nhớ Vector
    public function napDuLieuQuyDinh()
    {
        echo "1. Đang kết nối máy chủ ChromaDB...\n";
        $collection = $this->client->getOrCreateCollection('quy_dinh_he_thong');

        $duLieu = [
            // NHÓM 1: TÀI CHÍNH, VÍ ĐIỆN TỬ & HOÀN TIỀN
            [
                'id' => 'nap_tien',
                'noi_dung' => 'Hướng dẫn nạp tiền vào ví: Hệ thống DN FOOTBALL hỗ trợ nạp tiền tự động qua cổng thanh toán VNPay. Khách hàng bấm vào biểu tượng "Ví tiền" (hoặc nút dấu + cạnh số dư trên thanh menu đầu trang), chọn nút "Nạp tiền", nhập số tiền cần nạp (tối thiểu 10.000 VNĐ) và bấm "Xác nhận thanh toán". Sau khi thanh toán VNPay thành công, số dư ví sẽ được cộng tự động ngay lập tức và lưu vào lịch sử biến động số dư.'
            ],
            [
                'id' => 'rut_tien',
                'noi_dung' => 'Hướng dẫn rút tiền từ ví: Khách hàng bấm vào mục "Ví tiền" trên thanh menu (Quản lý Tài chính), chọn nút "Rút tiền". Nhập số tiền cần rút (tối thiểu 50.000 VNĐ và không vượt quá số dư khả dụng), điền đầy đủ Tên ngân hàng thụ hưởng, Số tài khoản, Tên chủ tài khoản rồi bấm "Xác nhận rút tiền". Hệ thống xử lý tự động, trừ trực tiếp số dư ví và ghi nhận vào lịch sử giao dịch ngay lập tức mà không cần chờ duyệt.'
            ],
            [
                'id' => 'chinh_sach_hoan_tien',
                'noi_dung' => 'Chính sách hoàn tiền cọc: Khi khách hàng tự hủy sân hợp lệ (trước giờ bóng lăn tối thiểu 10 tiếng đối với đá phong trào, hoặc trước ngày khai mạc tối thiểu 7 ngày đối với giải đấu), hệ thống sẽ tự động hoàn lại 100% số tiền đã đặt cọc vào "Số dư ví" của khách hàng trên DN FOOTBALL. Đối với trường hợp gửi "Yêu cầu hủy sân gấp" khi sát giờ, nếu Quản lý cụm sân phê duyệt thì khách hàng cũng được hoàn lại 100% tiền cọc vào ví; nếu bị từ chối thì lịch đặt giữ nguyên và không được hoàn cọc. Tiền trong ví có thể dùng để đặt sân tiếp hoặc rút về ngân hàng bất kỳ lúc nào.'
            ],

            // NHÓM 2: ĐẶT SÂN, HÓA ĐƠN VAT, KHUYẾN MÃI & VÉ QR
            [
                'id' => 'huong_dan_dat_san',
                'noi_dung' => 'Hướng dẫn đặt sân phong trào: Khách hàng truy cập mục "Sân bóng", chọn Cụm sân -> chọn Sân con (Sân 5, Sân 7, Sân 11) -> bấm vào các ô khung giờ "CÒN TRỐNG" trong phạm vi 7 ngày tới (hoặc nhờ Chatbot AI thêm trực tiếp vào giỏ hàng). Sau đó bấm nút "Tiến hành đặt sân" ở thanh giỏ hàng phía dưới, chọn Mã khuyến mãi (nếu có) và bấm "Thanh toán ngay". Hệ thống sẽ trừ tiền cọc 30% từ Ví điện tử, xuất Hóa đơn đặt sân và cấp Vé điện tử có mã QR (#PT-...) để check-in tại sân.'
            ],
            [
                'id' => 'quy_dinh_dat_san_va_hoa_don',
                'noi_dung' => 'Quy định đặt cọc, Thuế VAT và Hóa đơn đặt sân: Hệ thống chỉ hỗ trợ đặt các khung giờ chẵn theo từng tiếng (không hỗ trợ giờ lẻ 30 phút hay đặt 1.5 tiếng). Để giữ lịch thành công, khách hàng thanh toán tiền cọc trước 30% giá sân gốc đối với đá phong trào (hoặc 50% đối với đá giải đấu). Tổng tiền Hóa đơn đặt sân được tính theo công thức: (Tổng tiền sân gốc - Tiền giảm giá Khuyến mãi) + Thuế VAT 8%. Nếu giỏ hàng có nhiều cụm sân khác nhau, hệ thống sẽ tự động tách thành các Hóa đơn riêng cho từng cụm sân. Số tiền còn lại của hóa đơn sẽ được thanh toán trực tiếp tại sân khi đến nhận sân.'
            ],
            [
                'id' => 'khuyen_mai_voucher',
                'noi_dung' => 'Hướng dẫn sử dụng Mã khuyến mãi (Voucher giảm giá): Khi mở Giỏ hàng đặt sân ("Tiến hành đặt sân"), khách hàng bấm vào khung "Chọn mã ưu đãi". Hệ thống có 3 phạm vi mã khuyến mãi: (1) Mã Toàn hệ thống: xét điều kiện đơn tối thiểu trên tổng tiền toàn bộ giỏ hàng; (2) Mã Dành riêng cho bạn (tặng cá nhân): xét trên tổng giỏ hàng; (3) Mã Riêng của từng Cụm sân: chỉ xét điều kiện trên tổng tiền sân của đúng cụm sân đó. Khách hàng bấm "Áp dụng" ở mã đủ điều kiện, hệ thống sẽ trừ trực tiếp tiền giảm giá trước khi tính thuế VAT 8%.'
            ],
            [
                'id' => 'doi_lich_dat_san',
                'noi_dung' => 'Hướng dẫn dời lịch đặt sân: Khách hàng có thể tự dời lịch sang sân bóng khác hoặc khung giờ/ngày đá khác trong CÙNG MỘT CỤM SÂN nếu thực hiện trước giờ bóng lăn tối thiểu 10 tiếng. Cách làm: Vào mục "Lịch sử đặt sân", tìm trận đấu đang ở trạng thái "Đã cọc", bấm nút "Dời lịch", chọn Sân bóng mới -> Ngày đá mới -> Khung giờ trống mới và bấm "Tiếp tục xác nhận" -> "Đồng ý dời lịch". Tiền đã đặt cọc được giữ nguyên, hệ thống sẽ tự động tính lại tổng hóa đơn và phần tiền còn thu tại sân (lưu ý: tổng hóa đơn mới sau khi đổi không được nhỏ hơn số tiền đã đặt cọc).'
            ],

            // NHÓM 3: GIẢI ĐẤU, HỦY SÂN & ĐÁNH GIÁ
            [
                'id' => 'tao_giai_dau',
                'noi_dung' => 'Hướng dẫn tạo yêu cầu tổ chức giải đấu: Khách hàng vào mục "Các yêu cầu" trên thanh menu, ở tab "Yêu cầu Giải đấu" bấm nút "+ Tạo Yêu cầu Giải đấu". Chọn Cụm sân muốn tổ chức, nhập Tên giải đấu, Ngày bắt đầu, Ngày kết thúc và Nội dung mô tả rồi bấm "Gửi yêu cầu". Đơn sẽ ở trạng thái "Chờ duyệt" để Quản lý cụm sân kiểm tra ma trận lịch và phê duyệt.'
            ],
            [
                'id' => 'huong_dan_dat_giai_dau',
                'noi_dung' => 'Hướng dẫn đặt lịch sân cho giải đấu đã duyệt: Sau khi yêu cầu giải đấu được Quản lý cụm sân duyệt (chuyển sang trạng thái "Đã duyệt"), khách hàng có thời hạn 3 ngày kể từ ngày duyệt để hoàn tất việc chọn khung giờ đặt sân (nếu quá 3 ngày không đặt sân, giải đấu sẽ tự động chuyển sang Hết hạn). Cách đặt: Mở giỏ hàng bằng nút "Tiến hành đặt sân", đổi mục "Mục đích đặt sân" từ Đá phong trào sang tên Giải đấu của bạn, sau đó vào đúng Cụm sân của giải để chọn các khung giờ thi đấu trong dải ngày giải và thanh toán cọc 50% từ ví.'
            ],
            [
                'id' => 'huy_san_gap',
                'noi_dung' => 'Quy định hủy sân và tạo yêu cầu hủy sân gấp: Khách hàng được tự hủy miễn phí (hoàn cọc 100% tự động về ví) tại mục "Các yêu cầu", ở tab "Yêu cầu Hủy sân gấp" bấm nút "+ Tạo Yêu cầu Hủy Gấp". Chọn lịch đặt sân mà mình muốn hủy và nhập thông tin chi tiết ở lý do để Quản lý sân xem xét phê duyệt.'
            ],
            [
                'id' => 'danh_gia_san',
                'noi_dung' => 'Hướng dẫn đánh giá cụm sân sau khi đá: Sau khi trận đấu hoặc giải đấu kết thúc và được nhân sự tại sân chốt trạng thái "Hoàn thành", khách hàng vào mục "Lịch sử đặt sân", bấm nút "Đánh giá cụm sân" trên thẻ trận đấu/giải đấu đó, chọn số sao (từ 1 đến 5 sao) kèm nhận xét và bấm "Gửi đánh giá". Khách hàng cũng có thể xem tất cả đánh giá của các cụm sân ngay trên thẻ Cụm sân ở trang chủ.'
            ],

            // NHÓM 4: TÀI KHOẢN, MẬT KHẨU & NỘI QUY TẠI SÂN
            [
                'id' => 'doi_mat_khau',
                'noi_dung' => 'Hướng dẫn đổi mật khẩu và cập nhật thông tin cá nhân: Khi đang đăng nhập, khách hàng bấm vào tên tài khoản ở góc trên bên phải màn hình, chọn "Đổi mật khẩu", sau đó nhập Mật khẩu hiện tại, Mật khẩu mới (tối thiểu 6 ký tự) và Xác nhận mật khẩu mới rồi bấm "Xác nhận đổi mật khẩu" để cập nhật ngay lập tức. Nếu muốn cập nhật Họ tên, SĐT, Email, số định danh VNeID hoặc Tài khoản ngân hàng mặc định, hãy chọn mục "Thông tin cá nhân".'
            ],
            [
                'id' => 'quen_mat_khau',
                'noi_dung' => 'Hướng dẫn khôi phục mật khẩu khi quên: Nếu chưa đăng nhập và quên mật khẩu, tại màn hình "Đăng nhập", khách hàng nhấn vào liên kết "Quên mật khẩu?", nhập địa chỉ Email đã đăng ký để hệ thống gửi mã xác thực OTP gồm 6 chữ số về Email. Nhập đúng mã OTP và thiết lập lại mật khẩu mới.'
            ],
            [
                'id' => 'nhan_san_check_in',
                'noi_dung' => 'Quy định nhận sân (Check-in) và Vé điện tử QR: Khách hàng có thể xem và tải ảnh Vé điện tử (mã #PT-... cho đá phong trào hoặc #GD-... cho giải đấu) kèm mã QR tại mục "Lịch sử đặt sân", hoặc bấm "Xuất hóa đơn" để in Hóa đơn đặt sân. Vui lòng có mặt tại cụm sân trước giờ bóng lăn 10-15 phút, xuất trình mã QR trên vé điện tử tại quầy thu ngân để nhân viên quét mã check-in và thanh toán phần tiền còn lại trên hóa đơn.'
            ],
            [
                'id' => 'thoi_tiet_mua_bao',
                'noi_dung' => 'Chính sách thời tiết (Mưa bão, thiên tai): Trong trường hợp trời mưa lớn, ngập sân hoặc có cảnh báo thời tiết xấu không thể thi đấu, khách hàng vui lòng vào mục "Các yêu cầu" -> "Yêu cầu Hủy sân gấp" để gửi yêu cầu hủy do thời tiết; Ban quản lý sân sẽ phê duyệt và hoàn lại 100% tiền cọc vào ví. Trường hợp khẩn cấp sát giờ đá, vui lòng bấm vào nút Zalo nổi ở góc dưới bên trái màn hình hoặc gọi trực tiếp Hotline 0899244124 để được hỗ trợ dời lịch hoặc hoàn cọc.'
            ],
            [
                'id' => 'noi_quy_san_bong',
                'noi_dung' => 'Nội quy sân bóng và dịch vụ tiện ích tại sân: Để bảo vệ mặt cỏ nhân tạo, nghiêm cấm sử dụng giày đinh sắt (chỉ sử dụng giày đinh dăm TF hoặc đế bằng IC). Không mang chất cháy nổ, vũ khí vào khu vực sân và giữ gìn vệ sinh chung. Hệ thống DN FOOTBALL cung cấp miễn phí trà đá và áo bib (áo lưới chia đội) tại quầy lễ tân cho các đội đặt sân.'
            ]
        ];

        $ids = [];
        $documents = [];
        $embeddings = [];

        foreach ($duLieu as $index => $item) {
            echo "2. Đang tạo Vector dữ liệu thứ " . ($index + 1) . "/" . count($duLieu) . " (ID: {$item['id']})...\n";
            $vector = $this->taoVectorTuVanBan($item['noi_dung']);
            
            if ($vector) {
                echo "   -> Thành công!\n";
                $ids[] = $item['id'];
                $documents[] = $item['noi_dung'];
                $embeddings[] = $vector;
            } else {
                echo "   -> Thất bại (Xem file log)!\n";
            }
        }

        if (!empty($ids)) {
            echo "3. Đang lưu " . count($ids) . " quy định vào Database Chroma...\n";
            $collection->upsert(
                ids: $ids,
                embeddings: $embeddings,
                documents: $documents
            );
            return "Tuyệt vời! Đã nạp thành công " . count($ids) . " quy định chuẩn theo 20 bảng mới vào ChromaDB.";
        }

        return "Có lỗi xảy ra, không nạp được dữ liệu!";
    }

    public function timKiemQuyDinh($cauHoi)
    {
        Log::info("Bot đang tra cứu luật cho từ khóa: " . $cauHoi);

        $vectorCauHoi = $this->taoVectorTuVanBan($cauHoi);
        if (!$vectorCauHoi) {
            return "Xin lỗi, hiện tại hệ thống tra cứu quy định đang bận, vui lòng thử lại sau.";
        }

        try {
            $collection = $this->client->getCollection('quy_dinh_he_thong');
            $ketQua = $collection->query(
                queryEmbeddings: [$vectorCauHoi],
                nResults: 3,
                include: ['documents']
            );

            if (!empty($ketQua->documents[0])) {
                $noiDungLuat = "Đây là các quy định chính thức của hệ thống DN FOOTBALL có liên quan đến câu hỏi:\n- " 
                       . implode("\n- ", $ketQua->documents[0]);

                Log::info("Đã tìm ra luật: " . $noiDungLuat);
                return $noiDungLuat;
            }

            Log::warning("ChromaDB không tìm thấy luật phù hợp cho: " . $cauHoi);
        } catch (\Exception $e) {
            Log::error("Lỗi truy vấn ChromaDB: " . $e->getMessage());
        }

        return "Hiện tại hệ thống không có quy định cụ thể nào về vấn đề này.";
    }
}