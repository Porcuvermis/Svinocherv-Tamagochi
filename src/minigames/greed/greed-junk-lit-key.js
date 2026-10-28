// ================= АППАРАТ АЛЧНОСТИ: КАРТА СВЕТА =================
// Продолжение GreedJunkLit. Свет как режиссёр (docs/plan/30-greed-light.md):
// сцена в полутьме гаража, игровые места светятся сами или стоят под
// прожектором. Было — шейдеры нормировали свет так, что ровная поверхность
// показывала ровно свой цвет, и ярче всего на аппарате было то, что светлее
// покрашено (пустая колба, стикер, сосна), а барабаны и рычаг терялись.
//
// Карта — маленькая текстура на всё поле (тексел — CELL единиц), считается
// один раз при сборке: R — ключ (во сколько раз светлее краски: R × KMAX),
// G — тёплый свет (лампы барабанов, прожектор рычага), B — холодный
// (подсветка поля пачинко). Шейдеры корпуса и прибора читают её одним
// отсчётом и умножают освещённость: тень и блик остаются как были. Плёнка
// с дырками поверх аппарата отвергнута: гасит блики и края самих игр, а
// режим наложения на iOS дорогой.
Object.assign(GreedJunkLit, {

    KEY: {
        CELL: 3,
        KMAX: 2,
        base: 0.58,                        // корпус: полутень гаража
        warm: [1.0, 0.72, 0.38],           // лампы накаливания
        cool: [0.62, 0.82, 1.0],           // трубка дневного света
        // три лампочки в коробе барабанов: середина окна, спад к краям
        reel: { k: 0.15, warm: 0.95, rx: 0.75, ry: 0.62 },
        // колесо под лампой: диск светлее досок за ним
        wheel: { k: 0.55, inner: 0.8, outer: 1.0 },
        // поле пачинко светится за стеклом
        pach: { k: 0.12, cool: 0.32, feather: 5 },
        // прожектор на рычаг снаружи: тёплое пятно на шар и кулису
        lever: { x: 316, y: 316, rx: 32, ry: 50, k: 0.7, warm: 0.95 },
        // кнопка пачинко — своё пятно
        button: { r: 15, k: 0.7, warm: 0.2 },
        // слои поверх корпуса (свои холсты): ряд 2 — результат. Жидкость
        // колбы и летящая монета — без фильтра: светится только столбик.
        overlay: { tray: 0.82, jar: 0.9 }
    },

    // Ключ, тёплый и холодный свет в точке поля.
    keyAt(x, y) {
        const K = this.KEY, G = GreedJunk;
        const ss = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
        let k = K.base, w = 0, c = 0;
        // барабаны: эллипс на окно, как лампочка за лентой
        G.SLOTS.reels.forEach(r => {
            const dx = (x - (r.x + r.w / 2)) / (r.w / 2 + 4), dy = (y - (r.y + r.h / 2)) / (r.h / 2 + 4);
            const d = Math.hypot(dx * K.reel.rx, dy * K.reel.ry);
            const s = ss(1.15 - d * 1.15);
            k += K.reel.k * s; w += K.reel.warm * s;
        });
        const W = G.SLOTS.wheel, dw = Math.hypot(x - W.cx, y - W.cy) / W.r;
        k += K.wheel.k * ss((K.wheel.outer - dw) / (K.wheel.outer - K.wheel.inner));
        if (G.pachinkoShown && G.pachinkoShown()) {
            const R = G.pachGlassRect(), [x0, y0] = G.pachPt(R.x0, R.y0), [x1, y1] = G.pachPt(R.x1, R.y1);
            const f = K.pach.feather, e = Math.min(x - x0, x1 - x, y - y0, y1 - y);
            const s = ss(e / f + 0.5);
            k += K.pach.k * s; c += K.pach.cool * s;
            const B = G.PACH.button, [bx, by] = G.pachPt(B.x, B.y);
            const sb = ss(1 - Math.hypot(x - bx, y - by) / K.button.r);
            k += K.button.k * sb; w += K.button.warm * sb;
        }
        const Lv = K.lever, sl = ss(1 - Math.hypot((x - Lv.x) / Lv.rx, (y - Lv.y) / Lv.ry));
        k += Lv.k * sl; w += Lv.warm * sl;
        return [k, w, c];
    },

    // Карта в холст: поле W×H (от Y0), тексел — CELL единиц.
    keyCanvas() {
        if (this._keyCv) return this._keyCv;
        const G = GreedJunk, K = this.KEY, cw = Math.ceil(G.W / K.CELL), ch = Math.ceil(G.H / K.CELL);
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
        const g = cv.getContext('2d'), im = g.createImageData(cw, ch), b = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
        for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
            const [k, w, c] = this.keyAt((i + 0.5) * K.CELL, G.Y0 + (j + 0.5) * K.CELL), o = (j * cw + i) * 4;
            im.data[o] = b(k / K.KMAX); im.data[o + 1] = b(w); im.data[o + 2] = b(c); im.data[o + 3] = 255;
        }
        g.putImageData(im, 0, 0);
        return (this._keyCv = cv);
    },

    // Карта в текстуру unit, плюс общие числа шейдеру p (uKey, uKMax, uWarm, uCool).
    keyBind(gl, p, unit) {
        const t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.keyCanvas());
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const K = this.KEY;
        gl.useProgram(p);
        gl.uniform1i(gl.getUniformLocation(p, 'uKey'), unit);
        gl.uniform1f(gl.getUniformLocation(p, 'uKMax'), K.KMAX);
        gl.uniform3f(gl.getUniformLocation(p, 'uWarm'), ...K.warm);
        gl.uniform3f(gl.getUniformLocation(p, 'uCool'), ...K.cool);
        // Активным оставить unit 0: следующая createTexture + bindTexture
        // (deviceSet) иначе села бы в unit карты и подменила её — колесо и
        // пачинко выходили чёрными.
        gl.activeTexture(gl.TEXTURE0);
        return t;
    },

    // Прибор: где на поле лежит его холст (rect в единицах поля), чтобы
    // точка холста нашла себя на карте света.
    deviceKey(Q, rect) {
        const G = GreedJunk;
        Q.lm = [rect.x / G.W, (rect.y - G.Y0) / G.H, rect.w / G.W, rect.h / G.H];
        this.keyBind(Q.gl, Q.pr, 4);
        Q.gl.uniform4f(Q.U.uLmR, ...Q.lm);
    },

    // Слой поверх корпуса своим холстом (лоток, банка): шейдером карты он не читает — та же полутень
    // фильтром яркости, один раз. Своя доля из KEY.overlay: это ряд 2.
    keyOverlay(el, kind) {
        if (el) el.style.filter = `brightness(${this.KEY.overlay[kind]})`;
    }
});
