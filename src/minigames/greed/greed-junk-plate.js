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
        if (G.pair) rows.push({ key: G.pair.key, n: 2, pay: G.pair.pay });
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
        // дыра — у самого края, где значков нет
        const holes = [[p.x + 7, p.y + p.h * 0.6, 1.6]].map(([cx, cy, r]) => {
            let d = '';
            for (let k = 0; k < 7; k++) {
                const a = k / 7 * Math.PI * 2, rr = r * (0.6 + rnd() * 0.7);
                d += (k ? ' L' : 'M') + f(cx + Math.cos(a) * rr * 1.3) + ' ' + f(cy + Math.sin(a) * rr);
            }
            return d + ' Z';
        });
        return { d: top + right + lower + left + ' ' + holes.join(' '), A, B, bot, pts, holes, rnd };
    },

    // ---------- МАРКЕР ОТ РУКИ ----------
    // Каждый значок рисуется заново своей «рукой» (своим зерном): точки
    // штрихов дрожат, концы недотянуты или с перелётом, пропорции и наклон
    // плавают, у рыбы разное число рёбер, червь изогнут по-своему. Одинаковых
    // значков на тряпке нет (решение игрока: «прям человеческой рукой»).
    // Штрих — сглаженная кривая через дрожащие точки (Катмулл-Ром → Безье).
    handPath(pts, rnd, closed, j = 0.35) {
        const f = this.f;
        let P = pts.map(([x, y]) => [x + (rnd() - 0.5) * 2 * j, y + (rnd() - 0.5) * 2 * j]);
        if (closed) {
            // замыкание внахлёст: рука проводит чуть дальше начала
            P = P.concat([[P[0][0] + (rnd() - 0.5) * 0.8, P[0][1] + (rnd() - 0.5) * 0.8]]);
            const a = P[1], b = P[0];
            P.push([b[0] + (a[0] - b[0]) * (0.2 + rnd() * 0.25), b[1] + (a[1] - b[1]) * (0.2 + rnd() * 0.25)]);
        } else if (P.length > 1) {
            // конец штриха: недотянут или с перелётом
            const n = P.length, a = P[n - 2], b = P[n - 1], k = (rnd() - 0.35) * 0.3;
            P[n - 1] = [b[0] + (b[0] - a[0]) * k, b[1] + (b[1] - a[1]) * k];
        }
        if (P.length === 2) return `M${f(P[0][0])} ${f(P[0][1])} L${f(P[1][0])} ${f(P[1][1])}`;
        let d = `M${f(P[0][0])} ${f(P[0][1])}`;
        for (let i = 0; i < P.length - 1; i++) {
            const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
            d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ` +
                `${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
        }
        return d;
    },
    // Овал от руки: точки по кругу с дрожью радиуса.
    handOval(cx, cy, rx, ry, rnd, n = 7) {
        const a0 = rnd() * Math.PI * 2, pts = [];
        for (let k = 0; k < n; k++) {
            const a = a0 + k / n * Math.PI * 2, w = 1 + (rnd() - 0.5) * 0.16;
            pts.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]);
        }
        return this.handPath(pts, rnd, true, 0.15);
    },
    // Значок в коробке ~22×8 с центром (0,0): список путей и точек-клякс.
    markerArt(art, rnd) {
        const r = (a, b) => a + rnd() * (b - a);
        const L = [], dots = [];
        const line = (pts, closed, j) => L.push(this.handPath(pts, rnd, closed, j));
        switch (art) {
        case 'worm': {
            // тело — две волны разной высоты, голова — овал с глазом
            const a = r(1.6, 2.8), ph = rnd() < 0.5 ? 1 : -1;
            line([[-10, ph * a * 0.4], [-6.5, -ph * a], [-2.5, ph * a * 0.6], [1.5, -ph * a * 0.8], [5, 0]], false, 0.25);
            line([[-10, ph * a * 0.4 + 2], [-6.5, -ph * a + 2], [-2.5, ph * a * 0.6 + 2], [1.5, -ph * a * 0.8 + 2], [5, 2.2]], false, 0.25);
            line([[-10, ph * a * 0.4], [-11.3, ph * a * 0.4 + 1], [-10, ph * a * 0.4 + 2]], false, 0.1);   // хвост
            L.push(this.handOval(7.6, 0.6, r(2.6, 3.2), r(2.4, 2.9), rnd));
            dots.push([8.4, -0.3, 0.6]);
            if (rnd() < 0.6) line([[9.4, 2.2], [8.2, 2.6]], false, 0.1);   // ухмылка
            break;
        }
        case 'syringe': {
            const h = r(1.9, 2.4), x0 = r(-7, -6), x1 = r(4, 5.2);   // ниже: соседи в столбике слипались
            line([[x0, -h], [x1, -h], [x1, h], [x0, h]], true, 0.25);
            line([[x0, 0], [x0 - 4, r(-0.3, 0.3)]], false, 0.15);
            line([[x0 - 4.2, -2], [x0 - 4, 2]], false, 0.15);
            line([[x0 + 0.4, -3.2], [x0 + 0.6, 3.2]], false, 0.15);
            line([[x1, 0], [x1 + r(5, 6.5), r(-0.4, 0.4)]], false, 0.1);
            const t = 2 + Math.floor(rnd() * 2);
            for (let k = 0; k < t; k++) { const x = x0 + 2.5 + k * r(2.2, 2.8); line([[x, -h], [x, -h + r(1.2, 1.8)]], false, 0.1); }
            break;
        }
        case 'beer': {
            // банка стоя: овал крышки, бока, донышко дугой, червячок на этикетке
            const w = r(3.2, 3.8), h = r(2.6, 3), tl = r(-0.5, 0.5);
            L.push(this.handOval(tl, -h, w, 0.8, rnd, 6));
            line([[-w + tl, -h], [-w, h - 0.6]], false, 0.15);
            line([[w + tl, -h], [w, h - 0.6]], false, 0.15);
            line([[-w, h - 0.8], [0, h + 0.5], [w, h - 0.8]], false, 0.15);
            line([[-2, 0.6], [-0.8, -0.6], [0.6, 0.8], [2, -0.4]], false, 0.15);
            break;
        }
        case 'fish': {
            const n = 3 + Math.floor(rnd() * 3), x0 = r(-6.5, -5.5), x1 = r(3.5, 4.5);
            line([[x0, 0], [x1, r(-0.4, 0.4)]], false, 0.2);
            for (let k = 0; k < n; k++) {
                const x = x0 + 1.6 + k * (x1 - x0 - 2.4) / n, hh = r(2, 2.8);
                line([[x - 0.6, -hh], [x + 0.8, 0], [x - 0.6, hh]], false, 0.15);
            }
            line([[x1, -2.5], [x1 + r(4, 5), -1], [x1 + r(5, 6), 0.4], [x1 + r(3.5, 4.5), 2.2], [x1, 2.5]], false, 0.2);
            line([[x1, -2.5], [x1 - 0.3, 2.5]], false, 0.1);
            dots.push([x1 + 2.6, -0.7, 0.55]);
            line([[x0, 0], [x0 - 3.8, -r(2, 2.7)], [x0 - 2.8, 0], [x0 - 3.8, r(2, 2.7)], [x0, 0]], false, 0.15);
            break;
        }
        case 'token': {
            const R = r(3.6, 4.2);
            L.push(this.handOval(0, 0, R, R * r(0.92, 1.02), rnd, 8));
            L.push(this.handOval(0, 0, R * 0.55, R * 0.55, rnd, 6));
            dots.push([r(-0.3, 0.3), r(-0.3, 0.3), 0.6]);
            break;
        }
        case 'shard': {
            const p = [[-5, 3], [r(-2.2, -1.2), -3.2], [r(0.2, 1), -0.8], [r(2.6, 3.4), -3.2], [5.2, 2.8]];
            line(p, true, 0.2);
            line([[p[1][0], p[1][1]], [0.2, 0.6], [1.2, 2.9]], false, 0.15);
            break;
        }
        case 'any': {
            // «что угодно» в паре: жирная загогулина-прочерк
            line([[-3, 0.5], [-1, -0.8], [1, 0.8], [3, -0.4]], false, 0.2);
            break;
        }
        }
        return { L, dots };
    },
    // Один значок от руки: свой масштаб, наклон и нажим.
    markerSym(art, cx, cy, k, seed) {
        const f = this.f, rnd = this.rng(seed), ink = PALETTE.greedJunk.reel.rag.marker;
        const A = this.markerArt(art, rnd);
        const s = k * (0.92 + rnd() * 0.16), a = (rnd() - 0.5) * 12, sk = (rnd() - 0.5) * 8;
        const w = (0.85 + rnd() * 0.3) / s;          // нажим маркера, в единицах значка
        const tr = `translate(${f(cx + (rnd() - 0.5) * 1.4)} ${f(cy + (rnd() - 0.5) * 1.2)}) rotate(${f(a)}) skewX(${f(sk)}) scale(${f(s)})`;
        const g = `<path d="${A.L.join(' ')}" fill="none" stroke="${ink}" stroke-width="${f(w * 100) / 100}" stroke-linecap="round" stroke-linejoin="round"/>` +
            A.dots.map(([x, y, rr]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rr)}" fill="${ink}"/>`).join('');
        return `<g transform="${tr}" opacity="${f(0.82 + rnd() * 0.14)}">${g}</g>`;
    },
    // Комбинации столбиками: три значка сверху вниз = тройка (как на
    // барабанах, только стопкой — места по высоте у тряпки мало, а по
    // ширине — на все семь). Порядок слева направо — от дорогой к дешёвой.
    payMarks(p, S) {
        const rows = this.payRows();
        if (!rows.length) return '';
        // Промежутка под лампой больше нет: доску укоротили под монетоприёмник,
        // и значки остались своего размера (решение игрока) — лампа качается,
        // заслонённое подсматривается наклоном.
        const x0 = S.A[0] + 3, x1 = S.B[0] - 3, cw = (x1 - x0) / rows.length;
        const ys = [S.bot - 26.5, S.bot - 18.5, S.bot - 10.5];   // выше рваного низа: он срезал нижний ряд
        let out = '', seed = 5101;
        rows.forEach((r, i) => {
            const cx = x0 + cw * (i + 0.5);
            const k = Math.min(1, (cw - 1) / 22);
            const art = this.REEL_ART[r.key] || r.key;
            ys.forEach((y, j) => {
                const a = j < r.n ? art : 'any';
                out += this.markerSym(a, cx + (rnd0() - 0.5) * 1.5, y, k, seed += 37);
            });
        });
        function rnd0() { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 8) / 16777216; }
        // чернила чуть впитались в ткань: под чёткими штрихами — размытая копия
        return `<g class="nh"><g filter="url(#gj-rag-s)" opacity="0.3">${out}</g>${out}</g>`;
    },

    // Тряпка одна, на своём участке — для отдельной картинки на свету.
    ragSvg(pass, crop) {
        this.pass = pass;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${crop.x} ${crop.y} ${crop.w} ${crop.h}">` +
            this.passStyle(pass) + this.defs() + this.payPlate(this.SLOTS.plate) + '</svg>';
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
        cloth += `<g clip-path="url(#${id}-c)">${inner}${this.payMarks(p, S)}</g>` +
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
