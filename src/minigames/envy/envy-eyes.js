// ================= ЗАВИСТЬ: ГЛАЗА ВОКРУГ ОКНА =================
// Шкурка окна зависти (CLAUDE.md, инвариант 8; образец — пена похоти,
// docs/plan/25-lust-foam-transition.md): рамка из хаотично расставленных
// глаз — разного размера, под разным углом, внахлёст — и крестик, выложенный
// такими же глазами. Материал греха: за тобой наблюдают отовсюду.
//
// Глаз — чёрный миндаль с зелёной радужкой. Чёрный тот же, что фон окна,
// поэтому глаза сливаются друг с другом и с тьмой: где начинается и кончается
// форма, видно не всегда, и так задумано (оценка игрока). Контура у глаз НЕТ
// — зелёная обводка превращала рамку в россыпь листьев.
//
// Правила раскладки (оценка игрока):
//   * миндали могут налезать друг на друга только чёрным на чёрное: сначала
//     рисуются ВСЕ миндали, потом ВСЕ радужки — ни один глаз не закрывает
//     чужую радужку;
//   * радужки не ставятся близко друг к другу (IRIS_GAP — доля от суммы
//     радиусов), а радужка целиком лежит в рамке: ни на сцену, ни за край
//     холста она не выходит, поэтому в узких боках глаза мельче, наверху и
//     внизу крупнее.
//
// Механизм окна общий (MinigameWindow.attach, опция skin), здесь только вид:
//   rim, cross, bg, reach(), drawGen(ctx, scale) — как у LustFoam.
// Переход (veil*) — следующий этап: пока его нет, окно спрашивает «выйти?».
//
// Как дёшево: глаз — один путь и один градиент, их несколько десятков.
// Рисуются один раз генератором в простое (MinigameWindow.wearSkin), в кадре
// рамка неподвижна.
const EnvyEyes = {
    SEED: 4217,
    rim: { side: 16, top: 54 },
    cross: { x: 358, y: 28, size: 46 },
    CORNER: 26,
    // Миндали заходят в сцену не дальше этого: по числу окно нарезает рамку
    // на полосы (reach). Настоящий заход считается раскладкой.
    REACH_MAX: 40,
    // Глаза кромки по стороне. L — длины крупных (первый проход), Ls —
    // мелких (второй, только в щели между крупными). off — сдвиг центра от
    // кромки в долях полувысоты (минус — в рамку), tilt + jit — наклон к
    // кромке (наименьший и разброс), diag — доля диагональных.
    SIDES: {
        h: { L: [64, 150], Ls: [24, 52], off: [-1.0, 0.3] },
        // Низ — как бока и верх, но каждый глаз ЦЕЛИКОМ на экране (whole) и
        // без крошечных: крупные, ушедшие за край экрана, с закрытым зрачком
        // оставались огромными пустыми обведёнными листьями, а крошечные
        // резали друг другу обводки (оценка игрока: «трэш»). Середину низа
        // занимает веер индикаторов (indicatorEyes), цепочка его обходит.
        b: { L: [64, 150], Ls: [26, 52], off: [-1.0, 0.3], whole: true, noTiny: true },
        v: { L: [54, 140], Ls: [22, 50], off: [-0.9, 0.4] }
    },
    // Сколько кромки можно оставить открытой подряд, если ни один глаз не
    // встал (единиц холста). Цель — почти нигде.
    GAP_STEP: 4,
    TRIES: 200,
    PICK: 8,          // сколько подходящих глаз сравнивать на каждом шаге
    RUN_K: 0.45,
    // Прямоугольники, на которые глаза рамки не заходят (в координатах тела
    // окна 390×800, с запасом KEEP_PAD). Была шкала зависти; её больше нет —
    // деления показывают глаза-индикаторы внизу рамки (indicatorEyes).
    KEEP: [],
    KEEP_PAD: 5,
    // Мелкие глаза в чёрных просветах рамки — после цепочки.
    // Мелкие в глубине рамки — редко: только в заметных чёрных пустотах.
    FILL: { tries: 120, L: [20, 34] },
    IRIS: 0.16,       // радиус радужки в долях длины глаза (рисунок игрока)
    IRIS_GAP: 2.1,    // центры радужек не ближе этого × сумма радиусов
    IRIS_GAP_SMALL: 1.7,
    IRIS_GAP_TINY: 1.25,
    TINY: [16, 28],  // мелкие в щелях — ближе: иначе щель не закрыть
    FILL_GAP: 4,      // у мелких в глубине рамки — реже
    CELL: 40,
    YIELD: 1500,
    _eyes: null,

    get bg() { return this.pal().base; },
    pal() { return PALETTE.envyEyes; },
    reach() { return this._reach || this.REACH_MAX; },

    inner() {
        return this._inner || (this._inner = MinigameWindow.skinGeometry(this).inner);
    },

    // Расстояние до края сцены со скруглёнными углами: больше нуля — в рамке.
    edge(x, y) {
        const I = this.inner(), R = this.CORNER;
        const hx = (I.x1 - I.x0) / 2 - R, hy = (I.y1 - I.y0) / 2 - R;
        const px = Math.abs(x - (I.x0 + I.x1) / 2) - hx, py = Math.abs(y - (I.y0 + I.y1) / 2) - hy;
        return Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0) - R;
    },

    inCross(x, y) {
        const C = this.cross, h = C.size / 2 + 13;
        return Math.abs(x - C.x) < h && Math.abs(y - C.y) < h;
    },

    rng() {
        let a = this.SEED >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },

    // ---------- РАСКЛАДКА ----------
    // Кромка сцены должна быть закрыта глазами почти везде (оценка игрока:
    // ровная рамка не должна читаться), но без наплывов без зрачков — край
    // ломают только сами глаза. Поэтому раскладка — обход кромки: курсор
    // стоит на первой открытой точке, подбирается глаз (длина, угол, сдвиг —
    // случайно), который накрывает эту точку и уходит дальше; курсор
    // переезжает на конец накрытого. Не встал ни один из TRIES — кромка
    // остаётся открытой на GAP_STEP. Радужки — не ближе IRIS_GAP × сумма
    // радиусов, шкалу и крестик не трогают.
    // Потом мелкие глаза в глубине рамки, чтобы чёрное не пустовало.
    *layoutGen() {
        const rng = this.rng(), eyes = [], grid = new Map();
        const key = (i, j) => i * 1000 + j;
        const fits = (x, y, r, gap) => {
            const ci = Math.floor(x / this.CELL), cj = Math.floor(y / this.CELL);
            for (let i = ci - 2; i <= ci + 2; i++) {
                for (let j = cj - 2; j <= cj + 2; j++) {
                    for (const o of grid.get(key(i, j)) || []) {
                        // к мелким зрачкам крестика можно ближе: иначе у угла
                        // оставалась открытая полоса кромки
                        const g = o.cross ? Math.min(gap, 1.5) : gap;
                        if (Math.hypot(o.x - x, o.y - y) < g * (o.r + r)) return false;
                    }
                }
            }
            return true;
        };
        const put = (eye) => {
            eyes.push(eye);
            const kk = key(Math.floor(eye.x / this.CELL), Math.floor(eye.y / this.CELL));
            if (!grid.has(kk)) grid.set(kk, []);
            grid.get(kk).push(eye);
        };
        const lerp = (a, t) => a[0] + (a[1] - a[0]) * t;
        for (const e of this.crossEyes()) {
            e.cross = true;
            const kk = key(Math.floor(e.x / this.CELL), Math.floor(e.y / this.CELL));
            if (!grid.has(kk)) grid.set(kk, []);
            grid.get(kk).push(e);
        }

        const path = this.seamPath(), N = path.length;
        const at = (i) => path[((i % N) + N) % N];
        const covered = (eye, i) => { const q = at(i); return this.inAlmond(eye, q.x, q.y); };
        const chain = [];
        // Веер индикаторов — первым: цепочка кромки обходит их зрачки и
        // считает их кромку закрытой.
        const inds = this.indicatorEyes();
        for (const e of inds) {
            chain.push(e);
            const kk = key(Math.floor(e.x / this.CELL), Math.floor(e.y / this.CELL));
            if (!grid.has(kk)) grid.set(kk, []);
            grid.get(kk).push(e);
        }
        const fan = { x0: Math.min(...inds.map(d => d.x)) - 22, x1: Math.max(...inds.map(d => d.x)) + 22,
                      y0: this.inner().y1 - 30 };
        const coveredAny = (i) => chain.some(e => covered(e, i));
        // соседи — глаза кромки, что стоят вплотную к новому (центры ближе
        // NEAR_K от суммы длин): с ними новый не должен быть схож
        const neighbours = (eye) => chain.filter(e => Math.hypot(e.x - eye.x, e.y - eye.y) < this.NEAR_K * (e.w + eye.w));
        // счёт похожих соседей — для tools/probe-envy-rim.js
        this._alike = 0; this._alikeAt = [];

        // Два прохода (оценка игрока: не засыпать экран мелкими, где хватит
        // одного крупного). Первый — только крупные: каждый накрывает кромку
        // как можно дальше; где крупный не встаёт (шкала, крестик, соседняя
        // радужка), кромка пока остаётся открытой. Второй — мелкие, только в
        // эти щели.
        const self = this;
        // mode: 'big' — крупные, 'small' — мелкие в щели, 'tiny' — крошечные
        // в остатки, куда мелкий не влез (иначе там светила сцена).
        function* walk(mode) {
            const big = mode === 'big', tiny = mode === 'tiny';
            let cur = 0, guard = 0;
            while (cur < N && guard++ < 6000) {
                if (coveredAny(cur)) { cur++; continue; }
                const q = at(cur);
                const P = self.SIDES[Math.abs(q.tx) > Math.abs(q.ty) ? (q.ny < 0 ? 'b' : 'h') : 'v'];
                if (tiny && P.noTiny) { cur++; continue; }
                const tang = Math.atan2(q.ty, q.tx);
                // Соседи не похожи (оценка игрока: одинаковые глаза подряд
                // бросаются в глаза). Уровни: 2 — со всеми соседями различие и
                // размером, и углом; 1 — только размером (угол «старается»,
                // размер — обязательно); 0 — похож, это исключение, считается.
                const cands = [];
                let found = 0;
                for (let k = 0; k < self.TRIES && found < self.PICK; k++) {
                    const L = lerp(big ? P.L : tiny ? self.TINY : P.Ls, rng());
                    // Не вдоль кромки, а с наклоном: один уголок острым выходит
                    // на сцену, другой прячется в рамке. Глаз, лежащий ровно
                    // вдоль, показывал только круглый бок — гребешок пены.
                    // Три семейства наклона — пологий, средний, крутой (крутые
                    // встают только мелкими: крупный упёрся бы в REACH_MAX).
                    // Было по сути два — «/» и «\» под одним углом, и когда
                    // обводка сделала глаза видными, рамка читалась узором.
                    const fam = rng();
                    const mag = P.flat ? rng() * P.flat
                        : fam < 0.4 ? 0.12 + rng() * 0.38 : fam < 0.75 ? 0.5 + rng() * 0.4 : 0.9 + rng() * 0.55;
                    const rel = (rng() < 0.5 ? -1 : 1) * mag;
                    const halfH = L * 0.26, off = lerp(P.off, rng()) * halfH;
                    // центр впереди курсора: глаз накрывает курсор задним краем
                    const ahead = L * 0.5 * Math.abs(Math.cos(rel)) * (0.55 + rng() * 0.45);
                    const x = q.x + q.tx * ahead + q.nx * off, y = q.y + q.ty * ahead + q.ny * off;
                    const eye = { x, y, w: L, r: L * self.IRIS, ang: tang + rel };
                    // зрачок целиком на экране: обрезанный краем холста — не глаз, а пятно
                    if (x - eye.r < 1 || y - eye.r < 1 || x + eye.r > STAGE_W - 1 || y + eye.r > STAGE_H - 1) continue;
                    // весь миндаль на экране
                    if (P.whole && !self.onScreen(eye)) continue;
                    if (!covered(eye, cur) || !fits(x, y, eye.r, big ? self.IRIS_GAP : tiny ? self.IRIS_GAP_TINY : self.IRIS_GAP_SMALL)) continue;
                    if (self.hitsKeep(x, y, L, eye.ang) || self.intoScene(eye) > self.REACH_MAX) continue;
                    // Веер читается сам по себе: обычные глаза между лучами
                    // делали из него кашу. В зоне веера обычных глаз нет
                    // совсем, и ни один снаружи не задевает лучей.
                    if (x > fan.x0 && x < fan.x1 && y > fan.y0) continue;
                    if (inds.some(d => self.overlaps(d, eye))) continue;
                    if (inds.some(d => self.inAlmond(eye, d.x, d.y))) continue;
                    let run = 0;
                    while (run < 300 && covered(eye, cur + run)) run++;
                    let tier = 2;
                    for (const n of neighbours(eye)) {
                        if (!self.sizeDiff(eye, n)) { tier = 0; break; }
                        if (!self.angDiff(eye, n)) tier = 1;
                    }
                    // Ритм: похожий на глаз через одного (не касается, но рядом)
                    // — это «А-Б-А», ровное чередование. Штраф, а не запрет.
                    let echo = 0;
                    for (const n of chain) {
                        const d = Math.hypot(n.x - eye.x, n.y - eye.y);
                        if (d < self.NEAR_K * (n.w + eye.w) || d > self.ECHO_K * (n.w + eye.w)) continue;
                        if (!self.sizeDiff(eye, n) && !self.angDiff(eye, n)) echo++;
                    }
                    if (tier === 2 && !echo) found++;
                    cands.push({ eye, run, tier, echo });
                }
                if (!cands.length) { cur += self.GAP_STEP; continue; }
                // Высший уровень; в нём не самый дальний, а случайный из тех,
                // кто накрывает не меньше RUN_K от лучшего: «всегда самый
                // дальний» давал ровное чередование крупный–мелкий–крупный.
                const bestTier = Math.max(...cands.map(c => c.tier));
                const tierC = cands.filter(c => c.tier === bestTier);
                const minEcho = Math.min(...tierC.map(c => c.echo));
                const top = tierC.filter(c => c.echo === minEcho);
                const maxRun = Math.max(...top.map(c => c.run));
                const pool = top.filter(c => c.run >= maxRun * self.RUN_K);
                const best = pool[Math.floor(rng() * pool.length)].eye;
                if (bestTier === 0) { self._alike++; self._alikeAt.push([Math.round(best.x), Math.round(best.y)]); }
                put(best);
                chain.push(best);
                if (guard % 8 === 0) yield;
            }
        }
        yield* walk('big');
        yield* walk('small');
        yield* walk('tiny');

        // Мелкие в глубине рамки: радужка целиком в рамке.
        const F = this.FILL;
        for (let n = 0; n < F.tries; n++) {
            const x = rng() * STAGE_W, y = rng() * STAGE_H;
            const e = this.edge(x, y);
            if (e <= 0 || this.inCross(x, y)) continue;
            const w = lerp(F.L, rng()), r = w * this.IRIS;
            if (r > Math.min(e, x, y, STAGE_W - x, STAGE_H - y) - 2 || !fits(x, y, r, this.FILL_GAP)) continue;
            const eye = { x, y, w, r, ang: this.tangent(x, y) + (rng() - 0.5) * 1.4 };
            if (this.hitsKeep(x, y, w, eye.ang)) continue;
            // мелкие — под крупными: в списке первыми, рисуются раньше
            eyes.unshift(eye);
            const kk = key(Math.floor(x / this.CELL), Math.floor(y / this.CELL));
            if (!grid.has(kk)) grid.set(kk, []);
            grid.get(kk).push(eye);
        }
        // индикаторы рисуются последними — поверх соседей, обводка целая
        for (const e of inds) eyes.push(e);
        let reach = 0;
        for (const e of eyes) reach = Math.max(reach, this.intoScene(e));
        this._reach = Math.ceil(reach) + 2;
        for (const e of eyes) e.rim = true;
        this.pickInverted(eyes);
        yield;
        return eyes;
    },

    // ---------- ИНДИКАТОРЫ ----------
    // Шкалы зависти нет: деления — глаза веером по центру низа рамки
    // (замысел и набросок игрока). Веер — лучами из точки под экраном:
    // каждый глаз вытянут ВДОЛЬ своего луча, средний стоит вертикально,
    // крайние почти легли; нечётное — средний луч есть, чётное — посередине
    // пусто. Сколько делений — из конфига (rounds), при прокачке веер
    // перестраивается сам. Виды чередуются: чёрный с зелёным зрачком и
    // обратный (зелёный миндаль). Деление заполнено — глаз открыт, нет —
    // закрыт (тело с обводкой). Открывает и закрывает их EnvyEyes.setFill.
    // (Первая версия — глаза поперёк дуги, как карты, — читалась рядом.)
    IND_PIVOT: 872,   // точка, откуда расходятся лучи (под экраном)
    IND_RX: 118,      // до центров глаз: по горизонтали
    IND_RY: 74,       // и по вертикали — дуга приплюснута, крайние ниже
    IND_STEP: 0.56,   // наибольший шаг между лучами, рад (~32°)
    IND_SPREAD: 1.15, // наибольший раствор в одну сторону, рад (~65°)
    IND_L: 64,
    indicatorEyes() {
        if (this._inds) return this._inds;
        const N = (typeof ECONOMY !== 'undefined' && ECONOMY.minigames.envy) ? ECONOMY.minigames.envy.rounds : 3;
        const step = N > 1 ? Math.min(this.IND_STEP, 2 * this.IND_SPREAD / (N - 1)) : 0;
        // лучи теснее — глаза уже: соседние не налезают друг на друга
        const L = Math.min(this.IND_L, 30 + step * 70);
        const cx = STAGE_W / 2;
        this._inds = [];
        for (let i = 0; i < N; i++) {
            const phi = (i - (N - 1) / 2) * step;     // чётное — само без среднего луча
            this._inds.push({ x: cx + this.IND_RX * Math.sin(phi), y: this.IND_PIVOT - this.IND_RY * Math.cos(phi) - L * 0.2,
                              w: L, r: L * this.IRIS, ang: phi - Math.PI / 2, ind: i, kind: i % 2 ? 'inv' : undefined });
        }
        return this._inds;
    },

    // Налезают ли два миндаля (по контурам эллипсов и центрам).
    overlaps(a, b) {
        if (this.inAlmond(a, b.x, b.y) || this.inAlmond(b, a.x, a.y)) return true;
        for (const [p, q] of [[a, b], [b, a]]) {
            const c = Math.cos(p.ang), s = Math.sin(p.ang), A = p.w * 0.48, B = p.w * 0.22;
            for (let i = 0; i < 16; i++) {
                const t = i / 16 * Math.PI * 2, ex = Math.cos(t) * A, ey = Math.sin(t) * B;
                if (this.inAlmond(q, p.x + ex * c - ey * s, p.y + ex * s + ey * c)) return true;
            }
        }
        return false;
    },

    // ---------- ДВА ВИДА ГЛАЗ ----------
    // Чёрный глаз на чёрной рамке виден только зрачком — рамка читалась
    // россыпью зелёных точек, миндаля не разглядеть (оценка игрока). Поэтому
    // часть глаз — наоборот: зелёный миндаль с чёрным зрачком (kind 'inv').
    // Обратные не касаются друг друга — каждый окружён чёрными, виды
    // чередуются и форма видна. И обратный не ложится на чужой зелёный
    // зрачок: зелёное на зелёном сливается.
    pickInverted(eyes) {
        const all = eyes.filter(e => e.r);
        const list = all.filter(e => e.ind == null);
        const cx = STAGE_W / 2, cy = STAGE_H / 2;
        list.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
        const touch = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < this.NEAR_K * (a.w + b.w);
        const coversIris = (inv, o) => {
            if (this.inAlmond(inv, o.x, o.y)) return true;
            for (let i = 0; i < 8; i++) {
                const t = i / 8 * Math.PI * 2;
                if (this.inAlmond(inv, o.x + Math.cos(t) * o.r * 1.2, o.y + Math.sin(t) * o.r * 1.2)) return true;
            }
            return false;
        };
        const inv = [];
        const pass = (allowHide) => {
            for (const e of list) {
                if (e.kind === 'inv' || !e.r) continue;
                if (inv.some(o => touch(o, e))) continue;
                // обратный индикатор рядом — тоже «обратный сосед»
                if (all.some(o => o.ind != null && o.kind === 'inv' && touch(o, e))) continue;
                // свой чёрный зрачок — не под чужим обратным
                if (inv.some(o => coversIris(o, e))) continue;
                // ни на чей зелёный зрачок; во втором проходе (низ, где глаза
                // мелкие и плотные — иначе там не встал ни один обратный)
                // можно накрыть один: у того соседа зрачка больше нет, он
                // просто чёрное тело, прикрытое обратным.
                if (all.some(o => o.ind != null && coversIris(e, o))) continue;
                const under = list.filter(o => o !== e && o.r && o.kind !== 'inv' && coversIris(e, o));
                if (under.length > (allowHide ? 1 : 0)) continue;
                for (const o of under) o.r = 0;
                e.kind = 'inv';
                inv.push(e);
            }
        };
        pass(false);
        pass(true);
        // крестик — тоже зелёный миндаль: соседние зрачки под ним уже
        // не лежат (раскладка держит их поодаль)
    },

    // Шов, который надо закрыть: кромка видимой сцены (скруглённый
    // прямоугольник, как у edge()) на SEAM_IN единицы внутрь сцены, точками
    // через 1 единицу. tx, ty — направление обхода, nx, ny — нормаль В сцену.
    // Обход по часовой, от середины верха.
    // Подложка рамки заходит на сцену на OVERLAP, шов проверяется на
    // полединицы глубже её края (см. drawGen).
    OVERLAP: 1.5,
    SEAM_IN: 2,
    seamPath() {
        const I = this.inner(), d = this.SEAM_IN, R = this.CORNER - d;
        const x0 = I.x0 + d, y0 = I.y0 + d, x1 = I.x1 - d, y1 = I.y1 - d;
        const pts = [];
        const line = (ax, ay, bx, by) => {
            const len = Math.hypot(bx - ax, by - ay), tx = (bx - ax) / len, ty = (by - ay) / len;
            for (let s = 0; s < len; s += 1) pts.push({ x: ax + tx * s, y: ay + ty * s, tx, ty, nx: -ty, ny: tx });
        };
        const arc = (cx, cy, a0) => {
            const n = Math.ceil(R * Math.PI / 2);
            for (let i = 0; i < n; i++) {
                const a = a0 + (i / n) * Math.PI / 2, ox = Math.cos(a), oy = Math.sin(a);
                pts.push({ x: cx + ox * R, y: cy + oy * R, tx: -oy, ty: ox, nx: -ox, ny: -oy });
            }
        };
        const mx = (x0 + x1) / 2;
        line(mx, y0, x1 - R, y0);
        arc(x1 - R, y0 + R, -Math.PI / 2);
        line(x1, y0 + R, x1, y1 - R);
        arc(x1 - R, y1 - R, 0);
        line(x1 - R, y1, x0 + R, y1);
        arc(x0 + R, y1 - R, Math.PI / 2);
        line(x0, y1 - R, x0, y0 + R);
        arc(x0 + R, y0 + R, Math.PI);
        line(x0 + R, y0, mx, y0);
        return pts;
    },

    // Точка внутри миндаля: в системе глаза |v| не выше верхней дуги.
    // Дуга — та же кубическая Безье, что в almond(); её высота от u
    // берётся по таблице (ALMOND_T), посчитанной один раз.
    inAlmond(e, x, y) {
        const c = Math.cos(e.ang), s = Math.sin(e.ang), dx = x - e.x, dy = y - e.y;
        const u = (dx * c + dy * s) / e.w, v = Math.abs(-dx * s + dy * c) / e.w;
        if (u <= -0.5 || u >= 0.5) return false;
        const T = this.almondTable(), f = (u + 0.5) * (T.length - 1), i = Math.floor(f);
        const h = T[i] + (T[Math.min(i + 1, T.length - 1)] - T[i]) * (f - i);
        return v < h;
    },

    almondTable() {
        if (this._almondT) return this._almondT;
        // верхняя дуга almond() при w = 1: (-0.5,0) → (0.5,0), опоры ±0.22, высота a·1.38
        const a = 0.26 * 1.38, n = 64, T = new Array(n + 1).fill(0);
        for (let k = 0; k <= 400; k++) {
            const t = k / 400, m = 1 - t;
            const bx = m * m * m * -0.5 + 3 * m * m * t * -0.22 + 3 * m * t * t * 0.22 + t * t * t * 0.5;
            const by = 3 * m * m * t * a + 3 * m * t * t * a;
            const j = Math.round((bx + 0.5) * n);
            T[j] = Math.max(T[j], by);
        }
        return (this._almondT = T);
    },

    // Те же прямоугольники шкалы в координатах холста: тело окна уменьшено
    // в k и сдвинуто в угол сцены (MinigameWindow.skinGeometry).
    keepRects() {
        if (this._keep) return this._keep;
        const G = MinigameWindow.skinGeometry(this), I = G.inner, p = this.KEEP_PAD;
        return (this._keep = this.KEEP.map(r => ({
            x0: I.x0 + r.x0 * G.k - p, y0: I.y0 + r.y0 * G.k - p,
            x1: I.x0 + r.x1 * G.k + p, y1: I.y0 + r.y1 * G.k + p })));
    },

    // Заходит ли глаз на шкалу: углы прямоугольника и точки контура глаза.
    hitsKeep(x, y, w, ang) {
        const e = { x, y, w, ang }, a = w / 2;
        for (const R of this.keepRects()) {
            if (x + a < R.x0 || x - a > R.x1 || y + a < R.y0 || y - a > R.y1) continue;
            for (let px = R.x0; px <= R.x1; px += 3) {
                if (this.inAlmond(e, px, R.y0) || this.inAlmond(e, px, R.y1)) return true;
            }
            for (let py = R.y0; py <= R.y1; py += 3) {
                if (this.inAlmond(e, R.x0, py) || this.inAlmond(e, R.x1, py)) return true;
            }
            if (x > R.x0 && x < R.x1 && y > R.y0 && y < R.y1) return true;
        }
        return false;
    },

    // Насколько глубоко миндаль заходит в сцену (по эллипсу с теми же осями).
    intoScene(e) {
        const I = this.inner(), a = e.w / 2, b = e.w * 0.27, c = Math.cos(e.ang), sn = Math.sin(e.ang);
        let m = 0;
        for (let i = 0; i < 24; i++) {
            const t = i / 24 * Math.PI * 2, ex = Math.cos(t) * a, ey = Math.sin(t) * b;
            const px = e.x + ex * c - ey * sn, py = e.y + ex * sn + ey * c;
            m = Math.max(m, Math.min(px - I.x0, I.x1 - px, py - I.y0, I.y1 - py));
        }
        return m;
    },

    // Направление кромки сцены рядом с точкой: у верха и низа горизонталь, у
    // боков вертикаль.
    // Различие соседей: длины — не ближе SIZE_K раз, углы (миндаль
    // симметричен, сравнение по модулю π) — не ближе ANG_K.
    SIZE_K: 1.3,
    NEAR_K: 0.5,
    ECHO_K: 1.1,      // «через одного» — центры дальше касания, но ближе этого
    ANG_K: 0.35,
    sizeDiff(a, b) { return Math.max(a.w, b.w) / Math.min(a.w, b.w) >= this.SIZE_K; },
    angDiff(a, b) {
        let d = Math.abs(a.ang - b.ang) % Math.PI;
        return Math.min(d, Math.PI - d) >= this.ANG_K;
    },

    // Миндаль целиком на холсте (по эллипсу с теми же осями).
    onScreen(e) {
        const a = e.w / 2, b = e.w * 0.27, c = Math.cos(e.ang), s = Math.sin(e.ang);
        const hx = Math.abs(a * c) + Math.abs(b * s), hy = Math.abs(a * s) + Math.abs(b * c);
        return e.x - hx >= 0 && e.x + hx <= STAGE_W && e.y - hy >= 0 && e.y + hy <= STAGE_H + 2;
    },

    tangent(x, y) {
        const I = this.inner();
        const dx = Math.max(I.x0 - x, x - I.x1, 0), dy = Math.max(I.y0 - y, y - I.y1, 0);
        return dx > dy ? Math.PI / 2 : 0;
    },

    // Крестик — один глаз наоборот: зелёный миндаль с чёрным зрачком-
    // крестиком (набросок игрока). Раньше был выложен десятью мелкими
    // зрачками по диагоналям, потом — зелёный крестик на чёрном глазу
    // (тело сливалось с тьмой, глаза не было видно).
    // r — полуразмер крестика: по нему же держат расстояние чужие зрачки.
    CROSS_W: 68,
    CROSS_R: 10,
    crossEyes() {
        const C = this.cross;
        if (!this._cross) this._cross = [{ x: C.x, y: C.y, w: this.CROSS_W, r: this.CROSS_R, ang: 0, kind: 'x' }];
        return this._cross;
    },

    // ---------- ГЛАЗ ----------
    // Миндаль: две дуги между острыми уголками, высота ~0,52 длины — как на
    // рисунке игрока. Радужка — круг по центру с мягким бликом.
    // o — раскрытие (0 — закрыт, линия; 1 — открыт): веки сходятся к оси
    // глаза симметрично сверху и снизу (покров, envy-eyes-veil.js).
    almond(ctx, w, o = 1) {
        const a = w * 0.26 * o;
        ctx.beginPath();
        ctx.moveTo(-w / 2, 0);
        ctx.bezierCurveTo(-w * 0.22, -a * 1.38, w * 0.22, -a * 1.38, w / 2, 0);
        ctx.bezierCurveTo(w * 0.22, a * 1.38, -w * 0.22, a * 1.38, -w / 2, 0);
        ctx.closePath();
    },

    // Миндаль — только чёрная заливка, без контура.
    body(ctx, e) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.ang);
        this.almond(ctx, e.w);
        ctx.fillStyle = this.pal().base;
        ctx.fill();
        // Чёрная обводка в единицу — не контур (на чёрном её не видно), а
        // нахлёст: два сглаженных края встык (глаз и глаз, глаз и подложка)
        // складывались не до полной непрозрачности, и сцена светила точками.
        ctx.strokeStyle = this.pal().base;
        ctx.lineWidth = 1;
        ctx.stroke();
        this.rimLine(ctx, e);
        ctx.restore();
    },

    // Зелёная обводка чёрных глаз рамки (просьба игрока — для контраста:
    // чёрный миндаль на чёрной рамке иначе не виден). Раньше обводки не было
    // ни у кого — когда она была у всех глаз, рамка выходила россыпью
    // листьев; теперь только у чёрных, рядом с зелёными обратными.
    RIM_LINE: 1.6,
    rimLine(ctx, e) {
        // индикаторы — всегда с обводкой: закрытый обратный иначе исчез бы
        if (!e.rim || e.kind === 'x' || (e.kind === 'inv' && e.ind == null)) return;
        ctx.strokeStyle = this.pal().iris;
        ctx.lineWidth = this.RIM_LINE;
        ctx.stroke();
    },

    // Радужка — плоский зелёный круг: без градиента, блика и свечения
    // (оценка игрока: только чёрное тело и плоский зелёный зрачок).
    iris(ctx, e) {
        if (!e.r) return;
        this.pupil(ctx, e, e.x, e.y);
    },

    // Зрачок в точке (x, y): круг или, у глаза крестика, зелёный крестик.
    pupil(ctx, e, x, y) {
        const P = this.pal();
        if (e.kind === 'inv') {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(e.ang);
            this.almond(ctx, e.w * 0.92);
            ctx.fillStyle = P.iris;
            ctx.fill();
            ctx.fillStyle = P.base;
            ctx.beginPath();
            ctx.arc(0, 0, e.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
        }
        if (e.kind === 'x') {
            const h = e.r;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(e.ang);
            // зелёный «белок» чуть меньше чёрного тела — по краю тонкая тьма
            this.almond(ctx, e.w * 0.9);
            ctx.fillStyle = P.iris;
            ctx.fill();
            ctx.rotate(-e.ang);
            ctx.strokeStyle = P.base;
            ctx.lineWidth = h * 0.42;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-h, -h); ctx.lineTo(h, h);
            ctx.moveTo(h, -h); ctx.lineTo(-h, h);
            ctx.stroke();
            ctx.restore();
            return;
        }
        ctx.fillStyle = P.iris;
        ctx.beginPath();
        ctx.arc(x, y, e.r, 0, Math.PI * 2);
        ctx.fill();
    },

    draw(ctx, scale) {
        for (const _ of this.drawGen(ctx, scale)) { /* до конца */ }
    },

    *drawGen(ctx, scale) {
        const P = this.pal();
        const job = this.layoutGen();
        let r = job.next();
        while (!r.done) { yield; r = job.next(); }
        const eyes = this._eyes || (this._eyes = r.value);
        // Тьма под глазами: всё вне сцены и ещё OVERLAP единиц на сцену. Было
        // на 4 единицы глубже края — в углах между подложкой и проверяемым
        // швом светилась сцена. Ровно край в край — тоже нельзя: по линии
        // стыка, где сходятся дуги глаз, сглаживание оставляло светящиеся
        // точки. Подложка заходит на сцену на полторы единицы, шов проверяется
        // ещё на полединицы глубже (SEAM_IN).
        ctx.save();
        ctx.fillStyle = P.base;
        ctx.beginPath();
        ctx.rect(-2, -2, STAGE_W + 4, STAGE_H + 4);
        const I = this.inner(), e = -this.OVERLAP;
        if (ctx.roundRect) ctx.roundRect(I.x0 - e, I.y0 - e, I.x1 - I.x0 + 2 * e, I.y1 - I.y0 + 2 * e, this.CORNER + e);
        else ctx.rect(I.x0 - e, I.y0 - e, I.x1 - I.x0 + 2 * e, I.y1 - I.y0 + 2 * e);
        ctx.fill('evenodd');
        ctx.restore();
        yield;
        // Сначала все чёрные формы, потом все радужки: чёрное на чёрном
        // сливается, а радужку чужой глаз закрыть не может.
        // Зрачки глаз рамки здесь НЕ рисуются: они моргают и живут на своих
        // маленьких холстах поверх рамки (envy-eyes-blink.js, mountLive).
        // Неподвижен только крестик.
        const cross = this.crossEyes();
        for (const eye of eyes) this.body(ctx, eye);
        for (const eye of cross) this.body(ctx, eye);
        yield;
        for (const eye of cross) this.iris(ctx, eye);
    }
};
