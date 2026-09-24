// ================= ВАННАЯ: ХРОМИРОВАННАЯ ЭТАЖЕРКА =================
// Запечённая полка читалась непонятным белым уступом с треугольниками —
// ни стекло, ни пластик, ни металл. Из трёх силуэтов выбрана этажерка:
// две стойки и две корзинки из прутьев. Она узнаётся с первого взгляда и
// сделана из того же хрома, что и душевая стойка, — одним станком
// (BATH_SHOWER: профиль хрома градиентами), поэтому комплект один.
//
// Этажерка рисуется ДВУМЯ слоями, между которыми лежат мыло и мочалка:
//   back()  — тень на кафеле, крепления к стене, задняя стенка корзин и их
//             дно, видное снизу;
//   front() — передние прутья и перекладины, стойки с шарами.
// Так вещь стоит В корзине: низ мыла закрыт передней сеткой. Раньше эту
// роль играл отдельный «бортик поверх» (shelfRail).
//
// Перспектива та же, что у комнаты: горизонт на уровне борта (y≈760),
// точка схода по x≈360. Обе корзины ВЫШЕ глаза, поэтому у них видно ДНО —
// задний край ниже переднего и сдвинут к точке схода. У верхней корзины
// дна видно больше, чем у нижней: она дальше от горизонта.
//
// Мыло и мочалка стоят на своих местах (гнёзда soap и cloth): дно корзин
// подогнано под них, а не наоборот.

const BATH_SHELF = {
    POSTS: [503, 650],       // передние углы корзин
    FLOORS: [373, 530],      // передний край дна: под мылом и под мочалкой
    WALL_H: 17,              // высота передней сетки корзины
    TOP: 290, BOTTOM: 552,   // концы стоек
    VP: { x: 360, y: 760 },  // точка схода комнаты
    DEPTH: 0.035,            // доля пути до точки схода: где стена за корзиной
    WIRE: 13,                // шаг прутьев

    // Точка у стены за точкой p: по лучу к точке схода.
    back(p) {
        return { x: p.x + (this.VP.x - p.x) * this.DEPTH, y: p.y + (this.VP.y - p.y) * this.DEPTH };
    },
    kit() {
        const K = Object.create(BATH_SHOWER);
        K.defs = []; K.gid = 0; K.prefix = 'bsh-g';
        return K;
    },

    // Тонкий пруток — не градиентом (у него нет ширины для профиля), а
    // тремя штрихами: контур, тело, блик со стороны света.
    wires(d, lit, w) {
        const C = btPal().chrome, ink = PALETTE.ink, k = w || 1;
        return `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${1.7 * k + 1.9}" stroke-linecap="round"/>
            <path d="${d}" fill="none" stroke="${lit ? C[500] : C[700]}" stroke-width="${1.9 * k}" stroke-linecap="round"/>
            <path d="${d}" fill="none" stroke="${lit ? C[100] : C[300]}" stroke-width="0.7" stroke-linecap="round" transform="translate(-0.45 -0.3)"/>`;
    },

    backLayer() {
        const K = this.kit(), C = btPal().chrome, T = btPal().tile, ink = PALETTE.ink;
        const f = (v) => v.toFixed(2), P = (x, y) => `${f(x)} ${f(y)}`;
        const [L, R] = this.POSTS, H = this.WALL_H;
        let out = '';

        // Тень этажерки на кафеле: свет сверху-слева, тень вправо-вниз,
        // мягкая — широким штрихом малой плотности, без фильтра.
        let sh = `M${P(L + 7, this.TOP + 8)}L${P(L + 7, this.BOTTOM + 8)}M${P(R + 7, this.TOP + 8)}L${P(R + 7, this.BOTTOM + 8)}`;
        for (const Y of this.FLOORS) sh += `M${P(L + 7, Y + 8)}L${P(R + 7, Y + 8)}M${P(L + 7, Y - H + 8)}L${P(R + 7, Y - H + 8)}`;
        out += `<path d="${sh}" fill="none" stroke="${T.shade}" stroke-width="9" stroke-opacity="0.12" stroke-linecap="round"/>
                <path d="${sh}" fill="none" stroke="${T.shade}" stroke-width="4" stroke-opacity="0.12" stroke-linecap="round"/>`;

        // Стойки стоят У СТЕНЫ (корзины выдаются вперёд), и крепятся к ней
        // ушками с шурупами наружу — видно, на чём держится вся этажерка.
        const mounts = [], posts = [], caps = [];
        for (const [i, x0] of this.POSTS.entries()) {
            const top = this.back({ x: x0, y: this.TOP }), bot = this.back({ x: x0, y: this.BOTTOM });
            const side = i ? 1 : -1;
            for (const q of [{ x: top.x, y: top.y + 16 }, { x: bot.x, y: bot.y - 16 }]) {
                mounts.push(K.collar({ x: q.x, y: q.y }, { x: q.x + side * 13, y: q.y }, 4.4, 4.2));
                mounts.push(K.disc({ x: q.x + side * 9.5, y: q.y }, 2.6));
            }
            posts.push(K.collar(bot, top, 4, 2));
            caps.push(K.disc({ x: top.x, y: top.y - 3 }, 6.2), K.disc({ x: bot.x, y: bot.y + 3 }, 6.2));
        }
        // Корзины: задняя стенка (у стены), боковые перекладины и дно,
        // видное снизу.
        // Задняя стенка и дно — теневая сторона корзины: тонкие тёмные
        // прутья, а не блестящие перекладины. Иначе задняя перекладина под
        // дном спорила с передней и читалась второй полкой.
        let backRails = '', backWires = '', floorWires = '';
        for (const Y of this.FLOORS) {
            const bl = this.back({ x: L, y: Y }), br = this.back({ x: R, y: Y });
            const tl = this.back({ x: L, y: Y - H }), tr = this.back({ x: R, y: Y - H });
            backRails += `M${P(tl.x, tl.y)}L${P(tr.x, tr.y)}M${P(bl.x, bl.y)}L${P(br.x, br.y)}`;
            // боковые перекладины — от переднего угла к стене
            backRails += `M${P(L, Y - H)}L${P(tl.x, tl.y)}M${P(R, Y - H)}L${P(tr.x, tr.y)}`
                       + `M${P(L, Y)}L${P(bl.x, bl.y)}M${P(R, Y)}L${P(br.x, br.y)}`;
            const n = Math.round((R - L) / this.WIRE);
            for (let i = 1; i < n; i++) {
                const x = L + (R - L) * i / n;
                const b0 = this.back({ x, y: Y - H }), b1 = this.back({ x, y: Y });
                backWires += `M${P(b0.x, b0.y)}L${P(b1.x, b1.y)}`;
                // Дно: прутья от переднего края к заднему.
                floorWires += `M${P(x, Y)}L${P(b1.x, b1.y)}`;
            }
            // Поперечный пруток дна посередине глубины.
            const m0 = { x: L + (bl.x - L) / 2, y: Y + (bl.y - Y) / 2 }, m1 = { x: R + (br.x - R) / 2, y: Y + (br.y - Y) / 2 };
            floorWires += `M${P(m0.x, m0.y)}L${P(m1.x, m1.y)}`;
        }
        const inner = mixColor(ink, C[900], 0.35);
        const seam = (p) => `<path d="${p.sil}" fill="none" stroke="${inner}" stroke-width="${STROKE.hairline}" stroke-linejoin="round"/>`;
        const halo = mounts.concat(posts, caps).map(p => p.sil).join('');
        // Шлиц на шурупах.
        let slots = '';
        for (const [i, x0] of this.POSTS.entries()) {
            const side = i ? 1 : -1;
            for (const q of [this.back({ x: x0, y: this.TOP }), this.back({ x: x0, y: this.BOTTOM })]) {
                const y = q.y + (q.y < 400 ? 16 : -16), x = q.x + side * 9.5;
                slots += `M${P(x - 1.7, y + 0.9)}L${P(x + 1.7, y - 0.9)}`;
            }
        }
        const body = `
            <path d="${halo}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            ${mounts.map(p => p.fill + seam(p)).join('')}
            <path d="${slots}" stroke="${C[900]}" stroke-width="0.9" stroke-linecap="round"/>
            ${posts.map(p => p.fill + seam(p)).join('')}
            ${caps.map(p => p.fill + seam(p)).join('')}
            ${this.wires(backWires, false)}
            ${this.wires(floorWires, false)}
            ${this.wires(backRails, false, 1.3)}`;
        return `<g class="bt-shelf-back"><defs>${K.defs.join('')}</defs>${out}${body}</g>`;
    },

    frontLayer() {
        const K = this.kit(), C = btPal().chrome, T = btPal().tile, ink = PALETTE.ink;
        K.prefix = 'bsf-g';
        const f = (v) => v.toFixed(2), P = (x, y) => `${f(x)} ${f(y)}`;
        const [L, R] = this.POSTS, H = this.WALL_H;
        const inner = mixColor(ink, C[900], 0.35);

        // Передняя сетка: прутья между верхней и нижней перекладиной.
        let wires = '';
        for (const Y of this.FLOORS) {
            const n = Math.round((R - L) / this.WIRE);
            for (let i = 1; i < n; i++) {
                const x = L + (R - L) * i / n;
                wires += `M${P(x, Y - H + 1)}L${P(x, Y - 1)}`;
            }
        }
        const rails = [];
        for (const Y of this.FLOORS) {
            rails.push(K.collar({ x: L, y: Y - H }, { x: R, y: Y - H }, 2.7, 1));
            rails.push(K.collar({ x: L, y: Y }, { x: R, y: Y }, 2.7, 1));
        }
        // Углы корзин: толстый пруток на переднем углу, от верхней
        // перекладины к нижней, и узел сварки на каждом конце.
        const posts = [], joints = [];
        for (const x of this.POSTS) for (const Y of this.FLOORS) {
            posts.push(K.collar({ x, y: Y + 1 }, { x, y: Y - H - 1 }, 2.6, 1.2));
            for (const y of [Y - H, Y]) joints.push(K.disc({ x, y }, 3.9));
        }
        // Налёт: у сварки нижней корзины — известь и рыжие точки. Ванная
        // не новая, а этажерка стоит под брызгами.
        const rnd = btRng(71);
        let rust = '', lime = '';
        const n = Math.round((R - L) / this.WIRE);
        for (let i = 1; i < n; i++) {
            const x = L + (R - L) * i / n, Y = this.FLOORS[1];
            if (rnd() < 0.35) rust += `M${P(x - 1.3, Y - 2.4)}a1.3 1 0 1 0 2.6 0a1.3 1 0 1 0 -2.6 0Z`;
            if (rnd() < 0.3) lime += `M${P(x - 1.8, Y + 1.6)}a1.8 0.9 0 1 0 3.6 0a1.8 0.9 0 1 0 -3.6 0Z`;
        }

        const all = rails.concat(posts, joints);
        const halo = all.map(p => p.sil).join('');
        const seam = (p) => `<path d="${p.sil}" fill="none" stroke="${inner}" stroke-width="${STROKE.hairline}" stroke-linejoin="round"/>`;
        return `<g class="bt-shelf-front">
            <defs>${K.defs.join('')}</defs>
            <path d="${halo}" fill="none" stroke="${ink}" stroke-width="${2 * STROKE.contour}" stroke-linejoin="round"/>
            ${this.wires(wires, true)}
            ${rails.map(p => p.fill + seam(p)).join('')}
            ${posts.map(p => p.fill + seam(p)).join('')}
            ${joints.map(p => p.fill + seam(p)).join('')}
            <path d="${rust}" fill="${T.stain}" fill-opacity="0.75"/>
            <path d="${lime}" fill="${T.scale}" fill-opacity="0.85"/>
        </g>`;
    }
};
