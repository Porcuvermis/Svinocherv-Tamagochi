// ================= АЛЧНОСТЬ: КУЧА МОНЕТ (шкурка окна) =================
// docs/plan/27-greed-skin.md. Монеты — готовые спрайты из двух атласов,
// которые печёт tools/coin-atlas.js:
//   coins-albedo.png — цвет монеты БЕЗ света (впадины темнее);
//   coins-normal.png — куда смотрит каждая точка поверхности (xyz → rgb).
// Два вида (gold, euro), в каждом — одни и те же позы: плашмя и наклоны.
//
// ---------- СВЕТ: СОЛНЦЕ НАД БЛЮДОМ ----------
// Замысел игрока: свет неподвижен, как солнце над головой; куча — блюдо с
// монетами под разными углами. Наклон телефона поворачивает блюдо ЦЕЛИКОМ:
// все монеты сразу меняют угол к солнцу, одинаково повёрнутые блестят
// одинаково, верх кучи светлее низа.
//
// Первая версия так не умела и была выброшена: свет был запечён в картинку,
// а «блик» лишь добавлялся поверх отдельным холстом. На ярких верхних
// монетах прибавка тонула, на тёмных нижних вылезала — блестела глубина
// кучи, а поверхность игнорировала наклон.
//
// Теперь кучу раскладывают ОДИН раз в три картинки (цвет, нормаль, затенение
// глубины), а свет считает видеокарта одним проходом по экрану: поворачивает
// нормаль на наклон блюда и освещает. Перерисовка = смена двух чисел и один
// треугольник на весь холст — дешевле любой canvas-отрисовки монет.
const GreedCoins = {
    // ---------- позы: общий язык запекателя и игры ----------
    MAGS: [12, 22, 32],     // наклоны оси от вертикали, градусы
    AZ: 12,                 // сторон наклона на каждую величину
    ROLLS: 2,               // поворотов вокруг своей оси (цифра смотрит по-разному)
    CELL: 64,               // клетка атласа, px (монета радиусом 29 px = 14,5 ед. при 2×)
    RAD: 29,
    COLS: 16,
    KINDS: ['gold', 'euro'],

    // Все позы: сперва плашмя, затем наклоны. n — ось монеты в виде.
    poses() {
        if (this._poses) return this._poses;
        const D = Math.PI / 180, out = [];
        for (let r = 0; r < this.ROLLS; r++) out.push({ m: 0, az: 0, roll: r * 90, n: [0, 0, 1] });
        this.MAGS.forEach((m, mi) => {
            for (let a = 0; a < this.AZ; a++) for (let r = 0; r < this.ROLLS; r++) {
                const az = a * 360 / this.AZ + mi * 360 / this.AZ / 3;      // слои наклонов сдвинуты по азимуту
                out.push({ m, az, roll: (a * 53 + r * 180 + mi * 90) % 360,
                    n: [Math.sin(m * D) * Math.cos(az * D), Math.sin(m * D) * Math.sin(az * D), Math.cos(m * D)] });
            }
        });
        return (this._poses = out);
    },
    // Клетка (вид, поза) в атласе
    cell(kind, pose) {
        const i = this.KINDS.indexOf(kind) * this.poses().length + pose;
        return { sx: (i % this.COLS) * this.CELL, sy: Math.floor(i / this.COLS) * this.CELL };
    },

    // ---------- раскладка ----------
    // Слои: s — масштаб, gap — доля диаметра между центрами (меньше — плотнее),
    // dark — затемнение слоя, gain — сила блика на слое. Числа подобраны
    // на tools/coin-pile.js и приняты игроком (смесь 50/50, плотность «хорошая»).
    LAYERS: [
        { s: 0.82, gap: 0.8, dark: 0.5, gain: 0.35 },
        { s: 1.0, gap: 0.72, dark: 0.18, gain: 0.8 },
        { s: 1.0, gap: 0.95, dark: 0, gain: 1 }
    ],
    SEED: 4242,
    W: 780, H: 1688,        // холст куч в 2×; логические 390×844
    MIX: 0.5,               // доля евро

    // Возвращает три списка монет. Детерминированно от seed.
    layout(seed) {
        let st = (seed || this.SEED) >>> 0;
        const rng = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
        const P = this.poses().length, W = this.W, H = this.H;
        return this.LAYERS.map((L) => {
            const pts = [], cell = 40 * L.s, grid = {}, minD = 2 * this.RAD * L.s * L.gap;
            for (let t = 0; t < 30000; t++) {
                const x = rng() * (W + 40) - 20, y = rng() * (H + 40) - 20;
                const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
                let ok = true;
                for (let i = -2; i <= 2 && ok; i++) for (let j = -2; j <= 2 && ok; j++) {
                    const q = grid[(gy + j) * 1000 + gx + i];
                    if (q) for (const o of q) if (Math.hypot(o.x - x, o.y - y) < minD) { ok = false; break; }
                }
                if (!ok) continue;
                const pose = Math.floor(rng() * P), p = this.poses()[pose];
                // Ось у каждой монеты чуть своя: спрайт тот же, а блеск наступает в свой момент.
                const jx = (rng() - 0.5) * 0.12, jy = (rng() - 0.5) * 0.12;
                const nn = Math.hypot(p.n[0] + jx, p.n[1] + jy, p.n[2]);
                const c = { x, y, kind: rng() < this.MIX ? 'euro' : 'gold', pose,
                    n: [(p.n[0] + jx) / nn, (p.n[1] + jy) / nn, p.n[2] / nn] };
                (grid[gy * 1000 + gx] = grid[gy * 1000 + gx] || []).push(c);
                pts.push(c);
            }
            pts.sort((a, b) => a.y - b.y);      // нижние чуть перекрывают верхние
            return pts;
        });
    },

    // ---------- раскладка в три картинки ----------
    // Все три рисуются в одном порядке теми же спрайтами — сверху всегда та
    // монета, что лежит выше. ao: светлота слоя (верх кучи светлее) и тени.
    AO: [0.45, 0.78, 1.0],
    buildPile(albedoA, normalA, seed) {
        const W = this.W, H = this.H, C = this.CELL, layers = this.layout(seed);
        const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
        const alb = mk(), nor = mk(), ao = mk();
        const ga = alb.getContext('2d'), gn = nor.getContext('2d'), go = ao.getContext('2d');
        ga.fillStyle = PALETTE.greedCoin.gold.deep; ga.fillRect(0, 0, W, H);
        gn.fillStyle = 'rgb(128,128,255)'; gn.fillRect(0, 0, W, H);
        go.fillStyle = 'rgb(40,40,40)'; go.fillRect(0, 0, W, H);
        // силуэты атласа, залитые светлотой слоя, — для картинки затенения
        const masks = this.AO.map(v => {
            const m = document.createElement('canvas'); m.width = albedoA.width; m.height = albedoA.height;
            const g = m.getContext('2d'); g.drawImage(albedoA, 0, 0);
            g.globalCompositeOperation = 'source-in'; const k = Math.round(v * 255);
            g.fillStyle = 'rgb(' + k + ',' + k + ',' + k + ')'; g.fillRect(0, 0, m.width, m.height);
            return m;
        });
        layers.forEach((coins, li) => {
            const s = this.LAYERS[li].s;
            for (const c of coins) {
                const { sx, sy } = this.cell(c.kind, c.pose);
                const dx = c.x - C / 2 * s, dy = c.y - C / 2 * s, d = C * s;
                go.save(); go.shadowColor = 'rgba(0,0,0,0.6)'; go.shadowBlur = 6 * s; go.shadowOffsetY = 3 * s;
                go.drawImage(masks[li], sx, sy, C, C, dx, dy, d, d); go.restore();
                ga.drawImage(albedoA, sx, sy, C, C, dx, dy, d, d);
                gn.drawImage(normalA, sx, sy, C, C, dx, dy, d, d);
            }
        });
        return { albedo: alb, normal: nor, ao, layers };
    },

    // ---------- свет на видеокарте ----------
    // L — на солнце (почти над головой, чуть сверху-слева), V — на глаз.
    // tiltMax — на сколько градусов поворачивается блюдо при полном наклоне
    // телефона (единица Tilt.turn() — 35°).
    LIGHT: { L: [-0.25, 0.35, 1], tiltMax: 30, diff: 0.75, amb: 0.3, broad: 0.35, sharp: 1.3, shin: 60 },
    VS: 'attribute vec2 p;varying vec2 uv;void main(){uv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}',
    FS: [
        'precision mediump float;varying vec2 uv;',
        'uniform sampler2D tA,tN,tO;uniform mat3 R;uniform vec3 L;',
        'uniform float diff,amb,broad,sharp,shin;',
        'void main(){',
        ' vec3 a=texture2D(tA,uv).rgb;float o=texture2D(tO,uv).r;',
        ' vec3 n=normalize(R*(texture2D(tN,uv).rgb*2.-1.));',
        ' vec3 h=normalize(L+vec3(0.,0.,1.));',
        ' float d=max(dot(n,L),0.),c=max(dot(n,h),0.);',
        // металл: отражение окрашено своим цветом (золото — золотом, серебро — почти белым)
        ' vec3 col=a*(amb+diff*d)+(a*1.2+.12)*broad*pow(c,8.)+mix(a,vec3(1.),.55)*sharp*pow(c,shin);',
        ' gl_FragColor=vec4(col*o,1.);}'
    ].join('\n'),

    // Создаёт освещатель на холсте cv (размер W×H). Возвращает draw(tilt).
    lighter(cv, pile) {
        const gl = cv.getContext('webgl', { premultipliedAlpha: false, antialias: false });
        if (!gl) return null;
        const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        const pr = gl.createProgram();
        gl.attachShader(pr, sh(gl.VERTEX_SHADER, this.VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, this.FS));
        gl.linkProgram(pr); gl.useProgram(pr);
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        [['tA', pile.albedo], ['tN', pile.normal], ['tO', pile.ao]].forEach(([name, img], i) => {
            const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.uniform1i(gl.getUniformLocation(pr, name), i);
        });
        const U = (n) => gl.getUniformLocation(pr, n);
        gl.viewport(0, 0, cv.width, cv.height);
        return (t) => {
            const S = this.LIGHT, D = Math.PI / 180;
            // Блюдо поворачивается вместе с телефоном. x > 0 — правый край ушёл
            // вниз: нормали клонятся вправо (поворот вокруг оси y).
            // y > 0 — верх телефона к игроку: нормали клонятся вниз экрана.
            const ay = t.x * S.tiltMax * D, ax = t.y * S.tiltMax * D;
            const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
            // R = Rx(ax) · Ry(ay), столбцами (как ждёт uniformMatrix3fv)
            const R = [cy, sx * sy, -cx * sy, 0, cx, sx, sy, -sx * cy, cx * cy];
            gl.uniformMatrix3fv(U('R'), false, R);
            const l = Math.hypot(S.L[0], S.L[1], S.L[2]);
            gl.uniform3f(U('L'), S.L[0] / l, S.L[1] / l, S.L[2] / l);
            ['diff', 'amb', 'broad', 'sharp', 'shin'].forEach(k => gl.uniform1f(U(k), S[k]));
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        };
    },

    // ---------- ПРОСМОТР ИЗ 🐞 ----------
    // Куча на весь холст, блеск — только наклоном телефона (Tilt.turn, как в
    // зависти). Без датчика — ведёшь пальцем. Закрыть — двойное касание.
    preview(host) {
        if (this._pv) return;
        const root = document.createElement('div');
        Object.assign(root.style, { position: 'absolute', inset: '0', zIndex: 9999, background: PALETTE.greedCoin.gold.deep, touchAction: 'none' });
        const cv = document.createElement('canvas'); cv.width = this.W; cv.height = this.H;
        Object.assign(cv.style, { width: '100%', height: '100%', display: 'block' });
        root.appendChild(cv); host.appendChild(root);
        this._pv = root;
        const load = (u) => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; });
        const dir = 'src/minigames/greed/';
        let alive = true, lastTap = 0;
        const close = () => { alive = false; root.remove(); this._pv = null; };
        Promise.all([load(dir + 'coins-albedo.png'), load(dir + 'coins-normal.png')]).then(([a, n]) => {
            if (!alive) return;
            const draw = this.lighter(cv, this.buildPile(a, n));
            if (!draw) { close(); return; }
            const tilt = { x: 0, y: 0 }; let finger = null, last = null;
            const at = (e) => { const r = root.getBoundingClientRect(); return { x: Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2)), y: Math.max(-1, Math.min(1, -((e.clientY - r.top) / r.height - 0.5) * 2)) }; };
            root.addEventListener('pointerdown', (e) => {
                const now = performance.now();
                if (now - lastTap < 350) { close(); return; }
                lastTap = now; finger = at(e);
                try { Tilt.ask && Tilt.ask(); } catch (_) {}
            });
            root.addEventListener('pointermove', (e) => { if (finger) finger = at(e); });
            root.addEventListener('pointerup', () => { finger = null; });
            const loop = () => {
                if (!alive) return;
                const T = (typeof Tilt !== 'undefined' && Tilt.turn) ? Tilt.turn() : { live: false };
                const want = finger || (T.live ? T : { x: 0, y: 0 });
                // датчик дрожит: без сглаживания монеты мерцают
                tilt.x += (want.x - tilt.x) * 0.15; tilt.y += (want.y - tilt.y) * 0.15;
                if (!last || Math.abs(last.x - tilt.x) > 0.002 || Math.abs(last.y - tilt.y) > 0.002) {
                    last = { x: tilt.x, y: tilt.y }; draw(tilt);
                }
                requestAnimationFrame(loop);
            };
            loop();
        });
    }
};
