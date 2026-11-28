// ================= СВЕТ ШЕЙДЕРОМ: ВИДЕОКАРТА =================
// Вторая половина технологии (первая — разметка проходов, src/core/lit.js).
// Сцена приходит тремя картами — цвет без света, высоты, материалы, — и
// видеокарта освещает её ОДНИМ светом на весь кадр (docs/materials.md):
//
//   * нормаль — из карты высот, один раз на карту (своим проходом);
//   * рассеянный — нормирован так, что ровная поверхность выходит ровно своим
//     цветом: свет лепит рельеф, а не перекрашивает;
//   * блик — по материалу, у металла окрашен его цветом;
//   * тень — шагами по карте высот к свету: длина выходит сама, от разницы
//     высот, у всех деталей в одну сторону;
//   * глубина — то, что ниже стены (щели), темнее;
//   * лампы — до четырёх точечных источников в самой сцене (лампы зеркала
//     гримёрки): тёплые пятна на стене и бликах, без своей тени;
//   * зеркало — по желанию: прямоугольник стекла, в котором лежит картинка
//     отражённой комнаты, сдвинутая наклоном телефона (глубина), и косой
//     отсвет, бегущий по стеклу за наклоном.
//
// Счёт нормалей, рассеянного, блика и тени перенесён из аппарата алчности
// (greed-junk-lit.js) как есть — там он проверен на телефоне. Аппарат пока
// живёт на своей копии; перевести его сюда — отдельная работа.
//
// ---------- ЧТО ДЕЛАЕТСЯ ЗАРАНЕЕ ----------
// Растр SVG идёт при ПЕРВОЙ ОТРИСОВКЕ картинки, а не при её загрузке, — и
// это секунды на телефоне (docs/traps.md, п. 172). Поэтому карты рисуются
// в холст сразу, по одной, с отдачей потока между ними, и всё это — пока
// игрок смотрит на покров перехода, а не на игру.
const LitGL = {
    // Свет по умолчанию — сверху-слева, как нарисован руками (LIGHT в
    // palette.js): x влево, y вверх, довольно высоко над сценой.
    LIGHT: [-0.45, -0.55, 0.70],
    TILT_MAX: 30,
    LIGHT_CONE: 32,

    // Свет стоит в мире, наклон поворачивает под ним сцену — та же матрица
    // и тот же предельный угол, что у аппарата алчности и кучи монет: все
    // места ведут себя одинаково, и направление проверено на телефоне.
    lightFor(t, base) {
        const B = base || this.LIGHT;
        const D = Math.PI / 180, ay = t.x * this.TILT_MAX * D, ax = t.y * this.TILT_MAX * D;
        const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
        const M = [cy, sx * sy, -cx * sy, 0, cx, sx, sy, -sx * cy, cx * cy];
        const L = [B[0], -B[1], B[2]];
        const r = [M[0] * L[0] + M[1] * L[1] + M[2] * L[2],
                   M[3] * L[0] + M[4] * L[1] + M[5] * L[2],
                   M[6] * L[0] + M[7] * L[1] + M[8] * L[2]];
        // Свет не подходит к оси экрана ближе LIGHT_CONE: иначе острый блик
        // загорается на каждой ровной поверхности разом (урок аппарата).
        const len = Math.hypot(r[0], r[1], r[2]) || 1, zMax = Math.cos(this.LIGHT_CONE * D) * len;
        if (r[2] > zMax) {
            let hx = r[0], hy = r[1], hl = Math.hypot(hx, hy);
            if (hl < 1e-4) { hx = L[0]; hy = L[1]; hl = Math.hypot(hx, hy); }
            const k = Math.sqrt(len * len - zMax * zMax) / hl;
            r[0] = hx * k; r[1] = hy * k; r[2] = zMax;
        }
        const out = [r[0], -r[1], Math.max(0.15, r[2])];
        const n = Math.hypot(out[0], out[1], out[2]) || 1;
        return out.map(v => v / n);
    },

    // SVG-строка → картинка → холст нужного размера. Холст, а не картинка:
    // только отрисовка в холст гарантирует, что растр уже случился.
    raster(svg, w, h) {
        return new Promise((resolve, reject) => {
            const sized = svg.replace('<svg ', `<svg width="${w}" height="${h}" `);
            const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                try {
                    const cv = document.createElement('canvas');
                    cv.width = w; cv.height = h;
                    cv.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(cv);
                } catch (e) { reject(e); }
            };
            img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
            img.src = url;
        });
    },
    // Отдать поток браузеру между тяжёлыми шагами: покров перехода должен
    // успевать рисовать свои кадры.
    yieldFrame() { return new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); },

    // ---------- СБОРКА ----------
    // opts:
    //   W, H        — поле сцены в единицах; scale — текселей на единицу;
    //   H0, HMAX    — размах карты высот (как у набора Lit.kit);
    //   svg(pass)   — рисунок сцены в проходе 'albedo' | 'height' | 'mat';
    //   lights      — [{ x, y, z, r, rgb }] в единицах сцены, до четырёх;
    //   key, amb    — сила основного света и доля рассеянного (0..1);
    //   keyRgb      — цвет основного света;
    //   vignette    — насколько темнеют углы (0 — никак);
    //   mirror      — { x, y, w, h, r, svg(), pad } — стекло и отражение;
    //   depthK      — насколько темнеет то, что ниже стены.
    // Возвращает рендерер или null, если видеокарты нет.
    async create(canvas, opts) {
        const O = Object.assign({ scale: 2, key: 1, amb: 0.42, keyRgb: [1, 1, 1], vignette: 0, depthK: 0.25,
                                  shadow: 0.5, lights: [] }, opts);
        const W = Math.round(O.W * O.scale), H = Math.round(O.H * O.scale);
        canvas.width = W; canvas.height = H;
        let gl = null;
        // Сцена непрозрачна целиком — холст без альфы композитор сводит дешевле.
        try {
            gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: false, antialias: false,
                                              preserveDrawingBuffer: false });
        } catch (e) { gl = null; }
        if (!gl) return null;
        const R = Object.create(this.Renderer);
        R.gl = gl; R.canvas = canvas; R.O = O; R.size = [W, H]; R.alive = true;
        canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R.alive = false; if (R.onLost) R.onLost(); });

        // Карты — по одной, с отдачей потока: растр каждой — заметная работа.
        const maps = [];
        for (const pass of ['albedo', 'height', 'mat']) {
            maps.push(await this.raster(O.svg(pass), W, H));
            await this.yieldFrame();
            if (!R.alive) return null;
        }
        let refl = null;
        if (O.mirror && O.mirror.svg) {
            const M = O.mirror, pad = M.pad || 0;
            const rw = Math.round((M.w + pad * 2) * O.scale), rh = Math.round((M.h + pad * 2) * O.scale);
            refl = await this.raster(M.svg(), rw, rh);
            await this.yieldFrame();
            if (!R.alive) return null;
        }

        try {
            R.prog = this.program(gl, !!refl, O.dbg ? this.DBG_TERMS[O.dbg] : 0);
            R.tex = maps.map((cv, i) => this.texture(gl, cv, i, i === 0));
            if (refl) R.texR = this.texture(gl, refl, 4, true, true);
            // Холсты карт больше не нужны: пиксели уже в видеокарте, а держать
            // их в памяти страницы — ещё по пять мегабайт на карту.
            maps.forEach(cv => { cv.width = 0; cv.height = 0; });
            if (refl) { refl.width = 0; refl.height = 0; }
            const buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
            R.texN = this.normals(gl, R.tex[1], W, H, O);
            R.bind();
        } catch (e) {
            if (typeof console !== 'undefined') console.error('[lit] сборка шейдера: ' + e.message);
            R.destroy();
            return null;
        }
        return R;
    },

    texture(gl, src, unit, premul, linear) {
        const t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !!premul);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        // Размеры не степени двойки: без мипмапов и с обрезкой по краю.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    },

    link(gl, vs, fs) {
        const sh = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
            return s;
        };
        const p = gl.createProgram();
        gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
        gl.bindAttribLocation(p, 0, 'aPos');
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        return p;
    },

    // ---------- НОРМАЛИ — ОДИН РАЗ НА КАРТУ ----------
    // r,g — нормаль xy, b,a — уклон вдоль x и y для тени. Соседи в четырёх
    // текселях (фаска шире контура), высота усреднена крестом (карта
    // 8-битная, пологий скат иначе идёт ступеньками), соседи не выше самой
    // точки (иначе вокруг деталей светится ореол). Всё — как у аппарата.
    normals(gl, ht, W, H, O) {
        const vs = `attribute vec2 aPos; varying vec2 vUv;
            void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
        const fs = `precision highp float;
            uniform sampler2D uH; uniform vec2 uTex; uniform float uRelief;
            varying vec2 vUv;
            float hh(vec2 p) { return texture2D(uH, p).r; }
            float hs(vec2 p) {
                return (hh(p) * 2.0 + hh(p + vec2(uTex.x, 0.0)) + hh(p - vec2(uTex.x, 0.0)) +
                        hh(p + vec2(0.0, uTex.y)) + hh(p - vec2(0.0, uTex.y))) / 6.0;
            }
            void main() {
                vec2 d = uTex * 3.0;
                float h0s = hs(vUv);
                float hl = min(hs(vUv - vec2(d.x, 0.0)), h0s), hr = min(hs(vUv + vec2(d.x, 0.0)), h0s);
                float hu = min(hs(vUv - vec2(0.0, d.y)), h0s), hd = min(hs(vUv + vec2(0.0, d.y)), h0s);
                vec3 n = normalize(vec3((hl - hr) * uRelief, (hu - hd) * uRelief, 1.0));
                float gx = (hh(vUv + vec2(d.x, 0.0)) - hh(vUv - vec2(d.x, 0.0))) / 6.0;
                float gy = (hh(vUv + vec2(0.0, d.y)) - hh(vUv - vec2(0.0, d.y))) / 6.0;
                gl_FragColor = vec4(n.xy * 0.5 + 0.5, gx * 4.0 + 0.5, gy * 4.0 + 0.5);
            }`;
        const p = this.link(gl, vs, fs);
        const nt = gl.createTexture();
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, nt);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, nt, 0);
        gl.viewport(0, 0, W, H);
        gl.useProgram(p);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ht);
        gl.uniform1i(gl.getUniformLocation(p, 'uH'), 1);
        gl.uniform2f(gl.getUniformLocation(p, 'uTex'), 1 / W, 1 / H);
        gl.uniform1f(gl.getUniformLocation(p, 'uRelief'), O.relief || (9.0 * O.HMAX / 24));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(fb);
        gl.deleteProgram(p);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, nt);
        return nt;
    },

    // ---------- ОСНОВНОЙ ПРОХОД ----------
    // Координаты экранные: x вправо, y ВНИЗ, z к зрителю. uL — направление
    // НА источник. Точка сцены p — в сотнях единиц (mediump держит).
    // Отладочный вывод одного слагаемого вместо цвета — для ревизии
    // (tools/pride-room-audit.js, тот же приём, что у аппарата алчности).
    // Игра собирает программу без него.
    DBG_TERMS: { normal: 1, shade: 2, lit: 3, lamps: 4, spec: 5, depth: 6, height: 7, ao: 8, plane: 9, noshade: 10 },
    program(gl, mirror, dbg) {
        const vs = `attribute vec2 aPos; varying vec2 vUv;
            void main() { vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); gl_Position = vec4(aPos, 0.0, 1.0); }`;
        const fs = `precision mediump float;
            ${mirror ? '#define MIRROR 1' : ''}
            ${dbg ? '#define DBG ' + dbg : ''}
            uniform sampler2D uA, uH, uM, uN, uR;
            uniform vec2 uTex;
            uniform vec3 uL;
            uniform float uPxPerH;
            uniform vec2 uHMap;          // (H0, HMAX): h = v * HMAX − H0
            uniform vec2 uField;         // поле сцены, сотни единиц
            uniform vec3 uKeyC;          // основной свет: цвет × сила
            uniform float uAmb, uShadow, uDepthK, uVig;
            uniform vec3 uLP[4], uLC[4];
            uniform float uLR[4];
            uniform vec4 uMir;           // стекло: x, y, w, h (сотни единиц)
            uniform float uMirR;         // скругление угла стекла
            uniform vec4 uRBox;          // картинка отражения: x, y, w, h
            uniform vec2 uROff;          // сдвиг отражения наклоном (сотни единиц)
            uniform float uStreak;       // где на стекле косой отсвет
            uniform float uAO;           // сила затенения во впадинах и у стыков
            uniform vec2 uFloor;         // пол: (строка стыка в uv, сила отражения)
            varying vec2 vUv;
            float hh(vec2 p) { return texture2D(uH, p).r; }
            void main() {
                vec4 a = texture2D(uA, vUv);
                vec2 P = vUv * uField;
                vec4 nq = texture2D(uN, vUv);
                vec2 nxy = nq.xy * 2.0 - 1.0;
                vec3 n = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
                float h0 = hh(vUv);
                vec4 m = texture2D(uM, vUv);
                float glass = 0.0;
                #ifdef MIRROR
                // Стекло зеркала: скруглённый прямоугольник. В нём вместо
                // рисунка — отражённая комната, сдвинутая наклоном: дальнее
                // в зеркале ездит относительно рамы, и стекло читается
                // глубиной, а не картинкой.
                vec2 mc = uMir.xy + uMir.zw * 0.5;
                vec2 q = abs(P - mc) - (uMir.zw * 0.5 - vec2(uMirR));
                float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uMirR;
                glass = 1.0 - smoothstep(-0.004, 0.004, sd);
                // Стекло — ещё и по материалу: всё, что лежит поверх него
                // (фотокарточки за рамой, гнёзда ламп), остаётся собой, а не
                // становится куском отражения.
                glass *= step(0.9, m.r) * step(0.93, m.g) * (1.0 - step(0.5, m.b));
                if (glass > 0.0) {
                    vec2 ru = (P - uRBox.xy + uROff) / uRBox.zw;
                    vec3 rc = texture2D(uR, ru).rgb;
                    a.rgb = mix(a.rgb, rc, glass * 0.92);
                }
                #endif

                // рассеянный: ровная поверхность = свой цвет
                float lit = (uAmb + (1.0 - uAmb) * max(dot(n, uL), 0.0)) / (uAmb + (1.0 - uAmb) * uL.z);

                // тень: шаги к свету по карте высот (уклон своей плоскости
                // вычтен — ровный скат не затеняет сам себя)
                vec2 dir = normalize(uL.xy);
                float rise = uL.z / length(uL.xy) / uPxPerH;
                float gx = (nq.z - 0.5) / 4.0, gy = (nq.w - 0.5) / 4.0;
                float plane = max(rise, dot(vec2(gx, gy), dir));
                float jit = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
                float occ = 0.0;
                for (int i = 1; i <= 20; i++) {
                    float t = (float(i) - jit) * 3.0;
                    float hs = hh(vUv + dir * uTex * t);
                    occ = max(occ, clamp((hs - (h0 + t * plane) - 0.008) * 5.0, 0.0, 1.0));
                }
                float sh = 1.0 - uShadow * occ;

                // Затенение у стыков: соседи выше точки по четырём сторонам —
                // значит, она в углу или под карнизом, и света туда попадает
                // меньше, откуда бы он ни шёл. Четыре чтения карты, а под
                // карнизом, у плинтуса и вокруг шкафа появляется воздух.
                float ao = 0.0;
                vec2 ar = uTex * 12.0;
                ao += clamp((hh(vUv + vec2(ar.x, 0.0)) - h0) * 9.0, 0.0, 1.0);
                ao += clamp((hh(vUv - vec2(ar.x, 0.0)) - h0) * 9.0, 0.0, 1.0);
                ao += clamp((hh(vUv + vec2(0.0, ar.y)) - h0) * 9.0, 0.0, 1.0);
                ao += clamp((hh(vUv - vec2(0.0, ar.y)) - h0) * 9.0, 0.0, 1.0);
                float occl = 1.0 - uAO * ao * 0.25;

                // блик по материалу: острый на гранях и широкий мягкий на ровном
                vec3 hv = normalize(uL + vec3(0.0, 0.0, 1.0));
                float nh = max(dot(n, hv), 0.0);
                float shin = mix(6.0, 90.0, m.g);
                float sp = m.r * (pow(nh, shin) + 0.3 * m.g * pow(nh, 3.0) - 0.21 * m.g * pow(uL.z * 0.5 + 0.5, 3.0));
                vec3 spc = mix(vec3(1.0), a.rgb * 1.5, m.b);

                // глубина: ниже стены — темнее
                float hu0 = h0 * uHMap.y - uHMap.x;
                float depth = mix(1.0 - uDepthK, 1.0, clamp((hu0 + uHMap.x) / max(uHMap.x, 0.001), 0.0, 1.0));

                // лампы сцены: спад 1/(1+(d/r)²), рассеянный с «обёрткой»
                vec3 pf = vec3(P, hu0 / 100.0);
                vec3 ld = vec3(0.0), ls = vec3(0.0);
                float edge = smoothstep(0.35, 0.8, n.z);
                for (int i = 0; i < 4; i++) {
                    vec3 d = uLP[i] - pf;
                    float dist = length(d);
                    vec3 l = d / max(dist, 0.001);
                    float att = 1.0 / (1.0 + dist * dist / (uLR[i] * uLR[i]));
                    vec3 e = uLC[i] * att;
                    ld += e * max((dot(n, l) + 0.15) / 1.15, 0.0);
                    float nhl = max(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0);
                    ls += e * edge * pow(nhl, shin);
                }

                // углы кадра чуть темнее: свет собран у зеркала
                vec2 vq = (vUv - vec2(0.42, 0.42)) * vec2(1.15, 0.8);
                float vig = 1.0 - uVig * smoothstep(0.2, 0.75, length(vq));

                vec3 col = a.rgb * (lit * sh * uKeyC + ld) * depth * vig * occl
                         + spc * sp * sh * uKeyC + spc * ls * m.r;
                // Лакированный пол отражает то, что стоит на нём: та же
                // картинка, перевёрнутая о строку стыка, слабо и с затуханием.
                // Одно чтение — и паркет становится лаком, а не обоями.
                if (uFloor.y > 0.0 && vUv.y > uFloor.x) {
                    float dy = vUv.y - uFloor.x;
                    vec2 ru = vec2(vUv.x, uFloor.x - dy * 1.15);
                    float fade = (1.0 - smoothstep(0.0, 0.16, dy)) * uFloor.y * m.r * 2.0;
                    col = mix(col, texture2D(uA, ru).rgb * 0.8, clamp(fade, 0.0, 0.35));
                }
                #ifdef MIRROR
                if (glass > 0.0) {
                    // Косой отсвет бежит по стеклу за наклоном: одна дешёвая
                    // полоса, и зеркало «живёт» даже при ровном свете.
                    vec2 lq = (P - mc) / uMir.zw;
                    float k = dot(lq, normalize(vec2(1.0, -0.62))) - uStreak;
                    float st = exp(-k * k * 90.0) * 0.22 + exp(-(k - 0.16) * (k - 0.16) * 400.0) * 0.12;
                    col += vec3(1.0, 0.97, 0.9) * st * glass;
                }
                #endif
                gl_FragColor = vec4(col, 1.0);
                #ifdef DBG
                vec3 dv = col;
                #if DBG == 1
                dv = vec3(n.xy * 0.5 + 0.5, n.z);
                #elif DBG == 2
                dv = vec3(sh);
                #elif DBG == 3
                dv = vec3(lit * 0.5);
                #elif DBG == 4
                dv = ld;
                #elif DBG == 5
                dv = spc * sp * sh * uKeyC + spc * ls * m.r;
                #elif DBG == 6
                dv = vec3(depth);
                #elif DBG == 7
                dv = vec3(h0);
                #elif DBG == 8
                dv = vec3(occl);
                #elif DBG == 9
                dv = vec3(0.5 + gx * 40.0, 0.5 + gy * 40.0, plane * 20.0);
                #elif DBG == 10
                dv = a.rgb * (lit * uKeyC + ld) * depth;
                #endif
                gl_FragColor = vec4(dv, 1.0);
                #endif
            }`;
        return this.link(gl, vs, fs);
    },

    // ---------- РЕНДЕРЕР ----------
    Renderer: {
        bind() {
            const gl = this.gl, p = this.prog, O = this.O, u = (n) => gl.getUniformLocation(p, n);
            gl.useProgram(p);
            ['uA', 'uH', 'uM', 'uN', 'uR'].forEach((k, i) => gl.uniform1i(u(k), i));
            gl.uniform2f(u('uTex'), 1 / this.size[0], 1 / this.size[1]);
            gl.uniform1f(u('uPxPerH'), O.HMAX * O.scale);
            gl.uniform2f(u('uHMap'), O.H0, O.HMAX);
            gl.uniform2f(u('uField'), O.W / 100, O.H / 100);
            gl.uniform3f(u('uKeyC'), O.keyRgb[0] * O.key, O.keyRgb[1] * O.key, O.keyRgb[2] * O.key);
            gl.uniform1f(u('uAmb'), O.amb);
            gl.uniform1f(u('uShadow'), O.shadow);
            gl.uniform1f(u('uDepthK'), O.depthK);
            gl.uniform1f(u('uVig'), O.vignette);
            gl.uniform1f(u('uAO'), O.ao || 0);
            gl.uniform2f(u('uFloor'), O.floorY ? O.floorY / O.H : 0, O.floorY ? (O.floorGloss || 0.12) : 0);
            const L = O.lights.slice(0, 4);
            while (L.length < 4) L.push({ x: 0, y: 0, z: 0, r: 1, rgb: [0, 0, 0] });
            gl.uniform3fv(u('uLP'), L.flatMap(s => [s.x / 100, s.y / 100, s.z / 100]));
            gl.uniform3fv(u('uLC'), L.flatMap(s => s.rgb));
            gl.uniform1fv(u('uLR'), L.map(s => s.r / 100));
            if (O.mirror) {
                const M = O.mirror, pad = M.pad || 0;
                gl.uniform4f(u('uMir'), M.x / 100, M.y / 100, M.w / 100, M.h / 100);
                gl.uniform1f(u('uMirR'), (M.r || 0) / 100);
                gl.uniform4f(u('uRBox'), (M.x - pad) / 100, (M.y - pad) / 100, (M.w + pad * 2) / 100, (M.h + pad * 2) / 100);
            }
            this.U = { L: u('uL'), ROff: u('uROff'), Streak: u('uStreak') };
            // Текстуры стоят на своих блоках с самой сборки, и других
            // программ в этом контексте нет — привязывать их заново на каждый
            // кадр незачем.
        },

        // Наклон t = { x, y } (−1..1) → свет, сдвиг отражения, отсвет.
        draw(t) {
            if (!this.alive) return;
            const gl = this.gl, O = this.O;
            const T = t || { x: 0, y: 0 };
            const L = LitGL.lightFor(T, O.light);
            gl.viewport(0, 0, this.size[0], this.size[1]);
            gl.useProgram(this.prog);
            gl.uniform3f(this.U.L, L[0], L[1], L[2]);
            if (O.mirror) {
                const s = O.mirror.shift || 0;
                gl.uniform2f(this.U.ROff, T.x * s / 100, T.y * s / 100);
                gl.uniform1f(this.U.Streak, -0.3 + T.x * 0.55 - T.y * 0.25);
            }
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        },

        // Контекст отдаётся сразу: оставленный жить, он держит десятки
        // мегабайт видеопамяти до сборки мусора (docs/traps.md, п. 172).
        destroy() {
            const gl = this.gl;
            this.alive = false;
            if (!gl) return;
            try {
                (this.tex || []).concat([this.texN, this.texR]).forEach(t => { if (t) gl.deleteTexture(t); });
                if (this.prog) gl.deleteProgram(this.prog);
                const ext = gl.getExtension('WEBGL_lose_context');
                if (ext) ext.loseContext();
            } catch (e) { /* контекст уже потерян — отдавать нечего */ }
            this.gl = null;
            if (this.canvas) { this.canvas.width = 1; this.canvas.height = 1; }
        }
    }
};

if (typeof window !== 'undefined') window.LitGL = LitGL;
