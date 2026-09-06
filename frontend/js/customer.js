const API_BASE_URL = 'http://127.0.0.1:8000/api';
const appContent = document.getElementById('app-content');

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
let currentBookingPurpose = sessionStorage.getItem('dn_football_booking_purpose') || 'normal';

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
        const res = await fetch(`${API_BASE_URL}/thong-tin-ca-nhan`, { credentials: 'include' });
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
        const response = await fetch(`${API_BASE_URL}/giai-dau/cua-toi`, { credentials: 'include' });
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
// ĐỒNG BỘ YÊU CẦU RÚT TIỀN NGẦM (REAL-TIME KHÔNG CHỚP TRANG)
// ======================================================
async function syncUserWithdrawals() {
    // 1. Chỉ chạy ngầm nếu đang mở giao diện Các yêu cầu
    const container = document.getElementById('requests-content-body');
    if (!container) return;

    // 2. Dò xem khách có đang đứng ở đúng Tab "Rút tiền" hay không
    let isRutTienTab = false;
    document.querySelectorAll('button[onclick^="renderRequests"]').forEach(btn => {
        if (btn.style.borderBottom && btn.style.borderBottom.includes('solid') && btn.getAttribute('onclick').includes('rut_tien')) {
            isRutTienTab = true;
        }
    });

    if (!isRutTienTab) return;

    try {
        const response = await fetch(`${API_BASE_URL}/yeu-cau-rut-tien/cua-toi`, { credentials: 'include' });
        if (!response.ok) return;
        
        const res = await response.json();
        const list = res.data || [];

        // 3. Vẽ lại HTML ngầm phần lõi bên trong
        if (list.length === 0) {
            container.innerHTML = `<div style="padding: 40px;"><i class="fa-solid fa-money-bill-transfer" style="font-size: 3rem; color: var(--border); margin-bottom: 16px;"></i><p style="color: var(--text-muted); font-size: 1.05rem;">Bạn chưa có lịch sử rút tiền nào.</p></div>`;
        } else {
            let html = `<div style="display: flex; flex-direction: column; gap: 12px; max-height: 480px; overflow-y: auto; padding-right: 8px; text-align: left;">`;
            list.forEach(item => {
                let badgeColor = '#b45309', badgeBg = '#fef3c7', statusText = 'Chờ duyệt';
                if(item.TrangThai === 'DaDuyet') { badgeColor = '#047857'; badgeBg = '#d1fae5'; statusText = 'Đã duyệt'; }
                if(item.TrangThai === 'TuChoi') { badgeColor = '#b91c1c'; badgeBg = '#fee2e2'; statusText = 'Từ chối'; }

                const dateStr = item.NgayTao ? item.NgayTao.substring(0, 10) : '';
                html += `
                    <div style="border: 1px solid var(--border); border-radius: 8px; padding: 16px; background: #fff; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <div>
                            <h4 style="margin: 0 0 8px 0; color: var(--text-dark); font-size: 1.1rem;">Rút ${Number(item.SoTien).toLocaleString('vi-VN')}đ</h4>
                            <p style="margin: 0 0 4px 0; font-size: 0.9rem; color: var(--text-muted); white-space: pre-line;">${item.NoiDung}</p>
                            <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> Ngày tạo: ${dateStr}</p>
                        </div>
                        <span style="padding: 6px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; background: ${badgeBg}; color: ${badgeColor};">${statusText}</span>
                    </div>
                `;
            });
            html += `</div>`;
            container.innerHTML = html;
        }
    } catch (error) {
        console.error("Lỗi đồng bộ rút tiền ngầm:", error);
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

    let isChanged = false;

    try {
        // Tải danh sách khung giờ hệ thống
        const kgRes = await fetch(`${API_BASE_URL}/khung-gio`);
        const allKhungGio = (await kgRes.json()).data || [];

        // Gom nhóm các slot theo Cụm sân để tối ưu số lần gọi API
        const clusterIds = [...new Set(selectedSlots.map(s => s.clusterId))];

        for (let cId of clusterIds) {
            // Tải danh sách Sân con (để lấy Loại Sân) và Bảng Giá của Cụm này
            const [sbRes, gtRes] = await Promise.all([
                fetch(`${API_BASE_URL}/san-bong?cum_san_id=${cId}`),
                fetch(`${API_BASE_URL}/gia-tien?cum_san_id=${cId}`)
            ]);
            
            const pitches = (await sbRes.json()).data || [];
            const prices = (await gtRes.json()).data || [];

            const slotsInCluster = selectedSlots.filter(s => s.clusterId == cId);

            for (let slot of slotsInCluster) {
                // 1. Tìm sân để biết là Sân 5, Sân 7 hay Sân 11
                const pitch = pitches.find(p => p.ID == slot.pitchId);
                if (!pitch) continue; 

                // 2. Tìm ID của khung giờ tương ứng với chuỗi giờ trong giỏ
                const matchingKhungGio = allKhungGio.find(kg => `${kg.GioBatDau.substring(0,5)} - ${kg.GioKetThuc.substring(0,5)}` === slot.time);
                if (!matchingKhungGio) continue;

                // 3. Đối chiếu giá mới nhất
                const priceInfo = prices.find(p => p.ID_LoaiSan == pitch.ID_LoaiSan && p.ID_KhungGio == matchingKhungGio.ID);
                const newRealPrice = priceInfo ? priceInfo.SoTien : 0;

                // 4. Nếu giá thay đổi -> Lưu lại
                if (Number(slot.price) !== Number(newRealPrice)) {
                    slot.price = newRealPrice;
                    isChanged = true;
                }
            }
        }

        if (isChanged) {
            saveToSession(); // Cập nhật lại thanh nổi
            if (document.getElementById('cart-modal').style.display === 'flex') {
                openCartModal(); // Vẽ lại Modal nếu khách đang mở
            }
            showToast('Giá tiền trong giỏ hàng vừa được tự động cập nhật!');
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
                    credentials: 'include',
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
            // Custom Authorizer: Dùng fetch với credentials: 'include' để tự động gửi Session Cookie khi xác thực Private Channel
            authorizer: (channel, options) => {
                return {
                    authorize: (socketId, callback) => {
                        fetch(`${API_BASE_URL.replace('/api', '')}/broadcasting/auth`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json'
                            },
                            credentials: 'include', // Mang theo cookie đăng nhập
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
            .listen('UserDataUpdated', (e) => {
                console.log('⚡ Đã nhận tín hiệu từ Backend, đang tự động đồng bộ...');
                
                // Kích hoạt ngay 3 hàm cập nhật giao diện mà không cần chờ 1 phút
                syncUserWallet();
                syncUserTournaments();
                syncUserWithdrawals();
                
                // Hàm render thông báo mới
                loadNotifications();
            });

        // BẮT ĐẦU LẮNG NGHE TÍN HIỆU TOÀN HỆ THỐNG
        window.Echo.channel('system-updates')
            .listen('SystemDataUpdated', async (e) => {
                console.log('⚡ Hệ thống có thay đổi Cụm sân/Sân bóng...');

                await revalidateCartPrices();
                
                // Trạng thái 1: Khách đang xem trang Danh sách Cụm Sân (Dựa vào ID vùng chứa lưới sân)
                if (document.getElementById('cluster-grid-container')) {
                    try {
                        // Tải lại ngầm dữ liệu cụm sân
                        const response = await fetch(`${API_BASE_URL}/cum-san`);
                        const res = await response.json();
                        allActiveClusters = res.data.filter(c => c.deleted_at === null);
                        
                        // Gọi hàm lọc để vẽ lại sân mà KHÔNG làm mất chữ đang gõ trong thanh tìm kiếm
                        filterClusters(); 
                    } catch(err) { console.error(err); }
                } 
                // Trạng thái 2: Khách đang xem trang chi tiết Sân con bên trong 1 Cụm
                else if (currentClusterId !== null && document.querySelector('.pitch-section')) {
                    renderPitches(currentClusterId, currentClusterName, currentClusterAddress, currentClusterGioMo, currentClusterGioDong);
                }

                // TRẠNG THÁI 3: Khách đang xem Lịch Sân
                else if (currentPitchId !== null && document.querySelector('.schedule-table')) {
                    // Tự động load lại lịch và cập nhật giỏ hàng ngầm
                    renderSchedule(currentClusterId, currentClusterName, currentPitchId, currentPitchName, currentLoaiSanId, currentPitchType);
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
    
    const btnFloatingCheckout = document.querySelector('.cart-actions .btn-primary'); // Nút Tiến hành đặt sân
    const btnFloatingClear = document.querySelector('.cart-actions button[onclick="clearAllSlots()"]'); // Nút Xóa tất cả (nếu có)
    const isEmpty = selectedSlots.length === 0;

    if (btnFloatingCheckout) {
        btnFloatingCheckout.disabled = isEmpty;
        isEmpty ? btnFloatingCheckout.classList.add('btn-disabled') : btnFloatingCheckout.classList.remove('btn-disabled');
    }
    if (btnFloatingClear) {
        btnFloatingClear.disabled = isEmpty;
        isEmpty ? btnFloatingClear.classList.add('btn-disabled') : btnFloatingClear.classList.remove('btn-disabled');
    }
}

// Hàm gọi API lấy danh sách giải đấu Đã Duyệt của khách hàng
async function loadUserTournaments() {
    try {
        const res = await fetch(`${API_BASE_URL}/giai-dau/cua-toi`, { credentials: 'include' });
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

async function openCartModal() {
    const modal = document.getElementById('cart-modal');
    const modalList = document.getElementById('modal-cart-list');
    const alertBox = document.getElementById('cart-alert');
    if (alertBox) alertBox.style.display = 'none';

    initialBookingPurpose = currentBookingPurpose;

    // Đợi tải danh sách giải đấu trước khi render giao diện
    await loadUserTournaments();
    
    // ====================================================
    // BỔ SUNG LOGIC LỌC GIẢI ĐẤU THEO CỤM SÂN
    // ====================================================
    // Lấy ID cụm sân hiện tại (Hoặc lấy từ dữ liệu giỏ hàng nếu khách đang đứng ở trang chủ)
    let activeClusterId = currentClusterId;
    if (!activeClusterId && selectedSlots.length > 0) {
        activeClusterId = selectedSlots[0].clusterId;
    }

    // Chỉ giữ lại các giải đấu có ID_CumSan trùng khớp với Cụm sân đang xem
    const validTournaments = activeClusterId 
        ? userActiveTournaments.filter(t => t.ID_CumSan == activeClusterId || t.id_cum_san == activeClusterId) 
        : [];
    
    if (currentBookingPurpose !== 'normal') {
        const isPurposeValid = validTournaments.some(t => t.ID == currentBookingPurpose);
        if (!isPurposeValid) {
            currentBookingPurpose = 'normal';
            sessionStorage.setItem('dn_football_booking_purpose', 'normal');
        }
    }

    // Giao diện Dropdown (Thay biến userActiveTournaments thành validTournaments)
    let tournamentHtml = '';
    if (validTournaments.length > 0) {
        tournamentHtml = `
            <div style="margin-bottom: 15px; padding: 12px; background: var(--primary-light); border: 1px solid #bbf7d0; border-radius: 8px;">
                <label style="font-weight: 600; font-size: 0.9rem; color: var(--primary); display: block; margin-bottom: 6px;">Mục đích đặt sân:</label>
                <select id="booking-purpose" class="form-control" onchange="handlePurposeChange(this)" style="border-color: #bbf7d0;">
                    <option value="normal" ${currentBookingPurpose === 'normal' ? 'selected' : ''}>Đá phong trào (Cọc 30% - Lịch 7 ngày)</option>
                    ${validTournaments.map(t => `<option value="${t.ID}" ${currentBookingPurpose == t.ID ? 'selected' : ''}>Giải đấu: ${t.TenGiaiDau} (Cọc 50% - Theo lịch giải)</option>`).join('')}
                </select>
            </div>
        `;
    }
    
    if (selectedSlots.length === 0) {
        modalList.innerHTML = tournamentHtml + `<p style="text-align: center; color: var(--text-muted); padding: 20px;">Chưa có khung giờ nào được chọn.</p>`;
    } else {
        let totalAmount = selectedSlots.reduce((sum, s) => sum + Number(s.price), 0);
        modalList.innerHTML = tournamentHtml + `
            <div id="cart-items-container" style="max-height: 250px; overflow-y: auto;">
                ${selectedSlots.map((s, index) => `
                    <div class="cart-item-card">
                        <div class="cart-item-info">
                            <h4>${s.clusterName} - ${s.pitchName}</h4>
                            <p>Ngày: ${s.date} | Giờ: <strong style="color: var(--primary);">${s.time}</strong></p>
                            <p>Giá: <strong>${Number(s.price).toLocaleString('vi-VN')}đ</strong></p>
                        </div>
                        <i class="fa-solid fa-trash-can cart-item-remove" onclick="removeSlotByIndex(${index})"></i>
                    </div>
                `).join('')}
            </div>
            <div style="text-align:right; margin-top: 15px; border-top: 1px dashed #ccc; padding-top: 10px;">
                <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 4px;">Tổng tiền sân: ${totalAmount.toLocaleString('vi-VN')}đ</div>
                <div style="font-size: 1.15rem; font-weight: 700;">Tiền cần cọc: <span id="cart-deposit-amount" style="color: var(--primary);">0đ</span></div>
            </div>
        `;
        setTimeout(updateCartTotal, 50);
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

// Biến tạm để ghi nhớ trạng thái đang chờ xác nhận
let pendingBookingPurpose = null;
let pendingSelectElement = null;

function handlePurposeChange(selectElement) {
    if (selectedSlots.length > 0) {
        // Ghi nhớ mục đích muốn đổi và hiển thị Modal xác nhận
        pendingBookingPurpose = selectElement.value;
        pendingSelectElement = selectElement;
        document.getElementById('purpose-confirm-modal').style.display = 'flex';
    } else {
        // Nếu giỏ hàng đang trống, cho phép đổi ngay lập tức không cần xác nhận
        currentBookingPurpose = selectElement.value;
        sessionStorage.setItem('dn_football_booking_purpose', currentBookingPurpose); 
        updateCartTotal();
    }
}

function confirmPurposeChange() {
    // 1. Đóng Modal xác nhận
    document.getElementById('purpose-confirm-modal').style.display = 'none';
    
    // 2. Chấp nhận thay đổi
    if (pendingBookingPurpose !== null) {
        currentBookingPurpose = pendingBookingPurpose;
        sessionStorage.setItem('dn_football_booking_purpose', currentBookingPurpose); 
        
        // 3. Xóa giỏ hàng và render lại (Hàm clearAllSlots đã chứa sẵn logic này)
        clearAllSlots(); 
    }
    
    // 4. Reset biến tạm
    pendingBookingPurpose = null;
    pendingSelectElement = null;
}

function cancelPurposeChange() {
    // 1. Đóng Modal xác nhận
    document.getElementById('purpose-confirm-modal').style.display = 'none';
    
    // 2. Trả Dropdown trên màn hình về lại giá trị cũ
    if (pendingSelectElement) {
        pendingSelectElement.value = currentBookingPurpose;
    }
    
    // 3. Reset biến tạm
    pendingBookingPurpose = null;
    pendingSelectElement = null;
}

// Hàm tính toán linh hoạt tiền cọc 30% hoặc 50%
function updateCartTotal() {
    let depositRate = (currentBookingPurpose !== 'normal') ? 0.5 : 0.3; 
    
    let totalAmount = selectedSlots.reduce((sum, s) => sum + Number(s.price), 0);
    let depositAmount = totalAmount * depositRate;
    
    const depositEl = document.getElementById('cart-deposit-amount');
    if (depositEl) {
        depositEl.innerText = depositAmount.toLocaleString('vi-VN') + 'đ';
    }
}

function closeCartModal() {
    document.getElementById('cart-modal').style.display = 'none';

    const alertBox = document.getElementById('cart-alert');
    if (alertBox) alertBox.style.display = 'none';

    // Lấy giá trị mới nhất từ thẻ select trong modal (nếu có tồn tại)
    const purposeSelect = document.getElementById('booking-purpose');
    if (purposeSelect) {
        currentBookingPurpose = purposeSelect.value;
        sessionStorage.setItem('dn_football_booking_purpose', currentBookingPurpose);
    }

    // Kiểm tra xem mục đích có bị thay đổi so với lúc mở modal hay không,
    // hoặc giỏ hàng có bị lệch cụm sân hay không
    const isPurposeChanged = (currentBookingPurpose !== initialBookingPurpose);

    if (currentClusterId !== null && currentPitchId !== null) {
        let isPurposeMismatched = false;
        let needReRender = isPurposeChanged;

        if (currentBookingPurpose !== 'normal') {
            const tour = userActiveTournaments.find(t => t.ID == currentBookingPurpose);
            // Nếu giải đấu không thuộc cụm sân hiện tại -> Ép về normal và xóa giỏ hàng
            if (!tour || (tour.ID_CumSan != currentClusterId && tour.id_cum_san != currentClusterId)) {
                currentBookingPurpose = 'normal';
                sessionStorage.setItem('dn_football_booking_purpose', 'normal');
                selectedSlots = [];
                saveToSession();
                isPurposeMismatched = true;
                needReRender = true;
            }
        }

        if (needReRender) {
            renderSchedule(currentClusterId, currentClusterName, currentPitchId, currentPitchName, currentLoaiSanId, currentPitchType);
        }
    }
}

function removeSlotByIndex(index) {
    selectedSlots.splice(index, 1);
    saveToSession(); openCartModal();
    if (currentClusterId !== null && currentPitchId !== null) {
        renderSchedule(currentClusterId, currentClusterName, currentPitchId, currentPitchName, currentLoaiSanId, currentPitchType);
    }
}

function clearAllSlots() {
    selectedSlots = [];
    saveToSession(); closeCartModal();
    if (currentClusterId !== null && currentPitchId !== null) {
        renderSchedule(currentClusterId, currentClusterName, currentPitchId, currentPitchName, currentLoaiSanId, currentPitchType);
    }
}

function showCartAlert(message, isSuccess) {
    let alertBox = document.getElementById('cart-alert');
    if (!alertBox) {
        // Tự động tạo thẻ div alert nếu chưa có
        alertBox = document.createElement('div');
        alertBox.id = 'cart-alert';
        alertBox.style.margin = '16px 24px 0px'; // Căn lề cho khớp giao diện
        
        // Chèn vào ngay dưới Header của Giỏ hàng
        const modalBody = document.querySelector('#cart-modal .modal-body');
        modalBody.parentNode.insertBefore(alertBox, modalBody);
    }
    
    alertBox.textContent = message;
    alertBox.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alertBox.style.display = 'block';
    
    // Đảm bảo Modal Giỏ hàng đang mở để khách hàng nhìn thấy thông báo
    document.getElementById('cart-modal').style.display = 'flex';
}

// Hàm tiến hành đặt sân
async function checkoutBooking() {
    if (selectedSlots.length === 0) return;

    openCartModal();

    // Đổi trạng thái UI sang Loading để ngăn click nhiều lần
    const btnFloating = document.querySelector('.cart-actions .btn-primary');
    const btnModal = document.querySelector('#cart-modal .btn-primary');
    if (btnFloating) { btnFloating.disabled = true; btnFloating.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...'; }
    if (btnModal) { btnModal.disabled = true; btnModal.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...'; }

    // Ẩn thông báo cũ (nếu có)
    const alertBox = document.getElementById('cart-alert');
    if (alertBox) alertBox.style.display = 'none';

    try {
        const uniqueClusterIds = [...new Set(selectedSlots.map(s => s.clusterId))];

        for (let cId of uniqueClusterIds) {
            // 1. KIỂM TRA CỤM SÂN CÓ BỊ XÓA MỀM KHÔNG
            const clusterRes = await fetch(`${API_BASE_URL}/cum-san/${cId}`);
            const clusterData = await clusterRes.json();
            
            if (!clusterData.success || clusterData.data.deleted_at !== null) {
                const clusterName = selectedSlots.find(s => s.clusterId === cId).clusterName;
                showCartAlert(`Cụm sân "${clusterName}" đang bảo trì hoặc ngừng hoạt động. Đã tự động gỡ khỏi giỏ!`, false);
                
                setTimeout(() => {
                    // Lọc bỏ toàn bộ các sân con thuộc cụm bị lỗi ra khỏi giỏ hàng
                    selectedSlots = selectedSlots.filter(s => s.clusterId !== cId);
                    saveToSession();
                    
                    // Kiểm tra giỏ hàng để mở/đóng Modal
                    if (selectedSlots.length > 0) {
                        openCartModal(); // Nếu còn sân của cụm khác thì giữ Modal
                    } else {
                        closeCartModal(); // Đóng nếu giỏ trống
                    }
                    
                    // Xử lý giao diện nền phía sau Modal
                    if (currentClusterId === cId) {
                        // NẾU khách đang đứng ở ngay cụm sân vừa bị xóa -> Đá văng ra trang danh sách cụm
                        renderClusters();
                    } else if (currentClusterId !== null) {
                        // Khách đang đứng xem ở một cụm khác an toàn -> Render lại cụm đó
                        renderPitches(currentClusterId, currentClusterName, currentClusterAddress, currentClusterGioMo, currentClusterGioDong);
                    } else {
                        // Khách đang đứng ở trang chủ
                        renderClusters();
                    }
                }, 3000); 
                return;
            }

            // 2. KIỂM TRA TỪNG SÂN CON CÓ BỊ CHUYỂN SANG 'BAOTRI' KHÔNG
            const pitchRes = await fetch(`${API_BASE_URL}/san-bong?cum_san_id=${cId}`);
            const pitchData = await pitchRes.json();
            
            const pitchesInCluster = selectedSlots.filter(s => s.clusterId === cId).map(s => s.pitchId);
            for (let pId of pitchesInCluster) {
                const pitchInfo = pitchData.data.find(p => p.ID == pId);
                
                if (!pitchInfo || pitchInfo.TrangThai === 'BaoTri') {
                    const pitchName = pitchInfo ? pitchInfo.TenSan : 'không xác định';
                    showCartAlert(`Sân "${pitchName}" đang bảo trì đột xuất. Đã tự động gỡ khỏi giỏ!`, false);
                    
                    setTimeout(() => {
                        // Lọc bỏ sân bị lỗi ra khỏi giỏ
                        selectedSlots = selectedSlots.filter(s => s.pitchId !== pId);
                        saveToSession();
                        
                        if (selectedSlots.length > 0) {
                            openCartModal(); // Nếu còn sân khác thì render lại giỏ
                        } else {
                            closeCartModal(); // Đóng nếu giỏ trống
                        }
                        
                        // Cập nhật lại giao diện lịch/danh sách phía sau
                        if (currentClusterId !== null) {
                            renderPitches(cId, clusterData.data.TenCumSan, clusterData.data.DiaChi, clusterData.data.GioMoCua, clusterData.data.GioDongCua);
                        } else {
                            renderClusters();
                        }
                    }, 3000);
                    return;
                }
            }
        }

        // Vượt qua kiểm tra
        showCartAlert('Tất cả sân hợp lệ! (Chức năng tạo hóa đơn sẽ được phát triển tiếp)', true);
        
    } catch (error) {
        console.error('Lỗi xác thực:', error);
        showCartAlert('Lỗi kết nối máy chủ!', false);
    } finally {
        // Khôi phục trạng thái nút bấm
        if (btnFloating) { btnFloating.disabled = false; btnFloating.innerHTML = 'Tiến hành đặt sân'; }
        if (btnModal) { btnModal.disabled = false; btnModal.innerHTML = 'Thanh toán ngay'; }
    }
}

async function renderClusters() {
    updateActiveNav('renderClusters');

    currentClusterId = null; currentPitchName = null; currentPitchId = null;
    appContent.innerHTML = `<div style="text-align:center; padding: 50px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải danh sách sân...</div>`;

    try {
        const response = await fetch(`${API_BASE_URL}/cum-san`);
        const res = await response.json();
        
        // 1. Lọc sân hoạt động và lưu vào biến toàn cục
        allActiveClusters = res.data.filter(c => c.deleted_at === null);

        // 2. Trích xuất danh sách Phường tự động từ dữ liệu cụm sân
        const uniquePhuongs = [];
        const phuongMap = new Set();
        allActiveClusters.forEach(c => {
            if (c.ID_Phuong && c.phuong && !phuongMap.has(c.ID_Phuong)) {
                phuongMap.add(c.ID_Phuong);
                uniquePhuongs.push({ id: c.ID_Phuong, name: c.phuong.TenPhuong });
            }
        });

        // 3. Render Giao diện (Thêm Thanh tìm kiếm và Bộ lọc)
        let html = `
            <div class="page-header">
                <h1 class="page-title">Hệ thống sân bóng DN FOOTBALL</h1>
                <p class="page-subtitle">Chọn cụm sân bạn muốn đặt lịch thi đấu</p>
            </div>

            <!-- THANH CÔNG CỤ TÌM KIẾM VÀ LỌC -->
            <div style="display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 250px; position: relative;">
                    <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--text-muted);"></i>
                    <input type="text" id="search-cluster" class="form-control" placeholder="Tìm kiếm theo tên cụm hoặc địa chỉ..." style="padding-left: 40px;" oninput="filterClusters()">
                </div>
                <div style="min-width: 220px;">
                    <select id="filter-phuong" class="form-control" onchange="filterClusters()">
                        <option value="">-- Tất cả khu vực --</option>
                        ${uniquePhuongs.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                    </select>
                </div>
            </div>

            <!-- VÙNG CHỨA DANH SÁCH (Sẽ được điền bởi JS) -->
            <div class="cluster-grid" id="cluster-grid-container"></div>
        `;
        
        appContent.innerHTML = html;

        // 4. Kích hoạt bộ lọc lần đầu để vẽ danh sách
        filterClusters();

    } catch (error) {
        appContent.innerHTML = `<div style="text-align:center; color:red;">Lỗi tải dữ liệu máy chủ!</div>`;
    }
}

// Hàm xử lý logic Tìm kiếm và Lọc theo phường
function filterClusters() {
    const searchInput = document.getElementById('search-cluster');
    const phuongSelect = document.getElementById('filter-phuong');
    const gridContainer = document.getElementById('cluster-grid-container');

    // Chặn lỗi nếu các phần tử DOM chưa được render
    if (!searchInput || !phuongSelect || !gridContainer) return;

    const searchTerm = searchInput.value.toLowerCase().trim();
    const selectedPhuongId = phuongSelect.value;

    // Tiến hành lọc dữ liệu từ mảng gốc
    const filtered = allActiveClusters.filter(cluster => {
        // Lọc theo Text (Tên cụm hoặc Địa chỉ)
        const textMatch = cluster.TenCumSan.toLowerCase().includes(searchTerm) || 
                          cluster.DiaChi.toLowerCase().includes(searchTerm);
        
        // Lọc theo Phường
        const phuongMatch = selectedPhuongId === "" || String(cluster.ID_Phuong) === String(selectedPhuongId);
        
        return textMatch && phuongMatch;
    });

    // Cập nhật lại giao diện Grid
    if (filtered.length === 0) {
        gridContainer.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted); background: #fff; border-radius: 12px; border: 1px dashed var(--border);">Không tìm thấy cụm sân nào phù hợp với yêu cầu tìm kiếm.</div>`;
        return;
    }

    let gridHtml = '';
    filtered.forEach(cluster => {
        const imgUrl = cluster.HinhAnh ? `http://127.0.0.1:8000${cluster.HinhAnh}` : 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?q=80&w=600&auto=format&fit=crop';
        gridHtml += `
            <div class="cluster-card" onclick="renderPitches(${cluster.ID}, '${cluster.TenCumSan}', '${cluster.DiaChi}', '${cluster.GioMoCua}', '${cluster.GioDongCua}')">
                <div class="cluster-img-box">
                    <img src="${imgUrl}" alt="${cluster.TenCumSan}" class="cluster-img">
                </div>
                <div class="cluster-info">
                    <div class="cluster-name">${cluster.TenCumSan}</div>
                    <div class="cluster-address"><i class="fa-solid fa-location-dot" style="color: var(--primary);"></i> ${cluster.DiaChi} (${cluster.phuong?.TenPhuong || ''})</div>
                    <div class="cluster-meta"><i class="fa-solid fa-clock"></i> ${cluster.GioMoCua.substring(0,5)} - ${cluster.GioDongCua.substring(0,5)}</div>
                    <button class="btn-outline">XEM DANH SÁCH SÂN &rarr;</button>
                </div>
            </div>
        `;
    });
    
    // ĐIỂM QUAN TRỌNG NHẤT: Bơm chuỗi HTML vừa tạo vào vùng chứa
    gridContainer.innerHTML = gridHtml;
}

async function renderPitches(clusterId, clusterName, clusterAddress, gioMo, gioDong) {
    await loadUserTournaments();
    if (currentBookingPurpose !== 'normal') {
        const tour = userActiveTournaments.find(t => t.ID == currentBookingPurpose);
        // Kiểm tra xem giải đấu có thuộc về cụm sân vừa click không
        if (!tour || (tour.ID_CumSan != clusterId && tour.id_cum_san != clusterId)) {
            // Trả về bình thường và xóa sạch giỏ hàng
            currentBookingPurpose = 'normal';
            sessionStorage.setItem('dn_football_booking_purpose', 'normal');
            selectedSlots = [];
            saveToSession(); // Cập nhật lại UI giỏ hàng
        }
    }

    if (clusterId) currentClusterId = clusterId; 
    if (clusterName) currentClusterName = clusterName;
    if (clusterAddress !== undefined && clusterAddress !== '') currentClusterAddress = clusterAddress;
    if (gioMo !== undefined) currentClusterGioMo = gioMo;
    if (gioDong !== undefined) currentClusterGioDong = gioDong;

    appContent.innerHTML = `<div style="text-align:center; padding: 50px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải danh sách sân con...</div>`;

    try {
        const response = await fetch(`${API_BASE_URL}/san-bong?cum_san_id=${clusterId}`);
        const res = await response.json();

        // 2. NGHIỆP VỤ: Chỉ hiển thị các sân con đang có trạng thái HOẠT ĐỘNG
        const activePitches = res.data.filter(sb => sb.TrangThai === 'HoatDong');

        // Gom nhóm các sân con theo ID Loại Sân
        const grouped = {};
        activePitches.forEach(sb => {
            const loaiSanName = sb.loaiSan?.TenLoaiSan || sb.loai_san?.TenLoaiSan || 'Loại sân khác';
            const loaiSanId = sb.ID_LoaiSan;
            if(!grouped[loaiSanName]) grouped[loaiSanName] = { id: loaiSanId, pitches: [] };
            grouped[loaiSanName].pitches.push(sb);
        });

        let html = `
            <div class="back-btn" onclick="renderClusters()">
                <i class="fa-solid fa-arrow-left"></i> Quay lại danh sách cụm sân
            </div>
            
            <div class="cluster-detail-header">
                <h1 class="cluster-detail-title">${clusterName}</h1>
                <div class="cluster-detail-info">
                    <span><i class="fa-solid fa-location-dot"></i> ${clusterAddress}</span>
                    <!-- Cắt chuỗi để lấy định dạng HH:mm -->
                    <span><i class="fa-solid fa-clock"></i> ${gioMo.substring(0,5)} - ${gioDong.substring(0,5)}</span>
                </div>
            </div>
        `;

        if (activePitches.length === 0) {
            html += `<p style="text-align:center; color: var(--text-muted); margin-top: 40px;">Cụm sân này hiện chưa có sân con nào hoạt động.</p>`;
        }

        for (const [loaiSanName, data] of Object.entries(grouped)) {
            html += `<div class="pitch-section"><div class="pitch-section-title">${loaiSanName.toUpperCase()}</div><div class="pitch-grid">`;
            data.pitches.forEach(sb => {
                html += `
                    <div class="pitch-card" onclick="renderSchedule(${clusterId}, '${clusterName}', ${sb.ID}, '${sb.TenSan}', ${data.id}, '${loaiSanName}')">
                        <div class="pitch-name">${sb.TenSan}</div>
                        <div class="pitch-type">${loaiSanName}</div>
                        <button class="btn-outline" style="width: 100%; padding: 8px;">XEM LỊCH &rarr;</button>
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
    
    appContent.innerHTML = `<div style="text-align:center; padding: 50px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải lịch...</div>`;

    try {
        // Tải giải đấu trước để xem khách đang ở chế độ Đặt thường hay Đá giải
        await loadUserTournaments();

        // ====================================================
        // BỔ SUNG: KIỂM TRA LẠI ĐỂ BẢO VỆ GIAO DIỆN LỊCH SÂN
        // ====================================================
        if (currentBookingPurpose !== 'normal') {
            const tour = userActiveTournaments.find(t => t.ID == currentBookingPurpose);
            if (!tour || (tour.ID_CumSan != clusterId && tour.id_cum_san != clusterId)) {
                currentBookingPurpose = 'normal';
                sessionStorage.setItem('dn_football_booking_purpose', 'normal');
                selectedSlots = [];
                saveToSession();
            }
        }

        const [gtRes, kgRes] = await Promise.all([
            fetch(`${API_BASE_URL}/gia-tien?cum_san_id=${clusterId}`),
            fetch(`${API_BASE_URL}/khung-gio`)
        ]);

        const giaTienData = (await gtRes.json()).data || [];
        const allKhungGio = (await kgRes.json()).data || [];

        const validPrices = giaTienData.filter(gt => gt.ID_LoaiSan == loaiSanId);
        const validKhungGioIds = validPrices.map(gt => gt.ID_KhungGio);
        const availableTimeSlots = allKhungGio.filter(kg => validKhungGioIds.includes(kg.ID));

        if (availableTimeSlots.length === 0) {
            appContent.innerHTML = `
                <div class="back-btn" onclick="renderPitches(${currentClusterId}, '${currentClusterName}', '${currentClusterAddress}', '${currentClusterGioMo}', '${currentClusterGioDong}')">
                    <i class="fa-solid fa-arrow-left"></i> Quay lại ${clusterName}
                </div>
                <div style="text-align:center; padding: 50px; color: red;">Chưa có cấu hình giá tiền/khung giờ cho loại sân này!</div>
            `;
            return;
        }

        // ====================================================
        // THUẬT TOÁN TÍNH TOÁN NGÀY CỘT HIỂN THỊ
        // ====================================================
        let dateArray = [];
        let isTournamentMode = false;

        if (currentBookingPurpose !== 'normal') {
            const selectedTournament = userActiveTournaments.find(t => t.ID == currentBookingPurpose);
            if (selectedTournament) {
                isTournamentMode = true;
                
                // Đọc ngày YYYY-MM-DD từ DB
                let dStart = new Date(selectedTournament.NgayBatDau);
                let dEnd = new Date(selectedTournament.NgayKetThuc);
                
                // Thuật toán lặp từ ngày khai mạc đến bế mạc
                for (let d = new Date(dStart); d <= dEnd; d.setDate(d.getDate() + 1)) {
                    const pad = n => n < 10 ? '0' + n : n; // Hàm thêm số 0 cho chuẩn DD/MM
                    dateArray.push({
                        short: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
                        full: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
                    });
                }
            }
        }

        // Nếu đá phong trào (hoặc giải lỗi), hiện 7 ngày như cũ
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

        let html = `
            <div class="back-btn" onclick="renderPitches(${currentClusterId}, '${currentClusterName}', '${currentClusterAddress}', '${currentClusterGioMo}', '${currentClusterGioDong}')">
                <i class="fa-solid fa-arrow-left"></i> Quay lại ${currentClusterName}
            </div>
            <div style="font-size: 0.875rem; color: var(--text-muted); margin: 12px 0;">
                Sân bóng &gt; ${currentClusterName} &gt; <strong>${pitchName}</strong>
            </div>
            <div class="page-header" style="margin-top: 10px;">
                <h1 class="page-title">${pitchName} ${isTournamentMode ? `<span class="badge badge-success" style="font-size: 0.9rem;">Chế độ đá giải</span>` : ''}</h1>
                <p class="page-subtitle">Loại sân: ${pitchType} | Chọn các khung giờ bên dưới để đặt lịch</p>
            </div>

            <!-- Khung Quy định dạng Dropdown / Popover bấm vào mới mở -->
            <div style="margin: 20px 0; position: relative; display: inline-block;">
                <!-- Nút icon dấu chấm than -->
                <button type="button" onclick="toggleRuleDropdown(event)" style="background-color: #fffbeb; color: #b45309; border: 1px solid #f59e0b; padding: 8px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <i class="fa-solid fa-circle-exclamation" style="font-size: 1.1rem;"></i> Quy định đặt sân
                </button>

                <!-- Hộp nội dung quy định (Mặc định ẩn: display: none) -->
                <div id="rule-dropdown-box" style="display: none; position: absolute; top: 110%; left: 0; width: 800px; background-color: #fffbeb; border: 1px solid #f59e0b; border-radius: 8px; padding: 18px 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 99;">
                    <h4 style="color: #b45309; margin-bottom: 12px; font-size: 1.05rem; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-circle-exclamation"></i> QUY ĐỊNH ĐẶT SÂN CHI TIẾT
                    </h4>
                    <ul style="color: #78350f; font-size: 0.9rem; margin-left: 20px; line-height: 1.7;">
                        <li><strong>Đặt sân phong trào:</strong>
                            <ul style="margin-top: 4px; margin-bottom: 6px; list-style-type: disc;">
                                <li>Phạm vi lịch hiển thị: Xem và đặt trước trong vòng <strong>7 ngày tới</strong>.</li>
                                <li>Mức tiền cọc: Thanh toán trước <strong>30%</strong> tổng giá trị sân.</li>
                            </ul>
                        </li>
                        <li style="margin-top: 6px;"><strong>Đặt sân đá giải:</strong>
                            <ul style="margin-top: 4px; margin-bottom: 6px; list-style-type: disc;">
                                <li>Điều kiện: Giải đấu phải được Admin phê duyệt tại đúng cụm sân tương ứng. Khách hàng cần mở Giỏ hàng và chọn đúng mục đích "Giải đấu" để hệ thống mở khóa lịch theo giải.</li>
                                <li>Phạm vi lịch hiển thị: Render toàn bộ khung giờ trải dài từ <strong>Ngày bắt đầu đến Ngày kết thúc</strong> của giải đấu.</li>
                                <li>Thời hạn thực hiện: Phải hoàn tất việc đặt lịch trong vòng <strong>3 ngày</strong> kể từ ngày giải đấu được duyệt.</li>
                                <li>Mức tiền cọc: Thanh toán trước <strong>50%</strong> tổng giá trị sân giải đấu.</li>
                            </ul>
                        </li>
                        <li style="margin-top: 6px;"><strong>Quy định hủy lịch chung:</strong>
                            <ul style="margin-top: 4px; list-style-type: disc;">
                                <li>Hủy miễn phí: Tự hủy trực tiếp trên hệ thống nếu thời gian diễn ra trận đấu còn <strong>trên 10 tiếng</strong> đổi với đá phong trào và trước <strong>1 tuần</strong> với đá giải.</li>
                                <li>Hủy gấp: Nếu qua thời gian hủy, bắt buộc phải tạo "Yêu cầu hủy gấp" trong mục Lịch sử đặt sân để chờ Admin phê duyệt hoàn cọc (tùy theo lý do).</li>
                            </ul>
                        </li>
                    </ul>
                </div>
            </div>
            
            <div class="schedule-container">
                <!-- Bọc thẻ table-responsive cho phép cuộn ngang (Scroll) khi lịch giải đấu dài -->
                <div class="table-responsive" style="overflow-x: auto; white-space: nowrap;"> 
                    <table class="schedule-table" style="min-width: 100%;">
                        <thead style="position: sticky; top: 0; background: #F8FAFC; z-index: 1;">
                            <tr>
                                <th style="min-width: 120px;">Khung giờ</th>
                                <th style="min-width: 100px;">Giá tiền</th>
                                ${dateArray.map(d => `<th style="min-width: 90px;">${d.short}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
        `;

        const now = new Date();

        availableTimeSlots.forEach((kg) => {
            const priceInfo = validPrices.find(p => p.ID_KhungGio == kg.ID);
            const priceValue = priceInfo ? priceInfo.SoTien : 0;
            const timeStr = `${kg.GioBatDau.substring(0,5)} - ${kg.GioKetThuc.substring(0,5)}`;

            html += `<tr>
                        <td><strong>${timeStr}</strong></td>
                        <td style="color: var(--primary); font-weight: 600;">${Number(priceValue).toLocaleString('vi-VN')}đ</td>`;
                        
            dateArray.forEach((date) => {
                const slotId = `${clusterName}-${pitchName}-${date.full}-${timeStr}`;
                const isBooked = false; 
                const isSelected = selectedSlots.some(s => s.id === slotId);
                
                const [day, month, year] = date.full.split('/');
                const [startHour, startMinute] = kg.GioBatDau.split(':');
                const slotDateTime = new Date(year, month - 1, day, startHour, startMinute);
                
                const isPast = slotDateTime <= now; 
                
                let statusClass = 'available', statusText = 'CÒN TRỐNG';
                
                if (isPast) {
                    statusClass = 'booked'; 
                    statusText = 'Quá giờ';
                } else if (isBooked) { 
                    statusClass = 'booked'; 
                    statusText = 'Đã đặt'; 
                } else if (isSelected) { 
                    statusClass = 'available selected'; 
                    statusText = 'ĐÃ CHỌN ✓'; 
                }
                
                html += `
                    <td>
                        <div class="slot ${statusClass}" 
                             ${(!isBooked && !isPast) ? `onclick="toggleSlot(this, ${clusterId}, '${clusterName}', ${pitchId}, '${pitchName}', '${date.full}', '${timeStr}', ${priceValue})"` : ''}>
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

function renderMyBookings() {
    updateActiveNav('renderMyBookings');

    currentClusterId = null;
    currentPitchName = null;
    currentPitchType = null;

    appContent.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">Lịch sử đặt sân</h1>
            <p class="page-subtitle">Theo dõi trạng thái các sân bạn đã đặt</p>
        </div>
        <div class="schedule-container" style="padding: 30px; text-align: center;">
            <p style="color: var(--text-muted);">Bạn chưa có lịch sử đặt sân nào.</p>
        </div>
    `;
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

function openProfileModal() {
    document.getElementById('profile-alert').style.display = 'none';

    const user = JSON.parse(sessionStorage.getItem('dn_football_user'));
    if (!user) return;
    
    document.getElementById('prof-hoten').value = user.HoTen || '';
    document.getElementById('prof-sdt').value = user.SoDienThoai || '';
    document.getElementById('prof-email').value = user.Email || '';
    
    document.getElementById('btn-save-profile').disabled = true;
    document.getElementById('btn-save-profile').classList.add('btn-disabled');
    document.getElementById('profile-modal').style.display = 'flex';
    document.getElementById('user-dropdown').classList.remove('show');
}

function closeProfileModal() {
    document.getElementById('profile-modal').style.display = 'none';
}

// Lắng nghe sự kiện thay đổi input để bật nút Lưu
['prof-hoten', 'prof-sdt', 'prof-email'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        const user = JSON.parse(sessionStorage.getItem('dn_football_user'));
        const isChanged = 
            document.getElementById('prof-hoten').value !== (user.HoTen || '') ||
            document.getElementById('prof-sdt').value !== (user.SoDienThoai || '') ||
            document.getElementById('prof-email').value !== (user.Email || '');
            
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
        email: document.getElementById('prof-email').value
    };

    try {
        const response = await fetch(`${API_BASE_URL}/cap-nhat-profile`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            showProfileAlert(data.message || 'Có lỗi xảy ra khi cập nhật!', false);
            btnSave.disabled = false;
            btnSave.textContent = 'Lưu thay đổi';
            return;
        }

        // Cập nhật Session Storage
        sessionStorage.setItem('dn_football_user', JSON.stringify(data.user));
        
        // Cập nhật lại UI Header
        loadCustomerInfo(); 

        showProfileAlert('Cập nhật thông tin thành công!', true);
        
        setTimeout(() => {
            closeProfileModal();
            btnSave.textContent = 'Lưu thay đổi';
        }, 2000);

    } catch (error) {
        console.error('Lỗi:', error);
        showProfileAlert('Không thể kết nối đến máy chủ!', false);
        btnSave.disabled = false;
        btnSave.textContent = 'Lưu thay đổi';
    }
}

// ======================================================
// MODULE: ĐỔI MẬT KHẨU
// ======================================================

// 1. Hàm hiển thị thông báo nội bộ cho Modal Mật Khẩu
function showPasswordAlert(message, isSuccess) {
    const alertBox = document.getElementById('password-alert');
    alertBox.textContent = message;
    alertBox.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alertBox.style.display = 'block';

    setTimeout(() => {
        alertBox.style.display = 'none';
    }, 2500);
}

// 2. Mở Modal
function openChangePasswordModal() {
    const user = JSON.parse(sessionStorage.getItem('dn_football_user'));
    if (!user) return;

    // Ẩn thông báo & Reset trạng thái các bước
    document.getElementById('password-alert').style.display = 'none';
    document.getElementById('pwd-step-1').style.display = 'block';
    document.getElementById('pwd-step-2').style.display = 'none';
    document.getElementById('pwd-otp').value = '';
    document.getElementById('new-password').value = '';
    
    // In email ra giao diện
    document.getElementById('pwd-user-email').textContent = user.Email;
    
    // Hiển thị Modal
    document.getElementById('password-modal').style.display = 'flex';

    // Đóng dropdown nếu ở trang Khách hàng
    const dropdown = document.getElementById('user-dropdown');
    if(dropdown) dropdown.classList.remove('show');
    
    // Đổi màu menu active nếu ở trang Admin
    const pwdMenu = Array.from(document.querySelectorAll('.sidebar-nav a')).find(a => a.textContent.includes('ĐỔI MẬT KHẨU'));
    if (pwdMenu) {
        document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
        pwdMenu.classList.add('active');
    }
}

// 3. Đóng Modal
function closeChangePasswordModal() {
    document.getElementById('password-modal').style.display = 'none';
}

// 4. API Gửi OTP
async function sendPasswordOTP() {
    const btn = document.getElementById('btn-send-otp');
    btn.disabled = true;
    btn.textContent = 'Đang gửi mã...';

    const user = JSON.parse(sessionStorage.getItem('dn_football_user'));

    try {
        const response = await fetch(`${API_BASE_URL}/gui-otp`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.Email })
        });

        const data = await response.json();

        if (!response.ok) {
            showPasswordAlert(data.message || 'Có lỗi khi gửi OTP', false);
            btn.disabled = false;
            btn.textContent = 'Gửi mã OTP';
            return;
        }

        // Thành công -> Chuyển sang Bước 2
        showPasswordAlert('Mã OTP đã được gửi đến email của bạn!', true);
        document.getElementById('pwd-step-1').style.display = 'none';
        document.getElementById('pwd-step-2').style.display = 'block';

    } catch (error) {
        showPasswordAlert('Không thể kết nối máy chủ', false);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Gửi mã OTP';
    }
}

// 5. API Xác nhận và Đổi mật khẩu
async function verifyAndChangePassword() {
    const otp = document.getElementById('pwd-otp').value.trim();
    const newPassword = document.getElementById('new-password').value;
    const btn = document.getElementById('btn-confirm-pwd');

    if (otp.length !== 6) return showPasswordAlert('Mã OTP phải có đúng 6 chữ số', false);
    if (newPassword.length < 6) return showPasswordAlert('Mật khẩu mới phải từ 6 ký tự', false);

    btn.disabled = true;
    btn.textContent = 'Đang xử lý...';
    
    const user = JSON.parse(sessionStorage.getItem('dn_football_user'));

    try {
        const response = await fetch(`${API_BASE_URL}/dat-lai-mat-khau`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: user.Email,
                otp: otp,
                mat_khau_moi: newPassword
            })
        });

        const data = await response.json();

        if (!response.ok) {
            showPasswordAlert(data.message || 'Mã OTP không hợp lệ', false);
            btn.disabled = false;
            btn.textContent = 'Xác nhận đổi mật khẩu';
            return;
        }

        showPasswordAlert('Đổi mật khẩu thành công!', true);
        
        // Thành công -> Đợi 2 giây để user đọc thông báo rồi đóng Modal
        setTimeout(() => {
            closeChangePasswordModal();
            btn.disabled = false;
            btn.textContent = 'Xác nhận đổi mật khẩu';
        }, 2000);

    } catch (error) {
        showPasswordAlert('Không thể kết nối máy chủ', false);
        btn.disabled = false;
        btn.textContent = 'Xác nhận đổi mật khẩu';
    }
}

async function renderRequests(activeTab = 'giai_dau') {
    updateActiveNav('renderRequests');
    currentClusterId = null;

    const activeStyle = "padding: 10px 16px; border-bottom: 2px solid var(--primary); color: var(--primary); font-weight: 600; background: none; border-top: none; border-left: none; border-right: none; cursor: pointer;";
    const inactiveStyle = "padding: 10px 16px; color: var(--text-muted); background: none; font-weight: 500; border: none; cursor: pointer;";

    appContent.innerHTML = `
        <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 16px;">
            <div>
                <h1 class="page-title">Quản lý Yêu cầu</h1>
                <p class="page-subtitle">Theo dõi các đơn xin tổ chức giải đấu, hủy sân gấp và rút tiền</p>
            </div>
            
            ${activeTab === 'giai_dau' ? `
            <button class="btn-primary" onclick="openCreateTournamentModal()" style="display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-plus"></i> Tạo Yêu cầu Giải đấu
            </button>` : ''}
        </div>

        <div style="display: flex; gap: 16px; margin-bottom: 20px; border-bottom: 1px solid var(--border);">
            <button style="${activeTab === 'giai_dau' ? activeStyle : inactiveStyle}" onclick="renderRequests('giai_dau')">Giải đấu</button>
            <button style="${activeTab === 'huy_san' ? activeStyle : inactiveStyle}" onclick="renderRequests('huy_san')">Hủy sân gấp</button>
            <button style="${activeTab === 'rut_tien' ? activeStyle : inactiveStyle}" onclick="renderRequests('rut_tien')">Rút tiền</button>
        </div>

        <div id="requests-content-body" class="schedule-container" style="padding: 20px; text-align: center; background: var(--bg-white); border-radius: 12px; box-shadow: var(--shadow-sm);">
            <i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i>
        </div>
    `;

    const container = document.getElementById('requests-content-body');

    if (activeTab === 'giai_dau') {
        try {
            // Cần tạo API Backend cho route này sau
            const response = await fetch(`${API_BASE_URL}/giai-dau/cua-toi`, { credentials: 'include' });
            if (!response.ok) throw new Error('API chưa sẵn sàng');
            
            const res = await response.json();
            const list = res.data || [];

            if (list.length === 0) {
                container.innerHTML = `
                    <div style="padding: 40px;">
                        <i class="fa-regular fa-folder-open" style="font-size: 3rem; color: var(--border); margin-bottom: 16px;"></i>
                        <p style="color: var(--text-muted); font-size: 1.05rem;">Bạn chưa có yêu cầu tổ chức giải đấu nào.</p>
                    </div>`;
            } else {
                // Thiết lập max-height tạo Scroll dọc chứa khoảng 4-5 item
                let html = `<div style="display: flex; flex-direction: column; gap: 12px; max-height: 480px; overflow-y: auto; padding-right: 8px; text-align: left;">`;
                
                list.forEach(item => {
                    // 1. Tạo từ điển dịch trạng thái
                    const statusTextMap = {
                        'ChoDuyet': 'Chờ duyệt',
                        'DaDuyet': 'Đã duyệt',
                        'TuChoi': 'Từ chối',
                        'HetHan': 'Hết hạn',
                        'HoanThanh': 'Hoàn thành',
                        'DaHuy': 'Đã hủy'
                    };
                    
                    // Lấy trạng thái tiếng Việt (nếu mã không khớp sẽ giữ nguyên gốc)
                    const viStatus = statusTextMap[item.TrangThai] || item.TrangThai;

                    let badgeColor = '#6b7280', badgeBg = '#f3f4f6'; 
                    if(item.TrangThai === 'DaDuyet') { badgeColor = '#047857'; badgeBg = '#d1fae5'; }
                    else if(item.TrangThai === 'TuChoi' || item.TrangThai === 'DaHuy') { badgeColor = '#b91c1c'; badgeBg = '#fee2e2'; }
                    else if(item.TrangThai === 'ChoDuyet') { badgeColor = '#b45309'; badgeBg = '#fef3c7'; }
                    else if(item.TrangThai === 'HetHan') { badgeColor = '#9ca3af'; badgeBg = '#f3f4f6'; }
                    else if(item.TrangThai === 'HoanThanh') { badgeColor = '#2563eb'; badgeBg = '#dbeafe'; }

                    // 1. Xử lý logic tính ngày duyệt và ngày hết hạn (duyệt + 3 ngày)
                    let approvalInfoHtml = '';
                    
                    if (item.TrangThai === 'DaDuyet' && item.NgayDuyet) {
                        const d = new Date(item.NgayDuyet);
                        
                        // Tạo biến dExp và cộng thêm 3 ngày
                        const dExp = new Date(d);
                        dExp.setDate(d.getDate() + 3);
                        
                        // Hàm format ngày định dạng YYYY-MM-DD an toàn theo giờ Local
                        const pad = n => n < 10 ? '0' + n : n;
                        const fApprove = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                        const fExp = `${dExp.getFullYear()}-${pad(dExp.getMonth() + 1)}-${pad(dExp.getDate())}`;

                        // Tạo khối HTML hiển thị riêng
                        approvalInfoHtml = `
                            <p style="margin: 6px 0 0 0; font-size: 0.9rem; color: #047857;">
                                <i class="fa-solid fa-calendar-check"></i> Ngày duyệt: <strong>${fApprove}</strong> 
                                <span style="margin-left: 15px; color: #b91c1c;">
                                    <i class="fa-solid fa-hourglass-half"></i> Ngày hết hạn: <strong>${fExp}</strong>
                                </span>
                            </p>
                        `;
                    }

                    // 2. Chèn biến approvalInfoHtml vào cấu trúc HTML
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
                                <!-- Dòng thông tin phê duyệt sẽ chỉ hiện ra nếu được duyệt -->
                                ${approvalInfoHtml}
                            </div>
                            <div>
                                <span style="padding: 6px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; background: ${badgeBg}; color: ${badgeColor};">${viStatus}</span>
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
        container.innerHTML = `
            <div style="padding: 40px;">
                <i class="fa-regular fa-calendar-xmark" style="font-size: 3rem; color: var(--border); margin-bottom: 16px;"></i>
                <p style="color: var(--text-muted); font-size: 1.05rem;">Bạn chưa có yêu cầu hủy sân gấp nào.</p>
            </div>`;
    } else if (activeTab === 'rut_tien') {
        try {
            const response = await fetch(`${API_BASE_URL}/yeu-cau-rut-tien/cua-toi`, { credentials: 'include' });
            const res = await response.json();
            const list = res.data || [];

            if (list.length === 0) {
                container.innerHTML = `<div style="padding: 40px;"><i class="fa-solid fa-money-bill-transfer" style="font-size: 3rem; color: var(--border); margin-bottom: 16px;"></i><p style="color: var(--text-muted); font-size: 1.05rem;">Bạn chưa có lịch sử rút tiền nào.</p></div>`;
            } else {
                let html = `<div style="display: flex; flex-direction: column; gap: 12px; max-height: 480px; overflow-y: auto; padding-right: 8px; text-align: left;">`;
                list.forEach(item => {
                    let badgeColor = '#b45309', badgeBg = '#fef3c7', statusText = 'Chờ duyệt';
                    if(item.TrangThai === 'DaDuyet') { badgeColor = '#047857'; badgeBg = '#d1fae5'; statusText = 'Đã duyệt'; }
                    if(item.TrangThai === 'TuChoi') { badgeColor = '#b91c1c'; badgeBg = '#fee2e2'; statusText = 'Từ chối'; }

                    const dateStr = item.NgayTao ? item.NgayTao.substring(0, 10) : '';
                    html += `
                        <div style="border: 1px solid var(--border); border-radius: 8px; padding: 16px; background: #fff; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <div>
                                <h4 style="margin: 0 0 8px 0; color: var(--text-dark); font-size: 1.1rem;">Rút ${Number(item.SoTien).toLocaleString('vi-VN')}đ</h4>
                                <p style="margin: 0 0 4px 0; font-size: 0.9rem; color: var(--text-muted); white-space: pre-line;">${item.NoiDung}</p>
                                <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> Ngày tạo: ${dateStr}</p>
                            </div>
                            <span style="padding: 6px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; background: ${badgeBg}; color: ${badgeColor};">${statusText}</span>
                        </div>
                    `;
                });
                html += `</div>`;
                container.innerHTML = html;
            }
        } catch (e) {
            container.innerHTML = `<div style="padding: 40px; color: var(--danger);">Lỗi tải dữ liệu.</div>`;
        }
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
            credentials: 'include', // Bắt buộc để gửi kèm Session/Cookie định danh user
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

        if (!response.ok) {
            // Lấy thông báo lỗi đầu tiên từ validation của Laravel (nếu có)
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
        showTournamentAlert('Gửi yêu cầu thành công! Vui lòng chờ Admin duyệt.', true);
        
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

// 1. Render Giao diện Ví
async function renderWallet(statusMessage = null, isSuccess = true) {
    updateActiveNav('renderWallet'); 
    currentClusterId = null;

    await syncUserWallet();

    const user = JSON.parse(sessionStorage.getItem('dn_football_user'));
    const balance = Number(user?.SoDuVi || 0).toLocaleString('vi-VN') + 'đ';

    // Tạo HTML thông báo nếu có redirect từ VNPay về
    let alertHtml = '';
    if (statusMessage) {
        const alertClass = isSuccess ? 'success' : 'error';
        alertHtml = `<div id="wallet-page-alert" class="modal-alert ${alertClass}" style="display: block; margin-bottom: 20px; font-weight: 500;">${statusMessage}</div>`;
    }

    appContent.innerHTML = `
        <div class="page-header" style="margin-bottom: 30px;">
            <h1 class="page-title">Quản lý Tài chính</h1>
            <p class="page-subtitle">Ví điện tử và lịch sử giao dịch cá nhân</p>
        </div>

        ${alertHtml}

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 30px;">
            <!-- Cột trái: Thẻ Ví dạng Fintech -->
            <div>
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
            </div>

            <!-- Cột phải: Lịch sử giao dịch (Có bộ lọc) -->
            <div style="background: white; border-radius: 20px; padding: 24px; box-shadow: var(--shadow-sm); border: 1px solid var(--border); display: flex; flex-direction: column;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h3 style="margin: 0; font-size: 1.25rem; color: var(--text-dark); display: flex; align-items: center; gap: 8px;">
                        Lịch sử giao dịch
                        <i class="fa-solid fa-clock-rotate-left" style="color: #000000; font-size: 1.1rem;"></i>
                    </h3>
                    <!-- Input chọn ngày để lọc -->
                    <input type="date" id="tx-date-filter" class="form-control" style="width: auto; padding: 6px 12px; font-size: 0.9rem; border-radius: 8px;" onchange="loadTransactionHistory(this.value)">
                </div>
                
                <div id="transaction-list" style="flex: 1;">
                    <div style="text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin text-primary"></i> Đang tải dữ liệu...</div>
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

// Hàm hỗ trợ render thông báo tại thẻ ví mà không cần load lại trang
function showWalletAlert(message, isSuccess) {
    renderWallet(message, isSuccess);
}

// 2. Load API Lịch sử giao dịch (Có tham số bộ lọc ngày)
async function loadTransactionHistory(filterDate = '') {
    const listContainer = document.getElementById('transaction-list');
    try {
        // GỌI API THẬT TỪ BACKEND
        const response = await fetch(`${API_BASE_URL}/giao-dich/cua-toi`, { credentials: 'include' });
        const data = await response.json();
        
        // Kiểm tra nếu API trả về không thành công
        if (!data.success) throw new Error('API Error');

        let transactions = data.data || [];

        // 1. Xử lý đồng bộ Múi giờ và Format dữ liệu hiển thị
        transactions = transactions.map(tx => {
            let localDateStr = '';
            let filterMatchStr = '';
            
            if (tx.NgayTao) {
                // Đưa chuỗi UTC vào đối tượng Date -> JS tự động cộng bù 7 tiếng theo giờ Việt Nam
                const d = new Date(tx.NgayTao); 
                const pad = n => n < 10 ? '0' + n : n;
                
                // Format để render ra màn hình: HH:mm:ss DD/MM/YYYY
                localDateStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
                
                // Format chuẩn YYYY-MM-DD ẩn bên dưới để đối chiếu với thanh công cụ Lọc ngày
                filterMatchStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
            }
            
            // Nạp 2 trường vừa xử lý vào lại object để tái sử dụng
            return { 
                ...tx, 
                displayDate: localDateStr, 
                filterDateStr: filterMatchStr 
            };
        });

        // 2. Xử lý Lọc theo ngày (Sử dụng trường filterDateStr mới)
        if (filterDate) {
            transactions = transactions.filter(tx => tx.filterDateStr === filterDate);
        }

        if (transactions.length === 0) {
            listContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 40px 0;"><i class="fa-solid fa-receipt" style="font-size: 3rem; color: #e5e7eb; margin-bottom: 15px; display: block;"></i>Không có giao dịch nào${filterDate ? ' trong ngày này' : ''}.</div>`;
            return;
        }

        // Thêm CSS scrollbar-width cho thanh cuộn thanh mảnh, đẹp mắt
        let html = '<div style="display: flex; flex-direction: column; gap: 16px; max-height: 380px; overflow-y: auto; padding-right: 12px; scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent;">';
        
        transactions.forEach(tx => {
            const isCong = tx.DongTien === 'Cong';
            const sign = isCong ? '+' : '-';
            const color = isCong ? '#047857' : '#b91c1c'; // Xanh lá / Đỏ
            const bgIcon = isCong ? '#d1fae5' : '#fee2e2';
            
            let icon = 'fa-money-bill-wave';
            if(tx.LoaiGiaoDich === 'NapTien') icon = 'fa-arrow-down';
            if(tx.LoaiGiaoDich === 'DatSan') icon = 'fa-calendar-check';
            if(tx.LoaiGiaoDich === 'RutTien') icon = 'fa-arrow-up';
            if(tx.LoaiGiaoDich === 'HoanTienHuyGap') icon = 'fa-clock-rotate-left';
            if(tx.LoaiGiaoDich === 'HoanTienHuySan') icon = 'fa-clock-rotate-left';

            html += `
                <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 16px; border-bottom: 1px dashed var(--border);">
                    <div style="display: flex; align-items: center; gap: 16px; max-width: 70%;">
                        <div style="width: 44px; height: 44px; flex-shrink: 0; border-radius: 12px; background: ${bgIcon}; color: ${color}; display: flex; align-items: center; justify-content: center; font-size: 1.15rem;">
                            <i class="fa-solid ${icon}"></i>
                        </div>
                        <div>
                            <div style="font-weight: 600; color: var(--text-dark); margin-bottom: 5px; line-height: 1.4;">${tx.NoiDung || tx.LoaiGiaoDich}</div>
                            <div style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-regular fa-clock" style="margin-right: 4px;"></i>${tx.displayDate}</div>
                        </div>
                    </div>
                    <div style="font-weight: 700; font-size: 1.1rem; color: ${color}; flex-shrink: 0;">
                        ${sign}${Number(tx.SoTien).toLocaleString('vi-VN')}đ
                    </div>
                </div>
            `;
        });
        html += '</div>';
        listContainer.innerHTML = html;

    } catch (e) {
        listContainer.innerHTML = `<div style="color: var(--danger); text-align: center;">Lỗi tải dữ liệu.</div>`;
    }
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
            credentials: 'include',
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
// MODULE: TẠO YÊU CẦU RÚT TIỀN
// ======================================================
function showWithdrawAlert(message, isSuccess) {
    const alertBox = document.getElementById('withdraw-alert');
    alertBox.textContent = message;
    alertBox.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alertBox.style.display = 'block';
    setTimeout(() => alertBox.style.display = 'none', 3000);
}

function openWithdrawModal() {
    document.getElementById('withdraw-alert').style.display = 'none';
    document.getElementById('withdraw-amount').value = '';
    document.getElementById('withdraw-note').value = '';
    document.getElementById('withdraw-modal').style.display = 'flex';
}

function closeWithdrawModal() {
    document.getElementById('withdraw-modal').style.display = 'none';
}

async function submitWithdrawRequest() {
    const user = JSON.parse(sessionStorage.getItem('dn_football_user'));
    const amount = Number(document.getElementById('withdraw-amount').value);
    const note = document.getElementById('withdraw-note').value.trim();

    if (!amount || amount < 50000) return showWithdrawAlert('Số tiền rút tối thiểu là 50,000đ!', false);
    if (!note) return showWithdrawAlert('Vui lòng nhập thông tin ngân hàng!', false);
    if (amount > Number(user.SoDuVi)) return showWithdrawAlert('Số dư ví không đủ!', false);

    const btn = document.getElementById('btn-submit-withdraw');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';

    try {
        const response = await fetch(`${API_BASE_URL}/yeu-cau-rut-tien`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ SoTien: amount, NoiDung: note })
        });
        const data = await response.json();

        if (response.ok && data.success) {
            showWithdrawAlert('Tạo yêu cầu thành công! Vui lòng chờ duyệt.', true);

            // --- GỌI HÀM ĐỒNG BỘ NGAY SAU KHI RÚT TIỀN THÀNH CÔNG ---
            syncUserWallet();
            // --------------------------------------------------------

            setTimeout(() => {
                closeWithdrawModal();
                btn.disabled = false; btn.innerHTML = 'Gửi yêu cầu';               
            }, 2000);
        } else {
            showWithdrawAlert(data.message || 'Lỗi hệ thống.', false);
            btn.disabled = false; btn.innerHTML = 'Gửi yêu cầu';
        }
    } catch (e) {
        showWithdrawAlert('Lỗi kết nối máy chủ.', false);
        btn.disabled = false; btn.innerHTML = 'Gửi yêu cầu';
    }
}

// ======================================================
// MODULE: THÔNG BÁO (NOTIFICATIONS)
// ======================================================

// 1. Tải danh sách thông báo từ API
async function loadNotifications() {
    try {
        const res = await fetch(`${API_BASE_URL}/thong-bao`, { credentials: 'include' });
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
                <div onclick="markAsRead(${item.ID}, this)" style="${bgClass} padding: 12px 16px; border-bottom: 1px solid #f1f5f9; display: flex; gap: 12px; transition: 0.2s;">
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
            method: 'PUT', 
            credentials: 'include' 
        });
        
        // Ẩn huy hiệu chuông ngay lập tức trên UI để tạo cảm giác mượt mà
        document.getElementById('notif-badge').style.display = 'none';
        
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
            method: 'PUT',
            credentials: 'include'
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