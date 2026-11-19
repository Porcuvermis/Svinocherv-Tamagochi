// ================= АППАРАТ АЛЧНОСТИ, ВЕРСИЯ 2: ЛЕНТЫ БАНДИТА =================
// Продолжение GreedLux (план 31, разд. 5б). Своё движение лент и свой экран
// вместо гаражных (greed-junk-lit-reels.js): там замах вверх перед стартом и
// проскок с пружиной назад на остановке — игрок, 18.11: «откаты», «сделать
// магнитным, электронным, как колесо».
//
// Движение. Старт — волной слева направо, без замаха, разгон S-кривой.
// Остановка — расчётом, как у колеса (greed-lux-wheel.js): в миг тормоза
// известны скорость v0 и путь d до центра нужной ячейки; лента едет по
// многочлену s(u), у которого в начале скорость v0, а в конце скорость и
// ускорение — ноль ровно в центре ячейки: s'(u) = d·(1−u)²·(k + (12−4k)·u)/T,
// k = v0·T/d. Ни проскока, ни отката. k ≤ 3 — скорость к концу только
// падает (при k > 4 многочлен уходил бы назад).
// Интрига: первые две встали на одну тройку — третья перед тормозом сбавляет
// и тормозит дольше. Исход решён на рывке; одна и та же интрига и для
// попадания, и для промаха. «Почти» (мигание значка, проехавшего мимо линии)
// НЕ делается: конфиг алчности сознательно не подкручивает почти-выигрыши —
// это крючок, а не игра (economy-greed.js, БАРАБАН).
//
// Экран. Буфер 81×54 светодиода (как было) и постобработка: смаз значков по
// скорости, ореол (уменьшенная копия буфера, растянутая сглаживанием и
// наложенная «светом» — без canvas filter, которого старые iOS не знают),
// вспышка окна и защёлка-скобки при остановке, развёртка по линии, тусклый
// миг на проигрыше, ступени выигрыша (winTiers в конфиге).
Object.assign(GreedLux, {
    REEL: {
        vmax: 0.95,            // единиц ленты в мс (ячейка — 32)
        accelMs: 260, waveMs: 45,
        firstMs: 650, stepMs: 330,
        brakeCells: 3.2, brakeK: 2.2,
        tease: { v: 0.42, slowMs: 420, cells: 5, k: 2.6 },
        tickGap: 45,
        lockMs: 900, flashMs: 200, sweepMs: 320, loseMs: 420
    },

    spin(targets) {
        if (!this.reels) return;
        const now = performance.now(), K = this.REEL, G = GreedJunk, S = G.REEL_STRIP;
        const key = (i) => S[((targets[i] % S.length) + S.length) % S.length];
        // интрига — если первые две на одном символе (пустое — не тройка)
        this._tease = key(0) === key(1) && key(0) !== 'blank';
        this._spin0 = now; this._ledWin = null; this._lineAt = null; this._loseAt = null;
        this.reels.forEach((r, i) => Object.assign(r, { st: 'run', target: targets[i], t0: now + i * K.waveMs, v: 0, i, lockAt: null, tickCell: null }));
    },
    // ячейка ленты под линией (для тиков)
    reelCell(r) { return Math.floor((r.s - GreedJunk.CELL.h / 2) / GreedJunk.CELL.h); },
    spinStep(now) {
        if (!this.spinning()) return false;
        const K = this.REEL, C = GreedJunk.CELL, L = GreedJunk.REEL_STRIP.length * C.h;
        const dt = Math.min(50, now - (this._spinLast || now));
        this._spinLast = now;
        let landed = 0;
        this.reels.forEach(r => {
            if (!r.st) { r.blur = 0; return; }
            if (r.st === 'run') {
                const u = Math.max(0, Math.min(1, (now - r.t0) / K.accelMs));
                const third = r.i === 2 && this._tease;
                let vt = K.vmax * u * u * (3 - 2 * u);
                // интрига: третья перед тормозом сбавляет (плавно, за slowMs)
                const due = this._spin0 + K.firstMs + r.i * K.stepMs;
                if (third && now > due) vt = K.vmax + (K.tease.v - K.vmax) * Math.min(1, (now - due) / K.tease.slowMs);
                r.v = vt;
                r.s -= r.v * dt;
                const left = this.reels[r.i - 1];
                const leftOk = !left || !left.st || left.st === 'brake' && now - left.at >= K.stepMs * 0.6;
                const when = due + (third ? K.tease.slowMs : 0);
                if (now >= when && leftOk) {
                    const cells = third ? K.tease.cells : K.brakeCells, k = third ? K.tease.k : K.brakeK, D = cells * C.h;
                    const want = r.target * C.h + C.h / 2;
                    const fin = want + Math.floor((r.s - D - want) / L) * L, d = r.s - fin;
                    // цель подъехала на путь тормоза (не дальше полуячейки) — тормозим
                    // окно — не уже пути за кадр: иначе проскочит и ждать оборот ленты
                    if (d <= D + Math.max(C.h * 0.5, r.v * dt * 1.3)) {
                        const T = k * d / Math.max(0.05, r.v);
                        Object.assign(r, { st: 'brake', from: r.s, d, T, k, at: now, tickCell: this.reelCell(r) });
                    }
                }
            } else if (r.st === 'brake') {
                const u = Math.min(1, (now - r.at) / r.T), k = r.k;
                // s(u) = d·(k·u + (6−3k)·u² + (3k−8)·u³ + (3−k)·u⁴)
                const p = k * u + (6 - 3 * k) * u * u + (3 * k - 8) * u * u * u + (3 - k) * u * u * u * u;
                r.s = r.from - r.d * p;
                r.v = r.d / r.T * (1 - u) * (1 - u) * (k + (12 - 4 * k) * u);
                // тик — ячейка прошла линию, не чаще порога
                const cell = this.reelCell(r);
                if (cell !== r.tickCell) {
                    r.tickCell = cell;
                    if (now - (this._tickAt || 0) >= K.tickGap * (r.i === 2 && this._tease ? 2 : 1)) {
                        this._tickAt = now;
                        if (typeof Haptics !== 'undefined') (r.i === 2 && this._tease ? Haptics.impact('light', true) : Haptics.tick());
                    }
                }
                if (u >= 1) {
                    r.s = ((r.from - r.d) % L + L) % L; r.v = 0; r.st = null; r.lockAt = now; landed++;
                    this._ledDirty = true;
                    if (typeof Haptics !== 'undefined') Haptics.impact(r.i === 2 ? 'medium' : 'soft', true);
                }
            }
            r.blur = Math.min(C.h * 1.2, Math.abs(r.v) * 30);
        });
        if (landed && !this.spinning()) this.spinDone();
        return true;
    },

    // ---------- что выпало: ступень показа ----------
    // Зовёт экран алчности через winPop (onSpinDone) — с настоящей выплатой.
    reelsWin(res) {
        const now = performance.now(), cfg = (ECONOMY.minigames && ECONOMY.minigames.greed) || {}, T = cfg.winTiers || { mid: 5, big: 20 };
        const cur = res.currencies || {}, other = Object.keys(cur).some(k => k !== 'gold' && cur[k] > 0);
        const ratio = (res.pay || 0) / Math.max(1, res.cost || 1);
        const tier = res.jackpot || ratio >= T.big ? 3 : ratio >= T.mid || other ? 2 : res.pay > 0 ? 1 : 0;
        if (tier) {
            this._ledWin = { tier, at: now };
            // отдача — в такт прыжкам значков линии (greed-lux-winfx.js), в конце — «успех»
            if (typeof Haptics !== 'undefined') {
                const Pp = this.WINFX.pop, kind = ['', 'light', 'medium', 'heavy'][tier];
                for (let i = 0; i < 3; i++) setTimeout(() => Haptics.impact(kind, true), Pp.t0 + i * Pp.gap);
                setTimeout(() => tier === 3 ? Haptics.burst('heavy', 3, 110, 'success') : Haptics.notify('success', true), Pp.t0 + 2 * Pp.gap + 260);
            }
        } else this._loseAt = now;
        this._ledDirty = true;
    },

    // ---------- экран ----------
    // Ореол — уменьшенный буфер (в 4 раза), растянутый со сглаживанием.
    ledGlowBuf() {
        if (this._ledGlow) return this._ledGlow;
        const g = document.createElement('canvas'); g.width = Math.ceil(this.LED.w / 4); g.height = Math.ceil(this.LED.h / 4);
        return (this._ledGlow = g);
    },
    // идёт что-то, что надо рисовать каждый кадр
    ledLive(now) {
        const K = this.REEL;
        if (this.spinning()) return true;
        if (this.reels && this.reels.some(r => r.lockAt && now - r.lockAt < K.lockMs)) return true;
        if (this._lineAt && now - this._lineAt < 1300) return true;
        if (this._loseAt && now - this._loseAt < K.loseMs) return true;
        if (this._ledWin && now - this._ledWin.at < [0, 1300, 1800, 2600][this._ledWin.tier]) return true;
        return false;
    },
    ledDraw(now) {
        const L = this.LED, P = PALETTE.greedLux.led, K = this.REEL, b = this.ledBuf.getContext('2d'), G = GreedJunk, C = G.CELL, S = G.REEL_STRIP, n = S.length;
        if (!this.ledGrid) this.ledFit();
        this._ledDirty = this.ledLive(now);
        const W = this._ledWin, wt = W ? (now - W.at) : 1e9;
        // ступени: пульс значков линии, прыжок, вспышки экрана
        const pulse = W && wt < [0, 1300, 1800, 2600][W.tier] ? Math.max(0, Math.sin(wt / 1000 * Math.PI * (W.tier === 3 ? 5 : 3))) * (1 - wt / [1, 1300, 1800, 2600][W.tier]) : 0;
        const jump = W && W.tier >= 2 ? pulse : 0;
        const scr = W && W.tier === 3 && wt < 900 ? Math.max(0, Math.sin(wt / 900 * Math.PI * 3)) : 0;
        const lose = this._loseAt ? Math.max(0, 1 - (now - this._loseAt) / K.loseMs) : 0;
        const popOn = !!(W && this.ledPopDraw && wt < [0, 1300, 1800, 2600][W.tier]);
        b.globalAlpha = 1; b.fillStyle = P.back; b.fillRect(0, 0, L.w, L.h);
        let speed = 0;
        L.cols.forEach((cx, ci) => {
            const x0 = cx - L.win / 2, r = this.reels[ci], f = Math.min(1, Math.abs(r.v || 0) / K.vmax);
            speed = Math.max(speed, f);
            b.globalAlpha = 1;
            b.fillStyle = P.window; b.fillRect(x0, 0, L.win, L.h);
            b.fillStyle = P.band; b.fillRect(x0, L.mid - L.cell / 2, L.win, L.cell);
            b.save(); b.beginPath(); b.rect(x0, 0, L.win, L.h); b.clip();
            const pos = (r.s - C.h / 2) / C.h, base = Math.floor(pos);
            // смаз: след вверх (лента едет вниз), длина — от скорости
            const smear = Math.round(f * 7);
            for (let i = base - 2; i <= base + 3; i++) {
                const key = S[((i % n) + n) % n], spr = this.ledSprites[key];
                if (!spr) continue;
                const yc = L.mid + (i - pos) * L.cell, off = Math.abs(yc - L.mid), onLine = off < 1 && !r.st;
                if (onLine && popOn) continue;
                let y = Math.round(yc) - 8;
                if (onLine && jump) y -= Math.round(jump * 2.5);
                const a = (1 - 0.38 * Math.min(1, off / L.cell)) * (1 - 0.45 * lose);
                for (let k = smear; k >= 0; k--) {
                    b.globalAlpha = a * (k ? 0.5 * (1 - k / (smear + 1)) : 1 - 0.35 * f);
                    b.drawImage(spr, cx - 8, y - k * 1.6);
                }
                if (onLine && pulse) { b.globalCompositeOperation = 'lighter'; b.globalAlpha = pulse * 0.7; b.drawImage(spr, cx - 8, y); b.globalCompositeOperation = 'source-over'; }
            }
            // строки мерцают на скорости
            if (f > 0.5) { b.globalAlpha = (f - 0.5) * 0.35; b.fillStyle = P.back; for (let y = (Math.floor(now / 40) % 2); y < L.h; y += 2) b.fillRect(x0, y, L.win, 1); }
            b.restore();
            // встала — окно вспыхивает, скобки защёлкиваются по углам ячейки
            if (r.lockAt) {
                const t = now - r.lockAt;
                if (t < K.flashMs) { b.globalAlpha = 0.5 * (1 - t / K.flashMs); b.fillStyle = P.flash; b.fillRect(x0, 0, L.win, L.h); }
                if (t < K.lockMs) {
                    const g = Math.max(0, 3 * (1 - t / 120)), a = t < 120 ? 1 : 1 - (t - 120) / (K.lockMs - 120);
                    const bx0 = x0 + 1 - g, bx1 = x0 + L.win - 2 + g, by0 = L.mid - L.cell / 2 - g, by1 = L.mid + L.cell / 2 - 1 + g;
                    b.globalAlpha = a; b.fillStyle = P.flash;
                    [[bx0, by0, 1, 1], [bx1, by0, -1, 1], [bx0, by1, 1, -1], [bx1, by1, -1, -1]].forEach(([x, y, sx, sy]) => {
                        b.fillRect(Math.round(x), Math.round(y), 3 * sx || 1, 1); b.fillRect(Math.round(x), Math.round(y), 1, 3 * sy || 1);
                    });
                }
            }
        });
        if (popOn) this.ledPopDraw(b, W, wt);
        // линия: тихо всегда; встали — развёртка слева направо; выигрыш —
        // горит и пульсирует
        let line = 0.35 * (1 - 0.5 * lose);
        if (W && wt < 1e8) line = Math.max(line, 0.7 + 0.3 * pulse);
        b.globalAlpha = Math.min(1, line); b.fillStyle = P.line;
        b.fillRect(1, L.mid, L.w - 2, 1);
        if (this._lineAt) {
            const u = (now - this._lineAt) / K.sweepMs;
            if (u < 1.2) {
                const x = Math.round(u * L.w);
                for (let k = 0; k < 8; k++) { b.globalAlpha = (1 - k / 8) * Math.min(1, 1.2 - u); b.fillStyle = P.flash; b.fillRect(x - k, L.mid - (k < 2 ? 1 : 0), 1, k < 2 ? 3 : 1); }
            } else if (now - this._lineAt > 1300) this._lineAt = null;
        }
        // средний выигрыш и выше — огни бегут по рамке экрана
        if (W && W.tier >= 2 && wt < [0, 0, 1800, 2600][W.tier]) {
            const per = 2 * (L.w + L.h), step = 6, sh = Math.floor(wt / 50) % step;
            b.fillStyle = P.flash; b.globalAlpha = 0.9 * (1 - wt / [1, 1, 1800, 2600][W.tier]);
            for (let p = sh; p < per; p += step) {
                const x = p < L.w ? p : p < L.w + L.h ? L.w - 1 : p < 2 * L.w + L.h ? 2 * L.w + L.h - 1 - p : 0;
                const y = p < L.w ? 0 : p < L.w + L.h ? p - L.w : p < 2 * L.w + L.h ? L.h - 1 : per - 1 - p;
                b.fillRect(x, y, 1, 1);
            }
        }
        // джекпот: экран трижды вспыхивает, сверху — дождь пиксельных монет
        if (scr) { b.globalAlpha = scr * 0.36; b.fillStyle = P.flash; b.fillRect(0, 0, L.w, L.h); }
        if (W && W.tier === 3 && wt < 2600) {
            b.fillStyle = P.flash;
            for (let i = 0; i < 26; i++) {
                const x = (i * 37) % L.w, sp = 0.02 + ((i * 13) % 7) * 0.004, y = ((wt * sp + i * 11) % (L.h + 6)) - 3;
                b.globalAlpha = 0.9 * (1 - wt / 2600); b.fillRect(x, Math.round(y), 2, 2);
            }
        }
        if (W && this.ledWinDraw) this.ledWinDraw(b, W, wt);
        b.globalAlpha = 1;
        const cv = this.ledCv, c = cv.getContext('2d');
        c.globalCompositeOperation = 'source-over';
        c.imageSmoothingEnabled = false;
        c.drawImage(this.ledBuf, 0, 0, cv.width, cv.height);
        c.drawImage(this.ledGrid, 0, 0);
        // ореол: сильнее на скорости и на выигрыше
        const glow = 0.13 + 0.45 * speed + 0.5 * pulse + 0.4 * scr;
        if (glow > 0.01) {
            const gb = this.ledGlowBuf(), gc = gb.getContext('2d');
            gc.clearRect(0, 0, gb.width, gb.height); gc.imageSmoothingEnabled = true;
            gc.drawImage(this.ledBuf, 0, 0, gb.width, gb.height);
            c.globalCompositeOperation = 'lighter'; c.imageSmoothingEnabled = true; c.globalAlpha = Math.min(0.9, glow);
            c.drawImage(gb, 0, 0, cv.width, cv.height);
            c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        }
    },

    // Выигрыш на экране бандита — ступенями (reelsWin); старое трёхкратное
    // мигание ряда — только если ступени нет (превью без игры).
    blink() {
        const now = performance.now();
        if (this.wheelBlink && this.wheelBlink(now)) return;
        if (this.pachBlink && this.pachBlink(now)) return;
        // ступень уже идёт (джекпот зовёт второе мигание сам) — не сбивать
        if (this._ledWin && now - this._ledWin.at < [0, 1300, 1800, 2600][this._ledWin.tier]) return;
        this._ledWin = { tier: 1, at: now }; this._ledDirty = true;
    }
});

// ступень показа — вместе со всплывашкой (экран алчности зовёт winPop)
(function () {
    const pop = GreedLux.winPop;
    GreedLux.winPop = function (game, res) {
        if (game === 'slots' && res) this.reelsWin(res);
        if (game === 'pachinko' && res && this.pachWinShow) this.pachWinShow(res);
        return pop ? pop.apply(this, arguments) : undefined;
    };
})();
