const { chromium } = require('playwright');
const fs = require('fs');

// Весь аппарат версии 2 (machine.py) светом «отражения студии»: лак с
// полосами светильников, плоская позолота с гранью, искрами и сиянием,
// стекло, свечение экрана и ламп с ореолом, тени по рельефу. Кадры —
// телефон покачивают по кругу. Сборка в рамку игры — compose.py.
//   python3 machine.py out/ && NODE_PATH=... node machine-shot.js out/ /tmp/mf- 
const dir = process.argv[2], out = process.argv[3] || '/tmp/mf-';
const W = 1080, H = 2088, FR = +(process.env.FRAMES || 24);
const uri = (f, t) => `data:${t};base64,` + fs.readFileSync(dir + f).toString('base64');

(async () => {
    const browser = await chromium.launch({ executablePath: require('../chrome-path') });
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', e => console.log('ERR', e.message));
    page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
    await page.setContent(`<body style="margin:0;background:#000"><canvas id="c" width="${W}" height="${H}"></canvas></body>`);
    const maps = [uri('mach-albedo.svg', 'image/svg+xml'), uri('mach-height.png', 'image/png'), uri('mach-mat.svg', 'image/svg+xml'), uri('mach-emit.svg', 'image/svg+xml')];
    await page.evaluate(async (maps) => {
        const imgs = await Promise.all(maps.map(src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; })));
        const cap = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 256; draw(c.getContext('2d')); return c; };
        const goldCap = cap(g => {
            let v = g.createLinearGradient(0, 0, 0, 256);
            v.addColorStop(0.00, '#fff7d6'); v.addColorStop(0.18, '#ffe27a'); v.addColorStop(0.40, '#f5b52c');
            v.addColorStop(0.535, '#d98a12'); v.addColorStop(0.545, '#3a1a02');
            v.addColorStop(0.62, '#6a3606'); v.addColorStop(0.80, '#b8700f'); v.addColorStop(1.00, '#e8a325');
            g.fillStyle = v; g.fillRect(0, 0, 256, 256);
            g.save(); g.filter = 'blur(1.5px)'; g.fillStyle = '#ffffff';
            g.fillRect(52, 40, 58, 30); g.fillRect(122, 40, 26, 30);
            g.globalAlpha = 0.85; g.fillRect(186, 30, 10, 100);
            g.globalAlpha = 0.5; g.fillRect(30, 180, 200, 5);
            g.restore();
            const r = g.createRadialGradient(128, 128, 96, 128, 128, 128);
            r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(0.7, 'rgba(40,14,0,0.85)'); r.addColorStop(0.9, 'rgba(255,190,60,0.9)'); r.addColorStop(1, 'rgba(60,20,0,1)');
            g.fillStyle = r; g.fillRect(0, 0, 256, 256);
        });
        const lacCap = cap(g => {
            g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
            const v = g.createLinearGradient(0, 0, 0, 256); v.addColorStop(0, 'rgba(255,255,255,0.16)'); v.addColorStop(0.5, 'rgba(255,255,255,0)');
            g.fillStyle = v; g.fillRect(0, 0, 256, 256);
            g.save(); g.filter = 'blur(1.5px)'; g.fillStyle = '#fff';
            g.globalAlpha = 0.95; g.fillRect(30, 50, 150, 6);
            g.globalAlpha = 0.6; g.fillRect(190, 24, 6, 110);
            g.globalAlpha = 0.35; g.fillRect(60, 84, 90, 3);
            g.restore();
            // край формы ловит мягкий ободок — скруглённые борта ярусов читаются объёмом
            const r = g.createRadialGradient(128, 128, 84, 128, 128, 128);
            r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.75, 'rgba(255,240,220,0.32)'); r.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = r; g.fillRect(0, 0, 256, 256);
        });
        const cv = document.getElementById('c'), gl = cv.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true });
        const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o)); return o; };
        const p = gl.createProgram();
        gl.attachShader(p, sh(gl.VERTEX_SHADER, 'attribute vec2 a; varying vec2 v; void main(){ v = a*0.5+0.5; v.y = 1.0 - v.y; gl_Position = vec4(a,0,1); }'));
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, `precision highp float;
            uniform sampler2D uA, uH, uM, uE, uG, uL; uniform vec2 uTex, uTilt; varying vec2 v;
            float h(vec2 q){ vec4 t = texture2D(uH, q); return (t.r * 65280.0 + t.g * 255.0) / 65535.0 * 64.0; }
            float gm(vec2 q){ return texture2D(uM, q).b; }
            vec2 h2(vec2 c){ return vec2(fract(sin(dot(c, vec2(12.99, 78.23))) * 43758.5), fract(sin(dot(c, vec2(39.35, 11.13))) * 24634.6)); }
            vec2 noise2(vec2 q){ vec2 i = floor(q), f = q - i; f = f*f*(3.0-2.0*f);
                return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y) - 0.5; }
            vec2 refl(vec3 n, vec2 pos){ vec3 nt = normalize(n + vec3(uTilt, 0.0));
                return clamp(vec2(nt.x, -nt.y) * 0.46 + 0.5 + (pos - 0.5) * vec2(0.34, 0.5), 0.0, 1.0); }
            void main(){
                float dx = (h(v + vec2(uTex.x*2.0, 0.0)) - h(v - vec2(uTex.x*2.0, 0.0))) / (4.0/3.0);
                float dy = (h(v + vec2(0.0, uTex.y*2.0)) - h(v - vec2(0.0, uTex.y*2.0))) / (4.0/3.0);
                vec3 n = normalize(vec3(-dx, dy, 1.0));
                vec3 a = texture2D(uA, v).rgb; vec4 m = texture2D(uM, v); vec3 e = texture2D(uE, v).rgb;
                float G = m.b, hc = h(v);
                vec3 Ld = normalize(vec3(-0.42, 0.5, 0.76) + vec3(uTilt * 0.6, 0.0));
                float dif = clamp(dot(n, Ld), 0.0, 1.0) / 0.76;
                vec3 c;
                if (G > 0.5) {
                    float ee = 2.2;
                    float gx = gm(v + vec2(uTex.x*ee, 0.0)) - gm(v - vec2(uTex.x*ee, 0.0));
                    float gy = gm(v + vec2(0.0, uTex.y*ee)) - gm(v - vec2(0.0, uTex.y*ee));
                    vec3 nb = normalize(n + vec3(-gx, gy, 0.0) * 0.85);
                    nb = normalize(nb + vec3(noise2(v / uTex / 30.0), 0.0) * 0.08);
                    c = texture2D(uG, refl(nb, v)).rgb * (a / vec3(0.84, 0.68, 0.32));
                    c = pow(c, vec3(1.08)) * (0.62 + 0.38 * dif);
                } else if (m.g > 0.5) {
                    // стекло: то, что за ним, + чёткое отражение светильников
                    vec3 r = texture2D(uL, refl(n, v)).rgb;
                    c = a * (0.45 + 0.55 * dif) + r * 0.6;
                } else {
                    vec3 r = texture2D(uL, refl(n, v)).rgb;
                    float lum = max(a.r, max(a.g, a.b));
                    c = a * (0.30 + 0.80 * dif) + r * m.r * 0.6 * (0.4 + 1.2 * lum);
                }
                // тени: от главного света по рельефу + затенение впадин
                float occ = 0.0;
                vec2 ldir = normalize(vec2(-0.42, -0.5));
                for (int i = 1; i <= 12; i++) { float t = float(i) * 3.0;
                    occ = max(occ, clamp((h(v + ldir * uTex * t) - hc - t / 3.0 * 0.75) * 0.5, 0.0, 1.0)); }
                float ha = 0.0;
                for (int i = 0; i < 8; i++) { float t = float(i) * 0.785; ha += h(v + vec2(cos(t), sin(t)) * uTex * 9.0); }
                float ao = clamp(1.0 - max(0.0, ha / 8.0 - hc) * 0.22, 0.35, 1.0);
                c *= (1.0 - 0.55 * occ) * ao;
                // свечение: само + ореол вокруг
                vec3 bloom = vec3(0.0);
                for (int i = 0; i < 12; i++) { float t = float(i) * 0.5236 + 0.2;
                    vec2 d = vec2(cos(t), sin(t)) * uTex;
                    bloom += texture2D(uE, v + d * 5.0).rgb * 0.5 + texture2D(uE, v + d * 13.0).rgb * 0.32 + texture2D(uE, v + d * 28.0).rgb * 0.18; }
                c += e * 1.15 + bloom / 12.0 * 0.6;
                // сияние горячего золота на соседний лак
                float glow = 0.0;
                for (int i = 0; i < 12; i++) { float t = float(i) * 0.5236;
                    for (int k = 1; k <= 2; k++) {
                        vec2 q = v + vec2(cos(t), sin(t)) * uTex * float(k) * 7.0;
                        if (gm(q) > 0.5) { vec3 rq = texture2D(uG, refl(vec3(0.0, 0.0, 1.0), q)).rgb; glow += max(0.0, dot(rq, vec3(0.33)) - 0.7) / float(k); } } }
                c += vec3(1.0, 0.72, 0.3) * glow * 0.10 * (1.0 - G * 0.6);
                // искры на золоте там, где идёт блик
                vec2 cellSz = vec2(30.0), pc = v / uTex;
                for (int oy = -1; oy <= 1; oy++) for (int ox = -1; ox <= 1; ox++) {
                    vec2 cell = floor(pc / cellSz) + vec2(float(ox), float(oy));
                    vec2 sp = (cell + 0.2 + 0.6 * h2(cell)) * cellSz, suv = sp * uTex;
                    if (gm(suv) < 0.5) continue;
                    vec3 rq = texture2D(uG, refl(vec3(noise2(suv / uTex / 30.0) * 0.16, 1.0), suv)).rgb;
                    float hot = smoothstep(0.86, 0.99, dot(rq, vec3(0.33)));
                    if (hot <= 0.0) continue;
                    vec2 d = pc - sp;
                    float rays = exp(-abs(d.y) * 1.1) * exp(-abs(d.x) * 0.11) + exp(-abs(d.x) * 1.1) * exp(-abs(d.y) * 0.11);
                    c += vec3(1.0, 0.95, 0.8) * hot * (rays * 0.85 + exp(-length(d) * 0.45) * 1.2);
                }
                gl_FragColor = vec4(c, 1.0);
            }`));
        gl.linkProgram(p); gl.useProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p));
        const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        [[imgs[0], 'uA'], [imgs[1], 'uH'], [imgs[2], 'uM'], [imgs[3], 'uE'], [goldCap, 'uG'], [lacCap, 'uL']].forEach(([im, u], i) => {
            const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
            // высота упакована в два байта — только ближайший тексел
            const f = u === 'uH' ? gl.NEAREST : gl.LINEAR;
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.uniform1i(gl.getUniformLocation(p, u), i);
        });
        gl.uniform2f(gl.getUniformLocation(p, 'uTex'), 1 / imgs[1].width, 1 / imgs[1].height);
        window.__draw = (x, y) => { gl.uniform2f(gl.getUniformLocation(p, 'uTilt'), x, y); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.finish(); };
    }, maps);
    for (let i = 0; i < FR; i++) {
        const a = i / FR * Math.PI * 2;
        await page.evaluate(([x, y]) => window.__draw(x, y), [Math.cos(a) * 0.36, Math.sin(a) * 0.28]);
        await page.screenshot({ path: `${out}${String(i).padStart(2, '0')}.png` });
    }
    await browser.close();
})();
