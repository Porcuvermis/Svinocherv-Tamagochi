// ================= АППАРАТ АЛЧНОСТИ, ВЕРСИЯ 2: НИЗ =================
// Продолжение GreedLux (план 31, разд. 5а, этап 5). Цоколь живой:
//   табло ставки и табло копилки — красные светодиоды по сетке, которую
//     запёк корпус погашенной (machine.py, dot_grid): игра только зажигает;
//   монета — на рывке и на запуске колеса/шарика вылетает из копилки,
//     дугой, кувыркаясь, к пятаку-щели и уходит в него ребром;
//   лоток — выигрыш сыплется монетами из-под верхнего борта, куча копится
//     (монеты — движком рамки окна, GreedCoins: свет и блик от наклона);
//   шкала — жидкое золото своей картой (liquid-*), шейдер корпуса рисует её
//     срезом до уровня: блеск стекла тот же; мениск и пузырьки — поверх.
// Тап по табло ставки — следующая ставка (Backend.greedBets: 1/3/10/100 с
// версии 2); ставку читает экран алчности (GreedMinigame.bet).
Object.assign(GreedLux, {
    BOT: {
        tray: { rad: 6.2, g: 0.0011, max: 60, bounce: 0.28, cols: 14 },
        coin: { ms: 620, inMs: 150, rad: 7, turns: 2, lift: 70 },
        count: 45,                 // мс на шаг счёта табло копилки
        meter: { k: 0.06, bubbleMs: 380 }
    },
    // Цифры 3×7 — те же, что в эскизе (machine.py, DOT), и «x» ставки
    DOTS: {
        0: ['111', '101', '101', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '010', '010', '111'],
        2: ['111', '001', '001', '111', '100', '100', '111'], 3: ['111', '001', '001', '111', '001', '001', '111'],
        4: ['101', '101', '101', '111', '001', '001', '001'], 5: ['111', '100', '100', '111', '001', '001', '111'],
        6: ['111', '100', '100', '111', '101', '101', '111'], 7: ['111', '001', '001', '010', '010', '010', '010'],
        8: ['111', '101', '101', '111', '101', '101', '111'], 9: ['111', '101', '101', '111', '001', '001', '111'],
        x: ['000', '000', '101', '010', '101', '000', '000']
    },

    // холст поверх аппарата на участке поля [x, y, w, h], k точек на единицу
    botCanvas(wrap, x, y, w, h, z) {
        const cv = document.createElement('canvas'), k = this.K;
        cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
        cv.style.cssText = `position:absolute;left:${x / this.W * 100}%;top:${(y - this.Y0) / this.H * 100}%;` +
            `width:${w / this.W * 100}%;height:${h / this.H * 100}%;z-index:${z || 2};pointer-events:none;background:none`;
        wrap.appendChild(cv);
        cv._b = [x, y, w, h];
        return cv;
    },

    bottomMount(wrap) {
        const L = this.meta.live;
        if (!L || !L.bet) return;
        this._bot = { held: 0, shown: null, coins: [], tray: null, met: null, betShown: null };
        // табло
        this.betCv = this.botCanvas(wrap, L.bet[0], L.bet[1], L.bet[2] - L.bet[0], L.bet[3] - L.bet[1]);
        this.balCv = this.botCanvas(wrap, L.bal[0], L.bal[1], L.bal[2] - L.bal[0], L.bal[3] - L.bal[1]);
        // копилка и монета в полёте — один холст движка монет
        this.pigMount(wrap);
        // лоток: проём формы (рисунок — plinth, отступ 5 от кромки)
        const T = L.tray;
        this.trayCv = this.botCanvas(wrap, T[0] + 5, T[1] + 5, T[2] - T[0] - 10, T[3] - T[1] - 10, 2);
        this.trayCv.style.borderRadius = '5px';
        this._bot.tray = { coins: [], falling: [], queue: 0, nextAt: 0, h: new Array(this.BOT.tray.cols).fill(0), dirty: true };
        // шкала: мениск и пузырьки поверх жидкости
        if (L.liquid) {
            const q = L.liquid;
            this.metCv = this.botCanvas(wrap, q[0], q[1], q[2], q[3], 2);
            this.metCv.style.borderRadius = '40% / 4.5%';
            const v = this.meterValue();
            this._bot.met = { L: v, T: v, v: 0, drawn: null, bubbles: [], nextAt: 0, slosh: 0 };
        }
        // тап по табло ставки — следующая ставка
        wrap.addEventListener('pointerdown', (e) => {
            const [x, y] = GreedJunk.toField(e, wrap), b = L.bet;
            if (x < b[0] - 4 || x > b[2] + 4 || y < b[1] - 4 || y > b[3] + 4) return;
            e.preventDefault(); e.stopPropagation();
            this.betNext();
        });
        this.screensDraw(performance.now(), true);
    },

    // ---------- ставка ----------
    bets() {
        return typeof Backend !== 'undefined' && Backend.greedBets ? Backend.greedBets('slots') : [1];
    },
    betNow() {
        const list = this.bets(), b = typeof GreedMinigame !== 'undefined' ? GreedMinigame.bet : null;
        return list.indexOf(b) >= 0 ? b : list[0];
    },
    betNext() {
        const list = this.bets();
        // Во время игр — тоже: каждая уже идёт за свою ставку (исход и выплата
        // решены на старте, res), новая ставка — только для следующих
        // (игрок, 18.11: три игры идут разом, ждать конца всех — нельзя).
        if (typeof GreedMinigame === 'undefined' || list.length < 2) {
            if (typeof Haptics !== 'undefined') Haptics.notify('error', true);
            this._bot.betFlash = performance.now();
            return;
        }
        GreedMinigame.bet = list[(list.indexOf(this.betNow()) + 1) % list.length];
        if (typeof Haptics !== 'undefined') Haptics.tick();
        this._bot.betFlash = performance.now();
    },

    // ---------- копилка ----------
    // число на табло — кошелёк без придержанного выигрыша (как банка
    // гаражного, greed-junk-jar.js): ставка уходит сразу, выигрыш — когда выпал
    jarHold(d) { if (this._bot) this._bot.held = d === null ? 0 : Math.max(0, this._bot.held + d); },
    balTarget() {
        if (typeof GameState === 'undefined' || !GameState.currency) return 0;
        return Math.max(0, Math.floor(GameState.currency('gold') - (this._bot ? this._bot.held : 0)));
    },

    // ---------- табло ----------
    // светодиоды текста str по сетке [x0, y0, x1, y1, p, n, gx], по середине
    dotsDraw(cv, grid, str, glow) {
        const c = cv.getContext('2d'), k = cv.width / cv._b[2], [x0, y0, , , p, n, gx] = grid, P = PALETTE.greedLux.led;
        c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
        c.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
        const w = str.length * 4 - 1, i0 = Math.max(0, Math.floor((n - w) / 2));
        c.fillStyle = P.line; c.shadowColor = P.line; c.shadowBlur = (1.6 + glow * 3) * k;
        for (let ch = 0; ch < str.length; ch++) {
            const g = this.DOTS[str[ch]];
            if (!g) continue;
            g.forEach((row, j) => { for (let i = 0; i < 3; i++) if (row[i] === '1') {
                const col = i0 + ch * 4 + i;
                if (col >= n) continue;
                c.beginPath(); c.arc(gx + col * p + p / 2, y0 + 2 + j * p + p / 2, p * 0.42, 0, 7); c.fill();
            } });
        }
        c.shadowBlur = 0;
    },
    screensDraw(now, force) {
        const B = this._bot, L = this.meta.live, K = this.BOT;
        if (!B || !this.betCv) return;
        // ставка (вспыхивает на смене)
        const bet = this.betNow(), fl = B.betFlash ? Math.max(0, 1 - (now - B.betFlash) / 300) : 0;
        if (force || bet !== B.betShown || fl > 0 || B.betFl) {
            this.dotsDraw(this.betCv, L.bet, bet + 'x', fl);
            B.betShown = bet; B.betFl = fl > 0;
        }
        // копилка: число бежит к кошельку по шагам, крупная разница — быстрее
        const t = this.balTarget();
        if (B.shown === null) B.shown = t;
        if (B.shown !== t && now - (B.countAt || 0) >= K.count) {
            const d = t - B.shown, st = Math.max(1, Math.round(Math.abs(d) * 0.18));
            B.shown += Math.sign(d) * Math.min(Math.abs(d), st);
            B.countAt = now; B.balDirty = true;
        }
        if (force || B.balDirty) { this.dotsDraw(this.balCv, L.bal, String(B.shown), 0); B.balDirty = false; }
    },

    // ---------- копилка: монеты за стеклом и монета в щель ----------
    // Игрок (18.11): прежняя куча — «сваленная, без характера», монеты
    // просвечивали друг сквозь друга, передние мельче задних. Теперь —
    // маленькая история: стопки поставлены тесной группой, одна чуть
    // поодаль; пока играл, одна стопка завалилась и разъехалась немного,
    // другая — сильно, крайние монеты укатились. Всё — движком монет игры
    // (GreedCoins, атлас поз с ребром): стопка — монеты одной позы друг над
    // другом, снизу вверх, ближние (ниже на полу) — крупнее и позже.
    // Монета в щель взлетает из-за тесной группы (за стопками её не видно,
    // пока не поднимется) — куча при этом не меняется.
    // Один холст на копилку и полёт: монета вылетает из копилки и летит над
    // аппаратом к пятаку.
    PIG_BOX: [150, 440, 190, 176],
    // y — пол (основание стопки), n — монет в стопке
    PIG_STACKS: [
        { x: 282, y: 577, n: 9 }, { x: 294.5, y: 575.5, n: 12 }, { x: 307, y: 577.5, n: 10 },
        { x: 288, y: 586, n: 7 }, { x: 300.5, y: 587, n: 11 },
        { x: 325, y: 583, n: 8 }                       // поодаль
    ],
    PIG_FLY_FROM: [294.5, 566],                        // за самой высокой стопкой
    pigScene() {
        if (this._pigScene) return this._pigScene;
        const P = GreedCoins.poses(), D = Math.PI / 180, out = [];
        // позы: стоит ровно (видна сверху-спереди) и лёжа с наклоном
        const flat = [], lean = [];
        P.forEach((p, i) => {
            if (p.m === 32 && Math.abs(p.az - 95) <= 16) flat.push(i);
            else if (p.m >= 22 && p.az > 40 && p.az < 150) lean.push(i);
        });
        let seed = 7;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const sc = (y) => 0.9 + 0.12 * Math.max(0, Math.min(1, (y - 572) / 36));
        const coin = (x, y, pose, z, ao) => out.push({ x, y, pose, z, rad: 6 * sc(z), ao: ao === undefined ? 0.8 + 0.2 * sc(z) / 1.02 : ao, roll: P[pose].roll * D });
        // стопки: толщина монеты 1,55; чуть гуляют (ставили руками)
        this.PIG_STACKS.forEach(S => {
            const f = flat[Math.floor(rnd() * flat.length)];
            for (let k = 0; k < S.n; k++) coin(S.x + (rnd() - 0.5) * 0.7, S.y - k * 1.55 * sc(S.y), f, S.y + k * 0.001);
        });
        // Завалившаяся стопка ложится черепицей: нижняя монета у места, каждая
        // следующая съехала дальше и лежит поверх предыдущей.
        const row = (x0, y0, dx, dy, n, jit) => {
            for (let k = 0; k < n; k++) {
                const x = x0 + dx * k + (rnd() - 0.5) * jit, y = y0 + dy * k + (rnd() - 0.5) * jit * 0.4;
                coin(x, y - 0.5, flat[Math.floor(rnd() * flat.length)], y + k * 0.01);
            }
        };
        row(310, 595, 2.1, 0.75, 7, 0.4);          // разъехалась немного — вправо
        row(291, 597.5, -3.4, 1.35, 5, 1.6);       // сильно — влево, шире и вразнобой
        // укатились от сильной
        [[302, 606.5], [286.5, 609]].forEach(([x, y]) => coin(x, y, flat[Math.floor(rnd() * flat.length)], y));
        out.sort((a, b) => a.z - b.z);
        return (this._pigScene = out);
    },
    pigMount(wrap) {
        const [x, y, w, h] = this.PIG_BOX;
        this.pigCv = this.botCanvas(wrap, x, y, w, h, 4);
        this._bot.pigDirty = true;
    },
    pigRenderer() {
        if (this.pigDraw !== undefined) return this.pigDraw;
        if (typeof GreedCoins === 'undefined') return null;
        const A = GreedCoins.loadAtlas();
        if (!A.ready) return null;
        return (this.pigDraw = GreedCoins.batchRenderer(this.pigCv, A.fa, A.fn, A.alb, A.nor, [this.PIG_BOX[2], this.PIG_BOX[3]]) || null);
    },
    coinIn() {
        const L = this.meta && this.meta.live;
        if (!this._bot || !L || !L.sn) return;
        const [x0, y0] = this.PIG_FLY_FROM;
        this._bot.coins.push({ at: performance.now(), x0, y0, x1: L.sn[0], y1: L.sn[1] - 5 });
    },
    // монета в полёте: x, y, ось (поза под поворотом, как у монет рамки),
    // светлота; null — долетела
    coinAt(m, now) {
        const F = this.BOT.coin, t = (now - m.at) / F.ms;
        if (t >= 1 + F.inMs / F.ms) return null;
        if (t < 1) {
            // вверх из-за стопок, дугой влево к пятаку; к концу — ребром
            const e = 1 - Math.pow(1 - t, 1.7);
            const x = m.x0 + (m.x1 - m.x0) * e;
            const y = m.y0 + (m.y1 - m.y0) * t - F.lift * 4 * t * (1 - t) * (1 - 0.3 * t);
            const a = t * F.turns * 2 * Math.PI, edge = Math.max(0, (t - 0.72) / 0.28);
            // кувырок вокруг наклонной оси → к щели ось легла вбок (ребро стоймя)
            // ось к нам (|cos|): монета обратной стороной к зрителю у движка
            // тёмная, а у настоящей там такой же аверс — переворот через ребро
            const n0 = [Math.sin(a), 0.3 * Math.sin(a), Math.abs(Math.cos(a))], n1 = [1, 0, 0.06];
            const n = n0.map((v, i) => v * (1 - edge) + n1[i] * edge), l = Math.hypot(...n);
            return { x, y, n: n.map(v => v / l), ao: 1, front: y < m.y0 - 16 };
        }
        // ребром в щель: уходит вниз и темнеет — в темноте пятака
        const u = (t - 1) * F.ms / F.inMs;
        return { x: m.x1, y: m.y1 + u * 7, n: [1, 0, 0.06], ao: 1 - 0.9 * u, front: true };
    },
    pigStep(now) {
        const B = this._bot;
        if (!B || !this.pigCv) return;
        const D = this.pigRenderer();
        if (!D) return;
        const tl = this.tilt || { x: 0, y: 0 }, flying = B.coins.length > 0;
        const tiltMoved = (!B.pigT || Math.abs(B.pigT.x - tl.x) > 0.003 || Math.abs(B.pigT.y - tl.y) > 0.003) && now - (B.pigAt || 0) >= 66;
        if (!flying && !B.coinWas && !tiltMoved && !B.pigDirty) return;
        B.pigT = { x: tl.x, y: tl.y }; B.pigAt = now; B.pigDirty = false; B.coinWas = flying;
        const [bx, by] = this.PIG_BOX, gold = GreedCoins.KINDS.indexOf('gold'), NP = GreedCoins.poses().length;
        const P = GreedCoins.poses(), st = (c) => ({ n: P[c.pose].n, m: 1, flash: 0, settled: true });
        const fly = [];
        B.coins = B.coins.filter(m => {
            const c = this.coinAt(m, now);
            if (!c) { if (typeof Haptics !== 'undefined') Haptics.tick(); return false; }
            fly.push(c); return true;
        });
        const flyAdd = (front) => fly.filter(c => c.front === front).forEach(c => D.add(
            { x: c.x - bx, y: c.y - by, rad: this.BOT.coin.rad, ao: c.ao, roll: 0, kind: 'gold' },
            { n: c.n, m: 1, flash: 0, reveal: 9, quiet: true, air: true }));
        D.begin(tl);
        flyAdd(false);                           // ещё за стопками
        this.pigScene().forEach(c => D.add({ x: c.x - bx, y: c.y - by, rad: c.rad, ao: c.ao, roll: c.roll, ci: gold * NP + c.pose, kind: 'gold' }, st(c)));
        flyAdd(true);
        D.flush();
    },

    // ---------- лоток ----------
    trayCoin(x, y, pose, ao) {
        const P = GreedCoins.poses(), D = Math.PI / 180, kind = 'gold';
        return { x, y, rad: this.BOT.tray.rad, ao, pose: P[pose].n, roll: P[pose].roll * D, ci: GreedCoins.KINDS.indexOf(kind) * P.length + pose, kind };
    },
    trayPose: GreedJunkLit.trayPose,
    trayPour(n) { if (this._bot && this._bot.tray) this._bot.tray.queue += n; },
    trayStep(now) {
        const B = this._bot, T = B && B.tray, K = this.BOT.tray;
        if (!T || typeof GreedCoins === 'undefined') return;
        const A = GreedCoins.loadAtlas();
        if (!A.ready) return;
        const [, , tw, th] = this.trayCv._b;
        if (!this.trayDraw) {
            this.trayDraw = GreedCoins.batchRenderer(this.trayCv, A.fa, A.fn, A.alb, A.nor, [tw, th]);
            if (!this.trayDraw) { B.tray = null; return; }
        }
        const dt = Math.min(40, now - (T.last || now)), rnd = Math.random;
        T.last = now;
        // из-под верхнего борта, по одной, rate в секунду
        if (T.queue > 0 && now >= T.nextAt) {
            T.queue--; T.nextAt = now + 1000 / this.TRAY.rate * (0.6 + rnd() * 0.8);
            const x = tw * (0.3 + rnd() * 0.4), lx = 7 + rnd() * (tw - 14), col = Math.min(K.cols - 1, Math.floor(lx / tw * K.cols));
            const ly = th - 7 - rnd() * 8 - T.h[col] * 1.1;
            T.falling.push({ x, y: -K.rad, vx: (lx - x) / 360, vy: 0.03, lx, ly: Math.max(K.rad, ly), col, hit: 0, pose: this.trayPose(rnd), spin: 0 });
        }
        T.falling.forEach(c => {
            c.vy += K.g * dt; c.x += c.vx * dt; c.y += c.vy * dt;
            c.spin += dt; if (c.spin > 45) { c.spin = 0; c.pose = this.trayPose(rnd); }
            if (c.y >= c.ly && c.vy > 0) {
                c.y = c.ly; c.hit++;
                if (c.hit === 1 && typeof Haptics !== 'undefined') Haptics.tick();
                if (c.hit >= 2 || c.vy < 0.04) c.done = true;
                else { c.vy = -c.vy * K.bounce; c.vx *= 0.4; }
            }
        });
        const landed = T.falling.filter(c => c.done);
        if (landed.length) {
            T.falling = T.falling.filter(c => !c.done);
            landed.forEach(c => {
                T.h[c.col] += 0.45;
                if (c.col > 0) T.h[c.col - 1] += 0.2;
                if (c.col < K.cols - 1) T.h[c.col + 1] += 0.2;
                T.coins.push({ x: c.lx, y: c.ly, pose: this.trayPose(rnd), lift: T.h[c.col] });
            });
            while (T.coins.length > K.max) { T.coins.shift(); T.h = T.h.map(v => Math.max(0, v - 0.04)); }
        }
        const moving = T.falling.length > 0 || T.queue > 0, tl = this.tilt || { x: 0, y: 0 };
        // блеск куч от наклона — не чаще 15 раз в секунду
        const tiltMoved = (!T.lt || Math.abs(T.lt.x - tl.x) > 0.003 || Math.abs(T.lt.y - tl.y) > 0.003) && now - (T.paintAt || 0) >= 66;
        if (!moving && !landed.length && !tiltMoved && !T.dirty) return;
        T.lt = { x: tl.x, y: tl.y }; T.dirty = false; T.paintAt = now;
        const D = this.trayDraw, st = (k) => ({ n: k.pose, m: 1, flash: 0, settled: true });
        D.begin(tl);
        T.coins.slice().sort((a, b) => a.y - b.y).forEach(c => {
            const k = this.trayCoin(c.x, c.y, c.pose, Math.min(1, 0.72 + c.lift * 0.08));
            D.add(k, st(k));
        });
        T.falling.forEach(c => { const k = this.trayCoin(c.x, c.y, c.pose, 1); D.add(k, st(k)); });
        D.flush();
    },

    // ---------- шкала ----------
    meterSet(v) { if (this._bot && this._bot.met) this._bot.met.T = Math.max(0, Math.min(1, v)); },
    // уровень жидкости → y поверхности
    // Полная — до самого верха колбы: раньше верх стоял на 5 ниже, а у
    // колбы верх круглый — полная шкала оставляла тёмный купол и читалась
    // «не долито» (игрок, 19.11). Срез — по прямоугольнику, скругление даёт
    // сама форма жидкости (liquid-*).
    meterY(v) {
        const q = this.meta.live.liquid;
        return q[1] + q[3] * (1 - v);
    },
    meterStep(now) {
        const M = this._bot && this._bot.met, K = this.BOT.meter;
        if (!M) return;
        // уровень — пружиной с оттяжкой; на подъёме — всплеск пузырьков
        const d = M.T - M.L;
        M.v = (M.v + d * K.k) * 0.82; M.L += M.v;
        if (Math.abs(d) < 0.0004 && Math.abs(M.v) < 0.0002) { M.L = M.T; M.v = 0; }
        if (d > 0.002) M.slosh = 1;
        M.slosh *= 0.97;
        if (!M.drawn || Math.abs(this.meterY(M.L) - this.meterY(M.drawn)) > 0.05) { this._metDirty = true; M.drawn = M.L; }
        // пузырьки со дна и со стенок, чаще после подъёма
        const q = this.meta.live.liquid, top = this.meterY(M.L);
        if (now >= M.nextAt && M.L > 0.03) {
            M.nextAt = now + K.bubbleMs * (0.4 + Math.random()) / (1 + 3 * M.slosh);
            M.bubbles.push({ x: q[0] + 5 + Math.random() * (q[2] - 10), y: q[1] + q[3] - 6, r: 0.6 + Math.random() * 1.1, v: 0.012 + Math.random() * 0.02, w: Math.random() * 6 });
        }
        M.bubbles.forEach(b => { b.y -= b.v * 16 * (1 + b.r * 0.4); b.w += 0.08; });
        M.bubbles = M.bubbles.filter(b => b.y > top + b.r);
        // мениск и пузырьки — свой холст
        const cv = this.metCv, c = cv.getContext('2d'), k = cv.width / q[2], P = PALETTE.greedLux.liquid, t = this.tilt || { x: 0, y: 0 };
        c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
        if (M.L <= 0.005) return;
        c.setTransform(k, 0, 0, k, -q[0] * k, -q[1] * k);
        // мениск: светлая полоса по поверхности, клонится от наклона и колышется
        const tl = Math.max(-1, Math.min(1, t.x)) * 2.2, wob = Math.sin(now / 260) * 0.5 * (0.3 + M.slosh);
        const g = c.createLinearGradient(0, top - 1.5, 0, top + 3);
        g.addColorStop(0, P.top); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(q[0], top - tl + wob); c.lineTo(q[0] + q[2], top + tl - wob); c.lineTo(q[0] + q[2], top + 3); c.lineTo(q[0], top + 3); c.closePath(); c.fill();
        c.fillStyle = P.bubble;
        M.bubbles.forEach(b => { c.globalAlpha = 0.75; c.beginPath(); c.arc(b.x + Math.sin(b.w) * 0.6, b.y, b.r, 0, 7); c.fill(); });
        c.globalAlpha = 1;
    },
    // срез жидкости в шейдере корпуса (paintLive)
    meterPaint() {
        const M = this._bot && this._bot.met, q = this.meta.live.liquid;
        if (!M || !this.sets.liquid || M.L <= 0.005) return;
        const top = this.meterY(M.L);
        this.clipTo({ x: q[0], y: top, w: q[2], h: q[1] + q[3] - top });
        this.quad(this.sets.liquid, q[0], q[1], q[2], q[3]);
        this.clipTo(null);
    },
    METER_RECT() { const q = this.meta.live.liquid; return { x: q[0] - 1, y: q[1] - 1, w: q[2] + 2, h: q[3] + 2 }; },

    // ---------- что выпало: всплывашка из места выигрыша ----------
    // Игрок, 18.11: видеть, сколько выплатилось и чего, — в каждой игре на
    // своём месте: бандит — середина экрана, колесо — значок выпавшего
    // сектора у указателя, пачинко — середина поля. Валюты — значком кошелька
    // (WalletFx.popAt), вещи колеса — значком продукта из кухни. Обмен
    // осколков на жетон даёт минус осколкам — минусы не показываются.
    winPop(game, res) {
        if (!res || typeof WalletFx === 'undefined' || !WalletFx.popAt || !this.wrapEl) return;
        const list = [], cur = res.currencies || {};
        Object.keys(cur).forEach(k => { if (cur[k] > 0) list.push({ key: k, delta: cur[k] }); });
        const it = res.items, ing = it && typeof KITCHEN !== 'undefined' && KITCHEN.ingredients[it.pantry || it.seed];
        if (it && it.got > 0 && ing) list.push({ mark: ing.emoji, delta: it.got });
        if (!list.length) return;
        let x, y;
        if (game === 'wheel' && this._deck && this._deck.target >= 0) ({ x, y } = this.iconAt(this._deck.target));
        else if (game === 'pachinko') {
            const G = GreedJunk, P = G.PACH;
            [x, y] = G.pachPt(P.arc.cx, (P.y0 + P.top + P.drain) / 2);
        } else {
            const R = (this.meta.live && this.meta.live.screen) || [99, 328, 281, 450];
            x = (R[0] + R[2]) / 2; y = (R[1] + R[3]) / 2;
        }
        const w = this.wrapEl.getBoundingClientRect();
        WalletFx.popAt(w.left + x / this.W * w.width, w.top + (y - this.Y0) / this.H * w.height, list);
    },

    // кадр низа (из playStep)
    bottomStep(now) {
        if (!this._bot) return;
        this.screensDraw(now, false);
        this.pigStep(now);
        this.trayStep(now);
        this.meterStep(now);
    }
});
