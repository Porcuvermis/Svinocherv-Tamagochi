// ================= АППАРАТ АЛЧНОСТИ, ВЕРСИЯ 2: КОЛЕСО =================
// Продолжение GreedLux (greed-lux.js): колесо фортуны версии 2 (план 31,
// разд. 5а, этап 3).
//
// Механика — гаражного колеса, его же функциями (greed-junk-lit-wheel.js):
// палец (wheelInput), бросок с заранее выбранной остановкой (wheelThrow),
// торможение и откат на штырь (wheelStep), отдача на каждом штыре
// (wheelFlap), колода за кадром (wheelDeckPlan: выпавший приз под язычок,
// ложные редкие вдвое чаще шанса). Сектора — те же 16, счёт тот же: сектор
// i серединой на угле i/16·2π − π/2, указатель на 3 часа.
//
// Вид версии 2:
//   * диск с ободом и штырями — спрайт (lux/disc-*.png), вращается в шейдере
//     корпуса: свет и отражения стоят, рельеф поворачивается с диском;
//   * указатель — свой спрайт поверх диска;
//   * значки — живые на экранах-секторах (решение игрока 10.11), крутятся с
//     диском; колода подменяет их, пока сектор под монетами рамки, — просто
//     сменой ключа (у фанерного колеса это был кусок текстуры);
//   * раз в 6–10 с, пока колесо стоит, один видимый значок оживает: сбой,
//     рассыпание, перерисовка; выигрыш — вспышка значка и всего клина.
Object.assign(GreedLux, {
    WHEEL_SPIN: GreedJunkLit.WHEEL_SPIN,
    WHEEL_DECOY: GreedJunkLit.WHEEL_DECOY,
    WHEEL_RARE: GreedJunkLit.WHEEL_RARE,
    WHEEL_TILE: GreedJunkLit.WHEEL_TILE,
    wheelInput: GreedJunkLit.wheelInput,
    wheelOdds: GreedJunkLit.wheelOdds,
    wheelDeckPlan: GreedJunkLit.wheelDeckPlan,
    wheelHidden: GreedJunkLit.wheelHidden,
    // свет колеса версии 2 — в шейдере корпуса; гаражному нужны свои тени
    LIGHT_MS: 1e9,
    lightFor() { return [0, 0, 1]; },
    wheelShadowAt() {},
    // где значок на секторе: доля радиуса диска (эскиз — R·0.74)
    ICON_R: 111,
    // приз колеса (ключ конфига) → пиксельный значок (lux.json, sprites)
    ICON_OF: { gold1: 'coin', gold3: 'coins3', seed: 'potato', meat: 'meat', shard: 'shard' },
    iconGrid(key) { return this.meta.sprites[this.ICON_OF[key] || key] || null; },
    // перерисовка колеса целиком (с корпусом под ним и тенью) — когда встало
    WHEEL_RECT: { x: 0, y: -52, w: 212, h: 342 },
    // Пока крутится — только диск и указатель, облегчённо (uFast): корпус
    // под диском не меняется (диск непрозрачен, его тень — круг, от поворота
    // не зависит). Было: каждый кадр вращения — участок корпуса полным
    // шейдером, 0,5 с на кадр в браузере без видеокарты (палец не успевал).
    // Указатель — только внутри круга диска (x ≤ 185): там диск под ним
    // свежий; снаружи его край ложился бы сам на себя кадр за кадром.
    paintWheelFast() {
        const M = this._wheel, B = this.meta.live, gl = this.gl;
        if (!M || !this.sets.disc) return;
        const [x, y, w, h] = B.disc, [px, py, pw, ph] = B.ptr;
        gl.uniform1f(this.U.fast, 1);
        this.scissor({ x: 0, y, w: x + w, h });
        this.quad(this.sets.disc, x, y, w, h, 0, M.rot);
        this.scissor({ x: px, y: py, w: 185 - px, h: ph });
        this.quad(this.sets.ptr, px, py, pw, ph);
        gl.disable(gl.SCISSOR_TEST);
        gl.uniform1f(this.U.fast, 0);
    },

    // ---------- ДВИЖЕНИЕ: «на подшипниках» ----------
    // Игрок (18.11): гаражное колесо — тяжёлое, с откатом на штырь; это
    // хорошо для фанеры, а версия 2 — отлаженное премиальное устройство:
    // легче раскрутить, крутится и встаёт плавнее, без отката, всегда в
    // середину сектора. Механика та же: исход решает бэкенд на броске,
    // сектора, колода, минимум оборотов.
    //   gain — бросок пальца усиливается; minW — с какого взмаха крутка (у
    //   гаражного 0.0035); drag — как плотно диск идёт за пальцем (0.3);
    //   durMin/durMax — длина крутки от слабого до сильного броска, мс;
    //   turnsMin — не меньше оборотов; tickGap — тики в палец не чаще, мс;
    //   coastA — трение выбега без крутки; snapMs — доводка в центр сектора.
    WHEEL_LUX: { gain: 1.25, minW: 0.0018, maxW: 0.014, drag: 0.6, durMin: 3000, durMax: 4500, turnsMin: 1.5, tickGap: 45, coastA: 0.0000045, snapMs: 260 },

    // Бросок. Крутка — многочлен по доле времени u: s(u) = v0·u + (6L−3v0)u²
    // + (3v0−8L)u³ + (3L−v0)u⁴. Скорость в начале — скорость броска (без
    // скачка из пальца), в конце скорость и ускорение — ноль: диск встаёт,
    // как на магнитном тормозе. Скорость s' = L(1−u)²(r + (12−4r)u), r = v0/L:
    // назад не едет при r ≤ 4 (здесь r ≤ 1/0.42 ≈ 2.4); слабый бросок — диск
    // сам чуть подхватывает (мотор), сильный — сразу катится и замедляется.
    wheelThrow(w, now) {
        const M = this._wheel, P = this.WHEEL_LUX;
        w = Math.max(-P.maxW, Math.min(P.maxW, w * P.gain));
        M.w = w;
        const last = this.wheelLast || (this.wheelLast = {});
        last.w = w; last.why = Math.abs(w) < P.minW ? (last.held ? 'held' : 'weak') : 'play';
        if (Math.abs(w) < P.minW) { M.st = w ? 'coast' : 'idle'; if (!w) this.wheelSnap(now); return; }
        let key = null;
        if (this.onWheel) {
            key = this.onWheel();
            if (key === false || key == null) {
                last.why = 'refused';
                M.st = 'coast'; M.brake = true;
                if (typeof Haptics !== 'undefined') Haptics.notify('error', true);
                return;
            }
        }
        const idx = this.wheelDeckPlan(key);
        const n = GreedJunk.wheelKeys().length, sec = Math.PI * 2 / n, T2 = Math.PI * 2, dir = Math.sign(w), aw = Math.abs(w);
        const k = Math.max(0, Math.min(1, (aw - P.minW) / (P.maxW - P.minW))), T = P.durMin + (P.durMax - P.durMin) * k;
        // ровно середина сектора: язычка-резинки нет, ему некуда «не дотянуть»
        const want = GreedJunk.POINTER_ANGLE - idx * sec;
        const Lmin = Math.max(P.turnsMin * T2, aw * T * 0.42);
        const end = dir > 0 ? want + T2 * Math.ceil((M.rot + Lmin - want) / T2) : want - T2 * Math.ceil((want - (M.rot - Lmin)) / T2);
        const L = Math.abs(end - M.rot), v0 = aw * T;
        Object.assign(M, { st: 'spin', from: M.rot, to: end, dir, T, t0: now, poly: [v0, 6 * L - 3 * v0, 3 * v0 - 8 * L, 3 * L - v0] });
    },
    // Доводка в середину ближайшего сектора — после выбега и отпускания
    // без броска: диск всегда стоит ровно, «на щелчке».
    wheelSnap(now) {
        const M = this._wheel, n = GreedJunk.wheelKeys().length, sec = Math.PI * 2 / n, base = GreedJunk.POINTER_ANGLE;
        const to = base + Math.round((M.rot - base) / sec) * sec;
        if (Math.abs(to - M.rot) < 1e-4) { M.st = 'idle'; return; }
        Object.assign(M, { st: 'snap', from: M.rot, to, t0: now });
    },
    wheelStep(now) {
        const M = this._wheel, P = this.WHEEL_LUX;
        if (!M) return;
        const raw = M.at0 ? Math.min(400, now - M.at0) : 16, dt = Math.min(40, raw);
        M.at0 = now;
        const prev = M.rot;
        if (M.st === 'drag') {
            if (M.prevSt !== 'drag' && typeof Haptics !== 'undefined') Haptics.tick();     // захват
            M.rot += (M.target - M.rot) * (1 - Math.pow(1 - P.drag, raw / 16));
            const v = (M.rot - prev) / Math.max(1, raw);
            M.wr = (M.wr || 0) * 0.5 + v * 0.5;
        } else if (M.st === 'spin') {
            const u = Math.min(1, (now - M.t0) / M.T), [a, b, c, d] = M.poly;
            M.rot = M.from + M.dir * (a * u + b * u * u + c * u * u * u + d * u * u * u * u);
            if (u >= 1) {
                M.rot = M.to; M.st = 'idle';
                this.wheelDeckEnsure();
                if (typeof Haptics !== 'undefined') Haptics.impact('soft', true);
                if (this.onWheelDone) this.onWheelDone();
            }
        } else if (M.st === 'coast') {
            const sg = Math.sign(M.w);
            M.w -= sg * P.coastA * dt * (M.brake ? 10 : 1);
            if (Math.sign(M.w) !== sg || Math.abs(M.w) < 0.0003) { M.w = 0; M.brake = false; this.wheelSnap(now); }
            else M.rot += M.w * dt;
        } else if (M.st === 'snap') {
            const u = Math.min(1, (now - M.t0) / P.snapMs), e = 1 - Math.pow(1 - u, 3);
            M.rot = M.from + (M.to - M.from) * e;
            if (u >= 1) { M.rot = M.to; M.st = 'idle'; }
        }
        M.prevSt = M.st;
        this.wheelTicks(now);
        this.wheelDeckStep();
        const key = M.rot.toFixed(4);
        if (key !== M.shown) { M.shown = key; this.wheelDraw(); }
    },

    // ---------- ОТДАЧА: «электронный механизм» ----------
    // Тик на каждой границе сектора — самый тихий щелчок (как барабан выбора
    // даты в iPhone, Haptics.tick). Не чаще tickGap: на скорости лишние
    // пропускаются, а не копятся (у гаражного — очередь, удар за ударом),
    // выходит ровное жужжание; к концу тики сами расходятся по одному.
    wheelTicks(now) {
        const M = this._wheel, P = this.WHEEL_LUX, n = GreedJunk.wheelKeys().length, sec = Math.PI * 2 / n;
        const idx = Math.floor((M.rot - sec / 2 - GreedJunk.POINTER_ANGLE) / sec);
        if (M.lastPeg != null && idx !== M.lastPeg && now - (M.tickAt || 0) >= P.tickGap) {
            M.tickAt = now;
            if (typeof Haptics !== 'undefined') Haptics.tick();
        }
        M.lastPeg = idx;
    },

    wheelMount(wrap) {
        this._wheel = null;
        // Колесо у версии 2 стоит всегда: её покупают, когда открыты обе игры
        // (план 31, разд. 00), и корпус запечён без него. Было: по флажку
        // «колесо куплено» — вид 2 из 🐞 без купленного колеса показывал на
        // месте колеса дыру (игрок, 18.11, iPhone). Не куплено (только в
        // отладке) — бросок откажет бэкенд, колесо затормозит само.
        if (!this.sets.disc) return;
        this._wheel = { rot: 0, w: 0, st: 'idle', flap: 0, fv: 0, at: 0, shown: null, lastPeg: null, target: 0, mdir: 1 };
        this._wheelSpr = {};
        if (!GreedJunk.wheelNow) GreedJunk.wheelNow = GreedJunk.WHEEL_SECTORS.slice();
        this._deck = { queue: [], busy: null, target: -1, forced: 0, swaps: 0 };
        this.iconSprites = {};
        this.fx = null; this.nextFx = performance.now() + 2500;
        this.wheelInput(wrap);
        this._iconsDirty = true;
    },
    // гаражный зовёт после смены поворота — здесь: перерисовать участок
    wheelDraw() { this._wheelDirty = true; this._iconsDirty = true; },
    // Колода: подмена — сменой ключа, как только сектор под монетами.
    wheelDeckStep() {
        const D = this._deck, M = this._wheel;
        if (!D || !M || !D.queue.length) return;
        D.queue = D.queue.filter(q => {
            if (!q.force && !this.wheelHidden(q.i, M.rot)) return true;
            GreedJunk.wheelNow[q.i] = q.k; D.swaps++; this._iconsDirty = true;
            return false;
        });
    },
    // Колесо встало, а сектор выпавшего не подменён — сразу, на виду.
    wheelDeckEnsure() {
        const D = this._deck;
        if (!D) return;
        const c = D.queue.find(q => q.i === D.target);
        if (c) { D.forced++; c.force = true; this.wheelDeckStep(); }
        this._wheelStopAt = performance.now();
    },

    // Диск (с тенью) и указатель — поверх корпуса, до шара рычага.
    paintWheel() {
        const M = this._wheel, B = this.meta.live;
        if (!M || !this.sets.disc) return;
        const [x, y, w, h] = B.disc, tx = this.drawn ? this.drawn[0] : 0, ty = this.drawn ? this.drawn[1] : 0;
        // диск висит над корпусом на ступице — тень уходит от света
        this.quad(this.sets.disc, x + 4 - tx * 10, y + 5 + ty * 10, w, h, 0.42, M.rot);
        this.quad(this.sets.disc, x, y, w, h, 0, M.rot);
        const [px, py, pw, ph] = B.ptr;
        this.quad(this.sets.ptr, px + 1.5, py + 2, pw, ph, 0.45);
        this.quad(this.sets.ptr, px, py, pw, ph);
    },

    // ---------- значки на экранах секторов ----------
    // Значок в своём кадре: сетка 24×24 клетки (значок 16×16 со сдвигом 4),
    // клетка Q единиц, свечение — один раз в картинку.
    iconSprite(key) {
        if (this.iconSprites[key] !== undefined) return this.iconSprites[key];
        const g = this.iconGrid(key);
        if (!g) return (this.iconSprites[key] = null);
        const S = this.S, Q = this.Q, n = Math.ceil(24 * Q * S), cv = document.createElement('canvas');
        cv.width = cv.height = n;
        const c = cv.getContext('2d');
        c.shadowBlur = 5 * S;
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
            const col = g[y][x];
            if (!col) continue;
            c.fillStyle = col; c.shadowColor = col;
            c.fillRect((x + 4) * Q * S, (y + 4) * Q * S, (Q - 0.3) * S, (Q - 0.3) * S);
        }
        return (this.iconSprites[key] = cv);
    },
    // Сектор i: середина значка на поле и угол (0 — под указателем).
    iconAt(i) {
        const W = this.meta.live.wheel, n = GreedJunk.wheelKeys().length, M = this._wheel;
        const a = i / n * Math.PI * 2 - Math.PI / 2 + (M ? M.rot : 0);
        return { x: W[0] + Math.cos(a) * this.ICON_R, y: W[1] + Math.sin(a) * this.ICON_R, a };
    },
    iconsStep(now) {
        const M = this._wheel;
        if (!M || !this.icx) return;
        const idle = M.st === 'idle';
        // эффект раз в 6–10 с, один видимый значок, только пока колесо стоит
        if (!this.fx && idle && now > this.nextFx) {
            const keys = GreedJunk.wheelKeys(), vis = keys.map((k, i) => i).filter(i => this.iconSprite(keys[i]) && this.iconAt(i).x > 20);
            if (vis.length) this.fx = { i: vis[Math.floor(Math.random() * vis.length)], kind: ['glitch', 'scatter', 'redraw'][Math.floor(Math.random() * 3)], t0: now };
            else this.nextFx = now + 3000;
        }
        if (this.fx && !idle && this.fx.kind !== 'win') { this.fx = null; this._iconsDirty = true; }
        if (this.fx) {
            if ((now - this.fx.t0) / this.DUR[this.fx.kind] >= 1) { this.fx = null; this.nextFx = now + 6000 + Math.random() * 4000; }
            this._iconsDirty = true;
        }
        if (this._iconsDirty) { this._iconsDirty = false; this.drawIcons(now); }
    },
    // клин сектора — рамка эффекта (выигрыш светит весь клин)
    wedge(g, i) {
        const W = this.meta.live.wheel, S = this.S, n = GreedJunk.wheelKeys().length, a0 = this.iconAt(i).a, da = Math.PI / n - 0.012;
        const cx = W[0] * S, cy = (W[1] - this.Y0) * S, r = (W[2] - 2) * S;
        g.beginPath();
        g.moveTo(cx + Math.cos(a0 - da) * 24 * S, cy + Math.sin(a0 - da) * 24 * S);
        g.arc(cx, cy, r, a0 - da, a0 + da);
        g.arc(cx, cy, 24 * S, a0 + da, a0 - da, true);
        g.closePath();
    },
    // клетки значка в миг T эффекта (сетка 24×24, значок 16×16 со сдвигом 4)
    cells(kind, fx, T) {
        const g = this.iconGrid(kind), base = [];
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (g[y][x]) base.push([x + 4, y + 4, g[y][x], 1]);
        if (!fx) return base;
        const k = fx.kind;
        if (k === 'win' && T > 0.35) {
            const q = (T - 0.35) / 0.65, br = 1 + 1.4 * Math.max(0, Math.sin(q * Math.PI * 2)) * (1 - q * 0.4);
            return base.map(([x, y, c]) => [x, y, c, br]);
        }
        if (k === 'glitch' || k === 'win') {
            const tt = k === 'glitch' ? T : Math.min(1, T / 0.35), f = Math.floor(tt * 9);
            if (f === 3) return [];
            let seed = f * 31 + 7;
            const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
            const bands = [], nb = 2 + Math.floor(rnd() * 2);
            for (let i = 0; i < nb; i++) bands.push([Math.floor(rnd() * 16), 2 + Math.floor(rnd() * 3), [-3, -2, -1, 1, 2, 3][Math.floor(rnd() * 6)]]);
            const res = [], br = f === 5 ? 1.7 : 1;
            base.forEach(([x, y, c]) => {
                const sh = tt < 0.9 ? bands.reduce((s, [y0, hh, d]) => s + (y - 4 >= y0 && y - 4 < y0 + hh ? d : 0), 0) : 0;
                if (tt < 0.9 && f % 2 === 0) res.push([x + sh + 1, y, 'R' + c, br], [x + sh, y, 'G' + c, br], [x + sh - 1, y, 'B' + c, br]);
                else res.push([x + sh, y, c, br]);
            });
            return res;
        }
        if (k === 'scatter') {
            const s = Math.pow(Math.sin(Math.PI * T), 1.4);
            return base.map(([x, y, c]) => {
                let seed = x * 97 + y * 13;
                const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
                const vx = (x - 12) * (0.5 + rnd()) + (rnd() - 0.5) * 6, vy = (y - 12) * (0.5 + rnd()) + (rnd() - 0.5) * 6;
                return [Math.round(x + vx * s * 0.9), Math.round(y + vy * s * 0.9), c, 1 - 0.55 * s];
            });
        }
        if (k === 'redraw') {
            if (T < 0.12) return [];
            const row = (T - 0.12) / 0.8 * 16, res = [];
            base.forEach(([x, y, c]) => { const r = y - 4; if (r < row - 1) res.push([x, y, c, 1]); else if (r < row) res.push([x, y, PALETTE.greedLux.scan, 1.3]); });
            return res;
        }
        return base;
    },
    drawIcons(now) {
        const g = this.icx, S = this.S, Q = this.Q, L = PALETTE.greedLux, keys = GreedJunk.wheelKeys();
        g.clearRect(0, 0, this.ic.width, this.ic.height);
        g.globalCompositeOperation = 'lighter';
        keys.forEach((kind, i) => {
            const spr = this.iconSprite(kind), P = this.iconAt(i);
            if (!spr || P.x < -24) return;
            const fx = this.fx && this.fx.i === i ? this.fx : null;
            const T = fx ? Math.min(1, (now - fx.t0) / this.DUR[fx.kind]) : 0;
            const cx = P.x * S, cy = (P.y - this.Y0) * S;
            g.save();
            this.wedge(g, i); g.clip();
            if (fx && fx.kind === 'win' && T > 0.35) {
                const q = (T - 0.35) / 0.65;
                g.globalAlpha = Math.max(0, Math.sin(q * Math.PI * 2)) * (1 - q * 0.4);
                g.fillStyle = L.winFlash; g.fillRect(0, 0, this.ic.width, this.ic.height);
                g.globalAlpha = 1;
            }
            // значок «верхом» к указателю: под ним стоит прямо
            g.translate(cx, cy); g.rotate(P.a);
            if (!fx) { g.drawImage(spr, -spr.width / 2, -spr.height / 2); g.restore(); return; }
            g.shadowBlur = 5 * S;
            this.cells(kind, fx, T).forEach(([gx, gy, c, br]) => {
                let col = c;
                if (c[0] === 'R' || c[0] === 'G' || c[0] === 'B') {
                    const ch = c[0], hx = c.slice(1), v = parseInt(hx.slice({ R: 1, G: 3, B: 5 }[ch], { R: 3, G: 5, B: 7 }[ch]), 16);
                    col = ch === 'R' ? `rgb(${v},0,0)` : ch === 'G' ? `rgb(0,${v},0)` : `rgb(0,0,${v})`;
                }
                g.globalAlpha = Math.min(1, br);
                g.fillStyle = col; g.shadowColor = col;
                const px = (gx - 12) * Q * S, py = (gy - 12) * Q * S;
                g.fillRect(px, py, (Q - 0.3) * S, (Q - 0.3) * S);
                if (br > 1) { g.globalAlpha = br - 1; g.fillRect(px, py, (Q - 0.3) * S, (Q - 0.3) * S); }
            });
            g.restore();
        });
        g.globalCompositeOperation = 'source-over';
    },
    // Выигрыш колеса: колесо только что встало — вспышка выпавшего значка
    // и его клина; иначе — бандит (вспышка экрана, greed-lux-play.js).
    wheelBlink(now) {
        if (!this._wheel || !this._wheelStopAt || now - this._wheelStopAt > 2000) return false;
        this._wheelStopAt = null;
        if (typeof Haptics !== 'undefined') Haptics.notify('success', true);
        this.fx = { i: this._deck.target, kind: 'win', t0: now };
        this._iconsDirty = true;
        return true;
    }
});
