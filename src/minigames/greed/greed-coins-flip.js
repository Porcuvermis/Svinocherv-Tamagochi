// ================= АЛЧНОСТЬ: МОНЕТА ПОЯВЛЯЕТСЯ И ИСЧЕЗАЕТ В БЛИКЕ =================
// docs/plan/27-greed-skin.md, переход. Замысел игрока:
//   монета стоит ребром к экрану — её не видно; поворачивается и, пока ещё
//   бесплотная, показывает на своей плоскости только блик (прозрачный
//   материал, который отражает свет). Когда ось монеты проходит точно на
//   свет, блик в пике — вспышка цвета самого яркого места монеты, — и под
//   ней монета становится настоящей. Дальше блик гаснет, монета
//   докручивается в свою позу. Исчезает обратным ходом: поворачивается в
//   любую сторону, ловит пиковый блик, в нём становится бесплотной и уходит
//   на ребро.
//
// Свет тот же, что у кучи (GreedCoins.LIGHT, наклон телефона — Tilt.turn):
// «пик» — не придуманная вспышка по таймеру, а момент, когда нормаль монеты
// совпадает с полувектором света. Поэтому путь оси монеты: ребро → H → поза
// (дуги по сфере), а материализация — в точке H.
//
// Монета рисуется видеокартой из плоского спрайта (цвет + нормали): поворот —
// это проекция диска (эллипс) и поворот нормалей, без перепекания поз.
// Толщины ребра нет: на ребре монета и так невидима.
Object.assign(GreedCoins, {
    FLIP: { toPeak: 520, fromPeak: 680, flash: 70, glow: 0.9, spark: 230, seen: 0.06 },

    // ---------- векторы ----------
    v3: {
        norm: (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; },
        dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
        // дуга по сфере от a к b, доля t
        slerp(a, b, t) {
            const d = Math.max(-1, Math.min(1, this.dot(a, b))), w = Math.acos(d);
            if (w < 1e-4) return a.slice();
            const s = Math.sin(w), k0 = Math.sin((1 - t) * w) / s, k1 = Math.sin(t * w) / s;
            return this.norm([a[0] * k0 + b[0] * k1, a[1] * k0 + b[1] * k1, a[2] * k0 + b[2] * k1]);
        }
    },
    // Поворот, переводящий ось z в n (по кратчайшей), столбцами для mat3.
    axisTo(n) {
        const c = n[2], kx = -n[1], ky = n[0], s = Math.hypot(kx, ky);
        if (s < 1e-6) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
        const ux = kx / s, uy = ky / s, t = 1 - c, sn = s;
        // R = I cosθ + sinθ [u]× + (1−cosθ) u uᵀ, u = (ux, uy, 0)
        const R = [
            [c + t * ux * ux, t * ux * uy, sn * uy],
            [t * ux * uy, c + t * uy * uy, -sn * ux],
            [-sn * uy, sn * ux, c]
        ];
        return [R[0][0], R[1][0], R[2][0], R[0][1], R[1][1], R[2][1], R[0][2], R[1][2], R[2][2]];
    },
    // M (столбцами) · Rz(roll)
    withRoll(M, roll) {
        const c = Math.cos(roll), s = Math.sin(roll);
        return [M[0] * c + M[3] * s, M[1] * c + M[4] * s, M[2] * c + M[5] * s,
                -M[0] * s + M[3] * c, -M[1] * s + M[4] * c, -M[2] * s + M[5] * c,
                M[6], M[7], M[8]];
    },
    tiltMat(t) {
        const S = this.LIGHT, D = Math.PI / 180, ay = t.x * S.tiltMax * D, ax = t.y * S.tiltMax * D;
        const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
        return [cy, sx * sy, -cx * sy, 0, cx, sx, sy, -sx * cy, cx * cy];
    },
    // Полувектор света в «системе блюда»: какая ось монеты сейчас ловит пик.
    peakAxis(t) {
        const S = this.LIGHT, l = this.v3.norm(S.L), H = this.v3.norm([l[0], l[1], l[2] + 1]), M = this.tiltMat(t);
        // M — столбцами; Mᵀ·H
        return this.v3.norm([M[0] * H[0] + M[1] * H[1] + M[2] * H[2], M[3] * H[0] + M[4] * H[1] + M[5] * H[2], M[6] * H[0] + M[7] * H[1] + M[8] * H[2]]);
    },
    // Ось на ребре: в плоскости экрана, со стороны, противоположной позе от
    // пика, — тогда дуга ребро → пик → поза идёт одним махом, без возврата.
    edgeAxis(H, pose, rnd) {
        let x = H[0] - pose[0], y = H[1] - pose[1];
        if (Math.hypot(x, y) < 0.05) { const a = rnd * Math.PI * 2; x = Math.cos(a); y = Math.sin(a); }
        const l = Math.hypot(x, y);
        return [x / l, y / l, 0];
    },

    // Состояние монеты в момент t (мс от начала хода). dir: 'in' | 'out'.
    // → { n, m (0 — бесплотна, 1 — настоящая), flash (0..1) }
    // Когда бесплотная монета впервые видна (её блик ярче F.seen): ищется по
    // дуге ребро → пик. Тот же расчёт, что у блика в шейдере.
    firstSeen(c) {
        const F = this.FLIP, V = this.v3, k = this.LIGHT.shin * 0.35;
        const ease = (x) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
        for (let t = 0; t <= F.toPeak; t += 4) {
            const n = V.slerp(c.edge, c.H, ease(t / F.toPeak));
            if (Math.pow(Math.max(0, V.dot(n, c.H)), k) * 0.5 > F.seen) return t;
        }
        return F.toPeak;
    },

    // Состояние монеты в момент t (мс от начала хода). dir: 'in' | 'out'.
    // → { n, m (0 — бесплотна, 1 — настоящая), flash (0..1),
    //     reveal (докуда от центра виден бесплотный блик, доли радиуса),
    //     star (0..1 — звёздочка в центре) }
    // Звёздочка (замысел игрока): пока монету ещё не видно, в её центре
    // вспыхивает искра в несколько пикселей и взрывается в форму первого
    // кадра блика. Блик проявляется от центра кругом в плоскости монеты —
    // на экране это эллипс самой монеты. На исчезновении — наоборот: блик
    // стягивается в искру, искра гаснет.
    flipState(c, t, dir) {
        const F = this.FLIP, V = this.v3;
        const ease = (x) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
        let n, m;
        if (dir === 'in') {
            if (t < F.toPeak) { n = V.slerp(c.edge, c.H, ease(t / F.toPeak)); m = 0; }
            else { n = V.slerp(c.H, c.pose, ease(Math.min(1, (t - F.toPeak) / F.fromPeak))); m = 1; }
        } else {
            if (t < F.fromPeak) { n = V.slerp(c.pose, c.H, ease(t / F.fromPeak)); m = 1; }
            else { n = V.slerp(c.H, c.edge, ease(Math.min(1, (t - F.fromPeak) / F.toPeak))); m = 0; }
        }
        const tp = dir === 'in' ? F.toPeak : F.fromPeak, dt = (t - tp) / F.flash;
        if (c.seen === undefined) c.seen = this.firstSeen(c);
        // искра стоит вокруг первого видимого кадра блика
        const ts = dir === 'in' ? c.seen : F.fromPeak + (F.toPeak - c.seen);
        let p = (t - ts) / F.spark;
        if (dir === 'out') p = 1 - p;                 // время назад
        p = Math.max(0, Math.min(1, p));
        const reveal = p <= 0 ? 0 : 1.15 * (1 - Math.pow(1 - p, 3));
        const star = p <= 0 || p >= 1 ? 0 : Math.sin(Math.PI * Math.min(1, p * 1.6)) * (1 - p * 0.6);
        return { n, m, flash: Math.exp(-dt * dt), reveal: m ? 9 : reveal, star, starP: p };
    },

    // ---------- рисование ----------
    FLIP_VS: 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}',
    FLIP_FS: [
        'precision mediump float;',
        'uniform sampler2D tA,tN;uniform vec2 C,res;uniform float rad,m,flash,glow,cellX;',
        'uniform mat3 R,T;uniform float ao,reveal,star,starP;uniform vec3 L;uniform float diff,amb,broad,sharp,shin;uniform vec3 glint;',
        'void main(){',
        ' vec2 q=vec2(gl_FragCoord.x-C.x, gl_FragCoord.y-C.y)/rad;',      // y вверх
        ' vec3 e1=R*vec3(1.,0.,0.), e2=R*vec3(0.,1.,0.);',
        ' float det=e1.x*e2.y-e2.x*e1.y;',
        ' vec4 outc=vec4(0.);',
        ' float h=length(q);',
        // ореол вспышки — за пределами диска тоже
        ' outc.rgb+=glint*flash*glow*exp(-h*h*1.6)*.55;',
        // искра: яркое ядро в несколько пикселей и четыре луча; растёт с starP
        ' if(star>0.){',
        '  float sz=.04+.5*starP;',
        '  vec2 a=abs(q)/sz;',
        '  float core=exp(-dot(a,a)*6.);',
        '  float rays=exp(-a.y*a.y*60.)*exp(-a.x*.7)+exp(-a.x*a.x*60.)*exp(-a.y*.7);',
        '  outc.rgb+=mix(vec3(1.),glint,.3)*star*(core*1.4+rays*.8);',
        ' }',
        ' if(abs(det)>.002){',
        '  vec2 uv=vec2((q.x*e2.y-q.y*e2.x)/det,(e1.x*q.y-e1.y*q.x)/det);',
        '  if(dot(uv,uv)<1.){',
        '   vec2 tc=vec2(cellX+.5*(.5+uv.x*.453),.5-uv.y*.453);',   // 116/256 = .453
        '   vec4 A=texture2D(tA,tc);vec3 a=A.rgb;',
        '   vec3 n=normalize(T*(R*(texture2D(tN,tc).rgb*2.-1.)));',
        '   vec3 hv=normalize(L+vec3(0.,0.,1.));',
        '   float d=max(dot(n,L),0.),c=max(dot(n,hv),0.);',
        '   vec3 spec=mix(a,vec3(1.),.55)*sharp*pow(c,shin);',
        '   vec3 full=a*(amb+diff*d)+(a*1.2+.12)*broad*pow(c,8.)+spec;',
        // бесплотная монета: только блик, без своего цвета (прозрачный материал).
        // Блик — по оси монеты, а не по рельефу: с рельефом в блике проступали
        // цифра и насечка, монета «спойлерила» себя до вспышки (игрок).
        // Рисунок поверхности работает только у настоящей монеты.
        '   vec3 n0=normalize(T*(R*vec3(0.,0.,1.)));float c0=max(dot(n0,hv),0.);',
        '   vec3 ghost=glint*(sharp*pow(c0,shin)*1.1+pow(c0,shin*.35)*.5);',
        '   float k=A.a;',
        // ao — затенение глубины кучи; бесплотный блик и вспышка от него не гаснут:
        // свет на монету падает и в глубине
        // бесплотный блик виден только внутри круга reveal (от центра монеты)
        '   float rv=1.-smoothstep(reveal-.18,reveal,length(uv));',
        '   outc.rgb+=k*(m*full*ao+(1.-m)*ghost*rv)+k*glint*flash*glow;',
        '   outc.a=max(outc.a,k*m);',
        '  }',
        ' }',
        ' gl_FragColor=vec4(min(outc.rgb,vec3(1.)),outc.a);',
        '}'
    ].join('\n'),

    flipRenderer(cv, alb, nor) {
        const gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true });
        if (!gl) return null;
        const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        const pr = gl.createProgram();
        gl.attachShader(pr, sh(gl.VERTEX_SHADER, this.FLIP_VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, this.FLIP_FS));
        gl.linkProgram(pr); gl.useProgram(pr);
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        [['tA', alb], ['tN', nor]].forEach(([name, img], i) => {
            const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.uniform1i(gl.getUniformLocation(pr, name), i);
        });
        const U = (n) => gl.getUniformLocation(pr, n);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.viewport(0, 0, cv.width, cv.height);
        gl.enable(gl.SCISSOR_TEST);
        const gc = PALETTE.greedCoin.gold.glint, hex = (h) => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16) / 255);
        return {
            clear: () => { gl.disable(gl.SCISSOR_TEST); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.enable(gl.SCISSOR_TEST); },
            // x, y, rad — пиксели холста (y вниз), n — ось монеты, kind — 'gold'/'euro'
            // roll — поворот монеты вокруг своей оси (куда смотрит цифра), ao — затенение
            coin: (x, y, rad, st, kind, tilt, roll, ao) => {
                const S = this.LIGHT, l = this.v3.norm(S.L);
                gl.uniform2f(U('C'), x, cv.height - y); gl.uniform1f(U('rad'), rad);
                gl.uniform1f(U('reveal'), st.reveal === undefined ? 9 : st.reveal);
                gl.uniform1f(U('star'), st.star || 0); gl.uniform1f(U('starP'), st.starP || 0);
                gl.uniform1f(U('m'), st.m); gl.uniform1f(U('flash'), st.flash); gl.uniform1f(U('glow'), this.FLIP.glow);
                gl.uniform1f(U('cellX'), kind === 'euro' ? 0.5 : 0);
                gl.uniformMatrix3fv(U('R'), false, this.withRoll(this.axisTo(st.n), roll || 0));
                gl.uniform1f(U('ao'), ao === undefined ? 1 : ao);
                // фрагменты — только в квадрате монеты с ореолом, не во весь экран
                const b = Math.ceil(rad * 2.2);
                gl.scissor(Math.max(0, Math.floor(x - b)), Math.max(0, Math.floor(cv.height - y - b)), 2 * b, 2 * b);
                gl.uniformMatrix3fv(U('T'), false, this.tiltMat(tilt));
                gl.uniform3f(U('L'), l[0], l[1], l[2]);
                ['diff', 'amb', 'broad', 'sharp', 'shin'].forEach(k => gl.uniform1f(U(k), S[k]));
                const g = hex(gc); gl.uniform3f(U('glint'), g[0], g[1], g[2]);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            }
        };
    },

    // ---------- ПОКАЗ ИЗ 🐞: ОДНА МОНЕТА ----------
    // Крупно и в настоящем размере рядом; туда-обратно по кругу, вид монеты
    // чередуется. Свет — наклоном телефона. Закрыть — двойное касание.
    flipDemo(host) {
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
        root.addEventListener('pointerdown', () => {
            const now = performance.now();
            if (now - lastTap < 350) { close(); return; }
            lastTap = now;
            try { Tilt.ask && Tilt.ask(); } catch (_) {}
        });
        Promise.all([load(dir + 'coin-flat-albedo.png'), load(dir + 'coin-flat-normal.png')]).then(([a, n]) => {
            if (!alive) return;
            const R = this.flipRenderer(cv, a, n);
            if (!R) { close(); return; }
            const F = this.FLIP, run = F.toPeak + F.fromPeak, HOLD = 1300, GAP = 700, CYCLE = 2 * run + HOLD + GAP;
            const tilt = { x: 0, y: 0 };
            // поза, в которой монета ляжет: чуть наклонена, как в куче
            const poses = [[0.25, -0.18], [-0.3, 0.12], [0.1, 0.32], [-0.15, -0.28]];
            let cycle = null, coin = null;
            const t0 = performance.now();
            const loop = (now) => {
                if (!alive) return;
                const T = (typeof Tilt !== 'undefined' && Tilt.turn) ? Tilt.turn() : { live: false };
                const want = T.live ? T : { x: 0, y: 0 };
                tilt.x += (want.x - tilt.x) * 0.15; tilt.y += (want.y - tilt.y) * 0.15;
                // _flipAt — время показа, заданное снаружи (прогон кадров в тестах)
                const e = Math.max(0, this._flipAt != null ? this._flipAt : now - t0), k = Math.floor(e / CYCLE), t = e - k * CYCLE;
                if (k !== cycle) {
                    cycle = k;
                    const q = poses[k % poses.length], pose = this.v3.norm([q[0], q[1], 1]);
                    const H = this.peakAxis(tilt);
                    coin = { pose, H, edge: this.edgeAxis(H, pose, (k * 0.37) % 1), kind: k % 2 ? 'euro' : 'gold' };
                    // уходит в другую сторону, чем пришла
                    coin.edgeOut = [-coin.edge[0], -coin.edge[1], 0];
                }
                let st;
                if (t < run) st = this.flipState(coin, t, 'in');
                else if (t < run + HOLD) st = { n: coin.pose, m: 1, flash: 0 };
                else if (t < 2 * run + HOLD) st = this.flipState(Object.assign({}, coin, { edge: coin.edgeOut }), t - run - HOLD, 'out');
                else st = { n: coin.edge, m: 0, flash: 0 };
                R.clear();
                R.coin(this.W / 2, this.H * 0.42, 180, st, coin.kind, tilt);            // крупно
                R.coin(this.W / 2, this.H * 0.74, this.RAD, st, coin.kind, tilt);       // как в рамке
                requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
        });
    },

    // ---------- ПОКАЗ ИЗ 🐞: КУЧКА ----------
    // Пара десятков монет внахлёст, в разных позах, крупнее рамки (ZOOM).
    // Каждая появляется на своём месте со своей задержкой, кучка полежит,
    // и монеты так же вразнобой исчезают. Свет — наклоном телефона.
    PILE_DEMO: { n: 26, spread: 2.9, zoom: 2.4, stagger: 900, hold: 1600, gap: 700 },
    flipPileDemo(host) {
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
        root.addEventListener('pointerdown', () => {
            const now = performance.now();
            if (now - lastTap < 350) { close(); return; }
            lastTap = now;
            try { Tilt.ask && Tilt.ask(); } catch (_) {}
        });
        // раскладка: броски в круг с запретом слишком близких центров,
        // нижние (раньше положенные) темнее
        const P = this.PILE_DEMO, rad = this.RAD * P.zoom, cx = this.W / 2, cy = this.H * 0.45;
        let st = 2024;
        const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
        const coins = [];
        for (let t = 0; t < 4000 && coins.length < P.n; t++) {
            const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * P.spread * rad;
            const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.8;
            if (coins.some(c => Math.hypot(c.x - x, c.y - y) < rad * 0.75)) continue;
            const m = (0.15 + rnd() * 0.42), az = rnd() * Math.PI * 2;
            coins.push({ x, y, kind: rnd() < this.MIX ? 'euro' : 'gold', roll: rnd() * Math.PI * 2,
                pose: this.v3.norm([Math.sin(m) * Math.cos(az), Math.sin(m) * Math.sin(az), Math.cos(m)]),
                delayIn: rnd() * P.stagger, delayOut: rnd() * P.stagger, side: rnd() });
        }
        coins.forEach((c, i) => { c.ao = 0.55 + 0.45 * (i / (coins.length - 1)); });
        Promise.all([load(dir + 'coin-flat-albedo.png'), load(dir + 'coin-flat-normal.png')]).then(([a, n]) => {
            if (!alive) return;
            const R = this.flipRenderer(cv, a, n);
            if (!R) { close(); return; }
            const F = this.FLIP, run = F.toPeak + F.fromPeak;
            const CYCLE = 2 * (P.stagger + run) + P.hold + P.gap;
            const tilt = { x: 0, y: 0 };
            let cycle = null;
            const t0 = performance.now();
            const loop = (now) => {
                if (!alive) return;
                const T = (typeof Tilt !== 'undefined' && Tilt.turn) ? Tilt.turn() : { live: false };
                const want = T.live ? T : { x: 0, y: 0 };
                tilt.x += (want.x - tilt.x) * 0.15; tilt.y += (want.y - tilt.y) * 0.15;
                const e = Math.max(0, this._flipAt != null ? this._flipAt : now - t0), k = Math.floor(e / CYCLE), t = e - k * CYCLE;
                if (k !== cycle) {
                    cycle = k;
                    // пик — по свету в начале хода: пока монета крутится, он не скачет
                    const H = this.peakAxis(tilt);
                    for (const c of coins) {
                        c.H = H;
                        c.edge = this.edgeAxis(H, c.pose, c.side);
                        c.edgeOut = [-c.edge[0], -c.edge[1], 0];
                        c.seen = undefined;          // пик сменился — первый кадр блика тоже
                    }
                }
                const outAt = P.stagger + run + P.hold;
                R.clear();
                for (const c of coins) {
                    let s;
                    const ti = t - c.delayIn, to = t - outAt - c.delayOut;
                    if (ti < 0) continue;
                    if (ti < run) s = this.flipState(c, ti, 'in');
                    else if (to < 0) s = { n: c.pose, m: 1, flash: 0 };
                    else if (to < run) s = this.flipState({ pose: c.pose, H: c.H, edge: c.edgeOut }, to, 'out');
                    else continue;
                    R.coin(c.x, c.y, rad, s, c.kind, tilt, c.roll, c.ao);
                }
                requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
        });
    }
});
