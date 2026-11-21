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
        // фронт — по карте прихода (greed-lux-flow.js); формула ниже — запас
        if (this._flow) return this.flowAt(this._flow, x, y);
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
            uniform vec2 uCP; uniform vec4 uCV;
            uniform sampler2D uFlow; uniform vec2 uFlowN; uniform float uFlowSt, uFlowK, uFlowY0;
            float flowT(vec2 g){ vec3 c = texture2D(uFlow, (g + 0.5) / uFlowN).rgb; return (c.r * 65280.0 + c.g * 255.0) / uFlowK; }
            float hash(vec2 p);
            float vnoise(vec2 p);
            // время прихода — из карты (билинейно руками) + мелкая рябь края,
            // как у прогорающей бумаги: сетка карты — 1,5 ед., рябь — мельче
            float castPassS(float x, float y){
                vec2 g = vec2(x / uFlowSt, (y - uFlowY0) / uFlowSt) - 0.5, i = floor(g), f = g - i;
                return mix(mix(flowT(i), flowT(i + vec2(1.0, 0.0)), f.x), mix(flowT(i + vec2(0.0, 1.0)), flowT(i + vec2(1.0, 1.0)), f.x), f.y);
            }
            float castPass(float x, float y){
                float t = castPassS(x, y);
                // (сильнее — край выходил ворсом, валик расплава размывался)
                return t + (vnoise(vec2(x, y) / 2.2) - 0.5) * 8.0 + (vnoise(vec2(x, y) / 5.5) - 0.5) * 14.0;
            }
            float castDripG(float x){ return 0.0; }
            float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }`;
    },
    castUniforms(gl, U, unit) {
        const C = this.CAST, f = this._flow;
        gl.uniform2f(U('uCP'), C.xi, C.yi);
        gl.uniform4f(U('uCV'), C.vh, C.vu, C.v, C.dripW);
        // карта прихода — своей текстурой в этом контексте (unit)
        gl.uniform1i(U('uFlow'), unit); gl.uniform2f(U('uFlowN'), f.gw, f.gh);
        gl.uniform1f(U('uFlowSt'), f.step); gl.uniform1f(U('uFlowK'), this.FLOW_K); gl.uniform1f(U('uFlowY0'), this.Y0);
        return this.flowTexture(gl, unit);
    },

    // ---------- жар литого (программа в холсте канта) ----------
    // Накал H = exp(−(t − tPass)/τ): лак вспыхивает раскалённым красным и
    // быстро чернеет, золото тлеет дольше, на скатах ярче (как у канта),
    // стекло экранов — тёмное (экраны в жару выключены). Цвет — кривая канта:
    // у аппарата один «жар».
    castHeatInit() {
        const K = this._kgl;
        if (!K || !this._flow) return Promise.resolve(false);
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
                uniform sampler2D uM, uH, uSh; uniform vec2 uWH, uPx; uniform float uY0, uT, uTauL, uTauG, uCoolEnd;
                uniform vec3 uC0, uC1, uC2; varying vec2 v;
                ${this.castGLSL()}
                float hgt(vec2 q){ vec3 c = texture2D(uH, q).rgb; return (c.r * 65280.0 + c.g * 255.0) / 65535.0 * 64.0; }
                void main(){
                    vec2 P = vec2(v.x * uWH.x, v.y * uWH.y + uY0);
                    // остаток жара — после остывания отливки (до него жар рисует
                    // холст литья): золото тлеет дольше лака
                    // (было: до конца остывания — сразу полный жар: где отливка уже
                    // растворилась, вспыхивало плоское пятно с резким краем, кадр
                    // 20.11) — остаток слабый и нарастает плавно
                    float dt0 = uT - castPass(P.x, P.y) - uCoolEnd;
                    if (dt0 < -600.0) { gl_FragColor = vec4(0.0); return; }
                    float fadeIn = smoothstep(-600.0, 0.0, dt0) * 0.35;
                    float dt = max(dt0, 0.0);
                    vec3 m = texture2D(uM, v).rgb;
                    float gold = step(0.5, m.b), glass = step(0.5, m.g);
                    // остывает пятнами: корка схватывается неровно, одни места
                    // ещё тлеют, когда соседние уже чёрные
                    float patch = vnoise(P / 16.0) * 0.7 + vnoise(P / 7.0) * 0.3;
                    // (сильнее — пятна читались грязью)
                    float tau = mix(uTauL, uTauG, gold) * (0.8 + 0.4 * patch);
                    float H = exp(-dt / tau) * fadeIn;
                    // свечение у самого фронта — расплав светит на всё вокруг
                    float bloom = exp(-dt / 320.0) * fadeIn;
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
                    vec3 c = col * H * k + uC1 * bloom * 0.12;
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
            gl.uniform1f(U('uTauL'), 300); gl.uniform1f(U('uTauG'), 1100);
            gl.uniform1f(U('uCoolEnd'), this.CAST_COOL.hold + this.CAST_COOL.dur * 0.95);
            gl.uniform3fv(U('uC0'), vec(P.ember)); gl.uniform3fv(U('uC1'), vec(P.amber)); gl.uniform3fv(U('uC2'), vec(P.hot));
            this._castH_flow = this.castUniforms(gl, U, 5);
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
    // карта прихода — одна на заготовку (своя случайность на каждое литьё)
    castFlowReady() {
        if (this._flow) return Promise.resolve(this._flow);
        if (!this._flowP) { const w = this.wrapEl; this._flowP = this.flowBuild().then(f => { if (this.wrapEl === w) this._flow = f; return f; }); }
        return this._flowP;
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
    CAST_BAND: { molten: 15, fade: 5, scorch: 36, shimmer: 26, crust: 1.6 },
    // Остывание отливки (план 31, 2.10): выдержка после фронта, длительность,
    // наибольшее размытие (мип-уровень), шум выдержки ±мс; части — прямоугольник
    // поля, сдвиг начала (мс), множитель длительности, ширина перехода (ед.)
    CAST_COOL: {
        hold: 1800, dur: 3200, blur: 6.0, noise: 300,
        parts: [
            { name: 'колба', r: [30, 300, 78, 604], off: -400, scale: 0.8 },
            { name: 'колесо', r: [0, -57, 172, 268], off: -200, scale: 1.0, feather: 30 },
            { name: 'пачинко', r: [208, -53, 334, 273], off: 0, scale: 1.0 },
            { name: 'экран', r: [85, 313, 295, 465], off: 200, scale: 1.0 },
            { name: 'рычаг', r: [292, 278, 336, 474], off: 500, scale: 1.3 },
            { name: 'цоколь', r: [6, 502, 354, 634], off: 400, scale: 1.1, feather: 30 },
            { name: '—', r: [-99, -99, -98, -98], off: 0, scale: 1.0 }
        ]
    },
    // Облик версии 2 — картинкой без экранов (корпус, колба, блики стекла,
    // монеты лотка и копилки), 512×1024 с мип-уровнями: уровень — размытие.
    // Значки колеса, LED, табло, лампа — не в облике: они включатся потом.
    castLookTexture(gl, unit) {
        const cv = document.createElement('canvas'); cv.width = 512; cv.height = 1024;
        const g = cv.getContext('2d'), r = this.wrapEl.getBoundingClientRect(), kx = 512 / r.width, ky = 1024 / r.height;
        [this.cv, this.metCv, this.glareCv, this.trayCv, this.pigCv].forEach(el => {
            if (!el) return;
            const rr = el.getBoundingClientRect();
            if (!rr.width || !rr.height) return;
            try { g.drawImage(el, (rr.left - r.left) * kx, (rr.top - r.top) * ky, rr.width * kx, rr.height * ky); } catch (e) { /* не читается */ }
        });
        // Экраны в облике — тёмным стеклом, как до включения: в корпусе под
        // ними нарисованы окна лент и свечение секторов, и отливка проступала
        // синим с жёлтым, а потом вдруг гасла (кадр 20.11)
        try {
            const S = this.S, sw = Math.round(this.W * S), shh = Math.round(this.H * S), m = document.createElement('canvas'); m.width = sw; m.height = shh;
            const mg = m.getContext('2d'), back = PALETTE.greedLux.led.back, L = this.meta.live, F = (x, y) => [x * S, (y - this.Y0) * S];
            mg.fillStyle = back;
            if (this.wedge && typeof GreedJunk !== 'undefined') { mg.globalAlpha = 0.8; GreedJunk.wheelKeys().forEach((k, i) => { if (this.iconAt(i).x < -24) return; this.wedge(mg, i); mg.fill(); }); }
            mg.globalAlpha = 1;
            const sc = L.screen, [a0, b0] = F(sc[0], sc[1]), [a1, b1] = F(sc[2], sc[3]); mg.fillRect(a0, b0, a1 - a0, b1 - b0);
            const PA = this.CAST_PACH, [p0, q0] = F(PA.x0, PA.cy), [p1, q1] = F(PA.x1, PA.drain);
            mg.globalAlpha = 0.93; mg.beginPath(); mg.rect(p0, q0, p1 - p0, q1 - q0); mg.arc((p0 + p1) / 2, q0, PA.r * S, 0, 7); mg.fill();
            const [lx, ly] = F(L.lamp[0], L.lamp[1]); mg.globalAlpha = 0.9; mg.beginPath(); mg.arc(lx, ly, 7 * S, 0, 7); mg.fill();
            g.drawImage(m, 0, 0, 512, 1024);
        } catch (e) { /* без затемнения экранов */ }
        const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        // Мипы — свои, сглаженные: у готовых (generateMipmap, ящиком) на
        // крупных уровнях проступали квадраты (кадр 20.11). Каждый уровень —
        // уменьшение предыдущего и два прохода размытия 3×3.
        let src = cv;
        for (let lv = 0, w = 512, h = 1024; ; lv++) {
            const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
            const g2 = c2.getContext('2d'); g2.drawImage(src, 0, 0, w, h);
            if (lv >= 2 && w >= 2 && h >= 2) this.castBlur3(g2, w, h, 2);
            gl.texImage2D(gl.TEXTURE_2D, lv, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c2);
            src = c2;
            if (w === 1 && h === 1) break;
            w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
        }
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE));
        gl.activeTexture(gl.TEXTURE0);
        this._lookCv = cv;
        return t;
    },
    // размытие 3×3 (passes раз) по картинке холста — для мип-уровней облика
    castBlur3(g, w, h, passes) {
        const im = g.getImageData(0, 0, w, h), d = im.data, t = new Uint8ClampedArray(d.length);
        for (let p = 0; p < passes; p++) {
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let ch = 0; ch < 4; ch++) {
                let s = 0, n = 0;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += d[(yy * w + xx) * 4 + ch]; n++; } }
                t[(y * w + x) * 4 + ch] = s / n;
            }
            d.set(t);
        }
        g.putImageData(im, 0, 0);
    },
    // то же остывание в JS (расписание экранов, банки, канта, отдачи):
    // мс литья, когда точка (x, y) остыла до c
    castCoolTime(x, y, c = 1) {
        const CC = this.CAST_COOL, sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
        let off = 0, sc = 1;
        CC.parts.forEach(q => { const [x0, y0, x1, y1] = q.r, dx = Math.max(x0 - x, 0, x - x1), dy = Math.max(y0 - y, 0, y - y1), w = 1 - sm(0, q.feather || 20, Math.hypot(dx, dy)); off += (q.off - off) * w; sc += (q.scale - sc) * w; });
        return this.castPass(x, y) + CC.hold + off + CC.dur * sc * c;
    },

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
        if (!this._flow) return null;
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
            // остывание отливки (2.10): облик версии 2 с мип-уровнями (размытие),
            // выдержка, длительность, наибольшее размытие, шум; части; пояса
            uniform sampler2D uLook; uniform vec2 uLookN; uniform vec4 uCool;
            uniform vec4 uRg[7], uRo[7], uRing[3]; uniform vec3 uRingR;
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
            // ---------- отливка остывает ----------
            vec2 hash2(vec2 p){ return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
            // ячейки корки: расстояние до ближайшей и второй точки
            vec2 vor(vec2 p){
                vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
                for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
                    vec2 g = vec2(float(x), float(y)), o = hash2(i + g); float d = length(g + o - f);
                    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
                }
                return vec2(d1, d2);
            }
            float lum(vec3 c){ return dot(c, vec3(0.3, 0.55, 0.15)); }
            // облик размытием уровня L: 4 повёрнутые выборки прячут квадраты мипов
            vec3 blurLook(vec2 uv, float L){
                vec2 o = exp2(L) * 0.55 / uLookN;
                return (texture2D(uLook, uv + vec2(o.x, o.y * 0.4), L).rgb + texture2D(uLook, uv + vec2(-o.x * 0.4, o.y), L).rgb
                      + texture2D(uLook, uv + vec2(-o.x, -o.y * 0.4), L).rgb + texture2D(uLook, uv + vec2(o.x * 0.4, -o.y), L).rgb) * 0.25;
            }
            // жар: белое-жёлтое → медовое → тлеющее → корка → чёрное
            vec3 ramp(float H){
                // расплав — насыщенное золото, не бело-кремовое (кадр 20.11:
                // масса читалась бледной пастой); белое — только у самого края
                if (H > 0.85) return mix(mix(uHoney, uMol, 0.4), mix(uHoney, uMol, 0.75), (H - 0.85) / 0.15);
                if (H > 0.55) return mix(uHoney, mix(uHoney, uMol, 0.4), (H - 0.55) / 0.3);
                if (H > 0.25) return mix(uEmber, uHoney, (H - 0.25) / 0.3);
                return mix(uCrust * 0.4, uEmber, H / 0.25);
            }
            // c — насколько остыла точка (0 — расплав, 1 — готово): начало —
            // приход фронта + выдержка части + шум, длительность — своя у части;
            // границы поясов (тонкое) — раньше
            float coolAt(vec2 P, float tp){
                float off = 0.0, sc = 1.0;
                for (int i = 0; i < 7; i++) { float w = 1.0 - smoothstep(0.0, uRo[i].z, rbox(P, uRg[i], 0.0)); off = mix(off, uRo[i].x, w); sc = mix(sc, uRo[i].y, w); }
                float de = min(abs(rbox(P, uRing[0], uRingR.x)), min(abs(rbox(P, uRing[1], uRingR.y)), abs(rbox(P, uRing[2], uRingR.z))));
                float e = exp(-de / 8.0);
                off += -600.0 * e + (vnoise(P / 40.0) - 0.5) * 2.0 * uCool.w;
                sc *= mix(1.0, 0.8, e);
                return clamp((uT - (tp + uCool.x + off)) / (uCool.y * sc), 0.0, 1.0);
            }
            vec4 molten(vec2 P, float tp){
                float c = coolAt(P, tp);
                vec4 sc = screens(P, uT - tp);
                if (c >= 1.0) return sc;
                float H = 1.0 - c, L = uCool.z * pow(H, 1.25);
                vec3 s1 = blurLook(v, L), s2 = blurLook(v, L + 1.6);
                // формы того масштаба, до которого дошло остывание — рельефом свечения
                float det = clamp((lum(s1) - lum(s2)) * 4.5, -0.7, 0.9);
                // расплав дышит: течение под коркой
                // (шум одним слоем по сетке давал квадраты — кадр 20.11;
                // два повёрнутых слоя разного шага сетку не выдают)
                vec2 r1 = mat2(0.8, -0.6, 0.6, 0.8) * P, r2 = mat2(0.5, 0.87, -0.87, 0.5) * P;
                float br = 0.84 + 0.16 * vnoise(r1 / 26.0 + vec2(uT / 900.0, -uT / 1300.0)) + 0.16 * vnoise(r2 / 17.0 + vec2(-uT / 1100.0, uT / 1500.0));
                // Формы проступают светом: светлое в облике (золото) держит
                // жар дольше, тёмное (лак) темнеет раньше — узор деталей
                // читается накалом, а не наложенной картинкой. В расплаве —
                // контрастное течение с бликами (было — ровная горчичная паста)
                float k = smoothstep(0.0, 0.6, c), ls = lum(s1);
                float He = H * mix(1.0, 0.35 + 1.25 * ls, k);
                vec3 hot = ramp(He) * (0.78 + 0.5 * (br - 0.84)) * (0.85 + det) + vec3(1.0, 0.92, 0.7) * pow(clamp((br - 0.84) * 3.2, 0.0, 1.0), 4.0) * 0.16 * (1.0 - k);
                // корка: плиты темнеют, швы светятся и сужаются; пока жидко — дрейф
                // (первая — ровная мелкая сетка по всему: читалась кракелюром;
                // теперь плиты крупнее, неровные, корка — пятнами и только
                // пока проступают крупные формы)
                vec2 q = P / 21.0 + vec2(vnoise(P / 9.0), vnoise(P / 9.0 + 7.3)) * 0.9;
                vec2 F = vor(q + vec2(0.3, 1.0) * (uT / 6000.0) * (1.0 - smoothstep(0.0, 0.3, c)));
                float seam = 1.0 - smoothstep(0.0, 0.03 + 0.07 * H, F.y - F.x);
                float crust = smoothstep(0.12, 0.4, c) * (1.0 - smoothstep(0.45, 0.75, c)) * smoothstep(0.5, 0.75, vnoise(P / 30.0 + 3.1));
                hot = mix(hot, hot * 0.55, crust * (1.0 - seam)) + ramp(min(1.0, H + 0.25)) * seam * crust * 0.45;
                // настоящий цвет проступает, жар уходит в глубину
                float rc = smoothstep(0.45, 0.95, c);
                vec3 col = mix(hot, s1 + ramp(H) * H * (0.6 - 0.4 * det), rc);
                float a = 1.0 - smoothstep(0.86, 1.0, c);
                return vec4(col * a, a) + sc * (1.0 - a);
            }
            void main(){
                vec2 P = vec2(v.x * uWH.x, v.y * uWH.y + uY0);
                // расстояние за фронтом, ед. (+ — уже залито); край живой:
                // мениск дышит мелкой волной поверх формулы прохода
                // расстояние до края в единицах — время до края, делённое на
                // уклон карты (мс на ед.): скорость теперь своя в каждой точке,
                // и «время × одна скорость» давало тонкую бахрому там, где
                // фронт шёл вбок медленно
                float tp = castPass(P.x, P.y);
                // уклон — по гладкой карте, шагом в клетку (с рябью и шагом
                // меньше клетки он скакал, и валик выходил дырявым)
                float hs = uFlowSt;
                vec2 gT = vec2(castPassS(P.x + hs, P.y) - castPassS(P.x - hs, P.y), castPassS(P.x, P.y + hs) - castPassS(P.x, P.y - hs)) / (2.0 * hs);
                float dd = (uT - tp) / max(length(gT), 2.0);
                dd += 1.4 * sin(P.x / 5.3 + uT / 190.0) + 0.9 * sin(P.x / 2.7 - uT / 120.0);
                if (dd >= uB.x * 1.6) { gl_FragColor = molten(P, tp); return; }
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
                if (dd >= Bw) { gl_FragColor = molten(P, tp); return; }
                float u = dd / Bw;
                float n = vnoise(vec2(P.x / 2.4, (P.y - uT * 0.11) / 7.0)) * 0.65 + vnoise(vec2(P.x / 5.5, (P.y - uT * 0.07) / 3.0)) * 0.35;
                vec3 c = mix(uHoney, uMol, smoothstep(0.02, 0.45, u) * (0.85 + 0.2 * n));
                float spec = exp(-pow((u - 0.6) / 0.09, 2.0)) * (0.55 + 0.45 * n);
                c = mix(c, uWhite, spec * 0.75);
                c = mix(c, uWhite, (1.0 - smoothstep(0.0, 0.07, u)) * 0.45);
                // нижний край валика в тени (обращён вниз) — темнее
                c *= 0.78 + 0.22 * smoothstep(0.0, 0.25, u);
                // хвост растушёван: под ним проступает раскалённый литой
                float a = 1.0 - smoothstep(Bw - uB.y, Bw, dd);
                gl_FragColor = vec4(c * a, a) + molten(P, tp) * (1.0 - a);
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
        this.castUniforms(gl, U, 1);
        gl.uniform3fv(U('uGlass'), vec(P.led.back)); gl.uniform3fv(U('uScan'), vec(P.scan));
        const look = this.castLookTexture(gl, 2);
        gl.uniform1i(U('uLook'), 2); gl.uniform2f(U('uLookN'), 512, 1024);
        const CC = this.CAST_COOL;
        gl.uniform4f(U('uCool'), CC.hold, CC.dur, CC.blur, CC.noise);
        const Rg = new Float32Array(28), Ro = new Float32Array(28);
        CC.parts.forEach((q, i) => { Rg.set(q.r, i * 4); Ro.set([q.off, q.scale, q.feather || 20, 0], i * 4); });
        gl.uniform4fv(U('uRg'), Rg); gl.uniform4fv(U('uRo'), Ro);
        const KR = (this._kgl && this._kgl.meta.rings) || [[9, -50, 351, 287, 29], [11, 301, 349, 493, 25], [11, 507, 349, 629, 25]];
        gl.uniform4fv(U('uRing'), new Float32Array([].concat(...KR.slice(0, 3).map(r => r.slice(0, 4)))));
        gl.uniform3f(U('uRingR'), KR[0][4], KR[1][4], KR[2][4]);
        this._castC = { cv, gl, uT: U('uT'), tex: t, uOv: U('uOv'), uOp: U('uOp'), look };
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
    CAST_RUN: { total: 15200, kantAmp: 2.0, kantTau: 3000, shine: 13700, shineMs: 1200, betStep: 200, betGap: 200 },

    // Этап литья — в панель 🐞 алчности: на телефоне консоли нет, а игрок
    // видит только «экран чернеет» (20.11). Строка говорит, где встало.
    castLog(s) {
        this._castInfo = s;
        if (typeof GreedCrumbs !== 'undefined') GreedCrumbs.add('литьё: ' + s);
        if (typeof GreedDebug !== 'undefined' && GreedDebug.render) GreedDebug.render();
    },
    async castRun() {
        const J = GreedJarShop, L = GreedJunkLit, host = L.wrapEl && L.wrapEl.parentElement, opts = L._opts;
        if (!host) { this.castLog('нет гаражного'); return; }
        if (this._cast || this._castWait) return;
        const G = GreedMinigame, gen = G.spinGeneration, t0 = performance.now(), ms = () => Math.round(performance.now() - t0);
        this._castWait = true;
        try {
            this.castLog('заготовка…');
            await (this._prep ? this._mountP : this.prepare(host));
            this.castLog('кант… ' + ms());
            await this._kantP;
            this.castLog('карта течения… ' + ms());
            await this.castFlowReady();
            this.castLog('жар… ' + ms());
            await this.castHeatInit();
            if (!this._castH) this.castLog('жар не собрался ' + ms());
            // идёт выплата (монеты летят, барабаны крутятся) — банка ждёт с
            // расплавом; литьё — когда игры свободны (не дольше 10 с)
            for (let i = 0; i < 100 && G.busy(); i++) { if (i === 0) this.castLog('ждёт выплату…'); await new Promise(r => setTimeout(r, 100)); }
        } catch (e) { console.warn('[литьё]', e); this.castLog('сбой подготовки: ' + (e && e.message)); }
        this._castWait = false;
        // окно закрыли, пока ждали, — литья нет: версия 2 встанет при входе
        if (G.spinGeneration !== gen) return;
        if (!this.gl || !L.wrapEl) {
            // нет заготовки — по-старому: закрыть банку и пересобрать
            J.busy = false; J.close();
            if (typeof GreedDebug !== 'undefined') setTimeout(() => GreedDebug.rebuild(), 1100);
            return;
        }
        let snap = null, dropped = false;
        try {
            this.castLog('снимок… ' + ms());
            snap = this.castSnapshot();
            const empty = this.castSnapEmpty(snap);
            GreedDebug.junkDrop(); dropped = true;
            G.M = this; G.play = { slots: null, wheel: null, pachinko: null };
            this._castPending = true;
            this.castLog('показ версии 2… ' + ms());
            await this.prepTake(host, opts);
            this._castPending = false;
            if (this.meterSet && this.meterValue) this.meterSet(this.meterValue());
            if (!this.castCanvasSnap(snap)) { this.castLog('холст литья не собрался'); this.castEnd(); return; }
            if (empty) this.castLog('снимок гаражного пустой');
        } catch (e) {
            // что бы ни сломалось после снятия гаражного — версия 2 на экране,
            // а не чёрная сцена
            console.warn('[литьё]', e);
            this.castLog('сбой: ' + (e && e.message));
            this._castPending = false;
            if (dropped && this._prep) try { await this.prepTake(host, opts); } catch (e2) { /* что есть */ }
            this.castEnd();
            return;
        }
        // палец — не в аппарат, пока льётся
        const cv = this._castC.cv;
        cv.style.pointerEvents = 'auto';
        ['pointerdown', 'pointermove', 'pointerup'].forEach(k => cv.addEventListener(k, (e) => { e.stopPropagation(); e.preventDefault(); }));
        // банка мерила поле по обёртке гаражного (её больше нет) — поле то же у версии 2
        J.wrap = this.wrapEl;
        const now = performance.now(), Q = J.POUR;
        J.pourStart(now);
        // число монет на скотче: что банка показывала (в превью — ещё ничего)
        const coins = Number.isFinite(+J.shown) && J.shown !== null ? J.shown : (L.jarValue ? L.jarValue() : 0);
        this._cast = { start: now, impact: Q.streamAt + Q.head, coins: Number.isFinite(+coins) ? coins : 0 };
        try { this.castBootPlan(); this.castSchedule(); this.castKant(); this.castHaptics(); } catch (e) { this.castLog('сбой расписания: ' + (e && e.message)); }
        if (!/пустой/.test(this._castInfo || '')) this.castLog('льётся ' + ms());
    },
    // пустой ли снимок (на части телефонов холст WebGL без сохранения буфера
    // читается чёрным): проверка по 64 точкам
    castSnapEmpty(snap) {
        try {
            const g = snap.getContext('2d'), w = snap.width, h = snap.height; let lit = 0;
            for (let i = 0; i < 64; i++) { const d = g.getImageData(Math.floor(w * ((i % 8) + 0.5) / 8), Math.floor(h * ((i >> 3) + 0.5) / 8), 1, 1).data; if (d[3] > 10 && d[0] + d[1] + d[2] > 30) lit++; }
            return lit < 6;
        } catch (e) { return false; }
    },
    // Расписание конца — от того, когда правда остывает (2.10): банка
    // садится в копилку, когда остыл цоколь; ставки — после включения табло;
    // блеск — когда остыл весь аппарат и всё прочее кончилось. Было:
    // постоянные числа — аппарат был готов к 9,5 с, а блеск шёл в 13,7.
    castSchedule() {
        const c = this._cast, J = GreedJarShop.POUR, R = this.CAST_RUN, B = this._boot, live = this.meta.live;
        const pig = live.pig || [262, 530, 338, 616];
        J.toPig = Math.round(c.impact + this.castCoolTime((pig[0] + pig[2]) / 2, (pig[1] + pig[3]) / 2, 0.95) + 200);
        let end = 0;
        for (let y = -40; y <= 630; y += 30) for (let x = 30; x <= 330; x += 30) end = Math.max(end, this.castCoolTime(x, y, 1));
        c.betAt = B ? c.impact + B.small + this.CAST_BOOT.dur.small + R.betGap : 0;
        const betEnd = c.betAt + (this.bets ? this.bets().length + 1 : 5) * R.betStep;
        c.shine = Math.round(Math.max(c.impact + end, J.toPig + J.pigFly + J.sink, betEnd) + 400);
        c.total = c.shine + R.shineMs + 300;
    },
    // кант: жилка пояса вспыхивает, когда её участок «схватился» (c ≈ 0,8) —
    // импульс по кольцу; под расплавом проход фронта не видно (2.10)
    castKant() {
        const K = this._kgl, c = this._cast, R = this.CAST_RUN;
        if (!K || !c) return;
        const slow = this.castSlow();
        K.meta.rings.forEach((rg, i) => {
            const x = Math.max(rg[0], Math.min(rg[2], this.CAST.xi)), y = rg[1];
            const tp = this.castCoolTime(x, y, 0.8), at = c.start + (c.impact + tp) * slow, L = K.meta.len[i];
            this.kantAdd({ game: 'cast', ring: i, s0: this.kantS(i, x, y), at, kind: 0, amp: 1.4, speed: 0.35, reach: L / 2 + 20, tau: 1400, life: L / 2 / 0.35 + 1400 * 4 });
        });
        // последний тёплый вдох всего канта — вместе с блеском
        this.kantAdd({ game: 'cast', ring: -1, s0: 0, at: c.start + c.shine * slow, kind: 1, amp: 0.55, speed: 1, reach: 4000, tau: 800, life: 800 });
    },
    castStep(now) {
        const c = this._cast;
        if (!c || c.t != null) return;
        // сбой кадра литья не должен останавливать цикл кадров аппарата
        try { this.castFrame(now, c); } catch (e) { console.warn('[литьё]', e); this.castLog('сбой кадра: ' + (e && e.message)); this.castEnd(); }
    },
    castFrame(now, c) {
        const t = (now - c.start) / this.castSlow();
        if (t > (c.total || this.CAST_RUN.total)) { this.castEnd(); return; }
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
            const b0 = c.betAt;
            for (let i = 0; i < 4; i++) at(b0 + i * R.betStep, () => H.tick());
        }
        at(c.shine, () => H.notify('success'));
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
        const R = this.CAST_RUN, u = ((now - c.start) / this.castSlow() - (c.shine || R.shine)) / R.shineMs;
        if (u <= 0 || u >= 1) return t;
        return { x: (t.x || 0) + 0.8 * (2 * u - 1) * Math.sin(Math.PI * u), y: t.y || 0 };
    },
    // окно закрыли посреди литья: всё снять; версия 2 уже куплена и стоит
    castAbort() { if (this._cast) this.castEnd(); },
    castEnd() {
        if (this._cast && !/сбой|пуст|не собрал/.test(this._castInfo || '')) this.castLog('прошло');
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
        // экран включается, когда его участок остыл (отливка — 2.10)
        const B = this.CAST_BOOT, L = this.meta.live, T = (x, y) => this.castCoolTime(x, y, 1) + 150;
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
