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
                            if (el.textContent.trim().includes('Đã đặt')) {
                                el.classList.remove('booked');
                                el.classList.add('available');
                                el.innerHTML = GUEST_SLOT_LABELS.available;
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
                                slotEl.innerHTML = GUEST_SLOT_LABELS.booked;
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

                // B2. Nếu khách vãng lai đang xem danh sách sân con của 1 Cụm sân -> đồng bộ thông tin cụm & lịch trống realtime
                if (appState.currentCluster !== null && appState.currentPitch === null && document.getElementById('guest-pitches-list-container')) {
                    const currentCId = appState.currentCluster.MaCumSan || appState.currentCluster.ID;
                    const updatedCluster = appState.clusters.find(c => String(c.MaCumSan || c.ID) === String(currentCId));
                    if (!updatedCluster) {
                        // Cụm sân vừa bị bảo trì hoặc ngừng hoạt động -> quay về danh sách cụm sân
                        renderClusters();
                    } else {
                        appState.currentCluster = updatedCluster;
                        await refreshGuestPitchesRealtime();
                    }
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
    appState.currentCluster = null;
    appState.currentPitch = null;
    resetGuestPitchFilterStateHard();
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

// ======================================================
// BỘ LỌC SÂN CON THEO LOẠI SÂN, NHIỀU NGÀY & KHUNG GIỜ (KHÁCH VÃNG LAI)
// ======================================================
let guestPitchFilterState = {
    clusterId: null,
    pitches: [],
    khungGios: [],
    giaTiens: [],
    bookedMap: {},
    dateOptions: [],
    selectedLoaiSanId: 'All',
    selectedDates: [],        // Mảng nhiều ngày (rỗng = kiểm tra trên tất cả các ngày)
    selectedKhungGioIds: [],
    timeSearch: ''
};

function resetGuestPitchFilterStateHard() {
    guestPitchFilterState.clusterId = null;
    guestPitchFilterState.selectedLoaiSanId = 'All';
    guestPitchFilterState.selectedDates = [];
    guestPitchFilterState.selectedKhungGioIds = [];
    guestPitchFilterState.timeSearch = '';
}

function buildGuestPitchDateOptions() {
    const options = [];
    const pad = n => (n < 10 ? '0' + n : n);
    const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        options.push({
            ymd,
            short: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
            full: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
            label: i === 0 ? 'Hôm nay' : (i === 1 ? 'Ngày mai' : dayNames[d.getDay()])
        });
    }
    return options;
}

async function fetchGuestClusterBookedMap(pitches) {
    const cacheBuster = Date.now();
    const entries = await Promise.all(
        pitches.map(async (sb) => {
            const pId = String(sb.MaSanBong || sb.ID);
            try {
                const r = await fetch(`${API_BASE_URL}/dat-san/da-dat?id_san_bong=${pId}&_t=${cacheBuster}`);
                const j = await r.json();
                return [pId, j.data || []];
            } catch (err) {
                return [pId, []];
            }
        })
    );
    return Object.fromEntries(entries);
}

async function loadPitches(clusterId) {
    appState.currentCluster = appState.clusters.find(c => (c.MaCumSan || c.ID) == clusterId);
    appState.currentPitch = null;
    renderBreadcrumb('pitches');

    // Giữ nguyên bộ lọc nếu quay lại đúng Cụm sân vừa xem
    const isSameCluster = guestPitchFilterState.clusterId !== null && String(guestPitchFilterState.clusterId) === String(clusterId);

    appContent.innerHTML = '<div style="text-align:center; padding: 40px;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:#16A34A"></i><p style="margin-top:10px; color:var(--text-muted);">Đang tải danh sách sân và lịch trống...</p></div>';

    try {
        const [sbRes, gtRes, kgRes] = await Promise.all([
            fetch(`${API_BASE_URL}/san-bong?cum_san_id=${clusterId}`),
            fetch(`${API_BASE_URL}/gia-tien?cum_san_id=${clusterId}`),
            fetch(`${API_BASE_URL}/khung-gio`)
        ]);

        const activePitches = ((await sbRes.json()).data || []).filter(sb => sb.TrangThai === 'HoatDong');
        const giaTiens = (await gtRes.json()).data || [];
        const khungGios = (await kgRes.json()).data || [];
        const bookedMap = activePitches.length > 0 ? await fetchGuestClusterBookedMap(activePitches) : {};
        const dateOptions = buildGuestPitchDateOptions();
        const validYmds = new Set(dateOptions.map(d => d.ymd));

        guestPitchFilterState = {
            clusterId: String(clusterId),
            pitches: activePitches,
            khungGios,
            giaTiens,
            bookedMap,
            dateOptions,
            selectedLoaiSanId: isSameCluster ? guestPitchFilterState.selectedLoaiSanId : 'All',
            selectedDates: isSameCluster ? guestPitchFilterState.selectedDates.filter(d => validYmds.has(d)) : [],
            selectedKhungGioIds: isSameCluster ? [...guestPitchFilterState.selectedKhungGioIds] : [],
            timeSearch: isSameCluster ? guestPitchFilterState.timeSearch : ''
        };

        renderGuestPitchesLayout();
    } catch (err) {
        appContent.innerHTML = '<p style="text-align:center; color:red;">Lỗi tải dữ liệu sân.</p>';
    }
}

function renderGuestPitchesLayout() {
    const c = appState.currentCluster || {};
    const st = guestPitchFilterState;

    const headerHtml = `
        <div class="guest-view-animate">
            <div style="background: linear-gradient(135deg, #FFFFFF 0%, #F0FDF4 100%); border: 1px solid #BBF7D0; border-left: 5px solid var(--primary); border-radius: 14px; padding: 20px 24px; margin-bottom: 22px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; box-shadow: var(--shadow-sm);">
                <div>
                    <div style="font-size: 0.78rem; color: #15803D; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
                        <i class="fa-solid fa-circle-check"></i> Đang xem danh sách sân thuộc cụm
                    </div>
                    <h2 style="font-size: 1.5rem; color: var(--text-main); margin-bottom: 8px;">${c.TenCumSan || ''}</h2>
                    <div style="display: flex; gap: 20px; flex-wrap: wrap; font-size: 0.9rem; color: var(--text-muted);">
                        <span><i class="fa-solid fa-location-dot" style="color: var(--primary); margin-right: 6px;"></i>${c.DiaChi || ''}</span>
                        <span><i class="fa-regular fa-clock" style="color: #0284C7; margin-right: 6px;"></i>Giờ mở cửa: <strong style="color: var(--text-main);">${c.GioMoCua?.substring(0,5) || '06:00'} - ${c.GioDongCua?.substring(0,5) || '22:00'}</strong></span>
                    </div>
                </div>
                <div style="background: #DCFCE7; border: 1px solid #86EFAC; padding: 8px 16px; border-radius: 10px; color: #15803D; font-weight: 700; font-size: 0.9rem;">
                    <i class="fa-solid fa-futbol" style="margin-right: 6px;"></i> ${st.pitches.length} sân đang hoạt động
                </div>
            </div>
            ${st.pitches.length === 0 ? `
                <div style="text-align: center; padding: 50px 20px; background: #FFFFFF; border: 1px dashed #CBD5E1; border-radius: 14px;">
                    <i class="fa-solid fa-circle-exclamation fa-3x" style="color: #F59E0B; margin-bottom: 16px;"></i>
                    <h3 style="color: var(--text-main); font-size: 1.25rem; margin-bottom: 8px;">Hiện không có sân bóng nào</h3>
                    <p style="color: var(--text-muted); font-size: 0.95rem;">Cụm sân này hiện chưa có sân con nào hoạt động. Vui lòng chọn cụm sân khác.</p>
                </div>
            ` : `
                <div style="display: flex; gap: 22px; align-items: flex-start; flex-wrap: wrap;">
                    <aside id="guest-pitch-filter-sidebar" style="width: 300px; flex: 0 0 300px; max-width: 100%; position: sticky; top: 90px; background: #FFFFFF; border: 1px solid var(--border-color); border-radius: 16px; padding: 18px; box-shadow: var(--shadow-sm);"></aside>
                    <div id="guest-pitches-list-container" style="flex: 1; min-width: 300px;"></div>
                </div>
            `}
        </div>
    `;

    appContent.innerHTML = headerHtml;
    if (st.pitches.length > 0) {
        renderGuestPitchSidebar();
        renderGuestPitchResults();
    }
}

function isTimeSlotWithinOperatingHours(startStr, endStr, moCuaStr, dongCuaStr) {
    const toMins = (t, isEnd = false) => {
        const [h, m] = String(t || '00:00').substring(0, 5).split(':').map(Number);
        const mins = h * 60 + m;
        return (isEnd && mins === 0) ? 1440 : mins;
    };
    const s = toMins(startStr, false);
    const e = toMins(endStr, true);
    const open = toMins(moCuaStr, false);
    const close = toMins(dongCuaStr, true);
    return s >= open && e <= close && s < e;
}

function getGuestOperatingTimeSlots() {
    const c = appState.currentCluster || {};
    const moCua = (c.GioMoCua || '06:00').substring(0, 5);
    const dongCua = (c.GioDongCua || '22:00').substring(0, 5);
    const st = guestPitchFilterState;

    return st.khungGios.filter(kg => {
        const maKG = String(kg.MaKhungGio || kg.ID);
        if (!isTimeSlotWithinOperatingHours(kg.GioBatDau, kg.GioKetThuc, moCua, dongCua)) return false;
        return st.giaTiens.some(gt => String(gt.MaKhungGio || gt.ID_KhungGio) === maKG && Number(gt.SoTien) > 0);
    });
}

function renderGuestPitchSidebar() {
    const sidebar = document.getElementById('guest-pitch-filter-sidebar');
    if (!sidebar) return;
    const st = guestPitchFilterState;

    const loaiMap = new Map();
    st.pitches.forEach(sb => {
        const lId = String(sb.MaLoaiSan || sb.ID_LoaiSan);
        const lName = sb.loaiSan?.TenLoaiSan || sb.loai_san?.TenLoaiSan || 'Khác';
        if (!loaiMap.has(lId)) loaiMap.set(lId, { id: lId, name: lName, count: 0 });
        loaiMap.get(lId).count++;
    });
    const loaiList = Array.from(loaiMap.values());

    const validSlots = getGuestOperatingTimeSlots();
    const searchKw = st.timeSearch.toLowerCase().trim();
    const filteredSlots = validSlots.filter(kg => {
        if (!searchKw) return true;
        const start = kg.GioBatDau.substring(0, 5);
        const end = kg.GioKetThuc.substring(0, 5);
        const label = `${start} - ${end} ${start.replace(':', 'h')} ${Number(start.split(':')[0])}h`;
        return label.toLowerCase().includes(searchKw);
    });

    const now = new Date();
    const todayYmd = st.dateOptions[0]?.ymd || '';
    const isOnlyTodaySelected = st.selectedDates.length === 1 && st.selectedDates[0] === todayYmd;
    const [selY, selM, selD] = isOnlyTodaySelected ? todayYmd.split('-').map(Number) : [0, 0, 0];

    const hasActiveFilter = st.selectedLoaiSanId !== 'All' || st.selectedDates.length > 0 || st.selectedKhungGioIds.length > 0 || st.timeSearch !== '';

    sidebar.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid #F1F5F9;">
            <div style="font-size: 0.98rem; font-weight: 800; color: #0F172A; display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-sliders" style="color: var(--primary);"></i> Bộ lọc tìm sân
            </div>
            ${hasActiveFilter ? `
                <button type="button" onclick="resetGuestPitchFilters()" style="background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; padding: 4px 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
                    <i class="fa-solid fa-rotate-left"></i> Đặt lại
                </button>
            ` : ''}
        </div>

        <div style="margin-bottom: 18px;">
            <div style="font-size: 0.78rem; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px;">
                1. Loại sân bóng
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 7px;">
                <button type="button" onclick="setGuestPitchTypeFilter('All')" style="padding: 6px 12px; border-radius: 999px; font-size: 0.82rem; font-weight: 700; cursor: pointer; ${st.selectedLoaiSanId === 'All' ? 'background: #16A34A; color: #FFFFFF; border: 1px solid #16A34A;' : 'background: #F8FAFC; color: #334155; border: 1px solid #CBD5E1;'}">
                    Tất cả (${st.pitches.length})
                </button>
                ${loaiList.map(l => {
                    const active = st.selectedLoaiSanId === l.id;
                    return `
                        <button type="button" onclick="setGuestPitchTypeFilter('${l.id}')" style="padding: 6px 12px; border-radius: 999px; font-size: 0.82rem; font-weight: 700; cursor: pointer; ${active ? 'background: #16A34A; color: #FFFFFF; border: 1px solid #16A34A;' : 'background: #F8FAFC; color: #334155; border: 1px solid #CBD5E1;'}">
                            ${l.name} (${l.count})
                        </button>
                    `;
                }).join('')}
            </div>
        </div>

        <div style="margin-bottom: 16px; padding-top: 14px; border-top: 1px dashed #E2E8F0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 0.78rem; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.4px;">
                    2. Ngày đá <span style="font-weight: 500; text-transform: none;">(Tùy chọn)</span>
                </span>
                ${st.selectedDates.length > 0 ? `
                    <button type="button" onclick="clearGuestPitchDates()" style="background: none; border: none; color: #DC2626; font-size: 0.75rem; font-weight: 700; cursor: pointer; padding: 0;">
                        Tất cả ngày (${st.selectedDates.length})
                    </button>
                ` : `<span style="font-size: 0.72rem; color: #16A34A; font-weight: 700;">Tất cả ${st.dateOptions.length} ngày</span>`}
            </div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
                ${st.dateOptions.map(d => {
                    const active = st.selectedDates.includes(d.ymd);
                    return `
                        <button type="button" onclick="toggleGuestPitchDateFilter('${d.ymd}')" style="padding: 7px 8px; border-radius: 9px; text-align: left; cursor: pointer; display: flex; justify-content: space-between; align-items: center; ${active ? 'background: #F0FDF4; border: 1.5px solid #16A34A; color: #065F46;' : 'background: #F8FAFC; border: 1px solid #E2E8F0; color: #475569;'}">
                            <span style="font-size: 0.76rem; font-weight: 700;">${active ? '✓ ' : ''}${d.label}</span>
                            <span style="font-size: 0.78rem; font-weight: 800;">${d.short}</span>
                        </button>
                    `;
                }).join('')}
            </div>
        </div>

        <div style="padding-top: 14px; border-top: 1px dashed #E2E8F0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 0.78rem; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.4px;">
                    3. Khung giờ mong muốn
                </span>
                ${st.selectedKhungGioIds.length > 0 ? `
                    <button type="button" onclick="clearGuestPitchTimeSlots()" style="background: none; border: none; color: #DC2626; font-size: 0.75rem; font-weight: 700; cursor: pointer; padding: 0;">
                        Bỏ chọn (${st.selectedKhungGioIds.length})
                    </button>
                ` : ''}
            </div>

            <div style="position: relative; margin-bottom: 10px;">
                <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.82rem;"></i>
                <input type="text" id="guest-pitch-time-search" value="${st.timeSearch}" placeholder="Tìm giờ (VD: 18, 19:00)..." oninput="setGuestPitchTimeSearch(this.value)" style="width: 100%; box-sizing: border-box; padding: 8px 10px 8px 32px; font-size: 0.84rem; background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 9px; outline: none;">
            </div>

            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; max-height: 225px; overflow-y: auto; padding-right: 2px;">
                ${filteredSlots.length === 0 ? `<div style="grid-column: 1/-1; text-align: center; padding: 14px; font-size: 0.82rem; color: #94A3B8;">Không tìm thấy khung giờ phù hợp</div>` : filteredSlots.map(kg => {
                    const maKG = String(kg.MaKhungGio || kg.ID);
                    const start = kg.GioBatDau.substring(0, 5);
                    const end = kg.GioKetThuc.substring(0, 5);
                    const [hh, mm] = start.split(':').map(Number);
                    const isPast = isOnlyTodaySelected && selY ? (new Date(selY, selM - 1, selD, hh, mm) <= now) : false;
                    const isSelected = st.selectedKhungGioIds.includes(maKG);

                    if (isPast && !isSelected) {
                        return `
                            <button type="button" disabled style="padding: 7px 6px; border-radius: 8px; border: 1px dashed #CBD5E1; background: #F8FAFC; color: #94A3B8; font-size: 0.78rem; font-weight: 600; cursor: not-allowed; text-decoration: line-through;">
                                ${start} - ${end}
                            </button>
                        `;
                    }
                    return `
                        <button type="button" onclick="toggleGuestPitchTimeSlot('${maKG}')" style="padding: 7px 6px; border-radius: 8px; font-size: 0.78rem; font-weight: 700; cursor: pointer; ${isSelected ? 'background: #16A34A; color: #FFFFFF; border: 1.5px solid #16A34A;' : 'background: #FFFFFF; color: #1E293B; border: 1px solid #CBD5E1;'}">
                            ${isSelected ? '✓ ' : ''}${start} - ${end}
                        </button>
                    `;
                }).join('')}
            </div>
            <div style="margin-top: 8px; font-size: 0.75rem; color: #64748B; line-height: 1.4;">
                <i class="fa-solid fa-circle-info" style="color: #16A34A;"></i> Có thể chọn nhiều ngày hoặc bỏ trống ngày để tìm sân còn giờ trống trong tuần.
            </div>
        </div>
    `;
}

function evaluateGuestPitchMatch(sb) {
    const c = appState.currentCluster || {};
    const moCua = (c.GioMoCua || '06:00').substring(0, 5);
    const dongCua = (c.GioDongCua || '22:00').substring(0, 5);
    const st = guestPitchFilterState;
    const pId = String(sb.MaSanBong || sb.ID);
    const loaiId = String(sb.MaLoaiSan || sb.ID_LoaiSan);
    const bookedList = st.bookedMap[pId] || [];
    const now = new Date();

    const datesToCheck = st.selectedDates.length > 0
        ? st.selectedDates
        : st.dateOptions.map(d => d.ymd);

    const checkDay = (ymd) => {
        const [y, m, d] = ymd.split('-').map(Number);
        const dateOpt = st.dateOptions.find(opt => opt.ymd === ymd);
        const shortDate = dateOpt ? dateOpt.short : ymd.split('-').reverse().slice(0, 2).join('/');

        const slots = st.selectedKhungGioIds.map(kgId => {
            const kg = st.khungGios.find(k => String(k.MaKhungGio || k.ID) === String(kgId));
            if (!kg) return { kgId, timeStr: '', available: false, reason: 'Không hợp lệ', price: 0 };

            const start = kg.GioBatDau.substring(0, 5);
            const end = kg.GioKetThuc.substring(0, 5);
            const timeStr = `${start} - ${end}`;
            const [hh, mm] = start.split(':').map(Number);
            const isPast = new Date(y, m - 1, d, hh, mm) <= now;

            const priceObj = st.giaTiens.find(gt =>
                String(gt.MaLoaiSan || gt.ID_LoaiSan) === loaiId &&
                String(gt.MaKhungGio || gt.ID_KhungGio) === String(kgId)
            );
            const priceVal = priceObj ? Number(priceObj.SoTien) : 0;
            const isOpen = priceVal > 0 && isTimeSlotWithinOperatingHours(start, end, moCua, dongCua);
            const isBooked = bookedList.some(b =>
                String(b.NgayDa).substring(0, 10) === ymd &&
                String(b.MaKhungGio || b.ID_KhungGio) === String(kgId)
            );

            if (isPast) return { kgId, timeStr, available: false, reason: 'Quá giờ', price: priceVal };
            if (!isOpen) return { kgId, timeStr, available: false, reason: 'Chưa mở giá', price: 0 };
            if (isBooked) return { kgId, timeStr, available: false, reason: 'Đã đặt', price: priceVal };
            return { kgId, timeStr, available: true, reason: 'Còn trống', price: priceVal };
        });

        const allSlotsFree = slots.length > 0 && slots.every(s => s.available);
        return { ymd, shortDate, allSlotsFree, slots };
    };

    const dayResults = datesToCheck.map(checkDay);
    const availableDays = dayResults.filter(dr => dr.allSlotsFree);

    const isMatch = st.selectedDates.length === 0
        ? availableDays.length > 0
        : (dayResults.length > 0 && dayResults.every(dr => dr.allSlotsFree));

    return {
        isMatch,
        isAnyDateMode: st.selectedDates.length === 0,
        dayResults,
        availableDays
    };
}

function renderGuestPitchCard(sb, evalResult = null) {
    const st = guestPitchFilterState;
    const maSB = sb.MaSanBong || sb.ID;
    const loaiName = sb.loaiSan?.TenLoaiSan || sb.loai_san?.TenLoaiSan || 'Khác';
    const specInfo = (sb.KichThuoc || sb.DienTich)
        ? `<div style="font-size: 0.8rem; color: #475569; margin-top: 4px;"><i class="fa-solid fa-ruler-combined" style="color: var(--primary); margin-right: 4px;"></i>${sb.KichThuoc || ''}${sb.KichThuoc && sb.DienTich ? ' • ' : ''}${sb.DienTich ? Number(sb.DienTich) + 'm²' : ''}</div>`
        : '';
    const moTaInfo = sb.MoTa ? `<div style="font-size: 0.78rem; color: #64748B; margin-top: 4px;">${sb.MoTa}</div>` : '';

    let cardStyle = '';
    let topBadgeHtml = '';
    let slotDetailBoxHtml = '';
    let actionTagHtml = `<span style="background: #F0FDF4; border: 1px solid #BBF7D0; color: #15803D; padding: 7px 12px; border-radius: 9px; font-size: 0.82rem; font-weight: 700; white-space: nowrap;">Xem lịch &rarr;</span>`;

    if (evalResult) {
        if (evalResult.isMatch) {
            cardStyle = 'border: 1.5px solid #22C55E; background: linear-gradient(180deg, #FFFFFF 0%, #F0FDF4 100%);';
            topBadgeHtml = `<span style="background: #DCFCE7; color: #065F46; border: 1px solid #86EFAC; padding: 2px 9px; border-radius: 999px; font-size: 0.72rem; font-weight: 800;">✓ Còn trống</span>`;

            if (evalResult.isAnyDateMode) {
                const sampleSlots = evalResult.availableDays[0]?.slots || [];
                const daysStr = evalResult.availableDays.map(d => d.shortDate).join(', ');
                slotDetailBoxHtml = `
                    <div style="margin-top: 10px; padding: 8px 10px; background: #FFFFFF; border: 1px solid #BBF7D0; border-radius: 9px; font-size: 0.79rem;">
                        <div style="color: #065F46; font-weight: 700; margin-bottom: 4px;"><i class="fa-regular fa-calendar-check"></i> Trống ${evalResult.availableDays.length} ngày: <span style="color:#15803D;">${daysStr}</span></div>
                        ${sampleSlots.map(sd => `
                            <div style="display: flex; justify-content: space-between; padding: 2px 0;">
                                <span style="color: #334155; font-weight: 600;"><i class="fa-regular fa-clock"></i> ${sd.timeStr}</span>
                                <strong style="color: #16A34A;">${sd.price.toLocaleString('vi-VN')}đ</strong>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else if (evalResult.dayResults.length === 1) {
                const dr = evalResult.dayResults[0];
                slotDetailBoxHtml = `
                    <div style="margin-top: 10px; padding: 8px 10px; background: #FFFFFF; border: 1px solid #BBF7D0; border-radius: 9px; font-size: 0.79rem;">
                        ${dr.slots.map(sd => `
                            <div style="display: flex; justify-content: space-between; padding: 2px 0;">
                                <span style="color: #065F46; font-weight: 700;"><i class="fa-regular fa-clock"></i> ${sd.timeStr}</span>
                                <strong style="color: #16A34A;">${sd.price.toLocaleString('vi-VN')}đ</strong>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else {
                slotDetailBoxHtml = `
                    <div style="margin-top: 10px; padding: 8px 10px; background: #FFFFFF; border: 1px solid #BBF7D0; border-radius: 9px; font-size: 0.78rem;">
                        ${evalResult.dayResults.map(dr => `
                            <div style="display: flex; justify-content: space-between; padding: 2px 0;">
                                <span style="color: #065F46; font-weight: 700;">Ngày ${dr.shortDate}</span>
                                <span style="color: #16A34A; font-weight: 700;">✓ Trống đủ ${dr.slots.length} ca</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
            actionTagHtml = `<span style="background: #16A34A; color: #FFFFFF; padding: 7px 12px; border-radius: 9px; font-size: 0.82rem; font-weight: 700; white-space: nowrap;">Đặt lịch &rarr;</span>`;
        } else {
            cardStyle = 'border: 1px solid #E2E8F0; background: #F8FAFC; opacity: 0.86;';
            topBadgeHtml = `<span style="background: #FEE2E2; color: #991B1B; border: 1px solid #FECACA; padding: 2px 9px; border-radius: 999px; font-size: 0.72rem; font-weight: 700;">Chưa khớp lịch</span>`;

            if (evalResult.isAnyDateMode) {
                slotDetailBoxHtml = `
                    <div style="margin-top: 10px; padding: 8px 10px; background: #FFFFFF; border: 1px dashed #CBD5E1; border-radius: 9px; font-size: 0.78rem; color: #DC2626; font-weight: 600;">
                        <i class="fa-regular fa-calendar-xmark"></i> Đã kín hoặc chưa mở giá các khung giờ đã chọn trong ${st.dateOptions.length} ngày tới.
                    </div>
                `;
            } else if (evalResult.dayResults.length === 1) {
                const dr = evalResult.dayResults[0];
                slotDetailBoxHtml = `
                    <div style="margin-top: 10px; padding: 8px 10px; background: #FFFFFF; border: 1px dashed #CBD5E1; border-radius: 9px; font-size: 0.78rem;">
                        ${dr.slots.map(sd => `
                            <div style="display: flex; justify-content: space-between; padding: 2px 0; gap: 6px;">
                                <span style="color: #475569; font-weight: 600;">${sd.timeStr}</span>
                                <span style="font-weight: 700; color: ${sd.available ? '#15803D' : '#DC2626'};">
                                    ${sd.available ? `Trống (${sd.price.toLocaleString('vi-VN')}đ)` : sd.reason}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else {
                slotDetailBoxHtml = `
                    <div style="margin-top: 10px; padding: 8px 10px; background: #FFFFFF; border: 1px dashed #CBD5E1; border-radius: 9px; font-size: 0.77rem;">
                        ${evalResult.dayResults.map(dr => {
                            const badSlot = dr.slots.find(s => !s.available);
                            return `
                                <div style="display: flex; justify-content: space-between; padding: 2px 0; gap: 6px;">
                                    <span style="color: #475569; font-weight: 600;">Ngày ${dr.shortDate}</span>
                                    <span style="font-weight: 700; color: ${dr.allSlotsFree ? '#15803D' : '#DC2626'};">
                                        ${dr.allSlotsFree ? '✓ Trống đủ' : `${badSlot.timeStr} (${badSlot.reason})`}
                                    </span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }
            actionTagHtml = `<span style="background: #FFFFFF; border: 1px solid #CBD5E1; color: #475569; padding: 7px 12px; border-radius: 9px; font-size: 0.82rem; font-weight: 600; white-space: nowrap;">Xem lịch &rarr;</span>`;
        }
    }

    return `
        <div class="pitch-card" style="${cardStyle}" onclick="loadSchedule('${st.clusterId}', '${maSB}')">
            <div style="padding: 18px 20px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <div class="pitch-card-name" style="margin: 0;">${sb.TenSan}</div>
                            ${topBadgeHtml}
                        </div>
                        <div class="pitch-card-type" style="margin-top: 4px;"><i class="fa-solid fa-layer-group" style="color: var(--primary);"></i> ${loaiName}</div>
                        ${specInfo}
                        ${moTaInfo}
                    </div>
                    ${actionTagHtml}
                </div>
                ${slotDetailBoxHtml}
            </div>
        </div>
    `;
}

function renderGuestPitchResults() {
    const container = document.getElementById('guest-pitches-list-container');
    if (!container) return;
    const st = guestPitchFilterState;

    const typeFiltered = st.pitches.filter(sb => {
        if (st.selectedLoaiSanId === 'All') return true;
        return String(sb.MaLoaiSan || sb.ID_LoaiSan) === String(st.selectedLoaiSanId);
    });

    if (typeFiltered.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding: 45px 20px; background: #FFFFFF; border-radius: 14px; border: 1px dashed #CBD5E1; color: var(--text-muted);">Không có sân bóng nào thuộc loại sân đã chọn.</div>`;
        return;
    }

    const isTimeFiltering = st.selectedKhungGioIds.length > 0;

    if (!isTimeFiltering) {
        container.innerHTML = `<div class="pitch-grid" style="grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));">${typeFiltered.map(sb => renderGuestPitchCard(sb, null)).join('')}</div>`;
        return;
    }

    const matchedList = [];
    const unmatchedList = [];
    typeFiltered.forEach(sb => {
        const evalRes = evaluateGuestPitchMatch(sb);
        if (evalRes.isMatch) matchedList.push({ sb, evalRes });
        else unmatchedList.push({ sb, evalRes });
    });

    const dateLabel = st.selectedDates.length === 0
        ? `Tất cả ${st.dateOptions.length} ngày`
        : st.selectedDates.map(ymd => st.dateOptions.find(d => d.ymd === ymd)?.short || ymd).join(', ');

    const selectedTimeLabels = st.selectedKhungGioIds.map(id => {
        const kg = st.khungGios.find(k => String(k.MaKhungGio || k.ID) === String(id));
        return kg ? `${kg.GioBatDau.substring(0, 5)} - ${kg.GioKetThuc.substring(0, 5)}` : '';
    }).filter(Boolean).join(', ');

    let html = `
        <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 12px; padding: 12px 16px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 0.86rem; color: #065F46;">
            <div>
                <i class="fa-solid fa-filter" style="color: #16A34A; margin-right: 6px;"></i>
                Ngày: <strong>${dateLabel}</strong> &bull; Khung giờ: <strong>${selectedTimeLabels}</strong>
            </div>
            <div style="font-weight: 700;">
                <span style="color: #15803D;">${matchedList.length} sân trống</span> / <span style="color: #64748B;">${unmatchedList.length} sân không khớp</span>
            </div>
        </div>

        <div style="margin-bottom: 26px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #BBF7D0;">
                <span style="font-weight: 800; font-size: 0.95rem; color: #065F46; display: inline-flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-circle-check" style="color: #16A34A;"></i> SÂN CÒN TRỐNG THỎA ĐIỀU KIỆN
                </span>
                <span style="font-size: 0.8rem; font-weight: 700; color: #065F46; background: #DCFCE7; border: 1px solid #86EFAC; padding: 3px 11px; border-radius: 999px;">${matchedList.length} sân</span>
            </div>
            ${matchedList.length === 0 ? `
                <div style="padding: 26px 18px; text-align: center; background: #FFFFFF; border: 1px dashed #CBD5E1; border-radius: 12px; color: #64748B; font-size: 0.9rem;">
                    <i class="fa-regular fa-calendar-xmark" style="font-size: 1.6rem; color: #94A3B8; margin-bottom: 8px; display: block;"></i>
                    Hiện chưa có sân nào trống đủ lịch bạn chọn. Bạn có thể chọn ngày/khung giờ khác ở cột bên trái hoặc xem lịch chi tiết của các sân bên dưới.
                </div>
            ` : `
                <div class="pitch-grid" style="grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));">
                    ${matchedList.map(item => renderGuestPitchCard(item.sb, item.evalRes)).join('')}
                </div>
            `}
        </div>
    `;

    if (unmatchedList.length > 0) {
        html += `
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #E2E8F0;">
                    <span style="font-weight: 800; font-size: 0.92rem; color: #475569; display: inline-flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-clock-rotate-left" style="color: #64748B;"></i> SÂN CHƯA ĐÁP ỨNG KHUNG GIỜ ĐÃ CHỌN (VẪN XEM ĐƯỢC LỊCH)
                    </span>
                    <span style="font-size: 0.8rem; font-weight: 700; color: #475569; background: #E2E8F0; padding: 3px 11px; border-radius: 999px;">${unmatchedList.length} sân</span>
                </div>
                <div class="pitch-grid" style="grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));">
                    ${unmatchedList.map(item => renderGuestPitchCard(item.sb, item.evalRes)).join('')}
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

window.setGuestPitchTypeFilter = function(loaiId) {
    guestPitchFilterState.selectedLoaiSanId = String(loaiId);
    renderGuestPitchSidebar();
    renderGuestPitchResults();
};

window.toggleGuestPitchDateFilter = function(ymd) {
    const idx = guestPitchFilterState.selectedDates.indexOf(ymd);
    if (idx > -1) guestPitchFilterState.selectedDates.splice(idx, 1);
    else guestPitchFilterState.selectedDates.push(ymd);
    guestPitchFilterState.selectedDates.sort();
    renderGuestPitchSidebar();
    renderGuestPitchResults();
};

window.clearGuestPitchDates = function() {
    guestPitchFilterState.selectedDates = [];
    renderGuestPitchSidebar();
    renderGuestPitchResults();
};

window.toggleGuestPitchTimeSlot = function(maKG) {
    const idStr = String(maKG);
    const idx = guestPitchFilterState.selectedKhungGioIds.indexOf(idStr);
    if (idx > -1) guestPitchFilterState.selectedKhungGioIds.splice(idx, 1);
    else guestPitchFilterState.selectedKhungGioIds.push(idStr);

    guestPitchFilterState.selectedKhungGioIds.sort((a, b) => {
        const kgA = guestPitchFilterState.khungGios.find(k => String(k.MaKhungGio || k.ID) === a);
        const kgB = guestPitchFilterState.khungGios.find(k => String(k.MaKhungGio || k.ID) === b);
        return (kgA?.GioBatDau || '').localeCompare(kgB?.GioBatDau || '');
    });

    renderGuestPitchSidebar();
    renderGuestPitchResults();
};

window.setGuestPitchTimeSearch = function(val) {
    guestPitchFilterState.timeSearch = val;
    renderGuestPitchSidebar();
    const input = document.getElementById('guest-pitch-time-search');
    if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    }
};

window.clearGuestPitchTimeSlots = function() {
    guestPitchFilterState.selectedKhungGioIds = [];
    renderGuestPitchSidebar();
    renderGuestPitchResults();
};

window.resetGuestPitchFilters = function() {
    guestPitchFilterState.selectedLoaiSanId = 'All';
    guestPitchFilterState.selectedDates = [];
    guestPitchFilterState.selectedKhungGioIds = [];
    guestPitchFilterState.timeSearch = '';
    renderGuestPitchSidebar();
    renderGuestPitchResults();
};

async function refreshGuestPitchesRealtime() {
    if (!appState.currentCluster || appState.currentPitch !== null || !document.getElementById('guest-pitches-list-container')) return;
    try {
        const cId = appState.currentCluster.MaCumSan || appState.currentCluster.ID;
        const cacheBuster = Date.now();
        const [sbRes, gtRes] = await Promise.all([
            fetch(`${API_BASE_URL}/san-bong?cum_san_id=${cId}&_t=${cacheBuster}`),
            fetch(`${API_BASE_URL}/gia-tien?cum_san_id=${cId}&_t=${cacheBuster}`)
        ]);
        const activePitches = ((await sbRes.json()).data || []).filter(sb => sb.TrangThai === 'HoatDong');
        guestPitchFilterState.pitches = activePitches;
        guestPitchFilterState.giaTiens = (await gtRes.json()).data || [];
        guestPitchFilterState.bookedMap = activePitches.length > 0 ? await fetchGuestClusterBookedMap(activePitches) : {};
        renderGuestPitchSidebar();
        renderGuestPitchResults();
    } catch (err) {
        console.error('Lỗi cập nhật ngầm danh sách sân Guest:', err);
    }
}

function getGuestWeatherSlotBadge(w) {
    if (!w) return '';
    const tooltip = `${w.kieu_thoi_tiet} | Xác suất mưa: ${w.xac_suat_mua}% | Lượng mưa: ${w.luong_mua_mm}mm | Nhiệt độ: ${w.nhiet_do}°C`;
    if (w.co_mua) {
        return `<div title="${tooltip}" style="margin-top: 4px; display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 999px; background: #E0F2FE; border: 1px solid #7DD3FC; color: #0369A1; font-size: 0.69rem; font-weight: 700; line-height: 1.2; cursor: default;">
            <i class="fa-solid fa-cloud-rain"></i> ${w.xac_suat_mua}% &bull; ${w.nhiet_do}°C
        </div>`;
    }
    const isSunny = (w.kieu_thoi_tiet || '').toLowerCase().includes('nắng');
    const icon = isSunny
        ? '<i class="fa-solid fa-sun" style="color: #F59E0B;"></i>'
        : '<i class="fa-solid fa-cloud" style="color: #94A3B8;"></i>';
    return `<div title="${tooltip}" style="margin-top: 4px; display: inline-flex; align-items: center; gap: 3px; color: #64748B; font-size: 0.69rem; font-weight: 600; line-height: 1.2; cursor: default;">
        ${icon} ${w.nhiet_do}°C
    </div>`;
}

const GUEST_SLOT_LABELS = {
    available: '<i class="fa-regular fa-futbol"></i><span>Còn trống</span>',
    selected:  '<i class="fa-solid fa-futbol"></i><span>Đang chọn</span>',
    booked:    '<i class="fa-solid fa-shirt"></i><span>Đã đặt</span>',
    past:      '<i class="fa-solid fa-stopwatch"></i><span>Quá giờ</span>'
};

function injectGuestScheduleSlotStyles() {
    if (document.getElementById('guest-schedule-slot-v2-style')) return;
    const style = document.createElement('style');
    style.id = 'guest-schedule-slot-v2-style';
    style.innerHTML = `
        .schedule-table .slot-btn {
            width: 100%;
            min-width: 96px;
            padding: 8px 10px;
            border-radius: 10px;
            font-size: 0.78rem;
            font-weight: 700;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            white-space: nowrap;
            transition: all 0.18s ease;
            letter-spacing: 0.1px;
        }
        .schedule-table .slot-btn i {
            font-size: 0.84rem;
        }
        /* 1. Còn trống: Xanh lá pastel dịu mắt */
        .schedule-table .slot-btn.available {
            background: linear-gradient(180deg, #F0FDF4 0%, #DCFCE7 100%) !important;
            border: 1.5px solid #86EFAC !important;
            color: #15803D !important;
            cursor: pointer;
            box-shadow: 0 1px 2px rgba(22, 163, 74, 0.08);
        }
        .schedule-table .slot-btn.available:hover {
            background: linear-gradient(180deg, #DCFCE7 0%, #BBF7D0 100%) !important;
            border-color: #22C55E !important;
            color: #166534 !important;
            transform: translateY(-1px);
            box-shadow: 0 4px 10px rgba(22, 163, 74, 0.16);
        }
        /* 2. Đang chọn: Cam ấm nổi bật */
        .schedule-table .slot-btn.available.selected,
        .schedule-table .slot-btn.available.selected:hover {
            background: linear-gradient(135deg, #F97316 0%, #EA580C 100%) !important;
            border: 1.5px solid #EA580C !important;
            color: #FFFFFF !important;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(234, 88, 12, 0.28);
        }
        /* 3. Đã đặt: Hồng đỏ pastel (đồng bộ 100% với chú thích) */
        .schedule-table .slot-btn.booked,
        .schedule-table .slot-btn.booked:disabled {
            background: #FFF1F2 !important;
            border: 1.5px solid #FECDD3 !important;
            color: #BE123C !important;
            opacity: 1 !important;
            cursor: not-allowed;
        }
        /* 4. Quá giờ: Xám nhạt viền nét đứt */
        .schedule-table .slot-btn.past,
        .schedule-table .slot-btn.past:disabled {
            background: #F8FAFC !important;
            border: 1.5px dashed #CBD5E1 !important;
            color: #94A3B8 !important;
            opacity: 1 !important;
            cursor: not-allowed;
        }
    `;
    document.head.appendChild(style);
}

async function loadSchedule(clusterId, pitchId) {
    injectGuestScheduleSlotStyles();

    appContent.innerHTML = '<div style="text-align:center; padding: 40px;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:#16A34A"></i></div>';

    try {
        const [sbRes, gtRes, kgRes, dsRes, wtRes] = await Promise.all([
            fetch(`${API_BASE_URL}/san-bong?cum_san_id=${clusterId}`),
            fetch(`${API_BASE_URL}/gia-tien?cum_san_id=${clusterId}`),
            fetch(`${API_BASE_URL}/khung-gio`),
            fetch(`${API_BASE_URL}/dat-san/da-dat?id_san_bong=${pitchId}`),
            fetch(`${API_BASE_URL}/thoi-tiet?cum_san_id=${clusterId}`).catch(() => null)
        ]);

        const pitches = (await sbRes.json()).data || [];
        const prices = (await gtRes.json()).data || [];
        const timeSlots = (await kgRes.json()).data || [];
        const booked = (await dsRes.json()).data || [];
        const weatherMap = (wtRes && wtRes.ok) ? ((await wtRes.json()).data || {}) : {};

        const pitch = pitches.find(p => (p.MaSanBong || p.ID) == pitchId);
        appState.currentPitch = pitch;
        
        renderBreadcrumb('schedule');

        const c = appState.currentCluster;
        const loaiName = pitch.loaiSan?.TenLoaiSan || pitch.loai_san?.TenLoaiSan || 'Sân bóng';
        const pitchLoaiId = pitch.MaLoaiSan || pitch.ID_LoaiSan;

        const moCua = (c.GioMoCua || '06:00').substring(0, 5);
        const dongCua = (c.GioDongCua || '22:00').substring(0, 5);

        const validPrices = prices.filter(gt => (gt.MaLoaiSan || gt.ID_LoaiSan) == pitchLoaiId && Number(gt.SoTien) > 0);
        const validKhungGioIds = validPrices.map(gt => String(gt.MaKhungGio || gt.ID_KhungGio));
        const availableTimeSlots = timeSlots.filter(kg =>
            validKhungGioIds.includes(String(kg.MaKhungGio || kg.ID)) &&
            isTimeSlotWithinOperatingHours(kg.GioBatDau, kg.GioKetThuc, moCua, dongCua)
        );

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
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 0.78rem; font-weight: 700;">
                    <span style="display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; background: #F0FDF4; border: 1.5px solid #86EFAC; color: #15803D;">
                        <i class="fa-regular fa-futbol"></i> Còn trống
                    </span>
                    <span style="display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; background: linear-gradient(135deg, #F97316 0%, #EA580C 100%); border: 1.5px solid #EA580C; color: #FFFFFF;">
                        <i class="fa-solid fa-futbol"></i> Đang chọn
                    </span>
                    <span style="display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; background: #FFF1F2; border: 1.5px solid #FECDD3; color: #BE123C;">
                        <i class="fa-solid fa-shirt"></i> Đã đặt
                    </span>
                    <span style="display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; background: #F8FAFC; border: 1.5px dashed #CBD5E1; color: #94A3B8;">
                        <i class="fa-solid fa-stopwatch"></i> Quá giờ
                    </span>
                </div>
            </div>

            <div class="schedule-container" style="position: relative; background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 14px; overflow: visible;">
                <table class="schedule-table" style="width: 100%; border-collapse: separate; border-spacing: 0; table-layout: auto;">
                    <thead>
                        <tr>
                            <th style="width: 130px; min-width: 130px; padding: 14px 10px; border-bottom: 2px solid #CBD5E1; border-right: 1px solid #E2E8F0; background: #F8FAFC; position: sticky; top: 72px; left: 0; z-index: 50; text-align: center; color: #0F172A; border-top-left-radius: 13px;">
                                Khung giờ
                            </th>
                            <th style="width: 105px; min-width: 105px; padding: 14px 10px; border-bottom: 2px solid #CBD5E1; border-right: 2px solid #CBD5E1; background: #F8FAFC; position: sticky; top: 72px; left: 130px; z-index: 49; text-align: center; color: #0F172A;">
                                Giá sân
                            </th>
                            ${dateArray.map((d, idx) => `
                                <th style="min-width: 108px; padding: 10px 8px; text-align: center; white-space: nowrap; border-bottom: 2px solid #CBD5E1; border-right: 1px solid #F1F5F9; background: ${d.isWeekend ? '#FFFBEB' : '#F8FAFC'}; position: sticky; top: 72px; z-index: 40; color: #0F172A; ${idx === dateArray.length - 1 ? 'border-top-right-radius: 13px;' : ''}">
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

                const hourPrefix = kg.GioBatDau.substring(0, 2);
                const weatherBadgeHtml = isPast ? '' : getGuestWeatherSlotBadge(weatherMap[`${date.dbDate}_${hourPrefix}`]);

                if (isPast) {
                    html += `<td style="text-align:center; border-bottom: 1px solid #F1F5F9; border-right: 1px solid #F8FAFC; padding: 6px 4px;"><button class="slot-btn past" data-slot-id="${slotId}" disabled>${GUEST_SLOT_LABELS.past}</button></td>`;
                } else if (isBooked) {
                    html += `<td style="text-align:center; border-bottom: 1px solid #F1F5F9; border-right: 1px solid #F8FAFC; padding: 6px 4px;"><button class="slot-btn booked" data-slot-id="${slotId}" data-slot-data="${slotDataStr}" disabled>${GUEST_SLOT_LABELS.booked}</button>${weatherBadgeHtml}</td>`;
                } else if (isSelected) {
                    html += `<td style="text-align:center; border-bottom: 1px solid #F1F5F9; border-right: 1px solid #F8FAFC; padding: 6px 4px;"><button class="slot-btn available selected" data-slot-id="${slotId}" data-slot-data="${slotDataStr}" onclick="triggerModal(this, ${slotDataStr})">${GUEST_SLOT_LABELS.selected}</button>${weatherBadgeHtml}</td>`;
                } else {
                    html += `<td style="text-align:center; border-bottom: 1px solid #F1F5F9; border-right: 1px solid #F8FAFC; padding: 6px 4px;"><button class="slot-btn available" data-slot-id="${slotId}" data-slot-data="${slotDataStr}" onclick="triggerModal(this, ${slotDataStr})">${GUEST_SLOT_LABELS.available}</button>${weatherBadgeHtml}</td>`;
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
                <span style="cursor: pointer; text-decoration: underline;" onclick="renderClusters()">Cụm sân</span> &gt; 
                <strong style="color: var(--text-main);">${appState.currentCluster?.TenCumSan || ''}</strong>
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
        element.innerHTML = GUEST_SLOT_LABELS.available;
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
        element.innerHTML = GUEST_SLOT_LABELS.selected;
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
        btn.innerHTML = GUEST_SLOT_LABELS.available;
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
        btn.innerHTML = GUEST_SLOT_LABELS.available;
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
        const listDatSan = [...(hd.dat_sans || hd.datSans || [])].sort((a, b) => {
            const dateCmp = String(a.NgayDa || '').localeCompare(String(b.NgayDa || ''));
            if (dateCmp !== 0) return dateCmp;
            const timeA = a.khung_gio?.GioBatDau || '';
            const timeB = b.khung_gio?.GioBatDau || '';
            return timeA.localeCompare(timeB);
        });

        const first = listDatSan[0] || {};
        const tenKhach = hd.nguoi_dung?.HoTen || first.TenNguoiDat || first.TenKhachVangLai || 'Khách vãng lai';
        const sdtKhach = hd.nguoi_dung?.SoDienThoai || first.SDTNguoiDat || first.SDTKhachVangLai || 'N/A';
        const emailKhach = hd.nguoi_dung?.Email || first.EmailNguoiDat || first.EmailKhachVangLai || '';

        const cumSanObj = first.san_bong?.cum_san || first.san_bong?.cumSan || {};
        const tenCumSan = cumSanObj.TenCumSan || 'Hệ thống sân bóng DN Football';
        const diaChiCum = cumSanObj.DiaChi || 'TP. Đà Nẵng, Việt Nam';
        const ngayLap = hd.NgayTao ? new Date(hd.NgayTao).toLocaleString('vi-VN') : new Date().toLocaleString('vi-VN');
        const tenGiaiDau = first.giai_dau?.TenGiaiDau || first.giaiDau?.TenGiaiDau || null;
        const loaiHinhDichVu = tenGiaiDau ? `Tổ chức Giải đấu (${tenGiaiDau})` : 'Thuê sân bóng đá phong trào';

        const ptMap = {
            'ViDienTu': 'Ví điện tử DN Football',
            'ChuyenKhoan': 'Chuyển khoản ngân hàng (VNPay)',
            'TienMat': 'Tiền mặt tại quầy'
        };
        const ptText = ptMap[hd.PhuongThucThanhToan] || hd.PhuongThucThanhToan || 'Chuyển khoản ngân hàng (VNPay)';

        const statusItemMap = {
            'DaCoc':     { label: 'Đã đặt cọc', color: '#b45309', bg: '#fef3c7' },
            'HoanThanh': { label: 'Hoàn thành', color: '#047857', bg: '#d1fae5' },
            'DaHuy':     { label: 'Đã hủy',     color: '#b91c1c', bg: '#fee2e2' },
            'KhongDen':  { label: 'Không đến',  color: '#475569', bg: '#e2e8f0' }
        };

        let tongTienSanGoc = 0;
        let tongCocKhongDen = 0;
        let soTranTinhTienGoc = 0;
        let soTranKhongDen = 0;

        const rowsHtml = listDatSan.map((ds, i) => {
            const tenSan = ds.san_bong?.TenSan || 'Sân bóng';
            const loaiSan = ds.san_bong?.loai_san?.TenLoaiSan || ds.san_bong?.loaiSan?.TenLoaiSan || '';
            const cumSan = ds.san_bong?.cum_san?.TenCumSan || tenCumSan;
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

            const stInfo = statusItemMap[ds.TrangThai] || { label: ds.TrangThai, color: '#334155', bg: '#f1f5f9' };

            return `
                <tr>
                    <td style="text-align:center;">${i + 1}</td>
                    <td style="text-align:center; font-family:monospace; font-weight:700;">#${maVe}</td>
                    <td>
                        <strong>${tenSan}</strong>${loaiSan ? ` <span style="font-size:12px; color:#64748b;">(${loaiSan})</span>` : ''}<br>
                        <span style="font-size:12px; color:#64748b;">${cumSan}</span>
                    </td>
                    <td style="text-align:center;">
                        <strong style="color:#0b5d3b;">${kg}</strong><br>
                        <span style="font-size:12px; color:#475569;">Ngày: ${ngayDa}</span>
                    </td>
                    <td style="text-align:center;">
                        <span style="display:inline-block; padding:3px 8px; border-radius:4px; font-size:11.5px; font-weight:700; color:${stInfo.color}; background:${stInfo.bg};">${stInfo.label}</span>
                    </td>
                    <td style="text-align:right; font-weight:600;">${donGia.toLocaleString('vi-VN')}đ</td>
                    <td style="text-align:right; color:#047857; font-weight:700;">${tienCocTran.toLocaleString('vi-VN')}đ</td>
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

        const daTatToanXong = (hd.TrangThai === 'HoanThanh') ||
            (listDatSan.length > 0 && !listDatSan.some(d => d.TrangThai === 'DaCoc') && listDatSan.some(d => d.TrangThai === 'HoanThanh'));
        const tienThanhToanTaiSan = Math.max(0, tongTien - tienCoc);
        const conPhaiThu = (hd.TrangThai === 'DaHuy' || daTatToanXong) ? 0 : tienThanhToanTaiSan;

        const badgeTrangThaiHD = daTatToanXong
            ? `<span style="background:#d1fae5; color:#065f46; border:1px solid #6ee7b7; padding:4px 10px; border-radius:4px; font-size:12px; font-weight:800; display:inline-block; margin-top:4px;">ĐÃ THANH TOÁN ĐỦ 100%</span>`
            : (hd.TrangThai === 'DaHuy'
                ? `<span style="background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; padding:4px 10px; border-radius:4px; font-size:12px; font-weight:800; display:inline-block; margin-top:4px;">ĐÃ HỦY HÓA ĐƠN</span>`
                : `<span style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; padding:4px 10px; border-radius:4px; font-size:12px; font-weight:800; display:inline-block; margin-top:4px;">ĐÃ ĐẶT CỌC GIỮ SÂN</span>`);

        const printWin = window.open('', '_blank', 'width=900,height=780');
        if (!printWin) return alert('Vui lòng cho phép mở cửa sổ Pop-up để in hóa đơn!');

        printWin.document.write(`
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8">
                <title>Hóa đơn dịch vụ đặt sân #${hd.MaHoaDonDatSan} - DN Football</title>
                <style>
                    body { font-family: Arial, sans-serif; color: #0f172a; margin: 28px; line-height: 1.5; font-size: 13px; }
                    .invoice-box { border: 1.5px solid #cbd5e1; border-radius: 8px; overflow: hidden; background: #ffffff; }
                    .header { padding: 18px 22px; border-bottom: 2px solid #0b5d3b; background: #f8fafc; display: flex; justify-content: space-between; align-items: flex-start; }
                    .brand { font-size: 17px; font-weight: 800; color: #0b5d3b; text-transform: uppercase; }
                    .doc-title { font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: 0.3px; }
                    .cust-info { padding: 14px 22px; background: #ffffff; border-bottom: 1px solid #e2e8f0; display: grid; grid-template-columns: 1.2fr 1fr; gap: 6px 16px; }
                    .body-wrap { padding: 16px 22px; }
                    table.items { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
                    table.items th, table.items td { border: 1px solid #cbd5e1; padding: 9px 10px; }
                    table.items th { background: #f1f5f9; color: #0f172a; font-weight: 700; }
                    .summary { width: 380px; margin-left: auto; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px 16px; font-size: 13.5px; }
                    .sum-row { display: flex; justify-content: space-between; padding: 5px 0; }
                    .footer-note { padding: 10px 22px; background: #f1f5f9; border-top: 1px solid #cbd5e1; font-size: 12px; color: #64748b; text-align: center; }
                </style>
            </head>
            <body>
                <div class="invoice-box">
                    <div class="header">
                        <div>
                            <div class="brand">HỆ THỐNG SÂN BÓNG ĐÁ DN FOOTBALL</div>
                            <div style="margin-top:4px; color:#334155;"><strong>Đơn vị quản lý:</strong> ${tenCumSan}</div>
                            <div style="margin-top:2px; color:#475569; font-size:12.5px;"><strong>Địa chỉ:</strong> ${diaChiCum}</div>
                            <div style="margin-top:2px; color:#475569; font-size:12.5px;"><strong>Hotline CSKH:</strong> 0899244124</div>
                        </div>
                        <div style="text-align:right;">
                            <div class="doc-title">HÓA ĐƠN DỊCH VỤ ĐẶT SÂN</div>
                            <div style="margin-top:4px; color:#334155;">Số HĐ: <strong style="font-family:monospace; font-size:14px; color:#0b5d3b;">#${hd.MaHoaDonDatSan}</strong></div>
                            <div style="margin-top:2px; color:#475569; font-size:12.5px;">Ngày lập: ${ngayLap}</div>
                            ${badgeTrangThaiHD}
                        </div>
                    </div>

                    <div class="cust-info">
                        <div><strong>Khách hàng / Đơn vị:</strong> ${tenKhach}</div>
                        <div><strong>Số điện thoại:</strong> ${sdtKhach}</div>
                        <div><strong>Hình thức dịch vụ:</strong> ${loaiHinhDichVu}</div>
                        <div><strong>Phương thức đặt cọc:</strong> ${ptText}</div>
                        ${emailKhach ? `<div style="grid-column: 1 / -1;"><strong>Email nhận chứng từ:</strong> ${emailKhach}</div>` : ''}
                    </div>

                    <div class="body-wrap">
                        <table class="items">
                            <thead>
                                <tr>
                                    <th style="width:40px; text-align:center;">STT</th>
                                    <th style="width:95px; text-align:center;">Mã Vé</th>
                                    <th style="text-align:left;">Chi Tiết Sân Bóng & Cơ Sở</th>
                                    <th style="width:135px; text-align:center;">Thời Gian Sử Dụng</th>
                                    <th style="width:100px; text-align:center;">Trạng Thái</th>
                                    <th style="width:110px; text-align:right;">Đơn Giá</th>
                                    <th style="width:110px; text-align:right;">Đã Đặt Cọc</th>
                                </tr>
                            </thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>

                        <div class="summary">
                            ${tongTienSanGoc > 0 ? `<div class="sum-row"><span>Tổng tiền sân gốc (${soTranTinhTienGoc} ca):</span><strong>${tongTienSanGoc.toLocaleString('vi-VN')}đ</strong></div>` : ''}
                            ${tongCocKhongDen > 0 ? `<div class="sum-row" style="color:#64748b;"><span>Tiền cọc giữ lại (${soTranKhongDen} ca không đến):</span><strong>${tongCocKhongDen.toLocaleString('vi-VN')}đ</strong></div>` : ''}
                            ${soTienGiam > 0 ? `<div class="sum-row" style="color:#2563eb;"><span>Chiết khấu khuyến mãi (${kmObj ? kmObj.TenKhuyenMai : 'Voucher'}):</span><strong>-${soTienGiam.toLocaleString('vi-VN')}đ</strong></div>` : ''}
                            <div class="sum-row" style="color:#475569;"><span>Thuế GTGT (VAT 8%):</span><strong>+${thueVAT.toLocaleString('vi-VN')}đ</strong></div>
                            <div class="sum-row" style="border-top:1px solid #cbd5e1; padding-top:7px;"><span><strong>Tổng cộng giá trị Hóa đơn:</strong></span><strong>${tongTien.toLocaleString('vi-VN')}đ</strong></div>
                            <div class="sum-row" style="color:#047857;"><span>Tiền cọc đã thanh toán:</span><strong>${tienCoc.toLocaleString('vi-VN')}đ</strong></div>
                            ${daTatToanXong ? `
                                <div class="sum-row" style="color:#047857;"><span>Đã thanh toán tại sân:</span><strong>${tienThanhToanTaiSan.toLocaleString('vi-VN')}đ</strong></div>
                                <div class="sum-row" style="border-top:2px solid #0f172a; padding-top:10px; color:#0b5d3b; font-size:15px;"><strong>CÒN PHẢI THU:</strong><strong>0đ (Đã tất toán)</strong></div>
                            ` : `
                                <div class="sum-row" style="border-top:2px solid #0f172a; padding-top:10px; color:#e11d48; font-size:15px;"><strong>CÒN THU TẠI SÂN:</strong><strong>${conPhaiThu.toLocaleString('vi-VN')}đ</strong></div>
                            `}
                        </div>
                    </div>

                    <div class="footer-note">
                        Chứng từ điện tử được khởi tạo tự động từ Hệ thống Quản lý Sân bóng <strong>DN Football</strong> — Đà Nẵng.
                    </div>
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