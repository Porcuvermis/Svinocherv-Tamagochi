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
    leverDrag: GreedJunkLit.leverDrag,
    leverRelease: GreedJunkLit.leverRelease,
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

    // Ход рычага — как у гаражного (leverStep там же), без рисунка: доля
    // хода 0..1 (и чуть за 1 — отскок от упора). null — рычаг в покое.
    leverStep(now) {
        const v = this._lv;
        if (!v) return null;
        if (v.at === -1) v.at = now;
        const t = now - v.at, L = this.LEVER;
        let show = v.p;
        if (v.st === 'drag') {
            const fr = v.fr || 0;
            show += 0.018 * fr * fr * Math.sin(now / 18);
            if (v.kickAt) { const d = now - v.kickAt; show += 0.07 * Math.exp(-d / 50) * Math.sin(d / 25); }
        } else if (v.st === 'free') {
            if (t < L.fall) v.p = v.p0 + (1 + L.over - v.p0) * Math.pow(t / L.fall, 2.2);
            else {
                const b = t - L.fall;
                v.p = 1 + L.over * Math.exp(-b / 45) * Math.cos(b / 28 * Math.PI);
                if (!v.hit) { v.hit = now; this.shake(now, 4.5); }
            }
            show = v.p;
            if (t > L.fall + L.hold && !this._held) this._lv = { st: 'back', p0: 1, at: now, p: 1 };
        } else if (v.st === 'back') {
            const fade = t < 700 ? 1 : Math.max(0, 1 - (t - 700) / 200);
            v.p = v.p0 * Math.exp(-t / L.back) * Math.cos(t / 115 * Math.PI / 2) * fade * fade;
            if (!v.home && t >= 115 && v.p0 > 0.5) {
                v.home = true;
                if (typeof Haptics !== 'undefined') Haptics.burst('heavy', 2, 40);
            }
            show = v.p;
            if (t > 900) { this._lv = null; this.tryReady(); return null; }
        }
        return show;
    },

    // Шар и его тень — поверх корпуса, тем же шейдером (paint в greed-lux.js).
    paintLive() {
        const B = this.meta && this.meta.live, set = this.sets && this.sets.ball;
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
        const show = this.leverStep(now);
        this.ballDy = show == null ? 0 : show * this.BALL_TRAVEL;
        if (Math.abs(this.ballDy - this._ballShown) > 0.05) { this._ballDirty = true; this._ballShown = this.ballDy; }
        const moved = this.spinStep(now);
        if (moved || this._blink || this._ledDirty || this._lineAt) this.ledDraw(now);
        this.lampStep(now);
        this.shakeStep(now);
    },
    // После playStep: корпус не перерисовывался целиком — шар двигался?
    livePaint() {
        if (!this._ballDirty) return;
        this._ballDirty = false;
        this.paint(this.LEVER_RECT);
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
    blink() { this._blink = performance.now(); this._ledDirty = true; },

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
