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
        if (kind === 'rag') return { x: 527, y: 469, w: 94, h: 64 };
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
    // ФОРМА. Один купол слева от центра, правый склон спускается к углу
    // СТУПЕНЯМИ (складка — полка — складка), бока наклонные: ткань осела.
    // Второй круг начинался с двух почти равных бугров над горизонтальной
    // тёмной кромкой и надутым низом — в руке над мордой червя это читалось
    // пухлыми губами. Поэтому бугор один, а тёмной черты через предмет нет.
    //
    // ОПОЗНАВАТЕЛЬНЫЙ ПРИЁМ — угол, показывающий ИЗНАНКУ: большой справа
    // свисает вниз-вправо с клином кафеля под ним, маленький торчит слева.
    // Изнанка застиранной ткани бледнее лица, клетка сквозь неё едва видна —
    // светлый язык на тёмном комке ловится и на иконке. У губок (1, 2) —
    // прямые грани, у морской (4) — бугры без углов, у рукавицы (6) — шов.
    //
    // СКОМКАННОСТЬ — складками, а не шумом: на верхнем полотне они лучами
    // расходятся от точки зажима, подол внизу висит волнами и драпировкой,
    // как низ занавески. Каждая складка, дошедшая до края, оставляет в
    // силуэте свою выемку — иначе складки нарисованы поверх плоского пятна.
    // Участков девять (три на полотне, четыре панели подола, два угла), у
    // каждого своя рамка клетки: на складке клетка обрывается и идёт дальше
    // под другим углом.
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
        // Изнанка: бледнее лица, к кончику темнеет — он отвёрнут от света.
        // Кончик не уходит в rag[2]: на нём язык сливался с телом по тону.
        const back0 = mixColor(R[3], R[4], 0.35), back1 = mixColor(R[3], R[4], 0.1), back2 = mixColor(R[2], R[3], 0.5);
        // Низ панели подола: темнее середины, но НЕ чистая тень — чистый
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
        // нижнего левого. Третий элемент: число — вершина со скруглением
        // этого радиуса (кончики углов, выемки складок); 'j' — гладкий вход в
        // прямую кромку угла (край тканый и потому почти прямой); 'l' —
        // точка ломаной: сырой край ткани.
        //
        // Контур мелко неровный: в каждую выемку выходит складка. С двумя
        // выемками прошлый силуэт был гладким, как надувной.
        const E = [41.5, 17], E2 = [32, 11.5];      // нижняя кромка большого угла: от кончика к телу
        // Сырой край на последних 8 единицах нижней кромки: дрожь поперёк
        // шагом 1.2 — это кромка оборванной ткани, а не отдельная фигура.
        const eu = unit(sub(E2, E)), en = [-eu[1], eu[0]], jr = btRng(97);
        const RAW = [1, 2, 3, 4, 5, 6].map(k => add(add(E, mul(eu, 1.2 * k)), mul(en, (jr() - 0.5) * 1.0)));
        const V = [
            [-37, 38],                   // дно слева
            [-42, 31],                   // осевшая ступня: бок наклонный
            [-40.5, 24, 1.0],            // выемка: выход драпировки D1
            [-43, 18],
            [-46, 15, 0.9],              // кончик малого левого угла
            [-40, 11.5, 1.2],            // малый угол прилегает к телу
            [-38.5, 4],                  // левый бок купола
            [-35, -4, 1.3],              // выемка: выход складки F5
            [-29, -14],
            [-18, -22],                  // МАКУШКА — единственная верхняя точка
            [-7, -21.5],
            [-1, -18.5, 1.6],            // выемка: выход главной складки F1
            [7, -17],                    // полка, а не второй бугор: на 4 ниже макушки
            [15, -13.5],
            [18.5, -11, 1.3],            // выемка: выход F2 — ступень вниз
            [24, -7.5],
            [26.5, -5, 'j'],             // корень большого угла
            [44.5, 14.5, 1.0],           // кончик большого угла
            [E[0], E[1], 1.0],
            ...RAW.map(p => [p[0], p[1], 'l']),
            [E2[0], E2[1], 1.6],         // угол прилегает — вогнутая вершина
            [33.5, 20],                  // правый бок кома, наклонный
            [31, 38],                    // дно справа
            [2, 38.8, 1.2]               // выемка: выход D3 на дне
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

        // ================= КРОМКА ПОЛОТНА =================
        // Подол висит волнами: над гребнем драпировки провисает, над долиной
        // подтянут вверх, и в целом опускается вправо. Нижние точки волн
        // (−32, −16, 3, 22) — гребни драпировки, верхние (−25, −7, 13) — долины.
        const hemBase = spline([[-60, 13], [-46, 15], [-40, 11.5], [-32, 13.5], [-25, 11.5], [-16, 14.5],
                                [-7, 12], [3, 13.5], [13, 11], [22, 12.5], [32, 11.5]]);
        const hemAt = (x) => {
            for (let i = 1; i < hemBase.length; i++) {
                const a = hemBase[i - 1], b = hemBase[i];
                if (x <= b[0]) return a[1] + (b[1] - a[1]) * (x - a[0]) / ((b[0] - a[0]) || 1);
            }
            return hemBase[hemBase.length - 1][1];
        };
        // Надрыв на кромке: неровная выемка вверх, зубцы разного размера.
        const TEAR = [[-23.5, 0], [-22.6, -1.4], [-21.9, -1.1], [-21.2, -3.0], [-20.4, -3.8], [-19.5, -3.2],
                      [-18.9, -3.6], [-18.1, -1.6], [-17.4, -0.8], [-16.5, 0]].map(([x, dy]) => [x, hemAt(x) + dy]);
        const hem = hemBase.filter(p => p[0] < -23.5 || p[0] > -16.5);
        hem.splice(hem.findIndex(p => p[0] > -16.5), 0, ...TEAR);
        const hemRange = (x0, x1) => hem.filter(p => p[0] > x0 && p[0] < x1);
        const hemVis = hem.filter(p => p[0] >= -40);
        const HP = (x) => [x, hemAt(x)];
        // За силуэтом кромка продолжается нижним краем большого угла — так
        // клипы подола и угла делят и его.
        const HX = [E, [60, 24]];

        // ================= СКЛАДКИ =================
        // Верхнее полотно собрано в узел KN: складки расходятся от него
        // лучами к краям. Тип valley — вмятина, ridge — гребень. ★ (line) —
        // глубокие, у них есть тонкая линия; notch — какой конец выходит в
        // выемку силуэта (там линия толще и гаснет внутрь).
        const KN = [9, -1];
        const FOLD = {
            F1: { p: [[-1, -18.5], [3, -10], KN], type: 'valley', w: 3.5, line: 0 },
            F2: { p: [[18.5, -11], [14, -5], KN], type: 'valley', w: 3.0, line: 0 },
            F3: { p: [KN, [17, 2], [25, 3]], type: 'ridge', w: 2.5 },
            F4: { p: [KN, [2, 4], [-6, 7]], type: 'valley', w: 2.5 },
            F5: { p: [[-35, -4], [-29, -4.5], [-24, -2]], type: 'valley', w: 3.0, line: 0 },
            F6: { p: [[-9, -17], [-6, -11], [-3, -6]], type: 'ridge', w: 2.0 },
            // Подол: драпировка от кромки вниз к дну.
            D1: { p: [HP(-25), [-29, 22], [-40.5, 24]], type: 'valley', w: 3.5, line: 1 },
            D2: { p: [HP(-16), [-15, 26], [-17, 37]], type: 'ridge', w: 3.0 },
            D3: { p: [HP(-7), [-3, 25], [2, 38.8]], type: 'valley', w: 3.5, line: 1 },
            D4: { p: [HP(3), [8, 24], [9, 36]], type: 'ridge', w: 3.0 },
            D5: { p: [HP(13), [18, 22], [21, 37]], type: 'valley', w: 3.0, line: 1 }
        };
        for (const k in FOLD) FOLD[k].s = spline(FOLD[k].p, 1);
        // Залом на куполе — короткая Y-вмятина, как от ткани, сжатой в
        // кулаке. Один: два уже читаются трещинами. Все ветви идут ОТ узла.
        // Сдвинут на (−3, −1) от задуманного места: там узел залома касался
        // левого края дыры и читался шипом, торчащим из неё.
        const ZJ = [-26, -11];
        const ZB = [[[-30, -14]], [[-22, -13]], [[-25.5, -7]]].map(e => spline([ZJ, ...e], 0.8));

        // ================= УЧАСТКИ =================
        // Клипы — многоугольники с запасом ЗА силуэт: всё равно режутся им.
        const sF1 = FOLD.F1.s, sF2 = FOLD.F2.s, sF3 = FOLD.F3.s, sF4 = FOLD.F4.s;
        const F4end = HP(-8.5);
        const root = spline([[26.5, -5], [28, 3], E2], 1);   // сгиб у корня большого угла
        const clips = raw(() => ({
            // Купол: левее F1 и выше F4.
            L1: poly([[-60, -40], [-60, 13], ...hemRange(-60, F4end[0]), F4end, ...sF4.slice().reverse(),
                      ...sF1.slice().reverse(), [-1, -40]]),
            // Полка между F1 и F2 и веер под узлом до кромки.
            L2: poly([[-1, -40], ...sF1, ...sF4.slice(1), F4end, ...hemRange(F4end[0], E2[0]), E2,
                      ...root.filter(p => p[1] >= 3).reverse().slice(1), ...sF3.slice().reverse().slice(1), ...sF2.slice().reverse(), [19, -40]]),
            // Ступень справа от F2 до корня угла.
            L3: poly([[19, -40], ...sF2, ...sF3.slice(1), ...root.filter(p => p[1] <= 3).reverse(), [25, -40]]),
            // Большой угол — правее корня, выше своей нижней кромки.
            FL: poly([[25, -40], ...root, ...HX, [60, -40]]),
            // Малый угол — левее линии, где он прилегает к телу.
            SF: poly([[-40, 11.5], [-42.25, 24.25], [-60, 24.25], [-60, 11.5]]),
            // Подол: четыре панели по долинам D1, D3, D5.
            LA: poly([[-60, 13], ...hemRange(-60, -25), ...FOLD.D1.s, [-60, 24]]),
            LB: poly([[-60, 24], ...FOLD.D1.s.slice().reverse(), ...hemRange(-25, -7), ...FOLD.D3.s, [3, 60], [-60, 60]]),
            LC: poly([...hemRange(-7, 13), ...FOLD.D5.s, [22, 60], [3, 60], ...FOLD.D3.s.slice().reverse()]),
            LD: poly([...hemRange(13, E2[0]), E2, ...HX, [60, 60], [22, 60], ...FOLD.D5.s.slice().reverse()])
        }));

        // ================= КЛЕТКА =================
        // Ровный <pattern> клал бы клетку плоским трафаретом поперёк складок —
        // скатерть, наклеенная на камень. Здесь полосы — залитые пути через
        // отображение участка (u, v) → сцена: рамка повёрнута по драпировке,
        // выгнута вектором b, а к краям бугра полосы сходятся (ракурс).
        // Сжатие смягчено (mu < 1): при полном косинусе полосы у края
        // сливались. У панелей подола сжатие только поперёк складки.
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
        // сторону, блики выстраиваются в линию — комок читается одним
        // объёмом. Панели подола — «цилиндры» складок: свет поперёк, слева.
        const PATCH = {
            LA: { m: [[-36, 18], 10, 8, -6, [-1, -1], 0.55, 0], per: 8.5, perV: 6, a: 0.38, g: linear(-46, 18, -26, 20, R[2], R[1], lowDark) },
            LB: { m: [[-20, 27], 22, 15, 5, [-1, -1], 0.55, 0], per: 8.5, perV: 6, a: 0.38, g: linear(-40, 24, -2, 28, R[2], R[1], lowDark) },
            LC: { m: [[7, 26], 15, 15, -3, [-1, -1], 0.55, 0], per: 8.5, perV: 6, a: 0.38, g: linear(-6, 22, 20, 26, R[2], R[1], lowDark) },
            LD: { m: [[24, 25], 12, 15, 8, [-1, -1], 0.55, 0], per: 8.5, perV: 6, a: 0.38, g: linear(14, 20, 34, 24, R[2], R[1], lowDark) },
            L1: { m: [[-20, -5], 28, 19, -15, [-1.5, -2.5]], per: 8.5, a: 0.42, g: radial(-24, -14, 26, R[3], R[2], R[1]) },
            L2: { m: [[10, -2], 22, 17, 18, [-1, -1.5]], per: 8.5, a: 0.42, g: radial(4, -10, 22, R[3], R[2], R[1]) },
            // Ступень ниже купола — на ступень темнее по тону.
            L3: { m: [[19, -4], 12, 10, -8, [-0.5, -1]], per: 8.5, a: 0.42, g: radial(16, -8, 15, R[2], R[1], R[1]) },
            // Изнанка: клетка едва проступает, рамка зеркальна к полке, без
            // выпуклости — угол висит плоским языком.
            FL: { m: [[35, 5], 13, 13, -35, [0, 0]], per: 8.5, a: 0.14, g: linear(27, -2, 43, 15, back0, back1, back2) }
        };
        for (const k in PATCH) PATCH[k].F = frame(...PATCH[k].m);
        const patch = (key) => {
            const Pt = PATCH[key], m = Pt.m, mu = m[5] == null ? 0.55 : m[5], mv = m[6] == null ? 0.55 : m[6];
            return `<g clip-path="url(#§-${key})">
                <path d="${sil}" fill="url(#§-g${key})"/>
                <path d="${stripes(Pt.F, count(m[1], Pt.per, mu), true)}" fill="${P.ragCheck}" fill-opacity="${Pt.a}"/>
                <path d="${stripes(Pt.F, count(m[2], Pt.perV || Pt.per, mv), false)}" fill="${P.ragCheck}" fill-opacity="${Pt.a}"/>
            </g>`;
        };

        // ================= ДЫРА =================
        // Ткань рвётся по нитям: дыра — рваный четырёхугольник, стороны идут
        // вдоль основы и утка купола. Строится в своих координатах (x — по
        // основе, y — по утку, единицы сцены) и переносится на рамку купола,
        // поэтому края дыры идут вдоль полос клетки. Стоит в стороне от
        // складок F5, F6 и залома.
        const F1 = PATCH.L1.F, HC = [-15, -7];
        let hu = 0.5, hv = 0.5, best = 1e9;
        for (let u = 0; u <= 1; u += 0.01) for (let v = 0; v <= 1; v += 0.01) {
            const q = F1(u, v), d = Math.hypot(q[0] - HC[0], q[1] - HC[1]);
            if (d < best) { best = d; hu = u; hv = v; }
        }
        const Su = len(sub(F1(hu + 0.01, hv), F1(hu - 0.01, hv))) / 0.02;
        const Sv = len(sub(F1(hu, hv + 0.01), F1(hu, hv - 0.01))) / 0.02;
        const H = (p) => F1(hu + p[0] / Su, hv + p[1] / Sv);
        // Край — зубцы неравного размера, крупный рядом с мелким; нижний
        // правый край вырван глубже, с зубцом в 2 единицы. Габарит 12 × 8.
        const hs = (p) => [p[0] * 12 / 11, p[1] * 8 / 7];
        const HOLE_TOP = [[-5.6, -3.0], [-4.2, -3.7], [-2.6, -3.3], [-1.2, -4.0], [0.9, -3.6], [2.3, -3.9], [4.1, -3.3]].map(hs);
        const HOLE_RIGHT = [[5.4, -2.6], [5.9, -1.0], [5.2, 0.4], [5.8, 1.6]].map(hs);
        const HOLE_BOT = [[4.6, 3.2], [3.4, 4.6], [2.6, 3.6], [1.5, 5.4], [0.2, 4.1], [-1.6, 3.9], [-3.0, 3.2], [-4.4, 3.6]].map(hs);
        const HOLE_LEFT = [[-5.7, 2.4], [-5.2, 0.8], [-6.0, -0.6], [-5.3, -1.8]].map(hs);
        const holePts = [...HOLE_TOP, ...HOLE_RIGHT, ...HOLE_BOT, ...HOLE_LEFT].map(H);
        const hole = ring(holePts);
        const holeShift = ring(holePts.map(p => add(p, [1.8, 1.6])));
        // На дне дыры — нижний слой той же ткани: клетка ДРУГОГО наклона
        // говорит «под дырой ткань», а не «пятно».
        const hc = H([0, 0]);
        const bandAt = (deg, off, w) => {
            const d = dirOf(deg), n = [-d[1], d[0]], o = add(hc, mul(n, off));
            return ring([add(o, mul(d, -12)), add(o, mul(d, 12)), add(add(o, mul(d, 12)), mul(n, w)), add(add(o, mul(d, -12)), mul(n, w))]);
        };
        const holeCheck = bandAt(30, -3, 2.8) + bandAt(120, -0.5, 2.8);
        // Одна уцелевшая нить по диагонали проёма с провисом вниз и одна
        // оборванная, свисающая с верхнего края. Две прямые крест-накрест
        // читались знаком «+».
        const tDiag = quad([-4.5, -2.8], [0.6, 1.4], [4.8, 2.6], 6).map(H);
        const tHang = [[1.8, -3.8], [2.1, -2.4], [1.6, -1.6], [2.4, 0.2]].map(H);
        const threadsX = strand(tDiag, 0.9, 0.55) + strand(spline(tHang, 0.6), 0.85, 0.5);
        const sh = (pts) => pts.map(p => add(p, [0.6, 0.9]));
        const threadsXSh = strand(sh(tDiag), 0.6, 0.4) + strand(sh(spline(tHang, 0.6)), 0.6, 0.4);
        // Концы оборванных нитей растут из краёв строго по основе или утку.
        const TAILS = [[-3.6, -3.8, 0, 1, 2.2], [-3.0, -3.6, 0.15, 1, 1.3],
                       [6.0, -1.6, -1, 0, 1.6], [-0.6, 4.4, 0, -1, 1.2], [3.2, 4.6, 0.1, -1, 2.0]];
        const tails = TAILS.map(([x, y, dx, dy, l]) => strand([[x, y], [x + dx * l * 0.5, y + dy * l * 0.5 + 0.2], [x + dx * l, y + dy * l + 0.5]].map(H), 0.8, 0.3)).join('');
        // Край очерчен тоном, а не рамкой: верх-лево — тёмная линия
        // (отбрасывает тень), низ — неяркий срез ткани. Кремовая рамка по
        // двум сторонам давала наклейку.
        const holeDark = taper([...HOLE_LEFT.slice().reverse(), ...HOLE_TOP].map(H), (t) => 0.35 + 0.65 * arch(t, 0.5));
        const holeLit = 'M' + HOLE_BOT.map(H).map(pt).join('L');

        // ================= ПЯТНО =================
        // Застиранное пятно — ореол: середина почти как ткань, к краю темнее,
        // и БЕЗ обводки: чёткий край читался оранжевой наклейкой. Цвет
        // приглушён к ткани. Лежит через складку F2, её тень ложится поверх
        // — пятно ломается вместе с тканью. Язык вниз-вправо — стекало.
        const sr = btRng(73), SC = [14, -6], stC = mixColor(P.ragStain, R[1], 0.35);
        const blobPts = [];
        for (let i = 0; i < 9; i++) {
            const a = i / 9 * Math.PI * 2 - 0.3;
            let k = 0.8 + sr() * 0.4;
            if (i === 1) k *= 1.5;
            blobPts.push([SC[0] + Math.cos(a) * 7.5 * k, SC[1] + Math.sin(a) * 5 * k]);
        }
        const stain = ring(splineClosed(blobPts, 0.9));

        // ================= МАХРЫ =================
        // Только на конце большого угла: кончик и последние 8 единиц нижней
        // кромки. Нитки, а не сосульки: тёмные (сырая кромка в тени), почти
        // постоянной толщины, с изгибами в разные стороны, направление —
        // от гравитации ±35°, у соседних разное; пара загибается вбок-вверх.
        // Клин кафеля под углом свободен: пучки у самого кончика и косо
        // вправо — отвесные нити с кромки заполняли клин целиком.
        const fr = btRng(211);
        const thr = (b, deg, L, curl) => {
            const d = dirOf(deg), n = [-d[1], d[0]], s1 = fr() < 0.5 ? 1 : -1;
            const e1 = s1 * (0.8 + fr() * 0.7), e2 = -s1 * (0.8 + fr() * 0.7);
            const p1 = add(add(b, mul(d, L / 3)), mul(n, e1 * 0.6));
            const p2 = add(add(b, mul(d, 2 * L / 3)), mul(n, e2 * 0.6));
            const p3 = curl ? add(p2, mul(dirOf(deg + curl), L / 3)) : add(add(b, mul(d, L)), mul(n, e1 * 0.3));
            return spline([b, p1, p2, p3], 0.5);
        };
        const TIP = [44.1, 15.4];
        // [основание, [угол, длина, завиток], ...]
        const TUFTS = [
            [TIP, [52, 3.6], [80, 4.6, -100], [104, 2.6]],
            [RAW[0], [88, 3.4], [66, 2.6]],
            [RAW[1], [58, 2.2], [80, 3.2]],
            [RAW[3], [52, 2.0], [70, 2.8], [60, 2.2]]
        ];
        const fringe = [];
        TUFTS.forEach(([b, ...ts]) => ts.forEach(([deg, L, curl], j) => fringe.push(thr(add(b, [j * 0.5 - 0.4, 0]), deg, L, curl))));
        // Две нити из десяти — тоном светлее.
        const frDark = raw(() => fringe.filter((_, i) => i !== 2 && i !== 7).map(s => strand(s, 0.8, 0.45)).join(''));
        const frMid = raw(() => [fringe[2], fringe[7]].map(s => strand(s, 0.8, 0.45)).join(''));
        // Беглая нить у кончика — длинная, с завитком.
        const runaway = raw(() => strand([...cubic([44.1, 16.1], [46.7, 19.3], [43.9, 22.3], [45.5, 25.3], 8),
                                           ...cubic([45.5, 25.3], [46.3, 26.9], [48.2, 26.8], [47.6, 25.1], 4).slice(1)], 1.2, 0.35));
        // Из надрыва на кромке свисают две нитки — внутри силуэта, без
        // обводки, с тенью-двойником.
        const tearIn = [thr(TEAR[3], 95, 4.2), thr(TEAR[6], 80, 3.2)];
        const frIn = tearIn.map(s => strand(s, 0.8, 0.45)).join('');
        const frInSh = tearIn.map(s => strand(s.map(p => add(p, [0.5, 0.7])), 0.8, 0.45)).join('');

        // ================= ТЕНИ И СВЕТ =================
        // Сторона складки: s — знак нормали, смотрящей ВВЕРХ-ВЛЕВО (к свету).
        const upLeft = (pts) => { const N = normals(pts), n = N[N.length >> 1]; return (n[0] * -1 + n[1] * -1.2) >= 0 ? 1 : -1; };
        const mid3 = (t) => arch(Math.min(1, Math.max(0, (t - 1 / 3) * 3)));
        const shadeB = [], shadeC = [], shadeA = [], lights = [], lines = [];
        const fold = (s, type, w, lineEnd) => {
            const u = upLeft(s);
            if (type === 'valley') {
                // Вмятина: склон выше-левее отвёрнут от света — тень; склон
                // ниже-правее повёрнут к свету — светлый серп в средней трети.
                shadeB.push(band(s, () => 0, (t) => u * w * arch(t, 0.8)));
                lights.push(band(s, () => -u * 0.3, (t) => -u * (0.3 + 0.35 * w * mid3(t))));
            } else {
                // Гребень — наоборот, и без линии.
                lights.push(band(s, () => 0, (t) => u * 0.5 * w * arch(t, 0.8)));
                shadeC.push(band(s, () => 0, (t) => -u * w * arch(t, 0.8)));
            }
            if (lineEnd != null) lines.push(taper(s, (t) => 0.9 * Math.pow(lineEnd ? t : 1 - t, 0.8)));
        };
        for (const k in FOLD) fold(FOLD[k].s, FOLD[k].type, FOLD[k].w, FOLD[k].line);
        // Залом: тень без светлого серпа, линия от узла гаснет.
        ZB.forEach(s => {
            shadeB.push(band(s, () => 0, (t) => upLeft(s) * 1.4 * arch(0.5 + t / 2, 0.8)));
            lines.push(taper(s, (t) => 0.7 * (1 - t)));
        });
        // Мягкая тень без размытия — двумя стопками: широкая бледная (A) и
        // узкая погуще (B), прижатая к краю, который отбрасывает тень.
        // Под кромкой полотна — главное, что отделяет слои.
        const hemSh = hemVis.map(p => add(p, [0.8, 0]));
        shadeA.push(band(hemSh, () => 0.2, (t) => 1.7 + 4 * arch(t, 0.25)));
        shadeB.push(band(hemSh, () => 0.2, (t) => 1.7 + 1.5 * arch(t, 0.25)));
        // Сгиб у корня большого угла: со стороны тела — тень (нормаль
        // корня, идущего вниз, смотрит влево — на тело).
        shadeA.push(band(root, () => 0, (t) => 3.5 * arch(t, 0.7)));
        shadeB.push(band(root, () => 0, (t) => 1.3 * arch(t, 0.7)));
        // Тень угла на бок кома под его нижней кромкой (там, где за кромкой
        // тело, а не кафель — остальное срежет силуэт).
        const flapEdge = [E2, ...RAW.slice().reverse(), E];
        shadeA.push(band(flapEdge, () => 0, () => 4));
        shadeB.push(band(flapEdge, () => 0, () => 1.5));
        // Малый угол бросает короткую тень на тело.
        shadeB.push(band(spline([[-40, 11.5], [-41, 16], [-41.5, 20]], 1), () => 0, (t) => -2.2 * arch(t, 0.6)));
        // Валик сгиба у корня — светлая лента на стороне угла.
        const rootLit = band(root, () => 0, (t) => -1.8 * arch(t, 0.8));
        // Кромка — край ткани, а не линия рта. Валик: светлая лента НАД
        // кромкой только там, где волна поднимается вправо (край повёрнут к
        // свету), на спусках — ничего.
        const hemRoll = hemVis.filter(p => p[0] < -24 || p[0] > -16);
        const rollW = hemRoll.map((p, i) => {
            const a = hemRoll[Math.max(0, i - 1)], b = hemRoll[Math.min(hemRoll.length - 1, i + 1)];
            const k = -(b[1] - a[1]) / ((b[0] - a[0]) || 1);
            return 1.3 * Math.min(1, Math.max(0, k / 0.3));
        });
        const hemLit = band(hemRoll, () => -0.35, (t, i) => -0.35 - rollW[i]);
        // Сама кромка — тонкая прерывистая линия: рвётся на каждой нижней
        // точке волны, а на гребнях D2 и D4 её нет вовсе — там только тень.
        [[-40, -33], [-31, -18.5], [-13.5, 0.5], [5.5, 21], [23, 32]].forEach(([a, b]) =>
            lines.push(taper(hem.filter(p => p[0] >= a && p[0] <= b), (t) => STROKE.detail * arch(t, 0.6))));
        // Срез ткани у надрыва — неярко, в тон светлой ткани.
        const tearLit = band(TEAR, () => -0.3, (t) => -0.3 - 0.8 * arch(t, 0.5));

        // ================= ГРАДИЕНТЫ =================
        const grad = (id, g) => `
                <${g.tag} id="§-g${id}" gradientUnits="userSpaceOnUse" ${g.a}>
                    <stop offset="0" stop-color="${g.st[0]}"/><stop offset="0.55" stop-color="${g.st[1]}"/><stop offset="1" stop-color="${g.st[2]}"/>
                </${g.tag}>`;
        // Вуаль-выгорание: на гребне купола клетка выцветает сильнее всего —
        // один приём даёт и объём, и застиранность. Матовая: ткань не
        // блестит. Слабее, чем в первом круге: там она мутила весь купол.
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
                ${veil('v1', -20, -15, 13, 0.8, 0.35)}${veil('vw', -12, -4, 9, 0.85, 0.3)}
                <radialGradient id="§-st" gradientUnits="userSpaceOnUse" cx="${SC[0]}" cy="${SC[1]}" r="8.5"
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
                ${patch('LA')}${patch('LB')}${patch('LC')}${patch('LD')}
                <path d="${sil}" clip-path="url(#§-SF)" fill="${mixColor(R[3], R[4], 0.2)}"/>
                ${patch('L1')}${patch('L2')}${patch('L3')}
                <path d="${stain}" fill="url(#§-st)"/>
                <path d="${sil}" fill="url(#§-v1)"/>
                <path d="${sil}" fill="url(#§-vw)"/>
                <path d="${shadeA.join('')}" fill="${R[0]}" fill-opacity="0.25"/>
                <path d="${shadeB.join('')}" fill="${R[0]}" fill-opacity="0.45"/>
                <path d="${shadeC.join('')}" fill="${R[0]}" fill-opacity="0.35"/>
                <path d="${lights.join('')}" fill="${R[4]}" fill-opacity="0.45"/>
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
                <path d="${frInSh}" fill="${R[0]}" fill-opacity="0.5"/>
                <path d="${frIn}" fill="${R[1]}"/>
                ${patch('FL')}
                <path d="${rootLit}" fill="${R[4]}" fill-opacity="0.7"/>
                <path d="${lines.join('')}" fill="${inkSoft}"/>
                <path d="${hemLit}" fill="${R[4]}" fill-opacity="0.6"/>
                <path d="${tearLit}" fill="${R[3]}" fill-opacity="0.6"/>
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
