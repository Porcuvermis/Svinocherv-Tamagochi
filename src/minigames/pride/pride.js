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
    // Какая полка витрины открыта: ключ слота ('head', 'neck', 'body',
    // 'tail') или 'boost'. Полка «весь наряд одной кучей» была, и на восьми
    // предметах ещё читалась; на трёх десятках она превращается в свалку, где
    // шляпы перемешаны с хвостами. Полка на слот — это тот же порядок, что у
    // самих слотов на червe, только развёрнутый.
    storeTab: 'head',
    // Слот, чей инвентарь сейчас раскрыт в костюмерной. Не витрина: здесь
    // только КУПЛЕННОЕ, и выбирается, что надеть (как карточка слота в лобби
    // гнева, wrath-lobby.js).
    openSlot: null,
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
        this.openSlot = null;
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
        // Видимый кусок холста — в единицах сцены. Считается здесь, потому
        // что здесь уже дёрнута раскладка: второй раз за кадр её трогать
        // нельзя (docs/traps.md).
        const r = parent.getBoundingClientRect();
        const tl = this.fromScreen(r.left, r.top);
        const br = this.fromScreen(r.right, r.bottom);
        this.safe = {
            x0: Math.max(0, tl.x), y0: Math.max(0, tl.y),
            x1: Math.min(PRIDE_ART.W, br.x), y1: Math.min(PRIDE_ART.H, br.y)
        };
        // Единица сцены в пикселях РАСКЛАДКИ, то есть без масштаба холста:
        // им отмасштабирован и сам слой червя, и учесть его дважды значит
        // раздуть персонажа (в Telegram, где масштаб перестал быть единицей,
        // это и вылезало бы). SvgSpace считает обе величины сразу и без
        // getScreenCTM — см. src/core/svg-space.js.
        const p0 = SvgSpace.toLocal(this.svgEl, 0, 0, parent);
        const k = SvgSpace.unit(this.svgEl) || 1;
        // Червь крупнее сцены на WORM_SCALE, поэтому внутри его холста одна
        // единица длиннее единицы сцены ровно во столько же раз — и все
        // сдвиги, которые считаются в единицах сцены, надо делить на это
        // число, прежде чем отдавать рендереру.
        const S = PRIDE_VIEW.WORM_SCALE;
        this.wormHost.style.transform =
            `translate(${p0.x.toFixed(1)}px, ${p0.y.toFixed(1)}px) scale(${(k * S).toFixed(4)})`;

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
    // Через SvgSpace, а не через getScreenCTM: холст вписан в окно с
    // обрезкой, единицы сцены не равны пикселям (docs/traps.md), и вдобавок
    // вся игра лежит в контейнере с css-трансформацией — учитывает ли её CTM,
    // зависит от браузера (src/core/svg-space.js).
    fromScreen(x, y) {
        return SvgSpace.fromClient(this.svgEl, x, y);
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
};

// Запуск — в конце pride-store.js: он подключается последним из продолжений,
// и к этому моменту все методы уже на объекте.
