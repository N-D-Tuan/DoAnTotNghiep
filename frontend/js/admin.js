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