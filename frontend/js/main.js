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
    if(appContent) {
        loadClusters();
        setupModals();
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
    //scrollToFields();

    try {
        const res = await fetch(`${API_BASE_URL}/san-bong?cum_san_id=${clusterId}`);
        const data = await res.json();
        const activePitches = (data.data || []).filter(sb => sb.TrangThai === 'HoatDong');

        if (activePitches.length === 0) {
            appContent.innerHTML = `
                <div style="text-align: center; padding: 50px 20px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px;">
                    <i class="fa-solid fa-circle-exclamation fa-3x" style="color: var(--accent); margin-bottom: 16px;"></i>
                    <h3 style="color: var(--text-main); font-size: 1.25rem; margin-bottom: 8px;">Hiện không có sân bóng nào</h3>
                    <p style="color: var(--text-muted); font-size: 0.95rem;">Cụm sân này hiện chưa có sân con nào hoạt động. Vui lòng chọn cụm sân khác.</p>
                </div>
            `;
            return;
        }

        let html = '<div class="pitch-grid">';
        activePitches.forEach(sb => {
            const loaiName = sb.loaiSan?.TenLoaiSan || sb.loai_san?.TenLoaiSan || 'Khác';
            // Bắt sự kiện onclick TRỰC TIẾP trên thẻ div.pitch-card
            html += `
                <div class="pitch-card" onclick="loadSchedule(${clusterId}, ${sb.ID})">
                    <div style="padding: 20px;">
                        <div class="pitch-card-name">${sb.TenSan}</div>
                        <div class="pitch-card-type"><i class="fa-solid fa-layer-group"></i> ${loaiName}</div>
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
    renderBreadcrumb('schedule');
    appContent.innerHTML = '<div style="text-align:center; padding: 40px;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:#10B981"></i></div>';
    //scrollToFields();

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

        let html = `
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

                if (isPast) html += `<td style="text-align:center; border-bottom: 1px solid var(--border-color);"><button class="slot-btn past" disabled>Quá giờ</button></td>`;
                else if (isBooked) html += `<td style="text-align:center; border-bottom: 1px solid var(--border-color);"><button class="slot-btn booked" disabled>Đã đặt</button></td>`;
                else html += `<td style="text-align:center; border-bottom: 1px solid var(--border-color);"><button class="slot-btn available" onclick="triggerModal('${timeStr}', '${priceVal}', '${date.short}')">TRỐNG</button></td>`;
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
    let html = `<span class="breadcrumb-item" onclick="renderClusters()"><i class="fa-solid fa-arrow-left"></i> Quay lại danh sách</span>`;
    if (view === 'schedule') {
        html = `<span class="breadcrumb-item" onclick="loadPitches(${appState.currentCluster.ID})"><i class="fa-solid fa-arrow-left"></i> Chọn sân khác thuộc ${appState.currentCluster.TenCumSan}</span>`;
    }
    breadcrumbEl.innerHTML = html;
}

function triggerModal(time, price, date) {
    document.getElementById('modal-slot-info').innerHTML = `
        <div style="margin-bottom:8px">Sân: <strong>${appState.currentPitch.TenSan}</strong> (${appState.currentCluster.TenCumSan})</div>
        <div style="margin-bottom:8px">Ngày: <strong>${date}</strong></div>
        <div style="margin-bottom:8px">Giờ: <strong style="color:#10B981">${time}</strong></div>
        <div>Giá: <strong style="color:#10B981">${price}</strong></div>
    `;
    document.getElementById('login-required-modal').classList.add('active');
}

function setupModals() {
    const modal = document.getElementById('login-required-modal');
    document.getElementById('modal-close-x').onclick = () => modal.classList.remove('active');
    document.getElementById('modal-cancel-btn').onclick = () => modal.classList.remove('active');
}