// ================= АППАРАТ АЛЧНОСТИ: КОЛБА НАСЫЩЕНИЯ =================
// Шкала греха — прямая стеклянная колба слева от барабанов, от верха табло до
// пола нижнего ящика, поверх досок стойки. Решение игрока: крупно (градусник
// читался мелко, пузырьки в нём — тем более) и без шара внизу — таких
// огромных градусников не бывает. Колба держится в трёх местах: латунные
// колпаки на концах (каждый ушком к корпусу) и хомут посередине. Столбик
// янтарной жидкости поднимается с каждой круткой.
// Было: градусник с шаром-колбой, по скосу рамки окна.
//
// Стекло, деления, колпаки и хомут — в корпусе (свет шейдером); жидкость —
// живая, своим холстом поверх: подрастает с оттяжкой, мениск колышется от
// наклона и удара рычага, со дна и со стенок идут пузырьки.
Object.assign(GreedJunk, {
    // bx — ось колбы, r — радиус стекла, wall — толщина стенки; стекло от
    // y1 (верх) до y0 (низ), колпаки высотой cap заходят на него на 3;
    // clamps — y хомутов
    METER: { bx: 63, r: 14, wall: 2.4, y1: 313, y0: 600, cap: 14, clamps: [457] },
    // Подложка под колбой — лакированная планка на табло: сквозь молочное
    // стекло просвечивали лучи скоса, петли и болт дверцы — материалы
    // «проваливались» друг в друга. Ниже табло стекло лежит на ровной ДСП.
    // Во всю ширину от края видимой зоны: узкая планка рядом со стойкой
    // табло читалась второй доской встык.
    METER_BOARD: { x: 22, y: 290, w: 58, h: 174 },

    // Контур стекла: прямой цилиндр, концы под колпаками. inset — внутрь на
    // толщину стенки: по нему налита жидкость.
    meterPath(inset) {
        const M = this.METER, f = this.f, x0 = M.bx - M.r + inset, x1 = M.bx + M.r - inset;
        return `M${f(x0)} ${f(M.y1)} H${f(x1)} V${f(M.y0)} H${f(x0)} Z`;
    },

    meterGlass() {
        const J = PALETTE.greedJunk, M = this.METER, Mc = J.reel.meter, f = this.f, ink = PALETTE.ink;
        const x = M.bx, r = M.r, P = this.meterPath(0), Pin = this.meterPath(M.wall), Bd = this.METER_BOARD;
        let out = this.T(10, 'lacquer', this.planks(Bd.x, Bd.y, Bd.w, Bd.h, 1, 57, 'v', 0, 'painted'));
        let g = `<path d="${P}" class="fx" fill="${J.hole}" opacity="0.4" transform="translate(1.6 2)"/>`;
        // Стекло — плотное: сквозь прозрачное просвечивали доски стойки, и
        // пустая колба читалась покраской, а не стеклом. Цвет — дымчатый, не
        // молочный: белая колба перебивала барабаны (palette.js).
        g += `<path d="${P}" fill="${Mc.glass}" fill-opacity="0.72" stroke="${ink}" stroke-width="${STROKE.structure}"/>` +
            // толщина стенки: внутренний контур — тёмная тонкая линия
            `<path d="${Pin}" fill="${Mc.glassIn}" fill-opacity="0.5" stroke="${J.tin[500]}" stroke-width="0.5"/>`;
        // Рельеф цилиндра. Валик — с круглыми концами шириной в колбу, и
        // концы обрезаются по стеклу: иначе они вылезали из-под колпаков
        // буграми на карте высот, а укороченный валик давал под верхним
        // колпаком скруглённое «дно пробирки».
        g += `<clipPath id="gj-meter-clip"><path d="${P}"/></clipPath>` +
            `<g clip-path="url(#gj-meter-clip)">${this.cylG('gj-meter-cyl', x - r, M.y1 - 1, r * 2, M.y0 - M.y1 + 2, 6, 11)}</g>`;
        // Стекло — ниже колпаков и хомута: они надеты на него снаружи. Было:
        // стекло на 13 с выпуклостью 12.6 упиралось в потолок карты высот
        // (20), а колпаки лежали плоско на 14 — колба выходила ближе к нам,
        // чем то, что её держит (игрок: «крепления глубже колбы»).
        out += this.T(6, 'glass', g);
        // ушко к корпусу: жестяная пластина влево, саморез в стойку; у стены,
        // ниже колбы — колбу держит то, что на неё надето, ушко лишь прижато
        const ear = (y) => this.T(4, 'steel', `<rect x="${f(x - r - 11)}" y="${f(y - 2.8)}" width="12" height="5.6" rx="1" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.detail}"/>` +
            this.bolt(x - r - 6.5, y, 1.5));
        // Объём того, что надето на колбу: цилиндр той же оси, шире стекла
        // (cylG — одной кривой, без ступеней). rise — над стенкой.
        const sleeveH = (x0, y, w, h, rise, id) => this.cylG(id, x0, y, w, h, 6, rise);
        // Колпаки — стальные стаканы, надетые на концы колбы. Было: латунный
        // плоский прямоугольник с двумя поперечными рисками — в полутени
        // читался деревяшкой, лежал ниже стекла и не охватывал его. Теперь:
        // стакан шире стекла, со стороны стекла — завальцованная кромка
        // (стекло уходит внутрь), на торце — гайка; объём — цилиндром.
        const T = J.tin;
        const cap = (y, h, up) => {
            const cw = r * 2 + 6, cx0 = x - cw / 2, lipY = up ? y + h - 2.2 : y, endY = up ? y : y + h - 2.6;
            let c = `<rect x="${f(cx0)}" y="${f(y)}" width="${f(cw)}" height="${h}" rx="2.4" fill="${T[500]}" stroke="${ink}" stroke-width="${STROKE.structure}"/>` +
                // завальцовка у стекла: валик чуть шире стакана
                `<rect x="${f(cx0 - 0.8)}" y="${f(lipY)}" width="${f(cw + 1.6)}" height="2.2" rx="1.1" fill="${T[300]}" stroke="${ink}" stroke-width="${STROKE.detail}"/>` +
                // торец: тёмная фаска
                `<rect x="${f(cx0 + 0.6)}" y="${f(endY)}" width="${f(cw - 1.2)}" height="2.6" rx="1.2" fill="${T[700]}"/>` +
                // нарисованный свет — для запасного вида: блик слева, тень справа
                `<path d="M${f(cx0 + 2.4)} ${f(y + 2)} V${f(y + h - 2)}" class="hl" stroke="${T[100]}" stroke-width="1.4" stroke-linecap="round"/>` +
                `<path d="M${f(cx0 + cw - 2.2)} ${f(y + 2)} V${f(y + h - 2)}" class="fx" stroke="${T[900]}" stroke-width="1.6" opacity="0.6"/>` +
                // потёк ржавчины из-под завальцовки
                `<path d="M${f(x + 4)} ${f(up ? y + h - 1 : y + 1)} q0.5 ${up ? -2.5 : 2.5} -0.2 ${up ? -4.2 : 4.2}" fill="none" stroke="${J.rust[500]}" stroke-width="0.9" stroke-linecap="round" opacity="0.6"/>`;
            c += sleeveH(cx0 - 0.8, y, cw + 1.6, h, (r + 3) * 0.95, up ? 'gj-mcap-t' : 'gj-mcap-b');
            // гайка на торце: шестигранник, торчит из стакана
            const ny = up ? y - 3.4 : y + h - 0.6, nw = 9, nh = 4;
            const nut = `<path d="M${f(x - nw / 2 + 1.2)} ${f(ny)} H${f(x + nw / 2 - 1.2)} L${f(x + nw / 2)} ${f(ny + nh / 2)} L${f(x + nw / 2 - 1.2)} ${f(ny + nh)} H${f(x - nw / 2 + 1.2)} L${f(x - nw / 2)} ${f(ny + nh / 2)} Z" fill="${T[300]}" stroke="${ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>` +
                `<path d="M${f(x - 1.6)} ${f(ny + 0.6)} V${f(ny + nh - 0.6)} M${f(x + 1.6)} ${f(ny + 0.6)} V${f(ny + nh - 0.6)}" stroke="${T[700]}" stroke-width="0.5"/>` +
                sleeveH(x - nw / 2, ny, nw, nh, 3, up ? 'gj-mnut-t' : 'gj-mnut-b');
            return ear(y + h / 2) + this.T(6, 'steel', c) + this.T(6, 'steel', nut);
        };
        out += cap(M.y1 - M.cap + 3, M.cap, true) + cap(M.y0 - 3, M.cap, false);
        // хомут: жестяная лента вокруг колбы — тоже надета на неё, выше стекла
        M.clamps.forEach(y => {
            const w = r * 2 + 2.8, x0 = x - w / 2;
            const c = `<rect x="${f(x0)}" y="${y - 3.6}" width="${f(w)}" height="7.2" rx="1.4" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.structure}"/>` +
                `<path d="M${f(x - r - 0.6)} ${y - 2.4} H${f(x + r + 0.6)}" class="hl" stroke="${J.tin[100]}" stroke-width="0.8"/>` +
                `<path d="M${f(x - r - 0.6)} ${y + 2.4} H${f(x + r + 0.6)}" stroke="${J.tin[700]}" stroke-width="0.7"/>` +
                sleeveH(x0, y - 3.6, w, 7.2, (r + 1.4) * 0.95, 'gj-mclamp-' + y);
            out += ear(y) + this.T(6, 'steel', c);
        });
        return out;
    },
    // y уровня v (0 — дно над нижним колпаком, 1 — под верхним)
    meterY(v) {
        const M = this.METER, lo = M.y0 - 3, hi = M.y1 + 3;
        return lo - (lo - hi) * v;
    }
});

Object.assign(GreedJunkLit, {
    // участок холстов жидкости — вокруг стекла колбы (METER)
    get METER_BOX() {
        const R = GreedJunk.METER;
        return { x: R.bx - R.r - 2, y: R.y1 - 2, w: R.r * 2 + 4, h: R.y0 - R.y1 + 4 };
    },
    // k, c — пружина уровня (подрастает с оттяжкой и чуть перелетает);
    // wk, wc — колыхание мениска: жёсткость и затухание
    METER_SPRING: { k: 0.00002, c: 0.008, wk: 0.0006, wc: 0.012 },

    // Три холста, а не один: стекло (деления, блики) рисуется ОДИН раз;
    // жидкость — только когда сдвинулся уровень или мениск; каждый кадр —
    // только пузырьки, и каждый — готовой картинкой (bubbleSprite). Было:
    // всё с нуля каждый кадр, с градиентами и вырезами, — дорого ради
    // полоски у окна.
    meterMount(wrap) {
        const B = this.METER_BOX, G = GreedJunk;
        const layer = () => {
            const cv = document.createElement('canvas');
            cv.width = B.w * this.SCALE; cv.height = B.h * this.SCALE;
            cv.style.cssText = `position:absolute;${G.css(B)}z-index:1;pointer-events:none;background:none`;
            wrap.appendChild(cv);
            const ctx = cv.getContext('2d');
            ctx.setTransform(this.SCALE, 0, 0, this.SCALE, -B.x * this.SCALE, -B.y * this.SCALE);
            return ctx;
        };
        this.meterCv = layer().canvas;
        this.meterBub = layer();
        this.meterGlassTop(layer());
        this.meterGlare = layer();
        this.meterGlareAt(this.lightFor ? this.lightFor({ x: 0, y: 0 }) : [-0.45, -0.55, 0.7]);
        const v = this.meterValue();
        this._meter = { L: v, T: v, v: 0, w: 0, wv: 0, bubbles: [], foam: [], fizz: 0, sites: this.meterSites(), at: 0, shown: '' };
    },
    // насыщение греха 0..1 из состояния игры (в превью без игры — половина)
    meterValue() {
        if (typeof GameState === 'undefined' || !GameState.sinValue) return 0.5;
        const max = GameState.maxValue('greed') || 100;
        return Math.max(0, Math.min(1, GameState.sinValue('greed') / max));
    },
    // игра сообщает новое значение (после крутки) — столбик идёт к нему
    meterSet(v) { if (this._meter) this._meter.T = Math.max(0, Math.min(1, v)); },
    meterBump() {
        const M = this._meter, cfg = (typeof ECONOMY !== 'undefined' && ECONOMY.minigames.greed) || { fillPerSpin: 10 };
        if (!M) return;
        // превью: полная шкала начинается заново, чтобы рост было видно всегда
        M.T = M.T >= 0.999 ? 0.1 : Math.min(1, M.T + cfg.fillPerSpin / 100);
    },
    // удар рычага: мениск колышется, а жидкость вскипает, как встряхнутое
    // пиво, — центры кипения на время работают вчетверо чаще
    meterKick(k) {
        if (!this._meter) return;
        this._meter.wv += 0.03 * k;
        this._meter.fizz = Math.min(1, this._meter.fizz + 0.9 * k);
    },

    // ---------- ПУЗЫРЬКИ, КАК В ПИВЕ ----------
    // В пиве пузырьки идут не по одному откуда попало, а ЦЕПОЧКАМИ из
    // центров кипения — царапин и соринок на стекле: из одной точки ровной
    // ниткой, один за другим. Поднимаясь, каждый растёт (газ выходит в
    // него по пути) и разгоняется; большие чуть виляют. У поверхности
    // собираются в тонкую пенку и лопаются. Центры — на дне колбы и на
    // стенках; у каждого свой темп и свой размер пузырьков.
    // Было: одиночный пузырь раз в пару секунд — читался воздухом в трубке.
    // Размеры пузырьков — под колбу вдвое шире градусника: мелочь в 1 ед.
    // в ней терялась (игрок: «пузырьки внутри тоже мелкие»).
    BUBBLE: { a: 0.000045, vmax: 0.07, grow: 0.02, rmax: 2.2, foamMs: 1200, foamMax: 22 },
    meterSites() {
        const R = GreedJunk.METER, x = R.bx, ri = R.r - R.wall, bot = GreedJunk.meterY(0) - 1;
        return [
            // дно колбы: две нитки, частые и мелкие
            { x: x - 3.5, y: bot, every: 110, r0: 0.7 },
            { x: x + 4, y: bot, every: 150, r0: 0.6 },
            // царапины на стенках: реже, пузырьки крупнее
            { x: x + ri - 1, y: GreedJunk.meterY(0.25), every: 240, r0: 0.85 },
            { x: x - ri + 1.1, y: GreedJunk.meterY(0.55), every: 320, r0: 0.8 }
        ].map(s => Object.assign(s, { next: Math.random() * s.every }));
    },
    // Настроение колбы (решение игрока): в покое почти тихо — пузырёк раз
    // в пару секунд; пока идёт игра (барабаны, колесо, шарик) — средне; за
    // выигрыш (мигают лампы) — вовсю, как раньше было всегда. Было: центры
    // кипения работали в полную силу без перерыва, колба «херачила»
    // пузырями и в простое. Доли — от полной силы центров (~23 в секунду);
    // up/down — за сколько мс настроение доходит до нового уровня.
    BUBBLE_MOOD: { idle: 0.022, play: 0.3, win: 1, winMs: 4000, up: 350, down: 1800 },
    meterWin() { if (this._meter) this._meter.winUntil = performance.now() + this.BUBBLE_MOOD.winMs; },
    meterMood(M, now, dt) {
        const D = this.BUBBLE_MOOD;
        const busy = typeof GreedMinigame !== 'undefined' && GreedMinigame.busy && GreedMinigame.busy();
        const target = now < (M.winUntil || 0) ? D.win : busy ? D.play : D.idle;
        const act = M.act == null ? target : M.act;
        M.act = act + (target - act) * Math.min(1, dt / (target > act ? D.up : D.down));
        return M.act;
    },
    // dt — мс; top — y поверхности
    bubbleStep(M, now, dt, top) {
        const B = this.BUBBLE, R = GreedJunk.METER, x = R.bx, ri = R.r - R.wall;
        M.fizz = Math.max(0, M.fizz - dt / 2600);
        // встряска от удара рычага — сверху настроения, но не выше полной силы
        const rate = Math.min(1, this.meterMood(M, now, dt) * (1 + M.fizz * 3));
        M.sites.forEach(s => {
            if (s.y < top + 2) return;                // точка над жидкостью — молчит
            s.next -= dt * rate;
            while (s.next <= 0) {
                s.next += s.every * (0.7 + Math.random() * 0.6);
                M.bubbles.push({ x: s.x, x0: s.x, y: s.y, v: 0.004 + Math.random() * 0.004, r: s.r0 * (0.8 + Math.random() * 0.4),
                    ph: Math.random() * 6.3, wob: 0.15 + Math.random() * 0.25 });
            }
        });
        // при встряске — ещё и россыпь из ниоткуда по всему столбику
        // шанс — на 16 мс, а не на вызов: шаг пузырей стал 33 мс, россыпь не
        // должна от этого редеть
        if (M.fizz > 0.2 && Math.random() < M.fizz * 0.5 * dt / 16) {
            const yy = top + 3 + Math.random() * (GreedJunk.meterY(0) - top), half = ri - 1.5;
            M.bubbles.push({ x: x + (Math.random() * 2 - 1) * half, x0: 0, y: yy, v: 0.01, r: 0.6 + Math.random() * 0.6, ph: Math.random() * 6.3, wob: 0.3 });
            M.bubbles[M.bubbles.length - 1].x0 = M.bubbles[M.bubbles.length - 1].x;
        }
        M.bubbles = M.bubbles.filter(b => {
            b.v = Math.min(B.vmax, b.v + B.a * dt);
            b.y -= b.v * dt;
            b.r = Math.min(B.rmax, b.r + B.grow * b.v * dt);
            b.ph += dt * 0.012;
            // не шире стенок: у стенки пузырёк отжимает внутрь
            b.x0 += (x - b.x0) * Math.min(1, dt * 0.004) * (Math.abs(b.x0 - x) > ri - 0.6 - b.r ? 1 : 0.05);
            b.x = b.x0 + Math.sin(b.ph) * b.wob * b.r;
            if (b.y <= top + b.r + 0.4) {
                // поднялся — в пенку у поверхности
                if (M.foam.length < B.foamMax) M.foam.push({ x: Math.max(x - ri + 0.6, Math.min(x + ri - 0.6, b.x)), r: b.r * 0.8, at: now, life: B.foamMs * (0.5 + Math.random()) });
                return false;
            }
            return true;
        });
        M.foam = M.foam.filter(f => now - f.at < f.life);
    },
    // пузырёк: прозрачный шарик в янтаре — светлее середина, тёмная кромка
    // по краю, белая искра сверху-слева (так пузырёк в пиве и блестит)
    // картинка пузырька, рисуется один раз: светлая середина, тёмная кромка
    // снизу, белая искра сверху-слева (так пузырёк в пиве и блестит)
    bubbleSprite(foam) {
        const k = foam ? '_foamSpr' : '_bubSpr';
        if (this[k]) return this[k];
        const C = PALETTE.greedJunk.reel.meter, n = 24, cv = document.createElement('canvas');
        cv.width = cv.height = n;
        const c = cv.getContext('2d'), m = n / 2, r = n / 2 - 1.5;
        c.globalAlpha = foam ? 0.75 : 0.35; c.fillStyle = foam ? C.glassHi : C.liquidHi;
        c.beginPath(); c.arc(m, m, r, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 0.55; c.strokeStyle = C.liquidLo; c.lineWidth = r * 0.28;
        c.beginPath(); c.arc(m, m, r, Math.PI * 0.1, Math.PI * 1.1); c.stroke();
        c.globalAlpha = 0.95; c.fillStyle = C.glassHi;
        c.beginPath(); c.arc(m - r * 0.35, m - r * 0.38, r * 0.32, 0, Math.PI * 2); c.fill();
        return (this[k] = cv);
    },

    BUBBLE_MS: 33,
    meterStep(now) {
        const M = this._meter, P = this.METER_SPRING, G = GreedJunk, R = G.METER;
        if (!M) return;
        const dt = Math.min(40, M.at ? now - M.at : 16);
        M.at = now;
        M.v += ((M.T - M.L) * P.k - P.c * M.v) * dt;
        M.L += M.v * dt;
        // мениск: перекос от наклона вбок (жидкость держит горизонт) и колыхание после удара
        const want = Hang.down() * 1.2;
        M.wv += ((want - M.w) * P.wk - P.wc * M.wv) * dt;
        M.w += M.wv * dt;
        const top = G.meterY(Math.max(0, Math.min(1, M.L)));
        // жидкость — только когда сдвинулась заметно глазу
        const key = top.toFixed(1) + ',' + M.w.toFixed(2);
        if (key !== M.shown) { M.shown = key; this.meterDraw(top, M.w); }
        // Пузырьки — BUBBLE_MS (30 к/с), готовыми картинками; под хомутами не
        // видны. Было — каждый кадр экрана, на iPhone 120 раз в секунду: сам
        // холст крошечный, но из-за него экран пересобирался каждый кадр, и
        // видеокарта не отдыхала ни мига. Пузырю в пиве 30 кадров хватает.
        const bdt = now - (M.bubAt || 0);
        if (bdt < this.BUBBLE_MS) return;
        M.bubAt = now;
        this.bubbleStep(M, now, Math.min(80, bdt), top);
        // пусто и было пусто — холст не трогаем вовсе
        const empty = !M.bubbles.length && !M.foam.length;
        if (empty && M.bubEmpty) return;
        M.bubEmpty = empty;
        const ctx = this.meterBub, B = this.METER_BOX, bs = this.bubbleSprite(false), fs = this.bubbleSprite(true);
        ctx.clearRect(B.x, B.y, B.w, B.h);
        const hid = (y) => R.clamps.some(c => Math.abs(c - y) < 3.6);
        M.bubbles.forEach(b => { if (!hid(b.y)) ctx.drawImage(bs, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2); });
        const ri = R.r - R.wall;
        M.foam.forEach(fo => {
            const u = (now - fo.at) / fo.life, k = (fo.x - R.bx) / ri, fy = top + 1.1 + (1 - k * k) * 0.9 - k * M.w - fo.r * 0.4;
            if (hid(fy)) return;
            ctx.globalAlpha = u > 0.85 ? (1 - u) / 0.15 : 1;
            ctx.drawImage(fs, fo.x - fo.r, fy - fo.r, fo.r * 2, fo.r * 2);
        });
        ctx.globalAlpha = 1;
    },

    // жидкость: колба полная, столбик до top; поверхность — мениск,
    // перекошенный наклоном и колыханием (w)
    meterDraw(top, w) {
        const G = GreedJunk, R = G.METER, B = this.METER_BOX, S = this.SCALE, C = PALETTE.greedJunk.reel.meter;
        const ctx = this.meterCv.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.meterCv.width, this.meterCv.height);
        ctx.setTransform(S, 0, 0, S, -B.x * S, -B.y * S);
        if (!this._meterIn) this._meterIn = new Path2D(G.meterPath(R.wall));
        const x = R.bx, ri = R.r - R.wall;
        ctx.save();
        // хомуты в корпусе — поверх стекла; жидкость под ними не рисуется,
        // иначе холст поверх корпуса закрывал бы их
        // видно стекло только между колпаками (они заходят на него на 3)
        ctx.beginPath();
        ctx.rect(B.x, R.y1 + 3, B.w, R.y0 - R.y1 - 6);
        R.clamps.forEach(y => ctx.rect(B.x, y + 3.5, B.w, -7));
        ctx.clip('evenodd');
        ctx.clip(this._meterIn);
        ctx.beginPath();
        ctx.moveTo(x - ri - 1, top + w);
        ctx.quadraticCurveTo(x, top + 2, x + ri + 1, top - w);
        ctx.lineTo(x + ri + 1, R.y0 + 1);
        ctx.lineTo(x - ri - 1, R.y0 + 1);
        ctx.closePath();
        // поперечный градиент цилиндра: у краёв темнее — стекло преломляет
        const gr = ctx.createLinearGradient(x - ri, 0, x + ri, 0);
        gr.addColorStop(0, C.liquidLo); gr.addColorStop(0.3, C.liquidHi); gr.addColorStop(0.55, C.liquid); gr.addColorStop(1, C.liquidLo);
        ctx.fillStyle = gr;
        ctx.fill();
        ctx.strokeStyle = C.liquidHi; ctx.lineWidth = 0.6; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.moveTo(x - ri, top + w + 0.4); ctx.quadraticCurveTo(x, top + 2.4, x + ri, top - w + 0.4); ctx.stroke();
        ctx.restore();
    },

    // стекло поверх жидкости и пузырьков: деления — один раз (блики —
    // своим слоем, за светом: meterGlareAt);
    // иначе столбик лежал бы на стекле, а не в нём
    meterGlassTop(ctx) {
        const G = GreedJunk, R = G.METER, C = PALETTE.greedJunk.reel.meter, x = R.bx;
        ctx.strokeStyle = PALETTE.greedJunk.tin[900]; ctx.lineWidth = 0.7; ctx.lineCap = 'round'; ctx.globalAlpha = 0.8;
        ctx.beginPath();
        for (let i = 1; i < 10; i++) {
            const y = G.meterY(i / 10), L = i === 5 ? R.r * 0.9 : R.r * 0.5;
            if (R.clamps.some(c => Math.abs(c - y) < 5)) continue;
            ctx.moveTo(x - R.r + R.wall + 0.8, y); ctx.lineTo(x - R.r + R.wall + 0.8 + L, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
    },
    // Блики колбы идут за светом, как у стекла пачинко. Было: две полосы
    // нарисованы намертво, а всё вокруг от наклона телефона меняло свет —
    // стекло колбы выглядело наклейкой (игрок).
    // Колба — вертикальный цилиндр: блик на нём — вертикальная полоса там,
    // где нормаль смотрит между светом и глазом. Её место поперёк колбы —
    // по x-составляющей этого направления (H = L + глаз); k — усиление,
    // чтобы ход был виден при наклоне в пару десятков градусов. У края
    // полоса сужается (ракурс) и гаснет. Рефлекс от стены напротив — слабая
    // узкая полоса с другой стороны, идёт навстречу.
    METER_GLARE: { k: 2.6, w: 2.6, glow: 7 },
    meterGlareAt(L) {
        const ctx = this.meterGlare;
        if (!ctx) return;
        const n = Math.hypot(L[0], L[1], L[2]) || 1, hx = L[0] / n, hz = L[2] / n + 1;
        const s = Math.max(-0.92, Math.min(0.92, hx / Math.hypot(hx, hz) * this.METER_GLARE.k));
        const key = s.toFixed(3);
        if (this._meterGlareKey === key) return;
        this._meterGlareKey = key;
        const G = GreedJunk, R = G.METER, C = PALETTE.greedJunk.reel.meter, x = R.bx, ri = R.r - R.wall, B = this.METER_BOX;
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
        ctx.strokeStyle = C.glassHi; ctx.lineCap = 'butt';
        const seg = (xx, wd, a) => {
            const ys = [R.y1 + 4].concat(...R.clamps.map(c => [c - 4.4, c + 4.4]), [R.y0 - 4]);
            ctx.globalAlpha = a; ctx.lineWidth = wd;
            ctx.beginPath();
            for (let i = 0; i < ys.length; i += 2) { ctx.moveTo(xx, ys[i]); ctx.lineTo(xx, ys[i + 1]); }
            ctx.stroke();
        };
        const face = Math.sqrt(1 - s * s), M = this.METER_GLARE;
        const xm = x + s * (ri - 1.4), xr = x - s * 0.35 * ri + (s < 0 ? 1 : -1) * (ri - 2) * 0.85;
        // мягкое сияние вокруг блика, сам блик, рефлекс
        seg(xm, M.glow * face + 1, 0.12 * face);
        seg(xm, M.w * face + 0.5, 0.25 + 0.4 * face);
        seg(xr, 1, 0.2 + 0.3 * face);
        ctx.globalAlpha = 1;
    }
});
