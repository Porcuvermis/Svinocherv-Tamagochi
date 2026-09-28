// ================= МОЧАЛКА: ЛЕСТНИЦА ВИДА =================
// Мочалка прокачивает время трения и таймер награды, и с каждой покупкой
// меняется сам ПРЕДМЕТ (docs/plan/21-lust-bath.md, разд. 5д): застиранная
// тряпка-ветошь → кухонная губка → банная губка → пуф → морская губка → люфа →
// рукавица → губка конняку → волшебное облачко. Все вещи — в одном формате
// (овал или прямоугольник одного габарита): узкое и длинное выбивалось бы
// на полке и в руке.
//
// Одна вещь в трёх местах: на полке, в руке и на иконке магазина. Поэтому
// предмет рисуется в координатах СЦЕНЫ вокруг гнезда мочалки, как рисовалась
// запечённая губка: рука (BATH_ART.held) и иконка сдвигают его на гнездо
// сами и ничего не знают о ступенях. Гнездо и зона захвата не двигаются от
// ступени — меняется только картинка. Так же устроено мыло (bath-soap.js).
const BATH_CLOTH = {
    // Вид на каждой ступени. Ещё не нарисованные ступени берут запечённую
    // губку — пока лестница не закончена.
    TIERS: ['rag', 'kitchen', 'brick', 'puff', 'sea', 'luffa', 'mitt', 'konjac', 'cloud'],
    uid: 0,

    level() {
        if (typeof GameState === 'undefined' || !GameState.upgradeLevel || typeof Backend === 'undefined') return 0;
        return GameState.upgradeLevel(Backend.upgradeKey('lust', 'cloth')) || 0;
    },
    tier(level) {
        const L = level == null ? this.level() : level;
        return Math.max(0, Math.min(this.TIERS.length - 1, L | 0));
    },

    // where === 'shelf' — предмет на полке: ступень может показать там то,
    // чего нет в руке и на иконке (как мыльная сопля у обмылка).
    draw(level, where) {
        const kind = this.TIERS[this.tier(level)];
        if (kind === 'rag') return this.rag(where);
        return BATH_BAKED.draw('cloth');
    },

    // Габарит на сцене — по нему захват, упор в край экрана и иконка.
    box(level) {
        const kind = this.TIERS[this.tier(level)];
        if (kind === 'rag') return { x: 528, y: 470, w: 93, h: 63 };
        return BATH_BAKED.box('cloth');
    },

    // Полка перерисовывается после покупки и после debug-панели.
    refresh() {
        const el = typeof document !== 'undefined' && document.getElementById('bt-cloth-art');
        if (el) el.innerHTML = this.draw(null, 'shelf');
    },

    // ---------- 0. ВЕТОШЬ ----------
    // Застиранная серо-голубая клетчатая тряпка, скомканная в мягкий холмик.
    // Первой попыткой была старая жёлто-зелёная губка — та же вещь, что
    // ступень 1, только грязнее; её не отличали от следующей ступени.
    // У тряпки есть то, чего нет ни у одной губки: острый угол полотна,
    // торчащий из мягкого комка, клетка и махры — и живёт это в СИЛУЭТЕ.
    //
    // Держится на трёх крупных фигурах, больше не заводить (docs/bench/art.md,
    // разд. 3.1): комок с двумя неравными буграми, обвисший угол справа с
    // бахромой, тёмная рваная дыра. Клетка — фактура поверх, не фигура.
    //
    // Устроена двумя слоями, иначе мягкость не читается в объёме: снизу
    // осевший тёмный ком, сверху накинутое полотно — его нижняя кромка
    // пересекает перед волной, а правый конец и есть обвисший угол. Всё
    // внутри делится на пять участков (два бугра, угол, две половины кома),
    // у каждого свой градиент и своя рамка клетки: на складке клетка
    // обрывается и продолжается под другим углом.
    //
    // Геометрия считается ОДИН раз и кешируется шаблоном: в руке предмет
    // перерисовывается на каждом движении пальца, а на вызов меняется только
    // префикс id. Шум — btRng с постоянными сидами, поэтому кеш честный.
    rag(where) {
        const A = BATH_ART.slots().cloth;
        if (!this._rag) this._rag = this.ragArt();
        const id = 'bcl' + (this.uid++);
        return `<g class="bt-cloth bt-cloth-rag" transform="translate(${A.x} ${A.y})">`
            + this._rag.split('§').join(id) + `</g>`;
    },

    // Шаблон ветоши в координатах гнезда; «§» — место префикса id.
    ragArt() {
        const P = btPal(), R = P.rag, ink = PALETTE.ink;
        // Мягкий чернильный — для линий ВНУТРИ силуэта: чернила контура,
        // разбавленные тенью ткани. Контур остаётся единственной линией ink.
        const inkSoft = mixColor(ink, R[0], 0.35);

        // ----- векторная мелочь -----
        const f = (n) => String(Math.round(n * 10) / 10);
        // Честный габарит: getBBox не знает о клипах, а по габариту захват
        // пальцем и иконка магазина. Поэтому всё, что режется силуэтом
        // (полосы клетки, тени с запасом), прижимается к его рамке ещё при
        // построении: снаружи рамки клип и так всё срезал бы. CL — рамка
        // силуэта; raw() строит без прижима (клипы, махры за силуэтом).
        let CL = null;
        const pt = (p) => {
            let x = p[0], y = p[1];
            if (CL) { x = Math.min(CL[2], Math.max(CL[0], x)); y = Math.min(CL[3], Math.max(CL[1], y)); }
            return f(x) + ' ' + f(y);
        };
        const raw = (fn) => { const c = CL; CL = null; try { return fn(); } finally { CL = c; } };
        const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
        const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
        const mul = (a, k) => [a[0] * k, a[1] * k];
        const len = (a) => Math.hypot(a[0], a[1]);
        const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
        const dirOf = (deg) => [Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180)];
        const poly = (pts) => 'M' + pts.map(pt).join('L') + 'Z';
        // Катмулл-Ром по опорным точкам: плотная ломаная, по которой потом
        // строятся ленты, клипы и выборки высоты.
        const crPt = (p0, p1, p2, p3, t) => [0, 1].map(j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t
            + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t * t * t));
        const spline = (pts, step = 1.2) => {
            const out = [pts[0]];
            for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
                const n = Math.max(2, Math.ceil(len(sub(p2, p1)) / step));
                for (let k = 1; k <= n; k++) out.push(crPt(p0, p1, p2, p3, k / n));
            }
            return out;
        };
        const splineClosed = (pts, step = 1) => {
            const out = [], N = pts.length;
            for (let i = 0; i < N; i++) {
                const p0 = pts[(i + N - 1) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
                const n = Math.max(2, Math.ceil(len(sub(p2, p1)) / step));
                for (let k = 0; k < n; k++) out.push(crPt(p0, p1, p2, p3, k / n));
            }
            return out;
        };
        // Нормаль ломаной — ВПРАВО по ходу (в svg ось Y вниз: у пути слева
        // направо это «вниз», у пути сверху вниз — «влево»).
        const normals = (pts) => pts.map((p, i) => {
            const t = sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]);
            return unit([-t[1], t[0]]);
        });
        // Лента вдоль ломаной между смещениями a(t) и b(t) по нормали — так
        // рисуются ВСЕ линии и серпы внутри: залитая форма сужается к
        // концам, у обводки постоянной ширины этого нет (art-direction §4.5).
        const band = (pts, a, b) => {
            const N = normals(pts), L = [], Rr = [];
            pts.forEach((p, i) => {
                const t = i / (pts.length - 1);
                L.push(add(p, mul(N[i], a(t)))); Rr.push(add(p, mul(N[i], b(t))));
            });
            return 'M' + L.map(pt).join('L') + 'L' + Rr.reverse().map(pt).join('L') + 'Z';
        };
        const taper = (pts, w) => band(pts, (t) => -w(t) / 2, (t) => w(t) / 2);
        const arch = (t, k = 1) => Math.pow(Math.max(0, Math.sin(Math.PI * t)), k);
        // Нить: сужающаяся залитая фигура по ломаной, конец скруглён.
        const strand = (pts, w0, w1 = 0.3) => {
            const N = normals(pts), L = [], Rr = [], n = pts.length - 1;
            pts.forEach((p, i) => {
                const w = (w0 + (w1 - w0) * i / n) / 2;
                L.push(add(p, mul(N[i], w))); Rr.push(add(p, mul(N[i], -w)));
            });
            const tip = add(pts[n], mul(unit(sub(pts[n], pts[n - 1])), w1 * 0.7));
            return 'M' + L.map(pt).join('L') + 'Q' + pt(tip) + ' ' + Rr.reverse().map(pt).join('L') + 'Z';
        };
        const quad = (p0, p1, p2, n = 5) => {
            const out = [];
            for (let i = 0; i <= n; i++) {
                const t = i / n, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
                out.push([a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]]);
            }
            return out;
        };
        const cubic = (p0, p1, p2, p3, n = 8) => {
            const out = [];
            for (let i = 0; i <= n; i++) {
                const t = i / n, s = 1 - t;
                out.push([0, 1].map(j => s * s * s * p0[j] + 3 * s * s * t * p1[j] + 3 * s * t * t * p2[j] + t * t * t * p3[j]));
            }
            return out;
        };

        // ================= СИЛУЭТ =================
        // ОДИН замкнутый путь, угол полотна включён в него, а не приклеен
        // отдельной фигурой — иначе на стыке излом. Обход по часовой от
        // нижнего левого. Третий элемент: число — угол со скруглением этого
        // радиуса (кончик угла, выемки складок), 'j' — гладкий вход в прямую
        // кромку угла (край тканый и потому почти прямой — единственная
        // жёсткость в силуэте, и она намеренная).
        const V = [
            [-41, 38], [-44.5, 24],
            [-43, 11.5],                 // ступенька: верхнее полотно нависает над комом
            [-38, 2], [-36.5, -1, 1.4],  // выемка — сюда выходит вторичная складка
            [-27, -16], [-12, -22],      // плечо и макушка левого бугра
            [1, -17, 2.4],               // выемка на макушке — сюда выходит главная долина
            [13, -20], [27, -12],        // правый бугор, на 2 ниже левого
            [30, -9, 'j'],               // корень угла
            [44, 5, 1.1], [42.5, 8.5, 1.2],   // кончик угла
            [34, 9, 1.0],                // угол прилегает к телу
            [35.5, 13], [37.5, 22],      // просвет кафеля под углом и бок кома
            [33, 38], [0, 39.5]          // дно с лёгким провисанием
        ];
        const K = [];
        V.forEach((v, i) => {
            const pv = V[(i + V.length - 1) % V.length], nv = V[(i + 1) % V.length], p = [v[0], v[1]];
            if (typeof v[2] === 'number') {
                const a = unit(sub(pv, p)), c = unit(sub(nv, p));
                K.push({ p: add(p, mul(a, v[2])), t: mul(a, -1), q: p });
                K.push({ p: add(p, mul(c, v[2])), t: c });
            } else if (v[2] === 'j') K.push({ p, t: unit(sub(nv, p)) });
            else K.push({ p, t: unit(sub(nv, pv)) });
        });
        let sil = 'M' + pt(K[0].p);
        K.forEach((k, i) => {
            const n = K[(i + 1) % K.length], L = len(sub(n.p, k.p)) / 3;
            sil += k.q ? 'Q' + pt(k.q) + ' ' + pt(n.p)
                : 'C' + pt(add(k.p, mul(k.t, L))) + ' ' + pt(sub(n.p, mul(n.t, L))) + ' ' + pt(n.p);
        });
        sil += 'Z';
        // Рамка силуэта — по самим кривым, выборкой.
        CL = [1e9, 1e9, -1e9, -1e9];
        K.forEach((k, i) => {
            const n = K[(i + 1) % K.length], L = len(sub(n.p, k.p)) / 3;
            const seg = k.q ? quad(k.p, k.q, n.p, 16) : cubic(k.p, add(k.p, mul(k.t, L)), sub(n.p, mul(n.t, L)), n.p, 16);
            seg.forEach(q => { CL[0] = Math.min(CL[0], q[0]); CL[1] = Math.min(CL[1], q[1]); CL[2] = Math.max(CL[2], q[0]); CL[3] = Math.max(CL[3], q[1]); });
        });

        // ================= ВНУТРЕННИЕ ЛИНИИ =================
        // Кромка верхнего полотна (hem) — граница двух слоёв. Высоко над
        // сеткой корзины: на полке и она, и тень под ней видны.
        const hemBase = spline([[-47, 12.5], [-43, 11.5], [-28, 9], [-10, 7], [4, 9.5], [20, 8], [33, 8.5], [34, 9]]);
        const hemAt = (x) => {
            for (let i = 1; i < hemBase.length; i++) {
                const a = hemBase[i - 1], b = hemBase[i];
                if (x <= b[0]) return a[1] + (b[1] - a[1]) * (x - a[0]) / ((b[0] - a[0]) || 1);
            }
            return hemBase[hemBase.length - 1][1];
        };
        // Надрыв на кромке: неровная выемка вверх, зубцы разного размера.
        const TEAR = [[-31.5, 0], [-30.6, -1.4], [-29.9, -1.1], [-29.2, -3.0], [-28.4, -3.8], [-27.5, -3.2],
                      [-26.9, -3.6], [-26.1, -1.6], [-25.4, -0.8], [-24.5, 0]].map(([x, dy]) => [x, hemAt(x) + dy]);
        const hem = hemBase.filter(p => p[0] < -31.5 || p[0] > -24.5);
        hem.splice(hem.findIndex(p => p[0] > -24.5), 0, ...TEAR);
        const hemVis = hem.filter(p => p[0] >= -43);             // видимая часть: от силуэта до угла
        const hemRange = (x0, x1) => hem.filter(p => p[0] > x0 && p[0] < x1);
        // За пределами силуэта кромка продолжается по нижнему краю угла — так
        // клипы участков делят и угол.
        const HX = [[42.5, 8.5], [60, 8]], HL = [-60, 12.5];

        // Главная долина между буграми: от выемки на макушке вниз с изгибом
        // вправо, гаснет, не доходя до кромки.
        const valley = spline([[1, -17], [0, -9], [4, -2], [7, 4]], 1);
        const vDiv = [[1, -40], ...valley, [8, hemAt(8)]];
        // Корень угла: отделяет угол от правого бугра, выгнут влево.
        const root = spline([[30, -9], [31, 0], [34, 9]], 1);
        const rDiv = [[27.5, -40], [28.8, -20], ...root];
        // Вторичная складка на левом бугре — отзвук, а не вторая главная.
        const fold2 = spline([[-36.5, -1], [-31, -2.6], [-26, -5]], 1);
        // Долина нижнего кома: на полке почти вся под сеткой — работает в руке.
        const lowV = spline([[-8, 38], [-6.2, 30], [-5, 24], [-4, 15.5]], 1);
        const lDiv = [[-3.5, hemAt(-3.5)], ...lowV.slice().reverse(), [-9, 60]];

        // Клипы участков — многоугольники с запасом ЗА силуэт: всё равно
        // режутся силуэтом снаружи.
        const clL1 = raw(() => poly([[-60, -40], HL, ...hemRange(-60, 8), ...vDiv.slice().reverse()]));
        const clL2 = raw(() => poly([...vDiv, ...hemRange(8, 34), ...rDiv.slice().reverse()]));
        const clFL = raw(() => poly([...rDiv, ...HX, [60, -40]]));
        const clLA = raw(() => poly([HL, ...hemRange(-60, -3.5), ...lDiv, [-60, 60]]));
        const clLB = raw(() => poly([...lDiv, [60, 60], ...HX.slice().reverse(), ...hemRange(-3.5, 60).reverse()]));

        // ================= КЛЕТКА =================
        // Ровный <pattern> клал бы клетку плоским трафаретом поперёк складок —
        // скатерть, наклеенная на камень. Здесь полосы — залитые пути через
        // отображение участка (u, v) → сцена: рамка повёрнута по драпировке,
        // выгнута вектором b, а к краям бугра полосы сходятся (ракурс),
        // поэтому бугор читается круглым и без светотени. Сжатие к краям
        // смягчено (m < 1): при полном косинусе полосы у края сливались.
        const frame = (c, hx, hy, deg, b) => {
            const a = deg * Math.PI / 180, co = Math.cos(a), si = Math.sin(a), m = 0.55;
            const s = (u) => (1 - m) * u + m * (0.5 - 0.5 * Math.cos(Math.PI * u));
            return (u, v) => {
                const x = (2 * s(u) - 1) * hx, y = (2 * s(v) - 1) * hy, g = 16 * u * (1 - u) * v * (1 - v);
                return [c[0] + x * co - y * si + b[0] * g, c[1] + x * si + y * co + b[1] * g];
            };
        };
        // Период клетки ~8.5 в середине бугра (на иконке 56×56 это ~5 px:
        // видно и не рябит; мельче нельзя), полоса — ~0.36 периода.
        // 1.314 — растяжение рамки в середине при m = 0.55.
        const count = (h, per) => Math.max(2, Math.round(2 * h * 1.314 / per));
        const stripes = (F, n, warp) => {
            const w = 0.36 / n;
            let d = '';
            for (let i = 0; i < n; i++) {
                const a = (i + 0.5) / n - w / 2, c = a + w, S = [], T = [];
                for (let k = 0; k <= 8; k++) {
                    const t = -0.03 + 1.06 * k / 8;
                    S.push(warp ? F(a, t) : F(t, a)); T.push(warp ? F(c, t) : F(t, c));
                }
                d += 'M' + S.map(pt).join('L') + 'L' + T.reverse().map(pt).join('L') + 'Z';
            }
            return d;
        };
        const PATCH = {
            L1: { F: frame([-18, -5], 30, 20, -15, [-1.5, -2.5]), hx: 30, hy: 20, per: 8.5,
                  g: [-20, -13, 26, R[3], R[2], R[1]], clip: clL1 },
            L2: { F: frame([15, -6], 19, 17, 10, [-1, -2]), hx: 19, hy: 17, per: 8.5,
                  g: [10, -13, 20, R[3], R[2], R[1]], clip: clL2 },
            // Угол завернулся вниз: клетка на нём идёт наискосок, а сам он
            // обращён вниз-вправо — темнее тела.
            FL: { F: frame([37.5, -0.5], 14, 14, 40, [0.5, 1]), hx: 14, hy: 14, per: 8.5,
                  g: [33, -4, 14, R[2], R[1], R[1]], clip: clFL },
            // Нижний ком — на ступень темнее (что ниже, то темнее) и в
            // ракурсе: уток сжат по вертикали.
            LA: { F: frame([-24, 24], 24, 20, -5, [-1, -1]), hx: 24, hy: 20, per: 8.5, perV: 6,
                  g: [-30, 16, 22, R[2], R[1], R[0]], clip: clLA },
            LB: { F: frame([17, 24], 25, 20, 8, [-1, -1]), hx: 25, hy: 20, per: 8.5, perV: 6,
                  g: [12, 16, 22, R[2], R[1], R[0]], clip: clLB }
        };
        // Кирпичная нить по середине одной полосы утка на каждом бугре.
        const threadLine = (Pt, j) => {
            const n = count(Pt.hy, Pt.perV || Pt.per), v = (j + 0.5) / n, S = [];
            for (let k = 0; k <= 10; k++) S.push(Pt.F(-0.03 + 1.06 * k / 10, v));
            return 'M' + S.map(pt).join('L');
        };
        const patch = (key, extra = '') => {
            const Pt = PATCH[key];
            return `<g clip-path="url(#§-${key})">
                <path d="${sil}" fill="url(#§-g${key})"/>
                <path d="${stripes(Pt.F, count(Pt.hx, Pt.per), true)}" fill="${P.ragCheck}" fill-opacity="0.38"/>
                <path d="${stripes(Pt.F, count(Pt.hy, Pt.perV || Pt.per), false)}" fill="${P.ragCheck}" fill-opacity="0.38"/>${extra}
            </g>`;
        };
        const thread = (key, j) => `
                <path d="${threadLine(PATCH[key], j)}" fill="none" stroke="${P.ragThread}" stroke-width="${STROKE.hairline}" stroke-opacity="0.6"/>`;

        // ================= ДЫРА =================
        // Ткань рвётся по нитям: дыра — рваный четырёхугольник, стороны идут
        // вдоль основы и утка ЛЕВОГО бугра. Строится в своих координатах
        // (x — по основе, y — по утку, единицы сцены) и переносится на
        // рамку бугра, поэтому края дыры идут вдоль полос клетки.
        const F1 = PATCH.L1.F;
        let hu = 0.5, hv = 0.5, best = 1e9;
        for (let u = 0; u <= 1; u += 0.01) for (let v = 0; v <= 1; v += 0.01) {
            const q = F1(u, v), d = Math.hypot(q[0] + 16, q[1] + 6);
            if (d < best) { best = d; hu = u; hv = v; }
        }
        const Su = len(sub(F1(hu + 0.01, hv), F1(hu - 0.01, hv))) / 0.02;
        const Sv = len(sub(F1(hu, hv + 0.01), F1(hu, hv - 0.01))) / 0.02;
        const H = (p) => F1(hu + p[0] / Su, hv + p[1] / Sv);
        // Край — зубцы неравного размера, крупный рядом с мелким; нижний
        // правый край вырван глубже, с зубцом в 2 единицы.
        const HOLE_TOP = [[-5.6, -3.0], [-4.2, -3.7], [-2.6, -3.3], [-1.2, -4.0], [0.9, -3.6], [2.3, -3.9], [4.1, -3.3]];
        const HOLE_RIGHT = [[5.4, -2.6], [5.9, -1.0], [5.2, 0.4], [5.8, 1.6]];
        const HOLE_BOT = [[4.6, 3.2], [3.4, 4.6], [2.6, 3.6], [1.5, 5.4], [0.2, 4.1], [-1.6, 3.9], [-3.0, 3.2], [-4.4, 3.6]];
        const HOLE_LEFT = [[-5.7, 2.4], [-5.2, 0.8], [-6.0, -0.6], [-5.3, -1.8]];
        const holeLoc = [...HOLE_TOP, ...HOLE_RIGHT, ...HOLE_BOT, ...HOLE_LEFT];
        const holePts = holeLoc.map(H);
        const hole = poly(holePts);
        const holeShift = poly(holePts.map(p => add(p, [1.8, 1.6])));
        // На дне дыры — нижний слой той же ткани: клетка ДРУГОГО наклона
        // говорит «под дырой ткань», а не «пятно».
        const hc = H([0, 0]);
        const bandAt = (deg, off, w) => {
            const d = dirOf(deg), n = [-d[1], d[0]], o = add(hc, mul(n, off));
            return poly([add(o, mul(d, -12)), add(o, mul(d, 12)), add(add(o, mul(d, 12)), mul(n, w)), add(add(o, mul(d, -12)), mul(n, w))]);
        };
        const holeCheck = bandAt(30, -3, 2.8) + bandAt(120, -0.5, 2.8);
        // Уцелевшие нити поперёк проёма, с провисом вниз.
        const tw1 = [[1.2, -3.8], [1.9, -1.2], [2.4, 1.6], [2.2, 4.4]].map(H);
        const tw2 = quad([-5.4, -1.2], [0, 1.2], [5.4, -1.8], 6).map(H);
        const threadsX = strand(tw1, 0.9, 0.5) + strand(tw2, 0.9, 0.5);
        const threadsXSh = strand(tw1.map(p => add(p, [0.6, 0.9])), 0.6, 0.4) + strand(tw2.map(p => add(p, [0.6, 0.9])), 0.6, 0.4);
        // Концы оборванных нитей растут из краёв строго по основе или утку:
        // три сверху, два справа, два снизу, слева — ни одного.
        const TAILS = [[-3.4, -3.5, 0, 1, 2.2], [-2.8, -3.4, 0.15, 1, 1.3], [1.6, -3.7, 0, 1, 1.8],
                       [5.6, -1.6, -1, 0, 1.6], [5.5, 1.0, -1, 0.1, 2.4], [-0.6, 4.0, 0, -1, 1.2], [3.0, 4.1, 0.1, -1, 2.0]];
        const tails = TAILS.map(([x, y, dx, dy, l]) => strand([[x, y], [x + dx * l * 0.5, y + dy * l * 0.5 + 0.2], [x + dx * l, y + dy * l + 0.5]].map(H), 0.8, 0.3)).join('');
        // Край очерчен тоном, а не рамкой: верх-лево — тёмная линия
        // (отбрасывает тень), низ-право — светлый срез ткани к свету.
        const holeDark = taper([...HOLE_LEFT.slice().reverse(), ...HOLE_TOP].map(H), (t) => 0.35 + 0.65 * arch(t, 0.5));
        const holeLit = 'M' + [...HOLE_RIGHT.slice(1), ...HOLE_BOT].map(H).map(pt).join('L');

        // ================= ПЯТНО =================
        // Застиранное пятно — ореол: середина почти как ткань, а по краю
        // тёмная неровная кромка, куда при высыхании собралась грязь. Одно,
        // на правом бугре, заходит в долину и ломается в ней вместе с
        // клеткой. Язык вниз-вправо — стекало.
        const sr = btRng(73), SC = [11.5, -4];
        const blobPts = [];
        for (let i = 0; i < 9; i++) {
            const a = i / 9 * Math.PI * 2 - 0.3;
            let k = 0.78 + sr() * 0.44;
            if (i === 1) k *= 1.55;                          // язык: угол ~40° вниз-вправо
            blobPts.push([SC[0] + Math.cos(a) * 8.2 * k, SC[1] + Math.sin(a) * 5 * k]);
        }
        const blob = splineClosed(blobPts, 0.9);
        const stain = poly(blob);
        const stainRim = stain + poly(blob.map(p => add(SC, mul(sub(p, SC), 0.8))).reverse());

        // ================= МАХРЫ =================
        // Только на СВОБОДНЫХ краях ткани (кромки угла, два куска кромки
        // полотна); на скруглённых буграх края нет — и махров нет. Пучками,
        // длина со смещённым распределением, направление — нормаль кромки,
        // повёрнутая к гравитации: нити обвисают, а не торчат ежом.
        const fr = btRng(211);
        const tuft = (base, normalDeg, k, n, spread) => {
            const out = [], dirDeg = normalDeg + k * (90 - normalDeg);
            for (let i = 0; i < n; i++) {
                const sp = n > 1 ? (i / (n - 1) - 0.5) : 0;
                const deg = dirDeg + sp * spread + (fr() - 0.5) * 6;
                const L = fr() < 0.2 ? 5 + fr() * 2 : 2.6 + fr() * 1.8;
                const b = add(base, mul(dirOf(normalDeg + 90), sp * 1.4));
                // Нить провисает: вторая половина доворачивает к низу.
                const d1 = dirOf(deg), d2 = dirOf(deg + 0.35 * (90 - deg));
                out.push([quad(b, add(b, mul(d1, L * 0.55)), add(add(b, mul(d1, L * 0.5)), mul(d2, L * 0.55)), 5),
                    1.1 + fr() * 0.3]);
            }
            return out;
        };
        const draw = (list, sh = [0, 0]) => list.map(([pts, w]) => strand(pts.map(p => add(p, sh)), w)).join('');
        const onEdge = (a, b, t) => add(a, mul(sub(b, a), t));
        const E11 = [30, -9], E12 = [44, 5], E13 = [42.5, 8.5], E14 = [34, 9];
        // Верхняя (освещённая) кромка угла.
        const frTop = raw(() => draw([...tuft(onEdge(E11, E12, 0.5), -45, 0.55, 3, 20), ...tuft(onEdge(E11, E12, 0.8), -45, 0.6, 2, 14),
            // кончик
            ...tuft(onEdge(E12, E13, 0.55), 23, 0.6, 3, 22)]));
        // Беглая нить у кончика — длинная, с завитком.
        const runaway = raw(() => strand([...cubic([43.6, 6.6], [46.2, 9.8], [43.4, 12.8], [45, 15.8], 8),
                                ...cubic([45, 15.8], [45.8, 17.4], [47.7, 17.3], [47.1, 15.6], 4).slice(1)], 1.2, 0.35));
        // Нижняя (теневая) кромка угла — гуще.
        const frBot = raw(() => draw([...tuft(onEdge(E13, E14, 0.14), 90, 0.7, 3, 18), ...tuft(onEdge(E13, E14, 0.42), 90, 0.7, 2, 12),
            ...tuft(onEdge(E13, E14, 0.66), 95, 0.7, 4, 24)]));
        // Махры на кромке полотна свисают на нижний ком — внутри силуэта,
        // без обводки, с тенью-двойником.
        const inner = [...tuft([-29.2, TEAR[3][1]], 90, 0.8, 2, 16), ...tuft([-27.2, TEAR[5][1] - 0.2], 90, 0.8, 1, 0),
            ...tuft([23, hemAt(23)], 90, 0.7, 3, 20), ...tuft([29.5, hemAt(29.5) + 0.2], 90, 0.7, 2, 14)];
        const frIn = draw(inner), frInSh = draw(inner, [0.5, 0.7]);

        // ================= ТЕНИ И СВЕТ =================
        // Мягкая тень без размытия — двумя стопками: широкая бледная и
        // узкая погуще, прижатая к краю, который отбрасывает тень.
        const hemS = hemVis.map(p => add(p, [0.8, 1.5]));
        const hemShW = band(hemS, () => -2, (t) => 4 * arch(t, 0.25));
        const hemShN = band(hemS, () => -2, (t) => 1.5 * arch(t, 0.25));
        // Тень угла на правый бок кома.
        const flapShW = poly([[33, 8.6], [60, 8], [60, 15], [41, 18.5], [37.5, 25], [35, 19]]);
        const flapShN = poly([[33, 8.6], [60, 8], [60, 10.6], [39.5, 11.4], [35.5, 14]]);
        // Долина: по верхней-левой стороне ТЕНЬ (склон левого бугра отвёрнут
        // от света), по нижней-правой — светлая кромка следующего бугра, и
        // только в средней трети. Нормаль у пути сверху вниз смотрит влево.
        const valSh = band(valley, () => 0, (t) => 3.3 * arch(t, 0.8));
        const valLit = band(valley, () => -0.4, (t) => -0.4 - 1.1 * arch(Math.min(1, Math.max(0, (t - 1 / 3) * 3))));
        const lowSh = band(lowV, () => 0, (t) => 2.2 * arch(t));
        // Светлый гребень кромки полотна: край ткани к свету — видна толщина.
        const hemRise = hemVis.filter(p => p[0] > -25.8 && p[0] < 4);
        const hemLit = band(hemRise, () => -0.75, (t) => -0.75 - 0.95 * arch(t, 0.6));

        // Линии складок — ЗАЛИТЫЕ серпы: кромка — structure, долины и корень
        // — detail, отзвуки — тоньше и бледнее. Ничто не толще 1.7.
        const lines = taper(hemVis, (t) => STROKE.structure * arch(t, 0.35))
            + taper(valley, (t) => STROKE.detail * Math.pow(1 - t, 0.8))
            + taper(root, (t) => 0.25 + (STROKE.detail - 0.25) * Math.pow(1 - t, 0.7));
        const linesSoft = taper(fold2, (t) => 0.8 * Math.pow(1 - t, 0.9))
            + taper(lowV, (t) => 0.8 * Math.pow(1 - t, 0.7));

        // ================= ГРАДИЕНТЫ =================
        // У каждого участка свой радиальный градиент, центры смещены в ОДНУ
        // сторону (вверх-влево): блики выстраиваются в линию, и комок
        // читается одним объёмом.
        const radial = (key, [cx, cy, r, c0, c1, c2]) => `
                <radialGradient id="§-g${key}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}">
                    <stop offset="0" stop-color="${c0}"/><stop offset="0.55" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
                </radialGradient>`;
        // Вуаль-выгорание: на гребнях клетка выцветает сильнее всего — один
        // приём даёт и объём, и застиранность. Матовая: ткань не блестит.
        const veil = (key, cx, cy, r, sy, a) => `
                <radialGradient id="§-${key}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}"
                                gradientTransform="translate(${cx} ${cy}) scale(1 ${sy}) translate(${-cx} ${-cy})">
                    <stop offset="0" stop-color="${R[4]}" stop-opacity="${a}"/><stop offset="1" stop-color="${R[4]}" stop-opacity="0"/>
                </radialGradient>`;
        const W2 = 2 * STROKE.contour;

        return `
            <defs>
                <clipPath id="§-sil"><path d="${sil}"/></clipPath>
                <clipPath id="§-L1"><path d="${clL1}"/></clipPath>
                <clipPath id="§-L2"><path d="${clL2}"/></clipPath>
                <clipPath id="§-FL"><path d="${clFL}"/></clipPath>
                <clipPath id="§-LA"><path d="${clLA}"/></clipPath>
                <clipPath id="§-LB"><path d="${clLB}"/></clipPath>
                <clipPath id="§-hole"><path d="${hole}"/></clipPath>
                ${Object.keys(PATCH).map(k => radial(k, PATCH[k].g)).join('')}
                ${veil('v1', -18, -15, 12, 0.8, 0.5)}${veil('v2', 12, -15, 8, 0.8, 0.5)}${veil('vw', -13, -3, 9, 0.85, 0.35)}
                <radialGradient id="§-st" gradientUnits="userSpaceOnUse" cx="${SC[0]}" cy="${SC[1]}" r="9"
                                gradientTransform="translate(${SC[0]} ${SC[1]}) scale(1 0.62) translate(${-SC[0]} ${-SC[1]})">
                    <stop offset="0" stop-color="${P.ragStain}" stop-opacity="0"/>
                    <stop offset="0.6" stop-color="${P.ragStain}" stop-opacity="0.08"/>
                    <stop offset="0.88" stop-color="${P.ragStain}" stop-opacity="0.35"/>
                    <stop offset="1" stop-color="${P.ragStain}" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <!-- Контур и обводка махров ПОД заливкой: видна наружная половина. -->
            <path d="${sil}" fill="none" stroke="${ink}" stroke-width="${W2}" stroke-linejoin="round"/>
            <path d="${frTop}${frBot}${runaway}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.hairline}" stroke-linejoin="round"/>
            <path d="${sil}" fill="${R[1]}"/>
            <g clip-path="url(#§-sil)">
                ${patch('LA')}
                ${patch('LB')}
                <path d="${hemShW}" fill="${R[0]}" fill-opacity="0.25"/>
                <path d="${hemShN}" fill="${R[0]}" fill-opacity="0.45"/>
                <path d="${lowSh}" fill="${R[0]}" fill-opacity="0.3"/>
                <path d="${frInSh}" fill="${R[0]}" fill-opacity="0.5"/>
                <path d="${frIn}" fill="${R[2]}"/>
                ${patch('L1', thread('L1', 2))}
                ${patch('L2', thread('L2', 2))}
                <path d="${stain}" fill="url(#§-st)"/>
                <path d="${stainRim}" fill="${P.ragStain}" fill-opacity="0.14" fill-rule="evenodd"/>
                <!-- Вуаль — силуэтом, а не эллипсом: эллипс вылезал бы за рамку. -->
                <path d="${sil}" fill="url(#§-v1)"/>
                <path d="${sil}" fill="url(#§-v2)"/>
                <path d="${sil}" fill="url(#§-vw)"/>
                <path d="${valSh}" fill="${R[0]}" fill-opacity="0.5"/>
                <path d="${valLit}" fill="${R[4]}" fill-opacity="0.5"/>
                <!-- Дыра: дно — нижний слой ткани, тень верхнего слоя на
                     него, уцелевшие нити, хвостики, край тоном. -->
                <path d="${hole}" fill="${R[0]}"/>
                <g clip-path="url(#§-hole)">
                    <path d="${holeCheck}" fill="${P.ragCheck}" fill-opacity="0.5"/>
                    <path d="${hole}${holeShift}" fill="${mixColor(R[0], ink, 0.3)}" fill-opacity="0.7" fill-rule="evenodd"/>
                    <path d="${threadsXSh}" fill="${R[0]}" fill-opacity="0.6"/>
                </g>
                <path d="${threadsX}${tails}" fill="${R[3]}"/>
                <path d="${holeDark}" fill="${inkSoft}"/>
                <path d="${holeLit}" fill="none" stroke="${R[4]}" stroke-width="${STROKE.hairline}" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="${flapShW}" fill="${R[0]}" fill-opacity="0.25"/>
                <path d="${flapShN}" fill="${R[0]}" fill-opacity="0.45"/>
                ${patch('FL')}
                <path d="${lines}" fill="${inkSoft}"/>
                <path d="${linesSoft}" fill="${inkSoft}" fill-opacity="0.8"/>
                <path d="${hemLit}" fill="${R[4]}" fill-opacity="0.6"/>
            </g>
            <!-- Тонкий кант собирает край после клипа. -->
            <path d="${sil}" fill="none" stroke="${mixColor(ink, R[1], 0.4)}" stroke-width="${STROKE.hairline}" stroke-linejoin="round"/>
            <!-- Махры поверх контура — иначе чернила съедают их основания. -->
            <path d="${frTop}${runaway}" fill="${R[3]}"/>
            <path d="${frBot}" fill="${R[2]}"/>`;
    }
};

if (typeof window !== 'undefined') window.BATH_CLOTH = BATH_CLOTH;
