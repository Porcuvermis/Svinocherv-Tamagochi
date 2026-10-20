// ================= ПОХОТЬ: МЫТЬЁ =================
// Маска силуэта, покрытие пеной, след на холсте, ввод пальцем, этапы мытья
// (кран → мыло → мочалка), подсказка «где не домыли».
// Продолжение LustMinigame (lust.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после lust.js.
Object.assign(LustMinigame, {

    // ---------- МАСКА СИЛУЭТА ----------
    // Мыло обязано ложиться НА ЧЕРВЯ, а не на воду вокруг него. Силуэт для
    // этого берётся у самого нарисованного персонажа: его svg переводится в
    // картинку и растрируется один раз. Подбирать силуэт числами нельзя —
    // червь меняется отметинами, животом и будущим взрослением.
    //
    // Альфа приводится к ДВУМ значениям, 0 или 255: маска накладывается на
    // каждый мазок, и полупрозрачная кромка от повторов таяла бы, обгрызая
    // пену по краю тела.
    buildMask() {
        const root = this.wormHandle && this.wormHandle.svgRoot;
        if (!root) return;
        const B = this.WORM_BASE, S = this.MASK_SCALE, box = this.wormBoxScene();
        const copy = root.cloneNode(true);
        copy.setAttribute('width', B.w);
        copy.setAttribute('height', B.h);
        copy.setAttribute('viewBox', `0 0 ${B.w} ${B.h}`);
        // Всё красится в ПЛОСКИЙ чёрный, снимаются фильтры и прозрачности —
        // маске нужен один силуэт.
        //
        // А вот ОБРЕЗКИ СНИМАТЬ НЕЛЬЗЯ. Раньше снимались вместе со всем
        // остальным, и маска выходила ЗАМЕТНО БОЛЬШЕ червя: анатомические
        // слои сегментов обрезаны по своей форме, и без обрезки они
        // расползались за тело — из-под живота вылезал прямой косой клин, по
        // которому мыло ложилось на пустую плитку. Ссылки url(#...)
        // разрешаются: клонируется весь корень вместе с defs.
        //
        // Убирается только display:none — им спрятаны утопленные части
        // (opts.endAtBelly), и в маске их быть не должно тем более.
        const all = copy.querySelectorAll('*');
        for (const n of all) {
            const tag = n.tagName.toLowerCase();
            if (tag === 'filter') { n.remove(); continue; }
            if (n.closest('defs') || n.closest('clipPath')) continue;
            n.removeAttribute('mask');
            n.removeAttribute('filter');
            n.removeAttribute('style');
            n.removeAttribute('opacity');
            n.removeAttribute('fill-opacity');
            n.removeAttribute('stroke-opacity');
            if (n.hasAttribute('fill') || tag !== 'g') n.setAttribute('fill', '#000');
            if (n.hasAttribute('stroke')) n.setAttribute('stroke', '#000');
        }
        // Рамка габарита (opts.endAtBelly) после перекраски стала бы чёрным
        // прямоугольником во всю маску.
        for (const n of copy.querySelectorAll('.worm-extent')) n.remove();
        // Спрятанное остаётся спрятанным: style снят выше со всех, поэтому
        // прячем заново уже в клоне.
        for (const n of copy.querySelectorAll('[data-part]')) {
            const q = n.getAttribute('data-part') || '';
            if (q === 'tail' || q.indexOf('growing-') === 0)
                n.setAttribute('display', 'none');
        }
        const svg = new XMLSerializer().serializeToString(copy);
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = B.w * S; c.height = B.h * S;
            const g = c.getContext('2d');
            g.drawImage(img, 0, 0, c.width, c.height);
            try {
                const d = g.getImageData(0, 0, c.width, c.height);
                for (let i = 3; i < d.data.length; i += 4)
                    d.data[i] = d.data[i] > 24 ? 255 : 0;
                g.putImageData(d, 0, 0);
            } catch (e) { /* холст запачкан — сойдёт и мягкая кромка */ }
            // Ниже борта червя НЕ ВИДНО — там и мылить нечего. Линия берётся
            // у дальней половины чаши: ровно она его и закрывает. Раньше
            // стояла доля от холста персонажа, и клетки под бортом считались
            // «на теле»: игрок тёр видимое, а этап требовал невидимого.
            const cut = (this.visibleLine() - box.y) * (B.h / box.h) * S;
            g.clearRect(0, Math.max(0, cut), c.width, c.height);
            this.mask = c;
            // Альфа маски снимается ОДИН РАЗ и живёт рядом: по ней потом
            // проверяется, стоит ли центр пузыря на теле. Маска за этап не
            // меняется, а getImageData на каждую перерисовку следа — это
            // мегабайт чтения по десятку раз в секунду.
            this.maskAlpha = null;
            try {
                const d = g.getImageData(0, 0, c.width, c.height).data;
                const a = new Uint8Array(c.width * c.height);
                for (let i = 0, j = 0; j < a.length; i += 4, j++) a[j] = d[i + 3];
                this.maskAlpha = a;
            } catch (e) { /* холст запачкан — обойдёмся без проверки */ }
            // Коробка покрытия выводится ИЗ МАСКИ, значит её кэш обязан
            // сброситься здесь: до этой строки маски не было и коробка
            // считалась по запасному варианту.
            this._cover = null;
            this.maskReady();
        };
        img.onerror = () => {
            this.mask = null; this.maskAlpha = null; this._cover = null;
        };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    },

    // Маска снята (асинхронно, картинкой) — выращенное строится заново по
    // новому телу, и то, что успели натереть до этого, дорастает сразу.
    maskReady() {
        this._grows = null;
        this._eyes = null;
        // Карты роста и нарезка пены на куски — сразу, пока ванная только
        // открылась: первым касанием мыла они стоили бы заметную заминку
        // (две карты и нарезка — десятки миллисекунд).
        if (this.phase === 'idle') { this.growField('soap'); this.washChunks(); }
        if (this.phase === 'soap') this.growTo('soap', this.rub);
        else if (this.phase === 'cloth') { this.growTo('soap', 1); this.growTo('cloth', this.rub); }
    },

    // ---------- ПОКРЫТИЕ ----------
    // Клетки лежат на самом ЧЕРВЕ, а не на воде под ним. Первый вариант
    // считал покрытие по габариту воды: мазки по пустой воде рядом с телом
    // засчитывались, и пена оставалась там же — мыли ванну, а не червя.
    //
    // Габарит берётся у НАРИСОВАННОГО персонажа, а не подбирается числом:
    // единицы его холста переводятся в сцену тем же множителем, что и в
    // layoutWorm.
    // Габарит СИЛУЭТА — прямо по маске, а не по коробке червя с поджатием.
    // Поджатие было подобранным числом (семь процентов по бокам, вдвое
    // сверху) и врало: уши и макушка оказывались ВНЕ коробки, и мыло на них
    // не ложилось вовсе, а снизу коробка уходила на семь десятков единиц
    // ниже силуэта — там мылить было нечего, но клетки считались. Из ста
    // клеток сетки на теле оказывалось сорок.
    maskBounds() {
        if (!this.mask) return null;
        const box = this.wormBoxScene(), B = this.WORM_BASE, S = this.MASK_SCALE;
        let d;
        try {
            d = this.mask.getContext('2d')
                .getImageData(0, 0, this.mask.width, this.mask.height).data;
        } catch (e) { return null; }
        const W = this.mask.width, H = this.mask.height;
        let x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) {
            const row = y * W * 4;
            for (let x = 0; x < W; x++) {
                if (!d[row + x * 4 + 3]) continue;
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
        if (x1 < 0) return null;
        const k = box.w / (B.w * S);          // пиксель маски → единица сцены
        return { x: box.x + x0 * k, y: box.y + y0 * k,
                 w: (x1 - x0 + 1) * k, h: (y1 - y0 + 1) * k };
    },

    coverBox() {
        if (this._cover) return this._cover;
        this._cover = this.maskBounds()
            || BATH_ART.box('tub') || { x: 100, y: 600, w: 500, h: 150 };
        return this._cover;
    },

    resetCover() {
        this.rub = 0;
        this.rubLast = null;
    },

    // ---------- ТРЕНИЕ ----------
    // Мытьё — время трения по телу (решение игрока): где тереть, не важно,
    // важно СКОЛЬКО. Так и у мыла, и у мочалки. Засчитывается ТОЛЬКО живой
    // палец: сюда приходят лишь движения указателя с инструментом в руке, а
    // оставленная на черве вещь (парит, loose) пальцем не ведётся и ничего
    // не натирает сама.
    //
    // p — точка касания в сцене (там, где пузо инструмента, а не палец),
    // t — время события, мс. Засчитывается путь по телу, но не больше
    // speed·dt, а dt одного события — не больше step: быстрее ступени этап
    // не пройти, а рывок после паузы трением не считается.
    // (rubMove — другое: это трение хвоста в финале.)
    soapRub(p, t, kind) {
        const last = this.rubLast;
        const on = this.onBody(p);
        this.rubLast = { x: p.x, y: p.y, t, on };
        if (!last || !on || !last.on) return 0;
        const R = this.cfg().rub || { speed: 220, step: 0.1 };
        const dt = Math.min(R.step, Math.max(0, (t - last.t) / 1000));
        const d = Math.min(Math.hypot(p.x - last.x, p.y - last.y), R.speed * dt);
        if (d <= 0) return 0;
        this.rub = Math.min(1, this.rub + d / (R.speed * this.stageRub(kind)));
        return d;
    },

    // Лежит ли точка сцены на теле — по той же маске, что режет муть.
    onBody(p) {
        const A = this.maskAlpha;
        if (!A || !this.mask) return true;          // маски нет — не мешаем мыть
        const box = this.wormBoxScene(), B = this.WORM_BASE, S = this.MASK_SCALE;
        const k = B.w / box.w * S, W = this.mask.width, H = this.mask.height;
        const i = Math.round((p.x - box.x) * k), j = Math.round((p.y - box.y) * k);
        return i >= 0 && j >= 0 && i < W && j < H && A[j * W + i] > 0;
    },

    // ---------- СЛЕД НА ХОЛСТЕ ----------
    // Видимый холст мытья — пузыри мути и пены (не обрезаны: выпуклые, у
    // края тела торчат наружу). Сами плёнки — своими холстами ПОД ним
    // (filmLayer): пена мочалки ложится поверх мути — тем и видно, где уже
    // оттёрто.
    composeWash() {
        const ctx = this.washCtx;
        if (!ctx) return;
        this._washOk = true;
        const W = ctx.canvas.width, H = ctx.canvas.height, g = this._grows || {};
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, W, H);
        // Сборка — только сложение готовых слоёв: растворение у глаз и
        // силуэт уже лежат на плёнке (growTo). Сборка идёт на каждое движение
        // пальца, и каждый лишний проход по всему холсту здесь — это кадры
        // (на волшебном мыле их съедало видно глазу).
        // Муть — не здесь: у неё свои холсты на странице (filmLayer).
        // Пена каждого вида лежит КУСКАМИ (washChunks): кусок — свой
        // холст по своей рамке. Смытый кусок просто не кладётся.
        const gone = this._chunks && this._chunks.gone;
        for (const k of ['soap', 'cloth']) if (g[k] && g[k].p > 0)
            for (const P of g[k].parts) if (P && P.cv && !(gone && gone[P.ch])) ctx.drawImage(P.cv, P.x, P.y);
    },

    // ---------- РОСТ ПЕНЫ ПО ЗАГОТОВКЕ (lather-grow.js) ----------
    // Карта времени строится один раз на маску тела и вид мути; дальше
    // показ этапа p — это дорисовка частиц, чьё время пришло. Плёнка и
    // пузыри копятся на СВОИХ холстах: плёнку режет силуэт (она на коже),
    // пузыри — нет (выпуклые, у края тела торчат наружу); видимый холст мытья
    // — их сумма.
    growth(kind) {
        if (!this.mask || !this.maskAlpha || !this.washCtx) return null;
        // Вид — по ступени мыла у обоих: пена мочалки взбита из того же мыла
        // (цвет и эффекты его), громкость у мути и пены разная (latherLook).
        let look = BATH_ART.latherLook(null, kind);
        // Пене мочалки — ещё и вид ступени мочалки (густота и объём).
        if (kind === 'cloth') look = Object.assign({}, look, { foam: BATH_ART.foamLook() });
        const key = kind + '|' + look.key + (look.foam ? '|f' + look.foam.i : '');
        this._grows = this._grows || {};
        const G0 = this._grows[kind];
        if (G0 && G0.mask === this.mask && G0.key === key) return G0;
        const conf = BATH_ART.LATHER_GROW[kind] || BATH_ART.LATHER_GROW.soap;
        const W = this.mask.width, H = this.mask.height;
        const F = this.growField(kind);
        if (!F) return null;
        // Куски, которыми пена потом сойдёт (washChunks), — по карте
        // мочалки. Нужны уже на мыле: пузырь мути уходит с тем куском, на
        // котором лежит, а помечается он при рождении.
        const CH = this.washChunks();
        // Клетка пены — та же величина, что у прежней сетки: виды мути
        // подобраны под неё (BATH_ART.LATHER).
        const box = this.wormBoxScene(), B = this.WORM_BASE, S = this.MASK_SCALE;
        const b = this.coverBox(), Gd = this.grid();
        const cell = Math.max(b.w / Gd.nx, b.h / Gd.ny) * 0.78 * (B.w / box.w * S);
        const A = this.maskAlpha;
        const G = {
            mask: this.mask, key, kind, look, F, cell, film: this.filmLayer(F, look, kind, cell), parts: [], idx: 0, p: 0,
            sprites: LatherGrow.sprites(F, cell, { seed: conf.seed * 31 + 5, whip: kind === 'cloth' }),
            // Пузырь садится только на тело и НЕ на глаз: пузырь с центром
            // на глазу не рождается вовсе, как лопнутый пальцем. Соседние
            // целые — и краем заходят на глаз (ГЛАЗА ЧИСТЫЕ, ниже).
            inside: (px, py) => {
                const i = Math.round(px), j = Math.round(py);
                return i >= 0 && j >= 0 && i < W && j < H && A[j * W + i] > 0 && !this.onEye(px, py);
            }
        };
        // Край ТЕЛА — без глаз. Ореол светящейся мути ищет кромку силуэта, и
        // с глазом в «не теле» пузыри вокруг глаза считали его краем и
        // светили ореолом прямо на глаз — белёсая вуаль на глазах эликсира.
        G.inside.body = (px, py) => {
            const i = Math.round(px), j = Math.round(py);
            return i >= 0 && j >= 0 && i < W && j < H && A[j * W + i] > 0;
        };
        if (CH) for (const sp of G.sprites) sp.ch = LatherGrow.chunkAt(CH, sp.x, sp.y);
        else for (const sp of G.sprites) sp.ch = 0;
        this._grows[kind] = G;
        this._washOk = false;
        return G;
    },

    // Карта роста — одна на маску тела и вид: её спрашивают и рост пены, и
    // нарезка на куски (washChunks).
    growField(kind) {
        const f = this._fields = (this._fields && this._fields.mask === this.mask) ? this._fields : { mask: this.mask };
        if (f[kind]) return f[kind];
        const conf = BATH_ART.LATHER_GROW[kind] || BATH_ART.LATHER_GROW.soap;
        return (f[kind] = LatherGrow.field(this.maskAlpha, this.mask.width, this.mask.height, conf.seeds,
                                           { seed: conf.seed, noise: conf.noise, speed: conf.speed,
                                             fine: conf.fine, fineGrain: conf.fineGrain }));
    },

    // Холст куска пены вида G. Пузыри копятся НЕ на одном холсте вида, а
    // по кускам — каждый кусок на своём, по рамке куска с запасом на
    // пузыри, вылезающие за его край. Так смыть кусок — это не перерисовать
    // тело (на волшебном мыле с густой мочалкой это тысячи пузырей:
    // 40–100 мс на компьютере за тап), а просто его больше не класть
    // (composeWash), а сползающему куску — взять готовую картинку.
    partCtx(G, ch) {
        const P = G.parts[ch] || (G.parts[ch] = { ch, cv: null });
        if (!P.cv) {
            const C = this._chunks, W = this.mask.width, H = this.mask.height, m = Math.ceil(2.5 * G.cell);
            const r = C && C.rect && C.rect[ch] ? C.rect[ch] : { x0: 0, y0: 0, x1: W, y1: H };
            P.x = Math.max(0, r.x0 - m); P.y = Math.max(0, r.y0 - m);
            const cv = document.createElement('canvas');
            cv.width = Math.min(W, r.x1 + m) - P.x; cv.height = Math.min(H, r.y1 + m) - P.y;
            P.cv = cv;
            P.ctx = cv.getContext('2d');
            P.ctx.setTransform(1, 0, 0, 1, -P.x, -P.y);
        }
        return P.ctx;
    },

    // ---------- ПЕНА СХОДИТ С ТЕЛА КУСКАМИ ----------
    // После мочалки пена НЕ гаснет разом (docs/plan/21-lust-bath.md, 5г):
    // каждый тап смывает с тела 1/N — цельный кусок, муть и пузыри вместе,
    // и он сползает вниз и тает. Куски нарезаны по карте роста мочалки
    // (LatherGrow.chunks): это те же пятна, которыми пена появлялась.
    // N — ECONOMY.minigames.lust.foamGroups, столько же, сколько групп у
    // горки над хвостом: тап по горке лопает группу и смывает кусок.
    washChunks() {
        if (this._chunks && this._chunks.mask === this.mask) return this._chunks;
        const F = this.mask && this.maskAlpha ? this.growField('cloth') : null;
        if (!F) return null;
        const C = LatherGrow.chunks(F, this.foamGroups());
        C.mask = this.mask;
        // Кусок на каждую клетку карты, включая краевые (центр мимо тела,
        // а муть в них есть): по ним гасится муть (filmPaint).
        C.cell = new Int16Array(C.gw * C.gh);
        for (let k = 0; k < C.cell.length; k++)
            C.cell[k] = LatherGrow.chunkAt(C, (k % C.gw) * C.S + C.S / 2, ((k / C.gw) | 0) * C.S + C.S / 2);
        C.gone = new Uint8Array(C.n);
        // Рамка каждого куска в точках холста мытья — по ней его холсты
        // (partCtx).
        C.rect = Array.from({ length: C.n }, () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }));
        for (let k = 0; k < C.lab.length; k++) {
            const l = C.lab[k];
            if (l < 0) continue;
            const r = C.rect[l], x = (k % C.gw) * C.S, y = ((k / C.gw) | 0) * C.S;
            r.x0 = Math.min(r.x0, x); r.y0 = Math.min(r.y0, y);
            r.x1 = Math.max(r.x1, x + C.S); r.y1 = Math.max(r.y1, y + C.S);
        }
        return (this._chunks = C);
    },

    foamGroups() { return Math.max(1, this.cfg().foamGroups || 10); },

    // ---------- КУСКИ ПЕНЫ ПРОГРЕВАЮТСЯ ЗАРАНЕЕ ----------
    // Холст браузер растрирует не в момент рисования, а когда картинку
    // спросили: до того он копит команды. Видимый холст мытья спрашивают
    // каждый кадр, а холсты кусков — впервые на первом тапе по пене, и
    // этот тап платил разом за всю пену этапа (замер на волшебном мыле с
    // густой мочалкой: 120 мс на компьютере). Поэтому, пока мочалка летит
    // на полку, куски спрашиваются по одному за кадр.
    warmParts() {
        const g = this._grows || {}, q = [];
        for (const k of ['soap', 'cloth']) if (g[k]) for (const P of g[k].parts) if (P && P.cv) q.push(P.cv);
        const sink = this._warmCv || (this._warmCv = document.createElement('canvas'));
        sink.width = sink.height = 1;
        const sc = sink.getContext('2d');
        cancelAnimationFrame(this.warmRaf || 0);
        const step = () => {
            const cv = q.shift();
            if (!cv) { this.warmRaf = 0; return; }
            sc.drawImage(cv, 0, 0, 1, 1);
            this.warmRaf = requestAnimationFrame(step);
        };
        this.warmRaf = requestAnimationFrame(step);
    },

    // ---------- ГЛАЗА ЧИСТЫЕ ----------
    // Пены на глазах нет (просьба игрока), и сделано это РАЗНО для плёнки и
    // для пузырей — по тому, как ведёт себя настоящая пена:
    //   * пузырь, чей центр на глазу, не рождается вовсе — будто его лопнули
    //     пальцем (growth, inside). Соседние целые и краем заходят на глаз;
    //   * плёнка тает С ЗАПАСОМ до глаза и к краю глаза уже прозрачна; место
    //     таяния прикрыто соседними пузырями, и перехода не видно.
    // Два провала до этого. Стирание всего подряд мягким кругом давало
    // полупрозрачные огрызки пузырей — «аномалию прозрачности». Вырез плёнки
    // ровно по глазу читался вырезом, а мыло так не выглядит.
    // Глаза снимаются с НАРИСОВАННОГО червя (части eye-left / eye-right),
    // по экранным рамкам: они верны и на айфоне, где getScreenCTM врёт, и
    // не зависят от масштаба слоя червя — берётся доля от рамки его холста.
    // Ответ — в пикселях холста мытья.
    // В радиусах глаза: до inner плёнки нет, к outer она полная; между —
    // плавная ступенька (smoothstep), без излома на обоих краях. inner
    // больше единицы: плёнка кончается, НЕ ДОХОДЯ до глаза.
    EYE_CLEAR: { inner: 1.12, outer: 1.8 },

    // Лежит ли точка холста мытья на глазном яблоке.
    onEye(x, y) {
        for (const e of this.eyeSpots()) {
            const dx = (x - e.x) / e.rx, dy = (y - e.y) / e.ry;
            if (dx * dx + dy * dy <= 1) return true;
        }
        return false;
    },

    eyeSpots() {
        if (this._eyes) return this._eyes;
        const root = this.wormHandle && this.wormHandle.svgRoot;
        if (!root) return [];
        const rr = root.getBoundingClientRect();
        if (!rr.width) return [];
        const B = this.WORM_BASE, S = this.MASK_SCALE, k = B.w / rr.width * S;
        const out = [];
        for (const part of root.querySelectorAll('[data-part="eye-left"], [data-part="eye-right"]')) {
            // Мерится САМО ГЛАЗНОЕ ЯБЛОКО — крупнейший эллипс прямо в части
            // глаза. Рамка всей части втрое выше глаза: в неё входят веко,
            // складка улыбки под глазом и бровь, и по ней стиралась вся
            // середина морды до пятачка.
            let el = part, best = 0;
            for (const c of part.children) {
                if (c.tagName.toLowerCase() !== 'ellipse') continue;
                const b = c.getBoundingClientRect();
                if (b.width * b.height > best) { best = b.width * b.height; el = c; }
            }
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            out.push({ x: (r.left + r.width / 2 - rr.left) * k, y: (r.top + r.height / 2 - rr.top) * k,
                       rx: r.width / 2 * k, ry: r.height / 2 * k });
        }
        this._eyes = out;
        return out;
    },

    // Новый забег: выращенное стирается, карты остаются (тело то же).
    growReset() {
        this.glintClear();
        this._washOk = false;
        if (this._chunks) this._chunks.gone.fill(0);
        this.sloughClear();
        for (const G of Object.values(this._grows || {})) {
            // Холсты кусков выбрасываются: они создаются заново, когда в
            // кусок придёт первый пузырь.
            G.parts = [];
            G.idx = 0;
            G.p = 0;
            this.filmUpdate(G, 0, true);
        }
    },

    // Показать этап p ∈ [0, 1]. Назад — только сбросом (рост монотонный).
    // Муть — одним слоем по карте времени (filmUpdate), пузыри и мелочь
    // поверх неё — частицами, чьё время пришло.
    growTo(kind, p) {
        const G = this.growth(kind);
        if (!G) return;
        if (p < G.p) {
            G.parts = [];
            G.idx = 0;
            this._washOk = false;
        }
        G.p = p;
        let foam = false;
        const tool = kind === 'cloth' ? 'cloth' : 'soap';
        const sink = (bx, by, r, pc) => this.glintBubble(G, bx, by, r, pc);
        // Пока пена только РАСТЁТ, новые пузыри дорисовываются прямо на
        // видимый холст мытья поверх уже нарисованного — «поверх» в холсте
        // сочетательно, картинка та же, что у полной сборки. Полная сборка
        // (очистка и оба слоя пены целиком) была на каждом шаге роста и на
        // мочалке ступени 8 стоила 51 мс/с под 4× замедлением. Теперь она
        // только после сброса. Мыло дорисовывать поверх уже лежащей пены
        // мочалки нельзя — оно легло бы сверху; такой случай собирается
        // целиком.
        const g = this._grows || {}, wc = this.washCtx;
        const append = this._washOk && wc && (kind === 'cloth' || !(g.cloth && g.cloth.p > 0));
        while (G.idx < G.sprites.length && G.sprites[G.idx].t <= p) {
            const s = G.sprites[G.idx++];
            foam = true;
            const k = s.k == null ? 1 : s.k, bub = s.part === 'foam';
            this._sinkCh = s.ch;
            BATH_ART.washCell(this.partCtx(G, s.ch), tool, s.x, s.y, G.cell, k, s.seed, s.part, G.inside, G.look, bub ? sink : null);
            if (append) BATH_ART.washCell(wc, tool, s.x, s.y, G.cell, k, s.seed, s.part, G.inside, G.look, bub ? this._noSink : null);
        }
        this._sinkCh = undefined;
        this.filmUpdate(G, p);
        if (foam) this.glintStart();
        if (!append && (foam || !this._washOk)) this.composeWash();
    },
    // Вторая дорисовка того же пузыря на видимый холст: блик ему уже выдан.
    _noSink() {},

    // ---------- МУТЬ ОДНИМ СЛОЕМ ----------
    // Муть не накладывается кружками, а РАЗЛИВАЕТСЯ: из нескольких очагов
    // (семена карты роста) одним слоем, неровным краем, как колония в
    // пробирке или вода при разливе с высоты, пока не зальёт весь силуэт
    // (замечание игрока: стопка полупрозрачных кружков читалась дёшево).
    // Карта времени уже есть — клетка заливается, когда её τ пришло.
    //
    // Как дёшево: картинка — по пикселю на клетку карты (120×160), цвет и
    // густота каждой клетки считаются ОДИН раз (BATH_ART.filmCell), а шаг
    // роста меняет только прозрачность и кладёт картинку целиком
    // (putImageData маленького холста). Холст — свой на странице, и на
    // экран его растягивает видеокарта со сглаживанием: край мягкий без
    // единого градиента, а холст мытья не пересобирается. Первая версия
    // рисовала слой В холст мытья — и пересобирала его на каждое движение
    // пальца: кадров вышло меньше, чем у кружков (замер, 4× замедление).
    //
    // Силуэт — долей тела в клетке (крайние клетки полупрозрачны),
    // глаза — растворением с запасом (EYE_CLEAR): всё это множитель густоты
    // клетки, считается один раз, ничего не копится.
    FILM_EDGE: 0.012,        // ширина мягкого края разлива, в долях этапа
    filmLayer(F, look, kind, cell) {
        const S = F.S, gw = F.gw, gh = F.gh, A = this.maskAlpha, W = F.W, H = F.H;
        const eyes = kind === 'soap' || kind === 'cloth' ? this.eyeSpots() : [], E = this.EYE_CLEAR;
        const col = new Uint8ClampedArray(gw * gh * 3);
        const cells = [], tau = new Float32Array(gw * gh), dens = new Float32Array(gw * gh);
        const at = (i, j) => (i >= 0 && j >= 0 && i < gw && j < gh && F.inside[j * gw + i]) ? F.tau[j * gw + i] : Infinity;
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
            const k = j * gw + i;
            // Доля тела в клетке — по 4×4 точкам маски: край силуэта мягкий,
            // а не ступеньками клеток.
            let inn = 0;
            for (let v = 0; v < 4; v++) for (let u = 0; u < 4; u++) {
                const px = Math.min(W - 1, i * S + ((u + 0.5) * S >> 2)), py = Math.min(H - 1, j * S + ((v + 0.5) * S >> 2));
                if (A[py * W + px]) inn++;
            }
            if (!inn) continue;
            // Время клетки на краю, чей центр мимо тела, — у соседа на теле.
            let t = at(i, j);
            if (t === Infinity) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) t = Math.min(t, at(i + di, j + dj));
            if (t === Infinity) continue;
            const x = i * S + S / 2, y = j * S + S / 2;
            let fe = 1;
            for (const e of eyes) {
                const q = Math.hypot((x - e.x) / e.rx, (y - e.y) / e.ry);
                const u = Math.max(0, Math.min(1, (q - E.inner) / (E.outer - E.inner)));
                fe *= u * u * (3 - 2 * u);
            }
            const fc = BATH_ART.filmCell(look, kind, x, y, cell), w = inn / 16 * fe;
            col[k * 3] = fc[0]; col[k * 3 + 1] = fc[1]; col[k * 3 + 2] = fc[2];
            dens[k] = fc[3] * w;
            tau[k] = t;
            cells.push(k);
        }
        return { col, cells, tau, dens, a: new Float32Array(gw * gh), gw, gh, S, p: -1 };
    },

    // Общий холст мути: подложка пены мочалки поверх мути мыла, смешанные
    // в самой картинке (обычное «поверх» по клетке). Холст на странице один.
    filmPaint() {
        const g = this._grows || {}, S0 = g.soap && g.soap.film, C0 = g.cloth && g.cloth.film, any = S0 || C0;
        const cv = this.el('bt-film');
        if (!cv || !any) return;
        if (cv.width !== any.gw || cv.height !== any.gh) { cv.width = any.gw; cv.height = any.gh; this._filmImg = null; }
        const ctx = cv.getContext('2d');
        const img = this._filmImg || (this._filmImg = ctx.createImageData(any.gw, any.gh)), d = img.data;
        const n = any.gw * any.gh;
        // Смытые куски (washChunk) — без мути: она ушла вместе с пузырями.
        const CH = this._chunks, gone = CH && CH.gw === any.gw && CH.gone.some(v => v) ? CH : null;
        for (let k = 0; k < n; k++) {
            if (gone && gone.gone[gone.cell[k]]) { d[k * 4 + 3] = 0; continue; }
            const as = S0 ? S0.a[k] : 0, ac = C0 && C0.gw === any.gw ? C0.a[k] : 0;
            const ao = ac + as * (1 - ac);
            if (ao <= 0) { d[k * 4 + 3] = 0; continue; }
            const ws = as * (1 - ac) / ao, wc = ac / ao;
            for (let q = 0; q < 3; q++)
                d[k * 4 + q] = (S0 ? S0.col[k * 3 + q] : 0) * ws + (ac ? C0.col[k * 3 + q] : 0) * wc;
            d[k * 4 + 3] = 255 * ao;
        }
        ctx.putImageData(img, 0, 0);
    },

    // Разлить муть до этапа p. true — если картинка изменилась.
    filmUpdate(G, p, force) {
        const L = G.film;
        if (!L) return false;
        if (!force && Math.abs(p - L.p) < 0.0015 && !(p >= 1 && L.p < 1)) return false;
        L.p = p;
        const Ew = this.FILM_EDGE;
        for (const k of L.cells) {
            let u = (p - L.tau[k]) / Ew;
            u = u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
            L.a[k] = L.dens[k] * u;
        }
        this.filmPaint();
        return true;
    },

    // ---------- БЛЕСК ПУЗЫРЕЙ ОТ НАКЛОНА ----------
    // У КАЖДОГО пузыря свой блик, «дочерний» ему (решение игрока, макет
    // принят): он ходит от наклона телефона внутри круга reach·r своего
    // пузыря и ведёт себя как отражение на шаре — к краю сплющивается
    // поперёк, мельчает и тускнеет; напротив — слабое второе отражение. В
    // покое свет сверху слева, как во всей игре: блик посередине читался
    // линзой, а не шаром.
    //
    // Первая версия — три слоя бликов с перетеканием прозрачности — была
    // отвергнута: блик жил не в пузыре, а в слое поверх всей пены.
    //
    // Как это дёшево: форма блика у всех пузырей ОДНА (свет один), разнится
    // только масштаб. Поэтому за кадр рисуется одна заготовка (на цвет) и
    // штампуется на каждый пузырь — drawImage, самое быстрое, что есть у
    // холста. Холст — в разрешении холста мытья: пузыри в игре мелкие (радиус
    // в несколько точек), и на половинном блик выходил в полпикселя.
    // Перерисовка — только когда свет сдвинулся или появились пузыри; мелким
    // пузырям блика нет.
    GLINT: {
        // Покой блика — у каждой группы свой (groups ниже), все сверху слева.
        tilt: 0.6,                          // сколько круга проходит блик от полного наклона
        gain: 2.4,                          // чувствительность к наклону, как у флакона
        reach: 0.6,                         // круг хода блика, в радиусах пузыря
        // Где второе отражение и его размер; сила, размер главного блика,
        // ореол и порог размера пузыря — у вида (LATHER.glint).
        second: { at: 0.72, size: 0.12 },
        // Бликов не больше cap — у самых КРУПНЫХ пузырей. Замер (4× замедление,
        // червь в пене целиком, 1819 пузырей): со всеми бликами 20 кадров
        // из 60, с 400 крупнейшими — 53. Платится не рисование заготовки,
        // а отрисовка видимым холстом каждого штампа; у мелких пузырей блик
        // всё равно в точку.
        cap: 420,
        // На мочалке лимит падает по мере того, как пена густеет (выбор
        // игрока, вариант А): в густой пене 420 бликов сливаются в мелкую
        // рябь, а стоят как 420. Густота — доля натёртого мочалкой, умноженная
        // на густоту пены её ступени (FOAM: 0 у редкой ступени 0, 1 у
        // верхней). Густая пена густеет не к концу, а к середине этапа
        // (второй ярус, шапка), поэтому лимит доходит до denseCap уже к
        // denseAt натёртого. Замер одной перерисовки бликов на вспененном
        // теле (4× замедление): 420 бликов — 47 мс кадра, 200 — 37, 100 — 32.
        denseCap: 180,
        denseAt: 0.6,
        // Горке над хвостом — свой лимит: она маленькая, и пузырей в ней
        // сотни, а не тысячи.
        pileCap: 140,
        // Пока пену смывают: как часто перерисовывать блики (мс) и у
        // скольких пузырей тела они есть (glintStart, glintCap).
        wipe: { every: 80, cap: 160 },
        // Блик пены мочалки (пока один вид — лестница мочалки впереди).
        foam: { k: 0.7, size: 0.24, second: 0.35, halo: 0, min: 0.18 },
        // ТАНЕЦ: пузыри с бликом делятся по размеру на три группы, и у
        // каждой свой покой блика, своя сила и своя вязкость. Одна и та же
        // рука качает их по-разному: крупные тяжёлые отстают, мелкие
        // вертлявые забегают вперёд, — и пена не вспыхивает вся разом.
        // Покой — доля круга хода, как rest; k — множитель силы вида.
        groups: [
            { rest: { x: -0.25, y: -0.62 }, k: 0.8, lag: 0.1, tilt: 0.8 },    // крупные: выше и правее, тяжёлые
            { rest: { x: -0.3,  y: -0.3  }, k: 1,   lag: 0.2, tilt: 1 },      // средние: ближе к зениту, ярче всех
            { rest: { x: -0.62, y: -0.14 }, k: 0.9, lag: 0.38, tilt: 1.25 }   // мелкие: ниже и левее, вертлявые
        ],
        // ВСПЫШКИ. У каждого пузыря своя «точка вспышки» на кольце в
        // пространстве КАЧАНИЯ: качнул руку туда — вспыхнули пузыри, чья
        // точка там. Меряется не угол, а ДВИЖЕНИЕ — наклон минус его
        // медленная средняя (slow — доля за кадр, ~полсекунды): держишь
        // ровно под любым углом — вспышек нет, а естественная дрожь руки
        // (градус-два) уже водит их по пене. gain — сколько кольца на единицу
        // поворота (единица = 35°): 18 — ближний край кольца от 0.7° дрожи,
        // дальний от 1.8°. Кольцо начинается не ближе двух sigma от нуля:
        // иначе пузыри с ближней точкой светились бы и на неподвижном
        // телефоне (так и было — проверка молчала, потому что в покое холст
        // не перерисовывается).
        // Большой поворот не уводит качание за кольцо, а мягко упирается в
        // его край (tanh): повёл телефон — горят пузыри этой стороны.
        // Поворот — от ПОЗЫ ХВАТА по всем осям (Tilt.turn): телефон держат
        // стоймя, и главный жест руки — поворот вокруг вертикали, которого в
        // завале вбок нет вовсе.
        // star — искра на вспыхнувшем пузыре: четыре луча из точки блика
        // (half — полудлина луча в радиусах пузыря, thin — толщина к длине).
        // Одной яркости было мало: вспышку не замечали, сколько ни вертели
        // телефон. Искра нарочно шире пузыря — это отблеск, а пузыри в игре
        // в несколько точек, и луч внутри пузыря терялся в пикселе. Искр за
        // кадр не больше cap: штамп искры вчетверо больше блика по площади, и
        // без потолка перерисовка дорожала вдвое (замер под 4× замедлением).
        flash: { gain: 18, slow: 0.06, ring: [0.35, 0.9], sigma: 0.17, base: 0.5, boost: 1,
                 star: { half: 1.5, thin: 0.11, from: 0.3, cap: 40 } }
    },

    glintBubble(G, bx, by, r, pc) {
        // Блик пены мочалки — от вида мыла, но не тусклее прежнего общего
        // блика пены: пена всегда блестит, даже из хозяйственного.
        const lg = G.look && G.look.glint, Fg = this.GLINT.foam;
        const gp = G.kind === 'cloth'
            ? Object.assign({}, Fg, lg || {}, { k: Math.max(Fg.k, lg ? lg.k : 0), size: Math.max(Fg.size, lg ? lg.size : 0),
                                                second: Math.max(Fg.second, lg ? lg.second : 0), min: Fg.min })
            : (lg || Fg);
        if (!gp.k || r < G.cell * gp.min) return;
        const c = BATH_ART.latherColors(G.look, G.kind);
        // Ядро блика — светлое; ореол — в цвет свечения вида или, у
        // волшебной мути, в радужный цвет кромки своего пузыря.
        const halo = gp.halo ? (pc || c.glow || c.hi) : null;
        const b = { x: bx, y: by, r, k: gp.k, gp, core: c.hi, halo, ch: this._sinkCh,
                    key: G.kind + '|' + (G.look ? G.look.key : 'foam') + '|' + (halo || '') };
        // У горки над хвостом свой список и своя сетка (G.glints, G.grid):
        // она лежит своим холстом, и блики её штампуются туда же.
        if (G.glints) { G.glints.push(b); this.glintOcclude(b, G.grid); G.top = null; }
        else { (this.glintBubs = this.glintBubs || []).push(b); this.glintOcclude(b); }
        this.glintDirty = true;
    },

    // ---------- ЗАКРЫТОЕ НЕ БЛЕСТИТ ----------
    // Пузыри рисуются по очереди, и новый ложится ПОВЕРХ старых. Блик же
    // живёт на своём холсте над всей пеной — и блик пузыря, накрытого
    // новым, рисовался поверх накрывшего: и лишняя работа, и ошибка
    // картинки. На мочалке ступени 8 пузырей к концу ~4000, пена растёт
    // горкой, и заметная доля 420 бликов доставалась закрытым (замер).
    // Поэтому пузырь, на чей центр сел новый пузырь не мельче его,
    // помечается закрытым и из бликов выходит. Пропадает блик ровно в миг,
    // когда его накрыли, — подмены не видно. Так же выходят и пузыри мути
    // мыла под пеной мочалки: закрыты — не блестят.
    // Соседи ищутся по сетке, а не перебором: пузырей тысячи.
    GLINT_GRID: 32,
    glintOcclude(b, grid) {
        const S = this.GLINT_GRID, Gm = grid || (this._glintGrid = this._glintGrid || new Map());
        const i0 = Math.floor((b.x - b.r) / S), i1 = Math.floor((b.x + b.r) / S);
        const j0 = Math.floor((b.y - b.r) / S), j1 = Math.floor((b.y + b.r) / S);
        const R = b.r * 0.75;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const cell = Gm.get(i + ',' + j);
            if (!cell) continue;
            for (const o of cell) {
                if (o.hidden || b.r < o.r * 0.6) continue;
                const dx = o.x - b.x, dy = o.y - b.y;
                if (dx * dx + dy * dy < R * R) { o.hidden = true; this.glintHidden = (this.glintHidden || 0) + 1; }
            }
        }
        const key = Math.floor(b.x / S) + ',' + Math.floor(b.y / S);
        let cell = Gm.get(key);
        if (!cell) Gm.set(key, cell = []);
        cell.push(b);
    },

    glintClear() {
        this._glintGrid = null;
        this.glintHidden = 0;
        this.glintBubs = [];
        this._glintTop = null;
        this.glintDirty = true;
        const c = this.glintCtx;
        if (c) c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    },

    // Заготовка блика для единичного пузыря радиуса R0 в центре холста 2C×2C.
    // (lx, ly) — где свет в круге хода: 0 — середина, 1 — край.
    // Заготовка — ровно квадрат пузыря (C = R0): платится смешивание КАЖДОГО
    // пикселя штампа, а почти весь штамп прозрачен. С запасом в треть
    // радиуса (C 32) штамп был в 1.8 раза больше, а на волшебной мути с её
    // крупными пузырями это съедало кадры. Всё, что нужно, внутри пузыря:
    // блик за пузырь не выходит (test-soap), ореол у кромки обрезается.
    GLINT_R0: 24, GLINT_C: 24,
    glintStamp(b, lx, ly, sk) {
        const Gc = this.GLINT, R0 = this.GLINT_R0, C = this.GLINT_C, gp = b.gp, col = b.core;
        sk = sk || b.key;
        const cv = (this._stamps = this._stamps || {})[sk] || document.createElement('canvas');
        this._stamps[sk] = cv;
        // Свет на месте — заготовка та же. Без этого она рисовалась заново на
        // каждый новый пузырь, а у волшебной мути их по заготовке на цвет
        // кромки и группу.
        const at = `${lx.toFixed(3)},${ly.toFixed(3)},${col},${gp.size}`;
        if (cv._at === at) return cv;
        cv._at = at;
        // Холст заготовки не перевыделяется каждый кадр: смена размера — это
        // новый буфер, а размер у заготовки постоянный.
        if (cv.width !== C * 2) cv.width = cv.height = C * 2;
        const g = cv.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, C * 2, C * 2);
        const d = Math.min(0.99, Math.hypot(lx, ly)), z = Math.sqrt(1 - d * d);
        const ang = Math.atan2(ly, lx);
        const spot = (x, y, a, squash, alpha, color, soft) => {
            g.save();
            g.translate(x, y); g.rotate(ang); g.scale(squash, 1);   // сжатие вдоль радиуса
            const gr = g.createRadialGradient(0, 0, 0, 0, 0, a);
            gr.addColorStop(0, color); gr.addColorStop(soft ? 0.1 : 0.45, color); gr.addColorStop(1, 'rgba(255,255,255,0)');
            g.globalAlpha = alpha;
            g.fillStyle = gr; g.beginPath(); g.arc(0, 0, a, 0, Math.PI * 2); g.fill();
            g.restore();
        };
        // Главный: к краю сплющен поперёк в √(1−d²), мельче и тусклее.
        const a = gp.size * R0 * (0.8 + 0.2 * z);
        const mx = C + lx * Gc.reach * R0, my = C + ly * Gc.reach * R0, sq = Math.max(0.28, z);
        // Ореол светящихся видов — под ядром, шире и мягче: блик светится,
        // а не просто блестит.
        if (gp.halo && b.halo) spot(mx, my, Math.min(C * 0.95, a * gp.halo.w), Math.max(0.5, sq), gp.halo.a, b.halo, true);
        spot(mx, my, a, sq, 0.55 + 0.45 * z, col);
        // Второе отражение — слабый серпик у кромки напротив.
        if (gp.second) spot(C - lx * Gc.second.at * R0, C - ly * Gc.second.at * R0, Gc.second.size * R0, 0.35, gp.second, col);
        return cv;
    },

    // Кому достаётся блик, в какой он группе и где его точка вспышки —
    // пересчитывается, только когда появились пузыри, а не каждый кадр.
    glintCap() {
        const Gc = this.GLINT, C = this._grows && this._grows.cloth;
        if (this.phase === 'pop' || this.phase === 'wipe' || this.phase === 'rinsed') return Gc.wipe.cap;
        if (!C || !(C.p > 0) || !C.look || !C.look.foam) return Gc.cap;
        const dens = C.look.foam.i / (BATH_ART.FOAM.length - 1);
        let u = Math.min(1, C.p / Gc.denseAt);
        u = u * u * (3 - 2 * u);
        return Math.round(Gc.cap - (Gc.cap - Gc.denseCap) * u * dens);
    },

    glintPick(list, cap) {
        const all = list || this.glintBubs || [], Gc = this.GLINT, F = Gc.flash;
        const top = all.filter(b => !b.hidden).sort((a, b) => b.r - a.r).slice(0, cap || this.glintCap());
        const n = top.length;
        top.forEach((b, i) => {
            b.g = Math.min(2, Math.floor(i * 3 / Math.max(1, n)));
            // Точка вспышки — от места пузыря, а не от случая: одна и та же
            // пена танцует одинаково, и прогон повторим.
            const h = Math.sin(b.x * 12.9898 + b.y * 78.233) * 43758.5453, h1 = h - Math.floor(h);
            const q = Math.sin(b.x * 39.3468 + b.y * 11.135) * 24634.6345, h2 = q - Math.floor(q);
            const a = h1 * Math.PI * 2, rho = F.ring[0] + h2 * (F.ring[1] - F.ring[0]);
            b.hx = Math.cos(a) * rho; b.hy = Math.sin(a) * rho;
        });
        // Порядок штамповки — по заготовке (цвет, группа): подряд идущие
        // штампы с одного источника холст рисует пачкой, чередование
        // источников — каждый отдельно. У волшебной мути заготовок
        // пятнадцать (цвет кромки × группа).
        top.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.g - b.g));
        if (list) return top;
        this._glintTop = top;
        this._glintTopN = all.length;
        return top;
    },

    // P — где свет у каждой группы ([{lx, ly}] ×3), (dx, dy) — качание.
    // Искра — четыре мягких луча и яркая точка в месте главного блика своей
    // группы. Заготовка своя и крупнее блика: лучи выходят за пузырь.
    GLINT_SC: 52,
    glintStar(col, lx, ly, sk) {
        const Gc = this.GLINT, R0 = this.GLINT_R0, C = this.GLINT_SC, St = Gc.flash.star;
        const cv = (this._stamps = this._stamps || {})[sk] || document.createElement('canvas');
        this._stamps[sk] = cv;
        const at = `${lx.toFixed(3)},${ly.toFixed(3)},${col}`;
        if (cv._at === at) return cv;
        cv._at = at;
        // Холст заготовки не перевыделяется: смена размера — это новый
        // буфер, а размер у заготовки постоянный.
        if (cv.width !== C * 2) cv.width = cv.height = C * 2;
        const g = cv.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, C * 2, C * 2);
        const h = St.half * R0;
        g.translate(C + lx * Gc.reach * R0, C + ly * Gc.reach * R0);
        for (const rot of [Math.PI / 4, -Math.PI / 4]) {
            g.save(); g.rotate(rot); g.scale(1, St.thin);
            const gr = g.createRadialGradient(0, 0, 0, 0, 0, h);
            gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, col); gr.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = gr; g.beginPath(); g.arc(0, 0, h, 0, Math.PI * 2); g.fill();
            g.restore();
        }
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, h * 0.3);
        gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, h * 0.3, 0, Math.PI * 2); g.fill();
        return cv;
    },

    glintRedraw(P, dx, dy) {
        const ctx = this.glintCtx;
        if (!ctx) return;
        const t0 = performance.now();
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        const stamps = {};
        if (!this._glintTop || this._glintTopN !== (this.glintBubs || []).length) this.glintPick();
        this.glintPaint(ctx, this._glintTop, P, dx, dy, stamps);
        // Горка над хвостом блестит ТЕМ ЖЕ светом, что пена на теле: это та
        // же пена. Холст у неё свой — она лежит под чашей, а не на черве.
        const pc = this.pileGlintCtx, H = this.pile;
        if (pc && H) {
            pc.clearRect(0, 0, pc.canvas.width, pc.canvas.height);
            if (!H.top || H.topN !== H.glints.length) { H.top = this.glintPick(H.glints, this.GLINT.pileCap); H.topN = H.glints.length; }
            this.glintPaint(pc, H.top, P, dx, dy, stamps);
        }
        this.glintDraws = (this.glintDraws || 0) + 1;
        this.glintMs = performance.now() - t0;
    },

    // Штамповка бликов списка top на холст ctx: свет групп P, качание
    // (dx, dy). Одна на тело, горку и сползающий кусок пены.
    glintPaint(ctx, top, P, dx, dy, stamps) {
        const K = this.GLINT_C / this.GLINT_R0, Gc = this.GLINT, F = Gc.flash;
        const s2 = F.sigma * F.sigma;
        stamps = stamps || {};
        const stars = [];
        // Заготовка на цвет И группу: у групп свет в разных местах. Это три
        // рисования заготовки за кадр вместо одного — копейки против сотен
        // штампов.
        for (const b of top) {
            const sk = b.key + '#' + b.g, gl = P[b.g];
            const st = stamps[sk] || (stamps[sk] = this.glintStamp(b, gl.lx, gl.ly, sk));
            const w = b.r * K, ex = dx - b.hx, ey = dy - b.hy;
            const f = Math.exp(-(ex * ex + ey * ey) / s2);
            // globalAlpha вне 0..1 холст молча игнорирует — отсюда min.
            const kk = b.k * Gc.groups[b.g].k;
            ctx.globalAlpha = Math.min(1, kk * (F.base + F.boost * f));
            ctx.drawImage(st, b.x - w, b.y - w, w * 2, w * 2);
            // Искра — только у вспыхнувших: лишний штамп у малой доли пены.
            // Искры — вторым проходом, чтобы не рвать пачки штампов бликов.
            if (b.gp.star !== false && f > F.star.from && stars.length < F.star.cap) stars.push(b, kk * f);
        }
        for (let i = 0; i < stars.length; i += 2) {
            const b = stars[i], gl = P[b.g];
            const zk = 'star|' + b.core + '#' + b.g;
            const zs = stamps[zk] || (stamps[zk] = this.glintStar(b.core, gl.lx, gl.ly, zk));
            const ws = b.r * this.GLINT_SC / this.GLINT_R0;
            ctx.globalAlpha = Math.min(1, stars[i + 1]);
            ctx.drawImage(zs, b.x - ws, b.y - ws, ws * 2, ws * 2);
        }
        ctx.globalAlpha = 1;
    },

    // Цикл наклона: живёт, пока на теле есть пена. Не чаще 30 раз в секунду
    // и только если свет сдвинулся или добавились пузыри.
    glintStart() {
        if (this.glintRaf || !this.glintCtx || typeof requestAnimationFrame === 'undefined') return;
        const Gc = this.GLINT, F = Gc.flash;
        const L = this.glintLean = this.glintLean ||
            { g: Gc.groups.map(() => ({ x: 0, y: 0 })), sx: null, sy: 0, dx: 0, dy: 0, last: 0, key: null };
        const cl = (v, m) => Math.max(-m, Math.min(m, v));
        const step = (now) => {
            this.glintRaf = requestAnimationFrame(step);
            // Пока трут — 20 раз в секунду, а не 30: кадр в это время и так
            // самый тяжёлый (пена растёт, вещь едет за пальцем), а мерцание
            // на двадцати не отличить.
            const rub = this.drag && now - (this.rubMovedAt || 0) < 250;
            // Пока пену смывают (горка, тапы по червю), блеск — 12 раз в
            // секунду и у меньшего числа пузырей (GLINT.wipe): этот этап —
            // на крупном плане, холсты пены на экране вдвое больше, и с
            // полным блеском кадров под 4× замедлением было 20 против 60.
            const wiping = this.phase === 'pop' || this.phase === 'wipe' || this.phase === 'rinsed';
            // И не два кадра экрана подряд: порог по времени — ДЕЛИТЕЛЕМ
            // кадров (docs/traps.md, пп. 36 и 155). На медленном устройстве
            // кадр длиннее любого из порогов, и без делителя блики
            // перерисовывались на КАЖДОМ кадре — ровно там, где кадр и так
            // тяжелее всего (мочалка 8 под 4×: 10 кадров с бликами, 28 без).
            // Где кадров 30 и больше, не меняется ничего: два кадра проходят
            // раньше порога.
            L.fc = (L.fc || 0) + 1;
            if (now - L.last < (wiping ? this.GLINT.wipe.every : rub ? 50 : 33) || L.fc - (L.fcAt || 0) < 2) return;
            L.last = now; L.fcAt = L.fc;
            const T = typeof Tilt === 'undefined' ? null : Tilt.turn ? Tilt.turn() : Tilt.lean ? Tilt.lean() : null;
            // Датчика нет (компьютер, отказ в разрешении) — свет плывёт сам и
            // чуть дрожит, как в руке, чтобы пена не стояла мёртвой.
            const t = now / 1000;
            const rx = T && T.live ? T.x : 0.33 * Math.sin(t * 0.5) + 0.02 * Math.sin(t * 2.3 + 1) + 0.012 * Math.sin(t * 3.7);
            const ry = T && T.live ? T.y : 0.2 * Math.sin(t * 0.31) + 0.018 * Math.sin(t * 1.9 + 2) + 0.01 * Math.sin(t * 4.3);
            // Качание: наклон минус медленная средняя. Совсем мелкое — ноль,
            // иначе цикл перерисовывал бы вечно доползающий хвост средней.
            if (L.sx === null) { L.sx = rx; L.sy = ry; }
            L.sx += (rx - L.sx) * F.slow; L.sy += (ry - L.sy) * F.slow;
            let dx = (rx - L.sx) * F.gain, dy = (ry - L.sy) * F.gain;
            const dm = Math.hypot(dx, dy), R1 = F.ring[1];
            if (dm > 1e-9) { const k = R1 * Math.tanh(dm / R1) / dm; dx *= k; dy *= k; }
            if (Math.abs(dx) < 0.05) dx = 0;
            if (Math.abs(dy) < 0.05) dy = 0;
            const tx = cl(rx * Gc.gain, 1), ty = cl(ry * Gc.gain, 1);
            // Наклон вправо (правый край вниз) — к свету поворачивается ЛЕВЫЙ
            // бок пузыря, блик уходит влево; верх к себе — блик вниз.
            // Сторона проверяется прогоном (test-soap.js), а не выводится в
            // уме (docs/traps.md, п. 116). Каждая группа догоняет наклон со
            // своей вязкостью и ходит на свою долю.
            let moved = Math.abs(dx - L.dx) + Math.abs(dy - L.dy) > 0.004;
            const P = Gc.groups.map((G, i) => {
                const q = L.g[i];
                q.x += (tx - q.x) * G.lag; q.y += (ty - q.y) * G.lag;
                let lx = G.rest.x - Gc.tilt * G.tilt * q.x, ly = G.rest.y + Gc.tilt * G.tilt * q.y;
                const m = Math.hypot(lx, ly);
                if (m > 0.99) { lx *= 0.99 / m; ly *= 0.99 / m; }
                // Шаг света — 1/40 круга хода, у крупного пузыря это пятая
                // доля пикселя: глазу не видно, а заготовки (у волшебной мути
                // их пятнадцать, с ореолом) не перестраиваются на каждый
                // дрожащий сдвиг сглаживания.
                lx = Math.round(lx * 40) / 40; ly = Math.round(ly * 40) / 40;
                if (q.lx == null || Math.abs(lx - q.lx) + Math.abs(ly - q.ly) > 0.008) moved = true;
                return { lx, ly };
            });
            if (!this.glintDirty && !moved) return;
            // Телефон стоит, а пузыри прибывают (намыливают) — их блики
            // догоняют не каждый кадр, а ~8 раз в секунду: перерисовка всех
            // бликов на каждый новый пузырь ела кадры именно пока мылят.
            if (!moved && now - (L.drawn || 0) < 120) return;
            L.drawn = now;
            P.forEach((p, i) => { L.g[i].lx = p.lx; L.g[i].ly = p.ly; });
            L.dx = dx; L.dy = dy;
            this.glintDirty = false;
            this.glintRedraw(P, dx, dy);
        };
        this.glintRaf = requestAnimationFrame(step);
    },

    glintStop() {
        if (this.glintRaf) cancelAnimationFrame(this.glintRaf);
        this.glintRaf = 0;
        if (this.glintLean) this.glintLean.g.forEach(q => { q.lx = null; });
    },

    // Муть, пена и их блики видны и гаснут ВМЕСТЕ: это один след на теле.
    washShown(on, fadeMs) {
        for (const id of ['bt-film', 'bt-wash', 'bt-glint']) {
            const n = this.el(id);
            if (!n) continue;
            n.style.transition = fadeMs ? `opacity ${fadeMs / 1000}s ease` : '';
            n.style.opacity = on ? '1' : '0';
        }
        if (!on) this.glintStop();
    },

    wipeLather() {
        const n = this.el('bt-wash');
        // Переход снимается: его ставит конец забега «только помыть», и без
        // сброса следующий забег начинался бы с того, что пена медленно
        // проявляется из ниоткуда.
        this.glintStop();
        this.washShown(true);
        if (this.washCtx) this.washCtx.clearRect(0, 0, n.width, n.height);
        this._washOk = false;
        this.growReset();
    },

    // ---------- СМЫТЬ КУСОК ПЕНЫ ----------
    // Сколько кусков пены ещё на теле.
    washLeft() {
        const C = this._chunks;
        if (!C) return 0;
        let n = 0;
        for (const v of C.gone) if (!v) n++;
        return n;
    },

    // Кусок под точкой сцены: номер, −1 — тело, но пена тут уже смыта,
    // null — мимо персонажа. Палец толстый: тело ищется и чуть рядом.
    chunkUnder(p) {
        const C = this.washChunks();
        if (!C) return null;
        const r = this.cfg().wipeReach || 12;
        for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
            const q = { x: p.x + dx, y: p.y + dy };
            if (!this.onBody(q)) continue;
            const box = this.wormBoxScene(), k = this.WORM_BASE.w / box.w * this.MASK_SCALE;
            const c = LatherGrow.chunkAt(C, (q.x - box.x) * k, (q.y - box.y) * k);
            return C.gone[c] ? -1 : c;
        }
        return null;
    },

    // Смыть кусок c (или, если он уже смыт или не задан, — следующий по
    // порядку: выросший последним сходит первым). Кусок — муть, пузыри и
    // их блики вместе — отделяется своим холстом и сползает вниз, тая
    // (sloughStart); с тела он снимается в тот же миг. Пузыри куска и так
    // лежат своими холстами (partCtx): с тела он уходит пересборкой из
    // готовых картинок, без единого нарисованного заново пузыря.
    washChunk(c) {
        const C = this.washChunks();
        if (!C) return false;
        if (c == null || c < 0 || C.gone[c]) c = C.gone.indexOf(0);
        if (c < 0) return false;
        this.sloughStart(c);
        C.gone[c] = 1;
        this.filmPaint();
        this._washOk = false;
        this.composeWash();
        // Блики смытого куска уходят вместе с ним (их копия — на сползающем
        // куске).
        this.glintBubs = (this.glintBubs || []).filter(b => b.ch !== c);
        this._glintTop = null;
        this.glintDirty = true;
        // Тело чистое — холст бликов стирается СРАЗУ, не дожидаясь цикла:
        // за последним тапом горки тут же идёт startRub, он останавливает
        // цикл бликов, и последняя картинка искр оставалась висеть на
        // чистой морде (снимок с айфона).
        if (!this.washLeft()) this.glintClear();
        if (typeof Haptics !== 'undefined') Haptics.impact('light');
        return true;
    },

    // ---------- СПОЛЗАЮЩИЙ КУСОК ----------
    // Свой маленький холст на кусок, в тех же единицах, что холст мытья, и
    // на том же месте. Едет вниз и тает css-переходом transform и opacity:
    // это работа композитора над готовой текстурой, ни одной перерисовки за
    // кадр. Прозрачность здесь — у ОТДЕЛЬНОГО холста, а не у группы в живом
    // svg (docs/traps.md, п. 73), и слой живёт ровно время сползания
    // (п. 152): по концу холст выбрасывается.
    sloughStart(c) {
        const S = this.MASK_SCALE, Wm = this.mask.width, Hm = this.mask.height;
        const C = this._chunks, g = this._grows || {}, S0 = g.soap && g.soap.film, C0 = g.cloth && g.cloth.film;
        const kinds = ['soap', 'cloth'].map(k => g[k]).filter(G => G && G.p > 0 && G.parts[c] && G.parts[c].cv);
        // Муть куска — клетки карты с этим номером, где она есть.
        const fcells = [];
        let i0 = Infinity, j0 = Infinity, i1 = -1, j1 = -1;
        if (S0 || C0) for (let k = 0; k < C.cell.length; k++) {
            if (C.cell[k] !== c || ((S0 ? S0.a[k] : 0) + (C0 ? C0.a[k] : 0)) <= 0) continue;
            fcells.push(k);
            const i = k % C.gw, j = (k / C.gw) | 0;
            i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
        }
        let x0 = fcells.length ? (i0 - 1) * C.S : Infinity, y0 = fcells.length ? (j0 - 1) * C.S : Infinity;
        let x1 = fcells.length ? (i1 + 2) * C.S : -Infinity, y1 = fcells.length ? (j1 + 2) * C.S : -Infinity;
        for (const G of kinds) {
            const P = G.parts[c];
            x0 = Math.min(x0, P.x); y0 = Math.min(y0, P.y);
            x1 = Math.max(x1, P.x + P.cv.width); y1 = Math.max(y1, P.y + P.cv.height);
        }
        x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
        x1 = Math.min(Wm, Math.ceil(x1)); y1 = Math.min(Hm, Math.ceil(y1));
        const w = x1 - x0, h = y1 - y0;
        if (!(w > 0 && h > 0)) return;
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.translate(-x0, -y0);
        // Муть — тем же смешением, что на теле (filmPaint), картинкой по
        // пикселю на клетку, растянутой со сглаживанием.
        if (fcells.length) {
            const fw = i1 - i0 + 1, fh = j1 - j0 + 1, fc = document.createElement('canvas');
            fc.width = fw; fc.height = fh;
            const fx = fc.getContext('2d'), img = fx.createImageData(fw, fh), d = img.data;
            for (const k of fcells) {
                const as = S0 ? S0.a[k] : 0, ac = C0 ? C0.a[k] : 0, ao = ac + as * (1 - ac);
                const ws = as * (1 - ac) / ao, wc = ac / ao, q = (((k / C.gw) | 0) - j0) * fw + (k % C.gw - i0);
                for (let u = 0; u < 3; u++) d[q * 4 + u] = (S0 ? S0.col[k * 3 + u] : 0) * ws + (ac ? C0.col[k * 3 + u] : 0) * wc;
                d[q * 4 + 3] = 255 * ao;
            }
            fx.putImageData(img, 0, 0);
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(fc, i0 * C.S, j0 * C.S, fw * C.S, fh * C.S);
        }
        // Пузыри — готовыми картинками куска.
        for (const G of kinds) ctx.drawImage(G.parts[c].cv, G.parts[c].x, G.parts[c].y);
        // Свои блики — те, что горели на этом куске, в том свете, в каком
        // их застал тап.
        const L = this.glintLean, top = (this._glintTop || []).filter(b => b.ch === c);
        if (L && top.length) {
            const P = L.g.map((q, i) => q.lx == null
                ? { lx: this.GLINT.groups[i].rest.x, ly: this.GLINT.groups[i].rest.y } : { lx: q.lx, ly: q.ly });
            this.glintPaint(ctx, top, P, L.dx || 0, L.dy || 0);
        }
        // На место: те же единицы и то же преобразование, что у холста мытья.
        const SL = BATH_ART.SLOUGH, box = this.wormBoxScene(), drop = SL.drop * this.WORM_BASE.w / box.w;
        const at = (dy, k) => `${this._wormT || ''} translate(${(x0 / S).toFixed(2)}px, ${(y0 / S + dy).toFixed(2)}px) scale(1, ${k})`;
        cv.className = 'bt-lather bt-slough';
        cv.style.width = (w / S) + 'px';
        cv.style.height = (h / S) + 'px';
        cv.style.transition = 'none';
        cv.style.transform = at(0, 1);
        cv.style.opacity = '1';
        const after = this.el('bt-glint');
        if (!after || !after.parentNode) return;
        after.parentNode.insertBefore(cv, after.nextSibling);
        void cv.offsetWidth;
        cv.style.transition = `transform ${SL.ms}ms ${SL.ease}, opacity ${SL.ms}ms ${SL.fade}`;
        cv.style.transform = at(drop, SL.stretch);
        cv.style.opacity = '0';
        (this._sloughs = this._sloughs || []).push(cv);
        // Таймер — только чтобы убрать отыгравший холст (анимация, не
        // состояние: инвариант 1).
        setTimeout(() => {
            cv.remove();
            if (this._sloughs) this._sloughs = this._sloughs.filter(n => n !== cv);
        }, SL.ms + 80);
    },

    sloughClear() {
        for (const n of this._sloughs || []) n.remove();
        this._sloughs = [];
    },

    // ---------- ЗАБЕГ «ТОЛЬКО ПОМЫТЬ»: ТАПЫ ПО ПЕРСОНАЖУ ----------
    // Хвоста не будет — горки тоже, и смывать пену тапают по самому червю.
    // Тап по пене смывает кусок под пальцем; по уже чистому месту — следующий
    // по порядку: тап по червю всегда что-то смывает. Чистое тело — забег
    // окончен.
    startWipe() {
        this.phase = 'wipe';
        this._glintTop = null;
        this.washChunks();
        if (!this.washLeft()) this.finishWash();
        else this.ripeArm();
    },

    wipeAt(p) {
        const c = this.chunkUnder(p);
        if (c === null) return;
        this.washChunk(c);
        if (!this.washLeft()) this.wipeDone();
    },

    // Последний кусок ещё сползает — вода выключается и камера отъезжает,
    // когда он сошёл: иначе отъезд камеры увёз бы его с собой.
    wipeDone() {
        this.phase = 'rinsed';
        clearTimeout(this.wipeTimer);
        this.wipeTimer = setTimeout(() => {
            this.wipeTimer = 0;
            if (this.phase === 'rinsed') this.finishWash();
        }, BATH_ART.SLOUGH.ms);
    },

    // ---------- ВВОД ----------
    onDown(e) {
        if (this.win && this.win.isConfirmOpen && this.win.isConfirmOpen()) return;
        const p = this.toScene(e);
        const A = BATH_ART.slots();

        // Журнал на унитазе — вход в магазин, пока магазин открыт (до забега
        // и после): взлетает и раскрывается прилавком (lust-mag.js).
        if (this.shopAllowed() && typeof BATH_MAG !== 'undefined' && BATH_MAG.hit(p)
            && typeof LustMag !== 'undefined') {
            LustMag.open();
            return;
        }

        if (this.phase === 'idle') {
            // Душ включает воду — это и есть старт забега.
            // Душ — вся стойка целиком, а не одна лейка: палец целится туда,
            // где кран, и просветы между трубками не должны быть мёртвыми.
            if (Math.hypot(p.x - A.showerHead.x, p.y - A.showerHead.y) < 96
                || (typeof BATH_SHOWER !== 'undefined' && BATH_SHOWER.hit(p)))
                this.startWater();
            return;
        }
        if (this.phase === 'soap' || this.phase === 'cloth') {
            const kind = this.phase;
            // Предмет отпущен посреди этапа — он лежит там, где его оставили,
            // а на полке его нет: брать его можно только оттуда.
            if (this.loose) {
                const at = this.looseHit(this.toStage(e));
                if (at) this.takeTool(kind, e, at);
                return;
            }
            // Высокий флакон берут и за горлышко — оно далеко от гнезда,
            // поэтому попадание считается и по габариту предмета.
            const b = kind === 'soap' ? BATH_SOAP.box() : null;
            const inBox = b && p.x > b.x - 12 && p.x < b.x + b.w + 12 && p.y > b.y - 12 && p.y < b.y + b.h + 12;
            if (inBox || Math.hypot(p.x - A[kind].x, p.y - A[kind].y) < 70) this.takeTool(kind, e);
            return;
        }
        if (this.phase === 'pop') { this.pop(p); this.ripeArm(); return; }
        if (this.phase === 'wipe') { this.wipeAt(p); this.ripeArm(); return; }
        if (this.phase === 'rub') {
            this.drag = { kind: 'rub', t: null };
            this.rubMove(p);
            return;
        }
        // В финале палец не берёт предмет, а ДЕРЖИТ хвост: пока он на экране,
        // хвост стоит там, куда его увели, и тянется обратно, как только
        // палец убрали.
        if (this.phase === 'aim') { this.drag = { kind: 'tail' }; this.aimAt(p); }
        // В 'settle' управление уже отобрано: доигрываются капли.
    },

    onMove(e) {
        if (!this.drag) return;
        e.preventDefault();
        if (this.drag.kind === 'rub') { this.rubMove(this.toScene(e)); return; }
        if (this.drag.kind === 'tail') { this.aimAt(this.toScene(e)); return; }
        // Когда палец последний раз вёл вещь: пока трут, флакон в руке стоит
        // (bath-soap.js, wake), а блики обновляются реже (glintStart).
        this.rubMovedAt = performance.now();
        const ps = this.toStage(e), pc = this.clampHeld(ps, this.drag);
        this.moveTool(pc);

        // Точка касания — середина предмета: если край экрана его
        // остановил, а палец ушёл дальше, мылит предмет там, где он стоит.
        const f = this.toScene(e), o = this.drag.off || { x: 0, y: 0 }, cs = this.cam ? this.cam.s : 1;
        const p = { x: f.x + o.x + (pc.x - ps.x) / cs, y: f.y + o.y + (pc.y - ps.y) / cs };
        const kind = this.drag.kind;
        // Мыло и мочалка — трение: прогресс от пути по телу, пена растёт
        // заготовкой (lather-grow.js). Клеток и подсказки больше нет.
        if (!this.soapRub(p, e.timeStamp || performance.now(), kind)) return;
        this.growTo(kind, this.rub);
        // Пена копится НЕ ТОЛЬКО на черве: над будущим хвостом растёт горка —
        // по той же доле натёртого, чтобы было видно, что она от работы
        // игрока. Перерисовывается она, только когда пришла новая группа
        // или шаг мути (pileShow сам решает).
        if (kind === 'cloth') this.pileShow(this.rub);
        if (this.rub >= 1) this.finishStage(kind);
    },

    onUp() {
        if (!this.drag) return;
        this.bendHand = null;
        this.ringTouch(null);
        // Мыло и мочалка, отпущенные посреди своего этапа, ОСТАЮТСЯ там, где
        // их отпустили (просьба игрока): возврат на полку после каждого
        // отрыва пальца заставлял тянуться к полке снова и снова. Домой
        // предмет уходит только с концом этапа (returnTool).
        const d = this.drag;
        if ((d.kind === 'soap' || d.kind === 'cloth') && d.pos) {
            this.loose = { kind: d.kind, at: d.at, pos: d.pos, k: d.k };
            this.floatTool(true);
        }
        this.drag = null;
    },

    // Попал ли палец (точка ХОЛСТА) в лежащий предмет. Ответ — точка на
    // рисунке полки, за которую его возьмут, чтобы он не прыгнул (takeTool).
    // Предмет лежит в масштабе руки: точка холста переводится обратно тем же
    // масштабом, каким он нарисован.
    looseHit(q) {
        const L = this.loose;
        if (!L) return null;
        const a = BATH_ART.slots()[L.kind];
        // Предмет покачивается в воздухе: палец целится в то место, где он
        // СЕЙЧАС, а не в середину размаха — иначе при подхвате он дёрнется.
        const bob = this.bobY();
        const art = { x: L.at.x + (q.x - L.pos.x) / L.k, y: L.at.y + (q.y - bob - L.pos.y) / L.k };
        const b = L.kind === 'soap' ? BATH_SOAP.box() : BATH_ART.box(L.kind);
        const inBox = art.x > b.x - 12 && art.x < b.x + b.w + 12 && art.y > b.y - 12 && art.y < b.y + b.h + 12;
        return inBox || Math.hypot(art.x - a.x, art.y - a.y) < 70 ? art : null;
    },

    // ---------- ПРЕДМЕТ ЖДЁТ В ВОЗДУХЕ ----------
    // Этап начался — игра сама снимает нужную вещь с полки и держит её над
    // ней: вещь парит и светится по контуру (просьба игрока). Это подсказка
    // «бери меня», сказанная движением, без слов (инвариант 9). Взятая
    // пальцем вещь не парит и не светится; оставленная где угодно — снова
    // парит и светится там, где лежит (onUp).
    //
    // Поднятая вещь сразу ЛЕЖИТ на экране (loose) — ровно как оставленная
    // пальцем: подхват, попадание и возврат у них один и тот же путь.
    LIFT: 18,          // на сколько единиц холста вещь поднимается над полкой
    LIFT_MS: 520,

    liftTool(kind) {
        cancelAnimationFrame(this.liftRaf);
        // Во время переезда камеры кадр сцены ещё не встал: вещь поднялась
        // бы не с того места, где полка окажется. Подъём ждёт камеру — заодно
        // ничего не меняется посреди переезда (docs/traps.md, п. 150).
        if (this.camTimer || !this.cam) {
            this.liftRaf = requestAnimationFrame(() => this.liftTool(kind));
            return;
        }
        this.ready(null);
        const a = BATH_ART.slots()[kind], c = this.cam, K = BATH_ART.DRAG_SCALE;
        const from = { x: c.tx + c.s * a.x, y: c.ty + c.s * a.y };
        const to = { x: from.x, y: from.y - this.LIFT };
        this.setHeld(kind, c.s, a);
        this.loose = { kind, at: a, pos: to, k: c.s * K };
        const held = this.el('bt-held'), hand = this.el('bt-hand');
        // Подъём делает НЕ атрибут вещи внутри svg, а видеокарта — тем же
        // приёмом, что и парение: вещь сразу стоит на своём месте и в своём
        // размере, а весь холст руки едет снизу и растёт из полочного
        // размера (css-transform элемента страницы, WAAPI). Пока подъём писал
        // transform группы каждый кадр, айфон (WebKit) рисовал холст руки
        // со сдвигом, который менялся вместе с картинкой: мочалку на подъёме
        // водило влево-вправо на 2–3 точки, а со стартом парения она
        // прыгала ещё на 3–4 (запись экрана игрока; в Chromium этого нет).
        // Заодно подъём ничего не перерисовывает.
        this.placeCarry(hand, to);
        if (!hand || typeof hand.animate !== 'function') {
            this.homeShown(kind, false, true);
            this.floatTool(true);
            return;
        }
        this.liftStop();
        // Подъём ТРОГАЕТСЯ не здесь, а через кадр. Кадр, в котором вещь
        // собирается в руке (новый холст, его слой, снятый слой полки), на
        // айфоне длится 70–100 мс (самописец), и часы, пущенные до него,
        // показывали первым кадром уже треть подъёма (docs/traps.md, п. 158).
        // Пока он рисуется, на экране — ПОЛОЧНАЯ копия, а холст руки
        // прозрачен (прозрачность слоя — видеокарта, без перерисовки).
        // Анимация на паузе в нуле для этого не годится: остановленную
        // WAAPI-анимацию WebKit рисует сам, главным потоком, и на видео
        // игрока мочалка в эти три кадра стояла на 4 точки ниже полочной.
        hand.parentNode.style.opacity = '0';
        this.liftPending = kind;
        let wait = 2;
        // Цикл — только сторож: кончился подъём — парение; вещь взяли или
        // сменили — подъём снят (liftStop). liftRaf живёт, пока идёт подъём:
        // по нему ждут и игра, и прогоны.
        const step = () => {
            if (this.el('bt-held') !== held || !this.loose) { this.liftStop(); return; }
            if (wait && --wait) { this.liftRaf = requestAnimationFrame(step); return; }
            if (this.liftPending) this.liftGo(kind, hand, from, to);
            const A = this.liftAnim;
            if (A && A.playState !== 'finished') { this.liftRaf = requestAnimationFrame(step); return; }
            this.liftStop();
            this.floatTool(true);
        };
        this.liftRaf = requestAnimationFrame(step);
    },

    // Подъём тронулся: полочная копия прячется и холст руки появляется в
    // одном кадре — летящая начинает ровно с её места и размера, а плавное
    // угасание дало бы на миг двойника.
    //
    // Холст руки — размером с вещь, в обёртке, начало которой — точка хвата.
    // Подъём начинается с полочной копии: тот же низ (from) и полочный
    // масштаб вокруг точки, за которую вещь держат, — она лежит в холсте в
    // _btO от его угла (fitCarry). Сдвиг — в точках обёртки сцены (единица
    // холста ванной × m). Мягкая мочалка вдобавок расправляется из осевшей
    // в шар (squashKeys) — той же анимацией, поэтому кадры — выборка кривых
    // с линейным ходом между ними.
    liftGo(kind, hand, from, to) {
        this.liftPending = null;
        this.homeShown(kind, false, true);
        hand.parentNode.style.opacity = '';
        const K = BATH_ART.DRAG_SCALE, O = hand._btO || { x: 0, y: 0 }, m = this.stageMap().m;
        const Q = kind === 'cloth' && typeof BATH_CLOTH !== 'undefined' ? BATH_CLOTH.squashOf(hand) : null;
        const TY = (from.y - to.y) * m, N = Q ? 24 : 1, keys = [];
        hand.style.transformOrigin = `${O.x.toFixed(2)}px ${O.y.toFixed(2)}px`;
        for (let i = 0; i <= N; i++) {
            const u = i / N, e = Q ? 1 - Math.pow(1 - u, 3) : u;
            keys.push({ transform: `translate(0px, ${(TY * (1 - e)).toFixed(2)}px) scale(${(1 / K + (1 - 1 / K) * e).toFixed(4)})`
                + (Q ? this.squashTf(Q, O, this.squashQ(u)) : '') });
        }
        // Без мягкой мочалки — два кадра и та же кривая замедления.
        const opt = { duration: this.LIFT_MS, easing: Q ? 'linear' : 'cubic-bezier(0.33, 1, 0.68, 1)' };
        this.liftAnim = hand.animate(keys, opt);
        // Слои волшебного флакона — соседи холста в той же обёртке
        // (bath-soap-rig.js): та же анимация с тем же стартом, иначе небо и
        // огоньки отстали бы от стекла.
        this.liftRig = Array.from(hand.parentNode.querySelectorAll(':scope > .bsm-rig')).map(r => {
            r.style.transformOrigin = hand.style.transformOrigin;
            return r.animate(keys, opt);
        });
    },

    // ОСАДКА МЯГКОЙ МОЧАЛКИ — ВИДЕОКАРТОЙ. Конняку и облако на полке осели
    // (шире и ниже), в руке — шар. Раньше переход правил саму картинку на
    // каждом кадре (группу осадки, у конняку — и контур). Видео с айфона:
    // пока шёл этот переход, мочалка 7 и 8 скакала на ±5% ширины и ±6
    // точек от кадра к кадру, хотя записанные значения шли плавно
    // (1.06 → 1 → 0.98); переехал переход на начало парения — туда же
    // переехали и скачки. Мыло 8 правит себя не меньше, но мелкими
    // вещицами, а не формой целиком, и не скакало ни разу. Значит, WebKit
    // не успевает за картинкой, у которой каждый кадр меняется ВСЯ форма.
    // Теперь картинка в руке и в полёте не меняется вовсе: нарисован шар, а
    // осадку даёт масштаб холста вокруг низа вещи (BATH_CLOTH.squashOf).
    //
    // q — доля осадки: 1 — как на полке, 0 — шар. С полки: из осевшей в шар
    // с одним мягким перелётом (вытянулась на десятую долю осадки и
    // вернулась) и нулевой скоростью в конце.
    squashQ(u) {
        return Math.pow(1 - u, 2) * Math.cos(1.5 * Math.PI * u);
    },
    squashTf(Q, O, q) {
        const dx = Q.x - O.x, dy = Q.y - O.y;
        const sx = 1 + (Q.sx - 1) * q, sy = 1 + (Q.sy - 1) * q;
        return ` translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)}) translate(${(-dx).toFixed(2)}px, ${(-dy).toFixed(2)}px)`;
    },
    // Осадка одной анимацией на холсте, без подъёма: взятая с полки пальцем
    // расправляется (up), летящая домой оседает ко второй половине пути
    // (down), к посадке — ровно как полочная копия.
    squashAnim(svg, dir, ms) {
        const Q = svg && typeof svg.animate === 'function' && typeof BATH_CLOTH !== 'undefined' ? BATH_CLOTH.squashOf(svg) : null;
        if (!Q) return null;
        const O = { x: Q.x, y: Q.y }, N = 24, keys = [];
        svg.style.transformOrigin = `${O.x.toFixed(2)}px ${O.y.toFixed(2)}px`;
        for (let i = 0; i <= N; i++) {
            const u = i / N, v = Math.max(0, (u - 0.5) / 0.5);
            keys.push({ transform: this.squashTf(Q, O, dir === 'up' ? this.squashQ(u) : 1 - this.squashQ(v)).trim() });
        }
        return svg.animate(keys, { duration: ms, easing: 'linear', fill: 'forwards' });
    },

    // Снять подъём: сторож и анимацию холста руки. Без этого вещь, взятая
    // пальцем посреди подъёма, ехала бы ещё и вместе с холстом. Не
    // тронувшийся подъём отдаёт место холсту руки: полочная копия прячется,
    // холст руки виден.
    liftStop() {
        cancelAnimationFrame(this.liftRaf);
        this.liftRaf = 0;
        if (this.liftAnim) { this.liftAnim.cancel(); this.liftAnim = null; }
        if (this.liftRig) { this.liftRig.forEach(a => a.cancel()); this.liftRig = null; }
        const hand = this.el('bt-hand');
        if (hand) { hand.style.transformOrigin = ''; hand.parentNode.style.opacity = ''; }
        if (this.liftPending) { this.homeShown(this.liftPending, false, true); this.liftPending = null; }
    },

    // Парение и свечение. Качается НЕ группа внутри svg, а сам холст руки
    // целиком: на нём ничего, кроме вещи, а css-анимация transform у
    // элемента страницы едет на видеокарте без единой перерисовки.
    // Анимация внутри svg перерисовывала бы весь холст на каждом кадре
    // (docs/traps.md, пп. 37 и 73), а атрибут transform группы ещё и
    // затёрла бы (пп. 2 и 50). Свечение — тень-ореол того же холста:
    // картинка вещи стоит, и тень рисуется один раз.
    // У волшебного флакона тени нет: его холст перерисовывается на каждом
    // его кадре, а светится он сам — сиянием и лучами вокруг, которые
    // возвращаются, как только флакон отпущен (bath-soap.js, applyFrame).
    floatTool(on) {
        if (!on) this.liftStop();
        const n = this.el('bt-hand');
        if (!n) return;
        // Живые мочалки (конняку и облако, ступени 7 и 8) — так же: светятся
        // своим ореолом и живут в воздухе (bath-cloth.js, liveTick). Под
        // тенью-фильтром живая картинка пересчитывала бы тень каждый кадр,
        // и конняку парил замёрзшим и мутным (замечание игрока).
        const T = on && this.loose && this.loose.kind === 'cloth' && typeof BATH_CLOTH !== 'undefined' && BATH_CLOTH.TIERS[BATH_CLOTH.tier()];
        const magic = on && this.loose && (this.loose.kind === 'soap'
                    ? typeof BATH_SOAP !== 'undefined' && BATH_SOAP.TIERS[BATH_SOAP.tier()] === 'magic'
                    : T === 'cloud' || T === 'konjac');
        // Старт качания — для его расчёта без чтения стиля (bobFast).
        if (on && !n.classList.contains('bt-float')) this.floatAt = performance.now();
        n.classList.toggle('bt-float', !!on);
        n.classList.toggle('bt-float-magic', !!magic);
        // Слои флакона качаются вместе с холстом (lust.css, .bt-rig-float).
        n.parentNode.classList.toggle('bt-rig-float', !!on);
    },

    // Где сейчас качание по высоте. В единицах холста: качание — в точках
    // обёртки сцены, а в единице холста их m.
    bobY() {
        const n = this.el('bt-hand');
        if (!n || !n.classList.contains('bt-float')) return 0;
        const t = getComputedStyle(n).transform;
        return t && t !== 'none' ? new DOMMatrixReadOnly(t).f / this.stageMap().m : 0;
    },

    // То же качание — расчётом, а не чтением стиля: bobY спрашивает
    // getComputedStyle, и на каждом кадре (небо облака, видимость вещей) это
    // был пересчёт стиля всей ванной — самое дорогое в кадре парящей вещи.
    // Кривая — та же, что у @keyframes bt-float (lust.css): 2.8 с, 0 → −5 → 0,
    // ease-in-out на каждой половине. Старт css-анимации — в ближайшем
    // пересчёте стиля после floatTool, ошибка — доли точки. Где нужна точность
    // до точки (хват, полёт домой), — bobY.
    BOB: { ms: 2800, px: 5 },
    bobFast() {
        const n = this.el('bt-hand');
        if (!n || !n.classList.contains('bt-float') || this.floatAt == null) return 0;
        const ph = ((performance.now() - this.floatAt) % this.BOB.ms) / this.BOB.ms;
        const u = ph < 0.5 ? ph * 2 : (ph - 0.5) * 2, e = this.easeInOut(u);
        return -this.BOB.px * (ph < 0.5 ? e : 1 - e) / this.stageMap().m;
    },
    // cubic-bezier(0.42, 0, 0.58, 1): x(t) решается Ньютоном, y(t) — ответ.
    easeInOut(x) {
        const bx = (t) => 3 * (1 - t) * (1 - t) * t * 0.42 + 3 * (1 - t) * t * t * 0.58 + t * t * t;
        const by = (t) => 3 * (1 - t) * t * t + t * t * t;
        let t = x;
        for (let i = 0; i < 6; i++) {
            const d = 3 * (1 - t) * (1 - t) * 0.42 + 6 * (1 - t) * t * (0.58 - 0.42) + 3 * t * t * (1 - 0.58);
            if (Math.abs(d) < 1e-6) break;
            t -= (bx(t) - x) / d;
            t = Math.max(0, Math.min(1, t));
        }
        return by(t);
    },

    // Всё сразу на полку, без полёта: сброс забега и проверки. Конец этапа
    // возвращает вещь по дуге — flyHome.
    returnTool() {
        this.drag = null;
        this.loose = null;
        this.floatTool(false);
        this.clearHoming();
        this.dropHeld();
        this.showTools(true);
    },

    // ---------- ЭТАПЫ ----------
    // Душ включён — и больше не выключается. Раньше здесь наливалась ванна:
    // рос уровень воды, обрезка ползла снизу вверх. С фронтальной камерой
    // нутра чаши не видно вовсе, наливать некуда и нечего показывать — вода
    // теперь просто ИДЁТ ИЗ ЛЕЙКИ, а забег начинается сразу.
    startWater() {
        this.phase = 'rinse';
        this.syncShopButton();
        // Играется ли забег НА ЖЕТОН — решается в момент, когда полилась вода,
        // и дальше не меняется. У похоти награда на своём таймере, и если он
        // ещё не истёк, червя только моют: хвоста, пузырей и финала не будет
        // (docs/plan/21-lust-bath.md, разд. 7а). Решать в конце мытья
        // нельзя: горка пены над хвостом копится ВО ВРЕМЯ мочалки, и её
        // надо либо строить, либо нет с самого начала.
        this.paidRun = (typeof Backend === 'undefined') || Backend.sinPays('lust');
        // Душ смывает всё, что осталось от прошлого забега в этот же заход.
        if (typeof LustGoo !== 'undefined') LustGoo.reset();
        this.ready(null);
        this.setOpacity('bt-rain-far', 1);
        this.setOpacity('bt-rain-near', 1);
        this.setOpacity('bt-rain-veil', 1);
        // Наезд ОДНОВРЕМЕННО с водой и ПЛАВНЫЙ: игра начинается с общего
        // плана, где видно всю комнату, и камера сама подъезжает к участку,
        // на котором идёт работа. Скачок читался сменой сцены — как будто
        // открыли другую игру, а не подошли ближе.
        this.setCamera('body', 900);
        const t0 = performance.now();
        const DUR = 900;      // ровно чтобы заметить, что полилось
        const step = (t) => {
            if (t - t0 < DUR) { this.fillRaf = requestAnimationFrame(step); return; }
            this.fillRaf = 0;
            this.phase = 'soap';
            this.resetCover();
            this.growReset();
            this.liftTool('soap');
        };
        this.fillRaf = requestAnimationFrame(step);
    },

    takeTool(kind, e, at) {
        // Предмет держат ТОЙ точкой, за которую взяли: не прыгает центром
        // под палец. У флакона это главное — пузо окно в небо, и палец,
        // взявший горлышко, обязан остаться на горлышке (замечание игрока).
        // Точка берётся внутри габарита: тап рядом с предметом не вешает
        // его в стороне от пальца.
        // Хват и касание — разные точки: мылит сам предмет (гнездо — его
        // середина), где бы ни лежал палец. Смещение в единицах сцены:
        // предмет в руке крупнее полочного в DRAG_SCALE, и настолько же
        // дальше от пальца его середина.
        const a = BATH_ART.slots()[kind], k = BATH_ART.DRAG_SCALE;
        // at — точка, за которую берут лежащий на экране предмет (looseHit).
        const b = kind === 'soap' ? BATH_SOAP.box() : BATH_ART.box(kind), q = at || this.toScene(e);
        const g = { x: Math.max(b.x, Math.min(b.x + b.w, q.x)), y: Math.max(b.y, Math.min(b.y + b.h, q.y)) };
        const s = this.cam ? this.cam.s : 1;
        this.loose = null;
        this.floatTool(false);
        this.drag = { kind, at: g, k: s * k, off: { x: (a.x - g.x) * k, y: (a.y - g.y) * k } };
        this.homeShown(kind, false);
        this.ready(null);
        this.setHeld(kind, s, g);
        // С полки — округляется, как при подъёме (liftTool). Лежавшая на
        // экране уже круглая.
        if (kind === 'cloth' && !at) this.squashAnim(this.el('bt-hand'), 'up', 420);
        this.moveTool(this.clampHeld(this.toStage(e), this.drag));
    },

    // ---------- ЗА КРАЙ ЭКРАНА НЕ УХОДИТ ----------
    // Мыло и мочалку можно было увести за край экрана и потерять: достать
    // их оттуда нечем (замечание игрока). Теперь предмет останавливается у
    // края: формой за край заходит не больше HOLD_OUT своего размера — ровно
    // «чуть-чуть», чтобы край не читался стенкой. Раз остановлено при
    // перетаскивании, то и оставленный парить предмет лежит в пределах
    // (onUp берёт то же место). Сверху запас на покачивание парящего
    // (bt-float, 5 единиц вверх).
    //
    // Край — не рамка 390×844, а то, что ВИДНО: сцена ванной лежит под
    // шапкой окна мини-игры, и svg руки вписан с обрезкой (slice) — верх и
    // низ его видимой области срезаны. По рамке холста пробка флакона
    // уезжала под шапку (снимок прогона).
    HOLD_OUT: 0.05,
    HOLD_BOB: 5,
    handView() {
        // Холст руки теперь размером с вещь — видимую область меряет холст
        // чаши: он во весь экран и вписан так же (slice).
        const n = this.svgEl, W = typeof STAGE_W !== 'undefined' ? STAGE_W : 390;
        const H = typeof STAGE_H !== 'undefined' ? STAGE_H : 844;
        const r = n && n.getBoundingClientRect();
        if (!r || !r.width || !r.height) return { x: 0, y: 0, w: W, h: H };
        // Та же пропорция, что у видимой области: slice масштабирует по
        // большему, лишнее по другой оси срезано поровну.
        const sc = Math.max(r.width / W, r.height / H), vw = r.width / sc, vh = r.height / sc;
        return { x: (W - vw) / 2, y: (H - vh) / 2, w: vw, h: vh };
    },
    clampHeld(p, d) {
        if (!p || !d || !d.at) return p;
        const b = d.kind === 'soap' ? BATH_SOAP.box() : BATH_ART.box(d.kind), K = d.k;
        const w = b.w * K, h = b.h * K, ox = (b.x - d.at.x) * K, oy = (b.y - d.at.y) * K;
        const tx = w * this.HOLD_OUT, ty = h * this.HOLD_OUT, V = this.handView();
        return {
            x: Math.max(V.x - tx - ox, Math.min(V.x + V.w + tx - ox - w, p.x)),
            y: Math.max(V.y - ty + this.HOLD_BOB - oy, Math.min(V.y + V.h + ty - oy - h, p.y))
        };
    },

    // Вещь в руке — одна. Заменяется ТОЛЬКО она: рядом может ещё лететь на
    // полку прошлая вещь (flyHome), и стирать весь холст руки нельзя.
    // Холст руки — размером с вещь (BATH_ART.heldBox): правка живой вещи в
    // руке перерисовывает его, а не экран (docs/traps.md, п. 156). Место
    // ставит moveTool / liftTool.
    setHeld(kind, s, at) {
        // Новая вещь в руке не едет с холстом недоигранного подъёма.
        if (this.liftAnim) this.liftStop();
        const old = this.el('bt-held');
        if (old) old.remove();
        this.fgEl.insertAdjacentHTML('beforeend', `<g id="bt-held">${BATH_ART.held(kind, s, at)}</g>`);
        this.fitCarry(this.el('bt-hand'), BATH_ART.heldBox(kind, s, at));
    },

    // Вещь на полке видна или нет. Только СВОЯ: мыло летит домой, пока
    // мочалка уже поднялась, — показать «все, кроме» значило бы вернуть на
    // полку мыло, которое ещё в воздухе (двойник).
    // instant — без плавного перехода: когда на том же месте в тот же миг
    // появляется или исчезает летящая копия, переход читается миганием.
    homeShown(kind, on, instant) {
        // У мочалки на полке две части в разных слоях: в корзине и
        // свисающая через край поверх сетки (bt-cloth-front). Прячутся вместе.
        for (const id of [`bt-${kind}-home`, `bt-${kind}-front`]) {
            const n = this.el(id);
            if (!n) continue;
            if (instant) n.style.transition = 'none';
            n.style.opacity = on ? '1' : '0';
            if (instant) { void n.getBoundingClientRect(); n.style.transition = ''; }
        }
        // Слои волшебного флакона (небо, сияние, огоньки) — вместе с гнездом.
        if (typeof BATH_SOAP !== 'undefined' && BATH_SOAP.rigSweep) BATH_SOAP.rigSweep(instant);
    },

    // ---------- ДОМОЙ ПО ДУГЕ ----------
    // Этап кончился — вещь не телепортируется на полку, а летит туда сама
    // (просьба игрока): по дуге, а не напрямую, и к концу пути ужимается из
    // «ручного» размера в полочный. Приземлилась — копия на полке
    // появляется мгновенно, а летевшая убирается: одна и та же картинка на
    // одном и том же месте, подмены не видно.
    //
    // Летит своим узлом (#bt-homing), а не #bt-held: следующая вещь в это
    // время уже поднимается с полки, и у каждой своя дорога.
    HOME_MS: [480, 820],       // короткий путь — быстрее, длинный — дольше

    flyHome(done) {
        const held = this.el('bt-held'), d = this.drag, o = this.loose;
        const kind = (d || o || {}).kind;
        const at = d ? d.at : o && o.at;
        // Откуда: из-под пальца или оттуда, где вещь парит (с качанием —
        // иначе она дёрнется на старте).
        const from = d && d.pos ? d.pos : o ? { x: o.pos.x, y: o.pos.y + this.bobY() } : null;
        this.drag = null;
        this.loose = null;
        this.floatTool(false);
        this.clearHoming();
        const c = this.cam;
        const hand = this.el('bt-hand'), home = this.el('bt-hand-home');
        if (!held || !kind || !at || !from || !c || !home) {
            if (held) held.remove();
            this.emptyCarry(hand);
            if (kind) this.homeShown(kind, true);
            if (done) done();
            return;
        }
        // Вещь переезжает на свой холст полёта — того же размера, — а холст
        // руки освобождается под следующую.
        held.id = 'bt-homing';
        this.fitCarry(home, hand._btR);
        home.appendChild(held);
        this.emptyCarry(hand);
        this.placeCarry(home, from);
        // Куда: та точка рисунка, за которую вещь держали, в том месте, где
        // она лежит на полке. Нарисована вещь «ручным» размером (камера ×
        // DRAG_SCALE) — на полке она в DRAG_SCALE раз меньше.
        const to = { x: c.tx + c.s * at.x, y: c.ty + c.s * at.y };
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        // Вершина дуги — над серединой пути и выше обоих концов: вещь
        // подбрасывают на полку, а не тащат по прямой.
        const top = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 40 - 0.25 * dist };
        const [m0, m1] = this.HOME_MS, dur = Math.min(m1, m0 + dist * 0.8);
        const K = BATH_ART.DRAG_SCALE;
        // Часы полёта пускаются со ВТОРОГО кадра, как у подъёма (liftTool):
        // кадр, где вещь переезжает на холст полёта, а слои меняются, на
        // айфоне длится 55–73 мс (самописец), и полёт с часами от вызова
        // начинался скачком на 20 точек.
        let t0 = null, wait = 1;
        // Мягкая вещь (конняку) оседает к посадке и садится уже осевшей, как
        // копия на полке: подмены не видно. Оседать ПОСЛЕ посадки нельзя —
        // за мочалкой сразу отъезжает камера (finishStage), а на переезде
        // сцена едет готовой текстурой.
        const step = (t) => {
            if (!held.isConnected) { this.homeRaf = 0; return; }
            if (wait) { wait--; this.homeRaf = requestAnimationFrame(step); return; }
            if (t0 == null) {
                t0 = t;
                if (kind === 'cloth') this.homeSq = this.squashAnim(home, 'down', dur);
            }
            const u = Math.max(0, Math.min(1, (t - t0) / dur));
            const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
            const q = 1 - e;
            const x = q * q * from.x + 2 * q * e * top.x + e * e * to.x;
            const y = q * q * from.y + 2 * q * e * top.y + e * e * to.y;
            const m = 1 + (1 / K - 1) * e;
            this.placeCarry(home, { x, y }, m);
            if (u < 1) { this.homeRaf = requestAnimationFrame(step); return; }
            this.homeRaf = 0;
            // Полка — сразу, без плавного проявления: летевшая копия стоит
            // ровно там же и в том же размере, и проявление читалось бы
            // миганием.
            this.homeShown(kind, true, true);
            if (kind === 'cloth' && typeof BATH_CLOTH !== 'undefined') BATH_CLOTH.syncPose(this.el('bt-cloth-art'));
            held.remove();
            this.homeSqStop();
            this.emptyCarry(home);
            if (done) done();
        };
        this.homeRaf = requestAnimationFrame(step);
    },

    // Снять осадку летевшей домой: холст полёта общий и служит следующей.
    homeSqStop() {
        if (this.homeSq) { this.homeSq.cancel(); this.homeSq = null; }
        const home = this.el('bt-hand-home');
        if (home) home.style.transformOrigin = '';
    },

    // Прервать полёт домой (уход из ванной, новый забег): вещь сразу на полке.
    clearHoming() {
        cancelAnimationFrame(this.homeRaf);
        this.homeRaf = 0;
        this.homeSqStop();
        const n = this.el('bt-homing');
        if (n) n.remove();
        this.emptyCarry(this.el('bt-hand-home'));
    },

    // Предмет в руке живёт в координатах ХОЛСТА: его держат перед собой, и
    // камере он не подчиняется.
    // Двигается не группа внутри svg, а холст вещи целиком (transform
    // обёртки): перетаскивание делает видеокарта.
    moveTool(p) {
        if (this.drag) this.drag.pos = p;
        if (this.el('bt-held')) {
            this.placeCarry(this.el('bt-hand'), p);
        }
    },

    showTools(show, except) {
        for (const k of ['soap', 'cloth']) for (const id of [`bt-${k}-home`, `bt-${k}-front`]) {
            const n = this.el(id);
            if (n) n.style.opacity = (show || k !== except) ? '1' : '0';
        }
        if (typeof BATH_SOAP !== 'undefined' && BATH_SOAP.rigSweep) BATH_SOAP.rigSweep();
    },

    finishStage(kind) {
        if (kind === 'soap') {
            // Мыло летит домой (ниже, flyHome), и мочалка поднимается, когда
            // оно уже на полке, а не вместе с ним: у обеих один холст руки, и
            // парение со свечением мочалки досталось бы летящему мылу — оно
            // светилось бы как «бери меня» по дороге домой. Взять мочалку с
            // полки можно и раньше: тогда поднимать уже нечего.
            // Горка пены над будущим хвостом собирается ЗАРАНЕЕ, пока червя
            // трут мочалкой. К моменту, когда хвост всплывает, она уже
            // непроницаема, и его появления не видно.
            if (this.paidRun) this.buildPile();
            // Мочалка снимает мыло и оставляет пену: муть гасится, чтобы
            // второй этап был виден.
            // Что намылено — запоминается: на этапе мочалки это фон, по
            // которому видно, где пена уже проступила, а где ещё нет.
            // Муть доращивается до конца: этап мог кончиться и не трением
            // (debug-перескок), а мочалка трёт по ГОТОВОЙ мути.
            this.growTo('soap', 1);
            this.phase = 'cloth';
            this.resetCover();
            this.flyHome(() => {
                if (this.phase === 'cloth' && !this.drag && !this.loose) this.liftTool('cloth');
            });
            return;
        }
        // Дальше камера отъезжает (к хвосту или на общий план) — и едет
        // готовой текстурой: вещь, летящая в это время, перерисовывала бы
        // холст посреди переезда (docs/traps.md, п. 150). Поэтому сперва
        // мочалка долетает до полки, потом всё остальное. Пока летит, палец
        // ничего не берёт: фаза уже не «мочалка».
        this.phase = 'return';
        this.warmParts();
        this.flyHome(() => {
            if (this.phase !== 'return') return;       // успели уйти из ванной
            if (this.paidRun) this.raiseTail();
            else this.startWipe();
        });
    },

    // ---------- ЗАБЕГ «ТОЛЬКО ПОМЫТЬ» ----------
    // Награда ещё не готова — червя вымыли, и на этом всё. Сказано без
    // единого слова (инвариант 9): пену игрок смыл сам, тапами по червю
    // (startWipe), вода выключается, камера отъезжает на общий план, кнопка
    // магазина возвращается. Хвост не всплывает — ширмы над ним и не
    // копилось.
    //
    // Шкала потребности закрывается, как после любого захода: червь чистый.
    // Таймер награды НЕ тратится (rewards.lust.wash без claimsReward).
    finishWash() {
        this.phase = 'done';
        this.stopClocks();
        this.ready(null);
        this.setOpacity('bt-rain-far', 0);
        this.setOpacity('bt-rain-near', 0);
        this.setOpacity('bt-rain-veil', 0);
        const wash = this.el('bt-wash');
        if (wash) {
            this.washShown(false, 1200);
        }
        this.setCamera('overview', 900);
        GameEvents.emit('minigame:result', {
            sin: 'lust', mode: 'wash', outcome: 'win', meta: { wash: true }
        });
        this.syncShopButton();
    },
});
