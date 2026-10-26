// АППАРАТ АЛЧНОСТИ: ТАБЛО И НИЖНИЙ ЯРУС — СТЫК, ИСТОРИЯ ТАБЛО, ОКНА, НИТКА, ЯЩИК, ЛОТОК, ЦОКОЛЬ
// Продолжение GreedJunk (greed-junk-top.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после greed-junk-top.js.
Object.assign(GreedJunk, {

    // ---------- СТЫК ВЕРХА И ТАБЛО ----------
    // Табло подвешено к верхнему ящику двумя кусками перфоленты
    // (оцинкованная монтажная лента с рядом дыр): верх ленты привёрнут к
    // полосе жалюзи, низ — к дверце, на стыке лента перегибается через
    // щель. Ленты — в просветах между щелями жалюзи и мимо отпечатка
    // таблички. Было: табло просто подсунуто под верх, без крепежа.
    doorJoint() {
        const J = PALETTE.greedJunk, Z = J.zinc, f = this.f;
        let out = '';
        [[83, 0.6], [261, -0.8]].forEach(([x, tilt]) => {
            // шире 5 нельзя: просвет между щелями жалюзи 6, лента ещё и перекошена
            const w = 5, y0 = 275, y1 = 310, gap0 = 290, gap1 = 296;
            let g = `<rect x="${f(x - w / 2 + 1)}" y="${y0 + 1.6}" width="${w}" height="${y1 - y0}" rx="0.6" class="fx" fill="${J.hole}" opacity="0.35"/>` +
                `<rect x="${f(x - w / 2)}" y="${y0}" width="${w}" height="${y1 - y0}" rx="0.6" fill="url(#gj-zinc)" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;
            // перегиб над щелью: лента уходит назад и снова выходит — тёмная
            // полоса сгиба и светлая кромка под ним
            g += `<rect x="${f(x - w / 2 + 0.3)}" y="${gap0}" width="${f(w - 0.6)}" height="${gap1 - gap0}" fill="${Z.lo}"/>` +
                `<line x1="${f(x - w / 2 + 0.3)}" y1="${gap1 - 0.4}" x2="${f(x + w / 2 - 0.3)}" y2="${gap1 - 0.4}" class="hl" stroke="${Z.hi}" stroke-width="0.6"/>`;
            // ряд дыр; там, где болт, дыры нет — болт сидит в ней
            const bolts = [280, 304];
            // Дыры без провала на карте высот: с ним шейдер добавлял под
            // каждой дырой свою тень, и они читались сдвоенными точками.
            for (let y = y0 + 2.4; y < y1 - 1; y += 2.8) {
                if (bolts.some(b => Math.abs(b - y) < 2) || (y > gap0 - 1 && y < gap1 + 1)) continue;
                g += `<circle cx="${f(x)}" cy="${f(y)}" r="0.55" fill="${J.hole}"/>`;
            }
            g += bolts.map(y => this.bolt(x, y, 1.8)).join('');
            out += `<g transform="rotate(${tilt} ${x} ${gap0})">` + this.T(11, 'zinc', g) + `</g>`;
        });
        return out;
    },

    // ---------- ИСТОРИЯ ТАБЛО ----------
    // Табло — дверца от старого игрового автомата из парка аттракционов:
    // эмаль с лучами и окно под барабаны у неё свои. Её сняли с петель,
    // отпилили по размеру ящика и прикрутили к стойкам. Следы этого:
    //   * слева — две петли, спиленные болгаркой: лепесток на дверце и
    //     обрубок шарнира со срезом;
    //   * справа — край отпилен: светлая полоса свежего реза с заусенцем и
    //     цвета побежалости от нагрева;
    //   * сверху — ряд пустых дыр, где на дверце была табличка.
    doorScars() {
        const J = PALETTE.greedJunk, f = this.f;
        let out = '';
        // спиленные петли: вокруг лепестка — грязь и ржавчина двадцати лет,
        // сам лепесток в ржавых потёках
        [322, 434].forEach(y => {
            let leaf = `<rect x="49.5" y="${y - 9}" width="15" height="18" rx="3" class="fx" fill="${J.wood[900]}" opacity="0.25"/>` +
                `<rect x="51" y="${y - 7}" width="11" height="14" rx="1.5" fill="${J.tin[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                `<rect x="51" y="${y - 7}" width="11" height="14" rx="1.5" fill="url(#gj-rust)" opacity="0.45"/>` +
                // потёки ржавчины: узкая струйка от кромки с каплей на конце,
                // длинная и короткая рядом. Было: две ровные палочки —
                // читались ножками.
                `<path d="M52.8 ${y + 6.6} C53 ${y + 9} 53.2 ${y + 11} 53.4 ${y + 12.6} A0.9 0.9 0 0 0 55 ${y + 12.4} C54.8 ${y + 10.5} 54.6 ${y + 8.5} 54.6 ${y + 6.6} Z" fill="${J.rust[500]}" opacity="0.4"/>` +
                `<path d="M58.4 ${y + 6.6} C58.5 ${y + 7.8} 58.6 ${y + 8.6} 58.7 ${y + 9.4} A0.7 0.7 0 0 0 59.9 ${y + 9.3} C59.8 ${y + 8.4} 59.7 ${y + 7.6} 59.7 ${y + 6.6} Z" fill="${J.rust[300]}" opacity="0.35"/>` +
                this.bolt(57, y - 3, 1.4) + this.bolt(57, y + 3.5, 1.4);
            out += this.T(10, 'steel', leaf);
            // обрубок шарнира: половина цилиндра срезана наискось болгаркой —
            // светлый косой срез сверху, а снизу шарнир просто кончается
            let knuckle = `<path d="M47 ${y - 1} L52 ${y - 4} L52 ${y + 6} Q49.5 ${y + 7.4} 47 ${y + 6} Z" fill="${J.tin[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                `<path d="M47 ${y - 1} L52 ${y - 4} L52 ${y - 2.6} L47 ${y + 0.4} Z" fill="${J.tin[100]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>` +
                `<circle cx="49.5" cy="${y - 1.6}" r="0.8" class="pit" fill="${J.hole}"/>` +
                this.rodH(`M49.5 ${y} L49.5 ${y + 5}`, 5, 2.4);
            out += this.T(11, 'steel', knuckle);
        });
        // Отпиленный правый край — в повороте самого листа (tin поворачивает
        // лист на 0.4°), иначе полоса расходилась с кромкой. Рез болгаркой —
        // прямой: ровная полоска свежего металла по кромке, за ней тонкая
        // окалина, дальше побежалость. Было: кромка неровной ширины, и рез
        // читался зубчатой «пилой» — так режут ножницами, а не диском.
        let cut = `<rect x="300" y="308" width="9" height="148" fill="url(#gj-temper)" opacity="0.45"/>` +
            `<rect x="307.4" y="298" width="2.6" height="168" fill="${J.tin[900]}" opacity="0.85"/>` +
            `<rect x="308.6" y="298" width="1.4" height="168" fill="${J.tin[100]}"/>`;
        out += `<g transform="rotate(0.4 180 382)">` + this.T(9, 'steel', cut) + `</g>`;
        // Отпечаток таблички над окном: под ней краска не выцвела и грязь не
        // легла — остался яркий прямоугольник с тёмной каймой грязи по
        // контуру и пустыми дырами по углам.
        const px = 138, py = 298.5, pw = 84, ph = 12;
        let ghost = `<rect x="${px - 1}" y="${py - 1}" width="${pw + 2}" height="${ph + 2}" rx="1.5" fill="none" stroke="${J.wood[900]}" stroke-width="1" opacity="0.22"/>` +
            `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="1" fill="${J.tin[300]}" opacity="0.5"/>` +
            `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="1" fill="${J.tin[100]}" opacity="0.12"/>`;
        [[px + 3, py + 3], [px + pw - 3, py + 3], [px + 3, py + ph - 3], [px + pw - 3, py + ph - 3]].forEach(([x, y]) => {
            // дыра без провала на карте высот: с ним под каждой — своя тень,
            // и дыры двоились
            ghost += `<circle cx="${f(x)}" cy="${f(y)}" r="1.3" fill="${J.hole}" stroke="${J.wood[900]}" stroke-width="${STROKE.hairline}"/>` + this.rustRun(x, y + 1.4, 3, Math.round(x));
        });
        out += `<g transform="rotate(0.4 180 382)">` + this.T(9, 'steel', ghost) + `</g>`;
        return out;
    },

    // ---------- ОКНА БАРАБАНОВ ----------
    // В каждом окне — барабан: кремовый цилиндр, лежащий осью вбок. Его
    // форма — затемнение к верху и низу окна, где лента уходит от глаза,
    // и тень от кромки окна сверху — барабан виден
    // и до того, как на нём появятся символы (в игре ленты с символами
    // крутятся поверх корпуса). Через все три окна — натянутая красная
    // струна линии выигрыша, у каждого окна — хромированная окантовка, сверху
    // — стекло: на карте высот его нет, есть только блик по материалу.
    // Было: три чёрные ямы, окно читалось провалом.
    reelWindows() {
        const J = PALETTE.greedJunk, f = this.f, R = this.SLOTS.reels;
        let out = '';
        R.forEach(r => {
            const cy = r.y + r.h / 2;
            let drum = `<rect class="drum" x="${r.x + 1}" y="${r.y + 1}" width="${r.w - 2}" height="${r.h - 2}" rx="4" fill="${J.paint.cream}"/>`;
            // Барабан уходит от глаза к верху и низу окна — затемнение там
            // это его форма, а не нарисованный свет, поэтому оно в цвете,
            // а не в тени (fx). Высотами такой большой цилиндр в узком
            // окне не вылепить: перепада глубины не хватает, а ступени
            // профиля полосили.
            drum += `<rect class="drum" x="${r.x + 1}" y="${r.y + 1}" width="${r.w - 2}" height="${r.h - 2}" rx="4" fill="url(#gj-drum)"/>`;
            // Символы на барабане — лента (greed-junk-reel.js), её кладёт шейдер
            // по маске drum; цвет барабана — её освещённость: затемнение к
            // краям окна умножается на ленту. Было: пустой барабан с двумя
            // неподвижными рисками ячеек.
            out += this.T(-12, 'plastic', drum);
            // хромированная окантовка окна
            out += this.T(-9, 'polished', `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="5" fill="none" ` +
                `stroke="${PALETTE.ink}" stroke-width="4.4"/><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="5" fill="none" ` +
                `stroke="${J.tin[300]}" stroke-width="2.4"/>` + this.rodH(`M${r.x} ${r.y + 5} V${r.y + r.h - 5} M${r.x + r.w} ${r.y + 5} V${r.y + r.h - 5} M${r.x + 5} ${r.y} H${r.x + r.w - 5} M${r.x + 5} ${r.y + r.h} H${r.x + r.w - 5}`, 3, 1));
            // стекло: два косых блика
            out += this.T(-9, 'lens', `<g class="nh"><path d="M${r.x + 6} ${r.y + 40} L${r.x + 30} ${r.y + 4} L${r.x + 38} ${r.y + 4} L${r.x + 10} ${r.y + 48} Z" fill="${J.alu[100]}" opacity="0.16"/>` +
                `<path d="M${r.x + 14} ${r.y + 54} L${r.x + 44} ${r.y + 10} L${r.x + 47} ${r.y + 10} L${r.x + 17} ${r.y + 58} Z" fill="${J.alu[100]}" opacity="0.1"/></g>`);
        });
        // Линия выигрыша — красная нитка, натянутая между двумя болтиками и
        // завязанная на них узелками. Лишний кончик у правого узелка
        // свисает и болтается от наклона телефона — он живой и рисуется
        // поверх корпуса (threadTail, GreedJunkLit.run); здесь — только
        // нитка и узелки.
        const T = this.thread();
        // провис: нитку натянули от руки, середина ниже концов
        const mid = [(T.x0 + T.x1) / 2, T.y + T.sag * 2];
        let th = this.strand([[T.x0, T.y], mid, [T.x1, T.y]]);
        th += [T.x0, T.x1].map((x, i) => this.knot(x, T.y, i ? 1 : -1)).join('');
        out += this.T(-8, 'thread', th);
        // без живого слоя (запасной вид, карты света) кончик висит отвесно
        if (this.pass === 'baked') out += this.threadTail();
        return out;
    },

    // Где нитка: от левого болтика к правому, по середине окон; sag —
    // провис середины. Метод, а не геттер: Object.assign вычислил бы геттер
    // сразу при подключении.
    thread() {
        const R = this.SLOTS.reels, y = R[0].y + R[0].h / 2;
        return { x0: R[0].x - 5, x1: R[2].x + R[2].w + 5, y, sag: 2.2 };
    },

    // ---------- НИТКА ----------
    // Кручёная нитка по квадратичной кривой (начало, управляющая, конец):
    // тёмная обводка, красная жила, косые тёмные риски скрутки через
    // каждые полторы единицы и светлая полоска сверху — так тонкая линия
    // читается ниткой, а не проволокой.
    strand(q, w) {
        const J = PALETTE.greedJunk, f = this.f;
        w = w || 1.5;
        const [a, c, b] = q;
        const d = `M${f(a[0])} ${f(a[1])} Q${f(c[0])} ${f(c[1])} ${f(b[0])} ${f(b[1])}`;
        const at = (t) => {
            const u = 1 - t;
            return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
        };
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - (a[0] + b[0]) / 2, c[1] - (a[1] + b[1]) / 2);
        let ticks = '';
        const n = Math.max(2, Math.floor(len / 1.5));
        for (let i = 1; i < n; i++) {
            const p0 = at(i / n), p1 = at(Math.min(1, i / n + 0.01));
            const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) + 0.75;   // скрутка — наискосок
            const dx = Math.cos(ang) * w * 0.55, dy = Math.sin(ang) * w * 0.55;
            ticks += `M${f(p0[0] - dx)} ${f(p0[1] - dy)} L${f(p0[0] + dx)} ${f(p0[1] + dy)} `;
        }
        return `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="${w + 0.9}" stroke-linecap="round"/>` +
            `<path d="${d}" fill="none" stroke="${J.paint.red}" stroke-width="${w}" stroke-linecap="round"/>` +
            `<path d="${ticks}" stroke="${J.primer.lo}" stroke-width="0.45" stroke-linecap="round" opacity="0.85"/>` +
            `<path d="${d}" fill="none" class="hl" stroke="${J.primer.hi}" stroke-width="0.35" transform="translate(0 -0.35)" opacity="0.8"/>`;
    },

    // Узел на болтике: нитка обмотана вокруг ножки болта под шляпкой
    // (виток виден кольцом шире шляпки), шляпка прижимает его сверху, а
    // ниже — узел-«восьмёрка»: две петли, перехлёстнутые крест-накрест.
    // side — с какой стороны окна болтик: узел ложится наружу.
    knot(x, y, side) {
        const f = this.f;
        let out = '';
        // виток вокруг ножки: кольцо, разбитое на две дуги (сверху и снизу)
        out += this.strand([[x - 3.2, y], [x - 3, y - 4.4], [x + 3.2, y - 0.4]], 1.3);
        out += this.strand([[x - 3.2, y + 0.3], [x + 0.2, y + 4.4], [x + 3.2, y - 0.2]], 1.3);
        out += this.bolt(x, y, 2.2);
        // восьмёрка: две петли, перехлёст
        const kx = x + side * 3.6, ky = y + 2.6;
        out += this.strand([[kx - side * 1.6, ky - 1.8], [kx + side * 2.6, ky - 1.2], [kx, ky + 1.6]], 1.3);
        out += this.strand([[kx - side * 1.8, ky + 1.4], [kx + side * 2.2, ky + 2.4], [kx + side * 0.6, ky - 1.6]], 1.3);
        return out;
    },

    // Свисающий кончик нитки из узла у правого болтика. Изгиб считает
    // Hang (src/core/hang.js): хвостик короткий, поэтому у узла он держит
    // направление, а под тяжестью гнётся только кончик. hang — состояние
    // цепочки; без него (запасной вид) — покой под отвесной тяжестью.
    TAIL: { len: 14, root: 1.0 },
                // выходит из узла вправо-вниз
    threadTail(hang) {
        const J = PALETTE.greedJunk, f = this.f, T = this.thread();
        const h = hang || Hang.create(this.TAIL.len, this.TAIL.root, 'thread');
        const pts = Hang.points(h, T.x1 + 4.2, T.y + 4);
        const e = pts[pts.length - 1], p = pts[pts.length - 2];
        const ang = Math.atan2(e[0] - p[0], e[1] - p[1]);
        return this.strandPts(pts, 1.3) +
            // растрёпанный кончик: жилки разошлись
            [-0.45, 0.1, 0.55].map(da => `<path d="M${f(e[0])} ${f(e[1])} l${f(Math.sin(ang + da) * 2.2)} ${f(Math.cos(ang + da) * 2.2)}" ` +
                `stroke="${J.paint.red}" stroke-width="0.5" stroke-linecap="round"/>`).join('');
    },

    // Та же кручёная нитка, что strand, но по ломаной точек (сглаженной).
    strandPts(pts, w) {
        const J = PALETTE.greedJunk, f = this.f;
        const d = this.smooth(pts);
        let ticks = '';
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + 0.75;
            const dx = Math.cos(ang) * w * 0.55, dy = Math.sin(ang) * w * 0.55;
            for (let t = 0.5; t < len; t += 1.5) {
                const x = a[0] + (b[0] - a[0]) * t / len, y = a[1] + (b[1] - a[1]) * t / len;
                ticks += `M${f(x - dx)} ${f(y - dy)} L${f(x + dx)} ${f(y + dy)} `;
            }
        }
        return `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="${w + 0.9}" stroke-linecap="round" stroke-linejoin="round"/>` +
            `<path d="${d}" fill="none" stroke="${J.paint.red}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>` +
            `<path d="${ticks}" stroke="${J.primer.lo}" stroke-width="0.45" stroke-linecap="round" opacity="0.85"/>` +
            `<path d="${d}" fill="none" class="hl" stroke="${J.primer.hi}" stroke-width="0.35" transform="translate(0 -0.35)" opacity="0.8"/>`;
    },

    // Полка под табло и нижний ящик: низкий, на нём только табличка и лоток.
    // Ящик сколочен как всё в гараже: лицо — лист ДСП, по краям стойки из
    // того, что было (слева сосна, справа доска от лакированной мебели —
    // наоборот, чем у табло). Табличка — светлая сосна, лоток — жесть.
    body() {
        const J = PALETTE.greedJunk, S = this.SLOTS;
        let out = '';
        // лицо ящика: лист ДСП
        out += this.T(3, 'chip', this.material('chip', 54, 484, 252, 90, 811, false) +
            `<path d="${this.wob(54, 484, 252, 90, 811, 1.8)}" fill="none" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`);
        // стойки по краям
        out += this.T(5, 'pine', this.planks(40, 484, 16, 90, 1, 82, 'v', 0, 'pine'));
        out += this.T(5, 'lacquer', this.planks(304, 484, 16, 90, 1, 83, 'v', 0, 'painted'));
        // тень от полки на ящик — только запасной вид, шейдер даёт свою
        out += this.shade(40, 486, 280, 14);
        // пустая табличка выплат: светлая сосновая доска на гвоздях
        const p = S.plate;
        let plate = this.material('pine', p.x, p.y, p.w, p.h, 151, false) +
            `<path d="${this.wob(p.x, p.y, p.w, p.h, 151, 1)}" fill="none" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<line x1="${p.x + 4}" y1="${p.y + 2.5}" x2="${p.x + p.w - 4}" y2="${p.y + 2.5}" class="hl" stroke="${J.wood[100]}" stroke-width="${STROKE.detail}" opacity="0.7"/>`;
        [[p.x + 6, p.y + 6], [p.x + p.w - 6, p.y + 6], [p.x + 6, p.y + p.h - 6], [p.x + p.w - 6, p.y + p.h - 6]]
            .forEach(([x, y]) => { plate += this.nail(x, y); });
        // таблица выплат краской по доске (greed-junk-plate.js)
        // на свету тряпка отдельной картинкой качается поверх (ragApart)
        if (this.payPlate && !this.ragApart) plate += this.payPlate(p);
        // правый конец доски отпилен: свежий светлый торец и следы пилы
        const ex = p.x + p.w;
        plate += `<rect x="${ex - 2.2}" y="${p.y + 1}" width="1.6" height="${p.h - 2}" fill="${J.pine[100]}" opacity="0.85"/>` +
            `<path d="M${ex - 2} ${p.y + 9} l1.2 -2 M${ex - 2} ${p.y + 21} l1.2 -2 M${ex - 2} ${p.y + 33} l1.2 -2" stroke="${J.pine[500]}" stroke-width="0.4"/>`;
        out += this.T(6, 'pine', plate);
        out += this.coinTray();
        // монетоприёмник из двери туалета — на месте старой трещины со скотчем
        if (this.wcSlot) out += this.wcSlot();
        // полка поверх стыка табло и ящика — торчит за края; справа
        // длиннее — под кулису, она стоит на полке
        out += this.T(8, 'pine', this.planks(24, 466, 334, 20, 1, 111, 'h', 0, 'pine'));
        out += this.shelfBracket(42, 1) + this.shelfBracket(318, -1);
        return out;
    },

    // Плоский уголок: стягивает полку с ящиком. Верхняя полка уголка — на
    // передней доске полки, нижняя — на стойке ящика, по два самореза.
    // Было: серые квадраты с болтом под полкой — не было видно, что они
    // держат. side: 1 — левый (полка уголка вправо), −1 — правый.
    shelfBracket(x, side) {
        const J = PALETTE.greedJunk, f = this.f;
        const X = (d) => x + side * d;
        const d = `M${f(X(0))} 474 L${f(X(26))} 474 L${f(X(26))} 482 L${f(X(8))} 482 L${f(X(8))} 510 L${f(X(0))} 510 Z`;
        let g = `<path d="${d}" class="fx" fill="${J.hole}" opacity="0.35" transform="translate(1.2 1.8)"/>` +
            `<path d="${d}" fill="${J.tin[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>` +
            `<path d="M${f(X(1.4))} 475.4 L${f(X(24.6))} 475.4" class="hl" stroke="${J.tin[300]}" stroke-width="0.8"/>`;
        // ржавчина в углу сгиба, где копится сырость
        g += `<path d="M${f(X(1))} 480 Q${f(X(6))} 479 ${f(X(7))} 484 L${f(X(7))} 490 Q${f(X(3))} 488 ${f(X(1))} 490 Z" fill="${J.rust[500]}" opacity="0.4"/>`;
        g += this.bolt(X(13), 478, 1.5) + this.bolt(X(21), 478, 1.5) + this.bolt(X(4), 494, 1.5) + this.bolt(X(4), 504, 1.5);
        return this.T(10, 'steel', g);
    },

    // Лоток для монет — старая форма для хлеба, привёрнутая к ящику двумя
    // саморезами через задний борт. Торчит вперёд и низом опирается на
    // цоколь. Лоток ниже глаз — видно, что внутри: задняя стенка, боковые,
    // дно (там и лягут монеты — SLOTS.tray). Передняя стенка видна снаружи,
    // под завальцованным бортом. Внутри — пригар: тёмные пятна от
    // выпечки. Было: жестяная рамка с тёмной щелью, читалась почтовым
    // ящиком.
    coinTray() {
        const J = PALETTE.greedJunk, T = this.SLOTS.tray, f = this.f;
        const P = (pts) => 'M' + pts.map(q => `${f(q[0])} ${f(q[1])}`).join(' L') + ' Z';
        // борт: задняя кромка на ящике, передняя ближе к нам — ниже и шире
        const rb = [[116, 545], [244, 545]], rf = [[109, 576], [251, 576]];
        // проём внутри борта
        const ob = [[121, 548.4], [239, 548.4]], of = [[115.5, 572], [244.5, 572]];
        // дно — прямоугольник монет
        const bb = [[T.x, T.y], [T.x + T.w, T.y]], bf = [[T.x - 2, T.y + T.h], [T.x + T.w + 2, T.y + T.h]];
        // Выход монет над лотком: щель в ДСП с жестяной губой — отсюда
        // выигрыш сыплется в форму (GreedJunkLit, «Лоток»). Иначе монетам
        // неоткуда браться.
        const CH = this.CHUTE;
        let chute = `<rect x="${CH.x - 1.5}" y="${CH.y - 2.2}" width="${CH.w + 3}" height="4.4" rx="1.2" fill="${J.tin[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<rect x="${CH.x}" y="${CH.y - 1}" width="${CH.w}" height="1.8" rx="0.8" class="pit" fill="${J.hole}"/>` +
            `<line x1="${CH.x}" y1="${CH.y + 1.5}" x2="${CH.x + CH.w}" y2="${CH.y + 1.5}" class="hl" stroke="${J.tin[100]}" stroke-width="0.5"/>` +
            this.bolt(CH.x - 4, CH.y, 1.1) + this.bolt(CH.x + CH.w + 4, CH.y, 1.1);
        let out = this.T(5, 'steel', chute);
        out += `<path d="${P([rb[0], rb[1], rf[1], [249, 588], [111, 588], rf[0]])}" class="fx" fill="${J.hole}" opacity="0.35" transform="translate(2 3)"/>`;
        // передняя стенка снаружи: сужается книзу, в тени
        let wall = `<path d="${P([rf[0], rf[1], [247, 587], [113, 587]])}" fill="${J.tin[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>` +
            `<path d="M118 580 L242 580" stroke="${J.tin[900]}" stroke-width="${STROKE.hairline}" opacity="0.6"/>`;
        out += this.T(10, 'steel', wall);
        // борт
        let rim = `<path d="${P([rb[0], rb[1], rf[1], rf[0]])}" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>` +
            `<path d="M${f(rf[0][0] + 2)} ${f(rf[0][1] - 0.8)} L${f(rf[1][0] - 2)} ${f(rf[1][1] - 0.8)}" class="hl" stroke="${J.tin[100]}" stroke-width="1"/>` +
            this.rodH(`M${rf[0][0] + 1} ${rf[0][1] - 1.2} L${rf[1][0] - 1} ${rf[1][1] - 1.2}`, 2.6, 1.2);
        // саморезы через задний борт
        rim += this.bolt(130, 546.6, 1.6) + this.bolt(230, 546.6, 1.6);
        out += this.T(12, 'steel', rim);
        // внутри: стенки и дно ниже борта; задняя смотрит на нас и светлее,
        // боковые — в полутени, дно темнее и в пригаре
        let inner = `<path d="${P([ob[0], ob[1], of[1], of[0]])}" fill="${J.tin[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>` +
            `<path d="${P([ob[0], ob[1], bb[1], bb[0]])}" fill="${J.tin[300]}"/>` +
            `<path d="${P([ob[0], bb[0], bf[0], of[0]])}" fill="${J.tin[900]}" opacity="0.85"/>` +
            `<path d="${P([ob[1], of[1], bf[1], bb[1]])}" fill="${J.tin[500]}"/>` +
            `<path d="${P([bb[0], bb[1], bf[1], bf[0]])}" fill="${J.tin[500]}"/>` +
            // рёбра между стенками и дном
            `<path d="M${f(ob[0][0])} ${f(ob[0][1])} L${f(bb[0][0])} ${f(bb[0][1])} M${f(ob[1][0])} ${f(ob[1][1])} L${f(bb[1][0])} ${f(bb[1][1])} ` +
            `M${f(bb[0][0])} ${f(bb[0][1])} L${f(bb[1][0])} ${f(bb[1][1])} M${f(bb[0][0])} ${f(bb[0][1])} L${f(bf[0][0])} ${f(bf[0][1])} M${f(bb[1][0])} ${f(bb[1][1])} L${f(bf[1][0])} ${f(bf[1][1])}" ` +
            `stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}" opacity="0.6"/>`;
        // Пригар: копится в углах и вдоль стенок, где масло стекало и
        // горело, — рваные мазки, а не кружки (кружки читались монетами).
        const rnd = this.rng(907);
        const smear = (cx, cy, rx, ry) => {
            const pts = [];
            for (let k = 0; k < 8; k++) {
                const a = k / 8 * Math.PI * 2, j = 0.55 + rnd() * 0.6;
                pts.push([cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j]);
            }
            return `<path d="${this.smooth(pts.concat([pts[0], pts[1]]))} Z" fill="${J.wood[900]}" opacity="${f(0.3 + rnd() * 0.25)}"/>`;
        };
        inner += smear(T.x + 5, T.y + T.h - 4, 9, 4) + smear(T.x + T.w - 6, T.y + T.h - 3, 11, 3.6) +
            smear(T.x + 30, T.y + 1.6, 16, 2) + smear(T.x + T.w - 26, T.y + 1.4, 10, 1.8) +
            smear(T.x + 58, T.y + T.h - 2, 7, 2.4);
        out += this.T(5, 'steel', inner);
        return out;
    },

    // Цоколь: толстая доска (горбыль без коры — тёмная, выветренная) на
    // двух брусках из ДСП. Доска выступает вперёд ящика — она выше.
    // Ящик стоит НА доске: её верхняя грань видна полоской (доска ниже
    // глаз), низ ящика — на задней кромке этой грани. Было: ящик уходил
    // за переднюю кромку доски, и не было видно, на чём он стоит. Под
    // правый брусок подбит клин из обрезка — пол в гараже кривой.
    plinth() {
        const J = PALETTE.greedJunk, V = this.VP, f = this.f;
        let out = this.T(2, 'chip', this.planks(34, 598, 64, 22, 1, 121, 'v', 0, 'chip') + this.planks(262, 598, 64, 22, 1, 122, 'v', 0, 'chip'));
        // клин под правым бруском
        out += this.T(3, 'pine', `<path d="M286 620.6 L336 616.4 L336 621.4 L286 621.4 Z" fill="${J.pine[100]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>` +
            `<path d="M296 620 L330 617.4" stroke="${J.pine[500]}" stroke-width="${STROKE.hairline}" opacity="0.7"/>`);
        out += this.T(8, 'lacquer', this.planks(20, 580, 320, 20, 1, 123, 'h', 0, 'painted'));
        // верхняя грань доски
        const k = 0.03, back = (x, y) => [x + (V.x - x) * k, y + (V.y - y) * k];
        const a = back(20, 580), b = back(340, 580);
        out += this.T(8, 'lacquer', `<path d="M20 580 L${f(a[0])} ${f(a[1])} L${f(b[0])} ${f(b[1])} L340 580 Z" fill="${J.painted.base}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>` +
            `<line x1="${f(a[0] + 3)}" y1="${f(a[1] + 1.2)}" x2="${f(b[0] - 3)}" y2="${f(b[1] + 1.2)}" class="hl" stroke="${J.painted.hi}" stroke-width="0.6" opacity="0.8"/>`);
        return out;
    },
});
