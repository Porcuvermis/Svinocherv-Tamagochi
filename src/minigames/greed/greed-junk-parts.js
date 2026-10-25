// АППАРАТ АЛЧНОСТИ: КРЕПЁЖ, НАПРАВЛЯЮЩИЕ, ЖГУТЫ
// Продолжение GreedJunk (greed-junk.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после greed-junk.js.
Object.assign(GreedJunk, {

    // ---------- КРЕПЁЖ ----------
    // Розетка питания «мама»: жестяная коробка, в ней чёрная колодка со
    // срезанными углами и три гнезда. Стоит в странных местах нарочно —
    // её ставили туда, где было удобно сверлить, а не красиво.
    socket(x, y, rot) {
        const J = PALETTE.greedJunk, f = this.f;
        const w = 26, h = 22;
        return `<g transform="rotate(${rot || 0} ${f(x + w / 2)} ${f(y + h / 2)})">` +
            this.tin(x, y, w, h, Math.round(x * 3 + y), { bolts: false, scratches: 0, tilt: 0, z: this.Z.box }) +
            `<path d="M${f(x + 7)} ${f(y + 4)} h12 l3 3 v8 l-3 3 h-12 l-3 -3 v-8 z" class="pit" fill="${J.hole}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<rect x="${f(x + 8.5)}" y="${f(y + 9)}" width="2" height="4" fill="${J.tin[300]}"/>` +
            `<rect x="${f(x + 15.5)}" y="${f(y + 9)}" width="2" height="4" fill="${J.tin[300]}"/>` +
            `<rect x="${f(x + 12)}" y="${f(y + 6)}" width="2" height="2.5" fill="${J.tin[300]}"/>` +
            this.bolt(x + 2.8, y + h / 2, 1.6) + this.bolt(x + w - 2.8, y + h / 2, 1.6) +
            `</g>`;
    },

    // Бытовая накладная розетка: пожелтевшая пластмасса, круглый корпус,
    // в углублении два гнезда и металлические усики заземления. Повёрнута
    // как прикрутили — под углом: ровно стоящие две дырки с винтом между
    // ними читались рожицей.
    socketHome(cx, cy) {
        const J = PALETTE.greedJunk, f = this.f;
        const z = this.Z.rail;
        let g = `<circle cx="${f(z * 0.45)}" cy="${f(z * 0.7)}" r="13" class="fx" fill="${J.hole}" opacity="0.32"/>`;
        g += `<circle r="13" fill="url(#gj-yellowed)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        g += `<path d="M-10 -5 a11 11 0 0 1 9 -6" fill="none" class="hl" stroke="${J.plastic.hi}" stroke-width="${STROKE.detail}" opacity="0.9"/>`;
        // углубление: тёмный верх (стенка закрыта от света), светлая нижняя кромка
        g += `<circle r="8" fill="${J.plastic.lo}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;
        g += `<path d="M-7.6 1.5 a8 8 0 0 0 15.2 0" fill="none" class="hl" stroke="${J.plastic.hi}" stroke-width="${STROKE.detail}" opacity="0.8"/>`;
        g += `<circle cx="-3.4" cy="0" r="1.5" class="pit" fill="${J.hole}"/><circle cx="3.4" cy="0" r="1.5" class="pit" fill="${J.hole}"/>`;
        // усики заземления сверху и снизу
        g += `<rect x="-1.6" y="-8" width="3.2" height="2" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>` +
            `<rect x="-1.6" y="6" width="3.2" height="2" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>`;
        // крепёжный винт на ободе и трещина в пластмассе
        g += `<path d="M9 7 l2.6 2.8" stroke="${J.plastic.lo}" stroke-width="${STROKE.hairline}"/>`;
        let out = `<g transform="translate(${cx} ${cy}) rotate(-24)">${g}</g>`;
        out += this.bolt(cx - 10.5, cy - 2.5, 1.5);
        return out;
    },

    // Промышленное гнездо в железной коробке: коробка прикручена к
    // сосновому бруску (своя толщина — своя тень), в лицевой стенке
    // колодка со срезанными углами и три гнезда.
    socketPanel(x, y) {
        const J = PALETTE.greedJunk, f = this.f;
        let out = this.material('pine', x - 4, y - 5, 36, 34, 731, false);
        out += `<path d="${this.wob(x - 4, y - 5, 36, 34, 731, 1)}" fill="none" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        out = `<path d="${this.wob(x - 1, y, 36, 34, 731, 1)}" class="fx" fill="${J.hole}" opacity="0.35"/>` + out;
        out += this.ironNail(x - 1, y - 2) + this.ironNail(x + 29, y + 26);
        const block = out;
        out = '';
        out += this.tin(x, y, 28, 24, 732, { bolts: false, scratches: 1, tilt: 0, z: this.Z.box });
        out += `<path d="M${f(x + 7)} ${f(y + 4)} h14 l3 3 v10 l-3 3 h-14 l-3 -3 v-10 z" class="pit" fill="${J.hole}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;
        out += `<path d="M${f(x + 5)} ${f(y + 16)} l2 3 h14 l2 -3" fill="none" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>`;
        [[x + 9.5, y + 10.5], [x + 17.5, y + 10.5], [x + 13.5, y + 6.5]].forEach(([hx, hy], i) => {
            out += `<rect x="${f(hx)}" y="${f(hy)}" width="2" height="${i === 2 ? 2.5 : 4}" fill="${J.tin[300]}"/>`;
        });
        out += this.bolt(x + 3, y + 12, 1.6) + this.bolt(x + 25, y + 12, 1.6);
        // брусок ниже коробки гнезда — свои высоты и материалы
        return this.T(4, 'pine', block) + this.T(9, 'steel', out);
    },

    // Гофра — рифлёная трубка, в которой идёт провод: тёмный шланг с
    // поперечными рёбрами.
    conduit(pts) {
        const J = PALETTE.greedJunk;
        const d = this.smooth(pts);
        return `<path d="${d}" fill="none" class="fx" stroke="${J.hole}" stroke-width="6" stroke-linecap="round" opacity="0.3" transform="translate(1.2 2)"/>` +
            `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="7" stroke-linecap="round"/>` +
            `<path d="${d}" fill="none" stroke="${J.tin[700]}" stroke-width="5"/>` +
            `<path d="${d}" fill="none" stroke="${J.tin[900]}" stroke-width="5" stroke-dasharray="1.2 1.6"/>` +
            `<path d="${d}" fill="none" class="hl" stroke="${J.tin[300]}" stroke-width="0.8" opacity="0.6" transform="translate(-1 -0.6)"/>` +
            this.rodH(d, 7);
    },

    // Шпилька с резьбой, торчащая из фланца: на неё наденут крепление.
    stud(x, y) {
        const J = PALETTE.greedJunk, f = this.f;
        const z = this.Z.shelf;
        return `<ellipse cx="${f(x + z * 0.35)}" cy="${f(y + z * 0.55)}" rx="4" ry="5" class="fx" fill="${J.hole}" opacity="0.4" ` +
            `transform="rotate(-33 ${f(x + z * 0.35)} ${f(y + z * 0.55)})"/>` +
            `<circle cx="${f(x)}" cy="${f(y)}" r="3.6" fill="url(#gj-tin)" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<circle cx="${f(x)}" cy="${f(y)}" r="2" fill="none" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>` +
            `<circle cx="${f(x - 1)}" cy="${f(y - 1)}" r="0.9" fill="${J.tin[100]}"/>`;
    },

    // ---------- НАПРАВЛЯЮЩАЯ ПАЧИНКО ----------
    // Алюминиевый швеллер пазом к нам: в него сверху задвинут короб
    // пачинко. Анфас показывает паз глубоким: левая стенка паза в тени
    // (закрыта от света сверху-слева), правая освещена, дно тёмное. Сверху
    // губы отогнуты раструбом — чтобы короб попадал в пазы. Держат рельс три
    // одноухие скобы на шурупах (ухо наружу). Алюминий белёсый в пятнах
    // окисла — не ржавеет, этим и отличается от железного уголка рядом.
    // Раньше это были серые полосы с лесенкой зарубок — линейки.
    rail(x, y, w, h, side, seed) {
        const J = PALETTE.greedJunk, f = this.f;
        const A = J.alu;
        const rnd = this.rng(seed);
        const z = this.Z.rail;
        let out = '';
        const flare = 10;
        const body = `M${f(x - 3)} ${f(y)} L${f(x + w + 3)} ${f(y)} L${f(x + w)} ${f(y + flare)} L${f(x + w)} ${f(y + h)} ` +
            `L${f(x)} ${f(y + h)} L${f(x)} ${f(y + flare)} Z`;
        out += `<path d="${body}" class="fx" fill="${J.hole}" opacity="0.34" transform="translate(${f(z * 0.45)} ${f(z * 0.7)})"/>`;
        out += `<path d="${body}" fill="url(#gj-alu)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>`;
        // паз
        const sx = x + 3.6, sw = w - 7.2;
        const slot = `M${f(sx - 2)} ${f(y + 1.5)} L${f(sx + sw + 2)} ${f(y + 1.5)} L${f(sx + sw)} ${f(y + flare)} L${f(sx + sw)} ${f(y + h - 3)} ` +
            `L${f(sx)} ${f(y + h - 3)} L${f(sx)} ${f(y + flare)} Z`;
        out += `<path d="${slot}" class="pit" fill="${J.hole}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;
        out += `<rect x="${f(sx)}" y="${f(y + flare)}" width="2" height="${f(h - flare - 3)}" fill="${A[700]}" opacity="0.5"/>`;
        out += `<line x1="${f(sx + sw - 0.6)}" y1="${f(y + flare)}" x2="${f(sx + sw - 0.6)}" y2="${f(y + h - 3)}" stroke="${A[300]}" stroke-width="${STROKE.detail}" opacity="0.7"/>`;
        // губы: освещённая кромка слева, тёмная справа
        out += `<line x1="${f(x + 1)}" y1="${f(y + flare)}" x2="${f(x + 1)}" y2="${f(y + h - 1)}" class="hl" stroke="${A[100]}" stroke-width="${STROKE.detail}"/>`;
        out += `<line x1="${f(x + w - 1)}" y1="${f(y + flare)}" x2="${f(x + w - 1)}" y2="${f(y + h - 1)}" stroke="${A[700]}" stroke-width="${STROKE.detail}"/>`;
        // окисел — тонкие белёсые потёки вдоль губ (пятнами он читался брызгами)
        for (let i = 0; i < 4; i++) {
            const ox = (i % 2 ? x + w - 2.2 : x + 2.2), oy = y + flare + 8 + rnd() * (h - flare - 40);
            out += `<line x1="${f(ox)}" y1="${f(oy)}" x2="${f(ox)}" y2="${f(oy + 14 + rnd() * 18)}" stroke="${A.oxide}" stroke-width="0.9" opacity="0.45" stroke-linecap="round"/>`;
        }
        // шурупы в дне паза: рельс прикручен к стенке сквозь стенку швеллера
        for (let yy = y + flare + 26; yy < y + h - 14; yy += 46) {
            out += `<circle cx="${f(x + w / 2)}" cy="${f(yy)}" r="2.1" fill="${A[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>` +
                `<line x1="${f(x + w / 2 - 1.3)}" y1="${f(yy - 0.8)}" x2="${f(x + w / 2 + 1.3)}" y2="${f(yy + 0.8)}" stroke="${A[700]}" stroke-width="${STROKE.hairline}"/>`;
        }
        // раструб: завальцованная кромка и стопорный палец поперёк паза
        out += `<path d="M${f(x - 2.6)} ${f(y + 0.8)} L${f(x + w + 2.6)} ${f(y + 0.8)}" class="hl" stroke="${A[100]}" stroke-width="${STROKE.structure}" stroke-linecap="round"/>`;
        out += `<rect x="${f(x - 1)}" y="${f(y + flare + 3)}" width="${f(w + 2)}" height="3" rx="1.5" fill="${J.tin[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<circle cx="${f(x - 1)}" cy="${f(y + flare + 4.5)}" r="2" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>` +
            `<circle cx="${f(x + w + 1)}" cy="${f(y + flare + 4.5)}" r="2" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>`;
        // одноухие скобы
        [0.22, 0.55, 0.86].forEach((t, i) => {
            const yy = y + flare + (h - flare) * t + (rnd() - 0.5) * 4;
            const ex = side < 0 ? x - 9 : x + w + 1;
            // края скобы темнее середины: она огибает рельс, а не лежит плашмя
            out += this.T(6, 'steel', `<rect x="${f(x - 1.5)}" y="${f(yy - 2.5)}" width="${f(w + 3)}" height="5" rx="1.6" fill="url(#gj-tin-dark)" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                `<rect x="${f(x - 1.5)}" y="${f(yy - 2.5)}" width="${f(w + 3)}" height="5" rx="1.6" class="fx" fill="url(#gj-wrap)"/>` +
                `<line x1="${f(x)}" y1="${f(yy - 1.4)}" x2="${f(x + w)}" y2="${f(yy - 1.4)}" class="hl" stroke="${J.tin[100]}" stroke-width="${STROKE.hairline}" opacity="0.8"/>` +
                `<rect x="${f(ex)}" y="${f(yy - 3)}" width="8" height="6" rx="2" fill="url(#gj-tin-dark)" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                this.bolt(ex + 4, yy, 1.6));
        });
        return out;
    },

    // ---------- ПОДВЕС ПАЧИНКО ----------
    // Пластина между рельсами — не «пластина с дырами», а подвес: рельсы
    // только направляют короб, а вес его держат два крюка, приваренных к
    // толстой пластине, загибом чашкой вверх. Внизу два продолговатых паза под
    // стопорные винты — короб прижмут, когда повесят. Пазы, а не круглые
    // дыры: круглые парами складывались в рожицу.
    //
    // Рисуется уже под свет шейдером: цвет ровный, объём — высотами
    // (пластина 2, отогнутая кромка 3, площадка 4, крюк 7).
    hanger(x, y, w, h) {
        const J = PALETTE.greedJunk, f = this.f;
        let out = this.T(2, 'steel', this.tin(x, y, w, h, 44, { bolts: false, tilt: 0, dent: false, scratches: 2 }));
        // отогнутая верхняя кромка — пластину гнули в тисках
        out += this.T(3, 'steel', `<rect x="${f(x - 1)}" y="${f(y - 1)}" width="${f(w + 2)}" height="6" rx="1.5" ` +
            `fill="${J.tin[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<line x1="${f(x + 1)}" y1="${f(y + 0.6)}" x2="${f(x + w - 1)}" y2="${f(y + 0.6)}" class="hl" stroke="${J.tin[100]}" stroke-width="${STROKE.detail}"/>`);
        // крепёж пластины к стенке — по углам под кромкой и внизу
        out += this.T(2, 'steel', this.bolt(x + 4.5, y + 10, 1.8) + this.bolt(x + w - 4.5, y + 10, 1.8) +
            this.bolt(x + 4.5, y + h - 5, 1.8) + this.bolt(x + w - 4.5, y + h - 5, 1.8));
        // Крюки — J-образные, в плоскости пластины: сверху приваренная
        // площадка, стержень вниз, внизу загиб чашкой вверх — на неё садится
        // короб. Торчащие прямо на нас крюки в анфас читались тумблерами.
        [x + w * 0.2, x + w * 0.6].forEach(hx => {
            const top = y + 13, bot = y + 34, cup = 6;
            const d = `M${f(hx)} ${f(top)} L${f(hx)} ${f(bot - 4)} Q${f(hx)} ${f(bot + 3)} ${f(hx + cup / 2)} ${f(bot + 3)} ` +
                `Q${f(hx + cup)} ${f(bot + 3)} ${f(hx + cup)} ${f(bot - 5)}`;
            out += this.T(7, 'steel',
                `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>` +
                `<path d="${d}" fill="none" stroke="${J.tin[500]}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>` +
                `<path d="${d}" fill="none" class="hl" stroke="${J.tin[100]}" stroke-width="1" stroke-linecap="round" transform="translate(-0.9 -0.6)"/>` +
                this.rodH(d, 6));
            // площадка со сварным швом
            out += this.T(4, 'steel', `<rect x="${f(hx - 4.5)}" y="${f(top - 5)}" width="9" height="7" rx="1.5" ` +
                `fill="${J.tin[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                [-3, -1, 1, 3].map(dx => `<circle cx="${f(hx + dx)}" cy="${f(top + 2.4)}" r="0.9" fill="${J.tin[900]}"/>`).join(''));
        });
        // пазы под стопорные винты
        [x + w * 0.3, x + w * 0.7].forEach(sx => {
            out += this.T(2, 'steel', `<rect x="${f(sx - 1.8)}" y="${f(y + h - 22)}" width="3.6" height="11" rx="1.8" ` +
                `class="pit" fill="${J.hole}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`);
        });
        return out;
    },

    // Отверстие под болт: тёмная дырка с ободком — «здесь что-то прикрутят».
    hole(x, y, r) {
        const J = PALETTE.greedJunk, f = this.f;
        return `<circle cx="${f(x)}" cy="${f(y)}" r="${r || 2.4}" class="pit" fill="${J.hole}" stroke="${J.wood[900]}" stroke-width="${STROKE.detail}"/>` +
            `<path d="M${f(x - (r || 2.4))} ${f(y + 0.6)} a${r || 2.4} ${r || 2.4} 0 0 0 ${f((r || 2.4) * 2)} 0" fill="none" class="hl" stroke="${J.wood[100]}" stroke-width="${STROKE.hairline}" opacity="0.6"/>`;
    },

    // Гладкая кривая через точки (Катмулл — Ром → кубические Безье).
    // Провод — не ломаная: он гнётся плавно, без изломов.
    smooth(pts) {
        const f = this.f;
        let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
            d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ` +
                `${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
        }
        return d;
    },

    // ---------- ЖГУТ ПРОВОДОВ ----------
    // Провода к будущим играм: выходят из круглой распаечной коробки через
    // сальник, первые сантиметры стянуты пластиковой стяжкой и скручены
    // между собой, дальше жилы расходятся под своим весом, каждая своей
    // длины. Концы разные — кто-то уже готовил подключение: кольцевая
    // клемма, колпачок-скрутка, голая медь, конец загнут и примотан.
    // Раньше жилы торчали из ниоткуда, висели коротко и параллельно, а
    // концы были оранжевыми точками.
    harness(x, y, len, seed) {
        const J = PALETTE.greedJunk, f = this.f;
        const rnd = this.rng(seed);
        let out = this.junctionBox(x, y - 12, seed);
        const colors = [J.paint.red, J.paint.blue, J.paint.yellow, J.tin[900]];
        const ends = ['ring', 'cap', 'bare', 'loop'];
        const top = y, tie = y + len * 0.28;
        // концы жил вразнобой
        const wires = colors.map((c, i) => {
            const side = (i - 1.5);
            const ex = x + side * (5 + rnd() * 4) + (rnd() - 0.5) * 6;
            const ey = y + len * (0.75 + rnd() * 0.45);
            return { c, end: ends[(i + seed) % 4], pts: [
                [x + side * 1.3, top],
                // скрутка: жилы меняются местами, пока стянуты
                [x + Math.sin(i * 1.7) * 1.6, top + len * 0.14],
                [x + side * 1.2, tie],
                [x + side * 3 + (rnd() - 0.5) * 3, y + len * 0.5],
                [ex, ey]
            ] };
        });
        // сначала тени всех жил, потом сами жилы — тень не ложится на соседку
        wires.forEach(w => {
            out += `<path d="${this.smooth(w.pts)}" fill="none" class="fx" stroke="${J.hole}" stroke-width="3" stroke-linecap="round" opacity="0.3" transform="translate(1 1.6)"/>`;
        });
        wires.forEach(w => {
            const d = this.smooth(w.pts);
            out += this.rodH(d, 3.2) + `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="3.4" stroke-linecap="round"/>` +
                `<path d="${d}" fill="none" stroke="${w.c}" stroke-width="2" stroke-linecap="round"/>` +
                `<path d="${d}" fill="none" class="hl" stroke="${J.plastic.hi}" stroke-width="0.5" stroke-linecap="round" opacity="0.55" transform="translate(-0.5 -0.3)"/>`;
            out += this.wireEnd(w.end, w.pts[w.pts.length - 1], w.pts[w.pts.length - 2], w.c);
        });
        // стяжка: тонкий хомут поперёк жгута, замок сбоку, обрезанный хвост
        out += `<rect x="${f(x - 6)}" y="${f(tie - 1.4)}" width="12" height="2.8" rx="1.2" fill="${J.plastic.base}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<rect x="${f(x + 5)}" y="${f(tie - 2.6)}" width="4" height="5.2" rx="0.8" fill="${J.plastic.lo}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<line x1="${f(x + 9)}" y1="${f(tie)}" x2="${f(x + 12)}" y2="${f(tie + 1.2)}" stroke="${J.plastic.base}" stroke-width="1.6" stroke-linecap="square"/>`;
        return out;
    },

    // Круглая серая распаечная коробка: крышка на винте, выпуклый
    // обод, снизу сальник, из которого выходит жгут.
    junctionBox(x, y, seed) {
        const J = PALETTE.greedJunk, f = this.f;
        let out = `<circle cx="${f(x + 1.6)}" cy="${f(y + 2.6)}" r="10" class="fx" fill="${J.hole}" opacity="0.35"/>`;
        out += `<circle cx="${f(x)}" cy="${f(y)}" r="10" fill="url(#gj-plastic)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        out += this.domeH(x, y, 10, 2.5);
        out += `<circle cx="${f(x)}" cy="${f(y)}" r="7" fill="none" stroke="${J.plastic.lo}" stroke-width="${STROKE.detail}"/>`;
        out += `<path d="M${f(x - 6)} ${f(y - 3)} a7 7 0 0 1 8 -4" fill="none" class="hl" stroke="${J.plastic.hi}" stroke-width="${STROKE.detail}"/>`;
        // Один винт по центру и литые рёбра крышки. Два винта рядом
        // складывались с сальником в рожицу.
        out += `<path d="M${f(x - 6.5)} ${f(y + 3.5)} L${f(x + 6.5)} ${f(y - 3.5)}" stroke="${J.plastic.lo}" stroke-width="${STROKE.detail}" opacity="0.8"/>`;
        out += this.bolt(x, y, 1.8);
        // сальник снизу
        out += `<rect x="${f(x - 4)}" y="${f(y + 8.5)}" width="8" height="5" rx="1.2" fill="${J.plastic.lo}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;
        return out;
    },

    // Конец жилы. dir — откуда жила пришла, чтобы клемма и колпачок
    // смотрели вдоль провода, а не все строго вниз.
    wireEnd(kind, e, prev, color) {
        const J = PALETTE.greedJunk, f = this.f;
        const ang = Math.atan2(e[1] - prev[1], e[0] - prev[0]) * 180 / Math.PI;
        const g = (inner) => `<g transform="translate(${f(e[0])} ${f(e[1])}) rotate(${f(ang)})">${inner}</g>`;
        if (kind === 'ring') {
            // кольцевая клемма: гильза и плоское кольцо
            return g(`<rect x="-1" y="-2" width="5" height="4" rx="1" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                `<circle cx="7" cy="0" r="3.2" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                `<circle cx="7" cy="0" r="1.3" class="pit" fill="${J.hole}"/>`);
        }
        if (kind === 'cap') {
            // колпачок-скрутка: оранжевый конус
            return g(`<path d="M-1 -2.6 L6 -1.6 Q8 0 6 1.6 L-1 2.6 Z" fill="${J.paint.orange}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                `<line x1="1.5" y1="-2" x2="1.5" y2="2" stroke="${J.rust[700]}" stroke-width="${STROKE.hairline}"/>`);
        }
        if (kind === 'bare') {
            // голая медь: изоляция снята, жилки чуть растопырены
            return g(`<path d="M0 -0.8 l5 -1.2 M0 0 l5.4 0.2 M0 0.8 l4.6 1.4" stroke="${J.copper}" stroke-width="0.9" stroke-linecap="round"/>`);
        }
        // загнут обратно и примотан изолентой
        return g(`<path d="M0 0 q4 0 4 -3 q0 -3 -3 -3" fill="none" stroke="${PALETTE.ink}" stroke-width="3.4" stroke-linecap="round"/>` +
            `<path d="M0 0 q4 0 4 -3 q0 -3 -3 -3" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>` +
            `<rect x="-2" y="-4.5" width="4" height="6" rx="1" fill="${J.tin[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>`);
    },
});
