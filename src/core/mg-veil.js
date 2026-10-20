// ================= ПОКРОВ: ВХОД В МИНИ-ИГРУ И ВЫХОД ИЗ НЕЁ =================
// Общий механизм перехода (CLAUDE.md, инвариант 8; docs/plan/
// 25-lust-foam-transition.md). Материал греха (у похоти — пена) заливает
// экран, под ним мини-игра открывается и дозревает, потом материал уходит,
// оставляя рамку окна. На выходе — обратно: рамка нарастает внутрь, под
// покровом игра закрывается и оживает комната, покров уходит целиком.
//
//   ВХОД                                  ВЫХОД
//   cover   — покров заливает экран       close — от рамки внутрь, до полного
//   open()  — под покровом                leave — мини-игра закрывается
//   ready   — ждём, пока игра дозреет      (кадр-другой на первый кадр комнаты)
//   reveal  — уходит, остаётся рамка      clear — покров уходит целиком
//
// Покров не знает, ЧТО рисует. Вид — у шкурки окна (MinigameWindow, опция
// skin): skin.veilStart(ctx, mode) — начало хода, skin.veil(ctx, mode, p) —
// кадр на доле p ∈ [0, 1] в единицах холста 390×844. Холст между кадрами
// не чистится (см. frame). Длительности — skin.VEIL_MS[mode]. У окна без шкурки (или шкурки без veil) перехода нет:
// игра открывается и закрывается как раньше.
//
// Время — только для картинки (rAF и performance.now): состояние игры покров
// не трогает (инварианты 1, 2). Пока покров на экране, он ловит касания:
// тап по пене в сцену не проходит.
//
// В автотестах (navigator.webdriver) покрова нет, если страница не просит
// его сама (window.SVINO_VEIL = 1): иначе каждый прогон ждал бы переходы.
const MgVeil = {
    el: null,
    cv: null,
    busy: false,     // идёт переход — второй вход/выход не начинается
    state: null,     // 'enter' | 'leave' | 'knock' — что сейчас на покрове
    knocks: 0,       // нажатий крестика подряд в забеге (knock)
    _run: 0,

    enabled() {
        if (typeof document === 'undefined') return false;
        if (typeof navigator !== 'undefined' && navigator.webdriver && !window.SVINO_VEIL) return false;
        return true;
    },

    // Есть ли у окна чем рисовать переход.
    skinOf(win) {
        return win && win.skin && typeof win.skin.veil === 'function' ? win.skin : null;
    },

    // Холст покрова — во весь холст сцены, поверх окон мини-игр. Живёт только
    // на время перехода: прозрачный слой во весь экран смешивается со сценой
    // каждый кадр (замер на рамке ванной), держать его просто так нельзя.
    show(skin) {
        if (!this.el) {
            this.el = document.createElement('div');
            this.el.id = 'mg-veil';
            this.cv = document.createElement('canvas');
            this.el.appendChild(this.cv);
            // Тап по покрову гасится: под ним либо собирается игра, либо
            // уже закрывается — ни туда, ни туда пальцу нельзя. Кроме места,
            // где нарисован крестик: на входе это отмена (cancelEnter).
            this.el.addEventListener('pointerdown', (e) => {
                e.stopPropagation(); e.preventDefault();
                if (this.state === 'enter' && this.onCross(e)) this.cancelEnter();
            });
        }
        const host = document.getElementById('game-container') || document.body;
        if (this.el.parentNode !== host) host.appendChild(this.el);
        const st = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stage-scale')) || 1;
        this.hiScale = Math.min(2, (window.devicePixelRatio || 1) * st);
        this.loScale = Math.min(this.MOTION_SCALE, this.hiScale);
        this.skin = skin;
        this.setScale(this.loScale);
        this.el.style.display = '';
    },

    // ---------- РАЗРЕШЕНИЕ ----------
    // Пока покров ДВИЖЕТСЯ — холст в MOTION_SCALE (точка холста на единицу
    // сцены): на пене ванной в полном разрешении кадр перехода стоил 50–90 мс
    // под 4× замедлением, в единичном — 21–30, почти как без покрова. В
    // движении мягкость не видна. Пока покров СТОИТ (игра дозревает под ним
    // полсекунды-две) — он один раз перерисовывается в полном разрешении
    // (skin.veilStill): неподвижную мыльную пену уже видно.
    MOTION_SCALE: 1,
    setScale(s) {
        const W = Math.round(STAGE_W * s), H = Math.round(STAGE_H * s);
        if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
        this.scale = s;
    },
    still() {
        if (!this.skin.veilStill) return;
        this.setScale(this.hiScale);
        this.skin.veilStill(this.ctx());
    },

    hide() {
        if (this.el) { this.el.style.display = 'none'; this.el.classList.remove('mg-veil-thru'); }
        if (this.cv) this.cv.getContext('2d').clearRect(0, 0, this.cv.width, this.cv.height);
        this.state = null;
    },

    // Касание в зоне нарисованного крестика (та же зона, что у кнопки окна).
    onCross(e) {
        const C = this.win && this.win.skin && this.win.skin.cross;
        if (!C) return false;
        const r = this.el.getBoundingClientRect();
        const x = (e.clientX - r.left) * STAGE_W / r.width, y = (e.clientY - r.top) * STAGE_H / r.height;
        const h = Math.max(48, C.size + 12) / 2;
        return Math.abs(x - C.x) < h && Math.abs(y - C.y) < h;
    },

    // Холст между кадрами НЕ чистится: шкурка дорисовывает и стирает только
    // то, что изменилось за кадр (пена ванной — тысячи пузырей, целиком их
    // каждый кадр не перерисовать). Начало хода — skin.veilStart.
    ctx() {
        const ctx = this.cv.getContext('2d');
        ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
        return ctx;
    },

    frame(mode, p) {
        this.skin.veil(this.ctx(), mode, p, this.scale);
    },

    // Один ход перехода: кадры от 0 до 1 за VEIL_MS[mode]. Последний кадр —
    // ровно p = 1, даже если вкладку усыпили посреди хода.
    play(mode, run) {
        const ms = (this.skin.VEIL_MS && this.skin.VEIL_MS[mode]) || 300;
        // Смена размера холста стирает его — шкурка в veilStart рисует
        // начальное состояние хода заново, в той же задаче, без пустого кадра.
        this.setScale(this.loScale);
        if (this.skin.veilStart) this.skin.veilStart(this.ctx(), mode);
        return new Promise((done) => {
            const t0 = performance.now();
            const tick = () => {
                if (run !== this._run) return done(false);
                const p = Math.min(1, (performance.now() - t0) / ms);
                this.frame(mode, p);
                if (p >= 1) return done(true);
                requestAnimationFrame(tick);
            };
            tick();
        });
    },

    nextFrames(n) {
        return new Promise((done) => {
            const step = () => (--n <= 0 ? done() : requestAnimationFrame(step));
            requestAnimationFrame(step);
        });
    },

    // ---------- ВХОД ----------
    // minigame — объект мини-игры (open(), win). Готовность — minigame.veilReady():
    // обещание «всё нужное дозрело»; нет такого — ждём два кадра.
    async enter(minigame) {
        const win = minigame && minigame.win, skin = this.skinOf(win);
        if (this.busy) return;                       // двойной тап посреди перехода
        if (!skin || !this.enabled()) { minigame.open(); return; }
        const run = ++this._run;
        this.busy = true;
        this.stopKnock();
        // Рамка уже нарисована в простое (MinigameWindow.wearSkin); не
        // успела — дорисуется здесь, до первого кадра покрова.
        if (win.ensureSkin) win.ensureSkin();
        this.show(skin);
        this.win = win;
        this.state = 'enter';
        this._entering = { minigame, opened: false };
        try {
            if (!await this.play('cover', run)) return;
            this.still();
            // Открываем ПОД покровом, а не одновременно с заливкой: сборка
            // сцены держит поток сотни миллисекунд, и ход заливки съела бы.
            minigame.open();
            this._entering.opened = true;
            await (minigame.veilReady ? minigame.veilReady() : this.nextFrames(2));
            if (run !== this._run) return;
            if (!await this.play('reveal', run)) return;
        } finally {
            if (run === this._run) { this.hide(); this.busy = false; }
        }
    },

    // Передумал на входе: тап по месту крестика, пока пена заливает экран
    // или игра дозревает под ней. Ход разворачивается: игра (если уже
    // открыта) закрывается под пеной, пена уходит.
    async cancelEnter() {
        if (this.state !== 'enter') return;
        const run = ++this._run, E = this._entering;
        this.state = 'leave';
        try {
            if (E && E.opened && E.minigame.close) E.minigame.close();
            await this.nextFrames(2);
            if (run !== this._run) return;
            await this.play('clear', run);
        } finally {
            if (run === this._run) { this.hide(); this.busy = false; }
        }
    },

    // ---------- ВЫХОД ----------
    // win — окно мини-игры, onLeave — что закрывает игру. Без шкурки —
    // просто onLeave(), как раньше. fromKnock — третье нажатие в забеге:
    // экран уже наполовину в пене, она дорастает (finish), а не нарастает
    // от рамки заново.
    async leave(win, onLeave, fromKnock) {
        const skin = this.skinOf(win);
        if (this.busy) return;
        if (!skin || !this.enabled()) { onLeave(); return; }
        const run = ++this._run;
        this.busy = true;
        clearTimeout(this._popT);
        this.knocks = 0;
        if (!fromKnock || !this.state) this.show(skin);
        this.el.classList.remove('mg-veil-thru');
        this.win = win;
        this.state = 'leave';
        try {
            if (!await this.play(fromKnock ? 'finish' : 'close', run)) return;
            onLeave();
            // Комната под покровом оживает с первого кадра — его и ждём, чтобы
            // покров раскрылся на собранную комнату, а не на пустую.
            await this.nextFrames(2);
            if (run !== this._run) return;
            await this.play('clear', run);
        } finally {
            if (run === this._run) { this.hide(); this.busy = false; }
        }
    },

    // ---------- ВЫХОД ИЗ ЗАБЕГА: НЕСКОЛЬКО НАЖАТИЙ ----------
    // Окна «точно выйти?» у игры со шкуркой нет (CLAUDE.md, инвариант 8):
    // посреди забега крестик надо нажать KNOCKS раз подряд, и каждое нажатие
    // что-то делает с экраном (у пены — бросает грозди, skin: ход 'burst').
    // Последнее нажатие и есть начало выхода. Не нажал следующий раз за
    // POP_DELAY — брошенное уходит (ход 'pop'), счёт с нуля.
    //
    // Пока грозди висят, игра идёт: покров пропускает касания насквозь
    // (mg-veil-thru), в том числе на крестик окна — следующее нажатие.
    KNOCKS: 3,
    POP_DELAY: 1000,
    knock(win, onLeave) {
        const skin = this.skinOf(win);
        if (this.busy || !skin) return;
        clearTimeout(this._popT);
        this.knocks++;
        if (this.knocks >= this.KNOCKS) { this.leave(win, onLeave, true); return; }
        const run = ++this._run;
        if (this.state !== 'knock') this.show(skin);
        this.el.classList.add('mg-veil-thru');
        this.win = win;
        this.state = 'knock';
        this.play('burst', run);
        this._popT = setTimeout(() => this.pop(), this.POP_DELAY);
    },

    pop() {
        if (this.state !== 'knock') return;
        const run = ++this._run;
        this.knocks = 0;
        this.play('pop', run).then((ok) => { if (ok && run === this._run) this.hide(); });
    },

    // Брошенное убирается без хода: вход и выход начинают с чистого покрова.
    stopKnock() {
        clearTimeout(this._popT);
        this.knocks = 0;
    }
};
