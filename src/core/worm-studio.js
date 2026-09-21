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
const WORM_STUDIO_ROWS = [
    { key: 'face',  title: 'лицо',
      keys: ['eye-left', 'eye-right', 'brow-left', 'brow-right',
             'ear-left', 'ear-right', 'snout', 'mouth', 'jaw'] },
    { key: 'skull', title: 'череп',
      keys: ['head', 'crown', 'forehead-left', 'forehead-right',
             'temple-left', 'temple-right', 'cheek-left', 'cheek-right',
             'jowl-left', 'jowl-right', 'muzzle-edge-left', 'muzzle-edge-right', 'chin'] },
    { key: 'body',  title: 'тело',
      keys: ['segment-1', 'segment-2', 'belly', 'tail',
             'growing-1', 'growing-2', 'growing-3', 'growing-4'] },
    { key: 'skin',  title: 'кожа',
      keys: ['surface-layer', 'coat-layer', 'skin-tone', 'body-rings', 'muscle-layer',
             'organ-layer', 'gut-tract', 'scar-layer', 'hull-outline'] },
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

const WormStudio = {
    on: false,
    root: null,
    handle: null,
    row: 'face',
    picked: null,       // ключ выбранной сущности ('' = ряд света)
    frozen: true,
    shape: true,        // показывать ли ручки контура
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
        this.mount();
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
    },

    toggle() { this.on ? this.close() : this.open(); },

    // ---------- РАЗМЕТКА ----------
    build() {
        if (this.root) { this.place(); return; }
        this.root = document.createElement('div');
        this.root.id = 'ws-root';
        this.root.innerHTML = `
            <div class="ws-top">
                <button class="ws-icon" data-act="close" title="закрыть">✕</button>
                <div class="ws-title" data-out="title">студия</div>
                <button class="ws-icon" data-act="freeze" title="остановить персонажа">⏸</button>
                <button class="ws-icon" data-act="shape" title="ручки контура">◌</button>
                <button class="ws-icon" data-act="undo" title="откат">↶</button>
                <button class="ws-icon" data-act="reset" title="сбросить всё">⟲</button>
            </div>
            <div class="ws-view">
                <div class="ws-worm"></div>
                <svg class="ws-fx"></svg>
                <div class="ws-zoom">
                    <button class="ws-icon" data-act="zoom-in">+</button>
                    <button class="ws-icon" data-act="zoom-out">−</button>
                    <button class="ws-icon" data-act="zoom-all" title="целиком">⛶</button>
                </div>
            </div>
            <div class="ws-sheet">
                <div class="ws-rows" data-out="rows"></div>
                <div class="ws-chips" data-out="chips"></div>
                <div class="ws-knobs" data-out="knobs"></div>
                <div class="ws-foot">
                    <span class="ws-lbl">ракурс</span>
                    <input type="range" data-in="yaw" min="-1" max="1" step="0.05" value="0">
                    <button class="ws-icon" data-act="yaw-auto" title="автоматика">↻</button>
                    <span class="ws-val" data-out="steps"></span>
                </div>
            </div>`;
        document.body.appendChild(this.root);
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

    // Экран студии стоит ПО ХОЛСТУ, а не по окну: верх окна в Telegram занят
    // шапкой клиента и чёлкой, а холст уже вычтен из безопасной зоны ровно
    // один раз (инвариант 11). Спрашиваем готовый ответ, а не считаем заново
    // через env() — второе вычитание это ловушка №134.
    place() {
        if (!this.root) return;
        const host = document.getElementById('game-container');
        if (!host) return;
        const r = host.getBoundingClientRect();
        if (!r.width || !r.height) return;
        this.root.style.left = r.left + 'px';
        this.root.style.top = r.top + 'px';
        this.root.style.width = r.width + 'px';
        this.root.style.height = r.height + 'px';
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

    // ---------- КАМЕРА ----------
    // Зум — это viewBox корневого svg. Не css-трансформация: через viewBox
    // умеет считать SvgSpace, а css-масштаб предка WebKit в getScreenCTM не
    // учитывает, и палец начал бы промахиваться ровно на величину наезда.
    box() {
        const c = this.wormHost;
        return { w: Math.max(1, c.clientWidth), h: Math.max(1, c.clientHeight) };
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
        const z = Math.min(b.w / (wb.w * 1.25), b.h / (wb.h * 1.15));
        this.camTo = { x: wb.x, y: wb.y, z: Math.max(0.5, Math.min(8, z)) };
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
        const z = Math.max(0.6, Math.min(8, Math.min(b.w, b.h) / span));
        this.camTo = { x: p.x, y: p.y, z };
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
        if (this.shape && ear) {
            WORM_STUDIO_EAR.forEach(k => want.push({ key: k + '-' + ear }));
        } else if (this.shape && this.picked && this.isSkullish(this.picked)) {
            WORM_STUDIO_SKULL.forEach(k => want.push({ key: k }));
        } else if (this.picked) {
            want.push({ key: this.picked });
        }
        const r = 1 / (this.cam ? this.cam.z : 1);   // ручка одного размера НА ЭКРАНЕ
        let html = '';
        want.forEach(w => {
            const p = WormParts.at(h, w.key);
            if (!p) return;
            const sel = w.key === this.picked;
            html += `<circle class="ws-h${sel ? ' sel' : ''}" data-h="${w.key}"
                       cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}"
                       r="${(13 * r).toFixed(2)}" stroke-width="${(2 * r).toFixed(2)}"></circle>`;
        });
        this.fx.innerHTML = html;
    },

    isSkullish(key) {
        return key === 'head' || WORM_STUDIO_SKULL.indexOf(key) >= 0;
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
            if (ent && ent.form) {
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
        if (this.drag.form) { this.dragForm(e.clientX, e.clientY); return; }
        WormLook.dragTo(this.handle, this.drag, e.clientX, e.clientY);
        this.syncKnobs();
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
        const row = WORM_STUDIO_ROWS.find(r => r.keys && r.keys.indexOf(key) >= 0);
        if (row) this.row = row.key;
        const e = (typeof WormParts !== 'undefined') ? WormParts.get(key) : null;
        this.title(e ? e.title : key);
        if (!(opts && opts.noZoom)) this.frameEntity(key);
        this.renderRows();
        this.renderKnobs(true);
    },

    title(text) {
        const out = this.root.querySelector('[data-out="title"]');
        if (out) out.textContent = text;
    },

    // ---------- РЯДЫ И ПЛИТКИ ----------
    renderRows() {
        const rows = this.root.querySelector('[data-out="rows"]');
        rows.innerHTML = WORM_STUDIO_ROWS.map(r =>
            `<button data-row="${r.key}" class="${r.key === this.row ? 'on' : ''}">${r.title}</button>`).join('');

        const chips = this.root.querySelector('[data-out="chips"]');
        const row = WORM_STUDIO_ROWS.find(r => r.key === this.row);
        if (!row || !row.keys) { chips.innerHTML = ''; return; }
        // Показываем только то, что СЕЙЧАС есть на экране: растущих сегментов
        // может не вырасти, ухо бывает спрятано шляпой. Плитка, ведущая в
        // никуда, хуже отсутствующей.
        chips.innerHTML = row.keys.map(k => {
            const e = (typeof WormParts !== 'undefined') ? WormParts.get(k) : null;
            if (!e) return '';
            if (this.handle && !WormParts.at(this.handle, k)) return '';
            // Плитка горит и тогда, когда выбрана ТОЧКА её контура: «кончик
            // левого уха» своей плитки не имеет и иметь не должен, но ухо,
            // которое сейчас правят, показать обязано.
            const on = k === this.picked
                    || (this.earOf(this.picked) && k === 'ear-' + this.earOf(this.picked))
                    || (this.isSkullish(this.picked) && k === 'head' && this.picked !== 'head');
            return `<button data-chip="${k}" class="${on ? 'on' : ''}">${e.title}</button>`;
        }).join('');

        // Выбранная плитка подъезжает в середину ряда. Без этого тык в
        // персонажа переключал ряд, а сама плитка оставалась за краем — и
        // выходило, что выбранного на экране не видно вовсе.
        // Считаем сдвиг руками, а не scrollIntoView: тот заодно прокручивает
        // всех предков, а студия — экран, который не скроллится.
        const on = chips.querySelector('.on');
        if (on) chips.scrollLeft = Math.max(0, on.offsetLeft - (chips.clientWidth - on.offsetWidth) / 2);
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
            const v = k ? (WormLook.values[k] || 0) : ((WormLook.skew && WormLook.skew[s]) || 0);
            if (document.activeElement !== inp) inp.value = String(v);
            const out = inp.parentNode.querySelector('.ws-val');
            if (out) out.textContent = (v >= 0 ? '+' : '') + v.toFixed(2);
        });
        this.syncSteps();
    },

    syncSteps() {
        const out = this.root.querySelector('[data-out="steps"]');
        if (out) out.textContent = Object.keys(WormLook.patch()).length + ' правок';
    },

    // ---------- КНОПКИ ----------
    onClick(e) {
        const t = e.target;
        if (!t) return;
        const row = t.getAttribute && t.getAttribute('data-row');
        const chip = t.getAttribute && t.getAttribute('data-chip');
        const step = t.getAttribute && t.getAttribute('data-step');
        const act = t.getAttribute && t.getAttribute('data-act');
        if (row) { this.row = row; if (row === 'light') this.picked = null; this.renderRows(); this.renderKnobs(true); return; }
        if (chip) { this.select(chip); return; }
        if (step) { this.bump(t, +step * 0.05); return; }
        if (!act) return;
        if (act === 'close') this.close();
        else if (act === 'freeze') this.setFrozen(!this.frozen);
        else if (act === 'shape') { this.shape = !this.shape; this.syncIcons(); }
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
        if (k) {
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
        const v = parseFloat(inp.value);
        if (inp.getAttribute('data-in') === 'yaw') {
            if (this.handle) this.handle.setHeadPose(v);
            return;
        }
        const k = inp.getAttribute('data-knob'), s = inp.getAttribute('data-skew');
        if (k) WormLook.apply(this.handle, { [k]: v }, { absolute: true });
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
        const s = this.root.querySelector('[data-act="shape"]');
        if (s) s.classList.toggle('on', this.shape);
    }
};

if (typeof window !== 'undefined') window.WormStudio = WormStudio;
