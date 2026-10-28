// АППАРАТ АЛЧНОСТИ: СРЕДНИЙ ЯРУС — ЛАМПЫ НА ПОЛКЕ, ПЕРСПЕКТИВА ЯРУСА, ЛАМПА НА ПРОВОДАХ
// Продолжение GreedJunk (greed-junk-top.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после greed-junk-top.js.
Object.assign(GreedJunk, {

    // ---------- ЛАМПЫ НА ПЛАНКЕ ----------
    // На бакелитовой планке от старого пульта вкручены лампы накаливания,
    // собранные отовсюду: все разные по форме, размеру и цвету, старые и
    // тусклые. При выигрыше они будут мигать (SLOTS.bulbs — где какая; сам
    // свет — живым слоем поверх, как кончик нитки). Были кнопки — ни для
    // чего, а лампы при выигрыше и есть смысл.
    //   red   — длинная красная трубка-индикатор, вытащенная из чего-то
    //           специального;
    //   pear  — обычная грушевидная лампочка, самая «современная»;
    //   globe — маленький янтарный шарик;
    //   flame — дымчатая «свеча» с закрученным носиком.
    // Лампы стоят на ВЕРХНЕЙ кромке полки (y = SHELF_TOP), каждая в
    // своём патроне, прикрученном к полке: полка выступает вперёд табло,
    // и лампы ближе к нам, чем дверца, — тень от них падает назад, на
    // неё. Было: лампы торчали из середины лицевой стороны планки, цоколь
    // ни на что не опирался, и они висели в воздухе.
    // Все лампы смотрят на игрока почти в упор (как первая, груша), а вбок
    // заваливаются каждая по-своему. Делаются по одной.
    SHELF_TOP: 466,
    bulbList() {
        return [{ kind: 'pear', x: 150 }, { kind: 'flame', x: 175 }, { kind: 'red', x: 200 }, { kind: 'globe', x: 231 }];
    },

    buttonPanel() {
        const J = PALETTE.greedJunk, B = J.bakelite, f = this.f;
        const x0 = 118, x1 = 244, y0 = 467, y1 = 485, cy = 476;
        let plate = `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="5" fill="${B.base}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<line x1="${x0 + 4}" y1="${y0 + 1.6}" x2="${x1 - 4}" y2="${y0 + 1.6}" class="hl" stroke="${B.hi}" stroke-width="${STROKE.detail}"/>` +
            this.rodH(`M${x0 + 6} ${cy} L${x1 - 6} ${cy}`, y1 - y0 - 2, 1.2);
        plate += this.bolt(x0 + 6, cy, 1.8) + this.bolt(x1 - 6, cy, 1.8);
        let out = this.T(10, 'plastic', plate);
        // Красная трубка стоит в своём патроне, как все. Висела на проводах
        // над тряпкой; тряпку убрали, на её месте лежит монетоприёмник, и
        // висячая лампа легла бы прямо на него.
        this.bulbList().forEach(b => { out += this.bulb(b.kind, b.x, this.SHELF_TOP); });
        return out;
    },

    // ---------- ПЕРСПЕКТИВА ЯРУСА ----------
    // Сцена — с одной точкой схода в центре окна (VP): из неё расходятся
    // лучи скоса, на её высоте глаз. Всё, что ниже глаза, видно чуть
    // сверху: у полки — узкая верхняя грань, уходящая к VP, у круглого —
    // верхние кромки эллипсами, и чем ниже вещь, тем эллипс шире. Без этого
    // лампы стояли плоскими прямоугольниками «наперекор» скосу за ними.
    VP: { x: 180, y: 388 },
    // Сжатие эллипса круга, лежащего горизонтально на высоте y.
    // _lean — прибавка, пока рисуется наклонённая к зрителю вещь (lamp):
    // её кольца повёрнуты к нам и видны шире.
    _lean: 0,
    flat(y) { return Math.max(0.06, Math.min(1, (y - this.VP.y) / 230 + this._lean)); },

    // Наклонённая вещь на опоре (x, yb): верх к зрителю на pitch рад и вбок
    // на roll град. В анфас наклон к зрителю — это укорочение ДЛИН вдоль
    // оси (ax(), cos pitch) и кольца шире (flat + tg pitch); круглое (шар
    // колбы) остаётся кругом — шар с любой стороны круглый. Сжимать всю
    // вещь по высоте нельзя: колба сплющивалась в лепёшку. Рисующий внутри
    // draw() рисует вещь стоящей прямо, длины по оси — через ax().
    // Так посажены лампы — небрежно, кто как вкрутил.
    _axis: 1,
    ax(v) { return v * this._axis; },
    leaned(x, yb, pitch, roll, draw) {
        const f = this.f, was = [this._lean, this._axis];
        this._lean = Math.tan(pitch); this._axis = Math.cos(pitch);
        this._pivot = { x, y: yb, roll };
        const inner = draw();
        [this._lean, this._axis] = was;
        return `<g transform="rotate(${roll} ${f(x)} ${f(yb)})">${inner}</g>`;
    },

    // Верхняя грань полки: от передней кромки назад к VP.
    shelfTop() {
        const J = PALETTE.greedJunk, f = this.f, V = this.VP;
        const y0 = this.SHELF_TOP, k = 0.05;
        const back = (x, y) => [x + (V.x - x) * k, y + (V.y - y) * k];
        // полка во всё поле: косые торцы верхней грани — под монетами рамки
        const X1 = this.W, a = back(0, y0), b = back(X1, y0);
        const d = `M0 ${y0} L${f(a[0])} ${f(a[1])} L${f(b[0])} ${f(b[1])} L${X1} ${y0} Z`;
        return this.T(8, 'pine', `<path d="${d}" fill="${J.pine[100]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>` +
            `<line x1="${f(a[0] + 2)}" y1="${f(a[1] + 0.8)}" x2="${f(b[0] - 2)}" y2="${f(b[1] + 0.8)}" stroke="${J.pine[500]}" stroke-width="${STROKE.hairline}" opacity="0.7"/>`);
    },

    // Цилиндр с осью вверх, видимый чуть сверху: передняя стенка и верхний
    // эллипс. (x, yb) — середина низа, w — ширина, h — высота, wt — ширина
    // верха (конус, если отличается). Низ — передняя дуга эллипса.
    cyl(x, yb, w, h, fill, top, wt) {
        const f = this.f;
        h = this.ax(h);
        const yt = yb - h;
        wt = wt == null ? w : wt;
        const rb = w / 2, rt = wt / 2, eb = rb * this.flat(yb), et = rt * this.flat(yt);
        const side = `M${f(x - rt)} ${f(yt)} L${f(x - rb)} ${f(yb)} A${f(rb)} ${f(eb)} 0 0 0 ${f(x + rb)} ${f(yb)} L${f(x + rt)} ${f(yt)} Z`;
        // top === 'none' — верх закрыт куполом (трубка лампы): шва нет
        return `<path d="${side}" fill="${fill}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>` +
            (top === 'none' ? '' : `<ellipse cx="${f(x)}" cy="${f(yt)}" rx="${f(rt)}" ry="${f(et)}" fill="${top || fill}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>`);
    },

    // Патрон на полке: бакелитовый фланец-диск на двух шурупах, на нём
    // чашка конусом, сверху латунное кольцо, в которое ввёрнута лампа.
    // Стоит на верхней грани полки (base — передняя кромка его низа).
    // Возвращает y верха кольца — оттуда начинается цоколь лампы.
    holder(x, base, w) {
        const J = PALETTE.greedJunk, B = J.bakelite, Br = J.brass, f = this.f;
        const fw = w + 9, yb = base - 1;              // диск чуть за кромкой полки
        const disk = this.T(10, 'plastic', this.cyl(x, yb, fw, 1.8, B.base, B.hi));
        // Шурупы — на горизонтальном диаметре лицевой грани диска, в одну
        // линию с её центром. Было: на 1.8 выше центра (высота диска без
        // ax), у верхнего края круга, и смотрелись криво.
        const yt = yb - this.ax(1.8);
        const screws = this.bolt(x - fw / 2 + 2, yt, 0.95) + this.bolt(x + fw / 2 - 2, yt, 0.95);
        const y1 = yb - 1.8, c = this.ax(6);
        let s = this.cyl(x, y1, w + 2, 6, B.base, B.lo, w);
        s += `<path d="M${f(x - w / 2 - 0.4)} ${f(y1 - 1)} L${f(x - w / 2 + 0.5)} ${f(y1 - c + 0.6)}" class="hl" stroke="${B.hi}" stroke-width="0.8"/>`;
        s += this.rodH(`M${x} ${f(y1 - c + 0.4)} L${x} ${f(y1 - 0.4)}`, w + 1, w * 0.4);
        const y2 = y1 - c;
        s += this.cyl(x, y2, w, 1.6, Br.base, Br.hi);
        // диск лежит на полке ровно; чашку с лампой вкрутили криво — она
        // отдельно (cup), чтобы наклон начинался от диска
        return { disk: disk + screws, cup: this.T(12, 'plastic', s), base: y1, top: y2 - this.ax(1.6) };
    },

    // Цоколь лампы: латунный цилиндр, витки резьбы — дугами, провисающими
    // вниз (кольца видны чуть сверху), снизу чёрный изолятор.
    socketBrass(x, base, w, h) {
        const J = PALETTE.greedJunk, Br = J.brass, f = this.f;
        let s = this.cyl(x, base, w, h, Br.base, Br.base);
        const top = base - this.ax(h), step = this.ax(1.6);
        for (let y = top + step; y < base - step * 0.5; y += step) {
            const e = (w / 2) * this.flat(y);
            s += `<path d="M${f(x - w / 2 + 0.3)} ${f(y)} A${f(w / 2)} ${f(e)} 0 0 0 ${f(x + w / 2 - 0.3)} ${f(y)}" fill="none" stroke="${Br.lo}" stroke-width="0.55"/>`;
        }
        s += `<rect x="${f(x - w / 2 + 0.7)}" y="${f(top + 0.6)}" width="1" height="${f(base - top - 1.6)}" class="hl" fill="${Br.hi}" opacity="0.8"/>`;
        s += this.rodH(`M${x} ${f(top + 0.5)} L${x} ${f(base - 0.5)}`, w, w * 0.45);
        return this.T(15, 'brass', s);
    },

    // Нить накала: держатели и зигзаг спирали — тёмные, лампа не горит.
    filament(x, y0, y1, w) {
        const J = PALETTE.greedJunk, f = this.f;
        let zig = `M${f(x - w / 2)} ${f(y0)}`;
        for (let i = 1; i <= 6; i++) zig += ` L${f(x - w / 2 + (w * i) / 6)} ${f(y0 + (i % 2 ? -1.2 : 0))}`;
        return `<path d="M${f(x - w / 2)} ${f(y1)} L${f(x - w / 2)} ${f(y0)} M${f(x + w / 2)} ${f(y1)} L${f(x + w / 2)} ${f(y0)}" stroke="${J.bulb.wire}" stroke-width="0.5"/>` +
            `<path d="${zig}" fill="none" stroke="${J.bulb.wire}" stroke-width="0.6" stroke-linejoin="round"/>`;
    },

    // Колба по контуру d: тонированное стекло (сквозь видно планку и нить),
    // блик полоской слева, выпуклость куполом/валиком на карте высот.
    glassBulb(d, color, op, hi, hpath) {
        const J = PALETTE.greedJunk;
        return `<path d="${d}" fill="${color}" opacity="${op}"/>` +
            `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<path d="${hi}" fill="none" class="hl" stroke="${J.alu[100]}" stroke-width="1.1" stroke-linecap="round" opacity="0.8"/>` +
            hpath;
    },

    bulb(kind, x, base) {
        const J = PALETTE.greedJunk, L = J.bulb, f = this.f;
        let out = '';
        if (kind === 'red') {
            // Длинная красная трубка-индикатор, вытащенная из чего-то
            // специального. Посадка: как все лампы — почти торцом к зрителю
            // (83°), и завалена вправо (30°).
            // Трубка — цилиндр по оси (длина укорочена наклоном), верх —
            // полусфера: круг, который с любой стороны круг.
            let h0 = null;
            const lamp = this.leaned(x, base - 2.8, 1.45, 30, () => {
                const h = this.holder(x, base, 6);
                h0 = h;
                let o = h.cup + this.socketBrass(x, h.top, 5.2, 4.6);
                const w = 5.6, t = h.top - this.ax(4.6), len = 24, yt = t - this.ax(len);
                let g = this.cyl(x, t, w, len, L.red, 'none');
                g = g.replace(`fill="${L.red}"`, `fill="${L.red}" opacity="0.82"`);
                // нить — прямая жилка вдоль оси, держатели снизу
                g += `<path d="M${x - 0.8} ${f(t - 1)} L${x - 0.8} ${f(yt + 3)} M${x + 0.8} ${f(t - 1)} L${x + 0.8} ${f(yt + 3)}" stroke="${L.wire}" stroke-width="0.5" opacity="0.8"/>`;
                // Полусфера верха: заливка кругом, а обводка — только верхней
                // половиной. Нижняя половина круга лежит на самой трубке, и её
                // линия резала трубку поперёк, как надетый колпачок.
                // заливка тоже полукругом: полный круг ложился вторым слоем
                // стекла на трубку и темнел пятном
                // Трубка, глядящая на зрителя почти в торец, короче своей
                // толщины — тогда её купол виден целиком, кругом.
                const endOn = this.ax(len) < w;
                const arc = endOn
                    ? `M${x - w / 2} ${f(yt)} A${w / 2} ${w / 2} 0 1 1 ${x + w / 2} ${f(yt)} A${w / 2} ${w / 2} 0 1 1 ${x - w / 2} ${f(yt)}`
                    : `M${x - w / 2} ${f(yt)} A${w / 2} ${w / 2} 0 0 1 ${x + w / 2} ${f(yt)}`;
                g += `<path d="${arc} Z" fill="${L.red}" opacity="0.82"/>` +
                    `<path d="${arc}" fill="none" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
                // контур боков поверх, чтобы стык с полусферой не рвал линию
                g += `<path d="M${x - w / 2} ${f(t)} L${x - w / 2} ${f(yt)} M${x + w / 2} ${f(t)} L${x + w / 2} ${f(yt)}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
                g += `<path d="M${x - 1.5} ${f(t - 1.5)} L${x - 1.5} ${f(yt + 0.5)}" class="hl" stroke="${J.alu[100]}" stroke-width="0.9" stroke-linecap="round" opacity="0.75"/>`;
                g += this.rodH(`M${x} ${f(yt)} L${x} ${f(t)}`, w, 2.6) + this.domeH(x, yt, w / 2, 2.6);
                o += this.T(20, 'glass', g);
                this.markBulb('red', x, (t + yt) / 2, w / 2 + 0.6);
                return o;
            });
            out += h0.disk + lamp;
        } else if (kind === 'pear') {
            // груша: патрон на полке, в нём латунный цоколь с резьбой,
            // горлышко, круглое тело
            // посадка: верхом прямо на зрителя, на 84°, вбок на −25° — вкрутили кое-как
            let h0 = null;
            const lamp = this.leaned(x, base - 2.8, 1.466, -25, () => {
                const h = this.holder(x, base, 7.5);
                h0 = h;
                let o = h.cup + this.socketBrass(x, h.top, 6.6, 5.4);
                const t = h.top - this.ax(5.4), cy = t - this.ax(8.5) - 3, r = 7.4;
                this.markBulb('pear', x, cy, r);
                // Горлышко — только пока оно видно. Когда лампа смотрит на нас,
                // шар колбы накрывает цоколь, и контур горлышка выворачивался
                // внутрь шара тёмной «линзой» — тогда колба просто круг.
                const d = cy + r * 0.8 >= t
                    ? `M${x - r} ${cy} A${r} ${r} 0 1 1 ${x + r} ${cy} A${r} ${r} 0 1 1 ${x - r} ${cy} Z`
                    : `M${x - 3} ${t} C${x - 3.3} ${t - 3} ${x - r} ${cy + 4} ${x - r} ${cy} A${r} ${r} 0 1 1 ${x + r} ${cy} ` +
                      `C${x + r} ${cy + 4} ${x + 3.3} ${t - 3} ${x + 3} ${t} Z`;
                // верх колбы к нам ближе — выше на карте высот
                // Стекло матовое, «молочное»: лампа смотрит на нас почти в упор,
                // и сквозь прозрачное стекло просвечивали кольца патрона и
                // цоколя — каша. Нить видна поверх, слабо, как сквозь мат.
                o += this.T(22, 'glass', this.glassBulb(d, L.clear, 0.88, `M${x - 5} ${cy + 1.6} A5.4 5.4 0 0 1 ${x - 1.6} ${cy - 5.2}`, this.domeH(x, cy, r, 3.4)) +
                    `<g opacity="0.55">${this.filament(x, cy - 0.5, Math.min(t - 1, cy + 3), 3.6)}</g>`);
                return o;
            });
            out += h0.disk + lamp;
        } else if (kind === 'globe') {
            // Маленький янтарный шарик на коротком цоколе. Посадка: как все
            // лампы — на зрителя (85°), чуть влево (−12°). Шар — круг при
            // любом повороте.
            let h0 = null;
            const lamp = this.leaned(x, base - 2.8, 1.48, -12, () => {
                const h = this.holder(x, base, 5.6);
                h0 = h;
                let o = h.cup + this.socketBrass(x, h.top, 4.8, 4);
                const t = h.top - this.ax(4), r = 6, cy = t - this.ax(2.2) - r * 0.85;
                this.markBulb('globe', x, cy, r);
                // короткое горлышко + шар; контур без горлышка, если шар его накрыл
                const d = cy + r * 0.8 >= t
                    ? `M${x - r} ${f(cy)} A${r} ${r} 0 1 1 ${x + r} ${f(cy)} A${r} ${r} 0 1 1 ${x - r} ${f(cy)} Z`
                    : `M${x - 2} ${f(t)} L${x - 2.4} ${f(cy + r * 0.75)} A${r} ${r} 0 1 1 ${x + 2.4} ${f(cy + r * 0.75)} L${x + 2} ${f(t)} Z`;
                o += this.T(19, 'glass', this.filament(x, cy, t - 0.8, 2.4) +
                    this.glassBulb(d, L.amber, 0.72, `M${x - 3.8} ${f(cy + 1)} A4 4 0 0 1 ${x - 0.8} ${f(cy - 3.6)}`, this.domeH(x, cy, r, 3)));
                return o;
            });
            out += h0.disk + lamp;
        } else {
            // «Свеча»: дымчатое стекло, вытянутое пламенем, носик закручен.
            // Посадка: как все — на зрителя (84°), вбок вправо (18°). Почти
            // в торец свеча — это круг пузатой части, из которого вверх
            // выглядывает кончик пламени с завитком носика.
            let h0 = null;
            const lamp = this.leaned(x, base - 2.8, 1.466, 18, () => {
                const h = this.holder(x, base, 6);
                h0 = h;
                let o = h.cup + this.socketBrass(x, h.top, 5.4, 5);
                const t = h.top - this.ax(5), r = 5, cy = t - this.ax(8) - 3, tip = cy - r - this.ax(12) - 0.6;
                this.markBulb('flame', x, cy - 0.6, r);
                const d = `M${x - r} ${f(cy)} C${x - r} ${f(cy - r * 0.9)} ${x - 1.6} ${f(tip + 1.6)} ${x + 0.4} ${f(tip)} ` +
                    `C${x + 1.6} ${f(tip + 1.4)} ${x + r} ${f(cy - r * 0.85)} ${x + r} ${f(cy)} A${r} ${r} 0 0 1 ${x - r} ${f(cy)} Z`;
                // носик-завиток: стеклянный хвостик оттяжки, закрученный набок
                const curl = `<path d="M${x + 0.4} ${f(tip)} C${x + 1.8} ${f(tip - 1)} ${x + 2.8} ${f(tip + 0.2)} ${x + 1.8} ${f(tip + 1.1)}" fill="none" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}" stroke-linecap="round"/>`;
                // Стекло плотнее, чем было (0.62): в торец сквозь прозрачное
                // дымчатое просвечивали кольца патрона — как у груши.
                o += this.T(21, 'glass', this.glassBulb(d, L.smoke, 0.86, `M${x - 3.6} ${f(cy + 0.6)} A3.8 3.8 0 0 1 ${x - 1.2} ${f(cy - 3.4)}`, this.domeH(x, cy, r, 3.2)) +
                    `<g opacity="0.5">${this.filament(x, cy - 0.4, cy + 2.4, 2.6)}</g>` + curl);
                return o;
            });
            out += h0.disk + lamp;
        }
        return out;
    },

    // ---------- СВЕЧЕНИЕ ЛАМП ----------
    // Горящая лампа — живой слой поверх освещённого корпуса: колба налита
    // светом своего стекла, нить в середине добела, вокруг ореол. Ореол
    // кладётся режимом «экран» — он высветляет то, что под ним, а не
    // закрашивает: так дверца и полка вокруг лампы подсвечиваются
    // одной картинкой, без пересчёта шейдера.
    // Центры колб (в координатах поля, с учётом завала лампы) пишет сам
    // рисунок лампы — markBulb; живой слой берёт их отсюда.
    bulbAt: {},
    markBulb(kind, x, y, r) {
        const P = this._pivot || { x, y, roll: 0 }, a = P.roll * Math.PI / 180;
        const dx = x - P.x, dy = y - P.y;
        this.bulbAt[kind] = { x: P.x + dx * Math.cos(a) - dy * Math.sin(a), y: P.y + dx * Math.sin(a) + dy * Math.cos(a), r };
    },
    haloDefs() {
        const G = PALETTE.greedJunk.bulb.lit;
        return '<defs>' + ['pear', 'flame', 'globe', 'red'].map(k =>
            `<radialGradient id="gj-halo-${k}"><stop offset="0" stop-color="${G[k]}" stop-opacity="0.9"/>` +
            `<stop offset="0.3" stop-color="${G[k]}" stop-opacity="0.4"/><stop offset="1" stop-color="${G[k]}" stop-opacity="0"/></radialGradient>`).join('') +
            this.readyLampDefs() + '</defs>';
    },
    // v — накал 0..1
    bulbGlow(kind, v) {
        const b = this.bulbAt[kind], G = PALETTE.greedJunk.bulb.lit, f = this.f;
        if (!b || v < 0.02) return '';
        return `<circle cx="${f(b.x)}" cy="${f(b.y)}" r="${f(b.r * 4.2)}" fill="url(#gj-halo-${kind})" opacity="${f(v)}" style="mix-blend-mode:screen"/>` +
            `<circle cx="${f(b.x)}" cy="${f(b.y)}" r="${f(b.r - 0.6)}" fill="${G[kind]}" opacity="${f(0.85 * v)}"/>` +
            `<circle cx="${f(b.x)}" cy="${f(b.y)}" r="${f(b.r * 0.42)}" fill="${G.core}" opacity="${f(v * v)}"/>`;
    },
});
