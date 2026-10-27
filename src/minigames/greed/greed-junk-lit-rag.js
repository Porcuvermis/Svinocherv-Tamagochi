// ================= АППАРАТ АЛЧНОСТИ: ТРЯПКА БОЛТАЕТСЯ =================
// Продолжение GreedJunkLit. Тряпка с комбинациями (greed-junk-plate.js)
// висит на двух гвоздях и качается: от наклона телефона — вбок, от удара
// рычага — отходит от доски и шлёпается обратно.
//
// Дёшево, как рычаг: тряпка один раз освещается шейдером на прозрачном
// фоне и запоминается картинкой, а в корпусе её нет (GreedJunk.ragApart).
// Дальше каждый кадр — одна картинка на своём холсте с перекосом и
// сжатием по высоте вокруг линии гвоздей; тень — её же силуэт. Растрить
// ткань заново на каждый кадр было бы дорого, а гнётся она здесь целиком.
Object.assign(GreedJunkLit, {
    RAG_CROP: { x: 64, y: 494, w: 232, h: 58 },     // где лежит тряпка
    RAG_VIEW: { x: 54, y: 490, w: 252, h: 72 },     // её холст: с запасом на качание и тень
    // качание: K — жёсткость, C — затухание (на мс); slap — сколько скорости
    // остаётся после шлепка о доску; kick — толчок от удара рычага.
    // Ткань плотная и тяжёлая: отходит градусов на шесть и ложится почти
    // без отскока. Было вдвое мягче — игрок: «слишком болтается».
    RAG_SWING: { K: 0.00012, C: 0.008, Ks: 0.00006, Cs: 0.008, slap: 0.2, kick: 0.0022, maxSway: 0.12, sway: 0.4, lift: 0.008 },

    ragMount(wrap) {
        const V = this.RAG_VIEW, G = GreedJunk, cv = document.createElement('canvas');
        cv.width = V.w * this.SCALE; cv.height = V.h * this.SCALE;
        // фон снят явно — общий style.css красит все canvas (ловушка рычага)
        cv.style.cssText = `position:absolute;left:${V.x / G.W * 100}%;top:${V.y / G.H * 100}%;` +
            `width:${V.w / G.W * 100}%;height:${V.h / G.H * 100}%;z-index:1;pointer-events:none;background:none`;
        wrap.appendChild(cv);
        this.ragCanvas = cv;
        this._rag = { th: 0, tv: 0, ph: 0, pv: 0, last: null, at: 0, shown: '' };
    },

    async prepareRag() {
        if (!this.ragCanvas) return;
        const S = this.SCALE, C = this.RAG_CROP, gl = this.gl;
        try {
            const sized = (svg) => svg.replace('<svg ', `<svg width="${C.w * S}" height="${C.h * S}" `);
            const maps = await Promise.all(['albedo', 'height', 'mat'].map(ps => this.image(sized(GreedJunk.ragSvg(ps, C)))));
            GreedJunk.pass = 'baked';
            this.bindSet(this.tex);
            this.upload(maps, C);
            this.draw(this.lightFor(this._tilt || { x: 0, y: 0 }));
            const c = document.createElement('canvas');
            c.width = C.w * S; c.height = C.h * S;
            c.getContext('2d').drawImage(gl.canvas, C.x * S, C.y * S, C.w * S, C.h * S, 0, 0, C.w * S, C.h * S);
            // тень: силуэт, размытый сдвигами, залитый тёмным
            const sh = document.createElement('canvas');
            sh.width = c.width; sh.height = c.height;
            const g = sh.getContext('2d');
            for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { g.globalAlpha = 0.06; g.drawImage(c, dx * S, dy * S); }
            g.globalAlpha = 1; g.globalCompositeOperation = 'source-in';
            g.fillStyle = PALETTE.greedJunk.hole; g.fillRect(0, 0, sh.width, sh.height);
            // участок в текстурах — обратно корпусом без тряпки
            this.maps.forEach((img, u) => {
                gl.activeTexture(gl.TEXTURE0 + u);
                gl.bindTexture(gl.TEXTURE_2D, this.tex[u]);
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, u === 0);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            });
            this.heightDirty(this.tex[1]);
            this.draw(this.lightFor(this._tilt || { x: 0, y: 0 }));
            this.rag = { sprite: c, shadow: sh };
            this._rag.shown = '';
        } catch (e) { console.warn('[Аппарат] тряпка не собралась', e); }
        GreedJunk.pass = 'baked';
    },

    // удар: тряпка отходит от доски (th — угол от доски к игроку) и чуть вбок
    ragKick(k) {
        const R = this._rag;
        if (!R) return;
        R.tv += this.RAG_SWING.kick * k;
        R.pv += (Math.random() - 0.5) * 0.0008 * k;
    },

    ragStep(now) {
        const R = this._rag, W = this.RAG_SWING;
        if (!R || !this.rag) return;
        const dt = Math.min(40, R.at ? now - R.at : 16);
        R.at = now;
        // вбок — за тяжестью в плоскости экрана; резкий наклон ещё и отрывает
        // тряпку от доски
        const want = Math.max(-W.maxSway, Math.min(W.maxSway, Hang.down() * W.sway));
        if (R.last !== null) R.tv += Math.min(0.0008, Math.abs(want - R.last) * W.lift);
        R.last = want;
        R.pv += (W.Ks * (want - R.ph) - W.Cs * R.pv) * dt;
        R.ph += R.pv * dt;
        R.tv += (-W.K * R.th - W.C * R.tv) * dt;
        R.th += R.tv * dt;
        // сквозь доску не уходит: шлёпается и отскакивает слабее
        if (R.th < 0) { R.th = 0; R.tv = -R.tv * W.slap; }
        const key = R.th.toFixed(3) + ',' + R.ph.toFixed(3);
        if (key !== R.shown) { R.shown = key; this.ragDraw(R.th, R.ph); }
    },

    // th — отход от доски: по высоте тряпка короче (cos), тень отходит дальше,
    // низ чуть темнеет — от гвоздей к низу, ровно. Было: темнела вся тряпка
    // разом, и это читалось как мигание света, а не как движение ткани.
    // ph — перекос вбок от гвоздей
    ragDraw(th, ph) {
        const S = this.SCALE, C = this.RAG_CROP, V = this.RAG_VIEW, cv = this.ragCanvas, ctx = cv.getContext('2d');
        const y0 = GreedJunk.SLOTS.plate.y + 6;           // линия гвоздей
        const t = Math.tan(ph), c = Math.cos(th);
        const at = (dx, dy) => ctx.setTransform(1, 0, t, c,
            S * (C.x - V.x + (C.y - y0) * t + dx), S * (y0 - V.y + (C.y - y0) * c + dy));
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cv.width, cv.height);
        at(0, 0);
        ctx.drawImage(this.rag.sprite, 0, 0);
        if (th > 0.01) {
            ctx.globalCompositeOperation = 'source-atop';
            ctx.globalAlpha = Math.min(0.18, th * 0.8);
            const top = (y0 - C.y) * S, gr = ctx.createLinearGradient(0, top, 0, C.h * S);
            gr.addColorStop(0, 'rgba(0,0,0,0)');
            gr.addColorStop(1, PALETTE.greedJunk.hole);
            ctx.fillStyle = gr;
            ctx.fillRect(0, 0, C.w * S, C.h * S);
        }
        ctx.globalCompositeOperation = 'destination-over';
        ctx.globalAlpha = 0.3;
        at(0.6, 1.4 + Math.sin(th) * 9);
        ctx.drawImage(this.rag.shadow, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }
});
