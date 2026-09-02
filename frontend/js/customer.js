const API_BASE_URL = 'http://127.0.0.1:8000/api';
const appContent = document.getElementById('app-content');

let currentClusterId = null;
let currentClusterName = null;
let currentClusterAddress = null;
let currentClusterGioMo = null;
let currentClusterGioDong = null;
let currentPitchId = null;
let currentPitchName = null;
let currentLoaiSanId = null;
let currentPitchType = null;

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

    const alertBox = document.getElementById('cart-alert');
    if (alertBox) alertBox.style.display = 'none';
    
    if (selectedSlots.length === 0) {
        modalList.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px;">Chưa có khung giờ nào được chọn.</p>`;
    } else {
        let totalAmount = selectedSlots.reduce((sum, s) => sum + Number(s.price), 0);
        modalList.innerHTML = selectedSlots.map((s, index) => `
            <div class="cart-item-card">
                <div class="cart-item-info">
                    <h4>${s.clusterName} - ${s.pitchName}</h4>
                    <p>Ngày: ${s.date} | Giờ: <strong style="color: var(--primary);">${s.time}</strong></p>
                    <p>Giá: <strong>${Number(s.price).toLocaleString('vi-VN')}đ</strong></p>
                </div>
                <i class="fa-solid fa-trash-can cart-item-remove" onclick="removeSlotByIndex(${index})"></i>
            </div>
        `).join('') + `
            <div style="text-align:right; margin-top: 15px; font-size: 1.1rem; border-top: 1px dashed #ccc; padding-top: 10px;">
                <strong>Tổng cộng: <span style="color: var(--primary);">${totalAmount.toLocaleString('vi-VN')}đ</span></strong>
            </div>
        `;
    }
    modal.style.display = 'flex';
}

function closeCartModal() {
    document.getElementById('cart-modal').style.display = 'none';

    const alertBox = document.getElementById('cart-alert');
    if (alertBox) alertBox.style.display = 'none';
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
                showCartAlert(`Cụm sân "${clusterName}" đang bảo trì hoặc ngừng hoạt động!`, false);
                
                // Chờ 3 giây để khách đọc thông báo rồi xóa giỏ hàng & chuyển hướng
                setTimeout(() => {
                    clearAllSlots();
                    renderClusters();
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
    currentClusterId = null; currentPitchName = null; currentPitchId = null;
    appContent.innerHTML = `<div style="text-align:center; padding: 50px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải danh sách sân...</div>`;

    try {
        const response = await fetch(`${API_BASE_URL}/cum-san`);
        const res = await response.json();
        
        // 1. NGHIỆP VỤ: Chỉ hiển thị các sân KHÔNG BỊ XÓA MỀM
        const activeClusters = res.data.filter(c => c.deleted_at === null);

        let html = `
            <div class="page-header">
                <h1 class="page-title">Hệ thống sân bóng DN FOOTBALL</h1>
                <p class="page-subtitle">Chọn cụm sân bạn muốn đặt lịch thi đấu</p>
            </div>
            <div class="cluster-grid">
        `;

        if (activeClusters.length === 0) {
            html += `<div style="grid-column: 1/-1; text-align:center; color: var(--text-muted);">Hiện chưa có cụm sân nào hoạt động.</div>`;
        }

        activeClusters.forEach(cluster => {
            const imgUrl = cluster.HinhAnh ? `http://127.0.0.1:8000${cluster.HinhAnh}` : 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?q=80&w=600&auto=format&fit=crop';
            html += `
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
        html += `</div>`;
        appContent.innerHTML = html;
    } catch (error) {
        appContent.innerHTML = `<div style="text-align:center; color:red;">Lỗi tải dữ liệu máy chủ!</div>`;
    }
}

async function renderPitches(clusterId, clusterName, clusterAddress, gioMo, gioDong) {
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
        const [gtRes, kgRes] = await Promise.all([
            fetch(`${API_BASE_URL}/gia-tien?cum_san_id=${clusterId}`),
            fetch(`${API_BASE_URL}/khung-gio`)
        ]);
        
        const giaTienData = (await gtRes.json()).data || [];
        const allKhungGio = (await kgRes.json()).data || [];

        // Lọc ra các khung giờ đã được set Giá cho đúng Loại sân này
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

        // Tạo ngày (7 ngày tới)
        const today = new Date();
        const next7Days = [];
        for(let i = 0; i < 7; i++) {
            let d = new Date(today); d.setDate(today.getDate() + i);
            next7Days.push({
                short: d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
                full: d.toLocaleDateString('vi-VN') // Định dạng: DD/MM/YYYY
            });
        }

        let html = `
            <div class="back-btn" onclick="renderPitches(${currentClusterId}, '${currentClusterName}', '${currentClusterAddress}', '${currentClusterGioMo}', '${currentClusterGioDong}')">
                <i class="fa-solid fa-arrow-left"></i> Quay lại ${currentClusterName}
            </div>
            <div style="font-size: 0.875rem; color: var(--text-muted); margin: 12px 0;">
                Sân bóng &gt; ${currentClusterName} &gt; <strong>${pitchName}</strong>
            </div>
            <div class="page-header" style="margin-top: 10px;">
                <h1 class="page-title">${pitchName}</h1>
                <p class="page-subtitle">Loại sân: ${pitchType} | Chọn các khung giờ bên dưới để đặt lịch</p>
            </div>
            
            <div class="schedule-container">
                <table class="schedule-table">
                    <thead style="position: sticky; top: 0; background: #F8FAFC; z-index: 1;">
                        <tr>
                            <th>Khung giờ</th>
                            <th>Giá tiền</th>
                            ${next7Days.map(d => `<th>${d.short}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        // Lấy thời gian hiện tại của hệ thống để làm chuẩn so sánh
        const now = new Date();

        availableTimeSlots.forEach((kg) => {
            const priceInfo = validPrices.find(p => p.ID_KhungGio == kg.ID);
            const priceValue = priceInfo ? priceInfo.SoTien : 0;
            const timeStr = `${kg.GioBatDau.substring(0,5)} - ${kg.GioKetThuc.substring(0,5)}`;

            html += `<tr>
                        <td><strong>${timeStr}</strong></td>
                        <td style="color: var(--primary); font-weight: 600;">${Number(priceValue).toLocaleString('vi-VN')}đ</td>`;
                        
            next7Days.forEach((date) => {
                const slotId = `${clusterName}-${pitchName}-${date.full}-${timeStr}`;
                const isBooked = false; // Tạm thời để trống đợi API Đặt sân
                const isSelected = selectedSlots.some(s => s.id === slotId);
                
                // --- BẮT ĐẦU LOGIC KIỂM TRA QUÁ GIỜ ---
                // Tách chuỗi ngày DD/MM/YYYY và giờ HH:mm:ss để tạo object Date của slot
                const [day, month, year] = date.full.split('/');
                const [startHour, startMinute] = kg.GioBatDau.split(':');
                const slotDateTime = new Date(year, month - 1, day, startHour, startMinute);
                
                // Nếu thời gian bắt đầu của ca <= thời gian hiện tại -> Đã quá giờ
                const isPast = slotDateTime <= now; 
                // ----------------------------------------
                
                let statusClass = 'available', statusText = 'CÒN TRỐNG';
                
                if (isPast) {
                    statusClass = 'booked'; // Dùng chung style mờ của booked
                    statusText = 'Quá giờ';
                } else if (isBooked) { 
                    statusClass = 'booked'; 
                    statusText = 'Đã đặt'; 
                } else if (isSelected) { 
                    statusClass = 'available selected'; 
                    statusText = 'ĐÃ CHỌN ✓'; 
                }
                
                // Chỉ gán sự kiện onclick nếu khung giờ đó chưa bị đặt và chưa bị quá giờ
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
        html += `</tbody></table></div>`;
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