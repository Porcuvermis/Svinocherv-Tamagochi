// ================= АППАРАТ АЛЧНОСТИ: ОСВЕЩЁННЫЙ ПРИБОР =================
// Продолжение GreedJunkLit. Прибор — то, что живёт поверх корпуса своим
// холстом и своим светом: колесо фортуны, короб пачинко. Его детали
// нарисованы в три карты (цвет, высоты, материал), свет считает маленький
// шейдер того же устройства, что у корпуса: рассеянный с тем же ambient,
// блик по материалу, тень шагами по карте высот. Нормаль и уклон — один раз
// в текстуру (normProgram корпуса).
//
// Деталь рисуется квадратом карты с поворотом вокруг точки (колесо
// крутится, язычок качается; неподвижное — поворот 0). Нормаль крутится с
// деталью, свет и тени — нет.
//
// Свой холст, а не корпус, затем, что прибор может выходить за поле
// аппарата (короб пачинко торчит над рамкой) и двигаться, не трогая
// перерисовку всего корпуса. Было: шейдер жил внутри колеса
// (greed-junk-lit-wheel.js, wheelGL) — пачинко понадобился тот же.
Object.assign(GreedJunkLit, {
    // холст прибора → { gl, U } или null, если видеокарты нет
    deviceGL(cv) {
        const gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true });
        if (!gl) return null;
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
            uniform sampler2D uA, uH, uM, uN;
            uniform vec2 uTex; uniform vec3 uL; uniform float uPxPerH, uRotF, uShade;
            varying vec2 vUv;
            float hh(vec2 p) { return texture2D(uH, p).r; }
            void main() {
                // режим тени: силуэт детали, размытый пятью отсчётами, —
                // только прозрачность (смешение затемняет то, что под ним)
                if (uShade > 0.0) {
                    vec2 q = uTex * 4.5;
                    float s = (texture2D(uA, vUv).a * 2.0 + texture2D(uA, vUv + vec2(q.x, 0.0)).a + texture2D(uA, vUv - vec2(q.x, 0.0)).a +
                               texture2D(uA, vUv + vec2(0.0, q.y)).a + texture2D(uA, vUv - vec2(0.0, q.y)).a) / 6.0;
                    gl_FragColor = vec4(0.0, 0.0, 0.0, s * uShade);
                    return;
                }
                vec4 a = texture2D(uA, vUv);
                if (a.a < 0.004) { gl_FragColor = vec4(0.0); return; }
                // Нормаль и уклон в координатах карты — готовые, из uN (тот же
                // счёт, что у корпуса: GreedJunkLit.normProgram, один раз при
                // сборке). Было — 30 чтений карты высот на точку каждого кадра.
                vec4 nq = texture2D(uN, vUv);
                vec2 nm = nq.xy * 2.0 - 1.0;
                float h0 = hh(vUv);
                // нормаль поворачивается вместе с колесом, свет — нет
                float c = cos(uRotF), s = sin(uRotF);
                vec3 n = vec3(c * nm.x - s * nm.y, s * nm.x + c * nm.y, sqrt(max(0.0, 1.0 - dot(nm, nm))));
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
                vec2 gq = (nq.zw - 0.5) / 4.0;
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
        // uRot у вершинного и фрагментного — разной точности (highp/mediump):
        // с одним именем программа не линкуется, во фрагмент угол идёт uRotF
        const pr = this.link(gl, vs, fs);
        gl.useProgram(pr);
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        const U = {};
        ['uC', 'uHalf', 'uPiv', 'uCanvas', 'uRot', 'uRotF', 'uShade', 'uA', 'uH', 'uM', 'uN', 'uTex', 'uL', 'uPxPerH'].forEach(k => { U[k] = gl.getUniformLocation(pr, k); });
        gl.uniform1i(U.uA, 0); gl.uniform1i(U.uH, 1); gl.uniform1i(U.uM, 2); gl.uniform1i(U.uN, 3);
        gl.uniform1f(U.uPxPerH, GreedJunk.HMAX * this.SCALE);
        gl.uniform2f(U.uCanvas, cv.width, cv.height);
        gl.uniform1f(U.uShade, 0);
        return { gl, U, pr, cv };
    },

    // Комплект текстур детали: [цвет, высоты, материал] (+ нормали — сами)
    // или [цвет] — только силуэт для тени.
    deviceSet(Q, maps) {
        const gl = Q.gl;
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
        const st = { t: maps.map((img, i) => tex(img, i === 0)), w: maps[0].width, h: maps[0].height };
        if (maps.length < 2) return st;
        // Нормали карты высот (t[1]) — один раз, в четвёртую текстуру
        // комплекта: программа корпуса (normProgram) в кадровый буфер.
        // Смешение на это время выключено — оно испортило бы b,a (уклон).
        if (!Q.np) { Q.np = this.normProgram(gl); Q.fb = gl.createFramebuffer(); }
        const np = Q.np;
        const nt = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, nt);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, st.w, st.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        const blend = gl.isEnabled(gl.BLEND);
        gl.disable(gl.BLEND);
        gl.bindFramebuffer(gl.FRAMEBUFFER, Q.fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, nt, 0);
        gl.viewport(0, 0, st.w, st.h);
        gl.useProgram(np);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, st.t[1]);
        gl.uniform1i(gl.getUniformLocation(np, 'uH'), 1);
        gl.uniform2f(gl.getUniformLocation(np, 'uTex'), 1 / st.w, 1 / st.h);
        gl.uniform1f(gl.getUniformLocation(np, 'uRelief'), 9.0 * GreedJunk.HMAX / 24);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(Q.pr);
        if (blend) gl.enable(gl.BLEND);
        st.t.push(nt);
        return st;
    },

    // Начало кадра прибора: чистый холст, свет L (как из lightFor).
    deviceBegin(Q, L) {
        const gl = Q.gl, n = Math.hypot(L[0], L[1], L[2]) || 1;
        gl.viewport(0, 0, Q.cv.width, Q.cv.height);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform3f(Q.U.uL, L[0] / n, L[1] / n, L[2] / n);
        gl.uniform1f(Q.U.uShade, 0);
    },

    // Режим тени: k > 0 — силуэт детали темнит то, что уже нарисовано, с
    // силой k, не трогая прозрачность (где холст пуст, тени нет); 0 — обычный.
    deviceShade(Q, k) {
        const gl = Q.gl;
        if (k > 0) gl.blendFuncSeparate(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
        else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform1f(Q.U.uShade, k);
    },

    // Деталь в картинку: комплект set, освещённый светом L, в 2D-холст
    // w×h точек — во внеэкранный буфер прибора, без его холста. Для мелкого
    // движущегося (шарик пачинко): свет считается шейдером при смене света,
    // а в полёте рисуется готовая картинка.
    deviceSprite(Q, set, w, h, L) {
        const gl = Q.gl, U = Q.U, n = Math.hypot(L[0], L[1], L[2]) || 1;
        if (!Q.sfb) {
            Q.sfb = gl.createFramebuffer();
            Q.stex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, Q.stex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            Q.sw = w; Q.sh = h;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, Q.sfb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, Q.stex, 0);
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform3f(U.uL, L[0] / n, L[1] / n, L[2] / n);
        gl.uniform1f(U.uShade, 0);
        gl.uniform2f(U.uCanvas, w, h);
        set.t.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); });
        gl.uniform2f(U.uTex, 1 / set.w, 1 / set.h);
        gl.uniform2f(U.uC, w / 2, h / 2); gl.uniform2f(U.uHalf, w / 2, h / 2); gl.uniform2f(U.uPiv, 0, 0);
        gl.uniform1f(U.uRot, 0); gl.uniform1f(U.uRotF, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.uniform2f(U.uCanvas, Q.cv.width, Q.cv.height);
        // буфер — снизу вверх и с умноженной прозрачностью: перевернуть и
        // разделить, 2D-холст ждёт обычную
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const g = cv.getContext('2d'), im = g.createImageData(w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const s = ((h - 1 - y) * w + x) * 4, d = (y * w + x) * 4, a = px[s + 3];
            const k = a ? 255 / a : 0;
            im.data[d] = Math.min(255, px[s] * k); im.data[d + 1] = Math.min(255, px[s + 1] * k); im.data[d + 2] = Math.min(255, px[s + 2] * k); im.data[d + 3] = a;
        }
        g.putImageData(im, 0, 0);
        return cv;
    },

    // Деталь: квадрат карты с серединой (cx, cy) и полуразмерами hw×hh в
    // единицах поля, повёрнутый на rot вокруг точки, смещённой от середины на
    // (pivX, pivY). box — участок поля, который занимает холст прибора.
    deviceDraw(Q, box, set, cx, cy, hw, hh, rot = 0, pivX = 0, pivY = 0) {
        const gl = Q.gl, U = Q.U, S = this.SCALE;
        set.t.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); });
        gl.uniform2f(U.uTex, 1 / set.w, 1 / set.h);
        gl.uniform2f(U.uC, (cx - box.x) * S, (cy - box.y) * S);
        gl.uniform2f(U.uHalf, hw * S, hh * S);
        gl.uniform2f(U.uPiv, pivX * S, pivY * S);
        // угол копится оборотами; mediump во фрагменте его не удержит — в 0..2π
        const r = rot - Math.floor(rot / (2 * Math.PI)) * 2 * Math.PI;
        gl.uniform1f(U.uRot, r); gl.uniform1f(U.uRotF, r);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
});
