// ======================================================
// DN FOOTBALL - AUTHENTICATION
// ======================================================

// Nếu Laravel và frontend chạy cùng domain:
// const API_BASE_URL = '/api';

const API_BASE_URL = 'http://127.0.0.1:8000/api';


// ======================================================
// DOM READY
// ======================================================

document.addEventListener('DOMContentLoaded', () => {

    // Khởi tạo icon Lucide
    lucide.createIcons();

    // ==================================================
    // 1. SHOW / HIDE PASSWORD
    // ==================================================

    const toggleButtons = document.querySelectorAll('.btn-toggle-password');

    toggleButtons.forEach(btn => {

        btn.addEventListener('click', function (e) {

            e.preventDefault();

            const input = this.previousElementSibling;

            if (input.type === 'password') {
                input.type = 'text';
                this.innerHTML = '<i data-lucide="eye-off"></i>';
            } else {
                input.type = 'password';
                this.innerHTML = '<i data-lucide="eye"></i>';
            }

            lucide.createIcons();
        });
    });


    // ==================================================
    // 2. XỬ LÝ CÁC FORM
    // ==================================================

    const forms = document.querySelectorAll('.auth-form');

    document
    .querySelectorAll('.auth-message-close')
    .forEach(button => {

        button.addEventListener('click', function () {

            const form =
                this.closest('.auth-form');

            if (form) {
                hideFormMessage(form);
            }

        });

    });

    forms.forEach(form => {

        form.addEventListener('submit', async function (e) {

            e.preventDefault();

            // Xóa lỗi cũ
            clearErrors(this);

            // Xóa thông báo cũ
            hideFormMessage(this);

            // Kiểm tra dữ liệu
            const isValid = validateForm(this);

            if (!isValid) {
                return;
            }

            // Hiện loading
            setLoading(this, true);

            try {

                // ======================================
                // ĐĂNG NHẬP
                // ======================================
                if (this.id === 'loginForm') {
                    await handleLogin(this);
                }

                // ======================================
                // ĐĂNG KÝ
                // ======================================
                else if (this.id === 'registerForm') {
                    await handleRegister(this);
                }

                // ======================================
                // QUÊN MẬT KHẨU
                // ======================================
                else if (
                    this.id === 'forgotPasswordForm'
                ) {
                    showFormMessage(
                        this,
                        'Nếu email tồn tại trong hệ thống, hướng dẫn khôi phục mật khẩu sẽ được gửi đến email của bạn.',
                        'success'
                    );

                    setTimeout(() => {

                        window.location.href =
                            'login.html';

                    }, 1500);
                }

            } catch (error) {

                console.error('Lỗi authentication:', error);
                showFormMessage(
                    this,
                    'Không thể kết nối đến máy chủ. Vui lòng kiểm tra Laravel/API.',
                    'error'
                );

            } finally {
                setLoading(this, false);
            }
        });


        // ==============================================
        // TỰ ĐỘNG XÓA LỖI KHI NHẬP LẠI
        // ==============================================

        const inputs = form.querySelectorAll('.form-control');

        inputs.forEach(input => {

            input.addEventListener('input', function () {

                const group = this.closest('.form-group');

                if (group) {
                    group.classList.remove('has-error');
                }
            });
        });
    });
});


// ======================================================
// 3. VALIDATE FORM
// ======================================================
function validateForm(form) {

    let isValid = true;
    const inputs = form.querySelectorAll('.form-control');
    inputs.forEach(input => {

        const group = input.closest('.form-group');

        const errorText = group ? group.querySelector('.error-text') : null;

        // Không được để trống
        if (input.value.trim() === '') {
            showError(group, errorText, getEmptyMessage(input));
            isValid = false;
            return;
        }

        // Kiểm tra Email
        if (
            input.type === 'email' &&
            !validateEmail(input.value)
        ) {
            showError(group, errorText, 'Email không hợp lệ.');
            isValid = false;
        }

        if (
            form.id === 'registerForm' &&
            input.id === 'password' &&
            input.value.length < 6
        ) {
            showError(
                group,
                errorText,
                'Mật khẩu phải có ít nhất 6 ký tự.'
            );
            isValid = false;
        }
    });

    return isValid;
}


// ======================================================
// 4. THÔNG BÁO INPUT TRỐNG
// ======================================================

function getEmptyMessage(input) {

    if (input.id === 'phone') {
        return 'Vui lòng nhập số điện thoại';
    }

    if (input.id === 'email') {
        return 'Vui lòng nhập email';
    }

    if (input.id === 'fullname') {
        return 'Vui lòng nhập họ tên';
    }

    if (input.id === 'password') {
        return 'Vui lòng nhập mật khẩu';
    }

    return 'Trường này không được để trống.';
}


// ======================================================
// 5. ĐĂNG NHẬP
// ======================================================

async function handleLogin(form) {

    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value;

    const response = await fetch(
        `${API_BASE_URL}/dang-nhap`,
        {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                so_dien_thoai: phone,
                mat_khau: password
            })
        }
    );

    const data = await response.json();

    // ==============================================
    // LOGIN THẤT BẠI
    // ==============================================

    if (!response.ok) {
        if (response.status === 422) {
            showApiErrors(
                form,
                data
            );
        } else {
            showFormMessage(
                form,
                data.message ||
                'Số điện thoại hoặc mật khẩu không chính xác'
            );
        }

        return;
    }

    // ==============================================
    // LOGIN THÀNH CÔNG
    // ==============================================
    if (!data.user) {
        showFormMessage(
            form,
            'API đăng nhập không trả về thông tin user.',
            'error'
        );

        return;
    }

    // Xóa dữ liệu user cũ trước khi lưu
    sessionStorage.removeItem(
        'dn_football_user'
    );

    // Lưu user vào sessionStorage
    sessionStorage.setItem(
        'dn_football_user',
        JSON.stringify(data.user)
    );

    console.log(
        'Đăng nhập thành công:',
        data.user
    );

    // ==============================================
    // KIỂM TRA VAI TRÒ
    // ==============================================

    if (data.user.VaiTro === 'KhachHang') {
        window.location.href =
            'customer.html';

        return;
    }

    if (data.user.VaiTro === 'Admin') {
        window.location.href =
            'admin.html';

        return;
    }

    // Vai trò không hợp lệ
    sessionStorage.clear();
    showFormMessage(
        form,
        'Vai trò tài khoản không hợp lệ.',
        'error'
    );
}

// ======================================================
// 6. ĐĂNG KÝ
// ======================================================

async function handleRegister(form) {
    const fullName = document.getElementById('fullname').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    const response = await fetch(
        `${API_BASE_URL}/dang-ky`,
        {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ho_ten: fullName,
                so_dien_thoai: phone,
                email: email,
                mat_khau: password
            })
        }
    );

    const data = await response.json();

    // ==============================================
    // ĐĂNG KÝ THẤT BẠI
    // ==============================================

    if (!response.ok) {

        showApiErrors(
            form,
            data
        );

        return;
    }

    // ==============================================
    // ĐĂNG KÝ THÀNH CÔNG
    // ==============================================
    showFormMessage(
        form,
        data.message || 'Đăng ký thành công!',
        'success'
    );

    setTimeout(() => {
        window.location.href = 'login.html';
    }, 1200);
}

// ======================================================
// 7. HIỂN THỊ LỖI VALIDATION TỪ LARAVEL
// ======================================================

function showApiErrors(form, data) {

    // Laravel trả errors dạng:
    //
    // {
    //     errors: {
    //         email: ["..."],
    //         so_dien_thoai: ["..."]
    //     }
    // }

    if (!data.errors) {
        showFormMessage(
            form,
            data.message ||
            'Dữ liệu không hợp lệ.'
        );

        return;
    }

    const errors =
        data.errors;

    // Số điện thoại
    if (errors.so_dien_thoai) {

        const input =
            form.querySelector('#phone');

        if (input) {

            const group =
                input.closest('.form-group');

            const errorText =
                group.querySelector('.error-text');

            showError(
                group,
                errorText,
                errors.so_dien_thoai[0]
            );
        }
    }

    // Email
    if (errors.email) {
        const input =
            form.querySelector('#email');

        if (input) {
            const group =
                input.closest('.form-group');

            const errorText =
                group.querySelector('.error-text');

            showError(
                group,
                errorText,
                errors.email[0]
            );
        }
    }

    // Họ tên
    if (errors.ho_ten) {
        const input =
            form.querySelector('#fullname');

        if (input) {
            const group =
                input.closest('.form-group');

            const errorText =
                group.querySelector('.error-text');

            showError(
                group,
                errorText,
                errors.ho_ten[0]
            );
        }
    }

    // Mật khẩu
    if (errors.mat_khau) {
        const input =
            form.querySelector('#password');

        if (input) {

            const group =
                input.closest('.form-group');

            const errorText =
                group.querySelector('.error-text');

            showError(
                group,
                errorText,
                errors.mat_khau[0]
            );
        }
    }
}

// ======================================================
// 8. HIỂN THỊ LỖI
// ======================================================

function showError(
    group,
    errorEl,
    message
) {
    if (!group) {
        return;
    }

    group.classList.add('has-error');

    if (errorEl) {
        errorEl.textContent = message;
    }
}

// ======================================================
// 9. HIỂN THỊ MESSAGE
// ======================================================
function showFormMessage(form, message, type = 'error') {

    const messageBox =
        form.querySelector('.auth-message');

    if (!messageBox) {
        return;
    }

    const messageText =
        messageBox.querySelector('.auth-message-text');

    const icon =
        messageBox.querySelector('.auth-message-icon');

    if (!messageText) {
        return;
    }

    // Xóa trạng thái cũ
    messageBox.classList.remove(
        'success',
        'error',
        'warning',
        'info'
    );

    // Xác định icon
    let iconName = 'info';

    if (type === 'success') {
        iconName = 'circle-check';
    }

    else if (type === 'error') {
        iconName = 'circle-alert';
    }

    else if (type === 'warning') {
        iconName = 'triangle-alert';
    }

    else if (type === 'info') {
        iconName = 'info';
    }

    // Gán nội dung
    messageText.textContent = message;

    // Gán trạng thái
    messageBox.classList.add(
        type,
        'show'
    );

    // Đổi icon
    if (icon) {
        icon.setAttribute(
            'data-lucide',
            iconName
        );
    }

    // Render lại Lucide
    lucide.createIcons();
}
function hideFormMessage(form) {

    const messageBox =
        form.querySelector('.auth-message');

    if (!messageBox) {
        return;
    }

    messageBox.classList.remove(
        'show',
        'success',
        'error',
        'warning',
        'info'
    );
}

// ======================================================
// 10. VALIDATE EMAIL
// ======================================================
function validateEmail(email) {
    const re =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return re.test(
        String(email).toLowerCase()
    );
}


// ======================================================
// 11. CLEAR ERROR
// ======================================================
function clearErrors(form) {
    const groups =
        form.querySelectorAll('.form-group');

    groups.forEach(group => {

        group.classList.remove(
            'has-error'
        );
    });
}

// ======================================================
// 12. LOADING BUTTON
// ======================================================
function setLoading(
    form,
    isLoading
) {
    const btn =
        form.querySelector('.btn-primary');

    if (!btn) {
        return;
    }

    const btnText =
        btn.querySelector('.btn-text');

    if (isLoading) {
        const loadingText =
            btn.getAttribute(
                'data-loading-text'
            ) || 'Đang xử lý...';

        // Không cho submit lần 2
        btn.disabled = true;

        btn.classList.add(
            'loading'
        );

        if (btnText) {
            btnText.style.display =
                'none';
        }

        const spinner =
            document.createElement('div');

        spinner.className =
            'spinner';

        btn.appendChild(
            spinner
        );


        const loadingMsg =
            document.createElement('span');

        loadingMsg.className =
            'loading-msg';

        loadingMsg.textContent =
            loadingText;

        btn.appendChild(
            loadingMsg
        );

        // Lưu lại để remove khi xong
        btn._spinner =
            spinner;

        btn._loadingMsg =
            loadingMsg;

    } else {
        btn.disabled = false;

        btn.classList.remove(
            'loading'
        );

        if (btnText) {
            btnText.style.display =
                'block';
        }

        if (btn._spinner) {
            btn._spinner.remove();
            btn._spinner = null;
        }

        if (btn._loadingMsg) {
            btn._loadingMsg.remove();
            btn._loadingMsg = null;
        }
    }
}