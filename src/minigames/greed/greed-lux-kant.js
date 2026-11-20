// ================= АППАРАТ АЛЧНОСТИ, ВЕРСИЯ 2: КАНТ СВЕТИТСЯ САМ =================
// План 31, разд. 5в. Первая маркиза — огоньки-спрайты по канту — игрок
// назвал искусственными и дешёвыми (19.11): пятно не знало материала, ровный
// пунктир читался гирляндой. Теперь кант — золотая жилка с эмалевой
// сердцевиной, и выигрыш пускает по ней импульс энергии: сердцевина
// раскаляется (кривая накала), золото пылает изнутри (ярче на скатах), лак
// и бордо рядом ловят отражение по своему рельефу, за импульсом тянется
// остывание, как у нити.
//
// Всё, что от времени не зависит, запечено (tools/greed-lux-sketch/kant.py):
// где точка вдоль жилки, как далеко от неё, насколько поверхность повёрнута
// к жилке и как блестит. Здесь — только бег импульсов.
//
// Свой холст WebGL над корпусом, сложение — plus-lighter: свет по физике
// добавочный, так что это та же картинка, что дала бы формула в шейдере
// корпуса, — но без перерисовки тяжёлого корпуса и его живых деталей. Пока
// событий нет — ни одного кадра.
//
// События (до MAX): кольцо, точка выхода s0, время, вид, сила/скорость/
// дальность/остывание. Шейдер складывает их с мягким насыщением: новое не
// сбрасывает идущие, встречные волны ярче там, где сошлись.
Object.assign(GreedLux, {
    KANT: {
        // 24 события: три крупных выигрыша внахлёст (по 11) почти целиком;
        // массивы uniform 2×24 vec4 — далеко под пределом телефонов
        max: 24, fps: 30, reach: 16,
        // откуда выходит импульс: кольцо (0 — верхний пояс, 1 — средний,
        // 2 — цоколь) и точка корпуса, к которой ищется ближайшее место жилки.
        // Верх и бока канта закрыты рамкой из монет (окно мини-игры), поэтому
        // источник — на видимой горизонтали под игрой, а не у самой игры.
        from: { wheel: [0, 100, 287], pachinko: [0, 273, 287], slots: [1, 190, 493] },
        // Ступени (те же, что у игр). Длины колец ~880–1310 ед.
        // 0 — возврат ставки: участок у игры теплеет и остывает, без бега.
        breath: { amp: 0.55, reach: 34, ms: 520 },
        // 1 — импульс в обе стороны, гаснет на полпути к встрече (reach = ¼ круга)
        // 2 — обходит пояс целиком и встречается сам с собой вспышкой;
        //     соседние пояса подхватывают слабее, с задержкой на каждый пояс
        // 3 — n импульсов подряд по всем поясам, затем маркиза: бегущая волна
        //     яркости вдоль всей жилки (wave — длина волны, period — её ход)
        tiers: [null,
            { amp: 1.1, speed: 0.45, reach: 0.25, tau: 380 },
            { amp: 1.35, speed: 0.75, reach: 0.5, tau: 450, meet: 0.9, next: { amp: 0.6, delay: 140 } },
            { amp: 1.6, speed: 0.95, reach: 0.5, tau: 600, meet: 1.1, n: 3, gap: 320, next: { amp: 0.95, delay: 110 },
              // рамка экрана и обод колбы — только здесь: весь аппарат горит
              frames: { rings: [3, 4], amp: 1.0, delay: 260 },
              marquee: { at: 950, ms: 2700, amp: 0.7, wave: 150, period: 1100 } }
        ]
    },

    kantMount(wrap) {
        const cv = document.createElement('canvas');
        cv.width = this.cv.width; cv.height = this.cv.height;
        cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;background:none;pointer-events:none';
        cv.style.mixBlendMode = 'plus-lighter';
        if (cv.style.mixBlendMode !== 'plus-lighter') cv.style.mixBlendMode = 'screen';
        wrap.insertBefore(cv, this.ic);
        this.kantCv = cv; this._kEv = []; this.kantAll = 0; this._kWas = false; this._kAt = 0;
        const DIR = this.dir(), img = (n) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = DIR + n + '.png'; });
        this._kantP = Promise.all([img('kant-s'), img('kant-f'), fetch(DIR + 'kant.json').then(r => r.json())])
            .then(([a, f, meta]) => { if (this.kantCv === cv) this.kantGl(a, f, meta); })
            .catch(e => console.warn('[кант]', e));
    },
    kantGl(imA, imF, meta) {
        // Плотность холста света — как у карт канта (S), а не как у холста
        // корпуса (K до 3,25): мельче деталей в картах нет, а пикселей в 2,25
        // раза меньше. Замер (программный GL, три крупных внахлёст): кадр
        // упирался в этот шейдер, а не в смешение слоёв.
        const kk = this._kk = Math.min(this.K, this.S || this.K), FW = this.cv.width / this.K, FH = this.cv.height / this.K;
        this.kantCv.width = Math.round(FW * kk); this.kantCv.height = Math.round(FH * kk);
        const gl = this.kantCv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
        if (!gl) return;
        const P = PALETTE.greedLux.kant, vec = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
        const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn('[кант]', gl.getShaderInfoLog(s)); return s; };
        const p = gl.createProgram();
        gl.attachShader(p, sh(gl.VERTEX_SHADER, 'attribute vec2 a; varying vec2 v; void main(){ v = vec2(a.x * 0.5 + 0.5, 0.5 - a.y * 0.5); gl_Position = vec4(a, 0.0, 1.0); }'));
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, `
            #ifdef GL_FRAGMENT_PRECISION_HIGH
            precision highp float;
            #else
            precision mediump float;
            #endif
            uniform sampler2D uS, uF; uniform vec4 uE[${this.KANT.max}], uP[${this.KANT.max}];
            uniform float uN, uAll, uLen4; uniform vec4 uLen; uniform vec3 uC0, uC1, uC2; uniform vec4 uBall; uniform vec2 uWH; varying vec2 v;
            // накал места жилки: кольцо ring, доля круга s, ex — путь по
            // завитку от стыка (свет втекает в спираль позже, чем проходит стык)
            float heat(float ring, float s, float ex){
                float L = ring < 0.5 ? uLen.x : (ring < 1.5 ? uLen.y : (ring < 2.5 ? uLen.z : (ring < 3.5 ? uLen.w : uLen4))), e = uAll;
                for (int i = 0; i < ${this.KANT.max}; i++) {
                    if (float(i) >= uN) break;
                    vec4 E = uE[i], Q = uP[i];
                    // кольцо −1 — событие на всю жилку (маркиза ступени 3)
                    if ((E.x > -0.5 && abs(E.x - ring) > 0.5) || E.z < 0.0) continue;
                    float ds = abs(s - E.y); ds = min(ds, 1.0 - ds) * L + ex;
                    if (E.w < 0.5) {
                        // импульс: фронт (гаусс) и остывание за ним; дальше reach — гаснет
                        float f = E.z * Q.y, front = exp(-pow((ds - f) / 9.0, 2.0));
                        float tp = (f - ds) / Q.y, after = tp > 0.0 ? exp(-tp / Q.w) : 0.0;
                        float env = 1.0 - smoothstep(Q.z * 0.6, Q.z, ds);
                        e += Q.x * max(front, 0.75 * after) * env * smoothstep(0.0, 60.0, E.z);
                    } else if (E.w < 1.5) {
                        // вдох: участок у игры теплеет и остывает, без бега
                        e += Q.x * exp(-ds / Q.z) * sin(min(1.0, E.z / Q.w) * 3.14159);
                    } else {
                        // маркиза: бегущая волна яркости вдоль жилки (не точки);
                        // длина волны в единицах, чтобы на всех поясах одна
                        float m = 0.5 + 0.5 * sin(6.28318 * ((s * L + ex) / Q.z - E.z / Q.y));
                        float env = smoothstep(0.0, 300.0, E.z) * (1.0 - smoothstep(Q.w - 700.0, Q.w, E.z));
                        e += Q.x * (0.3 + 0.7 * m * m) * env;
                    }
                }
                return 1.0 - exp(-e);
            }
            void main(){
                vec3 a = texture2D(uS, v).rgb;
                if (a.b < 0.002) { gl_FragColor = vec4(0.0); return; }
                float b = floor(a.b * 255.0 + 0.5), ring = mod(b, 8.0) - 1.0, cq = floor(b / 8.0);
                float s = (a.r * 65280.0 + a.g * 255.0) / 65535.0 * ${meta.rings.length.toFixed(1)} - ring;
                float ex = cq > 0.5 ? (cq - 1.0) * ${(meta.estep || 2.5).toFixed(2)} : 0.0;
                vec3 f = texture2D(uF, v).rgb;
                if (f.r > 0.99) { gl_FragColor = vec4(0.0); return; }
                // шар рычага — живая деталь корпуса поверх канта (кадры: свет
                // ложился на шар); он ездит, поэтому вырез считается здесь
                float db = length((v - uBall.xy) * uWH) - uBall.z;
                if (db < 0.0) { gl_FragColor = vec4(0.0); return; }
                float H = heat(ring, s, ex) * smoothstep(0.0, 1.5, db);
                if (H < 0.003) { gl_FragColor = vec4(0.0); return; }
                float d = f.r * 255.0 / 15.0;
                vec3 col = mix(uC0, uC1, smoothstep(0.0, 0.55, H));
                col = mix(col, uC2, smoothstep(0.62, 1.0, H));
                // завиток — роспись золотом, не эмалевая жилка: сердцевина тише
                float cf = cq > 0.5 ? 1.0 : 0.0, core = (1.0 - smoothstep(0.2, 0.8, d)) * (1.0 - 0.6 * cf);
                // и ореол уже: у спирали витки близко, широкий сливал её в пятно
                float halo = exp(-d / mix(1.7, 0.8, cf)) * (1.0 - 0.5 * cf);
                vec3 c = col * H * (core * 2.2 + halo * 0.5 + f.b * 2.6 + f.g * 1.7);
                c = min(c, vec3(1.0));
                gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
            }`));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('[кант]', gl.getProgramInfoLog(p)); return; }
        gl.useProgram(p);
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); this._kBuf = buf;
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(p, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const tex = (im, unit, filt) => {
            const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        };
        tex(imA, 0, gl.NEAREST); tex(imF, 1, gl.LINEAR);
        const U = (n) => gl.getUniformLocation(p, n);
        gl.uniform1i(U('uS'), 0); gl.uniform1i(U('uF'), 1);
        gl.uniform4fv(U('uLen'), meta.len.slice(0, 4)); gl.uniform1f(U('uLen4'), meta.len[4] || 1); gl.uniform3fv(U('uC0'), vec(P.ember)); gl.uniform3fv(U('uC1'), vec(P.amber)); gl.uniform3fv(U('uC2'), vec(P.hot));
        this._kgl = { gl, p, loc, buf, uE: U('uE'), uP: U('uP'), uN: U('uN'), uAll: U('uAll'), uBall: U('uBall'), meta };
        gl.uniform2f(U('uWH'), FW, FH);
        this._kRing = null;
    },

    // ---------- события ----------
    // место жилки (кольцо i), ближайшее к точке корпуса [x, y]: доля круга
    kantS(i, x, y) {
        const M = this._kgl && this._kgl.meta;
        if (!M) return 0;
        const [x0, y0, x1, y1, r] = M.rings[i], w = x1 - x0 - 2 * r, h = y1 - y0 - 2 * r, q = Math.PI * r / 2, L = M.len[i];
        // перебор по контуру — раз на событие, дёшево
        let best = 0, bd = 1e9;
        for (let k = 0; k < 400; k++) {
            const t = k / 400 * L; let px, py, d = t;
            if (d < w) { px = x0 + r + d; py = y0; }
            else if ((d -= w) < q) { const a = -Math.PI / 2 + d / r; px = x1 - r + Math.cos(a) * r; py = y0 + r + Math.sin(a) * r; }
            else if ((d -= q) < h) { px = x1; py = y0 + r + d; }
            else if ((d -= h) < q) { const a = d / r; px = x1 - r + Math.cos(a) * r; py = y1 - r + Math.sin(a) * r; }
            else if ((d -= q) < w) { px = x1 - r - d; py = y1; }
            else if ((d -= w) < q) { const a = Math.PI / 2 + d / r; px = x0 + r + Math.cos(a) * r; py = y1 - r + Math.sin(a) * r; }
            else if ((d -= q) < h) { px = x0; py = y1 - r - d; }
            else { d -= h; const a = Math.PI + d / r; px = x0 + r + Math.cos(a) * r; py = y0 + r + Math.sin(a) * r; }
            const dd = Math.hypot(px - x, py - y);
            if (dd < bd) { bd = dd; best = k / 400; }
        }
        return best;
    },
    // ev: { ring, s0, at, kind (0 импульс, 1 вдох, 2 маркиза), amp, speed (ед./мс), reach (ед.), tau (мс), life (мс) }
    kantAdd(ev) {
        if (!this._kEv) return;
        this._kEv.push(ev);
        // переполнение — уходит то, что кончится раньше всех (оно почти
        // остыло), а не первое по списку: иначе свежий выигрыш стирал бы
        // ещё не начавшиеся импульсы соседнего
        while (this._kEv.length > this.KANT.max) {
            let j = 0;
            this._kEv.forEach((e, i) => { if (e.at + e.life < this._kEv[j].at + this._kEv[j].life) j = i; });
            this._kEv.splice(j, 1);
        }
    },

    // Выигрыш game ступени tier (0..3) — набор событий. t0 — время выхода
    // (для кадров; по умолчанию сейчас). Каждая игра добавляет своё и ничего
    // не сбрасывает: два выигрыша внахлёст складываются в шейдере.
    kantPulse(game, tier, t0) {
        const K = this.KANT, M = this._kgl && this._kgl.meta, F = K.from[game];
        if (!M || !F || !this._kEv) return;
        const at = t0 != null ? t0 : performance.now(), [home, fx, fy] = F;
        const s0 = (i) => this.kantS(i, fx, fy);
        if (!tier) {
            const B = K.breath;
            this.kantAdd({ game, ring: home, s0: s0(home), at, kind: 1, amp: B.amp, speed: 1, reach: B.reach, tau: B.ms, life: B.ms });
            return;
        }
        const T = K.tiers[Math.min(3, tier)];
        const pulse = (ring, a, amp, meet) => {
            const L = M.len[ring], reach = L * T.reach + 20;
            this.kantAdd({ game, ring, s0: s0(ring), at: a, kind: 0, amp, speed: T.speed, reach, tau: T.tau, life: reach / T.speed + T.tau * 4 });
            // встреча с самим собой на той стороне: вспышка в точке схода
            if (meet && T.meet) {
                const s1 = (s0(ring) + 0.5) % 1, dt = L / 2 / T.speed - 40;
                this.kantAdd({ game, ring, s0: s1, at: a + dt, kind: 1, amp: amp * T.meet / T.amp, speed: 1, reach: 40, tau: 520, life: 520 });
            }
        };
        const n = T.n || 1;
        for (let k = 0; k < n; k++) {
            const a = at + k * (T.gap || 0);
            // вспышка схода — у первого импульса (у следующих она тонет в общем накале)
            pulse(home, a, T.amp * (k ? 0.8 : 1), !k);
            // соседние пояса — через стыки, слабее и позже на каждый пояс
            if (T.next) [0, 1, 2].forEach(j => { if (j !== home) pulse(j, a + T.next.delay * Math.abs(j - home), T.next.amp * (k ? 0.8 : 1), !k && n === 1); });
        }
        if (T.frames) T.frames.rings.forEach(j => { if (M.len[j]) pulse(j, at + T.frames.delay, T.frames.amp, false); });
        if (T.marquee) {
            const Q = T.marquee;
            this.kantAdd({ game, ring: -1, s0: 0, at: at + Q.at, kind: 2, amp: Q.amp, speed: Q.period, reach: Q.wave, tau: Q.ms, life: Q.ms });
        }
    },

    // ---------- кадр ----------
    kantStep(now) {
        const K = this._kgl;
        if (!K || !this._kEv) return;
        this._kEv = this._kEv.filter(e => now - e.at < e.life);
        // события «на потом» (вторые импульсы, маркиза) кадров не требуют
        // литьё (greed-lux-cast.js): жар литого рисуется этим же холстом
        const cast = !!(this._cast && this._castH);
        const live = this._kEv.some(e => now >= e.at) || this.kantAll > 0 || cast;
        if (!live && !this._kWas) return;
        if (live && now - this._kAt < 1000 / this.KANT.fps - 2) return;
        this._kAt = now; this._kWas = live;
        const gl = K.gl, cv = this.kantCv;
        gl.viewport(0, 0, cv.width, cv.height);
        gl.disable(gl.SCISSOR_TEST);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        if (!live) return;
        if (cast) {
            // жар — на всё поле, кант — поверх сложением (свет к свету)
            this.castHeatDraw(gl, now);
            gl.useProgram(K.p); gl.bindBuffer(gl.ARRAY_BUFFER, K.buf); gl.vertexAttribPointer(K.loc, 2, gl.FLOAT, false, 0, 0);
            gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        } else gl.disable(gl.BLEND);
        const n = this._kEv.length, E = new Float32Array(this.KANT.max * 4), Q = new Float32Array(this.KANT.max * 4);
        this._kEv.forEach((e, i) => {
            E.set([e.ring, e.s0, now - e.at, e.kind], i * 4);
            Q.set([e.amp, e.speed, e.reach, e.tau], i * 4);
        });
        const B = (this.meta.live && this.meta.live.ballAt) || [0, -999, 0], W = cv.width / this._kk, H = cv.height / this._kk;
        gl.uniform4f(K.uBall, B[0] / W, (B[1] + (this.ballDy || 0) - this.Y0) / H, B[2] + 0.5, 0);
        gl.uniform4fv(K.uE, E); gl.uniform4fv(K.uP, Q); gl.uniform1f(K.uN, n); gl.uniform1f(K.uAll, this.kantAll || 0);
        // только полосы вдоль колец (жилка ± reach): остальное поле — пусто
        gl.enable(gl.SCISSOR_TEST);
        const k = this._kk, R = this.KANT.reach + 1, Hc = cv.height;
        const rect = (x0, y0, x1, y1) => {
            const X = Math.max(0, Math.floor(x0 * k)), Y = Math.max(0, Math.floor((y0 - this.Y0) * k));
            const X1 = Math.min(cv.width, Math.ceil(x1 * k)), Y1 = Math.min(Hc, Math.ceil((y1 - this.Y0) * k));
            if (X1 > X && Y1 > Y) { gl.scissor(X, Hc - Y1, X1 - X, Y1 - Y); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
        };
        const all = K.meta.rings.map((r, i) => i);
        const rings = new Set(this.kantAll > 0 || this._kEv.some(e => e.ring < 0) ? all : this._kEv.map(e => e.ring));
        // завитки у стыков — своим прямоугольником при своём кольце
        (K.meta.curls || []).forEach(c => { if (rings.has(c[0])) rect(c[1], c[2], c[3], c[4]); });
        rings.forEach(i => {
            const [x0, y0, x1, y1] = K.meta.rings[i];
            rect(x0 - R, y0 - R, x1 + R, y0 + R); rect(x0 - R, y1 - R, x1 + R, y1 + R);
            rect(x0 - R, y0 + R, x0 + R, y1 - R); rect(x1 - R, y0 + R, x1 + R, y1 - R);
        });
    }
});
