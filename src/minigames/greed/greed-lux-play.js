// ================= АППАРАТ АЛЧНОСТИ, ВЕРСИЯ 2: БАНДИТ =================
// Продолжение GreedLux (greed-lux.js): рычаг, LED-экран барабанов, лампа
// готовности (план 31, разд. 5а, этап 2).
//
// Механика — та же, что у гаражного аппарата, его же функциями
// (greed-junk-lit.js, greed-junk-lit-reels.js): храповик рычага с зубцами,
// срыв, падение с отскоком, пружина, отдача в палец; ленты — замах, разгон,
// остановка по очереди ровно на исход крутки. Меняется только вид:
//   * рычаг — шар чёрного лака едет по пазу колонны (карты шара — свои,
//     lux/ball-*.png, свет — тем же шейдером, что корпус);
//   * барабаны — LED-экран: свой холст 81×54 светодиода, три ленты в
//     окнах, средний ряд подсвечен, красная линия выигрыша;
//   * лампа готовности — горит, когда рычаг можно дёргать.
Object.assign(GreedLux, {
    // ---------- механика гаражного аппарата ----------
    SPIN: GreedJunkLit.SPIN,
    LEVER: GreedJunkLit.LEVER,
    spin: GreedJunkLit.spin,
    spinning: GreedJunkLit.spinning,
    spinStep: GreedJunkLit.spinStep,
    reelKeys: GreedJunkLit.reelKeys,
    spinDone: GreedJunkLit.spinDone,
    previewOutcome: GreedJunkLit.previewOutcome,
    leverBreak: GreedJunkLit.leverBreak,
    tryReady: GreedJunkLit.tryReady,
    shake: GreedJunkLit.shake,
    shakeStep: GreedJunkLit.shakeStep,
    ready: true,
    setReady(on) { this.ready = !!on; },
    leverState(st, p) { this._lv = { st, p0: p || 0, at: -1, p: p || 0 }; return true; },
    pull() { if (this.ready && this.leverState('free', 0)) this.leverBreak(); },

    // Ход шара по пазу (единицы поля): паз 300–404, шар r 19 — снизу
    // остаётся упор. Место пальца — колонна рычага.
    BALL_TRAVEL: 82,
    GRAB: { x0: 288, x1: 340, y0: 272, y1: 414 },
    // Участок, который перерисовывается, пока шар едет: колонна с запасом на тень.
    LEVER_RECT: { x: 284, y: 268, w: 60, h: 156 },

    playInit(wrap) {
        const G = GreedJunk, C = G.CELL, n = G.REEL_STRIP.length;
        this.reels = [0, 1, 2].map(() => ({ s: Math.floor(Math.random() * n) * C.h + C.h / 2, v: 0, blur: 0 }));
        this.ready = true; this._lv = null; this.ballDy = 0; this._ballShown = 0;
        this.ledMount(wrap);
        this.lampMount(wrap);
        // колесо — до рычага: его палец ловит своё (диск), рычаг — своё
        if (this.wheelMount) this.wheelMount(wrap);
        if (this.pachMount) this.pachMount(wrap);
        if (this.bottomMount) this.bottomMount(wrap);
        this.inputMount(wrap);
    },

    // ---------- рычаг: палец ----------
    inputMount(wrap) {
        const field = (e) => GreedJunk.toField(e, wrap), Z = this.GRAB;
        let grab = null;
        wrap.addEventListener('pointerdown', (e) => {
            const [x, y] = field(e);
            if (!(x > Z.x0 && x < Z.x1 && y > Z.y0 && y < Z.y1) || this._lv || !this.ready) return;
            e.preventDefault(); e.stopPropagation();
            wrap.setPointerCapture(e.pointerId);
            grab = { y, at: Date.now(), moved: 0 };
            this._held = true;
            this.leverState('drag', 0);
            if (typeof Haptics !== 'undefined') Haptics.tick();
        });
        wrap.addEventListener('pointermove', (e) => {
            if (!grab) return;
            const dy = field(e)[1] - grab.y;
            grab.moved = Math.max(grab.moved, Math.abs(dy));
            this.leverDrag(dy);
        });
        const up = () => {
            if (!grab) return;
            const tap = grab.moved < 4 && Date.now() - grab.at < 350;
            grab = null;
            this._held = false;
            if (tap && this._lv && this._lv.st === 'drag') { this._lv = null; this.pull(); }
            else this.leverRelease();
        };
        wrap.addEventListener('pointerup', up);
        wrap.addEventListener('pointercancel', up);
        wrap.style.touchAction = 'none';
    },

    // ---------- рычаг: свой ход версии 2 ----------
    // Первые дни ход был гаражный (LEVER, leverDrag/leverStep там), и игрок
    // назвал рычаг расхлябанным (19.11). Разбор: гаражный рассчитан на рычаг-
    // рукоять, а здесь шар в пазу —
    //   * за пальцем шар шёл на 0,28 хода (палец 44 — шар 23) и внутри
    //     «зубца» стоял, потом прыгал: не держится за палец;
    //   * натяжение — синусная дрожь, на зубцах — рывки: трясётся под пальцем;
    //   * возврат — пружина с перелётом: шар уходил на 21 выше верхнего упора
    //     (сквозь корпус) и качался — желе.
    // Теперь: шар — за пальцем один к одному; по ходу защёлки (шар чуть
    // прилипает к каждой и проскакивает, щелчок в палец) — монотонно, без
    // дрожи; срыв на breakP — разгон вниз, жёсткий нижний упор, один короткий
    // отскок; возврат — пружиной до верхнего упора и крошечный отскок от
    // него, выше упора — никогда. Доля хода 0..1, null — покой.
    LEVER2: { teeth: 4, breakP: 0.55, snap: 0.3, fall: 140, over: 0.035, hold: 260, up: 200, bounce: 0.06, settle: 230 },
    leverDrag(dy) {
        const K = this.LEVER2, v = this._lv;
        if (!v || v.st !== 'drag') return;
        const p = Math.max(0, dy / this.BALL_TRAVEL);
        if (p >= K.breakP) {                      // срыв
            this._lv = { st: 'free', p0: v.p, at: -1, p: v.p };
            this.leverBreak();
            return;
        }
        // защёлки: n-я пройдена — щелчок (последние — тяжелее)
        const step = K.breakP / K.teeth, n = Math.floor(p / step + 0.5);
        if (n > (v.n || 0) && typeof Haptics !== 'undefined') {
            if (n >= K.teeth - 1) Haptics.impact('rigid', true); else Haptics.tick();
        }
        v.n = Math.max(v.n || 0, n);
        v.p = p;
    },
    leverRelease() {
        const v = this._lv;
        if (v && v.st === 'drag') {
            this._lv = { st: 'back', p0: v.p, at: -1, p: v.p };
            if (typeof Haptics !== 'undefined' && v.p > 0.02) Haptics.impact('soft', true);
        }
    },
    leverStep(now) {
        const v = this._lv, K = this.LEVER2;
        if (!v) return null;
        if (v.at === -1) v.at = now;
        const t = now - v.at;
        if (v.st === 'drag') {
            // прилипание к защёлке: у каждой шар чуть задерживается и
            // проскакивает дальше; наклон 1 − snap·cos ≥ 1 − snap > 0 — шар
            // всегда идёт за пальцем в ту же сторону, без дрожи
            const step = K.breakP / K.teeth, x = v.p / step;
            return Math.max(0, v.p - step * K.snap / (2 * Math.PI) * Math.sin(2 * Math.PI * x));
        }
        if (v.st === 'free') {
            if (t < K.fall) v.p = v.p0 + (1 - v.p0) * Math.pow(t / K.fall, 2);
            else {
                // нижний упор: один отскок вверх и всё, ниже упора — никогда
                const b = t - K.fall;
                v.p = 1 - K.over * Math.exp(-b / 45) * Math.abs(Math.sin(b * Math.PI / 70));
                if (!v.hit) { v.hit = now; this.shake(now, 2.5); }
            }
            if (t > K.fall + K.hold && !this._held) this._lv = { st: 'back', p0: 1, at: now, p: 1 };
            return v.p;
        }
        if (v.st === 'back') {
            // пружина: трогается мягко, к верху разгоняется (четверть косинуса),
            // упор — маленький отскок вниз, затухает; выше упора — никогда
            const up = K.up * Math.sqrt(Math.max(0.15, v.p0));
            if (t < up) v.p = v.p0 * Math.cos(t / up * Math.PI / 2);
            else {
                const b = t - up;
                v.p = K.bounce * v.p0 * Math.exp(-b / 50) * Math.abs(Math.sin(b * Math.PI / 80));
                if (!v.home) {
                    v.home = true;
                    if (typeof Haptics !== 'undefined') { if (v.p0 > 0.5) Haptics.burst('heavy', 2, 40); else Haptics.impact('light', true); }
                }
                if (b > K.settle) { this._lv = null; this.tryReady(); return null; }
            }
            return v.p;
        }
        return null;
    },

    // Шар и его тень — поверх корпуса, тем же шейдером (paint в greed-lux.js).
    paintLive() {
        const B = this.meta && this.meta.live, set = this.sets && this.sets.ball;
        if (this.paintWheel) this.paintWheel();
        if (this.pachPaint) this.pachPaint();
        if (this.meterPaint) this.meterPaint();
        if (!B || !set) return;
        const [bx, by, bw] = B.ball, dy = this.ballDy || 0;
        // тень — от света сверху-слева, шар над колонной на свой радиус
        const tx = this.drawn ? this.drawn[0] : 0, ty = this.drawn ? this.drawn[1] : 0;
        this.quad(set, bx + 3.5 - tx * 6, by + dy + 4.5 + ty * 6, bw, bw, 0.5);
        this.quad(set, bx, by + dy, bw, bw);
    },

    // ---------- кадр игры ----------
    // Зовётся из step (greed-lux.js) ДО решения о перерисовке корпуса.
    playStep(now) {
        if (this._wheel) this.wheelStep(now);
        if (this._pach) this.pachStep(now);
        const show = this.leverStep(now);
        this.ballDy = show == null ? 0 : show * this.BALL_TRAVEL;
        if (Math.abs(this.ballDy - this._ballShown) > 0.05) { this._ballDirty = true; this._ballShown = this.ballDy; }
        const moved = this.spinStep(now);
        if (moved || this._blink || this._ledDirty || this._lineAt) this.ledDraw(now);
        this.lampStep(now);
        this.shakeStep(now);
        if (this.bottomStep) this.bottomStep(now);
    },
    // После playStep: корпус не перерисовывался целиком — шар двигался?
    livePaint() {
        const b = this._ballDirty, w = this._wheelDirty, M = this._wheel, pr = this._pachDirtyR;
        this._ballDirty = this._wheelDirty = false; this._pachDirtyR = null;
        if (b) this.paint(this.LEVER_RECT);
        if (pr) this.paint(pr);
        if (this._metDirty) { this._metDirty = false; this.paint(this.METER_RECT()); }
        // колесо: крутится — облегчённо, только диск; встало — один раз целиком
        if (w && M && M.st !== 'idle') { this.paintWheelFast(); this._wheelFull = true; }
        else if (w || (this._wheelFull && M && M.st === 'idle')) { this._wheelFull = false; this.paint(this.WHEEL_RECT); }
    },

    // ---------- LED-экран барабанов ----------
    // Экран — 81×54 светодиода (шаг 2,25 единицы, как в эскизе). Окна лент
    // по 24 светодиода с серединами на 14, 40, 67; ячейка — 18 светодиодов,
    // символ 16×16 (пиксельные значки эскиза, meta.sprites); на виду три
    // ряда, средний — линия выигрыша. Рисуется в буфер по светодиоду и
    // растягивается без сглаживания; поверх — сетка тёмных промежутков.
    LED: { w: 81, h: 54, cols: [14, 40, 67], win: 24, cell: 18, mid: 27 },
    ledMount(wrap) {
        const L = this.LED, R = (this.meta.live && this.meta.live.screen) || [99, 328, 281, 450];
        const cv = document.createElement('canvas');
        cv.style.cssText = `position:absolute;left:${R[0] / this.W * 100}%;top:${(R[1] - this.Y0) / this.H * 100}%;` +
            `width:${(R[2] - R[0]) / this.W * 100}%;height:${(R[3] - R[1]) / this.H * 100}%;z-index:2;pointer-events:none;background:none;border-radius:2px`;
        wrap.appendChild(cv);
        this.ledCv = cv;
        const buf = document.createElement('canvas'); buf.width = L.w; buf.height = L.h;
        this.ledBuf = buf;
        // значки — каждый в свою картинку 16×16, один раз
        this.ledSprites = {};
        Object.entries(this.meta.sprites).forEach(([k, g]) => {
            const c = document.createElement('canvas'); c.width = c.height = 16;
            const x = c.getContext('2d');
            g.forEach((row, y) => row.forEach((col, i) => { if (col) { x.fillStyle = col; x.fillRect(i, y, 1, 1); } }));
            this.ledSprites[k] = c;
        });
        this.ledFit();
        this._ledDirty = true;
    },
    // Холст экрана — в точках экрана (с плотностью), сетка — под этот размер.
    ledFit() {
        const cv = this.ledCv, L = this.LED;
        if (!cv) return;
        const r = cv.getBoundingClientRect(), d = Math.min(3, window.devicePixelRatio || 1);
        const w = Math.max(L.w, Math.round(r.width * d)), h = Math.max(L.h, Math.round(r.height * d));
        if (cv.width === w && cv.height === h && this.ledGrid) return;
        cv.width = w; cv.height = h;
        const g = document.createElement('canvas'); g.width = w; g.height = h;
        const x = g.getContext('2d'), cw = w / L.w, ch = h / L.h, gap = Math.max(1, cw * 0.24);
        x.fillStyle = 'rgba(0,0,0,0.62)';
        for (let i = 0; i <= L.w; i++) x.fillRect(Math.round(i * cw - gap / 2), 0, Math.round(gap), h);
        for (let j = 0; j <= L.h; j++) x.fillRect(0, Math.round(j * ch - gap / 2), w, Math.round(gap));
        this.ledGrid = g;
        this._ledDirty = true;
    },
    ledDraw(now) {
        const L = this.LED, P = PALETTE.greedLux.led, b = this.ledBuf.getContext('2d'), G = GreedJunk, C = G.CELL, S = G.REEL_STRIP, n = S.length;
        if (!this.ledGrid) this.ledFit();
        this._ledDirty = false;
        b.globalAlpha = 1; b.fillStyle = P.back; b.fillRect(0, 0, L.w, L.h);
        // мигание выигрыша: средний ряд вспыхивает трижды
        let flash = 0;
        if (this._blink) {
            const u = (now - this._blink) / 900;
            if (u >= 1) this._blink = null; else flash = Math.max(0, Math.sin(u * Math.PI * 3)) * (1 - u * 0.5);
        }
        L.cols.forEach((cx, ci) => {
            const x0 = cx - L.win / 2, r = this.reels[ci];
            b.globalAlpha = 1;
            b.fillStyle = P.window; b.fillRect(x0, 0, L.win, L.h);
            b.fillStyle = P.band; b.fillRect(x0, L.mid - L.cell / 2, L.win, L.cell);
            if (flash > 0) { b.globalAlpha = flash * 0.55; b.fillStyle = P.flash; b.fillRect(x0, L.mid - L.cell / 2, L.win, L.cell); }
            b.save(); b.beginPath(); b.rect(x0, 0, L.win, L.h); b.clip();
            const pos = (r.s - C.h / 2) / C.h, base = Math.floor(pos), smear = Math.min(3, Math.round(r.blur / C.h * 4));
            for (let i = base - 2; i <= base + 3; i++) {
                const key = S[((i % n) + n) % n], spr = this.ledSprites[key];
                if (!spr) continue;
                const yc = L.mid + (i - pos) * L.cell, y = Math.round(yc) - 8, off = Math.abs(yc - L.mid);
                const a = 1 - 0.38 * Math.min(1, off / L.cell);
                for (let k = smear; k >= 0; k--) {
                    b.globalAlpha = a * (k ? 0.35 / k : 1);
                    b.drawImage(spr, cx - 8, y - k * 2);
                }
            }
            b.restore();
        });
        // красная линия выигрыша: тихо всегда, ярко — когда ленты встали
        let line = 0.35;
        if (this._lineAt) {
            const u = (now - this._lineAt) / 1200;
            if (u >= 1) this._lineAt = null; else line = 0.35 + 0.65 * (u < 0.15 ? 1 : Math.max(0, Math.cos((u - 0.15) * Math.PI * 4)) * (1 - u));
        }
        b.globalAlpha = Math.min(1, line + flash * 0.4); b.fillStyle = P.line;
        b.fillRect(1, L.mid, L.w - 2, 1);
        b.globalAlpha = 1;
        const cv = this.ledCv, c = cv.getContext('2d');
        c.imageSmoothingEnabled = false;
        c.drawImage(this.ledBuf, 0, 0, cv.width, cv.height);
        c.drawImage(this.ledGrid, 0, 0);
    },
    // Ленты встали: линия прочерчивает экран. Выигрыш — blink (зовёт игра).
    spinDoneLux() { this._lineAt = performance.now(); this._ledDirty = true; },
    blink() {
        const now = performance.now();
        if (this.wheelBlink && this.wheelBlink(now)) return;
        if (this.pachBlink && this.pachBlink(now)) return;
        this._blink = now; this._ledDirty = true;
    },

    // ---------- лампа готовности ----------
    // Горит красным, когда рычаг можно дёргать; гаснет на срыве. Разгорается
    // и гаснет быстро, но не мгновенно — нить.
    lampMount(wrap) {
        const A = (this.meta.live && this.meta.live.lamp) || [314, 440], r = 16;
        const cv = document.createElement('canvas'), d = Math.min(3, window.devicePixelRatio || 1);
        cv.width = cv.height = Math.round(r * 2 * 3 * d / 2);
        cv.style.cssText = `position:absolute;left:${(A[0] - r) / this.W * 100}%;top:${(A[1] - r - this.Y0) / this.H * 100}%;` +
            `width:${r * 2 / this.W * 100}%;height:${r * 2 / this.H * 100}%;z-index:2;pointer-events:none;background:none`;
        wrap.appendChild(cv);
        this.lampCv = cv; this.lampOn = this.ready ? 1 : 0; this._lampShown = -1;
    },
    lampStep() {
        const want = this.ready ? 1 : 0;
        this.lampOn += (want - this.lampOn) * 0.35;
        if (Math.abs(want - this.lampOn) < 0.01) this.lampOn = want;
        if (Math.abs(this.lampOn - this._lampShown) < 0.005 || !this.lampCv) return;
        this._lampShown = this.lampOn;
        const cv = this.lampCv, c = cv.getContext('2d'), w = cv.width, P = PALETTE.greedLux.lamp, k = this.lampOn;
        c.clearRect(0, 0, w, w);
        if (k <= 0) return;
        c.globalCompositeOperation = 'lighter';
        const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        g.addColorStop(0, P.core); g.addColorStop(0.3, P.glass); g.addColorStop(0.45, P.halo); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalAlpha = k; c.fillStyle = g; c.fillRect(0, 0, w, w);
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
});

// Ленты встали — ещё и линия на экране (spinDone гаражного зовёт игру и
// готовность, свою часть добавляем сверху).
(function () {
    const done = GreedLux.spinDone;
    GreedLux.spinDone = function () { this.spinDoneLux(); return done.apply(this, arguments); };
})();
