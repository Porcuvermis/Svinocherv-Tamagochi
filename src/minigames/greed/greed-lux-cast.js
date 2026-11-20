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
        // Место удара — середина стыка колеса и пачинко, а не верхний край:
        // банка над краем видимой зоны пряталась под рамкой целиком (кадры
        // 20.11). Выше удара золото разбегается брызгами (vu), ниже — течёт.
        xi: 208, yi: 150,
        // Медленно — чтобы смаковать (игрок, 20.11: «скромно, старается не
        // быть в центре внимания»): весь аппарат за ~3,5 с, не за 2.
        vh: 0.55, vu: 0.3, v: 0.14,        // ед./мс: в стороны, вверх, вниз
        wob: 1.8,                          // размах неровного края
        // подтёки: x паза, где паз начинается и кончается по y, на сколько
        // убегает вперёд (ед.). Пазы версии 2: бока поля пачинко, обод
        // колбы, бока рамки экрана, паз рычага; и вольные ручьи по лаку.
        drips: [[208, -53, 273, 48], [334, -53, 273, 42], [37, 312, 604, 66], [71, 312, 604, 56],
                [89, 313, 465, 70], [291, 313, 465, 62], [303, 300, 404, 48], [325, 300, 404, 44],
                [150, 170, 300, 58], [262, 290, 500, 52], [120, 470, 640, 50], [232, 470, 640, 44],
                [178, 300, 460, 36], [56, 120, 300, 40]],
        dripW: 7.5,
        // Брызги удара: капли падают впереди фронта и прожигают гаражный
        // раньше него — дыры растут и сливаются с фронтом. x, y, когда
        // (мс от удара), скорость роста (ед./мс).
        spots: [[150, 205, 140, 0.05], [262, 200, 180, 0.05], [118, 262, 300, 0.045],
                [300, 252, 340, 0.045], [182, 330, 560, 0.04], [246, 362, 680, 0.04]],
        // остывание (мс): лак, золото; стекло почти не греется
        tau: { lac: 1100, gold: 2400 }
    },

    // волна края, ед. (+ — фронт впереди)
    castWob(x) { return this.CAST.wob * (4 * Math.sin(x / 23 + 1.3) + 2.5 * Math.sin(x / 9.7 + 0.4) + 1.5 * Math.sin(x / 4.1 + 2.1)); },
    castDrip(x, y) {
        const C = this.CAST, sm = (e0, e1, v) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
        let d = 0;
        for (const [dx, y0, y1, lead] of C.drips) {
            // голова подтёка — скруглённая капля, а не остриё (гаусс давал сосульки)
            const q = 1 - Math.pow((x - dx) / C.dripW, 2);
            if (q <= 0) continue;
            const g = Math.pow(q, 0.35);
            // разгон не круче фронта (lead' < 1), иначе край складывается
            d += lead * g * sm(y0, y0 + Math.max(80, lead * 1.8), y) * (1 - sm(y1, y1 + 60, y));
        }
        return d;
    },
    // мс от начала литья (от удара струи), когда фронт проходит (x, y)
    castPass(x, y) {
        const C = this.CAST;
        // эллипс от места удара (было — сумма по осям: пятно расходилось
        // ромбом с углами, кадр 20.11)
        const dx = (x - C.xi) / C.vh, dy = y > C.yi ? (y - C.yi) / C.v : (C.yi - y) / C.vu;
        let t = Math.hypot(dx, dy) - (this.castWob(x) + this.castDrip(x, y)) / C.v;
        // край дыры неровный (круг читался наклейкой, пять лучей — звездой; кадры 20.11)
        C.spots.forEach(([sx, sy, t0, sp], i) => { const a = Math.atan2(y - sy, x - sx); t = Math.min(t, t0 + Math.hypot(x - sx, y - sy) * (1 + 0.09 * Math.sin(3 * a + i * 1.7) + 0.07 * Math.sin(7 * a + i * 2.3) + 0.05 * Math.sin(11 * a + i)) / sp); });
        return t;
    },
    // то же для шейдера: uniform'ы uCP (xi, yi), uCV (vh, vu, v, dripW), uDr[8]
    castGLSL() {
        return `
            uniform vec2 uCP; uniform vec4 uCV; uniform vec4 uDr[14]; uniform vec4 uSp[6]; uniform float uWob;
            float castSm(float e0, float e1, float v){ return smoothstep(e0, e1, v); }
            float castWob(float x){ return uWob * (4.0 * sin(x / 23.0 + 1.3) + 2.5 * sin(x / 9.7 + 0.4) + 1.5 * sin(x / 4.1 + 2.1)); }
            float castPass(float x, float y){
                float d = 0.0;
                for (int i = 0; i < 14; i++) {
                    vec4 D = uDr[i];
                    float g = pow(max(0.0, 1.0 - pow((x - D.x) / uCV.w, 2.0)), 0.35);
                    d += D.w * g * castSm(D.y, D.y + max(80.0, D.w * 1.8), y) * (1.0 - castSm(D.z, D.z + 60.0, y));
                }
                float dx = (x - uCP.x) / uCV.x, dy = y > uCP.y ? (y - uCP.y) / uCV.z : (uCP.y - y) / uCV.y;
                float t = length(vec2(dx, dy)) - (castWob(x) + d) / uCV.z;
                for (int i = 0; i < 6; i++) {
                    vec2 q = vec2(x, y) - uSp[i].xy; float a = atan(q.y, q.x), fi = float(i);
                    t = min(t, uSp[i].z + length(q) * (1.0 + 0.09 * sin(3.0 * a + fi * 1.7) + 0.07 * sin(7.0 * a + fi * 2.3) + 0.05 * sin(11.0 * a + fi)) / uSp[i].w);
                }
                return t;
            }
            // насколько точка в подтёке (0..1): там расплава больше — полоса толще
            float castDripG(float x){
                float g = 0.0;
                for (int i = 0; i < 14; i++) g = max(g, pow(max(0.0, 1.0 - pow((x - uDr[i].x) / uCV.w, 2.0)), 0.35));
                return g;
            }
            float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }`;
    },
    castUniforms(gl, U) {
        const C = this.CAST, D = new Float32Array(14 * 4), Sp = new Float32Array(24);
        C.drips.forEach((d, i) => D.set(d, i * 4));
        C.spots.forEach((d, i) => Sp.set(d, i * 4));
        gl.uniform2f(U('uCP'), C.xi, C.yi);
        gl.uniform4f(U('uCV'), C.vh, C.vu, C.v, C.dripW);
        gl.uniform4fv(U('uDr'), D); gl.uniform4fv(U('uSp'), Sp); gl.uniform1f(U('uWob'), C.wob);
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
                    // остывает пятнами: корка схватывается неровно, одни места
                    // ещё тлеют, когда соседние уже чёрные
                    float patch = vnoise(P / 11.0) * 0.6 + vnoise(P / 4.3) * 0.4;
                    float tau = mix(uTauL, uTauG, gold) * (0.55 + 0.9 * patch);
                    float H = exp(-dt / tau);
                    // свечение у самого фронта — расплав светит на всё вокруг
                    float bloom = exp(-dt / 320.0);
                    if (H < 0.004 && bloom < 0.004) { gl_FragColor = vec4(0.0); return; }
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
                    vec3 c = col * H * k + uC1 * bloom * 0.4;
                    c = min(c, vec3(1.0));
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
    // замедление для отладки и кадров: localStorage 'gj-cast-slow'
    castSlow() { try { return +localStorage.getItem('gj-cast-slow') || 1; } catch (e) { return 1; } },
    // мс литья от удара струи (до удара — меньше нуля): часы банки — общие
    castT(now) {
        const c = this._cast;
        if (!c) return -1e9;
        if (c.t != null) return c.t;                   // стоп-кадр (кадры жара)
        return (now - c.start) / this.castSlow() - c.impact;
    }
});

// ---------- холст литья: гаражный под расплавом ----------
// Стоп-кадр гаражного (все его холсты, без банки) — текстура; шейдер на всё
// поле: впереди фронта — гаражный, обугленный и дрожащий от жара; на фронте
// — тёмная корочка и яркая кайма мениска; за ней — тело расплава (течёт
// вниз узором); дальше — прозрачно: под холстом уже литой корпус и его жар.
// Обычное наложение (не сложение): расплав и гаражный — непрозрачные.
Object.assign(GreedLux, {
    CAST_BAND: { molten: 22, fade: 7, scorch: 36, shimmer: 26, crust: 1.8 },

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

    // Холст и программа собираются заранее — вместе с заготовкой версии 2
    // (snap = null: холст скрыт); в миг покупки только заливается стоп-кадр
    // (castCanvasSnap). Замер (×4): сборка жара и этого холста в миг покупки
    // — ~0,7 с стоп-кадра, пока горит узел.
    castCanvas(snap) {
        const cv = document.createElement('canvas'), S = this.S || 2;
        cv.width = Math.round(this.W * S); cv.height = Math.round(this.H * S);
        cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:5;background:none;pointer-events:none';
        if (!snap) cv.style.display = 'none';
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
            // экраны, ещё не включённые (2.1): x0 y0 x1 y1 | радиус, тьма, вид, ход
            uniform vec4 uOv[6], uOp[6]; uniform vec3 uGlass, uScan;
            ${this.castGLSL()}
            float rbox(vec2 p, vec4 R, float r){ vec2 c = (R.xy + R.zw) * 0.5, h = (R.zw - R.xy) * 0.5 - r, q = abs(p - c) - h; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
            // выключенный экран — тёмное стекло; вид 1 — развёртка: точка
            // растёт в линию, линия раскрывается в кадр; вид 2 — арка (поле пачинко)
            vec4 screens(vec2 P, float dt){
                vec4 o = vec4(0.0);
                // тёмное стекло отражает жар литого и остывает с ним: без
                // этого выключенные колесо и поле пачинко на раскалённом
                // корпусе читались чёрными дырами (кадр 20.11)
                vec3 glass = mix(uGlass, uEmber * 1.6, 0.55 * exp(-max(dt, 0.0) / 700.0));
                for (int i = 0; i < 6; i++) {
                    vec4 R = uOv[i], Q = uOp[i];
                    if (Q.y <= 0.0) continue;
                    float inside;
                    if (Q.z > 1.5) inside = ((P.x > R.x && P.x < R.z && P.y > R.y && P.y < R.w) || length(P - vec2((R.x + R.z) * 0.5, R.y)) < Q.x) ? 1.0 : 0.0;
                    else inside = step(rbox(P, R, Q.x), 0.0);
                    if (inside < 0.5) continue;
                    float a = Q.y, ln = 0.0;
                    if (Q.z > 0.5 && Q.z < 1.5) {
                        float yc = (R.y + R.w) * 0.5, xc = (R.x + R.z) * 0.5, hh = (R.w - R.y) * 0.5, hw = (R.z - R.x) * 0.5, p = Q.w;
                        float lw = clamp(p / 0.3, 0.0, 1.0) * hw, oh = clamp((p - 0.3) / 0.7, 0.0, 1.0) * hh;
                        a = abs(P.y - yc) < oh ? 0.0 : Q.y;
                        ln = (1.0 - smoothstep(0.0, 1.3, abs(abs(P.y - yc) - oh))) * step(abs(P.x - xc), lw) * (1.0 - clamp((p - 0.8) / 0.2, 0.0, 1.0));
                    }
                    float A = max(a, ln);
                    if (A > o.a) o = vec4(glass * a * (1.0 - ln) + uScan * ln, A);
                }
                return o;
            }
            void main(){
                vec2 P = vec2(v.x * uWH.x, v.y * uWH.y + uY0);
                // расстояние за фронтом, ед. (+ — уже залито); край живой:
                // мениск дышит мелкой волной поверх формулы прохода
                float dd = (uT - castPass(P.x, P.y)) * uCV.z;
                dd += 1.4 * sin(P.x / 5.3 + uT / 190.0) + 0.9 * sin(P.x / 2.7 - uT / 120.0);
                if (dd >= uB.x * 1.6) { gl_FragColor = screens(P, dd / uCV.z); return; }
                if (dd < 0.0) {
                    // гаражный: марево (строки качаются) и обугливание с отсветом жара
                    float near = 1.0 - smoothstep(0.0, uB.w, -dd);
                    float sy = 1.1 * near * sin(P.y / 2.6 + uT / 55.0) / uWH.y, sx = 0.5 * near * sin(P.y / 4.1 - uT / 80.0) / uWH.x;
                    vec3 c = texture2D(uSnap, v + vec2(sx, sy)).rgb;
                    float sc = 1.0 - smoothstep(0.0, uB.z, -dd);
                    c *= 1.0 - 0.6 * sc;
                    c += uEmber * pow(sc, 3.0) * 0.6;
                    // расплав светит на гаражный: широкий тёплый отсвет впереди
                    // (было — только узкое обугливание: свет «ниоткуда»)
                    float lit = exp(dd / 55.0);
                    c += c * uHoney * 0.85 * lit + uEmber * 0.18 * lit;
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
                if (dd >= Bw) { gl_FragColor = screens(P, dd / uCV.z); return; }
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
                vec4 sc = screens(P, dd / uCV.z);
                gl_FragColor = vec4(c * a, a) + sc * (1.0 - a);
            }`));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('[литьё]', gl.getProgramInfoLog(p)); cv.remove(); return null; }
        gl.useProgram(p);
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(p, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        if (snap) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, snap);
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
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
        gl.uniform3fv(U('uGlass'), vec(P.led.back)); gl.uniform3fv(U('uScan'), vec(P.scan));
        this._castC = { cv, gl, uT: U('uT'), tex: t, uOv: U('uOv'), uOp: U('uOp') };
        return this._castC;
    },
    castCanvasSnap(snap) {
        const C = this._castC;
        if (!C) return this.castCanvas(snap);
        const gl = C.gl;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, C.tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, snap);
        C.cv.style.display = '';
        return C;
    },
    castDraw(now) {
        const C = this._castC;
        if (!C) return;
        const gl = C.gl;
        gl.viewport(0, 0, C.cv.width, C.cv.height);
        gl.uniform1f(C.uT, this.castT(now));
        const [ov, op] = this.castScreens(now);
        gl.uniform4fv(C.uOv, ov); gl.uniform4fv(C.uOp, op);
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

// ---------- ход литья ----------
// Банка (greed-jar3-melt.js) и литьё идут по одним часам: начало — вспышка
// узла (GreedJarShop.t0), удар струи — CAST_RUN.impact. Под банкой, пока
// она ещё «в упор», гаражный снимается в картинку и уходит со страницы, а
// под картинкой встаёт заготовка версии 2 — подмены не видно.
Object.assign(GreedLux, {
    // мс от вспышки узла: блеск (shine) и ставки на табло (bets) — после
    // включения экранов; конец — когда блеск прошёл
    CAST_RUN: { total: 10900, kantAmp: 2.0, kantTau: 3000, shine: 9500, shineMs: 1200, betStep: 200, betGap: 200 },

    async castRun() {
        const J = GreedJarShop, L = GreedJunkLit, host = L.wrapEl && L.wrapEl.parentElement, opts = L._opts;
        if (!host || this._cast || this._castWait) return;
        const G = GreedMinigame, gen = G.spinGeneration;
        this._castWait = true;
        try {
            await (this._prep ? this._mountP : this.prepare(host));
            await this.castHeatInit();
            // идёт выплата (монеты летят, барабаны крутятся) — банка ждёт с
            // расплавом; литьё — когда игры свободны (не дольше 10 с)
            for (let i = 0; i < 100 && G.busy(); i++) await new Promise(r => setTimeout(r, 100));
        } catch (e) { console.warn('[литьё]', e); }
        this._castWait = false;
        // окно закрыли, пока ждали, — литья нет: версия 2 встанет при входе
        if (G.spinGeneration !== gen) return;
        if (!this.gl || !L.wrapEl) {
            // нет заготовки — по-старому: закрыть банку и пересобрать
            J.busy = false; J.close();
            if (typeof GreedDebug !== 'undefined') setTimeout(() => GreedDebug.rebuild(), 1100);
            return;
        }
        const snap = this.castSnapshot();
        GreedDebug.junkDrop();
        G.M = this; G.play = { slots: null, wheel: null, pachinko: null };
        this._castPending = true;
        await this.prepTake(host, opts);
        this._castPending = false;
        if (this.meterSet && this.meterValue) this.meterSet(this.meterValue());
        if (!this.castCanvasSnap(snap)) { this.castEnd(); return; }
        // палец — не в аппарат, пока льётся
        const cv = this._castC.cv;
        cv.style.pointerEvents = 'auto';
        ['pointerdown', 'pointermove', 'pointerup'].forEach(k => cv.addEventListener(k, (e) => { e.stopPropagation(); e.preventDefault(); }));
        // банка мерила поле по обёртке гаражного (её больше нет) — поле то же у версии 2
        J.wrap = this.wrapEl;
        const now = performance.now(), Q = J.POUR;
        J.pourStart(now);
        this._cast = { start: now, impact: Q.streamAt + Q.head, coins: J.shown };
        this.castKant();
        this.castBootPlan();
        this.castHaptics();
    },
    // кант: пояс раскаляется, когда через него проходит фронт, и остывает
    // последним (событие-импульс на всё кольцо из места, где фронт его
    // пересёк первым — под ударом струи)
    castKant() {
        const K = this._kgl, c = this._cast, R = this.CAST_RUN;
        if (!K || !c) return;
        const slow = this.castSlow();
        K.meta.rings.forEach((rg, i) => {
            const x = Math.max(rg[0], Math.min(rg[2], this.CAST.xi)), y = rg[1];
            const tp = this.castPass(x, y), at = c.start + (c.impact + tp) * slow, L = K.meta.len[i];
            this.kantAdd({ game: 'cast', ring: i, s0: this.kantS(i, x, y), at, kind: 0, amp: R.kantAmp, speed: this.CAST.v * 2.2, reach: L / 2 + 20, tau: R.kantTau, life: L / 2 / (this.CAST.v * 2.2) + R.kantTau * 4 });
        });
        // последний тёплый вдох всего канта — вместе с блеском
        this.kantAdd({ game: 'cast', ring: -1, s0: 0, at: c.start + R.shine * slow, kind: 1, amp: 0.55, speed: 1, reach: 4000, tau: 800, life: 800 });
    },
    castStep(now) {
        const c = this._cast;
        if (!c || c.t != null) return;
        const t = (now - c.start) / this.castSlow();
        if (t > this.CAST_RUN.total) { this.castEnd(); return; }
        // отдача в палец — по расписанию (castHaptics)
        // после паузы (Telegram в фоне — кадров не было) пропущенная отдача
        // не выдаётся залпом: только то, что наступило сейчас
        while (c.hap && c.hap.length && c.hap[0][0] <= t) { const h = c.hap.shift(); if (h[0] > t - 250) try { h[1](); } catch (e) { /* нет отдачи */ } }
        this.castDraw(now);
        // значки колеса и малые табло — каждый кадр, пока включаются
        this._iconsDirty = true; if (this.screensDraw) this.screensDraw(now, true);
        if (typeof GreedJarShop !== 'undefined') GreedJarShop.step(now, c.coins);
    },
    // Отдача (2.1): плавление — частые тики, жидкость у горла — средний удар,
    // струя — лёгкие удары по 90 мс, фронт через пояс канта — чёткий щелчок,
    // посадка банки — тяжёлый, экран включился — тик, цифра ставки — тик,
    // блеск — успех. Время — мс от вспышки узла.
    castHaptics() {
        const c = this._cast, J = GreedJarShop.POUR, R = this.CAST_RUN, H = typeof Haptics !== 'undefined' ? Haptics : null;
        if (!c || !H) return;
        const L = [], at = (t, f) => L.push([t, f]);
        for (let t = J.meltAt; t < J.meltAt + J.melt; t += 120) at(t, () => H.tick());
        at(J.streamAt, () => H.impact('medium'));
        at(c.impact, () => H.impact('heavy'));
        for (let t = J.tremble[0]; t < J.tremble[1]; t += 90) at(t, () => H.tick());
        for (let t = c.impact; t < J.end; t += 140) at(t, () => H.impact('light'));
        if (this._kgl) this._kgl.meta.rings.slice(0, 3).forEach(rg => at(c.impact + this.castPass(Math.max(rg[0], Math.min(rg[2], this.CAST.xi)), rg[1]), () => H.impact('rigid')));
        at(J.toPig + J.pigFly + J.sink * 0.6, () => H.impact('heavy'));
        const B = this._boot;
        if (B) {
            ['pach', 'led', 'small', 'lamp'].forEach(k => at(c.impact + B[k], () => H.tick()));
            B.wheel.forEach(w => { if (w != null) at(c.impact + w, () => H.tick()); });
            const b0 = c.impact + B.small + this.CAST_BOOT.dur.small + R.betGap;
            c.betAt = b0;
            for (let i = 0; i < 4; i++) at(b0 + i * R.betStep, () => H.tick());
        }
        at(R.shine, () => H.notify('success'));
        c.hap = L.sort((a, b) => a[0] - b[0]);
    },
    // Аппарат вздрагивает: удар струи, фронт через пояс канта, посадка банки
    castShake(now) {
        const c = this._cast;
        if (!c || c.t != null) return [0, 0];
        const t = (now - c.start) / this.castSlow(), J = GreedJarShop.POUR;
        if (!c.shk) {
            c.shk = [[c.impact, 3.6]];
            if (this._kgl) this._kgl.meta.rings.slice(0, 3).forEach(rg => c.shk.push([c.impact + this.castPass(Math.max(rg[0], Math.min(rg[2], this.CAST.xi)), rg[1]), 1.8]));
            c.shk.push([J.toPig + J.pigFly + J.sink * 0.6, 1.6]);
        }
        let x = 0, y = 0;
        c.shk.forEach(([at, amp], i) => { const d = t - at; if (d > 0 && d < 420) { const e = Math.exp(-d / 110) * amp; x += Math.sin(d / 17 + i) * e; y += Math.cos(d / 21 + i) * e * 0.7; } });
        return [x, y];
    },
    // мнимый наклон: блик бежит по лаку и золоту слева направо
    castTilt(now, t) {
        const c = this._cast;
        if (!c || c.t != null) return t;
        const R = this.CAST_RUN, u = ((now - c.start) / this.castSlow() - R.shine) / R.shineMs;
        if (u <= 0 || u >= 1) return t;
        return { x: (t.x || 0) + 0.8 * (2 * u - 1) * Math.sin(Math.PI * u), y: t.y || 0 };
    },
    // окно закрыли посреди литья: всё снять; версия 2 уже куплена и стоит
    castAbort() { if (this._cast) this.castEnd(); },
    castEnd() {
        this.castCanvasDrop();
        this._cast = null; this._boot = null;
        if (this.screensDraw) this.screensDraw(performance.now(), true);
        if (typeof GreedJarShop !== 'undefined' && GreedJarShop.detach) GreedJarShop.detach();
        this._iconsDirty = true;
    }
});

// ---------- экраны включаются, когда остыл их участок ----------
// (2.1) Сверху вниз, по формуле фронта: каждый — через cool мс после того,
// как через него прошёл расплав. Сектора колеса — по одному, с миганием;
// поле пачинко — подсветка разгорается с дрожью; LED бандита — развёртка;
// малые табло — все сегменты «8», потом число; лампа готовности — вспышкой.
Object.assign(GreedLux, {
    CAST_BOOT: { cool: 1400, wheelGap: 120, dur: { wheel: 380, pach: 950, led: 650, small: 640, lamp: 380 } },
    // поле пачинко в поле аппарата: арка (machine.py pach_live, через PACH_AT)
    CAST_PACH: { x0: 229.1, x1: 311.8, cy: 29.1, drain: 240.4, r: 41.4 },

    castBootPlan() {
        const B = this.CAST_BOOT, L = this.meta.live, T = (x, y) => this.castPass(x, y) + B.cool;
        const plan = {
            pach: T(270, 130), led: T((L.screen[0] + L.screen[2]) / 2, (L.screen[1] + L.screen[3]) / 2),
            lamp: T(L.lamp[0], L.lamp[1]) + 150, small: T((L.bal[0] + L.bal[2]) / 2, (L.bal[1] + L.bal[3]) / 2), wheel: []
        };
        // сектора: по времени остывания значка, но не чаще wheelGap
        const keys = GreedJunk.wheelKeys(), order = keys.map((k, i) => { const P = this.iconAt(i); return { i, t: T(P.x, P.y) }; }).sort((a, b) => a.t - b.t);
        let last = -1e9;
        order.forEach(o => { last = Math.max(o.t, last + B.wheelGap); plan.wheel[o.i] = last; });
        this._boot = plan;
    },
    // −1 — выключен, 0..1 — включается, 2 — горит (или литья нет)
    castBoot(name, now, i) {
        const B = this._boot;
        if (!this._cast || !B) return 2;
        const st = name === 'wheel' ? B.wheel[i] : B[name];
        if (st == null) return 2;
        const t = this.castT(now);
        if (t < st) return -1;
        const p = (t - st) / this.CAST_BOOT.dur[name];
        return p < 1 ? p : 2;
    },
    castScreens(now) {
        const ov = new Float32Array(24), op = new Float32Array(24), L = this.meta.live;
        let n = 0;
        const put = (R, r, a, mode, p) => { if (n < 6 && a > 0) { ov.set(R, n * 4); op.set([r, a, mode, p], n * 4); n++; } };
        const flick = (p) => (1 - p) * (Math.floor(p * 9) % 3 === 1 ? 0.35 : 1);
        const pb = this.castBoot('pach', now), PA = this.CAST_PACH;
        if (pb !== 2) put([PA.x0, PA.cy, PA.x1, PA.drain], PA.r, pb < 0 ? 0.93 : 0.93 * flick(pb), 2, 0);
        const lb = this.castBoot('led', now), S = L.screen;
        if (lb !== 2) put([S[0], S[1], S[2], S[3]], S[4], 1, 1, lb < 0 ? 0 : lb);
        const mb = this.castBoot('lamp', now);
        if (mb !== 2) put([L.lamp[0] - 7, L.lamp[1] - 7, L.lamp[0] + 7, L.lamp[1] + 7], 7, mb < 0 ? 0.9 : 0.9 * flick(mb), 0, 0);
        return [ov, op];
    },
    // сектора колеса: невключённые — тёмным стеклом поверх значка и подсветки
    castWheelPower(now) {
        if (!this._cast || !this._boot || !this.icx) return;
        const g = this.icx, keys = GreedJunk.wheelKeys(), back = PALETTE.greedLux.led.back;
        g.save(); g.globalCompositeOperation = 'source-over'; g.fillStyle = back;
        keys.forEach((k, i) => {
            const b = this.castBoot('wheel', now, i);
            if (b === 2 || this.iconAt(i).x < -24) return;
            g.globalAlpha = b < 0 ? 0.8 : (1 - b) * (Math.floor(b * 8) % 2 ? 0.2 : 0.8);
            this.wedge(g, i); g.fill();
        });
        g.restore();
    }
});
(function () {
    const L = GreedLux, di = L.drawIcons, sd = L.screensDraw;
    L.drawIcons = function (now) { di.call(this, now); this.castWheelPower(now); };
    // малые табло: тьма → все сегменты → число
    L.screensDraw = function (now, force) {
        const st = this.castBoot ? this.castBoot('small', now) : 2, M = this.meta && this.meta.live;
        if (st === 2 || !this.betCv || !M) {
            if (this._smallBoot) { this._smallBoot = false; force = true; }
            const r = sd.call(this, now, force), c = this._cast;
            // ставки версии 2 открыты: табло пробегает их все и встаёт на первую
            if (c && c.betAt && this.betCv && M) {
                const R = this.CAST_RUN, tt = (now - c.start) / this.castSlow() - c.betAt, bets = this.bets();
                if (tt >= 0 && tt < (bets.length + 1) * R.betStep) {
                    const i = Math.floor(tt / R.betStep), b = i < bets.length ? bets[i] : this.betNow();
                    this.dotsDraw(this.betCv, M.bet, b + 'x', 0.7);
                    this._betShow = true;
                } else if (this._betShow) { this._betShow = false; sd.call(this, now, true); }
            }
            return r;
        }
        this._smallBoot = true;
        // (dotsDraw оставляет свой масштаб — без сброса стиралось не то)
        if (st < 0) { [this.betCv, this.balCv].forEach(cv => { const c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height); }); return; }
        if (st < 0.55) { this.dotsDraw(this.betCv, M.bet, '888', 0.8); this.dotsDraw(this.balCv, M.bal, '8888', 0.8); return; }
        return sd.call(this, now, true);
    };
})();
