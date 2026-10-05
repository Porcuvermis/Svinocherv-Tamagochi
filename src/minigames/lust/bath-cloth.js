// ================= МОЧАЛКА: ЛЕСТНИЦА ВИДА =================
// Мочалка прокачивает время трения и таймер награды, и с каждой покупкой
// меняется сам ПРЕДМЕТ (docs/plan/21-lust-bath.md, разд. 5д): половая
// тряпка → кухонная губка → банная губка → пуф → морская губка → пуф-оборка →
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
    // Вид на каждой ступени. Нарисованы 0–7; ещё не нарисованные берут
    // запечённую губку — пока лестница не закончена.
    TIERS: ['rag', 'kitchen', 'brick', 'puff', 'sea', 'ruffle', 'mitt', 'konjac', 'cloud'],

    level() {
        if (typeof GameState === 'undefined' || !GameState.upgradeLevel || typeof Backend === 'undefined') return 0;
        return GameState.upgradeLevel(Backend.upgradeKey('lust', 'cloth')) || 0;
    },
    tier(level) {
        const L = level == null ? this.level() : level;
        return Math.max(0, Math.min(this.TIERS.length - 1, L | 0));
    },

    // Вещь ступени — из двух частей: основная (лежит в корзине, за передней
    // сеткой) и передняя (свисает через край корзины наружу, поверх сетки).
    // На полке они в разных слоях сцены (bt-cloth-art и bt-cloth-front), в
    // руке и на иконке — вместе: это одна и та же вещь. Функция ступени
    // возвращает строку (всё — основная часть) или { main, front }.
    parts(level, where) {
        const r = this.tierArt(level, where);
        return typeof r === 'string' ? { main: r, front: '' } : r;
    },
    drawFront(level) { return this.parts(level, 'shelf').front; },

    // where === 'shelf' — предмет на полке: там основная часть без передней
    // (передняя — своим слоем поверх сетки), и ступень может показать там
    // то, чего нет в руке и на иконке. Иначе — обе части вместе.
    draw(level, where) {
        const p = this.parts(level, where);
        return where === 'shelf' ? p.main : p.main + p.front;
    },
    tierArt(level, where) {
        const kind = this.TIERS[this.tier(level)];
        if (kind === 'rag') return this.rag(where);
        if (kind === 'kitchen') return this.kitchen();
        if (kind === 'brick') return this.bath();
        if (kind === 'puff') return this.puff();
        if (kind === 'sea') return this.sea();
        if (kind === 'ruffle') return this.ruffle();
        if (kind === 'mitt') return this.mitt();
        if (kind === 'konjac') return this.konjac(where);
        return BATH_BAKED.draw('cloth');
    },

    // Габарит на сцене — по нему захват, упор в край экрана и иконка.
    box(level) {
        const kind = this.TIERS[this.tier(level)];
        // Тряпка — по нарисованному: getBBox листа и висящего полотна вместе
        // (x 546.9–650.6, y 473.5–572.9, края — пух оверлока), округлено наружу.
        if (kind === 'rag') return { x: 546, y: 473, w: 105, h: 100 };
        // Губка — тоже по нарисованному: getBBox бруска с волосками абразива,
        // выбившимися за контур (x 547.4–647.0, y 460.2–529.8), округлено наружу.
        if (kind === 'kitchen') return { x: 547, y: 460, w: 100, h: 70 };
        // Банная губка — getBBox «косточки» (x 548.7–647.3, y 462.7–529.7):
        // за контур ничего не выбивается, округлено наружу.
        if (kind === 'brick') return { x: 548, y: 462, w: 100, h: 68 };
        // Пуф — getBBox шара и петли вместе (x 552.3–643.8, y 454.4–549.3;
        // низ — петля под перекладиной), округлено наружу.
        if (kind === 'puff') return { x: 552, y: 454, w: 92, h: 96 };
        // Морская губка — getBBox кома (x 548.7–641.7, y 449.9–522.1; низ —
        // приплюснут дном корзины), округлено наружу.
        if (kind === 'sea') return { x: 548, y: 449, w: 94, h: 74 };
        // Пуф-оборка — getBBox шара со шнурком и пухом края (x 546.8–642.5,
        // y 442.3–532.5; слева и снизу — шнурок), округлено наружу.
        if (kind === 'ruffle') return { x: 546, y: 442, w: 97, h: 91 };
        // Рукавица — getBBox рукавицы и петли вместе (x 559.8–642.0,
        // y 435.1–539.3; низ — петля под перекладиной), округлено наружу.
        if (kind === 'mitt') return { x: 559, y: 435, w: 84, h: 105 };
        // Конняку — getBBox обеих посадок вместе: осевшая на полке
        // (x 540.4–637.6, y 439–527.3) и шар в руке (x 543–635, y 436–528).
        // Габарит один на обе: по нему захват, упор в край и иконка; середина
        // совпадает с центром шара (589, 482).
        if (kind === 'konjac') return { x: 540, y: 436, w: 98, h: 92 };
        return BATH_BAKED.box('cloth');
    },

    // Полка перерисовывается после покупки и после debug-панели.
    refresh() {
        if (typeof document === 'undefined') return;
        const p = this.parts(null, 'shelf'), el = document.getElementById('bt-cloth-art');
        const fr = document.getElementById('bt-cloth-front');
        if (el) el.innerHTML = p.main;
        if (fr) fr.innerHTML = p.front;
    },

    // ---------- 0. ПОЛОВАЯ ТРЯПКА ----------
    // Вязально-прошивное полотно из обрезков (референсы игрока): тонкий лист
    // стоит у задней сетки корзины лицом к нам, верх волнистый, правый
    // верхний угол мягко загнут изнанкой наружу, а низ перевалился через
    // переднюю перекладину и висит полотном с волнистым подолом.
    //
    // Что было до и почему теперь так:
    // * клетка-гингем и длинная бахрома читались кухонным полотенцем и
    //   шарфом, ком с лоскутом — цифрой «9», чёрный толстый контур — тяжестью;
    // * толстые гладкие слои, ровная заливка, редкие крупные цветные пятна и
    //   крупный зигзаг оверлока — камнем, резиной, кораллом.
    // Тряпку узнают по тому, что она ТОНКАЯ и мягкая: висит на перекладине
    // как на сушилке, угол гнётся, кромки волнистые; и по ворсу — вся
    // поверхность в мелких коротких волокнах, частые ряды строчки, светлый
    // тонкий оверлок с пухом за контур. Простые формы без мудрений и мягкие
    // тона — то, что игрок выбрал в наброске, трогать нельзя.
    //
    // Чертёж — набросок игрока (прогон 4, v1) один в один: полотно строилось
    // патчем Кунса по четырём кромкам, и ряды, ворс и нитки лежат в его
    // координатах, повторяя изгиб. Сюда он перенесён готовыми путями
    // (BATH_RAG_PATHS внизу файла), а не генератором: у генератора случайные
    // волокна, и повторить ровно тот вид, что выбрал игрок, можно только
    // его же числами. Пути — относительно гнезда мочалки, поэтому вещь едет
    // за гнездом.
    //
    // Две части: main — лист и загнутый угол (на полке за передней сеткой),
    // front — полотно, висящее через перекладину (поверх сетки).
    //
    // Однотипные штрихи одного цвета — ОДНИМ путём (весь ворс цвета, все
    // ряды): вещь в руке — живой слой, и узлов у неё 70, а не сотни. Ни
    // фильтров, ни масок, ни прозрачности группы (docs/traps.md, п. 73):
    // прозрачность только на самих фигурах. id не нужны — клипов и
    // узоров нет. Строка шаблона собирается ОДИН раз и кешируется.
    rag() {
        const A = BATH_ART.slots().cloth;
        if (!this._rag) this._rag = this.ragArt();
        const wrap = (s, cls) => `<g class="bt-cloth ${cls}" transform="translate(${A.x} ${A.y})">${s}</g>`;
        return { main: wrap(this._rag.main, 'bt-cloth-rag'), front: wrap(this._rag.front, 'bt-cloth-rag-flap') };
    },

    // Шаблон тряпки: { main, front } в координатах гнезда.
    ragArt() {
        const P = btPal(), R = P.rag, Ln = P.ragLine, F = P.ragFiber, Sm = P.ragSeam, Lt = P.ragLint;
        const D = BATH_RAG_PATHS, H = STROKE.hairline;
        // Контур тоньше обычного (2.6): толстый делал тряпку тяжёлой и
        // резиновой; тонкий в тёмном тоне самой ткани оставляет её мягкой.
        const W = STROKE.contour * 0.73;
        const fill = (d, c, op) => `<path d="${d}" fill="${c}"${op != null ? ` fill-opacity="${op}"` : ''}/>`;
        const line = (d, c, w, more) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}"${more || ''}/>`;
        const RC = ' stroke-linecap="round"', RJ = ' stroke-linejoin="round"';
        const op = (a) => ` stroke-opacity="${a}"`;
        // Нитки обрезков: светлые, цветные и одна тёмная — в том порядке,
        // в каком лежат пути.
        const LINT = [F[6], Lt.pink, Lt.blue, Lt.teal, Lt.yellow, Lt.red, Lt.green];

        // Полотно: лицо, светотень полупрозрачными полосами (форма без
        // резких границ), ряды строчки (тень и свет рядом — рельеф вязки),
        // ворс трёх тонов, нитки. bands — [цвет, прозрачность] по порядку.
        const panel = (p, face, bands, lint) => fill(p.face, face)
            + p.bands.map((d, i) => fill(d, bands[i][0], bands[i][1])).join('')
            + line(p.rows, Ln.row, H, op(0.6)) + line(p.rowsHi, Ln.rowHi, 0.75 * H, op(0.55))
            + line(p.fibers[0], F[1], 0.92 * H, RC) + line(p.fibers[1], F[3], 0.83 * H, RC) + line(p.fibers[2], F[5], 0.75 * H, RC)
            + p.lint.map((d, i) => line(d, lint[i][0], lint[i][1] * H, RC)).join('');
        // Оверлок: пушистая полоска пунктиром, волосяной зигзаг по ней и пух
        // наружу. Крупный зигзаг читался зубами — здесь амплитуда полединицы.
        const seam = (p) => line(p.seam, Sm[1], 1.4 * STROKE.detail, op(0.35) + ' stroke-dasharray="0.9 0.6"')
            + line(p.seamZ, Sm[0], 0.67 * H, op(0.8)) + line(p.seamFuzz, Sm[1], 0.75 * H, RC);
        const lintFace = [...LINT.map(c => [c, 0.75]), [F[0], 0.83]];

        const S = D.sheet, Fd = D.fold, Fl = D.flap;
        const main = panel(S, R[2], [[R[1], 0.35], [R[1], 0.35], [R[1], 0.3], [R[1], 0.35], [R[3], 0.55],
                // тень, которую загнутый угол кладёт на лицо
                [R[0], 0.45]], lintFace)
            + line(S.fuzz, F[4], 0.83 * H, RC)
            + line(S.face, Ln.ink, W, RJ) + seam(S)
            // Загнутый угол: изнанка светлее лица (с обратной стороны полотно
            // не прокрашено), ряды на ней идут поперёк — как на референсе.
            + panel(Fd, R[4], [[Ln.sheen, 0.25]],
                [[F[7], 0.83], [F[2], 0.83], [Lt.pink, 0.92], [Lt.blue, 0.92], [Lt.yellow, 0.92]])
            + line(Fd.face, Ln.ink, W, RJ) + seam(Fd)
            // Сгиб угла — мягкая светлая дуга без контура: так он гнётся, а
            // не переломлен.
            + line(Fd.crease, Ln.crease, 1.75 * STROKE.structure, RC) + line(Fd.creaseHi, Ln.creaseHi, STROKE.detail, RC);

        const front = panel(Fl, R[2], [[R[1], 0.35], [R[1], 0.4], [R[1], 0.3], [R[1], 0.35], [R[3], 0.9], [R[3], 0.35],
                [R[0], 0.3]], lintFace)
            + line(Fl.fuzz, F[4], 0.83 * H, RC)
            // Контур висящего полотна — открытый: верх лежит на перекладине
            // перегибом, а не кромкой.
            + line(Fl.edge, Ln.ink, W, RJ + RC) + seam(Fl)
            + line(Fl.bend, Ln.bend, 1.3 * STROKE.detail, RC + op(0.9));

        return { main, front };
    },

    // ---------- ОБЩИЙ СТАНОК ПОРОЛОНА (ступени 1 и 2) ----------
    // Кухонная и банная губки — один материал и рисуются одним станком:
    // сплайн силуэта, пористая кромка, ячейки пены по дрожащей сетке,
    // градиенты объёма. Пока станок жил внутри кухонной губки, банной
    // досталась бы его копия, и две копии разошлись бы на первой же правке.
    // Чем губки РАЗНЫЕ (размер и частота ячеек, их светлая стенка, форма),
    // задают числа вызова, а не свой код. Собирается один раз.
    kit() {
        if (this._kit) return this._kit;
        const f = (n) => (Math.round(n * 100) / 100).toString();
        const clamp = (v) => Math.max(0, Math.min(1, v));
        const poly = (Q) => 'M' + Q.map(p => `${f(p[0])} ${f(p[1])}`).join('L') + 'Z';
        const fill = (d, c, op) => d ? `<path d="${d}" fill="${c}"${op != null ? ` fill-opacity="${op}"` : ''}/>` : '';
        const line = (d, c, w, op) => d ? `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${op != null ? ` stroke-opacity="${op}"` : ''}/>` : '';
        // Контур слоя: без скруглённых концов — путь замкнут.
        const ink = (d, c, w) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"/>`;
        // Линейный градиент из угла (0,0) к (x2,y2); stops — [смещение, цвет, прозрачность?].
        const lin = (id, x2, y2, stops) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">`
            + stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('')
            + `</linearGradient>`;

        // Замкнутый Catmull-Rom: точки (для «внутри» и кромок) и кубики (для
        // гладкого контура абразива) — по одним и тем же опорам.
        const cr = (Q, i, t) => {
            const N = Q.length, a = Q[(i - 1 + N) % N], b = Q[i], c = Q[(i + 1) % N], d = Q[(i + 2) % N], t2 = t * t, t3 = t2 * t;
            return [0, 1].map(k => 0.5 * (2 * b[k] + (-a[k] + c[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2
                + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3));
        };
        const crPts = (Q, n) => { const o = []; for (let i = 0; i < Q.length; i++) for (let k = 0; k < n; k++) o.push(cr(Q, i, k / n)); return o; };
        const crPath = (Q) => {
            const N = Q.length; let d = `M${f(Q[0][0])} ${f(Q[0][1])}`;
            for (let i = 0; i < N; i++) {
                const a = Q[(i - 1 + N) % N], b = Q[i], c = Q[(i + 1) % N], e = Q[(i + 2) % N];
                d += `C${f(b[0] + (c[0] - a[0]) / 6)} ${f(b[1] + (c[1] - a[1]) / 6)} ${f(c[0] - (e[0] - b[0]) / 6)} ${f(c[1] - (e[1] - b[1]) / 6)} ${f(c[0])} ${f(c[1])}`;
            }
            return d + 'Z';
        };
        const inside = (Q, x, y) => {
            let c = false;
            for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) {
                const [xi, yi] = Q[i], [xj, yj] = Q[j];
                if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
            }
            return c;
        };
        const edge = (Q, x, y) => {
            let m = 1e9;
            for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) {
                const [ax, ay] = Q[j], dx = Q[i][0] - ax, dy = Q[i][1] - ay;
                const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
                m = Math.min(m, Math.hypot(x - ax - t * dx, y - ay - t * dy));
            }
            return m;
        };
        const bbox = (Q) => ({ x0: Math.min(...Q.map(p => p[0])), y0: Math.min(...Q.map(p => p[1])),
                               x1: Math.max(...Q.map(p => p[0])), y1: Math.max(...Q.map(p => p[1])) });
        // Кромка через равные шаги; jit — дрожь поперёк (пористый край
        // поролона) или null (ровные точки для волосков абразива). jit.nick —
        // доля выщербин внутрь; раз она задана, случай тянется на каждой
        // точке, даже при нуле: так считал набросок банной губки, и край
        // совпадает с выбранным игроком только при том же ходе случая.
        const along = (Q, step, jit) => {
            const o = [];
            for (let i = 0; i < Q.length; i++) {
                const a = Q[i], b = Q[(i + 1) % Q.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
                const n = Math.max(1, Math.round(L / step)), nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
                for (let k = 0; k < n; k++) {
                    if (!jit) { o.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); continue; }
                    const t = k / n; let j = (jit.r() - 0.5) * 2 * jit.amp;
                    if (jit.nick != null && jit.r() < jit.nick) j -= 0.5 + jit.r() * 0.6;
                    o.push([a[0] + (b[0] - a[0]) * t + nx * j, a[1] + (b[1] - a[1]) * t + ny * j]);
                }
            }
            return o;
        };

        // Поры: мелкие частые ячейки по дрожащей сетке. Не «сыр» (редкие
        // крупные дыры) и не «крекер» (ровная сетка одинаковых точек):
        // размер, вытянутость и форма у каждой свои, ячейка — неправильный
        // многоугольник, а не кружок-«кнопка». На свету пор меньше и они
        // бледнее (три корзины по свету — три прозрачности); у части ячеек
        // светлая стенка снизу-справа — ячейка, а не дырка.
        //   o.r — случай; region — многоугольник; step, jx, jy — шаг сетки и
        //   дрожь узла в долях шага; margin — отступ от кромки; light(x, y);
        //   drop(L, u) — выбросить ли ячейку; size(u) — её радиус; e — [от,
        //   разброс] вытянутости; n — меньшее число углов; aj — дрожь угла;
        //   rr — разброс радиуса вершин; mid — граница средней корзины;
        //   rimL, rimP, rimD — где, с какой долей и каким штрихом стенка.
        // Порядок вызовов случая — ровно как в набросках: иначе узор другой.
        const cells = (o) => {
            const r = o.r, bb = bbox(o.region), step = o.step, dark = [[], [], []], rim = [];
            for (let y = bb.y0 + step / 2; y < bb.y1; y += step * 0.87) {
                const row = Math.round((y - bb.y0) / step);
                for (let x = bb.x0 + (row % 2 ? step / 2 : 0); x < bb.x1; x += step) {
                    const px = x + (r() - 0.5) * step * o.jx, py = y + (r() - 0.5) * step * o.jy;
                    if (!inside(o.region, px, py) || edge(o.region, px, py) < o.margin) continue;
                    const L = o.light(px, py);
                    if (o.drop(L, r())) continue;
                    const s = o.size(r()), a = r() * Math.PI, e = o.e[0] + r() * o.e[1];
                    const n = o.n + (r() < 0.5 ? 1 : 0), pts = [];
                    for (let k = 0; k < n; k++) {
                        const t = a + k * 2 * Math.PI / n + (r() - 0.5) * o.aj, rr = s * (0.75 + r() * o.rr);
                        pts.push([px + Math.cos(t) * rr, py + Math.sin(t) * rr * e]);
                    }
                    dark[L > 0.62 ? 0 : L > o.mid ? 1 : 2].push(poly(pts));
                    if (L > o.rimL && r() < o.rimP) rim.push(o.rimD(px, py, s));
                }
            }
            return { dark: dark.map(a => a.join('')), rim: rim.join('') };
        };
        // Случай банной губки. Не btRng: набросок, который выбрал игрок,
        // считан этим генератором (mulberry32), и с другим ходом случая пена
        // легла бы иначе — «похоже», но не та.
        const mulberry = (seed) => {
            let a = seed >>> 0;
            return () => {
                a = (a + 0x6D2B79F5) >>> 0; let t = a;
                t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        };
        // Случай пуфа — Mersenne Twister ровно как random.Random(seed) у
        // Python, вместе с его засевом (init_by_array по одному 32-битному
        // слову, поэтому seed < 2^32) и сборкой random() из двух слов.
        // Набросок пуфа, который выбрал игрок, считан питоном; mulberry или
        // btRng дали бы другую оборку по краю — «похоже», но не та.
        const pyRandom = (seed) => {
            const N = 624, mt = new Uint32Array(N);
            mt[0] = 19650218;
            for (let i = 1; i < N; i++) mt[i] = Math.imul(1812433253, mt[i - 1] ^ (mt[i - 1] >>> 30)) + i;
            let i = 1;
            for (let k = N; k; k--) {
                mt[i] = (mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1664525)) + seed;
                if (++i >= N) { mt[0] = mt[N - 1]; i = 1; }
            }
            for (let k = N - 1; k; k--) {
                mt[i] = (mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1566083941)) - i;
                if (++i >= N) { mt[0] = mt[N - 1]; i = 1; }
            }
            mt[0] = 0x80000000;
            let p = N;
            const u32 = () => {
                if (p >= N) {
                    for (let k = 0; k < N; k++) {
                        const y = (mt[k] & 0x80000000) | (mt[(k + 1) % N] & 0x7fffffff);
                        mt[k] = mt[(k + 397) % N] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
                    }
                    p = 0;
                }
                let y = mt[p++];
                y ^= y >>> 11; y ^= (y << 7) & 0x9d2c5680; y ^= (y << 15) & 0xefc60000;
                return (y ^ (y >>> 18)) >>> 0;
            };
            return () => ((u32() >>> 5) * 67108864 + (u32() >>> 6)) / 9007199254740992;
        };
        // ---- поле и его изолинии (морская губка, ступень 4) ----
        // Градиентный шум Перлина по сиду. Случай — mulberry, и тасовка и
        // векторы берутся в том же порядке, что в наброске игрока: с другим
        // ходом случая поры легли бы иначе — «похоже», но не те.
        const perlin = (seed) => {
            const R = mulberry(seed), p = Array.from({ length: 256 }, (_, i) => i);
            for (let i = 255; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
            const Pm = new Int32Array(512), gx = new Float64Array(256), gy = new Float64Array(256);
            for (let i = 0; i < 512; i++) Pm[i] = p[i & 255];
            for (let i = 0; i < 256; i++) { const a = R() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
            const fade = t => t * t * t * (t * (t * 6 - 15) + 10), lerp = (a, b, t) => a + (b - a) * t;
            const g = (ix, iy, dx, dy) => { const k = Pm[Pm[ix] + iy] & 255; return gx[k] * dx + gy[k] * dy; };
            return (x, y) => {
                const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
                const u = fade(xf), v = fade(yf);
                return lerp(lerp(g(X, Y, xf, yf), g(X + 1, Y, xf - 1, yf), u),
                            lerp(g(X, Y + 1, xf, yf - 1), g(X + 1, Y + 1, xf - 1, yf - 1), u), v) * 1.4;
            };
        };
        // Марширующие квадраты: замкнутые изолинии уровня t поля F (узлы
        // сетки nx×ny с шагом h от x0, y0). «Выше порога» — слева по ходу.
        // Ребро — целое число (2·узел, +1 у вертикального), а не строка, как
        // в наброске: там контуры считались вдесятеро дольше. Порядок обхода
        // (первое ещё не пройденное ребро в порядке появления) — тот же, что
        // у Map наброска, поэтому и начала контуров те же.
        const isolines = (F, x0, y0, nx, ny, h, t) => {
            const W = nx + 1, next = new Int32Array(W * (ny + 1) * 2).fill(-1), order = [], out = [];
            const link = (a, b) => { if (next[a] < 0) order.push(a); next[a] = b; };
            for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
                const k = j * W + i;
                const c = (F[k] - t > 0 ? 8 : 0) | (F[k + 1] - t > 0 ? 4 : 0) | (F[k + W + 1] - t > 0 ? 2 : 0) | (F[k + W] - t > 0 ? 1 : 0);
                const T = 2 * k, Rr = 2 * (k + 1) + 1, B = 2 * (k + W), L = 2 * k + 1;
                switch (c) {
                    case 1: link(L, B); break; case 2: link(B, Rr); break; case 3: link(L, Rr); break;
                    case 4: link(Rr, T); break; case 5: link(L, T); link(Rr, B); break; case 6: link(B, T); break;
                    case 7: link(L, T); break; case 8: link(T, L); break; case 9: link(T, B); break;
                    case 10: link(T, Rr); link(B, L); break; case 11: link(T, Rr); break; case 12: link(Rr, L); break;
                    case 13: link(Rr, B); break; case 14: link(B, L); break;
                }
            }
            const pt = (e) => {
                const n = e >> 1, i = n % W, j = (n - i) / W, a = F[n] - t, b = (e & 1 ? F[n + W] : F[n + 1]) - t, s = a / (a - b);
                return e & 1 ? [x0 + i * h, y0 + (j + s) * h] : [x0 + (i + s) * h, y0 + j * h];
            };
            for (const s0 of order) {
                if (next[s0] < 0) continue;
                let k = s0; const loop = [];
                while (next[k] >= 0) { const n = next[k]; next[k] = -1; loop.push(pt(k)); k = n; if (k === s0) break; }
                if (loop.length > 3) out.push(loop);
            }
            return out;
        };
        const area = (Q) => Q.reduce((s, p, i) => { const q = Q[(i + 1) % Q.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
        // Прореживание замкнутого контура (Рамер — Дуглас — Пекер), две
        // половины по отдельности: точки, отходящие от хорды меньше eps, лишние.
        const simplify = (Q, eps) => {
            const open = (S) => {
                const seg = (a, b) => {
                    let dmax = 0, k = -1; const [ax, ay] = S[a], [bx, by] = S[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
                    for (let i = a + 1; i < b; i++) { const d = Math.abs((S[i][0] - ax) * dy - (S[i][1] - ay) * dx) / L; if (d > dmax) { dmax = d; k = i; } }
                    return dmax > eps ? [...seg(a, k).slice(0, -1), ...seg(k, b)] : [S[a], S[b]];
                };
                return seg(0, S.length - 1);
            };
            const m = Q.length >> 1, a = open(Q.slice(0, m + 1)), b = open(Q.slice(m).concat([Q[0]]));
            return [...a.slice(0, -1), ...b.slice(0, -1)];
        };
        return (this._kit = { f, clamp, poly, fill, line, ink, lin, crPts, crPath, inside, edge, bbox, along, cells, mulberry, pyRandom,
                              perlin, isolines, area, simplify });
    },

    // Шаблон на гнездо. Градиенты ищутся по id, а вещь бывает в документе
    // дважды (полка и рука) — поэтому '@ID' в шаблоне у каждого вызова свой.
    stamp(tpl, cls, pfx) {
        const A = BATH_ART.slots().cloth, id = pfx + (this._kid = (this._kid || 0) + 1);
        return `<g class="bt-cloth ${cls}" transform="translate(${A.x} ${A.y})">${tpl.split('@ID').join(id)}</g>`;
    },

    // ---------- 1. НОВАЯ КУХОННАЯ ГУБКА ----------
    // Жёлтый поролоновый брусок плашмя, зелёный абразив сверху, вид чуть
    // сверху — «первая ассоциация у простого человека». Набросок игрока
    // (прогон губки, v1) один в один.
    //
    // Что было до и почему теперь так. Запечённая 3д-губка: абразив читался
    // газоном (стебли торчком), поролон — сыром (редкие крупные дыры разного
    // вида), контур толстый чёрный, форма — твёрдая коробка. Губку узнают
    // по двум слоям РАЗНОЙ природы в пропорции ~1:4, склеенным по прямой:
    // поролон — мелкие частые поры по ВСЕЙ площади (на свету реже и
    // бледнее), абразив — спутанный войлок из коротких волокон во все
    // стороны, низкого контраста, с волосками за контур. Кромка поролона
    // чуть дрожит (пористый край), углы скруглены — брусок мягкий.
    //
    // В отличие от тряпки, сюда перенесён ГЕНЕРАТОР наброска, а не его
    // выхлоп: пути поролона и войлока — это сотни мелких ячеек, готовыми
    // данными они весили бы 150 КБ. Случай детерминированный (btRng с теми
    // же семенами и в том же порядке вызовов, что в наброске), поэтому вид
    // одинаков между запусками и совпадает с выбранным игроком. Считается
    // один раз (~полмиллисекунды на тысячу ячеек) и кешируется.
    //
    // Однотипные штрихи одного цвета — одним путём: вся губка — 20 путей.
    // Без фильтров, масок и прозрачности группы (docs/traps.md, п. 73).
    // Градиенты нужны (мягкий объём без ступенек), отсюда свои id (stamp).
    kitchen() {
        if (!this._kitchen) this._kitchen = this.kitchenArt();
        return this.stamp(this._kitchen, 'bt-cloth-kitchen', 'bck');
    },

    // Шаблон губки в координатах гнезда; '@ID' — место под id градиентов.
    kitchenArt() {
        const P = btPal(), Y = P.sponge, G = P.scour, H = STROKE.hairline;
        const { f, clamp, poly, fill, line, ink, lin, crPts, crPath, inside, edge, bbox, along, cells } = this.kit();

        // Чертёж наброска относительно гнезда (573, 492): поролон, абразив и
        // светлая верхняя грань абразива — опоры сплайна.
        const foamK = [[-20, -16], [24, -17.5], [68, -16], [72.5, 10], [68.5, 35], [24, 37], [-20.5, 35], [-24.5, 10]];
        const greenK = [[-17, -28.5], [25, -30.5], [66, -28.5], [72, -23.5], [71.8, -17], [67, -12.5], [24, -11.5],
                        [-19, -12.5], [-23.8, -17], [-23.5, -23.5]];
        const topK = [[-16, -27.7], [25, -29.7], [65, -27.7], [70.8, -23], [25, -20.4], [-22, -23]];
        // Свет сверху-слева: 1 — свет, 0 — тень.
        const light = (x, y) => clamp(1.15 - (x + 23) / 95 * 0.6 - (y + 16) / 52 * 0.75);
        const foam = crPts(foamK, 8), green = crPts(greenK, 8);
        const foamD = poly(along(foam, 1.6, { r: btRng(12), amp: 0.24 }));

        // Поры кухонного поролона: мелкие угловатые четырёх-пятиугольники,
        // светлая стенка только там, куда падает свет.
        const pores = cells({ r: btRng(13), region: foam, step: 1.8, jx: 0.9, jy: 0.8, margin: 1.2, light,
            drop: (L, u) => u < 0.18 + L * 0.3, size: (u) => 0.5 * (0.6 + u * 0.8),
            e: [0.55, 0.45], n: 4, aj: 0.7, rr: 0.5, mid: 0.32, rimL: 0.3, rimP: 0.35,
            rimD: (x, y, s) => `M${f(x - s * 0.7)} ${f(y + s * 0.55)}q${f(s * 0.7)} ${f(s * 0.55)} ${f(s * 1.4)} ${f(-s * 0.2)}` });

        // Войлок абразива: короткие изогнутые волокна во ВСЕ стороны, разной
        // длины. Стебли вверх читались газоном, одинаковые чёрточки —
        // посыпкой. Три тона; светлые — только на свету.
        const felt = (() => {
            const r = btRng(14), bb = bbox(green), dk = [], md = [], lt = [];
            for (let y = bb.y0; y < bb.y1; y += 1) for (let x = bb.x0; x < bb.x1; x += 1) {
                const px = x + (r() - 0.5), py = y + (r() - 0.5);
                if (!inside(green, px, py) || edge(green, px, py) < 0.7) continue;
                const L = light(px, py);
                const len = 1.1 + r() * 1.3, a = r() * Math.PI * 2, bend = (r() - 0.5) * 1.6;
                const ex = Math.cos(a) * len, ey = Math.sin(a) * len;
                const s = `M${f(px - ex / 2)} ${f(py - ey / 2)}q${f(ex / 2 - Math.sin(a) * bend)} ${f(ey / 2 + Math.cos(a) * bend)} ${f(ex)} ${f(ey)}`;
                const q = r();
                if (q < 0.45 - L * 0.2) dk.push(s); else if (q < 0.8) md.push(s); else if (r() < L * 0.9) lt.push(s);
            }
            return { dk: dk.join(''), md: md.join(''), lt: lt.join('') };
        })();

        // Лохматая кромка: волоски абразива выбиваются за контур наружу.
        const fringe = (() => {
            const r = btRng(15), c = along(green, 1.1, null), o = [];
            for (let i = 1; i < c.length - 1; i++) {
                if (r() > 0.55) continue;
                const [x, y] = c[i], [ax, ay] = c[i - 1], [bx, by] = c[i + 1];
                let nx = by - ay, ny = -(bx - ax); const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
                const a = Math.atan2(ny, nx) + (r() - 0.5) * 1.6, len = 0.9 + r() * 1.3;
                const qx = Math.cos(a) * len * 0.5 + (r() - 0.5), qy = Math.sin(a) * len * 0.5 + (r() - 0.5);
                o.push(`M${f(x - nx * 0.6)} ${f(y - ny * 0.6)}q${f(qx)} ${f(qy)} ${f(Math.cos(a) * len)} ${f(Math.sin(a) * len)}`);
            }
            return o.join('');
        })();

        // Тень, которую абразив кладёт на поролон под швом: четыре
        // полупрозрачные полосы разной глубины вместо одной — мягкий спад,
        // без ступеньки. Шов чуть провисает к краям (брусок выпуклый).
        const glue = [];
        for (let x = -23.5; x <= 72.6; x += 4) { const t = (x - 24) / 48; glue.push([x, -11 - 1.6 * t * t]); }
        const shadow = [1, 0.75, 0.5, 0.28].map(k =>
            fill(poly(glue.concat(glue.map(([x, y]) => [x, y + 8 * k]).reverse())), Y[0], 0.13)).join('');
        const greenD = crPath(greenK);

        // Контур тонкий и в тёмном тоне своего слоя, а не чёрный: чёрный
        // толстый делал губку твёрдой коробкой (так же у тряпки).
        return `<defs>`
            + lin('@ID-fy', 0.35, 1, [[0, Y[3]], [0.45, Y[2]], [1, Y[1]]])
            // Поперечный объём поролона: свет слева, тень справа, середина чистая.
            + lin('@ID-fx', 1, 0, [[0, Y[4], 0.55], [0.3, Y[4], 0], [0.7, Y[0], 0], [1, Y[0], 0.4]])
            + lin('@ID-g', 0.3, 1, [[0, G[3]], [0.5, G[2]], [1, G[1]]]) + `</defs>`
            + fill(foamD, 'url(#@ID-fy)') + fill(foamD, 'url(#@ID-fx)')
            + fill(pores.dark[0], P.spongePore, 0.28) + fill(pores.dark[1], P.spongePore, 0.45) + fill(pores.dark[2], P.spongePore, 0.6)
            + line(pores.rim, P.spongeLit, 0.8 * H, 0.55)
            + shadow
            + ink(foamD, P.spongeInk, STROKE.contour * 0.77)
            + fill(greenD, 'url(#@ID-g)')
            // Верхняя грань абразива — светлее боковой полосы: вид чуть сверху.
            + fill(crPath(topK), G[4], 0.5) + line('M-22.5 -22.5C2 -19.8 47 -19.8 71.5 -22.5', G[1], STROKE.detail, 0.35)
            + line(felt.dk, P.scourFuzz, 1.15 * H, 0.5) + line(felt.md, G[3], 1.15 * H, 0.55) + line(felt.lt, P.scourLit, H, 0.5)
            + line(fringe, G[1], 1.2 * H)
            + ink(greenD, P.scourInk, STROKE.contour * 0.5)
            // Блик по левой кромке поролона: мягкий объём, а не грань.
            + line('M-21.4 28C-22.6 18 -22.4 4 -21 -6', P.spongeLit, STROKE.contour * 0.5, 0.55);
    },

    // ---------- 2. БАННАЯ ГУБКА ----------
    // Бирюзовая «косточка» с талией — набросок игрока (прогон банной губки,
    // круг 2, v5) один в один: генератор тот же, семена те же.
    //
    // Что было до и почему теперь так. Круг 1 был розовым: тёмные поры-пятна
    // на розовом читались мясом с прожилками, гладкое розовое — мылом. Банную
    // губку узнают по ОТКРЫТЫМ ячейкам пены: мелкие тёмные дырочки
    // (0,3–0,9 единицы), у половины светлая стенка снизу-справа, часто и
    // ровно по всей площади, в тени чуть гуще. Ни одного пятна крупнее
    // ячейки и ни одной тени темнее тела шире ячейки — объём дают только
    // светлые градиенты. От кухонной губки ступени 1 её отличают силуэт
    // (талия сверху и снизу — классическая банная губка), цвет (бирюза не
    // спорит ни с жёлтой губкой, ни с кожей червя, ни с мясом) и один слой
    // без абразива.
    //
    // Устроена как кухонная: генератор, а не выхлоп (ячеек тысяча с лишним),
    // считается один раз и кешируется; однотипное — одним путём (9 путей);
    // без фильтров, масок и прозрачности группы.
    bath() {
        if (!this._bath) this._bath = this.bathArt();
        return this.stamp(this._bath, 'bt-cloth-bath', 'bcb');
    },

    // Шаблон банной губки в координатах гнезда; '@ID' — место под id градиентов.
    bathArt() {
        const P = btPal(), T = P.bathSponge, Lit = P.bathSpongeLit, H = STROKE.hairline;
        const { f, clamp, poly, fill, line, ink, lin, crPts, along, cells, mulberry } = this.kit();
        // Силуэт «косточки»: по две подушки слева и справа, талия посередине
        // сверху и снизу — опоры сплайна относительно гнезда (573, 492).
        const K = [[-23, 20], [-24, 0], [-21, -18], [-10, -28], [4, -28.5], [15, -23.5], [25, -21], [35, -23.5], [46, -28.5],
                   [60, -28], [71, -18], [74, 0], [73, 20], [66, 34], [50, 37.5], [25, 34], [0, 37.5], [-16, 34]];
        const body = crPts(K, 7);
        // Свет сверху-слева: 1 — свет, 0 — тень.
        const light = (x, y) => clamp(1.1 - (x + 23) / 97 * 0.55 - (y + 26) / 64 * 0.8);
        const D = poly(along(body, 1.3, { r: mulberry(61), amp: 0.22, nick: 0 }));
        // Пена: ячейки мельче и чаще кухонных, пяти-шестиугольные (кругловатая
        // полость, а не угловатая крошка), светлая стенка у половины по всей
        // площади — дырка в пене, а не крапина.
        const fo = cells({ r: mulberry(62), region: body, step: 1.55, jx: 0.8, jy: 0.7, margin: 1.1, light,
            drop: (L, u) => u > 0.9 - L * 0.25, size: (u) => 0.32 + Math.pow(u, 1.8) * 0.55,
            e: [0.65, 0.35], n: 5, aj: 0.5, rr: 0.45, mid: 0.34, rimL: -1, rimP: 0.55,
            rimD: (x, y, s) => `M${f(x - s * 0.9)} ${f(y + s * 0.5)}Q${f(x)} ${f(y + s * 1.5)} ${f(x + s * 1.05)} ${f(y + s * 0.2)}` });

        return `<defs>`
            + lin('@ID-y', 0.3, 1, [[0, T[3]], [0.5, T[2]], [1, T[1]]])
            // Поперечный объём: свет слева, тень справа, середина чистая.
            + lin('@ID-x', 1, 0, [[0, T[4], 0.5], [0.28, T[4], 0], [0.72, T[0], 0], [1, T[0], 0.3]]) + `</defs>`
            + fill(D, 'url(#@ID-y)') + fill(D, 'url(#@ID-x)')
            + fill(fo.dark[0], P.bathSpongePore, 0.35) + fill(fo.dark[1], P.bathSpongePore, 0.5) + fill(fo.dark[2], P.bathSpongePore, 0.62)
            + line(fo.rim, Lit, f(H * 2 / 3), 0.7)
            // Блики на двух верхних подушках — пышность, а не плоский брусок.
            + line('M-17 -17Q-10 -25.5 1 -25.3M32 -21.6Q39 -26 48 -25.8', Lit, 2 * H, 0.7)
            // Контур тонкий, в тёмном тоне самой губки (как у ступеней 0 и 1).
            + ink(D, P.bathSpongeInk, f(STROKE.contour * 0.7))
            // Блик по левой кромке: мягкий объём, а не грань.
            + line('M-20.6 24C-21.8 12 -21.6 -1 -19.8 -11', Lit, 2 * H, 0.5);
    },

    // ---------- 3. СЕТКА-ПУФ ----------
    // Фиолетовый шар из собранной пластиковой сетки с белым шнурком-петлёй,
    // перевешенной через перекладину корзины. Набросок игрока (прогон пуфа,
    // круг 2, w1) один в один: генератор тот же, сид тот же.
    //
    // Что держит вещь и чего нельзя потерять. Кромка БЕЗ контура: плотность
    // полная в середине (там много слоёв сетки) и сходит почти на нет к
    // краю, так что край просвечивает и читается только нитью сетки на
    // просвет — это и есть мягкость и воздушность. Обводка по краю (даже
    // тонкая) делала шар плотным комом. Внутренних фигур нет: складки и
    // слои поверх шара читались цветком, капустой, ракушкой; держат светотень
    // шара и ОДНА ромбическая сетка по всей площади. В середине её приглушает
    // вуаль — слоёв много, отдельные нити тонут, остаётся фактура. Цвет —
    // фиолетовый: не спорит ни с жёлтой (1) и бирюзовой (2) губками, ни с
    // мылом, ни с розовой кожей червя.
    //
    // Две части: main — шар и узелок (в корзине, за передней сеткой),
    // front — петля через перекладину (поверх сетки). Фигур 8 (и два пути
    // узора): сетка — узором, а не сотнями линий; без фильтров, масок и прозрачности группы (traps, п. 73).
    // Шаблон считается один раз; градиенты и узор со своими id (stamp).
    puff() {
        if (!this._puff) this._puff = this.puffArt();
        return { main: this.stamp(this._puff.main, 'bt-cloth-puff', 'bcp'),
                 front: this.stamp(this._puff.front, 'bt-cloth-puff-loop', 'bcp') };
    },

    // Шаблон пуфа { main, front } в координатах гнезда (573, 492).
    puffArt() {
        const P = btPal(), U = P.puff, H = STROKE.hairline, A = BATH_ART.slots().cloth;
        const { f, fill, line, pyRandom } = this.kit();

        // Силуэт — шар с мелкой оборкой: 34 бугорка по эллипсу, вершины
        // впадин чуть гуляют по углу, высота бугра у каждого своя. Дуга
        // бугра — квадратичная, проведённая ЧЕРЕЗ вершину бугра (контрольная
        // точка = 2·вершина − середина хорды). Ход случая — как в наброске:
        // сначала все углы, потом высоты.
        const cx = 25, cy = 1, rx = 44, ry = 37, n = 34, amp = 1.8, jit = 0.6;
        const r = pyRandom(5), u = (a, b) => a + (b - a) * r();
        const angs = [];
        for (let i = 0; i < n; i++) angs.push(2 * Math.PI * (i + u(-jit, jit) * 0.5) / n);
        const pt = (a, k) => [cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)];
        const vs = angs.map(a => pt(a, 1));
        let D = `M${f(vs[0][0])} ${f(vs[0][1])}`;
        for (let i = 0; i < n; i++) {
            const a0 = angs[i], a1 = angs[(i + 1) % n] + (angs[(i + 1) % n] < a0 ? 2 * Math.PI : 0);
            const [ax, ay] = pt((a0 + a1) / 2, 1 + amp * u(0.6, 1.3) / Math.min(rx, ry));
            const v0 = vs[i], v1 = vs[(i + 1) % n];
            D += `Q${f(2 * ax - (v0[0] + v1[0]) / 2)} ${f(2 * ay - (v0[1] + v1[1]) / 2)} ${f(v1[0])} ${f(v1[1])}`;
        }
        D += 'Z';

        // Радиальный градиент по габариту шара; stops — [смещение, цвет, прозрачность].
        const rad = (id, x, y, rr, stops) => `<radialGradient id="${id}" cx="${x}" cy="${y}" r="${rr}">`
            + stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')
            + `</radialGradient>`;
        // Сетка: ромбы 2,8 единицы — пара «тёмная нить + светлый блик»,
        // блик сдвинут ПОПЕРЁК нити вверх, к свету. Каждая нить продолжена
        // копиями на ±шаг: иначе у края плитки она обрывалась и на крупном
        // плане проступали швы квадратами (правка наброска). Плитка стоит от
        // начала СЦЕНЫ (x, y узора = −гнездо), как лежала в наброске.
        const s = 2.8, dk = [], lt = [];
        for (const c of [-s, 0, s]) {
            dk.push(`M-1 ${f(-1 + c)}L${f(s + 1)} ${f(s + 1 + c)}M-1 ${f(s + 1 + c)}L${f(s + 1)} ${f(-1 + c)}`);
            lt.push(`M-1 ${f(-1.6 + c)}L${f(s + 1)} ${f(s + 0.4 + c)}M-1 ${f(s + 0.4 + c)}L${f(s + 1)} ${f(-1.6 + c)}`);
        }
        const net = `<pattern id="@ID-n" patternUnits="userSpaceOnUse" x="${-A.x}" y="${-A.y}" width="${s}" height="${s}">`
            + `<path d="${dk.join('')}" fill="none" stroke="${U[0]}" stroke-width="${H}" stroke-opacity="0.75"/>`
            + `<path d="${lt.join('')}" fill="none" stroke="${U[4]}" stroke-width="${f(0.75 * H)}" stroke-opacity="0.55"/>`
            + `</pattern>`;

        // Числа градиентов — те, что стояли в выхлопе наброска (он округлял до
        // десятой), а не в его исходнике: игрок выбирал картинку.
        const main = `<defs>`
            // Плотность: полная в середине, к кромке почти пусто — край просвечивает.
            + rad('@ID-d', 0.5, 0.5, 0.5, [[0, U[1], 1], [0.6, U[1], 1], [0.8, U[2], 0.3], [1, U[2], 0.1]])
            // Свет сверху-слева.
            + rad('@ID-l', 0.4, 0.3, 0.4, [[0, U[3], 0.9], [0.5, U[3], 0.5], [1, U[3], 0]])
            // Тень снизу-справа кольцом; у самой кромки гаснет, чтобы та
            // осталась светлой и прозрачной.
            + rad('@ID-t', 0.4, 0.3, 0.8, [[0, U[0], 0], [0.5, U[0], 0], [0.7, U[0], 0.7], [0.9, U[0], 0.3], [1, U[0], 0]])
            // Вуаль над сеткой в середине: нити тонут, остаётся фактура.
            + rad('@ID-v', 0.5, 0.5, 0.5, [[0, U[1], 0.5], [0.5, U[1], 0.3], [0.7, U[1], 0]])
            + net + `</defs>`
            + fill(D, 'url(#@ID-d)') + fill(D, 'url(#@ID-n)') + fill(D, 'url(#@ID-v)')
            + fill(D, 'url(#@ID-l)') + fill(D, 'url(#@ID-t)')
            // Узелок шнурка — справа внизу шара.
            + `<ellipse cx="53" cy="16" rx="4" ry="3.2" fill="${P.puffCord}" stroke="${P.puffCordInk}" stroke-width="${STROKE.detail}"/>`;

        // Петля через перекладину — трубка: тёмная обводка и светлая жила.
        const loop = 'M53 17C57 30 56 46 50 54C44 61 36 56 38 46C40 36 47 24 51 18', w = 2.2 * STROKE.detail;
        const front = line(loop, P.puffCordInk, f(w + 2 * STROKE.detail)) + line(loop, P.puffCord, f(w));
        return { main, front };
    },

    // ---------- 4. МОРСКАЯ ГУБКА ----------
    // Натуральная губка тёплого жёлто-абрикосового цвета: округлый ком,
    // приплюснутый дном корзины, весь в мелких частых порах. Набросок игрока
    // (круг «один паттерн», u2) один в один: генератор тот же, сид тот же.
    //
    // Что держит вещь и чего нельзя потерять — принцип игрока: ОДИН рисунок
    // пор от центра до края. Меняются только его параметры по положению на
    // форме, а не сам рисунок: в центре провалы раскрыты и глубже всего, к
    // краю сжаты ракурсом купола, мельче, светлее и прозрачнее — контраст
    // падает к кромке сам. Силуэт — контур того же поля у кромки: где к краю
    // подошёл провал, он чуть проседает, где гребень — чуть выступает, а
    // светлая полупрозрачная кромка сверху гасит неровность.
    //
    // Что было до и почему теперь так (около тридцати вариантов, sp4b):
    // * тёмная подложка с «плёнкой» гребней поверх и редкие крупные тёмные
    //   дыры читались выпечкой — печенье, булка, крекер, крампет;
    // * шипы, лопасти и пучки по краю — ежом и дурианом, окантовка — плотным
    //   комом;
    // * провалы, гаснущие у края в ноль, давали пустую гладкую кромку —
    //   «булку». Поэтому у кромки провал остаётся, только светлый;
    // * крупные ячейки к центру — «сыр/хлеб». Игрок выбрал мелкие поры:
    //   «без крупных провалов, более однородный».
    //
    // Устроено как кухонная губка: переносится ГЕНЕРАТОР, а не выхлоп —
    // выхлоп наброска весил 178 КБ. Поры — изолинии поля шума, провал —
    // вложенные уровни того же поля (глубже — темнее и чуть сдвинут к свету:
    // верхняя стенка в тени). Цвет уровня — градиент ОТ ЦЕНТРА губки. Считается
    // один раз и кешируется. Все поры одного уровня — ОДНИМ путём: 6 фигур
    // на всю губку; без фильтров, масок и прозрачности группы (traps, п. 73) —
    // прозрачность только в стопах градиентов. Тени на дне нет — в руке и на
    // иконке ей неоткуда взяться, а на полке её не было и в наброске.
    sea() {
        if (!this._sea) this._sea = this.seaArt();
        return this.stamp(this._sea, 'bt-cloth-sea', 'bcs');
    },

    // Шаблон морской губки в координатах гнезда; '@ID' — место под id градиентов.
    seaArt() {
        const C = btPal().seaSponge, { f, mulberry, perlin, isolines, area, simplify } = this.kit();
        // Рампа тёмное → светлое (palette.js): дно пор, тень шара, стенка
        // глубокого уровня, провал в центре, провал у кромки, провал на
        // полпути, тело, кромка, свет.
        const [deep, shade, deepWall, pit, edgePit, pitWall, body, rim, light] = C;
        // Набросок считался в координатах СЦЕНЫ вокруг гнезда (573, 492), и
        // волокна шума берут абсолютные x, y — поэтому поле считается там же,
        // а гнездо вычитается на выходе.
        const O = [573, 492];
        // Форма: округлый ком чуть шире высоты, низ приплюснут дном корзины.
        const cx = 597, cy = 488, rx = 46, ry = 36, floor = 521;
        const seed = 41, freq = 13, h = 0.34;
        const R = mulberry(seed), ph = [R() * 6.3, R() * 6.3, R() * 6.3];
        const N1 = perlin(seed + 1), N2 = perlin(seed + 2), N3 = perlin(seed + 3);
        // Нормированный «радиус» точки в коме с наплывами; ниже дна — резко наружу.
        const shapeR = (x, y) => {
            const u = (x - cx) / rx, v = (y - cy) / ry, a = Math.atan2(v, u);
            const k = 1 + 0.06 * Math.sin(3 * a + ph[0]) + 0.035 * Math.sin(5 * a + ph[1]) + 0.02 * Math.sin(8 * a + ph[2]);
            let r = Math.hypot(u, v) / k;
            if (y > floor) r += (y - floor) / ry * 2.2;
            return r;
        };
        const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

        // Поле пор: гребнистый шум на куполе — высокое материал, низкое
        // провал. Float32, как в наброске: на нём лежат изолинии, и с другой
        // точностью контуры сдвинулись бы на волос.
        const x0 = cx - rx * 1.12, y0 = cy - ry * 1.14, nx = Math.ceil(rx * 2.24 / h), ny = Math.ceil((floor + 3 - y0) / h), W = nx + 1;
        const Pf = new Float32Array(W * (ny + 1)), G = new Float32Array(W * (ny + 1)), Rr = new Float64Array(W * (ny + 1));
        const inside = new Float64Array(W * (ny + 1));
        let nIn = 0;
        for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
            const x = x0 + i * h, y = y0 + j * h, r = shapeR(x, y), k = j * W + i;
            // Ракурс купола: к кромке рисунок сжат; за кромкой продолжается.
            const rho = r < 0.999 ? Math.asin(r) / (Math.PI / 2) : 1 + (r - 0.999) * 3, s = r > 0 ? rho / r : 1;
            const u = (x - cx) / rx * s, v = (y - cy) / ry * s;
            const n = N1(u * freq + 11.3, v * freq * 0.9 + 3.7) + 0.35 * N2(u * freq * 2.1 + 5.1, v * freq * 2.1 + 8.2);
            let val = 1 - Math.abs(n) + 0.05 * N3(x * 2.2, y * 2.2);
            val += 0.08 * sstep(0.5, 1.02, r);               // к краю провалы мельче и реже — тот же рисунок
            val -= 0.06 * (1 - Math.min(r, 1));               // в центре — раскрыты
            if (r < 0.9) inside[nIn++] = val;
            Pf[k] = val + 6 * Math.max(0, r - 0.985);         // за силуэтом провалов нет
            G[k] = val; Rr[k] = r;
        }
        // Порог — по доле площади: провалы занимают половину губки.
        const t = inside.subarray(0, nIn).sort()[Math.floor(nIn * 0.5)];
        // Силуэт — кромка r = 1, чуть проседающая там, где к ней подошёл провал.
        for (let k = 0; k < G.length; k++) G[k] = (1 - Rr[k]) * 14 + 0.6 * Math.max(-0.4, Math.min(0.3, G[k] - t));
        const loops = (F, lev, minA) => isolines(F, x0, y0, nx, ny, h, lev).filter(L => Math.abs(area(L)) > minA).map(L => simplify(L, 0.12));

        // Контур → путь: квадратичный сплайн через середины отрезков, опоры —
        // точки контура (как в наброске). У такого сплайна следующая опора —
        // ровно отражение предыдущей через середину, то есть то, что
        // подставляет команда t: после первой q идут одни t, по паре чисел на
        // точку вместо четырёх. Опоры округлены до десятой, как в наброске;
        // середины тогда лежат на сетке 0,05 точно и отражение не копит
        // ошибку. Числа в двадцатых долях — целые, пишутся относительными.
        // Двадцатые доли → «-1.35», «.4», «2»: без ведущего нуля и без
        // регулярок — чисел тринадцать тысяч, и строка с регуляркой стоила
        // заметную долю всей сборки.
        const num = (v) => {
            const c = Math.abs(v) * 5, i = Math.floor(c / 100), r = c - i * 100;
            const fr = r === 0 ? '' : r % 10 === 0 ? '.' + r / 10 : r < 10 ? '.0' + r : '.' + r;
            return (v < 0 ? '-' : '') + (i || !fr ? i : '') + fr;
        };
        const paths = (Ls, dx, dy) => {
            let d = '', prev = null, at = [0, 0];
            const cmd = (c) => { d += c; prev = null; };
            const put = (v) => {
                const s = num(v);
                // Разделитель нужен, только если число иначе слипнется с прошлым.
                if (prev != null && (/\d/.test(s[0]) || (s[0] === '.' && prev.indexOf('.') < 0))) d += ' ';
                d += s; prev = s;
            };
            for (const L of Ls) {
                if (L.length < 3) continue;
                const q = L.map(p => [Math.round((p[0] + dx - O[0]) * 10) * 2, Math.round((p[1] + dy - O[1]) * 10) * 2]), n = q.length;
                const m = (i) => { const a = q[(i + n) % n], b = q[(i + 1) % n]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
                const s = m(n - 1), m0 = m(0);
                cmd('m'); put(s[0] - at[0]); put(s[1] - at[1]);
                cmd('q'); put(q[0][0] - s[0]); put(q[0][1] - s[1]); put(m0[0] - s[0]); put(m0[1] - s[1]);
                cmd('t');
                for (let i = 1; i < n; i++) { const a = m(i - 1), b = m(i); put(b[0] - a[0]); put(b[1] - a[1]); }
                cmd('z'); at = s;
            }
            return d;
        };
        const B = paths(loops(G, 0, 20), 0, 0);
        // Провал — НИЖЕ порога: изолинии поля «−P» выше «−t». Второй уровень
        // глубже на 0,16 и сдвинут к свету: верхняя стенка поры в тени.
        const NP = Pf.map(v => -v);
        const lev = [{ dt: 0, minA: 0.5, c0: pit, c1: pitWall }, { dt: 0.16, minA: 0.3, dx: -0.3, dy: -0.4, c0: deep, c1: deepWall }]
            .map(L => ({ ...L, d: paths(loops(NP, -(t - L.dt), L.minA), L.dx || 0, L.dy || 0) }));

        // Градиенты — в координатах гнезда (userSpaceOnUse: группа stamp сдвигает их вместе с вещью).
        const X = (v) => f(v - O[0]), Y = (v) => f(v - O[1]);
        const radial = (id, stops, x, y, r) => `<radialGradient id="@ID-${id}" gradientUnits="userSpaceOnUse" cx="${X(x)}" cy="${Y(y)}" r="${f(r)}">`
            + stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('') + `</radialGradient>`;
        const gx = cx, gy = cy - 2, gr = rx * 1.02, lx = cx - rx * 0.45, ly = cy - ry * 0.55;
        const use = (g) => `<use href="#@ID-B" fill="url(#@ID-${g})"/>`;
        return `<defs><path id="@ID-B" d="${B}"/>`
            // Тело: ровный тёплый цвет, к кромке светлее и прозрачнее — просвечивает.
            + radial('b', [[0, body], [0.72, body], [0.9, rim, 0.85], [1, rim, 0.45]], gx, gy, gr)
            // Уровни провала: в центре тёмные, к краю почти цвет тела и
            // полупрозрачные — у кромки провал есть, но не спорит с ней.
            + lev.map((L, k) => radial('p' + k, [[0, L.c0], [0.55, L.c1], [1, edgePit, 0.55]], gx, gy, gr)).join('')
            // Объём шара — накладками: свет сверху-слева, тень снизу-справа.
            + radial('l', [[0, light, 0.5], [0.55, light, 0]], lx, ly, rx * 1.3)
            + radial('s', [[0.5, shade, 0], [1, shade, 0.35]], lx, ly, rx * 1.9)
            // Кромка: светлая полупрозрачная — гасит неровность и контраст пор у края.
            + radial('e', [[0.82, rim, 0], [1, rim, 0.45]], gx, gy, gr)
            + `</defs>` + use('b')
            + lev.map((L, k) => `<path d="${L.d}" fill="url(#@ID-p${k})" fill-rule="evenodd"/>`).join('')
            + use('s') + use('l') + use('e');
    },

    // ---------- 5. ПУФ-ОБОРКА ----------
    // Пышная мочалка из бирюзовой сетки: шар, собранный из коротких лент,
    // у каждой ленты сиреневая кромка, сзади торчит белый шнурок. Набросок
    // игрока (тренировка художника, t16) один в один: генератор тот же, ход
    // случая тот же. Слепой судья: «мочалка», край мягкий, глубокий.
    //
    // Что держит вещь (docs/bench/artist.md, art-pair.md; карта
    // прозрачности — заметки художника к t16):
    // * СЕТКА — ДЫРКИ, а не наклейка: ячейка — тёмная дыра, нить — светлый
    //   промежуток, узор повёрнут вдоль ленты и крупнее у крупных. Сквозь
    //   дыру видна следующая лента — поэтому провал между лентами тоже сетка,
    //   только глубже, а не пустая чёрная фигура.
    // * ТРИ СЛОЯ ГЛУБИНЫ: подмалёвок шара (плотный в середине, к краю в
    //   прозрачность), слой 2 — те же ленты, сдвинутые вглубь и потемневшие
    //   (у верха почти чёрные: свет туда не доходит), и лицевые ленты.
    // * ПРОЗРАЧНОСТЬ ПО ЧИСЛУ СЛОЁВ на луче взгляда: кайма из бугров силуэта
    //   — две фигуры (чётные и нечётные бугры), в нахлёсте плотнее сама;
    //   сверху-слева кайма светлая и прозрачная, снизу-справа плотная. Если
    //   высветлить всё — туман, если сделать прозрачным всё — нет объёма.
    // * Край пушистый: петельки-нити по силуэту, со стороны света светлее.
    //
    // Жить в игре: без фильтров, масок и прозрачности групп (traps, п. 73) —
    // прозрачность только на фигурах и в стопах. Один клип стоит на группе
    // слоя 2 (без прозрачности это не отдельный буфер смешивания): без него
    // сдвинутые вглубь ленты вылезали бы за силуэт. Классы наброска (.e, .q)
    // возвращены в атрибуты: <style> во встроенном svg действует на весь
    // документ, а вставка стиля заставляет пересчитать стили всей страницы —
    // вещь же вставляется заново при каждом подъёме в руку. Слой 2 берёт
    // заливку и штрих у группы по наследованию, а не 27 копиями.
    //
    // Рисуется в своей сетке наброска (шар ~540 единиц) и сводится к гнезду
    // одним transform, как лежал в наброске: числа генератора не пересчитаны,
    // иначе округление легло бы иначе. Тени и толщины — тоже в его единицах.
    ruffle() {
        if (!this._ruffle) this._ruffle = this.ruffleArt();
        return this.stamp(this._ruffle, 'bt-cloth-ruffle', 'bcr');
    },

    // Шаблон пуфа-оборки в координатах гнезда; '@ID' — место под id.
    ruffleArt() {
        const P = btPal();
        const [deepTop, tubeIn, core, deepMid, holeC, core2, deep, shadow, mid, lit, hi] = P.ruffle;
        const [vio, vioLt] = P.ruffleRim, [ropeDk, rope] = P.ruffleCord;
        const C = { deep, shadow, mid, lit, hi, vio, vioLt };
        const I = (s) => '@ID-' + s;
        const r = Math.round, pt = (p) => `${r(p[0])} ${r(p[1])}`, K6 = 1 / 6;
        // Кривая Катмулла-Рома в ОТНОСИТЕЛЬНЫХ командах (первый сегмент c,
        // дальше s — у КР контрольные точки по обе стороны узла симметричны).
        // Разности — между уже округлёнными точками: ошибка не копится. Не
        // crPath из kit(): тот пишет абсолютные числа с сотыми, а вид набросок
        // получил с этим округлением.
        const crRel = (Pp, closed) => {
            const n = Pp.length, Q = closed ? (i) => Pp[(i + n) % n] : (i) => Pp[Math.max(0, Math.min(n - 1, i))];
            const R2 = (p) => [r(p[0]), r(p[1])], d2 = (p, o) => `${p[0] - o[0]} ${p[1] - o[1]}`.replace(/ -/g, '-');
            let d = '', cur = R2(Pp[0]);
            for (let i = 0; i < (closed ? n : n - 1); i++) {
                const p0 = Q(i - 1), p1 = Q(i), p2 = Q(i + 1), p3 = Q(i + 2);
                const c2 = R2([p2[0] - (p3[0] - p1[0]) * K6, p2[1] - (p3[1] - p1[1]) * K6]), e = R2(p2);
                if (i === 0) { const c1 = R2([p1[0] + (p2[0] - p0[0]) * K6, p1[1] + (p2[1] - p0[1]) * K6]); d += `c${d2(c1, cur)} ${d2(c2, cur)} ${d2(e, cur)}`; }
                else d += `s${d2(c2, cur)} ${d2(e, cur)}`;
                cur = e;
            }
            return d;
        };
        const crOpen = (Pp) => crRel(Pp, false);
        const crClosed = (Pp) => `M${pt(Pp[0])}${crRel(Pp, true)}Z`;
        // Смешивание палитровых тонов с округлением наброска (не mixColor:
        // иное округление — другой байт цвета).
        const mix = (a, b, k) => '#' + [1, 3, 5].map((i) => r(parseInt(a.substr(i, 2), 16) * (1 - k) + parseInt(b.substr(i, 2), 16) * k).toString(16).padStart(2, '0')).join('');
        const out = [], defs = [];

        // ---- шнурок: два штриха, позади шара ----
        const cord = 'M205 428C150 408 70 392 30 400C8 405 10 432 40 437C90 444 150 440 215 446';
        out.push(`<path d="${cord}" fill="none" stroke="${ropeDk}" stroke-width="30" stroke-linecap="round"/>`);
        out.push(`<path d="${cord}" fill="none" stroke="${rope}" stroke-width="23" stroke-linecap="round"/>`);

        // ---- силуэт ----
        // Бугры: [угол°, высота, наклон]. Шаг и высота неравные; наклон
        // сдвигает гребень к краю бугра. Торчат -72, -28 и 184; низ (40…124)
        // примят — шар сидит на дне корзины.
        const BUMPS = [[-112, 12, 0.25], [-94, 7, -0.2], [-72, 22, 0.35], [-50, 9, -0.1], [-28, 20, -0.3], [-6, 11, 0.25], [14, 15, -0.2], [40, 4, 0], [66, 3, 0], [96, 3, 0], [124, 6, 0.2], [146, 14, -0.3], [168, 9, 0.3], [184, 19, -0.2], [208, 8, 0.1], [228, 18, -0.35]];
        const SIL = [];
        const NB = BUMPS.length, prevA = (i) => BUMPS[(i + NB - 1) % NB][0] - (i === 0 ? 360 : 0), nextA = (i) => BUMPS[(i + 1) % NB][0] + (i === NB - 1 ? 360 : 0);
        const crestA = (i) => { const [a, , sk] = BUMPS[i]; return a + sk * (sk > 0 ? nextA(i) - a : a - prevA(i)) / 2; };
        BUMPS.forEach(([a, h], i) => {
            const rad = (g) => g * Math.PI / 180, c = crestA(i), m = (a + nextA(i)) / 2;
            const at = (g, rr) => [272 + Math.cos(rad(g)) * rr, 236 + Math.sin(rad(g)) * rr], q = (nextA(i) - prevA(i)) * 0.17;
            // Торчащая петля — лопасть с круглым верхом (плечи), а не шип.
            if (h > 18) SIL.push(at(c - q, 209 + h * 0.85), at(c, 210 + h), at(c + q, 209 + h * 0.85));
            else SIL.push(at(c, 210 + h));
            SIL.push([272 + Math.cos(rad(m)) * 206, 236 + Math.sin(rad(m)) * 206]);
        });
        defs.push(`<path id="${I('s')}" d="${crClosed(SIL)}"/>`, `<clipPath id="${I('sc')}"><use href="#${I('s')}"/></clipPath>`,
            `<clipPath id="${I('sk')}"><use href="#${I('s')}" transform="translate(272 236) scale(.88) translate(-272 -236)"/></clipPath>`);
        // Подмалёвок: плотный тёмный в середине, к кромке в прозрачность —
        // под наружными петлями его нет, и сквозь них виден фон.
        defs.push(`<radialGradient id="${I('b')}" gradientUnits="userSpaceOnUse" cx="285" cy="262" r="240"><stop offset="0" stop-color="${core}"/><stop offset=".62" stop-color="${core2}"/><stop offset=".78" stop-color="${shadow}" stop-opacity=".9"/><stop offset=".9" stop-color="${mid}" stop-opacity=".55"/><stop offset="1" stop-color="${mid}" stop-opacity="0"/></radialGradient>`);
        out.push(`<use href="#${I('s')}" fill="url(#${I('b')})"/>`);

        // ---- общие градиенты ----
        // Лицо: свет у кромки → средний → тень там, где полотно уходит под
        // соседа. Габарит фигуры ставит градиент на КАЖДОЕ полотно, поэтому
        // хватает одного на (направление × пояс шара × кромка × сирень).
        const faceGrad = {};
        const face = (dir, shade, rim, tint, dense) => {
            const belt = shade < 0.45 ? 0 : 1, key = dir + belt + (rim ? 'r' : '') + (tint ? 'v' : '') + (dense ? 'p' : '');
            if (!faceGrad[key]) {
                const s = [0.2, 0.65][belt];
                const litTop = mix(mix(rim ? C.hi : C.lit, C.hi, rim ? 0.3 : 0.28), C.mid, s * 0.6), low = mix(C.shadow, C.deep, 0.2 + s * 0.5);
                const xy = { u: 'x1="0" y1="1" x2="0" y2="0"', d: 'x1="0" y1="0" x2="0" y2="1"', r: 'x1="0" y1="0" x2="1" y2="0"', l: 'x1="1" y1="0" x2="0" y2="0"' }[dir];
                defs.push(`<linearGradient id="${I(key)}" ${xy}><stop offset="0" stop-color="${mix(litTop, C.vio, tint ? 0.68 : 0.55)}"/><stop offset="${tint ? .24 : .16}" stop-color="${mix(litTop, C.vio, tint ? 0.42 : 0.3)}"/><stop offset="${tint ? .46 : .32}" stop-color="${litTop}"/><stop offset=".62" stop-color="${mix(litTop, C.mid, 0.45)}"/><stop offset=".8" stop-color="${low}" stop-opacity=".9"/><stop offset="1" stop-color="${C.deep}" stop-opacity="${dense ? .9 : 0}"/></linearGradient>`);
                faceGrad[key] = 1;
            }
            return I(key);
        };
        // Складка — узкая тень от впадины кромки вниз.
        defs.push(`<linearGradient id="${I('cg')}" x2="0" y2="1"><stop offset="0" stop-color="${C.deep}" stop-opacity=".4"/><stop offset="1" stop-color="${C.deep}" stop-opacity="0"/></linearGradient>`);
        // Тень-накладка лица по направлению ленты.
        ['d', 'u', 'r', 'l'].forEach((dd) => {
            const xy = { u: 'y1="1" x2="0" y2="0"', d: 'x2="0" y2="1"', r: '', l: 'x1="1" x2="0"' }[dd];
            defs.push(`<linearGradient id="${I('sh' + dd)}" ${xy}><stop offset=".5" stop-color="${C.deep}" stop-opacity="0"/><stop offset="1" stop-color="${C.deep}" stop-opacity=".5"/></linearGradient>`);
        });
        // Кромка: сирень пятнами вдоль длины, к ОБОИМ концам — в бирюзу
        // полотна: короткое полотно не кончается червячком.
        const TIES = [
            [[0, 'lit'], [0.16, 'vio'], [0.4, 'vioLt'], [0.62, 'vio'], [0.84, 'vioLt'], [1, 'lit']],
            [[0, 'lit'], [0.18, 'vioLt'], [0.4, 'vio'], [0.66, 'vioLt'], [0.84, 'vio'], [1, 'lit']],
        ];
        TIES.forEach((T, i) => defs.push(`<linearGradient id="${I('k' + i)}" x2="1" y2="1">${T.map(([p, c]) => `<stop offset="${p}" stop-color="${C[c]}"/>`).join('')}</linearGradient>`));

        // ---- сетка по форме ----
        // Ячейка — дыра (тёмный вытянутый ромб), нить — промежуток: сквозь
        // сетку видно то, что глубже. Узор общий на (угол ленты шагом 45° ×
        // крупность), повёрнут вдоль ленты. Дырка (пять эллипсов) описана
        // один раз, узоры ссылаются на неё.
        const netPat = {};
        const net = (ang, big) => {
            const a = ((Math.round(ang / 45) * 45) % 180 + 180) % 180, key = 'n' + a + (big === 3 ? 'f' : big === 2 ? 's' : big ? 'b' : '');
            if (!netPat[key]) {
                // big: 1 — крупная, 0 — средняя, 2 — мелкая сжатая, 3 — сплюснутая (кромки).
                const sc = big === 3 ? 'scale(1.05 .45)' : big === 2 ? 'scale(.62 .5)' : big ? 'scale(1.3)' : '';
                const e = (x, y) => `M${x - 3.6} ${y}a3.6 1.25 0 1 0 7.2 0a3.6 1.25 0 1 0-7.2 0`;
                // Дыра — слабая тень глубины, нить — слабый свет: на свету нить
                // читается светлой, в тени тонет вместе с лицом.
                if (!netPat.ho) { defs.push(`<path id="${I('ho')}" d="${e(0, 0)}${e(10, 0)}${e(0, 5.2)}${e(10, 5.2)}${e(5, 2.6)}"/>`); netPat.ho = 1; }
                defs.push(`<pattern id="${I(key)}" patternUnits="userSpaceOnUse" width="10" height="5.2" patternTransform="rotate(${a}) ${sc}"><use href="#${I('ho')}" fill="${C.deep}" fill-opacity=".22"/><path d="M0 2.6Q2.5 .4 5 0Q7.5 .4 10 2.6Q7.5 4.8 5 5.2Q2.5 4.8 0 2.6" stroke="${C.hi}" stroke-width=".75" stroke-opacity=".42" fill="none"/></pattern>`);
                netPat[key] = 1;
            }
            return I(key);
        };
        // Случай наброска — Парк — Миллер с тем же зерном и в том же порядке
        // вызовов: с другим ходом случая слой 2, губы и пух легли бы иначе.
        let seed = 7;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

        // Слой 2 копится сюда и встаёт на место маркера — под каймой и лентами.
        const DEEP = []; out.push('<!--DEEP-->');
        // Слой 2 у верха — под нависающей лентой — почти чёрный, ниже светлеет.
        defs.push(`<linearGradient id="${I('dp')}" x2="0" y2="1"><stop offset=".3" stop-color="${deepTop}"/><stop offset=".5" stop-color="${deepMid}"/><stop offset=".75" stop-color="${C.shadow}"/><stop offset="1" stop-color="${mix(C.shadow, C.mid, 0.5)}"/></linearGradient>`);
        // Светлый край лица (в наброске — класс .e).
        const edgeAttr = ` stroke="${C.hi}" stroke-width="2.2" stroke-opacity=".26"`;
        let ribId = 0;
        // ---- полотно: лента с кромкой L, шириной d, лицо уходит по hint ----
        const rib = (o) => {
            const { L, d, hint = [0, 1], holes = [], rim = false, tie = 0, crease = !rim && d >= 56 } = o;
            const n = L.length, hn = Math.hypot(hint[0], hint[1]), hx = hint[0] / hn, hy = hint[1] / hn;
            const midP = L[(n - 1) >> 1];
            const shade = Math.max(0, Math.min(1, ((midP[0] - 150) * 0.5 + (midP[1] - 110)) / 420));
            const bot = L.map((p, i) => {
                if (i === 0 || i === n - 1) return rim || o.lips === undefined ? p : [p[0] + hx * d * 0.3, p[1] + hy * d * 0.3];
                const a = L[i - 1], b = L[i + 1];
                let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1;
                nx = nx / l * 0.35 + hx * 0.65; ny = ny / l * 0.35 + hy * 0.65;
                if (nx * hx + ny * hy < 0) { nx = hx; ny = hy; }
                const l2 = Math.hypot(nx, ny);
                return [p[0] + nx / l2 * d, p[1] + ny / l2 * d];
            });
            const top = crOpen(L);
            const dir = Math.abs(hx) > 0.7 ? (hx > 0 ? 'r' : 'l') : hy > 0 ? 'd' : 'u';
            if (o.sink) { o.sink.f += `M${pt(L[0])}${top}L${pt(bot[n - 1])}${crOpen(bot.slice().reverse())}Z`; o.sink.k[tie % 3] += `M${pt(L[0])}${top}`; return; }
            const fid = I('f' + (ribId++));
            defs.push(`<path id="${fid}" d="M${pt(L[0])}${top}L${pt(bot[n - 1])}${crOpen(bot.slice().reverse())}Z"/>`);
            if (!rim) {
                // Слой 2: та же лента глубже — сдвиг по ходу ленты вниз и вбок,
                // поворот на пару градусов вокруг середины; у каждой свой.
                const k = 0.32 + rnd() * 0.2, sx = (rnd() - 0.5) * 22, rot = (rnd() - 0.5) * 16;
                DEEP.push(`<use href="#${fid}" transform="translate(${r(hx * d * k + sx)} ${r(hy * d * k)}) rotate(${r(rot)} ${r(midP[0])} ${r(midP[1])})"/>`);
            }
            out.push(`<use href="#${fid}" fill="url(#${face(dir, shade, rim, tie !== 1, false)})"${Math.hypot(midP[0] - 272, midP[1] - 236) > 158 && midP[1] < 350 ? ' fill-opacity=".82"' : ''}${rim ? '' : edgeAttr}/>`);
            if (!rim) {
                // Сетка у ВСЕХ лент (без неё мелкая лента вблизи — пластиковая
                // «лодочка»), по всему лицу; поверх — тень-накладка: нить в
                // тени гаснет вместе с лицом.
                const ang = Math.atan2(L[n - 1][1] - L[0][1], L[n - 1][0] - L[0][0]) * 180 / Math.PI;
                out.push(`<use href="#${fid}" fill="url(#${net(ang, d > 66)})"/>`);
                out.push(`<use href="#${fid}" fill="url(#${I('sh' + dir)})"/>`);
            }
            // Складка: впадина кромки — полотно заломлено внутрь, от неё вниз
            // уходит узкая тень; у крупных лент длиннее.
            if (crease) {
                let dd = '', k = 0;
                for (let i = 1; i < n - 1; i++) {
                    const a = L[i - 1], b = L[i + 1], p = L[i];
                    if ((p[0] - (a[0] + b[0]) / 2) * hx + (p[1] - (a[1] + b[1]) / 2) * hy < 4 || k++ % 2) continue;
                    const w = Math.min(Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.09, 7), len = d * 0.44, px = -hy, py = hx;
                    const l = [p[0] + px * w, p[1] + py * w], rr = [p[0] - px * w, p[1] - py * w], e = [p[0] + hx * len, p[1] + hy * len];
                    dd += `M${pt(l)}Q${pt([l[0] + hx * len * 0.55, l[1] + hy * len * 0.55])} ${pt(e)}Q${pt([rr[0] + hx * len * 0.55, rr[1] + hy * len * 0.55])} ${pt(rr)}Z`;
                }
                if (dd) out.push(`<path d="${dd}" fill="url(#${I('cg')})"/>`);
            }
            // Дыра под сгибом: сквозь неё — глубина.
            for (const h of holes) {
                const A = L[h - 1], B = L[h + 1], Pp = L[h];
                const a = [Pp[0] + (A[0] - Pp[0]) * 0.8 + hx * 5, Pp[1] + (A[1] - Pp[1]) * 0.8 + hy * 5], b = [Pp[0] + (B[0] - Pp[0]) * 0.8 + hx * 5, Pp[1] + (B[1] - Pp[1]) * 0.8 + hy * 5];
                const top2 = [Pp[0] + hx * 5, Pp[1] + hy * 5], bottom = [Pp[0] + hx * (5 + d * 0.55), Pp[1] + hy * (5 + d * 0.55)];
                const q = (M) => [2 * M[0] - (a[0] + b[0]) / 2, 2 * M[1] - (a[1] + b[1]) / 2];
                out.push(`<path d="M${pt(a)}Q${pt(q(top2))} ${pt(b)}Q${pt(q(bottom))} ${pt(a)}Z" fill="${holeC}" fill-opacity=".8"/>`);
            }
            // Кромка — живая полоса разной ширины (копится в общий путь
            // группы), по гребню — сгиб для дымки и блика. Кайма свою кромку
            // сложила выше (sink), других лент нет.
            if (o.lips) {
                const lwF = o.lipW || 10, kk = L.map(() => 0.55 + rnd() * 0.9);
                const offs = (m) => L.map((p, i) => i === 0 || i === n - 1 ? p : [p[0] + (bot[i][0] - p[0]) / d * lwF * kk[i] * m, p[1] + (bot[i][1] - p[1]) / d * lwF * kk[i] * m]);
                o.lips.push(`M${pt(L[0])}${top}${crOpen(offs(1).slice().reverse())}Z`);
                o.haze.push(`M${pt(L[0])}${top}`);
            }
        };

        // ---- кайма: из самих бугров силуэта ----
        // Каждый бугор — дальняя петля, кромка идёт по его дуге, лицо смотрит
        // внутрь шара: силуэт сложен из тех же полотен, а не вырезан. Две
        // фигуры (чётные и нечётные) — в нахлёсте плотность складывается сама.
        const KA = [{ f: '', k: ['', '', ''] }, { f: '', k: ['', '', ''] }];
        BUMPS.forEach(([a, h], i) => {
            const at = (g, rr) => [272 + Math.cos(g * Math.PI / 180) * rr, 236 + Math.sin(g * Math.PI / 180) * rr];
            const a0 = (a + prevA(i)) / 2 + 2, a1 = (a + nextA(i)) / 2 - 2, c = crestA(i);
            const g = a * Math.PI / 180;
            rib({ L: [at(a0, 200), at(c, 203 + h * 0.92), at(a1, 200)], d: 30 + h, hint: [-Math.cos(g), -Math.sin(g)], tie: i % 3, sink: KA[i % 2], rim: true });
        });
        {   // Свет каймы — один радиальный градиент со смещённым вниз-вправо
            // центром: сверху слева светло и прозрачно, снизу справа плотно.
            const kl = mix(C.lit, C.mid, 0.12);
            defs.push(`<radialGradient id="${I('kf')}" gradientUnits="userSpaceOnUse" cx="295" cy="270" r="252"><stop offset=".62" stop-color="${mix(C.shadow, C.mid, 0.3)}" stop-opacity=".9"/><stop offset=".76" stop-color="${mix(kl, C.mid, 0.55)}" stop-opacity=".82"/><stop offset=".88" stop-color="${kl}" stop-opacity=".64"/><stop offset=".98" stop-color="${mix(kl, C.hi, 0.15)}" stop-opacity=".52"/></radialGradient>`);
            KA.forEach((Ka, i) => { defs.push(`<path id="${I('ka' + i)}" d="${Ka.f}"/>`); out.push(`<use href="#${I('ka' + i)}" fill="url(#${I('kf')})"/>`); });
            KA.forEach((Ka, i) => out.push(`<use href="#${I('ka' + i)}" fill="url(#${net(0, false)})"/>`));
            defs.push(`<radialGradient id="${I('kk')}" gradientUnits="userSpaceOnUse" cx="295" cy="270" r="252"><stop offset=".72" stop-color="${C.vio}"/><stop offset=".86" stop-color="${mix(C.vioLt, C.lit, 0.4)}"/><stop offset=".97" stop-color="${mix(C.lit, C.hi, 0.35)}"/></radialGradient>`);
            out.push(`<path d="${[0, 1, 2].map((i) => KA[0].k[i] + KA[1].k[i]).join('')}" fill="none" stroke="url(#${I('kk')})" stroke-width="3" stroke-linecap="round" stroke-opacity=".8"/>`);
        }

        // ---- среднее кольцо: короткие полотна, стыки вразбежку ----
        // Левые и правые — со своим шагом, общей линии стыков нет.
        const LR = [], LD = [], HR = [], HD = [];
        const mr = (o) => rib({ lips: LR, haze: HR, ...o });
        mr({ L: [[128, 132], [150, 106], [186, 114], [216, 94]], d: 50, hint: [0.2, 1], tie: 1 });
        mr({ L: [[206, 100], [236, 80], [272, 94], [302, 74]], d: 48, tie: 2 });
        mr({ L: [[294, 86], [330, 72], [370, 92]], d: 46, hint: [-0.2, 1] });
        mr({ L: [[360, 96], [392, 96], [422, 118], [446, 150]], d: 44, hint: [-0.5, 1], tie: 1 });
        mr({ L: [[100, 166], [114, 204], [98, 246]], d: 44, hint: [1, 0.2], tie: 2 });
        mr({ L: [[176, 122], [150, 166], [162, 208], [140, 250]], d: 60, hint: [1, 0.35] });
        mr({ L: [[318, 116], [356, 100], [398, 126], [440, 164]], d: 62, hint: [-0.4, 1], tie: 1 });
        mr({ L: [[450, 178], [474, 210], [484, 248]], d: 40, hint: [-1, 0.3], tie: 2 });
        mr({ L: [[392, 190], [428, 190], [458, 222], [480, 264]], d: 58, hint: [-0.55, 1] });
        mr({ L: [[96, 262], [114, 298], [104, 336]], d: 42, hint: [1, 0], tie: 1 });
        mr({ L: [[118, 302], [146, 270], [186, 284], [212, 266]], d: 56, hint: [0.3, 1], tie: 2 });
        mr({ L: [[456, 266], [478, 296], [474, 334]], d: 40, hint: [-1, 0.2] });
        mr({ L: [[380, 286], [418, 280], [450, 308], [470, 342]], d: 54, hint: [-0.5, 1], tie: 1 });
        mr({ L: [[112, 354], [138, 338], [168, 358]], d: 42, tie: 2 });
        mr({ L: [[150, 358], [180, 330], [218, 348]], d: 52, hint: [0.1, 1] });
        mr({ L: [[340, 338], [376, 322], [412, 342], [438, 336]], d: 50, hint: [-0.2, 1], tie: 1 });
        mr({ L: [[408, 364], [436, 354], [460, 378]], d: 38, hint: [-0.5, 1], tie: 2 });
        mr({ L: [[254, 380], [288, 356], [332, 374], [360, 362]], d: 48 });
        mr({ L: [[160, 404], [190, 386], [226, 400], [252, 390]], d: 38, tie: 1 });
        mr({ L: [[330, 400], [366, 384], [404, 400]], d: 36, tie: 2 });
        mr({ L: [[240, 426], [276, 404], [318, 414], [352, 426]], d: 32 });
        // Сгибы группы — один путь: по нему сиреневая дымка (краска
        // растекается в обе стороны от сгиба) и блик.
        defs.push(`<path id="${I('hr')}" d="${HR.join('')}"/>`);
        out.push(`<use href="#${I('hr')}" fill="none" stroke="${C.vio}" stroke-width="16" stroke-opacity=".17" stroke-linecap="round" clip-path="url(#${I('sc')})"/>`);
        out.push(`<path id="${I('lr')}" d="${LR.join('')}" fill="url(#${I('k1')})" fill-opacity=".62"/>`, `<use href="#${I('lr')}" fill="url(#${net(0, 3)})"/>`);

        // ---- доминанты центра: крупные петли поверх соседей ----
        const dr = (o) => rib({ lipW: 12, lips: LD, haze: HD, ...o });
        dr({ L: [[184, 182], [220, 146], [266, 158], [298, 138]], d: 80, tie: 2, holes: [1] });
        dr({ L: [[284, 162], [320, 142], [358, 172], [392, 162]], d: 70, tie: 0, holes: [2] });
        dr({ L: [[196, 250], [238, 212], [286, 232], [320, 208]], d: 82, tie: 1, holes: [2] });
        dr({ L: [[304, 230], [344, 210], [384, 238], [424, 236]], d: 72, hint: [-0.15, 1], tie: 2 });
        dr({ L: [[212, 318], [252, 284], [298, 302], [332, 288]], d: 74, tie: 0 });
        dr({ L: [[310, 302], [346, 282], [384, 306]], d: 58, tie: 1 });
        defs.push(`<path id="${I('hd')}" d="${HD.join('')}"/>`);
        out.push(`<use href="#${I('hd')}" fill="none" stroke="${C.vio}" stroke-width="20" stroke-opacity=".18" stroke-linecap="round" clip-path="url(#${I('sc')})"/>`);
        out.push(`<path id="${I('ld')}" d="${LD.join('')}" fill="url(#${I('k0')})" fill-opacity=".7"/>`, `<use href="#${I('ld')}" fill="url(#${net(0, 3)})"/>`);
        // Блик по сгибу: тонкая светлая нить на гребне всех полотен середины.
        ['hr', 'hd'].forEach((h) => out.push(`<use href="#${I(h)}" fill="none" stroke="${C.hi}" stroke-width="1.4" stroke-opacity=".45" stroke-linecap="round"/>`));

        // ---- трубки-устья ----
        // Устье — не дырка в поверхности, а лента, свёрнутая в трубку: верх —
        // сгиб (дуга высоко, кромка толще, сирень), низ — край нижней стенки
        // (полого, тоньше, светлее). Кромка сгиба НЕ замыкается вокруг устья
        // (иначе — глаз): она уходит за концы устья вниз по полотну.
        const TU = { in: '', top: '', low: '' };
        const tube = (cx, cy, w, h, rot, lean) => {
            const g = rot * Math.PI / 180, cs = Math.cos(g), sn = Math.sin(g);
            const T = (x, y) => [cx + x * cs - y * sn, cy + x * sn + y * cs];
            // lean — один конец выше другого: устье не симметричный миндаль.
            const A = T(-w, h * lean), B = T(w, -h * lean);
            const top = `M${pt(A)}C${pt(T(-w * 0.6, -h * 1.6))} ${pt(T(w * 0.45, -h * 1.65))} ${pt(B)}`;
            const bot = `C${pt(T(w * 0.5, h * 0.75))} ${pt(T(-w * 0.55, h * 0.8))} ${pt(A)}`;
            TU.in += `${top}${bot}Z`;
            const E0 = T(-w * 1.55, h * lean + h * 0.9), E1 = T(w * 1.5, -h * lean + h * 0.8);
            TU.top += `M${pt(E0)}Q${pt(T(-w * 1.15, h * lean - h * 0.2))} ${pt(A)}${top.slice(top.indexOf('C'))}Q${pt(T(w * 1.2, -h * lean - h * 0.1))} ${pt(E1)}`;
            TU.low += `M${pt(T(w * 0.7, h * 0.25))}C${pt(T(w * 0.3, h * 0.75))} ${pt(T(-w * 0.5, h * 0.8))} ${pt(T(-w * 1.25, h * 0.65))}`;
        };
        tube(288, 294, 40, 22, -8, 0.3);
        tube(425, 340, 26, 14, 18, -0.4);
        tube(206, 232, 30, 16, -22, 0.2);
        tube(356, 148, 22, 8, 4, -0.2);
        tube(238, 414, 22, 9, -4, 0.35);
        out.push(`<path d="${TU.in}" fill="${tubeIn}"/>`);
        out.push(`<path d="${TU.in}" fill="url(#${net(-8, true)})" fill-opacity=".6"/>`);
        out.push(`<path d="${TU.low}" fill="none" stroke="${mix(C.lit, C.vioLt, 0.35)}" stroke-width="4" stroke-linecap="round"/>`);
        out.push(`<path d="${TU.top}" fill="none" stroke="url(#${I('k0')})" stroke-width="9" stroke-linecap="round"/>`);

        // ---- пушистый край ----
        // Тонкие полупрозрачные петельки-нити по силуэту: шаг, размер и
        // наклон у каждой свой; со стороны света их больше и они светлее,
        // внизу у опоры — почти нет (примято).
        {
            const rad = (g) => g * Math.PI / 180, polar = SIL.map((p) => [Math.atan2(p[1] - 236, p[0] - 272), Math.hypot(p[0] - 272, p[1] - 236)]).sort((x, y) => x[0] - y[0]);
            const edge = (t) => {
                for (let i = 0; i < polar.length; i++) {
                    const A = polar[i], B = polar[(i + 1) % polar.length], b0 = i === polar.length - 1 ? B[0] + 2 * Math.PI : B[0];
                    let tt = t; if (tt < A[0]) tt += 2 * Math.PI;
                    if (tt >= A[0] && tt <= b0) return A[1] + (B[1] - A[1]) * (tt - A[0]) / (b0 - A[0]);
                }
                return 210;
            };
            let fr = '', fr2 = '';
            for (let t = -Math.PI; t < Math.PI;) {
                const light = Math.cos(t - rad(-135)), bottom = Math.sin(t) > 0.55;
                const step = (bottom ? 0.14 : 0.045) * (0.6 + rnd() * 0.9);
                const w = 0.015 + rnd() * 0.03, R0 = edge(t) - 4, out2 = 2 + rnd() * 6 * (bottom ? 0.3 : 1), tilt = (rnd() - 0.5) * 0.06;
                const Pq = (tt, rr) => [272 + Math.cos(tt) * rr, 236 + Math.sin(tt) * rr];
                const seg = `M${pt(Pq(t - w, R0))}Q${pt(Pq(t + tilt, R0 + out2 * 2))} ${pt(Pq(t + w, R0))}`;
                if (light > 0.2) fr += seg; else fr2 += seg;
                t += step;
            }
            out.push(`<path d="${fr}" fill="none" stroke="${mix(C.lit, C.hi, 0.5)}" stroke-width="1.1" stroke-opacity=".38"/>`);
            out.push(`<path d="${fr2}" fill="none" stroke="${mix(C.lit, C.vio, 0.35)}" stroke-width="1.1" stroke-opacity=".32"/>`);
        }

        // Слой 2 — под каймой и лентами, в клипе чуть меньше силуэта; заливка
        // и штрих у группы, ленты берут их по наследованию. Поверх — мелкая
        // сжатая сетка: сквозь неё глубина тоже сетка, а не пустота.
        out.splice(out.indexOf('<!--DEEP-->'), 1,
            `<g clip-path="url(#${I('sk')})" fill="url(#${I('dp')})" stroke="${C.lit}" stroke-width="1.5" stroke-opacity=".18">`, ...DEEP, '</g>',
            `<use href="#${I('s')}" transform="translate(272 236) scale(.86) translate(-272 -236)" fill="url(#${net(0, 2)})"/>`);
        // Сетка наброска (шар ~540 единиц) сводится к гнезду: набросок стоял
        // в сцене translate(598 486) при гнезде (573, 492).
        return `<defs>${defs.join('')}</defs><g transform="translate(25 -6) scale(.2) translate(-271 -233)">${out.join('')}</g>`;
    },

    // ---------- 6. МАХРОВАЯ РУКАВИЦА ----------
    // Винная (бордо) банная рукавица из толстой махры с лоском, манжета
    // обшита бордюром пудровой шампани, на шве — тесьма-петелька. Лежит
    // наискосок на задней сетке: пальцы вверх-влево, манжета вниз-вправо.
    // Набросок игрока (sp6, круг 2, w2) один в один: генератор тот же, ход
    // случая тот же. Слепой судья: «рукавица», махровая ткань, мягкая.
    //
    // Что держит вещь (заметки художника к sp6):
    // * РУКАВИЦУ делает большой палец: карман без пальца со скруглённым
    //   верхом читался шапкой и грелкой на чайник. Палец короткий и прижат —
    //   силуэт компактный, в формате остальных ступеней.
    // * БАННУЮ вещь, а не зимнюю варежку и не прихватку, делает тканый
    //   бордюр манжеты и тесьма-петля: признаки полотенца.
    // * Махра — мелкая дужка петли на ступень светлее основы и полумесяц
    //   тени на ступень темнее; крупные завитки читались овчиной, ровные ряды
    //   дужек — чешуёй. На глубоком цвете тёмный полумесяц в тени не виден,
    //   поэтому там фактуру держит тусклая светлая верхушка: иначе тень
    //   становилась гладкой, как резина.
    // * ЛОСК — не блик. Глянец (маленькое резкое белое пятно на вершине) —
    //   это пластик и стекло; несколько отдельных пятен лоска читались
    //   кожей и латексом. Лоск дорогой махры — ОДНА широкая мягкая полоса
    //   света своего цвета вдоль выпуклости со стороны света, край размыт в
    //   ноль, а рвут её сами петли: светлеют кончики петель, и редкие из них
    //   загораются искрой. Ни одной резкой границы света — мягкость цела.
    // * Край без обводки: мягкое держит форму светотенью, край — пух петель
    //   наполовину за контуром, со стороны света светлый (велюр виден вбок).
    //   Тёмные полумесяцы по всему силуэту складывались в пунктирную
    //   обводку. Нормаль пуха смотрит НАРУЖУ — в круге 1 знак был перевёрнут,
    //   и светлая сторона получала тёмный пунктир.
    //
    // Как ruffle и sea — переносится ГЕНЕРАТОР, а не выхлоп: петли — тысячи
    // дужек. Считается один раз и кешируется. Дужки одного цвета — ОДНИМ
    // путём (15 путей на всю махру), в долях 0,2 единицы под scale(.2):
    // целые числа без точек, путь на треть короче. Без фильтров, масок и
    // прозрачности групп (traps, п. 73): прозрачность только на фигурах и
    // в стопах. Один клип по силуэту — на группе без прозрачности (не
    // отдельный буфер смешивания): без него обод тени и полосы лоска
    // вылезали бы за край.
    //
    // Две части: main — рукавица (в корзине, за передней сеткой), front —
    // петля, свисающая через перекладину (поверх сетки).
    mitt() {
        if (!this._mitt) this._mitt = this.mittArt();
        return { main: this.stamp(this._mitt.main, 'bt-cloth-mitt', 'bcm'),
                 front: this.stamp(this._mitt.front, 'bt-cloth-mitt-loop', 'bcm') };
    },

    // Шаблон рукавицы { main, front } в координатах гнезда; '@ID' — место под id.
    mittArt() {
        const P = btPal(), ramp = P.mitt, tones = P.mittMass, [sheenC, sparkC] = P.mittSheen;
        const bind = P.mittBind, mouthC = P.mittMouth;
        const I = (s) => '@ID-' + s;
        // Случай — mulberry32 с зерном наброска и в том же порядке вызовов:
        // с другим ходом петли легли бы иначе, чем выбрал игрок.
        const R = this.kit().mulberry(7);
        // Округление наброска (до десятой): с другим — другой байт пути.
        const f = (v) => (Math.round(v * 10) / 10).toString(), K6 = 1 / 6;
        const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
        const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
        // Кривая Катмулла — Рома по опорам: путь и точки (для «внутри»,
        // расстояния до края и пуха). Не crPath из kit(): тот пишет сотые.
        const cr = (Q, closed) => {
            const n = Q.length, q = closed ? (i) => Q[(i + n) % n] : (i) => Q[Math.max(0, Math.min(n - 1, i))];
            let d = `M${f(Q[0][0])} ${f(Q[0][1])}`;
            for (let i = 0; i < (closed ? n : n - 1); i++) {
                const p0 = q(i - 1), p1 = q(i), p2 = q(i + 1), p3 = q(i + 2);
                d += `C${f(p1[0] + (p2[0] - p0[0]) * K6)} ${f(p1[1] + (p2[1] - p0[1]) * K6)} ${f(p2[0] - (p3[0] - p1[0]) * K6)} ${f(p2[1] - (p3[1] - p1[1]) * K6)} ${f(p2[0])} ${f(p2[1])}`;
            }
            return d + (closed ? 'Z' : '');
        };
        const sampleCR = (Q, closed, per) => {
            const n = Q.length, q = closed ? (i) => Q[(i + n) % n] : (i) => Q[Math.max(0, Math.min(n - 1, i))], out = [];
            for (let i = 0; i < (closed ? n : n - 1); i++) {
                const p0 = q(i - 1), p1 = q(i), p2 = q(i + 1), p3 = q(i + 2);
                for (let k = 0; k < per; k++) {
                    const t = k / per, t2 = t * t, t3 = t2 * t;
                    const c = (a, b, c_, d_) => 0.5 * (2 * b + (-a + c_) * t + (2 * a - 5 * b + 4 * c_ - d_) * t2 + (-a + 3 * b - 3 * c_ + d_) * t3);
                    out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
                }
            }
            if (!closed) out.push(Q[n - 1]);
            return out;
        };
        const inside = (Q, x, y) => {
            let c = false;
            for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) {
                const [xi, yi] = Q[i], [xj, yj] = Q[j];
                if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
            }
            return c;
        };
        // Ближайшая точка контура. Отрезки считаются один раз на контур, а
        // hypot зовётся, только если квадрат расстояния не хуже лучшего с
        // запасом: ответ тот же до бита, что у наброска (там hypot на каждом
        // отрезке), но вдесятеро дешевле — это было две трети всей сборки.
        const segs = new Map();
        const nearest = (Q, x, y) => {
            let S = segs.get(Q);
            if (!S) {
                S = new Float64Array(Q.length * 5);
                Q.forEach((a, i) => { const b = Q[(i + 1) % Q.length], dx = b[0] - a[0], dy = b[1] - a[1]; S.set([a[0], a[1], dx, dy, dx * dx + dy * dy || 1], i * 5); });
                segs.set(Q, S);
            }
            let bd = 1e9, bd2 = Infinity, bx = 0, by = 0;
            for (let k = 0; k < S.length; k += 5) {
                const ax = S[k], ay = S[k + 1], dx = S[k + 2], dy = S[k + 3], L = S[k + 4];
                const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L));
                const qx = ax + dx * t, qy = ay + dy * t, ex = x - qx, ey = y - qy;
                if (ex * ex + ey * ey > bd2) continue;
                const d = Math.hypot(ex, ey);
                if (d < bd) { bd = d; bx = qx; by = qy; bd2 = d * d * (1 + 1e-9); }
            }
            return { d: bd, qx: bx, qy: by };
        };
        const isCW = (Q) => { let a = 0; for (let i = 0; i < Q.length; i++) { const p = Q[i], q = Q[(i + 1) % Q.length]; a += p[0] * q[1] - q[0] * p[1]; } return a > 0; };

        // Свет сверху-слева, чуть на нас.
        const LIGHT = (() => { const v = [-0.55, -0.65, 0.55], l = Math.hypot(...v); return v.map((c) => c / l); })();
        // Освещённость подушки: у края форма уходит от нас (нормаль наружу),
        // в середине смотрит на нас, плюс изгиб большого эллипса — середина
        // не плоская. D — «толщина» подушки.
        const shadeAt = (Q, x, y, o) => {
            const nq = nearest(Q, x, y);
            let ox = nq.qx - x, oy = nq.qy - y; const ol = Math.hypot(ox, oy) || 1; ox /= ol; oy /= ol;
            const tilt = 1 - smooth(0, o.D, nq.d);
            const ex = (x - o.cx) / o.rx, ey = (y - o.cy) / o.ry;
            let nx = ox * tilt * 0.85 + ex * 0.35, ny = oy * tilt * 0.85 + ey * 0.35;
            const nl = Math.hypot(nx, ny); if (nl > 0.95) { nx *= 0.95 / nl; ny *= 0.95 / nl; }
            const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
            const lam = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
            return { v: clamp(0.5 + 0.62 * (lam - 0.55) / 0.45 * 0.5 + 0.12), d: nq.d };
        };

        // Махра. У петли ОДНА дужка там, где вторая не видна (на свету —
        // светлая верхушка, в тени — тусклая светлая верхушка), обе — только
        // на полутоне, где и живёт фактура; на свету и в глубокой тени петли
        // редеют. В зоне лоска верхушки светлее, часть — искра. Дужка —
        // квадратичная кривая через вершину: вдвое короче дуги «a», на глаз та же.
        const terry = (Q, o, pts) => {
            const bins = {}, N = ramp.length - 1;
            const add = (col, s) => { (bins[col] = bins[col] || []).push(s); };
            const loop = (x, y, r, v, sn, edge, ang, lit) => {
                const lvl = clamp(Math.round(v * N), 0, N);
                const a = (ang != null ? ang : -0.5 * Math.PI) + (R() - 0.5) * o.wob;
                const rx = r, ry = r * (0.7 + R() * 0.45);
                const p = (t, dx = 0, dy = 0) => [x + dx + Math.cos(a + t) * rx, y + dy + Math.sin(a + t) * ry];
                // Искра — редкая и своего тона, только в сердце лоска: белая и
                // частая читалась блёстками.
                const hiOn = edge ? lit : true, loOn = edge ? !lit : v > 0.34 && v < 0.7;
                if (hiOn) {
                    const spark = sn > 0.5 && R() < 0.22 * sn;
                    add(spark ? sparkC : ramp[Math.min(N, lvl + (edge || v < 0.4 ? 2 : 1))], [p(-1.5), p(0), p(1.5)]);
                }
                if (loOn) add(ramp[Math.max(0, lvl - 1)], [p(1.6, 0.3, 0.4), p(2.2, 0.3, 0.4), p(2.8, 0.3, 0.4)]);
            };
            for (const q of pts) {
                if (!inside(Q, q.x, q.y)) continue;
                const sh = shadeAt(Q, q.x, q.y, o);
                if (sh.d < 0.9) continue;
                const sn = o.sheen(q.x, q.y), v = clamp(sh.v + 0.24 * sn);
                if (R() < 0.2 + 0.45 * smooth(0.72, 0.98, v) + 0.15 * (1 - smooth(0.1, 0.3, v))) continue;
                loop(q.x, q.y, q.r, v, sn, false, q.a);
            }
            // Пух по силуэту: петли наполовину за краем, шаг неровный.
            for (let i = 0; i < Q.length; i++) {
                if (R() < o.edgeSkip) continue;
                const a = Q[i], b = Q[(i + 1) % Q.length];
                let nx = b[1] - a[1], ny = -(b[0] - a[0]); const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
                // Нормаль НАРУЖУ: у контура по часовой на экране это (−dy, dx).
                if (o.cw) { nx = -nx; ny = -ny; }
                nx = -nx; ny = -ny;
                const x = a[0] + nx * (0.1 + R() * 0.4), y = a[1] + ny * (0.1 + R() * 0.4);
                if (o.noEdge(x, y)) continue;
                const lam = nx * LIGHT[0] + ny * LIGHT[1];
                loop(x, y, o.step * (0.28 + R() * 0.16), clamp(0.5 + lam * 0.55), lam > 0.2 ? 0.6 : 0, true, Math.atan2(ny, nx), lam > -0.15);
            }
            // Координаты — целые в долях 0,2 единицы (группа scale(.2)):
            // петель тысячи, и без точек и дробей путь короче на треть, а
            // 0,2 единицы не видно ни на полке, ни в руке.
            const rd = (v) => Math.round(v * 5);
            let out = '';
            for (const [col, arr] of Object.entries(bins)) {
                let d = '', cx = 0, cy = 0;
                arr.sort((A, B) => A[0][1] - B[0][1] || A[0][0] - B[0][0]);
                for (const [a0, pk, a1] of arr) {
                    const x0 = rd(a0[0]), y0 = rd(a0[1]), x1 = rd(a1[0]), y1 = rd(a1[1]);
                    const qx = rd(2 * pk[0] - (a0[0] + a1[0]) / 2), qy = rd(2 * pk[1] - (a0[1] + a1[1]) / 2);
                    d += (d ? `m${x0 - cx} ${y0 - cy}` : `M${x0} ${y0}`) + `q${qx - x0} ${qy - y0} ${x1 - x0} ${y1 - y0}`;
                    cx = x1; cy = y1;
                }
                out += `<path d="${d.replace(/ -/g, '-')}" stroke="${col}"/>`;
            }
            return `<g transform="scale(.2)" fill="none" stroke-width="${o.sw * 5}" stroke-linecap="round">${out}</g>`;
        };

        // Плоская тесьма-петля: тёмная кромка, лицо, светлая нить строчкой.
        const tape = (d, c) => `<path d="${d}" fill="none" stroke="${c[0]}" stroke-width="3.6" stroke-linecap="round"/>`
            + `<path d="${d}" fill="none" stroke="${c[1]}" stroke-width="2.6" stroke-linecap="round"/>`
            + `<path d="${d}" fill="none" stroke="${c[2]}" stroke-width=".6" stroke-linecap="round" stroke-dasharray="2.2 1.1"/>`;
        // Складка «большой палец поверх ладони»: тень на ладони у кромки
        // пальца и светлый край самого пальца — палец ближе и перекрывает.
        const crease = (pts, c) => {
            const d = cr(pts, false);
            return `<path d="${d}" fill="none" stroke="${c[0]}" stroke-opacity=".45" stroke-width="3" stroke-linecap="round" transform="translate(-1.2 .6)"/>`
                + `<path d="${d}" fill="none" stroke="${c[0]}" stroke-opacity=".6" stroke-width="1" stroke-linecap="round"/>`
                + `<path d="${d}" fill="none" stroke="${c[1]}" stroke-opacity=".7" stroke-width=".8" stroke-linecap="round" transform="translate(1 -.2)"/>`;
        };

        // Чертёж — в координатах рукавицы, повёрнутой на −24° вокруг
        // (596, 474) в сцене; набросок считался в сцене вокруг гнезда
        // (573, 492), и гнездо вычитается одной группой на выходе — так
        // округление ложится ровно как у наброска.
        const th = -24 * Math.PI / 180, C = Math.cos(th), S = Math.sin(th), X0 = 596, Y0 = 474;
        const T = ([x, y]) => [X0 + x * C - y * S, Y0 + x * S + y * C];
        const Ti = (x, y) => [(x - X0) * C + (y - Y0) * S, -(x - X0) * S + (y - Y0) * C];
        // Силуэт: ладонь, большой палец вправо-вверх, манжета внизу.
        const L = [[-26, 42], [-27, 28], [-31, 10], [-32, -8], [-28, -24], [-19, -35], [-5, -40], [9, -38], [20, -30], [25, -16], [26, -5], [28, 1],
            [33, -8], [39, -16], [45, -18], [48, -12], [47, -2], [42, 10], [35, 20], [29, 29], [28, 42], [1, 43.5]];
        const Pp = L.map(T), d = cr(Pp, true);
        const poly = sampleCR(Pp, true, 5), cw = isCW(poly);
        // Лоск ОДНОЙ полосой — дуга в 6–7 единицах от края со стороны
        // света, к концам гаснет; плюс слабое широкое пятно на пузе и узкое
        // на пальце. SH — [cx, cy, rx, ry, поворот°, сила] в координатах рукавицы.
        const ARC = [[-24.5, 17], [-25.5, 2], [-22, -14], [-13.5, -26.5], [-1, -32.5], [10, -30.5]];
        const arcPts = sampleCR(ARC, false, 8);
        // Сила полосы вдоль дуги: к концам гаснет.
        const arcK = arcPts.map((p, i) => Math.sin(Math.PI * (0.08 + 0.84 * (i / (arcPts.length - 1)))));
        const SH = [[-6, -4, 17, 22, 0, 0.3], [40, -8, 3.6, 9, 18, 0.75]];
        const sheen = (x, y) => {
            const [u, v] = Ti(x, y); let m = 0;
            for (let i = 0; i < arcPts.length; i++) {
                const [ax, ay] = arcPts[i];
                m = Math.max(m, arcK[i] * Math.exp(-((u - ax) ** 2 + (v - ay) ** 2) / 26));
            }
            for (const [cx, cy, rx, ry, rot, k] of SH) {
                const a = rot * Math.PI / 180, du = u - cx, dv = v - cy;
                const pu = (du * Math.cos(a) + dv * Math.sin(a)) / rx, pv = (-du * Math.sin(a) + dv * Math.cos(a)) / ry;
                m = Math.max(m, k * Math.exp(-(pu * pu + pv * pv) * 1.2));
            }
            return m;
        };
        // Раскладка петель — ряды поперёк рукавицы, как у полотенца, но
        // только намёком: поперёк ряда петля гуляет почти на полшага, шаг
        // рядов неровный, ряд гнётся по форме — ровные ряды читались чешуёй.
        const pts = [];
        for (let y = -44; y < 40; y += 1.5 + R() * 1.0) {
            let x = -36 + R() * 1.5;
            const bow = 0.005 + R() * 0.005;
            while (x < 50) {
                const q = T([x + (R() - 0.5) * 0.7, y + bow * x * x - 3 + (R() - 0.5) * 1.1]);
                pts.push({ x: q[0], y: q[1], r: 0.5 + R() * 0.3, a: -Math.PI / 2 + th });
                x += 1.3 + R() * 0.8;
            }
        }
        const binding = (x, y) => Ti(x, y)[1] > 36.5;
        const o = { D: 13, cx: X0, cy: Y0, rx: 44, ry: 48, step: 1.6, sw: 0.45, cw, wob: 1.0,
            edgeSkip: 0.42, noEdge: binding, sheen };

        // Тональные массы подушки: середина, свет пятном сверху-слева, тень
        // снизу-справа и потемнение уходящего края — мягкими градиентами, без
        // обводки. Лоск — радиальные пятна и полоса-дуга своего светлого
        // тона (край в ноль); велюровая кромка — светлый обод со стороны света.
        const [deep, shadow, mid, lit, hi] = tones;
        const arcD = cr(ARC.map(T), false), a0 = T(ARC[0]), a1 = T(ARC[ARC.length - 1]);
        const gl = SH.map(([cx, cy, rx, ry, rot, k]) => {
            const c = T([cx, cy]);
            // Прозрачность — заливки, а не фигуры: у эллипса без штриха это
            // одно и то же, но без отдельного слоя смешивания.
            return `<ellipse cx="${f(c[0])}" cy="${f(c[1])}" rx="${rx}" ry="${ry}" transform="rotate(${f(rot - 24)} ${f(c[0])} ${f(c[1])})" fill="url(#${I('g')})" fill-opacity="${(0.55 * k).toFixed(2)}"/>`;
        }).join('');
        const defs = `<defs><clipPath id="${I('c')}"><path d="${d}"/></clipPath>`
            + `<radialGradient id="${I('l')}" cx="572" cy="452" r="46" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${hi}"/><stop offset=".45" stop-color="${lit}" stop-opacity=".85"/><stop offset="1" stop-color="${lit}" stop-opacity="0"/></radialGradient>`
            + `<linearGradient id="${I('s')}" x1="580" y1="455" x2="640" y2="515" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${shadow}" stop-opacity="0"/><stop offset=".55" stop-color="${shadow}" stop-opacity=".55"/><stop offset="1" stop-color="${deep}" stop-opacity=".9"/></linearGradient>`
            + `<radialGradient id="${I('g')}"><stop offset="0" stop-color="${sheenC}" stop-opacity=".8"/><stop offset=".55" stop-color="${sheenC}" stop-opacity=".3"/><stop offset="1" stop-color="${sheenC}" stop-opacity="0"/></radialGradient>`
            + `<linearGradient id="${I('r')}" x1="560" y1="445" x2="615" y2="500" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${sheenC}" stop-opacity=".35"/><stop offset=".6" stop-color="${sheenC}" stop-opacity="0"/></linearGradient>`
            + `<linearGradient id="${I('a')}" x1="${f(a0[0])}" y1="${f(a0[1])}" x2="${f(a1[0])}" y2="${f(a1[1])}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${sheenC}" stop-opacity="0"/><stop offset=".45" stop-color="${sheenC}"/><stop offset="1" stop-color="${sheenC}" stop-opacity="0"/></linearGradient></defs>`;
        // Всё, что внутри силуэта, — одной группой с одним клипом (в
        // наброске их было две подряд с тем же клипом; вид тот же).
        const body = `<path d="${d}" fill="${mid}"/>`
            + `<g clip-path="url(#${I('c')})">`
            + `<path d="${d}" fill="url(#${I('s')})"/><path d="${d}" fill="url(#${I('l')})"/>`
            + `<path d="${d}" fill="none" stroke="url(#${I('s')})" stroke-width="8"/>`
            + gl
            + [[13, 0.1], [8, 0.13], [4, 0.14]].map(([w, op]) => `<path d="${arcD}" fill="none" stroke="url(#${I('a')})" stroke-opacity="${op}" stroke-width="${w}" stroke-linecap="round"/>`).join('')
            + `<path d="${d}" fill="none" stroke="url(#${I('r')})" stroke-width="2.4"/></g>`;
        const cz = crease([[28, 2], [29.5, 12], [30, 22]].map(T), [ramp[0], ramp[6]]);
        const t = terry(poly, o, pts.filter((q) => !binding(q.x, q.y)));
        // Бордюр манжеты: гладкая полоса пудровой шампани по нижней кромке,
        // строчка по ней, под ней — узкая тёмная щель входа.
        const [bdk, bface, bhi] = bind;
        const bl = [[-27, 39], [-10, 40.3], [8, 40.3], [28.5, 39]].map(T), br = [[-26.5, 43.5], [-10, 45], [8, 45], [28, 43.5]].map(T);
        const bd = cr(bl, false) + cr(br.slice().reverse(), false).replace(/^M/, 'L') + 'Z';
        const mouth = cr([[-24, 44], [-8, 46.8], [10, 46.8], [26, 44]].map(T), false);
        const cuff = `<path d="${mouth}" fill="none" stroke="${mouthC}" stroke-width="1.6" stroke-linecap="round"/>`
            + `<path d="${bd}" fill="${bface}"/><path d="${cr(bl, false)}" fill="none" stroke="${bhi}" stroke-width=".9"/>`
            + `<path d="${cr([[-26, 42.3], [-10, 43.6], [8, 43.6], [27.5, 42.3]].map(T), false)}" fill="none" stroke="${bdk}" stroke-width=".45" stroke-dasharray="1.6 .9"/>`
            + `<path d="${cr(br, false)}" fill="none" stroke="${bdk}" stroke-width=".8"/>`;
        // Петля со шва манжеты — свисает через перекладину, поверх сетки.
        const h = T([27, 41]), hx = h[0], hy = h[1];
        const loop = tape(`M${f(hx)} ${f(hy)}C${f(hx + 5)} ${f(hy + 10)} ${f(hx + 6)} ${f(hy + 26)} ${f(hx + 3)} ${f(hy + 36)}C${f(hx)} ${f(hy + 42)} ${f(hx - 6)} ${f(hy + 38)} ${f(hx - 5)} ${f(hy + 30)}C${f(hx - 4)} ${f(hy + 20)} ${f(hx - 3)} ${f(hy + 10)} ${f(hx - 2)} ${f(hy + 3)}`, bind);
        const home = (s) => `<g transform="translate(-573 -492)">${s}</g>`;
        return { main: home(defs + body + cz + t + cuff), front: home(loop) };
    },

    // ---------- 7. ГУБКА КОНЯКУ ----------
    // Прозрачный фиолетово-лазурный пузырь-кисель, а в нём семь комочков
    // губки, которые медленно плавают (цикл 8 с). Спа-вещь, мостик к
    // волшебному облачку. Набросок игрока (художник-агент, заход 4, d2) один
    // в один: генератор тот же, ход случая тот же.
    //
    // Что держит вещь (заметки художника, sp7/notes4.md):
    // * ОДНА мягкая вещь в двух посадках. На полке осела под своим весом
    //   (sag = 1: тяжёлое дно), в руке и на иконке — полный шар (sag = 0;
    //   просьба игрока: «в руке полностью круглая»). Подняли — округлилась
    //   с упругим качем, положили — осела. Поэтому контур и ВСЁ, что к нему
    //   привязано (кисель, вуаль, стенка, клип, перелив, налёт, нити света,
    //   каустика), строится одной функцией от sag с постоянным числом узлов,
    //   а комочки при оседании сплющиваются вместе с киселём одной матрицей.
    // * Цвет — КОНТРАСТОМ: темнее всего край и дно (там толща), лазурный
    //   свет в середине и у макушки, комочки фиолетовые и гуще киселя;
    //   дальние растворены вуалью, ближний самый контрастный. Обводка почти
    //   погашена, блеск — широкая полоса налёта и нить света, а не точечный
    //   блик (с ним — «таблетка»).
    //
    // Жить в игре. Двигаются ТОЛЬКО transform комочков ([data-lump]) — общим
    // живым циклом ванной (bath-soap.js, wake): пока ванная открыта и вещь
    // видна, не под магазином и не на переезде камеры. Иконка магазина —
    // шар без движения. Посадка меняется правкой `d` ТОЛЬКО во время
    // перехода (reshape: подняли, положили), дальше — ни одной записи. Без
    // фильтров, масок и прозрачности групп (traps, п. 73): прозрачность на
    // фигурах и в стопах. Клип по внутренней стенке — на двух группах без
    // прозрачности (не отдельный буфер смешивания): без него комочки
    // вылезали бы за пузырь.
    //
    // Рисуется в координатах сцены, как в наброске, и сводится к гнезду
    // одним transform (как рукавица).
    KONJAC: { T: 8, LIFT_MS: 1600 },
    kt: 0,              // часы комочков: идут, только пока они двигаются
    ktShown: 0,         // поза, записанная последней (пишется реже, чем идут часы)

    konjac(where) {
        if (!this._konjac) this._konjac = this.konjacArt();
        if (typeof BATH_SOAP !== 'undefined' && BATH_SOAP.wake) { BATH_SOAP.live.dirty = true; BATH_SOAP.wake(); }
        // Комочки — в той позе, в какой их видно сейчас: вещь, перерисованная
        // в руку, не дёргается относительно полочной.
        return this.stamp(this._konjac.frag(where === 'shelf' ? 1 : 0, this.ktShown), 'bt-cloth-konjac', 'bcj');
    },

    // Генератор наброска d2: { frag(sag, t), geo(sag), pose(t) }; '@ID' —
    // место под id. Числа, случай и округление — как у художника: с другим
    // ходом случая поры легли бы иначе, чем выбрал игрок.
    konjacArt() {
        const P = btPal(), A = BATH_ART.slots().cloth, T = this.KONJAC.T, W = STROKE.detail;
        const [lit, cauC, lowC, edgeC] = P.konjacLight, [pd, pl] = P.konjacPore;
        const [h0, h1] = P.konjacHalo, Ki = P.konjacKisel, Ve = P.konjacVeil, Wa = P.konjacWall, Ir = P.konjacIri;
        const f = (v) => +(+v).toFixed(2);
        // Случай наброска — линейный конгруэнтный, не mulberry и не btRng.
        const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
        const st = (S) => S.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('');
        const rg = (id, cx, cy, r, S, ex = '') => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" ${ex}>${st(S)}</radialGradient>`;
        const lg = (id, x1, y1, x2, y2, S, ex = '') => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${ex}>${st(S)}</linearGradient>`;
        const US = 'gradientUnits="userSpaceOnUse"';
        const inside = (Q, x, y) => { let c = false; for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) { const [xi, yi] = Q[i], [xj, yj] = Q[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
        const cub = (a, b, c, d, t) => { const m = 1 - t; return [m * m * m * a[0] + 3 * m * m * t * b[0] + 3 * m * t * t * c[0] + t * t * t * d[0], m * m * m * a[1] + 3 * m * m * t * b[1] + 3 * m * t * t * c[1] + t * t * t * d[1]]; };
        const lerp = (a, b, s) => a + (b - a) * s;

        // ---- оболочка: шар ↔ осевшая капля, 16 точек (5 кубиков) у обеих ----
        const SHELF = [[589, 439], [613, 439], [633, 458], [637, 482], [640, 502], [632, 520], [612, 525], [600, 528], [578, 528], [566, 525], [546, 520], [538, 502], [541, 482], [545, 458], [565, 439], [589, 439]];
        const BALL = (() => {
            const c = [589, 482], R = 46, An = [-90, 0, 62, 118, 180, 270].map(a => a * Math.PI / 180), Q = [];
            const pt = (a) => [c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)], tg = (a) => [-Math.sin(a), Math.cos(a)];
            Q.push(pt(An[0]));
            for (let i = 0; i < 5; i++) {
                const a0 = An[i], a1 = An[i + 1], k = 4 / 3 * Math.tan((a1 - a0) / 4) * R, p0 = pt(a0), p1 = pt(a1), t0 = tg(a0), t1 = tg(a1);
                Q.push([p0[0] + k * t0[0], p0[1] + k * t0[1]], [p1[0] - k * t1[0], p1[1] - k * t1[1]], p1);
            }
            return Q;
        })();
        const shell = (s) => BALL.map((p, i) => [lerp(p[0], SHELF[i][0], s), lerp(p[1], SHELF[i][1], s)]);
        const center = (s) => [589, lerp(482, 484, s)];
        const scaleP = (Q, k, c) => Q.map(([x, y]) => [c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k]);
        const dS = (S) => { let d = `M${S[0].map(f).join(' ')}`; for (let i = 1; i < S.length; i += 3) d += `C${[S[i], S[i + 1], S[i + 2]].map(p => p.map(f).join(' ')).join(' ')}`; return d + 'Z'; };
        const poly = (S, n = 24) => { const Q = []; for (let i = 1; i < S.length; i += 3) for (let k = 0; k < n; k++) Q.push(cub(S[i - 1], S[i], S[i + 1], S[i + 2], k / n)); return Q; };
        // Гладкая кривая через точки (Катмулл — Ром); число узлов — от числа точек.
        const smooth = (Q, closed) => {
            const n = Q.length, g = (i) => Q[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
            let d = `M${Q[0].map(f).join(' ')}`;
            for (let i = 0; i < (closed ? n : n - 1); i++) {
                const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
                d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
            }
            return d + (closed ? 'Z' : '');
        };
        const idx = (a, b, step) => { const r = []; for (let i = a; ; i += step) { r.push(((i % 120) + 120) % 120); if (i >= b) break; } return r; };

        // ---- комочек ----
        const blobPts = (r, seed) => {
            const q = rng(seed), a2 = 0.05 + 0.05 * q(), p2 = 6.3 * q(), a3 = 0.03 + 0.04 * q(), p3 = 6.3 * q();
            return Array.from({ length: 10 }, (_, k) => { const t = 2 * Math.PI * k / 10, R = r * (1 + a2 * Math.cos(2 * t + p2) + a3 * Math.cos(3 * t + p3)); return [R * Math.cos(t), R * Math.sin(t)]; });
        };
        const pores = (Q, r, o) => {
            const q = rng(o.seed), out = [];
            for (let t = 0; t < o.n * 60 && out.length < o.n; t++) {
                const x = (q() * 2 - 1) * r, y = (q() * 2 - 1) * r;
                if (!inside(Q, x, y)) continue;
                const u = Math.hypot(x, y) / r;
                if (u > 0.93) continue;
                const z = q(), s = z < 0.12 ? 1.9 : z < 0.45 ? 1.25 : 0.8, rr = o.pr * s * (1.05 - 0.45 * u * u) * (0.85 + 0.3 * q());
                if (out.some(p => Math.hypot(p.x - x, p.y - y) < (p.r + rr) * 1.55 + q() * 0.5)) continue;
                out.push({ x, y, r: rr, u, a: Math.atan2(y, x), j: q() });
            }
            return out;
        };
        // Пора — круг под матрицей: к краю комочка сплющена вдоль кромки
        // (сфера в ракурсе), на свету бледнее; три ступени по глубине.
        // В наброске пора — <use> шаблона из двух эллипсов (провал и светлая
        // стенка), и их под две сотни на вещь: живой комочек перерисовывал
        // их на каждом кадре, и кадр с конняку в руке падал вдвое против
        // рукавицы (замер, 4× замедление). Здесь те же эллипсы под той же
        // матрицей посчитаны в путь (образ эллипса под аффинной матрицей —
        // эллипс: оси — сингулярное разложение), и поры одной ступени и
        // одного тона — ОДНИМ путём. Поры не налегают друг на друга, поэтому
        // «все провалы, потом все стенки» рисуют то же, что «пора за порой».
        const ell = (m, cx, cy, rx, ry) => {
            const p = m[0] * rx, q = m[2] * ry, r = m[1] * rx, s = m[3] * ry;
            const E = (p + s) / 2, F = (p - s) / 2, G = (r + q) / 2, H = (r - q) / 2, Qh = Math.hypot(E, H), Rh = Math.hypot(F, G);
            const s1 = Qh + Rh, s2 = Math.abs(Qh - Rh), th = (Math.atan2(H, E) + Math.atan2(G, F)) / 2;
            const X = m[0] * cx + m[2] * cy + m[4], Y = m[1] * cx + m[3] * cy + m[5], ux = Math.cos(th) * s1, uy = Math.sin(th) * s1;
            // Две половины дугами; второй набор чисел — та же команда `a`
            // (повтор команды по правилам пути), угол — до градуса, ноль перед
            // точкой срезан: путей много, и каждый символ — на каждой вставке.
            // Пробел опускается только перед минусом: «0» и «.82» без пробела
            // читаются одним числом «0.82», и путь обрывался.
            const n = (v) => String(f(v)).replace(/^(-?)0\./, '$1.'), sp = (v) => (v < 0 ? '' : ' ') + n(v);
            const arc = `${n(s1)} ${n(s2)} ${Math.round(th * 180 / Math.PI)} 0 1`;
            return `M${n(X + ux)}${sp(Y + uy)}a${arc}${sp(-2 * ux)}${sp(-2 * uy)} ${arc}${sp(2 * ux)}${sp(2 * uy)}z`;
        };
        const PORE = [[0.12, 0.3], [0.24, 0.5], [0.4, 0.72]];      // [провал, стенка] — прозрачность по ступени
        const poreAt = (p, r, fade) => {
            const sq = 1 - 0.55 * p.u * p.u, c = Math.cos(p.a), n = Math.sin(p.a);
            const a = p.r * (c * c * sq + n * n), b = p.r * c * n * (sq - 1), d = p.r * (n * n * sq + c * c);
            const lt = Math.max(0, 1 - Math.hypot(p.x + 0.35 * r, p.y + 0.4 * r) / (1.5 * r));
            const w = ((1 - 0.8 * p.u * p.u) * (0.55 + 0.45 * lt) + 0.25 * (p.j - 0.5)) * fade;
            if (w < 0.16) return null;
            const m = [f(a), f(b), f(b), f(d), f(p.x), f(p.y)];
            return { k: w > 0.62 ? 2 : w > 0.38 ? 1 : 0, dark: ell(m, 0, 0, 1, 1), lit: ell(m, 0.38, 0.42, 0.55, 0.4) };
        };
        const lump = (id, i, L) => {
            const Q = blobPts(L.r, L.seed), D = L.dens, ps = pores(Q, L.r, { seed: L.seed + 3, n: Math.round(L.r * L.r * 0.55), pr: 0.42 + L.r * 0.032 });
            const Al = (a) => f(a * (0.45 + 0.55 * D)), [c0, c1, c2, c3] = P.konjacLump;
            const def = rg(`${id}l${i}`, 0.42, 0.4, 0.66, [[0, c0, Al(1)], [0.45, c1, Al(0.96)], [0.8, c2, Al(0.92)], [0.93, c3, f(0.3 + 0.6 * D)], [1, c3, f(0.12 + 0.4 * D)]]);
            let s = `<circle r="${f(L.r * 1.6)}" fill="url(#${id}h)" fill-opacity="${f(0.3 + 0.6 * D)}"/>`;
            s += `<path d="${smooth(Q, true)}" fill="url(#${id}l${i})"/>`;
            const dk = ['', '', ''], li = ['', '', ''];
            ps.forEach(p => { const o = poreAt(p, L.r, 0.45 + 0.55 * D); if (o) { dk[o.k] += o.dark; li[o.k] += o.lit; } });
            s += dk.map((d, k) => d ? `<path d="${d}" fill="${pd}" fill-opacity="${PORE[k][0]}"/>` : '').join('');
            s += li.map((d, k) => d ? `<path d="${d}" fill="${pl}" fill-opacity="${PORE[k][1]}"/>` : '').join('');
            s += `<ellipse cx="${f(L.r * 0.3)}" cy="${f(L.r * 0.36)}" rx="${f(L.r * 0.42)}" ry="${f(L.r * 0.26)}" transform="rotate(-35 ${f(L.r * 0.3)} ${f(L.r * 0.36)})" fill="url(#${id}c)"/>`;
            s += `<ellipse cx="${f(-L.r * 0.34)}" cy="${f(-L.r * 0.4)}" rx="${f(L.r * 0.5)}" ry="${f(L.r * 0.3)}" transform="rotate(-35 ${f(-L.r * 0.34)} ${f(-L.r * 0.4)})" fill="url(#${id}s)"/>`;
            return { def, body: s };
        };

        // ---- движение: две гармоники по осям, поворот и дыхание ----
        const makePose = (Ls) => {
            const w = 2 * Math.PI / T;
            return (t) => Ls.map(L => {
                const m = L.m;
                const x = L.x + m.ax * Math.sin(m.nx * w * t + m.px) + m.bx * Math.sin(m.mx * w * t + m.qx);
                const y = L.y + m.ay * Math.sin(m.ny * w * t + m.py) + m.by * Math.sin(m.my * w * t + m.qy);
                const rot = m.rot * Math.sin(m.nr * w * t + m.pr), sq = m.sq * Math.sin(m.ns * w * t + m.ps);
                return { tr: `translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${f(1 + sq)} ${f(1 / (1 + sq))})` };
            });
        };
        const motion = (L, seed) => {
            const q = rng(seed), k = 1 - 0.45 * L.dens * Math.min(1, L.r / 14), h = () => 1 + Math.floor(q() * 2), ph = () => 6.283 * q();
            return { ax: (2.6 + 3 * q()) * k * L.amp, bx: (0.8 + 1.2 * q()) * k * L.amp, ay: (2 + 2.4 * q()) * k * L.amp, by: (0.6 + 1 * q()) * k * L.amp,
                nx: h(), mx: 3, ny: h(), my: 2 + Math.floor(q() * 2), px: ph(), qx: ph(), py: ph(), qy: ph(),
                rot: 4 + 6 * q(), nr: 1, pr: ph(), sq: 0.025 + 0.035 * (1 - L.dens * 0.5), ns: 2 + Math.floor(q() * 2), ps: ph() };
        };
        // Оседание сплющивает комочки вместе с киселём: одна матрица на
        // группу (шире, ниже, чуть вниз).
        const sagM = (s) => { const a = 1 + 0.1 * s, d = 1 - 0.06 * s; return { a, d, e: 589 * (1 - a), f: 528 * (1 - d) + 1.5 * s }; };
        const sagStr = (s) => { const m = sagM(s); return `matrix(${f(m.a)} 0 0 ${f(m.d)} ${f(m.e)} ${f(m.f)})`; };

        // Партия комочков: координаты заданы на полке и переведены в шар
        // обратной матрицей. [x, y, радиус, густота, дальний, зерно, размах].
        const id = '@ID-', M1 = sagM(1);
        const Ls = [[570, 467, 8.5, 0.15, 1, 21], [621, 489, 6, 0.85, 1, 22], [600, 458, 5, 0.3, 1, 26],
            [580, 486, 13, 1, 0, 23, 0.8], [609, 471, 9.5, 0.35, 0, 24, 0.75], [604, 501, 5.5, 0.9, 0, 25], [563, 503, 4.2, 0.4, 0, 27]]
            .map(([x, y, r, dens, far, seed, amp = 1]) => ({ x: (x - M1.e) / M1.a, y: (y - M1.f) / M1.d, r, dens, far: !!far, seed, amp }));
        Ls.forEach((L, i) => { L.m = motion(L, 2 * 31 + i * 7); });
        const pose = makePose(Ls), parts = Ls.map((L, i) => lump(id, i, L));
        const defs = parts.map(p => p.def).join('')
            + rg(id + 'c', 0.5, 0.5, 0.5, [[0, cauC, 0.55], [1, cauC, 0]])
            + rg(id + 's', 0.5, 0.5, 0.5, [[0, lit, 0.42], [0.6, lit, 0.12], [1, lit, 0]])
            + rg(id + 'h', 0.5, 0.5, 0.5, [[0, h0, 0.5], [0.55, h1, 0.26], [1, h1, 0]])
            + rg(id + 'k', 0.46, 0.4, 0.62, [[0, Ki[0], 0.6], [0.45, Ki[1], 0.5], [0.78, Ki[2], 0.55], [1, Ki[3], 0.78]])
            + rg(id + 'v', 0.46, 0.4, 0.62, [[0, Ve[0], 0.3], [0.7, Ve[1], 0.32], [1, Ve[2], 0.4]])
            + rg(id + 'o', 0.46, 0.4, 0.62, [[0, lit, 0], [0.66, Wa[0], 0.05], [0.84, Wa[1], 0.3], [0.95, Wa[2], 0.72], [1, Wa[3], 0.88]])
            + rg(id + 'g', 0.5, 0.5, 0.5, [[0, cauC, 0.6], [1, cauC, 0]])
            + lg(id + 'r', 541, 505, 610, 440, [[0, lit, 0], [0.35, lit, 0.75], [1, lit, 0]], US)
            + lg(id + 'i', 540, 440, 640, 528, [[0, Ir[0]], [0.25, Ir[1]], [0.42, Ir[2]], [0.6, Ir[3]], [0.8, Ir[4]], [1, Ir[0]]], US);

        // Всё, что зависит от посадки, — функция sag с постоянным числом
        // узлов: переход правит те же атрибуты, что рисует первый кадр.
        const geo = (s) => {
            const S = shell(s), c = center(s), Q = poly(S), IN = scaleP(S, 0.94, c);
            const at = (I, k, dy = 0) => I.map(i => [c[0] + (Q[i][0] - c[0]) * k, c[1] + (Q[i][1] - c[1]) * k + dy]);
            const bandO = at(idx(102, 136, 3), 0.93), bandI = at(idx(102, 136, 3), 0.83, 2.5).reverse();
            const cau = at([38], 0.72)[0];
            return {
                s: dS(S), in: dS(IN),
                lit: smooth(at(idx(86, 128, 4), 0.955), false),        // нить света: слева-снизу через макушку
                low: smooth(at(idx(28, 48, 4), 0.95), false),          // отражённая нить внизу справа
                band: smooth(bandO.concat(bandI), true),               // широкая полоса налёта по макушке
                iri: smooth(at(idx(0, 119, 4), 0.975), true),          // перелив — чуть ВНУТРИ тёмного края
                cx: f(cau[0]), cy: f(cau[1]), cau: `rotate(-35 ${f(cau[0])} ${f(cau[1])})`,
                sag: sagStr(s)
            };
        };
        const frag = (s, t = 0) => {
            const G = geo(s), Q = pose(t);
            const lumpG = (sel) => `<g data-j="sag" transform="${G.sag}">` + Ls.map((L, i) => sel(L) ? `<g data-lump="${i}" transform="${Q[i].tr}">${parts[i].body}</g>` : '').join('') + `</g>`;
            let o = `<defs>${defs}<clipPath id="${id}q"><path data-j="in" d="${G.in}"/></clipPath></defs>`;
            o += `<path data-j="s" d="${G.s}" fill="url(#${id}k)"/>`;
            o += `<g clip-path="url(#${id}q)">${lumpG(L => L.far)}</g>`;
            o += `<path data-j="in" d="${G.in}" fill="url(#${id}v)"/>`;
            o += `<g clip-path="url(#${id}q)">${lumpG(L => !L.far)}</g>`;
            o += `<path data-j="s" d="${G.s}" fill="url(#${id}o)"/>`;
            o += `<path data-j="s" d="${G.s}" fill="none" stroke="${edgeC}" stroke-opacity=".16" stroke-width="${W}"/>`;
            o += `<path data-j="iri" d="${G.iri}" fill="none" stroke="url(#${id}i)" stroke-opacity=".75" stroke-width="${1.1 * W}"/>`;
            o += `<path data-j="band" d="${G.band}" fill="${lit}" fill-opacity=".18"/>`;
            o += `<path data-j="lit" d="${G.lit}" fill="none" stroke="url(#${id}r)" stroke-width="${2 * W}" stroke-linecap="round"/>`;
            o += `<ellipse data-j="cau" cx="${G.cx}" cy="${G.cy}" rx="13" ry="6" transform="${G.cau}" fill="url(#${id}g)"/>`;
            o += `<path data-j="low" d="${G.low}" fill="none" stroke="${lowC}" stroke-opacity=".3" stroke-width="${1.1 * W}" stroke-linecap="round"/>`;
            return `<g transform="translate(${-A.x} ${-A.y})">${o}</g>`;
        };
        return { frag, geo, pose };
    },

    // Узлы живой копии, найденные один раз.
    konjacNodes(r) {
        const C = this._kjNodes || (this._kjNodes = new WeakMap());
        let c = C.get(r);
        if (!c) {
            const all = (s) => Array.from(r.querySelectorAll(s));
            c = { lumps: all('[data-lump]') };
            for (const k of ['s', 'in', 'iri', 'band', 'lit', 'low', 'cau', 'sag']) c[k] = all(`[data-j="${k}"]`);
            C.set(r, c);
        }
        return c;
    },

    // Шаг живого цикла (bath-soap.js, wake): roots — видимые копии.
    // Комочки стоят, пока вещью трут (как флакон: палец смотрит на пену) и
    // пока она парит: у парящего холста ореол — тень-фильтр, и живая
    // картинка под ним пересчитывала бы тень на каждом кадре. Часы
    // комочков в это время тоже стоят — поэтому вещь, перерисованная в
    // руку, продолжает с той же позы, без скачка.
    liveTick(roots, now, rub) {
        const dt = this._liveAt ? Math.min(0.1, (now - this._liveAt) / 1000) : 0;
        this._liveAt = now;
        if (!this._konjac || rub) return;
        const run = roots.filter(r => !r.closest('.bt-float'));
        if (!run.length) return;
        this.kt = (this.kt + dt) % this.KONJAC.T;
        // 15 кадров хватает: комочек проплывает за секунду пару единиц, и
        // шаг в десятую долю единицы на глаз не отличить от вдвое меньшего,
        // а каждая запись — перерисовка всей вещи (замер: с 30 кадрами
        // полка рисовалась вдвое дольше, чем с рукавицей).
        if (now - (this._kjWrote || 0) < 60) return;
        this._kjWrote = now;
        this.ktShown = this.kt;
        const Q = this._konjac.pose(this.kt);
        const set = (el, k, v) => { if (el.getAttribute(k) !== v) el.setAttribute(k, v); };
        run.forEach(r => this.konjacNodes(r).lumps.forEach(g => set(g, 'transform', Q[+g.dataset.lump].tr)));
    },

    // Копия на полке встаёт в позу летевшей: пока вещь была в руке, полочная
    // стояла спрятанной, и комочки в ней остались там, где их взяли.
    // Посадка (lust.js, flyHome) — подмена одной копии другой, и скачок
    // комочков был бы виден; сразу после неё едет камера, и цикл стоит.
    syncPose(root) {
        const r = root && root.querySelector && root.querySelector('.bt-cloth-konjac');
        if (!r || !this._konjac) return;
        const Q = this._konjac.pose(this.ktShown);
        this.konjacNodes(r).lumps.forEach(g => { const v = Q[+g.dataset.lump].tr; if (g.getAttribute('transform') !== v) g.setAttribute('transform', v); });
    },

    // Посадка: sag → атрибуты контура и всего, что к нему привязано.
    // Пишется только изменившееся.
    sagTo(r, s) {
        const c = this.konjacNodes(r), G = this._konjac.geo(s);
        const set = (el, k, v) => { if (el.getAttribute(k) !== v) el.setAttribute(k, v); };
        for (const k of ['s', 'in', 'iri', 'band', 'lit', 'low']) c[k].forEach(el => set(el, 'd', G[k]));
        c.cau.forEach(el => { set(el, 'cx', String(G.cx)); set(el, 'cy', String(G.cy)); set(el, 'transform', G.cau); });
        c.sag.forEach(el => set(el, 'transform', G.sag));
    },

    // Переход посадки — ТОЛЬКО пока вещь поднимают или кладут, потом ни
    // одной записи. root — холст или группа, где лежит копия (без конняку —
    // ничего). 'lift': полка → рука, осевшая округляется с упругим качем
    // (вытянется и вернётся); первый кадр ставится сразу, до отрисовки.
    // 'land': рука → полка за dur мс полёта домой; вторую половину пути
    // оседает с качем и к посадке ровно осевшая — копия на полке встаёт на
    // её место без подмены. На переезде камеры переход доводится сразу:
    // сцена едет готовой текстурой (docs/traps.md, п. 150).
    reshape(root, mode, dur) {
        const r = root && (root.classList && root.classList.contains('bt-cloth-konjac') ? root
                  : root.querySelector && root.querySelector('.bt-cloth-konjac'));
        if (!r || !this._konjac || typeof requestAnimationFrame === 'undefined') return;
        const lift = mode === 'lift', ms = lift ? this.KONJAC.LIFT_MS : Math.max(1, dur || 600);
        const curve = lift
            ? (u) => Math.exp(-3.6 * u) * Math.cos(2 * Math.PI * 1.25 * u) * (1 - u * u * u)
            : (u) => { const v = Math.max(0, (u - 0.5) / 0.5); return 1 - Math.exp(-4 * v) * Math.cos(2 * Math.PI * 1.2 * v) * (1 - v * v * v); };
        const M = this._morphs || (this._morphs = new Map());
        if (M.has(r)) cancelAnimationFrame(M.get(r).raf);
        const job = { end: () => this.sagTo(r, lift ? 0 : 1), raf: 0 }, t0 = performance.now();
        const step = (t) => {
            if (!r.isConnected) { M.delete(r); return; }
            const L0 = typeof LustMinigame !== 'undefined' ? LustMinigame : null;
            const u = L0 && L0.camTimer ? 1 : Math.min(1, (t - t0) / ms);
            this.sagTo(r, curve(u));
            if (u < 1) job.raf = requestAnimationFrame(step); else M.delete(r);
        };
        this.sagTo(r, curve(0));
        M.set(r, job);
        job.raf = requestAnimationFrame(step);
    },

    // Ушли из ванной — переходы доводятся сразу и больше не крутятся.
    stop() {
        if (!this._morphs) return;
        this._morphs.forEach((job, r) => { cancelAnimationFrame(job.raf); if (r.isConnected) job.end(); });
        this._morphs.clear();
    }
};

// Пути тряпки (ступень 0) — набросок v1 прогона 4, перенесённый один в один
// (см. BATH_CLOTH.rag). Координаты относительно гнезда мочалки (573, 492),
// команды относительные — так короче. Порядок в массивах — порядок рисования.
const BATH_RAG_PATHS = {
    // Лист у задней сетки.
    sheet: {
        face: 'm-22-4c.5-.6 1.6-1.8 2.3-2.7 .8-.8 1.6-1.7 2.4-2.6 .8-.8 1.7-1.7 2.6-2.4 .9-.8 1.9-1.4 2.9-2 1.1-.5 2.2-1 3.3-1.3 1.1-.4 2.3-.6 3.5-.8 1.1-.2 2.3-.2 3.5-.2 1.2 .1 2.3 .5 3.5 .8 1.1 .3 2.2 .7 3.3 1.1 1.2 .3 2.3 .7 3.4 .9 1.2 .2 2.4 .2 3.6 0 1.1-.1 2.3-.6 3.4-.9 1.1-.4 2.1-1 3.2-1.4 1.1-.4 2.2-.9 3.4-1.2 1.1-.2 2.3-.3 3.5-.3 1.2 .1 2.3 .4 3.5 .7 1.1 .3 2.2 .8 3.4 1 1.1 .2 2.3 .3 3.5 .2 1.2-.1 2.3-.4 3.4-.8 1.2-.3 2.5-1.2 3.4-1.1 .9 .1 1.3 1 2 1.5 .7 .5 1.4 1 2 1.5 .7 .5 1.4 1 2.1 1.5 .6 .5 1.3 1 2 1.5 .7 .4 1.3 .9 2 1.5 .7 .5 1.3 1 2 1.5 .7 .5 1.3 1 2 1.5 .7 .5 1.3 1 2 1.6 .6 .5 1.3 1 1.9 1.5 .7 .5 1.4 1 2 1.5 .7 .6 1.3 1.1 2 1.6 .7 .5 1.3 1 2 1.6 .6 .5 1.3 1 1.9 1.5 .6 .6 1.3 1.1 1.9 1.7 .6 .6 1.2 1.2 1.8 1.8 .5 .6 1.1 1.2 1.5 1.9 .5 .7 .8 1.5 1 2.3 .2 .8 .3 1.7 .3 2.5 .1 .8-.1 1.7-.1 2.5-.1 .8 .6 2-.3 2.5-.9 .5-3.3 .2-5 .3-1.6 .1-3.3 .2-5 .3-1.6 .1-3.3 .1-4.9 .2-1.7 .1-3.3 .2-5 .3-1.7 .1-3.3 .2-5 .3-1.6 .1-3.3 .3-4.9 .3-1.7 .1-3.4 .2-5 .3-1.7 0-3.3 0-5 0-1.7-.1-3.3-.2-5-.3-1.6-.1-3.3-.3-4.9-.4-1.7-.1-3.4-.3-5-.3-1.7-.1-3.4-.2-5 0-1.6 .2-3.3 .5-4.9 1-1.5 .5-3 1.4-4.5 2-1.6 .6-3.2 1-4.8 1.5-1.6 .4-3.2 .8-4.8 1.1-1.7 .2-3.3 .5-5 .4-1.6 0-3.3-.3-4.9-.7-1.6-.4-3.2-1-4.7-1.6-1.6-.5-3.9-1.2-4.7-1.7-.8-.5-.2-.8-.2-1.3-.1-.4-.2-.8-.3-1.2-.1-.4-.2-.8-.3-1.3-.1-.4-.2-.8-.2-1.2-.1-.4-.2-.8-.3-1.3-.1-.4-.1-.8-.2-1.2-.1-.4-.1-.9-.2-1.3-.1-.4-.1-.8-.2-1.3 0-.4-.1-.8-.1-1.2 0-.5 0-.9 0-1.3 0-.4 0-.9 .1-1.3 0-.4 .1-.8 .2-1.3 0-.4 .1-.8 .2-1.2 .1-.4 .2-.8 .3-1.3 .1-.4 .2-.8 .3-1.2 .1-.4 .2-.8 .4-1.2 .1-.4 .2-.8 .3-1.2 .2-.4 .3-.9 .4-1.3 .2-.4 .3-.8 .4-1.2 .2-.4-.1-.6 .4-1.2z',
        bands: [
            'm-11.5-11.8c.1-1.3 1.2-.6 1.8-.9 .7-.2 1.3-.4 2-.6 .6-.2 1.3-.4 2-.5 .6-.1 1.3-.2 2-.3 .7-.1 1.4-1.2 2-.2 .7 1.1 1.3 4.3 2 6.5 .6 2.2 1.3 4.4 2.1 6.6 .8 2.3 1.9 4.5 2.9 6.8 1 2.2 2.4 4.5 3.1 6.9 .7 2.5 1.3 6.4 1.1 7.9-.2 1.4-1.7 .7-2.5 1.1-.9 .4-1.7 .8-2.6 1.1-.9 .3-1.8 .5-2.7 .7-.9 .2-1.8 .5-2.7 .7-.9 .2-2.1 1.8-2.7 .6-.7-1.3-.8-5.3-1.4-7.9-.7-2.5-1.7-4.9-2.5-7.3-.7-2.4-1.4-4.8-2-7.2-.5-2.4-.8-4.7-1.1-7.1-.3-2.3-1-5.6-.8-6.9z',
            'm-8.5-11.1c-.1-1.2 .5-.2 .8-.3 .3-.1 .6-.2 .9-.2 .3-.1 .6-.2 .9-.3 .3 0 .6-.1 .9-.1 .3-.1 .4-1.3 .9-.2 .4 1 1 4.3 1.6 6.4 .5 2.2 1.1 4.4 1.9 6.6 .7 2.3 1.7 4.4 2.6 6.7 .9 2.3 2.1 4.5 2.7 6.9 .7 2.4 1.2 6.3 1.2 7.6 0 1.3-.8 .3-1.1 .4-.4 .2-.8 .3-1.2 .4-.4 .1-.7 .2-1.1 .3-.4 .1-.8 .2-1.2 .3-.4 .1-.7 1.5-1.1 .3-.4-1.2-.7-5.1-1.3-7.6-.6-2.4-1.7-4.7-2.5-7-.8-2.3-1.6-4.6-2.3-6.8-.6-2.3-1-4.6-1.5-6.8-.4-2.2-1.1-5.5-1.1-6.6z',
            'm12.9-12.3c-.3-1 1.4-.2 2.1-.4 .7-.2 1.3-.5 2-.8 .7-.2 1.3-.5 2-.8 .7-.2 1.3-.5 2-.7 .7-.3 .9-1.6 2.1-.7 1.2 .9 3.4 4.2 5.2 6.3 1.7 2.2 3.4 4.3 5.2 6.5 1.8 2.2 3.7 4.3 5.5 6.5 1.8 2.3 4.2 4.5 5.2 7.2 1 2.7 1.3 7.4 1 8.9-.4 1.6-2 .2-3 .2-1 0-2 .1-3 .1-1 0-2 0-3 0-1 0-2-.1-3-.1-1-.1-2.3 1.1-3-.2-.6-1.4-.1-5.5-1-7.9-.9-2.4-2.8-4.3-4.3-6.4-1.4-2.1-3-4-4.3-6-1.4-2-2.7-4-3.9-5.9-1.3-1.9-3.6-4.7-3.8-5.8z',
            'm17.4-11.7c-.5-1 .6-.2 .9-.3 .2-.1 .5-.2 .8-.3 .3-.1 .6-.2 .8-.3 .3-.1 .6-.2 .9-.3 .2-.1-.1-1.2 .8-.3 .9 .9 3 3.9 4.6 5.9 1.5 2 3 4 4.6 6.1 1.6 2 3.4 4 5 6.1 1.6 2.1 3.7 4.2 4.6 6.7 .9 2.5 .8 6.9 .8 8.3-.1 1.4-.8 0-1.2 .1-.4 0-.8 0-1.2 0-.4 0-.8 0-1.2 0-.4 0-.8 0-1.2 0-.4 0-.9 1.3-1.2 0-.3-1.4 0-5.5-.8-7.9-.9-2.4-2.8-4.4-4.3-6.4-1.4-2.1-3.1-3.9-4.5-5.9-1.4-1.9-2.8-3.9-4.1-5.8-1.4-1.9-3.5-4.7-4.1-5.7z',
            'm-21-5c1.6-1.6 6.1-7.4 10-9 3.9-1.7 8.8-1.2 13.2-1.2 4.4 0 8.8 1.4 13.2 1.2 4.4-.3 8.7-2.1 13-2.5 4.4-.4 10.9-.1 13.3-.1 2.3 .1 .5 .4 .7 .6 .3 .2 .6 .4 .8 .6 .3 .2 .6 .4 .8 .6 .3 .2 .6 .4 .8 .6 .3 .2 3 .5 .8 .6-2.2 .1-9.4-.2-14.1 .2-4.7 .5-9.3 2.2-13.9 2.4-4.7 .2-9.4-1.1-14.1-1-4.6 .1-9.8 0-14 1.6-4.2 1.6-9.3 6.7-11.2 8-1.8 1.2 .1-.4 .2-.6 0-.1 0-.3 .1-.5 0-.2 .1-.3 .1-.5 .1-.2 .1-.4 .1-.5 .1-.2-1.5 1 .2-.5z',
            'm41-15c5 .3 26.8 19.7 32 25 5.2 5.3 2.3 5.8-1 7-3.3 1.2-14.2 1.5-19 0-4.8-1.5-8-3.7-10-9-2-5.3-7-23.3-2-23z'
        ],
        rows: 'm-21.3-4 2.2-2.1 1.8-1.9 2-1.9 2.5-1.5 2.3-1.6 2.8-.7 3.1-.9 3 .2 2.7 .1 2.6 .5 2.9 .9 2.7 .7 2.8 .3 3-.4 2.8-1.1 2.7-1 2.7-1.1 3.1 0 2.8 .2 2.6 .5 2.8 .5 3.1 .3 2.9-.6 2.8-.6m-65.4 13 2.6-1.6 2.2-1.8 1.9-1.6 2.8-1.7 2.4-1.2 3.4-.8 2.5-.9 3-.5 3.3 .3 2.8 .8 2.7 .9 3 .6 3 0 3-.6 3.3-.6 2.5-1 2.8-1.1 3.4-.2 2.6 .5 3 .2 3.2 .6 2.8-.1 2.9-.3 3-.8m-68.4 13 2.6-1.4 2.2-1.3 2.3-1.9 3-1.1 2.6-1.6 3.3-.6 2.8-.7 3.4-.7 2.9-.2 2.9 1 3.2 .6 3.1 .6 3.3-.1 2.9-.2 3-1.1 3.2-.6 3.1-1.1 3.3-.4 2.7 .2 3.3 .5 3 .6 3.3-.1 3-.2 3.4-.9m-72.1 12.8 2.2-1.5 2.5-.8 3.1-1.3 2.5-1.5 3.3-1.1 3.1-.9 3-1 3.6-.5 3.2-.2 3.3 .6 2.9 .5 3.5 .7 3.1 .1 3.5-.6 3-.8 3.1-.8 3-.7 3.7-.3 3.2 0 3.2 .5 3.1 .5 3.1-.1 3.2-.6 3.5-.9m-75.3 12.7 2.6-.8 2.6-1.4 2.9-.8 3-1.5 3.6-.9 3-.9 3.3-1 3.3-.8 3.6 0 3.4 .1 3.2 .5 3.1 .6 3.8 .3 3.3-.3 3.1-1.1 3.4-.7 3.2-.7 3.6-.3 3.3 .3 3.7 .1 2.9 .1 3.8 0 3.3-.3 3.2-.6m-78.8 12 3.1-.8 3.1-.6 2.7-1.1 3.5-.9 3.3-1 3.5-.9 3.4-1.3 3.3-.9 3.2-.2 3.9 .2 3.2 .5 3.7 .6 3.5 .2 3.4-.3 3.7-.9 3.5-.4 3-.9 3.8-.1 3.4-.1 3.8 .3 3.5 .1 3.4-.2 3.6-.2 3.4-.8m-81.9 12.2 3.4-.5 2.9-.6 3.2-.6 3.6-1.4 3.1-1 3.8-.9 3.5-1.3 3.6-1 3.6-.4 3.4 .4 3.5 .2 3.8 .6 3.8 .1 3.7-.3 3.6-.7 3.1-.5 3.7-.5 3.8-.5 3.8 0 3.3 0 3.9 .5 3.3-.2 4.1-.7 3.4-.8m-84.6 12 3.3-.5 3.4 0 3.1-.4 3.6-1.1 3.7-1.3 3.6-.8 3.8-.8 3.3-1.4 3.6-.6 4 .3 3.6 0 3.5 .5 4.2-.1 3.6-.2 3.4-.4 4-.5 3.5-.5 3.7-.3 3.7-.2 3.8-.1 3.9 .2 3.7-.2 3.8-.6 3.6-.4m-87 11.4 3.5 .2 3.4-.3 3.5 0 3.7-1.1 3.5-.7 3.7-1 4-1.6 3.3-.9 3.8-1.1 4.1 .1 3.8 .2 3.6 .6 3.7-.1 4.2 .2 3.9-.8 3.6-.2 3.8-.6 3.7-.7 3.8-.2 4.1 .2 3.8-.2 3.7-.2 4.2 0 3.9-1m-90.2 11.5 3.7 .3 3.5 0 3.8-.1 3.8-.9 3.9-.6 3.6-1.2 4.1-1.2 3.4-1.5 4-.9 4.1 .2 3.8 .3 3.9 0 3.9 .2 4.2 .1 3.5-.3 4.2-.5 3.9-.7 4-.2 3.9-.2 3.9-.3 3.9-.3 3.8 0 3.8-.5 4.2-.4m-92.3 10.8 3.9 .3 3.6 .6 3.8 0 4.1-.4 3.8-.9 4.1-1.4 3.6-.9 3.6-1.6 3.8-1.1 4.1-.2 4 .6 4.1 0 4.3 .2 4 0 3.9-.5 3.9 0 3.7-.3 4.1-.6 4-.3 4.2-.3 4.2 0 3.8-.2 4-.5 4.1-.4m-94.2 9.9 3.7 .5 3.7 .8 3.9 .7 4.1-.3 4.1-1.3 4-.5 3.4-1.3 4-1.7 4.1-1.2 3.8 .1 4.1-.1 4.2 .4 3.8-.1 4.1 .3 3.8-.3 4.2-.2 4-.1 4-.5 4.1-.2 4.1-.1 4.2 0 3.9-.6 3.7 0 4.4-.5m-95 8 3.9 1.4 3.7 1.1 4 .4 3.8 .1 4.2-.8 3.5-1.3 3.9-1.1 3.9-1.7 3.8-1.1 3.7-.1 4.2 .2 3.9 .1 4 .3 4.2 .4 3.7-.3 4.3 .1 4-.4 3.9-.2 4.1-.3 4 .1 3.8-.4 4.2 0 3.8-.6 3.9 0',
        rowsHi: 'm-21.6-3.4 2.1-2.1 2.1-1.8 2.2-1.8 2.3-1.8 2.9-1.2 2.7-.7 3-.6 2.6-.6 3.2 .4 2.5 .8 3.1 .9 2.6 .4 2.8 .5 3-.7 2.9-1 2.7-.9 2.9-1.2 2.7-.2 3.3 .1 2.7 1 2.6 .4 3.2 .2 2.7-.6 2.7-.7m-65.8 13.2 2.1-1.6 2.5-1.8 2-1.8 2.6-1.6 3-1 2.7-.8 3.2-.7 3.2-.5 2.8 .3 2.8 .5 3.3 .7 3 .4 2.9 .2 3-.3 2.8-1 3.2-1 2.6-.5 3.3-.9 3 .4 2.8 .8 3.3 .4 3 .1 3-.7 3.1-.5m-69.8 12.8 2.5-1.4 2.4-1.2 2.8-1.8 2.4-1.1 3.3-1.2 2.7-1.4 3.4-.3 3.1-.6 3.3-.1 3.1 .4 2.6 1 3.5 .5 2.9-.1 3.4-.6 2.9-.5 3.4-.9 2.8-.9 3.2-.2 3.5-.2 3.1 .9 2.7 .2 3.3 0 3.1-.6 3.3-.6m-73.3 13 3-1.5 2.6-.9 2.6-1.6 3-.9 3.2-1.2 2.9-1 3.2-1.1 3.4-.5 3.3 0 3.4 .4 3.2 .4 2.9 .6 3.8-.1 3.3-.4 2.9-.4 3.4-.9 3-1 3.3-.1 3.2-.1 3.6 .5 3 .4 3.8 0 2.9-.7 3.4-.7m-76.5 12.4 2.9-.5 2.8-1 2.8-.9 3.1-1.3 3.1-1.2 3.8-1.1 3-1.1 3.7-.4 3-.5 3.7 .6 3 .4 3.5 .2 3.7 .3 3.2-.2 3.4-.9 3.3-.8 3.7-.6 3.4-.2 3.3 .2 3.3-.2 3.6 .3 3.6 .4 3.1-.9 3.7-.7m-79.6 12.4 2.9-.4 2.6-1 3.3-.9 3.5-1.2 3-1.1 3.4-.7 3.5-1 3.4-.8 3.9-.3 3.1 0 3.9 .4 3.5 .4 3.5 .4 3.7-.6 3.2-.2 3.4-1 3.6-.7 3.7-.5 3.5 .3 3.7 .1 3.3 .1 3.5-.2 3.6-.4 3.9-.4m-82.6 11.8 2.7-.4 3.4-.2 3.1-.8 3.8-1.2 3.3-1.2 3.6-1 3.6-.7 3.6-1 3.2-.5 4 .2 3.7 .1 3.6 .3 3.8 .3 3.6-.3 3.5-.6 3.7-.5 3.3-.5 3.9-.6 3.8 0 3.6 .2 3.5 0 3.8-.2 3.4-.5 3.9-.7m-85.3 11.8 3.4-.2 3.2 .1 3.5-.6 3.3-.7 3.6-1.2 3.8-1.3 3.6-1 3.8-1.2 3.7-.7 3.4 .3 4.2 .3 3.3 .5 4.1-.3 3.5 0 3.9-.4 3.9-.5 3.8-.7 3.5-.3 4-.2 3.4 0 3.8 .3 3.9-.4 3.9-.7 3.5-.3m-87.9 11.1 3.7 .5 3.4-.3 3.7 .2 3.3-.9 3.7-1.3 4-.7 3.8-1.3 3.8-1.4 3.5-.9 3.8 .2 4.2 .5 3.6 .1 3.9 .1 3.7 0 4.2-.4 3.8-.7 3.9-.5 3.8-.5 3.7 0 3.9-.3 3.9 .1 3.8-.4 4.2-.2 3.7-.5m-90.7 10.9 4 .3 3.5 .3 3.6 0 3.7-.7 3.9-.9 3.9-1 3.8-1.2 4-1.4 3.6-.7 4.1-.4 3.8 .5 3.8 .2 4.1 .2 3.8-.2 4.2-.3 3.7-.6 4.1-.4 4.2-.2 3.7-.6 3.9 .3 4.2-.3 4.2-.1 3.7-.5 3.8-.5m-92.8 10.5 4 .5 3.4 .4 4 .2 3.9-.6 3.8-.6 4.2-1.1 3.8-1.1 3.8-1.6 3.6-1.2 4.3 0 3.8 .3 4.1 .1 4.3 .1 4 .1 3.9-.1 3.9-.4 4.2-.3 3.9-.4 3.9-.3 4.3-.1 4.1-.5 3.6-.2 4.4 0 3.7-.9m-94.4 9.7 4 1 3.8 .9 3.4 .1 4.4-.1 4-.9 4-1.2 3.5-1.2 4.1-1.2 3.7-1.2 3.9-.3 3.9 0 4.3 .6 3.8 0 4 .3 4-.1 3.9-.1 4.3-.5 4-.2 4-.5 3.9-.3 4.2 .3 3.8-.3 4.3-.6 3.9-.4m-94.4 7.8 3.7 1.4 3.6 1.2 4.1 .7 3.9-.3 3.7-.8 4.2-1.1 3.8-.9 3.4-1.7 3.8-1 4.2-.2 3.8 0 3.9 .3 3.8 .4 4.5 0 3.6 0 4.2-.2 3.8-.2 3.9-.2 4.4 0 3.8-.2 3.8-.2 4-.3 4.1-.1 3.8-.7',
        fibers: [
            'm14.6-.8q.6 .2 1.3-.1m-16.7-2.8q.4 .6 1 .3m60.6 12.5q.8-.7 1.4-.8m-63.1-14.7q.9 .7 1.7-.3m-17.4 28.4q1-.3 1.7 .6m22.6-33.4q.6 .2 1.5 .5m-1.3 7.5q.7 .2 1.4 .3m27.7 18.1q-.4 .6-.2 .9m-50.4 6.9q.5 .1 1.1 0m30.5-15.2q.8-1 1.5-.5m-38.2 12.5q-1.2 1.1-1 1.4m53.2-12q.5 .2 .8 .5m-50.9-16.3q.5 0 .8-.4m45.4 10.9q.4-.2 1-.5m-5.3-18.2q.2-.1 .8-.5m-41 21.8q.4-.5 1.1-.7m24.5-5.3q1-.6 1.9 .2m-.4 16.9q.5 .6 .6 1.2m14.2-19.8q.1 .5 .3 .9m5.9 14.4q.4 .5 .3 1m.9-27.1q.2-.4 .7-.5m-26.3 7.5q-.6 .6-.7 1.9m-20.3-1.6q.9-.1 1.7 .2m-1.5 26.3q.6 .8 1.7 .6m77-14.1q.4-.5 .7-.4m-87.8-2.3q.6 .2 1.2 .1m29.9-5.3q-.1 .5 .3 1m14.6 11.5q.8 .2 1.2-.3m33.3-12.1q.5-.9 1.4-.8m-77.2 3q.2-.7 .8-.4m61.3 2.1q.1 .1-.5 .7m-54.6-14.7q.7 .6 1.4 .3m.5 24.1q.5-.5 .8-.2m37.8-6.8q.4 .2 .8 .2m32.6-3.3q.5 .2 1.1 0m-78-7.9q1.1 .4 1.5-.6m74.2 15.9q-.3 .5 .3 1.1m-38.8 2q-.1 .6-.2 1.2m-44.8-9.2q.7 .4 1.8-.7m11.2-12.3q.8 .7 1.6 .1m-.3 11.6q.5 .9 .1 1.7m30-1.6q.5 .4 1 0m-11.2-1.2q.6 .1 1.3 .4m10.7 .4q.6 1 1.2 .8m16-.4q1 .4 1.8-.2m15.1 7.6q.2 .1 .9-.6m-82.1-8.9q.6-.2 1.1-.2m59.1-13.4q.9 1 1.7 .5m-62.7 10.4q.4 .2 .8 .2m32.1 14.7q.9 .9 1.8 .1m4.1 1.2q1 .5 1.7 .3m18.6-15.5q.5-.1 1 .4m-29.6-14.2q.7-.6 1.3-.3m-24.2 10q.5 .2 1.5-.7m1.3-10q.5-.6 1.2-.1m48.6-1.1q0 .8-.8 1.2m32 20.4q.7 .5 1.1 .7m-20.2 9q-.4 .5-.7 1m18.4-5.3q.7 .6 1.7-.3m-5.1-7.3q.6 .2 1.3 .1m-50.3-4.4q.9-.3 1.9-.4m1.1 12.8q-.2 .8 .1 1.5m42.2-5.8q.7-.1 1.7-.4m-39.5-6.7q.8-.4 1.6 .1m-44.2 13.3q.9-.4 1.5 .5m1.5-19.1q1.2 .3 1.7 .8m20.2-6.4q.8 .6 1.7-.2m14.9 12.6q.9 .5 .5 1.5m-18.5 1.3q.8-1 1.2-.7m-9.7 14q-.1 1.1 .8 1.4m-7.9-1.1q1-.3 1.8-.3m32-13q1-.9 1.9-.7m29.7-2.4q-.3 1 .7 1.8m-56.4-20.3q1-.7 1.6-.4m-6.2 10q.5 .7 1.2 .3m14.2-2.9q.7 .5 1.5 .5m47.1 20.1q1.4 .9 1.8 1m-1.6-10.9q.9 0 1.9-.4m-15.1-13.8q-.3 .8-.2 1.8m-47.7 26.4q.9-.2 1.2 .5m3.6-29.4q.7-.2 1.3 .6m35.6 17.1q1.2 1.2 1.5 .9m-3-16.8q1.3-.4 1.6-1.1m28.7 17.3q.3 .7-.1 1.4m-58.3-17.6q.4 .6 .1 1.1m-7.9 1.8q.8 .1 1.7 .4m10.4 1.9q.1 .6 .3 1.2m5.8-5.6q.8 0 1.4-.8m6.7 13.4q.5 .3 1 .1m-29.6-14.9q.6 .3 1-.2m36.8 .1q.6-.3 1.3 0m-49 28.9q0 1 .4 1.8m33.9-24.5q.7-.2 1.4 .3m-7.6-3q.2 .5 .2 .9m-25 17.8q.5-.4 1.1-.6m25.7-2.5q-.2 .4-.3 1m34.3-15q.3 .5 .4 .9m-34.4 17q-1 .7-.9 1.4m6.7-21.3q.9 .4 1.5 1m31.7 7.5q.4 .2 .9 .1m-34.4-14.5q.4 .4 .9 0m-31.4 6.4q.8 .3 1.4 .4m24.4 1.5q.5 .1 1.1-.1m7.1 3.6q.4-.5 .9-.1m-22.7 18.2q.8-.6 1.8-.2m-9.5-3.2q.9-.2 1.7 .6m43.2-6.1q.3 .8 .8 1.5m-58.7 12.1q.8 0 1.7 .1m25.5-5.1q1-1 1.9-.1m-18.9-20.9q.7 .3 1.3-.6m23.8 11.8q.9-.5 1.8-.1m-1-18.1q.2 0 .7-.3m-8.1 3.2q.5 .4 .9 0m-9.5 1.9q.5 .5 1.6-.7m-20.9 21.7q-.3 .3-.4 .8m35.9-5.3q.7-.3 1.3-.1m-38.1-.1q.6 .1 1.2-.6m36.6-11.6q-.4 .2-.4 .8m34.3 6.7q-.2 1.1-.8 1.5m-37.2-8q.7 .8 1.4 .3',
            'm-5.6-8.2q.3 .4 0 .8m-14.4 14q.8-.6 1.7-.1m72.3-6.8q.3-.5 .9-.3m-16.1-7.6q1.1-.1 1.7 .9m15 18.8q.5-.3 1-.1m-46.6-21.6q.8 .1 1.5 .3m17.5-2.6q.8-.7 1.8-.2m-16.3 20.8q.6 .8 .8 1.3m30.4-19.5q.5-.3 .7-.5m-61.6 23.7q1 1.1 1.9 .3m39.2-27q1 .7 1.6 .8m40.6 28.4q-.5 .4-.2 .9m-84.4-17.2q-.2 .6-.9 1.7m29.2 2.7q.8-.5 1.4 .3m16.6-12.3q0 .8 .8 1.1m16.5 24.1q.4 .1 .9-.2m-64.4-21.6q1 .8 1.9 .1m75.2 6.6q.8-.5 1.4-.5m-63.6 7.7q.8 .5 1.8 .7m-2-2.5q.7 .5 1.6-.4m38.3 4.3q.7 .2 1.6-.3m-12.9 1.1q.5 .7 .5 1.1m27-16.1q.3 .2 .8-.2m-58.5 .2q0 .7-.5 .9m37.7-5q.9 .3 1.6-.2m-5.1 1.4q.9 .4 1.6 .3m1.2 15.5q.4 .5 .9 .2m-30.9-13.9q.9 1 1.5 .7m-9 5.2q1-.5 2 0m6.7 12.1q.6 .6 1 .3m41.2 2.9q1 .8 1.8 .7m-31.7-27q-.3 1-.7 1.7m31.9 3.5q-.2 .5-.2 1.2m-62.2 22.2q.6-.4 1.4 .2m73.8-13q-.5 .5-.3 .8m-60.2-2.4q.5-.5 1-.2m10.9-14.8q.8-.1 1.4-.3m50.7 13.2q.9-.7 1.7-.1m-80.2 13.2q.5 .5 1 0m-4.7-20q.5 .1 1-.2m3.5 26.1q.7-.1 .9 .5m76.6-14.2q1.1 .4 1.7 .7m-47-11.1q.5 .2 1 .4m-33.3 16.6q.7 .1 1.5-.2m81.3 .7q1.3 .2 1.6-1m-5.3-6.5q.9 .3 1.7 .5m-24.4-15q1.1-.5 1.9 .6m-45.5-6.5q.1 .5-.8 1.3m46.6 7.1q.3 .2 .5 .7m-6.9 20.2q.7 .4 1.1 .7m-41.7-7.2q-.2 .9 .4 1.9m28.4-15.8q1-.5 1.7 .8m-36.6-3.4q-.4 .8-1 1.6m51.4 14q.4 .6 .6 1.5m17.7-7.8q1.1-.2 1.4 .9m-8.6 5.3q.5-.3 1.2 .4m-62.9-13.8q.3 0 .8 .5m-5.2 25.1q-.6 .6-.3 .9m47.6-36.6q.6 .5 1.1-.2m-40.4 7.4q.9-.7 1.6 .2m36.2 6.2q-.1 .3 .5 .9m-42.5 3.3q.4-.4 .9-.4m41.3-5.4q.7-.5 1.6 .2m-44.2 7.9q.7-.7 1.7-.6m-9.9-3.3q.6-.4 1-.3m33 8.2q-.4 .8 .3 1.4m-11.1 2.2q.7-.7 1.4 .2m26.7-10.5q1.1-.7 2-.2m-41.6-17.3q.4 .3 1 .4m-10.7 4.8q.7 .3 1.5-.5m45.9 10.2q.2 .5 1 .7m31.3 3.3q.4 .4 .1 .9m-36.3-.3q.8 0 1.2-.4m24.6-1.3q1.1 0 1.8-.5m-20.1 2.1q.7 .3 1.9-.6m.2 .6q.8 1 1.8 .5m28.3 5q.5 .6 1 .5m-4.1 4.9q0 .4-.1 .8m-54.1-28.1q1-.1 1.8-.4m-14 29.6q1.3-.8 1.9-.7m24.2-31.1q.7 .3 1.2 .2m28.6 18.5q.7 .1 1.4 0m-41-3.6q.2 .6 .9 .6m28.9 6.9q.6-.5 1.5 .4m-56-10.3q.8 .8 1.2 .6m30-6.8q.7-.1 1.3 .3m-40 23.4q.9 .6 1.4 .6m60.3-31q.6-.6 1-.3m-49.4 35.8q0 .4 .5 1m63-15.9q.8-.5 1.3-.7m-30 5.2q.5 .2 1-.1m-7.8-18.3q.9-.2 2 .2m18.8 21.9q0 .9 .8 1.5m-38.1 3.3q-.1 .8-.9 1.4m14.9-19.8q.7 .7 1 .6m24.9-5.4q-.3 .6 .4 1m-41.5 15.1q.8-.7 1.8 .6m48.2-11.3q.6 .7 1 .3m-53.8-12.7q.7 .8 1.3 .4m14.5-3.6q.2 .6-.2 1.2m-16.8 15.3q.7-.5 1.6-.9m-1.9-1.2q-.4 1 .1 1.9m9.3 10.4q.7 .6 1.4 .2m-10.1-2.9q1.1 1.3 .8 1.7m16.5-18.7q.7 .1 1.3 .3m-18.5 13.3q.7-.3 1.5-.1m18.8 10.2q.5-.4 .9-.1m19.3-23.4q1-1.3 1.9-.5m-11.5 20.2q1 .7 1.9 .5m-56.3-12q.7 .7 1.5 .7m37.8-7.6q.5 .6 1 .1m23.1 3q.5 .1 1.1 .4m-6.1-11.5q.6 .5 1.7 .6m-4.4 25.2q.7 1.1 1.4 .8m-7.1-6.2q-.1 .5-.1 1.1m14.4-21.8q.4-.4 1-.3',
            'm21.4 10.5q.7-.4 1.3 .2m23.6-6.4q.6-1 1.7-.6m-22.6-18q.6-.3 1.2-.4m-47.2 26q.6 .3 .9 .5m72.7-7.3q-.3 .7-.5 1.5m-38.8-12.1q.8 .5 1.4-.3m-13.8-7.7q.3 .6 .5 .9m-9.4 35.7q.4 .4 .9 .5m22.8-11.2q.4 .6 .8 .4m11.7-27.4q.2 .2 .9 .4m-30.1 35.9q.2-.4 1.1-.7m69.2-6.8q.4 .8 1.2 .4m-35.7-20.3q.5-.4 1-.1m-29.6 2.2q.7 .8 1.4 .1m24.7-2.2q.6-.7 1.2-.4m-10.8-1.6q.6-1 1.2-.8m-28.5-2.4q-.4 .7 .2 1.3m12.9 4.7q.5 0 1.2 .2m-20.3 12.9q1.1 0 1.9 .3m-13.5 5.7q.3 .6 .3 1.1m28.5 3.9q.5 0 1.1 .2m32.2-14.5q.6 .4 1.2 .1m-50-12.6q.1 .3 .3 .8m24.2-1.2q.5-.5 1.2-.7m3.5 13.5q.9 .8 1.3 .6m-34.6-4.7q.7-.4 1.7-.8m-3.8 11.2q.6-.1 1.3 0m19.8-12.2q.5-.5 1.5-.6m42.3-6q.8 .3 1.5 0m-23.5 12.8q.8 .6 1.4 .3m22.3-11.7q.2 .4-.5 .9m9.4 16.2q.5 .1 .9 0m-27.2-21.6q.9 .8 1.3 .8m-11.3 .7q.5 .6 .2 1.2m-7.4 21.6q.8-.9 1.3-.8m21.9 5.6q.5 .7 1.3 .5m-59.1-18.7q.9 .5 1.7-.1m59.1-13.6q.3 .2 .9-.2m-17.1 25.7q-.2 .8 .4 1.7m-48.3-2.9q-.5 .6-.3 1.4m64.3-15.2q-1.2 .4-.9 1.6m-43.8-8.2q.9 .8 1.6-.2m25 5.8q.6 .2 1.2 0m37.1 12.5q-.4 .7-.5 1.3m-79.3-1.1q.5 .1 1.4 .3m23.4-18.8q.5 .6 1.6 .8m27.7 24.7q.6 .1 1.5-.2m-38.3-3.5q.7-.8 1.5 0m-8.5-5.3q.7 .5 .5 1.2m46.8-.7q-1 .7-.6 1.5m-61.1-11q.4-.1 1.2-.4m7-5.8q.4 .9-.9 1.7m16.2-1.3q1 .7 1.6 .6m40-3.4q.5 .4 1.5-.6m-24.2 13.4q.6 .1 1.2-.6m-29.9 3.2q.9 .8 1.2 .6m13.3 6.2q-.2 .6 .6 .9m-25.6-18.3q.6 .2 1.1 .2m32.6-5.1q.6 .3 1.1-.1m-15.5 30q.3 0 1.4-.9m21.4-13.2q1.1-.1 1.9 .3m1.5 12.8q.5-.1 1.3-.5m-11.1-13.3q.1 .5 0 1m-29.2 4.6q.7 .5 1.4 0m23.1-10.1q.9-.3 1.6-.1m-11.4-8.9q-.6 .6-.1 1.3m12.2 20.7q.7 .5 1 .4m-5.2-21.4q.5-.4 1.5-.7m-3.7 18.2q.5-.5 1.6-.6m-26.1 7.2q.8-.4 1.4 .5m16.2-28.3q.5-.1 .8-.3m33.9-.1q.6 .4 1.6 1.1m-7.7 6.2q.9 .3 1.8-.9m18.2 5.1q.5-.5 1 0m-44.2 2.1q-.1 1-.8 1.3m24.7-7q.6 .1 1.2 0m-28.2-.4q.3 0 .9-.4m-9.8 6.9q.6 .2 1.7-.8m66.5 11.2q-1 .8-.1 1.8m-19.7-.7q.6-.4 .9-.4m-51.1 .8q.1 .9 .6 1.3m48.7-17q.3 .2 .8-.4m4.2 11.6q.4-.3 .8-.1m-60.4-4.3q.5 .3 1.6-.6m56.9-6.4q1.2-.5 1.7 .7m-55.5 14.4q.6 .1 .7-.4m46.7-18.2q.6 .1 .9-.3m-24.2 4.5q-.5 .6-.4 .9m-37.5 8.1q.4 .2 1.1-.3m46.9-3.4q.5 .2 .8-.5m11.5-7.6q.9 0 1.6 .3m-17.7 14.4q.2 .4 1.1 .7m19.1-19.4q-.4 .5-.3 .9m9.5 20.9q-.7 1.1-.1 2'
        ],
        lint: [
            'm39 4.8q.7 .1 1.2-.3m-9.4-7.5q.7-.4 1-.5m15.8 7q.3 .1 .6 .1m-48.8-15.9q.1 .1 .6 .4m44.5 27.8q.5-.3 .8-.1m-52.2-6.5q.3-.3 .9-.3m5.9 8.2q.4-.2 .6-.2m53.1-18.3q.3 0 .8-.3m-57.5 2.7q.3 .5 .2 1m25.2 13.3q.8-.3 1-.6m23.3-17.2q-.8 .8-.5 1.1m4.7 2.7q.2 .2 .5 .1m-30.1-11.5q.1 .4 .3 1.1m-10.6-1.5q0 .3-.1 .6m28.3 1.4q.4 0 .8 .1m-12.2-5q.5 .5 .3 .9m-7.1 29.2q.6-.5 1.2 .2m-18.1-24.2q-.3 .3 0 .6m-9.1 28.6q.2-.3 .6-.2m-3.7-35.4q.4 .2 1.1 .2m55.1 4.9q.4 .2 1 .5m-27.2 16.4q.7 .8 1 .6m-6 5.9q.4 .6-.1 1.2m22.2-29.3q.4-.3 .8 0m2.7-1.8q.2 .3 .1 .6m-28.6 19.2q.3-.2 .5 .1m32.4-8.6q.3 0 .7 .4m-32.4-5.3q.5 .2 .9 .4m4.4 17.5q.1 .3-.1 .5m-35.8-12.5q.5 0 1-.7m-1.8 1.3q.5-.6 1.1-.4m-2.1 7q.4-.1 .9 .2m1.1 18q.4-.5 .9-.3m38.8-13.3q0 .2 .4 .7m-37.6-16.4q.2 .3 .5 1m3-1.5q.4-.2 .6 .3m-3 28.6q.3-.2 .8-.3m31.3-18.3q.4 .2 .9-.1m-11.6-12.1q.1 .3 .4 .6m21.8 24.7q.5-.1 1.1 .4m-13.5-23.3q.2 .2-.2 .8m6.1 16.7q.5 .6 .2 1m-5.6-10.9q.2-.1 .6 .2m-31.1-6.3q.3-.2 .7-.1m46 17.2q-.3 .4 0 .7m-9.5 2q.4 .7 1.1 .4m-9.6-17q.4 .3 .7 0m-30.7-3.4q-.5 .5 .3 1.2m49.1-9.6q.6-.2 .8-.4m-26.4 20.6q.5 .3 .9 .2m17.8-11.2q-.5 .5-.3 1m-33-6.7q.2-.2 .7-.3m7.5 4q.4 .3 .9-.3m14.3-3.9q.6 .4 .9 .2m-42.1 24q0 .1 .3 .5m9.7-10.1q.5 .1 .7-.2m39.1-4.7q.3 .2 .3 .4m-9.8-5.1q.2-.5 .7-.3m26 10.3q-.1 .4 0 .9m5.1-9.4q.4 .1 .9-.1m-29.2 16.7q.4-.2 .9-.1m-6.9-23.5q.3 .3 .4 .6m-16.5-.4q.3-.1 .5 .2m52.5 24q.3 .5 .7 .3m-67.2-15.6q.5-.4 .9 .2m34.3 18.9q-.7 .5-.5 1.1m15.2-18.7q.3 .2 .2 .5m-33.5-11.2q.5-.5 1.1 .1m-5.5 16.3q.4-.3 .9-.1',
            'm14.3 16.4q.3 .2 .9 .3m-29.4-20q.2-.1 .6 .2m52.6-10.4q-.3 .1-.4 .5m3.6 30.1q.5-.1 .8-.3m-30.3-25.6q.4-.3 .6-.2m-15.5 21.5q.6 .3 1 .3m27.1-12.1q.6-.3 1.1-.2m-31.3 21.4q0 .5 .1 .9m10.7-25.1q.4 .1 .7 .2m40.4 1q.4 .2 1-.1m7.2 6.1q-.1 .6-.1 1.2m-14.2-12.3q.6 .3 1.2 .3m-32.4 12q.6 .4 .3 .9m13.6 7.9q.5-.2 1.1-.1m38.9 2.4q.2 0 .6 .2m-42.6-24.8q.2 .5-.5 .9m-15.2-6.2q.3 .5 .6 .9m7.5 2.3q.3 0 .6 0m51.6 16.3q.3 .2 .7 .3m-17.9-3.7q.5-.4 1 0m-26.1 13.6q.3 .7 .5 1',
            'm34.4 1.3q.4-.3 .8 0m-34.8 15.5q.6-.2 1-.6m15-20.1q.6-.8 1.2-.4m26.9 2.2q.6 0 1.1-.6m-12.7 2.6q.4 .5 .1 1m-9.5-3.9q.4 .4 .7 .3m11.6-1.7q.1 .6 .4 .8m-33.6-8.9q.2 .1 .9 .6m50.6 9.9q.2 .4 .3 .6m-73.2 14.1q.1 .3 .3 .7m28.1-22.9q.2-.1 .7-.3m32.6-3q.3-.4 .6-.1m-63.3 29.7q0 .5 0 1m44.9-16.6q.6-.4 1.3 .1m24.7 3.2q.5-.4 .7-.3m-57.4 7.5q.3-.2 .6 0m-9.5-18.9q.5 .5 1.1 .5m3.7 10.4q.7 .5 1.2-.3m30.8-1.3q-.3 .5-.5 .9m5.9 6.6q.3-.2 .6 0m-21.9-21.4q.5-.2 1 .2m-19.6 11.7q.4 .1 .8-.2m26.3 5.3q.4 .7-.4 1.1m15.8-3.6q-.4 .5-.1 1m-40.6 13.7q.3 0 .8-.1',
            'm55.4 5.2q.3-.2 .6 .1m-28.4-9.1q.7 0 1.2 .2m41.7 17.5q.3 .7 0 1.3m-88.5 6q.4 0 .8 0m23.2-24.1q.4 0 .6 0m46.7 12.6q.1 .2 .5 .2m-29.5-17.3q-.3 .2-.2 .6m32.5 5.2q.4 .4 .8 .5m-17.2 9.5q.9-.2 1-.7m-50 3.6q.3 0 .5 .1m4.2-13.3q-.3 .3-.1 .7m-10.1 19.6q.4-.3 .6-.2m8.4-18.2q.2 0 .8-.4m37 19q.4 .1 .7 0m-27.6-29.6q.5-.2 .9 .1m20.6 5.1q-.3 .8 .4 1.1',
            'm43.9-10.3q.7-.3 1.3 .1m8.8 18.2q-.1 .5 .2 .7m-66.5-11.2q.5 0 1 0m27.1 18.7q.3-.1 .8 .3m-22.9-13.4q.2 .2 .6 .4m-3.1 5.8q.5 0 1 .2m-4.4 7.9q.7-.2 1.2-.3m44.5-17.9q.4-.2 .8 0m-24.6 4.2q.1-.1 .7 .4m36.4-12.7q.4-.3 .6-.2m-15 6.2q.3-.1 .6 .2m6.1 13.2q.2-.7 1-.7m-25.9 3.5q.1 .3 0 .6m30.6-7.7q.3 .2 .6-.1m-65.8 1.9q.4-.3 .9 .1m6.3-17.8q.2-.3 .5-.2m-4.8 10.4q.3 .1 .5 0',
            'm-16.7-.1q.3-.2 .5 .1m23.8 2.8q-.3 .2-.5 .8m-9.5-14q.4 .3 .8 .1m30.2-3.4q.5-.1 1.1 .5m-51.3 16.8q.4 .5 .6 .4m58.6-5q-.6 .5-.6 1.1m-1.6 11.8q.3-.3 .5 0m24.6 2.6q.3 .1 .6 .2m2.8-5.5q0 .3-.1 .6m-78.2 11.4q.3-.4 .5-.3m34.6-8.3q.6 0 .8-.3m14.6-20.4q.5-.6 .8-.5m-52.4 18.8q.5-.2 1.1 .3m58.4-22.3q.6-.1 1.2 .1m-38.4 6.8q.7-.2 1 .7m40.3-4.1q.7 0 1.3 .2m-41.6-1.6q.4-.1 .8 0',
            'm-8.8-9.9q.2 .5 0 .9m3.7 20q.5-.5 .9-.3m-5.6 10.4q.4-.1 .6-.3m44.9-3.5q0 .3 .3 .7m5.7 .2q0 .3-.2 .5m-57.3-27q.5 .2 1-.2m45.4 11.9q.5 .2 .9-.6m7-8.7q.4 .5 .8 .2m-6.9-2.8q.3-.1 .9-.2m-45.3 2.9q.5-.1 1.2-.3m-4.3 12.2q.3 .3 .6 .2m74.6-3.7q.1 .2 .6 .3',
            'm13.5-6.8q.1 .3 .3 .8m6.8 1.3q.5-.6 1.2-.2m-20.7 26.6q-.2 .6-.6 1.1m4.6-35.9q.4 .4 .6 .4m46.8 10.1q.7-.3 .8-.5m-72.8-2.6q-.1 .3 .3 .5m81.3 5.6q-.4 .7 .3 1.2m-11.5 6.6q.2-.4 .5-.3m-1.4-16.7q.3 .2 .9-.3m-71.3 8.8q.3 .4 0 .8m17.4 9q.4 .1 .9 0m21.6-23.2q.4 .3 1-.2m14.7 2.3q.4-.5 .8-.4m-37.2 8.9q.4-.1 .8-.1m-7.8 17.1q0 .3 .1 .6m1.5-.6q-.5 .6-.1 1.2m54.4-25.8q.7 .1 1.2-.3m-32.7 5.7q.2 .1 .4-.2'
        ],
        fuzz: 'm-22.2-3.4q-.1-.1-1.1-.7m-1.5 15.7q-.5 .1-1.3-.7m48.4-27.6q-.9-1.2-.8-1.8m36.6 12.8q.3 .1 1-.4m-53.8-8q-.7-.4-.3-1.6m51.1 8.4q-.6 .9-.4 2.1m-2.6-4.3q.7-.7 .4-1.8m-23.3 31q-.2 .1 .5 1.2m44.7-6.6q-.5-.7-1.6-.4m-23.7 5.5q-.2-.4-.4-1.4m-51.2-34q.5-.9 1.4-1.6m-24.9 26q.1-.5 1.3 .1m72.8-21q-.2-.7 .2-2.2m-67.6 37.4q.1 .2-.5 1.2m59-3.9q-.3-.6 .5-.7m-63.5-20.9q-.2-.4-1 0m96.3 19.7q.2 .8-.2 1.9m-95.7-.9q-.3-.3-.7-.4m87.1-20.6q0 .2-.4 1.3m-74.4-13.1q1.1 .5 1 .8m41.8-2.9q-.4-1.3-.6-1.8m-22.3 38.6q.3 1.2-.4 1.3m-21.3 2q-.3-.9 0-1.8m51.5-37.9q-.5-.4-.3-1.9m22.5 36.1q.1 .8 0 1.5m-58.1-35.5q-.3 1.1-1 1.6m41.7 33.5q-.7 1.3-.8 1.5m33.5-9.6q-.2 .3-1.1 .6m-7.3-11.1q.2-.4 .4-1.1m-19.8 19.4q.2 .6-.4 1.6m-.2-35.2q-.3 .2-1.7 .4m-70.1 25.2q.9-.5 1-.4m32.5-24.4q.6 1 .6 1.7m-1.2 32.5q-.3 1.3-.1 1.5m45.1-32q.2-.3 1.1-1m-62.7-4.5q1.2 .3 1.5 1.5m56.1 1q.2-.5 .7-1.4m-44.5-.2q-.1-.5 .9-.7m67.2 22q-.9 1-1.9 .8m-96.5 .4q-.7 .1-.9-.1m76 11.1q.4-.8 .5-1.3m-14.4-33.2q-.5-1.1-.2-1.3m-22 2.8q-1.3-.5-1.7-1.1m-34.9 12.5q-.3-.5-.8-.9m83.5-1.1q.4 0 1.2-.8m-18.3-12q.4-.5 .8-.9m28.7 36q-.1-1.1 .7-1m-95.4-20.5q.1-.3 1.1-.4m-2.1 23.5q-.2-.5-1.1-.4m95.1-14.8q-.4 1.4-.8 1.6m-94.5 7.4q-1.3 .1-1.6-.3m101.5-.2q1.2-.4 1.8 .3m-24.6 6q-.6 .6-.1 1.8m-66.1 3.2q-.6 .3-.5 .8m17.6-2.3q-.1 1.3-.6 1.7m27.3-4.8q.2 .8-.6 1.6m-27.6-36.5q.3-.2 .5-.7m-25.5 36.9q.3-.4 .5-.9m87.5-1.5q-.5 .9 0 1.4m5.8-15.5q-1.4 .8-1.6 1.1m-65.6-20.3q.7 .5 .6 1.7m18.1-3.7q.7 0 .5 .9m-45.6 14.2q-1.2 .4-1.8 .6m57.3 20.8q-.4-.7 .2-1.1m-55.1-22.1q-.6 0-1.4 0m61.3 23.4q-.1-.3-.3-1m37.7-8.5q-1 .2-1.5 .2m-5.7-8.7q-.2 .6-1.1 .3m-80.4 22q.5-.9 .5-.9m2.9-37.8q-.4 0-.2-1m-12.8 35.1q.5-.2 .9-.1m61.9-35.5q.3 .2-.1 1.4m-63.1 32.4q.3-.4 1-.1m85.2 .9q.1-.6 .6-1.7m-15.6 2.6q.6 1 .3 1.9m-71.6-20q0-.7 1.1-.2m72.7-13.1q.4 .2 .8-.3m-72.9 8.1q.3-.8-.4-1.1m4.1 27.8q-.1 .4 .1 1.1m-4.8-2.8q-.5 .3-.3 1.1m86.3-24q.8-1.1 .9-1.8m-63.6-12q.6-1.3 .2-1.7m67 35.8q-.6 .5-.4 1.7m-81.8-31.8q.1-.5-.9-1.5m90.7 29.9q1.1-.3 1.1-.6m-12.2-17.2q.2-.3 0-1.1m7.7 7.6q.3-.7 .8-.4m-97.5 3.4q1.5 .3 2 .2m86-10.5q-1.2 0-1.4 .5m-66.6-14.4q-.3-.7-1.3-1.4',
        seam: 'm-21.8 20.8-.1-.7-.2-.6-.1-.6-.1-.7-.2-.6-.1-.6-.1-.6-.2-.7-.1-.6-.1-.6-.1-.6-.1-.6-.1-.6-.1-.7-.1-.6-.1-.6 0-.6-.1-.6 0-.6 0-.6 0-.6 .1-.6 0-.6 .1-.5 .1-.7 .2-.6 .1-.6 .1-.6 .2-.6 .2-.6 .1-.6 .2-.6 .2-.6 .2-.6 .2-.6 .2-.6 .2-.6 .2-.6 .2-.6 0-.3 1.1-1.2 1.2-1.4 1.1-1.3 1.2-1.3 1.2-1.2 1.3-1.1 1.3-1 1.4-.8 1.5-.7 1.6-.6 1.6-.4 1.6-.3 1.7-.2 1.6 0 1.6 .3 1.6 .4 1.7 .5 1.7 .6 1.7 .6 1.9 .4 1.9 .2 2-.2 1.8-.4 1.8-.6 1.7-.7 1.6-.7 1.6-.6 1.6-.5 1.5-.3 1.6 0 1.6 .3 1.7 .4 1.6 .5 1.8 .4 1.9 .3 2 0 1.9-.3 1.8-.5 1.7-.6 1.2-.5 .4 .5 1 .8 1 .7 1 .7 1 .8 1.1 .7 1 .8 1 .7 1 .8 1 .7 1 .8 1 .7 1 .8 1 .7 .9 .8 1 .8 1 .8 1 .8 1 .7 1 .8 1 .8 1 .7 .9 .8 1 .8 1 .8 .9 .8 1 .8 .9 .8 .8 .8 .9 .9 .7 .9 .7 .9 .5 .9 .4 1 .2 1.1 0 1.1 0 1.2-.1 1.2-.2 1.2',
        seamZ: 'm-22.4 20.9 1-.9-1.2-.4 .9-.9-1.2-.4 1-.8-1.3-.4 1-.9-1.2-.4 .9-.9-1.2-.4 1-.8-1.2-.5 1-.8-1.2-.5 1-.8-1.1-.5 1-.8-1.1-.6 1.1-.6-1.1-.7 1.1-.6-1-.8 1.2-.4-1-.8 1.2-.5-.9-.8 1.2-.4-.9-.9 1.3-.4-.9-.9 1.2-.3-.8-.9 1.2-.3-.8-1 1.2-.3-.8-.9 1.2-.3-.8-1.2 1.3 .3-.4-1.2 1.3 .2-.4-1.2 1.2 .2-.4-1.2 1.3 .3-.4-1.3 1.3 .3-.4-1.2 1.2 .3-.3-1.3 1.2 .4-.2-1.3 1.2 .4-.2-1.3 1.2 .5-.1-1.3 1.1 .6 0-1.3 1.1 .7 .1-1.3 1.1 .8 .2-1.3 .9 .8 .3-1.2 .9 .9 .4-1.3 .9 1 .4-1.2 .8 .9 .5-1.1 .8 1 .6-1.1 .6 1.1 .8-1.1 .5 1.2 .8-1 .4 1.2 .9-.9 .3 1.2 1-.8 .2 1.2 1-.8 .3 1.2 .9-.8 .3 1.3 1-.9 .3 1.2 .9-.9 .4 1.3 .8-1 .5 1.2 .8-1 .6 1.1 .6-1.1 .7 1 .5-1.1 .9 .9 .4-1.2 .9 .9 .3-1.2 .9 .8 .3-1.2 1 .7 .2-1.2 1 .8 .2-1.3 1 .8 .2-1.3 1 .8 .2-1.3 1 .8 .3-1.2 .9 .9 .4-1.2 .8 1 .6-1.1 .6 1.1 .8-1.1 .5 1.2 .8-1 .4 1.3 .9-1 .3 1.3 1-.9 .3 1.2 .9-.8 .3 1.2 .9-.9 .5 1.2 .8-1 .5 1.2 .7-1.1 .7 1.1 .5-1.1 .8 1 .5-1.2 .9 .9 .3-1.2 .9 .9 .3-1.2 1 .8 .3-1.3 1 .8 .1-1.2 .4 .7 1.2-.2-.2 1.2 1.2-.5-.1 1.3 1.2-.5-.2 1.3 1.2-.5-.1 1.2 1.2-.5-.2 1.3 1.2-.5-.1 1.3 1.2-.5-.2 1.3 1.2-.5-.1 1.2 1.1-.5-.1 1.3 1.2-.5-.2 1.3 1.2-.5-.1 1.3 1.2-.5-.2 1.3 1.2-.5-.2 1.3 1.2-.5-.1 1.3 1.2-.5-.2 1.3 1.2-.5-.2 1.3 1.2-.5-.2 1.3 1.2-.5-.1 1.3 1.1-.5-.1 1.3 1.2-.5-.2 1.3 1.2-.5-.2 1.3 1.2-.5-.1 1.3 1.2-.4-.2 1.2 1.2-.4-.2 1.2 1.2-.4-.2 1.3 1.2-.4-.3 1.2 1.2-.3-.2 1.2 1.2-.3-.4 1.2 1.3-.2-.4 1.2 1.2-.2-.5 1.1 1.3 .1-.8 1 1.3 .3-1 .9 1.2 .5-1 .7 1.1 .7-1.1 .6 1 .7-1.2 .5 1 .8-.6 .6',
        seamFuzz: 'm64-1.1q-.3-.6 .6-.3m-30.2-13.6q.3-1-.1-1.4m30.7 16.1q.7-.7 1.4-.5m-37.1-15.5q.3-.5-.1-1.4m41.6 22.2q.3-1 .8-1.3m-19.5-13.5q0 .3 .6-.5m-18.3-4.2q-.4 .9-.8 1.1m-58.3 19.7q-.2 .3-1.2-.5m2.5 13.8q-.5-.3-.8 .3m39.9-33.5q.6 .1 .8 .7m-41.1 18.6q0 .3-.8-.2m44.3-20.5q-.8 .2-1.2-.7m23.6-.2q-.4-.3-.3-1m-28.7 4.2q-.1 .1 .2-1m-36.2 15.7q.7 .1 .6 .3m86.1-3.7q-.5 .8-.9 1.1m-67.1-15q-.1 .7-.1 .8m-19.8 22.1q-.2-.2-1.1 .3m41.7-21.5q-.6-.2-1-1.2m24.9-.6q0-.3-.1-1.2m-25.5 3.5q-.2 0-.7-1.2m62 30.3q.8 .4 1.2-.3m-20.4-22.5q-.9 .7-.5 1.5m-79.5 22.4q-.4-.1-1.2 .1m39.1-30.3q.7 .4 .4 .5m-15.9-2.9q-.6 .4-.1 1.4m-11.7 1.8q0-.8-.3-.7m56.6-3.5q-.4-.3-.7-1.1m-66.3 34.1q-.1-.1-1 .9m66.3-33.3q.3-.5 .1-.9m-64.6 37q.8 .1 .6 .3m84.6-22.6q.5-.1 .7-1m-85.3 1.4q-.2 .8 .6 .7m-1 .6q-.6 .1-1-.3m.3 2.7q0-.2 1.2 .4m9.2-14.7q.1-1.1-.4-1.5m14-1.4q-.3-.2 .3-.6m6.4 2.7q0 1.2 .3 1.2m-32.2 18.9q-.7 .1-.7 .1m15.4-21q.4 .3 .2 1.5m61.1 1.9q.2-.1 .2-.9m-22-4.4q.5-1.1 .9-1m40.6 21.8q-.2 .5-1 .7m-3.8-4.7q-.5 .6-.2 .8m-90.7 9q.1-.2-.5 .4m79.5-19.5q-.1-.8 .9-.9m-60-6.1q0-.6 .5-1m59.6 8.8q.2 .4 .6-.3m-3.6-2q0 .3-.6 .2m4.6 2.8q-.1-.2 .4-1.2'
    },
    // Загнутый угол изнанкой к нам.
    fold: {
        face: 'm43-17c.4-.1 1.2 .6 1.8 .9 .6 .2 1.3 .5 1.9 .8 .6 .3 1.2 .6 1.8 .9 .6 .3 1.2 .6 1.8 .9 .6 .3 1.2 .6 1.8 .9 .6 .3 1.2 .7 1.8 1 .6 .4 1.1 .7 1.7 1.1 .6 .4 1.2 .7 1.7 1.1 .6 .3 1.1 .7 1.7 1.1 .6 .4 1.1 .8 1.7 1.2 .5 .4 1 .8 1.6 1.2 .5 .4 1 .9 1.5 1.3 .5 .5 1 .9 1.5 1.4 .5 .5 .9 1 1.4 1.5 .4 .5 .8 1 1.3 1.6 .4 .5 .8 1 1.2 1.6 .4 .5 .8 1 1.2 1.6 .4 .5 .8 1.1 1.2 1.6 .4 .6 .8 1.1 1.2 1.7 .4 .5 1.2 1.2 1.2 1.6 0 .4-.7 .3-1.1 .5-.3 .2-.7 .3-1 .5-.4 .2-.7 .3-1.1 .5-.3 .2-.7 .3-1 .5-.4 .1-.8 .2-1.1 .3-.4 .1-.8 .2-1.2 .2-.4 .1-.8 0-1.1-.1-.4 0-.8-.2-1.2-.3-.4 0-.7-.1-1.1-.2-.4 0-.8 0-1.2 .1-.4 .1-.7 .3-1.1 .4-.3 .2-.7 .4-1 .6-.3 .2-.7 .4-1 .6-.3 .2-.7 .4-1 .6-.3 .2-.7 .4-1 .5-.4 .2-.8 .3-1.2 .4-.3 .1-.7 .1-1.1 .1-.4 0-.8 0-1.2 0-.4 0-.7-.1-1.1-.1-.4 0-.9-.1-1.2-.1-.3 0-.3 0-.4-.1-.2 0-.3 0-.4 0-.2 0-.3 0-.5-.1-.1 0-.2 0-.4 0-.1 0-.3-.1-.4-.1-.1 0-.3 0-.4-.1-.2 0-.3 0-.4-.1-.2 0-.3-.1-.4-.1-.2-.1-.3-.1-.4-.2-.1-.1-.2-.2-.3-.3-.1-.1-.2-.2-.3-.3-.1-.1-.2-.2-.2-.4-.1-.1-.1-.2-.2-.3 0-.2-.1-.3-.1-.4-.1-.2-.1-.3-.2-.4 0-.2 0-.3-.1-.5 0-.1 0-.2-.1-.4 0-.1 0-.2-.1-.4 0-.1 0-.3-.1-.4 0-.1 0-.1-.1-.4-.1-.3-.4-.8-.7-1.1-.2-.4-.4-.8-.7-1.2-.2-.4-.4-.7-.6-1.1-.2-.4-.4-.8-.6-1.2-.1-.5-.3-.9-.4-1.3-.1-.4-.1-.9-.1-1.3 0-.5 .1-.9 .2-1.3 0-.5 .1-.9 .2-1.4 .1-.4 .1-.8 .2-1.3 0-.4 .1-.9 0-1.3 0-.4-.1-.9-.2-1.3-.1-.4-.3-.8-.5-1.2-.2-.4-.5-.8-.7-1.2-.2-.4-.4-.7-.6-1.1-.2-.4-.3-.9-.4-1.3-.1-.4-.1-.9-.1-1.3 .1-.4 .2-.9 .3-1.3 .1-.4 .2-.9 .3-1.3 .2-.4 .3-.8 .5-1.2 .1-.5 0-1.2 .4-1.3z',
        bands: [
            'm43-17c1.3 .4 4.9 2.2 7.3 3.5 2.4 1.2 4.8 2.6 7 4.1 2.3 1.5 4.5 3 6.5 4.8 2 1.8 3.7 4 5.4 6.1 1.7 2.1 4.1 5.3 4.8 6.5 .7 1.2-.5 .2-.8 .4-.2 .1-.5 .2-.7 .3-.3 .1-.5 .3-.8 .4-.2 .1-.5 .2-.7 .3-.3 .2 .1 1.2-.8 .4-.9-.9-3-3.8-4.7-5.6-1.6-1.8-3.3-3.6-5.1-5.2-1.9-1.6-4-3-6-4.3-2.1-1.4-4.2-2.6-6.3-3.8-2.1-1.2-5.4-2.6-6.5-3.3-1.1-.7 .1-.7 .2-1 .1-.3 .2-.6 .3-.9 .1-.3 .2-.6 .3-.9 .1-.3 .2-.6 .3-.9 .1-.3-1-1.3 .3-.9z'
        ],
        rows: 'm44.5-15.5-.2 .8-.6 1.2 0 .9-.5 .9-.4 1.1 .4 .8 .4 1.1 .1 .8 .8 1.3 .4 .8-.2 .8 .3 .9 .2 1.2-.6 1.3-.3 1.1 0 .8-.2 1-.1 .9 .5 1.1 .3 .9 .5 1.3 .3 .8 .4 .9 .2 .7m2.2-22-.4 1.3-.7 .8-.4 1-.2 1-.7 .8 .3 1.5 0 .7 .2 1 .1 .7 .4 .8-.1 .7 .1 1.4-.2 .8-.4 .8-.4 1.4 0 .8-.3 1.2 0 1.1-.2 1 .4 .8 .2 .8 0 .7 .5 .8-.1 1.2m5.5-21.1-.5 .7-.9 1.1-.4 .9-.7 1.1 0 1.3-.3 .7-.2 1.1 .2 .7-.2 .5 .4 1 0 .8-.4 .9-.1 .8-.6 1-.3 .9-.5 1.5-.6 .8 0 1.1-.1 .7-.1 1.2 .2 .5-.3 .7 .1 1 .1 .9m8.6-20-.7 1-.7 .9-.8 .9-.4 1.2-.4 .6-.3 1.3-.1 .8-.5 .6-.1 .8-.1 .6-.1 .8-.3 .5-.4 1.1-.3 .9-.7 1.1-.3 .8-.6 1.2-.3 1.2-.5 .8 0 .7-.4 .9 .4 .5-.4 1.1-.2 .2m11.2-18-.3 .7-.8 .7-.7 1.1-.7 .9-.6 .8-.7 .9-.2 .9 0 .7-.4 .3-.3 .7-.3 .9-.7 .5-.3 1-.4 1-.7 .9-.6 1-.5 .9-.7 1-.4 .8-.1 .9-.2 .3-.6 .8-.2 .5-.2 .6m14-16.4-.5 .6-1.1 1.1-.5 .5-.9 1-.4 .7-.5 .8-.8 .9-.5 .5-.4 .4-.3 .4-.2 .6-.8 .8-.7 .5-.6 1-.8 1.2-.7 .8-.2 .9-1 .7-.5 .9-.1 .5-.8 .8-.4 .5-.2 .8-.5 .1m16.6-14.4-.9 .4-1 1-.6 .6-.6 1.1-.7 .8-1.1 .5-.5 .8-.3 .3-.8 0-.2 .6-.7 .4-.6 .5-.9 .7-.7 .9-.5 .6-1.1 1-.4 .7-.8 .7-.7 1-.3 .7-.8 .2-.2 .7-.8 .5-.3 .3m17.8-12-.7 .3-.8 .9-.6 .5-.8 .8-1 .9-.4 .6-.8 .1-.6 .6-.8 .2-.4-.1-.7 .6-.9 0-.9 .9-.7 .8-.7 .4-.6 .9-.7 .6-.7 .9-.8 .7-.6 .3-1.1 .4-.6 .4-.4 .2-1 .1m20-8.9-1.1 .6-.7 .3-.5 .8-.8 .5-1.2 .4-.6 .6-.7 .4-.8-.1-.9 .1-.7 0-.8 .2-1 .5-.6 .5-.7 .6-.6 .4-1.1 .5-.6 .9-.8 .8-1 .1-.5 .7-.9-.1-.8 .5-.7 0-.8 .2m21.3-6.1-.7 .5-1.1 .2-.6 .7-.8 .1-.9 .8-1.2 0-.6 .2-.8 0-.9-.1-1.1-.2-.7 .2-1.1 .2-.8 .4-.8 .2-.9 .4-.5 .8-1.1 .7-.5 .1-.8 .7-1 .2-.6 0-1.1 .2-1-.1-.7 .1',
        rowsHi: 'm45.6-15.3-.2 1-.7 1.1-.2 .9-.3 1.3-.4 .8 0 1 .3 1.3 .4 .9 .3 .9 .6 .7 .3 .8-.2 1.2-.2 .7 .1 1.3-.5 1 .1 .9-.6 1.1 0 1.1 .1 1.2 .6 .7 .1 .9 .7 1.2 .3 .5 .1 1.1m2.9-21.6-.4 .6-.6 1.5-.4 .8-.2 .9-.4 1.2 0 .8-.1 .9 .2 1 .1 .9 .2 .5 .4 .7-.4 1.2-.2 1.2-.2 .8-.7 1.3-.2 .7-.4 1-.2 1 .3 1 0 1.1-.1 .9 .3 .9 .6 .6-.1 .9m6.4-20.4-.7 .7-.7 1.1-.6 1-.5 .9-.3 .9-.1 1.1-.1 .8-.2 .6 0 1 .2 .3-.4 .8-.2 1.3-.2 .6-.4 1.2-.5 .8-.7 1 0 1.2-.7 1.2 .1 .7-.1 .8-.2 1.1 .4 .5-.1 1.1-.2 .8m9.2-19.7-.7 .9-.6 .9-.5 1.1-.5 1-.3 .7-.7 1.1-.3 .5 .1 .9-.3 .7-.2 .5-.4 .8-.2 .9-.2 1-.7 .9-.4 .7-.5 1-.5 1.1-.5 1.2-.6 .6-.2 .8-.1 1 .1 .5-.3 .6-.3 .7m12.1-17.6-.6 .8-.5 .7-.8 1-.7 .9-.8 1 0 .9-.5 .6-.6 .3-.2 .6-.2 .9-.6 .5-.5 .9-.4 .7-.7 .7-.4 1.1-.6 1.1-.6 .7-.6 1-.7 1-.3 .6-.4 .6-.3 .6 .1 .6-.4 .6m14.8-16-1 .5-.4 .9-.8 .8-.7 1.2-1 .7-.6 .8-.6 .4-.5 .8-.3 .3-.2 .2-.6 .7-.6 .5-.8 .9-.5 .7-.7 .8-.9 .9-.7 1.2-.2 .9-.7 .9-.8 .3-.5 .8 0 .4-.6 .5-.5 .4m17.1-13.7-.7 .8-.9 .5-.7 .9-.8 .6-.7 .8-.7 .6-1 .5-.2 .2-.5 .6-.9 .1-.5 .7-.7 .1-.8 .7-.6 1.1-.9 .9-.5 .7-.7 .5-1 .8-.6 .9-.3 .8-.8 .3-.7 .3-.3 .7-.6 .2m18.7-11.6-1 .7-.5 .7-1.2 .5-.8 .8-.8 .5-.8 .5-.7 .7-.4 .3-.8-.2-.9 .4-.6 .4-.6 .4-1 .2-.8 1.1-.6 .5-.7 .5-.8 .9-.9 .5-.7 .7-.7 .3-.4 .7-1 .3-.7 .1-.6 .1m20.3-8.3-1 .8-.5 .3-1 .4-.7 .9-1 .3-.7 .5-.6 .4-.8-.1-.9 0-1-.1-.9 0-.5 .7-1.1 .4-.9 .5-.8 .4-.8 .9-.7 .6-.5 .1-1 .7-.5 .6-1.1-.1-.7 0-.9 .4-.5-.2m21.5-5.2-.9 .8-.7 0-.9 .6-1.1 .7-.9 .3-.8 .3-.9 0-.9-.3-.8 .2-.6-.4-1 0-.8 .2-1.3 .2-.6 .4-.6 .4-.8 .9-.9 .5-.7 .2-1.1 .3-.7 .5-.9 .1-.9-.3-1.3-.1-.6-.1',
        fibers: [
            'm54.8 4.7q.6-.2 1.7 .7m-11.2-16.7q-.4 1.1 .3 1.9m8.5 7.4q.3-.2 1.1-.6m-10.9 3.1q.3 .9 .7 1.1m12.7-6q.5-1.2 1.6-.6m-11.1 3.7q.9 .8 1.7 .5m-.2 12.7q.8 .7 1.5-.1m-6-12.8q.6-.2 1.2 .1m9 9.2q.6-.5 .9-.6m-7 2.5q.6 .2 1.2-.5m7.9-3.6q0 .3 .5 1.2m-13.6-9.9q.8 .1 1.6-.3m-1.7 3.6q1-.4 1.9 .2m3.5-8.7q.7-.2 1.6 1m2.9-1.2q0 .8-.5 1.6m-6.4 15.9q.5-.1 1 .1m4 2.4q1.2 .1 1.6 .8m.7-6.3q.8-.1 1 .6m-8.1-3.7q1 .2 2 .1m.8 7.5q1.1 0 1.4-.7m-5.6-4.6q-.3 .7-.6 .9m2.1-4.1q.9 1-.1 1.9m-.5-.5q1-.3 1.7-.8m7.3 2.7q.5-.4 1.3-.6m-12.7-11.2q.2 .7 0 1.4m-1.2 4.1q-.6 .4-.6 1.2m4.3 6.6q-.3 .6-.8 1.5m-1.1-3.1q.4 .6 1.4 .8m5.9-2.6q.8 .8 .7 1.2m-.6-10q1.2 .2 1.5-.8m-5.1 8.2q1.1-.4 1.4-.9m4.3 3.1q.1 .7-.5 1.1m-5.8-11.3q.6-.9 1.6-.7m-5.4 10.3q.4-.3 1.1 .2m14.4 4.2q.6 1 1.4 .7m-3.7-1q.8-.1 1 .6m0-3.1q1 .2 1.8-.1m-11.7 3.5q.7 .1 1.3-.5m-2.2-19.4q-.7 .6-.4 1.1m9.1 6q1-.7 1.4-.7m12.5 12.2q-.6 .5-.2 1.2m-23.4 1.2q.8 .7 1.8 .3m-5.6-10.8q0 1.1-.8 1.8m2.4 4.9q.2 .6-.2 1.3',
            'm52 5q.4 1.1 1.6 1.1m14.6-3.5q.7-1.2 1.9-.5m-4.9-2.5q-.5 .6 .2 1.3m-20.2 3q1.2-.6 1.9 .5m12.5 6q1-.9 1.8 0m-5.4-9.1q.5 0 .8 .5m7.4 7.4q.8 .6 1.7 .4m-20.6-3.8q.9-.9 1.4-.7m18.4-6.3q1-.6 1.5 .5m-7.8 11.1q.3 .5 .1 1m-10.8-7.3q.6-.7 1.3-.1m-4 .2q.1 .7 .1 1.5m13.8 4.5q.9-.8 1.9 .1m-12.3 .3q.8 .2 1.5-.3m-3.7-9.3q.6 .3 .3 .9m-.9-7.8q1-.1 1.8 .6m5.3 17.8q-.9 .9 .1 1.9m-3.4-19.9q1.1-.3 1.9-.4m9.2 .4q.4 .3 .8 0m-14.7 11q.7-.9 1.5-.3m6.9-4.8q.6-.4 1.3 .2m1.1 4.9q.2-.2 .8 .4m-8-16.8q.3-.6 .8-.3m5.1 20.8q.2 .5 0 1.1m-5.8-12.9q.7 .8 1.7 .6m-6.5 8.3q.6-.6 1.3-.1m2.8 5q.7 .3 1.1 .6m6-1.9q.5 .5 .1 1.1m7.4-3.8q1.1 .6 1.8 .3m-17.4-10.4q.3 .5 .6 1.4m20 9.8q.6 .8 0 1.5m-18.4-12.2q.7-.2 1.6-.9m-2.9 7.2q.9-.4 1.8-.2m-5.2 2.7q.3 0 1.1 .6m-2.4-1.5q.5-.1 1.1 .5m.3 2.3q-.1 .7-.4 1.5m12.4-4q-.5 .3-.3 .8m-11.7 0q.6 .1 1.1 .1m12.5 2.6q.5 .2 1 0m-14.3-9.6q.6-.4 1.1 0m13.8 9q.5 .9 .7 1.8m-13.5 .5q-.3 .8 .4 1.4m14.7-4.5q.8 1 1.6 .6m-21.3-5.5q-.5 .5-.2 1.2m4.6-11.3q-.1 .6 .1 1m-.5-.6q.3 .2 .9-.2m13 4.9q-.4 .6 0 1.1m-9 8.6q.4 .1 .8 .4m2.6-15.4q.6-.3 1.3-.1m3.5 16.7q.7 .6 1.8-.6m.3-3.6q.5-.4 .9 .1m-7.4-2.8q.2 0 .8-.5m-7.7 7.7q1-1 1.3-.8',
            'm48.4-7.7q0 .3 .8 1.3m-3.5 12.9q.6 .3 .9-.4m.3 2.4q.6-.6 1.3-.1m11.6-4.8q.6 0 1.4-.2m-17.2-15q.5-.6 1-.6m-.2 11.5q-.8 .8-.1 1.6m2.5-15q-.4 .2-.4 .8m-1.3 7.3q-.5 .9-.3 1.6m13.3 7.2q.6-.1 1.3-.3m-.9 .3q.5 0 1 0m-.3-8.5q-.6 .6-.1 1.1m-6.5 8.4q1.1-.1 1.8 .5m2.3-12q.8-.4 1.8-.3m-2.9 .4q.6-.3 1.1 .1m-9.2 13.1q1.1-.2 1.9-.5m.3-6.5q.7 .6 .3 1.2m-2.5 3.2q1-1.1 1.8-.6m-1.2-.7q1.1 .4 1.4-.7m2.7 11.4q.5-.6 1.1-.4m8.3-13.5q.2 .1 .8 .3m-4.5 6.2q.5 .5 .8 .3m-6.7-4.6q.4 .7 1.2 .4m-3.6 1.2q.6 .5 1.1 .4m-4.1 6.3q.4-.3 1.3 .4m-3.6-5q.6-.1 1.5 .5m20.7 1q.4-.1 .9-.2m-19.7-1.8q1.1-.5 1.8-.8m-6.8-13.4q.4 .1 1.1 .6m3.8 20.5q.7-.4 1.3-.8m6.3-14.1q.3-.5 1-.5m-5.2-4q.8-.1 1.5-.9m-.8 16.4q.5 .2 .8 .5m0-8.8q.4 .5 .1 1m2.6 12q.4 .5 .9 .5m-12.2-20.2q.7 .7 .5 1.2'
        ],
        lint: [
            'm53.9 9q-.6 .6 .1 1.2m14.9-5.1q-.2 .2-.1 .5m-18.9 6.4q-.2 .3 0 .6m9.6-11.3q.4 0 1 .2m3.6 4.2q.3-.2 .7 0m-19.1-10.3q.4 .4 0 .7m1.8 12.7q.6 .1 1.2 .1m-3.7-4.9q.4 .1 .9 .2m20.4 4.9q.5-.5 1.2-.4m-20.6-.2q.3 .3 .8 .5m16.3-.8q.5 0 .9 0m-14.6 2.6q.3 0 .6 0m9.7-11q.1 .6-.3 1m6.7 8.3q.5-.3 .9-.2m-12.6-.5q.3-.4 .7 .1m.1-3q.5 .4 1 .1m-10.6-4.1q.4 .5 .3 .7m-1.6 2.8q.6-.3 1.1 .4m18.1-3.1q-.5 .2-.4 .9m-.5-6q.6-.4 1.1 .1m-9.8 0q.5 .6 .7 .5m-8.3 12q.3-.3 .7 0m5.9-9.4q.2 .5-.4 1m-2.8-4.1q.5 .2 .8 .3m17 8.2q.4-.4 .6-.3m-14.8-12.1q.3 0 .5 .1m-4.9 18.1q.3 .1 .7-.4m-6.1-12.1q.2 .2 .3 .5m19.7 9.5q.3 .1 .6 .3m-19.9-8.9q.4 .4 .1 .9m5.9-5.4q.8-.3 1-.6m-2.2 15.8q.5 0 .8 .3m-.1 .8q.5 .2 .8 .3',
            'm65.5 5q.4 .1 1.3-.4m-9.6 7.1q.5 .5 .2 .9m1.3-5.5q.5-.2 1-.1m-9-3q.7-.4 1.2-.4m12.9-4.3q.7-.2 1.2 .5m-18.3 10.9q.7-.2 1.1 .5m6.1-11.7q.6-.2 1 .3m5.6 2q-.1 .2 .3 .5m1.2-1q.3 .5 0 .9m-6.5 9.9q.2 .3 .2 .6m-4.2 .2q.2 .4 0 .8m1.1-14.2q.4 0 .6-.3m-10.7-8.4q.3 .5-.1 1.1m17.3 6.1q-.2 .4 0 .8m-8.7-1.4q.5 .6 1.2 .2m12.7 9.4q-.6 .5-.3 1.1m-18.8 .8q.4-.4 1 .2m-3.5-6q.4-.4 1 .1m11.2 9.3q.3 .6 .4 1m-9.1-22.6q.4 .2 .8 .1m1.3 13q.3-.2 .6 0m17.6 3.4q.3-.1 .6-.2m-20.1 2.9q.3 0 .6-.2',
            'm56.6-8.3q0 .4 .5 .8m-7.5 18.9q.3 .3 .7-.2m9.2-2.2q-.1 .3 .1 .6m-7.2-1.7q.3 .1 .9-.2m-4.7-21.1q.5-.7 1.2-.4m14.7 23q.6-.6 1.2 .1m-14.3-8.2q.4 .3 .9-.1m4.6-4.7q.6-.4 1.3-.2m-6.7-2.8q.6 .5 1 .2',
            'm47.2-5.8q.4 .4 .8 0m-.7 10.5q.4-.7 1.1-.6m.4-6.9q.5 .4 .4 .5m13.2 5.3q.4-.2 .6-.1m-9.7 10q.6-.5 1.1 .2m10.1-4q.9-.1 1.1-.6m-13.6 3.2q.5 0 .7-.2m4.4-20q.6-.2 1-.2m-10 16.6q.2-.6 1.1-.6',
            'm52.8-4.4q.6-.1 1 .6m10.2 10.8q.6-.1 1.1 .4m-16.3 2.8q.7 .3 1 .4m7.5-8.3q.3 .3 .5 .2'
        ],
        seam: 'm73.5 6.9-.5 .3-.6 .2-.5 .3-.5 .2-.5 .3-.6 .2-.5 .2-.5 .2-.5 .2-.5 .2-.4 .1-.4 0-.5 0-.4 0-.5-.2-.6-.1-.6-.2-.7-.1-.8 0-.8 .2-.7 .2-.6 .3-.6 .2-.5 .3-.5 .4-.5 .3-.5 .3-.5 .2-.5 .3-.4 .2-.4 .2-.5 .1-.5 .1-.5 0-.5 0-.5 0-.6 0-.5-.1-.6-.1-.6 0-.1 0-.3-.1-.2 0-.2 0-.2 0-.2-.1-.2 0-.2 0-.2 0-.2-.1-.2 0-.2 0-.1-.1-.2 0-.1-.1-.2 0-.1-.1-.1 0-.1-.1 0 0-.1-.1 0-.1-.1 0-.1-.2 0-.1-.1-.2 0-.2-.1-.1-.1-.2 0-.2-.1-.2 0-.2-.1-.2 0-.2-.1-.2 0-.2-.1-.2 0-.2-.1-.2-.1-.4-.4-.7-.4-.6-.3-.5-.3-.6-.3-.5-.3-.6-.3-.5-.3-.6-.2-.5-.1-.5-.1-.5 0-.6 .1-.6 0-.6 .1-.6 .2-.6 .1-.7 .1-.7 0-.8 0-.8-.1-.8-.2-.8-.2-.7-.4-.7-.3-.6-.3-.6-.3-.5-.3-.5-.2-.5-.1-.5-.1-.5 0-.5 .1-.5 .1-.6 .2-.6 .2-.6 .2-.6 .2-.6 .2-.7',
        seamZ: 'm73.7 7.4-1-.7-.1 1.3-1.1-.7-.1 1.2-1.1-.7-.1 1.3-1-.8-.3 1.3-.9-.9-.6 1.2-.5-1.2-.9 1-.3-1.2-.9 .9-.5-1.2-.7 1.1-.7-1-.4 1.2-1-.8-.1 1.2-1.1-.6 0 1.3-1.2-.7 0 1.3-1.1-.6 0 1.3-1.1-.7-.3 1.2-.8-1-.6 1.2-.6-1.1-.7 1-.6-1.1-.7 1-.6-1.2-.8 1-.5-1.1-.8 1-.4-1.3-1.1 .6 .6-1.1-1.3-.2 .9-1-1.2-.3 .9-.9-1.2-.2 .6-1.2-1.3 .1 .6-1.2-1.3 0 .7-1.1-1.3 0 .7-1.1-1.3-.2 .8-.9-1.2-.5 1.1-.7-1.1-.7 1.2-.5-1-.8 1.2-.5-1-.8 1.2-.5-1-.8 1.1-.6-1.2-.6 1-.8-1.2-.3 .8-1-1.3-.2 .7-1-1.3-.1 .7-1.1-1.3 0 .7-1.1-1.2-.4 1.1-.7-1.1-.7 1.2-.4-.8-.9 1.2-.3-.8-1 1.2-.3-.3-.8',
        seamFuzz: 'm51.8 13q.2-1-.5-.9m-4.5-2.9q-.4-.1-.7 .9m22 .4q.6 .5 0 .6m-21.3-1.9q1.1-.7 1.1-.4m-6.1-18.8q-.5 .3-1 .3m3.4 13.7q-.7 .2-1.2 .2m26.8 5.8q.2 .9 .4 1.1m-22.1 1q.2 .7-.4 1m9.5-.2q0 .4 .3 .9m-10.8-5.2q.6-.5 .6-.2m.4 3.2q-.2 1.1-.6 1.5m-3.8-20.1q-.5 .2-1.3 .4m.3-2.1q-.9 .3-.8 .1m11.1 21.6q-.7 .6-.8 1.4m-7-9.3q-.4 .5-1.2 1.1m15.7 5.7q-.4 .2-.6-.5m10-1.1q-.2 .4 .5 .9m-22.2-1.1q0 .7-.9 .4m17.4-.6q-.6 .8-.1 .8m-2.1 0q0 .3 .4 .5m3.5-1.1q0 0-.4 1.1m-22.9-25.1q.8 .3 1.4 .8m6.6 25.8q-.3 .2 .5 1.1m12.5-3.8q.5 .5 .9 .9m-13.1 1.9q0 .5 .2 .7m.3-.6q.2 1 .4 1m-3.8-2.1q-.3 0-.2 .6m-5-20.6q.2 .3-.6 .9m1.9 10.7q.3 .5-.6 .2m.4-.9q.4-.2 1.1 .3',
        crease: 'm43.5-16.5c1.7 1 7 3.5 10.5 5.8 3.5 2.3 7.3 4.9 10.5 7.9 3.2 3 7.1 8.6 8.5 10.3',
        creaseHi: 'm43.1-17c1.8 1 7 3.5 10.5 5.8 3.5 2.3 7.3 4.9 10.5 7.9 3.2 3 7.1 8.6 8.5 10.3'
    },
    // Полотно, висящее через перекладину.
    flap: {
        face: 'm15 16c.5-.4 2-.2 3-.3 1-.1 2-.3 3-.4 1-.1 2-.2 3-.2 1-.1 2-.1 3-.1 1 0 2 .1 3 .3 1 .1 2 .3 3 .5 1 .1 2 .3 3 .4 .9 .2 2 .3 3 .3 1 0 2-.1 3-.2 1 0 2-.2 2.9-.4 1-.1 2-.3 3-.4 1-.1 2-.2 3-.2 1 0 2 0 3 .1 1 .1 2 .2 3 .3 1 .1 2 .2 3 .3 1 .1 2 .2 3 .2 1.1 0 2.1 0 3.1 0 1 0 2 0 3 0 1 0 2-.1 3-.1 1 0 2.5-.6 3-.1 .5 .5 .1 2.2 .2 3.3 .1 1.1 .1 2.2 .2 3.3 0 1.1 .1 2.2 .1 3.3 .1 1.1 .1 2.2 .1 3.3 0 1.1-.1 2.2-.1 3.3-.1 1.1-.2 2.2-.3 3.3-.1 1-.3 2.1-.4 3.2-.1 1.1-.3 2.2-.5 3.3-.1 1.1-.3 2.2-.5 3.2-.2 1.1-.4 2.2-.6 3.3-.2 1.1-.4 2.2-.6 3.2-.2 1.1-.4 2.2-.7 3.3-.2 1-.5 2.1-.7 3.2-.3 1-.6 2.1-.9 3.2-.3 1-.6 2.1-.9 3.1-.4 1.1-.7 2.1-1.1 3.1-.4 1.1-.8 2.1-1.2 3.1-.5 1-.9 2-1.4 3-.4 1-.9 2-1.3 3-.5 1-.8 2.7-1.4 3-.6 .3-1.5-.7-2.2-1.1-.8-.4-1.5-.7-2.3-1.1-.7-.4-1.5-.7-2.2-1.1-.8-.4-1.5-.8-2.2-1.2-.8-.4-1.5-.8-2.2-1.2-.8-.4-1.5-.8-2.2-1.2-.7-.4-1.5-.8-2.2-1.2-.7-.4-1.4-.8-2.1-1.3-.7-.5-1.4-1-2-1.5-.7-.5-1.3-1-2-1.5-.7-.5-1.3-1-2.1-1.4-.7-.5-1.4-.9-2.2-1.2-.8-.2-1.6-.3-2.4-.3-.9 0-1.7 .2-2.5 .2-.9 .1-1.7 .3-2.5 .2-.8 0-1.7-.1-2.5-.3-.8-.2-1.6-.5-2.3-.8-.8-.3-1.6-.6-2.3-.9-.8-.4-1.6-.7-2.3-1.1-.8-.3-1.9-.5-2.3-1-.4-.5-.2-1.5-.3-2.2-.2-.8-.3-1.5-.4-2.3-.1-.7-.2-1.5-.3-2.2-.1-.7-.2-1.5-.3-2.2-.1-.8-.2-1.5-.3-2.3-.1-.7-.2-1.5-.3-2.2 0-.8-.1-1.5-.1-2.3-.1-.7-.1-1.5-.1-2.2 0-.8 0-1.5 0-2.3 0-.7 0-1.5 0-2.2 0-.8 .1-1.6 .1-2.3 0-.8 0-1.5 0-2.3 0-.7 0-1.5 0-2.2 0-.8 0-1.5 0-2.3 0-.7-.1-1.5-.1-2.2-.1-.8-.1-1.5-.2-2.3 0-.7-.1-1.5-.1-2.2-.1-.8-.2-1.5-.2-2.3-.1-.7-.2-1.5-.2-2.2-.1-.8-.7-1.9-.2-2.3z',
        bands: [
            'm32.3 21.6c.3-1.5 1.3 .1 1.9 .2 .7 .1 1.3 .2 2 .3 .6 .1 1.2 .2 1.9 .2 .6 .1 1.3 .1 1.9 .1 .7 0 1.6-1.4 1.9 0 .4 1.5 .5 6 .4 8.9 0 3-.3 5.9-.5 8.8-.2 3-.5 5.9-.8 8.8-.3 2.9-.5 5.8-.9 8.6-.3 2.9-.7 7.1-1.2 8.4-.4 1.3-.9-.5-1.4-.7-.5-.2-1-.4-1.5-.4-.6-.1-1.1-.1-1.6-.1-.6 0-1.1 .1-1.6 .1-.6 .1-1.4 1.6-1.6 .3-.2-1.4 .2-5.7 .3-8.5 .1-2.9 .2-5.8 .3-8.7 .1-2.9 .4-5.8 .6-8.7 .1-3 .3-5.9 .3-8.8 0-3-.6-7.4-.4-8.8z',
            'm35 25.9c.2-1.3 .6 0 1 .1 .3 0 .6 0 .9 .1 .4 0 .7 .1 1 .1 .3 0 .7 0 1 .1 .3 0 .8-1.3 1 .1 .1 1.3 .1 5.2 0 7.8-.1 2.7-.4 5.3-.6 7.9-.2 2.6-.4 5.2-.7 7.8-.2 2.6-.3 5.1-.6 7.7-.3 2.5-.6 6.2-.9 7.4-.3 1.3-.5-.1-.8-.2-.2 0-.5-.1-.7-.1-.3 0-.6 0-.8 0-.3 0-.6 0-.8 0-.3 0-.8 1.3-.8 .1-.1-1.3 .3-5 .5-7.6 .1-2.5 .2-5.1 .3-7.7 .2-2.6 .4-5.2 .6-7.8 .1-2.7 .4-5.3 .5-7.9 0-2.7-.2-6.6-.1-7.9z',
            'm57.4 21.6c.2-1.8 1.2 .1 1.9 .2 .6 .1 1.2 .2 1.9 .3 .6 0 1.3 .1 1.9 .2 .6 0 1.3 0 1.9 .1 .7 0 1.6-1.8 2 0 .3 1.9 .2 7.5 0 11.3-.2 3.7-.8 7.4-1.4 11.1-.6 3.7-1.2 7.4-2 11-.8 3.6-1.8 7.2-2.9 10.8-1.1 3.5-3.1 8.7-4 10.3-.9 1.6-.9-.5-1.4-.7-.5-.3-.9-.5-1.4-.8-.5-.2-.9-.5-1.4-.7-.5-.3-1-.5-1.4-.8-.5-.2-1.7 1-1.4-.8 .2-1.7 2.1-6.5 2.9-9.8 .9-3.4 1.6-6.8 2.2-10.2 .6-3.5 1.2-7 1.6-10.4 .5-3.5 1-7 1.1-10.6 .2-3.5-.4-8.8-.1-10.5z',
            'm60 27.8c.2-1.5 .6 .2 1 .2 .3 .1 .6 .1 .9 .1 .3 .1 .6 .1 1 .2 .3 0 .6 .1 .9 .1 .3 0 .9-1.6 1 .1 0 1.6-.3 6.5-.7 9.8-.3 3.2-.8 6.4-1.4 9.7-.5 3.2-1.1 6.4-1.8 9.6-.8 3.1-1.6 6.3-2.6 9.3-1 3.1-2.7 7.6-3.3 9.1-.7 1.4-.5-.3-.7-.4-.3-.1-.5-.2-.8-.4-.2-.1-.4-.2-.7-.3-.2-.2-.4-.3-.7-.4-.2-.1-1 1.1-.7-.4 .4-1.5 2.1-5.8 2.9-8.8 .9-3 1.6-6.1 2.2-9.2 .7-3 1.2-6.2 1.7-9.3 .5-3.1 1-6.3 1.3-9.4 .3-3.2 .2-8 .5-9.6z',
            'm15 16c2-.3 8-1.1 12-1 4 .1 8 1.4 12 1.5 3.9 0 7.9-1.1 11.9-1.2 4 0 8 .8 12 .9 4.1 .1 10.1-.4 12.1-.2 2 .2 0 .9 .1 1.3 0 .5 0 .9 0 1.3 .1 .5 .1 .9 .1 1.3 .1 .5 .1 .9 .1 1.4 0 .4 2.1 1.1 .1 1.3-2 .2-8-.1-12.1-.3-4-.3-8-1.2-11.9-1.4-4-.1-8 .7-12 .5-3.9-.1-8-1.2-12-1.4-4-.1-10 .6-12 .5-2-.1-.1-.6-.1-.9 0-.3-.1-.6-.1-.9 0-.3 0-.6-.1-.9 0-.3 0-.6 0-.9-.1-.3-2.1-.6-.1-.9z',
            'm15.4 20.5c2-.2 8-.6 12-.5 4 .2 8.1 1.3 12 1.4 4 .2 8-.6 12-.5 3.9 .2 7.9 1.1 11.9 1.4 4.1 .2 10.1 0 12.1 .3 2 .3 0 .9 .1 1.3 0 .4 0 .9 0 1.3 0 .5 0 .9 0 1.3 .1 .5 .1 .9 .1 1.4 0 .4 2 1.2 0 1.3-2 .1-8-.4-12-.8-4-.5-8-1.5-11.9-1.8-4-.3-7.9 0-11.8-.2-4-.3-8.1-1.1-12.2-1.4-4-.2-10 .2-12 0-2-.1 0-.6 0-.9-.1-.3-.1-.6-.1-.9 0-.3-.1-.6-.1-.9 0-.3 0-.6 0-.9-.1-.3-2.1-.7-.1-.9z',
            'm15 16c0-1.5 .5 0 .7-.1 .3 0 .5 0 .7-.1 .3 0 .5 0 .8 0 .2-.1 .4-.1 .7-.1 .2-.1 .5-1.7 .7-.1 .2 1.5 .6 6.2 .7 9.3 .2 3.2 .2 6.3 .2 9.4 0 3.1-.3 6.3-.2 9.4 0 3.1 .2 6.2 .5 9.3 .2 3.1 .9 7.7 .9 9.2 .1 1.5-.3-.1-.5-.2-.2-.1-.4-.2-.6-.3-.1-.1-.3-.1-.5-.2-.2-.1-.4-.2-.5-.3-.2 0-.3 1.3-.6-.2-.3-1.5-1-5.9-1.3-8.9-.4-3-.7-6-.8-9-.1-3 .1-6.1 .1-9.1 0-3-.1-6-.3-9-.1-3-.7-7.5-.7-9z'
        ],
        rows: 'm16.1 17 2.5 .1 2.3-.6 2.5 .2 2.3-.1 2.7-.2 2.3 .4 2.4 .7 2.2-.1 2.8 .4 2 .1 2.5 .1 2.3-.6 2.6-.2 2.6 0 2.1-.4 2.6 .6 2 .1 2.8 .3 2.1 .3 2.7-.2 2.3 0 2.2 .1 2.5-.1 2.6 .2m-57.2 2 2.4-.2 2-.5 2.6 .1 2.4-.3 2.2 .5 2.6 .2 2.2 .2 2.8 .5 2.4 0 2.2 .4 2.4-.1 2.4-.5 2.1 .2 2.4-.5 2.5 .3 2.7 .1 2.2 .5 2.3 .1 2.6 .4 2.1-.1 2.4 .4 2.7 .2 2.5-.3 2.4 .3m-57.6 .3 2.4 .1 2.3-.2 2.4 .3 2.3-.1 2.5-.1 2.8 .4 2.1 .4 2.6 .3 2.5 .2 2.3 .3 2.3 0 2.4-.4 2.2 .2 2.7 .1 2.3-.1 2.2 .4 2.3 .2 2.4 .3 2.5 .4 2.6 .3 2.2 .2 2.6 .1 2.1 0 2.8-.1m-57.7-.1 2.5-.2 2.6-.1 2.1 0 2.5 .3 2.4 .2 2.3 0 2.7 .4 2.3 .5 2.3-.1 2.3 .3 2.6 .1 2.2-.3 2.5 .4 2.3 .1 2.5 0 2.5 .2 2.3 .8 2.3 .1 2.2 .5 2.4 .2 2.6 .5 2.5-.1 2.5 .1 2.1 .3m-57.2-1.8 2.3 .3 2.3 0 2.3 .2 2.8-.2 2.5 .5 2-.1 2.6 .7 2.2-.2 2.6 .2 2.4 .5 2.4-.1 2.1 .4 2.5 0 2.4 .2 2.5 .4 2.3 .1 2.1 .3 2.7 .5 2.2 .8 2.3 .1 2.4 .5 2.5 .2 2.1 .2 2.6 0m-56.8-2.5 2.4 .1 2.3-.1 2.2 .3 2.4-.1 2.4 .6 2.6-.2 2.2 .3 2.3 .6 2.5-.1 2.3 .3 2.6 .2 2 .1 2.3 .6 2.3 .1 2.3 .4 2.4 .4 2.4 .2 2.2 .8 2.5 .4 2.3 .4 2.4 0 2.5 .4 2.4 .4 2.4 .1m-56.7-3.6 2.4 .3 2.2 0 2.5 0 2.2 .5 2.5 .2 2.5 .4 2.1-.2 2.6 .2 2.6 .4 2.1 .5 2.5-.1 2.1 .3 2.2 .2 2.5 .5 2 .7 2.5 .2 2.2 .7 2.2 .3 2.6 .5 2.3 .7 2.3 .2 2.4 .6 2 .4 2.6 0m-56.4-5.1 2.6 .6 2.1-.1 2.2 .4 2.5 .1 2.4 .7 2.2 0 2.7 0 2.1 .1 2.4 .7 2.8 .2 2.3 .2 1.9 .6 2.4 .4 2.1 .2 2.4 .7 2 .2 2.2 .8 2.8 .6 1.9 .6 2.6 .2 2.4 .7 2.1 .2 2.2 .5 2.4 .2m-55.5-5.8 2.4 .4 2.1 .2 2.2 .2 2.5 .6 2.1 0 2.5 .4 2.7 0 1.9 .2 2.6 .2 2.5 .3 2.1 .6 2 .2 2.5 .8 2.3 .2 2.2 .5 2 .6 2.4 .7 2.3 .9 2 .5 2.5 .3 2 .9 2.6 .3 2 .5 2.4 .3m-54.9-7.2 2.4 .3 2.2 .6 2.4 0 2 .8 2.5 .1 2.5 0 2 .1 2.6 .3 2.2 .2 2.3 .5 2.4 .4 2.2 .3 2 .6 1.9 .8 2.2 .4 2.3 .8 2.5 .7 1.9 .9 2.6 .8 1.9 .1 2.4 1 2.3 .5 2.1 .2 2.5 .4m-54.4-8 2.4 .4 2.3 .6 2.1 .1 2.1 .3 2.7 .6 2.2 .4 2.3-.2 2.3-.1 2.2 .3 2.6 .6 2 .4 2 .7 2 .6 2.5 .9 1.8 .6 2.5 .5 2 .9 2.1 .9 2.1 .7 2.5 .4 2.1 .8 2.4 .3 2 .5 2.4 .7m-53.5-9.2 2.1 .2 2.5 .9 2.2 .3 2.2 .6 1.9 .1 2.5 .4 2.3 .1 2.3 .1 2.4 0 2.3 .6 2.1 .3 2 .9 1.9 .9 2.2 .8 2.1 .8 2.3 .4 2.1 .6 1.9 1.1 2.3 .6 2.3 .8 2.1 .7 2.3 .3 2.2 1 1.9 .2m-52.3-10.4 2.4 1.1 2.1 .2 2 .8 2.4 .2 2.4 .5 2.3 .2 1.9-.1 2.1 .2 2.4 .2 2.5 .3 1.9 .9 2.1 .6 1.7 .8 1.9 1 2.4 .9 2 .8 2.1 .9 2.1 .7 2.1 .6 1.9 1 2.4 .6 2.2 .5 2.1 .8 1.8 .5m-51-11.4 2.5 .7 1.7 .7 2.6 .7 1.8 .4 2.2 .3 2.4 .1 2.1 .4 2.3-.2 2.3 .3 1.9 .5 2.3 .6 1.5 .9 2.1 1.1 1.8 .8 2.2 .9 1.8 1 2 .8 2.4 .7 1.6 .7 2 .7 2.2 1 2.3 .5 2.1 .7 2 .7m-49.6-12 2.3 .2 1.8 1.1 1.9 .5 2.1 .5 2.2 .4 2 .5 2.5-.2 1.8-.4 2.4 .4 1.8 .7 2.1 .5 2 1.3 1.7 .8 1.6 1 2.4 1.2 1.6 .9 2.3 .6 1.9 .9 2 1.1 2 .6 1.8 1 1.9 .4 2.1 1.2 2 .8m-47.5-13.5 1.6 .7 1.9 .6 2.3 .8 1.8 .8 2.2 .1 1.9 .4 2 0 2.3-.2 1.8-.2 2.1 .8 1.8 .9 1.8 .8 2 1.4 1.8 1 1.7 1.1 1.7 1.1 1.8 1 2 .9 1.6 .7 2 1 2.2 .8 1.7 .5 2.2 .9 1.8 1m-45.7-14.2 1.6 .6 1.9 1 2 .9 1.9 .3 1.7 .6 2.3 .2 1.7-.4 2.3 .1 2.2-.3 1.8 .8 1.7 1.1 1.6 1.1 1.9 .9 1.5 1.6 1.8 .7 1.7 1.4 1.6 .8 1.8 1.1 1.7 .8 2.2 1.1 1.8 .6 1.8 1.1 1.6 .6 1.8 .8',
        rowsHi: 'm16.4 18 2.5-.4 2.4-.1 2.3-.2 2.3-.1 2.4 .4 2.5 .4 2.4 0 2.4 .5 2.2 .3 2.3 0 2.7 0 2.6-.3 1.9-.4 2.5 0 2.7-.3 2.4 .3 2.1 .3 2.5 .2 2.3 .3 2.6 0 2.3 .1 2.6 0 2.4-.1 2.5 .2m-57.4 1.7 2.4-.5 2.3 .1 2.5-.1 2.1 .2 2.8-.2 2 .4 2.6 .2 2.4 .5 2.5 .1 2.1 .2 2.7 0 2.4-.3 2 0 2.7-.4 2.1 .4 2.7 0 2.2 .5 2.2 .2 2.5 .2 2.6 .6 2.2 0 2.6-.1 2.5 .3 2.2-.2m-57.2 .5 2.1-.2 2.7 .1 2.2-.2 2.4 .2 2.7-.1 2.3 .2 2.2 .6 2.5 .2 2.3 .3 2.6 0 2.5 0 2.2-.1 2.6 .2 2.4-.1 2.3 .3 2 .4 2.7 .1 2.3 .3 2.6 .4 2.2 .3 2.5 .2 2.2 .1 2.8 0 2.3 .4m-57.5-.7 2.3-.4 2.4 0 2.3 .1 2.6 .2 2.6 .2 2.3 0 2.1 .5 2.6 .5 2.7-.2 2 .6 2.8 0 1.9 .1 2.7 0 2.3 0 2.5 .1 2 .2 2.5 .8 2.6 .2 2 .2 2.5 .7 2.2 .1 2.9 .1 2.3 0 2.2 .4m-57.3-2.1 2.5 .4 2.4-.1 2.4-.1 2.6 .4 2 .3 2.8-.1 2.4 .6 2.2 .1 2.3 .1 2.4 .2 2.4 .2 2.5 .3 2.5 .3 1.8 .1 2.5 0 2.7 .3 2.3 .6 2.4 .5 2.1 .2 2.6 .8 2.1 .2 2.6 .3 2 .3 2.5-.2m-57-2.6 2.5-.3 2.6 .1 2 .4 2.4 .3 2.4 .1 2.4 .2 2.8 0 2.4 .6 2.4 .1 2.4 .1 2.3 .4 2.4 0 2.2 .5 1.9 .3 2.4 0 2.4 .9 2.1 .4 2.3 .7 2.7 .5 2.2 .3 2.4 .3 2.5 .1 2.5 .2 2.1 .4m-56.4-4.1 2.1 .1 2.6 .4 2.2 0 2.2 .2 2.7 .3 2.1 .5 2.4-.2 2.8 .5 2.1-.2 2.4 .5 2.3 .5 2.4 .1 1.9 .5 2.6 .4 2.1 .5 2.2 .3 2.4 .5 2.2 .6 2.7 .8 2.4 .4 2 .4 2.5 .4 2.5-.1 1.9 .4m-55.7-5.4 1.9 .4 2.8 .2 2 .3 2.6 .5 2.4 .3 2.4 .1 2.4-.1 1.9 .7 2.8-.3 2.3 .5 2 .4 2.6 .4 2.1 .3 2.3 .8 2.1 .5 2.4 .4 2.3 .5 2.1 .7 2.5 .4 2.2 .8 2.2 .2 2.2 .6 2.2 .4 2.5 .2m-55.4-6.5 2.3 .5 2.4 .2 2.3 .7 2.4 .2 2.1 .2 2.5 .4 2.5 .1 2 0 2.6 0 2.4 .4 2 .7 2.2 .2 2.2 .7 2.3 .6 2.1 .5 2.1 .9 2.4 .5 2.2 .4 2.5 .6 2.2 .7 2.4 .7 2 .4 2.4 .3 2.2 .6m-54.8-7.4 2 .2 2.7 .6 2.3 .3 2.3 .2 2.4 .5 2.2 .3 2-.3 2.4 .2 2.8 .5 2.1 .3 2 .2 2.2 1 2.5 .5 2 .6 1.9 .6 2.4 .6 2 1 2.4 .3 2.1 .7 2.2 .6 2.3 .6 2.3 .4 2.2 .8 2.3 .6m-54.1-8.7 2.2 .1 2.3 .9 2.5 0 2.3 .6 2.4 .4 2.3 .1 2.2 .1 2.3 .3 2.2 0 2.5 .6 2.2 .7 1.8 .5 2.3 .8 2.2 .4 1.8 .6 2.5 1.2 1.9 .5 2.2 .5 2.3 .9 2.2 .7 2.1 .6 2.4 .4 1.9 .8 2.2 .3m-53.1-9.3 2.6 .3 2 .5 2.4 .4 2.1 .8 2.2 .4 2.4-.1 2.3 0 1.9 0 2.4 .6 2.6 .4 1.7 .6 2.4 .8 1.7 .9 2.3 .5 2 .6 2.3 1.2 2 .4 2.2 1.1 2.2 .8 2.1 .6 2.2 .5 1.8 .6 2.5 .9 2.1 .6m-52.2-11.1 2.4 1 2.1 .5 2.2 .4 2.2 .5 2.3 .6 2.3 .3 2.2-.1 2.1-.2 2.1 .3 2.4 .5 2.3 .8 1.8 .6 2 .9 1.9 .7 1.7 1.1 2.2 .9 2.3 .9 1.7 .7 2.3 .6 2.2 .9 1.9 .8 2.1 .6 2.2 .7 2 .8m-50.2-12 1.7 .9 2.3 .7 1.9 .4 2.4 .6 2.3 .4 2 .3 2.1 0 2.2-.4 2.2 .4 2.4 .5 1.8 .7 2.1 .7 1.8 1.3 1.8 1 1.8 .7 2.1 .9 2 1 2 .9 1.8 .8 2.1 .6 2.3 1.1 2 .7 2.1 .4 2.1 1m-48.8-12.7 1.9 .5 1.8 .6 1.9 .8 2.3 .6 1.9 .5 2.4 .4 1.9-.2 2.2-.3 2.1 .2 2.2 .4 1.6 1.2 2 .7 1.8 1.3 1.7 .6 1.9 1.3 1.8 .9 2.1 1.1 2.1 .9 1.7 .5 1.8 1.1 2.3 .9 2 .8 2 .8 1.6 .4m-47-13.6 1.9 .8 2 1 1.8 .8 2.2 .2 2 .5 1.9 .3 2.2-.3 1.9 .1 2.3 .1 1.8 .3 1.7 1.3 1.9 .8 1.9 1 1.5 1.1 1.6 1.4 2.3 1 1.6 .8 1.6 1 2.2 1 1.7 .6 2.1 1 2 .7 1.4 .9 2.3 .9m-45.5-14.7 2.1 .9 1.9 .7 1.8 .9 1.7 .8 2.3 .6 1.8-.1 2.1 0 1.6-.4 2.2 .2 1.7 .7 2.2 1 1.3 1.1 1.6 1.2 1.7 .9 1.6 1.3 1.7 1.1 2 .9 1.7 1 1.9 .9 1.6 1 2 1.1 1.7 .5 1.6 1.1 1.8 1',
        fibers: [
            'm62.7 75q.7 .8-.6 1.7m-4.5-35.2q.7 .8 1.4 .1m-2.8 26.1q.7-.2 1.1-.5m-.4-31.9q.7 .5 1.7-.7m7.2 7.9q.8 .4 1.2-.5m-38-17.5q.5-.1 .8-.2m2.9-7q.2 .6-.1 1.2m23.4 15.2q-.5 .5 .3 1.2m-32.9 10.2q.6 .7 .2 1.3m22.9 8q.8 .2 1.7-.4m9.8 20.1q.4 .2 1.1-.5m-7-17.4q.5-.3 1-.4m-16.6-37.9q.5 .7 1.4 .5m-14.5 21.2q.7-.2 1.6 .1m.6-17.4q.1 .9 .7 1.2m-6.2 34.3q-.3 .6-.6 1.7m36.2 6.4q1-.3 1.9 .6m3.7-21q.8 .1 1.7 .1m-14.7-6.2q.8 .6 1.6-.5m7.4-1.8q.3 0 .8-.3m-34 9.8q-.1 .7 .4 1.6m4.4-3q.3 .2 .8 .4m-6-.3q.4 .5 .9 .2m3.5-23.3q.7 0 1.3 .6m13.6 9.8q.3 .6 1.1 .6m-24.6 10.6q.6 .6 .1 1.3m34.4 2.2q1 1.2 .9 1.6m-37.1-20q.3 .3 1.3 .5m29.7 6.4q.3 .1 .7 .4m-10.8-9.3q.8 .3 1.3 .5m-13.4 14.4q.5 .6 1.1 .3m-3.4 4.1q.5-.2 .8 .2m33.8-21q-.7 .8 0 1.5m-10.8 6q.6 .4 .9 .5m10.1 36.7q0 .9 .4 1.6m-27.6-13.2q-.3 .3-.5 .7m-2.6-4.8q.8-.3 1.6 .6m-11.5-.2q-.2 .5 .1 1m42.5-5.7q1.2 1.2 1.7 .9m-45.2-18.1q.1 1-.7 1.5m14.9 24.4q-1.1 .6-.8 1.4m19.2 1.6q-.2 .6-.6 1m-5.8-21.8q-.1 .5 .1 1.1m-7.1 16.2q-.1 .4 .4 .8m1.3-6q-.7 .7-.2 1.2m-7.7-1.9q.5 .6 .9 .4m9.3 1.7q-.5 .5-.4 1.2m-3.8-18.5q.9 .5 1.7-.6m11.3 2.6q.4 .1 1-.2m-14.7-11q.7-.8 1.9-.6m-6.1 6.3q.9 1.1 1.7 .7m-15.2-10.1q.4 .8-.1 1.5m11 4.4q.8 0 1.5 0m-2.2 13.3q.8-.6 1.4-.2m13.9-24.4q.6-.1 1.6 .5m20.1 34.8q1.2 1 1.6 .9m-10.2 8.3q.5-.3 1.3-.7m-29.7-1q-.6 .5-.3 .9m-7.6-6.4q.1 .9-.6 1.4m40.8-21.5q.6 .4 .5 1m-.2 21.4q.4-.5 .8-.2m-15.5-7.2q1 .5 1.8-.1m-15.5-6.3q.5-.4 1-.6m.9-16.7q.6-.3 1.2-.2m20.3-9.8q-.5 .5-.1 .9m-28.2 29q.9-.3 1.7-.3m-6.2 12.4q.3 .2 1 .6m1-11.9q.9 .2 1.7 0m12.2 13.3q.6 .3 1.6-.4m-11-2.5q.6-.4 .8-.4m13-19.1q-.2 .3 .1 .8m2.9 3.9q.5-.7 1.1-.4m1.2 9.3q.3-.3 .9 .3m-27.8-24.4q-.4 .7-.6 1.2m6.6 32q1.1-.2 2 .3m-7.6-35.8q.5 0 .7-.4m33.8 34q.5 .4 .8 .3m-39.2-25.2q.6-.3 1.4-.3m33.2 14q.6-.9 1.3-.4m-30.1-12.5q1.2 1.1 1.8 .5m26.5-5.4q.4 .8 .3 1.6m-13.5-13q-.4 .6-.3 1.4m-10.9 31.9q.8-.3 1.2 .6m39.3-26.6q.8-.4 1.7 .5m-31.7 21.5q.2 .5-.2 1m31.7-29.8q1.2-.8 1.7-.6m-24.7 46.5q.7 .9 .7 1.5m2.8-14.8q.7 .5 1.3-.1m-5.1 11.1q.3 .2 1.2-.7m18.7-2q.6-.4 1.2-.2m-18.3-13.6q.8 1 1.6 .2m15.6 5.8q.6 .6 1.4 .4m-28.3-2.6q.3 .4 .7 .4m-12.2-3.1q-.4 .8-.7 1.1m10.8-19.8q.5-.1 .7-.5m10.7 11.2q.3 1-.3 1.7m5.4 30.6q-.4 .3-.4 .8m-.6-5.5q.8 .2 1.7 .6m16.9-34.5q1.2 1.1 .9 1.4m-46 11.8q.4-.4 .7-.4m14.9-4.6q.3-.2 1.4 .9m17-5.3q.7 .4 1.4 .1m.4-.8q1 .5 1.7 .7m-9.6 7.2q.5 .3 1 0m-7.7 9.5q.9 .9 1.8 0m-5.8-2.9q.9 .6 1.2 .7m-28.9-31.6q.8-.3 1.6-.3m24.7 28.4q.6 .2 1.4-.2m6-12.1q-.5 1-.6 1.8m4.2 20.6q.6-.1 1.4 .3m-31.7-7.7q.1 .4 .8 .5m22.6-30.2q.6 .1 1.1-.2m-4.8 40.8q.9 .1 1.9 .1m2.5-28.4q.5-.4 .9-.2m-13.8 26.6q.5-.4 .8-.2m-2.4-16.8q.8 .1 1.7 .1m14.4 7.3q.4 1 .7 1.8m-5.1-21.4q.5 .2 .8-.3m.3 17.1q-.2 .7 .3 1.7m-.6-4q.5-.3 .9 .3m-12.7-7.5q.8-1 1.9-.4m27.5 30.7q.8-.5 1.8-.5m-32.3-37.7q.4 .1 1 .6m-3.9 9.5q.5 .9-.1 1.5',
            'm37.2 25.6q.7-.2 1.4 .4m-1-1.4q.6 .6 .9 .4m-15.2 26q.7-.5 1.7-.8m13.3-2.2q.6-.5 1.2 0m10.2 9.5q.8 .4 1.1 .6m14.4 2.9q.8 .1 1.6 .3m-48.1-21.9q.7-.2 1.3-.1m9.8 23.3q1-.4 1.6 .4m10.9-26.3q.6 0 1.4 .3m-9.3 20.7q.8 .6 1.3 .3m3.3-.4q.9 0 1.7 .5m24.9 1q.8 .2 1.3-.7m5.2-33.8q.5 0 1.1-.3m-49.3 6q.9 .4 1.8-.1m7.5 3q.4 .4 .8 .3m23.2 33.7q.6 .9 1.6 .5m5.4-2.1q.6 .4 .8 .5m-23-12q.9-.5 1.7 .3m8.5 3.1q0 .7 .1 1.4m-25.1-16.7q.8 .1 1.9 .5m1.1-2.3q.9 .3 1.7 .1m10.2-2.6q1.1 .4 1.8-.2m5.4 25.9q0 .6-.4 .8m4.3-35q.9-.4 1.9 .2m1.4 39q.6 .5 1.1 .4m-2.2-11.9q.5 .3 .9 .4m-23.3-26.1q.5 .1 1.4 .6m28.3 4q-.4 .6-.5 1m-27.5-2.8q1-.9 2 .1m29.9 19.1q-.1 .5 0 .9m-25.4 5.6q.9 0 1.9-.4m7.5-17.7q.5-.7 1.6-1m-31.2 3.6q.5 .2 1.1 .3m51.1-17.1q.9 0 1.7-.4m-56.4 2.2q.7-.6 .9-.5m49.1 12.6q.5 .4 .7 1.3m-5.9 12.3q-.2 .3 .4 1m-16.2-10.6q.7-.8 1.6-.2m-23.2-16.2q.8-.7 1.3-.5m-8.3 24.6q1.1-1.2 2-.3m47-.1q.7-.2 .8-.5m-10.4-10.6q-.9 .9-.8 1.2m-18.5-1.2q.6 .3 1.3-.1m-9-18.2q.3 .5-.1 1m9.4 19.2q.7 0 1.5 .6m9.6-8.6q.2-.2 .8-.5m-19.1 15.3q.6 .1 1.2 0m24.9-32.4q-.6 .6 0 1.1m-5 33.1q.4 .6 .7 1.5m1.3 12q.5-.1 .9 0m-8.1-37.4q1-.1 1.4-.6m-24.5 30.9q-1.2 .5-.9 1.5m13.9 2.1q.3 .9-.1 1.8m28.5-7.3q.5-.3 1.7-.9m-20.5 10.5q.5-.8 1.5-.8m6.2-47q1-.6 2 0m-13.6 36.3q.7 .6 1.6 .1m4.9 15.7q.7-.8 1.6-.7m-24.9-28.4q.4 0 .9 .1m-3.9 20.2q.7-.6 1.3 .3m10-8.9q.3 .4 1.5-.8m35.7-20.4q.4-.4 .8-.1m-48.5 27.6q1.1-.4 1.5 .6m-.8-8.4q.2 .9-.2 1.8m39.2-26.8q.3 .7-.6 1.9m-39.3-5.1q.6-.5 1.1-.1m36.1 16.4q.6 .2 .9 .6m-20.8 21.6q.4-.1 1.3 .6m-22.1-23.5q.5-.2 1-.3m3.8 9.8q1.1 .8 1.5 .7m16.9-21.2q-.1 1-.2 1.9m14.7-12.2q.6-.1 1.2-.1m-23.2 43.7q1 .4 1.9-.2m-13.4-41q.7-.1 1.8-.8m16.4 43.6q1-.4 1.4 .7m-18.4-20.1q.3 .7 1.1 .5m28.2 4.7q.6 .7 1.2 .1m12.3-16q.8 .8 1.3 .3m1.6 1.9q.9 .6 1.8 .6m-9.2-3.5q-.5 .3-.3 .8m-43.6 6.2q0 .7 .2 1.3m19.3-18.6q-.3 .5 .5 1.4m2.6 25.4q.7-.4 1.4 .1m-6.7 12.5q.7 1.1 1.4 .9m-5.8-38.3q.5 .9 .5 1.5m-3.3 33.6q.5-.4 1 0m.1-38.3q.6-.5 1.3 .3m-8.3 31.3q-.4 .4-.3 .8m19.9 9.5q.8 1 1.8 .4m-20.5-39.2q-.6 .9 .3 1.9m37.8 4.4q.8 .5 1.5-.1m-22.2 7.2q1 .3 1.3 .6m-21 23.4q.7 .3 1.2 .7m-5-9.1q.7-.1 1.8-.7m-1.4-15.4q.6 .1 1-.4m35.7 4.8q-.5 .4-.4 .8m-36.9 6.5q-.2 .5-.3 .8m34.4-21.3q.4-.6 1.4-.8m1.6 5.7q.4-.5 .9-.2m-19.7 24.4q.4-.3 .9 .1m16-14.9q.7-.5 1.4 .1m-21.1 7.7q.5-1 1.3-.7m-14.8 7.6q.4 .1 .9 .4m-4-19.8q-.5 .7-.6 1.6m.9 2.2q-.1 .6 .3 1.3m1.4-9.5q1 .7 1.9-.2m39.1 23.8q.2-.1 .8 .4m-44-.1q.7-.8 1.3-.7m20.5-4.7q.7-.7 1.8-.5m-21.3-11.3q1-.6 1.6-.4m-3.4 19.7q-.6 .7 .3 1.5m30.2-14.6q.9-.7 1.6-.6m.3-16.9q-.5 .8 0 1.6m-6.1 34.6q.4-.2 .9-.2m11-20.1q1-.7 1.6-.8m11.2-17.7q1.1 .3 1.5-.9m-41 11.8q-.7 .7 .1 1.5m-6.8 10.1q.4-.1 .8 .3m23.3-8.6q.6 .2 1.3 .1m-19.7-5.7q.5 1.1-.8 1.8m24.7 24.2q.5 1.1 1.4 1m7.3-3.1q.4 .2 .9 .1m-35.1-27.7q0 .4-.3 .9m0-14.3q.7 .7 1.2 .6m2.6 6.2q.4 .1 1.1-.5m.7 19.1q.9 .8 1.8 .2m6 14.5q0 .7-.7 1.3m-14.2-28.1q.5-.6 1.6-.7m25.8 19.1q.3-.1 .9-.2m12.6 12.4q1 .8 .8 1.6m-18.5 8q.2 .5 0 1m1.9-54.4q.9-.1 1.8-.5m-10.2 43.7q.5-.1 1.1 0m7.6-19.2q.4-.3 1-.4m-12.6 17.4q.5 .6 1 .4m27-7.1q0 .5 .6 1.1m-50-34.2q.7 0 1.3-.2m33.4 8.2q.2 .7 1.1 .7m-34.7 17.1q.7 .5 1.1 .4m13 3.5q-.2 .2 .9 1.3m32.2-16.7q.6 .6 1.7 1m-50.7-3.1q-.3 .7-.4 .9m21.1 1.8q.6 .6 0 1.3m-18.2-17.8q.8-.2 1.6 .1',
            'm51.9 29.6q.6-.5 1.4 .2m1.8 41.8q.4 .4 .8 .1m-17.2-49.9q.3 0 1 .5m-4.7 38.7q.5-.8 1.2-.8m-4.2-38.1q.6-.7 1.3-.3m-8.5 24q.6 .6 1.4 .2m-7.3 2.1q.4-.3 1-.6m38.4-20.6q.6 .6 .2 1.2m-29.3 30.8q.5-.7 1.1-.7m-1.7-33.5q.9-.2 1.7-.1m35.8 27.6q.1 .8-.6 1.1m-32.8 8.1q.9 .2 1.3 .6m22.1-41.7q.7 1.3 1.7 1m-3.6 18.5q-.3 .4-.4 1.1m4.9-9.9q-.3 .5-.3 .9m11.8 22.9q.5 .8 1.3 .3m-35.7 2.3q1.1-.6 1.7-.7m16.6 4.8q-.2 .9-.5 1.8m-23.7-1q.6-.5 1.3-.7m12.1 .2q1 .8 1.9 0m1.3-41.1q.8 .7 .5 1.5m16.5 28q.7-.2 .9 .5m-8.9 .7q.3 0 1-.5m11.7-5.8q.6-.2 1.5-.5m-44.4-7.8q.4-.2 1.2 .4m27.1-19.7q.3-.2 1-.4m-30.5 40q.4 .2 .8 .1m40.4-3.4q.5-.5 .8-.3m-20.1-17.9q-.5 .8-.1 1.5m-27.6-15.4q-.5 .4-.2 .8m54.2 21.1q.5-.5 1.1-.3m-18.3 16.1q.7-.7 1.4 .1m-12.9 6.8q.5-.5 1.1-.2m-.4-3.7q.8-.7 1.6 0m-21.9-44.1q.4-.3 1.1 .5m41 25.3q.9 .9 1.8-.1m-20.3 3.9q.2-.3 1.3 .8m-27 12.1q.8-.6 1.5 .1m40.3 3.3q.9 .9 1.2 .7m-33.5-13.9q-.4 .4-.3 1m12.1-8.3q.7 .2 1.5-.8m14.5 30q.8 .6 1.4 .2m-2.2-.5q.2 .1 .8-.6m-38.5-44.6q.5-.2 .9-.5m8.3-6.9q.3 1 1.4 .8m11.3-2.5q-.3 .4-.1 .8m-7 40q1-1.1 1.7-.6m-15.5-3.6q.6-.6 1.1-.3m14.3-26q.8-.7 1.9 .3m-14.8-2.6q1.1-.8 1.5-1.1m36.8 42q.5 .3 .4 .8m4.5-48.9q.9 .3 1.3-.5m-42.1 23.7q.7 .1 1.7 .9m28.6-24.9q.2 .8-.4 1.6m-32.1 36.3q.9-.1 1.4 .5m24.2 4q.3 .6 1.5 .9m-33.2-35.8q.5-.3 1.1 .2m15.6-2.3q.5-.9 1.1-.6m18.2-5.1q-.5 .6-.2 1.2m-5.6 51q.5-.8 1.2-.3m1.1-42.3q.5-.2 .9 .1m-27.4 13.8q1.2 .9 1.6 .9m9.1 1.2q.2-.5 .8-.5m27.4-9q.4 .5 .2 1m-15.7-5q-.3 .6 .6 1m-20.2 12.6q.6 .2 1.1 .3m19.9 12.7q.8-.2 1.7 .9m-5.3-4q1-.5 1.8-.5m7.5-25.2q.5-.8 1.5-.7m-14.5 6.6q.7-.4 1.5-.1m10.7 16.3q.7 .2 1.7 .3m10.6-15.8q.8 .6 1.5-.1m-10.7-.6q1.1 .4 1.7 .7m-30.3-9q.4-.9 1.2-.7m27.8 45.5q.6 0 .9 .4m-14.5-9.7q.2 .8 .7 1.4m-25.3-17.1q-.3 .4 .2 .9m28.2 1.5q.6-.4 1.1 .1m-9.2 16.6q.6-.1 1.7 .6m-2.4-46.5q.7-.3 1.4-.8m20.9 21.3q.3 .1 1.1 .5m-26.9 5.7q.9 .8 1.3 .7m27.5 19.5q.7 .6 1.6 .9m-4.7-31.7q1.1-.8 1.8-.4m-5.6-15.7q.8-.5 1.8 .4m-10.9 29.8q.4-.2 .8-.1m.9 16.4q1.1 .6 1.9-.6m-8.2-27.4q.9 0 1.8 .1m21.1 8.9q1.3 .3 1.8 1m-5.1 2.5q.4 .3 1.4 .6m-46.9-6.1q.5-.8 1.1-.4m20.2-6.3q.8-.7 1.1-.6m22.3 39.9q.2-.4 .9-.7m4.1-44.4q0 1.1 .7 1.7m-20.7 3.8q1 .4 1.8-.2m10 5.2q.5-.3 1.1 .1m4.3-4.4q-.1 .4-.1 .9m-33.2 15.9q.8-.9 1.6-.1m17 6.7q.8 .8 1 .7m-29.4-5.4q.1 .5-.1 1m5.8-1.8q.9 .2 1.5 1m-6.9-25.7q-.2 .8-.9 1.4m27.7 12.9q.6-.2 1.1-.5m2.1-8.3q1-.1 2-.1m-17.1-16.2q.9-.2 1.8-.5m-10.2 29q.3 .5 .8 .3'
        ],
        lint: [
            'm22.7 40q.4 .1 .6-.2m-2.2-11.5q-.6 .4-.3 .8m42 35.2q.2-.2 .7 .3m-29.3-42.4q.5-.2 .9-.1m-8.1 18.1q.3 0 .4-.2m13.1 23.4q.4 .2 1.2 .4m12.2-9.2q.3-.1 .7 .2m-17.6-.1q.3 .3 .5 .3m-13.1-15.9q.3 .1 .8-.2m15.9 25.8q.4-.1 .9 .1m-8.9-8.6q-.4 .3-.1 .8m17.1-21.4q0 .4 .4 .7m-30.6 22.4q.2-.1 .8 .5m32.4-5.4q.4-.4 .8 0m1.4 5q-.3 .2-.5 .9m.5-23.6q.6 .3 .9 .5m-20.8 10.1q.2 .1 .9 .6m33.6 .6q.2 .1 .5-.1m-13.3-29.8q.6-.2 1.2 0m-22.9 28.8q.5 .4 1 .4m-17.4-21.2q-.3 .3-.1 .7m.8 2.4q.6-.7 1.1-.6m5.6 12.1q.7 .6 1.2 .3m1.3 17.7q.2 .7 .6 1.1m28.6 15.5q.3-.2 .6 0m-10-37.6q.3-.5 .6-.2m3.1-10.9q-.3 .4-.2 .6m-4.2 22.4q-.3 .5-.1 .9m14.9-31q.4 0 1.1-.7m-23.3 43.5q.6 .5 1.1 .3m3.5-23.8q.5 .4 .8 .5m19 15.8q.6 .6 1.1 0m-23.1-10.3q.5-.5 1.1 0m-17.7-10.2q.3-.2 1.1 .6m.2 23.3q.2 .6 .1 1.2m42.1-14.8q-.2 .4 .1 .9m-3.5-10.7q.3 .2 .7-.1m-24.7 20q-.2 .7 .2 1.2m-2.4-.3q.2 .2 .5 .3m11.3 11.4q.1 .4 .6 .3m-6.5-8.3q.3 .1 .7-.2m-8.4-32.8q.2-.2 .5-.3m-13 14.3q-.1 .3-.4 .6m12.4 10.9q.3-.4 .8-.3m21 2.8q.6-.1 1-.3m-23.3 6.7q.8 .2 1.3 .3m23.7 7.2q.2 .5-.2 .7m-8.6-2.1q-.3 .4-.1 .8m-3.1-43.6q.6-.6 1.3-.1m-30.3-3.5q.2 .4 .1 .8m22.9 32.1q.5 .2 1.1-.3m7.8 .8q.1 .2 .5 .2m11.8 15.9q.4 .3 .8 .1m-8.9-10.4q0 .5 .2 .8m-29.4-17.7q0 .3 .2 .5m40.3-1.5q.2 .7-.4 1m-20.1 20.3q.1 .4 .3 .8m-30.7-43.9q.8 0 1.2-.4m25.7 5.7q.3 .2 .6-.2m-10.6 9.2q.3-.1 .6 .1m-16.8 17.3q.4-.1 .8-.1m11.3-22.7q.5-.4 .9-.5m12.4 19.2q.5 .3 .8 .2m23.9-12.4q.5 .2 1.1 .2m-5.2 16.7q.3 .2 .5 .2m-25.2 5.8q.3 0 .8-.2m25.7 2.5q.4 0 .9 0m-17.4-38.5q.2 .5 .7 .5m18 35.9q.3 .4 .9 .5m-24.7-27q.3 .1 .6 0m-9.8-6.5q.5 .2 1 .5m-17.1 5.4q.2 .2 .6 .1m6 16q.5 .1 .9-.4m31.1-16.9q.2 .3 .2 .8',
            'm30.7 55.2q.1 .6-.3 1m4.1-3.1q.5 .4 1.1-.3m19.1 20.3q.3-.1 .6 0m-12.2-31.6q.5-.3 .7-.4m1.6-13q-.1 .4 .4 1.1m12.1 4.3q.6 .5 1.1 .1m-17.4-1q-.6 .4-.3 .8m-14.2 10.8q.5-.1 .7-.4m14.8-4.4q.4 .3 .7-.2m2.4 25.5q.3 .3 .7 0m-19-19.2q.5 .1 .8 .2m44.9-16.7q.4-.4 .6-.3m-28.2 34.7q0 .4 0 .8m-.2 1.8q.4 .3 .9-.1m-17.9-37.1q.4 .6 .4 .7m11.5 24.8q.2 .5 .7 .4m4.6 11.5q.4 .2 .8 .2m-10.8-22.5q.2 .4 .6 .4m-16.6 4.7q.5-.3 .9 .2m37 3q-.2 .5-.1 1m-31.2-19.6q.6 0 1.2 .1m20.8 9.7q.5 .5 .2 .9',
            'm46.7 60.8q.3 .1 1.1 .5m14.9 .9q.5 .6-.2 1.3m-2.2-31.6q.2 .8 .9 .6m-24.3 24.5q.1 .3 .3 .8m-5.7 4q.3-.2 .6 .1m10.7-25.4q-.9 .6-.6 1m-24.5 8.1q.5-.2 1.1-.4m9.7-16.7q.5 .3 1.1-.1m8.1 32.2q.2 .2 .3 .5m9.2 4.5q.1 .6 .3 1.2m-7.3-37q.6 .6 1.2 .2m-17.7 11.7q.4 .3 .8 0m31-12.4q.6-.4 1 .3m-34.3 26.5q.2 .5 .3 .7m29.6 9.6q.4 .4-.4 1.2m-21.8-22q.6-.1 1.2 .1m1.3 13.2q.1 .4-.2 .9m27.2-16q.2-.3 1-.5m-19 18q.2 .2 .9 .6m17.6 7.5q.3 .2 .5 0m11.9-41.4q.3-.3 .9-.5m-47.3 27.3q.2 .4-.3 1m20.6-9.2q.4-.2 .8-.3m7.5 8q.3-.5 .7-.2',
            'm34.2 32q.3-.1 .6 0m-3 10.1q.4 .1 .5-.2m-11.2-3.2q.6-.6 1-.3m40.4-14.1q.5-.4 1.2 .3m-29.6-5.7q.4 0 1-.6m1.1 16.8q.5-.4 1.1-.4m-13.9 20.8q.7-.4 1.2 .4m9.2 .4q.4-.1 .9-.2m5.3 5.3q0 .6-.2 1m16.5-37.6q.4 .3 .6 .2m-12.7 17.9q.4-.5 .6-.3m6.1 9.1q.6 .2 1.2 .3m5.6-30.4q.6 .7 .1 1.3m-16.2 33.1q.4 0 .6 .3m23.4-20.6q.1 .5 .4 .7m-28.8 9.5q.3 .1 .6 .3m8.4-10.1q.5 .5 1 .2m-17.3 13.1q.2 .4 .6 .4m-.1-15q-.4 .1-.4 .6m-.7 7.7q.4 .1 .7-.3m.1-25.8q.2-.2 .7 .1m3.8 21q.3-.1 .6 .2m-17.4-16.8q.4-.3 .8 .1m46.4 35.5q.2 .4 .2 .7m-11.7 10.5q.5 .2 1 .3m1.4-46.3q.5 0 1 .3m-19.7 25.9q.2 .1 .6-.3m30.9 1.6q.1 .3-.3 .6m-16.6-13.2q.5 .5 0 1.1m-32.6 7.9q.3 .2 .7 .2m28.7 23.1q.6 0 .9-.5m5.6-13.4q.3-.4 .6-.2m15.3-19.2q.3 .2 .7 .9',
            'm71.3 43.5q.2-.4 .7-.4m-20 20.9q.5 .2 1 .5m-.7-41.1q.3 0 .7 .2m-14 30.3q.3-.4 .7-.4m23.2 7.9q.5 .4 1.2-.2m-3-29.4q.8 0 1.3 .3m7.7 4.5q-.3 .3-.6 .9m-21.4-19.2q.2 .5-.1 .9m23.7 20.7q.5 0 1.1 .6m-28.3 12q.2-.2 .6-.4m-7.2-15.4q-.4 .6 0 1.2m-3.5 24.7q-.4 .3-.2 .5m27.1-11.8q-.6 .5-.2 .9m-13.8 8.5q.2 0 .5 .3m-19.1-16q.3 .1 .4-.2m-10.1-15.7q.6-.3 .9 .3m35.6 16.6q.2-.1 .6-.3m-.6 6.7q.4 .7 .9 .4m-29.6 6.2q.5-.1 .7 .3m-3.9-30.5q.2-.4 .7-.5m13.4 27.1q.4 0 .8-.1m-18.6-13.3q.4 0 .8 0m18.9 2.9q.6 0 1.1 .2m26.3 1.2q.7-.1 .8 .5m-36.4 12q.3-.1 .6-.1m33.9-37.8q.6 .7 1.1 .2m-18.3 4.6q.4-.2 .7 .2m-23.4 29.1q.6-.1 .9 .4m3.7-27.2q.5 .1 1-.1m29.7 18.5q.3-.3 .6 .1m-37.1-12.6q.6 .2 1.2 .2',
            'm58.4 51.3q.4-.1 .9-.5m-36.8-24.6q.5-.1 1.1 .3m22.3 4.5q.1 .6 .1 1.2m1.3 9.3q.5 .3 1.1 .5m.6-3.2q.1 .4 .1 .8m-19.3 2.5q.3 0 .7 .3m2 7.3q.2 .1 .5 .2',
            'm67.7 51.9q.6-.1 1.2-.1m-13.6 9.2q.4 .4 .1 .7m-28-8.7q.3 0 .6 0m-.4-18.3q.5 .3 1.3 .3m26.3 12.5q.4-.6 1-.5',
            'm62.9 44q0 .3-.3 .6m-3 .5q.6 .4 1.2-.3m-25.2 8.8q-.3 .5-.3 .6m17.1-8.1q.2-.1 .5-.3m2.4 14.5q.4 .4 1.1-.4m.2-7.5q.6-.3 1.1-.2m8.1 5.1q.7 .2 1.3 .1m-11.4-37.9q-.2 .3-.1 .6m-14.7 12.6q0 .6 0 1.1m-10.1 5.1q.3 .2 .5 .1m23.3 6q.3-.1 .5-.3m-7.3 19.1q.3 .7 .9 .5m5.1-46.3q.2 .3 .6 .4m5.2 5.8q.5 .4 .9-.1m-11.6 35.5q.5-.2 .9-.1m-7.8-22.9q.4 .1 .8-.3m11.7-7.9q.6-.8 1.1-.5m13.8 8.1q.6 .4 1.2-.3m-40.3 21.5q.4-.2 .8-.1m10.8-30.4q.2 .2-.4 .8m-15.9 6.4q.4 .3 1 .4m18.4-5.2q.9-.6 1.1-.6m-11.5 8.1q.3 .2 .6-.2m28.2 19.3q.4 .3 1-.2m-40.1-.7q.3-.2 .7 0'
        ],
        fuzz: 'm69.9 63.2q.1-.5 1.3-.1m-55.2-27.9q.5 0 1.1 .2m21.2 30.1q-.4 1.3-.7 2m-21.1-16.6q-.8-.7-1.2-.5m52.4 19.1q1.3-.3 1.9 .4m6-42.4q1 .5 1.7 0m-52.4 36.5q-.3-.5 .6-1.5m48.3-17q-.2-.6-1.4-.7m-15 32.4q.1-.6 0-1.4m5.6 4.2q0-1.4 0-2.1m10.5-30.7q.9 .6 1.1 .4m-59.2-27.1q-.1-.4 1-.5m50.7 51q.8 0 1.1 .1m-50.9-14.6q.1-.4-1 0m-.4-15.7q-.6 .2-.9-.4m12.2 24.4q-.1 .5-.1 1.1m-3.4-2.4q.4 1.2 .5 1.8m9.2-.5q.4 1.5 .2 1.9m42-37.5q1.2-.7 2-.5m-13.2 48.3q1.4-.6 2-.6m-50.7-51.4q-.5-.1-1.8-.9m58.7 27.9q.6 .3 2.1 .3m-36.4 13.2q-.2-.6 .5-1.8m-21.1-4.9q-.5-.2-1.4-.3m35.6 15.8q-.7-1.1-.2-1.4m19.1-12.8q-1.4-.6-1.7-.8m-22.7 12q-.7 1-1.7 1.3m-17.5-7.8q.2 .7-.3 1.1m48.1-49.9q.3 .1 1-.7m-25.2 58.4q.2 .4-.7 1.1m-34.1-29.5q1.3 .5 1.5 .2m47.6 30q.3 .3 .8 .4m-50.6-56.5q-.2 .2-1.2-.1m1-2.2q-.5 .1-1.3-.2m57.7 40q.4-.1 1.2 1m-56.7-11.4q1.2 .7 2.1 .6m47 28.4q1.5 .3 1.9 .2m1.9-9.3q1.1 .4 1.6 1.4m-54.5-33.8q.7-.7 1.4-.6m57.4 5.6q1.3 1 1.5 .9m-60.4-1.3q.1-.7 .8-.4m26.7 30.9q.5-.2 1.9-.6m-29.4-41.2q.8-.4 .8 .3m57.4 16.3q.9 .7 1 .8m-52.5 18.4q.9-1 .7-.9m-7.8-40.6q-1.3 0-1.8 .6m39.3 52.7q.1 .4 .2 1.8m-38-58.4q-1.3 .6-1.5 1m2.3 26q-.8-.4-1.1-.1m22.2 19.8q0 1-1.3 1m38.5-23.7q.1-.2 1.1-.3m-58.7 10.1q.7 .5 1.6 0m6.6 11.9q-.1 1.2-.4 1.8m-8.7-39.7q-1.2 .3-2 .1m27.6 41.4q.5-.9 .6-1.9m-26.1-27.1q.6 .1 1.1-.5m-1-5.2q-1.2 .7-1.4 .4m22.5 31.7q.5-.9 .7-1m-21.1-11.9q-.5 .5-2 .4m1.3-21.9q-1.1 .2-1.3-.9m60.8-5.5q-.3-.2-1.8 .4m-10.7 55.4q.3 .3 1.2 .9m-5.7-3.1q.6-.7 .7-1.7m-43.2-30.8q-1-1-1.6-.8m55.5 18.7q.3-.2 1.4 .4m-4.2 7.4q-.6-.9-1.4-1.3m-49.7-39.1q-.5-.4-1.4 .1m1-7.9q-.4-.2-1.3-.1m8.3 40.4q-.7 .5-.7 1.1m1.8-.7q-.9 .7-.7 .7',
        edge: 'm75 16c0 .5 .1 2.2 .2 3.3 .1 1.1 .1 2.2 .2 3.3 0 1.1 .1 2.2 .1 3.3 .1 1.1 .1 2.2 .1 3.3 0 1.1-.1 2.2-.1 3.3-.1 1.1-.2 2.2-.3 3.3-.1 1-.3 2.1-.4 3.2-.1 1.1-.3 2.2-.5 3.3-.1 1.1-.3 2.2-.5 3.2-.2 1.1-.4 2.2-.6 3.3-.2 1.1-.4 2.2-.6 3.2-.2 1.1-.4 2.2-.7 3.3-.2 1-.5 2.1-.7 3.2-.3 1-.6 2.1-.9 3.2-.3 1-.6 2.1-.9 3.1-.4 1.1-.7 2.1-1.1 3.1-.4 1.1-.8 2.1-1.2 3.1-.5 1-.9 2-1.4 3-.4 1-.9 2-1.3 3-.5 1-.8 2.7-1.4 3-.6 .3-1.5-.7-2.2-1.1-.8-.4-1.5-.7-2.3-1.1-.7-.4-1.5-.7-2.2-1.1-.8-.4-1.5-.8-2.2-1.2-.8-.4-1.5-.8-2.2-1.2-.8-.4-1.5-.8-2.2-1.2-.7-.4-1.5-.8-2.2-1.2-.7-.4-1.4-.8-2.1-1.3-.7-.5-1.4-1-2-1.5-.7-.5-1.3-1-2-1.5-.7-.5-1.3-1-2.1-1.4-.7-.5-1.4-.9-2.2-1.2-.8-.2-1.6-.3-2.4-.3-.9 0-1.7 .2-2.5 .2-.9 .1-1.7 .3-2.5 .2-.8 0-1.7-.1-2.5-.3-.8-.2-1.6-.5-2.3-.8-.8-.3-1.6-.6-2.3-.9-.8-.4-1.6-.7-2.3-1.1-.8-.3-1.9-.5-2.3-1-.4-.5-.2-1.5-.3-2.2-.2-.8-.3-1.5-.4-2.3-.1-.7-.2-1.5-.3-2.2-.1-.7-.2-1.5-.3-2.2-.1-.8-.2-1.5-.3-2.3-.1-.7-.2-1.5-.3-2.2 0-.8-.1-1.5-.1-2.3-.1-.7-.1-1.5-.1-2.2 0-.8 0-1.5 0-2.3 0-.7 0-1.5 0-2.2 0-.8 .1-1.6 .1-2.3 0-.8 0-1.5 0-2.3 0-.7 0-1.5 0-2.2 0-.8 0-1.5 0-2.3 0-.7-.1-1.5-.1-2.2-.1-.8-.1-1.5-.2-2.3 0-.7-.1-1.5-.1-2.2-.1-.8-.2-1.5-.2-2.3-.1-.7-.2-1.9-.2-2.2',
        seam: 'm73.8 16.1 .1 1.6 .1 1.7 .1 1.6 .1 1.6 .1 1.7 0 1.6 .1 1.6 0 1.7-.1 1.6 0 1.6-.2 1.6-.1 1.6-.2 1.7-.2 1.6-.2 1.6-.3 1.6-.2 1.6-.3 1.6-.3 1.7-.3 1.6-.3 1.6-.3 1.6-.3 1.6-.4 1.6-.3 1.6-.4 1.6-.4 1.6-.4 1.5-.5 1.6-.5 1.5-.5 1.6-.5 1.5-.6 1.5-.6 1.5-.7 1.5-.6 1.5-.7 1.5-.7 1.5-.7 1.5-.2 .9 0-.5-1.1-.6-1.1-.5-1.1-.6-1.2-.5-1.1-.6-1.1-.6-1.1-.5-1.1-.6-1.1-.6-1-.6-1.1-.6-1.1-.6-1.1-.6-1-.7-1.1-.6-.9-.7-1-.7-1-.8-1-.8-1-.7-1.1-.8-1.2-.6-1.3-.6-1.4-.3-1.5-.1-1.3 .1-1.3 .1-1.2 .2-1.1 0-1.1 0-1.1-.3-1.1-.3-1.1-.4-1.1-.5-1.2-.4-1.1-.6-1.1-.5-1.2-.5',
        seamZ: 'm74.4 16-1.1 .7 1.1 .6-1 .7 1.1 .6-1.1 .7 1.2 .6-1.1 .7 1.2 .6-1.1 .7 1.1 .6-1 .7 1.1 .6-1.1 .7 1.2 .6-1.1 .7 1.1 .7-1.1 .6 1.1 .7-1.1 .6 1.1 .7-1.1 .6 1.1 .7-1.1 .6 1.1 .7-1.2 .6 1.1 .7-1.2 .6 1.1 .7-1.2 .6 1 .7-1.1 .6 1 .7-1.2 .6 1 .7-1.1 .5 1 .8-1.2 .5 1 .8-1.2 .5 1 .8-1.2 .5 1 .8-1.2 .5 1 .8-1.2 .5 1 .8-1.2 .4 .9 .9-1.2 .4 1 .9-1.2 .4 1 .8-1.2 .5 .9 .8-1.2 .5 1 .8-1.3 .4 1 .9-1.2 .4 .9 .9-1.2 .4 .9 .8-1.2 .4 .9 .9-1.2 .4 .9 .9-1.2 .3 .9 1-1.2 .3 .8 .9-1.2 .3 .9 1-1.3 .3 .9 .9-1.2 .3 .8 1-1.2 .3 .8 .9-1.3 .3 .8 1-1.2 .2 .8 1-1.3 .2 .8 1-1.3 .2 .8 1-1.3 .2 .7 1-1.2 .2 .7 1-1.3 .1 .8 1.1-1.3 .1 .7 1.1-1.2 .1 .7 1.1-1.3 .1 .8 .9-1.2 .4 .1 .2 .1-1.2-1 .7-.1-1.2-1.1 .7-.1-1.3-1.1 .7-.1-1.3-1 .7-.1-1.3-1.1 .7-.1-1.3-1.1 .7 0-1.3-1.1 .7-.1-1.3-1.1 .7 0-1.3-1.1 .7-.1-1.3-1.1 .6 0-1.3-1.1 .7 0-1.3-1.1 .6 0-1.2-1.2 .6 0-1.3-1.1 .6 .1-1.3-1.2 .5 .1-1.2-1.2 .5 .2-1.3-1.2 .5 .2-1.3-1.2 .5 .1-1.3-1.2 .5 .1-1.3-1.1 .6 0-1.3-1.1 .6-.1-1.2-1 .7-.3-1.2-.9 .9-.5-1.2-.7 1.1-.7-1.2-.5 1.2-.8-1.1-.5 1.2-.8-1-.5 1.2-.7-1.1-.6 1.2-.7-1.1-.7 1-.5-1.2-.9 .9-.3-1.2-1 .8-.2-1.2-1 .8-.2-1.3-1 .8-.2-1.3-1 .8-.2-1.3-1 .7-.1-1.2-1.1 .7-.4-.8',
        seamFuzz: 'm42.4 68.4q.1 .2-.2 .9m.2-.9q.3-.8 .4-.6m11.3 7.7q-.9 0-1.6 .8m23-50.4q.6 .6 1.1 .6m-23.6 48.4q.4-.7 1.4-.8m-5.8-1.6q.5-.5 1.3-.7m25.6-47.6q.2 .3 1.4 .8m-37.6 41.2q.1 .8-.6 .5m36.3-50.7q.2-.3 1.1 .6m-.6 15.9q.9 .1 1.7 .1m-5.7 24.3q.1 .3 1 .4m.1-5.3q-.9 .6-1.3 .7m2.2-5.5q-1.2 .2-1.4-.4m-21.3 26.9q-.3-.5 .5-.7m-16.6-8.3q.2 1.1 .8 1.3m-10.6-2q.5 .7 0 .9m29.2 10.6q-.2-.5 .4-.9m7.4 4.8q.1-1 .1-.9m-7.9-3q.6-1 .7-1.4m20.8-44.9q.2 .1 .7 .5m-47.9 35.4q.7 .3 .5 1.3m46.6-40.5q-1.1-.2-1.4 .5m-.3 19.1q.2 .1 .7-.1m-17.1 31.8q.5 .9-.2 1.2m7.9-2.9q.5 .4 .6 .2m-12.7-.8q-.8 .7-1.1 1.2m-30.5-13.6q.1 0 .2 .7m53.9-30.7q.3 .3 1.3 .8m-53.1 30.2q0 1.1 .1 1.1m8.4 .3q.1 .6 0 1.4m31.5 12.2q-.2 .7 .6 1m-33.4-14.4q-.6-.8-.3-.6m8.7 1.7q-.9 .5-.8 .8m16.7 9.1q.4 .6-.4 1.1m-16.5-11.7q.3 0 .3-.5m11.1 8.1q.3-.1 .1 .7m25.5-52.9q0 .4 1.2 0m-15.7 58q-.3 0-.4 .9m-7.4-4.9q-.3-1.1-.1-1.6m21.4-31q0 .4 .8-.3m.4-9.5q.7-.2 1.5 0m-1.5 0q.1-.1 .9 0m-56.1 29.5q-.8 0-.6 .5m43.3 17.5q.1 0 .8 .4m8.5-26.8q-.1 0-1.1-1',
        bend: 'm16 15.5c11-2.1 25-1.1 35-1.7 10-.4 18 .2 23 1.4'
    }
};

if (typeof window !== 'undefined') window.BATH_CLOTH = BATH_CLOTH;
