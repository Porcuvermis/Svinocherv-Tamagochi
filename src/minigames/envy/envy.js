// ================= МИНИ-ИГРА ГРЕХ ЗАВИСТИ (ОБЛАКО ОБРАЗОВ) =================
// Экран целиком занят чужими образами. Они разложены по глубине, но каждому
// заранее скомпенсирована перспектива (см. cloudCompensate) — поэтому с
// рабочей точки камеры облако читается как ПЛОСКИЙ рисунок, и объём вылезает
// наружу только когда камера трогается с места.
//
// Правила:
//   • пустой образ под пальцем растворяется и рвёт сцену вокруг себя —
//     сквозь дыру видно пустоту за облаком;
//   • значимые образы (один правильный + несколько неправильных) МАТЕРИАЛЬНЫ:
//     они не растворяются, и чужой ореол прозрачности их не берёт. Палец,
//     растворив пустышку, добирается до того, что лежало под ней;
//   • удержание на значимом образе раскачивает его дрожью, через секунду от
//     него расходится волна света — зелёная у правильного, красная у
//     неправильного. Соседние образы качает на этой волне, как листву на воде:
//     в центре сильно, к краям всё слабее;
//   • досидел до конца — правильный уносит камеру ВПЕРЁД сквозь отработанное
//     облако к следующему, неправильный отбрасывает НАЗАД. В обоих случаях
//     камера встаёт в ту же рабочую точку, и новое облако снова плоское.
//
// Одновременно в сцене всегда три облака: текущее, следующее (куда летим за
// правильный выбор) и предыдущее (куда отбрасывает за неправильный). После
// каждого пролёта два лишних выгружаются и генерируются заново.
//
// Числа сложности (сколько держать, сколько неправильных) — в ECONOMY.
// Здесь только визуал: размеры облака, глубина, скорость пролёта, волна.

const ENVY_SCENE = {
    FOV: 45,
    CAM_DIST: 34,            // расстояние от камеры до переднего плана облака в покое
    MAX_TILES: 104,          // потолок по числу образов в облаке (телефон)
    SPRITE_MULT: 1.55,       // спрайт крупнее шага сетки — образы наезжают друг на друга
    ROW_SQUASH: 0.95,        // шаг по вертикали относительно шага по горизонтали
    HOLE_SCALE: 1.15,        // дыра чуть больше самого образа — она ест и соседей
    LAYER_STEP: 5.2,         // глубина между соседними слоями
    CLOUD_GAP: 55,           // пустота между задом облака и передом следующего
    FLY_MS: 1700,
    RESOLVE_DELAY_MS: 320,   // пауза после срабатывания образа, чтобы увидеть волну
    OPEN_MS: 260,            // за сколько пустышка растворяется под пальцем
    DRILL_AT: 0.8,           // с какой прозрачности палец проваливается глубже
    MAX_HOLES: 10,           // столько же, сколько слотов в шейдере
    TREMBLE: 0.16,           // амплитуда дрожи значимого образа, в долях клетки
    WAVE_SPEED: 46,          // скорость фронта волны, мировых единиц в секунду
    WAVE_AMP: 0.3,           // амплитуда качания, в долях клетки
    WAVE_FALLOFF: 0.006,     // затухание качания по расстоянию от центра
    WAVE_DECAY_MS: 620,      // затухание качания по времени после прохода фронта
    WAVE_FREQ: 12,           // частота качания, рад/с
    WAVE_LIFE_MS: 2200,
    WIN_MS: 1900,            // длительность победного разгона в белое
    HINT_GREEN: '#3ddc73',
    HINT_RED: '#ff3b30',
};

// Шейдер разрыва: сцена пришла текстурой, в ней вырезаются дыры точной формы
// образа (SDF), с бегущей по силуэту волной и мягким градиентом наружу.
// Радиус приходит уже посчитанным в долях ВЫСОТЫ экрана — иначе дыра не
// совпадает с фигурой, когда та меняет экранный размер при пролёте.
const EnvyTearShader = {
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        #define MAX_EFFECTS 10

        uniform sampler2D tDiffuse;
        uniform float uAspect;
        uniform float uTime;
        uniform int uCount;
        uniform vec2 uCenters[MAX_EFFECTS];
        uniform float uIntensities[MAX_EFFECTS];
        uniform float uSeeds[MAX_EFFECTS];
        uniform int uShapeTypes[MAX_EFFECTS];
        uniform float uRotations[MAX_EFFECTS];
        uniform float uRadii[MAX_EFFECTS];

        varying vec2 vUv;

        float sdCircle(vec2 p, float r) {
            return length(p) - r;
        }

        float sdBox(vec2 p, vec2 b) {
            vec2 d = abs(p) - b;
            return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
        }

        float sdEquilateralTriangle(vec2 p, float r) {
            const float k = sqrt(3.0);
            p.x = abs(p.x) - r;
            p.y = p.y + r / k;
            if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
            p.x -= clamp(p.x, -2.0 * r, 0.0);
            return -length(p) * sign(p.y);
        }

        vec2 rotateVec(vec2 v, float angle) {
            float s = sin(angle);
            float c = cos(angle);
            return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
        }

        void main() {
            vec4 sceneColor = texture2D(tDiffuse, vUv);

            if (uCount == 0) {
                gl_FragColor = sceneColor;
                return;
            }

            float finalAlphaFactor = 1.0;

            for (int i = 0; i < MAX_EFFECTS; i++) {
                if (i >= uCount) break;

                float intensity = uIntensities[i];
                if (intensity <= 0.001) continue;

                vec2 pos = vUv - uCenters[i];
                pos.x *= uAspect;
                pos = rotateVec(pos, -uRotations[i]);

                float baseSize = uRadii[i];
                float baseDist = 0.0;

                if (uShapeTypes[i] == 0) {
                    baseDist = sdCircle(pos, baseSize);
                } else if (uShapeTypes[i] == 1) {
                    baseDist = sdBox(pos, vec2(baseSize * 0.94));
                } else {
                    baseDist = sdEquilateralTriangle(pos, baseSize * 1.15);
                }

                // Полярный угол — по нему бежит волна, из-за неё край дыры
                // рваный и живой, а не циркульный.
                float angle = atan(pos.y, pos.x);
                float wave = sin((angle - uTime * 2.5 + uSeeds[i]) * 4.0) * 0.10
                           + cos((angle + uTime * 1.8 - uSeeds[i]) * 3.0) * 0.07;

                float distWithWave = baseDist - (wave * baseSize * intensity);

                float edgeSoftness = max(0.004, baseSize * 0.28) * intensity;
                float maskAlpha = smoothstep(-0.001, edgeSoftness, distWithWave);

                finalAlphaFactor = min(finalAlphaFactor, mix(1.0, maskAlpha, intensity));
            }

            // Текстура пришла из render target с обычным блендингом, то есть
            // уже premultiplied: гасить надо И цвет, И альфу, иначе по краю
            // дыры остаётся светлая кайма.
            gl_FragColor = sceneColor * finalAlphaFactor;
        }
    `
};

// Геометрия образов. Форма описана один раз и используется дважды: для
// отрисовки в текстуру и для попадания пальцем. Разъедься они — палец начнёт
// цеплять пустой угол спрайта.
const ENVY_SQRT3_2 = Math.sqrt(3) / 2;

const ENVY_SHAPES = [
    {   // 0 — круг
        draw(ctx, s) {
            ctx.beginPath();
            ctx.arc(s * 0.5, s * 0.5, s * 0.469, 0, Math.PI * 2);
            ctx.fill();
        },
        hit(x, y) { // x,y в долях спрайта от центра (-0.5..0.5)
            return x * x + y * y <= 0.469 * 0.469;
        }
    },
    {   // 1 — квадрат со скруглением
        draw(ctx, s) {
            const half = s * 0.441;
            const r = s * 0.06;
            const x0 = s * 0.5 - half, x1 = s * 0.5 + half;
            const y0 = s * 0.5 - half, y1 = s * 0.5 + half;
            ctx.beginPath();
            ctx.moveTo(x0 + r, y0);
            ctx.arcTo(x1, y0, x1, y1, r);
            ctx.arcTo(x1, y1, x0, y1, r);
            ctx.arcTo(x0, y1, x0, y0, r);
            ctx.arcTo(x0, y0, x1, y0, r);
            ctx.closePath();
            ctx.fill();
        },
        hit(x, y) {
            return Math.abs(x) <= 0.441 && Math.abs(y) <= 0.441;
        }
    },
    {   // 2 — равносторонний треугольник вершиной вверх
        draw(ctx, s) {
            const side = s * 0.98;
            const h = side * ENVY_SQRT3_2;
            const cx = s * 0.5, cy = s * 0.5;
            ctx.beginPath();
            ctx.moveTo(cx, cy - h * (2 / 3));
            ctx.lineTo(cx + side / 2, cy + h / 3);
            ctx.lineTo(cx - side / 2, cy + h / 3);
            ctx.closePath();
            ctx.fill();
        },
        hit(x, y) {
            // y вниз, как на канве. Внутри треугольника: ниже вершины,
            // выше основания и между двумя боковыми сторонами.
            const h = 0.98 * ENVY_SQRT3_2;
            if (y > h / 3 || y < -h * (2 / 3)) return false;
            const halfAt = (y + h * (2 / 3)) / h * 0.49;
            return Math.abs(x) <= halfAt;
        }
    }
];

const EnvyMinigame = {
    // ---------- DOM ----------
    screenElement: null,
    closeBtn: null,
    canvas: null,
    gaugeBar: null,
    winOverlay: null,
    confirmOverlay: null,
    confirmStayBtn: null,
    confirmLeaveBtn: null,

    // ---------- THREE ----------
    renderer: null,
    scene: null,
    camera: null,
    bgScene: null,
    flatCamera: null,
    rtAll: null,
    rtSig: null,
    postScene: null,
    postMaterial: null,
    sigScene: null,
    sigMaterial: null,
    tileGeometry: null,
    shapeTextures: null,
    raycaster: null,
    pointerNdc: null,
    scratchVec: null,
    hintColors: null,

    // ---------- ИГРА ----------
    layout: null,
    clouds: { cur: null, next: null, prev: null },
    waves: [],
    activeTile: null,
    pointerDown: false,
    pointerX: 0,
    pointerY: 0,

    state: 'idle',       // idle | play | resolving | flying | winning
    flyFrom: 0,
    flyTo: 0,
    flyMs: 0,
    flyDir: -1,
    resolveMs: 0,
    winMs: 0,

    fillThirds: 0,
    hasWon: false,

    rafId: null,
    lastTs: null,

    balance() {
        const cfg = (typeof ECONOMY !== 'undefined' && ECONOMY.minigames && ECONOMY.minigames.envy) || {};
        return {
            rounds: cfg.rounds || 3,
            wrongBase: cfg.wrongBase || 3,
            wrongPerRound: cfg.wrongPerRound || 1,
            wrongMax: cfg.wrongMax || 5,
            holdMs: cfg.holdMs || 3000,
            hintMs: cfg.hintMs || 1000
        };
    },

    // ================= ЖИЗНЕННЫЙ ЦИКЛ =================
    init() {
        this.screenElement = document.getElementById('envy-game');
        this.closeBtn = document.getElementById('envy-close-btn');
        this.canvas = document.getElementById('envy-canvas');
        this.gaugeBar = document.getElementById('envy-gauge-bar');
        this.winOverlay = document.getElementById('envy-win-overlay');
        this.confirmOverlay = document.getElementById('envy-confirm-overlay');
        this.confirmStayBtn = document.getElementById('envy-confirm-stay');
        this.confirmLeaveBtn = document.getElementById('envy-confirm-leave');

        if (!this.canvas) return;

        if (this.closeBtn) {
            this.closeBtn.onclick = (e) => {
                e.stopPropagation();
                if (this.hasWon) this.close();
                else this.showConfirm();
            };
        }
        if (this.confirmStayBtn) {
            this.confirmStayBtn.onclick = (e) => { e.stopPropagation(); this.hideConfirm(); };
        }
        if (this.confirmLeaveBtn) {
            this.confirmLeaveBtn.onclick = (e) => { e.stopPropagation(); this.close(); };
        }

        this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
        window.addEventListener('pointerup', () => this.onPointerUp());
        window.addEventListener('pointercancel', () => this.onPointerUp());

        window.addEventListener('resize', () => {
            if (this.screenElement && this.screenElement.classList.contains('active')) {
                this.resize();
            }
        });
    },

    open() {
        if (!this.canvas) this.init();
        if (!this.canvas) return;

        this.screenElement.classList.add('active');

        this.fillThirds = 0;
        this.hasWon = false;
        this.waves = [];
        this.activeTile = null;
        this.pointerDown = false;
        this.state = 'play';

        this.updateGauge();
        this.hideConfirm();
        if (this.winOverlay) {
            this.winOverlay.classList.remove('show');
            this.winOverlay.style.opacity = '';
        }

        this.ensureThree();
        this.resize();          // считает раскладку и строит все три облака

        this.lastTs = null;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = requestAnimationFrame((ts) => this.loop(ts));
    },

    close() {
        if (this.screenElement) this.screenElement.classList.remove('active');
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.pointerDown = false;
        this.activeTile = null;
        this.state = 'idle';
        this.hideConfirm();

        // Облака выгружаем: три сотни материалов держать в памяти между
        // заходами незачем, рендерер и текстуры форм переживают закрытие.
        this.disposeCloud(this.clouds.cur);
        this.disposeCloud(this.clouds.next);
        this.disposeCloud(this.clouds.prev);
        this.clouds = { cur: null, next: null, prev: null };

        const fullMenu = document.getElementById('full-menu');
        const miniHud = document.getElementById('mini-hud');
        if (fullMenu && !fullMenu.classList.contains('active') && miniHud) {
            miniHud.style.opacity = '1';
            miniHud.style.pointerEvents = 'auto';
        }
    },

    showConfirm() {
        this.pointerDown = false;
        this.clearTouch();
        if (this.confirmOverlay) this.confirmOverlay.classList.add('show');
    },

    hideConfirm() {
        if (this.confirmOverlay) this.confirmOverlay.classList.remove('show');
    },

    updateGauge() {
        const rounds = this.balance().rounds;
        const pct = Math.min(100, (this.fillThirds / rounds) * 100);
        if (this.gaugeBar) this.gaugeBar.style.width = `${pct}%`;
    },

    // ================= СЦЕНА =================
    ensureThree() {
        if (this.renderer) return;

        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.autoClear = false;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(ENVY_SCENE.FOV, 1, 0.1, 20000);
        this.camera.position.set(0, 0, ENVY_SCENE.CAM_DIST);

        this.flatCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        this.raycaster = new THREE.Raycaster();
        this.pointerNdc = new THREE.Vector2();
        this.scratchVec = new THREE.Vector3();
        this.hintColors = {
            right: new THREE.Color(ENVY_SCENE.HINT_GREEN),
            wrong: new THREE.Color(ENVY_SCENE.HINT_RED)
        };

        this.tileGeometry = new THREE.PlaneGeometry(1, 1);
        this.shapeTextures = ENVY_SHAPES.map((_, i) => this.createShapeTexture(i));

        this.buildBackground();
        this.buildPostChain();
    },

    // Форма рисуется белой маской, а цвет берётся material.color. Так на всё
    // облако хватает трёх текстур вместо сотни: раньше каждая фигура тащила
    // свою SVG-текстуру 256×256, и это были мегабайты видеопамяти на ровном месте.
    createShapeTexture(shapeIndex) {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ENVY_SHAPES[shapeIndex].draw(ctx, size);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        return texture;
    },

    buildBackground() {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const far = (typeof PALETTE !== 'undefined' && PALETTE.envyVoid) ? PALETTE.envyVoid[900] : '#0d0810';
        const near = (typeof PALETTE !== 'undefined' && PALETTE.envyVoid) ? PALETTE.envyVoid[700] : '#1a1020';
        const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.72);
        grad.addColorStop(0, near);
        grad.addColorStop(1, far);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);

        this.bgScene = new THREE.Scene();
        this.bgScene.add(new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, depthWrite: false })
        ));
    },

    buildPostChain() {
        const uniforms = {
            tDiffuse: { value: null },
            uAspect: { value: 1 },
            uTime: { value: 0 },
            uCount: { value: 0 },
            uCenters: { value: Array.from({ length: ENVY_SCENE.MAX_HOLES }, () => new THREE.Vector2(-9999, -9999)) },
            uIntensities: { value: new Float32Array(ENVY_SCENE.MAX_HOLES) },
            uSeeds: { value: new Float32Array(ENVY_SCENE.MAX_HOLES) },
            uShapeTypes: { value: new Int32Array(ENVY_SCENE.MAX_HOLES) },
            uRotations: { value: new Float32Array(ENVY_SCENE.MAX_HOLES) },
            uRadii: { value: new Float32Array(ENVY_SCENE.MAX_HOLES) }
        };

        this.postMaterial = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: EnvyTearShader.vertexShader,
            fragmentShader: EnvyTearShader.fragmentShader,
            transparent: true,
            premultipliedAlpha: true,
            depthTest: false,
            depthWrite: false
        });
        this.postScene = new THREE.Scene();
        this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial));

        this.sigMaterial = new THREE.MeshBasicMaterial({
            transparent: true,
            premultipliedAlpha: true,
            depthTest: false,
            depthWrite: false
        });
        this.sigScene = new THREE.Scene();
        this.sigScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.sigMaterial));
    },

    resize() {
        const w = this.canvas.clientWidth || window.innerWidth;
        const h = this.canvas.clientHeight || window.innerHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();

        const targetOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
        if (!this.rtAll) {
            this.rtAll = new THREE.WebGLRenderTarget(w * dpr, h * dpr, targetOpts);
            this.rtSig = new THREE.WebGLRenderTarget(w * dpr, h * dpr, targetOpts);
            this.sigMaterial.map = this.rtSig.texture;
        } else {
            this.rtAll.setSize(w * dpr, h * dpr);
            this.rtSig.setSize(w * dpr, h * dpr);
        }
        this.postMaterial.uniforms.uAspect.value = w / h;

        // Раскладка зависит от пропорций экрана, поэтому облака пересобираются:
        // прогресс (fillThirds) при этом не трогаем.
        this.computeLayout(w / h);
        this.rebuildClouds();
    },

    // Сетка подбирается под экран: клетки почти квадратные, колонок столько,
    // чтобы образов вышло не больше потолка — на телефоне 300 спрайтов в трёх
    // облаках уже режут кадры.
    computeLayout(aspect) {
        const viewH = 2 * ENVY_SCENE.CAM_DIST * Math.tan((ENVY_SCENE.FOV / 2) * Math.PI / 180);
        const viewW = viewH * aspect;

        // Колонки набираются вверх, пока облако помещается в потолок: считать
        // от фиксированного числа колонок нельзя — на широком экране (поворот
        // телефона) то же число колонок давало вдвое меньше образов, и поле
        // вырождалось в десяток огромных фигур.
        const measure = (cols) => {
            const cell = viewW / cols;
            const rows = Math.ceil(viewH / (cell * ENVY_SCENE.ROW_SQUASH)) + 2;
            return { cols, cell, rows, total: rows * (cols + 2) };
        };

        let best = measure(3);
        for (let cols = 4; cols <= 24; cols++) {
            const m = measure(cols);
            if (m.total > ENVY_SCENE.MAX_TILES) break;
            best = m;
        }
        const { cols, cell, rows, total } = best;

        this.layout = {
            cols: cols + 2,               // +по колонке с каждой стороны за край экрана
            rows,
            cell,
            rowStep: cell * ENVY_SCENE.ROW_SQUASH,
            sprite: cell * ENVY_SCENE.SPRITE_MULT,
            total,
            viewW,
            viewH,
            depthSpan: (total - 1) * ENVY_SCENE.LAYER_STEP,
            spacing: (total - 1) * ENVY_SCENE.LAYER_STEP + ENVY_SCENE.CAM_DIST + ENVY_SCENE.CLOUD_GAP
        };
    },

    // ================= ОБЛАКА =================
    wrongCountFor(fill) {
        const b = this.balance();
        const step = Math.max(0, Math.min(b.rounds - 1, fill));
        return Math.min(b.wrongMax, b.wrongBase + b.wrongPerRound * step);
    },

    rebuildClouds() {
        this.disposeCloud(this.clouds.cur);
        this.disposeCloud(this.clouds.next);
        this.disposeCloud(this.clouds.prev);

        const s = this.layout.spacing;
        this.clouds.cur = this.buildCloud(0, this.wrongCountFor(this.fillThirds));
        this.clouds.next = this.buildCloud(-s, this.wrongCountFor(this.fillThirds + 1));
        this.clouds.prev = this.buildCloud(s, this.wrongCountFor(this.fillThirds - 1));
        this.clouds.prev.group.visible = false;   // оно за спиной, показывается только на откате

        this.camera.position.z = ENVY_SCENE.CAM_DIST;
        this.activeTile = null;
        this.waves = [];
    },

    buildCloud(originZ, wrongCount) {
        const L = this.layout;
        const group = new THREE.Group();
        group.position.z = originZ;
        this.scene.add(group);

        const palette = (typeof PALETTE !== 'undefined' && PALETTE.envyImages) ? PALETTE.envyImages
            : ['#e04f4f', '#e8823c', '#e0b342', '#6dbf5a', '#3fa8c6', '#6d6fd6', '#c455bd'];

        // Каждому образу свой слой глубины: облако должно быть кучей листвы,
        // а не аккуратными рядами. Порядок слоёв перемешивается.
        const layers = Array.from({ length: L.total }, (_, i) => i);
        for (let i = layers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [layers[i], layers[j]] = [layers[j], layers[i]];
        }

        const tiles = [];
        const meshes = [];
        const totalW = L.cols * L.cell;
        const totalH = L.rows * L.rowStep;
        let index = 0;

        for (let r = 0; r < L.rows; r++) {
            for (let c = 0; c < L.cols; c++) {
                const bx = c * L.cell + (r % 2) * (L.cell / 2) - totalW / 2 + L.cell / 2;
                const by = r * L.rowStep - totalH / 2 + L.rowStep / 2;

                const shape = Math.floor(Math.random() * ENVY_SHAPES.length);
                const colorHex = palette[Math.floor(Math.random() * palette.length)];
                const material = new THREE.MeshBasicMaterial({
                    map: this.shapeTextures[shape],
                    color: new THREE.Color(colorHex),
                    transparent: true,
                    // Порог согласован с DRILL_AT: растворяющаяся пустышка
                    // перестаёт писать глубину примерно тогда же, когда палец
                    // проваливается сквозь неё. Иначе она ещё держит собой
                    // образ, который под ней уже должен показаться.
                    alphaTest: 1 - ENVY_SCENE.DRILL_AT,
                    depthTest: true,
                    depthWrite: true
                });

                const mesh = new THREE.Mesh(this.tileGeometry, material);
                mesh.rotation.z = (Math.random() * 40 - 20) * Math.PI / 180;
                group.add(mesh);
                meshes.push(mesh);

                const tile = {
                    mesh,
                    mat: material,
                    baseColor: new THREE.Color(colorHex),
                    bx, by,
                    depth: layers[index] * ENVY_SCENE.LAYER_STEP,
                    sizeMul: 0.92 + Math.random() * 0.16,
                    shape,
                    rot: mesh.rotation.z,
                    seed: Math.random() * 10,
                    driftPhase: Math.random() * Math.PI * 2,
                    kind: 'empty',
                    intensity: 0,
                    target: 0,
                    heldMs: 0,
                    hinted: false
                };
                mesh.userData.tile = tile;   // чтобы не искать по индексу на каждом луче
                tiles.push(tile);
                index++;
            }
        }

        this.assignSignificant(tiles, wrongCount);

        const cloud = { group, tiles, meshes, lastV: null };
        this.cloudCompensate(cloud, true);
        return cloud;
    },

    // Значимые образы разносим по полю: если правильный и неправильный лежат
    // в соседних клетках, палец задевает оба разом и подсказка врёт.
    //
    // Отбор идёт по ВИДИМОЙ области, а не по краю сетки: крайние клетки висят
    // за экраном, а верхний правый угол занят крестиком — образ, попавший под
    // него, недоступен пальцем, и раунд становится непроходимым.
    assignSignificant(tiles, wrongCount) {
        const L = this.layout;
        const marginX = L.cell * 0.7;
        const marginY = L.cell * 1.0;
        const pool = tiles.filter(t =>
            Math.abs(t.bx) <= L.viewW / 2 - marginX &&
            Math.abs(t.by) <= L.viewH / 2 - marginY
        );
        const minDist = this.layout.cell * 1.6;
        const chosen = [];
        let need = wrongCount + 1;
        let guard = 0;

        while (chosen.length < need && guard < 600) {
            guard++;
            const candidate = pool[Math.floor(Math.random() * pool.length)];
            if (!candidate || chosen.includes(candidate)) continue;
            const ok = chosen.every(t => Math.hypot(t.bx - candidate.bx, t.by - candidate.by) >= minDist);
            if (ok) chosen.push(candidate);
        }
        // На узком экране разнести всех не вышло — ослабляем требование,
        // но правильный образ обязан быть всегда.
        while (chosen.length < need) {
            const candidate = pool[Math.floor(Math.random() * pool.length)];
            if (candidate && !chosen.includes(candidate)) chosen.push(candidate);
            else break;
        }

        chosen.forEach((tile, i) => { tile.kind = (i === 0) ? 'right' : 'wrong'; });
    },

    disposeCloud(cloud) {
        if (!cloud) return;
        cloud.tiles.forEach(t => t.mat.dispose());
        this.scene.remove(cloud.group);
    },

    // Компенсация перспективы. Образ на глубине d раздувается ровно настолько,
    // насколько его уменьшит перспектива с расстояния V — и облако с этой
    // точки складывается в плоский рисунок.
    //
    // V — реальное расстояние до переднего плана, но не меньше рабочего
    // CAM_DIST. Пока облако далеко (мы к нему летим), оно остаётся плоским и
    // просто растёт; как только камера подходит на рабочую дистанцию и
    // начинает проваливаться внутрь, компенсация замирает — и облако
    // раскрывается в глубину, сквозь которую летит камера.
    cloudCompensate(cloud, force) {
        const V = Math.max(ENVY_SCENE.CAM_DIST, this.camera.position.z - cloud.group.position.z);
        if (!force && cloud.lastV === V && cloud !== this.clouds.cur) return;
        cloud.lastV = V;

        for (const t of cloud.tiles) {
            const f = (V + t.depth) / V;
            const size = this.layout.sprite * t.sizeMul * (t.swayScale || 1) * f;
            t.mesh.position.set((t.bx + (t.offX || 0)) * f, (t.by + (t.offY || 0)) * f, -t.depth);
            t.mesh.scale.set(size, size, 1);
            t.mesh.rotation.z = t.rot + (t.swayRot || 0);
        }
    },

    // ================= ВВОД =================
    localPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },

    onPointerDown(e) {
        if (this.state !== 'play') return;
        if (this.confirmOverlay && this.confirmOverlay.classList.contains('show')) return;
        e.preventDefault();
        const p = this.localPos(e);
        this.pointerDown = true;
        this.pointerX = p.x;
        this.pointerY = p.y;
    },

    onPointerMove(e) {
        if (!this.pointerDown || this.state !== 'play') return;
        e.preventDefault();
        const p = this.localPos(e);
        this.pointerX = p.x;
        this.pointerY = p.y;
    },

    onPointerUp() {
        if (!this.pointerDown) return;
        this.pointerDown = false;
        this.clearTouch();
    },

    clearTouch() {
        const cloud = this.clouds.cur;
        if (cloud) {
            cloud.tiles.forEach(t => {
                t.target = 0;
                t.heldMs = 0;
                t.hinted = false;
            });
        }
        this.activeTile = null;
    },

    // Палец растворяет пустышки под собой и проваливается глубже, пока не
    // упрётся в материальный образ. Именно так значимая фигура и находится:
    // она единственная, сквозь которую не пройти.
    traceTouch() {
        const cloud = this.clouds.cur;
        if (!cloud) return;

        const rect = this.canvas.getBoundingClientRect();
        this.pointerNdc.x = (this.pointerX / rect.width) * 2 - 1;
        this.pointerNdc.y = -(this.pointerY / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointerNdc, this.camera);

        const hits = this.raycaster.intersectObjects(cloud.meshes, false);
        const touched = new Set();
        let active = null;

        for (const hit of hits) {
            const tile = hit.object.userData.tile;
            if (!tile || !hit.uv) continue;
            // Спрайт квадратный, а образ внутри него — нет. По углам не ловим.
            if (!ENVY_SHAPES[tile.shape].hit(hit.uv.x - 0.5, 0.5 - hit.uv.y)) continue;

            if (tile.kind !== 'empty') { active = tile; break; }

            touched.add(tile);
            if (tile.intensity < ENVY_SCENE.DRILL_AT) break;  // ещё не растворилась — глубже не пускаем
            if (touched.size >= ENVY_SCENE.MAX_HOLES) break;
        }

        for (const tile of cloud.tiles) {
            if (tile.kind === 'empty') tile.target = touched.has(tile) ? 1 : 0;
            if (tile !== active && tile.kind !== 'empty') {
                tile.heldMs = 0;
                tile.hinted = false;
            }
        }
        this.activeTile = active;
    },

    // ================= ХОД ИГРЫ =================
    updatePlay(dt) {
        const cloud = this.clouds.cur;
        if (!cloud) return;

        if (this.pointerDown) this.traceTouch();
        else this.activeTile = null;

        const b = this.balance();

        for (const t of cloud.tiles) {
            if (t.kind === 'empty') {
                const step = dt / ENVY_SCENE.OPEN_MS;
                t.intensity = t.intensity < t.target
                    ? Math.min(1, t.intensity + step)
                    : Math.max(0, t.intensity - step);
                t.mat.opacity = 1 - t.intensity;
            }
        }

        const active = this.activeTile;
        if (!active) return;

        active.heldMs += dt;

        if (!active.hinted && active.heldMs >= b.hintMs) {
            active.hinted = true;
            this.spawnWave(active, active.kind === 'right' ? ENVY_SCENE.HINT_GREEN : ENVY_SCENE.HINT_RED, 1);
        }

        if (active.heldMs >= b.holdMs) {
            this.resolve(active);
        }
    },

    spawnWave(tile, color, strength) {
        this.waves.push({
            x: tile.bx,
            y: tile.by,
            age: 0,
            color: new THREE.Color(color),
            strength
        });
        if (this.waves.length > 4) this.waves.shift();
    },

    resolve(tile) {
        const b = this.balance();
        const right = tile.kind === 'right';

        // Мини-игра ничего себе не начисляет: она доводит счётчик до конца и
        // сообщает результат, а награду назначает конфиг (инвариант проекта).
        this.fillThirds = right
            ? Math.min(b.rounds, this.fillThirds + 1)
            : Math.max(0, this.fillThirds - 1);
        this.updateGauge();

        this.spawnWave(tile, right ? ENVY_SCENE.HINT_GREEN : ENVY_SCENE.HINT_RED, 2.4);

        this.pointerDown = false;
        this.clearTouch();
        this.state = 'resolving';
        this.resolveMs = 0;
        this.resolveRight = right;
        this.resolveWin = right && this.fillThirds >= b.rounds;
    },

    updateResolving(dt) {
        this.resolveMs += dt;
        if (this.resolveMs < ENVY_SCENE.RESOLVE_DELAY_MS) return;

        if (this.resolveWin) {
            this.state = 'winning';
            this.winMs = 0;
            this.flyFrom = this.camera.position.z;
            GameEvents.emit('minigame:result', { sin: 'envy', mode: 'cloud', outcome: 'win' });
        } else {
            this.startFlight(this.resolveRight ? -1 : 1);
        }
    },

    // dir = -1 — вперёд, к следующему облаку; +1 — назад, к предыдущему.
    startFlight(dir) {
        const target = dir < 0 ? this.clouds.next : this.clouds.prev;
        if (!target) return;
        if (dir > 0) target.group.visible = true;

        this.state = 'flying';
        this.flyDir = dir;
        this.flyMs = 0;
        this.flyFrom = this.camera.position.z;
        this.flyTo = target.group.position.z + ENVY_SCENE.CAM_DIST;
    },

    updateFlying(dt) {
        this.flyMs += dt;
        const p = Math.min(1, this.flyMs / ENVY_SCENE.FLY_MS);
        const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        this.camera.position.z = this.flyFrom + (this.flyTo - this.flyFrom) * e;
        if (p >= 1) this.arrive();
    },

    // Прилетели: облако, к которому летели, становится рабочим и переезжает в
    // нуль (чтобы координаты не убегали в бесконечность за партию), остальные
    // выгружаются, вместо них строятся два новых — вперёд и назад.
    arrive() {
        const keep = this.flyDir < 0 ? this.clouds.next : this.clouds.prev;
        const drop = this.flyDir < 0 ? this.clouds.prev : this.clouds.next;

        this.disposeCloud(this.clouds.cur);
        this.disposeCloud(drop);

        keep.group.position.z = 0;
        keep.group.visible = true;
        this.camera.position.z = ENVY_SCENE.CAM_DIST;

        const s = this.layout.spacing;
        this.clouds.cur = keep;
        this.clouds.next = this.buildCloud(-s, this.wrongCountFor(this.fillThirds + 1));
        this.clouds.prev = this.buildCloud(s, this.wrongCountFor(this.fillThirds - 1));
        this.clouds.prev.group.visible = false;

        this.waves = [];
        this.activeTile = null;
        this.state = 'play';
    },

    // Победа — тот же пролёт вперёд, но без торможения: камера уходит сквозь
    // облака, экран выбеливается.
    updateWinning(dt) {
        this.winMs += dt;
        const p = Math.min(1, this.winMs / ENVY_SCENE.WIN_MS);
        const e = p * p;
        this.camera.position.z = this.flyFrom - this.layout.spacing * 2.4 * e;

        if (this.winOverlay) {
            if (p < 1) {
                this.winOverlay.style.opacity = String(Math.max(0, (p - 0.35) / 0.65));
            } else if (!this.hasWon) {
                this.hasWon = true;
                this.winOverlay.style.opacity = '';
                this.winOverlay.classList.add('show');
            }
        }
    },

    // ================= КАЧАНИЕ ОБРАЗОВ =================
    updateWaves(dt) {
        for (let i = this.waves.length - 1; i >= 0; i--) {
            this.waves[i].age += dt;
            if (this.waves[i].age > ENVY_SCENE.WAVE_LIFE_MS) this.waves.splice(i, 1);
        }
    },

    // Волна от значимого образа расходится кругами и качает соседей, как
    // брошенный камень качает листву на воде: в центре сильно, дальше слабее,
    // и всё быстро успокаивается. Она же и есть цветовая индикация.
    updateDisturbance(nowSec) {
        const cloud = this.clouds.cur;
        if (!cloud) return;
        const cell = this.layout.cell;
        const b = this.balance();

        for (const t of cloud.tiles) {
            // Постоянный еле заметный дрейф — чтобы облако не выглядело печатью.
            let ox = Math.sin(nowSec * 0.6 + t.driftPhase) * cell * 0.012;
            let oy = Math.cos(nowSec * 0.5 + t.driftPhase * 1.3) * cell * 0.012;
            let rot = 0;
            let scale = 1;
            let tint = 0;
            let tintColor = null;

            for (const w of this.waves) {
                const dx = t.bx - w.x;
                const dy = t.by - w.y;
                const dist = Math.hypot(dx, dy);
                const tau = w.age / 1000 - dist / ENVY_SCENE.WAVE_SPEED;
                if (tau <= 0) continue;

                const decay = Math.exp(-tau * 1000 / ENVY_SCENE.WAVE_DECAY_MS);
                if (decay < 0.008) continue;

                const falloff = 1 / (1 + dist * dist * ENVY_SCENE.WAVE_FALLOFF);
                const swing = Math.sin(tau * ENVY_SCENE.WAVE_FREQ);
                const amp = ENVY_SCENE.WAVE_AMP * cell * w.strength * falloff * decay * swing;

                if (dist > 0.001) {
                    ox += (dx / dist) * amp;
                    oy += (dy / dist) * amp;
                }
                rot += (amp / cell) * 0.4;
                scale += (amp / cell) * 0.06;

                // Подсветка живёт огибающей волны, а не только её гребнем: на
                // чистом гребне цвет мигал слишком коротко, чтобы успеть
                // прочитаться как ответ «правильный/неправильный».
                const k = Math.min(1, w.strength * falloff * decay * (0.55 + 0.45 * Math.abs(swing)));
                if (k > tint) { tint = k; tintColor = w.color; }
            }

            // Дрожь удерживаемого образа: чем дольше держишь, тем сильнее.
            if (t === this.activeTile && t.heldMs > 0) {
                const p = Math.min(1, t.heldMs / b.holdMs);
                const a = ENVY_SCENE.TREMBLE * cell * (0.2 + p * p);
                ox += Math.sin(nowSec * 47 + t.seed) * a;
                oy += Math.cos(nowSec * 39 + t.seed * 2) * a;
                rot += Math.sin(nowSec * 53 + t.seed) * 0.05 * (0.2 + p);
                // После подсказки образ ещё и держит свой цвет, чтобы не
                // гадать, что именно ты сейчас додерживаешь.
                if (t.hinted) {
                    tint = Math.max(tint, 0.55);
                    tintColor = t.kind === 'right' ? this.hintColors.right : this.hintColors.wrong;
                }
            }

            t.offX = ox;
            t.offY = oy;
            t.swayRot = rot;
            t.swayScale = scale;

            if (tintColor) t.mat.color.copy(t.baseColor).lerp(tintColor, Math.min(0.85, tint));
            else if (t.tinted) t.mat.color.copy(t.baseColor);
            t.tinted = !!tintColor;
        }
    },

    // ================= ДЫРЫ В СЦЕНЕ =================
    collectHoles() {
        const cloud = this.clouds.cur;
        const u = this.postMaterial.uniforms;
        if (!cloud) { u.uCount.value = 0; return; }

        const open = cloud.tiles
            .filter(t => t.kind === 'empty' && t.intensity > 0.001)
            .sort((a, b) => b.intensity - a.intensity)
            .slice(0, ENVY_SCENE.MAX_HOLES);

        const halfTan = Math.tan((ENVY_SCENE.FOV / 2) * Math.PI / 180);

        open.forEach((t, i) => {
            const world = this.scratchVec;
            t.mesh.getWorldPosition(world);
            const dist = Math.max(0.001, this.camera.position.z - world.z);
            world.project(this.camera);

            u.uCenters.value[i].set((world.x + 1) / 2, (world.y + 1) / 2);
            u.uIntensities.value[i] = t.intensity;
            u.uSeeds.value[i] = t.seed;
            u.uShapeTypes.value[i] = t.shape;
            u.uRotations.value[i] = t.mesh.rotation.z;
            // Радиус в долях высоты экрана: 0.469 — доля фигуры в спрайте.
            u.uRadii.value[i] = (t.mesh.scale.x * 0.469 * ENVY_SCENE.HOLE_SCALE) / (2 * halfTan * dist);
        });

        u.uCount.value = open.length;
    },

    // ================= ЦИКЛ И ОТРИСОВКА =================
    loop(ts) {
        if (!this.lastTs) this.lastTs = ts;
        const dt = Math.min(48, ts - this.lastTs);
        this.lastTs = ts;

        if (this.state === 'play') this.updatePlay(dt);
        else if (this.state === 'resolving') this.updateResolving(dt);
        else if (this.state === 'flying') this.updateFlying(dt);
        else if (this.state === 'winning') this.updateWinning(dt);

        this.updateWaves(dt);
        this.updateDisturbance(ts / 1000);

        if (this.clouds.cur) this.cloudCompensate(this.clouds.cur, true);
        if (this.clouds.next) this.cloudCompensate(this.clouds.next, false);
        if (this.clouds.prev && this.clouds.prev.group.visible) this.cloudCompensate(this.clouds.prev, false);

        this.collectHoles();
        this.postMaterial.uniforms.uTime.value = ts * 0.001;

        this.render();
        this.rafId = requestAnimationFrame((t) => this.loop(t));
    },

    // Два прохода не от хорошей жизни: значимые образы обязаны пережить дыру,
    // которую рвёт вокруг себя соседняя пустышка. Поэтому сначала рендерится
    // всё облако (его и рвёт шейдер), а потом отдельно — только значимые
    // образы, поверх. Чтобы они при этом честно прятались за непрозрачными
    // соседями, перед ними в тот же буфер пишется глубина пустышек.
    render() {
        const r = this.renderer;

        r.setRenderTarget(this.rtAll);
        r.clear(true, true, false);
        r.render(this.scene, this.camera);

        // Пока в облаке нет ни одной дыры, спасать значимые образы не от чего:
        // в rtAll они уже нарисованы правильно. Два лишних прохода по сотне
        // спрайтов каждый кадр телефон замечает, поэтому платим за них только
        // в те секунды, когда палец действительно рвёт облако.
        const cloud = this.postMaterial.uniforms.uCount.value > 0 ? this.clouds.cur : null;
        if (cloud) {
            r.setRenderTarget(this.rtSig);
            r.clear(true, true, false);
            const nextVisible = this.clouds.next && this.clouds.next.group.visible;
            const prevVisible = this.clouds.prev && this.clouds.prev.group.visible;
            if (nextVisible) this.clouds.next.group.visible = false;
            if (prevVisible) this.clouds.prev.group.visible = false;

            // Проход глубины: только пустышки, цвет не пишем.
            cloud.tiles.forEach(t => {
                t.mesh.visible = (t.kind === 'empty');
                t.mat.colorWrite = false;
            });
            r.render(this.scene, this.camera);

            // Проход цвета: только значимые, глубина уже занята соседями.
            cloud.tiles.forEach(t => {
                t.mesh.visible = (t.kind !== 'empty');
                t.mat.colorWrite = true;
                t.mat.depthWrite = false;
            });
            r.render(this.scene, this.camera);

            cloud.tiles.forEach(t => {
                t.mesh.visible = true;
                t.mat.depthWrite = true;
            });
            if (nextVisible) this.clouds.next.group.visible = true;
            if (prevVisible) this.clouds.prev.group.visible = true;
        }

        r.setRenderTarget(null);
        r.clear(true, true, false);
        r.render(this.bgScene, this.flatCamera);

        this.postMaterial.uniforms.tDiffuse.value = this.rtAll.texture;
        r.render(this.postScene, this.flatCamera);
        if (cloud) r.render(this.sigScene, this.flatCamera);
    },
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => EnvyMinigame.init());
} else {
    EnvyMinigame.init();
}
