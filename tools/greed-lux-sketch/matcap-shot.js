const { chromium } = require('playwright');
const fs = require('fs');

// Проба «отражения окружения» (matcap) на тех же трёх картах, что у деталей
// аппарата (chase2.py). Цвет металла и глянец лака берутся из маленькой
// картинки студии по направлению поверхности; наклон телефона сдвигает
// выборку — отражения бегут по изгибам. Одна выборка на точку.
// Игрок о свете одной лампой: «скучно, неинтересно» — золото ровной краской.
//   python3 chase2.py out/ && KIND=v NODE_PATH=... node matcap-shot.js out/ /tmp/m-
const dir = process.argv[2], out = process.argv[3] || '/tmp/m-', kind = process.env.KIND || 'v';
const W = 540, H = 435;
const TILTS = [['rest', 0, 0], ['left', -0.45, 0], ['right', 0.45, 0], ['near', 0, -0.45], ['far', 0, 0.45], ['corner', 0.35, 0.3]];

(async () => {
    const browser = await chromium.launch({ executablePath: require('../chrome-path') });
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', e => console.log('ERR', e.message));
    page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
    await page.setContent(`<body style="margin:0;background:#000"><canvas id="c" width="${W}" height="${H}"></canvas></body>`);
    const maps = ['albedo', 'height', 'mat'].map(p => 'data:image/svg+xml;base64,' + fs.readFileSync(`${dir}${kind}-${p}.svg`).toString('base64'));
    await page.evaluate(async (maps) => {
        const imgs = await Promise.all(maps.map(src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; })));
        // ---- студии: золото и лак ----
        const cap = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 256; draw(c.getContext('2d')); return c; };
        const goldCap = cap(g => {
            // середина (поверхность смотрит на зрителя) — тёплое золото;
            // к краю — тёмная коричневая «комната»; горизонт — тёмная полоса;
            // окна студии — светлые пятна: при наклоне по ним и бежит блик
            // Полированный металл — это КОНТРАСТ: светлая середина, тёмная
            // полоса горизонта, яркий ободок на скатах. Первая студия (ровный
            // спад к краю) давала ту же горчичную краску, что одна лампа.
            let r = g.createRadialGradient(128, 128, 6, 128, 128, 128);
            r.addColorStop(0, '#f1c55a'); r.addColorStop(0.3, '#d29a2c'); r.addColorStop(0.45, '#5a3408');
            r.addColorStop(0.6, '#2a1404'); r.addColorStop(0.78, '#a8701e'); r.addColorStop(0.92, '#ffe08a'); r.addColorStop(1, '#6a420e');
            g.fillStyle = r; g.fillRect(0, 0, 256, 256);
            g.fillStyle = 'rgba(16,8,2,0.85)'; g.fillRect(0, 146, 256, 22);
            const blob = (x, y, rx, ry, c, a) => { const q = g.createRadialGradient(x, y, 0, x, y, rx); q.addColorStop(0, c); q.addColorStop(1, 'rgba(255,240,200,0)');
                g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y); g.globalAlpha = a; g.fillStyle = q; g.beginPath(); g.arc(x, y, rx, 0, 7); g.fill(); g.restore(); };
            blob(84, 70, 46, 30, '#fff6d8', 1); blob(196, 92, 22, 60, '#ffe7a8', 0.8); blob(128, 214, 70, 12, '#ffd27a', 0.5);
        });
        const lacCap = cap(g => {
            g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
            const soft = (x, y, w, h, a) => { g.save(); g.filter = 'blur(6px)'; g.globalAlpha = a; g.fillStyle = '#fff'; g.fillRect(x, y, w, h); g.restore(); };
            soft(58, 46, 70, 40, 0.95); soft(190, 60, 12, 120, 0.6); soft(40, 200, 170, 6, 0.25);
        });
        const cv = document.getElementById('c'), gl = cv.getContext('webgl', { premultipliedAlpha: false });
        const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o)); return o; };
        const p = gl.createProgram();
        gl.attachShader(p, sh(gl.VERTEX_SHADER, 'attribute vec2 a; varying vec2 v; void main(){ v = a*0.5+0.5; v.y = 1.0 - v.y; gl_Position = vec4(a,0,1); }'));
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, `precision mediump float;
            uniform sampler2D uA, uH, uM, uG, uL; uniform vec2 uTex, uTilt; varying vec2 v;
            float h(vec2 q){ return texture2D(uH, q).r * 32.0; }
            void main(){
                // нормаль: крест через 2 текселя (единица поля — 3 текселя)
                float dx = (h(v + vec2(uTex.x*2.0, 0.0)) - h(v - vec2(uTex.x*2.0, 0.0))) / (4.0/3.0);
                float dy = (h(v + vec2(0.0, uTex.y*2.0)) - h(v - vec2(0.0, uTex.y*2.0))) / (4.0/3.0);
                vec3 n = normalize(vec3(-dx, dy, 1.0));
                vec3 a = texture2D(uA, v).rgb; vec4 m = texture2D(uM, v);
                // наклон телефона поворачивает «студию» относительно предмета
                vec3 nt = normalize(n + vec3(uTilt, 0.0));
                vec2 uv = vec2(nt.x, -nt.y) * 0.48 + 0.5;
                // затенение впадин: насколько точка ниже среднего вокруг
                float hc = h(v), ha = 0.0;
                for (int i = 0; i < 8; i++) { float t = float(i) * 0.785; ha += h(v + vec2(cos(t), sin(t)) * uTex * 7.0); }
                float ao = clamp(1.0 - max(0.0, ha / 8.0 - hc) * 0.35, 0.35, 1.0);
                vec3 c;
                if (m.b > 0.5) {
                    // металл: цвет — отражение, тон — от альбедо (золото/тёмное)
                    c = texture2D(uG, uv).rgb * (a / vec3(0.84, 0.68, 0.32));
                } else {
                    float dif = 0.55 + 0.45 * n.z;
                    c = a * dif + texture2D(uL, uv).rgb * m.r * (0.25 + 0.75 * pow(1.0 - n.z, 0.0));
                }
                gl_FragColor = vec4(c * ao, 1.0);
            }`));
        gl.linkProgram(p); gl.useProgram(p);
        const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        [imgs[0], imgs[1], imgs[2], goldCap, lacCap].forEach((im, i) => {
            const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.uniform1i(gl.getUniformLocation(p, ['uA', 'uH', 'uM', 'uG', 'uL'][i]), i);
        });
        gl.uniform2f(gl.getUniformLocation(p, 'uTex'), 1 / imgs[1].width, 1 / imgs[1].height);
        window.__draw = (x, y) => { gl.uniform2f(gl.getUniformLocation(p, 'uTilt'), x, y); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
    }, maps);
    for (const [n, x, y] of TILTS) {
        await page.evaluate(([x, y]) => window.__draw(x, y), [x, y]);
        await page.screenshot({ path: `${out}${n}.png` });
    }
    await browser.close();
})();
