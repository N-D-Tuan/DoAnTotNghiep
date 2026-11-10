const API_BASE_URL = 'http://127.0.0.1:8000/api';

// 1. FETCH INTERCEPTOR (TỰ ĐỘNG BƠM TOKEN VÀO MỌI API)
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

let selectedOfflineSlots = [];
let currentPitchId = null;
let currentCumSanId = null;
let currentLoaiSanId = null;

let staffChartInstance = null;
let staffDashboardFilterTime = 'hom_nay';

// 2. DOM READY
document.addEventListener('DOMContentLoaded', () => {
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));

    // Kiểm tra đăng nhập và vai trò
    if (!currentUser || currentUser.VaiTro !== 'NhanVien') {
        sessionStorage.clear();
        window.location.href = 'login.html';
        return;
    }

    // Hiển thị tên
    const nameEl = document.getElementById('nhanvien-name');
    if (nameEl) nameEl.textContent = currentUser.HoTen;

    loadNotifications();

    // Đăng xuất
    const logoutBtn = document.querySelector('.logout-link');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await logoutNhanVien();
        });
    }

    // ==========================================
    // 3. KẾT NỐI WEBSOCKET ĐỂ TEST CHỨC NĂNG KHÓA
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
                        body: JSON.stringify({ socket_id: socketId, channel_name: channel.name })
                    })
                    .then(response => response.json())
                    .then(data => callback(false, data))
                    .catch(error => callback(true, error));
                }
            };
        }
    });

    window.Echo.channel('system-updates')
        .listen('SystemDataUpdated', async (e) => {
            console.log('⚡ Hệ thống có người vừa đặt sân (Staff View)...');
            
            // 1. CẬP NHẬT REALTIME LỊCH ĐẶT SÂN
            // CHỈ cập nhật nếu Nhân viên đang đứng ở trang xem Lưới lịch (Màn hình Thu Ngân)
            // Biến currentPitchId sẽ được định nghĩa sau khi bạn làm chức năng render lịch
            if (typeof currentPitchId !== 'undefined' && currentPitchId !== null && document.querySelector('.schedule-table')) {
                try {
                    // Fetch lại dữ liệu mới nhất của sân hiện tại
                    const dsRes = await fetch(`${API_BASE_URL}/dat-san/da-dat?id_san_bong=${currentPitchId}&_t=${new Date().getTime()}`);
                    const bookedSlots = (await dsRes.json()).data || [];

                    // 1. Nhả tất cả các ô đang xám (Đã đặt) thành màu xanh (Trống)
                    document.querySelectorAll('.schedule-table .slot.booked').forEach(el => {
                        if (el.innerText === 'Đã đặt') {
                            el.classList.remove('booked');
                            el.classList.add('available');
                            el.innerText = 'CÒN TRỐNG';
                            
                            // Khôi phục sự kiện click cho phép Nhân viên chọn
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

                            // 3. Nếu xui xẻo Nhân viên đang chọn đúng ô mà khách vừa đặt online -> Rút ô đó khỏi giỏ hàng
                            if (typeof selectedOfflineSlots !== 'undefined') {
                                const existingIndex = selectedOfflineSlots.findIndex(s => s.id === targetSlotId);
                                if (existingIndex > -1) {
                                    selectedOfflineSlots.splice(existingIndex, 1);
                                    
                                    // Cập nhật lại thanh giỏ hàng nổi
                                    if (typeof updateOfflineCartUI === 'function') updateOfflineCartUI(); 
                                    
                                    // Nếu đang mở Modal đặt hộ thì vẽ lại danh sách
                                    const modal = document.getElementById('offline-booking-modal');
                                    if (modal && modal.style.display === 'flex') {
                                        if (selectedOfflineSlots.length > 0) {
                                            if (typeof openOfflineCartModal === 'function') openOfflineCartModal();
                                        } else {
                                            if (typeof closeOfflineModal === 'function') closeOfflineModal();
                                        }
                                    }
                                }
                            }
                        }
                    });
                } catch(err) { 
                    console.error("Lỗi cập nhật ngầm lịch Nhân viên:", err); 
                }
            }

            // 3. CẬP NHẬT REALTIME THỐNG KÊ NHÂN VIÊN
            if (document.getElementById('staff-stat-sotran')) {
                const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
                if(currentUser && currentUser.ID_CumSan) {
                    updateStaffDailyStats(currentUser.ID_CumSan);
                    updateStaffDashboardStats(); // Cập nhật luôn Biểu đồ ở dưới
                }
            }

            // 4. CẬP NHẬT REALTIME LỊCH NHÂN VIÊN
            const currentTabStaff = document.getElementById('staff-cal-current');
            const nextTabStaff = document.getElementById('staff-cal-next');

            // Nếu Nhân viên đang đứng ở Tab "Lịch Tuần Này" (Xem lịch sửa đột xuất)
            if (currentTabStaff && currentTabStaff.style.display !== 'none') {
                loadStaffCalendarData(0, 'grid-staff-current-week');
            }

            // Nếu Nhân viên đang đứng ở Tab "Đăng Ký Tuần Sau" (Quản lý vừa chốt lịch)
            if (nextTabStaff && nextTabStaff.style.display !== 'none') {
                // Tương tự, nếu nhân viên đang có các thao tác chọn/bỏ ca chưa bấm "Gửi" thì không load lại
                if (typeof pendingStaffShifts !== 'undefined' && pendingStaffShifts.length === 0) {
                    loadStaffCalendarData(1, 'grid-staff-next-week');
                }
            }

            // 5. CẬP NHẬT REALTIME QUẢN LÝ ĐẶT SÂN (CHỐT SÂN) CỦA NHÂN VIÊN
            // Nếu Nhân viên đang đứng ở màn hình Quản lý đặt sân -> Tự động tải lại dữ liệu bảng ngầm mà không load lại trang
            if (document.getElementById('staff-datsan-table-body')) {
                loadStaffDanhSachDatSan();
            }

            // 7. CẬP NHẬT REALTIME ĐIỂM ĐÁNH GIÁ CƠ SỞ & MODAL ĐÁNH GIÁ CỦA NHÂN VIÊN
            const currentUserStaff = JSON.parse(sessionStorage.getItem('dn_football_user'));
            if (currentUserStaff && currentUserStaff.ID_CumSan) {
                syncStaffClusterRatingRealtime(currentUserStaff.ID_CumSan);
            }

            // 8. CẬP NHẬT REALTIME MODAL DỜI LỊCH ĐẶT SÂN (NẾU NHÂN VIÊN ĐANG MỞ)
            if (typeof refreshAdminRescheduleSlotsRealtime === 'function') {
                refreshAdminRescheduleSlotsRealtime();
            }
        });

    // Lắng nghe kênh CÁ NHÂN của chính nhân viên này
    window.Echo.private(`user.${currentUser.ID}`)
        .listen('.UserDataUpdated', async (e) => {
            console.log('⚡ Nhận được thông báo cá nhân!');
            
            await loadNotifications();

            // Tự động mở khóa lưới lịch tuần sau nếu Quản lý vừa cấp quyền khẩn cấp
            const nextTabStaff = document.getElementById('staff-cal-next');
            if (nextTabStaff && nextTabStaff.style.display !== 'none' && pendingStaffShifts.length === 0) {
                loadStaffCalendarData(1, 'grid-staff-next-week');
            }

            try {
                // Fetch thông báo mới nhất để kiểm tra nội dung
                const res = await fetch(`${API_BASE_URL}/thong-bao`);
                if (res.ok) {
                    const data = await res.json();
                    const list = data.data || [];
                    if (list.length > 0) {
                        const latestNotif = list[0]; 
                        
                        // Kiểm tra từ khóa "bị khóa"
                        const isLocked = latestNotif.TieuDe.toLowerCase().includes('bị khóa') || 
                                         latestNotif.NoiDung.toLowerCase().includes('bị khóa');
                        
                        if (isLocked) {
                            showSystemModal(latestNotif.TieuDe, latestNotif.NoiDung, 'error');
                            
                            // Đếm ngược 4 giây rồi tự động đá văng ra màn hình đăng nhập
                            setTimeout(() => {
                                sessionStorage.clear();
                                window.location.href = 'login.html';
                            }, 4000);
                        }
                    }
                }
            } catch (err) {
                console.error('Lỗi khi kiểm tra thông báo bị khóa', err);
            }
        });

    renderManHinhThuNgan();
});

async function logoutNhanVien() {
    try {
        await fetch(`${API_BASE_URL}/dang-xuat`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Lỗi đăng xuất:', error);
    } finally {
        sessionStorage.clear();
        window.location.href = 'index.html';
    }
}

// Hàm Modal y hệt Admin
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
        <div class="modal-content" style="max-width: 350px; text-align: center; padding: 30px 20px; border-radius: 16px;">
            <div style="margin-bottom: 15px;">${iconHtml}</div>
            <h3 style="margin-bottom: 10px; font-size: 1.3rem; color: var(--text-dark);">${title}</h3>
            <p style="color: var(--text-muted); margin-bottom: 25px; line-height: 1.5; font-size: 0.95rem;">${message}</p>
            <button onclick="document.getElementById('system-alert-modal').style.display='none'" style="background: ${btnColor}; color: white; border: none; padding: 10px 30px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; width: 100%;">Đóng</button>
        </div>
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
// MODULE: THÔNG BÁO (NOTIFICATIONS)
// ======================================================

// Đóng dropdown khi click ra ngoài màn hình
document.addEventListener('click', () => {
    const notifDropdown = document.getElementById('notif-dropdown');
    if (notifDropdown) notifDropdown.style.display = 'none';
});

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
            const bgClass = isUnread ? 'background-color: #f0fdf4;' : 'background-color: #ffffff;'; 
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
// MODULE: TRANG CÁ NHÂN NHÂN VIÊN
// ======================================================

function renderStaffProfile() {
    const user = JSON.parse(sessionStorage.getItem('dn_football_user'));
    if (!user) return;

    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const profileLink = Array.from(document.querySelectorAll('.sidebar-nav a')).find(a => a.textContent.includes('TRANG CÁ NHÂN'));
    if (profileLink) profileLink.classList.add('active');

    const isMissingBank = !user.TenNganHang || !user.STKNganHang || !user.TenTaiKhoan;
    const bankStr = !isMissingBank
        ? `${user.TenNganHang} - ${user.STKNganHang} (${user.TenTaiKhoan})`
        : '<span style="color: #d97706; font-weight: 600;"><i class="fa-solid fa-circle-exclamation"></i> Chưa cập nhật đầy đủ</span>';

    const bankWarningBanner = isMissingBank ? `
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-left: 5px solid #f59e0b; border-radius: 12px; padding: 16px 20px; margin-bottom: 22px; display: flex; justify-content: space-between; align-items: center; gap: 15px; flex-wrap: wrap; box-shadow: 0 2px 8px rgba(245, 158, 11, 0.1);">
            <div style="display: flex; align-items: center; gap: 14px;">
                <div style="width: 42px; height: 42px; border-radius: 50%; background: #fef3c7; color: #d97706; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0;">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                </div>
                <div>
                    <div style="font-weight: 700; color: #92400e; font-size: 0.98rem; margin-bottom: 2px;">Chưa cập nhật đầy đủ thông tin tài khoản ngân hàng!</div>
                    <div style="color: #b45309; font-size: 0.86rem;">Vui lòng bổ sung Tên ngân hàng, Số tài khoản và Tên chủ tài khoản để Quản lý chuyển khoản lương hàng tháng cho bạn.</div>
                </div>
            </div>
            <button class="btn-primary" style="background: #f59e0b; border-color: #f59e0b; color: #fff; padding: 8px 16px; font-size: 0.86rem; white-space: nowrap;" onclick="openProfileModal()">
                <i class="fa-solid fa-pen-to-square"></i> Bổ sung ngay
            </button>
        </div>
    ` : '';

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header staff-hero-header">
            <div>
                <div class="staff-hero-badge"><i class="fa-solid fa-id-badge"></i> Hồ sơ nhân sự</div>
                <h1 class="page-title">Trang cá nhân</h1>
                <p class="text-muted">Quản lý thông tin liên hệ và tài khoản ngân hàng nhận lương của bạn</p>
            </div>
            <div style="background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 8px 16px; border-radius: 10px; font-size: 0.88rem; font-weight: 700; font-family: monospace; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                <i class="fa-solid fa-fingerprint" style="color: var(--primary); margin-right: 6px;"></i>Mã NV: #${user.MaNguoiDung || user.ID}
            </div>
        </div>

        ${bankWarningBanner}
        
        <div class="profile-card" style="border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.03);">
            <div class="profile-avatar-large" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: #fff; box-shadow: 0 4px 10px rgba(16, 185, 129, 0.25);"><i class="fa-solid fa-user-tie"></i></div>
            <div>
                <h3 style="margin-bottom: 6px; font-size: 1.25rem; color: #0f172a;">${user.HoTen || 'Chưa cập nhật'}</h3>
                <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 700; font-size: 0.82rem; color: #0369a1; background: #e0f2fe; border: 1px solid #bae6fd; padding: 4px 12px; border-radius: 999px;">
                    <i class="fa-solid fa-user-gear"></i> Nhân viên cơ sở
                </span>
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
                <div class="detail-item">
                    <label>Tài khoản ngân hàng nhận lương</label>
                    <div>${bankStr}</div>
                </div>
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
    setTimeout(() => alertBox.style.display = 'none', 2000);
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

function closeProfileModal() { document.getElementById('profile-modal').style.display = 'none'; }

['prof-hoten', 'prof-sdt', 'prof-email', 'prof-vneid', 'prof-bank-name', 'prof-bank-stk', 'prof-bank-owner'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
        updateCustomerBankWarningUI();
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

async function saveStaffProfile() {
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
            showProfileAlert(data.message || 'Lỗi cập nhật!', false);
            btnSave.disabled = false; btnSave.textContent = 'Lưu thay đổi';
            return;
        }

        sessionStorage.setItem('dn_football_user', JSON.stringify(data.user));
        document.getElementById('nhanvien-name').textContent = data.user.HoTen; 
        showProfileAlert('Thành công!', true);

        setTimeout(() => {
            closeProfileModal();
            renderStaffProfile(); 
            btnSave.textContent = 'Lưu thay đổi';
        }, 1500);

    } catch (error) {
        showProfileAlert('Lỗi mạng!', false);
        btnSave.disabled = false; btnSave.textContent = 'Lưu thay đổi';
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
// MODULE: MÀN HÌNH THU NGÂN
// ======================================================
async function renderManHinhThuNgan() {
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    if (!currentUser || currentUser.VaiTro !== 'NhanVien') return;
    
    staffDashboardFilterTime = 'hom_nay';

    // Tự động lấy ID Cụm sân của chính nhân viên này
    const cumSanId = currentUser.ID_CumSan;

    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const navLink = Array.from(document.querySelectorAll('.sidebar-nav a')).find(a => a.textContent.includes('MÀN HÌNH THU NGÂN'));
    if (navLink) navLink.classList.add('active');

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `<div style="text-align:center; padding: 50px;"><i class="fa-solid fa-spinner fa-spin text-primary" style="font-size: 2rem;"></i><br><br>Đang tải dữ liệu quầy thu ngân...</div>`;

    try {
        // 1. Lấy thông tin cơ sở + đánh giá cơ sở song song
        const [response, ratingRes] = await Promise.all([
            fetch(`${API_BASE_URL}/cum-san/${cumSanId}`),
            fetch(`${API_BASE_URL}/danh-gia?id_cum_san=${cumSanId}`)
        ]);
        const res = await response.json();
        const ratingData = await ratingRes.json();
        
        if (!res.success) {
            contentArea.innerHTML = `<div style="text-align:center; color:red; padding: 20px;">Lỗi: Không tìm thấy dữ liệu cơ sở của bạn!</div>`;
            return;
        }

        const cs = res.data;
        window.currentClusterNameStaff = cs.TenCumSan;

        // 2. Lấy danh sách các sân con thuộc cơ sở này
        const sbResponse = await fetch(`${API_BASE_URL}/san-bong?cum_san_id=${cumSanId}`);
        const sbRes = await sbResponse.json();
        const sanBongs = sbRes.data || [];
       
        // 3. Tạo Giao diện chọn sân dạng Card đẹp mắt
        let sanBongCards = '';
        if (sanBongs.length > 0) {
            sanBongs.forEach(sb => {
                let tenLoai = sb.loaiSan?.TenLoaiSan || sb.loai_san?.TenLoaiSan || 'Chưa rõ';
                let iconClass = 'fa-futbol';
                let colorTheme = '#10b981'; 
                let bgTheme = '#ecfdf5';
                
                if (tenLoai.toLowerCase().includes('5')) {
                    colorTheme = '#0284c7'; 
                    bgTheme = '#f0f9ff';
                } else if (tenLoai.toLowerCase().includes('7')) {
                    colorTheme = '#ea580c'; 
                    bgTheme = '#fff7ed';
                }

                sanBongCards += `
                    <div class="pitch-select-card" 
                        style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; cursor: pointer; transition: all 0.2s ease; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);"
                        onclick="loadStaffSchedule('${cumSanId}', '${sb.TenSan}', '${sb.ID}', '${sb.ID_LoaiSan}')"
                        onmouseover="this.style.borderColor='${colorTheme}'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)';"
                        onmouseout="this.style.borderColor='#e2e8f0'; this.style.boxShadow='0 2px 4px rgba(0,0,0,0.02)';">
                        
                        <div style="width: 50px; height: 50px; border-radius: 50%; background: ${bgTheme}; color: ${colorTheme}; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
                            <i class="fa-solid ${iconClass}"></i>
                        </div>
                        <div style="font-weight: 700; color: #1e293b; font-size: 1.1rem; text-align: center;">${sb.TenSan}</div>
                        <div style="font-size: 0.85rem; color: ${colorTheme}; background: ${bgTheme}; padding: 4px 10px; border-radius: 20px; font-weight: 600;">
                            ${tenLoai}
                        </div>
                    </div>
                `;
            });
        }

        // 4. RENDER TOÀN BỘ GIAO DIỆN
        const countStarStaff = (ratingData && ratingData.success) ? Number(ratingData.tong_so || 0) : Number(cs.danh_gias_count || 0);
        const rawAvgStaff = (ratingData && ratingData.success) ? Number(ratingData.trung_binh || 0) : Number(cs.danh_gias_avg_so_sao || 0);
        const avgStarStaff = countStarStaff > 0 ? rawAvgStaff.toFixed(1) : '0.0';

        const gioMo = cs.GioMoCua ? cs.GioMoCua.substring(0, 5) : '06:00';
        const gioDong = cs.GioDongCua ? cs.GioDongCua.substring(0, 5) : '22:00';

        contentArea.innerHTML = `
            <div class="page-header staff-hero-header">
                <div>
                    <div class="staff-hero-badge"><i class="fa-solid fa-cash-register"></i> Quầy Thu Ngân Trực Tuyến</div>
                    <h1 class="page-title">${cs.TenCumSan}</h1>
                    <p class="text-muted" style="display: flex; align-items: center; flex-wrap: wrap; gap: 14px; margin-top: 4px !important;">
                        <span><i class="fa-solid fa-location-dot" style="color: var(--primary); margin-right: 5px;"></i>${cs.DiaChi || 'Đà Nẵng'}</span>
                        <span style="color: #cbd5e1;">|</span>
                        <span><i class="fa-regular fa-clock" style="color: var(--primary); margin-right: 5px;"></i>Giờ mở cửa: <strong style="color: #0f172a;">${gioMo} - ${gioDong}</strong></span>
                    </p>
                </div>
                <button type="button" onclick="openStaffClusterReviewsModal('${cumSanId}', '${cs.TenCumSan.replace(/'/g, "\\'")}')" style="background: #fffbeb; border: 1.5px solid #fcd34d; color: #b45309; padding: 10px 18px; border-radius: 12px; font-weight: 700; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 2px 8px rgba(245, 158, 11, 0.14); transition: 0.2s;" onmouseover="this.style.background='#fef3c7'" onmouseout="this.style.background='#fffbeb'">
                    <i class="fa-solid fa-star" style="color: #f59e0b; font-size: 1.05rem;"></i>
                    <span>Đánh giá cơ sở: <strong>${avgStarStaff}</strong> (${countStarStaff} đánh giá)</span>
                </button>
            </div>

            <!-- KHU VỰC THỐNG KÊ NHANH TRONG NGÀY -->
            <div class="stat-grid" style="margin-bottom: 24px;">
                <div class="staff-stat-card" style="border-left: 4px solid #3b82f6;">
                    <div>
                        <div class="stat-title" style="color: #64748b; font-weight: 600; font-size: 0.84rem; margin-bottom: 6px;">Lịch đá hôm nay</div>
                        <div id="staff-stat-sotran" class="stat-value" style="color: #0f172a; font-size: 1.65rem; font-weight: 800;">...</div>
                    </div>
                    <div class="staff-stat-icon" style="background: #eff6ff; color: #2563eb;"><i class="fa-solid fa-calendar-day"></i></div>
                </div>
                <div class="staff-stat-card" style="border-left: 4px solid #f59e0b;">
                    <div>
                        <div class="stat-title" style="color: #64748b; font-weight: 600; font-size: 0.84rem; margin-bottom: 6px;">Chờ nhận sân (Check-in)</div>
                        <div id="staff-stat-chonhan" class="stat-value" style="color: #d97706; font-size: 1.65rem; font-weight: 800;">...</div>
                    </div>
                    <div class="staff-stat-icon" style="background: #fffbeb; color: #d97706;"><i class="fa-solid fa-hourglass-half"></i></div>
                </div>
                <div class="staff-stat-card" style="border-left: 4px solid #10b981;">
                    <div>
                        <div class="stat-title" style="color: #64748b; font-weight: 600; font-size: 0.84rem; margin-bottom: 6px;">Đã hoàn thành (Ra về)</div>
                        <div id="staff-stat-hoanthanh" class="stat-value" style="color: #047857; font-size: 1.65rem; font-weight: 800;">...</div>
                    </div>
                    <div class="staff-stat-icon" style="background: #ecfdf5; color: #059669;"><i class="fa-solid fa-circle-check"></i></div>
                </div>
                <div class="staff-stat-card" style="border-left: 4px solid #8b5cf6;">
                    <div>
                        <div class="stat-title" style="color: #64748b; font-weight: 600; font-size: 0.84rem; margin-bottom: 6px;">Doanh thu hôm nay</div>
                        <div id="staff-stat-doanhthu" class="stat-value" style="color: #6d28d9; font-size: 1.55rem; font-weight: 800;">...</div>
                    </div>
                    <div class="staff-stat-icon" style="background: #f5f3ff; color: #7c3aed;"><i class="fa-solid fa-sack-dollar"></i></div>
                </div>
            </div>

            <!-- BIỂU ĐỒ DOANH THU & CHI PHÍ -->
            <div class="chart-layout" style="margin-bottom: 24px;">
                <div class="panel">
                    <div class="panel-header" style="display:flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 20px;">
                        <div>
                            <div style="font-size: 1.1rem; color: var(--text-dark); margin-bottom: 6px; font-weight: 700;">Biểu đồ doanh thu đặt sân</div>
                            <div style="display: flex; align-items: baseline; gap: 8px;">
                                <span id="staff-chart-total-amount" style="font-size: 1.5rem; font-weight: 800; color: #16A34A; letter-spacing: -0.5px;">Đang tải...</span>
                                <span style="font-size: 0.85rem; color: #64748b; background: #f8fafc; padding: 4px 10px; border-radius: 12px; border: 1px solid #e2e8f0;">
                                    <i class="fa-solid fa-circle-info" style="margin-right: 4px; color: #3b82f6;"></i>Doanh thu đặt sân tại cơ sở
                                </span>
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <select class="form-control" style="width: 170px; border-color: #cbd5e1; font-weight: 500;" onchange="staffDashboardFilterTime=this.value; updateStaffDashboardStats()">
                                <option value="hom_nay" selected>Hôm nay</option>
                                <option value="hom_truoc">Hôm qua</option>
                                <option value="7_ngay">7 ngày gần đây</option>
                                <option value="30_ngay">1 tháng gần đây</option>
                                <option value="nam">Năm nay</option>
                            </select>
                        </div>
                    </div>
                    <div style="padding: 15px 0;">
                        <canvas id="staffRevenueChart" height="100"></canvas>
                    </div>
                </div>
            </div>

            <!-- TIMELINE LỊCH TRÌNH GIẢI ĐẤU TẠI CƠ SỞ (DÀNH CHO NHÂN VIÊN) -->
            <div id="staff-tournament-timeline-wrapper" style="margin-bottom: 24px;"></div>
            
            <!-- KHU VỰC CHỌN SÂN -->
            <div class="panel" style="padding: 24px; border-top: 4px solid var(--primary);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; font-size: 1.2rem; color: #1e293b;"><i class="fa-solid fa-map-location-dot" style="margin-right: 8px; color: var(--primary);"></i>Chọn sân để xem lịch:</h3>
                    <span style="font-size: 0.9rem; color: var(--text-muted);">Tổng cộng: <strong>${sanBongs.length}</strong> sân hoạt động</span>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px;">
                    ${sanBongCards || '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 20px;">Cơ sở này chưa có sân con nào hoạt động.</div>'}
                </div>
            </div>
            
            <div id="staff-schedule-container" style="margin-top: 24px;"></div>
        `;
        
        if (sanBongs.length > 0) {
            loadStaffSchedule(cumSanId, sanBongs[0].TenSan, sanBongs[0].ID, sanBongs[0].ID_LoaiSan);
        }

        updateStaffDailyStats(cumSanId);
        updateStaffDashboardStats();

    } catch (error) {
        contentArea.innerHTML = `<div style="text-align:center; color:red; padding: 50px;">Lỗi tải dữ liệu cơ sở!</div>`;
    }
}

// ======================================================
// HÀM CẬP NHẬT 4 THẺ THỐNG KÊ NHANH CHO MÀN HÌNH THU NGÂN
// ======================================================
async function updateStaffDailyStats(cumSanId) {
    const todayStr = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10);
    let soTranHomNay = 0;
    let choNhanSan = 0; 
    let hoanThanh = 0;  

    try {
        const [dsResponse, tkResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/admin/dat-san`),
            fetch(`${API_BASE_URL}/admin/thong-ke?id_cum_san=${cumSanId}&time_filter=hom_nay`)
        ]);
        const dsRes = await dsResponse.json();
        const tkRes = await tkResponse.json();
        
        if (dsRes.success) {
            const datSanHnay = dsRes.data.filter(item => 
                item.NgayDa === todayStr && 
                item.san_bong && 
                String(item.san_bong.MaCumSan || item.san_bong.ID_CumSan) === String(cumSanId)
            );
            
            soTranHomNay = datSanHnay.filter(i => i.TrangThai === 'DaCoc').length + datSanHnay.filter(i => i.TrangThai === 'HoanThanh').length;
            choNhanSan = datSanHnay.filter(i => i.TrangThai === 'DaCoc').length;
            hoanThanh = datSanHnay.filter(i => i.TrangThai === 'HoanThanh').length;
            
            // Lấy doanh thu thực thu hôm nay từ API thống kê (đã tính Khuyến mãi + VAT 8% trên Hóa đơn)
            const tongDoanhThu = (tkRes && tkRes.success && tkRes.data)
                ? Number(tkRes.data.doanh_thu_hom_nay || 0)
                : 0;

            const elSoTran = document.getElementById('staff-stat-sotran');
            const elChoNhan = document.getElementById('staff-stat-chonhan');
            const elHoanThanh = document.getElementById('staff-stat-hoanthanh');
            const elDoanhThu = document.getElementById('staff-stat-doanhthu');

            if (elSoTran) elSoTran.innerHTML = `${soTranHomNay} <span style="font-size: 1rem; font-weight: 500; color: #64748b;">trận</span>`;
            if (elChoNhan) elChoNhan.innerHTML = `${choNhanSan} <span style="font-size: 1rem; font-weight: 500; color: #64748b;">khách</span>`;
            if (elHoanThanh) elHoanThanh.innerHTML = `${hoanThanh} <span style="font-size: 1rem; font-weight: 500; color: #64748b;">trận</span>`;
            if (elDoanhThu) elDoanhThu.innerHTML = `${tongDoanhThu.toLocaleString('vi-VN')}đ`;
        }
    } catch(e) { 
        console.log('Lỗi tính toán thống kê thu ngân:', e); 
    }
}

// ======================================================
// HÀM VẼ BIỂU ĐỒ DOANH THU NHÂN VIÊN
// ======================================================
async function updateStaffDashboardStats() {
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    if (!document.getElementById('staffRevenueChart')) return;

    try {
        const cumSanId = currentUser.MaCumSan || currentUser.ID_CumSan;
        const response = await fetch(`${API_BASE_URL}/admin/thong-ke?id_cum_san=${cumSanId}&time_filter=${staffDashboardFilterTime}`);
        const res = await response.json();

        if (!res.success) return;
        const data = res.data;

        const labels = data.chart.map(c => c.ngay);
        const revenueData = data.chart.map(c => c.doanh_thu);

        const totalRevenue = revenueData.reduce((sum, amount) => sum + Number(amount), 0);

        document.getElementById('staff-chart-total-amount').innerHTML = `
            Tổng thu: ${totalRevenue.toLocaleString('vi-VN')}đ
        `;

        const ctx = document.getElementById('staffRevenueChart').getContext('2d');
        if (staffChartInstance) {
            staffChartInstance.destroy();
        }

        const chartType = (staffDashboardFilterTime === 'hom_nay' || staffDashboardFilterTime === 'hom_truoc') ? 'bar' : 'line';

        staffChartInstance = new Chart(ctx, {
            type: chartType,
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Doanh thu đặt sân (VNĐ)',
                        data: revenueData,
                        borderColor: '#16A34A',
                        backgroundColor: 'rgba(22, 163, 74, 0.4)',
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

        if (typeof initAndRenderTournamentTimeline === 'function') {
            initAndRenderTournamentTimeline('staff-tournament-timeline-wrapper', data.tournaments_timeline || []);
        }

    } catch (e) { 
        console.error('Lỗi load biểu đồ nhân viên', e); 
    }
}

// Render Lưới Lịch cho một Sân cụ thể
let staffScheduleStartDate = null;

window.changeStaffScheduleStartDate = function(newStartYmd) {
    staffScheduleStartDate = newStartYmd || null;
    loadStaffSchedule(currentCumSanId, window.currentPitchNameStaff, currentPitchId, currentLoaiSanId, staffScheduleStartDate);
};

window.shiftStaffScheduleDays = function(offsetDays) {
    const base = staffScheduleStartDate ? new Date(staffScheduleStartDate + 'T00:00:00') : new Date();
    base.setDate(base.getDate() + offsetDays);
    const pad = n => n < 10 ? '0' + n : n;
    const nextYmd = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
    changeStaffScheduleStartDate(nextYmd);
};

// Render Lưới Lịch cho một Sân cụ thể
async function loadStaffSchedule(clusterId, pitchName, pitchId, loaiSanId, customStartDate = null) {
    currentPitchId = pitchId;
    currentCumSanId = clusterId;
    currentLoaiSanId = loaiSanId;
    window.currentPitchNameStaff = pitchName;
    staffScheduleStartDate = customStartDate;
    
    const container = document.getElementById('staff-schedule-container');
    if(!container) return;
    container.innerHTML = `<div style="text-align:center; padding: 50px;"><i class="fa-solid fa-spinner fa-spin text-primary" style="font-size: 2rem;"></i><br><br>Đang tải lịch của ${pitchName}...</div>`;

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
            container.innerHTML = `<div class="panel" style="text-align:center; padding: 50px; color: red;">Lỗi: Quản lý chưa cấu hình Bảng giá cho loại sân này!</div>`;
            return;
        }

        let dateArray = [];
        const baseDate = customStartDate ? new Date(customStartDate + 'T00:00:00') : new Date();
        const pad = n => n < 10 ? '0' + n : n;
        const startInputVal = `${baseDate.getFullYear()}-${pad(baseDate.getMonth() + 1)}-${pad(baseDate.getDate())}`;

        for(let i = 0; i < 7; i++) {
            let d = new Date(baseDate); 
            d.setDate(baseDate.getDate() + i);
            const dow = d.getDay();
            dateArray.push({
                dayLabel: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dow],
                isWeekend: (dow === 0 || dow === 6),
                short: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
                dbFormat: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
                displayFormat: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
            });
        }

        let html = `
            <div class="panel">
                <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div><i class="fa-solid fa-calendar-days"></i> ${pitchName}</div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <button type="button" class="btn-outline-sm" onclick="shiftStaffScheduleDays(-7)"><i class="fa-solid fa-chevron-left"></i> 7 ngày trước</button>
                        <button type="button" class="btn-outline-sm" onclick="changeStaffScheduleStartDate(null)">Hôm nay</button>
                        <input type="date" class="form-control" style="width: 150px; height: 34px; font-weight: 600;" value="${startInputVal}" onchange="changeStaffScheduleStartDate(this.value)" title="Chọn ngày bắt đầu xem lịch">
                        <button type="button" class="btn-outline-sm" onclick="shiftStaffScheduleDays(7)">7 ngày tiếp <i class="fa-solid fa-chevron-right"></i></button>
                    </div>
                </div>
                <div style="width: 100%; max-height: 500px; overflow-y: auto; overflow-x: auto;"> 
                    <table class="schedule-table" style="margin: 0; border: none;">
                        <thead>
                            <tr>
                                <th style="width: 140px; min-width: 140px; position: sticky; top: 0; left: 0; z-index: 60;">Khung giờ</th>
                                <th style="width: 110px; min-width: 110px; position: sticky; top: 0; left: 140px; z-index: 59;">Giá tiền</th>
                                ${dateArray.map(d => `
                                    <th style="min-width: 110px; padding: 10px 8px; text-align: center; background: ${d.isWeekend ? '#fffbeb' : '#f8fafc'}; position: sticky; top: 0; z-index: 50;">
                                        <div style="font-size: 0.75rem; font-weight: 700; color: ${d.isWeekend ? '#d97706' : '#64748b'}; line-height: 1.2;">${d.dayLabel}</div>
                                        <div style="font-size: 0.9rem; font-weight: 800; color: #0f172a; margin-top: 2px;">${d.short}</div>
                                    </th>
                                `).join('')}
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
                
                const slotId = `${pitchId}-${date.dbFormat}-${kg.ID}`;
                const isSelected = selectedOfflineSlots.some(s => s.id === slotId);
                
                let statusClass = 'available', statusText = 'CÒN TRỐNG';
                
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
        container.innerHTML = html;

        updateOfflineCartUI();

    } catch (e) { 
        container.innerHTML = `<div style="text-align:center; color:red; padding: 50px;">Lỗi tải dữ liệu lịch!</div>`;
    }
}

// LOGIC GIỎ HÀNG VÀ ĐẶT SÂN
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
            pitchName: window.currentPitchNameStaff,
            clusterName: window.currentClusterNameStaff
        });
        element.classList.add('selected'); 
        element.innerText = 'ĐÃ CHỌN ✓';
    }
    updateOfflineCartUI();
};

function clearOfflineCart() {
    const slotsToRemove = [...selectedOfflineSlots];
    selectedOfflineSlots = [];
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
        closeOfflineModal();
    }
}

function ensureOfflineEmailFieldExistsStaff() {
    const nameInput = document.getElementById('off-name');
    if (nameInput) {
        const nameGroup = nameInput.closest('.form-group');
        const nameLabel = nameGroup ? nameGroup.querySelector('label') : null;
        if (nameLabel && !nameLabel.innerHTML.includes('*')) {
            nameLabel.innerHTML = 'Họ và tên khách hàng <span style="color: red;">*</span>';
        }
        nameInput.placeholder = 'Nhập họ và tên khách hàng...';
    }

    if (!document.getElementById('off-email')) {
        const anchorInput = document.getElementById('off-name') || document.getElementById('off-phone');
        const anchorGroup = anchorInput ? anchorInput.closest('.form-group') : null;
        if (anchorGroup && anchorGroup.parentNode) {
            const emailGroup = document.createElement('div');
            emailGroup.className = 'form-group';
            emailGroup.innerHTML = `
                <label>Email khách hàng <span style="color: red;">*</span></label>
                <input type="email" id="off-email" class="form-control" placeholder="Nhập email nhận vé QR & OTP...">
            `;
            anchorGroup.parentNode.insertBefore(emailGroup, anchorGroup.nextSibling);
        }
    }
}

function openOfflineCartModal() {
    document.getElementById('offline-booking-alert').style.display = 'none';
    ensureOfflineEmailFieldExistsStaff();
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

    document.getElementById('off-deposit').value = Math.round(totalAmount * 0.3);
    document.getElementById('offline-booking-modal').style.display = 'flex';
}

window.removeSlotFromCartModal = function(index) {
    const removedSlot = selectedOfflineSlots[index];
    if (!removedSlot) return;
    
    selectedOfflineSlots.splice(index, 1);
    const el = document.querySelector(`.schedule-table .slot[data-slot-id="${removedSlot.id}"]`);
    if (el) {
        el.classList.remove('selected');
        el.innerText = 'CÒN TRỐNG';
    }
    
    updateOfflineCartUI();
    if (selectedOfflineSlots.length > 0) openOfflineCartModal(); 
};

function closeOfflineModal() { document.getElementById('offline-booking-modal').style.display = 'none'; }

async function submitOfflineBooking() {
    ensureOfflineEmailFieldExistsStaff();
    const sdt = document.getElementById('off-phone')?.value.trim() || '';
    const ten = document.getElementById('off-name')?.value.trim() || '';
    const email = document.getElementById('off-email')?.value.trim() || '';
    const tienCoc = document.getElementById('off-deposit').value;

    const tongTienSan = Number(document.getElementById('off-total-price').value);

    const alertBox = document.getElementById('offline-booking-alert');
    alertBox.style.display = 'none';

    if (!ten || !sdt || !email) {
        alertBox.textContent = "Vui lòng nhập đầy đủ Họ và tên, Số điện thoại và Email của khách hàng!";
        alertBox.className = "modal-alert error";
        alertBox.style.display = "block";
        return;
    }

    if (!/^0[0-9]{9}$/.test(sdt)) {
        alertBox.textContent = "Số điện thoại không hợp lệ (phải gồm 10 chữ số, bắt đầu bằng số 0)!";
        alertBox.className = "modal-alert error";
        alertBox.style.display = "block";
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        alertBox.textContent = "Địa chỉ Email không đúng định dạng!";
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
            ho_ten: ten,
            sdt_khach: sdt,
            email_khach: email,
            tien_coc: tienCoc,
            slots: selectedOfflineSlots 
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
            document.getElementById('off-phone').value = ''; 
            document.getElementById('off-name').value = ''; 
            document.getElementById('off-email').value = '';    

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
            btn.disabled = false; btn.innerHTML = 'Chốt giữ sân';
            
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
        btn.disabled = false; btn.innerHTML = 'Chốt giữ sân';
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
// MODULE: NHÂN VIÊN - QUẢN LÝ ĐẶT SÂN (CHỐT SÂN)
// ======================================================
let staffDatSanData = [];
let staffDSPage = 1;
const staffDSItemsPerPage = 5; // Phân trang theo đơn vị 5 Hóa đơn / 1 trang (giữ trọn vẹn các trận trong cùng 1 hóa đơn)
let staffDSFilter = 'DaCoc';
// Mặc định hiển thị ngày hôm nay (tính theo múi giờ local)
let staffDSDate = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10);
let staffDSSearch = '';

function renderStaffQuanLyDatSan(defaultStatus = 'DaCoc', defaultDate = null) {
    staffDSPage = 1; 
    staffDSFilter = defaultStatus; 
    staffDSSearch = ''; 

    if (defaultDate !== null) {
        staffDSDate = defaultDate;
    } else {
        staffDSDate = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10);
    }

    // Active menu
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = Array.from(document.querySelectorAll('.sidebar-nav a')).find(a => a.textContent.includes('QUẢN LÝ ĐẶT SÂN'));
    if (menuLink) menuLink.classList.add('active');

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header staff-hero-header">
            <div>
                <div class="staff-hero-badge"><i class="fa-solid fa-clipboard-check"></i> Nghiệp vụ Sân Bóng</div>
                <h1 class="page-title">Quản lý Lịch Đặt Sân</h1>
                <p class="text-muted">Tra cứu hóa đơn, quét mã QR check-in và chốt trạng thái khách đến nhận sân tại cơ sở.</p>
            </div>
            <button type="button" class="btn-primary" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 10px; background: #0f172a; border-color: #0f172a; font-weight: 700; box-shadow: 0 4px 10px rgba(15, 23, 42, 0.15);" onclick="openStaffQrScannerModal()">
                <i class="fa-solid fa-qrcode" style="color: #4ade80;"></i> Quét QR Check-in nhanh
            </button>
        </div>

        <div id="staff-datsan-alert" class="modal-alert" style="display: none; margin-bottom: 16px;"></div>

        <div class="panel">
            <!-- Thanh công cụ Tìm kiếm & Bộ lọc (Đã bỏ nút Quét mã bị trùng và thiết kế lại cân đối) -->
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 20px; flex-wrap: wrap; background: #f8fafc; padding: 14px 16px; border-radius: 12px; border: 1px solid #e2e8f0;">
                <!-- Ô tìm kiếm từ khóa -->
                <div style="position: relative; flex: 1; min-width: 260px;">
                    <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #64748b; font-size: 0.9rem;"></i>
                    <input type="text" id="staff-ds-search-input" class="form-control" style="padding-left: 38px; height: 40px; background: #ffffff; border-color: #cbd5e1; border-radius: 9px; font-size: 0.9rem;" placeholder="Tìm Mã HĐ, Mã vé (#PT-..., #GD-...), SĐT, Tên khách..." oninput="handleStaffDSSearch(this.value)">
                </div>

                <!-- Cụm lọc Ngày đá & Trạng thái HĐ -->
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <div style="display: inline-flex; align-items: center; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 9px; padding: 0 6px 0 12px; height: 40px; gap: 6px;">
                        <i class="fa-regular fa-calendar" style="color: var(--primary); font-size: 0.88rem;"></i>
                        <span style="font-size: 0.82rem; font-weight: 600; color: #64748b; white-space: nowrap;">Ngày đá:</span>
                        <input type="date" id="staff-ds-date-input" style="border: none; outline: none; background: transparent; font-weight: 700; color: #0f172a; font-size: 0.88rem; cursor: pointer; height: 100%;" onchange="handleStaffDSDate(this.value)">
                        <button type="button" onclick="document.getElementById('staff-ds-date-input').value=''; handleStaffDSDate('');" title="Xem tất cả các ngày" style="background: #f1f5f9; border: none; color: #475569; padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: 0.15s;" onmouseover="this.style.background='#e2e8f0'; this.style.color='#0f172a'" onmouseout="this.style.background='#f1f5f9'; this.style.color='#475569'">
                            Tất cả
                        </button>
                    </div>

                    <div style="display: inline-flex; align-items: center; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 9px; padding: 0 10px 0 12px; height: 40px; gap: 6px;">
                        <i class="fa-solid fa-filter" style="color: var(--primary); font-size: 0.85rem;"></i>
                        <span style="font-size: 0.82rem; font-weight: 600; color: #64748b; white-space: nowrap;">Trạng thái HĐ:</span>
                        <select id="staff-ds-status-select" style="border: none; outline: none; background: transparent; font-weight: 700; color: #0f172a; font-size: 0.88rem; cursor: pointer; height: 100%; padding-right: 4px;" onchange="handleStaffDSFilter(this.value)" title="Lọc theo trạng thái Hóa đơn đặt sân">
                            <option value="All" ${defaultStatus === 'All' ? 'selected' : ''}>Tất cả trạng thái</option>
                            <option value="DaCoc" ${defaultStatus === 'DaCoc' ? 'selected' : ''}>Đã cọc</option>
                            <option value="HoanThanh" ${defaultStatus === 'HoanThanh' ? 'selected' : ''}>Hoàn thành</option>
                            <option value="DaHuy" ${defaultStatus === 'DaHuy' ? 'selected' : ''}>Đã hủy</option>
                            <option value="KhongDen" ${defaultStatus === 'KhongDen' ? 'selected' : ''}>Không đến</option>
                        </select>
                    </div>
                </div>
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
                    <tbody id="staff-datsan-table-body">
                        <tr><td colspan="7" class="text-center" style="text-align: center;">Đang tải dữ liệu...</td></tr>
                    </tbody>
                </table>
            </div>
            <div id="staff-ds-pagination" style="display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 15px; margin-bottom: 15px; padding-top: 15px; border-top: 1px solid var(--border);"></div>
        </div>
    `;

    document.getElementById('staff-ds-date-input').value = staffDSDate;
    loadStaffDanhSachDatSan();
}

function showStaffDSAlert(message, isSuccess) {
    const alertBox = document.getElementById('staff-datsan-alert');
    alertBox.textContent = message; 
    alertBox.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alertBox.style.display = 'block'; 
    setTimeout(() => alertBox.style.display = 'none', 3000);
}

function handleStaffDSSearch(val) { staffDSSearch = val.toLowerCase().trim(); staffDSPage = 1; applyStaffDSFiltersAndRender(); }
function handleStaffDSDate(val) { staffDSDate = val; staffDSPage = 1; applyStaffDSFiltersAndRender(); }
function handleStaffDSFilter(val) { staffDSFilter = val; staffDSPage = 1; applyStaffDSFiltersAndRender(); }

async function loadStaffDanhSachDatSan() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/dat-san`);
        const res = await response.json();
        if (res.success) { 
            staffDatSanData = res.data || []; 
            applyStaffDSFiltersAndRender(); 
        }
    } catch (error) { showStaffDSAlert('Lỗi kết nối máy chủ.', false); }
}

// Hàm tạo toàn bộ biến thể mã vé (mới & cũ) cho Nhân viên tìm kiếm
function getStaffBookingCodeVariants(item) {
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

// Hàm lấy Trạng thái của Hóa đơn đặt sân (Ưu tiên lấy từ HoaDonDatSan.TrangThai)
function getStaffInvoiceStatus(hoaDonObj, items = []) {
    if (hoaDonObj && hoaDonObj.TrangThai) {
        return hoaDonObj.TrangThai;
    }
    if (!items || items.length === 0) return 'DaCoc';
    if (items.some(i => i.TrangThai === 'DaCoc')) return 'DaCoc';
    if (items.some(i => i.TrangThai === 'HoanThanh')) return 'HoanThanh';
    if (items.every(i => i.TrangThai === 'DaHuy')) return 'DaHuy';
    if (items.every(i => i.TrangThai === 'KhongDen')) return 'KhongDen';
    return items[0].TrangThai || 'DaCoc';
}

function applyStaffDSFiltersAndRender() {
    // 1. Lọc theo CumSan của nhân viên đang đăng nhập
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    let clusterBookings = staffDatSanData;
    
    if (currentUser && (currentUser.MaCumSan || currentUser.ID_CumSan)) {
        const myCS = String(currentUser.MaCumSan || currentUser.ID_CumSan);
        clusterBookings = clusterBookings.filter(item => 
            item.san_bong && String(item.san_bong.MaCumSan || item.san_bong.ID_CumSan) === myCS
        );
    }

    const searchTerm = staffDSSearch.toLowerCase().trim().replace(/^#/, '');

    // 2. Gom nhóm toàn bộ các đặt sân thuộc cụm sân theo Hóa đơn (Nếu là Giải đấu thì đảm bảo gom chung toàn bộ các trận của giải đó vào 1 Hóa đơn)
    const invoiceMap = new Map();
    const tournamentKeyMap = new Map();

    clusterBookings.forEach(item => {
        const maGiai = item.MaGiaiDau || item.ID_GiaiDau || null;
        let key = item.MaHoaDonDatSan ? String(item.MaHoaDonDatSan) : ('LE_' + (item.MaDatSan || item.ID));

        if (maGiai) {
            if (tournamentKeyMap.has(String(maGiai))) {
                key = tournamentKeyMap.get(String(maGiai));
            } else {
                tournamentKeyMap.set(String(maGiai), key);
            }
        }

        if (!invoiceMap.has(key)) {
            invoiceMap.set(key, {
                key: key,
                maHoaDon: item.MaHoaDonDatSan || null,
                hoaDonObj: item.hoa_don_dat_san || item.hoaDonDatSan || null,
                items: []
            });
        }
        const group = invoiceMap.get(key);
        if (!group.maHoaDon && item.MaHoaDonDatSan) {
            group.maHoaDon = item.MaHoaDonDatSan;
        }
        if (!group.hoaDonObj && (item.hoa_don_dat_san || item.hoaDonDatSan)) {
            group.hoaDonObj = item.hoa_don_dat_san || item.hoaDonDatSan;
        }
        group.items.push(item);
    });

    // Sắp xếp các trận bên trong mỗi hóa đơn theo Ngày đá và Giờ bắt đầu tăng dần
    const allInvoiceGroups = Array.from(invoiceMap.values()).map(group => {
        group.items.sort((a, b) => {
            const dateCmp = String(a.NgayDa || '').localeCompare(String(b.NgayDa || ''));
            if (dateCmp !== 0) return dateCmp;
            const timeA = a.khung_gio?.GioBatDau || '';
            const timeB = b.khung_gio?.GioBatDau || '';
            return timeA.localeCompare(timeB);
        });
        group.trangThaiHoaDon = getStaffInvoiceStatus(group.hoaDonObj, group.items);
        return group;
    });

    // 3. Lọc theo cấp độ HÓA ĐƠN ĐẶT SÂN
    const filteredGroups = allInvoiceGroups.filter(group => {
        // 3.1. Lọc theo Trạng thái của Hóa đơn đặt sân
        const matchStatus = (staffDSFilter === 'All' || group.trangThaiHoaDon === staffDSFilter);

        // 3.2. Lọc theo Ngày đá (Nếu hóa đơn có ít nhất 1 trận đá trong ngày đang chọn -> Hiển thị trọn vẹn hóa đơn đó)
        const matchDate = staffDSDate
            ? group.items.some(item => item.NgayDa === staffDSDate)
            : true;

        // 3.3. Lọc theo Từ khóa tìm kiếm
        const maHDLower = String(group.maHoaDon || '').toLowerCase();
        const matchInvoiceCode = searchTerm !== '' && (maHDLower.includes(searchTerm) || (`#${maHDLower}`).includes(searchTerm));

        const matchAnyItemSearch = group.items.some(item => {
            const codeVariants = getStaffBookingCodeVariants(item);
            const matchCode = searchTerm !== '' && codeVariants.some(v => v.includes(searchTerm));

            const sdt = item.ID_NguoiDung ? (item.nguoi_dung?.SoDienThoai?.toLowerCase() || '') : ((item.SDTNguoiDat || item.SDTKhachVangLai || '').toLowerCase());
            const tenKhach = item.ID_NguoiDung ? (item.nguoi_dung?.HoTen?.toLowerCase() || '') : ((item.TenNguoiDat || item.TenKhachVangLai || '').toLowerCase());
            const tenSan = item.san_bong ? item.san_bong.TenSan.toLowerCase() : '';
            const tenGiai = (item.ID_GiaiDau !== null && item.giai_dau) ? item.giai_dau.TenGiaiDau.toLowerCase() : '';

            return matchCode
                || sdt.includes(searchTerm)
                || tenKhach.includes(searchTerm)
                || tenSan.includes(searchTerm)
                || tenGiai.includes(searchTerm);
        });

        const matchSearch = searchTerm === '' || matchInvoiceCode || matchAnyItemSearch;

        return matchStatus && matchDate && matchSearch;
    });

    // 4. Phân trang theo số lượng HÓA ĐƠN (Không cắt lẻ các trận trong cùng 1 hóa đơn)
    const totalPages = Math.ceil(filteredGroups.length / staffDSItemsPerPage) || 1;
    if (staffDSPage > totalPages) staffDSPage = totalPages;
    const startIdx = (staffDSPage - 1) * staffDSItemsPerPage;
    
    renderStaffDSTable(filteredGroups.slice(startIdx, startIdx + staffDSItemsPerPage));
    renderStaffDSPagination(totalPages);
}

function renderStaffDSTable(invoiceGroups) {
    const tbody = document.getElementById('staff-datsan-table-body');
    if (!invoiceGroups || invoiceGroups.length === 0) {
        return tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="text-align: center; padding: 40px;">Không có dữ liệu.</td></tr>`;
    }

    let html = '';

    invoiceGroups.forEach(group => {
        const first = group.items[0];
        const tenKhach = first.ID_NguoiDung ? (first.nguoi_dung?.HoTen || 'N/A') : (first.TenNguoiDat || first.TenKhachVangLai || 'N/A');
        const sdtKhach = first.ID_NguoiDung ? (first.nguoi_dung?.SoDienThoai || '') : (first.SDTNguoiDat || first.SDTKhachVangLai || '');
        const emailKhach = first.EmailNguoiDat || first.EmailKhachVangLai || '';
        const isMember = Boolean(first.ID_NguoiDung);

        const allMatchesInInvoice = group.items;
        const activeDaCocCount = allMatchesInInvoice.filter(d => d.TrangThai === 'DaCoc').length;
        const hdObj = group.hoaDonObj;
        const tongHD = hdObj ? Number(hdObj.TongTien ?? hdObj.TongTienSan) : allMatchesInInvoice.reduce((s, d) => s + Number(d.TongTien), 0);
        const cocHD = (hdObj && hdObj.TienDaCoc !== undefined) ? Number(hdObj.TienDaCoc) : allMatchesInInvoice.reduce((s, d) => s + Number(d.TienCoc), 0);
        const trangThaiHD = group.trangThaiHoaDon || getStaffInvoiceStatus(hdObj, allMatchesInInvoice);
        const conPhaiThuHD = (trangThaiHD === 'DaHuy') ? 0 : Math.max(0, tongHD - cocHD);

        // Badge trạng thái của Hóa đơn đặt sân
        let hdBadgeColor = '#6b7280', hdBadgeBg = '#f3f4f6', hdViStatus = trangThaiHD;
        if (trangThaiHD === 'DaCoc') { hdBadgeColor = '#b45309'; hdBadgeBg = '#fef3c7'; hdViStatus = 'Đã cọc'; }
        else if (trangThaiHD === 'DaHuy') { hdBadgeColor = '#b91c1c'; hdBadgeBg = '#fee2e2'; hdViStatus = 'Đã hủy'; }
        else if (trangThaiHD === 'HoanThanh') { hdBadgeColor = '#047857'; hdBadgeBg = '#d1fae5'; hdViStatus = 'Hoàn thành'; }
        else if (trangThaiHD === 'KhongDen') { hdBadgeColor = '#475569'; hdBadgeBg = '#e2e8f0'; hdViStatus = 'Không đến'; }

        const hdStatusBadgeHtml = `<span style="padding: 4px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 700; background: ${hdBadgeBg}; color: ${hdBadgeColor}; border: 1px solid rgba(0,0,0,0.06); white-space: nowrap;">${hdViStatus}</span>`;

        if (group.maHoaDon) {
            html += `
                <tr style="background: #f0fdf4; border-top: 2px solid #86efac; border-bottom: 1px solid #bbf7d0;">
                    <td colspan="7" style="padding: 10px 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                <span style="background: #0b5d3b; color: #fff; font-family: monospace; font-weight: 700; padding: 4px 10px; border-radius: 6px; font-size: 0.88rem;">
                                    <i class="fa-solid fa-file-invoice-dollar"></i> Hóa đơn #${group.maHoaDon}
                                </span>
                                ${hdStatusBadgeHtml}
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
                                <button type="button" class="btn-outline-sm" style="background: #fef2f2; color: #dc2626; border-color: #fca5a5; padding: 5px 11px; font-size: 0.8rem; font-weight: 700;" onclick="openAdminCancelInvoiceModal('${group.maHoaDon}', ${activeDaCocCount}, ${isMember}, '${tenKhach.replace(/'/g, "\\'")}', '${emailKhach}', ${cocHD})">
                                    <i class="fa-solid fa-ban"></i> Hủy cả hóa đơn (${activeDaCocCount} trận)
                                </button>` : ''}
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }

        // Vẽ toàn bộ các dòng trận đấu thuộc hóa đơn này ngay bên dưới
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
                ? `<span style="font-size: 0.75rem; background: #e0e7ff; color: #4338ca; padding: 2px 8px; border-radius: 4px; white-space: nowrap; display: inline-block;"><i class="fa-solid fa-trophy"></i> Giải đấu</span>` 
                : `<span style="font-size: 0.75rem; background: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 4px; white-space: nowrap; display: inline-block;">Phong trào</span>`;
            const htmlTenGiai = isGiaiDau ? `<div style="font-size: 0.85rem; color: #4338ca; margin-top: 4px; font-weight: 600; white-space: nowrap;"><i class="fa-solid fa-medal"></i> ${tenGiaiDau}</div>` : '';

            const d = new Date(item.NgayDa);
            const dateStr = `<span style="white-space: nowrap; display: inline-block;">${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear()}</span>`;

            const timeStr = item.khung_gio
                ? `<span style="white-space: nowrap; display: inline-block;">${item.khung_gio.GioBatDau.substring(0,5)} - ${item.khung_gio.GioKetThuc.substring(0,5)}</span>`
                : '';

            let actionHtml = '';
            if (item.TrangThai === 'DaCoc') {
                actionHtml = `
                    <div style="display: inline-flex; gap: 6px; align-items: center;">
                        <button type="button" class="btn-outline-sm" style="padding: 6px 10px; font-size: 0.82rem; white-space: nowrap; color: #2563eb; border-color: #bfdbfe; background: #eff6ff; font-weight: 700;" onclick="event.stopPropagation(); openAdminRescheduleModal('${item.ID}')">
                            <i class="fa-solid fa-calendar-day"></i> Dời lịch
                        </button>
                        <button type="button" class="btn-primary" style="padding: 6px 12px; font-size: 0.85rem; white-space: nowrap;" onclick="event.stopPropagation(); openStaffDSConfirmModal('${item.ID}')">Chốt sân</button>
                    </div>
                `;
            } else {
                actionHtml = `<span style="color: var(--text-muted); font-size: 0.85rem; white-space: nowrap;">Đã xử lý</span>`;
            }

            const tenKhachHienThi = item.ID_NguoiDung ? (item.nguoi_dung?.HoTen || 'N/A') : (item.TenNguoiDat || item.TenKhachVangLai || 'N/A');
            const sdtKhachHienThi = item.ID_NguoiDung ? (item.nguoi_dung?.SoDienThoai || '') : (item.SDTNguoiDat || item.SDTKhachVangLai || '');

            html += `<tr onclick="openBookingDetailModalStaff('${item.ID}')" style="cursor: pointer; transition: background-color 0.15s;" onmouseover="this.style.backgroundColor='#f8fafc'" onmouseout="this.style.backgroundColor=''">
                <td style="text-align: center; padding-left: 20px;">
                    <span style="padding: 5px 10px; border-radius: 8px; font-weight: 700; font-family: monospace; font-size: 0.9rem; display: inline-block; white-space: nowrap; ${badgeClassVe}">
                        ${maVeDisplay}
                    </span>
                </td>
                <td><strong>${tenKhachHienThi}</strong><br><span style="font-size: 0.85rem; color: var(--text-muted);">${sdtKhachHienThi}</span></td>
                <td style="white-space: nowrap;">
                    <div style="display: flex; align-items: center; gap: 6px; white-space: nowrap; margin-bottom: 3px;">
                        <strong style="color: var(--text-dark);">${item.san_bong ? item.san_bong.TenSan : 'N/A'}</strong>
                        ${tagLoai}
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-muted); white-space: nowrap;"><i class="fa-solid fa-location-dot"></i> ${item.san_bong?.cum_san?.TenCumSan || (window.currentClusterNameStaff || '')}</div>
                    ${htmlTenGiai}
                </td>
                <td><span style="font-size: 0.9rem;">Ngày: ${dateStr}</span><br><strong style="color: var(--primary);">Giờ: ${timeStr}</strong></td>
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

// MODAL XEM CHI TIẾT ĐẶT SÂN (DÀNH CHO NHÂN VIÊN)
window.openBookingDetailModalStaff = function(id) {
    const item = staffDatSanData.find(b => b.ID == id);
    if (!item) return;

    let modal = document.getElementById('staff-booking-detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'staff-booking-detail-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 9999; align-items: center; justify-content: center;';
        modal.onclick = function(e) {
            if (e.target === modal) closeBookingDetailModalStaff();
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
    const tenKhach = isMember ? (item.nguoi_dung?.HoTen || 'N/A') : (item.TenNguoiDat || item.TenKhachVangLai || 'N/A');
    const sdtKhach = isMember ? (item.nguoi_dung?.SoDienThoai || 'N/A') : (item.SDTNguoiDat || item.SDTKhachVangLai || 'N/A');
    const emailKhach = isMember ? (item.nguoi_dung?.Email || '') : (item.EmailNguoiDat || item.EmailKhachVangLai || '');
    const loaiKhachTag = isMember 
        ? `<span style="font-size: 0.72rem; background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; padding: 2px 8px; border-radius: 4px; font-weight: 600;">Thành viên</span>`
        : `<span style="font-size: 0.72rem; background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 4px; font-weight: 600;">Khách vãng lai</span>`;

    // 3. Thông tin sân & Ngày giờ
    const tenSan = item.san_bong ? item.san_bong.TenSan : 'N/A';
    const tenCumSan = item.san_bong?.cum_san ? item.san_bong.cum_san.TenCumSan : (window.currentClusterNameStaff || 'Cơ sở hiện tại');
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
                <button type="button" onclick="closeBookingDetailModalStaff()" style="background: none; border: none; color: #64748b; font-size: 1.15rem; cursor: pointer; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 6px;" onmouseover="this.style.background='#e2e8f0'; this.style.color='#0f172a'" onmouseout="this.style.background='none'; this.style.color='#64748b'">
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
                        ${emailKhach ? `<span><i class="fa-solid fa-envelope" style="color: #94a3b8; margin-right: 4px;"></i>${emailKhach}</span>` : ''}
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

window.closeBookingDetailModalStaff = function() {
    const modal = document.getElementById('staff-booking-detail-modal');
    if (modal) modal.style.display = 'none';
};

function renderStaffDSPagination(totalPages) {
    const div = document.getElementById('staff-ds-pagination');
    if (totalPages <= 1) return div.innerHTML = '';
    
    let html = `<button class="btn-outline-sm" ${staffDSPage === 1 ? 'disabled style="opacity:0.5;"' : ''} onclick="staffDSPage--; applyStaffDSFiltersAndRender()"><i class="fa-solid fa-chevron-left"></i></button>`;
    
    const getPages = (current, total) => {
        if (total <= 6) return Array.from({length: total}, (_, i) => i + 1);
        if (current <= 3) return [1, 2, 3, 4, '...', total];
        if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
        return [1, '...', current - 1, current, current + 1, '...', total];
    };

    getPages(staffDSPage, totalPages).forEach(i => {
        if (i === '...') {
            html += `<span style="padding: 6px 10px; color: var(--text-muted); font-weight: bold;">...</span>`;
        } else {
            html += `<button class="${i === staffDSPage ? 'btn-primary' : 'btn-outline-sm'}" style="padding: 6px 14px;" onclick="staffDSPage=${i}; applyStaffDSFiltersAndRender()">${i}</button>`;
        }
    });

    html += `<button class="btn-outline-sm" ${staffDSPage === totalPages ? 'disabled style="opacity:0.5;"' : ''} onclick="staffDSPage++; applyStaffDSFiltersAndRender()"><i class="fa-solid fa-chevron-right"></i></button>`;
    div.innerHTML = html;
}

// ----------------------------------------------------
// TẠO MODAL CHỐT SÂN RIÊNG CHO STAFF (KHÔNG CÓ NÚT HỦY)
// ----------------------------------------------------
let pendingStaffDSId = null;

function openStaffDSConfirmModal(id) {
    pendingStaffDSId = id;
    let modal = document.getElementById('staff-ds-confirm-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'staff-ds-confirm-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 9999; align-items: center; justify-content: center;';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 720px; width: 95%; text-align: center; padding: 28px 24px; border-radius: 16px;">
            <h3 style="margin-bottom: 8px; font-size: 1.35rem; font-weight: 800; color: #0f172a;">Chốt trạng thái sân</h3>
            <p style="color: #64748b; margin-bottom: 24px; line-height: 1.5; font-size: 0.94rem;">Vui lòng chọn thao tác xử lý cho lịch đặt sân này.</p>
            <div style="display: flex; justify-content: center; align-items: center; gap: 10px; flex-wrap: wrap;">
                <button type="button" onclick="closeStaffDSConfirmModal()" style="padding: 10px 16px; border-radius: 10px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-weight: 600; font-size: 0.9rem; cursor: pointer;">
                    Đóng
                </button>
                <button type="button" onclick="closeStaffDSConfirmModal(); openAdminRescheduleModal('${id}')" style="padding: 10px 16px; border-radius: 10px; border: 1px solid #bfdbfe; background: #eff6ff; color: #2563eb; font-weight: 700; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-calendar-day"></i> Dời lịch
                </button>
                <button type="button" onclick="openStaffCancelConfirmModal()" style="padding: 10px 16px; border-radius: 10px; border: 1px solid #fecaca; background: #fef2f2; color: #ef4444; font-weight: 600; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-ban"></i> Hủy sân & Hoàn tiền
                </button>
                <button type="button" onclick="openConfirmStatusActionStaff('KhongDen')" style="padding: 10px 16px; border-radius: 10px; border: 1px solid #cbd5e1; background: #f8fafc; color: #475569; font-weight: 600; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-user-slash"></i> Không đến
                </button>
                <button type="button" onclick="openConfirmStatusActionStaff('HoanThanh')" style="padding: 10px 20px; border-radius: 10px; border: 1px solid #10b981; background: #10b981; color: #ffffff; font-weight: 700; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 10px rgba(16, 185, 129, 0.25);">
                    <i class="fa-solid fa-check"></i> Hoàn thành
                </button>
            </div>
        </div>`;
    modal.style.display = 'flex';
}

window.openConfirmStatusActionStaff = function(trangThai) {
    closeStaffDSConfirmModal();
    let modal = document.getElementById('staff-final-status-confirm-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'staff-final-status-confirm-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10020; align-items: center; justify-content: center;';
        document.body.appendChild(modal);
    }
    const isComplete = trangThai === 'HoanThanh';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 420px; width: 92%; text-align: center; padding: 26px 22px; border-radius: 16px;">
            <div style="font-size: 3rem; color: ${isComplete ? '#10b981' : '#f59e0b'}; margin-bottom: 10px;">
                <i class="fa-solid ${isComplete ? 'fa-circle-check' : 'fa-user-slash'}"></i>
            </div>
            <h3 style="margin-bottom: 8px; font-size: 1.25rem; font-weight: 800; color: #0f172a;">
                Xác nhận chốt "${isComplete ? 'Hoàn thành' : 'Không đến'}"?
            </h3>
            <p style="color: #64748b; font-size: 0.9rem; line-height: 1.5; margin-bottom: 20px;">
                ${isComplete
                    ? 'Xác nhận khách đã hoàn thành trận đấu và thanh toán đủ phần còn lại tại sân?'
                    : 'Xác nhận khách không đến nhận sân (vé sẽ chuyển sang Không đến và giữ lại tiền cọc)?'}
            </p>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button type="button" class="btn-outline" style="flex: 1; padding: 10px;" onclick="document.getElementById('staff-final-status-confirm-modal').style.display='none'">Hủy bỏ</button>
                <button type="button" class="btn-primary" style="flex: 1.2; padding: 10px; background: ${isComplete ? '#10b981' : '#ea580c'}; border-color: ${isComplete ? '#10b981' : '#ea580c'};" onclick="document.getElementById('staff-final-status-confirm-modal').style.display='none'; executeStaffCapNhatDatSan('${trangThai}');">
                    Đồng ý xác nhận
                </button>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
};

function closeStaffDSConfirmModal() { 
    const modal = document.getElementById('staff-ds-confirm-modal');
    if(modal) modal.style.display = 'none'; 
}

function openStaffCancelConfirmModal() {
    closeStaffDSConfirmModal(); // Đóng modal hiện tại
    
    const item = staffDatSanData.find(b => b.ID == pendingStaffDSId);
    if (!item) return;

    let modal = document.getElementById('staff-cancel-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'staff-cancel-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10000; align-items: center; justify-content: center;';
        modal.onclick = function(e) {
            if (e.target === modal) closeStaffCancelConfirmModal();
        };
        document.body.appendChild(modal);
    }
    
    const isMember = Boolean(item.ID_NguoiDung);

    if (isMember) {
        // LUỒNG 1: KHÁCH THÀNH VIÊN (Hoàn 100% tiền cọc về Ví)
        const kh = item.nguoi_dung || {};
        const tenKhach = kh.HoTen || 'N/A';
        const tienCocStr = Number(item.TienCoc || 0).toLocaleString('vi-VN') + 'đ';

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 460px; width: 92%; text-align: center; padding: 26px 24px; border-radius: 16px;">
                <div style="font-size: 3.2rem; color: #ef4444; margin-bottom: 10px;"><i class="fa-solid fa-triangle-exclamation"></i></div>
                <h3 style="margin-bottom: 10px; font-size: 1.3rem; font-weight: 800; color: #0f172a;">Xác nhận Hủy Sân</h3>
                <div id="staff-member-cancel-alert" class="modal-alert" style="display: none; margin: 0 0 12px 0; text-align: left;"></div>
                <p style="color: #64748b; margin-bottom: 26px; line-height: 1.6; font-size: 0.92rem;">
                    Khách hàng thành viên: <strong style="color: #0f172a;">${tenKhach}</strong>.<br>
                    Hệ thống sẽ <strong style="color: #0f172a;">HỦY LỊCH</strong> và tự động <strong style="color: #0f172a;">HOÀN TRẢ 100% TIỀN CỌC (${tienCocStr})</strong> vào ví khách hàng.
                </p>
                <div style="display: flex; justify-content: center; gap: 12px;">
                    <button type="button" onclick="closeStaffCancelConfirmModal()" style="flex: 1; padding: 10px 18px; border-radius: 10px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-weight: 600; font-size: 0.92rem; cursor: pointer;">
                        Hủy bỏ
                    </button>
                    <button type="button" id="btn-staff-confirm-member-cancel" onclick="confirmMemberCancelStaff()" style="flex: 1.3; padding: 10px 18px; border-radius: 10px; border: 1px solid #ef4444; background: #ef4444; color: #ffffff; font-weight: 700; font-size: 0.92rem; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px;">
                        Hủy & Hoàn tiền
                    </button>
                </div>
            </div>`;
    } else {
        // LUỒNG 2: KHÁCH VÃNG LAI & ĐẶT SÂN HỘ (Xác thực OTP qua Email)
        const tenGuest = item.TenNguoiDat || item.TenKhachVangLai || 'N/A';
        const sdtGuest = item.SDTNguoiDat || item.SDTKhachVangLai || '';
        const emailGuest = item.EmailNguoiDat || item.EmailKhachVangLai || 'Chưa có';

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 440px; width: 92%; padding: 24px; text-align: left; border-radius: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0;">
                    <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800; color: #0f172a;"><i class="fa-solid fa-user-check" style="color: #ef4444; margin-right: 6px;"></i> Hủy sân</h3>
                    <i class="fa-solid fa-xmark" style="cursor: pointer; color: #64748b; font-size: 1.15rem;" onclick="closeStaffCancelConfirmModal()"></i>
                </div>

                <div id="staff-guest-cancel-alert" class="modal-alert" style="display: none; margin: 0 0 12px 0;"></div>

                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; font-size: 0.88rem; line-height: 1.65;">
                    <div>Khách hàng: <strong style="color: #0f172a;">${tenGuest}</strong> (${sdtGuest})</div>
                    <div>Email nhận OTP: <strong style="color: #2563eb;">${emailGuest}</strong></div>
                    <div>Tiền cọc cần hoàn: <strong style="color: #ea580c;">${Number(item.TienCoc).toLocaleString('vi-VN')}đ</strong></div>
                </div>

                <div class="form-group" style="margin-bottom: 20px;">
                    <label style="font-size: 0.86rem; font-weight: 600; color: #1e293b; margin-bottom: 6px; display: block;">Mã xác thực OTP (gửi về Email khách) <span style="color: #ef4444;">*</span></label>
                    <div style="display: flex; gap: 10px; align-items: stretch;">
                        <input type="text" id="staff-guest-cancel-otp" class="form-control" placeholder="Nhập 6 số OTP..." maxlength="6" style="flex: 1; font-weight: 700; letter-spacing: 2px; text-align: center; border-radius: 10px;">
                        <button type="button" id="btn-staff-send-guest-otp" onclick="sendGuestCancelOtpStaff('${item.ID}')" style="width: auto; padding: 0 16px; border-radius: 10px; border: 1px solid #bfdbfe; background: #eff6ff; color: #2563eb; font-weight: 700; font-size: 0.86rem; white-space: nowrap; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                            <i class="fa-solid fa-paper-plane"></i> Gửi OTP
                        </button>
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button type="button" onclick="closeStaffCancelConfirmModal()" style="padding: 10px 20px; border-radius: 10px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-weight: 600; font-size: 0.9rem; cursor: pointer;">
                        Đóng
                    </button>
                    <button type="button" id="btn-staff-confirm-guest-cancel" onclick="confirmGuestCancelStaff()" style="padding: 10px 20px; border-radius: 10px; border: 1px solid #ef4444; background: #ef4444; color: #ffffff; font-weight: 700; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-check"></i> Xác nhận Hủy & Hoàn cọc
                    </button>
                </div>
            </div>`;
    }

    modal.style.display = 'flex';
}

async function confirmMemberCancelStaff() {
    const alertBox = document.getElementById('staff-member-cancel-alert');
    const btn = document.getElementById('btn-staff-confirm-member-cancel');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';

    const ok = await executeStaffCapNhatDatSan('DaHuy', null, alertBox);
    if (ok) {
        closeStaffCancelConfirmModal();
    } else {
        btn.disabled = false;
        btn.innerHTML = 'Hủy & Hoàn tiền';
    }
}

async function executeStaffCapNhatDatSan(trangThai, otp = null, customAlertBox = null) {
    if (!pendingStaffDSId) return false;
    closeStaffDSConfirmModal(); 

    try {
        const payload = { trang_thai: trangThai };
        if (otp) payload.otp = otp;

        const response = await fetch(`${API_BASE_URL}/admin/dat-san/${pendingStaffDSId}/chot`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
            showStaffDSAlert('Đã cập nhật trạng thái thành công!', true);
            loadStaffDanhSachDatSan();
            return true;
        } else {
            if (customAlertBox) {
                customAlertBox.innerHTML = (data.message || 'Lỗi xử lý.').replace(/\n/g, '<br>');
                customAlertBox.className = 'modal-alert error';
                customAlertBox.style.display = 'block';
            } else {
                showStaffDSAlert(data.message || 'Lỗi xử lý.', false);
            }
            return false;
        }
    } catch (e) {
        showStaffDSAlert('Lỗi kết nối máy chủ.', false);
        return false;
    }
}

function closeStaffCancelConfirmModal() {
    const modal = document.getElementById('staff-cancel-modal');
    if (modal) modal.style.display = 'none';
}

async function sendGuestCancelOtpStaff(id) {
    const btn = document.getElementById('btn-staff-send-guest-otp');
    const alertBox = document.getElementById('staff-guest-cancel-alert');
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

async function confirmGuestCancelStaff() {
    const otp = document.getElementById('staff-guest-cancel-otp')?.value.trim();
    const alertBox = document.getElementById('staff-guest-cancel-alert');
    if (!otp || otp.length !== 6) {
        alertBox.textContent = 'Vui lòng nhập đủ 6 chữ số OTP!';
        alertBox.className = 'modal-alert error';
        alertBox.style.display = 'block';
        return;
    }

    const btn = document.getElementById('btn-staff-confirm-guest-cancel');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';

    const ok = await executeStaffCapNhatDatSan('DaHuy', otp, alertBox);
    if (ok) {
        closeStaffCancelConfirmModal();
    } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Xác nhận Hủy & Hoàn cọc';
    }
}

// ======================================================
// QUÉT MÃ QR CHECK-IN VÉ ĐẶT SÂN (NHÂN VIÊN)
// ======================================================
let staffHtml5QrScanner = null;

function ensureHtml5QrcodeLoadedStaff() {
    return new Promise((resolve, reject) => {
        if (window.Html5Qrcode) return resolve();
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Không thể tải thư viện quét QR'));
        document.head.appendChild(script);
    });
}

window.openStaffQrScannerModal = async function() {
    let modal = document.getElementById('staff-qr-scanner-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'staff-qr-scanner-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10000; align-items: center; justify-content: center;';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 460px; width: 92%; padding: 0; border-radius: 14px; overflow: hidden; background: #fff;">
            <div style="padding: 16px 20px; background: #0f172a; color: #fff; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 1.05rem; font-weight: 700;"><i class="fa-solid fa-qrcode" style="color: #4ade80; margin-right: 8px;"></i>Quét mã QR Vé Đặt Sân</h3>
                <i class="fa-solid fa-xmark" style="cursor: pointer; font-size: 1.2rem; color: #94a3b8;" onclick="closeStaffQrScannerModal()"></i>
            </div>
            <div style="padding: 20px; text-align: center;">
                <div id="staff-qr-reader" style="width: 100%; min-height: 250px; border-radius: 12px; overflow: hidden; border: 2px dashed #cbd5e1; background: #f8fafc; display: flex; align-items: center; justify-content: center;">
                    <span style="color: #64748b; font-size: 0.9rem;"><i class="fa-solid fa-spinner fa-spin"></i> Đang khởi động Camera...</span>
                </div>
                <div id="staff-qr-error" style="display: none; margin-top: 10px; color: #dc2626; font-size: 0.85rem; font-weight: 600;"></div>

                <div style="margin-top: 16px; padding-top: 14px; border-top: 1px dashed #e2e8f0; display: flex; flex-direction: column; gap: 10px;">
                    <label style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 16px; border-radius: 8px; border: 1px solid #cbd5e1; background: #f8fafc; color: #334155; font-weight: 600; font-size: 0.88rem; cursor: pointer;">
                        <i class="fa-solid fa-image" style="color: var(--primary);"></i> Chọn ảnh vé QR từ máy tính
                        <input type="file" accept="image/*" style="display: none;" onchange="scanStaffQrFromFile(this)">
                    </label>
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'flex';

    try {
        await ensureHtml5QrcodeLoadedStaff();
        staffHtml5QrScanner = new Html5Qrcode("staff-qr-reader");
        await staffHtml5QrScanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 220, height: 220 } },
            (decodedText) => {
                handleStaffQrResult(decodedText);
            },
            () => {}
        );
    } catch (err) {
        const readerEl = document.getElementById('staff-qr-reader');
        if (readerEl) {
            readerEl.innerHTML = `<div style="padding: 30px 15px; color: #64748b; font-size: 0.88rem;"><i class="fa-solid fa-video-slash" style="font-size: 2rem; color: #94a3b8; margin-bottom: 8px; display: block;"></i>Không tìm thấy Camera hoặc chưa cấp quyền.<br>Bạn có thể chọn <strong>ảnh vé QR</strong> bên dưới để quét!</div>`;
        }
    }
};

window.scanStaffQrFromFile = async function(input) {
    if (!input.files || input.files.length === 0) return;
    const imageFile = input.files[0];
    const errEl = document.getElementById('staff-qr-error');
    if (errEl) errEl.style.display = 'none';

    try {
        await ensureHtml5QrcodeLoadedStaff();
        if (staffHtml5QrScanner && staffHtml5QrScanner.isScanning) {
            await staffHtml5QrScanner.stop();
        }
        if (!staffHtml5QrScanner) {
            staffHtml5QrScanner = new Html5Qrcode("staff-qr-reader");
        }
        const decodedText = await staffHtml5QrScanner.scanFile(imageFile, true);
        handleStaffQrResult(decodedText);
    } catch (err) {
        if (errEl) {
            errEl.textContent = 'Không tìm thấy mã QR hợp lệ trong bức ảnh này!';
            errEl.style.display = 'block';
        }
    }
};

window.closeStaffQrScannerModal = async function() {
    const modal = document.getElementById('staff-qr-scanner-modal');
    if (modal) modal.style.display = 'none';
    if (staffHtml5QrScanner) {
        try {
            if (staffHtml5QrScanner.isScanning) await staffHtml5QrScanner.stop();
            staffHtml5QrScanner.clear();
        } catch (e) {}
        staffHtml5QrScanner = null;
    }
};

function handleStaffQrResult(rawText) {
    closeStaffQrScannerModal();
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    const cleaned = String(rawText || '').trim().toUpperCase().replace(/^#/, '');
    const match = cleaned.match(/^(PT|GD)-([A-Z0-9]+)$/);

    if (!match) {
        return showStaffDSAlert(`Mã QR "${rawText}" không đúng định dạng vé DN Football (PT-... hoặc GD-...)!`, false);
    }

    const prefix = match[1];
    const rawCode = match[2];
    const rawNum = rawCode.replace(/\D/g, '').replace(/^0+/, '') || '0';
    const myCumSan = String(currentUser.MaCumSan || currentUser.ID_CumSan);

    if (prefix === 'PT') {
        const booking = staffDatSanData.find(b => {
            if (b.MaGiaiDau || b.ID_GiaiDau) return false;
            if (!b.san_bong || String(b.san_bong.MaCumSan || b.san_bong.ID_CumSan) !== myCumSan) return false;
            const bId = String(b.MaDatSan || b.ID || '').toUpperCase();
            const bNum = bId.replace(/\D/g, '').replace(/^0+/, '') || '0';
            return bId === rawCode || bId === `DS${rawNum.padStart(3, '0')}` || bNum === rawNum;
        });

        const mappedCode = booking ? `PT-${booking.MaDatSan || booking.ID}` : `PT-DS${rawNum.padStart(3, '0')}`;

        staffDSDate = '';
        staffDSFilter = 'All';
        staffDSSearch = mappedCode.toLowerCase();
        staffDSPage = 1;

        if (document.getElementById('staff-ds-date-input')) document.getElementById('staff-ds-date-input').value = '';
        if (document.getElementById('staff-ds-status-select')) document.getElementById('staff-ds-status-select').value = 'All';
        if (document.getElementById('staff-ds-search-input')) document.getElementById('staff-ds-search-input').value = mappedCode;

        applyStaffDSFiltersAndRender();

        if (booking) {
            const noteLegacy = (cleaned !== mappedCode) ? ` (Ánh xạ từ mã cũ #${cleaned})` : '';
            showStaffDSAlert(`Đã quét thành công vé phong trào #${mappedCode}${noteLegacy}!`, true);
            openBookingDetailModalStaff(booking.MaDatSan || booking.ID);
        } else {
            showStaffDSAlert(`Không tìm thấy vé #${mappedCode} (Mã quét: #${cleaned}) tại cơ sở của bạn!`, false);
        }
    } else {
        const tourMatches = staffDatSanData.filter(b => {
            if (!b.san_bong || String(b.san_bong.MaCumSan || b.san_bong.ID_CumSan) !== myCumSan) return false;
            const gId = String(b.MaGiaiDau || b.ID_GiaiDau || '').toUpperCase();
            if (!gId) return false;
            const gNum = gId.replace(/\D/g, '').replace(/^0+/, '') || '0';
            return gId === rawCode || gId === `GDAU${rawNum.padStart(3, '0')}` || gNum === rawNum;
        });

        const actualGiaiId = tourMatches.length > 0
            ? (tourMatches[0].MaGiaiDau || tourMatches[0].ID_GiaiDau)
            : `GDAU${rawNum.padStart(3, '0')}`;
        const mappedCode = `GD-${actualGiaiId}`;

        staffDSDate = '';
        staffDSFilter = 'All';
        staffDSSearch = mappedCode.toLowerCase();
        staffDSPage = 1;

        if (document.getElementById('staff-ds-date-input')) document.getElementById('staff-ds-date-input').value = '';
        if (document.getElementById('staff-ds-status-select')) document.getElementById('staff-ds-status-select').value = 'All';
        if (document.getElementById('staff-ds-search-input')) document.getElementById('staff-ds-search-input').value = mappedCode;

        applyStaffDSFiltersAndRender();

        if (tourMatches.length > 0) {
            const noteLegacy = (cleaned !== mappedCode) ? ` (Ánh xạ từ mã cũ #${cleaned})` : '';
            showStaffDSAlert(`Đã quét Thẻ Giải Đấu #${mappedCode}${noteLegacy} (Tìm thấy ${tourMatches.length} trận đấu)!`, true);
        } else {
            showStaffDSAlert(`Không tìm thấy lịch thi đấu nào của giải #${mappedCode} (Mã quét: #${cleaned}) tại cơ sở của bạn!`, false);
        }
    }
}

// ======================================================
// MODULE: NHÂN VIÊN ĐĂNG KÝ LỊCH LÀM VIỆC
// ======================================================

function getWeekDatesStaff(offsetWeeks = 0) {
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

function renderLichLamViecStaff() {
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = document.getElementById('menu-lichlamviec');
    if (menuLink) menuLink.classList.add('active');

    // Tạo HTML cho Dropdown chọn tháng (Dùng cho tab Lịch sử)
    let thangOptions = '';
    const startYear = 2024;
    const currentYear = new Date().getFullYear();
    const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    const currentThangNam = `${currentMonth}-${currentYear}`;

    for (let y = currentYear; y >= startYear; y--) {
        for (let m = 12; m >= 1; m--) {
            const mm = String(m).padStart(2, '0');
            const val = `${mm}-${y}`;
            const selected = val === currentThangNam ? 'selected' : '';
            thangOptions += `<option value="${val}" ${selected}>Tháng ${mm}/${y}</option>`;
        }
    }

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header staff-hero-header">
            <div>
                <div class="staff-hero-badge"><i class="fa-solid fa-calendar-week"></i> Điều phối Ca Trực</div>
                <h1 class="page-title">Lịch làm việc của bạn</h1>
                <p class="text-muted">Đăng ký ca làm tuần tới (Thứ 2 - Thứ 7), theo dõi lịch trực tuần này và tra cứu bảng công hàng tháng</p>
            </div>
            <div style="background: #ffffff; border: 1px solid #bbf7d0; color: #15803d; padding: 8px 14px; border-radius: 10px; font-size: 0.84rem; font-weight: 700; display: inline-flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-building-user"></i> Cơ sở: ${window.currentClusterNameStaff || 'Đang trực'}
            </div>
        </div>

        <div class="panel">
            <!-- THANH TABS -->
            <div style="display: flex; gap: 20px; border-bottom: 1px solid var(--border); margin-bottom: 20px; padding: 0 20px;">
                <button class="nav-tab active" onclick="switchStaffCalTab('staff-cal-next', this)" style="padding: 15px 10px; border: none; background: transparent; font-weight: 600; cursor: pointer; border-bottom: 2px solid var(--primary); color: var(--primary);">Đăng ký Tuần Sau</button>
                <button class="nav-tab" onclick="switchStaffCalTab('staff-cal-current', this)" style="padding: 15px 10px; border: none; background: transparent; font-weight: 600; cursor: pointer; color: var(--text-muted);">Lịch Tuần Này</button>
                <button class="nav-tab" onclick="switchStaffCalTab('staff-cal-history', this)" style="padding: 15px 10px; border: none; background: transparent; font-weight: 600; cursor: pointer; color: var(--text-muted);">Lịch Sử Ca Làm</button>
            </div>

            <!-- LƯỚI 1: TUẦN SAU (ĐỂ ĐĂNG KÝ) -->
            <div id="staff-cal-next" class="tab-pane active" style="padding: 0 20px 20px 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; position: relative;">
                    <!-- Phần Quy tắc đăng ký -->
                    <div style="position: relative; display: flex; align-items: center;">
                        <span style="font-weight: 600; color: var(--text-dark); font-size: 0.95rem;">Quy tắc đăng ký</span>
                        <i id="btn-show-rules" class="fa-solid fa-circle-exclamation" style="color: #f59e0b; cursor: pointer; font-size: 1.15rem; margin-left: 6px; transition: 0.2s;" onclick="toggleStaffRules(event)"></i>
                        <!-- Khung Modal Quy tắc -->
                        <div id="staff-rules-box" style="display: none; position: absolute; top: 25px; left: 0; background: white; border: 1px solid var(--border); box-shadow: 0 4px 15px rgba(0,0,0,0.1); border-radius: 8px; width: 410px; padding: 15px; z-index: 100;" onclick="event.stopPropagation()">
                            <h4 style="margin: 0 0 10px 0; color: var(--primary); font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
                                <i class="fa-solid fa-clipboard-list"></i> Quy định xếp ca
                            </h4>
                            <ul style="margin: 0; padding-left: 20px; font-size: 0.85rem; color: var(--text-muted); line-height: 1.6;">
                                <li>Chỉ được phép thao tác từ <strong>Thứ 2 đến Thứ 7</strong>.</li>
                                <li>Hệ thống <strong>khóa đăng ký</strong> vào 00:00 sáng Chủ Nhật.</li>
                                <li>Sau khi Quản lý chốt (Đã duyệt), không thể tự ý hủy ca.</li>
                                <li>Có việc đột xuất phải báo trực tiếp với Quản lý sân.</li>
                            </ul>
                        </div>
                    </div>
                    <button id="btn-submit-staff-schedule" class="btn-primary" onclick="submitStaffSchedule()"><i class="fa-solid fa-paper-plane"></i> Gửi lịch làm việc</button>
                </div>
                <div id="grid-staff-next-week">Đang tải...</div>
            </div>

            <!-- LƯỚI 2: TUẦN HIỆN TẠI -->
            <div id="staff-cal-current" class="tab-pane" style="display: none; padding: 0 20px 20px 20px;">
                <div style="display: flex; gap: 20px; align-items: flex-start; overflow: hidden;">
                    <div style="flex: 1; min-width: 0; overflow-x: auto; border: 1px solid var(--border); border-radius: 8px;" class="schedule-scroll-wrapper">
                        <div id="grid-staff-current-week">Đang tải...</div>
                    </div>
                    <div style="width: 300px; flex-shrink: 0; background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; padding: 15px;">
                        <h4 style="margin: 0 0 15px 0; color: var(--primary); font-size: 1rem;"><i class="fa-solid fa-user-clock"></i> Các ca của bạn tuần này</h4>
                        <div id="my-shifts-list">Đang tải...</div>
                    </div>
                </div>
            </div>

            <!-- LƯỚI 3: LỊCH SỬ CA LÀM THEO THÁNG (MỚI) -->
            <div id="staff-cal-history" class="tab-pane" style="display: none; padding: 0 20px 20px 20px;">
                <div style="display: flex; gap: 15px; margin-bottom: 20px; align-items: center;">
                    <div style="font-weight: 600; color: var(--text-dark);">Chọn tháng:</div>
                    <select class="form-control" style="width: 200px; font-weight: bold; color: var(--primary);" id="staff-history-thangnam" onchange="handleStaffHistoryFilter()">
                        ${thangOptions}
                    </select>
                    <button class="btn-outline-sm" onclick="loadStaffHistoryData()"><i class="fa-solid fa-rotate-right"></i> Tải lại</button>
                </div>
                
                <div class="table-responsive">
                    <table class="admin-table">
                        <thead style="background: #F8FAFC;">
                            <tr>
                                <th>Ngày làm việc</th>
                                <th>Thông tin Ca</th>
                                <th style="text-align: center;">Trạng thái Duyệt</th>
                                <th style="text-align: center;">Điểm danh</th>
                                <th style="text-align: right;">Phạt / Thưởng</th>
                                <th style="text-align: right;">Ghi chú</th>
                            </tr>
                        </thead>
                        <tbody id="staff-history-tbody">
                            <tr><td colspan="5" class="text-center" style="padding: 40px;"><i class="fa-solid fa-spinner fa-spin text-primary"></i> Đang tải...</td></tr>
                        </tbody>
                    </table>
                </div>
                <div id="staff-history-pagination" style="display: flex; justify-content: center; gap: 8px; margin-top: 15px;"></div>
            </div>
        </div>
    `;

    // Mặc định load Tab đăng ký tuần sau
    loadStaffCalendarData(1, 'grid-staff-next-week');
}

function switchStaffCalTab(tabId, element) {
    const tabs = element.parentElement.children;
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
        tabs[i].style.borderBottom = 'none';
        tabs[i].style.color = 'var(--text-muted)';
    }
    element.classList.add('active');
    element.style.borderBottom = '2px solid var(--primary)';
    element.style.color = 'var(--primary)';

    document.getElementById('staff-cal-next').style.display = 'none';
    document.getElementById('staff-cal-current').style.display = 'none';
    document.getElementById('staff-cal-history').style.display = 'none';
    
    document.getElementById(tabId).style.display = 'block';

    if (tabId === 'staff-cal-current') {
        loadStaffCalendarData(0, 'grid-staff-current-week');
    } else if (tabId === 'staff-cal-next') {
        loadStaffCalendarData(1, 'grid-staff-next-week');
    } else if (tabId === 'staff-cal-history') {
        // Biến toàn cục lưu tháng hiện tại nếu chưa chọn
        if(!window.currentStaffHistoryThangNam) {
            window.currentStaffHistoryThangNam = document.getElementById('staff-history-thangnam').value;
        }
        loadStaffHistoryData();
    }
}

// Khai báo mảng lưu trữ tạm thời các ca nhân viên vừa đăng ký/chỉnh sửa
let pendingStaffShifts = [];
// Biến đánh dấu xem người dùng có thực hiện thay đổi nào chưa
let isStaffScheduleChanged = false;

async function loadStaffCalendarData(weekOffset, containerId) {
    const container = document.getElementById(containerId);
    const dates = getWeekDatesStaff(weekOffset);
    const tuNgay = dates[0].dbDate;
    const denNgay = dates[6].dbDate;
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));

    try {
        const [caRes, lichRes] = await Promise.all([
            fetch(`${API_BASE_URL}/ca-lam-viec?tu_ngay=${tuNgay}&den_ngay=${denNgay}`),
            fetch(`${API_BASE_URL}/lich-lam-viec?tu_ngay=${tuNgay}&den_ngay=${denNgay}`)
        ]);

        const caData = (await caRes.json()).data || [];
        const lichJson = await lichRes.json();
        let lichData = lichJson.data || [];
        const hasEmergencyUnlock = lichJson.quyen_khan_cap === true;

        // TRỘN DỮ LIỆU LOCAL: Đưa các ca vừa đăng ký tạm thời vào mảng lichData để hiển thị lên lưới
        pendingStaffShifts.forEach(pending => {
            lichData = lichData.filter(l => !(String(l.ID_CaLamViec) === String(pending.id_ca_lam_viec) && l.NgayLam === pending.ngay_lam && String(l.ID_NhanVien) === String(currentUser.ID)));
            
            // Nếu không phải là lệnh xóa, ta thêm vào mảng hiển thị với trạng thái DangKy
            if (!pending.is_delete) {
                lichData.push({
                    ID_CaLamViec: pending.id_ca_lam_viec,
                    NgayLam: pending.ngay_lam,
                    ID_NhanVien: currentUser.ID,
                    TrangThaiXepLich: 'DangKy',
                    GhiChu: pending.ghi_chu,
                    nhan_vien: { HoTen: currentUser.HoTen }
                });
            }
        });

        if (caData.length === 0) {
            container.innerHTML = `<div class="modal-alert error" style="display:block;">Cơ sở chưa có cấu hình ca làm việc.</div>`;
            return;
        }

        // Logic ẩn/hiện nút Gửi Lịch dựa vào biến isStaffScheduleChanged
        if (weekOffset === 1) {
            const isLocked = lichData.some(l => l.TrangThaiXepLich === 'DaDuyet' && String(l.ID_NhanVien) !== String(currentUser.ID)); 
            const isPastDeadline = new Date().getDay() === 0; // Chủ Nhật
            const btnSubmit = document.getElementById('btn-submit-staff-schedule');
            
            if (isLocked && !hasEmergencyUnlock) {
                btnSubmit.innerHTML = '<i class="fa-solid fa-lock"></i> Đã khóa đăng ký';
                btnSubmit.disabled = true;
                btnSubmit.classList.add('btn-disabled');
            } else if (isPastDeadline && !hasEmergencyUnlock) {
                // Nếu là Chủ Nhật VÀ KHÔNG được Quản lý mở khẩn cấp -> Khóa
                btnSubmit.innerHTML = '<i class="fa-solid fa-clock"></i> Hết hạn đăng ký (Chỉ từ T2 - T7)';
                btnSubmit.disabled = true;
                btnSubmit.classList.add('btn-disabled');
                btnSubmit.style.opacity = '0.7';
                btnSubmit.style.cursor = 'not-allowed';
            } else if (!isStaffScheduleChanged) {
                btnSubmit.innerHTML = hasEmergencyUnlock 
                    ? '<i class="fa-solid fa-paper-plane"></i> Gửi lịch (Lượt mở khẩn cấp 1 lần)' 
                    : '<i class="fa-solid fa-paper-plane"></i> Gửi lịch làm việc';
                btnSubmit.disabled = true;
                btnSubmit.classList.remove('btn-disabled');
                btnSubmit.style.opacity = '0.5';
                btnSubmit.style.cursor = 'not-allowed';
            } else {
                btnSubmit.innerHTML = hasEmergencyUnlock 
                    ? '<i class="fa-solid fa-paper-plane"></i> Gửi lịch (Lượt mở khẩn cấp 1 lần)' 
                    : '<i class="fa-solid fa-paper-plane"></i> Gửi lịch làm việc';
                btnSubmit.disabled = false;
                btnSubmit.classList.remove('btn-disabled');
                btnSubmit.style.opacity = '1';
                btnSubmit.style.cursor = 'pointer';
            }
        }

        let html = `
            <div class="schedule-scroll-wrapper" style="width: 100%; overflow-x: auto; border-radius: 8px; border: 1px solid var(--border);">
                <table class="admin-table table-bordered" style="min-width: 1000px; width: 100%; margin: 0; border: none;">
                    <thead style="background: #F8FAFC;">
                        <tr>
                            <th style="width: 125px; min-width: 125px; text-align: center;">CA LÀM</th>
                            ${dates.map(d => `<th style="text-align: center;">${d.dayName}<br><small style="color:var(--text-muted); font-weight:normal;">${d.display}</small></th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        let myShiftsArray = [];

        caData.forEach(ca => {
            const timeStr = (ca.GioBatDau && ca.GioKetThuc) ? `${ca.GioBatDau.substring(0,5)} - ${ca.GioKetThuc.substring(0,5)}` : '';
            const timeLabel = timeStr ? `<div style="font-size: 0.72rem; font-weight: 500; color: var(--text-muted); margin-top: 2px; white-space: nowrap;">${timeStr}</div>` : '';
            html += `<tr><td style="width: 125px; min-width: 125px; padding: 10px 8px; text-align: center; font-weight: bold; background: #f8fafc; border-right: 1px solid var(--border);">${ca.TenCa}${timeLabel}</td>`;
            
            dates.forEach(date => {
                const shifts = lichData.filter(l => String(l.ID_CaLamViec) === String(ca.ID) && l.NgayLam === date.dbDate);
                const approvedCount = shifts.filter(s => s.TrangThaiXepLich === 'DaDuyet').length;
                const reqCount = ca.SoLuongNhanVien;
                
                let bgColor = '#fff';
                let borderColor = '#e2e8f0';
                if (approvedCount === 0) { bgColor = '#fef2f2'; borderColor = '#fca5a5'; } 
                else if (approvedCount < reqCount) { bgColor = '#fffbeb'; borderColor = '#fde68a'; } 
                else { bgColor = '#ecfdf5'; borderColor = '#a7f3d0'; } 

                // Tách riêng: Lấy ca của tôi để vẽ danh sách (Box tổng hợp) bên tay phải
                const myShift = shifts.find(s => String(s.ID_NhanVien) === String(currentUser.ID));
                
                // Nếu tìm thấy ca của mình ở Tuần hiện tại, đẩy cục data đó vào mảng
                if (myShift && weekOffset === 0 && myShift.TrangThaiXepLich === 'DaDuyet') {
                    myShiftsArray.push({
                        dateObj: date, // Chứa { dbDate, display, dayName }
                        caObj: ca,     // Chứa { TenCa, GioBatDau, ... }
                        shiftObj: myShift // Chứa { CongViec, ... }
                    });
                }

                let staffHtml = '';

                // KIỂM TRA ĐANG Ở TUẦN NÀO ĐỂ HIỂN THỊ
                if (weekOffset === 0) {
                    // ==========================================
                    // LƯỚI TUẦN HIỆN TẠI: HIỂN THỊ DANH SÁCH TOÀN BỘ NHÂN VIÊN
                    // ==========================================
                    const displayShifts = shifts.filter(s => s.TrangThaiXepLich === 'DaDuyet');

                    staffHtml = displayShifts.map(s => {
                        const isMyShift = String(s.ID_NhanVien) === String(currentUser.ID);
                        const isPending = s.TrangThaiXepLich === 'DangKy';
                        const isRejected = s.TrangThaiXepLich === 'TuChoi';

                        let color = '#047857'; // Xanh ngọc (DaDuyet)
                        let icon = 'fa-check';
                        let roleStr = s.CongViec ? (s.CongViec === 'ThuNgan' ? 'TN' : 'PV') : '';
                        let noteStr = s.GhiChu && isMyShift ? ` <span style="font-style:italic; font-weight:normal; opacity:0.8;">(${s.GhiChu})</span>` : '';
                        let nameDisplay = isMyShift ? 'Tôi' : (s.nhan_vien ? s.nhan_vien.HoTen : 'N/A');
                        
                        let bgStyle = '';
                        if (isMyShift && s.TrangThaiXepLich === 'DaDuyet') {
                            bgStyle = 'background: #d1fae5; padding: 2px 4px; border-radius: 4px;'; // Highlight nền xanh nhạt cho ca của mình
                        }

                        if (isPending) {
                            color = '#b45309'; icon = 'fa-hourglass-half'; 
                            bgStyle = 'background: #fef3c7; padding: 2px 4px; border-radius: 4px;';
                            roleStr = ''; // Chưa duyệt nên ẩn vị trí
                            nameDisplay = 'Bạn đăng ký';
                        } else if (isRejected) {
                            color = '#b91c1c'; icon = 'fa-xmark'; 
                            bgStyle = 'background: #fee2e2; padding: 2px 4px; border-radius: 4px; text-decoration: line-through;';
                            roleStr = '';
                            nameDisplay = 'Bị từ chối';
                        }

                        let rightEl = roleStr ? `<strong>[${roleStr}]</strong>` : '';
                        
                        // XỬ LÝ LỖI GIAO DIỆN (Cắt chuỗi thông minh, chống tràn)
                        const fullText = `${nameDisplay}${noteStr.replace(/<[^>]*>?/gm, '')}`; // Bỏ thẻ HTML để đưa vào tooltip (title)

                        return `
                            <div style="font-size: 0.8rem; color: ${color}; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; gap: 8px; ${bgStyle}" title="${fullText}">
                                <div style="display: flex; align-items: center; min-width: 0; flex: 1;">
                                    <i class="fa-solid ${icon}" style="margin-right: 4px; flex-shrink: 0;"></i> 
                                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-block; max-width: 100%;">${nameDisplay}${noteStr}</span>
                                </div>
                                <div style="flex-shrink: 0;">${rightEl}</div>
                            </div>`;
                    }).join('');

                    if (displayShifts.length === 0) staffHtml = `<div style="font-size: 0.8rem; color: #94a3b8; text-align: center;">Chưa có người</div>`;
                } else {
                    // ==========================================
                    // LƯỚI TUẦN SAU: CHỈ HIỂN THỊ TRẠNG THÁI CỦA BẢN THÂN
                    // ==========================================
                    if (myShift) {
                        let noteStr = myShift.GhiChu ? ` <span style="font-style:italic; font-weight:normal; opacity:0.8;">(${myShift.GhiChu})</span>` : '';
                        if (myShift.TrangThaiXepLich === 'DangKy') {
                            staffHtml = `<div style="margin-top:5px; background: #fef3c7; color:#b45309; padding: 4px; border-radius:4px; font-size:0.75rem; text-align:left; font-weight:bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="Đang chờ duyệt ${myShift.GhiChu ? '- '+myShift.GhiChu : ''}"><i class="fa-solid fa-hourglass-half"></i> Bạn đăng ký${noteStr}</div>`;
                        } else if (myShift.TrangThaiXepLich === 'DaDuyet') {
                            const role = myShift.CongViec ? (myShift.CongViec === 'ThuNgan' ? 'TN' : 'PV') : '?';
                            
                            staffHtml = `
                            <div style="margin-top:5px; background: #d1fae5; color:#047857; padding: 4px; border-radius:4px; font-size:0.75rem; display: flex; justify-content: space-between; align-items: center;" title="Đã duyệt ${myShift.GhiChu ? '- '+myShift.GhiChu : ''}">
                                <div style="font-weight:bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><i class="fa-solid fa-check"></i> Đã duyệt${noteStr}</div>
                                <strong style="flex-shrink: 0; margin-left: 5px;">[${role}]</strong>
                            </div>`;
                        } else if (myShift.TrangThaiXepLich === 'TuChoi') {
                            staffHtml = `<div style="margin-top:5px; background: #fee2e2; color:#b91c1c; padding: 4px; border-radius:4px; font-size:0.75rem; text-align:left; font-weight:bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="Bị từ chối ${myShift.GhiChu ? '- '+myShift.GhiChu : ''}"><i class="fa-solid fa-xmark"></i> Bị từ chối${noteStr}</div>`;
                        }
                    }
                }

                // Giao diện ô lưới chỉ trỏ chuột được nếu tuần sau chưa bị khóa
                const isClickable = (weekOffset === 1 && document.getElementById('btn-submit-staff-schedule').innerHTML.includes('paper-plane'));
                const pointerStyle = isClickable ? 'cursor: pointer; transition: 0.2s;' : '';
                const hoverLogic = isClickable ? `onmouseover="this.style.filter='brightness(0.95)'" onmouseout="this.style.filter='brightness(1)'"` : '';
                
                const currentNote = myShift ? (myShift.GhiChu || '') : '';
                // Cho phép click để mở modal nạp dữ liệu cũ
                const clickEvent = isClickable 
                    ? `onclick="openStaffRegisterModal('${ca.ID}', '${ca.TenCa}', '${date.dbDate}', '${date.display}', '${currentNote}', ${myShift !== undefined}, '${timeStr}', ${Number(ca.LuongThuNgan || 0)}, ${Number(ca.LuongPhucVu || 0)})"` 
                    : '';

                html += `
                    <td style="background: ${bgColor}; border: 1px solid ${borderColor}; ${pointerStyle} vertical-align: top;" ${hoverLogic} ${clickEvent}>
                        <div style="font-size: 0.75rem; font-weight: bold; text-align: right; margin-bottom: 5px; color: var(--text-muted);">${approvedCount}/${reqCount}</div>
                        ${staffHtml}
                    </td>
                `;
            });
            html += `</tr>`;
        });

        html += `</tbody></table></div>`;
        container.innerHTML = html;

        if (weekOffset === 0) {
            let myShiftsHtml = '';
            
            // 1. Sắp xếp mảng: Ưu tiên Ngày trước, nếu cùng ngày thì ưu tiên Giờ Bắt Đầu (Sáng trước, Tối sau)
            myShiftsArray.sort((a, b) => {
                // So sánh theo ngày (Ví dụ: 2026-10-12 và 2026-10-13)
                if (a.dateObj.dbDate !== b.dateObj.dbDate) {
                    return new Date(a.dateObj.dbDate) - new Date(b.dateObj.dbDate);
                }
                // Nếu cùng 1 ngày, so sánh tiếp đến Giờ Bắt Đầu ca (Ví dụ: 07:00 và 15:00)
                return a.caObj.GioBatDau.localeCompare(b.caObj.GioBatDau);
            });

            // 2. Chạy vòng lặp để sinh chuỗi HTML từ mảng đã sắp xếp
            myShiftsArray.forEach(item => {
                const roleName = item.shiftObj.CongViec === 'ThuNgan' ? 'Thu Ngân' : 'Phục Vụ';
                myShiftsHtml += `
                    <div style="background: white; border: 1px solid #e2e8f0; border-left: 4px solid var(--primary); padding: 10px; margin-bottom: 10px; border-radius: 6px;">
                        <div style="font-weight: bold; color: var(--text-dark); margin-bottom: 4px;">${item.dateObj.dayName} - ${item.dateObj.display}</div>
                        <div style="font-size: 0.85rem; color: var(--primary);"><i class="fa-regular fa-clock"></i> ${item.caObj.TenCa}</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;"><i class="fa-solid fa-user-tag"></i> Vị trí: ${roleName}</div>
                    </div>
                `;
            });

            // 3. Đổ ra giao diện
            const listEl = document.getElementById('my-shifts-list');
            if (listEl) listEl.innerHTML = myShiftsHtml || '<div style="color:var(--text-muted); font-size:0.85rem;">Bạn không có ca nào tuần này.</div>';
        }

    } catch (e) {
        container.innerHTML = `<div class="modal-alert error" style="display:block;">Lỗi kết nối máy chủ!</div>`;
    }
}

// Mở Modal ghi chú
function openStaffRegisterModal(caId, tenCa, ngayLam, displayDate, currentNote, isAlreadyRegistered, timeStr = '', luongTN = 0, luongPV = 0) {
    const infoEl = document.getElementById('staff-reg-shift-info');
    infoEl.innerHTML = `
        <div style="margin-bottom: 10px;">
            <strong style="color: var(--text-dark); font-size: 1rem;">${tenCa}</strong>
            ${timeStr ? `<span style="color: var(--primary); font-weight: 600;"> (${timeStr})</span>` : ''} 
            &bull; Ngày <strong>${displayDate}</strong>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; text-align: left;">
            <div style="border-right: 1px dashed #cbd5e1; padding-right: 8px;">
                <div style="font-size: 0.74rem; color: #64748b; font-weight: 600;"><i class="fa-solid fa-cash-register" style="color: #0284c7; margin-right: 4px;"></i>Vị trí Thu Ngân</div>
                <div style="font-size: 0.95rem; font-weight: 800; color: #0284c7; margin-top: 2px;">${Number(luongTN).toLocaleString('vi-VN')}đ <span style="font-size: 0.72rem; font-weight: 500; color: #64748b;">/ca</span></div>
            </div>
            <div style="padding-left: 4px;">
                <div style="font-size: 0.74rem; color: #64748b; font-weight: 600;"><i class="fa-solid fa-shirt" style="color: #16a34a; margin-right: 4px;"></i>Vị trí Phục Vụ</div>
                <div style="font-size: 0.95rem; font-weight: 800; color: #16a34a; margin-top: 2px;">${Number(luongPV).toLocaleString('vi-VN')}đ <span style="font-size: 0.72rem; font-weight: 500; color: #64748b;">/ca</span></div>
            </div>
        </div>
    `;

    document.getElementById('staff-reg-ca-id').value = caId;
    document.getElementById('staff-reg-date').value = ngayLam;
    document.getElementById('staff-reg-note').value = currentNote; 
    
    const modal = document.getElementById('staff-register-shift-modal');
    const btnCancel = document.getElementById('btn-cancel-staff-reg');
    const btnSubmit = modal.querySelector('.btn-primary');

    // Chỉnh lại style cho nút "Hủy bỏ" (đóng modal) cho sang trọng, rõ viền
    const btnCloseModal = modal.querySelector('button[onclick*="staff-register-shift-modal"]');
    if (btnCloseModal) {
        btnCloseModal.style.cssText = 'width: auto; padding: 10px 22px; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-weight: 600; font-size: 0.9rem; cursor: pointer; transition: all 0.2s ease;';
        btnCloseModal.onmouseover = function() { this.style.background = '#f1f5f9'; this.style.borderColor = '#94a3b8'; this.style.color = '#0f172a'; };
        btnCloseModal.onmouseout = function() { this.style.background = '#ffffff'; this.style.borderColor = '#cbd5e1'; this.style.color = '#475569'; };
    }
    
    if (btnCancel) {
        if (isAlreadyRegistered) {
            btnCancel.style.display = 'inline-block';
            btnCancel.style.cssText = 'width: auto; padding: 10px 18px; border-radius: 8px; border: 1px solid #fecaca; background: #fef2f2; color: #dc2626; font-weight: 600; font-size: 0.9rem; cursor: pointer; transition: 0.2s;';
            btnCancel.onclick = function() { executeStaffRegisterShift(true); };
            btnSubmit.innerHTML = 'Cập nhật ghi chú';
        } else {
            btnCancel.style.display = 'none';
            btnSubmit.innerHTML = 'Xác nhận Đăng ký';
        }
    }

    modal.style.display = 'flex';
}

// Hàm Xử lý Lưu Tạm Giao Diện (Đánh dấu isStaffScheduleChanged = true)
function executeStaffRegisterShift(isDelete = false) {
    const caId = document.getElementById('staff-reg-ca-id').value;
    const ngayLam = document.getElementById('staff-reg-date').value;
    const note = document.getElementById('staff-reg-note').value.trim();
    
    // Ghi nhận đã có thay đổi để Lưới bật sáng nút "Gửi lịch làm việc"
    isStaffScheduleChanged = true;

    // Loại bỏ ca này ra khỏi mảng tạm trước để tránh trùng lặp
    pendingStaffShifts = pendingStaffShifts.filter(p => !(String(p.id_ca_lam_viec) === String(caId) && p.ngay_lam === ngayLam));
    
    if (!isDelete) {
        // Hành động: Đăng ký mới hoặc Cập nhật ghi chú
        pendingStaffShifts.push({
            id_ca_lam_viec: caId,
            ngay_lam: ngayLam,
            ghi_chu: note,
            is_delete: false
        });
    } else {
        // Hành động: Xóa ca
        pendingStaffShifts.push({
            id_ca_lam_viec: caId,
            ngay_lam: ngayLam,
            is_delete: true
        });
    }

    document.getElementById('staff-register-shift-modal').style.display = 'none';
    loadStaffCalendarData(1, 'grid-staff-next-week'); 
}

// GỬI HÀNG LOẠT LÊN SERVER BAO GỒM CẢ LỆNH THÊM/SỬA VÀ XÓA
async function submitStaffSchedule() {
    if (pendingStaffShifts.length === 0) {
        return showSystemModal("Thông báo", "Bạn chưa có thay đổi nào để gửi.", "error");
    }

    const btn = document.getElementById('btn-submit-staff-schedule');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    btn.disabled = true;

    try {
        // Tách làm 2 mảng: Mảng Đăng ký/Sửa và Mảng Xóa
        const shiftsToAddUpdate = pendingStaffShifts.filter(p => !p.is_delete);
        const shiftsToDelete = pendingStaffShifts.filter(p => p.is_delete);

        const promises = [];

        // 1. Chạy vòng lặp gọi API Đăng ký mới / Cập nhật ghi chú
        shiftsToAddUpdate.forEach(payload => {
            promises.push(
                fetch(`${API_BASE_URL}/lich-lam-viec/dang-ky`, {
                    method: 'POST',
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` },
                    body: JSON.stringify({
                        id_ca_lam_viec: payload.id_ca_lam_viec,
                        ngay_lam: payload.ngay_lam,
                        ghi_chu: payload.ghi_chu
                    })
                }).then(res => res.json())
            );
        });

        // 2. Chạy vòng lặp gọi API Xóa (Hủy đăng ký)
        shiftsToDelete.forEach(payload => {
            promises.push(
                // Đẩy tham số id_ca_lam_viec và ngay_lam trực tiếp lên URL
                fetch(`${API_BASE_URL}/lich-lam-viec/dang-ky?id_ca_lam_viec=${payload.id_ca_lam_viec}&ngay_lam=${payload.ngay_lam}`, {
                    method: 'DELETE',
                    headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` }
                    // Không dùng body cho method DELETE
                }).then(res => res.json())
            );
        });

        // Hứng toàn bộ phản hồi từ Backend
        const results = await Promise.all(promises);

        // Kiểm tra xem có API nào bị từ chối (success = false) không
        const hasError = results.some(res => !res.success);

        if (hasError) {
            // Lấy thông báo lỗi đầu tiên tìm thấy để báo cho nhân viên
            const errorMsg = results.find(res => !res.success)?.message || "Một số thay đổi không thể lưu.";
            showSystemModal("Có lỗi xảy ra", errorMsg, "error");
        } else {
            // Thành công hoàn toàn: Xóa mảng tạm, tắt cờ trạng thái, báo thành công
            pendingStaffShifts = [];
            isStaffScheduleChanged = false;

            // Nếu đang gửi vào Chủ Nhật (lượt mở khẩn cấp 1 lần) -> Thu hồi quyền ngay sau khi gửi xong
            if (new Date().getDay() === 0) {
                await fetch(`${API_BASE_URL}/lich-lam-viec/hoan-tat-khan-cap`, {
                    method: 'POST',
                    headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` }
                });
            }
            
            showSystemModal("Thành công", "Đã đồng bộ lịch làm việc của bạn lên hệ thống.", "success");
        }

        loadStaffCalendarData(1, 'grid-staff-next-week'); 

    } catch(e) {
        showSystemModal("Mất kết nối", "Lỗi kết nối máy chủ!", "error");
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Gửi lịch làm việc';
        btn.disabled = false;
    }
}

// ======================================================
// LOGIC: BẬT / TẮT QUY TẮC ĐĂNG KÝ CA CHO NHÂN VIÊN
// ======================================================

// Hàm bật/tắt popup hộp thoại quy tắc
window.toggleStaffRules = function(event) {
    event.stopPropagation(); // Ngăn không cho sự kiện click lan ra ngoài document
    const ruleBox = document.getElementById('staff-rules-box');
    if (ruleBox) {
        if (ruleBox.style.display === 'none' || ruleBox.style.display === '') {
            ruleBox.style.display = 'block';
        } else {
            ruleBox.style.display = 'none';
        }
    }
};

// Bắt sự kiện click toàn màn hình để tự động đóng box nếu click ra ngoài
document.addEventListener('click', function(event) {
    const ruleBox = document.getElementById('staff-rules-box');
    const btnShow = document.getElementById('btn-show-rules');
    
    // Nếu hộp thoại đang bật
    if (ruleBox && ruleBox.style.display === 'block') {
        // Kiểm tra vị trí chuột: Nếu click KHÔNG nằm trong ruleBox VÀ KHÔNG phải click vào cái dấu chấm than
        if (!ruleBox.contains(event.target) && event.target !== btnShow) {
            ruleBox.style.display = 'none';
        }
    }
});

// ======================================================
// MODULE: NHÂN VIÊN ĐIỂM DANH CA LÀM VIỆC (CHECK-IN)
// ======================================================
function renderDiemDanhNhanCa() {
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = document.getElementById('menu-nhangiaoca');
    if (menuLink) menuLink.classList.add('active');

    const todayFmt = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header staff-hero-header">
            <div>
                <div class="staff-hero-badge"><i class="fa-solid fa-fingerprint"></i> Chấm Công Điện Tử</div>
                <h1 class="page-title">Điểm danh Ca làm việc</h1>
                <p class="text-muted">Nhấn điểm danh khi bắt đầu ca trực hôm nay (Mở điểm danh trước giờ vào ca tối đa 30 phút).</p>
            </div>
            <div style="background: #ffffff; border: 1px solid #cbd5e1; color: #334155; padding: 8px 16px; border-radius: 10px; font-size: 0.86rem; font-weight: 700; display: inline-flex; align-items: center; gap: 8px;">
                <i class="fa-regular fa-calendar-check" style="color: var(--primary);"></i> ${todayFmt}
            </div>
        </div>

        <div id="diemdanh-container" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px;">
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
                <i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem;"></i><br><br>Đang tải ca làm việc hôm nay...
            </div>
        </div>
    `;

    loadDanhSachCaHomNay();
}

async function loadDanhSachCaHomNay() {
    const container = document.getElementById('diemdanh-container');
    if (!container) return;

    const todayStr = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10);
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));

    try {
        const lichRes = await fetch(`${API_BASE_URL}/lich-lam-viec?tu_ngay=${todayStr}&den_ngay=${todayStr}`);
        const res = await lichRes.json();

        if (res.success) {
            const myShifts = (res.data || []).filter(l => String(l.ID_NhanVien) === String(currentUser.ID) && l.TrangThaiXepLich === 'DaDuyet');

            if (myShifts.length === 0) {
                container.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 50px; background: white; border-radius: 12px; border: 1px dashed var(--border);">
                        <div style="font-size: 3rem; color: #cbd5e1; margin-bottom: 15px;"><i class="fa-solid fa-mug-hot"></i></div>
                        <h3 style="color: var(--text-dark); font-size: 1.1rem; margin-bottom: 5px;">Hôm nay bạn không có ca làm việc nào!</h3>
                        <p style="color: var(--text-muted); font-size: 0.9rem;">Hãy nghỉ ngơi thật tốt nhé.</p>
                    </div>`;
                return;
            }

            let html = '';
            myShifts.forEach(shift => {
                const ca = shift.ca_lam_viec || shift.caLamViec;
                if (!ca) return;

                const role = shift.CongViec === 'ThuNgan' ? 'Thu Ngân' : 'Phục Vụ';
                const timeStr = `${ca.GioBatDau.substring(0,5)} - ${ca.GioKetThuc.substring(0,5)}`;

                let statusHtml = '';
                let actionHtml = '';
                let borderStyle = '';

                if (shift.TrangThaiDiemDanh === 'ChuaLam') {
                    borderStyle = 'border-top: 4px solid #f59e0b;';
                    statusHtml = `<span style="background: #fef3c7; color: #b45309; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;">Chưa điểm danh</span>`;
                    actionHtml = `<button class="btn-primary" style="width: 100%; margin-top: 15px; padding: 12px; font-size: 1rem;" onclick="executeDiemDanh('${shift.ID}', event)"><i class="fa-solid fa-fingerprint" style="margin-right: 8px;"></i> ĐIỂM DANH NHẬN CA</button>`;
                } else if (shift.TrangThaiDiemDanh === 'DaLam') {
                    borderStyle = 'border-top: 4px solid #10b981;';
                    const treHtml = shift.SoPhutDiMuon > 0 ? `<br><small style="color: #ef4444; font-weight: 500;">Đi muộn ${formatMinutesToHours(shift.SoPhutDiMuon)}</small>` : '';
                    statusHtml = `<div style="text-align:right;"><span style="background: #d1fae5; color: #047857; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;"><i class="fa-solid fa-circle-check"></i> Đã điểm danh</span>${treHtml}</div>`;
                    actionHtml = `<div style="text-align: center; margin-top: 15px; padding: 12px; background: #ecfdf5; border-radius: 8px; color: #047857; font-weight: bold;"><i class="fa-solid fa-user-check"></i> Bạn đã điểm danh có mặt trong ca này</div>`;
                } else if (shift.TrangThaiDiemDanh === 'VangMat') {
                    borderStyle = 'border-top: 4px solid #ef4444;';
                    statusHtml = `<span style="background: #fee2e2; color: #b91c1c; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;"><i class="fa-solid fa-xmark"></i> Vắng mặt</span>`;
                    actionHtml = `<div style="text-align: center; margin-top: 15px; padding: 12px; background: #fef2f2; border-radius: 8px; color: #ef4444; font-weight: bold;">Ca này đã bị chốt vắng mặt</div>`;
                }

                html += `
                    <div class="panel" style="padding: 20px; ${borderStyle} box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                            <div>
                                <h3 style="margin: 0 0 5px 0; color: var(--primary); font-size: 1.2rem;">${ca.TenCa}</h3>
                                <div style="font-size: 0.9rem; color: var(--text-dark);"><i class="fa-regular fa-clock" style="color: #94a3b8; width: 16px;"></i> ${timeStr}</div>
                            </div>
                            ${statusHtml}
                        </div>
                        <div style="font-size: 0.95rem; color: var(--text-muted); margin-bottom: 10px;">
                            <i class="fa-solid fa-user-tag" style="color: #94a3b8; width: 16px;"></i> Vị trí: <strong style="color: var(--text-dark);">${role}</strong>
                        </div>
                        ${actionHtml}
                    </div>
                `;
            });

            container.innerHTML = html;
        }
    } catch(e) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 20px; color: red;">Lỗi kết nối máy chủ!</div>`;
    }
}

async function executeDiemDanh(idLich, event) {
    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/lich-lam-viec/${idLich}/diem-danh`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` }
        });
        const data = await response.json();

        if (response.ok && data.success) {
            showSystemModal("Thành công!", data.message, "success");
            loadDanhSachCaHomNay();
        } else {
            showSystemModal("Lỗi điểm danh", data.message, "error");
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    } catch(e) {
        showSystemModal("Lỗi mạng", "Không kết nối được server.", "error");
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Hàm chuyển đổi số phút sang định dạng "X giờ Y phút"
function formatMinutesToHours(minutes) {
    if (minutes <= 0) return '';
    if (minutes < 60) return `${minutes} phút`;
    
    const hours = Math.floor(minutes / 60);
    const remainMinutes = minutes % 60;
    
    if (remainMinutes === 0) {
        return `${hours}h`;
    }
    return `${hours}h${remainMinutes}p`;
}

// ======================================================
// MODULE: NHÂN VIÊN - XEM LỊCH SỬ CA LÀM
// ======================================================
let allStaffHistoryData = [];
let staffHistoryPage = 1;
const staffHistoryItemsPerPage = 7; // Hiển thị 7 ca 1 trang cho gọn
window.currentStaffHistoryThangNam = '';

function handleStaffHistoryFilter() {
    window.currentStaffHistoryThangNam = document.getElementById('staff-history-thangnam').value;
    staffHistoryPage = 1; // Reset về trang 1
    loadStaffHistoryData();
}

async function loadStaffHistoryData() {
    const tbody = document.getElementById('staff-history-tbody');
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 40px; text-align: center;"><i class="fa-solid fa-spinner fa-spin text-primary"></i> Đang tải dữ liệu...</td></tr>`;
    document.getElementById('staff-history-pagination').innerHTML = '';

    // LẤY MẶC ĐỊNH LÀ THÁNG HIỆN TẠI NẾU CHƯA CÓ
    if (!window.currentStaffHistoryThangNam) {
        const today = new Date();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        window.currentStaffHistoryThangNam = `${mm}-${yyyy}`;
        // Gán ngược lại vào Select để UI đồng bộ
        const sel = document.getElementById('staff-history-thangnam');
        if (sel) sel.value = window.currentStaffHistoryThangNam;
    }

    const thangNam = window.currentStaffHistoryThangNam; 
    const parts = thangNam.split('-');
    const m = parts[0];
    const y = parts[1];
    
    // Tìm ngày đầu và ngày cuối của tháng đó
    const firstDay = `${y}-${m}-01`;
    // Lấy ngày cuối bằng cách lùi 1 ngày từ tháng tiếp theo
    const lastDayObj = new Date(y, m, 0); 
    const lastDay = `${y}-${m}-${String(lastDayObj.getDate()).padStart(2, '0')}`;

    try {
        const response = await fetch(`${API_BASE_URL}/lich-lam-viec?tu_ngay=${firstDay}&den_ngay=${lastDay}`, {
            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` }
        });
        
        const res = await response.json();
        
        if (res.success) {
            const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
            
            // CHỈ LẤY CA CỦA MÌNH & CÓ TRẠNG THÁI ĐIỂM DANH LÀ ĐÃ LÀM HOẶC VẮNG MẶT
            allStaffHistoryData = (res.data || []).filter(item => 
                String(item.ID_NhanVien) === String(currentUser.ID) &&
                (item.TrangThaiDiemDanh === 'DaLam' || item.TrangThaiDiemDanh === 'VangMat')
            );
            
            // Sắp xếp ngày giảm dần (Mới nhất lên đầu)
            allStaffHistoryData.sort((a, b) => new Date(b.NgayLam) - new Date(a.NgayLam));

            renderStaffHistoryPagination();
        } else {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">${res.message}</td></tr>`;
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Lỗi kết nối máy chủ!</td></tr>`;
    }
}

function renderStaffHistoryPagination() {
    const totalPages = Math.ceil(allStaffHistoryData.length / staffHistoryItemsPerPage) || 1;
    if (staffHistoryPage > totalPages) staffHistoryPage = totalPages;

    const startIdx = (staffHistoryPage - 1) * staffHistoryItemsPerPage;
    const pageData = allStaffHistoryData.slice(startIdx, startIdx + staffHistoryItemsPerPage);

    const tbody = document.getElementById('staff-history-tbody');
    
    if (pageData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 40px; text-align: center;">Tháng này bạn chưa đăng ký ca nào hoặc đơn đã bị từ chối.</td></tr>`;
        document.getElementById('staff-history-pagination').innerHTML = '';
        return;
    }

    let html = '';
    pageData.forEach(item => {
        const ca = item.ca_lam_viec || item.caLamViec || {};
        
        // --- 1. Thời gian ---
        const d = new Date(item.NgayLam);
        const dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
        const dayName = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];
        const timeStr = ca.GioBatDau ? `${ca.GioBatDau.substring(0,5)} - ${ca.GioKetThuc.substring(0,5)}` : '';
        
        // --- 2. Thông tin ca ---
        const tenCa = ca.TenCa || 'Không rõ';
        const role = item.CongViec === 'ThuNgan' ? 'Thu Ngân' : 'Phục Vụ';

        // --- 3. Trạng thái Duyệt (Trạng thái xếp lịch) ---
        let bgDuyet = '', iconDuyet = '', txtDuyet = '';
        if (item.TrangThaiXepLich === 'DaDuyet') {
            bgDuyet = 'background: #d1fae5; color: #047857;'; iconDuyet = '<i class="fa-solid fa-check"></i>'; txtDuyet = 'Đã duyệt';
        } else if (item.TrangThaiXepLich === 'DangKy') {
            bgDuyet = 'background: #fef3c7; color: #b45309;'; iconDuyet = '<i class="fa-solid fa-hourglass-half"></i>'; txtDuyet = 'Chờ duyệt';
        }

        // --- 4. Điểm danh ---
        let bgDiemDanh = '', iconDiemDanh = '', txtDiemDanh = '';
        if (item.TrangThaiDiemDanh === 'DaLam') {
            bgDiemDanh = 'background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;'; iconDiemDanh = '<i class="fa-solid fa-circle-check"></i>'; txtDiemDanh = 'Đã làm';
            if (item.SoPhutDiMuon > 0) txtDiemDanh += ` (Trễ ${item.SoPhutDiMuon}p)`;
        } else if (item.TrangThaiDiemDanh === 'VangMat') {
            bgDiemDanh = 'background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca;'; iconDiemDanh = '<i class="fa-solid fa-circle-xmark"></i>'; txtDiemDanh = 'Vắng mặt';
        } else {
            bgDiemDanh = 'background: #f8fafc; color: #94a3b8; border: 1px dashed #cbd5e1;'; iconDiemDanh = '<i class="fa-solid fa-minus"></i>'; txtDiemDanh = 'Chưa diễn ra';
        }

        const displayDiemDanh = item.TrangThaiXepLich === 'DaDuyet'
            ? `<span style="padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; display: inline-block; white-space: nowrap; ${bgDiemDanh}">${iconDiemDanh} ${txtDiemDanh}</span>`
            : `<span style="color: #cbd5e1; font-size: 0.85rem;">-</span>`;

        // --- 5. Tiền Thưởng / Phạt ---
        let thuongPhatHtml = '';
        if (item.TienPhat > 0) thuongPhatHtml += `<div style="color: #ef4444; font-size: 0.85rem; font-weight: bold; margin-bottom: 2px;">- ${Number(item.TienPhat).toLocaleString('vi-VN')}đ</div>`;
        if (item.TienThuong > 0) thuongPhatHtml += `<div style="color: #10b981; font-size: 0.85rem; font-weight: bold; margin-bottom: 2px;">+ ${Number(item.TienThuong).toLocaleString('vi-VN')}đ</div>`;
        if (!thuongPhatHtml) thuongPhatHtml = '<span style="color: #cbd5e1;">-</span>';

        // --- 6. Ghi chú ---
        let ghiChuHtml = '';
        if (item.GhiChu) ghiChuHtml += `<div style="font-size: 0.8rem; color: #64748b; font-style: italic;">Bạn: ${item.GhiChu}</div>`;
        if (item.LyDoDieuChinh) ghiChuHtml += `<div style="font-size: 0.8rem; color: #ef4444; font-style: italic; margin-top: 4px;">QL: ${item.LyDoDieuChinh}</div>`;
        if (!ghiChuHtml) ghiChuHtml = '<span style="color: #cbd5e1;">-</span>';

        html += `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td>
                    <strong style="color: var(--text-dark);">${dayName}</strong><br>
                    <span style="font-size: 0.85rem; color: var(--text-muted);">${dateStr}</span>
                </td>
                <td>
                    <strong style="color: var(--primary);">${tenCa}</strong><br>
                    <span style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-solid fa-user-tag"></i> Vị trí: ${role}</span>
                </td>
                <td style="text-align: center;">
                    <span style="padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold; ${bgDuyet}">${iconDuyet} ${txtDuyet}</span>
                </td>
                <td style="text-align: center;">
                    ${displayDiemDanh}
                </td>
                <td style="text-align: right;">
                    ${thuongPhatHtml}
                </td>
                <td style="text-align: right;">
                    ${ghiChuHtml}
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;

    // Vẽ phân trang
    const div = document.getElementById('staff-history-pagination');
    if (totalPages <= 1) return div.innerHTML = '';
    
    let pageHtml = `<button class="btn-outline-sm" ${staffHistoryPage === 1 ? 'disabled style="opacity:0.5;"' : ''} onclick="staffHistoryPage--; renderStaffHistoryPagination()"><i class="fa-solid fa-chevron-left"></i></button>`;
    
    const getPages = (current, total) => {
        if (total <= 5) return Array.from({length: total}, (_, i) => i + 1);
        if (current <= 3) return [1, 2, 3, '...', total];
        if (current >= total - 2) return [1, '...', total - 2, total - 1, total];
        return [1, '...', current, '...', total];
    };

    getPages(staffHistoryPage, totalPages).forEach(i => {
        if (i === '...') {
            pageHtml += `<span style="padding: 6px 10px; color: var(--text-muted); font-weight: bold;">...</span>`;
        } else {
            pageHtml += `<button class="${i === staffHistoryPage ? 'btn-primary' : 'btn-outline-sm'}" style="padding: 6px 14px;" onclick="staffHistoryPage=${i}; renderStaffHistoryPagination()">${i}</button>`;
        }
    });

    pageHtml += `<button class="btn-outline-sm" ${staffHistoryPage === totalPages ? 'disabled style="opacity:0.5;"' : ''} onclick="staffHistoryPage++; renderStaffHistoryPagination()"><i class="fa-solid fa-chevron-right"></i></button>`;
    div.innerHTML = pageHtml;
}

let staffModalReviewsData = [];
let staffModalReviewSort = 'all';
let staffModalReviewPage = 1;
const STAFF_REVIEWS_PER_PAGE = 6;

window.openStaffClusterReviewsModal = async function(idCumSan, tenCumSan) {
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

        staffModalReviewsData = data.data || [];
        staffModalReviewSort = 'all';
        staffModalReviewPage = 1;

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

            <div id="staff-review-filter-btns" style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #f1f5f9;"></div>
            <div id="staff-review-items-box"></div>
            <div id="staff-review-pagination" style="display: flex; justify-content: center; align-items: center; gap: 6px; margin-top: 14px; padding-top: 10px;"></div>
        `;

        renderStaffModalReviewsList();
    } catch (e) {
        document.getElementById('cluster-reviews-body').innerHTML = `<div style="color:red; text-align:center;">Lỗi tải đánh giá!</div>`;
    }
};

window.setStaffModalReviewSort = function(sortType) {
    staffModalReviewSort = sortType;
    staffModalReviewPage = 1;
    renderStaffModalReviewsList();
};

window.changeStaffModalReviewPage = function(page) {
    staffModalReviewPage = page;
    renderStaffModalReviewsList();
};

function renderStaffModalReviewsList() {
    const filterBox = document.getElementById('staff-review-filter-btns');
    const listBox = document.getElementById('staff-review-items-box');
    const pageBox = document.getElementById('staff-review-pagination');
    if (!listBox) return;

    const buttons = [
        { key: 'all', label: 'Tất cả' },
        { key: 'newest', label: 'Mới nhất' },
        { key: 'highest', label: 'Cao nhất' },
        { key: 'lowest', label: 'Thấp nhất' }
    ];

    if (filterBox) {
        filterBox.innerHTML = buttons.map(b => {
            const active = staffModalReviewSort === b.key;
            const style = active
                ? 'background: var(--primary); color: #fff; border: 1px solid var(--primary);'
                : 'background: #f8fafc; color: #475569; border: 1px solid #cbd5e1;';
            return `<button type="button" onclick="setStaffModalReviewSort('${b.key}')" style="${style} padding: 6px 13px; border-radius: 999px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: 0.15s;">${b.label}</button>`;
        }).join('');
    }

    let sorted = [...staffModalReviewsData];
    if (staffModalReviewSort === 'newest' || staffModalReviewSort === 'all') {
        sorted.sort((a, b) => new Date(b.NgayTao || 0) - new Date(a.NgayTao || 0));
    } else if (staffModalReviewSort === 'highest') {
        sorted.sort((a, b) => Number(b.SoSao) - Number(a.SoSao) || (new Date(b.NgayTao || 0) - new Date(a.NgayTao || 0)));
    } else if (staffModalReviewSort === 'lowest') {
        sorted.sort((a, b) => Number(a.SoSao) - Number(b.SoSao) || (new Date(b.NgayTao || 0) - new Date(a.NgayTao || 0)));
    }

    const totalPages = Math.ceil(sorted.length / STAFF_REVIEWS_PER_PAGE) || 1;
    if (staffModalReviewPage > totalPages) staffModalReviewPage = totalPages;
    const startIdx = (staffModalReviewPage - 1) * STAFF_REVIEWS_PER_PAGE;
    const pageItems = sorted.slice(startIdx, startIdx + STAFF_REVIEWS_PER_PAGE);

    listBox.innerHTML = pageItems.map(r => {
        const stars = '★'.repeat(Number(r.SoSao)) + '☆'.repeat(5 - Number(r.SoSao));
        const tenKhach = r.nguoi_dung?.HoTen || 'Khách hàng';
        const idGiaiDau = r.dat_san?.ID_GiaiDau || r.dat_san?.giai_dau?.ID || null;
        const tenGiaiDau = r.dat_san?.giai_dau?.TenGiaiDau || '';
        const tenSan = r.dat_san?.san_bong?.TenSan || 'Sân bóng';

        const tagHtml = idGiaiDau
            ? `<span style="font-weight:600; font-size:0.76rem; color:#4338ca; background:#eef2ff; border:1px solid #c7d2fe; padding:2px 8px; border-radius:6px; margin-left:6px;"><i class="fa-solid fa-trophy"></i> ${tenGiaiDau ? `Giải đấu: ${tenGiaiDau}` : 'Giải đấu'} &bull; #GD-${idGiaiDau}</span>`
            : `<span style="font-weight:500; font-size:0.78rem; color:#64748b; background:#f1f5f9; padding:2px 8px; border-radius:6px; margin-left:6px;">${tenSan} &bull; Vé #PT-${r.ID_DatSan}</span>`;

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
            let pHtml = `<button class="btn-outline-sm" ${staffModalReviewPage === 1 ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''} onclick="changeStaffModalReviewPage(${staffModalReviewPage - 1})" style="padding: 5px 10px;"><i class="fa-solid fa-chevron-left"></i></button>`;
            for (let i = 1; i <= totalPages; i++) {
                const active = i === staffModalReviewPage;
                pHtml += `<button class="${active ? 'btn-primary' : 'btn-outline-sm'}" style="padding: 5px 12px;" onclick="changeStaffModalReviewPage(${i})">${i}</button>`;
            }
            pHtml += `<button class="btn-outline-sm" ${staffModalReviewPage === totalPages ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''} onclick="changeStaffModalReviewPage(${staffModalReviewPage + 1})" style="padding: 5px 10px;"><i class="fa-solid fa-chevron-right"></i></button>`;
            pageBox.innerHTML = pHtml;
        }
    }
}

async function syncStaffClusterRatingRealtime(idCumSan) {
    try {
        const res = await fetch(`${API_BASE_URL}/danh-gia?id_cum_san=${idCumSan}`);
        const data = await res.json();
        if (!data.success) return;

        // 1. Cập nhật nút "Đánh giá cơ sở: X.X (Y đánh giá)" trên Màn hình Thu Ngân (nếu đang đứng ở trang Thu Ngân)
        const ratingBtn = document.querySelector('button[onclick^="openStaffClusterReviewsModal"]');
        if (ratingBtn) {
            const countStar = Number(data.tong_so || 0);
            const avgStar = countStar > 0 ? Number(data.trung_binh || 0).toFixed(1) : '0.0';
            ratingBtn.innerHTML = `
                <i class="fa-solid fa-star" style="color: #f59e0b; font-size: 1.1rem;"></i>
                <span>Đánh giá cơ sở: <strong>${avgStar}</strong> (${countStar} đánh giá)</span>
            `;
        }

        // 2. Nếu Nhân viên đang mở Modal xem đánh giá -> Cập nhật trực tiếp danh sách & biểu đồ sao
        const modal = document.getElementById('cluster-reviews-view-modal');
        if (modal && modal.style.display === 'flex') {
            if (!document.getElementById('staff-review-items-box') && data.tong_so > 0) {
                openStaffClusterReviewsModal(idCumSan, window.currentClusterNameStaff || 'Cơ sở');
                return;
            }
            staffModalReviewsData = data.data || [];
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
            renderStaffModalReviewsList();
        }
    } catch (e) {
        console.error('Lỗi đồng bộ đánh giá nhân viên:', e);
    }
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
        const listDatSan = [...(hd.dat_sans || hd.datSans || [])].sort((a, b) => {
            const dateCmp = String(a.NgayDa || '').localeCompare(String(b.NgayDa || ''));
            if (dateCmp !== 0) return dateCmp;
            const timeA = a.khung_gio?.GioBatDau || '';
            const timeB = b.khung_gio?.GioBatDau || '';
            return timeA.localeCompare(timeB);
        });

        const first = listDatSan[0] || {};
        const tenKhach = hd.nguoi_dung?.HoTen || first.TenNguoiDat || first.TenKhachVangLai || 'Khách hàng';
        const sdtKhach = hd.nguoi_dung?.SoDienThoai || first.SDTNguoiDat || first.SDTKhachVangLai || '';
        const ngayLap = hd.NgayTao ? new Date(hd.NgayTao).toLocaleString('vi-VN') : '';
        const tenGiaiDau = first.giai_dau?.TenGiaiDau || null;
        const statusMap = { 'DaCoc': 'Đã đặt cọc', 'HoanThanh': 'Đã hoàn thành', 'DaHuy': 'Đã hủy', 'KhongDen': 'Không đến' };

        let tongTienSanGoc = 0;       // Chỉ cộng đơn giá các trận Đã cọc + Hoàn thành
        let tongCocKhongDen = 0;      // Chỉ cộng tiền cọc (30% hoặc 50%) của các trận Không đến
        let soTranTinhTienGoc = 0;    // Số trận thực tế tính vào Tổng tiền sân gốc
        let soTranKhongDen = 0;       // Số trận Không đến

        const rowsHtml = listDatSan.map((ds, i) => {
            const tenSan = ds.san_bong?.TenSan || 'Sân bóng';
            const cumSan = ds.san_bong?.cum_san?.TenCumSan || '';
            const kg = ds.khung_gio ? `${ds.khung_gio.GioBatDau.substring(0,5)} - ${ds.khung_gio.GioKetThuc.substring(0,5)}` : '';
            const ngayDa = ds.NgayDa ? ds.NgayDa.split('-').reverse().join('/') : '';
            const maVe = (ds.MaGiaiDau || ds.ID_GiaiDau) ? `GD-${ds.MaGiaiDau || ds.ID_GiaiDau}` : `PT-${ds.MaDatSan || ds.ID}`;
            const donGia = Number(ds.pivot?.DonGia ?? ds.TongTien ?? 0);
            const tienCocTran = Number(ds.TienCoc || 0);

            if (ds.TrangThai === 'DaCoc' || ds.TrangThai === 'HoanThanh') {
                tongTienSanGoc += donGia;
                soTranTinhTienGoc++;
            } else if (ds.TrangThai === 'KhongDen') {
                tongCocKhongDen += tienCocTran;
                soTranKhongDen++;
            }

            return `
                <tr>
                    <td style="text-align:center;">${i + 1}</td>
                    <td style="text-align:center; font-family:monospace; font-weight:bold;">#${maVe}</td>
                    <td><strong>${tenSan}</strong><br><small>${cumSan}</small></td>
                    <td style="text-align:center;">${kg}<br><small>${ngayDa}</small></td>
                    <td style="text-align:center;">${statusMap[ds.TrangThai] || ds.TrangThai}</td>
                    <td style="text-align:right;">${donGia.toLocaleString('vi-VN')}đ</td>
                    <td style="text-align:right; color:#047857; font-weight:bold;">${tienCocTran.toLocaleString('vi-VN')}đ</td>
                </tr>
            `;
        }).join('');

        const kmObj = hd.khuyen_mai || hd.khuyenMai || null;
        let soTienGiam = 0;
        if (hd.MaKhuyenMai && kmObj && tongTienSanGoc >= Number(kmObj.GiaTriHoaDonToiThieu || 0)) {
            if (kmObj.LoaiKhuyenMai === 'PhanTram') {
                soTienGiam = Math.round(tongTienSanGoc * (Number(kmObj.GiaTri || 0) / 100));
                if (Number(kmObj.GiaTriToiDa || 0) > 0 && soTienGiam > Number(kmObj.GiaTriToiDa)) {
                    soTienGiam = Number(kmObj.GiaTriToiDa);
                }
            } else {
                soTienGiam = Number(kmObj.GiaTri || 0);
            }
            soTienGiam = Math.min(tongTienSanGoc, soTienGiam);
        }

        const tienSauGiam = Math.max(0, tongTienSanGoc - soTienGiam);
        const thueVAT = Math.floor((tienSauGiam * 0.08) / 1000) * 1000;
        const tongTien = (hd.TrangThai === 'DaHuy')
            ? Number(hd.TongTien ?? 0)
            : (tienSauGiam + thueVAT + tongCocKhongDen);

        const tienCoc = listDatSan
            .filter(d => d.TrangThai !== 'DaHuy')
            .reduce((s, d) => s + Number(d.TienCoc || 0), 0);
        const conLai = (hd.TrangThai === 'DaHuy') ? 0 : Math.max(0, tongTien - tienCoc);

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
                <p>
                    <strong>Khách hàng:</strong> ${tenKhach} &bull; <strong>Số điện thoại:</strong> ${sdtKhach}
                    ${tenGiaiDau ? `<br><strong>Giải đấu:</strong> ${tenGiaiDau} (${listDatSan.length} trận)` : ` &bull; <strong>Tổng số trận:</strong> ${listDatSan.length} trận`}
                </p>
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
                    ${tongTienSanGoc > 0 ? `<div style="display:flex; justify-content:space-between; margin-bottom:6px;"><span>Tổng tiền sân gốc (${soTranTinhTienGoc} trận):</span><strong>${tongTienSanGoc.toLocaleString('vi-VN')}đ</strong></div>` : ''}
                    ${tongCocKhongDen > 0 ? `<div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#64748b;"><span>Tiền cọc trận không đến (${soTranKhongDen} trận):</span><strong>${tongCocKhongDen.toLocaleString('vi-VN')}đ</strong></div>` : ''}
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

    const tongCocStr = Number(tongCoc || 0).toLocaleString('vi-VN') + 'đ';

    if (isMember) {
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 460px; width: 92%; text-align: center; padding: 26px 24px; border-radius: 16px;">
                <div style="font-size: 3.2rem; color: #ef4444; margin-bottom: 10px;"><i class="fa-solid fa-file-circle-xmark"></i></div>
                <h3 style="margin-bottom: 10px; font-size: 1.3rem;">Hủy cả Hóa đơn #${maHoaDon}?</h3>
                <div id="admin-inv-member-alert" class="modal-alert" style="display:none; margin-bottom:12px; text-align:left;"></div>
                <p style="color: #64748b; font-size: 0.92rem; line-height: 1.6; margin-bottom: 22px;">
                    Khách hàng: <strong style="color:#0f172a;">${tenKhach}</strong>.<br>
                    Hệ thống sẽ hủy toàn bộ <strong>${soTran} trận đang đặt cọc</strong> trong hóa đơn này và hoàn trả 100% tiền cọc (${tongCocStr}) vào ví khách hàng.
                </p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button type="button" class="btn-outline" style="flex: 1; padding: 10px;" onclick="document.getElementById('admin-cancel-invoice-modal').style.display='none'">Đóng</button>
                    <button type="button" id="btn-exec-cancel-inv" class="btn-primary" style="flex: 1.3; padding: 10px; background: #ef4444; border-color: #ef4444;" onclick="executeAdminCancelInvoice('${maHoaDon}', false)">Xác nhận Hủy & Hoàn tiền</button>
                </div>
            </div>
        `;
    } else {
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 440px; width: 92%; padding: 24px; text-align: left; border-radius: 16px;">
                <h3 style="margin: 0 0 12px 0; font-size: 1.15rem; color: #0f172a;"><i class="fa-solid fa-user-check" style="color:#ef4444;"></i> Hủy Hóa đơn (#${maHoaDon})</h3>
                <div id="admin-inv-otp-alert" class="modal-alert" style="display:none; margin-bottom:12px;"></div>
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; margin-bottom:14px; font-size:0.88rem; line-height:1.6;">
                    <div>Khách hàng: <strong>${tenKhach}</strong> (${soTran} trận)</div>
                    <div>Email nhận OTP: <strong style="color:#2563eb;">${emailGuest || 'Chưa có'}</strong></div>
                    <div>Tổng tiền cọc hoàn lại: <strong style="color:#ea580c;">${tongCocStr}</strong></div>
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
                    <button type="button" id="btn-exec-cancel-inv" class="btn-primary" style="width:auto; padding:9px 18px; background:#ef4444; border-color:#ef4444;" onclick="executeAdminCancelInvoice('${maHoaDon}', true)">Xác nhận Hủy HĐ</button>
                </div>
            </div>
        `;
    }
    modal.style.display = 'flex';
};

window.executeAdminCancelInvoice = async function(maHoaDon, needOtp = false) {
    let payload = {};

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
            btn.innerHTML = needOtp ? 'Xác nhận Hủy HĐ' : 'Xác nhận Hủy & Hoàn tiền';
        }
    } catch (e) {
        showSystemModal('Lỗi', 'Mất kết nối máy chủ!', 'error');
        btn.disabled = false;
        btn.innerHTML = needOtp ? 'Xác nhận Hủy HĐ' : 'Xác nhận Hủy & Hoàn tiền';
    }
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

// ======================================================
// MODULE: DỜI LỊCH ĐẶT SÂN DÀNH CHO NHÂN VIÊN (REALTIME + CONFIRM MODAL)
// ======================================================
let adminRescheduleState = {
    booking: null,
    clusterId: null,
    clusterName: '',
    gioMoCua: '06:00',
    gioDongCua: '22:00',
    pitches: [],
    khungGios: [],
    giaTiens: [],
    bookedSlots: [],
    selectedPitchId: null,
    selectedDate: null,
    selectedKhungGioId: null,
    selectedPrice: 0,
    minDate: ''
};

function getLocalTodayYmdAdmin() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

window.openAdminRescheduleModal = async function(bookingId) {
    const item = staffDatSanData.find(b => String(b.ID) === String(bookingId) || String(b.MaDatSan) === String(bookingId));
    if (!item) return;

    const clusterId = item.san_bong ? (item.san_bong.MaCumSan || item.san_bong.ID_CumSan) : null;
    const clusterName = item.san_bong?.cum_san?.TenCumSan || (window.currentClusterNameStaff || 'Cơ sở hiện tại');
    const todayYmd = getLocalTodayYmdAdmin();
    const defaultDate = item.NgayDa >= todayYmd ? item.NgayDa : todayYmd;

    adminRescheduleState = {
        booking: item,
        clusterId: clusterId,
        clusterName: clusterName,
        gioMoCua: item.san_bong?.cum_san?.GioMoCua ? item.san_bong.cum_san.GioMoCua.substring(0, 5) : '06:00',
        gioDongCua: item.san_bong?.cum_san?.GioDongCua ? item.san_bong.cum_san.GioDongCua.substring(0, 5) : '22:00',
        pitches: [],
        khungGios: [],
        giaTiens: [],
        bookedSlots: [],
        selectedPitchId: String(item.MaSanBong || item.ID_SanBong || item.san_bong?.ID),
        selectedDate: defaultDate,
        selectedKhungGioId: null,
        selectedPrice: 0,
        minDate: todayYmd
    };

    let modal = document.getElementById('admin-reschedule-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-reschedule-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10020; align-items: center; justify-content: center;';
        modal.onclick = function(e) {
            if (e.target === modal) closeAdminRescheduleModal();
        };
        document.body.appendChild(modal);
    }

    const isTour = Boolean(item.MaGiaiDau || item.ID_GiaiDau);
    const maVeStr = isTour ? `#GD-${item.MaGiaiDau || item.ID_GiaiDau}` : `#PT-${item.ID}`;

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 680px; width: 95%; padding: 0; border-radius: 18px; overflow: hidden; background: #fff; max-height: 90vh; display: flex; flex-direction: column;">
            <div style="padding: 18px 24px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #fff; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800;">
                        <i class="fa-solid fa-calendar-day" style="color: #38bdf8; margin-right: 8px;"></i>Hỗ trợ Dời lịch đặt sân (${maVeStr})
                    </h3>
                    <div style="font-size: 0.82rem; opacity: 0.9; margin-top: 3px;">Cơ sở: <strong>${clusterName}</strong> (Dời sang sân/khung giờ trống trong cùng cụm sân)</div>
                </div>
                <i class="fa-solid fa-xmark" style="cursor: pointer; font-size: 1.25rem; color: #94a3b8;" onclick="closeAdminRescheduleModal()"></i>
            </div>

            <div id="admin-reschedule-body" style="padding: 20px 24px; overflow-y: auto; flex: 1;">
                <div style="text-align: center; padding: 40px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary);"></i><p style="margin-top: 10px; color: var(--text-muted);">Đang tải dữ liệu lịch trống...</p></div>
            </div>

            <div style="padding: 14px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 12px;">
                <button type="button" class="btn-outline" style="width: auto; padding: 10px 22px; border-radius: 10px;" onclick="closeAdminRescheduleModal()">Hủy bỏ</button>
                <button type="button" id="btn-admin-open-reschedule-confirm" class="btn-primary btn-disabled" disabled style="width: auto; padding: 10px 24px; border-radius: 10px; font-weight: 700;" onclick="openAdminRescheduleConfirmModal()">
                    <i class="fa-solid fa-check" style="margin-right: 6px;"></i> Tiếp tục xác nhận
                </button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';

    try {
        const [sbRes, gtRes, kgRes, csRes] = await Promise.all([
            fetch(`${API_BASE_URL}/san-bong?cum_san_id=${clusterId}`),
            fetch(`${API_BASE_URL}/gia-tien?cum_san_id=${clusterId}`),
            fetch(`${API_BASE_URL}/khung-gio`),
            fetch(`${API_BASE_URL}/cum-san/${clusterId}`)
        ]);

        const sbData = await sbRes.json();
        const gtData = await gtRes.json();
        const kgData = await kgRes.json();
        const csData = await csRes.json();

        if (csData.success && csData.data) {
            adminRescheduleState.gioMoCua = csData.data.GioMoCua.substring(0, 5);
            adminRescheduleState.gioDongCua = csData.data.GioDongCua.substring(0, 5);
        }

        adminRescheduleState.pitches = (sbData.data || []).filter(p => p.TrangThai === 'HoatDong');
        adminRescheduleState.giaTiens = gtData.data || [];
        adminRescheduleState.khungGios = kgData.data || [];

        await loadAdminRescheduleBookedSlots(adminRescheduleState.selectedPitchId);
        renderAdminRescheduleBody();
    } catch (e) {
        const bodyEl = document.getElementById('admin-reschedule-body');
        if (bodyEl) bodyEl.innerHTML = `<div style="color:red; text-align:center; padding:30px;">Lỗi tải dữ liệu lịch sân!</div>`;
    }
};

async function loadAdminRescheduleBookedSlots(pitchId) {
    const cacheBuster = new Date().getTime();
    const dsRes = await fetch(`${API_BASE_URL}/dat-san/da-dat?id_san_bong=${pitchId}&_t=${cacheBuster}`);
    const dsJson = await dsRes.json();
    adminRescheduleState.bookedSlots = dsJson.data || [];
}

function renderAdminRescheduleBody() {
    const bodyEl = document.getElementById('admin-reschedule-body');
    if (!bodyEl || !adminRescheduleState.booking) return;

    const item = adminRescheduleState.booking;
    const isTour = Boolean(item.MaGiaiDau || item.ID_GiaiDau);
    const tenKhach = item.ID_NguoiDung ? (item.nguoi_dung?.HoTen || 'Khách hàng') : (item.TenNguoiDat || item.TenKhachVangLai || 'Khách vãng lai');
    const sdtKhach = item.ID_NguoiDung ? (item.nguoi_dung?.SoDienThoai || '') : (item.SDTNguoiDat || item.SDTKhachVangLai || '');
    const oldPitchName = item.san_bong ? item.san_bong.TenSan : 'Sân';
    const oldDateStr = item.NgayDa ? item.NgayDa.split('-').reverse().join('/') : '';
    const oldTimeStr = item.khung_gio ? `${item.khung_gio.GioBatDau.substring(0,5)} - ${item.khung_gio.GioKetThuc.substring(0,5)}` : '';
    const oldPrice = Number(item.TongTien || 0);
    const tienCoc = Number(item.TienCoc || 0);

    const pitchOptionsHtml = adminRescheduleState.pitches.map(p => {
        const pId = String(p.MaSanBong || p.ID);
        const loaiName = p.loaiSan?.TenLoaiSan || p.loai_san?.TenLoaiSan || '';
        const selected = pId === String(adminRescheduleState.selectedPitchId) ? 'selected' : '';
        return `<option value="${pId}" ${selected}>${p.TenSan} (${loaiName})</option>`;
    }).join('');

    const tourNoteHtml = (isTour && item.giai_dau)
        ? `<div style="font-size: 0.76rem; color: #4338ca; margin-top: 4px; font-weight: 600;"><i class="fa-solid fa-trophy"></i> Giải: ${item.giai_dau.TenGiaiDau} (${item.giai_dau.NgayBatDau.split('-').reverse().join('/')} - ${item.giai_dau.NgayKetThuc.split('-').reverse().join('/')})</div>`
        : '';

    bodyEl.innerHTML = `
        <div id="admin-reschedule-alert" class="modal-alert" style="display: none; margin-bottom: 14px;"></div>

        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid #2563eb; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; font-size: 0.88rem;">
            <div style="font-weight: 700; color: #0f172a; margin-bottom: 4px;">Khách hàng: <span style="color:#2563eb;">${tenKhach} (${sdtKhach})</span></div>
            <div style="display: flex; flex-wrap: wrap; gap: 14px; color: #334155;">
                <span>Sân cũ: <strong>${oldPitchName}</strong></span>
                <span>Ngày cũ: <strong>${oldDateStr}</strong></span>
                <span>Giờ cũ: <strong style="color: var(--primary);">${oldTimeStr}</strong></span>
                <span>Giá cũ: <strong>${oldPrice.toLocaleString('vi-VN')}đ</strong></span>
                <span>Đã cọc: <strong style="color: #047857;">${tienCoc.toLocaleString('vi-VN')}đ</strong></span>
            </div>
            ${tourNoteHtml}
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px;">
            <div>
                <label style="font-size: 0.85rem; font-weight: 700; color: #0f172a; display: block; margin-bottom: 6px;">1. Chọn Sân bóng mới (Cùng cơ sở)</label>
                <select class="form-control" style="font-weight: 600; height: 42px;" onchange="handleAdminReschedulePitchChange(this.value)">
                    ${pitchOptionsHtml}
                </select>
            </div>
            <div>
                <label style="font-size: 0.85rem; font-weight: 700; color: #0f172a; display: block; margin-bottom: 6px;">2. Chọn Ngày đá mới</label>
                <input type="date" id="adm-resched-date" class="form-control" style="font-weight: 600; height: 42px;" value="${adminRescheduleState.selectedDate}" min="${adminRescheduleState.minDate}" onchange="handleAdminRescheduleDateChange(this.value)">
            </div>
        </div>

        <div style="margin-bottom: 16px;">
            <label style="font-size: 0.85rem; font-weight: 700; color: #0f172a; display: block; margin-bottom: 8px;">3. Chọn Khung giờ trống (Cập nhật Realtime)</label>
            <div id="adm-resched-slots-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(145px, 1fr)); gap: 10px; max-height: 230px; overflow-y: auto; padding: 4px;"></div>
        </div>

        <div id="adm-resched-price-summary"></div>
    `;

    renderAdminRescheduleSlotsGrid();
    renderAdminReschedulePriceSummary();
}

window.handleAdminReschedulePitchChange = async function(newPitchId) {
    adminRescheduleState.selectedPitchId = String(newPitchId);
    adminRescheduleState.selectedKhungGioId = null;
    adminRescheduleState.selectedPrice = 0;

    const gridEl = document.getElementById('adm-resched-slots-grid');
    if (gridEl) gridEl.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải lịch sân...</div>`;

    await loadAdminRescheduleBookedSlots(newPitchId);
    renderAdminRescheduleSlotsGrid();
    renderAdminReschedulePriceSummary();
};

window.handleAdminRescheduleDateChange = function(newDate) {
    if (!newDate) return;
    if (adminRescheduleState.minDate && newDate < adminRescheduleState.minDate) {
        newDate = adminRescheduleState.minDate;
        document.getElementById('adm-resched-date').value = newDate;
    }
    adminRescheduleState.selectedDate = newDate;
    adminRescheduleState.selectedKhungGioId = null;
    adminRescheduleState.selectedPrice = 0;

    renderAdminRescheduleSlotsGrid();
    renderAdminReschedulePriceSummary();
};

function renderAdminRescheduleSlotsGrid() {
    const gridEl = document.getElementById('adm-resched-slots-grid');
    if (!gridEl || !adminRescheduleState.booking) return;

    const item = adminRescheduleState.booking;
    const pitchObj = adminRescheduleState.pitches.find(p => String(p.MaSanBong || p.ID) === String(adminRescheduleState.selectedPitchId));
    if (!pitchObj) {
        gridEl.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:#64748b; padding:20px;">Không tìm thấy sân.</div>`;
        return;
    }

    const loaiSanId = pitchObj.MaLoaiSan || pitchObj.ID_LoaiSan;
    const validPrices = adminRescheduleState.giaTiens.filter(gt => String(gt.MaLoaiSan || gt.ID_LoaiSan) === String(loaiSanId));
    const moCua = adminRescheduleState.gioMoCua;
    const dongCua = adminRescheduleState.gioDongCua;
    const now = new Date();
    const [y, m, d] = adminRescheduleState.selectedDate.split('-').map(Number);

    const oldPitchId = String(item.MaSanBong || item.ID_SanBong || item.san_bong?.ID);
    const oldKhungGioId = String(item.MaKhungGio || item.ID_KhungGio || item.khung_gio?.ID);
    const oldDate = item.NgayDa;

    let html = '';
    adminRescheduleState.khungGios.forEach(kg => {
        const maKG = String(kg.MaKhungGio || kg.ID);
        const start = kg.GioBatDau.substring(0, 5);
        const end = kg.GioKetThuc.substring(0, 5);
        const priceObj = validPrices.find(p => String(p.MaKhungGio || p.ID_KhungGio) === maKG);

        if (!priceObj || Number(priceObj.SoTien) <= 0 || start < moCua || end > dongCua) {
            return;
        }

        const priceVal = Number(priceObj.SoTien);
        const timeStr = `${start} - ${end}`;
        const [startH, startM] = start.split(':').map(Number);
        const slotDateTime = new Date(y, m - 1, d, startH, startM);
        const isPast = slotDateTime <= now;

        const isCurrentBookingSlot = (
            String(adminRescheduleState.selectedPitchId) === oldPitchId &&
            adminRescheduleState.selectedDate === oldDate &&
            maKG === oldKhungGioId
        );

        const isBookedByOther = !isCurrentBookingSlot && adminRescheduleState.bookedSlots.some(b =>
            String(b.NgayDa).substring(0, 10) === adminRescheduleState.selectedDate &&
            String(b.MaKhungGio || b.ID_KhungGio) === maKG
        );

        const isSelected = String(adminRescheduleState.selectedKhungGioId) === maKG;

        if (isCurrentBookingSlot) {
            html += `
                <div style="padding: 10px 8px; border-radius: 10px; background: #eff6ff; border: 1.5px dashed #60a5fa; color: #1d4ed8; text-align: center; opacity: 0.85; cursor: not-allowed;">
                    <div style="font-weight: 800; font-size: 0.86rem;">${timeStr}</div>
                    <div style="font-size: 0.75rem; font-weight: 700; margin-top: 2px;">Ca hiện tại</div>
                </div>
            `;
        } else if (isPast || isBookedByOther) {
            html += `
                <div style="padding: 10px 8px; border-radius: 10px; background: #e2e8f0; border: 1px solid #cbd5e1; color: #64748b; text-align: center; cursor: not-allowed;">
                    <div style="font-weight: 700; font-size: 0.86rem;">${timeStr}</div>
                    <div style="font-size: 0.75rem; margin-top: 2px;">${isPast ? 'Quá giờ' : 'Đã đặt'}</div>
                </div>
            `;
        } else {
            const boxStyle = isSelected
                ? 'background: var(--primary); border: 2px solid var(--primary); color: #ffffff; box-shadow: 0 4px 10px rgba(22, 163, 74, 0.25);'
                : 'background: #f0fdf4; border: 1.5px solid #86efac; color: #0f172a;';
            const priceColor = isSelected ? '#fde047' : 'var(--primary)';

            html += `
                <div onclick="selectAdminRescheduleSlot('${maKG}', ${priceVal})" style="padding: 10px 8px; border-radius: 10px; text-align: center; cursor: pointer; transition: 0.15s; ${boxStyle}">
                    <div style="font-weight: 800; font-size: 0.86rem;">${timeStr}</div>
                    <div style="font-size: 0.8rem; font-weight: 700; color: ${priceColor}; margin-top: 2px;">${priceVal.toLocaleString('vi-VN')}đ</div>
                </div>
            `;
        }
    });

    gridEl.innerHTML = html || `<div style="grid-column:1/-1; text-align:center; color:#64748b; padding:20px;">Không có khung giờ hoạt động nào.</div>`;

    const btnConfirm = document.getElementById('btn-admin-open-reschedule-confirm');
    if (btnConfirm) {
        if (adminRescheduleState.selectedKhungGioId) {
            btnConfirm.disabled = false;
            btnConfirm.classList.remove('btn-disabled');
        } else {
            btnConfirm.disabled = true;
            btnConfirm.classList.add('btn-disabled');
        }
    }
}

window.selectAdminRescheduleSlot = function(maKhungGio, priceVal) {
    adminRescheduleState.selectedKhungGioId = String(maKhungGio);
    adminRescheduleState.selectedPrice = Number(priceVal);
    renderAdminRescheduleSlotsGrid();
    renderAdminReschedulePriceSummary();
};

function calculateAdminInvoiceAfterReschedule(newSlotPrice) {
    const item = adminRescheduleState.booking;
    const maHD = item.MaHoaDonDatSan;
    const hdObj = item.hoa_don_dat_san || item.hoaDonDatSan || null;
    const invoiceMatches = maHD
        ? staffDatSanData.filter(m => m.MaHoaDonDatSan === maHD)
        : [item];

    let tongTienSanGocMoi = 0;
    let tongCocKhongDen = 0;
    let tongDaCoc = 0;

    invoiceMatches.forEach(m => {
        const isTarget = String(m.ID) === String(item.ID);
        const donGia = isTarget ? Number(newSlotPrice) : Number(m.TongTien || 0);
        const coc = Number(m.TienCoc || 0);

        if (m.TrangThai !== 'DaHuy') {
            tongDaCoc += coc;
        }
        if (m.TrangThai === 'DaCoc' || m.TrangThai === 'HoanThanh') {
            tongTienSanGocMoi += donGia;
        } else if (m.TrangThai === 'KhongDen') {
            tongCocKhongDen += coc;
        }
    });

    const km = hdObj ? (hdObj.khuyen_mai || hdObj.khuyenMai || null) : null;
    let soTienGiam = 0;
    if (hdObj && hdObj.MaKhuyenMai && km && tongTienSanGocMoi >= Number(km.GiaTriHoaDonToiThieu || 0)) {
        if (km.LoaiKhuyenMai === 'PhanTram') {
            soTienGiam = Math.round(tongTienSanGocMoi * (Number(km.GiaTri || 0) / 100));
            if (Number(km.GiaTriToiDa || 0) > 0 && soTienGiam > Number(km.GiaTriToiDa)) {
                soTienGiam = Number(km.GiaTriToiDa);
            }
        } else {
            soTienGiam = Number(km.GiaTri || 0);
        }
        soTienGiam = Math.min(tongTienSanGocMoi, soTienGiam);
    }

    const tienSauGiam = Math.max(0, tongTienSanGocMoi - soTienGiam);
    const thueVATMoi = Math.floor((tienSauGiam * 0.08) / 1000) * 1000;
    const tongHoaDonMoi = tienSauGiam + thueVATMoi + tongCocKhongDen;
    const conThuTaiSanMoi = Math.max(0, tongHoaDonMoi - tongDaCoc);

    return {
        tongTienSanGocMoi,
        soTienGiam,
        thueVATMoi,
        tongHoaDonMoi,
        tongDaCoc,
        conThuTaiSanMoi,
        isInvalidBelowDeposit: tongHoaDonMoi < tongDaCoc
    };
}

function renderAdminReschedulePriceSummary() {
    const summaryEl = document.getElementById('adm-resched-price-summary');
    if (!summaryEl || !adminRescheduleState.booking) return;

    if (!adminRescheduleState.selectedKhungGioId) {
        summaryEl.innerHTML = `
            <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 12px 16px; text-align: center; color: #64748b; font-size: 0.86rem;">
                Vui lòng chọn một khung giờ trống ở trên để xem chi tiết giá và hóa đơn cập nhật.
            </div>
        `;
        return;
    }

    const item = adminRescheduleState.booking;
    const oldPrice = Number(item.TongTien || 0);
    const newPrice = Number(adminRescheduleState.selectedPrice || 0);
    const diff = newPrice - oldPrice;
    const diffStr = diff === 0
        ? '<span style="color:#64748b;">Không đổi (0đ)</span>'
        : (diff > 0
            ? `<span style="color:#ea580c; font-weight:700;">+${diff.toLocaleString('vi-VN')}đ</span>`
            : `<span style="color:#16a34a; font-weight:700;">${diff.toLocaleString('vi-VN')}đ</span>`);

    const calc = calculateAdminInvoiceAfterReschedule(newPrice);

    summaryEl.innerHTML = `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 14px 16px; font-size: 0.88rem;">
            <div style="font-weight: 800; color: #065f46; margin-bottom: 8px;"><i class="fa-solid fa-calculator"></i> Tạm tính Hóa đơn sau khi dời lịch:</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <div>Đơn giá ca mới: <strong>${newPrice.toLocaleString('vi-VN')}đ</strong> (${diffStr})</div>
                <div>Thuế VAT (8% HĐ): <strong>${calc.thueVATMoi.toLocaleString('vi-VN')}đ</strong></div>
                <div>Tổng hóa đơn mới: <strong style="color:#0f172a;">${calc.tongHoaDonMoi.toLocaleString('vi-VN')}đ</strong></div>
                <div>Đã đặt cọc (Giữ nguyên): <strong style="color:#047857;">${calc.tongDaCoc.toLocaleString('vi-VN')}đ</strong></div>
            </div>
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #86efac; display: flex; justify-content: space-between; align-items: center; font-size: 0.95rem;">
                <span style="font-weight: 700; color: #0f172a;">Còn thu tại sân (Đã tính chênh lệch):</span>
                <strong style="color: #ea580c; font-size: 1.08rem;">${calc.conThuTaiSanMoi.toLocaleString('vi-VN')}đ</strong>
            </div>
            ${calc.isInvalidBelowDeposit ? `<div style="margin-top:6px; color:#dc2626; font-weight:700; font-size:0.82rem;"><i class="fa-solid fa-triangle-exclamation"></i> Tổng hóa đơn mới thấp hơn số tiền khách đã cọc!</div>` : ''}
        </div>
    `;
}

window.refreshAdminRescheduleSlotsRealtime = async function() {
    const modal = document.getElementById('admin-reschedule-modal');
    if (!modal || modal.style.display !== 'flex' || !adminRescheduleState.selectedPitchId) return;

    await loadAdminRescheduleBookedSlots(adminRescheduleState.selectedPitchId);

    if (adminRescheduleState.selectedKhungGioId) {
        const isTakenNow = adminRescheduleState.bookedSlots.some(b =>
            String(b.NgayDa).substring(0, 10) === adminRescheduleState.selectedDate &&
            String(b.MaKhungGio || b.ID_KhungGio) === String(adminRescheduleState.selectedKhungGioId)
        );
        if (isTakenNow) {
            adminRescheduleState.selectedKhungGioId = null;
            adminRescheduleState.selectedPrice = 0;
        }
    }

    renderAdminRescheduleSlotsGrid();
    renderAdminReschedulePriceSummary();
};

window.closeAdminRescheduleModal = function() {
    const modal = document.getElementById('admin-reschedule-modal');
    if (modal) modal.style.display = 'none';
};

window.openAdminRescheduleConfirmModal = function() {
    if (!adminRescheduleState.booking || !adminRescheduleState.selectedKhungGioId) return;

    const calc = calculateAdminInvoiceAfterReschedule(adminRescheduleState.selectedPrice);
    if (calc.isInvalidBelowDeposit) {
        const alertBox = document.getElementById('admin-reschedule-alert');
        if (alertBox) {
            alertBox.textContent = 'Tổng tiền hóa đơn sau khi đổi không được nhỏ hơn số tiền khách đã đặt cọc!';
            alertBox.className = 'modal-alert error';
            alertBox.style.display = 'block';
        }
        return;
    }

    const item = adminRescheduleState.booking;
    const oldPitchName = item.san_bong ? item.san_bong.TenSan : 'Sân';
    const oldDateStr = item.NgayDa ? item.NgayDa.split('-').reverse().join('/') : '';
    const oldTimeStr = item.khung_gio ? `${item.khung_gio.GioBatDau.substring(0,5)} - ${item.khung_gio.GioKetThuc.substring(0,5)}` : '';

    const newPitchObj = adminRescheduleState.pitches.find(p => String(p.MaSanBong || p.ID) === String(adminRescheduleState.selectedPitchId));
    const newKgObj = adminRescheduleState.khungGios.find(k => String(k.MaKhungGio || k.ID) === String(adminRescheduleState.selectedKhungGioId));
    const newPitchName = newPitchObj ? newPitchObj.TenSan : 'Sân mới';
    const newDateStr = adminRescheduleState.selectedDate.split('-').reverse().join('/');
    const newTimeStr = newKgObj ? `${newKgObj.GioBatDau.substring(0,5)} - ${newKgObj.GioKetThuc.substring(0,5)}` : '';

    let confirmModal = document.getElementById('admin-reschedule-confirm-modal');
    if (!confirmModal) {
        confirmModal = document.createElement('div');
        confirmModal.id = 'admin-reschedule-confirm-modal';
        confirmModal.className = 'modal-overlay';
        confirmModal.style.cssText = 'display: none; z-index: 10050; align-items: center; justify-content: center;';
        document.body.appendChild(confirmModal);
    }

    confirmModal.innerHTML = `
        <div class="modal-content" style="max-width: 450px; width: 92%; text-align: center; padding: 28px 24px; border-radius: 16px;">
            <div style="font-size: 3.2rem; color: #2563eb; margin-bottom: 12px;"><i class="fa-solid fa-circle-question"></i></div>
            <h3 style="margin-bottom: 10px; font-size: 1.3rem; font-weight: 800; color: #0f172a;">Xác nhận Dời Lịch Đặt Sân?</h3>
            <p style="color: #475569; font-size: 0.9rem; margin-bottom: 14px;">Hệ thống sẽ cập nhật lịch mới và thông báo cho khách hàng:</p>
            
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px 14px; text-align: left; font-size: 0.86rem; line-height: 1.65; margin-bottom: 20px;">
                <div><span style="color:#64748b;">Lịch cũ:</span> <strong>${oldPitchName}</strong> &bull; ${oldTimeStr} (${oldDateStr})</div>
                <div style="color:#059669;"><span style="color:#64748b;">Lịch mới:</span> <strong>${newPitchName} &bull; ${newTimeStr} (${newDateStr})</strong></div>
                <div><span style="color:#64748b;">Đơn giá khung giờ mới:</span> <strong>${adminRescheduleState.selectedPrice.toLocaleString('vi-VN')}đ</strong></div>
                <div style="border-top:1px dashed #cbd5e1; margin-top:6px; padding-top:6px;"><span style="color:#64748b;">Còn thu tại sân (HĐ):</span> <strong style="color:#ea580c;">${calc.conThuTaiSanMoi.toLocaleString('vi-VN')}đ</strong></div>
            </div>

            <div style="display: flex; gap: 12px; justify-content: center;">
                <button type="button" class="btn-outline" style="flex: 1; padding: 10px;" onclick="document.getElementById('admin-reschedule-confirm-modal').style.display='none'">Quay lại</button>
                <button type="button" id="btn-exec-admin-reschedule" class="btn-primary" style="flex: 1.3; padding: 10px; background: #2563eb; border-color: #2563eb;" onclick="executeAdminReschedule()">Đồng ý dời lịch</button>
            </div>
        </div>
    `;

    confirmModal.style.display = 'flex';
};

window.executeAdminReschedule = async function() {
    const item = adminRescheduleState.booking;
    if (!item) return;

    const btn = document.getElementById('btn-exec-admin-reschedule');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    }

    try {
        const res = await fetch(`${API_BASE_URL}/admin/dat-san/${item.ID}/doi-lich`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ma_san_bong_moi: adminRescheduleState.selectedPitchId,
                ma_khung_gio_moi: adminRescheduleState.selectedKhungGioId,
                ngay_da_moi: adminRescheduleState.selectedDate
            })
        });

        const data = await res.json();
        document.getElementById('admin-reschedule-confirm-modal').style.display = 'none';

        if (res.ok && data.success) {
            closeAdminRescheduleModal();
            showSystemModal('Thành công', data.message, 'success');
            if (typeof loadStaffDanhSachDatSan === 'function' && document.getElementById('staff-datsan-table-body')) {
                loadStaffDanhSachDatSan();
            }
        } else {
            const alertBox = document.getElementById('admin-reschedule-alert');
            if (alertBox) {
                alertBox.textContent = data.message || 'Không thể dời lịch!';
                alertBox.className = 'modal-alert error';
                alertBox.style.display = 'block';
            }
            await refreshAdminRescheduleSlotsRealtime();
        }
    } catch (e) {
        document.getElementById('admin-reschedule-confirm-modal').style.display = 'none';
        showSystemModal('Lỗi', 'Mất kết nối máy chủ!', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Đồng ý dời lịch';
        }
    }
};

// ======================================================
// MODULE: LỊCH TRÌNH TIMELINE GIẢI ĐẤU (GANTT TIMELINE CHO QUẢN LÝ SÂN & NHÂN VIÊN)
// ======================================================
let clusterTournamentTimelineState = {
    containerId: '',
    rawList: [],
    startDateYmd: '',
    rangeDays: 14,          // 14 ngày hoặc 30 ngày
    statusFilter: 'ACTIVE', // 'ALL' | 'ACTIVE' (Đang & Sắp diễn ra) | 'ONGOING' | 'UPCOMING' | 'BOOKED' | 'WAITING'
    pitchFilter: 'ALL',     // 'ALL' hoặc MaSanBong
    dayModeFilter: 'ALL',   // 'ALL' (Tất cả các ngày) | 'WEEKEND' (Chỉ hiện giải có lịch cuối tuần T7-CN)
    searchKeyword: ''
};

const TOURNAMENT_PALETTES = [
    { bg: '#10b981', light: '#ecfdf5', border: '#6ee7b7', text: '#065f46', badgeBg: '#d1fae5' }, // Emerald
    { bg: '#3b82f6', light: '#eff6ff', border: '#93c5fd', text: '#1e40af', badgeBg: '#dbeafe' }, // Royal Blue
    { bg: '#f59e0b', light: '#fffbeb', border: '#fcd34d', text: '#92400e', badgeBg: '#fef3c7' }, // Amber
    { bg: '#8b5cf6', light: '#f5f3ff', border: '#c4b5fd', text: '#5b21b6', badgeBg: '#ede9fe' }, // Violet
    { bg: '#ec4899', light: '#fdf2f8', border: '#f9a8d4', text: '#9d174d', badgeBg: '#fce7f3' }, // Rose
    { bg: '#06b6d4', light: '#ecfeff', border: '#67e8f9', text: '#155e75', badgeBg: '#cffafe' }  // Cyan
];

function getLocalTodayYmdTimeline() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

window.initAndRenderTournamentTimeline = function(containerId, tournamentsData) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;

    clusterTournamentTimelineState.containerId = containerId;
    clusterTournamentTimelineState.rawList = Array.isArray(tournamentsData) ? tournamentsData : [];

    if (!clusterTournamentTimelineState.startDateYmd) {
        // Mặc định lùi 1 ngày so với hôm nay để dễ nhìn bối cảnh giải đang diễn ra
        const d = new Date();
        d.setDate(d.getDate() - 1);
        const pad = n => n < 10 ? '0' + n : n;
        clusterTournamentTimelineState.startDateYmd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    renderTournamentTimelinePanel();
};

window.shiftTournamentTimelineDays = function(offset) {
    if (offset === 0) {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        const pad = n => n < 10 ? '0' + n : n;
        clusterTournamentTimelineState.startDateYmd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    } else {
        const base = new Date(clusterTournamentTimelineState.startDateYmd + 'T00:00:00');
        base.setDate(base.getDate() + offset);
        const pad = n => n < 10 ? '0' + n : n;
        clusterTournamentTimelineState.startDateYmd = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
    }
    renderTournamentTimelineGridOnly();
};

window.handleTournamentTimelineFilterChange = function(field, value) {
    clusterTournamentTimelineState[field] = value;
    renderTournamentTimelineGridOnly();
};

function renderTournamentTimelinePanel() {
    const wrap = document.getElementById(clusterTournamentTimelineState.containerId);
    if (!wrap) return;

    // Tổng hợp danh sách tất cả các Sân con có xuất hiện trong các giải đấu để đưa vào Bộ lọc Sân
    const pitchMap = {};
    clusterTournamentTimelineState.rawList.forEach(gd => {
        if (gd.cac_san_su_dung) {
            Object.entries(gd.cac_san_su_dung).forEach(([maSan, tenSan]) => {
                pitchMap[maSan] = tenSan;
            });
        }
    });

    const pitchOptionsHtml = Object.entries(pitchMap).map(([ma, ten]) =>
        `<option value="${ma}" ${clusterTournamentTimelineState.pitchFilter === ma ? 'selected' : ''}>${ten}</option>`
    ).join('');

    // Style chuẩn cho các thẻ <select> và <input> trên thanh bộ lọc để không bị cắt chân chữ (g, y, p) và không bị che chữ bên phải
    const filterSelectStyle = `height: 38px; padding: 0 32px 0 12px; line-height: 1.4; font-size: 0.85rem; font-weight: 600; color: #1e293b; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box; cursor: pointer; width: auto;`;

    wrap.innerHTML = `
        <div class="panel" style="border-top: 4px solid #0d8a5e; overflow: hidden;">
            <!-- Header & Thanh điều hướng thời gian -->
            <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; padding: 18px 22px; background: #ffffff; border-bottom: 1px solid #e2e8f0;">
                <div>
                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <span style="width: 34px; height: 34px; border-radius: 9px; background: #ecfdf5; color: #059669; display: inline-flex; align-items: center; justify-content: center; font-size: 1rem;">
                            <i class="fa-solid fa-trophy"></i>
                        </span>
                        <div>
                            <h3 style="margin: 0; font-size: 1.08rem; font-weight: 700; color: #0f172a;">Lịch trình Giải đấu tại Cơ sở (Gantt Timeline)</h3>
                            <p style="margin: 2px 0 0 0; font-size: 0.82rem; color: #64748b; font-weight: 400;">
                                Theo dõi trực quan các giải đấu diễn ra liên tục, cách ngày hoặc đá cuối tuần. Nhấp vào từng thanh giải đấu để xem chi tiết ca đá.
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Điều hướng thời gian -->
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; background: #f8fafc; padding: 6px 10px; border-radius: 10px; border: 1px solid #e2e8f0;">
                    <button type="button" class="btn-outline-sm" style="height: 36px; padding: 0 12px; display: inline-flex; align-items: center; gap: 5px; background: #fff; font-size: 0.84rem;" onclick="shiftTournamentTimelineDays(-7)" title="Lùi 7 ngày">
                        <i class="fa-solid fa-chevron-left"></i> 7 ngày
                    </button>
                    <button type="button" class="btn-outline-sm" style="height: 36px; padding: 0 14px; display: inline-flex; align-items: center; background: #fff; color: var(--primary); border-color: #86efac; font-weight: 700; font-size: 0.84rem;" onclick="shiftTournamentTimelineDays(0)">
                        Hôm nay
                    </button>
                    <input type="date" id="tl-start-date-picker" class="form-control" style="width: 150px; height: 36px; padding: 0 10px; line-height: 1.4; font-size: 0.84rem; font-weight: 600; background: #fff; box-sizing: border-box;" value="${clusterTournamentTimelineState.startDateYmd}" onchange="handleTournamentTimelineFilterChange('startDateYmd', this.value)">
                    <button type="button" class="btn-outline-sm" style="height: 36px; padding: 0 12px; display: inline-flex; align-items: center; gap: 5px; background: #fff; font-size: 0.84rem;" onclick="shiftTournamentTimelineDays(7)" title="Tiến 7 ngày">
                        7 ngày <i class="fa-solid fa-chevron-right"></i>
                    </button>
                    <select class="form-control" style="${filterSelectStyle} height: 36px; min-width: 148px;" onchange="handleTournamentTimelineFilterChange('rangeDays', Number(this.value))">
                        <option value="14" ${clusterTournamentTimelineState.rangeDays === 14 ? 'selected' : ''}>Khung 14 ngày</option>
                        <option value="21" ${clusterTournamentTimelineState.rangeDays === 21 ? 'selected' : ''}>Khung 21 ngày</option>
                        <option value="30" ${clusterTournamentTimelineState.rangeDays === 30 ? 'selected' : ''}>Khung 30 ngày</option>
                    </select>
                </div>
            </div>

            <!-- Thanh Bộ lọc đa năng (Đã bỏ icon ở các lựa chọn và bỏ mục Sắp khai mạc) -->
            <div style="padding: 14px 22px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex: 1;">
                    <!-- 1. Tìm kiếm tên giải / khách / SĐT -->
                    <div style="position: relative; min-width: 240px; flex: 1; max-width: 290px;">
                        <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 0.85rem;"></i>
                        <input type="text" class="form-control" style="width: 100%; height: 38px; padding: 0 12px 0 34px; line-height: 1.4; font-size: 0.85rem; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;" placeholder="Tìm tên giải, mã #GD, tên khách, SĐT..." value="${clusterTournamentTimelineState.searchKeyword}" oninput="handleTournamentTimelineFilterChange('searchKeyword', this.value)">
                    </div>

                    <!-- 2. Lọc theo Trạng thái tiến độ -->
                    <select class="form-control" style="${filterSelectStyle} min-width: 215px;" onchange="handleTournamentTimelineFilterChange('statusFilter', this.value)">
                        <option value="ACTIVE" ${clusterTournamentTimelineState.statusFilter === 'ACTIVE' ? 'selected' : ''}>Đang & Sắp diễn ra</option>
                        <option value="ALL" ${clusterTournamentTimelineState.statusFilter === 'ALL' ? 'selected' : ''}>Tất cả giải đấu</option>
                        <option value="ONGOING" ${clusterTournamentTimelineState.statusFilter === 'ONGOING' ? 'selected' : ''}>Đang diễn ra</option>
                        <option value="BOOKED" ${clusterTournamentTimelineState.statusFilter === 'BOOKED' ? 'selected' : ''}>Đã đặt lịch sân (Đã cọc)</option>
                        <option value="WAITING" ${clusterTournamentTimelineState.statusFilter === 'WAITING' ? 'selected' : ''}>Chờ duyệt / Chờ đặt lịch</option>
                    </select>

                    <!-- 3. Lọc theo Sân con tham gia -->
                    <select class="form-control" style="${filterSelectStyle} min-width: 165px;" onchange="handleTournamentTimelineFilterChange('pitchFilter', this.value)">
                        <option value="ALL">Tất cả sân con</option>
                        ${pitchOptionsHtml}
                    </select>

                    <!-- 4. Lọc theo kiểu lịch đá -->
                    <select class="form-control" style="${filterSelectStyle} min-width: 235px;" onchange="handleTournamentTimelineFilterChange('dayModeFilter', this.value)">
                        <option value="ALL" ${clusterTournamentTimelineState.dayModeFilter === 'ALL' ? 'selected' : ''}>Mọi kiểu lịch thi đấu</option>
                        <option value="WEEKEND" ${clusterTournamentTimelineState.dayModeFilter === 'WEEKEND' ? 'selected' : ''}>Giải có đá Cuối tuần (T7/CN)</option>
                        <option value="INTERMITTENT" ${clusterTournamentTimelineState.dayModeFilter === 'INTERMITTENT' ? 'selected' : ''}>Giải đá cách ngày / ngắt quãng</option>
                        <option value="CONTINUOUS" ${clusterTournamentTimelineState.dayModeFilter === 'CONTINUOUS' ? 'selected' : ''}>Giải đá liên tục (Không nghỉ)</option>
                    </select>
                </div>

                <!-- Chú thích ký hiệu (Legend) -->
                <div style="display: flex; align-items: center; gap: 14px; font-size: 0.78rem; color: #475569; flex-wrap: wrap;">
                    <span style="display: inline-flex; align-items: center; gap: 6px;">
                        <span style="width: 18px; height: 10px; border-radius: 99px; background: #10b981; display: inline-block;"></span>
                        <strong>Ngày có trận thi đấu</strong>
                    </span>
                    <span style="display: inline-flex; align-items: center; gap: 6px;">
                        <span style="width: 22px; height: 6px; border-radius: 99px; background: #e2e8f0; border: 1px dashed #64748b; display: inline-block;"></span>
                        <span>Ngày nghỉ giữa giải (Cách ngày)</span>
                    </span>
                    <span style="display: inline-flex; align-items: center; gap: 6px;">
                        <span style="width: 18px; height: 10px; border-radius: 99px; background: repeating-linear-gradient(45deg, #fef3c7, #fef3c7 4px, #fde68a 4px, #fde68a 8px); border: 1px solid #f59e0b; display: inline-block;"></span>
                        <span>Chờ khách đặt khung giờ</span>
                    </span>
                </div>
            </div>

            <!-- Lưới Gantt Chart Timeline -->
            <div id="tournament-gantt-grid-container"></div>
        </div>
    `;

    renderTournamentTimelineGridOnly();
}

function renderTournamentTimelineGridOnly() {
    const gridContainer = document.getElementById('tournament-gantt-grid-container');
    if (!gridContainer) return;

    const picker = document.getElementById('tl-start-date-picker');
    if (picker && picker.value !== clusterTournamentTimelineState.startDateYmd) {
        picker.value = clusterTournamentTimelineState.startDateYmd;
    }

    const todayYmd = getLocalTodayYmdTimeline();
    const rangeDays = clusterTournamentTimelineState.rangeDays || 14;
    const baseDate = new Date(clusterTournamentTimelineState.startDateYmd + 'T00:00:00');
    const pad = n => n < 10 ? '0' + n : n;

    // 1. Tạo mảng cột ngày trên trục ngang
    const dateCols = [];
    for (let i = 0; i < rangeDays; i++) {
        const d = new Date(baseDate);
        d.setDate(baseDate.getDate() + i);
        const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const dayOfWeek = d.getDay(); // 0: CN, 6: T7
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        const isToday = (ymd === todayYmd);

        dateCols.push({
            index: i,
            ymd: ymd,
            ddmm: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
            dayLabel: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dayOfWeek],
            isWeekend: isWeekend,
            isToday: isToday
        });
    }

    const windowStartYmd = dateCols[0].ymd;
    const windowEndYmd = dateCols[dateCols.length - 1].ymd;

    // 2. Lọc danh sách giải đấu theo 4 Bộ lọc + Giao thoa với khung thời gian đang xem
    const kw = clusterTournamentTimelineState.searchKeyword.toLowerCase().trim();
    const stFilter = clusterTournamentTimelineState.statusFilter;
    const pFilter = clusterTournamentTimelineState.pitchFilter;
    const modeFilter = clusterTournamentTimelineState.dayModeFilter;

    const filteredTournaments = clusterTournamentTimelineState.rawList.filter(gd => {
        // Giao thoa với cửa sổ ngày đang xem
        const isOverlappingWindow = (gd.ngay_ket_thuc >= windowStartYmd && gd.ngay_bat_dau <= windowEndYmd);
        if (!isOverlappingWindow) return false;

        // Lọc từ khóa
        if (kw !== '') {
            const matchText =
                String(gd.ten_giai_dau || '').toLowerCase().includes(kw) ||
                String(gd.ma_giai_dau || '').toLowerCase().includes(kw) ||
                (`gd-${gd.ma_giai_dau}`).toLowerCase().includes(kw) ||
                String(gd.khach_hang || '').toLowerCase().includes(kw) ||
                String(gd.so_dien_thoai || '').toLowerCase().includes(kw);
            if (!matchText) return false;
        }

        // Phân loại trạng thái thực tế
        const isOngoing = (gd.ngay_bat_dau <= todayYmd && gd.ngay_ket_thuc >= todayYmd && gd.trang_thai_giai !== 'HoanThanh');
        const isFinished = (gd.ngay_ket_thuc < todayYmd || gd.trang_thai_giai === 'HoanThanh');

        if (stFilter === 'ACTIVE' && isFinished) return false;
        if (stFilter === 'ONGOING' && !isOngoing) return false;
        if (stFilter === 'BOOKED' && !gd.da_dat_san) return false;
        if (stFilter === 'WAITING' && gd.da_dat_san) return false;

        // Lọc theo sân con
        if (pFilter !== 'ALL') {
            if (!gd.cac_san_su_dung || !gd.cac_san_su_dung[pFilter]) return false;
        }

        // Lọc theo kiểu lịch đá (Cuối tuần / Ngắt quãng / Liên tục)
        const matchDates = Object.keys(gd.ngay_co_tran || {}).sort();

        // Kiểm tra xem giữa các ngày thực tế có trận có tồn tại khoảng trống (cách ngày > 1 ngày) hay không
        let hasGapBetweenMatchDays = false;
        for (let i = 1; i < matchDates.length; i++) {
            const prevDate = new Date(matchDates[i - 1] + 'T00:00:00');
            const currDate = new Date(matchDates[i] + 'T00:00:00');
            const diffDays = Math.round((currDate - prevDate) / 86400000);
            if (diffDays > 1) {
                hasGapBetweenMatchDays = true;
                break;
            }
        }

        if (modeFilter === 'WEEKEND') {
            const hasWeekendMatch = matchDates.some(dStr => {
                const dayNum = new Date(dStr + 'T00:00:00').getDay();
                return dayNum === 0 || dayNum === 6;
            });
            const spanHasWeekend = !gd.da_dat_san && dateCols.some(c => c.isWeekend && c.ymd >= gd.ngay_bat_dau && c.ymd <= gd.ngay_ket_thuc);
            if (!hasWeekendMatch && !spanHasWeekend) return false;
        } else if (modeFilter === 'INTERMITTENT') {
            // Chỉ lấy giải đã đặt lịch và có ít nhất 2 ngày thi đấu bị ngắt quãng (cách nhau >= 2 ngày)
            if (!gd.da_dat_san || matchDates.length < 2 || !hasGapBetweenMatchDays) return false;
        } else if (modeFilter === 'CONTINUOUS') {
            // Chỉ lấy giải đã đặt lịch mà các ngày thi đấu liền mạch hoàn toàn (không có ngày nghỉ ở giữa)
            if (!gd.da_dat_san || matchDates.length === 0 || hasGapBetweenMatchDays) return false;
        }

        return true;
    });

    if (filteredTournaments.length === 0) {
        gridContainer.innerHTML = `
            <div style="padding: 45px 20px; text-align: center; color: #64748b; background: #ffffff;">
                <i class="fa-regular fa-calendar-xmark" style="font-size: 2.4rem; color: #cbd5e1; margin-bottom: 10px; display: block;"></i>
                <div style="font-weight: 700; color: #334155; font-size: 0.96rem; margin-bottom: 4px;">Không có giải đấu nào trong khoảng thời gian / bộ lọc này</div>
                <div style="font-size: 0.84rem;">Bạn có thể bấm nút <strong>7 ngày</strong> tiếp theo hoặc đổi bộ lọc sang <strong>Tất cả giải đấu</strong> để kiểm tra.</div>
            </div>
        `;
        return;
    }

    const colMinWidth = rangeDays <= 14 ? 64 : 50;

    // 3. Vẽ Header các cột ngày + Cột cố định Thông tin giải đấu bên trái
    let html = `
        <div style="width: 100%; overflow-x: auto; overflow-y: auto; max-height: 460px; position: relative; background: #ffffff;">
            <div style="min-width: ${300 + rangeDays * colMinWidth}px; position: relative;">
                
                <!-- HÀNG TIÊU ĐỀ NGÀY (STICKY TOP) -->
                <div style="display: grid; grid-template-columns: 300px repeat(${rangeDays}, minmax(${colMinWidth}px, 1fr)); position: sticky; top: 0; z-index: 15; background: #f8fafc; border-bottom: 2px solid #cbd5e1;">
                    <div style="position: sticky; left: 0; z-index: 20; background: #f1f5f9; padding: 12px 16px; font-size: 0.78rem; font-weight: 800; color: #334155; text-transform: uppercase; letter-spacing: 0.04em; border-right: 2px solid #cbd5e1; display: flex; align-items: center; justify-content: space-between;">
                        <span>THÔNG TIN GIẢI ĐẤU (${filteredTournaments.length})</span>
                        <span style="font-size: 0.72rem; color: #64748b; font-weight: 600;">Mã / Khách</span>
                    </div>
                    ${dateCols.map(col => {
                        let thBg = col.isWeekend ? '#fffbeb' : '#f8fafc';
                        let dayColor = col.isWeekend ? '#d97706' : '#64748b';
                        let dateColor = '#0f172a';
                        let topBadge = '';

                        if (col.isToday) {
                            thBg = '#ecfdf5';
                            dayColor = '#059669';
                            dateColor = '#059669';
                            topBadge = `<span style="display: block; font-size: 0.62rem; background: #10b981; color: #fff; border-radius: 4px; padding: 1px 4px; margin-bottom: 2px; font-weight: 800;">HÔM NAY</span>`;
                        }

                        return `
                            <div style="background: ${thBg}; border-right: 1px solid #e2e8f0; padding: 8px 4px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; ${col.isToday ? 'border-bottom: 3px solid #10b981;' : ''}">
                                ${topBadge}
                                <span style="font-size: 0.73rem; font-weight: 700; color: ${dayColor};">${col.dayLabel}</span>
                                <span style="font-size: 0.84rem; font-weight: 800; color: ${dateColor}; margin-top: 1px;">${col.ddmm}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
    `;

    // 4. Vẽ từng Hàng Giải đấu
    filteredTournaments.forEach((gd, rowIdx) => {
        const palette = TOURNAMENT_PALETTES[rowIdx % TOURNAMENT_PALETTES.length];
        const startFmt = gd.ngay_bat_dau.split('-').reverse().slice(0, 2).join('/');
        const endFmt = gd.ngay_ket_thuc.split('-').reverse().slice(0, 2).join('/');
        const sanNames = Object.values(gd.cac_san_su_dung || {});
        const sanText = sanNames.length > 0 ? sanNames.join(', ') : 'Chưa chọn sân con';

        // Badge trạng thái của giải
        let statusTag = '';
        if (gd.trang_thai_giai === 'ChoDuyet') {
            statusTag = `<span style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:2px 7px; border-radius:99px; font-size:0.7rem; font-weight:700; white-space:nowrap;">Chờ duyệt</span>`;
        } else if (!gd.da_dat_san) {
            statusTag = `<span style="background:#fff7ed; color:#ea580c; border:1px solid #fed7aa; padding:2px 7px; border-radius:99px; font-size:0.7rem; font-weight:700; white-space:nowrap;">Chờ đặt lịch</span>`;
        } else if (gd.ngay_bat_dau <= todayYmd && gd.ngay_ket_thuc >= todayYmd) {
            statusTag = `<span style="background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:2px 7px; border-radius:99px; font-size:0.7rem; font-weight:700; white-space:nowrap;">Đang diễn ra</span>`;
        } else if (gd.ngay_bat_dau > todayYmd) {
            statusTag = `<span style="background:#dbeafe; color:#1d4ed8; border:1px solid #93c5fd; padding:2px 7px; border-radius:99px; font-size:0.7rem; font-weight:700; white-space:nowrap;">Sắp diễn ra</span>`;
        } else {
            statusTag = `<span style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:2px 7px; border-radius:99px; font-size:0.7rem; font-weight:700; white-space:nowrap;">Đã kết thúc</span>`;
        }

        const spanStartIdx = dateCols.findIndex(c => c.ymd >= gd.ngay_bat_dau);
        let spanEndIdx = -1;
        for (let i = dateCols.length - 1; i >= 0; i--) {
            if (dateCols[i].ymd <= gd.ngay_ket_thuc) {
                spanEndIdx = i;
                break;
            }
        }

        // Gom các ngày có trận đấu thực tế liền kề nhau thành các Thanh phân đoạn (Contiguous Segments)
        const segments = [];
        if (gd.da_dat_san) {
            let currentSeg = null;
            dateCols.forEach((col, idx) => {
                let dayInfo = gd.ngay_co_tran ? gd.ngay_co_tran[col.ymd] : null;
                if (dayInfo && pFilter !== 'ALL') {
                    const filteredMatches = (dayInfo.ds_tran || []).filter(t => String(t.ma_san_bong) === String(pFilter));
                    dayInfo = filteredMatches.length > 0
                        ? { ...dayInfo, so_tran: filteredMatches.length, ds_tran: filteredMatches }
                        : null;
                }

                if (dayInfo) {
                    if (!currentSeg) {
                        currentSeg = { startIdx: idx, endIdx: idx, totalMatches: dayInfo.so_tran, daysCount: 1 };
                    } else {
                        currentSeg.endIdx = idx;
                        currentSeg.totalMatches += dayInfo.so_tran;
                        currentSeg.daysCount++;
                    }
                } else {
                    if (currentSeg) {
                        segments.push(currentSeg);
                        currentSeg = null;
                    }
                }
            });
            if (currentSeg) segments.push(currentSeg);
        }

        let spanTrackHtml = '';
        if (spanStartIdx !== -1 && spanEndIdx !== -1 && spanEndIdx >= spanStartIdx) {
            const leftPct = (spanStartIdx / rangeDays) * 100;
            const widthPct = ((spanEndIdx - spanStartIdx + 1) / rangeDays) * 100;

            if (gd.da_dat_san) {
                spanTrackHtml = `
                    <div onclick="openTournamentTimelineDetailModal('${gd.ma_giai_dau}')"
                         title="${gd.ten_giai_dau} (${startFmt} - ${endFmt}): Đường nối các ngày diễn ra giải"
                         style="position: absolute; left: calc(${leftPct}% + 4px); width: calc(${widthPct}% - 8px); top: 50%; transform: translateY(-50%); height: 12px; background: ${palette.light}; border: 1.5px dashed ${palette.border}; border-radius: 999px; z-index: 2; cursor: pointer;">
                    </div>
                `;
            } else {
                spanTrackHtml = `
                    <div onclick="openTournamentTimelineDetailModal('${gd.ma_giai_dau}')"
                         title="${gd.ten_giai_dau} (${startFmt} - ${endFmt}) - Chưa chọn khung giờ đặt sân"
                         style="position: absolute; left: calc(${leftPct}% + 4px); width: calc(${widthPct}% - 8px); top: 50%; transform: translateY(-50%); height: 30px; background: repeating-linear-gradient(45deg, #fffbeb, #fffbeb 6px, #fef3c7 6px, #fef3c7 12px); border: 1.5px dashed #f59e0b; border-radius: 999px; z-index: 3; display: flex; align-items: center; justify-content: center; padding: 0 12px; color: #b45309; font-size: 0.76rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; box-shadow: 0 2px 4px rgba(245, 158, 11, 0.1);">
                        <i class="fa-solid fa-clock" style="margin-right: 5px;"></i> ${gd.ten_giai_dau} (${startFmt} - ${endFmt} &bull; Chờ đặt lịch sân)
                    </div>
                `;
            }
        }

        const segmentsHtml = segments.map(seg => {
            const leftPct = (seg.startIdx / rangeDays) * 100;
            const widthPct = ((seg.endIdx - seg.startIdx + 1) / rangeDays) * 100;
            const segLabel = seg.daysCount > 1
                ? `${gd.ten_giai_dau} (${seg.totalMatches} trận)`
                : `${seg.totalMatches} trận`;

            return `
                <div onclick="openTournamentTimelineDetailModal('${gd.ma_giai_dau}')"
                     title="Bấm để xem chi tiết: ${gd.ten_giai_dau} — ${seg.totalMatches} trận (${sanText})"
                     style="position: absolute; left: calc(${leftPct}% + 4px); width: calc(${widthPct}% - 8px); top: 50%; transform: translateY(-50%); height: 32px; background: ${palette.bg}; color: #ffffff; border-radius: 999px; z-index: 4; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 0 10px; font-size: 0.78rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; box-shadow: 0 3px 8px rgba(15, 23, 42, 0.14); transition: transform 0.15s ease, filter 0.15s ease;"
                     onmouseover="this.style.filter='brightness(1.08)'; this.style.transform='translateY(-50%) scale(1.01)';"
                     onmouseout="this.style.filter='brightness(1)'; this.style.transform='translateY(-50%) scale(1)';">
                    <i class="fa-solid fa-futbol" style="font-size: 0.72rem; opacity: 0.9;"></i>
                    <span style="overflow: hidden; text-overflow: ellipsis;">${segLabel}</span>
                </div>
            `;
        }).join('');

        html += `
            <div style="display: grid; grid-template-columns: 300px 1fr; border-bottom: 1px solid #f1f5f9; min-height: 68px; background: #ffffff; transition: background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'">
                <!-- Cột Trái Cố Định -->
                <div onclick="openTournamentTimelineDetailModal('${gd.ma_giai_dau}')" style="position: sticky; left: 0; z-index: 10; background: inherit; padding: 10px 16px; border-right: 2px solid #cbd5e1; border-left: 4px solid ${palette.bg}; cursor: pointer; display: flex; flex-direction: column; justify-content: center; gap: 4px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                        <div style="font-weight: 700; color: #0f172a; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${gd.ten_giai_dau}">
                            ${gd.ten_giai_dau}
                        </div>
                        ${statusTag}
                    </div>
                    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.76rem; color: #64748b; gap: 6px;">
                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="Trưởng giải: ${gd.khach_hang} (${gd.so_dien_thoai})">
                            <i class="fa-regular fa-user" style="color: ${palette.bg};"></i> ${gd.khach_hang} (${gd.so_dien_thoai})
                        </span>
                        <span style="font-family: monospace; font-weight: 700; color: #475569; background: #f1f5f9; padding: 1px 6px; border-radius: 4px; flex-shrink: 0;">#GD-${gd.ma_giai_dau}</span>
                    </div>
                    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.74rem; color: #475569;">
                        <span><i class="fa-regular fa-calendar" style="color: ${palette.bg};"></i> ${startFmt} &rarr; ${endFmt}</span>
                        <span style="font-weight: 700; color: ${palette.text};">${gd.tong_so_tran} trận (${sanNames.length > 0 ? sanNames.join(', ') : 'Chưa đặt'})</span>
                    </div>
                </div>

                <!-- Cột Phải: Vùng Lưới Ngày & Thanh Gantt Bar -->
                <div style="position: relative; display: grid; grid-template-columns: repeat(${rangeDays}, minmax(${colMinWidth}px, 1fr));">
                    ${dateCols.map(col => {
                        let cellBg = col.isWeekend ? 'rgba(254, 243, 199, 0.28)' : 'transparent';
                        if (col.isToday) cellBg = 'rgba(16, 185, 129, 0.08)';
                        return `<div style="border-right: 1px solid #f1f5f9; background: ${cellBg}; height: 100%; position: relative;">
                            ${col.isToday ? `<div style="position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; background: rgba(16, 185, 129, 0.35); transform: translateX(-50%); pointer-events: none;"></div>` : ''}
                        </div>`;
                    }).join('')}
                    ${spanTrackHtml}
                    ${segmentsHtml}
                </div>
            </div>
        `;
    });

    html += `
            </div>
        </div>
    `;

    gridContainer.innerHTML = html;
}

// Modal hiển thị chi tiết toàn bộ thông tin & các ca đá của Giải đấu khi click vào thanh Timeline
window.openTournamentTimelineDetailModal = function(maGiaiDau) {
    const gd = clusterTournamentTimelineState.rawList.find(item => String(item.ma_giai_dau) === String(maGiaiDau));
    if (!gd) return;

    let modal = document.getElementById('tournament-timeline-detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'tournament-timeline-detail-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10020; align-items: center; justify-content: center;';
        modal.onclick = function(e) {
            if (e.target === modal) modal.style.display = 'none';
        };
        document.body.appendChild(modal);
    }

    const startFmt = gd.ngay_bat_dau.split('-').reverse().join('/');
    const endFmt = gd.ngay_ket_thuc.split('-').reverse().join('/');
    const sanNames = Object.values(gd.cac_san_su_dung || {});
    const matchDays = Object.values(gd.ngay_co_tran || {});

    let scheduleRowsHtml = '';
    if (matchDays.length === 0) {
        scheduleRowsHtml = `
            <div style="padding: 30px 20px; text-align: center; background: #fffbeb; border: 1px dashed #fcd34d; border-radius: 10px; color: #b45309; font-size: 0.88rem;">
                <i class="fa-solid fa-clock-rotate-left" style="font-size: 1.6rem; margin-bottom: 8px; display: block;"></i>
                Giải đấu này hiện chưa có khung giờ đặt sân cụ thể (Đang chờ duyệt hoặc chờ khách chọn khung giờ).
            </div>
        `;
    } else {
        scheduleRowsHtml = matchDays.map(dayObj => {
            const dParts = dayObj.ngay_da.split('-');
            const dObj = new Date(dayObj.ngay_da + 'T00:00:00');
            const thuStr = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][dObj.getDay()];
            const ngayFmt = `${dParts[2]}/${dParts[1]}/${dParts[0]}`;

            const slotsBadges = (dayObj.ds_tran || []).map(t => {
                const stColor = t.trang_thai === 'HoanThanh' ? '#047857' : '#1d4ed8';
                const stBg = t.trang_thai === 'HoanThanh' ? '#d1fae5' : '#eff6ff';
                const stBorder = t.trang_thai === 'HoanThanh' ? '#6ee7b7' : '#bfdbfe';
                const stText = t.trang_thai === 'HoanThanh' ? 'Hoàn thành' : 'Đã cọc';

                return `
                    <div style="display: inline-flex; align-items: center; gap: 8px; background: ${stBg}; border: 1px solid ${stBorder}; color: ${stColor}; padding: 6px 12px; border-radius: 8px; font-size: 0.82rem; font-weight: 600;">
                        <span><i class="fa-solid fa-futbol"></i> <strong>${t.ten_san}</strong></span>
                        <span>&bull; ${t.khung_gio}</span>
                        <span style="font-size: 0.72rem; background: #fff; padding: 1px 6px; border-radius: 4px;">${stText}</span>
                    </div>
                `;
            }).join('');

            return `
                <div style="padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <strong style="color: #0f172a; font-size: 0.9rem;">
                            <i class="fa-regular fa-calendar-check" style="color: var(--primary); margin-right: 6px;"></i>${thuStr} — Ngày ${ngayFmt}
                        </strong>
                        <span style="font-size: 0.78rem; font-weight: 700; color: #059669; background: #ecfdf5; padding: 2px 9px; border-radius: 99px; border: 1px solid #a7f3d0;">
                            ${dayObj.so_tran} trận
                        </span>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${slotsBadges}
                    </div>
                </div>
            `;
        }).join('');
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 640px; width: 94%; padding: 0; border-radius: 16px; overflow: hidden; background: #ffffff; max-height: 88vh; display: flex; flex-direction: column; box-shadow: 0 20px 45px rgba(15, 23, 42, 0.22);">
            <div style="padding: 18px 24px; background: #0f172a; color: #ffffff; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-trophy" style="color: #fbbf24; font-size: 1.25rem;"></i>
                    <div>
                        <h3 style="margin: 0; font-size: 1.1rem; font-weight: 700;">${gd.ten_giai_dau}</h3>
                        <div style="font-size: 0.78rem; color: #94a3b8; margin-top: 2px;">Mã giải: #GD-${gd.ma_giai_dau} &bull; Thời gian: ${startFmt} - ${endFmt}</div>
                    </div>
                </div>
                <button type="button" onclick="document.getElementById('tournament-timeline-detail-modal').style.display='none'" style="background: none; border: none; color: #94a3b8; font-size: 1.2rem; cursor: pointer;">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <div style="padding: 20px 24px; overflow-y: auto; flex: 1;">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px;">
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px;">
                        <div style="font-size: 0.75rem; color: #64748b;">Trưởng ban tổ chức</div>
                        <div style="font-weight: 700; color: #0f172a; font-size: 0.92rem; margin-top: 2px;">${gd.khach_hang}</div>
                        <div style="font-size: 0.8rem; color: #2563eb; font-weight: 600;">${gd.so_dien_thoai}</div>
                    </div>
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px;">
                        <div style="font-size: 0.75rem; color: #64748b;">Sân bóng sử dụng</div>
                        <div style="font-weight: 700; color: #0f172a; font-size: 0.92rem; margin-top: 2px;">${sanNames.length > 0 ? sanNames.join(', ') : 'Chưa đặt sân'}</div>
                        <div style="font-size: 0.78rem; color: #64748b;">${matchDays.length} ngày thi đấu thực tế</div>
                    </div>
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px;">
                        <div style="font-size: 0.75rem; color: #64748b;">Tiến độ trận đấu</div>
                        <div style="font-weight: 800; color: #059669; font-size: 1.05rem; margin-top: 2px;">${gd.so_tran_hoan_thanh} / ${gd.tong_so_tran} trận</div>
                        <div style="font-size: 0.76rem; color: #64748b;">Đã hoàn thành</div>
                    </div>
                </div>

                <div style="font-weight: 700; color: #0f172a; font-size: 0.92rem; margin-bottom: 10px;">
                    <i class="fa-solid fa-calendar-week" style="color: var(--primary); margin-right: 6px;"></i>Chi tiết các ngày và khung giờ thi đấu:
                </div>
                ${scheduleRowsHtml}
            </div>

            <div style="padding: 14px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end;">
                <button type="button" class="btn-primary" style="padding: 8px 22px;" onclick="document.getElementById('tournament-timeline-detail-modal').style.display='none'">Đóng</button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
};