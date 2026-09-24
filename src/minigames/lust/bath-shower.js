// ================= ВАННАЯ: ДУШЕВАЯ СТОЙКА ОДНИМ ПРЕДМЕТОМ =================
// Смеситель, стояк, колено, рукав, гайка, шарнир и лейка — ОДИН предмет, и
// нарисован он ОДНИМ способом. Первая перерисовка собирала душ из кусков,
// каждый своим приёмом: труба — полосами обводки, лейка — плоским конусом с
// жирной каймой, шарнир — кружком, кран остался запечённым из 3д гранями.
// Ни одна часть не стыковалась с соседней, и стойка читалась детским
// рисунком, который забывал, что рисует.
//
// Поэтому здесь нет рисования по частям. Есть ОДИН станок — тело вращения
// вокруг оси (tube): ось, радиус вдоль оси, и всё. Труба — тело вращения
// постоянного радиуса, гайка — короткое толстое, раструб лейки — с
// растущим радиусом, корпус смесителя — с круглыми торцами, шар —
// крошечная ось с радиусом по окружности. Розетки на стене — то же тело,
// повёрнутое осью на зрителя (disc).
//
// И ОДИН свет на всё: цвет точки считается из нормали поверхности одной
// функцией (shade) — отражение комнаты плюс блик от одной лампы. Поэтому
// блик на колене сам переезжает с бока стояка на верх рукава, раструб
// светлее сверху, чем снизу, а у всех частей тень и блик с одной стороны.
// Одинаковость здесь не договорённость, а следствие: другого способа
// покрасить часть просто нет.
//
// Цвет берётся из рампы хрома (PALETTE.bathScene.chrome) и квантуется на
// LEVELS ступеней: соседние ступени неотличимы глазом, зато участки одной
// ступени сливаются в один путь — предмет стоит пару сотен узлов, а не
// тысячи. Считается один раз при постройке сцены.

const BATH_SHOWER = {
    LEVELS: 48,
    // Свет в ванной сверху-слева и чуть от зрителя — тот же, что у фаски
    // плиток (светлая кромка сверху-слева).
    LIGHT: (() => { const v = [-0.62, -0.55, 0.56], l = Math.hypot(...v); return v.map(c => c / l); })(),
    R: 8,                 // радиус трубы

    // ---------- СВЕТ ----------
    // n — нормаль в пространстве экрана: x вправо, y ВНИЗ, z на зрителя.
    // Хром не освещается, а ОТРАЖАЕТ: цвет решает, куда смотрит отражённый
    // луч. Вверх — светлый потолок, вбок — средняя кафельная стена, вниз —
    // тёмный пол. Поверх — рассеянный свет лампы (иначе вертикальная труба,
    // у которой отражение смотрит только вбок, вышла бы ровной серой
    // палкой) и жёсткий блик там, где отражение попадает в саму лампу.
    shade(n) {
        const L = this.LIGHT;
        const nz = n[2];
        const R = [2 * nz * n[0], 2 * nz * n[1], 2 * nz * n[2] - 1];
        const up = -R[1];
        // Вбок влево отражается светлая стена у лампы, вправо — тень угла.
        const env = (up > 0 ? 0.55 + 0.4 * Math.min(1, up * 1.4)
                            : 0.55 - 0.5 * Math.min(1, -up * 1.6)) - 0.18 * R[0];
        const d = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
        const rl = R[0] * L[0] + R[1] * L[1] + R[2] * L[2];
        const spec = Math.max(0, Math.min(1, (rl - 0.72) / 0.08));
        // Отсвет по теневой кромке — кафель за трубой светлее её тени.
        const rim = Math.max(0, Math.min(1, (0.35 - nz) / 0.3)) * Math.max(0, -(n[0] * L[0] + n[1] * L[1])) ;
        let v = 0.55 * env + 0.45 * d + 0.18 * rim;
        v = v + (1.02 - v) * spec;
        return Math.max(0, Math.min(1, v));
    },

    ramp() {
        const C = btPal().chrome;
        return [C[900], C[700], C[500], C[300], C[100]];
    },
    tone(level) {
        const R = this.ramp(), t = level / (this.LEVELS - 1) * (R.length - 1);
        const i = Math.min(R.length - 2, Math.floor(t));
        return mixColor(R[i], R[i + 1], t - i);
    },

    // ---------- ОСЬ ----------
    // Ось задаётся кусками: прямая (две точки, свет вдоль неё не меняется)
    // и дуга (точка каждые несколько градусов). Прямая не дробится — это
    // половина экономии.
    line(a, b) { return [a, b]; },
    arc(c, r, a0, a1) {
        const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 3));
        const out = [];
        for (let i = 0; i <= n; i++) {
            const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180;
            out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
        }
        return out;
    },
    // Сшивка кусков в одну ось: стык не повторяется дважды.
    spine(...parts) {
        const out = [];
        for (const p of parts) for (const q of p) {
            const l = out[out.length - 1];
            if (!l || Math.hypot(l.x - q.x, l.y - q.y) > 0.01) out.push(q);
        }
        return out;
    },

    // ---------- ТЕЛО ВРАЩЕНИЯ ----------
    // pts — ось, rad(i, s) — радиус в точке оси (s — длина от начала).
    // Возвращает { fill: {уровень: путь}, edge: силуэт }.
    tube(pts, rad) {
        const f = (v) => v.toFixed(1);
        const len = [0];
        for (let i = 1; i < pts.length; i++)
            len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
        const r = pts.map((p, i) => rad(i, len[i]));
        // Касательная и нормаль в каждой точке оси.
        const T = pts.map((p, i) => {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
            const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
        });
        // Наклон поверхности из-за изменения радиуса: расширяющийся раструб
        // смотрит нормалью назад по оси — поэтому он светлее сверху.
        const slope = pts.map((p, i) => {
            const a = Math.max(0, i - 1), b = Math.min(pts.length - 1, i + 1);
            const ds = len[b] - len[a];
            return ds > 0 ? Math.atan2(r[b] - r[a], ds) : 0;
        });
        const K = 24;                         // полос поперёк
        const th = (j) => -Math.PI / 2 + Math.PI * j / K;
        const at = (i, j) => {
            const s = Math.sin(th(j));
            return { x: pts[i].x - T[i].y * r[i] * s, y: pts[i].y + T[i].x * r[i] * s };
        };
        const fill = {};
        for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < K; j++) {
            const tm = (th(j) + th(j + 1)) / 2;
            const Tm = { x: (T[i].x + T[i + 1].x) / 2, y: (T[i].y + T[i + 1].y) / 2 };
            const al = (slope[i] + slope[i + 1]) / 2;
            const ca = Math.cos(al), sa = Math.sin(al);
            // Нормаль: поперёк оси (sin θ), на зрителя (cos θ), наклон по оси.
            const n = [(-Tm.y * Math.sin(tm)) * ca - Tm.x * sa,
                       (Tm.x * Math.sin(tm)) * ca - Tm.y * sa,
                       Math.cos(tm) * ca];
            const lv = Math.round(this.shade(n) * (this.LEVELS - 1));
            const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
            fill[lv] = (fill[lv] || '') + `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}L${f(c.x)} ${f(c.y)}L${f(d.x)} ${f(d.y)}Z`;
        }
        let edge = '';
        for (let i = 0; i < pts.length; i++) { const p = at(i, 0); edge += `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`; }
        for (let i = pts.length - 1; i >= 0; i--) { const p = at(i, K); edge += `L${f(p.x)} ${f(p.y)}`; }
        return { fill, edge: edge + 'Z' };
    },

    // Диск на стене осью на зрителя: плоское лицо со скруглённой кромкой.
    // bevel — доля радиуса, по которой кромка заваливается к стене.
    disc(c, R, bevel) {
        const f = (v) => v.toFixed(1), K = 56, M = bevel >= 1 ? 16 : 9;
        const fill = {};
        const ring = (k) => 1 - bevel + bevel * k / M;           // радиус кольца, доля
        const tilt = (k) => Math.asin(Math.min(1, k / M));       // наклон кромки
        const P = (rr, a) => ({ x: c.x + R * rr * Math.cos(a), y: c.y + R * rr * Math.sin(a) });
        // Плоское лицо — один цвет.
        const face = Math.round(this.shade([0, 0, 1]) * (this.LEVELS - 1));
        let d0 = '';
        for (let i = 0; i < K; i++) { const p = P(1 - bevel, 2 * Math.PI * i / K); d0 += `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`; }
        fill[face] = d0 + 'Z';
        for (let k = 0; k < M; k++) for (let i = 0; i < K; i++) {
            const a0 = 2 * Math.PI * i / K, a1 = 2 * Math.PI * (i + 1) / K, am = (a0 + a1) / 2;
            const tl = (tilt(k) + tilt(k + 1)) / 2;
            const n = [Math.cos(am) * Math.sin(tl), Math.sin(am) * Math.sin(tl), Math.cos(tl)];
            const lv = Math.round(this.shade(n) * (this.LEVELS - 1));
            const a = P(ring(k), a0), b = P(ring(k + 1), a0), cc = P(ring(k + 1), a1), d = P(ring(k), a1);
            fill[lv] = (fill[lv] || '') + `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}L${f(cc.x)} ${f(cc.y)}L${f(d.x)} ${f(d.y)}Z`;
        }
        return { fill, edge: `M${f(c.x - R)} ${f(c.y)}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0Z` };
    },

    // Шар — тот же диск, у которого «кромка» — весь радиус.
    ball(c, R) { return this.disc(c, R, 1); },

    // Часть в разметку. Швы между полосами закрыты обводкой того же цвета:
    // без неё сквозь стыки просвечивает стена тонкой сеткой.
    paint(part) {
        let out = '';
        for (const lv of Object.keys(part.fill).sort((a, b) => a - b)) {
            const col = this.tone(+lv);
            out += `<path d="${part.fill[lv]}" fill="${col}" stroke="${col}" stroke-width="0.7" stroke-linejoin="round"/>`;
        }
        return out;
    },

    // Радиус со скруглёнными краями: деталь не рубленая, а точёная.
    rounded(s, L, R, rr) {
        const e = Math.min(s, L - s);
        return e >= rr ? R : R - rr + Math.sqrt(Math.max(0, rr * rr - (rr - e) * (rr - e)));
    },
    // Прямая ось с частыми точками — для деталей с переменным радиусом.
    rod(a, b, n) {
        const out = [];
        for (let i = 0; i <= n; i++) out.push({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n });
        return out;
    },

    // ---------- СТОЙКА ----------
    // Стоит там, где её ВИДНО: в обычном кадре ванной видна середина стены,
    // и стойка у самого края комнаты оставляла в игре один рукав, торчащий
    // из ниоткуда. Стояк — левее червя, над бортом; лейка — над чашей.
    X: 178,               // ось стояка
    MIX_Y: 652,           // ось смесителя
    TOP: 196,             // где стояк начинает гнуться в рукав
    BEND: 44,             // радиус колена

    draw() {
        const ink = PALETTE.ink, C = btPal().chrome, T = btPal().tile, Wt = btPal().water;
        const V = btPal().valve;
        const S = BATH_BAKED.anchors.showerHead;
        const inner = mixColor(ink, C[900], 0.35);
        const R = this.R, f = (v) => v.toFixed(1);
        const X = this.X, MY = this.MIX_Y, top = this.TOP, bend = this.BEND;

        // Смеситель — термостатическая планка: цилиндр вдоль стены, на
        // торцах соосные ручки чуть толще корпуса, между ними проточка.
        // Подводки уходят в стену ЗА корпусом, их не видно. Всё — одна ось,
        // профиль задаётся радиусом.
        const ML = 84, KN = 15;                        // длина планки, длина ручки
        const mixPts = this.rod({ x: X - ML / 2, y: MY }, { x: X + ML / 2, y: MY }, 84);
        const mixer = this.tube(mixPts, (i, s) => {
            const e = Math.min(s, ML - s);
            if (e < KN) return this.rounded(Math.min(e, KN - 0.001), KN, 12.5, 3.2) ;
            if (e < KN + 2.2) return 9;                // проточка
            return 10.5;
        });
        // Насечка на ручках: продольные риски — хват, по которому ручку
        // узнают. И эмалевая метка у внутреннего края: горячая слева.
        let grip = '';
        for (const side of [-1, 1]) {
            const x0 = X + side * (ML / 2 - 3), x1 = X + side * (ML / 2 - KN + 3);
            for (const a of [-50, -25, 0, 25, 50]) {
                const y = MY + 12.5 * Math.sin(a * Math.PI / 180);
                grip += `M${f(x0)} ${f(y)}L${f(x1)} ${f(y)}`;
            }
        }
        const band = (side, col) => {
            const xa = X + side * (ML / 2 - KN + 1.2);
            const xb = X + side * (ML / 2 - KN + 3.6);
            const x = Math.min(xa, xb), w = Math.abs(xb - xa);
            return `<rect x="${f(x)}" y="${f(MY - 12.2)}" width="${f(w)}" height="24.4" rx="1" fill="${col}"/>
                    <rect x="${f(x)}" y="${f(MY + 3)}" width="${f(w)}" height="9.2" fill="${C[900]}" fill-opacity="0.35"/>
                    <rect x="${f(x)}" y="${f(MY - 9)}" width="${f(w)}" height="2.2" fill="${C[100]}" fill-opacity="0.7"/>`;
        };
        // Выход на стояк: точёная гайка на верху корпуса.
        const nutLow = this.tube(this.rod({ x: X, y: MY - 7 }, { x: X, y: MY - 21 }, 14),
            (i, s) => this.rounded(s, 14, R + 3.2, 2.4));

        // Стояк, колено, рукав и спуск к лейке — ОДНА ось: труба гнётся, а
        // не собирается из кусков с гайками на каждом углу.
        const armY0 = top - bend, headX = S.x, armY1 = armY0 + 10;
        const drop = 16;                                  // радиус спуска к лейке
        const ang = Math.atan2(armY1 - armY0, headX - drop - (X + bend)) * 180 / Math.PI;
        const pipe = this.tube(this.spine(
            this.line({ x: X, y: MY - 10 }, { x: X, y: top }),
            this.arc({ x: X + bend, y: top }, bend, 180, 270),
            this.line({ x: X + bend, y: armY0 }, { x: headX - drop, y: armY1 }),
            this.arc({ x: headX - drop, y: armY1 + drop }, drop, 270 + ang, 360)
        ), () => R);
        const jointY = armY1 + drop;
        // Хомуты: розетка на стене за трубой и кольцо поверх неё.
        const clamp = (y) => ({
            ros: this.disc({ x: X, y }, 13, 0.5),
            ring: this.tube(this.rod({ x: X, y: y - 5 }, { x: X, y: y + 5 }, 10), (i, s) => this.rounded(s, 10, R + 2.6, 1.6))
        });
        const cl = [clamp(MY - 170), clamp(top + 90)];

        // Лейка: гайка, шар шарнира, раструб с растущим радиусом.
        const nut = this.tube(this.rod({ x: headX, y: jointY - 2 }, { x: headX, y: jointY + 9 }, 11),
            (i, s) => this.rounded(s, 11, R + 3, 2.2));
        const ballC = { x: headX, y: jointY + 13.5 };
        const joint = this.ball(ballC, 8.2);
        const faceY = S.y - 2, faceR = 40, faceRy = 11;
        const bellLen = faceY - ballC.y - 4;
        // Профиль раструба вогнутый: узкая шейка, потом быстро расходится.
        const bell = this.tube(this.rod({ x: headX, y: ballC.y + 4 }, { x: headX, y: faceY }, 24),
            (i, s) => 6.2 + (faceR - 6.2) * Math.pow(s / bellLen, 1.9));

        // Лицо лейки видно снизу: горизонт на уровне борта, лейка сильно
        // выше. Кольцо, пластина, сопла кольцами; часть сопел забита.
        let holes = '', lime = '';
        const rnd = btRng(53);
        for (const [k, n] of [[0.3, 6], [0.58, 11], [0.82, 16]]) for (let i = 0; i < n; i++) {
            const a = 2 * Math.PI * (i + 0.5 * k) / n;
            const q = { x: headX + Math.cos(a) * faceR * k * 0.86, y: faceY + Math.sin(a) * faceRy * k * 0.86 };
            if (rnd() < 0.22) lime += `M${f(q.x - 2.3)} ${f(q.y)}a2.3 1.1 0 1 0 4.6 0a2.3 1.1 0 1 0 -4.6 0Z`;
            else holes += `M${f(q.x - 1.3)} ${f(q.y)}a1.3 0.6 0 1 0 2.6 0a1.3 0.6 0 1 0 -2.6 0Z`;
        }
        const dx = headX + 9, dy = faceY + faceRy - 1;
        const drip = `M${f(dx - 2.2)} ${f(dy + 1.5)}Q${f(dx)} ${f(dy - 1)} ${f(dx + 2.2)} ${f(dy + 1.5)}`
                   + `Q${f(dx + 3.2)} ${f(dy + 6.5)} ${f(dx)} ${f(dy + 7.5)}`
                   + `Q${f(dx - 3.2)} ${f(dy + 6.5)} ${f(dx - 2.2)} ${f(dy + 1.5)}Z`;

        // Порядок сзади вперёд. Внешний контур — ОДИН проход толстой линией
        // по всем силуэтам ПОД заливками: заливки съедают внутреннюю
        // половину, и снаружи остаётся общий контур всей стойки, без
        // швов между частями. Стыки частей внутри силуэта — тонкой
        // линией тоном тени, как требует иерархия линий.
        const order = [cl[0].ros, cl[1].ros, pipe, nutLow, mixer, cl[0].ring, cl[1].ring, nut, bell, joint];
        const halo = order.map(p => p.edge).join('');
        const ell = (cx, cy, rx, ry) => `M${f(cx - rx)} ${f(cy)}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
        const faceD = ell(headX, faceY, faceR, faceRy);
        const faceIn = ell(headX, faceY + 0.6, faceR - 5, faceRy - 3);
        let parts = '';
        for (const p of order) {
            parts += this.paint(p);
            if (p === mixer) parts += `${band(-1, V.hot)}${band(1, V.cold)}
                <path d="${grip}" fill="none" stroke="${inner}" stroke-width="${STROKE.hairline}" stroke-opacity="0.6"/>`;
            if (p !== pipe) parts += `<path d="${p.edge}" fill="none" stroke="${inner}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>`;
        }
        return `
        <g class="bt-shower-art">
            <path d="${halo}${faceD}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            ${parts}
            <path d="${faceD}" fill="${C[700]}" stroke="${inner}" stroke-width="${STROKE.structure}"/>
            <path d="${faceIn}" fill="${C[900]}"/>
            <path d="${holes}" fill="${C[500]}"/>
            <path d="${lime}" fill="${T.scale}"/>
            <path d="${drip}" fill="${Wt.surfHi}" stroke="${Wt.edge}" stroke-width="0.8"/>
        </g>`;
    }
};
