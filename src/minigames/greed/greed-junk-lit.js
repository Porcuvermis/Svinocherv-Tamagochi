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
            varying vec2 vUv;
            float hh(vec2 p) { return texture2D(uH, p).r; }
            void main() {
                vec4 a = texture2D(uA, vUv);
                if (a.a < 0.004) { gl_FragColor = vec4(0.0); return; }
                // Нормаль по соседям в четырёх текселях, а не в одном: фаска
                // шире чёрного контура, иначе контур её целиком закрывает
                vec2 d = uTex * 4.0;
                float hl = hh(vUv - vec2(d.x, 0.0)), hr = hh(vUv + vec2(d.x, 0.0));
                float hu = hh(vUv - vec2(0.0, d.y)), hd = hh(vUv + vec2(0.0, d.y));
                vec3 n = normalize(vec3((hl - hr) * uRelief, (hu - hd) * uRelief, 1.0));
                float h0 = hh(vUv);

                // рассеянный: ровная поверхность = свой цвет
                float amb = 0.42;
                float lit = (amb + (1.0 - amb) * max(dot(n, uL), 0.0)) / (amb + (1.0 - amb) * uL.z);

                // тень: шаги к свету по карте высот
                vec2 dir = normalize(uL.xy);
                float rise = uL.z / length(uL.xy) / uPxPerH;   // подъём луча на тексел
                float occ = 0.0;
                for (int i = 1; i <= 20; i++) {
                    float t = float(i) * 3.0;
                    float hs = hh(vUv + dir * uTex * t);
                    occ = max(occ, clamp((hs - (h0 + t * rise)) * 14.0, 0.0, 1.0));
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
                float depth = mix(0.72, 1.0, clamp((h0 - 0.1) / 0.5, 0.0, 1.0));

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
        gl.uniform1f(gl.getUniformLocation(p, 'uRelief'), 9.0);
        gl.uniform1f(gl.getUniformLocation(p, 'uPxPerH'), GreedJunk.HMAX * this.SCALE);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
};
