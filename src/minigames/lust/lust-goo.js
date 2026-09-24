// ================= СЛЕДЫ СТРУИ: КУДА ПРИЛИПЛО И КАК СТЕКАЕТ =================
// Отдельная система, а не кусок финала. Финал знает про прицел, толчки и
// счёт; эта — только про то, во что капля упёрлась и что с этим стало.
//
// Замысел (docs/plan/21-lust-bath.md, разд. 3в): промах не исчезает. Капля
// прилипает к ПЕРВОМУ, во что упёрлась, — к морде и любой части тела, к
// хвосту, к борту ванны, к стене за ними — растекается и медленно стекает
// вниз, вытягиваясь. К концу забега по сцене видна вся история промахов.
//
// ---------- ЧЕТЫРЕ ПОВЕРХНОСТИ — ЧЕТЫРЕ ГЛУБИНЫ ----------
// Потёк обязан лежать В ТОМ ЖЕ ПЛАНЕ, что поверхность под ним: на теле он
// уходит в расфокус вместе с червём, на хвосте гнётся вместе с хвостом, на
// стене прячется за червём. Пока все потёки жили в одном слое поверх сцены,
// пятно на стене висело перед мордой, а пятно на хвосте оставалось в
// воздухе, когда хвост опадал.
//   стена и пол — свой холст сразу за комнатой (#bt-goo-wall), размыт как стена;
//   тело        — холст в единицах персонажа, ездит с ним одним
//                 преобразованием и обрезается его силуэтом (#bt-goo);
//                 капля над телом сама выбирает, где сесть, — у кромки,
//                 посередине, у дальнего края — или пролетает насквозь;
//   хвост       — внутри группы хвоста, привязан к оси ДОЛЕЙ ДЛИНЫ и
//                 поперечным смещением, а не координатой;
//   борт        — поверх чаши (#bt-splats), стекает по её передней стенке.
//
// ---------- ЦЕНА ----------
// Застывший потёк дописывается ОДИН РАЗ и больше не трогается: на стене и
// борте — узлом в слой добавления, на теле — в запечённый холст. Каждый кадр
// переписывается только живое, и в каждом слое это ОДИН путь на все живые
// потёки сразу: одна запись атрибута на слой, сколько бы их ни ползло.
//
// Потёки живут, пока игрок в ванной (вариант «а»): уход из мини-игры и
// новый душ смывают всё. Хранить их в сейве незачем — это след забега, а не
// прогресс.

const LustGoo = {
    // Капля, прошедшая верх дуги, прилипает к стене, опустившись на
    // случайную высоту. Плоскость полёта — между хвостом и червём, стена
    // позади; без этого правила промахи падали бы только в ванну, и стена
    // оставалась бы чистой при любой игре.
    WALL_CHANCE: 0.5,
    WALL_DROP: [30, 230],     // на сколько единиц после верха дуги
    RIM_CHANCE: 0.4,          // доля упавших на борт; остальное — внутрь
    // Капля над телом: с этой долей пролетает его насквозь, иначе садится в
    // случайную точку своего пути над ним (см. wormPlan).
    PASS_CHANCE: 0.3,
    // Потолки застывшего по слоям. Стена и тело — растр, им потолок не нужен.
    CAP: { rim: 30, tail: 40 },

    game: null,
    live: null,       // ещё растекаются или стекают
    tailDone: null,   // застывшие на хвосте: их пересчитывают при изгибе
    raf: 0,

    init(game) {
        this.game = game;
        const B = game.WORM_BASE;
        // Тело — в единицах холста персонажа, обрезано его силуэтом, с тенью.
        this.worm = this.canvas('bt-goo', B.w, B.h, game.MASK_SCALE,
                                { shade: true, mask: () => game.mask });
        // Стена — в единицах сцены, размыта как стена. Разрешение вдвое ниже
        // сцены: размытое деталей не держит, а холст во всю стену в полном
        // разрешении стоил бы памяти ни за что.
        // Обновляется РЕЖЕ тела — 12 раз в секунду: пятно на стене далеко и
        // в расфокусе, шаг его нитки за такой кадр не виден, а размытие
        // тенью холста — самое дорогое рисование в следах.
        this.wall = this.canvas('bt-goo-wall', BATH_ART.W, BATH_ART.H, 0.5,
                                { blur: BATH_ART.FAR_BLUR, hz: 12 });
        this.reset();
    },

    // ---------- ХОЛСТ ПОТЁКОВ ----------
    // Одно устройство на тело и на стену. Застывшее ЗАПЕКАЕТСЯ во
    // внеэкранные холсты один раз; видимый перерисовывается только в
    // прямоугольнике вокруг ползущих пятен и не чаще двадцати раз в секунду
    // (см. draw).
    //
    // Слипание — как у слизи в комнате: тела пятен НЕПРОЗРАЧНЫ, и где два
    // пятна перекрылись, получается одна лужа, а не стопка. Тени пятен тоже
    // рисуются непрозрачными — в отдельный холст, — и прозрачность им
    // даётся ОДИН РАЗ, всем вместе. Так тень у слипшейся массы одна.
    //
    // Сведение «тени вместе, потом тела» делается при ЗАСТЫВАНИИ, в готовый
    // холст (C.done), а не каждый кадр: кадр только кладёт готовое и поверх
    // — ползущие. У ползущего тень кладётся сразу полупрозрачной; пока он
    // ползёт, она может лечь на соседнюю, но это секунды, а сводить тени
    // каждый кадр стоило двух кадров из шестидесяти.
    canvas(id, w, h, S, opt) {
        const el = document.getElementById(id);
        if (!el) return null;
        const mk = () => { const c = document.createElement('canvas');
                           c.width = Math.ceil(w * S); c.height = Math.ceil(h * S); return c; };
        el.width = Math.ceil(w * S); el.height = Math.ceil(h * S);
        el.style.width = w + 'px'; el.style.height = h + 'px';
        const C = { el, ctx: el.getContext('2d'), S, opt,
                    body: mk(), rect: null, force: false, ts: 0 };
        C.core = mk(); C.done = mk();
        if (opt.shade) C.sh = mk();
        return C;
    },

    clearCanvas(C) {
        if (!C) return;
        for (const c of [C.el, C.body, C.core, C.sh, C.done])
            if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
        C.rect = null; C.force = false;
    },

    reset() {
        cancelAnimationFrame(this.raf); this.raf = 0;
        this.live = [];
        this.tailDone = [];
        this.rimDone = [];
        this.setLayer('rim', null);
        this.setLayer('tail', null);
        this.setLayer('rim', null, '-done');
        this.setLayer('tail', null, '-done');
        this.clearCanvas(this.worm);
        this.clearCanvas(this.wall);
    },

    setD(id, d) {
        const n = document.getElementById(id);
        if (n && n.getAttribute('d') !== d) n.setAttribute('d', d);
    },

    // Слой резкого плана: по пути на тон — тень (тот же путь, что край,
    // сдвинута группой), край, ядро, блик. suf '-done' — застывшие.
    setLayer(which, d, suf) {
        const id = (which === 'rim' ? 'bt-goo-rim' : 'bt-tail-goo') + (suf || '');
        d = d || { body: '', core: '', hi: '' };
        this.setD(id + '-sh', d.body);
        this.setD(id, d.body);
        this.setD(id + '-core', d.core);
        this.setD(id + '-hi', d.hi);
    },

    // Склеить формы нескольких пятен по тонам: ОДИН путь на тон.
    join(list) {
        const out = { body: '', core: '', hi: '' };
        for (const d of list) { out.body += d.body; out.core += d.core; out.hi += d.hi; }
        return out;
    },

    // Судьба капли в полёте: сколько опуститься до стены. Решается при
    // вылете, а не по кадрам — иначе шанс зависел бы от частоты кадров.
    arm(d) {
        d.apexY = null;
        d.wallAt = Math.random() < this.WALL_CHANCE
            ? this.WALL_DROP[0] + Math.random() * (this.WALL_DROP[1] - this.WALL_DROP[0])
            : null;
        d.prevY = d.y;
        d.wormPlan = null;
    },

    // ---------- СТОЛКНОВЕНИЯ ----------
    // Капля уже сделала шаг. Вернуть true — капля кончилась (прилипла или
    // упала в ванну). Порядок проверок — порядок глубины от зрителя: хвост
    // впереди тела, тело впереди стены.
    hit(d) {
        const g = this.game, C = g.cfg(), A = BATH_ART.slots();
        const prevY = d.prevY == null ? d.y : d.prevY;
        d.prevY = d.y;
        if (d.vy > 0 && d.apexY == null) d.apexY = d.y;

        // Хвост: не сразу после вылета — капля стартует С КОНЧИКА.
        if (d.t > 0.12 && d.vy > 0) {
            const at = this.onTail(d);
            if (at) { this.stick('tail', d, at); return true; }
        }
        // Тело.
        if (this.wormPlan(d)) { this.stick('worm', d); return true; }

        // Борт — прямая по верху передней стенки чаши. Перелетевшая через
        // него капля уходит ВНУТРЬ, за переднюю стенку: рисовать её дальше
        // значило бы положить её поверх чаши.
        const rimY = A.rimFront.y;
        if (prevY < rimY && d.y >= rimY && d.x > A.rimL.x && d.x < A.rimR.x) {
            if (Math.random() < this.RIM_CHANCE) {
                this.stick('rim', d, { x: d.x, y: rimY + 2 });
            }
            return true;
        }
        // Стена — на случайной глубине после верха дуги.
        if (d.wallAt != null && d.apexY != null && d.y - d.apexY >= d.wallAt) {
            this.stick('wall', d);
            return true;
        }
        // Пол вне ванны.
        if (d.y >= C.floorY) {
            this.stick('wall', d, { x: d.x, y: C.floorY });
            return true;
        }
        return LustShot.spent(d, C);
    },

    // ---------- КУДА САДИТСЯ КАПЛЯ НАД ТЕЛОМ ----------
    // Камера смотрит на червя спереди, а капля летит в плоскости между ним
    // и зрителем, — значит, над телом она может шлёпнуться В ЛЮБОЙ точке
    // своего пути: у ближней кромки, посередине, у дальнего края. Или
    // пролететь над ним целиком и сесть уже на стену или борт.
    //
    // Первая версия ловила каплю в первом же пикселе силуэта, и все пятна
    // ложились рядом ВДОЛЬ КОНТУРА — бусами по краю тела, ни одного на
    // середине.
    //
    // Решение принимается ОДИН РАЗ, на входе в силуэт: путь над телом
    // просчитывается вперёд той же физикой (шаг фиксированный, случайности
    // в полёте нет), и точка посадки выбирается равномерно по нему. Решать
    // «сесть или нет» на каждом шаге нельзя: тогда шанс сесть рос бы с
    // длиной пути, и почти все садились бы у кромки.
    wormPlan(d) {
        if (!this.onWorm(d)) {
            // Вылетела из силуэта — пролёт кончился. Над телом можно
            // оказаться и второй раз (дуга вернулась), и решение тогда новое.
            if (d.wormPlan && d.wormPlan.pass) d.wormPlan = null;
            return false;
        }
        if (!d.wormPlan) {
            const C = this.game.cfg();
            const q = { x: d.x, y: d.y, vx: d.vx, vy: d.vy, t: d.t };
            let n = 0;
            while (n < 200 && !LustShot.spent(q, C)) {
                LustShot.step(q, C);
                if (!this.onWorm(q)) break;
                n++;
            }
            d.wormPlan = Math.random() < this.PASS_CHANCE
                ? { pass: true }
                : { at: d.t + Math.floor(Math.random() * (n + 1)) * C.dt };
        }
        if (d.wormPlan.pass) return false;
        return d.t >= d.wormPlan.at - 1e-6;
    },

    // Точка капли на хвосте: доля длины t и поперечное u в полутолщинах.
    onTail(d) {
        const g = this.game;
        if (!document.getElementById('bt-tail-pivot')) return null;
        const A = BATH_ART.slots(), T = BATH_ART.TAIL, grow = g.tailGrow();
        const sp = BATH_ART.tailSpine(g.bend, grow), n = sp.length - 1;
        const qx = d.x - A.tail.x, qy = d.y - A.tail.y;
        let best = -1, bd = Infinity;
        for (let i = 1; i <= n; i++) {
            const dd = (sp[i].x - qx) ** 2 + (sp[i].y - qy) ** 2;
            if (dd < bd) { bd = dd; best = i; }
        }
        const half = BATH_ART.tailHalf(best / n, grow);
        if (Math.sqrt(bd) > half + d.r * 0.5) return null;
        const p = sp[best], nx = (T.side || 1) * Math.cos(p.a), ny = Math.sin(p.a);
        const u = ((qx - p.x) * nx + (qy - p.y) * ny) / Math.max(1, half);
        return { t: best / n, u: Math.max(-0.85, Math.min(0.85, u)) };
    },

    onWorm(d) {
        const g = this.game, a = g.maskAlpha, m = g.mask;
        if (!a || !m) return false;
        const q = this.toWorm(d.x, d.y);
        const S = g.MASK_SCALE;
        const x = Math.round(q.x * S), y = Math.round(q.y * S);
        if (x < 0 || y < 0 || x >= m.width || y >= m.height) return false;
        return a[y * m.width + x] > 0;
    },

    // Сцена → единицы холста персонажа (как в layoutWorm).
    toWorm(x, y) {
        const g = this.game, box = g.wormBoxScene(), B = g.WORM_BASE;
        const k = B.w / box.w;
        return { x: (x - box.x) * k, y: (y - box.y) * k, k };
    },

    // ---------- ПРИЛИПАНИЕ ----------
    // Пятно сначала РАСТЕКАЕТСЯ (удар), потом — не всегда — стекает: мелкие
    // капли чаще так и застывают, крупные тянут за собой нитку.
    stick(surf, d, at) {
        const r0 = d.r * (d.main ? 0.85 : 1.1);
        const s = { surf, r0, r: r0 * 0.5, len: 0, t: 0, v: 0, maxLen: 0,
                    seed: Math.random(), ang: Math.atan2(d.vy, d.vx) };
        const drips = Math.random() < (d.main ? 0.85 : 0.45);
        if (drips) {
            s.v = (10 + Math.random() * 22) * Math.min(1.4, Math.max(0.6, r0 / 7));
            s.maxLen = r0 * (1.6 + Math.random() * 3.2);
        }
        if (surf === 'worm') {
            const q = this.toWorm(d.x, d.y);
            s.x = q.x; s.y = q.y; s.k = q.k;
        } else if (surf === 'tail') {
            s.at = at;
        } else {
            s.x = at ? at.x : d.x; s.y = at ? at.y : d.y; s.k = 1;
        }
        this.live.push(s);
        if (!this.raf) {
            this.last = performance.now();
            this.raf = requestAnimationFrame((t) => this.tick(t));
        }
    },

    // Свой кадровый цикл: потёки ползут и ПОСЛЕ конца забега, когда цикл
    // финала уже остановлен. Гаснет сам, как только ползти нечему.
    tick(now) {
        const dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;
        this.step(dt);
        this.raf = this.live.length ? requestAnimationFrame((t) => this.tick(t)) : 0;
    },

    step(dt) {
        let tail = false;
        for (let i = this.live.length - 1; i >= 0; i--) {
            const s = this.live[i];
            s.t += dt;
            // Удар: пятно раздаётся до полного размера за десятую секунды.
            s.r = s.r0 * (0.5 + 0.5 * Math.min(1, s.t / 0.1));
            if (s.t > 0.15 && s.v > 0) {
                // Стекает с ТОРМОЖЕНИЕМ: густое тянется, редеет и встаёт.
                //
                // И РЫВКАМИ. Вязкая капля не едет ровно: она держится на
                // поверхности, пока вес капли на конце не пересилит
                // сцепление, срывается, проскальзывает и снова цепляется.
                // Ровное сползание читалось анимацией, рывки — жидкостью.
                // Скорость ходит волной от почти нуля до полной; средняя
                // выходит вдвое ниже, поэтому и множитель вдвое больше.
                const w = 0.5 + 0.5 * Math.sin(s.t * 5.5 + s.seed * 40);
                s.len += s.v * dt * 2 * (0.08 + 0.92 * w * w * w);
                s.v *= Math.exp(-1.3 * dt);
            }
            if (s.surf === 'tail') tail = true;
            const still = s.t > 0.15 && (s.v < 2.5 || s.len >= s.maxLen);
            if (still) {
                this.live.splice(i, 1);
                this.freeze(s);
            }
        }
        this.render(tail);
    },

    // Форма пятна в заданной точке и масштабе (k — во сколько раз крупнее
    // единиц сцены: на теле пятно рисуется в единицах холста персонажа).
    //
    // Форма ЖИВОГО пятна пересчитывается, только когда оно заметно
    // изменилось: размер — с шагом в четверть единицы, нитка — в половину.
    // Пятно стоит на месте, а нитка ползёт единицами в секунду, так что
    // между пересчётами проходят кадры. Пока форма считалась каждый кадр
    // (сплайн, по полсотни чисел на пятно, стена ещё и втрое), живые потёки
    // стоили трёх кадров из шестидесяти.
    shapeOf(s, x, y, k, blur) {
        const r = Math.round(s.r * 4) / 4, len = Math.round(s.len * 2) / 2;
        const slot = (blur || 0) + '|' + k + '|' + x + '|' + y;
        const key = r + '|' + len;
        const c = s._cache || (s._cache = {});
        const hit = c[slot];
        if (hit && hit.key === key) return hit.d;
        const d = BATH_ART.goo(x, y, r * k, len * k, s.seed, s.ang, blur || 0);
        c[slot] = { key, d };
        return d;
    },

    // Точка потёка на хвосте в координатах группы хвоста — при ТЕКУЩЕМ
    // изгибе и росте. Отсюда и держится: хвост опал — пятно поехало с ним.
    tailPoint(at) {
        const g = this.game, T = BATH_ART.TAIL, grow = g.tailGrow();
        const sp = BATH_ART.tailSpine(g.bend, grow), n = sp.length - 1;
        const p = sp[Math.max(0, Math.min(n, Math.round(at.t * n)))];
        const half = BATH_ART.tailHalf(at.t, grow);
        return { x: p.x + (T.side || 1) * Math.cos(p.a) * at.u * half,
                 y: p.y + Math.sin(p.a) * at.u * half };
    },

    // Нитка на хвосте короче: по пруту она ползёт вдоль него и далеко от
    // пятна не уходит. Форма считается в нуле и ПЕРЕНОСИТСЯ в точку на
    // хвосте (BATH_ART.gooMove); у застывшего она больше не меняется и
    // считается один раз.
    tailShape(s) {
        const p = this.tailPoint(s.at);
        const d = s.shape || this.shapeOf({ r: s.r, len: Math.min(s.len, s.r * 2.2),
            seed: s.seed, ang: s.ang, _cache: s._cache || (s._cache = {}) }, 0, 0, 1);
        return { body: BATH_ART.gooMove(d.body, p.x, p.y), core: BATH_ART.gooMove(d.core, p.x, p.y),
                 hi: BATH_ART.gooMove(d.hi, p.x, p.y) };
    },

    // Хвост перерисован (изгиб, налив, опадание) — пятна едут следом.
    // Застывшие и ползущие — РАЗНЫЕ пути: ползущие меняются каждый кадр,
    // застывших до сорока, и склеивать их все ради одной ползущей нитки
    // значило бы каждый кадр переписывать десятки килобайт пути.
    drawTail() {
        if (!this.tailDone) return;
        this.setLayer('tail', this.join(this.tailDone.map(s => this.tailShape(s))), '-done');
        this.drawTailLive();
    },

    drawTailLive() {
        this.setLayer('tail', this.join(this.live.filter(q => q.surf === 'tail')
            .map(s => this.tailShape(s))));
    },

    render(tail) {
        const rim = [];
        for (const s of this.live) {
            if (s.surf === 'rim') rim.push(this.shapeOf(s, s.x, s.y, 1));
            else if (s.surf === 'worm') this.dirty(this.worm, s);
            else if (s.surf === 'wall') this.dirty(this.wall, s);
        }
        this.setLayer('rim', this.join(rim));
        if (tail) this.drawTailLive();
        this.draw(this.worm, 'worm');
        this.draw(this.wall, 'wall');
    },

    // Прямоугольник холста, который надо перерисовать ради этого пятна.
    // Берётся по ПОЛНОМУ размеру с брызгами, текущей длине нитки и
    // размытию: пятно только растёт вниз, значит прошлый кадр в него
    // заведомо входит.
    dirty(C, s) {
        if (!C) return;
        const S = C.S, k = s.k * S, R0 = s.r0 * 2.6 * k,
              pad = 4 * S + 3 * (C.opt.blur || 0) * S;
        const x0 = s.x * S - R0 - pad, x1 = s.x * S + R0 + pad;
        const y0 = s.y * S - R0 - pad, y1 = s.y * S + (s.len + s.r0) * k + R0 + pad;
        const R = C.rect;
        C.rect = R
            ? { x0: Math.min(R.x0, x0), y0: Math.min(R.y0, y0),
                x1: Math.max(R.x1, x1), y1: Math.max(R.y1, y1) }
            : { x0, y0, x1, y1 };
    },

    // Перерисовка ТОЛЬКО прямоугольника вокруг ползущих пятен и не чаще
    // двадцати раз в секунду. Весь холст тела каждый кадр стоил половины
    // кадров финала (под замедлением ×6 было 59 без следов и 33 с ними), а
    // любая правка холста, даже в ноготь, заново отдаёт видеокарте весь
    // холст. Потёк ползёт медленно, и разницы с шестьюдесятью не видно.
    // Застывание дорисовывается сразу (force): иначе последний кадр пятна
    // мог бы не попасть на экран.
    draw(C, surf) {
        if (!C || !C.rect) return;
        const now = performance.now();
        if (!C.force && now - C.ts < 1000 / (C.opt.hz || 20)) return;
        C.ts = now; C.force = false;
        const R = C.rect;
        C.rect = null;
        const c = C.ctx, W = C.el.width, H = C.el.height;
        const x = Math.max(0, Math.floor(R.x0)), y = Math.max(0, Math.floor(R.y0));
        const w = Math.min(W, Math.ceil(R.x1)) - x, h = Math.min(H, Math.ceil(R.y1)) - y;
        if (w <= 0 || h <= 0) return;
        const live = this.live.filter(s => s.surf === surf);
        c.save();
        c.beginPath(); c.rect(x, y, w, h); c.clip();
        c.clearRect(x, y, w, h);
        c.drawImage(C.done, x, y, w, h, x, y, w, h);
        // Ползущие — прямо с прозрачностью тона. Пока ползёт, пятно может
        // лечь на соседнее чуть плотнее, чем надо, но это секунды: при
        // застывании оно сведётся со всеми (compose).
        const T = BATH_ART.GOO_TONE;
        if (C.sh) {
            c.globalAlpha = BATH_ART.GOO_SHADE.alpha;
            for (const s of live) this.paintShade(c, C, s);
        }
        c.globalAlpha = T.thin;
        for (const s of live) this.paintTone(c, C, s, 'body');
        c.globalAlpha = T.core;
        for (const s of live) this.paintTone(c, C, s, 'core');
        c.globalAlpha = 1;
        for (const s of live) this.paintTone(c, C, s, 'hi');
        const mask = C.opt.mask && C.opt.mask();
        if (mask) {
            c.globalCompositeOperation = 'destination-in';
            c.drawImage(mask, x, y, w, h, x, y, w, h);
        }
        c.restore();
    },

    // Готовый слой застывшего: все тени разом с одной прозрачностью, поверх
    // — тела. Пересобирается только в прямоугольнике нового пятна.
    compose(C, R) {
        const W = C.el.width, H = C.el.height;
        const x = Math.max(0, Math.floor(R.x0)), y = Math.max(0, Math.floor(R.y0));
        const w = Math.min(W, Math.ceil(R.x1)) - x, h = Math.min(H, Math.ceil(R.y1)) - y;
        if (w <= 0 || h <= 0) return;
        const c = C.done.getContext('2d'), T = BATH_ART.GOO_TONE;
        c.clearRect(x, y, w, h);
        if (C.sh) {
            c.globalAlpha = BATH_ART.GOO_SHADE.alpha;
            c.drawImage(C.sh, x, y, w, h, x, y, w, h);
        }
        c.globalAlpha = T.thin;
        c.drawImage(C.body, x, y, w, h, x, y, w, h);
        c.globalAlpha = T.core;
        c.drawImage(C.core, x, y, w, h, x, y, w, h);
        c.globalAlpha = 1;
    },

    shapesFor(C, s) {
        const S = C.S, k = s.k * S;
        const d = this.shapeOf(s, s.x * S, s.y * S, k);
        if (!d._p) d._p = { body: new Path2D(d.body), core: new Path2D(d.core),
                            hi: d.hi ? new Path2D(d.hi) : null };
        return d._p;
    },

    paintShade(c, C, s) {
        const p = this.shapesFor(C, s), SH = BATH_ART.GOO_SHADE, k = s.k * C.S;
        c.save();
        c.translate(SH.dx * k, SH.dy * k);
        c.fillStyle = btPal().milk.shade;
        c.fill(p.body);
        c.restore();
    },

    // Тело пятна. На стене — РАЗМЫТОЕ, и размыто тенью холста: фигура
    // уносится за край, на месте остаётся только её тень с размытием. Так
    // размытие честное и плавное, а работает везде: фильтр холста
    // (ctx.filter) на айфоне появился только недавно. Стопка из трёх
    // раздутых ореолов, которая была до этого, читалась набором светлых
    // окантовок, а не расфокусом.
    paintTone(c, C, s, tone) {
        const p = this.shapesFor(C, s), m = btPal().milk;
        const blur = C.opt.blur ? C.opt.blur * C.S : 0;
        const col = tone === 'body' ? m.thin : tone === 'core' ? m.core : m.hi;
        if (!p[tone]) return;
        // Блика на размытой стене нет: расфокус съедает искру раньше всего.
        if (blur && tone === 'hi') return;
        c.save();
        c.fillStyle = col;
        if (blur) {
            const OFF = 20000;
            c.shadowColor = col;
            c.shadowBlur = blur * 2;          // shadowBlur — это две сигмы
            c.shadowOffsetX = OFF;
            c.translate(-OFF, 0);
        }
        c.fill(p[tone]);
        c.restore();
    },

    freeze(s) {
        if (s.surf === 'worm' || s.surf === 'wall') {
            const C = this[s.surf];
            if (!C) return;
            // Тона запекаются НЕПРОЗРАЧНЫМИ, каждый в свой холст, и только
            // при сведении получают прозрачность — одну на все пятна. Так
            // слипшиеся пятна дают одну массу, а не стопку.
            if (C.sh) this.paintShade(C.sh.getContext('2d'), C, s);
            this.paintTone(C.body.getContext('2d'), C, s, 'body');
            const core = C.core.getContext('2d');
            this.paintTone(core, C, s, 'core');
            this.paintTone(core, C, s, 'hi');
            this.dirty(C, s);
            C.force = true;
            this.compose(C, C.rect);
            return;
        }
        if (s.surf === 'tail') {
            s.shape = BATH_ART.goo(0, 0, s.r, Math.min(s.len, s.r * 2.2), s.seed, s.ang, 0);
            this.tailDone.push(s);
            if (this.tailDone.length > this.CAP.tail) this.tailDone.shift();
            this.drawTail();
            return;
        }
        // Борт: застывшие — ОДИН путь на тон, переписывается при каждом
        // застывании. Путь на пятно был бы стопкой: полупрозрачный край
        // соседних пятен темнел бы там, где они легли друг на друга.
        this.rimDone.push(BATH_ART.goo(s.x, s.y, s.r, s.len, s.seed, s.ang, 0));
        if (this.rimDone.length > this.CAP.rim) this.rimDone.shift();
        this.setLayer('rim', this.join(this.rimDone), '-done');
    }
};
