// АППАРАТ АЛЧНОСТИ: ВРАЩЕНИЕ БАРАБАНОВ
// Продолжение GreedJunkLit (greed-junk-lit.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после greed-junk-lit.js.
Object.assign(GreedJunkLit, {

    // ---------- ВРАЩЕНИЕ БАРАБАНОВ ----------
    // Срыв рычага → барабаны трогаются: короткий замах назад, разгон вниз
    // (лента едет вниз — смещение убывает), ход с размытием, остановка по
    // очереди слева направо: тормозят ровно к заранее известной ячейке
    // (исход решён в момент рывка, как у настоящего автомата), чуть
    // проскакивают и возвращаются, щелчок в палец. Пока крутятся,
    // перерисовываются только окна (REEL_BOX).
    REEL_BOX: { x: 84, y: 338, w: 192, h: 100 },
    SPIN: { back: 0.25, backMs: 110, vmax: 0.95, accelMs: 220, firstMs: 700, stepMs: 320, brakeCells: 2.5, over: 0.22, settleMs: 170 },
    spinning() { return !!(this.reels && this.reels.some(r => r.st)); },
    // targets — индексы ячеек ленты, которые встанут под нитку
    spin(targets) {
        if (!this.reels) return;
        this._spinAt = -1;
        this.reels.forEach((r, i) => Object.assign(r, { st: 'start', target: targets[i], s0: r.s, v: 0, i }));
    },
    // Исход превью: случайные ячейки; иногда нарочно тройка — проверить
    // мигание выигрыша. В игре исход даёт крутка (Backend).
    previewOutcome() {
        const G = GreedJunk, n = G.REEL_STRIP.length;
        if (Math.random() < 0.3) {
            const key = ['coin', 'bone', 'meat', 'skull'][Math.floor(Math.random() * 4)];
            return [0, 1, 2].map(i => G.reelIndexOf(key, Math.floor(Math.random() * n)));
        }
        return [0, 1, 2].map(() => Math.floor(Math.random() * n));
    },
    // кадр вращения; true — барабаны двигались
    spinStep(now) {
        if (!this.spinning()) return false;
        if (this._spinAt === -1) { this._spinAt = now; this._spinLast = now; }
        const P = this.SPIN, C = GreedJunk.CELL, L = GreedJunk.REEL_STRIP.length * C.h;
        const t = now - this._spinAt, dt = Math.min(50, now - this._spinLast);
        this._spinLast = now;
        let landed = 0;
        this.reels.forEach(r => {
            if (!r.st) { r.blur = 0; return; }
            if (r.st === 'start') {
                // замах: лента подаётся вверх, потом разгон вниз
                if (t < P.backMs) r.s = r.s0 + P.back * C.h * Math.sin(t / P.backMs * Math.PI);
                else {
                    r.v = P.vmax * Math.min(1, (t - P.backMs) / P.accelMs);
                    r.s -= r.v * dt;
                    // Слева направо: не раньше своего срока и не раньше, чем
                    // начал тормозить левый сосед (цель подъезжает к месту
                    // тормоза в своё время — порядок иначе мог сбиться).
                    const left = this.reels[r.i - 1];
                    const leftOk = !left || (left.st !== 'start' && now - (left.at || now) >= P.stepMs * 0.6);
                    if (t >= P.firstMs + r.i * P.stepMs && leftOk) {
                        // Тормоз — когда цель подъехала на brakeCells: ровное
                        // торможение за ~0.3 с. Было: тормозил сразу и мог
                        // ехать до цели почти оборот ленты — до 2.5 с.
                        const want = r.target * C.h + C.h / 2;
                        const fin = want + Math.floor((r.s - want) / L) * L;
                        const d = r.s - fin, D = P.brakeCells * C.h;
                        if (d <= D && d >= D * 0.6)
                            Object.assign(r, { st: 'brake', from: r.s, fin, dist: d + P.over * C.h, at: now, dur: 2 * (d + P.over * C.h) / r.v });
                    }
                }
            } else if (r.st === 'brake') {
                const u = Math.min(1, (now - r.at) / r.dur);
                r.s = r.from - r.dist * (1 - (1 - u) * (1 - u));
                r.v = P.vmax * (1 - u);
                if (u >= 1) {
                    r.st = 'settle'; r.at = now;
                    if (typeof Haptics !== 'undefined') Haptics.impact('rigid', true);
                }
            } else if (r.st === 'settle') {
                // проскочил на over — пружиной назад на ячейку
                const u = Math.min(1, (now - r.at) / P.settleMs), e = 1 - Math.pow(1 - u, 3);
                r.s = r.fin - P.over * C.h * (1 - e);
                r.v = 0;
                if (u >= 1) { r.s = ((r.fin % L) + L) % L; r.st = null; landed++; }
            }
            // размытие — путь ленты за выдержку ~30 мс
            r.blur = Math.min(C.h * 1.2, Math.abs(r.v) * 30);
        });
        if (landed && !this.spinning()) this.spinDone();
        return true;
    },
    // все встали: тройка под ниткой — мигание; готовность — когда и рычаг
    // вернулся
    spinDone() {
        const G = GreedJunk, S = G.REEL_STRIP, C = G.CELL;
        const keys = this.reels.map(r => S[Math.round((r.s - C.h / 2) / C.h) % S.length]);
        if (keys[0] === keys[1] && keys[1] === keys[2] && keys[0] !== 'blank') {
            this.blink();
            if (this.trayPour) this.trayPour((this.TRAY_PAY || {})[keys[0]] || 5);
        }
        if (this.autoReady && this._leverIdle !== false) this.setReady(true);
    },
});
