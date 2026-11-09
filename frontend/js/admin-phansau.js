
// ======================================================
// LOGIC: CẤU HÌNH CA LÀM VIỆC LINH HOẠT (TÙY Ý SỐ LƯỢNG CA & GIỜ GIAO CA)
// ======================================================
let tempShiftConfigs = [];
let clusterOpenTime = '06:00';
let clusterCloseTime = '22:00';

// Tạo danh sách các mốc giờ (cách nhau 30 phút) nằm giữa Giờ mở cửa và Giờ đóng cửa
function getAvailableTimeOptions(selectedVal = '') {
    const [openH, openM] = clusterOpenTime.split(':').map(Number);
    const [closeH, closeM] = clusterCloseTime.split(':').map(Number);
    const startMins = openH * 60 + openM;
    const endMins = closeH * 60 + closeM;

    let html = '';
    for (let m = startMins + 30; m <= endMins - 30; m += 30) {
        const hh = String(Math.floor(m / 60)).padStart(2, '0');
        const mm = String(m % 60).padStart(2, '0');
        const timeStr = `${hh}:${mm}`;
        html += `<option value="${timeStr}" ${timeStr === selectedVal ? 'selected' : ''}>${timeStr}</option>`;
    }
    return html;
}

async function openCauHinhCaModal() {
    let modal = document.getElementById('dynamic-cauhinh-ca-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'dynamic-cauhinh-ca-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10000; align-items: center; justify-content: center;';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 820px; width: 95%; padding: 0; border-radius: 14px; overflow: hidden;">
            <div class="modal-header" style="padding: 18px 24px; background: #f8fafc; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h3 style="margin: 0; font-size: 1.2rem; color: var(--text-dark);"><i class="fa-solid fa-sliders" style="color: var(--primary); margin-right: 8px;"></i> Cấu hình Ca làm việc & Giờ giao ca</h3>
                    <div id="shift-config-subtitle" style="font-size: 0.82rem; color: var(--text-muted); margin-top: 3px;">Đang tải thông tin cụm sân...</div>
                </div>
                <i class="fa-solid fa-xmark" style="cursor: pointer; font-size: 1.2rem; color: var(--text-muted);" onclick="closeCauHinhCaModal()"></i>
            </div>

            <div id="dynamic-cauhinh-alert" class="modal-alert" style="display: none; margin: 14px 24px 0;"></div>

            <div class="modal-body" style="padding: 20px 24px; max-height: 68vh; overflow-y: auto;">
                <div style="background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; padding: 10px 14px; border-radius: 8px; font-size: 0.84rem; color: #92400e; margin-bottom: 16px; line-height: 1.5;">
                    <i class="fa-solid fa-circle-info"></i> <strong>Quy tắc áp dụng:</strong> Giờ kết thúc của ca trước chính là <strong>giờ giao ca</strong> (bắt đầu của ca kế tiếp). Nếu <strong>Tuần Hiện Tại</strong> đã có lịch duyệt, cấu hình mới sẽ được áp dụng cho các tuần trống (như <strong>Tuần Sau</strong>) để không làm xáo trộn lịch đang chạy.
                </div>

                <div id="shift-config-rows-container">
                    <div style="text-align: center; padding: 30px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>
                </div>

                <div style="margin-top: 14px; display: flex; justify-content: space-between; align-items: center;">
                    <button type="button" class="btn-outline-sm" style="color: var(--primary); border-color: var(--primary); background: #f0fdf4; padding: 8px 16px;" onclick="addNewShiftRow()">
                        <i class="fa-solid fa-plus"></i> Thêm ca làm việc
                    </button>
                    <span style="font-size: 0.82rem; color: var(--text-muted);">* Bạn có thể thiết lập 1, 2, 3 hoặc nhiều ca tùy ý</span>
                </div>
            </div>

            <div class="modal-footer" style="padding: 16px 24px; background: #f8fafc; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; align-items: center; gap: 12px;">
                <button type="button" onclick="closeCauHinhCaModal()" style="padding: 10px 22px; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-weight: 600; font-size: 0.92rem; cursor: pointer; transition: all 0.2s ease;" onmouseover="this.style.background='#f1f5f9'; this.style.borderColor='#94a3b8'; this.style.color='#0f172a';" onmouseout="this.style.background='#ffffff'; this.style.borderColor='#cbd5e1'; this.style.color='#475569';">
                    Hủy bỏ
                </button>
                <button type="button" id="btn-save-dynamic-shifts" class="btn-primary" style="padding: 10px 24px; border-radius: 8px; font-weight: 600; font-size: 0.92rem;" onclick="submitCauHinhCa()">
                    <i class="fa-solid fa-floppy-disk" style="margin-right: 6px;"></i> Lưu cấu hình ca
                </button>
         </div>
        </div>
    `;

    modal.style.display = 'flex';

    try {
        const response = await fetch(`${API_BASE_URL}/ca-lam-viec?mode=config`);
        const res = await response.json();

        clusterOpenTime = res.gio_mo_cua || '06:00';
        clusterCloseTime = res.gio_dong_cua || '22:00';

        document.getElementById('shift-config-subtitle').innerHTML = `Khung giờ hoạt động của cơ sở: <strong style="color: var(--primary);">${clusterOpenTime} - ${clusterCloseTime}</strong>`;

        if (res.success && res.data && res.data.length > 0) {
            tempShiftConfigs = res.data.map(c => ({
                ID: c.ID,
                TenCa: c.TenCa,
                GioBatDau: c.GioBatDau.substring(0, 5),
                GioKetThuc: c.GioKetThuc.substring(0, 5),
                SoLuongNhanVien: c.SoLuongNhanVien,
                LuongThuNgan: Number(c.LuongThuNgan),
                LuongPhucVu: Number(c.LuongPhucVu)
            }));
            // Đảm bảo ca đầu và ca cuối khớp giờ mở/đóng cửa
            tempShiftConfigs[0].GioBatDau = clusterOpenTime;
            tempShiftConfigs[tempShiftConfigs.length - 1].GioKetThuc = clusterCloseTime;
        } else {
            // Mặc định gợi ý 2 ca nếu cơ sở chưa cấu hình lần nào
            tempShiftConfigs = [
                { ID: null, TenCa: 'Ca Sáng', GioBatDau: clusterOpenTime, GioKetThuc: '15:00', SoLuongNhanVien: 2, LuongThuNgan: 170000, LuongPhucVu: 150000 },
                { ID: null, TenCa: 'Ca Tối', GioBatDau: '15:00', GioKetThuc: clusterCloseTime, SoLuongNhanVien: 3, LuongThuNgan: 170000, LuongPhucVu: 150000 }
            ];
        }

        renderShiftConfigRows();
    } catch (e) {
        showCauHinhCaAlert('Không thể tải dữ liệu cấu hình ca!', false);
    }
}

function renderShiftConfigRows() {
    const container = document.getElementById('shift-config-rows-container');
    if (!container) return;

    const total = tempShiftConfigs.length;

    let html = `
        <div style="display: flex; flex-direction: column; gap: 12px;">
    `;

    tempShiftConfigs.forEach((shift, idx) => {
        const isLast = (idx === total - 1);

        // Giờ bắt đầu luôn tự động nối với Giờ kết thúc của ca liền trước (Ca đầu tiên là Giờ mở cửa)
        const startDisplay = `<input type="text" class="form-control" value="${shift.GioBatDau}" disabled style="background: #f1f5f9; font-weight: 700; color: #334155; text-align: center;">`;

        // Giờ kết thúc (= Giờ giao ca sang ca tiếp theo). Riêng ca cuối cùng khóa cứng bằng Giờ đóng cửa
        let endDisplay = '';
        if (isLast) {
            endDisplay = `<input type="text" class="form-control" value="${clusterCloseTime}" disabled style="background: #f1f5f9; font-weight: 700; color: #334155; text-align: center;" title="Ca cuối kết thúc vào giờ đóng cửa sân">`;
        } else {
            endDisplay = `
                <select class="form-control" style="font-weight: 700; color: var(--primary); border-color: #86efac; background: #f0fdf4; text-align: center; cursor: pointer;" onchange="handleHandoverTimeChange(${idx}, this.value)" title="Chọn giờ giao ca sang ca kế tiếp">
                    ${getAvailableTimeOptions(shift.GioKetThuc)}
                </select>
            `;
        }

        const removeBtn = total > 1
            ? `<button type="button" onclick="removeShiftRow(${idx})" style="background: #fef2f2; color: #ef4444; border: 1px solid #fecaca; width: 36px; height: 38px; border-radius: 8px; cursor: pointer;" title="Xóa ca này"><i class="fa-solid fa-trash-can"></i></button>`
            : `<button type="button" disabled style="background: #f1f5f9; color: #cbd5e1; border: 1px solid #e2e8f0; width: 36px; height: 38px; border-radius: 8px; cursor: not-allowed;"><i class="fa-solid fa-trash-can"></i></button>`;

        html += `
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                <div style="display: grid; grid-template-columns: 1.3fr 0.9fr 1fr 0.8fr 1.1fr 1.1fr auto; gap: 10px; align-items: end;">
                    <div>
                        <label style="font-size: 0.78rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Tên ca #${idx + 1}</label>
                        <input type="text" class="form-control" value="${shift.TenCa}" placeholder="VD: Ca Chiều" oninput="tempShiftConfigs[${idx}].TenCa = this.value">
                    </div>
                    <div>
                        <label style="font-size: 0.78rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Bắt đầu</label>
                        ${startDisplay}
                    </div>
                    <div>
                        <label style="font-size: 0.78rem; font-weight: 600; color: ${isLast ? '#475569' : 'var(--primary)'}; display: block; margin-bottom: 4px;">
                            ${isLast ? 'Đóng cửa' : '<i class="fa-solid fa-clock-rotate-left"></i> Giờ giao ca'}
                        </label>
                        ${endDisplay}
                    </div>
                    <div>
                        <label style="font-size: 0.78rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Số NV</label>
                        <input type="number" class="form-control" min="1" value="${shift.SoLuongNhanVien}" oninput="tempShiftConfigs[${idx}].SoLuongNhanVien = this.value">
                    </div>
                    <div>
                        <label style="font-size: 0.78rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Lương Thu Ngân</label>
                        <input type="number" class="form-control" min="1000" step="5000" value="${shift.LuongThuNgan}" oninput="tempShiftConfigs[${idx}].LuongThuNgan = this.value">
                    </div>
                    <div>
                        <label style="font-size: 0.78rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Lương Phục Vụ</label>
                        <input type="number" class="form-control" min="1000" step="5000" value="${shift.LuongPhucVu}" oninput="tempShiftConfigs[${idx}].LuongPhucVu = this.value">
                    </div>
                    <div>
                        ${removeBtn}
                    </div>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
}

// Khi đổi Giờ giao ca của ca thứ idx -> Tự động cập nhật Giờ bắt đầu của ca (idx + 1) nối tiếp ngay lập tức
window.handleHandoverTimeChange = function(idx, newTime) {
    tempShiftConfigs[idx].GioKetThuc = newTime;
    if (idx + 1 < tempShiftConfigs.length) {
        tempShiftConfigs[idx + 1].GioBatDau = newTime;
    }
    renderShiftConfigRows();
};

// Chia đều khoảng giờ tự động khi Thêm hoặc Xóa ca để Quản lý tiện chỉnh
function redistributeShiftTimes() {
    const [openH, openM] = clusterOpenTime.split(':').map(Number);
    const [closeH, closeM] = clusterCloseTime.split(':').map(Number);
    const startMins = openH * 60 + openM;
    const endMins = closeH * 60 + closeM;
    const count = tempShiftConfigs.length;
    const step = Math.floor((endMins - startMins) / count / 30) * 30;

    for (let i = 0; i < count; i++) {
        if (i === 0) {
            tempShiftConfigs[i].GioBatDau = clusterOpenTime;
        } else {
            tempShiftConfigs[i].GioBatDau = tempShiftConfigs[i - 1].GioKetThuc;
        }

        if (i === count - 1) {
            tempShiftConfigs[i].GioKetThuc = clusterCloseTime;
        } else {
            const nextMin = startMins + step * (i + 1);
            const hh = String(Math.floor(nextMin / 60)).padStart(2, '0');
            const mm = String(nextMin % 60).padStart(2, '0');
            tempShiftConfigs[i].GioKetThuc = `${hh}:${mm}`;
        }
    }
}

window.addNewShiftRow = function() {
    const defaultNames = ['Ca Sáng', 'Ca Chiều', 'Ca Tối', 'Ca Đêm'];
    const nextIdx = tempShiftConfigs.length;
    const suggestedName = defaultNames[nextIdx] || `Ca ${nextIdx + 1}`;
    const lastShift = tempShiftConfigs[tempShiftConfigs.length - 1] || { SoLuongNhanVien: 2, LuongThuNgan: 170000, LuongPhucVu: 150000 };

    tempShiftConfigs.push({
        ID: null,
        TenCa: suggestedName,
        GioBatDau: '12:00',
        GioKetThuc: clusterCloseTime,
        SoLuongNhanVien: lastShift.SoLuongNhanVien,
        LuongThuNgan: lastShift.LuongThuNgan,
        LuongPhucVu: lastShift.LuongPhucVu
    });

    if (tempShiftConfigs.length === 3) {
        tempShiftConfigs[0].TenCa = 'Ca Sáng';
        tempShiftConfigs[1].TenCa = 'Ca Chiều';
        tempShiftConfigs[2].TenCa = 'Ca Tối';
    }

    redistributeShiftTimes();
    renderShiftConfigRows();
};

window.removeShiftRow = function(idx) {
    if (tempShiftConfigs.length <= 1) return;
    tempShiftConfigs.splice(idx, 1);
    redistributeShiftTimes();
    renderShiftConfigRows();
};

function showCauHinhCaAlert(msg, isSuccess) {
    const alert = document.getElementById('dynamic-cauhinh-alert');
    if (!alert) return;
    alert.textContent = msg;
    alert.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alert.style.display = 'block';
    setTimeout(() => { alert.style.display = 'none'; }, 3500);
}

function closeCauHinhCaModal() {
    const modal = document.getElementById('dynamic-cauhinh-ca-modal');
    if (modal) modal.style.display = 'none';
}

async function submitCauHinhCa() {
    for (let i = 0; i < tempShiftConfigs.length; i++) {
        const s = tempShiftConfigs[i];
        if (!s.TenCa || !String(s.TenCa).trim()) {
            return showCauHinhCaAlert(`Vui lòng nhập tên cho ca thứ ${i + 1}!`, false);
        }
        if (s.GioBatDau >= s.GioKetThuc) {
            return showCauHinhCaAlert(`Ca "${s.TenCa}": Giờ giao ca/kết thúc (${s.GioKetThuc}) phải sau giờ bắt đầu (${s.GioBatDau})!`, false);
        }
        if (!s.SoLuongNhanVien || Number(s.SoLuongNhanVien) <= 0) {
            return showCauHinhCaAlert(`Ca "${s.TenCa}": Số lượng nhân viên phải lớn hơn 0!`, false);
        }
        if (!s.LuongThuNgan || Number(s.LuongThuNgan) <= 0 || !s.LuongPhucVu || Number(s.LuongPhucVu) <= 0) {
            return showCauHinhCaAlert(`Ca "${s.TenCa}": Mức lương phải lớn hơn 0!`, false);
        }
    }

    const btn = document.getElementById('btn-save-dynamic-shifts');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/ca-lam-viec`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ shifts: tempShiftConfigs })
        });

        const data = await response.json();
        if (response.ok && data.success) {
            showCauHinhCaAlert(data.message, true);
            setTimeout(() => {
                closeCauHinhCaModal();
                const activeTab = document.querySelector('.nav-tab.active')?.innerText || '';
                if (activeTab.includes('Tuần Hiện Tại')) {
                    loadAdminCalendarData(0, 'grid-current-week');
                } else if (activeTab.includes('Tuần Sau')) {
                    loadAdminCalendarData(1, 'grid-next-week');
                }
            }, 1400);
        } else {
            showCauHinhCaAlert(data.message || 'Lỗi khi lưu cấu hình ca!', false);
        }
    } catch (e) {
        showCauHinhCaAlert('Mất kết nối máy chủ!', false);
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk" style="margin-right: 6px;"></i> Lưu cấu hình ca';
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
let pendingQuickChotVangId = null;

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
        const tenNV = (nv.HoTen || 'Nhân viên').replace(/'/g, "\\'");
        const tenCa = (ca.TenCa || 'Ca làm việc').replace(/'/g, "\\'");

        // Nút Chốt vắng nhanh (chỉ hiện khi ChuaLam và đã quá giờ bắt đầu ca) -> Mở Modal Xác Nhận
        if (item.TrangThaiDiemDanh === 'ChuaLam') {
            actionBtn += `
                <button type="button" class="btn-outline-sm" style="color: #ef4444; border-color: #fecaca; background: #fef2f2; padding: 6px 12px; font-weight: 600; margin-right: 6px; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fef2f2'" onclick="openChotVangConfirmModal('${item.ID}', '${tenNV}', '${tenCa}', '${timeStr}')">
                    <i class="fa-solid fa-user-xmark"></i> Chốt vắng
                </button>
            `;
        }
        
        // Nút mở Modal để tuỳ chỉnh Đi/Nghỉ, Phạt, Thưởng
        actionBtn += `<button type="button" class="btn-outline-sm" style="padding: 6px 12px; font-weight: 600; cursor: pointer;" onclick='openModalChotCong(${itemJsonStr})'><i class="fa-solid fa-pen"></i> Chốt / Sửa công</button>`;

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

// 1. Mở Modal Xác nhận trước khi gọi quickChotVangMat
window.openChotVangConfirmModal = function(id, tenNhanVien = 'Nhân viên', tenCa = 'Ca làm', timeStr = '') {
    pendingQuickChotVangId = id;

    let modal = document.getElementById('admin-chot-vang-confirm-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-chot-vang-confirm-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10000; align-items: center; justify-content: center;';
        modal.onclick = function(e) {
            if (e.target === modal) closeChotVangConfirmModal();
        };
        document.body.appendChild(modal);
    }

    const ngayChon = document.getElementById('admin-cc-date')?.value || '';
    const dateDisplay = ngayChon ? ngayChon.split('-').reverse().join('/') : 'hôm nay';

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 420px; width: 92%; text-align: center; padding: 28px 24px; border-radius: 16px; background: #ffffff; box-shadow: 0 20px 40px rgba(15, 23, 42, 0.2); border: 1px solid #fecaca;">
            <div style="width: 66px; height: 66px; border-radius: 50%; background: #fef2f2; color: #ef4444; border: 2px solid #fecaca; display: inline-flex; align-items: center; justify-content: center; font-size: 1.9rem; margin-bottom: 14px;">
                <i class="fa-solid fa-user-xmark"></i>
            </div>
            
            <h3 style="margin: 0 0 10px 0; font-size: 1.28rem; font-weight: 800; color: #0f172a;">Xác nhận Chốt Vắng Mặt</h3>
            
            <p style="color: #475569; font-size: 0.92rem; line-height: 1.6; margin: 0 0 16px 0;">
                Bạn có chắc chắn muốn chốt <strong style="color: #ef4444;">VẮNG MẶT</strong> đối với nhân viên <strong style="color: #0f172a;">${tenNhanVien}</strong> không?
            </p>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; font-size: 0.85rem; color: #334155; text-align: left; margin-bottom: 22px; line-height: 1.6;">
                <div><i class="fa-regular fa-clock" style="color: var(--primary); width: 18px;"></i> Ca làm việc: <strong>${tenCa}</strong> ${timeStr ? `(${timeStr})` : ''}</div>
                <div><i class="fa-regular fa-calendar" style="color: var(--primary); width: 18px;"></i> Ngày làm: <strong>${dateDisplay}</strong></div>
            </div>

            <div style="display: flex; justify-content: center; gap: 12px;">
                <button type="button" onclick="closeChotVangConfirmModal()" style="flex: 1; padding: 10px 18px; border-radius: 10px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-weight: 600; font-size: 0.92rem; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#f1f5f9'; this.style.color='#0f172a';" onmouseout="this.style.background='#ffffff'; this.style.color='#475569';">
                    Hủy bỏ
                </button>
                <button type="button" id="btn-confirm-quick-vang" onclick="quickChotVangMat(pendingQuickChotVangId)" style="flex: 1; padding: 10px 18px; border-radius: 10px; border: 1px solid #ef4444; background: #ef4444; color: #ffffff; font-weight: 700; font-size: 0.92rem; cursor: pointer; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.25); transition: all 0.2s;" onmouseover="this.style.background='#dc2626';" onmouseout="this.style.background='#ef4444';">
                    <i class="fa-solid fa-check" style="margin-right: 6px;"></i> Đồng ý chốt
                </button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
};

window.closeChotVangConfirmModal = function() {
    const modal = document.getElementById('admin-chot-vang-confirm-modal');
    if (modal) modal.style.display = 'none';
    pendingQuickChotVangId = null;
};

// 2. Gọi API PUT /api/lich-lam-viec/{id}/chot-cong để chốt Vắng mặt sau khi xác nhận
window.quickChotVangMat = async function(id) {
    if (!id) return;

    const btn = document.getElementById('btn-confirm-quick-vang');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang chốt...';
    }

    try {
        const response = await fetch(`${API_BASE_URL}/lich-lam-viec/${id}/chot-cong`, {
            method: 'PUT',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('dn_football_token')}`
            },
            body: JSON.stringify({
                trang_thai_diem_danh: 'VangMat',
                ly_do_dieu_chinh: 'Quản lý chốt vắng mặt do không nhận ca.',
                tien_phat: 0 
            })
        });
        const data = await response.json();

        closeChotVangConfirmModal();

        if (response.ok && data.success) {
            showSystemModal("Thành công", "Đã chốt vắng mặt cho nhân viên.", "success");
            const itemIndex = currentChamCongData.findIndex(item => String(item.ID) === String(id));
            if (itemIndex > -1) {
                currentChamCongData[itemIndex].TrangThaiDiemDanh = 'VangMat';
                currentChamCongData[itemIndex].LyDoDieuChinh = 'Quản lý chốt vắng mặt do không nhận ca.';
                renderAdminChamCongTable();
            } else {
                loadAdminChamCongData();
            }
        } else {
            showSystemModal("Lỗi", data.message || "Không thể chốt vắng mặt!", "error");
        }
    } catch(e) {
        closeChotVangConfirmModal();
        showSystemModal("Lỗi", "Lỗi kết nối máy chủ!", "error");
    }
};

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
                <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button type="button" onclick="document.getElementById('modal-chot-cong').style.display='none'" style="padding: 9px 20px; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-weight: 600; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#ffffff'">Hủy</button>
                    <button type="button" id="btn-save-cc" class="btn-primary" style="padding: 9px 22px; border-radius: 8px; font-weight: 600;" onclick="executeChotCong(event)">Lưu công</button>
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

function formatMinutesToHours(minutes) {
    if (!minutes || minutes <= 0) return '';
    if (minutes < 60) return `${minutes} phút`;
    const hours = Math.floor(minutes / 60);
    const remainMinutes = minutes % 60;
    return remainMinutes === 0 ? `${hours}h` : `${hours}h${remainMinutes}p`;
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
    isPromoCodeModalDuplicate = false;

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
                    <label>Mã khuyến mãi (Voucher Code) <span style="color: var(--primary); font-size: 0.8rem; font-weight: 600;">[Tùy chọn A-Z0-9 hoặc Bỏ trống tự sinh]</span></label>
                    <input type="text" id="km-ma" class="form-control" maxlength="36"
                           placeholder="Bỏ trống tự sinh (VD: KM001) hoặc nhập KMHE2026, GIAM50K..."
                           value="${km ? km.MaKhuyenMai : ''}"
                           style="font-family:monospace; font-weight:700; text-transform:uppercase;"
                           oninput="validatePromoCodeModalRealtime(this)">
                    <div id="km-ma-feedback" style="display: none; font-size: 0.8rem; font-weight: 600; margin-top: 4px; line-height: 1.4;"></div>
                </div>

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

let isPromoCodeModalDuplicate = false;

window.validatePromoCodeModalRealtime = function(inputEl) {
    const cleaned = inputEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (inputEl.value !== cleaned) {
        inputEl.value = cleaned;
    }

    const val = inputEl.value.trim().toUpperCase();
    const originalId = editingPromoId ? String(editingPromoId).toUpperCase() : null;
    const feedbackEl = document.getElementById('km-ma-feedback');
    const btnSave = document.getElementById('btn-save-promo');

    if (val === '' || (originalId && val === originalId)) {
        isPromoCodeModalDuplicate = false;
        inputEl.style.borderColor = '#cbd5e1';
        if (feedbackEl) {
            feedbackEl.style.display = 'none';
            feedbackEl.innerHTML = '';
        }
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.style.opacity = '1';
            btnSave.style.cursor = 'pointer';
        }
        return;
    }

    const existedInLocal = (allAdminPromos || []).some(p => String(p.MaKhuyenMai || '').toUpperCase() === val);
    const existedInCache = (adminModalPkCache['KhuyenMai'] || []).includes(val);

    if (existedInLocal || existedInCache) {
        isPromoCodeModalDuplicate = true;
        inputEl.style.borderColor = '#e11d48';
        if (feedbackEl) {
            feedbackEl.style.display = 'block';
            feedbackEl.style.color = '#e11d48';
            feedbackEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Mã khuyến mãi <strong>[${val}]</strong> đã tồn tại! Vui lòng chọn mã khác.`;
        }
        if (btnSave) {
            btnSave.disabled = true;
            btnSave.style.opacity = '0.5';
            btnSave.style.cursor = 'not-allowed';
        }
    } else {
        isPromoCodeModalDuplicate = false;
        inputEl.style.borderColor = '#0d8a5e';
        if (feedbackEl) {
            feedbackEl.style.display = 'block';
            feedbackEl.style.color = '#0d8a5e';
            feedbackEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> Mã khuyến mãi <strong>[${val}]</strong> hợp lệ, có thể sử dụng.`;
        }
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.style.opacity = '1';
            btnSave.style.cursor = 'pointer';
        }
    }
};

window.savePromoAdmin = async function() {
    if (isPromoCodeModalDuplicate) {
        return showSystemModal('Trùng mã khuyến mãi', 'Mã khuyến mãi bạn nhập đã tồn tại! Vui lòng chọn mã khác.', 'error');
    }

    const customMaKM = document.getElementById('km-ma')?.value.trim().toUpperCase() || '';
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
        const payload = {
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
        };

        if (customMaKM !== '') {
            payload.MaKhuyenMai = customMaKM;
        }

        const res = await fetch(url, {
            method,
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
            adminModalPkCache['KhuyenMai'] = null;
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

// ======================================================
// BỘ KIỂM TRA TRÙNG MÃ KHÓA CHÍNH REALTIME TRÊN MODAL ADMIN
// (Giống hệt cơ chế của table-forms.html: Tự động viết hoa A-Z0-9, báo đỏ nếu đã tồn tại, báo xanh nếu hợp lệ)
// ======================================================
let adminModalPkCache = {
    CumSan: null,
    SanBong: null,
    KhuyenMai: null
};
let adminModalPkTimer = null;
let adminModalPkDuplicateMap = {};

async function preloadAdminModalExistingCodes(table) {
    try {
        const res = await fetch(`${API_BASE_URL}/db-manager/data?table=${encodeURIComponent(table)}`);
        const json = await res.json();
        if (json.success && Array.isArray(json.rows)) {
            const pkColMap = { CumSan: 'MaCumSan', SanBong: 'MaSanBong', KhuyenMai: 'MaKhuyenMai' };
            const col = pkColMap[table];
            adminModalPkCache[table] = json.rows.map(r => String(r[col] ?? '').toUpperCase());
        }
    } catch (e) {
        console.error('Lỗi tải danh sách mã kiểm tra trùng:', e);
    }
}

// Cập nhật hàm validateAdminModalCodeRealtime để bỏ qua chính mã hiện tại khi đang ở chế độ Sửa
window.validateAdminModalCodeRealtime = function(inputEl, table, feedbackId, saveBtnId) {
    if (!inputEl || inputEl.readOnly || inputEl.disabled) return;

    const cleaned = inputEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (inputEl.value !== cleaned) {
        inputEl.value = cleaned;
    }

    const runCheck = async () => {
        if (!adminModalPkCache[table]) {
            await preloadAdminModalExistingCodes(table);
        }
        const existingList = adminModalPkCache[table] || [];
        const feedbackEl = document.getElementById(feedbackId);
        const btnSave = document.getElementById(saveBtnId) || inputEl.closest('.modal-content')?.querySelector('.btn-primary');
        const val = inputEl.value.trim().toUpperCase();

        // Lấy mã gốc hiện tại nếu đang ở chế độ Sửa
        let currentEditingId = null;
        if (table === 'CumSan' && editCumSanId) {
            currentEditingId = String(editCumSanId).toUpperCase();
        } else if (table === 'SanBong') {
            const sbHiddenId = document.getElementById('sb-id')?.value;
            if (sbHiddenId) currentEditingId = String(sbHiddenId).toUpperCase();
        }

        // Nếu để trống hoặc giữ nguyên mã cũ của chính nó -> Hợp lệ
        if (val === '' || (currentEditingId && val === currentEditingId)) {
            adminModalPkDuplicateMap[table] = false;
            inputEl.style.borderColor = '#cbd5e1';
            if (feedbackEl) {
                feedbackEl.style.display = 'none';
                feedbackEl.innerHTML = '';
            }
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.style.opacity = '1';
                btnSave.style.cursor = 'pointer';
            }
            return;
        }

        const isDuplicate = existingList.includes(val);
        if (isDuplicate) {
            adminModalPkDuplicateMap[table] = true;
            inputEl.style.borderColor = '#e11d48';
            if (feedbackEl) {
                feedbackEl.style.display = 'block';
                feedbackEl.style.color = '#e11d48';
                feedbackEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Mã <strong>[${val}]</strong> đã tồn tại! Vui lòng chọn mã khác.`;
            }
            if (btnSave) {
                btnSave.disabled = true;
                btnSave.style.opacity = '0.5';
                btnSave.style.cursor = 'not-allowed';
            }
        } else {
            adminModalPkDuplicateMap[table] = false;
            inputEl.style.borderColor = '#0d8a5e';
            if (feedbackEl) {
                feedbackEl.style.display = 'block';
                feedbackEl.style.color = '#0d8a5e';
                feedbackEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> Mã <strong>[${val}]</strong> hợp lệ, có thể sử dụng.`;
            }
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.style.opacity = '1';
                btnSave.style.cursor = 'pointer';
            }
        }
    };

    runCheck();
    if (adminModalPkTimer) clearTimeout(adminModalPkTimer);
    adminModalPkTimer = setTimeout(runCheck, 200);
};

// ======================================================
// MODULE: QUẢN LÝ DANH MỤC LOẠI SÂN (CHỈ DÀNH RIÊNG CHO ADMIN)
// - Hỗ trợ Thêm mới / Chỉnh sửa Mã (A-Z0-9 hoặc tự sinh) & Tên loại sân
// - Kiểm tra trùng Mã & Tên Realtime
// - Chặn xóa nếu đang có Sân con sử dụng + Xác nhận xóa bằng Modal
// ======================================================
let adminLoaiSanListCache = [];
let editingLoaiSanId = null;
let isLoaiSanCodeDuplicate = false;
let pendingDeleteLoaiSanId = null;

window.openLoaiSanManagerModal = async function() {
    const currentUser = JSON.parse(sessionStorage.getItem('dn_football_user') || '{}');
    if (currentUser.VaiTro !== 'Admin') {
        return showSystemModal('Từ chối truy cập', 'Chức năng Quản lý Loại Sân chỉ dành riêng cho Admin hệ thống!', 'error');
    }

    editingLoaiSanId = null;
    isLoaiSanCodeDuplicate = false;

    let modal = document.getElementById('admin-loaisan-manager-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-loaisan-manager-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10010; align-items: center; justify-content: center;';
        modal.onclick = function(e) {
            if (e.target === modal) closeLoaiSanManagerModal();
        };
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 860px; width: 95%; padding: 0; border-radius: 16px; overflow: hidden; background: #ffffff; box-shadow: 0 20px 45px rgba(15, 23, 42, 0.22); max-height: 90vh; display: flex; flex-direction: column;">
            <!-- Header -->
            <div style="padding: 18px 26px; background: linear-gradient(135deg, #0b5d3b 0%, #087f4f 100%); color: #ffffff; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 42px; height: 42px; border-radius: 10px; background: rgba(255,255,255,0.16); display: flex; align-items: center; justify-content: center; font-size: 1.25rem; color: #f5c542;">
                        <i class="fa-solid fa-futbol"></i>
                    </div>
                    <div>
                        <h3 style="margin: 0; font-size: 1.2rem; font-weight: 800; letter-spacing: -0.2px;">Quản lý Danh mục Loại Sân</h3>
                        <div style="font-size: 0.84rem; opacity: 0.92; margin-top: 2px;">Danh mục dùng chung cho toàn bộ Cụm sân trên hệ thống (Đặc quyền Admin)</div>
                    </div>
                </div>
                <button type="button" onclick="closeLoaiSanManagerModal()" style="background: rgba(255,255,255,0.14); border: none; color: #fff; width: 34px; height: 34px; border-radius: 8px; cursor: pointer; font-size: 1.15rem; display: flex; align-items: center; justify-content: center;">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <!-- Body -->
            <div style="padding: 22px 26px; overflow-y: auto; flex: 1;">
                <!-- Khung Form Thêm / Sửa Loại Sân -->
                <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 18px 20px; margin-bottom: 22px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; min-height: 30px; margin-bottom: 14px;">
                        <div id="ls-form-title" style="font-weight: 800; color: #0f172a; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
                            <i class="fa-solid fa-circle-plus" style="color: var(--primary);"></i>
                            <span>Thêm Loại Sân Mới</span>
                        </div>
                        <button type="button" id="btn-cancel-edit-ls" onclick="resetLoaiSanForm()" style="display: none; padding: 5px 12px; font-size: 0.8rem; border-radius: 6px; border: 1px solid #fecaca; background: #fef2f2; color: #dc2626; font-weight: 700; cursor: pointer;">
                            <i class="fa-solid fa-rotate-left"></i> Hủy chế độ sửa
                        </button>
                    </div>

                    <div style="display: grid; grid-template-columns: 280px 1fr 155px; gap: 14px; align-items: start;">
                        <div>
                            <label style="font-size: 0.84rem; font-weight: 700; color: #334155; display: block; height: 22px; line-height: 22px; margin-bottom: 6px; white-space: nowrap;">
                                Mã loại sân <span style="color: var(--primary); font-weight: 600;">(Tùy chọn A-Z0-9)</span>
                            </label>
                            <input type="text" id="ls-ma-input" class="form-control" maxlength="36" placeholder="Bỏ trống tự sinh hoặc VD: LS5..." style="height: 42px; box-sizing: border-box; font-family: monospace; font-weight: 700; text-transform: uppercase; background: #ffffff;" oninput="validateLoaiSanCodeRealtime(this)">
                            <div id="ls-ma-feedback" style="display: none; font-size: 0.78rem; font-weight: 600; margin-top: 5px; line-height: 1.35;"></div>
                        </div>
                        <div>
                            <label style="font-size: 0.84rem; font-weight: 700; color: #334155; display: block; height: 22px; line-height: 22px; margin-bottom: 6px; white-space: nowrap;">
                                Tên loại sân <span style="color: #ef4444;">*</span>
                            </label>
                            <input type="text" id="ls-ten-input" class="form-control" maxlength="100" placeholder="VD: Sân 5 người, Sân 7 người, Sân 11 người..." style="height: 42px; box-sizing: border-box; background: #ffffff;">
                        </div>
                        <div>
                            <div style="height: 22px; margin-bottom: 6px;"></div>
                            <button type="button" id="btn-submit-loaisan" class="btn-primary" style="width: 100%; height: 42px; padding: 0 16px; box-sizing: border-box; white-space: nowrap; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 7px;" onclick="saveLoaiSanAdmin()">
                                <i class="fa-solid fa-floppy-disk"></i> <span id="btn-submit-loaisan-text">Thêm mới</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Danh sách Loại Sân hiện có -->
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
                    <div style="font-weight: 700; color: #0f172a; font-size: 0.96rem; white-space: nowrap;">
                        <i class="fa-solid fa-list-check" style="color: var(--primary); margin-right: 6px;"></i>
                        Danh sách Loại sân hiện có (<span id="ls-total-count">0</span>)
                    </div>
                    <span style="font-size: 0.8rem; color: #64748b;">* Khi đổi Mã loại sân, các sân con và bảng giá sẽ tự động đồng bộ theo</span>
                </div>

                <div class="table-responsive" style="max-height: 340px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 10px;">
                    <table class="admin-table" style="margin: 0; width: 100%;">
                        <thead style="position: sticky; top: 0; background: #f8fafc; z-index: 5;">
                            <tr>
                                <th style="width: 150px; white-space: nowrap;">Mã Loại Sân</th>
                                <th>Tên Loại Sân</th>
                                <th style="text-align: center; width: 170px; white-space: nowrap;">Đang sử dụng</th>
                                <th style="text-align: center; width: 170px; white-space: nowrap;">Hành động</th>
                            </tr>
                        </thead>
                        <tbody id="admin-loaisan-tbody">
                            <tr><td colspan="4" style="text-align: center; padding: 30px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải danh sách loại sân...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Footer -->
            <div style="padding: 14px 26px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end;">
                <button type="button" class="btn-outline-sm" style="padding: 9px 24px; font-weight: 600;" onclick="closeLoaiSanManagerModal()">Đóng cửa sổ</button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
    await loadAdminLoaiSanList();
};

window.closeLoaiSanManagerModal = function() {
    const modal = document.getElementById('admin-loaisan-manager-modal');
    if (modal) modal.style.display = 'none';
};

async function loadAdminLoaiSanList() {
    const tbody = document.getElementById('admin-loaisan-tbody');
    if (!tbody) return;

    try {
        const res = await fetch(`${API_BASE_URL}/loai-san`);
        const json = await res.json();
        adminLoaiSanListCache = json.data || [];

        const countEl = document.getElementById('ls-total-count');
        if (countEl) countEl.textContent = adminLoaiSanListCache.length;

        if (adminLoaiSanListCache.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 35px; color: var(--text-muted);">Chưa có loại sân nào. Hãy thêm loại sân đầu tiên ở khung phía trên!</td></tr>`;
            return;
        }

        tbody.innerHTML = adminLoaiSanListCache.map(ls => {
            const maLS = ls.MaLoaiSan || ls.ID;
            const soSanCon = Number(ls.so_san_con || 0);
            const soBangGia = Number(ls.so_bang_gia || 0);
            const isInUse = (soSanCon > 0 || soBangGia > 0);
            const safeTen = (ls.TenLoaiSan || '').replace(/'/g, "\\'");

            const usageBadge = isInUse
                ? `<span style="background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; padding: 3px 9px; border-radius: 99px; font-size: 0.78rem; font-weight: 700; white-space: nowrap;">
                        <i class="fa-solid fa-check-circle"></i> ${soSanCon} sân con
                   </span>`
                : `<span style="background: #f1f5f9; color: #64748b; padding: 3px 9px; border-radius: 99px; font-size: 0.78rem; font-weight: 600; white-space: nowrap;">
                        Chưa dùng
                   </span>`;

            const deleteBtnHtml = isInUse
                ? `<button type="button" class="action-btn" style="color: #94a3b8; border-color: #e2e8f0; background: #f8fafc; cursor: pointer;" title="Loại sân đang có sân con hoặc bảng giá sử dụng" onclick="showSystemModal('Không thể xóa', 'Loại sân <strong>${safeTen} (#${maLS})</strong> đang có <strong>${soSanCon} sân con</strong> và <strong>${soBangGia} cấu hình giá</strong> sử dụng nên được bảo vệ không thể xóa!', 'error')">
                        <i class="fa-solid fa-shield-halved"></i>
                   </button>`
                : `<button type="button" class="action-btn" style="color: #ef4444; border-color: #fecaca; background: #fef2f2;" onclick="openDeleteLoaiSanConfirmModal('${maLS}', '${safeTen}')">
                        <i class="fa-solid fa-trash-can"></i> Xóa
                   </button>`;

            return `
                <tr>
                    <td>
                        <span style="font-family: monospace; font-weight: 800; font-size: 0.88rem; color: #0f172a; background: #f1f5f9; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 6px; display: inline-block;">#${maLS}</span>
                    </td>
                    <td>
                        <strong style="color: #0f172a; font-size: 0.94rem;">${ls.TenLoaiSan}</strong>
                    </td>
                    <td style="text-align: center;">${usageBadge}</td>
                    <td style="text-align: center;">
                        <div style="display: inline-flex; gap: 6px; align-items: center;">
                            <button type="button" class="action-btn" onclick="startEditLoaiSan('${maLS}', '${safeTen}')">
                                <i class="fa-solid fa-pen-to-square"></i> Sửa
                            </button>
                            ${deleteBtnHtml}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 30px; color: #ef4444;">Lỗi tải danh sách loại sân!</td></tr>`;
    }
}

window.validateLoaiSanCodeRealtime = function(inputEl) {
    if (!inputEl) return;
    const cleaned = inputEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (inputEl.value !== cleaned) {
        inputEl.value = cleaned;
    }

    const val = inputEl.value.trim().toUpperCase();
    const originalId = editingLoaiSanId ? String(editingLoaiSanId).toUpperCase() : null;
    const feedbackEl = document.getElementById('ls-ma-feedback');
    const btnSave = document.getElementById('btn-submit-loaisan');

    if (val === '' || (originalId && val === originalId)) {
        isLoaiSanCodeDuplicate = false;
        inputEl.style.borderColor = '#cbd5e1';
        if (feedbackEl) {
            feedbackEl.style.display = 'none';
            feedbackEl.innerHTML = '';
        }
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.style.opacity = '1';
            btnSave.style.cursor = 'pointer';
        }
        return;
    }

    const isDup = adminLoaiSanListCache.some(ls => String(ls.MaLoaiSan || ls.ID || '').toUpperCase() === val);
    if (isDup) {
        isLoaiSanCodeDuplicate = true;
        inputEl.style.borderColor = '#e11d48';
        if (feedbackEl) {
            feedbackEl.style.display = 'block';
            feedbackEl.style.color = '#e11d48';
            feedbackEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Mã <strong>[${val}]</strong> đã tồn tại!`;
        }
        if (btnSave) {
            btnSave.disabled = true;
            btnSave.style.opacity = '0.5';
            btnSave.style.cursor = 'not-allowed';
        }
    } else {
        isLoaiSanCodeDuplicate = false;
        inputEl.style.borderColor = '#0d8a5e';
        if (feedbackEl) {
            feedbackEl.style.display = 'block';
            feedbackEl.style.color = '#0d8a5e';
            feedbackEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> Mã <strong>[${val}]</strong> hợp lệ.`;
        }
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.style.opacity = '1';
            btnSave.style.cursor = 'pointer';
        }
    }
};

window.startEditLoaiSan = function(maLS, tenLS) {
    editingLoaiSanId = maLS;
    isLoaiSanCodeDuplicate = false;

    const titleEl = document.getElementById('ls-form-title');
    const cancelBtn = document.getElementById('btn-cancel-edit-ls');
    const maInput = document.getElementById('ls-ma-input');
    const tenInput = document.getElementById('ls-ten-input');
    const feedbackEl = document.getElementById('ls-ma-feedback');
    const btnText = document.getElementById('btn-submit-loaisan-text');
    const btnSave = document.getElementById('btn-submit-loaisan');

    if (titleEl) {
        titleEl.innerHTML = `<i class="fa-solid fa-pen-to-square" style="color: #2563eb;"></i> <span style="color: #1e40af;">Chỉnh sửa Loại Sân #${maLS}</span>`;
    }
    if (cancelBtn) cancelBtn.style.display = 'inline-block';
    if (maInput) {
        maInput.value = maLS;
        maInput.style.borderColor = '#cbd5e1';
    }
    if (tenInput) {
        tenInput.value = tenLS;
        tenInput.focus();
    }
    if (feedbackEl) {
        feedbackEl.style.display = 'none';
        feedbackEl.innerHTML = '';
    }
    if (btnText) btnText.textContent = 'Lưu cập nhật';
    if (btnSave) {
        btnSave.disabled = false;
        btnSave.style.opacity = '1';
        btnSave.style.cursor = 'pointer';
    }
};

window.resetLoaiSanForm = function() {
    editingLoaiSanId = null;
    isLoaiSanCodeDuplicate = false;

    const titleEl = document.getElementById('ls-form-title');
    const cancelBtn = document.getElementById('btn-cancel-edit-ls');
    const maInput = document.getElementById('ls-ma-input');
    const tenInput = document.getElementById('ls-ten-input');
    const feedbackEl = document.getElementById('ls-ma-feedback');
    const btnText = document.getElementById('btn-submit-loaisan-text');
    const btnSave = document.getElementById('btn-submit-loaisan');

    if (titleEl) {
        titleEl.innerHTML = `<i class="fa-solid fa-circle-plus" style="color: var(--primary);"></i> <span>Thêm Loại Sân Mới</span>`;
    }
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (maInput) {
        maInput.value = '';
        maInput.style.borderColor = '#cbd5e1';
    }
    if (tenInput) tenInput.value = '';
    if (feedbackEl) {
        feedbackEl.style.display = 'none';
        feedbackEl.innerHTML = '';
    }
    if (btnText) btnText.textContent = 'Thêm mới';
    if (btnSave) {
        btnSave.disabled = false;
        btnSave.style.opacity = '1';
        btnSave.style.cursor = 'pointer';
    }
};

window.saveLoaiSanAdmin = async function() {
    if (isLoaiSanCodeDuplicate) {
        return showSystemModal('Trùng mã loại sân', 'Mã loại sân bạn nhập đã tồn tại trên hệ thống! Vui lòng chọn mã khác.', 'error');
    }

    const maVal = document.getElementById('ls-ma-input')?.value.trim().toUpperCase() || '';
    const tenVal = document.getElementById('ls-ten-input')?.value.trim() || '';

    if (!tenVal) {
        return showSystemModal('Thiếu thông tin', 'Vui lòng nhập Tên loại sân (VD: Sân 5 người, Sân 7 người, Sân 11 người)!', 'error');
    }

    if (editingLoaiSanId && !maVal) {
        return showSystemModal('Thiếu mã loại sân', 'Khi chỉnh sửa không được để trống Mã loại sân!', 'error');
    }

    const btn = document.getElementById('btn-submit-loaisan');
    if (btn) btn.disabled = true;

    const url = editingLoaiSanId
        ? `${API_BASE_URL}/loai-san/${editingLoaiSanId}`
        : `${API_BASE_URL}/loai-san`;
    const method = editingLoaiSanId ? 'PUT' : 'POST';

    const payload = { TenLoaiSan: tenVal };
    if (maVal !== '') {
        payload.MaLoaiSan = maVal;
    }

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok && data.success) {
            showSystemModal('Thành công', data.message, 'success');
            resetLoaiSanForm();
            await loadAdminLoaiSanList();

            // Nếu Admin đang đứng ở màn hình chi tiết 1 Cụm sân -> Tự động làm mới lại Bảng giá & Danh sách sân con
            if (currentCumSanId && document.getElementById('sanbong-table-body')) {
                renderCumSanDetail(currentCumSanId);
            }
        } else {
            showSystemModal('Không thể lưu', data.message || 'Có lỗi xảy ra khi lưu loại sân!', 'error');
        }
    } catch (e) {
        showSystemModal('Lỗi kết nối', 'Không thể kết nối đến máy chủ!', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
};

window.openDeleteLoaiSanConfirmModal = function(maLS, tenLS) {
    pendingDeleteLoaiSanId = maLS;

    let modal = document.getElementById('admin-delete-loaisan-confirm-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-delete-loaisan-confirm-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; z-index: 10060; align-items: center; justify-content: center;';
        modal.onclick = function(e) {
            if (e.target === modal) modal.style.display = 'none';
        };
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 420px; width: 92%; text-align: center; padding: 28px 24px; border-radius: 16px;">
            <div style="width: 64px; height: 64px; border-radius: 50%; background: #fef2f2; color: #ef4444; border: 2px solid #fecaca; display: inline-flex; align-items: center; justify-content: center; font-size: 1.8rem; margin-bottom: 14px;">
                <i class="fa-solid fa-trash-can"></i>
            </div>
            <h3 style="margin: 0 0 10px 0; font-size: 1.25rem; font-weight: 800; color: #0f172a;">Xác nhận xóa Loại Sân?</h3>
            <p style="color: #475569; font-size: 0.92rem; line-height: 1.6; margin: 0 0 22px 0;">
                Bạn có chắc chắn muốn xóa loại sân <strong style="color: #0f172a;">${tenLS} (#${maLS})</strong> khỏi hệ thống không?
            </p>
            <div style="display: flex; justify-content: center; gap: 12px;">
                <button type="button" class="btn-outline" style="flex: 1; padding: 10px 18px; border-radius: 10px;" onclick="document.getElementById('admin-delete-loaisan-confirm-modal').style.display='none'">Hủy bỏ</button>
                <button type="button" id="btn-confirm-delete-loaisan" class="btn-primary" style="flex: 1; padding: 10px 18px; border-radius: 10px; background: #ef4444; border-color: #ef4444;" onclick="executeDeleteLoaiSanAdmin()">
                    <i class="fa-solid fa-check" style="margin-right: 5px;"></i> Đồng ý xóa
                </button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
};

window.executeDeleteLoaiSanAdmin = async function() {
    if (!pendingDeleteLoaiSanId) return;

    const btn = document.getElementById('btn-confirm-delete-loaisan');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xóa...';
    }

    try {
        const res = await fetch(`${API_BASE_URL}/loai-san/${pendingDeleteLoaiSanId}`, {
            method: 'DELETE',
            headers: { 'Accept': 'application/json' }
        });
        const data = await res.json();

        const confModal = document.getElementById('admin-delete-loaisan-confirm-modal');
        if (confModal) confModal.style.display = 'none';

        if (res.ok && data.success) {
            if (editingLoaiSanId === pendingDeleteLoaiSanId) {
                resetLoaiSanForm();
            }
            showSystemModal('Đã xóa thành công', data.message, 'success');
            await loadAdminLoaiSanList();
        } else {
            showSystemModal('Không thể xóa', data.message || 'Loại sân này đang được sử dụng!', 'error');
        }
    } catch (e) {
        const confModal = document.getElementById('admin-delete-loaisan-confirm-modal');
        if (confModal) confModal.style.display = 'none';
        showSystemModal('Lỗi kết nối', 'Mất kết nối đến máy chủ!', 'error');
    } finally {
        pendingDeleteLoaiSanId = null;
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

        // Lọc theo kiểu lịch đá (Cuối tuần / Ngắt quãng)
        const matchDates = Object.keys(gd.ngay_co_tran || {}).sort();
        if (modeFilter === 'WEEKEND') {
            const hasWeekendMatch = matchDates.some(dStr => {
                const dayNum = new Date(dStr + 'T00:00:00').getDay();
                return dayNum === 0 || dayNum === 6;
            });
            const spanHasWeekend = !gd.da_dat_san && dateCols.some(c => c.isWeekend && c.ymd >= gd.ngay_bat_dau && c.ymd <= gd.ngay_ket_thuc);
            if (!hasWeekendMatch && !spanHasWeekend) return false;
        } else if (modeFilter === 'INTERMITTENT') {
            if (matchDates.length < 2) return false;
            const dStart = new Date(gd.ngay_bat_dau + 'T00:00:00');
            const dEnd = new Date(gd.ngay_ket_thuc + 'T00:00:00');
            const totalSpanDays = Math.round((dEnd - dStart) / 86400000) + 1;
            if (matchDates.length >= totalSpanDays) return false;
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