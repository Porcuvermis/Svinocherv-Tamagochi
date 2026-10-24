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
    FLIP: { toPeak: 520, fromPeak: 680, flash: 45, glow: 0.75, spark: 300, seen: 0.05, lead: 90, ghost: 0 },

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
    // Когда загорается искра: за F.lead мс до того, как блик бесплотной
    // монеты станет заметен (ярче F.seen) — искра успевает вспыхнуть и
    // раскрыться прямо в этот блик. Расчёт блика — как в шейдере (ghost).
    // Было: искра на «почти ребре» и ровное стеклянное свечение до блика —
    // игрок: полупрозрачная миндалина выбивается из стиля, убрать.
    firstSeen(c) {
        const F = this.FLIP, V = this.v3, S = this.LIGHT;
        const toP = (x) => 1 - Math.cos(x * Math.PI / 2);
        for (let t = 0; t <= F.toPeak; t += 4) {
            const n = V.slerp(c.edge, c.H, toP(t / F.toPeak)), c0 = Math.max(0, V.dot(n, c.H));
            if (S.sharp * Math.pow(c0, S.shin * 3) * 1.1 + Math.pow(c0, S.shin) * 0.35 > F.seen) return Math.max(0, t - F.lead);
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
        if (c.quiet) return this.quietState(c, t, dir);
        // К пику — разгоном, от пика — торможением: монета проносится через
        // пик на полной скорости. С плавным входом-выходом она замедлялась у
        // самого пика, и белая фаза тянулась (игрок: «укороти белую фазу»).
        const toP = (x) => 1 - Math.cos(x * Math.PI / 2), fromP = (x) => Math.sin(x * Math.PI / 2);
        let n, m;
        if (dir === 'in') {
            if (t < F.toPeak) { n = V.slerp(c.edge, c.H, toP(t / F.toPeak)); m = 0; }
            else { n = V.slerp(c.H, c.pose, fromP(Math.min(1, (t - F.toPeak) / F.fromPeak))); m = 1; }
        } else {
            if (t < F.fromPeak) { n = V.slerp(c.pose, c.H, toP(t / F.fromPeak)); m = 1; }
            else { n = V.slerp(c.H, c.edge, fromP(Math.min(1, (t - F.fromPeak) / F.toPeak))); m = 0; }
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
        return { n, m, flash: Math.exp(-dt * dt), reveal: m ? 9 : reveal, star, starP: p, ghost: F.ghost };
    },

    // Тихая монета: без искры, блика бесплотной монеты и вспышки — просто
    // поворачивается с ребра в позу, проступая из темноты (m растёт с
    // поворотом). Так появляются нижние слои кучи: вспыхивает только верх.
    // Когда вспыхивали все, в разгар появления экран заливало белым (игрок),
    // а нижние монеты всё равно закрыты верхними — их вспышки только слепили.
    quietState(c, t, dir) {
        const F = this.FLIP, run = F.toPeak + F.fromPeak;
        let p = Math.max(0, Math.min(1, t / run));
        if (dir === 'out') p = 1 - p;
        const e = Math.sin(p * Math.PI / 2);
        return { n: this.v3.slerp(c.edge, c.pose, e), m: p * p, flash: 0, reveal: 9, star: 0, starP: 0, quiet: true };
    },

    // ---------- рисование ----------
    FLIP_VS: 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}',
    FLIP_FS: [
        'precision mediump float;',
        'uniform sampler2D tA,tN;uniform vec2 C,res;uniform float rad,m,flash,glow,cellX;',
        'uniform mat3 R,T;uniform float ao,reveal,star,starP,gbase,gmul;uniform vec3 L;uniform float diff,amb,broad,sharp,shin;uniform vec3 glint;',
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
        // gbase — ровное стеклянное свечение бесплотной монеты: после искры
        // она видна миндалиной ещё до того, как поймает свет
        // блик бесплотной монеты узкий (степени ×3 и ×1): с прежними (×1 и
        // ×0.35) он белел за ~15° до пика, и весь экран заливало белым (игрок)
        '   vec3 ghost=glint*(sharp*pow(c0,shin*3.)*1.1+pow(c0,shin)*.35+gbase);',
        '   float k=A.a;',
        // ao — затенение глубины кучи; бесплотный блик и вспышка от него не гаснут:
        // свет на монету падает и в глубине
        // бесплотный блик виден только внутри круга reveal (от центра монеты)
        '   float rv=1.-smoothstep(reveal-.18,reveal,length(uv));',
        '   outc.rgb+=k*(m*full*ao+(1.-m)*ghost*rv*gmul)+k*glint*flash*glow;',
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
        // ---------- запас встающих монет ----------
        // Тысяча монет каждый кадр — это тысяча проходов. Поэтому монета,
        // которая уже встала, один раз дорисовывается в отдельную текстуру
        // (store), и в кадре рисуются только она и монеты в движении.
        const tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cv.width, cv.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const bp = gl.createProgram();
        gl.attachShader(bp, sh(gl.VERTEX_SHADER, this.FLIP_VS));
        gl.attachShader(bp, sh(gl.FRAGMENT_SHADER, 'precision mediump float;uniform sampler2D t;uniform vec2 res;void main(){gl_FragColor=texture2D(t,gl_FragCoord.xy/res);}'));
        gl.linkProgram(bp);
        const blit = () => {
            gl.useProgram(bp); gl.disable(gl.SCISSOR_TEST);
            gl.uniform1i(gl.getUniformLocation(bp, 't'), 2); gl.uniform2f(gl.getUniformLocation(bp, 'res'), cv.width, cv.height);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.enable(gl.SCISSOR_TEST); gl.useProgram(pr);
        };
        return {
            clear: () => { gl.disable(gl.SCISSOR_TEST); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.enable(gl.SCISSOR_TEST); },
            // рисовать в запас (true) или на экран (false)
            toStore: (on) => { gl.bindFramebuffer(gl.FRAMEBUFFER, on ? fbo : null); },
            blit,
            // x, y, rad — пиксели холста (y вниз), n — ось монеты, kind — 'gold'/'euro'
            // roll — поворот монеты вокруг своей оси (куда смотрит цифра), ao — затенение
            coin: (x, y, rad, st, kind, tilt, roll, ao) => {
                const S = this.LIGHT, l = this.v3.norm(S.L);
                gl.uniform2f(U('C'), x, cv.height - y); gl.uniform1f(U('rad'), rad);
                gl.uniform1f(U('reveal'), st.reveal === undefined ? 9 : st.reveal);
                gl.uniform1f(U('gbase'), st.ghost || 0);
                gl.uniform1f(U('gmul'), st.quiet ? 0 : 1);
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
    PILE_DEMO: { n: 26, spread: 2.9, zoom: 2.4, hold: 1600, gap: 700 },

    // ---------- КТО КОГДА ВСПЫХИВАЕТ ----------
    // Замысел игрока: пока у монеты идёт появление (от искры до посадки на
    // место), соседи рядом не начинают — вспышки рассыпаны, а не пачкой.
    // Когда все стартовали почти разом, искры и вспышки соседей сливались в
    // белые пятна. Жадно: монеты в случайном порядке, каждой — ближайшее
    // время, когда её окно не пересекается с окнами соседей ближе near.
    // win: [от, до] мс от старта монеты — окно, которое занимает её процесс.
    // → у каждой монеты поле key (мс задержки). Возвращает самую позднюю.
    scheduleFlips(coins, near, win, key, rnd, step) {
        const order = coins.slice().sort(() => rnd() - 0.5), done = [];
        step = step || 40;
        let last = 0;
        for (const c of order) {
            const nb = done.filter(o => Math.hypot(o.x - c.x, o.y - c.y) < near);
            let t = Math.floor(rnd() * 4) * step;
            const busy = (t) => nb.some(o => t + win[0] < o[key] + win[1] && o[key] + win[0] < t + win[1]);
            while (busy(t)) t += step;
            c[key] = t; done.push(c); last = Math.max(last, t);
        }
        return last;
    },
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
                side: rnd() });
        }
        coins.forEach((c, i) => { c.ao = 0.55 + 0.45 * (i / (coins.length - 1)); });
        Promise.all([load(dir + 'coin-flat-albedo.png'), load(dir + 'coin-flat-normal.png')]).then(([a, n]) => {
            if (!alive) return;
            const R = this.flipRenderer(cv, a, n);
            if (!R) { close(); return; }
            const F = this.FLIP, run = F.toPeak + F.fromPeak;
            // окно процесса: от искры (первый кадр блика — около трети пути
            // до пика) до посадки; соседи — монеты, что касаются друг друга
            const win = [Math.round(F.toPeak * 0.6), run], near = rad * 2.1;
            const lastIn = this.scheduleFlips(coins, near, win, 'delayIn', rnd);
            const lastOut = this.scheduleFlips(coins, near, [0, run - Math.round(F.toPeak * 0.6)], 'delayOut', rnd);
            const CYCLE = lastIn + run + P.hold + lastOut + run + P.gap;
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
                const outAt = lastIn + run + P.hold;
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
    },

    // ---------- ПОКАЗ ИЗ 🐞: ВЕСЬ ЭКРАН ----------
    // Та же раскладка, что у кучи (layout), в настоящем размере. Расписание
    // мягче, чем у кучки: соседям нельзя только одновременно ПИК вспышки
    // (bright, мс от пика); искры и повороты пусть идут у всех сразу. Иначе
    // куча собиралась мучительно долго: правило «весь путь» — у кучки, окно
    // «искра…вспышка» с соседством 2,6 радиуса — 8 с на весь экран.
    // Нижние слои стартуют раньше верхних — куча нарастает; монета не
    // ложится поверх той, что выше неё, уже вставшей.
    FULL_DEMO: { near: 1.5, layerLag: 120, spread: 500, bright: [-70, 100], hold: 2200, gap: 600 },
    flipFullDemo(host) {
        if (this._pv) return;
        const root = document.createElement('div');
        Object.assign(root.style, { position: 'absolute', inset: '0', zIndex: 9999, background: PALETTE.greedCoin.gold.deep, touchAction: 'none' });
        const mkCv = () => { const c = document.createElement('canvas'); c.width = this.W; c.height = this.H;
            Object.assign(c.style, { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', display: 'block' }); root.appendChild(c); return c; };
        const cvPile = mkCv(), cv = mkCv();
        host.appendChild(root);
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
        Promise.all([load(dir + 'coin-flat-albedo.png'), load(dir + 'coin-flat-normal.png'),
                     load(dir + 'coins-albedo.png'), load(dir + 'coins-normal.png')]).then(([fa, fn, aa, an]) => {
            if (!alive) return;
            const R = this.flipRenderer(cv, fa, fn);
            const pile = this.buildPile(aa, an);
            const drawPile = this.lighter(cvPile, pile);
            if (!R || !drawPile) { close(); return; }
            const F = this.FLIP, run = F.toPeak + F.fromPeak, P = this.FULL_DEMO, D = Math.PI / 180;
            const coins = [];
            pile.layers.forEach((L, li) => L.forEach(c => coins.push({
                x: c.x, y: c.y, kind: c.kind, pose: c.n, roll: this.poses()[c.pose].roll * D,
                rad: this.RAD * this.LAYERS[li].s, ao: this.LAYERS[li].ao, layer: li, side: ((c.x * 7 + c.y * 13) % 100) / 100
            })));
            // вспыхивает только верхний слой кучи
            const topLayer = Math.max(...coins.map(c => c.layer));
            for (const c of coins) c.quiet = c.layer !== topLayer;
            let st = 99;
            const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
            // старт: случайно в пределах spread, со сдвигом на слой; затем
            // соседей разводят по яркому окну
            const sched = (key, rev) => {
                const bright = [F.toPeak + P.bright[0], F.toPeak + P.bright[1]];
                const win = rev ? [run - bright[1], run - bright[0]] : bright;
                const cell = 64, grid = new Map(), near = this.RAD * P.near;
                let last = 0;
                const nL = this.LAYERS.length;
                const order = coins.slice().sort((a, b) => (rev ? b.layer - a.layer : a.layer - b.layer) || rnd() - 0.5);
                for (const c of order) {
                    const li = rev ? nL - 1 - c.layer : c.layer;
                    let t = Math.round(li * P.layerLag + rnd() * P.spread);
                    const gx = Math.floor(c.x / cell), gy = Math.floor(c.y / cell), nb = [];
                    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
                        const q = grid.get((gy + j) * 1000 + gx + i);
                        if (q) for (const o of q) if (Math.hypot(o.x - c.x, o.y - c.y) < near) nb.push(o);
                    }
                    // правило соседства — только между вспыхивающими
                    const busy = (t) => !c.quiet && nb.some(o => t + win[0] < o[key] + win[1] && o[key] + win[0] < t + win[1]);
                    while (busy(t)) t += 30;
                    c[key] = t; last = Math.max(last, t);
                    const k = gy * 1000 + gx;
                    if (!c.quiet) { if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c); }
                }
                return last;
            };
            const lastIn = sched('delayIn', false), lastOut = sched('delayOut', true);
            this._fullStats = { coins: coins.length, inMs: lastIn + run, outMs: lastOut + run };
            const outAt = lastIn + run + P.hold, CYCLE = outAt + lastOut + run + P.gap;
            const tilt = { x: 0, y: 0 };
            let cycle = null, stored = 0, lastRebuild = -1e9;
            // порядок рисования — как в куче: по слоям, внутри слоя как разложено
            const t0 = performance.now();
            const loop = (now) => {
                if (!alive) return;
                const T = (typeof Tilt !== 'undefined' && Tilt.turn) ? Tilt.turn() : { live: false };
                const want = T.live ? T : { x: 0, y: 0 };
                tilt.x += (want.x - tilt.x) * 0.15; tilt.y += (want.y - tilt.y) * 0.15;
                const e = Math.max(0, this._flipAt != null ? this._flipAt : now - t0), k = Math.floor(e / CYCLE), t = e - k * CYCLE;
                if (k !== cycle) {
                    cycle = k;
                    const H = this.peakAxis(tilt);
                    for (const c of coins) {
                        c.H = H; c.edge = this.edgeAxis(H, c.pose, c.side); c.edgeOut = [-c.edge[0], -c.edge[1], 0];
                        c.seen = undefined; c.in = false;
                    }
                    R.toStore(true); R.clear(); R.toStore(false);
                    stored = 0;
                }
                // куча стоит целиком — показываем настоящую кучу с живым блеском
                const settled = t >= lastIn + run && t < outAt;
                cvPile.style.visibility = settled ? 'visible' : 'hidden';
                cv.style.visibility = settled ? 'hidden' : 'visible';
                if (settled) { drawPile(tilt); requestAnimationFrame(loop); return; }
                const leaving = t >= outAt;
                // уход: запас пересобирается из оставшихся раз в 120 мс
                if (leaving && now - lastRebuild > 120) {
                    lastRebuild = now;
                    R.toStore(true); R.clear();
                    for (const c of coins) if (t - outAt - c.delayOut < 0) R.coin(c.x, c.y, c.rad, { n: c.pose, m: 1, flash: 0 }, c.kind, tilt, c.roll, c.ao);
                    R.toStore(false);
                }
                // встали — в запас
                if (!leaving) for (const c of coins) if (!c.in && t - c.delayIn >= run) {
                    c.in = true; R.toStore(true);
                    R.coin(c.x, c.y, c.rad, { n: c.pose, m: 1, flash: 0 }, c.kind, tilt, c.roll, c.ao);
                    R.toStore(false); stored++;
                }
                R.clear(); R.blit();
                for (const c of coins) {
                    let s;
                    if (!leaving) {
                        const ti = t - c.delayIn;
                        if (ti < 0 || ti >= run) continue;
                        s = this.flipState(c, ti, 'in');
                    } else {
                        const to = t - outAt - c.delayOut;
                        if (to < 0 || to >= run) continue;
                        s = this.flipState({ pose: c.pose, H: c.H, edge: c.edgeOut, seen: c.seen, quiet: c.quiet }, to, 'out');
                    }
                    R.coin(c.x, c.y, c.rad, s, c.kind, tilt, c.roll, c.ao);
                }
                requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
        });
    }
});
