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
        this.pachGlassCv = layer(this.pachBox());
        this._pach = { shown: null };
        this.pachSprites();
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
