// ================= АППАРАТ АЛЧНОСТИ: СБОРКА ИГРЫ ПО ЗАПЧАСТЯМ =================
// Колесо открыто в банке-магазине — и на глазах у игрока, сквозь стекло
// банки, собирается на своём месте (docs/plan/31-greed-premium.md, «Открытие
// игры»): крепления у гаражного аппарата уже стоят (гнездо с проводами),
// прилетают доски щита, потом саморезы, которые его держат, потом диск с
// гвоздями-колышками и последней — резинка язычка. Детали летят из-за
// экрана — от камеры вглубь, крупными, — и встают на место с отдачей.
//
// Как без скачка в конце. Картинки деталей снимаются с УЖЕ собранного
// аппарата: аппарат пересобирается с колесом под стоп-кадром прежнего
// (снимок всех его холстов), с нового вырезаются доски, саморезы, диск и
// язычок — и летят поверх стоп-кадра. Когда всё легло, под ним уже ровно то
// же самое; стоп-кадр гаснет за четверть секунды (тень щита и мелочи под
// ним, которых на стоп-кадре не было, проявляются мягко).
const GreedAssembly = {
    // область колеса на поле аппарата: щит, диск, язычок
    REGION: { x0: 0, y0: -57, x1: 207, y1: 293 },

    // lower — опустить банку (идёт параллельно с пересборкой); сборка
    // начинается, когда и банка опустилась, и аппарат готов
    async wheel(lower) {
        const L = GreedJunkLit, host = L.wrapEl && L.wrapEl.parentElement;
        if (!host || !L.gl) { if (GreedDebug && GreedDebug.rebuild) await GreedDebug.rebuild(); return; }
        const ov = this.overlay(host);
        this.snap = this.snapshot(host);                 // стоп-кадр прежнего аппарата
        this.mode = 'full'; this.parts = []; this.fade = 1;
        this.loop();
        const lowered = new Promise(r => setTimeout(r, 450)).then(() => lower ? lower() : null);
        // Под стоп-кадром — аппарат с колесом. Ждём корпус и колесо, но не
        // рычаг (его картинки готовятся до 7 с — для сборки не нужны).
        const built = GreedDebug.rebuild();
        await built;
        await Promise.all([L._mountP, L._wheelP].map(p => Promise.resolve(p).catch(() => {})));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        await lowered;
        this.parts = this.cut();
        this.mode = 'wheel';                             // стоп-кадр — только на месте колеса
        this.t0 = performance.now();
        const end = Math.max(...this.parts.map(p => p.at + p.dur)) + 0.25;
        await new Promise(r => setTimeout(r, end * 1000));
        // всё легло — стоп-кадр гаснет
        const f0 = performance.now();
        await new Promise(r => { const step = () => { this.fade = 1 - (performance.now() - f0) / 250; if (this.fade > 0) requestAnimationFrame(step); else r(); }; step(); });
        this.stop = true; ov.remove(); this.ov = null;
    },

    overlay(host) {
        if (this.ov) this.ov.remove();
        const cv = document.createElement('canvas'), W = host.offsetWidth, H = host.offsetHeight, dpr = Math.min(3, window.devicePixelRatio || 1);
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        // над аппаратом, под банкой (z 6) и под рамкой из монет
        cv.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;z-index:5;pointer-events:none;background:none`;
        host.appendChild(cv);
        this.ov = cv; this.host = host; this.dpr = dpr; this.stop = false;
        return cv;
    },
    // поле аппарата → точки сцены (как у банки: по offset, без трансформов окна)
    scene(x, y) {
        const w = GreedJunkLit.wrapEl, k = w.offsetWidth / GreedJunk.W;
        return [w.offsetLeft + x * k, w.offsetTop + (y - GreedJunk.Y0) * k, k];
    },
    // Все видимые холсты аппарата — в одну картинку, на их местах. Холсты
    // видеокарты снимаются в той же задаче, что отрисованы (без
    // preserveDrawingBuffer буфер иначе уже пуст): корпус и колесо/пачинко
    // перерисовываются здесь же.
    snapshot(host) {
        const L = GreedJunkLit, cv = document.createElement('canvas');
        cv.width = this.ov.width; cv.height = this.ov.height;
        const c = cv.getContext('2d'), hr = host.getBoundingClientRect(), s = hr.width / host.offsetWidth;
        try { if (L.draw) L.draw(L.lightFor({ x: 0, y: 0 })); if (L.wheelDraw && L._wgl) L.wheelDraw(); if (L.pachDraw) L.pachDraw(); } catch (e) { /* что есть */ }
        L.wrapEl.querySelectorAll('canvas').forEach((el) => {
            const st = getComputedStyle(el);
            if (st.display === 'none' || st.visibility === 'hidden' || el === GreedJarShop.cv) return;
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) return;
            c.globalAlpha = +st.opacity || 1;
            try { c.drawImage(el, (r.left - hr.left) / s * this.dpr, (r.top - hr.top) / s * this.dpr, r.width / s * this.dpr, r.height / s * this.dpr); } catch (e) { /* пусто */ }
        });
        c.globalAlpha = 1;
        return cv;
    },

    // ---------- детали с собранного аппарата ----------
    cut() {
        const L = GreedJunkLit, G = GreedJunk, S = L.SCALE, body = L._glCanvas, Sh = G.SHIELD, parts = [];
        L.draw(L.lightFor({ x: 0, y: 0 }));
        // кусок корпуса (поле) → свой холст
        const crop = (x, y, w, h) => {
            const cv = document.createElement('canvas'); cv.width = Math.round(w * S); cv.height = Math.round(h * S);
            cv.getContext('2d').drawImage(body, x * S, (y - G.Y0) * S, w * S, h * S, 0, 0, cv.width, cv.height);
            return cv;
        };
        const bw = Sh.w / Sh.boards, bolts = [];
        for (let i = 0; i < Sh.boards; i++) {
            const x = Sh.x + bw * (i + 0.5);
            [[x - 5, Sh.y + 6], [x + 5, Sh.y + 6], [x - 5, Sh.y + Sh.h - 6], [x + 5, Sh.y + Sh.h - 6]].forEach(p => bolts.push(p));
        }
        // саморезы — кружки со своей тенью
        const br = 3.4, boltCv = bolts.map(([x, y]) => {
            const cv = crop(x - br, y - br, br * 2, br * 2), g = cv.getContext('2d');
            g.globalCompositeOperation = 'destination-in'; g.beginPath(); g.arc(br * S, br * S, (br - 0.4) * S, 0, 7); g.fill();
            return cv;
        });
        // доски — без саморезов: место самореза заклеено той же доской чуть
        // ниже (волокно вертикальное, шва не видно)
        const order = [2, 1, 3, 0, 4];                   // от середины к краям
        order.forEach((i, n) => {
            const x0 = Sh.x + bw * i, cv = crop(x0, Sh.y - 1, bw, Sh.h + 2), g = cv.getContext('2d');
            bolts.forEach(([bx, by]) => {
                if (bx < x0 || bx > x0 + bw) return;
                const lx = (bx - x0) * S, ly = (by - Sh.y + 1) * S, dy = (by < Sh.y + Sh.h / 2 ? 9 : -9) * S;
                g.save(); g.beginPath(); g.arc(lx, ly, br * S, 0, 7); g.clip();
                g.drawImage(cv, 0, dy, cv.width, cv.height, 0, 0, cv.width, cv.height); g.restore();
            });
            parts.push({ kind: 'board', cv, x: x0, y: Sh.y - 1, w: bw, h: Sh.h + 2, at: n * 0.13, dur: 0.42, s0: 2.6, rot0: (n % 2 ? 1 : -1) * 0.35, from: n % 2 ? -1 : 1 });
        });
        boltCv.forEach((cv, i) => {
            const [x, y] = bolts[i];
            parts.push({ kind: 'bolt', cv, x: x - br, y: y - br, w: br * 2, h: br * 2, at: 0.85 + i * 0.035, dur: 0.3, s0: 4.5, spin: 9, from: i % 2 ? -1 : 1 });
        });
        // диск и резинка язычка — со своего холста (видеокарта): отдельно
        const Q = L._wgl, Sp = L._wheelSpr, M = L._wheel, B = L.wheelBox(), W = G.SLOTS.wheel;
        if (Q && Sp && M) {
            const light = L.lightFor(M.lt || { x: 0, y: 0 });
            const grab = (draw) => {
                L.deviceBegin(Q, light); draw();
                const cv = document.createElement('canvas'); cv.width = L.wheelCv.width; cv.height = L.wheelCv.height;
                cv.getContext('2d').drawImage(L.wheelCv, 0, 0); return cv;
            };
            const disc = grab(() => L.deviceDraw(Q, B, Q.disc, W.cx, W.cy, Sp.R, Sp.R, M.rot, 0, 0));
            const Pt = Sp.ptr;
            const ptr = grab(() => { L.deviceDraw(Q, B, Q.brk, Pt.cx, Pt.cy, Pt.hw, Pt.hh, 0, 0, 0); L.deviceDraw(Q, B, Q.ptr, Pt.cx, Pt.cy, Pt.hw, Pt.hh, M.flap, Pt.pivX, Pt.pivY); });
            L.wheelDraw();
            const shadow = L.wheelShadowCv;
            parts.push({ kind: 'disc', cv: disc, x: B.x, y: B.y, w: B.w, h: B.h, at: 1.75, dur: 0.62, s0: 2.3, spin: -2.2, pivot: [W.cx, W.cy], from: 1, shadow });
            parts.push({ kind: 'ptr', cv: ptr, x: B.x, y: B.y, w: B.w, h: B.h, at: 2.45, dur: 0.3, s0: 2, from: -1, pivot: [Pt.cx, Pt.cy] });
        }
        return parts;
    },

    // ---------- кадр ----------
    loop() {
        const step = () => {
            if (this.stop || !this.ov) return;
            this.frame(performance.now());
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    },
    frame(now) {
        const c = this.ov.getContext('2d'), d = this.dpr;
        c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.ov.width, this.ov.height);
        c.globalAlpha = Math.max(0, this.fade);
        if (this.mode === 'full' || !GreedJunkLit.wrapEl) { c.drawImage(this.snap, 0, 0); c.globalAlpha = 1; return; }
        // стоп-кадр — только на месте колеса
        const R = this.REGION, [ax, ay, k] = this.scene(R.x0, R.y0), [bx, by] = this.scene(R.x1, R.y1);
        c.save(); c.beginPath(); c.rect(ax * d, ay * d, (bx - ax) * d, (by - ay) * d); c.clip();
        c.drawImage(this.snap, 0, 0); c.restore();
        const t = (now - this.t0) / 1000, C = this.scene(180, 160);
        const outC = (x) => 1 - Math.pow(1 - x, 3);
        // лёгшие — снизу, летящие — поверх
        const flying = [];
        this.parts.forEach((p) => {
            const u = (t - p.at) / p.dur;
            if (u < 0) return;
            if (u >= 1) this.draw(c, p, 1, t - p.at - p.dur, C, k); else flying.push([p, u]);
            if (u >= 1 && !p.landed) {
                p.landed = true;
                if (typeof Haptics !== 'undefined' && (p.kind !== 'bolt' || p.x % 2 < 1)) {
                    if (p.kind === 'disc' && Haptics.impact) Haptics.impact('heavy'); else Haptics.tick();
                }
            }
        });
        flying.forEach(([p, u]) => this.draw(c, p, outC(u), -1, C, k));
        c.globalAlpha = 1;
    },
    // Деталь на прогрессе e (0 — у камеры, 1 — на месте); after — сколько
    // секунд как легла (−1 — ещё летит): защёлкивание — короткая пружина.
    draw(c, p, e, after, C, k) {
        const d = this.dpr, [tx, ty] = this.scene(p.x, p.y), w = p.w * k, h = p.h * k;
        const pv = p.pivot ? this.scene(p.pivot[0], p.pivot[1]) : [tx + w / 2, ty + h / 2];
        let s = 1, rot = 0, ox = 0, oy = 0;
        if (after < 0) {
            // от камеры вглубь: крупная, со стороны экрана, чуть сверху/снизу
            s = p.s0 + (1 - p.s0) * e;
            ox = (pv[0] - C[0]) * (1 - e) * 1.3; oy = ((pv[1] - C[1]) * 1.3 + p.from * 140) * (1 - e);
            rot = ((p.rot0 || 0) + (p.spin || 0)) * (1 - e);
        } else {
            const sp = Math.exp(-after * 18) * Math.sin(after * 40);
            s = 1 - 0.06 * sp; rot = (p.spin ? 0.05 : 0) * sp;
        }
        c.save();
        c.setTransform(d, 0, 0, d, 0, 0);
        c.translate(pv[0] + ox, pv[1] + oy); c.rotate(rot); c.scale(s, s); c.translate(-pv[0], -pv[1]);
        if (p.shadow && after >= 0) { c.globalAlpha = Math.min(1, after / 0.25) * Math.max(0, this.fade); const r = p.shadow.getBoundingClientRect(), hr = this.host.getBoundingClientRect(), q = hr.width / this.host.offsetWidth;
            c.drawImage(p.shadow, (r.left - hr.left) / q, (r.top - hr.top) / q, r.width / q, r.height / q); c.globalAlpha = Math.max(0, this.fade); }
        c.drawImage(p.cv, tx, ty, w, h);
        c.restore();
    }
};
