const API_BASE_URL = 'http://127.0.0.1:8000/api';
const appContent = document.getElementById('app-content');

// ======================================================
// FETCH INTERCEPTOR (TỰ ĐỘNG BƠM TOKEN VÀO MỌI API)
// ======================================================
const originalFetch = window.fetch;
window.fetch = async function(resource, config = {}) {
    if (!config.headers) config.headers = {};
    const token = sessionStorage.getItem('dn_football_token');
    if (token) {
        if (config.headers instanceof Headers) {
            config.headers.append('Authorization', `Bearer ${token}`);
        } else {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
    }
    return originalFetch(resource, config);
};

let toastTimeout;
let currentClusterId = null;
let currentClusterName = null;
let currentClusterAddress = null;
let currentClusterGioMo = null;
let currentClusterGioDong = null;
let currentPitchId = null;
let currentPitchName = null;
let currentLoaiSanId = null;
let currentPitchType = null;
let allActiveClusters = [];
let userActiveTournaments = [];
let allMyBookingsData = [];
let currentBookingSearch = '';
let currentBookingDate = '';
let currentBookingStatus = 'All';
let currentBookingTab = 'phong_trao';
let currentBookingPurpose = sessionStorage.getItem('dn_football_booking_purpose') || 'normal';
let availablePromotions = [];
let selectedPromotion = null;
let selectedPromotionsByCluster = {};
let activePromoTargetClusterId = null;
const CUSTOMER_VAT_RATE = 0.08;

// ======================================================
// USER ĐANG ĐĂNG NHẬP
// ======================================================
const currentUser =
    JSON.parse(
        sessionStorage.getItem(
            'dn_football_user'
        )
    );


// ======================================================
// KIỂM TRA USER CUSTOMER
// ======================================================
function checkCustomerAuthentication() {

    // Không có user
    if (!currentUser) {
        window.location.href =
            'login.html';
        return false;
    }

    // Không phải KhachHang
    if (currentUser.VaiTro !== 'KhachHang') {
        if (currentUser.VaiTro === 'Admin') {
            window.location.href =
                'admin.html';
        } else {
            sessionStorage.clear();
            window.location.href =
                'login.html';
        }
        return false;
    }
    return true;
}

// ======================================================
// HIỂN THỊ THÔNG TIN USER
// ======================================================
function loadCustomerInfo() {
    const updatedUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    
    if (!updatedUser) return;

    const userName = document.getElementById('user-name');
    const walletBalance = document.getElementById('user-wallet-balance');

    // -----------------------------
    // TÊN
    // -----------------------------
    if (userName) {
        userName.textContent = updatedUser.HoTen || 'Khách hàng';
    }

    // -----------------------------
    // SỐ DƯ VÍ
    // -----------------------------
    if (walletBalance) {
        const balance = Number(updatedUser.SoDuVi || 0);
        walletBalance.textContent = balance.toLocaleString('vi-VN') + 'đ';
    }
}

// ======================================================
// ĐỒNG BỘ SỐ DƯ TỪ DATABASE VỀ TRÌNH DUYỆT (REAL-TIME)
// ======================================================
async function syncUserWallet() {
    try {
        const res = await fetch(`${API_BASE_URL}/thong-tin-ca-nhan`);
        if (res.ok) {
            const data = await res.json();

            // 1. Cập nhật dữ liệu mới nhất vào bộ nhớ và hiển thị lên Header
            sessionStorage.setItem('dn_football_user', JSON.stringify(data.user));
            loadCustomerInfo();

            // --- CẬP NHẬT SỐ DƯ LỚN TRONG THẺ VÍ (NẾU ĐANG MỞ) ---
            const mainBalanceEl = document.getElementById('main-wallet-balance');
            if (mainBalanceEl) {
                mainBalanceEl.textContent = Number(data.user.SoDuVi || 0).toLocaleString('vi-VN') + 'đ';
            }

            // 2. TỰ ĐỘNG QUÉT LẠI DỮ LIỆU CỦA TRANG ĐANG MỞ (NẾU CÓ)
            
            // Khách đang mở trang "Ví tiền" -> Load lại Lịch sử giao dịch
            if (document.getElementById('transaction-list')) {
                const dateFilter = document.getElementById('tx-date-filter')?.value || '';
                loadTransactionHistory(dateFilter);
            }
            
        }
    } catch (error) {
        console.error("Lỗi đồng bộ ví ngầm:", error);
    }
}

// ======================================================
// ĐỒNG BỘ LỊCH SỬ ĐẶT SÂN NGẦM (REAL-TIME KHÔNG CHỚP TRANG)
// ======================================================
async function syncUserBookings() {
    // Chỉ chạy nếu người dùng đang mở trang Lịch sử đặt sân
    if (!document.getElementById('my-bookings-container')) return;

    try {
        const response = await fetch(`${API_BASE_URL}/dat-san/cua-toi`);
        if (!response.ok) return;
        
        const res = await response.json();
        
        // Cập nhật lại mảng dữ liệu toàn cục
        allMyBookingsData = res.data || [];
        
        // Cập nhật lại giao diện lưới với bộ lọc/tab đang giữ nguyên
        applyBookingFiltersAndRender();
        
    } catch (error) {
        console.error("Lỗi đồng bộ lịch sử đặt sân ngầm:", error);
    }
}

// ======================================================
// ĐỒNG BỘ YÊU CẦU GIẢI ĐẤU NGẦM (REAL-TIME KHÔNG CHỚP TRANG)
// ======================================================
async function syncUserTournaments() {
    // 1. Chỉ chạy ngầm nếu đang mở giao diện Các yêu cầu
    const container = document.getElementById('requests-content-body');
    if (!container) return;

    // 2. Dò xem khách có đang đứng ở đúng Tab "Giải đấu" hay không
    let isGiaiDauTab = false;
    document.querySelectorAll('button[onclick^="renderRequests"]').forEach(btn => {
        if (btn.style.borderBottom && btn.style.borderBottom.includes('solid') && btn.getAttribute('onclick').includes('giai_dau')) {
            isGiaiDauTab = true;
        }
    });

    if (!isGiaiDauTab) return;

    try {
        const response = await fetch(`${API_BASE_URL}/giai-dau/cua-toi`);
        if (!response.ok) return;
        
        const res = await response.json();
        const list = res.data || [];

        // Cập nhật lại mảng global ngay lập tức để Giỏ hàng nhận diện giải đấu đã duyệt
        userActiveTournaments = list.filter(t => t.TrangThai === 'DaDuyet');

        // Bắt đầu vẽ HTML ngầm (Chỉ vẽ cái ruột bên trong)
        if (list.length === 0) {
            container.innerHTML = `
                <div style="padding: 40px;">
                    <i class="fa-regular fa-folder-open" style="font-size: 3rem; color: var(--border); margin-bottom: 16px;"></i>
                    <p style="color: var(--text-muted); font-size: 1.05rem;">Bạn chưa có yêu cầu tổ chức giải đấu nào.</p>
                </div>`;
        } else {
            let html = `<div style="display: flex; flex-direction: column; gap: 12px; max-height: 480px; overflow-y: auto; padding-right: 8px; text-align: left;">`;
            
            list.forEach(item => {
                const statusTextMap = {
                    'ChoDuyet': 'Chờ duyệt', 'DaDuyet': 'Đã duyệt', 'TuChoi': 'Từ chối',
                    'HetHan': 'Hết hạn', 'HoanThanh': 'Hoàn thành', 'DaHuy': 'Đã hủy'
                };
                const viStatus = statusTextMap[item.TrangThai] || item.TrangThai;

                let badgeColor = '#6b7280', badgeBg = '#f3f4f6'; 
                if(item.TrangThai === 'DaDuyet') { badgeColor = '#047857'; badgeBg = '#d1fae5'; }
                else if(item.TrangThai === 'TuChoi' || item.TrangThai === 'DaHuy') { badgeColor = '#b91c1c'; badgeBg = '#fee2e2'; }
                else if(item.TrangThai === 'ChoDuyet') { badgeColor = '#b45309'; badgeBg = '#fef3c7'; }
                else if(item.TrangThai === 'HetHan') { badgeColor = '#9ca3af'; badgeBg = '#f3f4f6'; }

                let approvalInfoHtml = '';
                if (item.TrangThai === 'DaDuyet' && item.NgayDuyet) {
                    const d = new Date(item.NgayDuyet);
                    const dExp = new Date(d);
                    dExp.setDate(d.getDate() + 3);
                    const pad = n => n < 10 ? '0' + n : n;
                    
                    approvalInfoHtml = `
                        <p style="margin: 6px 0 0 0; font-size: 0.9rem; color: #047857;">
                            <i class="fa-solid fa-calendar-check"></i> Ngày duyệt: <strong>${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}</strong> 
                            <span style="margin-left: 15px; color: #b91c1c;">
                                <i class="fa-solid fa-hourglass-half"></i> Ngày hết hạn: <strong>${dExp.getFullYear()}-${pad(dExp.getMonth() + 1)}-${pad(dExp.getDate())}</strong>
                            </span>
                        </p>
                    `;
                } else if (item.TrangThai === 'TuChoi' && item.LyDoHuy) {
                    approvalInfoHtml = `
                        <div style="margin-top: 8px; padding: 8px 12px; font-size: 0.85rem; color: #b91c1c; background: #fef2f2; border-radius: 6px; border: 1px dashed #fca5a5;">
                            <i class="fa-solid fa-circle-exclamation"></i> Lý do từ chối: <strong>${item.LyDoHuy}</strong>
                        </div>
                    `;
                }

                html += `
                    <div style="border: 1px solid var(--border); border-radius: 8px; padding: 16px; background: #fff; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <div>
                            <h4 style="margin: 0 0 8px 0; color: var(--text-dark); font-size: 1.1rem;">${item.TenGiaiDau}</h4>
                            <p style="margin: 0 0 6px 0; font-size: 0.9rem; color: var(--text-muted);">
                                <i class="fa-regular fa-calendar"></i> Lịch đá: ${item.NgayBatDau} đến ${item.NgayKetThuc}
                            </p>
                            <p style="margin: 0; font-size: 0.9rem; color: var(--text-muted);">
                                <i class="fa-solid fa-location-dot"></i> Cụm sân: <strong style="color:var(--text-dark);">${item.cum_san ? item.cum_san.TenCumSan : 'Không xác định'}</strong>
                                <span style="margin-left: 10px; font-size: 0.8rem;">(Ngày nộp: ${item.NgayTao ? item.NgayTao.substring(0,10) : 'N/A'})</span>
                            </p>
                            ${approvalInfoHtml}
                        </div>
                        <div>
                            <span style="padding: 6px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; background: ${badgeBg}; color: ${badgeColor};">${viStatus}</span>
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
            container.innerHTML = html; // Cập nhật ruột HTML nhẹ nhàng
        }
    } catch (error) {
        console.error("Lỗi đồng bộ giải đấu ngầm:", error);
    }
}

// ======================================================
// ĐỒNG BỘ YÊU CẦU HỦY GẤP NGẦM (REAL-TIME KHÔNG CHỚP TRANG)
// ======================================================
async function syncUserUrgentCancels() {
    // 1. Chỉ chạy ngầm nếu đang mở giao diện Các yêu cầu
    const container = document.getElementById('requests-content-body');
    if (!container) return;

    // 2. Dò xem khách có đang đứng ở đúng Tab "Hủy sân gấp" hay không
    let isHuySanTab = false;
    document.querySelectorAll('button[onclick^="renderRequests"]').forEach(btn => {
        if (btn.style.borderBottom && btn.style.borderBottom.includes('solid') && btn.getAttribute('onclick').includes('huy_san')) {
            isHuySanTab = true;
        }
    });

    if (!isHuySanTab) return;

    try {
        const response = await fetch(`${API_BASE_URL}/yeu-cau-huy-gap/cua-toi`);
        if (!response.ok) return;
        
        const res = await response.json();
        const list = res.data || [];

        // 3. Bắt đầu vẽ lại ruột HTML
        if (list.length === 0) {
            container.innerHTML = `<div style="padding: 40px;"><i class="fa-regular fa-calendar-xmark" style="font-size: 3rem; color: var(--border); margin-bottom: 16px;"></i><p style="color: var(--text-muted); font-size: 1.05rem;">Bạn chưa có yêu cầu hủy sân gấp nào.</p></div>`;
        } else {
            let html = `<div style="display: flex; flex-direction: column; gap: 12px; max-height: 480px; overflow-y: auto; padding-right: 8px; text-align: left;">`;
            list.forEach(item => {
                let badgeColor = '#b45309', badgeBg = '#fef3c7', statusText = 'Chờ duyệt';
                if(item.TrangThai === 'DaDuyet') { badgeColor = '#047857'; badgeBg = '#d1fae5'; statusText = 'Đã duyệt'; }
                if(item.TrangThai === 'TuChoi') { badgeColor = '#b91c1c'; badgeBg = '#fee2e2'; statusText = 'Từ chối'; }

                const sanBong = item.dat_san && item.dat_san.san_bong ? item.dat_san.san_bong.TenSan : 'Sân không xác định';
                const cumSan = item.dat_san && item.dat_san.san_bong && item.dat_san.san_bong.cum_san ? item.dat_san.san_bong.cum_san.TenCumSan : '';
                const khungGio = item.dat_san && item.dat_san.khung_gio ? `${item.dat_san.khung_gio.GioBatDau.substring(0,5)} - ${item.dat_san.khung_gio.GioKetThuc.substring(0,5)}` : '';
                
                // Format ngày
                let dateStr = '';
                if (item.dat_san && item.dat_san.NgayDa) {
                    const parts = item.dat_san.NgayDa.split('-');
                    dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
                }
                
                const isGiaiDau = item.dat_san && item.dat_san.ID_GiaiDau != null;
                const loaiTag = isGiaiDau ? `<span style="font-size: 0.7rem; background: #e0e7ff; color: #4338ca; padding: 2px 6px; border-radius: 4px; margin-left: 8px;"><i class="fa-solid fa-trophy"></i> Giải đấu</span>` : `<span style="font-size: 0.7rem; background: #f1f5f9; color: #475569; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">Phong trào</span>`;

                let rejectReasonHtml = '';
                if (item.TrangThai === 'TuChoi' && item.LyDoHuy) {
                    rejectReasonHtml = `
                        <div style="margin-top: 8px; padding: 8px 12px; font-size: 0.85rem; color: #b91c1c; background: #fef2f2; border-radius: 6px; border: 1px dashed #fca5a5;">
                            <i class="fa-solid fa-circle-exclamation"></i> Lý do từ chối: <strong>${item.LyDoHuy}</strong>
                        </div>
                    `;
                }

                html += `
                    <div style="border: 1px solid var(--border); border-radius: 8px; padding: 16px; background: #fff; display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                        <div>
                            <h4 style="margin: 0 0 8px 0; color: var(--text-dark); font-size: 1.1rem;">Sân: ${sanBong} ${loaiTag}</h4>
                            <p style="margin: 0 0 6px 0; font-size: 0.9rem; color: var(--text-muted);"><i class="fa-solid fa-location-dot"></i> Cụm sân: ${cumSan}</p>
                            <p style="margin: 0 0 6px 0; font-size: 0.9rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> Lịch đá: <strong style="color: var(--primary);">${khungGio}</strong> ngày <strong>${dateStr}</strong></p>
                            <p style="margin: 0 0 6px 0; font-size: 0.9rem; color: var(--text-muted);">Lý do: <span style="font-style: italic;">"${item.NoiDung}"</span></p>
                            <p style="margin: 0; font-size: 0.8rem; color: #94a3b8;">Ngày gửi: ${item.NgayTao ? item.NgayTao.substring(0, 16).replace('T', ' ') : ''}</p>
                            ${rejectReasonHtml}
                        </div>
                        <div>
                            <span style="padding: 6px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; background: ${badgeBg}; color: ${badgeColor};">${statusText}</span>
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
            container.innerHTML = html;
        }
    } catch (error) {
        console.error("Lỗi đồng bộ hủy sân gấp ngầm:", error);
    }
}

function showToast(message) {
    let toast = document.getElementById('system-toast');
    
    // Nếu chưa có thẻ toast trong HTML, dùng JS tự động tạo ra
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'system-toast';
        // Cấu hình CSS hiển thị nổi ở góc dưới bên phải
        toast.style.cssText = 'position: fixed; top: 80px; right: 30px; background-color: #f59e0b; color: white; padding: 14px 24px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 9999; font-weight: 600; transition: opacity 0.3s ease; display: none; opacity: 0;';
        document.body.appendChild(toast);
    }
    
    // Cập nhật nội dung
    toast.innerHTML = `<i class="fa-solid fa-circle-exclamation" style="margin-right: 8px;"></i> ${message}`;
    toast.style.display = 'block';
    
    // Ép trình duyệt nhận diện display:block trước khi tăng opacity để có hiệu ứng mượt
    setTimeout(() => { toast.style.opacity = '1'; }, 10);

    // Xóa bộ đếm cũ nếu có nhiều thông báo bắn ra liên tục
    clearTimeout(toastTimeout);
    
    // Đặt thời gian 2 giây (2000ms) rồi làm mờ đi
    toastTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => { toast.style.display = 'none'; }, 300); // Chờ hiệu ứng mờ kết thúc mới ẩn hẳn
    }, 2000);
}

async function revalidateCartPrices() {
    if (selectedSlots.length === 0) return;

    selectedSlots.forEach(s => s._isValid = false);

    let isChanged = false;

    try {
        // Tải danh sách khung giờ hệ thống
        const kgRes = await fetch(`${API_BASE_URL}/khung-gio`);
        const allKhungGio = (await kgRes.json()).data || [];

        // Gom nhóm các slot theo Cụm sân để tối ưu số lần gọi API
        const clusterIds = [...new Set(selectedSlots.map(s => s.clusterId))];

        for (let cId of clusterIds) {
            // Tải danh sách Sân con (để lấy Loại Sân) và Bảng Giá của Cụm này
            const [sbRes, gtRes, csRes] = await Promise.all([
                fetch(`${API_BASE_URL}/san-bong?cum_san_id=${cId}`),
                fetch(`${API_BASE_URL}/gia-tien?cum_san_id=${cId}`),
                fetch(`${API_BASE_URL}/cum-san/${cId}`)
            ]);
            
            const pitches = (await sbRes.json()).data || [];
            const prices = (await gtRes.json()).data || [];
            const clusterData = await csRes.json();

            if (!clusterData.success || clusterData.data.deleted_at !== null) {
                isChanged = true;
                continue; 
            }

            const moCua = clusterData.data.GioMoCua.substring(0, 5);
            const dongCua = clusterData.data.GioDongCua.substring(0, 5);

            const slotsInCluster = selectedSlots.filter(s => s.clusterId == cId);

            for (let slot of slotsInCluster) {
                // 1. Tìm sân để biết là Sân 5, Sân 7 hay Sân 11
                const pitch = pitches.find(p => p.ID == slot.pitchId);
                if (!pitch || pitch.TrangThai === 'BaoTri') {
                    isChanged = true;
                    continue; 
                }

                // 2. Tìm ID của khung giờ tương ứng với chuỗi giờ trong giỏ
                const matchingKhungGio = allKhungGio.find(kg => `${kg.GioBatDau.substring(0,5)} - ${kg.GioKetThuc.substring(0,5)}` === slot.time);
                if (!matchingKhungGio) {
                    isChanged = true;
                    continue;
                }

                // 3. Đối chiếu giá mới nhất
                const priceInfo = prices.find(p => p.ID_LoaiSan == pitch.ID_LoaiSan && p.ID_KhungGio == matchingKhungGio.ID);
                const start = matchingKhungGio.GioBatDau.substring(0, 5);
                const end = matchingKhungGio.GioKetThuc.substring(0, 5);

                // Loại bỏ nếu không có giá, giá <= 0 HOẶC NẰM NGOÀI GIỜ MỞ/ĐÓNG CỬA
                if (!priceInfo || priceInfo.SoTien <= 0 || start < moCua || end > dongCua) {
                    isChanged = true;
                    continue; 
                }

                const newRealPrice = priceInfo.SoTien;
                // 4. Nếu giá thay đổi -> Lưu lại
                if (Number(slot.price) !== Number(newRealPrice)) {
                    slot.price = newRealPrice;
                    isChanged = true;
                }

                slot._isValid = true;
            }
        }

        if (isChanged) {
            const oldLength = selectedSlots.length;
            selectedSlots = selectedSlots.filter(s => s._isValid);
            selectedSlots.forEach(s => delete s._isValid);

            saveToSession(); // Cập nhật lại thanh nổi

            if (document.getElementById('cart-modal')?.style.display === 'flex') {
                if (selectedSlots.length > 0) openCartModal();
                else closeCartModal();
            }
            
            if (selectedSlots.length < oldLength) {
                showToast('Một số khung giờ trong giỏ đã bị ngừng kinh doanh hoặc ngoài giờ hoạt động và tự động gỡ!');
            } else {
                showToast('Giá tiền trong giỏ hàng vừa được tự động cập nhật!');
            }
        }
    } catch (error) {
        console.error("Lỗi đồng bộ giá giỏ hàng ngầm:", error);
    }
}

// ======================================================
// ĐĂNG XUẤT CUSTOMER
// ======================================================
async function logoutCustomer() {

    try {
        const response =
            await fetch(
                `${API_BASE_URL}/dang-xuat`,
                {
                    method: 'POST',
                    headers: {
                        'Accept':
                            'application/json',

                        'Content-Type':
                            'application/json'
                    }
                }
            );

        const data = await response.json();
        console.log(data.message);
    } catch (error) {
        console.error('Lỗi đăng xuất:', error);
    } finally {

        // ==========================================
        // XÓA TOÀN BỘ SESSION STORAGE
        // ==========================================
        sessionStorage.clear();

        // ==========================================
        // QUAY VỀ TRANG CHỦ
        // ==========================================
        window.location.href = 'index.html';
    }
}

// Lưu trữ và khôi phục các khung giờ đã chọn bằng sessionStorage
let selectedSlots = JSON.parse(sessionStorage.getItem('dn_football_selected_slots')) || [];

document.addEventListener('DOMContentLoaded', async () => {

        // ==================================================
        // SHOW / HIDE PASSWORD
        // ==================================================

        const toggleButtons = document.querySelectorAll('.btn-toggle-password');

        toggleButtons.forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                const input = this.previousElementSibling;
                const icon = this.querySelector('i');

                if (input.type === 'password') {
                    input.type = 'text';
                    // Đổi icon sang nhắm mắt
                    icon.classList.remove('fa-eye');
                    icon.classList.add('fa-eye-slash');
                } else {
                    input.type = 'password';
                    // Đổi icon sang mở mắt
                    icon.classList.remove('fa-eye-slash');
                    icon.classList.add('fa-eye');
                }
            });
        });

        // Kiểm tra đăng nhập
        if (!checkCustomerAuthentication()) {
            return;
        }

        setupDropdowns();
        updateFloatingCart();

        setupFloatingContacts();

        // ==========================================
        // LOGOUT
        // ==========================================
        const logoutButton = document.getElementById('customer-logout-btn');
        if (logoutButton) {
            logoutButton.addEventListener('click', (e) => {
                e.preventDefault();
                logoutCustomer();
            });
        }

        // ==========================================
        // ĐIỀU HƯỚNG GIAO DIỆN & XỬ LÝ VNPAY
        // ==========================================
        const urlParams = new URLSearchParams(window.location.search);
        const vnpayStatus = urlParams.get('vnpay_status');
        
        if (vnpayStatus) {
            let msg = '';
            let isSuccess = false;
            
            if (vnpayStatus === 'success') { 

                await syncUserWallet();

                msg = 'Thanh toán VNPay thành công! Số dư đã được cập nhật.'; 
                isSuccess = true; 
            } else if (vnpayStatus === 'failed') { 
                msg = 'Giao dịch đã bị hủy bởi người dùng.'; 
            } else { 
                msg = 'Giao dịch không hợp lệ hoặc lỗi chữ ký bảo mật.'; 
            }

            // 3. Load lại Header và Ép hệ thống KHÔNG VẼ danh sách sân
            loadCustomerInfo(); 
            loadNotifications();
            renderWallet(msg, isSuccess); 
            
            // Xóa query param để F5 không bị lặp thông báo
            window.history.replaceState({}, document.title, window.location.pathname);
            
        } else {
            // NẾU LÀ TRUY CẬP BÌNH THƯỜNG: Mới load thông tin và vẽ danh sách Cụm sân
            loadCustomerInfo();
            loadNotifications();
            renderClusters();
        }

        // ==========================================
        // KẾT NỐI WEBSOCKET BẰNG LARAVEL REVERB
        // ==========================================
        const REVERB_APP_KEY = '32o5b6sskjqfuf7qnqtd'; 

        window.Echo = new Echo({
            broadcaster: 'reverb',
            key: REVERB_APP_KEY,
            wsHost: '127.0.0.1',
            wsPort: 8080,
            forceTLS: false,
            disableStats: true,
            authorizer: (channel, options) => {
                return {
                    authorize: (socketId, callback) => {
                        fetch(`${API_BASE_URL.replace('/api', '')}/broadcasting/auth`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json',
                                'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}`
                            },
                            body: JSON.stringify({
                                socket_id: socketId,
                                channel_name: channel.name
                            })
                        })
                        .then(response => {
                            if (!response.ok) throw new Error('Xác thực Socket thất bại');
                            return response.json();
                        })
                        .then(data => callback(false, data))
                        .catch(error => callback(true, error));
                    }
                };
            }
        });

        // BẮT ĐẦU LẮNG NGHE TÍN HIỆU RIÊNG TƯ CỦA USER NÀY
        window.Echo.private('user.' + currentUser.ID)
            .listen('.UserDataUpdated', (e) => {
                console.log('⚡ Đã nhận tín hiệu từ Backend, đang tự động đồng bộ...');
                
                // Kích hoạt ngay 3 hàm cập nhật giao diện mà không cần chờ 1 phút
                syncUserWallet();

                syncUserBookings();

                syncUserTournaments();
                syncUserUrgentCancels();
                
                // Hàm render thông báo mới
                loadNotifications();
            });

        // BẮT ĐẦU LẮNG NGHE TÍN HIỆU TOÀN HỆ THỐNG
        window.Echo.channel('system-updates')
            .listen('SystemDataUpdated', async (e) => {
                console.log('⚡ Hệ thống có thay đổi Cụm sân/Sân bóng...');
                const cacheBuster = new Date().getTime();

                // 1. Cập nhật biến toàn cục chứa Giờ mở/đóng cửa mới nhất
                if (currentClusterId !== null) {
                    try {
                        const csRes = await fetch(`${API_BASE_URL}/cum-san/${currentClusterId}?_t=${cacheBuster}`);
                        const csData = await csRes.json();

                        if (!csData.success || csData.data.deleted_at !== null || csData.data.TrangThai === 'BaoTri') {
                            selectedSlots = selectedSlots.filter(s => s.clusterId !== currentClusterId);
                            saveToSession();
                            
                            if (document.getElementById('cart-modal')?.style.display === 'flex') {
                                if (selectedSlots.length > 0) openCartModal(); 
                                else closeCartModal();
                            }

                            showToast(`Cụm sân "${currentClusterName}" đã bị ngừng hoạt động hoặc bảo trì!`);
                            renderClusters();
                            return; 
                        }

                        if (csData.success && csData.data) {
                            currentClusterGioMo = csData.data.GioMoCua;
                            currentClusterGioDong = csData.data.GioDongCua;
                            currentClusterName = csData.data.TenCumSan;
                            currentClusterAddress = csData.data.DiaChi;
                        }
                    } catch(err) { console.error("Lỗi lấy thông tin cụm sân:", err); }
                }

                // 2. Kiểm tra sân bóng bảo trì nếu khách đang xem lịch của sân đó
                if (currentPitchId !== null && currentClusterId !== null) {
                    try {
                        const pitchRes = await fetch(`${API_BASE_URL}/san-bong?cum_san_id=${currentClusterId}&_t=${cacheBuster}`);
                        const pitchData = await pitchRes.json();
                        
                        if (pitchData.success) {
                            const currentPitchInfo = pitchData.data.find(p => String(p.MaSanBong || p.ID) === String(currentPitchId));

                            if (!currentPitchInfo || currentPitchInfo.TrangThai === 'BaoTri') {
                                selectedSlots = selectedSlots.filter(s => s.pitchId !== currentPitchId);
                                saveToSession();
                                
                                if (document.getElementById('cart-modal')?.style.display === 'flex') {
                                    if (selectedSlots.length > 0) openCartModal(); 
                                    else closeCartModal();
                                }

                                showToast(`Sân bóng "${currentPitchName}" vừa được đưa vào bảo trì!`);
                                renderPitches(currentClusterId, currentClusterName, currentClusterAddress, currentClusterGioMo, currentClusterGioDong);
                                return;
                            }
                        }
                    } catch(err) { console.error("Lỗi lấy thông tin sân bóng:", err); }
                }

                await revalidateCartPrices();

                // 3. Nếu khách đang mở Modal xem danh sách đánh giá của Cụm sân
                if (typeof refreshOpenCustomerReviewsModal === 'function') {
                    refreshOpenCustomerReviewsModal();
                }

                // 4. TRẠNG THÁI A: Khách đang đứng ở bảng Lịch Sân
                if (currentPitchId !== null && document.querySelector('.schedule-table')) {
                    try {
                        const dsRes = await fetch(`${API_BASE_URL}/dat-san/da-dat?id_san_bong=${currentPitchId}&_t=${cacheBuster}`);
                        const bookedSlots = (await dsRes.json()).data || [];

                        // Bước A1: Nhả tất cả các ô đang "Đã đặt" về lại "CÒN TRỐNG" và khôi phục sự kiện click
                        document.querySelectorAll('.schedule-table .slot.booked').forEach(el => {
                            if (el.innerText.trim() === 'Đã đặt') {
                                el.classList.remove('booked');
                                el.classList.add('available');
                                el.innerText = 'CÒN TRỐNG';
                                const slotArgs = el.getAttribute('data-slot-args');
                                if (slotArgs) {
                                    el.setAttribute('onclick', `toggleSlot(this, ${slotArgs})`);
                                }
                            }
                        });

                        // Bước A2: Quét danh sách bookedSlots từ Server và tô xám ngay theo data-slot-key (giống hệt main.js)
                        bookedSlots.forEach(booked => {
                            const maKG = booked.MaKhungGio || booked.ID_KhungGio;
                            const ngayDa = String(booked.NgayDa).substring(0, 10);
                            const targetKey = `${currentPitchId}-${ngayDa}-${maKG}`;

                            let slotEl = document.querySelector(`.schedule-table .slot[data-slot-key="${targetKey}"]`);

                            // Dự phòng nếu DOM cũ chưa có data-slot-key
                            if (!slotEl) {
                                const parts = ngayDa.split('-');
                                const dateFull = `${parts[2]}/${parts[1]}/${parts[0]}`;
                                slotEl = Array.from(document.querySelectorAll('.schedule-table .slot')).find(el => {
                                    const sid = el.getAttribute('data-slot-id') || '';
                                    return sid.includes(`-${dateFull}-`);
                                });
                            }

                            if (slotEl && !slotEl.classList.contains('booked')) {
                                const slotId = slotEl.getAttribute('data-slot-id');
                                const timeStr = slotEl.getAttribute('data-time-str') || '';
                                const dateFull = slotEl.getAttribute('data-date-full') || ngayDa;

                                slotEl.classList.remove('available', 'selected');
                                slotEl.classList.add('booked');
                                slotEl.innerText = 'Đã đặt';
                                slotEl.removeAttribute('onclick');

                                // Nếu ô này đang nằm trong giỏ hàng của khách -> Gỡ khỏi giỏ và báo Toast
                                const existingIndex = selectedSlots.findIndex(s => s.id === slotId);
                                if (existingIndex > -1) {
                                    selectedSlots.splice(existingIndex, 1);
                                    saveToSession();
                                    
                                    if (document.getElementById('cart-modal')?.style.display === 'flex') {
                                        if (selectedSlots.length > 0) openCartModal();
                                        else closeCartModal();
                                    }
                                    showToast(`Khung giờ ${timeStr} ngày ${dateFull} vừa bị khách khác đặt mất!`);
                                }
                            }
                        });

                        // Bước A3: Đồng bộ lại các ô đang chọn với giỏ hàng
                        document.querySelectorAll('.schedule-table .slot.selected').forEach(el => {
                            const slotId = el.getAttribute('data-slot-id');
                            if (!selectedSlots.some(s => s.id === slotId)) {
                                el.classList.remove('selected');
                                el.innerText = 'CÒN TRỐNG';
                            }
                        });
                    } catch (err) {
                        console.error("Lỗi cập nhật ngầm lịch khách hàng:", err);
                    }
                }
                // 5. TRẠNG THÁI B: Khách đang xem trang Danh sách Cụm Sân
                else if (document.getElementById('cluster-grid-container')) {
                    try {
                        const [response, ratingRes] = await Promise.all([
                            fetch(`${API_BASE_URL}/cum-san?_t=${cacheBuster}`),
                            fetch(`${API_BASE_URL}/danh-gia?_t=${cacheBuster}`)
                        ]);
                        const res = await response.json();
                        const ratingMap = (await ratingRes.json()).data || {};
                        allActiveClusters = (res.data || []).filter(c => c.deleted_at === null).map(c => {
                            const r = ratingMap[c.ID];
                            return {
                                ...c,
                                avg_rating: r ? Number(r.trung_binh_sao) : (c.danh_gias_avg_so_sao ? Number(c.danh_gias_avg_so_sao) : 0),
                                total_reviews: r ? Number(r.tong_danh_gia) : Number(c.danh_gias_count || 0)
                            };
                        });
                        filterClusters(); 
                    } catch(err) { console.error(err); }
                }
                // 6. TRẠNG THÁI C: Khách đang xem trang chi tiết Sân con bên trong 1 Cụm
                else if (currentClusterId !== null && currentPitchId === null && document.querySelector('.cluster-detail-header')) {
                    try {
                        const headerInfo = document.querySelector('.cluster-detail-info');
                        if (headerInfo) {
                            headerInfo.innerHTML = `
                                <span><i class="fa-solid fa-location-dot"></i> ${currentClusterAddress}</span>
                                <span><i class="fa-solid fa-clock"></i> ${currentClusterGioMo.substring(0,5)} - ${currentClusterGioDong.substring(0,5)}</span>
                            `;
                        }

                        const response = await fetch(`${API_BASE_URL}/san-bong?cum_san_id=${currentClusterId}&_t=${cacheBuster}`);
                        const res = await response.json();
                        
                        if (res.success) {
                            const activePitches = res.data.filter(sb => sb.TrangThai === 'HoatDong');
                            const grouped = {};
                            
                            activePitches.forEach(sb => {
                                const loaiSanName = sb.loaiSan?.TenLoaiSan || sb.loai_san?.TenLoaiSan || 'Loại sân khác';
                                const loaiSanId = sb.ID_LoaiSan;
                                if(!grouped[loaiSanName]) grouped[loaiSanName] = { id: loaiSanId, pitches: [] };
                                grouped[loaiSanName].pitches.push(sb);
                            });

                            let newHtml = '';
                            if (activePitches.length === 0) {
                                newHtml = `<p style="text-align:center; color: var(--text-muted); margin-top: 40px;">Cụm sân này hiện chưa có sân con nào hoạt động.</p>`;
                            } else {
                                for (const [loaiSanName, data] of Object.entries(grouped)) {
                                    newHtml += `
                                        <div class="pitch-section">
                                            <div class="pitch-section-title">
                                                <span>${loaiSanName.toUpperCase()}</span>
                                                <span style="font-size: 0.82rem; font-weight: 500; color: var(--text-muted);">${data.pitches.length} sân</span>
                                            </div>
                                            <div class="pitch-grid">`;
                                    data.pitches.forEach(sb => {
                                        newHtml += `
                                            <div class="pitch-card" onclick="renderSchedule('${currentClusterId}', '${currentClusterName}', '${sb.ID}', '${sb.TenSan}', '${data.id}', '${loaiSanName}')">
                                                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                                    <div>
                                                        <div class="pitch-name">${sb.TenSan}</div>
                                                        <div class="pitch-type"><i class="fa-solid fa-layer-group"></i> ${loaiSanName}</div>
                                                    </div>
                                                    <span style="font-size: 0.75rem; color: var(--primary); background: var(--primary-light); padding: 2px 8px; border-radius: 4px; font-weight: 600;">Hoạt động</span>
                                                </div>
                                                <button class="btn-outline" style="width: 100%; padding: 8px;">Xem lịch trống &rarr;</button>
                                            </div>`;
                                    });
                                    newHtml += `</div></div>`;
                                }
                            }

                            const headerNode = document.querySelector('.cluster-detail-header');
                            if (headerNode) {
                                let nextNode = headerNode.nextElementSibling;
                                while (nextNode) {
                                    const toRemove = nextNode;
                                    nextNode = nextNode.nextElementSibling;
                                    toRemove.remove();
                                }
                                headerNode.insertAdjacentHTML('afterend', newHtml);
                            }
                        }
                    } catch(err) { console.error("Lỗi cập nhật ngầm danh sách sân con:", err); }
                }
            });
    }
);

function setupDropdowns() {
    const btn = document.getElementById('user-menu-btn');
    const menu = document.getElementById('user-dropdown');
    btn.addEventListener('click', (e) => {
        e.stopPropagation();

        // Đóng menu thông báo nếu đang mở để tránh chồng chéo
        document.getElementById('notif-dropdown').style.display = 'none';

        menu.classList.toggle('show');
    });
    document.addEventListener('click', () => menu.classList.remove('show'));

    document.addEventListener('click', () => {
        const notifDropdown = document.getElementById('notif-dropdown');
        if(notifDropdown) notifDropdown.style.display = 'none';
    });
}

function updateActiveNav(functionName) {
    // 1. Quét và cập nhật thanh điều hướng chính (main-nav)
    document.querySelectorAll('.main-nav a').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('onclick') && link.getAttribute('onclick').includes(functionName)) {
            link.classList.add('active');
        }
    });

    // 2. Quét và cập nhật menu thả xuống (user-dropdown)
    document.querySelectorAll('#user-dropdown a').forEach(link => {
        link.classList.remove('active'); // Xóa trạng thái cũ
        
        // Reset lại style mặc định để tránh bị dính màu cũ
        link.style.color = ''; 
        link.style.fontWeight = ''; 
        link.style.backgroundColor = '';

        // Nếu trùng khớp với trang đang mở
        if (link.getAttribute('onclick') && link.getAttribute('onclick').includes(functionName)) {
            link.classList.add('active');
            link.style.color = 'var(--primary)'; 
            link.style.fontWeight = '600';
            link.style.backgroundColor = 'var(--primary-light)'; 
        }
    });
}

function saveToSession() {
    sessionStorage.setItem('dn_football_selected_slots', JSON.stringify(selectedSlots));
    updateFloatingCart();
}

function updateFloatingCart() {
    const cartBar = document.getElementById('floating-cart');
    const cartCount = document.getElementById('cart-count');
    const cartDeposit = document.getElementById('floating-cart-deposit');
    
    cartBar.style.display = 'block';
    cartCount.innerText = selectedSlots.length;

    let depositRate = (currentBookingPurpose !== 'normal') ? 0.5 : 0.3; 
    let totalAmount = selectedSlots.reduce((sum, s) => sum + Number(s.price), 0);
    let depositAmount = totalAmount * depositRate;
    
    if (cartDeposit) {
        cartDeposit.innerText = depositAmount.toLocaleString('vi-VN') + 'đ';
    }
    
    const btnFloatingClear = document.querySelector('.cart-actions button[onclick="clearAllSlots()"]'); // Nút Xóa tất cả (nếu có)
    const isEmpty = selectedSlots.length === 0;

    if (btnFloatingClear) {
        btnFloatingClear.disabled = isEmpty;
        isEmpty ? btnFloatingClear.classList.add('btn-disabled') : btnFloatingClear.classList.remove('btn-disabled');
    }
}

// Hàm gọi API lấy danh sách giải đấu Đã Duyệt của khách hàng
async function loadUserTournaments() {
    try {
        const res = await fetch(`${API_BASE_URL}/giai-dau/cua-toi`);
        if (res.ok) {
            const data = await res.json();
            // Lọc và chỉ lưu lại các giải đấu đã được duyệt vào biến toàn cục
            userActiveTournaments = (data.data || []).filter(t => t.TrangThai === 'DaDuyet');
        }
    } catch (e) {
        console.error('Lỗi lấy danh sách giải đấu:', e);
    }
    return userActiveTournaments;
}

// Biến toàn cục hoặc biến cục bộ để lưu mục đích ban đầu khi mở modal
let initialBookingPurpose = currentBookingPurpose;

// Gom nhóm các khung giờ trong giỏ hàng theo từng Cụm sân (Mỗi Cụm sân = 1 Hóa đơn độc lập)
function getCustomerCartClusterGroups() {
    const groups = {};
    selectedSlots.forEach((slot, index) => {
        const cId = String(slot.clusterId);
        if (!groups[cId]) {
            groups[cId] = {
                clusterId: cId,
                clusterName: slot.clusterName || ('Cụm sân #' + cId),
                slots: [],
                rawTotal: 0
            };
        }
        groups[cId].slots.push({ ...slot, _cartIndex: index });
        groups[cId].rawTotal += Number(slot.price || 0);
    });
    return groups;
}

// Xác định phạm vi của 1 mã khuyến mãi: 'HE_THONG' | 'CUM_SAN' | 'KHACH_HANG'
function getPromoScopeType(promo) {
    if (!promo) return 'HE_THONG';
    return promo.pham_vi || (!promo.MaNguoiDung ? 'HE_THONG' : (promo.nguoi_dung?.VaiTro === 'QuanLySan' ? 'CUM_SAN' : 'KHACH_HANG'));
}

// Đánh giá chi tiết 1 mã khuyến mãi:
// - Nếu là Mã Toàn hệ thống (HE_THONG) hoặc Mã Cá nhân (KHACH_HANG): Xét điều kiện tối thiểu trên TỔNG TIỀN TOÀN GIỎ HÀNG
// - Nếu là Mã Riêng Cụm sân (CUM_SAN): Xét điều kiện tối thiểu trên TỔNG TIỀN CỦA CỤM SÂN ĐÓ
function evaluatePromotionForCluster(promo, clusterId = null) {
    if (!promo) {
        return { isEligible: false, applicableAmount: 0, actualDiscount: 0, potentialDiscount: 0, needMore: 0, lockReason: '' };
    }

    const groups = getCustomerCartClusterGroups();
    const totalCartAmount = selectedSlots.reduce((sum, s) => sum + Number(s.price || 0), 0);
    const phamVi = getPromoScopeType(promo);
    const minOrder = Number(promo.GiaTriHoaDonToiThieu || 0);

    // TRƯỜNG HỢP 1: MÃ TOÀN HỆ THỐNG HOẶC MÃ CÁ NHÂN KHÁCH HÀNG -> Xét trên Tổng tiền toàn giỏ hàng!
    if (phamVi === 'HE_THONG' || phamVi === 'KHACH_HANG') {
        const applicableAmount = totalCartAmount;
        const isEligible = applicableAmount > 0 && applicableAmount >= minOrder;
        const needMore = Math.max(0, minOrder - applicableAmount);

        let actualDiscount = 0;
        if (isEligible) {
            if (promo.LoaiKhuyenMai === 'PhanTram') {
                actualDiscount = Math.round(applicableAmount * (Number(promo.GiaTri || 0) / 100));
                const maxCap = Number(promo.GiaTriToiDa || 0);
                if (maxCap > 0 && actualDiscount > maxCap) actualDiscount = maxCap;
            } else {
                actualDiscount = Number(promo.GiaTri || 0);
            }
            actualDiscount = Math.min(applicableAmount, actualDiscount);
        }

        const baseForPreview = Math.max(applicableAmount, minOrder, 100000);
        let potentialDiscount = 0;
        if (promo.LoaiKhuyenMai === 'PhanTram') {
            potentialDiscount = Math.round(baseForPreview * (Number(promo.GiaTri || 0) / 100));
            const maxCap = Number(promo.GiaTriToiDa || 0);
            if (maxCap > 0 && potentialDiscount > maxCap) potentialDiscount = maxCap;
        } else {
            potentialDiscount = Number(promo.GiaTri || 0);
        }

        const lockReason = !isEligible
            ? `Đặt thêm ${needMore.toLocaleString('vi-VN')}đ (trên tổng giỏ hàng) để mở khóa mã này (Giảm tới ${potentialDiscount.toLocaleString('vi-VN')}đ)`
            : '';

        return {
            phamVi,
            tenCumSan: 'Toàn hệ thống',
            isEligible,
            applicableAmount,
            actualDiscount,
            potentialDiscount,
            needMore,
            minOrder,
            lockReason
        };
    }

    // TRƯỜNG HỢP 2: MÃ RIÊNG CỦA CỤM SÂN (CUM_SAN) -> Chỉ xét trên tiền sân của đúng Cụm sân đó
    const promoClusterId = String(promo.ma_cum_san_ap_dung || promo.nguoi_dung?.MaCumSan || '');
    const tenCSPromo = promo.ten_cum_san_ap_dung || promo.nguoi_dung?.cum_san?.TenCumSan || ('Cụm sân #' + promoClusterId);
    const isWrongCluster = clusterId && String(clusterId) !== promoClusterId;

    const clusterGroup = groups[promoClusterId];
    const applicableAmount = clusterGroup ? clusterGroup.rawTotal : 0;
    const isEligible = !isWrongCluster && applicableAmount > 0 && applicableAmount >= minOrder;
    const needMore = Math.max(0, minOrder - applicableAmount);

    let actualDiscount = 0;
    if (isEligible) {
        if (promo.LoaiKhuyenMai === 'PhanTram') {
            actualDiscount = Math.round(applicableAmount * (Number(promo.GiaTri || 0) / 100));
            const maxCap = Number(promo.GiaTriToiDa || 0);
            if (maxCap > 0 && actualDiscount > maxCap) actualDiscount = maxCap;
        } else {
            actualDiscount = Number(promo.GiaTri || 0);
        }
        actualDiscount = Math.min(applicableAmount, actualDiscount);
    }

    const baseForPreview = Math.max(applicableAmount, minOrder, 100000);
    let potentialDiscount = 0;
    if (promo.LoaiKhuyenMai === 'PhanTram') {
        potentialDiscount = Math.round(baseForPreview * (Number(promo.GiaTri || 0) / 100));
        const maxCap = Number(promo.GiaTriToiDa || 0);
        if (maxCap > 0 && potentialDiscount > maxCap) potentialDiscount = maxCap;
    } else {
        potentialDiscount = Number(promo.GiaTri || 0);
    }

    let lockReason = '';
    if (isWrongCluster || !clusterGroup) {
        lockReason = `Mã này chỉ áp dụng riêng cho ${tenCSPromo}`;
    } else if (!isEligible) {
        lockReason = `Đặt thêm ${needMore.toLocaleString('vi-VN')}đ tại ${tenCSPromo} để dùng mã (Giảm tới ${potentialDiscount.toLocaleString('vi-VN')}đ)`;
    }

    return {
        phamVi,
        tenCumSan: tenCSPromo,
        isEligible,
        applicableAmount,
        actualDiscount,
        potentialDiscount,
        needMore,
        minOrder,
        lockReason
    };
}

// Hàm đồng bộ làm sạch các mã đã chọn nếu khách xóa bớt sân làm mất điều kiện
function revalidateSelectedPromotionsByCluster() {
    const groups = getCustomerCartClusterGroups();

    // 1. Kiểm tra nếu đang chọn 1 mã Toàn hệ thống / Cá nhân (selectedPromotion)
    if (selectedPromotion) {
        const freshGlobal = availablePromotions.find(p => p.MaKhuyenMai === selectedPromotion.MaKhuyenMai);
        if (!freshGlobal || !evaluatePromotionForCluster(freshGlobal, null).isEligible) {
            selectedPromotion = null;
        } else {
            selectedPromotion = freshGlobal;
        }
    }

    // 2. Kiểm tra các mã riêng theo từng Cụm sân (selectedPromotionsByCluster)
    for (const cId of Object.keys(selectedPromotionsByCluster)) {
        if (!groups[cId]) {
            delete selectedPromotionsByCluster[cId];
            continue;
        }
        const chosen = selectedPromotionsByCluster[cId];
        const freshPromo = availablePromotions.find(p => p.MaKhuyenMai === chosen?.MaKhuyenMai);
        if (!freshPromo || !evaluatePromotionForCluster(freshPromo, cId).isEligible) {
            delete selectedPromotionsByCluster[cId];
        } else {
            selectedPromotionsByCluster[cId] = freshPromo;
        }
    }
}

// Tính toán chi tiết số tiền giảm, thuế VAT 8% và tổng hóa đơn cho từng Cụm sân trong giỏ
function calculateCartClustersBreakdown() {
    revalidateSelectedPromotionsByCluster();

    const groups = getCustomerCartClusterGroups();
    const clusterList = Object.values(groups);
    const totalRawAmount = selectedSlots.reduce((sum, s) => sum + Number(s.price || 0), 0);

    let totalDiscount = 0;
    let totalVAT = 0;
    let totalInvoice = 0;
    const perCluster = {};

    if (selectedPromotion) {
        // ĐANG ÁP 1 MÃ TOÀN HỆ THỐNG HOẶC CÁ NHÂN CHO CẢ GIỎ HÀNG -> Phân bổ tiền giảm theo tỷ lệ tiền sân từng Cụm
        const evGlobal = evaluatePromotionForCluster(selectedPromotion, null);
        const globalDiscount = evGlobal.isEligible ? evGlobal.actualDiscount : 0;
        let allocatedSoFar = 0;

        clusterList.forEach((grp, idx) => {
            let clusterDisc = 0;
            if (globalDiscount > 0 && totalRawAmount > 0) {
                if (idx === clusterList.length - 1) {
                    clusterDisc = Math.max(0, globalDiscount - allocatedSoFar);
                } else {
                    clusterDisc = Math.round(globalDiscount * (grp.rawTotal / totalRawAmount));
                    allocatedSoFar += clusterDisc;
                }
                clusterDisc = Math.min(grp.rawTotal, clusterDisc);
            }
            const afterDisc = Math.max(0, grp.rawTotal - clusterDisc);
            const vat = Math.floor((afterDisc * CUSTOMER_VAT_RATE) / 1000) * 1000;
            const invTotal = afterDisc + vat;

            perCluster[grp.clusterId] = {
                rawTotal: grp.rawTotal,
                discount: clusterDisc,
                vat,
                invoiceTotal: invTotal,
                promo: selectedPromotion,
                isGlobalAllocated: true
            };

            totalDiscount += clusterDisc;
            totalVAT += vat;
            totalInvoice += invTotal;
        });
    } else {
        // ĐANG ÁP MÃ RIÊNG THEO TỪNG CỤM SÂN
        clusterList.forEach(grp => {
            const cPromo = selectedPromotionsByCluster[grp.clusterId] || null;
            const ev = cPromo ? evaluatePromotionForCluster(cPromo, grp.clusterId) : null;
            const clusterDisc = (ev && ev.isEligible) ? ev.actualDiscount : 0;
            const afterDisc = Math.max(0, grp.rawTotal - clusterDisc);
            const vat = Math.floor((afterDisc * CUSTOMER_VAT_RATE) / 1000) * 1000;
            const invTotal = afterDisc + vat;

            perCluster[grp.clusterId] = {
                rawTotal: grp.rawTotal,
                discount: clusterDisc,
                vat,
                invoiceTotal: invTotal,
                promo: cPromo,
                isGlobalAllocated: false
            };

            totalDiscount += clusterDisc;
            totalVAT += vat;
            totalInvoice += invTotal;
        });
    }

    return {
        totalRawAmount,
        totalDiscount,
        totalVAT,
        totalInvoice,
        perCluster
    };
}

// Hàm tải danh sách khuyến mãi khả dụng của khách hàng
async function fetchAvailablePromotions(tongTienSan = 0) {
    try {
        const res = await fetch(`${API_BASE_URL}/khuyen-mai/kha-dung?tong_tien=${tongTienSan}`);
        if (res.ok) {
            const json = await res.json();
            availablePromotions = json.data || [];
            revalidateSelectedPromotionsByCluster();
        }
    } catch (e) {
        console.error('Lỗi tải khuyến mãi:', e);
    }
}

async function openCartModal() {
    const modal = document.getElementById('cart-modal');
    const modalContent = modal ? modal.querySelector('.modal-content') : null;
    if (modalContent) {
        modalContent.style.maxWidth = '740px';
        modalContent.style.width = '95%';
    }
    const modalList = document.getElementById('modal-cart-list');
    const alertBox = document.getElementById('cart-alert');
    if (alertBox) alertBox.style.display = 'none';

    initialBookingPurpose = currentBookingPurpose;

    let totalAmount = selectedSlots.reduce((sum, s) => sum + Number(s.price), 0);

    await Promise.all([
        loadUserTournaments(),
        fetchAvailablePromotions(totalAmount)
    ]);
    
    let activeClusterId = currentClusterId;
    if (!activeClusterId && selectedSlots.length > 0) {
        activeClusterId = selectedSlots[0].clusterId;
    }

    const validTournaments = activeClusterId 
        ? userActiveTournaments.filter(t => t.ID_CumSan == activeClusterId || t.id_cum_san == activeClusterId || t.MaCumSan == activeClusterId) 
        : [];
    
    if (currentBookingPurpose !== 'normal') {
        const isPurposeValid = validTournaments.some(t => (t.MaGiaiDau || t.ID) == currentBookingPurpose);
        if (!isPurposeValid) {
            currentBookingPurpose = 'normal';
            sessionStorage.setItem('dn_football_booking_purpose', 'normal');
        }
    }

    let tournamentHtml = '';
    if (validTournaments.length > 0) {
        tournamentHtml = `
            <div style="margin-bottom: 15px; padding: 12px; background: var(--primary-light); border: 1px solid #bbf7d0; border-radius: 8px;">
                <label style="font-weight: 600; font-size: 0.9rem; color: var(--primary); display: block; margin-bottom: 6px;">Mục đích đặt sân:</label>
                <select id="booking-purpose" class="form-control" onchange="handlePurposeChange(this)" style="border-color: #bbf7d0;">
                    <option value="normal" ${currentBookingPurpose === 'normal' ? 'selected' : ''}>Đá phong trào (Cọc 30% - Lịch 7 ngày)</option>
                    ${validTournaments.map(t => `<option value="${t.MaGiaiDau || t.ID}" ${currentBookingPurpose == (t.MaGiaiDau || t.ID) ? 'selected' : ''}>Giải đấu: ${t.TenGiaiDau} (Cọc 50% - Theo lịch giải)</option>`).join('')}
                </select>
            </div>
        `;
    }
    
    if (selectedSlots.length === 0) {
        selectedPromotion = null;
        selectedPromotionsByCluster = {};
        modalList.innerHTML = tournamentHtml + `<p style="text-align: center; color: var(--text-muted); padding: 20px;">Chưa có khung giờ nào được chọn.</p>`;
    } else {
        const clusterGroups = Object.values(getCustomerCartClusterGroups());
        const isMultiCluster = clusterGroups.length > 1;
        const breakdown = calculateCartClustersBreakdown();

        const multiClusterNoticeHtml = isMultiCluster ? `
            <div style="margin-bottom: 12px; padding: 10px 14px; background: #eff6ff; border: 1px solid #bfdbfe; border-left: 4px solid #2563eb; border-radius: 8px; font-size: 0.82rem; color: #1e3a8a; line-height: 1.5;">
                <i class="fa-solid fa-file-invoice" style="margin-right: 5px; color: #2563eb;"></i>
                Giỏ hàng gồm <strong>${clusterGroups.length} Cụm sân</strong> (sẽ tách thành <strong>${clusterGroups.length} Hóa đơn riêng</strong>). Bạn có thể chọn <strong>1 mã Toàn hệ thống / Cá nhân</strong> (tự động chia đều giảm giá cho cả ${clusterGroups.length} hóa đơn) HOẶC chọn <strong>mã riêng của từng Cụm sân</strong>!
            </div>
        ` : '';

        // Vẽ từng khối Cụm sân
        const clusterSectionsHtml = clusterGroups.map((grp, grpIdx) => {
            const cId = grp.clusterId;
            const cCalc = breakdown.perCluster[cId] || { rawTotal: grp.rawTotal, discount: 0, vat: 0, invoiceTotal: grp.rawTotal };
            const chosenPromo = cCalc.promo;

            const eligibleCountForCluster = availablePromotions.filter(p => evaluatePromotionForCluster(p, cId).isEligible).length;

            const slotsHtml = grp.slots.map(s => `
                <div class="cart-item-card" style="margin-bottom: 8px;">
                    <div class="cart-item-info">
                        <h4>${s.pitchName} <span style="font-size: 0.78rem; color: #64748b; font-weight: 500;">(${s.clusterName})</span></h4>
                        <p>Ngày: ${s.date} | Giờ: <strong style="color: var(--primary);">${s.time}</strong></p>
                        <p>Đơn giá khung giờ: <strong>${Number(s.price).toLocaleString('vi-VN')}đ</strong></p>
                    </div>
                    <i class="fa-solid fa-trash-can cart-item-remove" onclick="removeSlotByIndex(${s._cartIndex})"></i>
                </div>
            `).join('');

            const discountNote = cCalc.isGlobalAllocated && isMultiCluster
                ? `Đã phân bổ từ mã chung (Tổng giảm ${breakdown.totalDiscount.toLocaleString('vi-VN')}đ) • Giảm tại cơ sở này: -${cCalc.discount.toLocaleString('vi-VN')}đ`
                : `Đã áp dụng • Giảm ${cCalc.discount.toLocaleString('vi-VN')}đ`;

            const clusterPromoBarHtml = chosenPromo ? `
                <div onclick="openGrabPromoModal('${cId}')" style="margin-top: 8px; padding: 10px 12px; border-radius: 10px; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 1.5px solid #22c55e; display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 32px; height: 32px; border-radius: 8px; background: #16a34a; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">
                            <i class="fa-solid fa-ticket"></i>
                        </div>
                        <div style="text-align: left;">
                            <div style="font-size: 0.84rem; font-weight: 800; color: #15803d;">${chosenPromo.TenKhuyenMai} (#${chosenPromo.MaKhuyenMai})</div>
                            <div style="font-size: 0.75rem; color: #166534; font-weight: 600;">${discountNote}</div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button type="button" onclick="event.stopPropagation(); removeSelectedPromo('${cId}');" style="background: #fee2e2; color: #dc2626; border: none; padding: 4px 9px; border-radius: 6px; font-size: 0.74rem; font-weight: 700; cursor: pointer;">Bỏ chọn</button>
                        <i class="fa-solid fa-chevron-right" style="color: #15803d; font-size: 0.8rem;"></i>
                    </div>
                </div>
            ` : `
                <div onclick="openGrabPromoModal('${cId}')" style="margin-top: 8px; padding: 10px 12px; border-radius: 10px; background: #ffffff; border: 1.5px dashed #94a3b8; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: 0.2s;" onmouseover="this.style.borderColor='var(--primary)'; this.style.background='#f0fdf4'" onmouseout="this.style.borderColor='#94a3b8'; this.style.background='#ffffff'">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 32px; height: 32px; border-radius: 8px; background: #e0f2fe; color: #0284c7; display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">
                            <i class="fa-solid fa-tags"></i>
                        </div>
                        <div style="text-align: left;">
                            <div style="font-size: 0.84rem; font-weight: 700; color: #0f172a;">Chọn mã ưu đãi cho ${grp.clusterName}</div>
                            <div style="font-size: 0.75rem; color: #64748b;">
                                ${eligibleCountForCluster > 0 
                                    ? `<span style="color: #16a34a; font-weight: 700;">Có ${eligibleCountForCluster} mã đủ điều kiện áp dụng ngay!</span>` 
                                    : (availablePromotions.length > 0 ? `Bấm để xem mã giảm giá` : 'Hiện chưa có mã khuyến mãi')}
                            </div>
                        </div>
                    </div>
                    <span style="font-size: 0.8rem; font-weight: 700; color: var(--primary); display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">
                        Chọn mã <i class="fa-solid fa-chevron-right" style="font-size: 0.72rem;"></i>
                    </span>
                </div>
            `;

            const subInvoiceSummaryHtml = isMultiCluster ? `
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 0.78rem; color: #475569;">
                    <span>Tiền sân: <strong>${grp.rawTotal.toLocaleString('vi-VN')}đ</strong></span>
                    ${cCalc.discount > 0 ? `<span style="color:#16a34a;">Giảm: <strong>-${cCalc.discount.toLocaleString('vi-VN')}đ</strong></span>` : ''}
                    <span>VAT (8%): <strong>+${cCalc.vat.toLocaleString('vi-VN')}đ</strong></span>
                    <span style="color:#2563eb;">Tổng HĐ #${grpIdx + 1}: <strong>${cCalc.invoiceTotal.toLocaleString('vi-VN')}đ</strong></span>
                </div>
            ` : '';

            return `
                <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0;">
                        <span style="font-size: 0.88rem; font-weight: 800; color: var(--primary);">
                            <i class="fa-solid fa-building-flag" style="margin-right: 5px;"></i>Hóa đơn ${isMultiCluster ? `#${grpIdx + 1}: ` : ''}${grp.clusterName}
                        </span>
                        <span style="font-size: 0.8rem; font-weight: 700; color: #334155;">${grp.slots.length} ca • ${grp.rawTotal.toLocaleString('vi-VN')}đ</span>
                    </div>
                    ${slotsHtml}
                    ${clusterPromoBarHtml}
                    ${subInvoiceSummaryHtml}
                </div>
            `;
        }).join('');

        modalList.innerHTML = tournamentHtml + multiClusterNoticeHtml + `
            <div id="cart-items-container" style="max-height: 380px; overflow-y: auto; padding-right: 6px;">
                ${clusterSectionsHtml}
            </div>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin-top: 10px; font-size: 0.9rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #475569;">
                    <span>Tổng tiền sân gốc (${selectedSlots.length} ca${isMultiCluster ? ` • ${clusterGroups.length} Hóa đơn` : ''}):</span>
                    <strong id="cart-raw-total" style="color: #0f172a;">${totalAmount.toLocaleString('vi-VN')}đ</strong>
                </div>
                <div id="cart-discount-row" style="display: none; justify-content: space-between; margin-bottom: 6px; color: #16a34a;">
                    <span><i class="fa-solid fa-ticket"></i> Tổng khuyến mãi giảm:</span>
                    <strong id="cart-discount-amount">-0đ</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed #cbd5e1; color: #64748b;">
                    <span>Tổng thuế VAT (8% trên từng hóa đơn):</span>
                    <strong id="cart-vat-amount">0đ</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.96rem; color: #0f172a;">
                    <span style="font-weight: 700;">Tổng cộng thanh toán (${clusterGroups.length} Hóa đơn):</span>
                    <strong id="cart-invoice-total" style="color: #2563eb; font-size: 1.05rem;">0đ</strong>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 6px; border-top: 1px solid #e2e8f0;">
                    <span style="font-weight: 700; color: #0f172a;">Tiền cần cọc ngay (<span id="cart-deposit-rate-label">30%</span> giá sân):</span>
                    <span id="cart-deposit-amount" style="font-size: 1.2rem; font-weight: 800; color: var(--primary);">0đ</span>
                </div>
            </div>
        `;
        setTimeout(updateCartTotal, 20);
    }

    const btnModalCheckout = document.querySelector('#cart-modal .btn-primary'); 
    const btnModalClear = document.querySelector('#cart-modal button[onclick="clearAllSlots()"]'); 
    const isEmpty = selectedSlots.length === 0;

    if (btnModalCheckout) {
        btnModalCheckout.disabled = isEmpty;
        isEmpty ? btnModalCheckout.classList.add('btn-disabled') : btnModalCheckout.classList.remove('btn-disabled');
    }
    if (btnModalClear) {
        btnModalClear.disabled = isEmpty;
        isEmpty ? btnModalClear.classList.add('btn-disabled') : btnModalClear.classList.remove('btn-disabled');
    }

    modal.style.display = 'flex';
}

// ======================================================
// MODAL CHỌN MÃ GIẢM GIÁ KIỂU GRAB
// ======================================================
window.openGrabPromoModal = function(targetClusterId = null) {
    const groups = getCustomerCartClusterGroups();
    const clusterIds = Object.keys(groups);
    if (clusterIds.length === 0) return;

    activePromoTargetClusterId = targetClusterId ? String(targetClusterId) : clusterIds[0];
    const targetGroup = groups[activePromoTargetClusterId];
    if (!targetGroup) return;

    let modal = document.getElementById('grab-promo-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'grab-promo-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10050; align-items: center; justify-content: center;';
        modal.onclick = function(e) {
            if (e.target === modal) modal.style.display = 'none';
        };
        document.body.appendChild(modal);
    }

    const totalCartAmount = selectedSlots.reduce((sum, s) => sum + Number(s.price || 0), 0);
    const clusterAmount = targetGroup.rawTotal;
    const currentlySelected = selectedPromotion || selectedPromotionsByCluster[activePromoTargetClusterId] || null;

    const sortedPromos = [...availablePromotions].sort((a, b) => {
        const evalA = evaluatePromotionForCluster(a, activePromoTargetClusterId);
        const evalB = evaluatePromotionForCluster(b, activePromoTargetClusterId);
        if (evalA.isEligible !== evalB.isEligible) return evalB.isEligible ? 1 : -1;
        return evalB.actualDiscount - evalA.actualDiscount;
    });

    let listHtml = '';
    if (sortedPromos.length === 0) {
        listHtml = `
            <div style="text-align: center; padding: 45px 20px; color: #64748b;">
                <i class="fa-solid fa-ticket-simple" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 12px; display: block;"></i>
                <div style="font-weight: 700; color: #334155; margin-bottom: 4px;">Hiện chưa có mã khuyến mãi khả dụng</div>
                <div style="font-size: 0.85rem;">Hãy quay lại sau để săn các ưu đãi mới từ DN Football nhé!</div>
            </div>
        `;
    } else {
        listHtml = sortedPromos.map(km => {
            const ev = evaluatePromotionForCluster(km, activePromoTargetClusterId);
            const isSelected = currentlySelected && currentlySelected.MaKhuyenMai === km.MaKhuyenMai;

            const valBadge = km.LoaiKhuyenMai === 'PhanTram'
                ? `GIẢM ${Number(km.GiaTri)}%`
                : `GIẢM ${(Number(km.GiaTri) / 1000).toLocaleString('vi-VN')}K`;

            const maxCapStr = (km.LoaiKhuyenMai === 'PhanTram' && Number(km.GiaTriToiDa) > 0)
                ? `Tối đa ${Number(km.GiaTriToiDa).toLocaleString('vi-VN')}đ`
                : 'Giảm trực tiếp';

            const expDate = km.NgayKetThuc ? new Date(km.NgayKetThuc).toLocaleDateString('vi-VN') : '';
            const remainCount = Math.max(0, Number(km.SoLuong) - Number(km.SoLuongDaDung));

            let scopeBadgeHtml = '';
            if (ev.phamVi === 'HE_THONG') {
                scopeBadgeHtml = `<span style="background: #e0f2fe; color: #0369a1; font-size: 0.68rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; margin-left: 6px;"><i class="fa-solid fa-globe"></i> Toàn hệ thống (Xét tổng giỏ)</span>`;
            } else if (ev.phamVi === 'CUM_SAN') {
                scopeBadgeHtml = `<span style="background: #fffbeb; color: #b45309; border: 1px solid #fde68a; font-size: 0.68rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; margin-left: 6px;"><i class="fa-solid fa-building-flag"></i> ${ev.tenCumSan}</span>`;
            } else {
                scopeBadgeHtml = `<span style="background: linear-gradient(135deg, #7c3aed, #6d28d9); color: #fff; font-size: 0.68rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; margin-left: 6px;"><i class="fa-solid fa-gift"></i> Dành riêng cho bạn (Xét tổng giỏ)</span>`;
            }

            const cardStyle = ev.isEligible
                ? `background: #ffffff; border: 2px solid ${isSelected ? '#16a34a' : '#bbf7d0'}; box-shadow: 0 4px 12px rgba(22, 163, 74, 0.1); cursor: pointer;`
                : `background: #f1f5f9; border: 1.5px solid #cbd5e1; opacity: 0.62; filter: grayscale(0.8); cursor: not-allowed;`;

            const leftStubBg = ev.isEligible
                ? 'linear-gradient(135deg, #16a34a 0%, #059669 100%)'
                : 'linear-gradient(135deg, #64748b 0%, #475569 100%)';

            const progressPct = ev.minOrder > 0 ? Math.min(100, Math.round((ev.applicableAmount / ev.minOrder) * 100)) : 100;

            return `
                <div onclick="${ev.isEligible ? `applyGrabPromotion('${km.MaKhuyenMai}', '${activePromoTargetClusterId}')` : ''}" style="display: flex; border-radius: 14px; overflow: hidden; margin-bottom: 12px; transition: all 0.2s; ${cardStyle}">
                    <div style="width: 116px; background: ${leftStubBg}; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12px 8px; text-align: center; border-right: 2px dashed rgba(255,255,255,0.6); flex-shrink: 0;">
                        <i class="fa-solid fa-ticket" style="font-size: 1.35rem; margin-bottom: 4px; opacity: 0.9;"></i>
                        <div style="font-weight: 800; font-size: 0.92rem; line-height: 1.2;">${valBadge}</div>
                        <div style="font-size: 0.68rem; opacity: 0.92; margin-top: 3px;">${maxCapStr}</div>
                        <div style="font-family: monospace; font-size: 0.66rem; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px; margin-top: 5px;">#${km.MaKhuyenMai}</div>
                    </div>

                    <div style="flex: 1; padding: 12px 14px; display: flex; flex-direction: column; justify-content: space-between; text-align: left;">
                        <div>
                            <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-bottom: 4px;">
                                <strong style="font-size: 0.95rem; color: #0f172a;">${km.TenKhuyenMai}</strong>
                                ${scopeBadgeHtml}
                            </div>
                            ${km.MoTa ? `<div style="font-size: 0.8rem; color: #475569; margin-bottom: 6px;">${km.MoTa}</div>` : ''}
                            <div style="font-size: 0.78rem; color: #64748b; display: flex; flex-wrap: wrap; gap: 8px;">
                                <span>Đơn tối thiểu: <strong>${ev.minOrder.toLocaleString('vi-VN')}đ</strong></span>
                                <span>&bull; Số lượng còn: <strong style="color: #0f172a;">${remainCount}/${km.SoLuong}</strong></span>
                                <span>&bull; HSD: <strong>${expDate}</strong></span>
                            </div>
                        </div>

                        ${ev.isEligible ? `
                            <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px dashed #e2e8f0; gap: 8px;">
                                <span style="font-size: 0.81rem; color: #16a34a; font-weight: 700;">
                                    <i class="fa-solid fa-circle-check"></i> Đủ điều kiện • Giảm ngay <strong>${ev.actualDiscount.toLocaleString('vi-VN')}đ</strong>
                                </span>
                                <button type="button" style="padding: 6px 14px; border-radius: 999px; border: none; background: ${isSelected ? '#0f172a' : '#16a34a'}; color: #fff; font-size: 0.8rem; font-weight: 700; cursor: pointer; white-space: nowrap;">
                                    ${isSelected ? 'Đang chọn ✓' : 'Áp dụng'}
                                </button>
                            </div>
                        ` : `
                            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed #cbd5e1;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; gap: 8px;">
                                    <span style="font-size: 0.77rem; color: #dc2626; font-weight: 700; line-height: 1.35;">
                                        <i class="fa-solid fa-lock"></i> ${ev.lockReason}
                                    </span>
                                    <button type="button" disabled style="padding: 4px 10px; border-radius: 999px; border: 1px solid #cbd5e1; background: #e2e8f0; color: #94a3b8; font-size: 0.74rem; font-weight: 700; cursor: not-allowed; white-space: nowrap; flex-shrink: 0;">
                                        Không khả dụng
                                    </button>
                                </div>
                                <div style="width: 100%; height: 5px; background: #cbd5e1; border-radius: 99px; overflow: hidden;">
                                    <div style="width: ${progressPct}%; height: 100%; background: #f59e0b;"></div>
                                </div>
                            </div>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 570px; width: 94%; padding: 0; border-radius: 18px; overflow: hidden; background: #f8fafc; max-height: 86vh; display: flex; flex-direction: column;">
            <div style="padding: 16px 20px; background: linear-gradient(135deg, #0b5d3b 0%, #16a34a 100%); color: #fff; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h3 style="margin: 0; font-size: 1.1rem; font-weight: 800;"><i class="fa-solid fa-ticket" style="color: #fde047; margin-right: 8px;"></i>Chọn ưu đãi (${targetGroup.clusterName})</h3>
                    <div style="font-size: 0.8rem; opacity: 0.95; margin-top: 3px;">
                        Tiền cơ sở này: <strong>${clusterAmount.toLocaleString('vi-VN')}đ</strong> &bull; Tổng cả giỏ hàng: <strong>${totalCartAmount.toLocaleString('vi-VN')}đ</strong>
                    </div>
                </div>
                <i class="fa-solid fa-xmark" style="cursor: pointer; font-size: 1.25rem;" onclick="document.getElementById('grab-promo-modal').style.display='none'"></i>
            </div>

            <div style="padding: 16px 18px; overflow-y: auto; flex: 1;">
                ${listHtml}
            </div>

            <div style="padding: 12px 18px; background: #fff; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.78rem; color: #64748b;">* Mã Toàn hệ thống / Cá nhân sẽ tự động phân bổ giảm giá cho toàn bộ giỏ hàng.</span>
                <button type="button" class="btn-outline" style="width: auto; padding: 8px 22px; border-radius: 10px;" onclick="document.getElementById('grab-promo-modal').style.display='none'">Đóng</button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
};

window.applyGrabPromotion = function(maKhuyenMai, clusterId = null) {
    const targetCId = clusterId || activePromoTargetClusterId;
    if (!targetCId) return;

    const found = availablePromotions.find(p => p.MaKhuyenMai === maKhuyenMai);
    if (!found) return;

    const ev = evaluatePromotionForCluster(found, targetCId);
    if (!ev.isEligible) return;

    const phamVi = getPromoScopeType(found);
    if (phamVi === 'HE_THONG' || phamVi === 'KHACH_HANG') {
        // Nếu chọn Mã Toàn hệ thống hoặc Cá nhân -> Áp cho toàn bộ giỏ hàng và xóa các mã lẻ cụm sân
        selectedPromotion = found;
        selectedPromotionsByCluster = {};
    } else {
        // Nếu chọn Mã riêng của Cụm sân -> Bỏ mã chung toàn giỏ (nếu đang chọn) và gắn vào đúng Cụm sân này
        selectedPromotion = null;
        selectedPromotionsByCluster[String(targetCId)] = found;
    }

    const promoModal = document.getElementById('grab-promo-modal');
    if (promoModal) promoModal.style.display = 'none';

    openCartModal();
};

window.removeSelectedPromo = function(clusterId = null) {
    if (selectedPromotion) {
        selectedPromotion = null;
    } else if (clusterId) {
        delete selectedPromotionsByCluster[String(clusterId)];
    } else {
        selectedPromotionsByCluster = {};
    }
    openCartModal();
};

let pendingBookingPurpose = null;
let pendingSelectElement = null;

function handlePurposeChange(selectElement) {
    if (selectedSlots.length > 0) {
        pendingBookingPurpose = selectElement.value;
        pendingSelectElement = selectElement;
        document.getElementById('purpose-confirm-modal').style.display = 'flex';
    } else {
        currentBookingPurpose = selectElement.value;
        sessionStorage.setItem('dn_football_booking_purpose', currentBookingPurpose); 
        updateCartTotal();
    }
}

function confirmPurposeChange() {
    document.getElementById('purpose-confirm-modal').style.display = 'none';
    if (pendingBookingPurpose !== null) {
        currentBookingPurpose = pendingBookingPurpose;
        sessionStorage.setItem('dn_football_booking_purpose', currentBookingPurpose); 
        clearAllSlots(); 
    }
    pendingBookingPurpose = null;
    pendingSelectElement = null;
}

function cancelPurposeChange() {
    document.getElementById('purpose-confirm-modal').style.display = 'none';
    if (pendingSelectElement) {
        pendingSelectElement.value = currentBookingPurpose;
    }
    pendingBookingPurpose = null;
    pendingSelectElement = null;
}

function updateCartTotal() {
    const breakdown = calculateCartClustersBreakdown();
    let depositRate = (currentBookingPurpose !== 'normal') ? 0.5 : 0.3; 
    let depositAmount = breakdown.totalRawAmount * depositRate;
    
    const depositEl = document.getElementById('cart-deposit-amount');
    if (depositEl) depositEl.innerText = depositAmount.toLocaleString('vi-VN') + 'đ';

    const rateLabelEl = document.getElementById('cart-deposit-rate-label');
    if (rateLabelEl) rateLabelEl.innerText = (depositRate * 100) + '%';

    const vatEl = document.getElementById('cart-vat-amount');
    if (vatEl) vatEl.innerText = breakdown.totalVAT.toLocaleString('vi-VN') + 'đ';

    const invTotalEl = document.getElementById('cart-invoice-total');
    if (invTotalEl) invTotalEl.innerText = breakdown.totalInvoice.toLocaleString('vi-VN') + 'đ';

    const discRowEl = document.getElementById('cart-discount-row');
    const discAmtEl = document.getElementById('cart-discount-amount');
    if (discRowEl && discAmtEl) {
        if (breakdown.totalDiscount > 0) {
            discRowEl.style.display = 'flex';
            discAmtEl.innerText = '-' + breakdown.totalDiscount.toLocaleString('vi-VN') + 'đ';
        } else {
            discRowEl.style.display = 'none';
        }
    }
}

function closeCartModal() {
    document.getElementById('cart-modal').style.display = 'none';

    const alertBox = document.getElementById('cart-alert');
    if (alertBox) alertBox.style.display = 'none';

    const purposeSelect = document.getElementById('booking-purpose');
    if (purposeSelect) {
        currentBookingPurpose = purposeSelect.value;
        sessionStorage.setItem('dn_football_booking_purpose', currentBookingPurpose);
    }

    const isPurposeChanged = (currentBookingPurpose !== initialBookingPurpose);

    if (currentClusterId !== null && currentPitchId !== null) {
        let needReRender = isPurposeChanged;

        if (currentBookingPurpose !== 'normal') {
            const tour = userActiveTournaments.find(t => (t.MaGiaiDau || t.ID) == currentBookingPurpose);
            if (!tour || (tour.ID_CumSan != currentClusterId && tour.id_cum_san != currentClusterId && tour.MaCumSan != currentClusterId)) {
                currentBookingPurpose = 'normal';
                sessionStorage.setItem('dn_football_booking_purpose', 'normal');
                selectedSlots = [];
                saveToSession();
                needReRender = true;
            }
        }

        if (needReRender) {
            renderSchedule(currentClusterId, currentClusterName, currentPitchId, currentPitchName, currentLoaiSanId, currentPitchType);
        }
    }
}

function removeSlotByIndex(index) {
    const removedSlot = selectedSlots[index];
    if (!removedSlot) return;

    selectedSlots.splice(index, 1);
    updateSlotUI(removedSlot, false);
    saveToSession();
    openCartModal();
}

function clearAllSlots() {
    const slotsToRemove = [...selectedSlots];
    selectedSlots = [];
    selectedPromotion = null;
    selectedPromotionsByCluster = {};

    slotsToRemove.forEach(slot => {
        updateSlotUI(slot, false);
    });

    saveToSession();

    const cartModal = document.getElementById('cart-modal');
    if (cartModal) cartModal.style.display = 'none';

    const alertBox = document.getElementById('cart-alert');
    if (alertBox) alertBox.style.display = 'none';
}

function showCustomerBookingModal(title, message, isSuccess = true, actionType = null, maHoaDon = null, maHoaDons = []) {
    let modal = document.getElementById('customer-booking-result-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'customer-booking-result-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 100000; align-items: center; justify-content: center;';
        modal.onclick = function(e) {
            if (e.target === modal) closeCustomerBookingModal();
        };
        document.body.appendChild(modal);
    }

    const invoiceList = (Array.isArray(maHoaDons) && maHoaDons.length > 0)
        ? maHoaDons
        : (maHoaDon ? [maHoaDon] : []);

    const modalBg = isSuccess
        ? 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)'
        : 'linear-gradient(180deg, #fff1f2 0%, #ffe4e6 100%)';
    const modalBorder = isSuccess ? '1.5px solid #bbf7d0' : '1.5px solid #fda4af';
    const titleColor = isSuccess ? '#065f46' : '#9f1239';
    const msgBg = isSuccess ? '#ecfdf5' : 'rgba(255, 255, 255, 0.75)';
    const msgBorder = isSuccess ? '1px solid #a7f3d0' : '1px dashed #fda4af';
    const msgColor = isSuccess ? '#047857' : '#881337';

    const iconHtml = isSuccess
        ? '<div style="width: 72px; height: 72px; border-radius: 50%; background: #d1fae5; color: #059669; border: 3px solid #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 2.3rem; margin-bottom: 14px; box-shadow: 0 6px 16px rgba(16, 185, 129, 0.22);"><i class="fa-solid fa-check"></i></div>'
        : '<div style="width: 72px; height: 72px; border-radius: 50%; background: #fecdd3; color: #e11d48; border: 3px solid #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 2.3rem; margin-bottom: 14px; box-shadow: 0 6px 16px rgba(225, 29, 72, 0.2);"><i class="fa-solid fa-xmark"></i></div>';

    let actionButtonsHtml = '';
    if (isSuccess) {
        const printButtons = invoiceList.map(idHD => `
            <button type="button" class="btn-primary" style="flex: 1.2; padding: 11px 12px; border-radius: 10px; font-weight: 700; background: #2563eb; border-color: #2563eb; white-space: nowrap;" onclick="printCustomerBookingInvoice('${idHD}')">
                <i class="fa-solid fa-print" style="margin-right: 5px;"></i> Xuất HĐ #${idHD}
            </button>
        `).join('');

        actionButtonsHtml = `
            <button type="button" class="btn-outline" style="flex: 1; padding: 11px 12px; border-radius: 10px; font-weight: 600; background: #fff; border-color: #cbd5e1; color: #475569;" onclick="closeCustomerBookingModal()">Đóng</button>
            ${printButtons}
            <button type="button" class="btn-primary" style="flex: 1.2; padding: 11px 12px; border-radius: 10px; font-weight: 700; background: #10b981; border-color: #10b981; white-space: nowrap;" onclick="closeCustomerBookingModal(); renderMyBookings();">
                <i class="fa-solid fa-ticket" style="margin-right: 5px;"></i> Xem hóa đơn & vé
            </button>
        `;
    } else if (actionType === 'topup') {
        actionButtonsHtml = `
            <button type="button" class="btn-outline" style="flex: 1; padding: 11px 16px; border-radius: 10px; font-weight: 600; background: #ffffff; border: 1px solid #fda4af; color: #be123c;" onclick="closeCustomerBookingModal()">Đóng</button>
            <button type="button" class="btn-primary" style="flex: 1; padding: 11px 16px; border-radius: 10px; font-weight: 600; background: #2563eb; border-color: #2563eb;" onclick="closeCustomerBookingModal(); closeCartModal(); openDepositModal();">
                <i class="fa-solid fa-wallet" style="margin-right: 6px;"></i> Nạp tiền ngay
            </button>
        `;
    } else {
        actionButtonsHtml = `
            <button type="button" class="btn-primary" style="width: 100%; padding: 11px 24px; border-radius: 10px; font-weight: 600; background: #e11d48; border-color: #e11d48;" onclick="closeCustomerBookingModal()">Đã hiểu</button>
        `;
    }

    const invoiceNoteHtml = (isSuccess && invoiceList.length > 0)
        ? `<div style="margin-top:8px; color:#0f172a; font-weight:700;">Mã hóa đơn: #${invoiceList.join(', #')} — Bạn có thể in từng hóa đơn ngay bên dưới!</div>`
        : '';

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px; width: 94%; text-align: center; padding: 28px 24px; border-radius: 18px; background: ${modalBg}; border: ${modalBorder}; box-shadow: 0 20px 40px rgba(15, 23, 42, 0.25);">
            ${iconHtml}
            <h3 style="margin: 0 0 12px 0; font-size: 1.4rem; font-weight: 800; color: ${titleColor};">${title}</h3>
            <div style="background: ${msgBg}; border: ${msgBorder}; color: ${msgColor}; padding: 12px 16px; border-radius: 12px; margin: 0 0 22px 0; line-height: 1.6; font-size: 0.94rem; font-weight: 500;">
                ${message}
                ${invoiceNoteHtml}
            </div>
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                ${actionButtonsHtml}
            </div>
        </div>
    `;

    modal.style.display = 'flex';
}

function closeCustomerBookingModal() {
    const modal = document.getElementById('customer-booking-result-modal');
    if (modal) modal.style.display = 'none';
}

function showCartAlert(message, isSuccess) {
    const isLowBalance = message && (message.toLowerCase().includes('số dư') || message.toLowerCase().includes('không đủ'));
    showCustomerBookingModal(
        isSuccess ? 'Đặt sân thành công!' : 'Đặt sân không thành công',
        message,
        isSuccess,
        (!isSuccess && isLowBalance) ? 'topup' : null
    );
}

async function checkoutBooking() {
    const btnFloating = document.querySelector('.cart-actions .btn-primary');
    const btnModal = document.querySelector('#cart-modal .btn-primary');
    if (btnFloating) { btnFloating.disabled = true; btnFloating.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...'; }
    if (btnModal) { btnModal.disabled = true; btnModal.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...'; }

    const alertBox = document.getElementById('cart-alert');
    if (alertBox) alertBox.style.display = 'none';

    try {
        const uniqueClusterIds = [...new Set(selectedSlots.map(s => s.clusterId))];

        for (let cId of uniqueClusterIds) {
            const clusterRes = await fetch(`${API_BASE_URL}/cum-san/${cId}`);
            const clusterData = await clusterRes.json();
            
            if (!clusterData.success || clusterData.data.deleted_at !== null) {
                const clusterName = selectedSlots.find(s => s.clusterId === cId).clusterName;
                selectedSlots = selectedSlots.filter(s => s.clusterId !== cId);
                saveToSession();
                
                if (selectedSlots.length > 0) openCartModal();
                else closeCartModal();
                
                document.querySelectorAll('.schedule-table .slot.selected').forEach(el => {
                    const slotId = el.getAttribute('data-slot-id');
                    if (!selectedSlots.some(s => s.id === slotId)) {
                        el.classList.remove('selected');
                        el.innerText = 'CÒN TRỐNG';
                    }
                });

                showCustomerBookingModal(
                    'Cụm sân tạm ngưng',
                    `Cụm sân <strong>"${clusterName}"</strong> hiện đang bảo trì hoặc ngừng hoạt động. Hệ thống đã tự động gỡ khỏi giỏ hàng của bạn!`,
                    false
                );
                return;
            }

            const pitchRes = await fetch(`${API_BASE_URL}/san-bong?cum_san_id=${cId}`);
            const pitchData = await pitchRes.json();
            
            const pitchesInCluster = selectedSlots.filter(s => s.clusterId === cId).map(s => s.pitchId);
            for (let pId of pitchesInCluster) {
                const pitchInfo = pitchData.data.find(p => (p.MaSanBong || p.ID) == pId);
                
                if (!pitchInfo || pitchInfo.TrangThai === 'BaoTri') {
                    const pitchName = pitchInfo ? pitchInfo.TenSan : 'không xác định';
                    selectedSlots = selectedSlots.filter(s => s.pitchId !== pId);
                    saveToSession();
                    
                    if (selectedSlots.length > 0) openCartModal();
                    else closeCartModal();
                    
                    document.querySelectorAll('.schedule-table .slot.selected').forEach(el => {
                        const slotId = el.getAttribute('data-slot-id');
                        if (!selectedSlots.some(s => s.id === slotId)) {
                            el.classList.remove('selected');
                            el.innerText = 'CÒN TRỐNG';
                        }
                    });

                    showCustomerBookingModal(
                        'Sân đang bảo trì',
                        `Sân <strong>"${pitchName}"</strong> vừa chuyển sang trạng thái bảo trì đột xuất. Hệ thống đã tự động gỡ khỏi giỏ hàng!`,
                        false
                    );
                    return;
                }
            }

            const gtRes = await fetch(`${API_BASE_URL}/gia-tien?cum_san_id=${cId}`);
            const kgRes = await fetch(`${API_BASE_URL}/khung-gio`);
            const giaTienData = await gtRes.json();
            const allKhungGio = await kgRes.json();
            
            const prices = giaTienData.data || [];
            const khGioList = allKhungGio.data || [];

            for (let pId of pitchesInCluster) {
                const pitchInfo = pitchData.data.find(p => (p.MaSanBong || p.ID) == pId);
                if (!pitchInfo) continue;

                const slotsOfThisPitch = selectedSlots.filter(s => s.pitchId == pId);
                for (let slot of slotsOfThisPitch) {
                    const kgMatch = khGioList.find(kg => `${kg.GioBatDau.substring(0,5)} - ${kg.GioKetThuc.substring(0,5)}` === slot.time);
                    
                    let isSlotValid = false;
                    if (kgMatch) {
                        const priceExists = prices.find(p => (p.MaLoaiSan || p.ID_LoaiSan) == (pitchInfo.MaLoaiSan || pitchInfo.ID_LoaiSan) && (p.MaKhungGio || p.ID_KhungGio) == (kgMatch.MaKhungGio || kgMatch.ID));
                        if (priceExists && priceExists.SoTien > 0) {
                            const moCua = clusterData.data.GioMoCua.substring(0, 5);
                            const dongCua = clusterData.data.GioDongCua.substring(0, 5);
                            const start = kgMatch.GioBatDau.substring(0, 5);
                            const end = kgMatch.GioKetThuc.substring(0, 5);
                            
                            if (start >= moCua && end <= dongCua) {
                                isSlotValid = true;
                            }
                        }
                    }

                    if (!isSlotValid) {
                        selectedSlots = selectedSlots.filter(s => s.id !== slot.id);
                        saveToSession();
                        
                        if (selectedSlots.length > 0) openCartModal(); 
                        else closeCartModal();

                        showCustomerBookingModal(
                            'Khung giờ ngừng hoạt động',
                            `Khung giờ <strong>${slot.time}</strong> của sân <strong>"${pitchInfo.TenSan}"</strong> hiện đang đóng hoặc ngừng kinh doanh. Hệ thống đã tự động gỡ khỏi giỏ!`,
                            false
                        );
                        return;
                    }
                }
            }
        }

        // Nếu khách chọn 1 mã Toàn hệ thống / Cá nhân (selectedPromotion) -> gửi qua ma_khuyen_mai
        // Nếu khách chọn các mã riêng theo từng Cụm sân -> gửi qua khuyen_mai_theo_cum
        const khuyenMaiTheoCumPayload = {};
        if (!selectedPromotion) {
            for (const [cId, promoObj] of Object.entries(selectedPromotionsByCluster)) {
                if (promoObj && promoObj.MaKhuyenMai) {
                    khuyenMaiTheoCumPayload[cId] = promoObj.MaKhuyenMai;
                }
            }
        }

        const payload = {
            slots: selectedSlots,
            purpose: currentBookingPurpose,
            ma_khuyen_mai: selectedPromotion ? selectedPromotion.MaKhuyenMai : null,
            khuyen_mai_theo_cum: khuyenMaiTheoCumPayload
        };

        const response = await fetch(`${API_BASE_URL}/dat-san`, {
            method: 'POST',
            headers: { 
                'Accept': 'application/json', 
                'Content-Type': 'application/json',
                'X-Socket-ID': window.Echo ? window.Echo.socketId() : ''
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
            const bookedSlots = [...selectedSlots];
            const totalSlotsCount = bookedSlots.length;

            syncUserWallet();

            if (currentBookingPurpose !== 'normal') {
                currentBookingPurpose = 'normal';
                sessionStorage.setItem('dn_football_booking_purpose', 'normal');
            }

            bookedSlots.forEach(slot => markSlotAsBooked(slot));

            selectedSlots = [];
            selectedPromotion = null;
            selectedPromotionsByCluster = {};
            saveToSession();

            const cartModal = document.getElementById('cart-modal');
            if (cartModal) cartModal.style.display = 'none';

            showCustomerBookingModal(
                'Đặt sân thành công!',
                data.message || `Bạn đã đặt thành công <strong>${totalSlotsCount} khung giờ</strong>. Tiền cọc đã được trừ trực tiếp từ ví của bạn.`,
                true,
                null,
                data.ma_hoa_don || null,
                data.ma_hoa_dons || []
            );
        } else {
            if (data.failed_slot_ids && data.failed_slot_ids.length > 0) {
                selectedSlots = selectedSlots.filter(s => !data.failed_slot_ids.includes(s.id));
                saveToSession();

                if (selectedSlots.length > 0) {
                    openCartModal();
                } else {
                    closeCartModal();
                }
            } else {
                closeCartModal();
            }

            const errMsg = data.message || 'Không thể hoàn tất đặt sân. Vui lòng kiểm tra lại!';
            const isLowBalance = errMsg.toLowerCase().includes('số dư') || errMsg.toLowerCase().includes('không đủ');

            showCustomerBookingModal(
                'Đặt sân thất bại!',
                errMsg,
                false,
                isLowBalance ? 'topup' : null
            );
        }
        
    } catch (error) {
        console.error('Lỗi xác thực:', error);
        closeCartModal();
        showCustomerBookingModal(
            'Lỗi kết nối',
            'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại!',
            false
        );
    } finally {
        if (btnFloating) { btnFloating.disabled = false; btnFloating.innerHTML = 'Tiến hành đặt sân'; }
        if (btnModal) { btnModal.disabled = false; btnModal.innerHTML = 'Thanh toán ngay'; }
    }
}

async function renderClusters() {
    updateActiveNav('renderClusters');

    currentClusterId = null; currentPitchName = null; currentPitchId = null;
    appContent.innerHTML = `<div style="text-align:center; padding: 60px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i><p style="margin-top: 12px; color: var(--text-muted); font-weight: 500;">Đang tải danh sách cụm sân...</p></div>`;

    try {
        const [response, ratingRes] = await Promise.all([
            fetch(`${API_BASE_URL}/cum-san`),
            fetch(`${API_BASE_URL}/danh-gia`)
        ]);
        
        const res = await response.json();
        const ratingMap = (await ratingRes.json()).data || {};

        // 1. Lọc sân hoạt động và gắn thông tin sao trung bình + tổng đánh giá (KHÔNG ghi đè lại ở dưới)
        allActiveClusters = (res.data || []).filter(c => c.deleted_at === null).map(c => {
            const r = ratingMap[c.ID];
            const avg = r ? Number(r.trung_binh_sao) : (c.danh_gias_avg_so_sao ? Number(c.danh_gias_avg_so_sao) : 0);
            const total = r ? Number(r.tong_danh_gia) : Number(c.danh_gias_count || 0);
            return {
                ...c,
                avg_rating: avg,
                total_reviews: total
            };
        });

        // 2. Trích xuất danh sách Phường tự động từ dữ liệu cụm sân
        const uniquePhuongs = [];
        const phuongMap = new Set();
        allActiveClusters.forEach(c => {
            if (c.ID_Phuong && c.phuong && !phuongMap.has(c.ID_Phuong)) {
                phuongMap.add(c.ID_Phuong);
                uniquePhuongs.push({ id: c.ID_Phuong, name: c.phuong.TenPhuong });
            }
        });

        // 3. Render Giao diện
        let html = `
            <div class="page-header" style="background: linear-gradient(135deg, #0b5d3b 0%, #15803d 100%); padding: 28px 32px; border-radius: 18px; color: white; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px; box-shadow: 0 10px 25px rgba(11, 93, 59, 0.18); margin-bottom: 24px;">
                <div>
                    <div style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; background: rgba(255,255,255,0.15); padding: 5px 12px; border-radius: 999px; margin-bottom: 10px; backdrop-filter: blur(4px);">
                        <i class="fa-solid fa-location-dot" style="color: #fde047;"></i> Khu vực Đà Nẵng &bull; Hệ thống sân trực tuyến
                    </div>
                    <h1 class="page-title" style="color: #ffffff; font-size: 1.85rem; margin-bottom: 6px;">Chọn cụm sân thi đấu</h1>
                    <p class="page-subtitle" style="color: rgba(255,255,255,0.88); font-size: 0.95rem;">Tra cứu lịch trống theo thời gian thực, đặt giữ sân nhanh chóng và nhận vé điện tử ngay.</p>
                </div>
                <div style="display: flex; gap: 14px; background: rgba(0,0,0,0.18); padding: 14px 20px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.12);">
                    <div style="text-align: center; padding-right: 14px; border-right: 1px solid rgba(255,255,255,0.15);">
                        <div style="font-size: 1.4rem; font-weight: 800; color: #fde047;">${allActiveClusters.length}</div>
                        <div style="font-size: 0.76rem; color: rgba(255,255,255,0.85);">Cơ sở hoạt động</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 1.4rem; font-weight: 800; color: #4ade80;">24/7</div>
                        <div style="font-size: 0.76rem; color: rgba(255,255,255,0.85);">Đặt lịch tự động</div>
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 14px; margin-bottom: 26px; flex-wrap: wrap; background: #fff; padding: 14px 16px; border-radius: 14px; border: 1px solid var(--border); box-shadow: var(--shadow-sm); align-items: center;">
                <div style="flex: 1; min-width: 260px; position: relative;">
                    <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: #64748b;"></i>
                    <input type="text" id="search-cluster" class="form-control" placeholder="Tìm theo tên cụm sân hoặc tên đường..." style="padding-left: 42px; height: 44px; background: #f8fafc; border-color: #e2e8f0;" oninput="filterClusters()">
                </div>
                <div style="min-width: 230px; position: relative;">
                    <select id="filter-phuong" class="form-control" style="height: 44px; background: #f8fafc; border-color: #e2e8f0; font-weight: 600; color: #334155; cursor: pointer;" onchange="filterClusters()">
                        <option value="">Tất cả khu vực (Phường/Xã)</option>
                        ${uniquePhuongs.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                    </select>
                </div>
            </div>

            <div class="cluster-grid" id="cluster-grid-container"></div>
        `;
        
        appContent.innerHTML = html;
        filterClusters();

    } catch (error) {
        appContent.innerHTML = `<div style="text-align:center; color:red; padding: 40px;">Lỗi tải dữ liệu máy chủ!</div>`;
    }
}

// Hàm xử lý logic Tìm kiếm và Lọc theo phường
function filterClusters() {
    const searchInput = document.getElementById('search-cluster');
    const phuongSelect = document.getElementById('filter-phuong');
    const gridContainer = document.getElementById('cluster-grid-container');

    if (!searchInput || !phuongSelect || !gridContainer) return;

    const searchTerm = searchInput.value.toLowerCase().trim();
    const selectedPhuongId = phuongSelect.value;

    const filtered = allActiveClusters.filter(cluster => {
        const textMatch = cluster.TenCumSan.toLowerCase().includes(searchTerm) || 
                          cluster.DiaChi.toLowerCase().includes(searchTerm);
        const phuongMatch = selectedPhuongId === "" || String(cluster.ID_Phuong) === String(selectedPhuongId);
        return textMatch && phuongMatch;
    });

    if (filtered.length === 0) {
        gridContainer.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 50px 20px; color: var(--text-muted); background: #fff; border-radius: 16px; border: 1px dashed #cbd5e1;">
                <i class="fa-solid fa-magnifying-glass-location" style="font-size: 2.5rem; color: #cbd5e1; margin-bottom: 12px; display: block;"></i>
                <div style="font-weight: 600; color: #334155; margin-bottom: 4px;">Không tìm thấy cụm sân phù hợp</div>
                <div style="font-size: 0.88rem;">Vui lòng thử lại với từ khóa hoặc khu vực khác.</div>
            </div>`;
        return;
    }

    let gridHtml = '';
    filtered.forEach(cluster => {
        const imgUrl = cluster.HinhAnh ? `http://127.0.0.1:8000${cluster.HinhAnh}` : 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?q=80&w=600&auto=format&fit=crop';
        const tenPhuong = cluster.phuong?.TenPhuong || 'Đà Nẵng';
        const avgStar = cluster.total_reviews > 0 ? Number(cluster.avg_rating).toFixed(1) : '0.0';
        const reviewText = `(${cluster.total_reviews} đánh giá)`;

        gridHtml += `
            <div class="cluster-card" onclick="renderPitches('${cluster.ID}', '${cluster.TenCumSan.replace(/'/g, "\\'")}', '${cluster.DiaChi.replace(/'/g, "\\'")}', '${cluster.GioMoCua}', '${cluster.GioDongCua}')">
                <div class="cluster-img-box">
                    <img src="${imgUrl}" alt="${cluster.TenCumSan}" class="cluster-img">
                    <span class="cluster-ward-tag"><i class="fa-solid fa-location-dot" style="margin-right: 5px; color: #4ade80;"></i>${tenPhuong}</span>
                </div>
                <div class="cluster-info">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
                        <div class="cluster-name" style="margin-bottom: 0;">${cluster.TenCumSan}</div>
                        <button type="button" onclick="event.stopPropagation(); openClusterReviewsModal('${cluster.ID}', '${cluster.TenCumSan.replace(/'/g, "\\'")}')" style="background: #fffbeb; border: 1px solid #fde68a; color: #b45309; padding: 3px 8px; border-radius: 999px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;" title="Nhấn để xem các đánh giá">
                            <i class="fa-solid fa-star" style="color: #f59e0b;"></i> ${avgStar} <span style="font-weight: 500; color: #92400e;">${reviewText}</span>
                        </button>
                    </div>
                    <div class="cluster-address">
                        <i class="fa-solid fa-map-pin" style="color: #16a34a;"></i>
                        <span>${cluster.DiaChi}${cluster.phuong ? ', ' + cluster.phuong.TenPhuong : ''}</span>
                    </div>
                    <div class="cluster-footer">
                        <div class="cluster-meta">
                            <i class="fa-regular fa-clock" style="color: var(--primary);"></i> ${cluster.GioMoCua.substring(0,5)} - ${cluster.GioDongCua.substring(0,5)}
                        </div>
                        <span style="font-size: 0.88rem; font-weight: 700; color: var(--primary); display: inline-flex; align-items: center; gap: 5px;">
                            Chọn sân <i class="fa-solid fa-arrow-right" style="font-size: 0.8rem;"></i>
                        </span>
                    </div>
                </div>
            </div>
        `;
    });
    
    gridContainer.innerHTML = gridHtml;
}

async function renderPitches(clusterId, clusterName, clusterAddress, gioMo, gioDong) {
    await loadUserTournaments();
    if (currentBookingPurpose !== 'normal') {
        const tour = userActiveTournaments.find(t => t.ID == currentBookingPurpose);
        if (!tour || (tour.ID_CumSan != clusterId && tour.id_cum_san != clusterId)) {
            currentBookingPurpose = 'normal';
            sessionStorage.setItem('dn_football_booking_purpose', 'normal');
            selectedSlots = [];
            saveToSession();
        }
    }

    if (clusterId) currentClusterId = clusterId; 
    if (clusterName) currentClusterName = clusterName;
    if (clusterAddress !== undefined && clusterAddress !== '') currentClusterAddress = clusterAddress;
    if (gioMo !== undefined) currentClusterGioMo = gioMo;
    if (gioDong !== undefined) currentClusterGioDong = gioDong;

    currentPitchId = null;
    currentPitchName = null;
    currentLoaiSanId = null;
    currentPitchType = null;

    appContent.innerHTML = `<div style="text-align:center; padding: 60px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i><p style="margin-top: 12px; color: var(--text-muted);">Đang tải danh sách sân con...</p></div>`;

    try {
        const response = await fetch(`${API_BASE_URL}/san-bong?cum_san_id=${clusterId}`);
        const res = await response.json();

        const activePitches = res.data.filter(sb => sb.TrangThai === 'HoatDong');

        const grouped = {};
        activePitches.forEach(sb => {
            const loaiSanName = sb.loaiSan?.TenLoaiSan || sb.loai_san?.TenLoaiSan || 'Loại sân khác';
            const loaiSanId = sb.ID_LoaiSan;
            if(!grouped[loaiSanName]) grouped[loaiSanName] = { id: loaiSanId, pitches: [] };
            grouped[loaiSanName].pitches.push(sb);
        });

        let html = `
            <div class="customer-breadcrumb">
                <div class="back-btn" onclick="renderClusters()">
                    <i class="fa-solid fa-arrow-left"></i> Danh sách cụm sân
                </div>
                <div class="breadcrumb-path">
                    <span class="bc-link" onclick="renderClusters()">Cụm sân</span>
                    <span>/</span>
                    <span class="bc-current">${clusterName}</span>
                </div>
            </div>
            
            <div class="cluster-detail-header">
                <div>
                    <div class="cluster-detail-label"><i class="fa-solid fa-circle-check"></i> Cơ sở đang chọn</div>
                    <h1 class="cluster-detail-title">${clusterName}</h1>
                    <div class="cluster-detail-info">
                        <span><i class="fa-solid fa-location-dot"></i> Địa chỉ: <strong style="color: var(--text-dark);">${clusterAddress}</strong></span>
                        <span><i class="fa-regular fa-clock"></i> Giờ mở cửa: <strong style="color: var(--text-dark);">${gioMo.substring(0,5)} - ${gioDong.substring(0,5)}</strong></span>
                    </div>
                </div>
                <div class="context-summary-box">
                    <div style="font-size: 0.76rem; font-weight: 600; color: #15803d; text-transform: uppercase;">Sân sẵn sàng</div>
                    <div style="font-size: 1.35rem; font-weight: 800; color: var(--primary);">${activePitches.length} sân</div>
                </div>
            </div>
        `;

        if (activePitches.length === 0) {
            html += `<div style="text-align:center; color: var(--text-muted); margin-top: 30px; padding: 45px; background: #fff; border-radius: 14px; border: 1px dashed #cbd5e1;">Cụm sân này hiện chưa có sân con nào hoạt động.</div>`;
        }

        for (const [loaiSanName, data] of Object.entries(grouped)) {
            html += `
                <div class="pitch-section">
                    <div class="pitch-section-title">
                        <span style="display: inline-flex; align-items: center; gap: 8px;">
                            <i class="fa-regular fa-futbol" style="color: var(--primary);"></i> ${loaiSanName.toUpperCase()}
                        </span>
                        <span style="font-size: 0.8rem; font-weight: 600; color: #475569; background: #e2e8f0; padding: 3px 10px; border-radius: 999px;">${data.pitches.length} sân</span>
                    </div>
                    <div class="pitch-grid">`;
            data.pitches.forEach(sb => {
                const specHtml = (sb.KichThuoc || sb.DienTich)
                    ? `<div style="font-size: 0.78rem; color: #475569; margin-top: 4px;"><i class="fa-solid fa-ruler-combined" style="color: var(--primary); margin-right: 4px;"></i>${sb.KichThuoc || ''}${sb.KichThuoc && sb.DienTich ? ' • ' : ''}${sb.DienTich ? Number(sb.DienTich) + 'm²' : ''}</div>`
                    : '';
                const descHtml = sb.MoTa
                    ? `<div style="font-size: 0.76rem; color: #64748b; margin-top: 4px; line-height: 1.4;">${sb.MoTa}</div>`
                    : '';

                html += `
                    <div class="pitch-card" onclick="renderSchedule('${clusterId}', '${clusterName.replace(/'/g, "\\'")}', '${sb.ID}', '${sb.TenSan.replace(/'/g, "\\'")}', '${data.id}', '${loaiSanName}')">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                            <div>
                                <div class="pitch-name">${sb.TenSan}</div>
                                <div class="pitch-type"><i class="fa-solid fa-layer-group" style="color: #94a3b8;"></i> ${loaiSanName}</div>
                                ${specHtml}
                                ${descHtml}
                            </div>
                            <span style="font-size: 0.74rem; color: #15803d; background: #dcfce7; border: 1px solid #bbf7d0; padding: 3px 9px; border-radius: 999px; font-weight: 700; flex-shrink: 0;">Hoạt động</span>
                        </div>
                        <button class="btn-outline" style="width: 100%; padding: 9px; display: flex; align-items: center; justify-content: center; gap: 6px;">
                            <span>Xem lịch trống</span> <i class="fa-solid fa-calendar-Alt" style="font-size: 0.82rem;"></i>
                        </button>
                    </div>`;
            });
            html += `</div></div>`;
        }
        appContent.innerHTML = html;
    } catch(e) {
        console.error(e);
    }
}

async function renderSchedule(clusterId, clusterName, pitchId, pitchName, loaiSanId, pitchType) {
    currentClusterId = clusterId; currentClusterName = clusterName;
    currentPitchId = pitchId; currentPitchName = pitchName;
    currentLoaiSanId = loaiSanId; currentPitchType = pitchType;
    
    appContent.innerHTML = `<div style="text-align:center; padding: 60px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i><p style="margin-top: 12px; color: var(--text-muted);">Đang tải bảng lịch đặt sân...</p></div>`;

    try {
        await loadUserTournaments();

        if (currentBookingPurpose !== 'normal') {
            const tour = userActiveTournaments.find(t => t.ID == currentBookingPurpose);
            if (!tour || (tour.ID_CumSan != clusterId && tour.id_cum_san != clusterId)) {
                currentBookingPurpose = 'normal';
                sessionStorage.setItem('dn_football_booking_purpose', 'normal');
                selectedSlots = [];
                saveToSession();
            }
        }

        const [gtRes, kgRes, dsRes] = await Promise.all([
            fetch(`${API_BASE_URL}/gia-tien?cum_san_id=${clusterId}`),
            fetch(`${API_BASE_URL}/khung-gio`),
            fetch(`${API_BASE_URL}/dat-san/da-dat?id_san_bong=${pitchId}`)
        ]);

        const giaTienData = (await gtRes.json()).data || [];
        const allKhungGio = (await kgRes.json()).data || [];
        const bookedSlots = (await dsRes.json()).data || [];

        const validPrices = giaTienData.filter(gt => gt.ID_LoaiSan == loaiSanId);
        const availableTimeSlots = allKhungGio;

        if (availableTimeSlots.length === 0) {
            appContent.innerHTML = `
                <div class="customer-breadcrumb">
                    <div class="back-btn" onclick="renderPitches('${currentClusterId}', '${currentClusterName}', '${currentClusterAddress}', '${currentClusterGioMo}', '${currentClusterGioDong}')">
                        <i class="fa-solid fa-arrow-left"></i> Quay lại ${clusterName}
                    </div>
                </div>
                <div style="text-align:center; padding: 50px; color: red;">Chưa có cấu hình giá tiền/khung giờ cho loại sân này!</div>
            `;
            return;
        }

        let dateArray = [];
        let isTournamentMode = false;

        if (currentBookingPurpose !== 'normal') {
            const selectedTournament = userActiveTournaments.find(t => t.ID == currentBookingPurpose);
            if (selectedTournament) {
                isTournamentMode = true;
                let dStart = new Date(selectedTournament.NgayBatDau);
                let dEnd = new Date(selectedTournament.NgayKetThuc);
                
                for (let d = new Date(dStart); d <= dEnd; d.setDate(d.getDate() + 1)) {
                    const pad = n => n < 10 ? '0' + n : n;
                    dateArray.push({
                        short: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
                        full: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
                    });
                }
            }
        }

        if (!isTournamentMode) {
            const today = new Date();
            for(let i = 0; i < 7; i++) {
                let d = new Date(today); 
                d.setDate(today.getDate() + i);
                const pad = n => n < 10 ? '0' + n : n;
                dateArray.push({
                    short: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
                    full: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
                });
            }
        }

        const moCua = currentClusterGioMo ? currentClusterGioMo.substring(0, 5) : '06:00';
        const dongCua = currentClusterGioDong ? currentClusterGioDong.substring(0, 5) : '22:00';

        let html = `
            <div class="customer-breadcrumb">
                <div class="back-btn" onclick="renderPitches('${currentClusterId}', '${currentClusterName}', '${currentClusterAddress}', '${currentClusterGioMo}', '${currentClusterGioDong}')">
                    <i class="fa-solid fa-arrow-left"></i> Chọn sân khác thuộc ${currentClusterName}
                </div>
                <div class="breadcrumb-path">
                    <span class="bc-link" onclick="renderClusters()">Cụm sân</span>
                    <span>/</span>
                    <span class="bc-link" onclick="renderPitches('${currentClusterId}', '${currentClusterName}', '${currentClusterAddress}', '${currentClusterGioMo}', '${currentClusterGioDong}')">${currentClusterName}</span>
                    <span>/</span>
                    <span class="bc-current">${pitchName} (${pitchType})</span>
                </div>
            </div>

            <!-- Khung thông tin Sân & Cụm sân đang xem -->
            <div class="cluster-detail-header" style="margin-bottom: 16px;">
                <div>
                    <div class="cluster-detail-label">Bảng lịch đặt sân trực tuyến</div>
                    <h1 class="cluster-detail-title">
                        <span>${pitchName}</span>
                        <span style="font-size: 0.82rem; font-weight: 700; padding: 4px 12px; border-radius: 999px; background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;">${pitchType}</span>
                        ${isTournamentMode ? `<span style="font-size: 0.8rem; font-weight: 700; padding: 4px 12px; border-radius: 999px; background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe;"><i class="fa-solid fa-trophy" style="margin-right: 4px;"></i>Chế độ đá giải</span>` : ''}
                    </h1>
                    <div class="cluster-detail-info">
                        <span><i class="fa-solid fa-building"></i> Cụm sân: <strong style="color: var(--text-dark);">${currentClusterName}</strong></span>
                        ${currentClusterAddress ? `<span><i class="fa-solid fa-location-dot"></i> Địa chỉ: <strong style="color: var(--text-dark);">${currentClusterAddress}</strong></span>` : ''}
                        <span><i class="fa-regular fa-clock"></i> Giờ mở cửa: <strong style="color: var(--text-dark);">${moCua} - ${dongCua}</strong></span>
                    </div>
                </div>
            </div>

            <!-- Thanh công cụ: Quy định đặt sân & Chú thích trạng thái -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; background: #ffffff; padding: 12px 16px; border-radius: 12px; border: 1px solid var(--border); box-shadow: var(--shadow-sm);">
                <div style="position: relative; display: inline-block;">
                    <button type="button" onclick="toggleRuleDropdown(event)" style="background-color: #fffbeb; color: #b45309; border: 1px solid #fde68a; padding: 8px 14px; border-radius: 8px; font-size: 0.85rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s;">
                        <i class="fa-solid fa-circle-info" style="color: #d97706;"></i> Xem quy định đặt & hủy sân
                    </button>

                    <!-- Hộp nội dung quy định (Giữ nguyên id="rule-dropdown-box") -->
                    <div id="rule-dropdown-box" style="display: none; position: absolute; top: 120%; left: 0; width: 720px; max-width: 90vw; background-color: #ffffff; border: 1px solid #fde68a; border-top: 4px solid #f59e0b; border-radius: 14px; padding: 20px 24px; box-shadow: var(--shadow-lg); z-index: 99;">
                        <h4 style="color: #92400e; margin-bottom: 12px; font-size: 1rem; font-weight: 800; display: flex; align-items: center; gap: 8px;">
                            <i class="fa-solid fa-shield-halved" style="color: #f59e0b;"></i> Quy định đặt & hủy sân chi tiết
                        </h4>
                        <ul style="color: #334155; font-size: 0.88rem; margin-left: 18px; line-height: 1.7; list-style: disc;">
                            <li><strong>Đặt sân phong trào:</strong> Đặt trước trong vòng <strong>7 ngày tới</strong>, thanh toán tiền cọc trước <strong>30%</strong>.</li>
                            <li style="margin-top: 6px;"><strong>Đặt sân đá giải:</strong> Cần được Admin duyệt giải đấu tại đúng cụm sân. Chọn mục đích "Giải đấu" trong Giỏ hàng để mở lịch theo ngày giải. Hoàn tất đặt lịch trong <strong>3 ngày</strong> từ lúc duyệt, cọc trước <strong>50%</strong>.</li>
                            <li style="margin-top: 6px;"><strong>Quy định hủy lịch:</strong> Tự hủy miễn phí trước trận <strong>10 tiếng</strong> (đá phong trào) hoặc trước <strong>7 ngày</strong> (đá giải). Nếu sát giờ, vui lòng gửi "Yêu cầu hủy gấp" tại mục Các yêu cầu.</li>
                        </ul>
                    </div>
                </div>

                <!-- Chú thích màu sắc ô lịch -->
                <div style="display: flex; align-items: center; gap: 18px; font-size: 0.84rem; font-weight: 600; color: #475569;">
                    <span style="display: inline-flex; align-items: center; gap: 7px;">
                        <span style="width: 15px; height: 15px; border-radius: 4px; background: #F0FDF4; border: 1.5px solid #86EFAC; display: inline-block;"></span> Còn trống
                    </span>
                    <span style="display: inline-flex; align-items: center; gap: 7px;">
                        <span style="width: 15px; height: 15px; border-radius: 4px; background: var(--primary); display: inline-block;"></span> Đang chọn
                    </span>
                    <span style="display: inline-flex; align-items: center; gap: 7px;">
                        <span style="width: 15px; height: 15px; border-radius: 4px; background: #E2E8F0; border: 1px solid #CBD5E1; display: inline-block;"></span> Đã đặt / Quá giờ
                    </span>
                </div>
            </div>
            
            <div class="schedule-container" style="margin-bottom: 40px; margin-top: 0;">
                <div style="width: 100%; max-width: 100%; max-height: calc(100vh - 240px); overflow-y: auto; overflow-x: auto; border-radius: 14px;"> 
                    <table class="schedule-table" style="width: max-content; min-width: 100%; border-collapse: separate; border-spacing: 0;">
                        <thead>
                            <tr>
                                <th style="box-sizing: border-box; width: 140px; min-width: 140px; max-width: 140px; padding: 14px 10px; text-align: center; border-bottom: 1px solid #cbd5e1; border-right: 1px solid #cbd5e1; background: #F8FAFC; position: sticky; top: 0; left: 0; z-index: 60;">
                                    Khung giờ
                                </th>
                                <th style="box-sizing: border-box; width: 110px; min-width: 110px; max-width: 110px; padding: 14px 10px; text-align: center; border-bottom: 1px solid #cbd5e1; border-right: 2px solid #cbd5e1; background: #F8FAFC; position: sticky; top: 0; left: 140px; z-index: 59;">
                                    Giá sân
                                </th>
                                ${dateArray.map(d => `
                                    <th style="min-width: 115px; padding: 14px 10px; text-align: center; border-bottom: 1px solid #cbd5e1; background: #F8FAFC; position: sticky; top: 0; z-index: 50;">
                                        ${d.short}
                                    </th>
                                `).join('')}
                            </tr>
                        </thead>
                        <tbody>
        `;

        const now = new Date();

        availableTimeSlots.forEach((kg) => {
            const priceInfo = validPrices.find(p => p.ID_KhungGio == kg.ID);

            const start = kg.GioBatDau.substring(0, 5);
            const end = kg.GioKetThuc.substring(0, 5);

            const isValid = priceInfo && priceInfo.SoTien > 0 && (start >= moCua && end <= dongCua);
            const priceValue = priceInfo ? priceInfo.SoTien : 0;

            const displayStyle = isValid ? '' : 'display: none;';
            const displayPrice = isValid ? `${Number(priceValue).toLocaleString('vi-VN')}đ` : '-';

            const timeStr = `${kg.GioBatDau.substring(0,5)} - ${kg.GioKetThuc.substring(0,5)}`;

            html += `
                <tr style="${displayStyle}">
                    <td style="box-sizing: border-box; width: 140px; min-width: 140px; max-width: 140px; text-align: center; background: #fff; position: sticky; left: 0; z-index: 20; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #f1f5f9;">
                        <strong style="color: #0f172a; font-size: 0.88rem;">${timeStr}</strong>
                    </td>
                    <td style="box-sizing: border-box; width: 110px; min-width: 110px; max-width: 110px; text-align: center; background: #fff; position: sticky; left: 140px; z-index: 19; color: var(--primary); font-weight: 700; font-size: 0.88rem; border-right: 2px solid #e2e8f0; border-bottom: 1px solid #f1f5f9;">
                        ${displayPrice}
                    </td>
            `;
                        
            dateArray.forEach((date) => {
                const slotId = `${clusterName}-${pitchName}-${date.full}-${timeStr}`;

                const [day, month, year] = date.full.split('/');
                const formatNgayDa = `${year}-${month}-${day}`;
                const maKG = kg.MaKhungGio || kg.ID;
                const slotKey = `${pitchId}-${formatNgayDa}-${maKG}`;
                
                const isBooked = bookedSlots.some(b => b.NgayDa === formatNgayDa && String(b.MaKhungGio || b.ID_KhungGio) === String(maKG));
                const isSelected = selectedSlots.some(s => s.id === slotId);
                
                const [startHour, startMinute] = kg.GioBatDau.split(':');
                const slotDateTime = new Date(year, month - 1, day, startHour, startMinute);
                const isPast = slotDateTime <= now; 
                
                let statusClass = 'available', statusText = 'CÒN TRỐNG';
                const slotDataArgs = `'${clusterId}', '${clusterName.replace(/'/g, "\\'")}', '${pitchId}', '${pitchName.replace(/'/g, "\\'")}', '${date.full}', '${timeStr}', ${priceValue}`;
                
                if (isPast) {
                    statusClass = 'booked'; 
                    statusText = 'Quá giờ';
                } else if (!isValid) {
                    statusClass = 'booked'; 
                    statusText = 'Đóng';
                } else if (isBooked) { 
                    statusClass = 'booked'; 
                    statusText = 'Đã đặt'; 
                } else if (isSelected) { 
                    statusClass = 'available selected'; 
                    statusText = 'ĐÃ CHỌN ✓'; 
                }
                
                html += `
                    <td style="border-bottom: 1px solid #f1f5f9; padding: 6px;">
                        <div class="slot ${statusClass}" 
                            data-slot-id="${slotId}"
                            data-slot-key="${slotKey}"
                            data-date-full="${date.full}"
                            data-time-str="${timeStr}"
                            data-slot-args="${slotDataArgs}"
                            ${(!isBooked && !isPast && isValid) ? `onclick="toggleSlot(this, ${slotDataArgs})"` : ''}>
                            ${statusText}
                        </div>
                    </td>
                `;
            });
            html += `</tr>`;
        });
        html += `</tbody></table></div></div>`;
        appContent.innerHTML = html;
    } catch (e) { console.error(e); }
}

function toggleSlot(element, clusterId, clusterName, pitchId, pitchName, date, time, price) {
    if (element.classList.contains('booked')) return;
    const slotId = `${clusterName}-${pitchName}-${date}-${time}`;
    const existingIndex = selectedSlots.findIndex(s => s.id === slotId);
    
    if (existingIndex > -1) {
        selectedSlots.splice(existingIndex, 1);
        element.classList.remove('selected'); element.innerText = 'CÒN TRỐNG';
    } else {
        selectedSlots.push({ id: slotId, clusterId, clusterName, pitchId, pitchName, date, time, price });
        element.classList.add('selected'); element.innerText = 'ĐÃ CHỌN ✓';
    }
    saveToSession();
}

function updateSlotUI(slot, isSelected) {
    const slotElement = document.querySelector(
        `[data-slot-id="${slot.id}"]`
    );

    if (!slotElement) return;

    if (isSelected) {
        slotElement.classList.add('selected');
        slotElement.innerText = 'ĐÃ CHỌN ✓';
    } else {
        slotElement.classList.remove('selected');
        slotElement.innerText = 'CÒN TRỐNG';
    }
}

function markSlotAsBooked(slot) {
    const slotElement = Array.from(
        document.querySelectorAll('.schedule-table .slot[data-slot-id]')
    ).find(element => element.dataset.slotId === slot.id);

    if (!slotElement) {
        console.warn('Không tìm thấy slot để chuyển sang Đã đặt:', slot);
        return false;
    }

    // ==========================================
    // 1. XÓA TRẠNG THÁI ĐÃ CHỌN
    // ==========================================
    slotElement.classList.remove('selected');

    // ==========================================
    // 2. XÓA TRẠNG THÁI CÒN TRỐNG
    // ==========================================
    slotElement.classList.remove('available');

    // ==========================================
    // 3. THÊM TRẠNG THÁI ĐÃ ĐẶT
    // ==========================================
    slotElement.classList.add('booked');

    // ==========================================
    // 4. ĐỔI CHỮ
    // ==========================================
    slotElement.textContent = 'Đã đặt';

    // ==========================================
    // 5. KHÔNG CHO CLICK ĐẶT LẠI
    // ==========================================
    slotElement.removeAttribute('onclick');

    // Đánh dấu thêm bằng data attribute
    slotElement.dataset.booked = 'true';

    console.log('Đã chuyển slot sang Đã đặt:', slot.id);

    return true;
}

// ======================================================
// MODULE: LỊCH SỬ ĐẶT SÂN & HỦY SÂN PHONG TRÀO
// ======================================================
async function loadMyBookingsData() {
    try {
        const response = await fetch(`${API_BASE_URL}/dat-san/cua-toi`);
        const res = await response.json();
        
        allMyBookingsData = res.data || [];
        applyBookingFiltersAndRender();
    } catch (error) {
        const container = document.getElementById('my-bookings-container');
        if (container) {
            container.innerHTML = `<div style="text-align:center; color:red; padding: 40px;">Lỗi kết nối đến máy chủ!</div>`;
        }
    }
}

async function renderMyBookings() {
    updateActiveNav('renderMyBookings');
    currentClusterId = null; currentPitchName = null; currentPitchType = null;

    currentBookingSearch = '';
    currentBookingDate = '';
    currentBookingStatus = 'All';
    currentBookingTab = 'phong_trao';

    appContent.innerHTML = `
        <div class="page-header" style="margin-bottom: 24px; padding: 22px 28px; border-radius: 18px; background: linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%); border: 1px solid #bbf7d0; border-left: 5px solid var(--primary); box-shadow: var(--shadow-sm); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
                <div style="font-size: 0.76rem; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px;">
                    <i class="fa-solid fa-futbol"></i> Nhật ký thi đấu & Vé điện tử
                </div>
                <h1 class="page-title" style="margin-bottom: 4px;">Lịch sử đặt sân</h1>
                <p class="page-subtitle">Quản lý lịch thi đấu, tải vé điện tử (E-Ticket) hoặc hủy lịch trong thời hạn quy định</p>
            </div>
        </div>

        <div style="display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start;">
            <!-- SIDEBAR TRÁI: MENU TAB -->
            <div style="width: 240px; flex-shrink: 0;">
                <div style="background: rgba(255, 255, 255, 0.92); backdrop-filter: blur(8px); border-radius: 16px; padding: 14px; box-shadow: var(--shadow-sm); border: 1px solid var(--border);">
                    <div style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; padding: 4px 10px 10px;">Loại hình đặt sân</div>
                    <button onclick="switchBookingTab('phong_trao')" id="tab-phong-trao" style="width: 100%; text-align: left; padding: 12px 16px; margin-bottom: 8px; border-radius: 10px; border: 1px solid #bbf7d0; background: var(--primary-light); color: var(--primary); font-weight: 700; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 10px;">
                        <i class="fa-solid fa-futbol" style="width: 18px; text-align: center;"></i> Đá phong trào
                    </button>
                    <button onclick="switchBookingTab('giai_dau')" id="tab-giai-dau" style="width: 100%; text-align: left; padding: 12px 16px; border-radius: 10px; border: 1px solid transparent; background: transparent; color: var(--text-muted); font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 10px;">
                        <i class="fa-solid fa-trophy" style="width: 18px; text-align: center;"></i> Giải đấu
                    </button>
                </div>
            </div>

            <!-- CỘT PHẢI: BỘ LỌC & DANH SÁCH -->
            <div style="flex: 1; min-width: 0;">
                <div style="display: flex; gap: 12px; margin-bottom: 22px; flex-wrap: wrap; background: #ffffff; padding: 14px; border-radius: 14px; border: 1px solid var(--border); box-shadow: var(--shadow-sm);">
                    <div style="flex: 1; min-width: 220px; position: relative;">
                        <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: var(--text-muted);"></i>
                        <input type="text" id="search-booking" class="form-control" placeholder="Tìm tên sân, cụm sân, giải đấu..." style="padding-left: 40px; height: 42px; background: #f8fafc;" oninput="handleBookingSearch(this.value)" value="${currentBookingSearch}">
                    </div>
                    <input type="date" id="filter-booking-date" class="form-control" style="width: 165px; height: 42px; background: #f8fafc; cursor: pointer;" onchange="handleBookingDate(this.value)" value="${currentBookingDate}">
                    <select id="filter-booking-status" class="form-control" style="width: 185px; height: 42px; background: #f8fafc; font-weight: 600; color: #334155; cursor: pointer;" onchange="handleBookingStatus(this.value)">
                        <option value="All" ${currentBookingStatus === 'All' ? 'selected' : ''}>Tất cả trạng thái</option>
                        <option value="DaCoc" ${currentBookingStatus === 'DaCoc' ? 'selected' : ''}>Đã cọc</option>
                        <option value="HoanThanh" ${currentBookingStatus === 'HoanThanh' ? 'selected' : ''}>Hoàn thành</option>
                        <option value="DaHuy" ${currentBookingStatus === 'DaHuy' ? 'selected' : ''}>Đã hủy</option>
                        <option value="KhongDen" ${currentBookingStatus === 'KhongDen' ? 'selected' : ''}>Không đến</option>
                    </select>
                </div>

                <div id="my-bookings-container" style="min-height: 300px; position: relative;">
                    <div style="text-align:center; padding: 50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 1.8rem; color: var(--primary);"></i><p style="margin-top: 10px; color: var(--text-muted);">Đang tải dữ liệu...</p></div>
                </div>
            </div>
        </div>
    `;

    loadMyBookingsData();
}

function switchBookingTab(tab) {
    currentBookingTab = tab;
    const btnPhongTrao = document.getElementById('tab-phong-trao');
    const btnGiaiDau = document.getElementById('tab-giai-dau');

    const activeStyle = "width: 100%; text-align: left; padding: 12px 16px; border-radius: 10px; border: 1px solid #bbf7d0; background: var(--primary-light); color: var(--primary); font-weight: 700; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 10px;";
    const inactiveStyle = "width: 100%; text-align: left; padding: 12px 16px; border-radius: 10px; border: 1px solid transparent; background: transparent; color: var(--text-muted); font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 10px;";

    if (tab === 'phong_trao') {
        btnPhongTrao.style.cssText = activeStyle + " margin-bottom: 8px;";
        btnGiaiDau.style.cssText = inactiveStyle;
    } else {
        btnGiaiDau.style.cssText = activeStyle;
        btnPhongTrao.style.cssText = inactiveStyle + " margin-bottom: 8px;";
    }
    
    document.getElementById('search-booking').value = '';
    currentBookingSearch = '';
    
    applyBookingFiltersAndRender();
}

function handleBookingSearch(val) { currentBookingSearch = val.toLowerCase().trim(); applyBookingFiltersAndRender(); }
function handleBookingDate(val) { currentBookingDate = val; applyBookingFiltersAndRender(); }
function handleBookingStatus(val) { currentBookingStatus = val; applyBookingFiltersAndRender(); }

function applyBookingFiltersAndRender() {
    const container = document.getElementById('my-bookings-container');
    if (!container) return;

    const renderBadge = (trangThai) => {
        let badgeColor = '#475569', badgeBg = '#f1f5f9', borderColor = '#cbd5e1', viStatus = trangThai;
        if(trangThai === 'DaCoc') { badgeColor = '#b45309'; badgeBg = '#fef3c7'; borderColor = '#fde68a'; viStatus = 'Đã cọc'; }
        else if(trangThai === 'DaHuy') { badgeColor = '#b91c1c'; badgeBg = '#fee2e2'; borderColor = '#fecaca'; viStatus = 'Đã hủy'; }
        else if(trangThai === 'HoanThanh') { badgeColor = '#047857'; badgeBg = '#d1fae5'; borderColor = '#a7f3d0'; viStatus = 'Hoàn thành'; }
        else if(trangThai === 'KhongDen') { badgeColor = '#475569'; badgeBg = '#e2e8f0'; borderColor = '#cbd5e1'; viStatus = 'Không đến'; }
        return `<span style="padding: 4px 12px; border-radius: 999px; font-size: 0.78rem; font-weight: 700; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${borderColor}; white-space: nowrap;">${viStatus}</span>`;
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        const pad = n => n < 10 ? '0' + n : n;
        return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
    };

    let html = '';

    // LUỒNG 1: TAB PHONG TRÀO (GOM NHÓM THEO HÓA ĐƠN ĐẶT SÂN)
    if (currentBookingTab === 'phong_trao') {
        const filteredList = allMyBookingsData.filter(item => {
            if (item.ID_GiaiDau !== null && item.MaGiaiDau !== null) return false;

            const matchStatus = currentBookingStatus === 'All' || item.TrangThai === currentBookingStatus;
            const sanBong = item.san_bong ? item.san_bong.TenSan.toLowerCase() : '';
            const cumSan = (item.san_bong && item.san_bong.cum_san) ? item.san_bong.cum_san.TenCumSan.toLowerCase() : '';
            const maHD = String(item.MaHoaDonDatSan || '').toLowerCase();
            const maVe = `pt-${item.MaDatSan || item.ID}`.toLowerCase();
            const matchSearch = sanBong.includes(currentBookingSearch) || cumSan.includes(currentBookingSearch) || maHD.includes(currentBookingSearch) || maVe.includes(currentBookingSearch);
            const matchDate = currentBookingDate ? (item.NgayDa === currentBookingDate) : true;

            return matchStatus && matchSearch && matchDate;
        });

        if (filteredList.length === 0) {
            container.innerHTML = `<div class="schedule-container" style="padding: 50px 20px; text-align: center; background: white; border-radius: 16px; border: 1px dashed #cbd5e1;"><i class="fa-regular fa-calendar-xmark" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 14px;"></i><p style="color: var(--text-muted); font-size: 1rem; font-weight: 500;">Không có hóa đơn đặt sân phong trào nào phù hợp.</p></div>`;
            return;
        }

        // Gom nhóm các trận theo MaHoaDonDatSan
        const invoiceGroups = {};
        filteredList.forEach(item => {
            const key = item.MaHoaDonDatSan || ('LE_' + (item.MaDatSan || item.ID));
            if (!invoiceGroups[key]) {
                invoiceGroups[key] = {
                    maHoaDon: item.MaHoaDonDatSan || null,
                    hoaDonObj: item.hoa_don_dat_san || item.hoaDonDatSan || null,
                    matches: []
                };
            }
            invoiceGroups[key].matches.push(item);
        });

        Object.values(invoiceGroups).forEach(group => {
            const hd = group.hoaDonObj;
            const maHDDisplay = group.maHoaDon ? `#${group.maHoaDon}` : `#PT-${group.matches[0].ID}`;
            const allInvoiceMatches = group.maHoaDon
                ? allMyBookingsData.filter(m => m.MaHoaDonDatSan === group.maHoaDon)
                : group.matches;

            const trangThaiHD = hd?.TrangThai || (allInvoiceMatches.some(m => m.TrangThai === 'DaCoc') ? 'DaCoc' : group.matches[0].TrangThai);
            const tongTienHD = hd ? Number(hd.TongTien ?? hd.TongTienSan) : allInvoiceMatches.reduce((s, m) => s + Number(m.TongTien), 0);
            const thueVATHD = hd ? Number(hd.ThueVAT || 0) : 0;
            const tenKMHD = hd?.khuyen_mai?.TenKhuyenMai || hd?.khuyenMai?.TenKhuyenMai || null;

            // Tính tổng tiền sân gốc của các trận còn hiệu lực để suy ra số tiền khuyến mãi đã giảm thực tế
            const activeMatchesForKM = trangThaiHD === 'DaHuy'
                ? allInvoiceMatches
                : allInvoiceMatches.filter(m => m.TrangThai !== 'DaHuy');
            const tongTienSanGocHD = activeMatchesForKM.reduce((s, m) => {
                return s + (m.TrangThai === 'KhongDen' ? Number(m.TienCoc || 0) : Number(m.TongTien || 0));
            }, 0);
            const tienSauGiamHD = Math.max(0, tongTienHD - thueVATHD);
            const soTienGiamHD = Math.max(0, tongTienSanGocHD - tienSauGiamHD);

            const tienCocHD = hd ? Number(hd.TienDaCoc) : allInvoiceMatches.reduce((s, m) => s + Number(m.TienCoc), 0);
            const conLaiHD = Math.max(0, tongTienHD - tienCocHD);
            const soTranDaCoc = allInvoiceMatches.filter(m => m.TrangThai === 'DaCoc').length;

            const ngayTaoStr = hd?.NgayTao ? new Date(hd.NgayTao).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : formatDate(group.matches[0].NgayDa);

            let invoiceActionsHtml = '';
            if (group.maHoaDon) {
                invoiceActionsHtml += `
                    <button type="button" class="btn-outline-sm" style="background:#eff6ff; color:#2563eb; border-color:#bfdbfe; padding:7px 13px; border-radius:8px; font-weight:700; display:inline-flex; align-items:center; gap:6px;" onclick="printCustomerBookingInvoice('${group.maHoaDon}')">
                        <i class="fa-solid fa-print"></i> Xuất hóa đơn
                    </button>
                `;
            }
            if (group.maHoaDon && soTranDaCoc > 0) {
                invoiceActionsHtml += `
                    <button type="button" class="btn-outline-sm" style="background:#fef2f2; color:#dc2626; border-color:#fecaca; padding:7px 13px; border-radius:8px; font-weight:700; display:inline-flex; align-items:center; gap:6px;" onclick="openCancelInvoiceModal('${group.maHoaDon}', ${soTranDaCoc})">
                        <i class="fa-solid fa-ban"></i> Hủy cả hóa đơn (${soTranDaCoc} trận)
                    </button>
                `;
            }

            let cardsHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; margin-top: 14px;">';
            group.matches.forEach(item => {
                const sanBong = item.san_bong ? item.san_bong.TenSan : 'Sân không xác định';
                const cumSan = (item.san_bong && item.san_bong.cum_san) ? item.san_bong.cum_san.TenCumSan : '';
                const khungGio = item.khung_gio ? `${item.khung_gio.GioBatDau.substring(0,5)} - ${item.khung_gio.GioKetThuc.substring(0,5)}` : 'N/A';

                let actionHtml = '';
                let cardClick = '';
                let cursorStyle = 'default';
                let ticketHint = '';

                if (item.TrangThai === 'DaCoc') {
                    actionHtml = `<button class="btn-outline-sm cancel-booking-btn" onclick="event.stopPropagation(); openCancelModal('${item.ID}')"><i class="fa-solid fa-ban"></i><span>Hủy trận này</span></button>`;
                    cardClick = `onclick="openTicketModal('phong_trao', '${item.ID}')" title="Nhấn vào để xem Vé điện tử"`;
                    cursorStyle = 'pointer';
                    ticketHint = `<div style="margin-top: 10px; text-align: center; font-size: 0.78rem; color: var(--primary); font-weight: 600;"><i class="fa-solid fa-qrcode"></i> Bấm để xem Vé Điện Tử (#PT-${item.ID})</div>`;
                } else if (item.TrangThai === 'HoanThanh') {
                    const dg = item.danh_gia || item.danhGia || null;
                    if (dg) {
                        const starsHtml = '★'.repeat(Number(dg.SoSao)) + '☆'.repeat(5 - Number(dg.SoSao));
                        actionHtml = `
                            <div style="margin-top: 12px; padding: 9px 12px; border-radius: 10px; background: #f0fdf4; border: 1px solid #bbf7d0; display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
                                <span style="color: #15803d; font-weight: 700;"><i class="fa-solid fa-circle-check"></i> Đã đánh giá</span>
                                <span style="color: #f59e0b; font-weight: 800; letter-spacing: 1px;">${starsHtml} (${dg.SoSao}/5)</span>
                            </div>
                        `;
                    } else {
                        const safeCumSan = (cumSan || 'Cụm sân').replace(/'/g, "\\'");
                        const safeSanBong = (sanBong || 'Sân bóng').replace(/'/g, "\\'");
                        actionHtml = `
                            <button type="button" class="btn-primary" style="width: 100%; margin-top: 12px; padding: 10px 14px; border-radius: 10px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border: none; color: #fff; font-weight: 700; font-size: 0.88rem; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;" onclick="event.stopPropagation(); openCustomerReviewModal('${item.ID}', '${safeCumSan}', '${safeSanBong}', '${formatDate(item.NgayDa)}')">
                                <i class="fa-solid fa-star"></i> Đánh giá cụm sân
                            </button>
                        `;
                    }
                }

                cardsHtml += `
                    <div class="booking-item-card" ${cardClick} style="cursor: ${cursorStyle}; margin-bottom: 0; border: 1px solid #e2e8f0; box-shadow: none;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                            <div>
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                    <h3 style="margin: 0; font-size: 1.05rem; font-weight: 800; color: var(--text-dark);">${sanBong}</h3>
                                    <span style="font-family: monospace; font-size: 0.76rem; font-weight: 700; background: #f1f5f9; color: #475569; padding: 2px 7px; border-radius: 6px;">#PT-${item.ID}</span>
                                </div>
                                <div style="font-size: 0.83rem; color: var(--text-muted); font-weight: 500;"><i class="fa-solid fa-location-dot" style="color: var(--primary); margin-right: 4px;"></i>${cumSan}</div>
                            </div>
                            ${renderBadge(item.TrangThai)}
                        </div>
                        <div style="background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 10px; padding: 12px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.85rem;">
                                <span style="color: var(--text-muted);">Ngày đá:</span>
                                <strong>${formatDate(item.NgayDa)}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.85rem;">
                                <span style="color: var(--text-muted);">Khung giờ:</span>
                                <strong style="color: var(--primary);">${khungGio}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding-top: 6px; border-top: 1px dashed #e2e8f0; font-size: 0.85rem;">
                                <span style="color: var(--text-muted);">Giá sân / Đã cọc:</span>
                                <span><strong>${Number(item.TongTien).toLocaleString('vi-VN')}đ</strong> / <strong style="color: #ea580c;">${Number(item.TienCoc).toLocaleString('vi-VN')}đ</strong></span>
                            </div>
                        </div>
                        ${ticketHint}
                        ${actionHtml}
                    </div>
                `;
            });
            cardsHtml += '</div>';

            html += `
                <div style="background: #ffffff; border: 1.5px solid #cbd5e1; border-left: 5px solid var(--primary); border-radius: 16px; padding: 20px; margin-bottom: 22px; box-shadow: var(--shadow-sm);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; padding-bottom: 14px; border-bottom: 1px dashed #cbd5e1;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px;">
                                <span style="font-size: 1.1rem; font-weight: 800; color: #0f172a;"><i class="fa-solid fa-file-invoice-dollar" style="color: var(--primary); margin-right: 6px;"></i>Hóa đơn đặt sân: <span style="font-family: monospace; color: var(--primary);">${maHDDisplay}</span></span>
                                ${renderBadge(trangThaiHD)}
                                <span style="font-size: 0.8rem; color: #64748b;"><i class="fa-regular fa-clock"></i> Lập lúc: ${ngayTaoStr}</span>
                            </div>
                            <div style="display: flex; flex-wrap: wrap; gap: 16px; font-size: 0.88rem; color: #475569;">
                                <span>Số trận: <strong style="color:#0f172a;">${allInvoiceMatches.length} trận</strong></span>
                                ${(tenKMHD && soTienGiamHD > 0) ? `<span>Khuyến mãi: <strong style="color:#16a34a;"><i class="fa-solid fa-ticket"></i> ${tenKMHD} (-${soTienGiamHD.toLocaleString('vi-VN')}đ)</strong></span>` : ''}
                                <span>Thuế VAT: <strong style="color:#475569;">${thueVATHD.toLocaleString('vi-VN')}đ</strong></span>
                                <span>Tổng hóa đơn: <strong style="color:#0f172a;">${tongTienHD.toLocaleString('vi-VN')}đ</strong></span>
                                <span>Đã cọc: <strong style="color:#047857;">${tienCocHD.toLocaleString('vi-VN')}đ</strong></span>
                                <span>Còn thu tại sân: <strong style="color:#ea580c;">${conLaiHD.toLocaleString('vi-VN')}đ</strong></span>
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                            ${invoiceActionsHtml}
                        </div>
                    </div>
                    ${cardsHtml}
                </div>
            `;
        });
    } 
    // LUỒNG 2: TAB GIẢI ĐẤU (Bổ sung thêm Mã Hóa Đơn + nút Xuất Hóa Đơn)
    else {
        const giaiDauMap = {};

        allMyBookingsData.forEach(item => {
            if (item.ID_GiaiDau === null) return;

            const sanBong = item.san_bong ? item.san_bong.TenSan.toLowerCase() : '';
            const cumSan = (item.san_bong && item.san_bong.cum_san) ? item.san_bong.cum_san.TenCumSan.toLowerCase() : '';
            const tenGiai = item.giai_dau ? item.giai_dau.TenGiaiDau.toLowerCase() : '';
            const matchSearch = sanBong.includes(currentBookingSearch) || cumSan.includes(currentBookingSearch) || tenGiai.includes(currentBookingSearch);
            const matchStatus = currentBookingStatus === 'All' || item.TrangThai === currentBookingStatus;

            if (!matchSearch || !matchStatus) return;

            if (!giaiDauMap[item.ID_GiaiDau]) {
                giaiDauMap[item.ID_GiaiDau] = {
                    idGiaiDau: item.ID_GiaiDau,
                    maHoaDon: item.MaHoaDonDatSan || null,
                    tenGiaiDau: item.giai_dau ? item.giai_dau.TenGiaiDau : 'Giải đấu không xác định',
                    cumSan: (item.san_bong && item.san_bong.cum_san) ? item.san_bong.cum_san.TenCumSan : 'Cụm sân chưa xác định',
                    ngayBatDau: item.giai_dau ? item.giai_dau.NgayBatDau : null,
                    ngayKetThuc: item.giai_dau ? item.giai_dau.NgayKetThuc : null,
                    matches: [],
                    totalCoc: 0,
                    canCancel: true 
                };
            }
            giaiDauMap[item.ID_GiaiDau].matches.push(item);
            giaiDauMap[item.ID_GiaiDau].totalCoc += Number(item.TienCoc);
            if(item.TrangThai !== 'DaCoc') giaiDauMap[item.ID_GiaiDau].canCancel = false;
        });

        const validTournaments = Object.values(giaiDauMap).filter(gd => {
            if (!currentBookingDate) return true;
            if (!gd.ngayBatDau || !gd.ngayKetThuc) return false;
            return currentBookingDate >= gd.ngayBatDau && currentBookingDate <= gd.ngayKetThuc;
        });

        if (validTournaments.length === 0) {
            container.innerHTML = `<div class="schedule-container" style="padding: 50px 20px; text-align: center; background: white; border-radius: 16px; border: 1px dashed #cbd5e1;"><i class="fa-regular fa-calendar-xmark" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 14px;"></i><p style="color: var(--text-muted); font-size: 1rem; font-weight: 500;">Không tìm thấy lịch đặt giải đấu nào.</p></div>`;
            return;
        }

        validTournaments.forEach(gd => {
            let actionTourHtml = '';
            let cardClick = '';
            let cursorStyle = 'default';

            const thoiGianGiaiDau = (gd.ngayBatDau && gd.ngayKetThuc) 
                ? `Thời gian diễn ra: <strong style="color: #0f172a;">${formatDate(gd.ngayBatDau)} - ${formatDate(gd.ngayKetThuc)}</strong>`
                : 'Thời gian: Đang cập nhật';

            const firstMatch = gd.matches[0];
            const trangThaiGiaiDauGoc = firstMatch && firstMatch.giai_dau ? firstMatch.giai_dau.TrangThai : '';

            const isTourCompleted = (trangThaiGiaiDauGoc === 'HoanThanh') || 
                (gd.matches.length > 0 && gd.matches.every(m => m.TrangThai !== 'DaCoc') && gd.matches.some(m => m.TrangThai === 'HoanThanh'));

            const matchedWithReview = gd.matches.find(m => m.danh_gia || m.danhGia);
            const existingTourReview = matchedWithReview ? (matchedWithReview.danh_gia || matchedWithReview.danhGia) : null;
            const representativeMatch = gd.matches.find(m => m.TrangThai === 'HoanThanh') || firstMatch;

            const btnExportInvoiceTour = gd.maHoaDon
                ? `<button type="button" class="btn-outline-sm" style="background:#eff6ff; color:#2563eb; border-color:#bfdbfe; padding:7px 13px; border-radius:8px; font-weight:700;" onclick="event.stopPropagation(); printCustomerBookingInvoice('${gd.maHoaDon}')"><i class="fa-solid fa-print"></i> Xuất hóa đơn</button>`
                : '';

            if (gd.canCancel) {
                actionTourHtml = `<div style="display:flex; gap:8px; flex-wrap:wrap;">${btnExportInvoiceTour}<button class="btn-cancel-tour" onclick="event.stopPropagation(); openCancelTourModal('${gd.idGiaiDau}')"><i class="fa-solid fa-ban"></i><span>Hủy toàn bộ giải</span></button></div>`;
                cardClick = `onclick="openTicketModal('giai_dau', '${gd.idGiaiDau}')" title="Nhấn vào để xem Vé Tổng Giải Đấu"`;
                cursorStyle = 'pointer';
            } else if (existingTourReview) {
                const starsHtml = '★'.repeat(Number(existingTourReview.SoSao)) + '☆'.repeat(5 - Number(existingTourReview.SoSao));
                actionTourHtml = `
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                        ${btnExportInvoiceTour}
                        <div style="padding: 8px 14px; border-radius: 10px; background: #f0fdf4; border: 1px solid #bbf7d0; display: inline-flex; align-items: center; gap: 10px; font-size: 0.85rem;">
                            <span style="color: #15803d; font-weight: 700;"><i class="fa-solid fa-circle-check"></i> Đã đánh giá</span>
                            <span style="color: #f59e0b; font-weight: 800; letter-spacing: 1px;">${starsHtml} (${existingTourReview.SoSao}/5)</span>
                        </div>
                    </div>
                `;
            } else if (isTourCompleted && representativeMatch) {
                const safeCumSan = (gd.cumSan || 'Cụm sân').replace(/'/g, "\\'");
                const safeTenGiai = (`Giải đấu: ${gd.tenGiaiDau}`).replace(/'/g, "\\'");
                const rangeDateStr = (gd.ngayBatDau && gd.ngayKetThuc) ? `${formatDate(gd.ngayBatDau)} - ${formatDate(gd.ngayKetThuc)}` : '';
                actionTourHtml = `
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                        ${btnExportInvoiceTour}
                        <button type="button" class="btn-primary" style="padding: 9px 16px; border-radius: 10px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border: none; color: #fff; font-weight: 700; font-size: 0.88rem; display: inline-flex; align-items: center; gap: 8px; cursor: pointer;" onclick="event.stopPropagation(); openCustomerReviewModal('${representativeMatch.ID}', '${safeCumSan}', '${safeTenGiai}', '${rangeDateStr}')">
                            <i class="fa-solid fa-star"></i> Đánh giá cụm sân
                        </button>
                    </div>
                `;
            } else {
                actionTourHtml = `<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">${btnExportInvoiceTour}<div class="cancel-tour-disabled"><i class="fa-solid fa-lock"></i><span>Không thể hủy tự động</span></div></div>`;
            }

            let statusBadgeHtml = '';
            if (trangThaiGiaiDauGoc === 'HetHan') {
                statusBadgeHtml = `<span style="padding: 4px 12px; border-radius: 999px; font-size: 0.78rem; font-weight: 700; background: #d1fae5; color: #047857; margin-left: 10px;">Đã chốt lịch</span>`;
            } else if (trangThaiGiaiDauGoc === 'HoanThanh') {
                statusBadgeHtml = `<span style="padding: 4px 12px; border-radius: 999px; font-size: 0.78rem; font-weight: 700; background: #dbeafe; color: #1d4ed8; margin-left: 10px;">Đã hoàn thành</span>`;
            } else if (trangThaiGiaiDauGoc === 'DaHuy' || trangThaiGiaiDauGoc === 'TuChoi') {
                statusBadgeHtml = `<span style="padding: 4px 12px; border-radius: 999px; font-size: 0.78rem; font-weight: 700; background: #fee2e2; color: #b91c1c; margin-left: 10px;">Đã hủy</span>`;
            }

            gd.matches.sort((a, b) => {
                const timeA = new Date(a.NgayDa + 'T' + (a.khung_gio ? a.khung_gio.GioBatDau : '00:00:00')).getTime();
                const timeB = new Date(b.NgayDa + 'T' + (b.khung_gio ? b.khung_gio.GioBatDau : '00:00:00')).getTime();
                return timeA - timeB;
            });

            let rowsHtml = '';
            gd.matches.forEach((m, index) => {
                const timeStr = m.khung_gio ? `${m.khung_gio.GioBatDau.substring(0,5)} - ${m.khung_gio.GioKetThuc.substring(0,5)}` : '';
                const isExtra = index >= 4;
                const displayStyle = isExtra ? 'display: none;' : '';
                const rowClass = `tour-match-${gd.idGiaiDau} ${isExtra ? 'extra-match' : ''}`;
                
                rowsHtml += `
                <tr class="${rowClass}" style="${displayStyle}">
                    <td style="text-align: center;"><strong>${m.san_bong ? m.san_bong.TenSan : ''}</strong><br><span style="font-size: 0.8rem; color: var(--text-muted);">${m.san_bong && m.san_bong.cum_san ? m.san_bong.cum_san.TenCumSan : ''}</span></td>
                    <td style="text-align: center; font-weight: 500;">${formatDate(m.NgayDa)}</td>
                    <td style="text-align: center;"><strong style="color: var(--primary);">${timeStr}</strong></td>
                    <td style="text-align: center; font-weight: 700; color: #ea580c;">${Number(m.TienCoc).toLocaleString('vi-VN')}đ</td>
                    <td style="text-align: center;">${renderBadge(m.TrangThai)}</td>
                </tr>
                `;
            });

            let toggleBtnHtml = '';
            if (gd.matches.length > 4) {
                toggleBtnHtml = `
                <div style="text-align: center; padding: 12px; background: #f8fafc; border-top: 1px dashed var(--border);">
                    <button type="button" class="btn-outline-sm" data-expanded="false" onclick="event.stopPropagation(); toggleTourMatches('${gd.idGiaiDau}', this)" style="border-radius: 20px; padding: 6px 16px; font-size: 0.85rem; background: white;">
                        Hiển thị tất cả (${gd.matches.length} trận) <i class="fa-solid fa-chevron-down" style="margin-left: 4px;"></i>
                    </button>
                </div>
                `;
            }

            html += `
                <div class="booking-item-card" ${cardClick} style="cursor: ${cursorStyle}; border-left: 5px solid #4338ca; padding: 22px; margin-bottom: 24px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; border-bottom: 1px dashed var(--border); padding-bottom: 16px; flex-wrap: wrap; gap: 14px;">
                        <div>
                            <h3 style="margin: 0 0 8px 0; font-size: 1.25rem; font-weight: 800; color: #312e81; display: flex; align-items: center; flex-wrap: wrap;">
                                <i class="fa-solid fa-trophy" style="margin-right: 8px; color: #4338ca;"></i> Giải đấu: ${gd.tenGiaiDau}
                                ${gd.maHoaDon ? `<span style="font-family:monospace; font-size:0.85rem; background:#eef2ff; color:#4338ca; padding:3px 9px; border-radius:6px; margin-left:8px;">HĐ #${gd.maHoaDon}</span>` : ''}
                                ${statusBadgeHtml}
                            </h3>
                            <div style="display: flex; flex-wrap: wrap; gap: 18px; font-size: 0.9rem; color: var(--text-muted); margin-top: 6px;">
                                <span><i class="fa-solid fa-location-dot" style="color: var(--primary);"></i> <strong style="color: var(--text-dark);">${gd.cumSan}</strong></span>
                                <span><i class="fa-regular fa-calendar"></i> ${thoiGianGiaiDau}</span>
                                <span><i class="fa-solid fa-futbol"></i> Số trận: <strong style="color: #0f172a;">${gd.matches.length}</strong> | Tổng cọc: <strong style="color: #ea580c;">${gd.totalCoc.toLocaleString('vi-VN')}đ</strong></span>
                            </div>
                        </div>
                        ${actionTourHtml}
                    </div>
                    
                    <div class="table-responsive" style="border: 1px solid var(--border); border-radius: 12px; overflow: hidden;">
                        <table class="admin-table" style="font-size: 0.9rem; margin: 0; min-width: 100%; border: none;">
                            <thead style="background: #f8fafc;">
                                <tr>
                                    <th style="text-align: center;">Sân bóng</th>
                                    <th style="text-align: center;">Ngày đá</th>
                                    <th style="text-align: center;">Khung giờ</th>
                                    <th style="text-align: center;">Tiền cọc</th>
                                    <th style="text-align: center;">Trạng thái</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                        ${toggleBtnHtml}
                    </div>
                </div>
            `;
        });
    }

    container.innerHTML = html;
}

// ======================================================
// HỦY TOÀN BỘ HÓA ĐƠN ĐẶT SÂN PHONG TRÀO & XUẤT HÓA ĐƠN (KHÁCH HÀNG)
// ======================================================
let pendingCancelInvoiceId = null;

window.openCancelInvoiceModal = function(maHoaDon, soTran) {
    pendingCancelInvoiceId = maHoaDon;
    let modal = document.getElementById('cancel-invoice-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cancel-invoice-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10000; align-items: center; justify-content: center;';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 430px; width: 92%; text-align: center; padding: 28px 24px; border-radius: 16px;">
            <div style="font-size: 3.2rem; color: #ef4444; margin-bottom: 12px;"><i class="fa-solid fa-file-circle-xmark"></i></div>
            <h3 style="margin-bottom: 8px; font-size: 1.3rem;">Hủy toàn bộ hóa đơn #${maHoaDon}?</h3>
            <p style="color: var(--text-muted); font-size: 0.92rem; line-height: 1.5; margin-bottom: 18px;">
                Hệ thống sẽ hủy toàn bộ <strong>${soTran} trận đang đặt cọc</strong> trong hóa đơn này và hoàn trả 100% tiền cọc vào ví của bạn (áp dụng khi tất cả các trận đều còn trước giờ bóng lăn tối thiểu 10 tiếng).
            </p>
            <div id="cancel-invoice-alert" class="modal-alert" style="display: none; margin-bottom: 14px;"></div>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button type="button" class="btn-outline" style="flex: 1; padding: 10px;" onclick="document.getElementById('cancel-invoice-modal').style.display='none'">Đóng</button>
                <button type="button" id="btn-confirm-cancel-invoice" class="btn-primary" style="flex: 1.2; padding: 10px; background: #ef4444; border-color: #ef4444;" onclick="executeCancelInvoiceCustomer()">Đồng ý hủy hóa đơn</button>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
};

window.executeCancelInvoiceCustomer = async function() {
    if (!pendingCancelInvoiceId) return;
    const btn = document.getElementById('btn-confirm-cancel-invoice');
    const alertBox = document.getElementById('cancel-invoice-alert');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    alertBox.style.display = 'none';

    try {
        const res = await fetch(`${API_BASE_URL}/hoa-don-dat-san/${pendingCancelInvoiceId}/huy`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (res.ok && data.success) {
            alertBox.textContent = data.message;
            alertBox.className = 'modal-alert success';
            alertBox.style.display = 'block';
            syncUserWallet();
            setTimeout(() => {
                document.getElementById('cancel-invoice-modal').style.display = 'none';
                loadMyBookingsData();
            }, 1500);
        } else {
            alertBox.textContent = data.message || 'Không thể hủy hóa đơn!';
            alertBox.className = 'modal-alert error';
            alertBox.style.display = 'block';
            btn.disabled = false;
            btn.innerHTML = 'Đồng ý hủy hóa đơn';
        }
    } catch (e) {
        alertBox.textContent = 'Lỗi kết nối máy chủ!';
        alertBox.className = 'modal-alert error';
        alertBox.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = 'Đồng ý hủy hóa đơn';
    }
};

window.printCustomerBookingInvoice = async function(maHoaDon) {
    try {
        const res = await fetch(`${API_BASE_URL}/hoa-don-dat-san/${maHoaDon}`);
        const json = await res.json();
        if (!json.success || !json.data) {
            showToast(json.message || 'Không tìm thấy hóa đơn!');
            return;
        }
        const hd = json.data;
        const listDatSan = hd.dat_sans || hd.datSans || [];
        const user = JSON.parse(sessionStorage.getItem('dn_football_user')) || {};
        const tenKhach = hd.nguoi_dung?.HoTen || user.HoTen || 'Khách hàng';
        const sdtKhach = hd.nguoi_dung?.SoDienThoai || user.SoDienThoai || '';
        const ngayLap = hd.NgayTao ? new Date(hd.NgayTao).toLocaleString('vi-VN') : '';

        const statusMap = { 'DaCoc': 'Đã đặt cọc', 'HoanThanh': 'Đã hoàn thành', 'DaHuy': 'Đã hủy', 'KhongDen': 'Không đến' };

        let tongTienSanGoc = 0;
        const rowsHtml = listDatSan.map((ds, i) => {
            const tenSan = ds.san_bong?.TenSan || 'Sân bóng';
            const cumSan = ds.san_bong?.cum_san?.TenCumSan || '';
            const kg = ds.khung_gio ? `${ds.khung_gio.GioBatDau.substring(0,5)} - ${ds.khung_gio.GioKetThuc.substring(0,5)}` : '';
            const ngayDa = ds.NgayDa ? ds.NgayDa.split('-').reverse().join('/') : '';
            const maVe = (ds.MaGiaiDau || ds.ID_GiaiDau) ? `GD-${ds.MaGiaiDau || ds.ID_GiaiDau}` : `PT-${ds.MaDatSan || ds.ID}`;
            const donGia = Number(ds.pivot?.DonGia ?? ds.TongTien ?? 0);
            if (ds.TrangThai !== 'DaHuy') tongTienSanGoc += donGia;

            return `
                <tr>
                    <td style="text-align:center;">${i + 1}</td>
                    <td style="text-align:center; font-family:monospace; font-weight:bold;">#${maVe}</td>
                    <td><strong>${tenSan}</strong><br><small>${cumSan}</small></td>
                    <td style="text-align:center;">${kg}<br><small>${ngayDa}</small></td>
                    <td style="text-align:center;">${statusMap[ds.TrangThai] || ds.TrangThai}</td>
                    <td style="text-align:right;">${donGia.toLocaleString('vi-VN')}đ</td>
                    <td style="text-align:right; color:#047857; font-weight:bold;">${Number(ds.TienCoc).toLocaleString('vi-VN')}đ</td>
                </tr>
            `;
        }).join('');

        const tongTien = Number(hd.TongTien ?? hd.TongTienSan ?? 0);
        const thueVAT = Number(hd.ThueVAT || 0);
        const tienSauGiam = Math.max(0, tongTien - thueVAT);
        const soTienGiam = Math.max(0, tongTienSanGoc - tienSauGiam);
        const kmObj = hd.khuyen_mai || hd.khuyenMai || null;
        const tienCoc = Number(hd.TienDaCoc || 0);
        const conLai = Math.max(0, tongTien - tienCoc);

        const printWin = window.open('', '_blank', 'width=880,height=740');
        if (!printWin) return showToast('Vui lòng cho phép mở cửa sổ Pop-up để in hóa đơn!');

        printWin.document.write(`
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8">
                <title>Hóa đơn đặt sân #${hd.MaHoaDonDatSan} - DN Football</title>
                <style>
                    body { font-family: Arial, sans-serif; color: #0f172a; margin: 30px; line-height: 1.5; }
                    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0b5d3b; padding-bottom: 14px; margin-bottom: 20px; }
                    .brand { font-size: 20px; font-weight: 800; color: #0b5d3b; }
                    h2 { text-align: center; color: #0b5d3b; margin: 15px 0; }
                    table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 13px; }
                    th, td { border: 1px solid #cbd5e1; padding: 10px; }
                    th { background: #f1f5f9; }
                    .summary { width: 360px; margin-left: auto; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; font-size: 13.5px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <div class="brand">HỆ THỐNG SÂN BÓNG ĐÁ DN FOOTBALL</div>
                        <div style="font-size:13px; color:#475569;">Đà Nẵng, Việt Nam | Hotline: 0899244124</div>
                    </div>
                    <div style="text-align:right; font-size:13px;">
                        <strong>Mã hóa đơn: #${hd.MaHoaDonDatSan}</strong><br>
                        Ngày lập: ${ngayLap}<br>
                        Trạng thái HĐ: <strong>${statusMap[hd.TrangThai] || hd.TrangThai}</strong>
                    </div>
                </div>
                <h2>HÓA ĐƠN ĐẶT SÂN ĐIỆN TỬ</h2>
                <p><strong>Khách hàng:</strong> ${tenKhach} &bull; <strong>Số điện thoại:</strong> ${sdtKhach}</p>
                <table>
                    <thead>
                        <tr>
                            <th>STT</th>
                            <th>Mã Vé</th>
                            <th>Sân Bóng & Cơ Sở</th>
                            <th>Khung Giờ & Ngày Đá</th>
                            <th>Trạng Thái</th>
                            <th>Đơn Giá Khung Giờ</th>
                            <th>Tiền Đã Cọc</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
                <div class="summary">
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px;"><span>Tổng tiền sân gốc:</span><strong>${tongTienSanGoc.toLocaleString('vi-VN')}đ</strong></div>
                    ${soTienGiam > 0 ? `<div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#2563eb;"><span>Khuyến mãi (${kmObj ? kmObj.TenKhuyenMai : 'Voucher'}):</span><strong>-${soTienGiam.toLocaleString('vi-VN')}đ</strong></div>` : ''}
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#475569;"><span>Thuế VAT (8%):</span><strong>+${thueVAT.toLocaleString('vi-VN')}đ</strong></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px; border-top:1px solid #e2e8f0; padding-top:6px;"><span>Tổng tiền hóa đơn:</span><strong>${tongTien.toLocaleString('vi-VN')}đ</strong></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#047857;"><span>Đã đặt cọc:</span><strong>${tienCoc.toLocaleString('vi-VN')}đ</strong></div>
                    <div style="display:flex; justify-content:space-between; border-top:1px dashed #cbd5e1; padding-top:8px; color:#e11d48; font-size:15px;"><strong>Còn thu tại sân:</strong><strong>${conLai.toLocaleString('vi-VN')}đ</strong></div>
                </div>
                <script>window.onload = function(){ setTimeout(() => window.print(), 350); };<\/script>
            </body>
            </html>
        `);
        printWin.document.close();
    } catch (e) {
        showToast('Lỗi tải hóa đơn!');
    }
};

function toggleTourMatches(idGiaiDau, btnElement) {
    const extraRows = document.querySelectorAll(`.tour-match-${idGiaiDau}.extra-match`);
    const isExpanded = btnElement.getAttribute('data-expanded') === 'true';

    if (isExpanded) {
        // Thu gọn lại
        extraRows.forEach(row => row.style.display = 'none');
        btnElement.innerHTML = `Hiển thị tất cả <i class="fa-solid fa-chevron-down" style="margin-left: 4px;"></i>`;
        btnElement.setAttribute('data-expanded', 'false');
    } else {
        // Mở rộng ra
        extraRows.forEach(row => row.style.display = 'table-row');
        btnElement.innerHTML = `Thu gọn <i class="fa-solid fa-chevron-up" style="margin-left: 4px;"></i>`;
        btnElement.setAttribute('data-expanded', 'true');
    }
}

// ======================================================
// LOGIC MODAL HỦY TOÀN BỘ GIẢI ĐẤU
// ======================================================
let pendingCancelTourId = null;

function openCancelTourModal(idGiaiDau) {
    pendingCancelTourId = idGiaiDau;
    document.getElementById('cancel-tour-alert').style.display = 'none';
    document.getElementById('cancel-tour-modal').style.display = 'flex';
}

function closeCancelTourModal() {
    pendingCancelTourId = null;
    document.getElementById('cancel-tour-modal').style.display = 'none';
}

async function executeCancelTournament() {
    if (!pendingCancelTourId) return;
    
    const btn = document.getElementById('btn-confirm-cancel-tour');
    const alertBox = document.getElementById('cancel-tour-alert');
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    alertBox.style.display = 'none';

    try {
        // Gọi API Hủy hàng loạt theo ID Giải Đấu
        const response = await fetch(`${API_BASE_URL}/giai-dau/${pendingCancelTourId}/huy-lich`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-Socket-ID': window.Echo.socketId() }
        });

        const data = await response.json();

        if (response.ok && data.success) {
            alertBox.textContent = data.message;
            alertBox.className = 'modal-alert success';
            alertBox.style.display = 'block';

            // Đồng bộ tiền hoàn trả vào số dư Ví trên thanh Header
            syncUserWallet();
            
            setTimeout(() => {
                closeCancelTourModal();
                loadMyBookingsData();
                btn.disabled = false;
                btn.innerHTML = 'Đồng ý Hủy Giải';
            }, 2000);
        } else {
            // Thông báo lỗi nếu quá hạn 7 ngày
            alertBox.textContent = data.message || 'Có lỗi xảy ra!';
            alertBox.className = 'modal-alert error';
            alertBox.style.display = 'block';
            btn.disabled = false;
            btn.innerHTML = 'Đồng ý Hủy Giải';
        }
    } catch (error) {
        alertBox.textContent = 'Lỗi kết nối máy chủ!';
        alertBox.className = 'modal-alert error';
        alertBox.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = 'Đồng ý Hủy Giải';
    }
}

// Logic điểu khiển Modal Hủy Sân
let pendingCancelId = null;

function openCancelModal(id) {
    pendingCancelId = id;
    document.getElementById('cancel-booking-alert').style.display = 'none';
    document.getElementById('cancel-booking-modal').style.display = 'flex';
}

function closeCancelModal() {
    pendingCancelId = null;
    document.getElementById('cancel-booking-modal').style.display = 'none';
}

async function executeCancelBooking() {
    if (!pendingCancelId) return;
    
    const btn = document.getElementById('btn-confirm-cancel');
    const alertBox = document.getElementById('cancel-booking-alert');
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    alertBox.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE_URL}/dat-san/${pendingCancelId}/huy`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-Socket-ID': window.Echo.socketId() }
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Thông báo thành công
            alertBox.textContent = data.message;
            alertBox.className = 'modal-alert success';
            alertBox.style.display = 'block';

            // Đồng bộ tiền hoàn trả vào số dư Ví trên thanh Header
            syncUserWallet();
            
            setTimeout(() => {
                closeCancelModal();
                loadMyBookingsData();
                btn.disabled = false;
                btn.innerHTML = 'Đồng ý Hủy';
            }, 2000);
        } else {
            // Thông báo lỗi nếu quá hạn 10 tiếng
            alertBox.textContent = data.message || 'Có lỗi xảy ra!';
            alertBox.className = 'modal-alert error';
            alertBox.style.display = 'block';
            btn.disabled = false;
            btn.innerHTML = 'Đồng ý Hủy';
        }
    } catch (error) {
        alertBox.textContent = 'Lỗi kết nối máy chủ!';
        alertBox.className = 'modal-alert error';
        alertBox.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = 'Đồng ý Hủy';
    }
}

function showProfileAlert(message, isSuccess) {
    const alertBox = document.getElementById('profile-alert');
    alertBox.textContent = message;
    alertBox.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alertBox.style.display = 'block';

    // Tự động ẩn sau 2 giây
    setTimeout(() => {
        alertBox.style.display = 'none';
    }, 2000);
}

function updateCustomerBankWarningUI() {
    let warnBox = document.getElementById('prof-bank-warning');
    const bankInput = document.getElementById('prof-bank-name');
    if (!bankInput) return;

    if (!warnBox) {
        warnBox = document.createElement('div');
        warnBox.id = 'prof-bank-warning';
        warnBox.style.cssText = 'background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; color: #92400e; padding: 10px 14px; border-radius: 8px; font-size: 0.84rem; margin-bottom: 12px; display: none; align-items: center; gap: 10px; line-height: 1.5;';
        const sectionContainer = bankInput.closest('div[style*="border-top"]');
        if (sectionContainer) {
            sectionContainer.insertBefore(warnBox, sectionContainer.firstChild);
        }
    }

    const bank = document.getElementById('prof-bank-name')?.value.trim() || '';
    const stk = document.getElementById('prof-bank-stk')?.value.trim() || '';
    const owner = document.getElementById('prof-bank-owner')?.value.trim() || '';

    if (!bank || !stk || !owner) {
        warnBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #f59e0b; font-size: 1.1rem; flex-shrink: 0;"></i> <div><strong>Chưa đầy đủ thông tin ngân hàng!</strong> Vui lòng bổ sung Tên ngân hàng, Số tài khoản và Tên chủ tài khoản để thuận tiện khi rút tiền từ ví.</div>`;
        warnBox.style.display = 'flex';
    } else {
        warnBox.style.display = 'none';
    }
}

function openProfileModal() {
    document.getElementById('profile-alert').style.display = 'none';

    const user = JSON.parse(sessionStorage.getItem('dn_football_user'));
    if (!user) return;
    
    document.getElementById('prof-hoten').value = user.HoTen || '';
    document.getElementById('prof-sdt').value = user.SoDienThoai || '';
    document.getElementById('prof-email').value = user.Email || '';
    if (document.getElementById('prof-vneid')) document.getElementById('prof-vneid').value = user.Vneid || '';
    if (document.getElementById('prof-bank-name')) document.getElementById('prof-bank-name').value = user.TenNganHang || '';
    if (document.getElementById('prof-bank-stk')) document.getElementById('prof-bank-stk').value = user.STKNganHang || '';
    if (document.getElementById('prof-bank-owner')) document.getElementById('prof-bank-owner').value = user.TenTaiKhoan || '';
    
    updateCustomerBankWarningUI();

    document.getElementById('btn-save-profile').disabled = true;
    document.getElementById('btn-save-profile').classList.add('btn-disabled');
    document.getElementById('profile-modal').style.display = 'flex';
    document.getElementById('user-dropdown').classList.remove('show');
}

function closeProfileModal() {
    document.getElementById('profile-modal').style.display = 'none';
}

['prof-hoten', 'prof-sdt', 'prof-email', 'prof-vneid', 'prof-bank-name', 'prof-bank-stk', 'prof-bank-owner'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
        const user = JSON.parse(sessionStorage.getItem('dn_football_user'));
        const isChanged = 
            document.getElementById('prof-hoten').value !== (user.HoTen || '') ||
            document.getElementById('prof-sdt').value !== (user.SoDienThoai || '') ||
            document.getElementById('prof-email').value !== (user.Email || '') ||
            (document.getElementById('prof-vneid') && document.getElementById('prof-vneid').value !== (user.Vneid || '')) ||
            (document.getElementById('prof-bank-name') && document.getElementById('prof-bank-name').value !== (user.TenNganHang || '')) ||
            (document.getElementById('prof-bank-stk') && document.getElementById('prof-bank-stk').value !== (user.STKNganHang || '')) ||
            (document.getElementById('prof-bank-owner') && document.getElementById('prof-bank-owner').value !== (user.TenTaiKhoan || ''));
            
        const btnSave = document.getElementById('btn-save-profile');
        if (isChanged) {
            btnSave.disabled = false;
            btnSave.classList.remove('btn-disabled');
        } else {
            btnSave.disabled = true;
            btnSave.classList.add('btn-disabled');
        }
    });
});

async function saveProfile() {
    const btnSave = document.getElementById('btn-save-profile');
    btnSave.disabled = true;
    btnSave.textContent = 'Đang lưu...';

    const payload = {
        ho_ten: document.getElementById('prof-hoten').value,
        so_dien_thoai: document.getElementById('prof-sdt').value,
        email: document.getElementById('prof-email').value,
        vneid: document.getElementById('prof-vneid')?.value.trim() || null,
        ten_ngan_hang: document.getElementById('prof-bank-name')?.value.trim() || null,
        stk_ngan_hang: document.getElementById('prof-bank-stk')?.value.trim() || null,
        ten_tai_khoan: document.getElementById('prof-bank-owner')?.value.trim().toUpperCase() || null
    };

    try {
        const response = await fetch(`${API_BASE_URL}/cap-nhat-profile`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            showProfileAlert(data.message || 'Có lỗi xảy ra khi cập nhật!', false);
            btnSave.disabled = false;
            btnSave.textContent = 'Lưu thay đổi';
            return;
        }

        sessionStorage.setItem('dn_football_user', JSON.stringify(data.user));
        loadCustomerInfo(); 
        showProfileAlert('Cập nhật thông tin thành công!', true);
        
        setTimeout(() => {
            closeProfileModal();
            btnSave.textContent = 'Lưu thay đổi';
        }, 1500);

    } catch (error) {
        showProfileAlert('Không thể kết nối đến máy chủ!', false);
        btnSave.disabled = false;
        btnSave.textContent = 'Lưu thay đổi';
    }
}

// ======================================================
// MODULE: ĐỔI MẬT KHẨU
// ======================================================

function showPasswordAlert(message, isSuccess) {
    const alertBox = document.getElementById('password-alert');
    alertBox.textContent = message;
    alertBox.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alertBox.style.display = 'block';

    setTimeout(() => {
        alertBox.style.display = 'none';
    }, 2500);
}

function openChangePasswordModal() {
    const user = JSON.parse(sessionStorage.getItem('dn_football_user'));
    if (!user) return;

    document.getElementById('password-alert').style.display = 'none';
    
    // Giao diện đã được thiết kế lại, chỉ có 1 bước nhập Mật khẩu
    document.getElementById('old-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-password').value = '';
    
    document.getElementById('password-modal').style.display = 'flex';

    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const pwdMenu = Array.from(document.querySelectorAll('.sidebar-nav a')).find(a => a.textContent.includes('ĐỔI MẬT KHẨU'));
    if (pwdMenu) pwdMenu.classList.add('active');
}

function closeChangePasswordModal() { 
    document.getElementById('password-modal').style.display = 'none'; 
}

// BỎ 2 HÀM sendPasswordOTP() VÀ verifyAndChangePassword() CŨ, THAY BẰNG HÀM MỚI SAU:
async function executeChangePassword() {
    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const btn = document.getElementById('btn-confirm-pwd');

    if (!oldPassword || !newPassword || !confirmPassword) {
        return showPasswordAlert('Vui lòng nhập đầy đủ các trường', false);
    }
    if (newPassword.length < 6) {
        return showPasswordAlert('Mật khẩu mới tối thiểu 6 ký tự', false);
    }
    if (newPassword !== confirmPassword) {
        return showPasswordAlert('Xác nhận mật khẩu không khớp', false);
    }

    btn.disabled = true; 
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';

    try {
        const response = await fetch(`${API_BASE_URL}/doi-mat-khau`, {
            method: 'POST',
            headers: { 
                'Accept': 'application/json', 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}`
            },
            body: JSON.stringify({ 
                mat_khau_cu: oldPassword, 
                mat_khau_moi: newPassword,
                xac_nhan_mat_khau: confirmPassword
            })
        });
        
        const data = await response.json();

        if (!response.ok || !data.success) {
            let errorMsg = data.message || 'Mật khẩu hiện tại không đúng';
            if (data.errors) errorMsg = Object.values(data.errors)[0][0]; // Lấy lỗi validate đầu tiên
            
            showPasswordAlert(errorMsg, false);
            btn.disabled = false; 
            btn.innerHTML = 'Xác nhận đổi mật khẩu';
            return;
        }

        showPasswordAlert('Đổi mật khẩu thành công!', true);
        
        setTimeout(() => {
            closeChangePasswordModal();
            btn.disabled = false; 
            btn.innerHTML = 'Xác nhận đổi mật khẩu';
        }, 2000);

    } catch (error) {
        showPasswordAlert('Lỗi kết nối máy chủ', false);
        btn.disabled = false; 
        btn.innerHTML = 'Xác nhận đổi mật khẩu';
    }
}

async function renderRequests(activeTab = 'giai_dau') {
    updateActiveNav('renderRequests');
    currentClusterId = null;

    const activeStyle = "padding: 10px 20px; border-radius: 10px; background: var(--primary); color: #ffffff; font-weight: 700; font-size: 0.9rem; border: none; cursor: pointer; box-shadow: 0 2px 6px rgba(22, 163, 74, 0.25); transition: all 0.2s;";
    const inactiveStyle = "padding: 10px 20px; border-radius: 10px; color: #475569; background: transparent; font-weight: 600; font-size: 0.9rem; border: none; cursor: pointer; transition: all 0.2s;";

    appContent.innerHTML = `
        <div class="page-header" style="padding: 22px 28px; border-radius: 18px; background: linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%); border: 1px solid #bbf7d0; border-left: 5px solid var(--primary); box-shadow: var(--shadow-sm); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; margin-bottom: 22px;">
            <div>
                <div style="font-size: 0.76rem; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px;">
                    <i class="fa-solid fa-file-signature"></i> Hỗ trợ & Tổ chức sự kiện
                </div>
                <h1 class="page-title" style="margin-bottom: 4px;">Quản lý Yêu cầu</h1>
                <p class="page-subtitle">Theo dõi tiến độ phê duyệt các đơn đăng ký tổ chức giải đấu và yêu cầu hủy sân gấp</p>
            </div>
            
            <div>
                ${activeTab === 'giai_dau' ? `<button class="btn-primary" onclick="openCreateTournamentModal()" style="display: flex; align-items: center; gap: 8px; padding: 11px 20px;"><i class="fa-solid fa-plus"></i> Tạo Yêu cầu Giải đấu</button>` : ''}
                ${activeTab === 'huy_san' ? `<button class="btn-primary" onclick="openUrgentCancelModal()" style="display: flex; align-items: center; gap: 8px; padding: 11px 20px;"><i class="fa-solid fa-plus"></i> Tạo Yêu cầu Hủy Gấp</button>` : ''}
            </div>
        </div>

        <div style="display: inline-flex; gap: 8px; margin-bottom: 20px; background: #dceee3; padding: 5px; border-radius: 12px; border: 1px solid #c3dfd0;">
            <button style="${activeTab === 'giai_dau' ? activeStyle : inactiveStyle}" onclick="renderRequests('giai_dau')"><i class="fa-solid fa-trophy" style="margin-right: 6px;"></i>Yêu cầu Giải đấu</button>
            <button style="${activeTab === 'huy_san' ? activeStyle : inactiveStyle}" onclick="renderRequests('huy_san')"><i class="fa-solid fa-calendar-xmark" style="margin-right: 6px;"></i>Yêu cầu Hủy sân gấp</button>
        </div>

        <div id="requests-content-body" class="schedule-container" style="padding: 24px; text-align: center; background: rgba(255, 255, 255, 0.92); backdrop-filter: blur(8px); border-radius: 16px; box-shadow: var(--shadow-sm); border: 1px solid var(--border); margin-top: 0;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i>
        </div>
    `;

    const container = document.getElementById('requests-content-body');

    if (activeTab === 'giai_dau') {
        try {
            const response = await fetch(`${API_BASE_URL}/giai-dau/cua-toi`);
            if (!response.ok) throw new Error('API chưa sẵn sàng');
            
            const res = await response.json();
            const list = res.data || [];

            if (list.length === 0) {
                container.innerHTML = `
                    <div style="padding: 50px 20px;">
                        <i class="fa-regular fa-folder-open" style="font-size: 3.2rem; color: #cbd5e1; margin-bottom: 14px;"></i>
                        <p style="color: var(--text-muted); font-size: 1rem; font-weight: 500;">Bạn chưa gửi yêu cầu tổ chức giải đấu nào.</p>
                    </div>`;
            } else {
                let html = `<div style="display: flex; flex-direction: column; gap: 14px; max-height: 520px; overflow-y: auto; padding-right: 6px; text-align: left;">`;
                
                list.forEach(item => {
                    const statusTextMap = {
                        'ChoDuyet': 'Chờ duyệt',
                        'DaDuyet': 'Đã duyệt',
                        'TuChoi': 'Từ chối',
                        'HetHan': 'Đã chốt lịch / Hết hạn',
                        'HoanThanh': 'Hoàn thành',
                        'DaHuy': 'Đã hủy'
                    };
                    const viStatus = statusTextMap[item.TrangThai] || item.TrangThai;

                    let badgeColor = '#475569', badgeBg = '#f1f5f9', borderLeftColor = '#cbd5e1'; 
                    if(item.TrangThai === 'DaDuyet') { badgeColor = '#047857'; badgeBg = '#d1fae5'; borderLeftColor = '#10b981'; }
                    else if(item.TrangThai === 'TuChoi' || item.TrangThai === 'DaHuy') { badgeColor = '#b91c1c'; badgeBg = '#fee2e2'; borderLeftColor = '#ef4444'; }
                    else if(item.TrangThai === 'ChoDuyet') { badgeColor = '#b45309'; badgeBg = '#fef3c7'; borderLeftColor = '#f59e0b'; }
                    else if(item.TrangThai === 'HetHan') { badgeColor = '#475569'; badgeBg = '#f1f5f9'; borderLeftColor = '#94a3b8'; }
                    else if(item.TrangThai === 'HoanThanh') { badgeColor = '#1d4ed8'; badgeBg = '#dbeafe'; borderLeftColor = '#3b82f6'; }

                    let approvalInfoHtml = '';
                    if (item.TrangThai === 'DaDuyet' && item.NgayDuyet) {
                        const d = new Date(item.NgayDuyet);
                        const dExp = new Date(d);
                        dExp.setDate(d.getDate() + 3);
                        const pad = n => n < 10 ? '0' + n : n;
                        const fApprove = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                        const fExp = `${dExp.getFullYear()}-${pad(dExp.getMonth() + 1)}-${pad(dExp.getDate())}`;

                        approvalInfoHtml = `
                            <div style="margin-top: 10px; padding: 8px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; font-size: 0.86rem; color: #047857; display: inline-flex; flex-wrap: wrap; gap: 16px;">
                                <span><i class="fa-solid fa-calendar-check"></i> Ngày duyệt: <strong>${fApprove}</strong></span>
                                <span style="color: #b91c1c;"><i class="fa-solid fa-hourglass-half"></i> Hạn đặt sân: <strong>${fExp}</strong></span>
                            </div>
                        `;
                    } else if (item.TrangThai === 'TuChoi' && item.LyDoHuy) {
                        approvalInfoHtml = `
                            <div style="margin-top: 10px; padding: 9px 14px; font-size: 0.86rem; color: #b91c1c; background: #fef2f2; border-radius: 8px; border: 1px dashed #fca5a5;">
                                <i class="fa-solid fa-circle-exclamation"></i> Lý do từ chối: <strong>${item.LyDoHuy}</strong>
                            </div>
                        `;
                    }

                    html += `
                        <div class="request-item-card" style="border-left: 4px solid ${borderLeftColor};">
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                    <h4 style="margin: 0; color: var(--text-dark); font-size: 1.12rem; font-weight: 800;">${item.TenGiaiDau}</h4>
                                    <span style="font-size: 0.78rem; color: #64748b; background: #f8fafc; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 6px;">Ngày nộp: ${item.NgayTao ? item.NgayTao.substring(0,10) : 'N/A'}</span>
                                </div>
                                <div style="display: flex; flex-wrap: wrap; gap: 18px; font-size: 0.9rem; color: var(--text-muted);">
                                    <span><i class="fa-solid fa-location-dot" style="color: var(--primary);"></i> Cụm sân: <strong style="color:var(--text-dark);">${item.cum_san ? item.cum_san.TenCumSan : 'Không xác định'}</strong></span>
                                    <span><i class="fa-regular fa-calendar" style="color: #3b82f6;"></i> Lịch giải: <strong style="color: var(--text-dark);">${item.NgayBatDau}</strong> đến <strong style="color: var(--text-dark);">${item.NgayKetThuc}</strong></span>
                                </div>
                                ${approvalInfoHtml}
                            </div>
                            <div>
                                <span style="padding: 6px 14px; border-radius: 999px; font-size: 0.82rem; font-weight: 700; background: ${badgeBg}; color: ${badgeColor}; white-space: nowrap; display: inline-block;">${viStatus}</span>
                            </div>
                        </div>
                    `;
                });
                html += `</div>`;
                container.innerHTML = html;
            }
        } catch (e) {
            container.innerHTML = `<div style="padding: 40px; color: var(--text-muted);">API chưa kết nối. Giao diện danh sách giải đấu đã sẵn sàng.</div>`;
        }
    } else if (activeTab === 'huy_san') {
        try {
            const response = await fetch(`${API_BASE_URL}/yeu-cau-huy-gap/cua-toi`);
            const res = await response.json();
            const list = res.data || [];

            if (list.length === 0) {
                container.innerHTML = `<div style="padding: 50px 20px;"><i class="fa-regular fa-calendar-xmark" style="font-size: 3.2rem; color: #cbd5e1; margin-bottom: 14px;"></i><p style="color: var(--text-muted); font-size: 1rem; font-weight: 500;">Bạn chưa có yêu cầu hủy sân gấp nào.</p></div>`;
            } else {
                let html = `<div style="display: flex; flex-direction: column; gap: 14px; max-height: 520px; overflow-y: auto; padding-right: 6px; text-align: left;">`;
                list.forEach(item => {
                    let badgeColor = '#b45309', badgeBg = '#fef3c7', borderLeftColor = '#f59e0b', statusText = 'Chờ duyệt';
                    if(item.TrangThai === 'DaDuyet') { badgeColor = '#047857'; badgeBg = '#d1fae5'; borderLeftColor = '#10b981'; statusText = 'Đã duyệt'; }
                    if(item.TrangThai === 'TuChoi') { badgeColor = '#b91c1c'; badgeBg = '#fee2e2'; borderLeftColor = '#ef4444'; statusText = 'Từ chối'; }

                    const sanBong = item.dat_san && item.dat_san.san_bong ? item.dat_san.san_bong.TenSan : 'Sân không xác định';
                    const cumSan = item.dat_san && item.dat_san.san_bong && item.dat_san.san_bong.cum_san ? item.dat_san.san_bong.cum_san.TenCumSan : '';
                    const khungGio = item.dat_san && item.dat_san.khung_gio ? `${item.dat_san.khung_gio.GioBatDau.substring(0,5)} - ${item.dat_san.khung_gio.GioKetThuc.substring(0,5)}` : '';
                    
                    let dateStr = '';
                    if (item.dat_san && item.dat_san.NgayDa) {
                        const parts = item.dat_san.NgayDa.split('-');
                        dateStr = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : item.dat_san.NgayDa;
                    }
                    
                    const isGiaiDau = item.dat_san && item.dat_san.ID_GiaiDau != null;
                    const loaiTag = isGiaiDau 
                        ? `<span style="font-size: 0.74rem; font-weight: 700; background: #e0e7ff; color: #4338ca; padding: 3px 9px; border-radius: 999px; margin-left: 8px;"><i class="fa-solid fa-trophy"></i> Giải đấu</span>` 
                        : `<span style="font-size: 0.74rem; font-weight: 700; background: #f1f5f9; color: #475569; padding: 3px 9px; border-radius: 999px; margin-left: 8px;">Phong trào</span>`;

                    let rejectReasonHtml = '';
                    if (item.TrangThai === 'TuChoi' && item.LyDoHuy) {
                        rejectReasonHtml = `
                            <div style="margin-top: 10px; padding: 9px 14px; font-size: 0.86rem; color: #b91c1c; background: #fef2f2; border-radius: 8px; border: 1px dashed #fca5a5;">
                                <i class="fa-solid fa-circle-exclamation"></i> Lý do từ chối: <strong>${item.LyDoHuy}</strong>
                            </div>
                        `;
                    }

                    html += `
                        <div class="request-item-card" style="border-left: 4px solid ${borderLeftColor};">
                            <div style="flex: 1;">
                                <h4 style="margin: 0 0 8px 0; color: var(--text-dark); font-size: 1.1rem; font-weight: 800; display: flex; align-items: center;">${sanBong} ${loaiTag}</h4>
                                <div style="display: flex; flex-wrap: wrap; gap: 16px; font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">
                                    <span><i class="fa-solid fa-location-dot" style="color: var(--primary);"></i> Cụm sân: <strong style="color: var(--text-dark);">${cumSan}</strong></span>
                                    <span><i class="fa-regular fa-clock" style="color: var(--primary);"></i> Ca đá: <strong style="color: var(--primary);">${khungGio}</strong> (${dateStr})</span>
                                </div>
                                <div style="background: #f8fafc; padding: 8px 12px; border-radius: 8px; border: 1px solid #f1f5f9; font-size: 0.88rem; color: #334155; margin-bottom: 6px;">
                                    <span style="color: #64748b;">Lý do xin hủy:</span> <span style="font-style: italic; font-weight: 500;">"${item.NoiDung}"</span>
                                </div>
                                <p style="margin: 0; font-size: 0.78rem; color: #94a3b8;"><i class="fa-regular fa-paper-plane"></i> Thời gian gửi: ${item.NgayTao ? item.NgayTao.substring(0, 16).replace('T', ' ') : ''}</p>
                                ${rejectReasonHtml}
                            </div>
                            <div>
                                <span style="padding: 6px 14px; border-radius: 999px; font-size: 0.82rem; font-weight: 700; background: ${badgeBg}; color: ${badgeColor}; white-space: nowrap; display: inline-block;">${statusText}</span>
                            </div>
                        </div>
                    `;
                });
                html += `</div>`;
                container.innerHTML = html;
            }
        } catch (e) { container.innerHTML = `<div style="padding: 40px; color: var(--danger);">Lỗi tải dữ liệu.</div>`; }
    }
}

// ======================================================
// MODULE: TẠO YÊU CẦU GIẢI ĐẤU
// ======================================================

// 1. Hàm hiển thị thông báo ngay trong Modal
function showTournamentAlert(message, isSuccess) {
    const alertBox = document.getElementById('tournament-alert');
    alertBox.textContent = message;
    alertBox.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alertBox.style.display = 'block';
}

// 2. Hàm mở Modal và gọi API lấy danh sách Cụm sân đổ vào Dropdown
async function openCreateTournamentModal() {
    // Reset form và ẩn thông báo
    document.getElementById('tournament-alert').style.display = 'none';
    document.getElementById('tour-name').value = '';
    document.getElementById('tour-start-date').value = '';
    document.getElementById('tour-end-date').value = '';
    document.getElementById('tour-desc').value = '';
    
    const clusterSelect = document.getElementById('tour-cluster');
    clusterSelect.innerHTML = '<option value="">Đang tải dữ liệu...</option>';
    
    document.getElementById('create-tournament-modal').style.display = 'flex';

    // Gọi API lấy cụm sân (Tái sử dụng API đã có)
    try {
        const response = await fetch(`${API_BASE_URL}/cum-san`);
        const res = await response.json();
        
        // Lọc các cụm sân chưa bị xóa
        const activeClusters = res.data.filter(c => c.deleted_at === null);
        
        if (activeClusters.length === 0) {
            clusterSelect.innerHTML = '<option value="">Không có cụm sân nào hoạt động</option>';
            return;
        }
        
        clusterSelect.innerHTML = '<option value="">-- Chọn cụm sân --</option>' + 
            activeClusters.map(c => `<option value="${c.ID}">${c.TenCumSan} - ${c.DiaChi}</option>`).join('');
    } catch (error) {
        clusterSelect.innerHTML = '<option value="">Lỗi kết nối máy chủ</option>';
    }
}

// 3. Hàm đóng Modal
function closeCreateTournamentModal() {
    document.getElementById('create-tournament-modal').style.display = 'none';
}

// 4. Hàm Gửi yêu cầu qua API (Xử lý bất đồng bộ)
async function submitTournamentRequest() {
    const btn = document.getElementById('btn-submit-tournament');
    const clusterId = document.getElementById('tour-cluster').value;
    const name = document.getElementById('tour-name').value.trim();
    const startDate = document.getElementById('tour-start-date').value;
    const endDate = document.getElementById('tour-end-date').value;
    const desc = document.getElementById('tour-desc').value.trim();

    // Xác thực dữ liệu đầu vào trực tiếp trên JS
    if (!clusterId) return showTournamentAlert('Vui lòng chọn cụm sân!', false);
    if (!name) return showTournamentAlert('Vui lòng nhập tên giải đấu!', false);
    if (!startDate || !endDate) return showTournamentAlert('Vui lòng chọn đầy đủ ngày bắt đầu và kết thúc!', false);
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (start < today) return showTournamentAlert('Ngày bắt đầu không được trong quá khứ!', false);
    if (end < start) return showTournamentAlert('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu!', false);

    // Chuyển UI sang trạng thái chờ
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';

    try {
        const response = await fetch(`${API_BASE_URL}/giai-dau/tao-yeu-cau`, {
            method: 'POST',
            headers: { 
                'Accept': 'application/json', 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                id_cum_san: clusterId,
                ten_giai_dau: name,
                ngay_bat_dau: startDate,
                ngay_ket_thuc: endDate,
                noi_dung: desc
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            let errorMsg = data.message || 'Có lỗi xảy ra!';
            if (data.errors) {
                errorMsg = Object.values(data.errors)[0][0];
            }
            showTournamentAlert(errorMsg, false);
            btn.disabled = false;
            btn.innerHTML = 'Gửi yêu cầu';
            return;
        }

        // Thành công: Hiển thị thông báo xanh
        showTournamentAlert(data.message || 'Gửi yêu cầu thành công! Vui lòng chờ Admin duyệt.', true);
        
        // Tự động đóng Modal sau 2 giây và vẽ lại danh sách yêu cầu
        setTimeout(() => {
            closeCreateTournamentModal();
            renderRequests('giai_dau'); // Load lại danh sách giải đấu vừa tạo
            btn.disabled = false;
            btn.innerHTML = 'Gửi yêu cầu';
        }, 2000);

    } catch (error) {
        showTournamentAlert('Không thể kết nối đến máy chủ!', false);
        btn.disabled = false;
        btn.innerHTML = 'Gửi yêu cầu';
    }
}

// ======================================================
// MODULE: XỬ LÝ BẬT/TẮT HỘP QUY ĐỊNH DẠNG POPOVER
// ======================================================
function toggleRuleDropdown(event) {
    event.stopPropagation(); // Ngăn sự kiện nổi bọt để tránh bị window click đóng ngay lập tức
    const box = document.getElementById('rule-dropdown-box');
    if (box) {
        box.style.display = (box.style.display === 'block') ? 'none' : 'block';
    }
}

// Bắt sự kiện click toàn màn hình để ẩn hộp quy định khi bấm ra ngoài
window.addEventListener('click', function(e) {
    const box = document.getElementById('rule-dropdown-box');
    if (box && box.style.display === 'block') {
        // Kiểm tra xem cú click có nằm bên trong hộp quy định hay không
        // Nếu click bên ngoài -> ẩn hộp đi
        if (!box.contains(e.target)) {
            box.style.display = 'none';
        }
    }
});

// ======================================================
// MODULE: QUẢN LÝ VÍ & VNPAY
// ======================================================

// 1. Render Giao diện Ví (Giữ nguyên 100% Thẻ Số dư khả dụng của bạn)
async function renderWallet(statusMessage = null, isSuccess = true) {
    updateActiveNav('renderWallet'); 
    currentClusterId = null;

    await syncUserWallet();

    const user = JSON.parse(sessionStorage.getItem('dn_football_user'));
    const balance = Number(user?.SoDuVi || 0).toLocaleString('vi-VN') + 'đ';

    let alertHtml = '';
    if (statusMessage) {
        const alertClass = isSuccess ? 'success' : 'error';
        alertHtml = `<div id="wallet-page-alert" class="modal-alert ${alertClass}" style="display: block; margin: 0 0 20px 0; font-weight: 600;">${statusMessage}</div>`;
    }

    appContent.innerHTML = `
        <div class="page-header" style="margin-bottom: 26px; padding: 22px 28px; border-radius: 18px; background: linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%); border: 1px solid #bbf7d0; border-left: 5px solid var(--primary); box-shadow: var(--shadow-sm);">
            <div style="font-size: 0.76rem; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px;">
                <i class="fa-solid fa-wallet"></i> Ví điện tử DN Football
            </div>
            <h1 class="page-title" style="margin-bottom: 4px;">Quản lý Tài chính</h1>
            <p class="page-subtitle">Ví điện tử cá nhân và sao kê chi tiết lịch sử biến động số dư</p>
        </div>

        ${alertHtml}

        <div style="display: grid; grid-template-columns: 380px 1fr; gap: 28px; align-items: start;">
            <!-- Cột trái: Giữ nguyên 100% Thẻ Số dư khả dụng -->
            <div style="display: flex; flex-direction: column; gap: 18px;">
                <div style="background: linear-gradient(135deg, var(--primary) 0%, #047857 100%); border-radius: 20px; padding: 30px; color: white; box-shadow: 0 15px 30px rgba(16, 185, 129, 0.25); position: relative; overflow: hidden;">
                    <!-- Decor vòng tròn -->
                    <div style="position: absolute; top: -30px; right: -30px; width: 150px; height: 150px; background: rgba(255,255,255,0.1); border-radius: 50%;"></div>
                    <div style="position: absolute; bottom: -20px; right: 50px; width: 80px; height: 80px; background: rgba(255,255,255,0.05); border-radius: 50%;"></div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; position: relative; z-index: 2;">
                        <div>
                            <h3 style="margin: 0; font-weight: 500; font-size: 1.05rem; opacity: 0.9;">Số dư khả dụng</h3>
                            <div id="main-wallet-balance" style="font-size: 2.8rem; font-weight: 700; margin: 10px 0 30px 0; letter-spacing: -1px;">${balance}</div>
                        </div>
                        <i class="fa-solid fa-wallet" style="font-size: 2rem; opacity: 0.8;"></i>
                    </div>
                    
                    <div style="display: flex; gap: 12px; position: relative; z-index: 2;">
                        <button onclick="openDepositModal()" style="flex: 1; padding: 12px; border-radius: 12px; border: none; background: white; color: var(--primary); font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                            <i class="fa-solid fa-plus-circle"></i> Nạp tiền
                        </button>
                        <button onclick="openWithdrawModal()" style="flex: 1; padding: 12px; border-radius: 12px; border: 1.5px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.1); color: white; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; backdrop-filter: blur(4px);">
                            <i class="fa-solid fa-money-bill-transfer"></i> Rút tiền
                        </button>
                    </div>
                </div>

                <!-- Khung tiện ích thông tin bổ trợ bên dưới thẻ Ví -->
                <div style="background: #ffffff; border: 1px solid var(--border); border-radius: 16px; padding: 18px 20px; box-shadow: var(--shadow-sm);">
                    <div style="font-size: 0.85rem; font-weight: 700; color: #0f172a; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-shield-check" style="color: var(--primary);"></i> Thông tin giao dịch an toàn
                    </div>
                    <div style="font-size: 0.83rem; color: #64748b; line-height: 1.6;">
                        <div style="margin-bottom: 6px;">&bull; <strong>Nạp tiền:</strong> Cộng số dư tức thì qua cổng VNPay (tối thiểu 10.000đ).</div>
                        <div>&bull; <strong>Hoàn cọc tự động:</strong> Tiền cọc hủy sân hợp lệ được cộng trả trực tiếp vào ví 100%.</div>
                    </div>
                </div>
            </div>

            <!-- Cột phải: Lịch sử giao dịch nâng cấp -->
            <div style="background: white; border-radius: 20px; padding: 24px 26px; box-shadow: var(--shadow-sm); border: 1px solid var(--border); display: flex; flex-direction: column;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; padding-bottom: 18px; margin-bottom: 18px; border-bottom: 1px solid #f1f5f9;">
                    <div>
                        <h3 style="margin: 0; font-size: 1.2rem; font-weight: 800; color: var(--text-dark); display: flex; align-items: center; gap: 10px;">
                            <span style="width: 34px; height: 34px; border-radius: 10px; background: #f0fdf4; color: var(--primary); display: inline-flex; align-items: center; justify-content: center; font-size: 0.95rem;">
                                <i class="fa-solid fa-clock-rotate-left"></i>
                            </span>
                            Lịch sử biến động số dư
                        </h3>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="date" id="tx-date-filter" class="form-control" style="width: auto; height: 38px; padding: 0 12px; font-size: 0.88rem; border-radius: 9px; background: #f8fafc; cursor: pointer;" onchange="loadTransactionHistory(this.value)">
                        <button type="button" class="btn-outline-sm" style="height: 38px; padding: 0 12px; border-radius: 9px;" onclick="document.getElementById('tx-date-filter').value=''; loadTransactionHistory('')" title="Xem tất cả ngày">
                            Tất cả
                        </button>
                    </div>
                </div>
                
                <div id="transaction-list" style="flex: 1;">
                    <div style="text-align:center; padding: 30px;"><i class="fa-solid fa-spinner fa-spin" style="color: var(--primary); font-size: 1.5rem;"></i></div>
                </div>
            </div>
        </div>
    `;

    loadTransactionHistory();

    if (statusMessage) {
        setTimeout(() => {
            const alertBox = document.getElementById('wallet-page-alert');
            if (alertBox) {
                alertBox.style.opacity = '0';
                setTimeout(() => alertBox.style.display = 'none', 500);
            }
        }, 2500);
    }
}

// 2. Load API Lịch sử giao dịch
async function loadTransactionHistory(filterDate = '') {
    const listContainer = document.getElementById('transaction-list');
    try {
        const response = await fetch(`${API_BASE_URL}/giao-dich/cua-toi`);
        const data = await response.json();
        
        if (!data.success) throw new Error('API Error');

        let transactions = data.data || [];

        transactions = transactions.map(tx => {
            let localDateStr = '';
            let filterMatchStr = '';
            
            if (tx.NgayTao) {
                const d = new Date(tx.NgayTao); 
                const pad = n => n < 10 ? '0' + n : n;
                localDateStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} - ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
                filterMatchStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
            }
            
            return { 
                ...tx, 
                displayDate: localDateStr, 
                filterDateStr: filterMatchStr 
            };
        });

        if (filterDate) {
            transactions = transactions.filter(tx => tx.filterDateStr === filterDate);
        }

        if (transactions.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 50px 20px; border: 1px dashed #e2e8f0; border-radius: 14px;">
                    <i class="fa-solid fa-receipt" style="font-size: 2.8rem; color: #cbd5e1; margin-bottom: 12px; display: block;"></i>
                    <div style="font-weight: 600; color: #475569;">Chưa có giao dịch nào${filterDate ? ' trong ngày này' : ''}</div>
                </div>`;
            return;
        }

        let html = '<div style="display: flex; flex-direction: column; gap: 10px; max-height: 430px; overflow-y: auto; padding-right: 6px; scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent;">';
        
        transactions.forEach(tx => {
            const isCong = tx.DongTien === 'Cong';
            const sign = isCong ? '+' : '-';
            const color = isCong ? '#047857' : '#dc2626';
            const amountBg = isCong ? '#ecfdf5' : '#fef2f2';
            const bgIcon = isCong ? '#d1fae5' : '#fee2e2';
            
            let icon = 'fa-money-bill-wave';
            if(tx.LoaiGiaoDich === 'NapTien') icon = 'fa-arrow-down';
            if(tx.LoaiGiaoDich === 'DatSan') icon = 'fa-calendar-check';
            if(tx.LoaiGiaoDich === 'RutTien') icon = 'fa-arrow-up';
            if(tx.LoaiGiaoDich === 'HoanTienHuyGap' || tx.LoaiGiaoDich === 'HoanTienHuySan') icon = 'fa-rotate-left';

            const soDuTruoc = Number(tx.SoDuTruoc || 0).toLocaleString('vi-VN');
            const soDuSau = Number(tx.SoDuSau || 0).toLocaleString('vi-VN');

            html += `
                <div class="tx-item-card">
                    <div style="display: flex; align-items: center; gap: 14px; max-width: 72%;">
                        <div style="width: 44px; height: 44px; flex-shrink: 0; border-radius: 12px; background: ${bgIcon}; color: ${color}; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">
                            <i class="fa-solid ${icon}"></i>
                        </div>
                        <div>
                            <div style="font-weight: 700; color: #0f172a; margin-bottom: 4px; font-size: 0.94rem; line-height: 1.35;">${tx.NoiDung || tx.LoaiGiaoDich}</div>
                            <div style="font-size: 0.8rem; color: #64748b; display: flex; align-items: center; flex-wrap: wrap; gap: 10px;">
                                <span><i class="fa-regular fa-clock" style="margin-right: 4px;"></i>${tx.displayDate}</span>
                                <span style="background: #f1f5f9; padding: 2px 8px; border-radius: 6px; font-size: 0.76rem;">
                                    Số dư: ${soDuTruoc}đ &rarr; <strong style="color: #0f172a;">${soDuSau}đ</strong>
                                </span>
                            </div>
                        </div>
                    </div>
                    <div style="font-weight: 800; font-size: 1.02rem; color: ${color}; background: ${amountBg}; padding: 6px 12px; border-radius: 8px; flex-shrink: 0;">
                        ${sign}${Number(tx.SoTien).toLocaleString('vi-VN')}đ
                    </div>
                </div>
            `;
        });
        html += '</div>';
        listContainer.innerHTML = html;

    } catch (e) {
        listContainer.innerHTML = `<div style="color: var(--danger); text-align: center; padding: 20px;">Lỗi tải dữ liệu giao dịch.</div>`;
    }
}

// Hàm hỗ trợ render thông báo tại thẻ ví mà không cần load lại trang
function showWalletAlert(message, isSuccess) {
    renderWallet(message, isSuccess);
}

// 3. Logic điều khiển Modal Nạp tiền bằng Custom Alert
function showDepositAlert(message, isSuccess) {
    const alertBox = document.getElementById('deposit-alert');
    alertBox.textContent = message;
    alertBox.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alertBox.style.display = 'block';

    setTimeout(() => {
        alertBox.style.display = 'none';
    }, 2500);
}

function openDepositModal() {
    document.getElementById('deposit-alert').style.display = 'none';
    document.getElementById('deposit-amount').value = '';
    document.getElementById('deposit-modal').style.display = 'flex';
}

function closeDepositModal() {
    document.getElementById('deposit-modal').style.display = 'none';
}

// 4. API Gửi yêu cầu lấy URL VNPay
async function processDeposit() {
    document.getElementById('deposit-alert').style.display = 'none';
    const amount = document.getElementById('deposit-amount').value;
    
    if (!amount || amount < 10000) {
        showDepositAlert('Vui lòng nhập số tiền hợp lệ (tối thiểu 10.000đ)', false);
        return;
    }

    const btn = document.querySelector('#deposit-modal .btn-primary');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kết nối VNPay...';

    try {
        const response = await fetch(`${API_BASE_URL}/vnpay/nap-tien`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ so_tien: amount })
        });
        
        const data = await response.json();
        if (data.success && data.url) {
            window.location.href = data.url; 
        } else {
            showDepositAlert('Lỗi: ' + (data.message || 'Hệ thống đang bận.'), false);
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    } catch (error) {
        showDepositAlert('Lỗi kết nối đến máy chủ. Vui lòng thử lại sau.', false);
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ======================================================
// MODULE: RÚT TIỀN TRỰC TIẾP TỪ VÍ
// ======================================================
function showWithdrawAlert(message, isSuccess) {
    const alertBox = document.getElementById('withdraw-alert');
    alertBox.textContent = message;
    alertBox.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alertBox.style.display = 'block';
    setTimeout(() => alertBox.style.display = 'none', 3000);
}

function openWithdrawModal() {
    const user = JSON.parse(sessionStorage.getItem('dn_football_user')) || {};
    document.getElementById('withdraw-alert').style.display = 'none';
    document.getElementById('withdraw-amount').value = '';
    document.getElementById('withdraw-bank').value = user.TenNganHang || '';
    document.getElementById('withdraw-stk').value = user.STKNganHang || '';
    document.getElementById('withdraw-owner').value = user.TenTaiKhoan || '';
    document.getElementById('withdraw-modal').style.display = 'flex';
}

function closeWithdrawModal() {
    document.getElementById('withdraw-modal').style.display = 'none';
}

async function submitWithdrawRequest() {
    const user = JSON.parse(sessionStorage.getItem('dn_football_user'));
    const amountInput = document.getElementById('withdraw-amount').value.trim();
    const amount = Number(amountInput);
    const bank = document.getElementById('withdraw-bank').value.trim();
    const stk = document.getElementById('withdraw-stk').value.trim();
    const owner = document.getElementById('withdraw-owner').value.trim();

    // Kiểm tra không được để trống bất kỳ trường nào
    if (!amountInput || !bank || !stk || !owner) {
        return showWithdrawAlert('Vui lòng điền đầy đủ Số tiền, Tên ngân hàng, Số tài khoản và Tên chủ tài khoản!', false);
    }
    if (isNaN(amount) || amount < 50000) {
        return showWithdrawAlert('Số tiền rút tối thiểu là 50,000đ!', false);
    }
    if (amount > Number(user.SoDuVi)) {
        return showWithdrawAlert('Số dư ví không đủ để thực hiện giao dịch!', false);
    }

    const btn = document.getElementById('btn-submit-withdraw');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';

    try {
        const response = await fetch(`${API_BASE_URL}/giao-dich/rut-tien`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                so_tien: amount,
                ngan_hang: bank,
                so_tai_khoan: stk,
                chu_tai_khoan: owner.toUpperCase()
            })
        });
        const data = await response.json();

        if (response.ok && data.success) {
            showWithdrawAlert(data.message || 'Rút tiền thành công!', true);

            // Đồng bộ lại số dư ví trên Header, Thẻ Ví và Lịch sử giao dịch ngay lập tức
            await syncUserWallet();
            loadNotifications();

            setTimeout(() => {
                closeWithdrawModal();
                btn.disabled = false;
                btn.innerHTML = 'Xác nhận rút tiền';
            }, 1500);
        } else {
            showWithdrawAlert(data.message || 'Lỗi hệ thống.', false);
            btn.disabled = false;
            btn.innerHTML = 'Xác nhận rút tiền';
        }
    } catch (e) {
        showWithdrawAlert('Lỗi kết nối máy chủ.', false);
        btn.disabled = false;
        btn.innerHTML = 'Xác nhận rút tiền';
    }
}

// ======================================================
// MODULE: THÔNG BÁO (NOTIFICATIONS)
// ======================================================

// 1. Tải danh sách thông báo từ API
async function loadNotifications() {
    try {
        const res = await fetch(`${API_BASE_URL}/thong-bao`);
        if (!res.ok) return;
        
        const data = await res.json();
        const list = data.data || [];
        
        const badge = document.getElementById('notif-badge');
        const listContainer = document.getElementById('notif-list');
        
        // Đếm số lượng chưa đọc
        const unreadCount = list.filter(item => item.DaDoc === 0).length;
        
        // Cập nhật huy hiệu (chuông đỏ)
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
        
        // Render danh sách
        if (list.length === 0) {
            listContainer.innerHTML = `<div style="padding: 40px 20px; text-align: center; color: var(--text-muted);"><i class="fa-regular fa-bell-slash" style="font-size: 2.5rem; color: #cbd5e1; margin-bottom: 10px; display: block;"></i>Bạn chưa có thông báo nào.</div>`;
            return;
        }
        
        let html = '';
        list.forEach(item => {
            const isUnread = item.DaDoc === 0;
            const bgClass = isUnread ? 'background-color: #f0fdf4;' : 'background-color: #ffffff;'; // Nền xanh nhạt nếu chưa đọc
            const textClass = isUnread ? 'color: var(--text-dark); font-weight: 600;' : 'color: var(--text-muted);';
            
            // Xử lý Icon theo LoaiThongBao
            let icon = 'fa-bell';
            let iconColor = '#64748b';
            let bgIcon = '#f1f5f9';
            
            if(item.LoaiThongBao === 'ViTien') { icon = 'fa-wallet'; iconColor = '#047857'; bgIcon = '#d1fae5'; }
            if(item.LoaiThongBao === 'DatSan') { icon = 'fa-calendar-check'; iconColor = '#b45309'; bgIcon = '#fef3c7'; }
            if(item.LoaiThongBao === 'GiaiDau') { icon = 'fa-trophy'; iconColor = '#4338ca'; bgIcon = '#e0e7ff'; }
            if(item.LoaiThongBao === 'HeThong') { icon = 'fa-circle-exclamation'; iconColor = '#b91c1c'; bgIcon = '#fee2e2'; }
            if(item.LoaiThongBao === 'ThoiTiet') { icon = 'fa-cloud-rain'; iconColor = '#0369a1'; bgIcon = '#e0f2fe'; }

            // Format ngày giờ an toàn
            const d = new Date(item.NgayTao);
            const pad = n => n < 10 ? '0' + n : n;
            const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())} - ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;

            html += `
                <div onclick="markAsRead('${item.ID}', this)" style="${bgClass} padding: 12px 16px; border-bottom: 1px solid #f1f5f9; display: flex; gap: 12px; transition: 0.2s;">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: ${bgIcon}; color: ${iconColor}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 1.1rem;">
                        <i class="fa-solid ${icon}"></i>
                    </div>
                    <div>
                        <div class="notif-title" style="${textClass} font-size: 0.95rem; margin-bottom: 4px; line-height: 1.3;">${item.TieuDe}</div>
                        <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 6px; line-height: 1.4;">${item.NoiDung}</div>
                        <div style="color: #94a3b8; font-size: 0.75rem;"><i class="fa-regular fa-clock"></i> ${timeStr}</div>
                    </div>
                </div>
            `;
        });
        listContainer.innerHTML = html;
        
    } catch (e) {
        console.error('Lỗi load thông báo:', e);
    }
}

// 2. API Cập nhật trạng thái "Đã đọc tất cả"
async function markAllAsRead() {
    try {
        await fetch(`${API_BASE_URL}/thong-bao/doc-tat-ca`, { 
            method: 'PUT'
        });
        
        // Ẩn huy hiệu chuông ngay lập tức trên UI để tạo cảm giác mượt mà
        document.getElementById('notif-badge').style.display = 'none';

        const titleEl = document.querySelectorAll('.notif-title');
            if (titleEl) {
                titleEl.forEach(el => {
                    el.style.color = 'var(--text-muted)';
                    el.style.fontWeight = 'normal';
                });
            }
        
        // Chuyển toàn bộ nền xanh thành trắng
        const notifItems = document.querySelectorAll('#notif-list > div');
        notifItems.forEach(el => {
            el.style.backgroundColor = '#ffffff';
        });
        
    } catch (e) {
        console.error('Lỗi cập nhật đã đọc', e);
    }
}

// 3. Xử lý logic Click mở/đóng Chuông
function toggleNotificationDropdown(e) {
    e.stopPropagation();
    const dropdown = document.getElementById('notif-dropdown');
    
    // Đóng menu User (avatar) nếu đang mở để tránh chồng chéo
    document.getElementById('user-dropdown').classList.remove('show');

    // Kiểm tra xem dropdown thông báo đang đóng hay mở
    const isOpening = dropdown.style.display === 'none' || dropdown.style.display === '';
    
    if (isOpening) {
        dropdown.style.display = 'block';
    } else {
        dropdown.style.display = 'none';
    }
}

// 4. Đổi trạng thái 1 thông báo sang đã đọc khi người dùng click vào nó
async function markAsRead(id, element) {
    try {
        const res = await fetch(`${API_BASE_URL}/thong-bao/${id}/doc`, {
            method: 'PUT'
        });
        
        if (res.ok) {
            // Đổi giao diện trực tiếp tại dòng vừa click (mất nền xanh, chuyển chữ sang màu nhạt)
            element.style.backgroundColor = '#ffffff';
            const titleEl = element.querySelector('.notif-title');
            if (titleEl) {
                titleEl.style.color = 'var(--text-muted)';
                titleEl.style.fontWeight = 'normal';
            }
            // Gọi lại loadNotifications để cập nhật lại số lượng badge đỏ trên Header
            loadNotifications();
        }
    } catch (e) {
        console.error('Lỗi cập nhật trạng thái thông báo:', e);
    }
}

// ======================================================
// MODULE: TẠO YÊU CẦU HỦY GẤP
// ======================================================
function showUrgentCancelAlert(message, isSuccess) {
    const alertBox = document.getElementById('urgent-cancel-alert');
    alertBox.textContent = message;
    alertBox.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alertBox.style.display = 'block';
}

async function openUrgentCancelModal() {
    document.getElementById('urgent-cancel-alert').style.display = 'none';
    document.getElementById('uc-reason').value = '';
    
    const selectBox = document.getElementById('uc-booking-id');
    selectBox.innerHTML = '<option value="">Đang tải danh sách lịch đặt...</option>';
    
    document.getElementById('urgent-cancel-modal').style.display = 'flex';

    try {
        // ĐÃ SỬA: Gọi song song 2 API để lấy Lịch Đặt Sân và Yêu Cầu Hủy Gấp
        const [dsRes, ygRes] = await Promise.all([
            fetch(`${API_BASE_URL}/dat-san/cua-toi`),
            fetch(`${API_BASE_URL}/yeu-cau-huy-gap/cua-toi`)
        ]);
        
        const dsData = await dsRes.json();
        const ygData = await ygRes.json();
        
        if (dsData.success) {
            const listDatSan = dsData.data || [];
            const listYeuCau = ygData.success ? (ygData.data || []) : [];

            // =========================================================
            // LỌC DỮ LIỆU BƯỚC 1: TÌM CÁC ID ĐANG CHỜ DUYỆT ĐỂ BỎ QUA
            // =========================================================
            const pendingDatSanIds = new Set();
            const pendingGiaiDauIds = new Set();

            listYeuCau.forEach(yc => {
                if (yc.TrangThai === 'ChoDuyet') {
                    pendingDatSanIds.add(yc.ID_DatSan);
                    // Nếu sân hủy thuộc giải đấu, ghi nhận luôn ID Giải Đấu đó
                    if (yc.dat_san && yc.dat_san.ID_GiaiDau) {
                        pendingGiaiDauIds.add(yc.dat_san.ID_GiaiDau);
                    }
                }
            });

            // Lọc ra những sân đang "Đã Cọc" VÀ KHÔNG nằm trong danh sách đang chờ hủy
            const activeBookings = listDatSan.filter(item => {
                if (item.TrangThai !== 'DaCoc') return false;
                if (pendingDatSanIds.has(item.ID)) return false;
                if (item.ID_GiaiDau && pendingGiaiDauIds.has(item.ID_GiaiDau)) return false;
                return true;
            });

            if (activeBookings.length === 0) {
                selectBox.innerHTML = '<option value="">Bạn không có sân nào đang đặt (Đã cọc) để hủy</option>';
                return;
            }

            const now = new Date();

            // =========================================================
            // LỌC DỮ LIỆU BƯỚC 2: KIỂM TRA ĐIỀU KIỆN QUÁ HẠN HỦY BÌNH THƯỜNG
            // VÀ LOẠI BỎ CÁC TRẬN TRÙNG CỦA CÙNG 1 GIẢI ĐẤU
            // =========================================================
            const processedTournaments = new Set();
            const filteredBookings = [];

            // Sắp xếp tăng dần theo Ngày Đá để ưu tiên lấy trận khai mạc làm đại diện cho giải đấu
            activeBookings.sort((a, b) => new Date(a.NgayDa) - new Date(b.NgayDa));

            activeBookings.forEach(item => {
                const gioBatDau = item.khung_gio ? item.khung_gio.GioBatDau : '00:00:00';
                const matchTime = new Date(`${item.NgayDa}T${gioBatDau}`);
                
                const timeDiff = matchTime.getTime() - now.getTime();
                const hoursDiff = timeDiff / (1000 * 3600); 

                if (item.ID_GiaiDau) {
                    if (hoursDiff <= 168) {
                        if (!processedTournaments.has(item.ID_GiaiDau)) {
                            processedTournaments.add(item.ID_GiaiDau); 
                            filteredBookings.push(item); 
                        }
                    } else {
                        processedTournaments.add(item.ID_GiaiDau);
                    }
                } else {
                    if (hoursDiff <= 10) {
                        filteredBookings.push(item);
                    }
                }
            });

            if (filteredBookings.length === 0) {
                selectBox.innerHTML = '<option value="">Không có sân nào vi phạm thời hạn (Bạn có thể tự hủy miễn phí bên Lịch sử đặt sân)</option>';
                return;
            }

            // =========================================================
            // RENDER DỮ LIỆU VÀO DROPDOWN
            // =========================================================
            let html = '<option value="" title="-- Chọn lịch đặt --">-- Chọn lịch đặt --</option>';
            filteredBookings.forEach(item => {
                const cumSan = (item.san_bong && item.san_bong.cum_san) ? item.san_bong.cum_san.TenCumSan : 'Cụm sân chưa xác định';
                const sanBong = item.san_bong ? item.san_bong.TenSan : 'Sân';
                const khungGio = item.khung_gio ? `${item.khung_gio.GioBatDau.substring(0,5)}-${item.khung_gio.GioKetThuc.substring(0,5)}` : '';
                
                const parts = item.NgayDa.split('-');
                const dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
                
                if (item.ID_GiaiDau) {
                    const tenGiai = item.giai_dau ? item.giai_dau.TenGiaiDau : 'Không xác định';
                    // Khai báo biến textStr để tái sử dụng
                    const textStr = `[Giải đấu: ${tenGiai}] ${cumSan} - ${sanBong} | Khai mạc: ${dateStr}`;
                    // Thêm thuộc tính title để hiện Tooltip khi hover chuột
                    html += `<option value="${item.ID}" title="${textStr}">${textStr}</option>`;
                } else {
                    // Gom Ngày và Giờ lại cho ngắn gọn hơn
                    const textStr = `[Phong trào] ${cumSan} - ${sanBong} | ${khungGio} (${dateStr})`;
                    html += `<option value="${item.ID}" title="${textStr}">${textStr}</option>`;
                }
            });

            selectBox.innerHTML = html;
        }
    } catch (error) {
        selectBox.innerHTML = '<option value="">Lỗi kết nối máy chủ</option>';
    }
}

function closeUrgentCancelModal() {
    document.getElementById('urgent-cancel-modal').style.display = 'none';
}

async function submitUrgentCancelRequest() {
    const btn = document.getElementById('btn-submit-urgent-cancel');
    const datSanId = document.getElementById('uc-booking-id').value;
    const reason = document.getElementById('uc-reason').value.trim();

    if (!datSanId) return showUrgentCancelAlert('Vui lòng chọn lịch đặt muốn hủy!', false);
    if (!reason) return showUrgentCancelAlert('Vui lòng nhập lý do hủy gấp!', false);

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';

    try {
        const response = await fetch(`${API_BASE_URL}/yeu-cau-huy-gap`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id_dat_san: datSanId,
                noi_dung: reason
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            showUrgentCancelAlert(data.message || 'Có lỗi xảy ra!', false);
            btn.disabled = false;
            btn.innerHTML = 'Gửi yêu cầu';
            return;
        }

        // Hiện thông báo Custom xanh lá
        showUrgentCancelAlert('Gửi yêu cầu thành công! Vui lòng chờ Admin duyệt.', true);
        
        setTimeout(() => {
            closeUrgentCancelModal();
            renderRequests('huy_san'); 
            btn.disabled = false;
            btn.innerHTML = 'Gửi yêu cầu';
        }, 2000);

    } catch (error) {
        showUrgentCancelAlert('Không thể kết nối đến máy chủ!', false);
        btn.disabled = false;
        btn.innerHTML = 'Gửi yêu cầu';
    }
}

// ======================================================
// MODULE: VÉ ĐIỆN TỬ (E-TICKET) & XUẤT ẢNH
// ======================================================

function closeTicketModal() {
    document.getElementById('ticket-modal').style.display = 'none';
}

function openTicketModal(type, id) {
    const container = document.getElementById('ticket-container');
    let ticketHtml = '';
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));

    const formatDate = (dateString) => {
        const d = new Date(dateString);
        return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
    };

    if (type === 'phong_trao') {
        const item = allMyBookingsData.find(b => b.ID === id);
        if(!item) return;

        const tenSan = item.san_bong ? item.san_bong.TenSan : 'N/A';
        const cumSan = item.san_bong && item.san_bong.cum_san ? item.san_bong.cum_san.TenCumSan : 'N/A';
        const gioDa = item.khung_gio ? `${item.khung_gio.GioBatDau.substring(0,5)} - ${item.khung_gio.GioKetThuc.substring(0,5)}` : 'N/A';
        const tongTien = Number(item.TongTien);
        const tienCoc = Number(item.TienCoc);
        const conLai = tongTien - tienCoc;
        const maVe = `PT-${item.ID}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=4&data=${encodeURIComponent(maVe)}`;

        ticketHtml = `
            <!-- Header vé nhỏ gọn -->
            <div style="background: linear-gradient(135deg, var(--primary) 0%, #047857 100%); color: white; padding: 14px 18px; text-align: center;">
                <div style="font-size: 0.72rem; letter-spacing: 2px; opacity: 0.85; margin-bottom: 2px;">DN FOOTBALL</div>
                <h2 style="margin: 0; font-size: 1.3rem; font-weight: 800;">VÉ ĐẶT SÂN</h2>
                <div style="margin-top: 6px; background: rgba(255,255,255,0.2); display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 0.78rem; font-weight: bold;">MÃ VÉ: #${maVe}</div>
            </div>
            
            <!-- Thân vé -->
            <div style="padding: 16px 18px; background: #fff; position: relative;">
                <!-- Khách hàng -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #f1f5f9;">
                    <span style="color: var(--text-muted); font-size: 0.8rem;">Khách hàng:</span>
                    <strong style="font-size: 0.92rem; color: var(--text-dark);">${currentUser.HoTen} - ${currentUser.SoDienThoai}</strong>
                </div>

                <!-- Bố cục 2 cột: Thông tin sân (Trái) + Mã QR (Phải) -->
                <div style="display: flex; gap: 12px; align-items: center; background: #f8fafc; border-radius: 12px; padding: 12px; border: 1px solid var(--border); margin-bottom: 14px;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="color: var(--primary); font-weight: 800; font-size: 1.1rem; margin-bottom: 3px;">${tenSan}</div>
                        <div style="color: var(--text-muted); font-size: 0.82rem; margin-bottom: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><i class="fa-solid fa-location-dot"></i> ${cumSan}</div>
                        <div style="margin-bottom: 6px;">
                            <div style="color: var(--text-muted); font-size: 0.74rem;">Ngày đá</div>
                            <div style="font-weight: 700; font-size: 0.88rem; color: var(--text-dark);">${formatDate(item.NgayDa)}</div>
                        </div>
                        <div>
                            <div style="color: var(--text-muted); font-size: 0.74rem;">Khung giờ</div>
                            <div style="font-weight: 700; font-size: 0.88rem; color: var(--primary);">${gioDa}</div>
                        </div>
                    </div>

                    <div style="text-align: center; padding-left: 12px; border-left: 1px dashed #cbd5e1; flex-shrink: 0;">
                        <img src="${qrUrl}" crossorigin="anonymous" alt="QR ${maVe}" style="width: 100px; height: 100px; border-radius: 8px; border: 1px solid #e2e8f0; background: #fff; padding: 3px; display: block; margin: 0 auto;" />
                        <div style="font-size: 0.68rem; color: #475569; font-weight: 600; margin-top: 4px;">Quét mã Check-in</div>
                    </div>
                </div>

                <!-- Đường đứt nét chia vé -->
                <div style="border-top: 2px dashed #cbd5e1; margin: 0 -18px 12px -18px; position: relative;">
                    <div style="position: absolute; width: 18px; height: 18px; background: rgba(0,0,0,0.6); border-radius: 50%; top: -10px; left: -9px;"></div>
                    <div style="position: absolute; width: 18px; height: 18px; background: rgba(0,0,0,0.6); border-radius: 50%; top: -10px; right: -9px;"></div>
                </div>

                <!-- Tài chính -->
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 0.85rem;">
                    <span style="color: var(--text-muted);">Tổng tiền:</span>
                    <strong style="color: var(--text-dark);">${tongTien.toLocaleString('vi-VN')}đ</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 0.85rem;">
                    <span style="color: var(--text-muted);">Đã thanh toán (Cọc):</span>
                    <strong style="color: var(--text-dark);">${tienCoc.toLocaleString('vi-VN')}đ</strong>
                </div>
            </div>
        `;
    } 
    else if (type === 'giai_dau') {
        const matches = allMyBookingsData.filter(b => b.ID_GiaiDau === id && b.TrangThai === 'DaCoc');
        if(matches.length === 0) return;
        
        const firstMatch = matches[0];
        const tenGiai = firstMatch.giai_dau ? firstMatch.giai_dau.TenGiaiDau : 'N/A';
        const cumSan = firstMatch.san_bong && firstMatch.san_bong.cum_san ? firstMatch.san_bong.cum_san.TenCumSan : 'N/A';
        const tongTrận = matches.length;
        
        const tongTien = matches.reduce((sum, item) => sum + Number(item.TongTien), 0);
        const tienCoc = matches.reduce((sum, item) => sum + Number(item.TienCoc), 0);
        const conLai = tongTien - tienCoc;
        const maVe = `GD-${id}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=4&data=${encodeURIComponent(maVe)}`;

        ticketHtml = `
            <div style="background: linear-gradient(135deg, #4338ca 0%, #312e81 100%); color: white; padding: 14px 18px; text-align: center;">
                <div style="font-size: 0.72rem; letter-spacing: 2px; opacity: 0.85; margin-bottom: 2px;">DN FOOTBALL</div>
                <h2 style="margin: 0; font-size: 1.25rem; font-weight: 800;">THẺ TỔNG GIẢI ĐẤU</h2>
                <div style="margin-top: 6px; background: rgba(255,255,255,0.2); display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 0.78rem; font-weight: bold;">MÃ GIẢI: #${maVe}</div>
            </div>
            
            <div style="padding: 16px 18px; background: #fff; position: relative;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #f1f5f9;">
                    <span style="color: var(--text-muted); font-size: 0.8rem;">Đại diện:</span>
                    <strong style="font-size: 0.92rem; color: var(--text-dark);">${currentUser.HoTen} - ${currentUser.SoDienThoai}</strong>
                </div>

                <!-- Bố cục 2 cột: Thông tin giải (Trái) + Mã QR (Phải) -->
                <div style="display: flex; gap: 12px; align-items: center; background: #eef2ff; border-radius: 12px; padding: 12px; border: 1px solid #c7d2fe; margin-bottom: 14px;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="color: #4338ca; font-weight: 800; font-size: 1.02rem; margin-bottom: 3px;"><i class="fa-solid fa-trophy"></i> ${tenGiai}</div>
                        <div style="color: var(--text-muted); font-size: 0.82rem; margin-bottom: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><i class="fa-solid fa-location-dot"></i> ${cumSan}</div>
                        <div style="margin-bottom: 6px;">
                            <div style="color: var(--text-muted); font-size: 0.74rem;">Thời gian</div>
                            <div style="font-weight: 700; font-size: 0.82rem; color: var(--text-dark);">${formatDate(firstMatch.giai_dau.NgayBatDau)} - ${formatDate(firstMatch.giai_dau.NgayKetThuc)}</div>
                        </div>
                        <div>
                            <div style="color: var(--text-muted); font-size: 0.74rem;">Quy mô</div>
                            <div style="font-weight: 700; font-size: 0.86rem; color: #4338ca;">${tongTrận} trận đấu</div>
                        </div>
                    </div>

                    <div style="text-align: center; padding-left: 12px; border-left: 1px dashed #a5b4fc; flex-shrink: 0;">
                        <img src="${qrUrl}" crossorigin="anonymous" alt="QR ${maVe}" style="width: 100px; height: 100px; border-radius: 8px; border: 1px solid #c7d2fe; background: #fff; padding: 3px; display: block; margin: 0 auto;" />
                        <div style="font-size: 0.68rem; color: #4338ca; font-weight: 600; margin-top: 4px;">Quét tra cứu giải</div>
                    </div>
                </div>

                <div style="border-top: 2px dashed #cbd5e1; margin: 0 -18px 12px -18px; position: relative;">
                    <div style="position: absolute; width: 18px; height: 18px; background: rgba(0,0,0,0.6); border-radius: 50%; top: -10px; left: -9px;"></div>
                    <div style="position: absolute; width: 18px; height: 18px; background: rgba(0,0,0,0.6); border-radius: 50%; top: -10px; right: -9px;"></div>
                </div>

                <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 0.85rem;">
                    <span style="color: var(--text-muted);">Tổng tiền hợp đồng:</span>
                    <strong style="color: var(--text-dark);">${tongTien.toLocaleString('vi-VN')}đ</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 0.85rem;">
                    <span style="color: var(--text-muted);">Đã thanh toán (Cọc 50%):</span>
                    <strong style="color: var(--text-dark);">${tienCoc.toLocaleString('vi-VN')}đ</strong>
                </div>
            </div>
        `;
    }

    container.innerHTML = ticketHtml;
    document.getElementById('ticket-modal').style.display = 'flex';
}

function downloadTicket() {
    const ticketElement = document.getElementById('ticket-container');
    const btnDownload = document.getElementById('btn-download-ticket');
    
    btnDownload.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    btnDownload.disabled = true;

    html2canvas(ticketElement, { 
        scale: 2,
        useCORS: true, // Cho phép chụp cả ảnh mã QR từ server ngoài
        allowTaint: false,
        backgroundColor: null
    }).then(canvas => {
        const imageURI = canvas.toDataURL("image/png");

        const now = new Date();
        const pad = n => n < 10 ? '0' + n : n;
        const timeString = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        
        const a = document.createElement("a");
        a.href = imageURI;
        a.download = `Ve_DNFootball_${timeString}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        btnDownload.innerHTML = '<i class="fa-solid fa-download"></i> Tải ảnh vé';
        btnDownload.disabled = false;
    });
}

window.addEventListener('click', function(event) {
    const ticketModal = document.getElementById('ticket-modal');
    
    // Nếu màn hình vé đang mở VÀ vị trí click chuột nằm chính xác trên lớp nền mờ (overlay)
    if (ticketModal && ticketModal.style.display === 'flex') {
        if (event.target === ticketModal) {
            closeTicketModal();
        }
    }
});

// ======================================================
// HIỂN THỊ NÚT LIÊN HỆ ZALO / HOTLINE
// ======================================================
function setupFloatingContacts() {
    // Không chèn lại nếu đã có trên màn hình
    if (document.getElementById('floating-contacts')) return;

    // 1. Tạo thẻ Style chứa CSS hiệu ứng sóng tỏa ra (Pulse)
    const style = document.createElement('style');
    style.innerHTML = `
        .floating-contact-wrapper { position: fixed; bottom: 30px; left: 30px; display: flex; flex-direction: column; gap: 15px; z-index: 9998; }
        .btn-contact-float { width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 1.25rem; text-decoration: none; box-shadow: 0 4px 10px rgba(0,0,0,0.25); position: relative; transition: all 0.3s ease; }
        .btn-contact-float:hover { transform: scale(1.1); color: white; }
        .btn-zalo { background-color: #0068FF; font-family: Arial, sans-serif; font-weight: bold; font-size: 1.05rem; letter-spacing: 0.5px; }
        
        /* Hiệu ứng sóng */
        .pulse-ring { position: absolute; width: 100%; height: 100%; border-radius: 50%; animation: pulse-animation 1.5s infinite; z-index: -1; }
        .btn-zalo .pulse-ring { background-color: rgba(0, 104, 255, 0.4); }
        
        @keyframes pulse-animation { 
            0% { transform: scale(1); opacity: 1; } 
            100% { transform: scale(1.6); opacity: 0; } 
        }

        /* Giữ nguyên nền xanh và chữ trắng khi hover vào ô ĐÃ CHỌN */
        .schedule-table .slot.selected,
        .schedule-table .slot.available.selected,
        .schedule-table .slot.selected:hover,
        .schedule-table .slot.available.selected:hover {
            background-color: var(--primary) !important;
            color: #ffffff !important;
            border-color: var(--primary) !important;
        }
    `;
    document.head.appendChild(style);

    // 2. Tạo cụm nút HTML
    const contactDiv = document.createElement('div');
    contactDiv.id = 'floating-contacts';
    contactDiv.className = 'floating-contact-wrapper';
    
    // Lưu ý: Đổi số điện thoại trong href thành số thật của Admin
    contactDiv.innerHTML = `
        <a href="https://zalo.me/0899244124" target="_blank" class="btn-contact-float btn-zalo" style="margin-bottom: 50px;" title="Nhắn tin Zalo cho Admin">
            <div class="pulse-ring"></div>
            Zalo
        </a>
    `;
    document.body.appendChild(contactDiv);
}

// ======================================================
// MODULE: TRỢ LÝ ẢO AI CHATBOT (GEMINI)
// ======================================================
let isChatOpen = false;

// 1. Mở / Đóng cửa sổ Chat
function toggleChatWindow() {
    const container = document.getElementById('chatbot-container');
    isChatOpen = !isChatOpen;
    
    if (isChatOpen) {
        container.style.display = 'flex';
        loadChatSessions(); // Tải danh sách phiên chat bên cột trái
        
        // Nếu mới mở lên mà chưa có phiên nào đang active, thì tạo phiên mới màn hình sạch
        if (!document.getElementById('current-active-chat-id').value) {
            createNewChatSession();
        }
    } else {
        container.style.display = 'none';
    }
}

document.addEventListener('pointerdown', function (event) {

    const chatbotContainer = document.getElementById('chatbot-container');
    const openChatbotButton = document.getElementById('btn-open-chatbot');

    const renameModal = document.getElementById('rename-chat-modal');
    const deleteModal = document.getElementById('delete-chat-modal');

    // Chatbot chưa mở
    if (!isChatOpen || !chatbotContainer) return;

    // ==================================================
    // 1. ĐANG CLICK TRONG MODAL ĐỔI TÊN
    //    → KHÔNG ĐÓNG CHATBOT
    // ==================================================
    if (renameModal && renameModal.style.display !== 'none' && renameModal.contains(event.target)) {
        return;
    }

    // ==================================================
    // 2. ĐANG CLICK TRONG MODAL XÓA
    //    → KHÔNG ĐÓNG CHATBOT
    // ==================================================
    if (deleteModal && deleteModal.style.display !== 'none' && deleteModal.contains(event.target)) {
        return;
    }

    // ==================================================
    // 3. CLICK BÊN TRONG CHATBOT
    //    → KHÔNG ĐÓNG
    // ==================================================
    if (chatbotContainer.contains(event.target)) {
        return;
    }

    // ==================================================
    // 4. CLICK NÚT MỞ CHATBOT
    //    → ĐỂ toggleChatWindow() TỰ XỬ LÝ
    // ==================================================
    if (openChatbotButton && openChatbotButton.contains(event.target)) {
        return;
    }

    // ==================================================
    // 5. CÒN LẠI → CLICK RA NGOÀI
    //    → ĐÓNG CHATBOT
    // ==================================================
    chatbotContainer.style.display = 'none';
    isChatOpen = false;

}, true);

// 2. Tải danh sách các Phiên Chat (Sidebar)
async function loadChatSessions() {
    const sidebarList = document.getElementById('chat-sidebar-list');
    try {
        const response = await fetch(`${API_BASE_URL}/chatbot/phien-chat`);
        const res = await response.json();

        if (res.success && res.data.length > 0) {
            let html = '';
            res.data.forEach(phien => {
                const activeId = document.getElementById('current-active-chat-id').value;
                const isActive = (String(phien.ID) === String(activeId)) ? 'background: #e2e8f0; border-left: 4px solid var(--primary);' : 'background: transparent; border-left: 4px solid transparent;';
                
                // Tiêu đề: Lấy 30 ký tự đầu tiên
                let tieuDe = phien.TieuDe ? phien.TieuDe : 'Cuộc trò chuyện mới';
                if (tieuDe.length > 30) tieuDe = tieuDe.substring(0, 30) + '...';

                html += `
                    <div style="padding: 12px; margin-bottom: 8px; border-radius: 8px; cursor: pointer; transition: 0.2s; position: relative; ${isActive}" onclick="loadChatDetails('${phien.ID}')">
                        <div style="font-weight: 600; font-size: 0.95rem; color: var(--text-dark); margin-bottom: 4px; padding-right: 20px;">${tieuDe}</div>
                        
                        <!-- Nút 3 chấm (Dropdown thao tác) -->
                        <div class="chat-action-menu" style="position: absolute; right: 10px; top: 12px;" onclick="event.stopPropagation()">
                            <i class="fa-solid fa-ellipsis-vertical" style="color: var(--text-muted); padding: 4px 8px; cursor: pointer;" onclick="toggleChatDropdown('${phien.ID}')"></i>
                            <div id="chat-dropdown-${phien.ID}" style="display: none; position: absolute; right: 0; top: 25px; background: white; border: 1px solid var(--border); box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-radius: 8px; width: 120px; z-index: 10;">
                                <div style="padding: 8px 12px; font-size: 0.85rem; cursor: pointer; border-bottom: 1px solid #f1f5f9; color: var(--text-dark);" onclick="openRenameChatModal('${phien.ID}', '${tieuDe.replace(/'/g, "\\'")}')"><i class="fa-solid fa-pen" style="margin-right: 6px;"></i> Đổi tên</div>
                                <div style="padding: 8px 12px; font-size: 0.85rem; cursor: pointer; color: #ef4444;" onclick="openDeleteChatModal('${phien.ID}')"><i class="fa-solid fa-trash-can" style="margin-right: 6px;"></i> Xóa</div>
                            </div>
                        </div>
                    </div>
                `;
            });
            sidebarList.innerHTML = html;
        } else {
            sidebarList.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.9rem; margin-top: 20px;">Chưa có lịch sử chat</div>`;
        }
    } catch (e) {
        sidebarList.innerHTML = `<div style="text-align: center; color: red; font-size: 0.9rem; margin-top: 20px;">Lỗi kết nối</div>`;
    }
}

// Hàm tắt/bật menu 3 chấm
function toggleChatDropdown(id) {
    const allDropdowns = document.querySelectorAll('[id^="chat-dropdown-"]');
    allDropdowns.forEach(d => {
        if (d.id !== `chat-dropdown-${id}`) d.style.display = 'none';
    });
    const dropdown = document.getElementById(`chat-dropdown-${id}`);
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}

// Click ra ngoài tự đóng menu 3 chấm
window.addEventListener('click', () => {
    document.querySelectorAll('[id^="chat-dropdown-"]').forEach(d => d.style.display = 'none');
});

// 3. Tạo màn hình chat mới tinh
function createNewChatSession() {
    document.getElementById('current-active-chat-id').value = '';
    document.getElementById('chat-header-title').innerText = 'Cuộc trò chuyện mới';
    
    const msgArea = document.getElementById('chat-messages-area');
    msgArea.innerHTML = `
        <div class="chat-msg bot" style="align-self: flex-start; max-width: 80%;">
            <div style="background: white; padding: 12px 16px; border-radius: 0 12px 12px 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); color: var(--text-dark); line-height: 1.5;">
                Chào bạn! Mình là Trợ lý ảo của DN FOOTBALL. Mình có thể giúp gì cho bạn hôm nay?
            </div>
        </div>
    `;
    // Xóa màu active bên sidebar
    loadChatSessions(); 
}

// 4. Tải chi tiết nội dung 1 Phiên Chat
async function loadChatDetails(id) {
    document.getElementById('current-active-chat-id').value = id;
    const msgArea = document.getElementById('chat-messages-area');
    msgArea.innerHTML = `<div style="text-align:center; padding:20px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải tin nhắn...</div>`;
    
    // Cập nhật lại màu active sidebar
    loadChatSessions();

    try {
        const response = await fetch(`${API_BASE_URL}/chatbot/phien-chat/${id}`);
        const res = await response.json();

        if (res.success) {
            document.getElementById('chat-header-title').innerText = res.phien_chat.TieuDe || 'Cuộc trò chuyện';
            msgArea.innerHTML = ''; // Clear loading
            
            res.data.forEach(msg => {
                appendMessageToUI(msg.NguoiGui, msg.NoiDung);
            });
            scrollToBottomChat();
        }
    } catch (e) {
        msgArea.innerHTML = `<div style="text-align:center; color: red;">Lỗi kết nối máy chủ!</div>`;
    }
}

// 5. Gửi tin nhắn lên AI
async function sendChatMessage() {
    const inputEl = document.getElementById('chat-input-text');
    const text = inputEl.value.trim();
    if (!text) return;

    const activeChatId = document.getElementById('current-active-chat-id').value;
    const btnSend = document.getElementById('btn-send-chat');

    // 1. Cập nhật UI ngay lập tức
    inputEl.value = '';
    inputEl.disabled = true;
    btnSend.disabled = true;
    
    // Vẽ tin nhắn của User
    appendMessageToUI('User', text);
    scrollToBottomChat();

    // Vẽ hiệu ứng "Bot đang gõ..."
    const loadingId = 'typing-' + Date.now();
    const msgArea = document.getElementById('chat-messages-area');
    msgArea.innerHTML += `
        <div id="${loadingId}" class="chat-msg bot" style="align-self: flex-start; max-width: 80%;">
            <div style=" background: white; padding: 7px 10px; border-radius: 0 9px 9px 9px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); color: var(--text-muted); display: flex; align-items: center; gap: 3px;">
                <i class="fa-solid fa-circle fa-2xs fa-fade"></i>
                <i class="fa-solid fa-circle fa-2xs fa-fade" style="animation-delay: 0.2s;"></i>
                <i class="fa-solid fa-circle fa-2xs fa-fade" style="animation-delay: 0.4s;"></i>
            </div>
        </div>
    `;
    scrollToBottomChat();

    // 2. GỌI API BACKEND
    try {
        const payload = { 
            noi_dung: text,
            gio_hang: selectedSlots
        };
        if (activeChatId) payload.id_phien_chat = activeChatId;

        const response = await fetch(`${API_BASE_URL}/chatbot/chat`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        // Gỡ bỏ hiệu ứng đang gõ
        document.getElementById(loadingId).remove();

        if (response.ok && data.success) {
            // Nếu là chat mới thì gán ID phiên vừa tạo vào hidden input
            if (!activeChatId && data.id_phien_chat) {
                document.getElementById('current-active-chat-id').value = data.id_phien_chat;
            }
            
            // Vẽ tin nhắn của AI
            appendMessageToUI('Bot', data.reply);

            // XỬ LÝ LỆNH TỪ BACKEND ĐẨY VỀ
            if (data.client_action) {
                const actionType = data.client_action.type;
                const slotsData = data.client_action.payload; // Lúc này là mảng Array

                if (actionType === 'ADD_TO_CART') {
                    // Xử lý thêm thẳng vào giỏ
                    slotsData.forEach(slotData => {
                        const existingIndex = selectedSlots.findIndex(s => s.id === slotData.id);
                        if (existingIndex === -1) {
                            selectedSlots.push(slotData);
                            updateSlotUI(slotData, true); // Tô màu xanh nếu đang ở màn hình lịch
                        }
                    });
                    saveToSession();
                    showToast(`Bot đã thêm ${slotsData.length} khung giờ vào Giỏ hàng giúp bạn!`);
                } 
                else if (actionType === 'PROMPT_CART_CHOICE') {
                    // Xử lý hiện 2 nút
                    const actionId = Date.now();
                    const msgArea = document.getElementById('chat-messages-area');
                    msgArea.innerHTML += `
                        <div class="chat-msg bot" id="cart-confirm-${actionId}" style="align-self: flex-start; max-width: 80%;">
                            <div style="background: #fffbeb; color: #b45309; padding: 12px 16px; border-radius: 0 12px 12px 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); border: 1px solid #fde68a; line-height: 1.6;">
                                ⚠️ Giỏ hàng của bạn đang có sẵn các sân khác. Bạn muốn xóa giỏ cũ để thêm sân mới hay chèn thêm vào giỏ?
                                <div style="margin-top: 10px; display: flex; gap: 8px;">
                                    <button onclick="handleCartChoice('replace', ${actionId}, '${encodeURIComponent(JSON.stringify(slotsData))}')" style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-trash-can"></i> Thêm mới</button>
                                    <button onclick="handleCartChoice('append', ${actionId}, '${encodeURIComponent(JSON.stringify(slotsData))}')" style="padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-plus"></i> Thêm vào</button>
                                </div>
                            </div>
                        </div>
                    `;
                    scrollToBottomChat();
                }
            }
            
            // Render lại sidebar để đẩy phiên này lên trên cùng
            loadChatSessions();
        } else {
            appendMessageToUI('Bot', '<span style="color:red"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi: ' + (data.message || 'Hệ thống bận') + '</span>');
        }

    } catch (e) {
        document.getElementById(loadingId)?.remove();
        appendMessageToUI('Bot', '<span style="color:red"><i class="fa-solid fa-wifi"></i> Mất kết nối đến máy chủ!</span>');
    } finally {
        inputEl.disabled = false;
        btnSend.disabled = false;
        inputEl.focus();
        scrollToBottomChat();
    }
}

// ==========================================
// HÀM XỬ LÝ LỰA CHỌN GIỎ HÀNG TỪ CHATBOT
// ==========================================
window.handleCartChoice = function(choice, actionId, encodedSlots) {
    const slotsData = JSON.parse(decodeURIComponent(encodedSlots));
    
    if (choice === 'replace') {
        clearAllSlots(); // Xóa mảng cũ & nhả màu xanh
        slotsData.forEach(slotData => {
            selectedSlots.push(slotData);
            updateSlotUI(slotData, true);
        });
        saveToSession();
        showToast(`Đã xóa giỏ hàng cũ và thêm ${slotsData.length} sân mới vào giỏ!`);
    } else if (choice === 'append') {
        slotsData.forEach(slotData => {
            const existingIndex = selectedSlots.findIndex(s => s.id === slotData.id);
            if (existingIndex === -1) {
                selectedSlots.push(slotData);
                updateSlotUI(slotData, true);
            }
        });
        saveToSession();
        showToast(`Đã chèn thêm ${slotsData.length} sân vào giỏ hàng hiện tại!`);
    }

    // Đổi 2 nút thành thông báo xanh lá
    const confirmBox = document.getElementById(`cart-confirm-${actionId}`);
    if (confirmBox) {
        confirmBox.innerHTML = `
            <div style="background: #ecfdf5; color: #047857; padding: 12px 16px; border-radius: 0 12px 12px 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); border: 1px solid #a7f3d0; line-height: 1.6;">
                Đã xử lý thành công yêu cầu thêm sân vào giỏ hàng!
            </div>
        `;
    }
};

// Hàm hỗ trợ vẽ bong bóng chat (Xử lý cả xuống dòng và Markdown in đậm)
function appendMessageToUI(role, text) {
    const msgArea = document.getElementById('chat-messages-area');
    
    // Xử lý Markdown cơ bản của Gemini: **text** thành <strong>text</strong> và xuống dòng
    let formattedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formattedText = formattedText.replace(/\n/g, '<br>');

    if (role === 'User') {
        msgArea.innerHTML += `
            <div class="chat-msg user" style="align-self: flex-end; max-width: 80%;">
                <div style="background: var(--primary); color: white; padding: 12px 16px; border-radius: 12px 12px 0 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); line-height: 1.5;">
                    ${formattedText}
                </div>
            </div>
        `;
    } else {
        msgArea.innerHTML += `
            <div class="chat-msg bot" style="align-self: flex-start; max-width: 80%;">
                <div style="background: white; color: var(--text-dark); padding: 12px 16px; border-radius: 0 12px 12px 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); border: 1px solid var(--border); line-height: 1.6;">
                    ${formattedText}
                </div>
            </div>
        `;
    }
}

function scrollToBottomChat() {
    const msgArea = document.getElementById('chat-messages-area');
    msgArea.scrollTop = msgArea.scrollHeight;
}

// ==========================================
// CÁC MODAL QUẢN LÝ PHIÊN CHAT (ĐỔI TÊN/XÓA)
// ==========================================
function openRenameChatModal(id, currentName) {
    document.getElementById('rename-chat-id').value = id;
    document.getElementById('rename-chat-original').value = currentName;
    document.getElementById('rename-chat-input').value = currentName;
    
    const btnRename = document.getElementById('btn-confirm-rename');
    btnRename.disabled = true;
    btnRename.style.opacity = '0.5';
    btnRename.style.cursor = 'not-allowed';

    document.getElementById('rename-chat-modal').style.display = 'flex';
}

function openDeleteChatModal(id) {
    document.getElementById('delete-chat-id').value = id;
    document.getElementById('delete-chat-modal').style.display = 'flex';
}

function closeChatModal(type) {
    if (type === 'rename') {
        document.getElementById('rename-chat-modal').style.display = 'none';
    } else if (type === 'delete') {
        document.getElementById('delete-chat-modal').style.display = 'none';
    }
}

function checkRenameChange() {
    const inputVal = document.getElementById('rename-chat-input').value.trim();
    const originalVal = document.getElementById('rename-chat-original').value;
    const btnRename = document.getElementById('btn-confirm-rename');

    if (inputVal !== '' && inputVal !== originalVal) {
        btnRename.disabled = false;
        btnRename.style.opacity = '1';
        btnRename.style.cursor = 'pointer';
    } else {
        btnRename.disabled = true;
        btnRename.style.opacity = '0.5';
        btnRename.style.cursor = 'not-allowed';
    }
}

async function executeRenameChat() {
    const id = document.getElementById('rename-chat-id').value;
    const newName = document.getElementById('rename-chat-input').value.trim();
    const btn = document.getElementById('btn-confirm-rename');

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/chatbot/phien-chat/${id}/doi-ten`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ tieu_de: newName })
        });

        const data = await response.json();
        if (response.ok && data.success) {
            closeChatModal('rename');
            loadChatSessions(); // Update UI
            
            // Cập nhật tiêu đề bên phải nếu đang mở đúng phiên này
            if(document.getElementById('current-active-chat-id').value === id) {
                document.getElementById('chat-header-title').innerText = newName;
            }
        } else {
            showToast(data.message || 'Lỗi khi đổi tên!');
        }
    } catch (e) {
        showToast('Lỗi kết nối máy chủ!');
    } finally {
        btn.innerHTML = 'Đổi tên';
    }
}

async function executeDeleteChat() {
    const id = document.getElementById('delete-chat-id').value;
    const btn = document.getElementById('btn-confirm-delete');

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xóa...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/chatbot/phien-chat/${id}`, {
            method: 'DELETE',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
        });

        const data = await response.json();
        if (response.ok && data.success) {
            closeChatModal('delete');
            loadChatSessions();
            
            // Nếu phiên vừa xóa là phiên đang mở -> clear màn hình
            if (document.getElementById('current-active-chat-id').value === id) {
                createNewChatSession();
            }
        } else {
            showToast(data.message || 'Lỗi khi xóa!');
        }
    } catch (e) {
        showToast('Lỗi kết nối máy chủ!');
    } finally {
        btn.innerHTML = 'Xóa';
        btn.disabled = false;
    }
}

// ======================================================
// MODULE: ĐÁNH GIÁ CỤM SÂN & XEM ĐÁNH GIÁ (KHÁCH HÀNG)
// ======================================================
let currentSelectedStar = 5;
let pendingReviewDatSanId = null;

window.openCustomerReviewModal = function(datSanId, tenCumSan, tenSan, ngayDa) {
    pendingReviewDatSanId = datSanId;
    currentSelectedStar = 5;

    let modal = document.getElementById('customer-review-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'customer-review-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10000; align-items: center; justify-content: center;';
        modal.onclick = function(e) {
            if (e.target === modal) closeCustomerReviewModal();
        };
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 450px; width: 92%; padding: 0; border-radius: 16px; overflow: hidden; background: #fff;">
            <div style="padding: 18px 22px; background: linear-gradient(135deg, #0b5d3b 0%, #15803d 100%); color: #fff; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800;"><i class="fa-solid fa-star" style="color: #fde047; margin-right: 6px;"></i>Đánh giá trải nghiệm sân</h3>
                    <div style="font-size: 0.8rem; opacity: 0.9; margin-top: 2px;">${tenCumSan} &bull; ${tenSan} (${ngayDa})</div>
                </div>
                <i class="fa-solid fa-xmark" style="cursor: pointer; font-size: 1.2rem;" onclick="closeCustomerReviewModal()"></i>
            </div>

            <div id="review-modal-alert" class="modal-alert" style="display: none; margin: 14px 22px 0;"></div>

            <div style="padding: 22px;">
                <div style="text-align: center; margin-bottom: 18px;">
                    <div style="font-size: 0.88rem; font-weight: 600; color: #475569; margin-bottom: 10px;">Mức độ hài lòng của bạn về cụm sân này:</div>
                    <div id="star-selector-box" style="display: inline-flex; gap: 10px; font-size: 2.1rem; cursor: pointer;">
                        ${[1, 2, 3, 4, 5].map(star => `
                            <i class="fa-solid fa-star review-star-item" data-star="${star}" style="color: #f59e0b; transition: transform 0.15s;" onclick="selectReviewStar(${star})"></i>
                        `).join('')}
                    </div>
                    <div id="star-rating-label" style="margin-top: 8px; font-weight: 700; font-size: 0.92rem; color: #d97706;">5 sao - Tuyệt vời!</div>
                </div>

                <div class="form-group" style="margin-bottom: 18px;">
                    <label style="font-weight: 600; font-size: 0.88rem; color: #1e293b; margin-bottom: 6px; display: block;">Nhận xét của bạn (Tùy chọn)</label>
                    <textarea id="review-content-input" class="form-control" rows="3" placeholder="Chia sẻ cảm nhận về mặt cỏ, ánh sáng, thái độ phục vụ tại cụm sân..." style="width: 100%; resize: none; border-radius: 10px;"></textarea>
                </div>

                <div style="display: flex; gap: 12px;">
                    <button type="button" class="btn-outline" style="flex: 1; padding: 11px; border-radius: 10px; font-weight: 600;" onclick="closeCustomerReviewModal()">Hủy bỏ</button>
                    <button type="button" id="btn-submit-review" class="btn-primary" style="flex: 1.5; padding: 11px; border-radius: 10px; font-weight: 700;" onclick="submitCustomerReview()">
                        <i class="fa-solid fa-paper-plane" style="margin-right: 6px;"></i> Gửi đánh giá
                    </button>
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
};

window.selectReviewStar = function(star) {
    currentSelectedStar = star;
    const labels = {
        1: '1 sao - Rất tệ',
        2: '2 sao - Không hài lòng',
        3: '3 sao - Bình thường',
        4: '4 sao - Hài lòng',
        5: '5 sao - Tuyệt vời!'
    };
    document.querySelectorAll('#star-selector-box .review-star-item').forEach(el => {
        const s = Number(el.getAttribute('data-star'));
        el.style.color = s <= star ? '#f59e0b' : '#cbd5e1';
        el.style.transform = s === star ? 'scale(1.18)' : 'scale(1)';
    });
    const lbl = document.getElementById('star-rating-label');
    if (lbl) lbl.innerText = labels[star] || '';
};

window.closeCustomerReviewModal = function() {
    const modal = document.getElementById('customer-review-modal');
    if (modal) modal.style.display = 'none';
    pendingReviewDatSanId = null;
};

window.submitCustomerReview = async function() {
    if (!pendingReviewDatSanId) return;

    const btn = document.getElementById('btn-submit-review');
    const alertBox = document.getElementById('review-modal-alert');
    const noiDung = document.getElementById('review-content-input')?.value.trim() || '';

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi...';
    alertBox.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE_URL}/danh-gia`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id_dat_san: pendingReviewDatSanId,
                so_sao: currentSelectedStar,
                noi_dung: noiDung
            })
        });
        const data = await response.json();

        if (response.ok && data.success) {
            closeCustomerReviewModal();
            showToast(data.message || 'Đã gửi đánh giá thành công!');
            loadMyBookingsData(); // Tải lại danh sách để nút chuyển ngay thành "Đã đánh giá"
        } else {
            alertBox.textContent = data.message || 'Không thể gửi đánh giá!';
            alertBox.className = 'modal-alert error';
            alertBox.style.display = 'block';
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane" style="margin-right: 6px;"></i> Gửi đánh giá';
        }
    } catch (e) {
        alertBox.textContent = 'Lỗi kết nối máy chủ!';
        alertBox.className = 'modal-alert error';
        alertBox.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane" style="margin-right: 6px;"></i> Gửi đánh giá';
    }
};

// Biến toàn cục quản lý phân trang & lọc đánh giá bên Customer
let customerModalReviewsData = [];
let customerModalReviewSort = 'all';
let customerModalReviewPage = 1;
let currentViewedReviewClusterId = null;
const CUSTOMER_REVIEWS_PER_PAGE = 6;

window.openClusterReviewsModal = async function(idCumSan, tenCumSan) {
    currentViewedReviewClusterId = idCumSan;

    let modal = document.getElementById('cluster-reviews-view-modal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cluster-reviews-view-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10000; align-items: center; justify-content: center;';
        modal.onclick = function(e) {
            if (e.target === modal) modal.style.display = 'none';
        };
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px; width: 94%; padding: 0; border-radius: 16px; overflow: hidden; background: #fff; max-height: 88vh; display: flex; flex-direction: column;">
            <div style="padding: 16px 22px; background: #0f172a; color: #fff; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 1.1rem; font-weight: 700;"><i class="fa-solid fa-star" style="color: #fbbf24; margin-right: 8px;"></i>Đánh giá: ${tenCumSan}</h3>
                <i class="fa-solid fa-xmark" style="cursor: pointer; font-size: 1.2rem; color: #94a3b8;" onclick="document.getElementById('cluster-reviews-view-modal').style.display='none'"></i>
            </div>
            <div id="cluster-reviews-body" style="padding: 20px; overflow-y: auto; flex: 1;">
                <div style="text-align: center; padding: 30px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 1.8rem; color: var(--primary);"></i></div>
            </div>
        </div>
    `;
    modal.style.display = 'flex';

    try {
        const res = await fetch(`${API_BASE_URL}/danh-gia?id_cum_san=${idCumSan}`);
        const data = await res.json();
        const bodyEl = document.getElementById('cluster-reviews-body');

        if (!data.success || data.tong_so === 0) {
            bodyEl.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #64748b;">
                    <i class="fa-regular fa-comment-dots" style="font-size: 2.8rem; color: #cbd5e1; margin-bottom: 10px; display: block;"></i>
                    Chưa có đánh giá nào cho cụm sân này.
                </div>`;
            return;
        }

        customerModalReviewsData = data.data || [];
        customerModalReviewSort = 'all';
        customerModalReviewPage = 1;

        bodyEl.innerHTML = `
            <div style="display: flex; align-items: center; gap: 18px; background: #fffbeb; border: 1px solid #fde68a; padding: 16px; border-radius: 12px; margin-bottom: 14px;">
                <div style="text-align: center; padding-right: 18px; border-right: 1px dashed #fcd34d;">
                    <div style="font-size: 2.2rem; font-weight: 800; color: #d97706; line-height: 1;">${Number(data.trung_binh).toFixed(1)}<span style="font-size: 1rem; color: #92400e;">/5</span></div>
                    <div style="color: #f59e0b; font-size: 1rem; margin: 4px 0;">★★★★★</div>
                    <div style="font-size: 0.78rem; color: #78350f; font-weight: 600;">${data.tong_so} đánh giá</div>
                </div>
                <div style="flex: 1; font-size: 0.8rem; color: #475569;">
                    ${[5,4,3,2,1].map(s => {
                        const count = data.phan_bo_sao[s] || 0;
                        const pct = data.tong_so > 0 ? Math.round((count / data.tong_so) * 100) : 0;
                        return `
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px;">
                                <span style="width: 32px; font-weight: 600;">${s} ⭐</span>
                                <div style="flex: 1; height: 7px; background: #fef3c7; border-radius: 99px; overflow: hidden;">
                                    <div style="width: ${pct}%; height: 100%; background: #f59e0b;"></div>
                                </div>
                                <span style="width: 24px; text-align: right;">${count}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- Thanh nút lọc: Tất cả, Mới nhất, Cao nhất, Thấp nhất -->
            <div id="customer-review-filter-btns" style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #f1f5f9;"></div>

            <!-- Danh sách đánh giá -->
            <div id="customer-review-items-box"></div>

            <!-- Phân trang -->
            <div id="customer-review-pagination" style="display: flex; justify-content: center; align-items: center; gap: 6px; margin-top: 14px; padding-top: 10px;"></div>
        `;

        renderCustomerModalReviewsList();
    } catch (e) {
        document.getElementById('cluster-reviews-body').innerHTML = `<div style="color:red; text-align:center;">Lỗi tải đánh giá!</div>`;
    }
};

async function refreshOpenCustomerReviewsModal() {
    const modal = document.getElementById('cluster-reviews-view-modal');
    if (!modal || modal.style.display !== 'flex' || !currentViewedReviewClusterId) return;

    try {
        const res = await fetch(`${API_BASE_URL}/danh-gia?id_cum_san=${currentViewedReviewClusterId}`);
        const data = await res.json();
        if (!data.success) return;

        // Nếu trước đó cụm sân chưa có đánh giá nào (đang hiện thông báo trống), vẽ lại toàn bộ khung
        if (!document.getElementById('customer-review-items-box') && data.tong_so > 0) {
            const titleEl = modal.querySelector('h3');
            const tenCumSan = titleEl ? titleEl.innerText.replace('Đánh giá:', '').trim() : 'Cụm sân';
            openClusterReviewsModal(currentViewedReviewClusterId, tenCumSan);
            return;
        }

        customerModalReviewsData = data.data || [];

        // Cập nhật lại hộp tổng quan điểm trung bình & thanh phần trăm sao ở trên cùng
        const summaryBox = document.querySelector('#cluster-reviews-body > div:first-child');
        if (summaryBox && data.tong_so > 0) {
            summaryBox.innerHTML = `
                <div style="text-align: center; padding-right: 18px; border-right: 1px dashed #fcd34d;">
                    <div style="font-size: 2.2rem; font-weight: 800; color: #d97706; line-height: 1;">${Number(data.trung_binh).toFixed(1)}<span style="font-size: 1rem; color: #92400e;">/5</span></div>
                    <div style="color: #f59e0b; font-size: 1rem; margin: 4px 0;">★★★★★</div>
                    <div style="font-size: 0.78rem; color: #78350f; font-weight: 600;">${data.tong_so} đánh giá</div>
                </div>
                <div style="flex: 1; font-size: 0.8rem; color: #475569;">
                    ${[5,4,3,2,1].map(s => {
                        const count = data.phan_bo_sao[s] || 0;
                        const pct = data.tong_so > 0 ? Math.round((count / data.tong_so) * 100) : 0;
                        return `
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px;">
                                <span style="width: 32px; font-weight: 600;">${s} ⭐</span>
                                <div style="flex: 1; height: 7px; background: #fef3c7; border-radius: 99px; overflow: hidden;">
                                    <div style="width: ${pct}%; height: 100%; background: #f59e0b;"></div>
                                </div>
                                <span style="width: 24px; text-align: right;">${count}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        renderCustomerModalReviewsList();
    } catch (e) {
        console.error('Lỗi cập nhật ngầm modal đánh giá:', e);
    }
}

window.setCustomerModalReviewSort = function(sortType) {
    customerModalReviewSort = sortType;
    customerModalReviewPage = 1;
    renderCustomerModalReviewsList();
};

window.changeCustomerModalReviewPage = function(page) {
    customerModalReviewPage = page;
    renderCustomerModalReviewsList();
};

function renderCustomerModalReviewsList() {
    const filterBox = document.getElementById('customer-review-filter-btns');
    const listBox = document.getElementById('customer-review-items-box');
    const pageBox = document.getElementById('customer-review-pagination');
    if (!listBox) return;

    const buttons = [
        { key: 'all', label: 'Tất cả' },
        { key: 'newest', label: 'Mới nhất' },
        { key: 'highest', label: 'Cao nhất' },
        { key: 'lowest', label: 'Thấp nhất' }
    ];

    if (filterBox) {
        filterBox.innerHTML = buttons.map(b => {
            const active = customerModalReviewSort === b.key;
            const style = active
                ? 'background: var(--primary); color: #fff; border: 1px solid var(--primary);'
                : 'background: #f8fafc; color: #475569; border: 1px solid #cbd5e1;';
            return `<button type="button" onclick="setCustomerModalReviewSort('${b.key}')" style="${style} padding: 6px 13px; border-radius: 999px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: 0.15s;">${b.label}</button>`;
        }).join('');
    }

    let sorted = [...customerModalReviewsData];
    if (customerModalReviewSort === 'newest' || customerModalReviewSort === 'all') {
        sorted.sort((a, b) => new Date(b.NgayTao || 0) - new Date(a.NgayTao || 0));
    } else if (customerModalReviewSort === 'highest') {
        sorted.sort((a, b) => Number(b.SoSao) - Number(a.SoSao) || (new Date(b.NgayTao || 0) - new Date(a.NgayTao || 0)));
    } else if (customerModalReviewSort === 'lowest') {
        sorted.sort((a, b) => Number(a.SoSao) - Number(b.SoSao) || (new Date(b.NgayTao || 0) - new Date(a.NgayTao || 0)));
    }

    const totalPages = Math.ceil(sorted.length / CUSTOMER_REVIEWS_PER_PAGE) || 1;
    if (customerModalReviewPage > totalPages) customerModalReviewPage = totalPages;
    const startIdx = (customerModalReviewPage - 1) * CUSTOMER_REVIEWS_PER_PAGE;
    const pageItems = sorted.slice(startIdx, startIdx + CUSTOMER_REVIEWS_PER_PAGE);

    listBox.innerHTML = pageItems.map(r => {
        const stars = '★'.repeat(Number(r.SoSao)) + '☆'.repeat(5 - Number(r.SoSao));
        const tenKhach = r.nguoi_dung?.HoTen || 'Khách hàng';
        const isGiaiDau = Boolean(r.dat_san?.ID_GiaiDau || r.dat_san?.giai_dau);
        const tagHtml = isGiaiDau
            ? `<span style="font-weight:600; font-size:0.76rem; color:#4338ca; background:#e0e7ff; padding:2px 8px; border-radius:6px; margin-left:6px;"><i class="fa-solid fa-trophy"></i> Giải đấu: ${r.dat_san?.giai_dau?.TenGiaiDau || ('#GD-' + r.dat_san.ID_GiaiDau)}</span>`
            : (r.dat_san?.san_bong?.TenSan ? `<span style="font-weight:500; font-size:0.78rem; color:#64748b; background:#f1f5f9; padding:2px 8px; border-radius:6px; margin-left:6px;">${r.dat_san.san_bong.TenSan}</span>` : '');

        const d = r.NgayTao ? new Date(r.NgayTao) : null;
        const dateStr = d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : '';

        return `
            <div style="border-bottom: 1px solid #f1f5f9; padding: 12px 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; flex-wrap: wrap; gap: 4px;">
                    <div><strong style="color: #0f172a; font-size: 0.94rem;">${tenKhach}</strong>${tagHtml}</div>
                    <span style="font-size: 0.78rem; color: #94a3b8;">${dateStr}</span>
                </div>
                <div style="color: #f59e0b; font-size: 0.95rem; letter-spacing: 1px; margin-bottom: 5px;">${stars}</div>
                <div style="color: #334155; font-size: 0.9rem; line-height: 1.5;">${r.NoiDung ? r.NoiDung : '<span style="color:#94a3b8; font-style:italic;">(Khách hàng không để lại bình luận)</span>'}</div>
            </div>
        `;
    }).join('');

    if (pageBox) {
        if (totalPages <= 1) {
            pageBox.innerHTML = '';
        } else {
            let pHtml = `<button class="btn-outline-sm" ${customerModalReviewPage === 1 ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''} onclick="changeCustomerModalReviewPage(${customerModalReviewPage - 1})" style="padding: 5px 10px;"><i class="fa-solid fa-chevron-left"></i></button>`;
            for (let i = 1; i <= totalPages; i++) {
                const active = i === customerModalReviewPage;
                pHtml += `<button class="${active ? 'btn-primary' : 'btn-outline-sm'}" style="padding: 5px 12px;" onclick="changeCustomerModalReviewPage(${i})">${i}</button>`;
            }
            pHtml += `<button class="btn-outline-sm" ${customerModalReviewPage === totalPages ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''} onclick="changeCustomerModalReviewPage(${customerModalReviewPage + 1})" style="padding: 5px 10px;"><i class="fa-solid fa-chevron-right"></i></button>`;
            pageBox.innerHTML = pHtml;
        }
    }
}