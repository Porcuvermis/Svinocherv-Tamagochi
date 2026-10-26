// ================= АППАРАТ АЛЧНОСТИ: ТАБЛИЧКА ВЫПЛАТ =================
// Продолжение GreedJunk. На сосновой доске под табло — таблица выигрышей
// без слов: «три символа → награда». Нанесена чёрной краской из баллончика
// по трафарету (решение игрока): у фигур перемычки трафарета, вокруг —
// напыл (мягкий ореол и мелкие брызги), из-под некоторых краска потекла.
// Значения — из конфига (ECONOMY.minigames.greed): поменяется баланс —
// поменяется и табличка. Цифры — свои, сегментами трафарета, а не
// шрифтом: шрифт внутри картинки на iPhone может подмениться.
Object.assign(GreedJunk, {
    // Строки таблицы из конфига: тройки по убыванию выплаты, затем пара.
    // give — что вместо монет при жетонном исходе (alt).
    payRows() {
        const G = (typeof ECONOMY !== 'undefined' && ECONOMY.minigames && ECONOMY.minigames.greed) || null;
        if (!G) return [];
        const rows = G.reel.filter(s => s.pay > 0).sort((a, b) => b.pay - a.pay)
            .map(s => ({ key: s.key, n: 3, pay: s.pay, alt: s.alt ? s.alt.altKey : null }));
        if (G.pair) rows.push({ key: G.pair.key, n: 2, pay: G.pair.pay, alt: null });
        return rows;
    },

    // ---------- ЦИФРЫ ТРАФАРЕТА ----------
    // Семь сегментов с промежутками — они же перемычки трафарета.
    SEG: { a: [[0.5, 0], [3.5, 0]], b: [[4, 0.5], [4, 3]], c: [[4, 4], [4, 6.5]], d: [[0.5, 7], [3.5, 7]],
        e: [[0, 4], [0, 6.5]], f: [[0, 0.5], [0, 3]], g: [[0.6, 3.5], [3.4, 3.5]] },
    DIGIT: ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'],
    // число n с левым верхним углом (x, y), высота цифры 7; возвращает
    // { d: путь сегментов, w: ширина }
    stencilNumber(n, x, y) {
        const f = this.f;
        let d = '', cx = x;
        String(n).split('').forEach(ch => {
            this.DIGIT[+ch].split('').forEach(sg => {
                const [[x1, y1], [x2, y2]] = this.SEG[sg];
                d += `M${f(cx + x1)} ${f(y + y1)} L${f(cx + x2)} ${f(y + y2)} `;
            });
            cx += 6;
        });
        return { d, w: cx - x - 2 };
    },

    // ---------- ТАБЛИЧКА ----------
    // Перемычки трафарета вырезаются маской (cut): у символов — две тонкие
    // косые, у монеты — кольцо. Подтёки — от нижних краёв нарисованного.
    payPlate(p) {
        const f = this.f, R = PALETTE.greedJunk.reel, ink = R.spray;
        const rows = this.payRows();
        if (!rows.length) return '';
        const rnd = this.rng(4711);
        const SC = 0.33, SW = 17.5, rh = 13;           // масштаб символа, шаг символов, шаг строк
        const sil = `<style>.gj-sil *{fill:${ink}!important;stroke:${ink}!important}.gj-sil [fill="none"]{fill:none!important}` +
            `.gj-sil *:not([stroke]){stroke:none!important}.gj-sil .tone,.gj-sil .mono-only{display:none}</style>`;
        let paint = '', cut = '';
        const drips = [];
        // Каждый трафарет подставлен рукой: свой сдвиг и наклон. Символ, стрелка
        // и число — разные трафареты, поэтому и сбиты друг от друга отдельно.
        const J = (v) => (rnd() - 0.5) * 2 * v;
        const tilt = (a, cx, cy, svg) => `<g transform="rotate(${f(a)} ${f(cx)} ${f(cy)})">${svg}</g>`;
        const sym = (key, cx0, cy0) => {
            const cx = cx0 + J(1.2), cy = cy0 + J(1.3), a = J(7);
            const art = this.REEL_ART[key] || key, F = this.REEL_FIT[art] || { rot: 0, k: 1, m: [0, 0] };
            const fn = { worm: 'reelWorm', beer: 'reelCan', syringe: 'reelSyringe', fish: 'reelFish', shard: 'reelShard', token: 'reelToken' }[art];
            if (!fn) return;
            paint += tilt(a, cx, cy, `<g class="gj-sil" transform="translate(${f(cx)} ${f(cy)}) scale(${f(F.k * SC)}) translate(${f(-F.m[0])} ${f(-F.m[1])}) rotate(${F.rot})">${this[fn](0, 0)}</g>`);
            // перемычки: две тонкие косые через символ, в наклоне его трафарета
            let c = '';
            [-3, 3].forEach(dx => { c += `<path d="M${f(cx + dx - 1.2)} ${f(cy - 5)} L${f(cx + dx + 1.2)} ${f(cy + 5)}" stroke="#000" stroke-width="0.55"/>`; });
            cut += tilt(a, cx, cy, c);
            if (rnd() < 0.3) drips.push([cx - 4 + rnd() * 8, cy + 3.2]);
        };
        const arrow = (x0, y0) => { const x = x0 + J(0.8), y = y0 + J(1.2); paint += tilt(J(9), x + 2.7, y, `<path d="M${f(x)} ${f(y)} L${f(x + 5)} ${f(y)} M${f(x + 3)} ${f(y - 2)} L${f(x + 5.4)} ${f(y)} L${f(x + 3)} ${f(y + 2)}" fill="none" stroke="${ink}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`); };
        const col = [p.x + 6, p.x + p.w / 2 + 4], top = p.y + 9;
        rows.forEach((r, i) => {
            // строка сбита целиком: не по сетке. Правая колонка снизу вверх:
            // короткая строка пары встаёт сверху, до сучка, длинная — в самый низ, под ним.
            const c = i < 3 ? 0 : 1, row = i < 3 ? i : (i === rows.length - 1 ? 0 : 2), x = col[c] + rnd() * 3, cy = top + row * rh + J(1.6);
            for (let k = 0; k < r.n; k++) sym(r.key, x + 9 + k * SW, cy);
            // стрелка — сразу за последним символом строки: у пары она стояла
            // на месте третьего, и шприцы с числом разъезжались в разные стороны
            const ax = x + 9 + r.n * SW - 7;
            arrow(ax, cy);
            const nx = ax + 8 + J(1), ny = cy - 3.5 + J(1.4);
            const num = this.stencilNumber(r.pay, nx, ny);
            paint += tilt(J(6), nx + num.w / 2, ny + 3.5, `<path d="${num.d}" fill="none" stroke="${ink}" stroke-width="1.5" stroke-linecap="round"/>`);
            // под цифрой подтёк короткий: длинный сливался с цифрой ряда ниже
            if (rnd() < 0.6) drips.push([nx + rnd() * num.w, ny + 7.5, 0.4]);
            // значка монеты нет: число после стрелки и так читается выплатой
            const rx = ax + 8 + num.w - 2;
            if (r.alt) {
                paint += `<path d="M${f(rx + 5)} ${f(cy + 3.5)} L${f(rx + 8)} ${f(cy - 3.5)}" stroke="${ink}" stroke-width="1.2" stroke-linecap="round"/>`;
                sym(r.alt, rx + 15, cy);
            }
        });
        // подтёки: струйка вниз с каплей
        drips.forEach(([x, y, s = 1]) => {
            // сужается книзу, капля на конце; короткие и разные
            const L = (1 + rnd() * 3.2) * s, w = 0.6 + rnd() * 0.3, cw = w * 0.35;
            paint += `<path d="M${f(x - w)} ${f(y - 1.2)} Q${f(x - cw)} ${f(y + L * 0.4)} ${f(x - cw)} ${f(y + L)} A${f(cw * 1.6)} ${f(cw * 1.6)} 0 1 0 ${f(x + cw)} ${f(y + L)} Q${f(x + cw)} ${f(y + L * 0.4)} ${f(x + w)} ${f(y - 1.2)} Z" fill="${ink}"/>`;
        });
        // брызги напыла
        let specks = '';
        for (let i = 0; i < 90; i++) {
            const x = p.x + 4 + rnd() * (p.w - 8), y = p.y + 3 + rnd() * (p.h - 6);
            specks += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.12 + rnd() * 0.25)}" fill="${ink}" opacity="${f(0.25 + rnd() * 0.45)}"/>`;
        }
        const id = 'gj-spray';
        return sil +
            `<mask id="${id}-m" maskUnits="userSpaceOnUse" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}">` +
            `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="#fff"/>${cut}</mask>` +
            `<filter id="${id}" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="1.6"/></filter>` +
            // напыл — та же краска, широко размытая и слабая; поверх — чёткая
            // Класс nh: краска плоская и в карту высот не попадает. Иначе она
            // ложилась туда на своей высоте, а не на высоте доски, — шейдер
            // видел ступеньку и отбрасывал от рисунка тень.
            `<g class="nh"><g mask="url(#${id}-m)"><g filter="url(#${id})" opacity="0.14">${paint}</g>` +
            `<g opacity="0.9">${paint}</g></g>${specks}</g>`;
    }
});
