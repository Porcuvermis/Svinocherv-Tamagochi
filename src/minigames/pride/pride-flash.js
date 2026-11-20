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
        // rise — нарастание белизны, отдельно от нарастания пятна (ATTACK): пятно
        // вспыхивает резко, а белизна набирается мягче, — иначе порыв толпы (десяток
        // средних в одно мгновение) давал скачок белизны больше 0,2 за кадр.
        S: { amp: 0.05, hold: 0, fall: 180, rise: 60 },
        M: { amp: 0.22, hold: 60, fall: 450, rise: 110 },
        L: { amp: 0.70, hold: 260, fall: 1500, rise: 120 }
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

    // ---------- РИТМ ТОЛПЫ (docs/plan/32-pride-cameras.md, задача 4а) ----------
    // Игрок: в толпе фотографов вспышки не идут ровным потоком — каждый снимает в
    // своём ритме, никто ни с кем не синхронизирован: то почти залп, то на миг
    // никто, потом снова по бокам; в среднем — постоянно. Поэтому не сетка
    // интервалов, а модель:
    //   фотограф = точка вспышки; у каждого реакция на общий старт, свой темп
    //     (150–650 мс, каждый кадр ±40 %), иногда серия 2–4 кадра через 70–110 мс,
    //     иногда пропущенный такт; размер вспышки — его камеры (зеркалка — крупнее,
    //     смартфон — мелко);
    //   порывы толпы — общий ступенчатый «пульс» готовности: обычно 0,45–1, иногда
    //     порыв ~1,5 (почти залп), иногда затишье 0,05–0,15;
    //   огибающая хода — средняя плотность (на входе растёт, на раскрытии
    //     фотографы по одному опускают камеры, на нажатиях ровная);
    //   число вспышек на ход держится прореживанием, а не сеткой.
    PREF: {                                           // какие вспышки у какой камеры
        pro: [0.35, 0.4, 0.25], film: [0.45, 0.35, 0.2], compact: [0.6, 0.35, 0.05],
        phone: [0.9, 0.1, 0], crowd: [0.6, 0.28, 0.12]
    },
    // o: n — сколько вспышек, T — мс, env — 'rise' | 'fall' | 'flat', sizes — какие
    // размеры разрешены ('S' | 'SM' | 'SML'), react — средняя реакция на старт, мс,
    // lFrom — с какой доли хода разрешены большие, lMax — сколько больших максимум,
    // blindK — ослабление вклада в белизну по размерам.
    crowd(t0, o) {
        const pts = this.points(), R = this.rng((this.seed = (this.seed || 7) + 101));
        if (!pts.length) return;
        const end = t0 + o.T;
        // Пульс толпы: ступени по 100–160 мс — обычная готовность 0,45–1 или порыв
        // ~1,5 (почти залп). Затишья (на миг никто) ставятся не монеткой, а чередой:
        // каждые 250–500 мс по 40–80 мс. Монеткой на одном ходе их могло не выпасть
        // вовсе (проба: на входе ни одного пустого окна), а замысел — что они есть
        // всегда. В последние 15 % хода затишья нет: там экран уже белеет.
        const knots = [], lulls = [];
        for (let t = t0 - 50; t < end + 400;) {
            const gust = R() < (o.gust == null ? 0.2 : o.gust), d = (100 + R() * 60) * (gust ? 0.6 : 1);
            knots.push({ t, v: gust ? 1.4 + R() * 0.2 : 0.45 + R() * 0.55, d });
            t += d;
        }
        for (let t = t0 + 120 + R() * 200; t < t0 + o.T * 0.85; t += 250 + R() * 250) lulls.push({ t, d: 40 + R() * 40 });
        const gate = (t) => {
            for (const l of lulls) if (t >= l.t && t < l.t + l.d) return 0;
            for (const k of knots) if (t < k.t + k.d) return k.v;
            return 0.7;
        };
        const env = (t) => {
            const x = (t - t0) / o.T;
            return o.env === 'rise' ? 0.3 + 0.7 * x : 1;
        };
        // кадры каждого фотографа
        const groups = [];
        let sumW = 0;
        pts.forEach((p) => {
            const period = 150 * Math.pow(650 / 150, R());            // свой темп
            const stop = o.env === 'fall' ? t0 + o.T * Math.pow(R(), 0.7) : end;
            const pref = this.PREF[p.fam] || this.PREF.crowd, rs = R();
            const size = rs < pref[0] ? 'S' : rs < pref[0] + pref[1] ? 'M' : 'L';
            let t = t0 - Math.log(1 - R() * 0.999) * (o.react || 0);  // реакция на старт
            while (t < stop) {
                if (R() < 0.12) { t += period * (0.6 + 0.8 * R()); continue; }   // опустил камеру
                const shots = [t];
                if (R() < 0.22) { const k = 1 + Math.floor(R() * 3); for (let i = 0; i < k; i++) shots.push(shots[shots.length - 1] + 70 + R() * 40); }
                const w = gate(t) * env(t);
                groups.push({ p, size, shots, w });
                sumW += w * shots.length;
                t += period * (0.6 + 0.8 * R()) + (shots.length - 1) * 90;
            }
        });
        // прореживание до заданного числа: решение одно на серию — пачки остаются пачками
        // c подбирается так, чтобы с учётом потолка вероятности (1) вышло ровно n
        let c = sumW > 0 ? o.n / sumW : 0;
        for (let it = 0; it < 6 && c > 0; it++) {
            let got = 0; groups.forEach(g => { got += Math.min(1, c * g.w) * g.shots.length; });
            c *= o.n / Math.max(1, got);
        }
        const out = [];
        // В затишье (пульс < 0,05) не снимает никто — даже хвост серии, начатой раньше:
        // иначе очереди замазывали провалы, и «на миг никто» не было ни разу (проба).
        groups.forEach(g => { if (R() < c * g.w) g.shots.forEach(t => { if (t < end + 150 && gate(t) >= 0.05) out.push({ t, g }); }); });
        out.sort((a, b) => a.t - b.t);
        const allow = o.sizes || 'SML';
        let lastL = -1e9, nL = 0;
        out.forEach(({ t, g }) => {
            let size = g.size;
            if (size === 'L' && (!allow.includes('L') || (t - t0) / o.T < (o.lFrom || 0) || nL >= (o.lMax || 0) || t - lastL < 340)) size = 'M';
            if (size === 'M' && !allow.includes('M')) size = 'S';
            if (size === 'L') { lastL = t; nL++; }
            const j = g.p.cam === -1 ? 34 : 6;            // повтор места не бьёт в один пиксель
            const bk = (o.blindK && o.blindK[size]) || 1;
            this.st.fl.push({ x: g.p.x + (R() * 2 - 1) * j, y: g.p.y + (R() * 2 - 1) * j, size, t0: t, spin: R() * Math.PI, bk });
        });
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
        const d = t - f.t0, B = this.BLIND[f.size], A = B.rise;
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
        return this.st.fl.some(f => t - f.t0 < Math.max(this.LIFE[f.size], this.BLIND[f.size].rise + this.BLIND[f.size].hold + this.BLIND[f.size].fall));
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
        const add = (o) => { if (!calm) this.crowd(t, o); };
        switch (mode) {
            case 'cover': case 'close':
                // Волна: сначала редко, потом шквал; большие — во второй половине.
                // Печать с 62 % хода (сначала экран забивают вспышки — они главное, белое только скрепляет; игрок) доводит экран до сплошного белого.
                // Мелкие и средние на входе почти не белят экран (blindK): иначе их сотня
                // складывается в серую пелену раньше, чем видно сами вспышки (проба кадрами).
                add({ n: 240, T: this.T.cover, env: 'rise', sizes: 'SML', react: 160, lFrom: 0.4, lMax: 7, blindK: { S: 0.12, M: 0.25 } });
                this.st.seal = { t0: t + this.T.cover * 0.62, dur: this.T.cover * 0.38, from: this.sealAt(t), to: 1 };
                break;
            case 'reveal': case 'clear':
                // Вспышки редеют (часто → редко), больших нет; белое отпускает плавно.
                add({ n: 65, T: 1050, env: 'fall', sizes: 'SM', react: 140, gust: 0.12, blindK: { S: 0.15, M: 0.2 } });
                this.sealTo(0, 900, true);
                break;
            case 'burst':
                if (n >= 2) add({ n: 50, T: 650, env: 'flat', sizes: 'SM', react: 60, blindK: { S: 0.55, M: 0.6 } });
                else add({ n: 30, T: 500, env: 'flat', sizes: 'S', react: 60, blindK: { S: 0.9 } });
                if (calm) this.st.fl.push({ x: -999, y: -999, size: n >= 2 ? 'M' : 'S', t0: t, spin: 0 });
                break;
            case 'finish':
                add({ n: 200, T: this.T.finish, env: 'rise', sizes: 'SML', react: 100, lFrom: 0.3, lMax: 6, blindK: { S: 0.12, M: 0.25 } });
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
