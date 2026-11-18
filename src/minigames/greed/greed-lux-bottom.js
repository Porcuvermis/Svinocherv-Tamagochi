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
        coin: { ms: 520, inMs: 140, rad: 6.2, turns: 2.5, lift: 58 },
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
        // монета в полёте: от копилки до пятака, с запасом на дугу
        this.flyCv = this.botCanvas(wrap, 150, 440, 200, 110, 4);
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
        if (typeof GreedMinigame === 'undefined' || list.length < 2 || GreedMinigame.busy()) {
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

    // ---------- монета в щель ----------
    // Картинка монеты — один раз тем же движком, что лоток (освещённая,
    // плашмя); контекст потом отдаётся — на полёт в полсекунды держать
    // видеокарту незачем.
    coinSprite() {
        if (this._coinSpr) return this._coinSpr;
        if (typeof GreedCoins === 'undefined') return null;
        const A = GreedCoins.loadAtlas();
        if (!A.ready) return null;
        const box = 14, n = Math.round(box * this.K * 1.5), cv = document.createElement('canvas');
        cv.width = cv.height = n;
        const D = GreedCoins.batchRenderer(cv, A.fa, A.fn, A.alb, A.nor, [box, box]);
        if (!D) return null;
        D.begin({ x: 0, y: 0 });
        const c = this.trayCoin(box / 2, box / 2, 0, 1);
        c.rad = this.BOT.coin.rad;
        D.add(c, { n: c.pose, m: 1, flash: 0, settled: true });
        D.flush();
        const out = document.createElement('canvas');
        out.width = out.height = n;
        out.getContext('2d').drawImage(cv, 0, 0);
        const gl = cv.getContext('webgl'), ext = gl && gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
        return (this._coinSpr = out);
    },
    coinIn() {
        const L = this.meta && this.meta.live;
        if (!this._bot || !L || !L.pig) return;
        const P = L.pig, S = L.sn;
        this._bot.coins.push({ at: performance.now(), x0: (P[0] + P[2]) / 2, y0: P[1] + 6, x1: S[0], y1: S[1] - 4 });
    },
    coinStep(now) {
        const B = this._bot, F = this.BOT.coin;
        if (!B || (!B.coins.length && !B.coinDirty)) return;
        const cv = this.flyCv, c = cv.getContext('2d'), [bx, by, bw] = cv._b, k = cv.width / bw, spr = this.coinSprite();
        c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
        B.coinDirty = B.coins.length > 0;
        if (!spr) return;
        c.setTransform(k, 0, 0, k, -bx * k, -by * k);
        B.coins = B.coins.filter(m => {
            const t = (now - m.at) / F.ms, r = F.rad;
            if (t >= 1 + F.inMs / F.ms) {
                if (typeof Haptics !== 'undefined') Haptics.tick();
                return false;
            }
            let x, y, kw, a = 1, clip = null;
            if (t < 1) {
                // дуга: выше середины на lift, к концу — ровно над щелью
                const e = 1 - Math.pow(1 - t, 2.2);
                x = m.x0 + (m.x1 - m.x0) * e;
                y = m.y0 + (m.y1 - m.y0) * t - F.lift * 4 * t * (1 - t) * (1 - 0.35 * t);
                // кувырок, к щели — ребром
                const spin = Math.cos(t * F.turns * 2 * Math.PI);
                kw = t < 0.8 ? spin : spin * (1 - (t - 0.8) / 0.2) + 0.06 * ((t - 0.8) / 0.2);
            } else {
                // ребром в щель: уходит вниз за губу
                const u = (t - 1) * F.ms / F.inMs;
                x = m.x1; y = m.y1 + u * 9; kw = 0.06; a = 1 - u * 0.4; clip = m.y1 - 1;
            }
            c.save();
            if (clip !== null) { c.beginPath(); c.rect(bx, by, bw, clip - by + r * 0.2); c.clip(); }
            c.globalAlpha = a;
            const w = Math.max(0.08, Math.abs(kw));
            c.drawImage(spr, x - r * w, y - r, 2 * r * w, 2 * r);
            if (w < 0.45) {
                // почти ребром — полоса гурта
                c.fillStyle = PALETTE.greedCoin.gold.lo;
                c.globalAlpha = a * (1 - w / 0.45);
                c.fillRect(x - Math.max(0.6, r * w * 0.6), y - r * 0.96, Math.max(1.2, r * w * 1.2), r * 1.92);
            }
            c.restore();
            return true;
        });
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
    meterY(v) {
        const q = this.meta.live.liquid;
        return q[1] + q[3] - 3 - (q[3] - 8) * v;
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

    // кадр низа (из playStep)
    bottomStep(now) {
        if (!this._bot) return;
        this.screensDraw(now, false);
        this.coinStep(now);
        this.trayStep(now);
        this.meterStep(now);
    }
});
