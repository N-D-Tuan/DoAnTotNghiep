// ======================================================
// DN FOOTBALL - ADMIN
// ======================================================
const API_BASE_URL = 'http://127.0.0.1:8000/api';

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

let currentGDDate = '';
let selectedOfflineSlots = [];
// ======================================================
// DOM READY
// ======================================================
document.addEventListener(
    'DOMContentLoaded',
    () => {

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

        // ==============================================
        // LẤY USER TỪ SESSION STORAGE
        // =============================================
        const currentUser =
            JSON.parse(
                sessionStorage.getItem(
                    'dn_football_user'
                )
            );

        // ==============================================
        // CHƯA ĐĂNG NHẬP
        // ==============================================
        if (!currentUser) {
            window.location.href = 'login.html';
            return;
        }

        // ==============================================
        // KIỂM TRA VAI TRÒ
        // ==============================================
        if (currentUser.VaiTro !== 'Admin' && currentUser.VaiTro !== 'QuanLySan') {
            sessionStorage.clear();
            window.location.href = 'login.html';
            return;
        }

        if (currentUser.VaiTro === 'QuanLySan') {
            document.title = 'Quản lý sân - DN FOOTBALL';
        } else if (currentUser.VaiTro === 'Admin') {
            document.title = 'Admin - DN FOOTBALL';
        }

        // CÔ LẬP GIAO DIỆN: Ẩn các menu không thuộc thẩm quyền
        const menuKhachHang = document.getElementById('menu-khachhang');

        if (currentUser.VaiTro === 'QuanLySan') {
            // Quản lý sân: TUYỆT ĐỐI ẨN menu của Admin
            if(document.getElementById('menu-cumsan')) document.getElementById('menu-cumsan').style.display = 'none';

            if(document.getElementById('menu-sancuatoi')) document.getElementById('menu-sancuatoi').style.display = 'flex';
            if(document.getElementById('menu-datsan')) document.getElementById('menu-datsan').style.display = 'flex';
            if(document.getElementById('menu-giaidau')) document.getElementById('menu-giaidau').style.display = 'flex';
            if(document.getElementById('menu-huysan')) document.getElementById('menu-huysan').style.display = 'flex';
            if(document.getElementById('menu-lichlamviec')) document.getElementById('menu-lichlamviec').style.display = 'flex';
            if(document.getElementById('menu-khuyenmai')) document.getElementById('menu-khuyenmai').style.display = 'flex';

            if(menuKhachHang) menuKhachHang.innerHTML = '<i class="fa-solid fa-users"></i> QUẢN LÝ TÀI KHOẢN';
        } 
        else if (currentUser.VaiTro === 'Admin') {
            // Admin nền tảng: TUYỆT ĐỐI ẨN menu đặc quyền của Quản lý sân
            if(document.getElementById('menu-sancuatoi')) document.getElementById('menu-sancuatoi').style.display = 'none';
            if(document.getElementById('menu-datsan')) document.getElementById('menu-datsan').style.display = 'none';
            if(document.getElementById('menu-giaidau')) document.getElementById('menu-giaidau').style.display = 'none';
            if(document.getElementById('menu-huysan')) document.getElementById('menu-huysan').style.display = 'none';
            if(document.getElementById('menu-lichlamviec')) document.getElementById('menu-lichlamviec').style.display = 'none';

            // Đảm bảo hiển thị đầy đủ menu của Admin
            if(document.getElementById('menu-cumsan')) document.getElementById('menu-cumsan').style.display = 'flex';
            if(document.getElementById('menu-khuyenmai')) document.getElementById('menu-khuyenmai').style.display = 'flex';
            if(document.getElementById('menu-captaikhoan')) document.getElementById('menu-captaikhoan').style.display = 'flex';

            if(menuKhachHang) menuKhachHang.innerHTML = '<i class="fa-solid fa-users-gear"></i> QUẢN LÝ TÀI KHOẢN';
        }

        // ==============================================
        // HIỂN THỊ TÊN ADMIN
        // ==============================================
        const adminUserName =
            document.getElementById(
                'admin-user-name'
            );

        if (adminUserName) {
            adminUserName.textContent = currentUser.HoTen || 'Admin';
        }

        loadNotifications();

        // ==============================================
        // LOGOUT
        // ==============================================
        const logoutButton =
            document.querySelector(
                '.logout-link'
            );

        if (logoutButton) {
            logoutButton.addEventListener(
                'click',
                async (e) => {
                    e.preventDefault();
                    await logoutAdmin();
                }
            );
        }

        // ==============================================
        // RENDER TỔNG QUAN KHI ĐĂNG NHẬP & KIỂM TRA VNPAY HOÀN TIỀN
        // ==============================================
        const urlParamsAdmin = new URLSearchParams(window.location.search);
        const vnpayRefundStatus = urlParamsAdmin.get('vnpay_refund');
        if (vnpayRefundStatus) {
            renderQuanLyDatSan('All', '');
            setTimeout(() => {
                if (vnpayRefundStatus === 'success') {
                    showSystemModal('Hoàn tiền thành công!', 'Giao dịch hoàn tiền cọc qua cổng VNPay đã hoàn tất. Lịch đặt sân đã được chuyển sang Đã hủy.', 'success');
                } else if (vnpayRefundStatus === 'failed') {
                    showSystemModal('Đã hủy giao dịch', 'Giao dịch hoàn tiền trên VNPay chưa hoàn tất. Lịch đặt sân vẫn được giữ nguyên.', 'error');
                } else {
                    showSystemModal('Lỗi giao dịch', 'Có lỗi xảy ra trong quá trình xác thực hoàn tiền VNPay!', 'error');
                }
            }, 300);
            window.history.replaceState({}, document.title, window.location.pathname);
        } else {
            renderTongQuan();
        }

        // ==========================================
        // KẾT NỐI WEBSOCKET DÀNH CHO ADMIN
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
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` },
                            body: JSON.stringify({ socket_id: socketId, channel_name: channel.name })
                        })
                        .then(response => response.json())
                        .then(data => callback(false, data))
                        .catch(error => callback(true, error));
                    }
                };
            }
        });

        // LẮNG NGHE KÊNH KÍN CỦA ADMIN
        window.Echo.private('admin-notifications')
            .listen('.AdminDataUpdated', (e) => {
                console.log('⚡ Nhận yêu cầu mới từ Khách hàng!');

                loadNotifications();

                // Nếu Admin đang mở tab TỔNG QUAN (Dashboard) -> TỰ ĐỘNG REFRESH BIỂU ĐỒ & SỐ LƯỢNG
                if (document.getElementById('revenueChart')) {
                    updateDashboardStats();
                }

                // NẾU ADMIN ĐANG MỞ TAB DANH SÁCH KHÁCH HÀNG -> TỰ REFRESH BẢNG
                if (document.getElementById('user-table-body')) {
                    loadDanhSachUsersAPI();
                }

                // NẾU ADMIN ĐANG MỞ TAB CHI TIẾT KHÁCH HÀNG -> TỰ REFRESH CHÍNH KHÁCH HÀNG ĐÓ                
                if (document.getElementById('tab-ls-datsan') && currentViewedKhachHangId !== null) {
                    renderChiTietKhachHang(currentViewedKhachHangId);
                }

                // Nếu Admin đang mở tab Quản lý Đặt sân -> tự refresh bảng
                if (document.getElementById('datsan-table-body')) {
                    loadDanhSachDatSanAdmin();
                } 

                // Nếu Admin đang mở tab Yêu cầu Giải đấu -> tự refresh bảng
                if (document.getElementById('gd-pending-count')) {
                    loadDanhSachGiaiDauAdmin();
                }

                // Nếu Admin đang mở tab Yêu cầu Hủy sân -> tự refresh bảng
                else if (document.getElementById('uc-pending-count')) {
                    loadDanhSachHuySanAdmin();
                }

                // Nếu Admin/Quản lý đang mở tab Khuyến mãi -> tự refresh bảng Realtime
                if (document.getElementById('admin-promo-tbody') && typeof loadAdminPromosData === 'function') {
                    loadAdminPromosData();
                }
            });
        
        // BẮT ĐẦU LẮNG NGHE TÍN HIỆU TOÀN HỆ THỐNG (Để cập nhật lịch sân Realtime)
        window.Echo.channel('system-updates')
            .listen('SystemDataUpdated', async (e) => {
                console.log('⚡ Hệ thống có tín hiệu cập nhật dữ liệu...');
                
                // 1. CHỈ cập nhật nếu Admin đang đứng ở trang xem Ma trận lịch
                if (typeof currentPitchId !== 'undefined' && currentPitchId !== null && document.querySelector('.schedule-table')) {
                    try {
                        const dsRes = await fetch(`${API_BASE_URL}/dat-san/da-dat?id_san_bong=${currentPitchId}&_t=${new Date().getTime()}`);
                        const bookedSlots = (await dsRes.json()).data || [];

                        // 1. Nhả tất cả các ô đang xám (Đã đặt) thành màu xanh
                        document.querySelectorAll('.schedule-table .slot.booked').forEach(el => {
                            if (el.innerText === 'Đã đặt') {
                                el.classList.remove('booked');
                                el.classList.add('available');
                                el.innerText = 'CÒN TRỐNG';
                                
                                // Khôi phục sự kiện click
                                const slotIdData = el.getAttribute('data-slot-data');
                                if (slotIdData) el.setAttribute('onclick', `toggleOfflineSlot(this, ${slotIdData})`);
                            }
                        });

                        // 2. Quét mảng bookedSlots từ CSDL để tô xám những ô thực sự đã bị đặt
                        bookedSlots.forEach(booked => {
                            // Tạo ID chuẩn: pitchId-NgayDa-kgId
                            const targetSlotId = `${currentPitchId}-${booked.NgayDa}-${booked.ID_KhungGio}`;
                            const slotEl = document.querySelector(`.schedule-table .slot[data-slot-id="${targetSlotId}"]`);
                            
                            if (slotEl && !slotEl.classList.contains('booked')) {
                                slotEl.classList.remove('available', 'selected');
                                slotEl.classList.add('booked');
                                slotEl.innerText = 'Đã đặt';
                                slotEl.removeAttribute('onclick');

                                // 3. Nếu xui xẻo Admin đang chọn đúng ô mà khách vừa đặt -> Rút ô đó khỏi giỏ hàng
                                const existingIndex = selectedOfflineSlots.findIndex(s => s.id === targetSlotId);
                                if (existingIndex > -1) {
                                    selectedOfflineSlots.splice(existingIndex, 1);
                                    updateOfflineCartUI(); // Cập nhật lại thanh nổi
                                    
                                    // Nếu đang mở Modal đặt hộ thì vẽ lại danh sách
                                    if (document.getElementById('offline-booking-modal').style.display === 'flex') {
                                        if(selectedOfflineSlots.length > 0) openOfflineCartModal();
                                        else closeOfflineModal();
                                    }
                                }
                            }
                        });
                    } catch(err) { console.error("Lỗi cập nhật ngầm lịch Admin:", err); }
                }

                // 3. CẬP NHẬT REALTIME LỊCH LÀM VIỆC
                const currentTabAdmin = document.getElementById('admin-cal-current');
                const nextTabAdmin = document.getElementById('admin-cal-next');
                const chamCongTabAdmin = document.getElementById('admin-cal-chamcong');
                
                // Nếu Quản lý đang đứng ở Tab "Tuần Hiện Tại" (Xem nhân viên bị đổi ca đột xuất)
                if (currentTabAdmin && currentTabAdmin.style.display !== 'none') {
                    loadAdminCalendarData(0, 'grid-current-week');
                }
                
                // Nếu Quản lý đang đứng ở Tab "Tuần Sau" (Nhận đơn đăng ký mới của nhân viên)
                if (nextTabAdmin && nextTabAdmin.style.display !== 'none') {
                    // Nếu Quản lý đang có những ô xếp dở dang chưa lưu (pendingManagerAssignments.length > 0)
                    // -> Bỏ qua không tự refresh để tránh làm mất thao tác xếp tay của quản lý
                    if (typeof pendingManagerAssignments !== 'undefined' && pendingManagerAssignments.length === 0) {
                        loadAdminCalendarData(1, 'grid-next-week');
                        loadStaffRegistrationStatus(); // Cập nhật lại cột đếm ca đăng ký
                    }
                }

                // Nếu Quản lý đang đứng ở Tab "Chấm Công / Bảng Công"
                if (chamCongTabAdmin && chamCongTabAdmin.style.display !== 'none') {
                    if (typeof loadAdminChamCongData === 'function') {
                        loadAdminChamCongData();
                    }
                }

                // 5. Cập nhật biểu đồ Dashboard nếu Admin/Quản lý đang đứng ở trang Tổng quan
                if (document.getElementById('revenueChart') && typeof updateDashboardStats === 'function') {
                    updateDashboardStats();
                }

                // 6. CẬP NHẬT REALTIME ĐÁNH GIÁ CỤM SÂN
                // Trường hợp A: Admin đang đứng ở màn hình Danh sách Thẻ Cụm Sân
                if (document.getElementById('cumsan-grid') && typeof loadCumSanCards === 'function') {
                    loadCumSanCards();
                }

                // Trường hợp B: Admin hoặc Quản lý sân đang mở Chi tiết Cụm Sân ("Sân của tôi")
                if (document.getElementById('admin-cs-reviews-list') && typeof currentCumSanId !== 'undefined' && currentCumSanId !== null) {
                    syncAdminClusterReviewsRealtime(currentCumSanId);
                }

                // 7. CẬP NHẬT REALTIME BẢNG KHUYẾN MÃI KHI KHÁCH ĐẶT/HỦY SÂN
                if (document.getElementById('admin-promo-tbody') && typeof loadAdminPromosData === 'function') {
                    loadAdminPromosData();
                }
            });

        if (currentUser && currentUser.ID) {
            window.Echo.private(`user.${currentUser.ID}`)
                .listen('.UserDataUpdated', async (e) => {
                    console.log('⚡ Nhận thông báo cá nhân nội bộ!');
                    
                    // 1. Luôn luôn cập nhật dữ liệu chuông đỏ trên Header khi có bất kỳ thông báo nào
                    await loadNotifications(); 
                    
                    // 2. Kiểm tra thông báo mới nhất để xem có phải nghiệp vụ KHÓA TÀI KHOẢN hay không
                    try {
                        const res = await fetch(`${API_BASE_URL}/thong-bao`);
                        if (res.ok) {
                            const data = await res.json();
                            const list = data.data || [];
                            if (list.length > 0) {
                                const latestNotif = list[0]; // Lấy thông báo mới nhất
                                
                                // CHỈ TẬP TRUNG KIỂM TRA NẾU TIÊU ĐỀ HOẶC NỘI DUNG CHỨA TỪ KHÓA BỊ KHÓA
                                const isLocked = latestNotif.TieuDe.toLowerCase().includes('bị khóa') || 
                                                 latestNotif.NoiDung.toLowerCase().includes('bị khóa');
                                
                                // Nếu KHÔNG PHẢI thông báo khóa tài khoản -> Dừng lại, không hiện Modal popup chướng mắt
                                if (!isLocked) return;
                                
                                // Nếu ĐÚNG LÀ thông báo bị khóa -> Mới bật Modal cảnh báo màu đỏ và chuẩn bị đăng xuất
                                showSystemModal(latestNotif.TieuDe, latestNotif.NoiDung, 'error');
                                
                                // Đếm ngược 4 giây rồi tự động đá văng ra màn hình đăng nhập
                                setTimeout(() => {
                                    sessionStorage.clear();
                                    window.location.href = 'login.html';
                                }, 4000);
                            }
                        }
                    } catch (err) {
                        console.error('Lỗi khi kiểm tra thông báo cá nhân', err);
                    }
                });
        }
    }
);


// ======================================================
// LOGOUT ADMIN
// ======================================================
async function logoutAdmin() {
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
        // XÓA SẠCH SESSION STORAGE
        // ==========================================
        sessionStorage.clear();

        // ==========================================
        // VỀ TRANG CHỦ
        // ==========================================
        window.location.href = 'index.html';
    }
}

function renderAdminProfile() {
    const user = JSON.parse(sessionStorage.getItem('dn_football_user'));
    if (!user) return;

    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const profileLink = Array.from(document.querySelectorAll('.sidebar-nav a'))
                             .find(a => a.textContent.includes('TRANG CÁ NHÂN'));
    if (profileLink) profileLink.classList.add('active');

    let roleDisplay = '';
    if (user.VaiTro === 'Admin') {
        roleDisplay = '<i class="fa-solid fa-chess-king" style="color: #4338ca; margin-right: 5px;"></i> Admin';
    } else if (user.VaiTro === 'QuanLySan') {
        roleDisplay = '<i class="fa-solid fa-building-flag" style="color: #b45309; margin-right: 5px;"></i> Quản lý Cụm Sân';
    } else {
        roleDisplay = 'Người dùng';
    }

    const isMissingBank = !user.TenNganHang || !user.STKNganHang || !user.TenTaiKhoan;
    const bankStr = !isMissingBank
        ? `${user.TenNganHang} - ${user.STKNganHang} (${user.TenTaiKhoan})`
        : (user.VaiTro === 'QuanLySan' 
            ? '<span style="color: #d97706; font-weight: 600;"><i class="fa-solid fa-circle-exclamation"></i> Chưa cập nhật đầy đủ</span>' 
            : 'Chưa cập nhật');

    // Chỉ hiển thị cảnh báo màu vàng nếu là Quản lý sân (QuanLySan) và chưa đủ thông tin ngân hàng
    const bankWarningBanner = (user.VaiTro === 'QuanLySan' && isMissingBank) ? `
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-left: 5px solid #f59e0b; border-radius: 12px; padding: 16px 20px; margin-bottom: 22px; display: flex; justify-content: space-between; align-items: center; gap: 15px; flex-wrap: wrap; box-shadow: 0 2px 8px rgba(245, 158, 11, 0.1);">
            <div style="display: flex; align-items: center; gap: 14px;">
                <div style="width: 42px; height: 42px; border-radius: 50%; background: #fef3c7; color: #d97706; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0;">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                </div>
                <div>
                    <div style="font-weight: 700; color: #92400e; font-size: 0.98rem; margin-bottom: 2px;">Chưa cập nhật đầy đủ thông tin tài khoản ngân hàng!</div>
                    <div style="color: #b45309; font-size: 0.86rem;">Vui lòng bổ sung Tên ngân hàng, Số tài khoản và Tên chủ tài khoản trong hồ sơ cá nhân của bạn.</div>
                </div>
            </div>
            <button class="btn-primary" style="background: #f59e0b; border-color: #f59e0b; color: #fff; padding: 8px 16px; font-size: 0.86rem; white-space: nowrap;" onclick="openProfileModal()">
                <i class="fa-solid fa-pen-to-square"></i> Bổ sung ngay
            </button>
        </div>
    ` : '';

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="margin-bottom: 24px;">
            <h1 class="page-title">Trang cá nhân</h1>
            <p class="text-muted">Quản lý thông tin tài khoản của bạn (Mã: <strong>${user.MaNguoiDung || user.ID}</strong>)</p>
        </div>

        ${bankWarningBanner}
        
        <div class="profile-card">
            <div class="profile-avatar-large"><i class="fa-solid fa-user"></i></div>
            <div>
                <h3 style="margin-bottom: 5px;">${user.HoTen || 'Chưa cập nhật'}</h3>
                <p style="font-weight: 500; font-size: 0.95rem;">${roleDisplay}</p>
            </div>
        </div>

        <div class="profile-section-title">Thông tin cá nhân</div>
        <div class="profile-card">
            <div class="profile-details">
                <div class="detail-item">
                    <label>Họ và tên</label>
                    <div>${user.HoTen || 'Chưa cập nhật'}</div>
                </div>
                <div class="detail-item">
                    <label>Số điện thoại</label>
                    <div>${user.SoDienThoai || 'Chưa cập nhật'}</div>
                </div>
                <div class="detail-item">
                    <label>Email</label>
                    <div>${user.Email || 'Chưa cập nhật'}</div>
                </div>
                <div class="detail-item">
                    <label>Số định danh VNeID</label>
                    <div>${user.Vneid || 'Chưa cập nhật'}</div>
                </div>
                ${user.VaiTro === 'Admin' ? '' : `
                <div class="detail-item">
                    <label>Tài khoản ngân hàng</label>
                    <div>${bankStr}</div>
                </div>`}
                <div class="text-right">
                    <button class="btn-outline-sm" onclick="openProfileModal()">Chỉnh sửa</button>
                </div>
            </div>
        </div>
    `;
}

function showProfileAlert(message, isSuccess) {
    const alertBox = document.getElementById('profile-alert');
    alertBox.textContent = message;
    alertBox.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alertBox.style.display = 'block';
    setTimeout(() => { alertBox.style.display = 'none'; }, 2000);
}

function openProfileModal() {
    document.getElementById('profile-alert').style.display = 'none';

    const user = JSON.parse(sessionStorage.getItem('dn_football_user'));
    document.getElementById('prof-hoten').value = user.HoTen || '';
    document.getElementById('prof-sdt').value = user.SoDienThoai || '';
    document.getElementById('prof-email').value = user.Email || '';
    if (document.getElementById('prof-vneid')) document.getElementById('prof-vneid').value = user.Vneid || '';
    if (document.getElementById('prof-bank-name')) document.getElementById('prof-bank-name').value = user.TenNganHang || '';
    if (document.getElementById('prof-bank-stk')) document.getElementById('prof-bank-stk').value = user.STKNganHang || '';
    if (document.getElementById('prof-bank-owner')) document.getElementById('prof-bank-owner').value = user.TenTaiKhoan || '';
    
    document.getElementById('btn-save-profile').disabled = true;
    document.getElementById('btn-save-profile').classList.add('btn-disabled');
    document.getElementById('profile-modal').style.display = 'flex';
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

async function saveAdminProfile() {
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
        document.getElementById('admin-user-name').textContent = data.user.HoTen; 
        showProfileAlert('Cập nhật thông tin thành công!', true);

        setTimeout(() => {
            closeProfileModal();
            renderAdminProfile(); 
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

// ======================================================
// MODULE: QUẢN LÝ SÂN (GIAO DIỆN DẠNG THẺ)
// ======================================================

// 1. Render giao diện danh sách thẻ Cụm Sân
function renderQuanLySan() {
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = document.getElementById('menu-cumsan');
    if (menuLink) menuLink.classList.add('active');

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <h1 class="page-title">Quản lý Cụm Sân</h1>
                <p class="text-muted">Chọn một cụm sân để xem danh sách sân con và cấu hình giá</p>
            </div>
            <button class="btn-primary" onclick="openCumSanModal()">+ Thêm Cụm Sân</button>
        </div>
        
        <!-- Khung chứa các thẻ -->
        <div id="cumsan-grid" class="cumsan-grid">
            <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">Đang tải dữ liệu...</div>
        </div>

        <!-- BỔ SUNG: Modal Xác nhận Xóa/Khôi phục Cụm Sân -->
        <div id="cs-confirm-modal" class="modal-overlay" style="display: none; z-index: 9999;">
            <div class="modal-content" style="max-width: 400px; text-align: center; padding: 30px 20px;">
                <div style="font-size: 3.5rem; color: #f59e0b; margin-bottom: 15px;"><i class="fa-solid fa-circle-exclamation"></i></div>
                <h3 id="cs-confirm-title" style="margin-bottom: 10px; font-size: 1.4rem;">Xác nhận</h3>
                <p id="cs-confirm-msg" style="color: var(--text-muted); margin-bottom: 25px; line-height: 1.5;"></p>
                <div style="display: flex; justify-content: center; gap: 12px;">
                    <button class="btn-outline" style="width: auto; padding: 10px 24px;" onclick="closeCSConfirmModal()">Hủy bỏ</button>
                    <button id="cs-confirm-btn" class="btn-primary" style="width: auto; padding: 10px 24px;" onclick="executeCSAction()">Đồng ý</button>
                </div>
            </div>
        </div>
    `;

    loadCumSanCards(); // Gọi API lấy dữ liệu thẻ
}

// 2. Fetch API và vẽ Thẻ Cụm Sân
async function loadCumSanCards() {
    try {
        const [response, ratingRes] = await Promise.all([
            fetch(`${API_BASE_URL}/cum-san`),
            fetch(`${API_BASE_URL}/danh-gia`)
        ]);
        const res = await response.json();
        const ratingMap = (await ratingRes.json()).data || {};
        
        const grid = document.getElementById('cumsan-grid');
        if (!grid) return;

        if (!res.success || res.data.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">Chưa có cụm sân nào.</div>`;
            return;
        }

        grid.innerHTML = res.data.map(cs => {
            const maCS = cs.MaCumSan || cs.ID;
            const isBaoTri = cs.TrangThai === 'BaoTri';
            const imgBaseUrl = 'http://127.0.0.1:8000';
            const bgStyle = cs.HinhAnh ? `background-image: url('${imgBaseUrl}${cs.HinhAnh}'); background-size: cover; background-position: center;` : '';
            const iconHtml = cs.HinhAnh ? '' : '<i class="fa-solid fa-map-location-dot"></i>';
            
            const r = ratingMap[maCS];
            const countStar = r ? Number(r.tong_danh_gia) : Number(cs.danh_gias_count || 0);
            const rawAvg = r ? Number(r.trung_binh_sao) : Number(cs.danh_gias_avg_so_sao || 0);
            const avgStar = countStar > 0 ? rawAvg.toFixed(1) : '0.0';

            const cardStyle = isBaoTri ? 'opacity: 0.6; filter: grayscale(1); border-color: #ef4444;' : '';
            const badgeHtml = isBaoTri ? '<div style="position:absolute; top:12px; left:12px; background:#ef4444; color:white; padding:4px 10px; border-radius:4px; font-size:0.8rem; font-weight:bold;">Đang bảo trì</div>' : '';

            return `
            <div class="cumsan-card" style="${cardStyle}" onclick="renderCumSanDetail('${maCS}', '${cs.TenCumSan.replace(/'/g, "\\'")}')">
                ${badgeHtml}
                <div class="cumsan-card-img" style="${bgStyle}">${iconHtml}</div>
                <div class="cumsan-card-body">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:6px;">
                        <div class="cumsan-title" style="margin-bottom:0;">${cs.TenCumSan}</div>
                        <span style="background:#fffbeb; border:1px solid #fde68a; color:#b45309; padding:3px 9px; border-radius:999px; font-size:0.78rem; font-weight:700; white-space:nowrap;">
                            <i class="fa-solid fa-star" style="color:#f59e0b;"></i> ${avgStar} (${countStar} đánh giá)
                        </span>
                    </div>
                    <div class="cumsan-info"><i class="fa-solid fa-location-dot"></i> ${cs.DiaChi} (${cs.phuong ? cs.phuong.TenPhuong : ''})</div>
                    <div class="cumsan-info"><i class="fa-solid fa-clock"></i> ${cs.GioMoCua.substring(0,5)} - ${cs.GioDongCua.substring(0,5)}</div>
                </div>
            </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Lỗi tải thẻ Cụm Sân:', error);
    }
}

let currentCumSanId = null;

async function renderCumSanDetail(cumSanId) {
    currentCumSanId = cumSanId;
    const contentArea = document.querySelector('.admin-content');
    
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    if (currentUser && currentUser.VaiTro === 'QuanLySan') {
        const menuLink = document.getElementById('menu-sancuatoi');
        if (menuLink) menuLink.classList.add('active');
    } else {
        const menuLink = document.getElementById('menu-cumsan');
        if (menuLink) menuLink.classList.add('active');
    }

    contentArea.innerHTML = `<div style="text-align:center; margin-top:50px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu...</div>`;

    try {
        const response = await fetch(`${API_BASE_URL}/cum-san/${cumSanId}`);
        const res = await response.json();

        if (!res.success) {
            const backAction = currentUser.VaiTro === 'Admin' ? 'renderQuanLySan()' : 'renderTongQuan()';
            contentArea.innerHTML = `<button class="btn-back" onclick="${backAction}"><i class="fa-solid fa-arrow-left"></i> Quay lại</button>
                                     <div class="modal-alert error" style="display:block;">Không tìm thấy cụm sân.</div>`;
            return;
        }

        const cs = res.data;
        const maCS = cs.MaCumSan || cs.ID;
        window.currentClusterNameAdmin = cs.TenCumSan;
        const isBaoTri = cs.TrangThai === 'BaoTri';

        const btnEdit = `<button class="btn-outline-sm" onclick='openEditCumSanModal(${JSON.stringify(cs).replace(/'/g, "\\'")})'><i class="fa-solid fa-pen"></i> Sửa Cụm Sân</button>`;
        
        const btnDeleteOrRestore = isBaoTri 
            ? `<button class="btn-outline-sm" style="color: #16A34A; border-color: #bbf7d0;" onclick="restoreCumSan('${maCS}')"><i class="fa-solid fa-rotate-left"></i> Mở hoạt động lại</button>`
            : `<button class="btn-outline-sm" style="color: #ef4444; border-color: #fecaca;" onclick="deleteCumSan('${maCS}')"><i class="fa-solid fa-screwdriver-wrench"></i> Bảo trì cụm sân</button>`;

        const statusBadge = isBaoTri ? `<span class="badge badge-warning" style="margin-left: 10px; font-size: 0.9rem;">Đang bảo trì</span>` : '';

        const backBtnHtml = currentUser.VaiTro === 'QuanLySan' 
            ? ''
            : `<button class="btn-back" onclick="renderQuanLySan()"><i class="fa-solid fa-arrow-left"></i> Quay lại Danh sách Cụm Sân</button>`;

        contentArea.innerHTML = `
            ${backBtnHtml}
            
            <div class="page-header" style="margin-bottom: 24px; padding: 20px 24px; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; border-radius: 14px; background: linear-gradient(135deg, #0b5d3b 0%, #087f4f 100%); box-shadow: 0 6px 18px rgba(0, 93, 59, 0.18); border-left: 5px solid #f5c542;"> 
                <div> 
                    <h1 class="page-title" style="margin: 0 0 10px 0; color: #fff; font-size: 28px; font-weight: 700; letter-spacing: -0.3px;"> 
                        ${cs.TenCumSan} ${statusBadge} 
                    </h1> 
                    
                    <p class="text-muted" style="margin: 7px 0; display: flex; align-items: center; gap: 8px; color: rgba(255,255,255,0.9); font-size: 14px;"> 
                        <i class="fa-solid fa-location-dot" style="width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 7px; background: rgba(255,255,255,0.12); color: #f5c542;"> </i> 
                        ${cs.DiaChi} (${cs.phuong?.TenPhuong || ''}) 
                    </p> 

                    <p class="text-muted" style="margin: 7px 0 0 0; display: flex; align-items: center; gap: 8px; color: rgba(255,255,255,0.9); font-size: 14px;"> 
                        <i class="fa-solid fa-clock" style="width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 7px; background: rgba(255,255,255,0.12); color: #f5c542;"> </i> 
                        ${cs.GioMoCua.substring(0,5)} - ${cs.GioDongCua.substring(0,5)} 
                    </p> 
                </div> 
                <div style="display: flex; gap: 10px; align-items: center; flex-shrink: 0; padding: 5px; border-radius: 10px; background: rgba(0,0,0,0.12);"> 
                    ${btnEdit} ${btnDeleteOrRestore} 
                </div> 
            </div>

            <div id="tab-sanbong" class="tab-pane active panel">
                <div class="panel-header">Danh sách Sân con <button class="btn-primary" onclick="openSanBongModal()" ${isBaoTri?'disabled':''}>+ Thêm Sân Con</button></div>
                
                <div class="table-responsive" style="max-height: 360px; overflow-y: auto;">
                    <table class="admin-table" style="position: relative;">
                        <thead style="position: sticky; top: 0; background: #F8FAFC; z-index: 1; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <tr>
                                <th>Tên Sân</th>
                                <th>Loại Sân</th>
                                <th>Kích thước / Diện tích</th>
                                <th>Mô tả</th>
                                <th>Trạng Thái</th>
                                <th style="text-align:center;">Hành động</th>
                            </tr>
                        </thead>
                        <tbody id="sanbong-table-body">
                            <tr><td colspan="6" class="text-center" style="text-align: center;">Đang tải...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div id="tab-giatien" class="tab-pane" style="margin-top: 24px;">
                <div id="price-container">Đang tải cấu hình...</div>
            </div>
            
            <div class="panel" style="margin-top: 24px;">
                <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                    <div>
                        <i class="fa-solid fa-star" style="color: #f59e0b; margin-right: 6px;"></i>
                        Đánh giá của Khách hàng về Cụm sân
                        <span id="admin-cs-rating-summary" style="margin-left: 10px; font-size: 0.9rem; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; padding: 3px 10px; border-radius: 999px; font-weight: 700;">Đang tải...</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <div id="admin-cs-sort-btns" style="display: inline-flex; gap: 6px; flex-wrap: wrap;"></div>
                        <select id="admin-cs-rating-filter" class="form-control" style="width: 165px; height: 36px; padding: 0 10px; font-size: 0.85rem;" onchange="handleAdminStarFilterChange(this.value)">
                            <option value="all">Tất cả số sao</option>
                            <option value="5">5 sao (Tuyệt vời)</option>
                            <option value="4">4 sao (Hài lòng)</option>
                            <option value="3">3 sao (Bình thường)</option>
                            <option value="2">2 sao (Kém)</option>
                            <option value="1">1 sao (Rất tệ)</option>
                        </select>
                    </div>
                </div>
                <div id="admin-cs-reviews-list" style="padding: 16px 20px;">
                    <div style="text-align: center; color: var(--text-muted); padding: 20px;">Đang tải đánh giá...</div>
                </div>
                <div id="admin-cs-reviews-pagination" style="display: flex; justify-content: center; align-items: center; gap: 8px; padding: 0 20px 18px 20px;"></div>
            </div>
        `;

        loadSanBongTheoCum(maCS);
        loadGiaTienTheoCum(cs);
        loadDanhGiaTheoCumAdmin(maCS);

    } catch (error) {
        console.error("Lỗi:", error);
    }
}

async function loadSanBongTheoCum(cumSanId) {
    try {
        const response = await fetch(`${API_BASE_URL}/san-bong?cum_san_id=${cumSanId}`);
        const res = await response.json();
        
        const tbody = document.getElementById('sanbong-table-body');
        if (!res.success || res.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="text-align: center;">Chưa có sân con nào.</td></tr>`;
            return;
        }

        tbody.innerHTML = res.data.map(sb => {
            const maSB = sb.MaSanBong || sb.ID;
            const maLS = sb.MaLoaiSan || sb.ID_LoaiSan;
            const ktStr = sb.KichThuoc || '--';
            const dtStr = sb.DienTich ? `${Number(sb.DienTich)} m²` : '--';
            return `
            <tr>
                <td><strong>${sb.TenSan}</strong> <span style="font-size:0.75rem; color:#64748b;">(${maSB})</span></td>
                <td>${sb.loaiSan?.TenLoaiSan || sb.loai_san?.TenLoaiSan || '<span style="color:red">Lỗi dữ liệu</span>'}</td>
                <td><span style="font-weight: 600; color: #334155;">${ktStr}</span> <span style="color: #64748b; font-size: 0.82rem;">(${dtStr})</span></td>
                <td style="max-width: 220px; font-size: 0.85rem; color: #475569;">${sb.MoTa || '<span style="color:#94a3b8; font-style:italic;">Chưa có mô tả</span>'}</td>
                <td><span class="badge ${sb.TrangThai === 'HoatDong' ? 'badge-success' : 'badge-warning'}">${sb.TrangThai === 'HoatDong' ? 'Hoạt động' : 'Bảo trì'}</span></td>
                <td>
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <button class="action-btn" style="background:#f0fdf4; color:#16a34a; border-color:#bbf7d0;" onclick="renderAdminSchedule('${cumSanId}', '${sb.TenSan.replace(/'/g, "\\'")}', '${maSB}', '${maLS}')">
                            <i class="fa-regular fa-calendar"></i> Xem lịch
                        </button>
                        <button class="action-btn" onclick='openSanBongModal(${JSON.stringify(sb).replace(/'/g, "\\'")})'>
                            <i class="fa-solid fa-pen-to-square"></i> Sửa
                        </button>
                    </div>
                </td>
            </tr>
        `}).join('');
    } catch (e) { console.error(e); }
}

async function openSanBongModal(sb = null) {
    const res = await fetch(`${API_BASE_URL}/loai-san`);
    const loaiSans = (await res.json()).data;
    document.getElementById('sb-loaisan').innerHTML = loaiSans.map(ls => {
        const maLS = ls.MaLoaiSan || ls.ID;
        return `<option value="${maLS}">${ls.TenLoaiSan}</option>`;
    }).join('');

    if (sb) {
        document.getElementById('sanbong-modal-title').textContent = 'Chỉnh sửa Sân Con';
        document.getElementById('sb-id').value = sb.MaSanBong || sb.ID;
        document.getElementById('sb-ten').value = sb.TenSan;
        document.getElementById('sb-loaisan').value = sb.MaLoaiSan || sb.ID_LoaiSan;
        if (document.getElementById('sb-dientich')) document.getElementById('sb-dientich').value = sb.DienTich || '';
        if (document.getElementById('sb-kichthuoc')) document.getElementById('sb-kichthuoc').value = sb.KichThuoc || '';
        if (document.getElementById('sb-mota')) document.getElementById('sb-mota').value = sb.MoTa || '';
        document.getElementById('sb-trangthai').value = sb.TrangThai;
        document.getElementById('group-trangthai').style.display = 'block';
    } else {
        document.getElementById('sanbong-modal-title').textContent = 'Thêm Sân Con';
        document.getElementById('sb-id').value = '';
        document.getElementById('sb-ten').value = '';
        if (document.getElementById('sb-dientich')) document.getElementById('sb-dientich').value = '';
        if (document.getElementById('sb-kichthuoc')) document.getElementById('sb-kichthuoc').value = '';
        if (document.getElementById('sb-mota')) document.getElementById('sb-mota').value = '';
        document.getElementById('group-trangthai').style.display = 'none';
    }
    document.getElementById('sanbong-modal').style.display = 'flex';
}

function closeSanBongModal() { 
    document.getElementById('sanbong-modal').style.display = 'none'; 
}

async function saveSanBong() {
    const btn = document.querySelector('#sanbong-modal .btn-primary');
    const sbId = document.getElementById('sb-id').value;
    const tenSan = document.getElementById('sb-ten').value.trim();
    const idLoaiSan = document.getElementById('sb-loaisan').value;
    const dienTich = document.getElementById('sb-dientich')?.value || null;
    const kichThuoc = document.getElementById('sb-kichthuoc')?.value.trim() || null;
    const moTa = document.getElementById('sb-mota')?.value.trim() || null;
    const trangThai = sbId ? document.getElementById('sb-trangthai').value : 'HoatDong';

    if (!tenSan || !idLoaiSan) {
        alert('Vui lòng nhập đầy đủ tên sân và loại sân!');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Đang lưu...';

    const payload = {
        MaCumSan: currentCumSanId,
        MaLoaiSan: idLoaiSan,
        TenSan: tenSan,
        DienTich: dienTich !== '' ? dienTich : null,
        KichThuoc: kichThuoc,
        MoTa: moTa,
        TrangThai: trangThai
    };

    const url = sbId ? `${API_BASE_URL}/san-bong/${sbId}` : `${API_BASE_URL}/san-bong`;
    const method = sbId ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (response.ok && data.success) {
            closeSanBongModal();
            loadSanBongTheoCum(currentCumSanId);
        } else {
            alert(data.message || 'Có lỗi xảy ra');
        }
    } catch (error) {
        alert('Lỗi kết nối máy chủ!');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Lưu Sân Bóng';
    }
}

async function loadGiaTienTheoCum(cs) {
    try {
        const maCS = cs.MaCumSan || cs.ID;
        const [lsRes, kgRes, gtRes] = await Promise.all([
            fetch(`${API_BASE_URL}/loai-san`),
            fetch(`${API_BASE_URL}/khung-gio`),
            fetch(`${API_BASE_URL}/gia-tien?cum_san_id=${maCS}`)
        ]);
        
        const loaiSans = (await lsRes.json()).data;
        let allKhungGio = (await kgRes.json()).data;
        const currentPrices = (await gtRes.json()).data || [];

        const validKhungGio = allKhungGio.filter(kg => kg.GioBatDau >= cs.GioMoCua && kg.GioKetThuc <= cs.GioDongCua);

        const container = document.getElementById('price-container');
        if (validKhungGio.length === 0) {
            container.innerHTML = `<div class="panel" style="padding: 30px; text-align: center; color: red;">Lỗi: Không có khung giờ nào khớp với giờ mở cửa (${cs.GioMoCua} - ${cs.GioDongCua})</div>`;
            return;
        }

        let html = '';
        loaiSans.forEach(ls => {
            const maLS = ls.MaLoaiSan || ls.ID;
            html += `
            <div class="section-loaisan">
                <div class="section-loaisan-header">
                    <div class="section-loaisan-title"><i class="fa-solid fa-futbol" style="color:var(--primary)"></i> ${ls.TenLoaiSan}</div>
                    <button id="btn-save-price-${maLS}" class="btn-primary" onclick="saveGiaTien('${maCS}', '${maLS}', '${ls.TenLoaiSan}')" disabled style="opacity: 0.5; cursor: not-allowed;"><i class="fa-solid fa-save"></i> Lưu giá ${ls.TenLoaiSan}</button>
                </div>
                <div class="price-grid">`;

            validKhungGio.forEach(kg => {
                const maKG = kg.MaKhungGio || kg.ID;
                const existPrice = currentPrices.find(p => (p.MaLoaiSan || p.ID_LoaiSan) == maLS && (p.MaKhungGio || p.ID_KhungGio) == maKG);
                const val = existPrice ? existPrice.SoTien : '';

                html += `
                    <div class="price-card">
                        <div class="time-label">${kg.GioBatDau.substring(0,5)} - ${kg.GioKetThuc.substring(0,5)}</div>
                        <input type="number" class="form-control price-input input-price-${maLS}" 
                               data-khunggio="${maKG}" 
                               data-original="${val}" 
                               value="${val}" 
                               oninput="checkPriceChanges('${maLS}')" 
                               placeholder="Bỏ trống = Đóng sân">
                    </div>`;
            });
            html += `</div></div>`;
        });
        container.innerHTML = html;
    } catch (e) { console.error(e); }
}

let currentAdminClusterReviews = [];
let adminReviewStarFilter = 'all';
let adminReviewSortType = 'all'; // 'all' | 'newest' | 'highest' | 'lowest'
let adminReviewCurrentPage = 1;
const ADMIN_REVIEWS_PER_PAGE = 6;

async function loadDanhGiaTheoCumAdmin(cumSanId) {
    try {
        const res = await fetch(`${API_BASE_URL}/danh-gia?id_cum_san=${cumSanId}`);
        const data = await res.json();
        const summaryEl = document.getElementById('admin-cs-rating-summary');

        if (data.success) {
            currentAdminClusterReviews = data.data || [];
            adminReviewStarFilter = 'all';
            adminReviewSortType = 'all';
            adminReviewCurrentPage = 1;

            if (summaryEl) {
                summaryEl.innerHTML = data.tong_so > 0
                    ? `⭐ ${Number(data.trung_binh).toFixed(1)}/5.0 (${data.tong_so} đánh giá)`
                    : `⭐ 0.0/5.0 (0 đánh giá)`;
            }
            renderAdminCumSanReviews();
        }
    } catch (e) {
        console.error('Lỗi tải đánh giá cụm sân:', e);
    }
}

async function syncAdminClusterReviewsRealtime(cumSanId) {
    try {
        const res = await fetch(`${API_BASE_URL}/danh-gia?id_cum_san=${cumSanId}`);
        const data = await res.json();
        const summaryEl = document.getElementById('admin-cs-rating-summary');

        if (data.success) {
            currentAdminClusterReviews = data.data || [];
            if (summaryEl) {
                summaryEl.innerHTML = data.tong_so > 0
                    ? `⭐ ${Number(data.trung_binh).toFixed(1)}/5.0 (${data.tong_so} đánh giá)`
                    : `⭐ 0.0/5.0 (0 đánh giá)`;
            }
            renderAdminCumSanReviews();
        }
    } catch (e) {
        console.error('Lỗi đồng bộ realtime đánh giá cụm sân:', e);
    }
}

window.handleAdminStarFilterChange = function(starVal) {
    adminReviewStarFilter = starVal;
    adminReviewCurrentPage = 1;
    renderAdminCumSanReviews();
};

window.handleAdminSortReviewChange = function(sortType) {
    adminReviewSortType = sortType;
    adminReviewCurrentPage = 1;
    renderAdminCumSanReviews();
};

window.changeAdminReviewPage = function(page) {
    adminReviewCurrentPage = page;
    renderAdminCumSanReviews();
};

window.filterAdminCumSanReviews = function(starVal) {
    handleAdminStarFilterChange(starVal);
};

function renderAdminCumSanReviews() {
    const container = document.getElementById('admin-cs-reviews-list');
    const sortBtnsContainer = document.getElementById('admin-cs-sort-btns');
    const paginationContainer = document.getElementById('admin-cs-reviews-pagination');
    if (!container) return;

    // 1. Vẽ 4 nút sắp xếp: Tất cả, Mới nhất, Cao nhất, Thấp nhất
    if (sortBtnsContainer) {
        const sortOptions = [
            { key: 'all', label: 'Tất cả' },
            { key: 'newest', label: 'Mới nhất' },
            { key: 'highest', label: 'Cao nhất' },
            { key: 'lowest', label: 'Thấp nhất' }
        ];
        sortBtnsContainer.innerHTML = sortOptions.map(opt => {
            const isActive = adminReviewSortType === opt.key;
            const btnStyle = isActive
                ? 'background: var(--primary); color: #fff; border: 1px solid var(--primary);'
                : 'background: #f8fafc; color: #475569; border: 1px solid #cbd5e1;';
            return `<button type="button" onclick="handleAdminSortReviewChange('${opt.key}')" style="${btnStyle} padding: 6px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: 0.15s;">${opt.label}</button>`;
        }).join('');
    }

    // 2. Lọc theo số sao (nếu có chọn)
    let list = adminReviewStarFilter === 'all'
        ? [...currentAdminClusterReviews]
        : currentAdminClusterReviews.filter(r => String(r.SoSao) === String(adminReviewStarFilter));

    // 3. Sắp xếp theo nút lọc
    if (adminReviewSortType === 'newest' || adminReviewSortType === 'all') {
        list.sort((a, b) => new Date(b.NgayTao || 0) - new Date(a.NgayTao || 0));
    } else if (adminReviewSortType === 'highest') {
        list.sort((a, b) => Number(b.SoSao) - Number(a.SoSao) || (new Date(b.NgayTao || 0) - new Date(a.NgayTao || 0)));
    } else if (adminReviewSortType === 'lowest') {
        list.sort((a, b) => Number(a.SoSao) - Number(b.SoSao) || (new Date(b.NgayTao || 0) - new Date(a.NgayTao || 0)));
    }

    if (list.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">Không có đánh giá nào phù hợp với bộ lọc.</div>`;
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
    }

    // 4. Phân trang (6 đánh giá / 1 trang)
    const totalPages = Math.ceil(list.length / ADMIN_REVIEWS_PER_PAGE) || 1;
    if (adminReviewCurrentPage > totalPages) adminReviewCurrentPage = totalPages;
    const startIdx = (adminReviewCurrentPage - 1) * ADMIN_REVIEWS_PER_PAGE;
    const pageData = list.slice(startIdx, startIdx + ADMIN_REVIEWS_PER_PAGE);

    // 5. Render danh sách (Hiển thị chuẩn #GD-... cho Giải đấu và #PT-... cho Phong trào)
    container.innerHTML = pageData.map(r => {
        const stars = '★'.repeat(Number(r.SoSao)) + '☆'.repeat(5 - Number(r.SoSao));
        const tenKhach = r.nguoi_dung?.HoTen || 'Khách hàng';
        const d = r.NgayTao ? new Date(r.NgayTao) : null;
        const dateStr = d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` : '';

        const idGiaiDau = r.dat_san?.ID_GiaiDau || r.dat_san?.giai_dau?.ID || null;
        const tenGiaiDau = r.dat_san?.giai_dau?.TenGiaiDau || '';
        const tenSan = r.dat_san?.san_bong?.TenSan || 'Sân bóng';

        const badgeInfoHtml = idGiaiDau
            ? `<span style="font-size: 0.8rem; color: #4338ca; margin-left: 8px; background: #eef2ff; border: 1px solid #c7d2fe; padding: 3px 9px; border-radius: 6px; font-weight: 600;">
                   <i class="fa-solid fa-trophy"></i> ${tenGiaiDau ? `Giải đấu: ${tenGiaiDau}` : 'Giải đấu'} &bull; Mã #GD-${idGiaiDau}
               </span>`
            : `<span style="font-size: 0.8rem; color: #64748b; margin-left: 8px; background: #f1f5f9; border: 1px solid #e2e8f0; padding: 3px 9px; border-radius: 6px; font-weight: 500;">
                   ${tenSan} &bull; Vé #PT-${r.ID_DatSan}
               </span>`;

        return `
            <div style="border-bottom: 1px solid #f1f5f9; padding: 12px 0; display: flex; justify-content: space-between; gap: 15px; align-items: flex-start;">
                <div>
                    <div style="margin-bottom: 5px; display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                        <strong style="color: #0f172a;">${tenKhach}</strong>
                        ${badgeInfoHtml}
                    </div>
                    <div style="color: #334155; font-size: 0.9rem; line-height: 1.5;">${r.NoiDung || '<span style="color:#94a3b8; font-style:italic;">(Không có nội dung nhận xét)</span>'}</div>
                </div>
                <div style="text-align: right; flex-shrink: 0;">
                    <div style="color: #f59e0b; font-size: 1rem; letter-spacing: 1px;">${stars}</div>
                    <div style="font-size: 0.76rem; color: #94a3b8; margin-top: 2px;">${dateStr}</div>
                </div>
            </div>
        `;
    }).join('');

    // 6. Vẽ nút phân trang
    if (paginationContainer) {
        if (totalPages <= 1) {
            paginationContainer.innerHTML = '';
        } else {
            let pHtml = `<button class="btn-outline-sm" ${adminReviewCurrentPage === 1 ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''} onclick="changeAdminReviewPage(${adminReviewCurrentPage - 1})" style="padding: 5px 10px;"><i class="fa-solid fa-chevron-left"></i></button>`;
            for (let i = 1; i <= totalPages; i++) {
                const active = i === adminReviewCurrentPage;
                pHtml += `<button class="${active ? 'btn-primary' : 'btn-outline-sm'}" style="padding: 5px 12px;" onclick="changeAdminReviewPage(${i})">${i}</button>`;
            }
            pHtml += `<button class="btn-outline-sm" ${adminReviewCurrentPage === totalPages ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''} onclick="changeAdminReviewPage(${adminReviewCurrentPage + 1})" style="padding: 5px 10px;"><i class="fa-solid fa-chevron-right"></i></button>`;
            paginationContainer.innerHTML = pHtml;
        }
    }
}

// ======================================================
// CẤU HÌNH GIÁ TIỀN
// ======================================================

// Hàm kiểm tra sự thay đổi để Mở/Khóa nút Lưu
function checkPriceChanges(lsID) {
    const inputs = document.querySelectorAll(`.input-price-${lsID}`);
    const btn = document.getElementById(`btn-save-price-${lsID}`);
    let isChanged = false;

    inputs.forEach(input => {
        if (input.value !== input.getAttribute('data-original')) {
            isChanged = true;
        }
    });

    if (isChanged) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    } else {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
    }
}

// Hàm gửi API lưu những ô thay đổi
async function saveGiaTien(csID, lsID, tenLoaiSan) {
    const btn = document.getElementById(`btn-save-price-${lsID}`);
    const inputs = document.querySelectorAll(`.input-price-${lsID}`);
    
    // Chỉ thu thập những ô có value khác với original
    let changedPrices = [];
    inputs.forEach(input => {
        if (input.value !== input.getAttribute('data-original')) {
            changedPrices.push({
                ID_KhungGio: input.getAttribute('data-khunggio'),
                SoTien: input.value
            });
        }
    });

    if (changedPrices.length === 0) return;

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...`;

    try {
        const response = await fetch(`${API_BASE_URL}/gia-tien/save`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ID_CumSan: csID,
                ID_LoaiSan: lsID,
                prices: changedPrices
            })
        });

        const data = await response.json();
        
        if (response.ok && data.success) {
            // Cập nhật lại state original để khóa nút
            inputs.forEach(input => input.setAttribute('data-original', input.value));
            checkPriceChanges(lsID);
            
            btn.innerHTML = `<i class="fa-solid fa-check"></i> Đã lưu`;
            setTimeout(() => {
                btn.innerHTML = `<i class="fa-solid fa-save"></i> Lưu giá ${tenLoaiSan}`;
            }, 2000);
        } else {
            alert(data.message || 'Lỗi khi lưu bảng giá');
            btn.innerHTML = `<i class="fa-solid fa-save"></i> Lưu giá ${tenLoaiSan}`;
        }
    } catch (error) {
        alert('Lỗi kết nối máy chủ!');
        btn.innerHTML = `<i class="fa-solid fa-save"></i> Lưu giá ${tenLoaiSan}`;
    }
}

function showCumSanAlert(message, isSuccess) {
    const alertBox = document.getElementById('cumsan-alert');
    alertBox.textContent = message;
    alertBox.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alertBox.style.display = 'block';
    setTimeout(() => { alertBox.style.display = 'none'; }, 3000);
}

// Hàm tải danh sách Phường vào Select
async function loadPhuongDropdown() {
    try {
        const response = await fetch(`${API_BASE_URL}/phuong`);
        const res = await response.json();
        if (res.success) {
            const select = document.getElementById('cs-phuong');
            select.innerHTML = res.data.map(p => `<option value="${p.ID}">${p.TenPhuong}</option>`).join('');
        }
    } catch (error) {
        console.error('Lỗi tải dropdown Phường:', error);
    }
}

function generateTimeOptions(selectId, defaultTime) {
    const select = document.getElementById(selectId);
    select.innerHTML = '';
    
    for (let h = 5; h <= 23; h++) { // Tạo từ 05:00 đến 23:30
        let hour = h.toString().padStart(2, '0');
        select.innerHTML += `<option value="${hour}:00">${hour}:00</option>`;
        select.innerHTML += `<option value="${hour}:30">${hour}:30</option>`;
    }
    
    // Gán giá trị mặc định
    if (defaultTime) select.value = defaultTime;
}

async function openEditCumSanModal(cs) {
    document.getElementById('cumsan-alert').style.display = 'none';
    document.getElementById('cumsan-modal-title').textContent = 'Chỉnh sửa Cụm Sân';
    editCumSanId = cs.ID; // Đánh dấu là đang sửa

    const btnSave = document.querySelector('#cumsan-modal .btn-primary');
    if (btnSave) {
        btnSave.textContent = 'Lưu Cụm Sân';
        btnSave.disabled = false;
    }

    await loadPhuongDropdown();
    generateTimeOptions('cs-giomo', cs.GioMoCua.substring(0, 5));
    generateTimeOptions('cs-giodong', cs.GioDongCua.substring(0, 5));

    document.getElementById('cs-ten').value = cs.TenCumSan;
    document.getElementById('cs-diachi').value = cs.DiaChi;
    document.getElementById('cs-vido').value = cs.ViDo || '';
    document.getElementById('cs-kinhdo').value = cs.KinhDo || '';
    document.getElementById('cs-phuong').value = cs.ID_Phuong;
    document.getElementById('cs-hinhanh').value = ''; // Reset input file

    document.getElementById('cumsan-modal').style.display = 'flex';
}

// Bật Modal
async function openCumSanModal() {
    document.getElementById('cumsan-alert').style.display = 'none';
    document.getElementById('cumsan-modal-title').textContent = 'Thêm Cụm Sân Mới';

    editCumSanId = null;

    const btnSave = document.querySelector('#cumsan-modal .btn-primary');
    if (btnSave) {
        btnSave.textContent = 'Lưu Cụm Sân';
        btnSave.disabled = false;
    }
    
    // Clear dữ liệu cũ
    document.getElementById('cs-ten').value = '';
    document.getElementById('cs-diachi').value = '';
    document.getElementById('cs-vido').value = '';
    document.getElementById('cs-kinhdo').value = '';
    document.getElementById('cs-hinhanh').value = '';
    
    // Sinh dropdown giờ chuẩn 24h và set mặc định
    generateTimeOptions('cs-giomo', '06:00');
    generateTimeOptions('cs-giodong', '22:00');
    
    await loadPhuongDropdown();
    
    document.getElementById('cumsan-modal').style.display = 'flex';
}

// Tắt Modal
function closeCumSanModal() {
    document.getElementById('cumsan-modal').style.display = 'none';
}

// Lưu dữ liệu (Thêm mới)
async function saveCumSan() {
    const btn = document.querySelector('#cumsan-modal .btn-primary');
    
    // Lấy dữ liệu dạng text
    const tenCumSan = document.getElementById('cs-ten').value.trim();
    const idPhuong = document.getElementById('cs-phuong').value;
    const diaChi = document.getElementById('cs-diachi').value.trim();
    const viDo = document.getElementById('cs-vido').value.trim();
    const kinhDo = document.getElementById('cs-kinhdo').value.trim();
    const gioMo = document.getElementById('cs-giomo').value;
    const gioDong = document.getElementById('cs-giodong').value;
    
    // Lấy file ảnh
    const hinhAnhFile = document.getElementById('cs-hinhanh').files[0];

    // Validate sơ bộ
    if(!tenCumSan || !diaChi || !gioMo || !gioDong) {
        return showCumSanAlert('Vui lòng điền đầy đủ thông tin bắt buộc!', false);
    }

    btn.disabled = true;
    btn.textContent = 'Đang lưu...';

    // Dùng FormData để gửi cả Text và File
    const formData = new FormData();
    formData.append('TenCumSan', tenCumSan);
    formData.append('ID_Phuong', idPhuong);
    formData.append('DiaChi', diaChi);
    formData.append('ViDo', viDo);
    formData.append('KinhDo', kinhDo);
    formData.append('GioMoCua', gioMo);
    formData.append('GioDongCua', gioDong);
    
    // Nếu có chọn ảnh thì mới append vào
    if (hinhAnhFile) {
        formData.append('HinhAnh', hinhAnhFile);
    }

    if (editCumSanId) formData.append('_method', 'PUT');

    const url = editCumSanId ? `${API_BASE_URL}/cum-san/${editCumSanId}` : `${API_BASE_URL}/cum-san`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/json'
            },
            body: formData
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showCumSanAlert(editCumSanId ? 'Cập nhật thành công!' : 'Thêm mới thành công!', true);
            
            // Xử lý Render lại giao diện
            setTimeout(() => {
                closeCumSanModal();
                btn.disabled = false;
                btn.textContent = 'Lưu Cụm Sân';
                
                if (editCumSanId) {
                    renderCumSanDetail(editCumSanId); // Đang ở trang chi tiết -> Render lại chi tiết
                } else {
                    loadCumSanCards(); // Đang tạo mới -> Render lại danh sách thẻ
                }
            }, 1500);
        } else {
            showCumSanAlert(data.message || 'Có lỗi xảy ra!', false);
        }
    } catch (error) {
        showCumSanAlert('Không thể kết nối máy chủ!', false);
        btn.disabled = false;
        btn.textContent = 'Lưu Cụm Sân';
    }
}

// ======================================================
// XÓA / KHÔI PHỤC CỤM SÂN (DÙNG MODAL)
// ======================================================
let pendingCumSanId = null;
let pendingCumSanAction = null; // 'delete' hoặc 'restore'

// 1. Mở Modal cấu hình tự động theo hành động
function deleteCumSan(id) {
    openCSConfirmModal(id, 'delete');
}

function restoreCumSan(id) {
    openCSConfirmModal(id, 'restore');
}

function openCSConfirmModal(id, action) {
    pendingCumSanId = id;
    pendingCumSanAction = action;

    // Tự động tạo Modal bám vào body nếu chưa tồn tại
    let modal = document.getElementById('cs-confirm-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cs-confirm-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 9999;';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; text-align: center; padding: 30px 20px;">
                <div style="font-size: 3.5rem; color: #f59e0b; margin-bottom: 15px;"><i class="fa-solid fa-circle-exclamation"></i></div>
                <h3 id="cs-confirm-title" style="margin-bottom: 10px; font-size: 1.4rem;">Xác nhận</h3>
                <p id="cs-confirm-msg" style="color: var(--text-muted); margin-bottom: 25px; line-height: 1.5;"></p>
                <div style="display: flex; justify-content: center; gap: 12px;">
                    <button class="btn-outline" style="width: auto; padding: 10px 24px;" onclick="closeCSConfirmModal()">Hủy bỏ</button>
                    <button id="cs-confirm-btn" class="btn-primary" style="width: auto; padding: 10px 24px;" onclick="executeCSAction()">Đồng ý</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const isDelete = (action === 'delete');
    
    document.getElementById('cs-confirm-title').innerText = isDelete ? 'Tạm Ngưng Cụm Sân' : 'Khôi Phục Cụm Sân';
    document.getElementById('cs-confirm-msg').innerHTML = isDelete 
        ? 'Bạn có chắc chắn muốn <strong style="color: #ef4444;">Tạm ngưng</strong> hoạt động của Cụm Sân này không?' 
        : 'Bạn muốn <strong style="color: #16A34A;">KHÔI PHỤC</strong> hoạt động cho Cụm Sân này?';
    
    const btnConfirm = document.getElementById('cs-confirm-btn');
    btnConfirm.style.backgroundColor = isDelete ? '#ef4444' : 'var(--primary)';
    btnConfirm.style.borderColor = isDelete ? '#ef4444' : 'var(--primary)';

    modal.style.display = 'flex';
}

function closeCSConfirmModal() {
    document.getElementById('cs-confirm-modal').style.display = 'none';
    pendingCumSanId = null;
    pendingCumSanAction = null;
}

// 2. Thực thi gọi API sau khi nhấn Đồng ý
async function executeCSAction() {
    if (!pendingCumSanId || !pendingCumSanAction) return;

    const btn = document.getElementById('cs-confirm-btn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    btn.disabled = true;

    const isDelete = pendingCumSanAction === 'delete';
    const url = isDelete ? `${API_BASE_URL}/cum-san/${pendingCumSanId}` : `${API_BASE_URL}/cum-san/${pendingCumSanId}/restore`;
    const method = isDelete ? 'DELETE' : 'PUT';

    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
        });

        const data = await response.json();
        
        if (response.ok && data.success) {
            showCumSanAlert(isDelete ? 'Đã tạm ngưng Cụm Sân!' : 'Đã khôi phục Cụm Sân!', true);
            renderCumSanDetail(currentCumSanId); // Cập nhật lại màn hình chi tiết
        } else {
            showCumSanAlert(data.message || 'Có lỗi xảy ra!', false);
        }
    } catch (error) {
        showCumSanAlert('Không thể kết nối máy chủ!', false);
    } finally {
        btn.innerHTML = 'Đồng ý';
        btn.disabled = false;
        closeCSConfirmModal();
    }
}

// Hàm chuyển đổi Tab trong trang chi tiết
function switchSanTab(tabId, element) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    element.classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

// ======================================================
// MODULE: QUẢN LÝ YÊU CẦU GIẢI ĐẤU
// ======================================================

// Các biến toàn cục quản lý trạng thái của trang Giải Đấu
let allGiaiDauData = []; 
let currentGDPage = 1;
const itemsPerGDPage = 5; // Số dòng trên mỗi trang
let currentGDFilter = 'All';
let currentGDSearch = '';

// Biến lưu trữ hành động chuẩn bị duyệt/từ chối
let pendingActionId = null;
let pendingActionStatus = null;

function renderQuanLyGiaiDau() {
    currentGDPage = 1;
    currentGDFilter = 'All';
    currentGDSearch = '';
    allGiaiDauData = [];

    // 1. Cập nhật trạng thái Active trên Menu
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = Array.from(document.querySelectorAll('.sidebar-nav a')).find(a => a.textContent.includes('YÊU CẦU GIẢI ĐẤU'));
    if (menuLink) menuLink.classList.add('active');

    // 2. Render khung giao diện chính tích hợp Bộ lọc, Tìm kiếm và Modal Confirm
    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
            <div>
                <h1 class="page-title">Quản lý Yêu cầu Giải đấu</h1>
                <p class="text-muted">Có <strong id="gd-pending-count" style="color: #ea580c; font-size: 1.1rem;">0</strong> đơn đang chờ bạn phê duyệt</p>
            </div>
        </div>
        
        <!-- Khu vực thông báo tùy chỉnh (Thay thế alert) -->
        <div id="giaidau-alert" class="modal-alert" style="display: none; margin-bottom: 16px;"></div>

        <div class="panel">
            <!-- Khu vực Tìm kiếm và Lọc -->
            <div style="display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap;">
                <div style="position: relative; flex: 1; min-width: 250px;">
                    <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 12px; top: 12px; color: var(--text-muted);"></i>
                    <input type="text" id="gd-search-input" class="form-control" style="padding-left: 35px;" placeholder="Tìm tên khách hàng, tên sân, tên giải..." oninput="handleGDSearch(this.value)">
                </div>
                <input type="date" id="gd-date-filter" class="form-control" style="width: 150px;" onchange="handleGDDate(this.value)">
                <select class="form-control" style="width: 200px;" onchange="handleGDFilter(this.value)">
                    <option value="All">Tất cả trạng thái</option>
                    <option value="ChoDuyet">Chờ duyệt</option>
                    <option value="DaDuyet">Đã duyệt</option>
                    <option value="TuChoi">Từ chối</option>
                    <option value="HetHan">Hết hạn</option>
                    <option value="HoanThanh">Hoàn thành</option>
                    <option value="DaHuy">Đã hủy</option>
                </select>
            </div>

            <div class="table-responsive" style="min-height: 350px;">
                <table class="admin-table">
                    <thead style="background: #F8FAFC;">
                        <tr>
                            <th>Khách Hàng</th>
                            <th>Thông tin Giải đấu</th>
                            <th>Lịch đá</th>
                            <th>Ngày nộp</th>
                            <th>Trạng thái</th>
                            <th>Hành động</th>
                        </tr>
                    </thead>
                    <tbody id="giaidau-table-body">
                        <tr><td colspan="6" class="text-center" style="text-align:center;">Đang tải dữ liệu...</td></tr>
                    </tbody>
                </table>
            </div>

            <!-- Vùng hiển thị nút Phân trang -->
            <div id="gd-pagination" style="display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 15px; margin-bottom: 15px; padding-top: 15px; border-top: 1px solid var(--border);"></div>
        </div>

        <!-- Modal Xác nhận (Thay thế confirm() mặc định của trình duyệt) -->
        <div id="gd-confirm-modal" class="modal-overlay" style="display: none; z-index: 9999;">
            <div class="modal-content" style="max-width: 400px; text-align: center; padding: 30px 20px;">
                <div style="font-size: 3.5rem; color: #f59e0b; margin-bottom: 15px;"><i class="fa-solid fa-circle-exclamation"></i></div>
                <h3 id="gd-confirm-title" style="margin-bottom: 10px; font-size: 1.4rem;">Xác nhận</h3>
                <p id="gd-confirm-msg" style="color: var(--text-muted); margin-bottom: 15px; line-height: 1.5;"></p>
                
                <div id="gd-reason-container" style="display: none; margin-bottom: 20px; text-align: left;">
                    <label style="font-size: 0.9rem; font-weight: 600; color: var(--text-dark); margin-bottom: 8px; display: block;">Lý do từ chối <span style="color: red;">*</span></label>
                    <textarea id="gd-reject-reason" class="form-control" rows="3" placeholder="Nhập lý do từ chối giải đấu này..." style="width: 100%; resize: none;" oninput="document.getElementById('gd-reason-error').style.display='none'"></textarea>
                    <div id="gd-reason-error" style="color: #ef4444; font-size: 0.85rem; margin-top: 8px; display: none;"><i class="fa-solid fa-circle-exclamation"></i> Vui lòng nhập lý do từ chối!</div>
                </div>

                <div style="display: flex; justify-content: center; gap: 12px;">
                    <button class="btn-outline" style="width: auto; padding: 10px 24px;" onclick="closeGDConfirmModal()">Hủy bỏ</button>
                    <button id="gd-confirm-btn" class="btn-primary" style="width: auto; padding: 10px 24px;" onclick="executeCapNhatTrangThai()">Đồng ý</button>
                </div>
            </div>
        </div>
    `;

    // 3. Gọi API lấy toàn bộ dữ liệu 1 lần
    loadDanhSachGiaiDauAdmin();
}

function handleGDDate(val) { currentGDDate = val; currentGDPage = 1; applyGDFiltersAndRender(); }

// ----------------------------------------------------
// HIỂN THỊ THÔNG BÁO TÙY CHỈNH
// ----------------------------------------------------
function showGDAlert(message, isSuccess) {
    const alertBox = document.getElementById('giaidau-alert');
    alertBox.textContent = message;
    alertBox.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alertBox.style.display = 'block';
    setTimeout(() => { alertBox.style.display = 'none'; }, 3000);
}

// ----------------------------------------------------
// GỌI API VÀ LỌC/PHÂN TRANG DỮ LIỆU
// ----------------------------------------------------
async function loadDanhSachGiaiDauAdmin() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/giai-dau`);
        const res = await response.json();
        
        if (res.success) {
            allGiaiDauData = res.data || [];
            applyGDFiltersAndRender(); // Tiến hành lọc và vẽ bảng
        } else {
            showGDAlert(res.message || 'Lỗi tải dữ liệu', false);
        }
    } catch (error) {
        document.getElementById('giaidau-table-body').innerHTML = `<tr><td colspan="6" class="text-center text-danger">Lỗi kết nối máy chủ!</td></tr>`;
    }
}

// Hàm ghi nhận gõ phím tìm kiếm
function handleGDSearch(value) {
    currentGDSearch = value.toLowerCase().trim();
    currentGDPage = 1; // Về trang 1 khi tìm kiếm
    applyGDFiltersAndRender();
}

// Hàm ghi nhận đổi bộ lọc trạng thái
function handleGDFilter(value) {
    currentGDFilter = value;
    currentGDPage = 1; // Về trang 1 khi lọc
    applyGDFiltersAndRender();
}

function applyGDFiltersAndRender() {
    // 1. Tính tổng số yêu cầu "Chờ duyệt" (Tính trên tổng data gốc)
    const totalPending = allGiaiDauData.filter(item => item.TrangThai === 'ChoDuyet').length;
    document.getElementById('gd-pending-count').innerText = totalPending;

    // 2. Lọc dữ liệu theo Trạng thái và Từ khóa
    let filteredData = allGiaiDauData.filter(item => {
        // Lọc trạng thái
        const matchStatus = (currentGDFilter === 'All' || item.TrangThai === currentGDFilter);
        
        // Lọc tìm kiếm
        const tenGiai = item.TenGiaiDau ? item.TenGiaiDau.toLowerCase() : '';
        const tenSan = item.cum_san ? item.cum_san.TenCumSan.toLowerCase() : '';
        const tenKhach = item.nguoi_dung ? item.nguoi_dung.HoTen.toLowerCase() : '';
        const matchSearch = tenGiai.includes(currentGDSearch) || tenSan.includes(currentGDSearch) || tenKhach.includes(currentGDSearch);
        const txDate = item.NgayTao ? item.NgayTao.substring(0, 10) : '';
        const matchDate = currentGDDate ? (txDate === currentGDDate) : true;
        return matchStatus && matchSearch && matchDate;
    });

    // 3. Tính toán phân trang
    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / itemsPerGDPage) || 1;
    if (currentGDPage > totalPages) currentGDPage = totalPages;

    const startIdx = (currentGDPage - 1) * itemsPerGDPage;
    const pageData = filteredData.slice(startIdx, startIdx + itemsPerGDPage);

    // 4. Render Bảng và Nút phân trang
    renderGDTable(pageData);
    renderGDPagination(totalPages);
}

function renderGDTable(data) {
    const tbody = document.getElementById('giaidau-table-body');
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="text-align: center; padding: 40px;">Không tìm thấy dữ liệu phù hợp.</td></tr>`;
        return;
    }

    const statusTextMap = {
        'ChoDuyet': 'Chờ duyệt',
        'DaDuyet': 'Đã duyệt',
        'TuChoi': 'Từ chối',
        'HetHan': 'Hết hạn',
        'HoanThanh': 'Hoàn thành',
        'DaHuy': 'Đã hủy'
    };

    tbody.innerHTML = data.map(item => {
        let badgeColor = '#6b7280', badgeBg = '#f3f4f6'; // Mặc định (Trắng xám)
        if(item.TrangThai === 'ChoDuyet') { badgeColor = '#b45309'; badgeBg = '#fef3c7'; } // Vàng cam
        else if(item.TrangThai === 'DaDuyet') { badgeColor = '#047857'; badgeBg = '#d1fae5'; } // Xanh lá
        else if(item.TrangThai === 'TuChoi') { badgeColor = '#b91c1c'; badgeBg = '#fee2e2'; } // Đỏ nhạt
        else if(item.TrangThai === 'DaHuy') { badgeColor = '#7f1d1d'; badgeBg = '#fca5a5'; } // Đỏ đậm
        else if(item.TrangThai === 'HoanThanh') { badgeColor = '#1d4ed8'; badgeBg = '#dbeafe'; } // Xanh dương
        else if(item.TrangThai === 'HetHan') { badgeColor = '#475569'; badgeBg = '#e2e8f0'; } // Xám đậm

        const viStatus = statusTextMap[item.TrangThai] || item.TrangThai;
        
        const badgeHtml = `<span style="padding: 6px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; background: ${badgeBg}; color: ${badgeColor}; display: inline-block; text-align: center; min-width: 90px; white-space: nowrap;">${viStatus}</span>`;

        // Hành động Mở Modal thay vì gọi thẳng hàm
        let actionHtml = '';
        if (item.TrangThai === 'ChoDuyet') {
            actionHtml = `
                <button class="btn-outline-sm" style="color: #2563eb; border-color: #bfdbfe; background: #eff6ff; margin-right: 5px; margin-bottom: 5px; text-align: center; width: 95%;" onclick="openMaTranLichModal('${item.ID}')"><i class="fa-regular fa-calendar-days"></i> Kiểm tra Lịch</button>
                <br>
                <button class="btn-outline-sm" style="color: #047857; border-color: #047857;" onclick="openGDConfirmModal('${item.ID}', 'DaDuyet')"><i class="fa-solid fa-check"></i> Duyệt</button>
                <button class="btn-outline-sm" style="color: #b91c1c; border-color: #b91c1c; margin-left: 5px;" onclick="openGDConfirmModal('${item.ID}', 'TuChoi')"><i class="fa-solid fa-xmark"></i> Từ chối</button>
            `;
        } else {
            actionHtml = `<span style="color: var(--text-muted); font-size: 0.85rem;">Không có hành động</span>`;
        }

        return `
            <tr>
                <td>
                    <strong style="color: var(--text-dark);">${item.nguoi_dung ? item.nguoi_dung.HoTen : 'N/A'}</strong><br>
                    <span style="font-size: 0.85rem; color: var(--text-muted);">${item.nguoi_dung ? item.nguoi_dung.SoDienThoai : ''}</span>
                </td>
                <td>
                    <strong style="color: var(--primary);">${item.TenGiaiDau}</strong><br>
                    <span style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-solid fa-location-dot"></i> ${item.cum_san ? item.cum_san.TenCumSan : 'N/A'}</span>
                </td>
                <td>
                    <span style="font-size: 0.9rem;">${item.NgayBatDau}</span><br>
                    <span style="font-size: 0.9rem; color: var(--text-muted);">đến ${item.NgayKetThuc}</span>
                </td>
                <td>${item.NgayTao ? item.NgayTao.substring(0,10) : 'N/A'}</td>
                <td>${badgeHtml}</td>
                <td>${actionHtml}</td>
            </tr>
        `;
    }).join('');
}

function renderGDPagination(totalPages) {
    const paginationDiv = document.getElementById('gd-pagination');
    if (totalPages <= 1) return paginationDiv.innerHTML = '';

    let html = `<button class="btn-outline-sm" ${currentGDPage === 1 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''} onclick="changeGDPage(${currentGDPage - 1})" style="padding: 6px 12px; border-color: var(--border); color: var(--text-dark);"><i class="fa-solid fa-chevron-left"></i></button>`;

    // Thuật toán tính toán mảng phân trang
    const getPages = (current, total) => {
        if (total <= 6) return Array.from({length: total}, (_, i) => i + 1);
        if (current <= 3) return [1, 2, 3, 4, '...', total];
        if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
        return [1, '...', current - 1, current, current + 1, '...', total];
    };

    getPages(currentGDPage, totalPages).forEach(i => {
        if (i === '...') {
            html += `<span style="padding: 6px 10px; color: var(--text-muted); font-weight: bold;">...</span>`;
        } else {
            const btnClass = i === currentGDPage ? 'btn-primary' : 'btn-outline-sm';
            const style = i === currentGDPage ? 'padding: 6px 14px;' : 'padding: 6px 14px; border-color: var(--border); color: var(--text-dark);';
            html += `<button class="${btnClass}" style="${style}" onclick="changeGDPage(${i})">${i}</button>`;
        }
    });

    html += `<button class="btn-outline-sm" ${currentGDPage === totalPages ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''} onclick="changeGDPage(${currentGDPage + 1})" style="padding: 6px 12px; border-color: var(--border); color: var(--text-dark);"><i class="fa-solid fa-chevron-right"></i></button>`;

    paginationDiv.innerHTML = html;
}

function changeGDPage(page) {
    currentGDPage = page;
    applyGDFiltersAndRender();
}

// ----------------------------------------------------
// LOGIC MODAL XÁC NHẬN VÀ GỌI API
// ----------------------------------------------------
function openGDConfirmModal(id, trangThaiMoi) {
    pendingActionId = id;
    pendingActionStatus = trangThaiMoi;
    
    const isApprove = (trangThaiMoi === 'DaDuyet');
    
    // Đổi Tiêu đề, Lời nhắn và Màu Nút
    document.getElementById('gd-confirm-title').innerText = isApprove ? 'Duyệt Giải Đấu' : 'Từ Chối Giải Đấu';
    document.getElementById('gd-confirm-msg').innerHTML = isApprove 
        ? 'Bạn có chắc chắn muốn <strong style="color: #047857;">DUYỆT</strong> yêu cầu tổ chức giải đấu này không?' 
        : 'Bạn có chắc chắn muốn <strong style="color: #ef4444;">TỪ CHỐI</strong> yêu cầu tổ chức giải đấu này không?';
    
    const btnConfirm = document.getElementById('gd-confirm-btn');
    btnConfirm.style.backgroundColor = isApprove ? 'var(--primary)' : '#ef4444'; // Xanh lá hoặc Đỏ
    btnConfirm.style.borderColor = isApprove ? 'var(--primary)' : '#ef4444';

    document.getElementById('gd-reason-container').style.display = isApprove ? 'none' : 'block';
    document.getElementById('gd-reject-reason').value = '';
    document.getElementById('gd-reason-error').style.display = 'none';
    document.getElementById('gd-confirm-modal').style.display = 'flex';
}

function closeGDConfirmModal() {
    document.getElementById('gd-confirm-modal').style.display = 'none';
    pendingActionId = null;
    pendingActionStatus = null;
}

async function executeCapNhatTrangThai() {
    if (!pendingActionId || !pendingActionStatus) return;

    let lyDoHuy = null;
    if (pendingActionStatus === 'TuChoi') {
        lyDoHuy = document.getElementById('gd-reject-reason').value.trim();
        if (!lyDoHuy) {
            document.getElementById('gd-reason-error').style.display = 'block';
            document.getElementById('gd-reject-reason').focus();
            return;
        }
    }
    
    const btn = document.getElementById('gd-confirm-btn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/admin/giai-dau/${pendingActionId}/xu-ly`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ trang_thai: pendingActionStatus, ly_do_huy: lyDoHuy })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showGDAlert('Xử lý yêu cầu thành công!', true);
            closeGDConfirmModal();
            loadDanhSachGiaiDauAdmin(); // Reset lại toàn bộ data mới từ Server
        } else {
            showGDAlert(data.message || 'Có lỗi xảy ra!', false);
            closeGDConfirmModal();
        }
    } catch (error) {
        showGDAlert('Lỗi kết nối máy chủ!', false);
        closeGDConfirmModal();
    } finally {
        btn.innerHTML = 'Đồng ý';
        btn.disabled = false;
    }
}

// ======================================================
// HIỂN THỊ MA TRẬN LỊCH SÂN (KIỂM TRA TRƯỚC KHI DUYỆT)
// ======================================================
let maTranDataCache = null; // Lưu cache để chuyển tab không bị gọi lại API

async function openMaTranLichModal(giaiDauId) {
    // 1. Khởi tạo Modal nếu chưa có
    let modal = document.getElementById('ma-tran-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ma-tran-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 9999;';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px; width: 90%; padding: 0; overflow: hidden; border-radius: 12px;">
                <div class="modal-header" style="padding: 20px 24px; background: #F8FAFC; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 1.25rem; color: var(--primary);"><i class="fa-solid fa-table-cells"></i> Ma trận Lịch Cụm Sân</h3>
                    <i class="fa-solid fa-xmark" style="cursor: pointer; font-size: 1.2rem; color: var(--text-muted);" onclick="document.getElementById('ma-tran-modal').style.display='none'"></i>
                </div>
                
                <div id="ma-tran-loading" style="padding: 50px; text-align: center; color: var(--primary);">
                    <i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem;"></i><br><br>Đang tải dữ liệu lịch...
                </div>

                <div id="ma-tran-content" style="display: none; padding: 20px 24px;">
                    <!-- Thanh Tab Ngày -->
                    <div id="ma-tran-tabs" style="display: flex; gap: 10px; overflow-x: auto; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0; margin-bottom: 20px; scrollbar-width: thin;">
                    </div>

                    <!-- Bảng Ma trận -->
                    <div class="table-responsive" style="max-height: 50vh; overflow-y: auto; overflow-x: auto; border: 1px solid var(--border); border-radius: 8px;">
                        <table class="admin-table" style="min-width: max-content; margin: 0; border: none;">
                            <thead id="ma-tran-thead"></thead>
                            <tbody id="ma-tran-tbody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    modal.style.display = 'flex';
    document.getElementById('ma-tran-loading').style.display = 'block';
    document.getElementById('ma-tran-content').style.display = 'none';

    try {
        // 2. Fetch Data
        const response = await fetch(`${API_BASE_URL}/admin/giai-dau/${giaiDauId}/ma-tran`);
        const res = await response.json();

        if (!res.success) {
            document.getElementById('ma-tran-loading').innerHTML = `<span style="color: red;">${res.message}</span>`;
            return;
        }

        maTranDataCache = res;

        // 3. Tính toán dải ngày (Từ Ngày Bắt Đầu -> Ngày Kết Thúc)
        const dStart = new Date(res.giai_dau.NgayBatDau);
        const dEnd = new Date(res.giai_dau.NgayKetThuc);
        const dateArray = [];

        // Vòng lặp +1 ngày cho đến khi bằng dEnd
        for (let d = new Date(dStart); d <= dEnd; d.setDate(d.getDate() + 1)) {
            const pad = n => n < 10 ? '0' + n : n;
            const yyyy = d.getFullYear();
            const mm = pad(d.getMonth() + 1);
            const dd = pad(d.getDate());
            
            dateArray.push({
                dbFormat: `${yyyy}-${mm}-${dd}`,
                displayFormat: `${dd}/${mm}` // Chỉ hiện Ngày/Tháng trên Tab cho gọn
            });
        }

        // 4. Sinh các Tabs và tính toán tỷ lệ Đỏ/Trắng
        const totalSlotsPerDay = res.san_bongs.length * res.khung_gios.length;
        let tabsHtml = '';

        dateArray.forEach((date, index) => {
            // Đếm xem ngày này có bao nhiêu slot đã bị đặt
            const bookedCount = res.dat_sans.filter(ds => ds.NgayDa === date.dbFormat).length;
            const bookingRate = totalSlotsPerDay > 0 ? (bookedCount / totalSlotsPerDay) * 100 : 0;
            
            // Nếu sân đã bị đặt >= 50%, tô viền đỏ và icon cảnh báo
            let btnStyle = `padding: 8px 20px; border-radius: 20px; font-weight: 600; cursor: pointer; white-space: nowrap; border: 1px solid #cbd5e1; background: white; color: #64748b;`;
            let iconHtml = '';
            
            if (bookingRate >= 50) {
                btnStyle = `padding: 8px 20px; border-radius: 20px; font-weight: 600; cursor: pointer; white-space: nowrap; border: 1px solid #fca5a5; background: #fef2f2; color: #ef4444;`;
                iconHtml = `<i class="fa-solid fa-triangle-exclamation" style="margin-right: 5px;"></i>`;
            }

            tabsHtml += `<button class="ma-tran-tab-btn" data-date="${date.dbFormat}" style="${btnStyle}" onclick="renderMaTranTab('${date.dbFormat}', this)">${iconHtml}${date.displayFormat}</button>`;
        });

        document.getElementById('ma-tran-tabs').innerHTML = tabsHtml;

        // 5. Ẩn Loading, Hiện Content
        document.getElementById('ma-tran-loading').style.display = 'none';
        document.getElementById('ma-tran-content').style.display = 'block';

        // Tự động click vào Tab đầu tiên (Ngày khai mạc)
        const firstTab = document.querySelector('.ma-tran-tab-btn');
        if (firstTab) firstTab.click();

    } catch (e) {
        document.getElementById('ma-tran-loading').innerHTML = `<span style="color: red;">Lỗi tải dữ liệu máy chủ!</span>`;
    }
}

// Render dữ liệu ma trận khi click vào 1 Tab Ngày cụ thể
function renderMaTranTab(dateDbFormat, btnElement) {
    // 1. Xử lý Active/Inactive cho các nút Tab
    document.querySelectorAll('.ma-tran-tab-btn').forEach(btn => {
        // Reset về giao diện mờ (opacity) nếu không được chọn
        btn.style.opacity = '0.5'; 
        btn.style.boxShadow = 'none';
    });
    btnElement.style.opacity = '1';
    btnElement.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';

    const data = maTranDataCache;

    // 2. Vẽ Tiêu đề cột (Tên các Sân bóng)
    let theadHtml = `<tr>
        <th style="background: #e2e8f0; position: sticky; left: 0; z-index: 2; width: 120px; text-align: center;">KHUNG GIỜ</th>`;
    data.san_bongs.forEach(sb => {
        theadHtml += `<th style="background: #f8fafc; text-align: center; border-left: 1px solid #e2e8f0;">${sb.TenSan}</th>`;
    });
    theadHtml += `</tr>`;
    document.getElementById('ma-tran-thead').innerHTML = theadHtml;

    // 3. Vẽ Dữ liệu hàng (Khung giờ) và Cột (Trạng thái đặt)
    let tbodyHtml = '';
    data.khung_gios.forEach(kg => {
        const timeStr = `${kg.GioBatDau.substring(0,5)} - ${kg.GioKetThuc.substring(0,5)}`;
        tbodyHtml += `<tr>
            <td style="background: #f8fafc; position: sticky; left: 0; font-weight: bold; text-align: center; color: var(--primary); border-right: 2px solid #e2e8f0;">${timeStr}</td>`;
        
        // Quét từng sân xem ở khung giờ này, ngày này đã bị đặt chưa
        data.san_bongs.forEach(sb => {
            const isBooked = data.dat_sans.some(ds => ds.NgayDa === dateDbFormat && ds.ID_KhungGio === kg.ID && ds.ID_SanBong === sb.ID);
            
            if (isBooked) {
                tbodyHtml += `<td style="background: #fee2e2; color: #b91c1c; text-align: center; font-size: 0.85rem; border-left: 1px solid #e2e8f0;"><i class="fa-solid fa-lock"></i> Đã kẹt</td>`;
            } else {
                tbodyHtml += `<td style="background: #fff; color: #10b981; text-align: center; font-size: 0.85rem; border-left: 1px solid #e2e8f0;"><i class="fa-solid fa-check"></i> Trống</td>`;
            }
        });
        tbodyHtml += `</tr>`;
    });
    
    document.getElementById('ma-tran-tbody').innerHTML = tbodyHtml;
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
// MODULE: ADMIN - QUẢN LÝ LỊCH ĐẶT SÂN
// ======================================================
let allDatSanData = [];
let currentDSPage = 1;
const itemsPerDSPage = 8;
let currentDSFilter = 'DaCoc';
let currentDSDate = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10); // Mặc định hiển thị ngày hôm nay
let currentDSSearch = '';

function renderQuanLyDatSan(defaultStatus = 'DaCoc', defaultDate = null) {
    currentDSPage = 1; currentDSFilter = defaultStatus; currentDSSearch = ''; 

    if (defaultDate !== null) {
        currentDSDate = defaultDate;
    } else {
        currentDSDate = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10);
    }

    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = Array.from(document.querySelectorAll('.sidebar-nav a')).find(a => a.textContent.includes('QUẢN LÝ ĐẶT SÂN'));
    if (menuLink) menuLink.classList.add('active');

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="margin-bottom: 24px;">
            <h1 class="page-title">Quản lý Lịch Đặt Sân</h1>
            <p class="text-muted">Chốt trạng thái khách đến sân cho ngày hôm nay.</p>
        </div>

        <div id="datsan-alert" class="modal-alert" style="display: none; margin-bottom: 16px;"></div>

        <div class="panel">
            <div style="display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap;">
                <div style="position: relative; flex: 1; min-width: 250px;">
                    <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 12px; top: 12px; color: var(--text-muted);"></i>
                    <input type="text" id="ds-search-input" class="form-control" style="padding-left: 35px;" placeholder="Tìm Mã vé (PT-..., GD-...), SĐT, Tên khách..." oninput="handleDSSearch(this.value)">
                </div>
                <button type="button" class="btn-primary" style="display: inline-flex; align-items: center; gap: 8px; padding: 0 18px; background: #0f172a; border-color: #0f172a; white-space: nowrap;" onclick="openAdminQrScannerModal()">
                    <i class="fa-solid fa-qrcode"></i> Quét mã vé
                </button>
                <input type="date" class="form-control" style="width: 150px;" id="ds-date-input" onchange="handleDSDate(this.value)">
                <select class="form-control" id="ds-status-select" style="width: 180px;" onchange="handleDSFilter(this.value)">
                    <option value="All" ${defaultStatus === 'All' ? 'selected' : ''}>Tất cả trạng thái</option>
                    <option value="DaCoc" ${defaultStatus === 'DaCoc' ? 'selected' : ''}>Đã cọc</option>
                    <option value="HoanThanh" ${defaultStatus === 'HoanThanh' ? 'selected' : ''}>Hoàn thành</option>
                    <option value="DaHuy" ${defaultStatus === 'DaHuy' ? 'selected' : ''}>Đã hủy</option>
                    <option value="KhongDen" ${defaultStatus === 'KhongDen' ? 'selected' : ''}>Không đến</option>
                </select>                
            </div>

            <div class="table-responsive" style="min-height: 350px;">
                <table class="admin-table">
                    <thead style="background: #F8FAFC;">
                        <tr>
                            <th style="text-align: center; width: 100px; white-space: nowrap;">Mã vé</th>
                            <th>Khách hàng</th>
                            <th>Thông tin Sân</th>
                            <th>Khung giờ</th>
                            <th>Giá sân / Cọc</th>
                            <th>Trạng thái</th>
                            <th style="text-align: center;">Chốt sân</th>
                        </tr>
                    </thead>
                    <tbody id="datsan-table-body">
                        <tr><td colspan="7" class="text-center" style="text-align: center;">Đang tải dữ liệu...</td></tr>
                    </tbody>
                </table>
            </div>
            <div id="ds-pagination" style="display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 15px; margin-bottom: 15px; padding-top: 15px; border-top: 1px solid var(--border);"></div>
        </div>
    `;

    document.getElementById('ds-date-input').value = currentDSDate;
    loadDanhSachDatSanAdmin();
}

function showDSAlert(message, isSuccess) {
    const alertBox = document.getElementById('datsan-alert');
    alertBox.textContent = message; 
    alertBox.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alertBox.style.display = 'block'; 
    setTimeout(() => alertBox.style.display = 'none', 3000);
}

function handleDSSearch(val) { currentDSSearch = val.toLowerCase().trim(); currentDSPage = 1; applyDSFiltersAndRender(); }
function handleDSDate(val) { currentDSDate = val; currentDSPage = 1; applyDSFiltersAndRender(); }
function handleDSFilter(val) { currentDSFilter = val; currentDSPage = 1; applyDSFiltersAndRender(); }

async function loadDanhSachDatSanAdmin() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/dat-san`);
        const res = await response.json();
        if (res.success) { allDatSanData = res.data || []; applyDSFiltersAndRender(); }
    } catch (error) { showDSAlert('Lỗi kết nối máy chủ.', false); }
}

// Hàm tạo toàn bộ các biến thể mã vé (mới & cũ) của 1 dòng Đặt sân để tìm kiếm bất chấp định dạng
function getBookingCodeVariants(item) {
    const rawId = String(item.MaDatSan || item.ID || '').toUpperCase().trim();
    const rawGiaiId = String(item.MaGiaiDau || item.ID_GiaiDau || '').toUpperCase().trim();
    const numId = rawId.replace(/\D/g, '').replace(/^0+/, '') || '0';
    const paddedId = numId.padStart(3, '0');

    const variants = [
        rawId.toLowerCase(),
        `pt-${rawId}`.toLowerCase(),
        `#pt-${rawId}`.toLowerCase(),
        `pt-${numId}`.toLowerCase(),
        `#pt-${numId}`.toLowerCase(),
        `pt-ds${numId}`.toLowerCase(),
        `pt-ds${paddedId}`.toLowerCase(),
        `ds${numId}`.toLowerCase(),
        `ds${paddedId}`.toLowerCase()
    ];

    if (rawGiaiId) {
        const numGiai = rawGiaiId.replace(/\D/g, '').replace(/^0+/, '') || '0';
        const paddedGiai = numGiai.padStart(3, '0');
        variants.push(
            rawGiaiId.toLowerCase(),
            `gd-${rawGiaiId}`.toLowerCase(),
            `#gd-${rawGiaiId}`.toLowerCase(),
            `gd-${numGiai}`.toLowerCase(),
            `#gd-${numGiai}`.toLowerCase(),
            `gd-gdau${numGiai}`.toLowerCase(),
            `gd-gdau${paddedGiai}`.toLowerCase(),
            `gdau${numGiai}`.toLowerCase(),
            `gdau${paddedGiai}`.toLowerCase()
        );
    }

    if (item.MaHoaDonDatSan) {
        variants.push(String(item.MaHoaDonDatSan).toLowerCase(), `#${item.MaHoaDonDatSan}`.toLowerCase());
    }

    return variants;
}

function applyDSFiltersAndRender() {
    const searchTerm = currentDSSearch.toLowerCase().trim().replace(/^#/, '');

    let filteredData = allDatSanData.filter(item => {
        const matchStatus = (currentDSFilter === 'All' || item.TrangThai === currentDSFilter);

        // Kiểm tra khớp mã vé (Hỗ trợ cả PT-DS100, PT-100, DS100, GD-GDAU011, GD-GDAU11, GD-11...)
        const codeVariants = getBookingCodeVariants(item);
        const matchCode = searchTerm !== '' && codeVariants.some(v => v.includes(searchTerm));

        const sdt = item.ID_NguoiDung ? (item.nguoi_dung?.SoDienThoai?.toLowerCase() || '') : (item.SDTKhachVangLai?.toLowerCase() || '');
        const tenKhach = item.ID_NguoiDung ? (item.nguoi_dung?.HoTen?.toLowerCase() || '') : (item.TenKhachVangLai?.toLowerCase() || '');
        const tenSan = item.san_bong ? item.san_bong.TenSan.toLowerCase() : '';
        const cumSan = (item.san_bong && item.san_bong.cum_san) ? item.san_bong.cum_san.TenCumSan.toLowerCase() : '';
        const tenGiai = (item.ID_GiaiDau !== null && item.giai_dau) ? item.giai_dau.TenGiaiDau.toLowerCase() : '';

        const matchSearch = searchTerm === ''
                        || matchCode
                        || sdt.includes(searchTerm) 
                        || tenKhach.includes(searchTerm) 
                        || tenSan.includes(searchTerm)
                        || cumSan.includes(searchTerm)
                        || tenGiai.includes(searchTerm);
        
        // Lọc ngày chính xác
        const matchDate = currentDSDate ? (item.NgayDa === currentDSDate) : true;
        
        return matchStatus && matchSearch && matchDate;
    });

    const totalPages = Math.ceil(filteredData.length / itemsPerDSPage) || 1;
    if (currentDSPage > totalPages) currentDSPage = totalPages;
    const startIdx = (currentDSPage - 1) * itemsPerDSPage;
    
    renderDSTable(filteredData.slice(startIdx, startIdx + itemsPerDSPage));
    renderDSPagination(totalPages);
}

function renderDSTable(data) {
    const tbody = document.getElementById('datsan-table-body');
    if (data.length === 0) return tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="text-align: center; padding: 40px;">Không có dữ liệu.</td></tr>`;

    // Gom nhóm theo MaHoaDonDatSan trên trang hiện tại
    const invoiceGroups = {};
    data.forEach(item => {
        const key = item.MaHoaDonDatSan || ('LE_' + item.ID);
        if (!invoiceGroups[key]) {
            invoiceGroups[key] = {
                maHoaDon: item.MaHoaDonDatSan || null,
                hoaDonObj: item.hoa_don_dat_san || item.hoaDonDatSan || null,
                items: []
            };
        }
        invoiceGroups[key].items.push(item);
    });

    let html = '';

    Object.values(invoiceGroups).forEach(group => {
        const first = group.items[0];
        const tenKhach = first.ID_NguoiDung ? (first.nguoi_dung?.HoTen || 'N/A') : (first.TenKhachVangLai || 'N/A');
        const sdtKhach = first.ID_NguoiDung ? (first.nguoi_dung?.SoDienThoai || '') : (first.SDTKhachVangLai || '');
        const isMember = Boolean(first.ID_NguoiDung);

        const allMatchesInInvoice = group.maHoaDon
            ? allDatSanData.filter(d => d.MaHoaDonDatSan === group.maHoaDon)
            : group.items;

        const activeDaCocCount = allMatchesInInvoice.filter(d => d.TrangThai === 'DaCoc').length;
        const hdObj = group.hoaDonObj;
        const tongHD = hdObj ? Number(hdObj.TongTien ?? hdObj.TongTienSan) : allMatchesInInvoice.reduce((s, d) => s + Number(d.TongTien), 0);
        const cocHD = hdObj ? Number(hdObj.TienDaCoc) : allMatchesInInvoice.reduce((s, d) => s + Number(d.TienCoc), 0);
        const conPhaiThuHD = (hdObj && hdObj.TrangThai === 'DaHuy') ? 0 : Math.max(0, tongHD - cocHD);

        // Vẽ thanh Header của Hóa Đơn Đặt Sân (Hiển thị rõ Tổng HĐ, Đã cọc và Còn phải thu)
        if (group.maHoaDon) {
            html += `
                <tr style="background: #f0fdf4; border-top: 2px solid #86efac; border-bottom: 1px solid #bbf7d0;">
                    <td colspan="7" style="padding: 10px 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                                <span style="background: #0b5d3b; color: #fff; font-family: monospace; font-weight: 700; padding: 4px 10px; border-radius: 6px; font-size: 0.88rem;">
                                    <i class="fa-solid fa-file-invoice-dollar"></i> Hóa đơn #${group.maHoaDon}
                                </span>
                                <span style="font-size: 0.88rem; color: #0f172a;">Khách: <strong>${tenKhach}</strong> (${sdtKhach})</span>
                                <span style="font-size: 0.84rem; color: #475569;">
                                    &bull; Tổng HĐ (${allMatchesInInvoice.length} trận): <strong style="color:#0f172a;">${tongHD.toLocaleString('vi-VN')}đ</strong> 
                                    | Đã cọc: <strong style="color:#047857;">${cocHD.toLocaleString('vi-VN')}đ</strong>
                                    | Còn phải thu: <strong style="color:#ea580c; font-size:0.92rem; background:#fff7ed; padding:2px 8px; border-radius:6px; border:1px solid #fed7aa;">${conPhaiThuHD.toLocaleString('vi-VN')}đ</strong>
                                </span>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <button type="button" class="btn-outline-sm" style="background: #fff; color: #2563eb; border-color: #93c5fd; padding: 5px 11px; font-size: 0.8rem; font-weight: 700;" onclick="printAdminBookingInvoice('${group.maHoaDon}')">
                                    <i class="fa-solid fa-print"></i> Xuất hóa đơn
                                </button>
                                ${activeDaCocCount > 0 ? `
                                <button type="button" class="btn-outline-sm" style="background: #fef2f2; color: #dc2626; border-color: #fca5a5; padding: 5px 11px; font-size: 0.8rem; font-weight: 700;" onclick="openAdminCancelInvoiceModal('${group.maHoaDon}', ${activeDaCocCount}, ${isMember}, '${tenKhach.replace(/'/g, "\\'")}', '${first.EmailKhachVangLai || ''}', ${cocHD})">
                                    <i class="fa-solid fa-ban"></i> Hủy cả hóa đơn (${activeDaCocCount} trận)
                                </button>` : ''}
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }

        // Vẽ các dòng trận đấu thuộc hóa đơn
        group.items.forEach(item => {
            let badgeColor = '#6b7280', badgeBg = '#f3f4f6', viStatus = item.TrangThai;
            if(item.TrangThai === 'DaCoc') { badgeColor = '#b45309'; badgeBg = '#fef3c7'; viStatus = 'Đã cọc'; }
            else if(item.TrangThai === 'DaHuy') { badgeColor = '#b91c1c'; badgeBg = '#fee2e2'; viStatus = 'Đã hủy'; }
            else if(item.TrangThai === 'HoanThanh') { badgeColor = '#047857'; badgeBg = '#d1fae5'; viStatus = 'Hoàn thành'; }
            else if(item.TrangThai === 'KhongDen') { badgeColor = '#6b7280'; badgeBg = '#f3f4f6'; viStatus = 'Không đến'; }

            const badgeHtml = `<span style="padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; background: ${badgeBg}; color: ${badgeColor}; white-space: nowrap;">${viStatus}</span>`;
            const maVeDisplay = item.ID_GiaiDau ? `GD-${item.ID_GiaiDau}` : `PT-${item.ID}`;
            const badgeClassVe = item.ID_GiaiDau 
                ? 'background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe;' 
                : 'background: #f8fafc; color: #475569; border: 1px solid #e2e8f0;';        
            const isGiaiDau = item.ID_GiaiDau !== null;
            const tenGiaiDau = isGiaiDau && item.giai_dau ? item.giai_dau.TenGiaiDau : '';
            const tagLoai = isGiaiDau 
                ? `<span style="font-size: 0.75rem; background: #e0e7ff; color: #4338ca; padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-trophy"></i> Giải đấu</span>` 
                : `<span style="font-size: 0.75rem; background: #f1f5f9; color: #475569; padding: 2px 6px; border-radius: 4px;">Phong trào</span>`;
            const htmlTenGiai = isGiaiDau ? `<div style="font-size: 0.85rem; color: #4338ca; margin-top: 4px; font-weight: 600;"><i class="fa-solid fa-medal"></i> ${tenGiaiDau}</div>` : '';

            const d = new Date(item.NgayDa);
            const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear()}`;
            const timeStr = item.khung_gio ? `${item.khung_gio.GioBatDau.substring(0,5)} - ${item.khung_gio.GioKetThuc.substring(0,5)}` : '';

            let actionHtml = '';
            if (item.TrangThai === 'DaCoc') {
                actionHtml = `<button class="btn-primary" style="padding: 6px 12px; font-size: 0.85rem; white-space: nowrap;" onclick="event.stopPropagation(); openDSConfirmModal('${item.ID}')">Chốt sân</button>`;
            } else {
                actionHtml = `<span style="color: var(--text-muted); font-size: 0.85rem; white-space: nowrap;">Đã xử lý</span>`;
            }

            const tenKhachHienThi = item.ID_NguoiDung ? (item.nguoi_dung?.HoTen || 'N/A') : (item.TenKhachVangLai || 'N/A');
            const sdtKhachHienThi = item.ID_NguoiDung ? (item.nguoi_dung?.SoDienThoai || '') : (item.SDTKhachVangLai || '');

            html += `<tr onclick="openBookingDetailModalAdmin('${item.ID}')" style="cursor: pointer; transition: background-color 0.15s;" onmouseover="this.style.backgroundColor='#f8fafc'" onmouseout="this.style.backgroundColor=''">
                <td style="text-align: center; padding-left: 20px;">
                    <span style="padding: 5px 10px; border-radius: 8px; font-weight: 700; font-family: monospace; font-size: 0.9rem; display: inline-block; white-space: nowrap; ${badgeClassVe}">
                        ${maVeDisplay}
                    </span>
                </td>
                <td>
                    <strong>${tenKhachHienThi}</strong><br>
                    <span style="font-size: 0.85rem; color: var(--text-muted);">${sdtKhachHienThi}</span>
                </td>
                <td>
                    <strong style="color: var(--text-dark);">${item.san_bong ? item.san_bong.TenSan : 'N/A'}</strong> ${tagLoai}<br>
                    <span style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-solid fa-location-dot"></i> ${item.san_bong?.cum_san?.TenCumSan || ''}</span>
                    ${htmlTenGiai}
                </td>
                <td>
                    <span style="font-size: 0.9rem;">Ngày: ${dateStr}</span><br>
                    <strong style="color: var(--primary);">Giờ: ${timeStr}</strong>
                </td>
                <td style="white-space: nowrap;">
                    <strong style="color: #0f172a;">${Number(item.TongTien).toLocaleString('vi-VN')}đ</strong><br>
                    <span style="font-size: 0.8rem; color: #047857; font-weight: 600;">Cọc: ${Number(item.TienCoc).toLocaleString('vi-VN')}đ</span>
                </td>
                <td>${badgeHtml}</td>
                <td style="text-align: center;">${actionHtml}</td>
            </tr>`;
        });
    });

    tbody.innerHTML = html;
}

// MODAL XEM CHI TIẾT ĐẶT SÂN (DÀNH CHO QUẢN LÝ SÂN & ADMIN)
window.openBookingDetailModalAdmin = function(id) {
    const item = allDatSanData.find(b => b.ID == id);
    if (!item) return;

    let modal = document.getElementById('admin-booking-detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-booking-detail-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 9999; align-items: center; justify-content: center;';
        modal.onclick = function(e) {
            if (e.target === modal) closeBookingDetailModalAdmin();
        };
        document.body.appendChild(modal);
    }

    // 1. Mã vé & Trạng thái
    const isGiaiDau = item.ID_GiaiDau !== null;
    const maVeDisplay = isGiaiDau ? `GD-${item.ID_GiaiDau}` : `PT-${item.ID}`;
    
    let badgeColor = '#6b7280', badgeBg = '#f3f4f6', viStatus = item.TrangThai;
    if (item.TrangThai === 'DaCoc') { badgeColor = '#b45309'; badgeBg = '#fef3c7'; viStatus = 'Đã cọc'; }
    else if (item.TrangThai === 'DaHuy') { badgeColor = '#b91c1c'; badgeBg = '#fee2e2'; viStatus = 'Đã hủy'; }
    else if (item.TrangThai === 'HoanThanh') { badgeColor = '#047857'; badgeBg = '#d1fae5'; viStatus = 'Hoàn thành'; }
    else if (item.TrangThai === 'KhongDen') { badgeColor = '#475569'; badgeBg = '#e2e8f0'; viStatus = 'Không đến'; }

    // 2. Thông tin khách hàng
    const isMember = Boolean(item.ID_NguoiDung);
    const tenKhach = isMember ? (item.nguoi_dung?.HoTen || 'N/A') : (item.TenKhachVangLai || 'N/A');
    const sdtKhach = isMember ? (item.nguoi_dung?.SoDienThoai || 'N/A') : (item.SDTKhachVangLai || 'N/A');
    const emailKhach = isMember ? (item.nguoi_dung?.Email || '') : (item.EmailKhachVangLai || '');
    const loaiKhachTag = isMember 
        ? `<span style="font-size: 0.72rem; background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; padding: 2px 8px; border-radius: 4px; font-weight: 600;">Thành viên</span>`
        : `<span style="font-size: 0.72rem; background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 4px; font-weight: 600;">Khách vãng lai</span>`;

    // 3. Thông tin sân & Ngày giờ
    const tenSan = item.san_bong ? item.san_bong.TenSan : 'N/A';
    const tenCumSan = item.san_bong?.cum_san ? item.san_bong.cum_san.TenCumSan : 'N/A';
    const loaiDatSan = isGiaiDau 
        ? `Giải đấu${item.giai_dau ? ': ' + item.giai_dau.TenGiaiDau : ''}` 
        : 'Đá phong trào';

    const d = new Date(item.NgayDa);
    const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    const timeStr = item.khung_gio ? `${item.khung_gio.GioBatDau.substring(0,5)} - ${item.khung_gio.GioKetThuc.substring(0,5)}` : 'N/A';

    // 4. Thông tin người xử lý (ID_NhanVienXuLy & Tên)
    const nvXuLyObj = item.nhan_vien_xu_ly || item.nhanVienXuLy || null;
    const nguoiXuLyHtml = item.ID_NhanVienXuLy
        ? `<strong style="color: #0f172a;">${nvXuLyObj?.HoTen || 'Nhân sự'}</strong> <span style="font-size: 0.8rem; color: #475569; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-family: monospace; border: 1px solid #e2e8f0;">ID: #${item.ID_NhanVienXuLy}</span>`
        : `<span style="color: #94a3b8; font-style: italic;">Chưa có</span>`;

    // 5. Tài chính
    const tongTien = Number(item.TongTien || 0);
    const tienCoc = Number(item.TienCoc || 0);

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 440px; width: 92%; padding: 0; border-radius: 12px; overflow: hidden; background: #fff; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.15); border: 1px solid #e2e8f0;">
            <!-- Header -->
            <div style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <h3 style="margin: 0; font-size: 1.05rem; color: #0f172a; font-weight: 700;">Chi tiết đặt sân</h3>
                    <span style="padding: 3px 8px; border-radius: 6px; font-weight: 700; font-family: monospace; font-size: 0.85rem; background: #fff; color: #334155; border: 1px solid #cbd5e1;">#${maVeDisplay}</span>
                </div>
                <button type="button" onclick="closeBookingDetailModalAdmin()" style="background: none; border: none; color: #64748b; font-size: 1.15rem; cursor: pointer; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 6px;" onmouseover="this.style.background='#e2e8f0'; this.style.color='#0f172a'" onmouseout="this.style.background='none'; this.style.color='#64748b'">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <!-- Body -->
            <div style="padding: 18px 20px; font-size: 0.9rem; color: #334155;">
                <!-- Trạng thái & Hình thức -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px dashed #e2e8f0;">
                    <span style="color: #64748b; font-size: 0.85rem;">Trạng thái vé:</span>
                    <span style="padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; background: ${badgeBg}; color: ${badgeColor};">${viStatus}</span>
                </div>

                <!-- Thông tin khách hàng -->
                <div style="margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px dashed #e2e8f0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-size: 0.78rem; font-weight: 600; color: #64748b; text-transform: uppercase;">Khách hàng</span>
                        ${loaiKhachTag}
                    </div>
                    <div style="font-weight: 700; color: #0f172a; font-size: 0.98rem; margin-bottom: 3px;">${tenKhach}</div>
                    <div style="color: #475569; font-size: 0.85rem; display: flex; flex-wrap: wrap; gap: 12px;">
                        <span><i class="fa-solid fa-phone" style="color: #94a3b8; margin-right: 4px;"></i>${sdtKhach}</span>
                        ${emailKhach && !emailKhach.endsWith('.offline') ? `<span><i class="fa-solid fa-envelope" style="color: #94a3b8; margin-right: 4px;"></i>${emailKhach}</span>` : ''}
                    </div>
                </div>

                <!-- Thông tin sân & Ngày giờ -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px;">
                    <div style="background: #f8fafc; padding: 10px 12px; border-radius: 8px; border: 1px solid #f1f5f9;">
                        <div style="font-size: 0.76rem; color: #64748b; margin-bottom: 2px;">Sân bóng</div>
                        <div style="font-weight: 700; color: #0f172a;">${tenSan}</div>
                        <div style="font-size: 0.8rem; color: #64748b; margin-top: 2px;">${tenCumSan}</div>
                    </div>
                    <div style="background: #f8fafc; padding: 10px 12px; border-radius: 8px; border: 1px solid #f1f5f9;">
                        <div style="font-size: 0.76rem; color: #64748b; margin-bottom: 2px;">Thời gian đá</div>
                        <div style="font-weight: 700; color: var(--primary);">${timeStr}</div>
                        <div style="font-size: 0.8rem; color: #0f172a; margin-top: 2px;">Ngày: ${dateStr}</div>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 0.85rem;">
                    <span style="color: #64748b;">Hình thức đặt:</span>
                    <strong style="color: #0f172a;">${loaiDatSan}</strong>
                </div>

                <!-- Thông tin người xử lý -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px dashed #e2e8f0; font-size: 0.85rem;">
                    <span style="color: #64748b;">Người xử lý:</span>
                    <div>${nguoiXuLyHtml}</div>
                </div>

                <!-- Khung thanh toán -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.86rem;">
                        <span style="color: #64748b;">Tổng tiền sân:</span>
                        <strong style="color: #0f172a;">${tongTien.toLocaleString('vi-VN')}đ</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed #cbd5e1; font-size: 0.86rem;">
                        <span style="color: #64748b;">Tiền đã cọc:</span>
                        <strong style="color: #047857;">${tienCoc.toLocaleString('vi-VN')}đ</strong>
                    </div>
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
};

window.closeBookingDetailModalAdmin = function() {
    const modal = document.getElementById('admin-booking-detail-modal');
    if (modal) modal.style.display = 'none';
};

function renderDSPagination(totalPages) {
    const div = document.getElementById('ds-pagination');
    if (totalPages <= 1) return div.innerHTML = '';
    
    let html = `<button class="btn-outline-sm" ${currentDSPage === 1 ? 'disabled style="opacity:0.5;"' : ''} onclick="currentDSPage--; applyDSFiltersAndRender()"><i class="fa-solid fa-chevron-left"></i></button>`;
    
    const getPages = (current, total) => {
        if (total <= 6) return Array.from({length: total}, (_, i) => i + 1);
        if (current <= 3) return [1, 2, 3, 4, '...', total];
        if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
        return [1, '...', current - 1, current, current + 1, '...', total];
    };

    getPages(currentDSPage, totalPages).forEach(i => {
        if (i === '...') {
            html += `<span style="padding: 6px 10px; color: var(--text-muted); font-weight: bold;">...</span>`;
        } else {
            html += `<button class="${i === currentDSPage ? 'btn-primary' : 'btn-outline-sm'}" style="padding: 6px 14px;" onclick="currentDSPage=${i}; applyDSFiltersAndRender()">${i}</button>`;
        }
    });

    html += `<button class="btn-outline-sm" ${currentDSPage === totalPages ? 'disabled style="opacity:0.5;"' : ''} onclick="currentDSPage++; applyDSFiltersAndRender()"><i class="fa-solid fa-chevron-right"></i></button>`;
    div.innerHTML = html;
}

// ----------------------------------------------------
// TẠO MODAL CHỐT SÂN VÀ GỌI API
// ----------------------------------------------------
let pendingDSId = null;

function openDSConfirmModal(id) {
    pendingDSId = id;
    let modal = document.getElementById('ds-confirm-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ds-confirm-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 9999; align-items: center; justify-content: center;';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 650px; width: 94%; text-align: center; padding: 28px 24px; border-radius: 16px;">
            <h3 style="margin-bottom: 8px; font-size: 1.35rem; font-weight: 800; color: #0f172a;">Chốt trạng thái sân</h3>
            <p style="color: #64748b; margin-bottom: 24px; line-height: 1.5; font-size: 0.94rem;">Vui lòng xác nhận trạng thái cho khách hàng này.</p>
            <div style="display: flex; justify-content: center; align-items: center; gap: 10px; flex-wrap: wrap;">
                <button type="button" onclick="closeDSConfirmModal()" style="padding: 10px 18px; border-radius: 10px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-weight: 600; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; transition: all 0.2s ease;" onmouseover="this.style.background='#f1f5f9'; this.style.borderColor='#94a3b8'; this.style.color='#0f172a';" onmouseout="this.style.background='#ffffff'; this.style.borderColor='#cbd5e1'; this.style.color='#475569';">
                    Hủy bỏ
                </button>
                <button type="button" onclick="openAdminCancelConfirmModal()" style="padding: 10px 16px; border-radius: 10px; border: 1px solid #fecaca; background: #fef2f2; color: #ef4444; font-weight: 600; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; transition: all 0.2s ease;" onmouseover="this.style.background='#fee2e2'; this.style.borderColor='#fca5a5';" onmouseout="this.style.background='#fef2f2'; this.style.borderColor='#fecaca';">
                    <i class="fa-solid fa-ban"></i> Hủy sân & Hoàn tiền
                </button>
                <button type="button" onclick="executeCapNhatDatSan('KhongDen')" style="padding: 10px 16px; border-radius: 10px; border: 1px solid #cbd5e1; background: #f8fafc; color: #475569; font-weight: 600; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; transition: all 0.2s ease;" onmouseover="this.style.background='#e2e8f0'; this.style.color='#1e293b';" onmouseout="this.style.background='#f8fafc'; this.style.color='#475569';">
                    <i class="fa-solid fa-user-slash"></i> Không đến
                </button>
                <button type="button" onclick="executeCapNhatDatSan('HoanThanh')" style="padding: 10px 20px; border-radius: 10px; border: 1px solid #10b981; background: #10b981; color: #ffffff; font-weight: 700; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; box-shadow: 0 4px 10px rgba(16, 185, 129, 0.25); transition: all 0.2s ease;" onmouseover="this.style.background='#059669'; this.style.borderColor='#059669';" onmouseout="this.style.background='#10b981'; this.style.borderColor='#10b981';">
                    <i class="fa-solid fa-check"></i> Hoàn thành
                </button>
            </div>
        </div>`;
    modal.style.display = 'flex';
}

function closeDSConfirmModal() { document.getElementById('ds-confirm-modal').style.display = 'none'; }

// Hàm nhận diện đơn đặt sân có phải được Đặt hộ (Offline) bởi Nhân viên/Quản lý/Admin không
function isOfflineBookedItem(item) {
    if (!item) return false;
    const hd = item.hoa_don_dat_san || item.hoaDonDatSan || null;
    if (hd && hd.PhuongThucThanhToan === 'TienMat') return true;
    if (item.ID_NhanVienXuLy || item.MaNhanVienXuLy) return true;
    const email = item.nguoi_dung?.Email || '';
    if (email.endsWith('.offline')) return true;
    return false;
}

window.toggleSingleCancelRefundMethod = function(prefix) {
    const method = document.querySelector(`input[name="${prefix}_refund_method"]:checked`)?.value || 'vi';
    const bankBox = document.getElementById(`${prefix}-bank-refund-box`);
    if (bankBox) {
        bankBox.style.display = (method === 'chuyen_khoan') ? 'block' : 'none';
    }
};

function openAdminCancelConfirmModal() {
    closeDSConfirmModal(); // Đóng modal chọn trạng thái hiện tại
    
    const item = allDatSanData.find(b => b.ID == pendingDSId);
    if (!item) return;

    let modal = document.getElementById('admin-cancel-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-cancel-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10000; align-items: center; justify-content: center;';
        modal.onclick = function(e) {
            if (e.target === modal) closeAdminCancelConfirmModal();
        };
        document.body.appendChild(modal);
    }

    const isMember = Boolean(item.ID_NguoiDung);
    const isOffline = isOfflineBookedItem(item);

    if (isMember) {
        const kh = item.nguoi_dung || {};
        const tenKhach = kh.HoTen || 'N/A';
        const tienCocStr = Number(item.TienCoc || 0).toLocaleString('vi-VN') + 'đ';

        // Nếu là đơn ĐẶT HỘ (Offline) -> Cho phép chọn Hoàn về Ví hoặc Hoàn bằng Chuyển khoản
        const offlineOptionsHtml = isOffline ? `
            <div style="text-align: left; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; margin-bottom: 18px;">
                <div style="font-size: 0.84rem; font-weight: 700; color: #0f172a; margin-bottom: 10px;">
                    <i class="fa-solid fa-hand-holding-dollar" style="color: var(--primary); margin-right: 5px;"></i>
                    Đơn đặt sân hộ — Chọn hình thức hoàn tiền cọc (${tienCocStr}):
                </div>
                <label style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: #fff; border: 1px solid #e2e8f0; cursor: pointer; margin-bottom: 8px; font-size: 0.88rem; font-weight: 600; color: #1e293b;">
                    <input type="radio" name="admin_single_refund_method" value="chuyen_khoan" checked onchange="toggleSingleCancelRefundMethod('admin_single')">
                    <span><i class="fa-solid fa-building-columns" style="color: #2563eb; margin-right: 5px;"></i> Hoàn tiền bằng Chuyển khoản ngân hàng</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: #fff; border: 1px solid #e2e8f0; cursor: pointer; font-size: 0.88rem; font-weight: 600; color: #1e293b;">
                    <input type="radio" name="admin_single_refund_method" value="vi" onchange="toggleSingleCancelRefundMethod('admin_single')">
                    <span><i class="fa-solid fa-wallet" style="color: #10b981; margin-right: 5px;"></i> Hoàn tiền vào Ví tài khoản (${tenKhach})</span>
                </label>

                <div id="admin_single-bank-refund-box" style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #cbd5e1; display: block;">
                    <div style="margin-bottom: 8px;">
                        <label style="font-size: 0.8rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Tên ngân hàng nhận <span style="color:red;">*</span></label>
                        <input type="text" id="admin_single_bank_name" class="form-control" placeholder="VD: Vietcombank, MB Bank..." value="${kh.TenNganHang || ''}" style="height: 36px; font-size: 0.86rem;">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <div>
                            <label style="font-size: 0.8rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Số tài khoản <span style="color:red;">*</span></label>
                            <input type="text" id="admin_single_bank_stk" class="form-control" placeholder="Nhập STK..." value="${kh.STKNganHang || ''}" style="height: 36px; font-size: 0.86rem; font-family: monospace;">
                        </div>
                        <div>
                            <label style="font-size: 0.8rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Chủ tài khoản <span style="color:red;">*</span></label>
                            <input type="text" id="admin_single_bank_owner" class="form-control" placeholder="TÊN IN HOA..." value="${kh.TenTaiKhoan || tenKhach.toUpperCase()}" style="height: 36px; font-size: 0.86rem; text-transform: uppercase;">
                        </div>
                    </div>
                </div>
            </div>
        ` : `
            <p style="color: #64748b; margin-bottom: 24px; line-height: 1.6; font-size: 0.92rem;">
                Khách hàng thành viên: <strong style="color: #0f172a;">${tenKhach}</strong>.<br>
                Hệ thống sẽ <strong style="color: #0f172a;">HỦY LỊCH</strong> và tự động <strong style="color: #0f172a;">HOÀN TRẢ 100% TIỀN CỌC (${tienCocStr})</strong> vào ví khách hàng.
            </p>
        `;

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 460px; width: 92%; text-align: center; padding: 26px 24px; border-radius: 16px;">
                <div style="font-size: 3.2rem; color: #ef4444; margin-bottom: 10px;"><i class="fa-solid fa-triangle-exclamation"></i></div>
                <h3 style="margin-bottom: 10px; font-size: 1.3rem; font-weight: 800; color: #0f172a;">Xác nhận Hủy Sân ${isOffline ? '(Đặt hộ)' : ''}</h3>
                <div id="admin-member-cancel-alert" class="modal-alert" style="display: none; margin: 0 0 12px 0; text-align: left;"></div>
                ${offlineOptionsHtml}
                <div style="display: flex; justify-content: center; gap: 12px;">
                    <button type="button" onclick="closeAdminCancelConfirmModal()" style="flex: 1; padding: 10px 18px; border-radius: 10px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-weight: 600; font-size: 0.92rem; cursor: pointer;">
                        Hủy bỏ
                    </button>
                    <button type="button" id="btn-admin-confirm-member-cancel" onclick="confirmMemberCancelAdmin(${isOffline})" style="flex: 1.3; padding: 10px 18px; border-radius: 10px; border: 1px solid #ef4444; background: #ef4444; color: #ffffff; font-weight: 700; font-size: 0.92rem; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px;">
                        Hủy & Hoàn tiền
                    </button>
                </div>
            </div>`;
    } else {
        // LUỒNG 2: KHÁCH VÃNG LAI (Xác thực OTP qua Email trước khi hủy & hoàn cọc)
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 440px; width: 92%; padding: 24px; text-align: left; border-radius: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0;">
                    <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800; color: #0f172a;"><i class="fa-solid fa-user-check" style="color: #ef4444; margin-right: 6px;"></i> Hủy sân Khách vãng lai</h3>
                    <i class="fa-solid fa-xmark" style="cursor: pointer; color: #64748b; font-size: 1.15rem;" onclick="closeAdminCancelConfirmModal()"></i>
                </div>

                <div id="admin-guest-cancel-alert" class="modal-alert" style="display: none; margin: 0 0 12px 0;"></div>

                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; font-size: 0.88rem; line-height: 1.65;">
                    <div>Khách vãng lai: <strong style="color: #0f172a;">${item.TenKhachVangLai || 'N/A'}</strong> (${item.SDTKhachVangLai || ''})</div>
                    <div>Email nhận OTP: <strong style="color: #2563eb;">${item.EmailKhachVangLai || 'Chưa có'}</strong></div>
                    <div>Tiền cọc cần hoàn: <strong style="color: #ea580c;">${Number(item.TienCoc).toLocaleString('vi-VN')}đ</strong></div>
                </div>

                <div class="form-group" style="margin-bottom: 20px;">
                    <label style="font-size: 0.86rem; font-weight: 600; color: #1e293b; margin-bottom: 6px; display: block;">Mã xác thực OTP (gửi về Email khách) <span style="color: #ef4444;">*</span></label>
                    <div style="display: flex; gap: 10px; align-items: stretch;">
                        <input type="text" id="admin-guest-cancel-otp" class="form-control" placeholder="Nhập 6 số OTP..." maxlength="6" style="flex: 1; font-weight: 700; letter-spacing: 2px; text-align: center; border-radius: 10px;">
                        <button type="button" id="btn-admin-send-guest-otp" onclick="sendGuestCancelOtpAdmin('${item.ID}')" style="width: auto; padding: 0 16px; border-radius: 10px; border: 1px solid #bfdbfe; background: #eff6ff; color: #2563eb; font-weight: 700; font-size: 0.86rem; white-space: nowrap; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                            <i class="fa-solid fa-paper-plane"></i> Gửi OTP
                        </button>
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button type="button" onclick="closeAdminCancelConfirmModal()" style="padding: 10px 20px; border-radius: 10px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-weight: 600; font-size: 0.9rem; cursor: pointer;">
                        Đóng
                    </button>
                    <button type="button" id="btn-admin-confirm-guest-cancel" onclick="confirmGuestCancelAdmin()" style="padding: 10px 20px; border-radius: 10px; border: 1px solid #ef4444; background: #ef4444; color: #ffffff; font-weight: 700; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-check"></i> Xác nhận Hủy & Hoàn cọc
                    </button>
                </div>
            </div>`;
    }

    modal.style.display = 'flex';
}

async function confirmMemberCancelAdmin(isOffline = false) {
    const alertBox = document.getElementById('admin-member-cancel-alert');
    let extraPayload = { phuong_thuc_hoan: 'vi' };

    if (isOffline) {
        const method = document.querySelector('input[name="admin_single_refund_method"]:checked')?.value || 'vi';
        extraPayload.phuong_thuc_hoan = method;

        if (method === 'chuyen_khoan') {
            const nganHang = document.getElementById('admin_single_bank_name')?.value.trim() || '';
            const stk = document.getElementById('admin_single_bank_stk')?.value.trim() || '';
            const owner = document.getElementById('admin_single_bank_owner')?.value.trim().toUpperCase() || '';

            if (!nganHang || !stk || !owner) {
                alertBox.textContent = 'Vui lòng nhập đầy đủ Tên ngân hàng, Số tài khoản và Chủ tài khoản nhận tiền!';
                alertBox.className = 'modal-alert error';
                alertBox.style.display = 'block';
                return;
            }
            extraPayload.ngan_hang = nganHang;
            extraPayload.so_tai_khoan = stk;
            extraPayload.chu_tai_khoan = owner;
        }
    }

    const btn = document.getElementById('btn-admin-confirm-member-cancel');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';

    const ok = await executeCapNhatDatSan('DaHuy', null, alertBox, extraPayload);
    if (ok) {
        closeAdminCancelConfirmModal();
    } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-trash"></i> Xác nhận Hủy & Hoàn tiền';
    }
}

async function executeCapNhatDatSan(trangThai, otp = null, customAlertBox = null, extraPayload = {}) {
    if (!pendingDSId) return false;
    closeDSConfirmModal(); 

    try {
        const payload = { 
            trang_thai: trangThai, 
            return_url: window.location.origin + window.location.pathname,
            ...extraPayload 
        };
        if (otp) payload.otp = otp;

        const response = await fetch(`${API_BASE_URL}/admin/dat-san/${pendingDSId}/chot`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
            if (data.vnpay_url) {
                window.location.href = data.vnpay_url;
                return true;
            }
            showDSAlert('Đã cập nhật trạng thái thành công!', true);
            loadDanhSachDatSanAdmin();
            return true;
        } else {
            if (customAlertBox) {
                customAlertBox.innerHTML = (data.message || 'Lỗi xử lý.').replace(/\n/g, '<br>');
                customAlertBox.className = 'modal-alert error';
                customAlertBox.style.display = 'block';
            } else {
                showDSAlert(data.message || 'Lỗi xử lý.', false);
            }
            return false;
        }
    } catch (e) {
        showDSAlert('Lỗi kết nối máy chủ.', false);
        return false;
    }
}

function closeAdminCancelConfirmModal() {
    const modal = document.getElementById('admin-cancel-modal');
    if (modal) modal.style.display = 'none';
}

async function sendGuestCancelOtpAdmin(id) {
    const btn = document.getElementById('btn-admin-send-guest-otp');
    const alertBox = document.getElementById('admin-guest-cancel-alert');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi...';
    alertBox.style.display = 'none';

    try {
        const res = await fetch(`${API_BASE_URL}/admin/dat-san/${id}/gui-otp-huy-guest`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        alertBox.textContent = data.message;
        alertBox.className = 'modal-alert ' + (data.success ? 'success' : 'error');
        alertBox.style.display = 'block';
    } catch (e) {
        alertBox.textContent = 'Lỗi kết nối máy chủ!';
        alertBox.className = 'modal-alert error';
        alertBox.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Gửi lại OTP';
    }
}

async function confirmGuestCancelAdmin() {
    const otp = document.getElementById('admin-guest-cancel-otp')?.value.trim();
    const alertBox = document.getElementById('admin-guest-cancel-alert');
    if (!otp || otp.length !== 6) {
        alertBox.textContent = 'Vui lòng nhập đủ 6 chữ số OTP!';
        alertBox.className = 'modal-alert error';
        alertBox.style.display = 'block';
        return;
    }

    const btn = document.getElementById('btn-admin-confirm-guest-cancel');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';

    const ok = await executeCapNhatDatSan('DaHuy', otp, alertBox);
    if (ok) {
        closeAdminCancelConfirmModal();
    } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Xác nhận Hủy & Hoàn cọc';
    }
}

// ======================================================
// QUÉT MÃ QR CHECK-IN VÉ ĐẶT SÂN (QUẢN LÝ SÂN)
// ======================================================
let adminHtml5QrScanner = null;

function ensureHtml5QrcodeLoadedAdmin() {
    return new Promise((resolve, reject) => {
        if (window.Html5Qrcode) return resolve();
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Không thể tải thư viện quét QR'));
        document.head.appendChild(script);
    });
}

window.openAdminQrScannerModal = async function() {
    let modal = document.getElementById('admin-qr-scanner-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-qr-scanner-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10000; align-items: center; justify-content: center;';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 460px; width: 92%; padding: 0; border-radius: 14px; overflow: hidden; background: #fff;">
            <div style="padding: 16px 20px; background: #0f172a; color: #fff; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 1.05rem; font-weight: 700;"><i class="fa-solid fa-qrcode" style="color: #4ade80; margin-right: 8px;"></i>Quét mã QR Vé Đặt Sân</h3>
                <i class="fa-solid fa-xmark" style="cursor: pointer; font-size: 1.2rem; color: #94a3b8;" onclick="closeAdminQrScannerModal()"></i>
            </div>
            <div style="padding: 20px; text-align: center;">
                <div id="admin-qr-reader" style="width: 100%; min-height: 250px; border-radius: 12px; overflow: hidden; border: 2px dashed #cbd5e1; background: #f8fafc; display: flex; align-items: center; justify-content: center;">
                    <span style="color: #64748b; font-size: 0.9rem;"><i class="fa-solid fa-spinner fa-spin"></i> Đang khởi động Camera...</span>
                </div>
                <div id="admin-qr-error" style="display: none; margin-top: 10px; color: #dc2626; font-size: 0.85rem; font-weight: 600;"></div>

                <div style="margin-top: 16px; padding-top: 14px; border-top: 1px dashed #e2e8f0; display: flex; flex-direction: column; gap: 10px;">
                    <label style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 16px; border-radius: 8px; border: 1px solid #cbd5e1; background: #f8fafc; color: #334155; font-weight: 600; font-size: 0.88rem; cursor: pointer;">
                        <i class="fa-solid fa-image" style="color: var(--primary);"></i> Chọn ảnh vé QR từ máy tính
                        <input type="file" accept="image/*" style="display: none;" onchange="scanAdminQrFromFile(this)">
                    </label>
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'flex';

    try {
        await ensureHtml5QrcodeLoadedAdmin();
        adminHtml5QrScanner = new Html5Qrcode("admin-qr-reader");
        await adminHtml5QrScanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 220, height: 220 } },
            (decodedText) => {
                handleAdminQrResult(decodedText);
            },
            () => {}
        );
    } catch (err) {
        const readerEl = document.getElementById('admin-qr-reader');
        if (readerEl) {
            readerEl.innerHTML = `<div style="padding: 30px 15px; color: #64748b; font-size: 0.88rem;"><i class="fa-solid fa-video-slash" style="font-size: 2rem; color: #94a3b8; margin-bottom: 8px; display: block;"></i>Không tìm thấy Camera hoặc chưa cấp quyền.<br>Bạn có thể chọn <strong>ảnh vé QR</strong> bên dưới để quét!</div>`;
        }
    }
};

window.scanAdminQrFromFile = async function(input) {
    if (!input.files || input.files.length === 0) return;
    const imageFile = input.files[0];
    const errEl = document.getElementById('admin-qr-error');
    if (errEl) errEl.style.display = 'none';

    try {
        await ensureHtml5QrcodeLoadedAdmin();
        if (adminHtml5QrScanner && adminHtml5QrScanner.isScanning) {
            await adminHtml5QrScanner.stop();
        }
        if (!adminHtml5QrScanner) {
            adminHtml5QrScanner = new Html5Qrcode("admin-qr-reader");
        }
        const decodedText = await adminHtml5QrScanner.scanFile(imageFile, true);
        handleAdminQrResult(decodedText);
    } catch (err) {
        if (errEl) {
            errEl.textContent = 'Không tìm thấy mã QR hợp lệ trong bức ảnh này!';
            errEl.style.display = 'block';
        }
    }
};

window.closeAdminQrScannerModal = async function() {
    const modal = document.getElementById('admin-qr-scanner-modal');
    if (modal) modal.style.display = 'none';
    if (adminHtml5QrScanner) {
        try {
            if (adminHtml5QrScanner.isScanning) await adminHtml5QrScanner.stop();
            adminHtml5QrScanner.clear();
        } catch (e) {}
        adminHtml5QrScanner = null;
    }
};

function handleAdminQrResult(rawText) {
    closeAdminQrScannerModal();
    const cleaned = String(rawText || '').trim().toUpperCase().replace(/^#/, '');
    const match = cleaned.match(/^(PT|GD)-([A-Z0-9]+)$/);

    if (!match) {
        return showDSAlert(`Mã QR "${rawText}" không đúng định dạng vé DN Football (PT-... hoặc GD-...)!`, false);
    }

    const prefix = match[1];   // 'PT' hoặc 'GD'
    const rawCode = match[2];  // Có thể là '100', 'DS100', '11', 'GDAU11', 'GDAU011'
    const rawNum = rawCode.replace(/\D/g, '').replace(/^0+/, '') || '0';

    if (prefix === 'PT') {
        // Tìm vé phong trào khớp theo Mã mới (DS100) hoặc Số thứ tự cũ (100 -> DS100 / DS001)
        const booking = allDatSanData.find(b => {
            if (b.MaGiaiDau || b.ID_GiaiDau) return false;
            const bId = String(b.MaDatSan || b.ID || '').toUpperCase();
            const bNum = bId.replace(/\D/g, '').replace(/^0+/, '') || '0';
            return bId === rawCode || bId === `DS${rawNum.padStart(3, '0')}` || bNum === rawNum;
        });

        const mappedCode = booking ? `PT-${booking.MaDatSan || booking.ID}` : `PT-DS${rawNum.padStart(3, '0')}`;

        currentDSDate = '';
        currentDSFilter = 'All';
        currentDSSearch = mappedCode.toLowerCase();
        currentDSPage = 1;

        if (document.getElementById('ds-date-input')) document.getElementById('ds-date-input').value = '';
        if (document.getElementById('ds-status-select')) document.getElementById('ds-status-select').value = 'All';
        if (document.getElementById('ds-search-input')) document.getElementById('ds-search-input').value = mappedCode;

        applyDSFiltersAndRender();

        if (booking) {
            const noteLegacy = (cleaned !== mappedCode) ? ` (Ánh xạ từ mã cũ #${cleaned})` : '';
            showDSAlert(`Đã quét thành công vé phong trào #${mappedCode}${noteLegacy}!`, true);
            openBookingDetailModalAdmin(booking.MaDatSan || booking.ID);
        } else {
            showDSAlert(`Không tìm thấy vé #${mappedCode} (Mã quét: #${cleaned}) thuộc cụm sân của bạn!`, false);
        }
    } else {
        // Tìm các trận thuộc Giải đấu khớp theo Mã mới (GDAU011) hoặc Số thứ tự cũ (11 -> GDAU011)
        const tourMatches = allDatSanData.filter(b => {
            const gId = String(b.MaGiaiDau || b.ID_GiaiDau || '').toUpperCase();
            if (!gId) return false;
            const gNum = gId.replace(/\D/g, '').replace(/^0+/, '') || '0';
            return gId === rawCode || gId === `GDAU${rawNum.padStart(3, '0')}` || gNum === rawNum;
        });

        const actualGiaiId = tourMatches.length > 0
            ? (tourMatches[0].MaGiaiDau || tourMatches[0].ID_GiaiDau)
            : `GDAU${rawNum.padStart(3, '0')}`;
        const mappedCode = `GD-${actualGiaiId}`;

        currentDSDate = '';
        currentDSFilter = 'All';
        currentDSSearch = mappedCode.toLowerCase();
        currentDSPage = 1;

        if (document.getElementById('ds-date-input')) document.getElementById('ds-date-input').value = '';
        if (document.getElementById('ds-status-select')) document.getElementById('ds-status-select').value = 'All';
        if (document.getElementById('ds-search-input')) document.getElementById('ds-search-input').value = mappedCode;

        applyDSFiltersAndRender();

        if (tourMatches.length > 0) {
            const noteLegacy = (cleaned !== mappedCode) ? ` (Ánh xạ từ mã cũ #${cleaned})` : '';
            showDSAlert(`Đã quét Thẻ Giải Đấu #${mappedCode}${noteLegacy} (Tìm thấy ${tourMatches.length} trận đấu)!`, true);
        } else {
            showDSAlert(`Không tìm thấy lịch thi đấu nào của giải #${mappedCode} (Mã quét: #${cleaned})!`, false);
        }
    }
}

// ======================================================
// MODULE: ADMIN - QUẢN LÝ YÊU CẦU HỦY SÂN GẤP
// ======================================================
let allHuySanData = [];
let currentUCPage = 1;
const itemsPerUCPage = 5;
let currentUCFilter = 'All';
let currentUCSearch = '';
let currentUCDate = '';
let pendingUCId = null;
let pendingUCStatus = null;

function renderQuanLyHuySan() {
    currentUCPage = 1; currentUCFilter = 'All'; currentUCSearch = ''; currentUCDate = '';
    
    // Cập nhật thẻ Active trên Menu
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = Array.from(document.querySelectorAll('.sidebar-nav a')).find(a => a.textContent.includes('YÊU CẦU HỦY SÂN'));
    if (menuLink) menuLink.classList.add('active');

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
            <div>
                <h1 class="page-title">Quản lý Yêu cầu Hủy Sân Gấp</h1>
                <p class="text-muted">Có <strong id="uc-pending-count" style="color: #ea580c; font-size: 1.1rem;">0</strong> đơn đang chờ phê duyệt</p>
            </div>
        </div>
        
        <div id="huysan-alert" class="modal-alert" style="display: none; margin-bottom: 16px;"></div>

        <div class="panel">
            <div style="display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap;">
                <div style="position: relative; flex: 1; min-width: 250px;">
                    <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 12px; top: 12px; color: var(--text-muted);"></i>
                    <input type="text" class="form-control" style="padding-left: 35px;" placeholder="Tìm tên khách, tên sân, cụm sân..." oninput="handleUCSearch(this.value)">
                </div>
                <input type="date" class="form-control" style="width: 150px;" onchange="handleUCDate(this.value)">
                <select class="form-control" style="width: 200px;" onchange="handleUCFilter(this.value)">
                    <option value="All">Tất cả trạng thái</option>
                    <option value="ChoDuyet">Chờ duyệt</option>
                    <option value="DaDuyet">Đã duyệt</option>
                    <option value="TuChoi">Từ chối</option>
                </select>
            </div>

            <div class="table-responsive" style="min-height: 350px;">
                <table class="admin-table">
                    <thead style="background: #F8FAFC;">
                        <tr>
                            <th>Khách Hàng</th>
                            <th>Thông tin Sân</th>
                            <th>Lý do hủy</th>
                            <th>Ngày gửi</th>
                            <th>Trạng thái</th>
                            <th>Hành động</th>
                        </tr>
                    </thead>
                    <tbody id="huysan-table-body">
                        <tr><td colspan="6" class="text-center" style="text-align: center;">Đang tải dữ liệu...</td></tr>
                    </tbody>
                </table>
            </div>
            <div id="uc-pagination" style="display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 15px; margin-bottom: 15px; padding-top: 15px; border-top: 1px solid var(--border);"></div>
        </div>
    `;
    loadDanhSachHuySanAdmin();
}

function showUCAlert(message, isSuccess) {
    const alertBox = document.getElementById('huysan-alert');
    alertBox.textContent = message; 
    alertBox.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alertBox.style.display = 'block'; 
    setTimeout(() => alertBox.style.display = 'none', 3000);
}

function handleUCSearch(val) { currentUCSearch = val.toLowerCase().trim(); currentUCPage = 1; applyUCFiltersAndRender(); }
function handleUCDate(val) { currentUCDate = val; currentUCPage = 1; applyUCFiltersAndRender(); }
function handleUCFilter(val) { currentUCFilter = val; currentUCPage = 1; applyUCFiltersAndRender(); }

async function loadDanhSachHuySanAdmin() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/yeu-cau-huy-gap`);
        const res = await response.json();
        if (res.success) { 
            allHuySanData = res.data || []; 
            applyUCFiltersAndRender(); 
        }
    } catch (error) { 
        showUCAlert('Lỗi kết nối máy chủ.', false); 
    }
}

function applyUCFiltersAndRender() {
    document.getElementById('uc-pending-count').innerText = allHuySanData.filter(i => i.TrangThai === 'ChoDuyet').length;

    let filteredData = allHuySanData.filter(item => {
        const matchStatus = (currentUCFilter === 'All' || item.TrangThai === currentUCFilter);
        
        const tenKhach = item.nguoi_dung ? item.nguoi_dung.HoTen.toLowerCase() : '';
        const tenSan = (item.dat_san && item.dat_san.san_bong) ? item.dat_san.san_bong.TenSan.toLowerCase() : '';
        const cumSan = (item.dat_san && item.dat_san.san_bong && item.dat_san.san_bong.cum_san) ? item.dat_san.san_bong.cum_san.TenCumSan.toLowerCase() : '';
        
        const matchSearch = tenKhach.includes(currentUCSearch) || tenSan.includes(currentUCSearch) || cumSan.includes(currentUCSearch);
        
        const txDate = item.NgayTao ? item.NgayTao.substring(0, 10) : '';
        const matchDate = currentUCDate ? (txDate === currentUCDate) : true;
        
        return matchStatus && matchSearch && matchDate;
    });

    const totalPages = Math.ceil(filteredData.length / itemsPerUCPage) || 1;
    if (currentUCPage > totalPages) currentUCPage = totalPages;
    const startIdx = (currentUCPage - 1) * itemsPerUCPage;
    
    renderUCTable(filteredData.slice(startIdx, startIdx + itemsPerUCPage));
    renderUCPagination(totalPages);
}

function renderUCTable(data) {
    const tbody = document.getElementById('huysan-table-body');
    if (data.length === 0) return tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="text-align: center; padding: 40px;">Không có dữ liệu.</td></tr>`;

    tbody.innerHTML = data.map(item => {
        let badgeClass = 'badge-warning', viStatus = 'Chờ duyệt', actionHtml = '';
        if(item.TrangThai === 'DaDuyet') { badgeClass = 'badge-success'; viStatus = 'Đã duyệt'; }
        if(item.TrangThai === 'TuChoi') { badgeClass = 'badge-danger'; viStatus = 'Từ chối'; }

        if (item.TrangThai === 'ChoDuyet') {
            actionHtml = `
                <div style="display: flex; gap: 8px; justify-content: flex-start;">
                    <button class="btn-outline-sm" style="color: #047857; border-color: #047857; padding: 6px 12px; white-space: nowrap;" onclick="openUCConfirmModal('${item.ID}', 'DaDuyet')">
                        <i class="fa-solid fa-check"></i> Duyệt
                    </button>
                    <button class="btn-outline-sm" style="color: #b91c1c; border-color: #b91c1c; padding: 6px 12px; white-space: nowrap;" onclick="openUCConfirmModal('${item.ID}', 'TuChoi')">
                        <i class="fa-solid fa-xmark"></i> Từ chối
                    </button>
                </div>
            `;
        } else {
            actionHtml = `<span style="color: var(--text-muted); font-size: 0.85rem;">(Ngày xử lý: ${item.NgayDuyet ? item.NgayDuyet.substring(0,10) : 'N/A'})</span>`;
        }

        const sanBong = item.dat_san && item.dat_san.san_bong ? item.dat_san.san_bong.TenSan : 'N/A';
        const cumSan = item.dat_san && item.dat_san.san_bong && item.dat_san.san_bong.cum_san ? item.dat_san.san_bong.cum_san.TenCumSan : '';
        const isGiaiDau = item.dat_san && item.dat_san.ID_GiaiDau != null;
        const tenGiai = isGiaiDau && item.dat_san.giai_dau ? item.dat_san.giai_dau.TenGiaiDau : '';
        
        const loaiTag = isGiaiDau 
            ? `<span style="font-size: 0.7rem; background: #e0e7ff; color: #4338ca; padding: 2px 6px; border-radius: 4px; margin-bottom: 4px; display: inline-block;"><i class="fa-solid fa-trophy"></i> Giải đấu</span>` 
            : `<span style="font-size: 0.7rem; background: #f1f5f9; color: #475569; padding: 2px 6px; border-radius: 4px; margin-bottom: 4px; display: inline-block;">Phong trào</span>`;

        const htmlTenGiai = isGiaiDau ? `<div style="font-size: 0.8rem; color: #4338ca; font-weight: 600;">${tenGiai}</div>` : '';

        let dateStr = '';
        if (item.NgayTao) {
            const d = new Date(item.NgayTao);
            const pad = n => n < 10 ? '0' + n : n;
            dateStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
        
        let ngayDaStr = ''; let gioDaStr = '';
        if(item.dat_san) {
            const d = new Date(item.dat_san.NgayDa);
            ngayDaStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear()}`;
            gioDaStr = item.dat_san.khung_gio ? `${item.dat_san.khung_gio.GioBatDau.substring(0,5)} - ${item.dat_san.khung_gio.GioKetThuc.substring(0,5)}` : '';
        }

        return `<tr>
            <td>
                <strong style="white-space: nowrap;">${item.nguoi_dung?.HoTen || 'N/A'}</strong><br>
                <span style="font-size: 0.85rem; color: var(--text-muted);">${item.nguoi_dung?.SoDienThoai || ''}</span>
            </td>
            <td>
                ${loaiTag}<br>
                <strong style="color: var(--text-dark);">${sanBong}</strong><br>
                <span style="font-size: 0.8rem; color: var(--text-muted);"><i class="fa-solid fa-location-dot"></i> ${cumSan}</span>
                ${htmlTenGiai}
                <div style="font-size: 0.85rem; margin-top: 4px;">Đá lúc: <strong style="color:var(--primary);">${gioDaStr}</strong> (${ngayDaStr})</div>
            </td>
            <td style="max-width: 200px;">
                <span style="font-size: 0.9rem; white-space: pre-line; color: var(--text-dark);">"${item.NoiDung}"</span>
            </td>
            <td><span style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> ${dateStr}</span></td>
            <td><span class="badge ${badgeClass}" style="white-space: nowrap; display: inline-block; text-align: center; min-width: 85px;">${viStatus}</span></td>
            <td>${actionHtml}</td>
        </tr>`;
    }).join('');
}

function renderUCPagination(totalPages) {
    const div = document.getElementById('uc-pagination');
    if (totalPages <= 1) return div.innerHTML = '';
    
    let html = `<button class="btn-outline-sm" ${currentUCPage === 1 ? 'disabled style="opacity:0.5;"' : ''} onclick="currentUCPage--; applyUCFiltersAndRender()"><i class="fa-solid fa-chevron-left"></i></button>`;
    
    const getPages = (current, total) => {
        if (total <= 6) return Array.from({length: total}, (_, i) => i + 1);
        if (current <= 3) return [1, 2, 3, 4, '...', total];
        if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
        return [1, '...', current - 1, current, current + 1, '...', total];
    };

    getPages(currentUCPage, totalPages).forEach(i => {
        if (i === '...') {
            html += `<span style="padding: 6px 10px; color: var(--text-muted); font-weight: bold;">...</span>`;
        } else {
            html += `<button class="${i === currentUCPage ? 'btn-primary' : 'btn-outline-sm'}" style="padding: 6px 14px;" onclick="currentUCPage=${i}; applyUCFiltersAndRender()">${i}</button>`;
        }
    });

    html += `<button class="btn-outline-sm" ${currentUCPage === totalPages ? 'disabled style="opacity:0.5;"' : ''} onclick="currentUCPage++; applyUCFiltersAndRender()"><i class="fa-solid fa-chevron-right"></i></button>`;
    div.innerHTML = html;
}

function openUCConfirmModal(id, status) {
    pendingUCId = id; pendingUCStatus = status;
    
    // Tạo Modal xác nhận ngay trong Javascript
    let modal = document.getElementById('uc-confirm-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'uc-confirm-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 9999;';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; text-align: center; padding: 30px 20px;">
                <div style="font-size: 3.5rem; color: #f59e0b; margin-bottom: 15px;"><i class="fa-solid fa-circle-exclamation"></i></div>
                <h3 id="uc-confirm-title" style="margin-bottom: 10px; font-size: 1.4rem;">Xác nhận</h3>
                <p id="uc-confirm-msg" style="color: var(--text-muted); margin-bottom: 25px; line-height: 1.5;"></p>
                
                <div id="uc-reason-container" style="display: none; margin-bottom: 20px; text-align: left;">
                    <label style="font-size: 0.9rem; font-weight: 600; color: var(--text-dark); margin-bottom: 8px; display: block;">Lý do từ chối <span style="color: red;">*</span></label>
                    <textarea id="uc-reject-reason" class="form-control" rows="3" placeholder="Nhập lý do từ chối hủy sân..." style="width: 100%; resize: none;" oninput="document.getElementById('uc-reason-error').style.display='none'"></textarea>
                    <div id="uc-reason-error" style="color: #ef4444; font-size: 0.85rem; margin-top: 8px; display: none;"><i class="fa-solid fa-circle-exclamation"></i> Vui lòng nhập lý do từ chối!</div>
                </div>

                <div style="display: flex; justify-content: center; gap: 12px;">
                    <button class="btn-outline" style="width: auto; padding: 10px 24px;" onclick="closeUCConfirmModal()">Hủy bỏ</button>
                    <button id="uc-confirm-btn" class="btn-primary" style="width: auto; padding: 10px 24px;" onclick="executeCapNhatTrangThaiUC()">Đồng ý</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const isApprove = (status === 'DaDuyet');
    document.getElementById('uc-confirm-title').innerText = isApprove ? 'Duyệt Hủy Sân' : 'Từ Chối Hủy Sân';
    document.getElementById('uc-confirm-msg').innerHTML = isApprove 
        ? 'Sân (hoặc Giải đấu) này sẽ bị <strong style="color: #ef4444;">HỦY</strong> và tiền cọc sẽ tự động hoàn lại ví khách hàng. Xác nhận?' 
        : 'Bạn sẽ <strong style="color: #ef4444;">TỪ CHỐI</strong> đơn hủy này (Lịch đặt được giữ nguyên). Xác nhận?';
    
    const btn = document.getElementById('uc-confirm-btn');
    btn.style.backgroundColor = isApprove ? 'var(--primary)' : '#ef4444';
    btn.style.borderColor = isApprove ? 'var(--primary)' : '#ef4444';

    document.getElementById('uc-reason-container').style.display = isApprove ? 'none' : 'block';
    document.getElementById('uc-reject-reason').value = '';
    document.getElementById('uc-reason-error').style.display = 'none';
    modal.style.display = 'flex';
}

function closeUCConfirmModal() { 
    const modal = document.getElementById('uc-confirm-modal');
    if(modal) modal.style.display = 'none'; 
}

async function executeCapNhatTrangThaiUC() {
    if (!pendingUCId || !pendingUCStatus) return;

    let lyDoHuy = null;
    if (pendingUCStatus === 'TuChoi') {
        lyDoHuy = document.getElementById('uc-reject-reason').value.trim();
        if (!lyDoHuy) {
            document.getElementById('uc-reason-error').style.display = 'block';
            document.getElementById('uc-reject-reason').focus();
            return;
        }
    }

    const btn = document.getElementById('uc-confirm-btn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...'; 
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/admin/yeu-cau-huy-gap/${pendingUCId}/xu-ly`, {
            method: 'PUT', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ trang_thai: pendingUCStatus, ly_do_huy: lyDoHuy })
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
            showUCAlert('Xử lý thành công!', true);
            closeUCConfirmModal(); 
            loadDanhSachHuySanAdmin(); // Tự động làm mới bảng sau khi duyệt
        } else { 
            showUCAlert(data.message, false); 
            closeUCConfirmModal(); 
        }
    } catch (e) { 
        showUCAlert('Lỗi mạng!', false); 
        closeUCConfirmModal(); 
    } finally { 
        btn.innerHTML = 'Đồng ý'; 
        btn.disabled = false; 
    }
}

// ======================================================
// MODULE: ADMIN - QUẢN LÝ KHÁCH HÀNG
// ======================================================
let allUsersData = [];
let allKhachHangData = [];
let currentViewedKhachHangId = null;
let currentKhachHangDatSan = [];
let currentRoleTab = 'KhachHang';
let userSearchTerm = '';
let currentUserPage = 1;
const itemsPerUserPage = 5;
let currentUserCumSanFilter = 'All';

// 1. Render màn hình Danh sách
function renderQuanLyKhachHang() {
    currentViewedKhachHangId = null;
    currentRoleTab = 'KhachHang';
    userSearchTerm = '';

    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    const isAdmin = currentUser.VaiTro === 'Admin';

    // Active menu
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = document.getElementById('menu-khachhang');
    if (menuLink) menuLink.classList.add('active');

    // UI TABS: Phân quyền hiển thị Tab
    let tabsHtml = '';
    if (isAdmin) {
        const isAdminToiCao = (currentUser.MaNguoiDung === 'ND001' || String(currentUser.ID) === 'ND001' || Number(currentUser.ID) === 1);

        tabsHtml = `
            <div style="display: flex; gap: 20px; border-bottom: 1px solid var(--border); margin-bottom: 20px; padding: 0 20px;">
                <button class="nav-tab active" onclick="switchUserTab('KhachHang', this)" style="padding: 15px 10px; border: none; background: transparent; font-weight: 600; cursor: pointer; border-bottom: 2px solid var(--primary); color: var(--primary);">Khách hàng</button>
                <button class="nav-tab" onclick="switchUserTab('NhanVien', this)" style="padding: 15px 10px; border: none; background: transparent; font-weight: 600; cursor: pointer; color: var(--text-muted);">Nhân viên</button>
                <button class="nav-tab" onclick="switchUserTab('QuanLySan', this)" style="padding: 15px 10px; border: none; background: transparent; font-weight: 600; cursor: pointer; color: var(--text-muted);">Quản lý sân</button>
                ${isAdminToiCao ? `<button class="nav-tab" onclick="switchUserTab('Admin', this)" style="padding: 15px 10px; border: none; background: transparent; font-weight: 600; cursor: pointer; color: var(--text-muted);">Admin</button>` : ''}
            </div>
        `;
    } else {
        // Quản lý sân có 2 tab
        tabsHtml = `
            <div style="display: flex; gap: 20px; border-bottom: 1px solid var(--border); margin-bottom: 20px; padding: 0 20px;">
                <button class="nav-tab active" onclick="switchUserTab('KhachHang', this)" style="padding: 15px 10px; border: none; background: transparent; font-weight: 600; cursor: pointer; border-bottom: 2px solid var(--primary); color: var(--primary);">Khách hàng</button>
                <button class="nav-tab" onclick="switchUserTab('NhanVien', this)" style="padding: 15px 10px; border: none; background: transparent; font-weight: 600; cursor: pointer; color: var(--text-muted);">Nhân viên (Cơ sở của tôi)</button>
            </div>
        `;
    }

    const pageTitle = isAdmin ? 'Quản lý Tài khoản' : 'Quản lý Khách hàng & Nhân sự';
    const pageDesc = isAdmin ? 'Danh sách tài khoản và phân quyền trên hệ thống' : 'Danh sách khách hàng và nhân viên thuộc cụm sân của bạn';

    let filterCumSanHtml = '';
    if (isAdmin) {
        filterCumSanHtml = `
            <select id="user-cumsan-filter" class="form-control" style="width: 250px; display: none;" onchange="handleUserCumSanFilter(this.value)">
                <option value="All">Tất cả Cơ sở</option>
                <!-- Dữ liệu sẽ đổ từ API loadCumSanForFilter() -->
            </select>
        `;
    }

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="margin-bottom: 24px;">
            <h1 class="page-title">${pageTitle}</h1>
            <p class="text-muted">${pageDesc}</p>
        </div>

        <div class="panel">
            ${tabsHtml}

            <!-- Khung tìm kiếm và Lọc -->
            <div style="display: flex; gap: 15px; margin: 0 20px 20px 20px; flex-wrap: wrap;">
                <div style="position: relative; flex: 1; min-width: 250px;">
                    <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 12px; top: 12px; color: var(--text-muted);"></i>
                    <input type="text" id="user-search-input" class="form-control" style="padding-left: 35px;" placeholder="Tìm theo Tên, SĐT, Email..." oninput="handleUserSearch(this.value)">
                </div>
                ${filterCumSanHtml}
            </div>

            <!-- Bảng danh sách -->
            <div class="table-responsive" style="max-height: 60vh; overflow-y: auto;">
                <table class="admin-table" style="position: relative;">
                    <thead id="user-table-head" style="position: sticky; top: 0; z-index: 10; background: #F8FAFC;">
                        <!-- Render Header bằng JS -->
                    </thead>
                    <tbody id="user-table-body">
                        <tr><td colspan="6" class="text-center" style="text-align: center;">Đang tải dữ liệu...</td></tr>
                    </tbody>
                </table>
            </div>

            <!-- Vùng hiển thị nút Phân trang -->
            <div id="user-pagination" style="display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 15px; margin-bottom: 15px; padding-top: 15px; border-top: 1px solid var(--border);"></div>
        </div>
    `;

    if (isAdmin) {
        loadCumSanForUserFilter();
    }

    loadDanhSachUsersAPI();
}

async function loadCumSanForUserFilter() {
    try {
        const response = await fetch(`${API_BASE_URL}/cum-san`);
        const res = await response.json();
        if (res.success) {
            const select = document.getElementById('user-cumsan-filter');
            if(select) {
                const options = res.data.map(cs => `<option value="${cs.ID}">${cs.TenCumSan}</option>`).join('');
                select.innerHTML = '<option value="All">Tất cả Cơ sở</option>' + options;
            }
        }
    } catch (e) { console.log(e); }
}

// Chuyển Tab (Và giải quyết UX Clear Search)
function switchUserTab(role, btnElement) {
    const tabs = btnElement.parentElement.children;
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
        tabs[i].style.borderBottom = 'none';
        tabs[i].style.color = 'var(--text-muted)';
    }
    btnElement.classList.add('active');
    btnElement.style.borderBottom = '2px solid var(--primary)';
    btnElement.style.color = 'var(--primary)';

    currentRoleTab = role;
    currentUserPage = 1;
    
    // CLEAR Ô TÌM KIẾM
    userSearchTerm = '';
    document.getElementById('user-search-input').value = '';

    currentUserCumSanFilter = 'All';
    const filterSelect = document.getElementById('user-cumsan-filter');
    if (filterSelect) {
        filterSelect.value = 'All';
        if (role === 'QuanLySan' || role === 'NhanVien') {
            filterSelect.style.display = 'block';
        } else {
            filterSelect.style.display = 'none';
        }
    }

    filterAndRenderUsers();
}

// Biến toàn cục lưu ID Nhân viên / Quản lý sân đang được mở trong Modal chi tiết
let currentViewedInternalUserId = null;

async function loadDanhSachUsersAPI() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/khach-hang`);
        const res = await response.json();
        if (res.success) {
            allUsersData = res.data;
            filterAndRenderUsers();

            // REALTIME: Nếu Admin/Quản lý đang mở Modal xem chi tiết Nhân viên/Quản lý sân -> Tự động cập nhật lại nội dung Modal ngay lập tức
            const internalModal = document.getElementById('internal-user-detail-modal');
            if (internalModal && internalModal.style.display === 'flex' && currentViewedInternalUserId !== null) {
                openInternalUserDetailModal(currentViewedInternalUserId);
            }
        }
    } catch (error) {
        const tbody = document.getElementById('user-table-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger" style="text-align: center;">Lỗi kết nối máy chủ!</td></tr>`;
        }
    }
}

function handleUserSearch(value) {
    userSearchTerm = value.toLowerCase().trim();
    filterAndRenderUsers();
}

function handleUserCumSanFilter(value) {
    currentUserCumSanFilter = value;
    currentUserPage = 1;
    filterAndRenderUsers();
}

function filterAndRenderUsers() {
    const filtered = allUsersData.filter(user => {
        const matchTab = user.VaiTro === currentRoleTab;

        let matchCumSan = true;
        if (currentUserCumSanFilter !== 'All') {
            matchCumSan = String(user.ID_CumSan) === String(currentUserCumSanFilter);
        }

        const matchSearch = 
            user.HoTen.toLowerCase().includes(userSearchTerm) || 
            user.SoDienThoai.includes(userSearchTerm) || 
            (user.Email && user.Email.toLowerCase().includes(userSearchTerm)) ||
            (user.Vneid && String(user.Vneid).includes(userSearchTerm));
        
        return matchTab && matchCumSan && matchSearch;
    });

    const thead = document.getElementById('user-table-head');
    if (currentRoleTab === 'KhachHang') {
        thead.innerHTML = `
            <tr>
                <th>Khách hàng</th>
                <th>Liên hệ</th>
                <th style="text-align: center;">Định danh VNeID</th>
                <th style="text-align: center;">Tỷ lệ Bùng sân</th>
                <th style="text-align: center;">Trạng thái</th>
                <th style="text-align: center;">Hành động</th>
            </tr>
        `;
    } else {
        thead.innerHTML = `
            <tr>
                <th>Tài khoản Nội bộ</th>
                <th>Thông tin liên hệ</th>
                <th>Cơ sở trực thuộc</th>
                <th style="text-align: center;">Trạng thái</th>
                <th style="text-align: center;">Hành động</th>
            </tr>
        `;
    }

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / itemsPerUserPage) || 1;
    if (currentUserPage > totalPages) currentUserPage = totalPages;

    const startIdx = (currentUserPage - 1) * itemsPerUserPage;
    const pageData = filtered.slice(startIdx, startIdx + itemsPerUserPage);

    const tbody = document.getElementById('user-table-body');
    if (pageData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 40px; text-align: center;">Không tìm thấy dữ liệu.</td></tr>`;
        document.getElementById('user-pagination').innerHTML = '';
        return;
    }

    tbody.innerHTML = pageData.map(u => {
        const statusBadge = u.TrangThaiKhoa 
            ? `<span class="badge badge-danger"><i class="fa-solid fa-lock"></i> Bị khóa</span>` 
            : `<span class="badge badge-success"><i class="fa-solid fa-check-circle"></i> Hoạt động</span>`;
        
        // 1. UI CHO KHÁCH HÀNG
        if (currentRoleTab === 'KhachHang') {
            let tyLeBungHtml = `<span style="color: #64748b; font-size: 0.85rem;">Chưa có dữ liệu</span>`;
            if (u.tong_tran_da_chot > 0) {
                const isNguyHiem = u.ty_le_bung >= 30 || u.tong_bung_san >= 3; 
                const color = isNguyHiem ? '#ef4444' : (u.ty_le_bung > 0 ? '#f59e0b' : '#16a34a');
                tyLeBungHtml = `
                    <div style="font-size: 1.1rem; font-weight: bold; color: ${color};">${u.ty_le_bung}%</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">${u.tong_bung_san} bùng / ${u.tong_tran_da_chot} chốt</div>
                    ${isNguyHiem ? `<div style="font-size:0.75rem; color:#ef4444; margin-top:2px;"><i class="fa-solid fa-triangle-exclamation"></i> Rủi ro cao</div>` : ''}
                `;
            }

            return `
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 40px; height: 40px; border-radius: 50%; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #64748b;">${u.HoTen.charAt(0).toUpperCase()}</div>
                            <div>
                                <strong style="color: var(--text-dark);">${u.HoTen}</strong><br>
                                <span style="font-size: 0.8rem; color: var(--text-muted);">Mã: ${u.MaNguoiDung || u.ID}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div><i class="fa-solid fa-phone" style="width: 16px; color: #94a3b8;"></i> ${u.SoDienThoai}</div>
                        <div style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-solid fa-envelope" style="width: 16px; color: #94a3b8;"></i> ${u.Email || 'Chưa cập nhật'}</div>
                    </td>
                    <td style="text-align: center;">
                        ${u.Vneid 
                            ? `<strong style="color: #334155; font-family: monospace; font-size: 0.95rem; background: #f1f5f9; padding: 4px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">${u.Vneid}</strong>` 
                            : `<span style="color: #94a3b8; font-size: 0.85rem; font-style: italic;">Chưa cập nhật</span>`}
                    </td>
                    <td style="text-align: center;">${tyLeBungHtml}</td>
                    <td style="text-align: center;">${statusBadge}</td>
                    <td style="text-align: center;"><button class="btn-outline-sm" onclick="renderChiTietKhachHang('${u.ID}')"><i class="fa-solid fa-eye"></i> Chi tiết</button></td>
                </tr>
            `;
        } 
        // 2. UI CHO NHÂN VIÊN / QUẢN LÝ SÂN / ADMIN (Click vào dòng hoặc nút Chi tiết sẽ mở Modal thông tin chi tiết)
        else {
            let roleBadge = '';
            if (u.VaiTro === 'Admin') roleBadge = `<span style="font-size: 0.75rem; background: #e0e7ff; color: #4338ca; padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-chess-king"></i> Admin</span>`;
            else if (u.VaiTro === 'QuanLySan') roleBadge = `<span style="font-size: 0.75rem; background: #fef3c7; color: #b45309; padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-user-tie"></i> Quản lý sân</span>`;
            else if (u.VaiTro === 'NhanVien') roleBadge = `<span style="font-size: 0.75rem; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-user-gear"></i> Nhân viên</span>`;
            
            const coSoStr = u.cum_san 
                ? `<div style="color: var(--primary); font-weight: 600;"><i class="fa-solid fa-building-flag"></i> ${u.cum_san.TenCumSan}</div><div style="font-size: 0.8rem; color: var(--text-muted);">${u.cum_san.DiaChi}</div>` 
                : `<div style="color: var(--text-muted); font-weight: 600;"><i class="fa-solid fa-globe"></i> Toàn hệ thống</div>`;

            let lockBtn = '';
            if (u.MaNguoiDung === 'ND001' || String(u.ID) === 'ND001' || Number(u.ID) === 1) {
                lockBtn = `<button class="btn-outline-sm" style="color: #94a3b8; border-color: #e2e8f0; background: #f8fafc; width: 115px; cursor: not-allowed; opacity: 0.8;" title="Tài khoản tối cao không thể bị khóa" disabled><i class="fa-solid fa-shield"></i> Bảo vệ</button>`;
            } else {
                lockBtn = u.TrangThaiKhoa
                    ? `<button class="btn-outline-sm" style="color: #16a34a; border-color: #bbf7d0; background: #f0fdf4; width: 115px;" onclick="event.stopPropagation(); openKhoaKhachHangModal('${u.ID}', true)"><i class="fa-solid fa-unlock"></i> Mở quyền</button>`
                    : `<button class="btn-outline-sm" style="color: #ef4444; border-color: #fecaca; background: #fef2f2; width: 115px; white-space: nowrap;" onclick="event.stopPropagation(); openKhoaKhachHangModal('${u.ID}', false)"><i class="fa-solid fa-lock"></i> Khóa TK</button>`;
            }

            const isClickableInternal = (u.VaiTro === 'NhanVien' || u.VaiTro === 'QuanLySan');
            const rowClickAttr = isClickableInternal
                ? `onclick="openInternalUserDetailModal('${u.ID}')" style="cursor: pointer; transition: background-color 0.15s;" onmouseover="this.style.backgroundColor='#f8fafc'" onmouseout="this.style.backgroundColor=''" title="Nhấn để xem thông tin chi tiết"`
                : '';

            return `
                <tr ${rowClickAttr}>
                    <td>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 40px; height: 40px; border-radius: 50%; background: #eff6ff; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #3b82f6; font-size: 1.2rem;"><i class="fa-solid fa-user-shield"></i></div>
                            <div>
                                <strong style="color: var(--text-dark);">${u.HoTen}</strong>
                                <span style="font-size: 0.75rem; color: #64748b; margin-left: 4px;">(${u.MaNguoiDung || u.ID})</span><br>
                                ${roleBadge}
                            </div>
                        </div>
                    </td>
                    <td>
                        <div><i class="fa-solid fa-phone" style="width: 16px; color: #94a3b8;"></i> ${u.SoDienThoai}</div>
                        <div style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-solid fa-envelope" style="width: 16px; color: #94a3b8;"></i> ${u.Email || 'Chưa cập nhật'}</div>
                    </td>
                    <td>${coSoStr}</td>
                    <td style="text-align: center; white-space: nowrap;">${statusBadge}</td>
                    <td style="text-align: center; white-space: nowrap;">
                        <div style="display: inline-flex; gap: 6px; align-items: center;">
                            ${isClickableInternal ? `<button class="btn-outline-sm" onclick="event.stopPropagation(); openInternalUserDetailModal('${u.ID}')"><i class="fa-solid fa-eye"></i> Chi tiết</button>` : ''}
                            ${lockBtn}
                        </div>
                    </td>
                </tr>
            `;
        }
    }).join('');

    renderUserPagination(totalPages);
}

window.closeInternalUserDetailModal = function() {
    const modal = document.getElementById('internal-user-detail-modal');
    if (modal) modal.style.display = 'none';
    currentViewedInternalUserId = null;
};

// MODAL HIỂN THỊ THÔNG TIN CHI TIẾT NHÂN VIÊN / QUẢN LÝ SÂN
window.openInternalUserDetailModal = function(userId) {
    const u = allUsersData.find(item => String(item.ID) === String(userId) || String(item.MaNguoiDung) === String(userId));
    if (!u) return;

    // Lưu lại ID nhân sự đang mở để phục vụ đồng bộ Realtime khi có AdminDataUpdated
    currentViewedInternalUserId = u.ID || u.MaNguoiDung;

    let modal = document.getElementById('internal-user-detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'internal-user-detail-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10000; align-items: center; justify-content: center;';
        modal.onclick = function(e) {
            if (e.target === modal) closeInternalUserDetailModal();
        };
        document.body.appendChild(modal);
    }

    const maND = u.MaNguoiDung || u.ID;
    const roleLabel = u.VaiTro === 'QuanLySan'
        ? '<span style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 4px 10px; border-radius: 999px; font-size: 0.8rem; font-weight: 700;"><i class="fa-solid fa-user-tie"></i> Quản lý Cụm Sân</span>'
        : '<span style="background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 4px 10px; border-radius: 999px; font-size: 0.8rem; font-weight: 700;"><i class="fa-solid fa-user-gear"></i> Nhân viên cơ sở</span>';

    const statusBadge = u.TrangThaiKhoa
        ? '<span class="badge badge-danger"><i class="fa-solid fa-lock"></i> Đang bị khóa</span>'
        : '<span class="badge badge-success"><i class="fa-solid fa-check-circle"></i> Đang hoạt động</span>';

    const coSoName = u.cum_san ? u.cum_san.TenCumSan : 'Chưa gán cơ sở';
    const coSoAddress = u.cum_san ? u.cum_san.DiaChi : '';

    const hasBank = u.TenNganHang && u.STKNganHang && u.TenTaiKhoan;
    const bankBoxHtml = hasBank ? `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 12px 14px; font-size: 0.88rem; line-height: 1.6;">
            <div style="display: flex; justify-content: space-between;">
                <span style="color: #64748b;">Ngân hàng:</span>
                <strong style="color: #0f172a;">${u.TenNganHang}</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span style="color: #64748b;">Số tài khoản:</span>
                <strong style="color: #047857; font-family: monospace; font-size: 0.95rem;">${u.STKNganHang}</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span style="color: #64748b;">Chủ tài khoản:</span>
                <strong style="color: #0f172a;">${u.TenTaiKhoan}</strong>
            </div>
        </div>
    ` : `
        <div style="background: #fffbeb; border: 1px dashed #fcd34d; border-radius: 10px; padding: 12px 14px; color: #b45309; font-size: 0.86rem; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-triangle-exclamation" style="color: #f59e0b;"></i>
            <span>Nhân sự này chưa cập nhật đầy đủ thông tin tài khoản ngân hàng.</span>
        </div>
    `;

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 480px; width: 92%; padding: 0; border-radius: 16px; overflow: hidden; background: #fff; box-shadow: 0 20px 40px rgba(15, 23, 42, 0.2);">
            <div style="padding: 18px 22px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #fff; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-id-card-clip" style="font-size: 1.25rem; color: #38bdf8;"></i>
                    <h3 style="margin: 0; font-size: 1.1rem; font-weight: 700;">Hồ sơ chi tiết nhân sự</h3>
                </div>
                <i class="fa-solid fa-xmark" style="cursor: pointer; font-size: 1.2rem; color: #94a3b8;" onclick="closeInternalUserDetailModal()"></i>
            </div>

            <div style="padding: 22px;">
                <!-- Avatar & Tên -->
                <div style="display: flex; align-items: center; gap: 16px; padding-bottom: 16px; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0;">
                    <div style="width: 58px; height: 58px; border-radius: 50%; background: #eff6ff; color: #2563eb; border: 2px solid #bfdbfe; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 800; flex-shrink: 0;">
                        ${u.HoTen ? u.HoTen.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                            <h4 style="margin: 0; font-size: 1.18rem; color: #0f172a; font-weight: 800;">${u.HoTen}</h4>
                            <span style="font-family: monospace; font-size: 0.82rem; font-weight: 700; background: #f1f5f9; color: #334155; padding: 3px 8px; border-radius: 6px; border: 1px solid #cbd5e1;">Mã: ${maND}</span>
                        </div>
                        <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            ${roleLabel}
                            ${statusBadge}
                        </div>
                    </div>
                </div>

                <!-- Thông tin định danh & Liên hệ -->
                <div style="display: flex; flex-direction: column; gap: 10px; font-size: 0.9rem; margin-bottom: 18px;">
                    <div style="display: flex; justify-content: space-between; padding: 8px 12px; background: #f8fafc; border-radius: 8px;">
                        <span style="color: #64748b;"><i class="fa-solid fa-id-card" style="width: 20px; color: #3b82f6;"></i>Số định danh VNeID:</span>
                        <strong style="color: #0f172a; font-family: monospace; font-size: 0.95rem;">${u.Vneid || '<span style="color:#94a3b8; font-family:sans-serif; font-style:italic;">Chưa cập nhật</span>'}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 8px 12px; background: #f8fafc; border-radius: 8px;">
                        <span style="color: #64748b;"><i class="fa-solid fa-phone" style="width: 20px; color: #10b981;"></i>Số điện thoại:</span>
                        <strong style="color: #0f172a;">${u.SoDienThoai || 'N/A'}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 8px 12px; background: #f8fafc; border-radius: 8px;">
                        <span style="color: #64748b;"><i class="fa-solid fa-envelope" style="width: 20px; color: #f59e0b;"></i>Email:</span>
                        <strong style="color: #0f172a;">${u.Email || 'Chưa cập nhật'}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 8px 12px; background: #f8fafc; border-radius: 8px;">
                        <span style="color: #64748b; white-space: nowrap;"><i class="fa-solid fa-building-flag" style="width: 20px; color: var(--primary);"></i>Cơ sở trực thuộc:</span>
                        <div style="text-align: right;">
                            <strong style="color: var(--primary);">${coSoName}</strong>
                            ${coSoAddress ? `<div style="font-size: 0.78rem; color: #64748b; margin-top: 2px;">${coSoAddress}</div>` : ''}
                        </div>
                    </div>
                </div>

                <!-- Thông tin ngân hàng -->
                <div>
                    <div style="font-size: 0.82rem; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                        <i class="fa-solid fa-building-columns" style="color: var(--primary); margin-right: 5px;"></i>Tài khoản ngân hàng nhận lương
                    </div>
                    ${bankBoxHtml}
                </div>
            </div>

            <div style="padding: 14px 22px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px;">
                <button type="button" class="btn-primary" style="padding: 9px 24px; border-radius: 8px;" onclick="closeInternalUserDetailModal()">Đóng</button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
};

function renderUserPagination(totalPages) {
    const div = document.getElementById('user-pagination');
    if (totalPages <= 1) return div.innerHTML = '';
    
    let html = `<button class="btn-outline-sm" ${currentUserPage === 1 ? 'disabled style="opacity:0.5;"' : ''} onclick="currentUserPage--; filterAndRenderUsers()"><i class="fa-solid fa-chevron-left"></i></button>`;
    
    const getPages = (current, total) => {
        if (total <= 6) return Array.from({length: total}, (_, i) => i + 1);
        if (current <= 3) return [1, 2, 3, 4, '...', total];
        if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
        return [1, '...', current - 1, current, current + 1, '...', total];
    };

    getPages(currentUserPage, totalPages).forEach(i => {
        if (i === '...') {
            html += `<span style="padding: 6px 10px; color: var(--text-muted); font-weight: bold;">...</span>`;
        } else {
            html += `<button class="${i === currentUserPage ? 'btn-primary' : 'btn-outline-sm'}" style="padding: 6px 14px;" onclick="currentUserPage=${i}; filterAndRenderUsers()">${i}</button>`;
        }
    });

    html += `<button class="btn-outline-sm" ${currentUserPage === totalPages ? 'disabled style="opacity:0.5;"' : ''} onclick="currentUserPage++; filterAndRenderUsers()"><i class="fa-solid fa-chevron-right"></i></button>`;
    div.innerHTML = html;
}

// 2. Render Màn hình Chi tiết Khách hàng
async function renderChiTietKhachHang(id) {
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));

    currentViewedKhachHangId = id;

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `<div style="text-align:center; padding: 50px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải thông tin...</div>`;

    try {
        const response = await fetch(`${API_BASE_URL}/admin/khach-hang/${id}`);
        const res = await response.json();
        
        if (!res.success) {
            contentArea.innerHTML = `<button class="btn-back" onclick="renderQuanLyKhachHang()"><i class="fa-solid fa-arrow-left"></i> Quay lại</button><div style="text-align:center; color:red; padding: 20px;">Lỗi: ${res.message}</div>`;
            return;
        }

        const kh = res.khach_hang;
        const dsDatSan = res.lich_su_dat_san;
        const dsGiaoDich = res.lich_su_giao_dich;

        currentKhachHangDatSan = dsDatSan;

        const tk = res.thong_ke || {
            vneid: kh.Vneid || null,
            ten_ngan_hang: kh.TenNganHang || null,
            stk_ngan_hang: kh.STKNganHang || null,
            ten_tai_khoan: kh.TenTaiKhoan || null,
            tong_so_tran: dsDatSan.length,
            tong_hoan_thanh: dsDatSan.filter(d => d.TrangThai === 'HoanThanh').length,
            tong_bung_san: dsDatSan.filter(d => d.TrangThai === 'KhongDen').length,
            tong_da_chot: dsDatSan.filter(d => d.TrangThai === 'HoanThanh' || d.TrangThai === 'KhongDen').length,
            ty_le_bung: 0
        };

        if (tk.ty_le_bung === 0 && tk.tong_da_chot > 0) {
            tk.ty_le_bung = Math.round((tk.tong_bung_san / tk.tong_da_chot) * 100);
        }

        // Ô 1: Hiển thị Thông tin Tài khoản Ngân hàng của Khách hàng
        const tenNH = tk.ten_ngan_hang || kh.TenNganHang;
        const stkNH = tk.stk_ngan_hang || kh.STKNganHang;
        const chuTK = tk.ten_tai_khoan || kh.TenTaiKhoan;
        const hasBank = Boolean(tenNH && stkNH);

        const nganHangCardHtml = hasBank ? `
            <div style="font-size: 1.05rem; font-weight: 800; color: #047857; margin-top: 4px; font-family: monospace;">
                <i class="fa-solid fa-building-columns" style="margin-right: 5px;"></i>${tenNH} - ${stkNH}
            </div>
            <div style="font-size: 0.82rem; color: #475569; font-weight: 600; margin-top: 4px;">
                Chủ TK: ${chuTK || kh.HoTen}
            </div>
        ` : `
            <div style="font-size: 0.95rem; font-weight: 600; color: #94a3b8; margin-top: 8px; font-style: italic;">
                <i class="fa-solid fa-circle-info"></i> Chưa liên kết ngân hàng
            </div>
        `;

        // Ô 2: Hiển thị Số định danh VNeID / CCCD của Khách hàng
        const vneidVal = tk.vneid || kh.Vneid;
        const vneidCardHtml = vneidVal ? `
            <div class="stat-value" style="color: #2563eb; font-family: monospace; font-size: 1.35rem; letter-spacing: 0.5px;">
                <i class="fa-solid fa-id-card" style="font-size: 1.1rem; margin-right: 6px;"></i>${vneidVal}
            </div>
            <div style="font-size: 0.82rem; color: #16a34a; font-weight: 600; margin-top: 4px;">
                <i class="fa-solid fa-circle-check"></i> Đã cập nhật định danh
            </div>
        ` : `
            <div style="font-size: 0.95rem; font-weight: 600; color: #94a3b8; margin-top: 8px; font-style: italic;">
                <i class="fa-solid fa-circle-exclamation"></i> Chưa cập nhật VNeID
            </div>
        `;

        // Nút Khóa/Mở Khóa
        const lockBtnHtml = kh.TrangThaiKhoa 
            ? `<button class="btn-primary" style="background: #16a34a; border-color: #16a34a;" onclick="openKhoaKhachHangModal('${kh.ID}', true)"><i class="fa-solid fa-unlock"></i> Mở khóa tài khoản</button>`
            : `<button class="btn-primary" style="background: #ef4444; border-color: #ef4444;" onclick="openKhoaKhachHangModal('${kh.ID}', false)"><i class="fa-solid fa-lock"></i> Khóa tài khoản</button>`;

        // Render HTML
        contentArea.innerHTML = `
            <button class="btn-back" onclick="renderQuanLyKhachHang()"><i class="fa-solid fa-arrow-left"></i> Quay lại danh sách</button>
            <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding: 24px; background: white; border-radius: 12px; box-shadow: var(--shadow-sm); border: 1px solid var(--border);">
                <div style="display: flex; align-items: center; gap: 20px;">
                    <div style="width: 70px; height: 70px; border-radius: 50%; background: var(--primary-light); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: bold;">
                        ${kh.HoTen.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h1 class="page-title" style="margin-bottom: 4px;">
                            ${kh.HoTen}
                            <span style="font-size: 0.85rem; font-family: monospace; color: #475569; background: #f1f5f9; padding: 3px 8px; border-radius: 6px; margin-left: 6px; vertical-align: middle;">Mã: ${kh.MaNguoiDung || kh.ID}</span>
                            ${kh.TrangThaiKhoa ? '<span class="badge badge-danger" style="vertical-align: middle; font-size: 0.8rem; margin-left: 8px;">Bị khóa</span>' : ''}
                        </h1>
                        <div style="color: var(--text-muted); font-size: 0.95rem; display: flex; gap: 15px; margin-top: 6px;">
                            <span><i class="fa-solid fa-phone"></i> ${kh.SoDienThoai}</span>
                            <span><i class="fa-solid fa-envelope"></i> ${kh.Email || 'N/A'}</span>
                        </div>
                    </div>
                </div>
                <div>${lockBtnHtml}</div>
            </div>

            <!-- 4 Ô Thông tin & Thống kê (Đã thay thế Số dư ví & Tổng tiền nạp) -->
            <div class="stat-grid" style="margin-bottom: 24px;">
                <div class="stat-card">
                    <div class="stat-title">Tài khoản ngân hàng</div>
                    ${nganHangCardHtml}
                </div>
                <div class="stat-card">
                    <div class="stat-title">Số định danh VNeID</div>
                    ${vneidCardHtml}
                </div>
                <div class="stat-card">
                    <div class="stat-title">Tổng số trận đặt</div>
                    <div class="stat-value">${tk.tong_so_tran} trận</div>
                    <div style="font-size: 0.85rem; color: #047857; margin-top: 4px; font-weight: 600;">(Hoàn thành: ${tk.tong_hoan_thanh ?? 0} trận)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-title">Tỷ lệ bùng sân</div>
                    <div class="stat-value" style="color: ${tk.ty_le_bung >= 30 ? '#ef4444' : '#047857'};">${tk.ty_le_bung}%</div>
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">(${tk.tong_bung_san} bùng / ${tk.tong_da_chot} chốt)</div>
                </div>
            </div>

            <!-- Lịch sử Đặt sân -->
            <div class="panel">
                <div style="display: flex; gap: 20px; border-bottom: 1px solid var(--border);">
                    <button class="nav-tab active" onclick="switchKhachHangTab('tab-ls-datsan', this)" style="margin-left: 20px; padding: 12px 0; border: none; background: transparent; font-weight: 600; cursor: pointer; border-bottom: 2px solid var(--primary); color: var(--primary);">Lịch sử Đặt sân</button>

                    <div id="kh-filter-container" style="display: flex; justify-content: flex-end; align-items: center; margin-left: auto; margin-right: 20px;">
                        <select class="form-control" style="width: 200px;" onchange="filterKHDatsan(this.value)">
                            <option value="All">Tất cả trạng thái</option>
                            <option value="DaCoc">Đã cọc</option>
                            <option value="HoanThanh">Hoàn thành</option>
                            <option value="DaHuy">Đã hủy</option>
                            <option value="KhongDen">Không đến</option>
                        </select>
                    </div>
                </div>

                <!-- Bảng Đặt Sân -->
                <div id="tab-ls-datsan" class="tab-pane active">
                    <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                        <table class="admin-table">
                            <thead style="position: sticky; top: 0; background: #F8FAFC;">
                                <tr>
                                    <th>Thông tin sân</th>
                                    <th>Khung giờ & Ngày đá</th>
                                    <th>Tổng tiền</th>
                                    <th>Trạng thái</th>
                                </tr>
                            </thead>
                            <tbody id="kh-datsan-tbody">
                                ${renderKhachHangDatSanTable(dsDatSan)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    } catch (e) {
        console.error(e);
        contentArea.innerHTML = `<div style="text-align:center; color:red; padding: 20px;">Lỗi kết nối máy chủ!</div>`;
    }
}

// Hàm hỗ trợ Render dòng trong Bảng Đặt Sân của chi tiết KH
function renderKhachHangDatSanTable(dsDatSan) {
    if (dsDatSan.length === 0) return `<tr><td colspan="4" class="text-center" style="text-align: center;">Khách hàng chưa đặt sân nào.</td></tr>`;
    
    return dsDatSan.map(item => {
        let badgeColor = '#6b7280', badgeBg = '#f3f4f6', viStatus = item.TrangThai;
        if(item.TrangThai === 'DaCoc') { badgeColor = '#b45309'; badgeBg = '#fef3c7'; viStatus = 'Đã cọc'; }
        else if(item.TrangThai === 'DaHuy') { badgeColor = '#b91c1c'; badgeBg = '#fee2e2'; viStatus = 'Đã hủy'; }
        else if(item.TrangThai === 'HoanThanh') { badgeColor = '#047857'; badgeBg = '#d1fae5'; viStatus = 'Hoàn thành'; }
        else if(item.TrangThai === 'KhongDen') { badgeColor = '#6b7280'; badgeBg = '#f3f4f6'; viStatus = 'Không đến'; }

        const badgeHtml = `<span style="padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; background: ${badgeBg}; color: ${badgeColor};">${viStatus}</span>`;
        const timeStr = item.khung_gio ? `${item.khung_gio.GioBatDau.substring(0,5)} - ${item.khung_gio.GioKetThuc.substring(0,5)}` : '';
        const d = new Date(item.NgayDa);
        const dateStr = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;

        return `<tr>
            <td>
                <strong>${item.san_bong ? item.san_bong.TenSan : 'N/A'}</strong> ${item.ID_GiaiDau ? `<span style="font-size:0.7rem; background:#e0e7ff; color:#4338ca; padding:2px 6px; border-radius:4px;">Giải đấu</span>` : ''}<br>
                <span style="font-size:0.85rem; color:var(--text-muted);"><i class="fa-solid fa-location-dot"></i> ${item.san_bong && item.san_bong.cum_san ? item.san_bong.cum_san.TenCumSan : ''}</span>
            </td>
            <td>
                <span style="font-size: 0.9rem;">${dateStr}</span><br>
                <strong style="color: var(--primary);">${timeStr}</strong>
            </td>
            <td><strong style="color: #ea580c;">${Number(item.TongTien).toLocaleString('vi-VN')}đ</strong></td>
            <td>${badgeHtml}</td>
        </tr>`;
    }).join('');
}

function filterKHDatsan(status) {
    const tbody = document.getElementById('kh-datsan-tbody');
    if (!tbody) return;

    let filteredData = currentKhachHangDatSan;
    
    // Nếu không phải chọn 'All', thì lọc theo đúng trạng thái được chọn
    if (status !== 'All') {
        filteredData = currentKhachHangDatSan.filter(item => item.TrangThai === status);
    }

    // Tận dụng lại hàm renderKhachHangDatSanTable đã viết để vẽ lại ruột bảng
    tbody.innerHTML = renderKhachHangDatSanTable(filteredData);
}

// Hàm hỗ trợ Render dòng trong Bảng Giao Dịch của chi tiết KH
function renderKhachHangGiaoDichTable(dsGiaoDich) {
    if (dsGiaoDich.length === 0) return `<tr><td colspan="4" class="text-center" style="text-align: center;">Khách hàng chưa có giao dịch nào.</td></tr>`;
    
    return dsGiaoDich.map(item => {
        const isCong = item.DongTien === 'Cong';
        const sign = isCong ? '+' : '-';
        const color = isCong ? '#047857' : '#b91c1c';
        
        let dateStr = '';
        if (item.NgayTao) {
            const d = new Date(item.NgayTao);
            const pad = n => n < 10 ? '0' + n : n;
            dateStr = `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
        }

        return `<tr>
            <td style="font-family: monospace; color: var(--text-muted);">#GD${item.ID}</td>
            <td><strong>${item.NoiDung || item.LoaiGiaoDich}</strong></td>
            <td><span style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> ${dateStr}</span></td>
            <td><strong style="color: ${color}; font-size: 1.05rem;">${sign}${Number(item.SoTien).toLocaleString('vi-VN')}đ</strong></td>
        </tr>`;
    }).join('');
}

// 3. Hàm chuyển Tab nội bộ trong màn hình chi tiết KH
function switchKhachHangTab(tabId, btnElement) {
    const tabs = btnElement.parentElement.children;
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
        tabs[i].style.borderBottom = 'none';
        tabs[i].style.color = 'var(--text-muted)';
    }
    btnElement.classList.add('active');
    btnElement.style.borderBottom = '2px solid var(--primary)';
    btnElement.style.color = 'var(--primary)';

    const tabDatSan = document.getElementById('tab-ls-datsan');
    const tabGiaoDich = document.getElementById('tab-ls-giaodich');

    if (tabDatSan) tabDatSan.style.display = 'none';
    if (tabGiaoDich) tabGiaoDich.style.display = 'none';
    
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.style.display = 'block';

    const filterContainer = document.getElementById('kh-filter-container');
    if (filterContainer) {
        if (tabId === 'tab-ls-datsan') {
            filterContainer.style.display = 'flex';
        } else {
            filterContainer.style.display = 'none';
        }
    }
}

// 4. API Gọi lệnh Khóa / Mở Khóa tài khoản
let pendingKhoaUserId = null;
let pendingKhoaStatus = null;

function openKhoaKhachHangModal(id, isCurrentlyLocked) {
    pendingKhoaUserId = id;
    pendingKhoaStatus = isCurrentlyLocked;

    // Tự động tạo Modal bám vào body nếu chưa tồn tại
    let modal = document.getElementById('khoa-kh-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'khoa-kh-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 9999;';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; text-align: center; padding: 30px 20px;">
                <div style="font-size: 3.5rem; color: #f59e0b; margin-bottom: 15px;"><i class="fa-solid fa-circle-exclamation"></i></div>
                <h3 id="khoa-kh-title" style="margin-bottom: 10px; font-size: 1.4rem;">Xác nhận</h3>
                <p id="khoa-kh-msg" style="color: var(--text-muted); margin-bottom: 25px; line-height: 1.5;"></p>
                
                <div id="khoa-kh-alert" class="modal-alert" style="display: none; margin-bottom: 15px; text-align: left;"></div>

                <div style="display: flex; justify-content: center; gap: 12px;">
                    <button class="btn-outline" style="width: auto; padding: 10px 24px;" onclick="closeKhoaKhachHangModal()">Hủy bỏ</button>
                    <button id="khoa-kh-btn" class="btn-primary" style="width: auto; padding: 10px 24px;" onclick="executeToggleKhoaKhachHang()">Đồng ý</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Reset thông báo lỗi nếu có từ lần trước
    const alertBox = document.getElementById('khoa-kh-alert');
    if (alertBox) alertBox.style.display = 'none';

    // Đổi Tiêu đề, Lời nhắn và Màu Nút tùy theo trạng thái
    document.getElementById('khoa-kh-title').innerText = isCurrentlyLocked ? 'Mở Khóa Tài Khoản' : 'Khóa Tài Khoản';
    document.getElementById('khoa-kh-msg').innerHTML = isCurrentlyLocked 
        ? 'Bạn có chắc chắn muốn <strong style="color: #16a34a;">MỞ KHÓA</strong> chức năng đặt sân cho khách hàng này không?' 
        : 'Khách hàng này sẽ bị <strong style="color: #ef4444;">KHÓA</strong> chức năng đặt sân. Bạn có chắc chắn?';
    
    const btnConfirm = document.getElementById('khoa-kh-btn');
    btnConfirm.style.backgroundColor = isCurrentlyLocked ? '#16a34a' : '#ef4444';
    btnConfirm.style.borderColor = isCurrentlyLocked ? '#16a34a' : '#ef4444';

    modal.style.display = 'flex';
}

function closeKhoaKhachHangModal() {
    const modal = document.getElementById('khoa-kh-modal');
    if (modal) modal.style.display = 'none';
    pendingKhoaUserId = null;
    pendingKhoaStatus = null;
}

async function executeToggleKhoaKhachHang() {
    if (!pendingKhoaUserId) return;

    const btn = document.getElementById('khoa-kh-btn');
    const alertBox = document.getElementById('khoa-kh-alert');
    
    // Đổi UI báo đang tải
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    btn.disabled = true;
    alertBox.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE_URL}/admin/khach-hang/${pendingKhoaUserId}/khoa`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
        });
        
        const res = await response.json();
        
        if (response.ok && res.success) {
            alertBox.textContent = res.message;
            alertBox.className = 'modal-alert success';
            alertBox.style.display = 'block';
            alertBox.style.textAlign = 'center';

            // 1. Phục hồi ngay lập tức trạng thái nút bấm
            btn.innerHTML = 'Đồng ý';
            btn.disabled = false;

            // 2. Lưu lại ID khách hàng
            const idToRender = pendingKhoaUserId;

            // 3. Đợi 1.5 giây cho Admin đọc thông báo rồi điều hướng
            setTimeout(() => {
                closeKhoaKhachHangModal();
                
                // NẾU LÀ KHÁCH HÀNG -> Nhảy vào xem chi tiết
                if (currentRoleTab === 'KhachHang') {
                    renderChiTietKhachHang(idToRender);
                } 
                // NẾU LÀ TÀI KHOẢN NỘI BỘ -> Chỉ tải lại danh sách (tránh nhảy màn hình trắng)
                else {
                    loadDanhSachUsersAPI();
                }
                
            }, 1500);

        } else {
            alertBox.textContent = res.message || 'Có lỗi xảy ra!';
            alertBox.className = 'modal-alert error';
            alertBox.style.display = 'block';
            
            btn.innerHTML = 'Đồng ý';
            btn.disabled = false;
        }
    } catch (e) {
        alertBox.textContent = 'Lỗi kết nối máy chủ!';
        alertBox.className = 'modal-alert error';
        alertBox.style.display = 'block';
        
        btn.innerHTML = 'Đồng ý';
        btn.disabled = false;
    }
}

// ======================================================
// MODULE: ADMIN - TỔNG QUAN (DASHBOARD)
// ======================================================
let dashboardChartInstance = null;
let dashboardFilterCumSan = 'all';
let dashboardFilterTime = 'hom_nay';
let dashboardStaffMonth = '';
let dashboardStaffCumSan = 'all';

async function renderTongQuan() {
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    if (!currentUser) return;

    dashboardFilterCumSan = 'all';
    dashboardFilterTime = 'hom_nay';
    dashboardStaffCumSan = 'all';

    // Mặc định lấy tháng-năm hiện tại (MM-YYYY)
    const today = new Date();
    const curMonth = String(today.getMonth() + 1).padStart(2, '0');
    const curYear = today.getFullYear();
    dashboardStaffMonth = `${curMonth}-${curYear}`;

    // Tạo danh sách Tháng/Năm cho bộ lọc hiệu suất nhân viên
    let staffMonthOptions = '';
    for (let y = curYear; y >= 2024; y--) {
        for (let m = 12; m >= 1; m--) {
            if (y === curYear && m > (today.getMonth() + 1)) continue;
            const mm = String(m).padStart(2, '0');
            const val = `${mm}-${y}`;
            const selected = (val === dashboardStaffMonth) ? 'selected' : '';
            staffMonthOptions += `<option value="${val}" ${selected}>Tháng ${mm}/${y}</option>`;
        }
    }

    // Active Menu Tổng quan
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = Array.from(document.querySelectorAll('.sidebar-nav a')).find(a => a.textContent.includes('TỔNG QUAN'));
    if (menuLink) menuLink.classList.add('active');

    const contentArea = document.querySelector('.admin-content');
    
    let selectCumSanHtml = '';
    let selectStaffCumSanHtml = '';
    
    // CHỈ RENDER DROPDOWN CỤM SÂN NẾU LÀ ADMIN
    if (currentUser.VaiTro === 'Admin') {
        try {
            const csRes = await fetch(`${API_BASE_URL}/cum-san`);
            const csData = await csRes.json();
            const optHtml = csData.data.map(cs => `<option value="${cs.ID}">${cs.TenCumSan}</option>`).join('');
            
            // Đổi lọc cụm sân ở Biểu đồ -> truyền 'chart'
            selectCumSanHtml = `
                <select class="form-control" style="width: 200px;" onchange="dashboardFilterCumSan=this.value; updateDashboardStats('chart')">
                    <option value="all">Tất cả Cụm Sân</option>
                    ${optHtml}
                </select>`;

            // Đổi lọc cụm sân ở Bảng nhân viên -> truyền 'staff'
            selectStaffCumSanHtml = `
                <select class="form-control" style="width: 200px;" onchange="dashboardStaffCumSan=this.value; updateDashboardStats('staff')">
                    <option value="all">Tất cả Cụm Sân</option>
                    ${optHtml}
                </select>`;
        } catch(e) {}
    }

    contentArea.innerHTML = `
        <div class="page-header" style="margin-bottom: 24px;">
            <h1 class="page-title">Tổng quan hệ thống</h1>
            <p class="text-muted">Thống kê nhanh các chỉ số hoạt động của DN FOOTBALL</p>
        </div>
        
        <div id="dashboard-alert-container"></div>

        <div class="stat-grid" style="margin-bottom: 24px;">
            <div class="stat-card">
                <div class="stat-title">Doanh thu hôm nay</div>
                <div id="stat-doanh-thu" class="stat-value" style="color: #047857;">...</div>
            </div>
            <div class="stat-card">
                <div class="stat-title">Tổng số trận hôm nay</div>
                <div id="stat-so-tran" class="stat-value" style="color: #2563eb;">...</div>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">(Hoàn thành / Đã chốt)</div>
            </div>
            <div class="stat-card">
                <div class="stat-title">Tổng Khách Hàng</div>
                <div id="stat-khach-hang" class="stat-value" style="color: #8b5cf6;">...</div>
            </div>
            <div class="stat-card">
                <div class="stat-title">Yêu cầu chờ xử lý</div>
                <div id="stat-cho-duyet" class="stat-value" style="color: #ea580c;">...</div>
            </div>
        </div>

        <div class="chart-layout" style="margin-bottom: 24px;">
            <div class="panel">
                <div class="panel-header" style="display:flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <div style="font-size: 1.1rem; color: var(--text-dark); margin-bottom: 6px;">Biểu đồ doanh thu</div>
                        <div style="display: flex; align-items: baseline; gap: 8px;">
                            <span id="chart-total-amount" style="font-size: 1.8rem; font-weight: 800; color: #16A34A; letter-spacing: -0.5px;">...đ</span>
                            <span style="font-size: 0.85rem; color: #64748b; background: #f8fafc; padding: 4px 10px; border-radius: 12px; border: 1px solid #e2e8f0;">
                                <i class="fa-solid fa-circle-info" style="margin-right: 4px; color: #3b82f6;"></i>Doanh thu đặt sân & giải đấu
                            </span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        ${selectCumSanHtml}
                        <!-- Đổi thời gian ở Biểu đồ -> truyền 'chart' -->
                        <select class="form-control" style="width: 170px;" onchange="dashboardFilterTime=this.value; updateDashboardStats('chart')">
                            <option value="hom_nay" selected>Hôm nay</option>
                            <option value="hom_truoc">Hôm qua</option>
                            <option value="7_ngay">7 ngày gần đây</option>
                            <option value="30_ngay">1 tháng gần đây</option>
                            <option value="nam">Năm nay</option>
                        </select>
                    </div>
                </div>
                <div style="padding: 15px 0;">
                    <canvas id="revenueChart" height="100"></canvas>
                </div>
            </div>
        </div>

        <!-- BẢNG THỐNG KÊ HIỆU SUẤT CHỐT SÂN CỦA NHÂN VIÊN THEO TỪNG NGÀY TRONG THÁNG -->
        <div class="panel">
            <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid #e2e8f0;">
                <div>
                    <div style="font-size: 1.08rem; font-weight: 700; color: var(--text-dark);">
                        <i class="fa-solid fa-user-check" style="color: var(--primary); margin-right: 6px;"></i>
                        Thống kê lượt chốt đặt sân của Nhân viên theo ngày
                    </div>
                    <div style="font-size: 0.83rem; color: var(--text-muted); font-weight: normal; margin-top: 3px;">
                        Chỉ tính các vé đặt sân ở trạng thái <strong style="color: #047857;">Hoàn thành</strong> hoặc <strong style="color: #b45309;">Không đến</strong> do tài khoản <strong>Nhân viên</strong> trực tiếp xử lý.
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    ${selectStaffCumSanHtml}
                    <!-- Đổi tháng ở Bảng nhân viên -> truyền 'staff' -->
                    <select class="form-control" style="width: 165px; height: 38px; border-radius: 8px; font-weight: 600; color: var(--primary); border-color: var(--primary); background: #f0fdf4;" onchange="dashboardStaffMonth=this.value; updateDashboardStats('staff')">
                        ${staffMonthOptions}
                    </select>
                </div>
            </div>

            <div class="table-responsive" style="max-height: 440px; overflow-x: auto; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; margin-top: 12px;">
                <table class="admin-table" style="min-width: max-content; margin: 0; border-collapse: separate; border-spacing: 0;">
                    <thead id="staff-perf-thead" style="background: #F8FAFC; position: sticky; top: 0; z-index: 20;">
                    </thead>
                    <tbody id="staff-perf-tbody">
                        <tr><td colspan="10" class="text-center" style="padding: 30px; text-align: center;">Đang tải dữ liệu...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // Khởi tạo Chart mặc định rỗng
    const ctx = document.getElementById('revenueChart').getContext('2d');
    dashboardChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: { responsive: true }
    });

    // Lần đầu tiên mở trang -> Cập nhật toàn bộ ('all')
    updateDashboardStats('all');
}

/**
 * Cập nhật dữ liệu thống kê theo từng vùng độc lập:
 * @param {string} scope - 'all' (tất cả), 'chart' (chỉ biểu đồ & 4 thẻ trên), 'staff' (chỉ bảng hiệu suất nhân viên)
 */
async function updateDashboardStats(scope = 'all') {
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    if (!document.getElementById('revenueChart') || !document.getElementById('stat-doanh-thu')) return;

    // Nếu chỉ lọc bảng nhân viên, hiển thị hiệu ứng mờ nhẹ ở bảng nhân viên trong lúc tải
    const staffTbody = document.getElementById('staff-perf-tbody');
    if (scope === 'staff' && staffTbody) {
        staffTbody.style.opacity = '0.4';
        staffTbody.style.transition = 'opacity 0.15s ease';
    }

    try {
        const url = `${API_BASE_URL}/admin/thong-ke?id_cum_san=${dashboardFilterCumSan}&time_filter=${dashboardFilterTime}&staff_month=${dashboardStaffMonth}&staff_cum_san=${dashboardStaffCumSan}`;
        const response = await fetch(url);
        const res = await response.json();

        if (!res.success) return;
        const data = res.data;

        // =========================================================
        // VÙNG 1: CẬP NHẬT 4 THẺ TRÊN CÙNG & BIỂU ĐỒ (Chỉ chạy khi scope === 'all' hoặc 'chart')
        // =========================================================
        if (scope === 'all' || scope === 'chart') {
            // Cập nhật Cảnh báo quên chốt sân (Chỉ quản lý mới bị nhắc)
            const alertContainer = document.getElementById('dashboard-alert-container');
            if (currentUser.VaiTro === 'QuanLySan' && data.so_san_quen_chot > 0) {
                const d = new Date(); d.setDate(d.getDate() - 1);
                const pad = n => n < 10 ? '0' + n : n;
                const yesterday = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

                alertContainer.innerHTML = `
                    <div style="background: #fef2f2; border: 1px solid #f87171; border-left: 4px solid #ef4444; color: #b91c1c; padding: 16px 20px; border-radius: 8px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 6px rgba(239, 68, 68, 0.1);">
                        <div>
                            <h4 style="margin: 0 0 4px 0; font-size: 1.05rem;"><i class="fa-solid fa-triangle-exclamation"></i> CẢNH BÁO: CHƯA CHỐT SÂN NGÀY HÔM TRƯỚC</h4>
                            <p style="margin: 0; font-size: 0.9rem;">Hệ thống phát hiện có <strong>${data.so_san_quen_chot}</strong> lịch đặt sân của ngày hôm trước vẫn đang ở trạng thái "Đã cọc". Vui lòng kiểm tra và chốt sân ngay!</p>
                        </div>
                        <button onclick="renderQuanLyDatSan('DaCoc', '${yesterday}')" style="background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s;">Xử lý ngay</button>
                    </div>`;
            } else {
                alertContainer.innerHTML = '';
            }

            // Cập nhật 4 chỉ số trên cùng
            document.getElementById('stat-doanh-thu').innerText = `${Number(data.doanh_thu_hom_nay).toLocaleString('vi-VN')}đ`;
            document.getElementById('stat-so-tran').innerText = `${data.booking_hoan_thanh_hom_nay}/${data.booking_hom_nay} trận`;
            document.getElementById('stat-khach-hang').innerText = `${data.tong_khach_hang} người`;
            document.getElementById('stat-cho-duyet').innerText = `${data.cho_duyet} đơn`;

            // Cập nhật tổng tiền và Biểu đồ Doanh thu / Chi phí
            const labels = data.chart.map(c => c.ngay);
            const revenueData = data.chart.map(c => c.doanh_thu);
            const expenseData = data.chart.map(c => c.chi_phi);

            const totalRevenue = revenueData.reduce((sum, amount) => sum + Number(amount), 0);
            const totalExpense = expenseData.reduce((sum, amount) => sum + Number(amount), 0);
            const netProfit = totalRevenue - totalExpense;
            const profitColor = netProfit >= 0 ? '#10b981' : '#ef4444';

            document.getElementById('chart-total-amount').innerHTML = `
                Thu: ${totalRevenue.toLocaleString('vi-VN')}đ 
                <span style="font-size: 1rem; font-weight: 600; color: #ef4444; margin-left: 10px;">(Chi: ${totalExpense.toLocaleString('vi-VN')}đ)</span>
                <span style="font-size: 1rem; font-weight: 600; color: ${profitColor}; margin-left: 10px;">(Lãi: ${netProfit.toLocaleString('vi-VN')}đ)</span>
            `;

            const ctx = document.getElementById('revenueChart').getContext('2d');
            if (dashboardChartInstance) {
                dashboardChartInstance.destroy();
            }

            const chartType = (dashboardFilterTime === 'hom_nay' || dashboardFilterTime === 'hom_truoc') ? 'bar' : 'line';

            dashboardChartInstance = new Chart(ctx, {
                type: chartType,
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Tổng thu (VNĐ)',
                            data: revenueData,
                            borderColor: '#16A34A',
                            backgroundColor: 'rgba(22, 163, 74, 0.4)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.3,
                            borderRadius: 4
                        },
                        {
                            label: 'Tổng chi (VNĐ)',
                            data: expenseData,
                            borderColor: '#ef4444',
                            backgroundColor: 'rgba(239, 68, 68, 0.4)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.3,
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: true, position: 'bottom' } },
                    scales: {
                        x: { grid: { display: false } },
                        y: { 
                            beginAtZero: true, 
                            border: { display: false },
                            ticks: { callback: value => value.toLocaleString('vi-VN') + 'đ' } 
                        }
                    }
                }
            });
        }

        // =========================================================
        // VÙNG 2: CẬP NHẬT BẢNG HIỆU SUẤT NHÂN VIÊN (Chỉ chạy khi scope === 'all' hoặc 'staff')
        // =========================================================
        if (scope === 'all' || scope === 'staff') {
            const perf = data.staff_performance;
            const thead = document.getElementById('staff-perf-thead');
            const tbody = document.getElementById('staff-perf-tbody');

            if (perf && thead && tbody) {
                const daysCount = perf.days_in_month || 30;
                const staffList = perf.list || [];
                const isAdmin = currentUser.VaiTro === 'Admin';

                // 1. Vẽ Header: Cột Nhân viên (Sticky) + Cột Tổng tháng (Sticky) + Các ngày 01 -> 30/31
                let headHtml = `<tr>
                    <th style="position: sticky; left: 0; z-index: 25; background: #f1f5f9; min-width: 210px; border-right: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1;">Nhân viên${isAdmin ? ' / Cơ sở' : ''}</th>
                    <th style="position: sticky; left: 210px; z-index: 25; background: #eff6ff; color: #1d4ed8; min-width: 120px; text-align: center; border-right: 2px solid #cbd5e1; border-bottom: 1px solid #cbd5e1;">Tổng chốt tháng</th>
                `;
                for (let d = 1; d <= daysCount; d++) {
                    const dayLabel = String(d).padStart(2, '0');
                    headHtml += `<th style="min-width: 48px; text-align: center; padding: 10px 6px; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #cbd5e1; font-size: 0.82rem; color: #475569;">Ngày<br>${dayLabel}</th>`;
                }
                headHtml += `</tr>`;
                thead.innerHTML = headHtml;

                // 2. Vẽ Body từng nhân viên
                if (staffList.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="${daysCount + 2}" style="padding: 35px; text-align: center; color: var(--text-muted);">Không có nhân viên nào thuộc phạm vi lọc hiện tại.</td></tr>`;
                } else {
                    tbody.innerHTML = staffList.map(nv => {
                        let dayCells = '';
                        for (let d = 1; d <= daysCount; d++) {
                            const cellObj = nv.ngay && nv.ngay[d] ? nv.ngay[d] : { tong: 0, hoan_thanh: 0, khong_den: 0 };
                            if (cellObj.tong > 0) {
                                const tooltip = `Ngày ${String(d).padStart(2, '0')}: Chốt ${cellObj.tong} sân (Hoàn thành: ${cellObj.hoan_thanh}, Không đến: ${cellObj.khong_den})`;
                                dayCells += `
                                    <td style="text-align: center; vertical-align: middle; padding: 8px 4px; border-right: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9; background: #f0fdf4;" title="${tooltip}">
                                        <span style="display: inline-block; min-width: 26px; padding: 2px 6px; border-radius: 12px; background: #10b981; color: #fff; font-weight: 700; font-size: 0.82rem;">${cellObj.tong}</span>
                                    </td>`;
                            } else {
                                dayCells += `<td style="text-align: center; vertical-align: middle; padding: 8px 4px; border-right: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9; color: #cbd5e1; font-size: 0.8rem;">-</td>`;
                            }
                        }

                        const subInfo = isAdmin
                            ? `<div style="font-size: 0.78rem; color: var(--primary); font-weight: 600; margin-top: 2px;"><i class="fa-solid fa-location-dot"></i> ${nv.ten_cum_san}</div>`
                            : `<div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;"><i class="fa-solid fa-phone" style="font-size: 0.7rem;"></i> ${nv.so_dien_thoai || 'N/A'}</div>`;

                        return `
                            <tr>
                                <td style="position: sticky; left: 0; z-index: 10; background: #fff; min-width: 210px; border-right: 1px solid #cbd5e1; border-bottom: 1px solid #f1f5f9;">
                                    <strong style="color: var(--text-dark); font-size: 0.92rem;">${nv.ho_ten}</strong>
                                    ${subInfo}
                                </td>
                                <td style="position: sticky; left: 210px; z-index: 10; background: #f8fafc; min-width: 120px; text-align: center; border-right: 2px solid #cbd5e1; border-bottom: 1px solid #f1f5f9;">
                                    <strong style="color: #1d4ed8; font-size: 1.05rem;">${nv.tong_chot_thang}</strong> <span style="font-size: 0.8rem; color: #64748b;">lượt</span>
                                    <div style="font-size: 0.72rem; color: #64748b; margin-top: 2px;">
                                        <span style="color: #047857; font-weight: 600;" title="Hoàn thành">${nv.tong_hoan_thanh} HT</span> / 
                                        <span style="color: #b45309; font-weight: 600;" title="Khách không đến">${nv.tong_khong_den} KĐ</span>
                                    </div>
                                </td>
                                ${dayCells}
                            </tr>
                        `;
                    }).join('');
                }
            }
        }

    } catch (e) { 
        console.error('Lỗi load thống kê', e); 
    } finally {
        if (staffTbody) {
            staffTbody.style.opacity = '1';
        }
    }
}

// ======================================================
// MODULE: TRỢ LÝ ẢO AI CHATBOT CHO ADMIN (READ-ONLY)
// ======================================================
let isAdminChatOpen = false;

// 1. Mở / Đóng cửa sổ Chat Admin
function toggleAdminChatWindow() {
    const container = document.getElementById('admin-chatbot-container');
    isAdminChatOpen = !isAdminChatOpen;
    
    if (isAdminChatOpen) {
        container.style.display = 'flex';
        loadAdminChatSessions(); 
        
        if (!document.getElementById('current-admin-chat-id').value) {
            createNewAdminChatSession();
        }
    } else {
        container.style.display = 'none';
    }
}

// Lắng nghe sự kiện Enter để gửi tin nhắn
document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('admin-chat-input-text');
    if (chatInput) {
        chatInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendAdminChatMessage();
            }
        });
    }
});

// 2. Tải danh sách các Phiên Chat
async function loadAdminChatSessions() {
    const sidebarList = document.getElementById('admin-chat-sidebar-list');
    try {
        // Tái sử dụng API lấy danh sách phiên chat (tự nhận diện ID Admin qua session)
        const response = await fetch(`${API_BASE_URL}/chatbot/phien-chat`);
        const res = await response.json();

        if (res.success && res.data.length > 0) {
            let html = '';
            res.data.forEach(phien => {
                const activeId = document.getElementById('current-admin-chat-id').value;
                const isActive = (String(phien.ID) === String(activeId)) ? 'background: #e2e8f0; border-left: 4px solid #1e293b;' : 'background: transparent; border-left: 4px solid transparent;';
                
                let tieuDe = phien.TieuDe ? phien.TieuDe : 'Báo cáo mới';
                if (tieuDe.length > 25) tieuDe = tieuDe.substring(0, 25) + '...';

                html += `
                    <div style="padding: 12px; margin-bottom: 8px; border-radius: 8px; cursor: pointer; transition: 0.2s; position: relative; ${isActive}" onclick="loadAdminChatDetails('${phien.ID}')">
                        <div style="font-weight: 600; font-size: 0.9rem; color: #334155; padding-right: 20px;">${tieuDe}</div>
                        
                        <div class="chat-action-menu" style="position: absolute; right: 10px; top: 10px;" onclick="event.stopPropagation()">
                            <i class="fa-solid fa-ellipsis-vertical" style="color: #94a3b8; padding: 4px 8px; cursor: pointer;" onclick="toggleAdminChatDropdown('${phien.ID}')"></i>
                            <div id="admin-chat-dropdown-${phien.ID}" style="display: none; position: absolute; right: 0; top: 25px; background: white; border: 1px solid var(--border); box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-radius: 8px; width: 120px; z-index: 10;">
                                <div style="padding: 8px 12px; font-size: 0.85rem; cursor: pointer; border-bottom: 1px solid #f1f5f9; color: var(--text-dark);" onclick="openAdminRenameChatModal('${phien.ID}', '${tieuDe.replace(/'/g, "\\'")}')"><i class="fa-solid fa-pen" style="margin-right: 6px;"></i> Đổi tên</div>
                                <div style="padding: 8px 12px; font-size: 0.85rem; cursor: pointer; color: #ef4444;" onclick="openAdminDeleteChatModal('${phien.ID}')"><i class="fa-solid fa-trash-can" style="margin-right: 6px;"></i> Xóa</div>
                            </div>
                        </div>
                    </div>
                `;
            });
            sidebarList.innerHTML = html;
        } else {
            sidebarList.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.9rem; margin-top: 20px;">Chưa có lịch sử báo cáo</div>`;
        }
    } catch (e) {
        console.error('Lỗi load danh sách chat Admin', e);
    }
}

// 3. Tạo màn hình chat mới tinh
function createNewAdminChatSession() {
    document.getElementById('current-admin-chat-id').value = '';
    document.getElementById('admin-chat-header-title').innerText = 'Trợ lý Báo Cáo AI';
    
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    const greeting = currentUser.VaiTro === 'Admin' 
        ? 'Xin chào Sếp! Tôi là Trợ lý phân tích dữ liệu toàn hệ thống DN FOOTBALL. Sếp cần tôi báo cáo số liệu gì hôm nay?'
        : 'Xin chào Quản lý! Tôi là Trợ lý phân tích dữ liệu của cụm sân. Bạn cần báo cáo số liệu gì hôm nay?';

    const msgArea = document.getElementById('admin-chat-messages-area');
    msgArea.innerHTML = `
        <div class="chat-msg bot" style="align-self: flex-start; max-width: 85%;">
            <div style="background: white; padding: 12px 16px; border-radius: 0 12px 12px 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); color: #334155; line-height: 1.6; border: 1px solid #e2e8f0;">
                ${greeting}
            </div>
        </div>
    `;
    loadAdminChatSessions(); 
}

// 4. Tải chi tiết nội dung 1 Phiên Chat
async function loadAdminChatDetails(id) {
    document.getElementById('current-admin-chat-id').value = id;
    const msgArea = document.getElementById('admin-chat-messages-area');
    msgArea.innerHTML = `<div style="text-align:center; padding:20px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Đang trích xuất dữ liệu...</div>`;
    
    loadAdminChatSessions();

    try {
        const response = await fetch(`${API_BASE_URL}/chatbot/phien-chat/${id}`);
        const res = await response.json();

        if (res.success) {
            document.getElementById('admin-chat-header-title').innerText = res.phien_chat.TieuDe || 'Báo cáo hệ thống';
            msgArea.innerHTML = ''; 
            
            res.data.forEach(msg => {
                appendAdminMessageToUI(msg.NguoiGui, msg.NoiDung);
            });
            scrollToBottomAdminChat();
        }
    } catch (e) {
        msgArea.innerHTML = `<div style="text-align:center; color: red;">Lỗi kết nối máy chủ!</div>`;
    }
}

// 5. Gửi tin nhắn lên AI DÀNH RIÊNG CHO ADMIN
async function sendAdminChatMessage() {
    const inputEl = document.getElementById('admin-chat-input-text');
    const text = inputEl.value.trim();
    if (!text) return;

    const activeChatId = document.getElementById('current-admin-chat-id').value;
    const btnSend = document.getElementById('btn-send-admin-chat');

    inputEl.value = '';
    inputEl.disabled = true;
    btnSend.disabled = true;
    
    appendAdminMessageToUI('User', text);
    scrollToBottomAdminChat();

    // Hiệu ứng "Đang phân tích..."
    const loadingId = 'admin-typing-' + Date.now();
    const msgArea = document.getElementById('admin-chat-messages-area');
    msgArea.innerHTML += `
        <div id="${loadingId}" class="chat-msg bot" style="align-self: flex-start; max-width: 85%;">
            <div style="background: white; padding: 12px 16px; border-radius: 0 12px 12px 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; color: #1e293b; font-size: 0.9rem; font-style: italic;">
                <i class="fa-solid fa-magnifying-glass-chart fa-beat-fade" style="margin-right: 8px;"></i> Đang truy xuất dữ liệu hệ thống...
            </div>
        </div>
    `;
    scrollToBottomAdminChat();

    try {
        const payload = { noi_dung: text };
        if (activeChatId) payload.id_phien_chat = activeChatId;

        // BẮN VÀO ROUTE MỚI CỦA ADMIN
        const response = await fetch(`${API_BASE_URL}/chatbot/admin-chat`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        document.getElementById(loadingId).remove();

        if (response.ok && data.success) {
            if (!activeChatId && data.id_phien_chat) {
                document.getElementById('current-admin-chat-id').value = data.id_phien_chat;
            }
            
            appendAdminMessageToUI('Bot', data.reply);
            loadAdminChatSessions();
        } else {
            appendAdminMessageToUI('Bot', `<span style="color:red"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi: ${data.message || 'Hệ thống bận'}</span>`);
        }

    } catch (e) {
        document.getElementById(loadingId)?.remove();
        appendAdminMessageToUI('Bot', '<span style="color:red"><i class="fa-solid fa-wifi"></i> Mất kết nối đến máy chủ quản trị!</span>');
    } finally {
        inputEl.disabled = false;
        btnSend.disabled = false;
        inputEl.focus();
        scrollToBottomAdminChat();
    }
}

// Hàm hỗ trợ vẽ bong bóng chat Admin
function appendAdminMessageToUI(role, text) {
    const msgArea = document.getElementById('admin-chat-messages-area');
    
    // Convert in đậm và xuống dòng
    let formattedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formattedText = formattedText.replace(/\n/g, '<br>');

    if (role === 'User') {
        msgArea.innerHTML += `
            <div class="chat-msg user" style="align-self: flex-end; max-width: 80%;">
                <div style="background: #1e293b; color: white; padding: 12px 16px; border-radius: 12px 12px 0 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); line-height: 1.5;">
                    ${formattedText}
                </div>
            </div>
        `;
    } else {
        msgArea.innerHTML += `
            <div class="chat-msg bot" style="align-self: flex-start; max-width: 85%;">
                <div style="background: white; color: #334155; padding: 12px 16px; border-radius: 0 12px 12px 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; line-height: 1.6;">
                    ${formattedText}
                </div>
            </div>
        `;
    }
}

function scrollToBottomAdminChat() {
    const msgArea = document.getElementById('admin-chat-messages-area');
    msgArea.scrollTop = msgArea.scrollHeight;
}

// Bắt sự kiện click ra ngoài để đóng chat
document.addEventListener('pointerdown', function (event) {
    const chatbotContainer = document.getElementById('admin-chatbot-container');
    const openChatbotButton = document.getElementById('btn-open-admin-chatbot');

    const renameModal = document.getElementById('admin-rename-chat-modal');
    const deleteModal = document.getElementById('admin-delete-chat-modal');

    if (!isAdminChatOpen || !chatbotContainer) return;
    
    // ==================================================
    // 1. ĐANG CLICK TRONG MODAL ĐỔI TÊN -> BỎ QUA
    // ==================================================
    if (renameModal && renameModal.style.display !== 'none' && renameModal.contains(event.target)) {
        return;
    }

    // ==================================================
    // 2. ĐANG CLICK TRONG MODAL XÓA -> BỎ QUA
    // ==================================================
    if (deleteModal && deleteModal.style.display !== 'none' && deleteModal.contains(event.target)) {
        return;
    }

    // ==================================================
    // 3. CLICK BÊN TRONG CHATBOT HOẶC NÚT MỞ CHATBOT -> BỎ QUA
    // ==================================================
    if (chatbotContainer.contains(event.target) || (openChatbotButton && openChatbotButton.contains(event.target))) {
        return;
    }

    chatbotContainer.style.display = 'none';
    isAdminChatOpen = false;
}, true);

// Tắt/bật menu 3 chấm
function toggleAdminChatDropdown(id) {
    const allDropdowns = document.querySelectorAll('[id^="admin-chat-dropdown-"]');
    allDropdowns.forEach(d => {
        if (d.id !== `admin-chat-dropdown-${id}`) d.style.display = 'none';
    });
    const dropdown = document.getElementById(`admin-chat-dropdown-${id}`);
    if(dropdown) {
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
    }
}

// Click ra ngoài tự đóng menu 3 chấm
window.addEventListener('click', () => {
    document.querySelectorAll('[id^="admin-chat-dropdown-"]').forEach(d => d.style.display = 'none');
});

// ==========================================
// CÁC MODAL QUẢN LÝ PHIÊN CHAT ADMIN (ĐỔI TÊN/XÓA)
// ==========================================
function openAdminRenameChatModal(id, currentName) {
    document.getElementById('admin-rename-chat-id').value = id;
    document.getElementById('admin-rename-chat-original').value = currentName;
    document.getElementById('admin-rename-chat-input').value = currentName;
    
    const btnRename = document.getElementById('btn-admin-confirm-rename');
    btnRename.disabled = true;
    btnRename.style.opacity = '0.5';
    btnRename.style.cursor = 'not-allowed';

    document.getElementById('admin-rename-chat-modal').style.display = 'flex';
}

function openAdminDeleteChatModal(id) {
    document.getElementById('admin-delete-chat-id').value = id;
    document.getElementById('admin-delete-chat-modal').style.display = 'flex';
}

function closeAdminChatModal(type) {
    if (type === 'rename') {
        document.getElementById('admin-rename-chat-modal').style.display = 'none';
    } else if (type === 'delete') {
        document.getElementById('admin-delete-chat-modal').style.display = 'none';
    }
}

function checkAdminRenameChange() {
    const inputVal = document.getElementById('admin-rename-chat-input').value.trim();
    const originalVal = document.getElementById('admin-rename-chat-original').value;
    const btnRename = document.getElementById('btn-admin-confirm-rename');

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

async function executeAdminRenameChat() {
    const id = document.getElementById('admin-rename-chat-id').value;
    const newName = document.getElementById('admin-rename-chat-input').value.trim();
    const btn = document.getElementById('btn-admin-confirm-rename');

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
            closeAdminChatModal('rename');
            loadAdminChatSessions(); // Update UI
            
            // Cập nhật tiêu đề bên phải nếu đang mở đúng phiên này
            if(document.getElementById('current-admin-chat-id').value === id) {
                document.getElementById('admin-chat-header-title').innerText = newName;
            }
        } else {
            alert(data.message || 'Lỗi khi đổi tên!');
        }
    } catch (e) {
        alert('Lỗi kết nối máy chủ!');
    } finally {
        btn.innerHTML = 'Đổi tên';
    }
}

async function executeAdminDeleteChat() {
    const id = document.getElementById('admin-delete-chat-id').value;
    const btn = document.getElementById('btn-admin-confirm-delete');

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xóa...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/chatbot/phien-chat/${id}`, {
            method: 'DELETE',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
        });

        const data = await response.json();
        if (response.ok && data.success) {
            closeAdminChatModal('delete');
            loadAdminChatSessions();
            
            // Nếu phiên vừa xóa là phiên đang mở -> clear màn hình
            if (document.getElementById('current-admin-chat-id').value === id) {
                createNewAdminChatSession();
            }
        } else {
            alert(data.message || 'Lỗi khi xóa!');
        }
    } catch (e) {
        alert('Lỗi kết nối máy chủ!');
    } finally {
        btn.innerHTML = 'Xóa';
        btn.disabled = false;
    }
}

// ======================================================
// MODULE: ADMIN - CẤP TÀI KHOẢN (ADMIN)
// ======================================================
function renderCapTaiKhoan() {
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    const isAdmin = currentUser.VaiTro === 'Admin';

    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = Array.from(document.querySelectorAll('.sidebar-nav a')).find(a => a.textContent.includes('CẤP TÀI KHOẢN'));
    if (menuLink) menuLink.classList.add('active');

    let vaiTroOptions = '';
    if (isAdmin) {
        vaiTroOptions = `
            <option value="QuanLySan" selected>Quản lý Cụm Sân</option>
            <option value="NhanVien">Nhân viên Thu ngân/Phục vụ</option>
            <option value="Admin">Admin (Toàn quyền)</option>
        `;
    } else {
        vaiTroOptions = `<option value="NhanVien" selected>Nhân viên Thu ngân/Phục vụ</option>`;
    }

    let cumSanHtml = '';
    if (isAdmin) {
        cumSanHtml = `
            <div class="form-group" id="tk-group-cumsan">
                <label style="font-weight: 600;">Cơ sở quản lý <span style="color: red;">*</span></label>
                <select id="tk-cumsan" class="form-control">
                    <option value="">-- Đang tải dữ liệu sân --</option>
                </select>
            </div>
        `;
    } else {
        cumSanHtml = `<input type="hidden" id="tk-cumsan" value="">`;
    }

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="margin-bottom: 24px;">
            <h1 class="page-title">Cấp tài khoản Nội bộ</h1>
            <p class="text-muted">Tạo tài khoản quản trị phân quyền cho Ban quản lý, Nhân viên hoặc Admin</p>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 350px; gap: 24px; align-items: start;">
            <!-- Form Card -->
            <div class="panel" style="padding: 30px;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 25px; border-bottom: 1px solid var(--border); padding-bottom: 15px;">
                    <div style="width: 45px; height: 45px; border-radius: 10px; background: #eff6ff; color: #3b82f6; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;"><i class="fa-solid fa-user-shield"></i></div>
                    <div>
                        <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-dark);">Thông tin định danh</h3>
                        <span style="font-size: 0.85rem; color: var(--text-muted);">Điền đầy đủ thông tin bắt buộc để khởi tạo tài khoản</span>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div class="form-group">
                        <label style="font-weight: 600;">Họ và tên <span style="color: red;">*</span></label>
                        <input type="text" id="tk-hoten" class="form-control" placeholder="VD: Nguyễn Văn A">
                    </div>
                    <div class="form-group">
                        <label style="font-weight: 600;">Số điện thoại <span style="color: red;">*</span></label>
                        <input type="text" id="tk-sdt" class="form-control" placeholder="Dùng để đăng nhập" maxlength="15">
                    </div>
                    <div class="form-group">
                        <label style="font-weight: 600;">Email <span style="color: red;">*</span></label>
                        <input type="email" id="tk-email" class="form-control" placeholder="Dùng để nhận thông báo">
                    </div>
                    <div class="form-group">
                        <label style="font-weight: 600;">Số định danh VNeID / CCCD <span style="color: red;">*</span></label>
                        <input type="text" id="tk-vneid" class="form-control" placeholder="Nhập 12 chữ số định danh" maxlength="12">
                    </div>
                    <div class="form-group" style="grid-column: 1 / -1;">
                        <label style="font-weight: 600;">Mật khẩu khởi tạo <span style="color: red;">*</span></label>
                        <input type="text" id="tk-matkhau" class="form-control" value="123456" placeholder="Ít nhất 6 ký tự">
                    </div>
                </div>

                <div style="margin-top: 15px; border-top: 1px dashed var(--border); padding-top: 20px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div class="form-group">
                            <label style="font-weight: 600;">Vai trò phân quyền <span style="color: red;">*</span></label>
                            <select id="tk-vaitro" class="form-control" style="border-color: #3b82f6; background: #f8fafc;" onchange="toggleCumSanSelect(this.value)">
                                ${vaiTroOptions}
                            </select>
                        </div>
                        ${cumSanHtml}
                    </div>
                </div>

                <div style="margin-top: 30px; display: flex; justify-content: flex-end;">
                    <button id="btn-create-tk" class="btn-primary" style="padding: 12px 30px; font-size: 1rem; border-radius: 8px;" onclick="executeTaoTaiKhoan()">
                        <i class="fa-solid fa-user-plus" style="margin-right: 8px;"></i> Khởi tạo tài khoản
                    </button>
                </div>
            </div>

            <!-- Hướng dẫn Card -->
            <div class="panel" style="padding: 25px; background: linear-gradient(to bottom, #f8fafc, #ffffff);">
                <h4 style="margin: 0 0 15px 0; color: var(--primary);"><i class="fa-solid fa-circle-info"></i> Hướng dẫn phân quyền</h4>
                <ul style="padding-left: 20px; color: var(--text-muted); font-size: 0.9rem; line-height: 1.7;">
                    <li style="margin-bottom: 10px;"><strong style="color: var(--text-dark);">Admin:</strong> Có toàn quyền xem báo cáo doanh thu tổng và quản lý hệ thống. Không thuộc cụm sân nào.</li>
                    <li style="margin-bottom: 10px;"><strong style="color: var(--text-dark);">Quản lý sân:</strong> Quản lý lịch đặt, nhân viên, kho hàng và cấu hình giá của Cụm sân được chỉ định.</li>
                    <li><strong style="color: var(--text-dark);">Nhân viên:</strong> Thực hiện các nghiệp vụ điểm danh ca làm, xử lý đặt sân và thu ngân tại cụm sân được chỉ định.</li>
                </ul>
            </div>
        </div>
    `;

    if (isAdmin) {
        loadCumSanForDropdown();
    }
}

function toggleCumSanSelect(vaiTro) {
    const group = document.getElementById('tk-group-cumsan');
    // Bổ sung thêm điều kiện: Nếu là Quản lý sân HOẶC Nhân viên thì đều phải chọn cơ sở
    if (vaiTro === 'QuanLySan' || vaiTro === 'NhanVien') {
        group.style.display = 'block';
    } else {
        group.style.display = 'none';
        document.getElementById('tk-cumsan').value = ''; // Xóa giá trị khi chọn Admin
    }
}

async function loadCumSanForDropdown() {
    try {
        const response = await fetch(`${API_BASE_URL}/cum-san`);
        const res = await response.json();
        if (res.success) {
            const select = document.getElementById('tk-cumsan');
            select.innerHTML = '<option value="">-- Bấm để chọn Cụm Sân --</option>' + res.data.map(cs => `<option value="${cs.ID}">${cs.TenCumSan}</option>`).join('');
        }
    } catch (e) {
        console.log("Lỗi tải dropdown cụm sân", e);
    }
}

async function executeTaoTaiKhoan() {
    const btn = document.getElementById('btn-create-tk');
    
    const ho_ten = document.getElementById('tk-hoten').value.trim();
    const so_dien_thoai = document.getElementById('tk-sdt').value.trim();
    const email = document.getElementById('tk-email').value.trim();
    const vneid = document.getElementById('tk-vneid').value.trim();
    const mat_khau = document.getElementById('tk-matkhau').value;
    const vai_tro = document.getElementById('tk-vaitro').value;
    const id_cum_san = document.getElementById('tk-cumsan').value;

    if (!ho_ten || !so_dien_thoai || !email || !vneid || !mat_khau) {
        return showSystemModal('Thiếu thông tin', 'Vui lòng điền đầy đủ Họ tên, SĐT, Email, Số VNeID và Mật khẩu (*).', 'error');
    }

    if (!/^[0-9]{9,12}$/.test(vneid)) {
        return showSystemModal('VNeID không hợp lệ', 'Số định danh VNeID / CCCD phải gồm từ 9 đến 12 chữ số!', 'error');
    }

    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    if (currentUser.VaiTro === 'Admin' && (vai_tro === 'QuanLySan' || vai_tro === 'NhanVien') && !id_cum_san) {
        return showSystemModal('Chưa chọn cơ sở', 'Vui lòng chọn Cụm Sân trực thuộc.', 'error');
    }

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right: 8px;"></i> Đang tạo...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/admin/cap-tai-khoan`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ ho_ten, so_dien_thoai, email, vneid, mat_khau, vai_tro, id_cum_san })
        });
        const data = await response.json();
        
        if (response.ok && data.user) {
            showSystemModal('Thành công!', 'Tài khoản nội bộ đã được khởi tạo thành công.', 'success');
            
            document.getElementById('tk-hoten').value = '';
            document.getElementById('tk-sdt').value = '';
            document.getElementById('tk-email').value = '';
            document.getElementById('tk-vneid').value = '';
            document.getElementById('tk-matkhau').value = '123456';
        } else {
            const errorMsg = data.errors ? data.errors[Object.keys(data.errors)[0]][0] : data.message;
            showSystemModal('Không thể tạo tài khoản', errorMsg, 'error');
        }
    } catch (e) {
        showSystemModal('Lỗi kết nối', 'Mất kết nối đến máy chủ. Vui lòng thử lại sau.', 'error');
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-user-plus" style="margin-right: 8px;"></i> Khởi tạo tài khoản'; 
        btn.disabled = false;
    }
}

// ======================================================
// HÀM TIỆN ÍCH: CUSTOM MODAL ALERT
// ======================================================
function showSystemModal(title, message, type = 'success') {
    let modal = document.getElementById('system-alert-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'system-alert-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 100000; align-items: center; justify-content: center;';
        document.body.appendChild(modal);
    }

    const iconHtml = type === 'success' 
        ? '<i class="fa-solid fa-circle-check" style="color: #10b981; font-size: 3.5rem;"></i>' 
        : '<i class="fa-solid fa-circle-xmark" style="color: #ef4444; font-size: 3.5rem;"></i>';
    const btnColor = type === 'success' ? '#10b981' : '#ef4444';

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 350px; text-align: center; padding: 30px 20px; border-radius: 16px; transform: scale(0.9); animation: modalPop 0.3s ease forwards;">
            <div style="margin-bottom: 15px;">${iconHtml}</div>
            <h3 style="margin-bottom: 10px; font-size: 1.3rem; color: var(--text-dark);">${title}</h3>
            <p style="color: var(--text-muted); margin-bottom: 25px; line-height: 1.5; font-size: 0.95rem;">${message}</p>
            <button onclick="document.getElementById('system-alert-modal').style.display='none'" style="background: ${btnColor}; color: white; border: none; padding: 10px 30px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; width: 100%;">Đóng</button>
        </div>
        <style>@keyframes modalPop { to { transform: scale(1); } }</style>
    `;
    modal.style.display = 'flex';

    if (type === 'success') {
        if (modal.hideTimeout) clearTimeout(modal.hideTimeout);
        
        modal.hideTimeout = setTimeout(() => {
            if (modal.style.display === 'flex') {
                modal.style.display = 'none';
            }
        }, 2000);
    }
}

// ======================================================
// MODULE: ADMIN XEM LỊCH SÂN VÀ ĐẶT HỘ (OFFLINE)
// ======================================================

async function renderAdminSchedule(clusterId, pitchName, pitchId, loaiSanId) {
    currentPitchId = pitchId;
    currentCumSanId = clusterId;
    currentLoaiSanId = loaiSanId;
    window.currentPitchNameAdmin = pitchName;
    
    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `<div style="text-align:center; padding: 50px;"><i class="fa-solid fa-spinner fa-spin text-primary" style="font-size: 2rem;"></i><br><br>Đang tải ma trận lịch...</div>`;

    try {
        const [gtRes, kgRes, dsRes] = await Promise.all([
            fetch(`${API_BASE_URL}/gia-tien?cum_san_id=${clusterId}`),
            fetch(`${API_BASE_URL}/khung-gio`),
            fetch(`${API_BASE_URL}/dat-san/da-dat?id_san_bong=${pitchId}`)
        ]);

        const giaTienData = (await gtRes.json()).data || [];
        const allKhungGio = (await kgRes.json()).data || [];
        const bookedSlots = (await dsRes.json()).data || [];

        const validPrices = giaTienData.filter(gt => gt.ID_LoaiSan == loaiSanId);

        if (allKhungGio.length === 0 || validPrices.length === 0) {
            contentArea.innerHTML = `
                <button class="btn-back" onclick="renderCumSanDetail(${clusterId})"><i class="fa-solid fa-arrow-left"></i> Quay lại cấu hình sân</button>
                <div style="text-align:center; padding: 50px; color: red;">Chưa cấu hình Bảng giá cho loại sân này!</div>
            `;
            return;
        }

        let dateArray = [];
        const today = new Date();
        for(let i = 0; i < 7; i++) {
            let d = new Date(today); 
            d.setDate(today.getDate() + i);
            const pad = n => n < 10 ? '0' + n : n;
            dateArray.push({
                short: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
                dbFormat: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
                displayFormat: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
            });
        }

        let html = `
            <button class="btn-back" onclick="renderCumSanDetail('${clusterId}')"><i class="fa-solid fa-arrow-left"></i> Quay lại cấu hình sân</button>
            <div class="page-header" style="margin-top: 10px; margin-bottom: 20px;">
                <h1 class="page-title">Lịch trống: ${pitchName}</h1>
                <p class="text-muted">Bấm vào ô CÒN TRỐNG để chọn nhiều khung giờ giữ sân.</p>
            </div>
            
            <div class="schedule-container" style="margin-bottom: 40px;">
                <div style="width: 100%; max-height: calc(100vh - 250px); overflow-y: auto; overflow-x: auto;"> 
                    <table class="schedule-table">
                        <thead>
                            <tr>
                                <th style="width: 140px; min-width: 140px; position: sticky; top: 0; left: 0; z-index: 60;">Khung giờ</th>
                                <th style="width: 110px; min-width: 110px; position: sticky; top: 0; left: 140px; z-index: 59;">Giá tiền</th>
                                ${dateArray.map(d => `<th style="min-width: 110px; position: sticky; top: 0; z-index: 50;">${d.short}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
        `;

        const now = new Date();

        allKhungGio.forEach((kg) => {
            const priceInfo = validPrices.find(p => p.ID_KhungGio == kg.ID);
            const isValid = priceInfo && priceInfo.SoTien > 0;
            const displayStyle = isValid ? '' : 'display: none;';
            const priceValue = priceInfo ? priceInfo.SoTien : 0;
            const displayPrice = isValid ? `${Number(priceValue).toLocaleString('vi-VN')}đ` : '-';
            const timeStr = `${kg.GioBatDau.substring(0,5)} - ${kg.GioKetThuc.substring(0,5)}`;

            html += `
                <tr style="${displayStyle}">
                    <td style="position: sticky; left: 0; z-index: 20; background: #fff; font-weight: bold;">${timeStr}</td>
                    <td style="position: sticky; left: 140px; z-index: 19; background: #fff; color: var(--primary); font-weight: 600;">${displayPrice}</td>
            `;
                        
            dateArray.forEach((date) => {
                const isBooked = bookedSlots.some(b => b.NgayDa === date.dbFormat && b.ID_KhungGio === kg.ID);
                const [startHour, startMinute] = kg.GioBatDau.split(':');
                const [y, m, d] = date.dbFormat.split('-');
                const slotDateTime = new Date(y, m - 1, d, startHour, startMinute);
                const isPast = slotDateTime <= now; 
                
                // Định danh Slot = PitchID + NgayDa + KhungGioID
                const slotId = `${pitchId}-${date.dbFormat}-${kg.ID}`;
                const isSelected = selectedOfflineSlots.some(s => s.id === slotId);
                
                let statusClass = 'available', statusText = 'CÒN TRỐNG';
                
                // Nén data vào chuỗi để đẩy vào hàm onclick
                const slotDataStr = `'${pitchId}', '${kg.ID}', '${date.dbFormat}', '${date.displayFormat}', '${timeStr}', ${priceValue}`;
                let onClickAttr = `data-slot-data="${slotDataStr}" onclick="toggleOfflineSlot(this, ${slotDataStr})"`;
                
                if (isPast) {
                    statusClass = 'booked'; statusText = 'Quá giờ'; onClickAttr = '';
                } else if (!isValid) {
                    statusClass = 'booked'; statusText = 'Đóng'; onClickAttr = '';
                } else if (isBooked) { 
                    statusClass = 'booked'; statusText = 'Đã đặt'; onClickAttr = '';
                } else if (isSelected) {
                    statusClass = 'available selected'; statusText = 'ĐÃ CHỌN ✓';
                }
                
                html += `<td><div class="slot ${statusClass}" data-slot-id="${slotId}" ${onClickAttr}>${statusText}</div></td>`;
            });
            html += `</tr>`;
        });
        html += `</tbody></table></div></div>`;
        contentArea.innerHTML = html;

        // Cập nhật giỏ hàng ngay khi vừa vẽ lại (để tránh mất UI giỏ hàng khi Admin F5)
        updateOfflineCartUI();

    } catch (e) { 
        contentArea.innerHTML = `<div style="text-align:center; color:red; padding: 50px;">Lỗi tải dữ liệu lịch!</div>`;
    }
}

// Hàm Chọn/Bỏ chọn ô
window.toggleOfflineSlot = function(element, pitchId, kgId, dateDb, dateDisplay, timeStr, price) {
    if (element.classList.contains('booked')) return;
    
    const slotId = `${pitchId}-${dateDb}-${kgId}`;
    const existingIndex = selectedOfflineSlots.findIndex(s => s.id === slotId);
    
    if (existingIndex > -1) {
        selectedOfflineSlots.splice(existingIndex, 1);
        element.classList.remove('selected'); 
        element.innerText = 'CÒN TRỐNG';
    } else {
        selectedOfflineSlots.push({ 
            id: slotId, 
            clusterId: currentCumSanId,
            pitchId, 
            kgId, 
            dateDb, 
            dateDisplay, 
            timeStr, 
            price,
            pitchName: window.currentPitchNameAdmin,
            clusterName: window.currentClusterNameAdmin
        });
        element.classList.add('selected'); 
        element.innerText = 'ĐÃ CHỌN ✓';
    }
    
    updateOfflineCartUI();
};

function clearOfflineCart() {
    const slotsToRemove = [...selectedOfflineSlots];
    selectedOfflineSlots = [];
    
    // Nhả màu trực tiếp
    slotsToRemove.forEach(slot => {
        const el = document.querySelector(`.schedule-table .slot[data-slot-id="${slot.id}"]`);
        if (el) {
            el.classList.remove('selected');
            el.innerText = 'CÒN TRỐNG';
        }
    });
    
    updateOfflineCartUI();
}

function updateOfflineCartUI() {
    const cartBar = document.getElementById('admin-floating-cart');
    if (!cartBar) return;

    if (selectedOfflineSlots.length > 0) {
        cartBar.style.display = 'block';
        document.getElementById('admin-cart-count').innerText = selectedOfflineSlots.length;
        const total = selectedOfflineSlots.reduce((sum, s) => sum + Number(s.price), 0);
        document.getElementById('admin-cart-total').innerText = total.toLocaleString('vi-VN') + 'đ';
    } else {
        cartBar.style.display = 'none';
        closeOfflineModal(); // Đóng Modal nếu đang mở mà xóa hết
    }
}

function openOfflineCartModal() {
    document.getElementById('offline-booking-alert').style.display = 'none';
    const listContainer = document.getElementById('offline-cart-list');
    
    let html = '';
    let totalAmount = 0;
    
    selectedOfflineSlots.forEach((s, index) => {
        totalAmount += Number(s.price);
        html += `
            <div class="cart-item-card">
                <div class="cart-item-info">
                    <h4 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 4px; color: var(--primary);">${s.clusterName || 'Cụm sân'} - ${s.pitchName || 'Sân'}</h4>
                    <p style="margin-bottom: 2px; color: var(--text-muted); font-size: 0.85rem;">Ngày: <strong style="color: var(--text-dark);">${s.dateDisplay}</strong> | Giờ: <strong style="color: var(--text-dark);">${s.timeStr}</strong></p>
                    <p style="color: #ea580c; font-weight: 600; font-size: 0.95rem; margin-top: 2px;">${Number(s.price).toLocaleString('vi-VN')}đ</p>
                </div>
                <i class="fa-solid fa-trash-can cart-item-remove" onclick="removeSlotFromCartModal(${index})" style="font-size: 1.15rem;"></i>
            </div>
        `;
    });
    
    listContainer.innerHTML = html;

    document.getElementById('off-total-price').value = totalAmount;
    
    // Mặc định gợi ý cọc 30% làm chẵn
    document.getElementById('off-deposit').value = Math.round(totalAmount * 0.3);
    document.getElementById('offline-booking-modal').style.display = 'flex';
}

// Xóa 1 phần tử ngay trong Modal Giỏ hàng
window.removeSlotFromCartModal = function(index) {
    const removedSlot = selectedOfflineSlots[index];
    if (!removedSlot) return;
    
    selectedOfflineSlots.splice(index, 1);
    
    // Nhả màu trên lưới
    const el = document.querySelector(`.schedule-table .slot[data-slot-id="${removedSlot.id}"]`);
    if (el) {
        el.classList.remove('selected');
        el.innerText = 'CÒN TRỐNG';
    }
    
    updateOfflineCartUI();
    if (selectedOfflineSlots.length > 0) {
        openOfflineCartModal(); // Render lại danh sách trong Modal
    }
};

function closeOfflineModal() {
    document.getElementById('offline-booking-modal').style.display = 'none';
}

// Hàm Thực thi gọi API Đặt hộ
async function submitOfflineBooking() {
    const sdt = document.getElementById('off-phone').value.trim();
    const ten = document.getElementById('off-name').value.trim();
    const tienCoc = document.getElementById('off-deposit').value;
    
    const tongTienSan = Number(document.getElementById('off-total-price').value);

    const alertBox = document.getElementById('offline-booking-alert');
    alertBox.style.display = 'none';

    if (!sdt) {
        alertBox.textContent = "Số điện thoại là bắt buộc để lưu lịch sử cho khách!";
        alertBox.className = "modal-alert error";
        alertBox.style.display = "block";
        return;
    }

    if (Number(tienCoc) > tongTienSan) {
        alertBox.textContent = `Tiền cọc (${Number(tienCoc).toLocaleString('vi-VN')}đ) không được vượt quá tổng tiền sân (${tongTienSan.toLocaleString('vi-VN')}đ)!`;
        alertBox.className = "modal-alert error";
        alertBox.style.display = "block";
        
        // Nhấp nháy ô tiền cọc để gây chú ý
        const depositInput = document.getElementById('off-deposit');
        depositInput.style.borderColor = '#ef4444';
        depositInput.focus();
        setTimeout(() => depositInput.style.borderColor = '#cbd5e1', 2000);
        return;
    }

    const btn = document.getElementById('btn-submit-offline');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    btn.disabled = true;

    try {
        const payload = {
            sdt_khach: sdt,
            ho_ten: ten,
            tien_coc: tienCoc,
            slots: selectedOfflineSlots // Truyền toàn bộ mảng lên Backend
        };

        const response = await fetch(`${API_BASE_URL}/admin/dat-san-ho`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // 1. Tự động chuyển các ô trên lưới sang xám "Đã đặt"
            const bookedSlotIds = selectedOfflineSlots.map(s => s.id);
            bookedSlotIds.forEach(id => {
                const el = document.querySelector(`.schedule-table .slot[data-slot-id="${id}"]`);
                if (el) {
                    el.classList.remove('selected', 'available');
                    el.classList.add('booked');
                    el.innerText = 'Đã đặt';
                    el.removeAttribute('onclick');
                }
            });

            // 2. Reset giỏ hàng và ẩn thanh Floating Cart
            selectedOfflineSlots = []; 
            updateOfflineCartUI();     

            // 3. Đóng Modal ngay lập tức
            closeOfflineModal();
            btn.disabled = false;
            btn.innerHTML = 'Chốt giữ sân';

            if (data.ma_hoa_don || (data.ma_hoa_dons && data.ma_hoa_dons.length > 0)) {
                openOfflineBookingSuccessInvoiceModal(data.ma_hoa_don, data.ma_hoa_dons || []);
            } else {
                showSystemModal("Thành công", "Đã chốt giữ sân thành công!", "success");
            }
            
        } else {
            alertBox.textContent = data.message || "Lỗi xử lý!";
            alertBox.className = "modal-alert error";
            alertBox.style.display = "block";
            btn.disabled = false;
            btn.innerHTML = 'Chốt giữ sân';
            
            // Xử lý báo trùng lịch và xóa khỏi mảng
            if (data.failed_slot_ids) {
                selectedOfflineSlots = selectedOfflineSlots.filter(s => !data.failed_slot_ids.includes(s.id));
                updateOfflineCartUI();
                
                data.failed_slot_ids.forEach(id => {
                    const el = document.querySelector(`.schedule-table .slot[data-slot-id="${id}"]`);
                    if (el) {
                        el.classList.remove('selected', 'available');
                        el.classList.add('booked');
                        el.innerText = 'Đã đặt';
                        el.removeAttribute('onclick');
                    }
                });
                
                setTimeout(() => {
                    if (selectedOfflineSlots.length > 0) openOfflineCartModal();
                    else closeOfflineModal();
                }, 3000);
            }
        }
    } catch (e) {
        alertBox.textContent = "Mất kết nối tới máy chủ!";
        alertBox.className = "modal-alert error";
        alertBox.style.display = "block";
        btn.disabled = false;
        btn.innerHTML = 'Chốt giữ sân';
    }
}

function openOfflineBookingSuccessInvoiceModal(maHoaDon, maHoaDons = []) {
    let modal = document.getElementById('offline-invoice-ask-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'offline-invoice-ask-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 100000; align-items: center; justify-content: center;';
        document.body.appendChild(modal);
    }

    const invoiceList = (Array.isArray(maHoaDons) && maHoaDons.length > 0)
        ? maHoaDons
        : (maHoaDon ? [maHoaDon] : []);

    const printBtnsHtml = invoiceList.map(idHD => `
        <button type="button" class="btn-primary" style="flex: 1.3; padding: 10px; background: #2563eb; border-color: #2563eb; white-space: nowrap;" onclick="document.getElementById('offline-invoice-ask-modal').style.display='none'; printAdminBookingInvoice('${idHD}');">
            <i class="fa-solid fa-print"></i> Xuất HĐ #${idHD}
        </button>
    `).join('');

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 440px; width: 92%; text-align: center; padding: 28px 24px; border-radius: 16px;">
            <div style="font-size: 3.4rem; color: #10b981; margin-bottom: 12px;"><i class="fa-solid fa-circle-check"></i></div>
            <h3 style="margin-bottom: 8px; font-size: 1.3rem;">Giữ sân thành công!</h3>
            <p style="color: var(--text-muted); margin-bottom: 22px; font-size: 0.93rem; line-height: 1.5;">
                Đã tạo hóa đơn đặt sân <strong>#${invoiceList.join(', #')}</strong>.<br>
                <strong style="color:#0f172a;">Bạn có muốn xuất hóa đơn đặt sân cho khách không?</strong>
            </p>
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                <button type="button" class="btn-outline" style="flex: 1; padding: 10px;" onclick="document.getElementById('offline-invoice-ask-modal').style.display='none'">Đóng</button>
                ${printBtnsHtml}
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

// ======================================================
// MODULE: QUẢN LÝ XẾP LỊCH LÀM VIỆC (DÀNH CHO QUẢN LÝ SÂN)
// ======================================================

// Helper lấy mảng 7 ngày của 1 tuần (offsetWeeks = 0 là tuần này, 1 là tuần sau)
function getWeekDatesAdmin(offsetWeeks = 0) {
    let curr = new Date();
    let first = curr.getDate() - curr.getDay() + 1 + (offsetWeeks * 7); 
    if (curr.getDay() === 0) first -= 7; 
    let monday = new Date(curr.setDate(first));
    
    let dates = [];
    for(let i=0; i<7; i++) {
        let next = new Date(monday);
        next.setDate(monday.getDate() + i);
        
        // FIX LỖI MÚI GIỜ: Lấy chính xác ngày theo Local
        const yyyy = next.getFullYear();
        const mm = String(next.getMonth() + 1).padStart(2, '0');
        const dd = String(next.getDate()).padStart(2, '0');

        dates.push({
            dbDate: `${yyyy}-${mm}-${dd}`,
            display: `${dd}/${mm}`,
            dayName: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][next.getDay()]
        });
    }
    return dates;
}

let isNextWeekLocked = false;
let isForceUnlockedNextWeek = false;
window.adminShiftCache = {};

function renderLichLamViecAdmin() {
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = document.getElementById('menu-lichlamviec');
    if (menuLink) menuLink.classList.add('active');

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
            <div>
                <h1 class="page-title">Xếp lịch làm việc</h1>
                <p class="text-muted">Quản lý và điều phối nhân sự trực sân</p>
            </div>
            <button class="btn-outline-sm" style="color: var(--primary); border-color: var(--primary);" onclick="openCauHinhCaModal()"><i class="fa-solid fa-gear"></i> Cấu hình Ca làm việc</button>
        </div>

        <div class="panel">
            <div style="display: flex; gap: 20px; border-bottom: 1px solid var(--border); margin-bottom: 20px; padding: 0 20px;">
                <button class="nav-tab active" onclick="switchAdminCalTab('admin-cal-current', this)" style="padding: 15px 10px; border: none; background: transparent; font-weight: 600; cursor: pointer; border-bottom: 2px solid var(--primary); color: var(--primary);">Tuần Hiện Tại</button>
                <button class="nav-tab" onclick="switchAdminCalTab('admin-cal-next', this)" style="padding: 15px 10px; border: none; background: transparent; font-weight: 600; cursor: pointer; color: var(--text-muted);">Tuần Sau</button>
                <button class="nav-tab" onclick="switchAdminCalTab('admin-cal-chamcong', this)" style="padding: 15px 10px; border: none; background: transparent; font-weight: 600; cursor: pointer; color: var(--text-muted);">Chấm Công / Bảng Công</button>
            </div>

            <!-- LƯỚI 1: TUẦN HIỆN TẠI -->
            <div id="admin-cal-current" class="tab-pane active" style="padding: 0 20px 20px 20px;">
                <div style="display: flex; gap: 20px; align-items: flex-start;">
                    <!-- Lưới View (Đã thêm min-width: 0 để cho phép scroll ngang) -->
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; justify-content: flex-end; margin-bottom: 15px;">
                            <button id="btn-edit-current-week" class="btn-outline-sm" style="color: #f59e0b; border-color: #fcd34d;" onclick="toggleEditModeCurrentWeek()"><i class="fa-solid fa-pen-to-square"></i> Chỉnh sửa ca đột xuất</button>
                        </div>
                        <div id="grid-current-week">Đang tải...</div>
                    </div>
                    
                    <!-- Box ca của tôi (NẾU QUẢN LÝ CÓ CA) -->
                    <div id="manager-my-shifts-container" style="display: none; width: 300px; flex-shrink: 0; background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; padding: 15px;">
                        <h4 style="margin: 0 0 15px 0; color: var(--primary); font-size: 1rem;"><i class="fa-solid fa-user-clock"></i> Các ca bạn trực tuần này</h4>
                        <div id="manager-my-shifts-list">Đang tải...</div>
                    </div>
                </div>
            </div>

            <!-- LƯỚI 2: TUẦN SAU -->
            <div id="admin-cal-next" class="tab-pane" style="display: none; padding: 0 20px 20px 20px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;">
                    
                    <!-- Lưới lịch tuần sau -->
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; justify-content: flex-end; margin-bottom: 15px; gap: 10px;">
                            <button id="btn-cancel-edit-next-week" class="btn-outline-sm" style="display: none; color: #ef4444; border-color: #fecaca; background: #fef2f2;" onclick="cancelEditNextWeek()"><i class="fa-solid fa-xmark"></i> Đóng chỉnh sửa</button>
                            <button id="btn-lock-schedule" class="btn-primary" onclick="lockNextWeekSchedule()"><i class="fa-solid fa-lock"></i> Chốt lịch & Thông báo</button>
                        </div>
                        <div id="grid-next-week">Đang tải...</div>
                    </div>

                    <!-- Danh sách nhân sự & Thống kê đăng ký -->
                    <div style="width: 300px; flex-shrink: 0; background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; padding: 15px;">
                        <h4 style="margin: 0 0 15px 0; color: var(--text-dark); font-size: 1rem;"><i class="fa-solid fa-users"></i> Thống kê đăng ký tuần sau</h4>
                        <div id="admin-staff-status-list">Đang tải...</div>
                    </div>
                </div>
            </div>

            <!-- LƯỚI 3: CHẤM CÔNG -->
            <div id="admin-cal-chamcong" class="tab-pane" style="display: none; padding: 0 20px 20px 20px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                    <div style="display: flex; gap: 15px;">
                        <input type="date" id="admin-cc-date" class="form-control" style="width: 200px;" onchange="loadAdminChamCongData()">
                        <button class="btn-outline-sm" onclick="loadAdminChamCongData()"><i class="fa-solid fa-rotate-right"></i> Làm mới</button>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="admin-table">
                        <thead style="background: #F8FAFC;">
                            <tr>
                                <th>Nhân Viên</th>
                                <th>Ca Làm Việc</th>
                                <th>Trạng Thái</th>
                                <th style="text-align: right;">Phạt / Thưởng</th>
                                <th style="text-align: center;">Hành động</th>
                            </tr>
                        </thead>
                        <tbody id="admin-cc-tbody">
                            <tr><td colspan="5" class="text-center">Đang tải dữ liệu...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    // Khởi chạy load dữ liệu cho tab mặc định
    loadAdminCalendarData(0, 'grid-current-week');
}

function switchAdminCalTab(tabId, element) {
    const tabs = element.parentElement.children;
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
        tabs[i].style.borderBottom = 'none';
        tabs[i].style.color = 'var(--text-muted)';
    }
    element.classList.add('active');
    element.style.borderBottom = '2px solid var(--primary)';
    element.style.color = 'var(--primary)';

    document.getElementById('admin-cal-current').style.display = 'none';
    document.getElementById('admin-cal-next').style.display = 'none';
    const chamcongTab = document.getElementById('admin-cal-chamcong');
    if (chamcongTab) chamcongTab.style.display = 'none';

    document.getElementById(tabId).style.display = 'block';

    isForceUnlockedNextWeek = false;

    if (tabId === 'admin-cal-next') {
        loadAdminCalendarData(1, 'grid-next-week');
        loadStaffRegistrationStatus();
    } else if (tabId === 'admin-cal-chamcong') {
        document.getElementById('admin-cc-date').value = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10);
        loadAdminChamCongData();
    } else {
        loadAdminCalendarData(0, 'grid-current-week');
    }
}

let isEditModeCurrentWeek = false;

function toggleEditModeCurrentWeek() {
    isEditModeCurrentWeek = !isEditModeCurrentWeek;
    const btn = document.getElementById('btn-edit-current-week');
    if (isEditModeCurrentWeek) {
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Hoàn tất chỉnh sửa';
        btn.style.background = '#fef3c7';
        showSystemModal('Chế độ chỉnh sửa bật', 'Bây giờ bạn có thể nhấp vào các ô trong Tuần Hiện Tại để thay thế nhân sự đột xuất.', 'success');
    } else {
        btn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Chỉnh sửa ca đột xuất';
        btn.style.background = 'transparent';
    }
    loadAdminCalendarData(0, 'grid-current-week'); // Vẽ lại lưới để bật/tắt hiệu ứng pointer (bàn tay)
}

let pendingManagerAssignments = [];

async function loadAdminCalendarData(weekOffset, containerId) {
    const container = document.getElementById(containerId);
    const dates = getWeekDatesAdmin(weekOffset);
    const tuNgay = dates[0].dbDate;
    const denNgay = dates[6].dbDate;
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));

    try {
        const [caRes, lichRes] = await Promise.all([
            fetch(`${API_BASE_URL}/ca-lam-viec?tu_ngay=${tuNgay}&den_ngay=${denNgay}`),
            fetch(`${API_BASE_URL}/lich-lam-viec?tu_ngay=${tuNgay}&den_ngay=${denNgay}`)
        ]);

        const caData = (await caRes.json()).data || [];
        const serverLichData = (await lichRes.json()).data || [];
        let lichData = [...serverLichData];

        // TRỘN DỮ LIỆU LOCAL
        pendingManagerAssignments.forEach(pending => {
            // Loại bỏ nhân sự cũ (Nếu có lệnh xếp ghi đè hoặc lệnh xóa)
            lichData = lichData.filter(l => !(String(l.ID_CaLamViec) === String(pending.id_ca_lam_viec) && l.NgayLam === pending.ngay_lam && String(l.ID_NhanVien) === String(pending.id_nhan_vien)));
            
            // NẾU KHÔNG PHẢI LỆNH XÓA THÌ MỚI PUSH VÀO ĐỂ HIỂN THỊ
            if (!pending.is_delete) {
                lichData.push({
                    ID_CaLamViec: pending.id_ca_lam_viec,
                    NgayLam: pending.ngay_lam,
                    ID_NhanVien: pending.id_nhan_vien,
                    CongViec: pending.cong_viec,
                    TrangThaiXepLich: 'DaDuyet',
                    nhan_vien: { HoTen: pending.ten_nhan_vien },
                    is_pending_local: true
                });
            }
        });

        if (caData.length === 0) {
            container.innerHTML = `<div class="modal-alert error" style="display:block;">Vui lòng cài đặt Ca Mẫu trước khi xếp lịch.</div>`;
            return;
        }

        // Tạm đánh giá xem tuần sau đã bị chốt chưa
        if (weekOffset === 1) {
            if (!isForceUnlockedNextWeek) {
                isNextWeekLocked = serverLichData.some(l => l.TrangThaiXepLich === 'DaDuyet');
            } else {
                isNextWeekLocked = false;
            }

            const btnLock = document.getElementById('btn-lock-schedule');
            const btnCancelEdit = document.getElementById('btn-cancel-edit-next-week');

            if (btnCancelEdit) {
                btnCancelEdit.style.display = isForceUnlockedNextWeek ? 'inline-block' : 'none';
            }
            
            if (pendingManagerAssignments.length > 0) {
                btnLock.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Chốt lịch & Thông báo';
                btnLock.className = 'btn-primary';
                btnLock.style.borderColor = '';
                btnLock.style.color = '';
            } else if (isNextWeekLocked) {
                btnLock.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Mở khóa chỉnh sửa';
                btnLock.className = 'btn-outline-sm';
                btnLock.style.borderColor = '#f59e0b';
                btnLock.style.color = '#b45309';
            } else {
                btnLock.innerHTML = '<i class="fa-solid fa-lock"></i> Chốt lịch & Thông báo';
                btnLock.className = 'btn-primary';
                btnLock.style.borderColor = '';
                btnLock.style.color = '';
            }
        }

        let html = `
            <div class="schedule-scroll-wrapper" style="width: 100%; overflow-x: auto; border-radius: 8px; border: 1px solid var(--border);">
                <table class="admin-table table-bordered" style="min-width: 1000px; width: 100%; margin: 0; border: none;">
                    <thead style="background: #F8FAFC;">
                        <tr>
                            <th style="width: 125px; min-width: 125px; text-align: center; vertical-align: middle; position: sticky; left: 0; z-index: 10; background: #F8FAFC; border-right: 2px solid #e2e8f0; box-shadow: 2px 0 5px rgba(0,0,0,0.05);">CA LÀM</th>
                            ${dates.map(d => `<th style="min-width: 130px; text-align: center; vertical-align: middle; padding: 10px 5px;">${d.dayName}<br><small style="color:var(--text-muted); font-weight:normal;">${d.display}</small></th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        let myShiftsArray = [];
        window.adminShiftCache = {}; // Reset mảng cache trước khi vẽ lịch

        // Lấy ngày hôm nay theo múi giờ Local (định dạng YYYY-MM-DD) để so sánh quá ngày
        const nowLocal = new Date();
        const todayDbDate = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;

        caData.forEach(ca => {
            const timeLabel = (ca.GioBatDau && ca.GioKetThuc) ? `<div style="font-size: 0.72rem; font-weight: 500; color: var(--text-muted); margin-top: 2px; white-space: nowrap;">${ca.GioBatDau.substring(0,5)} - ${ca.GioKetThuc.substring(0,5)}</div>` : '';
            html += `<tr><td style="text-align: center; font-weight: bold; background: #f8fafc; border-right: 2px solid #e2e8f0; position: sticky; left: 0; z-index: 5; box-shadow: 2px 0 5px rgba(0,0,0,0.05);">${ca.TenCa}${timeLabel}</td>`;
            
            dates.forEach(date => {
                // Kiểm tra xem ngày của cột này đã bị quá ngày so với hôm nay chưa
                const isPastDate = date.dbDate < todayDbDate;

                const shifts = lichData.filter(l => String(l.ID_CaLamViec) === String(ca.ID) && l.NgayLam === date.dbDate);
                const approvedCount = shifts.filter(s => s.TrangThaiXepLich === 'DaDuyet').length;
                const reqCount = ca.SoLuongNhanVien;
                
                let bgColor = '#fff';
                let borderColor = '#e2e8f0';
                if (approvedCount === 0) { bgColor = '#fef2f2'; borderColor = '#fca5a5'; } 
                else if (approvedCount < reqCount) { bgColor = '#fffbeb'; borderColor = '#fde68a'; } 
                else { bgColor = '#ecfdf5'; borderColor = '#a7f3d0'; } 

                const displayShifts = shifts.filter(s => s.TrangThaiXepLich !== 'TuChoi');

                let staffHtml = displayShifts.map(s => {
                    const isPending = s.TrangThaiXepLich === 'DangKy';
                    const isLocal = s.is_pending_local === true;
                    
                    // BƯỚC 1: KIỂM TRA XEM CÓ PHẢI CA CỦA QUẢN LÝ ĐANG ĐĂNG NHẬP KHÔNG
                    const isMyShift = String(s.ID_NhanVien) === String(currentUser.ID);

                    const color = isPending ? '#ea580c' : '#047857';
                    const icon = isPending ? 'fa-circle-question' : 'fa-check-circle';
                    const role = s.CongViec ? (s.CongViec === 'ThuNgan' ? 'TN' : 'PV') : '?';
                    let noteStr = s.GhiChu ? ` <span style="font-style:italic; font-weight:normal; opacity:0.8;">(${s.GhiChu})</span>` : '';
                    
                    // BƯỚC 2: HIỂN THỊ TÊN - Đổi thành "Tôi" nếu là ca của mình
                    let nameDisplay = isMyShift ? 'Tôi' : (s.nhan_vien ? s.nhan_vien.HoTen : 'N/A');

                    // Thêm nút Xóa: Ở Tuần Hiện Tại (weekOffset === 0), CHỈ hiện nút X nếu CHƯA QUÁ NGÀY (!isPastDate)
                    let removeBtn = '';
                    const showRemoveBtn = (weekOffset === 1 && isLocal) || 
                                          (weekOffset === 1 && (!isNextWeekLocked || pendingManagerAssignments.length > 0) && s.TrangThaiXepLich === 'DaDuyet') || 
                                          (weekOffset === 0 && isEditModeCurrentWeek && !isPastDate && s.TrangThaiXepLich === 'DaDuyet'); 
                    
                    if (showRemoveBtn) {
                        const isTuChoiTuanSau = (weekOffset === 1 && s.TrangThaiXepLich === 'DaDuyet' && !isLocal);
                        const clickAction = (isLocal || isTuChoiTuanSau)
                            ? `window.removePendingAssignment('${ca.ID}', '${date.dbDate}', '${s.ID_NhanVien}', ${isTuChoiTuanSau})` 
                            : `window.executeRemoveApprovedShift('${s.ID_CaLamViec}', '${s.NgayLam}', '${s.ID_NhanVien}', ${weekOffset})`;
                            
                        removeBtn = `<i class="fa-solid fa-circle-xmark" style="color: #ef4444; cursor: pointer; margin-left: 6px; font-size: 1rem;" title="Xóa phân công" onclick="event.stopPropagation(); ${clickAction}"></i>`;
                    }

                    // BƯỚC 3: XỬ LÝ BACKGROUND - Bôi xanh nền nếu là ca của mình
                    let localStyle = '';
                    if (isMyShift && s.TrangThaiXepLich === 'DaDuyet') {
                        localStyle = 'background: #d1fae5; padding: 2px 4px; border-radius: 4px;';
                    } else if (isLocal) {
                        localStyle = 'background: #f0f9ff; padding: 3px 6px; border-radius: 4px; border: 1px dashed #bae6fd;';
                    }

                    const fullText = `${nameDisplay}${noteStr.replace(/<[^>]*>?/gm, '')}`;

                    return `<div style="font-size: 0.8rem; color: ${color}; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; gap: 8px; ${localStyle}" title="${fullText}">
                                <div style="display: flex; align-items: center; min-width: 0; flex: 1;">
                                    <i class="fa-solid ${icon}" style="margin-right: 4px; flex-shrink: 0;"></i>
                                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-block; max-width: 100%;">${nameDisplay}${noteStr}</span>
                                </div>
                                <div style="flex-shrink: 0; display: flex; align-items: center;">
                                    <strong>[${role}]</strong>
                                    ${removeBtn}
                                </div>
                            </div>`;
                }).join('');

                if(displayShifts.length === 0) staffHtml = `<div style="font-size: 0.8rem; color: #94a3b8; text-align: center;">Chưa có người</div>`;
                if(shifts.length === 0) staffHtml = `<div style="font-size: 0.8rem; color: #94a3b8; text-align: center;">Chưa có người</div>`;

                if (weekOffset === 0) {
                    const myShift = shifts.find(s => String(s.ID_NhanVien) === String(currentUser.ID) && s.TrangThaiXepLich === 'DaDuyet');
                    if (myShift) {
                        myShiftsArray.push({
                            dateObj: date, 
                            caObj: ca,     
                            shiftObj: myShift 
                        });
                    }
                }

                const cacheKey = `${ca.ID}_${date.dbDate}`;
                window.adminShiftCache[cacheKey] = shifts;

                let pointerStyle = '';
                let clickEvent = '';

                if (weekOffset === 1 && (!isNextWeekLocked || pendingManagerAssignments.length > 0)) {
                    pointerStyle = 'cursor: pointer; transition: 0.2s;';
                    clickEvent = `onmouseover="this.style.filter='brightness(0.95)'" onmouseout="this.style.filter='brightness(1)'" onclick="openManagerShiftModal('${ca.ID}', '${ca.TenCa}', '${date.dbDate}', '${date.display}', '${cacheKey}', 1)"`;
                } else if (weekOffset === 0 && isEditModeCurrentWeek) {
                    if (!isPastDate) {
                        // Chỉ cho phép click & hiện viền nét đứt cam với ca TRONG NGÀY hoặc CHƯA ĐẾN NGÀY
                        pointerStyle = 'cursor: pointer; outline: 2px dashed #f59e0b; outline-offset: -2px; transition: 0.2s;';
                        clickEvent = `onmouseover="this.style.filter='brightness(0.95)'" onmouseout="this.style.filter='brightness(1)'" onclick="openManagerShiftModal('${ca.ID}', '${ca.TenCa}', '${date.dbDate}', '${date.display}', '${cacheKey}', 0)"`;
                    } else {
                        // Các ngày đã qua: Làm mờ nhẹ, khóa con trỏ chuột và không gắn onclick
                        pointerStyle = 'cursor: not-allowed; opacity: 0.68;';
                        clickEvent = `title="Ca làm việc đã qua ngày (${date.display}), không thể chỉnh sửa"`;
                    }
                }

                html += `
                    <td style="background: ${bgColor}; border: 1px solid ${borderColor}; ${pointerStyle} vertical-align: top;" ${clickEvent}>
                        <div style="font-size: 0.75rem; font-weight: bold; text-align: right; margin-bottom: 5px; color: var(--text-muted);">${approvedCount}/${reqCount}</div>
                        ${staffHtml}
                    </td>
                `;
            });
            html += `</tr>`;
        });

        html += `</tbody></table></div>`;

        // 1. Tìm thanh cuộn cũ và cất vị trí hiện tại đi
        let savedScrollLeft = 0;
        const oldScrollWrapper = container.querySelector('.schedule-scroll-wrapper');
        if (oldScrollWrapper) {
            savedScrollLeft = oldScrollWrapper.scrollLeft;
        }

        // 2. Ghi đè HTML (Vẽ lại lưới mới tinh)
        container.innerHTML = html;

        if (weekOffset === 0) {
            const boxContainer = document.getElementById('manager-my-shifts-container');
            const listEl = document.getElementById('manager-my-shifts-list');
            
            if (myShiftsArray.length > 0) {
                // Sắp xếp
                myShiftsArray.sort((a, b) => {
                    if (a.dateObj.dbDate !== b.dateObj.dbDate) return new Date(a.dateObj.dbDate) - new Date(b.dateObj.dbDate);
                    return a.caObj.GioBatDau.localeCompare(b.caObj.GioBatDau);
                });

                // Chuyển mảng thành HTML
                let resultHtml = '';
                myShiftsArray.forEach(item => {
                    const roleName = item.shiftObj.CongViec === 'ThuNgan' ? 'Thu Ngân' : 'Phục Vụ';
                    resultHtml += `
                        <div style="background: white; border: 1px solid #e2e8f0; border-left: 4px solid var(--primary); padding: 10px; margin-bottom: 10px; border-radius: 6px;">
                            <div style="font-weight: bold; color: var(--text-dark); margin-bottom: 4px;">${item.dateObj.dayName} - ${item.dateObj.display}</div>
                            <div style="font-size: 0.85rem; color: var(--primary);"><i class="fa-regular fa-clock"></i> ${item.caObj.TenCa}</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;"><i class="fa-solid fa-user-tag"></i> Vị trí: ${roleName}</div>
                        </div>
                    `;
                });

                listEl.innerHTML = resultHtml;
                boxContainer.style.display = 'block'; 
            } else {
                boxContainer.style.display = 'none';  
            }
        }

    } catch (e) {
        console.error("Lỗi vẽ lịch:", e);
        container.innerHTML = `<div class="modal-alert error" style="display:block;">Lỗi kết nối máy chủ! Vui lòng tải lại trang.</div>`;
    }
}

// Hàm Gỡ bỏ nhân sự vừa phân công tạm thời
window.removePendingAssignment = function(idCa, ngayLam, idNhanVien, isRemoveApproved = false) {
    // Nếu là hủy 1 ca mà quản lý vừa ghép thêm -> Chỉ cần loại bỏ khỏi mảng
    pendingManagerAssignments = pendingManagerAssignments.filter(p => 
        !(String(p.id_ca_lam_viec) === String(idCa) && p.ngay_lam === ngayLam && String(p.id_nhan_vien) === String(idNhanVien))
    );
    
    // Nếu đây là hành động Xóa 1 ca ĐÃ ĐƯỢC CHỐT TRƯỚC ĐÓ trên DB -> Ghi đè vào mảng với cờ is_delete
    if (isRemoveApproved) {
        pendingManagerAssignments.push({
            id_ca_lam_viec: idCa,
            ngay_lam: ngayLam,
            id_nhan_vien: idNhanVien,
            is_delete: true // Đánh dấu đây là lệnh XÓA để đẩy API
        });
    }

    loadAdminCalendarData(1, 'grid-next-week');
    loadStaffRegistrationStatus();
    
    // Check lại nút Chốt lịch
    if (pendingManagerAssignments.length === 0 && !isNextWeekLocked) {
        const btnLock = document.getElementById('btn-lock-schedule');
        btnLock.innerHTML = '<i class="fa-solid fa-lock"></i> Chưa có phân công nào';
        btnLock.className = 'btn-outline-sm';
        btnLock.style.borderColor = '';
        btnLock.style.color = '';
    }
};

// Logic hiển thị Danh sách nhân sự & Đếm số ca đăng ký (Tab Tuần Sau)
async function loadStaffRegistrationStatus() {
    const listContainer = document.getElementById('admin-staff-status-list');
    try {
        const dates = getWeekDatesAdmin(1);
        const tuNgay = dates[0].dbDate;
        const denNgay = dates[6].dbDate;

        const [usersRes, lichRes, emergencyRes] = await Promise.all([
            fetch(`${API_BASE_URL}/admin/khach-hang`), 
            fetch(`${API_BASE_URL}/lich-lam-viec?tu_ngay=${tuNgay}&den_ngay=${denNgay}`),
            fetch(`${API_BASE_URL}/lich-lam-viec/trang-thai-khan-cap`)
        ]);

        const usersData = await usersRes.json();
        const lichData = (await lichRes.json()).data || [];
        const emergencyData = await emergencyRes.json();
        const unlockedIds = emergencyData.unlocked_ids || [];

        const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
        const isSunday = new Date().getDay() === 0; // 0 = Chủ Nhật

        const activeStaff = usersData.data.filter(u => 
            (u.VaiTro === 'NhanVien' || u.VaiTro === 'QuanLySan') && 
            (u.TrangThaiKhoa == 0 || u.TrangThaiKhoa === false) && 
            String(u.ID_CumSan) === String(currentUser.ID_CumSan)
        );

        let html = '';
        activeStaff.forEach(staff => {
            let userShifts = lichData.filter(l => String(l.ID_NhanVien) === String(staff.ID));
            const localShifts = pendingManagerAssignments.filter(p => String(p.id_nhan_vien) === String(staff.ID));
            
            const totalRequested = userShifts.length;
            const approvedOnServer = userShifts.filter(l => l.TrangThaiXepLich === 'DaDuyet').length;
            const approvedTotal = approvedOnServer + localShifts.length;

            const color = totalRequested === 0 ? '#ef4444' : '#10b981';
            const alertIcon = totalRequested === 0 ? `<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;" title="Chưa đăng ký ca nào"></i>` : '';

            // Nút mở đăng ký khẩn cấp (chỉ dành cho Nhân viên, không hiện cho chính Quản lý)
            let emergencyBtnHtml = '';
            if (staff.VaiTro === 'NhanVien') {
                const isUnlocked = unlockedIds.some(id => String(id) === String(staff.ID));

                if (!isSunday) {
                    // Thứ 2 -> Thứ 7: Hiển thị dạng Disabled kèm giải thích khi hover
                    emergencyBtnHtml = `
                        <span title="Chỉ dùng vào Chủ Nhật (khi đã hết hạn đăng ký tự do từ T2 - T7) để mở khóa khẩn cấp 1 lần cho nhân viên" style="display: inline-block; cursor: not-allowed;">
                            <button type="button" disabled style="padding: 3px 8px; font-size: 0.72rem; border-radius: 6px; border: 1px solid #cbd5e1; background: #f1f5f9; color: #94a3b8; cursor: not-allowed; pointer-events: none;">
                                <i class="fa-solid fa-unlock-keyhole"></i> Mở ĐK
                            </button>
                        </span>`;
                } else if (isUnlocked) {
                    // Chủ nhật & Đã mở quyền (đang chờ nhân viên gửi lịch)
                    emergencyBtnHtml = `
                        <span title="Đã mở khóa 1 lần. Quyền sẽ tự động đóng ngay sau khi nhân viên bấm Gửi lịch" style="padding: 3px 8px; font-size: 0.72rem; border-radius: 6px; background: #fef3c7; color: #b45309; border: 1px solid #fde68a; font-weight: 600;">
                            <i class="fa-solid fa-clock-rotate-left"></i> Đang mở 1 lần
                        </span>`;
                } else {
                    // Chủ nhật & Chưa mở quyền -> Cho phép click
                    emergencyBtnHtml = `
                        <button type="button" onclick="grantEmergencyScheduleAccess('${staff.ID}', '${staff.HoTen.replace(/'/g, "\\'")}')" title="Cho phép nhân viên này đăng ký / sửa lịch khẩn cấp 1 lần trong hôm nay (Chủ Nhật)" style="padding: 3px 8px; font-size: 0.72rem; border-radius: 6px; border: 1px solid #bfdbfe; background: #eff6ff; color: #2563eb; font-weight: 600; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">
                            <i class="fa-solid fa-unlock-keyhole"></i> Mở ĐK (1 lần)
                        </button>`;
                }
            }

            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px dashed #e2e8f0; gap: 8px;">
                    <div style="min-width: 0; flex: 1;">
                        <div style="font-size: 0.9rem; color: var(--text-dark); font-weight: 600;">${staff.HoTen} ${alertIcon}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">${staff.SoDienThoai}</div>
                        ${emergencyBtnHtml}
                    </div>
                    <div style="font-weight: bold; color: ${color}; font-size: 0.95rem; flex-shrink: 0;">${approvedTotal}/${totalRequested}</div>
                </div>
            `;
        });
        
        listContainer.innerHTML = html || '<div style="font-size: 0.85rem; color: var(--text-muted); text-align: center;">Không có nhân sự.</div>';

    } catch(e) {
        listContainer.innerHTML = '<div style="color:red; font-size: 0.85rem;">Lỗi tải dữ liệu.</div>';
    }
}

// Hàm Quản lý bấm Mở đăng ký khẩn cấp 1 lần cho nhân viên
window.grantEmergencyScheduleAccess = async function(staffId, staffName) {
    try {
        const res = await fetch(`${API_BASE_URL}/lich-lam-viec/mo-khan-cap`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_nhan_vien: staffId })
        });
        const data = await res.json();

        if (res.ok && data.success) {
            showSystemModal('Đã mở khóa khẩn cấp', `Đã cấp 1 lượt đăng ký/chỉnh sửa lịch tuần sau và gửi thông báo cho <strong>${staffName}</strong>.`, 'success');
            loadStaffRegistrationStatus();
        } else {
            showSystemModal('Không thể mở khóa', data.message || 'Có lỗi xảy ra!', 'error');
        }
    } catch (e) {
        showSystemModal('Lỗi kết nối', 'Không thể kết nối máy chủ!', 'error');
    }
};

// Logic Chốt lịch
async function lockNextWeekSchedule() {
    if (isNextWeekLocked && pendingManagerAssignments.length === 0) {
        showSystemModal('Chế độ chỉnh sửa bật', 'Đã mở khóa. Bạn có thể bấm vào các ô để phân công.', 'success');
        isForceUnlockedNextWeek = true;
        isNextWeekLocked = false;
        loadAdminCalendarData(1, 'grid-next-week'); // Render lại đổi màu nút
        return;
    }

    if (pendingManagerAssignments.length === 0 && !isNextWeekLocked) {
        showSystemModal("Cảnh báo", "Bạn chưa xếp bất kỳ nhân viên nào vào lịch.", "error");
        return;
    }

    // Modal thay thế confirm() mặc định (Yêu Cầu 6)
    let confModal = document.getElementById('lock-confirm-modal');
    if (!confModal) {
        confModal = document.createElement('div');
        confModal.id = 'lock-confirm-modal';
        confModal.className = 'modal-overlay';
        confModal.style.cssText = 'display: flex; z-index: 10000;';
        document.body.appendChild(confModal);
    }
    
    confModal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; text-align: center; padding: 30px 20px;">
            <div style="font-size: 3.5rem; color: #10b981; margin-bottom: 15px;"><i class="fa-solid fa-paper-plane"></i></div>
            <h3 style="margin-bottom: 10px; font-size: 1.4rem;">Chốt lịch & Phát thông báo</h3>
            <p style="color: var(--text-muted); margin-bottom: 25px; line-height: 1.5;">Hệ thống sẽ lưu ${pendingManagerAssignments.length} phân công và chốt sổ tuần sau. Xác nhận?</p>
            <div style="display: flex; justify-content: center; gap: 12px;">
                <button class="btn-outline" style="width: auto; padding: 10px 24px;" onclick="document.getElementById('lock-confirm-modal').style.display='none'">Hủy bỏ</button>
                <button class="btn-primary" id="btn-agree-lock" style="width: auto; padding: 10px 24px; background-color: #10b981; border-color: #10b981;" onclick="executeLockScheduleAPI()">Đồng ý chốt</button>
            </div>
        </div>
    `;
    confModal.style.display = 'flex';
}

// Chạy API
async function executeLockScheduleAPI() {
    const btn = document.getElementById('btn-agree-lock');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi...';
    btn.disabled = true;

    try {
        // 1. Nếu có phân công mới, bắn hàng loạt qua API xếp ca trước
        if (pendingManagerAssignments.length > 0) {
            const promises = [];
            
            // Tách làm 2 hành động: Xếp/Sửa và Xóa
            const shiftsToAssign = pendingManagerAssignments.filter(p => !p.is_delete);
            const shiftsToDelete = pendingManagerAssignments.filter(p => p.is_delete);

            // 1a. Vòng lặp Xếp ca
            shiftsToAssign.forEach(payload => {
                promises.push(
                    fetch(`${API_BASE_URL}/lich-lam-viec/xep-ca`, {
                        method: 'POST',
                        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id_ca_lam_viec: payload.id_ca_lam_viec,
                            ngay_lam: payload.ngay_lam,
                            id_nhan_vien: payload.id_nhan_vien,
                            cong_viec: payload.cong_viec,
                            thong_bao_thay_doi: false 
                        })
                    }).then(res => res.json())
                );
            });

            // 1b. Vòng lặp Xóa ca đã chốt (Bắn lên DB)
            shiftsToDelete.forEach(payload => {
                promises.push(
                    fetch(`${API_BASE_URL}/lich-lam-viec/dang-ky?id_ca_lam_viec=${payload.id_ca_lam_viec}&ngay_lam=${payload.ngay_lam}&id_nhan_vien=${payload.id_nhan_vien}`, {
                        method: 'DELETE',
                        headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` }
                    }).then(res => res.json())
                );
            });

            await Promise.all(promises);
            pendingManagerAssignments = []; 
        }

        // 2. Bắn lệnh Chốt Tuần để hệ thống xóa đơn rác và gửi thông báo chung
        const dates = getWeekDatesAdmin(1);
        const response = await fetch(`${API_BASE_URL}/lich-lam-viec/chot-tuan`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ tu_ngay: dates[0].dbDate, den_ngay: dates[6].dbDate })
        });
        const data = await response.json();

        document.getElementById('lock-confirm-modal').style.display = 'none';
        
        if (response.ok && data.success) {
            showSystemModal("Thành công!", data.message, "success");
            isForceUnlockedNextWeek = false;
            loadAdminCalendarData(1, 'grid-next-week');
            loadStaffRegistrationStatus();
        } else {
            showSystemModal("Lỗi", data.message, "error");
        }
    } catch(e) {
        showSystemModal("Lỗi mạng", "Không kết nối được server.", "error");
        btn.innerHTML = 'Đồng ý chốt';
        btn.disabled = false;
    }
}

async function openManagerShiftModal(caId, tenCa, ngayLam, displayDate, cacheKey, weekOffset) {
    if (weekOffset === 0) {
        const nowLocal = new Date();
        const todayDbDate = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;
        if (ngayLam < todayDbDate) {
            showSystemModal('Không thể chỉnh sửa', 'Ca làm việc này đã qua ngày, bạn chỉ có thể chỉnh sửa các ca trong ngày hôm nay hoặc những ngày tiếp theo.', 'error');
            return;
        }
    }

    if (weekOffset === 1 && isNextWeekLocked && pendingManagerAssignments.length === 0) {
        showSystemModal('Đã khóa lịch', 'Bạn đã chốt lịch tuần sau. Vui lòng bấm "Mở khóa chỉnh sửa" để tiếp tục.', 'error');
        return;
    }

    const isEditModeCurrentWeek = (weekOffset === 0);
    // CHỈNH SỬA YÊU CẦU 2: Xác định chế độ "Chỉnh sửa" chung 
    // Chế độ chỉnh sửa bật lên khi: Sửa tuần hiện tại HOẶC Sửa tuần sau khi đã Mở khóa
    const isEditing = isEditModeCurrentWeek || (weekOffset === 1 && (!isNextWeekLocked || pendingManagerAssignments.length > 0));

    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));

    document.getElementById('manager-assign-info').innerHTML = `${tenCa} - Ngày ${displayDate}`;
    document.getElementById('manager-assign-ca-id').value = caId;
    document.getElementById('manager-assign-date').value = ngayLam;
    document.getElementById('manager-assign-is-edit').value = isEditModeCurrentWeek;
    document.getElementById('manager-assign-title').innerText = isEditing ? 'Chỉnh sửa đột xuất' : 'Phân công nhân sự';

    const btn = document.getElementById('btn-confirm-manager-assign');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tải...';
    btn.disabled = true;
    
    document.getElementById('manager-assign-shift-modal').style.display = 'flex';

    try {
        const res = await fetch(`${API_BASE_URL}/admin/khach-hang`);
        const usersData = await res.json();
        
        const allStaffs = usersData.data.filter(u => 
            u.VaiTro === 'NhanVien' && 
            (u.TrangThaiKhoa == 0 || u.TrangThaiKhoa === false) && 
            String(u.ID_CumSan) === String(currentUser.ID_CumSan)
        );

        let optionsHtml = '<option value="">-- Chọn nhân sự muốn xếp vào ca --</option>';
        optionsHtml += `<option value="${currentUser.ID}" data-name="${currentUser.HoTen}">Tôi (${currentUser.HoTen})</option>`;

        const shifts = window.adminShiftCache[cacheKey] || [];
        
        // CHỈNH SỬA YÊU CẦU 2: Phân nhánh đổ dữ liệu
        if (isEditing) {
            // TRƯỜNG HỢP A: ĐANG CHỈNH SỬA -> HIỆN FULL NHÂN VIÊN
            allStaffs.forEach(staff => {
                const staffShift = shifts.find(s => String(s.ID_NhanVien) === String(staff.ID));
                // Nếu người này ĐÃ NẰM SẴN trong ca (do chốt từ trước hoặc vừa ghép tạm) -> Disable
                const isAlreadyApproved = staffShift && (staffShift.TrangThaiXepLich === 'DaDuyet' || pendingManagerAssignments.some(p => String(p.id_ca_lam_viec) === String(caId) && p.ngay_lam === ngayLam && String(p.id_nhan_vien) === String(staff.ID) && !p.is_delete));
                
                let label = staff.HoTen;

                if (staffShift && (staffShift.TrangThaiXepLich === 'DangKy' || staffShift.TrangThaiXepLich === 'TuChoi')) {
                    label += ' *';
                }

                if (staffShift && staffShift.GhiChu) {
                    label += ` (${staffShift.GhiChu})`;
                }

                if (isAlreadyApproved) {
                    optionsHtml += `<option value="${staff.ID}" data-name="${staff.HoTen}" disabled style="color: #94a3b8;">${staff.HoTen} (Đã nằm trong ca này)</option>`;
                } else {
                    optionsHtml += `<option value="${staff.ID}" data-name="${staff.HoTen}">${label}</option>`;
                }
            });
        } else {
            // TRƯỜNG HỢP B: ĐANG XẾP LỊCH BÌNH THƯỜNG -> CHỈ HIỆN NHỮNG NGƯỜI CÓ TƯƠNG TÁC CA ĐÓ
            shifts.forEach(staffShift => {
                if (String(staffShift.ID_NhanVien) === String(currentUser.ID)) return;
                
                if (staffShift.TrangThaiXepLich === 'TuChoi') return; // Ẩn đơn từ chối

                const isAlreadyApproved = staffShift.TrangThaiXepLich === 'DaDuyet';
                let label = staffShift.nhan_vien.HoTen;
                
                if (staffShift.GhiChu) label += ` (${staffShift.GhiChu})`;

                if (isAlreadyApproved) {
                    optionsHtml += `<option value="${staffShift.ID_NhanVien}" data-name="${staffShift.nhan_vien.HoTen}" disabled style="color: #94a3b8;">${staffShift.nhan_vien.HoTen} (Đã nằm trong ca này)</option>`;
                } else {
                    optionsHtml += `<option value="${staffShift.ID_NhanVien}" data-name="${staffShift.nhan_vien.HoTen}">${label}</option>`;
                }
            });
        }

        document.getElementById('manager-assign-staff-id').innerHTML = optionsHtml;
        
    } catch (e) {
        document.getElementById('manager-assign-staff-id').innerHTML = '<option value="">Lỗi tải danh sách nhân sự</option>';
    } finally {
        btn.innerHTML = 'Lưu tạm';
        btn.disabled = false;
    }
}

async function executeManagerAssignShift() {
    const idCa = document.getElementById('manager-assign-ca-id').value;
    const ngayLam = document.getElementById('manager-assign-date').value;
    const selectEl = document.getElementById('manager-assign-staff-id');
    const idNhanVien = selectEl.value;
    
    if (!idNhanVien) {
        showSystemModal("Lỗi", "Vui lòng chọn 1 nhân sự!", "error");
        return;
    }

    // Lấy tên chuẩn xác từ thuộc tính data-name thay vì chặt chuỗi
    const tenNhanVien = selectEl.options[selectEl.selectedIndex].getAttribute('data-name'); 

    const isEdit = document.getElementById('manager-assign-is-edit').value === 'true'; 
    const congViec = document.querySelector('input[name="manager_assign_role"]:checked').value;

    if (congViec === 'ThuNgan') {
        const cacheKey = `${idCa}_${ngayLam}`;
        const dbShifts = window.adminShiftCache[cacheKey] || [];
        let countThuNgan = 0;

        // 1. Đếm Thu ngân đã chốt trên Server (và chưa bị quản lý ấn Xóa ở Local)
        dbShifts.forEach(s => {
            if (s.TrangThaiXepLich === 'DaDuyet' && s.CongViec === 'ThuNgan') {
                const isDeletedLocal = pendingManagerAssignments.some(p => 
                    String(p.id_ca_lam_viec) === String(idCa) && 
                    p.ngay_lam === ngayLam && 
                    String(p.id_nhan_vien) === String(s.ID_NhanVien) && 
                    p.is_delete
                );
                if (!isDeletedLocal) countThuNgan++;
            }
        });

        // 2. Đếm số Thu Ngân mới vừa được Quản lý xếp tạm ở Local
        pendingManagerAssignments.forEach(p => {
            if (String(p.id_ca_lam_viec) === String(idCa) && p.ngay_lam === ngayLam && p.cong_viec === 'ThuNgan' && !p.is_delete) {
                countThuNgan++;
            }
        });

        if (countThuNgan >= 1) {
            showSystemModal("Không thể xếp ca", "Mỗi ca làm việc chỉ được phép có tối đa 1 Thu Ngân. Vui lòng chọn vị trí Phục Vụ hoặc gỡ Thu Ngân hiện tại ra trước.", "error");
            return; // Dừng lại, không cho phép lưu
        }
    }

    // Nếu là tuần hiện tại, gửi API luôn vì là sửa đột xuất
    if (isEdit) {
        const btn = document.getElementById('btn-confirm-manager-assign');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
        btn.disabled = true;

        try {
            const payload = {
                id_ca_lam_viec: idCa, ngay_lam: ngayLam, id_nhan_vien: idNhanVien, cong_viec: congViec, thong_bao_thay_doi: true 
            };

            const response = await fetch(`${API_BASE_URL}/lich-lam-viec/xep-ca`, {
                method: 'POST',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (response.ok && data.success) {
                document.getElementById('manager-assign-shift-modal').style.display = 'none';
                showSystemModal("Thành công", "Đã thay thế ca làm đột xuất và phát thông báo.", "success");
                loadAdminCalendarData(0, 'grid-current-week');
            } else {
                showSystemModal("Lỗi", data.message, "error");
            }
        } catch(e) {
            showSystemModal("Lỗi kết nối", "Lỗi mạng.", "error");
        } finally {
            btn.innerHTML = 'Lưu phân công';
            btn.disabled = false;
        }
    } else {
        // Nếu là tuần sau, CHỈ LƯU LOCAL
        pendingManagerAssignments = pendingManagerAssignments.filter(p => !(String(p.id_ca_lam_viec) === String(idCa) && p.ngay_lam === ngayLam && String(p.id_nhan_vien) === String(idNhanVien)));
        
        pendingManagerAssignments.push({
            id_ca_lam_viec: idCa,
            ngay_lam: ngayLam,
            id_nhan_vien: idNhanVien,
            cong_viec: congViec,
            ten_nhan_vien: tenNhanVien // Tên nhân viên được lấy sạch sẽ nhờ data-name
        });

        document.getElementById('manager-assign-shift-modal').style.display = 'none';
        loadAdminCalendarData(1, 'grid-next-week'); 
        loadStaffRegistrationStatus(); 
    }
}

// ======================================================
// LOGIC: CẤU HÌNH CA LÀM VIỆC LINH HOẠT (TÙY Ý SỐ LƯỢNG CA & GIỜ GIAO CA)
// ======================================================
let tempShiftConfigs = [];
let clusterOpenTime = '06:00';
let clusterCloseTime = '22:00';

// Tạo danh sách các mốc giờ (cách nhau 30 phút) nằm giữa Giờ mở cửa và Giờ đóng cửa
function getAvailableTimeOptions(selectedVal = '') {
    const [openH, openM] = clusterOpenTime.split(':').map(Number);
    const [closeH, closeM] = clusterCloseTime.split(':').map(Number);
    const startMins = openH * 60 + openM;
    const endMins = closeH * 60 + closeM;

    let html = '';
    for (let m = startMins + 30; m <= endMins - 30; m += 30) {
        const hh = String(Math.floor(m / 60)).padStart(2, '0');
        const mm = String(m % 60).padStart(2, '0');
        const timeStr = `${hh}:${mm}`;
        html += `<option value="${timeStr}" ${timeStr === selectedVal ? 'selected' : ''}>${timeStr}</option>`;
    }
    return html;
}

async function openCauHinhCaModal() {
    let modal = document.getElementById('dynamic-cauhinh-ca-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'dynamic-cauhinh-ca-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10000; align-items: center; justify-content: center;';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 820px; width: 95%; padding: 0; border-radius: 14px; overflow: hidden;">
            <div class="modal-header" style="padding: 18px 24px; background: #f8fafc; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h3 style="margin: 0; font-size: 1.2rem; color: var(--text-dark);"><i class="fa-solid fa-sliders" style="color: var(--primary); margin-right: 8px;"></i> Cấu hình Ca làm việc & Giờ giao ca</h3>
                    <div id="shift-config-subtitle" style="font-size: 0.82rem; color: var(--text-muted); margin-top: 3px;">Đang tải thông tin cụm sân...</div>
                </div>
                <i class="fa-solid fa-xmark" style="cursor: pointer; font-size: 1.2rem; color: var(--text-muted);" onclick="closeCauHinhCaModal()"></i>
            </div>

            <div id="dynamic-cauhinh-alert" class="modal-alert" style="display: none; margin: 14px 24px 0;"></div>

            <div class="modal-body" style="padding: 20px 24px; max-height: 68vh; overflow-y: auto;">
                <div style="background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; padding: 10px 14px; border-radius: 8px; font-size: 0.84rem; color: #92400e; margin-bottom: 16px; line-height: 1.5;">
                    <i class="fa-solid fa-circle-info"></i> <strong>Quy tắc áp dụng:</strong> Giờ kết thúc của ca trước chính là <strong>giờ giao ca</strong> (bắt đầu của ca kế tiếp). Nếu <strong>Tuần Hiện Tại</strong> đã có lịch duyệt, cấu hình mới sẽ được áp dụng cho các tuần trống (như <strong>Tuần Sau</strong>) để không làm xáo trộn lịch đang chạy.
                </div>

                <div id="shift-config-rows-container">
                    <div style="text-align: center; padding: 30px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>
                </div>

                <div style="margin-top: 14px; display: flex; justify-content: space-between; align-items: center;">
                    <button type="button" class="btn-outline-sm" style="color: var(--primary); border-color: var(--primary); background: #f0fdf4; padding: 8px 16px;" onclick="addNewShiftRow()">
                        <i class="fa-solid fa-plus"></i> Thêm ca làm việc
                    </button>
                    <span style="font-size: 0.82rem; color: var(--text-muted);">* Bạn có thể thiết lập 1, 2, 3 hoặc nhiều ca tùy ý</span>
                </div>
            </div>

            <div class="modal-footer" style="padding: 16px 24px; background: #f8fafc; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; align-items: center; gap: 12px;">
                <button type="button" onclick="closeCauHinhCaModal()" style="padding: 10px 22px; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-weight: 600; font-size: 0.92rem; cursor: pointer; transition: all 0.2s ease;" onmouseover="this.style.background='#f1f5f9'; this.style.borderColor='#94a3b8'; this.style.color='#0f172a';" onmouseout="this.style.background='#ffffff'; this.style.borderColor='#cbd5e1'; this.style.color='#475569';">
                    Hủy bỏ
                </button>
                <button type="button" id="btn-save-dynamic-shifts" class="btn-primary" style="padding: 10px 24px; border-radius: 8px; font-weight: 600; font-size: 0.92rem;" onclick="submitCauHinhCa()">
                    <i class="fa-solid fa-floppy-disk" style="margin-right: 6px;"></i> Lưu cấu hình ca
                </button>
         </div>
        </div>
    `;

    modal.style.display = 'flex';

    try {
        const response = await fetch(`${API_BASE_URL}/ca-lam-viec?mode=config`);
        const res = await response.json();

        clusterOpenTime = res.gio_mo_cua || '06:00';
        clusterCloseTime = res.gio_dong_cua || '22:00';

        document.getElementById('shift-config-subtitle').innerHTML = `Khung giờ hoạt động của cơ sở: <strong style="color: var(--primary);">${clusterOpenTime} - ${clusterCloseTime}</strong>`;

        if (res.success && res.data && res.data.length > 0) {
            tempShiftConfigs = res.data.map(c => ({
                ID: c.ID,
                TenCa: c.TenCa,
                GioBatDau: c.GioBatDau.substring(0, 5),
                GioKetThuc: c.GioKetThuc.substring(0, 5),
                SoLuongNhanVien: c.SoLuongNhanVien,
                LuongThuNgan: Number(c.LuongThuNgan),
                LuongPhucVu: Number(c.LuongPhucVu)
            }));
            // Đảm bảo ca đầu và ca cuối khớp giờ mở/đóng cửa
            tempShiftConfigs[0].GioBatDau = clusterOpenTime;
            tempShiftConfigs[tempShiftConfigs.length - 1].GioKetThuc = clusterCloseTime;
        } else {
            // Mặc định gợi ý 2 ca nếu cơ sở chưa cấu hình lần nào
            tempShiftConfigs = [
                { ID: null, TenCa: 'Ca Sáng', GioBatDau: clusterOpenTime, GioKetThuc: '15:00', SoLuongNhanVien: 2, LuongThuNgan: 170000, LuongPhucVu: 150000 },
                { ID: null, TenCa: 'Ca Tối', GioBatDau: '15:00', GioKetThuc: clusterCloseTime, SoLuongNhanVien: 3, LuongThuNgan: 170000, LuongPhucVu: 150000 }
            ];
        }

        renderShiftConfigRows();
    } catch (e) {
        showCauHinhCaAlert('Không thể tải dữ liệu cấu hình ca!', false);
    }
}

function renderShiftConfigRows() {
    const container = document.getElementById('shift-config-rows-container');
    if (!container) return;

    const total = tempShiftConfigs.length;

    let html = `
        <div style="display: flex; flex-direction: column; gap: 12px;">
    `;

    tempShiftConfigs.forEach((shift, idx) => {
        const isLast = (idx === total - 1);

        // Giờ bắt đầu luôn tự động nối với Giờ kết thúc của ca liền trước (Ca đầu tiên là Giờ mở cửa)
        const startDisplay = `<input type="text" class="form-control" value="${shift.GioBatDau}" disabled style="background: #f1f5f9; font-weight: 700; color: #334155; text-align: center;">`;

        // Giờ kết thúc (= Giờ giao ca sang ca tiếp theo). Riêng ca cuối cùng khóa cứng bằng Giờ đóng cửa
        let endDisplay = '';
        if (isLast) {
            endDisplay = `<input type="text" class="form-control" value="${clusterCloseTime}" disabled style="background: #f1f5f9; font-weight: 700; color: #334155; text-align: center;" title="Ca cuối kết thúc vào giờ đóng cửa sân">`;
        } else {
            endDisplay = `
                <select class="form-control" style="font-weight: 700; color: var(--primary); border-color: #86efac; background: #f0fdf4; text-align: center; cursor: pointer;" onchange="handleHandoverTimeChange(${idx}, this.value)" title="Chọn giờ giao ca sang ca kế tiếp">
                    ${getAvailableTimeOptions(shift.GioKetThuc)}
                </select>
            `;
        }

        const removeBtn = total > 1
            ? `<button type="button" onclick="removeShiftRow(${idx})" style="background: #fef2f2; color: #ef4444; border: 1px solid #fecaca; width: 36px; height: 38px; border-radius: 8px; cursor: pointer;" title="Xóa ca này"><i class="fa-solid fa-trash-can"></i></button>`
            : `<button type="button" disabled style="background: #f1f5f9; color: #cbd5e1; border: 1px solid #e2e8f0; width: 36px; height: 38px; border-radius: 8px; cursor: not-allowed;"><i class="fa-solid fa-trash-can"></i></button>`;

        html += `
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                <div style="display: grid; grid-template-columns: 1.3fr 0.9fr 1fr 0.8fr 1.1fr 1.1fr auto; gap: 10px; align-items: end;">
                    <div>
                        <label style="font-size: 0.78rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Tên ca #${idx + 1}</label>
                        <input type="text" class="form-control" value="${shift.TenCa}" placeholder="VD: Ca Chiều" oninput="tempShiftConfigs[${idx}].TenCa = this.value">
                    </div>
                    <div>
                        <label style="font-size: 0.78rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Bắt đầu</label>
                        ${startDisplay}
                    </div>
                    <div>
                        <label style="font-size: 0.78rem; font-weight: 600; color: ${isLast ? '#475569' : 'var(--primary)'}; display: block; margin-bottom: 4px;">
                            ${isLast ? 'Đóng cửa' : '<i class="fa-solid fa-clock-rotate-left"></i> Giờ giao ca'}
                        </label>
                        ${endDisplay}
                    </div>
                    <div>
                        <label style="font-size: 0.78rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Số NV</label>
                        <input type="number" class="form-control" min="1" value="${shift.SoLuongNhanVien}" oninput="tempShiftConfigs[${idx}].SoLuongNhanVien = this.value">
                    </div>
                    <div>
                        <label style="font-size: 0.78rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Lương Thu Ngân</label>
                        <input type="number" class="form-control" min="1000" step="5000" value="${shift.LuongThuNgan}" oninput="tempShiftConfigs[${idx}].LuongThuNgan = this.value">
                    </div>
                    <div>
                        <label style="font-size: 0.78rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Lương Phục Vụ</label>
                        <input type="number" class="form-control" min="1000" step="5000" value="${shift.LuongPhucVu}" oninput="tempShiftConfigs[${idx}].LuongPhucVu = this.value">
                    </div>
                    <div>
                        ${removeBtn}
                    </div>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
}

// Khi đổi Giờ giao ca của ca thứ idx -> Tự động cập nhật Giờ bắt đầu của ca (idx + 1) nối tiếp ngay lập tức
window.handleHandoverTimeChange = function(idx, newTime) {
    tempShiftConfigs[idx].GioKetThuc = newTime;
    if (idx + 1 < tempShiftConfigs.length) {
        tempShiftConfigs[idx + 1].GioBatDau = newTime;
    }
    renderShiftConfigRows();
};

// Chia đều khoảng giờ tự động khi Thêm hoặc Xóa ca để Quản lý tiện chỉnh
function redistributeShiftTimes() {
    const [openH, openM] = clusterOpenTime.split(':').map(Number);
    const [closeH, closeM] = clusterCloseTime.split(':').map(Number);
    const startMins = openH * 60 + openM;
    const endMins = closeH * 60 + closeM;
    const count = tempShiftConfigs.length;
    const step = Math.floor((endMins - startMins) / count / 30) * 30;

    for (let i = 0; i < count; i++) {
        if (i === 0) {
            tempShiftConfigs[i].GioBatDau = clusterOpenTime;
        } else {
            tempShiftConfigs[i].GioBatDau = tempShiftConfigs[i - 1].GioKetThuc;
        }

        if (i === count - 1) {
            tempShiftConfigs[i].GioKetThuc = clusterCloseTime;
        } else {
            const nextMin = startMins + step * (i + 1);
            const hh = String(Math.floor(nextMin / 60)).padStart(2, '0');
            const mm = String(nextMin % 60).padStart(2, '0');
            tempShiftConfigs[i].GioKetThuc = `${hh}:${mm}`;
        }
    }
}

window.addNewShiftRow = function() {
    const defaultNames = ['Ca Sáng', 'Ca Chiều', 'Ca Tối', 'Ca Đêm'];
    const nextIdx = tempShiftConfigs.length;
    const suggestedName = defaultNames[nextIdx] || `Ca ${nextIdx + 1}`;
    const lastShift = tempShiftConfigs[tempShiftConfigs.length - 1] || { SoLuongNhanVien: 2, LuongThuNgan: 170000, LuongPhucVu: 150000 };

    tempShiftConfigs.push({
        ID: null,
        TenCa: suggestedName,
        GioBatDau: '12:00',
        GioKetThuc: clusterCloseTime,
        SoLuongNhanVien: lastShift.SoLuongNhanVien,
        LuongThuNgan: lastShift.LuongThuNgan,
        LuongPhucVu: lastShift.LuongPhucVu
    });

    if (tempShiftConfigs.length === 3) {
        tempShiftConfigs[0].TenCa = 'Ca Sáng';
        tempShiftConfigs[1].TenCa = 'Ca Chiều';
        tempShiftConfigs[2].TenCa = 'Ca Tối';
    }

    redistributeShiftTimes();
    renderShiftConfigRows();
};

window.removeShiftRow = function(idx) {
    if (tempShiftConfigs.length <= 1) return;
    tempShiftConfigs.splice(idx, 1);
    redistributeShiftTimes();
    renderShiftConfigRows();
};

function showCauHinhCaAlert(msg, isSuccess) {
    const alert = document.getElementById('dynamic-cauhinh-alert');
    if (!alert) return;
    alert.textContent = msg;
    alert.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alert.style.display = 'block';
    setTimeout(() => { alert.style.display = 'none'; }, 3500);
}

function closeCauHinhCaModal() {
    const modal = document.getElementById('dynamic-cauhinh-ca-modal');
    if (modal) modal.style.display = 'none';
}

async function submitCauHinhCa() {
    for (let i = 0; i < tempShiftConfigs.length; i++) {
        const s = tempShiftConfigs[i];
        if (!s.TenCa || !String(s.TenCa).trim()) {
            return showCauHinhCaAlert(`Vui lòng nhập tên cho ca thứ ${i + 1}!`, false);
        }
        if (s.GioBatDau >= s.GioKetThuc) {
            return showCauHinhCaAlert(`Ca "${s.TenCa}": Giờ giao ca/kết thúc (${s.GioKetThuc}) phải sau giờ bắt đầu (${s.GioBatDau})!`, false);
        }
        if (!s.SoLuongNhanVien || Number(s.SoLuongNhanVien) <= 0) {
            return showCauHinhCaAlert(`Ca "${s.TenCa}": Số lượng nhân viên phải lớn hơn 0!`, false);
        }
        if (!s.LuongThuNgan || Number(s.LuongThuNgan) <= 0 || !s.LuongPhucVu || Number(s.LuongPhucVu) <= 0) {
            return showCauHinhCaAlert(`Ca "${s.TenCa}": Mức lương phải lớn hơn 0!`, false);
        }
    }

    const btn = document.getElementById('btn-save-dynamic-shifts');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/ca-lam-viec`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ shifts: tempShiftConfigs })
        });

        const data = await response.json();
        if (response.ok && data.success) {
            showCauHinhCaAlert(data.message, true);
            setTimeout(() => {
                closeCauHinhCaModal();
                const activeTab = document.querySelector('.nav-tab.active')?.innerText || '';
                if (activeTab.includes('Tuần Hiện Tại')) {
                    loadAdminCalendarData(0, 'grid-current-week');
                } else if (activeTab.includes('Tuần Sau')) {
                    loadAdminCalendarData(1, 'grid-next-week');
                }
            }, 1400);
        } else {
            showCauHinhCaAlert(data.message || 'Lỗi khi lưu cấu hình ca!', false);
        }
    } catch (e) {
        showCauHinhCaAlert('Mất kết nối máy chủ!', false);
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk" style="margin-right: 6px;"></i> Lưu cấu hình ca';
        btn.disabled = false;
    }
}

// Hàm gỡ nhân viên khỏi ca đã chốt trên Server (Tuần Hiện Tại)
window.executeRemoveApprovedShift = async function(idCa, ngayLam, idNhanVien, weekOffset) {
    if (weekOffset === 0) {
        const nowLocal = new Date();
        const todayDbDate = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;
        if (ngayLam < todayDbDate) {
            showSystemModal('Không thể chỉnh sửa', 'Ca làm việc này đã qua ngày, bạn chỉ có thể chỉnh sửa các ca trong ngày hôm nay hoặc những ngày tiếp theo.', 'error');
            return;
        }
    }
    
    // 1. Tạo modal popup nếu chưa tồn tại trên giao diện
    let modal = document.getElementById('remove-shift-confirm-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'remove-shift-confirm-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10000;';
        document.body.appendChild(modal);
    }

    // 2. Gắn nội dung (HTML) cho modal báo "Bạn có chắc xóa ca này không"
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; text-align: center; padding: 30px 20px;">
            <div style="font-size: 3.5rem; color: #ef4444; margin-bottom: 15px;"><i class="fa-solid fa-triangle-exclamation"></i></div>
            <h3 style="margin-bottom: 10px; font-size: 1.4rem;">Xác nhận xóa ca</h3>
            <p style="color: var(--text-muted); margin-bottom: 25px; line-height: 1.5;">Bạn có chắc chắn muốn xóa ca này không?</p>
            <div style="display: flex; justify-content: center; gap: 12px;">
                <button class="btn-outline" style="width: auto; padding: 10px 24px;" id="btn-cancel-remove-shift">Hủy bỏ</button>
                <button class="btn-primary" style="width: auto; padding: 10px 24px; background-color: #ef4444; border-color: #ef4444;" id="btn-confirm-remove-shift">Đồng ý xóa</button>
            </div>
        </div>
    `;
    
    // Hiển thị modal
    modal.style.display = 'flex';

    // 3. Xử lý khi bấm nút "Hủy bỏ"
    document.getElementById('btn-cancel-remove-shift').onclick = function() {
        modal.style.display = 'none';
    };

    // 4. Xử lý khi bấm nút "Đồng ý xóa" -> Bắt đầu gọi API
    document.getElementById('btn-confirm-remove-shift').onclick = async function() {
        const btn = this;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
        btn.disabled = true;

        try {
            // Gọi API với phương thức DELETE kèm các tham số để xác định đúng ca làm và nhân viên
            const response = await fetch(`${API_BASE_URL}/lich-lam-viec/dang-ky?id_ca_lam_viec=${idCa}&ngay_lam=${ngayLam}&id_nhan_vien=${idNhanVien}`, {
                method: 'DELETE',
                headers: { 
                    'Accept': 'application/json', 
                    'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` 
                }
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                modal.style.display = 'none'; // Ẩn modal sau khi xóa thành công
                showSystemModal('Thành công', 'Đã gỡ nhân sự khỏi ca làm việc', 'success');
                
                // Tự động load lại đúng tab lưới lịch đang đứng
                loadAdminCalendarData(weekOffset, weekOffset === 0 ? 'grid-current-week' : 'grid-next-week');
                
                // Cập nhật lại số liệu bên danh sách nếu đang ở Tuần Sau
                if (weekOffset === 1) loadStaffRegistrationStatus();
            } else {
                modal.style.display = 'none';
                showSystemModal('Lỗi', data.message || 'Không thể xóa ca này', 'error');
            }
        } catch (e) {
            modal.style.display = 'none';
            showSystemModal('Lỗi kết nối', 'Mất kết nối máy chủ!', 'error');
        }
    };
};

// Hàm đóng chế độ chỉnh sửa Lịch Tuần Sau
window.cancelEditNextWeek = function() {
    // 1. Tắt cờ mở khóa
    isForceUnlockedNextWeek = false;
    
    // 2. Xóa sạch các thao tác ghép ca/hủy ca mà quản lý vừa làm dở dang chưa lưu
    pendingManagerAssignments = []; 
    
    // 3. Tải lại lưới lịch và danh sách thống kê bên phải từ Database
    loadAdminCalendarData(1, 'grid-next-week');
    loadStaffRegistrationStatus();
};

// ======================================================
// MODULE: ADMIN - CHẤM CÔNG VÀ CHỐT LƯƠNG NHÂN VIÊN
// ======================================================
let currentChamCongData = [];
let pendingQuickChotVangId = null;

async function loadAdminChamCongData() {
    const dateInput = document.getElementById('admin-cc-date').value;
    const tbody = document.getElementById('admin-cc-tbody');
    
    if (!dateInput) return;
    
    tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding:30px; text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu chấm công...</td></tr>`;
    
    try {
        const response = await fetch(`${API_BASE_URL}/lich-lam-viec?tu_ngay=${dateInput}&den_ngay=${dateInput}`);
        const res = await response.json();
        
        if (res.success) {
            // Lọc lấy các ca ĐÃ DUYỆT
            currentChamCongData = (res.data || []).filter(l => l.TrangThaiXepLich === 'DaDuyet');
            renderAdminChamCongTable();
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Lỗi kết nối máy chủ!</td></tr>`;
    }
}

function renderAdminChamCongTable() {
    const tbody = document.getElementById('admin-cc-tbody');
    const now = new Date();
    const selectedDate = document.getElementById('admin-cc-date').value;
    
    if (currentChamCongData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 40px; text-align: center;">Ngày này không có ca làm việc nào.</td></tr>`;
        return;
    }

    let html = '';
    
    // Sort dữ liệu theo thứ tự từ sáng đến tối
    currentChamCongData.sort((a, b) => {
        const caA = a.ca_lam_viec || a.caLamViec;
        const caB = b.ca_lam_viec || b.caLamViec;
        if(!caA || !caB) return 0;
        return caA.GioBatDau.localeCompare(caB.GioBatDau);
    });

    currentChamCongData.forEach(item => {
        const nv = item.nhan_vien || { HoTen: 'Không rõ' };
        const ca = item.ca_lam_viec || item.caLamViec;
        if(!ca) return;
        
        const timeStr = `${ca.GioBatDau.substring(0,5)} - ${ca.GioKetThuc.substring(0,5)}`;
        const role = item.CongViec === 'ThuNgan' ? 'Thu Ngân' : 'Phục Vụ';

        // Phân tích giờ giấc (Kiểm tra xem đã tới giờ nhân viên phải có mặt chưa)
        const [startH, startM] = ca.GioBatDau.split(':');
        const [y, m, d] = selectedDate.split('-');
        const startTime = new Date(y, m - 1, d, startH, startM);
        const isPastStart = now > startTime; // True nếu bây giờ đã lố giờ bắt đầu ca

        let statusHtml = '';
        let trStyle = '';
        
        if (item.TrangThaiDiemDanh === 'DaLam') {
            const treStr = item.SoPhutDiMuon > 0 ? `<br><small style="color: #ef4444;">Đi muộn ${formatMinutesToHours(item.SoPhutDiMuon)}</small>` : '';
            statusHtml = `<span style="background: #d1fae5; color: #047857; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: bold;"><i class="fa-solid fa-check"></i> Có mặt</span>${treStr}`;
        } else if (item.TrangThaiDiemDanh === 'VangMat') {
            statusHtml = `<span style="background: #fee2e2; color: #b91c1c; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: bold;"><i class="fa-solid fa-xmark"></i> Vắng mặt</span>`;
            trStyle = 'background: #fef2f2;'; // Đỏ nhạt
        } else { // ChuaLam
            if (isPastStart) {
                // Đã quá giờ bắt đầu ca mà vẫn chưa bấm Nhận Ca -> Cảnh báo
                statusHtml = `<span style="background: #fef3c7; color: #b45309; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: bold;"><i class="fa-solid fa-triangle-exclamation"></i> Trễ giờ / Chưa check-in</span>`;
                trStyle = 'background: #fffbeb;'; // Vàng nhạt
            } else {
                statusHtml = `<span style="background: #f1f5f9; color: #64748b; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: bold;">Chưa tới giờ</span>`;
            }
        }

        let thuongPhatHtml = '';
        if (item.TienPhat > 0) thuongPhatHtml += `<div style="color: #ef4444; font-size: 0.85rem; font-weight: bold; margin-bottom: 2px;">- ${Number(item.TienPhat).toLocaleString('vi-VN')}đ</div>`;
        if (item.TienThuong > 0) thuongPhatHtml += `<div style="color: #10b981; font-size: 0.85rem; font-weight: bold; margin-bottom: 2px;">+ ${Number(item.TienThuong).toLocaleString('vi-VN')}đ</div>`;
        if (item.LyDoDieuChinh) thuongPhatHtml += `<div style="font-size: 0.75rem; color: var(--text-muted); max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-block; text-align: right;" title="${item.LyDoDieuChinh}">Lý do: ${item.LyDoDieuChinh}</div>`;
        if (!thuongPhatHtml) thuongPhatHtml = '<span style="color: #cbd5e1;">-</span>';

        // Nút chức năng
        let actionBtn = '';
        const itemJsonStr = JSON.stringify(item).replace(/'/g, "\\'");
        const tenNV = (nv.HoTen || 'Nhân viên').replace(/'/g, "\\'");
        const tenCa = (ca.TenCa || 'Ca làm việc').replace(/'/g, "\\'");

        // Nút Chốt vắng nhanh (chỉ hiện khi ChuaLam và đã quá giờ bắt đầu ca) -> Mở Modal Xác Nhận
        if (item.TrangThaiDiemDanh === 'ChuaLam') {
            actionBtn += `
                <button type="button" class="btn-outline-sm" style="color: #ef4444; border-color: #fecaca; background: #fef2f2; padding: 6px 12px; font-weight: 600; margin-right: 6px; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fef2f2'" onclick="openChotVangConfirmModal('${item.ID}', '${tenNV}', '${tenCa}', '${timeStr}')">
                    <i class="fa-solid fa-user-xmark"></i> Chốt vắng
                </button>
            `;
        }
        
        // Nút mở Modal để tuỳ chỉnh Đi/Nghỉ, Phạt, Thưởng
        actionBtn += `<button type="button" class="btn-outline-sm" style="padding: 6px 12px; font-weight: 600; cursor: pointer;" onclick='openModalChotCong(${itemJsonStr})'><i class="fa-solid fa-pen"></i> Chốt / Sửa công</button>`;

        html += `
            <tr style="${trStyle}">
                <td>
                    <strong style="color: var(--text-dark);">${nv.HoTen}</strong>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">[${role}]</div>
                </td>
                <td>
                    <strong style="color: var(--primary);">${ca.TenCa}</strong>
                    <div style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> ${timeStr}</div>
                </td>
                <td>${statusHtml}</td>
                <td style="text-align: right;">${thuongPhatHtml}</td>
                <td style="text-align: center; white-space: nowrap;">${actionBtn}</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

// 1. Mở Modal Xác nhận trước khi gọi quickChotVangMat
window.openChotVangConfirmModal = function(id, tenNhanVien = 'Nhân viên', tenCa = 'Ca làm', timeStr = '') {
    pendingQuickChotVangId = id;

    let modal = document.getElementById('admin-chot-vang-confirm-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-chot-vang-confirm-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10000; align-items: center; justify-content: center;';
        modal.onclick = function(e) {
            if (e.target === modal) closeChotVangConfirmModal();
        };
        document.body.appendChild(modal);
    }

    const ngayChon = document.getElementById('admin-cc-date')?.value || '';
    const dateDisplay = ngayChon ? ngayChon.split('-').reverse().join('/') : 'hôm nay';

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 420px; width: 92%; text-align: center; padding: 28px 24px; border-radius: 16px; background: #ffffff; box-shadow: 0 20px 40px rgba(15, 23, 42, 0.2); border: 1px solid #fecaca;">
            <div style="width: 66px; height: 66px; border-radius: 50%; background: #fef2f2; color: #ef4444; border: 2px solid #fecaca; display: inline-flex; align-items: center; justify-content: center; font-size: 1.9rem; margin-bottom: 14px;">
                <i class="fa-solid fa-user-xmark"></i>
            </div>
            
            <h3 style="margin: 0 0 10px 0; font-size: 1.28rem; font-weight: 800; color: #0f172a;">Xác nhận Chốt Vắng Mặt</h3>
            
            <p style="color: #475569; font-size: 0.92rem; line-height: 1.6; margin: 0 0 16px 0;">
                Bạn có chắc chắn muốn chốt <strong style="color: #ef4444;">VẮNG MẶT</strong> đối với nhân viên <strong style="color: #0f172a;">${tenNhanVien}</strong> không?
            </p>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; font-size: 0.85rem; color: #334155; text-align: left; margin-bottom: 22px; line-height: 1.6;">
                <div><i class="fa-regular fa-clock" style="color: var(--primary); width: 18px;"></i> Ca làm việc: <strong>${tenCa}</strong> ${timeStr ? `(${timeStr})` : ''}</div>
                <div><i class="fa-regular fa-calendar" style="color: var(--primary); width: 18px;"></i> Ngày làm: <strong>${dateDisplay}</strong></div>
            </div>

            <div style="display: flex; justify-content: center; gap: 12px;">
                <button type="button" onclick="closeChotVangConfirmModal()" style="flex: 1; padding: 10px 18px; border-radius: 10px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-weight: 600; font-size: 0.92rem; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#f1f5f9'; this.style.color='#0f172a';" onmouseout="this.style.background='#ffffff'; this.style.color='#475569';">
                    Hủy bỏ
                </button>
                <button type="button" id="btn-confirm-quick-vang" onclick="quickChotVangMat(pendingQuickChotVangId)" style="flex: 1; padding: 10px 18px; border-radius: 10px; border: 1px solid #ef4444; background: #ef4444; color: #ffffff; font-weight: 700; font-size: 0.92rem; cursor: pointer; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.25); transition: all 0.2s;" onmouseover="this.style.background='#dc2626';" onmouseout="this.style.background='#ef4444';">
                    <i class="fa-solid fa-check" style="margin-right: 6px;"></i> Đồng ý chốt
                </button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
};

window.closeChotVangConfirmModal = function() {
    const modal = document.getElementById('admin-chot-vang-confirm-modal');
    if (modal) modal.style.display = 'none';
    pendingQuickChotVangId = null;
};

// 2. Gọi API PUT /api/lich-lam-viec/{id}/chot-cong để chốt Vắng mặt sau khi xác nhận
window.quickChotVangMat = async function(id) {
    if (!id) return;

    const btn = document.getElementById('btn-confirm-quick-vang');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang chốt...';
    }

    try {
        const response = await fetch(`${API_BASE_URL}/lich-lam-viec/${id}/chot-cong`, {
            method: 'PUT',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}`
            },
            body: JSON.stringify({
                trang_thai_diem_danh: 'VangMat',
                ly_do_dieu_chinh: 'Quản lý chốt vắng mặt do không nhận ca.',
                tien_phat: 0 
            })
        });
        const data = await response.json();

        closeChotVangConfirmModal();

        if (response.ok && data.success) {
            showSystemModal("Thành công", "Đã chốt vắng mặt cho nhân viên.", "success");
            const itemIndex = currentChamCongData.findIndex(item => String(item.ID) === String(id));
            if (itemIndex > -1) {
                currentChamCongData[itemIndex].TrangThaiDiemDanh = 'VangMat';
                currentChamCongData[itemIndex].LyDoDieuChinh = 'Quản lý chốt vắng mặt do không nhận ca.';
                renderAdminChamCongTable();
            } else {
                loadAdminChamCongData();
            }
        } else {
            showSystemModal("Lỗi", data.message || "Không thể chốt vắng mặt!", "error");
        }
    } catch(e) {
        closeChotVangConfirmModal();
        showSystemModal("Lỗi", "Lỗi kết nối máy chủ!", "error");
    }
};

// Mở Modal Sửa Công chi tiết (Hộp thoại tuỳ chỉnh)
window.openModalChotCong = function(item) {
    let modal = document.getElementById('modal-chot-cong');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-chot-cong';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10000;';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 450px;">
                <div class="modal-header">
                    <h3>Điều chỉnh chấm công</h3>
                    <i class="fa-solid fa-xmark" style="cursor: pointer;" onclick="document.getElementById('modal-chot-cong').style.display='none'"></i>
                </div>
                <div class="modal-body">
                    <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 15px;">
                        <div id="cc-modal-info" style="font-weight: 600; color: var(--primary);"></div>
                    </div>
                    
                    <input type="hidden" id="cc-modal-id">
                    
                    <div class="form-group">
                        <label>Trạng thái thực tế</label>
                        <select id="cc-modal-status" class="form-control">
                            <option value="ChuaLam">Chưa nhận ca (Treo chờ)</option>
                            <option value="DaLam">Có mặt (Đã làm)</option>
                            <option value="VangMat">Vắng mặt (Nghỉ)</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label>Số phút đi muộn (Hệ thống tính)</label>
                        <input type="number" id="cc-modal-dimuon" class="form-control" value="0" min="0">
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label>Tiền Phạt (đ)</label>
                            <input type="number" id="cc-modal-phat" class="form-control" value="0" min="0" style="color: #ef4444; font-weight: bold;">
                        </div>
                        <div class="form-group">
                            <label>Tiền Thưởng (đ)</label>
                            <input type="number" id="cc-modal-thuong" class="form-control" value="0" min="0" style="color: #10b981; font-weight: bold;">
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>Lý do / Ghi chú cho kế toán</label>
                        <input type="text" id="cc-modal-lydo" class="form-control" placeholder="Ví dụ: Vắng không phép, Phục vụ khách tốt...">
                    </div>
                </div>
                <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button type="button" onclick="document.getElementById('modal-chot-cong').style.display='none'" style="padding: 9px 20px; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-weight: 600; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#ffffff'">Hủy</button>
                    <button type="button" id="btn-save-cc" class="btn-primary" style="padding: 9px 22px; border-radius: 8px; font-weight: 600;" onclick="executeChotCong(event)">Lưu công</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Đổ dữ liệu vào Modal
    const nv = item.nhan_vien || { HoTen: '' };
    const ca = item.ca_lam_viec || item.caLamViec;
    
    document.getElementById('cc-modal-info').innerText = `${nv.HoTen} - ${ca.TenCa} (${ca.GioBatDau.substring(0,5)})`;
    document.getElementById('cc-modal-id').value = item.ID;
    document.getElementById('cc-modal-status').value = item.TrangThaiDiemDanh;
    document.getElementById('cc-modal-dimuon').value = item.SoPhutDiMuon || 0;
    document.getElementById('cc-modal-phat').value = item.TienPhat || 0;
    document.getElementById('cc-modal-thuong').value = item.TienThuong || 0;
    document.getElementById('cc-modal-lydo').value = item.LyDoDieuChinh || '';
    
    modal.style.display = 'flex';
}

window.executeChotCong = async function(e) {
    const id = document.getElementById('cc-modal-id').value;
    const status = document.getElementById('cc-modal-status').value;
    const dimuon = document.getElementById('cc-modal-dimuon').value;
    const phat = document.getElementById('cc-modal-phat').value;
    const thuong = document.getElementById('cc-modal-thuong').value;
    const lydo = document.getElementById('cc-modal-lydo').value.trim();

    const btn = e.target;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/lich-lam-viec/${id}/chot-cong`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` },
            body: JSON.stringify({
                trang_thai_diem_danh: status,
                so_phut_di_muon: dimuon,
                tien_phat: phat,
                tien_thuong: thuong,
                ly_do_dieu_chinh: lydo
            })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            document.getElementById('modal-chot-cong').style.display = 'none';
            showSystemModal("Thành công", "Đã lưu bảng chấm công.", "success");
            // 1. Cập nhật lại mảng data Local
            const itemIndex = currentChamCongData.findIndex(item => String(item.ID) === String(id));
            if (itemIndex > -1) {
                currentChamCongData[itemIndex].TrangThaiDiemDanh = status;
                currentChamCongData[itemIndex].SoPhutDiMuon = Number(dimuon);
                currentChamCongData[itemIndex].TienPhat = Number(phat);
                currentChamCongData[itemIndex].TienThuong = Number(thuong);
                currentChamCongData[itemIndex].LyDoDieuChinh = lydo;
                
                // 2. Gọi lại hàm render chỉ vẽ bảng từ Data Local (Bỏ qua Fetch API)
                renderAdminChamCongTable();
            } else {
                // Đề phòng lỗi mảng cục bộ, fall back về cách cũ
                loadAdminChamCongData();
            }
        } else {
            showSystemModal("Lỗi", data.message, "error");
        }
    } catch(e) {
        showSystemModal("Lỗi mạng", "Vui lòng kiểm tra lại kết nối.", "error");
    } finally {
        btn.innerHTML = 'Lưu công';
        btn.disabled = false;
    }
}

function formatMinutesToHours(minutes) {
    if (!minutes || minutes <= 0) return '';
    if (minutes < 60) return `${minutes} phút`;
    const hours = Math.floor(minutes / 60);
    const remainMinutes = minutes % 60;
    return remainMinutes === 0 ? `${hours}h` : `${hours}h${remainMinutes}p`;
}

// ======================================================
// XUẤT HÓA ĐƠN ĐẶT SÂN & HỦY TOÀN BỘ HÓA ĐƠN (QUẢN LÝ SÂN & NHÂN VIÊN)
// ======================================================
window.printAdminBookingInvoice = async function(maHoaDon) {
    try {
        const res = await fetch(`${API_BASE_URL}/hoa-don-dat-san/${maHoaDon}`);
        const json = await res.json();
        if (!json.success || !json.data) {
            return showSystemModal('Lỗi', json.message || 'Không tìm thấy hóa đơn!', 'error');
        }
        const hd = json.data;
        const listDatSan = hd.dat_sans || hd.datSans || [];
        const first = listDatSan[0] || {};
        const tenKhach = hd.nguoi_dung?.HoTen || first.TenNguoiDat || first.TenKhachVangLai || 'Khách hàng';
        const sdtKhach = hd.nguoi_dung?.SoDienThoai || first.SDTNguoiDat || first.SDTKhachVangLai || '';
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
        if (!printWin) return showSystemModal('Cảnh báo', 'Vui lòng cho phép mở Pop-up để in hóa đơn!', 'error');

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
                <h2>HÓA ĐƠN ĐẶT SÂN</h2>
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
        showSystemModal('Lỗi', 'Không thể tải dữ liệu hóa đơn!', 'error');
    }
};

window.openAdminCancelInvoiceModal = function(maHoaDon, soTran, isMember, tenKhach, emailGuest, tongCoc) {
    let modal = document.getElementById('admin-cancel-invoice-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-cancel-invoice-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10000; align-items: center; justify-content: center;';
        document.body.appendChild(modal);
    }

    // Tìm bản ghi đầu tiên thuộc hóa đơn này để kiểm tra có phải Đặt hộ (Offline) không và lấy thông tin ngân hàng sẵn có
    const sourceList = (typeof allDatSanData !== 'undefined' && allDatSanData.length > 0)
        ? allDatSanData
        : (typeof staffDatSanData !== 'undefined' ? staffDatSanData : []);
    const sampleItem = sourceList.find(d => d.MaHoaDonDatSan === maHoaDon) || null;
    const hdObj = sampleItem?.hoa_don_dat_san || sampleItem?.hoaDonDatSan || null;
    const isOfflineInvoice = Boolean(
        (hdObj && hdObj.PhuongThucThanhToan === 'TienMat') ||
        sampleItem?.ID_NhanVienXuLy ||
        sampleItem?.MaNhanVienXuLy ||
        (sampleItem?.nguoi_dung?.Email && sampleItem.nguoi_dung.Email.endsWith('.offline'))
    );
    const kh = sampleItem?.nguoi_dung || {};
    const tongCocStr = Number(tongCoc || 0).toLocaleString('vi-VN') + 'đ';

    if (isMember) {
        const offlineInvOptionsHtml = isOfflineInvoice ? `
            <div style="text-align: left; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; margin-bottom: 18px;">
                <div style="font-size: 0.84rem; font-weight: 700; color: #0f172a; margin-bottom: 10px;">
                    <i class="fa-solid fa-hand-holding-dollar" style="color: var(--primary); margin-right: 5px;"></i>
                    Hóa đơn đặt hộ (${soTran} trận) — Chọn hình thức hoàn cọc (${tongCocStr}):
                </div>
                <label style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: #fff; border: 1px solid #e2e8f0; cursor: pointer; margin-bottom: 8px; font-size: 0.88rem; font-weight: 600; color: #1e293b;">
                    <input type="radio" name="inv_refund_method" value="chuyen_khoan" checked onchange="toggleSingleCancelRefundMethod('inv')">
                    <span><i class="fa-solid fa-building-columns" style="color: #2563eb; margin-right: 5px;"></i> Hoàn tiền bằng Chuyển khoản ngân hàng</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: #fff; border: 1px solid #e2e8f0; cursor: pointer; font-size: 0.88rem; font-weight: 600; color: #1e293b;">
                    <input type="radio" name="inv_refund_method" value="vi" onchange="toggleSingleCancelRefundMethod('inv')">
                    <span><i class="fa-solid fa-wallet" style="color: #10b981; margin-right: 5px;"></i> Hoàn tiền vào Ví tài khoản (${tenKhach})</span>
                </label>

                <div id="inv-bank-refund-box" style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #cbd5e1; display: block;">
                    <div style="margin-bottom: 8px;">
                        <label style="font-size: 0.8rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Tên ngân hàng nhận <span style="color:red;">*</span></label>
                        <input type="text" id="inv_bank_name" class="form-control" placeholder="VD: Vietcombank, MB Bank..." value="${kh.TenNganHang || ''}" style="height: 36px; font-size: 0.86rem;">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <div>
                            <label style="font-size: 0.8rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Số tài khoản <span style="color:red;">*</span></label>
                            <input type="text" id="inv_bank_stk" class="form-control" placeholder="Nhập STK..." value="${kh.STKNganHang || ''}" style="height: 36px; font-size: 0.86rem; font-family: monospace;">
                        </div>
                        <div>
                            <label style="font-size: 0.8rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Chủ tài khoản <span style="color:red;">*</span></label>
                            <input type="text" id="inv_bank_owner" class="form-control" placeholder="TÊN IN HOA..." value="${kh.TenTaiKhoan || tenKhach.toUpperCase()}" style="height: 36px; font-size: 0.86rem; text-transform: uppercase;">
                        </div>
                    </div>
                </div>
            </div>
        ` : `
            <p style="color: #64748b; font-size: 0.92rem; line-height: 1.6; margin-bottom: 22px;">
                Khách hàng: <strong style="color:#0f172a;">${tenKhach}</strong>.<br>
                Hệ thống sẽ hủy toàn bộ <strong>${soTran} trận đang đặt cọc</strong> trong hóa đơn này và hoàn trả 100% tiền cọc (${tongCocStr}) vào ví khách hàng.
            </p>
        `;

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 460px; width: 92%; text-align: center; padding: 26px 24px; border-radius: 16px;">
                <div style="font-size: 3.2rem; color: #ef4444; margin-bottom: 10px;"><i class="fa-solid fa-file-circle-xmark"></i></div>
                <h3 style="margin-bottom: 10px; font-size: 1.3rem;">Hủy cả Hóa đơn #${maHoaDon}?</h3>
                <div id="admin-inv-member-alert" class="modal-alert" style="display:none; margin-bottom:12px; text-align:left;"></div>
                ${offlineInvOptionsHtml}
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button type="button" class="btn-outline" style="flex: 1; padding: 10px;" onclick="document.getElementById('admin-cancel-invoice-modal').style.display='none'">Đóng</button>
                    <button type="button" id="btn-exec-cancel-inv" class="btn-primary" style="flex: 1.3; padding: 10px; background: #ef4444; border-color: #ef4444;" onclick="executeAdminCancelInvoice('${maHoaDon}', false, ${isOfflineInvoice})">Xác nhận Hủy & Hoàn tiền</button>
                </div>
            </div>
        `;
    } else {
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 440px; width: 92%; padding: 24px; text-align: left; border-radius: 16px;">
                <h3 style="margin: 0 0 12px 0; font-size: 1.15rem; color: #0f172a;"><i class="fa-solid fa-user-check" style="color:#ef4444;"></i> Hủy Hóa đơn Khách vãng lai (#${maHoaDon})</h3>
                <div id="admin-inv-otp-alert" class="modal-alert" style="display:none; margin-bottom:12px;"></div>
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; margin-bottom:14px; font-size:0.88rem; line-height:1.6;">
                    <div>Khách vãng lai: <strong>${tenKhach}</strong> (${soTran} trận)</div>
                    <div>Email nhận OTP: <strong style="color:#2563eb;">${emailGuest || 'Chưa có'}</strong></div>
                </div>
                <div class="form-group" style="margin-bottom:18px;">
                    <label style="font-size:0.85rem; font-weight:600;">Mã xác thực OTP <span style="color:red;">*</span></label>
                    <div style="display:flex; gap:8px;">
                        <input type="text" id="admin-inv-otp-input" class="form-control" placeholder="Nhập 6 số OTP..." maxlength="6" style="flex:1; text-align:center; font-weight:700;">
                        <button type="button" id="btn-send-inv-otp" class="btn-outline-sm" style="white-space:nowrap; color:#2563eb; border-color:#93c5fd; background:#eff6ff;" onclick="sendAdminInvoiceGuestOtp('${maHoaDon}')">Gửi OTP</button>
                    </div>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button type="button" class="btn-outline" style="width:auto; padding:9px 18px;" onclick="document.getElementById('admin-cancel-invoice-modal').style.display='none'">Đóng</button>
                    <button type="button" id="btn-exec-cancel-inv" class="btn-primary" style="width:auto; padding:9px 18px; background:#ef4444; border-color:#ef4444;" onclick="executeAdminCancelInvoice('${maHoaDon}', true, false)">Xác nhận Hủy HĐ</button>
                </div>
            </div>
        `;
    }
    modal.style.display = 'flex';
};

window.sendAdminInvoiceGuestOtp = async function(maHoaDon) {
    const btn = document.getElementById('btn-send-inv-otp');
    const alertBox = document.getElementById('admin-inv-otp-alert');
    btn.disabled = true;
    btn.innerText = 'Đang gửi...';
    try {
        const res = await fetch(`${API_BASE_URL}/admin/hoa-don-dat-san/${maHoaDon}/gui-otp-huy-guest`, { method: 'POST' });
        const data = await res.json();
        alertBox.textContent = data.message;
        alertBox.className = 'modal-alert ' + (data.success ? 'success' : 'error');
        alertBox.style.display = 'block';
    } catch (e) {
        alertBox.textContent = 'Lỗi kết nối!';
        alertBox.className = 'modal-alert error';
        alertBox.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.innerText = 'Gửi lại OTP';
    }
};

window.executeAdminCancelInvoice = async function(maHoaDon, needOtp = false, isOfflineInvoice = false) {
    let payload = { 
        phuong_thuc_hoan: 'vi',
        return_url: window.location.origin + window.location.pathname
    };

    if (needOtp) {
        const otp = document.getElementById('admin-inv-otp-input')?.value.trim();
        if (!otp || otp.length !== 6) {
            const alertBox = document.getElementById('admin-inv-otp-alert');
            alertBox.textContent = 'Vui lòng nhập đủ 6 số OTP!';
            alertBox.className = 'modal-alert error';
            alertBox.style.display = 'block';
            return;
        }
        payload.otp = otp;
    } else if (isOfflineInvoice) {
        const method = document.querySelector('input[name="inv_refund_method"]:checked')?.value || 'vi';
        payload.phuong_thuc_hoan = method;

        if (method === 'chuyen_khoan') {
            const nganHang = document.getElementById('inv_bank_name')?.value.trim() || '';
            const stk = document.getElementById('inv_bank_stk')?.value.trim() || '';
            const owner = document.getElementById('inv_bank_owner')?.value.trim().toUpperCase() || '';

            if (!nganHang || !stk || !owner) {
                const alertBox = document.getElementById('admin-inv-member-alert');
                alertBox.textContent = 'Vui lòng nhập đầy đủ Tên ngân hàng, Số tài khoản và Chủ tài khoản nhận tiền!';
                alertBox.className = 'modal-alert error';
                alertBox.style.display = 'block';
                return;
            }
            payload.ngan_hang = nganHang;
            payload.so_tai_khoan = stk;
            payload.chu_tai_khoan = owner;
        }
    }

    const btn = document.getElementById('btn-exec-cancel-inv');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';

    try {
        const res = await fetch(`${API_BASE_URL}/admin/hoa-don-dat-san/${maHoaDon}/huy`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
            if (data.vnpay_url) {
                window.location.href = data.vnpay_url;
                return;
            }
            document.getElementById('admin-cancel-invoice-modal').style.display = 'none';
            showSystemModal('Thành công', data.message, 'success');
            if (typeof loadDanhSachDatSanAdmin === 'function' && document.getElementById('datsan-table-body')) {
                loadDanhSachDatSanAdmin();
            }
            if (typeof loadStaffDanhSachDatSan === 'function' && document.getElementById('staff-datsan-table-body')) {
                loadStaffDanhSachDatSan();
            }
        } else {
            showSystemModal('Lỗi', data.message || 'Không thể hủy hóa đơn!', 'error');
            btn.disabled = false;
            btn.innerHTML = 'Xác nhận Hủy & Hoàn tiền';
        }
    } catch (e) {
        showSystemModal('Lỗi', 'Mất kết nối máy chủ!', 'error');
        btn.disabled = false;
        btn.innerHTML = 'Xác nhận Hủy & Hoàn tiền';
    }
};

// ======================================================
// MODULE: ADMIN & QUẢN LÝ SÂN - QUẢN LÝ KHUYẾN MÃI (VOUCHER)
// ======================================================
let allAdminPromos = [];
let adminCustomersListCache = [];
let adminClusterManagersCache = [];
let editingPromoId = null;
let pendingDeletePromoId = null;

// Biến quản lý Tìm kiếm, Bộ lọc & Phân trang cho Khuyến mãi
let currentPromoSearch = '';
let currentPromoScopeFilter = 'All';
let currentPromoTypeFilter = 'All';
let currentPromoStatusFilter = 'All';
let currentPromoPage = 1;
const itemsPerPromoPage = 6;

async function renderQuanLyKhuyenMai() {
    currentPromoSearch = '';
    currentPromoScopeFilter = 'All';
    currentPromoTypeFilter = 'All';
    currentPromoStatusFilter = 'All';
    currentPromoPage = 1;

    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = document.getElementById('menu-khuyenmai');
    if (menuLink) menuLink.classList.add('active');

    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user')) || {};
    const isQuanLy = currentUser.VaiTro === 'QuanLySan';
    const subDesc = isQuanLy
        ? 'Xem mã khuyến mãi Toàn hệ thống và quản lý mã giảm giá riêng cho Cụm sân của bạn'
        : 'Quản lý chương trình khuyến mãi toàn hệ thống, theo từng cụm sân hoặc tặng riêng khách hàng';

    // Quản lý sân được lọc xem: Tất cả, Toàn hệ thống, Cụm sân của tôi (Chỉ Admin mới có mục Tặng khách hàng)
    const scopeFilterOptionsHtml = isQuanLy ? `
        <option value="All">Tất cả phạm vi</option>
        <option value="HE_THONG">Toàn hệ thống</option>
        <option value="CUM_SAN">Cụm sân của tôi</option>
    ` : `
        <option value="All">Tất cả phạm vi</option>
        <option value="HE_THONG">Toàn hệ thống</option>
        <option value="CUM_SAN">Theo Cụm sân</option>
        <option value="KHACH_HANG">Tặng khách hàng</option>
    `;

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 12px;">
            <div>
                <h1 class="page-title">Quản lý Chương trình Khuyến mãi</h1>
                <p class="text-muted">${subDesc}</p>
            </div>
            <button class="btn-primary" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px;" onclick="openPromoModal()">
                <i class="fa-solid fa-plus"></i> Tạo Mã Khuyến Mãi
            </button>
        </div>

        <div class="panel">
            <!-- Thanh Tìm kiếm & Bộ lọc -->
            <div style="display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; align-items: center;">
                <div style="position: relative; flex: 1; min-width: 240px;">
                    <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted);"></i>
                    <input type="text" id="promo-search-input" class="form-control" style="padding-left: 36px;" placeholder="Tìm theo Mã KM, tên chương trình, cụm sân..." oninput="handlePromoSearch(this.value)">
                </div>
                <select class="form-control" style="width: 175px;" onchange="handlePromoScopeFilter(this.value)">
                    ${scopeFilterOptionsHtml}
                </select>
                <select class="form-control" style="width: 170px;" onchange="handlePromoTypeFilter(this.value)">
                    <option value="All">Tất cả loại giảm</option>
                    <option value="PhanTram">Giảm theo %</option>
                    <option value="CoDinh">Giảm tiền cố định</option>
                </select>
                <select class="form-control" style="width: 175px;" onchange="handlePromoStatusFilter(this.value)">
                    <option value="All">Tất cả trạng thái</option>
                    <option value="DangApDung">Đang áp dụng</option>
                    <option value="HetHan">Hết hạn / Khóa</option>
                </select>
            </div>

            <!-- Bảng dữ liệu -->
            <div class="table-responsive" style="min-height: 340px;">
                <table class="admin-table" style="min-width: 1050px;">
                    <thead style="background: #F8FAFC;">
                        <tr>
                            <th style="white-space: nowrap; width: 95px;">Mã KM</th>
                            <th style="min-width: 220px;">Tên Chương Trình</th>
                            <th style="white-space: nowrap;">Mức Giảm</th>
                            <th style="white-space: nowrap;">Đơn Tối Thiểu</th>
                            <th style="white-space: nowrap;">Phạm Vi Áp Dụng</th>
                            <th style="text-align: center; white-space: nowrap;">Số Lượng Còn</th>
                            <th style="white-space: nowrap;">Thời Hạn</th>
                            <th style="text-align: center; white-space: nowrap;">Trạng Thái</th>
                            <th style="text-align: center; white-space: nowrap; width: 130px;">Hành Động</th>
                        </tr>
                    </thead>
                    <tbody id="admin-promo-tbody">
                        <tr><td colspan="9" class="text-center" style="padding: 40px; text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải danh sách khuyến mãi...</td></tr>
                    </tbody>
                </table>
            </div>

            <!-- Phân trang -->
            <div id="admin-promo-pagination" style="display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);"></div>
        </div>
    `;

    loadAdminPromosData();
}

window.handlePromoSearch = function(val) {
    currentPromoSearch = val.toLowerCase().trim();
    currentPromoPage = 1;
    applyPromoFiltersAndRender();
};

window.handlePromoScopeFilter = function(val) {
    currentPromoScopeFilter = val;
    currentPromoPage = 1;
    applyPromoFiltersAndRender();
};

window.handlePromoTypeFilter = function(val) {
    currentPromoTypeFilter = val;
    currentPromoPage = 1;
    applyPromoFiltersAndRender();
};

window.handlePromoStatusFilter = function(val) {
    currentPromoStatusFilter = val;
    currentPromoPage = 1;
    applyPromoFiltersAndRender();
};

async function loadAdminPromosData() {
    const tbody = document.getElementById('admin-promo-tbody');
    if (!tbody) return;

    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user')) || {};
    const isAdmin = currentUser.VaiTro === 'Admin';

    try {
        const promoRes = await fetch(`${API_BASE_URL}/admin/khuyen-mai`);
        const promoJson = await promoRes.json();

        if (isAdmin) {
            const usersRes = await fetch(`${API_BASE_URL}/admin/khach-hang`);
            const usersJson = await usersRes.json();
            if (usersJson.success) {
                adminCustomersListCache = (usersJson.data || []).filter(u => u.VaiTro === 'KhachHang');
            }
        }

        if (promoJson.success) {
            allAdminPromos = promoJson.data || [];
            adminClusterManagersCache = promoJson.danh_sach_quan_ly_cum || [];
            applyPromoFiltersAndRender();
        }
    } catch (e) {
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger" style="padding: 30px; text-align: center;">Lỗi kết nối máy chủ!</td></tr>`;
        }
    }
}

function applyPromoFiltersAndRender() {
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user')) || {};
    const isQuanLy = currentUser.VaiTro === 'QuanLySan';
    const myCumSan = String(currentUser.MaCumSan || currentUser.ID_CumSan || '');

    const filtered = allAdminPromos.filter(km => {
        const phamVi = km.pham_vi || (!km.MaNguoiDung ? 'HE_THONG' : (km.nguoi_dung?.VaiTro === 'QuanLySan' ? 'CUM_SAN' : 'KHACH_HANG'));

        // Quản lý sân chỉ xem được mã Toàn hệ thống (HE_THONG) và mã Cụm sân của mình (CUM_SAN)
        if (isQuanLy) {
            if (phamVi === 'KHACH_HANG') return false;
            if (phamVi === 'CUM_SAN' && String(km.ma_cum_san_ap_dung || km.nguoi_dung?.MaCumSan) !== myCumSan) {
                return false;
            }
        }

        const matchScope = (currentPromoScopeFilter === 'All' || phamVi === currentPromoScopeFilter);
        const matchType = (currentPromoTypeFilter === 'All' || km.LoaiKhuyenMai === currentPromoTypeFilter);
        const matchStatus = (currentPromoStatusFilter === 'All' || km.TrangThai === currentPromoStatusFilter);

        const maStr = String(km.MaKhuyenMai || '').toLowerCase();
        const tenStr = String(km.TenKhuyenMai || '').toLowerCase();
        const moTaStr = String(km.MoTa || '').toLowerCase();
        const doiTuongStr = String(km.ten_cum_san_ap_dung || km.nguoi_dung?.HoTen || '').toLowerCase();

        const matchSearch = currentPromoSearch === '' ||
            maStr.includes(currentPromoSearch) ||
            tenStr.includes(currentPromoSearch) ||
            moTaStr.includes(currentPromoSearch) ||
            doiTuongStr.includes(currentPromoSearch);

        return matchScope && matchType && matchStatus && matchSearch;
    });

    const totalPages = Math.ceil(filtered.length / itemsPerPromoPage) || 1;
    if (currentPromoPage > totalPages) currentPromoPage = totalPages;
    const startIdx = (currentPromoPage - 1) * itemsPerPromoPage;
    const pageData = filtered.slice(startIdx, startIdx + itemsPerPromoPage);

    renderAdminPromosTable(pageData);
    renderAdminPromosPagination(totalPages);
}

function renderAdminPromosTable(data) {
    const tbody = document.getElementById('admin-promo-tbody');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted" style="padding: 45px; text-align: center;">Không tìm thấy chương trình khuyến mãi nào phù hợp.</td></tr>`;
        return;
    }

    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user')) || {};
    const isQuanLy = currentUser.VaiTro === 'QuanLySan';
    const myCumSan = String(currentUser.MaCumSan || currentUser.ID_CumSan || '');

    tbody.innerHTML = data.map(km => {
        const isPercent = km.LoaiKhuyenMai === 'PhanTram';
        const giaTriStr = isPercent
            ? `<div style="white-space: nowrap;"><strong style="color: #15803d; font-size: 0.92rem;">Giảm ${Number(km.GiaTri)}%</strong></div>
               <div style="font-size: 0.76rem; color: #64748b; white-space: nowrap;">Tối đa: ${Number(km.GiaTriToiDa).toLocaleString('vi-VN')}đ</div>`
            : `<div style="white-space: nowrap;"><strong style="color: #1d4ed8; font-size: 0.92rem;">-${Number(km.GiaTri).toLocaleString('vi-VN')}đ</strong></div>
               <div style="font-size: 0.76rem; color: #64748b; white-space: nowrap;">Mức cố định</div>`;

        let doiTuongHtml = '';
        const phamVi = km.pham_vi || (!km.MaNguoiDung ? 'HE_THONG' : (km.nguoi_dung?.VaiTro === 'QuanLySan' ? 'CUM_SAN' : 'KHACH_HANG'));

        if (phamVi === 'HE_THONG') {
            doiTuongHtml = `<span style="background: #f0f9ff; color: #0369a1; border: 1px solid #bae6fd; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; display: inline-block; white-space: nowrap;">Toàn hệ thống</span>`;
        } else if (phamVi === 'CUM_SAN') {
            const tenCS = km.ten_cum_san_ap_dung || km.nguoi_dung?.cum_san?.TenCumSan || ('Cụm sân #' + (km.nguoi_dung?.MaCumSan || ''));
            doiTuongHtml = `<span style="background: #fffbeb; color: #b45309; border: 1px solid #fde68a; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; display: inline-block; white-space: nowrap;">${tenCS}</span>`;
        } else {
            doiTuongHtml = `<span style="background: #faf5ff; color: #7e22ce; border: 1px solid #e9d5ff; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; display: inline-block; white-space: nowrap;">KH: ${km.nguoi_dung?.HoTen || km.MaNguoiDung}</span>`;
        }

        const startStr = km.NgayBatDau ? km.NgayBatDau.substring(0, 10).split('-').reverse().join('/') : '';
        const endStr = km.NgayKetThuc ? km.NgayKetThuc.substring(0, 10).split('-').reverse().join('/') : '';

        const isActive = km.TrangThai === 'DangApDung';
        const statusBadge = isActive
            ? `<span class="badge badge-success" style="white-space: nowrap; display: inline-block;">Đang áp dụng</span>`
            : `<span class="badge badge-danger" style="white-space: nowrap; display: inline-block;">Hết hạn / Khóa</span>`;

        const conLai = Math.max(0, Number(km.SoLuong) - Number(km.SoLuongDaDung));
        const safeJson = JSON.stringify(km).replace(/'/g, "\\'");
        const safeTenKM = (km.TenKhuyenMai || '').replace(/'/g, "\\'");

        // Quản lý sân chỉ được Sửa/Xóa mã của Cụm sân mình; với mã Toàn hệ thống chỉ được xem
        let canModify = true;
        if (isQuanLy) {
            if (phamVi !== 'CUM_SAN' || String(km.ma_cum_san_ap_dung || km.nguoi_dung?.MaCumSan) !== myCumSan) {
                canModify = false;
            }
        }

        const actionHtml = canModify
            ? `<div style="display: inline-flex; gap: 6px; align-items: center;">
                    <button type="button" class="action-btn" style="white-space: nowrap;" onclick='openPromoModal(${safeJson})'>
                        <i class="fa-solid fa-pen-to-square"></i> Sửa
                    </button>
                    <button type="button" class="action-btn" style="color: #ef4444; border-color: #fecaca; background: #fef2f2; white-space: nowrap;" onclick="openDeletePromoConfirmModal('${km.MaKhuyenMai}', '${safeTenKM}')">
                        <i class="fa-solid fa-trash-can"></i> Xóa
                    </button>
               </div>`
            : `<span style="font-size: 0.78rem; color: #94a3b8; font-weight: 600; white-space: nowrap;"><i class="fa-solid fa-lock"></i> Chỉ xem</span>`;

        return `
            <tr>
                <td style="white-space: nowrap;">
                    <span style="font-family: monospace; font-weight: 700; color: #334155; background: #f1f5f9; border: 1px solid #e2e8f0; padding: 4px 8px; border-radius: 6px; font-size: 0.86rem; display: inline-block;">#${km.MaKhuyenMai}</span>
                </td>
                <td>
                    <div style="font-weight: 700; color: #0f172a; font-size: 0.92rem; line-height: 1.35;">${km.TenKhuyenMai}</div>
                    ${km.MoTa ? `<div style="font-size: 0.8rem; color: #64748b; margin-top: 2px; max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${km.MoTa}">${km.MoTa}</div>` : ''}
                </td>
                <td style="white-space: nowrap;">${giaTriStr}</td>
                <td style="white-space: nowrap;"><strong style="color: #334155;">${Number(km.GiaTriHoaDonToiThieu).toLocaleString('vi-VN')}đ</strong></td>
                <td style="white-space: nowrap;">${doiTuongHtml}</td>
                <td style="text-align: center; white-space: nowrap;">
                    <div style="font-weight: 700; color: ${conLai > 0 ? '#047857' : '#dc2626'}; font-size: 0.92rem;">${conLai} <span style="color: #94a3b8; font-weight: 500;">/ ${km.SoLuong}</span></div>
                    <div style="font-size: 0.74rem; color: #64748b;">Đã dùng: ${km.SoLuongDaDung}</div>
                </td>
                <td style="font-size: 0.84rem; color: #475569; white-space: nowrap;">
                    ${startStr} &rarr; ${endStr}
                </td>
                <td style="text-align: center; white-space: nowrap;">${statusBadge}</td>
                <td style="text-align: center; white-space: nowrap;">${actionHtml}</td>
            </tr>
        `;
    }).join('');
}

function renderAdminPromosPagination(totalPages) {
    const div = document.getElementById('admin-promo-pagination');
    if (!div) return;
    if (totalPages <= 1) {
        div.innerHTML = '';
        return;
    }

    let html = `<button class="btn-outline-sm" ${currentPromoPage === 1 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''} onclick="currentPromoPage--; applyPromoFiltersAndRender()"><i class="fa-solid fa-chevron-left"></i></button>`;

    for (let i = 1; i <= totalPages; i++) {
        const isActive = i === currentPromoPage;
        html += `<button class="${isActive ? 'btn-primary' : 'btn-outline-sm'}" style="padding: 6px 14px;" onclick="currentPromoPage=${i}; applyPromoFiltersAndRender()">${i}</button>`;
    }

    html += `<button class="btn-outline-sm" ${currentPromoPage === totalPages ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''} onclick="currentPromoPage++; applyPromoFiltersAndRender()"><i class="fa-solid fa-chevron-right"></i></button>`;
    div.innerHTML = html;
}

window.togglePromoTypeInput = function() {
    const type = document.getElementById('km-loai')?.value || 'PhanTram';
    const maxGroup = document.getElementById('km-group-toida');
    const valInput = document.getElementById('km-giatri');
    const maxInput = document.getElementById('km-toida');

    if (type === 'CoDinh') {
        if (maxGroup) maxGroup.style.display = 'none';
        if (maxInput && valInput) maxInput.value = valInput.value || 0;
    } else {
        if (maxGroup) maxGroup.style.display = 'block';
    }
};

window.togglePromoTargetScope = function() {
    const scope = document.getElementById('km-phamvi')?.value || 'HE_THONG';
    const groupCumSan = document.getElementById('km-group-cumsan');
    const groupKhachHang = document.getElementById('km-group-khachhang');

    if (groupCumSan) groupCumSan.style.display = (scope === 'CUM_SAN') ? 'block' : 'none';
    if (groupKhachHang) groupKhachHang.style.display = (scope === 'KHACH_HANG') ? 'block' : 'none';
};

window.openPromoModal = function(km = null) {
    editingPromoId = km ? km.MaKhuyenMai : null;

    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user')) || {};
    const isAdmin = currentUser.VaiTro === 'Admin';
    const myManagerId = currentUser.MaNguoiDung || currentUser.ID;

    let modal = document.getElementById('admin-promo-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-promo-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10000; align-items: center; justify-content: center;';
        document.body.appendChild(modal);
    }

    const todayStr = new Date().toISOString().substring(0, 10);
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    const nextMonthStr = nextMonth.toISOString().substring(0, 10);

    let currentScope = isAdmin ? 'HE_THONG' : 'CUM_SAN';
    if (km && isAdmin) {
        currentScope = km.pham_vi || (!km.MaNguoiDung ? 'HE_THONG' : (km.nguoi_dung?.VaiTro === 'QuanLySan' ? 'CUM_SAN' : 'KHACH_HANG'));
    }

    // Chỉ Admin mới được chọn 3 phạm vi (bao gồm tặng riêng cá nhân); Quản lý sân mặc định cố định là Cụm sân của mình
    let scopeSectionHtml = '';
    if (isAdmin) {
        const clusterOpts = adminClusterManagersCache.map(ql => {
            const maQL = ql.MaNguoiDung || ql.ID;
            const tenCS = ql.cum_san ? ql.cum_san.TenCumSan : ('Cụm sân #' + ql.MaCumSan);
            const selected = (km && km.MaNguoiDung === maQL) ? 'selected' : '';
            return `<option value="${maQL}" ${selected}>${tenCS} (Quản lý: ${ql.HoTen} - #${maQL})</option>`;
        }).join('');

        const customerOptions = `<option value="">-- Chọn khách hàng nhận mã --</option>` +
            adminCustomersListCache.map(c => {
                const ma = c.MaNguoiDung || c.ID;
                const selected = (km && km.MaNguoiDung === ma) ? 'selected' : '';
                return `<option value="${ma}" ${selected}>${c.HoTen} (${c.SoDienThoai} - Mã: ${ma})</option>`;
            }).join('');

        scopeSectionHtml = `
            <div class="form-group">
                <label>Phạm vi áp dụng khuyến mãi <span style="color:red;">*</span></label>
                <select id="km-phamvi" class="form-control" onchange="togglePromoTargetScope()" style="font-weight: 600;">
                    <option value="HE_THONG" ${currentScope === 'HE_THONG' ? 'selected' : ''}>Toàn hệ thống (Áp dụng mọi cụm sân)</option>
                    <option value="CUM_SAN" ${currentScope === 'CUM_SAN' ? 'selected' : ''}>Riêng cho từng Cụm sân</option>
                    <option value="KHACH_HANG" ${currentScope === 'KHACH_HANG' ? 'selected' : ''}>Tặng riêng cho 1 Khách hàng cá nhân</option>
                </select>
            </div>

            <div class="form-group" id="km-group-cumsan" style="display: none;">
                <label>Chọn Cụm sân áp dụng <span style="color:red;">*</span></label>
                <select id="km-cumsan-manager" class="form-control">
                    <option value="">-- Chọn Cụm sân được hưởng mã --</option>
                    ${clusterOpts}
                </select>
            </div>

            <div class="form-group" id="km-group-khachhang" style="display: none;">
                <label>Chọn Khách hàng được tặng riêng <span style="color:red;">*</span></label>
                <select id="km-nguoidung" class="form-control">
                    ${customerOptions}
                </select>
                <small style="color: #64748b;">Hệ thống sẽ tự động gửi thông báo ưu đãi đến khách hàng được chọn.</small>
            </div>
        `;
    } else {
        // Quản lý sân: Mặc định khóa cứng phạm vi là Cụm sân của mình
        scopeSectionHtml = `
            <div class="form-group">
                <label>Phạm vi áp dụng khuyến mãi</label>
                <input type="text" class="form-control" value="Áp dụng riêng cho Cụm sân của bạn" disabled style="background: #f1f5f9; font-weight: 600; color: var(--primary);">
                <input type="hidden" id="km-phamvi" value="CUM_SAN">
                <input type="hidden" id="km-cumsan-manager" value="${myManagerId}">
            </div>
        `;
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 560px; width: 94%;">
            <div class="modal-header">
                <h3>${km ? `Chỉnh sửa Khuyến mãi #${km.MaKhuyenMai}` : 'Tạo Chương trình Khuyến mãi mới'}</h3>
                <i class="fa-solid fa-xmark" style="cursor: pointer;" onclick="document.getElementById('admin-promo-modal').style.display='none'"></i>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Tên chương trình khuyến mãi <span style="color:red;">*</span></label>
                    <input type="text" id="km-ten" class="form-control" placeholder="VD: Giảm 10% đặt sân cuối tuần" value="${km ? km.TenKhuyenMai : ''}">
                </div>

                ${scopeSectionHtml}

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                    <div class="form-group">
                        <label>Loại khuyến mãi <span style="color:red;">*</span></label>
                        <select id="km-loai" class="form-control" onchange="togglePromoTypeInput()">
                            <option value="PhanTram" ${(!km || km.LoaiKhuyenMai === 'PhanTram') ? 'selected' : ''}>Theo Phần trăm (%)</option>
                            <option value="CoDinh" ${(km && km.LoaiKhuyenMai === 'CoDinh') ? 'selected' : ''}>Số tiền cố định (VNĐ)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Giá trị giảm (% hoặc VNĐ) <span style="color:red;">*</span></label>
                        <input type="number" id="km-giatri" class="form-control" placeholder="VD: 10 hoặc 50000" value="${km ? Number(km.GiaTri) : ''}">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                    <div class="form-group" id="km-group-toida">
                        <label>Giảm tối đa (VNĐ)</label>
                        <input type="number" id="km-toida" class="form-control" placeholder="VD: 100000" value="${km ? Number(km.GiaTriToiDa) : '100000'}">
                    </div>
                    <div class="form-group">
                        <label>Giá trị đơn tối thiểu (VNĐ) <span style="color:red;">*</span></label>
                        <input type="number" id="km-toithieu" class="form-control" placeholder="VD: 300000" value="${km ? Number(km.GiaTriHoaDonToiThieu) : '0'}">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                    <div class="form-group">
                        <label>Tổng số lượng mã <span style="color:red;">*</span></label>
                        <input type="number" id="km-soluong" class="form-control" min="1" value="${km ? km.SoLuong : '50'}">
                    </div>
                    <div class="form-group">
                        <label>Ngày bắt đầu <span style="color:red;">*</span></label>
                        <input type="date" id="km-batdau" class="form-control" value="${km && km.NgayBatDau ? km.NgayBatDau.substring(0, 10) : todayStr}">
                    </div>
                    <div class="form-group">
                        <label>Ngày kết thúc <span style="color:red;">*</span></label>
                        <input type="date" id="km-ketthuc" class="form-control" value="${km && km.NgayKetThuc ? km.NgayKetThuc.substring(0, 10) : nextMonthStr}">
                    </div>
                </div>

                ${km ? `
                <div class="form-group">
                    <label>Trạng thái</label>
                    <select id="km-trangthai" class="form-control">
                        <option value="DangApDung" ${km.TrangThai === 'DangApDung' ? 'selected' : ''}>Đang áp dụng</option>
                        <option value="HetHan" ${km.TrangThai === 'HetHan' ? 'selected' : ''}>Hết hạn / Tạm ngưng</option>
                    </select>
                </div>` : ''}

                <div class="form-group" style="margin-bottom: 0;">
                    <label>Mô tả điều kiện</label>
                    <textarea id="km-mota" class="form-control" rows="2" placeholder="VD: Áp dụng cho đơn đặt sân từ 300.000đ trở lên...">${km && km.MoTa ? km.MoTa : ''}</textarea>
                </div>
            </div>
            <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px;">
                <button type="button" class="btn-outline" style="width: auto; padding: 9px 20px;" onclick="document.getElementById('admin-promo-modal').style.display='none'">Hủy bỏ</button>
                <button type="button" id="btn-save-promo" class="btn-primary" style="width: auto; padding: 9px 22px;" onclick="savePromoAdmin()">Lưu Khuyến Mãi</button>
            </div>
        </div>
    `;

    togglePromoTypeInput();
    if (isAdmin) togglePromoTargetScope();
    modal.style.display = 'flex';
};

window.savePromoAdmin = async function() {
    const ten = document.getElementById('km-ten')?.value.trim();
    const phamVi = document.getElementById('km-phamvi')?.value || 'CUM_SAN';
    const loai = document.getElementById('km-loai')?.value || 'PhanTram';
    const giaTri = Number(document.getElementById('km-giatri')?.value || 0);
    const toiDa = (loai === 'CoDinh') ? giaTri : Number(document.getElementById('km-toida')?.value || 0);
    const toiThieu = Number(document.getElementById('km-toithieu')?.value || 0);
    const soLuong = Number(document.getElementById('km-soluong')?.value || 1);
    const batDau = document.getElementById('km-batdau')?.value;
    const ketThuc = document.getElementById('km-ketthuc')?.value;
    const trangThai = document.getElementById('km-trangthai')?.value || 'DangApDung';
    const moTa = document.getElementById('km-mota')?.value.trim() || '';

    if (!ten || giaTri <= 0 || !batDau || !ketThuc) {
        return showSystemModal('Thiếu thông tin', 'Vui lòng nhập đầy đủ Tên khuyến mãi, Giá trị giảm và Thời hạn áp dụng!', 'error');
    }

    let maND = null;
    if (phamVi === 'CUM_SAN') {
        maND = document.getElementById('km-cumsan-manager')?.value || null;
        if (!maND) {
            return showSystemModal('Chưa chọn Cụm sân', 'Vui lòng chọn Cụm sân áp dụng khuyến mãi!', 'error');
        }
    } else if (phamVi === 'KHACH_HANG') {
        maND = document.getElementById('km-nguoidung')?.value || null;
        if (!maND) {
            return showSystemModal('Chưa chọn Khách hàng', 'Vui lòng chọn Khách hàng được tặng mã khuyến mãi!', 'error');
        }
    }

    const btn = document.getElementById('btn-save-promo');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';

    const url = editingPromoId
        ? `${API_BASE_URL}/admin/khuyen-mai/${editingPromoId}`
        : `${API_BASE_URL}/admin/khuyen-mai`;
    const method = editingPromoId ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                loai_doi_tuong: phamVi,
                TenKhuyenMai: ten,
                MaNguoiDung: maND,
                LoaiKhuyenMai: loai,
                GiaTri: giaTri,
                GiaTriToiDa: toiDa,
                GiaTriHoaDonToiThieu: toiThieu,
                SoLuong: soLuong,
                NgayBatDau: batDau + ' 00:00:00',
                NgayKetThuc: ketThuc + ' 23:59:59',
                TrangThai: trangThai,
                MoTa: moTa
            })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            document.getElementById('admin-promo-modal').style.display = 'none';
            showSystemModal('Thành công', data.message, 'success');
            loadAdminPromosData();
        } else {
            showSystemModal('Lỗi', data.message || 'Không thể lưu khuyến mãi!', 'error');
        }
    } catch (e) {
        showSystemModal('Lỗi', 'Mất kết nối máy chủ!', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Lưu Khuyến Mãi';
    }
};

window.openDeletePromoConfirmModal = function(maKhuyenMai, tenKhuyenMai = '') {
    pendingDeletePromoId = maKhuyenMai;

    let modal = document.getElementById('admin-delete-promo-confirm-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-delete-promo-confirm-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10050; align-items: center; justify-content: center;';
        modal.onclick = function(e) {
            if (e.target === modal) closeDeletePromoConfirmModal();
        };
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 420px; width: 92%; text-align: center; padding: 28px 24px; border-radius: 16px;">
            <div style="width: 64px; height: 64px; border-radius: 50%; background: #fef2f2; color: #ef4444; border: 2px solid #fecaca; display: inline-flex; align-items: center; justify-content: center; font-size: 1.8rem; margin-bottom: 14px;">
                <i class="fa-solid fa-trash-can"></i>
            </div>
            <h3 style="margin: 0 0 10px 0; font-size: 1.25rem; font-weight: 800; color: #0f172a;">Xác nhận xóa khuyến mãi</h3>
            <p style="color: #475569; font-size: 0.92rem; line-height: 1.6; margin: 0 0 22px 0;">
                Bạn có chắc chắn muốn xóa mã khuyến mãi <strong style="color: #0f172a;">#${maKhuyenMai}</strong>${tenKhuyenMai ? ` (${tenKhuyenMai})` : ''} không?
            </p>
            <div style="display: flex; justify-content: center; gap: 12px;">
                <button type="button" class="btn-outline" style="flex: 1; padding: 10px 18px; border-radius: 10px;" onclick="closeDeletePromoConfirmModal()">Hủy bỏ</button>
                <button type="button" id="btn-confirm-delete-promo" class="btn-primary" style="flex: 1; padding: 10px 18px; border-radius: 10px; background: #ef4444; border-color: #ef4444;" onclick="executeDeletePromoAdmin()">
                    <i class="fa-solid fa-check" style="margin-right: 5px;"></i> Đồng ý xóa
                </button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
};

window.closeDeletePromoConfirmModal = function() {
    const modal = document.getElementById('admin-delete-promo-confirm-modal');
    if (modal) modal.style.display = 'none';
    pendingDeletePromoId = null;
};

window.executeDeletePromoAdmin = async function() {
    if (!pendingDeletePromoId) return;

    const btn = document.getElementById('btn-confirm-delete-promo');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xóa...';
    }

    try {
        const res = await fetch(`${API_BASE_URL}/admin/khuyen-mai/${pendingDeletePromoId}`, {
            method: 'DELETE',
            headers: { 'Accept': 'application/json' }
        });
        const data = await res.json();
        closeDeletePromoConfirmModal();

        if (res.ok && data.success) {
            showSystemModal('Thành công', data.message, 'success');
            loadAdminPromosData();
        } else {
            showSystemModal('Lỗi', data.message || 'Không thể xóa!', 'error');
        }
    } catch (e) {
        closeDeletePromoConfirmModal();
        showSystemModal('Lỗi', 'Mất kết nối máy chủ!', 'error');
    }
};

window.deletePromoAdmin = function(maKhuyenMai, tenKhuyenMai = '') {
    openDeletePromoConfirmModal(maKhuyenMai, tenKhuyenMai);
};