// ================= АППАРАТ АЛЧНОСТИ: ПАЧИНКО НА СВЕТУ =================
// Продолжение GreedJunkLit. Короб пачинко (рисунок — greed-junk-pachinko.js)
// — освещённый прибор своим холстом (greed-junk-lit-device.js): короб выше
// аппарата и торчит над рамкой, за поле корпуса, — в корпус он не влез бы.
// Три холста снизу вверх: мягкая тень короба на аппарат (уходит от света
// переносом холста, как у колеса), сам короб на свету шейдером (только
// когда сдвинулся свет), стекло — готовым видом, один раз.
//
// Колесо монтируется после — его холсты поверх: колесо на переднем плане и
// заходит на левую стенку короба.
Object.assign(GreedJunkLit, {
    // Сколько короб выше поля аппарата (y0 < 0) плюс запас: на столько
    // аппарат опускается в окне (fit), чтобы короб не ушёл под рамку окна.
    PACH_TOP: 40,
    // тень: короб стоит в рельсах на gap от стенки, полутень — blur
    PACH_SHADOW: { gap: 9, max: 14, blur: 3, a: 0.4 },

    pachBox(pad = 0) {
        const P = GreedJunk.PACH;
        return { x: P.x0 - 2 - pad, y: P.y0 - 2 - pad, w: P.x1 - P.x0 + 4 + pad * 2, h: P.y1 - P.y0 + 4 + pad * 2 };
    },

    pachMountLit(wrap) {
        if (!GreedJunk.pachinkoShown || !GreedJunk.pachinkoShown()) return;
        const G = GreedJunk, S = this.SCALE;
        const layer = (B) => {
            const cv = document.createElement('canvas');
            cv.width = Math.round(B.w * S); cv.height = Math.round(B.h * S);
            cv.style.cssText = `position:absolute;left:${B.x / G.W * 100}%;top:${B.y / G.H * 100}%;` +
                `width:${B.w / G.W * 100}%;height:${B.h / G.H * 100}%;z-index:1;pointer-events:none;background:none`;
            wrap.appendChild(cv);
            return cv;
        };
        this.pachShadowCv = layer(this.pachBox(this.PACH_SHADOW.blur * 3));
        this.pachCv = layer(this.pachBox());
        // шарик — между коробом и стеклом: стекло поверх него
        this.pachBallCv = layer(this.pachBox());
        this.pachGlassCv = layer(this.pachBox());
        this._pach = { shown: null, ball: null, acc: 0, at: 0, press: 0 };
        this.pachSprites();
        // кнопка запуска — тап по ней
        wrap.addEventListener('pointerdown', (e) => {
            const r = wrap.getBoundingClientRect(), B = G.PACH.button;
            const x = (e.clientX - r.left) / r.width * G.W, y = (e.clientY - r.top) / r.height * G.H;
            if (Math.hypot(x - B.x, y - B.y) > B.r + 4) return;
            e.preventDefault(); e.stopPropagation();
            this.pachLaunch();
        });
    },

    // Кнопка: шарик ложится на пружину и тут же вылетает. Сила — разброс
    // пружины (PACH_PHYS.v0). Пока шарик летит, кнопка не работает.
    // onPach (шаг «исход») подберёт запуск под решённую лунку; пока — как
    // пружина бросит.
    pachLaunch() {
        const M = this._pach, K = GreedJunk.PACH_PHYS;
        if (!M || !this._pgl) return;
        M.press = performance.now();
        if (M.ball) { if (typeof Haptics !== 'undefined') Haptics.tick(); return; }
        const v0 = this.onPach ? this.onPach() : K.v0[0] + Math.random() * (K.v0[1] - K.v0[0]);
        if (v0 === false) { if (typeof Haptics !== 'undefined') Haptics.notify('error', true); return; }
        M.ball = GreedJunk.pachBall(v0);
        M.acc = 0; M.at = 0;
        if (typeof Haptics !== 'undefined') Haptics.impact('rigid', true);
    },

    // Шарик: стальной, блик сверху-слева — один раз картинкой.
    pachBallSprite() {
        if (this._pachSpr) return this._pachSpr;
        const S = this.SCALE * 2, r = GreedJunk.PACH_PHYS.r, J = PALETTE.greedJunk, n = Math.ceil((r + 1) * 2 * S);
        const cv = document.createElement('canvas'); cv.width = cv.height = n;
        const g = cv.getContext('2d'), c = n / 2;
        const gr = g.createRadialGradient(c - r * 0.4 * S, c - r * 0.45 * S, r * 0.1 * S, c, c, r * S);
        gr.addColorStop(0, J.tin[100]); gr.addColorStop(0.45, J.tin[300]); gr.addColorStop(1, J.tin[700]);
        g.beginPath(); g.arc(c, c, r * S, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
        g.lineWidth = 0.5 * S; g.strokeStyle = PALETTE.ink; g.stroke();
        // отражение: светлая полоса снизу (пол) и точка блика
        g.globalAlpha = 0.5; g.fillStyle = J.tin[100];
        g.beginPath(); g.ellipse(c + r * 0.15 * S, c + r * 0.55 * S, r * 0.5 * S, r * 0.18 * S, 0, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1; g.fillStyle = J.reel.jar.glassHi;
        g.beginPath(); g.arc(c - r * 0.38 * S, c - r * 0.4 * S, r * 0.22 * S, 0, Math.PI * 2); g.fill();
        return (this._pachSpr = cv);
    },

    // Полёт: физика фиксированным шагом (на любом кадре путь один), удар о
    // гвоздь — щелчок в палец, лунка — удар, сток — мягкий. Холст шарика
    // рисуется только пока шарик летит или кнопка нажата.
    pachBallStep(now) {
        const M = this._pach, G = GreedJunk, K = G.PACH_PHYS;
        const dt = Math.min(0.05, M.at ? (now - M.at) / 1000 : 1 / 60);
        M.at = now;
        const pressed = now - M.press < 140;
        if (!M.ball && !pressed && !M.dirty) return;
        if (M.ball) {
            M.acc += dt;
            while (M.acc >= K.STEP && M.ball) {
                M.acc -= K.STEP;
                const ev = G.pachStepBall(M.ball);
                if (ev === 'nail' && typeof Haptics !== 'undefined') Haptics.tick();
                if (M.ball.done) {
                    const res = M.ball.done;
                    if (typeof Haptics !== 'undefined') Haptics.impact(res === 'drain' ? 'soft' : 'medium', true);
                    M.ball = null;
                    if (this.onPachDone) this.onPachDone(res);
                }
            }
        }
        const S = this.SCALE, B = this.pachBox(), c = this.pachBallCv.getContext('2d');
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, this.pachBallCv.width, this.pachBallCv.height);
        c.setTransform(S, 0, 0, S, -B.x * S, -B.y * S);
        if (pressed) {
            // кнопка вдавлена: колпак темнеет
            const Bt = G.PACH.button;
            c.globalAlpha = 0.3; c.fillStyle = PALETTE.greedJunk.hole;
            c.beginPath(); c.arc(Bt.x, Bt.y, Bt.r, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
        }
        if (M.ball) {
            const b = M.ball, r = K.r, spr = this.pachBallSprite(), L = this.lightFor(this._tilt || { x: 0, y: 0 });
            // тень шарика на поле: от света, шарик над краской на свой радиус
            c.globalAlpha = 0.35; c.fillStyle = PALETTE.greedJunk.hole;
            c.beginPath(); c.arc(b.x - L[0] / L[2] * r, b.y - L[1] / L[2] * r, r * 0.95, 0, Math.PI * 2); c.fill();
            c.globalAlpha = 1;
            c.drawImage(spr, b.x - r - 1, b.y - r - 1, (r + 1) * 2, (r + 1) * 2);
        }
        M.dirty = !!M.ball || pressed;
    },

    // Карты короба — один раз. Высоты в своей карте (важна разница):
    // поле на 2, стенки ящика на 12 — поле утоплено, стенки кладут на него
    // тень; лунки торчат на 4, гвозди — на nailUp, кнопка — над стенкой.
    async pachSprites() {
        const G = GreedJunk, S = this.SCALE, B = this.pachBox(), P = G.PACH;
        try {
            const svg = (pass, inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(B.w * S)}" height="${Math.round(B.h * S)}" ` +
                `viewBox="${B.x} ${B.y} ${B.w} ${B.h}">` + G.passStyle(pass) + G.defs() + inner + '</svg>';
            const box = (pass) => {
                G.pass = pass;
                const p = G.pachParts();
                return svg(pass, G.T(12, 'lacquer', p.frame) + G.T(2, 'paint', p.field) + G.T(2, 'raw', p.drain) +
                    G.T(6.5, 'steel', p.steel) + G.T(6, 'paint', p.cups) + G.T(2 + P.nailUp, 'steel', p.nails) +
                    G.T(13, 'steel', p.corners) + G.T(13, 'plastic', p.button));
            };
            const maps = await Promise.all(['albedo', 'height', 'mat'].map(ps => this.image(box(ps))));
            G.pass = 'baked';
            const glass = await this.image(svg('baked', G.pachGlass()));
            G.pass = 'baked';
            const Q = this.deviceGL(this.pachCv);
            if (!Q) throw new Error('нет WebGL');
            Q.box = this.deviceSet(Q, maps);
            this._pgl = Q;
            const g = this.pachGlassCv.getContext('2d');
            g.drawImage(glass, 0, 0, this.pachGlassCv.width, this.pachGlassCv.height);
            this.pachShadow();
            this._pach.shown = null;
        } catch (e) {
            G.pass = 'baked';
            // видно в 🐞 на кнопке «Пачинко»: на iPhone консоли нет
            this.pachError = String((e && e.message) || e || 'картинка').slice(0, 40);
            console.warn('[Аппарат] пачинко не собралось', e);
        }
    },

    // Тень короба на аппарат: мягкий прямоугольник ровно под ним, один раз;
    // куда ляжет — pachShadowAt (как у колеса).
    pachShadow() {
        const B = this.pachBox(this.PACH_SHADOW.blur * 3), S = this.SCALE, P = GreedJunk.PACH, K = this.PACH_SHADOW;
        const c = this.pachShadowCv.getContext('2d');
        c.setTransform(S, 0, 0, S, -B.x * S, -B.y * S);
        c.filter = 'blur(' + (K.blur * S) + 'px)';
        c.globalAlpha = K.a; c.fillStyle = PALETTE.greedJunk.hole;
        c.fillRect(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0);
        c.filter = 'none'; c.globalAlpha = 1;
        this.pachShadowAt(this.lightFor(this._tilt || { x: 0, y: 0 }));
    },
    pachShadowAt(L) {
        const cv = this.pachShadowCv, K = this.PACH_SHADOW, B = this.pachBox(K.blur * 3);
        if (!cv) return;
        let dx = -L[0] / L[2] * K.gap, dy = -L[1] / L[2] * K.gap;
        const d = Math.hypot(dx, dy);
        if (d > K.max) { dx *= K.max / d; dy *= K.max / d; }
        cv.style.transform = `translate(${(dx / B.w * 100).toFixed(2)}%, ${(dy / B.h * 100).toFixed(2)}%)`;
    },

    // Кадр: короб перерисовывается только когда сдвинулся свет (наклон с
    // мёртвой зоной — _tilt корпуса) и не чаще LIGHT_MS.
    pachStep(now) {
        const M = this._pach;
        if (!M || !this._pgl) return;
        this.pachBallStep(now);
        const t = this._tilt || { x: 0, y: 0 };
        if (M.shown && M.lt && M.lt.x === t.x && M.lt.y === t.y) return;
        if (M.shown && now - (M.at || 0) < this.LIGHT_MS) return;
        M.lt = { x: t.x, y: t.y }; M.at = now; M.shown = true;
        const L = this.lightFor(M.lt), Q = this._pgl, B = this.pachBox();
        this.deviceBegin(Q, L);
        this.deviceDraw(Q, B, Q.box, B.x + B.w / 2, B.y + B.h / 2, B.w / 2, B.h / 2);
        this.pachShadowAt(L);
    }
});
