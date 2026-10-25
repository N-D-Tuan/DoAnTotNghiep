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

    const urlParamsStaff = new URLSearchParams(window.location.search);
    const vnpayRefundStatus = urlParamsStaff.get('vnpay_refund');
    if (vnpayRefundStatus) {
        renderStaffQuanLyDatSan('All', '');
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
        renderManHinhThuNgan();
    }
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
        <div class="page-header" style="margin-bottom: 24px;">
            <h1 class="page-title">Trang cá nhân</h1>
            <p class="text-muted">Quản lý thông tin tài khoản nhân viên của bạn (Mã: <strong>${user.MaNguoiDung || user.ID}</strong>)</p>
        </div>

        ${bankWarningBanner}
        
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

        contentArea.innerHTML = `
            <div class="page-header" style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                <div>
                    <h1 class="page-title">Màn hình Thu Ngân - ${cs.TenCumSan}</h1>
                    <p class="text-muted">Tổng quan ca làm việc và thao tác xử lý lịch đặt sân.</p>
                </div>
                <button type="button" onclick="openStaffClusterReviewsModal('${cumSanId}', '${cs.TenCumSan.replace(/'/g, "\\'")}')" style="background: #fffbeb; border: 1.5px solid #fcd34d; color: #b45309; padding: 10px 18px; border-radius: 12px; font-weight: 700; font-size: 0.92rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 2px 6px rgba(245, 158, 11, 0.15);">
                    <i class="fa-solid fa-star" style="color: #f59e0b; font-size: 1.1rem;"></i>
                    <span>Đánh giá cơ sở: <strong>${avgStarStaff}</strong> (${countStarStaff} đánh giá)</span>
                </button>
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
                    <input type="text" id="staff-ds-search-input" class="form-control" style="padding-left: 35px;" placeholder="Tìm Mã vé (PT-..., GD-...), SĐT, Tên khách..." oninput="handleStaffDSSearch(this.value)">
                </div>
                <button type="button" class="btn-primary" style="display: inline-flex; align-items: center; gap: 8px; padding: 0 18px; background: #0f172a; border-color: #0f172a; white-space: nowrap;" onclick="openStaffQrScannerModal()">
                    <i class="fa-solid fa-qrcode"></i> Quét mã vé
                </button>
                <input type="date" class="form-control" style="width: 150px;" id="staff-ds-date-input" onchange="handleStaffDSDate(this.value)">
                <select class="form-control" id="staff-ds-status-select" style="width: 180px;" onchange="handleStaffDSFilter(this.value)">
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

function applyStaffDSFiltersAndRender() {
    // 1. Lọc theo CumSan của nhân viên đang đăng nhập
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    let filteredData = staffDatSanData;
    
    if (currentUser && (currentUser.MaCumSan || currentUser.ID_CumSan)) {
        const myCS = String(currentUser.MaCumSan || currentUser.ID_CumSan);
        filteredData = filteredData.filter(item => 
            item.san_bong && String(item.san_bong.MaCumSan || item.san_bong.ID_CumSan) === myCS
        );
    }

    const searchTerm = staffDSSearch.toLowerCase().trim().replace(/^#/, '');

    // 2. Tiếp tục lọc theo trạng thái, tìm kiếm (hỗ trợ cả mã mới & cũ) và ngày
    filteredData = filteredData.filter(item => {
        const matchStatus = (staffDSFilter === 'All' || item.TrangThai === staffDSFilter);

        const codeVariants = getStaffBookingCodeVariants(item);
        const matchCode = searchTerm !== '' && codeVariants.some(v => v.includes(searchTerm));

        const sdt = item.ID_NguoiDung ? (item.nguoi_dung?.SoDienThoai?.toLowerCase() || '') : (item.SDTKhachVangLai?.toLowerCase() || '');
        const tenKhach = item.ID_NguoiDung ? (item.nguoi_dung?.HoTen?.toLowerCase() || '') : (item.TenKhachVangLai?.toLowerCase() || '');
        const tenSan = item.san_bong ? item.san_bong.TenSan.toLowerCase() : '';
        const tenGiai = (item.ID_GiaiDau !== null && item.giai_dau) ? item.giai_dau.TenGiaiDau.toLowerCase() : '';

        const matchSearch = searchTerm === ''
                         || matchCode
                         || sdt.includes(searchTerm) 
                         || tenKhach.includes(searchTerm) 
                         || tenSan.includes(searchTerm)
                         || tenGiai.includes(searchTerm);
        
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
            ? staffDatSanData.filter(d => d.MaHoaDonDatSan === group.maHoaDon)
            : group.items;

        const activeDaCocCount = allMatchesInInvoice.filter(d => d.TrangThai === 'DaCoc').length;
        const hdObj = group.hoaDonObj;
        const tongHD = hdObj ? Number(hdObj.TongTien ?? hdObj.TongTienSan) : allMatchesInInvoice.reduce((s, d) => s + Number(d.TongTien), 0);
        const cocHD = hdObj ? Number(hdObj.TienDaCoc) : allMatchesInInvoice.reduce((s, d) => s + Number(d.TienCoc), 0);
        const conPhaiThuHD = (hdObj && hdObj.TrangThai === 'DaHuy') ? 0 : Math.max(0, tongHD - cocHD);

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
                actionHtml = `<button class="btn-primary" style="padding: 6px 12px; font-size: 0.85rem; white-space: nowrap;" onclick="event.stopPropagation(); openStaffDSConfirmModal('${item.ID}')">Chốt sân</button>`;
            } else {
                actionHtml = `<span style="color: var(--text-muted); font-size: 0.85rem; white-space: nowrap;">Đã xử lý</span>`;
            }

            const tenKhachHienThi = item.ID_NguoiDung ? (item.nguoi_dung?.HoTen || 'N/A') : (item.TenKhachVangLai || 'N/A');
            const sdtKhachHienThi = item.ID_NguoiDung ? (item.nguoi_dung?.SoDienThoai || '') : (item.SDTKhachVangLai || '');

            html += `<tr onclick="openBookingDetailModalStaff('${item.ID}')" style="cursor: pointer; transition: background-color 0.15s;" onmouseover="this.style.backgroundColor='#f8fafc'" onmouseout="this.style.backgroundColor=''">
                <td style="text-align: center; padding-left: 20px;">
                    <span style="padding: 5px 10px; border-radius: 8px; font-weight: 700; font-family: monospace; font-size: 0.9rem; display: inline-block; white-space: nowrap; ${badgeClassVe}">
                        ${maVeDisplay}
                    </span>
                </td>
                <td><strong>${tenKhachHienThi}</strong><br><span style="font-size: 0.85rem; color: var(--text-muted);">${sdtKhachHienThi}</span></td>
                <td>
                    <strong style="color: var(--text-dark);">${item.san_bong ? item.san_bong.TenSan : 'N/A'}</strong> ${tagLoai}
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
        <div class="modal-content" style="max-width: 640px; width: 94%; text-align: center; padding: 28px 24px; border-radius: 16px;">
            <h3 style="margin-bottom: 8px; font-size: 1.35rem; font-weight: 800; color: #0f172a;">Chốt trạng thái sân</h3>
            <p style="color: #64748b; margin-bottom: 24px; line-height: 1.5; font-size: 0.94rem;">Vui lòng xác nhận trạng thái cho khách hàng này.</p>
            <div style="display: flex; justify-content: center; align-items: center; gap: 10px; flex-wrap: wrap;">
                <button type="button" onclick="closeStaffDSConfirmModal()" style="padding: 10px 18px; border-radius: 10px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-weight: 600; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; transition: all 0.2s ease;" onmouseover="this.style.background='#f1f5f9'; this.style.borderColor='#94a3b8'; this.style.color='#0f172a';" onmouseout="this.style.background='#ffffff'; this.style.borderColor='#cbd5e1'; this.style.color='#475569';">
                    Hủy bỏ
                </button>
                <button type="button" onclick="openStaffCancelConfirmModal()" style="padding: 10px 16px; border-radius: 10px; border: 1px solid #fecaca; background: #fef2f2; color: #ef4444; font-weight: 600; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; transition: all 0.2s ease;" onmouseover="this.style.background='#fee2e2'; this.style.borderColor='#fca5a5';" onmouseout="this.style.background='#fef2f2'; this.style.borderColor='#fecaca';">
                    <i class="fa-solid fa-ban"></i> Hủy sân & Hoàn tiền
                </button>
                <button type="button" onclick="executeStaffCapNhatDatSan('KhongDen')" style="padding: 10px 16px; border-radius: 10px; border: 1px solid #cbd5e1; background: #f8fafc; color: #475569; font-weight: 600; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; transition: all 0.2s ease;" onmouseover="this.style.background='#e2e8f0'; this.style.color='#1e293b';" onmouseout="this.style.background='#f8fafc'; this.style.color='#475569';">
                    <i class="fa-solid fa-user-slash"></i> Không đến
                </button>
                <button type="button" onclick="executeStaffCapNhatDatSan('HoanThanh')" style="padding: 10px 20px; border-radius: 10px; border: 1px solid #10b981; background: #10b981; color: #ffffff; font-weight: 700; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; box-shadow: 0 4px 10px rgba(16, 185, 129, 0.25); transition: all 0.2s ease;" onmouseover="this.style.background='#059669'; this.style.borderColor='#059669';" onmouseout="this.style.background='#10b981'; this.style.borderColor='#10b981';">
                    <i class="fa-solid fa-check"></i> Hoàn thành
                </button>
            </div>
        </div>`;
    modal.style.display = 'flex';
}

function closeStaffDSConfirmModal() { 
    const modal = document.getElementById('staff-ds-confirm-modal');
    if(modal) modal.style.display = 'none'; 
}

function isOfflineBookedItemStaff(item) {
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
    const isOffline = isOfflineBookedItemStaff(item);

    if (isMember) {
        const kh = item.nguoi_dung || {};
        const tenKhach = kh.HoTen || 'N/A';
        const tienCocStr = Number(item.TienCoc || 0).toLocaleString('vi-VN') + 'đ';

        const offlineOptionsHtml = isOffline ? `
            <div style="text-align: left; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; margin-bottom: 18px;">
                <div style="font-size: 0.84rem; font-weight: 700; color: #0f172a; margin-bottom: 10px;">
                    <i class="fa-solid fa-hand-holding-dollar" style="color: var(--primary); margin-right: 5px;"></i>
                    Đơn đặt sân hộ — Chọn hình thức hoàn tiền cọc (${tienCocStr}):
                </div>
                <label style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: #fff; border: 1px solid #e2e8f0; cursor: pointer; margin-bottom: 8px; font-size: 0.88rem; font-weight: 600; color: #1e293b;">
                    <input type="radio" name="staff_single_refund_method" value="chuyen_khoan" checked onchange="toggleSingleCancelRefundMethod('staff_single')">
                    <span><i class="fa-solid fa-building-columns" style="color: #2563eb; margin-right: 5px;"></i> Hoàn tiền bằng Chuyển khoản ngân hàng</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: #fff; border: 1px solid #e2e8f0; cursor: pointer; font-size: 0.88rem; font-weight: 600; color: #1e293b;">
                    <input type="radio" name="staff_single_refund_method" value="vi" onchange="toggleSingleCancelRefundMethod('staff_single')">
                    <span><i class="fa-solid fa-wallet" style="color: #10b981; margin-right: 5px;"></i> Hoàn tiền vào Ví tài khoản (${tenKhach})</span>
                </label>

                <div id="staff_single-bank-refund-box" style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #cbd5e1; display: block;">
                    <div style="margin-bottom: 8px;">
                        <label style="font-size: 0.8rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Tên ngân hàng nhận <span style="color:red;">*</span></label>
                        <input type="text" id="staff_single_bank_name" class="form-control" placeholder="VD: Vietcombank, MB Bank..." value="${kh.TenNganHang || ''}" style="height: 36px; font-size: 0.86rem;">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <div>
                            <label style="font-size: 0.8rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Số tài khoản <span style="color:red;">*</span></label>
                            <input type="text" id="staff_single_bank_stk" class="form-control" placeholder="Nhập STK..." value="${kh.STKNganHang || ''}" style="height: 36px; font-size: 0.86rem; font-family: monospace;">
                        </div>
                        <div>
                            <label style="font-size: 0.8rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Chủ tài khoản <span style="color:red;">*</span></label>
                            <input type="text" id="staff_single_bank_owner" class="form-control" placeholder="TÊN IN HOA..." value="${kh.TenTaiKhoan || tenKhach.toUpperCase()}" style="height: 36px; font-size: 0.86rem; text-transform: uppercase;">
                        </div>
                    </div>
                </div>
            </div>
        ` : `
            <p style="color: #64748b; margin-bottom: 26px; line-height: 1.6; font-size: 0.92rem;">
                Khách hàng thành viên: <strong style="color: #0f172a;">${tenKhach}</strong>.<br>
                Hệ thống sẽ <strong style="color: #0f172a;">HỦY LỊCH</strong> và tự động <strong style="color: #0f172a;">HOÀN TRẢ 100% TIỀN CỌC (${tienCocStr})</strong> vào ví khách hàng.
            </p>
        `;

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 460px; width: 92%; text-align: center; padding: 26px 24px; border-radius: 16px;">
                <div style="font-size: 3.2rem; color: #ef4444; margin-bottom: 10px;"><i class="fa-solid fa-triangle-exclamation"></i></div>
                <h3 style="margin-bottom: 10px; font-size: 1.3rem; font-weight: 800; color: #0f172a;">Xác nhận Hủy Sân ${isOffline ? '(Đặt hộ)' : ''}</h3>
                <div id="staff-member-cancel-alert" class="modal-alert" style="display: none; margin: 0 0 12px 0; text-align: left;"></div>
                ${offlineOptionsHtml}
                <div style="display: flex; justify-content: center; gap: 12px;">
                    <button type="button" onclick="closeStaffCancelConfirmModal()" style="flex: 1; padding: 10px 18px; border-radius: 10px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-weight: 600; font-size: 0.92rem; cursor: pointer;">
                        Hủy bỏ
                    </button>
                    <button type="button" id="btn-staff-confirm-member-cancel" onclick="confirmMemberCancelStaff(${isOffline})" style="flex: 1.3; padding: 10px 18px; border-radius: 10px; border: 1px solid #ef4444; background: #ef4444; color: #ffffff; font-weight: 700; font-size: 0.92rem; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px;">
                        Hủy & Hoàn tiền
                    </button>
                </div>
            </div>`;
    } else {
        // LUỒNG 2: KHÁCH VÃNG LAI (Xác thực OTP qua Email)
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 440px; width: 92%; padding: 24px; text-align: left; border-radius: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0;">
                    <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800; color: #0f172a;"><i class="fa-solid fa-user-check" style="color: #ef4444; margin-right: 6px;"></i> Hủy sân Khách vãng lai</h3>
                    <i class="fa-solid fa-xmark" style="cursor: pointer; color: #64748b; font-size: 1.15rem;" onclick="closeStaffCancelConfirmModal()"></i>
                </div>

                <div id="staff-guest-cancel-alert" class="modal-alert" style="display: none; margin: 0 0 12px 0;"></div>

                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; font-size: 0.88rem; line-height: 1.65;">
                    <div>Khách vãng lai: <strong style="color: #0f172a;">${item.TenKhachVangLai || 'N/A'}</strong> (${item.SDTKhachVangLai || ''})</div>
                    <div>Email nhận OTP: <strong style="color: #2563eb;">${item.EmailKhachVangLai || 'Chưa có'}</strong></div>
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

async function confirmMemberCancelStaff(isOffline = false) {
    const alertBox = document.getElementById('staff-member-cancel-alert');
    let extraPayload = { phuong_thuc_hoan: 'vi' };

    if (isOffline) {
        const method = document.querySelector('input[name="staff_single_refund_method"]:checked')?.value || 'vi';
        extraPayload.phuong_thuc_hoan = method;

        if (method === 'chuyen_khoan') {
            const nganHang = document.getElementById('staff_single_bank_name')?.value.trim() || '';
            const stk = document.getElementById('staff_single_bank_stk')?.value.trim() || '';
            const owner = document.getElementById('staff_single_bank_owner')?.value.trim().toUpperCase() || '';

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

    const btn = document.getElementById('btn-staff-confirm-member-cancel');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';

    const ok = await executeStaffCapNhatDatSan('DaHuy', null, alertBox, extraPayload);
    if (ok) {
        closeStaffCancelConfirmModal();
    } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-trash"></i> Xác nhận Hủy & Hoàn tiền';
    }
}

async function executeStaffCapNhatDatSan(trangThai, otp = null, customAlertBox = null, extraPayload = {}) {
    if (!pendingStaffDSId) return false;
    closeStaffDSConfirmModal(); 

    try {
        const payload = { 
            trang_thai: trangThai, 
            return_url: window.location.origin + window.location.pathname,
            ...extraPayload 
        };
        if (otp) payload.otp = otp;

        const response = await fetch(`${API_BASE_URL}/admin/dat-san/${pendingStaffDSId}/chot`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
            if (data.vnpay_url) {
                window.location.href = data.vnpay_url;
                return true;
            }
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

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="margin-bottom: 24px;">
            <h1 class="page-title">Điểm danh Ca làm việc</h1>
            <p class="text-muted">Nhấn điểm danh khi bắt đầu ca làm việc hôm nay. Chú ý: Bạn có thể điểm danh trước giờ bắt đầu ca tối đa 30 phút.</p>
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
        const listDatSan = hd.dat_sans || hd.datSans || [];
        const first = listDatSan[0] || {};
        const tenKhach = hd.nguoi_dung?.HoTen || first.TenNguoiDat || first.TenKhachVangLai || 'Khách hàng';
        const sdtKhach = hd.nguoi_dung?.SoDienThoai || first.SDTNguoiDat || first.SDTKhachVangLai || '';
        const ngayLap = hd.NgayTao ? new Date(hd.NgayTao).toLocaleString('vi-VN') : '';
        const statusMap = { 'DaCoc': 'Đã đặt cọc', 'HoanThanh': 'Đã hoàn thành', 'DaHuy': 'Đã hủy', 'KhongDen': 'Không đến' };

        let tongTienSanGoc = 0;       // Tổng đơn giá gốc của các trận (DaCoc + HoanThanh)
        let tongCocKhongDen = 0;      // Tổng tiền cọc giữ lại của các trận (KhongDen)

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
            } else if (ds.TrangThai === 'KhongDen') {
                tongCocKhongDen += tienCocTran;
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

        const tongTien = Number(hd.TongTien ?? hd.TongTienSan ?? 0);
        const thueVAT = Number(hd.ThueVAT || 0);
        const kmObj = hd.khuyen_mai || hd.khuyenMai || null;

        // Tiền sau giảm của các trận (DaCoc + HoanThanh) = Tổng hóa đơn - Thuế VAT - Tiền cọc các trận Không đến
        const tienSauGiamChiuThue = Math.max(0, tongTien - thueVAT - tongCocKhongDen);
        const soTienGiam = (hd.MaKhuyenMai && tongTienSanGoc > 0)
            ? Math.max(0, tongTienSanGoc - tienSauGiamChiuThue)
            : 0;

        const tienCoc = Number(hd.TienDaCoc || 0);
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
                    ${tongTienSanGoc > 0 ? `<div style="display:flex; justify-content:space-between; margin-bottom:6px;"><span>Tổng tiền sân gốc:</span><strong>${tongTienSanGoc.toLocaleString('vi-VN')}đ</strong></div>` : ''}
                    ${tongCocKhongDen > 0 ? `<div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#64748b;"><span>Tiền cọc trận không đến:</span><strong>${tongCocKhongDen.toLocaleString('vi-VN')}đ</strong></div>` : ''}
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