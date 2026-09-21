// ================= СТУДИЯ: ОТДЕЛЬНЫЙ ЭКРАН РЕДАКТОРА ВНЕШНОСТИ =================
// Шаг 4 перехода к визуальному управлению. Инспектор и пульт уже есть, но
// работали они ПОВЕРХ ИГРЫ: червь при этом ходит по комнате, стоит в
// натуральную величину, а половину экрана занимает панель. Пальцем в глаз
// такому червю не попасть — это пиксель-хантинг мышкой, а правят внешность
// чаще с телефона.
//
// Студия снимает сразу три помехи:
//   1. Персонаж СВОЙ и неподвижный. Не тот, что в комнате: у того своя
//      жизнь, и останавливать её ради правки — значит останавливать игру.
//   2. Камера наезжает. Зум — это viewBox КОРНЕВОГО svg, а не css-масштаб:
//      через viewBox умеют считать и SvgSpace, и перевод «экран → сцена» в
//      WormParts, поэтому палец попадает туда, куда целились. CSS-масштаб
//      предка дал бы ровно ту ловушку, из-за которой существует svg-space.js.
//   3. Выбирать можно СПИСКОМ, а не тыком. Тык оставлен (он быстрее, когда
//      видно, куда тыкать), но всё, во что трудно попасть, лежит рядами
//      крупных плиток. Плитка — 44 точки минимум: это нижняя граница, ниже
//      которой палец промахивается.
//
// Рендерер о студии не знает: она только монтирует его обычным mount() и
// правит внешность через WormLook. Убери файл — ничего не изменится.

// Плитки по рядам. Ряд — не «папка», а ответ на вопрос «что я сейчас
// правлю»: лицо, череп, тело, кожа. Свет стоит отдельным рядом, потому что
// он ничей: один на всю сцену и не лежит в модели.
// ---------- ЧТО ПОКАЗЫВАТЬ В КАЖДОМ РЯДУ ----------
// Плитка на КАЖДУЮ сторону — это по тринадцать штук в ряду черепа: ряд
// уезжает за край, и найти в нём что-нибудь нельзя. Между тем правая скула
// правится ровно так же, как левая, и ручки у них общие; врозь они живут
// только в перекосе и в форме, а туда попадают НЕ плиткой, а пальцем по
// самой ручке на персонаже.
//
// Поэтому парные вещи стоят одной плиткой, и та ведёт на левую. Вторая
// сторона — либо тык в персонажа, либо кнопка «⇄» рядом с ручками: она
// появляется сама, когда у выбранного есть близнец.
const WORM_STUDIO_ROWS = [
    { key: 'face',  title: 'лицо', keys: [
        { k: 'eye-left',  t: 'глаза' },
        { k: 'brow-left', t: 'брови' },
        { k: 'ear-left',  t: 'уши' },
        { k: 'snout' }, { k: 'mouth' }, { k: 'jaw' } ] },
    { key: 'skull', title: 'череп', keys: [
        { k: 'head' }, { k: 'crown' },
        { k: 'forehead-left',    t: 'лоб' },
        { k: 'temple-left',      t: 'виски' },
        { k: 'cheek-left',       t: 'скулы' },
        { k: 'jowl-left',        t: 'брыли' },
        { k: 'muzzle-edge-left', t: 'морда' },
        { k: 'chin' } ] },
    { key: 'body',  title: 'тело', keys: [
        { k: 'segment-1' }, { k: 'segment-2' }, { k: 'belly' }, { k: 'tail' },
        { k: 'growing-1' }, { k: 'growing-2' }, { k: 'growing-3' }, { k: 'growing-4' } ] },
    { key: 'skin',  title: 'кожа', keys: [
        { k: 'surface-layer' }, { k: 'coat-layer' }, { k: 'skin-tone' },
        { k: 'body-rings' }, { k: 'muscle-layer' }, { k: 'organ-layer' },
        { k: 'gut-tract' }, { k: 'scar-layer' }, { k: 'hull-outline' } ] },
    // У света своего предмета нет: он один на сцену и ничему не принадлежит.
    // Плиток в этом ряду поэтому не бывает вовсе — сразу ручки.
    { key: 'light', title: 'свет', knobs: ['volume', 'contrast', 'lightAngle', 'relief'] }
];

// Ориентиры черепа — те самые точки контура, за которые его тянут. Держим
// список здесь: в студии он нужен целиком (рисуются ВСЕ разом, иначе форму
// не видно), а WormParts отдаёт по одной.
const WORM_STUDIO_SKULL = [
    'crown', 'forehead-left', 'forehead-right', 'temple-left', 'temple-right',
    'cheek-left', 'cheek-right', 'jowl-left', 'jowl-right',
    'muzzle-edge-left', 'muzzle-edge-right', 'chin'
];

// Точки контура уха — то же самое для уха. Показываются все пять разом:
// форму не правят по одной точке, её видно только целиком.
const WORM_STUDIO_EAR = ['ear-base', 'ear-front', 'ear-tip', 'ear-break', 'ear-lobe'];

// Звенья цепочки: их обхваты показываются все разом, как ориентиры черепа.
// Профиль силуэта — «где толще, где тоньше» — единственное, что видно
// только целиком: один горб посреди ровного тела читается как ошибка, а
// тот же горб в череде сужений — как фигура.
const WORM_STUDIO_CHAIN = ['segment-1', 'segment-2', 'belly'];

const WormStudio = {
    on: false,
    root: null,
    handle: null,
    row: 'face',
    picked: null,       // ключ выбранной сущности ('' = ряд света)
    frozen: true,
    // Ручки контура не переключаются кнопкой: они появляются сами у того,
    // у кого есть что тянуть, и УХОДЯТ на время движения ползунка — там
    // смотрят на результат, а дюжина кружков поверх морды мешает смотреть.
    busy: 0,            // метка времени последнего движения ползунка
    drag: null,
    cam: null,          // текущее положение камеры (единицы viewBox)
    camTo: null,        // куда едет
    raf: 0,
    knobsFor: null,

    // ---------- ОТКРЫТЬ ----------
    open() {
        if (this.on) return;
        if (typeof WormRenderer === 'undefined' || typeof WormModelAPI === 'undefined') return;
        this.build();
        this.on = true;
        this.root.classList.add('active');
        // Панель состояния и панель инспектора уходят: студия — отдельный
        // экран, а не ещё один слой поверх игры.
        document.body.classList.add('ws-on');
        const stage = document.getElementById('game-container');
        if (stage) stage.classList.add('ws-open');
        this.mount();
        this.syncYawRange();
        this.frameAll(true);
        // Открываемся на голове: её правят чаще всего, а пустой ряд ручек
        // выглядит сломанным инструментом.
        this.row = 'skull';
        this.select('head');
        this.tick();
    },

    close() {
        if (!this.on) return;
        this.on = false;
        if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
        // Правка уезжает в игру: в студии её и делали ради игры. Патч при
        // этом остаётся в пульте — студия ничего не хранит у себя.
        const main = window.MainWormHandle;
        if (main && typeof WormLook !== 'undefined') WormLook.push(main, { immediate: true });
        if (this.handle) { this.handle.destroy(); this.handle = null; }
        this.root.classList.remove('active');
        document.body.classList.remove('ws-on');
        const stage = document.getElementById('game-container');
        if (stage) stage.classList.remove('ws-open');
    },

    toggle() { this.on ? this.close() : this.open(); },

    // ---------- РАЗМЕТКА ----------
    build() {
        if (this.root) { this.place(); return; }
        this.root = document.createElement('div');
        this.root.id = 'ws-root';
        // ---------- ЧТО ГДЕ ЛЕЖИТ ----------
        // Первая версия держала на экране всё сразу: шесть кнопок в шапке,
        // два ряда плиток, пять ручек и ракурс — и всё это не влезало в
        // холст Telegram (514 точек), где ракурс уезжал на 79 точек ниже
        // экрана, а персонажу оставалось 221.
        //
        // Разложено по принадлежности, и это же решает тесноту:
        //   шапка   — только выход и ИМЯ выбранного. Откат и сброс тут же,
        //             но лишь когда есть что откатывать;
        //   рейка   — то, что про ВЗГЛЯД, а не про правку: стоп, наезд,
        //             отъезд, «целиком». Поверх вида, а не в панели: место
        //             внизу дорого, а вид пустой по краям;
        //   панель  — только про ПРАВКУ: где я в персонаже и что кручу.
        //             Ракурс живёт здесь же, но появляется лишь на голове:
        //             для тела и кожи он ничего не значит.
        this.root.innerHTML = `
            <div class="ws-top">
                <button class="ws-icon" data-act="close" title="закрыть">✕</button>
                <div class="ws-title" data-out="title">студия</div>
                <button class="ws-icon ws-twin" data-act="twin" data-out="twin" title="другая сторона">⇄</button>
                <div class="ws-edits" data-out="edits">
                    <span class="ws-count" data-out="steps"></span>
                    <button class="ws-icon" data-act="undo" title="откат">↶</button>
                    <button class="ws-icon" data-act="reset" title="сбросить всё">⟲</button>
                </div>
            </div>
            <div class="ws-view">
                <div class="ws-worm"></div>
                <svg class="ws-fx"></svg>
                <div class="ws-rail">
                    <button class="ws-icon" data-act="freeze" title="остановить персонажа">⏸</button>
                    <button class="ws-icon" data-act="zoom-in">+</button>
                    <button class="ws-icon" data-act="zoom-out">−</button>
                    <button class="ws-icon" data-act="zoom-all" title="целиком">⛶</button>
                </div>
            </div>
            <div class="ws-sheet">
                <div class="ws-nav" data-out="nav"></div>
                <div class="ws-knobs" data-out="knobs"></div>
                <div class="ws-foot" data-out="foot">
                    <span class="ws-lbl">ракурс</span>
                    <input type="range" data-in="yaw" min="-0.5" max="0.5" step="0.02" value="0">
                    <button class="ws-icon" data-act="yaw-auto" title="автоматика">↻</button>
                </div>
            </div>`;
        // ---------- ВНУТРИ ХОЛСТА, А НЕ ПОВЕРХ ОКНА ----------
        // Панель инспектора лежит в <body> и стоит по прямоугольнику холста
        // — ей так и надо: она маленькая накладка поверх игры.
        //
        // Студия — ЭКРАН во весь холст, и в <body> она верстается в пикселях
        // ЭКРАНА. А холст масштабируется под окно (инвариант 11): в Telegram
        // на айфоне масштаб выходит 0.6, и экран студии, оставаясь 390
        // единиц по замыслу, получал 238 настоящих пикселей. Раскладка в
        // них не влезала: подписи ручек резало на «размер го…», значения на
        // «+0».
        //
        // Внутри `#game-container` этой беды нет по построению: там единицы
        // холста, 390×844, и масштаб накладывается на всё разом — ровно как
        // на игру. Заодно исчезает вопрос про безопасную зону: холст уже
        // стоит в ней целиком и вычитается она ровно один раз (ловушка 134).
        const stage = document.getElementById('game-container') || document.body;
        stage.appendChild(this.root);
        this.wormHost = this.root.querySelector('.ws-worm');
        this.fx = this.root.querySelector('.ws-fx');

        this.root.addEventListener('click', (e) => this.onClick(e));
        this.root.addEventListener('input', (e) => this.onInput(e));
        const view = this.root.querySelector('.ws-view');
        view.addEventListener('pointerdown', (e) => this.onDown(e));
        window.addEventListener('pointermove', (e) => this.onMove(e));
        window.addEventListener('pointerup', () => this.onUp());
        window.addEventListener('pointercancel', () => this.onUp());
        window.addEventListener('resize', () => this.place());
        if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.place());
        this.place();
    },

    // Внутри холста ставить нечего: `inset: 0` и есть «по холсту». Метод
    // остался затем, что его зовут снаружи (поворот телефона, смена высоты
    // окна в Telegram) — и затем, что студия, открытая ДО появления холста,
    // должна в него переехать.
    place() {
        if (!this.root) return;
        const stage = document.getElementById('game-container');
        if (stage && this.root.parentNode !== stage) stage.appendChild(this.root);
    },

    // ---------- СВОЙ ПЕРСОНАЖ ----------
    // Не тот, что в комнате. У комнатного своя жизнь: он ходит, дышит и
    // моргает, а правят внешность по НЕПОДВИЖНОМУ — в движущуюся цель не
    // попасть ни пальцем, ни глазом.
    mount() {
        const model = WormModelAPI.loadWormModel();
        this.handle = WormRenderer.mount(this.wormHost, model, {
            context: 'studio',
            room: false,
            wander: false,
            blink: !this.frozen,
            idleWave: !this.frozen,
            frameHz: 30,
            anchorX: 0.5,
            anchorY: 0.52
        });
        // Накопленный патч пульта на своего червя: студия открывается там же,
        // где её закрыли.
        if (typeof WormLook !== 'undefined') WormLook.push(this.handle, { immediate: true });
    },

    // ---------- РАКУРС: ЧУЖОЙ ПРЕДЕЛ, А НЕ СВОЙ ----------
    // Ползунок ходил до ±1, а игра дальше ±0.5 голову не поворачивает
    // НИКОГДА — ни автоповоротом, ни позами. Получалось, что внешность
    // правят на ракурсах, которых в игре не бывает: 42° против 21°.
    //
    // Предел спрашивается у рендерера, а не пишется здесь числом: два
    // предела рано или поздно разъедутся, и разъехались бы молча.
    syncYawRange() {
        const r = this.root.querySelector('[data-in="yaw"]');
        if (!r || !this.handle || typeof this.handle.getHeadPose !== 'function') return;
        const L = this.handle.getHeadPose().limit;
        if (!(L > 0)) return;
        r.min = String(-L);
        r.max = String(L);
        r.step = String(+(L / 25).toFixed(4));
    },

    // ---------- КАМЕРА ----------
    // Зум — это viewBox корневого svg. Не css-трансформация: через viewBox
    // умеет считать SvgSpace, а css-масштаб предка WebKit в getScreenCTM не
    // учитывает, и палец начал бы промахиваться ровно на величину наезда.
    // Рейка стоит ПОВЕРХ вида, то есть отъедает у него полосу справа.
    // Камера обязана про неё знать: иначе предмет, честно поставленный в
    // середину кадра, наполовину оказывается под кнопками.
    RAIL: 52,

    box() {
        const c = this.wormHost;
        return { w: Math.max(1, c.clientWidth), h: Math.max(1, c.clientHeight) };
    },

    // Свободная часть кадра и её середина — в единицах viewBox.
    free() {
        const b = this.box();
        const k = this.cam ? this.cam.z : 1;
        return { w: Math.max(40, b.w - this.RAIL), h: b.h, shift: this.RAIL / 2 / k };
    },

    applyCam() {
        if (!this.handle || !this.cam) return;
        const b = this.box();
        const w = b.w / this.cam.z, h = b.h / this.cam.z;
        const vb = `${(this.cam.x - w / 2).toFixed(2)} ${(this.cam.y - h / 2).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`;
        // Рендерер переписывает viewBox при каждом изменении размера окна —
        // значит студия обязана ставить свой не однажды, а каждый кадр.
        // Сравнение строкой: лишняя запись атрибута стоит пересчёта всего
        // поддерева.
        if (this.handle.svgRoot.getAttribute('viewBox') !== vb) {
            this.handle.svgRoot.setAttribute('viewBox', vb);
        }
        if (this.fx.getAttribute('viewBox') !== vb) this.fx.setAttribute('viewBox', vb);
    },

    // Габарит персонажа в единицах viewBox. Через экранный прямоугольник и
    // SvgSpace, а не через getBBox: getBBox отвечает в координатах ГРУППЫ, а
    // у группы червя свой трансформ, и ответ поехал бы на величину этого
    // трансформа.
    wormBox() {
        if (!this.handle) return null;
        const root = this.handle.svgRoot.querySelector('.worm-root');
        if (!root || typeof SvgSpace === 'undefined') return null;
        const r = root.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        const a = SvgSpace.fromClient(this.handle.svgRoot, r.left, r.top);
        const b = SvgSpace.fromClient(this.handle.svgRoot, r.right, r.bottom);
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
                 w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    },

    frameAll(instant) {
        const b = this.box();
        if (!this.cam) this.cam = { x: b.w / 2, y: b.h / 2, z: 1 };
        const wb = this.wormBox();
        if (!wb) { this.camTo = { x: b.w / 2, y: b.h / 2, z: 1 }; if (instant) this.cam = Object.assign({}, this.camTo); this.applyCam(); return; }
        // Персонаж занимает экран, но с полями: вплотную к кромке ничего не
        // разглядеть, а ручки контура должны куда-то лечь.
        const f = this.free();
        const z = Math.max(0.5, Math.min(8, Math.min(f.w / (wb.w * 1.25), f.h / (wb.h * 1.15))));
        // Сдвиг вправо в единицах viewBox зависит от зума, поэтому считается
        // ПОСЛЕ него, а не из this.cam (там ещё старый).
        this.camTo = { x: wb.x + this.RAIL / 2 / z, y: wb.y, z };
        if (instant) this.cam = Object.assign({}, this.camTo);
        this.applyCam();
    },

    // Наезд на выбранную вещь. Ради этого студия и затевалась: «выбрал ухо —
    // камера подъехала к уху», а не «ищи ухо в персонаже размером с ноготь».
    frameEntity(key) {
        if (!this.handle || typeof WormParts === 'undefined') return;
        // Ориентир черепа — точка, и наезжать НА НЕЁ нельзя: форму тянут,
        // глядя на весь контур сразу, а не на один его миллиметр. Камера
        // показывает голову целиком, а выбранная точка просто подсвечена.
        if (this.isSkullish(key)) key = 'head';
        const ear = this.earOf(key);
        if (ear) key = 'ear-' + ear;
        // Профиль правят, глядя на ВСЁ тело: наезд на одно звено прячет
        // соседей, а горб читается только в череде сужений.
        if (this.isChainish(key)) { this.frameAll(); return; }
        const p = WormParts.at(this.handle, key);
        if (!p) return;
        const b = this.box();
        const e = WormParts.get(key);
        // Во сколько раз наезжать, зависит от размера вещи. У ориентира
        // размера нет вовсе (это точка), поэтому ему назначен свой.
        let span = 90;
        if (e && e.kind !== 'landmark' && p.el) {
            try {
                const r = p.el.getBoundingClientRect();
                const f = SvgSpace.fit(this.handle.svgRoot);
                // Полтора габарита: вещь занимает экран, но вокруг неё видно,
                // к чему она крепится. Без этого поля правишь ухо, не видя
                // головы, и форма расходится с соседями.
                span = Math.max(40, Math.max(r.width, r.height) / (f.m * f.k) * 1.5);
            } catch (err) { /* не нашли габарит — останется умолчание */ }
        }
        const f = this.free();
        const z = Math.max(0.6, Math.min(8, Math.min(f.w, f.h) / span));
        this.camTo = { x: p.x + this.RAIL / 2 / z, y: p.y, z };
    },

    // ---------- ПОКАДРОВОЕ ----------
    tick() {
        if (!this.on) return;
        this.raf = requestAnimationFrame(() => this.tick());
        if (this.cam && this.camTo) {
            // Камера ПОДЪЕЗЖАЕТ, а не прыгает: прыжок не показывает, куда
            // именно она приехала, и выбор вещи читается как смена экрана.
            const k = 0.18;
            this.cam.x += (this.camTo.x - this.cam.x) * k;
            this.cam.y += (this.camTo.y - this.cam.y) * k;
            this.cam.z += (this.camTo.z - this.cam.z) * k;
        }
        this.applyCam();
        this.drawHandles();
    },

    // ---------- РУЧКИ КОНТУРА ----------
    // Главное отличие студии от инспектора: форму черепа тянут ЗА ТОЧКИ
    // КОНТУРА, а не ползунками. Точки настоящие — те же, по которым
    // worm-silhouette строит кривую, поэтому «потянул за скулу» и «череп
    // стал шире в этом месте» — одно и то же действие.
    drawHandles() {
        if (!this.fx) return;
        const h = this.handle;
        if (!h || typeof WormParts === 'undefined') { this.fx.innerHTML = ''; return; }
        const want = [];
        const ear = this.earOf(this.picked);
        if (this.isChainish(this.picked)) {
            this.chainKeys().forEach(k => want.push({ key: k }));
        } else if (ear) {
            WORM_STUDIO_EAR.forEach(k => want.push({ key: k + '-' + ear }));
        } else if (this.picked && this.isSkullish(this.picked)) {
            WORM_STUDIO_SKULL.forEach(k => want.push({ key: k }));
        } else if (this.picked) {
            want.push({ key: this.picked });
        }
        const r = 1 / (this.cam ? this.cam.z : 1);   // ручка одного размера НА ЭКРАНЕ
        let html = '';
        want.forEach(w => {
            const p = WormParts.at(h, w.key);
            if (!p) return;
            // Выбранная ручка белая. Сверяем ПРЕДМЕТОМ, а не ключом: на
            // животе выбран `belly`, а ручка зовётся `girth-belly`, и по
            // ключу не совпадало бы ничего — все ручки стояли одинаковыми,
            // и какую сейчас правят, было не видно.
            const sel = w.key === this.picked || this.sameSubject(w.key, this.picked)
                     || this.sameSubject(this.picked, w.key);
            html += `<circle class="ws-h${sel ? ' sel' : ''}" data-h="${w.key}"
                       cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}"
                       r="${(13 * r).toFixed(2)}" stroke-width="${(2 * r).toFixed(2)}"></circle>`;
        });
        this.fx.innerHTML = html;
        // Пока крутят ползунок — ручки уходят. Смотрят в этот момент на
        // результат, и дюжина кружков поверх морды ровно тому и мешает.
        // Возвращаются сами, через полсекунды после последнего движения:
        // отдельной кнопкой это было бы ещё одним переключателем, который
        // надо не забыть выключить.
        this.fx.classList.toggle('ws-away', Date.now() - this.busy < 500);
    },

    isSkullish(key) {
        return key === 'head' || WORM_STUDIO_SKULL.indexOf(key) >= 0;
    },

    // Правим ли сейчас профиль тела: звено цепочки или его обхват.
    isChainish(key) {
        if (!key) return false;
        if (/^girth-/.test(key)) return true;
        return key === 'belly' || /^segment-\d+$/.test(key) || /^growing-\d+$/.test(key);
    },

    // Какие обхваты сейчас есть на экране. Растущих сегментов бывает от нуля
    // до десяти, поэтому список считается от персонажа, а не пишется руками.
    chainKeys() {
        const out = WORM_STUDIO_CHAIN.map(k => 'girth-' + k);
        for (let i = 1; i <= 12; i++) out.push('girth-growing-' + i);
        return out.filter(k => WormParts.get(k) && WormParts.at(this.handle, k));
    },

    // Какое ухо сейчас правим: само ухо или любая точка его контура.
    earOf(key) {
        if (!key) return null;
        if (key === 'ear-left' || key === 'ear-right') return key.replace('ear-', '');
        const m = /^(?:ear-(?:base|front|tip|break|lobe))-(left|right)$/.exec(key);
        return m ? m[1] : null;
    },

    // ---------- ПАЛЕЦ ПО ПЕРСОНАЖУ ----------
    onDown(e) {
        if (!this.on || !this.handle) return;
        // Ручка контура под пальцем — берём её и тянем.
        const hit = document.elementsFromPoint(e.clientX, e.clientY)
            .find(el => el.classList && el.classList.contains('ws-h'));
        if (hit) {
            const key = hit.getAttribute('data-h');
            this.select(key, { noZoom: true });
            const ent = WormParts.get(key);
            if (ent && ent.girth) {
                // Замер чувствительности здесь не нужен: обхват — это и есть
                // расстояние от середины звена до кромки, и новое значение
                // выходит отношением «куда тянут» к «где сейчас».
                WormLook.formStep();
                const p = WormParts.at(this.handle, key);
                const c = p && p.centre ? SvgSpace.toClient(this.handle.svgRoot, p.centre.x, p.centre.y) : null;
                const e0 = p ? SvgSpace.toClient(this.handle.svgRoot, p.x, p.y) : null;
                this.drag = (c && e0)
                    ? { girth: ent.girth, key, cy: c.y, was: Math.abs(c.y - e0.y),
                        v0: (WormLook.girth && WormLook.girth[ent.girth.path]) || 0 }
                    : null;
                if (!this.drag) this.title('нечем двигать');
            } else if (ent && ent.form) {
                // Точку контура не «двигают ручкой»: палец переводится прямо
                // в местные координаты части, и сдвиг считается вычитанием.
                // Замер чувствительности здесь был бы вторым описанием того
                // же — и врал бы на повороте головы.
                WormLook.formStep();
                this.drag = { form: ent.form, key, host: ent.form.host };
            } else {
                this.drag = WormLook.dragStart(this.handle, key);
                if (!this.drag) this.title('нечем двигать');
            }
            e.preventDefault();
            return;
        }
        // Иначе — обычный тык в персонажа.
        const st = WormParts.stack(this.handle, e.clientX, e.clientY);
        if (!st.length) return;
        this.select(st[0].entity.key);
        e.preventDefault();
    },

    onMove(e) {
        if (!this.drag || !this.handle) return;
        if (this.drag.girth) { this.dragGirth(e.clientY); return; }
        if (this.drag.form) { this.dragForm(e.clientX, e.clientY); return; }
        WormLook.dragTo(this.handle, this.drag, e.clientX, e.clientY);
        this.syncKnobs();
    },

    // Тянем верхнюю кромку звена: во сколько раз палец дальше от середины,
    // во столько же раз толще становится звено. Множитель накапливается на
    // том, что уже стояло, — иначе второе перетаскивание отсчитывало бы от
    // исходного и отменяло первое.
    dragGirth(cy) {
        const d = this.drag;
        if (!d.was) return;
        const want = Math.abs(d.cy - cy);
        const k = Math.max(0.2, Math.min(2.5, want / d.was));
        WormLook.setGirth(this.handle, d.girth.path, (1 + d.v0) * k - 1);
    },

    // Палец → местные координаты части → сдвиг относительно задуманной
    // точки. Зеркало левой стороны снимается тем же множителем, каким оно
    // накладывается при рисовании: иначе левое ухо тянулось бы в обратную
    // сторону (ловушка «сторону проверяют, а не выводят в уме»).
    dragForm(cx, cy) {
        const el = this.handle.svgRoot.querySelector(`.worm-root [data-part="${this.drag.host}"]`);
        if (!el) return;
        const loc = WormParts.localIn(this.handle, el, cx, cy);
        if (!loc) return;
        const base = (typeof WORM_EAR_ANCHORS !== 'undefined')
            ? WORM_EAR_ANCHORS.find(a => a.key === this.drag.form.point) : null;
        if (!base) return;
        const s = this.drag.form.side;
        WormLook.setForm(this.handle, this.drag.host, this.drag.form.point,
                         loc.x * s - base.x, loc.y - base.y);
    },

    onUp() {
        if (!this.drag) return;
        this.drag = null;
        if (typeof WormLook !== 'undefined') WormLook.flush();
        this.renderKnobs(true);
    },

    // ---------- ВЫБОР ----------
    select(key, opts) {
        this.picked = key;
        // Ряд переключается САМ на тот, где лежит выбранное. Иначе тык в ухо
        // оставляет открытым ряд черепа, и плитка выбранной вещи не видна:
        // экран показывает одно, а правишь другое.
        const row = WORM_STUDIO_ROWS.find(r => r.keys && r.keys.some(c => this.sameSubject(c.k, key)));
        if (row) this.row = row.key;
        const e = (typeof WormParts !== 'undefined') ? WormParts.get(key) : null;
        this.title(e ? e.title : key);
        if (!(opts && opts.noZoom)) this.frameEntity(key);
        this.renderNav();
        this.renderKnobs(true);
    },

    title(text) {
        const out = this.root.querySelector('[data-out="title"]');
        if (out) out.textContent = text;
    },

    // ---------- НАВИГАЦИЯ: ОДИН ЯРУС ----------
    // Было два ряда сразу: пять разделов и плитки открытого раздела. Вместе
    // они съедали девяносто точек из двухсот пятнадцати, которые есть у
    // панели в холсте Telegram, — то есть почти половину места отдавали
    // тому, что уже выбрано и менять его не собираются.
    //
    // Теперь ярус один: либо разделы, либо «‹ раздел» и его части. Куда
    // нажали, там и стоишь, а название раздела написано на кнопке возврата —
    // потеряться негде.
    renderNav() {
        const nav = this.root.querySelector('[data-out="nav"]');
        if (!this.row) {
            nav.innerHTML = WORM_STUDIO_ROWS.map(r =>
                `<button data-row="${r.key}">${r.title}</button>`).join('');
            nav.scrollLeft = 0;
            return;
        }
        const row = WORM_STUDIO_ROWS.find(r => r.key === this.row);
        if (!row) { this.row = null; this.renderNav(); return; }
        let html = `<button data-row="" class="ws-back">‹ ${row.title}</button>`;
        // Показываем только то, что СЕЙЧАС есть на экране: растущих сегментов
        // может не вырасти, ухо бывает спрятано шляпой. Плитка, ведущая в
        // никуда, хуже отсутствующей.
        (row.keys || []).forEach(c => {
            const e = (typeof WormParts !== 'undefined') ? WormParts.get(c.k) : null;
            if (!e) return;
            if (this.handle && !WormParts.at(this.handle, c.k)) return;
            const on = this.sameSubject(c.k, this.picked);
            html += `<button data-chip="${c.k}" class="${on ? 'on' : ''}">${c.t || e.title}</button>`;
        });
        nav.innerHTML = html;

        // Выбранная плитка подъезжает в середину ряда. Без этого тык в
        // персонажа переключал раздел, а сама плитка оставалась за краем — и
        // выходило, что выбранного на экране не видно вовсе.
        // Считаем сдвиг руками, а не scrollIntoView: тот заодно прокручивает
        // всех предков, а студия — экран, который не скроллится.
        const on = nav.querySelector('.on');
        if (on) nav.scrollLeft = Math.max(0, on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2);
    },

    // ---------- ОДИН ЛИ ЭТО ПРЕДМЕТ ----------
    // Плитка «скулы» обязана гореть и на левой скуле, и на правой, и на
    // голове, когда тянут её контур. Иначе экран показывает одно, а правят
    // другое — а это первое, на что смотрит глаз.
    sameSubject(chipKey, picked) {
        if (!chipKey || !picked) return false;
        if (chipKey === picked) return true;
        if (this.twin(picked) === chipKey) return true;
        const ear = this.earOf(picked);
        if (ear) return chipKey === 'ear-' + ear || chipKey === 'ear-left';
        if (this.isChainish(picked)) return picked.replace(/^girth-/, '') === chipKey;
        // Контур черепа тянут, оставаясь «на голове»: точка сама по себе
        // плитки не имеет.
        if (this.isSkullish(picked) && chipKey === 'head') return picked === 'head';
        return false;
    },

    // Близнец с другой стороны: у пар это половина смысла экрана, а отдельной
    // плитки им не полагается — ряд от этого уезжал за край.
    twin(key) {
        if (!key) return null;
        if (/-left$/.test(key)) return key.replace(/-left$/, '-right');
        if (/-right$/.test(key)) return key.replace(/-right$/, '-left');
        return null;
    },

    // ---------- РУЧКИ ----------
    // Ползунок плюс две кнопки шага. Ползунок хорош для «примерно», кнопки —
    // для «ещё чуть-чуть»: пальцем по ползунку точнее 0.05 не попасть, а
    // доводка нужна именно такая.
    knobKeys() {
        if (this.row === 'light') {
            return (WORM_STUDIO_ROWS.find(r => r.key === 'light').knobs || []);
        }
        const e = this.picked && typeof WormParts !== 'undefined' ? WormParts.get(this.picked) : null;
        if (!e) return [];
        return (e.knobs || []).filter(k => WormLook.knob(k));
    },

    // Обхват выбранного звена — своя строка ползунка, как перекос у черепа.
    // Без неё панель после перетаскивания стоит на нуле и выглядит
    // сломанной: правка есть, а показать её нечем.
    girthKey() {
        const e = this.picked && typeof WormParts !== 'undefined' ? WormParts.get(this.picked) : null;
        return (e && e.girth) ? e.girth.path : null;
    },

    skewKey() {
        const e = this.picked && typeof WormParts !== 'undefined' ? WormParts.get(this.picked) : null;
        if (!e || e.kind !== 'landmark' || !e.skull || e.skull.side === 0) return null;
        const name = { forehead: 'brow', temple: 'temple', cheek: 'cheek',
                       jowl: 'jaw', 'muzzle-edge': 'muzzle' }[e.key.replace(/-(left|right)$/, '')];
        return name ? name + (e.skull.side < 0 ? 'L' : 'R') : null;
    },

    renderKnobs(force) {
        const host = this.root.querySelector('[data-out="knobs"]');
        const sig = this.row + '|' + (this.picked || '');
        // Пересобираем ряд ТОЛЬКО когда сменилось выбранное: пересобранный
        // под пальцем ползунок обрывает жест (docs/traps.md, п. 139).
        if (!force && sig === this.knobsFor) { this.syncKnobs(); return; }
        this.knobsFor = sig;

        const rows = [];
        const gk = this.girthKey();
        if (gk) {
            const v = (WormLook.girth && WormLook.girth[gk]) || 0;
            rows.push(this.knobRow('обхват', `data-girth="${gk}"`, v, -0.8, 1.5, false));
        }
        const sk = this.skewKey();
        if (sk) {
            const v = (WormLook.skew && WormLook.skew[sk]) || 0;
            rows.push(this.knobRow('перекос', `data-skew="${sk}"`, v, -0.6, 0.6, false));
        }
        this.knobKeys().forEach(key => {
            const k = WormLook.knob(key);
            const v = WormLook.values[key] || 0;
            rows.push(this.knobRow(k.title, `data-knob="${key}"`, v, -1, 1, WormLook.isLocked(key)));
        });
        host.innerHTML = rows.length ? rows.join('')
            : '<div class="ws-dim">у этой вещи ручек нет — её крутят только целиком</div>';
        this.syncSteps();
        this.syncContext();
    },

    // ---------- ЧТО СЕЙЧАС УМЕСТНО ----------
    // Ракурс имеет смысл только на голове: там половина ошибок видна лишь
    // на повороте. Для тела, кожи и света это лишняя строка, которая в
    // холсте Telegram стоила ровно того места, которого не хватало.
    //
    // Откат и сброс — только когда есть что откатывать. Кнопка, которая
    // ничего не делает, обязана отсутствовать, а не быть серой.
    syncContext() {
        // Вторая сторона — кнопкой в шапке, рядом с именем: это про то, КОГО
        // правят, а не про то, что крутят. Плитки у правой скулы нет
        // намеренно — с ней ряд уезжал за край экрана.
        const tw = this.twin(this.picked);
        const swap = this.root.querySelector('[data-out="twin"]');
        if (swap) {
            swap.classList.toggle('ws-hide', !(tw && WormParts.get(tw)));
            if (tw && WormParts.get(tw)) swap.title = WormParts.get(tw).title;
        }
        const foot = this.root.querySelector('[data-out="foot"]');
        if (foot) foot.classList.toggle('ws-hide', !this.headish(this.picked));
        const edits = this.root.querySelector('[data-out="edits"]');
        if (edits) edits.classList.toggle('ws-hide', !Object.keys(WormLook.patch()).length);
    },

    headish(key) {
        if (!key) return this.row === 'face' || this.row === 'skull';
        if (this.isSkullish(key) || this.earOf(key)) return true;
        const e = (typeof WormParts !== 'undefined') ? WormParts.get(key) : null;
        return !!(e && (e.parent === 'head' || e.key === 'head'));
    },

    knobRow(title, attr, v, min, max, locked) {
        return `<div class="ws-knob">
            <span class="ws-lbl">${title}</span>
            <button class="ws-step" data-step="-1" ${attr}>−</button>
            <input type="range" ${attr} min="${min}" max="${max}" step="0.02"
                   value="${v}"${locked ? ' disabled' : ''}>
            <button class="ws-step" data-step="1" ${attr}>+</button>
            <span class="ws-val">${v >= 0 ? '+' : ''}${v.toFixed(2)}</span>
        </div>`;
    },

    // Обновление чисел БЕЗ пересборки ряда. Ползунок, которым сейчас
    // управляют, не трогаем вовсе: запись в value посреди жеста дёргает
    // бегунок.
    syncKnobs() {
        this.root.querySelectorAll('.ws-knob input').forEach(inp => {
            const k = inp.getAttribute('data-knob'), s = inp.getAttribute('data-skew');
            const g = inp.getAttribute('data-girth');
            const v = k ? (WormLook.values[k] || 0)
                    : g ? ((WormLook.girth && WormLook.girth[g]) || 0)
                        : ((WormLook.skew && WormLook.skew[s]) || 0);
            if (document.activeElement !== inp) inp.value = String(v);
            const out = inp.parentNode.querySelector('.ws-val');
            if (out) out.textContent = (v >= 0 ? '+' : '') + v.toFixed(2);
        });
        this.syncSteps();
    },

    syncSteps() {
        const n = Object.keys(WormLook.patch()).length;
        const out = this.root.querySelector('[data-out="steps"]');
        // Цифра без слова: место в шапке меряется буквами, а «правок» тут
        // ничего не объясняет — число стоит рядом с откатом и сбросом.
        if (out) out.textContent = n ? String(n) : '';
        const edits = this.root.querySelector('[data-out="edits"]');
        if (edits) edits.classList.toggle('ws-hide', !n);
    },

    // ---------- КНОПКИ ----------
    onClick(e) {
        const t = e.target;
        if (!t) return;
        const row = t.getAttribute && t.getAttribute('data-row');
        const chip = t.getAttribute && t.getAttribute('data-chip');
        const step = t.getAttribute && t.getAttribute('data-step');
        const act = t.getAttribute && t.getAttribute('data-act');
        if (row) { this.row = row; if (row === 'light') this.picked = null; this.renderNav(); this.renderKnobs(true); return; }
        if (chip) { this.select(chip); return; }
        if (step) { this.bump(t, +step * 0.05); return; }
        if (!act) return;
        if (act === 'twin') { const t = this.twin(this.picked); if (t) this.select(t); return; }
        if (act === 'close') this.close();
        else if (act === 'freeze') this.setFrozen(!this.frozen);
        else if (act === 'undo') { WormLook.undo(this.handle); this.renderKnobs(true); }
        else if (act === 'reset') { WormLook.reset(this.handle); this.renderKnobs(true); }
        else if (act === 'zoom-in') this.zoomBy(1.4);
        else if (act === 'zoom-out') this.zoomBy(1 / 1.4);
        else if (act === 'zoom-all') this.frameAll();
        else if (act === 'yaw-auto') {
            if (this.handle) this.handle.setHeadPose('auto');
            const r = this.root.querySelector('[data-in="yaw"]');
            if (r) r.value = '0';
        }
    },

    bump(btn, d) {
        const k = btn.getAttribute('data-knob'), s = btn.getAttribute('data-skew');
        const g = btn.getAttribute('data-girth');
        if (g) {
            WormLook.setGirth(this.handle, g, ((WormLook.girth && WormLook.girth[g]) || 0) + d);
        } else if (k) {
            WormLook.apply(this.handle, { [k]: d });
        } else if (s) {
            const name = s.slice(0, -1), side = s.slice(-1) === 'L' ? -1 : 1;
            WormLook.setSkew(this.handle, name, side, d);
        }
        WormLook.flush();
        this.syncKnobs();
    },

    onInput(e) {
        const inp = e.target;
        if (!inp || inp.tagName !== 'INPUT') return;
        this.busy = Date.now();
        const v = parseFloat(inp.value);
        if (inp.getAttribute('data-in') === 'yaw') {
            if (this.handle) this.handle.setHeadPose(v);
            return;
        }
        const k = inp.getAttribute('data-knob'), s = inp.getAttribute('data-skew');
        const g = inp.getAttribute('data-girth');
        if (g) WormLook.setGirth(this.handle, g, v);
        else if (k) WormLook.apply(this.handle, { [k]: v }, { absolute: true });
        else if (s) {
            const name = s.slice(0, -1), side = s.slice(-1) === 'L' ? -1 : 1;
            if (!WormLook.skew) WormLook.skew = {};
            WormLook.skew[s] = v;
            WormLook.setSkew(this.handle, name, side, 0);
        } else return;
        // Обновляем ТОЛЬКО число рядом. Пересборка ряда убила бы узел под
        // пальцем — ловушка №139.
        const out = inp.parentNode.querySelector('.ws-val');
        if (out) out.textContent = (v >= 0 ? '+' : '') + v.toFixed(2);
        this.syncSteps();
    },

    zoomBy(k) {
        if (!this.camTo) return;
        this.camTo.z = Math.max(0.5, Math.min(10, this.camTo.z * k));
    },

    // ---------- СТОП ----------
    // Кнопка, которой не хватало сильнее всего: в движущуюся цель не попасть
    // ни пальцем, ни глазом. Дыхание и моргание снимаются опциями рендерера —
    // персонажа не разбирают и не пересобирают, просто следующий кадр
    // считает его неподвижным.
    setFrozen(v) {
        this.frozen = v;
        if (this.handle) this.handle.setOptions({ idleWave: !v, blink: !v, wander: false });
        this.syncIcons();
    },

    syncIcons() {
        const f = this.root.querySelector('[data-act="freeze"]');
        if (f) { f.textContent = this.frozen ? '⏸' : '▶'; f.classList.toggle('on', this.frozen); }

    }
};

if (typeof window !== 'undefined') window.WormStudio = WormStudio;
