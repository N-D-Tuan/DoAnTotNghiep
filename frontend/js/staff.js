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

            // 2. CẬP NHẬT REALTIME QUẦY BÁN HÀNG POS (MỚI THÊM)
            if (document.getElementById('pos-product-grid')) {
                loadPosProducts();
            }
            // Nếu Nhân viên đang mở Tab Lịch sử Hóa Đơn
            if (document.getElementById('tab-pos-lichsu') && document.getElementById('tab-pos-lichsu').style.display !== 'none') {
                loadHoaDonHistory();
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

            // 6. CẬP NHẬT REALTIME BẢNG LƯƠNG CỦA NHÂN VIÊN
            if (document.getElementById('staff-bang-luong-tbody')) {
                loadBangLuongStaffData();
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

    // Reset Menu Active
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const profileLink = Array.from(document.querySelectorAll('.sidebar-nav a')).find(a => a.textContent.includes('TRANG CÁ NHÂN'));
    if (profileLink) profileLink.classList.add('active');

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="margin-bottom: 24px;">
            <h1 class="page-title">Trang cá nhân</h1>
            <p class="text-muted">Quản lý thông tin tài khoản nhân viên của bạn</p>
        </div>
        
        <div class="profile-card">
            <div class="profile-avatar-large"><i class="fa-solid fa-user"></i></div>
            <div>
                <h3 style="margin-bottom: 5px;">${user.HoTen || 'Chưa cập nhật'}</h3>
                <p style="font-weight: 500; font-size: 0.95rem; color: #0369a1;"><i class="fa-solid fa-user"></i> Nhân viên cơ sở</p>
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
    
    document.getElementById('btn-save-profile').disabled = true;
    document.getElementById('btn-save-profile').classList.add('btn-disabled');
    document.getElementById('profile-modal').style.display = 'flex';
}

function closeProfileModal() { document.getElementById('profile-modal').style.display = 'none'; }

// Lắng nghe sự thay đổi trên form
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

async function saveStaffProfile() {
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
// MODULE: MÀN HÌNH THU NGÂN (ĐẶT SÂN HỘ)
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
        // 1. Lấy thông tin cơ sở
        const response = await fetch(`${API_BASE_URL}/cum-san/${cumSanId}`);
        const res = await response.json();
        
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
                         onclick="loadStaffSchedule(${cumSanId}, '${sb.TenSan}', ${sb.ID}, ${sb.ID_LoaiSan})"
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
        contentArea.innerHTML = `
            <div class="page-header" style="margin-bottom: 24px;">
                <h1 class="page-title">Màn hình Thu Ngân - ${cs.TenCumSan}</h1>
                <p class="text-muted">Tổng quan ca làm việc và thao tác xử lý lịch đặt sân.</p>
            </div>

            <!-- KHU VỰC THỐNG KÊ NHANH TRONG NGÀY -->
            <div class="stat-grid" style="margin-bottom: 24px;">
                <div class="stat-card" style="border-left: 4px solid #3b82f6;">
                    <div class="stat-title">Lịch đá hôm nay</div>
                    <div id="staff-stat-sotran" class="stat-value" style="color: #1e293b;">...</div>
                </div>
                <div class="stat-card" style="border-left: 4px solid #f59e0b;">
                    <div class="stat-title">Chờ nhận sân (Check-in)</div>
                    <div id="staff-stat-chonhan" class="stat-value" style="color: #d97706;">...</div>
                </div>
                <div class="stat-card" style="border-left: 4px solid #10b981;">
                    <div class="stat-title">Đã hoàn thành (Ra về)</div>
                    <div id="staff-stat-hoanthanh" class="stat-value" style="color: #047857;">...</div>
                </div>
                <div class="stat-card" style="border-left: 4px solid #8b5cf6;">
                    <div class="stat-title">Doanh thu sân</div>
                    <div id="staff-stat-doanhthu" class="stat-value" style="color: #6d28d9;">...</div>
                </div>
            </div>

            <!-- BIỂU ĐỒ DOANH THU & CHI PHÍ -->
            <div class="chart-layout" style="margin-bottom: 24px;">
                <div class="panel">
                    <div class="panel-header" style="display:flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 20px;">
                        <div>
                            <div style="font-size: 1.1rem; color: var(--text-dark); margin-bottom: 6px; font-weight: 700;">Biểu đồ doanh thu & chi phí</div>
                            <div style="display: flex; align-items: baseline; gap: 8px;">
                                <span id="staff-chart-total-amount" style="font-size: 1.5rem; font-weight: 800; color: #16A34A; letter-spacing: -0.5px;">Đang tải...</span>
                                <span style="font-size: 0.85rem; color: #64748b; background: #f8fafc; padding: 4px 10px; border-radius: 12px; border: 1px solid #e2e8f0;">
                                    <i class="fa-solid fa-circle-info" style="margin-right: 4px; color: #3b82f6;"></i>Đã gồm bán nước
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
    let tongDoanhThu = 0;

    try {
        const dsResponse = await fetch(`${API_BASE_URL}/admin/dat-san`);
        const dsRes = await dsResponse.json();
        
        if (dsRes.success) {
            const datSanHnay = dsRes.data.filter(item => 
                item.NgayDa === todayStr && 
                item.san_bong && 
                item.san_bong.ID_CumSan === cumSanId
            );
            
            // Tính số lượng trận
            soTranHomNay = datSanHnay.filter(i => i.TrangThai === 'DaCoc').length + datSanHnay.filter(i => i.TrangThai === 'HoanThanh').length;
            choNhanSan = datSanHnay.filter(i => i.TrangThai === 'DaCoc').length;
            hoanThanh = datSanHnay.filter(i => i.TrangThai === 'HoanThanh').length;
            
            // Tính tổng tiền
            datSanHnay.forEach(i => {
                const isGiaiDau = i.ID_GiaiDau !== null;
                if (i.TrangThai === 'HoanThanh' || isGiaiDau) {
                    tongDoanhThu += Number(i.TongTien);
                } else if (i.TrangThai === 'KhongDen') {
                    tongDoanhThu += Number(i.TienCoc || 0);
                }
            });

            // Ghi đè số liệu mới lên giao diện (Nếu các thẻ HTML này đang hiển thị)
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
// HÀM VẼ BIỂU ĐỒ NHÂN VIÊN
// ======================================================
async function updateStaffDashboardStats() {
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    if (!document.getElementById('staffRevenueChart')) return;

    try {
        // Truyền chính xác ID Cụm Sân của Nhân viên để lấy thống kê
        const response = await fetch(`${API_BASE_URL}/admin/thong-ke?id_cum_san=${currentUser.ID_CumSan}&time_filter=${staffDashboardFilterTime}`);
        const res = await response.json();

        if (!res.success) return;
        const data = res.data;

        const labels = data.chart.map(c => c.ngay);
        const revenueData = data.chart.map(c => c.doanh_thu);
        const expenseData = data.chart.map(c => c.chi_phi);

        // Tính Toán Thu - Chi - Lợi Nhuận
        const totalRevenue = revenueData.reduce((sum, amount) => sum + Number(amount), 0);
        const totalExpense = expenseData.reduce((sum, amount) => sum + Number(amount), 0);
        const netProfit = totalRevenue - totalExpense;
        const profitColor = netProfit >= 0 ? '#10b981' : '#ef4444';

        // Ghi ra giao diện
        document.getElementById('staff-chart-total-amount').innerHTML = `
            Thu: ${totalRevenue.toLocaleString('vi-VN')}đ 
            <span style="font-size: 1rem; font-weight: 600; color: #ef4444; margin-left: 10px;">(Chi: ${totalExpense.toLocaleString('vi-VN')}đ)</span>
            <span style="font-size: 1rem; font-weight: 600; color: ${profitColor}; margin-left: 10px;">(Lãi: ${netProfit.toLocaleString('vi-VN')}đ)</span>
        `;

        // Vẽ biểu đồ
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

    } catch (e) { 
        console.error('Lỗi load biểu đồ nhân viên', e); 
    }
}

// Render Lưới Lịch cho một Sân cụ thể
async function loadStaffSchedule(clusterId, pitchName, pitchId, loaiSanId) {
    currentPitchId = pitchId;
    currentCumSanId = clusterId;
    currentLoaiSanId = loaiSanId;
    window.currentPitchNameStaff = pitchName;
    
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
            <div class="panel">
                <div class="panel-header"><i class="fa-solid fa-calendar-days"></i> ${pitchName}</div>
                <div style="width: 100%; max-height: 500px; overflow-y: auto; overflow-x: auto;"> 
                    <table class="schedule-table" style="margin: 0; border: none;">
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
                
                const slotId = `${pitchId}-${date.dbFormat}-${kg.ID}`;
                const isSelected = selectedOfflineSlots.some(s => s.id === slotId);
                
                let statusClass = 'available', statusText = 'CÒN TRỐNG';
                
                const slotDataStr = `${pitchId}, ${kg.ID}, '${date.dbFormat}', '${date.displayFormat}', '${timeStr}', ${priceValue}`;
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
            id: slotId, pitchId, kgId, dateDb, dateDisplay, timeStr, price,
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
    const sdt = document.getElementById('off-phone').value.trim();
    const ten = document.getElementById('off-name').value.trim();
    const tienCoc = document.getElementById('off-deposit').value;

    const tongTienSan = Number(document.getElementById('off-total-price').value);

    const alertBox = document.getElementById('offline-booking-alert');
    alertBox.style.display = 'none';

    if (!sdt) {
        alertBox.textContent = "Số điện thoại khách hàng là bắt buộc!";
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
            sdt_khach: sdt, ho_ten: ten, tien_coc: tienCoc, slots: selectedOfflineSlots 
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

            // 4. Mượn hàm alert của trình duyệt hoặc Toast (nếu có) để báo thành công
            if (typeof showSystemModal === "function") {
                showSystemModal("Thành công", "Đã chốt giữ sân thành công!", "success");
            } else {
                alert("Giữ sân thành công!");
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

// ======================================================
// MODULE: NHÂN VIÊN - QUẢN LÝ ĐẶT SÂN (CHỐT SÂN)
// ======================================================
let staffDatSanData = [];
let staffDSPage = 1;
const staffDSItemsPerPage = 8;
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
        <div class="page-header" style="margin-bottom: 24px;">
            <h1 class="page-title">Quản lý Lịch Đặt Sân</h1>
            <p class="text-muted">Danh sách các booking tại cơ sở của bạn. Vui lòng chốt trạng thái khách đến sân.</p>
        </div>

        <div id="staff-datsan-alert" class="modal-alert" style="display: none; margin-bottom: 16px;"></div>

        <div class="panel">
            <div style="display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap;">
                <div style="position: relative; flex: 1; min-width: 250px;">
                    <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 12px; top: 12px; color: var(--text-muted);"></i>
                    <input type="text" class="form-control" style="padding-left: 35px;" placeholder="Tìm SDT, Tên khách, Tên sân..." oninput="handleStaffDSSearch(this.value)">
                </div>
                <input type="date" class="form-control" style="width: 150px;" id="staff-ds-date-input" onchange="handleStaffDSDate(this.value)">
                <select class="form-control" style="width: 180px;" onchange="handleStaffDSFilter(this.value)">
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
                            <th>Tiền thu</th>
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

function applyStaffDSFiltersAndRender() {
    // 1. Lọc theo CumSan của nhân viên đang đăng nhập
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    let filteredData = staffDatSanData;
    
    if (currentUser && currentUser.ID_CumSan) {
        filteredData = filteredData.filter(item => 
            item.san_bong && item.san_bong.ID_CumSan === currentUser.ID_CumSan
        );
    }

    // 2. Tiếp tục lọc theo trạng thái, tìm kiếm và ngày
    filteredData = filteredData.filter(item => {
        const matchStatus = (staffDSFilter === 'All' || item.TrangThai === staffDSFilter);
        const maVeSearch = item.ID_GiaiDau ? `gd-${item.ID_GiaiDau}` : `pt-${item.ID}`;
        const sdt = item.ID_NguoiDung ? (item.nguoi_dung?.SoDienThoai?.toLowerCase() || '') : (item.SDTKhachVangLai?.toLowerCase() || '');
        const tenKhach = item.ID_NguoiDung ? (item.nguoi_dung?.HoTen?.toLowerCase() || '') : (item.TenKhachVangLai?.toLowerCase() || '');
        const tenSan = item.san_bong ? item.san_bong.TenSan.toLowerCase() : '';
        const tenGiai = (item.ID_GiaiDau !== null && item.giai_dau) ? item.giai_dau.TenGiaiDau.toLowerCase() : '';

        const searchTerm = staffDSSearch.toLowerCase().trim();
        const matchSearch = maVeSearch.includes(searchTerm)
                         || sdt.includes(staffDSSearch) 
                         || tenKhach.includes(staffDSSearch) 
                         || tenSan.includes(staffDSSearch)
                         || tenGiai.includes(staffDSSearch);
        
        const matchDate = staffDSDate ? (item.NgayDa === staffDSDate) : true;
        
        return matchStatus && matchSearch && matchDate;
    });

    const totalPages = Math.ceil(filteredData.length / staffDSItemsPerPage) || 1;
    if (staffDSPage > totalPages) staffDSPage = totalPages;
    const startIdx = (staffDSPage - 1) * staffDSItemsPerPage;
    
    renderStaffDSTable(filteredData.slice(startIdx, startIdx + staffDSItemsPerPage));
    renderStaffDSPagination(totalPages);
}

function renderStaffDSTable(data) {
    const tbody = document.getElementById('staff-datsan-table-body');
    if (data.length === 0) return tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="text-align: center; padding: 40px;">Không có dữ liệu.</td></tr>`;

    tbody.innerHTML = data.map(item => {
        let badgeColor = '#6b7280', badgeBg = '#f3f4f6', viStatus = item.TrangThai;
        if(item.TrangThai === 'DaCoc') { badgeColor = '#b45309'; badgeBg = '#fef3c7'; viStatus = 'Đã cọc'; }
        else if(item.TrangThai === 'DaHuy') { badgeColor = '#b91c1c'; badgeBg = '#fee2e2'; viStatus = 'Đã hủy'; }
        else if(item.TrangThai === 'HoanThanh') { badgeColor = '#047857'; badgeBg = '#d1fae5'; viStatus = 'Hoàn thành'; }
        else if(item.TrangThai === 'KhongDen') { badgeColor = '#6b7280'; badgeBg = '#f3f4f6'; viStatus = 'Không đến'; }

        const badgeHtml = `<span style="padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; background: ${badgeBg}; color: ${badgeColor};">${viStatus}</span>`;
        
        const maVeDisplay = item.ID_GiaiDau ? `GD-${item.ID_GiaiDau}` : `PT-${item.ID}`;
        const badgeClassVe = item.ID_GiaiDau 
            ? 'background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe;' 
            : 'background: #f8fafc; color: #475569; border: 1px solid #e2e8f0;';        
        
        const isGiaiDau = item.ID_GiaiDau !== null;
        const tagLoai = isGiaiDau 
            ? `<span style="font-size: 0.75rem; background: #e0e7ff; color: #4338ca; padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-trophy"></i> Giải đấu</span>` 
            : `<span style="font-size: 0.75rem; background: #f1f5f9; color: #475569; padding: 2px 6px; border-radius: 4px;">Phong trào</span>`;

        const d = new Date(item.NgayDa);
        const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear()}`;
        const timeStr = item.khung_gio ? `${item.khung_gio.GioBatDau.substring(0,5)} - ${item.khung_gio.GioKetThuc.substring(0,5)}` : '';

        const tienThu = Number(item.TongTien) - Number(item.TienCoc);

        // Thêm event.stopPropagation() vào nút Chốt sân để không mở đè Modal chi tiết khi bấm nút
        let actionHtml = '';
        if (item.TrangThai === 'DaCoc') {
            actionHtml = `<button class="btn-primary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="event.stopPropagation(); openStaffDSConfirmModal(${item.ID})">Chốt sân</button>`;
        } else {
            actionHtml = `<span style="color: var(--text-muted); font-size: 0.85rem;">Đã xử lý</span>`;
        }

        const tenKhachHienThi = item.ID_NguoiDung ? (item.nguoi_dung?.HoTen || 'N/A') : (item.TenKhachVangLai || 'N/A');
        const sdtKhachHienThi = item.ID_NguoiDung ? (item.nguoi_dung?.SoDienThoai || '') : (item.SDTKhachVangLai || '');

        return `<tr onclick="openBookingDetailModalStaff(${item.ID})" style="cursor: pointer; transition: background-color 0.15s;" onmouseover="this.style.backgroundColor='#f8fafc'" onmouseout="this.style.backgroundColor=''">
            <td style="text-align: center;"><span style="padding: 6px 12px; border-radius: 8px; font-weight: 700; font-family: monospace; font-size: 0.95rem; display: inline-block; white-space: nowrap; ${badgeClassVe}">${maVeDisplay}</span></td>
            <td><strong>${tenKhachHienThi}</strong><br><span style="font-size: 0.85rem; color: var(--text-muted);">${sdtKhachHienThi}</span></td>
            <td><strong style="color: var(--text-dark);">${item.san_bong ? item.san_bong.TenSan : 'N/A'}</strong> ${tagLoai}</td>
            <td><span style="font-size: 0.9rem;">Ngày: ${dateStr}</span><br><strong style="color: var(--primary);">Giờ: ${timeStr}</strong></td>
            <td><strong style="color: #ea580c;">${tienThu.toLocaleString('vi-VN')}đ</strong></td>
            <td>${badgeHtml}</td>
            <td style="text-align: center;">${actionHtml}</td>
        </tr>`;
    }).join('');
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
    const tenKhach = isMember ? (item.nguoi_dung?.HoTen || 'N/A') : (item.TenKhachVangLai || 'N/A');
    const sdtKhach = isMember ? (item.nguoi_dung?.SoDienThoai || 'N/A') : (item.SDTKhachVangLai || 'N/A');
    const emailKhach = isMember ? (item.nguoi_dung?.Email || '') : (item.EmailKhachVangLai || '');
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
        : `<span style="color: #94a3b8; font-style: italic;">Chưa có (Chờ xử lý)</span>`;

    // 5. Tài chính
    const tongTien = Number(item.TongTien || 0);
    const tienCoc = Number(item.TienCoc || 0);
    const canThuThem = tongTien - tienCoc;

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
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 600; color: #0f172a; font-size: 0.88rem;">Tiền thu còn lại:</span>
                        <strong style="color: #ea580c; font-size: 1.08rem;">${canThuThem.toLocaleString('vi-VN')}đ</strong>
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
        modal.style.cssText = 'display: none; z-index: 9999;';
        
        // Modal này đã BỎ ĐI nút "Hủy sân & Hoàn tiền" so với Admin
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 450px; text-align: center; padding: 30px 20px;">
                <h3 style="margin-bottom: 10px; font-size: 1.4rem; color: var(--text-dark);">Chốt trạng thái sân</h3>
                <p style="color: var(--text-muted); margin-bottom: 25px; line-height: 1.5;">Vui lòng xác nhận trạng thái cho khách hàng này.</p>
                <div style="display: flex; justify-content: center; gap: 12px;">
                    <button class="btn-outline" style="width: auto; padding: 10px 24px;" onclick="closeStaffDSConfirmModal()">Hủy bỏ</button>
                    <button class="btn-outline" style="padding: 10px 15px; color: #ef4444; border-color: #fecaca; background: #fef2f2;" onclick="openStaffCancelConfirmModal()"><i class="fa-solid fa-ban"></i> Hủy sân & Hoàn tiền</button>
                    <button class="btn-outline" style="width: auto; padding: 10px 24px; color: #64748b; border-color: #cbd5e1;" onclick="executeStaffCapNhatDatSan('KhongDen')"><i class="fa-solid fa-user-slash"></i> Không đến</button>
                    <button class="btn-primary" style="width: auto; padding: 10px 24px; background-color: #10b981; border-color: #10b981;" onclick="executeStaffCapNhatDatSan('HoanThanh')"><i class="fa-solid fa-check"></i> Hoàn thành</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
}

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
        // LUỒNG 1: KHÁCH HÀNG CÓ TÀI KHOẢN
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; text-align: center; padding: 30px 20px;">
                <div style="font-size: 3.5rem; color: #ef4444; margin-bottom: 15px;"><i class="fa-solid fa-triangle-exclamation"></i></div>
                <h3 style="margin-bottom: 10px; font-size: 1.35rem;">Xác nhận Hủy Sân</h3>
                <p style="color: var(--text-muted); margin-bottom: 25px; line-height: 1.5; font-size: 0.92rem;">
                    Khách hàng thành viên: <strong>${item.nguoi_dung?.HoTen || 'N/A'}</strong>.<br>
                    Hệ thống sẽ <strong>HỦY LỊCH</strong> và tự động <strong>HOÀN TRẢ 100% TIỀN CỌC (${Number(item.TienCoc).toLocaleString('vi-VN')}đ)</strong> vào ví khách hàng.
                </p>
                <div style="display: flex; justify-content: center; gap: 12px;">
                    <button class="btn-outline" style="width: auto; padding: 10px 24px;" onclick="closeStaffCancelConfirmModal()">Hủy bỏ</button>
                    <button class="btn-primary" style="width: auto; padding: 10px 24px; background-color: #ef4444; border-color: #ef4444;" onclick="executeStaffCapNhatDatSan('DaHuy'); closeStaffCancelConfirmModal();"><i class="fa-solid fa-trash"></i> Đồng ý Hủy</button>
                </div>
            </div>`;
    } else {
        // LUỒNG 2: KHÁCH VÃNG LAI (Xác thực OTP qua Email)
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 430px; padding: 24px; text-align: left; border-radius: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0;">
                    <h3 style="margin: 0; font-size: 1.15rem; color: #0f172a;"><i class="fa-solid fa-user-check" style="color: #ef4444; margin-right: 6px;"></i> Hủy sân Khách vãng lai</h3>
                    <i class="fa-solid fa-xmark" style="cursor: pointer; color: #64748b; font-size: 1.1rem;" onclick="closeStaffCancelConfirmModal()"></i>
                </div>

                <div id="staff-guest-cancel-alert" class="modal-alert" style="display: none; margin: 0 0 12px 0;"></div>

                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 0.88rem; line-height: 1.6;">
                    <div>Khách vãng lai: <strong>${item.TenKhachVangLai || 'N/A'}</strong> (${item.SDTKhachVangLai || ''})</div>
                    <div>Email nhận OTP: <strong style="color: #2563eb;">${item.EmailKhachVangLai || 'Chưa có'}</strong></div>
                    <div>Tiền cọc cần hoàn: <strong style="color: #ea580c;">${Number(item.TienCoc).toLocaleString('vi-VN')}đ</strong></div>
                </div>

                <div class="form-group" style="margin-bottom: 18px;">
                    <label style="font-size: 0.85rem; font-weight: 600; margin-bottom: 6px; display: block;">Mã xác thực OTP (gửi về Email khách) <span style="color: red;">*</span></label>
                    <div style="display: flex; gap: 8px;">
                        <input type="text" id="staff-guest-cancel-otp" class="form-control" placeholder="Nhập 6 số OTP..." maxlength="6" style="flex: 1; font-weight: 700; letter-spacing: 2px; text-align: center;">
                        <button type="button" id="btn-staff-send-guest-otp" class="btn-outline" style="width: auto; padding: 0 14px; white-space: nowrap; font-size: 0.85rem; border-color: #3b82f6; color: #2563eb;" onclick="sendGuestCancelOtpStaff(${item.ID})">
                            <i class="fa-solid fa-paper-plane"></i> Gửi OTP
                        </button>
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button class="btn-outline" style="width: auto; padding: 9px 18px;" onclick="closeStaffCancelConfirmModal()">Đóng</button>
                    <button id="btn-staff-confirm-guest-cancel" class="btn-primary" style="width: auto; padding: 9px 18px; background-color: #ef4444; border-color: #ef4444;" onclick="confirmGuestCancelStaff()">
                        <i class="fa-solid fa-check"></i> Xác nhận Hủy & Hoàn cọc
                    </button>
                </div>
            </div>`;
    }

    modal.style.display = 'flex';
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

// ======================================================
// MODULE: NHÂN VIÊN - QUẦY BÁN HÀNG (MINI POS)
// ======================================================
let posCart = [];
let allPosProducts = [];

let allHoaDonData = [];
let hoaDonPage = 1;
const hoaDonItemsPerPage = 5;

function renderPosBanHang() {
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = document.getElementById('menu-pos');
    if (menuLink) menuLink.classList.add('active');

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="margin-bottom: 20px;">
            <h1 class="page-title">Quầy Bán Hàng</h1>
            <p class="text-muted">Bán nước giải khát, dịch vụ và xem lịch sử hóa đơn.</p>
        </div>

        <div class="panel" style="margin-bottom: 20px; padding: 0;">
            <div style="display: flex; gap: 20px; border-bottom: 1px solid var(--border); padding: 0 20px;">
                <button class="nav-tab active" onclick="switchPosTab('tab-pos-banhang', this)" style="padding: 15px 10px; border: none; background: transparent; font-weight: 600; cursor: pointer; border-bottom: 2px solid var(--primary); color: var(--primary);">Tạo Đơn Mới</button>
                <button class="nav-tab" onclick="switchPosTab('tab-pos-lichsu', this)" style="padding: 15px 10px; border: none; background: transparent; font-weight: 600; cursor: pointer; color: var(--text-muted);">Lịch Sử Hóa Đơn</button>
            </div>
        </div>

        <!-- TAB 1: TẠO ĐƠN MỚI -->
        <div id="tab-pos-banhang" style="display: flex; gap: 24px; align-items: flex-start;">
            <div class="panel" style="flex: 1; padding: 24px; min-height: 70vh;">
                <div style="position: relative; margin-bottom: 20px;">
                    <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 16px; top: 14px; color: var(--text-muted);"></i>
                    <input type="text" id="pos-search-input" class="form-control" style="padding-left: 45px; border-radius: 20px;" placeholder="Tìm nhanh mặt hàng..." oninput="handlePosSearch(this.value)">
                </div>

                <div id="pos-product-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px;">
                    <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu kho...</div>
                </div>
            </div>

            <div class="panel" style="width: 380px; position: sticky; top: 20px; display: flex; flex-direction: column; height: calc(100vh - 120px); padding: 0;">
                <div style="padding: 16px 20px; border-bottom: 1px solid var(--border); background: #f8fafc; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 1.1rem; color: #1e293b;"><i class="fa-solid fa-receipt"></i> Phiếu Tính Tiền</h3>
                    <button class="btn-outline-sm" style="color: #ef4444; border-color: #fecaca; padding: 4px 10px; font-size: 0.8rem; background: white;" onclick="clearPosCart()"><i class="fa-solid fa-trash-can"></i> Xóa tất cả</button>
                </div>
                
                <div id="pos-cart-list" style="flex: 1; overflow-y: auto; padding: 10px 20px;">
                </div>

                <div style="padding: 20px; border-top: 1px solid var(--border); background: white; border-radius: 0 0 8px 8px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 1.2rem; font-weight: bold;">
                        <span>Tổng tiền:</span>
                        <span id="pos-total-price" style="color: #ea580c;">0đ</span>
                    </div>
                    <button id="btn-process-pos" class="btn-primary" style="width: 100%; padding: 14px; font-size: 1.05rem;" onclick="processPosCheckout()">
                        <i class="fa-solid fa-money-bill-wave" style="margin-right: 8px;"></i> Thanh toán ngay
                    </button>
                </div>
            </div>
        </div>

        <!-- TAB 2: LỊCH SỬ HÓA ĐƠN -->
        <div id="tab-pos-lichsu" class="panel" style="display: none; padding: 24px;">
            <div style="display: flex; gap: 15px; margin-bottom: 20px;">
                <input type="date" class="form-control" style="width: 180px;" id="staff-hoadon-date-filter" onchange="handleStaffHoaDonDateFilter(this.value)">
                <button class="btn-outline-sm" onclick="document.getElementById('staff-hoadon-date-filter').value=''; handleStaffHoaDonDateFilter('')" style="padding: 6px 12px;">Xóa lọc ngày</button>
            </div>

            <div class="table-responsive">
                <table class="admin-table">
                    <thead style="background: #F8FAFC;">
                        <tr>
                            <th>Mã Hóa Đơn</th>
                            <th>Người Lập Phiếu</th>
                            <th>Danh sách món</th>
                            <th>Tổng thu</th>
                            <th>Thời gian</th>
                        </tr>
                    </thead>
                    <tbody id="hoadon-table-body">
                        <tr><td colspan="5" class="text-center" style="padding: 30px; text-align: center;">Đang tải dữ liệu...</td></tr>
                    </tbody>
                </table>
            </div>
            <div id="hoadon-pagination" style="display: flex; justify-content: center; gap: 8px; margin-top: 15px;"></div>
        </div>
    `;

    loadPosProducts();
}

function switchPosTab(tabId, element) {
    const tabs = element.parentElement.children;
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
        tabs[i].style.borderBottom = 'none';
        tabs[i].style.color = 'var(--text-muted)';
    }
    element.classList.add('active');
    element.style.borderBottom = '2px solid var(--primary)';
    element.style.color = 'var(--primary)';

    document.getElementById('tab-pos-banhang').style.display = 'none';
    document.getElementById('tab-pos-lichsu').style.display = 'none';
    document.getElementById(tabId).style.display = 'flex';

    // Fix layout lỗi flex/block
    if (tabId === 'tab-pos-lichsu') {
        document.getElementById(tabId).style.display = 'block';
        loadHoaDonHistory();
    }
}

// --- LOGIC TAB 1: BÁN HÀNG ---

async function loadPosProducts() {
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    const grid = document.getElementById('pos-product-grid');

    try {
        const response = await fetch(`${API_BASE_URL}/san-pham?id_cum_san=${currentUser.ID_CumSan}`);
        const res = await response.json();

        if (res.success) {
            allPosProducts = res.data;
            renderPosProductGrid(allPosProducts);
            updatePosCartUI(); 
        }
    } catch (e) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: red; padding: 40px;">Lỗi kết nối máy chủ!</div>`;
    }
}

function handlePosSearch(val) {
    const searchTerm = val.toLowerCase().trim();
    const filteredProducts = allPosProducts.filter(p => p.TenSanPham.toLowerCase().includes(searchTerm));
    renderPosProductGrid(filteredProducts);
}

function renderPosProductGrid(products) {
    const grid = document.getElementById('pos-product-grid');
    if (products.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">Kho hàng đang trống.</div>`;
        return;
    }

    let html = '';
    products.forEach(p => {
        const isOutOfStock = p.SoLuongTon <= 0;
        const cardStyle = isOutOfStock 
            ? `background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; text-align: center; opacity: 0.6; filter: grayscale(100%); cursor: not-allowed; position: relative;` 
            : `background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; text-align: center; cursor: pointer; transition: 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.02);`;
        
        const hoverLogic = isOutOfStock 
            ? '' 
            : `onmouseover="this.style.borderColor='var(--primary)'; this.style.transform='translateY(-2px)';" onmouseout="this.style.borderColor='#e2e8f0'; this.style.transform='translateY(0)';" onclick="addToPosCart(${p.ID}, '${p.TenSanPham.replace(/'/g, "\\'")}', ${p.GiaBan})"`;

        const outOfStockBadge = isOutOfStock ? `<div style="position: absolute; top: 10px; right: 10px; background: #ef4444; color: white; font-size: 0.7rem; font-weight: bold; padding: 2px 6px; border-radius: 4px;">Hết hàng</div>` : '';

        const imgHtml = p.HinhAnh 
            ? `<img src="http://127.0.0.1:8000${p.HinhAnh}" style="width: 50px; height: 50px; object-fit: contain; margin-bottom: 10px;">` 
            : `<i class="fa-solid fa-bottle-water" style="font-size: 2rem; color: #94a3b8; margin-bottom: 10px;"></i>`;

        html += `
            <div style="${cardStyle}" ${hoverLogic}>
                ${outOfStockBadge}
                ${imgHtml}
                <div style="font-weight: 600; color: #1e293b; font-size: 0.95rem; margin-bottom: 5px;">${p.TenSanPham}</div>
                <div style="color: #ea580c; font-weight: bold;">${Number(p.GiaBan).toLocaleString('vi-VN')}đ</div>
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">Tồn: ${p.SoLuongTon}</div>
            </div>
        `;
    });
    grid.innerHTML = html;
}

function addToPosCart(id, ten, gia) {
    const dbProduct = allPosProducts.find(p => p.ID === id);
    const existingItem = posCart.find(item => item.id === id);
    
    const currentQtyInCart = existingItem ? existingItem.qty : 0;
    if (currentQtyInCart >= dbProduct.SoLuongTon) {
        showSystemModal('Hết hàng', `Chỉ còn ${dbProduct.SoLuongTon} sản phẩm trong kho.`, 'error');
        return;
    }

    if (existingItem) existingItem.qty += 1;
    else posCart.push({ id, ten, gia, qty: 1 });
    
    updatePosCartUI();
}

function changePosQty(id, delta) {
    const item = posCart.find(i => i.id === id);
    const dbProduct = allPosProducts.find(p => p.ID === id);

    if (item) {
        if (delta > 0 && item.qty >= dbProduct.SoLuongTon) {
            showSystemModal('Hết hàng', `Chỉ còn ${dbProduct.SoLuongTon} sản phẩm trong kho.`, 'error');
            return;
        }

        item.qty += delta;
        if (item.qty <= 0) posCart = posCart.filter(i => i.id !== id);
        updatePosCartUI();
    }
}

function clearPosCart() {
    if (posCart.length === 0) return;
    posCart = [];
    updatePosCartUI();
}

function updatePosCartUI() {
    const listContainer = document.getElementById('pos-cart-list');
    const totalEl = document.getElementById('pos-total-price');
    if (!listContainer || !totalEl) return;

    if (posCart.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); margin-top: 50px;">
                <i class="fa-solid fa-cart-arrow-down" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 10px;"></i><br>Chưa có sản phẩm nào
            </div>
        `;
        totalEl.innerText = '0đ';
        return;
    }

    let total = 0;
    let html = '';

    posCart.forEach(item => {
        const itemTotal = item.gia * item.qty;
        total += itemTotal;
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px dashed #e2e8f0;">
                <div style="flex: 1; padding-right: 10px;">
                    <div style="font-weight: 600; color: #1e293b; font-size: 0.95rem; margin-bottom: 4px;">${item.ten}</div>
                    <div style="color: #ea580c; font-size: 0.9rem;">${Number(item.gia).toLocaleString('vi-VN')}đ</div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="display: flex; align-items: center; background: #f1f5f9; border-radius: 6px; overflow: hidden; border: 1px solid #cbd5e1;">
                        <button onclick="changePosQty(${item.id}, -1)" style="border: none; background: transparent; padding: 4px 10px; cursor: pointer; color: #475569;"><i class="fa-solid fa-minus" style="font-size: 0.8rem;"></i></button>
                        <span style="font-weight: bold; width: 20px; text-align: center;">${item.qty}</span>
                        <button onclick="changePosQty(${item.id}, 1)" style="border: none; background: transparent; padding: 4px 10px; cursor: pointer; color: #475569;"><i class="fa-solid fa-plus" style="font-size: 0.8rem;"></i></button>
                    </div>
                </div>
            </div>
        `;
    });

    listContainer.innerHTML = html;
    totalEl.innerText = total.toLocaleString('vi-VN') + 'đ';
}

async function processPosCheckout() {
    if (posCart.length === 0) return;

    const btn = document.getElementById('btn-process-pos');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    btn.disabled = true;

    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    let tongTien = posCart.reduce((sum, item) => sum + (item.gia * item.qty), 0);
    
    const chiTiet = posCart.map(item => ({
        id_san_pham: item.id,
        ten_san_pham: item.ten,
        so_luong: item.qty,
        don_gia: item.gia
    }));

    try {
        const response = await fetch(`${API_BASE_URL}/ban-hang`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ID_CumSan: currentUser.ID_CumSan,
                ID_NhanVien: currentUser.ID,
                TongTien: tongTien,
                ChiTietHoaDon: chiTiet
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showSystemModal('Thanh toán thành công', 'Hóa đơn đã được lưu vào hệ thống.', 'success');
            posCart = []; 
            loadPosProducts(); 
        } else {
            showSystemModal('Lỗi thanh toán', data.message, 'error');
        }
    } catch (e) {
        showSystemModal('Lỗi mạng', 'Không thể kết nối đến máy chủ.', 'error');
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-money-bill-wave" style="margin-right: 8px;"></i> Thanh toán ngay';
        btn.disabled = false;
    }
}

// --- LOGIC TAB 2: LỊCH SỬ HÓA ĐƠN ---

async function loadHoaDonHistory() {
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    try {
        const response = await fetch(`${API_BASE_URL}/ban-hang?id_cum_san=${currentUser.ID_CumSan}`);
        const res = await response.json();
        
        if (res.success) {
            allHoaDonData = res.data || [];
            renderHoaDonPagination(1);
        }
    } catch (e) {
        document.getElementById('hoadon-table-body').innerHTML = `<tr><td colspan="5" class="text-center text-danger" style="padding: 30px;">Lỗi kết nối máy chủ!</td></tr>`;
    }
}

// HÀM XỬ LÝ LỌC THEO NGÀY CHO NHÂN VIÊN
let staffHoaDonDateFilter = '';

function handleStaffHoaDonDateFilter(val) {
    staffHoaDonDateFilter = val;
    hoaDonPage = 1; // Reset về trang 1 khi lọc
    renderHoaDonPagination();
}

// HÀM RENDER VÀ PHÂN TRANG HÓA ĐƠN (ĐÃ TÍCH HỢP LỌC NGÀY)
function renderHoaDonPagination(pageInit) {
    // 1. Lọc dữ liệu theo ngày nếu staffHoaDonDateFilter có giá trị
    let filteredData = allHoaDonData.filter(hd => {
        if (!staffHoaDonDateFilter) return true;
        const hdDate = hd.NgayTao ? hd.NgayTao.substring(0, 10) : '';
        return hdDate === staffHoaDonDateFilter;
    });

    const totalPages = Math.ceil(filteredData.length / hoaDonItemsPerPage) || 1;
    if (hoaDonPage > totalPages) hoaDonPage = totalPages;

    const startIdx = (hoaDonPage - 1) * hoaDonItemsPerPage;
    const pageData = filteredData.slice(startIdx, startIdx + hoaDonItemsPerPage);

    const tbody = document.getElementById('hoadon-table-body');
    if (pageData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 30px; text-align: center;">Chưa có hóa đơn nào phù hợp.</td></tr>`;
    } else {
        tbody.innerHTML = pageData.map(hd => {
            let cacMon = '';
            if (hd.chi_tiet_hoa_dons && hd.chi_tiet_hoa_dons.length > 0) {
                cacMon = hd.chi_tiet_hoa_dons.map(ct => {
                    const tenMon = ct.san_pham ? ct.san_pham.TenSanPham : 'Sản phẩm lỗi';
                    return `<li><i class="fa-solid fa-angle-right" style="font-size:0.7rem; color:#94a3b8; margin-right:4px;"></i> ${tenMon}: <strong style="color:var(--text-dark);">${ct.SoLuong}</strong></li>`;
                }).join('');
            } else {
                cacMon = '<span class="text-muted">Không có dữ liệu món</span>';
            }

            const dateStr = hd.NgayTao ? hd.NgayTao.replace('T', ' ').substring(0, 16) : '';
            
            return `
                <tr>
                    <td><strong style="font-family: monospace; color: #475569;">#HD${hd.ID}</strong></td>
                    <td>${hd.nhan_vien ? hd.nhan_vien.HoTen : 'N/A'}</td>
                    <td><ul style="list-style: none; padding: 0; margin: 0; font-size: 0.85rem;">${cacMon}</ul></td>
                    <td><strong style="color: #10b981;">${Number(hd.TongTien).toLocaleString('vi-VN')}đ</strong></td>
                    <td><span style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> ${dateStr}</span></td>
                </tr>
            `;
        }).join('');
    }

    const div = document.getElementById('hoadon-pagination');
    if (totalPages <= 1) return div.innerHTML = '';
    
    let html = `<button class="btn-outline-sm" ${hoaDonPage === 1 ? 'disabled style="opacity:0.5;"' : ''} onclick="hoaDonPage--; renderHoaDonPagination()"><i class="fa-solid fa-chevron-left"></i></button>`;
    
    const getPages = (current, total) => {
        if (total <= 6) return Array.from({length: total}, (_, i) => i + 1);
        if (current <= 3) return [1, 2, 3, 4, '...', total];
        if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
        return [1, '...', current - 1, current, current + 1, '...', total];
    };

    getPages(hoaDonPage, totalPages).forEach(i => {
        if (i === '...') {
            html += `<span style="padding: 6px 10px; color: var(--text-muted); font-weight: bold;">...</span>`;
        } else {
            html += `<button class="${i === hoaDonPage ? 'btn-primary' : 'btn-outline-sm'}" style="padding: 6px 14px;" onclick="hoaDonPage=${i}; renderHoaDonPagination()">${i}</button>`;
        }
    });

    html += `<button class="btn-outline-sm" ${hoaDonPage === totalPages ? 'disabled style="opacity:0.5;"' : ''} onclick="hoaDonPage++; renderHoaDonPagination()"><i class="fa-solid fa-chevron-right"></i></button>`;
    div.innerHTML = html;
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
        <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
            <div>
                <h1 class="page-title">Lịch làm việc của bạn</h1>
                <p class="text-muted">Đăng ký ca tuần tới, theo dõi lịch tuần này và xem lịch sử các ca đã nhận</p>
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
            fetch(`${API_BASE_URL}/ca-lam-viec`),
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
                            <th style="width: 100px; text-align: center;">CA LÀM</th>
                            ${dates.map(d => `<th style="text-align: center;">${d.dayName}<br><small style="color:var(--text-muted); font-weight:normal;">${d.display}</small></th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        let myShiftsArray = [];

        caData.forEach(ca => {
            html += `<tr><td style="text-align: center; font-weight: bold; background: #f8fafc; border-right: 1px solid var(--border);">${ca.TenCa}</td>`;
            
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
                    ? `onclick="openStaffRegisterModal(${ca.ID}, '${ca.TenCa}', '${date.dbDate}', '${date.display}', '${currentNote}', ${myShift !== undefined})"` 
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
function openStaffRegisterModal(caId, tenCa, ngayLam, displayDate, currentNote, isAlreadyRegistered) {
    document.getElementById('staff-reg-shift-info').innerText = `${tenCa} - Ngày ${displayDate}`;
    document.getElementById('staff-reg-ca-id').value = caId;
    document.getElementById('staff-reg-date').value = ngayLam;
    document.getElementById('staff-reg-note').value = currentNote; 
    
    const btnCancel = document.getElementById('btn-cancel-staff-reg');
    const btnSubmit = document.getElementById('staff-register-shift-modal').querySelector('.btn-primary');
    
    if (btnCancel) {
        if (isAlreadyRegistered) {
            btnCancel.style.display = 'inline-block';
            btnCancel.onclick = function() { executeStaffRegisterShift(true); }; // Bấm để XÓA ca
            btnSubmit.innerHTML = 'Cập nhật ghi chú';
        } else {
            btnCancel.style.display = 'none';
            btnSubmit.innerHTML = 'Xác nhận Đăng ký';
        }
    }

    document.getElementById('staff-register-shift-modal').style.display = 'flex';
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
// MODULE: NHÂN VIÊN ĐIỂM DANH NHẬN CA (CHECK-IN)
// ======================================================
function renderDiemDanhNhanCa() {
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = document.getElementById('menu-nhangiaoca');
    if (menuLink) menuLink.classList.add('active');

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="margin-bottom: 24px;">
            <h1 class="page-title">Điểm danh Nhận ca</h1>
            <p class="text-muted">Nhấn nhận ca trước khi bắt đầu làm việc. Chú ý: Chỉ có thể nhận ca trước giờ làm tối đa 30 phút.</p>
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

    // Lấy ngày hôm nay (YYYY-MM-DD) theo múi giờ Local
    const todayStr = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10);
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));

    try {
        // GỌI SONG SONG 2 API ĐỂ LẤY LỊCH LÀM VÀ LỊCH SỬ BÀN GIAO CA
        const [lichRes, bgcRes] = await Promise.all([
            fetch(`${API_BASE_URL}/lich-lam-viec?tu_ngay=${todayStr}&den_ngay=${todayStr}`),
            fetch(`${API_BASE_URL}/ban-giao-ca?ngay=${todayStr}`, { headers: { 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` } })
        ]);

        const res = await lichRes.json();
        const resBgc = await bgcRes.json();

        if (res.success && resBgc.success) {
            const myShifts = (res.data || []).filter(l => String(l.ID_NhanVien) === String(currentUser.ID) && l.TrangThaiXepLich === 'DaDuyet');
            const allBgc = resBgc.data || []; // Chứa danh sách phiếu bàn giao ca hôm nay
            window.bgcTodayData = allBgc;

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
                
                // Tìm phiếu Bàn giao ca thuộc về Ca Làm Việc này
                const bgc = allBgc.find(b => String(b.ID_CaLamViec) === String(ca.ID));

                let statusHtml = '';
                let actionHtml = '';
                let borderStyle = '';

                // BƯỚC 1: CHƯA LÀM GÌ CẢ -> YÊU CẦU ĐIỂM DANH ĐẦU CA
                if (shift.TrangThaiDiemDanh === 'ChuaLam') {
                    borderStyle = 'border-top: 4px solid #f59e0b;';
                    statusHtml = `<span style="background: #fef3c7; color: #b45309; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;">Chưa điểm danh</span>`;
                    actionHtml = `<button class="btn-primary" style="width: 100%; margin-top: 15px; padding: 12px; font-size: 1rem;" onclick="executeDiemDanh(${shift.ID}, event)"><i class="fa-solid fa-fingerprint" style="margin-right: 8px;"></i> ĐIỂM DANH ĐẦU CA</button>`;
                } 
                // BƯỚC N: ĐÃ ĐIỂM DANH -> XỬ LÝ THEO CHỨC VỤ THỰC TẾ TRONG CA
                else if (shift.TrangThaiDiemDanh === 'DaLam') {
                    
                    // ==========================================
                    // LUỒNG DÀNH CHO THU NGÂN (Kiểm đếm két, nhận bàn giao)
                    // ==========================================
                    if (shift.CongViec === 'ThuNgan') {
                        if (!bgc) {
                            // BƯỚC 2: Đã điểm danh nhưng CHƯA CÓ PHIẾU NHẬN CA
                            borderStyle = 'border-top: 4px solid #3b82f6;';
                            statusHtml = `<span style="background: #eff6ff; color: #1d4ed8; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;"><i class="fa-solid fa-clipboard"></i> Chờ đếm tiền đầu ca</span>`;
                            actionHtml = `<button class="btn-primary" style="width: 100%; margin-top: 15px; padding: 12px; font-size: 1rem; background: #3b82f6; border-color: #3b82f6;" onclick="openNhanCaModal(${ca.ID}, '${ca.TenCa}')"><i class="fa-solid fa-file-invoice-dollar" style="margin-right: 8px;"></i> TẠO PHIẾU NHẬN CA</button>`;
                        } else if (bgc.TrangThai === 'DangTrongCa') {
                            // BƯỚC 3: Đã lập phiếu nhận, đang trong thời gian làm việc
                            borderStyle = 'border-top: 4px solid #10b981;';
                            const treHtml = shift.SoPhutDiMuon > 0 ? `<br><small style="color: #ef4444; font-weight: 500;">Đi muộn ${formatMinutesToHours(shift.SoPhutDiMuon)}</small>` : '';
                            statusHtml = `<div style="text-align: right;"><span style="background: #d1fae5; color: #047857; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;"><i class="fa-solid fa-user-clock"></i> Đang trong ca</span>${treHtml}</div>`;
                            actionHtml = `
                                <div style="display: flex; gap: 10px; margin-top: 15px;">
                                    <button class="btn-outline-sm" style="flex: 1; color: #3b82f6; border-color: #bfdbfe; background: #eff6ff;" onclick="openDanhSachPhieuChiModal(${bgc.ID})"><i class="fa-solid fa-list-ul"></i> Lịch sử Thu/Chi</button>
                                    <button class="btn-outline-sm" style="flex: 1; color: #ef4444; border-color: #fecaca; background: #fef2f2;" onclick="openLapPhieuChiModal(${bgc.ID})"><i class="fa-solid fa-money-bill-transfer"></i> Lập phiếu mới</button>
                                </div>
                                <button class="btn-primary" style="width: 100%; margin-top: 10px; padding: 12px; font-size: 1rem; background: #10b981; border-color: #10b981;" onclick="openGiaoCaModal(${bgc.ID}, '${ca.TenCa}')"><i class="fa-solid fa-arrow-right-arrow-left" style="margin-right: 8px;"></i> Bàn giao & Chốt ca</button>
                            `;
                        } else { 
                            // BƯỚC 4: CA ĐÃ ĐƯỢC CHỐT (DaChot hoặc ChotCuongChe)
                            borderStyle = 'border-top: 4px solid #64748b;';
                            statusHtml = `<span style="background: #f1f5f9; color: #475569; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;"><i class="fa-solid fa-lock"></i> Đã chốt sổ</span>`;
                            actionHtml = `<div style="text-align: center; margin-top: 15px; padding: 12px; background: #f8fafc; border-radius: 8px; color: #64748b; font-weight: bold;"><i class="fa-solid fa-clipboard-check"></i> Ca làm việc đã hoàn tất</div>`;
                        }
                    } 
                    // ==========================================
                    // LUỒNG DÀNH CHO PHỤC VỤ (Chỉ cần điểm danh có mặt là xong)
                    // ==========================================
                    else {
                        // Tính toán thời gian kết thúc ca để tự động đổi giao diện
                        const [endH, endM] = ca.GioKetThuc.split(':');
                        const [y, m, d] = todayStr.split('-');
                        let endTime = new Date(y, m - 1, d, endH, endM);
                        
                        // Nếu là ca qua đêm (Giờ kết thúc < Giờ bắt đầu)
                        if (endTime < new Date(y, m - 1, d, ca.GioBatDau.split(':')[0], ca.GioBatDau.split(':')[1])) {
                            endTime.setDate(endTime.getDate() + 1);
                        }

                        const isPastEnd = new Date() >= endTime; // Kiểm tra xem đã qua giờ kết thúc chưa

                        // Nếu ca đã bị đổi trạng thái (Do Thu Ngân chốt) HOẶC Đã qua giờ kết thúc ca
                        if (shift.TrangThaiXepLich === 'DaChotCa' || isPastEnd) {
                            borderStyle = 'border-top: 4px solid #64748b;';
                            statusHtml = `<span style="background: #f1f5f9; color: #475569; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;"><i class="fa-solid fa-lock"></i> Đã chốt sổ</span>`;
                            actionHtml = `<div style="text-align: center; margin-top: 15px; padding: 12px; background: #f8fafc; border-radius: 8px; color: #64748b; font-weight: bold;"><i class="fa-solid fa-clipboard-check"></i> Ca làm việc đã hoàn tất</div>`;
                        } else {
                            // Phục vụ đang trong ca làm việc, hiển thị trạng thái chờ
                            borderStyle = 'border-top: 4px solid #10b981;';
                            const treHtml = shift.SoPhutDiMuon > 0 ? `<br><small style="color: #ef4444; font-weight: 500;">Đi muộn ${formatMinutesToHours(shift.SoPhutDiMuon)}</small>` : '';
                            statusHtml = `<div style="text-align:right;"><span style="background: #d1fae5; color: #047857; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;"><i class="fa-solid fa-user-clock"></i> Đang trong ca</span>${treHtml}</div>`;
                            actionHtml = `<div style="text-align: center; margin-top: 15px; padding: 12px; background: #f8fafc; border-radius: 8px; color: #10b981; font-weight: bold;"></i> Hệ thống sẽ tự động chốt khi qua giờ kết thúc ca</div>`;
                        }
                    }
                } 
                // VẮNG MẶT
                else if (shift.TrangThaiDiemDanh === 'VangMat') {
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

// --- LOGIC PHIẾU NHẬN CA ---
window.openNhanCaModal = function(caId, tenCa) {
    document.getElementById('nc-ca-id').value = caId;
    
    // XÁC ĐỊNH TIỀN HỆ THỐNG GỢI Ý ĐẦU CA
    let tienHeThong = 200000; // Mặc định là 200.000đ cho Ca Sáng
    if (tenCa.toLowerCase().includes('tối') || tenCa.toLowerCase().includes('chiều')) {
        // Nếu là ca tối, tìm Phiếu Bàn Giao Ca của ca trước đó đã chốt
        const caTruoc = window.bgcTodayData ? window.bgcTodayData.find(b => b.TrangThai === 'DaChotCa' || b.TrangThai === 'ChotCuongChe') : null;
        if (caTruoc) {
            tienHeThong = Number(caTruoc.TienGiao);
        }
    }

    // Hiển thị thêm thông tin Tiền Hệ Thống lên giao diện
    document.getElementById('nc-info').innerHTML = `${tenCa} <br><span style="font-size:0.85rem; color:#64748b; font-weight:normal;">(Hệ thống báo trong két đang có: <strong style="color:#047857">${tienHeThong.toLocaleString('vi-VN')}đ</strong>)</span>`;
    
    document.getElementById('nc-tien-nhan').value = tienHeThong;
    document.getElementById('nc-ghi-chu').value = '';
    document.getElementById('nhan-ca-modal').style.display = 'flex';
};

window.submitNhanCa = async function() {
    const caId = document.getElementById('nc-ca-id').value;
    const tien = document.getElementById('nc-tien-nhan').value;
    const note = document.getElementById('nc-ghi-chu').value;
    const todayStr = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10);

    if (!tien || Number(tien) < 0) return showSystemModal("Lỗi", "Vui lòng nhập số tiền nhận đầu ca hợp lệ.", "error");

    const btn = document.getElementById('btn-submit-nc');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/ban-giao-ca/nhan-ca`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` },
            body: JSON.stringify({ id_ca_lam_viec: caId, ngay: todayStr, tien_nhan: tien, ghi_chu_nhan: note })
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
            document.getElementById('nhan-ca-modal').style.display = 'none';
            showSystemModal("Thành công", "Đã tạo phiếu nhận ca.", "success");
            loadDanhSachCaHomNay(); // Load lại lưới để đổi nút
        } else {
            showSystemModal("Lỗi", data.message, "error");
        }
    } catch(e) {
        showSystemModal("Lỗi mạng", "Kiểm tra kết nối", "error");
    } finally {
        btn.innerHTML = 'Tạo phiếu nhận ca';
        btn.disabled = false;
    }
};

// --- LOGIC PHIẾU THU/CHI ---
window.openLapPhieuChiModal = function(bgcId) {
    document.getElementById('pc-bgc-id').value = bgcId;
    document.getElementById('pc-so-tien').value = '';
    document.getElementById('pc-noi-dung').value = '';
    
    // Reset về Phiếu Chi mặc định mỗi khi mở
    document.querySelector('input[name="pc_loai_phieu"][value="Chi"]').checked = true;
    changePhieuType(); 
    
    document.getElementById('phieu-chi-modal').style.display = 'flex';
};

// Mở Modal xem danh sách Thu/Chi
window.openDanhSachPhieuChiModal = async function(bgcId) {
    const listContainer = document.getElementById('ds-phieu-chi-list');
    listContainer.innerHTML = '<div style="text-align:center; padding: 30px;"><i class="fa-solid fa-spinner fa-spin text-primary" style="font-size: 1.5rem;"></i><br><br>Đang tải dữ liệu...</div>';
    document.getElementById('danh-sach-phieu-chi-modal').style.display = 'flex';

    try {
        const response = await fetch(`${API_BASE_URL}/ban-giao-ca/${bgcId}/phieu-chi`, {
            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` }
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
            if (data.data.length === 0) {
                listContainer.innerHTML = `
                    <div style="text-align: center; padding: 30px; color: var(--text-muted);">
                        <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; color: #cbd5e1; margin-bottom: 10px;"></i><br>
                        Chưa có phát sinh Thu/Chi nào trong ca này.
                    </div>`;
                return;
            }
            
            let html = '';
            data.data.forEach(p => {
                // Theo logic ta đã quy ước: Số âm là Thu (Cộng tiền), Số dương là Chi (Trừ tiền)
                const isThu = Number(p.SoTien) < 0; 
                const color = isThu ? '#10b981' : '#ef4444';
                const sign = isThu ? '+' : '-';
                const val = Math.abs(Number(p.SoTien));
                const badge = isThu 
                    ? `<span style="background: #d1fae5; color: #047857; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold;">THU</span>`
                    : `<span style="background: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold;">CHI</span>`;
                
                const timeStr = p.ThoiGian ? p.ThoiGian.substring(11, 16) : ''; // Lấy HH:mm

                html += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px dashed #e2e8f0;">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; color: var(--text-dark); font-size: 0.95rem; margin-bottom: 4px;">${badge} ${p.NoiDung}</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> Lúc ${timeStr}</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="font-weight: bold; font-size: 1.05rem; color: ${color};">${sign}${val.toLocaleString('vi-VN')}đ</div>
                            <i class="fa-solid fa-trash-can" style="color: #cbd5e1; cursor: pointer; transition: 0.2s;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#cbd5e1'" onclick="executeXoaPhieuChi(${p.ID}, ${bgcId})"></i>
                        </div>
                    </div>
                `;
            });
            listContainer.innerHTML = html;
        } else {
            listContainer.innerHTML = '<div style="text-align:center; padding: 20px; color: red;">Lỗi tải dữ liệu.</div>';
        }
    } catch(e) {
        listContainer.innerHTML = '<div style="text-align:center; padding: 20px; color: red;">Mất kết nối máy chủ!</div>';
    }
};

window.executeXoaPhieuChi = function(idPhieu, bgcId) {
    // 1. Tạo Modal động nếu chưa có
    let modal = document.getElementById('xoa-phieu-chi-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'xoa-phieu-chi-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10000;';
        document.body.appendChild(modal);
    }

    // 2. Nạp nội dung HTML
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; text-align: center; padding: 30px 20px;">
            <div style="font-size: 3.5rem; color: #ef4444; margin-bottom: 15px;"><i class="fa-solid fa-trash-can"></i></div>
            <h3 style="margin-bottom: 10px; font-size: 1.4rem;">Xóa phiếu thu/chi</h3>
            <p style="color: var(--text-muted); margin-bottom: 25px; line-height: 1.5;">Bạn có chắc chắn muốn xóa dữ liệu này không? Hành động không thể hoàn tác.</p>
            <div style="display: flex; justify-content: center; gap: 12px;">
                <button class="btn-outline" style="width: auto; padding: 10px 24px;" onclick="document.getElementById('xoa-phieu-chi-modal').style.display='none'">Hủy bỏ</button>
                <button class="btn-primary" style="width: auto; padding: 10px 24px; background-color: #ef4444; border-color: #ef4444;" id="btn-confirm-xoa-phieu">Đồng ý xóa</button>
            </div>
        </div>
    `;
    
    // Hiển thị Modal nổi lên trên cùng
    modal.style.display = 'flex';

    // 3. Xử lý logic gọi API
    document.getElementById('btn-confirm-xoa-phieu').onclick = async function() {
        const btn = this;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xóa...';
        btn.disabled = true;

        try {
            const response = await fetch(`${API_BASE_URL}/ban-giao-ca/phieu-chi/${idPhieu}`, {
                method: 'DELETE',
                headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` }
            });
            const data = await response.json();
            
            if (response.ok && data.success) {
                modal.style.display = 'none';
                // Tận dụng hàm Toast có sẵn để báo hiệu
                showSystemModal("Thành công", "Đã xóa phiếu", "success");
                // Tải lại danh sách ngay trên Modal Lịch sử
                openDanhSachPhieuChiModal(bgcId);
            } else {
                modal.style.display = 'none';
                showSystemModal("Lỗi", data.message, "error");
            }
        } catch (e) {
            modal.style.display = 'none';
            showSystemModal("Lỗi mạng", "Kết nối thất bại", "error");
        }
    };
};

// Đổi màu sắc giao diện tuỳ theo Thu hay Chi
window.changePhieuType = function() {
    const isChi = document.querySelector('input[name="pc_loai_phieu"]:checked').value === 'Chi';
    const inputTien = document.getElementById('pc-so-tien');
    const btn = document.getElementById('btn-submit-pc');
    
    if (isChi) {
        inputTien.style.color = '#ef4444'; // Đỏ
        btn.style.background = '#ef4444';
        btn.style.borderColor = '#ef4444';
        btn.innerHTML = '<i class="fa-solid fa-arrow-down"></i> Lập Phiếu Chi';
    } else {
        inputTien.style.color = '#10b981'; // Xanh
        btn.style.background = '#10b981';
        btn.style.borderColor = '#10b981';
        btn.innerHTML = '<i class="fa-solid fa-arrow-up"></i> Lập Phiếu Thu';
    }
};

window.submitPhieuChi = async function() {
    const bgcId = document.getElementById('pc-bgc-id').value;
    const tien = document.getElementById('pc-so-tien').value;
    const noidung = document.getElementById('pc-noi-dung').value.trim();
    const loaiPhieu = document.querySelector('input[name="pc_loai_phieu"]:checked').value;

    if (!tien || Number(tien) < 1000 || !noidung) return showSystemModal("Lỗi", "Vui lòng nhập số tiền (tối thiểu 1000đ) và ghi rõ nội dung.", "error");

    const btn = document.getElementById('btn-submit-pc');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/ban-giao-ca/phieu-chi`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` },
            body: JSON.stringify({ id_ban_giao_ca: bgcId, loai_phieu: loaiPhieu, so_tien: tien, noi_dung: noidung })
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
            document.getElementById('phieu-chi-modal').style.display = 'none';
            showSystemModal("Thành công", data.message, "success");
        } else {
            showSystemModal("Lỗi", data.message, "error");
        }
    } catch(e) {
        showSystemModal("Lỗi", "Kết nối thất bại", "error");
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
};

// --- LOGIC BÀN GIAO & CHỐT CA ---
window.openGiaoCaModal = async function(bgcId, tenCa) {
    document.getElementById('gc-title-info').innerText = `Bàn Giao - ${tenCa}`;
    document.getElementById('gc-tien-nop').value = '';
    document.getElementById('gc-tien-giao').value = '';
    document.getElementById('gc-ghi-chu').value = '';
    document.getElementById('gc-bgc-id').value = bgcId;

    const btn = document.getElementById('btn-submit-gc');
    btn.disabled = true;

    const isCaToi = tenCa.toLowerCase().includes('tối') || tenCa.toLowerCase().includes('chiều');

    try {
        const response = await fetch(`${API_BASE_URL}/ban-giao-ca/${bgcId}/thong-tin-chot`, {
            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` }
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
            document.getElementById('gc-tien-nhan').innerText = Number(data.tien_nhan).toLocaleString('vi-VN') + 'đ';
            document.getElementById('gc-doanh-thu').innerText = '+' + Number(data.doanh_thu_tien_mat).toLocaleString('vi-VN') + 'đ';
            
            // XỬ LÝ HIỂN THỊ DẤU (+ / -) CHO THU/CHI PHÁT SINH
            let colorThuChi = '#ef4444';
            let signThuChi = '-';
            let absTongChi = Math.abs(Number(data.tong_chi));
            
            if (Number(data.tong_chi) < 0) { // Nếu DB lưu số âm -> Nghĩa là tổng Thu > Chi
                colorThuChi = '#10b981';
                signThuChi = '+';
            } else if (Number(data.tong_chi) > 0) { // Chi > Thu
                colorThuChi = '#ef4444';
                signThuChi = '-';
            } else {
                colorThuChi = 'var(--text-muted)';
                signThuChi = '';
            }

            document.getElementById('gc-tong-chi').innerText = `${signThuChi}${absTongChi.toLocaleString('vi-VN')}đ`;
            document.getElementById('gc-tong-chi').style.color = colorThuChi;
            
            const tienHT = Number(data.tien_he_thong);
            document.getElementById('gc-tien-he-thong').innerText = tienHT.toLocaleString('vi-VN') + 'đ';
            document.getElementById('gc-tien-he-thong-val').value = tienHT;

            const lblNop = document.getElementById('gc-tien-nop').previousElementSibling;
            if (lblNop) lblNop.innerHTML = 'Tiền nộp doanh thu <span style="color: red;">*</span>';

            const elNop = document.getElementById('gc-tien-nop');
            const elGiao = document.getElementById('gc-tien-giao');
            const groupNop = elNop.closest('.form-group');

            if (isCaToi) {
                if (groupNop) groupNop.style.display = 'block';
                let tienGiao = 200000;
                let tienNop = tienHT - 200000;
                
                if (tienNop < 0) {
                    tienNop = 0;
                    tienGiao = tienHT;
                }
                
                elNop.value = tienNop;
                elGiao.value = tienGiao;

                elNop.oninput = null;
                elGiao.oninput = null;
            } else {
                if (groupNop) groupNop.style.display = 'none';
                elNop.value = 0; 
                elGiao.value = tienHT;
                elNop.oninput = null; elGiao.oninput = null;
            }

            document.getElementById('giao-ca-modal').style.display = 'flex';
        } else {
            showSystemModal("Lỗi", "Không tải được số liệu chốt ca.", "error");
        }
    } catch(e) {
        showSystemModal("Lỗi", "Lỗi tải số liệu máy chủ", "error");
    } finally {
        btn.disabled = false;
    }
};

window.submitGiaoCa = async function() {
    const bgcId = document.getElementById('gc-bgc-id').value;
    const tienNop = document.getElementById('gc-tien-nop').value;
    const tienGiao = document.getElementById('gc-tien-giao').value;
    const tienHeThong = document.getElementById('gc-tien-he-thong-val').value;
    const ghiChu = document.getElementById('gc-ghi-chu').value.trim();

    if (tienNop === '' || tienGiao === '' || Number(tienNop) < 0 || Number(tienGiao) < 0) {
        return showSystemModal("Lỗi", "Vui lòng nhập tiền nộp và tiền giao hợp lệ (>= 0).", "error");
    }

    const lech = Number(tienHeThong) - (Number(tienNop) + Number(tienGiao));
    if (lech !== 0 && !ghiChu) {
        return showSystemModal("Cảnh báo", `Tiền thực tế đang lệch ${Math.abs(lech).toLocaleString('vi-VN')}đ so với hệ thống. Vui lòng ghi chú giải trình!`, "error");
    }

    const btn = document.getElementById('btn-submit-gc');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang chốt...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/ban-giao-ca/${bgcId}/giao-ca`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` },
            body: JSON.stringify({
                tien_giao: tienGiao,
                tien_nop_doanh_thu: tienNop,
                tien_he_thong: tienHeThong,
                ghi_chu_giao: ghiChu
            })
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
            document.getElementById('giao-ca-modal').style.display = 'none';
            showSystemModal("Tuyệt vời!", "Bàn giao ca thành công! Bạn có thể ra về.", "success");
            loadDanhSachCaHomNay(); // Đổi nút thành "Đã chốt sổ"
        } else {
            showSystemModal("Lỗi", data.message, "error");
        }
    } catch(e) {
        showSystemModal("Lỗi mạng", "Vui lòng thử lại", "error");
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-lock" style="margin-right: 8px;"></i> Chốt Bàn Giao';
        btn.disabled = false;
    }
};

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
// MODULE: NHÂN VIÊN - XEM & XÁC NHẬN BẢNG LƯƠNG
// ======================================================

function renderBangLuongStaff() {
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = document.getElementById('menu-bangluong-staff');
    if (menuLink) menuLink.classList.add('active');

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="margin-bottom: 24px;">
            <h1 class="page-title">Bảng Lương của Bạn</h1>
            <p class="text-muted">Theo dõi thu nhập và xác nhận thanh toán hàng tháng</p>
        </div>

        <!-- Khung hiển thị Lương Tạm Tính (Tháng Hiện Tại) -->
        <div class="panel" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; padding: 25px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.2);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 20px;">
                <div>
                    <h3 style="margin: 0 0 10px 0; color: #94a3b8; font-size: 1rem; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;"><i class="fa-solid fa-bolt" style="color: #f59e0b;"></i> Lương Tạm Tính Tháng Này</h3>
                    <div style="font-size: 2.5rem; font-weight: 800; color: #10b981; letter-spacing: -1px; text-shadow: 0 2px 10px rgba(16, 185, 129, 0.2);" id="staff-luong-tam-tinh">Đang tải...</div>
                </div>
                <div style="display: flex; gap: 15px;">
                    <div style="background: rgba(255,255,255,0.1); padding: 12px 20px; border-radius: 8px; text-align: center; min-width: 100px;">
                        <div style="font-size: 0.85rem; color: #cbd5e1; margin-bottom: 5px;">Số ca đã làm</div>
                        <div style="font-size: 1.2rem; font-weight: bold; color: white;" id="staff-ca-tam-tinh">--</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Danh sách Lịch sử Các kỳ lương -->
        <div class="panel">
            <div class="panel-header"><i class="fa-solid fa-clock-rotate-left"></i> Lịch sử các kỳ lương</div>
            <div class="table-responsive">
                <table class="admin-table">
                    <thead style="background: #F8FAFC;">
                        <tr>
                            <th>Kỳ Lương (Tháng)</th>
                            <th style="text-align: center;">Tổng ca</th>
                            <th style="text-align: right;">THỰC LÃNH</th>
                            <th style="text-align: center;">Trạng thái</th>
                            <th style="text-align: center;">Hành động</th>
                        </tr>
                    </thead>
                    <tbody id="staff-bang-luong-tbody">
                        <tr><td colspan="5" class="text-center" style="padding: 40px; text-align: center;"><i class="fa-solid fa-spinner fa-spin text-primary"></i> Đang tải dữ liệu...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    loadBangLuongStaffData();
}

async function loadBangLuongStaffData() {
    const tbody = document.getElementById('staff-bang-luong-tbody');
    const txtTamTinh = document.getElementById('staff-luong-tam-tinh');
    const txtCa = document.getElementById('staff-ca-tam-tinh');

    try {
        // 1. GỌI API LẤY LỊCH SỬ CÁC THÁNG ĐÃ CHỐT
        const historyRes = await fetch(`${API_BASE_URL}/nhan-vien/bang-luong`, {
            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` }
        });
        const historyData = await historyRes.json();

        if (historyData.success) {
            const list = historyData.data;

            if (list.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 40px; text-align: center;">Chưa có kỳ lương nào được chốt.</td></tr>`;
            } else {
                let html = '';
                list.forEach(item => {
                    let badgeHtml = '';
                    let actionHtml = '';

                    const btnDetail = `<button class="btn-outline-sm" style="padding: 4px 8px; margin-bottom: 5px; border-color: #cbd5e1; color: #475569;" onclick="openLuoiLichLuongModal(null, '${item.ThangNam}', '')"><i class="fa-solid fa-calendar-days"></i> Xem bảng công</button><br>`;

                    if (item.TrangThai === 'ChoXacNhan') {
                        badgeHtml = `<span style="background: #fef3c7; color: #b45309; padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;"><i class="fa-solid fa-bell fa-shake"></i> Chờ Xác Nhận</span>`;
                        actionHtml = btnDetail + `
                            <div style="display: flex; gap: 8px; justify-content: center; margin-top: 5px;">
                                <button class="btn-primary" style="background: #10b981; border-color: #10b981; padding: 6px 12px; font-size: 0.8rem;" onclick="staffMoXacNhanLuong(${item.ID})"><i class="fa-solid fa-check"></i> Xác nhận đúng</button>
                                <button class="btn-outline-sm" style="background: #fef2f2; border-color: #fecaca; color: #ef4444; padding: 6px 12px; font-size: 0.8rem;" onclick="staffMoKhieuNai(${item.ID})"><i class="fa-solid fa-triangle-exclamation"></i> Báo sai</button>
                            </div>
                        `;
                    } 
                    else if (item.TrangThai === 'KhieuNai') {
                        badgeHtml = `<span style="background: #fee2e2; color: #b91c1c; padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;">Đang chờ xử lý lại</span>`;
                        actionHtml = btnDetail + `<span style="color: #ef4444; font-size: 0.8rem; font-style: italic;">Quản lý đang xem xét...</span>`;
                    } 
                    else if (item.TrangThai === 'ChoThanhToan') {
                        badgeHtml = `<span style="background: #e0e7ff; color: #4338ca; padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;"><i class="fa-solid fa-money-check-dollar"></i> Chờ chuyển khoản</span>`;
                        actionHtml = btnDetail + `<span style="color: #4338ca; font-size: 0.8rem; font-style: italic;">Đã xác nhận lúc: ${item.NgayXacNhan ? item.NgayXacNhan.substring(0,10) : ''}</span>`;
                    } 
                    else if (item.TrangThai === 'DaThanhToan') {
                        badgeHtml = `<span style="background: #d1fae5; color: #047857; padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;"><i class="fa-solid fa-check-double"></i> Đã thanh toán</span>`;
                        actionHtml = btnDetail + `<span style="color: #047857; font-size: 0.8rem; font-style: italic;">Ngày CK: ${item.NgayThanhToan ? item.NgayThanhToan.substring(0,10) : ''}</span>`;
                    }

                    html += `
                        <tr>
                            <td><strong style="color: var(--text-dark); font-size: 1.05rem;">Kỳ tháng ${item.ThangNam}</strong></td>
                            <td style="text-align: center; font-weight: 500;">${item.TongCaLam} ca</td>
                            <td style="text-align: right;"><strong style="color: #2563eb; font-size: 1.15rem;">${Number(item.ThucLanh).toLocaleString('vi-VN')}đ</strong></td>
                            <td style="text-align: center; white-space: nowrap;">${badgeHtml}</td>
                            <td style="text-align: center;">${actionHtml}</td>
                        </tr>
                    `;
                });
                tbody.innerHTML = html;
            }
        }

        // 2. GỌI API LẤY LƯƠNG TẠM TÍNH THÁNG NÀY (Bằng cách tái sử dụng hàm xem chi tiết tháng hiện tại)
        const today = new Date();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        const curThangNam = `${mm}-${yyyy}`;

        const tamTinhRes = await fetch(`${API_BASE_URL}/bang-luong/chi-tiet?thang_nam=${curThangNam}`, {
            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` }
        });
        const tamTinhData = await tamTinhRes.json();

        if (tamTinhData.success && tamTinhData.tong_quan) {
            txtTamTinh.innerText = `${Number(tamTinhData.tong_quan.ThucLanh).toLocaleString('vi-VN')}đ`;
            txtCa.innerText = tamTinhData.tong_quan.TongCaLam;
        } else {
            txtTamTinh.innerText = '0đ';
            txtCa.innerText = '0';
        }

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Lỗi kết nối máy chủ!</td></tr>`;
        txtTamTinh.innerText = 'Lỗi!';
    }
}

// ---- LOGIC XÁC NHẬN VÀ NHẬP STK ----
function staffMoXacNhanLuong(id) {
    document.getElementById('staff-luong-id-to-confirm').value = id;
    
    // Reset Form
    document.getElementById('staff-luong-bank-name').value = '';
    document.getElementById('staff-luong-stk').value = '';
    document.getElementById('staff-luong-owner').value = '';

    document.getElementById('staff-xac-nhan-luong-modal').style.display = 'flex';
}

async function executeStaffXacNhanLuong() {
    const id = document.getElementById('staff-luong-id-to-confirm').value;
    const bank = document.getElementById('staff-luong-bank-name').value.trim();
    const stk = document.getElementById('staff-luong-stk').value.trim();
    const owner = document.getElementById('staff-luong-owner').value.trim();

    if (!bank || !stk || !owner) {
        return showSystemModal("Thiếu thông tin", "Vui lòng nhập đầy đủ Tên Ngân Hàng, STK và Tên người nhận để kế toán chuyển khoản chính xác.", "error");
    }

    const chuoiGop = `${bank} - ${stk} - ${owner.toUpperCase()}`;

    const btn = document.getElementById('btn-submit-xac-nhan-luong');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/nhan-vien/bang-luong/${id}/xac-nhan`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` },
            body: JSON.stringify({ thong_tin_ngan_hang: chuoiGop })
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
            document.getElementById('staff-xac-nhan-luong-modal').style.display = 'none';
            showSystemModal("Thành công", data.message, "success");
            loadBangLuongStaffData(); // Tải lại lưới
        } else {
            showSystemModal("Lỗi", data.message, "error");
        }
    } catch(e) {
        showSystemModal("Lỗi mạng", "Vui lòng kiểm tra kết nối", "error");
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Chốt & Gửi Yêu Cầu';
        btn.disabled = false;
    }
}

// ---- LOGIC BÁO SAI SÓT (KHIẾU NẠI) ----
function staffMoKhieuNai(id) {
    document.getElementById('staff-luong-id-to-khieu-nai').value = id;
    document.getElementById('staff-khieu-nai-lydo').value = '';
    document.getElementById('staff-khieu-nai-luong-modal').style.display = 'flex';
}

async function executeStaffKhieuNai() {
    const id = document.getElementById('staff-luong-id-to-khieu-nai').value;
    const lydo = document.getElementById('staff-khieu-nai-lydo').value.trim();

    if (!lydo) {
        return showSystemModal("Bắt buộc", "Vui lòng ghi rõ lý do để quản lý dễ dàng rà soát lại lịch làm của bạn.", "error");
    }

    const btn = document.getElementById('btn-submit-khieu-nai');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/nhan-vien/bang-luong/${id}/khieu-nai`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` },
            body: JSON.stringify({ ly_do: lydo })
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
            document.getElementById('staff-khieu-nai-luong-modal').style.display = 'none';
            showSystemModal("Thành công", data.message, "success");
            loadBangLuongStaffData(); // Tải lại lưới
        } else {
            showSystemModal("Lỗi", data.message, "error");
        }
    } catch(e) {
        showSystemModal("Lỗi mạng", "Vui lòng kiểm tra kết nối", "error");
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Gửi phản hồi';
        btn.disabled = false;
    }
}

async function openLuoiLichLuongModal(idNhanVien, thangNam, tenNhanVien = '') {
    const tbody = document.getElementById('luoi-lich-tbody');
    const tongQuanDiv = document.getElementById('luoi-lich-tong-quan');
    
    document.getElementById('luoi-lich-title').innerText = `Lịch làm việc tháng ${thangNam} ${tenNhanVien ? '- '+tenNhanVien : ''}`;
    tongQuanDiv.innerHTML = '<div style="text-align:center; width:100%;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải thông tin...</div>';
    tbody.innerHTML = '';
    
    document.getElementById('luoi-lich-luong-modal').style.display = 'flex';

    try {
        const url = idNhanVien 
            ? `${API_BASE_URL}/bang-luong/chi-tiet?id_nhan_vien=${idNhanVien}&thang_nam=${thangNam}` // Admin gọi
            : `${API_BASE_URL}/bang-luong/chi-tiet?thang_nam=${thangNam}`; // Nhân viên tự gọi chính mình

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` }
        });
        const res = await response.json();

        if (res.success) {
            const tq = res.tong_quan;
            const lichData = res.lich_thang;

            // 1. Vẽ Khung Tổng Quan
            // Tính lại thực lãnh ngay trên Frontend để đảm bảo luôn đúng 100% (cộng dồn từ dữ liệu trả về của Backend)
            const calculatedThucLanh = Number(tq.TongTienLuong) + Number(tq.TongTienThuong) - Number(tq.TongTienPhat);
            const finalThucLanh = calculatedThucLanh > 0 ? calculatedThucLanh : 0;

            tongQuanDiv.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <span style="font-size: 0.85rem; color: var(--text-muted);">Tổng số ca đi làm</span>
                    <strong style="color: var(--text-dark); font-size: 1.1rem;">${tq.TongCaLam} ca</strong>
                </div>
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <span style="font-size: 0.85rem; color: var(--text-muted);">Lương cơ bản</span>
                    <strong style="color: var(--text-dark); font-size: 1.1rem;">${Number(tq.TongTienLuong).toLocaleString('vi-VN')}đ</strong>
                </div>
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <span style="font-size: 0.85rem; color: var(--text-muted);">Tổng Thưởng / Phạt</span>
                    <strong style="font-size: 1.1rem;"><span style="color: #10b981;">+${Number(tq.TongTienThuong).toLocaleString('vi-VN')}đ</span> / <span style="color: #ef4444;">-${Number(tq.TongTienPhat).toLocaleString('vi-VN')}đ</span></strong>
                </div>
                <div style="display: flex; flex-direction: column; gap: 4px; padding-left: 15px; border-left: 2px solid #cbd5e1;">
                    <span style="font-size: 0.85rem; color: var(--text-muted);">Thực lãnh</span>
                    <strong style="color: #2563eb; font-size: 1.3rem;">${finalThucLanh.toLocaleString('vi-VN')}đ</strong>
                </div>
            `;

            // 2. Vẽ Lưới Lịch Chi Tiết
            if (lichData.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding: 30px;">Không có ca làm việc nào.</td></tr>`;
            } else {
                let html = '';
                lichData.forEach(l => {
                    const d = new Date(l.ngay_lam);
                    const dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
                    const dayName = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];
                    
                    const role = l.cong_viec === 'ThuNgan' ? 'Thu Ngân' : 'Phục Vụ';
                    
                    let bgStatus = '', iconStatus = '', txtStatus = '';
                    if (l.trang_thai_diem_danh === 'DaLam') {
                        bgStatus = 'background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;';
                        iconStatus = '<i class="fa-solid fa-circle-check"></i>';
                        txtStatus = 'Đã Đi Làm';
                    } else if (l.trang_thai_diem_danh === 'VangMat') {
                        bgStatus = 'background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca;';
                        iconStatus = '<i class="fa-solid fa-circle-xmark"></i>';
                        txtStatus = 'Vắng Mặt';
                    } else {
                        bgStatus = 'background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;';
                        iconStatus = '<i class="fa-solid fa-clock"></i>';
                        txtStatus = 'Chờ làm';
                    }

                    let tienHtml = '';
                    if (l.trang_thai_diem_danh === 'DaLam') {
                        tienHtml += `<div style="font-size: 0.85rem; color: var(--text-dark);">LCB: <strong>${Number(l.luong_co_ban).toLocaleString('vi-VN')}đ</strong></div>`;
                    }
                    if (l.tien_thuong > 0) tienHtml += `<div style="font-size: 0.85rem; color: #10b981;">Thưởng: <strong>+${Number(l.tien_thuong).toLocaleString('vi-VN')}đ</strong></div>`;
                    if (l.tien_phat > 0) tienHtml += `<div style="font-size: 0.85rem; color: #ef4444;">Phạt: <strong>-${Number(l.tien_phat).toLocaleString('vi-VN')}đ</strong></div>`;
                    if (l.ly_do) tienHtml += `<div style="font-size: 0.8rem; color: var(--text-muted); font-style: italic; max-width: 200px; margin-left: auto;">${l.ly_do}</div>`;

                    if (!tienHtml) tienHtml = '-';

                    html += `
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding-left: 20px;">
                                <strong style="color: var(--text-dark);">${dayName}</strong><br>
                                <span style="font-size: 0.85rem; color: var(--text-muted);">${dateStr}</span>
                            </td>
                            <td>
                                <strong style="color: var(--primary);">${l.ten_ca}</strong><br>
                                <span style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-solid fa-user-tag"></i> ${role}</span>
                            </td>
                            <td style="text-align: center;">
                                <span style="padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; display: inline-block; white-space: nowrap; ${bgStatus}">${iconStatus} ${txtStatus}</span>
                            </td>
                            <td style="text-align: right; padding-right: 20px;">
                                ${tienHtml}
                            </td>
                        </tr>
                    `;
                });
                tbody.innerHTML = html;
            }
        } else {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">${res.message}</td></tr>`;
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Lỗi kết nối máy chủ!</td></tr>`;
    }
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
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 40px;"><i class="fa-solid fa-spinner fa-spin text-primary"></i> Đang tải dữ liệu...</td></tr>`;
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
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 40px;">Tháng này bạn chưa đăng ký ca nào hoặc đơn đã bị từ chối.</td></tr>`;
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