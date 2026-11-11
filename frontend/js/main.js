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
   THREE.JS SCENE (CLASSIC WHITE/BLACK FOOTBALL ON PITCH TURF - OPTIMIZED)
   ========================================================================== */

// Hàm nội suy mượt (Smoothstep) giúp khử răng cưa hoàn toàn ở mép ngũ giác và đường chỉ khâu
function smoothStepEdge(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

// Hàm tạo Texture mặt bóng đá truyền thống mềm mại, tự nhiên (Khử răng cưa + Độ nổi nhẹ)
function createClassicSoccerBallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // 12 đỉnh của khối Icosahedron (Tâm của 12 miếng ngũ giác trên mặt cầu)
    const phi = (1 + Math.sqrt(5)) / 2;
    const rawVertices = [
        [-1,  phi, 0], [ 1,  phi, 0], [-1, -phi, 0], [ 1, -phi, 0],
        [ 0, -1,  phi], [ 0,  1,  phi], [ 0, -1, -phi], [ 0,  1, -phi],
        [ phi, 0, -1], [ phi, 0,  1], [-phi, 0, -1], [-phi, 0,  1]
    ];
    const vertices = rawVertices.map(v => {
        const len = Math.hypot(v[0], v[1], v[2]);
        return [v[0] / len, v[1] / len, v[2] / len];
    });

    const imgData = ctx.createImageData(canvas.width, canvas.height);
    const data = imgData.data;

    // Bảng màu dịu mắt, thân thiện:
    // - Múi lục giác trắng kem ấm: RGB(250, 252, 250)
    // - Múi ngũ giác xám than mềm (không đen đặc): RGB(45, 58, 75)
    // - Rãnh chỉ khâu xám bạc dịu: RGB(203, 213, 225)
    const pentagonRadius = 0.355;
    const aaWidth = 0.014; // Độ rộng vùng làm mượt biên

    for (let y = 0; y < canvas.height; y++) {
        const v = (y + 0.5) / canvas.height;
        const theta = v * Math.PI;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let x = 0; x < canvas.width; x++) {
            const u = (x + 0.5) / canvas.width;
            const lon = u * 2 * Math.PI - Math.PI;

            const px = sinTheta * Math.cos(lon);
            const py = cosTheta;
            const pz = sinTheta * Math.sin(lon);

            let minAngle1 = 10;
            let minAngle2 = 10;

            for (let i = 0; i < 12; i++) {
                const vert = vertices[i];
                const dot = Math.max(-1, Math.min(1, px * vert[0] + py * vert[1] + pz * vert[2]));
                const angle = Math.acos(dot);
                if (angle < minAngle1) {
                    minAngle2 = minAngle1;
                    minAngle1 = angle;
                } else if (angle < minAngle2) {
                    minAngle2 = angle;
                }
            }

            const seamDiff = Math.abs(minAngle2 - minAngle1);

            // Hệ số chuyển mượt từ tâm ngũ giác ra vùng lục giác trắng
            const pentFactor = 1.0 - smoothStepEdge(pentagonRadius - aaWidth, pentagonRadius + aaWidth, minAngle1);

            // Hệ số đường rãnh chỉ khâu mảnh, êm
            const pentSeam = Math.exp(-Math.pow((minAngle1 - pentagonRadius) / 0.011, 2));
            const hexSeam = (minAngle1 > pentagonRadius)
                ? (1.0 - smoothStepEdge(0.006, 0.022, seamDiff))
                : 0.0;
            const seamStrength = Math.max(pentSeam * 0.7, hexSeam * 0.65);

            // Hiệu ứng độ phồng nhẹ trên từng múi da bóng để nhìn êm và thật hơn
            const pillowLight = 1.0 - 0.04 * Math.pow(minAngle1 / 0.55, 2);

            // Trộn màu giữa Trắng kem và Xám than mềm
            let r = (250 * (1 - pentFactor) + 45 * pentFactor) * pillowLight;
            let g = (252 * (1 - pentFactor) + 58 * pentFactor) * pillowLight;
            let b = (250 * (1 - pentFactor) + 75 * pentFactor) * pillowLight;

            // Phủ nhẹ màu đường chỉ khâu
            r = r * (1 - seamStrength) + 203 * seamStrength;
            g = g * (1 - seamStrength) + 213 * seamStrength;
            b = b * (1 - seamStrength) + 225 * seamStrength;

            const idx = (y * canvas.width + x) * 4;
            data[idx]     = Math.min(255, Math.max(0, Math.round(r)));
            data[idx + 1] = Math.min(255, Math.max(0, Math.round(g)));
            data[idx + 2] = Math.min(255, Math.max(0, Math.round(b)));
            data[idx + 3] = 255;
        }
    }

    ctx.putImageData(imgData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 8;
    return texture;
}

// Hàm tạo Texture thảm sân cỏ tròn mềm mại, chuyển sắc dịu mắt
function createPitchTurfTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Nền cỏ xanh dịu mắt
    const baseGrad = ctx.createRadialGradient(256, 256, 30, 256, 256, 256);
    baseGrad.addColorStop(0, '#34D399');
    baseGrad.addColorStop(1, '#16A34A');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, 512, 512);

    // Sọc cỏ mịn tự nhiên (độ chênh màu nhẹ nhàng, không gắt)
    const stripes = 8;
    const stripeWidth = canvas.width / stripes;
    for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = (i % 2 === 0) ? 'rgba(255, 255, 255, 0.07)' : 'rgba(15, 23, 42, 0.04)';
        ctx.fillRect(i * stripeWidth, 0, stripeWidth, canvas.height);
    }

    // Bóng đổ êm ngay dưới bụng trái bóng (Ambient Occlusion Shadow)
    const shadowGrad = ctx.createRadialGradient(256, 256, 15, 256, 256, 135);
    shadowGrad.addColorStop(0, 'rgba(15, 23, 42, 0.24)');
    shadowGrad.addColorStop(0.6, 'rgba(15, 23, 42, 0.08)');
    shadowGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.arc(256, 256, 135, 0, Math.PI * 2);
    ctx.fill();

    // Vạch vôi trắng mảnh thanh thoát
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(256, 256, 208, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(24, 256);
    ctx.lineTo(488, 256);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
}

function initThreeScene() {
    const container = document.getElementById('canvas-container');
    if (!container) return;

    let width = container.clientWidth || 500;
    let height = container.clientHeight || 500;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0.85, 7.8);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const stageGroup = new THREE.Group();
    scene.add(stageGroup);

    const ballTexture = createClassicSoccerBallTexture();

    // 1. Trái bóng đá mềm mại (64 đoạn cầu mịn, chất liệu da bóng mờ êm dịu)
    const ballGeo = new THREE.SphereGeometry(1.72, 64, 64);
    const ballMat = new THREE.MeshStandardMaterial({
        map: ballTexture,
        bumpMap: ballTexture,
        bumpScale: 0.015,
        roughness: 0.48,
        metalness: 0.02
    });
    const soccerBall = new THREE.Mesh(ballGeo, ballMat);
    soccerBall.position.y = 0.22;
    stageGroup.add(soccerBall);

    // 2. Đế thảm sân cỏ tròn bo êm phía dưới
    const turfGeo = new THREE.CylinderGeometry(2.32, 2.42, 0.14, 64);
    const turfTopMat = new THREE.MeshStandardMaterial({
        map: createPitchTurfTexture(),
        roughness: 0.85,
        metalness: 0.0
    });
    const turfSideMat = new THREE.MeshStandardMaterial({ color: 0x16A34A, roughness: 0.7 });
    const turfPad = new THREE.Mesh(turfGeo, [turfSideMat, turfTopMat, turfSideMat]);
    turfPad.position.y = -1.72;
    turfPad.rotation.x = 0.08;
    stageGroup.add(turfPad);

    // 3. Vòng viền ánh sáng xanh pastel cực nhẹ quanh thảm cỏ
    const ringGeo = new THREE.RingGeometry(2.48, 2.53, 64);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x34D399,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.35
    });
    const turfRing = new THREE.Mesh(ringGeo, ringMat);
    turfRing.position.y = -1.64;
    turfRing.rotation.x = Math.PI / 2 + 0.08;
    stageGroup.add(turfRing);

    // 4. Hệ thống ánh sáng vòm tự nhiên (HemisphereLight) giúp bóng không bị đổ bóng đen gắt
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xdcfce7, 0.95);
    hemiLight.position.set(0, 10, 0);
    scene.add(hemiLight);

    const mainLight = new THREE.DirectionalLight(0xfffbeb, 0.55);
    mainLight.position.set(4, 7, 6);
    scene.add(mainLight);

    const softFillLight = new THREE.DirectionalLight(0xe0f2fe, 0.35);
    softFillLight.position.set(-5, 2, 4);
    scene.add(softFillLight);

    let mouseX = 0;
    let mouseY = 0;
    let isHeroVisible = true;

    document.addEventListener('mousemove', (event) => {
        if (!isHeroVisible) return;
        mouseX = (event.clientX - window.innerWidth / 2) * 0.0006;
        mouseY = (event.clientY - window.innerHeight / 2) * 0.0006;
    }, { passive: true });

    // Tự động dừng render 3D khi người dùng cuộn xuống dưới để web luôn mượt và nhẹ
    const heroObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            isHeroVisible = entry.isIntersecting;
        });
    }, { threshold: 0.05 });
    heroObserver.observe(container);

    window.addEventListener('resize', () => {
        width = container.clientWidth || 500;
        height = container.clientHeight || 500;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    });

    const clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);
        if (!isHeroVisible) return;

        const elapsedTime = clock.getElapsedTime();

        // Chuyển động xoay chậm rãi, êm ái
        soccerBall.rotation.y += 0.0045;
        soccerBall.rotation.x += 0.0018;
        soccerBall.position.y = 0.22 + Math.sin(elapsedTime * 1.5) * 0.11;

        turfPad.rotation.y = elapsedTime * 0.1;

        stageGroup.rotation.y += (mouseX - stageGroup.rotation.y) * 0.04;
        stageGroup.rotation.x += (mouseY * 0.4 - stageGroup.rotation.x) * 0.04;

        camera.lookAt(0, -0.1, 0);
        renderer.render(scene, camera);
    }

    animate();
}

/* ==========================================================================
   GUEST BOOKING & CLUSTER / PITCH / SCHEDULE VIEW (ĐÃ CHUẨN HÓA MÃ VARCHAR)
   ========================================================================== */

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
        const maHoaDonGuest = urlParams.get('ma_hoa_don');
        if (vnpayStatus) {
            showGuestPaymentResultModal(vnpayStatus, maHoaDonGuest);
            window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
        }

        const REVERB_APP_KEY = '32o5b6sskjqfuf7qnqtd'; 
        window.Echo = new Echo({
            broadcaster: 'reverb',
            key: REVERB_APP_KEY,
            wsHost: '127.0.0.1',
            wsPort: 8080,
            forceTLS: false,
            disableStats: true
        });

        window.addEventListener('pageshow', (event) => {
            if (event.persisted) {
                if (window.Echo && window.Echo.connector && window.Echo.connector.pusher) {
                    window.Echo.connector.pusher.connect();
                }
                loadClusters();
            }
        });

        window.Echo.channel('system-updates')
            .listen('SystemDataUpdated', async (e) => {
                console.log('⚡ Hệ thống có tín hiệu cập nhật dữ liệu (Guest View)...');
                const cacheBuster = new Date().getTime();
                
                // A. Nếu đang xem bảng lịch của 1 sân bóng -> Cập nhật các ô Đã đặt / Trống
                if (appState.currentPitch !== null && document.querySelector('.schedule-table')) {
                    try {
                        const currentPitchId = appState.currentPitch.MaSanBong || appState.currentPitch.ID;
                        const dsRes = await fetch(`${API_BASE_URL}/dat-san/da-dat?id_san_bong=${currentPitchId}&_t=${cacheBuster}`);
                        const bookedSlots = (await dsRes.json()).data || [];

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

                        bookedSlots.forEach(booked => {
                            const maKG = booked.MaKhungGio || booked.ID_KhungGio;
                            const targetSlotId = `${currentPitchId}-${booked.NgayDa}-${maKG}`;
                            const slotEl = document.querySelector(`.schedule-table .slot-btn[data-slot-id="${targetSlotId}"]`);
                            
                            if (slotEl && !slotEl.classList.contains('booked')) {
                                slotEl.classList.remove('available', 'selected');
                                slotEl.classList.add('booked');
                                slotEl.innerText = 'Đã đặt';
                                slotEl.disabled = true;
                                slotEl.removeAttribute('onclick');

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

                // B. Cập nhật ngầm số sao & tổng lượt đánh giá trên danh sách Cụm Sân
                try {
                    const [res, ratingRes] = await Promise.all([
                        fetch(`${API_BASE_URL}/cum-san?_t=${cacheBuster}`),
                        fetch(`${API_BASE_URL}/danh-gia?_t=${cacheBuster}`)
                    ]);
                    const data = await res.json();
                    const ratingMap = (await ratingRes.json()).data || {};

                    appState.clusters = (data.data || []).filter(c => c.TrangThai === 'HoatDong' || (!c.TrangThai && c.deleted_at === null)).map(c => {
                        const maCS = c.MaCumSan || c.ID;
                        const r = ratingMap[maCS];
                        return {
                            ...c,
                            avg_rating: r ? Number(r.trung_binh_sao) : (c.danh_gias_avg_so_sao ? Math.round(c.danh_gias_avg_so_sao * 10) / 10 : 0),
                            total_reviews: r ? Number(r.tong_danh_gia) : (c.danh_gias_count || 0)
                        };
                    });

                    if (!breadcrumbEl || breadcrumbEl.style.display === 'none' || document.querySelector('.cluster-grid')) {
                        renderClusters();
                    }
                } catch (err) {
                    console.error("Lỗi cập nhật ngầm đánh giá cụm sân Guest:", err);
                }

                // C. Nếu khách vãng lai đang mở Modal xem đánh giá của 1 cụm sân
                const guestRevModal = document.getElementById('guest-reviews-modal');
                if (guestRevModal && guestRevModal.style.display === 'flex' && typeof currentGuestViewedReviewClusterId !== 'undefined' && currentGuestViewedReviewClusterId) {
                    try {
                        const revRes = await fetch(`${API_BASE_URL}/danh-gia?id_cum_san=${currentGuestViewedReviewClusterId}&_t=${cacheBuster}`);
                        const revData = await revRes.json();
                        if (revData.success && revData.tong_so > 0) {
                            guestModalReviewsData = revData.data || [];
                            const summaryScoreEl = guestRevModal.querySelector('#guest-reviews-content > div:first-child');
                            if (summaryScoreEl && document.getElementById('guest-review-items-box')) {
                                summaryScoreEl.innerHTML = `
                                    <div>
                                        <div style="font-size:0.82rem; color:var(--text-muted);">Điểm đánh giá trung bình</div>
                                        <div style="font-size:1.8rem; font-weight:800; color:#f59e0b;">${Number(revData.trung_binh).toFixed(1)} <span style="font-size:0.95rem; color:var(--text-muted);">/ 5.0 (${revData.tong_so} đánh giá)</span></div>
                                    </div>
                                    <div>${renderGuestAverageStars(revData.trung_binh, '1.35rem')}</div>
                                `;
                                renderGuestModalReviewsList();
                            } else {
                                const titleText = guestRevModal.querySelector('h3')?.innerText.replace('Đánh giá:', '').trim() || 'Cụm sân';
                                openGuestReviewsModal(currentGuestViewedReviewClusterId, titleText);
                            }
                        }
                    } catch (err) {}
                }
            });
    }
});

async function loadClusters() {
    appContent.innerHTML = '<div style="text-align:center; padding: 40px;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:#10B981"></i></div>';
    try {
        const [res, ratingRes] = await Promise.all([
            fetch(`${API_BASE_URL}/cum-san`),
            fetch(`${API_BASE_URL}/danh-gia`)
        ]);
        const data = await res.json();
        const ratingMap = (await ratingRes.json()).data || {};

        appState.clusters = (data.data || []).filter(c => c.TrangThai === 'HoatDong' || (!c.TrangThai && c.deleted_at === null)).map(c => {
            const maCS = c.MaCumSan || c.ID;
            const r = ratingMap[maCS];
            return {
                ...c,
                avg_rating: r ? Number(r.trung_binh_sao) : (c.danh_gias_avg_so_sao ? Math.round(c.danh_gias_avg_so_sao * 10) / 10 : 0),
                total_reviews: r ? Number(r.tong_danh_gia) : (c.danh_gias_count || 0)
            };
        });
        renderClusters();
    } catch (err) {
        appContent.innerHTML = '<p style="text-align:center; color:red;">Lỗi tải dữ liệu. Vui lòng thử lại.</p>';
    }
}

function renderClusters() {
    breadcrumbEl.style.display = 'none';
    let html = `
        <div class="guest-view-animate">
            <div style="margin-bottom: 26px; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px;">
                <div>
                    <div style="font-size: 0.82rem; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px;">
                        <i class="fa-solid fa-futbol"></i> Đặt sân trực tuyến nhanh chóng
                    </div>
                    <h2 style="font-size: 1.85rem; color: var(--text-main); margin: 0;">Danh Sách Cụm Sân</h2>
                </div>
                <span style="font-size: 0.9rem; color: var(--text-muted); background: #FFFFFF; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border-color);">
                    Chọn một cơ sở bên dưới để xem sân và lịch trống
                </span>
            </div>
            <div class="cluster-grid">
    `;

    appState.clusters.forEach(c => {
        const maCS = c.MaCumSan || c.ID;
        const avgStar = c.total_reviews > 0 ? Number(c.avg_rating).toFixed(1) : '0.0';
        const reviewText = `(${c.total_reviews} đánh giá)`;

        html += `
            <div class="cluster-card" onclick="loadPitches('${maCS}')">
                <div class="cluster-img-box">
                    ${c.HinhAnh ? `<img src="http://127.0.0.1:8000${c.HinhAnh}" class="cluster-img">` : `<div style="display:flex; height:100%; align-items:center; justify-content:center; background:#E2E8F0;"><i class="fa-solid fa-futbol fa-3x" style="color:#94A3B8"></i></div>`}
                </div>
                <div class="cluster-info">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px;">
                        <h3 class="cluster-name" style="margin:0;">${c.TenCumSan}</h3>
                        <button type="button" onclick="event.stopPropagation(); openGuestReviewsModal('${maCS}', '${c.TenCumSan.replace(/'/g, "\\'")}')" style="background:#FFFBEB; border:1px solid #FDE68A; color:#B45309; padding:4px 10px; border-radius:999px; font-size:0.78rem; font-weight:700; cursor:pointer; white-space:nowrap; transition: 0.2s;">
                            <i class="fa-solid fa-star" style="color:#F59E0B;"></i> ${avgStar} <span style="font-weight:500; color:#92400E;">${reviewText}</span>
                        </button>
                    </div>
                    <div class="cluster-meta"><i class="fa-solid fa-location-dot" style="color: var(--primary);"></i> ${c.DiaChi}</div>
                    <div class="cluster-meta" style="margin-bottom: 0;"><i class="fa-regular fa-clock" style="color: #0284C7;"></i> Giờ hoạt động: <strong style="color: var(--text-main);">${c.GioMoCua?.substring(0,5)} - ${c.GioDongCua?.substring(0,5)}</strong></div>
                </div>
            </div>
        `;
    });
    appContent.innerHTML = html + '</div></div>';
}

async function loadPitches(clusterId) {
    appState.currentCluster = appState.clusters.find(c => (c.MaCumSan || c.ID) == clusterId);
    renderBreadcrumb('pitches');
    appContent.innerHTML = '<div style="text-align:center; padding: 40px;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:#16A34A"></i></div>';

    try {
        const res = await fetch(`${API_BASE_URL}/san-bong?cum_san_id=${clusterId}`);
        const data = await res.json();
        const activePitches = (data.data || []).filter(sb => sb.TrangThai === 'HoatDong');

        const c = appState.currentCluster;
        let headerHtml = `
            <div class="guest-view-animate">
            <div style="background: linear-gradient(135deg, #FFFFFF 0%, #F0FDF4 100%); border: 1px solid #BBF7D0; border-left: 5px solid var(--primary); border-radius: 14px; padding: 20px 24px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; box-shadow: var(--shadow-sm);">
                <div>
                    <div style="font-size: 0.78rem; color: #15803D; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
                        <i class="fa-solid fa-circle-check"></i> Đang xem danh sách sân thuộc cụm
                    </div>
                    <h2 style="font-size: 1.5rem; color: var(--text-main); margin-bottom: 8px;">${c.TenCumSan}</h2>
                    <div style="display: flex; gap: 20px; flex-wrap: wrap; font-size: 0.9rem; color: var(--text-muted);">
                        <span><i class="fa-solid fa-location-dot" style="color: var(--primary); margin-right: 6px;"></i>${c.DiaChi}</span>
                        <span><i class="fa-regular fa-clock" style="color: #0284C7; margin-right: 6px;"></i>Giờ mở cửa: <strong style="color: var(--text-main);">${c.GioMoCua?.substring(0,5)} - ${c.GioDongCua?.substring(0,5)}</strong></span>
                    </div>
                </div>
                <div style="background: #DCFCE7; border: 1px solid #86EFAC; padding: 8px 16px; border-radius: 10px; color: #15803D; font-weight: 700; font-size: 0.9rem;">
                    <i class="fa-solid fa-futbol" style="margin-right: 6px;"></i> ${activePitches.length} sân đang hoạt động
                </div>
            </div>
        `;

        if (activePitches.length === 0) {
            appContent.innerHTML = headerHtml + `
                <div style="text-align: center; padding: 50px 20px; background: #FFFFFF; border: 1px dashed #CBD5E1; border-radius: 14px;">
                    <i class="fa-solid fa-circle-exclamation fa-3x" style="color: #F59E0B; margin-bottom: 16px;"></i>
                    <h3 style="color: var(--text-main); font-size: 1.25rem; margin-bottom: 8px;">Hiện không có sân bóng nào</h3>
                    <p style="color: var(--text-muted); font-size: 0.95rem;">Cụm sân này hiện chưa có sân con nào hoạt động. Vui lòng chọn cụm sân khác.</p>
                </div></div>
            `;
            return;
        }

        let html = headerHtml + '<div class="pitch-grid">';
        activePitches.forEach(sb => {
            const maSB = sb.MaSanBong || sb.ID;
            const loaiName = sb.loaiSan?.TenLoaiSan || sb.loai_san?.TenLoaiSan || 'Khác';
            const specInfo = (sb.KichThuoc || sb.DienTich) 
                ? `<div style="font-size: 0.8rem; color: #475569; margin-top: 4px;"><i class="fa-solid fa-ruler-combined" style="color: var(--primary); margin-right: 4px;"></i>${sb.KichThuoc ? sb.KichThuoc : ''}${sb.KichThuoc && sb.DienTich ? ' • ' : ''}${sb.DienTich ? Number(sb.DienTich) + 'm²' : ''}</div>` 
                : '';
            const moTaInfo = sb.MoTa ? `<div style="font-size: 0.78rem; color: #64748B; margin-top: 4px;">${sb.MoTa}</div>` : '';

            html += `
                <div class="pitch-card" onclick="loadSchedule('${clusterId}', '${maSB}')">
                    <div style="padding: 20px 22px; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                        <div>
                            <div class="pitch-card-name">${sb.TenSan}</div>
                            <div class="pitch-card-type"><i class="fa-solid fa-layer-group" style="color: var(--primary);"></i> ${loaiName}</div>
                            ${specInfo}
                            ${moTaInfo}
                        </div>
                        <span style="background: #F0FDF4; border: 1px solid #BBF7D0; color: #15803D; padding: 8px 14px; border-radius: 10px; font-size: 0.85rem; font-weight: 700; flex-shrink: 0;">Xem lịch &rarr;</span>
                    </div>
                </div>
            `;
        });
        appContent.innerHTML = html + '</div></div>';
    } catch (err) {
        appContent.innerHTML = '<p style="text-align:center; color:red;">Lỗi tải dữ liệu sân.</p>';
    }
}

async function loadSchedule(clusterId, pitchId) {
    appContent.innerHTML = '<div style="text-align:center; padding: 40px;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:#16A34A"></i></div>';

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

        const pitch = pitches.find(p => (p.MaSanBong || p.ID) == pitchId);
        appState.currentPitch = pitch;
        
        renderBreadcrumb('schedule');

        const c = appState.currentCluster;
        const loaiName = pitch.loaiSan?.TenLoaiSan || pitch.loai_san?.TenLoaiSan || 'Sân bóng';
        const pitchLoaiId = pitch.MaLoaiSan || pitch.ID_LoaiSan;

        const validPrices = prices.filter(gt => (gt.MaLoaiSan || gt.ID_LoaiSan) == pitchLoaiId);
        const validKhungGioIds = validPrices.map(gt => gt.MaKhungGio || gt.ID_KhungGio);
        const availableTimeSlots = timeSlots.filter(kg => validKhungGioIds.includes(kg.MaKhungGio || kg.ID));

        const dateArray = [];
        const today = new Date();
        for (let i = 0; i < 7; i++) {
            let d = new Date(today);
            d.setDate(today.getDate() + i);
            const pad = n => n < 10 ? '0' + n : n;
            const dow = d.getDay();
            dateArray.push({
                dayLabel: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dow],
                isWeekend: (dow === 0 || dow === 6),
                short: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
                dbDate: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
                rawDate: d
            });
        }

        let html = `
            <div class="guest-view-animate">
            <div style="background: linear-gradient(135deg, #FFFFFF 0%, #F0FDF4 100%); border: 1px solid #BBF7D0; border-left: 5px solid var(--primary); border-radius: 14px; padding: 18px 24px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; box-shadow: var(--shadow-sm);">
                <div>
                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px;">
                        <span style="background: #DCFCE7; color: #15803D; border: 1px solid #86EFAC; padding: 4px 10px; border-radius: 8px; font-size: 0.8rem; font-weight: 700;">
                            <i class="fa-solid fa-building-flag" style="margin-right: 4px;"></i> ${c.TenCumSan}
                        </span>
                        <i class="fa-solid fa-chevron-right" style="font-size: 0.75rem; color: #94A3B8;"></i>
                        <h2 style="font-size: 1.4rem; color: #0F172A; margin: 0;">${pitch.TenSan}</h2>
                        <span style="background: #F1F5F9; color: #334155; border: 1px solid #CBD5E1; padding: 4px 10px; border-radius: 8px; font-size: 0.8rem; font-weight: 700;">
                            <i class="fa-solid fa-layer-group" style="color: var(--primary); margin-right: 4px;"></i> ${loaiName}
                        </span>
                    </div>
                    <div style="font-size: 0.88rem; color: #475569;">
                        <i class="fa-solid fa-location-dot" style="color: var(--primary); margin-right: 6px;"></i> ${c.DiaChi}
                    </div>
                </div>
                <div style="font-size: 0.85rem; color: #334155; background: #FFFFFF; padding: 10px 14px; border-radius: 10px; border: 1px solid #CBD5E1;">
                    <i class="fa-solid fa-hand-pointer" style="color: var(--primary); margin-right: 6px;"></i> Nhấn vào ô <strong style="color: #15803D;">TRỐNG</strong> để chọn khung giờ đặt sân
                </div>
            </div>
            
            <!-- Thanh Quy định & Chú thích màu trạng thái -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; background: #FFFFFF; padding: 12px 16px; border-radius: 12px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                <div style="position: relative; display: inline-block;">
                    <button type="button" onclick="toggleGuestRuleDropdown(event)" style="background-color: #FFFBEB; color: #B45309; border: 1px solid #FDE68A; padding: 8px 14px; border-radius: 8px; font-size: 0.85rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-circle-info" style="color: #D97706;"></i> Xem quy định đặt & hủy sân
                    </button>

                    <div id="guest-rule-dropdown-box" style="display: none; position: absolute; top: 118%; left: 0; width: 680px; max-width: 90vw; background-color: #FFFFFF; border: 1px solid #FDE68A; border-top: 4px solid #F59E0B; border-radius: 12px; padding: 18px 22px; box-shadow: 0 15px 35px rgba(15, 23, 42, 0.14); z-index: 99;">
                        <h4 style="color: #92400E; margin: 0 0 10px 0; font-size: 0.98rem; font-weight: 800; display: flex; align-items: center; gap: 8px;">
                            <i class="fa-solid fa-shield-halved" style="color: #F59E0B;"></i> Quy định đặt sân phong trào
                        </h4>
                        <ul style="color: #334155; font-size: 0.88rem; margin: 0 0 0 18px; padding: 0; line-height: 1.7; list-style-type: disc;">
                            <li><strong>Đặt sân phong trào:</strong> Xem lịch và đặt trước trong vòng <strong>7 ngày tới</strong>, thanh toán tiền cọc trước <strong>30%</strong> qua cổng VNPay.</li>
                            <li style="margin-top: 6px;"><strong>Nhận vé điện tử:</strong> Sau khi thanh toán thành công, hệ thống sẽ gửi thông tin vé đặt sân và số điện thoại Hotline hỗ trợ trực tiếp về <strong>Email</strong> bạn đã đăng ký.</li>
                            <li style="margin-top: 6px;"><strong>Quy định hủy lịch & hoàn cọc:</strong> Khách vãng lai không tự hủy lịch trên hệ thống. Khi cần hỗ trợ hủy sân và hoàn cọc, vui lòng liên hệ Hotline của cụm sân/Admin trong vé Email và cung cấp <strong>mã xác thực OTP</strong> được gửi về Email đặt sân.</li>
                        </ul>
                    </div>
                </div>

                <!-- Chú thích 4 trạng thái khung giờ -->
                <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap; font-size: 0.82rem; font-weight: 600; color: #475569;">
                    <span style="display: inline-flex; align-items: center; gap: 6px;">
                        <span style="width: 15px; height: 15px; border-radius: 4px; background: #DCFCE7; border: 1.5px solid #86EFAC; display: inline-block;"></span> Trống
                    </span>
                    <span style="display: inline-flex; align-items: center; gap: 6px;">
                        <span style="width: 15px; height: 15px; border-radius: 4px; background: #EA580C; display: inline-block;"></span> Đang chọn
                    </span>
                    <span style="display: inline-flex; align-items: center; gap: 6px;">
                        <span style="width: 15px; height: 15px; border-radius: 4px; background: #E2E8F0; border: 1px solid #CBD5E1; display: inline-block;"></span> Đã đặt
                    </span>
                    <span style="display: inline-flex; align-items: center; gap: 6px;">
                        <span style="width: 15px; height: 15px; border-radius: 4px; background: #F8FAFC; border: 1px dashed #CBD5E1; display: inline-block;"></span> Quá giờ
                    </span>
                </div>
            </div>

            <div class="schedule-container" style="position: relative; background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 14px; overflow-x: auto;">
                <table class="schedule-table" style="width: 100%; border-collapse: separate; border-spacing: 0; min-width: 900px; table-layout: auto;">
                    <thead>
                        <tr>
                            <th style="width: 130px; min-width: 130px; padding: 14px 10px; border-bottom: 2px solid #CBD5E1; border-right: 1px solid #E2E8F0; background: #F8FAFC; position: sticky; top: 0; left: 0; z-index: 50; text-align: center; color: #0F172A;">
                                Khung giờ
                            </th>
                            <th style="width: 105px; min-width: 105px; padding: 14px 10px; border-bottom: 2px solid #CBD5E1; border-right: 2px solid #CBD5E1; background: #F8FAFC; position: sticky; top: 0; left: 130px; z-index: 49; text-align: center; color: #0F172A;">
                                Giá sân
                            </th>
                            ${dateArray.map((d) => `
                                <th style="min-width: 108px; padding: 10px 8px; text-align: center; white-space: nowrap; border-bottom: 2px solid #CBD5E1; border-right: 1px solid #F1F5F9; background: ${d.isWeekend ? '#FFFBEB' : '#F8FAFC'}; position: sticky; top: 0; z-index: 40; color: #0F172A;">
                                    <div style="font-size: 0.74rem; font-weight: 700; color: ${d.isWeekend ? '#D97706' : '#64748B'}; line-height: 1.2; margin-bottom: 2px;">${d.dayLabel}</div>
                                    <div style="font-size: 0.92rem; font-weight: 800; color: #0F172A;">${d.short}</div>
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        const maPitch = pitch.MaSanBong || pitch.ID;

        availableTimeSlots.forEach(kg => {
            const maKG = kg.MaKhungGio || kg.ID;
            const priceInfo = validPrices.find(p => (p.MaKhungGio || p.ID_KhungGio) == maKG);
            const priceVal = priceInfo ? Number(priceInfo.SoTien).toLocaleString('vi-VN') + 'đ' : '0đ';
            const timeStr = `${kg.GioBatDau.substring(0,5)} - ${kg.GioKetThuc.substring(0,5)}`;
            
            html += `
                <tr>
                    <td style="width: 130px; min-width: 130px; background: #FFFFFF; position: sticky; left: 0; z-index: 15; border-right: 1px solid #E2E8F0; border-bottom: 1px solid #F1F5F9; text-align: center; padding: 10px; white-space: nowrap; color: #0F172A;">
                        <strong>${timeStr}</strong>
                    </td>
                    <td style="width: 105px; min-width: 105px; background: #FFFFFF; position: sticky; left: 130px; z-index: 14; color: #15803D; font-weight: 700; border-right: 2px solid #E2E8F0; border-bottom: 1px solid #F1F5F9; text-align: center; padding: 10px;">
                        ${priceVal}
                    </td>
            `;
            
            dateArray.forEach(date => {
                const isBooked = booked.some(b => b.NgayDa === date.dbDate && (b.MaKhungGio || b.ID_KhungGio) === maKG);
                const isPast = new Date(date.rawDate.getFullYear(), date.rawDate.getMonth(), date.rawDate.getDate(), kg.GioBatDau.split(':')[0], kg.GioBatDau.split(':')[1]) <= new Date();

                const slotId = `${maPitch}-${date.dbDate}-${maKG}`;
                const isSelected = guestSelectedSlots.some(s => s.id === slotId);
                const slotDataStr = `'${timeStr}', '${priceVal}', '${date.short}', '${maKG}'`;

                if (isPast) {
                    html += `<td style="text-align:center; border-bottom: 1px solid #F1F5F9; border-right: 1px solid #F8FAFC;"><button class="slot-btn past" data-slot-id="${slotId}" disabled>Quá giờ</button></td>`;
                } else if (isBooked) {
                    html += `<td style="text-align:center; border-bottom: 1px solid #F1F5F9; border-right: 1px solid #F8FAFC;"><button class="slot-btn booked" data-slot-id="${slotId}" data-slot-data="${slotDataStr}" disabled>Đã đặt</button></td>`;
                } else if (isSelected) {
                    html += `<td style="text-align:center; border-bottom: 1px solid #F1F5F9; border-right: 1px solid #F8FAFC;"><button class="slot-btn available selected" data-slot-id="${slotId}" data-slot-data="${slotDataStr}" onclick="triggerModal(this, ${slotDataStr})">ĐÃ CHỌN ✓</button></td>`;
                } else {
                    html += `<td style="text-align:center; border-bottom: 1px solid #F1F5F9; border-right: 1px solid #F8FAFC;"><button class="slot-btn available" data-slot-id="${slotId}" data-slot-data="${slotDataStr}" onclick="triggerModal(this, ${slotDataStr})">TRỐNG</button></td>`;
                }
            });
            html += `</tr>`;
        });

        appContent.innerHTML = html + '</tbody></table></div></div>';
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

    const maCS = appState.currentCluster?.MaCumSan || appState.currentCluster?.ID || '';

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
            <span class="breadcrumb-item" onclick="loadPitches('${maCS}')">
                <i class="fa-solid fa-arrow-left"></i> Chọn sân khác thuộc ${appState.currentCluster.TenCumSan}
            </span>
            <div style="font-size: 0.9rem; color: var(--text-muted);">
                <span style="cursor: pointer; text-decoration: underline;" onclick="renderClusters()">Cụm sân</span> &gt; 
                <span style="cursor: pointer; text-decoration: underline;" onclick="loadPitches('${maCS}')">${appState.currentCluster?.TenCumSan || ''}</span> &gt; 
                <strong style="color: var(--accent);">${appState.currentPitch?.TenSan || ''}</strong>
            </div>
        `;
    }
}

function triggerModal(element, time, price, dateStr, kgId) {
    const priceNum = parseInt(price.replace(/\D/g, ''));
    const maCS = appState.currentCluster.MaCumSan || appState.currentCluster.ID;
    const maSB = appState.currentPitch.MaSanBong || appState.currentPitch.ID;
    toggleGuestSlot(element, maCS, appState.currentCluster.TenCumSan, maSB, appState.currentPitch.TenSan, dateStr, time, priceNum, kgId);
}

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
            clusterId,
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
        cartBar.style.display = 'block'; 
        document.getElementById('guest-cart-count').innerText = guestSelectedSlots.length;
        const total = guestSelectedSlots.reduce((sum, s) => sum + Number(s.price), 0);
        document.getElementById('guest-floating-deposit').innerText = Math.round(total * 0.3).toLocaleString('vi-VN') + 'đ';
    } else {
        cartBar.style.display = 'none';
        closeGuestCartModal();
    }
}

window.clearGuestCart = function() {
    guestSelectedSlots = [];
    
    const allButtons = document.querySelectorAll('.slot-btn.available.selected');
    allButtons.forEach(btn => {
        btn.classList.remove('selected');
        btn.innerText = 'TRỐNG';
    });
    
    updateGuestFloatingCart();
};

window.openGuestCartModal = function() {
    document.getElementById('guest-cart-alert').style.display = 'none';
    const listContainer = document.getElementById('guest-cart-list');
    
    let html = '';
    let totalAmount = 0;

    // Gom theo từng cụm sân để tính đúng thuế VAT (8% làm tròn dưới hàng nghìn) của từng hóa đơn cụm sân
    const clusterTotals = {};
    
    guestSelectedSlots.forEach((s, index) => {
        const priceNum = Number(s.price || 0);
        totalAmount += priceNum;
        const cKey = String(s.clusterId || s.clusterName || 'default');
        clusterTotals[cKey] = (clusterTotals[cKey] || 0) + priceNum;

        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 6px;">
                <div>
                    <h4 style="font-size: 0.88rem; font-weight: 700; margin: 0 0 2px 0; color: #16a34a;">${s.clusterName} - ${s.pitchName}</h4>
                    <p style="margin: 0; color: #64748b; font-size: 0.8rem;">Ngày: <strong style="color: #0f172a;">${s.dateDisplay}</strong> | Giờ: <strong style="color: #0f172a;">${s.timeStr}</strong></p>
                </div>
                <div style="text-align: right; display: flex; align-items: center; gap: 10px;">
                    <span style="color: #ea580c; font-weight: 700; font-size: 0.88rem;">${priceNum.toLocaleString('vi-VN')}đ</span>
                    <i class="fa-solid fa-trash-can" style="color: #ef4444; cursor: pointer; font-size: 0.9rem;" onclick="removeGuestSlotByIndex(${index})"></i>
                </div>
            </div>
        `;
    });

    // Tính tổng thuế VAT 8% (làm tròn dưới hàng nghìn trên từng cụm sân)
    let totalVatAmount = 0;
    const clusterCount = Object.keys(clusterTotals).length;
    Object.values(clusterTotals).forEach(subTotal => {
        totalVatAmount += Math.floor((subTotal * 0.08) / 1000) * 1000;
    });
    const totalInvoiceAmount = totalAmount + totalVatAmount;
    const depositAmount = Math.round(totalAmount * 0.3);

    // Khung chi tiết tiền sân + Thuế VAT 8% + Tổng hóa đơn tương tự Khách hàng có tài khoản
    html += `
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px 14px; margin-top: 10px; font-size: 0.86rem; color: #334155;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span style="color: #64748b;">Tổng tiền sân gốc (${guestSelectedSlots.length} ca${clusterCount > 1 ? ` • ${clusterCount} Hóa đơn` : ''}):</span>
                <strong style="color: #0f172a;">${totalAmount.toLocaleString('vi-VN')}đ</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px dashed #cbd5e1;">
                <span style="color: #64748b;">Thuế VAT (8%):</span>
                <strong style="color: #475569;">+${totalVatAmount.toLocaleString('vi-VN')}đ</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.92rem;">
                <span style="font-weight: 700; color: #0f172a;">Tổng cộng Hóa đơn:</span>
                <strong style="color: #2563eb;">${totalInvoiceAmount.toLocaleString('vi-VN')}đ</strong>
            </div>
        </div>
    `;
    
    listContainer.innerHTML = html;
    document.getElementById('guest-cart-total-deposit').innerText = depositAmount.toLocaleString('vi-VN') + 'đ';
    
    const modal = document.getElementById('guest-cart-modal');
    modal.style.display = 'flex';
    modal.classList.add('active');
};

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
};

window.closeGuestCartModal = function() {
    const modal = document.getElementById('guest-cart-modal');
    if (modal) {
        modal.classList.remove('active');
    }
};

window.showGuestAlert = function(message, isSuccess) {
    const alertBox = document.getElementById('guest-cart-alert');
    alertBox.textContent = message;
    alertBox.className = 'modal-alert ' + (isSuccess ? 'success' : 'error');
    alertBox.style.display = 'block';
};

window.checkoutGuestBooking = async function() {
    const name = document.getElementById('guest-name').value.trim();
    const phone = document.getElementById('guest-phone').value.trim();
    const email = document.getElementById('guest-email').value.trim();
    const alertBox = document.getElementById('guest-cart-alert');
    
    alertBox.style.display = 'none';

    if (!name || !phone || !email) {
        return showGuestAlert('Vui lòng điền đầy đủ Họ tên, Số điện thoại và Email!', false);
    }

    const nameRegex = /^[a-zA-ZÀ-ỹ\s]{2,100}$/;
    if (!nameRegex.test(name)) {
        return showGuestAlert('Họ và tên không hợp lệ (chỉ gồm chữ cái, tối thiểu 2 ký tự)!', false);
    }

    const phoneRegex = /^0[0-9]{9}$/;
    if (!phoneRegex.test(phone)) {
        return showGuestAlert('Số điện thoại không hợp lệ (phải gồm 10 chữ số và bắt đầu bằng số 0)!', false);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return showGuestAlert('Địa chỉ Email không đúng định dạng (ví dụ: ten@gmail.com)!', false);
    }

    const btn = document.getElementById('btn-checkout-guest');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right: 5px;"></i> Đang tạo mã thanh toán...';
    btn.disabled = true;

    let data = null;
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

        data = await response.json();

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
};

let guestResultTimer = null;
let guestResultCountdown = null;

window.showGuestPaymentResultModal = function(status, maHoaDon = null) {
    let modal = document.getElementById('guest-payment-result-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'guest-payment-result-modal';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }

    const invoiceIds = maHoaDon ? String(maHoaDon).split(',').map(s => s.trim()).filter(Boolean) : [];

    let iconHtml = '';
    let title = '';
    let message = '';
    let btnColor = '';

    if (status === 'success') {
        iconHtml = '<i class="fa-solid fa-circle-check" style="font-size: 3.5rem; color: #22C55E;"></i>';
        title = 'Đặt sân thành công!';
        const hdLabel = invoiceIds.length > 0 ? ` (Mã hóa đơn: <strong style="color:#22C55E;">#${invoiceIds.join(', #')}</strong>)` : '';
        message = `Thanh toán qua VNPay đã hoàn tất${hdLabel}. Chúng tôi đã gửi Hóa đơn và Vé điện tử QR về Email của bạn.<br><br><strong style="color:#0f172a;">Bạn có muốn xuất hóa đơn đặt sân ngay bây giờ không?</strong>`;
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

    const printButtonsHtml = invoiceIds.map(idHD => `
        <button type="button" class="btn" onclick="exportGuestBookingInvoice('${idHD}')" style="flex: 1.3; background: #22C55E; color: #0F172A; font-weight: 700; padding: 12px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap;">
            <i class="fa-solid fa-print"></i> Xuất HĐ #${idHD}
        </button>
    `).join('');

    const actionButtonsHtml = (status === 'success' && invoiceIds.length > 0)
        ? `
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                <button type="button" class="btn" onclick="closeGuestPaymentResultModal()" style="flex: 1; background: #334155; color: #f8fafc; font-weight: 600; padding: 12px; border-radius: 10px;">
                    Đóng
                </button>
                ${printButtonsHtml}
            </div>
        `
        : `
            <button type="button" class="btn" id="btn-close-guest-result" onclick="closeGuestPaymentResultModal()" style="width: 100%; background: ${btnColor}; color: #0F172A; font-weight: 700; padding: 12px;">
                Đóng
            </button>
        `;

    modal.innerHTML = `
        <div class="modal-card" style="max-width: 460px; text-align: center; padding: 28px 24px;">
            <div style="margin-bottom: 16px;">${iconHtml}</div>
            <h3 style="font-size: 1.35rem; color: var(--text-main); margin-bottom: 10px;">${title}</h3>
            <p style="color: var(--text-muted); font-size: 0.92rem; line-height: 1.6; margin-bottom: 24px;">${message}</p>
            ${actionButtonsHtml}
        </div>
    `;

    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
};

// Hàm Xuất / In Hóa Đơn Đặt Sân cho Khách Vãng Lai
window.exportGuestBookingInvoice = async function(maHoaDon) {
    try {
        const res = await fetch(`${API_BASE_URL}/hoa-don-dat-san/${maHoaDon}`);
        const json = await res.json();
        if (!json.success || !json.data) {
            alert(json.message || 'Không tìm thấy dữ liệu hóa đơn!');
            return;
        }
        const hd = json.data;
        const listDatSan = hd.dat_sans || hd.datSans || [];
        const first = listDatSan[0] || {};
        const tenKhach = hd.nguoi_dung?.HoTen || first.TenNguoiDat || first.TenKhachVangLai || 'Khách vãng lai';
        const sdtKhach = hd.nguoi_dung?.SoDienThoai || first.SDTNguoiDat || first.SDTKhachVangLai || 'N/A';
        const ngayLap = hd.NgayTao ? new Date(hd.NgayTao).toLocaleString('vi-VN') : new Date().toLocaleString('vi-VN');

        let tongTienSanGoc = 0;
        const rowsHtml = listDatSan.map((ds, i) => {
            const tenSan = ds.san_bong?.TenSan || 'Sân bóng';
            const cumSan = ds.san_bong?.cum_san?.TenCumSan || '';
            const kg = ds.khung_gio ? `${ds.khung_gio.GioBatDau.substring(0,5)} - ${ds.khung_gio.GioKetThuc.substring(0,5)}` : '';
            const ngayDa = ds.NgayDa ? ds.NgayDa.split('-').reverse().join('/') : '';
            const donGia = Number(ds.pivot?.DonGia ?? ds.TongTien ?? 0);
            if (ds.TrangThai !== 'DaHuy') tongTienSanGoc += donGia;

            return `
                <tr>
                    <td style="text-align:center;">${i + 1}</td>
                    <td style="text-align:center; font-family:monospace; font-weight:bold;">#PT-${ds.MaDatSan || ds.ID}</td>
                    <td><strong>${tenSan}</strong><br><small>${cumSan}</small></td>
                    <td style="text-align:center;">${kg}<br><small>${ngayDa}</small></td>
                    <td style="text-align:right;">${donGia.toLocaleString('vi-VN')}đ</td>
                    <td style="text-align:right; color:#047857; font-weight:bold;">${Number(ds.TienCoc).toLocaleString('vi-VN')}đ</td>
                </tr>
            `;
        }).join('');

        const tongTien = Number(hd.TongTien ?? hd.TongTienSan ?? 0);
        const thueVAT = Number(hd.ThueVAT || 0);
        const tienCoc = Number(hd.TienDaCoc || 0);
        const conLai = Math.max(0, tongTien - tienCoc);

        const printWin = window.open('', '_blank', 'width=850,height=720');
        if (!printWin) return alert('Vui lòng cho phép mở cửa sổ Pop-up để in hóa đơn!');

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
                    .summary { width: 340px; margin-left: auto; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; font-size: 13.5px; }
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
                        Ngày lập: ${ngayLap}
                    </div>
                </div>
                <h2>HÓA ĐƠN ĐẶT SÂN</h2>
                <p><strong>Khách hàng:</strong> ${tenKhach} &bull; <strong>Số điện thoại:</strong> ${sdtKhach}</p>
                <p><strong>Phương thức thanh toán cọc:</strong> Chuyển khoản VNPay</p>
                <table>
                    <thead>
                        <tr>
                            <th>STT</th>
                            <th>Mã Vé</th>
                            <th>Sân Bóng & Cơ Sở</th>
                            <th>Khung Giờ & Ngày Đá</th>
                            <th>Đơn Giá Khung Giờ</th>
                            <th>Tiền Đã Cọc</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
                <div class="summary">
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px;"><span>Tổng tiền sân gốc:</span><strong>${tongTienSanGoc.toLocaleString('vi-VN')}đ</strong></div>
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
        alert('Lỗi tải hóa đơn!');
    }
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

let guestModalReviewsData = [];
let guestModalReviewSort = 'all';
let guestModalReviewPage = 1;
let currentGuestViewedReviewClusterId = null;
const GUEST_REVIEWS_PER_PAGE = 6;

// Hàm vẽ dải 5 ngôi sao theo đúng tỷ lệ phần trăm điểm trung bình (VD: 4.0 -> 4 sao vàng, 1 sao xám; 4.7 -> 4 sao vàng + sao thứ 5 vàng 70%)
window.renderGuestAverageStars = function(avgScore, fontSize = '1.35rem') {
    const score = Math.max(0, Math.min(5, Number(avgScore) || 0));
    let html = `<div style="display: inline-flex; align-items: center; gap: 3px; font-size: ${fontSize}; line-height: 1;" title="${score.toFixed(1)} / 5.0 sao">`;
    for (let i = 1; i <= 5; i++) {
        const fillPct = Math.max(0, Math.min(1, score - (i - 1))) * 100;
        html += `
            <span style="position: relative; display: inline-block; color: #CBD5E1;">
                <i class="fa-solid fa-star"></i>
                <span style="position: absolute; top: 0; left: 0; width: ${fillPct}%; overflow: hidden; color: #F59E0B; white-space: nowrap;">
                    <i class="fa-solid fa-star"></i>
                </span>
            </span>
        `;
    }
    html += `</div>`;
    return html;
};

window.openGuestReviewsModal = async function(idCumSan, tenCumSan) {
    currentGuestViewedReviewClusterId = idCumSan;

    let modal = document.getElementById('guest-reviews-modal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'guest-reviews-modal';
        modal.className = 'modal-overlay';
        modal.onclick = function(e) {
            if (e.target === modal) {
                modal.classList.remove('active');
                setTimeout(() => modal.style.display = 'none', 200);
            }
        };
        document.body.appendChild(modal);
    }

    // Khung .modal-card đặt overflow: hidden và tách riêng phần Header cố định + phần Body cuộn bên trong để 4 góc luôn bo tròn đẹp
    modal.innerHTML = `
        <div class="modal-card" style="max-width: 580px; width: 92%; max-height: 86vh; padding: 0; overflow: hidden; display: flex; flex-direction: column; border-radius: 18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; padding: 16px 22px; background: #FFFFFF; border-bottom:1px solid var(--border-color); flex-shrink: 0;">
                <h3 style="margin:0; font-size:1.15rem; color:var(--text-main); display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-star" style="color:#F59E0B;"></i>
                    <span>Đánh giá: ${tenCumSan}</span>
                </h3>
                <button class="modal-close-btn" style="position:static;" onclick="document.getElementById('guest-reviews-modal').classList.remove('active'); setTimeout(()=>document.getElementById('guest-reviews-modal').style.display='none',200)">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div id="guest-reviews-content" style="text-align:left; padding: 18px 22px 20px; overflow-y: auto; flex: 1;">
                <div style="text-align:center; padding:30px;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:#16A34A"></i></div>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);

    try {
        const res = await fetch(`${API_BASE_URL}/danh-gia?id_cum_san=${idCumSan}`);
        const data = await res.json();
        const box = document.getElementById('guest-reviews-content');

        if (!data.success || data.tong_so === 0) {
            box.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">Chưa có đánh giá nào cho cụm sân này.</div>`;
            return;
        }

        guestModalReviewsData = data.data || [];
        guestModalReviewSort = 'all';
        guestModalReviewPage = 1;

        box.innerHTML = `
            <div style="background:var(--bg-tertiary); border:1px solid var(--border-color); border-radius:12px; padding:14px 18px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                <div>
                    <div style="font-size:0.82rem; color:var(--text-muted); font-weight:600;">Điểm đánh giá trung bình</div>
                    <div style="font-size:1.85rem; font-weight:800; color:#F59E0B; line-height:1.2; margin-top:2px;">
                        ${Number(data.trung_binh).toFixed(1)} <span style="font-size:0.95rem; color:var(--text-muted); font-weight:600;">/ 5.0 (${data.tong_so} đánh giá)</span>
                    </div>
                </div>
                <div>${renderGuestAverageStars(data.trung_binh, '1.35rem')}</div>
            </div>

            <div id="guest-review-filter-btns" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid var(--border-color);"></div>
            <div id="guest-review-items-box"></div>
            <div id="guest-review-pagination" style="display:flex; justify-content:center; align-items:center; gap:6px; margin-top:14px;"></div>
        `;

        renderGuestModalReviewsList();
    } catch (e) {
        document.getElementById('guest-reviews-content').innerHTML = `<p style="color:red; text-align:center;">Lỗi tải đánh giá.</p>`;
    }
};

window.setGuestModalReviewSort = function(sortType) {
    guestModalReviewSort = sortType;
    guestModalReviewPage = 1;
    renderGuestModalReviewsList();
};

window.changeGuestModalReviewPage = function(page) {
    guestModalReviewPage = page;
    renderGuestModalReviewsList();
};

function renderGuestModalReviewsList() {
    const filterBox = document.getElementById('guest-review-filter-btns');
    const listBox = document.getElementById('guest-review-items-box');
    const pageBox = document.getElementById('guest-review-pagination');
    if (!listBox) return;

    const buttons = [
        { key: 'all', label: 'Tất cả' },
        { key: 'newest', label: 'Mới nhất' },
        { key: 'highest', label: 'Cao nhất' },
        { key: 'lowest', label: 'Thấp nhất' }
    ];

    if (filterBox) {
        filterBox.innerHTML = buttons.map(b => {
            const active = guestModalReviewSort === b.key;
            const style = active
                ? 'background: #16A34A; color: #FFFFFF; border: 1px solid #16A34A;'
                : 'background: #FFFFFF; color: #475569; border: 1px solid #CBD5E1;';
            return `<button type="button" onclick="setGuestModalReviewSort('${b.key}')" style="${style} padding: 6px 14px; border-radius: 999px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: 0.15s;">${b.label}</button>`;
        }).join('');
    }

    let sorted = [...guestModalReviewsData];
    if (guestModalReviewSort === 'newest' || guestModalReviewSort === 'all') {
        sorted.sort((a, b) => new Date(b.NgayTao || 0) - new Date(a.NgayTao || 0));
    } else if (guestModalReviewSort === 'highest') {
        sorted.sort((a, b) => Number(b.SoSao) - Number(a.SoSao) || (new Date(b.NgayTao || 0) - new Date(a.NgayTao || 0)));
    } else if (guestModalReviewSort === 'lowest') {
        sorted.sort((a, b) => Number(a.SoSao) - Number(b.SoSao) || (new Date(b.NgayTao || 0) - new Date(a.NgayTao || 0)));
    }

    const totalPages = Math.ceil(sorted.length / GUEST_REVIEWS_PER_PAGE) || 1;
    if (guestModalReviewPage > totalPages) guestModalReviewPage = totalPages;
    const startIdx = (guestModalReviewPage - 1) * GUEST_REVIEWS_PER_PAGE;
    const pageItems = sorted.slice(startIdx, startIdx + GUEST_REVIEWS_PER_PAGE);

    listBox.innerHTML = pageItems.map(r => {
        const stars = '★'.repeat(Number(r.SoSao)) + '☆'.repeat(5 - Number(r.SoSao));
        const d = r.NgayTao ? new Date(r.NgayTao) : null;
        const dateStr = d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : '';
        const maGiai = r.dat_san?.MaGiaiDau || r.dat_san?.ID_GiaiDau || r.dat_san?.giai_dau?.MaGiaiDau || r.dat_san?.giai_dau?.ID || null;
        const isGiaiDau = Boolean(maGiai);

        // Nhãn Giải đấu & Sân bóng rõ nét, độ tương phản cao trên nền sáng
        const subTag = isGiaiDau
            ? `<span style="font-size:0.76rem; font-weight:600; background:#EEF2FF; color:#4338CA; border:1px solid #C7D2FE; padding:2px 8px; border-radius:6px; margin-left:6px; display:inline-block;"><i class="fa-solid fa-trophy"></i> Giải đấu: ${r.dat_san?.giai_dau?.TenGiaiDau || ('#GD-' + maGiai)}</span>`
            : (r.dat_san?.san_bong?.TenSan ? `<span style="font-size:0.76rem; font-weight:600; color:#475569; background:#F1F5F9; border:1px solid #E2E8F0; padding:2px 8px; border-radius:6px; margin-left:6px; display:inline-block;">${r.dat_san.san_bong.TenSan}</span>` : '');

        return `
            <div style="padding:12px 0; border-bottom:1px solid #F1F5F9;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; flex-wrap:wrap; gap:4px;">
                    <div><strong style="color:var(--text-main); font-size:0.93rem;">${r.nguoi_dung?.HoTen || 'Khách hàng'}</strong>${subTag}</div>
                    <span style="color:#64748B; font-size:0.78rem;">${dateStr}</span>
                </div>
                <div style="color:#F59E0B; font-size:0.95rem; letter-spacing:1px; margin-bottom:4px;">${stars}</div>
                <div style="color:#334155; font-size:0.89rem; line-height:1.5;">${r.NoiDung || '<span style="color:#94A3B8; font-style:italic;">(Khách hàng không để lại bình luận)</span>'}</div>
            </div>
        `;
    }).join('');

    if (pageBox) {
        if (totalPages <= 1) {
            pageBox.innerHTML = '';
        } else {
            const isPrevDisabled = guestModalReviewPage === 1;
            const isNextDisabled = guestModalReviewPage === totalPages;

            const baseArrowStyle = `width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid #CBD5E1; background: #FFFFFF; color: #0F172A; transition: 0.2s;`;
            const prevStyle = baseArrowStyle + (isPrevDisabled ? ' opacity: 0.35; cursor: not-allowed;' : ' cursor: pointer;');
            const nextStyle = baseArrowStyle + (isNextDisabled ? ' opacity: 0.35; cursor: not-allowed;' : ' cursor: pointer;');

            let pHtml = `<button type="button" ${isPrevDisabled ? 'disabled' : ''} onclick="changeGuestModalReviewPage(${guestModalReviewPage - 1})" style="${prevStyle}"><i class="fa-solid fa-chevron-left"></i></button>`;
            
            for (let i = 1; i <= totalPages; i++) {
                const active = i === guestModalReviewPage;
                const st = active 
                    ? 'background:#16A34A; color:#FFFFFF; border-color:#16A34A; font-weight:700;' 
                    : 'background:#FFFFFF; color:#0F172A; border-color:#CBD5E1;';
                pHtml += `<button type="button" style="min-width: 34px; height: 34px; padding: 0 10px; border-radius: 8px; border: 1px solid; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; ${st}" onclick="changeGuestModalReviewPage(${i})">${i}</button>`;
            }
            
            pHtml += `<button type="button" ${isNextDisabled ? 'disabled' : ''} onclick="changeGuestModalReviewPage(${guestModalReviewPage + 1})" style="${nextStyle}"><i class="fa-solid fa-chevron-right"></i></button>`;
            pageBox.innerHTML = pHtml;
        }
    }
}