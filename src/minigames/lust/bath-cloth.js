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
        if (kind === 'rag') return { x: 526, y: 472, w: 95, h: 61 };
        return BATH_BAKED.box('cloth');
    },

    // Полка перерисовывается после покупки и после debug-панели.
    refresh() {
        const el = typeof document !== 'undefined' && document.getElementById('bt-cloth-art');
        if (el) el.innerHTML = this.draw(null, 'shelf');
    },

    // ---------- 0. ВЕТОШЬ ----------
    // Застиранная серо-голубая клетчатая тряпка, скомканная и брошенная в
    // корзину. Первой попыткой была старая жёлто-зелёная губка — та же вещь,
    // что ступень 1, только грязнее; её не отличали от следующей ступени.
    //
    // Тряпку опознают не по фактуре, а по трём признакам ПОЛОТНА:
    // 1. Углы полотна ПРЯМЫЕ (≈80–100°) с почти прямыми краями. Острый клин
    //    читался языком или лентой, а не углом ткани.
    // 2. Край полотна виден КУСКАМИ в разных местах и под разными углами:
    //    вышел, нырнул под складку, вышел снова. Одна кромка через всю
    //    ширину читалась полями шапки или поясом мешка.
    // 3. Складки СЖАТИЯ: лучами от места зажима, внизу — короткой
    //    поперечной гармошкой. Параллельные вертикальные складки из-под
    //    кромки — знак висящей ткани (юбка, занавеска), так и читалось.
    // Силуэт — неровный ком, а не купол (купол — твёрдое тело: шапка, булка):
    // крупная левая масса, глубокая выемка, правая масса ниже, из-под неё
    // торчит угол изнанкой. Второй угол лежит на дне лицом вверх.
    //
    // Участков семь, у каждого своя рамка клетки: на складке клетка
    // обрывается и идёт дальше под другим углом.
    //
    // Геометрия считается ОДИН раз и кешируется шаблоном; на вызов меняется
    // только префикс id. Шум — btRng с постоянными сидами, кеш честный.
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
        // Изнанка: бледнее лица, к кончику темнеет — он отвёрнут от света.
        // Кончик не уходит в rag[2]: на нём язык сливался с телом по тону.
        const back0 = mixColor(R[3], R[4], 0.35), back1 = mixColor(R[3], R[4], 0.1), back2 = mixColor(R[2], R[3], 0.5);
        // Низ нижних участков: темнее середины, но НЕ чистая тень — чистый
        // rag[0] только в долинах и под кромкой, иначе низ тёмно-синий.
        const lowDark = mixColor(R[1], R[0], 0.4);

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
        // Замкнутая фигура всегда ОДНОГО направления обхода. Серпы и нити
        // склеены по цвету в общие пути, и там, где две фигуры встречного
        // обхода перекрываются, nonzero вырезал бы дырку.
        const ring = (pts) => {
            let s = 0;
            for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; }
            return poly(s < 0 ? pts.slice().reverse() : pts);
        };
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
        // Лента вдоль ломаной между смещениями a(t, i) и b(t, i) по нормали —
        // так рисуются ВСЕ линии и серпы внутри: залитая форма сужается к
        // концам, у обводки постоянной ширины этого нет (art-direction §4.5).
        const bandPts = (pts, a, b) => {
            const N = normals(pts), L = [], Rr = [];
            pts.forEach((p, i) => {
                const t = i / (pts.length - 1);
                L.push(add(p, mul(N[i], a(t, i)))); Rr.push(add(p, mul(N[i], b(t, i))));
            });
            return [...L, ...Rr.reverse()];
        };
        const band = (pts, a, b) => ring(bandPts(pts, a, b));
        const taper = (pts, w) => band(pts, (t) => -w(t) / 2, (t) => w(t) / 2);
        const arch = (t, k = 1) => Math.pow(Math.max(0, Math.sin(Math.PI * t)), k);
        // Нить: сужающаяся залитая фигура по ломаной, конец скруглён.
        const strand = (pts, w0, w1 = 0.3) => {
            const N = normals(pts), L = [], Rr = [], n = pts.length - 1;
            pts.forEach((p, i) => {
                const w = (w0 + (w1 - w0) * i / n) / 2;
                L.push(add(p, mul(N[i], w))); Rr.push(add(p, mul(N[i], -w)));
            });
            // Скруглённый конец — полукруг из трёх точек.
            const d = unit(sub(pts[n], pts[n - 1])), r = w1 / 2, c = pts[n];
            const cap = [45, 90, 135].map(a => {
                const k = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180);
                return add(c, add(mul(N[n], r * k), mul(d, r * s)));
            });
            return ring([...L, ...cap, ...Rr.reverse()]);
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
        // ОДИН замкнутый путь, углы полотна включены в него, а не приклеены
        // отдельными фигурами — иначе на стыке излом. Обход по часовой от
        // дна. Третий элемент: число — вершина со скруглением этого радиуса
        // (кончики углов, выемки складок); 'j' — гладкий вход в прямой край
        // угла; 'l' — точка ломаной: сырой край ткани.
        const TIP = [43, 4], ROOT = [21.5, -8.5], FOOT = [31, 16];
        // Сырой край на последних ~6 единицах обоих краёв правого угла:
        // дрожь поперёк — кромка оборванной ткани, а не отдельная фигура.
        // Первая точка в 1.8 от кончика: ближе её съело бы скругление.
        const jr = btRng(97);
        const rawEdge = (to) => {
            const u = unit(sub(to, TIP)), n = [-u[1], u[0]];
            return [1.8, 3.0, 4.2, 5.4, 6.6].map(d => add(add(TIP, mul(u, d)), mul(n, (jr() - 0.5) * 1.0)));
        };
        const RAW_T = rawEdge(ROOT), RAW_B = rawEdge(FOOT);
        const V = [
            [-33, 38.5],                 // дно слева
            [-40, 34.5, 'j'],            // нижний край левого угла, почти прямой
            [-47, 29, 1.2],              // кончик левого угла C3: лежит на дне, торчит влево
            [-40.5, 21, 1.4],            // угол ныряет в ком — вогнутая вершина
            [-42.5, 12], [-39, 2],       // левый бок, мягкий
            [-36.5, -3, 1.5],            // выемка: выход складки F6 и края E2
            [-33, -12], [-24, -18],
            [-14, -19.5],                // макушка — единственная верхняя точка, слева
            [-6, -16.5],
            [-2, -10.5, 1.6],            // ГЛУБОКАЯ выемка: главная складка F1 рассекает ком
            [5, -14], [14, -13],         // правая масса ниже левой
            [20, -9, 1.2],               // излом у корня угла
            [ROOT[0], ROOT[1], 'j'],     // верхний край угла C2, почти прямой
            ...RAW_T.slice().reverse().map(p => [p[0], p[1], 'l']),
            [TIP[0], TIP[1], 1.3],       // кончик правого угла C2, прямой
            ...RAW_B.map(p => [p[0], p[1], 'l']),
            [FOOT[0], FOOT[1], 1.4],     // нижний край угла — вогнутая вершина у тела
            [30, 24], [29, 38],          // правый бок кома
            [0, 39, 1.0]                 // мелкая выемка на дне
        ];
        const K = [];
        V.forEach((v, i) => {
            const pv = V[(i + V.length - 1) % V.length], nv = V[(i + 1) % V.length], p = [v[0], v[1]];
            if (typeof v[2] === 'number') {
                const a = unit(sub(pv, p)), c = unit(sub(nv, p));
                K.push({ p: add(p, mul(a, v[2])), t: mul(a, -1), q: p });
                K.push({ p: add(p, mul(c, v[2])), t: c });
            } else if (v[2] === 'j') K.push({ p, t: unit(sub(nv, p)) });
            else if (v[2] === 'l') K.push({ p, ln: true });
            else K.push({ p, t: unit(sub(nv, pv)) });
        });
        const segs = K.map((k, i) => {
            const n = K[(i + 1) % K.length], L = len(sub(n.p, k.p)) / 3;
            if (k.q) return { d: 'Q' + pt(k.q) + ' ' + pt(n.p), s: quad(k.p, k.q, n.p, 16) };
            if (k.ln || n.ln) return { d: 'L' + pt(n.p), s: [k.p, n.p] };
            const c1 = add(k.p, mul(k.t, L)), c2 = sub(n.p, mul(n.t, L));
            return { d: 'C' + pt(c1) + ' ' + pt(c2) + ' ' + pt(n.p), s: cubic(k.p, c1, c2, n.p, 16) };
        });
        const sil = 'M' + pt(K[0].p) + segs.map(s => s.d).join('') + 'Z';
        // Рамка силуэта — по самим кривым, выборкой.
        CL = [1e9, 1e9, -1e9, -1e9];
        segs.forEach(s => s.s.forEach(q => {
            CL[0] = Math.min(CL[0], q[0]); CL[1] = Math.min(CL[1], q[1]); CL[2] = Math.max(CL[2], q[0]); CL[3] = Math.max(CL[3], q[1]);
        }));

        // ================= КРАЙ ПОЛОТНА — ТРЕМЯ КУСКАМИ =================
        // Каждый кусок выходит из-под одной складки (или из силуэта) и
        // ныряет под другую; концы гаснут в тени складки. Три наклона, три
        // высоты, ни один не идёт через середину. Все — слева направо.
        const EDGE = {
            // продолжает нижний край угла C2 влево по лицу кома, ныряет под F4
            E1: spline([[-3, 13], [3, 14.5], [12, 13], [22, 14], FOOT], 1.4),
            // край верхнего слоя на левой массе, из выемки силуэта под F3
            E2: spline([[-36.5, -3], [-28, -5], [-19, -3], [-12, -1]], 1.4),
            // продолжает верхний край угла C3 вправо, ныряет под F4
            E3: spline([[-40.5, 21], [-31, 18.5], [-21, 19.5], [-15, 18]], 1.4)
        };

        // ================= СКЛАДКИ =================
        // Сжатие: один узел KN, лучи от него к краям. valley — вмятина,
        // ridge — гребень; line — у глубоких есть тонкая линия, число —
        // какой конец толще (0 — начало, 1 — конец: там выемка силуэта или
        // узел). low — складка нижних участков: светлый серп тусклее.
        const KN = [-4, 4];
        const FOLD = {
            F1: { p: [[-2, -10.5], [-3, -4], KN], type: 'valley', w: 3.5, line: 0 },
            F2: { p: [KN, [8, -2], [15, -6], [20, -9]], type: 'valley', w: 3.0, line: 1 },
            F3: { p: [KN, [-12, 1], [-20, 1.5]], type: 'ridge', w: 2.5 },
            F4: { p: [KN, [-7, 11], [-13, 17]], type: 'valley', w: 3.0, line: 0 },
            F5: { p: [KN, [5, 8], [11, 10]], type: 'ridge', w: 2.0 },
            F6: { p: [[-36.5, -3], [-31, -1]], type: 'valley', w: 2.0 },
            // Гармошка внизу: ткань осела короткими поперечными волнами —
            // вразбежку, разной длины и наклона. Без линий.
            G1: { p: [[-24, 26], [-14, 24.5], [-5, 26]], type: 'ridge', w: 2.2, low: 1 },
            G2: { p: [[4, 27], [13, 25], [22, 27.5]], type: 'ridge', w: 2.2, low: 1 },
            G3: { p: [[-10, 32.5], [2, 31], [12, 33]], type: 'ridge', w: 1.8, low: 1 }
        };
        for (const k in FOLD) FOLD[k].s = spline(FOLD[k].p, 1.2);
        const rootL = spline([[20, -9], [26, 3], FOOT], 1.2);   // сгиб у корня правого угла

        // ================= УЧАСТКИ =================
        // Клипы — многоугольники с запасом ЗА силуэт: всё равно режутся им.
        const sE1 = EDGE.E1, sE2 = EDGE.E2, sE3 = EDGE.E3, sF1 = FOLD.F1.s, sF4 = FOLD.F4.s;
        const E2x = [[-60, -3.5], ...sE2, [-7, 1.5], KN];              // низ верхнего слоя слева
        const F4end = sF4[sF4.length - 1];
        const clips = raw(() => ({
            // Верхний слой слева: над E2, левее F1.
            R1: poly([[-60, -40], ...E2x, ...sF1.slice().reverse().slice(1), [-2, -40]]),
            // Под E2: до F4 и края E3.
            R2: poly([...E2x, ...sF4.slice(1), ...sE3.slice().reverse(), [-60, 21]]),
            // Правая масса: правее F1, над E1, левее корня угла.
            R3: poly([[-2, -40], ...sF1, ...sE1, ...rootL.slice().reverse().slice(1), [18, -40]]),
            // Низ слева: под E3 и концом F4, левее x = −5.
            R4: poly([[-60, 21], ...sE3, F4end, [-5, 20], [-5, 60], [-60, 60]]),
            // Низ справа: под E1, правее F4.
            R5: poly([KN, ...sE1, [60, 40], [60, 60], [-5, 60], [-5, 20], ...sF4.slice().reverse()]),
            // Правый угол изнанкой — правее корня.
            C2: poly([[18, -40], ...rootL, [60, 40], [60, -40]]),
            // Левый угол лежит на дне лицом вверх — левее линии, где он
            // уходит под ком.
            C3: poly([[-40.5, 21], [-40, 34.5], [-40, 60], [-60, 60], [-60, 21]])
        }));

        // ================= КЛЕТКА =================
        // Ровный <pattern> клал бы клетку плоским трафаретом поперёк складок —
        // скатерть, наклеенная на камень. Здесь полосы — залитые пути через
        // отображение участка (u, v) → сцена: рамка повёрнута по драпировке,
        // выгнута вектором b, а к краям полосы сходятся (ракурс). Сжатие
        // смягчено (mu < 1): при полном косинусе полосы у края сливались.
        // У нижних участков сжатие только поперёк.
        const frame = (c, hx, hy, deg, b, mu = 0.55, mv = 0.55) => {
            const a = deg * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
            const s = (u, m) => (1 - m) * u + m * (0.5 - 0.5 * Math.cos(Math.PI * u));
            return (u, v) => {
                const x = (2 * s(u, mu) - 1) * hx, y = (2 * s(v, mv) - 1) * hy, g = 16 * u * (1 - u) * v * (1 - v);
                return [c[0] + x * co - y * si + b[0] * g, c[1] + x * si + y * co + b[1] * g];
            };
        };
        // Период клетки ~8.5 в середине (на иконке 56×56 это ~5 px: видно и
        // не рябит; мельче нельзя), полоса — ~0.36 периода. Растяжение рамки
        // в середине: 1 + m·(π/2 − 1).
        const count = (h, per, m) => Math.max(2, Math.round(2 * h * (1 + m * 0.5708) / per));
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
        const radial = (cx, cy, r, c0, c1, c2) => ({ tag: 'radialGradient', a: `cx="${cx}" cy="${cy}" r="${r}"`, st: [c0, c1, c2] });
        const linear = (x1, y1, x2, y2, c0, c1, c2) => ({ tag: 'linearGradient', a: `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`, st: [c0, c1, c2] });
        // Свет сверху-слева: у всех участков центр блика смещён в ОДНУ
        // сторону, блики выстраиваются в линию — ком читается одним объёмом.
        // Под краем полотна — нижний слой, на ступень темнее.
        const PATCH = {
            R4: { m: [[-25, 29], 22, 13, 8, [-1, -1], 0.55, 0], perV: 6, a: 0.38, g: radial(-20, 24, 24, R[2], R[1], lowDark) },
            R5: { m: [[13, 27], 20, 15, -10, [-1, -1], 0.55, 0], perV: 6, a: 0.38, g: radial(8, 22, 24, R[2], R[1], lowDark) },
            R2: { m: [[-24, 8], 23, 15, -4, [-1, -1.5]], a: 0.38, g: radial(-28, 6, 22, R[2], mixColor(R[2], R[1], 0.5), R[1]) },
            R1: { m: [[-22, -10], 26, 14, -20, [-1.5, -2]], a: 0.42, g: radial(-22, -14, 24, R[3], R[2], R[1]) },
            R3: { m: [[12, -1], 20, 18, 18, [-1, -2]], a: 0.42, g: radial(4, -10, 24, R[3], R[2], R[1]) },
            // Изнанка: клетка едва проступает, без выпуклости — угол висит
            // плоским лоскутом; к кончику чуть темнее (отвёрнут от света).
            C2: { m: [[32, 3], 14, 14, 50, [0, 0]], a: 0.14, g: linear(23, -1, 42, 6, back0, back1, back2) },
            // Левый угол лежит лицом вверх — светлый.
            C3: { m: [[-43, 28], 8, 8, 30, [0, 0]], a: 0.38, g: linear(-41, 23, -46, 33, R[3], mixColor(R[3], R[2], 0.5), R[2]) }
        };
        for (const k in PATCH) PATCH[k].F = frame(...PATCH[k].m);
        const patch = (key) => {
            const Pt = PATCH[key], m = Pt.m, mu = m[5] == null ? 0.55 : m[5], mv = m[6] == null ? 0.55 : m[6];
            return `<g clip-path="url(#§-${key})">
                <path d="${sil}" fill="url(#§-g${key})"/>
                <path d="${stripes(Pt.F, count(m[1], 8.5, mu), true)}" fill="${P.ragCheck}" fill-opacity="${Pt.a}"/>
                <path d="${stripes(Pt.F, count(m[2], Pt.perV || 8.5, mv), false)}" fill="${P.ragCheck}" fill-opacity="${Pt.a}"/>
            </g>`;
        };

        // ================= ДЫРА =================
        // Ткань рвётся по нитям: дыра — рваный четырёхугольник, стороны идут
        // вдоль основы и утка верхнего слоя. Строится в своих координатах
        // (x — по основе, y — по утку, единицы сцены) и переносится на рамку
        // участка, поэтому края дыры идут вдоль полос клетки. До края E2 и
        // складок — не меньше 1.5.
        const FH = PATCH.R1.F, HC = [-20, -11];
        let hu = 0.5, hv = 0.5, best = 1e9;
        for (let u = 0; u <= 1; u += 0.01) for (let v = 0; v <= 1; v += 0.01) {
            const q = FH(u, v), d = Math.hypot(q[0] - HC[0], q[1] - HC[1]);
            if (d < best) { best = d; hu = u; hv = v; }
        }
        const Su = len(sub(FH(hu + 0.01, hv), FH(hu - 0.01, hv))) / 0.02;
        const Sv = len(sub(FH(hu, hv + 0.01), FH(hu, hv - 0.01))) / 0.02;
        // Габарит 11 × 7: заготовка края ~12 × 9.4, ужимается.
        const H = (p) => FH(hu + p[0] * 0.92 / Su, hv + p[1] * 0.78 / Sv);
        // Край — зубцы неравного размера, крупный рядом с мелким; нижний
        // правый край вырван глубже, с зубцом.
        const HOLE_TOP = [[-5.6, -3.0], [-4.2, -3.7], [-2.6, -3.3], [-1.2, -4.0], [0.9, -3.6], [2.3, -3.9], [4.1, -3.3]];
        const HOLE_RIGHT = [[5.4, -2.6], [5.9, -1.0], [5.2, 0.4], [5.8, 1.6]];
        const HOLE_BOT = [[4.6, 3.2], [3.4, 4.6], [2.6, 3.6], [1.5, 5.4], [0.2, 4.1], [-1.6, 3.9], [-3.0, 3.2], [-4.4, 3.6]];
        const HOLE_LEFT = [[-5.7, 2.4], [-5.2, 0.8], [-6.0, -0.6], [-5.3, -1.8]];
        const holePts = [...HOLE_TOP, ...HOLE_RIGHT, ...HOLE_BOT, ...HOLE_LEFT].map(H);
        const hole = ring(holePts);
        const holeShift = ring(holePts.map(p => add(p, [1.6, 1.4])));
        // На дне дыры — нижний слой той же ткани: клетка ДРУГОГО наклона
        // говорит «под дырой ткань», а не «пятно».
        const hc = H([0, 0]);
        const bandAt = (deg, off, w) => {
            const d = dirOf(deg), n = [-d[1], d[0]], o = add(hc, mul(n, off));
            return ring([add(o, mul(d, -12)), add(o, mul(d, 12)), add(add(o, mul(d, 12)), mul(n, w)), add(add(o, mul(d, -12)), mul(n, w))]);
        };
        const holeCheck = bandAt(30, -3, 2.6) + bandAt(120, -0.5, 2.6);
        // Одна уцелевшая нить по диагонали проёма с провисом вниз и одна
        // оборванная, свисающая с верхнего края. Две прямые крест-накрест
        // читались знаком «+».
        const tDiag = quad([-4.5, -2.8], [0.6, 1.6], [4.8, 2.6], 6).map(H);
        const tHang = spline([[1.8, -3.8], [2.1, -2.2], [1.5, -1.2], [2.4, 0.8]].map(H), 0.6);
        const threadsX = strand(tDiag, 0.85, 0.5) + strand(tHang, 0.8, 0.45);
        const sh = (pts) => pts.map(p => add(p, [0.6, 0.9]));
        const threadsXSh = strand(sh(tDiag), 0.6, 0.4) + strand(sh(tHang), 0.6, 0.4);
        // Концы оборванных нитей растут из краёв строго по основе или утку.
        const TAILS = [[-3.6, -3.6, 0, 1, 2.4], [-3.0, -3.4, 0.15, 1, 1.4],
                       [5.7, -1.6, -1, 0, 1.8], [-0.6, 4.1, 0, -1, 1.4], [3.2, 4.3, 0.1, -1, 2.2]];
        const tails = TAILS.map(([x, y, dx, dy, l]) => strand([[x, y], [x + dx * l * 0.5, y + dy * l * 0.5 + 0.2], [x + dx * l, y + dy * l + 0.5]].map(H), 0.8, 0.3)).join('');
        // Край очерчен тоном, а не рамкой: верх-лево — тёмная линия
        // (отбрасывает тень), низ — неяркий срез ткани.
        const holeDark = taper([...HOLE_LEFT.slice().reverse(), ...HOLE_TOP].map(H), (t) => 0.35 + 0.65 * arch(t, 0.5));
        const holeLit = 'M' + HOLE_BOT.map(H).map(pt).join('L');

        // ================= ПЯТНО =================
        // Застиранное пятно — ореол: середина почти как ткань, к краю темнее,
        // и БЕЗ обводки: чёткий край читался наклейкой. Цвет приглушён к
        // ткани. Лежит через складку F2, её тень ложится поверх — пятно
        // ломается вместе с тканью. Язык вниз-вправо — стекало.
        const sr = btRng(73), SC = [10, -4], stC = mixColor(P.ragStain, R[1], 0.35);
        const blobPts = [];
        for (let i = 0; i < 9; i++) {
            const a = i / 9 * Math.PI * 2 - 0.3;
            let k = 0.8 + sr() * 0.4;
            if (i === 1) k *= 1.5;
            blobPts.push([SC[0] + Math.cos(a) * 7 * k, SC[1] + Math.sin(a) * 4.5 * k]);
        }
        const stain = ring(splineClosed(blobPts, 1.2));

        // ================= МАХРЫ =================
        // Только на конце правого угла: кончик и последние ~6 единиц обоих
        // краёв. Нитки, а не сосульки: тёмные (сырая кромка в тени), почти
        // постоянной толщины, с изгибами в разные стороны, косо вправо;
        // пара загибается вбок-вверх. Всё выше сц. y 508 — над сеткой
        // корзины; клин кафеля под углом свободен.
        const fr = btRng(211);
        const thr = (b, deg, L, curl) => {
            const d = dirOf(deg), n = [-d[1], d[0]], s1 = fr() < 0.5 ? 1 : -1;
            const e1 = s1 * (0.8 + fr() * 0.7), e2 = -s1 * (0.8 + fr() * 0.7);
            const p1 = add(add(b, mul(d, L / 3)), mul(n, e1 * 0.6));
            const p2 = add(add(b, mul(d, 2 * L / 3)), mul(n, e2 * 0.6));
            const p3 = curl ? add(p2, mul(dirOf(deg + curl), L / 3)) : add(add(b, mul(d, L)), mul(n, e1 * 0.3));
            return spline([b, p1, p2, p3], 0.6);
        };
        // [основание, [угол, длина, завиток], ...]
        const TUFTS = [
            [add(TIP, [-0.5, 0.8]), [38, 3.2], [64, 4.0, -100], [88, 2.4]],
            [RAW_B[1], [62, 3.0], [84, 2.4]],
            [RAW_B[3], [70, 2.6], [50, 3.2]],
            [RAW_T[1], [8, 2.8], [28, 3.4]]
        ];
        const fringe = [];
        TUFTS.forEach(([b, ...ts]) => ts.forEach(([deg, L, curl], j) => fringe.push(thr(add(b, [j * 0.5 - 0.4, 0]), deg, L, curl))));
        // Две нити из девяти — тоном светлее.
        const frDark = raw(() => fringe.filter((_, i) => i !== 2 && i !== 6).map(s => strand(s, 0.8, 0.45)).join(''));
        const frMid = raw(() => [fringe[2], fringe[6]].map(s => strand(s, 0.8, 0.45)).join(''));
        // Беглая нить от кончика — длинная, с завитком. Конец не ниже сц.
        // 508: видна и на полке.
        const runaway = raw(() => strand([...cubic([43.1, 5.3], [45.6, 8.1], [43.4, 10.6], [45, 13], 8),
                                           ...cubic([45, 13], [45.8, 14.6], [47.7, 14.5], [47.1, 12.8], 4).slice(1)], 1.2, 0.35));

        // ================= ТЕНИ И СВЕТ =================
        // Сторона складки: u — знак нормали, смотрящей ВВЕРХ-ВЛЕВО (к свету).
        const upLeft = (pts) => { const N = normals(pts), n = N[N.length >> 1]; return (n[0] * -1 + n[1] * -1.2) >= 0 ? 1 : -1; };
        // Концы всех серпов ТУПЫЕ (arch 0.6): острый светлый конец на тёмном
        // читался лезвием, тупой — валиком ткани. Светлый серп не уже
        // 0.45·w: узкие и длинные тоже были лезвиями.
        const blunt = (t) => arch(t, 0.6);
        const mid = (t) => blunt(Math.min(1, Math.max(0, (t - 0.2) / 0.6)));
        const shadeA = [], shadeB = [], shadeC = [], lights = [], lightsLow = [], lines = [];
        for (const k in FOLD) {
            const F = FOLD[k], s = F.s, u = upLeft(s), w = F.w, L = F.low ? lightsLow : lights;
            if (F.type === 'valley') {
                // Вмятина: склон выше-левее отвёрнут от света — тень; склон
                // ниже-правее повёрнут к свету — светлый серп посередине.
                shadeB.push(band(s, () => 0, (t) => u * w * blunt(t)));
                L.push(band(s, () => -u * 0.3, (t) => -u * (0.3 + 0.45 * w * mid(t))));
            } else {
                // Гребень — наоборот, и без линии.
                L.push(band(s, () => 0, (t) => u * 0.5 * w * blunt(t)));
                shadeC.push(band(s, () => 0, (t) => -u * w * blunt(t)));
            }
            if (F.line != null) lines.push(taper(s, (t) => 0.9 * Math.pow(F.line ? t : 1 - t, 0.8)));
        }
        // Край полотна. Мягкая тень без размытия — двумя стопками ПОД краем:
        // широкая бледная (A) и узкая погуще (B). Линия — detail с разрывом
        // посередине. Светлый валик над краем — только где край идёт
        // вверх-вправо (повёрнут к свету).
        const edgeLit = [];
        for (const k in EDGE) {
            const s = EDGE[k];
            shadeA.push(band(s, () => 0.2, (t) => 0.2 + 4.5 * blunt(t)));
            shadeB.push(band(s, () => 0.2, (t) => 0.2 + 1.6 * blunt(t)));
            const cut = (a, b) => s.filter((_, i) => i / (s.length - 1) >= a && i / (s.length - 1) <= b);
            lines.push(taper(cut(0, 0.44), (t) => STROKE.detail * blunt(t)), taper(cut(0.56, 1), (t) => STROKE.detail * blunt(t)));
            const rollW = s.map((p, i) => {
                const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)];
                const kx = -(b[1] - a[1]) / ((b[0] - a[0]) || 1);
                return 1.3 * Math.min(1, Math.max(0, kx / 0.3)) * blunt(i / (s.length - 1));
            });
            edgeLit.push(band(s, () => -0.35, (t, i) => -0.35 - rollW[i]));
        }
        // Сгиб у корня правого угла: со стороны тела — тень (нормаль
        // корня, идущего вниз, смотрит влево — на тело), со стороны угла —
        // светлый валик.
        shadeA.push(band(rootL, () => 0, (t) => 3.5 * blunt(t)));
        shadeB.push(band(rootL, () => 0, (t) => 1.3 * blunt(t)));
        const rootLit = band(rootL, () => 0, (t) => -1.8 * blunt(t));
        // Под вогнутой вершиной угла — тень на бок кома.
        shadeB.push(band(spline([FOOT, [30.4, 20], [30, 24]], 1.2), () => 0, (t) => 2.6 * blunt(t / 2 + 0.5)));
        // Левый угол уходит под ком: короткая тень на ком.
        shadeB.push(band(spline([[-40.5, 21], [-40.2, 28], [-40, 34.5]], 1.2), () => 0, (t) => -2 * blunt(t)));

        // ================= ГРАДИЕНТЫ =================
        const grad = (id, g) => `
                <${g.tag} id="§-g${id}" gradientUnits="userSpaceOnUse" ${g.a}>
                    <stop offset="0" stop-color="${g.st[0]}"/><stop offset="0.55" stop-color="${g.st[1]}"/><stop offset="1" stop-color="${g.st[2]}"/>
                </${g.tag}>`;
        // Вуаль-выгорание: на гребне левой массы клетка выцветает сильнее
        // всего — один приём даёт и объём, и застиранность. Матовая: ткань
        // не блестит.
        const veil = (key, cx, cy, r, sy, a) => `
                <radialGradient id="§-${key}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}"
                                gradientTransform="translate(${cx} ${cy}) scale(1 ${sy}) translate(${-cx} ${-cy})">
                    <stop offset="0" stop-color="${R[4]}" stop-opacity="${a}"/><stop offset="1" stop-color="${R[4]}" stop-opacity="0"/>
                </radialGradient>`;
        const W2 = 2 * STROKE.contour;

        return `
            <defs>
                <clipPath id="§-sil"><path d="${sil}"/></clipPath>
                ${Object.keys(clips).map(k => `<clipPath id="§-${k}"><path d="${clips[k]}"/></clipPath>`).join('')}
                <clipPath id="§-hole"><path d="${hole}"/></clipPath>
                ${Object.keys(PATCH).map(k => grad(k, PATCH[k].g)).join('')}
                ${veil('v1', -18, -14, 12, 0.8, 0.35)}${veil('vw', -17, -8, 9, 0.85, 0.3)}
                <radialGradient id="§-st" gradientUnits="userSpaceOnUse" cx="${SC[0]}" cy="${SC[1]}" r="8"
                                gradientTransform="translate(${SC[0]} ${SC[1]}) scale(1 0.66) translate(${-SC[0]} ${-SC[1]})">
                    <stop offset="0" stop-color="${stC}" stop-opacity="0"/>
                    <stop offset="0.55" stop-color="${stC}" stop-opacity="0.05"/>
                    <stop offset="0.85" stop-color="${stC}" stop-opacity="0.22"/>
                    <stop offset="1" stop-color="${stC}" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <!-- Контур и обводка махров ПОД заливкой: видна наружная половина. -->
            <path d="${sil}" fill="none" stroke="${ink}" stroke-width="${W2}" stroke-linejoin="round"/>
            <path d="${frDark}${frMid}${runaway}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.hairline}" stroke-linejoin="round"/>
            <path d="${sil}" fill="${R[1]}"/>
            <g clip-path="url(#§-sil)">
                ${Object.keys(PATCH).map(patch).join('')}
                <path d="${stain}" fill="url(#§-st)"/>
                <path d="${sil}" fill="url(#§-v1)"/>
                <path d="${sil}" fill="url(#§-vw)"/>
                <path d="${shadeA.join('')}" fill="${R[0]}" fill-opacity="0.25"/>
                <path d="${shadeB.join('')}" fill="${R[0]}" fill-opacity="0.45"/>
                <path d="${shadeC.join('')}" fill="${R[0]}" fill-opacity="0.35"/>
                <path d="${lights.join('')}" fill="${R[4]}" fill-opacity="0.45"/>
                <!-- Внизу светлое тусклее: на тёмном яркий серп — лезвие. -->
                <path d="${lightsLow.join('')}" fill="${R[3]}" fill-opacity="0.35"/>
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
                <path d="${holeLit}" fill="none" stroke="${R[3]}" stroke-width="${STROKE.hairline}" stroke-opacity="0.6" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="${rootLit}" fill="${R[4]}" fill-opacity="0.7"/>
                <path d="${lines.join('')}" fill="${inkSoft}"/>
                <path d="${edgeLit.join('')}" fill="${R[4]}" fill-opacity="0.6"/>
            </g>
            <!-- Тонкий кант собирает край после клипа. -->
            <path d="${sil}" fill="none" stroke="${mixColor(ink, R[1], 0.4)}" stroke-width="${STROKE.hairline}" stroke-linejoin="round"/>
            <!-- Махры поверх контура — иначе чернила съедают их основания. -->
            <path d="${frDark}" fill="${R[1]}"/>
            <path d="${frMid}" fill="${R[2]}"/>
            <path d="${runaway}" fill="${R[3]}"/>`;
    }
};

if (typeof window !== 'undefined') window.BATH_CLOTH = BATH_CLOTH;
