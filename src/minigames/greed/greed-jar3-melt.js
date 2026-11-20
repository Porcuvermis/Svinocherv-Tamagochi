// ================= БАНКА: ЛИТЬЁ ВЕРСИИ 2 =================
// План 31, разд. 5г, п. 2 (2.1, 2.4). Последний жетон в узел версии 2 —
// банка улетает к месту литья, монеты в ней плавятся в жидкое золото,
// она наклоняется и выливает его на гаражный аппарат (greed-lux-cast.js).
//
// Жидкость — не картинка, а уровень: многоугольник внутренности банки
// (профиль GreedJar3.PROFILE), срезанный горизонталью. При наклоне зеркало
// остаётся горизонтальным в мире, а объём — тем же: уровень подбирается
// делением пополам по площади (в плоском приближении — на глаз не отличить).
// Пока льётся — объём убывает, и уровень сам уходит к горлу и вниз.

// ---------- рисунок: монеты плавятся, жидкость ----------
Object.assign(GreedJar3, {
    // внутренность банки: левый край снизу вверх, правый сверху вниз
    // (местные единицы: x — доли высоты, y вверх — отрицательный)
    interior(inset = 0.014) {
        if (this._int && this._int.inset === inset) return this._int.pts;
        const N = 40, L = [], R = [];
        for (let i = 0; i <= N; i++) { const y = 0.02 + 0.96 * i / N, r = Math.max(0.01, this.r(y) - inset); L.push([-r, -y]); R.push([r, -y]); }
        const pts = L.concat(R.reverse());
        this._int = { inset, pts };
        return pts;
    },
    // срез многоугольника полуплоскостью u·p ≤ c (Сазерленд — Ходжман, одна плоскость)
    clipBelow(pts, u, c) {
        const out = [], h = (p) => u[0] * p[0] + u[1] * p[1] - c;
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length], ha = h(a), hb = h(b);
            if (ha <= 0) out.push(a);
            if ((ha <= 0) !== (hb <= 0)) { const t = ha / (ha - hb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
        }
        return out;
    },
    area(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; },
    // уровень: u — «вверх мира» в осях банки (наклон roll, град), fill — доля
    // начального объёма (куча монет до верха COIN_TOP)
    liquid(fill, roll) {
        const pts = this.interior(), f = roll * Math.PI / 180, u = [Math.sin(f), -Math.cos(f)];
        if (!this._A0) this._A0 = this.area(this.clipBelow(pts, [0, -1], this.COIN_TOP));
        const want = Math.max(0, Math.min(1, fill)) * this._A0;
        const hs = pts.map(p => u[0] * p[0] + u[1] * p[1]);
        let lo = Math.min(...hs), hi = Math.max(...hs);
        for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (this.area(this.clipBelow(pts, u, m)) < want) lo = m; else hi = m; }
        return { u, c: (lo + hi) / 2, poly: this.clipBelow(pts, u, (lo + hi) / 2) };
    },
    // кривая жара — та же, что у канта и литья (тлеющий → янтарь → белый)
    heatColor(h) {
        const K = PALETTE.greedLux.kant, hx = (x) => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16));
        const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t), sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
        let c = mix(hx(K.ember), hx(K.amber), sm(0, 0.55, h));
        c = mix(c, hx(K.hot), sm(0.62, 1, h));
        return `rgb(${c.map(Math.round).join(',')})`;
    },
    // монеты с накалом: картинка кучи, окрашенная жаром (кэш — 8 ступеней)
    meltCoins(G, res, step) {
        const T = this._meltT || (this._meltT = {});
        const key = step + '|' + Math.round(res);
        if (T[key]) return T[key];
        const src = this.coinSprite(G, res), cv = document.createElement('canvas');
        cv.width = src.width; cv.height = src.height;
        // до золотого, не до белого: белая куча читалась снегом (кадр 20.11)
        const g = cv.getContext('2d'), h = step / 7 * 0.72;
        g.drawImage(src, 0, 0);
        g.globalCompositeOperation = 'source-atop';
        g.globalAlpha = 0.2 + 0.65 * h; g.fillStyle = this.heatColor(h); g.fillRect(0, 0, cv.width, cv.height);
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35 * h * h; g.fillRect(0, 0, cv.width, cv.height);
        return (T[key] = cv);
    },
    meltDraw(c, v, G, P) {
        const m = Math.min(1, P.melt), sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
        const C = PALETTE.greedLux.cast;
        c.save(); this.silhouette(c, v, 0.014); c.clip();
        // 1. куча монет накаляется и оседает
        const ca = 1 - sm(0.5, 0.95, m);
        if (ca > 0.01) {
            const B = this.COIN_BOX, cs = this.meltCoins(G, P.coinRes || 700, Math.round(Math.min(1, m / 0.55) * 7)), dy = 0.05 * sm(0.3, 0.9, m);
            c.globalAlpha = ca; c.drawImage(cs, B.x0, B.y0 + dy, B.x1 - B.x0, B.y1 - B.y0); c.globalAlpha = 1;
        }
        // 2. жидкое золото: уровень по объёму, зеркало горизонтально в мире
        const la = sm(0.4, 0.85, m), fill = P.fill == null ? 1 : P.fill;
        if (la > 0.01 && fill > 0.003) {
            const L = this.liquid(fill, P.roll || 0), u = L.u, wob = 0.004 * Math.sin((P.t || 0) / 140);
            const pts = L.poly;
            if (pts.length > 2) {
                // поперёк зеркала: у поверхности — светлое, вглубь — медовое
                const sx = u[0] * L.c, sy = u[1] * L.c;
                const gr = c.createLinearGradient(sx, sy, sx - u[0] * 0.4, sy - u[1] * 0.4);
                gr.addColorStop(0, C.white); gr.addColorStop(0.12, C.molten); gr.addColorStop(1, C.honey);
                c.globalAlpha = la; c.fillStyle = gr;
                c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1] + wob) : c.moveTo(p[0], p[1] + wob)); c.closePath(); c.fill();
                // зеркало — светлая кромка вдоль среза
                const d = [-u[1], u[0]], on = pts.filter(p => Math.abs(u[0] * p[0] + u[1] * p[1] - L.c) < 1e-4);
                if (on.length >= 2) {
                    on.sort((a, b) => (a[0] * d[0] + a[1] * d[1]) - (b[0] * d[0] + b[1] * d[1]));
                    const a = on[0], b = on[on.length - 1];
                    c.lineCap = 'round';
                    c.strokeStyle = C.molten; c.globalAlpha = 0.45 * la; c.lineWidth = 0.03;
                    c.beginPath(); c.moveTo(a[0], a[1] + wob); c.lineTo(b[0], b[1] + wob); c.stroke();
                    c.strokeStyle = C.white; c.globalAlpha = 0.9 * la; c.lineWidth = 0.01;
                    c.beginPath(); c.moveTo(a[0], a[1] + wob); c.lineTo(b[0], b[1] + wob); c.stroke();
                }
                // стекло светится изнутри
                let mx = 0, my = 0; pts.forEach(p => { mx += p[0]; my += p[1]; }); mx /= pts.length; my /= pts.length;
                const gl = c.createRadialGradient(mx, my, 0, mx, my, 0.5);
                gl.addColorStop(0, C.molten); gl.addColorStop(1, 'rgba(255,200,80,0)');
                c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.3 * la * Math.min(1, fill * 3);
                c.fillStyle = gl; c.fillRect(-0.6, -1.1, 1.2, 1.2);
                c.globalCompositeOperation = 'source-over';
            }
        }
        c.globalAlpha = 1;
        c.restore();
    }
});

// ---------- банка-магазин: полёт к литью, наклон, струя ----------
Object.assign(GreedJarShop, {
    // мс от вспышки узла; поза литья — по точке губы (mouth, поле) при
    // полном наклоне: банка над стыком колеса и пачинко, верх — под рамкой
    POUR: { flyAt: 450, fly: 800, meltAt: 600, melt: 750, tiltAt: 1250, tilt: 420, roll: -115, k: 118, view: 0.12,
            lip: [200, 70], streamAt: 1450, head: 110, end: 3300, tail: 150, hit: null },
    // губа банки (кромка горла с нижней стороны) в поле при позе P
    lipAt(P) {
        const th = -P.roll * Math.PI / 180, x = 0.152 * P.k, y = -0.5 * P.k;
        return [P.x + x * Math.cos(th) - y * Math.sin(th), P.y + x * Math.sin(th) + y * Math.cos(th)];
    },
    pourCenter() {
        const Q = this.POUR, th = -Q.roll * Math.PI / 180, x = 0.152 * Q.k, y = -0.5 * Q.k;
        return [Q.lip[0] - (x * Math.cos(th) - y * Math.sin(th)), Q.lip[1] - (x * Math.sin(th) + y * Math.cos(th))];
    },
    pourStart(now) {
        this.holdStop();
        this.state = 'pour'; this.t0 = now; this.dirty = true;
        if (this.cv) this.cv.style.pointerEvents = 'none';
    },
    pourT(now) { return (now - this.t0) / (typeof GreedLux !== 'undefined' && GreedLux.castSlow ? GreedLux.castSlow() : 1); },
    // доля жидкости в банке: льётся от начала струи до конца
    pourFill(t) { const Q = this.POUR; return t < Q.streamAt ? 1 : Math.max(0, 1 - (t - Q.streamAt) / (Q.end - Q.streamAt)); },
    pourPose(now) {
        const Q = this.POUR, N = this.NEAR, t = this.pourT(now), [px, py] = this.pourCenter();
        const inOut = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2, cl = (x) => Math.max(0, Math.min(1, x));
        const P = { x: N.x, y: N.y, k: N.k, roll: 0, yaw: 360, view: N.view, sx: 1, sy: 1, shop: true, rev: 1, coins: false };
        if (t >= Q.flyAt) {
            // полёт: из «в упор» к месту литья с пол-оборота — скотч уходит назад
            const u = inOut(cl((t - Q.flyAt) / Q.fly)), b = Math.sin(u * Math.PI);
            P.x = N.x + (px - N.x) * u; P.y = N.y + (py - N.y) * u - 40 * b;
            P.k = N.k * Math.pow(Q.k / N.k, u); P.view = N.view + (Q.view - N.view) * u;
            P.yaw = 360 - 180 * u; P.shop = false; P.coins = true;
        }
        // наклон с лёгким перехлёстом и возвратом
        if (t >= Q.tiltAt) {
            const u = cl((t - Q.tiltAt) / Q.tilt), e = inOut(u), over = Math.sin(Math.min(1, u * 1.15) * Math.PI) * 0.06 * (1 - u);
            P.roll = Q.roll * (e + over);
        }
        P.melt = cl((t - Q.meltAt) / Q.melt);
        P.fill = this.pourFill(t);
        P.t = t;
        return P;
    },
    // Струя: от губы к месту удара (литьё, CAST.xi/yi) — парабола (по
    // горизонтали равномерно, по вертикали с ускорением), к низу тоньше;
    // голова сходит за head мс, хвост отрывается после end. Слои: медовая
    // оболочка → расплав → белая сердцевина → бегущие вниз струйки; в
    // месте удара — пятно и брызги.
    streamDraw(c, P, now) {
        const Q = this.POUR, t = P.t, C = PALETTE.greedLux.cast;
        if (t < Q.streamAt || t > Q.end + Q.tail) return;
        const Lx = typeof GreedLux !== 'undefined' ? GreedLux.CAST : { xi: 205, yi: 50 };
        const [mx, my] = this.toScene(...this.lipAt(P)), [ix, iy] = this.toScene(Lx.xi, Lx.yi), k = this.map.k;
        const s1 = Math.min(1, (t - Q.streamAt) / Q.head), s0 = t > Q.end ? Math.min(1, (t - Q.end) / Q.tail) : 0;
        if (s1 <= s0) return;
        const pt = (s) => [mx + (ix - mx) * s + 0.7 * k * Math.sin(s * 9 - t / 60) * s, my + (iy - my) * s * s];
        const N = 24, Ls = [], Rs = [];
        for (let i = 0; i <= N; i++) {
            const s = s0 + (s1 - s0) * i / N, [x, y] = pt(s), [x2, y2] = pt(Math.min(1, s + 0.02)), [x0, y0] = pt(Math.max(0, s - 0.02));
            let nx = -(y2 - y0), ny = x2 - x0; const ln = Math.hypot(nx, ny) || 1; nx /= ln; ny /= ln;
            const w = (2.6 - 0.85 * s) * k;
            Ls.push([x + nx * w, y + ny * w]); Rs.push([x - nx * w, y - ny * w]);
        }
        c.save();
        c.beginPath(); Ls.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); Rs.reverse().forEach(p => c.lineTo(p[0], p[1])); c.closePath();
        c.fillStyle = C.honey; c.fill();
        const path = () => { c.beginPath(); for (let i = 0; i <= N; i++) { const [x, y] = pt(s0 + (s1 - s0) * i / N); if (i) c.lineTo(x, y); else c.moveTo(x, y); } };
        c.lineCap = 'round';
        path(); c.strokeStyle = C.molten; c.lineWidth = 2.6 * k; c.stroke();
        path(); c.strokeStyle = C.white; c.lineWidth = 0.9 * k; c.globalAlpha = 0.9; c.stroke();
        path(); c.setLineDash([3 * k, 5 * k]); c.lineDashOffset = -t * 0.12 * k; c.strokeStyle = C.white; c.lineWidth = 0.6 * k; c.globalAlpha = 0.5; c.stroke();
        c.setLineDash([]);
        // удар: пятно и брызги — пока струя достаёт до места
        if (s1 >= 1) {
            const g = c.createRadialGradient(ix, iy, 0, ix, iy, 14 * k);
            g.addColorStop(0, C.white); g.addColorStop(0.25, C.molten); g.addColorStop(1, 'rgba(255,190,60,0)');
            c.globalAlpha = 0.85; c.fillStyle = g; c.beginPath(); c.arc(ix, iy, 14 * k, 0, 7); c.fill();
            c.fillStyle = C.molten;
            for (let i = 0; i < 9; i++) {
                const ph = ((t / 320) + i / 9) % 1, sx = Math.sin(i * 12.9898) * 0.9, vy = 0.6 + 0.4 * Math.abs(Math.sin(i * 78.233));
                const x = ix + sx * 22 * k * ph, y = iy - vy * 26 * k * ph + 40 * k * ph * ph;
                c.globalAlpha = 1 - ph; c.beginPath(); c.arc(x, y, (1.3 - 0.6 * ph) * k, 0, 7); c.fill();
            }
        }
        c.restore();
    }
});

// поза литья — своей веткой, остальное — как было
(function () {
    const pose = GreedJarShop.pose;
    GreedJarShop.pose = function (now) { return this.state === 'pour' ? this.pourPose(now) : pose.call(this, now); };
})();
