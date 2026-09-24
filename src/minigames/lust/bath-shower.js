// ================= ВАННАЯ: ДУШЕВАЯ СТОЙКА =================
// Стойка по референсу: классическая душевая колонна. Термостат внизу —
// корпус на стояке, подводки из стены с розетками, крестовая ручка
// спереди, рычаги сверху и снизу. Стояк вверх с держателем на стене,
// ступенька вбок, «гусиная шея» и круглая верхняя лейка. Сбоку — ручная
// лейка с белой керамической ручкой на своём держателе и металлический
// шланг, провисающий петлёй за ванну.
//
// Как рисуется — после двух отклонённых попыток:
//   1. Куски разными приёмами (труба полосами обводки, лейка плоским
//      конусом, запечённый кран гранями): части не стыковались.
//   2. Один станок «тело вращения», покрашенное мелкими гранями по свету:
//      стиль стал единым, но это та же имитация грубого 3д — на изгибах
//      и раструбе лесенка граней.
// Теперь — ВЕКТОР С НАСТОЯЩИМИ ГРАДИЕНТАМИ. Хром — это один профиль
// поперёк трубы (profile): тёмная кромка, яркий блик ближе к свету,
// тёмная полоса отражённого пола, отсвет у дальней кромки. Прямой кусок
// трубы красится линейным градиентом поперёк оси, дуга — радиальным из
// центра дуги: профиль сам поворачивается вместе с трубой, и стык прямой
// с дугой бесшовный. Круглое, что смотрит на зрителя (розетки, шары,
// колпачки), — радиальным со смещённым к свету фокусом. Единство стиля —
// следствие: у всех частей один и тот же профиль.
//
// Геометрия — «черепахой»: прямо, поворот с радиусом, прямо. Длины
// ступеньки и стояка ВЫЧИСЛЯЮТСЯ так, чтобы лицо верхней лейки встало
// точно в гнездо showerHead: под ним льётся дождь и вуаль.

const BATH_SHOWER = {
    X: 196,          // ось стояка: левее червя, в видимой части кадра
    MIX_Y: 640,      // ось термостата: над бортом, с местом под нижний рычаг
    R: 6,            // радиус трубы стояка
    HEAD_R: 46,      // радиус верхней лейки

    // Профиль хрома поперёк трубы: u от −1 (сторона к свету) до +1.
    // Ступени рампы, а не выдуманные цвета.
    profile() {
        const C = btPal().chrome;
        return [[-1, C[700]], [-0.8, C[500]], [-0.52, C[100]], [-0.3, C[300]],
                [0.05, C[500]], [0.42, C[900]], [0.7, C[700]], [0.9, C[300]], [1, C[500]]];
    },

    // ---------- ГРАДИЕНТЫ ----------
    defs: null,
    gid: 0,
    grad(markup) {
        const id = `${this.prefix || 'bs-g'}${this.gid++}`;
        this.defs.push(markup.replace('ID', id));
        return `url(#${id})`;
    },
    stops(list) {
        return list.map(([o, c]) => `<stop offset="${o.toFixed(4)}" stop-color="${c}"/>`).join('');
    },
    // Поперёк прямого куска: от стороны света (a) к теневой (b).
    linear(a, b) {
        return this.grad(`<linearGradient id="ID" gradientUnits="userSpaceOnUse" x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}">`
            + this.stops(this.profile().map(([u, c]) => [(u + 1) / 2, c])) + `</linearGradient>`);
    },
    // Поперёк дуги: радиус от центра. lightOut — свет на внешней стороне.
    radial(c, rho, r, lightOut) {
        const R = rho + r;
        const st = this.profile().map(([u, col]) => [(lightOut ? rho - u * r : rho + u * r) / R, col])
            .sort((p, q) => p[0] - q[0]);
        return this.grad(`<radialGradient id="ID" gradientUnits="userSpaceOnUse" cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="${R.toFixed(2)}">`
            + this.stops(st) + `</radialGradient>`);
    },
    // Шар или круглое лицом к зрителю: фокус смещён к свету (вверх-влево).
    orb(c, r, ramp) {
        const C = ramp || btPal().chrome;
        return this.grad(`<radialGradient id="ID" gradientUnits="userSpaceOnUse" cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="${r.toFixed(2)}" fx="${(c.x - r * 0.4).toFixed(2)}" fy="${(c.y - r * 0.45).toFixed(2)}">`
            + this.stops([[0, C[100]], [0.35, C[300]], [0.7, C[500]], [0.9, C[700]], [1, C[900]]]) + `</radialGradient>`);
    },

    // ---------- ТРУБА ЧЕРЕПАХОЙ ----------
    // steps: ['go', длина] | ['turn', градусы (+ направо), радиус].
    // Возвращает заливку кусками, силуэт и конечную точку.
    pipe(start, heading, r, steps) {
        const f = (v) => v.toFixed(2), rad = Math.PI / 180;
        let p = { ...start }, h = heading * rad;
        let fill = '';
        const left = [], right = [];
        const L = (hh) => ({ x: Math.cos(hh - Math.PI / 2), y: Math.sin(hh - Math.PI / 2) });
        const edge = (q, hh) => { const n = L(hh); left.push({ x: q.x + n.x * r, y: q.y + n.y * r }); right.push({ x: q.x - n.x * r, y: q.y - n.y * r }); };
        edge(p, h);
        for (const s of steps) {
            if (s[0] === 'go') {
                const q = { x: p.x + s[1] * Math.cos(h), y: p.y + s[1] * Math.sin(h) };
                const n = L(h);
                // Кусок чуть длиннее с обоих концов: стык закрыт внахлёст.
                const e = { x: Math.cos(h) * 0.4, y: Math.sin(h) * 0.4 };
                const a1 = { x: p.x - e.x + n.x * r, y: p.y - e.y + n.y * r }, a2 = { x: q.x + e.x + n.x * r, y: q.y + e.y + n.y * r };
                const b2 = { x: q.x + e.x - n.x * r, y: q.y + e.y - n.y * r }, b1 = { x: p.x - e.x - n.x * r, y: p.y - e.y - n.y * r };
                const g = this.linear({ x: p.x + n.x * r, y: p.y + n.y * r }, { x: p.x - n.x * r, y: p.y - n.y * r });
                fill += `<path d="M${f(a1.x)} ${f(a1.y)}L${f(a2.x)} ${f(a2.y)}L${f(b2.x)} ${f(b2.y)}L${f(b1.x)} ${f(b1.y)}Z" fill="${g}"/>`;
                p = q; edge(p, h);
            } else {
                const d = s[1] * rad, rho = s[2], dir = Math.sign(d);
                const c = { x: p.x + rho * Math.cos(h + dir * Math.PI / 2), y: p.y + rho * Math.sin(h + dir * Math.PI / 2) };
                const phi0 = Math.atan2(p.y - c.y, p.x - c.x), phi1 = phi0 + d;
                const pt = (rr, ph) => ({ x: c.x + rr * Math.cos(ph), y: c.y + rr * Math.sin(ph) });
                // Направо — свет (левая сторона хода) снаружи дуги.
                const g = this.radial(c, rho, r, dir > 0);
                const ov = 0.4 / rho * dir;           // внахлёст на соседей
                const o0 = pt(rho + r, phi0 - ov), o1 = pt(rho + r, phi1 + ov);
                const i1 = pt(rho - r, phi1 + ov), i0 = pt(rho - r, phi0 - ov);
                const sw = dir > 0 ? 1 : 0, big = Math.abs(d) > Math.PI ? 1 : 0;
                fill += `<path d="M${f(o0.x)} ${f(o0.y)}A${f(rho + r)} ${f(rho + r)} 0 ${big} ${sw} ${f(o1.x)} ${f(o1.y)}`
                      + `L${f(i1.x)} ${f(i1.y)}A${f(rho - r)} ${f(rho - r)} 0 ${big} ${1 - sw} ${f(i0.x)} ${f(i0.y)}Z" fill="${g}"/>`;
                const n = Math.max(2, Math.ceil(Math.abs(s[1]) / 4));
                for (let k = 1; k <= n; k++) edge(pt(rho, phi0 + d * k / n), h + d * k / n);
                p = pt(rho, phi1); h += d;
            }
        }
        const pts = left.concat(right.reverse());
        const sil = pts.map((q, i) => `${i ? 'L' : 'M'}${f(q.x)} ${f(q.y)}`).join('') + 'Z';
        return { fill, sil, end: p, heading: h / rad };
    },
    // Где окажется конец трубы — без рисования: для подгонки длин.
    endOf(start, heading, steps) {
        const rad = Math.PI / 180;
        let p = { ...start }, h = heading * rad;
        for (const s of steps) {
            if (s[0] === 'go') p = { x: p.x + s[1] * Math.cos(h), y: p.y + s[1] * Math.sin(h) };
            else {
                const d = s[1] * rad, dir = Math.sign(d), rho = s[2];
                const c = { x: p.x + rho * Math.cos(h + dir * Math.PI / 2), y: p.y + rho * Math.sin(h + dir * Math.PI / 2) };
                const ph = Math.atan2(p.y - c.y, p.x - c.x) + d;
                p = { x: c.x + rho * Math.cos(ph), y: c.y + rho * Math.sin(ph) }; h += d;
            }
        }
        return p;
    },

    // Короткий точёный цилиндр вдоль оси a→b (муфта, гайка, корпус, рычаг):
    // прямой кусок того же профиля со скруглёнными углами.
    collar(a, b, r, round) {
        const f = (v) => v.toFixed(2);
        const l = Math.hypot(b.x - a.x, b.y - a.y), t = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
        const n = { x: t.y, y: -t.x };                    // левая сторона хода
        const rr = Math.min(round == null ? 2 : round, l / 2, r);
        const P = (s, u) => ({ x: a.x + t.x * s + n.x * u, y: a.y + t.y * s + n.y * u });
        const q = [P(0, r - rr), P(rr, r), P(l - rr, r), P(l, r - rr), P(l, -r + rr), P(l - rr, -r), P(rr, -r), P(0, -r + rr)];
        const k = (p) => `${f(p.x)} ${f(p.y)}`;
        const d = `M${k(q[0])}Q${k(P(0, r))} ${k(q[1])}L${k(q[2])}Q${k(P(l, r))} ${k(q[3])}L${k(q[4])}`
                + `Q${k(P(l, -r))} ${k(q[5])}L${k(q[6])}Q${k(P(0, -r))} ${k(q[7])}Z`;
        return { fill: `<path d="${d}" fill="${this.linear(P(0, r), P(0, -r))}"/>`, sil: d, a: P(0, r), b: P(0, -r) };
    },
    // Круг лицом к зрителю: колпачок, шарик.
    disc(c, r, ramp) {
        const f = (v) => v.toFixed(2);
        const d = `M${f(c.x - r)} ${f(c.y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
        return { fill: `<path d="${d}" fill="${this.orb(c, r, ramp)}"/>`, sil: d };
    },
    // Розетка на стене: плоский диск с блестящей фаской по краю.
    rosette(c, r) {
        const C = btPal().chrome, f = (v) => v.toFixed(2);
        const base = this.disc(c, r);
        const ri = r * 0.62;
        const ring = `M${f(c.x - ri)} ${f(c.y)}a${f(ri)} ${f(ri)} 0 1 0 ${f(2 * ri)} 0a${f(ri)} ${f(ri)} 0 1 0 ${f(-2 * ri)} 0Z`;
        const flat = this.grad(`<linearGradient id="ID" gradientUnits="userSpaceOnUse" x1="${f(c.x - ri)}" y1="${f(c.y - ri)}" x2="${f(c.x + ri)}" y2="${f(c.y + ri)}">`
            + this.stops([[0, C[300]], [0.5, C[500]], [1, C[700]]]) + `</linearGradient>`);
        return { fill: base.fill + `<path d="${ring}" fill="${flat}"/>`, sil: base.sil, line: ring };
    },

    // ---------- СТОЙКА ----------
    draw() {
        this.defs = []; this.gid = 0;
        const ink = PALETTE.ink, C = btPal().chrome, T = btPal().tile, Wt = btPal().water, V = btPal().valve;
        const En = btPal().enamel;
        const inner = mixColor(ink, C[900], 0.35);
        const S = BATH_BAKED.anchors.showerHead;
        const f = (v) => v.toFixed(2);
        const X = this.X, MY = this.MIX_Y, r = this.R, HR = this.HEAD_R;
        const parts = [];                    // сзади вперёд: { fill, sil, line? }

        // Лицо лейки — в гнезде showerHead. Над ним обод, купол и муфта,
        // в муфту сверху входит шея.
        const faceY = S.y, rimTop = faceY - 7, domeTop = rimTop - 15, neckEnd = domeTop - 6;

        // Труба: стояк вверх → ступенька вправо-вверх → снова вверх →
        // гусиная шея через верх вниз в лейку. Длины подгоняются под лейку.
        const jog = 42, jr = 12, arch = 48;
        const route = (up, diag) => [['go', up], ['turn', jog, jr], ['go', diag], ['turn', -jog, jr],
                                     ['go', 34], ['turn', 180, arch], ['go', 14]];
        const start = { x: X, y: MY - 30 };
        // x конца линеен по длине ступеньки, y — по длине стояка.
        const x0 = this.endOf(start, -90, route(100, 0)).x, x1 = this.endOf(start, -90, route(100, 10)).x;
        const diag = (S.x - x0) / ((x1 - x0) / 10);
        const y0 = this.endOf(start, -90, route(100, diag)).y;
        const up = 100 + (y0 - neckEnd);
        const tube = this.pipe(start, -90, r, route(up, diag));

        // Подводки из стены с розетками по бокам термостата.
        for (const side of [-1, 1]) {
            parts.push(this.rosette({ x: X + side * 44, y: MY }, 11));
            parts.push(this.collar({ x: X + side * 12, y: MY }, { x: X + side * 44, y: MY }, 4.6, 1));
        }
        const TUBE = { fill: tube.fill, sil: tube.sil, bare: true };
        parts.push(TUBE);
        // Держатель на стене посередине стояка: розетка слева, короткий
        // кронштейн, хомут на трубе, барашек винта справа.
        const midY = MY - 270;
        parts.push(this.rosette({ x: X - 30, y: midY }, 8.5));
        parts.push(this.collar({ x: X - 6, y: midY }, { x: X - 30, y: midY }, 3, 1));
        parts.push(this.collar({ x: X, y: midY + 8 }, { x: X, y: midY - 8 }, r + 3, 1.6));
        parts.push(this.collar({ x: X + 8, y: midY }, { x: X + 15, y: midY }, 2.2, 0.8));
        parts.push(this.disc({ x: X + 17, y: midY }, 3.4));

        // Держатель ручной лейки: хомут на стояке, барашек слева, рожок
        // вправо до ЧАШКИ, в которой стоит ручка (чашка — ниже, поверх
        // ручки). Первая версия обрывала рожок в воздухе рядом с лейкой, и
        // лейка висела ни на чём.
        const hY = MY - 130;
        parts.push(this.collar({ x: X, y: hY + 8 }, { x: X, y: hY - 8 }, r + 3, 1.6));
        parts.push(this.collar({ x: X - 8, y: hY }, { x: X - 14, y: hY }, 2.2, 0.8));
        parts.push(this.disc({ x: X - 16, y: hY }, 3.4));
        parts.push(this.collar({ x: X + 6, y: hY }, { x: X + 25, y: hY }, 2.6, 1));

        // Термостат: корпус на стояке, толще его, муфты сверху и снизу.
        parts.push(this.collar({ x: X, y: MY + 20 }, { x: X, y: MY - 20 }, 12, 4));
        parts.push(this.collar({ x: X, y: MY - 19 }, { x: X, y: MY - 31 }, 8.5, 2));
        parts.push(this.collar({ x: X, y: MY + 19 }, { x: X, y: MY + 32 }, 8.5, 2));
        // Рычагов сверху и снизу, как на референсе, НЕТ: в этом масштабе и
        // в фас они читались случайными трубками, торчащими вбок. Вода
        // включается крестом — он один и узнаётся сразу.
        // Выход на шланг внизу корпуса.
        parts.push(this.collar({ x: X, y: MY + 31 }, { x: X, y: MY + 42 }, 4.2, 1.2));

        // Крестовая ручка спереди: четыре спицы с шариками, колпачок с
        // меткой горячей и холодной.
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            parts.push(this.collar({ x: X, y: MY }, { x: X + dx * 13, y: MY + dy * 13 }, 2.1, 1));
            parts.push(this.disc({ x: X + dx * 14, y: MY + dy * 14 }, 3.2));
        }
        parts.push(this.disc({ x: X, y: MY }, 5.4));
        const cap = `<path d="M${f(X - 2.6)} ${f(MY)}a2.6 2.6 0 0 1 5.2 0Z" fill="${V.hot}"/>`
                  + `<path d="M${f(X - 2.6)} ${f(MY)}a2.6 2.6 0 0 0 5.2 0Z" fill="${V.cold}"/>`;

        // Шланг: металлическая оплётка от выхода термостата петлёй вниз (за
        // бортом её прячет ванна) и вверх к ручке лейки.
        const hs = { x: X + 29, y: hY + 18 };                   // низ ручки
        const hoseD = `M${f(X)} ${f(MY + 42)}C${f(X - 2)} ${f(MY + 150)} ${f(X + 44)} ${f(MY + 160)} ${f(X + 42)} ${f(MY + 70)}`
                    + `C${f(X + 40)} ${f(MY + 10)} ${f(hs.x + 1)} ${f(hs.y + 60)} ${f(hs.x)} ${f(hs.y + 9)}`;

        // Ручная лейка: белая керамическая ручка, хромовая шейка, круглая
        // головка лицом к ванне.
        const hCollar = this.collar({ x: hs.x, y: hs.y + 10 }, { x: hs.x + 0.2, y: hs.y + 4 }, 5.6, 1.4);
        const handle = this.collar({ x: hs.x, y: hs.y + 5 }, { x: hs.x + 3, y: hs.y - 26 }, 5, 4.5);
        const en = [[0, En[3]], [0.28, En[5]], [0.55, En[4]], [0.85, En[2]], [1, En[3]]];
        handle.fill = handle.fill.replace(/url\(#bs-g\d+\)/, this.grad(
            `<linearGradient id="ID" gradientUnits="userSpaceOnUse" x1="${f(handle.a.x)}" y1="${f(handle.a.y)}" x2="${f(handle.b.x)}" y2="${f(handle.b.y)}">`
            + this.stops(en) + `</linearGradient>`));
        const hNeck = this.collar({ x: hs.x + 3, y: hs.y - 25 }, { x: hs.x + 5, y: hs.y - 37 }, 3.2, 1);
        const hHead = { x: hs.x + 6, y: hs.y - 49 };
        const hHeadBack = this.disc(hHead, 13.5);
        // Чашка держателя: сужается книзу, обнимает ручку под шейкой.
        // Ручка сидит в ней, а не висит рядом: левый бок чашки — продолжение
        // рожка.
        const cupAt = (y) => ({ x: hs.x + 3 * (hs.y + 5 - y) / 31, y });
        const cA = cupAt(hY - 5), cB = cupAt(hY + 6);
        const cup = (() => {
            const t = { x: cB.x - cA.x, y: cB.y - cA.y }, l = Math.hypot(t.x, t.y);
            const n = { x: t.y / l, y: -t.x / l };
            const P = (p, u) => ({ x: p.x + n.x * u, y: p.y + n.y * u });
            const q = [P(cA, 7.6), P(cB, 6.2), P(cB, -6.2), P(cA, -7.6)];
            const d = `M${f(q[0].x)} ${f(q[0].y)}L${f(q[1].x)} ${f(q[1].y)}Q${f(cB.x)} ${f(cB.y + 2.4)} ${f(q[2].x)} ${f(q[2].y)}L${f(q[3].x)} ${f(q[3].y)}Z`;
            return { fill: `<path d="${d}" fill="${this.linear(P(cA, 7.6), P(cA, -7.6))}"/>`, sil: d,
                     line: `M${f(q[3].x)} ${f(q[3].y)}Q${f(cA.x)} ${f(cA.y + 2.6)} ${f(q[0].x)} ${f(q[0].y)}` };
        })();
        const hFace = `M${f(hHead.x - 8.5)} ${f(hHead.y)}a8.5 11.5 0 1 0 17 0a8.5 11.5 0 1 0 -17 0Z`;

        // Верхняя лейка.
        const neckCollar = this.collar({ x: S.x, y: domeTop + 1 }, { x: S.x, y: neckEnd - 4 }, r + 2.6, 1.4);
        const domeD = `M${f(S.x - HR + 2)} ${f(rimTop)}C${f(S.x - HR + 6)} ${f(domeTop + 2)} ${f(S.x - 14)} ${f(domeTop)} ${f(S.x)} ${f(domeTop)}`
                    + `C${f(S.x + 14)} ${f(domeTop)} ${f(S.x + HR - 6)} ${f(domeTop + 2)} ${f(S.x + HR - 2)} ${f(rimTop)}Z`;
        const dome = { fill: `<path d="${domeD}" fill="${this.linear({ x: S.x - HR, y: 0 }, { x: S.x + HR, y: 0 })}"/>`, sil: domeD };
        // Обод: боковина цилиндра между верхним краем и лицом. Снизу ближний
        // край лица выше дальнего, поэтому видна верхняя дуга лица.
        const ry = 10;
        const rimD = `M${f(S.x - HR)} ${f(rimTop)}A${HR} ${ry} 0 0 1 ${f(S.x + HR)} ${f(rimTop)}`
                   + `L${f(S.x + HR)} ${f(faceY)}A${HR} ${ry} 0 0 0 ${f(S.x - HR)} ${f(faceY)}Z`;
        const rim = { fill: `<path d="${rimD}" fill="${this.linear({ x: S.x - HR, y: 0 }, { x: S.x + HR, y: 0 })}"/>`, sil: rimD };
        const rimLo = `M${f(S.x - HR)} ${f(faceY)}A${HR} ${ry} 0 0 0 ${f(S.x + HR)} ${f(faceY)}A${HR} ${ry} 0 0 0 ${f(S.x - HR)} ${f(faceY)}Z`;
        const faceIn = `M${f(S.x - HR + 5)} ${f(faceY)}a${HR - 5} ${ry - 2.2} 0 1 0 ${2 * (HR - 5)} 0a${HR - 5} ${ry - 2.2} 0 1 0 ${-2 * (HR - 5)} 0Z`;
        const faceG = this.grad(`<radialGradient id="ID" gradientUnits="userSpaceOnUse" cx="${f(S.x - 8)}" cy="${f(faceY - 2)}" r="${HR}" gradientTransform="translate(0 ${f(faceY)}) scale(1 ${(ry / HR).toFixed(3)}) translate(0 ${f(-faceY)})">`
            + this.stops([[0, C[700]], [0.7, C[900]], [1, mixColor(C[900], ink, 0.3)]]) + `</radialGradient>`);
        // Сопла кольцами; часть забита известью.
        let holes = '', lime = '';
        const rnd = btRng(53);
        for (const [k, n] of [[0.18, 6], [0.4, 12], [0.6, 18], [0.8, 24]]) for (let i = 0; i < n; i++) {
            const a = 2 * Math.PI * (i + 0.5 * k) / n;
            const q = { x: S.x + Math.cos(a) * (HR - 5) * k, y: faceY + Math.sin(a) * (ry - 2.2) * k };
            if (rnd() < 0.18) lime += `M${f(q.x - 1.8)} ${f(q.y)}a1.8 0.8 0 1 0 3.6 0a1.8 0.8 0 1 0 -3.6 0Z`;
            else holes += `M${f(q.x - 1.1)} ${f(q.y)}a1.1 0.5 0 1 0 2.2 0a1.1 0.5 0 1 0 -2.2 0Z`;
        }
        const dx = S.x + 12, dy = faceY + ry - 1;
        const drip = `M${f(dx - 2)} ${f(dy + 1.5)}Q${f(dx)} ${f(dy - 1)} ${f(dx + 2)} ${f(dy + 1.5)}`
                   + `Q${f(dx + 3)} ${f(dy + 6)} ${f(dx)} ${f(dy + 7)}Q${f(dx - 3)} ${f(dy + 6)} ${f(dx - 2)} ${f(dy + 1.5)}Z`;

        // Порядок и контур. Толстый внешний контур — ОДНИМ проходом по всем
        // силуэтам ПОД заливками: снаружи остаётся общий контур стойки без
        // швов. Стыки частей внутри — тонкой линией тоном тени.
        const hand = [hCollar, handle, hNeck, hHeadBack, cup];
        const head = [neckCollar, dome, rim];
        const all = parts.concat(hand, head);
        const halo = all.map(p => p.sil).join('') + rimLo;
        const seam = (p) => p.bare ? '' : `<path d="${p.sil}" fill="none" stroke="${inner}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>`;
        const paint = (list) => list.map(p => p.fill + seam(p)
            + (p.line ? `<path d="${p.line}" fill="none" stroke="${inner}" stroke-width="${STROKE.hairline}"/>` : '')).join('');
        // Оплётка: тёмное тело, светлый бок к свету и мелкая насечка по
        // блику — видно, что шланг витой, но полос «молнией» нет.
        const hose = `
            <path d="${hoseD}" fill="none" stroke="${ink}" stroke-width="${5.6 + 2 * STROKE.contour}" stroke-linecap="round"/>
            <path d="${hoseD}" fill="none" stroke="${C[700]}" stroke-width="5.6" stroke-linecap="round"/>
            <path d="${hoseD}" fill="none" stroke="${C[500]}" stroke-width="3.4" stroke-linecap="round" transform="translate(-0.8 0)"/>
            <path d="${hoseD}" fill="none" stroke="${C[100]}" stroke-width="1.5" stroke-dasharray="0.9 1.3" stroke-opacity="0.8" transform="translate(-1.3 0)"/>`;
        return `
        <g class="bt-shower-art">
            <defs>${this.defs.join('')}</defs>
            <path d="${halo}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            ${paint(parts)}${cap}
            ${hose}
            ${paint(hand)}
            <path d="${hFace}" fill="${C[900]}" stroke="${inner}" stroke-width="${STROKE.detail}"/>
            <path d="M${f(hHead.x - 5.5)} ${f(hHead.y)}a5.5 8 0 1 0 11 0a5.5 8 0 1 0 -11 0Z" fill="none" stroke="${C[300]}" stroke-width="1.3" stroke-dasharray="0.1 2.3" stroke-linecap="round"/>
            ${paint(head)}
            <path d="${rimLo}" fill="${C[500]}" stroke="${inner}" stroke-width="${STROKE.structure}"/>
            <path d="${faceIn}" fill="${faceG}"/>
            <path d="${holes}" fill="${C[300]}" fill-opacity="0.9"/>
            <path d="${lime}" fill="${T.scale}"/>
            <path d="${drip}" fill="${Wt.surfHi}" stroke="${Wt.edge}" stroke-width="0.8"/>
        </g>`;
    }
};
