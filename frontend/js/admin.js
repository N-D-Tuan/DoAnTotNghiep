// ======================================================
// DN FOOTBALL - ADMIN
// ======================================================
const API_BASE_URL = 'http://127.0.0.1:8000/api';

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
        // KHỞI TẠO BIỂU ĐỒ
        // ==============================================
        const chartElement =
            document.getElementById(
                'revenueChart'
            );

        if (chartElement) {
            const ctx =
                chartElement.getContext(
                    '2d'
                );

            new Chart(
                ctx,
                {
                    type: 'line',
                    data: {
                        labels: [
                            '25/08',
                            '26/08',
                            '27/08',
                            '28/08',
                            '29/08',
                            '30/08',
                            '31/08'
                        ],

                        datasets: [{
                            label: 'Doanh thu (VNĐ)',
                            data: [
                                1500000,
                                2200000,
                                1800000,
                                3000000,
                                2800000,
                                4500000,
                                2500000
                            ],
                            borderColor: '#16A34A',
                            backgroundColor: 'rgba(22, 163, 74, 0.1)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.3
                        }]
                    },

                    options: {
                        responsive: true,
                        plugins: {
                            legend: {
                                display: false
                            }
                        },

                        scales: {
                            y: {
                                beginAtZero: true
                            }
                        }
                    }
                }
            );
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

async function deleteCumSan(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa Cụm Sân này?')) return;

    try {
        const response = await fetch(`${API_BASE_URL}/cum-san/${id}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
        });

        const data = await response.json();
        
        if (response.ok && data.success) {
            showCumSanAlert('Đã xóa Cụm Sân thành công!', true);
            //renderQuanLySan(); // Quay lại trang danh sách tổng
            renderCumSanDetail(currentCumSanId);
        } else {
            showCumSanAlert(data.message || 'Có lỗi khi xóa!', false);
        }
    } catch (error) {
        showCumSanAlert('Không thể kết nối máy chủ!', false);
    }
}

async function restoreCumSan(id) {
    if (!confirm('Bạn muốn mở lại hoạt động cho Cụm Sân này?')) return;
    try {
        const response = await fetch(`${API_BASE_URL}/cum-san/${id}/restore`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (response.ok && data.success) {
            showCumSanAlert('Đã khôi phục Cụm Sân!', true);
            //renderQuanLySan();
            renderCumSanDetail(currentCumSanId); 
        }
    } catch (error) {
        showCumSanAlert('Lỗi kết nối!', false);
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
                        <tr><td colspan="6" class="text-center">Đang tải dữ liệu...</td></tr>
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
                <p id="gd-confirm-msg" style="color: var(--text-muted); margin-bottom: 25px; line-height: 1.5;"></p>
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
        
        // Lọc tìm kiếm (Tên giải, Tên cụm sân, Tên khách hàng)
        const tenGiai = item.TenGiaiDau ? item.TenGiaiDau.toLowerCase() : '';
        const tenSan = item.cum_san ? item.cum_san.TenCumSan.toLowerCase() : '';
        const tenKhach = item.nguoi_dung ? item.nguoi_dung.HoTen.toLowerCase() : '';
        const matchSearch = tenGiai.includes(currentGDSearch) || tenSan.includes(currentGDSearch) || tenKhach.includes(currentGDSearch);

        return matchStatus && matchSearch;
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
    let html = '';
    
    // Nếu chỉ có 1 trang thì ẩn luôn thanh phân trang cho gọn
    if (totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }

    // Nút "Trang trước" (Mũi tên trái)
    const prevDisabled = currentGDPage === 1 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : '';
    html += `<button class="btn-outline-sm" ${prevDisabled} onclick="changeGDPage(${currentGDPage - 1})" style="padding: 6px 12px; border-color: var(--border); color: var(--text-dark);"><i class="fa-solid fa-chevron-left"></i></button>`;

    // Các nút Số trang
    for (let i = 1; i <= totalPages; i++) {
        // Nút active có màu nền xanh, nút thường viền mờ
        const btnClass = i === currentGDPage ? 'btn-primary' : 'btn-outline-sm';
        const style = i === currentGDPage ? 'padding: 6px 14px;' : 'padding: 6px 14px; border-color: var(--border); color: var(--text-dark);';
        html += `<button class="${btnClass}" style="${style}" onclick="changeGDPage(${i})">${i}</button>`;
    }

    // Nút "Trang sau" (Mũi tên phải)
    const nextDisabled = currentGDPage === totalPages ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : '';
    html += `<button class="btn-outline-sm" ${nextDisabled} onclick="changeGDPage(${currentGDPage + 1})" style="padding: 6px 12px; border-color: var(--border); color: var(--text-dark);"><i class="fa-solid fa-chevron-right"></i></button>`;

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

    document.getElementById('gd-confirm-modal').style.display = 'flex';
}

function closeGDConfirmModal() {
    document.getElementById('gd-confirm-modal').style.display = 'none';
    pendingActionId = null;
    pendingActionStatus = null;
}

async function executeCapNhatTrangThai() {
    if (!pendingActionId || !pendingActionStatus) return;
    
    const btn = document.getElementById('gd-confirm-btn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/admin/giai-dau/${pendingActionId}/xu-ly`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ trang_thai: pendingActionStatus })
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