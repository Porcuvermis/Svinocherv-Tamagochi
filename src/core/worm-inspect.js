// ================= ИНСПЕКТОР ПЕРСОНАЖА =================
// Шаг 2 перехода к визуальному управлению. Смотришь на червя и понимаешь,
// ЧТО выглядит неправильно, — а не «matrix 2 7».
//
// ---------- ОН ТОЛЬКО ЧИТАЕТ ----------
// Ни одной правки внешности здесь нет и в этом файле быть не должно: он
// показывает и собирает. Писать будет пульт (шаг 3), и только он.
// Единственное исключение — ползунок ракурса: он зовёт setHeadPose, то есть
// штатный публичный канал, которым и так пользуются мини-игры, и ничего в
// модели не меняет.
//
// ---------- ГДЕ ОН ЖИВЁТ ----------
// Накладка — ОТДЕЛЬНЫЙ слой поверх страницы, вне `worm-root` и вне холста.
// Причин две. Первая: на слое, который меняется каждый кадр, не должно быть
// ни фильтра, ни маски, ни лишней группы — цена там за сам факт отдельного
// буфера (docs/traps.md, п. 73), и класть подсветку внутрь персонажа
// значило бы платить за неё всегда. Вторая: накладка рисуется в ЭКРАННЫХ
// координатах, где единица — пиксель, и никакие матрицы ей не нужны вовсе.
//
// ---------- ДВА РЕЖИМА ВЫБОРА ----------
//   «проблема» — тык куда угодно, и система сама собирает ВЕСЬ контекст:
//                точку, стопку слоёв человеческими именами, сущность, часть,
//                ракурс, живые каналы, значения ручек, историю. Ответ на
//                «персонаж выглядит плоским» перестаёт быть строкой и
//                становится разбором.
//   «элемент»  — кисть: наводишь, подсвечивается верхний осмысленный слой,
//                колесо (или повторный тап) спускает на слой глубже. Девять
//                технических слоёв превращаются в три-четыре осмысленных —
//                схлопывает их WormParts.stack.
//
// Слова здесь разрешены: debug-панель игрой не является (инвариант 9).

const WORM_INSPECT_OVERLAYS = [
    { key: 'light',      title: 'свет',      hint: 'блики в одну линию или гирлянда' },
    { key: 'silhouette', title: 'силуэт',    hint: 'одна вершина или плато из бус' },
    { key: 'yaw',        title: 'ракурс',    hint: 'кто как отвечает на поворот' },
    { key: 'depth',      title: 'глубина',   hint: 'что перед чем' },
    { key: 'density',    title: 'плотность', hint: 'не сыпь ли' },
    { key: 'cost',       title: 'цена',      hint: 'что стоит кадр' }
];

// Цвет по способу ответа на ракурс. Три способа, и других нет
// (docs/bench/turn.md): почти все жалобы на одежду оказывались тем, что
// вещи назначили не тот.
const WORM_INSPECT_YAW_COLORS = {
    surface: '#ff5c7a',   // черта поверхности — едет по телу и прячется за край
    cover:   '#5cc8ff',   // обшивка — ракурсу не подчиняется
    face:    '#ffd45c',   // лицо — сужается и съезжает на ближний бок
    none:    '#8e8e93'
};

const WormInspect = {
    on: false,
    mode: 'pick',            // 'pick' | 'problem'
    depth: 0,                // на сколько слоёв вглубь спустилась кисть
    picked: null,            // что выбрано
    overlays: {},            // какие накладки включены
    frozen: false,           // остановлен ли персонаж на время правки
    raf: 0,
    // История — ПОКА только того, что делает сам инспектор. Настоящая
    // история правок появится вместе с пультом: там она достаётся даром,
    // потому что setOverride заменяет патч целиком и накопленный патч всё
    // равно придётся хранить у себя.
    history: [],

    init() {
        if (this.root || typeof document === 'undefined') return;

        // В <body>, а НЕ в #game-container, и это не мелочь. У контейнера
        // стоит css-трансформация (холст масштабируется под окно, инвариант
        // 11), а `position: fixed` внутри трансформированного предка
        // отсчитывается ОТ ПРЕДКА, а не от окна. На компьютере масштаб
        // единица и разницы не видно; на телефоне накладка уехала бы вся
        // целиком — ровно та же ловушка, из-за которой существует
        // src/core/svg-space.js.
        this.root = document.createElement('div');
        this.root.id = 'wi-root';
        this.root.innerHTML = '<svg id="wi-svg"></svg>';
        document.body.appendChild(this.root);
        this.svg = this.root.querySelector('#wi-svg');

        this.panel = document.createElement('div');
        this.panel.id = 'wi-panel';
        this.panel.innerHTML = this.panelMarkup();
        document.body.appendChild(this.panel);

        this.panel.addEventListener('click', (e) => this.onPanelClick(e));
        this.panel.addEventListener('input', (e) => this.onPanelInput(e));
        // Накладка ловит палец ТОЛЬКО когда инспектор открыт: иначе она
        // собой накрывает всю игру и в комнату не ткнуть.
        this.root.addEventListener('pointermove', (e) => this.onMove(e));
        this.root.addEventListener('pointerdown', (e) => this.onDown(e));
        this.root.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
        // Отпускание ловим на ОКНЕ, а не на накладке: мышку отпускают где
        // угодно, в том числе за её краем, и брошенное перетаскивание
        // продолжало бы тянуть внешность за каждым движением.
        window.addEventListener('pointerup', () => this.onUp());
        window.addEventListener('pointercancel', () => this.onUp());

        if (typeof DebugMode !== 'undefined') DebugMode.onChange(() => this.sync());
        // Холст переезжает при повороте телефона и при смене высоты окна в
        // Telegram — панель обязана переехать с ним.
        window.addEventListener('resize', () => this.placePanel());
        window.addEventListener('orientationchange', () => setTimeout(() => this.placePanel(), 150));
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => this.placePanel());
        }
        this.sync();
    },

    // ---------- ПАНЕЛЬ СТОИТ ПО ХОЛСТУ, А НЕ ПО ОКНУ ----------
    // Она лежит в <body> и потому `position: fixed` у неё настоящий,
    // оконный. Верх окна в Telegram на айфоне занят шапкой клиента и чёлкой,
    // и панель, поставленная на `top: 8px`, уезжала прямо под них.
    //
    // Холст (`#game-container`) уже стоит в безопасной области целиком:
    // Stage.viewport() вычитает и чёлку, и шапку клиента, и делает это РОВНО
    // ОДИН РАЗ (инвариант 11). Значит правильный ответ на вопрос «где можно
    // рисовать» у игры уже есть — надо не считать его заново, а спросить.
    //
    // Через `getBoundingClientRect` холста, а не через env() в стилях: env()
    // внутри css дал бы ВТОРОЕ вычитание безопасной зоны, и это ровно та
    // ловушка №134, из-за которой у сада срезало полку.
    placePanel() {
        if (!this.panel) return;
        const host = document.getElementById('game-container');
        if (!host) return;
        const r = host.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const pad = Math.round(Math.min(10, r.width * 0.03));
        this.panel.style.left = (r.left + pad) + 'px';
        this.panel.style.top = (r.top + pad) + 'px';
        this.panel.style.maxWidth = Math.round(r.width - pad * 2) + 'px';
        // Выше половины холста не растёт: ниже живёт червь, а закрывать
        // предмет измерения инструменту нельзя.
        this.panel.style.maxHeight = Math.round(r.height * 0.5) + 'px';
    },

    panelMarkup() {
        const ov = WORM_INSPECT_OVERLAYS
            .map(o => `<button data-ov="${o.key}" title="${o.hint}">${o.title}</button>`).join('');
        return `
            <div class="wi-row">
                <button data-act="toggle" class="wi-main">Инспектор</button>
                <button data-act="mode-pick">элемент</button>
                <button data-act="mode-problem">проблема</button>
                <button data-act="mode-edit">правка</button>
                <button data-act="freeze" title="остановить персонажа">стоп</button>
                <button data-act="studio" title="отдельный экран редактора">студия</button>
            </div>
            <div class="wi-body">
                <div class="wi-row wi-ovs">${ov}</div>
                <div class="wi-row">
                    <span class="wi-lbl">ракурс</span>
                    <input type="range" data-in="yaw" min="-1" max="1" step="0.05" value="0">
                    <span class="wi-val" data-out="yaw">0.00</span>
                    <button data-act="yaw-auto">авто</button>
                </div>
                <div class="wi-pick" data-out="pick">ничего не выбрано</div>
                <div class="wi-knobs" data-out="knobs"></div>
                <div class="wi-row">
                    <button data-act="undo">← откат</button>
                    <button data-act="reset">сбросить всё</button>
                    <span class="wi-val" data-out="steps"></span>
                </div>
                <div class="wi-row">
                    <button data-act="copy">Скопировать контекст</button>
                    <button data-act="ctx">показать</button>
                    <span class="wi-val" data-out="copied"></span>
                </div>
                <textarea data-out="ctx" readonly spellcheck="false"></textarea>
            </div>`;
    },

    // ---------- КОГО ИНСПЕКТИРУЕМ ----------
    // Червей на экране может быть несколько (комната, ванная, дорожка,
    // лобби гнева). Берём того, кто СЕЙЧАС виден: у закрытой мини-игры
    // контейнер нулевого размера, и спрашивать её бессмысленно.
    // Контекст для агента по ЧУЖОМУ выбору — тот же разбор, что собирает
    // инспектор, но про персонажа и вещь, которые назвали снаружи. Нужен
    // студии: она сама ничего не считает, а второй такой сборщик разошёлся
    // бы с этим при первой же правке.
    contextFor(handle, entityKey) {
        const e = (typeof WormParts !== 'undefined') ? WormParts.get(entityKey) : null;
        const hH = this._forceHandle, hP = this.picked, hS = this.stackAt;
        this._forceHandle = handle;
        this.picked = e ? { title: e.title, entity: e, part: null } : null;
        this.stackAt = null;
        this.buildContext();
        const c = this.ctx;
        this._forceHandle = hH; this.picked = hP; this.stackAt = hS;
        return c;
    },

    handle() {
        if (this._forceHandle) return this._forceHandle;
        const cand = [
            window.MainWormHandle,
            (typeof LustMinigame !== 'undefined') ? LustMinigame.wormHandle : null,
            (typeof PrideMinigame !== 'undefined') ? PrideMinigame.wormHandle : null,
            (typeof GluttonyMinigame !== 'undefined') ? GluttonyMinigame.wormHandle : null,
            (typeof WrathLobby !== 'undefined') ? WrathLobby.wormHandle : null
        ].filter(h => h && h.svgRoot);
        // Последний видимый выигрывает: мини-игра открывается ПОВЕРХ комнаты,
        // и если видны оба, спрашивать надо верхнего.
        let best = null;
        cand.forEach(h => {
            const r = h.svgRoot.getBoundingClientRect();
            if (r.width > 4 && r.height > 4) best = h;
        });
        return best;
    },

    // ---------- ВКЛ/ВЫКЛ ----------
    sync() {
        const dbg = (typeof DebugMode !== 'undefined') && DebugMode.enabled;
        this.placePanel();
        // Инспектор живёт внутри debug-режима: своей кнопки на игровом
        // экране он не заводит — там место червю, а не инструментам.
        this.panel.classList.toggle('visible', dbg);
        if (!dbg && this.on) this.close();
    },

    open() {
        this.on = true;
        this.placePanel();
        this.root.classList.add('active');
        this.panel.classList.add('wi-open');
        // Панель состояния уходит на время осмотра. Она стоит внизу и
        // переносится на несколько рядов кнопок — то есть накрывает собой
        // нижние две трети экрана, где и живёт червь. Тык в голову попадал в
        // её кнопки, причём в «Шрам»: осмотр не просто не работал, а тихо
        // менял персонажа. Возвращается при закрытии.
        document.body.classList.add('wi-on');
        this.tick();
    },

    close() {
        this.on = false;
        this.root.classList.remove('active');
        this.panel.classList.remove('wi-open');
        if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
        this.svg.innerHTML = '';
        // Накладка «силуэт» красит самого червя, и оставить её включённой
        // при закрытии значило бы бросить игру чёрной.
        document.body.classList.remove('wi-silhouette');
        document.body.classList.remove('wi-on');
        this.overlays.silhouette = false;
    },

    onPanelClick(e) {
        const act = e.target && e.target.getAttribute('data-act');
        const ov = e.target && e.target.getAttribute('data-ov');
        if (!act && !ov) return;
        e.stopPropagation();
        if (ov) {
            this.overlays[ov] = !this.overlays[ov];
            if (ov === 'silhouette') document.body.classList.toggle('wi-silhouette', !!this.overlays[ov]);
            this.renderPanel();
            return;
        }
        if (act === 'toggle') { this.on ? this.close() : this.open(); this.renderPanel(); return; }
        if (act === 'mode-pick') { this.mode = 'pick'; this.depth = 0; this.renderPanel(); return; }
        if (act === 'mode-problem') { this.mode = 'problem'; this.renderPanel(); return; }
        if (act === 'mode-edit') { this.mode = 'edit'; this.depth = 0; this.renderPanel(); return; }
        if (act === 'undo') {
            WormLook.undo(this.handle());
            this.note('откат');
            this.buildContext(); this.renderPanel();
            return;
        }
        if (act === 'reset') {
            WormLook.reset(this.handle());
            this.history.length = 0;
            this.note('сброс всего');
            this.buildContext(); this.renderPanel();
            return;
        }
        if (act === 'yaw-auto') {
            const h = this.handle();
            if (h && h.setHeadPose) h.setHeadPose('auto');
            this.note('ракурс → авто');
            return;
        }
        // ---------- СТОП ----------
        // В движущуюся цель не попасть ни пальцем, ни глазом: червь дышит,
        // моргает и бродит по комнате, а правят внешность по неподвижному.
        // Опции читаются рендерером каждый кадр, поэтому персонажа не
        // разбирают — просто следующий кадр считает его застывшим.
        if (act === 'freeze') {
            const h = this.handle();
            this.frozen = !this.frozen;
            if (h && h.setOptions) h.setOptions({ idleWave: !this.frozen, blink: !this.frozen, wander: !this.frozen });
            this.note(this.frozen ? 'персонаж остановлен' : 'персонаж ожил');
            this.renderPanel();
            return;
        }
        if (act === 'studio') {
            if (typeof WormStudio !== 'undefined') WormStudio.open();
            return;
        }
        if (act === 'ctx') { this.panel.classList.toggle('wi-ctx'); return; }
        if (act === 'copy') this.copyContext();
    },

    onPanelInput(e) {
        if (!e.target) return;
        const skew = e.target.getAttribute('data-skew');
        if (skew) {
            const v = parseFloat(e.target.value);
            const name = skew.slice(0, -1), side = skew.slice(-1) === 'L' ? -1 : 1;
            const h = this.handle();
            // Ползунок ставит РОВНО столько, поэтому сначала снимаем
            // накопленное: setSkew прибавляет.
            if (WormLook.skew) WormLook.skew[skew] = 0;
            WormLook.setSkew(h, name, side, v);
            this.note(skew + ' → ' + v.toFixed(2));
            this.afterKnob(e.target, v);
            return;
        }
        const knob = e.target.getAttribute('data-knob');
        if (knob) {
            const v = parseFloat(e.target.value);
            // absolute: ползунок говорит «поставь ровно столько», а не
            // «прибавь». Накопление тут читалось бы как убегающая ручка.
            WormLook.apply(this.handle(), { [knob]: v }, { absolute: true });
            this.note(knob + ' → ' + v.toFixed(2));
            this.afterKnob(e.target, v);
            return;
        }
        if (e.target.getAttribute('data-in') !== 'yaw') return;
        const v = parseFloat(e.target.value);
        const h = this.handle();
        if (h && h.setHeadPose) h.setHeadPose(v);
        this.panel.querySelector('[data-out="yaw"]').textContent = v.toFixed(2);
        this.note('ракурс → ' + v.toFixed(2));
    },

    // ---------- ПОСЛЕ ДВИЖЕНИЯ РУЧКИ ----------
    // Обновляем ЧИСЛО рядом с ползунком и счётчик правок — и НИЧЕГО БОЛЬШЕ.
    //
    // Раньше здесь стоял полный renderPanel(), а он пересобирает ряд ручек
    // через innerHTML. То есть узел ползунка УНИЧТОЖАЛСЯ и создавался заново
    // на каждое его же событие — прямо под пальцем. Жест обрывался, и
    // ползунок «не тащился»: работали только отдельные тычки. Замер:
    // перетаскивание через треть дорожки давало 0.08 вместо 0.64.
    //
    // Отсюда общее правило: узел, которым сейчас управляют, перерисовывать
    // нельзя. Обновлять надо то, что рядом.
    afterKnob(input, v) {
        const row = input.closest('.wi-row');
        const out = row && row.querySelector('.wi-val');
        if (out) out.textContent = (v >= 0 ? '+' : '') + v.toFixed(2);
        this.buildContext();
        const steps = this.panel.querySelector('[data-out="steps"]');
        if (steps) {
            const n = Object.keys(WormLook.patch()).filter(k => k !== 'lock').length;
            steps.textContent = n ? `${n} правок` : 'без правок';
        }
        const ta = this.panel.querySelector('[data-out="ctx"]');
        if (ta) ta.value = this.ctx ? JSON.stringify(this.ctx, null, 1) : '';
    },

    // Запись в историю. Схлопывает подряд идущие однотипные: двадцать шагов
    // ползунка — это одно решение, а не двадцать.
    note(text) {
        const last = this.history[this.history.length - 1];
        const head = text.split('→')[0];
        if (last && last.split('→')[0] === head) this.history[this.history.length - 1] = text;
        else this.history.push(text);
        if (this.history.length > 12) this.history.shift();
    },

    // ---------- ПАЛЕЦ ----------
    onMove(e) {
        if (!this.on) return;
        if (this.drag) {
            const applied = WormLook.dragTo(this.handle(), this.drag, e.clientX, e.clientY);
            if (applied && applied.length) {
                this.note('тянем ' + this.picked.title + ' → ' + applied.map(a => a.knob).join(', '));
            }
            return;
        }
        if (this.mode !== 'pick') return;
        this.hover = { x: e.clientX, y: e.clientY };
    },

    onUp() {
        if (!this.drag) return;
        this.drag = null;
        this.buildContext();
        this.renderPanel();
    },

    // Палец лёг рядом с уже выбранным? Меряется до ЕГО точки, а не до
    // габарита: у ориентира габарита нет вовсе.
    nearPicked(h, x, y, r) {
        if (!this.picked) return false;
        const c = WormParts.client(h, this.picked.entity.key);
        if (!c) return false;
        return Math.hypot(c.x - x, c.y - y) <= r;
    },

    onDown(e) {
        if (!this.on) return;
        e.preventDefault();
        e.stopPropagation();
        const h = this.handle();
        if (!h) return;
        const st = WormParts.stack(h, e.clientX, e.clientY);

        // ---------- ПРАВКА: ТЯНЕМ МЫШКОЙ ----------
        // Берём то, что уже выбрано, если палец лёг рядом с ним: иначе
        // каждое движение начиналось бы с перевыбора, и вещь, стоящую под
        // другой, схватить было бы нельзя вовсе.
        if (this.mode === 'edit') {
            let key = this.picked ? this.picked.entity.key : null;
            const near = key && this.nearPicked(h, e.clientX, e.clientY, 26);
            if (!near) {
                this.stackAt = st;
                this.depth = 0;
                this.picked = st[0] || null;
                key = this.picked ? this.picked.entity.key : null;
            }
            if (!key) { this.renderPanel(); return; }
            this.drag = WormLook.dragStart(h, key);
            if (!this.drag) {
                this.note('нечем двигать → ' + this.picked.title);
            }
            this.buildContext();
            this.renderPanel();
            return;
        }
        if (this.mode === 'problem') {
            this.picked = st.length ? st[0] : null;
            this.point = { x: e.clientX, y: e.clientY };
            this.stackAt = st;
            this.buildContext();
            this.note('тык → ' + (this.picked ? this.picked.title : 'мимо персонажа'));
            this.renderPanel();
            return;
        }
        // Кисть: повторный тап в то же место спускает на слой глубже — тот
        // же перебор, что колесом, но пальцем. Без него на телефоне до
        // нижних слоёв не добраться вовсе.
        const same = this.point && Math.abs(this.point.x - e.clientX) < 12
                                && Math.abs(this.point.y - e.clientY) < 12;
        this.point = { x: e.clientX, y: e.clientY };
        this.stackAt = st;
        this.depth = same ? (this.depth + 1) % Math.max(1, st.length) : 0;
        this.picked = st[this.depth] || null;
        this.buildContext();
        this.note('выбрано → ' + (this.picked ? this.picked.title : 'ничего'));
        this.renderPanel();
    },

    onWheel(e) {
        if (!this.on || this.mode !== 'pick' || !this.stackAt || !this.stackAt.length) return;
        e.preventDefault();
        const n = this.stackAt.length;
        this.depth = (this.depth + (e.deltaY > 0 ? 1 : n - 1)) % n;
        this.picked = this.stackAt[this.depth] || null;
        this.buildContext();
        this.renderPanel();
    },

    // ---------- КОНТЕКСТ ДЛЯ АГЕНТА ----------
    // Не «персонаж выглядит плоским», а разбор: что выбрано, что под ним,
    // какой ракурс, какие ручки на это влияют и что с ними сейчас.
    buildContext() {
        const h = this.handle();
        if (!h) { this.ctx = null; return; }
        const m = WormParts.model(h) || {};
        const live = typeof h.getLivePose === 'function' ? h.getLivePose() : {};
        const yaw = WormParts.yaw(h);
        const p = this.picked;

        const knobs = p ? (p.entity.knobs || []) : [];
        this.ctx = {
            выбрано: p ? p.title : null,
            сорт: p ? p.entity.kind : null,
            часть: p && p.part ? p.part.title : null,
            способОтветаНаРакурс: p ? this.yawRoleName(p.entity.yawRole) : null,
            стопкаПодПальцем: (this.stackAt || []).map(s => s.title),
            ракурс: +yaw.toFixed(3),
            ручкиНаЭтуВещь: knobs,
            состояние: this.stateFor(m, knobs),
            свет: (typeof LIGHT !== 'undefined')
                ? { направление: [LIGHT.dirX, LIGHT.dirY], блик: LIGHT.highlight,
                    тень: LIGHT.shadow, контраст: LIGHT.verticalFalloff } : null,
            живыеКаналы: Object.keys(live).filter(k => live[k] != null)
                .reduce((o, k) => (o[k] = live[k], o), {}),
            кадры: typeof h.getFrameStats === 'function' ? h.getFrameStats() : null,
            накопленныйПатч: (typeof WormLook !== 'undefined') ? WormLook.patch() : null,
            заморожено: (typeof WormLook !== 'undefined') ? WormLook.locks.slice() : [],
            история: this.history.slice(),
            // Не «не советуем», а отказ с причиной: список живёт в пульте,
            // потому что там он и проверяется.
            нельзя: (typeof WormLook !== 'undefined')
                ? WormLook.forbidden()
                : { 'light.part': 'свет один на сцену' }
        };
    },

    yawRoleName(role) {
        return { surface: 'черта поверхности (едет по телу, прячется за край)',
                 cover: 'обшивка (ракурсу не подчиняется)',
                 face: 'лицо (сужается и съезжает на ближний бок)' }[role] || null;
    },

    // Значения, стоящие за ручками. Пульта ещё нет, поэтому показываем то,
    // из чего он потом будет считать: сами числа модели.
    stateFor(m, knobs) {
        const a = m.anatomy || {}, head = m.head || {};
        const all = {
            headSize: head.scale,
            headWidthBrow: head.skull && head.skull.browWidth,
            headWidthTemple: head.skull && head.skull.templeWidth,
            headWidthCheek: head.skull && head.skull.cheekWidth,
            headWidthJaw: head.skull && head.skull.jawWidth,
            headWidthMuzzle: head.skull && head.skull.muzzleWidth,
            headChin: head.skull && head.skull.chinDrop,
            relief: head.skull && head.skull.relief,
            gloss: a.coat && a.coat.slimeGloss,
            matte: a.coat && a.coat.matte,
            organs: a.organs && a.organs.visibility,
            translucency: a.skin && a.skin.thinness && a.skin.thinness.belly,
            guts: a.organs && a.organs.tract && a.organs.tract.loopDensity,
            detail: a.muscle && a.muscle.bundles,
            bellySize: m.belly && m.belly.radius,
            tailLength: m.tail && m.tail.length,
            tailThickness: m.tail && m.tail.thickness
        };
        const out = {};
        knobs.forEach(k => { if (all[k] !== undefined) out[k] = all[k]; });
        // Если у сущности своих ручек нет (силуэт, зубы), показываем общий
        // свет и объём: спрашивают про них всё равно.
        if (!Object.keys(out).length) {
            out.gloss = all.gloss; out.matte = all.matte; out.relief = all.relief;
        }
        return out;
    },

    copyContext() {
        const ta = this.panel.querySelector('[data-out="ctx"]');
        const text = ta.value;
        // Поле может быть спрятано, а `select()` на спрятанном не выделяет
        // ничего. Показываем его — запасной путь обязан быть настоящим.
        this.panel.classList.add('wi-ctx');
        const done = (ok) => {
            const el = this.panel.querySelector('[data-out="copied"]');
            el.textContent = ok ? 'скопировано' : 'выделено — Ctrl+C';
            setTimeout(() => { el.textContent = ''; }, 2000);
        };
        // Буфер может быть запрещён (нет https, нет разрешения) — тогда
        // честно выделяем текст, а не делаем вид, что скопировали.
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => done(true), () => { ta.select(); done(false); });
        } else { ta.select(); done(false); }
    },

    // ---------- КАДР ----------
    tick() {
        if (!this.on) return;
        this.draw();
        this.raf = requestAnimationFrame(() => this.tick());
    },

    draw() {
        const h = this.handle();
        const w = window.innerWidth, ht = window.innerHeight;
        this.svg.setAttribute('viewBox', `0 0 ${w} ${ht}`);
        if (!h) { this.svg.innerHTML = ''; return; }
        const parts = [];

        if (this.overlays.light) parts.push(this.drawLight(h));
        if (this.overlays.yaw) parts.push(this.drawYawRoles(h));
        if (this.overlays.density) parts.push(this.drawDensity(h));
        if (this.overlays.depth) parts.push(this.drawDepth(h));
        parts.push(this.drawPicked(h));
        this.svg.innerHTML = parts.join('');

        if (this.overlays.cost) this.drawCost(h);
    },

    // Подсветка выбранного. Узел и слой обводятся рамкой, ориентир — точкой
    // НА контуре: он там и лежит, а рамка вокруг точки читалась бы как
    // «выбран кусок головы».
    drawPicked(h) {
        const p = this.picked;
        if (!p) return '';
        const e = p.entity;
        if (e.kind === 'landmark') {
            const c = WormParts.client(h, e.key);
            if (!c) return '';
            return `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="7"
                        class="wi-mark"/>
                    <text x="${(c.x + 12).toFixed(1)}" y="${(c.y - 10).toFixed(1)}"
                        class="wi-tag">${e.title}</text>`;
        }
        const el = p.el && p.el.getBoundingClientRect ? p.el : null;
        if (!el) return '';
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return '';
        return `<rect x="${(r.left - 3).toFixed(1)}" y="${(r.top - 3).toFixed(1)}"
                    width="${(r.width + 6).toFixed(1)}" height="${(r.height + 6).toFixed(1)}"
                    class="wi-box"/>
                <text x="${(r.left).toFixed(1)}" y="${(r.top - 7).toFixed(1)}"
                    class="wi-tag">${p.title}</text>`;
    },

    // ---------- НАКЛАДКА «СВЕТ» ----------
    // Главный ответ на «почему плоский». Блики ВСЕХ частей обязаны лежать на
    // одной линии: пока у каждой части была своя лампочка, фигура читалась
    // гирляндой из пластика (docs/art-direction.md, §3). Линия видна сразу,
    // а по числам — никогда.
    drawLight(h) {
        if (typeof LIGHT === 'undefined') return '';
        const spec = (key) => {
            const c = WormParts.client(h, key);
            if (!c || !c.el) return null;
            const r = c.el.getBoundingClientRect();
            if (r.width < 6) return null;
            // Блик смещён от центра части на ту же долю, что в градиенте.
            return { x: c.x + LIGHT.dirX * r.width * 0.5,
                     y: c.y + LIGHT.dirY * r.height * 0.5, r: Math.min(6, r.width * 0.14) };
        };
        // Ломаная идёт ТОЛЬКО по цепочке тела, в анатомическом порядке от
        // головы к хвосту. Первая версия соединяла все части подряд, включая
        // пятачок, уши и брови, — получалось спагетти, по которому ничего не
        // прочесть. Проверяемое утверждение здесь ровно одно: блики ЦЕПОЧКИ
        // лежат на плавной линии. Кривая линия означает, что у частей разные
        // лампочки, то есть ту самую «гирлянду из пластика»
        // (docs/art-direction.md, §3).
        const chain = ['head', 'segment-1', 'segment-2', 'belly'];
        for (let i = 1; i <= 12; i++) chain.push(`growing-${i}`);
        chain.push('tail');
        const linePts = chain.map(spec).filter(Boolean);

        // Точки — у всех частей: у черт лица свой блик, и он тоже обязан
        // смотреть в ту же сторону. Но в линию они не собираются: лицо не
        // цепочка.
        const all = WormParts.list()
            .filter(e => e.kind === 'node').map(e => spec(e.key)).filter(Boolean);
        if (!all.length) return '';
        const pts = linePts.length ? linePts : all;
        const dots = all.map(p =>
            `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r.toFixed(1)}" class="wi-spec"/>`).join('');
        const line = `<polyline points="${linePts.map(p => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' ')}" class="wi-specline"/>`;
        // Стрелка источника: откуда светит, одна на всю сцену.
        const a = pts[0];
        const L = 46;
        const arrow = `<line x1="${(a.x + LIGHT.dirX * L).toFixed(1)}" y1="${(a.y + LIGHT.dirY * L).toFixed(1)}"
                             x2="${a.x.toFixed(1)}" y2="${a.y.toFixed(1)}" class="wi-ray"/>
                       <circle cx="${(a.x + LIGHT.dirX * L).toFixed(1)}" cy="${(a.y + LIGHT.dirY * L).toFixed(1)}"
                             r="5" class="wi-sun"/>`;
        return line + dots + arrow;
    },

    // ---------- НАКЛАДКА «РАКУРС» ----------
    // Каждая сущность покрашена по своему способу ответа. Вещь, назначенная
    // не тем способом, видна сразу: она красная там, где всё вокруг синее.
    drawYawRoles(h) {
        return WormParts.list().map(e => {
            if (!e.yawRole) return '';
            const c = WormParts.client(h, e.key);
            if (!c) return '';
            const col = WORM_INSPECT_YAW_COLORS[e.yawRole] || WORM_INSPECT_YAW_COLORS.none;
            return `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4.5"
                        fill="${col}" class="wi-role"/>`;
        }).join('');
    },

    // ---------- НАКЛАДКА «ПЛОТНОСТЬ» ----------
    // Тепловая карта: сколько фигур на клетку. Отвечает на «не сыпь ли» —
    // правило дозировки из арт-дирекшна глазами не проверяется, когда
    // деталей шестьсот.
    drawDensity(h) {
        const root = h.svgRoot.querySelector('.worm-root');
        if (!root) return '';
        const b = root.getBoundingClientRect();
        const N = 10, cw = b.width / N, ch = b.height / N;
        const grid = new Array(N * N).fill(0);
        root.querySelectorAll('path,ellipse,circle,rect').forEach(el => {
            const r = el.getBoundingClientRect();
            if (!r.width && !r.height) return;
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            const i = Math.floor((cx - b.left) / cw), j = Math.floor((cy - b.top) / ch);
            if (i < 0 || j < 0 || i >= N || j >= N) return;
            grid[j * N + i]++;
        });
        const max = Math.max(1, ...grid);
        return grid.map((v, k) => {
            if (!v) return '';
            const i = k % N, j = Math.floor(k / N);
            return `<rect x="${(b.left + i * cw).toFixed(1)}" y="${(b.top + j * ch).toFixed(1)}"
                        width="${cw.toFixed(1)}" height="${ch.toFixed(1)}"
                        fill="#ff3b30" opacity="${(0.06 + 0.5 * v / max).toFixed(3)}"
                        class="wi-heat"/>`;
        }).join('');
    },

    // ---------- НАКЛАДКА «ГЛУБИНА» ----------
    // Что перед чем. Слои перечислены в порядке рисования и подписаны
    // номером: спор «почему кольца поверх наряда» решается взглядом.
    drawDepth(h) {
        const root = h.svgRoot.querySelector('.worm-root');
        if (!root) return '';
        const seen = [];
        WormParts.list().forEach(e => {
            if (e.kind !== 'layer') return;
            const el = root.querySelector('.' + e.cls);
            if (!el) return;
            const r = el.getBoundingClientRect();
            if (!r.width) return;
            seen.push({ title: e.title, y: r.top + r.height / 2, x: r.left + r.width });
        });
        const b = root.getBoundingClientRect();
        return seen.map((s, i) =>
            `<text x="${(b.right + 8).toFixed(1)}" y="${(b.top + 12 + i * 13).toFixed(1)}"
                class="wi-depth">${i + 1}. ${s.title}</text>`).join('');
    },

    drawCost(h) {
        const el = this.panel.querySelector('[data-out="copied"]');
        if (!el || typeof h.getFrameStats !== 'function') return;
        const f = h.getFrameStats();
        el.textContent = `${f.frameMs} мс · деформация ${f.geomPart}`;
    },

    // ---------- ПАНЕЛЬ ----------
    renderPanel() {
        this.root.classList.toggle('wi-edit', this.mode === 'edit');
        this.root.classList.toggle('wi-dragging', !!this.drag);
        this.panel.querySelector('.wi-main').classList.toggle('active', this.on);
        this.panel.querySelector('[data-act="mode-pick"]').classList.toggle('active', this.mode === 'pick');
        this.panel.querySelector('[data-act="mode-problem"]').classList.toggle('active', this.mode === 'problem');
        this.panel.querySelector('[data-act="mode-edit"]').classList.toggle('active', this.mode === 'edit');
        this.panel.querySelector('[data-act="freeze"]').classList.toggle('active', !!this.frozen);
        WORM_INSPECT_OVERLAYS.forEach(o =>
            this.panel.querySelector(`[data-ov="${o.key}"]`).classList.toggle('active', !!this.overlays[o.key]));

        const out = this.panel.querySelector('[data-out="pick"]');
        const p = this.picked;
        if (!p) out.textContent = 'ничего не выбрано';
        else {
            const k = p.entity.knobs || [];
            const deep = this.stackAt && this.stackAt.length > 1
                ? ` · слой ${this.depth + 1} из ${this.stackAt.length}` : '';
            out.innerHTML = `<b>${p.title}</b> <span class="wi-dim">(${p.entity.kind})</span>${deep}`
                + (k.length ? `<br><span class="wi-dim">ручки: ${k.join(', ')}</span>` : '');
        }
        this.renderKnobs();
        const steps = this.panel.querySelector('[data-out="steps"]');
        const patch = WormLook.patch();
        const n = Object.keys(patch).filter(k => k !== 'lock').length;
        steps.textContent = n ? `${n} правок` : 'без правок';

        const ta = this.panel.querySelector('[data-out="ctx"]');
        ta.value = this.ctx ? JSON.stringify(this.ctx, null, 1) : '';
    },

    // ---------- РУЧКИ ВЫБРАННОГО ----------
    // Показываются ТОЛЬКО те, что влияют на выбранное. Список из тридцати
    // ползунков — это не пульт, а приборная доска самолёта: искать в нём
    // нужный дольше, чем править число руками.
    renderKnobs() {
        const host = this.panel.querySelector('[data-out="knobs"]');
        const p = this.picked;
        const key = p ? p.entity.key : '';
        // Пересобираем ряд ТОЛЬКО когда сменилось выбранное. Пока выбрано то
        // же самое, обновляются числа, а узлы ползунков остаются на месте:
        // пересобранный под пальцем ползунок обрывает перетаскивание.
        if (key === this.knobsFor && host.children.length) { this.syncKnobs(host); return; }
        this.knobsFor = key;
        if (!p) { host.innerHTML = ''; return; }
        // У ориентира черепа своя ручка — ПЕРЕКОС его стороны, и он не из
        // общего списка. Показать его надо обязательно: именно он двигается
        // при перетаскивании, и панель, где после рывка мышкой всё осталось
        // на нуле, выглядит сломанной.
        let skewRow = '';
        if (p.entity.kind === 'landmark' && p.entity.skull && p.entity.skull.side !== 0) {
            const name = { forehead: 'brow', temple: 'temple', cheek: 'cheek',
                           jowl: 'jaw', 'muzzle-edge': 'muzzle' }[p.entity.key.replace(/-(left|right)$/, '')];
            if (name) {
                const sk = name + (p.entity.skull.side < 0 ? 'L' : 'R');
                const v = (WormLook.skew && WormLook.skew[sk]) || 0;
                skewRow = `<div class="wi-row">
                    <span class="wi-lbl" title="${sk}">перекос</span>
                    <input type="range" data-skew="${sk}" min="-0.6" max="0.6" step="0.02" value="${v}">
                    <span class="wi-val">${v >= 0 ? '+' : ''}${v.toFixed(2)}</span>
                </div>`;
            }
        }
        const keys = (p.entity.knobs || []).filter(k => WormLook.knob(k));
        if (!keys.length && !skewRow) { host.innerHTML = '<span class="wi-dim">у этой вещи ручек нет</span>'; return; }
        host.innerHTML = skewRow + keys.map(key => {
            const k = WormLook.knob(key);
            const v = WormLook.values[key] || 0;
            const locked = WormLook.isLocked(key);
            return `<div class="wi-row">
                <span class="wi-lbl" title="${key}">${k.title}</span>
                <input type="range" data-knob="${key}" min="-1" max="1" step="0.02"
                       value="${v}"${locked ? ' disabled' : ''}>
                <span class="wi-val">${v >= 0 ? '+' : ''}${v.toFixed(2)}</span>
            </div>`;
        }).join('');
    },

    // Обновление чисел без пересборки. Ползунок, которым СЕЙЧАС управляют,
    // не трогаем вовсе: запись в `value` посреди жеста дёргает бегунок.
    syncKnobs(host) {
        host.querySelectorAll('input[data-knob],input[data-skew]').forEach(inp => {
            const k = inp.getAttribute('data-knob');
            const sk = inp.getAttribute('data-skew');
            const v = k ? (WormLook.values[k] || 0)
                        : ((WormLook.skew && WormLook.skew[sk]) || 0);
            if (document.activeElement !== inp) inp.value = String(v);
            const out = inp.closest('.wi-row').querySelector('.wi-val');
            if (out) out.textContent = (v >= 0 ? '+' : '') + v.toFixed(2);
            const locked = k ? WormLook.isLocked(k) : false;
            inp.disabled = locked;
        });
    }
};

if (typeof window !== 'undefined') {
    window.WormInspect = WormInspect;
    // Инициализация после загрузки: панель кладётся в #game-container, а он
    // появляется вместе с разметкой.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => WormInspect.init());
    } else {
        WormInspect.init();
    }
}
