// ================= АППАРАТ АЛЧНОСТИ: БАНКА-МАГАЗИН =================
// Трёхлитровая банка-кошелёк (GreedJar3) на аппарате версии 1 — она же
// магазин прокачки (docs/plan/31-greed-premium.md, разд. 00).
//
//   покой     — банка на аппарате, на скотче число монет;
//   тап       — присед, прыжок на игрока с полным оборотом (на задней стороне
//               скотч подменяется магазином), пружина у камеры, магазин
//               проявляется по частям;
//   магазин   — тап по узлу на скотче: жетон алчности падает в горло и
//               пропадает за скотчем, удержание — поток с разгоном; узел
//               наполнился — галочка, игра открывается (Backend.greedDeposit);
//   выход     — тап вне скотча (по стеклу сверху): назад с обратным оборотом,
//               посадка с приседом.
//
// Холст банки — свой, во всю сцену (gj-stage), ПОД рамкой из монет и не
// обрезается краем аппарата: дно уходит под монеты (игрок, 17.11). Позы — в
// единицах поля аппарата (GreedJunk), сняты с 3D-болванки
// (tools/greed-lux-sketch/jar). Число монет считает прежняя банка
// (GreedJunkLit.jarStep) — её холст спрятан.
const GreedJarShop = {
    REST: { x: 305, y: 590, k: 161, roll: 18, yaw: -14, view: 0.16 },
    NEAR: { x: 179.7, y: 281.8, k: 1587, roll: 0, yaw: 0, view: 0.05 },
    OPEN: { crouch: 80, fly: 600, settle: 420 },     // мс
    CLOSE: { push: 70, fly: 450, land: 450 },
    // узлы на холсте магазина (доли) — для попадания пальцем
    NODES: { wheel: [0.22, 0.33], pachinko: [0.22, 0.69], v2: [0.69, 0.53] },

    attach(wrap) {
        const host = wrap.parentElement;
        if (!host || typeof GreedJar3 === 'undefined') return;
        this.wrap = wrap; this.host = host;
        if (this.cv) this.cv.remove();
        const cv = document.createElement('canvas');
        cv.style.cssText = 'position:absolute;left:0;top:0;z-index:6;pointer-events:none;background:none;touch-action:none';
        host.appendChild(cv);
        this.cv = cv;
        this.state = 'rest'; this.t0 = 0; this.drops = []; this.dirty = true; this.shown = null;
        this.tapeCv = null; this.shopCv = document.createElement('canvas');
        // тап по банке в покое — сцена ловит палец до аппарата
        wrap.addEventListener('pointerdown', (e) => this.restDown(e), true);
        cv.addEventListener('pointerdown', (e) => this.shopDown(e));
        const up = () => this.holdStop();
        cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', up);
        if (GreedJunkLit.jarCv) GreedJunkLit.jarCv.style.visibility = 'hidden';
    },

    // ---------- геометрия: поле аппарата → холст ----------
    fit() {
        const h = this.host, w = this.wrap;
        const W = h.offsetWidth, H = h.offsetHeight, dpr = Math.min(3, window.devicePixelRatio || 1);
        if (this.cv.width !== Math.round(W * dpr) || this.cv.height !== Math.round(H * dpr)) {
            this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
            this.cv.style.width = W + 'px'; this.cv.style.height = H + 'px';
            this.dirty = true;
        }
        // поле → точки сцены: аппарат в сцене по offset (без трансформов окна)
        const k = w.offsetWidth / GreedJunk.W;
        this.map = { ox: w.offsetLeft, oy: w.offsetTop, k, dpr };
    },
    toScene(x, y) { const M = this.map; return [M.ox + x * M.k, M.oy + (y - GreedJunk.Y0) * M.k]; },
    toField(e) {
        const r = this.host.getBoundingClientRect(), s = r.width / this.host.offsetWidth, M = this.map;
        const px = (e.clientX - r.left) / s, py = (e.clientY - r.top) / s;
        return [(px - M.ox) / M.k, (py - M.oy) / M.k + GreedJunk.Y0];
    },

    // ---------- позы ----------
    lerp(a, b, t) { return a + (b - a) * t; },
    pose(now) {
        const R = this.REST, N = this.NEAR, t = now - this.t0;
        const P = Object.assign({}, R, { sx: 1, sy: 1, shop: false, rev: 0, coins: true });
        const outC = (x) => 1 - Math.pow(1 - x, 3), inC = (x) => x * x * x;
        const inOut = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
        const spring = (s, f, d) => Math.exp(-d * s) * Math.sin(f * s);
        const between = (k, A, B) => { P.x = this.lerp(A.x, B.x, k); P.y = this.lerp(A.y, B.y, k); P.k = A.k * Math.pow(B.k / A.k, k); P.view = this.lerp(A.view, B.view, k); };
        const O = this.OPEN, C = this.CLOSE;
        if (this.state === 'opening') {
            if (t < O.crouch) { const q = Math.sin(t / O.crouch * Math.PI / 2); P.sy = 1 - 0.14 * q; P.sx = 1 + 0.08 * q; return P; }
            const u = Math.min(1, (t - O.crouch) / O.fly);
            if (u < 1) {
                const k = outC(u), b = Math.sin(u * Math.PI);
                between(k, R, N);
                P.y -= b * 70 * (1 - u * 0.4); P.x += b * 20;
                const st = Math.max(0, 1 - u / 0.22); P.sy = 1 + 0.12 * st; P.sx = 1 - 0.06 * st;
                P.roll = R.roll * (1 - k) - 11 * b;
                P.yaw = R.yaw + (372 - R.yaw) * inOut(u);
                P.shop = this.backSide(P.yaw); P.coins = true; P.rev = 0;
                return P;
            }
            this.state = 'open'; this.t0 = now - O.crouch - O.fly;
        }
        if (this.state === 'open') {
            const s = (t - O.crouch - O.fly) / 1000;
            between(1, R, N);
            P.k *= 1 + 0.03 * spring(s, 22, 7);
            P.yaw = 360 + 12 * Math.exp(-9 * s) * Math.cos(16 * s);
            P.roll = 2.5 * spring(s, 18, 6) + 0.35 * Math.sin(now / 1000 * 2.3);
            P.y += 1.2 * Math.sin(now / 1000 * 3.4);
            let rec = 0; this.drops.forEach(d => { const a = (now - d.at) / 1000; if (a >= 0 && a < 0.4) rec += Math.exp(-a * 16); });
            P.y += 2.5 * Math.min(1.5, rec); P.sy = 1 - 0.012 * Math.min(1.5, rec);
            P.shop = true; P.coins = s < 0.05; P.rev = Math.min(1, s / 0.4);
            return P;
        }
        if (this.state === 'closing') {
            if (t < C.push) { between(1, R, N); P.k *= 1 + 0.02 * Math.sin(t / C.push * Math.PI / 2); P.yaw = 360; P.roll = 0; P.shop = true; P.rev = 1; P.coins = false; return P; }
            const u = Math.min(1, (t - C.push) / C.fly);
            if (u < 1) {
                const k = inC(u) * 0.6 + u * 0.4, b = Math.sin(u * Math.PI);
                between(1 - k, R, N);
                P.y -= b * 60; P.x += b * 15;
                P.roll = R.roll * k + 9 * b;
                P.yaw = 360 + (R.yaw - 360) * inOut(u);
                P.shop = this.backSide(P.yaw); P.rev = 1; P.coins = true;
                return P;
            }
            const L = (t - C.push - C.fly) / 1000;
            if (L * 1000 > C.land) { this.state = 'rest'; this.dirty = true; this.cv.style.pointerEvents = 'none'; return P; }
            P.sy = 1 - 0.16 * spring(L, 26, 9); P.sx = 1 + 0.08 * spring(L, 26, 9);
            P.y -= 18 * Math.max(0, spring(L + 0.05, 20, 10));
            P.roll = R.roll - 2 * spring(L, 22, 8);
            return P;
        }
        return P;
    },
    // скотч на задней стороне — магазин (подмена, которой не видно)
    // Угол на открытии растёт от покоя (−14°) до 372°, на закрытии падает
    // обратно; скотч смотрит назад около 180°. Было: угол по модулю 360 —
    // в конце оборота (360…372°) снова «к игроку», и в упор на миг
    // возвращалось число монет, а магазин появлялся на глазах (игрок, 17.11).
    backSide(yaw) { return yaw > 180; },

    // ---------- кадр ----------
    step(now, coins) {
        if (!this.cv || !this.cv.isConnected) return;
        if (this.state === 'rest' && !this.dirty && this.shown === coins) return;
        this.fit();
        this.shown = coins;
        const P = this.pose(now), c = this.cv.getContext('2d'), M = this.map;
        c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height);
        c.setTransform(M.dpr, 0, 0, M.dpr, 0, 0);
        const [sx, sy] = this.toScene(P.x, P.y);
        // Холсты скотча пересобираются, только когда меняется то, что на них
        // нарисовано: число монет; состояние магазина (счётчики, нажатие,
        // проявление и подскок числа — по ступенькам). Было: оба холста
        // (рукописный магазин 960×1520) — каждый кадр полёта.
        const tn = P.shop ? '' : coins;
        if (this.tapeN !== tn) { this.tapeCv = GreedJar3.tapeCoins(tn, 1200, this.tapeCv || undefined); this.tapeN = tn; }
        let shop = null;
        if (P.shop) {
            this.shopState(now, P.rev);
            const key = JSON.stringify(this.sst);
            if (key !== this.shopKey) { GreedJar3.tapeShop(this.sst, this.shopCv); this.shopKey = key; }
            shop = this.shopCv;
        }
        // жетоны в горле: падают от верха кадра, ниже верха скотча — за ним
        const drops = [];
        this.drops = this.drops.filter(d => {
            const a = (now - d.at) / 1000;
            // «в упор» видна полоса стекла ~0,59…0,71 высоты банки — жетон
            // появляется над краем кадра и за ~0,3 с уходит за скотч
            if (a > 0.45) return false;
            drops.push({ y: 0.8 - 0.35 * a - 1.6 * a * a, x: d.x, rot: d.rot + a * 7, tilt: d.tilt + a * 11 });
            return true;
        });
        // в покое монеты рисуются сами (чётко, один раз); в полёте — готовой
        // картинкой (coinRes — её разрешение, точек на высоту банки)
        GreedJar3.draw(c, { cx: sx, cy: sy, k: P.k * M.k, roll: P.roll, yaw: P.yaw, view: P.view, sx: P.sx, sy: P.sy,
            tape: this.tapeCv, shop, coins: P.coins, drops: P.shop ? drops : null,
            coinRes: this.state === 'rest' ? 0 : this.coinRes() });
        this.pose_ = P;
        this.dirty = this.state !== 'rest';
        if (this.state === 'rest' && !this._csAt) this._csAt = setTimeout(() => GreedJar3.coinSprite(PALETTE.greedCoin.gold, this.coinRes()), 1500);
    },
    // разрешение картинки монет: как у банки в середине полёта (крупнее —
    // монеты уже за скотчем)
    coinRes() { return Math.min(2400, 900 * this.map.k * this.map.dpr); },
    shopState(now, rev) {
        const J = Backend.greedJar(), pop = {};
        // подскок числа — 4 ступеньки по 60 мс, потом покой (кэш холста)
        (this.pops || []).forEach(p => { const a = (now - p.at) / 1000; if (a < 0.24) pop[p.k] = Math.round(a / 0.06) * 0.06; });
        rev = Math.round(rev * 8) / 8;     // проявление — 8 ступенек за 0,4 с
        this.sst = { wheel: J.wheel, pach: J.pachinko, v2: J.v2, need: { wheel: J.need.wheel, pach: J.need.pachinko, v2: J.need.v2 },
                     have: J.have, press: this.hold ? (this.hold.node === 'pachinko' ? 'pach' : this.hold.node) : null, pop, rev };
    },

    // ---------- палец ----------
    // Что стало с последним тапом по банке — в панель 🐞 алчности: на
    // телефоне консоли нет, а «не открывается» бывает от разного.
    note(t) { this.lastTap = t; if (typeof GreedDebug !== 'undefined' && GreedDebug.render) GreedDebug.render(); },
    restDown(e) {
        if (this.state !== 'rest') return;
        if (!this.map) { this.note('нет раскладки'); return; }
        const [x, y] = this.toField(e), R = this.REST;
        // банка наклонена: попадание — в эллипс вокруг её середины
        const dx = (x - R.x) / (R.k * 0.36), dy = (y - R.y) / (R.k * 0.55);
        if (dx * dx + dy * dy > 1) { if (dx * dx + dy * dy < 4) this.note(`мимо ${Math.round(x)},${Math.round(y)}`); return; }
        this.note('открыта');
        // У версии 2 магазина нет — но только когда версия 2 нарисована.
        // Было: проверка по виду (GreedSkin), а вид 2 включён в 🐞 и пока
        // рисует ту же банку версии 1 — тап молча ничего не делал (игрок).
        if (this.isV2 && this.isV2()) return;
        e.preventDefault(); e.stopPropagation();
        this.state = 'opening'; this.t0 = performance.now(); this.dirty = true;
        this.cv.style.pointerEvents = 'auto';
        if (typeof Haptics !== 'undefined') Haptics.tick();
        if (GreedJunkLit.run && GreedJunkLit._wake) GreedJunkLit._wake();
    },
    // точка на холсте магазина (доли) → поле аппарата при позе «в упор»
    shopToField(fu, fv) {
        const N = this.NEAR, T = GreedJar3.TAPE, W = GreedJar3.SHOP_WIN, rr = GreedJar3.R * 1.012;
        const a = ((W.u0 + fu * (W.u1 - W.u0)) - 0.5) * T.arc * Math.PI / 180;
        const lx = rr * Math.sin(a), ly = -T.y1 + rr * Math.cos(a) * N.view + fv * (T.y1 - T.y0);
        return [N.x + lx * N.k, N.y + (ly + 0.5) * N.k];
    },
    shopDown(e) {
        if (this.state !== 'open') return;
        e.preventDefault();
        const [x, y] = this.toField(e), top = this.shopToField(0.5, 0)[1];
        if (y < top) { this.close(); return; }                      // мимо скотча — выход
        let best = null, bd = 1e9;
        Object.entries(this.NODES).forEach(([k, [fu, fv]]) => {
            const [nx, ny] = this.shopToField(fu, fv), d = Math.hypot(x - nx, y - ny);
            if (d < bd) { bd = d; best = k; }
        });
        if (!best || bd > 75) return;
        this.hold = { node: best, next: 0, dt: 320 };
        this.deposit();
    },
    deposit() {
        const H = this.hold;
        if (!H) return;
        const r = Backend.greedDeposit(H.node);
        if (!r.ok) {
            if (typeof Haptics !== 'undefined' && Haptics.notify) Haptics.notify('error');
            this.hold = null; return;
        }
        const now = performance.now();
        this.drops.push({ at: now, x: (Math.random() - 0.5) * 0.08, rot: Math.random() * 6, tilt: Math.random() * 3 });
        this.pops = (this.pops || []).filter(p => p.k !== H.node).concat([{ k: H.node === 'pachinko' ? 'pach' : H.node, at: now }]);
        if (typeof Haptics !== 'undefined') Haptics.tick();
        if (r.opened) { this.hold = null; this.opened(H.node); return; }
        // поток: каждый следующий быстрее
        H.timer = setTimeout(() => { if (this.hold === H) { H.dt = Math.max(60, H.dt * 0.8); this.deposit(); } }, H.dt);
    },
    holdStop() { if (this.hold && this.hold.timer) clearTimeout(this.hold.timer); this.hold = null; },
    // Узел наполнился: галочка, банка возвращается, аппарат собирается
    // заново уже с игрой. Сборка по запчастям за стеклом — следующий шаг
    // (план 31, «Открытие игры»).
    opened(node) {
        if (typeof Haptics !== 'undefined' && Haptics.notify) Haptics.notify('success');
        setTimeout(() => {
            this.close();
            setTimeout(() => { if (typeof GreedDebug !== 'undefined' && GreedDebug.rebuild) GreedDebug.rebuild(); }, this.CLOSE.push + this.CLOSE.fly + this.CLOSE.land + 100);
        }, 700);
    },
    close() {
        if (this.state !== 'open') return;
        this.holdStop();
        this.state = 'closing'; this.t0 = performance.now(); this.dirty = true;
    },

    // устье банки в покое — откуда монета летит в щель (поле аппарата)
    mouth() {
        const R = this.REST, a = R.roll * Math.PI / 180, top = -0.5 * R.k;
        return [R.x + Math.sin(a) * top, R.y + Math.cos(a) * top];
    }
};

// Крючки в банку версии 1: холст новой банки — рядом с прежним (тот спрятан),
// число монет считает прежняя, монета в щель летит из нового устья.
(function () {
    const L = GreedJunkLit;
    const mount = L.jarMount, step = L.jarStep, paint = L.jarPaint, coinIn = L.coinIn;
    L.jarMount = function (wrap) { mount.call(this, wrap); GreedJarShop.attach(wrap); };
    L.jarPaint = function () { return GreedJarShop.cv ? true : paint.call(this); };
    L.jarStep = function (now) {
        step.call(this, now);
        if (this._jar) GreedJarShop.step(now, this._jar.val == null ? this.jarValue() : this._jar.val);
    };
    L.coinIn = function () {
        if (!GreedJarShop.cv || !this.coinCv) return coinIn.call(this);
        const G = GreedJunk, [sx, sy] = G.wcSlotAt(), [x1, y1] = G.wcPt(sx, sy), [x0, y0] = GreedJarShop.mouth();
        this._coins.push({ at: performance.now(), x0, y0: y0 + 4, x1, y1, rim: y0 + 1, rot1: G.WC_AT.rot * Math.PI / 180 });
    };
})();
