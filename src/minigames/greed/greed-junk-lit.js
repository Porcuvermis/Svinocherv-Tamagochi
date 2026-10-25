// ================= АППАРАТ АЛЧНОСТИ: СВЕТ ШЕЙДЕРОМ =================
// Корпус освещается ОДНИМ источником на всю сцену. Рисунок даёт три
// карты (greed-junk-light.js): цвет без света, высоты, материалы. Здесь они
// становятся текстурами, а свет считает видеокарта:
//
//   * нормаль — из карты высот (разница соседей; шаг в полтора тексела
//     сглаживает ступеньки в мягкую фаску);
//   * рассеянный свет — по углу между нормалью и светом, нормированный так,
//     что ровная поверхность выходит ровно в свой цвет: рисунок не темнеет
//     и не выцветает, свет только лепит рельеф;
//   * блик — по материалу: сила, острота, у металла окрашен его цветом;
//   * тень — шагами по карте высот к свету: если по пути есть что-то выше
//     луча — точка в тени. Длина тени выходит сама, от разницы высот, и у
//     всех деталей в одну сторону;
//   * глубина — чем ниже поверхность, тем темнее (в ящик света попадает меньше).
//
// Карты растрируются один раз; дальше на кадр — один проход шейдера. Это
// тот же приём, что у монет рамки алчности (greed-coins-batch.js).
const GreedJunkLit = {
    SCALE: 3,              // текселей на единицу поля: экран айфона — три точки на пиксель

    // SVG-строка → картинка.
    image(svg) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
            img.src = url;
        });
    },

    // Готовит холст: три прохода рисунка → текстуры, шейдер собран.
    // Возвращает false, если видеокарты нет (тогда показывается baked).
    async init(canvas) {
        const W = GreedJunk.W * this.SCALE, H = GreedJunk.H * this.SCALE;
        canvas.width = W; canvas.height = H;
        const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true });
        if (!gl) return false;
        this.gl = gl;
        this.size = [W, H];

        const sized = (svg) => svg.replace('<svg ', `<svg width="${W}" height="${H}" `);
        const [a, h, m] = await Promise.all(['albedo', 'height', 'mat']
            .map(p => this.image(sized(GreedJunk.bodySvg(p)))));
        GreedJunk.pass = 'baked';

        this.prog = this.program(gl);
        this.tex = [a, h, m].map((img, i) => this.texture(gl, img, i));
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(this.prog, 'aPos');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        return true;
    },

    texture(gl, img, unit) {
        const t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, unit === 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        // размеры не степени двойки: без мипмапов и с обрезкой по краю
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    },

    program(gl) {
        const vs = `attribute vec2 aPos; varying vec2 vUv;
            void main() { vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); gl_Position = vec4(aPos, 0.0, 1.0); }`;
        // Координаты экранные: x вправо, y ВНИЗ, z к зрителю. Свет uL —
        // направление НА источник.
        const fs = `precision mediump float;
            uniform sampler2D uA, uH, uM;
            uniform vec2 uTex;        // размер тексела в uv
            uniform vec3 uL;          // на источник, нормирован
            uniform float uRelief;    // крутизна рельефа для нормали
            uniform float uPxPerH;    // текселей на единицу карты высот
            uniform vec2 uHMap;       // карта высот: (H0, HMAX) — h = v * HMAX − H0
            varying vec2 vUv;
            float hh(vec2 p) { return texture2D(uH, p).r; }
            // Для нормали — высота, усреднённая крестом в пять текселей.
            // Карта высот 8-битная: на пологом длинном уклоне (скос окна)
            // высота растёт ступеньками в один уровень, и нормаль по ним
            // дёргалась — скос шёл полосами. Среднее соседей превращает
            // ступеньки обратно в уклон.
            float hs(vec2 p) {
                return (hh(p) * 2.0 + hh(p + vec2(uTex.x, 0.0)) + hh(p - vec2(uTex.x, 0.0)) +
                        hh(p + vec2(0.0, uTex.y)) + hh(p - vec2(0.0, uTex.y))) / 6.0;
            }
            void main() {
                vec4 a = texture2D(uA, vUv);
                if (a.a < 0.004) { gl_FragColor = vec4(0.0); return; }
                // Нормаль по соседям в четырёх текселях, а не в одном: фаска
                // шире чёрного контура, иначе контур её целиком закрывает
                vec2 d = uTex * 4.0;
                float h0 = hh(vUv);
                // Соседи не выше самой точки: фаска ложится только на ВЕРХНЮЮ
                // деталь. Без этого подножие ступеньки на стенке тоже получало
                // наклонную нормаль, смотрящую на свет, — вокруг деталей
                // светился ореол на поверхности, на которой они лежат.
                float h0s = hs(vUv);
                float hl = min(hs(vUv - vec2(d.x, 0.0)), h0s), hr = min(hs(vUv + vec2(d.x, 0.0)), h0s);
                float hu = min(hs(vUv - vec2(0.0, d.y)), h0s), hd = min(hs(vUv + vec2(0.0, d.y)), h0s);
                vec3 n = normalize(vec3((hl - hr) * uRelief, (hu - hd) * uRelief, 1.0));

                // рассеянный: ровная поверхность = свой цвет
                float amb = 0.42;
                float lit = (amb + (1.0 - amb) * max(dot(n, uL), 0.0)) / (amb + (1.0 - amb) * uL.z);

                // тень: шаги к свету по карте высот
                vec2 dir = normalize(uL.xy);
                float rise = uL.z / length(uL.xy) / uPxPerH;   // подъём луча на тексел
                float occ = 0.0;
                // Уклон своей плоскости вдоль луча: тень дают только уступы,
                // торчащие и над лучом, и над продолжением своей плоскости.
                // Иначе ровный крутой уклон (скос окна) затенял сам себя, и
                // шаги луча штриховали его полосами. Свою отвёрнутость от
                // света плоскость и так получает рассеянным светом.
                float gx = (hh(vUv + vec2(d.x, 0.0)) - hh(vUv - vec2(d.x, 0.0))) / 8.0;
                float gy = (hh(vUv + vec2(0.0, d.y)) - hh(vUv - vec2(0.0, d.y))) / 8.0;
                float plane = max(rise, dot(vec2(gx, gy), dir));
                for (int i = 1; i <= 40; i++) {
                    float t = float(i) * 1.5;
                    float hs = hh(vUv + dir * uTex * t);
                    occ = max(occ, clamp((hs - (h0 + t * plane) - 0.01) * 5.0, 0.0, 1.0));
                }
                float sh = 1.0 - 0.55 * occ;

                // блик по материалу
                vec4 m = texture2D(uM, vUv);
                vec3 hv = normalize(uL + vec3(0.0, 0.0, 1.0));
                float nh = max(dot(n, hv), 0.0);
                // острый блик на гранях и широкий мягкий отблеск на ровном:
                // без второго полированный диск на ровной полосе был матовым
                float sp = m.r * (pow(nh, mix(6.0, 90.0, m.g)) + 0.35 * m.g * pow(nh, 3.0) - 0.35 * m.g * pow(uL.z * 0.5 + 0.5, 3.0) * 0.6);
                vec3 spc = mix(vec3(1.0), a.rgb / max(a.a, 0.01) * 1.5, m.b);

                // глубина: ниже — темнее
                float hu0 = h0 * uHMap.y - uHMap.x;      // высота в единицах сцены
                float depth = mix(0.72, 1.0, clamp((hu0 + 1.6) / 12.0, 0.0, 1.0));

                vec3 col = a.rgb * lit * sh * depth + spc * sp * sh * a.a;
                gl_FragColor = vec4(col, a.a);
            }`;
        const sh = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
            return s;
        };
        const p = gl.createProgram();
        gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        return p;
    },

    // Свет по умолчанию — сверху-слева, как был нарисован руками (LIGHT в
    // palette.js): x влево, y вверх, и довольно высоко над сценой.
    LIGHT: [-0.45, -0.55, 0.70],

    // ---------- НАКЛОН ТЕЛЕФОНА ----------
    // Свет стоит в мире, а наклон поворачивает под ним корпус — так же, как
    // кучу монет рамки алчности (GreedCoins.tiltMat, та же матрица и тот же
    // предельный угол): оба места ведут себя одинаково, и направление
    // проверено там на телефоне. Здесь свет переводится в систему корпуса:
    // Mᵀ·L. Экранная y у корпуса смотрит вниз, у монет вверх — отсюда
    // переворот y туда и обратно.
    TILT_MAX: 30,
    lightFor(t) {
        const D = Math.PI / 180, ay = t.x * this.TILT_MAX * D, ax = t.y * this.TILT_MAX * D;
        const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
        const M = [cy, sx * sy, -cx * sy, 0, cx, sx, sy, -sx * cy, cx * cy];
        const L = [this.LIGHT[0], -this.LIGHT[1], this.LIGHT[2]];
        const r = [M[0] * L[0] + M[1] * L[1] + M[2] * L[2],
                   M[3] * L[0] + M[4] * L[1] + M[5] * L[2],
                   M[6] * L[0] + M[7] * L[1] + M[8] * L[2]];
        return [r[0], -r[1], Math.max(0.15, r[2])];
    },

    // Перерисовка, пока холст на экране: только когда наклон заметно
    // сдвинулся — неподвижный телефон не жжёт видеокарту.
    run(canvas) {
        const t = { x: 0, y: 0 }, last = { x: 9, y: 9 };
        // кончик нитки — упругая цепочка (src/core/hang.js): гнётся кончик,
        // а не весь хвостик целиком; тяжесть — по наклону телефона
        const tail = { s: Hang.create(GreedJunk.TAIL.len, GreedJunk.TAIL.root, 'thread'), shown: null };
        // красная лампа на проводах — тоже подвес, с тяжёлым грузом
        const lamp = GreedJunk.lampHang();
        const loop = (now) => {
            if (!canvas.isConnected) return;
            if (this.live) {
                const g = Hang.down();
                Hang.step(tail.s, g);
                Hang.step(lamp, g);
                const glow = this.glowStep(now);
                const key = tail.s.th.concat(lamp.th).map(v => v.toFixed(3)).join(',') + this.GLOW_ORDER.map(k => glow[k].toFixed(2)).join(',');
                if (key !== tail.shown) {
                    tail.shown = key;
                    this.live.innerHTML = GreedJunk.haloDefs() +
                        ['pear', 'flame', 'globe'].map(k => GreedJunk.bulbGlow(k, glow[k])).join('') +
                        GreedJunk.threadTail(tail.s) + GreedJunk.hangLamp(lamp, glow.red);
                }
            }
            const T = (typeof Tilt !== 'undefined' && Tilt.turn) ? Tilt.turn() : { live: false };
            const want = T.live ? T : { x: 0, y: 0 };
            t.x += (want.x - t.x) * 0.15; t.y += (want.y - t.y) * 0.15;
            if (Math.abs(t.x - last.x) > 0.002 || Math.abs(t.y - last.y) > 0.002) {
                last.x = t.x; last.y = t.y;
                this.draw(this.lightFor(t));
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    },

    // ---------- МИГАНИЕ ПРИ ВЫИГРЫШЕ ----------
    // blink() — выигрыш: огонёк бежит по лампам слева направо три круга,
    // потом все разом мигают дважды. Накал не прыгает: нить разгорается
    // быстро, а гаснет медленнее (остывает, краснея), — по этому лампа
    // накаливания и отличается от светодиода. Часы — отметка кадра
    // requestAnimationFrame: это анимация, а не состояние игры.
    GLOW_ORDER: ['pear', 'flame', 'red', 'globe'],
    CHASE: { step: 110, rounds: 3, flash: 220, flashes: 2 },
    glow: { pear: 0, flame: 0, red: 0, globe: 0 },
    blink() { this._blinkAt = -1; },
    glowStep(now) {
        if (this._blinkAt === -1) this._blinkAt = now;
        const C = this.CHASE, O = this.GLOW_ORDER, t = this._blinkAt == null ? Infinity : now - this._blinkAt;
        const chase = C.step * O.length * C.rounds;
        O.forEach((k, i) => {
            let on = false;
            if (t < chase) on = Math.floor(t / C.step) % O.length === i;
            else if (t < chase + C.flash * 2 * C.flashes) on = Math.floor((t - chase) / C.flash) % 2 === 0;
            const v = this.glow[k];
            this.glow[k] = on ? v + (1 - v) * 0.55 : (v < 0.01 ? 0 : v * 0.82);
        });
        return this.glow;
    },

    // ---------- ПРЕВЬЮ ИЗ ОТЛАДКИ ----------
    // 🐞 → «Аппарат»: корпус на весь экран, свет от наклона. Тап — закрыть.
    // Корпус в игру ещё не встроен, а свет надо проверить на телефоне.
    // Без видеокарты показывается рисунок с нарисованным светом.
    async preview() {
        const old = document.getElementById('gj-preview');
        if (old) { old.remove(); return; }
        const host = document.getElementById('game-container') || document.body;
        const box = document.createElement('div');
        box.id = 'gj-preview';
        box.style.cssText = 'position:absolute;inset:0;z-index:100001;display:flex;align-items:center;' +
            'justify-content:center;background:' + PALETTE.greedJunk.hole;
        // тап по полке с лампами — показать мигание выигрыша, в любом
        // другом месте — закрыть
        box.addEventListener('click', (e) => {
            const r = (this.live && this.live.getBoundingClientRect()) || { top: 0, height: 1 };
            const y = (e.clientY - r.top) / r.height * GreedJunk.H;
            if (y > 440 && y < 520) this.blink(); else box.remove();
        });
        host.appendChild(box);
        // корпус и живой слой поверх — в одной обёртке с пропорцией корпуса
        const wrap = document.createElement('div');
        wrap.style.cssText = `position:relative;width:min(100%, calc(100vh * ${GreedJunk.W} / ${GreedJunk.H}));` +
            `aspect-ratio:${GreedJunk.W}/${GreedJunk.H}`;
        box.appendChild(wrap);
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0';
        wrap.appendChild(canvas);
        const live = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        live.setAttribute('viewBox', `0 0 ${GreedJunk.W} ${GreedJunk.H}`);
        live.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';
        wrap.appendChild(live);
        this.live = live;
        let ok = false;
        try { ok = await this.init(canvas); } catch (e) { console.warn('[Аппарат] свет шейдером не собрался', e); }
        if (!ok) {
            wrap.innerHTML = GreedJunk.bodySvg('baked').replace('<svg ', '<svg style="position:absolute;inset:0;width:100%;height:100%" ');
            return;
        }
        this.draw();
        this.run(canvas);
    },

    draw(light) {
        const gl = this.gl, p = this.prog;
        if (!gl) return;
        const L = light || this.LIGHT;
        const n = Math.hypot(L[0], L[1], L[2]) || 1;
        gl.viewport(0, 0, this.size[0], this.size[1]);
        gl.useProgram(p);
        ['uA', 'uH', 'uM'].forEach((u, i) => gl.uniform1i(gl.getUniformLocation(p, u), i));
        gl.uniform2f(gl.getUniformLocation(p, 'uTex'), 1 / this.size[0], 1 / this.size[1]);
        gl.uniform3f(gl.getUniformLocation(p, 'uL'), L[0] / n, L[1] / n, L[2] / n);
        // крутизна — под шкалу карты высот: при шкале 24 было 9
        gl.uniform1f(gl.getUniformLocation(p, 'uRelief'), 9.0 * GreedJunk.HMAX / 24);
        gl.uniform2f(gl.getUniformLocation(p, 'uHMap'), GreedJunk.H0, GreedJunk.HMAX);
        gl.uniform1f(gl.getUniformLocation(p, 'uPxPerH'), GreedJunk.HMAX * this.SCALE);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
};
