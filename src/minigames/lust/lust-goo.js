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
            <path id="bt-goo-wall-live" d="" ${BATH_ART.gooStyle(true)}/>`;
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
        this.tailDone = [];
        for (const id of ['bt-goo-wall-live', 'bt-goo-rim-live'])
            this.setD(id, '');
        const w = document.getElementById('bt-goo-wall-done');
        if (w) w.innerHTML = '';
        const s = document.getElementById('bt-splats');
        if (s) s.innerHTML = '';
        if (this.ctx) this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
        if (this.bakedCtx) this.bakedCtx.clearRect(0, 0, this.baked.width, this.baked.height);
        this.setD('bt-tail-goo', '');
    },

    setD(id, d) {
        const n = document.getElementById(id);
        if (n && n.getAttribute('d') !== d) n.setAttribute('d', d);
    },

    // Судьба капли в полёте: сколько опуститься до стены. Решается при
    // вылете, а не по кадрам — иначе шанс зависел бы от частоты кадров.
    arm(d) {
        d.apexY = null;
        d.wallAt = Math.random() < this.WALL_CHANCE
            ? this.WALL_DROP[0] + Math.random() * (this.WALL_DROP[1] - this.WALL_DROP[0])
            : null;
        d.prevY = d.y;
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
        // Тело: по силуэту персонажа, той же маской, что и мыло.
        if (this.onWorm(d)) { this.stick('worm', d); return true; }

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
    // капли чаще так и застывают круглыми, крупные тянут за собой нитку.
    stick(surf, d, at) {
        const r0 = d.r * (d.main ? 0.85 : 1.1);
        const s = { surf, r0, r: r0 * 0.5, len: 0, t: 0,
                    v: 0, maxLen: 0, seed: Math.random() };
        const drips = Math.random() < (d.main ? 0.85 : 0.45);
        if (drips) {
            s.v = (10 + Math.random() * 22) * Math.min(1.4, Math.max(0.6, r0 / 7));
            s.maxLen = r0 * (1.6 + Math.random() * 3.2);
        }
        if (surf === 'worm') {
            // Капля ловится В ПЕРВОМ пикселе силуэта, то есть на самой
            // кромке, — и пятно обрезалось маской ровно пополам: по краю тела
            // шёл ряд полукружий. Удар сдвигается внутрь по ходу полёта на
            // размер пятна: капля летела дальше и шлёпнулась уже на тело.
            const v = Math.hypot(d.vx, d.vy) || 1;
            const k = r0 * 0.9;
            const probe = { x: d.x + d.vx / v * k, y: d.y + d.vy / v * k };
            const at = this.onWorm(probe) ? probe : d;
            const q = this.toWorm(at.x, at.y);
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

    // ---------- ФОРМА ПОТЁКА ----------
    // Пятно, от него вниз нитка, на конце капля. Одним путём из нескольких
    // кусков: у пути paint-order stroke, поэтому обводка рисуется ПОД
    // заливкой и внутренние швы между кусками закрываются — снаружи остаётся
    // один общий контур.
    shape(x, y, r, len, seed) {
        const f = (v) => v.toFixed(1);
        const ry = r * (0.78 + 0.2 * seed);
        let d = `M${f(x - r)} ${f(y)}a${f(r)} ${f(ry)} 0 1 0 ${f(2 * r)} 0`
              + `a${f(r)} ${f(ry)} 0 1 0 ${f(-2 * r)} 0Z`;
        if (len > r * 0.3) {
            const w0 = r * 0.5, w1 = r * 0.22, yb = y + len;
            const bead = r * (0.3 + 0.2 * Math.min(1, len / (3 * r)));
            d += `M${f(x - w0)} ${f(y)}L${f(x - w1)} ${f(yb)}L${f(x + w1)} ${f(yb)}`
               + `L${f(x + w0)} ${f(y)}Z`
               + `M${f(x - bead)} ${f(yb)}a${f(bead)} ${f(bead)} 0 1 0 ${f(2 * bead)} 0`
               + `a${f(bead)} ${f(bead)} 0 1 0 ${f(-2 * bead)} 0Z`;
        }
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

    tailShape(s) {
        const p = this.tailPoint(s.at);
        // Нитка на хвосте короче: по вертикальному пруту она ползёт вдоль
        // него и далеко от пятна не уходит.
        return this.shape(p.x, p.y, s.r, Math.min(s.len, s.r * 2.2), s.seed);
    },

    // Хвост перерисован (изгиб, налив, опадание) — пятна едут следом.
    drawTail() {
        if (!this.tailDone || (!this.tailDone.length && !this.live.some(s => s.surf === 'tail'))) return;
        let d = '';
        for (const s of this.tailDone) d += this.tailShape(s);
        for (const s of this.live) if (s.surf === 'tail') d += this.tailShape(s);
        this.setD('bt-tail-goo', d);
    },

    render(tail) {
        let wall = '', rim = '';
        for (const s of this.live) {
            if (s.surf === 'wall') wall += this.shape(s.x, s.y, s.r, s.len, s.seed);
            else if (s.surf === 'rim') rim += this.shape(s.x, s.y, s.r, s.len, s.seed);
            else if (s.surf === 'worm') this.dirty(s);
        }
        this.setD('bt-goo-wall-live', wall);
        this.setD('bt-goo-rim-live', rim);
        if (tail) this.drawTail();
        if (this.wormRect) this.drawWorm();
    },

    // Прямоугольник холста тела, который надо перерисовать ради этого
    // пятна. Берётся по ПОЛНОМУ радиусу и текущей длине нитки: пятно только
    // растёт вниз, значит прошлый кадр в него заведомо входит.
    dirty(s) {
        const S = this.game.MASK_SCALE, k = s.k * S, pad = 4 * S;
        const x0 = s.x * S - s.r0 * k - pad, x1 = s.x * S + s.r0 * k + pad;
        const y0 = s.y * S - s.r0 * k - pad, y1 = s.y * S + (s.len + s.r0) * k + pad;
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

    paint(c, s, S) {
        const m = btPal().milk;
        const p = new Path2D(this.shape(s.x * S, s.y * S, s.r * s.k * S,
                                        s.len * s.k * S, s.seed));
        c.lineJoin = 'round';
        c.lineWidth = 2.6 * S;
        c.strokeStyle = m.edge;
        c.stroke(p);
        c.fillStyle = m[500];
        c.fill(p);
        c.fillStyle = m.hi;
        c.beginPath();
        c.arc((s.x - s.r * 0.3) * S, (s.y - s.r * 0.3) * S,
              Math.max(0.6, s.r * s.k * 0.28) * S, 0, Math.PI * 2);
        c.fill();
    },

    freeze(s) {
        if (s.surf === 'worm') {
            this.paint(this.bakedCtx, s, this.game.MASK_SCALE);
            this.dirty(s);
            return;
        }
        if (s.surf === 'tail') {
            this.tailDone.push(s);
            if (this.tailDone.length > this.CAP.tail) this.tailDone.shift();
            this.drawTail();
            return;
        }
        const far = s.surf === 'wall';
        const g = document.getElementById(far ? 'bt-goo-wall-done' : 'bt-splats');
        if (!g) return;
        g.insertAdjacentHTML('beforeend',
            BATH_ART.gooNode(this.shape(s.x, s.y, s.r, s.len, s.seed), far,
                             s.x - s.r * 0.3, s.y - s.r * 0.3, s.r * 0.28));
        while (g.childNodes.length > this.CAP[far ? 'wall' : 'rim']) g.removeChild(g.firstChild);
    }
};
