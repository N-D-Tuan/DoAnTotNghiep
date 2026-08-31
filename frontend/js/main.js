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