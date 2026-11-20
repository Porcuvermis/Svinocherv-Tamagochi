// ================= АППАРАТ АЛЧНОСТИ, ВЕРСИЯ 2: ПАЧИНКО =================
// Продолжение GreedLux (greed-lux.js): пачинко версии 2 (план 31, разд. 5а,
// этап 4).
//
// Поле — ТО ЖЕ, что у гаражного: гвозди, лунки, дуга, дорожка, сток, кнопка
// (запечено по выгрузке геометрии игры, tools/greed-lux-sketch/pach-geom.js).
// Физика шарика, запас запусков и запуск под решённую лунку — функциями
// гаражного (greed-junk-pachinko-sim.js, greed-junk-lit-pachinko.js).
//
// Вид (решение игрока 18.11): шарик, гвозди, лунки — физические; электроника
// — украшения. Лунки — эмалевые стаканы приглушённых тонов с золотой
// кромкой, на лицевой стороне табло со значком приза; гвозди — золотые
// купола; шарик — зеркальная сталь тем же шейдером, что корпус.
// Как колесо версии 2 — «вылизано»: толкатель плавный, без пружинной дрожи;
// касание гвоздя — вспышка и тихий тик (не чаще tickGap); за шариком —
// лёгкий след; попадание — лунка «защёлкивается» (развёртка по её табло,
// остальные табло на миг гаснут), выигрыш — вспышка табло.
Object.assign(GreedLux, {
    PACH_SINK_MS: GreedJunkLit.PACH_SINK_MS,
    POOL: GreedJunkLit.POOL,
    POOL_MS: GreedJunkLit.POOL_MS,
    pachKey: GreedJunkLit.pachKey,
    pachPoolId: GreedJunkLit.pachPoolId,
    pachPool: GreedJunkLit.pachPool,
    pachPoolSave: GreedJunkLit.pachPoolSave,
    pachTry: GreedJunkLit.pachTry,
    pachKeys: GreedJunkLit.pachKeys,
    pachFill: GreedJunkLit.pachFill,
    pachFillAll: GreedJunkLit.pachFillAll,
    pachLaunch: GreedJunkLit.pachLaunch,
    pachFire: GreedJunkLit.pachFire,
    // tickGap — тики в палец не чаще, мс; flash — вспышка гвоздя, мс;
    // lockMs — защёлкивание лунки; plungerMs — возврат толкателя; trail —
    // точек следа шарика
    // near — радиус «ожидания» (табло под шариком разгораются), единиц короба;
    // loseMs — промах в сток; win — длительность показа по ступеням
    PACH_FX: { tickGap: 45, flash: 170, lockMs: 760, plungerMs: 240, trail: 6, near: { dx: 20, dy: 40 }, loseMs: 650, win: [0, 1400, 1800, 2500] },

    pachMount(wrap) {
        this._pach = null;
        if (!this.sets.pball) return;
        this._pach = { ball: null, acc: 0, bat: 0, press: -1e9, sink: null, seek: null, fireAt: -1e9, flashes: [], trail: [] };
        // гаражные функции запуска (pachLaunch, pachFillAll) ждут «прибор
        // короба собран» — у версии 2 короб в корпусе, он есть всегда
        this._pgl = true;
        const G = GreedJunk, P = G.PACH, R = G.pachRect({ x: P.x0, y: P.y0, w: P.x1 - P.x0, h: P.y1 - P.y0 });
        const cv = document.createElement('canvas'), d = Math.min(3, window.devicePixelRatio || 1);
        cv.width = Math.round(R.w * 1.1 * d * 1.6); cv.height = Math.round(R.h * 1.1 * d * 1.6);
        cv.style.cssText = `position:absolute;left:${R.x / this.W * 100}%;top:${(R.y - this.Y0) / this.H * 100}%;` +
            `width:${R.w / this.W * 100}%;height:${R.h / this.H * 100}%;z-index:2;pointer-events:none;background:none`;
        wrap.appendChild(cv);
        this.pfx = cv; this.pfxK = cv.width / (P.x1 - P.x0);
        this.pachGlareMount(wrap);
        // кнопка — тап по ней (зона шире кнопки, как у гаражного)
        wrap.addEventListener('pointerdown', (e) => {
            const B = G.PACH.button, [x, y] = G.pachInv(...G.toField(e, wrap));
            if (Math.hypot(x - B.x, y - B.y) > B.r + 11) return;
            e.preventDefault(); e.stopPropagation();
            this.pachLaunch();
        });
    },

    // ---------- блики стекла ----------
    // Игрок (18.11): «между ровно и наклон разницы не вижу» — отражение
    // студии в шейдере на тёмном стекле — узкая полоска, и от наклона она
    // почти не ходит. Блики — отдельным слоем: широкие мягкие косые полосы
    // (рисуются один раз), к низу гаснут; наклон телефона двигает слой
    // переносом (без перерисовки) — отражение заметно ползёт по стеклу.
    // Слой над шариком: шарик под стеклом. Обрезан колодцем поля.
    GLARE: { m: 34, kx: 46, ky: 34 },
    pachGlareMount(wrap) {
        const G = GreedJunk, P = G.PACH, K = this.GLARE, d = Math.min(3, window.devicePixelRatio || 1);
        const x0 = P.x0 + P.wall - 1, x1 = P.x1 - P.wall + 1, y0 = P.y0 + P.top - 1, y1 = P.y1 - P.panel + 1;
        const R = G.pachRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        const clip = document.createElement('div');
        clip.style.cssText = `position:absolute;left:${R.x / this.W * 100}%;top:${(R.y - this.Y0) / this.H * 100}%;` +
            `width:${R.w / this.W * 100}%;height:${R.h / this.H * 100}%;overflow:hidden;z-index:2;pointer-events:none;border-radius:3%`;
        const w = x1 - x0 + 2 * K.m, h = y1 - y0 + 2 * K.m, k = 2.2 * d, cv = document.createElement('canvas');
        cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        cv.style.cssText = `position:absolute;left:${-K.m / (x1 - x0) * 100}%;top:${-K.m / (y1 - y0) * 100}%;` +
            `width:${w / (x1 - x0) * 100}%;height:${h / (y1 - y0) * 100}%;background:none;will-change:transform`;
        clip.appendChild(cv); wrap.appendChild(clip);
        const c = cv.getContext('2d'), L = PALETTE.greedLux.glass;
        c.setTransform(k, 0, 0, k, 0, 0);
        c.filter = `blur(${(1.6 * k).toFixed(1)}px)`;
        // полосы: середина (доля ширины), ширина, сила
        [[0.24, 22, 0.13], [0.46, 4.5, 0.16], [0.62, 2.2, 0.12], [0.84, 11, 0.07], [1.12, 18, 0.11], [1.3, 3, 0.13]].forEach(([u, bw, a]) => {
            const ax = K.m + (x1 - x0) * u, run = h * 0.6;
            c.globalAlpha = a; c.fillStyle = L.glare;
            c.beginPath(); c.moveTo(ax, 0); c.lineTo(ax + bw, 0); c.lineTo(ax + bw - run, h); c.lineTo(ax - run, h); c.closePath(); c.fill();
        });
        c.filter = 'none'; c.globalAlpha = 1;
        // к низу гаснут: отражается лампа над аппаратом
        c.globalCompositeOperation = 'destination-in';
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0.1)');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        c.globalCompositeOperation = 'source-over';
        this.glareCv = cv; this.glareSpan = [x1 - x0, y1 - y0]; this._glareAt = null;
    },
    // сдвиг бликов за наклоном (единицы поля → проценты слоя)
    pachGlareAt() {
        const cv = this.glareCv, t = this.tilt, K = this.GLARE;
        if (!cv || !t) return;
        const dx = Math.max(-K.m, Math.min(K.m, t.x * K.kx)), dy = Math.max(-K.m, Math.min(K.m, -t.y * K.ky));
        if (this._glareAt && Math.abs(dx - this._glareAt[0]) < 0.15 && Math.abs(dy - this._glareAt[1]) < 0.15) return;
        this._glareAt = [dx, dy];
        const [sw, sh] = this.glareSpan, w = sw + 2 * K.m, h = sh + 2 * K.m;
        cv.style.transform = `translate(${(dx / w * 100).toFixed(2)}%, ${(dy / h * 100).toFixed(2)}%)`;
    },

    // Толкатель: взведён на выстреле и плавно, без дрожи, уходит назад.
    pachPlunger(now) {
        const M = this._pach;
        if (M.seek) return 1;
        const t = (now - M.fireAt) / this.PACH_FX.plungerMs;
        if (t < 0) return 1;
        if (t >= 1) return 0;
        return 1 - (1 - Math.pow(1 - t, 3));
    },
    // где шарик на поле: прямоугольник спрайта (с тенью) в единицах поля
    pachBallRect(b) {
        const G = GreedJunk, [x, y] = G.pachPt(b.x, b.y), q = this.meta.live.pball;
        return { x: x + q[0] - 1, y: y + q[1] - 1, w: q[2] + 5, h: q[3] + 6 };
    },
    pachStep(now) {
        const M = this._pach, G = GreedJunk, K = G.PACH_PHYS, F = this.PACH_FX;
        if (!M) return;
        this.pachGlareAt();
        this.pachFill(now);
        const dt = Math.min(0.05, M.bat ? (now - M.bat) / 1000 : 1 / 60);
        M.bat = now;
        const was = M.ball ? this.pachBallRect(M.ball) : (M.sink ? this.pachBallRect(M.sink) : null);
        if (M.ball && M.ball.hold) M.press = now;
        if (M.ball && !M.ball.hold) {
            M.acc += dt;
            while (M.acc >= K.STEP && M.ball) {
                M.acc -= K.STEP;
                const ev = G.pachStepBall(M.ball);
                if (ev === 'nail') this.pachNailHit(now, M.ball);
                if (M.ball.done) {
                    const res = M.ball.done, b = M.ball;
                    if (typeof Haptics !== 'undefined') Haptics.impact(res === 'drain' ? 'soft' : 'medium', true);
                    const cup = res === 'drain' ? null : G.pachCupOf(b, res);
                    M.sink = { x: b.x, y: b.y, y0: b.y, at: now, cut: cup ? cup.y0 + 0.6 : G.PACH.y1 - G.PACH.panel, res, cup };
                    if (cup) M.lock = { cup, at: now };
                    else M.lose = { at: now };
                    M.ball = null;
                }
            }
            if (M.ball) { M.trail.push([M.ball.x, M.ball.y]); if (M.trail.length > F.trail) M.trail.shift(); }
        } else if (!M.ball) M.trail.length = 0;
        if (M.sink) {
            const k = Math.min(1, (now - M.sink.at) / this.PACH_SINK_MS);
            M.sink.y = M.sink.y0 + k * K.r * 2.4;
            if (k >= 1) {
                const res = M.sink.res;
                M.sink = null; M.doneAt = now;
                if (this.onPachDone) this.onPachDone(res);
            }
        }
        // что перерисовать: шарик (был и стал), толкатель, если двигался
        const pk = this.pachPlunger(now);
        let r = null;
        const add = (q) => { if (!q) return; r = !r ? Object.assign({}, q) : { x: Math.min(r.x, q.x), y: Math.min(r.y, q.y), w: Math.max(r.x + r.w, q.x + q.w) - Math.min(r.x, q.x), h: Math.max(r.y + r.h, q.y + q.h) - Math.min(r.y, q.y) }; };
        const now_ = M.ball ? this.pachBallRect(M.ball) : (M.sink ? this.pachBallRect(M.sink) : null);
        if (was || now_) { add(was); add(now_); }
        if (pk !== M.pkShown) {
            const q = this.meta.live.plunger, drop = G.SPRING_DROP * G.PACH_AT.s;
            add({ x: q[0] - 1, y: q[1] - 1, w: q[2] + 2, h: q[3] + drop + 2 });
            M.pkShown = pk;
        }
        M.pk = pk;
        if (r) this._pachDirtyR = r;
        const fxOn = M.flashes.length || M.trail.length || M.ball || (M.lock && now - M.lock.at < F.lockMs) || (now - M.press < 160) || this._pachWin ||
            (M.lose && now - M.lose.at < F.loseMs);
        if (fxOn || M.fxWas) this.pfxDraw(now);
        M.fxWas = !!fxOn;
    },
    // Касание гвоздя: вспышка ближайшего и тихий тик — не чаще tickGap
    // (у гаражного — удар на каждое касание).
    pachNailHit(now, b) {
        const M = this._pach, G = GreedJunk, K = G.PACH_PHYS;
        let best = null, bd = 1e9;
        G.pachWorld().nails.forEach(([x, y]) => { const d = Math.hypot(x - b.x, y - b.y); if (d < bd) { bd = d; best = [x, y]; } });
        if (best && bd < K.r + K.nailR + 1.5) M.flashes.push({ x: best[0], y: best[1], at: now });
        if (now - (M.tickAt || 0) >= this.PACH_FX.tickGap) {
            M.tickAt = now;
            if (typeof Haptics !== 'undefined') Haptics.tick();
        }
    },

    // Толкатель и шарик — поверх корпуса, тем же шейдером (paint в greed-lux.js).
    pachPaint() {
        const M = this._pach, G = GreedJunk, B = this.meta.live;
        if (!M) return;
        const q = B.plunger, drop = G.SPRING_DROP * G.PACH_AT.s * (M.pk || 0);
        // толкатель уходит под панель — вне дорожки его не видно
        const fy1 = G.pachPt(0, G.PACH.y1 - G.PACH.panel)[1];
        this.clipTo({ x: q[0] - 2, y: q[1] - 2, w: q[2] + 4, h: fy1 - q[1] + 2 });
        this.quad(this.sets.plunger, q[0], q[1] + drop, q[2], q[3]);
        this.clipTo(null);
        const b = M.ball || M.sink;
        if (!b || (M.ball && M.ball.hold && false)) return;
        const [x, y] = G.pachPt(b.x, b.y + (M.ball && M.ball.hold ? G.SPRING_DROP * (M.pk || 0) : 0)), p = B.pball;
        if (M.sink) this.clipTo({ x: x - 10, y: y - 30, w: 20, h: G.pachPt(0, M.sink.cut)[1] - (y - 30) });
        const tx = this.drawn ? this.drawn[0] : 0, ty = this.drawn ? this.drawn[1] : 0;
        this.quad(this.sets.pball, x + p[0] + 1.6 - tx * 3, y + p[1] + 2 + ty * 3, p[2], p[3], 0.4);
        this.quad(this.sets.pball, x + p[0], y + p[1], p[2], p[3]);
        if (M.sink) this.clipTo(null);
    },

    // ---------- электроника: вспышки, след, защёлкивание, кнопка ----------
    pfxDraw(now) {
        const M = this._pach, G = GreedJunk, P = G.PACH, F = this.PACH_FX, c = this.pfx.getContext('2d'), k = this.pfxK, L = PALETTE.greedLux;
        c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.pfx.width, this.pfx.height);
        c.setTransform(k, 0, 0, k, -P.x0 * k, -P.y0 * k);
        // кнопка утоплена — колпак темнеет
        if (now - M.press < 160) {
            const Bt = P.button;
            c.globalAlpha = 0.35 * (1 - (now - M.press) / 160); c.fillStyle = L.wheel.dim;
            c.beginPath(); c.arc(Bt.x, Bt.y, Bt.r, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
        }
        const C = P.cup, cups = G.PACH_CUPS, plate = (cu) => this.pachPlate(cu);
        // ожидание: табло лунок под летящим шариком разгораются по близости
        if (M.ball && !M.ball.hold) {
            const b = M.ball, N = F.near;
            c.globalCompositeOperation = 'lighter';
            cups.forEach(cu => {
                const dx = Math.abs(cu.x - b.x), dy = cu.y - b.y;
                if (dx > N.dx || dy < -2 || dy > N.dy) return;
                const g = (1 - dx / N.dx) * (1 - Math.max(0, dy) / N.dy), q = plate(cu), col = (L.cupLed && L.cupLed[cu.key]) || L.scan;
                c.globalAlpha = Math.min(1, 1.4 * g); c.fillStyle = col;
                c.fillRect(q.x, q.y, q.w, q.h);
                this.pachCupGlow(c, cu, col, Math.min(1, 1.3 * g), 13);
            });
            c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        }
        // промах в сток: поле на миг тускнеет, по решётке стока — тёмная волна
        if (M.lose && now - M.lose.at < F.loseMs) {
            const u = (now - M.lose.at) / F.loseMs, A = P.arc, rd = P.sep - A.cx, fl = A.cx - rd;
            c.fillStyle = L.wheel.dim;
            c.globalAlpha = Math.sin(Math.min(1, u * 1.6) * Math.PI);
            c.beginPath(); c.moveTo(fl, P.drain); c.lineTo(fl, A.cy); c.arc(A.cx, A.cy, rd, Math.PI, 0); c.lineTo(P.sep, P.drain); c.closePath(); c.fill();
            const fy1 = P.y1 - P.panel, x = fl + (P.sep - fl) * Math.min(1, u * 1.3);
            const g = c.createLinearGradient(x - 18, 0, x + 4, 0);
            g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.8, L.wheel.dim); g.addColorStop(1, 'rgba(0,0,0,0)');
            c.globalAlpha = 1 - u; c.fillStyle = g; c.fillRect(Math.max(fl, x - 18), P.drain - 2, 22, fy1 - P.drain + 2);
            c.fillRect(Math.max(fl, x - 18), P.drain - 2, 22, fy1 - P.drain + 2);
            c.globalAlpha = 1;
        }
        // защёлкивание: остальные табло гаснут, по попавшему — развёртка, потом свечение
        const lock = M.lock && now - M.lock.at < F.lockMs ? (now - M.lock.at) / F.lockMs : -1;
        if (lock >= 0) {
            const a = lock < 0.25 ? lock / 0.25 : 1 - (lock - 0.25) / 0.75;
            c.fillStyle = L.wheel.dim; c.globalAlpha = Math.max(0, a);
            cups.forEach(cu => { if (M.lock.cup && Math.abs(cu.x - (M.lock.cup.x0 + C.w / 2)) < 0.5 && Math.abs(cu.y - M.lock.cup.y0) < 0.5) return; const q = plate(cu); c.fillRect(q.x, q.y, q.w, q.h); });
            c.globalAlpha = 1;
        }
        c.globalCompositeOperation = 'lighter';
        if (lock >= 0 && M.lock.cup) {
            const cu = cups.find(x => Math.abs(x.x - (M.lock.cup.x0 + C.w / 2)) < 0.5 && Math.abs(x.y - M.lock.cup.y0) < 0.5), q = plate(cu);
            const col = (L.cupLed && L.cupLed[cu.key]) || L.scan;
            if (lock < 0.4) { const y = q.y + q.h * (lock / 0.4); c.globalAlpha = 0.9; c.fillStyle = L.scan; c.fillRect(q.x, y - 0.4, q.w, 0.8); }
            const la = lock < 0.4 ? lock / 0.4 : 1 - (lock - 0.4) / 0.6;
            c.globalAlpha = la * 0.95;
            c.fillStyle = col; c.fillRect(q.x, q.y, q.w, q.h);
            this.pachCupGlow(c, cu, col, la * 0.8, 14);
            c.globalAlpha = 1;
        }
        // выигрыш (blink игры) — ступенями: 1 монета — табло мигает и
        // загорается солнце купола; 2 осколок — ещё лучи веера вспыхивают от
        // солнца волной; 3 жетон — ещё огни бегут по кромке купола
        if (this._pachWin) {
            const Wn = this._pachWin, dur = F.win[Wn.tier] || 900, u = (now - Wn.at) / dur;
            if (u >= 1) this._pachWin = null;
            else this.pachWinDraw(c, Wn, u, plate);
        }
        // вспышки гвоздей
        M.flashes = M.flashes.filter(f => now - f.at < F.flash);
        M.flashes.forEach(f => {
            const u = (now - f.at) / F.flash, r = 4.5;
            const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
            g.addColorStop(0, L.wheel.spark); g.addColorStop(0.35, L.wheel.sparkHalo); g.addColorStop(1, 'rgba(0,0,0,0)');
            c.globalAlpha = 1 - u; c.fillStyle = g; c.fillRect(f.x - r, f.y - r, r * 2, r * 2);
        });
        // след шарика — тонкая светлая полоса, затухает к хвосту
        const T = M.trail;
        for (let i = 1; i < T.length; i++) {
            c.globalAlpha = 0.22 * i / T.length; c.strokeStyle = L.scan; c.lineWidth = 1.6; c.lineCap = 'round';
            c.beginPath(); c.moveTo(T[i - 1][0], T[i - 1][1]); c.lineTo(T[i][0], T[i][1]); c.stroke();
        }
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    },
    // Свечение гвоздя для волны выигрыша: один раз в спрайт — гвоздей под
    // фронтом десятки за кадр, градиент на каждый был бы дорог.
    pachGlowSprite() {
        if (this._pachSpr) return this._pachSpr;
        const L = PALETTE.greedLux, n = 32, cv = document.createElement('canvas'); cv.width = cv.height = n;
        const c = cv.getContext('2d'), g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
        g.addColorStop(0, L.wheel.spark); g.addColorStop(0.18, L.wheel.spark); g.addColorStop(0.35, L.cupLed.gold1); g.addColorStop(0.6, L.wheel.sparkHalo); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(0, 0, n, n);
        return (this._pachSpr = cv);
    },
    // ореол лунки (в «свете»): цвет её табло, радиус r вокруг середины
    pachCupGlow(c, cu, col, a, r) {
        if (a <= 0.01) return;
        const C = GreedJunk.PACH.cup, x = cu.x, y = cu.y + C.h / 2;
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
        const keep = c.globalAlpha;
        c.globalAlpha = a * 0.6; c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r);
        c.globalAlpha = keep;
    },
    // табло лунки (вставка зиккурата, machine.py: x+5,6…, y+3…)
    pachPlate(cu) {
        const C = GreedJunk.PACH.cup;
        return { x: cu.x - C.w / 2 + 5.2, y: cu.y + 2.6, w: C.w - 10.4, h: C.h - 4.2 };
    },
    // Выигрыш. Первый вариант светил только табло, солнцем и тонкими лучами —
    // на телефоне промах (тёмная заливка ВСЕГО поля) читался заметнее победы
    // (игрок, 19.11). Теперь победа — зеркало промаха, только светом и
    // сильнее: всё поле вспыхивает цветом лунки, от неё по полю расходится
    // кольцо, из лунки летят искры; ступень добавляет лучи веера и огни
    // по кромке купола. Всё — формулой от u, без своего состояния.
    pachWinDraw(c, Wn, u, plate) {
        const G = GreedJunk, P = G.PACH, A = P.arc, rd = P.sep - A.cx, fl = A.cx - rd, L = PALETTE.greedLux, gold = L.cupLed.gold1;
        const T = Wn.tier, fade = u < 0.08 ? u / 0.08 : 1 - (u - 0.08) / 0.92, ax = A.cx, ay = A.cy - rd;
        const col = (Wn.cup && L.cupLed && L.cupLed[Wn.cup.key]) || gold;
        const cx = Wn.cup ? Wn.cup.x : ax, cy = Wn.cup ? Wn.cup.y + P.cup.h / 2 : A.cy;
        const field = () => { c.beginPath(); c.moveTo(fl, P.drain); c.lineTo(fl, A.cy); c.arc(A.cx, A.cy, rd, Math.PI, 0); c.lineTo(P.sep, P.drain); c.closePath(); };
        c.save(); field(); c.clip();
        // поле вспыхивает: пульсы (ступень — больше), первый самый яркий
        const pulses = 1 + T, pu = Math.max(0, Math.sin(u * Math.PI * 2 * pulses)) * Math.pow(1 - u, 0.7);
        const wash = c.createRadialGradient(cx, cy, 0, cx, cy, 260);
        wash.addColorStop(0, col); wash.addColorStop(0.5, gold); wash.addColorStop(1, L.wheel.sparkHalo);
        c.globalAlpha = Math.min(1, pu * (0.26 + 0.06 * T)); c.fillStyle = wash; c.fillRect(fl, P.y0, P.sep - fl, P.drain + 40 - P.y0);
        // Волны от лунки — не нарисованным кольцом, а светом самого поля
        // (игрок, 19.11): гвозди и табло лунок вспыхивают, когда через них
        // проходит фронт. Повторяется — у монеты 2 волны, у жетона 4.
        const waves = 1 + T, band = 12;
        const fronts = [];
        for (let r = 0; r < waves; r++) {
            const v = (u - r * 0.16) / 0.5;
            if (v > 0 && v < 1) fronts.push([4 + v * 240, 1 - v]);
        }
        if (fronts.length) {
            const lit = (x, y) => { let m = 0; fronts.forEach(([R, s]) => { const d = Math.abs(Math.hypot(x - cx, y - cy) - R); if (d < band) m = Math.max(m, s * (1 - d / band)); }); return m; };
            const spr = this.pachGlowSprite(), sr = 9;
            this._pachNailsC = this._pachNailsC || G.pachNails();
            this._pachNailsC.forEach(([x, y]) => {
                const m = lit(x, y); if (m <= 0.02) return;
                c.globalAlpha = m; c.drawImage(spr, x - sr, y - sr, 2 * sr, 2 * sr);
            });
            G.PACH_CUPS.forEach(cu => {
                const m = lit(cu.x, cu.y + P.cup.h / 2); if (m <= 0.02) return;
                const q = plate(cu), cc = (L.cupLed && L.cupLed[cu.key]) || L.scan;
                c.globalAlpha = m; c.fillStyle = cc; c.fillRect(q.x, q.y, q.w, q.h);
                this.pachCupGlow(c, cu, cc, m, 16);
            });
        }
        // лучи веера от солнца — волной к краям; у монеты — только середина
        const rays = T >= 2 ? 17 : 7;
        c.lineCap = 'round';
        for (let k = 0; k < rays; k++) {
            const a = T >= 2 ? Math.PI * (0.04 + 0.92 * k / 16) : Math.PI * (0.32 + 0.36 * k / 6);
            const w = Math.abs(k - (rays - 1) / 2) / ((rays - 1) / 2), ph = u * 2.2 - w * 0.9;
            const on = Math.max(0, Math.sin(Math.min(1, Math.max(0, ph)) * Math.PI)) * fade;
            if (on <= 0.01) continue;
            const ex = ax + Math.cos(a) * 260, ey = ay + Math.sin(a) * 260;
            c.strokeStyle = gold;
            c.globalAlpha = on * 0.35; c.lineWidth = 6; c.beginPath(); c.moveTo(ax, ay); c.lineTo(ex, ey); c.stroke();
            c.globalAlpha = on; c.lineWidth = 1.6; c.beginPath(); c.moveTo(ax, ay); c.lineTo(ex, ey); c.stroke();
        }
        c.restore();
        // табло — мигает ярко, с широким ореолом
        if (Wn.cup) {
            const q = plate(Wn.cup), bl = Math.max(0, Math.sin(u * Math.PI * (4 + 2 * T))) * (1 - u * 0.4);
            c.globalAlpha = bl; c.fillStyle = col; c.fillRect(q.x - 1.5, q.y - 1.5, q.w + 3, q.h + 3);
            c.fillStyle = L.wheel.spark; c.globalAlpha = bl * 0.3; c.fillRect(q.x + 1, q.y + 1, q.w - 2, q.h - 2);
            this.pachCupGlow(c, Wn.cup, col, Math.min(1, 0.6 + bl), 30 + 8 * T);
        }
        // искры из лунки: веером вверх, падают дугой
        c.save(); field(); c.clip();
        const n = 10 + 8 * T, dur = this.PACH_FX.win[T] || 1100, t = u * dur / 1000;
        for (let i = 0; i < n; i++) {
            const h = Math.sin(i * 12.9898 + T * 78.233) * 43758.5453, f = h - Math.floor(h);
            const a = -Math.PI / 2 + (f - 0.5) * 2.4, sp = 110 + 120 * ((f * 7.31) % 1), life = 0.5 + 0.5 * ((f * 3.7) % 1);
            // старт с разбросом — иначе в первый миг все искры в одной точке и сливаются в белое пятно
            const tt = t * (0.8 + 0.4 * f) + 0.04 * ((f * 5.3) % 1); if (tt > life) continue;
            const x = cx + Math.cos(a) * sp * tt, y = cy + Math.sin(a) * sp * tt + 160 * tt * tt;
            const r = 1.8 * (1 - tt / life) + 0.5;
            const g = c.createRadialGradient(x, y, 0, x, y, r * 2.2);
            g.addColorStop(0, L.wheel.spark); g.addColorStop(0.3, i % 3 ? gold : col); g.addColorStop(1, 'rgba(0,0,0,0)');
            c.globalAlpha = 1 - tt / life; c.fillStyle = g; c.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
        }
        c.restore();
        // солнце купола
        const sr = 22 + 10 * T, sg = c.createRadialGradient(ax, ay, 0, ax, ay, sr);
        sg.addColorStop(0, L.wheel.spark); sg.addColorStop(0.25, gold); sg.addColorStop(0.6, L.wheel.sparkHalo); sg.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalAlpha = fade; c.fillStyle = sg; c.fillRect(ax - sr, ay - sr, 2 * sr, 2 * sr);
        if (T >= 3) {
            // огни бегут по кромке купола от вершины вниз по обе стороны
            for (let i = 0; i < 16; i++) {
                const tt = ((i / 16 + u * 1.5) % 1), a = Math.PI + tt * Math.PI;
                [a, 3 * Math.PI - a].forEach(b => {
                    const x = A.cx + Math.cos(b) * rd, y = A.cy + Math.sin(b) * rd;
                    const g = c.createRadialGradient(x, y, 0, x, y, 5);
                    g.addColorStop(0, L.wheel.spark); g.addColorStop(0.35, gold); g.addColorStop(1, 'rgba(0,0,0,0)');
                    c.globalAlpha = fade * (0.5 + 0.5 * Math.abs(Math.sin(i * 1.7 + u * 20))); c.fillStyle = g; c.fillRect(x - 5, y - 5, 10, 10);
                });
            }
        }
        c.globalAlpha = 1;
    },
    // Ступень выигрыша по награде (экран алчности зовёт winPop до blink):
    // монеты — 1, осколок — 2, жетон — 3.
    pachWinShow(res) {
        const cur = (res && res.currencies) || {}, ks = Object.keys(cur).filter(k => cur[k] > 0);
        // жетоны пачинко теперь целые (20.11): обычный — средний, редкие
        // зависти и тщеславия — крупный, как было (раньше средний — осколок)
        this._pachTier = ks.some(k => /^(envy|pride)_token$/.test(k)) ? 3 : ks.some(k => /_token$|_shard$/.test(k)) ? 2 : ks.length ? 1 : 0;
    },
    // Выигрыш пачинко: шарик только что в лунке — мигает её табло.
    pachBlink(now) {
        const M = this._pach;
        if (!M || !M.doneAt || now - M.doneAt > 2000 || !M.lock || !M.lock.cup) return false;
        M.doneAt = null;
        const C = GreedJunk.PACH.cup, cu = GreedJunk.PACH_CUPS.find(x => Math.abs(x.x - (M.lock.cup.x0 + C.w / 2)) < 0.5 && Math.abs(x.y - M.lock.cup.y0) < 0.5);
        const tier = Math.max(1, this._pachTier || 1);
        this._pachWin = { at: now, cup: cu, tier };
        if (typeof Haptics !== 'undefined') {
            if (tier === 1) Haptics.notify('success', true);
            else Haptics.burst(tier === 3 ? 'heavy' : 'medium', tier === 3 ? 3 : 2, 100, 'success');
        }
        return true;
    }
});
