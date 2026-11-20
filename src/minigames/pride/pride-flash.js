// ================= ТЩЕСЛАВИЕ: ВСПЫШКИ ФОТОАППАРАТОВ (переход окна) =================
// docs/plan/32-pride-cameras.md, задачи 4–5. Здесь — вид одной вспышки и белизна
// экрана; расписание волны и ходы покрова — следующие подзадачи.
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
        S: { r: 46, star: 0, rays: 0, core: 6 },
        M: { r: 96, star: 1.25, rays: 4, core: 10 },
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
