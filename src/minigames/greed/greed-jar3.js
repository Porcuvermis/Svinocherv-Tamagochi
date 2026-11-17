// ================= АППАРАТ АЛЧНОСТИ: ТРЁХЛИТРОВАЯ БАНКА =================
// Банка-кошелёк версии 1 в новом виде — она же магазин прокачки
// (docs/plan/31-greed-premium.md, разд. 00). Классическая советская
// трёхлитровая банка (референс игрока, docs/ref/greed-jar-3l-*.jpg).
//
// Рисуется по ПОЗЕ, а не кадрами: банка — тело вращения, и пока она
// вертится вокруг своей оси, силуэт не меняется — двигаются только скотч
// (обегает банку) и монеты; блики стоят на месте относительно света. Поэтому
// полёт с оборотом, наклон и подлёт «в упор» — одна и та же отрисовка с
// другими числами (поза снята с 3D-болванки, tools/greed-lux-sketch/jar).
//
// Поза P: cx, cy — середина банки на холсте; k — высота банки в точках;
// roll — наклон (град, + — верх влево); yaw — поворот вокруг оси (град, 0 —
// скотч к игроку); view — взгляд сверху (0 — сбоку, 0.2 — заметно сверху);
// coins — куча монет внутри; tape — холст скотча (tapeCoins / свой).
const GreedJar3 = {
    // Профиль (доля высоты от дна, радиус в долях радиуса тела) — тот же, что
    // у болванки: скруглённое дно, бочонок, плечи, горло с двумя валиками.
    PROFILE: [[0, 0.80], [0.012, 0.92], [0.035, 0.975], [0.08, 0.995], [0.30, 1.0], [0.45, 1.0], [0.60, 0.99],
        [0.70, 0.96], [0.78, 0.88], [0.84, 0.74], [0.88, 0.60], [0.905, 0.50], [0.92, 0.462], [0.932, 0.458],
        [0.942, 0.475], [0.955, 0.475], [0.963, 0.46], [0.973, 0.475], [0.99, 0.475], [1.0, 0.46]],
    R: 0.33,                          // радиус тела в долях высоты (ширина/высота ~0,66)
    TAPE: { y0: 0.256, y1: 0.589, arc: 95 },
    COIN_TOP: 0.42,                   // верх кучи монет — ниже верха скотча

    r(y) {
        const P = this.PROFILE;
        if (y <= P[0][0]) return P[0][1] * this.R;
        for (let i = 1; i < P.length; i++) if (y <= P[i][0]) {
            const [y0, r0] = P[i - 1], [y1, r1] = P[i];
            return (r0 + (r1 - r0) * (y - y0) / (y1 - y0 || 1)) * this.R;
        }
        return P[P.length - 1][1] * this.R;
    },

    // Силуэт в местных координатах: x — вправо, y — вверх от дна (0…1).
    // Сечение на высоте y — эллипс rx = r(y), ry = r(y)·view; передняя точка
    // сечения на экране ниже на ry. Контур — боковые края, задняя половина
    // кромки горла и передняя дуга дна.
    silhouette(c, view, inset = 0) {
        const N = 48, pts = [];
        for (let i = 0; i <= N; i++) { const y = i / N; pts.push([y, Math.max(0.01, this.r(y) - inset)]); }
        c.beginPath();
        // левый край снизу вверх
        pts.forEach(([y, r], i) => { if (i === 0) c.moveTo(-r, -y); else c.lineTo(-r, -y); });
        // задняя половина кромки — дугой назад (вверх на экране)
        const rt = pts[N][1];
        c.ellipse(0, -1, rt, rt * view, 0, Math.PI, 2 * Math.PI, false);
        // правый край сверху вниз
        for (let i = N; i >= 0; i--) c.lineTo(pts[i][1], -pts[i][0]);
        // передняя дуга дна
        const rb = pts[0][1];
        c.ellipse(0, 0, rb, rb * view, 0, 0, Math.PI, false);
        c.closePath();
    },

    draw(c, P) {
        const J = PALETTE.greedJunk.reel.jar3, G = PALETTE.greedCoin.gold, ink = PALETTE.ink;
        const v = P.view == null ? 0.16 : P.view, k = P.k, lw = (w) => w / k;
        c.save();
        c.translate(P.cx, P.cy);
        c.rotate(-(P.roll || 0) * Math.PI / 180);
        c.scale(k, k);
        c.translate(0, 0.5);            // середина банки — в точке позы
        // 1. задняя стенка: лёгкий тон стекла
        this.silhouette(c, v);
        c.fillStyle = J.tint; c.globalAlpha = 0.24; c.fill(); c.globalAlpha = 1;
        // 2. монеты внутри
        if (P.coins !== false) this.coins(c, v, G);
        // 3. толстое дно: светлое кольцо стекла
        c.save(); this.silhouette(c, v); c.clip();
        c.beginPath(); c.ellipse(0, -0.035, this.r(0.035) * 0.92, this.r(0.035) * 0.92 * v + 0.012, 0, 0, 7);
        c.strokeStyle = J.bottom; c.lineWidth = 0.022; c.globalAlpha = 0.85; c.stroke();
        c.globalAlpha = 1;
        // 4. край силуэта: стекло густеет к краям (видно толщу) — слева светлее
        const gx = c.createLinearGradient(-this.R, 0, this.R, 0);
        gx.addColorStop(0, J.edge); gx.addColorStop(0.16, 'rgba(255,255,255,0)'); gx.addColorStop(0.8, 'rgba(255,255,255,0)'); gx.addColorStop(1, J.deep);
        c.fillStyle = gx; c.globalAlpha = 0.55; c.fillRect(-0.5, -1.1, 1, 1.2);
        // плечи и горло — стекло под углом, гуще
        const gy = c.createLinearGradient(0, -1, 0, -0.7);
        gy.addColorStop(0, J.edge); gy.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = gy; c.globalAlpha = 0.35; c.fillRect(-0.5, -1.05, 1, 0.4);
        c.globalAlpha = 1;
        // 5. блики окна: широкая полоса слева, узкая справа, дуга на плече
        const streak = (x0, w, y0, y1, a) => {
            const g = c.createLinearGradient(x0, 0, x0 + w, 0);
            g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.35, J.hi); g.addColorStop(0.65, J.hi); g.addColorStop(1, 'rgba(255,255,255,0)');
            c.globalAlpha = a; c.fillStyle = g; c.beginPath();
            c.moveTo(x0, -y0); c.lineTo(x0 + w, -y0 - 0.01); c.lineTo(x0 + w, -y1); c.quadraticCurveTo(x0 + w / 2, -y1 - 0.015, x0, -y1); c.closePath(); c.fill();
        };
        streak(-this.R * 0.74, this.R * 0.22, 0.08, 0.68, 0.72);
        streak(-this.R * 0.44, this.R * 0.06, 0.12, 0.62, 0.5);
        streak(this.R * 0.64, this.R * 0.1, 0.1, 0.64, 0.45);
        // плечо и горло ловят окно — короткие полосы
        streak(-this.R * 0.42, this.R * 0.12, 0.8, 0.9, 0.6);
        c.globalAlpha = 0.8; c.strokeStyle = J.hi; c.lineWidth = 0.016; c.lineCap = 'round';
        c.beginPath(); c.ellipse(0, -0.8, this.r(0.8) * 0.82, this.r(0.8) * 0.82 * v + 0.02, 0, Math.PI * 1.08, Math.PI * 1.42); c.stroke();
        c.globalAlpha = 1;
        c.restore();
        // 6. скотч обегает банку
        if (P.tape) this.tape(c, v, P.tape, P.yaw || 0);
        // 7. горло: кромка и два валика
        this.neck(c, v, J, ink, lw);
        // 8. толщина стенки: светлая линия внутри контура — по ней стекло и
        // читается стеклом (у пустой формы её нет)
        c.save(); this.silhouette(c, v); c.clip();
        this.silhouette(c, v, 0.02);
        c.strokeStyle = J.hi; c.globalAlpha = 0.55; c.lineWidth = lw(STROKE.detail); c.stroke();
        this.silhouette(c, v, 0.03);
        c.strokeStyle = J.edge; c.globalAlpha = 0.35; c.lineWidth = lw(STROKE.hairline); c.stroke();
        c.restore(); c.globalAlpha = 1;
        // 9. тушевой контур силуэта
        this.silhouette(c, v);
        c.strokeStyle = ink; c.lineWidth = lw(STROKE.contour); c.lineJoin = 'round'; c.stroke();
        c.restore();
    },

    // Горло объёмом, а не плоскими кольцами (игрок, 17.11: «горлышко
    // плоское»): цилиндр горла со светом слева и тенью справа, валики
    // выпуклые — блик сверху, тень снизу, кромка — толстый «бублик»,
    // в отверстии видна внутренняя стенка.
    neck(c, v, J, ink, lw) {
        const y0 = 0.905, rt = this.r(1), ri = rt * 0.84, vv = Math.max(v, 0.02);
        const band = (ya, yb) => {           // передняя полоса цилиндра между высотами
            const ra = this.r(ya), rb = this.r(yb);
            c.beginPath(); c.ellipse(0, -ya, ra, ra * vv, 0, 0, Math.PI, false);
            c.lineTo(-rb, -yb); c.ellipse(0, -yb, rb, rb * vv, 0, Math.PI, 0, true); c.closePath();
        };
        // цилиндр горла: свет слева, к правому краю густеет
        const gx = c.createLinearGradient(-rt, 0, rt, 0);
        gx.addColorStop(0, J.rim); gx.addColorStop(0.22, J.hi); gx.addColorStop(0.45, J.tint); gx.addColorStop(0.85, J.edge); gx.addColorStop(1, J.deep);
        band(y0, 1); c.fillStyle = gx; c.globalAlpha = 0.55; c.fill(); c.globalAlpha = 1;
        // валики: выпуклые полосы — тень снизу, блик сверху
        [0.948, 0.978].forEach((y) => {
            const r = this.r(y);
            c.beginPath(); c.ellipse(0, -y + 0.006, r, r * vv, 0, 0.05, Math.PI - 0.05);
            c.strokeStyle = J.deep; c.globalAlpha = 0.55; c.lineWidth = lw(STROKE.structure); c.stroke();
            c.beginPath(); c.ellipse(0, -y - 0.002, r * 1.01, r * vv, 0, Math.PI * 0.42, Math.PI * 0.92);
            c.strokeStyle = J.hi; c.globalAlpha = 0.9; c.lineWidth = lw(STROKE.detail); c.stroke();
            c.beginPath(); c.ellipse(0, -y, r * 1.01, r * vv, 0, 0, Math.PI);
            c.strokeStyle = ink; c.globalAlpha = 0.5; c.lineWidth = lw(STROKE.hairline); c.stroke();
        });
        c.globalAlpha = 1;
        // кромка — «бублик»: кольцо с толщиной; внутри — зев с задней стенкой
        const top = 1, lip = 0.012;
        c.beginPath(); c.ellipse(0, -top + lip, rt, rt * vv, 0, 0, Math.PI); c.lineTo(-rt, -top);
        c.ellipse(0, -top, rt, rt * vv, 0, Math.PI, 0, true); c.closePath();
        const gl = c.createLinearGradient(-rt, 0, rt, 0);
        gl.addColorStop(0, J.hi); gl.addColorStop(0.3, J.rim); gl.addColorStop(1, J.edge);
        c.fillStyle = gl; c.fill();
        c.beginPath(); c.ellipse(0, -top, rt, rt * vv, 0, 0, 7); c.ellipse(0, -top, ri, ri * vv, 0, 0, 7, true); c.fillStyle = J.rim; c.fill('evenodd');
        // Зев — ПУСТОТА: сквозь него видно то, что за банкой. Видна только
        // полоска задней внутренней стенки горла (серп сверху). Было: зев
        // залит сплошным тоном — читался крышкой.
        c.save(); c.beginPath(); c.ellipse(0, -top, ri, ri * vv, 0, 0, 7); c.clip();
        c.beginPath(); c.ellipse(0, -top, ri, ri * vv, 0, Math.PI, 0); c.ellipse(0, -top + 0.03, ri, ri * vv, 0, 0, Math.PI, true); c.closePath();
        c.fillStyle = J.edge; c.globalAlpha = 0.5; c.fill();
        c.beginPath(); c.ellipse(0, -top + 0.03, ri * 0.98, ri * vv, 0, Math.PI * 1.1, Math.PI * 1.9);
        c.strokeStyle = J.hi; c.lineWidth = lw(STROKE.detail); c.globalAlpha = 0.6; c.stroke();
        c.restore(); c.globalAlpha = 1;
        c.beginPath(); c.ellipse(0, -top, ri, ri * vv, 0, 0, 7); c.strokeStyle = ink; c.lineWidth = lw(STROKE.detail); c.stroke();
        // блик по кромке слева-сзади и тень справа-спереди
        c.beginPath(); c.ellipse(0, -top, (rt + ri) / 2, (rt + ri) / 2 * vv, 0, Math.PI * 1.05, Math.PI * 1.55);
        c.strokeStyle = J.hi; c.lineWidth = lw(STROKE.structure); c.globalAlpha = 0.95; c.stroke();
        c.beginPath(); c.ellipse(0, -top + lip * 0.5, rt * 0.99, rt * vv, 0, Math.PI * 0.05, Math.PI * 0.4);
        c.strokeStyle = J.deep; c.lineWidth = lw(STROKE.detail); c.globalAlpha = 0.6; c.stroke(); c.globalAlpha = 1;
        // контур кромки
        c.beginPath(); c.ellipse(0, -top, rt, rt * vv, 0, Math.PI, 0); c.strokeStyle = ink; c.lineWidth = lw(STROKE.structure); c.stroke();
        c.beginPath(); c.ellipse(0, -top + lip, rt, rt * vv, 0, 0, Math.PI); c.stroke();
    },

    // Куча монет — только монеты: в щелях между ними тёмная глубина кучи, у
    // каждой монеты видно ребро (толщину). Было: сплошная золотая заливка
    // под монетами — читалась жёлтой жидкостью (игрок, 17.11).
    coins(c, v, G) {
        c.save(); this.silhouette(c, v, 0.016); c.clip();
        const top = this.COIN_TOP, rnd = this._rnd(17), cr = 0.046, vv = Math.max(v, 0.06);
        // глубина кучи: щели — почти без света, к дну темнее
        const rt = this.r(top);
        // подложка ниже верха кучи — верхние монеты её перекрывают (иначе над
        // кучей торчала тёмная полоса)
        const tb = top - 0.045, rb = this.r(tb);
        c.beginPath(); c.ellipse(0, -tb, rb, rb * vv + 0.01, 0, Math.PI, 0, false); c.lineTo(rb, 0.05); c.lineTo(-rb, 0.05); c.closePath();
        c.fillStyle = PALETTE.greedCoin.gap; c.globalAlpha = 0.92; c.fill(); c.globalAlpha = 1;
        // монеты слоями от дна к верху: верхний слой — поверх, ярче
        const list = [];
        for (let i = 0; i < 420; i++) {
            const y = Math.pow(rnd(), 0.7) * top, rr = this.r(y) * 0.97;
            const x = (rnd() * 2 - 1) * rr, front = Math.sqrt(Math.max(0, 1 - (x / rr) ** 2));
            list.push({ x, y, yy: -y + front * rr * vv * rnd(), tilt: (rnd() - 0.5) * 1.1, sq: 0.28 + rnd() * 0.5, s: 0.85 + rnd() * 0.3 });
        }
        list.sort((a, b) => a.y - b.y);
        list.forEach((m) => {
            const lit = 0.45 + 0.55 * (m.y / top), r = cr * m.s;
            c.save(); c.translate(m.x, m.yy); c.rotate(m.tilt);
            // ребро — толщина монеты вниз
            c.beginPath(); c.ellipse(0, r * 0.16, r, r * m.sq, 0, 0, 7); c.fillStyle = G.deep; c.globalAlpha = 1; c.fill();
            c.beginPath(); c.ellipse(0, r * 0.08, r, r * m.sq, 0, 0, Math.PI); c.fillStyle = G.lo; c.globalAlpha = lit; c.fill();
            // лицо монеты
            c.beginPath(); c.ellipse(0, 0, r, r * m.sq, 0, 0, 7);
            c.fillStyle = lit > 0.8 ? G[500] : G.lo; c.globalAlpha = 1; c.fill();
            c.beginPath(); c.ellipse(0, 0, r * 0.74, r * m.sq * 0.74, 0, 0, 7); c.strokeStyle = G.deep; c.lineWidth = r * 0.07; c.globalAlpha = 0.5; c.stroke();
            c.beginPath(); c.ellipse(-r * 0.2, -r * m.sq * 0.25, r * 0.55, r * m.sq * 0.35, 0, 0, 7); c.fillStyle = G.hi; c.globalAlpha = lit * 0.6; c.fill();
            c.beginPath(); c.ellipse(-r * 0.35, -r * m.sq * 0.35, r * 0.18, r * m.sq * 0.12, 0, 0, 7); c.fillStyle = G.glint; c.globalAlpha = lit * 0.8; c.fill();
            c.restore();
        });
        c.globalAlpha = 1;
        c.restore();
    },

    // Скотч — полоса на цилиндре тела: холст делится на узкие полосы, каждая
    // встаёт на свой угол вокруг оси; видны те, что смотрят к игроку. Верх и
    // низ полосы — по эллипсу сечения, к краям полоса темнее (уходит вбок).
    tape(c, v, tex, yaw) {
        const T = this.TAPE, N = 72, A = T.arc * Math.PI / 180, rr = this.R * 1.012;
        for (let i = 0; i < N; i++) {
            const u0 = i / N, u1 = (i + 1) / N;
            const a0 = (yaw * Math.PI / 180) + (u0 - 0.5) * A, a1 = (yaw * Math.PI / 180) + (u1 - 0.5) * A, am = (a0 + a1) / 2;
            if (Math.cos(am) <= 0.02) continue;
            const x0 = rr * Math.sin(a0), x1 = rr * Math.sin(a1);
            const dy = rr * Math.cos(am) * v;
            const sx = u0 * tex.width, sw = tex.width / N;
            c.save();
            c.globalAlpha = 1;
            c.drawImage(tex, sx, 0, sw + 0.5, tex.height, Math.min(x0, x1) - 0.0008, -T.y1 + dy, Math.abs(x1 - x0) + 0.0016, T.y1 - T.y0);
            // к краям — тень (полоса уходит вбок от света и от глаза)
            c.globalAlpha = (1 - Math.cos(am)) * 0.55;
            c.fillStyle = PALETTE.greedJunk.reel.jar.tapeLo;
            c.fillRect(Math.min(x0, x1) - 0.0008, -T.y1 + dy, Math.abs(x1 - x0) + 0.0016, T.y1 - T.y0);
            c.restore();
        }
    },

    // Холст скотча с числом монет — почти во всю высоту скотча, маркером тем
    // же почерком, что стикер и прежний скотч (GreedJunk.handPath, цифры
    // GreedJunkLit.JAR_DIGIT). Пропорции — как у куска на банке.
    tapeCoins(n, W = 1200) {
        const T = this.TAPE, len = this.R * 1.012 * T.arc * Math.PI / 180, H = Math.round(W * (T.y1 - T.y0) / len);
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const c = cv.getContext('2d'), C = PALETTE.greedJunk.reel.jar;
        this.paper(c, W, H, C);
        // цифры — почти во всю высоту, но не шире скотча (длинное число — уже)
        const s = String(n), dh = H * 0.78, dw = Math.min(dh * 0.62, W * 0.7 / (s.length * 1.12)), x0 = W / 2 - (s.length * dw * 1.12) / 2 + dw * 0.06;
        c.strokeStyle = PALETTE.greedJunk.reel.rag.marker; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = dh * 0.11;
        s.split('').forEach((ch, i) => {
            const rnd = GreedJunk.rng(1000 + i * 31 + +ch * 7);
            c.save(); c.translate(x0 + i * dw * 1.12, H * 0.11 + (rnd() - 0.5) * H * 0.03); c.rotate((rnd() - 0.5) * 0.1); c.scale(dw / 4, dh / 7.4);
            c.lineWidth = dh * 0.11 / (dw / 4);
            c.stroke(new Path2D(GreedJunkLit.JAR_DIGIT[+ch].map(L => GreedJunk.handPath(L, rnd, false, 0.12)).join(' ')));
            c.restore();
        });
        return cv;
    },
    // малярный скотч: рваные концы, полосы волокна, края темнее
    paper(c, W, H, C) {
        const rnd = this._rnd(91);
        c.beginPath(); c.moveTo(W * 0.02, 0);
        for (let y = 0; y <= H; y += H / 9) c.lineTo(W * (0.006 + rnd() * 0.022), y);
        c.lineTo(W * 0.98, H);
        for (let y = H; y >= 0; y -= H / 9) c.lineTo(W * (0.972 + rnd() * 0.022), y);
        c.closePath(); c.fillStyle = C.tape; c.fill();
        c.save(); c.clip();
        c.fillStyle = C.tapeLo; c.globalAlpha = 0.18;
        for (let y = 0; y < H; y += H / 18) c.fillRect(0, y + rnd() * 2, W, Math.max(1, H / 160));
        c.globalAlpha = 0.45; c.fillRect(0, 0, W, H * 0.04); c.fillRect(0, H * 0.96, W, H * 0.04);
        c.restore();
        c.strokeStyle = C.tapeEdge; c.lineWidth = Math.max(1, H / 90); c.globalAlpha = 0.7; c.stroke(); c.globalAlpha = 1;
    },
    _rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
};
