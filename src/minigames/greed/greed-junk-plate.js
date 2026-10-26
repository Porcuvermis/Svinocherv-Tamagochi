// ================= АППАРАТ АЛЧНОСТИ: ТАБЛИЧКА ВЫПЛАТ =================
// Продолжение GreedJunk. К верхним гвоздям чистой сосновой доски под табло
// прибита светлая рваная тряпка, на ней маркером от руки — комбинации от
// высшей к низшей, без выплат (решение игрока). Трафарет и баллончик были
// раньше: в размере таблички значки не читались. Список комбинаций — из
// конфига (ECONOMY.minigames.greed): поменяется баланс — поменяется порядок.
Object.assign(GreedJunk, {
    // Строки таблицы из конфига: тройки по убыванию ценности, затем пара.
    // Жетонная тройка (give) встаёт по цене награды в монетах (tokenValue).
    payRows() {
        const G = (typeof ECONOMY !== 'undefined' && ECONOMY.minigames && ECONOMY.minigames.greed) || null;
        if (!G) return [];
        const V = G.tokenValue || {};
        const worth = s => s.give ? Object.keys(s.give).reduce((v, k) => v + (V[k] || 0) * s.give[k], 0) : (s.pay || 0);
        const rows = G.reel.filter(s => s.pay > 0 || s.give).sort((a, b) => worth(b) - worth(a))
            .map(s => ({ key: s.key, n: 3, pay: s.pay || 0, give: !!s.give }));
        if (G.pair) rows.push({ key: G.pair.key, n: 2, pay: G.pair.pay, alt: null });
        return rows;
    },

    // ---------- ТРЯПКА ----------
    // Висит на двух верхних гвоздях доски и провисает между ними; складки
    // расходятся от гвоздей (ткань тянется к точкам крепления). Рельеф
    // складок — только в карте высот (hpass): свет даёт шейдер. Дыры —
    // вырезы в контуре (evenodd), сквозь них видна доска.
    RAG_SEED: 913,
    ragShape(p) {
        const f = this.f, rnd = this.rng(this.RAG_SEED);
        const A = [p.x + 6, p.y + 6], B = [p.x + p.w - 6, p.y + 6];
        const bot = p.y + p.h - 1.5;               // низ — над щелью выдачи монет: её не закрывать
        // верх: уголки торчат над гвоздями, между гвоздями провис
        const top = `M${f(A[0] - 4)} ${f(A[1] - 3.5)} L${f(A[0] + 3)} ${f(A[1] - 2.6)} ` +
            `Q${f((A[0] + B[0]) / 2)} ${f(A[1] + 9)} ${f(B[0] - 3)} ${f(B[1] - 2.6)} L${f(B[0] + 4)} ${f(B[1] - 3.2)}`;
        // бока: ткань чуть стягивается внутрь книзу
        const right = ` Q${f(B[0] + 5)} ${f(p.y + p.h * 0.5)} ${f(B[0] + 1)} ${f(bot - 1)}`;
        // низ рваный: зубцы разной глубины, пара длинных лоскутов
        const pts = [];
        const n = 34;
        for (let i = 1; i < n; i++) {
            const x = B[0] + 1 - (B[0] - A[0] + 2) * i / n + (rnd() - 0.5) * 3;
            let y = bot - 1.5 + (rnd() - 0.5) * 3.2;
            if (rnd() < 0.12) y += 3 + rnd() * 3;      // лоскут
            if (rnd() < 0.15) y -= 2 + rnd() * 2;      // вырван клок
            pts.push([x, y]);
        }
        const lower = pts.map(([x, y]) => ` L${f(x)} ${f(y)}`).join('') + ` L${f(A[0] - 1)} ${f(bot - 0.5)}`;
        const left = ` Q${f(A[0] - 5)} ${f(p.y + p.h * 0.5)} ${f(A[0] - 4)} ${f(A[1] - 3.5)} Z`;
        // дыры: неровные многоугольники
        const holes = [[p.x + p.w * 0.36, p.y + p.h * 0.78, 2.2], [p.x + p.w * 0.83, p.y + p.h * 0.42, 1.5]].map(([cx, cy, r]) => {
            let d = '';
            for (let k = 0; k < 7; k++) {
                const a = k / 7 * Math.PI * 2, rr = r * (0.6 + rnd() * 0.7);
                d += (k ? ' L' : 'M') + f(cx + Math.cos(a) * rr * 1.3) + ' ' + f(cy + Math.sin(a) * rr);
            }
            return d + ' Z';
        });
        return { d: top + right + lower + left + ' ' + holes.join(' '), A, B, bot, pts, holes, rnd };
    },

    payPlate(p) {
        const f = this.f, R = PALETTE.greedJunk.reel.rag, J = PALETTE.greedJunk;
        const S = this.ragShape(p), rnd = S.rnd, id = 'gj-rag';
        let out = `<clipPath id="${id}-c"><path d="${S.d}" clip-rule="evenodd"/></clipPath>` +
            `<filter id="${id}-b" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="1.4"/></filter>` +
            `<filter id="${id}-s" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="0.6"/></filter>`;
        // тень тряпки на доске — отдельной деталью ниже (у ткани зазор с доской)
        let cloth = `<path d="${S.d}" fill-rule="evenodd" fill="${R.base}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}" stroke-linejoin="round"/>`;
        let inner = '';
        // складки: от гвоздей веером вниз и провис под верхом
        const folds = [];
        [[S.A, 1], [S.B, -1]].forEach(([P, s]) => {
            [0.22, 0.4, 0.62].forEach((t, k) => {
                const ex = P[0] + s * (p.w * t * 0.55 + rnd() * 8), ey = S.bot - 2 - rnd() * 6;
                const mx = (P[0] + ex) / 2 + s * 3, my = (P[1] + ey) / 2 - 2;
                folds.push([`M${f(P[0] + s * 1.5)} ${f(P[1] + 1)} Q${f(mx)} ${f(my)} ${f(ex)} ${f(ey)}`, 1.6 - k * 0.3]);
            });
        });
        const cx = p.x + p.w / 2;
        folds.push([`M${f(S.A[0] + 14)} ${f(S.A[1] + 5)} Q${f(cx)} ${f(S.A[1] + 14)} ${f(S.B[0] - 14)} ${f(S.B[1] + 5)}`, 1.4]);
        folds.push([`M${f(S.A[0] + 34)} ${f(S.A[1] + 13)} Q${f(cx)} ${f(S.A[1] + 21)} ${f(S.B[0] - 34)} ${f(S.B[1] + 13)}`, 1.0]);
        // в цвете — лёгкие тени вдоль складок (свет шейдера их усилит)
        inner += `<g filter="url(#${id}-b)" opacity="0.35">` +
            folds.map(([d, w]) => `<path d="${d}" fill="none" stroke="${R.lo}" stroke-width="${f(w * 1.6)}" transform="translate(0.8 0.8)"/>`).join('') + '</g>';
        inner += `<g filter="url(#${id}-s)" opacity="0.45">` +
            folds.map(([d, w]) => `<path d="${d}" fill="none" stroke="${R.hi}" stroke-width="${f(w)}"/>`).join('') + '</g>';
        // рельеф складок: валики в карте высот
        inner += `<g class="hpass" filter="url(#${id}-b)">` +
            folds.map(([d, w]) => `<path d="${d}" fill="none" stroke="#000" stroke-width="${f(w * 2.2)}" style="--dh:${this.dh(0.7 * w)}"/>`).join('') + '</g>';
        // грязь: размытые пятна, засаленный низ, потёки ржавчины от гвоздей
        let dirt = '';
        // пятно — горстка мелких клякс, а не один овал: овалы читались серыми кругами
        for (let i = 0; i < 4; i++) {
            const x = p.x + 18 + rnd() * (p.w - 36), y = p.y + 12 + rnd() * (p.h - 18);
            for (let k = 0; k < 5; k++) {
                dirt += `<ellipse cx="${f(x + (rnd() - 0.5) * 9)}" cy="${f(y + (rnd() - 0.5) * 5)}" rx="${f(1 + rnd() * 2.6)}" ry="${f(0.8 + rnd() * 1.8)}" fill="${R.dirt}" opacity="${f(0.13 + rnd() * 0.12)}"/>`;
            }
        }
        dirt += `<path d="M${p.x} ${f(S.bot - 7)} L${p.x + p.w} ${f(S.bot - 7)} L${p.x + p.w} ${f(S.bot + 8)} L${p.x} ${f(S.bot + 8)} Z" fill="${R.grime}" opacity="0.16"/>`;
        [S.A, S.B].forEach(([x, y]) => {
            dirt += `<path d="M${f(x - 1.2)} ${f(y + 1)} Q${f(x - 0.6)} ${f(y + 6)} ${f(x + 0.2)} ${f(y + 9 + rnd() * 3)} Q${f(x + 1.2)} ${f(y + 5)} ${f(x + 1.4)} ${f(y + 1)} Z" fill="${J.rust[500]}" opacity="0.35"/>`;
        });
        inner += `<g filter="url(#${id}-s)">${dirt}</g>`;
        // бахрома: нитки из рваного низа
        let fringe = '';
        S.pts.forEach(([x, y]) => {
            if (rnd() < 0.45) {
                const L = 1.2 + rnd() * 2.8, dx = (rnd() - 0.5) * 1.6;
                fringe += `M${f(x)} ${f(y - 0.3)} q${f(dx * 0.3)} ${f(L * 0.6)} ${f(dx)} ${f(L)} `;
            }
        });
        cloth += `<g clip-path="url(#${id}-c)">${inner}</g>` +
            `<path d="${fringe}" fill="none" stroke="${R.lo}" stroke-width="0.45" stroke-linecap="round"/>`;
        // гвозди поверх ткани, ткань вокруг собрана морщинками
        [S.A, S.B].forEach(([x, y]) => {
            let w = '';
            for (let k = 0; k < 5; k++) {
                const a = Math.PI * (0.15 + k * 0.17) + (rnd() - 0.5) * 0.2;
                w += `M${f(x + Math.cos(a) * 2.2)} ${f(y + Math.sin(a) * 2.2)} l${f(Math.cos(a) * (2 + rnd() * 2.5))} ${f(Math.sin(a) * (2 + rnd() * 2.5))} `;
            }
            cloth += `<path d="${w}" fill="none" stroke="${R.lo}" stroke-width="0.5" stroke-linecap="round" opacity="0.8"/>` + this.nail(x, y);
        });
        // тень ткани на доску: тот же контур, сдвинут и размыт
        const shadow = `<path d="${S.d}" fill-rule="evenodd" fill="${PALETTE.ink}" opacity="0.28" filter="url(#${id}-b)" transform="translate(0.6 1.4)" class="fx"/>`;
        return out + shadow + this.T(7.5, 'cloth', cloth);
    }
});
