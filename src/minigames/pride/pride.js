// ================= ТЩЕСЛАВИЕ: ВЫХОД ПО КОВРОВОЙ ДОРОЖКЕ =================
// Червь выходит из машины на ковровую дорожку и идёт двадцать секунд НА
// ЗРИТЕЛЯ — как звезда идёт на камеры. По бокам — ограждения и толпа, они
// проплывают мимо и уходят за спину. Игрок ловит вспышки и поцелуи.
//
// Замысел целиком — docs/plan/17-pride.md. Здесь только правила и связь с
// картинкой; сама картинка и вся перспектива — в pride-art.js, числа
// баланса — в ECONOMY.minigames.pride (инвариант 3).
//
// ---------- ЧТО ЗАМЕНИЛО ШКАЛУ ----------
// Раньше был свой счётчик 0..100: попадание +8, промах −5, набрал сто —
// победа. Его больше нет. Прогресс — это сама дорожка, и читается он СЗАДИ:
// арка входа с машиной остаются позади и уезжают к горизонту ровно за время
// выхода. Червь идёт на камеру, значит впереди показывать нечего — там
// зритель; зато пройденное видно целиком. Одной сущностью в интерфейсе
// меньше, и ни одной цифры не надо.
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
    WORM_SCALE: 1.16,     // во сколько раз червь крупнее своего натурального
                          // размера. Он тут главный в кадре, а с хвостом,
                          // ушедшим за спину, фигура стала заметно компактнее
                          // и в полный кадр уже не читалась
    SPAWN_TRIES: 14,      // бросков при поиске места для зоны. Больше, чем
                          // было: поток гуще, и место искать труднее
    ZONE_CORE: 8,         // до какого радиуса стягивается кольцо-таймер
    ZONE_GAP: 1.0,        // насколько зоны держатся друг от друга (в радиусах).
                          // Ровно радиус: центры не ближе, чем на радиус, —
                          // зоны касаются, но не наезжают. Больше — и на
                          // верхней ступени массовки места просто не хватает,
                          // спавн срывается, и купленная плотность не даётся
    FLASH_MAX_Z: 46,      // дальняя граница, где ещё вспыхивает толпа. Ближняя —
                          // не своя, а общая с толпой (PRIDE_ART.Z_CROWD_MIN):
                          // вспышка обязана приходить оттуда, где стоят люди
    AMBIENT_MS: 620,      // как часто щёлкает фоновая вспышка при нулевом ажиотаже
    KISS_FX_MS: 620,
    FLASH_FX_MS: 260,
    CHANGE_MS: 750,       // сколько едут декорации при смене
    COUNT_STEP_MS: 500,   // одна цифра отсчёта: три цифры = полторы секунды
    END_HOLD_MS: 2400     // сколько кадр стоит на финише, прежде чем вернуться к старту.
                          // Меньше двух секунд — начисленное число не успевают прочитать
};

// ---------- ЛИЦО ЗВЕЗДЫ ----------
// Покерфейс и надменность — это не улыбка и не злость, а ОТСУТСТВИЕ реакции
// на происходящее. Собирается из четырёх вещей, и каждая делает свою:
//   • веки приспущены — «мне всё это слегка утомительно»;
//   • брови опущены к переносице, но чуть-чуть: нахмуренность читается
//     злостью, а нужно безразличие;
//   • рот ровной чертой, без изгиба в любую сторону;
//   • голова откинута назад — смотрит сверху вниз даже на того, кто выше.
// Взгляд при этом строго прямо: бегающие глаза выдают интерес, а звезда
// заинтересованной быть не должна.
const PRIDE_FACE = {
    eyelidLevel: 0.34,
    browRaise: -0.22,
    mouthCurve: 0,
    mouthOpenness: 0,
    headTilt: -5,
    gazeX: 0,
    gazeY: 0.06,
    eyeSmile: 0
};

const PrideMinigame = {
    screenElement: null,
    win: null,
    svgEl: null,
    sceneEl: null,
    roomEl: null,
    zonesEl: null,
    fxEl: null,
    hudEl: null,
    uiEl: null,
    storeEl: null,
    countEl: null,
    wormHost: null,
    wormHandle: null,

    // ---------- СОСТОЯНИЕ ВЫХОДА ----------
    // 'wardrobe' — костюмерная: червь у зеркала, слоты наряда, магазин;
    // 'change'   — смена декораций: костюмерная разъезжается, дорожка приезжает;
    // 'count'    — отсчёт 3-2-1 перед выходом;
    // 'run'      — идёт выход;
    // 'done'     — дошёл, награда показана, дальше обратно в костюмерную.
    phase: 'wardrobe',
    storeTab: 'wear',    // какая вкладка витрины открыта: наряд или прокачка
    storeOpen: false,
    countLeft: 0,
    params: null,        // числа этого выхода: интервал, потолок, радиус
    speed: 0,            // единиц глубины в секунду
    kisses: 0,
    // Стрик — сколько БЕЛЫХ зон закрыто подряд. Он же множитель, он же
    // разрешение червю быть поцелованным: при нуле поцелуйных зон нет вовсе.
    streak: 0,
    hits: 0,
    misses: 0,
    awardedKisses: null, // сколько НАЧИСЛИЛИ (публика могла устать) — приходит
                         // с той стороны, мини-игра этого не решает

    stripes: [],
    clusters: [],
    car: null,       // она же шкала выхода: см. шапку
    targets: [],
    bag: [],             // мешок типов зон, см. nextIsKiss()
    tokenCounter: 0,
    spawnAcc: 0,
    ambientAcc: 0,

    wormBox: null,       // габарит силуэта в единицах сцены — по нему кладутся поцелуи
    // ---------- ЧТО ИЗ ХОЛСТА РЕАЛЬНО ВИДНО ----------
    // Холст вписан в окно с ОБРЕЗКОЙ (slice): на узком экране срезаются верх
    // и низ, на широком — бока, и сколько именно, зависит от телефона. Всё,
    // что обязано быть видно целиком — счёт, ценники, зоны, — считается от
    // этого прямоугольника, а не от границ холста. Пока считалось от границ,
    // счёт на iPhone срезало верхним краем.
    safe: { x0: 0, y0: 0, x1: 390, y1: 844 },
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
        this.roomEl = document.getElementById('pr-room');
        this.zonesEl = document.getElementById('pr-zones');
        this.fxEl = document.getElementById('pr-fx');
        this.hudEl = document.getElementById('pr-hud');
        this.uiEl = document.getElementById('pr-ui');
        this.storeEl = document.getElementById('pr-store');
        this.countEl = document.getElementById('pr-count');
        this.wormHost = document.getElementById('pr-worm');
        if (!this.svgEl) return;

        this.sceneEl.innerHTML = PRIDE_ART.scene();
        this.roomEl.innerHTML = PRIDE_ART.room();

        // Своя debug-панель: прокачка тщеславия меряется месяцами, и проверить
        // игру с широкой зоной или множителем ×7 честным путём нельзя.
        if (typeof PrideDebug !== 'undefined') PrideDebug.init(this.screenElement);

        if (!this._bound) {
            this._bound = true;
            this.svgEl.addEventListener('pointerdown', (e) => this.onDown(e));
            window.addEventListener('resize', () => {
                if (!this.screenElement.classList.contains('active')) return;
                // Изменился размер — изменилась и видимая область, а по ней
                // расставлен весь интерфейс.
                this.layoutWorm();
                this.renderAll();
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
        this.enterWardrobe();
        if (typeof PrideDebug !== 'undefined') PrideDebug.render();
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

    // ---------- КОСТЮМЕРНАЯ ----------
    // Точка входа в грех и точка возврата после выхода. Здесь одеваются,
    // покупают и отсюда стартуют — как в лобби гнева, только вместо брони
    // наряд, а вместо боя выход на публику.
    enterWardrobe() {
        this.resetRun();
        this.phase = 'wardrobe';
        this.storeOpen = false;
        this.setDecor('room');
        // Червя пересобираем: наряд мог смениться, а он живёт в модели.
        this.mountWorm();
        // ---------- СНАЧАЛА РАСКЛАДКА, ПОТОМ ИНТЕРФЕЙС ----------
        // Видимый кусок холста (safe) считается в layoutWorm, а по нему
        // ставятся счёт, слоты, кнопки и ценники. Рисовать их ДО него значит
        // рисовать по границам холста, а не по границам экрана: на телефоне,
        // где холст обрезан сильнее, чем в тестовом окне, счёт уезжал под
        // шапку окна, а кнопка магазина — за нижний край.
        //
        // Два вложенных кадра — не суеверие: сегменты напольной цепи
        // получают свой transform только в первом тике рендерера, и до него
        // габарит силуэта врёт.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            this.layoutWorm();
            this.renderAll();
        }));
        this.renderAll();
    },

    renderAll() {
        this.renderUI();
        this.renderStore();
        this.renderHud();
    },

    // Числа выхода берутся заново каждый раз: между двумя выходами игрок мог
    // что-то купить.
    resetRun() {
        this.params = Backend.prideRun();
        this.kisses = 0;
        this.streak = 0;
        this.hits = 0;
        this.misses = 0;
        this.awardedKisses = null;
        this.spawnAcc = 0;
        this.ambientAcc = 0;
        this.bag = [];
        // Скорость выводится из длины выхода, а не задаётся отдельно: машина
        // ОБЯЗАНА добраться до горизонта ровно тогда, когда кончится время,
        // иначе она приезжает то раньше, то позже и перестаёт быть шкалой.
        this.speed = (PRIDE_ART.Z_FAR - PRIDE_ART.Z_START) / (this.params.runMs / 1000);
        this.clearTargets();
        this.buildMovers();
        if (this.wormHandle && this.wormHandle.setTreadmill) this.wormHandle.setTreadmill(0);
    },

    // ---------- СМЕНА ДЕКОРАЦИЙ ----------
    // Один вызов на обе стороны: 'room' — костюмерная на месте, дорожка
    // разъехалась; 'carpet' — наоборот. Двигаются КУСКИ, и каждый в свою
    // сторону: занавес вверх, помост вниз, зеркало и вешалка по бокам, а
    // дорожка приезжает им на смену теми же путями. Читается это работой
    // сцены — увезли одно, привезли другое.
    //
    // Едет всё на css-переходах, то есть на композиторе: ни одной
    // перерисовки, что бы ни лежало внутри групп.
    setDecor(which, animated) {
        const room = which === 'room';
        const hide = [], moved = [];
        const put = (id, x, y, on) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.style.transition = animated ? `transform ${PRIDE_VIEW.CHANGE_MS}ms cubic-bezier(.5,.05,.3,1)` : 'none';
            // Пока едет — видима любая декорация, даже уезжающая: иначе
            // половина смены пройдёт с пустым экраном.
            el.style.visibility = 'visible';
            // Слой композитора выдаётся ТОЛЬКО на время переезда: постоянный
            // will-change держал бы девять полноэкранных слоёв в памяти всё
            // время, пока игра открыта, ради трёх четвертей секунды.
            el.style.willChange = animated ? 'transform' : '';
            el.style.transform = on ? 'translate(0,0)' : `translate(${x}px,${y}px)`;
            if (!on) hide.push(el);
            moved.push(el);
        };
        const W = PRIDE_ART.W, H = PRIDE_ART.H;
        put('pr-room-back', 0, -H, room);
        put('pr-room-floor', 0, H, room);
        put('pr-room-l', -W, 0, room);
        put('pr-room-r', W, 0, room);
        put('pr-far', 0, -H, !room);
        put('pr-ground', 0, H, !room);
        put('pr-side-l', -W, 0, !room);
        put('pr-side-r', W, 0, !room);
        put('pr-props', 0, H, !room);

        // Уехавшую декорацию ПРЯЧЕМ. Она за краем холста и не видна, но
        // браузер продолжает считать её слоем и растрировать: за экраном
        // лежит либо вся дорожка с толпой, либо вся костюмерная с занавесом
        // в тринадцать складок. Это ровно тот случай, когда «невидимое» и
        // «не отрисовывается» — разные вещи (docs/traps.md, п. 38).
        if (this._hideTimer) clearTimeout(this._hideTimer);
        const apply = () => {
            hide.forEach(el => { el.style.visibility = 'hidden'; });
            moved.forEach(el => { el.style.willChange = ''; });
        };
        if (animated) this._hideTimer = setTimeout(apply, PRIDE_VIEW.CHANGE_MS + 40);
        else apply();
    },

    // ---------- ПОДВИЖНОЕ: ПОПЕРЕЧИНЫ, ТОЛПА, МАШИНА, ФИНИШ ----------
    // Всё это стоит на одной плоскости и едет по одному правилу: глубина
    // уменьшается, остальное считает перспектива. Узлы создаются ОДИН РАЗ на
    // выход, дальше меняется только transform (или points у поперечины).
    buildMovers() {
        const A = PRIDE_ART;
        this.sceneEl.querySelector('#pr-stripes').innerHTML = '';
        this.sceneEl.querySelector('#pr-crowd-l').innerHTML = '';
        this.sceneEl.querySelector('#pr-crowd-r').innerHTML = '';
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

        // Толпа гуще от покупки массовки: купленное обязано быть видно. Но не
        // по силуэту за ступень — ступеней теперь шесть, и толпа выросла бы
        // вдвое против задуманной, а это чистая заливка каждый кадр. Ряд
        // добавляется через ступень: видно, что стало гуще, и кадр цел.
        const rows = PRIDE_VIEW.CROWD_ROWS + Math.ceil(this.params.levels.crowd / 2);
        const crowdLayers = {
            '-1': this.sceneEl.querySelector('#pr-crowd-l'),
            '1': this.sceneEl.querySelector('#pr-crowd-r')
        };
        const span = (A.Z_FAR - A.Z_CROWD_MIN) / PRIDE_VIEW.CLUSTERS;
        for (let side = -1; side <= 1; side += 2) {
            for (let i = 0; i < PRIDE_VIEW.CLUSTERS; i++) {
                const g = this.svgNode('g');
                g.innerHTML = PRIDE_ART.crowdCluster(rows, side * 31 + i * 7 + 3);
                crowdLayers[side].appendChild(g);
                // Стороны сдвинуты на полшага друг относительно друга: иначе
                // толпа идёт парами напротив и читается забором, а не людьми.
                this.clusters.push({
                    el: g, side,
                    z: A.Z_CROWD_MIN + i * span + (side > 0 ? span * 0.5 : 0)
                });
            }
        }

        // Машина стоит в начале ковра, дверь открыта — червь только что из
        // неё вышел. Дальше она остаётся позади и уезжает к горизонту; по
        // ней и по длине ковра за спиной и видно, сколько уже пройдено.
        const props = this.sceneEl.querySelector('#pr-props');
        const carG = this.svgNode('g');
        carG.innerHTML = PRIDE_ART.car(this.params.levels.car);
        props.appendChild(carG);
        this.car = { el: carG, z: A.Z_START };

        this.placeMovers();
    },

    // Расстановка по текущим глубинам. Одна запись в дерево на предмет:
    // толпа едет гроздьями, поэтому предметов десяток, а людей за ними
    // вчетверо больше.
    placeMovers() {
        const A = PRIDE_ART;
        // Поперечины живут только НА ковре: дальше машины ковра ещё нет, и
        // полоса, нарисованная там, висела бы поперёк голого асфальта.
        const zEnd = this.carpetEnd();
        this.stripes.forEach(s => {
            const on = s.z < zEnd - PRIDE_VIEW.STRIPE_THICK;
            s.el.style.display = on ? '' : 'none';
            if (on) s.el.setAttribute('points', A.stripePoints(s.z, PRIDE_VIEW.STRIPE_THICK));
        });
        this.clusters.forEach(c => {
            const k = A.CROWD_H * A.s(c.z) / 1000;
            const x = A.CX + c.side * A.half(c.z) * A.LANE;
            const y = A.y(c.z);
            c.el.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${k.toFixed(4)})`);
        });
        if (this.car) {
            const k = A.CROWD_H * A.s(this.car.z) / 1000;
            // По ЦЕНТРУ дорожки: машина подвезла звезду к началу ковра и
            // уезжает назад по той же осевой, по которой он идёт вперёд.
            this.car.el.setAttribute('transform',
                `translate(${A.CX},${A.y(this.car.z).toFixed(1)}) scale(${k.toFixed(4)})`);
            // Ковёр расстелен ОТ МАШИНЫ до камеры: пройденное — это длина
            // красной полосы за спиной, и она растёт сама собой.
            const zEnd = this.carpetEnd();
            const poly = this.sceneEl.querySelector('#pr-carpet-poly');
            const el = this.sceneEl.querySelector('#pr-edge-l');
            const er = this.sceneEl.querySelector('#pr-edge-r');
            if (poly) poly.setAttribute('points', A.carpetPoints(zEnd));
            if (el) el.setAttribute('points', A.edgePoints(-1, zEnd));
            if (er) er.setAttribute('points', A.edgePoints(1, zEnd));
        }
    },

    // Дальний край ковра: чуть за машиной, чтобы она стояла НА ковре, а не
    // на голой земле перед ним.
    carpetEnd() {
        return Math.min(PRIDE_ART.Z_FAR, (this.car ? this.car.z : PRIDE_ART.Z_START) + 4);
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
                // ---------- НА НЕГО СМОТРЯТ В ЛОБ ----------
                // Хвост уходит ОТ КАМЕРЫ за спину, а не вбок: боковой хвост
                // при взгляде в лоб превращает фигуру в букву «Г» — тело по
                // центру дорожки, а хвост зачем-то уехал влево. Число —
                // перспективное укорочение звена; виляние выносит кончик
                // из-за силуэта, и хвост в кадре только так и виден.
                tailDepth: 0.62,
                anchorX: 0.5,
                anchorY: 0.55
            });
            // Морда прямо на камеру и не двигается: звезда идёт на публику,
            // а не ищет её глазами.
            this.wormHandle.setHeadPose('center', { instant: true });
            this.wormHandle.setLivePose(PRIDE_FACE);
        } else {
            this.wormHandle.update(model);
            this.wormHandle.setHeadPose('center', { instant: true });
            this.wormHandle.setLivePose(PRIDE_FACE);
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
        // Видимый кусок холста — в единицах сцены. Считается здесь, потому
        // что здесь уже дёрнута раскладка: второй раз за кадр её трогать
        // нельзя (docs/traps.md).
        const tl = this.fromScreen(r.left, r.top);
        const br = this.fromScreen(r.right, r.bottom);
        this.safe = {
            x0: Math.max(0, tl.x), y0: Math.max(0, tl.y),
            x1: Math.min(PRIDE_ART.W, br.x), y1: Math.min(PRIDE_ART.H, br.y)
        };
        const p0 = this.toScreen(0, 0, m), p1 = this.toScreen(100, 0, m);
        const k = ((p1.x - p0.x) / 100) / zoom || 1;
        // Червь крупнее сцены на WORM_SCALE, поэтому внутри его холста одна
        // единица длиннее единицы сцены ровно во столько же раз — и все
        // сдвиги, которые считаются в единицах сцены, надо делить на это
        // число, прежде чем отдавать рендереру.
        const S = PRIDE_VIEW.WORM_SCALE;
        this.wormHost.style.transform =
            `translate(${((p0.x - r.left) / zoom).toFixed(1)}px, ${((p0.y - r.top) / zoom).toFixed(1)}px) scale(${(k * S).toFixed(4)})`;

        const body = this.wormHandle.svgRoot.querySelector('.worm-root');
        if (!body) return;
        const box = body.getBoundingClientRect();
        if (box.width < 1) return;
        const a = this.fromScreen(box.left, box.top);
        const b = this.fromScreen(box.right, box.bottom);
        const dx = PRIDE_ART.CX - (a.x + b.x) / 2;
        const dy = PRIDE_ART.Y_FEET - b.y;
        const pos = this.wormHandle.getPosition();
        this.wormHandle.setPosition(pos.x + dx / S, pos.y + dy / S);
        this.wormBox = { x: a.x + dx, y: a.y + dy, w: b.x - a.x, h: b.y - a.y };

        // Тень: по ширине силуэта, а не по числу. Без неё червь не стоит на
        // ковре, а висит над ним — и это первое, что видно в кадре.
        [this.sceneEl.querySelector('#pr-shadow'),
         this.roomEl.querySelector('#pr-room-shadow')].forEach(shadow => {
            if (!shadow) return;
            shadow.setAttribute('rx', (this.wormBox.w * 0.42).toFixed(1));
            shadow.setAttribute('ry', (this.wormBox.w * 0.11).toFixed(1));
        });
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
            // ГЛУБИНА РАСТЁТ У ВСЕГО: мир уходит от камеры, а значит червь
            // идёт на зрителя. Предметы выплывают снизу кадра, проходят мимо
            // и уменьшаются к горизонту.
            const dz = this.speed * dt;
            // Толпа едет МЕДЛЕННЕЕ ковра — она дальше от оси движения, и
            // параллакс отделяет её от дорожки. Без него сцена читается одной
            // плоской картинкой, которую тянут за верёвочку.
            const span = PRIDE_VIEW.STRIPES * PRIDE_VIEW.STRIPE_STEP;
            this.stripes.forEach(s => {
                s.z += dz;
                if (s.z > span) s.z -= span;
            });
            this.clusters.forEach(c => {
                c.z += dz * 0.78;
                if (c.z > PRIDE_ART.Z_FAR) c.z -= PRIDE_ART.Z_FAR - PRIDE_ART.Z_CROWD_MIN;
            });
            if (this.car) this.car.z += dz;
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

            // Машина добралась до горизонта — вся дорожка пройдена.
            if (this.car.z >= PRIDE_ART.Z_FAR) this.finishRun();
        }

        this.rafId = requestAnimationFrame((t) => this.loop(t));
    },

    // ---------- СТАРТ ----------
    // Три шага, и каждый нужен: декорации меняются, потом отсчёт, потом
    // выход. Без отсчёта игрок оказывается на дорожке в тот момент, когда
    // ещё смотрит, как уезжает костюмерная, и первые зоны пропускает не по
    // своей вине.
    startShow() {
        if (this.phase !== 'wardrobe' || this.storeOpen) return;
        // Числа берутся ЗАНОВО: в костюмерной можно просидеть час, и порог
        // голода за это время вполне переходится. Решать «платят ли» надо на
        // момент старта, а не на момент входа в грех.
        this.params = Backend.prideRun();
        this.phase = 'change';
        this.renderUI();
        this.setDecor('carpet', true);
        setTimeout(() => {
            if (this.phase !== 'change') return;
            this.startCount();
        }, PRIDE_VIEW.CHANGE_MS);
    },

    startCount() {
        this.phase = 'count';
        this.countLeft = 3;
        const tick = () => {
            if (this.phase !== 'count') return;
            if (this.countLeft <= 0) { this.beginRun(); return; }
            this.showCount(this.countLeft);
            this.countLeft--;
            setTimeout(tick, PRIDE_VIEW.COUNT_STEP_MS);
        };
        tick();
    },

    showCount(n) {
        if (!this.countEl) return;
        const C = PALETTE.redCarpet;
        // Цифра стоит ВЫШЕ середины: по центру она садится ровно на морду
        // червя, а он тут главный даже в отсчёте.
        const y = this.safe.y0 + (this.safe.y1 - this.safe.y0) * 0.42;
        this.countEl.innerHTML =
            `<text class="pr-count-digit" x="${PRIDE_ART.CX}" y="${y.toFixed(0)}"
                   text-anchor="middle" font-size="190" font-weight="800"
                   fill="${C.flash[300]}" stroke="${PALETTE.ink}" stroke-width="6"
                   paint-order="stroke">${n}</text>`;
    },

    beginRun() {
        this.phase = 'run';
        if (this.countEl) this.countEl.innerHTML = '';
        this.spawnAcc = this.params.spawnMs * 0.5;
        if (this.wormHandle && this.wormHandle.setTreadmill) this.wormHandle.setTreadmill(1);
        this.renderUI();
        this.placeMovers();
        this.renderHud();
    },

    finishRun() {
        if (this.phase !== 'run') return;
        this.phase = 'done';
        this.clearTargets();
        if (this.wormHandle && this.wormHandle.setTreadmill) this.wormHandle.setTreadmill(0);
        this.renderHud();

        // Мини-игра не начисляет сама: сообщает, сколько поцелуев собрано, а
        // выдавать ли их — решает конфиг наград через Backend (инвариант 2).
        // При сытом черве не выдаст ничего, но собирать там и нечего:
        // поцелуйных зон в таком выходе не появляется вовсе.
        GameEvents.emit('minigame:result', {
            sin: 'pride', mode: 'parade', outcome: 'win',
            meta: { kisses: this.kisses, hits: this.hits, misses: this.misses }
        });

        setTimeout(() => {
            if (this.phase !== 'done') return;
            if (!this.screenElement.classList.contains('active')) return;
            // Обратно в костюмерную — и декорации едут обратно тем же путём.
            this.setDecor('room', true);
            setTimeout(() => this.enterWardrobe(), PRIDE_VIEW.CHANGE_MS);
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
        // Поцелуй возможен только при живом стрике: пока толпа не заведена,
        // на червя никто не прыгает, и мешок при этом НЕ трогаем — иначе
        // выпавшие впустую поцелуи съедали бы долю уже открытого периода.
        const kiss = this.kissesOpen() && this.nextIsKiss() && !!this.wormBox;
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

    // ---------- КОМУ ДОСТАЁТСЯ ЗОНА ----------
    // Мешок, а не бросок монетки на каждую зону: из `of` зон ровно столько-то
    // поцелуйных, порядок случайный, тянем без возврата. Разница не в
    // среднем, а в хвостах — монетка регулярно выдаёт выход, где поцелуев
    // почти не было, и виноватым себя чувствует игрок, хотя не виноват.
    //
    // Доля фиксированная. Раньше она зависела от ажиотажа, но теперь тем же
    // занят стрик, и занят жёстче: при нулевом стрике поцелуев нет вообще.
    nextIsKiss() {
        if (!this.bag || !this.bag.length) this.fillBag();
        return this.bag.pop();
    },

    // Открыт ли червь для поцелуев. Условий два, и второе важнее:
    //
    //   • живой стрик — хотя бы одна белая зона закрыта и с тех пор ничего
    //     не пропущено;
    //   • червь ГОЛОДЕН, то есть шкала гордыни опустилась до порога. Пока он
    //     сыт, целовать его никто не лезет: выход идёт, шкала закроется, но
    //     поцелуев в кадре не будет ни одного.
    //
    // Второе — то самое правило антифарма, и живёт оно ЗДЕСЬ, в спавне зон, а
    // не в начислении. Разница принципиальная: игрок видит пустую дорожку, а
    // не пустой кошелёк после честно собранных четырнадцати поцелуев.
    kissesOpen() {
        return this.params.pays && this.streak >= this.params.streak.needForKiss;
    },

    fillBag() {
        const b = this.params.kissBag;
        this.bag = Array.from({ length: b.of }, (_, i) => i < b.kisses);
        // Тасовка Фишера—Йетса: доля в мешке задана, а порядок нет — иначе
        // поцелуи шли бы строго через три вспышки и читались расписанием.
        for (let i = this.bag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = this.bag[i]; this.bag[i] = this.bag[j]; this.bag[j] = t;
        }
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
        const r = this.params.radius, S = this.safe;
        return {
            x: Math.max(S.x0 + r, Math.min(S.x1 - r, x)),
            y: Math.max(Math.max(S.y0 + r, PRIDE_ART.HORIZON - r * 0.2),
                        Math.min(S.y1 - r, y))
        };
    },

    farEnough(spot) {
        const gap = this.params.radius * PRIDE_VIEW.ZONE_GAP;
        return !this.targets.some(t => Math.hypot(t.x - spot.x, t.y - spot.y) < gap);
    },

    tickTargets(now) {
        const r = this.params.radius;
        // Идём по КОПИИ, и каждую зону перед касанием проверяем на живость.
        // Погасшая зона рвёт стрик, а разрыв гасит ВЕСЬ экран — то есть
        // выносит тот самый массив, по которому идёт цикл. По живому массиву
        // это падало бы на первом же разрыве, и падало бы через кадр после
        // правки, а не в ней самой.
        for (const t of this.targets.slice()) {
            if (this.targets.indexOf(t) < 0) continue;
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
    // Один обработчик на весь экран, разведённый по фазам. Витрина, пока
    // открыта, съедает всё: тап мимо карточки закрывает её, а не улетает в
    // костюмерную под ней.
    onDown(e) {
        e.preventDefault();
        const hit = (sel) => (e.target.closest ? e.target.closest(sel) : null);

        if (this.storeOpen) {
            const tab = hit('.pr-tab');
            if (tab) { this.storeTab = tab.dataset.tab; this.renderStore(); return; }
            const item = hit('.pr-item');
            if (item) { this.tapItem(item.dataset.item); return; }
            const boost = hit('.pr-boost');
            if (boost) { this.buyBoost(boost.dataset.boost); return; }
            // Крестик витрины или тап мимо панели — закрываем.
            if (hit('.pr-store-close') || hit('.pr-store-back')) {
                this.storeOpen = false;
                this.renderStore();
            }
            return;
        }

        if (this.phase === 'wardrobe') {
            const slot = hit('.pr-slot');
            if (slot) { this.tapSlot(slot.dataset.slot); return; }
            if (hit('#pr-shop-btn')) { this.storeOpen = true; this.renderStore(); return; }
            if (hit('#pr-start-btn')) { this.startShow(); return; }
            return;
        }
        if (this.phase !== 'run') return;

        const p = this.fromScreen(e.clientX, e.clientY);
        // Тап засчитывается той зоне, которой осталось жить меньше всех: если
        // две наложились краями, справедливее закрыть ту, что вот-вот
        // погаснет, — вторую игрок ещё успеет добрать.
        let pick = null;
        for (const t of this.targets) {
            if (Math.hypot(p.x - t.x, p.y - t.y) > this.params.radius) continue;
            if (!pick || t.diesAt < pick.diesAt) pick = t;
        }
        if (pick) this.resolveTarget(pick, p);
        else this.registerMissclick();   // барабанить пальцем по полю невыгодно
    },

    resolveTarget(target, p) {
        this.removeTarget(target);
        this.hits++;
        if (target.kiss) {
            // Поцелуй ПЛАТИТ, но стрик не растит: он его только удерживает
            // (это не промах). Иначе деньги дорожали бы сами от себя, и
            // вспышки, ради которых всё затевалось, стали бы не нужны.
            const mult = this.multiplier();
            this.kisses += mult;
            this.kissFx(target.x, target.y, mult);
        } else {
            // Белая зона — единственное, что растит стрик. Она же открывает
            // червя для поцелуев, если стрик был нулевым.
            this.streak += this.params.streak.perHit;
            this.flashFx(target.x, target.y);
        }
        this.renderHud();
    },

    // Зона погасла сама — СЕРИЯ РВЁТСЯ. Раньше это было мягче (ажиотаж просто
    // проседал), потому что зон бывает больше, чем успевает палец, и рвать за
    // это значит наказывать за купленную прокачку. Теперь тормоз держит не
    // мягкость наказания, а spawnFloor: интервал не опускается ниже того, что
    // палец физически закрывает, — а всё, что игрок увидел и не тронул, он
    // пропустил сам.
    registerMiss() {
        this.misses++;
        if (this.params.streak.breakOnMiss) this.breakStreak();
        this.renderHud();
    },

    // Тап в пустоту — тоже разрыв. Дробь по экрану обязана стоить дорого:
    // иначе выгодно молотить пальцем вслепую, а зоны большие и слепая дробь
    // закрывала бы их сама.
    registerMissclick() {
        this.misses++;
        if (this.params.streak.breakOnMissclick) this.breakStreak();
        this.renderHud();
    },

    // ---------- РАЗРЫВ ----------
    // Стрик в ноль, и ЭКРАН ОЧИЩАЕТСЯ ЦЕЛИКОМ: гаснут все висящие зоны, и
    // розовые, и белые.
    //
    // Белые сначала оставляли жить, и это была дыра, а не мягкость. Игрок
    // тыкал в пустоту при живой белой зоне, тут же добивал её — и стрик
    // возвращался к единице, а с ним и доступ к поцелуям. Мисклик не стоил
    // ничего: наказание отменялось той самой зоной, которая висела в момент
    // наказания. Разрыв обязан быть разрывом — после него набирать серию
    // приходится с зон, которые ЕЩЁ НЕ ПОЯВИЛИСЬ.
    //
    // Гасим ТИХО, минуя registerMiss: рекурсия из разрывов внутри разрыва —
    // это не наказание, а поломка.
    breakStreak() {
        if (this.streak > 0) this.flashReset();
        this.streak = 0;
        this.clearTargets();
    },

    // Сорванный множитель показывается тем же местом, где он рос: цифра
    // краснеет и дёргается. Без этого разрыв — самое обидное событие игры,
    // случившееся молча.
    flashReset() {
        const el = this.hudEl && this.hudEl.querySelector('.pr-mult');
        if (!el) return;
        el.classList.remove('pr-mult-drop');
        void el.getBBox();
        el.classList.add('pr-mult-drop');
    },

    // Множитель = длина стрика, потолок задаёт машина. При нулевом стрике
    // поцелуйных зон на экране нет, так что платить этой единицей нечему —
    // она нужна только показу.
    multiplier() {
        return Math.min(this.params.multCap, Math.max(1, this.streak));
    },

    // ---------- ФОНОВЫЕ ВСПЫШКИ ----------
    // Толпа щёлкает сама по себе, и тем чаще, чем выше ажиотаж. Это не зоны:
    // по ним не тапают, они ничего не дают. Это показ ажиотажа без единой
    // цифры — накал света (план, раздел 5).
    tickAmbient(dt) {
        this.ambientAcc += dt * 1000 * (1 + this.streak * 0.35);
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
        // ---------- КОШЕЛЁК И ПРИБАВКА — ДВА РАЗНЫХ ЧИСЛА ----------
        // Пока показывали одно, выход читался как ОБНУЛЕНИЕ кошелька: игрок
        // заканчивал выход с «💋 34», начинал следующий — и видел «💋 0».
        // Копилось при этом всё честно, врал именно показ.
        //
        // Теперь слева всегда КОШЕЛЁК (он не уменьшается никогда), а рядом со
        // знаком «плюс» — сколько добавит этот выход. В конце прибавка
        // складывается в кошелёк на глазах: число слева подскакивает ровно на
        // то, что стоит справа от плюса.
        const wallet = GameState.currency('pride_kiss');
        // Строка счёта — от ВИДИМОГО верха, а не от верха холста: иначе на
        // телефоне, где холст обрезан, цифры уезжают под край окна.
        const x = this.safe.x0 + 16, y = this.safe.y0 + 34;
        const purse = `<text x="${x}" y="${y}" font-size="26">💋</text>` +
                      `<text x="${x + 30}" y="${y}" font-size="26" fill="${C.kiss[300]}" font-weight="700">${wallet}</text>`;
        if (this.phase !== 'run' && this.phase !== 'done') {
            this.hudEl.innerHTML = purse + this.hungerBadge(x, y + 14);
            return;
        }
        // На финише показываем НАЧИСЛЕННОЕ, пока оно не пришло — собранное.
        const done = this.phase === 'done' && this.awardedKisses != null;
        const gain = done ? this.awardedKisses : this.kisses;
        const gx = x + 30 + String(wallet).length * 16 + 14;
        // Урезания больше нет: начисленное либо равно собранному, либо выхода
        // просто не оплатили (сытый червь), и тогда собирать было нечего —
        // поцелуйных зон в таком выходе не появлялось. Поэтому и показывать
        // здесь двух чисел больше не надо, а при неоплаченном выходе прибавку
        // не показываем вовсе: вместо неё говорит полоска голода.
        const px = gx;
        this.hudEl.innerHTML = purse +
            (this.params.pays
                ? `<text x="${px}" y="${y}" font-size="22" fill="${C.flash[500]}"
                         font-weight="700" opacity="${this.phase === 'done' ? 1 : 0.85}">+${gain}</text>`
                : '') +
            this.multBadge(this.safe.x1 - 18, y - 4) +
            (this.phase === 'done' ? this.hungerBadge(x, y + 14) : '');
    },

    // ---------- ПОРОГ ГОЛОДА: ПОЛОСКА С МЕТКОЙ ----------
    // Здесь был ряд точек — суточная лестница «публика устаёт». Лестницы
    // больше нет: она резала заработанное, и показать её честно было
    // невозможно, потому что показывать приходилось сам факт отъёма.
    //
    // Теперь показывается ГОЛОД: полоска — шкала гордыни, риска на ней —
    // порог, ниже которого за выход платят. Пока заливка правее риски, червь
    // сыт: поцелуйных зон на дорожке не будет, и полоска потушена. Цифра
    // рядом — часы до порога, ждать столько. Ни одного слова, цифра не слово
    // (инвариант 9).
    hungerBadge(x, y) {
        const C = PALETTE.redCarpet;
        const info = Backend.sinPayInfo ? Backend.sinPayInfo('pride') : null;
        if (!info || info.threshold == null) return '';
        const W = 108, H = 7;
        const fill = Math.max(0, Math.min(1, info.value / info.max));
        const mark = Math.max(0, Math.min(1, info.threshold / info.max));
        const hours = Math.ceil(info.hoursLeft);
        return `<g class="pr-hunger" transform="translate(${x.toFixed(0)},${y.toFixed(0)})">
            <rect x="0" y="0" width="${W}" height="${H}" rx="${H / 2}"
                  fill="${C.night[500]}" opacity="0.8"/>
            <rect x="0" y="0" width="${(W * fill).toFixed(1)}" height="${H}" rx="${H / 2}"
                  fill="${info.pays ? C.kiss[300] : C.glow[500]}"
                  opacity="${info.pays ? 1 : 0.55}"/>
            <rect x="${(W * mark).toFixed(1)}" y="${-3}" width="2" height="${H + 6}" rx="1"
                  fill="${C.gold[300]}"/>
            ${info.pays ? '' :
              `<text x="${W + 9}" y="${H}" font-size="15" font-weight="700"
                     fill="${C.glow[500]}" opacity="0.85">${hours}</text>`}
        </g>`;
    },

    // ---------- МНОЖИТЕЛЬ НА ЭКРАНЕ ----------
    // Он теперь главное, что игрок теряет за одну ошибку, — значит должен
    // быть виден всё время и крупно, а не тускнеть в углу. Три вещи в одном
    // месте:
    //   • сама цифра — во сколько раз дороже следующий поцелуй;
    //   • полоска под ней — насколько стрик подобрался к потолку машины;
    //   • размер — то же самое ростом, чтобы разрыв было видно боковым зрением.
    //
    // ПОГАШЕННЫЙ ВИД ПРИ НУЛЕВОМ СТРИКЕ — не украшение, а показ правила: пока
    // цифра серая, червя не целуют, и единственный способ это изменить —
    // закрыть белую зону. Ни одного слова на это не потрачено (инвариант 9).
    //
    // Упёрлись в потолок машины — полоска полная и золотая: видно, что упёрся
    // не в игру, а в непокупленное.
    multBadge(x, y) {
        const C = PALETTE.redCarpet;
        const live = this.kissesOpen();
        const mult = this.multiplier();
        const cap = this.params.multCap;
        const capped = live && mult >= cap;
        const toNext = cap > 1 ? Math.min(1, this.streak / cap) : (live ? 1 : 0);
        const size = 26 + (live ? Math.min(1, this.streak / cap) * 12 : 0);
        const bar = 36;
        const face = !live ? C.glow[500] : (capped ? C.gold[300] : C.flash[500]);
        return `<g class="pr-mult" transform="translate(${x.toFixed(0)},${y.toFixed(0)})"
                   opacity="${live ? 1 : 0.4}">
            <text x="0" y="0" text-anchor="end" font-size="${size.toFixed(0)}"
                  font-weight="800" fill="${face}">×${mult}</text>
            <rect x="${-bar}" y="9" width="${bar}" height="5" rx="2.5"
                  fill="${C.night[500]}" opacity="0.75"/>
            <rect x="${-bar}" y="9" width="${(bar * toNext).toFixed(1)}" height="5" rx="2.5"
                  fill="${capped ? C.gold[300] : C.kiss[300]}"/>
        </g>`;
    },

    // ---------- ИНТЕРФЕЙС КОСТЮМЕРНОЙ ----------
    // Слоты наряда, кнопка магазина и кнопка старта. Всё рисуется в
    // ВЕРХНЕМ холсте, в единицах сцены, и вжимается в видимую область —
    // холст обрезается по-разному на разных телефонах.
    //
    // Ценников на предметах сцены больше нет: прокачка переехала на свою
    // вкладку витрины. Ценник, висящий на машине посреди выхода, спорил с
    // игрой за внимание, а в костюмерной для покупок есть отдельное место.
    renderUI() {
        if (!this.uiEl) return;
        if (this.phase !== 'wardrobe') { this.uiEl.innerHTML = ''; return; }
        const S = this.safe;
        const worn = GameState.data.cosmetics || {};

        // ---------- РАСКЛАДКА ОТ ЧЕРВЯ, А НЕ ОТ КРАЁВ ----------
        // Слоты стоят двумя столбцами по бокам ОТ ПЕРСОНАЖА и на его высоте:
        // прижатые к краям экрана, они налезали на зеркало и вешалку, а на
        // узком телефоне ещё и резались рамкой окна. Столбец отсчитывается от
        // измеренного силуэта, поэтому держится рядом с червём при любом
        // размере экрана и любом росте персонажа.
        const box = this.wormBox || { x: 140, y: 380, w: 110, h: 250 };
        const gap = 52;
        const cols = {
            left: Math.max(S.x0 + 40, box.x - gap),
            right: Math.min(S.x1 - 40, box.x + box.w + gap)
        };
        const rows = [
            Math.max(S.y0 + 132, PRIDE_ART.Y_FEET - 240),
            Math.max(S.y0 + 218, PRIDE_ART.Y_FEET - 152)
        ];
        const used = { left: 0, right: 0 };

        let out = '';
        PRIDE_WARDROBE.slots.forEach(slot => {
            const x = cols[slot.side];
            const y = rows[Math.min(1, used[slot.side]++)];
            const art = worn[slot.key]
                ? WormCosmetics.art(worn[slot.key], 15, PALETTE.flesh[500]) : null;
            out += `<g transform="translate(${x.toFixed(0)},${y.toFixed(0)})">` +
                   PRIDE_ART.slotCard(slot, art) + '</g>';
        });

        // Кнопка старта — ПОД червём: он стоит готовый и трогается с места,
        // когда решит игрок. Ниже её ничего быть не должно, поэтому она же и
        // определяет, где кончается экран костюмерной.
        const startY = Math.min(S.y1 - 62, PRIDE_ART.Y_FEET + 84);
        out += `<g transform="translate(${PRIDE_ART.CX},${startY.toFixed(0)})">` +
               PRIDE_ART.startButton(42) + '</g>';
        // Магазин — СПРАВА внизу. Слева нельзя: там кнопка debug-режима, и на
        // телефоне они наезжали друг на друга.
        out += `<g transform="translate(${(S.x1 - 44).toFixed(0)},${(S.y1 - 44).toFixed(0)})">` +
               PRIDE_ART.shopButton(26) + '</g>';
        this.uiEl.innerHTML = out;
    },

    // ---------- ВИТРИНА ----------
    // Две вкладки: наряд и прокачка. Наряд ничего не даёт и виден везде,
    // прокачка меняет числа выхода и не видна нигде — общего у них ровно
    // одно: платят за них поцелуями. Поэтому одна витрина, две полки.
    renderStore() {
        if (!this.storeEl) return;
        if (!this.storeOpen) { this.storeEl.innerHTML = ''; return; }
        const C = PALETTE.redCarpet;
        const S = this.safe;
        const x0 = S.x0 + 14, x1 = S.x1 - 14;
        const wear = this.storeTab === 'wear';
        // Панель ровно по содержимому: полки разной длины, и растянутая на
        // весь экран витрина с пустой нижней половиной читается недогрузом.
        const y0 = S.y0 + 74;
        const y1 = y0 + 56 + (wear ? 4 * 106 : 3 * 96) + 16;

        let out = `<rect class="pr-store-back" x="${S.x0}" y="${S.y0}"
                         width="${(S.x1 - S.x0).toFixed(0)}" height="${(S.y1 - S.y0).toFixed(0)}"
                         fill="${C.night[900]}" fill-opacity="0.82"/>
            <rect x="${x0}" y="${y0}" width="${(x1 - x0).toFixed(0)}" height="${(y1 - y0).toFixed(0)}"
                  rx="20" fill="${C.night[700]}" stroke="${C.gold[700]}" stroke-width="2"/>`;

        // Вкладки — двумя значками, без единой буквы.
        const tab = (key, emoji, cx) => `<g class="pr-tab" data-tab="${key}">
            <rect x="${cx - 52}" y="${y0 - 22}" width="104" height="44" rx="14"
                  fill="${this.storeTab === key ? C.silk[700] : C.night[900]}"
                  stroke="${this.storeTab === key ? C.gold[300] : C.rail[700]}" stroke-width="2"/>
            <text x="${cx}" y="${y0 + 8}" text-anchor="middle" font-size="24">${emoji}</text></g>`;
        out += tab('wear', '👗', (x0 + x1) / 2 - 58) + tab('boost', '⬆', (x0 + x1) / 2 + 58);

        out += `<g class="pr-store-close" transform="translate(${(x1 - 26).toFixed(0)},${(y0 + 26).toFixed(0)})">
            <circle r="18" fill="${C.night[900]}" stroke="${C.rail[700]}" stroke-width="2"/>
            <path d="M -7 -7 L 7 7 M 7 -7 L -7 7" stroke="${C.flash[500]}"
                  stroke-width="3" stroke-linecap="round"/></g>`;

        out += wear ? this.storeWear(x0, x1, y0 + 56) : this.storeBoost(x0, x1, y0 + 56);
        this.storeEl.innerHTML = out;
    },

    // Полка наряда: восемь карточек по две в ряд. На карточке сам предмет,
    // а не значок: покупают глазами, и что покупаешь, должно быть видно.
    storeWear(x0, x1, top) {
        const C = PALETTE.redCarpet;
        const wallet = GameState.currency('pride_kiss');
        const owned = GameState.data.wardrobe || {};
        const worn = GameState.data.cosmetics || {};
        const cw = (x1 - x0 - 30) / 2, ch = 96;
        return PRIDE_WARDROBE.items.map((item, i) => {
            const cx = x0 + 15 + cw * (i % 2) + cw / 2;
            const cy = top + Math.floor(i / 2) * (ch + 10) + ch / 2;
            const have = !!owned[item.id];
            const on = worn[item.slot] === item.id;
            const price = item.price.pride_kiss;
            const rich = wallet >= price;
            const art = WormCosmetics.art(item.id, 24, PALETTE.flesh[500]);
            const label = have
                ? `<circle cx="${(cw / 2 - 16).toFixed(0)}" cy="${(-ch / 2 + 16).toFixed(0)}" r="7"
                           fill="${on ? C.gold[300] : C.rail[500]}"/>`
                : `<text x="${(cw / 2 - 10).toFixed(0)}" y="${(ch / 2 - 12).toFixed(0)}"
                         text-anchor="end" font-size="15" font-weight="700"
                         fill="${rich ? C.kiss[300] : C.night[500]}">${price}</text>
                   <text x="${(-cw / 2 + 12).toFixed(0)}" y="${(ch / 2 - 12).toFixed(0)}"
                         font-size="13">💋</text>`;
            return `<g class="pr-item${have ? ' have' : ''}${on ? ' on' : ''}${!have && rich ? ' rich' : ''}"
                       data-item="${item.id}" transform="translate(${cx.toFixed(0)},${cy.toFixed(0)})">
                <rect x="${-cw / 2 + 4}" y="${-ch / 2}" width="${cw - 8}" height="${ch}" rx="14"
                      fill="${C.night[900]}" fill-opacity="0.9"
                      stroke="${on ? C.gold[300] : (have ? C.rail[500] : C.rail[700])}"
                      stroke-width="${on ? 2.5 : 1.6}"/>
                <g transform="translate(0,8)" opacity="${have ? 1 : 0.5}">${art}</g>
                ${label}</g>`;
        }).join('');
    },

    // Полка прокачки: три линии, у каждой лесенка ступеней и цена следующей.
    storeBoost(x0, x1, top) {
        const C = PALETTE.redCarpet;
        const conf = ECONOMY.minigames.pride.upgrades;
        const wallet = GameState.currency('pride_kiss');
        const w = x1 - x0 - 30, h = 84;
        return conf.order.map((key, i) => {
            const branch = conf[key];
            const level = GameState.upgradeLevel('pride_' + key);
            const next = branch.levels[level];
            const price = next ? next.price.pride_kiss : 0;
            const rich = next && wallet >= price;
            const cy = top + i * (h + 12) + h / 2;
            const max = branch.levels.length;
            const step = Math.min(22, (w - 150) / max);
            const pips = Array.from({ length: max }, (_, k) =>
                `<circle cx="${(-w / 2 + 64 + k * step).toFixed(1)}" cy="8" r="5"
                         fill="${k < level ? C.kiss[300] : C.night[500]}"/>`).join('');
            const cost = next
                ? `<text x="${(w / 2 - 14).toFixed(0)}" y="6" text-anchor="end" font-size="19"
                         font-weight="700" fill="${rich ? C.kiss[300] : C.night[500]}">${price}</text>
                   <text x="${(w / 2 - 22 - String(price).length * 12).toFixed(0)}" y="5"
                         text-anchor="end" font-size="14">💋</text>`
                : `<text x="${(w / 2 - 20).toFixed(0)}" y="8" text-anchor="end" font-size="22"
                         fill="${C.gold[300]}">✓</text>`;
            return `<g class="pr-boost${rich ? ' rich' : ''}" data-boost="${key}"
                       transform="translate(${((x0 + x1) / 2).toFixed(0)},${cy.toFixed(0)})">
                <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="14"
                      fill="${C.night[900]}" fill-opacity="0.9"
                      stroke="${rich ? C.kiss[500] : C.rail[700]}" stroke-width="${rich ? 2.2 : 1.6}"/>
                <text x="${(-w / 2 + 20).toFixed(0)}" y="0" font-size="26">${branch.emoji}</text>
                ${pips}${cost}</g>`;
        }).join('');
    },

    // ---------- ПОКУПКИ ----------
    // Решает всё та же сторона, что и всегда: клиент говорит «купи вот это»,
    // а хватает ли валюты — отвечает Backend (инвариант 2).
    buyBoost(key) {
        const answer = Backend.buyUpgrade(key, 'pride');
        if (!answer.ok) { this.deny(`.pr-boost[data-boost="${key}"]`); return; }
        this.resetRun();          // числа следующего выхода изменились
        this.renderAll();
    },

    // Тап по предмету наряда: не куплен — покупаем, куплен — надеваем,
    // надет — снимаем. Одно и то же место, три состояния, ни одной кнопки.
    tapItem(itemId) {
        const item = PRIDE_WARDROBE.items.find(i => i.id === itemId);
        if (!item) return;
        if (!(GameState.data.wardrobe || {})[itemId]) {
            const answer = Backend.buyWardrobe(itemId);
            if (!answer.ok) { this.deny(`.pr-item[data-item="${itemId}"]`); return; }
        } else {
            Backend.wearCosmetic(item.slot, GameState.data.cosmetics[item.slot] === itemId ? null : itemId);
        }
        this.refreshWorm();
        this.renderAll();
    },

    // Тап по слоту в костюмерной: перебирает купленное для этого слота по
    // кругу — надето → следующее → голо. Ничего не куплено — открываем
    // витрину: игроку показали место и сразу показали, чем его заполнить.
    tapSlot(slotKey) {
        const owned = PRIDE_WARDROBE.items
            .filter(i => i.slot === slotKey && (GameState.data.wardrobe || {})[i.id]);
        if (!owned.length) { this.storeOpen = true; this.storeTab = 'wear'; this.renderStore(); return; }
        const now = (GameState.data.cosmetics || {})[slotKey] || null;
        const idx = owned.findIndex(i => i.id === now);
        const next = idx + 1 >= owned.length ? null : owned[idx + 1].id;
        Backend.wearCosmetic(slotKey, next);
        this.refreshWorm();
        this.renderAll();
    },

    // Наряд живёт в модели персонажа, значит смена наряда — это пересборка
    // модели. Здесь же перекладывается и главный червь на экране комнаты:
    // купленное носится ВЕЗДЕ, и увидеть это игрок должен сразу.
    refreshWorm() {
        this.mountWorm();
        requestAnimationFrame(() => requestAnimationFrame(() => {
            this.layoutWorm();
            this.renderUI();
        }));
        if (window.MainWormHandle && window.WormModelAPI) {
            const m = window.WormModelAPI.loadWormModel();
            if (typeof wormMarksFromState === 'function') m.scars = wormMarksFromState();
            window.MainWormHandle.update(m);
        }
    },

    // Отказ показывается там же, где нажали: карточка дёргается и остаётся
    // тусклой. Текста «не хватает» нет и быть не может (инвариант 9).
    deny(selector) {
        const el = this.screenElement.querySelector(selector);
        if (!el) return;
        el.classList.remove('pr-deny');
        void el.getBBox();
        el.classList.add('pr-deny');
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PrideMinigame.init());
} else {
    PrideMinigame.init();
}
