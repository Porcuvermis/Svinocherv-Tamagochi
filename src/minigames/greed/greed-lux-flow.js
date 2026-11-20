// ================= АППАРАТ АЛЧНОСТИ, ВЕРСИЯ 2: КАК ТЕЧЁТ РАСПЛАВ =================
// План 31, разд. 5г, 2.9. Фронт литья был формулой (эллипс от места удара +
// синусы по x + заготовленные язычки подтёков) — игрок: «симметрично,
// одинаково, квадратными штуками; не похоже ни на подтёки, ни на
// выгорание». Узор не менялся по ходу, корпус на течение не влиял.
//
// Теперь фронт вычисляется: карта прихода T(x, y) — когда расплав приходит
// в точку, кратчайшим временем от источников (Дейкстра по сетке, 16
// направлений — без «клеток»). Форма края выходит из скорости в каждой
// точке, а скорость — из причин:
//   * тяжесть: вниз быстро, вбок медленно, вверх — только у места удара
//     (брызги разбегаются), дальше едва;
//   * неровность плёнки — шум, вытянутый по вертикали: дорожки, по которым
//     металл бежит ручьями разной ширины; дорожки меняются по ходу — ручьи
//     сливаются, расходятся, обгоняют друг друга;
//   * мелкая шероховатость — рваный край, как у прогорающей бумаги;
//   * пазы корпуса версии 2 (золото, вертикальные кромки из карты высот) —
//     в них быстрее: подтёки там, где на корпусе правда паз;
//   * ступени: где поверхность поднимается вниз по ходу (верх рамки экрана,
//     полки поясов), металл стоит лужей и прорывается в нескольких местах
//     (где шум прорыва выше порога); с уступа вниз — срывается быстрее;
//   * стекло — гладкое, чуть быстрее.
// Источники: место удара — неровное пятно из нескольких точек с разными
// задержками (асимметрия); капли брызг — свои точки со своим временем.
// Узор один и тот же всегда (seed): игрок видит литьё один раз за игру,
// долго к нему копит — оно должно быть выверено, а не выпадать как
// получится (игрок, 20.11). Зерно выбрано по листу кандидатов; отладка —
// localStorage 'gj-cast-seed'.
Object.assign(GreedLux, {
    FLOW: {
        seed: 8,
        step: 1.5,                           // ед. на клетку
        vd: 0.15, vh: 0.065, vu: 0.025,      // ед./мс: вниз, вбок, вверх (вдали от удара)
        splashUp: 0.15, splashR: 80,         // у места удара вверх быстрее (брызги)
        lane: { sx: 14, sy: 110, amp: 1.5 }, // дорожки ручьёв: масштаб по x, по y, сила
        // редкие узкие струйки — убегают далеко вперёд (настоящие подтёки):
        // где узкий вытянутый шум выше порога, скорость растёт до (1 + amp)
        streak: { sx: 5.5, sy: 170, lo: 0.68, hi: 0.84, amp: 1.6 },
        rough: { s: 3.6, amp: 0.35 },        // мелкая шероховатость (сильнее — край морщинился ворсом)
        groove: 1.7,                         // пазы — во столько раз быстрее
        // ступень держит лужу, но недолго, и прорывается во многих местах:
        // долгая лужа во всю ширину резала фронт прямой линией (лист 20.11)
        ledge: { thr: 0.45, brake: 0.3, spill: 0.55, spillS: 16, drop: 1.5 },
        glass: 1.15,
        impact: { n: 7, r: 12, delay: 90 },
        spots: [[150, 205, 140], [262, 200, 180], [118, 262, 300], [300, 252, 340], [182, 330, 560], [246, 362, 680]]
    },

    // шум со своим зерном: значения в узлах — хэш, между ними — гладко
    flowNoise(seed) {
        const h = (ix, iy) => { let n = ix * 374761393 + iy * 668265263 + seed * 2246822519; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
        const sm = (t) => t * t * (3 - 2 * t);
        const vn = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y), fx = sm(x - ix), fy = sm(y - iy);
            const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
            return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
        return (x, y, oct = 3) => { let s = 0, w = 0.5, f = 1, tw = 0; for (let o = 0; o < oct; o++) { s += vn(x * f + o * 17.3, y * f - o * 9.1) * w; tw += w; w *= 0.5; f *= 2.03; } return s / tw; };
    },

    // карты версии 2 (высота 16 бит, материал) — в сетку течения
    flowMaps() {
        if (this._flowMapsP) return this._flowMapsP;
        const DIR = this.dir(), img = (n) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = DIR + n + '.png'; });
        this._flowMapsP = Promise.all([img('height'), img('mat')]).then(([hi, mi]) => {
            const F = this.FLOW, gw = Math.round(this.W / F.step), gh = Math.round(this.H / F.step);
            const read = (im) => { const c = document.createElement('canvas'); c.width = gw; c.height = gh; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(im, 0, 0, gw, gh); return g.getImageData(0, 0, gw, gh).data; };
            const H = read(hi), M = read(mi), hgt = new Float32Array(gw * gh), gold = new Uint8Array(gw * gh), glass = new Uint8Array(gw * gh);
            for (let i = 0; i < gw * gh; i++) { hgt[i] = (H[i * 4] * 256 + H[i * 4 + 1]) / 65535 * 64; gold[i] = M[i * 4 + 2] > 127 ? 1 : 0; glass[i] = M[i * 4 + 1] > 127 ? 1 : 0; }
            return { gw, gh, hgt, gold, glass };
        });
        return this._flowMapsP;
    },

    // Карта прихода: Float32Array gw×gh, мс от удара струи
    async flowBuild(seed) {
        const F = this.FLOW, Mp = await this.flowMaps(), { gw, gh, hgt, gold, glass } = Mp, st = F.step, Y0 = this.Y0;
        if (seed == null) { try { seed = +localStorage.getItem('gj-cast-seed') || F.seed; } catch (e) { seed = F.seed; } }
        const N1 = this.flowNoise(seed), N2 = this.flowNoise(seed + 101), N3 = this.flowNoise(seed + 202), N4 = this.flowNoise(seed + 303);
        const smo = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
        let rnd = seed % 2147483647 || 1; const R = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
        // скорость (без направления) в клетке
        // Sd — скорость по ходу вниз (дорожки, струйки, пазы), Sr — вверх и вбок
        // (только шероховатость): дорожки во все стороны поднимали расплав
        // вверх узкой колонной (лист 20.11); dn — ступени, только вниз
        const S = new Float32Array(gw * gh), Sr = new Float32Array(gw * gh), dn = new Float32Array(gw * gh);
        const at = (x, y) => hgt[Math.max(0, Math.min(gh - 1, y)) * gw + Math.max(0, Math.min(gw - 1, x))];
        for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
            const i = y * gw + x, fx = x * st, fy = y * st + Y0;
            const rough = Math.exp(F.rough.amp * (N2(fx / F.rough.s, fy / F.rough.s, 2) - 0.5) * 2);
            let s = Math.exp(F.lane.amp * (N1(fx / F.lane.sx, fy / F.lane.sy, 2) - 0.5) * 2) * rough;
            s *= 1 + F.streak.amp * smo(F.streak.lo, F.streak.hi, N4(fx / F.streak.sx, fy / F.streak.sy, 2));
            Sr[i] = rough * (glass[i] ? F.glass : 1);
            const gx = (at(x + 1, y) - at(x - 1, y)) / (2 * st), gy = (at(x, y + 1) - at(x, y - 1)) / (2 * st);
            if (gold[i] && Math.abs(gx) > Math.abs(gy)) s *= F.groove;       // вертикальная золотая кромка — паз
            if (glass[i]) s *= F.glass;
            let d = 1;
            if (gy > F.ledge.thr && N3(fx / F.ledge.spillS, 0.5, 2) < F.ledge.spill) d = F.ledge.brake;   // ступень вверх по ходу — лужа
            else if (gy < -F.ledge.thr) d = F.ledge.drop;                    // с уступа — срыв
            S[i] = s; dn[i] = d;
        }
        // направления: 16 (соседи на 1 и «ход коня»)
        const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 1], [-2, 1], [2, -1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2]]
            .map(([dx, dy]) => { const L = Math.hypot(dx, dy); return { dx, dy, L: L * st, c: dy / L }; });
        const xi = this.CAST.xi, yi = this.CAST.yi;
        const T = new Float32Array(gw * gh).fill(1e9);
        // куча (минимум сверху)
        const hk = new Float32Array(gw * gh * 16), hv = new Int32Array(gw * gh * 16); let hn = 0;
        const push = (k, v) => { let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = k; hv[i] = v; };
        const pop = () => { const v = hv[0], k = hk[0], lk = hk[--hn], lv = hv[hn]; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= hn) break; if (c + 1 < hn && hk[c + 1] < hk[c]) c++; if (hk[c] >= lk) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; } hk[i] = lk; hv[i] = lv; return [k, v]; };
        const seedAt = (x, y, t) => { const gx = Math.round(x / st), gy = Math.round((y - Y0) / st); if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return; const i = gy * gw + gx; if (t < T[i]) { T[i] = t; push(t, i); } };
        // удар — неровное пятно
        for (let k = 0; k < F.impact.n; k++) { const a = R() * Math.PI * 2, r = Math.sqrt(R()) * F.impact.r; seedAt(xi + Math.cos(a) * r * 1.4, yi + Math.sin(a) * r * 0.7, R() * F.impact.delay); }
        // капли брызг — со сдвигом на это литьё
        const spots = F.spots.map(([sx, sy, t0]) => [sx + (R() - 0.5) * 16, sy + (R() - 0.5) * 12, t0 + (R() - 0.5) * 80]);
        spots.forEach(([x, y, t]) => seedAt(x, y, t));
        while (hn > 0) {
            const [t, i] = pop();
            if (t > T[i]) continue;
            const x = i % gw, y = (i / gw) | 0, fx = x * st, fy = y * st + Y0, dI = Math.hypot(fx - xi, fy - yi);
            const vu = F.vu + F.splashUp * Math.exp(-dI / F.splashR);
            for (let k = 0; k < 16; k++) {
                const e = D[k], nx = x + e.dx, ny = y + e.dy;
                if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
                const j = ny * gw + nx, c = e.c;
                let v = c > 0 ? F.vh + (F.vd - F.vh) * c * c : F.vh + (vu - F.vh) * (-c);
                if (c > 0) v *= (dn[i] + dn[j]) / 2;
                const m = smo(0.05, 0.6, c);
                v *= ((S[i] + S[j]) / 2) * m + ((Sr[i] + Sr[j]) / 2) * (1 - m);
                const nt = t + e.L / v;
                if (nt < T[j]) { T[j] = nt; push(nt, j); }
            }
        }
        return { T, gw, gh, step: st, seed, spots };
    },

    // время прихода в точке поля — билинейно по карте (JS: кант, экраны, искры)
    flowAt(flow, x, y) {
        const { T, gw, gh, step } = flow, fx = Math.max(0, Math.min(gw - 1.001, x / step)), fy = Math.max(0, Math.min(gh - 1.001, (y - this.Y0) / step));
        const ix = fx | 0, iy = fy | 0, u = fx - ix, v = fy - iy, i = iy * gw + ix;
        return (T[i] * (1 - u) + T[i + 1] * u) * (1 - v) + (T[i + gw] * (1 - u) + T[i + gw + 1] * u) * v;
    },

    // Карта — в текстуру: R, G — время ×FLOW_K (16 бит, без сглаживания;
    // сглаживает шейдер сам — байты 16-битного числа видеокарта смешивать
    // не умеет). B — пусто.
    FLOW_K: 6,
    flowTexture(gl, unit) {
        const f = this._flow, K = this.FLOW_K, n = f.gw * f.gh, d = new Uint8Array(n * 4);
        for (let i = 0; i < n; i++) { const v = Math.max(0, Math.min(65535, Math.round(f.T[i] * K))); d[i * 4] = v >> 8; d[i * 4 + 1] = v & 255; d[i * 4 + 3] = 255; }
        const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, f.gw, f.gh, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
        [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST));
        [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE));
        gl.activeTexture(gl.TEXTURE0);
        return t;
    },

    // ---------- отладка: изохроны поверх корпуса ----------
    // каждые every мс — полоса своего цвета; лист показывает, как фронт
    // меняется во времени, без анимации
    // lines: только контуры фронта (корпус виден), цвет от раннего к позднему
    flowDebugDraw(flow, every = 150, lines = false) {
        // гладко: по точке на 0,5 ед. билинейно (сетка 1,5 ед. давала лесенку)
        const gw = this.W * 2, gh = this.H * 2, cv = document.createElement('canvas');
        cv.width = gw; cv.height = gh;
        const g = cv.getContext('2d'), im = g.createImageData(gw, gh);
        for (let i = 0; i < gw * gh; i++) {
            const t = this.flowAt(flow, (i % gw) / 2, ((i / gw) | 0) / 2 + this.Y0), b = Math.floor(t / every), f = t / every - b;
            if (lines === 'fill') {
                // залитое к мигу every: золото, у края — светлая кайма
                const d = every - t, on = d > 0;
                im.data[i * 4] = 255; im.data[i * 4 + 1] = d < 25 ? 245 : 190; im.data[i * 4 + 2] = d < 25 ? 200 : 40; im.data[i * 4 + 3] = on ? (d < 25 ? 255 : 200) : 0;
                continue;
            }
            if (lines) {
                const on = f < 0.035 && t < 9e8, [r, gg, bb] = this._hsl(Math.max(0, 58 - b * 8), 1, 0.6);
                im.data[i * 4] = r; im.data[i * 4 + 1] = gg; im.data[i * 4 + 2] = bb; im.data[i * 4 + 3] = on ? 255 : 0;
                continue;
            }
            const hue = (b * 47) % 360, edge = f < 0.18 ? 1 : 0;
            const [r, gg, bb] = this._hsl(hue, 0.85, edge ? 0.25 : 0.55);
            im.data[i * 4] = r; im.data[i * 4 + 1] = gg; im.data[i * 4 + 2] = bb; im.data[i * 4 + 3] = t > 9e8 ? 0 : (edge ? 235 : 110);
        }
        g.putImageData(im, 0, 0);
        cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:60;pointer-events:none;background:none';
        this.wrapEl.appendChild(cv);
        return cv;
    },
    _hsl(h, s, l) {
        const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
        return [f(0) * 255, f(8) * 255, f(4) * 255].map(Math.round);
    }
});
