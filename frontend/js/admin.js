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
            if(document.getElementById('menu-xuatnhap-admin')) document.getElementById('menu-xuatnhap-admin').style.display = 'none';

            // HIỆN menu đặc quyền của Quản lý sân
            if(document.getElementById('menu-sancuatoi')) document.getElementById('menu-sancuatoi').style.display = 'flex';
            if(document.getElementById('menu-datsan')) document.getElementById('menu-datsan').style.display = 'flex';
            if(document.getElementById('menu-giaidau')) document.getElementById('menu-giaidau').style.display = 'flex';
            if(document.getElementById('menu-huysan')) document.getElementById('menu-huysan').style.display = 'flex';
            if(document.getElementById('menu-kho')) document.getElementById('menu-kho').style.display = 'flex';
            if(document.getElementById('menu-lichlamviec')) document.getElementById('menu-lichlamviec').style.display = 'flex';
            if(document.getElementById('menu-bangluong-admin')) document.getElementById('menu-bangluong-admin').style.display = 'flex';

            if(menuKhachHang) menuKhachHang.innerHTML = '<i class="fa-solid fa-users"></i> QUẢN LÝ TÀI KHOẢN';
        } 
        else if (currentUser.VaiTro === 'Admin') {
            // Admin nền tảng: TUYỆT ĐỐI ẨN menu đặc quyền của Quản lý sân
            if(document.getElementById('menu-sancuatoi')) document.getElementById('menu-sancuatoi').style.display = 'none';
            if(document.getElementById('menu-datsan')) document.getElementById('menu-datsan').style.display = 'none';
            if(document.getElementById('menu-giaidau')) document.getElementById('menu-giaidau').style.display = 'none';
            if(document.getElementById('menu-huysan')) document.getElementById('menu-huysan').style.display = 'none';
            if(document.getElementById('menu-kho')) document.getElementById('menu-kho').style.display = 'none';
            if(document.getElementById('menu-lichlamviec')) document.getElementById('menu-lichlamviec').style.display = 'none';

            // Đảm bảo hiển thị đầy đủ menu của Admin
            if(document.getElementById('menu-cumsan')) document.getElementById('menu-cumsan').style.display = 'flex';
            if(document.getElementById('menu-bangluong-admin')) {
                const menuBL = document.getElementById('menu-bangluong-admin');
                menuBL.style.display = 'flex';
                menuBL.innerHTML = '<i class="fa-solid fa-money-check-dollar"></i> XEM BẢNG LƯƠNG';
            }
            if(document.getElementById('menu-captaikhoan')) document.getElementById('menu-captaikhoan').style.display = 'flex';
            if(document.getElementById('menu-xuatnhap-admin')) document.getElementById('menu-xuatnhap-admin').style.display = 'flex';

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
        // RENDER TỔNG QUAN KHI ĐĂNG NHẬP
        // ==============================================
        renderTongQuan();

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

                // 2. CẬP NHẬT REALTIME KHO HÀNG
                // Nếu Quản lý đang mở Tab Danh sách Sản phẩm
                if (document.getElementById('tab-sanpham') && document.getElementById('tab-sanpham').style.display !== 'none') {
                    if (currentUser.ID_CumSan) loadDanhSachSanPhamKho(currentUser.ID_CumSan);
                }
                // Nếu Quản lý đang mở Tab Lịch sử Nhập hàng
                if (document.getElementById('tab-phieunhap') && document.getElementById('tab-phieunhap').style.display !== 'none') {
                    if (currentUser.ID_CumSan) loadLichSuNhapHang(currentUser.ID_CumSan);
                }
                // Nếu Quản lý đang mở Tab Hóa đơn bán hàng
                if (document.getElementById('tab-hoadon') && document.getElementById('tab-hoadon').style.display !== 'none') {
                    if (currentUser.ID_CumSan) loadQuanLyHoaDonBanHang(currentUser.ID_CumSan);
                }

                // 3. CẬP NHẬT REALTIME LỊCH LÀM VIỆC
                const currentTabAdmin = document.getElementById('admin-cal-current');
                const nextTabAdmin = document.getElementById('admin-cal-next');
                const chamCongTabAdmin = document.getElementById('admin-cal-chamcong');
                const giaoCaTabAdmin = document.getElementById('admin-cal-giaoca');
                
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

                // Nếu Quản lý đang đứng ở Tab "Lịch Sử Giao Ca"
                if (giaoCaTabAdmin && giaoCaTabAdmin.style.display !== 'none') {
                    if (typeof loadAdminLichSuGiaoCa === 'function') {
                        loadAdminLichSuGiaoCa();
                    }
                }

                // 4. CẬP NHẬT REALTIME BẢNG LƯƠNG (DÀNH CHO CẢ ADMIN VÀ QUẢN LÝ SÂN)
                if (document.getElementById('admin-bang-luong-tbody') && typeof loadBangLuongAdminData === 'function') {
                    loadBangLuongAdminData();
                }

                // 5. Cập nhật biểu đồ Dashboard nếu Admin/Quản lý đang đứng ở trang Tổng quan
                if (document.getElementById('revenueChart') && typeof updateDashboardStats === 'function') {
                    updateDashboardStats();
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

    // 1. Xóa class active ở tất cả menu
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    
    // 2. Tìm đúng thẻ a của menu TRANG CÁ NHÂN để active (Thay thế cho event.currentTarget)
    const profileLink = Array.from(document.querySelectorAll('.sidebar-nav a'))
                             .find(a => a.textContent.includes('TRANG CÁ NHÂN'));
    if (profileLink) {
        profileLink.classList.add('active');
    }

    // XỬ LÝ ĐỘNG TÊN VAI TRÒ HIỂN THỊ
    let roleDisplay = '';
    if (user.VaiTro === 'Admin') {
        roleDisplay = '<i class="fa-solid fa-chess-king" style="color: #4338ca; margin-right: 5px;"></i> Admin';
    } else if (user.VaiTro === 'QuanLySan') {
        roleDisplay = '<i class="fa-solid fa-building-flag" style="color: #b45309; margin-right: 5px;"></i> Quản lý Cụm Sân';
    } else {
        roleDisplay = 'Người dùng';
    }

    // 3. Render giao diện
    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="margin-bottom: 24px;">
            <h1 class="page-title">Trang cá nhân</h1>
            <p class="text-muted">Quản lý thông tin tài khoản của bạn</p>
        </div>
        
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

    // Tự động ẩn sau 2 giây
    setTimeout(() => {
        alertBox.style.display = 'none';
    }, 2000);
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

function closeProfileModal() {
    document.getElementById('profile-modal').style.display = 'none';
}

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

async function saveAdminProfile() {
    const btnSave = document.getElementById('btn-save-profile');
    
    // Khóa nút để tránh click nhiều lần
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
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            // Hiển thị lỗi từ backend (ví dụ: Trùng email/sđt)
            showProfileAlert(data.message || 'Có lỗi xảy ra khi cập nhật!', false);
            btnSave.disabled = false;
            btnSave.textContent = 'Lưu thay đổi';
            return;
        }

        // 1. Cập nhật đè dữ liệu mới vào Session Storage
        sessionStorage.setItem('dn_football_user', JSON.stringify(data.user));
        
        // 2. Cập nhật UI
        document.getElementById('admin-user-name').textContent = data.user.HoTen; 

        showProfileAlert('Cập nhật thông tin thành công!', true);

        setTimeout(() => {
            closeProfileModal();
            renderAdminProfile(); 
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
        const response = await fetch(`${API_BASE_URL}/cum-san`);
        const res = await response.json();
        
        const grid = document.getElementById('cumsan-grid');

        if (!grid) return;

        if (!res.success || res.data.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">Chưa có cụm sân nào.</div>`;
            return;
        }

        grid.innerHTML = res.data.map(cs => {
            const isDeleted = cs.deleted_at !== null;
            const imgBaseUrl = 'http://127.0.0.1:8000';
            const bgStyle = cs.HinhAnh ? `background-image: url('${imgBaseUrl}${cs.HinhAnh}'); background-size: cover; background-position: center;` : '';
            const iconHtml = cs.HinhAnh ? '' : '<i class="fa-solid fa-map-location-dot"></i>';
            
            // Nếu sân đã xóa mềm, thêm lớp phủ mờ mờ và nhãn "Tạm ngưng"
            const cardStyle = isDeleted ? 'opacity: 0.6; filter: grayscale(1); border-color: #ef4444;' : '';
            const badgeHtml = isDeleted ? '<div style="position:absolute; top:12px; left:12px; background:#ef4444; color:white; padding:4px 10px; border-radius:4px; font-size:0.8rem; font-weight:bold;">Đã tạm ngưng</div>' : '';

            return `
            <div class="cumsan-card" style="${cardStyle}" onclick="renderCumSanDetail(${cs.ID}, '${cs.TenCumSan}')">
                ${badgeHtml}
                <div class="cumsan-card-img" style="${bgStyle}">${iconHtml}</div>
                <div class="cumsan-card-body">
                    <div class="cumsan-title">${cs.TenCumSan}</div>
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

// 3. Render giao diện Chi tiết Cụm Sân (Khi click vào 1 thẻ)
let currentCumSanId = null;

// Hàm mở chi tiết Cụm Sân
async function renderCumSanDetail(cumSanId) {
    currentCumSanId = cumSanId;
    const contentArea = document.querySelector('.admin-content');
    
    // 1. FIX UX: Tự động set trạng thái Active màu xanh cho Menu Sidebar
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    if (currentUser && currentUser.VaiTro === 'QuanLySan') {
        const menuLink = document.getElementById('menu-sancuatoi');
        if (menuLink) menuLink.classList.add('active');
    } else {
        const menuLink = document.getElementById('menu-cumsan');
        if (menuLink) menuLink.classList.add('active');
    }

    // Khung loading
    contentArea.innerHTML = `<div style="text-align:center; margin-top:50px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu...</div>`;

    try {
        // Fetch dữ liệu Cụm Sân chi tiết từ API
        const response = await fetch(`${API_BASE_URL}/cum-san/${cumSanId}`);
        const res = await response.json();

        if (!res.success) {
            // Khắc phục nút quay lại khi lỗi
            const backAction = currentUser.VaiTro === 'Admin' ? 'renderQuanLySan()' : 'renderTongQuan()';
            contentArea.innerHTML = `<button class="btn-back" onclick="${backAction}"><i class="fa-solid fa-arrow-left"></i> Quay lại</button>
                                     <div class="modal-alert error" style="display:block;">Không tìm thấy cụm sân.</div>`;
            return;
        }

        const cs = res.data;
        window.currentClusterNameAdmin = cs.TenCumSan;
        const isDeleted = cs.deleted_at !== null;

        // Nút Sửa luôn hiển thị
        const btnEdit = `<button class="btn-outline-sm" onclick='openEditCumSanModal(${JSON.stringify(cs).replace(/'/g, "\\'")})'><i class="fa-solid fa-pen"></i> Sửa Cụm Sân</button>`;
        
        // Nút Xóa hoặc Khôi phục đổi theo trạng thái
        const btnDeleteOrRestore = isDeleted 
            ? `<button class="btn-outline-sm" style="color: #16A34A; border-color: #bbf7d0;" onclick="restoreCumSan(${cs.ID})"><i class="fa-solid fa-rotate-left"></i> Khôi phục</button>`
            : `<button class="btn-outline-sm" style="color: #ef4444; border-color: #fecaca;" onclick="deleteCumSan(${cs.ID})"><i class="fa-solid fa-trash"></i> Xóa</button>`;

        // Nhãn trạng thái hiển thị kế bên Tên cụm sân
        const statusBadge = isDeleted ? `<span class="badge badge-warning" style="margin-left: 10px; font-size: 0.9rem;">Đã tạm ngưng</span>` : '';

        // =======================================================
        // 2. FIX BẢO MẬT: Ẩn nút "Quay lại" đối với Quản lý sân
        // =======================================================
        const backBtnHtml = currentUser.VaiTro === 'QuanLySan' 
            ? '' // Trống (Không cho phép quay lại danh sách tổng)
            : `<button class="btn-back" onclick="renderQuanLySan()"><i class="fa-solid fa-arrow-left"></i> Quay lại Danh sách Cụm Sân</button>`;

        // Render HTML
        contentArea.innerHTML = `
            ${backBtnHtml} <!-- Chèn biến html đã xử lý ở trên vào đây -->
            
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
                <div class="panel-header">Danh sách Sân con <button class="btn-primary" onclick="openSanBongModal()" ${isDeleted?'disabled':''}>+ Thêm Sân Con</button></div>
                
                <!-- Thêm max-height và overflow-y vào thẻ bọc ngoài -->
                <div class="table-responsive" style="max-height: 320px; overflow-y: auto;">
                    <table class="admin-table" style="position: relative;">
                        <!-- Thêm position: sticky để ghim tiêu đề cột khi cuộn chuột -->
                        <thead style="position: sticky; top: 0; background: #F8FAFC; z-index: 1; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <tr>
                                <th>Tên Sân</th>
                                <th>Loại Sân</th>
                                <th>Trạng Thái</th>
                                <th style="text-align:center;">Hành động</th>
                            </tr>
                        </thead>
                        <tbody id="sanbong-table-body">
                            <tr><td colspan="4" class="text-center" style="text-align: center;">Đang tải...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div id="tab-giatien" class="tab-pane" style="margin-top: 24px;">
                <div id="price-container">Đang tải cấu hình...</div>
            </div>     
        `;

        loadSanBongTheoCum(cs.ID);
        loadGiaTienTheoCum(cs);
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
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="text-align: center;">Chưa có sân con nào.</td></tr>`;
            return;
        }

        tbody.innerHTML = res.data.map(sb => `
            <tr>
                <td><strong>${sb.TenSan}</strong></td>
                <td>${sb.loaiSan?.TenLoaiSan || sb.loai_san?.TenLoaiSan || '<span style="color:red">Lỗi dữ liệu</span>'}</td>
                <td><span class="badge ${sb.TrangThai === 'HoatDong' ? 'badge-success' : 'badge-warning'}">${sb.TrangThai === 'HoatDong' ? 'Hoạt động' : 'Bảo trì'}</span></td>
                <td>
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <button class="action-btn" style="background:#f0fdf4; color:#16a34a; border-color:#bbf7d0;" onclick="renderAdminSchedule(${cumSanId}, '${sb.TenSan}', ${sb.ID}, ${sb.ID_LoaiSan})">
                            <i class="fa-regular fa-calendar"></i> Xem lịch
                        </button>
                        <button class="action-btn" onclick='openSanBongModal(${JSON.stringify(sb).replace(/'/g, "\\'")})'>
                            <i class="fa-solid fa-pen-to-square"></i> Sửa
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (e) { console.error(e); }
}

async function openSanBongModal(sb = null) {
    const res = await fetch(`${API_BASE_URL}/loai-san`);
    const loaiSans = (await res.json()).data;
    document.getElementById('sb-loaisan').innerHTML = loaiSans.map(ls => `<option value="${ls.ID}">${ls.TenLoaiSan}</option>`).join('');

    if (sb) {
        document.getElementById('sanbong-modal-title').textContent = 'Chỉnh sửa Sân Con';
        document.getElementById('sb-id').value = sb.ID;
        document.getElementById('sb-ten').value = sb.TenSan;
        document.getElementById('sb-loaisan').value = sb.ID_LoaiSan;
        document.getElementById('sb-trangthai').value = sb.TrangThai;
        document.getElementById('group-trangthai').style.display = 'block'; // Sửa thì mới cho đổi trạng thái
    } else {
        document.getElementById('sanbong-modal-title').textContent = 'Thêm Sân Con';
        document.getElementById('sb-id').value = '';
        document.getElementById('sb-ten').value = '';
        document.getElementById('group-trangthai').style.display = 'none'; // Thêm mới mặc định là HoatDong
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
    const trangThai = sbId ? document.getElementById('sb-trangthai').value : 'HoatDong';

    if (!tenSan || !idLoaiSan) {
        alert('Vui lòng nhập đầy đủ tên sân và loại sân!');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Đang lưu...';

    const payload = {
        ID_CumSan: currentCumSanId,
        ID_LoaiSan: idLoaiSan,
        TenSan: tenSan,
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
            loadSanBongTheoCum(currentCumSanId); // Load lại bảng ngay lập tức
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
        // Fetch song song Danh mục và Dữ liệu giá hiện tại
        const [lsRes, kgRes, gtRes] = await Promise.all([
            fetch(`${API_BASE_URL}/loai-san`),
            fetch(`${API_BASE_URL}/khung-gio`),
            fetch(`${API_BASE_URL}/gia-tien?cum_san_id=${cs.ID}`)
        ]);
        
        const loaiSans = (await lsRes.json()).data;
        let allKhungGio = (await kgRes.json()).data;
        const currentPrices = (await gtRes.json()).data || [];

        // NGHIỆP VỤ: Chỉ lọc ra các khung giờ nằm TRONG thời gian hoạt động của Cụm sân
        const validKhungGio = allKhungGio.filter(kg => kg.GioBatDau >= cs.GioMoCua && kg.GioKetThuc <= cs.GioDongCua);

        const container = document.getElementById('price-container');
        if (validKhungGio.length === 0) {
            container.innerHTML = `<div class="panel" style="padding: 30px; text-align: center; color: red;">Lỗi: Không có khung giờ nào khớp với giờ mở cửa (${cs.GioMoCua} - ${cs.GioDongCua})</div>`;
            return;
        }

        let html = '';
        loaiSans.forEach(ls => {
            html += `
            <div class="section-loaisan">
                <div class="section-loaisan-header">
                    <div class="section-loaisan-title"><i class="fa-solid fa-futbol" style="color:var(--primary)"></i> ${ls.TenLoaiSan}</div>
                    <button id="btn-save-price-${ls.ID}" class="btn-primary" onclick="saveGiaTien(${cs.ID}, ${ls.ID}, '${ls.TenLoaiSan}')" disabled style="opacity: 0.5; cursor: not-allowed;"><i class="fa-solid fa-save"></i> Lưu giá ${ls.TenLoaiSan}</button>
                </div>
                <div class="price-grid">`;

            validKhungGio.forEach(kg => {
                const existPrice = currentPrices.find(p => p.ID_LoaiSan == ls.ID && p.ID_KhungGio == kg.ID);
                const val = existPrice ? existPrice.SoTien : '';

                html += `
                    <div class="price-card">
                        <div class="time-label">${kg.GioBatDau.substring(0,5)} - ${kg.GioKetThuc.substring(0,5)}</div>
                        <input type="number" class="form-control price-input input-price-${ls.ID}" 
                               data-khunggio="${kg.ID}" 
                               data-original="${val}" 
                               value="${val}" 
                               oninput="checkPriceChanges(${ls.ID})" 
                               placeholder="Bỏ trống = Đóng sân">
                    </div>`;
            });
            html += `</div></div>`;
        });
        container.innerHTML = html;
    } catch (e) { console.error(e); }
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
        ? 'Bạn có chắc chắn muốn <strong style="color: #ef4444;">XÓA (Tạm ngưng)</strong> hoạt động của Cụm Sân này không?' 
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
                <button class="btn-outline-sm" style="color: #2563eb; border-color: #bfdbfe; background: #eff6ff; margin-right: 5px; margin-bottom: 5px; text-align: center; width: 95%;" onclick="openMaTranLichModal(${item.ID})"><i class="fa-regular fa-calendar-days"></i> Kiểm tra Lịch</button>
                <br>
                <button class="btn-outline-sm" style="color: #047857; border-color: #047857;" onclick="openGDConfirmModal(${item.ID}, 'DaDuyet')"><i class="fa-solid fa-check"></i> Duyệt</button>
                <button class="btn-outline-sm" style="color: #b91c1c; border-color: #b91c1c; margin-left: 5px;" onclick="openGDConfirmModal(${item.ID}, 'TuChoi')"><i class="fa-solid fa-xmark"></i> Từ chối</button>
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
// MODULE: QUẢN LÝ YÊU CẦU RÚT TIỀN
// ======================================================
let allRutTienData = []; 
let currentRTPage = 1;
const itemsPerRTPage = 5; 
let currentRTFilter = 'All';
let currentRTSearch = '';
let currentRTDate = '';
let pendingRTId = null;
let pendingRTStatus = null;

function renderQuanLyRutTien() {
    currentRTPage = 1; currentRTFilter = 'All'; currentRTSearch = ''; currentRTDate = '';
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    Array.from(document.querySelectorAll('.sidebar-nav a')).find(a => a.textContent.includes('RÚT TIỀN')).classList.add('active');

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
            <div>
                <h1 class="page-title">Quản lý Yêu cầu Rút tiền</h1>
                <p class="text-muted">Có <strong id="rt-pending-count" style="color: #ea580c; font-size: 1.1rem;">0</strong> đơn đang chờ phê duyệt</p>
            </div>
        </div>
        <div id="ruttien-alert" class="modal-alert" style="display: none; margin-bottom: 16px;"></div>

        <div class="panel">
            <div style="display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap;">
                <div style="position: relative; flex: 1; min-width: 250px;">
                    <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 12px; top: 12px; color: var(--text-muted);"></i>
                    <input type="text" class="form-control" style="padding-left: 35px;" placeholder="Tìm tên khách hàng..." oninput="handleRTSearch(this.value)">
                </div>
                <input type="date" class="form-control" style="width: 150px;" onchange="handleRTDate(this.value)">
                <select class="form-control" style="width: 200px;" onchange="handleRTFilter(this.value)">
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
                            <th>Số tiền</th>
                            <th>Thông tin NH</th>
                            <th>Ngày nộp</th>
                            <th>Trạng thái</th>
                            <th>Hành động</th>
                        </tr>
                    </thead>
                    <tbody id="ruttien-table-body">
                        <tr><td colspan="6" class="text-center" style="text-align: center;">Đang tải dữ liệu...</td></tr>
                    </tbody>
                </table>
            </div>
            <div id="rt-pagination" style="display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 15px; margin-bottom: 15px; padding-top: 15px; border-top: 1px solid var(--border);"></div>
        </div>

        <!-- Modal Xác nhận RT -->
        <div id="rt-confirm-modal" class="modal-overlay" style="display: none; z-index: 9999;">
            <div class="modal-content" style="max-width: 400px; text-align: center; padding: 30px 20px;">
                <div style="font-size: 3.5rem; color: #f59e0b; margin-bottom: 15px;"><i class="fa-solid fa-circle-exclamation"></i></div>
                <h3 id="rt-confirm-title" style="margin-bottom: 10px; font-size: 1.4rem;">Xác nhận</h3>
                <p id="rt-confirm-msg" style="color: var(--text-muted); margin-bottom: 25px; line-height: 1.5;"></p>

                <div id="rt-reason-container" style="display: none; margin-bottom: 20px; text-align: left;">
                    <label style="font-size: 0.9rem; font-weight: 600; color: var(--text-dark); margin-bottom: 8px; display: block;">Lý do từ chối <span style="color: red;">*</span></label>
                    <textarea id="rt-reject-reason" class="form-control" rows="3" placeholder="Nhập lý do từ chối giao dịch này..." style="width: 100%; resize: none;" oninput="document.getElementById('rt-reason-error').style.display='none'"></textarea>
                    <div id="rt-reason-error" style="color: #ef4444; font-size: 0.85rem; margin-top: 8px; display: none;"><i class="fa-solid fa-circle-exclamation"></i> Vui lòng nhập lý do từ chối!</div>
                </div>

                <div style="display: flex; justify-content: center; gap: 12px;">
                    <button class="btn-outline" style="width: auto; padding: 10px 24px;" onclick="closeRTConfirmModal()">Hủy bỏ</button>
                    <button id="rt-confirm-btn" class="btn-primary" style="width: auto; padding: 10px 24px;" onclick="executeCapNhatTrangThaiRT()">Đồng ý</button>
                </div>
            </div>
        </div>
    `;
    loadDanhSachRutTienAdmin();
}

function showRTAlert(message, isSuccess) {
    const alertBox = document.getElementById('ruttien-alert');
    alertBox.textContent = message; alertBox.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alertBox.style.display = 'block'; setTimeout(() => alertBox.style.display = 'none', 3000);
}

function handleRTSearch(val) { currentRTSearch = val.toLowerCase().trim(); currentRTPage = 1; applyRTFiltersAndRender(); }
function handleRTDate(val) { currentRTDate = val; currentRTPage = 1; applyRTFiltersAndRender(); }
function handleRTFilter(val) { currentRTFilter = val; currentRTPage = 1; applyRTFiltersAndRender(); }

async function loadDanhSachRutTienAdmin() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/yeu-cau-rut-tien`);
        const res = await response.json();
        if (res.success) { allRutTienData = res.data || []; applyRTFiltersAndRender(); }
    } catch (error) { showRTAlert('Lỗi kết nối.', false); }
}

function applyRTFiltersAndRender() {
    document.getElementById('rt-pending-count').innerText = allRutTienData.filter(i => i.TrangThai === 'ChoDuyet').length;

    let filteredData = allRutTienData.filter(item => {
        const matchStatus = (currentRTFilter === 'All' || item.TrangThai === currentRTFilter);
        const tenKhach = item.nguoi_dung ? item.nguoi_dung.HoTen.toLowerCase() : '';
        const matchSearch = tenKhach.includes(currentRTSearch);
        const txDate = item.NgayTao ? item.NgayTao.substring(0, 10) : '';
        const matchDate = currentRTDate ? (txDate === currentRTDate) : true;
        return matchStatus && matchSearch && matchDate;
    });

    const totalPages = Math.ceil(filteredData.length / itemsPerRTPage) || 1;
    if (currentRTPage > totalPages) currentRTPage = totalPages;
    const startIdx = (currentRTPage - 1) * itemsPerRTPage;
    
    renderRTTable(filteredData.slice(startIdx, startIdx + itemsPerRTPage));
    renderRTPagination(totalPages);
}

function renderRTTable(data) {
    const tbody = document.getElementById('ruttien-table-body');
    if (data.length === 0) return tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="text-align: center; padding: 40px;">Không có dữ liệu.</td></tr>`;

    tbody.innerHTML = data.map(item => {
        let badgeClass = 'badge-warning', viStatus = 'Chờ duyệt', actionHtml = '';
        if(item.TrangThai === 'DaDuyet') { badgeClass = 'badge-success'; viStatus = 'Đã duyệt'; }
        if(item.TrangThai === 'TuChoi') { badgeClass = 'badge-danger'; viStatus = 'Từ chối'; }

        if (item.TrangThai === 'ChoDuyet') {
            actionHtml = `<button class="btn-outline-sm" style="color: #047857; border-color: #047857;" onclick="openRTConfirmModal(${item.ID}, 'DaDuyet')"><i class="fa-solid fa-check"></i> Duyệt</button>
                          <button class="btn-outline-sm" style="color: #b91c1c; border-color: #b91c1c; margin-left: 5px;" onclick="openRTConfirmModal(${item.ID}, 'TuChoi')"><i class="fa-solid fa-xmark"></i> Từ chối</button>`;
        } else {
            actionHtml = `<span style="color: var(--text-muted); font-size: 0.85rem;">(Ngày duyệt: ${item.NgayDuyet.substring(0,10)})</span>`;
        }

        return `<tr>
            <td><strong>${item.nguoi_dung?.HoTen || 'N/A'}</strong><br><span style="font-size: 0.85rem;">Số dư ví: ${Number(item.nguoi_dung?.SoDuVi || 0).toLocaleString('vi-VN')}đ</span></td>
            <td><strong style="color: var(--danger);">${Number(item.SoTien).toLocaleString('vi-VN')}đ</strong></td>
            <td><span style="font-size: 0.85rem; white-space: pre-line;">${item.NoiDung}</span></td>
            <td>${item.NgayTao ? item.NgayTao.substring(0,10) : ''}</td>
            <td><span class="badge ${badgeClass}">${viStatus}</span></td>
            <td>${actionHtml}</td>
        </tr>`;
    }).join('');
}

function renderRTPagination(totalPages) {
    const div = document.getElementById('rt-pagination');
    if (totalPages <= 1) return div.innerHTML = '';
    
    let html = `<button class="btn-outline-sm" ${currentRTPage === 1 ? 'disabled style="opacity:0.5;"' : ''} onclick="currentRTPage--; applyRTFiltersAndRender()"><i class="fa-solid fa-chevron-left"></i></button>`;
    
    const getPages = (current, total) => {
        if (total <= 6) return Array.from({length: total}, (_, i) => i + 1);
        if (current <= 3) return [1, 2, 3, 4, '...', total];
        if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
        return [1, '...', current - 1, current, current + 1, '...', total];
    };

    getPages(currentRTPage, totalPages).forEach(i => {
        if (i === '...') {
            html += `<span style="padding: 6px 10px; color: var(--text-muted); font-weight: bold;">...</span>`;
        } else {
            html += `<button class="${i === currentRTPage ? 'btn-primary' : 'btn-outline-sm'}" style="padding: 6px 14px;" onclick="currentRTPage=${i}; applyRTFiltersAndRender()">${i}</button>`;
        }
    });

    html += `<button class="btn-outline-sm" ${currentRTPage === totalPages ? 'disabled style="opacity:0.5;"' : ''} onclick="currentRTPage++; applyRTFiltersAndRender()"><i class="fa-solid fa-chevron-right"></i></button>`;
    div.innerHTML = html;
}

function openRTConfirmModal(id, status) {
    pendingRTId = id; pendingRTStatus = status;
    const isApprove = (status === 'DaDuyet');
    document.getElementById('rt-confirm-title').innerText = isApprove ? 'Duyệt Rút Tiền' : 'Từ Chối Rút Tiền';
    document.getElementById('rt-confirm-msg').innerHTML = isApprove ? 'Hệ thống sẽ <strong>TRỪ</strong> tiền trong ví khách hàng. Xác nhận?' : 'Xác nhận <strong>TỪ CHỐI</strong>?';
    
    const btn = document.getElementById('rt-confirm-btn');
    btn.style.backgroundColor = isApprove ? 'var(--primary)' : '#ef4444';
    btn.style.borderColor = isApprove ? 'var(--primary)' : '#ef4444';

    document.getElementById('rt-reason-container').style.display = isApprove ? 'none' : 'block';
    document.getElementById('rt-reject-reason').value = '';
    document.getElementById('rt-reason-error').style.display = 'none';
    document.getElementById('rt-confirm-modal').style.display = 'flex';
}

function closeRTConfirmModal() { document.getElementById('rt-confirm-modal').style.display = 'none'; }

async function executeCapNhatTrangThaiRT() {
    let lyDoHuy = null;
    if (pendingRTStatus === 'TuChoi') {
        lyDoHuy = document.getElementById('rt-reject-reason').value.trim();
        if (!lyDoHuy) {
            document.getElementById('rt-reason-error').style.display = 'block';
            document.getElementById('rt-reject-reason').focus();
            return;
        }
    }

    const btn = document.getElementById('rt-confirm-btn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...'; btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/admin/yeu-cau-rut-tien/${pendingRTId}/xu-ly`, {
            method: 'PUT', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ trang_thai: pendingRTStatus, ly_do_huy: lyDoHuy })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            showRTAlert('Xử lý thành công!', true);
            closeRTConfirmModal(); loadDanhSachRutTienAdmin();
        } else { showRTAlert(data.message, false); closeRTConfirmModal(); }
    } catch (e) { showRTAlert('Lỗi mạng!', false); closeRTConfirmModal(); }
    finally { btn.innerHTML = 'Đồng ý'; btn.disabled = false; }
}

// Đóng dropdown khi click ra ngoài màn hình
document.addEventListener('click', () => {
    const notifDropdown = document.getElementById('notif-dropdown');
    if(notifDropdown) notifDropdown.style.display = 'none';
});

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
                    <input type="text" class="form-control" style="padding-left: 35px;" placeholder="Tìm SDT, Tên khách, Tên sân..." oninput="handleDSSearch(this.value)">
                </div>
                <input type="date" class="form-control" style="width: 150px;" id="ds-date-input" onchange="handleDSDate(this.value)">
                <select class="form-control" style="width: 180px;" onchange="handleDSFilter(this.value)">
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

function applyDSFiltersAndRender() {
    let filteredData = allDatSanData.filter(item => {
        const matchStatus = (currentDSFilter === 'All' || item.TrangThai === currentDSFilter);
        const maVeSearch = item.ID_GiaiDau ? `gd-${item.ID_GiaiDau}` : `pt-${item.ID}`;
        const sdt = item.ID_NguoiDung ? (item.nguoi_dung?.SoDienThoai?.toLowerCase() || '') : (item.SDTKhachVangLai?.toLowerCase() || '');
        const tenKhach = item.ID_NguoiDung ? (item.nguoi_dung?.HoTen?.toLowerCase() || '') : (item.TenKhachVangLai?.toLowerCase() || '');
        const tenSan = item.san_bong ? item.san_bong.TenSan.toLowerCase() : '';
        const cumSan = (item.san_bong && item.san_bong.cum_san) ? item.san_bong.cum_san.TenCumSan.toLowerCase() : '';
        const tenGiai = (item.ID_GiaiDau !== null && item.giai_dau) ? item.giai_dau.TenGiaiDau.toLowerCase() : '';

        const searchTerm = currentDSSearch.toLowerCase().trim();
        const matchSearch = maVeSearch.includes(searchTerm)
                         ||sdt.includes(currentDSSearch) 
                         || tenKhach.includes(currentDSSearch) 
                         || tenSan.includes(currentDSSearch)
                         || cumSan.includes(currentDSSearch)
                         || tenGiai.includes(currentDSSearch);
        
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

    tbody.innerHTML = data.map(item => {
        let badgeColor = '#6b7280', badgeBg = '#f3f4f6', viStatus = item.TrangThai;
        if(item.TrangThai === 'DaCoc') { badgeColor = '#b45309'; badgeBg = '#fef3c7'; viStatus = 'Đã cọc'; }
        else if(item.TrangThai === 'DaHuy') { badgeColor = '#b91c1c'; badgeBg = '#fee2e2'; viStatus = 'Đã hủy'; }
        else if(item.TrangThai === 'HoanThanh') { badgeColor = '#047857'; badgeBg = '#d1fae5'; viStatus = 'Hoàn thành'; }
        else if(item.TrangThai === 'KhongDen') { badgeColor = '#6b7280'; badgeBg = '#f3f4f6'; viStatus = 'Không đến'; }

        const badgeHtml = `<span style="padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; background: ${badgeBg}; color: ${badgeColor};">${viStatus}</span>`;
        
        const maVeDisplay = item.ID_GiaiDau ? `GD-${item.ID_GiaiDau}` : `PT-${item.ID}`;
        const badgeClassVe = item.ID_GiaiDau 
            ? 'background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe; box-shadow: 0 2px 4px rgba(67, 56, 202, 0.1);' 
            : 'background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(71, 85, 105, 0.08);';        
        const isGiaiDau = item.ID_GiaiDau !== null;
        const tenGiaiDau = isGiaiDau && item.giai_dau ? item.giai_dau.TenGiaiDau : '';
        const tagLoai = isGiaiDau 
            ? `<span style="font-size: 0.75rem; background: #e0e7ff; color: #4338ca; padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-trophy"></i> Giải đấu</span>` 
            : `<span style="font-size: 0.75rem; background: #f1f5f9; color: #475569; padding: 2px 6px; border-radius: 4px;">Phong trào</span>`;
        const htmlTenGiai = isGiaiDau ? `<div style="font-size: 0.85rem; color: #4338ca; margin-top: 4px; font-weight: 600;"><i class="fa-solid fa-medal"></i> ${tenGiaiDau}</div>` : '';

        const d = new Date(item.NgayDa);
        const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear()}`;
        const timeStr = item.khung_gio ? `${item.khung_gio.GioBatDau.substring(0,5)} - ${item.khung_gio.GioKetThuc.substring(0,5)}` : '';

        const tienThu = Number(item.TongTien) - Number(item.TienCoc);

        // Nút hành động (Thêm event.stopPropagation() để không bị kích hoạt sự kiện click của dòng)
        let actionHtml = '';
        if (item.TrangThai === 'DaCoc') {
            actionHtml = `<button class="btn-primary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="event.stopPropagation(); openDSConfirmModal(${item.ID})">Chốt sân</button>`;
        } else {
            actionHtml = `<span style="color: var(--text-muted); font-size: 0.85rem;">Đã xử lý</span>`;
        }

        const tenKhachHienThi = item.ID_NguoiDung ? (item.nguoi_dung?.HoTen || 'N/A') : (item.TenKhachVangLai || 'N/A');
        const sdtKhachHienThi = item.ID_NguoiDung ? (item.nguoi_dung?.SoDienThoai || '') : (item.SDTKhachVangLai || '');

        return `<tr onclick="openBookingDetailModalAdmin(${item.ID})" style="cursor: pointer; transition: background-color 0.15s;" onmouseover="this.style.backgroundColor='#f8fafc'" onmouseout="this.style.backgroundColor=''">
            <td style="text-align: center;">
                <span style="padding: 6px 12px; border-radius: 8px; font-weight: 700; font-family: 'Courier New', Courier, monospace; font-size: 0.95rem; display: inline-block; white-space: nowrap; letter-spacing: 1px; ${badgeClassVe}">
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
            <td><strong style="color: #ea580c;">${tienThu.toLocaleString('vi-VN')}đ</strong></td>
            <td>${badgeHtml}</td>
            <td style="text-align: center;">${actionHtml}</td>
        </tr>`;
    }).join('');
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
        modal.style.cssText = 'display: none; z-index: 9999;';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 450px; text-align: center; padding: 30px 20px;">
                <h3 style="margin-bottom: 10px; font-size: 1.4rem; color: var(--text-dark);">Chốt trạng thái sân</h3>
                <p style="color: var(--text-muted); margin-bottom: 25px; line-height: 1.5;">Vui lòng xác nhận trạng thái cho khách hàng này.</p>
                <div style="display: flex; justify-content: center; gap: 12px;">
                    <button class="btn-outline" style="width: auto; padding: 10px 24px;" onclick="closeDSConfirmModal()">Hủy bỏ</button>
                    <button class="btn-outline" style="padding: 10px 15px; color: #ef4444; border-color: #fecaca; background: #fef2f2;" onclick="openAdminCancelConfirmModal()"><i class="fa-solid fa-ban"></i> Hủy sân & Hoàn tiền</button>
                    <button class="btn-outline" style="width: auto; padding: 10px 24px; color: #64748b; border-color: #cbd5e1;" onclick="executeCapNhatDatSan('KhongDen')"><i class="fa-solid fa-user-slash"></i> Không đến</button>
                    <button class="btn-primary" style="width: auto; padding: 10px 24px; background-color: #10b981; border-color: #10b981;" onclick="executeCapNhatDatSan('HoanThanh')"><i class="fa-solid fa-check"></i> Hoàn thành</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
}

function closeDSConfirmModal() { document.getElementById('ds-confirm-modal').style.display = 'none'; }

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

    if (isMember) {
        // LUỒNG 1: KHÁCH HÀNG CÓ TÀI KHOẢN (Hoàn tiền vào Ví)
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; text-align: center; padding: 30px 20px;">
                <div style="font-size: 3.5rem; color: #ef4444; margin-bottom: 15px;"><i class="fa-solid fa-triangle-exclamation"></i></div>
                <h3 style="margin-bottom: 10px; font-size: 1.35rem;">Xác nhận Hủy Sân</h3>
                <p style="color: var(--text-muted); margin-bottom: 25px; line-height: 1.5; font-size: 0.92rem;">
                    Khách hàng thành viên: <strong>${item.nguoi_dung?.HoTen || 'N/A'}</strong>.<br>
                    Hệ thống sẽ <strong>HỦY LỊCH</strong> và tự động <strong>HOÀN TRẢ 100% TIỀN CỌC (${Number(item.TienCoc).toLocaleString('vi-VN')}đ)</strong> vào ví khách hàng.
                </p>
                <div style="display: flex; justify-content: center; gap: 12px;">
                    <button class="btn-outline" style="width: auto; padding: 10px 24px;" onclick="closeAdminCancelConfirmModal()">Hủy bỏ</button>
                    <button class="btn-primary" style="width: auto; padding: 10px 24px; background-color: #ef4444; border-color: #ef4444;" onclick="executeCapNhatDatSan('DaHuy'); closeAdminCancelConfirmModal();"><i class="fa-solid fa-trash"></i> Đồng ý Hủy</button>
                </div>
            </div>`;
    } else {
        // LUỒNG 2: KHÁCH VÃNG LAI (Xác thực OTP qua Email trước khi hủy & hoàn cọc)
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 430px; padding: 24px; text-align: left; border-radius: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0;">
                    <h3 style="margin: 0; font-size: 1.15rem; color: #0f172a;"><i class="fa-solid fa-user-check" style="color: #ef4444; margin-right: 6px;"></i> Hủy sân Khách vãng lai</h3>
                    <i class="fa-solid fa-xmark" style="cursor: pointer; color: #64748b; font-size: 1.1rem;" onclick="closeAdminCancelConfirmModal()"></i>
                </div>

                <div id="admin-guest-cancel-alert" class="modal-alert" style="display: none; margin: 0 0 12px 0;"></div>

                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 0.88rem; line-height: 1.6;">
                    <div>Khách vãng lai: <strong>${item.TenKhachVangLai || 'N/A'}</strong> (${item.SDTKhachVangLai || ''})</div>
                    <div>Email nhận OTP: <strong style="color: #2563eb;">${item.EmailKhachVangLai || 'Chưa có'}</strong></div>
                    <div>Tiền cọc cần hoàn: <strong style="color: #ea580c;">${Number(item.TienCoc).toLocaleString('vi-VN')}đ</strong></div>
                </div>

                <div class="form-group" style="margin-bottom: 18px;">
                    <label style="font-size: 0.85rem; font-weight: 600; margin-bottom: 6px; display: block;">Mã xác thực OTP (gửi về Email khách) <span style="color: red;">*</span></label>
                    <div style="display: flex; gap: 8px;">
                        <input type="text" id="admin-guest-cancel-otp" class="form-control" placeholder="Nhập 6 số OTP..." maxlength="6" style="flex: 1; font-weight: 700; letter-spacing: 2px; text-align: center;">
                        <button type="button" id="btn-admin-send-guest-otp" class="btn-outline" style="width: auto; padding: 0 14px; white-space: nowrap; font-size: 0.85rem; border-color: #3b82f6; color: #2563eb;" onclick="sendGuestCancelOtpAdmin(${item.ID})">
                            <i class="fa-solid fa-paper-plane"></i> Gửi OTP
                        </button>
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button class="btn-outline" style="width: auto; padding: 9px 18px;" onclick="closeAdminCancelConfirmModal()">Đóng</button>
                    <button id="btn-admin-confirm-guest-cancel" class="btn-primary" style="width: auto; padding: 9px 18px; background-color: #ef4444; border-color: #ef4444;" onclick="confirmGuestCancelAdmin()">
                        <i class="fa-solid fa-check"></i> Xác nhận Hủy & Hoàn cọc
                    </button>
                </div>
            </div>`;
    }

    modal.style.display = 'flex';
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

async function executeCapNhatDatSan(trangThai, otp = null, customAlertBox = null) {
    if (!pendingDSId) return false;
    closeDSConfirmModal(); 

    try {
        const payload = { trang_thai: trangThai };
        if (otp) payload.otp = otp;

        const response = await fetch(`${API_BASE_URL}/admin/dat-san/${pendingDSId}/chot`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
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
                    <button class="btn-outline-sm" style="color: #047857; border-color: #047857; padding: 6px 12px; white-space: nowrap;" onclick="openUCConfirmModal(${item.ID}, 'DaDuyet')">
                        <i class="fa-solid fa-check"></i> Duyệt
                    </button>
                    <button class="btn-outline-sm" style="color: #b91c1c; border-color: #b91c1c; padding: 6px 12px; white-space: nowrap;" onclick="openUCConfirmModal(${item.ID}, 'TuChoi')">
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
        const isAdminToiCao = Number(currentUser.ID) === 1;

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

async function loadDanhSachUsersAPI() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/khach-hang`);
        const res = await response.json();
        if (res.success) {
            allUsersData = res.data;
            filterAndRenderUsers();
        }
    } catch (error) {
        document.getElementById('user-table-body').innerHTML = `<tr><td colspan="6" class="text-center text-danger" style="text-align: center;">Lỗi kết nối máy chủ!</td></tr>`;
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
    // 1. Lọc theo Tab và Search
    const filtered = allUsersData.filter(user => {
        const matchTab = user.VaiTro === currentRoleTab;

        let matchCumSan = true;
        if (currentUserCumSanFilter !== 'All') {
            matchCumSan = String(user.ID_CumSan) === String(currentUserCumSanFilter);
        }

        const matchSearch = 
            user.HoTen.toLowerCase().includes(userSearchTerm) || 
            user.SoDienThoai.includes(userSearchTerm) || 
            (user.Email && user.Email.toLowerCase().includes(userSearchTerm));
        
        return matchTab && matchCumSan && matchSearch;
    });

    // 2. Render Header (Tùy theo Tab)
    const thead = document.getElementById('user-table-head');
    if (currentRoleTab === 'KhachHang') {
        thead.innerHTML = `
            <tr>
                <th>Khách hàng</th>
                <th>Liên hệ</th>
                <th style="text-align: center;">Số dư ví</th>
                <th style="text-align: center;">Tỷ lệ Bùng sân</th>
                <th style="text-align: center;">Trạng thái</th>
                <th style="text-align: center;">Hành động</th>
            </tr>
        `;
    } else {
        // Giao diện cột chuẩn xác cho nhân sự hệ thống
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

    // 3. XỬ LÝ PHÂN TRANG (PAGINATION)
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / itemsPerUserPage) || 1;
    if (currentUserPage > totalPages) currentUserPage = totalPages;

    const startIdx = (currentUserPage - 1) * itemsPerUserPage;
    const pageData = filtered.slice(startIdx, startIdx + itemsPerUserPage);

    // 4. Render Body
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
        
        // ==========================================
        // UI CHO KHÁCH HÀNG
        // ==========================================
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
                                <span style="font-size: 0.8rem; color: var(--text-muted);">ID: KH-${u.ID}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div><i class="fa-solid fa-phone" style="width: 16px; color: #94a3b8;"></i> ${u.SoDienThoai}</div>
                        <div style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-solid fa-envelope" style="width: 16px; color: #94a3b8;"></i> ${u.Email || 'Chưa cập nhật'}</div>
                    </td>
                    <td style="text-align: center;"><strong style="color: #047857; font-size: 1.05rem;">${Number(u.SoDuVi).toLocaleString('vi-VN')}đ</strong></td>
                    <td style="text-align: center;">${tyLeBungHtml}</td>
                    <td style="text-align: center;">${statusBadge}</td>
                    <td style="text-align: center;"><button class="btn-outline-sm" onclick="renderChiTietKhachHang(${u.ID})"><i class="fa-solid fa-eye"></i> Chi tiết</button></td>
                </tr>
            `;
        } 
        // ==========================================
        // UI CHO ADMIN / QUẢN LÝ SÂN / NHÂN VIÊN
        // ==========================================
        else {
            let roleBadge = '';
            if (u.VaiTro === 'Admin') roleBadge = `<span style="font-size: 0.75rem; background: #e0e7ff; color: #4338ca; padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-chess-king"></i> Admin</span>`;
            else if (u.VaiTro === 'QuanLySan') roleBadge = `<span style="font-size: 0.75rem; background: #fef3c7; color: #b45309; padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-user-tie"></i> Quản lý sân</span>`;
            else if (u.VaiTro === 'NhanVien') roleBadge = `<span style="font-size: 0.75rem; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-user-gear"></i> Nhân viên</span>`;
            
            const coSoStr = u.cum_san 
                ? `<div style="color: var(--primary); font-weight: 600;"><i class="fa-solid fa-building-flag"></i> ${u.cum_san.TenCumSan}</div><div style="font-size: 0.8rem; color: var(--text-muted);">${u.cum_san.DiaChi}</div>` 
                : `<div style="color: var(--text-muted); font-weight: 600;"><i class="fa-solid fa-globe"></i> Toàn hệ thống</div>`;

            let actionBtn = '';
            if (Number(u.ID) === 1) {
                actionBtn = `<button class="btn-outline-sm" style="color: #94a3b8; border-color: #e2e8f0; background: #f8fafc; width: 130px; cursor: not-allowed; opacity: 0.8;" title="Tài khoản tối cao không thể bị khóa" disabled><i class="fa-solid fa-shield"></i> Bảo vệ</button>`;
            } else {
                actionBtn = u.TrangThaiKhoa
                    ? `<button class="btn-outline-sm" style="color: #16a34a; border-color: #bbf7d0; background: #f0fdf4; width: 130px;" onclick="openKhoaKhachHangModal(${u.ID}, true)"><i class="fa-solid fa-unlock"></i> Mở quyền</button>`
                    : `<button class="btn-outline-sm" style="color: #ef4444; border-color: #fecaca; background: #fef2f2; width: 130px; white-space: nowrap;" onclick="openKhoaKhachHangModal(${u.ID}, false)"><i class="fa-solid fa-lock"></i> Khóa tài khoản</button>`;
            }
            return `
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 40px; height: 40px; border-radius: 50%; background: #eff6ff; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #3b82f6; font-size: 1.2rem;"><i class="fa-solid fa-user-shield"></i></div>
                            <div>
                                <strong style="color: var(--text-dark);">${u.HoTen}</strong><br>
                                ${roleBadge}
                            </div>
                        </div>
                    </td>
                    <td>
                        <div><i class="fa-solid fa-phone" style="width: 16px; color: #94a3b8;"></i> ${u.SoDienThoai}</div>
                        <div style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-solid fa-envelope" style="width: 16px; color: #94a3b8;"></i> ${u.Email || 'Chưa cập nhật'}</div>
                    </td>
                    <td>${coSoStr}</td>
                    <td style="text-align: center;">${statusBadge}</td>
                    <td style="text-align: center;">${actionBtn}</td>
                </tr>
            `;
        }
    }).join('');

    // 5. Render Nút Phân Trang
    renderUserPagination(totalPages);
}

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
            so_du_vi: kh.SoDuVi || 0,
            tong_tien_da_nap: 0,
            tong_so_tran: dsDatSan.length,
            tong_bung_san: dsDatSan.filter(d => d.TrangThai === 'KhongDen').length,
            tong_da_chot: dsDatSan.filter(d => d.TrangThai === 'HoanThanh' || d.TrangThai === 'KhongDen').length,
            ty_le_bung: 0
        };

        if (tk.ty_le_bung === 0 && tk.tong_da_chot > 0) {
            tk.ty_le_bung = Math.round((tk.tong_bung_san / tk.tong_da_chot) * 100);
        }

        // Xử lý bảo mật thẻ Tổng tiền nạp (Nếu null -> Ẩn đi bằng icon Ổ khóa)
        const tongTienNapHtml = tk.tong_tien_da_nap === null 
            ? `<div class="stat-value" style="color: #ef4444; font-size: 1.2rem; margin-top: 5px;"><i class="fa-solid fa-lock"></i> Bảo mật</div>` 
            : `<div class="stat-value" style="color: #4338ca;">${Number(tk.tong_tien_da_nap).toLocaleString('vi-VN')}đ</div>`;

        // Nút Khóa/Mở Khóa
        const lockBtnHtml = kh.TrangThaiKhoa 
            ? `<button class="btn-primary" style="background: #16a34a; border-color: #16a34a;" onclick="openKhoaKhachHangModal(${kh.ID}, true)"><i class="fa-solid fa-unlock"></i> Mở khóa tài khoản</button>`
            : `<button class="btn-primary" style="background: #ef4444; border-color: #ef4444;" onclick="openKhoaKhachHangModal(${kh.ID}, false)"><i class="fa-solid fa-lock"></i> Khóa tài khoản</button>`;

        const isQuanLySan = currentUser.VaiTro === 'QuanLySan';

        // Render HTML
        contentArea.innerHTML = `
            <button class="btn-back" onclick="renderQuanLyKhachHang()"><i class="fa-solid fa-arrow-left"></i> Quay lại danh sách</button>
            <!-- ... (Phần Header giữ nguyên như cũ) ... -->
            <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding: 24px; background: white; border-radius: 12px; box-shadow: var(--shadow-sm); border: 1px solid var(--border);">
                <div style="display: flex; align-items: center; gap: 20px;">
                    <div style="width: 70px; height: 70px; border-radius: 50%; background: var(--primary-light); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: bold;">
                        ${kh.HoTen.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h1 class="page-title" style="margin-bottom: 4px;">${kh.HoTen}${kh.TrangThaiKhoa ? '<span class="badge badge-danger" style="vertical-align: middle; font-size: 0.8rem; margin-left: 8px;">Bị khóa</span>' : ''}</h1>
                        <div style="color: var(--text-muted); font-size: 0.95rem; display: flex; gap: 15px;">
                            <span><i class="fa-solid fa-phone"></i> ${kh.SoDienThoai}</span>
                            <span><i class="fa-solid fa-envelope"></i> ${kh.Email || 'N/A'}</span>
                        </div>
                    </div>
                </div>
                <div>${lockBtnHtml}</div>
            </div>

            <!-- Thống kê nhanh dùng dữ liệu Backend (Đã cách ly) -->
            <div class="stat-grid" style="margin-bottom: 24px;">
                <div class="stat-card">
                    <div class="stat-title">Số dư ví hiện tại</div>
                    <div class="stat-value" style="color: #047857;">${Number(tk.so_du_vi).toLocaleString('vi-VN')}đ</div>
                </div>
                <div class="stat-card">
                    <div class="stat-title">Tổng tiền đã nạp</div>
                    ${tongTienNapHtml}
                </div>
                <div class="stat-card">
                    <div class="stat-title">Tổng số trận đặt</div>
                    <div class="stat-value">${tk.tong_so_tran} trận</div>
                </div>
                <div class="stat-card">
                    <div class="stat-title">Tỷ lệ bùng sân</div>
                    <div class="stat-value" style="color: ${tk.ty_le_bung >= 30 ? '#ef4444' : '#047857'};">${tk.ty_le_bung}%</div>
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">(${tk.tong_bung_san} bùng / ${tk.tong_da_chot} chốt)</div>
                </div>
            </div>

            <!-- Tabs Lịch sử -->
            <div class="panel">
                <div style="display: flex; gap: 20px; border-bottom: 1px solid var(--border);">
                    <button class="nav-tab active" onclick="switchKhachHangTab('tab-ls-datsan', this)" style="margin-left: 20px; padding: 12px 0; border: none; background: transparent; font-weight: 600; cursor: pointer; border-bottom: 2px solid var(--primary); color: var(--primary);">Lịch sử Đặt sân</button>
                    ${isQuanLySan ? '' : `<button class="nav-tab" onclick="switchKhachHangTab('tab-ls-giaodich', this)" style="padding: 12px 0; border: none; background: transparent; font-weight: 600; cursor: pointer; color: var(--text-muted);">Lịch sử Giao dịch Ví</button>`}

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

                <!-- Tab 1: Đặt Sân -->
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

                <!-- Tab 2: Giao Dịch -->
                ${isQuanLySan ? '' : `
                <div id="tab-ls-giaodich" class="tab-pane" style="display: none;">
                    <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                        <table class="admin-table">
                            <thead style="position: sticky; top: 0; background: #F8FAFC;">
                                <tr>
                                    <th>Mã GD</th>
                                    <th>Nội dung</th>
                                    <th>Ngày Giao Dịch</th>
                                    <th>Biến động</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${renderKhachHangGiaoDichTable(dsGiaoDich)}
                            </tbody>
                        </table>
                    </div>
                </div>`}
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
                                <i class="fa-solid fa-circle-info" style="margin-right: 4px; color: #3b82f6;"></i>Đã gồm bán nước, nhập kho & lương NV
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
                    <div style="padding: 12px; margin-bottom: 8px; border-radius: 8px; cursor: pointer; transition: 0.2s; position: relative; ${isActive}" onclick="loadAdminChatDetails(${phien.ID})">
                        <div style="font-weight: 600; font-size: 0.9rem; color: #334155; padding-right: 20px;">${tieuDe}</div>
                        
                        <div class="chat-action-menu" style="position: absolute; right: 10px; top: 10px;" onclick="event.stopPropagation()">
                            <i class="fa-solid fa-ellipsis-vertical" style="color: #94a3b8; padding: 4px 8px; cursor: pointer;" onclick="toggleAdminChatDropdown(${phien.ID})"></i>
                            <div id="admin-chat-dropdown-${phien.ID}" style="display: none; position: absolute; right: 0; top: 25px; background: white; border: 1px solid var(--border); box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-radius: 8px; width: 120px; z-index: 10;">
                                <div style="padding: 8px 12px; font-size: 0.85rem; cursor: pointer; border-bottom: 1px solid #f1f5f9; color: var(--text-dark);" onclick="openAdminRenameChatModal(${phien.ID}, '${tieuDe.replace(/'/g, "\\'")}')"><i class="fa-solid fa-pen" style="margin-right: 6px;"></i> Đổi tên</div>
                                <div style="padding: 8px 12px; font-size: 0.85rem; cursor: pointer; color: #ef4444;" onclick="openAdminDeleteChatModal(${phien.ID})"><i class="fa-solid fa-trash-can" style="margin-right: 6px;"></i> Xóa</div>
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
    // 1. Lấy thông tin người dùng đang đăng nhập
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    const isAdmin = currentUser.VaiTro === 'Admin';

    // 2. Active thẻ Menu tương ứng
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = Array.from(document.querySelectorAll('.sidebar-nav a')).find(a => a.textContent.includes('CẤP TÀI KHOẢN'));
    if (menuLink) menuLink.classList.add('active');

    // 3. Xử lý ô Dropdown Vai Trò dựa trên quyền
    let vaiTroOptions = '';
    if (isAdmin) {
        vaiTroOptions = `
            <option value="QuanLySan" selected>Quản lý Cụm Sân</option>
            <option value="NhanVien">Nhân viên Thu ngân/Phục vụ</option>
            <option value="Admin">Admin (Toàn quyền)</option>
        `;
    } else {
        // Quản lý sân chỉ được cấp quyền Nhân viên
        vaiTroOptions = `<option value="NhanVien" selected>Nhân viên Thu ngân/Phục vụ</option>`;
    }

    // 4. Xử lý ô Dropdown Cơ sở Quản lý
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
        // Quản lý sân không được chọn cơ sở, hệ thống sẽ tự ẩn
        cumSanHtml = `<input type="hidden" id="tk-cumsan" value="">`;
    }

    // 5. Render toàn bộ Giao diện
    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="margin-bottom: 24px;">
            <h1 class="page-title">Cấp tài khoản Nội bộ</h1>
            <p class="text-muted">Tạo tài khoản quản trị phân quyền cho Ban quản lý hoặc Admin</p>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 350px; gap: 24px; align-items: start;">
            <!-- Form Card -->
            <div class="panel" style="padding: 30px;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 25px; border-bottom: 1px solid var(--border); padding-bottom: 15px;">
                    <div style="width: 45px; height: 45px; border-radius: 10px; background: #eff6ff; color: #3b82f6; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;"><i class="fa-solid fa-user-shield"></i></div>
                    <div>
                        <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-dark);">Thông tin định danh</h3>
                        <span style="font-size: 0.85rem; color: var(--text-muted);">Điền thông tin bắt buộc để khởi tạo tài khoản</span>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div class="form-group">
                        <label style="font-weight: 600;">Họ và tên <span style="color: red;">*</span></label>
                        <input type="text" id="tk-hoten" class="form-control" placeholder="VD: Nguyễn Văn A">
                    </div>
                    <div class="form-group">
                        <label style="font-weight: 600;">Số điện thoại <span style="color: red;">*</span></label>
                        <input type="text" id="tk-sdt" class="form-control" placeholder="Dùng để đăng nhập">
                    </div>
                    <div class="form-group">
                        <label style="font-weight: 600;">Email <span style="color: red;">*</span></label>
                        <input type="email" id="tk-email" class="form-control" placeholder="Dùng để nhận thông báo">
                    </div>
                    <div class="form-group">
                        <label style="font-weight: 600;">Mật khẩu khởi tạo <span style="color: red;">*</span></label>
                        <input type="text" id="tk-matkhau" class="form-control" value="123456" placeholder="Ít nhất 6 ký tự">
                    </div>
                </div>

                <div style="margin-top: 15px; border-top: 1px dashed var(--border); padding-top: 20px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <!-- Dropdown Vai Trò (Đã được điều chỉnh động) -->
                        <div class="form-group">
                            <label style="font-weight: 600;">Vai trò phân quyền <span style="color: red;">*</span></label>
                            <select id="tk-vaitro" class="form-control" style="border-color: #3b82f6; background: #f8fafc;" onchange="toggleCumSanSelect(this.value)">
                                ${vaiTroOptions}
                            </select>
                        </div>
                        
                        <!-- Dropdown Cơ Sở (Đã được điều chỉnh động) -->
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
                    <li style="margin-bottom: 10px;"><strong style="color: var(--text-dark);">Admin:</strong> Có toàn quyền xem báo cáo doanh thu tổng, duyệt yêu cầu rút tiền và quản lý hệ thống. Không thuộc cụm sân nào.</li>
                    <li><strong style="color: var(--text-dark);">Quản lý sân:</strong> Chỉ được phép quản lý lịch đặt, khách hàng và cấu hình giá của Cụm sân được chỉ định. Dữ liệu tài chính bị cách ly hoàn toàn.</li>
                     <!-- Thêm hướng dẫn cho Nhân viên -->
                    <li><strong style="color: var(--text-dark);">Nhân viên:</strong> Chịu trách nhiệm thực hiện các nghiệp vụ như bàn giao ca, xử lý đặt sân, thu tiền tại cụm sân được chỉ định.</li>
                </ul>
            </div>
        </div>
    `;

    // 6. Tải danh sách cụm sân (chỉ chạy nếu là Admin)
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
    const mat_khau = document.getElementById('tk-matkhau').value;
    const vai_tro = document.getElementById('tk-vaitro').value;
    const id_cum_san = document.getElementById('tk-cumsan').value;

    if (!ho_ten || !so_dien_thoai || !email || !mat_khau) {
        return showSystemModal('Thiếu thông tin', 'Vui lòng điền đầy đủ các trường bắt buộc có dấu (*).', 'error');
    }

    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    if (currentUser.VaiTro === 'Admin' && (vai_tro === 'QuanLySan' || vai_tro === 'NhanVien') && !id_cum_san) {
        return showSystemModal('Chưa chọn cơ sở', 'Vui lòng chọn Cụm Sân.', 'error');
    }

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right: 8px;"></i> Đang tạo...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/admin/cap-tai-khoan`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ ho_ten, so_dien_thoai, email, mat_khau, vai_tro, id_cum_san })
        });
        const data = await response.json();
        
        if (response.ok && data.user) {
            showSystemModal('Thành công!', 'Tài khoản nội bộ đã được khởi tạo thành công.', 'success');
            
            // Xóa rỗng form nhưng giữ lại mật khẩu mặc định
            document.getElementById('tk-hoten').value = '';
            document.getElementById('tk-sdt').value = '';
            document.getElementById('tk-email').value = '';
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
            <button class="btn-back" onclick="renderCumSanDetail(${clusterId})"><i class="fa-solid fa-arrow-left"></i> Quay lại cấu hình sân</button>
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

// ======================================================
// MODULE: QUẢN LÝ SÂN - KHO & NHẬP HÀNG
// ======================================================
let allSanPhamKhoData = [];
let sanPhamKhoPage = 1;
const sanPhamKhoItemsPerPage = 5;
let currentKhoSearchTerm = '';

let allPhieuNhapData = [];
let phieuNhapPage = 1;
const phieuNhapItemsPerPage = 5;
let phieuNhapFilterMonth = '';
let phieuNhapFilterYear = '';

let pnCart = [];

function renderQuanLyKho() {
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = document.getElementById('menu-kho');
    if (menuLink) menuLink.classList.add('active');

    const today = new Date();
    phieuNhapFilterMonth = (today.getMonth() + 1).toString().padStart(2, '0');
    phieuNhapFilterYear = today.getFullYear().toString();

    let yearOptions = '';
    for(let y = today.getFullYear(); y >= 2024; y--) {
        yearOptions += `<option value="${y}" ${y.toString() === phieuNhapFilterYear ? 'selected' : ''}>Năm ${y}</option>`;
    }

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
            <div>
                <h1 class="page-title">Quản lý Kho & Nhập Hàng</h1>
                <p class="text-muted">Quản lý danh mục mặt hàng và theo dõi lịch sử nhập hàng tại cụm sân của bạn.</p>
            </div>
            <button class="btn-primary" onclick="openNhapHangModal()"><i class="fa-solid fa-truck-ramp-box" style="margin-right: 8px;"></i> Lập Phiếu Nhập Hàng</button>
        </div>

        <div class="panel">
            <div style="display: flex; gap: 20px; border-bottom: 1px solid var(--border); margin-bottom: 20px; padding: 0 20px;">
                <button class="nav-tab active" onclick="switchKhoTab('tab-sanpham', this)" style="padding: 15px 10px; border: none; background: transparent; font-weight: 600; cursor: pointer; border-bottom: 2px solid var(--primary); color: var(--primary);">Danh sách Sản phẩm</button>
                <button class="nav-tab" onclick="switchKhoTab('tab-phieunhap', this)" style="padding: 15px 10px; border: none; background: transparent; font-weight: 600; cursor: pointer; color: var(--text-muted);">Lịch sử Nhập hàng</button>
                <button class="nav-tab" onclick="switchKhoTab('tab-hoadon', this)" style="padding: 15px 10px; border: none; background: transparent; font-weight: 600; cursor: pointer; color: var(--text-muted);">Hóa đơn Bán hàng</button>
            </div>

            <!-- Tab 1: Danh sách sản phẩm -->
            <div id="tab-sanpham" class="tab-pane active" style="padding: 0 20px 20px 20px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                    <div style="position: relative; width: 300px;">
                        <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 12px; top: 12px; color: var(--text-muted);"></i>
                        <input type="text" class="form-control" style="padding-left: 35px;" placeholder="Tìm tên sản phẩm..." oninput="handleKhoSearch(this.value)">
                    </div>
                    <button class="btn-primary" style="padding: 8px 16px; border-radius: 6px;" onclick="openSanPhamModal()"><i class="fa-solid fa-plus"></i> Thêm món</button>
                </div>
                <div class="table-responsive">
                    <table class="admin-table">
                        <thead style="background: #F8FAFC;">
                            <tr>
                                <th>Tên Mặt Hàng</th>
                                <th>Giá Bán</th>
                                <th style="text-align: center;">Tồn Kho</th>
                                <th style="text-align: center;">Trạng Thái UI</th>
                                <th style="text-align: center;">Hành động</th>
                            </tr>
                        </thead>
                        <tbody id="sanpham-table-body">
                            <tr><td colspan="5" class="text-center" style="padding: 30px; text-align: center;">Đang tải danh sách...</td></tr>
                        </tbody>
                    </table>
                </div>
                <div id="sanpham-pagination" style="display: flex; justify-content: center; gap: 8px; margin-top: 15px;"></div>
            </div>

            <!-- Tab 2: Lịch sử nhập hàng -->
            <div id="tab-phieunhap" class="tab-pane" style="display: none; padding: 0 20px 20px 20px;">
                <div style="display: flex; gap: 15px; margin-bottom: 15px;">
                    <select class="form-control" style="width: 150px;" id="filter-phieunhap-month" onchange="handlePhieuNhapFilter()">
                        <option value="All">Tất cả tháng</option>
                        ${[...Array(12)].map((_, i) => {
                            let m = (i + 1).toString().padStart(2, '0');
                            return `<option value="${m}" ${m === phieuNhapFilterMonth ? 'selected' : ''}>Tháng ${m}</option>`;
                        }).join('')}
                    </select>
                    <select class="form-control" style="width: 150px;" id="filter-phieunhap-year" onchange="handlePhieuNhapFilter()">
                        <option value="All">Tất cả năm</option>
                        ${yearOptions}
                    </select>
                </div>
                <div class="table-responsive">
                    <table class="admin-table">
                        <thead style="background: #F8FAFC;">
                            <tr>
                                <th>Mã Phiếu</th>
                                <th>Người Nhập</th>
                                <th>Chi tiết hàng hóa</th>
                                <th>Tổng thanh toán</th>
                                <th>Ngày nhập</th>
                            </tr>
                        </thead>
                        <tbody id="phieunhap-table-body">
                            <tr><td colspan="5" class="text-center" style="padding: 30px; text-align: center;">Đang tải lịch sử...</td></tr>
                        </tbody>
                    </table>
                </div>
                <div id="phieunhap-pagination" style="display: flex; justify-content: center; gap: 8px; margin-top: 15px;"></div>
            </div>

            <!-- Tab 3: Lịch sử hóa đơn bán hàng -->
            <div id="tab-hoadon" class="tab-pane" style="display: none; padding: 0 20px 20px 20px;">
                <div style="display: flex; gap: 15px; margin-bottom: 15px;">
                    <input type="date" class="form-control" style="width: 180px;" id="qlhoadon-date-filter" onchange="handleQLHoaDonDateFilter(this.value)">
                    <button class="btn-outline-sm" onclick="document.getElementById('qlhoadon-date-filter').value=''; handleQLHoaDonDateFilter('')" style="padding: 6px 12px;">Xóa lọc ngày</button>
                </div>

                <div class="table-responsive">
                    <table class="admin-table">
                        <thead style="background: #F8FAFC;">
                            <tr>
                                <th>Mã Hóa Đơn</th>
                                <th>Nhân Viên Lập</th>
                                <th>Chi tiết món</th>
                                <th>Tổng doanh thu</th>
                                <th>Thời gian</th>
                            </tr>
                        </thead>
                        <tbody id="qlhoadon-table-body">
                            <tr><td colspan="5" class="text-center" style="padding: 30px; text-align: center;">Đang tải dữ liệu...</td></tr>
                        </tbody>
                    </table>
                </div>
                <div id="qlhoadon-pagination" style="display: flex; justify-content: center; gap: 8px; margin-top: 15px;"></div>
            </div>
        </div>
    `;

    loadDanhSachSanPhamKho(currentUser.ID_CumSan);
}

function switchKhoTab(tabId, element) {
    const tabs = element.parentElement.children;
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
        tabs[i].style.borderBottom = 'none';
        tabs[i].style.color = 'var(--text-muted)';
    }
    element.classList.add('active');
    element.style.borderBottom = '2px solid var(--primary)';
    element.style.color = 'var(--primary)';

    document.getElementById('tab-sanpham').style.display = 'none';
    document.getElementById('tab-phieunhap').style.display = 'none';
    document.getElementById('tab-hoadon').style.display = 'none';
    document.getElementById(tabId).style.display = 'block';

    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    if (tabId === 'tab-phieunhap') {
        loadLichSuNhapHang(currentUser.ID_CumSan);
    } else if (tabId === 'tab-hoadon') {
        loadQuanLyHoaDonBanHang(currentUser.ID_CumSan);
    } else {
        loadDanhSachSanPhamKho(currentUser.ID_CumSan);
    }
}

// ----------------------------------------------------
// TAB 1: QUẢN LÝ SẢN PHẨM & TỒN KHO
// ----------------------------------------------------
async function loadDanhSachSanPhamKho(idCumSan) {
    try {
        const response = await fetch(`${API_BASE_URL}/san-pham?id_cum_san=${idCumSan}`);
        const res = await response.json();
        
        if (res.success) {
            allSanPhamKhoData = res.data || [];
            applySanPhamFilterAndRender();
        }
    } catch (e) {
        document.getElementById('sanpham-table-body').innerHTML = `<tr><td colspan="5" class="text-center text-danger" style="padding: 30px;">Lỗi kết nối máy chủ!</td></tr>`;
    }
}

function handleKhoSearch(val) {
    currentKhoSearchTerm = val.toLowerCase().trim();
    sanPhamKhoPage = 1;
    applySanPhamFilterAndRender();
}

function applySanPhamFilterAndRender() {
    let filtered = allSanPhamKhoData.filter(p => p.TenSanPham.toLowerCase().includes(currentKhoSearchTerm));

    const totalPages = Math.ceil(filtered.length / sanPhamKhoItemsPerPage) || 1;
    if (sanPhamKhoPage > totalPages) sanPhamKhoPage = totalPages;

    const startIdx = (sanPhamKhoPage - 1) * sanPhamKhoItemsPerPage;
    const pageData = filtered.slice(startIdx, startIdx + sanPhamKhoItemsPerPage);

    const tbody = document.getElementById('sanpham-table-body');
    if (pageData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 30px; text-align: center;">Không có sản phẩm nào.</td></tr>`;
    } else {
        tbody.innerHTML = pageData.map(p => {
            const isHetHang = p.SoLuongTon <= 0;
            const badgeHtml = isHetHang 
                ? `<span style="padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; background: #fee2e2; color: #ef4444; font-weight: bold;">Đang mờ (Hết hàng)</span>` 
                : `<span style="padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; background: #d1fae5; color: #047857; font-weight: bold;">Sáng (Đang bán)</span>`;
            
            const tonKhoStyle = isHetHang ? 'color: #ef4444; font-weight: bold;' : 'color: #1e293b; font-weight: bold;';

            // Dữ liệu dùng để Sửa
            const spDataStr = JSON.stringify(p).replace(/'/g, "\\'");

            return `
                <tr>
                    <td><strong style="color: var(--text-dark);">${p.TenSanPham}</strong></td>
                    <td><strong style="color: #ea580c;">${Number(p.GiaBan).toLocaleString('vi-VN')}đ</strong></td>
                    <td style="text-align: center;"><span style="${tonKhoStyle}">${p.SoLuongTon}</span></td>
                    <td style="text-align: center;">${badgeHtml}</td>
                    <td style="text-align: center;">
                        <button class="action-btn" onclick='openSanPhamModal(${spDataStr})'><i class="fa-solid fa-pen-to-square"></i> Sửa</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    renderSanPhamPagination(totalPages);
}

function renderSanPhamPagination(totalPages) {
    const div = document.getElementById('sanpham-pagination');
    if (totalPages <= 1) return div.innerHTML = '';
    
    let html = `<button class="btn-outline-sm" ${sanPhamKhoPage === 1 ? 'disabled style="opacity:0.5;"' : ''} onclick="sanPhamKhoPage--; applySanPhamFilterAndRender()"><i class="fa-solid fa-chevron-left"></i></button>`;
    
    const getPages = (current, total) => {
        if (total <= 6) return Array.from({length: total}, (_, i) => i + 1);
        if (current <= 3) return [1, 2, 3, 4, '...', total];
        if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
        return [1, '...', current - 1, current, current + 1, '...', total];
    };

    getPages(sanPhamKhoPage, totalPages).forEach(i => {
        if (i === '...') {
            html += `<span style="padding: 6px 10px; color: var(--text-muted); font-weight: bold;">...</span>`;
        } else {
            html += `<button class="${i === sanPhamKhoPage ? 'btn-primary' : 'btn-outline-sm'}" style="padding: 6px 14px;" onclick="sanPhamKhoPage=${i}; applySanPhamFilterAndRender()">${i}</button>`;
        }
    });

    html += `<button class="btn-outline-sm" ${sanPhamKhoPage === totalPages ? 'disabled style="opacity:0.5;"' : ''} onclick="sanPhamKhoPage++; applySanPhamFilterAndRender()"><i class="fa-solid fa-chevron-right"></i></button>`;
    div.innerHTML = html;
}

// Logic Lưu Sản phẩm
function showSPAlert(msg, isSuccess) {
    const alert = document.getElementById('sanpham-alert');
    alert.textContent = msg;
    alert.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alert.style.display = 'block';
    setTimeout(() => alert.style.display = 'none', 3000);
}

function openSanPhamModal(sp = null) {
    document.getElementById('sanpham-alert').style.display = 'none';
    
    // Reset file input & preview
    document.getElementById('sp-hinhanh').value = '';
    const imgPreview = document.getElementById('sp-img-preview');
    const previewContainer = document.getElementById('sp-preview-container');
    
    if (sp) {
        document.getElementById('sanpham-modal-title').textContent = 'Chỉnh Sửa Sản Phẩm';
        document.getElementById('sp-id').value = sp.ID;
        document.getElementById('sp-ten').value = sp.TenSanPham;
        document.getElementById('sp-gia').value = sp.GiaBan;
        
        if (sp.HinhAnh) {
            imgPreview.src = `http://127.0.0.1:8000${sp.HinhAnh}`;
            previewContainer.style.display = 'block';
        } else {
            previewContainer.style.display = 'none';
        }
    } else {
        document.getElementById('sanpham-modal-title').textContent = 'Thêm Sản Phẩm Mới';
        document.getElementById('sp-id').value = '';
        document.getElementById('sp-ten').value = '';
        document.getElementById('sp-gia').value = '';
        previewContainer.style.display = 'none';
    }
    document.getElementById('sanpham-modal').style.display = 'flex';
}

// Bổ sung sự kiện Preview Ảnh khi người dùng chọn file
document.getElementById('sp-hinhanh').addEventListener('change', function(e) {
    const file = e.target.files[0];
    const previewContainer = document.getElementById('sp-preview-container');
    const imgPreview = document.getElementById('sp-img-preview');
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            imgPreview.src = e.target.result;
            previewContainer.style.display = 'block';
        }
        reader.readAsDataURL(file);
    } else {
        previewContainer.style.display = 'none';
    }
});

function closeSanPhamModal() { document.getElementById('sanpham-modal').style.display = 'none'; }

async function saveSanPham() {
    const id = document.getElementById('sp-id').value;
    const ten = document.getElementById('sp-ten').value.trim();
    const gia = document.getElementById('sp-gia').value;
    const imageFile = document.getElementById('sp-hinhanh').files[0];
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));

    if (!ten || !gia) return showSPAlert('Vui lòng nhập tên và giá bán!', false);

    const btn = document.getElementById('btn-save-sp');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
    btn.disabled = true;

    const formData = new FormData();
    formData.append('ID_CumSan', currentUser.ID_CumSan);
    formData.append('TenSanPham', ten);
    formData.append('GiaBan', gia);
    
    if (imageFile) {
        formData.append('HinhAnh', imageFile);
    }

    if (id) {
        formData.append('_method', 'PUT'); // Laravel yêu cầu gửi _method=PUT khi upload file dạng PUT
    }

    const url = id ? `${API_BASE_URL}/san-pham/${id}` : `${API_BASE_URL}/san-pham`;

    try {
        const response = await fetch(url, {
            method: 'POST', // Gửi bằng POST vì có file, Laravel sẽ tự bắt _method=PUT
            headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` },
            body: formData
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
            showSPAlert('Lưu thành công!', true);
            setTimeout(() => {
                closeSanPhamModal();
                loadDanhSachSanPhamKho(currentUser.ID_CumSan);
            }, 1000);
        } else {
            showSPAlert(data.message || 'Lỗi xử lý', false);
        }
    } catch (e) {
        showSPAlert('Lỗi kết nối máy chủ!', false);
    } finally {
        btn.innerHTML = 'Lưu Sản Phẩm';
        btn.disabled = false;
    }
}

// ----------------------------------------------------
// TAB 2: LỊCH SỬ NHẬP HÀNG & PHIẾU NHẬP
// ----------------------------------------------------
async function loadLichSuNhapHang(idCumSan) {
    try {
        const response = await fetch(`${API_BASE_URL}/phieu-nhap?id_cum_san=${idCumSan}`);
        const res = await response.json();
        
        if (res.success) {
            allPhieuNhapData = res.data || [];
            applyPhieuNhapFiltersAndRender();
        }
    } catch (e) {
        document.getElementById('phieunhap-table-body').innerHTML = `<tr><td colspan="5" class="text-center text-danger" style="padding: 30px;">Lỗi kết nối máy chủ!</td></tr>`;
    }
}

function handlePhieuNhapFilter() {
    phieuNhapFilterMonth = document.getElementById('filter-phieunhap-month').value;
    phieuNhapFilterYear = document.getElementById('filter-phieunhap-year').value;
    phieuNhapPage = 1;
    applyPhieuNhapFiltersAndRender();
}

function applyPhieuNhapFiltersAndRender() {
    let filtered = allPhieuNhapData.filter(pn => {
        if (!pn.NgayNhap) return false;
        
        // Cắt lấy tháng và năm từ chuỗi YYYY-MM-DD
        const dateParts = pn.NgayNhap.split('-'); 
        if (dateParts.length < 2) return false;
        
        const y = dateParts[0];
        const m = dateParts[1];

        const matchMonth = (phieuNhapFilterMonth === 'All' || m === phieuNhapFilterMonth);
        const matchYear = (phieuNhapFilterYear === 'All' || y === phieuNhapFilterYear);
        
        return matchMonth && matchYear;
    });

    const totalPages = Math.ceil(filtered.length / phieuNhapItemsPerPage) || 1;
    if (phieuNhapPage > totalPages) phieuNhapPage = totalPages;

    const startIdx = (phieuNhapPage - 1) * phieuNhapItemsPerPage;
    const pageData = filtered.slice(startIdx, startIdx + phieuNhapItemsPerPage);

    const tbody = document.getElementById('phieunhap-table-body');
    if (pageData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 30px; text-align: center;">Không có phiếu nhập nào trong thời gian này.</td></tr>`;
    } else {
        tbody.innerHTML = pageData.map(pn => {
            const listItems = pn.ChiTietNhap.map(item => `<li><i class="fa-solid fa-angle-right" style="font-size:0.7rem; color:#94a3b8; margin-right:4px;"></i> ${item.ten_san_pham}: <strong style="color:var(--text-dark);">${item.so_luong}</strong></li>`).join('');
            
            const dateStr = pn.NgayNhap.replace('T', ' ').substring(0, 16);

            return `
                <tr>
                    <td><strong style="font-family: monospace; color: #475569;">#PN${pn.ID}</strong></td>
                    <td>${pn.nhan_vien ? pn.nhan_vien.HoTen : 'N/A'}</td>
                    <td><ul style="list-style: none; padding: 0; margin: 0; font-size: 0.85rem;">${listItems}</ul></td>
                    <td><strong style="color: #b91c1c;">${Number(pn.TongTienThanhToan).toLocaleString('vi-VN')}đ</strong></td>
                    <td><span style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> ${dateStr}</span></td>
                </tr>
            `;
        }).join('');
    }

    renderPhieuNhapPagination(totalPages);
}

function renderPhieuNhapPagination(totalPages) {
    const div = document.getElementById('phieunhap-pagination');
    if (totalPages <= 1) return div.innerHTML = '';
    
    let html = `<button class="btn-outline-sm" ${phieuNhapPage === 1 ? 'disabled style="opacity:0.5;"' : ''} onclick="phieuNhapPage--; applyPhieuNhapFiltersAndRender()"><i class="fa-solid fa-chevron-left"></i></button>`;
    
    const getPages = (current, total) => {
        if (total <= 6) return Array.from({length: total}, (_, i) => i + 1);
        if (current <= 3) return [1, 2, 3, 4, '...', total];
        if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
        return [1, '...', current - 1, current, current + 1, '...', total];
    };

    getPages(phieuNhapPage, totalPages).forEach(i => {
        if (i === '...') {
            html += `<span style="padding: 6px 10px; color: var(--text-muted); font-weight: bold;">...</span>`;
        } else {
            html += `<button class="${i === phieuNhapPage ? 'btn-primary' : 'btn-outline-sm'}" style="padding: 6px 14px;" onclick="phieuNhapPage=${i}; applyPhieuNhapFiltersAndRender()">${i}</button>`;
        }
    });

    html += `<button class="btn-outline-sm" ${phieuNhapPage === totalPages ? 'disabled style="opacity:0.5;"' : ''} onclick="phieuNhapPage++; applyPhieuNhapFiltersAndRender()"><i class="fa-solid fa-chevron-right"></i></button>`;
    div.innerHTML = html;
}

// Logic Phiếu Nhập Hàng
function showPNAlert(msg, isSuccess) {
    const alert = document.getElementById('phieunhap-alert');
    alert.textContent = msg;
    alert.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alert.style.display = 'block';
    setTimeout(() => alert.style.display = 'none', 3000);
}

function openNhapHangModal() {
    document.getElementById('phieunhap-alert').style.display = 'none';
    pnCart = [];
    document.getElementById('pn-tongtien').value = '';
    renderPnCart();

    // Render danh sách sản phẩm vào Dropdown
    const select = document.getElementById('pn-chon-sp');
    if (allSanPhamKhoData.length === 0) {
        select.innerHTML = '<option value="">-- Kho chưa có mặt hàng nào --</option>';
    } else {
        select.innerHTML = '<option value="">-- Chọn mặt hàng cần nhập --</option>' + allSanPhamKhoData.map(p => `<option value="${p.ID}" data-name="${p.TenSanPham}">${p.TenSanPham}</option>`).join('');
    }

    document.getElementById('phieunhap-modal').style.display = 'flex';
}

function closePhieuNhapModal() { document.getElementById('phieunhap-modal').style.display = 'none'; }

function addSpToPhieuNhap() {
    const select = document.getElementById('pn-chon-sp');
    const slInput = document.getElementById('pn-soluong');
    const id = select.value;
    const sl = parseInt(slInput.value);

    if (!id || isNaN(sl) || sl <= 0) {
        return showPNAlert('Vui lòng chọn hàng và nhập số lượng hợp lệ!', false);
    }

    const name = select.options[select.selectedIndex].getAttribute('data-name');
    
    // Kiểm tra xem đã có trong giỏ chưa
    const existing = pnCart.find(i => i.id_san_pham == id);
    if (existing) {
        existing.so_luong += sl;
    } else {
        pnCart.push({ id_san_pham: id, ten_san_pham: name, so_luong: sl });
    }

    slInput.value = '';
    renderPnCart();
}

function removeSpFromPhieuNhap(index) {
    pnCart.splice(index, 1);
    renderPnCart();
}

function renderPnCart() {
    const tbody = document.getElementById('pn-danhsach-sp');
    if (pnCart.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">Chưa chọn mặt hàng nào.</td></tr>`;
        return;
    }

    tbody.innerHTML = pnCart.map((item, idx) => `
        <tr>
            <td><strong style="color: var(--text-dark);">${item.ten_san_pham}</strong></td>
            <td style="text-align: center;"><span style="font-weight: bold; color: var(--primary);">${item.so_luong}</span></td>
            <td style="text-align: center;"><i class="fa-solid fa-trash-can" style="color: #ef4444; cursor: pointer;" onclick="removeSpFromPhieuNhap(${idx})"></i></td>
        </tr>
    `).join('');
}

async function submitPhieuNhap() {
    if (pnCart.length === 0) return showPNAlert('Vui lòng thêm ít nhất 1 mặt hàng vào phiếu nhập.', false);
    
    const tongTien = document.getElementById('pn-tongtien').value;
    if (!tongTien || tongTien < 0) return showPNAlert('Vui lòng nhập tổng tiền đã thanh toán.', false);

    const btn = document.getElementById('btn-save-pn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    btn.disabled = true;

    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    const payload = {
        ID_CumSan: currentUser.ID_CumSan,
        ID_NhanVien: currentUser.ID,
        TongTienThanhToan: tongTien,
        ChiTietNhap: pnCart
    };

    try {
        const response = await fetch(`${API_BASE_URL}/phieu-nhap`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
            showPNAlert('Nhập hàng và cộng kho thành công!', true);
            setTimeout(() => {
                closePhieuNhapModal();
                loadDanhSachSanPhamKho(currentUser.ID_CumSan); // Cập nhật lại kho
                loadLichSuNhapHang(currentUser.ID_CumSan);     // Cập nhật lại lịch sử
            }, 1000);
        } else {
            showPNAlert(data.message || 'Lỗi xử lý', false);
        }
    } catch (e) {
        showPNAlert('Lỗi kết nối máy chủ!', false);
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Hoàn Tất Nhập Kho';
        btn.disabled = false;
    }
}

// 3. Tab 3: Quản lý Hóa đơn bán hàng
// KHAI BÁO BIẾN CHO TAB HÓA ĐƠN
let allQuanLyHoaDonData = [];
let quanLyHoaDonPage = 1;
const quanLyHoaDonItemsPerPage = 5;
let qlHoaDonDateFilter = '';

// HÀM XỬ LÝ KHI THAY ĐỔI NGÀY LỌC
function handleQLHoaDonDateFilter(val) {
    qlHoaDonDateFilter = val;
    quanLyHoaDonPage = 1; // Reset về trang 1 khi lọc
    renderQuanLyHoaDonPagination();
}

// HÀM FETCH HÓA ĐƠN
async function loadQuanLyHoaDonBanHang(idCumSan) {
    try {
        const response = await fetch(`${API_BASE_URL}/ban-hang?id_cum_san=${idCumSan}`);
        const res = await response.json();
        
        if (res.success) {
            allQuanLyHoaDonData = res.data || [];
            renderQuanLyHoaDonPagination();
        }
    } catch (e) {
        document.getElementById('qlhoadon-table-body').innerHTML = `<tr><td colspan="5" class="text-center text-danger" style="padding: 30px;">Lỗi kết nối máy chủ!</td></tr>`;
    }
}

// HÀM RENDER VÀ PHÂN TRANG HÓA ĐƠN (ĐÃ TÍCH HỢP LỌC NGÀY)
function renderQuanLyHoaDonPagination() {
    // 1. Lọc dữ liệu theo ngày nếu qlHoaDonDateFilter có giá trị
    let filteredData = allQuanLyHoaDonData.filter(hd => {
        if (!qlHoaDonDateFilter) return true;
        const hdDate = hd.NgayTao ? hd.NgayTao.substring(0, 10) : '';
        return hdDate === qlHoaDonDateFilter;
    });

    const totalPages = Math.ceil(filteredData.length / quanLyHoaDonItemsPerPage) || 1;
    if (quanLyHoaDonPage > totalPages) quanLyHoaDonPage = totalPages;

    const startIdx = (quanLyHoaDonPage - 1) * quanLyHoaDonItemsPerPage;
    const pageData = filteredData.slice(startIdx, startIdx + quanLyHoaDonItemsPerPage);

    const tbody = document.getElementById('qlhoadon-table-body');
    if (pageData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 30px; text-align: center;">Không có hóa đơn nào phù hợp.</td></tr>`;
    } else {
        tbody.innerHTML = pageData.map(hd => {
            let cacMon = '';
            if (hd.chi_tiet_hoa_dons && hd.chi_tiet_hoa_dons.length > 0) {
                cacMon = hd.chi_tiet_hoa_dons.map(ct => {
                    const tenMon = ct.san_pham ? ct.san_pham.TenSanPham : 'Sản phẩm lỗi';
                    return `<li><i class="fa-solid fa-angle-right" style="font-size:0.7rem; color:#94a3b8; margin-right:4px;"></i> ${tenMon}: <strong style="color:var(--text-dark);">${ct.SoLuong}</strong></li>`;
                }).join('');
            } else {
                cacMon = '<span class="text-muted">Không có món</span>';
            }

            const dateStr = hd.NgayTao ? hd.NgayTao.replace('T', ' ').substring(0, 16) : '';
            
            return `
                <tr>
                    <td><strong style="font-family: monospace; color: #475569;">#HD${hd.ID}</strong></td>
                    <td><div style="font-weight: 600; color: #3b82f6;">${hd.nhan_vien ? hd.nhan_vien.HoTen : 'N/A'}</div></td>
                    <td><ul style="list-style: none; padding: 0; margin: 0; font-size: 0.85rem;">${cacMon}</ul></td>
                    <td><strong style="color: #10b981;">${Number(hd.TongTien).toLocaleString('vi-VN')}đ</strong></td>
                    <td><span style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> ${dateStr}</span></td>
                </tr>
            `;
        }).join('');
    }

    const div = document.getElementById('qlhoadon-pagination');
    if (totalPages <= 1) return div.innerHTML = '';
    
    let html = `<button class="btn-outline-sm" ${quanLyHoaDonPage === 1 ? 'disabled style="opacity:0.5;"' : ''} onclick="quanLyHoaDonPage--; renderQuanLyHoaDonPagination()"><i class="fa-solid fa-chevron-left"></i></button>`;
    
    const getPages = (current, total) => {
        if (total <= 6) return Array.from({length: total}, (_, i) => i + 1);
        if (current <= 3) return [1, 2, 3, 4, '...', total];
        if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
        return [1, '...', current - 1, current, current + 1, '...', total];
    };

    getPages(quanLyHoaDonPage, totalPages).forEach(i => {
        if (i === '...') {
            html += `<span style="padding: 6px 10px; color: var(--text-muted); font-weight: bold;">...</span>`;
        } else {
            html += `<button class="${i === quanLyHoaDonPage ? 'btn-primary' : 'btn-outline-sm'}" style="padding: 6px 14px;" onclick="quanLyHoaDonPage=${i}; renderQuanLyHoaDonPagination()">${i}</button>`;
        }
    });

    html += `<button class="btn-outline-sm" ${quanLyHoaDonPage === totalPages ? 'disabled style="opacity:0.5;"' : ''} onclick="quanLyHoaDonPage++; renderQuanLyHoaDonPagination()"><i class="fa-solid fa-chevron-right"></i></button>`;
    div.innerHTML = html;
}

// ======================================================
// MODULE: ADMIN - QUẢN LÝ XUẤT/NHẬP HÀNG TỔNG
// ======================================================
let adminPhieuNhapData = [];
let adminPhieuNhapPage = 1;
let adminPhieuNhapSearch = '';
let adminPhieuNhapDate = '';
let adminPhieuNhapCumSan = 'All';

let adminHoaDonData = [];
let adminHoaDonPage = 1;
let adminHoaDonSearch = '';
let adminHoaDonDate = '';
let adminHoaDonCumSan = 'All';

const itemsPerAdminXNPage = 5;
let adminCumSanOptions = ''; // Cache HTML Dropdown Cụm sân

async function renderAdminXuatNhap() {
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = document.getElementById('menu-xuatnhap-admin');
    if (menuLink) menuLink.classList.add('active');

    // Fetch danh sách cụm sân để làm Dropdown Lọc nếu chưa có
    if (!adminCumSanOptions) {
        try {
            const res = await fetch(`${API_BASE_URL}/cum-san`);
            const data = await res.json();
            if (data.success) {
                adminCumSanOptions = data.data.map(cs => `<option value="${cs.ID}">${cs.TenCumSan}</option>`).join('');
            }
        } catch (e) { console.error(e); }
    }

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="margin-bottom: 24px;">
            <h1 class="page-title">Quản lý Xuất / Nhập hàng Toàn Hệ Thống</h1>
            <p class="text-muted">Giám sát lịch sử nhập kho và hóa đơn bán hàng của tất cả các cơ sở.</p>
        </div>

        <div class="panel">
            <div style="display: flex; gap: 20px; border-bottom: 1px solid var(--border); margin-bottom: 20px; padding: 0 20px;">
                <button class="nav-tab active" onclick="switchAdminXuatNhapTab('tab-admin-phieunhap', this)" style="padding: 15px 10px; border: none; background: transparent; font-weight: 600; cursor: pointer; border-bottom: 2px solid var(--primary); color: var(--primary);">Lịch sử Nhập hàng</button>
                <button class="nav-tab" onclick="switchAdminXuatNhapTab('tab-admin-hoadon', this)" style="padding: 15px 10px; border: none; background: transparent; font-weight: 600; cursor: pointer; color: var(--text-muted);">Hóa đơn Bán hàng</button>
            </div>

            <!-- TAB 1: PHIẾU NHẬP -->
            <div id="tab-admin-phieunhap" class="tab-pane active" style="padding: 0 20px 20px 20px;">
                <div style="display: flex; gap: 15px; margin-bottom: 15px; flex-wrap: wrap;">
                    <div style="position: relative; flex: 1; min-width: 200px;">
                        <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 12px; top: 12px; color: var(--text-muted);"></i>
                        <input type="text" class="form-control" style="padding-left: 35px;" placeholder="Tìm mã phiếu, người nhập, tên món..." oninput="handleAdminPNSearch(this.value)">
                    </div>
                    <select class="form-control" style="width: 200px;" onchange="handleAdminPNCumSan(this.value)">
                        <option value="All">Tất cả Cơ sở</option>
                        ${adminCumSanOptions}
                    </select>
                    <input type="date" class="form-control" style="width: 150px;" onchange="handleAdminPNDate(this.value)">
                    <button class="btn-outline-sm" onclick="document.querySelector('input[type=date]').value=''; handleAdminPNDate('')">Xóa lọc ngày</button>
                    <button class="btn-primary" onclick="exportAdminPhieuNhapExcel()" style="background: #059669; border-color: #059669; padding: 8px 14px;"><i class="fa-solid fa-file-excel"></i> Xuất Excel</button>
                </div>
                
                <div class="table-responsive">
                    <table class="admin-table">
                        <thead style="background: #F8FAFC;">
                            <tr>
                                <th>Mã Phiếu</th>
                                <th>Cơ sở</th>
                                <th>Người Nhập</th>
                                <th>Chi tiết hàng hóa</th>
                                <th>Tổng thanh toán</th>
                                <th>Ngày nhập</th>
                            </tr>
                        </thead>
                        <tbody id="admin-pn-tbody"><tr><td colspan="6" class="text-center" style="text-align: center;">Đang tải...</td></tr></tbody>
                    </table>
                </div>
                <div id="admin-pn-pagination" style="display: flex; justify-content: center; gap: 8px; margin-top: 15px;"></div>
            </div>

            <!-- TAB 2: HÓA ĐƠN BÁN HÀNG -->
            <div id="tab-admin-hoadon" class="tab-pane" style="display: none; padding: 0 20px 20px 20px;">
                <div style="display: flex; gap: 15px; margin-bottom: 15px; flex-wrap: wrap;">
                    <div style="position: relative; flex: 1; min-width: 200px;">
                        <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 12px; top: 12px; color: var(--text-muted);"></i>
                        <input type="text" class="form-control" style="padding-left: 35px;" placeholder="Tìm mã HĐ, thu ngân, tên món..." oninput="handleAdminHDSearch(this.value)">
                    </div>
                    <select class="form-control" style="width: 200px;" onchange="handleAdminHDCumSan(this.value)">
                        <option value="All">Tất cả Cơ sở</option>
                        ${adminCumSanOptions}
                    </select>
                    <input type="date" class="form-control" style="width: 150px;" onchange="handleAdminHDDate(this.value)">
                    <button class="btn-outline-sm" onclick="document.querySelectorAll('input[type=date]')[1].value=''; handleAdminHDDate('')">Xóa lọc ngày</button>
                    <button class="btn-primary" onclick="exportAdminHoaDonExcel()" style="background: #059669; border-color: #059669; padding: 8px 14px;"><i class="fa-solid fa-file-excel"></i> Xuất Excel</button>
                </div>
                
                <div class="table-responsive">
                    <table class="admin-table">
                        <thead style="background: #F8FAFC;">
                            <tr>
                                <th>Mã HĐ</th>
                                <th>Cơ sở</th>
                                <th>Thu ngân</th>
                                <th>Chi tiết món</th>
                                <th>Tổng doanh thu</th>
                                <th>Thời gian</th>
                            </tr>
                        </thead>
                        <tbody id="admin-hd-tbody"><tr><td colspan="6" class="text-center" style="text-align: center;">Đang tải...</td></tr></tbody>
                    </table>
                </div>
                <div id="admin-hd-pagination" style="display: flex; justify-content: center; gap: 8px; margin-top: 15px;"></div>
            </div>
        </div>
    `;

    loadAdminPhieuNhap();
    loadAdminHoaDon();
}

function switchAdminXuatNhapTab(tabId, element) {
    const tabs = element.parentElement.children;
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
        tabs[i].style.borderBottom = 'none';
        tabs[i].style.color = 'var(--text-muted)';
    }
    element.classList.add('active');
    element.style.borderBottom = '2px solid var(--primary)';
    element.style.color = 'var(--primary)';

    document.getElementById('tab-admin-phieunhap').style.display = 'none';
    document.getElementById('tab-admin-hoadon').style.display = 'none';
    document.getElementById(tabId).style.display = 'block';
}

// ----------------------------------------------------
// LOGIC TAB 1: PHIẾU NHẬP
// ----------------------------------------------------
async function loadAdminPhieuNhap() {
    try {
        const response = await fetch(`${API_BASE_URL}/phieu-nhap`); // Không truyền id_cum_san để lấy tất cả
        const res = await response.json();
        if (res.success) {
            adminPhieuNhapData = res.data || [];
            applyAdminPNFiltersAndRender();
        }
    } catch (e) { console.error(e); }
}

function handleAdminPNSearch(val) { adminPhieuNhapSearch = val.toLowerCase().trim(); adminPhieuNhapPage = 1; applyAdminPNFiltersAndRender(); }
function handleAdminPNCumSan(val) { adminPhieuNhapCumSan = val; adminPhieuNhapPage = 1; applyAdminPNFiltersAndRender(); }
function handleAdminPNDate(val) { adminPhieuNhapDate = val; adminPhieuNhapPage = 1; applyAdminPNFiltersAndRender(); }

function applyAdminPNFiltersAndRender() {
    let filtered = adminPhieuNhapData.filter(pn => {
        // Lọc Cụm sân
        const matchCumSan = (adminPhieuNhapCumSan === 'All' || String(pn.ID_CumSan) === String(adminPhieuNhapCumSan));
        
        // Lọc Ngày
        const dateOnly = pn.NgayNhap ? pn.NgayNhap.substring(0, 10) : '';
        const matchDate = (adminPhieuNhapDate === '' || dateOnly === adminPhieuNhapDate);
        
        // Lọc Tìm kiếm (Mã, Tên người nhập, Tên món)
        const maPhieu = `pn${pn.ID}`.toLowerCase();
        const tenNhanVien = pn.nhan_vien ? pn.nhan_vien.HoTen.toLowerCase() : '';
        const tenMonStr = pn.ChiTietNhap ? pn.ChiTietNhap.map(i => i.ten_san_pham).join(' ').toLowerCase() : '';
        const matchSearch = maPhieu.includes(adminPhieuNhapSearch) || tenNhanVien.includes(adminPhieuNhapSearch) || tenMonStr.includes(adminPhieuNhapSearch);

        return matchCumSan && matchDate && matchSearch;
    });

    const totalPages = Math.ceil(filtered.length / itemsPerAdminXNPage) || 1;
    if (adminPhieuNhapPage > totalPages) adminPhieuNhapPage = totalPages;
    const startIdx = (adminPhieuNhapPage - 1) * itemsPerAdminXNPage;
    
    renderAdminPNTable(filtered.slice(startIdx, startIdx + itemsPerAdminXNPage));
    renderAdminPNPagination(totalPages);
}

function renderAdminPNTable(data) {
    const tbody = document.getElementById('admin-pn-tbody');
    if (data.length === 0) return tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 30px; text-align: center;">Không tìm thấy phiếu nhập nào.</td></tr>`;

    tbody.innerHTML = data.map(pn => {
        const listItems = pn.ChiTietNhap ? pn.ChiTietNhap.map(item => `<li><i class="fa-solid fa-angle-right" style="font-size:0.7rem; color:#94a3b8; margin-right:4px;"></i> ${item.ten_san_pham}: <strong>${item.so_luong}</strong></li>`).join('') : '';
        const dateStr = pn.NgayNhap ? pn.NgayNhap.replace('T', ' ').substring(0, 16) : '';
        const tenCumSan = pn.cum_san ? pn.cum_san.TenCumSan : 'N/A';
        
        return `
            <tr>
                <td><strong style="font-family: monospace; color: #475569;">#PN${pn.ID}</strong></td>
                <td><span style="color: var(--primary); font-weight: 600;"><i class="fa-solid fa-location-dot"></i> ${tenCumSan}</span></td>
                <td>${pn.nhan_vien ? pn.nhan_vien.HoTen : 'N/A'}</td>
                <td><ul style="list-style: none; padding: 0; margin: 0; font-size: 0.85rem;">${listItems}</ul></td>
                <td><strong style="color: #b91c1c;">${Number(pn.TongTienThanhToan).toLocaleString('vi-VN')}đ</strong></td>
                <td><span style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> ${dateStr}</span></td>
            </tr>
        `;
    }).join('');
}

function renderAdminPNPagination(totalPages) {
    const div = document.getElementById('admin-pn-pagination');
    if (totalPages <= 1) return div.innerHTML = '';
    let html = `<button class="btn-outline-sm" ${adminPhieuNhapPage === 1 ? 'disabled style="opacity:0.5;"' : ''} onclick="adminPhieuNhapPage--; applyAdminPNFiltersAndRender()"><i class="fa-solid fa-chevron-left"></i></button>`;
    for(let i=1; i<=totalPages; i++) {
        html += `<button class="${i === adminPhieuNhapPage ? 'btn-primary' : 'btn-outline-sm'}" style="padding: 6px 14px;" onclick="adminPhieuNhapPage=${i}; applyAdminPNFiltersAndRender()">${i}</button>`;
    }
    html += `<button class="btn-outline-sm" ${adminPhieuNhapPage === totalPages ? 'disabled style="opacity:0.5;"' : ''} onclick="adminPhieuNhapPage++; applyAdminPNFiltersAndRender()"><i class="fa-solid fa-chevron-right"></i></button>`;
    div.innerHTML = html;
}

// ----------------------------------------------------
// LOGIC TAB 2: HÓA ĐƠN BÁN HÀNG
// ----------------------------------------------------
async function loadAdminHoaDon() {
    try {
        const response = await fetch(`${API_BASE_URL}/ban-hang`); // Lấy tất cả hoá đơn
        const res = await response.json();
        if (res.success) {
            adminHoaDonData = res.data || [];
            applyAdminHDFiltersAndRender();
        }
    } catch (e) { console.error(e); }
}

function handleAdminHDSearch(val) { adminHoaDonSearch = val.toLowerCase().trim(); adminHoaDonPage = 1; applyAdminHDFiltersAndRender(); }
function handleAdminHDCumSan(val) { adminHoaDonCumSan = val; adminHoaDonPage = 1; applyAdminHDFiltersAndRender(); }
function handleAdminHDDate(val) { adminHoaDonDate = val; adminHoaDonPage = 1; applyAdminHDFiltersAndRender(); }

function applyAdminHDFiltersAndRender() {
    let filtered = adminHoaDonData.filter(hd => {
        // Lọc Cụm sân
        const matchCumSan = (adminHoaDonCumSan === 'All' || String(hd.ID_CumSan) === String(adminHoaDonCumSan));
        
        // Lọc Ngày
        const dateOnly = hd.NgayTao ? hd.NgayTao.substring(0, 10) : '';
        const matchDate = (adminHoaDonDate === '' || dateOnly === adminHoaDonDate);
        
        // Lọc Tìm kiếm
        const maHD = `hd${hd.ID}`.toLowerCase();
        const thuNgan = hd.nhan_vien ? hd.nhan_vien.HoTen.toLowerCase() : '';
        const tenMonStr = (hd.chi_tiet_hoa_dons && hd.chi_tiet_hoa_dons.length > 0) 
            ? hd.chi_tiet_hoa_dons.map(i => i.san_pham ? i.san_pham.TenSanPham : '').join(' ').toLowerCase() : '';
        const matchSearch = maHD.includes(adminHoaDonSearch) || thuNgan.includes(adminHoaDonSearch) || tenMonStr.includes(adminHoaDonSearch);

        return matchCumSan && matchDate && matchSearch;
    });

    const totalPages = Math.ceil(filtered.length / itemsPerAdminXNPage) || 1;
    if (adminHoaDonPage > totalPages) adminHoaDonPage = totalPages;
    const startIdx = (adminHoaDonPage - 1) * itemsPerAdminXNPage;
    
    renderAdminHDTable(filtered.slice(startIdx, startIdx + itemsPerAdminXNPage));
    renderAdminHDPagination(totalPages);
}

function renderAdminHDTable(data) {
    const tbody = document.getElementById('admin-hd-tbody');
    if (data.length === 0) return tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 30px; text-align: center;">Không tìm thấy hóa đơn nào.</td></tr>`;

    tbody.innerHTML = data.map(hd => {
        let cacMon = hd.chi_tiet_hoa_dons && hd.chi_tiet_hoa_dons.length > 0 
            ? hd.chi_tiet_hoa_dons.map(ct => `<li><i class="fa-solid fa-angle-right" style="font-size:0.7rem; color:#94a3b8; margin-right:4px;"></i> ${ct.san_pham ? ct.san_pham.TenSanPham : 'Lỗi món'}: <strong>${ct.SoLuong}</strong></li>`).join('')
            : '<span class="text-muted">Trống</span>';

        const dateStr = hd.NgayTao ? hd.NgayTao.replace('T', ' ').substring(0, 16) : '';
        const tenCumSan = hd.cum_san ? hd.cum_san.TenCumSan : 'N/A';

        return `
            <tr>
                <td><strong style="font-family: monospace; color: #475569;">#HD${hd.ID}</strong></td>
                <td><span style="color: var(--primary); font-weight: 600;"><i class="fa-solid fa-location-dot"></i> ${tenCumSan}</span></td>
                <td><div style="font-weight: 600; color: #3b82f6;">${hd.nhan_vien ? hd.nhan_vien.HoTen : 'N/A'}</div></td>
                <td><ul style="list-style: none; padding: 0; margin: 0; font-size: 0.85rem;">${cacMon}</ul></td>
                <td><strong style="color: #10b981;">${Number(hd.TongTien).toLocaleString('vi-VN')}đ</strong></td>
                <td><span style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> ${dateStr}</span></td>
            </tr>
        `;
    }).join('');
}

function renderAdminHDPagination(totalPages) {
    const div = document.getElementById('admin-hd-pagination');
    if (totalPages <= 1) return div.innerHTML = '';
    let html = `<button class="btn-outline-sm" ${adminHoaDonPage === 1 ? 'disabled style="opacity:0.5;"' : ''} onclick="adminHoaDonPage--; applyAdminHDFiltersAndRender()"><i class="fa-solid fa-chevron-left"></i></button>`;
    for(let i=1; i<=totalPages; i++) {
        html += `<button class="${i === adminHoaDonPage ? 'btn-primary' : 'btn-outline-sm'}" style="padding: 6px 14px;" onclick="adminHoaDonPage=${i}; applyAdminHDFiltersAndRender()">${i}</button>`;
    }
    html += `<button class="btn-outline-sm" ${adminHoaDonPage === totalPages ? 'disabled style="opacity:0.5;"' : ''} onclick="adminHoaDonPage++; applyAdminHDFiltersAndRender()"><i class="fa-solid fa-chevron-right"></i></button>`;
    div.innerHTML = html;
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
                <button class="nav-tab" onclick="switchAdminCalTab('admin-cal-giaoca', this)" style="padding: 15px 10px; border: none; background: transparent; font-weight: 600; cursor: pointer; color: var(--text-muted);">Lịch Sử Giao Ca</button>
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

            <!-- LƯỚI 4: LỊCH SỬ GIAO CA -->
            <div id="admin-cal-giaoca" class="tab-pane" style="display: none; padding: 0 20px 20px 20px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                    <div style="display: flex; gap: 15px;">
                        <input type="date" id="admin-gc-date" class="form-control" style="width: 200px;" onchange="loadAdminLichSuGiaoCa()">
                        <button class="btn-outline-sm" onclick="loadAdminLichSuGiaoCa()"><i class="fa-solid fa-rotate-right"></i> Làm mới</button>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="admin-table">
                        <thead style="background: #F8FAFC;">
                            <tr>
                                <th>Nhân Viên & Ca</th>
                                <th>Tiền Nhận / Giao</th>
                                <th style="text-align: right;">Tiền HT / Độ Lệch</th>
                                <th>Nộp Doanh Thu</th>
                                <th>Trạng Thái</th>
                                <th style="text-align: center;">Hành động</th>
                            </tr>
                        </thead>
                        <tbody id="admin-gc-tbody">
                            <tr><td colspan="6" class="text-center">Đang tải dữ liệu...</td></tr>
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
    const giaoCaTab = document.getElementById('admin-cal-giaoca');
    if (giaoCaTab) giaoCaTab.style.display = 'none';

    document.getElementById(tabId).style.display = 'block';

    isForceUnlockedNextWeek = false;

    if (tabId === 'admin-cal-next') {
        loadAdminCalendarData(1, 'grid-next-week');
        loadStaffRegistrationStatus(); // Tải danh sách NV bên phải
    } else if (tabId === 'admin-cal-chamcong') {
        document.getElementById('admin-cc-date').value = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10);
        loadAdminChamCongData();
    } else if (tabId === 'admin-cal-giaoca') {
        document.getElementById('admin-gc-date').value = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10);
        loadAdminLichSuGiaoCa();
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
            fetch(`${API_BASE_URL}/ca-lam-viec`),
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
            container.innerHTML = `<div class="modal-alert error" style="display:block;">Vui lòng cài đặt Ca Mẫu (Ca Sáng/Tối) trước khi xếp lịch.</div>`;
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
                            <th style="width: 90px; min-width: 90px; text-align: center; vertical-align: middle; position: sticky; left: 0; z-index: 10; background: #F8FAFC; border-right: 2px solid #e2e8f0; box-shadow: 2px 0 5px rgba(0,0,0,0.05);">CA LÀM</th>
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
            html += `<tr><td style="text-align: center; font-weight: bold; background: #f8fafc; border-right: 2px solid #e2e8f0; position: sticky; left: 0; z-index: 5; box-shadow: 2px 0 5px rgba(0,0,0,0.05);">${ca.TenCa}</td>`;
            
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
                            ? `window.removePendingAssignment(${ca.ID}, '${date.dbDate}', ${s.ID_NhanVien}, ${isTuChoiTuanSau})` 
                            : `window.executeRemoveApprovedShift(${s.ID_CaLamViec}, '${s.NgayLam}', ${s.ID_NhanVien}, ${weekOffset})`;
                            
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
                    clickEvent = `onmouseover="this.style.filter='brightness(0.95)'" onmouseout="this.style.filter='brightness(1)'" onclick="openManagerShiftModal(${ca.ID}, '${ca.TenCa}', '${date.dbDate}', '${date.display}', '${cacheKey}', 1)"`;
                } else if (weekOffset === 0 && isEditModeCurrentWeek) {
                    if (!isPastDate) {
                        // Chỉ cho phép click & hiện viền nét đứt cam với ca TRONG NGÀY hoặc CHƯA ĐẾN NGÀY
                        pointerStyle = 'cursor: pointer; outline: 2px dashed #f59e0b; outline-offset: -2px; transition: 0.2s;';
                        clickEvent = `onmouseover="this.style.filter='brightness(0.95)'" onmouseout="this.style.filter='brightness(1)'" onclick="openManagerShiftModal(${ca.ID}, '${ca.TenCa}', '${date.dbDate}', '${date.display}', '${cacheKey}', 0)"`;
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
                        <button type="button" onclick="grantEmergencyScheduleAccess(${staff.ID}, '${staff.HoTen.replace(/'/g, "\\'")}')" title="Cho phép nhân viên này đăng ký / sửa lịch khẩn cấp 1 lần trong hôm nay (Chủ Nhật)" style="padding: 3px 8px; font-size: 0.72rem; border-radius: 6px; border: 1px solid #bfdbfe; background: #eff6ff; color: #2563eb; font-weight: 600; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">
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
// LOGIC: CẤU HÌNH CA LÀM VIỆC (MẪU)
// ======================================================

function showCauHinhCaAlert(msg, isSuccess) {
    const alert = document.getElementById('cauhinh-ca-alert');
    alert.textContent = msg;
    alert.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alert.style.display = 'block';
    setTimeout(() => alert.style.display = 'none', 3000);
}

// Khi Quản lý bấm nút "Cấu hình Ca làm việc"
async function openCauHinhCaModal() {
    // 1. Dựng 1 Modal trung gian nhỏ nhắn để hỏi muốn cấu hình ca nào
    let selectModal = document.getElementById('select-ca-modal');
    if (!selectModal) {
        selectModal = document.createElement('div');
        selectModal.id = 'select-ca-modal';
        selectModal.className = 'modal-overlay';
        selectModal.style.cssText = 'display: none; z-index: 10000;';
        selectModal.innerHTML = `
            <div class="modal-content" style="max-width: 350px; text-align: center; padding: 30px 20px;">
                <h3 style="margin-bottom: 10px; font-size: 1.2rem; color: var(--text-dark);"><i class="fa-solid fa-layer-group"></i> Chọn ca để cấu hình</h3>
                <p style="color: var(--text-muted); margin-bottom: 25px; font-size: 0.9rem;">Hệ thống chia làm 2 ca mặc định (giao ca lúc 15:00)</p>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <button class="btn-outline" style="width: 100%; border-color: #3b82f6; color: #1d4ed8; padding: 12px;" onclick="loadAndShowCauHinhForm('Ca Sáng')"><i class="fa-regular fa-sun" style="margin-right: 8px;"></i> Cấu hình Ca Sáng</button>
                    <button class="btn-outline" style="width: 100%; border-color: #6366f1; color: #4338ca; padding: 12px;" onclick="loadAndShowCauHinhForm('Ca Tối')"><i class="fa-solid fa-moon" style="margin-right: 8px;"></i> Cấu hình Ca Tối</button>
                    <button type="button" onclick="document.getElementById('select-ca-modal').style.display='none'" style="width: 100%; margin-top: 12px; padding: 10px 16px; background-color: #fee2e2; color: #ef4444; border: 1px solid #fecaca; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s ease;">Hủy</button>
                </div>
            </div>`;
        document.body.appendChild(selectModal);
    }
    selectModal.style.display = 'flex';
}

// Mở form nhập thông tin sau khi chọn Ca Sáng/Tối
async function loadAndShowCauHinhForm(tenCa) {
    document.getElementById('select-ca-modal').style.display = 'none';
    document.getElementById('cauhinh-ca-alert').style.display = 'none';
    
    // Gán tên ca lên form
    document.getElementById('cc-tenca').value = tenCa;
    document.getElementById('cc-tenca-display').value = tenCa;
    
    // Nút lưu ở trạng thái chờ
    const btn = document.getElementById('btn-save-cauhinh-ca');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu cũ...';
    btn.disabled = true;
    
    document.getElementById('cauhinh-ca-modal').style.display = 'flex';

    try {
        // Tải dữ liệu cũ nếu đã từng cài đặt
        const response = await fetch(`${API_BASE_URL}/ca-lam-viec`);
        const res = await response.json();
        
        if (res.success) {
            const dataCu = res.data.find(c => c.TenCa === tenCa);
            if (dataCu) {
                document.getElementById('cc-soluong').value = dataCu.SoLuongNhanVien;
                document.getElementById('cc-luong-tn').value = dataCu.LuongThuNgan;
                document.getElementById('cc-luong-pv').value = dataCu.LuongPhucVu;
            } else {
                document.getElementById('cc-soluong').value = '';
                document.getElementById('cc-luong-tn').value = '';
                document.getElementById('cc-luong-pv').value = '';
            }
        }
    } catch(e) {
        showCauHinhCaAlert('Không thể tải dữ liệu cũ', false);
    } finally {
        btn.innerHTML = 'Lưu cấu hình';
        btn.disabled = false;
    }
}

function closeCauHinhCaModal() {
    document.getElementById('cauhinh-ca-modal').style.display = 'none';
}

async function submitCauHinhCa() {
    const tenCa = document.getElementById('cc-tenca').value;
    const soLuong = document.getElementById('cc-soluong').value;
    const luongTN = document.getElementById('cc-luong-tn').value;
    const luongPV = document.getElementById('cc-luong-pv').value;

    if (!soLuong || !luongTN || !luongPV) {
        return showCauHinhCaAlert('Vui lòng điền đầy đủ số lượng và mức lương!', false);
    }

    if (Number(soLuong) <= 0) {
        return showCauHinhCaAlert('Số lượng nhân viên tối đa phải lớn hơn 0!', false);
    }
    
    if (Number(luongTN) <= 0 || Number(luongPV) <= 0) {
        return showCauHinhCaAlert('Mức lương không được là số âm hoặc bằng 0!', false);
    }

    const btn = document.getElementById('btn-save-cauhinh-ca');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/ca-lam-viec`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                TenCa: tenCa,
                SoLuongNhanVien: soLuong,
                LuongThuNgan: luongTN,
                LuongPhucVu: luongPV
            })
        });

        const data = await response.json();
        if (response.ok && data.success) {
            showCauHinhCaAlert(data.message, true);
            setTimeout(() => {
                closeCauHinhCaModal();
                // NẾU ĐANG Ở TAB LỊCH, RENDER LẠI ĐỂ MẤT CẢNH BÁO "Vui lòng cài đặt..."
                const activeTab = document.querySelector('.nav-tab.active').innerText;
                if (activeTab === 'Tuần Hiện Tại') loadAdminCalendarData(0, 'grid-current-week');
                else loadAdminCalendarData(1, 'grid-next-week');
            }, 1500);
        } else {
            showCauHinhCaAlert(data.message || 'Lỗi khi lưu.', false);
        }
    } catch (e) {
        showCauHinhCaAlert('Mất kết nối máy chủ.', false);
    } finally {
        btn.innerHTML = 'Lưu cấu hình';
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
        
        // Nút tắt: Chốt Vắng mặt liền cho lẹ
        if (item.TrangThaiDiemDanh === 'ChuaLam' && isPastStart) {
            actionBtn = `<button class="btn-primary" style="background: #ef4444; border-color: #ef4444; padding: 6px 12px; font-size: 0.85rem; margin-right: 5px;" onclick='quickChotVangMat(${item.ID})'>Chốt Vắng</button>`;
        }
        
        // Nút mở Modal để tuỳ chỉnh Đi/Nghỉ, Phạt, Thưởng
        actionBtn += `<button class="btn-outline-sm" onclick='openModalChotCong(${itemJsonStr})'><i class="fa-solid fa-pen"></i> Chốt / Sửa công</button>`;

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

// Gọi API nhanh để chốt Vắng mặt
window.quickChotVangMat = async function(id) {
    showSystemModal("Đang chốt...", "Hệ thống đang lưu dữ liệu.", "success");
    try {
        const response = await fetch(`${API_BASE_URL}/lich-lam-viec/${id}/chot-cong`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` },
            body: JSON.stringify({
                trang_thai_diem_danh: 'VangMat',
                ly_do_dieu_chinh: 'Quản lý chốt vắng mặt do không nhận ca.',
                tien_phat: 0 
            })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            document.getElementById('system-alert-modal').style.display='none';
            const itemIndex = currentChamCongData.findIndex(item => String(item.ID) === String(id));
            if (itemIndex > -1) {
                currentChamCongData[itemIndex].TrangThaiDiemDanh = 'VangMat';
                currentChamCongData[itemIndex].LyDoDieuChinh = 'Quản lý chốt vắng mặt do không nhận ca.';
                renderAdminChamCongTable();
            } else {
                loadAdminChamCongData();
            }
        } else {
            showSystemModal("Lỗi", data.message, "error");
        }
    } catch(e) {
        showSystemModal("Lỗi", "Lỗi kết nối", "error");
    }
}

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
                <div class="modal-footer">
                    <button class="btn-outline-sm" onclick="document.getElementById('modal-chot-cong').style.display='none'">Hủy</button>
                    <button id="btn-save-cc" class="btn-primary" onclick="executeChotCong(event)">Lưu công</button>
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

            if (typeof loadBangLuongAdminData === 'function' && document.getElementById('admin-bang-luong-tbody')) {
                loadBangLuongAdminData();
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

// ======================================================
// MODULE: ADMIN - XEM LỊCH SỬ BÀN GIAO CA
// ======================================================
async function loadAdminLichSuGiaoCa() {
    const dateInput = document.getElementById('admin-gc-date').value;
    const tbody = document.getElementById('admin-gc-tbody');
    
    if (!dateInput) return;
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:30px; text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu...</td></tr>`;
    
    try {
        // Chúng ta tận dụng lại API lấy danh sách giao ca đã viết ở Backend
        const response = await fetch(`${API_BASE_URL}/ban-giao-ca?ngay=${dateInput}`, {
            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` }
        });
        const res = await response.json();
        
        if (res.success) {
            renderAdminLichSuGiaoCa(res.data);
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Lỗi kết nối máy chủ!</td></tr>`;
    }
}

function renderAdminLichSuGiaoCa(data) {
    const tbody = document.getElementById('admin-gc-tbody');
    
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 40px; text-align: center;">Ngày này chưa có bản ghi bàn giao ca.</td></tr>`;
        return;
    }

    let html = '';
    data.forEach(item => {
        // Trạng thái phiếu
        let badgeColor = '#64748b', badgeBg = '#f1f5f9', viStatus = 'Chưa xác định';
        if (item.TrangThai === 'DangTrongCa') { badgeColor = '#047857'; badgeBg = '#d1fae5'; viStatus = 'Đang trong ca'; }
        else if (item.TrangThai === 'DaChotCa') { badgeColor = '#1d4ed8'; badgeBg = '#dbeafe'; viStatus = 'Đã chốt sổ'; }
        else if (item.TrangThai === 'ChotCuongChe') { badgeColor = '#b91c1c'; badgeBg = '#fee2e2'; viStatus = 'Chốt cưỡng chế'; }
        
        const badgeHtml = `<span style="padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: bold; background: ${badgeBg}; color: ${badgeColor}; white-space: nowrap; display: inline-block; text-align: center;">${viStatus}</span>`;

        // Tính toán độ lệch
        let lechHtml = '';
        if (item.TrangThai === 'DaChotCa') {
            const tongThucTe = Number(item.TienGiao) + Number(item.TienNopDoanhThu);
            const lech = Number(item.TienHeThong) - tongThucTe;
            
            if (lech > 0) {
                lechHtml = `<div style="font-size: 0.85rem; color: #ef4444; font-weight: bold;" title="Két thực tế đang THIẾU tiền"><i class="fa-solid fa-arrow-trend-down"></i> Hụt ${lech.toLocaleString('vi-VN')}đ</div>`;
            } else if (lech < 0) {
                lechHtml = `<div style="font-size: 0.85rem; color: #10b981; font-weight: bold;" title="Két thực tế đang DƯ tiền"><i class="fa-solid fa-arrow-trend-up"></i> Dư ${Math.abs(lech).toLocaleString('vi-VN')}đ</div>`;
            } else {
                lechHtml = `<div style="font-size: 0.85rem; color: #64748b;"><i class="fa-solid fa-check"></i> Khớp số dư</div>`;
            }
        }

        // Tên nhân viên và thời gian
        const tNhan = item.ThoiGianNhan ? item.ThoiGianNhan.substring(11, 16) : '--:--';
        const tGiao = item.ThoiGianGiao ? item.ThoiGianGiao.substring(11, 16) : '--:--';
        const nameDisplay = `<div style="font-weight: 600; color: var(--primary);">ID Nhân viên: ${item.ID_NhanVienNhan}</div>`;

        // Ghi chú
        const noteStr = item.GhiChuGiao ? `<div style="font-size: 0.8rem; color: var(--text-muted); font-style: italic; margin-top: 4px;"><i class="fa-regular fa-comment"></i> ${item.GhiChuGiao}</div>` : '';

        let actionBtn = `<button class="btn-outline-sm" onclick="adminOpenPhieuChiModal(${item.ID})"><i class="fa-solid fa-list-ul"></i> Lịch sử Thu/Chi</button>`;
        
        if (item.TrangThai === 'DangTrongCa') {
            actionBtn += `<br><button class="btn-primary" style="margin-top: 5px; width: 100%; background: #ef4444; border-color: #ef4444; padding: 4px 8px; font-size: 0.8rem;" onclick="executeAdminChotCuongChe(${item.ID})"><i class="fa-solid fa-lock"></i> Chốt Cưỡng Chế</button>`;
        }

        html += `
            <tr>
                <td>
                    ${nameDisplay}
                    <div style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> Nhận: ${tNhan} - Giao: ${tGiao}</div>
                    ${noteStr}
                </td>
                <td>
                    <div>Nhận: <strong>${Number(item.TienNhan).toLocaleString('vi-VN')}đ</strong></div>
                    <div style="color: #b45309; margin-top: 4px;">Giao: <strong>${item.TienGiao !== null ? Number(item.TienGiao).toLocaleString('vi-VN') + 'đ' : '--'}</strong></div>
                </td>
                <td style="text-align: right;">
                    <div style="font-size: 1.05rem; font-weight: bold; color: #2563eb;">${Number(item.TienHeThong).toLocaleString('vi-VN')}đ</div>
                    ${lechHtml}
                </td>
                <td>
                    <div style="font-size: 1.05rem; font-weight: bold; color: #10b981;">${item.TienNopDoanhThu !== null ? '+' + Number(item.TienNopDoanhThu).toLocaleString('vi-VN') + 'đ' : '--'}</div>
                </td>
                <td>${badgeHtml}</td>
                <td style="text-align: center;">${actionBtn}</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

window.adminOpenPhieuChiModal = async function(bgcId) {
    const listContainer = document.getElementById('admin-ds-phieu-chi-list');
    listContainer.innerHTML = '<div style="text-align: center; padding: 30px;"><i class="fa-solid fa-spinner fa-spin text-primary" style="font-size: 1.5rem;"></i><br><br>Đang tải dữ liệu...</div>';
    document.getElementById('admin-ds-phieu-chi-modal').style.display = 'flex';

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
                const isThu = Number(p.SoTien) < 0; 
                const color = isThu ? '#10b981' : '#ef4444';
                const sign = isThu ? '+' : '-';
                const val = Math.abs(Number(p.SoTien));
                const badge = isThu 
                    ? `<span style="background: #d1fae5; color: #047857; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold;">THU</span>`
                    : `<span style="background: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold;">CHI</span>`;
                
                const timeStr = p.ThoiGian ? p.ThoiGian.substring(11, 16) : ''; 

                html += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px dashed #e2e8f0;">
                        <div>
                            <div style="font-weight: 600; color: var(--text-dark); font-size: 0.95rem; margin-bottom: 4px;">${badge} ${p.NoiDung}</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> Lúc ${timeStr}</div>
                        </div>
                        <div style="font-weight: bold; font-size: 1.05rem; color: ${color};">${sign}${val.toLocaleString('vi-VN')}đ</div>
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

window.executeAdminChotCuongChe = function(bgcId) {
    // 1. Tạo Modal động nếu chưa có
    let modal = document.getElementById('chot-cuong-che-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'chot-cuong-che-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10000;';
        document.body.appendChild(modal);
    }

    // 2. Nạp nội dung HTML cho Modal
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; text-align: center; padding: 30px 20px;">
            <div style="font-size: 3.5rem; color: #ef4444; margin-bottom: 15px;"><i class="fa-solid fa-triangle-exclamation"></i></div>
            <h3 style="margin-bottom: 10px; font-size: 1.4rem;">Chốt cưỡng chế?</h3>
            <p style="color: var(--text-muted); margin-bottom: 25px; line-height: 1.5;">Bạn có chắc chắn muốn CHỐT CƯỠNG CHẾ ca làm việc này? (Hệ thống sẽ tự ép số liệu thực tế khớp với hệ thống)</p>
            <div style="display: flex; justify-content: center; gap: 12px;">
                <button class="btn-outline" style="width: auto; padding: 10px 24px;" onclick="document.getElementById('chot-cuong-che-modal').style.display='none'">Hủy bỏ</button>
                <button class="btn-primary" style="width: auto; padding: 10px 24px; background-color: #ef4444; border-color: #ef4444;" id="btn-confirm-cuong-che">Đồng ý chốt</button>
            </div>
        </div>
    `;
    
    // Hiển thị Modal
    modal.style.display = 'flex';

    // 3. Xử lý logic gọi API khi bấm "Đồng ý"
    document.getElementById('btn-confirm-cuong-che').onclick = async function() {
        const btn = this;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
        btn.disabled = true;

        try {
            const response = await fetch(`${API_BASE_URL}/admin/ban-giao-ca/${bgcId}/chot-cuong-che`, {
                method: 'PUT',
                headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}` }
            });
            const data = await response.json();
            
            if (response.ok && data.success) {
                modal.style.display = 'none';
                showSystemModal("Thành công", data.message, "success");
                loadAdminLichSuGiaoCa(); // Tải lại bảng
            } else {
                modal.style.display = 'none';
                showSystemModal("Lỗi", data.message, "error");
            }
        } catch (e) {
            modal.style.display = 'none';
            showSystemModal("Lỗi mạng", "Vui lòng thử lại", "error");
        }
    };
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
// MODULE: QUẢN LÝ & THEO DÕI BẢNG LƯƠNG (QUẢN LÝ SÂN & ADMIN)
// ======================================================
let allAdminBangLuongData = [];
let currentBLPage = 1;
const itemsPerBLPage = 5;
let currentBLSearch = '';
let currentBLCumSanFilter = 'All';
let currentBLStatusFilter = 'All';
let currentBLThangNam = '';
let blCumSanOptionsCache = '';

async function renderQuanLyBangLuongAdmin() {
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    const isAdmin = currentUser && currentUser.VaiTro === 'Admin';

    currentBLPage = 1;
    currentBLSearch = '';
    currentBLCumSanFilter = 'All';
    currentBLStatusFilter = 'All';

    // Active menu
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = document.getElementById('menu-bangluong-admin');
    if (menuLink) menuLink.classList.add('active');

    // Khởi tạo danh sách Tháng/Năm (từ năm hiện tại về 2024)
    const today = new Date();
    const curMonth = String(today.getMonth() + 1).padStart(2, '0');
    const curYear = today.getFullYear();
    if (!currentBLThangNam) {
        currentBLThangNam = `${curMonth}-${curYear}`;
    }

    let thangOptions = '';
    for (let y = curYear; y >= 2024; y--) {
        for (let m = 12; m >= 1; m--) {
            if (y === curYear && m > (today.getMonth() + 1)) continue;
            const mm = String(m).padStart(2, '0');
            const val = `${mm}-${y}`;
            const selected = (val === currentBLThangNam) ? 'selected' : '';
            thangOptions += `<option value="${val}" ${selected}>Tháng ${mm}/${y}</option>`;
        }
    }

    // Nếu là Admin -> Tải danh sách Cụm sân cho bộ lọc
    if (isAdmin && !blCumSanOptionsCache) {
        try {
            const csRes = await fetch(`${API_BASE_URL}/cum-san`);
            const csData = await csRes.json();
            if (csData.success) {
                blCumSanOptionsCache = csData.data.map(cs => `<option value="${cs.ID}">${cs.TenCumSan}</option>`).join('');
            }
        } catch (e) { console.error(e); }
    }

    const pageTitle = isAdmin ? 'Theo dõi Bảng Lương Toàn Hệ Thống' : 'Quản lý & Chốt Bảng Lương';
    const pageDesc = isAdmin 
        ? 'Giám sát bảng công, thưởng/phạt và trạng thái thanh toán lương nhân viên tại tất cả các cụm sân.' 
        : 'Kiểm tra bảng công, chốt lương hàng tháng và xác nhận chuyển khoản cho nhân viên thuộc cơ sở của bạn.';

    const filterCumSanHtml = isAdmin ? `
        <div style="min-width: 200px;">
            <select id="bl-cumsan-filter" class="form-control" style="height: 42px; width: 100%; border-radius: 8px; border: 1px solid #cbd5e1; padding: 0 12px; font-size: 0.9rem; color: #334155; background-color: #fff; cursor: pointer;" onchange="handleBLCumSanFilter(this.value)">
                <option value="All">Tất cả Cơ sở</option>
                ${blCumSanOptionsCache}
            </select>
        </div>
    ` : '';

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="margin-bottom: 24px;">
            <h1 class="page-title">${pageTitle}</h1>
            <p class="text-muted">${pageDesc}</p>
        </div>

        <!-- Thẻ thống kê nhanh kỳ lương đang xem -->
        <div class="stat-grid" style="margin-bottom: 24px;">
            <div class="stat-card" style="border-left: 4px solid #3b82f6;">
                <div class="stat-title">Tổng nhân sự</div>
                <div id="bl-stat-tong-nv" class="stat-value" style="color: #1e293b;">0</div>
            </div>
            <div class="stat-card" style="border-left: 4px solid #2563eb;">
                <div class="stat-title">Tổng quỹ lương thực lãnh</div>
                <div id="bl-stat-tong-tien" class="stat-value" style="color: #2563eb;">0đ</div>
            </div>
            <div class="stat-card" style="border-left: 4px solid #f59e0b;">
                <div class="stat-title">Chờ xác nhận / Khiếu nại</div>
                <div id="bl-stat-cho-xuly" class="stat-value" style="color: #d97706;">0</div>
            </div>
            <div class="stat-card" style="border-left: 4px solid #10b981;">
                <div class="stat-title">Đã thanh toán</div>
                <div id="bl-stat-da-tt" class="stat-value" style="color: #047857;">0</div>
            </div>
        </div>

        <div class="panel">
            <!-- Thanh công cụ chuẩn hóa chiều cao 42px, căn lề trái/phải gọn đẹp -->
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 20px; padding: 14px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; flex-wrap: wrap;">
                
                <!-- Nhóm bên trái: Tìm kiếm & Các bộ lọc -->
                <div style="display: flex; align-items: center; gap: 12px; flex: 1; flex-wrap: wrap; min-width: 280px;">
                    <div style="position: relative; flex: 1; min-width: 230px;">
                        <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #64748b; font-size: 0.9rem; pointer-events: none;"></i>
                        <input type="text" id="bl-search-input" class="form-control" style="height: 42px; width: 100%; padding: 0 14px 0 38px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 0.9rem; background-color: #fff;" placeholder="Tìm tên nhân viên, SĐT..." oninput="handleBLSearch(this.value)">
                    </div>

                    ${filterCumSanHtml}

                    <div style="min-width: 185px;">
                        <select id="bl-status-filter" class="form-control" style="height: 42px; width: 100%; border-radius: 8px; border: 1px solid #cbd5e1; padding: 0 12px; font-size: 0.9rem; color: #334155; background-color: #fff; cursor: pointer;" onchange="handleBLStatusFilter(this.value)">
                            <option value="All">Tất cả trạng thái</option>
                            <option value="ChuaChot">Chưa chốt (Tạm tính)</option>
                            <option value="ChoXacNhan">Chờ NV xác nhận</option>
                            <option value="KhieuNai">Đang khiếu nại</option>
                            <option value="ChoThanhToan">Chờ chuyển khoản</option>
                            <option value="DaThanhToan">Đã thanh toán</option>
                        </select>
                    </div>

                    <div style="min-width: 155px;">
                        <select id="admin-bl-thangnam" class="form-control" style="height: 42px; width: 100%; border-radius: 8px; border: 1.5px solid var(--primary); padding: 0 12px; font-size: 0.9rem; font-weight: 700; color: var(--primary); background-color: #f0fdf4; cursor: pointer;" onchange="handleBLThangNamChange(this.value)">
                            ${thangOptions}
                        </select>
                    </div>
                </div>

                <!-- Nhóm bên phải: Nút Làm mới & Xuất Excel -->
                <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                    <button type="button" class="btn-outline-sm" onclick="loadBangLuongAdminData()" title="Làm mới dữ liệu" style="height: 42px; padding: 0 14px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #475569; font-weight: 600; font-size: 0.88rem; display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; transition: all 0.2s ease;" onmouseover="this.style.background='#f1f5f9'; this.style.borderColor='#94a3b8'; this.style.color='#0f172a';" onmouseout="this.style.background='#fff'; this.style.borderColor='#cbd5e1'; this.style.color='#475569';">
                        <i class="fa-solid fa-rotate-right"></i> Làm mới
                    </button>

                    <button type="button" class="btn-primary" onclick="exportBangLuongExcel()" style="height: 42px; padding: 0 18px; border-radius: 8px; background: #059669; border: 1px solid #059669; color: #fff; font-weight: 600; font-size: 0.9rem; display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap; cursor: pointer; box-shadow: 0 2px 4px rgba(5, 150, 105, 0.2); transition: all 0.2s ease;" onmouseover="this.style.background='#047857'; this.style.borderColor='#047857'; this.style.transform='translateY(-1px)';" onmouseout="this.style.background='#059669'; this.style.borderColor='#059669'; this.style.transform='translateY(0)';">
                        <i class="fa-solid fa-file-excel" style="font-size: 1rem;"></i> Xuất Excel
                    </button>
                </div>
            </div>

            <!-- Bảng dữ liệu -->
            <div class="table-responsive" style="min-height: 340px;">
                <table class="admin-table">
                    <thead style="background: #F8FAFC;">
                        <tr>
                            <th>Nhân Viên</th>
                            ${isAdmin ? '<th>Cơ Sở</th>' : ''}
                            <th style="text-align: center;">Số Ca Làm</th>
                            <th style="text-align: right;">Lương CB</th>
                            <th style="text-align: right;">Thưởng / Phạt</th>
                            <th style="text-align: right;">Thực Lãnh</th>
                            <th>Thông Tin Nhận Lương</th>
                            <th style="text-align: center;">Trạng Thái</th>
                            <th style="text-align: center;">Hành Động</th>
                        </tr>
                    </thead>
                    <tbody id="admin-bang-luong-tbody">
                        <tr><td colspan="${isAdmin ? 9 : 8}" class="text-center" style="padding: 40px; text-align: center;"><i class="fa-solid fa-spinner fa-spin text-primary"></i> Đang tải dữ liệu bảng lương...</td></tr>
                    </tbody>
                </table>
            </div>

            <!-- Phân trang -->
            <div id="admin-bl-pagination" style="display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 15px; margin-bottom: 15px; padding-top: 15px; border-top: 1px solid var(--border);"></div>
        </div>
    `;

    loadBangLuongAdminData();
}

function handleBLSearch(val) {
    currentBLSearch = val.toLowerCase().trim();
    currentBLPage = 1;
    applyBLFiltersAndRender();
}

function handleBLCumSanFilter(val) {
    currentBLCumSanFilter = val;
    currentBLPage = 1;
    applyBLFiltersAndRender();
}

function handleBLStatusFilter(val) {
    currentBLStatusFilter = val;
    currentBLPage = 1;
    applyBLFiltersAndRender();
}

function handleBLThangNamChange(val) {
    currentBLThangNam = val;
    currentBLPage = 1;
    loadBangLuongAdminData();
}

async function loadBangLuongAdminData() {
    const tbody = document.getElementById('admin-bang-luong-tbody');
    if (!tbody) return;

    const selectEl = document.getElementById('admin-bl-thangnam');
    const thangNam = selectEl ? selectEl.value : currentBLThangNam;
    currentBLThangNam = thangNam;

    try {
        const response = await fetch(`${API_BASE_URL}/admin/bang-luong?thang_nam=${thangNam}`);
        const res = await response.json();

        if (res.success) {
            allAdminBangLuongData = res.data || [];
            applyBLFiltersAndRender();
        } else {
            showSystemModal('Lỗi', res.message || 'Không tải được bảng lương', 'error');
        }
    } catch (e) {
        console.error('Lỗi tải bảng lương:', e);
    }
}

function applyBLFiltersAndRender() {
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user'));
    const isAdmin = currentUser && currentUser.VaiTro === 'Admin';
    const colSpan = isAdmin ? 9 : 8;

    // 1. Lọc theo Cụm sân, Trạng thái và Từ khóa (Tên / SĐT)
    const filtered = allAdminBangLuongData.filter(item => {
        const matchCumSan = (currentBLCumSanFilter === 'All') || (String(item.id_cum_san) === String(currentBLCumSanFilter));
        const matchStatus = (currentBLStatusFilter === 'All') || (item.trang_thai === currentBLStatusFilter);

        const tenNV = (item.ten_nhan_vien || '').toLowerCase();
        const sdtNV = (item.so_dien_thoai || '').toLowerCase();
        const tenCS = (item.ten_cum_san || '').toLowerCase();
        const matchSearch = !currentBLSearch || tenNV.includes(currentBLSearch) || sdtNV.includes(currentBLSearch) || tenCS.includes(currentBLSearch);

        return matchCumSan && matchStatus && matchSearch;
    });

    // 2. Cập nhật 4 thẻ thống kê nhanh theo danh sách đang lọc
    const tongNV = filtered.length;
    const tongQuyLuong = filtered.reduce((sum, i) => sum + Number(i.thuc_lanh || 0), 0);
    const choXuLy = filtered.filter(i => i.trang_thai === 'ChoXacNhan' || i.trang_thai === 'KhieuNai' || i.trang_thai === 'ChoThanhToan').length;
    const daThanhToan = filtered.filter(i => i.trang_thai === 'DaThanhToan').length;

    const elTongNV = document.getElementById('bl-stat-tong-nv');
    const elTongTien = document.getElementById('bl-stat-tong-tien');
    const elChoXuLy = document.getElementById('bl-stat-cho-xuly');
    const elDaTT = document.getElementById('bl-stat-da-tt');

    if (elTongNV) elTongNV.innerHTML = `${tongNV} <span style="font-size: 0.95rem; font-weight: 500; color: #64748b;">nhân viên</span>`;
    if (elTongTien) elTongTien.innerText = `${tongQuyLuong.toLocaleString('vi-VN')}đ`;
    if (elChoXuLy) elChoXuLy.innerHTML = `${choXuLy} <span style="font-size: 0.95rem; font-weight: 500; color: #64748b;">bảng lương</span>`;
    if (elDaTT) elDaTT.innerHTML = `${daThanhToan}/${tongNV} <span style="font-size: 0.95rem; font-weight: 500; color: #64748b;">hoàn tất</span>`;

    // 3. Phân trang
    const totalPages = Math.ceil(filtered.length / itemsPerBLPage) || 1;
    if (currentBLPage > totalPages) currentBLPage = totalPages;
    const startIdx = (currentBLPage - 1) * itemsPerBLPage;
    const pageData = filtered.slice(startIdx, startIdx + itemsPerBLPage);

    const tbody = document.getElementById('admin-bang-luong-tbody');
    if (!tbody) return;

    if (pageData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colSpan}" class="text-center text-muted" style="padding: 40px; text-align: center;">Không tìm thấy dữ liệu bảng lương phù hợp.</td></tr>`;
        document.getElementById('admin-bl-pagination').innerHTML = '';
        return;
    }

    tbody.innerHTML = pageData.map(item => {
        // Thưởng / Phạt
        const thuong = Number(item.tong_thuong || 0);
        const phat = Number(item.tong_phat || 0);
        let thuongPhatHtml = `<span style="color: #10b981; font-weight: 600;">+${thuong.toLocaleString('vi-VN')}đ</span><br><span style="color: #ef4444; font-weight: 600;">-${phat.toLocaleString('vi-VN')}đ</span>`;

        // Thông tin ngân hàng hoặc khiếu nại
        let bankHtml = `<span style="color: #94a3b8; font-size: 0.82rem; font-style: italic;">Chưa cung cấp</span>`;
        if (item.thong_tin_ngan_hang) {
            bankHtml = `<div style="font-size: 0.85rem; font-weight: 600; color: #0f172a; max-width: 210px; line-height: 1.4;">${item.thong_tin_ngan_hang}</div>`;
        }
        if (item.trang_thai === 'KhieuNai' && item.ly_do_khieu_nai) {
            bankHtml += `<div style="margin-top: 4px; font-size: 0.78rem; color: #b91c1c; background: #fef2f2; padding: 3px 6px; border-radius: 4px; border: 1px dashed #fca5a5;">Khiếu nại: "${item.ly_do_khieu_nai}"</div>`;
        }

        // Badge Trạng thái
        let badgeHtml = '';
        if (item.trang_thai === 'ChuaChot') {
            badgeHtml = `<span style="background: #f1f5f9; color: #475569; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; white-space: nowrap;">Chưa chốt (Tạm tính)</span>`;
        } else if (item.trang_thai === 'ChoXacNhan') {
            badgeHtml = `<span style="background: #fef3c7; color: #b45309; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; white-space: nowrap;"><i class="fa-regular fa-clock"></i> Chờ NV xác nhận</span>`;
        } else if (item.trang_thai === 'KhieuNai') {
            badgeHtml = `<span style="background: #fee2e2; color: #b91c1c; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; white-space: nowrap;"><i class="fa-solid fa-triangle-exclamation"></i> Bị khiếu nại</span>`;
        } else if (item.trang_thai === 'ChoThanhToan') {
            badgeHtml = `<span style="background: #e0e7ff; color: #4338ca; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; white-space: nowrap;"><i class="fa-solid fa-money-check-dollar"></i> Chờ chuyển khoản</span>`;
        } else if (item.trang_thai === 'DaThanhToan') {
            badgeHtml = `<span style="background: #d1fae5; color: #047857; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; white-space: nowrap;"><i class="fa-solid fa-check-double"></i> Đã thanh toán</span>`;
        }

        // Cột Hành động:
        // - Nút Xem bảng công luôn hiển thị cho cả Admin và Quản lý sân
        const safeTenNV = (item.ten_nhan_vien || '').replace(/'/g, "\\'");
        const safeLyDo = (item.ly_do_khieu_nai || '').replace(/'/g, "\\'").replace(/\n/g, ' ');
        let actionHtml = `
            <button class="btn-outline-sm" style="padding: 5px 10px; font-size: 0.82rem; border-color: #cbd5e1; color: #334155;" onclick="openLuoiLichLuongModal(${item.id_nhan_vien}, '${currentBLThangNam}', '${safeTenNV}')">
                <i class="fa-solid fa-calendar-days"></i> Bảng công
            </button>
        `;

        // - Nếu là Quản lý sân: Hiển thị thêm các nút nghiệp vụ (Chốt lương / Xử lý khiếu nại / Thanh toán)
        if (!isAdmin) {
            if (item.trang_thai === 'ChuaChot') {
                actionHtml += `
                    <button class="btn-primary" style="padding: 5px 10px; font-size: 0.82rem; margin-left: 5px;" onclick="openConfirmChotLuongModal(${item.id_nhan_vien}, '${safeTenNV}', ${item.thuc_lanh})">
                        <i class="fa-solid fa-lock"></i> Chốt lương
                    </button>
                `;
            } else if (item.trang_thai === 'KhieuNai') {
                actionHtml += `
                    <button class="btn-primary" style="padding: 5px 10px; font-size: 0.82rem; margin-left: 5px; background: #ef4444; border-color: #ef4444;" onclick="openXuLyKhieuNaiModal(${item.id_nhan_vien}, '${currentBLThangNam}', '${safeLyDo}')">
                        <i class="fa-solid fa-wrench"></i> Xử lý
                    </button>
                `;
            } else if (item.trang_thai === 'ChoThanhToan') {
                const safeBank = (item.thong_tin_ngan_hang || 'Chưa cung cấp').replace(/'/g, "\\'");
                actionHtml += `
                    <button class="btn-primary" style="padding: 5px 10px; font-size: 0.82rem; margin-left: 5px; background: #10b981; border-color: #10b981;" onclick="openConfirmThanhToanLuongModal(${item.bang_luong_id}, '${safeTenNV}', ${item.thuc_lanh}, '${safeBank}')">
                        <i class="fa-solid fa-check"></i> Đã chuyển khoản
                    </button>
                `;
            }
        }

        return `
            <tr>
                <td>
                    <strong style="color: var(--text-dark);">${item.ten_nhan_vien}</strong><br>
                    <span style="font-size: 0.8rem; color: var(--text-muted);"><i class="fa-solid fa-phone" style="font-size: 0.72rem;"></i> ${item.so_dien_thoai || 'N/A'}</span>
                </td>
                ${isAdmin ? `<td><span style="color: var(--primary); font-weight: 600; font-size: 0.88rem;"><i class="fa-solid fa-location-dot"></i> ${item.ten_cum_san}</span></td>` : ''}
                <td style="text-align: center; font-weight: 600;">${item.tong_ca_lam} ca</td>
                <td style="text-align: right; font-weight: 500;">${Number(item.tong_luong || 0).toLocaleString('vi-VN')}đ</td>
                <td style="text-align: right; font-size: 0.85rem;">${thuongPhatHtml}</td>
                <td style="text-align: right;"><strong style="color: #2563eb; font-size: 1.05rem;">${Number(item.thuc_lanh || 0).toLocaleString('vi-VN')}đ</strong></td>
                <td>${bankHtml}</td>
                <td style="text-align: center;">${badgeHtml}</td>
                <td style="text-align: center; white-space: nowrap;">${actionHtml}</td>
            </tr>
        `;
    }).join('');

    renderBLPagination(totalPages);
}

function renderBLPagination(totalPages) {
    const div = document.getElementById('admin-bl-pagination');
    if (!div) return;
    if (totalPages <= 1) {
        div.innerHTML = '';
        return;
    }

    let html = `<button class="btn-outline-sm" ${currentBLPage === 1 ? 'disabled style="opacity:0.5;"' : ''} onclick="currentBLPage--; applyBLFiltersAndRender()"><i class="fa-solid fa-chevron-left"></i></button>`;

    const getPages = (current, total) => {
        if (total <= 6) return Array.from({ length: total }, (_, i) => i + 1);
        if (current <= 3) return [1, 2, 3, 4, '...', total];
        if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
        return [1, '...', current - 1, current, current + 1, '...', total];
    };

    getPages(currentBLPage, totalPages).forEach(i => {
        if (i === '...') {
            html += `<span style="padding: 6px 10px; color: var(--text-muted); font-weight: bold;">...</span>`;
        } else {
            html += `<button class="${i === currentBLPage ? 'btn-primary' : 'btn-outline-sm'}" style="padding: 6px 14px;" onclick="currentBLPage=${i}; applyBLFiltersAndRender()">${i}</button>`;
        }
    });

    html += `<button class="btn-outline-sm" ${currentBLPage === totalPages ? 'disabled style="opacity:0.5;"' : ''} onclick="currentBLPage++; applyBLFiltersAndRender()"><i class="fa-solid fa-chevron-right"></i></button>`;
    div.innerHTML = html;
}

function openConfirmChotLuongModal(idNhanVien, tenNhanVien, thucLanh) {
    document.getElementById('confirm-chot-luong-nv-id').value = idNhanVien;
    document.getElementById('confirm-chot-luong-msg').innerHTML = `
        Xác nhận chốt bảng lương kỳ <strong>${currentBLThangNam}</strong> cho nhân viên <strong>${tenNhanVien}</strong> với số tiền thực lãnh là <strong style="color: #10b981;">${Number(thucLanh).toLocaleString('vi-VN')}đ</strong>?
    `;
    document.getElementById('confirm-chot-luong-modal').style.display = 'flex';
}

async function executeChotLuong() {
    const idNhanVien = document.getElementById('confirm-chot-luong-nv-id').value;
    const btn = document.getElementById('btn-agree-chot-luong');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang chốt...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/admin/bang-luong/chot`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_nhan_vien: idNhanVien, thang_nam: currentBLThangNam })
        });
        const data = await response.json();
        document.getElementById('confirm-chot-luong-modal').style.display = 'none';

        if (response.ok && data.success) {
            showSystemModal('Thành công', data.message, 'success');
            loadBangLuongAdminData();
        } else {
            showSystemModal('Lỗi', data.message || 'Không thể chốt lương', 'error');
        }
    } catch (e) {
        showSystemModal('Lỗi mạng', 'Không thể kết nối máy chủ', 'error');
    } finally {
        btn.innerHTML = 'Đồng ý Chốt';
        btn.disabled = false;
    }
}

function openXuLyKhieuNaiModal(idNhanVien, thangNam, lyDo) {
    document.getElementById('admin-khieu-nai-nv-id').value = idNhanVien;
    document.getElementById('admin-khieu-nai-thang-nam').value = thangNam;
    document.getElementById('admin-khieu-nai-msg').innerText = lyDo || 'Nhân viên không ghi lý do chi tiết.';
    document.getElementById('admin-khieu-nai-modal').style.display = 'flex';
}

async function executeReChotLuong() {
    const idNhanVien = document.getElementById('admin-khieu-nai-nv-id').value;
    const thangNam = document.getElementById('admin-khieu-nai-thang-nam').value;
    const btn = document.getElementById('btn-re-chot-luong');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang cập nhật...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/admin/bang-luong/chot`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_nhan_vien: idNhanVien, thang_nam: thangNam })
        });
        const data = await response.json();
        document.getElementById('admin-khieu-nai-modal').style.display = 'none';

        if (response.ok && data.success) {
            showSystemModal('Thành công', 'Đã tính lại và gửi bảng lương mới cho nhân viên!', 'success');
            loadBangLuongAdminData();
        } else {
            showSystemModal('Lỗi', data.message || 'Lỗi cập nhật', 'error');
        }
    } catch (e) {
        showSystemModal('Lỗi mạng', 'Không thể kết nối máy chủ', 'error');
    } finally {
        btn.innerHTML = 'Đã sửa lỗi - Tính lại lương';
        btn.disabled = false;
    }
}

let pendingThanhToanBangLuongId = null;

function openConfirmThanhToanLuongModal(bangLuongId, tenNhanVien, thucLanh, thongTinNganHang) {
    pendingThanhToanBangLuongId = bangLuongId;

    let modal = document.getElementById('confirm-thanh-toan-luong-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'confirm-thanh-toan-luong-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10000; align-items: center; justify-content: center;';
        modal.onclick = function(e) {
            if (e.target === modal) closeConfirmThanhToanLuongModal();
        };
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 420px; text-align: center; padding: 30px 24px; border-radius: 14px;">
            <div style="font-size: 3.2rem; color: #10b981; margin-bottom: 12px;">
                <i class="fa-solid fa-money-check-dollar"></i>
            </div>
            <h3 style="margin-bottom: 10px; font-size: 1.35rem; color: var(--text-dark);">Xác nhận Đã Chuyển Khoản?</h3>
            <p style="color: var(--text-muted); margin-bottom: 16px; line-height: 1.5; font-size: 0.92rem;">
                Bạn xác nhận đã chuyển khoản tiền lương kỳ <strong>${currentBLThangNam}</strong> cho nhân viên <strong>${tenNhanVien}</strong>?
            </p>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; margin-bottom: 24px; text-align: left; font-size: 0.88rem; line-height: 1.6;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span style="color: #64748b;">Số tiền thực lãnh:</span>
                    <strong style="color: #2563eb; font-size: 1rem;">${Number(thucLanh || 0).toLocaleString('vi-VN')}đ</strong>
                </div>
                <div style="border-top: 1px dashed #cbd5e1; padding-top: 6px; margin-top: 6px;">
                    <span style="color: #64748b; display: block; font-size: 0.8rem;">Tài khoản thụ hưởng:</span>
                    <strong style="color: #0f172a;">${thongTinNganHang}</strong>
                </div>
            </div>

            <div style="display: flex; justify-content: center; gap: 12px;">
                <button class="btn-outline" style="width: auto; padding: 10px 24px;" onclick="closeConfirmThanhToanLuongModal()">Hủy bỏ</button>
                <button id="btn-agree-thanh-toan-luong" class="btn-primary" style="width: auto; padding: 10px 24px; background-color: #10b981; border-color: #10b981;" onclick="executeThanhToanLuong()">
                    <i class="fa-solid fa-check"></i> Xác nhận Đã Chuyển
                </button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
}

function closeConfirmThanhToanLuongModal() {
    const modal = document.getElementById('confirm-thanh-toan-luong-modal');
    if (modal) modal.style.display = 'none';
    pendingThanhToanBangLuongId = null;
}

async function executeThanhToanLuong() {
    if (!pendingThanhToanBangLuongId) return;

    const btn = document.getElementById('btn-agree-thanh-toan-luong');
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
        btn.disabled = true;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/admin/bang-luong/${pendingThanhToanBangLuongId}/thanh-toan`, {
            method: 'PUT',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
        });
        const data = await response.json();

        closeConfirmThanhToanLuongModal();

        if (response.ok && data.success) {
            showSystemModal('Thành công', data.message, 'success');
            loadBangLuongAdminData();
        } else {
            showSystemModal('Lỗi', data.message || 'Không thể xác nhận thanh toán', 'error');
        }
    } catch (e) {
        closeConfirmThanhToanLuongModal();
        showSystemModal('Lỗi mạng', 'Không thể kết nối máy chủ', 'error');
    }
}

// ======================================================
// HÀM TIỆN ÍCH CHUNG: XEM LƯỚI LỊCH (Admin & Staff dùng chung)
// ======================================================
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
            // Tính lại thực lãnh để đảm bảo luôn đúng 100% (cộng dồn từ dữ liệu trả về của Backend)
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
// MODULE TIỆN ÍCH: XUẤT BÁO CÁO EXCEL (AUTOFIT + MÀU SẮC) & IN PHIẾU LƯƠNG
// ======================================================

/**
 * Hàm lõi xuất file Excel (.xls) có hỗ trợ:
 * 1. AutoFit Column Width (Tự động tính độ rộng cột theo nội dung dài nhất + bộ đệm pixel)
 * 2. Bôi màu tiêu đề, màu xen kẽ từng dòng (Zebra striping), màu trạng thái và màu tiền tệ
 * 3. Kẻ khung (Border) toàn bộ bảng và định dạng chuẩn tiếng Việt UTF-8
 */
function exportStyledExcelFile(filename, reportTitle, subtitle, headers, rowsData, totalRowData = null) {
    const colCount = headers.length;

    // 1. THUẬT TOÁN AUTOFIT COLUMN WIDTH: Đo chiều dài chuỗi lớn nhất ở mỗi cột
    const colWidthsPx = headers.map((h, colIdx) => {
        let maxLen = String(h.label || h).length;

        rowsData.forEach(row => {
            const cell = row[colIdx];
            const valStr = (cell && typeof cell === 'object') ? String(cell.value ?? '') : String(cell ?? '');
            if (valStr.length > maxLen) maxLen = valStr.length;
        });

        if (totalRowData && totalRowData[colIdx] !== undefined) {
            const totalCell = totalRowData[colIdx];
            const totalStr = (totalCell && typeof totalCell === 'object') ? String(totalCell.value ?? '') : String(totalCell ?? '');
            if (totalStr.length > maxLen) maxLen = totalStr.length;
        }

        // Quy đổi số ký tự sang Pixel (mỗi ký tự ~ 8.5px + 26px padding hai bên, tối thiểu 65px, tối đa 420px)
        return Math.min(Math.max(Math.round(maxLen * 8.5) + 26, 65), 420);
    });

    const colGroupHtml = colWidthsPx.map(w => `<col width="${w}" style="width: ${w}px; mso-width-source: userset;">`).join('');

    // 2. Render Header Bảng
    const theadHtml = headers.map(h => {
        const label = (h && typeof h === 'object') ? h.label : h;
        return `<th style="background-color: #0b5d3b; color: #ffffff; font-weight: bold; text-align: center; vertical-align: middle; border: 1px solid #064e3b; padding: 10px 8px; height: 34px; white-space: nowrap;">${label}</th>`;
    }).join('');

    // 3. Render Các Dòng Dữ Liệu (Có bôi màu xen kẽ trắng / xanh nhạt và màu riêng của từng ô)
    const tbodyHtml = rowsData.map((row, rowIdx) => {
        const defaultRowBg = (rowIdx % 2 === 0) ? '#ffffff' : '#f8fafc';

        const cellsHtml = row.map(cell => {
            const isObj = (cell !== null && typeof cell === 'object');
            const val = isObj ? (cell.value ?? '') : (cell ?? '');
            const align = (isObj && cell.align) ? cell.align : 'left';
            const color = (isObj && cell.color) ? cell.color : '#0f172a';
            const bg = (isObj && cell.bg) ? cell.bg : defaultRowBg;
            const bold = (isObj && cell.bold) ? 'font-weight: bold;' : '';
            const numFormat = (isObj && cell.type === 'currency')
                ? 'mso-number-format:"\\#\\,\\#\\#0\\" đ\\"";'
                : ((isObj && cell.type === 'text') ? 'mso-number-format:"\\@";' : '');

            return `<td style="background-color: ${bg}; color: ${color}; text-align: ${align}; vertical-align: middle; border: 1px solid #cbd5e1; padding: 7px 8px; height: 26px; white-space: nowrap; ${bold} ${numFormat}">${val}</td>`;
        }).join('');

        return `<tr>${cellsHtml}</tr>`;
    }).join('');

    // 4. Render Dòng Tổng Cộng Cuối Bảng (Bôi nền vàng nhạt nổi bật)
    let tfootHtml = '';
    if (totalRowData) {
        const totalCells = totalRowData.map(cell => {
            const isObj = (cell !== null && typeof cell === 'object');
            const val = isObj ? (cell.value ?? '') : (cell ?? '');
            const align = (isObj && cell.align) ? cell.align : 'center';
            const color = (isObj && cell.color) ? cell.color : '#0f172a';
            const bg = (isObj && cell.bg) ? cell.bg : '#fef3c7';
            const numFormat = (isObj && cell.type === 'currency') ? 'mso-number-format:"\\#\\,\\#\\#0\\" đ\\"";' : '';

            return `<td style="background-color: ${bg}; color: ${color}; font-weight: bold; text-align: ${align}; vertical-align: middle; border: 1px solid #94a3b8; padding: 9px 8px; height: 32px; white-space: nowrap; font-size: 11pt; ${numFormat}">${val}</td>`;
        }).join('');
        tfootHtml = `<tfoot><tr>${totalCells}</tr></tfoot>`;
    }

    const now = new Date();
    const exportTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} - ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

    const excelTemplate = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="UTF-8">
            <!--[if gte mso 9]>
            <xml>
                <x:ExcelWorkbook>
                    <x:ExcelWorksheets>
                        <x:ExcelWorksheet>
                            <x:Name>BaoCao_DNFootball</x:Name>
                            <x:WorksheetOptions>
                                <x:DisplayGridlines/>
                            </x:WorksheetOptions>
                        </x:ExcelWorksheet>
                    </x:ExcelWorksheets>
                </x:ExcelWorkbook>
            </xml>
            <![endif]-->
            <style>
                body, table { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 10.5pt; }
                table { border-collapse: collapse; }
            </style>
        </head>
        <body>
            <table>
                ${colGroupHtml}
                <thead>
                    <tr>
                        <th colspan="${colCount}" style="background-color: #ecfdf5; color: #0b5d3b; font-size: 15pt; font-weight: bold; text-align: center; vertical-align: middle; height: 42px; border: 1px solid #0b5d3b;">
                            HỆ THỐNG SÂN BÓNG ĐÁ DN FOOTBALL - ${reportTitle.toUpperCase()}
                        </th>
                    </tr>
                    <tr>
                        <th colspan="${colCount}" style="background-color: #f8fafc; color: #475569; font-size: 10pt; font-style: italic; text-align: center; vertical-align: middle; height: 26px; border: 1px solid #cbd5e1;">
                            ${subtitle} | Thời gian xuất: ${exportTimeStr}
                        </th>
                    </tr>
                    <tr><td colspan="${colCount}" style="height: 10px;"></td></tr>
                    <tr>${theadHtml}</tr>
                </thead>
                <tbody>
                    ${tbodyHtml}
                </tbody>
                ${tfootHtml}
            </table>
        </body>
        </html>
    `;

    const cleanFilename = filename.replace(/\.(csv|xlsx|xls)$/i, '') + '.xls';
    const blob = new Blob(['\uFEFF' + excelTemplate], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', cleanFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// 1. Xuất Excel Bảng Lương (Có AutoFit + Bôi màu Trạng thái & Tiền tệ)
function exportBangLuongExcel() {
    if (!allAdminBangLuongData || allAdminBangLuongData.length === 0) {
        return showSystemModal('Thông báo', 'Không có dữ liệu bảng lương để xuất!', 'error');
    }

    const filtered = allAdminBangLuongData.filter(item => {
        const matchCumSan = (currentBLCumSanFilter === 'All') || (String(item.id_cum_san) === String(currentBLCumSanFilter));
        const matchStatus = (currentBLStatusFilter === 'All') || (item.trang_thai === currentBLStatusFilter);
        const tenNV = (item.ten_nhan_vien || '').toLowerCase();
        const sdtNV = (item.so_dien_thoai || '').toLowerCase();
        const tenCS = (item.ten_cum_san || '').toLowerCase();
        const matchSearch = !currentBLSearch || tenNV.includes(currentBLSearch) || sdtNV.includes(currentBLSearch) || tenCS.includes(currentBLSearch);
        return matchCumSan && matchStatus && matchSearch;
    });

    if (filtered.length === 0) {
        return showSystemModal('Thông báo', 'Danh sách lọc hiện tại đang trống!', 'error');
    }

    // Bảng màu riêng cho từng trạng thái lương
    const statusStyleMap = {
        'ChuaChot':     { text: 'Chưa chốt (Tạm tính)', bg: '#f1f5f9', color: '#475569' },
        'ChoXacNhan':   { text: 'Chờ NV xác nhận',      bg: '#fef3c7', color: '#b45309' },
        'KhieuNai':     { text: 'Đang khiếu nại',       bg: '#fee2e2', color: '#b91c1c' },
        'ChoThanhToan': { text: 'Chờ chuyển khoản',     bg: '#e0e7ff', color: '#4338ca' },
        'DaThanhToan':  { text: 'Đã thanh toán',        bg: '#d1fae5', color: '#047857' }
    };

    const headers = [
        'STT', 'Kỳ Lương', 'Họ và Tên Nhân Viên', 'Số Điện Thoại', 'Cơ Sở Trực Thuộc',
        'Số Ca Làm', 'Lương Cơ Bản', 'Tổng Thưởng (+)', 'Tổng Phạt (-)',
        'Thực Lãnh', 'Thông Tin Ngân Hàng', 'Trạng Thái', 'Ngày Thanh Toán'
    ];

    let sumCa = 0, sumLuong = 0, sumThuong = 0, sumPhat = 0, sumThucLanh = 0;

    const rowsData = filtered.map((item, idx) => {
        const ca = Number(item.tong_ca_lam || 0);
        const luong = Number(item.tong_luong || 0);
        const thuong = Number(item.tong_thuong || 0);
        const phat = Number(item.tong_phat || 0);
        const thucLanh = Number(item.thuc_lanh || 0);

        sumCa += ca;
        sumLuong += luong;
        sumThuong += thuong;
        sumPhat += phat;
        sumThucLanh += thucLanh;

        const st = statusStyleMap[item.trang_thai] || { text: item.trang_thai, bg: '#f1f5f9', color: '#334155' };

        return [
            { value: idx + 1, align: 'center' },
            { value: currentBLThangNam, align: 'center', type: 'text', bold: true },
            { value: item.ten_nhan_vien || '', bold: true },
            { value: item.so_dien_thoai || 'N/A', align: 'center', type: 'text' },
            { value: item.ten_cum_san || '', color: '#0b5d3b', bold: true },
            { value: `${ca} ca`, align: 'center', bold: true },
            { value: luong, align: 'right', type: 'currency' },
            { value: thuong, align: 'right', type: 'currency', color: thuong > 0 ? '#059669' : '#64748b', bg: thuong > 0 ? '#ecfdf5' : undefined, bold: thuong > 0 },
            { value: phat, align: 'right', type: 'currency', color: phat > 0 ? '#dc2626' : '#64748b', bg: phat > 0 ? '#fef2f2' : undefined, bold: phat > 0 },
            { value: thucLanh, align: 'right', type: 'currency', color: '#1d4ed8', bg: '#eff6ff', bold: true },
            { value: item.thong_tin_ngan_hang || 'Chưa cung cấp', color: item.thong_tin_ngan_hang ? '#0f172a' : '#94a3b8' },
            { value: st.text, align: 'center', bg: st.bg, color: st.color, bold: true },
            { value: item.ngay_thanh_toan ? item.ngay_thanh_toan.substring(0, 16) : '-', align: 'center', type: 'text' }
        ];
    });

    const totalRow = [
        '',
        { value: 'TỔNG CỘNG', align: 'center' },
        { value: `${filtered.length} nhân sự`, align: 'left' },
        '',
        '',
        { value: `${sumCa} ca`, align: 'center' },
        { value: sumLuong, align: 'right', type: 'currency' },
        { value: sumThuong, align: 'right', type: 'currency', color: '#059669' },
        { value: sumPhat, align: 'right', type: 'currency', color: '#dc2626' },
        { value: sumThucLanh, align: 'right', type: 'currency', color: '#1d4ed8', bg: '#dbeafe' },
        '', '', ''
    ];

    exportStyledExcelFile(
        `Bang_Luong_DN_Football_${currentBLThangNam}`,
        `BẢNG LƯƠNG NHÂN VIÊN KỲ ${currentBLThangNam}`,
        `Tổng số nhân sự: ${filtered.length} | Tổng quỹ lương thực lãnh: ${sumThucLanh.toLocaleString('vi-VN')} đ`,
        headers,
        rowsData,
        totalRow
    );
}

// 2. Xuất Excel Lịch sử Nhập hàng (Có AutoFit + Bôi màu Chi phí)
function exportAdminPhieuNhapExcel() {
    if (!adminPhieuNhapData || adminPhieuNhapData.length === 0) {
        return showSystemModal('Thông báo', 'Không có dữ liệu phiếu nhập để xuất!', 'error');
    }

    const filtered = adminPhieuNhapData.filter(pn => {
        const matchCumSan = (adminPhieuNhapCumSan === 'All' || String(pn.ID_CumSan) === String(adminPhieuNhapCumSan));
        const dateOnly = pn.NgayNhap ? pn.NgayNhap.substring(0, 10) : '';
        const matchDate = (adminPhieuNhapDate === '' || dateOnly === adminPhieuNhapDate);
        const maPhieu = `pn${pn.ID}`.toLowerCase();
        const tenNhanVien = pn.nhan_vien ? pn.nhan_vien.HoTen.toLowerCase() : '';
        const tenMonStr = pn.ChiTietNhap ? pn.ChiTietNhap.map(i => i.ten_san_pham).join(' ').toLowerCase() : '';
        const matchSearch = maPhieu.includes(adminPhieuNhapSearch) || tenNhanVien.includes(adminPhieuNhapSearch) || tenMonStr.includes(adminPhieuNhapSearch);
        return matchCumSan && matchDate && matchSearch;
    });

    if (filtered.length === 0) {
        return showSystemModal('Thông báo', 'Không có phiếu nhập nào khớp với bộ lọc hiện tại!', 'error');
    }

    const headers = ['STT', 'Mã Phiếu Nhập', 'Cơ Sở Nhập Kho', 'Người Lập Phiếu', 'Chi Tiết Hàng Hóa Nhập', 'Tổng Thanh Toán', 'Thời Gian Nhập'];
    let totalCost = 0;

    const rowsData = filtered.map((pn, idx) => {
        const cost = Number(pn.TongTienThanhToan || 0);
        totalCost += cost;
        const chiTietStr = pn.ChiTietNhap ? pn.ChiTietNhap.map(i => `${i.ten_san_pham} (SL: ${i.so_luong})`).join(' | ') : '';

        return [
            { value: idx + 1, align: 'center' },
            { value: `#PN${pn.ID}`, align: 'center', bold: true, color: '#334155', bg: '#f1f5f9' },
            { value: pn.cum_san ? pn.cum_san.TenCumSan : 'N/A', bold: true, color: '#0b5d3b' },
            { value: pn.nhan_vien ? pn.nhan_vien.HoTen : 'N/A' },
            { value: chiTietStr },
            { value: cost, align: 'right', type: 'currency', bold: true, color: '#b91c1c', bg: '#fef2f2' },
            { value: pn.NgayNhap ? pn.NgayNhap.replace('T', ' ').substring(0, 16) : '', align: 'center', type: 'text' }
        ];
    });

    const totalRow = [
        '',
        { value: 'TỔNG CHI NHẬP KHO', align: 'center' },
        { value: `${filtered.length} phiếu nhập`, align: 'left' },
        '',
        '',
        { value: totalCost, align: 'right', type: 'currency', color: '#b91c1c', bg: '#fee2e2' },
        ''
    ];

    exportStyledExcelFile(
        `Bao_Cao_Nhap_Kho_DN_Football`,
        `BÁO CÁO LỊCH SỬ NHẬP KHO HÀNG HÓA`,
        `Tổng số phiếu nhập: ${filtered.length} | Tổng chi thanh toán: ${totalCost.toLocaleString('vi-VN')} đ`,
        headers,
        rowsData,
        totalRow
    );
}

// 3. Xuất Excel Hóa đơn Bán hàng (Có AutoFit + Bôi màu Doanh thu)
function exportAdminHoaDonExcel() {
    if (!adminHoaDonData || adminHoaDonData.length === 0) {
        return showSystemModal('Thông báo', 'Không có dữ liệu hóa đơn để xuất!', 'error');
    }

    const filtered = adminHoaDonData.filter(hd => {
        const matchCumSan = (adminHoaDonCumSan === 'All' || String(hd.ID_CumSan) === String(adminHoaDonCumSan));
        const dateOnly = hd.NgayTao ? hd.NgayTao.substring(0, 10) : '';
        const matchDate = (adminHoaDonDate === '' || dateOnly === adminHoaDonDate);
        const maHD = `hd${hd.ID}`.toLowerCase();
        const thuNgan = hd.nhan_vien ? hd.nhan_vien.HoTen.toLowerCase() : '';
        const tenMonStr = (hd.chi_tiet_hoa_dons && hd.chi_tiet_hoa_dons.length > 0)
            ? hd.chi_tiet_hoa_dons.map(i => i.san_pham ? i.san_pham.TenSanPham : '').join(' ').toLowerCase() : '';
        const matchSearch = maHD.includes(adminHoaDonSearch) || thuNgan.includes(adminHoaDonSearch) || tenMonStr.includes(adminHoaDonSearch);
        return matchCumSan && matchDate && matchSearch;
    });

    if (filtered.length === 0) {
        return showSystemModal('Thông báo', 'Không có hóa đơn nào khớp với bộ lọc hiện tại!', 'error');
    }

    const headers = ['STT', 'Mã Hóa Đơn', 'Cơ Sở Bán Hàng', 'Thu Ngân Lập Đơn', 'Chi Tiết Mặt Hàng Đã Bán', 'Tổng Doanh Thu', 'Thời Gian Giao Dịch'];
    let totalRev = 0;

    const rowsData = filtered.map((hd, idx) => {
        const rev = Number(hd.TongTien || 0);
        totalRev += rev;
        const chiTietStr = (hd.chi_tiet_hoa_dons && hd.chi_tiet_hoa_dons.length > 0)
            ? hd.chi_tiet_hoa_dons.map(ct => `${ct.san_pham ? ct.san_pham.TenSanPham : 'Món'} (SL: ${ct.SoLuong})`).join(' | ')
            : 'Trống';

        return [
            { value: idx + 1, align: 'center' },
            { value: `#HD${hd.ID}`, align: 'center', bold: true, color: '#1e40af', bg: '#eff6ff' },
            { value: hd.cum_san ? hd.cum_san.TenCumSan : 'N/A', bold: true, color: '#0b5d3b' },
            { value: hd.nhan_vien ? hd.nhan_vien.HoTen : 'N/A', color: '#2563eb', bold: true },
            { value: chiTietStr },
            { value: rev, align: 'right', type: 'currency', bold: true, color: '#047857', bg: '#ecfdf5' },
            { value: hd.NgayTao ? hd.NgayTao.replace('T', ' ').substring(0, 16) : '', align: 'center', type: 'text' }
        ];
    });

    const totalRow = [
        '',
        { value: 'TỔNG DOANH THU', align: 'center' },
        { value: `${filtered.length} hóa đơn`, align: 'left' },
        '',
        '',
        { value: totalRev, align: 'right', type: 'currency', color: '#047857', bg: '#d1fae5' },
        ''
    ];

    exportStyledExcelFile(
        `Bao_Cao_Hoa_Don_Ban_Hang_DN_Football`,
        `BÁO CÁO DOANH THU HÓA ĐƠN BÁN HÀNG`,
        `Tổng số hóa đơn: ${filtered.length} | Tổng doanh thu: ${totalRev.toLocaleString('vi-VN')} đ`,
        headers,
        rowsData,
        totalRow
    );
}

function printBangCongModal() {
    const title = document.getElementById('luoi-lich-title')?.innerText || 'Phiếu Lương Nhân Viên';
    const summaryHtml = document.getElementById('luoi-lich-tong-quan')?.innerHTML || '';
    const tableBodyHtml = document.getElementById('luoi-lich-tbody')?.innerHTML || '';

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
        return showSystemModal('Cảnh báo', 'Trình duyệt đang chặn cửa sổ bật lên (Pop-up). Vui lòng cho phép Pop-up để in phiếu lương!', 'error');
    }

    const now = new Date();
    const dateStr = `Ngày ${String(now.getDate()).padStart(2, '0')} tháng ${String(now.getMonth() + 1).padStart(2, '0')} năm ${now.getFullYear()}`;

    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <title>${title} - DN FOOTBALL</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <style>
                body { font-family: 'Times New Roman', Times, serif; color: #0f172a; margin: 30px; line-height: 1.5; }
                .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0b5d3b; padding-bottom: 15px; margin-bottom: 20px; }
                .brand { font-size: 20px; font-weight: bold; color: #0b5d3b; }
                .national { text-align: center; font-weight: bold; font-size: 14px; }
                h2 { text-align: center; text-transform: uppercase; color: #0f172a; margin: 20px 0 15px 0; font-size: 22px; }
                .summary-box { display: flex; justify-content: space-around; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; margin-bottom: 20px; font-family: Arial, sans-serif; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-family: Arial, sans-serif; font-size: 13px; }
                th, td { border: 1px solid #cbd5e1; padding: 10px 12px; }
                th { background: #f1f5f9; font-weight: bold; text-align: left; }
                .signatures { display: flex; justify-content: space-around; text-align: center; margin-top: 40px; page-break-inside: avoid; }
                @media print {
                    body { margin: 15px; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <div class="brand">HỆ THỐNG SÂN BÓNG ĐÁ DN FOOTBALL</div>
                    <div style="font-size: 13px; color: #475569;">Đà Nẵng, Việt Nam | Hotline: 0899244124</div>
                </div>
                <div class="national">
                    CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br>
                    Độc lập - Tự do - Hạnh phúc
                </div>
            </div>

            <h2>PHIẾU TỔNG HỢP CÔNG & LƯƠNG NHÂN VIÊN<br><span style="font-size: 16px; font-weight: normal; text-transform: none;">(${title})</span></h2>

            <div class="summary-box">${summaryHtml}</div>

            <table>
                <thead>
                    <tr>
                        <th style="width: 15%;">Ngày</th>
                        <th style="width: 30%;">Ca làm việc & Vị trí</th>
                        <th style="width: 20%; text-align: center;">Trạng thái</th>
                        <th style="width: 35%; text-align: right;">Chi tiết Lương / Thưởng / Phạt</th>
                    </tr>
                </thead>
                <tbody>${tableBodyHtml}</tbody>
            </table>

            <div style="text-align: right; font-style: italic; margin-bottom: 10px;">Đà Nẵng, ${dateStr}</div>
            <div class="signatures">
                <div>
                    <strong>NGƯỜI LẬP BIỂU / QUẢN LÝ</strong><br>
                    <span style="font-size: 13px; font-style: italic;">(Ký và ghi rõ họ tên)</span>
                </div>
                <div>
                    <strong>NHÂN VIÊN XÁC NHẬN</strong><br>
                    <span style="font-size: 13px; font-style: italic;">(Ký và ghi rõ họ tên)</span>
                </div>
            </div>

            <script>
                window.onload = function() {
                    setTimeout(() => { window.print(); }, 400);
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}