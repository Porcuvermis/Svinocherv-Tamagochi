// ================= АППАРАТ АЛЧНОСТИ, ВЕРСИЯ 2 =================
// Литой премиум-аппарат (docs/plan/31-greed-premium.md): стоит в мини-игре
// вместо гаражного, когда куплена версия 2 (Backend.greedLevel('slots') ≥ 2)
// или вид 2 включён в 🐞 (GreedSkin.v2). Тот же интерфейс, что у
// GreedJunkLit: экран алчности (greed.js) не знает, какой аппарат стоит.
//
// Перенос идёт этапами (план 31, «Перенос версии 2 в игру»). Этап 1 —
// каркас: корпус из запечённых карт (tools/greed-lux-sketch: machine.py →
// bake-preview.py → src/minigames/greed/lux/: цвет, материал — R глянец,
// G стекло, B золото, — свечение с ореолом, тень, рельеф 16 бит), блеск
// от настоящего наклона, экранчики колеса. Телефон считает только то, что
// зависит от наклона: отражения студии, грань золота, искры, сияние.
// Перерисовка — только когда наклон сдвинулся или идёт эффект экранчика.
//
// Экранчики колеса — сами сектора (решение игрока): раз в 6–10 с один
// видимый значок сбоит — цифровой сбой, рассыпание, перерисовка.
// Было: «Эскиз v2» — отдельный просмотр во весь экран из 🐞 (10.11).
const GreedLux = {
    DIR: 'src/minigames/greed/lux/',
    W: 360, Y0: -57, H: 696, Q: 1.9,
    WHEEL: { cx: 22, cy: 118, r: 150 },
    DUR: { glitch: 320, scatter: 750, redraw: 450, win: 1100 },
    // скорость досыпания лотка (монет в секунду) — её читает экран алчности
    TRAY: { rate: 30 },

    // Аппарат в контейнер. Собирается один раз; дальше обёртка переезжает.
    mount(container, opts) {
        opts = opts || {};
        this._opts = opts;
        ['onPull', 'onSpinDone', 'onPach', 'onPachDone', 'onWheel', 'onWheelDone', 'canReady'].forEach(k => { this[k] = opts[k] || null; });
        if (typeof GreedDebug !== 'undefined' && GreedDebug.attach) GreedDebug.attach(container);
        if (this.wrapEl) {
            container.appendChild(this.wrapEl);
            this.fit(container);
            this.run();
            return this._mountP;
        }
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;flex:none';
        container.appendChild(wrap);
        this.wrapEl = wrap;
        this.fit(container);
        const mk = (z) => { const c = document.createElement('canvas'); c.style.cssText = `position:absolute;inset:0;width:100%;height:100%;z-index:${z};background:none;pointer-events:none`; wrap.appendChild(c); return c; };
        this.cv = mk(0); this.ic = mk(1); this.icx = this.ic.getContext('2d');
        this._mountP = (async () => {
            const meta = await fetch(this.DIR + 'lux.json').then(r => r.json());
            if (this.wrapEl !== wrap) return false;
            this.meta = meta;
            const [w, h] = meta.size;
            this.S = w / this.W;
            this.cv.width = this.ic.width = w; this.cv.height = this.ic.height = h;
            // корпус и живые части (шар рычага, диск колеса, указатель) —
            // по пять карт каждая
            const names = ['albedo', 'height', 'mat', 'emit', 'shade'];
            this._setNames = ['body'].concat(meta.live ? ['ball', 'disc', 'ptr'] : []);
            const files = [].concat(...this._setNames.map(k => names.map(n => (k === 'body' ? '' : k + '-') + n)));
            const imgs = await Promise.all(files.map(n => new Promise((res, rej) => {
                const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = this.DIR + n + '.png';
            })));
            if (this.wrapEl !== wrap || !this.glInit(imgs)) return false;
            this.tilt = { x: 0, y: 0 }; this.drawn = null;
            if (this.playInit) this.playInit(wrap);
            this.step(performance.now());
            this.run();
            return true;
        })();
        return this._mountP;
    },
    // Размер — как у гаражного: поле во весь проём рамки по ширине, по
    // высоте — видимая зона (docs/plan/29-greed-layout.md).
    fit(container) {
        const cw = container.clientWidth, ch = container.clientHeight;
        if (!cw || !ch || !this.wrapEl) return;
        const k = Math.min(cw / this.W, ch / this.H);
        this.wrapEl.style.width = (this.W * k).toFixed(1) + 'px';
        this.wrapEl.style.height = (this.H * k).toFixed(1) + 'px';
        if (this.ledFit) this.ledFit();
    },
    // Цикл кадров: стоит, пока обёртка не на странице.
    run() {
        if (this.raf || !this.gl) return;
        const loop = (now) => {
            if (!this.wrapEl || !this.wrapEl.isConnected || !this.gl) { this.raf = null; return; }
            this.step(now);
            this.raf = requestAnimationFrame(loop);
        };
        this.raf = requestAnimationFrame(loop);
    },
    // собран и нарисован — покров из монет можно снимать
    settled() {
        return Promise.resolve(this._mountP).then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    },
    // Снять со страницы целиком: контекст с текстурами — назад сразу.
    unmount() {
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = null;
        if (this.gl) { const ext = this.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
        this.gl = null;
        if (this.wrapEl) this.wrapEl.remove();
        this.wrapEl = null; this._mountP = null; this.meta = null;
        this.reels = null; this._lv = null; this.ledCv = null; this.ledGrid = null; this.lampCv = null; this._wheel = null; this.fx = null;
    },

    // ---------- то, что версия 2 получит на своих этапах ----------
    // Пока пустое: экран алчности зовёт их у любого аппарата.
    jarHold() {},
    growDrop() {},
    coinIn() {},
    trayPour() {},
    meterSet() {},
    meterValue() {
        const max = GameState.maxValue('greed') || 100;
        return Math.max(0, Math.min(1, GameState.sinValue('greed') / max));
    },

    // ---------- свет ----------
    cap(draw) {
        const c = document.createElement('canvas'); c.width = c.height = 256;
        draw(c.getContext('2d')); return c;
    },
    glInit(imgs) {
        const L = PALETTE.greedLux;
        const stops = (g, list) => { list.forEach(([o, col]) => g.addColorStop(o, col)); return g; };
        const goldCap = this.cap(g => {
            g.fillStyle = stops(g.createLinearGradient(0, 0, 0, 256), L.goldSky); g.fillRect(0, 0, 256, 256);
            g.save(); g.filter = 'blur(1.5px)'; g.fillStyle = L.window;
            g.fillRect(52, 40, 58, 30); g.fillRect(122, 40, 26, 30);
            g.globalAlpha = 0.85; g.fillRect(186, 30, 10, 100);
            g.globalAlpha = 0.5; g.fillRect(30, 180, 200, 5); g.restore();
            g.fillStyle = stops(g.createRadialGradient(128, 128, 96, 128, 128, 128), L.goldRim); g.fillRect(0, 0, 256, 256);
        });
        const lacCap = this.cap(g => {
            g.fillStyle = L.void; g.fillRect(0, 0, 256, 256);
            g.save(); g.filter = 'blur(1.5px)'; g.fillStyle = L.window;
            g.globalAlpha = 0.95; g.fillRect(30, 50, 150, 6);
            g.globalAlpha = 0.6; g.fillRect(190, 24, 6, 110);
            g.globalAlpha = 0.35; g.fillRect(60, 84, 90, 3); g.restore();
            g.fillStyle = stops(g.createRadialGradient(128, 128, 84, 128, 128, 128), L.lacRim); g.fillRect(0, 0, 256, 256);
        });
        // preserveDrawingBuffer: рычаг двигается — перерисовывается только
        // его колонна (scissor), остальное должно остаться с прошлого кадра
        const gl = this.cv.getContext('webgl', { premultipliedAlpha: true, alpha: false, preserveDrawingBuffer: true });
        if (!gl) return false;
        this.gl = gl;
        const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
            if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.warn('[Эскиз v2]', gl.getShaderInfoLog(o)); return o; };
        const p = gl.createProgram();
        // v — точка своих карт (корпуса или спрайта), p — точка корпуса на
        // поле: отражения студии и место на аппарате. uDst — куда на поле
        // ляжет квадрат карт (у корпуса — весь холст).
        // uDst — в единицах поля; uRot — поворот квадрата вокруг его середины
        // (диск колеса), uFld — поле: ширина, высота, верх (Y0).
        gl.attachShader(p, sh(gl.VERTEX_SHADER, `attribute vec2 a; uniform vec4 uDst; uniform vec3 uFld; uniform float uRot; varying vec2 v, p;
            void main(){ vec2 q = a*0.5+0.5; v = vec2(q.x, 1.0 - q.y);
                vec2 c = (uDst.xy + uDst.zw) * 0.5, d = (v - 0.5) * (uDst.zw - uDst.xy);
                float cs = cos(uRot), sn = sin(uRot);
                vec2 f = c + vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);
                p = vec2(f.x / uFld.x, (f.y - uFld.z) / uFld.y);
                gl_Position = vec4(p.x*2.0-1.0, 1.0-p.y*2.0, 0, 1); }`));
        const sp = L.spark.map(n => n.toFixed(3)).join(','), ha = L.halo.map(n => n.toFixed(3)).join(',');
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, `
            #ifdef GL_FRAGMENT_PRECISION_HIGH
            precision highp float;
            #else
            precision mediump float;
            #endif
            uniform sampler2D uA, uH, uM, uE, uS, uG, uL; uniform vec2 uTex, uTilt; uniform float uUnit, uShadow, uRot, uFast, uAlpha, uEmit; varying vec2 v, p;
            // уклон карты — в уклон на поле: карта спрайта повёрнута на uRot
            vec2 rot(vec2 q){ float cs = cos(uRot), sn = sin(uRot); return vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y); }
            float h(vec2 q){ vec4 t = texture2D(uH, q); return (t.r * 65280.0 + t.g * 255.0) / 65535.0 * 64.0; }
            float gm(vec2 q){ return texture2D(uM, q).b; }
            vec2 h2(vec2 c){ return vec2(fract(sin(dot(c, vec2(12.99, 78.23))) * 43758.5), fract(sin(dot(c, vec2(39.35, 11.13))) * 24634.6)); }
            vec2 noise2(vec2 q){ vec2 i = floor(q), f = q - i; f = f*f*(3.0-2.0*f);
                return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y) - 0.5; }
            vec2 refl(vec3 n, vec2 pos){ vec3 nt = normalize(n + vec3(uTilt, 0.0));
                return clamp(vec2(nt.x, -nt.y) * 0.46 + 0.5 + (pos - 0.5) * vec2(0.34, 0.5), 0.0, 1.0); }
            void main(){
                float al = texture2D(uA, v).a;
                // тень спрайта: его силуэт темнит то, что под ним
                if (uShadow > 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, al * uShadow); return; }
                float st = 4.0 / uUnit;
                float dx = (h(v + vec2(uTex.x*2.0, 0.0)) - h(v - vec2(uTex.x*2.0, 0.0))) / st;
                float dy = (h(v + vec2(0.0, uTex.y*2.0)) - h(v - vec2(0.0, uTex.y*2.0))) / st;
                vec2 gr = rot(vec2(-dx, dy) * vec2(1.0, -1.0)) * vec2(1.0, -1.0);
                vec3 n = normalize(vec3(gr, 1.0));
                vec3 a = texture2D(uA, v).rgb; vec4 m = texture2D(uM, v);
                float G = m.b;
                vec3 Ld = normalize(vec3(-0.42, 0.5, 0.76) + vec3(uTilt * 0.6, 0.0));
                float dif = clamp(dot(n, Ld), 0.0, 1.0) / 0.76;
                vec3 c;
                if (G > 0.5) {
                    float gx = gm(v + vec2(uTex.x*1.5, 0.0)) - gm(v - vec2(uTex.x*1.5, 0.0));
                    float gy = gm(v + vec2(0.0, uTex.y*1.5)) - gm(v - vec2(0.0, uTex.y*1.5));
                    vec2 gg = rot(vec2(-gx, gy) * vec2(1.0, -1.0)) * vec2(1.0, -1.0);
                    vec3 nb = normalize(n + vec3(gg, 0.0) * 0.85);
                    nb = normalize(nb + vec3(noise2(v / uTex / (10.0 * uUnit)), 0.0) * 0.08);
                    c = texture2D(uG, refl(nb, p)).rgb * (a / vec3(0.84, 0.68, 0.32));
                    c = pow(c, vec3(1.08)) * (0.62 + 0.38 * dif);
                } else if (m.g > 0.5) {
                    c = a * (0.45 + 0.55 * dif) + texture2D(uL, refl(n, p)).rgb * 0.6;
                } else {
                    float lum = max(a.r, max(a.g, a.b));
                    c = a * (0.30 + 0.80 * dif) + texture2D(uL, refl(n, p)).rgb * m.r * 0.6 * (0.4 + 1.2 * lum);
                }
                c *= texture2D(uS, v).r;
                c += texture2D(uE, v).rgb * uEmit;
                // в движении (крутится диск) — без сияния и искр: в мелькании
                // их не видно, а это самая дорогая часть кадра
                if (uFast > 0.5) { gl_FragColor = vec4(c * al, al) * uAlpha; return; }
                float glow = 0.0;
                for (int i = 0; i < 10; i++) { float t = float(i) * 0.6283;
                    vec2 q = v + vec2(cos(t), sin(t)) * uTex * 2.3 * uUnit;
                    if (gm(q) > 0.5) { vec3 rq = texture2D(uG, refl(vec3(0.0, 0.0, 1.0), q)).rgb; glow += max(0.0, dot(rq, vec3(0.33)) - 0.7); } }
                c += vec3(${ha}) * glow * 0.14 * (1.0 - G * 0.6);
                vec2 cellSz = vec2(10.0 * uUnit), pc = v / uTex;
                for (int oy = -1; oy <= 1; oy++) for (int ox = -1; ox <= 1; ox++) {
                    vec2 cell = floor(pc / cellSz) + vec2(float(ox), float(oy));
                    vec2 spp = (cell + 0.2 + 0.6 * h2(cell)) * cellSz, suv = spp * uTex;
                    if (gm(suv) < 0.5) continue;
                    vec3 rq = texture2D(uG, refl(vec3(noise2(suv / uTex / (10.0 * uUnit)) * 0.16, 1.0), suv)).rgb;
                    float hot = smoothstep(0.86, 0.99, dot(rq, vec3(0.33)));
                    if (hot <= 0.0) continue;
                    vec2 d = (pc - spp) / uUnit * 3.0;
                    float rays = exp(-abs(d.y) * 1.1) * exp(-abs(d.x) * 0.11) + exp(-abs(d.x) * 1.1) * exp(-abs(d.y) * 0.11);
                    c += vec3(${sp}) * hot * (rays * 0.85 + exp(-length(d) * 0.45) * 1.2);
                }
                gl_FragColor = vec4(c * al, al);
            }`));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('[Эскиз v2]', gl.getProgramInfoLog(p)); return false; }
        gl.useProgram(p);
        this.prog = p;
        const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        // Комплект карт (корпус — units 0–4, шар — 7–11) и общие отражения
        // студии (5, 6). Карты корпуса сами по себе непрозрачны, у спрайта —
        // прозрачность вне рисунка (премножение — при заливке).
        const U = { A: gl.getUniformLocation(p, 'uA'), H: gl.getUniformLocation(p, 'uH'), M: gl.getUniformLocation(p, 'uM'),
            E: gl.getUniformLocation(p, 'uE'), S: gl.getUniformLocation(p, 'uS') };
        const tex = (im, unit, nearest) => {
            const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
            // рельеф упакован в два байта — только ближайший тексел
            const f = nearest ? gl.NEAREST : gl.LINEAR;
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            return t;
        };
        // Комплект привязывается к units 0–4 на время своего рисунка (quad):
        // постоянных слотов на все комплекты у видеокарты телефона нет (16).
        const set = (list) => ({ t: list.map((im, i) => tex(im, 0, i === 1)), w: list[1].width, h: list[1].height });
        const names = this._setNames || ['body'];
        this.sets = {};
        names.forEach((k, j) => { this.sets[k] = set(imgs.slice(j * 5, j * 5 + 5)); });
        tex(goldCap, 5); tex(lacCap, 6);
        gl.uniform1i(gl.getUniformLocation(p, 'uG'), 5); gl.uniform1i(gl.getUniformLocation(p, 'uL'), 6);
        gl.uniform1f(gl.getUniformLocation(p, 'uUnit'), this.S);
        [U.A, U.H, U.M, U.E, U.S].forEach((u, i) => gl.uniform1i(u, i));
        gl.uniform3f(gl.getUniformLocation(p, 'uFld'), this.W, this.H, this.Y0);
        this.U = Object.assign(U, { tex: gl.getUniformLocation(p, 'uTex'), dst: gl.getUniformLocation(p, 'uDst'), shadow: gl.getUniformLocation(p, 'uShadow'),
            rot: gl.getUniformLocation(p, 'uRot'), fast: gl.getUniformLocation(p, 'uFast'),
            alpha: gl.getUniformLocation(p, 'uAlpha'), emit: gl.getUniformLocation(p, 'uEmit') });
        // доля прохода (смаз — среднее нескольких) и сила свечения экранов
        gl.uniform1f(this.U.alpha, 1); gl.uniform1f(this.U.emit, 1);
        this.uTilt = gl.getUniformLocation(p, 'uTilt');
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        return true;
    },
    // Квадрат комплекта set на поле: x, y, w, h — в единицах поля; rot —
    // поворот вокруг его середины. shadow > 0 — только силуэт, темнит то,
    // что под ним.
    quad(set, x, y, w, h, shadow, rot) {
        const gl = this.gl, U = this.U;
        if (this._bound !== set) {
            set.t.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); });
            this._bound = set;
        }
        gl.uniform2f(U.tex, 1 / set.w, 1 / set.h);
        gl.uniform4f(U.dst, x, y, x + w, y + h);
        gl.uniform1f(U.shadow, shadow || 0);
        gl.uniform1f(U.rot, rot || 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },

    step(now) {
        // наклон: сглажен здесь (turn() — без сглаживания), мёртвая зона —
        // как у аппарата: дрожь руки не гоняет шейдер
        const t = typeof Tilt !== 'undefined' ? Tilt.turn() : { x: 0, y: 0 };
        this.tilt.x += ((t.x || 0) - this.tilt.x) * 0.2;
        this.tilt.y += ((t.y || 0) - this.tilt.y) * 0.2;
        const tx = Math.max(-1, Math.min(1, this.tilt.x)) * 0.42, ty = Math.max(-1, Math.min(1, -this.tilt.y)) * 0.34;
        // сначала механика (рычаг, ленты), потом — что перерисовать: наклон
        // сдвинулся — весь корпус, иначе только то, что двигалось
        if (this.playStep) this.playStep(now);
        if (!this.drawn || Math.abs(tx - this.drawn[0]) > 0.004 || Math.abs(ty - this.drawn[1]) > 0.004) {
            this.gl.uniform2f(this.uTilt, tx, ty);
            this.drawn = [tx, ty];
            this._ballDirty = this._wheelDirty = false;
            this.paint();
        } else if (this.livePaint) this.livePaint(now);
        // экранчики колеса (greed-lux-wheel.js)
        if (this.iconsStep) this.iconsStep(now);
    },

    // Весь корпус и всё живое поверх (шар рычага). r — участок поля
    // {x, y, w, h}: перерисовать только его (scissor), остальное держит
    // холст (preserveDrawingBuffer).
    paint(r) {
        const gl = this.gl;
        if (!gl) return;
        if (r) this.scissor(r);
        this.quad(this.sets.body, 0, this.Y0, this.W, this.H);
        if (this.paintLive) this.paintLive();
        if (r) gl.disable(gl.SCISSOR_TEST);
    },
    // рисовать только в участке поля r {x, y, w, h}
    scissor(r) {
        const gl = this.gl, k = this.cv.width / this.W, x0 = Math.max(0, Math.floor(r.x * k)), y1 = Math.min(this.cv.height, Math.ceil((r.y + r.h - this.Y0) * k));
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(x0, this.cv.height - y1, Math.ceil(r.w * k) + 1, Math.ceil(r.h * k) + 1);
    },

};
