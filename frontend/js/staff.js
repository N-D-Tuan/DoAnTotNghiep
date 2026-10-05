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
        });

    // Lắng nghe kênh CÁ NHÂN của chính nhân viên này
    window.Echo.private(`user.${currentUser.ID}`)
        .listen('.UserDataUpdated', async (e) => {
            console.log('⚡ Nhận được thông báo cá nhân!');
            
            await loadNotifications();

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

function showPasswordAlert(message, isSuccess) {
    const alertBox = document.getElementById('password-alert');
    alertBox.textContent = message;
    alertBox.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alertBox.style.display = 'block';
    setTimeout(() => alertBox.style.display = 'none', 2500);
}

function openChangePasswordModal() {
    const user = JSON.parse(sessionStorage.getItem('dn_football_user'));
    if (!user) return;

    document.getElementById('password-alert').style.display = 'none';
    document.getElementById('pwd-step-1').style.display = 'block';
    document.getElementById('pwd-step-2').style.display = 'none';
    document.getElementById('pwd-otp').value = '';
    document.getElementById('new-password').value = '';
    
    document.getElementById('pwd-user-email').textContent = user.Email;
    document.getElementById('password-modal').style.display = 'flex';

    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const pwdMenu = Array.from(document.querySelectorAll('.sidebar-nav a')).find(a => a.textContent.includes('ĐỔI MẬT KHẨU'));
    if (pwdMenu) pwdMenu.classList.add('active');
}

function closeChangePasswordModal() { document.getElementById('password-modal').style.display = 'none'; }

async function sendPasswordOTP() {
    const btn = document.getElementById('btn-send-otp');
    btn.disabled = true; btn.textContent = 'Đang gửi mã...';
    const user = JSON.parse(sessionStorage.getItem('dn_football_user'));

    try {
        const response = await fetch(`${API_BASE_URL}/gui-otp`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.Email })
        });
        const data = await response.json();

        if (!response.ok) {
            showPasswordAlert(data.message || 'Lỗi gửi OTP', false);
            btn.disabled = false; btn.textContent = 'Gửi mã OTP';
            return;
        }

        showPasswordAlert('Đã gửi mã đến email!', true);
        document.getElementById('pwd-step-1').style.display = 'none';
        document.getElementById('pwd-step-2').style.display = 'block';

    } catch (error) {
        showPasswordAlert('Lỗi mạng', false);
    } finally {
        btn.disabled = false; btn.textContent = 'Gửi mã OTP';
    }
}

async function verifyAndChangePassword() {
    const otp = document.getElementById('pwd-otp').value.trim();
    const newPassword = document.getElementById('new-password').value;
    const btn = document.getElementById('btn-confirm-pwd');

    if (otp.length !== 6) return showPasswordAlert('Mã OTP phải 6 số', false);
    if (newPassword.length < 6) return showPasswordAlert('Mật khẩu tối thiểu 6 ký tự', false);

    btn.disabled = true; btn.textContent = 'Đang xử lý...';
    const user = JSON.parse(sessionStorage.getItem('dn_football_user'));

    try {
        const response = await fetch(`${API_BASE_URL}/dat-lai-mat-khau`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.Email, otp: otp, mat_khau_moi: newPassword })
        });
        const data = await response.json();

        if (!response.ok) {
            showPasswordAlert(data.message || 'OTP không hợp lệ', false);
            btn.disabled = false; btn.textContent = 'Xác nhận đổi mật khẩu';
            return;
        }

        showPasswordAlert('Đổi mật khẩu thành công!', true);
        setTimeout(() => {
            closeChangePasswordModal();
            btn.disabled = false; btn.textContent = 'Xác nhận đổi mật khẩu';
        }, 2000);

    } catch (error) {
        showPasswordAlert('Lỗi mạng', false);
        btn.disabled = false; btn.textContent = 'Xác nhận đổi mật khẩu';
    }
}

// ======================================================
// MODULE: MÀN HÌNH THU NGÂN (ĐẶT SÂN HỘ)
// ======================================================
async function renderManHinhThuNgan() {
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    if (!currentUser || currentUser.VaiTro !== 'NhanVien') return;
    
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

        // 3. TÍNH TOÁN THỐNG KÊ NGÀY HÔM NAY CHO NHÂN VIÊN
        const todayStr = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10);
        let soTranHomNay = 0;
        let choNhanSan = 0; // Trạng thái DaCoc
        let hoanThanh = 0;  // Trạng thái HoanThanh
        let tongDoanhThu = 0;

        try {
            const dsResponse = await fetch(`${API_BASE_URL}/admin/dat-san`);
            const dsRes = await dsResponse.json();
            if (dsRes.success) {
                // Lọc những trận của ngày hôm nay VÀ thuộc cụm sân của nhân viên
                const datSanHnay = dsRes.data.filter(item => 
                    item.NgayDa === todayStr && 
                    item.san_bong && 
                    item.san_bong.ID_CumSan === cumSanId
                );
                
                soTranHomNay = datSanHnay.length;
                choNhanSan = datSanHnay.filter(i => i.TrangThai === 'DaCoc').length;
                hoanThanh = datSanHnay.filter(i => i.TrangThai === 'HoanThanh').length;
                
                datSanHnay.forEach(i => {
                    const isGiaiDau = i.ID_GiaiDau !== null;
                    
                    if (i.TrangThai === 'HoanThanh' || isGiaiDau) {
                        tongDoanhThu += Number(i.TongTien);
                    } else if (i.TrangThai === 'KhongDen') {
                        tongDoanhThu += Number(i.TienCoc || 0);
                    }
                });
            }
        } catch(e) { console.log('Không tải được thống kê hôm nay', e); }

        // 4. Tạo Giao diện chọn sân dạng Card đẹp mắt
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

        // 5. RENDER TOÀN BỘ GIAO DIỆN
        contentArea.innerHTML = `
            <div class="page-header" style="margin-bottom: 24px;">
                <h1 class="page-title">Màn hình Thu Ngân - ${cs.TenCumSan}</h1>
                <p class="text-muted">Tổng quan ca làm việc và thao tác xử lý lịch đặt sân.</p>
            </div>

            <!-- BỔ SUNG: KHU VỰC THỐNG KÊ NHANH TRONG NGÀY -->
            <div class="stat-grid" style="margin-bottom: 24px;">
                <div class="stat-card" style="border-left: 4px solid #3b82f6;">
                    <div class="stat-title">Lịch đá hôm nay</div>
                    <div class="stat-value" style="color: #1e293b;">${soTranHomNay} <span style="font-size: 1rem; font-weight: 500; color: #64748b;">trận</span></div>
                </div>
                <div class="stat-card" style="border-left: 4px solid #f59e0b;">
                    <div class="stat-title">Chờ nhận sân (Check-in)</div>
                    <div class="stat-value" style="color: #d97706;">${choNhanSan} <span style="font-size: 1rem; font-weight: 500; color: #64748b;">khách</span></div>
                </div>
                <div class="stat-card" style="border-left: 4px solid #10b981;">
                    <div class="stat-title">Đã hoàn thành (Ra về)</div>
                    <div class="stat-value" style="color: #047857;">${hoanThanh} <span style="font-size: 1rem; font-weight: 500; color: #64748b;">trận</span></div>
                </div>
                <div class="stat-card" style="border-left: 4px solid #8b5cf6;">
                    <div class="stat-title">Doanh thu sân</div>
                    <div class="stat-value" style="color: #6d28d9;">${tongDoanhThu.toLocaleString('vi-VN')}đ</div>
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

    } catch (error) {
        contentArea.innerHTML = `<div style="text-align:center; color:red; padding: 50px;">Lỗi tải dữ liệu cơ sở!</div>`;
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
    const alertBox = document.getElementById('offline-booking-alert');
    alertBox.style.display = 'none';

    if (!sdt) {
        alertBox.textContent = "Số điện thoại khách hàng là bắt buộc!";
        alertBox.className = "modal-alert error";
        alertBox.style.display = "block";
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
            alertBox.textContent = "Giữ sân thành công!";
            alertBox.className = "modal-alert success";
            alertBox.style.display = "block";
            
            const bookedSlotIds = selectedOfflineSlots.map(s => s.id);
            selectedOfflineSlots = []; 
            updateOfflineCartUI();     
            
            bookedSlotIds.forEach(id => {
                const el = document.querySelector(`.schedule-table .slot[data-slot-id="${id}"]`);
                if (el) {
                    el.classList.remove('selected', 'available');
                    el.classList.add('booked');
                    el.innerText = 'Đã đặt';
                    el.removeAttribute('onclick');
                }
            });

            setTimeout(() => {
                closeOfflineModal();
                btn.disabled = false;
                btn.innerHTML = 'Chốt giữ sân';
            }, 1500);
            
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
        const sdt = item.nguoi_dung ? item.nguoi_dung.SoDienThoai.toLowerCase() : '';
        const tenKhach = item.nguoi_dung ? item.nguoi_dung.HoTen.toLowerCase() : '';
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

        let actionHtml = '';
        if (item.TrangThai === 'DaCoc') {
            actionHtml = `<button class="btn-primary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="openStaffDSConfirmModal(${item.ID})">Chốt sân</button>`;
        } else {
            actionHtml = `<span style="color: var(--text-muted); font-size: 0.85rem;">Đã xử lý</span>`;
        }

        return `<tr>
            <td style="text-align: center;"><span style="padding: 6px 12px; border-radius: 8px; font-weight: 700; font-family: monospace; font-size: 0.95rem; display: inline-block; white-space: nowrap; ${badgeClassVe}">${maVeDisplay}</span></td>
            <td><strong>${item.nguoi_dung?.HoTen || 'N/A'}</strong><br><span style="font-size: 0.85rem; color: var(--text-muted);">${item.nguoi_dung?.SoDienThoai || ''}</span></td>
            <td><strong style="color: var(--text-dark);">${item.san_bong ? item.san_bong.TenSan : 'N/A'}</strong> ${tagLoai}</td>
            <td><span style="font-size: 0.9rem;">Ngày: ${dateStr}</span><br><strong style="color: var(--primary);">Giờ: ${timeStr}</strong></td>
            <td><strong style="color: #ea580c;">${tienThu.toLocaleString('vi-VN')}đ</strong></td>
            <td>${badgeHtml}</td>
            <td style="text-align: center;">${actionHtml}</td>
        </tr>`;
    }).join('');
}

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

async function executeStaffCapNhatDatSan(trangThai) {
    if (!pendingStaffDSId) return;
    closeStaffDSConfirmModal(); 

    try {
        const response = await fetch(`${API_BASE_URL}/admin/dat-san/${pendingStaffDSId}/chot`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` },
            body: JSON.stringify({ trang_thai: trangThai })
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
            showStaffDSAlert('Đã cập nhật trạng thái thành công!', true);
            loadStaffDanhSachDatSan();
        } else {
            showStaffDSAlert(data.message || 'Lỗi xử lý.', false);
        }
    } catch (e) {
        showStaffDSAlert('Lỗi kết nối máy chủ.', false);
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