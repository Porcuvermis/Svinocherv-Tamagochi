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
        // Слои (сзади вперёд): задняя стенка → толстое дно → монеты →
        // передняя стенка (толща у краёв, блики) → скотч → горло → контур.
        // Было: кольцо дна рисовалось после монет и лежало поверх кучи.
        // 2. толстое дно: светлое кольцо стекла — под монетами
        c.save(); this.silhouette(c, v); c.clip();
        c.beginPath(); c.ellipse(0, -0.035, this.r(0.035) * 0.92, this.r(0.035) * 0.92 * v + 0.012, 0, 0, 7);
        c.strokeStyle = J.bottom; c.lineWidth = 0.022; c.globalAlpha = 0.85; c.stroke();
        c.restore(); c.globalAlpha = 1;
        // 3. монеты внутри
        if (P.coins !== false) this.coins(c, v, G, P.yaw || 0);
        c.save(); this.silhouette(c, v); c.clip();
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
        // (была белая дуга поперёк плеч — читалась непонятной полосой, игрок
        // 17.11; плечо ловит свет вертикальным бликом выше)
        c.globalAlpha = 1;
        c.restore();
        // 6. скотч обегает банку
        if (P.tape) this.tape(c, v, P.tape, P.yaw || 0);
        if (P.shop) this.tape(c, v, P.shop, P.yaw || 0);
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

    // Куча монет — настоящие диски в объёме банки (запечены симуляцией
    // насыпания, greed-jar3-coins.js): все одного размера, у каждой своё
    // место и наклон; на экран их проецирует этот код — так перспектива
    // верная сама и монеты поворачиваются вместе с банкой. Было: монеты
    // рисовались эллипсами случайного размера прямо на экране, и передние
    // выходили меньше задних (игрок, 17.11).
    // Проекция — та же, что у силуэта: экран x = X, y = −Y + Z·view.
    // Монета — плоскими пятнами без градиентов: ребро, лицо со светом по
    // нормали, серп блика, ободок / серебряная середина, тушевая обводка.
    coins(c, v, G, yaw = 0) {
        const D = this.COINS, C = this.COIN;
        if (!D) return;
        c.save(); this.silhouette(c, v, 0.014); c.clip();
        const Sv = PALETTE.greedCoin.silver, ca = Math.sqrt(1 - v * v), a = yaw * Math.PI / 180, cy = Math.cos(a), sy = Math.sin(a);
        const L = [-0.45, 0.8, 0.4], ln = Math.hypot(...L);
        const list = [];
        for (let k = 0; k < D.length; k += 6) {
            const x = D[k] * cy + D[k + 2] * sy, z = -D[k] * sy + D[k + 2] * cy;
            let nx = D[k + 3] * cy + D[k + 5] * sy, ny = D[k + 4], nz = -D[k + 3] * sy + D[k + 5] * cy;
            // к зрителю: (0, v, ca); монету видно с той стороны, что к нам
            if (nx * 0 + ny * v + nz * ca < 0) { nx = -nx; ny = -ny; nz = -nz; }
            list.push({ x, y: D[k + 1], z, nx, ny, nz, d: D[k + 1] * v + z * ca, bi: ((k / 6) * 7919) % 10 < 4.5 });
        }
        list.sort((p, q) => p.d - q.d);
        const P = (px, py, pz) => [px, -py + pz * v];
        list.forEach((m) => {
            // оси диска: u ⟂ n (в горизонтали), w = n × u
            let ux = -m.nz, uz = m.nx, ul = Math.hypot(ux, uz);
            if (ul < 1e-4) { ux = 1; uz = 0; ul = 1; }
            ux /= ul; uz /= ul;
            const wx = m.ny * uz, wy = m.nz * ux - m.nx * uz, wz = -m.ny * ux;
            const [ax, ay] = P(ux * C.r, 0, uz * C.r), [bx, by] = P(wx * C.r, wy * C.r, wz * C.r);
            const [ox, oy] = P(m.x, m.y, m.z), [tx, ty] = P(-m.nx * C.th, -m.ny * C.th, -m.nz * C.th);
            const lit = Math.max(0, (m.nx * L[0] + m.ny * L[1] + m.nz * L[2]) / ln);
            const deep = Math.max(0, Math.min(1, (this.COIN_TOP - m.y) / this.COIN_TOP));   // ниже в куче — темнее
            const face = m.bi ? Sv : G;
            // ребро — тот же диск, сдвинутый на толщину против нормали
            c.save(); c.transform(ax, ay, bx, by, ox + tx, oy + ty);
            c.beginPath(); c.arc(0, 0, 1, 0, 7); c.fillStyle = G.deep; c.globalAlpha = 1; c.fill();
            c.restore();
            c.save(); c.transform(ax, ay, bx, by, ox, oy);
            c.beginPath(); c.arc(0, 0, 1.04, 0, 7); c.fillStyle = PALETTE.ink; c.globalAlpha = 0.5; c.fill();
            c.globalAlpha = 1;
            c.beginPath(); c.arc(0, 0, 1, 0, 7); c.fillStyle = lit > 0.75 ? G.hi : lit > 0.4 ? G[500] : G.lo; c.fill();
            // серп: основной тон со сдвигом от света — по краю к свету светлее
            c.beginPath(); c.arc(0.1, 0.12, 0.92, 0, 7); c.fillStyle = lit > 0.75 ? G[500] : G.lo; c.globalAlpha = 0.85; c.fill();
            c.globalAlpha = 1;
            if (m.bi) {
                c.beginPath(); c.arc(0, 0, 0.6, 0, 7); c.fillStyle = lit > 0.6 ? face.hi : face[500]; c.fill();
                c.beginPath(); c.arc(0.05, 0.07, 0.52, 0, 7); c.fillStyle = lit > 0.6 ? face[500] : face.lo; c.fill();
            } else {
                c.beginPath(); c.arc(0, 0, 0.72, 0, 7); c.strokeStyle = G.lo; c.lineWidth = 0.09; c.globalAlpha = 0.7; c.stroke();
                c.beginPath(); c.arc(0, 0, 0.72, Math.PI * 1.05, Math.PI * 1.6); c.strokeStyle = G.hi; c.globalAlpha = 0.85; c.stroke();
            }
            if (lit > 0.85 && deep < 0.2) { c.globalAlpha = 0.9; c.fillStyle = G.glint; c.beginPath(); c.arc(-0.4, -0.35, 0.15, 0, 7); c.fill(); }
            if (deep > 0.05) { c.globalAlpha = deep * 0.55; c.fillStyle = PALETTE.greedCoin.gap; c.beginPath(); c.arc(0, 0, 1.04, 0, 7); c.fill(); }
            c.restore();
        });
        c.globalAlpha = 1;
        c.restore();
    },

    // Скотч — полоса на цилиндре тела: холст делится на узкие полосы, каждая
    // встаёт на свой угол вокруг оси; видны те, что смотрят к игроку. Верх и
    // низ полосы — по эллипсу сечения, к краям полоса темнее (уходит вбок).
    // tex.u0…u1 — какую часть дуги покрывает холст (по умолчанию всю):
    // магазин рисуется только на той части скотча, что видна «в упор», —
    // в своём, более подробном холсте поверх бумаги.
    tape(c, v, tex, yaw) {
        const T = this.TAPE, A = T.arc * Math.PI / 180, rr = this.R * 1.012;
        const U0 = tex.u0 == null ? 0 : tex.u0, U1 = tex.u1 == null ? 1 : tex.u1, N = Math.max(24, Math.round(72 * (U1 - U0) * 2));
        for (let i = 0; i < N; i++) {
            const f0 = i / N, f1 = (i + 1) / N, u0 = U0 + f0 * (U1 - U0), u1 = U0 + f1 * (U1 - U0);
            const a0 = (yaw * Math.PI / 180) + (u0 - 0.5) * A, a1 = (yaw * Math.PI / 180) + (u1 - 0.5) * A, am = (a0 + a1) / 2;
            if (Math.cos(am) <= 0.02) continue;
            const x0 = rr * Math.sin(a0), x1 = rr * Math.sin(a1);
            const dy = rr * Math.cos(am) * v;
            const sx = f0 * tex.width, sw = tex.width / N;
            c.save();
            c.globalAlpha = 1;
            c.drawImage(tex, sx, 0, sw + 0.5, tex.height, Math.min(x0, x1) - 0.0008, -T.y1 + dy, Math.abs(x1 - x0) + 0.0016, T.y1 - T.y0);
            // к краям — тень (полоса уходит вбок от света и от глаза)
            if (tex.shade === false) { c.restore(); continue; }
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
    // ---------- МАГАЗИН НА СКОТЧЕ ----------
    // Видимая «в упор» часть скотча (план 31, разд. 00): u 0,31…0,69 по дуге,
    // по высоте — до рамки снизу. Холст — ровно эта часть, в пропорции куска
    // (0,21 × 0,333 высоты банки), подробный: на экране он ~318×494 точек.
    SHOP_WIN: { u0: 0.31, u1: 0.69, w: 960, h: 1520, vMax: 0.92 },
    // Слева направо (игрок): колесо и пачинко — слева одно над другим, их
    // ветки сходятся вправо к аппарату версии 2. Сверху — жетоны игрока.
    // Узел: закрыт (v2, пока не открыты обе ветки) — бледный, пунктир;
    // копится — «вложено/нужно»; готов — обведён, галочка вместо числа.
    // st: { wheel, pach, v2, need:{wheel,pach,v2}, have, press, pop:{узел:сек}, rev 0..1 }
    tapeShop(st) {
        const Wn = this.SHOP_WIN, W = Wn.w, H = Wn.h;
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        cv.u0 = Wn.u0; cv.u1 = Wn.u1; cv.shade = false;
        const c = cv.getContext('2d'), C = PALETTE.greedJunk.reel.jar, ink = PALETTE.greedJunk.reel.rag.marker;
        // бумага без рваных концов (концы — на общем куске под этим холстом)
        c.fillStyle = C.tape; c.fillRect(0, 0, W, H);
        const rnd0 = this._rnd(91);
        c.fillStyle = C.tapeLo; c.globalAlpha = 0.16;
        for (let y = 0; y < H; y += H / 34) c.fillRect(0, y + rnd0() * 3, W, 2);
        c.globalAlpha = 0.45; c.fillRect(0, 0, W, H * 0.02); c.globalAlpha = 1;
        const done = (k) => st[k] >= st.need[k], open2 = done('wheel') && done('pach');
        const rev = st.rev == null ? 1 : st.rev, part = (a, b) => Math.max(0, Math.min(1, (rev - a) / (b - a)));
        const popQ = (x) => x <= 0 ? 0 : x >= 1 ? 1 : 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);
        const lw = W * 0.016;
        const stroke = (pts, seed, closed, w = lw, col = ink, dash) => {
            const rnd = GreedJunk.rng(seed);
            c.save(); c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
            if (dash) c.setLineDash(dash);
            c.stroke(new Path2D(GreedJunk.handPath(pts, rnd, closed, W * 0.004))); c.restore();
        };
        const oval = (x, y, rx, ry, seed, w = lw, col = ink, dash) => {
            const rnd = GreedJunk.rng(seed);
            c.save(); c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; if (dash) c.setLineDash(dash);
            c.stroke(new Path2D(GreedJunk.handOval(x, y, rx, ry, rnd, 9))); c.restore();
        };
        // цифры и знаки маркером: цифры — JAR_DIGIT (рамка 4×7.4), «/», «×», «✓»
        const GLYPH = { '/': [[[3.6, 0.2], [0.4, 7.2]]], 'x': [[[0.6, 2.4], [3.4, 6.6]], [[3.4, 2.4], [0.6, 6.6]]] };
        const write = (txt, x, y, h, seed) => {
            const dw = h * 0.62, step = dw * 1.12, x0 = x - (txt.length * step) / 2;
            c.save(); c.strokeStyle = ink; c.lineCap = 'round'; c.lineJoin = 'round';
            txt.split('').forEach((ch, i) => {
                const L = GLYPH[ch] || GreedJunkLit.JAR_DIGIT[+ch]; if (!L) return;
                const rnd = GreedJunk.rng(seed + i * 31 + ch.charCodeAt(0) * 7);
                c.save(); c.translate(x0 + i * step, y - h / 2 + (rnd() - 0.5) * h * 0.06); c.rotate((rnd() - 0.5) * 0.08); c.scale(dw / 4, h / 7.4);
                c.lineWidth = h * 0.12 / (dw / 4);
                c.stroke(new Path2D(L.map(P => GreedJunk.handPath(P, rnd, false, 0.12)).join(' ')));
                c.restore();
            });
            c.restore();
        };
        const box = (x0, y0, x1, y1, seed, w = lw, col = ink, dash) => {
            const o = lw * 0.3;
            stroke([[x0 - o, y0], [x1 + o, y0]], seed, false, w, col, dash); stroke([[x1, y0 - o], [x1, y1 + o]], seed + 1, false, w, col, dash);
            stroke([[x1 + o, y1], [x0 - o, y1]], seed + 2, false, w, col, dash); stroke([[x0, y1 + o], [x0, y0 - o]], seed + 3, false, w, col, dash);
        };
        const tick = (x, y, h, seed) => stroke([[x - h * 0.45, y], [x - h * 0.1, y + h * 0.35], [x + h * 0.5, y - h * 0.45]], seed, false, lw * 1.4, PALETTE.greedJunk.paint.red);
        const node = (k, x, y, a, b, draw) => {
            const q = popQ(part(a, b)); if (q <= 0) return;
            c.save(); c.translate(x, y); c.scale(q, q); c.translate(-x, -y); draw(); c.restore();
        };
        // жетон алчности маркером: кольцо с тремя разломами, залито цветом греха
        const token = (x, y, r, seed) => {
            c.save(); c.beginPath(); c.arc(x, y, r, 0, 7); c.arc(x, y, r * 0.43, 0, 7, true);
            c.fillStyle = TokenArt.color('greed_token'); c.globalAlpha = 0.85; c.fill('evenodd'); c.restore();
            oval(x, y, r, r, seed, lw * 0.8); oval(x, y, r * 0.43, r * 0.43, seed + 1, lw * 0.7);
            for (let t = 0; t < 3; t++) { const a = t * Math.PI * 2 / 3 - Math.PI / 2;
                stroke([[x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45], [x + Math.cos(a) * r * 1.05, y + Math.sin(a) * r * 1.05]], seed + 5 + t, false, lw * 0.7); }
        };
        const press = (k, x, y, rx, ry) => { if (st.press === k) oval(x, y, rx, ry, 77, lw * 1.3, PALETTE.greedJunk.paint.red); };
        const count = (k, x, y) => {
            const age = st.pop && st.pop[k] != null ? st.pop[k] : 9, q = 1 + 0.35 * Math.exp(-age * 14);
            if (done(k)) { tick(x, y, H * 0.05 * q, 300 + k.length); return; }
            write(`${st[k]}/${st.need[k]}`, x, y, H * 0.05 * q, 500 + k.length * 13);
        };
        // раскладка в долях холста: слева — колесо (верх) и пачинко (низ)
        const X = (f) => f * W, Y = (f) => f * H;
        // видно x ~0,06…0,9 (дальше — рамка): аппарат версии 2 не правее 0,68
        const WH = [X(0.22), Y(0.33)], PA = [X(0.22), Y(0.69)], V2 = [X(0.69), Y(0.53)];
        // жетоны игрока — сверху
        node('have', X(0.5), Y(0.09), 0, 0.3, () => { token(X(0.36), Y(0.09), H * 0.035, 11); write(`x${st.have}`, X(0.58), Y(0.095), H * 0.05, 900); });
        // ветки: маркером от узлов к слиянию; открытая ветка — жирнее
        const L = part(0.45, 0.8);
        if (L > 0) {
            const branch = (from, seed, bold) => {
                const ex = V2[0] - X(0.2), pts = [[from[0] + X(0.16), from[1]], [X(0.4), from[1] + (V2[1] - from[1]) * 0.2], [X(0.44), V2[1] - (V2[1] - from[1]) * 0.25], [ex, V2[1]]];
                const n = Math.max(2, Math.round(pts.length * L)), sub = pts.slice(0, n);
                if (sub.length > 1) stroke(sub, seed, false, bold ? lw * 1.4 : lw, ink, bold ? null : [lw * 2.2, lw * 1.6]);
            };
            branch(WH, 41, done('wheel')); branch(PA, 43, done('pach'));
            if (L > 0.95) { const ax = V2[0] - X(0.2);
                stroke([[ax - X(0.045), V2[1] - Y(0.02)], [ax, V2[1]]], 47, false, lw * 1.2);
                stroke([[ax - X(0.045), V2[1] + Y(0.02)], [ax, V2[1]]], 48, false, lw * 1.2); }
        }
        // колесо
        node('wheel', WH[0], WH[1], 0.12, 0.42, () => {
            const [x, y] = WH, r = X(0.14), cy = y - Y(0.035);
            oval(x, cy, r, r, 21);
            for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; stroke([[x, cy], [x + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95]], 22 + i, false, lw * 0.75); }
            stroke([[x + r * 1.05, cy], [x + r * 1.4, cy - r * 0.2], [x + r * 1.4, cy + r * 0.2], [x + r * 1.05, cy]], 31, true, lw * 0.8);
            count('wheel', x, y + Y(0.1)); press('wheel', x + X(0.02), y + Y(0.02), X(0.24), Y(0.15));
            if (done('wheel')) oval(x, cy, r * 1.25, r * 1.25, 33, lw * 1.2, PALETTE.greedJunk.paint.red);
        });
        // пачинко
        node('pach', PA[0], PA[1], 0.25, 0.55, () => {
            const [x, y] = PA, w = X(0.2), h = Y(0.13), top = y - Y(0.04) - h / 2;
            box(x - w / 2, top, x + w / 2, top + h, 51);
            const aw = w * 0.36, ab = top + h * 0.92, at = top + h * 0.38, pts = [[x - aw, ab], [x - aw, at]];
            for (let i = 1; i < 8; i++) { const a = Math.PI + i / 8 * Math.PI; pts.push([x + Math.cos(a) * aw, at + Math.sin(a) * aw * 0.9]); }
            pts.push([x + aw, at], [x + aw, ab]); stroke(pts, 52, false, lw * 0.8);
            for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { c.beginPath(); c.arc(x - aw * 0.55 + j * aw * 0.55 + (i % 2) * aw * 0.27, at + i * h * 0.16, lw * 0.6, 0, 7); c.fillStyle = ink; c.fill(); }
            count('pach', x, y + Y(0.1)); press('pach', x + X(0.02), y + Y(0.02), X(0.24), Y(0.15));
            if (done('pach')) oval(x, top + h / 2, w * 0.75, h * 0.72, 53, lw * 1.2, PALETTE.greedJunk.paint.red);
        });
        // аппарат версии 2 — ступенчатая башня; закрыт — бледный пунктир
        node('v2', V2[0], V2[1], 0.7, 1, () => {
            // Аппарат версии 2 — узнаваемо и просто: корпус, сверху колесо
            // (полукруг со спицами) и короб пачинко, внизу экран с линией.
            const [x, y] = V2, w = X(0.34), dash = open2 ? null : [lw * 2.2, lw * 1.8];
            c.save(); c.globalAlpha = open2 ? 1 : 0.4;
            const top = y - Y(0.15), bot = y + Y(0.05), mid = top + Y(0.09);
            box(x - w / 2, top, x + w / 2, bot, 61, lw, ink, dash);
            const wr = w * 0.24, wx = x - w / 2 + wr + w * 0.05, wy = mid - Y(0.012);
            const arc = []; for (let i = 0; i <= 10; i++) { const a = Math.PI + i / 10 * Math.PI; arc.push([wx + Math.cos(a) * wr, wy + Math.sin(a) * wr]); }
            stroke(arc.concat([[wx - wr, wy]]), 63, false, lw * 0.8, ink, dash);
            for (let i = 1; i < 4; i++) { const a = Math.PI + i / 4 * Math.PI; stroke([[wx, wy], [wx + Math.cos(a) * wr * 0.92, wy + Math.sin(a) * wr * 0.92]], 70 + i, false, lw * 0.55, ink, dash); }
            box(x + w * 0.1, top + Y(0.016), x + w * 0.4, wy, 64, lw * 0.75, ink, dash);
            box(x - w * 0.36, mid + Y(0.02), x + w * 0.36, bot - Y(0.022), 65, lw * 0.75, ink, dash);
            stroke([[x - w * 0.3, (mid + bot) / 2], [x + w * 0.3, (mid + bot) / 2]], 66, false, lw * 0.6, open2 ? PALETTE.greedJunk.paint.red : ink, dash);
            if (open2) count('v2', x, y + Y(0.115)); else write(`${st.v2}/${st.need.v2}`, x, y + Y(0.115), H * 0.05, 700);
            c.restore();
            press('v2', x, y + Y(0.02), X(0.25), Y(0.17));
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
