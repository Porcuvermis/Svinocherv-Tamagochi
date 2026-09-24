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
//   стена и пол — свой холст сразу за комнатой (#bt-cam-goo);
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
    // Потолки застывшего по слоям. Тело — растр, ему потолок не нужен.
    CAP: { wall: 70, rim: 30, tail: 40 },

    game: null,
    live: null,       // ещё растекаются или стекают
    tailDone: null,   // застывшие на хвосте: их пересчитывают при изгибе
    raf: 0,

    init(game) {
        this.game = game;
        const wall = document.getElementById('bt-cam-goo');
        if (wall) wall.innerHTML = `<g id="bt-goo-wall-done"></g>
            ${BATH_ART.gooFarLive('bt-goo-wall-live')}`;
        const B = game.WORM_BASE, S = game.MASK_SCALE;
        const c = document.getElementById('bt-goo');
        if (c) {
            c.width = B.w * S; c.height = B.h * S;
            c.style.width = B.w + 'px'; c.style.height = B.h + 'px';
            this.ctx = c.getContext('2d');
            // Застывшее на теле копится во втором, невидимом холсте: живой
            // потёк перерисовывает видимый каждый кадр, и пересобирать ради
            // него все застывшие пятна незачем.
            this.baked = document.createElement('canvas');
            this.baked.width = c.width; this.baked.height = c.height;
            this.bakedCtx = this.baked.getContext('2d');
        }
        this.reset();
    },

    reset() {
        cancelAnimationFrame(this.raf); this.raf = 0;
        this.live = [];
        this.wormRect = null;
        this.wormForce = false;
        this.tailDone = [];
        this.setLayer('rim', '', '');
        this.setLayer('tail', '', '');
        this.setWall([]);
        const w = document.getElementById('bt-goo-wall-done');
        if (w) w.innerHTML = '';
        const s = document.getElementById('bt-splats');
        if (s) s.innerHTML = '';
        if (this.ctx) this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
        if (this.bakedCtx) this.bakedCtx.clearRect(0, 0, this.baked.width, this.baked.height);
    },

    setD(id, d) {
        const n = document.getElementById(id);
        if (n && n.getAttribute('d') !== d) n.setAttribute('d', d);
    },

    // Живой слой резкого плана: тень и тело — один и тот же путь (тень
    // сдвинута преобразованием узла), блик отдельно.
    setLayer(which, body, hi) {
        const id = which === 'rim' ? 'bt-goo-rim-live' : 'bt-tail-goo';
        this.setD(id + '-sh', body);
        this.setD(id, body);
        this.setD(id + '-hi', hi);
    },

    // Живой слой стены: стопка расфокуса, по пути на каждое кольцо.
    setWall(list) {
        BATH_ART.GOO_FAR.forEach(([k], i) => {
            let d = '';
            for (const s of list) d += this.shapeOf(s, s.x, s.y, 1, k * BATH_ART.FAR_BLUR).body;
            this.setD('bt-goo-wall-live-' + i, d);
        });
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
                s.len += s.v * dt;
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
        return { body: BATH_ART.gooMove(d.body, p.x, p.y), hi: BATH_ART.gooMove(d.hi, p.x, p.y) };
    },

    // Хвост перерисован (изгиб, налив, опадание) — пятна едут следом.
    drawTail() {
        if (!this.tailDone || (!this.tailDone.length && !this.live.some(s => s.surf === 'tail'))) return;
        let body = '', hi = '';
        for (const s of this.tailDone.concat(this.live.filter(q => q.surf === 'tail'))) {
            const d = this.tailShape(s);
            body += d.body; hi += d.hi;
        }
        this.setLayer('tail', body, hi);
    },

    render(tail) {
        const wall = [];
        let rim = '', rimHi = '';
        for (const s of this.live) {
            if (s.surf === 'wall') wall.push(s);
            else if (s.surf === 'rim') {
                const d = this.shapeOf(s, s.x, s.y, 1);
                rim += d.body; rimHi += d.hi;
            } else if (s.surf === 'worm') this.dirty(s);
        }
        this.setWall(wall);
        this.setLayer('rim', rim, rimHi);
        if (tail) this.drawTail();
        // Холст тела — не чаще двадцати раз в секунду. Любая его правка, даже
        // в прямоугольник с ноготь, заново отдаёт видеокарте ВЕСЬ холст, и
        // под замедлением это стоило пяти кадров из шестидесяти. Потёк
        // ползёт медленно — единица сцены за такой шаг, — и разницы с
        // шестьюдесятью не видно. Застывание дорисовывается сразу (force),
        // иначе последний кадр пятна мог бы не попасть на экран.
        const now = performance.now();
        if (this.wormRect && (this.wormForce || now - (this.wormTs || 0) >= 50)) {
            this.wormTs = now;
            this.wormForce = false;
            this.drawWorm();
        }
    },

    // Прямоугольник холста тела, который надо перерисовать ради этого
    // пятна. Берётся по ПОЛНОМУ размеру с брызгами и текущей длине нитки:
    // пятно только растёт вниз, значит прошлый кадр в него заведомо входит.
    dirty(s) {
        const S = this.game.MASK_SCALE, k = s.k * S, R0 = s.r0 * 2.6 * k, pad = 4 * S;
        const x0 = s.x * S - R0 - pad, x1 = s.x * S + R0 + pad;
        const y0 = s.y * S - R0 - pad, y1 = s.y * S + (s.len + s.r0) * k + R0 + pad;
        const R = this.wormRect;
        this.wormRect = R
            ? { x0: Math.min(R.x0, x0), y0: Math.min(R.y0, y0),
                x1: Math.max(R.x1, x1), y1: Math.max(R.y1, y1) }
            : { x0, y0, x1, y1 };
    },

    // Тело: запечённое + живое, всё вместе обрезается силуэтом. Обрезка по
    // маске, а не по габариту: пятно у края морды не вылезает на воздух.
    //
    // Перерисовывается ТОЛЬКО прямоугольник вокруг ползущих пятен. Весь
    // холст (720×960) каждый кадр — очистка, запечённое, маска — стоил
    // половины кадров финала: под замедлением ×6 было 59 кадров без следов и
    // 33 с ними. Живых пятен на теле одно-два, и их прямоугольник — сотая
    // доля холста.
    drawWorm() {
        const c = this.ctx, R = this.wormRect;
        this.wormRect = null;
        if (!c || !R) return;
        const W = c.canvas.width, H = c.canvas.height;
        const x = Math.max(0, Math.floor(R.x0)), y = Math.max(0, Math.floor(R.y0));
        const w = Math.min(W, Math.ceil(R.x1)) - x, h = Math.min(H, Math.ceil(R.y1)) - y;
        if (w <= 0 || h <= 0) return;
        const S = this.game.MASK_SCALE;
        c.save();
        c.beginPath();
        c.rect(x, y, w, h);
        c.clip();
        c.clearRect(x, y, w, h);
        c.drawImage(this.baked, x, y, w, h, x, y, w, h);
        for (const s of this.live) if (s.surf === 'worm') this.paint(c, s, S);
        if (this.game.mask) {
            c.globalCompositeOperation = 'destination-in';
            c.drawImage(this.game.mask, x, y, w, h, x, y, w, h);
        }
        c.restore();
    },

    // То же, что узел в svg, но кистью холста: тень, тело, блик.
    paint(c, s, S) {
        const m = btPal().milk, k = s.k * S;
        const d = this.shapeOf(s, s.x * S, s.y * S, k);
        const body = new Path2D(d.body);
        c.save();
        c.globalAlpha = 0.26;
        c.fillStyle = m.shade;
        c.translate(1.2 * k, 1.8 * k);
        c.fill(body);
        c.restore();
        c.save();
        c.globalAlpha = 0.88;
        c.fillStyle = m[500];
        c.fill(body);
        c.globalAlpha = 0.9;
        c.fillStyle = m.hi;
        c.fill(new Path2D(d.hi));
        c.restore();
    },

    freeze(s) {
        if (s.surf === 'worm') {
            this.paint(this.bakedCtx, s, this.game.MASK_SCALE);
            this.dirty(s);
            this.wormForce = true;
            return;
        }
        if (s.surf === 'tail') {
            s.shape = BATH_ART.goo(0, 0, s.r, Math.min(s.len, s.r * 2.2), s.seed, s.ang, 0);
            this.tailDone.push(s);
            if (this.tailDone.length > this.CAP.tail) this.tailDone.shift();
            this.drawTail();
            return;
        }
        const far = s.surf === 'wall';
        const g = document.getElementById(far ? 'bt-goo-wall-done' : 'bt-splats');
        if (!g) return;
        g.insertAdjacentHTML('beforeend',
            BATH_ART.gooNode(s.x, s.y, s.r, s.len, s.seed, s.ang, far));
        while (g.childNodes.length > this.CAP[far ? 'wall' : 'rim']) g.removeChild(g.firstChild);
    }
};
