// ================= АППАРАТ АЛЧНОСТИ: КОЛЕСО ФОРТУНЫ =================
// Продолжение GreedJunk. Колесо — покупка (Backend.greedLevel('wheel')),
// садится на ступицу с тормозным диском в верхнем ящике (wheelMount) и
// стоит на переднем плане: крупное, прячет под собой левую половину ящика.
// Гаражное, как весь аппарат: круглая фанерная столешница, крашенная
// кистью в красный и кремовый (референс игрока), надета на колёсные
// шпильки ступицы и затянута пятью гайками. По ободу на границах секторов
// — гвозди; сверху свисает язычок из резиновой полосы, гвозди его
// отгибают.
//
// Секторов 16, равных: ширина сектора шанс не задаёт — шанс в конфиге
// (ECONOMY.minigames.greed.wheel, weight), как у настоящего колеса с
// виртуальными позициями. Значки — кистью, без слов: пусто, монета, три
// монеты, рёбрышко (кухня), картофелина (сад), осколок алчности.
Object.assign(GreedJunk, {
    WHEEL_SECTORS: ['blank', 'gold1', 'blank', 'seed', 'blank', 'gold1', 'meat', 'blank',
        'gold3', 'blank', 'gold1', 'seed', 'blank', 'shard', 'gold1', 'blank'],
    // pegUp — на сколько шляпка гвоздя выше краски: гвоздь вбит не по
    // шляпку, а торчит стержнем, об него бьёт язычок (на свету —
    // greed-junk-lit-wheel.js, wheelSprites). Было 1.4 — кнопка вровень с
    // краской, тени от неё не было вовсе.
    WHEEL: { rFace: 114, rEdge: 118, rPeg: 110.5, rIcon: 80, hole: 7.5, icon: 1.85, pegUp: 9 },
    // Диск и язычок нарисованы в своих единицах (WHEEL) и ставятся на аппарат
    // с масштабом: колесо выросло, а рисунок остался прежним.
    wheelK() { return this.SLOTS.wheel.r / this.WHEEL.rEdge; },
    // Язычок — на 3 часа, а не сверху: колесо видно наполовину, и выпавший
    // сектор должен стоять посередине видимой дуги, вплотную к пачинко.
    // Рисунок язычка — прежний, «сверху»; на место его ставит поворот.
    POINTER_ANGLE: Math.PI / 2,
    wheelPtrG(inner) {
        const S = this.SLOTS.wheel, a = this.POINTER_ANGLE * 180 / Math.PI;
        return `<g transform="translate(${S.cx} ${S.cy}) rotate(${a}) scale(${this.f(this.wheelK() * 1000) / 1000}) translate(${-S.cx} ${-S.cy})">${inner}</g>`;
    },
    // колесо на аппарате: куплено — или включено в отладке (🐞 → «Колесо»)
    wheelShown() {
        if (typeof Backend !== 'undefined' && Backend.greedLevel && Backend.greedLevel('wheel') > 0) return true;
        try { return localStorage.getItem('gj-wheel') === '1'; } catch (e) { return false; }
    },

    // Диск целиком в своих координатах: центр (0,0), сектор 0 — вверху.
    // rot — поворот (для картинки, которая потом крутится, rot = 0).
    wheelFace() {
        const J = PALETTE.greedJunk, W = J.reel.wheel, f = this.f, ink = PALETTE.ink, G = this.WHEEL;
        const n = this.WHEEL_SECTORS.length, rnd = this.rng(808);
        // торец фанеры: слоистый край
        let edge = `<circle r="${G.rEdge}" fill="${W.plyEdge}" stroke="${ink}" stroke-width="${STROKE.contour}"/>`;
        [G.rEdge - 1.4, G.rEdge - 2.6].forEach(r => { edge += `<circle r="${r}" fill="none" stroke="${W.ply}" stroke-width="0.5" opacity="0.8"/>`; });
        // сектора: краска кистью — у каждого чуть свой тон, мазки вдоль радиуса
        let sec = '';
        for (let i = 0; i < n; i++) {
            const a0 = (i - 0.5) / n * Math.PI * 2 - Math.PI / 2, a1 = (i + 0.5) / n * Math.PI * 2 - Math.PI / 2;
            const red = i % 2 === 0, col = red ? W.red : W.cream, lo = red ? W.redLo : W.creamLo, r = G.rFace;
            sec += `<path d="M0 0 L${f(Math.cos(a0) * r)} ${f(Math.sin(a0) * r)} A${r} ${r} 0 0 1 ${f(Math.cos(a1) * r)} ${f(Math.sin(a1) * r)} Z" fill="${col}"/>`;
            // мазки
            let br = '';
            for (let k = 0; k < 11; k++) {
                const a = a0 + (a1 - a0) * (0.08 + rnd() * 0.84), r0 = 18 + rnd() * 40, r1 = r0 + 24 + rnd() * 36;
                br += `M${f(Math.cos(a) * r0)} ${f(Math.sin(a) * r0)} L${f(Math.cos(a) * Math.min(r1, r - 1))} ${f(Math.sin(a) * Math.min(r1, r - 1))} `;
            }
            sec += `<path d="${br}" stroke="${lo}" stroke-width="0.7" opacity="0.35" stroke-linecap="round"/>`;
            // граница сектора — не по линейке, кисть
            const am = a0 + (rnd() - 0.5) * 0.01;
            sec += `<path d="M${f(Math.cos(am) * 12)} ${f(Math.sin(am) * 12)} L${f(Math.cos(am) * (r - 0.5))} ${f(Math.sin(am) * (r - 0.5))}" stroke="${W.redLo}" stroke-width="0.6" opacity="0.6"/>`;
        }
        // сколы краски у обода и пара царапин: под краской фанера
        let chip = '';
        for (let k = 0; k < 0; k++) { // версия 2: без сколов
            const a = rnd() * Math.PI * 2, r = G.rFace - 2 - rnd() * 18, s = 1 + rnd() * 2.6;
            let d = '';
            for (let q = 0; q < 6; q++) {
                const b = q / 6 * Math.PI * 2, rr = s * (0.5 + rnd() * 0.7);
                d += (q ? 'L' : 'M') + f(Math.cos(a) * r + Math.cos(b) * rr * 1.4) + ' ' + f(Math.sin(a) * r + Math.sin(b) * rr) + ' ';
            }
            chip += `<path d="${d}Z" fill="${W.ply}" stroke="${W.plyLo}" stroke-width="0.3"/>`;
        }
        for (let k = 0; k < 0; k++) {
            const a = rnd() * Math.PI * 2, r = 22 + rnd() * 70, L = 5 + rnd() * 11, t = a + 1.2 + rnd();
            chip += `<path d="M${f(Math.cos(a) * r)} ${f(Math.sin(a) * r)} l${f(Math.cos(t) * L)} ${f(Math.sin(t) * L)}" stroke="${W.ply}" stroke-width="0.4" opacity="0.8"/>`;
        }
        // Значки — по середине сектора, «верхом» к язычку: сектор под
        // язычком стоит прямо. Было «верхом к ободу» — при язычке сверху это
        // одно и то же, а на 3 часа выпавшее мясо лежало бы на боку.
        let icons = '';
        const turn = 90 - this.POINTER_ANGLE * 180 / Math.PI;
        this.WHEEL_SECTORS.forEach((key, i) => {
            const a = i / n * Math.PI * 2 - Math.PI / 2, x = Math.cos(a) * G.rIcon, y = Math.sin(a) * G.rIcon;
            const svg = this.wheelIcon(key, i % 2 === 0);
            if (svg) icons += `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(a * 180 / Math.PI + turn)}) scale(${G.icon})">${svg}</g>`;
        });
        // гвозди на границах секторов: шляпка и тень вбок
        let pegs = '';
        for (let i = 0; i < n; i++) {
            const a = (i - 0.5) / n * Math.PI * 2 - Math.PI / 2, x = Math.cos(a) * G.rPeg, y = Math.sin(a) * G.rPeg;
            pegs += `<circle cx="${f(x + 1)}" cy="${f(y + 1.4)}" r="2.2" class="fx" fill="${J.hole}" opacity="0.5"/>` +
                `<circle cx="${f(x)}" cy="${f(y)}" r="2.2" fill="${J.tin[300]}" stroke="${ink}" stroke-width="${STROKE.detail}"/>` +
                `<circle cx="${f(x - 0.5)}" cy="${f(y - 0.5)}" r="0.6" class="hl" fill="${J.tin[100]}"/>` +
                this.domeH(x, y, 2.2, 1.8);
        }
        // середина: дыра в фанере под ступицу, в ней колпак ступицы; пять
        // колёсных гаек на шпильках с шайбами
        let hub = `<circle r="19" fill="${W.ply}" stroke="${W.plyLo}" stroke-width="0.5"/>` +
            `<circle r="${G.hole}" fill="${J.tin[700]}" stroke="${ink}" stroke-width="${STROKE.detail}"/>` +
            `<circle r="3.4" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.detail}"/><circle r="1.3" fill="${J.tin[900]}"/>`;
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2, x = Math.cos(a) * 11.5, y = Math.sin(a) * 11.5;
            const hex = [0, 1, 2, 3, 4, 5].map(k => { const b = k * Math.PI / 3 + i; return f(x + Math.cos(b) * 2.7) + ',' + f(y + Math.sin(b) * 2.7); }).join(' ');
            hub += `<circle cx="${f(x)}" cy="${f(y)}" r="3.6" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.hairline}"/>` +
                `<polygon points="${hex}" fill="${J.tin[300]}" stroke="${ink}" stroke-width="${STROKE.detail}"/>` +
                `<circle cx="${f(x)}" cy="${f(y)}" r="1.1" fill="${J.tin[700]}"/>` + this.domeH(x, y, 2.7, 1.4);
        }
        return { edge, sec, chip, icons, pegs, hub };
    },

    // Значки кистью: заливка цветом, тёмный контур, светлый мазок-блик.
    // Коробка ~16×16, «верх» значка смотрит к ободу.
    wheelIcon(key, onRed) {
        const J = PALETTE.greedJunk, W = J.reel.wheel, ink = PALETTE.ink, Y = J.paint.yellow, lw = 1;
        const coin = (x, y, r) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r}" fill="${Y}" stroke="${ink}" stroke-width="${lw}"/>` +
            `<circle cx="${x}" cy="${y}" r="${r * 0.58}" fill="none" stroke="${J.brass.lo}" stroke-width="0.7"/>` +
            `<path d="M${x - r * 0.5} ${y - r * 0.35} q${r * 0.3} ${-r * 0.3} ${r * 0.65} ${-r * 0.35}" fill="none" stroke="${W.cream}" stroke-width="0.8" stroke-linecap="round"/>`;
        switch (key) {
        case 'gold1': return coin(0, 0, 6.4);
        case 'gold3': return coin(-4.6, 2.6, 4.6) + coin(4.6, 2.6, 4.6) + coin(0, -4, 4.6);
        case 'meat': return `<path d="M-6 -1 Q-7 -7 -1 -7 Q6 -7 6 -1 Q6 5 0 5.5 Q-6 5 -6 -1 Z" fill="${W.meat}" stroke="${ink}" stroke-width="${lw}"/>` +
            `<path d="M-2.5 -2 Q0 -4 3 -2" fill="none" stroke="${W.bone}" stroke-width="0.8" opacity="0.7"/>` +
            `<path d="M2 4 L5.5 8.5" stroke="${ink}" stroke-width="3.2" stroke-linecap="round"/><path d="M2 4 L5.5 8.5" stroke="${W.bone}" stroke-width="2" stroke-linecap="round"/>` +
            `<circle cx="6.4" cy="9.2" r="1.6" fill="${W.bone}" stroke="${ink}" stroke-width="0.7"/><circle cx="4.6" cy="10" r="1.4" fill="${W.bone}" stroke="${ink}" stroke-width="0.7"/>`;
        case 'seed': return `<ellipse cx="0" cy="0" rx="7" ry="5.4" transform="rotate(-18)" fill="${W.potato}" stroke="${ink}" stroke-width="${lw}"/>` +
            `<circle cx="-2.6" cy="-1" r="0.7" fill="${W.potatoLo}"/><circle cx="2" cy="1.6" r="0.7" fill="${W.potatoLo}"/><circle cx="3.2" cy="-1.8" r="0.6" fill="${W.potatoLo}"/>` +
            `<path d="M-4.6 -2.6 q1.6 -1.6 3.6 -1.6" fill="none" stroke="${W.cream}" stroke-width="0.8" stroke-linecap="round" opacity="0.8"/>` +
            // росток — это семенная картошка
            `<path d="M4 -4 q2 -2.6 1.2 -5" fill="none" stroke="${J.paint.yellow}" stroke-width="1" stroke-linecap="round"/>`;
        case 'shard': return `<path d="M-5.5 5 L-2 -6 L0.8 -2 L3.6 -5.6 L6 4.6 Z" fill="${W.shard}" stroke="${ink}" stroke-width="${lw}" stroke-linejoin="round"/>` +
            `<path d="M-2 -6 L-1 -1 L2.5 1.5 L1.5 5" fill="none" stroke="${W.shardLo}" stroke-width="0.7"/>` +
            `<path d="M-3.2 2 L-1.6 -3" stroke="${W.cream}" stroke-width="0.8" stroke-linecap="round" opacity="0.8"/>`;
        }
        return '';
    },

    // ---------- ЩИТ ЗА КОЛЕСОМ ----------
    // Щит из ровных сосновых досок закрывает левую часть ящика — от левой
    // боковины до пачинко (его половина остаётся открытой): крепления,
    // провода и доски задней стенки за колесом не видны и между секторами
    // не мелькают (решение игрока). Доски вертикальные, прибиты к рамке
    // саморезами сверху и снизу; в середине выпилена дыра под ступицу.
    // Было: лист жести, перекошенный, — игрок попросил дерево и ровнее.
    // Колесо стало половиной на краю ящика — щит во всю высоту проёма, от
    // левой боковины до короба пачинко.
    SHIELD: { x: 42, y: -33, w: 162, h: 323, boards: 5 },
    wheelShield() {
        const J = PALETTE.greedJunk, Sh = this.SHIELD, W = this.SLOTS.wheel, f = this.f;
        let out = `<rect x="${Sh.x + 2.5}" y="${Sh.y + 3.5}" width="${Sh.w}" height="${Sh.h}" class="fx" fill="${J.hole}" opacity="0.4"/>`;
        out += this.planks(Sh.x, Sh.y, Sh.w, Sh.h, Sh.boards, 741, 'v', 0, 'pine');
        // саморезы: по два на доску сверху и снизу
        const bw = Sh.w / Sh.boards;
        for (let i = 0; i < Sh.boards; i++) {
            const x = Sh.x + bw * (i + 0.5);
            out += this.bolt(x - 5, Sh.y + 6, 1.8) + this.bolt(x + 5, Sh.y + 6, 1.8) +
                this.bolt(x - 5, Sh.y + Sh.h - 6, 1.8) + this.bolt(x + 5, Sh.y + Sh.h - 6, 1.8);
        }
        // дыра под ступицу — выпилена лобзиком, торец светлее (ступица на
        // краю ящика — дыры в щите нет, ось уходит в боковину)
        if (W.cx - 21 > Sh.x) out += `<circle cx="${W.cx}" cy="${W.cy}" r="21" class="pit" fill="${J.hole}" stroke="${J.pine[100]}" stroke-width="1.2"/>`;
        return this.T(15, 'pine', out);
    },

    // Колесо неподвижно, целиком в корпусе — запасной путь, когда своего
    // холста у колеса нет (wheelApart выключен: нет WebGL или превью без
    // GreedJunkLit). На свету диск крутится сам (greed-junk-lit-wheel.js).
    wheelDisc() {
        const S = this.SLOTS.wheel, F = this.wheelFace(), k = this.f(this.wheelK() * 1000) / 1000;
        const g = (h, mat, inner) => this.T(h, mat, `<g transform="translate(${S.cx} ${S.cy}) scale(${k})">${inner}</g>`);
        return g(17, 'raw', F.edge) + g(17.6, 'paint', F.sec + F.chip + F.icons) + g(19, 'steel', F.pegs) + g(19.5, 'steel', F.hub) + this.wheelPtrG(this.wheelPointer());
    },

    // Язычок: резиновая полоса на стальном уголке, прикрученном к перекладине
    // над колесом; свисает до гвоздей обода.
    // part: 'bracket' — только уголок, 'strip' — только резинка (на свету
    // резинка качается отдельной картинкой, уголок стоит в корпусе)
    wheelPointer(part) {
        const J = PALETTE.greedJunk, W = J.reel.wheel, S = this.SLOTS.wheel, ink = PALETTE.ink, f = this.f;
        const x = S.cx, yTop = S.cy - this.WHEEL.rEdge - 14, yTip = S.cy - this.WHEEL.rPeg + 3.5;
        let br = `<path d="M${x - 9} ${yTop} H${x + 9} V${yTop + 6} H${x + 2.8} V${yTop + 10} H${x - 2.8} V${yTop + 6} H${x - 9} Z" class="fx" fill="${J.hole}" opacity="0.4" transform="translate(1 1.6)"/>` +
            `<path d="M${x - 9} ${yTop} H${x + 9} V${yTop + 6} H${x + 2.8} V${yTop + 10} H${x - 2.8} V${yTop + 6} H${x - 9} Z" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>` +
            this.bolt(x - 5.6, yTop + 3, 1.4) + this.bolt(x + 5.6, yTop + 3, 1.4);
        const strip = `M${f(x - 2.4)} ${yTop + 8} L${f(x + 2.4)} ${yTop + 8} L${f(x + 1.6)} ${yTip} Q${x} ${yTip + 1.6} ${f(x - 1.6)} ${yTip} Z`;
        let rub = `<path d="${strip}" class="fx" fill="${J.hole}" opacity="0.4" transform="translate(1.2 1.8)"/>` +
            `<path d="${strip}" fill="${W.rubber}" stroke="${ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>` +
            `<path d="M${f(x - 1.4)} ${yTop + 9} L${f(x - 0.9)} ${yTip - 1}" class="hl" stroke="${J.tin[500]}" stroke-width="0.6"/>` +
            this.bolt(x, yTop + 9.6, 1.1);
        return (part === 'strip' ? '' : this.T(20, 'steel', br)) + (part === 'bracket' ? '' : this.T(20.5, 'rubber', rub));
    }
});
