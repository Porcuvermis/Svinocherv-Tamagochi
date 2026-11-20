// ================= АППАРАТ АЛЧНОСТИ, ВЕРСИЯ 2: ЛИТЬЁ =================
// Переход из гаражного в версию 2 (план 31, разд. 5г, п. 2): банка выливает
// расплавленное золото на гаражный аппарат, и где течёт золото — из-под него
// проступает литой корпус, раскалённый, и остывает.
//
// Всё держится на одной формуле — когда фронт расплава проходит точку поля:
// castPass(x, y). Её же считает шейдер (CAST_GLSL): вырез гаражного, тело
// расплава, жар литого — и JS: искры, щелчки поясов, включение экранов,
// посадка банки. Одна формула — значит, всё, что видно, сходится само.
//
// Фронт: струя падает в точку (xi, yi) у верхнего края видимой зоны;
// золото растекается в стороны (vh) и вверх (vu, под рамку), вниз течёт
// медленнее (v) — неровным краем (wob) и с подтёками по пазам версии 2
// (drips): металл в канале бежит вперёд, будто форма уже лежит под гаражным.
// Монотонно по y — подтёк растёт не быстрее, чем сходит фронт (lead' < 1).
Object.assign(GreedLux, {
    CAST: {
        xi: 205, yi: 6,                    // место удара струи (стык колеса и пачинко)
        vh: 0.9, vu: 0.45, v: 0.3,         // ед./мс: в стороны, вверх, вниз
        // подтёки: x паза, где паз начинается и кончается по y, на сколько
        // убегает вперёд (ед.). Пазы версии 2: бока поля пачинко, обод
        // колбы, бока рамки экрана, паз рычага.
        drips: [[208, -53, 273, 30], [334, -53, 273, 26], [37, 312, 604, 40], [71, 312, 604, 34],
                [89, 313, 465, 42], [291, 313, 465, 38], [303, 300, 404, 30], [325, 300, 404, 28]],
        dripW: 6.5,
        // остывание (мс): лак, золото; стекло почти не греется
        tau: { lac: 450, gold: 1000 }
    },

    // волна края, ед. (+ — фронт впереди)
    castWob(x) { return 4 * Math.sin(x / 23 + 1.3) + 2.5 * Math.sin(x / 9.7 + 0.4) + 1.5 * Math.sin(x / 4.1 + 2.1); },
    castDrip(x, y) {
        const C = this.CAST, sm = (e0, e1, v) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
        let d = 0;
        for (const [dx, y0, y1, lead] of C.drips) {
            // голова подтёка — скруглённая капля, а не остриё (гаусс давал сосульки)
            const q = 1 - Math.pow((x - dx) / C.dripW, 2);
            if (q <= 0) continue;
            const g = Math.pow(q, 0.35);
            d += lead * g * sm(y0, y0 + 80, y) * (1 - sm(y1, y1 + 60, y));
        }
        return d;
    },
    // мс от начала литья (от удара струи), когда фронт проходит (x, y)
    castPass(x, y) {
        const C = this.CAST;
        return Math.abs(x - C.xi) / C.vh + Math.max(0, y - C.yi) / C.v + Math.max(0, C.yi - y) / C.vu
            - (this.castWob(x) + this.castDrip(x, y)) / C.v;
    },
    // то же для шейдера: uniform'ы uCP (xi, yi), uCV (vh, vu, v, dripW), uDr[8]
    castGLSL() {
        return `
            uniform vec2 uCP; uniform vec4 uCV; uniform vec4 uDr[8];
            float castSm(float e0, float e1, float v){ return smoothstep(e0, e1, v); }
            float castWob(float x){ return 4.0 * sin(x / 23.0 + 1.3) + 2.5 * sin(x / 9.7 + 0.4) + 1.5 * sin(x / 4.1 + 2.1); }
            float castPass(float x, float y){
                float d = 0.0;
                for (int i = 0; i < 8; i++) {
                    vec4 D = uDr[i];
                    float g = pow(max(0.0, 1.0 - pow((x - D.x) / uCV.w, 2.0)), 0.35);
                    d += D.w * g * castSm(D.y, D.y + 80.0, y) * (1.0 - castSm(D.z, D.z + 60.0, y));
                }
                return abs(x - uCP.x) / uCV.x + max(0.0, y - uCP.y) / uCV.z + max(0.0, uCP.y - y) / uCV.y
                    - (castWob(x) + d) / uCV.z;
            }
            // насколько точка в подтёке (0..1): там расплава больше — полоса толще
            float castDripG(float x){
                float g = 0.0;
                for (int i = 0; i < 8; i++) g = max(g, pow(max(0.0, 1.0 - pow((x - uDr[i].x) / uCV.w, 2.0)), 0.35));
                return g;
            }`;
    },
    castUniforms(gl, U) {
        const C = this.CAST, D = new Float32Array(32);
        C.drips.forEach((d, i) => D.set(d.length === 4 ? [d[0], d[1], d[2], d[3]] : d, i * 4));
        gl.uniform2f(U('uCP'), C.xi, C.yi);
        gl.uniform4f(U('uCV'), C.vh, C.vu, C.v, C.dripW);
        gl.uniform4fv(U('uDr'), D);
    },

    // ---------- жар литого (программа в холсте канта) ----------
    // Накал H = exp(−(t − tPass)/τ): лак вспыхивает раскалённым красным и
    // быстро чернеет, золото тлеет дольше, на скатах ярче (как у канта),
    // стекло экранов — тёмное (экраны в жару выключены). Цвет — кривая канта:
    // у аппарата один «жар».
    castHeatInit() {
        const K = this._kgl;
        if (!K) return Promise.resolve(false);
        if (this._castH) return Promise.resolve(true);
        if (this._castHP) return this._castHP;
        const DIR = this.dir(), img = (n) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = DIR + n + '.png'; });
        this._castHP = Promise.all([img('mat'), img('height'), img('shade')]).then(([m, h, sd]) => {
            if (this._kgl !== K) return false;
            const gl = K.gl;
            const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn('[литьё]', gl.getShaderInfoLog(s)); return s; };
            const p = gl.createProgram();
            gl.attachShader(p, sh(gl.VERTEX_SHADER, 'attribute vec2 a; varying vec2 v; void main(){ v = vec2(a.x * 0.5 + 0.5, 0.5 - a.y * 0.5); gl_Position = vec4(a, 0.0, 1.0); }'));
            gl.attachShader(p, sh(gl.FRAGMENT_SHADER, `
                #ifdef GL_FRAGMENT_PRECISION_HIGH
                precision highp float;
                #else
                precision mediump float;
                #endif
                uniform sampler2D uM, uH, uSh; uniform vec2 uWH, uPx; uniform float uY0, uT, uTauL, uTauG;
                uniform vec3 uC0, uC1, uC2; varying vec2 v;
                ${this.castGLSL()}
                float hgt(vec2 q){ vec3 c = texture2D(uH, q).rgb; return (c.r * 65280.0 + c.g * 255.0) / 65535.0 * 64.0; }
                void main(){
                    vec2 P = vec2(v.x * uWH.x, v.y * uWH.y + uY0);
                    float dt = uT - castPass(P.x, P.y);
                    if (dt < 0.0) { gl_FragColor = vec4(0.0); return; }
                    vec3 m = texture2D(uM, v).rgb;
                    float gold = step(0.5, m.b), glass = step(0.5, m.g);
                    float tau = mix(uTauL, uTauG, gold);
                    float H = exp(-dt / tau);
                    if (H < 0.004) { gl_FragColor = vec4(0.0); return; }
                    // скат: разница высот соседей (шаг — текселе карты)
                    float gx = hgt(v + vec2(uPx.x, 0.0)) - hgt(v - vec2(uPx.x, 0.0));
                    float gy = hgt(v + vec2(0.0, uPx.y)) - hgt(v - vec2(0.0, uPx.y));
                    float slope = clamp(length(vec2(gx, gy)) * 0.35, 0.0, 1.0);
                    float sd = texture2D(uSh, v).r;
                    // Белый — только у самого расплава (холст литья): за фронтом лак
                    // сразу раскалённо-красный, как железо, золото — янтарное.
                    // Было: кривая до белого — на кадре за фронтом шла молочная
                    // пелена в треть аппарата.
                    float Hc = H * mix(0.62, 0.9, gold);
                    vec3 col = mix(uC0, uC1, smoothstep(0.0, 0.55, Hc));
                    col = mix(col, uC2, smoothstep(0.7, 1.0, Hc));
                    float k = mix(0.8, 1.2 + 1.6 * slope, gold) * mix(1.0, 0.12, glass) * (0.55 + 0.45 * sd);
                    vec3 c = min(col * H * k, vec3(1.0));
                    gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
                }`));
            gl.linkProgram(p);
            if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('[литьё]', gl.getProgramInfoLog(p)); return false; }
            gl.useProgram(p);
            const tex = (im, unit, filt) => {
                const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                return t;
            };
            const texs = [tex(m, 2, gl.NEAREST), tex(h, 3, gl.NEAREST), tex(sd, 4, gl.LINEAR)];
            gl.activeTexture(gl.TEXTURE0);
            const U = (n) => gl.getUniformLocation(p, n), P = PALETTE.greedLux.kant, vec = (x) => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16) / 255);
            gl.uniform1i(U('uM'), 2); gl.uniform1i(U('uH'), 3); gl.uniform1i(U('uSh'), 4);
            const FW = this.cv.width / this.K, FH = this.cv.height / this.K;
            gl.uniform2f(U('uWH'), FW, FH); gl.uniform1f(U('uY0'), this.Y0);
            gl.uniform2f(U('uPx'), 1 / m.width, 1 / m.height);
            gl.uniform1f(U('uTauL'), this.CAST.tau.lac); gl.uniform1f(U('uTauG'), this.CAST.tau.gold);
            gl.uniform3fv(U('uC0'), vec(P.ember)); gl.uniform3fv(U('uC1'), vec(P.amber)); gl.uniform3fv(U('uC2'), vec(P.hot));
            this.castUniforms(gl, U);
            const loc = gl.getAttribLocation(p, 'a');
            gl.useProgram(K.p);
            this._castH = { p, loc, uT: U('uT'), texs };
            return true;
        }).catch(e => { console.warn('[литьё]', e); return false; });
        return this._castHP;
    },
    castHeatDraw(gl, now) {
        const H = this._castH, K = this._kgl;
        gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
        gl.useProgram(H.p); gl.bindBuffer(gl.ARRAY_BUFFER, K.buf);
        gl.enableVertexAttribArray(H.loc); gl.vertexAttribPointer(H.loc, 2, gl.FLOAT, false, 0, 0);
        gl.uniform1f(H.uT, this.castT(now));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    // мс литья (от удара струи); отладка — замедление 'gj-cast-slow'
    castT(now) {
        const c = this._cast;
        if (!c) return -1;
        if (c.t != null) return c.t;                   // стоп-кадр (отладка, кадры)
        let slow = 1;
        try { slow = +localStorage.getItem('gj-cast-slow') || 1; } catch (e) { /* нет хранилища */ }
        return (now - c.t0) / slow;
    }
});

// ---------- холст литья: гаражный под расплавом ----------
// Стоп-кадр гаражного (все его холсты, без банки) — текстура; шейдер на всё
// поле: впереди фронта — гаражный, обугленный и дрожащий от жара; на фронте
// — тёмная корочка и яркая кайма мениска; за ней — тело расплава (течёт
// вниз узором); дальше — прозрачно: под холстом уже литой корпус и его жар.
// Обычное наложение (не сложение): расплав и гаражный — непрозрачные.
Object.assign(GreedLux, {
    CAST_BAND: { molten: 13, fade: 4, scorch: 20, shimmer: 12, crust: 1.4 },

    // гаражный — картинкой поля плотности S (у обеих версий поле одно: 360×696, Y0 −57)
    castSnapshot() {
        const L = typeof GreedJunkLit !== 'undefined' ? GreedJunkLit : null, W = L && L.wrapEl;
        if (!W) return null;
        // корпус — с preserveDrawingBuffer; приборы колеса и короба — нет:
        // перерисовать в той же задаче, что снимок (как у сборки)
        try { if (L.wheelDraw && L._wgl) L.wheelDraw(); if (L.pachDraw) L.pachDraw(); } catch (e) { /* что есть */ }
        const r = W.getBoundingClientRect(), cv = document.createElement('canvas'), S = this.S || 2;
        cv.width = Math.round(this.W * S); cv.height = Math.round(this.H * S);
        const c = cv.getContext('2d'), kx = cv.width / r.width, ky = cv.height / r.height;
        W.querySelectorAll('canvas').forEach((el) => {
            if (typeof GreedJarShop !== 'undefined' && el === GreedJarShop.cv) return;
            const st = getComputedStyle(el);
            if (st.display === 'none' || st.visibility === 'hidden') return;
            const rr = el.getBoundingClientRect();
            if (!rr.width || !rr.height) return;
            c.globalAlpha = +st.opacity || 1;
            try { c.drawImage(el, (rr.left - r.left) * kx, (rr.top - r.top) * ky, rr.width * kx, rr.height * ky); } catch (e) { /* пусто */ }
        });
        c.globalAlpha = 1;
        return cv;
    },

    castCanvas(snap) {
        const cv = document.createElement('canvas');
        cv.width = snap.width; cv.height = snap.height;
        cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:50;background:none;pointer-events:none';
        this.wrapEl.appendChild(cv);
        const gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
        if (!gl) { cv.remove(); return null; }
        const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn('[литьё]', gl.getShaderInfoLog(s)); return s; };
        const p = gl.createProgram();
        gl.attachShader(p, sh(gl.VERTEX_SHADER, 'attribute vec2 a; varying vec2 v; void main(){ v = vec2(a.x * 0.5 + 0.5, 0.5 - a.y * 0.5); gl_Position = vec4(a, 0.0, 1.0); }'));
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, `
            #ifdef GL_FRAGMENT_PRECISION_HIGH
            precision highp float;
            #else
            precision mediump float;
            #endif
            uniform sampler2D uSnap; uniform vec2 uWH; uniform float uY0, uT;
            uniform vec4 uB;      // ширина расплава, растушёвка его хвоста, обугливание, марево
            uniform float uCr;    // корочка
            uniform vec3 uCrust, uHoney, uMol, uWhite, uEmber; varying vec2 v;
            ${this.castGLSL()}
            float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
            void main(){
                vec2 P = vec2(v.x * uWH.x, v.y * uWH.y + uY0);
                // расстояние за фронтом, ед. (+ — уже залито); край живой:
                // мениск дышит мелкой волной поверх формулы прохода
                float dd = (uT - castPass(P.x, P.y)) * uCV.z;
                dd += 0.9 * sin(P.x / 5.3 + uT / 190.0) + 0.6 * sin(P.x / 2.7 - uT / 120.0);
                if (dd >= uB.x * 1.6) { gl_FragColor = vec4(0.0); return; }
                if (dd < 0.0) {
                    // гаражный: марево (строки качаются) и обугливание с отсветом жара
                    float near = 1.0 - smoothstep(0.0, uB.w, -dd);
                    float sy = 0.6 * near * sin(P.y / 2.6 + uT / 55.0) / uWH.y;
                    vec3 c = texture2D(uSnap, v + vec2(0.0, sy)).rgb;
                    float sc = 1.0 - smoothstep(0.0, uB.z, -dd);
                    c *= 1.0 - 0.55 * sc;
                    c += uEmber * pow(sc, 3.0) * 0.55;
                    // корочка: остывший край расплава — тёмная кромка
                    c = mix(c, uCrust, 1.0 - smoothstep(0.0, uCr, -dd));
                    gl_FragColor = vec4(c, 1.0);
                    return;
                }
                // Расплав — валик жидкого золота вдоль фронта. Первая версия —
                // ровная жёлтая лента («краска», кадр 20.11); теперь объём:
                // у переднего края — медовый, остывающий; в середине —
                // горячий; ближе к хвосту — блик-полоса (валик выпуклый);
                // по самому краю — тонкая светлая кромка; узор течения —
                // вытянутые вниз струйки.
                float Bw = uB.x * (1.0 + 0.6 * castDripG(P.x));
                if (dd >= Bw) { gl_FragColor = vec4(0.0); return; }
                float u = dd / Bw;
                float n = vnoise(vec2(P.x / 2.4, (P.y - uT * 0.11) / 7.0)) * 0.65 + vnoise(vec2(P.x / 5.5, (P.y - uT * 0.07) / 3.0)) * 0.35;
                vec3 c = mix(uHoney, uMol, smoothstep(0.02, 0.45, u) * (0.75 + 0.35 * n));
                float spec = exp(-pow((u - 0.6) / 0.09, 2.0)) * (0.55 + 0.45 * n);
                c = mix(c, uWhite, spec * 0.75);
                c = mix(c, uWhite, (1.0 - smoothstep(0.0, 0.07, u)) * 0.45);
                // нижний край валика в тени (обращён вниз) — темнее
                c *= 0.78 + 0.22 * smoothstep(0.0, 0.25, u);
                // хвост растушёван: под ним проступает раскалённый литой
                float a = 1.0 - smoothstep(Bw - uB.y, Bw, dd);
                gl_FragColor = vec4(c * a, a);
            }`));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('[литьё]', gl.getProgramInfoLog(p)); cv.remove(); return null; }
        gl.useProgram(p);
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(p, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, snap);
        [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR));
        [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE));
        const U = (n) => gl.getUniformLocation(p, n), P = PALETTE.greedLux, vec = (x) => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16) / 255);
        gl.uniform1i(U('uSnap'), 0);
        gl.uniform2f(U('uWH'), this.W, this.H); gl.uniform1f(U('uY0'), this.Y0);
        const B = this.CAST_BAND;
        gl.uniform4f(U('uB'), B.molten, B.fade, B.scorch, B.shimmer); gl.uniform1f(U('uCr'), B.crust);
        gl.uniform3fv(U('uCrust'), vec(P.cast.crust)); gl.uniform3fv(U('uHoney'), vec(P.cast.honey));
        gl.uniform3fv(U('uMol'), vec(P.cast.molten)); gl.uniform3fv(U('uWhite'), vec(P.cast.white)); gl.uniform3fv(U('uEmber'), vec(P.kant.ember));
        this.castUniforms(gl, U);
        this._castC = { cv, gl, uT: U('uT'), tex: t };
        return this._castC;
    },
    castDraw(now) {
        const C = this._castC;
        if (!C) return;
        const gl = C.gl;
        gl.viewport(0, 0, C.cv.width, C.cv.height);
        gl.uniform1f(C.uT, this.castT(now));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    castCanvasDrop() {
        const C = this._castC;
        if (!C) return;
        const x = C.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext();
        C.cv.remove();
        this._castC = null;
    }
});
