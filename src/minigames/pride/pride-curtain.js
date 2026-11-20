// ================= ТЩЕСЛАВИЕ: РАМКА ОКНА ИЗ БАРХАТА И ЛАМПОЧЕК =================
// Шкурка окна (MinigameWindow.attach, опция skin; CLAUDE.md, инвариант 8) —
// материал греха: красный бархат занавеса, латунная кромка и лампочки, как
// у театральной рампы. Те же цвета, что у ковровой дорожки (palette.redCarpet).
//   рамка   — складки бархата, кромка латунью, по краю бегут лампочки;
//   крестик — из лампочек, на латунной бляхе (слов нет, инвариант 9);
//   переход — занавес: смыкается от краёв к середине и раздвигается;
//   выход из забега — каждое нажатие крестика: вспышка фотоаппарата и
//             занавес смыкается ещё на треть, третье — закрывает совсем
//             (MgVeil.knock: ходы burst / pop / finish).
//
// Почему занавес, а не россыпь вспышек по экрану: он стоит двумя готовыми
// картинками и ездит сдвигом — две drawImage на кадр (CLAUDE.md, «дорого
// выглядит — дёшево стоит»). Вспышка — один полупрозрачный прямоугольник в
// слое мгновенных украшений.
const PrideCurtain = {
    rim: { side: 18, top: 59 },
    cross: { x: 336, y: 31, size: 60 },
    CORNER: 10,          // скругление окна сцены; рамка заходит на сцену на столько же
    FOLD: 39,            // шаг складок бархата, единицы холста
    PANEL: 196,          // створка занавеса: половина экрана + запас на стык
    BULB_STEP: 24,
    VEIL_MS: { cover: 460, reveal: 520, close: 460, clear: 520, burst: 300, pop: 360, finish: 340 },

    get bg() { return PALETTE.redCarpet.carpet[700]; },
    // На сколько рамка заходит на сцену: у скруглённого угла бархат тянется
    // вглубь на CORNER, а полосы окна берут ровно reach().
    reach() { return this.CORNER; },

    inner() {
        const G = MinigameWindow.skinGeometry(this);
        return G.inner;
    },

    // ---------- цвет ----------
    _rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; },
    _mix(a, b, t) {
        const A = this._rgb(a), B = this._rgb(b);
        return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')';
    },
    // Ворс складки: гребень светлый, ложбина тёмная; плавная волна и узкая
    // тёмная щель в ложбине — бархат, а не полоски.
    foldShade(x) {
        const C = PALETTE.redCarpet.carpet, ph = (x % this.FOLD) / this.FOLD;
        const w = 0.5 - 0.5 * Math.cos(ph * Math.PI * 2);              // 0 в ложбине, 1 на гребне
        const lo = this._mix(C[700], C[500], Math.min(1, w * 1.6));
        return w > 0.62 ? this._mix(C[500], C[300], (w - 0.62) / 0.38 * 0.8) : lo;
    },
    // Складки на полосе x0..x1 высотой h от y=0: общий кусок для рамки и створки.
    folds(g, x0, x1, y0, y1, shift) {
        for (let x = x0; x < x1; x += 2) {
            g.fillStyle = this.foldShade(x + (shift || 0));
            g.fillRect(x, y0, 2.4, y1 - y0);
        }
        // Бархат темнеет книзу: свет идёт сверху.
        const gr = g.createLinearGradient(0, y0, 0, y1);
        gr.addColorStop(0, 'rgba(0,0,0,0)');
        gr.addColorStop(1, 'rgba(10,2,6,0.38)');
        g.fillStyle = gr;
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
    },

    // ---------- латунь и лампочки ----------
    brass(g, path, w) {
        const R = PALETTE.redCarpet.rail;
        g.lineJoin = 'round';
        g.beginPath(); path(g);
        g.lineWidth = w + 2; g.strokeStyle = R[700]; g.stroke();
        g.lineWidth = w; g.strokeStyle = R[500]; g.stroke();
        g.lineWidth = Math.max(1, w * 0.34); g.strokeStyle = R[300]; g.stroke();
    },
    bulb(g, x, y, r) {
        const F = PALETTE.redCarpet.flash, R = PALETTE.redCarpet.rail;
        // Свечение: мягкий круг вокруг, не фильтр (docs/traps.md, п. 164).
        const glow = g.createRadialGradient(x, y, r * 0.4, x, y, r * 2.6);
        glow.addColorStop(0, 'rgba(255,221,140,0.55)');
        glow.addColorStop(1, 'rgba(255,221,140,0)');
        g.fillStyle = glow;
        g.beginPath(); g.arc(x, y, r * 2.6, 0, Math.PI * 2); g.fill();
        g.fillStyle = R[700];
        g.beginPath(); g.arc(x, y, r + 1.2, 0, Math.PI * 2); g.fill();        // патрон
        const b = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
        b.addColorStop(0, F[300]);
        b.addColorStop(0.55, F[500]);
        b.addColorStop(1, R[300]);
        g.fillStyle = b;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    },
    // Лампочки по кромке окна и крестик из них. Спускаются с внешней
    // стороны латуни; у креста и в скруглениях не ставятся.
    bulbs(g) {
        const I = this.inner(), C = this.cross, off = 10, r = 3.4, c = this.CORNER + 8;
        const nearCross = (x, y) => Math.abs(x - C.x) < C.size / 2 + 6 && Math.abs(y - C.y) < C.size / 2 + 6;
        const row = (a, b, f) => {
            const n = Math.max(1, Math.round((b - a) / this.BULB_STEP)), st = (b - a) / n;
            for (let i = 0; i <= n; i++) { const p = f(a + i * st); if (!nearCross(p[0], p[1])) this.bulb(g, p[0], p[1], r); }
        };
        row(I.x0 + c, I.x1 - c, (x) => [x, I.y0 - off]);
        row(I.x0 + c, I.x1 - c, (x) => [x, I.y1 + off]);
        row(I.y0 + c, I.y1 - c, (y) => [I.x0 - off, y]);
        row(I.y0 + c, I.y1 - c, (y) => [I.x1 + off, y]);
    },
    crossArt(g) {
        const C = this.cross, R = PALETTE.redCarpet.rail;
        // Бляха: круглая латунная пластина, чтобы крест читался на складках.
        const pl = g.createRadialGradient(C.x - 6, C.y - 8, 2, C.x, C.y, C.size * 0.52);
        pl.addColorStop(0, R[300]); pl.addColorStop(0.6, R[500]); pl.addColorStop(1, R[700]);
        g.fillStyle = PALETTE.redCarpet.carpet[700];
        g.beginPath(); g.arc(C.x, C.y, C.size * 0.5 + 2, 0, Math.PI * 2); g.fill();
        g.fillStyle = pl;
        g.beginPath(); g.arc(C.x, C.y, C.size * 0.5, 0, Math.PI * 2); g.fill();
        g.strokeStyle = R[700]; g.lineWidth = 1.5;
        g.beginPath(); g.arc(C.x, C.y, C.size * 0.5 - 3, 0, Math.PI * 2); g.stroke();
        // Крест из лампочек: две диагонали по пять.
        const u = C.size * 0.2;
        for (const k of [-2, -1, 0, 1, 2]) {
            this.bulb(g, C.x + k * u * 0.55, C.y + k * u * 0.55, 2.7);
            if (k !== 0) this.bulb(g, C.x + k * u * 0.55, C.y - k * u * 0.55, 2.7);
        }
    },

    // ---------- рамка ----------
    *drawGen(g) {
        const I = this.inner(), R = this.CORNER;
        g.clearRect(0, 0, STAGE_W, STAGE_H);
        this.folds(g, 0, STAGE_W, 0, STAGE_H, 0);
        yield;
        // Окно сцены — вырез со скруглёнными углами.
        const hole = (c) => {
            c.beginPath();
            if (c.roundRect) c.roundRect(I.x0, I.y0, I.x1 - I.x0, I.y1 - I.y0, R);
            else c.rect(I.x0, I.y0, I.x1 - I.x0, I.y1 - I.y0);
        };
        g.globalCompositeOperation = 'destination-out';
        hole(g); g.fill();
        g.globalCompositeOperation = 'source-over';
        // Тень рамки на бархат: тёмный ободок снаружи латуни.
        g.save();
        g.shadowColor = 'rgba(8,0,4,0.55)'; g.shadowBlur = 8; g.shadowOffsetY = 2;
        this.brass(g, (c) => { c.roundRect ? c.roundRect(I.x0, I.y0, I.x1 - I.x0, I.y1 - I.y0, R) : c.rect(I.x0, I.y0, I.x1 - I.x0, I.y1 - I.y0); }, 5);
        g.restore();
        // Внутренняя кромка: латунь тянется на сцену, не оставляя щели на стыке.
        this.brass(g, (c) => { c.roundRect ? c.roundRect(I.x0, I.y0, I.x1 - I.x0, I.y1 - I.y0, R) : c.rect(I.x0, I.y0, I.x1 - I.x0, I.y1 - I.y0); }, 5);
        yield;
        this.bulbs(g);
        yield;
        this.crossArt(g);
    },

    // ---------- переход: занавес ----------
    _panel: null,
    _level: 0,           // насколько сомкнут занавес сейчас, 0…1
    // Створка рисуется один раз: бархат со складками, латунный шнур по
    // краю, который смыкается, и бахрома понизу.
    panel() {
        if (this._panel) return this._panel;
        const W = this.PANEL, H = STAGE_H, S = 2, R = PALETTE.redCarpet.rail;
        const c = document.createElement('canvas');
        c.width = W * S; c.height = H * S;
        const g = c.getContext('2d');
        g.setTransform(S, 0, 0, S, 0, 0);
        this.folds(g, 0, W, 0, H, 13);
        // Шнур по краю смыкания.
        const gr = g.createLinearGradient(W - 7, 0, W, 0);
        gr.addColorStop(0, R[700]); gr.addColorStop(0.45, R[300]); gr.addColorStop(1, R[500]);
        g.fillStyle = gr; g.fillRect(W - 7, 0, 7, H);
        // Бахрома: латунные кисти по низу.
        g.fillStyle = R[500]; g.fillRect(0, H - 16, W, 5);
        g.fillStyle = R[300]; g.fillRect(0, H - 16, W, 1.4);
        for (let x = 4; x < W - 7; x += 7) {
            g.fillStyle = R[700]; g.fillRect(x, H - 11, 3.2, 11);
            g.fillStyle = R[500]; g.fillRect(x + 0.4, H - 11, 1.6, 11);
        }
        // Тень от шнура на бархат.
        const sh = g.createLinearGradient(W - 26, 0, W - 7, 0);
        sh.addColorStop(0, 'rgba(10,2,6,0)'); sh.addColorStop(1, 'rgba(10,2,6,0.45)');
        g.fillStyle = sh; g.fillRect(W - 26, 0, 19, H);
        return (this._panel = c);
    },
    veilWarm(ctx) { this.paint(ctx, 0.5); ctx.clearRect(0, 0, STAGE_W, STAGE_H); },
    ease(p) { return p * p * (3 - 2 * p); },
    paint(ctx, c) {
        ctx.clearRect(0, 0, STAGE_W, STAGE_H);
        if (c <= 0.001) return;
        const P = this.panel(), W = this.PANEL;
        ctx.drawImage(P, -W * (1 - c), 0, W, STAGE_H);
        ctx.save();
        ctx.translate(STAGE_W, 0); ctx.scale(-1, 1);
        ctx.drawImage(P, -W * (1 - c), 0, W, STAGE_H);
        ctx.restore();
    },
    // Откуда и куда идёт ход. Нажатия в забеге помнят, насколько занавес
    // сомкнут (_level): третье «доводит» его от двух третей до полного.
    _span(mode) {
        const n = (typeof MgVeil !== 'undefined' && MgVeil.knocks) || 1, K = (typeof MgVeil !== 'undefined' && MgVeil.KNOCKS) || 3;
        switch (mode) {
            case 'cover': case 'close': return [0, 1];
            case 'reveal': case 'clear': return [1, 0];
            case 'burst': return [this._level, Math.min(1, n / K)];
            case 'pop': return [this._level, 0];
            default: return [this._level, 1];    // finish
        }
    },
    veilStart(ctx, mode) {
        this._from = this._span(mode);
        this.paint(ctx, this._from[0]);
        this._level = this._from[0];
    },
    veil(ctx, mode, p, scale, fx) {
        const s = this._from || this._span(mode), c = s[0] + (s[1] - s[0]) * this.ease(p);
        this._level = c;
        this.paint(ctx, c);
        // Вспышка фотоаппарата — на каждое нажатие и на последний хлопок.
        if (mode === 'burst' || mode === 'finish') {
            const a = (1 - p) * (1 - p) * 0.8;
            if (a > 0.01) { fx.fillStyle = 'rgba(255,248,224,' + a.toFixed(3) + ')'; fx.fillRect(0, 0, STAGE_W, STAGE_H); }
        }
    },
    // Занавес стоит, пока игра дозревает: полное разрешение.
    veilStill(ctx) { this.paint(ctx, 1); }
};
