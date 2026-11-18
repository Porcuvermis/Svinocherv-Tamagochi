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
    PACH_FX: { tickGap: 45, flash: 170, lockMs: 760, plungerMs: 240, trail: 6 },

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
        const fxOn = M.flashes.length || M.trail.length || (M.lock && now - M.lock.at < F.lockMs) || (now - M.press < 160) || this._pachWin;
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
        const C = P.cup, cups = G.PACH_CUPS, plate = (cu) => ({ x: cu.x - C.w / 2 + 3, y: cu.y + 3.4, w: C.w - 6, h: C.h - 5 });
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
            c.globalAlpha = (lock < 0.4 ? lock / 0.4 : 1 - (lock - 0.4) / 0.6) * (this._pachWin ? 0.9 : 0.55);
            c.fillStyle = col; c.fillRect(q.x, q.y, q.w, q.h);
            c.globalAlpha = 1;
        }
        // выигрыш (blink игры): табло мигает
        if (this._pachWin) {
            const u = (now - this._pachWin.at) / 900;
            if (u >= 1) this._pachWin = null;
            else if (this._pachWin.cup) {
                const q = plate(this._pachWin.cup), col = (L.cupLed && L.cupLed[this._pachWin.cup.key]) || L.scan;
                c.globalAlpha = Math.max(0, Math.sin(u * Math.PI * 3)) * (1 - u * 0.5); c.fillStyle = col;
                c.fillRect(q.x - 1.5, q.y - 1.5, q.w + 3, q.h + 3); c.globalAlpha = 1;
            }
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
    // Выигрыш пачинко: шарик только что в лунке — мигает её табло.
    pachBlink(now) {
        const M = this._pach;
        if (!M || !M.doneAt || now - M.doneAt > 2000 || !M.lock || !M.lock.cup) return false;
        M.doneAt = null;
        const C = GreedJunk.PACH.cup, cu = GreedJunk.PACH_CUPS.find(x => Math.abs(x.x - (M.lock.cup.x0 + C.w / 2)) < 0.5 && Math.abs(x.y - M.lock.cup.y0) < 0.5);
        this._pachWin = { at: now, cup: cu };
        if (typeof Haptics !== 'undefined') Haptics.notify('success', true);
        return true;
    }
});
