const API_BASE_URL = 'http://127.0.0.1:8000/api';

const footballFields = [
    {
        id: 1,
        name: "Sân Đa Phước",
        location: "Đa Phước, Đà Nẵng",
        image: "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?q=80&w=600&auto=format&fit=crop",
        types: {
            five: ["Sân 1", "Sân 2", "Sân 3", "Sân 4", "Sân 5", "Sân 6"],
            seven: ["Sân 7", "Sân 8"]
        }
    },
    {
        id: 2,
        name: "Sân An Phúc",
        location: "Đà Nẵng",
        image: "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?q=80&w=600&auto=format&fit=crop",
        types: {
            five: ["Sân A", "Sân B", "Sân C"]
        }
    }
];

const timeSlots = ["17:00 - 18:00", "18:00 - 19:00", "19:00 - 20:00", "20:00 - 21:00", "21:00 - 22:00"];
const appContent = document.getElementById('app-content');

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

// Biến lưu trạng thái màn hình lịch đang được mở để cập nhật trực tiếp giao diện
let currentClusterId = null;
let currentPitchName = null;
let currentPitchType = null;

document.addEventListener('DOMContentLoaded', () => {

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

        loadCustomerInfo();
        renderClusters();
        setupDropdowns();
        updateFloatingCart();

        // ==========================================
        // LOGOUT
        // ==========================================
        const logoutButton =
            document.getElementById(
                'customer-logout-btn'
            );

        if (logoutButton) {
            logoutButton.addEventListener(
                'click',
                (e) => {
                    e.preventDefault();
                    logoutCustomer();
                }
            );
        }
    }
);

function setupDropdowns() {
    const btn = document.getElementById('user-menu-btn');
    const menu = document.getElementById('user-dropdown');
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('show');
    });
    document.addEventListener('click', () => menu.classList.remove('show'));
}

function saveToSession() {
    sessionStorage.setItem('dn_football_selected_slots', JSON.stringify(selectedSlots));
    updateFloatingCart();
}

function updateFloatingCart() {
    const cartBar = document.getElementById('floating-cart');
    const cartCount = document.getElementById('cart-count');
    
    if (selectedSlots.length > 0) {
        cartBar.style.display = 'block';
        cartCount.innerText = selectedSlots.length;
    } else {
        cartBar.style.display = 'none';
    }
}

function openCartModal() {
    const modal = document.getElementById('cart-modal');
    const modalList = document.getElementById('modal-cart-list');
    
    if (selectedSlots.length === 0) {
        modalList.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px;">Chưa có khung giờ nào được chọn.</p>`;
    } else {
        modalList.innerHTML = selectedSlots.map((s, index) => `
            <div class="cart-item-card">
                <div class="cart-item-info">
                    <h4>${s.clusterName} - ${s.pitchName}</h4>
                    <p>Ngày: ${s.date} | Giờ: <strong style="color: var(--primary);">${s.time}</strong></p>
                </div>
                <i class="fa-solid fa-trash-can cart-item-remove" onclick="removeSlotByIndex(${index})"></i>
            </div>
        `).join('');
    }
    modal.style.display = 'flex';
}

function closeCartModal() {
    document.getElementById('cart-modal').style.display = 'none';
}

function removeSlotByIndex(index) {
    selectedSlots.splice(index, 1);
    saveToSession();
    openCartModal();
    
    // Nếu người dùng đang đứng ở trang lịch của sân vừa bị xóa, cập nhật lại giao diện bảng lịch ngay lập tức
    if (currentClusterId !== null && currentPitchName !== null) {
        renderSchedule(currentClusterId, currentPitchName, currentPitchType);
    }
}

function clearAllSlots() {
    selectedSlots = [];
    saveToSession();
    closeCartModal();
    
    // Cập nhật lại giao diện bảng lịch ngay lập tức nếu đang hiển thị
    if (currentClusterId !== null && currentPitchName !== null) {
        renderSchedule(currentClusterId, currentPitchName, currentPitchType);
    }
}

function checkoutBooking() {
    selectedSlots = [];
    saveToSession();
    closeCartModal();
    
    if (currentClusterId !== null && currentPitchName !== null) {
        renderSchedule(currentClusterId, currentPitchName, currentPitchType);
    } else {
        renderClusters();
    }
}

function renderClusters() {
    currentClusterId = null;
    currentPitchName = null;
    currentPitchType = null;

    let html = `
        <div class="page-header">
            <h1 class="page-title">Hệ thống sân bóng DN FOOTBALL</h1>
            <p class="page-subtitle">Chọn cụm sân bạn muốn đặt lịch thi đấu</p>
        </div>
        <div class="cluster-grid">
    `;

    footballFields.forEach(cluster => {
        const totalPitches = (cluster.types.five?.length || 0) + (cluster.types.seven?.length || 0);
        html += `
            <div class="cluster-card" onclick="renderPitches(${cluster.id})">
                <div class="cluster-img-box">
                    <img src="${cluster.image}" alt="${cluster.name}" class="cluster-img">
                </div>
                <div class="cluster-info">
                    <div class="cluster-name">${cluster.name}</div>
                    <div class="cluster-address"><i class="fa-solid fa-location-dot" style="color: var(--primary);"></i> ${cluster.location}</div>
                    <div class="cluster-meta"><i class="fa-solid fa-futbol"></i> ${totalPitches} sân khả dụng</div>
                    <button class="btn-outline">XEM DANH SÁCH SÂN &rarr;</button>
                </div>
            </div>
        `;
    });
    html += `</div>`;
    appContent.innerHTML = html;
}

function renderPitches(clusterId) {
    currentClusterId = clusterId;
    currentPitchName = null;
    currentPitchType = null;

    const cluster = footballFields.find(c => c.id === clusterId);
    let html = `
        <div class="back-btn" onclick="renderClusters()">
            <i class="fa-solid fa-arrow-left"></i> Quay lại danh sách cụm sân
        </div>
        <div class="page-header">
            <h1 class="page-title">${cluster.name}</h1>
            <p class="page-subtitle"><i class="fa-solid fa-location-dot" style="color: var(--primary);"></i> ${cluster.location}</p>
        </div>
    `;

    if(cluster.types.five && cluster.types.five.length > 0) {
        html += `<div class="pitch-section"><div class="pitch-section-title">SÂN 5 NGƯỜI</div><div class="pitch-grid">`;
        cluster.types.five.forEach(pitchName => {
            html += `
                <div class="pitch-card" onclick="renderSchedule(${cluster.id}, '${pitchName}', '5 người')">
                    <div class="pitch-name">${pitchName}</div>
                    <div class="pitch-type">Sân 5 người</div>
                    <button class="btn-outline" style="width: 100%; padding: 8px;">XEM LỊCH &rarr;</button>
                </div>`;
        });
        html += `</div></div>`;
    }

    if(cluster.types.seven && cluster.types.seven.length > 0) {
        html += `<div class="pitch-section"><div class="pitch-section-title">SÂN 7 NGƯỜI</div><div class="pitch-grid">`;
        cluster.types.seven.forEach(pitchName => {
            html += `
                <div class="pitch-card" onclick="renderSchedule(${cluster.id}, '${pitchName}', '7 người')">
                    <div class="pitch-name">${pitchName}</div>
                    <div class="pitch-type">Sân 7 người</div>
                    <button class="btn-outline" style="width: 100%; padding: 8px;">XEM LỊCH &rarr;</button>
                </div>`;
        });
        html += `</div></div>`;
    }

    appContent.innerHTML = html;
}

function renderSchedule(clusterId, pitchName, pitchType) {
    currentClusterId = clusterId;
    currentPitchName = pitchName;
    currentPitchType = pitchType;

    const cluster = footballFields.find(c => c.id === clusterId);
    
    const today = new Date();
    const next7Days = [];
    for(let i = 0; i < 7; i++) {
        let d = new Date(today);
        d.setDate(today.getDate() + i);
        next7Days.push({
            short: d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
            full: d.toLocaleDateString('vi-VN')
        });
    }

    let html = `
        <div class="back-btn" onclick="renderPitches(${clusterId})">
            <i class="fa-solid fa-arrow-left"></i> Quay lại ${cluster.name}
        </div>
        <div style="font-size: 0.875rem; color: var(--text-muted); margin: 12px 0;">
            Sân bóng &gt; ${cluster.name} &gt; <strong>${pitchName}</strong>
        </div>
        <div class="page-header" style="margin-top: 10px;">
            <h1 class="page-title">${pitchName}</h1>
            <p class="page-subtitle">Loại sân: ${pitchType} | Chọn các khung giờ bên dưới để đặt lịch</p>
        </div>
        
        <div class="schedule-container">
            <table class="schedule-table">
                <thead>
                    <tr>
                        <th>Khung giờ</th>
                        ${next7Days.map(d => `<th>${d.short}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
    `;

    timeSlots.forEach((time, timeIndex) => {
        html += `<tr><td><strong>${time}</strong></td>`;
        next7Days.forEach((date, dateIndex) => {
            const slotId = `${cluster.name}-${pitchName}-${date.full}-${time}`;
            const isBooked = (timeIndex + dateIndex) % 4 === 0; 
            const isSelected = selectedSlots.some(s => s.id === slotId);
            
            let statusClass = 'available';
            let statusText = 'CÒN TRỐNG';
            
            if (isBooked) {
                statusClass = 'booked';
                statusText = 'Đã đặt';
            } else if (isSelected) {
                statusClass = 'available selected';
                statusText = 'ĐÃ CHỌN ✓';
            }
            
            html += `
                <td>
                    <div class="slot ${statusClass}" 
                         ${!isBooked ? `onclick="toggleSlot(this, ${cluster.id}, '${cluster.name}', '${pitchName}', '${date.full}', '${time}')"` : ''}>
                        ${statusText}
                    </div>
                </td>
            `;
        });
        html += `</tr>`;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;
    appContent.innerHTML = html;
}

function toggleSlot(element, clusterId, clusterName, pitchName, date, time) {
    if (element.classList.contains('booked')) return;

    const slotId = `${clusterName}-${pitchName}-${date}-${time}`;
    const existingIndex = selectedSlots.findIndex(s => s.id === slotId);
    
    if (existingIndex > -1) {
        selectedSlots.splice(existingIndex, 1);
        element.classList.remove('selected');
        element.innerText = 'CÒN TRỐNG';
    } else {
        selectedSlots.push({ id: slotId, clusterId, clusterName, pitchName, date, time });
        element.classList.add('selected');
        element.innerText = 'ĐÃ CHỌN ✓';
    }
    saveToSession();
}

function renderMyBookings() {
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