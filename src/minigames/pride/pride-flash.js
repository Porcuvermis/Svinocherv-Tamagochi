// ================= ТЩЕСЛАВИЕ: ВСПЫШКИ ФОТОАППАРАТОВ (переход окна) =================
// docs/plan/32-pride-cameras.md, задачи 4–5: вид одной вспышки, белизна экрана,
// расписание волны и ходы покрова (вход, выход, три нажатия в забеге).
//
// Вспышка трёх размеров (решение игрока): маленькая, средняя, большая. Чем больше
// вспышка, тем сильнее она белит ВЕСЬ экран (как светошумовая граната) — это
// отдельный слой белизны, а не размер пятна.
//
// Дёшево: ореол, звезда и ядро печутся один раз в простое (bake), в кадре — только
// drawImage с масштабом и прозрачностью и один прямоугольник белизны. Градиентов и
// фильтров в кадре нет (docs/traps.md, пп. 164–167).
const PrideFlash = {
    // r — радиус ореола, star — длина лучей в радиусах ореола (0 — без звезды),
    // rays — сколько лучей, core — радиус горячего ядра.
    SIZES: {
        S: { r: 58, star: 0, rays: 0, core: 7 },
        M: { r: 120, star: 1.25, rays: 4, core: 12 },
        L: { r: 300, star: 0.75, rays: 8, core: 22 }
    },
    sprites: null,

    rgba(hex, a) {
        const n = parseInt(hex.slice(1), 16);
        return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    },
    // ---------- выпечка ----------
    bake() {
        if (this.sprites) return this.sprites;
        const F = PALETTE.redCarpet.flash, N = 256, c = N / 2;
        const mk = () => { const cv = document.createElement('canvas'); cv.width = cv.height = N; return cv; };
        // Ореол: белое ядро, тёплый край, долгий мягкий хвост — свет, а не диск.
        const halo = mk(), h = halo.getContext('2d');
        const gh = h.createRadialGradient(c, c, 0, c, c, c);
        // Профиль крутой: яркая точка и долгий слабый хвост. С плато (было 0,95 до
        // десятой части радиуса) сложение 'lighter' выжигало ровный белый диск с
        // жёсткой кромкой — большая вспышка читалась блином, а не светом.
        gh.addColorStop(0, this.rgba(F[300], 1));
        gh.addColorStop(0.05, this.rgba(F[300], 0.85));
        gh.addColorStop(0.16, this.rgba(F[500], 0.38));
        gh.addColorStop(0.4, this.rgba(F[500], 0.12));
        gh.addColorStop(0.7, this.rgba(F[500], 0.035));
        gh.addColorStop(1, this.rgba(F[500], 0));
        h.fillStyle = gh; h.fillRect(0, 0, N, N);
        // Звезда: тонкий луч, ярко у центра, гаснет к концу. Один луч — поворачиваем.
        const ray = mk(), r = ray.getContext('2d');
        const gr = r.createLinearGradient(0, c, N, c);
        gr.addColorStop(0, this.rgba(F[300], 0));
        gr.addColorStop(0.42, this.rgba(F[300], 0.55));
        gr.addColorStop(0.5, this.rgba(F[300], 1));
        gr.addColorStop(0.58, this.rgba(F[300], 0.55));
        gr.addColorStop(1, this.rgba(F[300], 0));
        r.fillStyle = gr;
        r.beginPath(); r.moveTo(0, c); r.lineTo(c, c - 5); r.lineTo(N, c); r.lineTo(c, c + 5); r.closePath(); r.fill();
        // Ядро: горячая точка, почти без края.
        const core = mk(), k = core.getContext('2d');
        const gk = k.createRadialGradient(c, c, 0, c, c, c);
        gk.addColorStop(0, this.rgba(F[300], 1));
        gk.addColorStop(0.55, this.rgba(F[300], 1));
        gk.addColorStop(1, this.rgba(F[300], 0));
        k.fillStyle = gk; k.fillRect(0, 0, N, N);
        return (this.sprites = { halo, ray, core, N });
    },

    // ---------- одна вспышка ----------
    // a — яркость 0…1 (кривую во времени задаёт движок), spin — поворот звезды.
    draw(g, x, y, size, a, spin) {
        if (a <= 0.003) return;
        const S = this.bake(), Z = this.SIZES[size];
        const grow = 0.7 + 0.3 * a;                 // гаснущая вспышка чуть сжимается
        const R = Z.r * grow;
        g.save();
        g.globalAlpha = a;
        // Свет складывается со сценой ('lighter'): на светлом месте вспышка выжигает
        // до белого, на тёмном — светится ореолом. Обычное наложение давало на
        // красном занавесе бледное пятно, а не вспышку.
        g.globalCompositeOperation = 'lighter';
        g.drawImage(S.halo, x - R, y - R, 2 * R, 2 * R);
        if (Z.rays) {
            const len = R * Z.star * 2;
            // Спрайт луча идёт через центр в обе стороны: на N лучей — N/2 штрихов.
            const n = Z.rays / 2;
            for (let i = 0; i < n; i++) {
                const w = i % 2 && n > 2 ? 0.6 : 1;               // у восьми — длинные и короткие вперемешку
                g.save(); g.translate(x, y); g.rotate((spin || 0) + i * Math.PI / n);
                g.drawImage(S.ray, -len * w / 2, -len * 0.06, len * w, len * 0.12);
                g.restore();
            }
        }
        const C = Z.core * (0.6 + 0.4 * a);
        g.drawImage(S.core, x - C, y - C, 2 * C, 2 * C);
        g.restore();
    },


    // ================= ДВИЖОК: состояние по часам =================
    // Покров считает не «кадр от доли хода», а состояние на момент времени: ход
    // ДОБАВЛЯЕТ вспышки и «печать» белого, кадр рисует то, что живо сейчас. Поэтому
    // второе нажатие ложится на послесвечение первого, `pop` дорисовывает остаток,
    // отмена входа не рвёт картинку.
    //
    // Белизна экрана W = 1 − (1 − ослепление)(1 − печать):
    //   ослепление — 1 − Π(1 − aᵢ(t)) по всем вспышкам: чем больше вспышка, тем
    //     сильнее и дольше (светошумовая граната, замысел игрока);
    //   печать — плавная кривая, которая доводит экран до сплошного белого на входе и
    //     выходе и отпускает его на раскрытии.
    LIFE: { S: 230, M: 380, L: 700 },                 // жизнь пятна, мс
    ATTACK: { S: 30, M: 50, L: 90 },                  // нарастание (не в один кадр — без стробоскопа)
    BLIND: {                                          // вклад в белизну экрана
        S: { amp: 0.05, hold: 0, fall: 180 },
        M: { amp: 0.22, hold: 60, fall: 450 },
        L: { amp: 0.70, hold: 260, fall: 1500 }
    },
    // Ходы покрова (имена — у core/mg-veil.js), длительности в мс.
    T: { cover: 1050, reveal: 1300, close: 1050, clear: 1300, finish: 950, pop: 120 },
    clock: null,                                      // подмена часов для проб
    now() { return this.clock ? this.clock() : performance.now(); },
    st: null,
    reset() { this.st = { fl: [], seal: { t0: 0, dur: 1, from: 0, to: 0 } }; },

    rng(seed) {
        let a = seed >>> 0;
        return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    },
    calm() { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; },

    // ---------- порядок: распределённо-случайный ----------
    // Каждая следующая точка — из восьми случайных кандидатов самая далёкая от трёх
    // последних. Соседние подряд не вспыхивают, но и «волны по кругу» нет.
    order(pts, n, R) {
        const out = [], recent = [];
        for (let k = 0; k < n; k++) {
            let best = null, bd = -1;
            for (let c = 0; c < 8; c++) {
                const p = pts[Math.floor(R() * pts.length)];
                if (recent.slice(-10).includes(p) && pts.length > 12) continue;
                const d = recent.slice(-3).reduce((m, q) => Math.min(m, Math.hypot(p.x - q.x, p.y - q.y)), 1e9);
                if (d > bd) { bd = d; best = p; }
            }
            best = best || pts[k % pts.length];
            out.push(best); recent.push(best);
        }
        return out;
    },
    // ---------- волна ----------
    // o: n — сколько вспышек, T — за сколько мс, shape — 'rise' (редко → шквал) |
    // 'fall' (часто → редко) | 'flat'; mix — доли S/M/L; lFrom — с какой доли хода
    // разрешены большие; lMax — сколько больших максимум (не чаще трёх в секунду).
    wave(t0, o) {
        const pts = this.points(), R = this.rng((this.seed = (this.seed || 7) + 101));
        if (!pts.length) return;
        const seq = this.order(pts, o.n, R);
        let lastL = -1e9, nL = 0;
        for (let k = 0; k < o.n; k++) {
            const q = (k + 0.5 + (R() - 0.5) * 0.8) / o.n;
            const x = Math.max(0, Math.min(1, q));
            // rise: плотность растёт к концу, но не с нуля — вспышки видны с первых кадров
            const f = o.shape === 'rise' ? Math.pow(x, 0.72) : o.shape === 'fall' ? x * x : x;
            const t = t0 + f * o.T;
            let r = R(), size = r < o.mix.S ? 'S' : r < o.mix.S + o.mix.M ? 'M' : 'L';
            if (size === 'L' && (x < (o.lFrom || 0) || nL >= (o.lMax || 0) || t - lastL < 340)) size = 'M';
            if (size === 'L') { lastL = t; nL++; }
            const bk = (o.blindK && o.blindK[size]) || 1;
            // Разброс вокруг точки: повтор той же камеры/места не бьёт в один пиксель.
            const j = seq[k].cam === -1 ? 34 : 6;
            this.st.fl.push({ x: seq[k].x + (R() * 2 - 1) * j, y: seq[k].y + (R() * 2 - 1) * j, size, t0: t, spin: R() * Math.PI, bk });
        }
    },
    points() {
        if (typeof PrideCameras !== 'undefined' && PrideCameras.imgs && PrideCameras.imgs.ready) {
            try { return PrideCameras.flashPoints(); } catch (e) { /* без камер — только экран */ }
        }
        const pts = [];
        for (let i = 0; i < 30; i++) pts.push({ x: 40 + (i % 5) * 75, y: 80 + Math.floor(i / 5) * 120 });
        return pts;
    },
    sealTo(to, dur, out) {
        const t = this.now();
        this.st.seal = { t0: t, dur, from: this.sealAt(t), to, out: !!out };
    },
    sealAt(t) {
        const S = this.st.seal, x = Math.max(0, Math.min(1, (t - S.t0) / S.dur));
        // вверх — плавный разгон (smoothstep), вниз — косинусом: отпускает мягко
        // вниз: обычный — косинусом; out — сразу и быстро (раскрытие: белое уходит в
        // первые сотни мс, чтобы редеющие вспышки было видно на рамке, а не на белом)
        const e = S.to > S.from ? (S.out ? 1 - (1 - x) * (1 - x) : x * x * (3 - 2 * x))
                                : (S.out ? 1 - (1 - x) * (1 - x) * (1 - x) : 0.5 - 0.5 * Math.cos(Math.PI * x));
        return S.from + (S.to - S.from) * e;
    },
    // Яркость пятна и вклад в белизну одной вспышки в момент t.
    glow(f, t) {
        const d = t - f.t0, A = this.ATTACK[f.size], L = this.LIFE[f.size];
        if (d < 0 || d > L) return 0;
        if (d < A) return d / A;
        const x = (d - A) / (L - A);
        return (1 - x) * (1 - x);
    },
    blind(f, t) {
        const d = t - f.t0, B = this.BLIND[f.size], A = this.ATTACK[f.size];
        if (d < 0) return 0;
        const amp = B.amp * (f.bk || 1);
        if (d < A) return amp * d / A;
        if (d < A + B.hold) return amp;
        const x = (d - A - B.hold) / B.fall;
        return x >= 1 ? 0 : amp * (1 - x) * (1 - x);
    },
    whiteAt(t) {
        let keep = 1;
        for (const f of this.st.fl) keep *= 1 - this.blind(f, t);
        return 1 - keep * (1 - this.sealAt(t));
    },
    // Есть ли ещё что дорисовывать (ход не кончается, пока не отгорело). Сплошной
    // белый на входе/выходе — не «ожидание»: дальше его держит veilStill.
    pending() {
        const t = this.now();
        if (this.sealAt(t) >= 0.999 && this.st.seal.to === 1) return false;
        if (this.st.seal.to !== this.st.seal.from && t < this.st.seal.t0 + this.st.seal.dur) return true;
        return this.st.fl.some(f => t - f.t0 < Math.max(this.LIFE[f.size], this.ATTACK[f.size] + this.BLIND[f.size].hold + this.BLIND[f.size].fall));
    },
    // Кадр: белизна, поверх — живые вспышки (на молочном экране ядра ещё видны).
    render(g, t) {
        g.clearRect(-2, -2, STAGE_W + 4, STAGE_H + 4);
        const W = this.whiteAt(t);
        if (W >= 0.999) { this.whiteout(g, 1); return; }
        this.whiteout(g, W);
        for (const f of this.st.fl) { const a = this.glow(f, t); if (a > 0) this.draw(g, f.x, f.y, f.size, a, f.spin); }
        // отгоревшее выбрасываем, чтобы список не рос
        if (this.st.fl.length > 400) this.st.fl = this.st.fl.filter(f => t - f.t0 < 2200 || f.t0 > t);
    },

    // ---------- ходы покрова ----------
    // n — номер нажатия в забеге (MgVeil.knocks) для 'burst'.
    start(mode, n) {
        if (!this.st) this.reset();
        const t = this.now(), calm = this.calm();
        const add = (o) => { if (!calm) this.wave(t, o); };
        switch (mode) {
            case 'cover': case 'close':
                // Волна: сначала редко, потом шквал; большие — во второй половине.
                // Печать с 62 % хода (сначала экран забивают вспышки — они главное, белое только скрепляет; игрок) доводит экран до сплошного белого.
                // Мелкие и средние на входе почти не белят экран (blindK): иначе их сотня
                // складывается в серую пелену раньше, чем видно сами вспышки (проба кадрами).
                add({ n: 220, T: this.T.cover, shape: 'rise', mix: { S: 0.58, M: 0.32, L: 0.1 }, lFrom: 0.4, lMax: 7, blindK: { S: 0.12, M: 0.25 } });
                this.st.seal = { t0: t + this.T.cover * 0.62, dur: this.T.cover * 0.38, from: this.sealAt(t), to: 1 };
                break;
            case 'reveal': case 'clear':
                // Вспышки редеют (часто → редко), больших нет; белое отпускает плавно.
                add({ n: 55, T: 1050, shape: 'fall', mix: { S: 0.62, M: 0.38, L: 0 }, blindK: { S: 0.15, M: 0.2 } });
                this.sealTo(0, 900, true);
                break;
            case 'burst':
                if (n >= 2) add({ n: 50, T: 650, shape: 'flat', mix: { S: 0.6, M: 0.4, L: 0 }, blindK: { S: 0.6, M: 0.8 } });
                else add({ n: 30, T: 500, shape: 'flat', mix: { S: 1, M: 0, L: 0 }, blindK: { S: 0.9 } });
                if (calm) this.st.fl.push({ x: -999, y: -999, size: n >= 2 ? 'M' : 'S', t0: t, spin: 0 });
                break;
            case 'finish':
                add({ n: 200, T: this.T.finish, shape: 'rise', mix: { S: 0.55, M: 0.33, L: 0.12 }, lFrom: 0.3, lMax: 6, blindK: { S: 0.12, M: 0.25 } });
                // Печать стартует сразу и сразу растёт (out: разгон с первого кадра): экран
                // после второго нажатия не успевает «отпустить» и снова вспыхнуть — лишняя
                // смена яркости (замер безопасности ловил четыре за секунду при быстрых
                // нажатиях). Брать стартом текущую белизну нельзя: она уже включает
                // ослепление, и выходил скачок 0,24 за кадр.
                this.st.seal = { t0: t, dur: this.T.finish, from: this.sealAt(t), to: 1, out: true };
                break;
            case 'pop': default: break;
        }
    },

    // ---------- белизна всего экрана ----------
    // w — 0…1. Цвет — чистый белый: тёплый оттенок на большой белизне читался
    // грязно-бежевой плёнкой, а не ослеплением.
    whiteout(g, w) {
        if (w <= 0.003) return;
        const F = PALETTE.redCarpet.flash;
        g.save();
        g.globalAlpha = Math.min(1, w);
        g.fillStyle = F[300];
        g.fillRect(-2, -2, STAGE_W + 4, STAGE_H + 4);
        g.restore();
    }
};
if (typeof window !== 'undefined') window.PrideFlash = PrideFlash;
