// ================= АППАРАТ АЛЧНОСТИ, ВЕРСИЯ 2: ВЫИГРЫШ КОЛЕСА И БАНДИТА =================
// После доводки пачинко (вспышка всего поля, волны светом гвоздей и табло,
// искры, лучи) колесо и бандит рядом с ним выглядели скудно (игрок, 19.11):
// у колеса мигал один клин, у бандита — только пиксели экрана. Тот же язык и
// здесь: волны — не нарисованными кольцами, а светом того, что уже есть на
// корпусе. Колесо: клинья-экраны и заклёпки обода, лучи веера на корпусе за
// колесом. Бандит: светодиоды самого экрана и его золотая рамка.
// Ступень: 1 — мелкий, 2 — средний, 3 — крупный. Всё — формулой от времени.
// Рисуется в слой значков (ic, плотность S) — он над корпусом и так
// перерисовывается целиком; светодиоды — в буфер экрана (ledDraw).
Object.assign(GreedLux, {
    WINFX: {
        wheelMs: [0, 1400, 1800, 2500],
        slotMs: [0, 1300, 1800, 2600],
        // рамка экрана бандита (корпус, machine.py: золото вокруг экрана)
        frame: [87, 316, 295, 459, 12],
        // лучи веера на корпусе за колесом (machine.py, fan у t1c)
        rays: { n: 23, r0: 166, r1: 262, short: 0.78, clip: [4, -55, 203, 347] },
        rivetR: 156.5
    },

    // ---------- ступени ----------
    // Колесо: ступень по выпавшему сектору (экран алчности зовёт winPop до blink).
    wheelWinShow(res) {
        const k = res && res.key;
        this._wheelTier = !k || k === 'blank' ? 0 : k === 'shard' ? 3 : k === 'gold3' ? 2 : 1;
    },
    winFxLive(now) {
        const F = this.WINFX, a = this._wheelWin, b = this._slotWin;
        return !!((a && now - a.at < F.wheelMs[a.tier]) || (b && now - b.at < F.slotMs[b.tier]));
    },

    // ---------- общее ----------
    // пульсы вспышки: n штук за показ, первый ярче, к концу гаснут
    winPulse(u, n) { return Math.max(0, Math.sin(u * Math.PI * 2 * n)) * Math.pow(1 - u, 0.7); },
    // волны: фронты в долях пути 0..1 и их сила; повтор каждые gap
    winFronts(u, n, gap, len) {
        const out = [];
        for (let r = 0; r < n; r++) { const v = (u - r * gap) / len; if (v > 0 && v < 1) out.push([v, 1 - v]); }
        return out;
    },
    // искры: веером из точки, падают дугой (координаты — уже в пикселях слоя)
    winSparks(g, x0, y0, n, t, sc, a0, spread, seed) {
        const spr = this.pachGlowSprite();
        for (let i = 0; i < n; i++) {
            const h = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453, f = h - Math.floor(h);
            const a = a0 + (f - 0.5) * spread, sp = (110 + 120 * ((f * 7.31) % 1)) * sc, life = 0.5 + 0.5 * ((f * 3.7) % 1);
            const tt = t * (0.8 + 0.4 * f) + 0.04 * ((f * 5.3) % 1);
            if (tt > life) continue;
            const x = x0 + Math.cos(a) * sp * tt, y = y0 + Math.sin(a) * sp * tt + 160 * sc * tt * tt, r = (2.2 * (1 - tt / life) + 0.8) * 2.2 * sc;
            g.globalAlpha = 1 - tt / life; g.drawImage(spr, x - r, y - r, 2 * r, 2 * r);
        }
    },

    // ---------- слой значков: колесо и рамка бандита ----------
    winFxDraw(g, now) {
        const F = this.WINFX;
        g.globalCompositeOperation = 'lighter';
        if (this._wheelWin) {
            const W = this._wheelWin, u = (now - W.at) / F.wheelMs[W.tier];
            if (u >= 1) this._wheelWin = null; else this.wheelWinDraw(g, W, u);
        }
        if (this._slotWin) {
            const W = this._slotWin, u = (now - W.at) / F.slotMs[W.tier];
            if (u >= 1) this._slotWin = null; else this.slotFrameDraw(g, W, u);
        }
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    },
    wheelWinDraw(g, Wn, u) {
        const F = this.WINFX, S = this.S, L = PALETTE.greedLux, gold = L.cupLed.gold1, T = Wn.tier;
        const Wh = this.meta.live.wheel, cx = Wh[0] * S, cy = (Wh[1] - this.Y0) * S, R = Wh[2] * S;
        const n = GreedJunk.wheelKeys().length, spr = this.pachGlowSprite();
        const fade = u < 0.08 ? u / 0.08 : 1 - (u - 0.08) / 0.92;
        // 1. диск вспыхивает пульсами из выпавшего сектора
        const P0 = this.iconAt(Wn.i), px = P0.x * S, py = (P0.y - this.Y0) * S;
        g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
        const wash = g.createRadialGradient(px, py, 0, px, py, 2 * R);
        wash.addColorStop(0, gold); wash.addColorStop(1, L.wheel.sparkHalo);
        g.globalAlpha = Math.min(1, this.winPulse(u, 1 + T) * (0.26 + 0.06 * T)); g.fillStyle = wash; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
        // 2. волны по клиньям-экранам от выпавшего в обе стороны
        const fr = this.winFronts(u, 1 + T, 0.16, 0.5), half = n / 2;
        const litD = (d) => { let m = 0; fr.forEach(([v, s]) => { const e = Math.abs(d - v * half); if (e < 1.3) m = Math.max(m, s * (1 - e / 1.3)); }); return m; };
        for (let j = 0; j < n; j++) {
            if (this.iconAt(j).x < -24) continue;
            const d = Math.min((j - Wn.i + n) % n, (Wn.i - j + n) % n), m = litD(d);
            if (m <= 0.02) continue;
            this.wedge(g, j); g.globalAlpha = m * 0.7; g.fillStyle = L.winFlash; g.fill();
        }
        g.restore();
        // заклёпки обода: на границах клиньев, их свет — от той же волны
        const rr = F.rivetR * S, sr = 10 * S;
        for (let j = 0; j < n; j++) {
            const a = this.iconAt(j).a - Math.PI / n, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
            if (x < 0) continue;
            const d = Math.min((j - Wn.i + n) % n, (Wn.i - j + n) % n) - 0.5;
            let m = litD(Math.abs(d));
            // крупный — огни бегут по ободу по кругу
            if (T >= 3) m = Math.max(m, fade * (0.35 + 0.65 * Math.max(0, Math.sin(j * 1.9 - u * 30))));
            if (m <= 0.02) continue;
            g.globalAlpha = Math.min(1, m); g.drawImage(spr, x - sr, y - sr, 2 * sr, 2 * sr);
        }
        // 3. лучи веера на корпусе за колесом — волной от указателя к краям;
        //    у мелкого — только середина
        const Ry = F.rays, C = Ry.clip;
        g.save(); g.beginPath(); g.rect(C[0] * S, (C[1] - this.Y0) * S, C[2] * S, C[3] * S); g.clip();
        g.lineCap = 'round'; g.strokeStyle = gold;
        const mid = (Ry.n - 1) / 2, span = T >= 2 ? mid : 3;
        for (let k = 0; k < Ry.n; k++) {
            const w = Math.abs(k - mid) / mid;
            if (Math.abs(k - mid) > span) continue;
            const ph = u * 2.2 - w * 0.9, on = Math.max(0, Math.sin(Math.min(1, Math.max(0, ph)) * Math.PI)) * fade;
            if (on <= 0.01) continue;
            const a = -Math.PI / 2 + Math.PI * (k + 0.5) / Ry.n, re = k % 2 === 0 ? Ry.r1 : Ry.r0 + (Ry.r1 - Ry.r0) * Ry.short;
            const x0 = cx + Math.cos(a) * Ry.r0 * S, y0 = cy + Math.sin(a) * Ry.r0 * S, x1 = cx + Math.cos(a) * re * S, y1 = cy + Math.sin(a) * re * S;
            g.globalAlpha = on * 0.35; g.lineWidth = 6 * S; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
            g.globalAlpha = on; g.lineWidth = 1.6 * S; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        }
        g.restore();
        // 4. искры из-под указателя и солнце в ступице
        this.winSparks(g, 168 * S, (118 - this.Y0) * S, 8 + 8 * T, u * F.wheelMs[T] / 1000, S, -2.3, 2.4, T + 3);
        const hr = (20 + 8 * T) * S, hx = Math.max(cx, 6 * S), hg = g.createRadialGradient(hx, cy, 0, hx, cy, hr);
        hg.addColorStop(0, L.wheel.spark); hg.addColorStop(0.3, gold); hg.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = fade * 0.9; g.fillStyle = hg; g.fillRect(hx - hr, cy - hr, 2 * hr, 2 * hr);
    },
    // рамка экрана бандита: свет переливается на корпус, огни по рамке
    slotFrameDraw(g, Wn, u) {
        const F = this.WINFX, S = this.S, L = PALETTE.greedLux, gold = L.cupLed.gold1, T = Wn.tier, spr = this.pachGlowSprite();
        const [x0, y0, x1, y1, r] = F.frame, X0 = x0 * S, Y0 = (y0 - this.Y0) * S, X1 = x1 * S, Y1 = (y1 - this.Y0) * S;
        const fade = u < 0.08 ? u / 0.08 : 1 - (u - 0.08) / 0.92, pu = this.winPulse(u, 1 + T);
        // ореол вокруг экрана — свет переливается на корпус
        const mx = (X0 + X1) / 2, my = (Y0 + Y1) / 2, rw = (X1 - X0) / 2 + 30 * S, rh = (Y1 - Y0) / 2 + 30 * S;
        g.save(); g.translate(mx, my); g.scale(1, rh / rw);
        const hg = g.createRadialGradient(0, 0, rw * 0.55, 0, 0, rw);
        hg.addColorStop(0, gold); hg.addColorStop(0.35, L.wheel.sparkHalo); hg.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = Math.min(1, pu * (0.45 + 0.15 * T) + 0.15 * fade); g.fillStyle = hg; g.fillRect(-rw, -rw, 2 * rw, 2 * rw);
        g.restore();
        // огни по рамке: мелкий — вся рамка мигает пульсами, средний и
        // крупный — бегут по кругу двумя встречными волнами
        const per = 2 * ((x1 - x0) + (y1 - y0)), N = Math.round(per / 7), sr = 8 * S;
        for (let i = 0; i < N; i++) {
            const p = (i + 0.5) / N * per, w = x1 - x0, h = y1 - y0;
            let x, y;
            if (p < w) { x = x0 + p; y = y0; } else if (p < w + h) { x = x1; y = y0 + p - w; } else if (p < 2 * w + h) { x = x1 - (p - w - h); y = y1; } else { x = x0; y = y1 - (p - 2 * w - h); }
            // скругление углов: точку у угла — к дуге
            const cxr = Math.min(Math.max(x, x0 + r), x1 - r), cyr = Math.min(Math.max(y, y0 + r), y1 - r), dx = x - cxr, dy = y - cyr, dd = Math.hypot(dx, dy);
            if (dd > r) { x = cxr + dx / dd * r; y = cyr + dy / dd * r; }
            let m;
            if (T === 1) m = pu;
            else {
                const s = i / N, c1 = (s - u * 2) % 1, c2 = (s + u * 2) % 1;
                const k1 = Math.pow(Math.max(0, Math.cos((c1 < 0 ? c1 + 1 : c1) * Math.PI * 2 * (T + 1))), 3);
                const k2 = Math.pow(Math.max(0, Math.cos((c2 < 0 ? c2 + 1 : c2) * Math.PI * 2 * (T + 1))), 3);
                m = fade * (0.25 + 0.75 * Math.max(k1, k2)) + pu * 0.4;
            }
            if (m <= 0.02) continue;
            g.globalAlpha = Math.min(1, m); g.drawImage(spr, x * S - sr, (y - this.Y0) * S - sr, 2 * sr, 2 * sr);
        }
        // средний и крупный: искры вылетают из экрана на корпус
        if (T >= 2) this.winSparks(g, mx, Y0 + 8 * S, 8 * T, u * F.slotMs[T] / 1000, S, -Math.PI / 2, 2.8, T + 11);
    },

    // ---------- светодиоды экрана бандита ----------
    // Зовёт ledDraw поверх лент: весь экран вспыхивает пульсами, от середины
    // линии расходятся волны — светом самих светодиодов (дуга по буферу =
    // зажжённые точки сетки).
    ledWinDraw(b, W, wt) {
        const F = this.WINFX, L = this.LED, P = PALETTE.greedLux, T = W.tier, dur = F.slotMs[T];
        if (!(wt < dur)) return;
        const u = wt / dur, pu = this.winPulse(u, 1 + T);
        b.globalCompositeOperation = 'lighter';
        // Волна — не нарисованное кольцо (оно и читалось кольцом), а уже
        // горящие светодиоды значков: кольца — маска, в неё значки лент
        // (только они, без фона окон: копия всего экрана давала синее кольцо
        // по фону), сверху светом — разгораются только точки значков.
        const fr = this.winFronts(u, 1 + T, 0.15, 0.45);
        if (fr.length && this.reels) {
            const m = this._ledMask || (this._ledMask = document.createElement('canvas'));
            if (m.width !== L.w) { m.width = L.w; m.height = L.h; }
            const q = m.getContext('2d'), C = GreedJunk.CELL, St = GreedJunk.REEL_STRIP, n = St.length;
            q.globalCompositeOperation = 'source-over'; q.clearRect(0, 0, L.w, L.h); q.lineWidth = 8;
            fr.forEach(([v, s]) => { q.globalAlpha = s; q.strokeStyle = P.led.flash; q.beginPath(); q.arc(L.w / 2, L.mid, 3 + v * 52, 0, 7); q.stroke(); });
            q.globalCompositeOperation = 'source-in'; q.globalAlpha = 1;
            L.cols.forEach((cx, ci) => {
                const r = this.reels[ci], pos = (r.s - C.h / 2) / C.h, base = Math.floor(pos);
                for (let i = base - 2; i <= base + 3; i++) {
                    const spr = this.ledSprites[St[((i % n) + n) % n]];
                    if (spr) q.drawImage(spr, cx - 8, Math.round(L.mid + (i - pos) * L.cell) - 8);
                }
            });
            b.globalAlpha = 1; b.drawImage(m, 0, 0); b.drawImage(m, 0, 0);
        }
        // заливка — после маски, чтобы волна не подхватила её
        b.globalAlpha = Math.min(1, pu * (0.22 + 0.06 * T)); b.fillStyle = P.cupLed.gold1; b.fillRect(0, 0, L.w, L.h);
        b.globalCompositeOperation = 'source-over'; b.globalAlpha = 1;
    }
});

// Ступени — вместе со всплывашкой; рамка бандита — вместе с его ступенью.
(function () {
    const pop = GreedLux.winPop;
    GreedLux.winPop = function (game, res) {
        if (game === 'wheel' && res) this.wheelWinShow(res);
        const r = pop ? pop.apply(this, arguments) : undefined;
        if (game === 'slots' && this._ledWin && performance.now() - this._ledWin.at < 50) { this._slotWin = { tier: this._ledWin.tier, at: this._ledWin.at }; this._iconsDirty = true; }
        return r;
    };
    const blink = GreedLux.wheelBlink;
    GreedLux.wheelBlink = function (now) {
        if (!blink.call(this, now)) return false;
        const T = Math.max(1, this._wheelTier || 1);
        this._wheelWin = { at: now, tier: T, i: this._deck.target };
        if (T > 1 && typeof Haptics !== 'undefined') Haptics.burst(T === 3 ? 'heavy' : 'medium', T === 3 ? 3 : 2, 100, 'success');
        return true;
    };
    const step = GreedLux.iconsStep, draw = GreedLux.drawIcons;
    GreedLux.iconsStep = function (now) {
        if (this.winFxLive(now) || this._winFxWas) this._iconsDirty = true;
        this._winFxWas = this.winFxLive(now);
        return step.call(this, now);
    };
    GreedLux.drawIcons = function (now) {
        draw.call(this, now);
        this.winFxDraw(this.icx, now);
    };
})();
