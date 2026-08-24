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
    FIELD_X: 0.88,           // какую долю ширины экрана занимает облако
    FIELD_Y: 0.84,           // и высоты: по краям остаётся поле под рамку
    COLS_ACROSS: 5,          // сколько образов укладывается по короткой стороне поля
    JITTER: 0.07,            // разброс мест перед релаксацией, в долях шага
    RELAX_STEPS: 4,          // итераций Ллойда: ровнее ячейки — меньше наползание
    TILT: 0.22,              // наклон наклейки, рад: кренит, но не переворачивает
    HALO_CELLS: 1.5,         // радиус ореола под пальцем, в шагах сетки
    HALO_MARGIN: 1.25,       // запас ореола поверх габарита самой крупной наклейки
    CELL_FILL: 0.75,         // какую долю своей ячейки накрывает наклейка
    CELL_SPREAD_MIN: 0.92,   // насколько наклейка может быть мельче медианной
    CELL_SPREAD_MAX: 1.10,   // и насколько крупнее: шире — полотно разнокалиберное
    HALO_CORE: 0.55,         // до какой доли радиуса прозрачность полная
    HALO_FADE_MS: 220,       // за сколько ореол разгорается и гаснет
    HALO_FOLLOW_MS: 70,      // насколько ореол отстаёт от пальца (плавность)
    LAYER_STEP: 5.2,         // глубина между соседними слоями
    CLOUD_GAP: 55,           // пустота между задом облака и передом следующего
    FLY_MS: 1700,
    RESOLVE_DELAY_MS: 320,   // пауза после срабатывания образа, чтобы увидеть волну
    TREMBLE: 0.16,           // амплитуда дрожи значимого образа, в долях клетки
    WAVE_SPEED: 46,          // скорость фронта волны, мировых единиц в секунду
    WAVE_AMP: 0.3,           // амплитуда качания, в долях клетки
    WAVE_FALLOFF: 0.006,     // затухание качания по расстоянию от центра
    WAVE_DECAY_MS: 620,      // затухание качания по времени после прохода фронта
    WAVE_FREQ: 12,           // частота качания, рад/с
    WAVE_LIFE_MS: 2200,
    WIN_MS: 1300,            // за сколько победная вспышка накрывает экран
    FLASH_SIZE: 40,          // базовый диаметр вспышки в CSS, px (её растит scale)
    HINT_GREEN: '#3ddc73',
    HINT_RED: '#ff3b30',
};

// Шейдер разрыва. Ореол прозрачности — ОДИН, и он привязан к пальцу, а не к
// образам. Раньше дыры вырезались по силуэту каждой фигуры, до которой
// дотянулся палец, и при ведении по полотну они вспыхивали и гасли поштучно,
// как перегорающие лампочки. Теперь это фонарь: круглое пятно, которое плавно
// едет за пальцем и гасит всё, что под него попало.
//
// Приходят две картинки: полное облако (tScene) и отдельно значимые образы
// (tSig). Внутри пятна показываются только значимые — за это и держится вся
// механика поиска: гаснет всё, кроме того, что искали.
const EnvyTearShader = {
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tScene;
        uniform sampler2D tSig;
        uniform float uAspect;
        uniform float uTime;
        uniform vec2 uHalo;        // центр ореола в UV
        uniform float uHaloR;      // радиус в долях высоты экрана
        uniform float uHaloCore;   // доля радиуса с полной прозрачностью
        uniform float uHaloI;      // 0..1 — насколько ореол разгорелся

        varying vec2 vUv;

        void main() {
            vec4 sceneColor = texture2D(tScene, vUv);

            if (uHaloI <= 0.001) {
                gl_FragColor = sceneColor;
                return;
            }

            vec2 pos = vUv - uHalo;
            pos.x *= uAspect;

            // Край рваный и живой, а не циркульный: радиус слегка гуляет по
            // полярному углу и во времени.
            float angle = atan(pos.y, pos.x);
            float wobble = sin(angle * 4.0 - uTime * 2.2) * 0.06
                         + cos(angle * 3.0 + uTime * 1.6) * 0.045;
            float r = uHaloR * (1.0 + wobble);

            float mask = smoothstep(r * uHaloCore, r, length(pos));
            mask = mix(1.0, mask, uHaloI);

            // Внутри пятна остаются только значимые образы. Обе картинки
            // пришли из render target с обычным блендингом, то есть уже
            // premultiplied — гасить надо и цвет, и альфу, иначе по краю
            // ореола остаётся светлая кайма.
            vec4 sigColor = texture2D(tSig, vUv);
            gl_FragColor = sceneColor * mask + sigColor * (1.0 - mask);
        }
    `
};

const ENVY_SQRT3_2 = Math.sqrt(3) / 2;

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
    tileGeometry: null,
    imagePool: null,
    scratchVec: null,
    hintColors: null,

    // ---------- ИГРА ----------
    layout: null,
    clouds: { cur: null, next: null, prev: null },
    waves: [],
    halo: { x: 0.5, y: 0.5, intensity: 0 },
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
        this.flashEl = document.getElementById('envy-win-flash');
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
        if (this.flashEl) {
            this.flashEl.classList.remove('show');
            this.flashEl.style.transform = 'translate(-50%, -50%) scale(0)';
        }

        this.ensureThree();

        // Векторные образы грузятся картинками, поэтому пул готовится
        // асинхронно. Первый заход ждёт его доли секунды, дальше пул уже
        // собран и промис отдаёт готовое немедленно.
        this.poolReady.then(images => {
            if (!this.screenElement.classList.contains('active')) return;
            this.imagePool = images;
            this.resize();      // считает раскладку и строит все три облака

            this.lastTs = null;
            if (this.rafId) cancelAnimationFrame(this.rafId);
            this.rafId = requestAnimationFrame((ts) => this.loop(ts));
        });
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

        this.scratchVec = new THREE.Vector3();
        this.hintColors = {
            right: new THREE.Color(ENVY_SCENE.HINT_GREEN),
            wrong: new THREE.Color(ENVY_SCENE.HINT_RED)
        };

        this.tileGeometry = new THREE.PlaneGeometry(1, 1);
        this.poolReady = ENVY_IMAGE_POOL.build(THREE);

        this.buildBackground();
        this.buildPostChain();
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
            tScene: { value: null },
            tSig: { value: null },
            uAspect: { value: 1 },
            uTime: { value: 0 },
            uHalo: { value: new THREE.Vector2(0.5, 0.5) },
            uHaloR: { value: 0.12 },
            uHaloCore: { value: ENVY_SCENE.HALO_CORE },
            uHaloI: { value: 0 }
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
    },

    // Ореол догоняет палец, а не прыгает за ним: экспоненциальное сближение,
    // одинаковое при любой частоте кадров.
    updateHalo(dt) {
        const halo = this.halo;
        const rect = this.canvas.getBoundingClientRect();
        const lit = (this.state === 'play' && this.pointerDown);

        if (lit) {
            const tx = this.pointerX / rect.width;
            const ty = 1 - this.pointerY / rect.height;
            if (halo.intensity <= 0.001) { halo.x = tx; halo.y = ty; }   // зажёгся сразу под пальцем
            const k = 1 - Math.exp(-dt / ENVY_SCENE.HALO_FOLLOW_MS);
            halo.x += (tx - halo.x) * k;
            halo.y += (ty - halo.y) * k;
        }

        const step = dt / ENVY_SCENE.HALO_FADE_MS;
        halo.intensity = lit
            ? Math.min(1, halo.intensity + step)
            : Math.max(0, halo.intensity - step);

        // Радиус привязан к шагу сетки — фонарь накрывает примерно одну
        // наклейку с небольшим. Но наклейки крупнее шага, и самая большая в
        // такой фонарь не помещалась: её край оставался непогашенным и торчал
        // из пятна обрубком. Поэтому радиус ещё и не меньше габарита
        // крупнейшей наклейки в облаке, с запасом.
        const halfH = Math.tan((ENVY_SCENE.FOV / 2) * Math.PI / 180) * ENVY_SCENE.CAM_DIST;
        const cloud = this.clouds.cur;
        const biggest = cloud ? cloud.maxSize * 0.5 * ENVY_SCENE.HALO_MARGIN : 0;
        const u = this.postMaterial.uniforms;
        u.uHalo.value.set(halo.x, halo.y);
        u.uHaloR.value = Math.max(this.layout.cell * ENVY_SCENE.HALO_CELLS, biggest) / (2 * halfH);
        u.uHaloI.value = halo.intensity;
    },

    resize() {
        if (!this.imagePool) return;     // пул ещё грузится, строить нечего
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

        // Облако занимает не весь экран, а поле внутри него: по краям остаётся
        // рант, куда потом ляжет рамка. Раньше сетка строилась с запасом ЗА
        // край, и половина образов уезжала под обрез — фигура, наполовину
        // срезанная краем, не читается как образ.
        const fieldW = viewW * ENVY_SCENE.FIELD_X;
        const fieldH = viewH * ENVY_SCENE.FIELD_Y;

        // ---------- УПАКОВКА ----------
        // Шаг сетки задаётся от КОРОТКОЙ стороны поля: иначе при повороте
        // телефона наклейки выходят вдвое крупнее или мельче. Сами места
        // расставляет ENVY_PACKING — здесь только размер сетки.
        //
        // Габарит наклейки в долях шага: ячейка сотовой решётки — cell/√3, а
        // наклейка крупнее ячейки на выступы силуэта и кант.
        const span = ENVY_IMAGE_POOL.span / Math.sqrt(3);

        let cols, cell, rowStep, rows, total;
        for (let across = ENVY_SCENE.COLS_ACROSS; across >= 3; across--) {
            const target = Math.min(fieldW, fieldH) / across;
            cols = Math.max(3, Math.round(fieldW / target - 2 * span + 1));
            cell = fieldW / (cols - 1 + 2 * span);
            rowStep = cell * ENVY_SQRT3_2;                  // ряды сотовой решётки
            rows = Math.max(3, Math.floor((fieldH - cell * 2 * span) / rowStep) + 1);
            // В нечётных рядах на образ меньше — они сдвинуты на полклетки.
            total = Math.ceil(rows / 2) * cols + Math.floor(rows / 2) * (cols - 1);
            if (total <= ENVY_SCENE.MAX_TILES) break;
        }

        this.layout = {
            cols,
            rows,
            cell,
            rowStep,
            sprite: cell * 2 * span,   // габарит наклейки с окантовкой: поля и запас
            total,
            viewW,
            viewH,
            fieldW,
            fieldH,
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
        this.hideNeighbours();

        this.camera.position.z = ENVY_SCENE.CAM_DIST;
        this.activeTile = null;
        this.waves = [];
    },

    // Пока камера стоит, соседние облака не рисуются. Предыдущее и так за
    // спиной, а следующее в покое видно крошечным пятном через просветы между
    // образами — оно читается грязью, а не «облаком вдалеке». Показывается
    // ровно в тот момент, когда камера трогается к нему.
    hideNeighbours() {
        if (this.clouds.prev) this.clouds.prev.group.visible = false;
        if (this.clouds.next) this.clouds.next.group.visible = false;
    },

    buildCloud(originZ, wrongCount) {
        const L = this.layout;
        const group = new THREE.Group();
        group.position.z = originZ;
        this.scene.add(group);


        // Места и ячейки. Наклейке достаётся радиус её ячейки — ровно столько
        // она обязана накрыть собой, чтобы полотно сомкнулось.
        const spots = ENVY_PACKING.build(
            L.cols, L.rows, L.cell, L.rowStep, L.cell * ENVY_SCENE.JITTER,
            { x0: -L.fieldW / 2, y0: -L.fieldH / 2, x1: L.fieldW / 2, y1: L.fieldH / 2 },
            ENVY_SCENE.RELAX_STEPS
        );

        // Ячейки Вороного даже после релаксации расходятся по размеру почти
        // вдвое, и одна и та же наклейка попадалась то крохотной, то огромной.
        // Радиусы поджимаются к медиане: наклейка крупнее своей ячейки в
        // ENVY_BULGE раз, и этого запаса хватает, чтобы урезанная всё равно
        // ячейку накрыла — щелей в полотне не появляется.
        const radii = spots.map(s => s.radius).sort((a, b) => a - b);
        const median = radii[Math.floor(radii.length / 2)] || 1;
        const lo = median * ENVY_SCENE.CELL_SPREAD_MIN;
        const hi = median * ENVY_SCENE.CELL_SPREAD_MAX;

        // Слои раздаются НЕ случайно, а черепицей: чем ниже наклейка на
        // экране, тем ближе она к камере. При случайных слоях кому-то не
        // везло — образ оказывался под всеми соседями разом, и от него
        // выглядывало пять процентов. В черепице каждая наклейка закрыта
        // только теми, что лежат ниже неё, и только снизу: верх с рисунком
        // остаётся на виду.
        const order = spots.map((_, i) => i).sort((a, b) => spots[a].y - spots[b].y);
        const depthOf = new Array(spots.length);
        order.forEach((idx, k) => { depthOf[idx] = k * ENVY_SCENE.LAYER_STEP; });

        const tiles = [];
        const meshes = [];
        const pool = this.imagePool;

        spots.forEach((spot, index) => {
            const radius = Math.max(lo, Math.min(hi, spot.radius));
            const image = pool[Math.floor(Math.random() * pool.length)];

            // Круг наклейки сажается ровно на ячейку — этим полотно и
            // смыкается. Ячейки Вороного разного размера, поэтому размер
            // считается для каждой наклейки от своей.
            // CELL_FILL — прямой размен «перекрытие против щелей». При 1.0
            // наклейка накрывает свою ячейку целиком и щелей нет по
            // построению, но соседей она заслоняет наполовину. Ниже —
            // просторнее, ценой просветов в самых острых углах ячеек.
            const size = radius * ENVY_SCENE.CELL_FILL / image.core;

            // Тон уже вписан в текстуру: рисунок многоцветный, одним
            // множителем его не покрасить. material.color остаётся белым и
            // работает только на подсветку волной.
            const variant = image.variants[Math.floor(Math.random() * image.variants.length)];
            const material = new THREE.MeshBasicMaterial({
                map: variant,
                color: new THREE.Color(0xffffff),
                transparent: true,
                // Отсекает только сглаженную кромку текстуры: образы больше
                // не растворяются поштучно, их гасит ореол.
                alphaTest: 0.5,
                depthTest: true,
                depthWrite: true
            });

            const mesh = new THREE.Mesh(this.tileGeometry, material);
            // Наклейку слегка кренит, но не крутит: перевёрнутая вверх ногами
            // кошка перестаёт быть кошкой, а образ должен читаться сразу.
            mesh.rotation.z = (Math.random() * 2 - 1) * ENVY_SCENE.TILT;
            group.add(mesh);
            meshes.push(mesh);

            tiles.push({
                mesh,
                mat: material,
                baseColor: new THREE.Color(0xffffff),
                bx: spot.x,
                by: spot.y,
                size,
                mask: image.mask,
                image,
                depth: depthOf[index],
                rot: mesh.rotation.z,
                seed: Math.random() * 10,
                driftPhase: Math.random() * Math.PI * 2,
                kind: 'empty',
                heldMs: 0,
                hinted: false
            });
        });

        this.assignSignificant(tiles, wrongCount);

        // Габарит самой крупной наклейки: по нему меряется ореол, иначе
        // крупные образы в него не влезают.
        const cloud = {
            group, tiles, meshes, lastV: null,
            maxSize: tiles.reduce((m, t) => Math.max(m, t.size), 0)
        };
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
        const pool = tiles.slice();   // всё облако внутри поля, отбирать нечего
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
            const size = t.size * (t.swayScale || 1) * f;
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
                t.heldMs = 0;
                t.hinted = false;
            });
        }
        this.activeTile = null;
    },

    // Какие образы лежат под пальцем, от ближнего к дальнему.
    //
    // Считается от БАЗОВОЙ позиции образа, а не от его меша. Меш дрожит и
    // качается на волне, и пока попадание проверялось лучом по мешам, сильно
    // раскачанный образ уезжал из-под неподвижного пальца сам — удержание
    // срывалось и начиналось заново. Дрожит только картинка; место, за
    // которое образ держат, стоит неподвижно.
    pickTiles(px, py) {
        const cloud = this.clouds.cur;
        const rect = this.canvas.getBoundingClientRect();
        const V = Math.max(ENVY_SCENE.CAM_DIST, this.camera.position.z - cloud.group.position.z);
        const halfTan = Math.tan((ENVY_SCENE.FOV / 2) * Math.PI / 180);
        const found = [];

        for (const t of cloud.tiles) {
            const dist = V + t.depth;               // расстояние от камеры до слоя
            const halfH = halfTan * dist;
            const halfW = halfH * (rect.width / rect.height);
            const f = dist / V;                     // та же компенсация, что и у меша

            const sx = (t.bx * f / halfW * 0.5 + 0.5) * rect.width;
            const sy = (0.5 - t.by * f / halfH * 0.5) * rect.height;
            const sizePx = (t.size * f) / (2 * halfH) * rect.height;
            if (sizePx < 0.001) continue;

            // В систему координат наклейки: сдвиг, масштаб, обратный поворот.
            const ux = (px - sx) / sizePx;
            const uy = (py - sy) / sizePx;
            const cos = Math.cos(-t.rot), sin = Math.sin(-t.rot);
            // Экранный y растёт вниз, поворот меша — против часовой в мире.
            const lx = ux * cos + uy * sin + 0.5;
            const ly = -ux * sin + uy * cos + 0.5;
            if (lx < 0 || ly < 0 || lx >= 1 || ly >= 1) continue;

            // Силуэт у наклейки произвольный, формулой его не описать —
            // ловим по той же альфа-маске, из которой сделана её текстура.
            const m = t.mask;
            const mx = Math.min(m.size - 1, Math.floor(lx * m.size));
            const my = Math.min(m.size - 1, Math.floor(ly * m.size));
            if (m.bits[my * m.size + mx]) found.push(t);
        }

        found.sort((a, b) => a.depth - b.depth);    // ближний слой первым
        return found;
    },

    // Палец растворяет пустышки под собой и проваливается глубже, пока не
    // упрётся в материальный образ. Именно так значимая фигура и находится:
    // она единственная, сквозь которую не пройти.
    traceTouch() {
        const cloud = this.clouds.cur;
        if (!cloud) return;

        // Пустышки под пальцем больше не растворяются поштучно — их гасит
        // ореол. Значит и «прогрызать» слои незачем: держат тот значимый
        // образ, который лежит под пальцем, кто бы ни лежал поверх него.
        const active = this.pickTiles(this.pointerX, this.pointerY)
            .find(t => t.kind !== 'empty') || null;

        for (const tile of cloud.tiles) {
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
        this.winTile = this.resolveWin ? tile : null;
    },

    updateResolving(dt) {
        this.resolveMs += dt;
        if (this.resolveMs < ENVY_SCENE.RESOLVE_DELAY_MS) return;

        // Шкала заполнена — лететь больше некуда. Последний правильный образ
        // сам разгорается и заливает экран белым: пролёт к облаку, в котором
        // уже нечего искать, был бы обещанием следующего раунда.
        if (this.resolveWin) {
            this.state = 'winning';
            this.winMs = 0;
            this.startWinFlash(this.winTile);
            GameEvents.emit('minigame:result', { sin: 'envy', mode: 'cloud', outcome: 'win' });
        } else {
            this.startFlight(this.resolveRight ? -1 : 1);
        }
    },

    startWinFlash(tile) {
        const rect = this.canvas.getBoundingClientRect();
        this.flashScale = 0;
        this.flashMax = 1;

        if (!this.flashEl) return;
        if (tile) {
            const world = this.scratchVec;
            tile.mesh.getWorldPosition(world);
            world.project(this.camera);
            this.flashEl.style.left = `${(world.x + 1) / 2 * rect.width}px`;
            this.flashEl.style.top = `${(1 - world.y) / 2 * rect.height}px`;
        } else {
            this.flashEl.style.left = '50%';
            this.flashEl.style.top = '50%';
        }
        // Вспышка должна накрыть самый дальний угол от точки образа.
        this.flashMax = (Math.hypot(rect.width, rect.height) * 2) / ENVY_SCENE.FLASH_SIZE;
        this.flashEl.style.transform = 'translate(-50%, -50%) scale(0)';
        this.flashEl.classList.add('show');
    },

    // dir = -1 — вперёд, к следующему облаку; +1 — назад, к предыдущему.
    startFlight(dir) {
        const target = dir < 0 ? this.clouds.next : this.clouds.prev;
        if (!target) return;
        target.group.visible = true;

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
        this.hideNeighbours();

        this.waves = [];
        this.activeTile = null;
        this.state = 'play';
    },

    // Победа: камера стоит там, где стояла, а последний правильный образ
    // разрастается белым светом на весь экран.
    updateWinning(dt) {
        this.winMs += dt;
        const p = Math.min(1, this.winMs / ENVY_SCENE.WIN_MS);
        const e = Math.pow(p, 1.8);   // сначала разгорается, потом накрывает разом

        if (this.flashEl) {
            this.flashEl.style.transform = `translate(-50%, -50%) scale(${(this.flashMax * e).toFixed(3)})`;
        }

        if (p >= 1 && !this.hasWon) {
            this.hasWon = true;
            if (this.winOverlay) this.winOverlay.classList.add('show');
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

    // ================= ЦИКЛ И ОТРИСОВКА =================
    loop(ts) {
        if (!this.lastTs) this.lastTs = ts;
        const dt = Math.min(48, ts - this.lastTs);
        this.lastTs = ts;

        if (this.state === 'play') this.updatePlay(dt);
        else if (this.state === 'resolving') this.updateResolving(dt);
        else if (this.state === 'flying') this.updateFlying(dt);
        else if (this.state === 'winning') this.updateWinning(dt);

        this.updateHalo(dt);
        this.updateWaves(dt);
        this.updateDisturbance(ts / 1000);

        if (this.clouds.cur) this.cloudCompensate(this.clouds.cur, true);
        if (this.clouds.next) this.cloudCompensate(this.clouds.next, false);
        if (this.clouds.prev && this.clouds.prev.group.visible) this.cloudCompensate(this.clouds.prev, false);

        this.postMaterial.uniforms.uTime.value = ts * 0.001;

        this.render();
        this.rafId = requestAnimationFrame((t) => this.loop(t));
    },

    // Значимые образы рисуются вторым, отдельным кадром, чтобы шейдер мог
    // показать их внутри ореола — там, где всё остальное погашено. Снаружи
    // ореола этот кадр не участвует: значимый образ подчиняется общему порядку
    // глубины и ничем себя не выдаёт.
    render() {
        const r = this.renderer;
        const cloud = this.clouds.cur;

        r.setRenderTarget(this.rtAll);
        r.clear(true, true, false);
        r.render(this.scene, this.camera);

        r.setRenderTarget(this.rtSig);
        r.clear(true, true, false);
        if (cloud && this.postMaterial.uniforms.uHaloI.value > 0.001) {
            const nextVisible = this.clouds.next && this.clouds.next.group.visible;
            const prevVisible = this.clouds.prev && this.clouds.prev.group.visible;
            if (nextVisible) this.clouds.next.group.visible = false;
            if (prevVisible) this.clouds.prev.group.visible = false;

            // Значимых на облако единицы, поэтому проход почти бесплатный.
            // Глубина им тут не нужна: всё, что могло их перекрыть, ореол
            // уже погасил.
            cloud.tiles.forEach(t => {
                t.mesh.visible = (t.kind !== 'empty');
                t.mat.depthTest = false;
            });
            r.render(this.scene, this.camera);
            cloud.tiles.forEach(t => {
                t.mesh.visible = true;
                t.mat.depthTest = true;
            });

            if (nextVisible) this.clouds.next.group.visible = true;
            if (prevVisible) this.clouds.prev.group.visible = true;
        }

        r.setRenderTarget(null);
        r.clear(true, true, false);
        r.render(this.bgScene, this.flatCamera);

        this.postMaterial.uniforms.tScene.value = this.rtAll.texture;
        this.postMaterial.uniforms.tSig.value = this.rtSig.texture;
        r.render(this.postScene, this.flatCamera);
    },
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => EnvyMinigame.init());
} else {
    EnvyMinigame.init();
}
