// ================= АППАРАТ АЛЧНОСТИ: КОЛЕСО КРУТИТСЯ =================
// Продолжение GreedJunkLit. Колесо (рисунок — greed-junk-wheel.js) на свету
// живёт своим холстом: диск один раз собирается в картинку и крутится её
// поворотом; в корпусе остаются щит и ступица (GreedJunk.wheelApart).
// Свет при этом не крутится вместе с диском: блик сверху-слева и
// затенение края — отдельный неподвижный слой поверх, тень на щит — под.
//
// Палец: колесо идёт за пальцем, на отпускании крутится со скоростью
// броска и тормозит. Слабый бросок — только покачнуть, крутки нет.
// Каждый гвоздь отгибает резиновый язычок — щелчок в палец, к концу всё
// реже; на остановке — удар. Где встанет, решено в момент броска:
// торможение подбирается так, чтобы колесо замерло ровно на нужном
// секторе (onWheel — игра; без неё превью берёт случайный).
Object.assign(GreedJunkLit, {
    // Колесо тяжёлое: a — торможение (рад/мс²; меньше — дольше катится),
    // maxW — предельная скорость броска: тяжёлое колесо рукой сильно не
    // раскрутить, и между гвоздями при ней не меньше 35 мс — каждый сектор
    // успевает отдать свой толчок в палец. minW — бросок, с которого
    // начинается крутка; turns — минимум оборотов; drag — запаздывание за
    // пальцем (доля пути за кадр); settle — откат назад на остановке:
    // язычок упирается в гвоздь. Язычок: flap — наибольший отгиб (рад),
    // fw/fz — частота и затухание его пружины.
    // Было: легче вдвое, без предела скорости, пружина язычка одним шагом
    // на кадр — на медленном кадре её разносило, язычок бесился и пропадал.
    WHEEL_SPIN: { a: 0.0000028, maxW: 0.011, minW: 0.0035, turns: 2, drag: 0.3, settle: 0.035, settleMs: 380,
        flap: 0.42, fw: 0.05, fz: 0.22 },

    // pad — запас вокруг диска: колесу хватает 6, тени — своего (она
    // размыта и уезжает от света, а край холста резал её прямой линией)
    wheelBox(pad = 6) {
        const W = GreedJunk.SLOTS.wheel, R = GreedJunk.WHEEL.rEdge + pad;
        const x0 = Math.max(0, W.cx - R), y0 = Math.max(0, W.cy - R - 16);
        return { x: x0, y: y0, w: W.cx + R - x0, h: W.cy + R - y0 };
    },

    wheelMountLit(wrap) {
        if (!GreedJunk.wheelShown || !GreedJunk.wheelShown()) return;
        const G = GreedJunk, S = this.SCALE;
        const layer = (B) => {
            const cv = document.createElement('canvas');
            cv.width = Math.round(B.w * S); cv.height = Math.round(B.h * S);
            cv.style.cssText = `position:absolute;left:${B.x / G.W * 100}%;top:${B.y / G.H * 100}%;` +
                `width:${B.w / G.W * 100}%;height:${B.h / G.H * 100}%;z-index:1;pointer-events:none;background:none`;
            wrap.appendChild(cv);
            return cv;
        };
        // тень диска на щит — рисуется один раз, от света сдвигается
        // переносом холста (wheelShadowAt); сам диск и язычок — своим
        // шейдером поверх
        this.wheelShadowCv = layer(this.wheelShadowBox());
        this.wheelCv = layer(this.wheelBox());
        this._wheel = { rot: 0, w: 0, st: 'idle', flap: 0, fv: 0, at: 0, shown: null, lastPeg: null, target: 0, mdir: 1 };
        this.wheelSprites();
        // палец: схватил диск — крутишь
        const field = (e) => {
            const r = wrap.getBoundingClientRect();
            return [(e.clientX - r.left) / r.width * G.W, (e.clientY - r.top) / r.height * G.H];
        };
        const W = G.SLOTS.wheel, ang = (p) => Math.atan2(p[1] - W.cy, p[0] - W.cx);
        let grab = null;
        wrap.addEventListener('pointerdown', (e) => {
            const p = field(e), M = this._wheel;
            if (Math.hypot(p[0] - W.cx, p[1] - W.cy) > G.WHEEL.rEdge || M.st === 'spin' || M.st === 'settle') return;
            e.preventDefault(); e.stopPropagation();
            wrap.setPointerCapture(e.pointerId);
            grab = { a: ang(p), hist: [[performance.now(), M.rot]] };
            M.st = 'drag'; M.w = 0; M.target = M.rot;
        });
        wrap.addEventListener('pointermove', (e) => {
            if (!grab) return;
            const M = this._wheel, a = ang(field(e));
            let d = a - grab.a;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            grab.a = a;
            // тяжёлое колесо идёт за пальцем с запаздыванием (wheelStep)
            M.target += d;
            const now = performance.now();
            grab.hist.push([now, M.target]);
            grab.hist = grab.hist.filter(h => now - h[0] < 90);
        });
        const up = () => {
            if (!grab) return;
            const M = this._wheel, h = grab.hist, now = performance.now();
            grab = null;
            const w = h.length > 1 ? (h[h.length - 1][1] - h[0][1]) / Math.max(16, h[h.length - 1][0] - h[0][0]) : 0;
            this.wheelThrow(w, now);
        };
        wrap.addEventListener('pointerup', up);
        wrap.addEventListener('pointercancel', up);
    },

    // бросок: слабый — колесо докатится трением; сильный — крутка с
    // заранее выбранной остановкой
    wheelThrow(w, now) {
        const M = this._wheel, P = this.WHEEL_SPIN;
        w = Math.max(-P.maxW, Math.min(P.maxW, w));
        M.w = w;
        if (Math.abs(w) < P.minW) { M.st = 'coast'; return; }
        const n = GreedJunk.WHEEL_SECTORS.length;
        // какой сектор: игра (onWheel → индекс) или случайный в превью
        const idx = this.onWheel ? this.onWheel() : Math.floor(Math.random() * n);
        if (idx === false) { M.st = 'coast'; return; }      // крутка не состоялась
        // угол, при котором сектор idx под язычком: сектор i вверху при rot = −i·2π/n
        const dir = Math.sign(w), sec = Math.PI * 2 / n, T = Math.PI * 2;
        const want = -idx * sec + (Math.random() - 0.5) * sec * 0.6;
        // путь: не меньше turns оборотов и почти столько, сколько докатилось бы само
        const dist = Math.max(P.turns * T, w * w / (2 * P.a) * 0.85);
        // первый угол want (по модулю оборота) дальше пути dist по ходу вращения
        const end = dir > 0 ? want + T * Math.ceil((M.rot + dist - want) / T)
                            : want - T * Math.ceil((want - (M.rot - dist)) / T);
        // равнозамедленно с той же начальной скоростью, что бросок: время 2L/w0
        M.st = 'spin'; M.from = M.rot; M.to = end; M.dir = dir;
        M.dur = 2 * Math.abs(end - M.rot) / Math.abs(w);
        M.t0 = now;
    },

    wheelStep(now) {
        const M = this._wheel, P = this.WHEEL_SPIN;
        if (!M || !this._wheelSpr) return;
        const dt = Math.min(40, M.at0 ? now - M.at0 : 16);
        M.at0 = now;
        const prev = M.rot;
        if (M.st === 'drag') {
            // за пальцем — с запаздыванием, на любой частоте кадров одинаково
            M.rot += (M.target - M.rot) * (1 - Math.pow(1 - P.drag, dt / 16));
        } else if (M.st === 'spin') {
            const u = Math.min(1, (now - M.t0) / M.dur);
            // равнозамедленно: s = L·(2u − u²)
            M.rot = M.from + (M.to - M.from) * (2 * u - u * u);
            if (u >= 1) {
                M.st = 'settle'; M.rot = M.to; M.t0 = now;
                if (typeof Haptics !== 'undefined') Haptics.impact('heavy', true);
            }
        } else if (M.st === 'settle') {
            // откат: язычок упёрся в гвоздь — колесо подаётся назад и встаёт
            const v = Math.min(1, (now - M.t0) / P.settleMs);
            M.rot = M.to - M.dir * P.settle * Math.sin(v * Math.PI) * (1 - v * 0.4);
            if (v >= 1) {
                M.st = 'idle'; M.rot = M.to;
                if (this.onWheelDone) this.onWheelDone();
            }
        } else if (M.st === 'coast') {
            const sg = Math.sign(M.w);
            M.w -= sg * P.a * dt * 3;
            if (Math.sign(M.w) !== sg) { M.w = 0; M.st = 'idle'; }
            M.rot += M.w * dt;
        }
        this.wheelFlap(now, dt, M.rot - prev);
        // свет от наклона — не чаще LIGHT_MS, как у корпуса
        const t = this._tilt || { x: 0, y: 0 };
        if (!M.lt || ((Math.abs(t.x - M.lt.x) > 0.002 || Math.abs(t.y - M.lt.y) > 0.002) && now - (M.ltAt || 0) >= this.LIGHT_MS)) {
            M.lt = { x: t.x, y: t.y }; M.ltAt = now; M.shown = null;
            this.wheelShadowAt(this.lightFor(M.lt));
        }
        const key = M.rot.toFixed(4) + ',' + M.flap.toFixed(3);
        if (key === M.shown) return;
        M.shown = key;
        this.wheelDraw();
    },

    // Язычок. Гвоздь, подходящий к нему, плавно отгибает кончик по ходу
    // вращения; проскочив, отпускает — дальше язычок качается пружиной и
    // затухает. Пружина — мелкими шагами по 4 мс: одним шагом на кадр на
    // медленном кадре счёт разносило (язычок бесился и пропадал).
    wheelFlap(now, dt, d) {
        const M = this._wheel, P = this.WHEEL_SPIN, n = GreedJunk.WHEEL_SECTORS.length, sec = Math.PI * 2 / n;
        if (d) M.mdir = Math.sign(d);
        const dir = M.mdir || 1;
        // Ближайший гвоздь к язычку: −sec/2..sec/2, 0 — гвоздь под язычком.
        // Гвоздь i стоит на (i − ½)·sec от верха; под язычком он, когда
        // rot ≡ sec/2 по модулю сектора. Было: сдвиг на полсектора не в ту
        // сторону — язычок отгибался в пустом промежутке между гвоздями.
        let off = ((M.rot - sec / 2) % sec + sec) % sec;
        if (off > sec / 2) off -= sec;
        const c = sec * 0.3, along = dir * off;     // < 0 — гвоздь ещё подходит
        // номер промежутка между гвоздями: меняется ровно на гвозде
        const pegIdx = Math.floor((M.rot - sec / 2) / sec);
        // canvas: поворот + — по часовой; кончик ниже оси уходит по ходу
        // вращения колеса — значит язычок поворачивается против
        if (d && along > -c && along < c * 0.6) {
            const s = (along + c) / (1.6 * c);
            const f = -dir * P.flap * s * s;
            M.fv = (f - M.flap) / Math.max(4, dt);
            M.flap = f;
        } else {
            for (let t = 0; t < dt; t += 4) {
                const h = Math.min(4, dt - t);
                M.fv += (-P.fw * P.fw * M.flap - 2 * P.fz * P.fw * M.fv) * h;
                M.flap += M.fv * h;
            }
        }
        if (!isFinite(M.flap)) { M.flap = 0; M.fv = 0; }
        M.flap = Math.max(-0.8, Math.min(0.8, M.flap));
        // Каждый гвоздь — свой толчок в палец. Проскочило за кадр два —
        // второй встаёт в очередь и отдаётся следом: сектор не теряется.
        if (M.lastPeg !== null && M.lastPeg !== undefined) M.ticks = (M.ticks || 0) + Math.abs(pegIdx - M.lastPeg);
        M.lastPeg = pegIdx;
        if (M.ticks > 0 && now - (M.tickAt || 0) >= 25) {
            M.ticks = Math.min(M.ticks - 1, 3);
            M.tickAt = now;
            if (typeof Haptics !== 'undefined') Haptics.impact('light', true);
        }
    },

    // ---------- НА СВЕТУ: КАРТЫ И СВОЙ ШЕЙДЕР ----------
    // Колесо — в той же системе материалов и высот, что корпус: диск и
    // резинка язычка рисуются в три карты (цвет, высоты, материал) один раз,
    // а свет считает маленький шейдер на холсте колеса каждый кадр, пока оно
    // движется. Квадрат карты поворачивается вместе с колесом, нормали из
    // карты высот поворачиваются с ним, а свет — нет: блик гвоздей и гаек
    // остаётся сверху-слева, тени от них ложатся от света. Тени — короткий
    // поиск по карте высот (гвозди и гайки низкие). Было: диск — плоская
    // картинка без шейдера, блики крутились вместе с ним.
    async wheelSprites() {
        const G = GreedJunk, W = G.WHEEL, S = this.SCALE, R = W.rEdge + 4;
        try {
            const F = () => G.wheelFace();
            // Части диска на своих высотах и материалах. Карта у колеса своя,
            // важна только разница высот — диск опущен к 8: карта кончается
            // на 20 (HMAX − H0), а в корпусе краска колеса стоит на 17.6, и
            // торчащему гвоздю там некуда расти — он обрезался до кнопки.
            const h0 = 8;
            const discFull = (pass) => {
                G.pass = pass;
                const f = F();
                return `<svg xmlns="http://www.w3.org/2000/svg" width="${R * 2 * S}" height="${R * 2 * S}" viewBox="${-R} ${-R} ${R * 2} ${R * 2}">` +
                    G.passStyle(pass) + G.defs() + G.T(h0 - 0.6, 'raw', f.edge) + G.T(h0, 'paint', f.sec + f.chip + f.icons) +
                    G.T(h0 + W.pegUp, 'steel', f.pegs) + G.T(h0 + 1.9, 'steel', f.hub) + '</svg>';
            };
            const Wc = G.SLOTS.wheel, px = Wc.cx, py = Wc.cy - W.rEdge - 16;
            const ptr = (pass) => {
                G.pass = pass;
                return `<svg xmlns="http://www.w3.org/2000/svg" width="${30 * S}" height="${36 * S}" viewBox="${px - 15} ${py - 2} 30 36">` +
                    G.passStyle(pass) + G.defs() + G.wheelPointer('strip') + '</svg>';
            };
            const passes = ['albedo', 'height', 'mat'];
            const dm = await Promise.all(passes.map(ps => this.image(discFull(ps))));
            const pm = await Promise.all(passes.map(ps => this.image(ptr(ps))));
            G.pass = 'baked';
            if (!this.wheelGL(dm, pm)) throw new Error('нет WebGL');
            this._wheelSpr = { R, px, py };
            this.wheelShadow();
            this._wheel.shown = null;
        } catch (e) {
            G.pass = 'baked';
            // видно в 🐞 на кнопке «Колесо»: на iPhone консоли нет
            this.wheelError = String((e && e.message) || e || 'картинка').slice(0, 40);
            console.warn('[Аппарат] колесо не собралось', e);
        }
    },

    wheelGL(dm, pm) {
        const cv = this.wheelCv, gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true });
        if (!gl) return false;
        const vs = `attribute vec2 aPos;
            uniform vec2 uC, uHalf, uPiv, uCanvas; uniform float uRot;
            varying vec2 vUv;
            void main() {
                vUv = aPos * 0.5 + 0.5;
                vec2 p = aPos * uHalf - uPiv;
                float c = cos(uRot), s = sin(uRot);
                vec2 w = uC + uPiv + vec2(c * p.x - s * p.y, s * p.x + c * p.y);
                gl_Position = vec4(w.x / uCanvas.x * 2.0 - 1.0, 1.0 - w.y / uCanvas.y * 2.0, 0.0, 1.0);
            }`;
        // Свет — как в шейдере корпуса (greed-junk-lit.js, program): рассеянный
        // с тем же ambient, блик по материалу, тень шагами по карте высот.
        const fs = `precision mediump float;
            uniform sampler2D uA, uH, uM;
            uniform vec2 uTex; uniform vec3 uL; uniform float uRelief, uPxPerH, uRotF;
            varying vec2 vUv;
            float hh(vec2 p) { return texture2D(uH, p).r; }
            float hs(vec2 p) {
                return (hh(p) * 2.0 + hh(p + vec2(uTex.x, 0.0)) + hh(p - vec2(uTex.x, 0.0)) +
                        hh(p + vec2(0.0, uTex.y)) + hh(p - vec2(0.0, uTex.y))) / 6.0;
            }
            void main() {
                vec4 a = texture2D(uA, vUv);
                if (a.a < 0.004) { gl_FragColor = vec4(0.0); return; }
                vec2 d = uTex * 4.0;
                float h0 = hh(vUv), h0s = hs(vUv);
                float hl = min(hs(vUv - vec2(d.x, 0.0)), h0s), hr = min(hs(vUv + vec2(d.x, 0.0)), h0s);
                float hu = min(hs(vUv - vec2(0.0, d.y)), h0s), hd = min(hs(vUv + vec2(0.0, d.y)), h0s);
                vec2 nt = vec2((hl - hr) * uRelief, (hu - hd) * uRelief);
                // нормаль поворачивается вместе с колесом, свет — нет
                float c = cos(uRotF), s = sin(uRotF);
                vec3 n = normalize(vec3(c * nt.x - s * nt.y, s * nt.x + c * nt.y, 1.0));
                float amb = 0.42;
                float lit = (amb + (1.0 - amb) * max(dot(n, uL), 0.0)) / (amb + (1.0 - amb) * uL.z);
                // тень: направление на свет — в координатах карты (обратный поворот)
                vec2 lw = normalize(uL.xy);
                vec2 dir = vec2(c * lw.x + s * lw.y, -s * lw.x + c * lw.y);
                float rise = uL.z / length(uL.xy) / uPxPerH, occ = 0.0;
                // Как у корпуса: уклон своей плоскости вдоль луча (купол
                // шляпки не штрихует сам себя), шаг 3 текселя с дрожью начала.
                // Охват 16×3 = 48 текселей = 16 единиц: тень гвоздя высотой
                // 7 единиц при свете сверху-сбоку ложится целиком. Было 10×2 —
                // 7 единиц, и тень обрезалась.
                vec2 gq = vec2(hh(vUv + vec2(d.x, 0.0)) - hh(vUv - vec2(d.x, 0.0)), hh(vUv + vec2(0.0, d.y)) - hh(vUv - vec2(0.0, d.y))) / 8.0;
                float plane = max(rise, dot(gq, dir));
                float jit = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
                for (int i = 1; i <= 16; i++) {
                    float t = (float(i) - jit) * 3.0;
                    float hq = hh(vUv + dir * uTex * t);
                    occ = max(occ, clamp((hq - (h0 + t * plane) - 0.01) * 5.0, 0.0, 1.0));
                }
                float sh = 1.0 - 0.55 * occ;
                vec4 m = texture2D(uM, vUv);
                vec3 hv = normalize(uL + vec3(0.0, 0.0, 1.0));
                float nh = max(dot(n, hv), 0.0);
                float sp = m.r * (pow(nh, mix(6.0, 90.0, m.g)) + 0.35 * m.g * pow(nh, 3.0) - 0.35 * m.g * pow(uL.z * 0.5 + 0.5, 3.0) * 0.6);
                vec3 spc = mix(vec3(1.0), a.rgb / max(a.a, 0.01) * 1.5, m.b);
                gl_FragColor = vec4(a.rgb * lit * sh + spc * sp * sh * a.a, a.a);
            }`;
        const sh = (t, src) => { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
        const pr = gl.createProgram();
        gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
        // uRot у вершинного и фрагментного — разной точности (highp/mediump), с
        // одним именем программа не линкуется; во фрагмент угол идёт как uRotF.
        gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
        gl.useProgram(pr);
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(pr, 'aPos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const tex = (img, premul) => {
            const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premul);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            return t;
        };
        const set = (maps) => ({ t: maps.map((img, i) => tex(img, i === 0)), w: maps[0].width, h: maps[0].height });
        const U = {};
        ['uC', 'uHalf', 'uPiv', 'uCanvas', 'uRot', 'uRotF', 'uA', 'uH', 'uM', 'uTex', 'uL', 'uRelief', 'uPxPerH'].forEach(k => { U[k] = gl.getUniformLocation(pr, k); });
        gl.uniform1i(U.uA, 0); gl.uniform1i(U.uH, 1); gl.uniform1i(U.uM, 2);
        gl.uniform1f(U.uRelief, 9.0 * GreedJunk.HMAX / 24);
        gl.uniform1f(U.uPxPerH, GreedJunk.HMAX * this.SCALE);
        gl.uniform2f(U.uCanvas, cv.width, cv.height);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        this._wgl = { gl, U, disc: set(dm), ptr: set(pm) };
        return true;
    },

    // Тень диска на щит: мягкий круг ровно под диском — один раз. Куда она
    // ляжет, решает wheelShadowAt. Было: сдвиг вниз-вправо зашит в рисунок,
    // и при наклоне телефона свет на колесе ходил, а тень стояла.
    wheelShadow() {
        const B = this.wheelShadowBox(), S = this.SCALE, W = GreedJunk.SLOTS.wheel, R = GreedJunk.WHEEL.rEdge, P = this.WHEEL_SHADOW;
        const c = this.wheelShadowCv.getContext('2d');
        c.setTransform(S, 0, 0, S, -B.x * S, -B.y * S);
        c.filter = 'blur(' + (P.blur * S) + 'px)';
        c.globalAlpha = P.a; c.fillStyle = PALETTE.greedJunk.hole;
        c.beginPath(); c.arc(W.cx, W.cy, R, 0, Math.PI * 2); c.fill();
        c.filter = 'none'; c.globalAlpha = 1;
        this.wheelShadowAt(this.lightFor((this._wheel && this._wheel.lt) || { x: 0, y: 0 }));
    },

    // Сдвиг тени от света: диск висит над щитом на gap, тень уходит
    // от света на gap·L.xy/L.z. Переносом холста на видеокарте — без
    // перерисовки. Свет у края наклона почти лежит (L.z до 0.15), тень
    // улетала бы на полколеса — потолок max.
    // Зазор 13: колесо стоит на ступице далеко от щита. Было 7 — тень
    // полоской в 5 единиц, колесо казалось приклеенным к доскам. Чем дальше
    // от щита, тем шире полутень — blur вырос вместе с зазором.
    WHEEL_SHADOW: { gap: 13, max: 18, blur: 4, a: 0.42 },
    wheelShadowBox() { return this.wheelBox(this.WHEEL_SHADOW.blur * 3); },
    wheelShadowAt(L) {
        const cv = this.wheelShadowCv, P = this.WHEEL_SHADOW, B = this.wheelShadowBox();
        if (!cv) return;
        let dx = -L[0] / L[2] * P.gap, dy = -L[1] / L[2] * P.gap;
        const d = Math.hypot(dx, dy);
        if (d > P.max) { dx *= P.max / d; dy *= P.max / d; }
        cv.style.transform = `translate(${(dx / B.w * 100).toFixed(2)}%, ${(dy / B.h * 100).toFixed(2)}%)`;
    },

    wheelDraw() {
        const M = this._wheel, Sp = this._wheelSpr, Q = this._wgl, B = this.wheelBox(), S = this.SCALE, G = GreedJunk, W = G.SLOTS.wheel, R = G.WHEEL.rEdge;
        if (!Q) return;
        const gl = Q.gl, U = Q.U, L = this.lightFor(M.lt || { x: 0, y: 0 }), n = Math.hypot(L[0], L[1], L[2]) || 1;
        gl.viewport(0, 0, this.wheelCv.width, this.wheelCv.height);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform3f(U.uL, L[0] / n, L[1] / n, L[2] / n);
        const draw = (set, cx, cy, hw, hh, rot, pivX, pivY) => {
            set.t.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); });
            gl.uniform2f(U.uTex, 1 / set.w, 1 / set.h);
            gl.uniform2f(U.uC, (cx - B.x) * S, (cy - B.y) * S);
            gl.uniform2f(U.uHalf, hw * S, hh * S);
            gl.uniform2f(U.uPiv, pivX * S, pivY * S);
            // угол копится оборотами; mediump во фрагменте его не удержит — в 0..2π
            const r = rot - Math.floor(rot / (2 * Math.PI)) * 2 * Math.PI;
            gl.uniform1f(U.uRot, r); gl.uniform1f(U.uRotF, r);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
        // диск: квадрат карты вокруг центра, поворот вокруг центра
        draw(Q.disc, W.cx, W.cy, Sp.R, Sp.R, M.rot, 0, 0);
        // резинка: квадрат 30×36 вокруг своей середины, поворот вокруг болта
        const pcx = Sp.px, pcy = Sp.py - 2 + 18, pivX = W.cx, pivY = W.cy - R - 16 + 9.6;
        draw(Q.ptr, pcx, pcy, 15, 18, M.flap, pivX - pcx, pivY - pcy);
    }
});
