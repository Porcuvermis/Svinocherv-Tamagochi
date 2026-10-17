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
    CELL_FILL: 1.0,          // какую долю своей ячейки накрывает наклейка
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
    threeLoading: null,   // промис загрузки библиотеки
    sceneReady: null,     // промис «библиотека приехала И сцена построена»
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

        // Экран показывается СРАЗУ, а сцена достраивается, когда приедут
        // библиотека и пул образов. Состояние до этого момента остаётся
        // 'idle': обработчик указателя проверяет его первой же строкой и
        // потому не может ткнуть в ещё не построенную сцену.
        this.state = 'idle';

        // Векторные образы грузятся картинками, поэтому пул готовится
        // асинхронно. Первый заход ждёт его доли секунды, дальше и пул, и
        // библиотека уже на месте, и промис отдаёт готовое немедленно.
        this.ensureThree().then(images => {
            if (!this.screenElement.classList.contains('active')) return;
            this.imagePool = images;
            this.state = 'play';
            this.resize();      // считает раскладку и строит все три облака

            this.lastTs = null;
            if (this.rafId) cancelAnimationFrame(this.rafId);
            this.rafId = requestAnimationFrame((ts) => this.loop(ts));
        }).catch(err => {
            // Без библиотеки играть нечем: честно закрываем экран, а не
            // оставляем игрока перед чёрным прямоугольником.
            console.error('Зависть: сцена не собралась', err);
            this.close();
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

        // Верхнего HUD со шкалами больше нет — возвращать нечего
        // (src/core/sins-menu.js).
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
    // Библиотека грузится ЛЕНИВО, при первом открытии зависти. Раньше она
    // висела обычным <script> в index.html и попадала в window.load, до
    // которого держится пелена загрузки: 145 КБ gzip задерживали появление
    // игры у всех, включая тех, кто в зависть не заходит.
    //
    // Промис хранится, а не создаётся заново: второе открытие не должно
    // ни ждать, ни грузить повторно.
    loadThree() {
        if (window.THREE) return Promise.resolve();
        if (this.threeLoading) return this.threeLoading;
        this.threeLoading = new Promise((resolve, reject) => {
            const el = document.createElement('script');
            // Версия в запросе — как у остальных ассетов: адрес меняется
            // вместе с версией, и кеш не отдаёт старую библиотеку.
            el.src = 'vendor/three.min.js?v=r128';
            el.onload = () => resolve();
            el.onerror = () => reject(new Error('three.js не загрузился'));
            document.head.appendChild(el);
        });
        return this.threeLoading;
    },

    // Возвращает ПРОМИС готовой сцены: до загрузки библиотеки строить нечего.
    // Раньше метод был синхронным, и всё, что идёт после него, полагалось на
    // немедленно существующий renderer.
    ensureThree() {
        if (this.sceneReady) return this.sceneReady;
        this.sceneReady = this.loadThree().then(() => {
            this.buildThree();
            return this.poolReady;
        });
        return this.sceneReady;
    },

    buildThree() {
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
        // Прямоугольник холста берётся ИЗ КЭША. Он меняется только при
        // повороте экрана, а getBoundingClientRect каждый кадр заставляет
        // браузер пересчитать раскладку страницы — одно такое чтение стоит
        // дороже сотни записей (docs/traps.md, п. 39).
        const rect = this.canvasRect || (this.canvasRect = this.canvas.getBoundingClientRect());
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

    // ---------- ПЛОТНОСТЬ ПИКСЕЛЕЙ: ЕДИНСТВЕННАЯ РУЧКА ЭТОЙ СЦЕНЫ ----------
    // Зависть — единственная трёхмерная мини-игра, и упирается она не в
    // процессор, а в ЗАЛИВКУ: за кадр рисуются два полноэкранных прохода
    // сцены (общий и значимые) плюс два полноэкранных прямоугольника
    // (фон и шейдер разрыва). При плотности 2 это пять мегапикселей на кадр.
    //
    // Замер на замедленной машине: плотность 2 — 6 кадров, 1.5 — 12,
    // 1.25 — 17, 1 — 22. Зависимость чисто квадратичная, то есть заливка и
    // есть потолок.
    //
    // Поэтому плотность ПОДБИРАЕТСЯ САМА. Прибитая цифра тут не годится: на
    // хорошем телефоне она отняла бы резкость даром, на плохом всё равно не
    // спасла бы. Игра смотрит на собственные кадры и опускает планку, пока
    // не станет ровно; станет с запасом — поднимает обратно.
    DPR_STEPS: [2, 1.5, 1.25, 1],

    maxDpr() {
        const cap = Math.min(window.devicePixelRatio || 1, 2);
        return Math.min(cap, this.DPR_STEPS[this.dprStep || 0]);
    },

    // Шаг качества вниз/вверх. Считается по СГЛАЖЕННОЙ длине кадра, а не по
    // одному кадру: одиночный провал бывает от чего угодно, а вот полсекунды
    // подряд — уже правда.
    tuneDpr(dt) {
        if (this.dprStep == null) this.dprStep = 0;
        this.frameMs = this.frameMs == null ? dt : this.frameMs * 0.9 + dt * 0.1;
        this.dprHold = (this.dprHold || 0) + dt;
        if (this.dprHold < 500) return;
        // Вниз — быстро (играть невозможно), вверх — с запасом и неохотно,
        // иначе плотность запрыгает туда-сюда на границе.
        // Пороги разведены нарочно: 26 мс — это уже рвано (тридцать восемь
        // кадров), 17.5 — ровно шестьдесят с небольшим запасом. Возьми их
        // ближе, и плотность запрыгает туда-сюда на границе; поставь порог
        // подъёма в «идеальные» 15 мс — не поднимется никогда, потому что
        // шестьдесят кадров это 16.7.
        if (this.frameMs > 26 && this.dprStep < this.DPR_STEPS.length - 1) {
            this.dprStep++;
        } else if (this.frameMs < 17.5 && this.dprStep > 0 && this.dprHold > 4000) {
            this.dprStep--;
        } else {
            return;
        }
        this.dprHold = 0;
        this.frameMs = 20;
        this.applyDpr();
    },

    applyDpr() {
        if (!this.renderer || !this.rtAll) return;
        const w = this.canvas.clientWidth || window.innerWidth;
        const h = this.canvas.clientHeight || window.innerHeight;
        const dpr = this.maxDpr();
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(w, h, false);
        this.rtAll.setSize(Math.round(w * dpr), Math.round(h * dpr));
        this.rtSig.setSize(Math.round(w * dpr), Math.round(h * dpr));
    },

    resize() {
        if (!this.imagePool) return;     // пул ещё грузится, строить нечего
        // Кэш прямоугольника холста живёт ровно до этого места: размер
        // поменялся — значит и он.
        this.canvasRect = null;
        const w = this.canvas.clientWidth || window.innerWidth;
        const h = this.canvas.clientHeight || window.innerHeight;
        const dpr = this.maxDpr();

        this.renderer.setPixelRatio(dpr);
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
};

// Запуск — в конце envy-play.js: он подключается последним из продолжений,
// и к этому моменту все методы уже на объекте.
