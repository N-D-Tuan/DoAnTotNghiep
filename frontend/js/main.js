/**
 * DN FOOTBALL - Main JavaScript
 * Bao gồm: Khởi tạo UI, Scroll Animations, Numbers Counter, Three.js 3D Scene
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Icons
    lucide.createIcons();

    // 2. Initialize UI Components
    initNavbar();
    initMobileMenu();
    initScrollAnimations();
    initCounterAnimation();
    
    // 3. Initialize Three.js Scene (Chỉ chạy nếu không bật reduced-motion)
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReducedMotion) {
        initThreeScene();
    }
});

/* ==========================================================================
   UI FUNCTIONS
   ========================================================================== */

function initNavbar() {
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

function initMobileMenu() {
    const toggle = document.getElementById('mobile-toggle');
    const menu = document.getElementById('mobile-menu');
    const links = menu.querySelectorAll('a');

    toggle.addEventListener('click', () => {
        menu.classList.toggle('active');
    });

    // Đóng menu khi click vào link
    links.forEach(link => {
        link.addEventListener('click', () => {
            menu.classList.remove('active');
        });
    });
}

function initScrollAnimations() {
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
            } else {
                entry.target.classList.remove('is-visible');
            }
        });
    }, observerOptions);

    const animatedElements = document.querySelectorAll('.fade-up, .reveal-left, .reveal-right');
    animatedElements.forEach(el => observer.observe(el));
}

function initCounterAnimation() {
    const counters = document.querySelectorAll('.counter');
    const speed = 200;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const counter = entry.target;
            const target = +counter.getAttribute('data-target');

            if (entry.isIntersecting) {
                counter.innerText = '0';
                
                const updateCount = () => {
                    const count = +counter.innerText;
                    const inc = target / speed;

                    if (count < target) {
                        counter.innerText = Math.ceil(count + inc);
                        setTimeout(updateCount, 15);
                    } else {
                        counter.innerText = target;
                    }
                };

                updateCount();
            }
        });
    }, { threshold: 0.5 });

    counters.forEach(counter => observer.observe(counter));
}

/* ==========================================================================
   THREE.JS SCENE (TECH FOOTBALL)
   ========================================================================== */

function initThreeScene() {
    const container = document.getElementById('canvas-container');
    if (!container) return;

    // Kích thước container
    let width = container.clientWidth;
    let height = container.clientHeight;

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 8; // Đẩy camera ra xa một chút

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    // Tối ưu pixel ratio cho performance
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    // Group chính để chứa bóng và hiệu ứng
    const footballGroup = new THREE.Group();
    scene.add(footballGroup);

    // 1. Tạo "Tech Football" bằng IcosahedronGeometry (Giống cấu trúc bóng đá)
    // Lớp bên trong: Tối, hút sáng
    const innerGeo = new THREE.IcosahedronGeometry(2, 2);
    const innerMat = new THREE.MeshPhongMaterial({
        color: 0x0F172A,
        emissive: 0x1E293B,
        flatShading: true,
        transparent: true,
        opacity: 0.9
    });
    const innerBall = new THREE.Mesh(innerGeo, innerMat);
    footballGroup.add(innerBall);

    // Lớp bên ngoài: Wireframe Neon
    const outerGeo = new THREE.IcosahedronGeometry(2.05, 2);
    const outerMat = new THREE.MeshBasicMaterial({
        color: 0x39FF88, // Neon Green
        wireframe: true,
        transparent: true,
        opacity: 0.4
    });
    const outerBall = new THREE.Mesh(outerGeo, outerMat);
    footballGroup.add(outerBall);

    // 2. Tạo vòng quỹ đạo (Orbit Ring)
    // const ringGeo = new THREE.TorusGeometry(3.5, 0.02, 16, 100);
    // const ringMat = new THREE.MeshBasicMaterial({
    //     color: 0x22C55E,
    //     transparent: true,
    //     opacity: 0.3
    // });
    // const ring = new THREE.Mesh(ringGeo, ringMat);
    // ring.rotation.x = Math.PI / 2;
    // ring.rotation.y = Math.PI / 6;
    // footballGroup.add(ring);

    // 3. Tạo Particles (Điểm sáng lơ lửng)
    // Tối ưu số lượng hạt dựa trên thiết bị (Mobile ít hơn)
    const isMobile = window.innerWidth <= 768;
    const particleCount = isMobile ? 200 : 500;
    
    const particlesGeo = new THREE.BufferGeometry();
    const posArray = new Float32Array(particleCount * 3);

    for(let i = 0; i < particleCount * 3; i++) {
        // Tạo particles trong phạm vi bán kính 10
        posArray[i] = (Math.random() - 0.5) * 15;
    }
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    
    const particlesMat = new THREE.PointsMaterial({
        size: 0.05,
        color: 0x39FF88,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });
    
    const particleMesh = new THREE.Points(particlesGeo, particlesMat);
    scene.add(particleMesh);

    // 4. Ánh sáng (Lights)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const rimLight = new THREE.DirectionalLight(0x39FF88, 2);
    rimLight.position.set(-5, 5, -5);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0x22C55E, 1);
    fillLight.position.set(5, 0, 5);
    scene.add(fillLight);

    // 5. Tương tác chuột (Mouse Interaction)
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;
    const windowHalfX = window.innerWidth / 2;
    const windowHalfY = window.innerHeight / 2;

    document.addEventListener('mousemove', (event) => {
        mouseX = (event.clientX - windowHalfX);
        mouseY = (event.clientY - windowHalfY);
    });

    // 6. Xử lý Resize
    window.addEventListener('resize', () => {
        width = container.clientWidth;
        height = container.clientHeight;
        
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        
        renderer.setSize(width, height);
    });

    // 7. Vòng lặp Animation (Animation Loop)
    const clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);
        const elapsedTime = clock.getElapsedTime();

        // Xoay trục bóng nhẹ nhàng
        footballGroup.rotation.y += 0.003;
        footballGroup.rotation.x += 0.002;
        
        // Hiệu ứng Floating (lên xuống)
        footballGroup.position.y = Math.sin(elapsedTime * 1.5) * 0.2;

        // Xoay hệ thống hạt
        particleMesh.rotation.y = -elapsedTime * 0.05;

        // Nội suy mượt mà tương tác chuột
        targetX = mouseX * 0.001;
        targetY = mouseY * 0.001;

        footballGroup.rotation.y += 0.05 * (targetX - footballGroup.rotation.y);
        footballGroup.rotation.x += 0.05 * (targetY - footballGroup.rotation.x);
        
        // Parallax nhẹ cho camera dựa trên chuột
        camera.position.x += (mouseX * 0.002 - camera.position.x) * 0.05;
        camera.position.y += (-mouseY * 0.002 - camera.position.y) * 0.05;
        camera.lookAt(scene.position);

        renderer.render(scene, camera);
    }

    animate();
}

const API_BASE_URL = 'http://127.0.0.1:8000/api';
const appContent = document.getElementById('guest-app-content');
const breadcrumbEl = document.getElementById('guest-breadcrumb');
const fieldsSection = document.getElementById('fields-section');

let appState = { clusters: [], currentCluster: null, currentPitch: null };

document.addEventListener('DOMContentLoaded', () => {
    if (appContent) {
        loadClusters();

        const urlParams = new URLSearchParams(window.location.search);
        const vnpayStatus = urlParams.get('vnpay_status');
        if (vnpayStatus) {
            showGuestPaymentResultModal(vnpayStatus);
            // Xóa param trên URL để F5 không bị hiện lại thông báo
            window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
        }

        // Khởi tạo giống hệt customer.js, admin.js, staff.js
        const REVERB_APP_KEY = '32o5b6sskjqfuf7qnqtd'; 
        window.Echo = new Echo({
            broadcaster: 'reverb',
            key: REVERB_APP_KEY,
            wsHost: '127.0.0.1',
            wsPort: 8080,
            forceTLS: false,
            disableStats: true
        });

        // Lắng nghe kênh system-updates theo đúng chuẩn data-slot-id của admin.js & staff.js
        window.Echo.channel('system-updates')
            .listen('SystemDataUpdated', async (e) => {
                console.log('⚡ Hệ thống có người vừa đặt sân (Guest View)...');
                
                if (appState.currentPitch !== null && document.querySelector('.schedule-table')) {
                    try {
                        const currentPitchId = appState.currentPitch.ID;
                        const dsRes = await fetch(`${API_BASE_URL}/dat-san/da-dat?id_san_bong=${currentPitchId}&_t=${new Date().getTime()}`);
                        const bookedSlots = (await dsRes.json()).data || [];

                        // 1. Nhả tất cả các ô đang xám (Đã đặt) thành màu xanh (TRỐNG)
                        document.querySelectorAll('.schedule-table .slot-btn.booked').forEach(el => {
                            if (el.innerText === 'Đã đặt') {
                                el.classList.remove('booked');
                                el.classList.add('available');
                                el.innerText = 'TRỐNG';
                                el.disabled = false;
                                
                                const slotData = el.getAttribute('data-slot-data');
                                if (slotData) el.setAttribute('onclick', `triggerModal(this, ${slotData})`);
                            }
                        });

                        // 2. Quét mảng bookedSlots từ CSDL để khóa những ô thực sự đã bị đặt
                        bookedSlots.forEach(booked => {
                            const targetSlotId = `${currentPitchId}-${booked.NgayDa}-${booked.ID_KhungGio}`;
                            const slotEl = document.querySelector(`.schedule-table .slot-btn[data-slot-id="${targetSlotId}"]`);
                            
                            if (slotEl && !slotEl.classList.contains('booked')) {
                                slotEl.classList.remove('available', 'selected');
                                slotEl.classList.add('booked');
                                slotEl.innerText = 'Đã đặt';
                                slotEl.disabled = true;
                                slotEl.removeAttribute('onclick');

                                // 3. Nếu khách đang chọn đúng ô vừa bị người khác đặt -> Gỡ khỏi giỏ hàng
                                const existingIndex = guestSelectedSlots.findIndex(s => s.id === targetSlotId);
                                if (existingIndex > -1) {
                                    guestSelectedSlots.splice(existingIndex, 1);
                                    updateGuestFloatingCart();
                                    
                                    if (document.getElementById('guest-cart-modal').classList.contains('active')) {
                                        if (guestSelectedSlots.length > 0) openGuestCartModal();
                                        else closeGuestCartModal();
                                    }
                                }
                            }
                        });
                    } catch (err) {
                        console.error("Lỗi cập nhật ngầm lịch Khách vãng lai:", err);
                    }
                }
            });
    }
});

// Hàm cuộn mượt về khu vực sân
// function scrollToFields() {
//     fieldsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
// }

async function loadClusters() {
    appContent.innerHTML = '<div style="text-align:center; padding: 40px;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:#10B981"></i></div>';
    try {
        const res = await fetch(`${API_BASE_URL}/cum-san`);
        const data = await res.json();
        appState.clusters = (data.data || []).filter(c => c.deleted_at === null);
        renderClusters();
    } catch (err) {
        appContent.innerHTML = '<p style="text-align:center; color:red;">Lỗi tải dữ liệu. Vui lòng thử lại.</p>';
    }
}

function renderClusters() {
    breadcrumbEl.style.display = 'none';
    let html = `
        <div style="margin-bottom: 24px;">
            <h2 style="font-size: 1.75rem; color: var(--text-main);">Danh Sách Cụm Sân</h2>
        </div>
        <div class="cluster-grid">
    `;

    appState.clusters.forEach(c => {
        // Bắt sự kiện onclick TRỰC TIẾP trên thẻ div.cluster-card
        html += `
            <div class="cluster-card" onclick="loadPitches(${c.ID})">
                <div class="cluster-img-box">
                    ${c.HinhAnh ? `<img src="http://127.0.0.1:8000${c.HinhAnh}" class="cluster-img">` : `<div style="display:flex; height:100%; align-items:center; justify-content:center; background:#E5E7EB;"><i class="fa-solid fa-futbol fa-3x" style="color:#9CA3AF"></i></div>`}
                </div>
                <div class="cluster-info">
                    <h3 class="cluster-name">${c.TenCumSan}</h3>
                    <div class="cluster-meta"><i class="fa-solid fa-location-dot" style="color: #10B981;"></i> ${c.DiaChi}</div>
                    <div class="cluster-meta"><i class="fa-solid fa-clock"></i> ${c.GioMoCua?.substring(0,5)} - ${c.GioDongCua?.substring(0,5)}</div>
                </div>
            </div>
        `;
    });
    appContent.innerHTML = html + '</div>';
    //scrollToFields();
}

async function loadPitches(clusterId) {
    appState.currentCluster = appState.clusters.find(c => c.ID == clusterId);
    renderBreadcrumb('pitches');
    appContent.innerHTML = '<div style="text-align:center; padding: 40px;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:#10B981"></i></div>';

    try {
        const res = await fetch(`${API_BASE_URL}/san-bong?cum_san_id=${clusterId}`);
        const data = await res.json();
        const activePitches = (data.data || []).filter(sb => sb.TrangThai === 'HoatDong');

        const c = appState.currentCluster;
        // Khung thông tin Cụm sân đang xem
        let headerHtml = `
            <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-left: 4px solid var(--primary); border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
                <div>
                    <div style="font-size: 0.8rem; color: var(--accent); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
                        Đang xem danh sách sân thuộc cụm
                    </div>
                    <h2 style="font-size: 1.5rem; color: var(--text-main); margin-bottom: 8px;">${c.TenCumSan}</h2>
                    <div style="display: flex; gap: 20px; flex-wrap: wrap; font-size: 0.9rem; color: var(--text-muted);">
                        <span><i class="fa-solid fa-location-dot" style="color: var(--primary); margin-right: 6px;"></i>${c.DiaChi}</span>
                        <span><i class="fa-solid fa-clock" style="color: var(--accent); margin-right: 6px;"></i>Giờ mở cửa: ${c.GioMoCua?.substring(0,5)} - ${c.GioDongCua?.substring(0,5)}</span>
                    </div>
                </div>
                <div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.25); padding: 8px 16px; border-radius: 8px; color: var(--accent); font-weight: 600; font-size: 0.9rem;">
                    <i class="fa-solid fa-futbol" style="margin-right: 6px;"></i> ${activePitches.length} sân đang hoạt động
                </div>
            </div>
        `;

        if (activePitches.length === 0) {
            appContent.innerHTML = headerHtml + `
                <div style="text-align: center; padding: 50px 20px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px;">
                    <i class="fa-solid fa-circle-exclamation fa-3x" style="color: var(--accent); margin-bottom: 16px;"></i>
                    <h3 style="color: var(--text-main); font-size: 1.25rem; margin-bottom: 8px;">Hiện không có sân bóng nào</h3>
                    <p style="color: var(--text-muted); font-size: 0.95rem;">Cụm sân này hiện chưa có sân con nào hoạt động. Vui lòng chọn cụm sân khác.</p>
                </div>
            `;
            return;
        }

        let html = headerHtml + '<div class="pitch-grid">';
        activePitches.forEach(sb => {
            const loaiName = sb.loaiSan?.TenLoaiSan || sb.loai_san?.TenLoaiSan || 'Khác';
            html += `
                <div class="pitch-card" onclick="loadSchedule(${clusterId}, ${sb.ID})">
                    <div style="padding: 20px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div class="pitch-card-name">${sb.TenSan}</div>
                            <div class="pitch-card-type"><i class="fa-solid fa-layer-group" style="color: var(--accent);"></i> ${loaiName}</div>
                        </div>
                        <span style="color: var(--accent); font-size: 0.85rem; font-weight: 600;">Xem lịch &rarr;</span>
                    </div>
                </div>
            `;
        });
        appContent.innerHTML = html + '</div>';
    } catch (err) {
        appContent.innerHTML = '<p style="text-align:center; color:red;">Lỗi tải dữ liệu sân.</p>';
    }
}

async function loadSchedule(clusterId, pitchId) {
    appContent.innerHTML = '<div style="text-align:center; padding: 40px;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:#10B981"></i></div>';

    try {
        const [sbRes, gtRes, kgRes, dsRes] = await Promise.all([
            fetch(`${API_BASE_URL}/san-bong?cum_san_id=${clusterId}`),
            fetch(`${API_BASE_URL}/gia-tien?cum_san_id=${clusterId}`),
            fetch(`${API_BASE_URL}/khung-gio`),
            fetch(`${API_BASE_URL}/dat-san/da-dat?id_san_bong=${pitchId}`)
        ]);

        const pitches = (await sbRes.json()).data || [];
        const prices = (await gtRes.json()).data || [];
        const timeSlots = (await kgRes.json()).data || [];
        const booked = (await dsRes.json()).data || [];

        const pitch = pitches.find(p => p.ID == pitchId);
        appState.currentPitch = pitch;
        
        // Gọi renderBreadcrumb sau khi đã gán appState.currentPitch để hiển thị đúng tên sân trên thanh điều hướng
        renderBreadcrumb('schedule');

        const c = appState.currentCluster;
        const loaiName = pitch.loaiSan?.TenLoaiSan || pitch.loai_san?.TenLoaiSan || 'Sân bóng';

        const validPrices = prices.filter(gt => gt.ID_LoaiSan == pitch.ID_LoaiSan);
        const validKhungGioIds = validPrices.map(gt => gt.ID_KhungGio);
        const availableTimeSlots = timeSlots.filter(kg => validKhungGioIds.includes(kg.ID));

        // Lấy ngày hôm nay và 6 ngày tới
        const dateArray = [];
        const today = new Date();
        for (let i = 0; i < 7; i++) {
            let d = new Date(today);
            d.setDate(today.getDate() + i);
            const pad = n => n < 10 ? '0' + n : n;
            dateArray.push({
                short: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
                dbDate: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
                rawDate: d
            });
        }

        // Khung thông tin Sân bóng & Cụm sân đang xem trên bảng lịch
        let html = `
            <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-left: 4px solid var(--accent); border-radius: 12px; padding: 18px 24px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
                <div>
                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px;">
                        <span style="background: rgba(57, 255, 136, 0.12); color: var(--accent); border: 1px solid rgba(57, 255, 136, 0.3); padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 700;">
                            <i class="fa-solid fa-building-flag" style="margin-right: 4px;"></i> ${c.TenCumSan}
                        </span>
                        <i class="fa-solid fa-chevron-right" style="font-size: 0.75rem; color: var(--text-muted);"></i>
                        <h2 style="font-size: 1.4rem; color: var(--text-main); margin: 0;">${pitch.TenSan}</h2>
                        <span style="background: var(--bg-tertiary); color: var(--text-main); padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600;">
                            <i class="fa-solid fa-layer-group" style="color: var(--primary); margin-right: 4px;"></i> ${loaiName}
                        </span>
                    </div>
                    <div style="font-size: 0.88rem; color: var(--text-muted);">
                        <i class="fa-solid fa-location-dot" style="color: var(--primary); margin-right: 6px;"></i> ${c.DiaChi}
                    </div>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-muted); background: var(--bg-main); padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border-color);">
                    <i class="fa-solid fa-hand-pointer" style="color: var(--accent); margin-right: 6px;"></i> Nhấn vào ô <strong style="color: var(--accent);">TRỐNG</strong> để chọn khung giờ đặt sân
                </div>
            </div>
            
            <!-- Thanh công cụ: Quy định đặt sân phong trào cho Khách vãng lai -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 14px;">
                <div style="position: relative; display: inline-block;">
                    <button type="button" onclick="toggleGuestRuleDropdown(event)" style="background-color: var(--bg-secondary); color: var(--text-main); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-circle-info" style="background-color: #f59e0b; color: #ffffff; border-radius: 50%; padding: 4px; font-size: 0.75rem;"></i> Quy định đặt & hủy sân
                    </button>

                    <!-- Hộp nội dung quy định dành riêng cho đặt sân phong trào -->
                    <div id="guest-rule-dropdown-box" style="display: none; position: absolute; top: 115%; left: 0; width: 680px; max-width: 90vw; background-color: #1e293b; border: 1px solid #f59e0b; border-radius: 10px; padding: 18px 22px; box-shadow: 0 10px 25px rgba(0,0,0,0.4); z-index: 99;">
                        <h4 style="color: #fbbf24; margin: 0 0 10px 0; font-size: 0.98rem; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                            <i class="fa-solid fa-circle-info"></i> Quy định đặt sân phong trào
                        </h4>
                        <ul style="color: #e2e8f0; font-size: 0.88rem; margin: 0 0 0 18px; padding: 0; line-height: 1.7; list-style-type: disc;">
                            <li><strong>Đặt sân phong trào:</strong> Xem lịch và đặt trước trong vòng <strong>7 ngày tới</strong>, thanh toán tiền cọc trước <strong>30%</strong> qua cổng VNPay.</li>
                            <li style="margin-top: 6px;"><strong>Nhận vé điện tử:</strong> Sau khi thanh toán thành công, hệ thống sẽ gửi thông tin vé đặt sân và số điện thoại Hotline hỗ trợ trực tiếp về <strong>Email</strong> bạn đã đăng ký.</li>
                            <li style="margin-top: 6px;"><strong>Quy định hủy lịch & hoàn cọc:</strong> Khách vãng lai không tự hủy lịch trên hệ thống. Khi cần hỗ trợ hủy sân và hoàn cọc, vui lòng liên hệ Hotline của cụm sân/Admin trong vé Email và cung cấp <strong>mã xác thực OTP</strong> được gửi về Email đặt sân.</li>
                        </ul>
                    </div>
                </div>
            </div>

            <div class="schedule-container" style="position: relative; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 14px; overflow: visible;">
                <table class="schedule-table" style="width: 100%; border-collapse: separate; border-spacing: 0; min-width: 900px; table-layout: auto;">
                    <thead>
                        <tr>
                            <!-- CỘT KHUNG GIỜ (TIÊU ĐỀ) -->
                            <th style="width: 120px; min-width: 120px; padding: 14px 10px; border-bottom: 1px solid var(--border-color); background: var(--bg-tertiary); position: sticky; top: 80px; left: 0; z-index: 50; box-shadow: 0 3px 8px rgba(0,0,0,0.2); text-align: center; color: var(--text-main);">
                                Khung giờ
                            </th>

                            <!-- CỘT GIÁ TIỀN (TIÊU ĐỀ) -->
                            <th style="width: 100px; min-width: 100px; padding: 14px 10px; border-bottom: 1px solid var(--border-color); background: var(--bg-tertiary); position: sticky; top: 80px; left: 120px; z-index: 49; box-shadow: 4px 0 6px -2px rgba(0,0,0,0.2), 0 3px 8px rgba(0,0,0,0.2); text-align: center; color: var(--text-main);">
                                Giá tiền
                            </th>

                            <!-- CÁC NGÀY (TIÊU ĐỀ) -->
                            ${dateArray.map((d, i) => `
                                <th style="min-width: 105px; padding: 14px 10px; text-align: center; white-space: nowrap; border-bottom: 1px solid var(--border-color); background: var(--bg-tertiary); position: sticky; top: 80px; z-index: 40; box-shadow: 0 3px 8px rgba(0,0,0,0.2); color: var(--text-main);">
                                    ${i === 0 ? 'Hôm nay' : d.short}
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        availableTimeSlots.forEach(kg => {
            const priceInfo = validPrices.find(p => p.ID_KhungGio == kg.ID);
            const priceVal = priceInfo ? Number(priceInfo.SoTien).toLocaleString('vi-VN') + 'đ' : '0đ';
            const timeStr = `${kg.GioBatDau.substring(0,5)} - ${kg.GioKetThuc.substring(0,5)}`;
            
            html += `
                <tr>
                    <!-- CỘT KHUNG GIỜ (NỘI DUNG) -->
                    <td style="width: 120px; min-width: 120px; background: var(--bg-secondary); position: sticky; left: 0; z-index: 15; border-right: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); text-align: center; padding: 12px 10px; white-space: nowrap;">
                        <strong>${timeStr}</strong>
                    </td>

                    <!-- CỘT GIÁ TIỀN (NỘI DUNG) -->
                    <td style="width: 100px; min-width: 100px; background: var(--bg-secondary); position: sticky; left: 120px; z-index: 14; color: var(--accent); font-weight: 600; border-right: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); box-shadow: 4px 0 6px -2px rgba(0,0,0,0.2); text-align: center; padding: 12px 10px;">
                        ${priceVal}
                    </td>
            `;
            
            dateArray.forEach(date => {
                const isBooked = booked.some(b => b.NgayDa === date.dbDate && b.ID_KhungGio === kg.ID);
                const isPast = new Date(date.rawDate.getFullYear(), date.rawDate.getMonth(), date.rawDate.getDate(), kg.GioBatDau.split(':')[0], kg.GioBatDau.split(':')[1]) <= new Date();

                const slotId = `${pitch.ID}-${date.dbDate}-${kg.ID}`;
                const isSelected = guestSelectedSlots.some(s => s.id === slotId);
                const slotDataStr = `'${timeStr}', '${priceVal}', '${date.short}', ${kg.ID}`;

                if (isPast) {
                    html += `<td style="text-align:center; border-bottom: 1px solid var(--border-color);"><button class="slot-btn past" data-slot-id="${slotId}" disabled>Quá giờ</button></td>`;
                } else if (isBooked) {
                    html += `<td style="text-align:center; border-bottom: 1px solid var(--border-color);"><button class="slot-btn booked" data-slot-id="${slotId}" data-slot-data="${slotDataStr}" disabled>Đã đặt</button></td>`;
                } else if (isSelected) {
                    html += `<td style="text-align:center; border-bottom: 1px solid var(--border-color);"><button class="slot-btn available selected" data-slot-id="${slotId}" data-slot-data="${slotDataStr}" onclick="triggerModal(this, ${slotDataStr})">ĐÃ CHỌN ✓</button></td>`;
                } else {
                    html += `<td style="text-align:center; border-bottom: 1px solid var(--border-color);"><button class="slot-btn available" data-slot-id="${slotId}" data-slot-data="${slotDataStr}" onclick="triggerModal(this, ${slotDataStr})">TRỐNG</button></td>`;
                }
            });
            html += `</tr>`;
        });

        appContent.innerHTML = html + '</tbody></table></div>';
    } catch (err) {
        appContent.innerHTML = '<p style="text-align:center; color:red;">Lỗi tải bảng lịch.</p>';
    }
}

function renderBreadcrumb(view) {
    breadcrumbEl.style.display = 'flex';
    breadcrumbEl.style.alignItems = 'center';
    breadcrumbEl.style.justifyContent = 'space-between';
    breadcrumbEl.style.flexWrap = 'wrap';
    breadcrumbEl.style.gap = '12px';

    if (view === 'pitches') {
        breadcrumbEl.innerHTML = `
            <span class="breadcrumb-item" onclick="renderClusters()">
                <i class="fa-solid fa-arrow-left"></i> Quay lại danh sách cụm sân
            </span>
            <div style="font-size: 0.9rem; color: var(--text-muted);">
                Cụm sân &gt; <strong style="color: var(--text-main);">${appState.currentCluster?.TenCumSan || ''}</strong>
            </div>
        `;
    } else if (view === 'schedule') {
        breadcrumbEl.innerHTML = `
            <span class="breadcrumb-item" onclick="loadPitches(${appState.currentCluster.ID})">
                <i class="fa-solid fa-arrow-left"></i> Chọn sân khác thuộc ${appState.currentCluster.TenCumSan}
            </span>
            <div style="font-size: 0.9rem; color: var(--text-muted);">
                <span style="cursor: pointer; text-decoration: underline;" onclick="renderClusters()">Cụm sân</span> &gt; 
                <span style="cursor: pointer; text-decoration: underline;" onclick="loadPitches(${appState.currentCluster.ID})">${appState.currentCluster?.TenCumSan || ''}</span> &gt; 
                <strong style="color: var(--accent);">${appState.currentPitch?.TenSan || ''}</strong>
            </div>
        `;
    }
}

function triggerModal(element, time, price, dateStr, kgId) {
    const priceNum = parseInt(price.replace(/\D/g, ''));
    
    // Gán dữ liệu vào hàm toggle
    toggleGuestSlot(element, appState.currentCluster.ID, appState.currentCluster.TenCumSan, appState.currentPitch.ID, appState.currentPitch.TenSan, dateStr, time, priceNum, kgId);
}

// ==========================================================================
// MODULE: GIỎ HÀNG & ĐẶT SÂN CHO KHÁCH VÃNG LAI (GUEST BOOKING)
// ==========================================================================
let guestSelectedSlots = [];

function toggleGuestSlot(element, clusterId, clusterName, pitchId, pitchName, dateDisplay, timeStr, price, kgId) {
    if (element.classList.contains('booked') || element.classList.contains('past')) return;
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const [day, month] = dateDisplay.split('/');
    const dateDb = `${currentYear}-${month}-${day}`;

    const slotId = `${pitchId}-${dateDb}-${kgId}`;
    const existingIndex = guestSelectedSlots.findIndex(s => s.id === slotId);
    
    if (existingIndex > -1) {
        guestSelectedSlots.splice(existingIndex, 1);
        element.classList.remove('selected'); 
        element.innerText = 'TRỐNG';
    } else {
        guestSelectedSlots.push({ 
            id: slotId, 
            pitchId, 
            kgId, 
            dateDb, 
            dateDisplay, 
            timeStr, 
            price,
            pitchName,
            clusterName
        });
        element.classList.add('selected'); 
        element.innerText = 'ĐÃ CHỌN ✓';
    }
    
    updateGuestFloatingCart();
}

function updateGuestFloatingCart() {
    const cartBar = document.getElementById('guest-floating-cart');
    if (!cartBar) return;

    if (guestSelectedSlots.length > 0) {
        // LỖI 2: Đổi từ 'block' sang 'flex' để giỏ hàng không bị rớt dòng
        cartBar.style.display = 'block'; 
        document.getElementById('guest-cart-count').innerText = guestSelectedSlots.length;
        const total = guestSelectedSlots.reduce((sum, s) => sum + Number(s.price), 0);
        document.getElementById('guest-floating-deposit').innerText = Math.round(total * 0.3).toLocaleString('vi-VN') + 'đ';
    } else {
        cartBar.style.display = 'none';
        closeGuestCartModal();
    }
}

// Chuyển toàn bộ các hàm thành Window Scope để gỡ LỖI 4
window.clearGuestCart = function() {
    guestSelectedSlots = [];
    
    const allButtons = document.querySelectorAll('.slot-btn.available.selected');
    allButtons.forEach(btn => {
        btn.classList.remove('selected');
        btn.innerText = 'TRỐNG';
    });
    
    updateGuestFloatingCart();
}

window.openGuestCartModal = function() {
    document.getElementById('guest-cart-alert').style.display = 'none';
    const listContainer = document.getElementById('guest-cart-list');
    
    let html = '';
    let totalAmount = 0;
    
    guestSelectedSlots.forEach((s, index) => {
        totalAmount += Number(s.price);
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 7px 10px; background: #ffffff; border-radius: 6px; margin-bottom: 6px;">
                <div>
                    <h4 style="font-size: 0.88rem; font-weight: 700; margin: 0 0 2px 0; color: #16a34a;">${s.clusterName} - ${s.pitchName}</h4>
                    <p style="margin: 0; color: #64748b; font-size: 0.8rem;">Ngày: <strong style="color: #0f172a;">${s.dateDisplay}</strong> | Giờ: <strong style="color: #0f172a;">${s.timeStr}</strong></p>
                </div>
                <div style="text-align: right; display: flex; align-items: center; gap: 10px;">
                    <span style="color: #ea580c; font-weight: 700; font-size: 0.88rem;">${Number(s.price).toLocaleString('vi-VN')}đ</span>
                    <i class="fa-solid fa-trash-can" style="color: #ef4444; cursor: pointer; font-size: 0.9rem;" onclick="removeGuestSlotByIndex(${index})"></i>
                </div>
            </div>
        `;
    });
    
    listContainer.innerHTML = html;
    document.getElementById('guest-cart-total-deposit').innerText = Math.round(totalAmount * 0.3).toLocaleString('vi-VN') + 'đ';
    
    const modal = document.getElementById('guest-cart-modal');
    modal.style.display = 'flex';
    modal.classList.add('active');
}

window.removeGuestSlotByIndex = function(index) {
    const slotToRemove = guestSelectedSlots[index];
    if (!slotToRemove) return;
    
    guestSelectedSlots.splice(index, 1);
    
    const btn = document.querySelector(`.schedule-table .slot-btn[data-slot-id="${slotToRemove.id}"]`);
    if (btn) {
        btn.classList.remove('selected');
        btn.innerText = 'TRỐNG';
    }

    updateGuestFloatingCart();
    
    if (guestSelectedSlots.length > 0) openGuestCartModal();
    else closeGuestCartModal();
}

window.closeGuestCartModal = function() {
    const modal = document.getElementById('guest-cart-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}
window.showGuestAlert = function(message, isSuccess) {
    const alertBox = document.getElementById('guest-cart-alert');
    alertBox.textContent = message;
    alertBox.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alertBox.style.display = 'block';
}

window.checkoutGuestBooking = async function() {
    const name = document.getElementById('guest-name').value.trim();
    const phone = document.getElementById('guest-phone').value.trim();
    const email = document.getElementById('guest-email').value.trim();
    const alertBox = document.getElementById('guest-cart-alert');
    
    alertBox.style.display = 'none';

    // 1. Kiểm tra không được để trống
    if (!name || !phone || !email) {
        return showGuestAlert('Vui lòng điền đầy đủ Họ tên, Số điện thoại và Email!', false);
    }

    // 2. Kiểm tra định dạng Họ và tên (Ít nhất 2 ký tự, chỉ chứa chữ cái và khoảng trắng)
    const nameRegex = /^[a-zA-ZÀ-ỹ\s]{2,100}$/;
    if (!nameRegex.test(name)) {
        return showGuestAlert('Họ và tên không hợp lệ (chỉ gồm chữ cái, tối thiểu 2 ký tự)!', false);
    }

    // 3. Kiểm tra định dạng Số điện thoại Việt Nam (10 chữ số, bắt đầu bằng số 0)
    const phoneRegex = /^0[0-9]{9}$/;
    if (!phoneRegex.test(phone)) {
        return showGuestAlert('Số điện thoại không hợp lệ (phải gồm 10 chữ số và bắt đầu bằng số 0)!', false);
    }

    // 4. Kiểm tra định dạng Email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return showGuestAlert('Địa chỉ Email không đúng định dạng (ví dụ: ten@gmail.com)!', false);
    }

    const btn = document.getElementById('btn-checkout-guest');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right: 5px;"></i> Đang tạo mã thanh toán...';
    btn.disabled = true;

    try {
        const payload = {
            ho_ten: name,
            sdt_khach: phone,
            email_khach: email,
            slots: guestSelectedSlots
        };

        const response = await fetch(`${API_BASE_URL}/dat-san-guest/thanh-toan`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.success && data.vnpay_url) {
            window.location.href = data.vnpay_url;
        } else {
            showGuestAlert(data.message || "Lỗi xử lý hệ thống!", false);
            
            if (data.failed_slot_ids) {
                guestSelectedSlots = guestSelectedSlots.filter(s => !data.failed_slot_ids.includes(s.id));
                updateGuestFloatingCart();
                setTimeout(() => {
                    if (guestSelectedSlots.length > 0) openGuestCartModal();
                    else closeGuestCartModal();
                }, 3000);
            }
        }
    } catch (e) {
        showGuestAlert("Mất kết nối tới máy chủ!", false);
    } finally {
        if (!data || !data.vnpay_url) {
            btn.disabled = false;
            btn.innerHTML = 'Thanh toán VNPay';
        }
    }
}

// ==========================================================================
// MODAL THÔNG BÁO KẾT QUẢ THANH TOÁN VNPAY CHO GUEST (TỰ ĐÓNG SAU 5 GIÂY)
// ==========================================================================
let guestResultTimer = null;
let guestResultCountdown = null;

window.showGuestPaymentResultModal = function(status) {
    let modal = document.getElementById('guest-payment-result-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'guest-payment-result-modal';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }

    let iconHtml = '';
    let title = '';
    let message = '';
    let btnColor = '';

    if (status === 'success') {
        iconHtml = '<i class="fa-solid fa-circle-check" style="font-size: 3.5rem; color: #22C55E;"></i>';
        title = 'Đặt sân thành công!';
        message = 'Thanh toán qua VNPay đã hoàn tất. Chúng tôi đã gửi mã vé điện tử và thông tin chi tiết về Email của bạn. Vui lòng kiểm tra hộp thư!';
        btnColor = '#22C55E';
        guestSelectedSlots = [];
        updateGuestFloatingCart();
    } else if (status === 'failed') {
        iconHtml = '<i class="fa-solid fa-circle-xmark" style="font-size: 3.5rem; color: #ef4444;"></i>';
        title = 'Thanh toán không thành công';
        message = 'Giao dịch thanh toán VNPay đã bị hủy hoặc thất bại. Lịch đặt sân chưa được tạo và bạn chưa bị trừ tiền.';
        btnColor = '#ef4444';
    } else if (status === 'invalid_signature') {
        iconHtml = '<i class="fa-solid fa-triangle-exclamation" style="font-size: 3.5rem; color: #f59e0b;"></i>';
        title = 'Lỗi xác thực giao dịch';
        message = 'Chữ ký bảo mật từ cổng thanh toán không hợp lệ. Vui lòng thử lại!';
        btnColor = '#f59e0b';
    } else {
        iconHtml = '<i class="fa-solid fa-circle-exclamation" style="font-size: 3.5rem; color: #ef4444;"></i>';
        title = 'Có lỗi xảy ra';
        message = 'Phiên đặt sân đã hết hạn hoặc khung giờ vừa bị người khác đặt mất trong lúc chờ thanh toán. Vui lòng liên hệ Hotline nếu cần hỗ trợ!';
        btnColor = '#ef4444';
    }

    let secondsLeft = 5;

    modal.innerHTML = `
        <div class="modal-card" style="max-width: 420px; text-align: center; padding: 28px 24px;">
            <div style="margin-bottom: 16px;">${iconHtml}</div>
            <h3 style="font-size: 1.35rem; color: var(--text-main); margin-bottom: 10px;">${title}</h3>
            <p style="color: var(--text-muted); font-size: 0.92rem; line-height: 1.6; margin-bottom: 24px;">${message}</p>
            <button type="button" class="btn" id="btn-close-guest-result" onclick="closeGuestPaymentResultModal()" style="width: 100%; background: ${btnColor}; color: #0F172A; font-weight: 700; padding: 12px;">
                Đóng (${secondsLeft}s)
            </button>
        </div>
    `;

    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);

    // Xóa bộ đếm cũ (nếu có) và kích hoạt đếm ngược 5 giây tự đóng
    if (guestResultTimer) clearTimeout(guestResultTimer);
    if (guestResultCountdown) clearInterval(guestResultCountdown);

    guestResultCountdown = setInterval(() => {
        secondsLeft--;
        const btn = document.getElementById('btn-close-guest-result');
        if (btn && secondsLeft > 0) {
            btn.innerText = `Đóng (${secondsLeft}s)`;
        }
    }, 1000);

    guestResultTimer = setTimeout(() => {
        closeGuestPaymentResultModal();
    }, 5000);
};

window.closeGuestPaymentResultModal = function() {
    if (guestResultTimer) clearTimeout(guestResultTimer);
    if (guestResultCountdown) clearInterval(guestResultCountdown);
    
    const modal = document.getElementById('guest-payment-result-modal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => { modal.style.display = 'none'; }, 300);
    }
};

window.toggleGuestRuleDropdown = function(event) {
    event.stopPropagation();
    const box = document.getElementById('guest-rule-dropdown-box');
    if (box) {
        box.style.display = (box.style.display === 'block') ? 'none' : 'block';
    }
};

window.addEventListener('click', function(e) {
    const box = document.getElementById('guest-rule-dropdown-box');
    if (box && box.style.display === 'block') {
        if (!box.contains(e.target)) {
            box.style.display = 'none';
        }
    }
});