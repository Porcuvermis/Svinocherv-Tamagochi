// ================= ПОХОТЬ: ХВОСТ, ПЕНА, ПУЗЫРИ =================
// Хвост всплывает, горка пены, поглаживание и изгиб хвоста, пузыри.
// Продолжение LustMinigame (lust.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после lust.js.
Object.assign(LustMinigame, {

    // ---------- ХВОСТ ВСПЛЫВАЕТ ----------
    raiseTail() {
        this.phase = 'tail';
        // Кадр СЖИМАЕТСЯ до двоих: мыло, мочалка и полка отработали, и
        // держать их на экране больше незачем. Переезд плавный, и червь
        // уходит в расфокус одновременно с ним: это не новая сцена, а
        // смена того, на что смотрят.
        this.setCamera('tail', 1000);
        // Червь стал ФОНОМ за хвостом, и платить за него полную цену больше
        // незачем: на наезде он занимает пол-экрана, а каждая правка его
        // геометрии — это перерисовка всей этой площади. Замер на айфоне:
        // живой персонаж 24 кадра, замерший 60.
        if (this.wormHandle && this.wormHandle.setFrameHz) this.wormHandle.setFrameHz(5);
        this.wormHost.classList.add('bt-soft');
        this.blurFar(BATH_ART.FAR_BLUR, 900);
        // Пена с тела НЕ сходит разом (docs/plan/21-lust-bath.md, 5г): её
        // смывают тапы по горке, кусок за группой (pop). К поглаживанию тело
        // чистое — вуали поверх морды в финале нет, а именно морда в нём и
        // работает (блаженство, открытый рот).
        const model = window.WormModelAPI ? this.bathModel() : null;
        this.tailModel = model;
        // Вид хвоста — по купленной ступени (BATH_ART.TAIL_LOOKS).
        BATH_ART.setTailLevel(this.tailLevel());
        this.bend = 0;
        this.bendHand = null;
        this.ringFinger = null; this.ringS = 0; this.ringSV = 0; this.ringT = null; this.ringVel = 0;
        BATH_ART.setRing(0.5, 0, 0);
        BATH_ART.setPulse(0, 0, 0);
        this.nextShotAt = null; this.shotAt = null;

        this.el('bt-tail').innerHTML =
            `<g id="bt-tail-pivot">${BATH_ART.tail(model, this.skinSat)}</g>`;
        this._toneKey = null;
        this.drawTail();
        this.setOpacity('bt-tail', 1);

        // НИКАКОГО ВСПЛЫТИЯ. Хвост просто оказывается на своём месте — под
        // горкой пены, которая его целиком закрывает. Раньше он выезжал
        // снизу, и это было видно: сначала кончик показывался из-за борта,
        // потом подъезжал к пене и прятался под ней. Появление, которое
        // прячут, не нужно анимировать — его нужно не показывать.
        const g = this.el('bt-tail');
        g.removeAttribute('transform');
        this.startPop();
    },

    // Размытие ДАЛЬНЕГО плана. Стена с плиткой стоит дальше всех, значит и
    // мылится сильнее всех — из этого и берётся глубина кадра. Пока размыт
    // был один червь, резкая плитка спорила с ним и тянула взгляд на себя.
    //
    // Ставится в svg-фильтр, а не в css: css filter не действует на
    // внутренние элементы svg в WebKit, и на айфоне размытия бы не было
    // вовсе (та же грабля, что у фильтра истощения в worm-renderer).
    blurFar(to, ms) {
        const n = this.el('bt-far-blur-amount'), g = this.el('bt-shower');
        const lines = this.el('bt-far-lines');
        if (!n || !g) return;
        cancelAnimationFrame(this.blurRaf || 0);
        // Дальний план мылится ДВУМЯ РАЗНЫМИ СРЕДСТВАМИ, и это не небрежность.
        // Стена и пол — плоские заливки, размывать в них нечего; расфокус на
        // них читается пропавшим контрастом ЛИНИЙ, а это одна прозрачность.
        // Честный гауссиан остаётся только на душе — единственном предмете
        // дальнего плана с формой, зато и площадью с ладонь. Фильтр во всю
        // стену стоил трети кадров: дождь перерисовывается каждый кадр и
        // тянет за собой пересчёт размытия по всему экрану.
        //
        // Фильтр СНИМАЕТСЯ вовсе, когда размывать нечего: нулевая
        // stdDeviation не бесплатна, группа всё равно гоняется через
        // конвейер фильтра каждый кадр.
        const set = (v) => {
            n.setAttribute('stdDeviation', v.toFixed(2));
            if (v < 0.05) g.removeAttribute('filter');
            else g.setAttribute('filter', 'url(#bt-far-blur)');
            // Швы гаснут вместе с наводкой: на полном размытии от них
            // остаётся четверть, то есть намёк на кафель, а не сетка.
            if (lines) lines.setAttribute('opacity',
                (1 - 0.75 * Math.min(1, v / BATH_ART.FAR_BLUR)).toFixed(3));
        };
        const from = parseFloat(n.getAttribute('stdDeviation')) || 0;
        if (!ms) { set(to); return; }
        const t0 = performance.now();
        const step = (now) => {
            const k = Math.max(0, Math.min(1, (now - t0) / ms));
            set(from + (to - from) * k * k * (3 - 2 * k));
            this.blurRaf = k < 1 ? requestAnimationFrame(step) : 0;
        };
        this.blurRaf = requestAnimationFrame(step);
    },

    // ---------- ГОРКА ПЕНЫ НАД ХВОСТОМ ----------
    // ШИРМА, под которой всплывает хвост (docs/plan/21-lust-bath.md, 5г).
    // Это ТА ЖЕ пена, что на теле: те же пузыри тем же рисовальщиком
    // (BATH_ART.washCell — цвет и эффекты от мыла, густота и объём от
    // мочалки), те же блики от наклона. Своя у неё только форма:
    //   * пузыри — пирамидкой острием кверху, плотно, и делятся на N групп
    //     снизу вверх. Растут группами по доле натёртого мочалкой и лопаются
    //     группами в обратном порядке, сверху вниз;
    //   * муть под ними — не облако, а раздутый скруглённый СИЛУЭТ ХВОСТА,
    //     каким он всплывёт (маленьким), цвета мыльной мути. Проступает к
    //     концу мочалки и прячет появление хвоста; тает вместе с группами —
    //     срезана по верху оставшейся пены.
    // Холст свой, под чашей и над хвостом (#bt-pile), в единицах сцены.
    // Собирается ОДИН РАЗ, ещё на этапе мочалки; дальше только показывается
    // нужное число групп.
    buildPile() {
        const A = BATH_ART.slots(), T = BATH_ART.TAIL, PL = BATH_ART.PILE, N = this.foamGroups();
        const R = PL.res, cv = this.el('bt-pile'), gl = this.el('bt-pile-glint');
        if (!cv) return;
        // Клетка пены — та же величина, что на теле (growth), в единицах
        // сцены: пузыри горки того же калибра, что на черве.
        const b = this.coverBox(), Gd = this.grid();
        const cellScene = Math.max(b.w / Gd.nx, b.h / Gd.ny) * 0.78 * PL.cell;
        // Запас холста вокруг горки — с крупнейший пузырь с кромкой: при
        // 1.8 клетки верхние пузыри высоких ступеней срезались краем холста.
        const Hh = T.len * PL.tall, W0 = T.base * PL.wide, m = cellScene * 2.8;
        // Низ горки — у кромки борта, а не у корня хвоста: корень под
        // бортом, и пена ниже кромки (а с ней вся первая группа) была бы
        // не видна вовсе.
        const tub = BATH_ART.box('tub'), low = Math.min(A.tail.y, tub ? tub.y : A.tail.y) + PL.below - A.tail.y;
        const pb = { x: A.tail.x - W0 - m, y: A.tail.y - Hh - m, w: 2 * (W0 + m), h: Hh + m + Math.max(0, low) + m * 0.5 };
        const pw = Math.ceil(pb.w * R), ph = Math.ceil(pb.h * R), cell = cellScene * R;
        const ox = (A.tail.x - pb.x) * R, oy = (A.tail.y - pb.y) * R;
        const mk = () => { const c = document.createElement('canvas'); c.width = pw; c.height = ph; return c; };
        // Раздутый хвост: контур в том виде, каким всплывёт (без изгиба и
        // налива), обведённый толстой круглой линией — раздут на pad и
        // скруглён на углах.
        const tl = mk(), tc = tl.getContext('2d'), path = new Path2D(BATH_ART.tailCurve(0, 1).d);
        tc.setTransform(R, 0, 0, R, ox, oy);
        tc.fillStyle = tc.strokeStyle = '#000';
        tc.lineJoin = tc.lineCap = 'round';
        tc.lineWidth = PL.pad * 2;
        tc.fill(path); tc.stroke(path);
        // Место пены: пирамидка над гнездом плюс раздутый хвост.
        const rg = mk(), rc = rg.getContext('2d');
        rc.setTransform(R, 0, 0, R, ox, oy);
        rc.fillStyle = '#000';
        rc.beginPath();
        // Пирамидка: от кромки борта (low) до острия над кончиком хвоста.
        const yAt = (h) => low + (-Hh - low) * h;
        for (let i = 0; i <= 24; i++) { const h = i / 24; rc.lineTo(-W0 * Math.pow(1 - h, PL.taper), yAt(h)); }
        for (let i = 24; i >= 0; i--) { const h = i / 24; rc.lineTo(W0 * Math.pow(1 - h, PL.taper), yAt(h)); }
        rc.closePath(); rc.fill();
        rc.setTransform(1, 0, 0, 1, 0, 0);
        rc.drawImage(tl, 0, 0);
        const RA = rc.getImageData(0, 0, pw, ph).data, TA = tc.getImageData(0, 0, pw, ph).data;
        const inside = (x, y) => {
            const i = Math.round(x), j = Math.round(y);
            return i >= 0 && j >= 0 && i < pw && j < ph && RA[(j * pw + i) * 4 + 3] > 0;
        };
        inside.body = inside;
        // Частицы — сеткой с дрожанием, гуще, чем на теле (PL.step):
        // кучка плотная. Группы — по высоте снизу вверх, поровну частиц;
        // граница между группами неровная (дрожь в ключе сортировки).
        const seed = 1 + Math.floor(Math.random() * 999), rng = btRng(seed);
        const step = cell * PL.step, parts = [];
        let n = 0;
        for (let y = 0, row = 0; y < ph; y += step * 0.87, row++) {
            for (let x = -step; x < pw + step; x += step) {
                const px = x + (row % 2) * step * 0.5 + (rng() - 0.5) * step * 0.6;
                const py = y + (rng() - 0.5) * step * 0.6;
                n++;
                if (!inside(px, py) || py > oy + low * R) continue;
                parts.push({ x: px, y: py, seed: seed * 13 + n * 7, key: py + (rng() - 0.5) * step * 1.4 });
            }
        }
        parts.sort((a, c) => c.key - a.key);
        const tops = new Array(N).fill(Infinity);
        // Рамка каждой группы — по её частицам с запасом на пузыри: группа
        // рисуется своим холстом один раз (pileGroup), а горка складывается
        // из готовых картинок групп.
        const groups = Array.from({ length: N }, () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, cv: null, glints: [] }));
        parts.forEach((q, i) => {
            q.g = Math.min(N - 1, Math.floor(i * N / parts.length));
            tops[q.g] = Math.min(tops[q.g], q.y);
            const G = groups[q.g], e = cell * 2.5;
            G.x0 = Math.min(G.x0, q.x - e); G.y0 = Math.min(G.y0, q.y - e);
            G.x1 = Math.max(G.x1, q.x + e); G.y1 = Math.max(G.y1, q.y + e);
        });
        // Муть — картинкой по пикселю на клетку (как муть на теле), цвет —
        // мыльной мути этого забега, густота — доля раздутого хвоста в клетке.
        const fs = Math.max(2, Math.round(PL.filmStep * R)), fw = Math.ceil(pw / fs), fh = Math.ceil(ph / fs);
        const soapLook = BATH_ART.latherLook(null, 'soap'), film = [];
        for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
            let cov = 0;
            for (let v = 0; v < 4; v++) for (let u = 0; u < 4; u++) {
                const x = Math.min(pw - 1, Math.floor(i * fs + (u + 0.5) * fs / 4)), y = Math.min(ph - 1, Math.floor(j * fs + (v + 0.5) * fs / 4));
                if (TA[(y * pw + x) * 4 + 3]) cov++;
            }
            if (!cov) continue;
            const x = i * fs + fs / 2, y = j * fs + fs / 2, c = BATH_ART.filmCell(soapLook, 'soap', x, y, cell);
            film.push({ k: j * fw + i, y, r: c[0], g: c[1], b: c[2], a: cov / 16 * PL.filmA });
        }
        const fc = document.createElement('canvas');
        fc.width = fw; fc.height = fh;
        cv.width = gl.width = pw; cv.height = gl.height = ph;
        this.pileCtx = cv.getContext('2d');
        this.pileGlintCtx = gl.getContext('2d');
        this.pile = {
            N, pb, pw, ph, R, cell, parts, tops, groups, inside, kind: 'cloth',
            look: Object.assign({}, BATH_ART.latherLook(null, 'cloth'), { foam: BATH_ART.foamLook() }),
            film, fs, fw, fh, fc, shown: 0, alive: N, fade: 0, glints: [], grid: new Map(), top: null
        };
        this.layoutPile();
        this.pileDraw();
    },

    // Холст горки — в единицах сцены, той же камерой, что и всё остальное.
    layoutPile(pxPerScene) {
        const H = this.pile;
        if (!H) return;
        if (pxPerScene == null) {
            const a = this.sceneToHost({ x: 0, y: 0 }), c = this.sceneToHost({ x: 100, y: 0 });
            pxPerScene = (c.x - a.x) / 100 || 1;
        }
        const o = this.sceneToHost({ x: H.pb.x, y: H.pb.y });
        const t = `translate(${o.x.toFixed(1)}px, ${o.y.toFixed(1)}px) scale(${pxPerScene.toFixed(4)})`;
        for (const id of ['bt-pile', 'bt-pile-glint']) {
            const n = this.el(id);
            if (!n) continue;
            n.style.width = H.pb.w + 'px';
            n.style.height = H.pb.h + 'px';
            n.style.transform = t;
            n.style.opacity = '1';
        }
    },

    // Нарисовать горку: группы [0, min(shown, alive)) и муть под ними.
    pileDraw() {
        const H = this.pile, ctx = this.pileCtx, PL = BATH_ART.PILE;
        if (!H || !ctx) return;
        ctx.clearRect(0, 0, H.pw, H.ph);
        H.glints = []; H.grid = new Map(); H.top = null;
        const upto = Math.min(H.shown, H.alive);
        if (H.fade > 0 && upto > 0) {
            // Муть срезана по верху оставшейся пены, мягко; и бледнеет, пока
            // горку разбирают: тает вместе с группами.
            const cut = H.tops[upto - 1], soft = H.cell * PL.soft;
            const k = H.fade * (PL.thin + (1 - PL.thin) * H.alive / H.N);
            const fx = H.fc.getContext('2d'), img = fx.createImageData(H.fw, H.fh), d = img.data;
            for (const f of H.film) {
                let u = (f.y - cut) / soft + 0.5;
                u = u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
                if (!u) continue;
                d[f.k * 4] = f.r; d[f.k * 4 + 1] = f.g; d[f.k * 4 + 2] = f.b; d[f.k * 4 + 3] = 255 * f.a * k * u;
            }
            fx.putImageData(img, 0, 0);
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(H.fc, 0, 0, H.fw * H.fs, H.fh * H.fs);
        }
        // Пузыри — готовыми картинками групп, снизу вверх; блики — их же,
        // и закрытость пересчитывается заново: лопнула верхняя группа —
        // блестят те, кого она накрывала.
        for (let g = 0; g < upto; g++) {
            const G = this.pileGroup(g);
            if (G.cv) ctx.drawImage(G.cv, G.x, G.y);
            for (const b of G.glints) { b.hidden = false; H.glints.push(b); this.glintOcclude(b, H.grid); }
        }
        const gc = this.pileGlintCtx;
        if (gc) gc.clearRect(0, 0, H.pw, H.ph);
        this.glintDirty = true;
        if (H.glints.length) this.glintStart();
    },

    // Картинка группы g горки — рисуется один раз, тем же рисовальщиком,
    // что пена на теле; её блики копятся в группе.
    // Рамка группы — по НАСТОЯЩИМ краям её пузырей, а не по центрам частиц с
    // запасом: на высоких ступенях пена крупнее и пышнее (над частицей
    // пузыри ярусом), и запас в 2.5 клетки срезал крупный пузырь ровной
    // линией (снимок игрока; замер: на ступенях 7–8 2–3 пузыря на горку).
    // Поэтому группа рисуется на общем черновике размером с горку, а её
    // картинка вырезается по краям пузырей с толщиной кромки.
    pileGroup(g) {
        const H = this.pile, G = H.groups[g];
        if (G.cv || !(G.x1 > G.x0)) return G;
        let D = H.draft;
        if (!D) { D = H.draft = document.createElement('canvas'); D.width = H.pw; D.height = H.ph; }
        const dc = D.getContext('2d');
        dc.clearRect(0, 0, H.pw, H.ph);
        const T = { look: H.look, kind: H.kind, cell: H.cell, glints: G.glints, grid: new Map() };
        // Каждый пузырь группы запоминается — по ним она потом лопается
        // (pileBurst): кольцо и брызги стоят там, где был пузырь.
        G.bubs = [];
        const sink = (bx, by, r, pc) => { G.bubs.push(bx, by, r); this.glintBubble(T, bx, by, r, pc); };
        for (const q of H.parts) if (q.g === g)
            BATH_ART.washCell(dc, 'cloth', q.x, q.y, H.cell, 1, q.seed, undefined, H.inside, H.look, sink);
        let x0 = G.x0, y0 = G.y0, x1 = G.x1, y1 = G.y1;
        for (let i = 0; i < G.bubs.length; i += 3) {
            const r = G.bubs[i + 2] * 1.1 + 2;
            x0 = Math.min(x0, G.bubs[i] - r); x1 = Math.max(x1, G.bubs[i] + r);
            y0 = Math.min(y0, G.bubs[i + 1] - r); y1 = Math.max(y1, G.bubs[i + 1] + r);
        }
        G.x = Math.max(0, Math.floor(x0)); G.y = Math.max(0, Math.floor(y0));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.min(H.pw, Math.ceil(x1)) - G.x);
        cv.height = Math.max(1, Math.min(H.ph, Math.ceil(y1)) - G.y);
        cv.getContext('2d').drawImage(D, G.x, G.y, cv.width, cv.height, 0, 0, cv.width, cv.height);
        G.cv = cv;
        // Все группы нарисованы — черновик больше не нужен.
        if (H.groups.every(q => q.cv || !(q.x1 > q.x0))) { D.width = D.height = 0; H.draft = null; }
        return G;
    },

    // Горка во время мочалки: доля натёртого p. Группа приходит целиком,
    // в свою долю; муть — к концу этапа, ступенями по восьмой.
    pileShow(p) {
        const H = this.pile, PL = BATH_ART.PILE;
        if (!H) return;
        let shown = 0;
        for (let g = 0; g < H.N; g++)
            if (p >= PL.grow[0] + (PL.grow[1] - PL.grow[0]) * g / Math.max(1, H.N - 1)) shown = g + 1;
        let u = Math.max(0, Math.min(1, (p - PL.film[0]) / (PL.film[1] - PL.film[0])));
        u = Math.round(u * u * (3 - 2 * u) * 8) / 8;
        if (shown === H.shown && u === H.fade) return;
        H.shown = shown; H.fade = u;
        this.pileDraw();
    },

    pileClear() {
        this.pile = null;
        for (const n of this._bursts || []) n.remove();
        this._bursts = [];
        for (const id of ['bt-pile', 'bt-pile-glint']) {
            const n = this.el(id);
            if (n) n.getContext('2d').clearRect(0, 0, n.width, n.height);
        }
    },

    // Попал ли тап в горку: в ЛЮБОЕ её место, с запасом popReach вокруг
    // оставшейся пены (пузыри мелкие, палец толстый).
    pileHit(p) {
        const H = this.pile;
        if (!H || !H.alive) return false;
        const A = BATH_ART.slots(), reach = this.cfg().popReach || 34;
        const W0 = BATH_ART.TAIL.base * BATH_ART.PILE.wide;
        const top = H.pb.y + H.tops[Math.min(H.shown, H.alive) - 1] / H.R;
        return Math.abs(p.x - A.tail.x) <= W0 + reach && p.y >= top - reach && p.y <= A.tail.y + reach;
    },

    // Точка рта червя. Считается по НАРИСОВАННОМУ рту, а не по числу: рот
    // ездит вместе с моделью, и подобранное число разошлось бы с ней при
    // первой же правке персонажа.
    mouthPoint() {
        const box = this.wormBoxScene(), B = this.WORM_BASE, k = box.w / B.w;
        let p = null;
        if (this.wormHandle && this.wormHandle.getPartPoint) {
            const q = this.wormHandle.getPartPoint('mouth');
            if (q) p = { x: box.x + q.x * k, y: box.y + q.y * k };
        }
        return p || { x: box.x + box.w * 0.6, y: box.y + box.h * 0.42 };
    },

    // Куда сейчас смотрит кончик и где он стоит.
    // Во сколько раз хвост крупнее исходного. Считается ОТ ЗАРЯДА, а не
    // хранится: заряд меняется каждый кадр, и держать рядом второе число,
    // которое обязано с ним совпадать, — верный способ их развести.
    tailGrow() { return 1 + this.charge * (this.cfg().rubGrow || 0.3); },

    tipState(bend) {
        const A = BATH_ART.slots();
        const c = BATH_ART.tailCurve(bend == null ? this.bend : bend,
                                     this.tailGrow());
        return { x: A.tail.x + c.tip.x, y: A.tail.y + c.tip.y, dir: c.dir, curve: c };
    },

    // ---------- ПОГЛАЖИВАНИЕ ----------
    // Между лопаньем пузырей и финалом. Палец ВЕДЁТ вдоль хвоста, хвост
    // наливается и растёт; перестал вести — заряд спадает.
    //
    // Ровно та же механика, что у прицела в финале, и по той же причине:
    // засчитывается ПУТЬ пальца вдоль оси, а не то, где он лежит. Иначе
    // достаточно положить палец и ждать.
    startRub() {
        this.phase = 'rub';
        this.charge = 0;
        // Морда откликается заранее: рот приоткрыт, глаза приспущены. В
        // финале то же лицо доводится до блаженства — так по нему видно, что
        // этап идёт и к чему ведёт (инвариант 9: сказано позой, не подписью).
        if (this.wormHandle && this.wormHandle.setLivePose)
            this.wormHandle.setLivePose({ mouthOpenness: 0.3, eyelidLevel: 0.55 });
        // Червь уходит в расфокус: главный в кадре — хвост.
        this.wormHost.classList.add('bt-soft');
        // Горка разобрана, тело чистое — блеска больше нечему давать.
        this.pileClear();
        this.glintStop();
        this.rubLast = performance.now();
        this.rubMoved = this.rubLast;
        this._tailHint = false; this._tailHint0 = 0;
        const tick = (now) => {
            const dt = Math.min(0.05, (now - this.rubLast) / 1000);
            this.rubLast = now;
            if (this.phase !== 'rub') { this.rubRaf = 0; return; }
            const C = this.cfg();
            // Спад НЕ СРАЗУ: рука не может водить без единой остановки, а
            // прирост за ход мелкий — мгновенный спад не давал набрать вовсе.
            if ((now - this.rubMoved) / 1000 > (C.rubIdle || 1.1))
                this.charge = Math.max(0, this.charge - (C.rubRelax || 0.06) * dt);
            this.ripeTail(now);
            this.stepRing(dt);
            this.drawTail();
            this.drawRubGauge();
            // Веки опускаются ВМЕСТЕ с наливом: тот же прогресс, сказанный
            // мордой. Каждый кадр и без ступеней: setLivePose только кладёт
            // числа в живой канал, а применяет их тот же кадровый цикл
            // рендерера — округлять было не за чем, а ступени на веках
            // видно.
            //
            // Глубже ПОЛОВИНЫ веки не опускаются. Зажмуренный червь теряет
            // морду: в финале он ловит струю ртом, и по прикрытым глазам
            // читается блаженство, а по закрытым — что он спит.
            if (this.wormHandle && this.wormHandle.setLivePose) {
                this.wormHandle.setLivePose({
                    mouthOpenness: 0.3 + this.charge * 0.3,
                    eyelidLevel: this.LID_MAX * (0.5 + this.charge * 0.5) });
            }
            if (this.charge >= 1) { this.rubRaf = 0; this.startFinale(); return; }
            this.rubRaf = requestAnimationFrame(tick);
        };
        this.rubRaf = requestAnimationFrame(tick);
    },

    // Доля вдоль хвоста (0 — корень, 1 — кончик) для точки сцены и
    // расстояние до оси. Нужны обе: заряд даёт только палец НА хвосте.
    rubAt(p) {
        const A = BATH_ART.slots();
        const spine = BATH_ART.tailSpine(this.bend, this.tailGrow());
        let best = 0, dist = Infinity;
        for (let i = 0; i < spine.length; i++) {
            const d = Math.hypot(A.tail.x + spine[i].x - p.x,
                                 A.tail.y + spine[i].y - p.y);
            if (d < dist) { dist = d; best = i / (spine.length - 1); }
        }
        return { t: best, dist };
    },

    // Столбик налива СЛЕВА ОТ ХВОСТА: работа идёт по хвосту, туда игрок и
    // смотрит. Высота столбика — по самому хвосту, чтобы он не жил в кадре
    // отдельной деталью.
    drawRubGauge(level) {
        const A = BATH_ART.slots(), T = BATH_ART.TAIL;
        const h = T.len * 1.05;
        // Столбик стоит с ВНЕШНЕЙ стороны хвоста — той, куда хвост НЕ гнётся:
        // иначе он оказывается между хвостом и мордой, ровно в том коридоре,
        // где идёт вся работа.
        this.el('bt-ammo').innerHTML = BATH_ART.rubGauge(
            A.tail.x + (T.side || 1) * T.base * 0.95 * -1,
            A.tail.y - h - 6, h, level == null ? this.charge : level);
    },

    // ---------- ЗАПАС ВЫСТРЕЛОВ ----------
    // Та же шкала в финале: сколько толчков осталось. Белое уходит ПОКА
    // порция идёт по стволу (pulseU — доля её пути), а не скачком на
    // выстреле: видно, что белое перетекает из шкалы в хвост. Перерисовка —
    // только при заметной смене уровня.
    drawAmmo() {
        const total = this.shotsTotal || 1;
        const level = Math.max(0, (this.shotsLeft - (this.pulseU || 0)) / total);
        const key = Math.round(level * 400);
        if (key === this._ammoKey) return;
        this._ammoKey = key;
        this.drawRubGauge(level);
    },

    rubMove(p) {
        const C = this.cfg(), a = this.rubAt(p);
        const reach = BATH_ART.TAIL.base * this.tailGrow() * 1.3;
        this.ringFinger = { t: a.t, on: a.dist <= reach };
        if (a.dist > reach) { this.drag.t = null; return; }
        if (this.drag.t != null && a.t !== this.drag.t) {
            this.charge = Math.min(1, this.charge
                + Math.abs(a.t - this.drag.t) * (C.rubGain || 0.09));
            this.rubMoved = performance.now();
        }
        this.drag.t = a.t;
    },

    // Изгиб, при котором капля НОМИНАЛЬНОЙ силы проходит через рот. Ищется
    // перебором и ТОЙ ЖЕ физикой, которой капля потом летит: прицел обязан
    // считаться по тому же, по чему считается попадание.
    solveBend(target) {
        const C = this.cfg();
        // Прицел считается ПОЧТИ ПОЛНОЙ силой, а не средней. Цель близко и
        // почти вровень с кончиком, и на такой дистанции в корзину рта
        // проходит широкая пачка траекторий: если прицел взять по середине
        // размаха силы, то и слабый, и сильный толчок всё равно попадают —
        // сила перестаёт значить что-либо, а прокачка, которая её и
        // поднимает, становится бесполезной (проверено симулятором: от
        // ±10° до ±30° разброса попаданий поровну).
        // Прицел «впритык» разворачивает это правильной стороной: полный
        // толчок едва достаёт, слабый НЕ ДОЛЕТАЕТ и падает в ванну. Промах
        // виден целиком, и прокачка силы — это ровно то, что покупается.
        const v = C.speedMin + 0.92 * (C.speedMax - C.speedMin);
        const LO = -0.25, HI = this.BEND_MAX, N = 240;
        // Собираем ВСЕ изгибы, при которых капля проходит через рот, и
        // возвращаем СЕРЕДИНУ первой непрерывной полосы попаданий.
        //
        // Раньше возвращался «лучший по промаху». Промах у любого попадания
        // равен нулю, попадают несколько изгибов подряд, и правило «строго
        // лучше» выбирало ПЕРВЫЙ из них — то есть самый край окна. Игрок
        // держал прицел идеально и мазал половину толчков: разброс уводил
        // каплю только в одну сторону, наружу.
        //
        // Первая полоса, а не лучшая: перебор идёт от малого изгиба, и
        // первая — навесная. Дуга видна целиком, и по ней читается перелёт.
        const hits = [], bends = [];
        let best = LO, near = Infinity;
        for (let i = 0; i <= N; i++) {
            const b = LO + (HI - LO) * i / N;
            const s = this.tipState(b);
            const r = LustShot.fly(C, s,
                { vx: Math.cos(s.dir) * v, vy: Math.sin(s.dir) * v },
                target, C.mouthR);
            bends.push(b); hits.push(r.hit);
            if (r.near < near) { near = r.near; best = b; }
        }
        const from = hits.indexOf(true);
        if (from < 0) return best;          // не долетает ни при каком изгибе
        let to = from;
        while (to + 1 <= N && hits[to + 1]) to++;
        return (bends[from] + bends[to]) / 2;
    },


    // ---------- ПОРЦИЯ ПЕРЕД ВЫСТРЕЛОМ (BATH_ART.PULSE) ----------
    // Положение порции считается ОТ ВРЕМЕНИ до ближайшего толчка, а не
    // накапливается: так она приходит к шейке ровно к выстрелу при любом
    // интервале между толчками (он зависит от ступени) и не уплывает от
    // рваных кадров. Путь занимает до 0.7 с, но не больше 85% интервала —
    // на верхних ступенях толчки чаще, и порции не должны наезжать.
    //
    // РЫВКАМИ, а не ровно: путь — плавная «лестница» u − sin(2πnu)/(2πn),
    // у которой скорость то растёт, то почти замирает, но никогда не идёт
    // назад. На каждом рывке порция распирает стенки (a растёт до 1), в
    // паузе упруго отпускает (до 0.55). Весь ствол вздрагивает в такт.
    //   t    — от корня к шейке; к шейке — за мгновение до выстрела;
    //   a    — сила распирания; нарастает с началом пути, мягко;
    //   after — опадание ствола 0.3 с после выстрела; сама порция при этом
    //          не пропадает разом, а за 0.12 с гаснет у шейки.
    PULSE_SURGES: 3,
    stepPulse(now) {
        const G = BATH_ART.look().glansAt, n = this.PULSE_SURGES, TAU = Math.PI * 2;
        let t = 0, a = 0, after = 0, throb = 0;
        this.pulseU = 0;
        const t0 = 0.06, t1 = G - 0.035;
        if (this.nextShotAt) {
            const travel = Math.min(700, this.shotMs() * 0.85);
            const u = 1 - (this.nextShotAt - now) / travel;
            if (u > 0 && u <= 1.02) {
                // Доходит к шейке на 92% пути и ждёт там выстрела — «за
                // мгновение до», а не впритык к нему.
                const uu = Math.min(1, u / 0.92);
                this.pulseU = uu;
                const stair = uu - Math.sin(TAU * n * uu) / (TAU * n);
                t = t0 + (t1 - t0) * stair;
                const surge = (1 - Math.cos(TAU * n * uu)) / 2;      // 0 в паузе, 1 на рывке
                const ramp = Math.min(1, uu / 0.2), rs = ramp * ramp * (3 - 2 * ramp);
                a = rs * (0.55 + 0.45 * surge);
                throb = rs * surge;
            }
        }
        if (this.shotAt) {
            const e = now - this.shotAt;
            if (e >= 0 && e < 120 && !a) { const k = 1 - e / 120; t = t1; a = 0.8 * k * k; }
            const k = e / 300;
            if (k >= 0 && k < 1) after = Math.sin(Math.PI * k);
        }
        BATH_ART.setPulse(t, a, after, throb);
    },

    // ---------- КОЛЬЦО ПОД ПАЛЬЦЕМ (BATH_ART.RING) ----------
    // Палец на хвосте задаёт, ГДЕ кольцо (ringFinger); здесь оно доезжает
    // до пальца, меряет скорость хода и набирает силу пружиной. Пружина с
    // недодемпфированием: плоть проминается мягко, а отпущенная
    // расправляется с лёгкой дрожью. Шаг по времени, как у всей упругости
    // в финале.
    // Мягче первой версии (320/13): плоть проминается не мгновенно, а
    // отпущенная возвращается одним-двумя плавными покачиваниями.
    RING_K: 110, RING_C: 8.5,
    stepRing(dt) {
        const f = this.ringFinger, on = !!(f && f.on);
        let s = this.ringS || 0, sv = this.ringSV || 0, t = this.ringT, v = this.ringVel || 0;
        // Упругость ступени (look().firm): у налитого хвоста пружина жёстче
        // и гасится быстрее, у слабого — мягче и дрожит дольше.
        const fm = BATH_ART.look().firm || 1;
        sv += ((on ? 1 : 0) - s) * this.RING_K * fm * fm * dt - sv * this.RING_C * fm * dt;
        s = Math.max(-0.2, Math.min(1.1, s + sv * dt));
        if (on) {
            if (t == null) t = f.t;
            // Плоть чуть отстаёт от пальца — это и читается упругостью.
            const k = 1 - Math.exp(-dt / 0.08), nt = t + (f.t - t) * k;
            // Скорость хода — сглаженная: у пальца на телефоне рваные события.
            v += ((nt - t) / Math.max(dt, 1e-3) - v) * (1 - Math.exp(-dt / 0.08));
            t = nt;
        } else v *= Math.exp(-dt / 0.12);
        if (Math.abs(s) < 0.002 && Math.abs(sv) < 0.01 && !on) { s = 0; sv = 0; }
        this.ringS = s; this.ringSV = sv; this.ringT = t; this.ringVel = v;
        BATH_ART.setRing(t == null ? 0.5 : t, s, v);
    },
    // Где палец на хвосте — или null, если он не на хвосте.
    ringTouch(p) {
        if (!p) { if (this.ringFinger) this.ringFinger.on = false; return; }
        const a = this.rubAt(p), reach = BATH_ART.TAIL.base * this.tailGrow() * 1.3;
        this.ringFinger = { t: a.t, on: a.dist <= reach };
    },

    drawTail(force) {
        const A = BATH_ART.slots(), g = this.el('bt-tail-pivot');
        if (!g) return;
        // Пересобирать путь хвоста имеет смысл, только если он изменился.
        // Кадров, где палец стоит, а хвост уже выпрямился, за забег набегает
        // половина, и каждый из них стоил двух сотен toFixed и двух записей
        // в дерево.
        const R = BATH_ART.ring;
        const Pu = BATH_ART.pulse;
        const key = `${this.bend.toFixed(4)}|${this.charge.toFixed(4)}|${R.t.toFixed(3)}|${R.s.toFixed(3)}|${R.v.toFixed(2)}`
                  + `|${Pu.t.toFixed(3)}|${Pu.a.toFixed(3)}|${Pu.after.toFixed(3)}|${Pu.throb.toFixed(3)}`
                  // Легенда живёт и в покое: блеск, искорки, ореол — от времени.
                  + (BATH_ART.look().legend ? `|${Math.floor(performance.now() / 33)}` : '');
        if (key === this._tailKey) return;

        // ---------- И НЕ ЧАЩЕ ТРИДЦАТИ РАЗ В СЕКУНДУ ----------
        // Хвост — крупная фигура, а правка его пути значит перерисовку всей
        // его площади процессором (svg рисует CPU, видеокарта только двигает
        // готовое). Шестьдесят перерисовок в секунду телефон не тянет, а
        // разницы между 30 и 60 на упругом движении не видно.
        //
        // Последний кадр движения рисуется ВСЕГДА (force): иначе хвост
        // застывал бы чуть-чуть не там, где его отпустили.
        const now = performance.now();
        if (!force && this._tailTs && now - this._tailTs < 33) return;
        this._tailTs = now;
        this._tailKey = key;
        // Ни одного поворота: группа только переносится, а гнётся сама фигура.
        g.setAttribute('transform', `translate(${A.tail.x} ${A.tail.y})`);
        const d = BATH_ART.tailD(this.bend, this.tailGrow());
        this.el('bt-tail-body').setAttribute('d', d.body);
        // Налив меняет тон (BATH_ART.CHARGE_TONE). Перекраска — ступенями по
        // двадцатой доле: глаз разницы не видит, а записей в дерево в
        // десятки раз меньше, чем если красить каждый кадр.
        const toneKey = Math.round(this.charge * 20);
        if (toneKey !== this._toneKey) {
            this._toneKey = toneKey;
            BATH_ART.paintTail(BATH_ART.tailTone(this.tailModel, this.skinSat, toneKey / 20));
        }
        const edge = this.el('bt-tail-edge');
        if (edge) edge.setAttribute('d', d.body);
        // Звенья, головка, тень под венчиком и блик — из того же контура.
        const P = BATH_ART.tailPieces(d.curve, this.tailGrow()), f1 = (v) => v.toFixed(1);
        P.segs.forEach((sd, i) => { const e = this.el(`bt-tail-seg-${i}`); if (e) e.setAttribute('d', sd); });
        const gl = this.el('bt-tail-glans');
        if (gl) gl.setAttribute('d', P.glans);
        const cl = this.el('bt-tail-clit');
        if (cl) cl.setAttribute('d', P.clit);
        const wr = this.el('bt-tail-wrinkle');
        if (wr) wr.setAttribute('d', P.wrinkles);
        for (const [id, k] of [['bt-tail-vein-sh', 'veinSh'], ['bt-tail-vein', 'vein'], ['bt-tail-vein-hi', 'veinHi']]) {
            const e = this.el(id);
            if (e) e.setAttribute('d', P[k]);
        }
        P.creases.forEach((c, i) => {
            const a = this.el(`bt-tail-cr-${i}`), b = this.el(`bt-tail-crl-${i}`);
            if (a) { a.setAttribute('d', c.d); a.setAttribute('stroke-opacity', (0.3 * c.k).toFixed(3)); }
            if (b) { b.setAttribute('d', c.d); b.setAttribute('stroke-opacity', (0.55 * c.k).toFixed(3)); }
        });
        for (const [id, k] of [['bt-tail-sheen', 'sheen'], ['bt-tail-shine', 'shine'], ['bt-tail-stretch', 'stretch'],
                               ['bt-tail-gwet', 'gwet'], ['bt-tail-grim', 'grim'], ['bt-tail-gspark', 'spark']]) {
            const e = this.el(id);
            if (e) e.setAttribute('d', P.lights[k]);
        }
        if (P.piercing) {
            const Pc = P.piercing;
            for (const [id, k] of [['bt-tail-ring-back', 'back'], ['bt-tail-ring-back-m', 'back'], ['bt-tail-ring', 'front'],
                                   ['bt-tail-ring-m', 'front'], ['bt-tail-ring-hi', 'front'], ['bt-tail-holes', 'holes']]) {
                const e = this.el(id);
                if (e) e.setAttribute('d', Pc[k]);
            }
            const b = this.el('bt-tail-bead');
            if (b) { b.setAttribute('cx', f1(Pc.bead.x)); b.setAttribute('cy', f1(Pc.bead.y)); b.setAttribute('r', f1(Pc.bead.r)); }
        }
        if (P.legend) {
            const Lg = P.legend;
            for (const [id, k] of [['bt-tail-sweep', 'sweep'], ['bt-tail-glow', 'glow'], ['bt-tail-stars', 'stars']]) {
                const e = this.el(id);
                if (e) e.setAttribute('d', Lg[k]);
            }
            const h = this.el('bt-tail-halo');
            if (h) {
                h.setAttribute('rx', f1(Lg.halo.rx)); h.setAttribute('ry', f1(Lg.halo.ry));
                h.setAttribute('transform', `translate(${f1(Lg.halo.x)} ${f1(Lg.halo.y)}) rotate(${f1(Lg.halo.deg)})`);
            }
        }
        for (const [id, q] of [['bt-tail-neck', P.neck]]) {
            const e = this.el(id);
            if (!e) continue;
            e.setAttribute('rx', f1(q.rx)); e.setAttribute('ry', f1(q.ry));
            e.setAttribute('transform', `translate(${f1(q.x)} ${f1(q.y)}) rotate(${f1(q.deg)})`);
        }
        // Прилипшее к хвосту едет вместе с ним.
        if (typeof LustGoo !== 'undefined') LustGoo.drawTail(force);
    },

    // ---------- ПУЗЫРИ ----------
    // Пена налипла на хвост ГУСТО и разным калибром: одинаковые кружки в ряд
    // складываются в бусы, а не в пену. Доля возводится в степень, поэтому
    // мелких много, крупных единицы.
    //
    // ---------- ГОРКА ЛОПАЕТСЯ ГРУППАМИ ----------
    // Тап в любое место горки лопает целую группу — верхнюю из оставшихся,
    // в обратном порядке появления — и смывает с тела кусок пены (washChunk):
    // сколько групп, столько кусков (foamGroups). Правило «щелчок — само
    // удовольствие» не отменено, а умножено: за щелчок лопается не один
    // пузырь, а кучка. Горка уже стоит полная — новых пузырей не появляется.
    startPop() {
        this.phase = 'pop';
        this._glintTop = null;
        if (!this.pile) this.buildPile();
        const H = this.pile;
        if (H) { H.shown = H.N; H.fade = 1; this.pileDraw(); }
        this.washChunks();
        this.ripeArm();
    },

    pop(p) {
        const H = this.pile;
        if (!H || !this.pileHit(p)) return;
        H.alive--;
        this.pileDraw();
        this.pileBurst(H.alive);
        this.washChunk(null);
        if (!H.alive) {
            // Хвостом можно браться, даже пока последний кусок пены ещё
            // сползает с морды: тело для учёта уже чистое.
            while (this.washLeft()) this.washChunk(null);
            this.startRub();
        }
    },

    // ---------- КАК ЛОПАЕТСЯ ГРУППА ----------
    // Группа уходит с горки сразу (pileDraw её больше не кладёт), а её
    // картинка остаётся на своём маленьком холсте поверх горки и лопается
    // каскадом сверху вниз: на месте каждого пузыря — тонкое кольцо, которое
    // раздаётся и гаснет, у крупных ещё брызги, падающие вниз. Лопнувший
    // пузырь вырезается из картинки. Холст живёт полсекунды и выбрасывается
    // (docs/traps.md, п. 152); рисует только он сам, горка и тело не
    // перерисовываются ни разу. Таймер — анимация, не состояние (инвариант 1).
    pileBurst(g) {
        const H = this.pile, G = H && H.groups[g], B = BATH_ART.BURST;
        const host = this.el('bt-pile'), after = this.el('bt-pile-glint');
        if (!G || !G.cv || !G.bubs || !host || !after || !after.parentNode) return;
        const R = H.R, cell = H.cell, m = Math.ceil(cell * 3);
        const x0 = Math.max(0, G.x - m), y0 = Math.max(0, G.y - m);
        const w = Math.min(H.pw, G.x + G.cv.width + m) - x0, h = Math.min(H.ph, G.y + G.cv.height + m * 2) - y0;
        if (!(w > 0 && h > 0)) return;
        const cv = document.createElement('canvas'), rest = document.createElement('canvas');
        cv.width = rest.width = w; cv.height = rest.height = h;
        const ctx = cv.getContext('2d'), rc = rest.getContext('2d');
        rc.drawImage(G.cv, G.x - x0, G.y - y0);
        rc.globalCompositeOperation = 'destination-out';
        cv.className = 'bt-lather';
        cv.style.width = (w / R) + 'px';
        cv.style.height = (h / R) + 'px';
        cv.style.transform = `${host.style.transform} translate(${(x0 / R).toFixed(2)}px, ${(y0 / R).toFixed(2)}px)`;
        after.parentNode.insertBefore(cv, after.nextSibling);
        (this._bursts = this._bursts || []).push(cv);
        // Пузыри: когда лопается (верхний раньше), и брызги крупных.
        const col = BATH_ART.latherColors(H.look, H.kind), rng = btRng(g * 97 + 13);
        const bs = G.bubs, n = bs.length / 3;
        let yMin = Infinity, yMax = -Infinity;
        for (let i = 0; i < n; i++) { yMin = Math.min(yMin, bs[i * 3 + 1]); yMax = Math.max(yMax, bs[i * 3 + 1]); }
        const span = Math.max(1, yMax - yMin), list = [];
        for (let i = 0; i < n; i++) {
            const x = bs[i * 3] - x0, y = bs[i * 3 + 1] - y0, r = bs[i * 3 + 2];
            const at = (bs[i * 3 + 1] - yMin) / span * B.spread * 0.75 + rng() * B.spread * 0.25;
            const spl = [];
            if (r >= cell * B.drop) for (let k = 2 + (rng() < 0.5 ? 1 : 0); k > 0; k--) {
                const a = -Math.PI * (0.1 + 0.8 * rng()) + (rng() < 0.3 ? Math.PI * 0.6 : 0);
                spl.push({ dx: Math.cos(a), dy: Math.sin(a), d: r * (0.9 + 0.8 * rng()), s: Math.max(0.6 * R, r * (0.1 + 0.06 * rng())) });
            }
            list.push({ x, y, r, at, cut: false, spl });
        }
        const t0 = performance.now(), end = B.spread + Math.max(B.ring, B.fly);
        const step = () => {
            if (!cv.isConnected) return;
            const t = performance.now() - t0;
            ctx.clearRect(0, 0, w, h);
            for (const q of list) if (!q.cut && t >= q.at) {
                q.cut = true;
                rc.beginPath(); rc.arc(q.x, q.y, q.r * 1.08, 0, Math.PI * 2); rc.fill();
            }
            ctx.globalAlpha = 1;
            ctx.drawImage(rest, 0, 0);
            ctx.strokeStyle = col.hi; ctx.fillStyle = col.hi;
            for (const q of list) {
                const u = (t - q.at) / B.ring;
                if (u >= 0 && u < 1 && q.r >= cell * B.min) {
                    const e = 1 - (1 - u) * (1 - u);
                    ctx.globalAlpha = 0.85 * (1 - u) * (1 - u);
                    ctx.lineWidth = Math.max(0.5 * R, q.r * 0.16 * (1 - u));
                    ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (1 + B.grow * e), 0, Math.PI * 2); ctx.stroke();
                }
                const v = (t - q.at) / B.fly;
                if (v >= 0 && v < 1) for (const s of q.spl) {
                    ctx.globalAlpha = 1 - v;
                    const d = s.d * (1 - (1 - v) * (1 - v)), fall = cell * 1.6 * v * v;
                    ctx.beginPath(); ctx.arc(q.x + s.dx * (q.r + d), q.y + s.dy * (q.r + d) + fall, s.s * (1 - 0.4 * v), 0, Math.PI * 2); ctx.fill();
                }
            }
            if (t < end) { requestAnimationFrame(step); return; }
            cv.remove();
            if (this._bursts) this._bursts = this._bursts.filter(k => k !== cv);
        };
        requestAnimationFrame(step);
    },
});
