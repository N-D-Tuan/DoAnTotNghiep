
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

// ======================================================
// MODULE: DỜI LỊCH ĐẶT SÂN DÀNH CHO QUẢN LÝ SÂN & ADMIN (REALTIME + CONFIRM MODAL)
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
    const sourceList = (typeof allDatSanData !== 'undefined' && allDatSanData.length > 0)
        ? allDatSanData
        : (typeof staffDatSanData !== 'undefined' ? staffDatSanData : []);

    const item = sourceList.find(b => String(b.ID) === String(bookingId) || String(b.MaDatSan) === String(bookingId));
    if (!item) return;

    const clusterId = item.san_bong ? (item.san_bong.MaCumSan || item.san_bong.ID_CumSan) : null;
    const clusterName = item.san_bong?.cum_san?.TenCumSan || 'Cơ sở hiện tại';
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
    const sourceList = (typeof allDatSanData !== 'undefined' && allDatSanData.length > 0)
        ? allDatSanData
        : (typeof staffDatSanData !== 'undefined' ? staffDatSanData : []);
    const maHD = item.MaHoaDonDatSan;
    const hdObj = item.hoa_don_dat_san || item.hoaDonDatSan || null;
    const invoiceMatches = maHD
        ? sourceList.filter(m => m.MaHoaDonDatSan === maHD)
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
            if (typeof loadDanhSachDatSanAdmin === 'function' && document.getElementById('datsan-table-body')) {
                loadDanhSachDatSanAdmin();
            }
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