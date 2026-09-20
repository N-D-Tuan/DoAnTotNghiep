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

    // 1. Hàm gọi Gemini API để biến văn bản thành Vector
    public function taoVectorTuVanBan($vanBan)
    {
        $keys = config('services.gemini.keys', []);
        $key = !empty($keys) ? array_values(array_filter($keys))[0] : env('GEMINI_API_KEY');

        if (empty($key)) {
            \Log::error("Thiếu API Key Gemini.");
            return null;
        }

        $modelName = 'gemini-embedding-2';
        $url = "https://generativelanguage.googleapis.com/v1beta/models/{$modelName}:embedContent?key={$key}";

        try {
            $response = \Illuminate\Support\Facades\Http::withHeaders([
                'Content-Type' => 'application/json'
            ])->withoutVerifying()->timeout(15)->post($url, [
                'model' => "models/{$modelName}",
                'content' => [
                    'parts' => [['text' => $vanBan]]
                ]
            ]);

            if ($response->successful()) {
                return $response->json()['embedding']['values'];
            }
            
            \Log::error("Lỗi Gemini Vector: " . $response->body());
        } catch (\Exception $e) {
            \Log::error("Lỗi kết nối API Vector: " . $e->getMessage());
        }

        return null;
    }

    // 2. Hàm nạp dữ liệu quy định vào bộ nhớ Vector
    public function napDuLieuQuyDinh()
    {
        echo "1. Đang kết nối máy chủ ChromaDB...\n";
        $collection = $this->client->getOrCreateCollection('quy_dinh_he_thong');

        $duLieu = [
        // TẠO CÁC YÊU CẦU
        [
            'id' => 'rut_tien',
            'noi_dung' => 'Hướng dẫn rút tiền: Để rút tiền từ số dư ví DN FOOTBALL, khách hàng vui lòng truy cập vào mục "Ví của tôi" trên website, chọn nút "Rút tiền". Sau đó nhập số tiền cần rút và điền thông tin tài khoản ngân hàng chính chủ. Yêu cầu rút tiền sẽ được bộ phận kế toán duyệt trong vòng 24h làm việc. Lưu ý: Số dư tối thiểu để rút là 50.000 VNĐ.'
        ],
        [
            'id' => 'huy_san_gap',
            'noi_dung' => 'Quy định hủy sân gấp: Khách hàng có thể hủy sân thoải mái trước 10 giờ so với giờ đá, nếu là giải đấu thì thời hạn là 1 tuần trước khai mạc của giải đấu. Nếu bạn muốn hủy trong vòng 10 giờ (hoặc 1 tuần đối với giải đấu) thì bạn phải tạo yêu cầu hủy gấp. Để thực hiện, khách hàng vào mục "Các yêu cầu", chuyển sang tab "Hủy sân gấp" và bấm nút "Tạo yêu cầu hủy gấp" và chọn mục mình muốn hủy.'
        ],
        [
            'id' => 'tao_giai_dau',
            'noi_dung' => 'Hướng dẫn tạo giải đấu: Khách hàng muốn tạo giải đấu cá nhân vui lòng vào mục "Các yêu càu", ở tab "Giải đấu" chọn nút "Tạo yêu cầu giải đấu". Điền đầy đủ các thông tin: Tên giải, ngày bắt đầu, ngày kết thúc và mô tả chi tiết. Sau khi hoàn tất, giải đấu sẽ chuyển sang trạng thái "Chờ duyệt". Ban quản lý DN FOOTBALL sẽ xem xét và phê duyệt hệ thống giải cho bạn.'
        ],

        // GIAO DỊCH & NẠP TIỀN
        [
            'id' => 'nap_tien',
            'noi_dung' => 'Hướng dẫn nạp tiền: Hệ thống DN FOOTBALL hỗ trợ nạp tiền tự động qua cổng thanh toán VNPay. Để thực hiện, khách hàng vào mục "Ví của tôi", chọn "Nạp tiền", nhập số tiền cần nạp và xác nhận thanh toán. Sau khi nhập thẻ ATM nội địa thành công, số dư ví sẽ được cộng tự động trong vòng 1-2 phút.'
        ],
        [
            'id' => 'chinh_sach_hoan_tien',
            'noi_dung' => 'Chính sách hoàn tiền cọc: Khi khách hàng thao tác hủy sân hợp lệ (trước 10 tiếng so với giờ bóng lăn, trước 1 tuần đổi với ngày bắt đầu của giải đấu), hệ thống sẽ tự động hoàn lại 100% số tiền đã cọc vào "Số dư ví" của khách hàng trên hệ thống DN FOOTBALL chứ không hoàn trực tiếp về thẻ ngân hàng. Đối với trường hợp tạo yêu cầu hủy gấp, nếu Admin duyệt thì hệ thống cũng sẽ hoàn lại 100%, ngược lại thì bạn sẽ mất tiền cọc đó (sân bạn đặt chưa được hủy). Khách hàng có thể dùng số dư này để đặt sân lần sau hoặc tạo yêu cầu Rút tiền.'
        ],

        // NHÓM BỔ SUNG 2: ĐẶT SÂN & TÀI KHOẢN
        [ 
            'id' => 'huong_dan_dat_san', 
            'noi_dung' => 'Hướng dẫn đặt sân: Khách hàng truy cập trang chủ, chọn cụm sân, sân bóng, khung giờ ở ngày muốn đá. Sau khi hệ thống hiển thị sân trống, bạn nhấn "Tiến hành đặt sân" và tiến hành thanh toán cọc (30% cho đá phong trào, 50% cho giải đấu) bằng tiền trong thẻ ví của bạn để giữ chỗ thành công.' 
        ],
        [ 
            'id' => 'huong_dan_dat_giai_dau', 
            'noi_dung' => 'Hướng dẫn đặt sân cho giải đấu: Khách hàng truy cập trang chủ, chọn vào cụm sân mình được phép đá giải. Sau khi vào trong, bạn nhấn "Tiến hành đặt sân", thay đổi mục đích đặt sân của mình sang giải đấu mình muốn, chọn các khung giờ và tiến hành thanh toán cọc (30% cho đá phong trào, 50% cho giải đấu) bằng tiền trong thẻ ví của bạn để giữ chỗ thành công.' 
        ],
        [
            'id' => 'quy_dinh_dat_san',
            'noi_dung' => 'Quy định đặt sân và cọc tiền: Để giữ lịch thành công, khách hàng bắt buộc phải thanh toán cọc trước 30% tổng giá trị ca đặt (50% đối với giải đấu).'
        ],
        [
            'id' => 'doi_mat_khau',
            'noi_dung' => 'Hướng dẫn đổi mật khẩu: Nếu muốn đổi mật khẩu, khách hàng chọn cụm Tên ở góc trên phải màn hình, chọn nút "Đổi mật khẩu" và xác nhận để hệ thống gửi mã OTP về email mà bạn đã đăng ký. Sau khi nhập đúng mã OTP, khách hàng có thể tạo lại mật khẩu mới.'
        ],
        [   'id' => 'quen_mat_khau', 
            'noi_dung' => 'Hướng dẫn khôi phục mật khẩu: Nếu bạn chưa đăng nhập và quên mật khẩu, hãy nhấn vào nút "Đăng nhập", chọn "Quên mật khẩu". Hệ thống sẽ yêu cầu bạn nhập địa chỉ email đã đăng ký để gửi mã xác thực OTP. Nhập đúng mã OTP để thiết lập lại mật khẩu mới.' 
        ],

        // NHÓM BỔ SUNG 3: NỘI QUY TẠI SÂN & NGOẠI LỆ
        [
            'id' => 'nhan_san_check_in',
            'noi_dung' => 'Quy định nhận sân: Khách hàng vui lòng có mặt tại cụm sân trước giờ đá 10 phút. Tới quầy lễ tân, hãy trình vé của khung giờ mình đặt để nhân viên xác nhận và chỉ định sân cụ thể. Vui lòng thanh toán số tiền còn lại trước khi vào sân thi đấu.'
        ],
        [
            'id' => 'thoi_tiet_mua_bao',
            'noi_dung' => 'Chính sách thời tiết (Mưa bão): Trong trường hợp trời mưa lớn, ngập sân hoặc có cảnh báo thiên tai bất khả kháng khiến không thể thi đấu, khách hàng vui lòng tạo yêu cầu hủy sân gấp và ban quản lý sân sẽ duyệt hoàn toàn và hoàn lại 100% tiền cọc vào ví cho khách hàng. Nếu gấp xin vui lòng liên hệ Hotline trước giờ đá ít nhất 1 tiếng nếu thấy thời tiết xấu bằng cách click vào nút Zalo ở góc dưới trái màn hình hoặc liên hệ số điện thoại 0899244124.'
        ],
        [
            'id' => 'noi_quy_san_bong',
            'noi_dung' => 'Nội quy sân bóng: Để đảm bảo chất lượng mặt cỏ nhân tạo, nghiêm cấm khách hàng sử dụng giày đinh sắt (loại 6 móng). Chỉ được phép sử dụng giày đinh dăm (TF) hoặc giày đế bằng (IC). Không mang theo vũ khí, chất gây cháy nổ, đồ uống có cồn (bia, rượu) vào khu vực sân cỏ. Nếu khách hàng có ăn uống trong quá trình trận đấu diễn ra thì vui lòng dọn dẹp về sinh trước khi ra về giúp mình nhé!'
        ],
        [ 
            'id' => 'dich_vu_tai_san', 
            'noi_dung' => 'Dịch vụ tại sân: Hệ thống DN FOOTBALL có cung cấp miễn phí nước trà đá và áo bib (áo pitch hay áo tập) chia đội cho khách hàng đặt sân. Ngoài ra, quầy căng-tin tại cụm sân có bán đa dạng các loại nước giải khát.' 
        ]
    ];

        $ids = [];
        $documents = [];
        $embeddings = [];

        foreach ($duLieu as $index => $item) {
            echo "2. Đang tạo Vector dữ liệu thứ " . ($index + 1) . " (Đang gọi Gemini)...\n";
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
            echo "3. Đang lưu " . count($ids) . " dòng vào Database Chroma...\n";
            $collection->upsert(
                ids: $ids,
                embeddings: $embeddings,
                documents: $documents
            );
            return "Tuyệt vời! Đã nạp thành công " . count($ids) . " quy định vào ChromaDB.";
        }

        return "Có lỗi xảy ra, không nạp được dữ liệu!";
    }

    public function timKiemQuyDinh($cauHoi)
    {
        \Log::info("Bot đang tra cứu luật cho từ khóa: " . $cauHoi);

        // 1. Biến câu hỏi của khách thành Vector
        $vectorCauHoi = $this->taoVectorTuVanBan($cauHoi);
        if (!$vectorCauHoi) {
            return "Xin lỗi, hiện tại hệ thống tra cứu luật đang bận, vui lòng thử lại sau.";
        }

        // 2. Tìm kiếm trong ChromaDB
        try {
            $collection = $this->client->getCollection('quy_dinh_he_thong');
            $ketQua = $collection->query(
                queryEmbeddings: [$vectorCauHoi],
                nResults: 2,
                include: ['documents'] // Lấy 2 quy định sát nghĩa nhất để AI tổng hợp
            );

            // 3. Trả về nội dung luật nếu độ tương đồng đủ tốt
            if (!empty($ketQua->documents[0])) {
                $noiDungLuat = "Đây là các quy định của hệ thống DN FOOTBALL có liên quan đến câu hỏi:\n" 
                       . implode("\n- ", $ketQua->documents[0]);

                \Log::info("Đã tìm ra luật: " . $noiDungLuat);
                return $noiDungLuat;
            }

            \Log::warning("ChromaDB không tìm thấy luật phù hợp cho: " . $cauHoi);
        } catch (\Exception $e) {
            \Log::error("Lỗi truy vấn ChromaDB: " . $e->getMessage());
        }

        return "Hiện tại hệ thống không có quy định cụ thể nào về vấn đề này.";
    }
}