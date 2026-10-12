// ================= ЖУРНАЛ: ВЗЛЁТ И РАЗВОРОТ =================
// Вход в магазин похоти (docs/plan/21-lust-bath.md, разд. 7б). Замысел
// игрока: тап по журналу на унитазе — он взлетает, на лету выпрямляется и
// разворачивается обложкой к игроку, приближается и встаёт на место будущего
// меню, около секунды; чуть раньше остановки обложка открывается и
// заворачивается за журнал, за ней пролистываются ещё несколько страниц — и
// перед игроком во весь размер страница-прилавок.
//
// ---------- КАК ЖУРНАЛ ВЗЛЕТАЕТ ИМЕННО С ТОГО МЕСТА, ГДЕ ЛЕЖИТ ----------
// Сцена ванной запечена камерой (fov 20°, tools/bake-3d.js), и эта камера в
// css-3d повторяется ТОЧНО: перспектива K, начало перспективы — точка (360,
// 760) сцены, точка мира (X, Y, Z) — это (X, −(Y − 4.2), K − (46 − Z)).
// Генератор (tools/gen-mag-geo.py) отдаёт журнал на унитазе в этих числах —
// две пластины: от стопки до кромки носика (A) и висящая часть (B). Первый
// кадр полёта совпадает с картинкой на унитазе, дальше журнал — твёрдое тело
// ПОСТОЯННОГО размера: к игроку он растёт сам, потому что приближается.
// Висящая пластина на лету выпрямляется к первой.
//
// ---------- ПОЧЕМУ ВСЁ НА ВИДЕОКАРТЕ ----------
// Каждый кадр меняется только transform (полёт, поворот, перелистывание) и
// прозрачность затемнения — ни одной перерисовки. Локальный размер журнала
// равен размеру меню на экране: слой с 3d-преобразованием растрируется в
// своих точках, и маленький журнал, растянутый преобразованием, вышел бы
// мыльным.
//
// ---------- ЧТО ЗДЕСЬ НЕ РЕШАЕТСЯ ----------
// Цены, списание, потолок — LustShop / Backend (инвариант 2). Здесь показ.

const LustMag = {
    FLY: 1000,          // полёт до места меню, мс
    STRAIGHT: 420,      // висящая часть выпрямляется
    OPEN_AT: 780,       // обложка начинает открываться — чуть раньше остановки
    TURN: 680,          // одна страница от закрытой до «за журналом»
    STAGGER: 115,       // следующая страница — вдогонку
    PAGES: 3,           // сколько страниц пролистывается до прилавка
    BACK: 620,          // обратный полёт
    WIDTH: 330,         // ширина меню в точках холста

    host: null, root: null, isOpen: false, busy: false, raf: 0,

    init(host) {
        this.host = host;
        if (this.root) return;
        const scr = host.screenElement;
        const R = document.createElement('div');
        R.id = 'bt-mag-fly';
        R.className = 'bm-fly';
        R.innerHTML = `
            <div class="bm-dim"></div>
            <div class="bm-space"><div class="bm-persp"><div class="bm-mag">
                <div class="bm-back"></div>
                <div class="bm-shop"></div>
                ${Array.from({ length: this.PAGES }, (_, i) => `<div class="bm-page" data-i="${i}"><div class="bm-f"></div><div class="bm-r"></div></div>`).join('')}
                <div class="bm-cover"><div class="bm-a"></div><div class="bm-b"></div><div class="bm-in"></div></div>
            </div></div></div>`;
        scr.appendChild(R);
        this.root = R;
        this.$ = (sel) => R.querySelector(sel);
        // Тап мимо журнала — закрыть. По журналу тапы ловит прилавок.
        R.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            if (this.busy || !this.isOpen) return;
            if (this.$('.bm-mag').contains(e.target)) return;
            this.close();
        });
    },

    // ---------- ГЕОМЕТРИЯ ----------
    // Холст ванной → точки обёртки (stageMap) и камера (cam): всё переводится
    // в точки холста игры, где меню имеет размер WIDTH.
    frame() {
        const h = this.host, c = h.cam, M = h.stageMap();
        const F = BATH_MAG.GEO.top.fly, [CW, CH] = BATH_MAG.GEO.top.size;
        const LW = this.WIDTH, LH = LW * CH / CW;
        return { c, M, F, LW, LH, K: F.K * c.s, O: [c.tx + c.s * F.origin[0], c.ty + c.s * F.origin[1]] };
    },
    // Начальная поза: базис пластины A (x — от корешка, y — к носику, z —
    // наружу), масштаб «мир на точку журнала», угол выпрямления B.
    startPose(G) {
        const A = G.F.A, B = G.F.B, V = this.vec;
        // Глубины в генераторе — для перспективы K; здесь она K·s (камера
        // ванной масштабирует холст): z = K − d сдвигается вместе с ней.
        const p0 = [A.p0[0], A.p0[1], A.p0[2] - G.F.K + G.K];
        const x = V.unit(A.e1), y = V.unit(V.sub(A.e2, V.mul(x, V.dot(A.e2, x)))), z = V.cross(x, y);
        const k = V.len(A.e1) / G.LW;
        const by = V.unit(B.e2), beta = Math.atan2(V.dot(by, z), V.dot(by, y));
        const C = V.add(p0, V.add(V.mul(x, k * G.LW / 2), V.mul(y, k * G.LH / 2)));
        return { R: [x, y, z], k, C, beta };
    },
    // Конечная поза: лицом к игроку, по центру холста, той же величины в мире
    // — значит на глубине, где она видна шириной LW.
    endPose(G, k) {
        const d = G.K * k;                                     // глубина, где 1 точка журнала = 1 точка экрана
        const sx = 195, sy = 430;
        return { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], k,
                 C: [(sx - G.O[0]) * d / G.K, (sy - G.O[1]) * d / G.K, G.K - d], beta: 0 };
    },
    matrix(P, G) {
        const [x, y, z] = P.R, k = P.k, V = this.vec;
        const t = V.sub(P.C, V.add(V.mul(x, k * G.LW / 2), V.mul(y, k * G.LH / 2)));
        const n = (v) => v.toFixed(6);
        return `translate(${G.O[0].toFixed(3)}px, ${G.O[1].toFixed(3)}px) perspective(${G.K.toFixed(3)}px) ` +
               `matrix3d(${[...x.map(v => v * k), 0, ...y.map(v => v * k), 0, ...z.map(v => v * k), 0, ...t, 1].map(n).join(',')})`;
    },

    // ---------- ОТКРЫТЬ ----------
    open() {
        if (this.busy || this.isOpen) return;
        this.init(this.host);
        const G = this.frame(), P0 = this.startPose(G), P1 = this.endPose(G, P0.k);
        this.G = G; this.P0 = P0; this.P1 = P1;
        const R = this.root, mag = this.$('.bm-mag');
        // Размеры в точках журнала; обложка — та же картинка, что на унитазе.
        const url = 'src/minigames/lust/mag-cover.jpg';
        mag.style.width = G.LW + 'px'; mag.style.height = G.LH + 'px';
        const split = G.F.split / BATH_MAG.GEO.top.size[1] * G.LH;
        for (const el of [this.$('.bm-a'), this.$('.bm-b')]) {
            el.style.backgroundImage = `url(${url})`;
            el.style.backgroundSize = `${G.LW}px ${G.LH}px`;
        }
        this.$('.bm-a').style.height = split + 'px';
        const b = this.$('.bm-b');
        b.style.top = split + 'px'; b.style.height = (G.LH - split) + 'px';
        b.style.backgroundPosition = `0 ${-split}px`;
        const sp = this.$('.bm-space');
        sp.style.transform = `translate(${G.M.ox}px, ${G.M.oy}px) scale(${G.M.m})`;
        // Перспектива вписана В САМО преобразование журнала: translate(O)
        // perspective(K) matrix3d(поза). Свойством perspective на родителе с
        // началом в точке камеры Chrome рисовал журнал на 30 точек мимо того
        // места, что считала раскладка, и не прятал обороты страниц.
        this.renderShop();
        this.resetPages();
        mag.style.transform = this.matrix(P0, G);
        b.style.transform = `rotateX(${P0.beta}rad)`;
        R.classList.add('on');
        this.isOpen = true; this.busy = true;
        // Журнал на унитазе прячется: летит он сам. Холст сцены
        // перерисуется один раз — это не покадровая правка.
        this.sceneMag(false);
        if (typeof BATH_MAG !== 'undefined') BATH_MAG.call.reset();
        if (typeof Haptics !== 'undefined') Haptics.impact('light');
        this.run(this.OPEN_AT + this.TURN + this.STAGGER * this.PAGES + 60, (e) => this.openFrame(e), () => { this.busy = false; });
    },
    openFrame(e) {
        const G = this.G, f = Math.min(1, e / this.FLY);
        // Полёт: быстро отрывается, мягко встаёт; по дороге приподнимается
        // дугой — взлетает, а не ползёт к камере.
        const u = this.ease(f), V = this.vec;
        const C = V.add(V.lerp(this.P0.C, this.P1.C, u), [0, -Math.sin(Math.PI * u) * 0.35 * this.P0.k * G.LW, 0]);
        const R = this.slerpR(this.P0.R, u);
        // Левитация у места: лёгкое покачивание, гаснущее к концу.
        const wob = f > 0.75 ? Math.sin((e - 0.75 * this.FLY) / 140) * 0.03 * (1 - Math.min(1, (e - this.FLY) / 900)) : 0;
        const Rw = wob ? this.mulR(R, this.rotX(wob)) : R;
        this.$('.bm-mag').style.transform = this.matrix({ R: Rw, k: this.P0.k, C }, G);
        const s = Math.min(1, e / this.STRAIGHT);
        this.$('.bm-b').style.transform = `rotateX(${(this.P0.beta * (1 - this.easeOut(s))).toFixed(4)}rad)`;
        this.$('.bm-dim').style.opacity = Math.min(1, e / this.FLY).toFixed(3);
        // Обложка и страницы: от 0 до −340° вокруг корешка — открываются и
        // заворачиваются за журнал.
        this.turn('.bm-cover', e - this.OPEN_AT);
        this.$$('.bm-page').forEach((p, i) => this.turn(p, e - this.OPEN_AT - this.STAGGER * (i + 1)));
    },
    turn(el, t) {
        if (typeof el === 'string') el = this.$(el);
        const u = Math.max(0, Math.min(1, t / this.TURN));
        this.setTurn(el, -340 * this.ease(u));
    },
    // Страница (или обложка) повёрнута на a° вокруг корешка. Какая сторона
    // смотрит на игрока, решает ЭТОТ код, а не backface-visibility, и
    // ушедшая за журнал страница гаснет здесь же, а не прячется сортировкой
    // по глубине: без видеокарты Chrome не делает ни того, ни другого, и
    // оборот обложки лежал поверх её лица. Так одинаково везде.
    //   0…−90°     — лицо к игроку;
    //   −90…−265°  — оборот (страница ушла влево и смотрит изнанкой);
    //   дальше     — за журналом, не видна.
    setTurn(el, a) {
        el.style.transform = `translateZ(${el.dataset.z || 0}px) rotateY(${a.toFixed(2)}deg)`;
        const face = a > -90, gone = a <= -265;
        el.style.visibility = gone ? 'hidden' : '';
        const isCover = el.classList.contains('bm-cover');
        const fronts = isCover ? el.querySelectorAll('.bm-a, .bm-b') : el.querySelectorAll('.bm-f');
        const backs = isCover ? el.querySelectorAll('.bm-in') : el.querySelectorAll('.bm-r');
        fronts.forEach(f => { f.style.display = face ? '' : 'none'; });
        backs.forEach(b => { b.style.display = face ? 'none' : ''; });
    },

    // ---------- ЗАКРЫТЬ ----------
    close() {
        if (this.busy || !this.isOpen) return;
        this.busy = true;
        const G = this.G, T = this.BACK;
        this.$$('.bm-page').forEach(p => { p.style.visibility = 'hidden'; });
        this.run(T + 260, (e) => {
            // Обложка возвращается на место, журнал летит обратно и ложится.
            const c = Math.min(1, e / 260);
            this.setTurn(this.$('.bm-cover'), -340 * (1 - this.ease(c)));
            const f = Math.max(0, Math.min(1, (e - 160) / T)), u = this.ease(f), V = this.vec;
            const C = V.add(V.lerp(this.P1.C, this.P0.C, u), [0, -Math.sin(Math.PI * u) * 0.2 * this.P0.k * G.LW, 0]);
            this.$('.bm-mag').style.transform = this.matrix({ R: this.slerpR(this.P0.R, 1 - u), k: this.P0.k, C }, G);
            this.$('.bm-b').style.transform = `rotateX(${(this.P0.beta * Math.max(0, (f - 0.55) / 0.45)).toFixed(4)}rad)`;
            this.$('.bm-dim').style.opacity = (1 - f).toFixed(3);
        }, () => {
            this.root.classList.remove('on');
            this.sceneMag(true);
            this.isOpen = false; this.busy = false;
        });
    },

    // Сброс без анимации — игра закрылась посреди полёта.
    hide() {
        cancelAnimationFrame(this.raf); this.raf = 0;
        if (this.root) this.root.classList.remove('on');
        this.sceneMag(true);
        this.isOpen = false; this.busy = false;
    },

    sceneMag(on) {
        const g = document.getElementById('bt-mag-top');
        if (g) g.style.visibility = on ? '' : 'hidden';
    },
    resetPages() {
        const cov = this.$('.bm-cover');
        cov.dataset.z = 4; this.setTurn(cov, 0);
        this.$$('.bm-page').forEach((p, i) => { p.dataset.z = 3 - i * 0.8; this.setTurn(p, 0); });
    },

    // ---------- ПРИЛАВОК НА СТРАНИЦЕ ----------
    // Пока — схема вёрстки (замысел игрока): три рекламных блока лесенкой,
    // картинка товара — акцент с одной стороны, к другой «размазывается»
    // поле прокачки; корзинка вшита в рекламу. Рисунок рекламы — следующая
    // работа художника; механика покупки — уже настоящая.
    renderShop() {
        const el = this.$('.bm-shop');
        if (!el || typeof LustShop === 'undefined') return;
        const u = LustShop.conf(), keys = (u.order || []);
        const row = (key, i) => {
            const b = u[key], lvl = LustShop.level(key), n = b.levels.length;
            const lv = b.levels[lvl], price = lv && lv.price, cur = price && Object.keys(price)[0];
            const can = price && LustShop.affordable(price);
            const cells = Array.from({ length: n }, (_, j) => `<i class="${j < lvl ? 'on' : ''}"></i>`).join('');
            return `<div class="bm-ad bm-ad${i % 2 ? 'r' : 'l'}" data-key="${key}">
                <span class="bm-pic"><svg viewBox="-34 -34 68 68">${LustShop.art(key)}</svg></span>
                <span class="bm-field">${cells}</span>
                ${price ? `<span class="bm-price">${TokenArt.svg('lust_token', 0, { whole: true })}<b>${price[cur]}</b></span>` : '<span class="bm-price bm-max">✓</span>'}
                ${can ? '<button type="button" class="bm-cart" aria-label="cart">🛒</button>' : ''}
            </div>`;
        };
        el.innerHTML = `<div class="bm-wallet">${TokenArt.svg('lust_token', 0, { whole: true })}<b>${GameState.currency('lust_token')}</b></div>` +
                       keys.map(row).join('');
        // Попадание считается по экранным прямоугольникам рекламы и корзинки,
        // а не по цели события: внутри 3d-журнала Chrome отдаёт тап самой
        // странице, а не её детям. В конечной позе журнал смотрит прямо на
        // игрока, и прямоугольники точные.
        el.onpointerdown = (e) => {
            e.stopPropagation();
            if (this.busy) return;
            const inR = (n) => { if (!n) return false; const r = n.getBoundingClientRect();
                return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
            const ad = [...el.querySelectorAll('.bm-ad')].find(inR);
            if (!ad) return;
            const c = ad.querySelector('.bm-cart');
            if (inR(c)) { LustShop.buy(ad.dataset.key); this.renderShop(); return; }
            // Тап по рекламе не покупает — подсвечивает корзинку.
            if (!c) return;
            c.classList.remove('bm-glow'); void c.offsetWidth; c.classList.add('bm-glow');
        };
    },

    // ---------- ЧАСЫ ----------
    run(ms, frame, done) {
        cancelAnimationFrame(this.raf);
        const t0 = performance.now();
        const step = (now) => {
            const e = now - t0;
            frame(Math.min(e, ms));
            if (e < ms) { this.raf = requestAnimationFrame(step); return; }
            this.raf = 0; if (done) done();
        };
        this.raf = requestAnimationFrame(step);
    },
    $$(sel) { return Array.from(this.root.querySelectorAll(sel)); },
    ease(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; },
    easeOut(u) { return 1 - Math.pow(1 - u, 3); },

    // ---------- ВЕКТОРЫ И ПОВОРОТЫ ----------
    vec: {
        add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
        sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
        mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
        dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
        cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
        len: (a) => Math.hypot(a[0], a[1], a[2]),
        unit: (a) => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; },
        lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
    },
    // Поворот из базиса R0 (столбцы x, y, z) в единичный — сферически: журнал
    // разворачивается по кратчайшей дуге, а не сплющивается по пути.
    slerpR(R0, t) {
        const q = this.quat(R0), q1 = [0, 0, 0, 1];
        let d = q[0] * q1[0] + q[1] * q1[1] + q[2] * q1[2] + q[3] * q1[3];
        const s = d < 0 ? -1 : 1; d = Math.abs(d);
        let a, b;
        if (d > 0.9995) { a = 1 - t; b = t; }
        else { const th = Math.acos(d), sn = Math.sin(th); a = Math.sin((1 - t) * th) / sn; b = Math.sin(t * th) / sn; }
        const r = [q[0] * a + s * q1[0] * b, q[1] * a + s * q1[1] * b, q[2] * a + s * q1[2] * b, q[3] * a + s * q1[3] * b];
        const n = Math.hypot(...r);
        return this.mat(r.map(v => v / n));
    },
    quat(R) {   // R — столбцы
        const m00 = R[0][0], m10 = R[0][1], m20 = R[0][2], m01 = R[1][0], m11 = R[1][1], m21 = R[1][2], m02 = R[2][0], m12 = R[2][1], m22 = R[2][2];
        const tr = m00 + m11 + m22;
        if (tr > 0) { const S = Math.sqrt(tr + 1) * 2; return [(m21 - m12) / S, (m02 - m20) / S, (m10 - m01) / S, 0.25 * S]; }
        if (m00 > m11 && m00 > m22) { const S = Math.sqrt(1 + m00 - m11 - m22) * 2; return [0.25 * S, (m01 + m10) / S, (m02 + m20) / S, (m21 - m12) / S]; }
        if (m11 > m22) { const S = Math.sqrt(1 + m11 - m00 - m22) * 2; return [(m01 + m10) / S, 0.25 * S, (m12 + m21) / S, (m02 - m20) / S]; }
        const S = Math.sqrt(1 + m22 - m00 - m11) * 2; return [(m02 + m20) / S, (m12 + m21) / S, 0.25 * S, (m10 - m01) / S];
    },
    mat(q) {    // кватернион → столбцы
        const [x, y, z, w] = q;
        return [[1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
                [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
                [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)]];
    },
    rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, s], [0, -s, c]]; },
    mulR(A, B) {  // столбцы: (A·B)[:, j] = A · B[:, j]
        return B.map(col => [0, 1, 2].map(i => A[0][i] * col[0] + A[1][i] * col[1] + A[2][i] * col[2]));
    }
};
