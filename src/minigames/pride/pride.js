// ================= ТЩЕСЛАВИЕ: ВЫХОД ПО КОВРОВОЙ ДОРОЖКЕ =================
// Червь выходит из машины на ковровую дорожку и идёт двадцать секунд, пока
// не дойдёт до финишной арки. По бокам — ограждения и толпа. Игрок ловит
// вспышки фотоаппаратов и поцелуи.
//
// Замысел целиком — docs/plan/17-pride.md. Здесь только правила и связь с
// картинкой; сама картинка и вся перспектива — в pride-art.js, числа
// баланса — в ECONOMY.minigames.pride (инвариант 3).
//
// ---------- ЧТО ЗАМЕНИЛО ШКАЛУ ----------
// Раньше был свой счётчик 0..100: попадание +8, промах −5, набрал сто —
// победа. Его больше нет. Прогресс — это сама дорожка: финишная арка выходит
// с горизонта и подъезжает ровно к концу выхода, и по ней видно, сколько
// осталось. Одной сущностью в интерфейсе меньше, и ни одной цифры не надо.
//
// Проигрыша тоже нет: дойти до конца дорожки нельзя не суметь. Шкала греха
// закрывается всегда (правило «гарантия лежит в шкале»), а собранное внимание
// решает только размер выплаты.
//
// ---------- ТРИ ВЕЩИ, КОТОРЫЕ СЧИТАЮТСЯ ----------
//   • ВСПЫШКА — зона за ограждением, в толпе. Денег не даёт, даёт ажиотаж.
//   • ПОЦЕЛУЙ — зона на самом черве. Даёт и ажиотаж, и деньги.
//   • АЖИОТАЖ — во сколько раз дороже поцелуй. Копится с попаданий,
//     проседает с промахов и НИКОГДА не обнуляется (почему — в плане,
//     раздел 5: с обнулением покупка машины не давала ничего).
// Отсюда главное: вспышки нельзя игнорировать. Они не платят, но держат
// множитель, а множитель — это цена поцелуя.
//
// ---------- ЧЕГО ЗДЕСЬ НЕ БУДЕТ ----------
// Ускорения тайминга зон в любом виде: один раз уже сделали, и игра стала
// непроходимой. Сложность растёт ТОЛЬКО частотой появления зон, и её задаёт
// покупка массовки. Зона попадания при этом всегда равна видимому пятну:
// расхождение между тем, что видно, и тем, что засчитывается, — обман, а не
// сложность (docs/plan/17-pride.md, разделы 1–2 и 12).

// Числа ВИДА, а не баланса. Всё, что меняет сложность и доход, живёт в
// конфиге экономики и приезжает сюда через Backend.prideRun().
const PRIDE_VIEW = {
    STRIPES: 11,          // поперечин на ковре одновременно
    STRIPE_STEP: 9,       // через сколько единиц глубины лежит следующая
    STRIPE_THICK: 1.6,    // толщина поперечины в единицах глубины
    CLUSTERS: 5,          // гроздей толпы на каждой стороне
    CROWD_ROWS: 4,        // силуэтов в грозди без покупки массовки
    SPAWN_TRIES: 10,      // бросков при поиске места для зоны
    ZONE_CORE: 8,         // до какого радиуса стягивается кольцо-таймер
    ZONE_GAP: 1.15,       // насколько зоны держатся друг от друга (в радиусах)
    FLASH_MAX_Z: 46,      // дальняя граница, где ещё вспыхивает толпа. Ближняя —
                          // не своя, а общая с толпой (PRIDE_ART.Z_CROWD_MIN):
                          // вспышка обязана приходить оттуда, где стоят люди
    AMBIENT_MS: 620,      // как часто щёлкает фоновая вспышка при нулевом ажиотаже
    KISS_FX_MS: 620,
    FLASH_FX_MS: 260,
    END_HOLD_MS: 2400     // сколько кадр стоит на финише, прежде чем вернуться к старту.
                          // Меньше двух секунд — начисленное число не успевают прочитать
};

const PrideMinigame = {
    screenElement: null,
    win: null,
    svgEl: null,
    sceneEl: null,
    zonesEl: null,
    fxEl: null,
    hudEl: null,
    shopEl: null,
    wormHost: null,
    wormHandle: null,

    // ---------- СОСТОЯНИЕ ВЫХОДА ----------
    // 'idle' — червь у машины, можно покупать и стартовать;
    // 'run'  — идёт выход; 'done' — дошёл, награда показана.
    phase: 'idle',
    params: null,        // числа этого выхода: интервал, потолок, радиус
    speed: 0,            // единиц глубины в секунду
    kisses: 0,
    hype: 0,
    hits: 0,
    misses: 0,
    awardedKisses: null, // сколько НАЧИСЛИЛИ (публика могла устать) — приходит
                         // с той стороны, мини-игра этого не решает

    stripes: [],
    clusters: [],
    car: null,
    arch: null,
    targets: [],
    tokenCounter: 0,
    spawnAcc: 0,
    ambientAcc: 0,

    wormBox: null,       // габарит силуэта в единицах сцены — по нему кладутся поцелуи
    rafId: null,
    lastTs: null,
    _bound: false,

    // ---------- СБОРКА ----------
    init() {
        this.screenElement = document.getElementById('pride-game');
        if (!this.screenElement) return;

        if (typeof MinigameWindow !== 'undefined') {
            this.win = MinigameWindow.attach(this.screenElement, {
                sin: 'pride',
                onLeave: () => this.close(),
                // Пока червь идёт по дорожке — уходить есть откуда: собранное
                // за выход пропадёт. У машины терять нечего.
                canLeave: () => this.phase !== 'run'
            });
        }

        // Для перевода координат и для ввода берётся ВЕРХНИЙ холст: он ловит
        // касания. Оба холста заданы одним viewBox и вписаны одинаково,
        // поэтому единицы сцены у них общие.
        this.svgEl = document.getElementById('pr-svg-top');
        this.sceneEl = document.getElementById('pr-scene');
        this.zonesEl = document.getElementById('pr-zones');
        this.fxEl = document.getElementById('pr-fx');
        this.hudEl = document.getElementById('pr-hud');
        this.shopEl = document.getElementById('pr-shop');
        this.wormHost = document.getElementById('pr-worm');
        if (!this.svgEl) return;

        this.sceneEl.innerHTML = PRIDE_ART.scene();

        if (!this._bound) {
            this._bound = true;
            this.svgEl.addEventListener('pointerdown', (e) => this.onDown(e));
            window.addEventListener('resize', () => {
                if (!this.screenElement.classList.contains('active')) return;
                this.layoutWorm();
            });
            // Что именно начислили за выход — говорит ядро, а не мини-игра
            // (инвариант 2). Показать ответ можно только дождавшись его.
            GameEvents.on('minigame:awarded', (awarded) => {
                if (!awarded || awarded.sin !== 'pride') return;
                this.awardedKisses = (awarded.currencies || {}).pride_kiss || 0;
                this.renderHud();
            });
        }
    },

    open() {
        if (!this.screenElement) this.init();
        this.screenElement.classList.add('active');
        if (typeof MinigameWindow !== 'undefined') MinigameWindow.pauseRoom();
        this.resetRun();
        this.mountWorm();
        // Два вложенных кадра: сегменты напольной цепи получают свой
        // transform только в ПЕРВОМ тике рендерера, и до него габарит
        // силуэта врёт (та же причина, что и в старой версии этой игры).
        requestAnimationFrame(() => requestAnimationFrame(() => this.layoutWorm()));
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.lastTs = null;
        this.rafId = requestAnimationFrame((t) => this.loop(t));
    },

    close() {
        if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
        this.clearTargets();
        // Фаза сбрасывается ЗДЕСЬ, а не только при следующем открытии: с
        // застрявшим 'run' игра считает, что выход всё ещё идёт, и мешает
        // выйти по крестику в следующий раз.
        this.phase = 'idle';
        if (this.wormHandle && this.wormHandle.setTreadmill) this.wormHandle.setTreadmill(0);
        this.screenElement.classList.remove('active');
        if (typeof MinigameWindow !== 'undefined') {
            MinigameWindow.resumeRoom();
            MinigameWindow.restoreHud();
        }
        if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI();
    },

    // Начало (или повтор) выхода из состояния «стоим у машины». Числа берутся
    // заново каждый раз: между двумя выходами игрок мог что-то купить.
    resetRun() {
        this.params = Backend.prideRun();
        this.phase = 'idle';
        this.kisses = 0;
        this.hype = 0;
        this.hits = 0;
        this.misses = 0;
        this.awardedKisses = null;
        this.spawnAcc = 0;
        this.ambientAcc = 0;
        // Скорость выводится из длины выхода, а не задаётся отдельно: дорожка
        // ОБЯЗАНА кончиться ровно тогда, когда кончится время, иначе финиш
        // приезжает то раньше, то позже и перестаёт быть шкалой.
        this.speed = (PRIDE_ART.Z_FAR - PRIDE_ART.Z_WORM) / (this.params.runMs / 1000);
        this.clearTargets();
        this.buildMovers();
        this.renderHud();
        this.renderShop();
        if (this.wormHandle && this.wormHandle.setTreadmill) this.wormHandle.setTreadmill(0);
    },

    // ---------- ПОДВИЖНОЕ: ПОПЕРЕЧИНЫ, ТОЛПА, МАШИНА, ФИНИШ ----------
    // Всё это стоит на одной плоскости и едет по одному правилу: глубина
    // уменьшается, остальное считает перспектива. Узлы создаются ОДИН РАЗ на
    // выход, дальше меняется только transform (или points у поперечины).
    buildMovers() {
        const A = PRIDE_ART;
        this.sceneEl.querySelector('#pr-stripes').innerHTML = '';
        this.sceneEl.querySelector('#pr-crowd').innerHTML = '';
        this.sceneEl.querySelector('#pr-props').innerHTML = '';
        this.stripes = [];
        this.clusters = [];

        const stripesLayer = this.sceneEl.querySelector('#pr-stripes');
        for (let i = 0; i < PRIDE_VIEW.STRIPES; i++) {
            const el = this.svgNode('polygon');
            el.setAttribute('fill', PALETTE.redCarpet.carpet[700]);
            el.setAttribute('opacity', '0.7');
            stripesLayer.appendChild(el);
            this.stripes.push({ el, z: i * PRIDE_VIEW.STRIPE_STEP });
        }

        // Толпа гуще от покупки массовки: купленное обязано быть видно.
        const rows = PRIDE_VIEW.CROWD_ROWS + this.params.levels.crowd;
        const crowdLayer = this.sceneEl.querySelector('#pr-crowd');
        const span = (A.Z_FAR - A.Z_CROWD_MIN) / PRIDE_VIEW.CLUSTERS;
        for (let side = -1; side <= 1; side += 2) {
            for (let i = 0; i < PRIDE_VIEW.CLUSTERS; i++) {
                const g = this.svgNode('g');
                g.innerHTML = PRIDE_ART.crowdCluster(rows, side * 31 + i * 7 + 3);
                crowdLayer.appendChild(g);
                // Стороны сдвинуты на полшага друг относительно друга: иначе
                // толпа идёт парами напротив и читается забором, а не людьми.
                this.clusters.push({
                    el: g, side,
                    z: A.Z_CROWD_MIN + i * span + (side > 0 ? span * 0.5 : 0)
                });
            }
        }

        const props = this.sceneEl.querySelector('#pr-props');
        const carG = this.svgNode('g');
        carG.innerHTML = PRIDE_ART.car(this.params.levels.car);
        props.appendChild(carG);
        this.car = { el: carG, z: A.CAR_Z };

        const archG = this.svgNode('g');
        archG.innerHTML = PRIDE_ART.arch();
        props.appendChild(archG);
        this.arch = { el: archG, z: A.Z_FAR };

        this.placeMovers();
    },

    // Расстановка по текущим глубинам. Одна запись в дерево на предмет:
    // толпа едет гроздьями, поэтому предметов десяток, а людей за ними
    // вчетверо больше.
    placeMovers() {
        const A = PRIDE_ART;
        this.stripes.forEach(s => {
            s.el.setAttribute('points', A.stripePoints(s.z, PRIDE_VIEW.STRIPE_THICK));
        });
        this.clusters.forEach(c => {
            const k = A.CROWD_H * A.s(c.z) / 1000;
            const x = A.CX + c.side * A.half(c.z) * A.LANE;
            const y = A.y(c.z);
            c.el.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${k.toFixed(4)})`);
        });
        if (this.car) {
            const k = A.CROWD_H * A.s(this.car.z) / 1000;
            // Машина стоит СЛЕВА от дорожки и уезжает за левый край: в кадре
            // нужен её открытый бок с дверью, а не вся длина. Целиком она в
            // кадр и не влезет — автомобиль шире дорожки.
            const x = A.CX - A.half(this.car.z) * A.LANE - 430 * k;
            this.car.el.setAttribute('transform',
                `translate(${x.toFixed(1)},${A.y(this.car.z).toFixed(1)}) scale(${k.toFixed(4)})`);
            this.car.el.style.display = this.car.z > 1.5 ? '' : 'none';
        }
        if (this.arch) {
            const k = A.CROWD_H * A.s(this.arch.z) / 1000;
            this.arch.el.setAttribute('transform',
                `translate(${A.CX},${A.y(this.arch.z).toFixed(1)}) scale(${k.toFixed(4)})`);
        }
    },

    // ---------- ПЕРСОНАЖ ----------
    mountWorm() {
        if (!window.WormModelAPI || !window.WormRenderer || !this.wormHost) return;
        const model = window.WormModelAPI.loadWormModel();
        if (!this.wormHandle) {
            // Холст персонажа размером В ЕДИНИЦАХ СЦЕНЫ, а весь перевод в
            // пиксели — одним transform в layoutWorm(). Тогда координаты
            // червя и координаты дорожки — одни и те же числа, и зону
            // «поцелуй на черве» можно ставить прямо по его габариту.
            this.wormHost.style.width = PRIDE_ART.W + 'px';
            this.wormHost.style.height = PRIDE_ART.H + 'px';
            this.wormHandle = window.WormRenderer.mount(this.wormHost, model, {
                context: 'pride',
                wander: false,     // по дорожке он не бродит: мир едет мимо него
                blink: true,
                idleWave: true,
                pose: 'standing',
                anchorX: 0.5,
                anchorY: 0.55
            });
        } else {
            this.wormHandle.update(model);
        }
    },

    // Ставит червя ногами на опорную строку кадра и запоминает его габарит в
    // единицах сцены. Габарит меряется, а не задаётся числом: персонаж
    // растёт, и захардкоженная коробка поехала бы вместе с взрослением.
    layoutWorm() {
        if (!this.wormHandle || !this.wormHost || !this.svgEl) return;
        const parent = this.wormHost.offsetParent || this.wormHost.parentElement;
        if (!parent) return;
        const m = this.svgEl.getScreenCTM();
        if (!m) return;

        // Единица сцены в пикселях РАСКЛАДКИ. Делить на масштаб родителя
        // обязательно: весь холст игры отмасштабирован stage.js, и без этого
        // деления червь получил бы масштаб дважды.
        const r = parent.getBoundingClientRect();
        const zoom = (r.width / (parent.clientWidth || r.width)) || 1;
        const p0 = this.toScreen(0, 0, m), p1 = this.toScreen(100, 0, m);
        const k = ((p1.x - p0.x) / 100) / zoom || 1;
        this.wormHost.style.transform =
            `translate(${((p0.x - r.left) / zoom).toFixed(1)}px, ${((p0.y - r.top) / zoom).toFixed(1)}px) scale(${k.toFixed(4)})`;

        const body = this.wormHandle.svgRoot.querySelector('.worm-root');
        if (!body) return;
        const box = body.getBoundingClientRect();
        if (box.width < 1) return;
        const a = this.fromScreen(box.left, box.top);
        const b = this.fromScreen(box.right, box.bottom);
        const dx = PRIDE_ART.CX - (a.x + b.x) / 2;
        const dy = PRIDE_ART.Y_FEET - b.y;
        const pos = this.wormHandle.getPosition();
        this.wormHandle.setPosition(pos.x + dx, pos.y + dy);
        this.wormBox = { x: a.x + dx, y: a.y + dy, w: b.x - a.x, h: b.y - a.y };

        // Тень: по ширине силуэта, а не по числу. Без неё червь не стоит на
        // ковре, а висит над ним — и это первое, что видно в кадре.
        const shadow = this.sceneEl.querySelector('#pr-shadow');
        if (shadow) {
            shadow.setAttribute('rx', (this.wormBox.w * 0.42).toFixed(1));
            shadow.setAttribute('ry', (this.wormBox.w * 0.11).toFixed(1));
        }
    },

    // ---------- ПЕРЕВОД КООРДИНАТ ----------
    // Через getScreenCTM, а не делением на ширину: холст вписан в окно с
    // обрезкой, и единицы сцены не равны пикселям (docs/traps.md).
    fromScreen(x, y) {
        const m = this.svgEl.getScreenCTM();
        if (!m) return { x: 0, y: 0 };
        const pt = this.svgEl.createSVGPoint();
        pt.x = x; pt.y = y;
        const p = pt.matrixTransform(m.inverse());
        return { x: p.x, y: p.y };
    },

    toScreen(x, y, m) {
        const pt = this.svgEl.createSVGPoint();
        pt.x = x; pt.y = y;
        return pt.matrixTransform(m || this.svgEl.getScreenCTM());
    },

    svgNode(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    },

    // ---------- КАДР ----------
    loop(now) {
        if (this.lastTs == null) this.lastTs = now;
        const dt = Math.min(0.25, Math.max(0, (now - this.lastTs) / 1000));
        this.lastTs = now;

        if (this.phase === 'run') {
            const dz = this.speed * dt;
            // Толпа едет МЕДЛЕННЕЕ ковра — она дальше от оси движения, и
            // параллакс отделяет её от дорожки. Без него сцена читается одной
            // плоской картинкой, которую тянут вниз.
            this.stripes.forEach(s => {
                s.z -= dz;
                if (s.z < -PRIDE_VIEW.STRIPE_THICK) s.z += PRIDE_VIEW.STRIPES * PRIDE_VIEW.STRIPE_STEP;
            });
            this.clusters.forEach(c => {
                c.z -= dz * 0.78;
                if (c.z < PRIDE_ART.Z_CROWD_MIN) c.z += PRIDE_ART.Z_FAR - PRIDE_ART.Z_CROWD_MIN;
            });
            if (this.car) this.car.z = Math.max(0, this.car.z - dz);
            if (this.arch) this.arch.z -= dz;
            this.placeMovers();

            this.spawnAcc += dt * 1000;
            if (this.spawnAcc >= this.params.spawnMs) {
                // Не больше одной зоны за кадр, даже если накопилось на
                // несколько: пачка, вылетевшая разом, читается багом.
                this.spawnAcc = Math.min(this.spawnAcc - this.params.spawnMs, this.params.spawnMs);
                this.spawnTarget();
            }
            this.tickTargets(now);
            this.tickAmbient(dt);

            if (this.arch.z <= PRIDE_ART.Z_WORM) this.finishRun();
        }

        this.rafId = requestAnimationFrame((t) => this.loop(t));
    },

    // ---------- СТАРТ И ФИНИШ ----------
    startRun() {
        if (this.phase !== 'idle') return;
        this.phase = 'run';
        this.spawnAcc = this.params.spawnMs * 0.5;
        if (this.wormHandle && this.wormHandle.setTreadmill) this.wormHandle.setTreadmill(1);
        this.renderShop();
        this.placeMovers();
        this.renderHud();
    },

    finishRun() {
        if (this.phase !== 'run') return;
        this.phase = 'done';
        this.clearTargets();
        if (this.wormHandle && this.wormHandle.setTreadmill) this.wormHandle.setTreadmill(0);
        this.renderHud();

        // Мини-игра не начисляет сама: сообщает, сколько поцелуев собрано с
        // учётом ажиотажа, а сколько за это дать (и не устала ли публика) —
        // решает конфиг наград через Backend (инвариант 2).
        GameEvents.emit('minigame:result', {
            sin: 'pride', mode: 'parade', outcome: 'win',
            meta: { kisses: this.kisses, hits: this.hits, misses: this.misses }
        });

        setTimeout(() => {
            if (this.phase !== 'done') return;
            if (!this.screenElement.classList.contains('active')) return;
            this.resetRun();
        }, PRIDE_VIEW.END_HOLD_MS);
    },

    // ---------- ЗОНЫ ВНИМАНИЯ ----------
    // Тип зоны решается ПРИ ПОЯВЛЕНИИ, а не при тапе: поцелуй вспыхивает на
    // черве, вспышка — за ограждением, в толпе. Раньше это решалось по точке
    // тапа через elementFromPoint, и различие вырождалось: зона большая и
    // почти всегда цепляла силуэт краем.
    spawnTarget() {
        if (this.phase !== 'run') return;
        if (this.targets.length >= this.params.maxTargets) return;
        const kiss = Math.random() < this.params.kissShare && !!this.wormBox;
        const spot = kiss ? this.pickKissSpot() : this.pickFlashSpot();
        if (!spot) return;

        const r = this.params.radius;
        const g = this.svgNode('g');
        g.setAttribute('class', 'pr-zone' + (kiss ? ' pr-zone-k' : ''));
        g.setAttribute('transform', `translate(${spot.x.toFixed(1)},${spot.y.toFixed(1)})`);
        // Пятно света = ЗОНА ПОПАДАНИЯ, один в один и на всю жизнь зоны.
        // Кольцо внутри — ТОЛЬКО таймер: оно стягивается, зона не меняется.
        g.innerHTML =
            `<circle r="${r}" fill="url(#${kiss ? 'pr-zone-kiss' : 'pr-zone-flash'})"/>` +
            `<circle class="pr-ring" r="${r}" fill="none" stroke="${kiss ? PALETTE.redCarpet.kiss[300] : PALETTE.redCarpet.flash[300]}" stroke-width="3"/>`;
        this.zonesEl.appendChild(g);

        this.tokenCounter++;
        this.targets.push({
            x: spot.x, y: spot.y, kiss, el: g,
            ring: g.querySelector('.pr-ring'),
            token: this.tokenCounter,
            bornAt: performance.now(),
            diesAt: performance.now() + this.params.lifeMs
        });
    },

    // Поцелуй — на черве. Точка берётся из измеренного габарита силуэта, с
    // тягой к середине тела: по краям коробки силуэта нет, там воздух.
    pickKissSpot() {
        const b = this.wormBox;
        for (let i = 0; i < PRIDE_VIEW.SPAWN_TRIES; i++) {
            const x = b.x + b.w * (0.5 + (Math.random() - 0.5) * 0.7);
            const y = b.y + b.h * (0.15 + Math.random() * 0.6);
            const spot = this.clampSpot(x, y);
            if (this.farEnough(spot)) return spot;
        }
        return this.clampSpot(b.x + b.w / 2, b.y + b.h * 0.4);
    },

    // Вспышка — за ограждением. Глубина случайна, поэтому вспышки идут и
    // вблизи, и у горизонта: толпа стоит вдоль всей дорожки.
    pickFlashSpot() {
        const A = PRIDE_ART;
        for (let i = 0; i < PRIDE_VIEW.SPAWN_TRIES; i++) {
            const z = A.Z_CROWD_MIN + Math.random() * (PRIDE_VIEW.FLASH_MAX_Z - A.Z_CROWD_MIN);
            const side = Math.random() < 0.5 ? -1 : 1;
            const x = A.CX + side * A.half(z) * A.LANE;
            const y = A.y(z) - A.CROWD_H * A.s(z) * (0.5 + Math.random() * 0.35);
            const spot = this.clampSpot(x, y);
            if (this.farEnough(spot)) return spot;
        }
        return null;
    },

    // Зона целиком в кадре: половина зоны за краем экрана — это половина
    // зоны, по которой нельзя попасть.
    clampSpot(x, y) {
        const r = this.params.radius;
        return {
            x: Math.max(r, Math.min(PRIDE_ART.W - r, x)),
            y: Math.max(PRIDE_ART.HORIZON - r * 0.2, Math.min(PRIDE_ART.H - r, y))
        };
    },

    farEnough(spot) {
        const gap = this.params.radius * PRIDE_VIEW.ZONE_GAP;
        return !this.targets.some(t => Math.hypot(t.x - spot.x, t.y - spot.y) < gap);
    },

    tickTargets(now) {
        const r = this.params.radius;
        for (let i = this.targets.length - 1; i >= 0; i--) {
            const t = this.targets[i];
            const left = (t.diesAt - now) / this.params.lifeMs;
            if (left <= 0) {
                this.removeTarget(t);
                this.registerMiss();
                continue;
            }
            // Кольцо-таймер ведётся кадром, а не css-переходом: переход
            // пришлось бы каждый раз перезапускать через принудительный
            // рефлоу, а тут и так есть кадровый цикл.
            t.ring.setAttribute('r', (PRIDE_VIEW.ZONE_CORE + (r - PRIDE_VIEW.ZONE_CORE) * left).toFixed(1));
        }
    },

    removeTarget(target) {
        if (target.el) target.el.remove();
        const i = this.targets.indexOf(target);
        if (i >= 0) this.targets.splice(i, 1);
    },

    clearTargets() {
        while (this.targets.length) this.removeTarget(this.targets[0]);
        if (this.zonesEl) this.zonesEl.innerHTML = '';
    },

    // ---------- ВВОД ----------
    onDown(e) {
        e.preventDefault();
        const p = this.fromScreen(e.clientX, e.clientY);

        if (this.phase === 'idle') {
            const tag = e.target.closest ? e.target.closest('.pr-tag') : null;
            if (tag) { this.buy(tag.dataset.key); return; }
            this.startRun();
            return;
        }
        if (this.phase !== 'run') return;

        // Тап засчитывается той зоне, которой осталось жить меньше всех: если
        // две наложились краями, справедливее закрыть ту, что вот-вот
        // погаснет, — вторую игрок ещё успеет добрать.
        let pick = null;
        for (const t of this.targets) {
            if (Math.hypot(p.x - t.x, p.y - t.y) > this.params.radius) continue;
            if (!pick || t.diesAt < pick.diesAt) pick = t;
        }
        if (pick) this.resolveTarget(pick, p);
        else this.registerMiss();   // барабанить пальцем по всему полю невыгодно
    },

    resolveTarget(target, p) {
        this.removeTarget(target);
        this.hits++;
        this.bumpHype(this.params.hype.hit);
        if (target.kiss) {
            // Платят только поцелуи, и платят они ТЕКУЩИМ множителем: вспышки
            // и есть то, чем этот множитель набивается.
            const mult = this.multiplier();
            this.kisses += mult;
            this.kissFx(target.x, target.y, mult);
        } else {
            this.flashFx(target.x, target.y);
        }
        this.renderHud();
    },

    registerMiss() {
        this.misses++;
        this.bumpHype(this.params.hype.miss);
        this.renderHud();
    },

    // Ажиотаж ПРОСЕДАЕТ, но не обнуляется. Обнуление проверялось симулятором
    // и провалилось: плохая серия становилась безнадёжной, а покупка машины —
    // бесполезной (docs/plan/17-pride.md, раздел 5).
    bumpHype(delta) {
        this.hype = Math.max(0, this.hype + delta);
    },

    multiplier() {
        return Math.min(this.params.multCap,
                        1 + Math.floor(this.hype / this.params.hype.perStep));
    },

    // ---------- ФОНОВЫЕ ВСПЫШКИ ----------
    // Толпа щёлкает сама по себе, и тем чаще, чем выше ажиотаж. Это не зоны:
    // по ним не тапают, они ничего не дают. Это показ ажиотажа без единой
    // цифры — накал света (план, раздел 5).
    tickAmbient(dt) {
        this.ambientAcc += dt * 1000 * (1 + this.hype * 0.35);
        if (this.ambientAcc < PRIDE_VIEW.AMBIENT_MS) return;
        this.ambientAcc = 0;
        const spot = this.pickFlashSpot();
        if (!spot) return;
        const c = this.svgNode('circle');
        c.setAttribute('class', 'pr-ambient');
        c.setAttribute('cx', spot.x.toFixed(1));
        c.setAttribute('cy', spot.y.toFixed(1));
        c.setAttribute('r', (6 + Math.random() * 5).toFixed(1));
        c.setAttribute('fill', PALETTE.redCarpet.flash[300]);
        this.fxEl.appendChild(c);
        setTimeout(() => c.remove(), 420);
    },

    // Групп ДВЕ, и это не лишний узел: положение эффекта записано атрибутом
    // transform, а css-анимация, правящая transform, стёрла бы его целиком —
    // губы вылетали бы из левого верхнего угла кадра. Внешняя группа держит
    // место, внутренняя анимируется.
    kissFx(x, y, mult) {
        const outer = this.svgNode('g');
        outer.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
        // Цифра рядом с губами — это и есть весь рассказ о множителе: сколько
        // именно дал этот поцелуй. Цифра не слово (инвариант 9).
        outer.innerHTML =
            `<g class="pr-fx-kiss">` +
            `<text x="0" y="8" text-anchor="middle" font-size="34">💋</text>` +
            `<text x="26" y="-14" text-anchor="middle" font-size="22"` +
            ` fill="${PALETTE.redCarpet.kiss[300]}" font-weight="700">${mult}</text></g>`;
        this.fxEl.appendChild(outer);
        setTimeout(() => outer.remove(), PRIDE_VIEW.KISS_FX_MS);
    },

    flashFx(x, y) {
        const c = this.svgNode('circle');
        c.setAttribute('class', 'pr-fx-flash');
        c.setAttribute('cx', x.toFixed(1));
        c.setAttribute('cy', y.toFixed(1));
        c.setAttribute('r', '14');
        c.setAttribute('fill', PALETTE.redCarpet.flash[300]);
        this.fxEl.appendChild(c);
        setTimeout(() => c.remove(), PRIDE_VIEW.FLASH_FX_MS);
    },

    // ---------- СЧЁТ ----------
    // Две величины и ни одного слова: сколько поцелуев собрано и во сколько
    // раз дороже следующий. Множитель разгорается вместе с ажиотажем — это
    // тот же «накал света», только цифрой.
    renderHud() {
        if (!this.hudEl) return;
        const C = PALETTE.redCarpet;
        const wallet = GameState.currency('pride_kiss');
        if (this.phase === 'idle') {
            this.hudEl.innerHTML =
                `<text x="16" y="56" font-size="26">💋</text>` +
                `<text x="46" y="56" font-size="26" fill="${C.kiss[300]}" font-weight="700">${wallet}</text>`;
            return;
        }
        const mult = this.multiplier();
        const heat = Math.min(1, this.hype / (this.params.hype.perStep * this.params.multCap));
        const shown = this.phase === 'done' && this.awardedKisses != null
            ? this.awardedKisses : this.kisses;
        this.hudEl.innerHTML =
            `<text x="16" y="56" font-size="26">💋</text>` +
            `<text x="46" y="56" font-size="26" fill="${C.kiss[300]}" font-weight="700">${shown}</text>` +
            `<g transform="translate(${PRIDE_ART.W - 26},48)" opacity="${(0.45 + heat * 0.55).toFixed(2)}">` +
            `<text x="0" y="8" text-anchor="end" font-size="${(20 + heat * 14).toFixed(0)}"
                   fill="${C.flash[500]}" font-weight="700">×${mult}</text></g>`;
    },

    // ---------- ТРИ ПОКУПКИ ----------
    // Магазина как экрана нет: покупается сам предмет в кадре. Ценник висит
    // на машине, на толпе и на ковре — на том, что покупка меняет. Хватает
    // поцелуев — ценник горит, не хватает — тусклый; всё куплено — вместо
    // ценника полная лесенка точек.
    renderShop() {
        if (!this.shopEl) return;
        if (this.phase !== 'idle') { this.shopEl.innerHTML = ''; return; }
        const conf = ECONOMY.minigames.pride.upgrades;
        const wallet = GameState.currency('pride_kiss');
        const A = PRIDE_ART;
        const at = {
            car:    { x: A.CX - A.half(A.Z_WORM) * 1.05, y: A.y(A.Z_WORM) - 210 },
            crowd:  { x: A.CX + A.half(A.Z_WORM) * 1.02, y: A.y(A.Z_WORM) - 250 },
            carpet: { x: A.CX, y: 764 }
        };
        // Лужа света с галочкой — единственная «кнопка» игры. Живёт в ВЕРХНЕМ
        // холсте вместе с ценниками, а не в сцене: её дыхание — бесконечная
        // css-анимация, а такая анимация внутри общего холста заставляет
        // перекрашивать всю сцену каждый кадр (docs/traps.md, п. 36).
        const mz = A.Z_WORM * 0.55;
        let out = `<g transform="translate(${A.CX},${A.y(mz).toFixed(1)}) scale(${(A.s(mz) / A.s(A.Z_WORM)).toFixed(3)})">` +
                  PRIDE_ART.startMark() + '</g>';
        conf.order.forEach(key => {
            const branch = conf[key];
            const level = GameState.upgradeLevel('pride_' + key);
            const next = branch.levels[level];
            const pos = at[key];
            const price = next ? next.price.pride_kiss : 0;
            const rich = next && wallet >= price;
            out += this.tag(key, pos, level, branch.levels.length, price, rich, branch.emoji);
        });
        this.shopEl.innerHTML = out;
    },

    tag(key, pos, level, max, price, rich, emoji) {
        const C = PALETTE.redCarpet;
        const done = level >= max;
        const w = done ? 62 : 84;
        const pips = Array.from({ length: max }, (_, i) =>
            `<circle cx="${-w / 2 + 14 + i * 14}" cy="20" r="4"
                     fill="${i < level ? C.kiss[300] : C.night[500]}"/>`).join('');
        const body = done
            ? `<text x="0" y="4" text-anchor="middle" font-size="20">${emoji}</text>`
            : `<text x="${-w / 2 + 16}" y="4" font-size="18">${emoji}</text>` +
              `<text x="${-w / 2 + 40}" y="4" font-size="15">💋</text>` +
              `<text x="${w / 2 - 8}" y="4" text-anchor="end" font-size="16"
                     fill="${rich ? C.kiss[300] : C.night[500]}" font-weight="700">${price}</text>`;
        return `<g class="pr-tag${rich ? ' rich' : ''}" data-key="${key}"
                   transform="translate(${pos.x.toFixed(0)},${pos.y.toFixed(0)})">
                    <rect x="${-w / 2}" y="-18" width="${w}" height="48" rx="12"
                          fill="${C.night[900]}" fill-opacity="0.86"
                          stroke="${rich ? C.kiss[500] : C.rail[700]}" stroke-width="2"/>
                    ${body}${pips}
                </g>`;
    },

    buy(key) {
        const answer = Backend.buyUpgrade(key, 'pride');
        // Отказ показывается тем же ценником: он мигает и остаётся тусклым.
        // Текста «не хватает» нет и быть не может (инвариант 9).
        const tag = this.shopEl.querySelector(`.pr-tag[data-key="${key}"]`);
        if (!answer.ok) {
            if (tag) { tag.classList.remove('pr-deny'); void tag.getBBox(); tag.classList.add('pr-deny'); }
            return;
        }
        // Купленное меняет сам выход: числа перечитываются, толпа и машина
        // пересобираются — иначе купленную массовку станет видно только со
        // следующего открытия игры.
        this.resetRun();
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PrideMinigame.init());
} else {
    PrideMinigame.init();
}
