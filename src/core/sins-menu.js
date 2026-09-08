// ================= МЕНЮ ГРЕХОВ =================
// Семь шкал больше не висят в комнате. Меню открывается удержанием пальца на
// самом червя (0.7 с) и занимает весь экран: в центре логотип игры, из него
// расходятся семь рваных лучей, каждый заканчивается узлом со значком греха.
//
// ---------- ЧТО ЗДЕСЬ ПОКАЗАНО ----------
// Луч наливается НЕ шкалой греха, а её нехваткой: шкала падает — по жиле
// течёт энергия и копится в узле. Дошло до половины (ECONOMY.readyBelow) —
// узел загорается: мини-игра теперь платит полную награду.
//
// Так одна картинка отвечает сразу на два вопроса, которые раньше требовали
// слов: «насколько просел грех» и «дадут ли за него что-нибудь». Играть
// можно в любой момент — тап по любому узлу открывает мини-игру, погасший
// узел просто означает «шкалу зальёшь, но ничего не получишь».
//
// ---------- ПОЧЕМУ УДЕРЖАНИЕ, А НЕ КНОПКА ----------
// Кнопка — это ещё один предмет в комнате, который надо куда-то поставить и
// как-то объяснить без слов. Червь на экране один, он же и есть тот, у кого
// эти грехи, — держать палец на нём понятнее любой иконки. Закрывается меню
// тем же жестом на логотипе: жест ровно один.
const SinsMenu = {

    // Длина удержания. Меньше — меню открывается от случайного тапа по
    // червю (а тап по нему уже значит «повозиться»); больше — палец успевает
    // решить, что игра его не слышит.
    HOLD_MS: 700,

    // Сколько пикселей пальцу позволено проехать, не отменяя удержание.
    // Палец не стоит на месте никогда, а по комнате этим же жестом ездит
    // камера — порог разделяет удержание и панораму.
    MOVE_TOLERANCE: 12,

    // ---------- ГЕОМЕТРИЯ КОЛЕСА (в единицах холста 390×844) ----------
    CX: 195,
    CY: 424,
    RX: 147,          // размах вбок: узел с запасом влезает в ширину холста
    RY: 250,          // вниз-вверх места больше — колесо вытянуто по экрану
    NODE_R: 26,
    CORE_R: 52,

    el: null,
    svg: null,
    parts: null,      // узлы по грехам: сюда пишет update()
    opened: false,
    _hold: null,
    _downKey: null,
    _closeTimer: null,

    init() {
        if (this.el) return;
        this.build();
        this.attachWorm();
    },

    // ---------- СБОРКА ----------
    build() {
        const host = document.getElementById('game-container') || document.body;

        this.el = document.createElement('div');
        this.el.id = 'sins-menu';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${STAGE_W} ${STAGE_H}`);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        this.svg = svg;

        let markup = '';
        this.parts = {};

        const order = ECONOMY.sinOrder;
        const step = (Math.PI * 2) / order.length;

        order.forEach((key, i) => {
            const sin = ECONOMY.sins[key];
            if (!sin) return;
            // Первый луч смотрит вверх, дальше по кругу. Не «как удобно
            // рисовать», а так же, как перечислены грехи в конфиге: порядок
            // узлов не должен зависеть от порядка обхода объекта.
            const a = -Math.PI / 2 + i * step;
            const node = {
                x: this.CX + Math.cos(a) * this.RX,
                y: this.CY + Math.sin(a) * this.RY
            };
            const ray = this.rayPath(node, i);
            const shell = this.roughCircle(node.x, node.y, this.NODE_R, i * 7 + 3);

            markup += `
                <g class="sm-sin" data-sin="${key}" style="color:${sin.color}">
                    <path class="sm-ray-base" d="${ray}" stroke="${sin.color}"></path>
                    <path class="sm-ray-flow" d="${ray}" stroke="${sin.color}"
                          pathLength="100" stroke-dasharray="0 100"></path>
                    <g class="sm-node">
                        <path class="sm-node-glow" d="${this.roughCircle(node.x, node.y, this.NODE_R + 9, i * 7 + 11)}"
                              fill="${sin.color}"></path>
                        <path class="sm-node-shell" d="${shell}" fill="#100b10" stroke="${sin.color}"></path>
                        <path class="sm-node-tint" d="${shell}" fill="${sin.color}"></path>
                        <text class="sm-mark" x="${node.x.toFixed(1)}" y="${(node.y + 1).toFixed(1)}">${sin.emoji}</text>
                    </g>
                    <circle class="sm-hit" cx="${node.x.toFixed(1)}" cy="${node.y.toFixed(1)}"
                            r="${this.NODE_R + 12}" fill="#000" fill-opacity="0"></circle>
                </g>`;
        });

        // Центр. Логотип игры — та же иконка, что стоит на домашнем экране:
        // одна картинка на всю игру, а не второй, нарисованный отдельно знак.
        const coreClip = 'sm-core-clip';
        markup += `
            <g class="sm-core">
                <clipPath id="${coreClip}">
                    <path d="${this.roughCircle(this.CX, this.CY, this.CORE_R - 6, 99)}"></path>
                </clipPath>
                <path class="sm-core-ring" d="${this.roughCircle(this.CX, this.CY, this.CORE_R, 41)}"
                      fill="#0d0a0d" stroke="#e8dcc8"></path>
                <image href="icons/icon-192.png" clip-path="url(#${coreClip})"
                       x="${this.CX - this.CORE_R + 6}" y="${this.CY - this.CORE_R + 6}"
                       width="${(this.CORE_R - 6) * 2}" height="${(this.CORE_R - 6) * 2}"></image>
                <circle class="sm-hold" cx="${this.CX}" cy="${this.CY}" r="${this.CORE_R + 8}"
                        stroke="#e8dcc8" pathLength="100"
                        stroke-dasharray="100" stroke-dashoffset="100"
                        transform="rotate(-90 ${this.CX} ${this.CY})"></circle>
                <circle class="sm-core-hit" cx="${this.CX}" cy="${this.CY}" r="${this.CORE_R + 10}"
                        fill="#000" fill-opacity="0"></circle>
            </g>`;

        svg.innerHTML = markup;
        this.el.appendChild(svg);
        host.appendChild(this.el);

        // Ссылки берутся один раз: искать их на каждой перерисовке — это семь
        // обходов документа в секунду по странице с огромным SVG персонажа.
        ECONOMY.sinOrder.forEach(key => {
            const g = svg.querySelector(`.sm-sin[data-sin="${key}"]`);
            if (!g) return;
            this.parts[key] = {
                group: g,
                flow: g.querySelector('.sm-ray-flow'),
                shownFill: null,
                shownReady: null
            };
        });

        this.holdRing = svg.querySelector('.sm-hold');
        this.bindTaps();
        this.buildWormRing(host);
    },

    // Луч: не прямая, а излом. Точки считаются от направления «центр → узел»,
    // поэтому излом одинаково ложится на любой угол, а не подгоняется руками
    // под каждый из семи (docs/traps.md, п. 5 — координаты меряются, а не
    // вбиваются).
    rayPath(node, i) {
        const dx = node.x - this.CX;
        const dy = node.y - this.CY;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const px = -uy, py = ux;                 // перпендикуляр к лучу

        // Луч не начинается в самом центре: там логотип.
        const from = this.CORE_R + 6;
        const to = len - this.NODE_R - 1;
        const s = (i % 2) ? -1 : 1;              // изломы смотрят в разные стороны
        const kinks = [
            { t: 0.00, off: 0 },
            { t: 0.34, off: 13 * s },
            { t: 0.68, off: -10 * s },
            { t: 1.00, off: 0 }
        ];

        return kinks.map((k, n) => {
            const r = from + (to - from) * k.t;
            const x = this.CX + ux * r + px * k.off;
            const y = this.CY + uy * r + py * k.off;
            return `${n ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
        }).join(' ');
    },

    // Кружок, нарисованный рукой: девять вершин с рваным радиусом. Ровная
    // окружность рядом с изломанным лучом читается как чужая деталь —
    // печать поверх рисунка.
    roughCircle(cx, cy, r, seed) {
        const n = 9;
        let d = '';
        for (let k = 0; k < n; k++) {
            const a = -Math.PI / 2 + (k / n) * Math.PI * 2;
            const rr = r * (0.9 + 0.2 * this.noise(seed, k));
            const x = cx + Math.cos(a) * rr;
            const y = cy + Math.sin(a) * rr;
            d += `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
        }
        return d + 'Z';
    },

    // Псевдослучайное, но ПОСТОЯННОЕ: форма узла не должна меняться от
    // открытия к открытию — иначе картинка «дышит» сама по себе.
    noise(seed, k) {
        const x = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453;
        return x - Math.floor(x);
    },

    // Кольцо удержания на червя. Живёт снаружи меню: рисуется, когда меню
    // ещё закрыто, в точке, где лежит палец.
    buildWormRing(host) {
        const ring = document.createElement('div');
        ring.id = 'hold-ring';
        ring.innerHTML = `
            <svg viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" stroke="#e8dcc8" stroke-opacity="0.22" stroke-width="4"></circle>
                <circle class="arc" cx="50" cy="50" r="44" stroke="#e8dcc8" stroke-width="4"
                        pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"
                        transform="rotate(-90 50 50)"></circle>
            </svg>`;
        host.appendChild(ring);
        this.wormRing = ring;
        this.wormArc = ring.querySelector('.arc');
    },

    // ---------- ТАПЫ ПО МЕНЮ ----------
    bindTaps() {
        // Один обработчик на всё меню, а не семь: узлы не появляются и не
        // исчезают, но плодить одинаковые подписки незачем.
        this.svg.addEventListener('pointerdown', (e) => {
            const core = e.target.closest && e.target.closest('.sm-core');
            if (core) {
                this.startHold(e, this.CX, this.CY, () => this.close(), true);
                return;
            }
            const g = e.target.closest && e.target.closest('.sm-sin');
            if (g) {
                g.classList.add('press');
                this._downKey = g.getAttribute('data-sin');
            } else {
                this._downKey = null;
            }
        });

        this.svg.addEventListener('pointerup', (e) => {
            const g = e.target.closest && e.target.closest('.sm-sin');
            this.svg.querySelectorAll('.sm-sin.press').forEach(n => n.classList.remove('press'));
            const key = g && g.getAttribute('data-sin');
            const down = this._downKey;
            this._downKey = null;
            // Мини-игра открывается только тем пальцем, который на этом узле
            // и опустился. Иначе меню, открытое удержанием на червя, ловило
            // бы ОТПУСКАНИЕ того же пальца — а он в этот момент лежит
            // где-то на теле, то есть запросто поверх узла — и мини-игра
            // запускалась бы сама, вместо того чтобы показать меню.
            if (!key || key !== down) return;
            // Игру открывает GameManager: он же закроет меню и знает, какая
            // игра за каким грехом. Меню только сообщает, куда нажали.
            if (typeof GameManager !== 'undefined') GameManager.handleSinAction(key);
        });

        this.svg.addEventListener('pointercancel', () => {
            this._downKey = null;
            this.svg.querySelectorAll('.sm-sin.press').forEach(n => n.classList.remove('press'));
            this.cancelHold();
        });

        this.svg.addEventListener('pointermove', (e) => this.trackHold(e));
    },

    // ---------- УДЕРЖАНИЕ НА ЧЕРВЕ ----------
    // Слушаем контейнер сцены, а не сам SVG червя: рендерер на pointerdown
    // забирает захват указателя себе (панорама комнаты), и после этого все
    // pointermove адресуются ЕМУ — но всплывают дальше, до контейнера.
    attachWorm() {
        const stage = document.getElementById('worm-stage');
        if (!stage || stage._sinsMenuBound) return;
        stage._sinsMenuBound = true;

        stage.addEventListener('pointerdown', (e) => {
            if (this.opened) return;
            const t = e.target;
            // Только по телу. Тап по полу — это «иди сюда», по кучке — уборка;
            // забирать у них долгое нажатие нельзя.
            if (!t || !t.closest || !t.closest('.worm-char-layer')) return;
            const p = this.toStage(e);
            this.startHold(e, p.x, p.y, () => this.open(), false);
        });

        stage.addEventListener('pointermove', (e) => this.trackHold(e));
        stage.addEventListener('pointerup', () => this.cancelHold());
        stage.addEventListener('pointercancel', () => this.cancelHold());
        // Долгое нажатие на телефоне — это ещё и системное меню «сохранить
        // картинку». Без этого оно всплывает ровно в тот момент, когда меню
        // открывается, и перекрывает его.
        stage.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    // Экранные координаты → единицы холста. Холст масштабируется целиком,
    // поэтому делим на его реальный размер, а не на размер окна.
    toStage(e) {
        const host = document.getElementById('game-container');
        const r = host ? host.getBoundingClientRect() : null;
        if (!r || !r.width) return { x: this.CX, y: this.CY };
        return {
            x: (e.clientX - r.left) / r.width * STAGE_W,
            y: (e.clientY - r.top) / r.height * STAGE_H
        };
    },

    // Общий счётчик удержания: один и тот же и на открытие, и на закрытие.
    // Прогресс показывается кольцом — переходом css, а не покадровой
    // анимацией: считать здесь нечего, а кадры на телефоне дороги.
    startHold(e, x, y, done, atCore) {
        this.cancelHold();
        this._hold = {
            id: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            done,
            atCore,
            timer: setTimeout(() => {
                this._hold = null;
                this.hideRings();
                done();
            }, this.HOLD_MS)
        };
        if (atCore) this.runArc(this.holdRing);
        else this.showWormRing(x, y);
    },

    trackHold(e) {
        const h = this._hold;
        if (!h || e.pointerId !== h.id) return;
        const moved = Math.hypot(e.clientX - h.startX, e.clientY - h.startY);
        // Экранные пиксели, а не единицы холста: порог должен быть про палец,
        // а не про масштаб окна.
        if (moved > this.MOVE_TOLERANCE) this.cancelHold();
    },

    cancelHold() {
        if (!this._hold) return;
        clearTimeout(this._hold.timer);
        this._hold = null;
        this.hideRings();
    },

    // Кольцо: сброс без перехода, потом переход на полный круг. Две записи
    // подряд браузер склеил бы в одну и анимации бы не вышло — отсюда
    // принудительное чтение раскладки между ними.
    runArc(arc) {
        if (!arc) return;
        arc.style.transition = 'none';
        arc.style.strokeDashoffset = '100';
        arc.classList.add('holding');
        void arc.getBoundingClientRect();
        arc.style.transition = `stroke-dashoffset ${this.HOLD_MS}ms linear`;
        arc.style.strokeDashoffset = '0';
    },

    showWormRing(x, y) {
        if (!this.wormRing) return;
        this.wormRing.style.left = x.toFixed(1) + 'px';
        this.wormRing.style.top = y.toFixed(1) + 'px';
        this.wormRing.classList.add('on');
        this.runArc(this.wormArc);
    },

    hideRings() {
        if (this.wormRing) this.wormRing.classList.remove('on');
        if (this.wormArc) {
            this.wormArc.style.transition = 'none';
            this.wormArc.style.strokeDashoffset = '100';
        }
        if (this.holdRing) {
            this.holdRing.classList.remove('holding');
            this.holdRing.style.transition = 'none';
            this.holdRing.style.strokeDashoffset = '100';
        }
    },

    // ---------- ОТКРЫТЬ / ЗАКРЫТЬ ----------
    open() {
        if (!this.el || this.opened) return;
        this.opened = true;
        this._downKey = null;
        clearTimeout(this._closeTimer);
        this.el.style.display = 'block';
        this.update(true);
        // Комната под меню не видна, но продолжает считать кадры: персонаж —
        // самая дорогая вещь на экране (docs/traps.md, п. 36).
        const h = window.MainWormHandle;
        if (h && typeof h.setPaused === 'function') h.setPaused(true);
        // Класс — следующим кадром, иначе перехода прозрачности не выйдет:
        // элемент в этот момент ещё display:none.
        requestAnimationFrame(() => this.el.classList.add('active'));
    },

    close() {
        if (!this.el || !this.opened) return;
        this.opened = false;
        this.cancelHold();
        this.el.classList.remove('active');
        const h = window.MainWormHandle;
        if (h && typeof h.setPaused === 'function') h.setPaused(false);
        // Прячем совсем — но после того, как доиграет затухание.
        clearTimeout(this._closeTimer);
        this._closeTimer = setTimeout(() => {
            if (!this.opened) this.el.style.display = 'none';
        }, 200);
    },

    // Закрыть немедленно: перед открытием мини-игры ждать затухание нечего.
    closeInstant() {
        if (!this.el) return;
        this.opened = false;
        this.cancelHold();
        clearTimeout(this._closeTimer);
        this.el.classList.remove('active');
        this.el.style.display = 'none';
    },

    // ---------- ПОКАЗ ЗНАЧЕНИЙ ----------
    // Источник — GameState: значение шкалы считается на момент обращения, в
    // меню оно не хранится. Пишем только то, что изменилось: закрытое меню
    // не трогаем вовсе, а открытое — раз в секунду и на десятую процента.
    update(force) {
        if (!this.parts || !GameState.data) return;
        if (!this.opened && !force) return;

        ECONOMY.sinOrder.forEach(key => {
            const p = this.parts[key];
            if (!p) return;

            const max = GameState.maxValue(key) || 1;
            const value = GameState.sinValue(key);
            // По жиле течёт НЕХВАТКА: полная шкала — пустой луч, просевшая —
            // налитый. Копится ровно то, за чем игрок сюда придёт.
            const need = Math.max(0, Math.min(100, 100 - (value / max) * 100));
            const shown = Math.round(need * 10) / 10;
            const ready = value < max * ECONOMY.readyBelow;

            if (force || p.shownFill !== shown) {
                p.flow.setAttribute('stroke-dasharray', `${shown} 100`);
                p.shownFill = shown;
            }
            if (force || p.shownReady !== ready) {
                p.group.classList.toggle('ready', ready);
                p.shownReady = ready;
            }
        });
    }
};

if (typeof window !== 'undefined') window.SinsMenu = SinsMenu;
