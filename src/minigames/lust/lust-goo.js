// ================= СЛЕДЫ СТРУИ: КУДА ПРИЛИПЛО И КАК СТЕКАЕТ =================
// Отдельная система, а не кусок финала. Финал знает про прицел, толчки и
// счёт; эта — только про то, во что капля упёрлась и что с этим стало.
//
// Замысел (docs/plan/21-lust-bath.md, разд. 3в): промах не исчезает. Капля
// прилипает к ПЕРВОМУ, во что упёрлась, — к морде и любой части тела, к
// хвосту, к борту ванны, к стене за ними — растекается и медленно стекает
// вниз, вытягиваясь. К концу забега по сцене видна вся история промахов.
//
// ---------- СЛЕД ЖИВЁТ НА СВОЁМ ПРЕДМЕТЕ ----------
// Потёк обязан лежать В ТОМ ЖЕ ПЛАНЕ, что поверхность под ним, и ехать
// вместе с ней:
//   стена и пол — свой холст сразу за комнатой (#bt-goo-wall), размыт как стена;
//   тело        — ВНУТРИ svg самого червя, в группе той части, куда
//                 попало: звена, головы. Червь дышит, раздувается, двигает
//                 мордой — след едет, растёт и опадает вместе с частью, и
//                 ни одной строчки в анимации на это не нужно: группы части
//                 и так двигает рендерер (тот же приём, что у шрамов,
//                 worm-build.js). Первая версия рисовала тело на отдельном
//                 холсте поверх червя — и на тяжёлом дыхании в конце пятна
//                 висели в воздухе неподвижной коркой, пока тело под ними
//                 раздувалось;
//                 капля над телом сама выбирает, где сесть, — у кромки,
//                 посередине, у дальнего края — или пролетает насквозь;
//   хвост       — внутри группы хвоста, в ЕГО координатах: вдоль оси и
//                 поперёк неё. Хвост гнётся, наливается и опадает — пятно
//                 поворачивается, растягивается и сужается вместе с ним;
//   борт        — поверх чаши (#bt-splats), стекает по её передней стенке.
//
// ---------- ПОВЕРХНОСТНОЕ НАТЯЖЕНИЕ ----------
// Пятно не вылезает за свой предмет. И не обрезается по нему — обрезка
// оставляет прямой срез, как ножом. Каждая точка контура мягко
// поджимается к поверхности (fitter): вдали от края не трогается, у края
// прижимается с отступом, и сплайн по поджатым точкам даёт скруглённую
// кромку — так жидкость и держится у края, пока её держит натяжение.
// Первая версия обрезала пятна маской силуэта, а на борту и хвосте не
// ограничивала вовсе: клякса висела над бортом в воздухе.
//
// ---------- ЦЕНА ----------
// Застывший потёк переписывается только при застывании; каждый кадр —
// только живое, и в каждом слое это ОДИН путь на тон для всех живых сразу.
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
    // Потолки застывшего по слоям. Стена — растр, ей потолок не нужен.
    // Хвост пересобирается при каждом его движении, поэтому у него потолок
    // ниже всех.
    CAP: { rim: 30, tail: 25, worm: 40 },
    // Отступ пятна от края предмета и мягкость этого края, в единицах
    // сцены. Отступ — чтобы кромка жидкости шла ВНУТРИ предмета, а не по
    // его контуру; мягкость — радиус, на котором точка начинает
    // прижиматься: меньше — край острее и похож на срез.
    EDGE: { margin: 1.2, soft: 1.6 },

    game: null,
    live: null,       // ещё растекаются или стекают
    tailDone: null,   // застывшие на хвосте: их пересчитывают при изгибе
    hosts: null,      // части червя, на которых есть следы
    raf: 0,

    init(game) {
        this.game = game;
        // Стена — в единицах сцены, размыта как стена. Разрешение вдвое ниже
        // сцены: размытое деталей не держит, а холст во всю стену в полном
        // разрешении стоил бы памяти ни за что.
        // Обновляется 12 раз в секунду: пятно на стене далеко и в
        // расфокусе, шаг его нитки за такой кадр не виден, а размытие
        // тенью холста — самое дорогое рисование в следах.
        this.wall = this.canvas('bt-goo-wall', BATH_ART.W, BATH_ART.H, 0.5,
                                { blur: BATH_ART.FAR_BLUR, hz: 12 });
        this.reset();
    },

    // ---------- ХОЛСТ ПОТЁКОВ (СТЕНА) ----------
    // Застывшее ЗАПЕКАЕТСЯ во внеэкранные холсты один раз; видимый
    // перерисовывается только в прямоугольнике вокруг ползущих пятен и не
    // чаще hz раз в секунду (см. draw).
    //
    // Слипание — как у слизи в комнате: тона пятен запекаются
    // НЕПРОЗРАЧНЫМИ, каждый в свой холст, и прозрачность получают один раз,
    // при сведении (compose). Где два пятна перекрылись, выходит одна лужа,
    // а не стопка.
    canvas(id, w, h, S, opt) {
        const el = document.getElementById(id);
        if (!el) return null;
        const mk = () => { const c = document.createElement('canvas');
                           c.width = Math.ceil(w * S); c.height = Math.ceil(h * S); return c; };
        el.width = Math.ceil(w * S); el.height = Math.ceil(h * S);
        el.style.width = w + 'px'; el.style.height = h + 'px';
        return { el, ctx: el.getContext('2d'), S, opt,
                 body: mk(), core: mk(), done: mk(), rect: null, force: false, ts: 0 };
    },

    clearCanvas(C) {
        if (!C) return;
        for (const c of [C.el, C.body, C.core, C.done])
            if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
        C.rect = null; C.force = false;
    },

    reset() {
        cancelAnimationFrame(this.raf); this.raf = 0;
        this.live = [];
        this.tailDone = [];
        this.rimDone = [];
        this.tailTs = 0;
        this.wormTs = 0;
        for (const h of Object.values(this.hosts || {})) if (h.g) h.g.remove();
        this.hosts = {};
        this.setLayer('rim', null);
        this.setLayer('tail', null);
        this.setLayer('rim', null, '-done');
        this.setLayer('tail', null, '-done');
        this.clearCanvas(this.wall);
    },

    setD(id, d) {
        const n = typeof id === 'string' ? document.getElementById(id) : id;
        if (n && n.getAttribute('d') !== d) n.setAttribute('d', d);
    },

    // Слой резкого плана: по пути на тон — тень (тот же путь, что край,
    // сдвинута группой), край, ядро, блик. suf '-done' — застывшие.
    setLayer(which, d, suf) {
        const id = (which === 'rim' ? 'bt-goo-rim' : which === 'tail' ? 'bt-tail-goo' : which)
                 + (suf || '');
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

    // Мягкий минимум: там, где a и b далеко, это просто меньшее из них, а у
    // стыка — плавный переход вместо излома. Из него и берётся
    // скруглённая кромка у края предмета.
    softMin(a, b, k) {
        const lo = Math.min(a, b);
        return lo - k * Math.log(1 + Math.exp(-Math.abs(a - b) / k));
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
        // На самом кончике ширина хвоста — ноль, и пятну там не на чем
        // держаться (а рамке — не на что делить). Садится чуть ниже.
        return { t: Math.min(best / n, 0.9), u: Math.max(-0.85, Math.min(0.85, u)) };
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
                    seed: Math.random(), ang: Math.atan2(d.vy, d.vx), k: 1 };
        const drips = Math.random() < (d.main ? 0.85 : 0.45);
        if (drips) {
            s.v = (10 + Math.random() * 22) * Math.min(1.4, Math.max(0.6, r0 / 7));
            s.maxLen = r0 * (1.6 + Math.random() * 3.2);
        }
        if (surf === 'worm') {
            if (!this.onPart(s, d)) return;
        } else if (surf === 'tail') {
            this.onTailFrame(s, at);
        } else if (surf === 'rim') {
            // Центр чуть ниже кромки: пятно лежит на борту и стекает по
            // стенке, а верх его прижат к кромке, а не торчит над ней.
            s.x = at.x; s.y = this.rimTop() + r0 * 0.55;
            s.fit = this.rimFit();
        } else {
            s.x = at ? at.x : d.x; s.y = at ? at.y : d.y;
        }
        this.live.push(s);
        if (!this.raf) {
            this.last = performance.now();
            this.raf = requestAnimationFrame((t) => this.tick(t));
        }
    },

    // ---------- БОРТ ----------
    rimTop() {
        const t = BATH_ART.box('tub');
        return t ? t.y : BATH_ART.slots().rimFront.y;
    },

    // Над кромкой борта жидкости нет: верх пятна прижимается к ней с
    // отступом, а по краям чаши — к её торцам.
    rimFit() {
        const A = BATH_ART.slots(), E = this.EDGE, top = this.rimTop() + E.margin;
        const x0 = A.rimL.x + E.margin, x1 = A.rimR.x - E.margin;
        return (p) => ({
            x: -this.softMin(-this.softMin(p.x, x1, E.soft), -x0, E.soft),
            y: -this.softMin(-p.y, -top, E.soft)
        });
    },

    // ---------- ТЕЛО: ЧАСТЬ, КУДА ПОПАЛО ----------
    // Кандидаты — видимые части червя в порядке «кто ближе к зрителю»:
    // ухо впереди, голова, ухо позади, звенья от живота вверх. Капля
    // достаётся той, что стоит перед глазами в точке удара.
    //   host  — группа, В КОТОРУЮ кладётся след. У звена это его анатомия:
    //           её рендерер масштабирует на дыхании, и след растёт вместе с
    //           частью. У головы — слой шрамов в её наклоне: он поверх
    //           морды и едет с ней;
    //   shape — фигура части, по которой пятно поджимается к краю.
    parts() {
        const root = this.game.wormHandle && this.game.wormHandle.svgRoot;
        if (!root) return [];
        const out = [];
        const tilt = root.querySelector('[data-part="head-tilt"]');
        const headScar = tilt && tilt.querySelector(':scope > g.worm-scar-layer');
        const ear = (key) => {
            const e = root.querySelector(`[data-part="${key}"]`);
            const shp = e && e.querySelector('path');
            if (shp && headScar) out.push({ key, host: headScar, shape: shp });
        };
        ear('ear-left');
        if (tilt && headScar) out.push({ key: 'head', host: headScar,
            shape: tilt.querySelector(':scope > .worm-part-shape') });
        ear('ear-right');
        const segs = [...root.querySelectorAll('[data-part^="segment-"], [data-part="belly"]')]
            .filter(n => n.style.display !== 'none').reverse();
        for (const n of segs) {
            const shape = n.querySelector(':scope > .worm-part-shape');
            const host = n.querySelector(':scope > g.worm-anatomy') || n;
            if (shape) out.push({ key: n.getAttribute('data-part'), host, shape });
        }
        return out.filter(c => c.shape);
    },

    // Матрица из координат узла a в координаты узла b. Через экранные
    // матрицы обоих: общая часть (css-масштаб холста, трансформации
    // предков, которые WebKit в getScreenCTM не учитывает) в их отношении
    // сокращается, так что это верно и на айфоне.
    //
    // Экранная матрица — это чтение раскладки страницы, самое дорогое, что
    // может сделать кадр. Капли прилипают пачками (комета рвётся на брызги),
    // и каждая спрашивала бы матрицы всех частей заново, поэтому они
    // помнятся десятую долю секунды: за это время червь сдвигается на доли
    // единицы.
    rel(a, b) {
        return this.ctm(b).inverse().multiply(this.ctm(a));
    },

    ctm(el) {
        const now = performance.now();
        if (!this._ctm || now - this._ctmTs > 100) { this._ctm = new Map(); this._ctmTs = now; }
        let m = this._ctm.get(el);
        if (!m) { m = el.getScreenCTM(); this._ctm.set(el, m); }
        return m;
    },

    // Посадить пятно на часть: найти её, перевести точку и размеры в её
    // координаты, собрать поджатие к её краю.
    onPart(s, d) {
        const root = this.game.wormHandle && this.game.wormHandle.svgRoot;
        const list = this.parts();
        if (!root || !list.length) return false;
        const q = this.toWorm(d.x, d.y);
        const P = new DOMPoint(q.x, q.y);
        let pick = null;
        for (const c of list) {
            const lp = P.matrixTransform(this.rel(root, c.shape));
            if (c.shape.isPointInFill(lp)) { pick = c; break; }
        }
        // По маске силуэта капля над телом, а ни в одну часть не попала —
        // шов между частями, шея. Ближайшая по центру часть и забирает её:
        // поджатие само подтянет пятно внутрь.
        if (!pick) {
            let best = Infinity;
            for (const c of list) {
                const b = c.shape.getBBox();
                const cp = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2)
                    .matrixTransform(this.rel(c.shape, root));
                const dd = Math.hypot(cp.x - q.x, cp.y - q.y);
                if (dd < best) { best = dd; pick = c; }
            }
        }
        const H = this.host(pick);
        const M = this.rel(root, H.el);
        const lp = P.matrixTransform(M);
        // Масштаб: сцена → холст червя (q.k) → координаты части.
        const sc = Math.sqrt(Math.abs(M.a * M.d - M.b * M.c));
        s.host = pick.key + '@' + H.id;
        s.x = lp.x; s.y = lp.y; s.k = q.k * sc;
        // Направление удара — в координатах части: у головы есть зеркало.
        s.ang = Math.atan2(M.b * d.vx + M.d * d.vy, M.a * d.vx + M.c * d.vy);
        s.fit = this.partFit(H.el, pick.shape, s.k);
        return true;
    },

    // Группа следов в части: тень, край, ядро, блик — застывшие и живые.
    host(c) {
        // У слоя шрамов головы есть своё имя; анатомия звена безымянна —
        // её зовём по части.
        const id = 'bt-wgoo-' + (c.host.getAttribute('data-anchor') || c.key);
        const key = c.key + '@' + id;
        let h = this.hosts[key];
        if (h && h.g.isConnected) return h;
        // Одна группа на узел-хозяин: ухо и голова кладут в один слой
        // шрамов, и слоёв следов у них тоже один.
        const same = Object.values(this.hosts).find(x => x.el === c.host && x.g.isConnected);
        if (same) { this.hosts[key] = same; return same; }
        const ns = 'http://www.w3.org/2000/svg';
        const g = document.createElementNS(ns, 'g');
        g.setAttribute('class', 'bt-goo-host');
        g.setAttribute('pointer-events', 'none');
        g.innerHTML = BATH_ART.gooLive(id);
        c.host.appendChild(g);
        h = { el: c.host, g, id, done: [], dirty: false };
        this.hosts[key] = h;
        return h;
    },

    // Поджатие к фигуре части. Фигура — эллипс звена или контур головы,
    // уха: заранее не известно, какая, поэтому край меряется у неё самой —
    // лучами из центра по isPointInFill, 48 лучей на фигуру, один раз на
    // пятно. Потом точка на луче мягко не пускается дальше края минус
    // отступ.
    //
    // Лучи меряются ОДИН РАЗ на часть и помнятся: фигура в координатах своей
    // группы-хозяина от вдоха не меняется — хозяин дышит вместе с ней. На
    // каждое пятно это были 672 вопроса isPointInFill и полтора кадра.
    partFit(hostEl, shape, k) {
        const R = this.rays(hostEl, shape), c = R.c, rays = R.rays, N = rays.length;
        const m = this.EDGE.margin * k, soft = this.EDGE.soft * k;
        return (p) => {
            const dx = p.x - c.x, dy = p.y - c.y, dist = Math.hypot(dx, dy);
            if (dist < 1e-6) return p;
            let f = (Math.atan2(dy, dx) / (2 * Math.PI) + 1) % 1 * N;
            const i0 = Math.floor(f) % N, i1 = (i0 + 1) % N;
            f -= Math.floor(f);
            const R2 = Math.max(0.5, rays[i0] * (1 - f) + rays[i1] * f - m);
            const d2 = this.softMin(dist, R2, soft);
            return { x: c.x + dx / dist * d2, y: c.y + dy / dist * d2 };
        };
    },

    rays(hostEl, shape) {
        this._rays = this._rays || new WeakMap();
        const hit = this._rays.get(shape);
        if (hit && hit.host === hostEl) return hit;
        const M = this.rel(hostEl, shape);
        const bb = shape.getBBox();
        const c = new DOMPoint(bb.x + bb.width / 2, bb.y + bb.height / 2)
            .matrixTransform(M.inverse());
        const inside = (x, y) => shape.isPointInFill(new DOMPoint(x, y).matrixTransform(M));
        const N = 48, rays = new Float32Array(N);
        const far = Math.hypot(bb.width, bb.height) / Math.sqrt(Math.abs(M.a * M.d - M.b * M.c));
        for (let i = 0; i < N; i++) {
            const a = 2 * Math.PI * i / N, ux = Math.cos(a), uy = Math.sin(a);
            let lo = 0, hi = far;
            for (let j = 0; j < 14; j++) {
                const mid = (lo + hi) / 2;
                if (inside(c.x + ux * mid, c.y + uy * mid)) lo = mid; else hi = mid;
            }
            rays[i] = lo;
        }
        const out = { host: hostEl, c: { x: c.x, y: c.y }, rays };
        this._rays.set(shape, out);
        return out;
    },

    // ---------- ХВОСТ: СОБСТВЕННЫЕ КООРДИНАТЫ ----------
    // Точка хвоста — доля длины t и поперечное смещение. Пятно рисуется в
    // РАМКЕ хвоста в этой точке: поперёк — вдоль нормали, вдоль — к
    // основанию (туда и стекает). Каждый кадр рамка берётся заново — хвост
    // гнётся, и пятно поворачивается вместе с ним; растёт или опадает —
    // пятно растягивается вдоль и сужается поперёк ровно настолько же.
    frameAt(t) {
        const g = this.game, T = BATH_ART.TAIL, grow = g.tailGrow();
        const sp = BATH_ART.tailSpine(g.bend, grow), n = sp.length - 1;
        const p = sp[Math.max(0, Math.min(n, Math.round(t * n)))];
        const side = T.side || 1;
        return { x: p.x, y: p.y, grow, half: BATH_ART.tailHalf(t, grow),
                 nx: side * Math.cos(p.a), ny: Math.sin(p.a),
                 // «вниз по хвосту» — к основанию
                 dx: -side * Math.sin(p.a), dy: Math.cos(p.a) };
    },

    // Пятно на хвосте запоминается в рамке момента удара; поджатие —
    // поперёк к полуширине хвоста В ТОЙ точке, куда сползла нитка, вдоль —
    // к кончику.
    onTailFrame(s, at) {
        const F = this.frameAt(at.t), T = BATH_ART.TAIL, E = this.EDGE;
        const L = T.len * F.grow, u0 = at.u * F.half;
        s.at = at; s.u0 = u0; s.grow0 = F.grow; s.half0 = Math.max(0.5, F.half);
        s.fit = (p) => {
            const tt = Math.max(0, Math.min(1, at.t - p.y / L));
            const lim = Math.max(0.6, BATH_ART.tailHalf(tt, F.grow) - E.margin);
            const U = u0 + p.x;
            const Uc = Math.sign(U) * this.softMin(Math.abs(U), lim, E.soft);
            const up = (1 - at.t) * L - E.margin;
            return { x: Uc - u0, y: -this.softMin(-p.y, up, E.soft) };
        };
    },

    // Точки пятна на хвосте в рамке (кэш по размеру, как у shapeOf).
    tailPts(s) {
        const len = Math.min(s.len, s.r * 2.2);
        const r = Math.round(s.r * 4) / 4, l = Math.round(len * 2) / 2, key = r + '|' + l;
        if (s._tp && s._tp.key === key) return s._tp.p;
        const p = BATH_ART.gooPts(0, 0, r, l, s.seed, Math.PI / 2, 0, s.fit);
        s._tp = { key, p };
        return p;
    },

    // Рамка хвоста сейчас: перенос, поворот, растяжение — одно аффинное
    // на пятно, и по нему прогоняются все его точки.
    tailShape(s) {
        const F = this.frameAt(s.at.t);
        const ku = F.half / s.half0, kv = F.grow / s.grow0;
        const ox = F.x + F.nx * s.u0 * ku, oy = F.y + F.ny * s.u0 * ku;
        const map = (q) => ({ x: ox + F.nx * q.x * ku + F.dx * q.y * kv,
                              y: oy + F.ny * q.x * ku + F.dy * q.y * kv });
        const P = this.tailPts(s), M = (list) => list.map(pts => pts.map(map));
        return { body: BATH_ART.gooCurves(M(P.body)), core: BATH_ART.gooCurves(M(P.core)),
                 hi: BATH_ART.gooCurves(M(P.hi)) };
    },

    // Хвост перерисован (изгиб, налив, опадание) — пятна едут следом.
    // Застывшие и ползущие — РАЗНЫЕ пути: ползущие меняются каждый кадр,
    // застывших десятки. Застывшие пересобираются не чаще пятнадцати раз в
    // секунду: хвост гнётся непрерывно, а сплайны двадцати пяти пятен — это
    // тысячи чисел. Последний кадр движения (force) рисуется всегда, иначе
    // пятна застыли бы чуть не там, где остановился хвост.
    drawTail(force) {
        if (!this.tailDone) return;
        const now = performance.now();
        if (force || now - this.tailTs >= 66) {
            this.tailTs = now;
            this.setLayer('tail', this.join(this.tailDone.map(s => this.tailShape(s))), '-done');
        }
        this.drawTailLive(force);
    },

    // Живые пятна на хвосте — не чаще двадцати раз в секунду: каждый раз это
    // сплайны через рамку хвоста, а нитка за двадцатую долю секунды
    // сползает на долю единицы.
    drawTailLive(force) {
        const now = performance.now();
        if (!force && now - (this.tailLiveTs || 0) < 50) return;
        this.tailLiveTs = now;
        this.setLayer('tail', this.join(this.live.filter(q => q.surf === 'tail')
            .map(s => this.tailShape(s))));
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
    // единиц сцены: на теле пятно рисуется в координатах части).
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
        const d = BATH_ART.goo(x, y, r * k, len * k, s.seed, s.ang, blur || 0, s.fit);
        c[slot] = { key, d };
        return d;
    },

    render(tail) {
        const rim = [];
        let worm = false;
        for (const s of this.live) {
            if (s.surf === 'rim') rim.push(this.shapeOf(s, s.x, s.y, 1));
            else if (s.surf === 'wall') this.dirty(this.wall, s);
            else if (s.surf === 'worm') worm = true;
        }
        this.setLayer('rim', this.join(rim));
        if (tail) this.drawTailLive();
        if (worm || this.wormForce) this.drawWorm();
        this.draw(this.wall, 'wall');
    },

    // Живые следы на теле — по пути на тон в каждой части. Не чаще
    // двенадцати раз в секунду: это правка внутри svg самого червя, а его
    // перерисовка — самое дорогое в сцене (в финале он недаром
    // обновляется пять раз в секунду). Потёк ползёт медленно, червь в
    // финале в расфокусе, и шаг нитки за такой кадр не виден.
    drawWorm() {
        const now = performance.now();
        if (!this.wormForce && now - this.wormTs < 83) return;
        this.wormTs = now; this.wormForce = false;
        const by = new Map();
        for (const s of this.live) if (s.surf === 'worm') {
            const h = this.hosts[s.host];
            if (!h) continue;
            if (!by.has(h)) by.set(h, []);
            by.get(h).push(this.shapeOf(s, s.x, s.y, s.k));
        }
        for (const h of new Set(Object.values(this.hosts))) {
            if (!h.g.isConnected) continue;
            this.setLayer(h.id, this.join(by.get(h) || []));
            if (h.dirty) {
                h.dirty = false;
                this.setLayer(h.id, this.join(h.done), '-done');
            }
        }
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

    // Перерисовка ТОЛЬКО прямоугольника вокруг ползущих пятен и не чаще hz
    // раз в секунду. Весь холст каждый кадр стоил половины кадров финала
    // (под замедлением ×6 было 59 без следов и 33 с ними), а любая правка
    // холста, даже в ноготь, заново отдаёт видеокарте весь холст.
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
        c.globalAlpha = T.thin;
        for (const s of live) this.paintTone(c, C, s, 'body');
        c.globalAlpha = T.core;
        for (const s of live) this.paintTone(c, C, s, 'core');
        c.restore();
    },

    // Готовый слой застывшего: край и ядро, каждый со своей прозрачностью.
    // Пересобирается только в прямоугольнике нового пятна.
    compose(C, R) {
        const W = C.el.width, H = C.el.height;
        const x = Math.max(0, Math.floor(R.x0)), y = Math.max(0, Math.floor(R.y0));
        const w = Math.min(W, Math.ceil(R.x1)) - x, h = Math.min(H, Math.ceil(R.y1)) - y;
        if (w <= 0 || h <= 0) return;
        const c = C.done.getContext('2d'), T = BATH_ART.GOO_TONE;
        c.clearRect(x, y, w, h);
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
        if (s.surf === 'wall') {
            const C = this.wall;
            if (!C) return;
            // Тона запекаются НЕПРОЗРАЧНЫМИ, каждый в свой холст, и только
            // при сведении получают прозрачность — одну на все пятна. Так
            // слипшиеся пятна дают одну массу, а не стопку.
            this.paintTone(C.body.getContext('2d'), C, s, 'body');
            this.paintTone(C.core.getContext('2d'), C, s, 'core');
            this.dirty(C, s);
            C.force = true;
            this.compose(C, C.rect);
            return;
        }
        if (s.surf === 'worm') {
            // Застывшее на части — в её общий путь на тон: слипшиеся пятна
            // одной части дают одну массу.
            const h = this.hosts[s.host];
            if (!h) return;
            h.done.push(this.shapeOf(s, s.x, s.y, s.k));
            if (h.done.length > this.CAP.worm) h.done.shift();
            h.dirty = true;
            this.wormForce = true;
            return;
        }
        if (s.surf === 'tail') {
            this.tailDone.push(s);
            if (this.tailDone.length > this.CAP.tail) this.tailDone.shift();
            this.drawTail(true);
            return;
        }
        // Борт: застывшие — ОДИН путь на тон, переписывается при каждом
        // застывании. Путь на пятно был бы стопкой: полупрозрачный край
        // соседних пятен темнел бы там, где они легли друг на друга.
        this.rimDone.push(this.shapeOf(s, s.x, s.y, 1));
        if (this.rimDone.length > this.CAP.rim) this.rimDone.shift();
        this.setLayer('rim', this.join(this.rimDone), '-done');
    }
};
