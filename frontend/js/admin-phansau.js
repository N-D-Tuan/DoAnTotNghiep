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
        const listDatSan = hd.dat_sans || hd.datSans || [];
        const first = listDatSan[0] || {};
        const tenKhach = hd.nguoi_dung?.HoTen || first.TenNguoiDat || first.TenKhachVangLai || 'Khách hàng';
        const sdtKhach = hd.nguoi_dung?.SoDienThoai || first.SDTNguoiDat || first.SDTKhachVangLai || '';
        const ngayLap = hd.NgayTao ? new Date(hd.NgayTao).toLocaleString('vi-VN') : '';
        const statusMap = { 'DaCoc': 'Đã đặt cọc', 'HoanThanh': 'Đã hoàn thành', 'DaHuy': 'Đã hủy', 'KhongDen': 'Không đến' };

        let tongTienSanGoc = 0;
        const rowsHtml = listDatSan.map((ds, i) => {
            const tenSan = ds.san_bong?.TenSan || 'Sân bóng';
            const cumSan = ds.san_bong?.cum_san?.TenCumSan || '';
            const kg = ds.khung_gio ? `${ds.khung_gio.GioBatDau.substring(0,5)} - ${ds.khung_gio.GioKetThuc.substring(0,5)}` : '';
            const ngayDa = ds.NgayDa ? ds.NgayDa.split('-').reverse().join('/') : '';
            const maVe = (ds.MaGiaiDau || ds.ID_GiaiDau) ? `GD-${ds.MaGiaiDau || ds.ID_GiaiDau}` : `PT-${ds.MaDatSan || ds.ID}`;
            const donGia = Number(ds.pivot?.DonGia ?? ds.TongTien ?? 0);
            if (ds.TrangThai !== 'DaHuy') tongTienSanGoc += donGia;

            return `
                <tr>
                    <td style="text-align:center;">${i + 1}</td>
                    <td style="text-align:center; font-family:monospace; font-weight:bold;">#${maVe}</td>
                    <td><strong>${tenSan}</strong><br><small>${cumSan}</small></td>
                    <td style="text-align:center;">${kg}<br><small>${ngayDa}</small></td>
                    <td style="text-align:center;">${statusMap[ds.TrangThai] || ds.TrangThai}</td>
                    <td style="text-align:right;">${donGia.toLocaleString('vi-VN')}đ</td>
                    <td style="text-align:right; color:#047857; font-weight:bold;">${Number(ds.TienCoc).toLocaleString('vi-VN')}đ</td>
                </tr>
            `;
        }).join('');

        const tongTien = Number(hd.TongTien ?? hd.TongTienSan ?? 0);
        const thueVAT = Number(hd.ThueVAT || 0);
        const tienSauGiam = Math.max(0, tongTien - thueVAT);
        const soTienGiam = Math.max(0, tongTienSanGoc - tienSauGiam);
        const kmObj = hd.khuyen_mai || hd.khuyenMai || null;
        const tienCoc = Number(hd.TienDaCoc || 0);
        const conLai = Math.max(0, tongTien - tienCoc);

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
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px;"><span>Tổng tiền sân gốc:</span><strong>${tongTienSanGoc.toLocaleString('vi-VN')}đ</strong></div>
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
    let payload = { phuong_thuc_hoan: 'vi' };

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
        ? 'Quản lý mã giảm giá áp dụng riêng cho Cụm sân của bạn và mã tặng khách hàng cá nhân'
        : 'Quản lý chương trình khuyến mãi toàn hệ thống, theo từng cụm sân hoặc tặng riêng khách hàng';

    const scopeFilterOptionsHtml = isQuanLy ? `
        <option value="All">Tất cả phạm vi</option>
        <option value="CUM_SAN">Cụm sân của tôi</option>
        <option value="KHACH_HANG">Tặng khách hàng</option>
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
                    <input type="text" id="promo-search-input" class="form-control" style="padding-left: 36px;" placeholder="Tìm theo Mã KM, tên chương trình, cụm sân, tên khách..." oninput="handlePromoSearch(this.value)">
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

    try {
        const [promoRes, usersRes] = await Promise.all([
            fetch(`${API_BASE_URL}/admin/khuyen-mai`),
            fetch(`${API_BASE_URL}/admin/khach-hang`)
        ]);
        const promoJson = await promoRes.json();
        const usersJson = await usersRes.json();

        if (usersJson.success) {
            adminCustomersListCache = (usersJson.data || []).filter(u => u.VaiTro === 'KhachHang');
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

        // Cách ly dữ liệu ở cả tầng Frontend cho Quản lý sân: Chỉ hiển thị mã của Cụm sân mình hoặc mã tặng Khách hàng
        if (isQuanLy) {
            if (phamVi === 'HE_THONG') return false;
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
                <td style="text-align: center; white-space: nowrap;">
                    <div style="display: inline-flex; gap: 6px; align-items: center;">
                        <button type="button" class="action-btn" style="white-space: nowrap;" onclick='openPromoModal(${safeJson})'>
                            <i class="fa-solid fa-pen-to-square"></i> Sửa
                        </button>
                        <button type="button" class="action-btn" style="color: #ef4444; border-color: #fecaca; background: #fef2f2; white-space: nowrap;" onclick="openDeletePromoConfirmModal('${km.MaKhuyenMai}', '${safeTenKM}')">
                            <i class="fa-solid fa-trash-can"></i> Xóa
                        </button>
                    </div>
                </td>
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
    if (km) {
        currentScope = km.pham_vi || (!km.MaNguoiDung ? 'HE_THONG' : (km.nguoi_dung?.VaiTro === 'QuanLySan' ? 'CUM_SAN' : 'KHACH_HANG'));
    }

    const scopeOptionsHtml = isAdmin ? `
        <option value="HE_THONG" ${currentScope === 'HE_THONG' ? 'selected' : ''}>Toàn hệ thống (Áp dụng mọi cụm sân)</option>
        <option value="CUM_SAN" ${currentScope === 'CUM_SAN' ? 'selected' : ''}>Riêng cho từng Cụm sân</option>
        <option value="KHACH_HANG" ${currentScope === 'KHACH_HANG' ? 'selected' : ''}>Tặng riêng cho 1 Khách hàng cá nhân</option>
    ` : `
        <option value="CUM_SAN" ${currentScope === 'CUM_SAN' ? 'selected' : ''}>Áp dụng riêng cho Cụm sân của tôi</option>
        <option value="KHACH_HANG" ${currentScope === 'KHACH_HANG' ? 'selected' : ''}>Tặng riêng cho 1 Khách hàng cá nhân</option>
    `;

    let cumSanSelectHtml = '';
    if (isAdmin) {
        const clusterOpts = adminClusterManagersCache.map(ql => {
            const maQL = ql.MaNguoiDung || ql.ID;
            const tenCS = ql.cum_san ? ql.cum_san.TenCumSan : ('Cụm sân #' + ql.MaCumSan);
            const selected = (km && km.MaNguoiDung === maQL) ? 'selected' : '';
            return `<option value="${maQL}" ${selected}>${tenCS} (Quản lý: ${ql.HoTen} - #${maQL})</option>`;
        }).join('');

        cumSanSelectHtml = `
            <div class="form-group" id="km-group-cumsan" style="display: none;">
                <label>Chọn Cụm sân áp dụng <span style="color:red;">*</span></label>
                <select id="km-cumsan-manager" class="form-control">
                    <option value="">-- Chọn Cụm sân được hưởng mã --</option>
                    ${clusterOpts}
                </select>
                <small style="color: #64748b;">Hệ thống sẽ gắn mã Quản lý của cụm sân này vào bảng KhuyenMai.</small>
            </div>
        `;
    } else {
        cumSanSelectHtml = `
            <div class="form-group" id="km-group-cumsan" style="display: none;">
                <label>Cụm sân áp dụng</label>
                <input type="text" class="form-control" value="Cơ sở của bạn (Mã quản lý #${myManagerId})" disabled style="background: #f1f5f9; font-weight: 600; color: var(--primary);">
                <input type="hidden" id="km-cumsan-manager" value="${myManagerId}">
            </div>
        `;
    }

    const customerOptions = `<option value="">-- Chọn khách hàng nhận mã --</option>` +
        adminCustomersListCache.map(c => {
            const ma = c.MaNguoiDung || c.ID;
            const selected = (km && km.MaNguoiDung === ma) ? 'selected' : '';
            return `<option value="${ma}" ${selected}>${c.HoTen} (${c.SoDienThoai} - Mã: ${ma})</option>`;
        }).join('');

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

                <div class="form-group">
                    <label>Phạm vi áp dụng khuyến mãi <span style="color:red;">*</span></label>
                    <select id="km-phamvi" class="form-control" onchange="togglePromoTargetScope()" style="font-weight: 600;">
                        ${scopeOptionsHtml}
                    </select>
                </div>

                ${cumSanSelectHtml}

                <div class="form-group" id="km-group-khachhang" style="display: none;">
                    <label>Chọn Khách hàng được tặng riêng <span style="color:red;">*</span></label>
                    <select id="km-nguoidung" class="form-control">
                        ${customerOptions}
                    </select>
                    <small style="color: #64748b;">Chỉ tài khoản khách hàng được chọn mới nhìn thấy và áp dụng được mã này.</small>
                </div>

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
    togglePromoTargetScope();
    modal.style.display = 'flex';
};

window.savePromoAdmin = async function() {
    const ten = document.getElementById('km-ten')?.value.trim();
    const phamVi = document.getElementById('km-phamvi')?.value || 'HE_THONG';
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

// Mở Modal xác nhận trước khi xóa mã khuyến mãi (Tránh click nhầm)
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