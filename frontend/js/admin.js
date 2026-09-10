// ======================================================
// DN FOOTBALL - ADMIN
// ======================================================
const API_BASE_URL = 'http://127.0.0.1:8000/api';

let currentGDDate = '';
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
        if (currentUser.VaiTro !== 'Admin') {
            if (
                currentUser.VaiTro === 'KhachHang'
            ) {
                window.location.href =
                    'customer.html';
            } else {
                sessionStorage.clear();
                window.location.href = 'login.html';
            }
            return;
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
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                            credentials: 'include',
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

                // NẾU ADMIN ĐANG MỞ TAB DANH SÁCH KHÁCH HÀNG -> TỰ REFRESH BẢNG
                if (document.getElementById('khachhang-table-body')) {
                    loadDanhSachKhachHangAdmin();
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
                // Nếu Admin đang mở tab Yêu cầu Rút tiền -> tự refresh bảng
                else if (document.getElementById('rt-pending-count')) {
                    loadDanhSachRutTienAdmin();
                }
            });
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
                <h3>${user.HoTen || 'Chưa cập nhật'}</h3>
                <p>Quản trị viên</p>
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
            credentials: 'include', // Bắt buộc để gửi kèm Cookie/Session
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

// ======================================================
// MODULE: QUẢN LÝ SÂN (GIAO DIỆN DẠNG THẺ)
// ======================================================

// 1. Render giao diện danh sách thẻ Cụm Sân
function renderQuanLySan() {
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = Array.from(document.querySelectorAll('.sidebar-nav a')).find(a => a.textContent.includes('QUẢN LÝ SÂN'));
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
        const response = await fetch(`${API_BASE_URL}/cum-san`, { credentials: 'include' });
        const res = await response.json();
        
        const grid = document.getElementById('cumsan-grid');
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
    
    // Khung loading
    contentArea.innerHTML = `<div style="text-align:center; margin-top:50px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu...</div>`;

    try {
        // Fetch dữ liệu Cụm Sân chi tiết từ API
        const response = await fetch(`${API_BASE_URL}/cum-san/${cumSanId}`, { credentials: 'include' });
        const res = await response.json();

        if (!res.success) {
            contentArea.innerHTML = `<button class="btn-back" onclick="renderQuanLySan()"><i class="fa-solid fa-arrow-left"></i> Quay lại</button>
                                     <div class="modal-alert error" style="display:block;">Không tìm thấy cụm sân.</div>`;
            return;
        }

        const cs = res.data;
        const isDeleted = cs.deleted_at !== null;

        // 1. Nút Sửa luôn hiển thị
        const btnEdit = `<button class="btn-outline-sm" onclick='openEditCumSanModal(${JSON.stringify(cs).replace(/'/g, "\\'")})'><i class="fa-solid fa-pen"></i> Sửa Cụm Sân</button>`;
        
        // 2. Nút Xóa hoặc Khôi phục đổi theo trạng thái
        const btnDeleteOrRestore = isDeleted 
            ? `<button class="btn-outline-sm" style="color: #16A34A; border-color: #bbf7d0;" onclick="restoreCumSan(${cs.ID})"><i class="fa-solid fa-rotate-left"></i> Khôi phục</button>`
            : `<button class="btn-outline-sm" style="color: #ef4444; border-color: #fecaca;" onclick="deleteCumSan(${cs.ID})"><i class="fa-solid fa-trash"></i> Xóa</button>`;

        // Nhãn trạng thái hiển thị kế bên Tên cụm sân
        const statusBadge = isDeleted ? `<span class="badge badge-warning" style="margin-left: 10px; font-size: 0.9rem;">Đã tạm ngưng</span>` : '';

        // Render HTML
        contentArea.innerHTML = `
            <button class="btn-back" onclick="renderQuanLySan()"><i class="fa-solid fa-arrow-left"></i> Quay lại Danh sách Cụm Sân</button>
            
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
                
                <!-- 1. Thêm max-height và overflow-y vào thẻ bọc ngoài -->
                <div class="table-responsive" style="max-height: 320px; overflow-y: auto;">
                    <table class="admin-table" style="position: relative;">
                        <!-- 2. Thêm position: sticky để ghim tiêu đề cột khi cuộn chuột -->
                        <thead style="position: sticky; top: 0; background: #F8FAFC; z-index: 1; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <tr>
                                <th>Tên Sân</th>
                                <th>Loại Sân</th>
                                <th>Trạng Thái</th>
                                <th>Hành động</th>
                            </tr>
                        </thead>
                        <tbody id="sanbong-table-body">
                            <tr><td colspan="4" class="text-center">Đang tải...</td></tr>
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
        const response = await fetch(`${API_BASE_URL}/san-bong?cum_san_id=${cumSanId}`, { credentials: 'include' });
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
                <td><button class="action-btn" onclick='openSanBongModal(${JSON.stringify(sb).replace(/'/g, "\\'")})'><i class="fa-solid fa-pen-to-square"></i>Chỉnh sửa</button></td>
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
            credentials: 'include',
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
            credentials: 'include',
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
        const response = await fetch(`${API_BASE_URL}/phuong`, { credentials: 'include' });
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

    await loadPhuongDropdown();
    generateTimeOptions('cs-giomo', cs.GioMoCua.substring(0, 5));
    generateTimeOptions('cs-giodong', cs.GioDongCua.substring(0, 5));

    document.getElementById('cs-ten').value = cs.TenCumSan;
    document.getElementById('cs-diachi').value = cs.DiaChi;
    document.getElementById('cs-phuong').value = cs.ID_Phuong;
    document.getElementById('cs-hinhanh').value = ''; // Reset input file

    document.getElementById('cumsan-modal').style.display = 'flex';
}

// Bật Modal
async function openCumSanModal() {
    document.getElementById('cumsan-alert').style.display = 'none';
    document.getElementById('cumsan-modal-title').textContent = 'Thêm Cụm Sân Mới';

    editCumSanId = null;
    
    // Clear dữ liệu cũ
    document.getElementById('cs-ten').value = '';
    document.getElementById('cs-diachi').value = '';
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
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
                // Xóa 'Content-Type' để browser tự set dạng multipart/form-data
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
            credentials: 'include',
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
        const response = await fetch(`${API_BASE_URL}/admin/giai-dau`, { credentials: 'include' });
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
        let badgeClass = 'badge-secondary';
        if(item.TrangThai === 'DaDuyet') badgeClass = 'badge-success';
        else if(item.TrangThai === 'ChoDuyet') badgeClass = 'badge-warning';
        else if(item.TrangThai === 'TuChoi' || item.TrangThai === 'DaHuy') badgeClass = 'badge-danger';

        const viStatus = statusTextMap[item.TrangThai] || item.TrangThai;

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
                <td><span class="badge ${badgeClass}">${viStatus}</span></td>
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
            credentials: 'include',
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
        const response = await fetch(`${API_BASE_URL}/admin/giai-dau/${giaiDauId}/ma-tran`, { credentials: 'include' });
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
        const response = await fetch(`${API_BASE_URL}/admin/yeu-cau-rut-tien`, { credentials: 'include' });
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
            method: 'PUT', credentials: 'include', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
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
    const menuLink = Array.from(document.querySelectorAll('.sidebar-nav a')).find(a => a.textContent.includes('LỊCH ĐẶT SÂN'));
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
        const response = await fetch(`${API_BASE_URL}/admin/dat-san`, { credentials: 'include' });
        const res = await response.json();
        if (res.success) { allDatSanData = res.data || []; applyDSFiltersAndRender(); }
    } catch (error) { showDSAlert('Lỗi kết nối máy chủ.', false); }
}

function applyDSFiltersAndRender() {
    let filteredData = allDatSanData.filter(item => {
        const matchStatus = (currentDSFilter === 'All' || item.TrangThai === currentDSFilter);
        const maVeSearch = item.ID_GiaiDau ? `gd-${item.ID_GiaiDau}` : `pt-${item.ID}`;
        const sdt = item.nguoi_dung ? item.nguoi_dung.SoDienThoai.toLowerCase() : '';
        const tenKhach = item.nguoi_dung ? item.nguoi_dung.HoTen.toLowerCase() : '';
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

        // Nút hành động
        let actionHtml = '';
        if (item.TrangThai === 'DaCoc') {
            actionHtml = `<button class="btn-primary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="openDSConfirmModal(${item.ID})">Chốt sân</button>`;
        } else {
            actionHtml = `<span style="color: var(--text-muted); font-size: 0.85rem;">Đã xử lý</span>`;
        }

        return `<tr>
            <td style="text-align: center;">
                <span style="padding: 6px 12px; border-radius: 8px; font-weight: 700; font-family: 'Courier New', Courier, monospace; font-size: 0.95rem; display: inline-block; white-space: nowrap; letter-spacing: 1px; ${badgeClassVe}">
                    ${maVeDisplay}
                </span>
            </td>
            <td>
                <strong>${item.nguoi_dung?.HoTen || 'N/A'}</strong><br>
                <span style="font-size: 0.85rem; color: var(--text-muted);">${item.nguoi_dung?.SoDienThoai || ''}</span>
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
                    <button class="btn-outline" style="width: auto; padding: 10px 24px; color: #64748b; border-color: #cbd5e1;" onclick="executeCapNhatDatSan('KhongDen')"><i class="fa-solid fa-user-slash"></i> Không đến</button>
                    <button class="btn-primary" style="width: auto; padding: 10px 24px; background-color: #10b981; border-color: #10b981;" onclick="executeCapNhatDatSan('HoanThanh')"><i class="fa-solid fa-check"></i> Hoàn thành</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
}

function closeDSConfirmModal() { document.getElementById('ds-confirm-modal').style.display = 'none'; }

async function executeCapNhatDatSan(trangThai) {
    if (!pendingDSId) return;
    closeDSConfirmModal(); 

    try {
        const response = await fetch(`${API_BASE_URL}/admin/dat-san/${pendingDSId}/chot`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ trang_thai: trangThai })
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
            showDSAlert('Đã cập nhật trạng thái thành công!', true);
            loadDanhSachDatSanAdmin(); // Tải lại lưới dữ liệu
        } else {
            showDSAlert(data.message || 'Lỗi xử lý.', false);
        }
    } catch (e) {
        showDSAlert('Lỗi kết nối máy chủ.', false);
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
        const response = await fetch(`${API_BASE_URL}/admin/yeu-cau-huy-gap`, { credentials: 'include' });
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
            method: 'PUT', credentials: 'include', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
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
let allKhachHangData = [];
let currentViewedKhachHangId = null;
let currentKhachHangDatSan = [];

// 1. Render màn hình Danh sách Khách hàng
function renderQuanLyKhachHang() {
    currentViewedKhachHangId = null;

    // Active menu
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = Array.from(document.querySelectorAll('.sidebar-nav a')).find(a => a.textContent.includes('QUẢN LÝ KHÁCH HÀNG'));
    if (menuLink) menuLink.classList.add('active');

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `
        <div class="page-header" style="margin-bottom: 24px;">
            <h1 class="page-title">Quản lý Khách Hàng</h1>
            <p class="text-muted">Theo dõi thông tin, lịch sử đặt sân và uy tín của khách hàng</p>
        </div>

        <!-- Khung tìm kiếm -->
        <div class="panel" style="margin-bottom: 20px; max-width: 400px;">
            <div style="position: relative; max-width: 400px;">
                <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 12px; top: 12px; color: var(--text-muted);"></i>
                <input type="text" id="kh-search-input" class="form-control" style="padding-left: 35px;" placeholder="Tìm theo Tên, SĐT, Email..." oninput="handleKHSearch(this.value)">
            </div>
        </div>

        <!-- Bảng danh sách -->
        <div class="panel">
            <div class="table-responsive" style="max-height: 60vh; overflow-y: auto;">
                <table class="admin-table" style="position: relative;">
                    <thead style="position: sticky; top: 0; z-index: 10; background: #F8FAFC;">
                        <tr>
                            <th>Khách hàng</th>
                            <th>Liên hệ</th>
                            <th style="text-align: center;">Số dư ví</th>
                            <th style="text-align: center;">Tỷ lệ Bùng sân</th>
                            <th style="text-align: center;">Trạng thái</th>
                            <th style="text-align: center;">Hành động</th>
                        </tr>
                    </thead>
                    <tbody id="khachhang-table-body">
                        <tr><td colspan="6" class="text-center" style="text-align: center;">Đang tải dữ liệu...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    loadDanhSachKhachHangAdmin();
}

async function loadDanhSachKhachHangAdmin() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/khach-hang`, { credentials: 'include' });
        const res = await response.json();
        if (res.success) {
            allKhachHangData = res.data;
            renderKHTable(allKhachHangData);
        }
    } catch (error) {
        document.getElementById('khachhang-table-body').innerHTML = `<tr><td colspan="6" class="text-center text-danger" style="text-align: center;">Lỗi kết nối máy chủ!</td></tr>`;
    }
}

function handleKHSearch(value) {
    const searchTerm = value.toLowerCase().trim();
    const filtered = allKhachHangData.filter(kh => 
        kh.HoTen.toLowerCase().includes(searchTerm) || 
        kh.SoDienThoai.includes(searchTerm) || 
        (kh.Email && kh.Email.toLowerCase().includes(searchTerm))
    );
    renderKHTable(filtered);
}

function renderKHTable(data) {
    const tbody = document.getElementById('khachhang-table-body');
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 40px; text-align: center;">Không tìm thấy khách hàng nào.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(kh => {
        // Trạng thái Khóa
        const statusBadge = kh.TrangThaiKhoa 
            ? `<span class="badge badge-danger"><i class="fa-solid fa-lock"></i> Bị khóa</span>` 
            : `<span class="badge badge-success"><i class="fa-solid fa-check-circle"></i> Hoạt động</span>`;
        
        // Tỷ lệ bùng sân
        let tyLeBungHtml = `<span style="color: #64748b; font-size: 0.85rem;">Chưa có dữ liệu</span>`;
        if (kh.tong_tran_da_chot > 0) {
            // Rủi ro cao nếu tỷ lệ >= 30% HOẶC đã bùng >= 3 trận
            const isNguyHiem = kh.ty_le_bung >= 30 || kh.tong_bung_san >= 3; 
            const color = isNguyHiem ? '#ef4444' : (kh.ty_le_bung > 0 ? '#f59e0b' : '#16a34a'); // Đỏ, Vàng, Xanh lá
            
            tyLeBungHtml = `
                <div style="font-size: 1.1rem; font-weight: bold; color: ${color};">${kh.ty_le_bung}%</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${kh.tong_bung_san} bùng / ${kh.tong_tran_da_chot} chốt</div>
                ${isNguyHiem ? `<div style="font-size:0.75rem; color:#ef4444; margin-top:2px;"><i class="fa-solid fa-triangle-exclamation"></i> Rủi ro cao</div>` : ''}
            `;
        }

        return `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #64748b;">
                            ${kh.HoTen.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <strong style="color: var(--text-dark);">${kh.HoTen}</strong><br>
                            <span style="font-size: 0.8rem; color: var(--text-muted);">ID: KH-${kh.ID}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <div><i class="fa-solid fa-phone" style="width: 16px; color: #94a3b8;"></i> ${kh.SoDienThoai}</div>
                    <div style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-solid fa-envelope" style="width: 16px; color: #94a3b8;"></i> ${kh.Email || 'Chưa cập nhật'}</div>
                </td>
                <td style="text-align: center;"><strong style="color: #047857; font-size: 1.05rem;">${Number(kh.SoDuVi).toLocaleString('vi-VN')}đ</strong></td>
                <td style="text-align: center;">${tyLeBungHtml}</td>
                <td style="text-align: center;">${statusBadge}</td>
                <td style="text-align: center;">
                    <button class="btn-outline-sm" onclick="renderChiTietKhachHang(${kh.ID})"><i class="fa-solid fa-eye"></i> Chi tiết</button>
                </td>
            </tr>
        `;
    }).join('');
}

// 2. Render Màn hình Chi tiết Khách hàng
async function renderChiTietKhachHang(id) {
    currentViewedKhachHangId = id;

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `<div style="text-align:center; padding: 50px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải thông tin...</div>`;

    try {
        const response = await fetch(`${API_BASE_URL}/admin/khach-hang/${id}`, { credentials: 'include' });
        const res = await response.json();
        
        if (!res.success) {
            contentArea.innerHTML = `<button class="btn-back" onclick="renderQuanLyKhachHang()"><i class="fa-solid fa-arrow-left"></i> Quay lại</button><div style="text-align:center; color:red; padding: 20px;">Lỗi: ${res.message}</div>`;
            return;
        }

        const kh = res.khach_hang;
        const dsDatSan = res.lich_su_dat_san;
        const dsGiaoDich = res.lich_su_giao_dich;

        currentKhachHangDatSan = dsDatSan;

        // Thống kê
        const tongTienNap = dsGiaoDich.filter(gd => gd.LoaiGiaoDich === 'NapTien' && gd.DongTien === 'Cong').reduce((sum, gd) => sum + Number(gd.SoTien), 0);
        
        // Cập nhật lại cách đếm dựa vào dữ liệu mới
        const soLanHoanThanh = dsDatSan.filter(ds => ds.TrangThai === 'HoanThanh').length;
        const soLanBung = dsDatSan.filter(ds => ds.TrangThai === 'KhongDen').length;
        const tongDaChot = soLanHoanThanh + soLanBung;
        const tyLeBung = tongDaChot > 0 ? Math.round((soLanBung / tongDaChot) * 100) : 0;

        // Nút Khóa/Mở Khóa
        const lockBtnHtml = kh.TrangThaiKhoa 
            ? `<button class="btn-primary" style="background: #16a34a; border-color: #16a34a;" onclick="openKhoaKhachHangModal(${kh.ID}, true)"><i class="fa-solid fa-unlock"></i> Mở khóa tài khoản</button>`
            : `<button class="btn-primary" style="background: #ef4444; border-color: #ef4444;" onclick="openKhoaKhachHangModal(${kh.ID}, false)"><i class="fa-solid fa-lock"></i> Khóa tài khoản</button>`;

        // Render HTML
        contentArea.innerHTML = `
            <button class="btn-back" onclick="renderQuanLyKhachHang()"><i class="fa-solid fa-arrow-left"></i> Quay lại danh sách</button>
            
            <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding: 24px; background: white; border-radius: 12px; box-shadow: var(--shadow-sm); border: 1px solid var(--border);">
                <div style="display: flex; align-items: center; gap: 20px;">
                    <div style="width: 70px; height: 70px; border-radius: 50%; background: var(--primary-light); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: bold;">
                        ${kh.HoTen.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h1 class="page-title" style="margin-bottom: 4px;">${kh.HoTen} ${kh.TrangThaiKhoa ? '<span class="badge badge-danger" style="vertical-align: middle; font-size: 0.8rem; margin-left: 8px;">Bị khóa</span>' : ''}</h1>
                        <div style="color: var(--text-muted); font-size: 0.95rem; display: flex; gap: 15px;">
                            <span><i class="fa-solid fa-phone"></i> ${kh.SoDienThoai}</span>
                            <span><i class="fa-solid fa-envelope"></i> ${kh.Email || 'N/A'}</span>
                        </div>
                    </div>
                </div>
                <div>
                    ${lockBtnHtml}
                </div>
            </div>

            <!-- Thống kê nhanh -->
            <div class="stat-grid" style="margin-bottom: 24px;">
                <div class="stat-card">
                    <div class="stat-title">Số dư ví hiện tại</div>
                    <div class="stat-value" style="color: #047857;">${Number(kh.SoDuVi).toLocaleString('vi-VN')}đ</div>
                </div>
                <div class="stat-card">
                    <div class="stat-title">Tổng tiền đã nạp</div>
                    <div class="stat-value" style="color: #4338ca;">${tongTienNap.toLocaleString('vi-VN')}đ</div>
                </div>
                <div class="stat-card">
                    <div class="stat-title">Tổng số trận đặt</div>
                    <div class="stat-value">${dsDatSan.length} trận</div>
                </div>
                <div class="stat-card">
                    <div class="stat-title">Tỷ lệ bùng sân</div>
                    <div class="stat-value" style="color: ${tyLeBung >= 30 ? '#ef4444' : '#047857'};">${tyLeBung}%</div>
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">(${soLanBung} bùng / ${tongDaChot} chốt)</div>
                </div>
            </div>

            <!-- Tabs Lịch sử -->
            <div class="panel">
                <div style="display: flex; gap: 20px; border-bottom: 1px solid var(--border);">
                    <button class="nav-tab active" onclick="switchKhachHangTab('tab-ls-datsan', this)" style="margin-left: 20px; padding: 12px 0; border: none; background: transparent; font-weight: 600; cursor: pointer; border-bottom: 2px solid var(--primary); color: var(--primary);">Lịch sử Đặt sân</button>
                    <button class="nav-tab" onclick="switchKhachHangTab('tab-ls-giaodich', this)" style="padding: 12px 0; border: none; background: transparent; font-weight: 600; cursor: pointer; color: var(--text-muted);">Lịch sử Giao dịch Ví</button>

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
    if (dsDatSan.length === 0) return `<tr><td colspan="4" class="text-center">Khách hàng chưa đặt sân nào.</td></tr>`;
    
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
    if (dsGiaoDich.length === 0) return `<tr><td colspan="4" class="text-center">Khách hàng chưa có giao dịch nào.</td></tr>`;
    
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

    document.getElementById('tab-ls-datsan').style.display = 'none';
    document.getElementById('tab-ls-giaodich').style.display = 'none';
    
    document.getElementById(tabId).style.display = 'block';

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
            credentials: 'include',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
        });
        
        const res = await response.json();
        
        if (response.ok && res.success) {
            alertBox.textContent = res.message;
            alertBox.className = 'modal-alert success';
            alertBox.style.display = 'block';
            alertBox.style.textAlign = 'center';

            // 1. Phục hồi ngay lập tức trạng thái nút bấm để lần sau không bị kẹt
            btn.innerHTML = 'Đồng ý';
            btn.disabled = false;

            // 2. Lưu lại ID khách hàng ra 1 biến tạm (tránh bị reset mất)
            const idToRender = pendingKhoaUserId;

            // 3. Đợi 1.5 giây cho Admin đọc thông báo rồi đóng Modal & Tải lại Profile
            setTimeout(() => {
                closeKhoaKhachHangModal(); // Đóng Modal và gán pendingKhoaUserId = null
                renderChiTietKhachHang(idToRender); // Dùng biến tạm để gọi API
            }, 1500);

        } else {
            alertBox.textContent = res.message || 'Có lỗi xảy ra!';
            alertBox.className = 'modal-alert error';
            alertBox.style.display = 'block';
            
            // Lỗi thì phục hồi nút bấm
            btn.innerHTML = 'Đồng ý';
            btn.disabled = false;
        }
    } catch (e) {
        alertBox.textContent = 'Lỗi kết nối máy chủ!';
        alertBox.className = 'modal-alert error';
        alertBox.style.display = 'block';
        
        // Lỗi thì phục hồi nút bấm
        btn.innerHTML = 'Đồng ý';
        btn.disabled = false;
    }
}

// ======================================================
// MODULE: ADMIN - TỔNG QUAN (DASHBOARD)
// ======================================================
async function renderTongQuan() {
    // 1. Cập nhật trạng thái Menu
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const menuLink = Array.from(document.querySelectorAll('.sidebar-nav a')).find(a => a.textContent.includes('TỔNG QUAN'));
    if (menuLink) menuLink.classList.add('active');

    const contentArea = document.querySelector('.admin-content');
    contentArea.innerHTML = `<div style="text-align:center; padding: 50px;"><i class="fa-solid fa-spinner fa-spin text-primary" style="font-size: 2rem;"></i><br><br>Đang tải dữ liệu tổng quan...</div>`;

    try {
        const response = await fetch(`${API_BASE_URL}/admin/thong-ke`, { credentials: 'include' });
        const res = await response.json();

        if (!res.success) throw new Error('Không thể tải dữ liệu');
        const data = res.data;

        // 2. Logic Cảnh Báo Quên Chốt Sân
        let alertHtml = '';
        if (data.so_san_quen_chot > 0) {

            const d = new Date();
            d.setDate(d.getDate() - 1);
            const pad = n => n < 10 ? '0' + n : n;
            const yesterday = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

            alertHtml = `
                <div style="background: #fef2f2; border: 1px solid #f87171; border-left: 4px solid #ef4444; color: #b91c1c; padding: 16px 20px; border-radius: 8px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 6px rgba(239, 68, 68, 0.1);">
                    <div>
                        <h4 style="margin: 0 0 4px 0; font-size: 1.05rem;"><i class="fa-solid fa-triangle-exclamation"></i> CẢNH BÁO: CHƯA CHỐT SÂN NGÀY HÔM QUA</h4>
                        <p style="margin: 0; font-size: 0.9rem;">Hệ thống phát hiện có <strong>${data.so_san_quen_chot}</strong> lịch đặt sân của ngày hôm qua vẫn đang ở trạng thái "Đã cọc". Vui lòng kiểm tra và chốt sân để không ảnh hưởng dữ liệu thống kê!</p>
                    </div>
                    <button onclick="renderQuanLyDatSan('DaCoc', '${yesterday}')" style="background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s; white-space: nowrap;">Xử lý ngay</button>
                </div>
            `;
        }

        // 3. Render Lưới 5 Booking mới nhất
        let recentBookingsHtml = '';
        if (data.recent_bookings.length === 0) {
            recentBookingsHtml = `<tr><td colspan="6" class="text-center" style="padding: 20px; color: var(--text-muted);">Chưa có dữ liệu.</td></tr>`;
        } else {
            recentBookingsHtml = data.recent_bookings.map(bk => {
                let badgeColor = '#6b7280', badgeBg = '#f3f4f6', viStatus = bk.TrangThai;
                if(bk.TrangThai === 'DaCoc') { badgeColor = '#b45309'; badgeBg = '#fef3c7'; viStatus = 'Đã cọc'; }
                else if(bk.TrangThai === 'DaHuy') { badgeColor = '#b91c1c'; badgeBg = '#fee2e2'; viStatus = 'Đã hủy'; }
                else if(bk.TrangThai === 'HoanThanh') { badgeColor = '#047857'; badgeBg = '#d1fae5'; viStatus = 'Hoàn thành'; }
                else if(bk.TrangThai === 'KhongDen') { badgeColor = '#6b7280'; badgeBg = '#f3f4f6'; viStatus = 'Không đến'; }
                const badgeHtml = `<span style="padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; background: ${badgeBg}; color: ${badgeColor};">${viStatus}</span>`;

                const d = new Date(bk.NgayDa);
                const dateStr = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
                const timeStr = bk.khung_gio ? `${bk.khung_gio.GioBatDau.substring(0,5)} - ${bk.khung_gio.GioKetThuc.substring(0,5)}` : '';
                
                return `
                    <tr>
                        <td><strong style="font-family: monospace;">#${bk.ID_GiaiDau ? 'GD-'+bk.ID_GiaiDau : 'PT-'+bk.ID}</strong></td>
                        <td>${bk.nguoi_dung ? bk.nguoi_dung.HoTen : 'N/A'}</td>
                        <td><strong style="color: var(--primary);">${bk.san_bong ? bk.san_bong.TenSan : 'N/A'}</strong><br><span style="font-size:0.8rem;color:var(--text-muted);"><i class="fa-solid fa-location-dot"></i> ${bk.san_bong && bk.san_bong.cum_san ? bk.san_bong.cum_san.TenCumSan : ''}</span></td>
                        <td>${dateStr}<br><strong style="font-size:0.85rem;color:var(--text-dark);">${timeStr}</strong></td>
                        <td>${badgeHtml}</td>
                    </tr>
                `;
            }).join('');
        }

        // 4. Bơm HTML vào Giao diện
        contentArea.innerHTML = `
            <div class="page-header" style="margin-bottom: 24px;">
                <h1 class="page-title">Tổng quan hệ thống</h1>
                <p class="text-muted">Thống kê nhanh các chỉ số hoạt động của DN FOOTBALL</p>
            </div>
            
            ${alertHtml}

            <div class="stat-grid" style="margin-bottom: 24px;">
                <div class="stat-card">
                    <div class="stat-title">Doanh thu hôm nay</div>
                    <div class="stat-value" style="color: #047857;">${Number(data.doanh_thu_hom_nay).toLocaleString('vi-VN')}đ</div>
                </div>
                <div class="stat-card">
                    <div class="stat-title">Tổng số trận hôm nay</div>
                    <div class="stat-value" style="color: #2563eb;">${data.booking_hoan_thanh_hom_nay}/${data.booking_hom_nay} trận</div>
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">(Hoàn thành / Đã chốt)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-title">Tổng Khách Hàng</div>
                    <div class="stat-value" style="color: #8b5cf6;">${data.tong_khach_hang} người</div>
                </div>
                <div class="stat-card">
                    <div class="stat-title">Yêu cầu chờ xử lý</div>
                    <div class="stat-value" style="color: #ea580c;">${data.cho_duyet} đơn</div>
                </div>
            </div>

            <div class="chart-layout" style="margin-bottom: 24px;">
                <div class="panel">
                    <div class="panel-header">Biểu đồ doanh thu 7 ngày gần nhất</div>
                    <canvas id="revenueChart" height="100"></canvas>
                </div>
            </div>

            <div class="panel">
                <div class="panel-header">
                    Booking mới nhất
                    <button class="btn-outline-sm" onclick="renderQuanLyDatSan('All', '')">Xem tất cả</button>
                </div>
                <div class="table-responsive">
                    <table class="admin-table">
                        <thead style="background: #F8FAFC;">
                            <tr>
                                <th>Mã Đặt</th>
                                <th>Khách hàng</th>
                                <th>Thông tin Sân</th>
                                <th>Ngày & Giờ</th>
                                <th>Trạng thái</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${recentBookingsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // 5. Cấu hình vẽ Chart.js
        const ctx = document.getElementById('revenueChart').getContext('2d');
        const labels = data.chart.map(c => c.ngay);
        const chartData = data.chart.map(c => c.doanh_thu);

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Doanh thu (VNĐ)',
                    data: chartData,
                    borderColor: '#16A34A',
                    backgroundColor: 'rgba(22, 163, 74, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        ticks: { callback: function(value) { return value.toLocaleString('vi-VN') + 'đ'; } } 
                    }
                }
            }
        });

    } catch (e) {
        contentArea.innerHTML = `<div style="text-align:center; color:red; padding: 50px;">Lỗi kết nối máy chủ! Không thể tải dữ liệu thống kê.</div>`;
    }
}