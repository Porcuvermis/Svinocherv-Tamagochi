// ================= АППАРАТ АЛЧНОСТИ, ВЕРСИЯ 2: ПРОСМОТР ЭСКИЗА =================
// 🐞 → «Аппарат» → панель алчности → «Эскиз v2». Не игра: живой эскиз
// версии 2 (docs/plan/31-greed-premium.md), чтобы игрок видел блеск
// золота и лака от НАСТОЯЩЕГО наклона телефона, а не в GIF.
//
// Карты запечены из эскиза (tools/greed-lux-sketch: machine.py →
// bake-preview.py) в src/minigames/greed/lux/: цвет, материал (R глянец,
// G стекло, B золото), свечение с ореолом, тень, рельеф 16 бит. Телефон
// считает только то, что зависит от наклона: отражения студии, грань
// золота, искры, сияние. Перерисовка — только когда наклон сдвинулся или
// идёт эффект экранчика.
//
// Экранчики колеса — сами сектора (решение игрока): раз в 6–10 с один
// видимый значок сбоит — цифровой сбой, рассыпание, перерисовка; тап по
// значку — эффект выигрыша (сбой + вспышки + свет всего клина).
const GreedLuxPreview = {
    DIR: 'src/minigames/greed/lux/',
    W: 360, Y0: -57, H: 696, Q: 1.9,
    WHEEL: { cx: 22, cy: 118, r: 150 },
    DUR: { glitch: 320, scatter: 750, redraw: 450, win: 1100 },

    async open() {
        if (this.box) { this.close(); return; }
        const host = document.getElementById('game-container') || document.body;
        const L = PALETTE.greedLux;
        const box = document.createElement('div');
        box.id = 'gl-preview';
        box.style.cssText = `position:absolute;inset:0;z-index:100003;display:flex;align-items:center;justify-content:center;background:${L.back}`;
        const x = document.createElement('div');
        x.style.cssText = 'position:absolute;right:10px;top:10px;width:44px;height:44px;z-index:3;cursor:pointer';
        const J = PALETTE.greedJunk;
        x.innerHTML = `<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="19" fill="${J.tin[700]}" stroke="${PALETTE.ink}" stroke-width="3"/>` +
            `<path d="M14 14 L30 30 M30 14 L14 30" stroke="${J.tin[100]}" stroke-width="4.5" stroke-linecap="round"/></svg>`;
        x.addEventListener('click', (e) => { e.stopPropagation(); this.close(); });
        box.appendChild(x);
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;flex:none';
        box.appendChild(wrap);
        host.appendChild(box);
        this.box = box; this.wrap = wrap;
        const k = Math.min(host.clientWidth / this.W, host.clientHeight / this.H);
        wrap.style.width = (this.W * k).toFixed(1) + 'px';
        wrap.style.height = (this.H * k).toFixed(1) + 'px';
        const meta = await fetch(this.DIR + 'lux.json').then(r => r.json());
        if (!this.box) return;
        this.meta = meta;
        const [w, h] = meta.size;
        this.S = w / this.W;
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;background:none';
        const ic = document.createElement('canvas');
        ic.width = w; ic.height = h;
        ic.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;background:none;pointer-events:none';
        wrap.appendChild(cv); wrap.appendChild(ic);
        this.cv = cv; this.ic = ic; this.icx = ic.getContext('2d');
        wrap.addEventListener('click', (e) => this.tap(e));
        const imgs = await Promise.all(['albedo', 'height', 'mat', 'emit', 'shade'].map(n => new Promise((res, rej) => {
            const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = this.DIR + n + '.png';
        })));
        if (!this.box) return;
        if (!this.glInit(imgs)) return;
        this.fx = null; this.nextFx = performance.now() + 2500;
        this.tilt = { x: 0, y: 0 }; this.drawn = null;
        this.drawIcons(performance.now());
        const loop = (now) => {
            if (!this.box) return;
            this.step(now);
            this.raf = requestAnimationFrame(loop);
        };
        this.raf = requestAnimationFrame(loop);
    },

    close() {
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = null;
        if (this.gl) { const ext = this.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
        this.gl = null;
        if (this.box) this.box.remove();
        this.box = null;
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
        const gl = this.cv.getContext('webgl', { premultipliedAlpha: false, alpha: false });
        if (!gl) return false;
        this.gl = gl;
        const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
            if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.warn('[Эскиз v2]', gl.getShaderInfoLog(o)); return o; };
        const p = gl.createProgram();
        gl.attachShader(p, sh(gl.VERTEX_SHADER, 'attribute vec2 a; varying vec2 v; void main(){ v = a*0.5+0.5; v.y = 1.0 - v.y; gl_Position = vec4(a,0,1); }'));
        const sp = L.spark.map(n => n.toFixed(3)).join(','), ha = L.halo.map(n => n.toFixed(3)).join(',');
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, `
            #ifdef GL_FRAGMENT_PRECISION_HIGH
            precision highp float;
            #else
            precision mediump float;
            #endif
            uniform sampler2D uA, uH, uM, uE, uS, uG, uL; uniform vec2 uTex, uTilt; uniform float uUnit; varying vec2 v;
            float h(vec2 q){ vec4 t = texture2D(uH, q); return (t.r * 65280.0 + t.g * 255.0) / 65535.0 * 64.0; }
            float gm(vec2 q){ return texture2D(uM, q).b; }
            vec2 h2(vec2 c){ return vec2(fract(sin(dot(c, vec2(12.99, 78.23))) * 43758.5), fract(sin(dot(c, vec2(39.35, 11.13))) * 24634.6)); }
            vec2 noise2(vec2 q){ vec2 i = floor(q), f = q - i; f = f*f*(3.0-2.0*f);
                return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y) - 0.5; }
            vec2 refl(vec3 n, vec2 pos){ vec3 nt = normalize(n + vec3(uTilt, 0.0));
                return clamp(vec2(nt.x, -nt.y) * 0.46 + 0.5 + (pos - 0.5) * vec2(0.34, 0.5), 0.0, 1.0); }
            void main(){
                float st = 4.0 / uUnit;
                float dx = (h(v + vec2(uTex.x*2.0, 0.0)) - h(v - vec2(uTex.x*2.0, 0.0))) / st;
                float dy = (h(v + vec2(0.0, uTex.y*2.0)) - h(v - vec2(0.0, uTex.y*2.0))) / st;
                vec3 n = normalize(vec3(-dx, dy, 1.0));
                vec3 a = texture2D(uA, v).rgb; vec4 m = texture2D(uM, v);
                float G = m.b;
                vec3 Ld = normalize(vec3(-0.42, 0.5, 0.76) + vec3(uTilt * 0.6, 0.0));
                float dif = clamp(dot(n, Ld), 0.0, 1.0) / 0.76;
                vec3 c;
                if (G > 0.5) {
                    float gx = gm(v + vec2(uTex.x*1.5, 0.0)) - gm(v - vec2(uTex.x*1.5, 0.0));
                    float gy = gm(v + vec2(0.0, uTex.y*1.5)) - gm(v - vec2(0.0, uTex.y*1.5));
                    vec3 nb = normalize(n + vec3(-gx, gy, 0.0) * 0.85);
                    nb = normalize(nb + vec3(noise2(v / uTex / (10.0 * uUnit)), 0.0) * 0.08);
                    c = texture2D(uG, refl(nb, v)).rgb * (a / vec3(0.84, 0.68, 0.32));
                    c = pow(c, vec3(1.08)) * (0.62 + 0.38 * dif);
                } else if (m.g > 0.5) {
                    c = a * (0.45 + 0.55 * dif) + texture2D(uL, refl(n, v)).rgb * 0.6;
                } else {
                    float lum = max(a.r, max(a.g, a.b));
                    c = a * (0.30 + 0.80 * dif) + texture2D(uL, refl(n, v)).rgb * m.r * 0.6 * (0.4 + 1.2 * lum);
                }
                c *= texture2D(uS, v).r;
                c += texture2D(uE, v).rgb;
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
                gl_FragColor = vec4(c, 1.0);
            }`));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn('[Эскиз v2]', gl.getProgramInfoLog(p)); return false; }
        gl.useProgram(p);
        this.prog = p;
        const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        [[imgs[0], 'uA'], [imgs[1], 'uH'], [imgs[2], 'uM'], [imgs[3], 'uE'], [imgs[4], 'uS'], [goldCap, 'uG'], [lacCap, 'uL']].forEach(([im, u], i) => {
            const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
            // рельеф упакован в два байта — только ближайший тексел
            const f = u === 'uH' ? gl.NEAREST : gl.LINEAR;
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.uniform1i(gl.getUniformLocation(p, u), i);
        });
        gl.uniform2f(gl.getUniformLocation(p, 'uTex'), 1 / imgs[1].width, 1 / imgs[1].height);
        gl.uniform1f(gl.getUniformLocation(p, 'uUnit'), this.S);
        this.uTilt = gl.getUniformLocation(p, 'uTilt');
        return true;
    },

    step(now) {
        // наклон: сглажен здесь (turn() — без сглаживания), мёртвая зона —
        // как у аппарата: дрожь руки не гоняет шейдер
        const t = typeof Tilt !== 'undefined' ? Tilt.turn() : { x: 0, y: 0 };
        this.tilt.x += ((t.x || 0) - this.tilt.x) * 0.2;
        this.tilt.y += ((t.y || 0) - this.tilt.y) * 0.2;
        const tx = Math.max(-1, Math.min(1, this.tilt.x)) * 0.42, ty = Math.max(-1, Math.min(1, -this.tilt.y)) * 0.34;
        if (!this.drawn || Math.abs(tx - this.drawn[0]) > 0.004 || Math.abs(ty - this.drawn[1]) > 0.004) {
            this.gl.uniform2f(this.uTilt, tx, ty);
            this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
            this.drawn = [tx, ty];
        }
        // экранчики колеса: эффект раз в 6–10 с, один значок
        if (!this.fx && now > this.nextFx) {
            const kinds = ['glitch', 'scatter', 'redraw'];
            this.fx = { i: Math.floor(Math.random() * this.meta.icons.length), kind: kinds[Math.floor(Math.random() * 3)], t0: now };
        }
        if (this.fx) {
            const T = (now - this.fx.t0) / this.DUR[this.fx.kind];
            if (T >= 1) { this.fx = null; this.nextFx = now + 6000 + Math.random() * 4000; }
            this.drawIcons(now);
        }
    },

    tap(e) {
        const r = this.wrap.getBoundingClientRect();
        const fx = (e.clientX - r.left) / r.width * this.W, fy = (e.clientY - r.top) / r.height * this.H + this.Y0;
        let best = -1, bd = 22;
        this.meta.icons.forEach(([x, y], i) => { const d = Math.hypot(x - fx, y - fy); if (d < bd) { bd = d; best = i; } });
        if (best >= 0) this.fx = { i: best, kind: 'win', t0: performance.now() };
    },

    // ---------- экранчики колеса ----------
    wedge(g, ix, iy) {
        const W = this.WHEEL, S = this.S, a0 = Math.atan2(iy - W.cy, ix - W.cx), da = Math.PI / 16 - 0.012;
        g.beginPath();
        g.moveTo((W.cx - 0) * S + Math.cos(a0 - da) * 24 * S, (W.cy - this.Y0) * S + Math.sin(a0 - da) * 24 * S);
        g.arc(W.cx * S, (W.cy - this.Y0) * S, (W.r - 2) * S, a0 - da, a0 + da);
        g.arc(W.cx * S, (W.cy - this.Y0) * S, 24 * S, a0 + da, a0 - da, true);
        g.closePath();
    },
    // клетки значка в миг T эффекта (сетка 24×24, значок 16×16 со сдвигом 4)
    cells(kind, fx, T) {
        const g = this.meta.sprites[kind], base = [];
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (g[y][x]) base.push([x + 4, y + 4, g[y][x], 1]);
        if (!fx) return base;
        const k = fx.kind;
        if (k === 'win' && T > 0.35) {
            const q = (T - 0.35) / 0.65, br = 1 + 1.4 * Math.max(0, Math.sin(q * Math.PI * 2)) * (1 - q * 0.4);
            return base.map(([x, y, c]) => [x, y, c, br]);
        }
        if (k === 'glitch' || k === 'win') {
            const tt = k === 'glitch' ? T : Math.min(1, T / 0.35), f = Math.floor(tt * 9);
            if (f === 3) return [];
            let seed = f * 31 + 7;
            const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
            const bands = []; const nb = 2 + Math.floor(rnd() * 2);
            for (let i = 0; i < nb; i++) bands.push([Math.floor(rnd() * 16), 2 + Math.floor(rnd() * 3), [-3, -2, -1, 1, 2, 3][Math.floor(rnd() * 6)]]);
            const res = [], br = f === 5 ? 1.7 : 1;
            base.forEach(([x, y, c]) => {
                const sh = tt < 0.9 ? bands.reduce((s, [y0, hh, d]) => s + (y - 4 >= y0 && y - 4 < y0 + hh ? d : 0), 0) : 0;
                if (tt < 0.9 && f % 2 === 0) res.push([x + sh + 1, y, 'R' + c, br], [x + sh, y, 'G' + c, br], [x + sh - 1, y, 'B' + c, br]);
                else res.push([x + sh, y, c, br]);
            });
            return res;
        }
        if (k === 'scatter') {
            const s = Math.pow(Math.sin(Math.PI * T), 1.4);
            return base.map(([x, y, c]) => {
                let seed = x * 97 + y * 13;
                const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
                const vx = (x - 12) * (0.5 + rnd()) + (rnd() - 0.5) * 6, vy = (y - 12) * (0.5 + rnd()) + (rnd() - 0.5) * 6;
                return [Math.round(x + vx * s * 0.9), Math.round(y + vy * s * 0.9), c, 1 - 0.55 * s];
            });
        }
        if (k === 'redraw') {
            if (T < 0.12) return [];
            const row = (T - 0.12) / 0.8 * 16, res = [];
            base.forEach(([x, y, c]) => { const r = y - 4; if (r < row - 1) res.push([x, y, c, 1]); else if (r < row) res.push([x, y, PALETTE.greedLux.scan, 1.3]); });
            return res;
        }
        return base;
    },
    drawIcons(now) {
        const g = this.icx, S = this.S, Q = this.Q, L = PALETTE.greedLux;
        g.clearRect(0, 0, this.ic.width, this.ic.height);
        g.globalCompositeOperation = 'lighter';
        this.meta.icons.forEach(([ix, iy, kind], i) => {
            const fx = this.fx && this.fx.i === i ? this.fx : null;
            const T = fx ? Math.min(1, (now - fx.t0) / this.DUR[fx.kind]) : 0;
            g.save();
            this.wedge(g, ix, iy); g.clip();
            if (fx && fx.kind === 'win' && T > 0.35) {
                const q = (T - 0.35) / 0.65;
                g.globalAlpha = Math.max(0, Math.sin(q * Math.PI * 2)) * (1 - q * 0.4);
                g.fillStyle = L.winFlash; g.fillRect(0, 0, this.ic.width, this.ic.height);
                g.globalAlpha = 1;
            }
            g.shadowBlur = 5 * S;
            this.cells(kind, fx, T).forEach(([gx, gy, c, br]) => {
                let col = c;
                if (c[0] === 'R' || c[0] === 'G' || c[0] === 'B') {
                    const ch = c[0], hx = c.slice(1), v = parseInt(hx.slice({ R: 1, G: 3, B: 5 }[ch], { R: 3, G: 5, B: 7 }[ch]), 16);
                    col = ch === 'R' ? `rgb(${v},0,0)` : ch === 'G' ? `rgb(0,${v},0)` : `rgb(0,0,${v})`;
                }
                g.globalAlpha = Math.min(1, br);
                g.fillStyle = col; g.shadowColor = col;
                const px = (ix + (gx - 12) * Q) * S, py = (iy - this.Y0 + (gy - 12) * Q) * S;
                g.fillRect(px, py, (Q - 0.3) * S, (Q - 0.3) * S);
                if (br > 1) { g.globalAlpha = br - 1; g.fillRect(px, py, (Q - 0.3) * S, (Q - 0.3) * S); }
            });
            g.restore();
        });
        g.globalCompositeOperation = 'source-over';
    }
};
