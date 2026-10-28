// АППАРАТ АЛЧНОСТИ: КРЕПЁЖ, НАПРАВЛЯЮЩИЕ, ЖГУТЫ
// Продолжение GreedJunk (greed-junk.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после greed-junk.js.
Object.assign(GreedJunk, {

    // ---------- КРЕПЁЖ ----------
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
    // ends — на концах резьбовые сальники-гайки: гофра входит в деталь через
    // них, а не утыкается в неё (без сальников концы читались торчащими
    // из ниоткуда толстыми проводами).
    conduit(pts, ends) {
        const J = PALETTE.greedJunk;
        const d = this.smooth(pts);
        const tail = ends ? this.fitting(pts[0], pts[1]) + this.fitting(pts[pts.length - 1], pts[pts.length - 2]) : '';
        return `<path d="${d}" fill="none" class="fx" stroke="${J.hole}" stroke-width="6" stroke-linecap="round" opacity="0.3" transform="translate(1.2 2)"/>` +
            `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="7" stroke-linecap="round"/>` +
            `<path d="${d}" fill="none" stroke="${J.tin[700]}" stroke-width="5"/>` +
            `<path d="${d}" fill="none" stroke="${J.tin[900]}" stroke-width="5" stroke-dasharray="1.2 1.6"/>` +
            `<path d="${d}" fill="none" class="hl" stroke="${J.tin[300]}" stroke-width="0.8" opacity="0.6" transform="translate(-1 -0.6)"/>` +
            this.rodH(d, 7) + tail;
    },

    // ---------- ШТУЦЕРЫ ГОФР ----------
    // Гофра не может кончаться рядом с деталью: она входит в штуцер,
    // который стоит НА детали. Штуцеры заданы точками вместе с направлением
    // наружу (d), и путь гофры строится от них: выходит из штуцера прямо по
    // его оси, а конец прячется под гайкой. Раньше концы гофр подбирались
    // на глаз и обрывались рядом с пазами.
    //   psuA, psuB — на верхней кромке блока питания, вверх;
    //   hub — на пластине ступицы, наружу вправо-вниз;
    //   brick — в нижней кромке бруска правой розетки, вниз.
    PORTS: {
        psuA:  { x: 158, y: 205, d: [0, -1] },
        psuB:  { x: 186, y: 205, d: [0, -1] },
        hub:   { x: 129, y: 177, d: [0.6, 0.8] },
        brick: { x: 246, y: 191, d: [0, 1] }
    },

    // Точки гофры от штуцера a к штуцеру b через via: конец под гайкой,
    // два отрезка по оси штуцера — чтобы гофра выходила из него прямо.
    feedPath(a, b, via) {
        const at = (p, k) => [p.x + p.d[0] * k, p.y + p.d[1] * k];
        return [at(a, 4), at(a, 10), at(a, 17)].concat(via || [], [at(b, 17), at(b, 10), at(b, 4)]);
    },

    // Штуцер: фланец на детали, шестигранная гайка, короткий носик, из
    // которого выходит гофра. Ось — по d.
    port(P) {
        const J = PALETTE.greedJunk, f = this.f;
        const ang = Math.atan2(P.d[1], P.d[0]) * 180 / Math.PI;
        const g = `<rect x="-1.5" y="-6" width="3" height="12" rx="1.2" fill="${J.tin[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<rect x="1.5" y="-4.8" width="5.5" height="9.6" rx="1" fill="${J.tin[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<line x1="1.5" y1="-1.6" x2="7" y2="-1.6" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>` +
            `<line x1="1.5" y1="1.6" x2="7" y2="1.6" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>` +
            `<rect x="7" y="-3.9" width="3" height="7.8" rx="1" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            '<g class="hpass">' +
            `<rect x="-1.5" y="-6" width="3" height="12" style="--dh:${this.dh(1)}"/>` +
            this.rodH('M1.5 0 L7 0', 9.6, 2.6) + this.rodH('M7 0 L10 0', 7.8, 2) + '</g>';
        return this.T(4, 'steel', `<g transform="translate(${f(P.x)} ${f(P.y)}) rotate(${f(ang)})">${g}</g>`);
    },

    // Сальник: шестигранная гайка на конце гофры, ось — вдоль гофры
    // (от точки p к соседней q).
    fitting(p, q) {
        const J = PALETTE.greedJunk, f = this.f;
        const ang = Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI;
        const g = `<rect x="-1" y="-4.4" width="5.5" height="8.8" rx="1" fill="${J.tin[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<line x1="-1" y1="-1.5" x2="4.5" y2="-1.5" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>` +
            `<line x1="-1" y1="1.5" x2="4.5" y2="1.5" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>` +
            `<rect x="4.5" y="-3.2" width="2.5" height="6.4" rx="0.8" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>` +
            this.rodH('M-1 0 L7 0', 8.8, 1.6);
        return this.T(4, 'steel', `<g transform="translate(${f(p[0])} ${f(p[1])}) rotate(${f(ang)})">${g}</g>`);
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

    // ---------- ПОЛКА-УПОР ПАЧИНКО ----------
    // Железный уголок: вертикальная полка прикручена к стенке, горизонтальная
    // торчит к нам — в анфас от неё видна только передняя кромка, и выступ
    // показывают высоты: кромка много выше стенки, шейдер кладёт от неё
    // длинную тень вниз. Снизу две косынки-подпорки (высота сходит на нет к
    // стенке), сверху на кромке две резиновые подушки — на них встанет короб.
    // Раньше полка была плоской полосой и не читалась выступающей.
    // lift — на сколько выше стенки она прикручена: на щите пачинко полка
    // стоит на щите, а не на стенке ящика.
    shelfAngle(x, y, w, lift = 0) {
        const J = PALETTE.greedJunk, f = this.f;
        let out = '';
        // косынки: треугольник ребром к нам, высота убывает книзу
        [x + 12, x + w - 16].forEach(gx => {
            let g = `<path d="M${f(gx)} ${f(y + 14)} L${f(gx + 4)} ${f(y + 14)} L${f(gx + 4)} ${f(y + 30)} L${f(gx)} ${f(y + 22)} Z" ` +
                `fill="${J.tin[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;
            g += '<g class="hpass">' + [0, 1, 2, 3].map(i =>
                `<rect x="${f(gx)}" y="${f(y + 14 + i * 4)}" width="4" height="4" style="--dh:${this.dh(10 - i * 2.8)}"/>`).join('') + '</g>';
            out += this.T(2 + lift, 'steel', g);
        });
        // вертикальная полка на стенке
        out += this.T(2 + lift, 'steel', `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="10" rx="1" fill="${J.tin[500]}" ` +
            `stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            [0.12, 0.5, 0.88].map(t => this.bolt(x + w * t, y + 5, 1.8)).join(''));
        // передняя кромка горизонтальной полки — высоко над стенкой
        out += this.T(12 + lift, 'steel', `<rect x="${f(x - 1)}" y="${f(y + 9)}" width="${f(w + 2)}" height="6" rx="1.2" fill="${J.tin[500]}" ` +
            `stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<line x1="${f(x + 1)}" y1="${f(y + 10.4)}" x2="${f(x + w - 1)}" y2="${f(y + 10.4)}" class="hl" stroke="${J.tin[100]}" stroke-width="${STROKE.detail}"/>` +
            `<line x1="${f(x + w * 0.2)}" y1="${f(y + 14)}" x2="${f(x + w * 0.6)}" y2="${f(y + 14)}" stroke="${J.rust[500]}" stroke-width="1.4" opacity="0.5"/>`);
        // резиновые подушки на кромке
        [x + w * 0.3, x + w * 0.7].forEach(px => {
            out += this.T(13 + lift, 'rubber', `<rect x="${f(px - 6)}" y="${f(y + 6.5)}" width="12" height="4" rx="2" fill="${J.tin[900]}" ` +
                `stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` + this.rodH(`M${f(px - 4)} ${f(y + 8.5)} L${f(px + 4)} ${f(y + 8.5)}`, 4, 1.2));
        });
        return out;
    },

    // ---------- БЛОК ПИТАНИЯ ----------
    // Старый компьютерный блок питания, прикрученный к стенке: от него вся
    // самодельная проводка. Жестяная коробка со штампованными прорезями,
    // вентилятор под проволочной решёткой, клавишный выключатель и пучок
    // цветных проводов, уходящий в стену. Раньше на этом месте висела
    // «коробка с вентилятором» без назначения — заполняла пустоту.
    psu(x, y) {
        const J = PALETTE.greedJunk, f = this.f;
        const w = 52, h = 40, fx = x + 34, fy = y + 20, fr = 14;
        // оцинковка: холодный светлый металл с узором кристаллов цинка
        let box = this.tin(x, y, w, h, 39, { bolts: false, tilt: 0, dent: false, scratches: 2, z: this.Z.fan, fill: 'gj-zinc' });
        {
            const J2 = J.zinc, rr = this.rng(391);
            for (let i = 0; i < 9; i++) {
                const sx = x + 4 + rr() * (w - 8), sy = y + 4 + rr() * (h - 8), r = 2.5 + rr() * 3.5;
                const pts = [0, 1, 2, 3, 4, 5].map(k => {
                    const a = k * Math.PI / 3 + rr() * 0.6;
                    return f(sx + Math.cos(a) * r * (0.6 + rr() * 0.5)) + ',' + f(sy + Math.sin(a) * r * (0.6 + rr() * 0.5));
                }).join(' ');
                box += `<polygon points="${pts}" fill="${i % 2 ? J2.spangle : J2.lo}" opacity="0.45"/>`;
            }
        }
        // штампованные прорези слева
        for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
            box += `<rect x="${f(x + 4 + c * 6)}" y="${f(y + 6 + r * 7)}" width="4" height="4.4" rx="1" class="pit" fill="${J.hole}"/>`;
        }
        // окно вентилятора: тёмная глубина, лопасти, ступица
        box += `<circle cx="${f(fx)}" cy="${f(fy)}" r="${fr}" class="pit" fill="${J.hole}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;
        let blades = '';
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            const p1 = [fx + Math.cos(a) * 4, fy + Math.sin(a) * 4], p2 = [fx + Math.cos(a + 0.5) * 12, fy + Math.sin(a + 0.5) * 12];
            blades += `<path d="M${f(p1[0])} ${f(p1[1])} Q${f(fx + Math.cos(a + 0.1) * 11)} ${f(fy + Math.sin(a + 0.1) * 11)} ${f(p2[0])} ${f(p2[1])}" ` +
                `fill="none" stroke="${J.tin[700]}" stroke-width="3" stroke-linecap="round"/>`;
        }
        box += `<g class="pit">${blades}</g>`;
        box += `<circle cx="${f(fx)}" cy="${f(fy)}" r="4" fill="${J.tin[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;
        // проволочная решётка: кольца и спицы — круглая проволока
        let grill = '';
        [5, 9, 13].forEach(r => {
            const d = `M${f(fx - r)} ${f(fy)} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`;
            grill += `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="2"/>` +
                `<path d="${d}" fill="none" stroke="${J.tin[300]}" stroke-width="1"/>` + this.rodH(d, 2, 0.8);
        });
        [0, 1, 2, 3].forEach(i => {
            const a = i * Math.PI / 2 + Math.PI / 4;
            const d = `M${f(fx + Math.cos(a) * 3)} ${f(fy + Math.sin(a) * 3)} L${f(fx + Math.cos(a) * 13)} ${f(fy + Math.sin(a) * 13)}`;
            grill += `<path d="${d}" stroke="${PALETTE.ink}" stroke-width="2"/><path d="${d}" stroke="${J.tin[300]}" stroke-width="1"/>` + this.rodH(d, 2, 0.8);
        });
        // крепёж коробки к стенке
        const screws = [[x + 3.5, y + 3.5], [x + w - 3.5, y + 3.5], [x + 3.5, y + h - 3.5], [x + w - 3.5, y + h - 3.5]]
            .map(([sx, sy]) => this.bolt(sx, sy, 1.6)).join('');
        // клавишный выключатель: чёрная клавиша, нажатая половина ниже
        const sw = this.T(10, 'plastic', `<rect x="${f(x + 15)}" y="${f(y + 31)}" width="7" height="6" rx="1" fill="${J.tin[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<line x1="${f(x + 15.5)}" y1="${f(y + 34)}" x2="${f(x + 21.5)}" y2="${f(y + 34)}" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>` +
            `<g class="hpass"><rect x="${f(x + 15)}" y="${f(y + 31)}" width="7" height="3" style="--dh:${this.dh(1.5)}"/></g>`);
        // пучок проводов вниз в дыру в стене
        let wires = '';
        [J.paint.yellow, J.paint.red, J.tin[900], J.paint.orange].forEach((c, i) => {
            const d = this.smooth([[x + 6 + i * 2.4, y + h], [x + 5 + i * 2, y + h + 6], [x + 2 + i * 1.6, y + h + 12]]);
            wires += `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="3" stroke-linecap="round"/>` +
                `<path d="${d}" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>` + this.rodH(d, 2.6);
        });
        return this.T(3, 'plastic', wires) + this.hole(x + 6, y + h + 13, 4.4) +
            this.T(7, 'zinc', box + screws) + this.T(9, 'steel', grill) + sw;
    },

    // ---------- ЛАТКА ИЗ КРЫШКИ БАНКИ ----------
    // Доска треснула вокруг сучка; дыру закрыли крышкой от консервной банки
    // на четырёх гвоздях. Крышка устроена как настоящая и строго по центру:
    // закатанный обод по краю (самый высокий), канавка за ним, плоское поле
    // с двумя кольцевыми рёбрами жёсткости, ровная серединка. Короткий
    // рваный участок — след консервного ножа. Трещина в доске расходится
    // из-под краёв — видно, что крышка что-то закрывает.
    // Было: смещённая «вмятина» и красная дуга этикетки — читались съехавшим
    // рисунком, а не крышкой.
    canLid(cx, cy) {
        const J = PALETTE.greedJunk, f = this.f;
        const r = 15;
        let crack = '';
        [[-0.4, 22], [2.7, 18], [1.5, 14]].forEach(([a, len]) => {
            const p0 = [cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1)];
            const p1 = [cx + Math.cos(a + 0.12) * (r + len * 0.5), cy + Math.sin(a + 0.12) * (r + len * 0.5)];
            const p2 = [cx + Math.cos(a - 0.05) * (r + len), cy + Math.sin(a - 0.05) * (r + len)];
            crack += `<path d="M${f(p0[0])} ${f(p0[1])} L${f(p1[0])} ${f(p1[1])} L${f(p2[0])} ${f(p2[1])}" fill="none" ` +
                `class="pit" stroke="${J.hole}" stroke-width="1.2" stroke-linecap="round"/>`;
        });
        // контур: круг, на коротком участке — рваный след ножа
        const pts = [];
        for (let i = 0; i < 48; i++) {
            const a = (i / 48) * Math.PI * 2;
            const cut = a > 3.9 && a < 4.4;
            const rr = cut ? r + (i % 2 ? 0.7 : -0.5) : r;
            pts.push(f(cx + Math.cos(a) * rr) + ' ' + f(cy + Math.sin(a) * rr));
        }
        const rim = 'M' + pts.join(' L') + ' Z';
        const ring = (rad, col, w) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${rad}" fill="none" stroke="${col}" stroke-width="${w}"/>`;
        let lid = `<path d="${rim}" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>`;
        lid += ring(r - 2.4, J.tin[700], STROKE.detail);      // канавка за ободом
        lid += ring(r - 6, J.tin[500], STROKE.hairline);      // рёбра жёсткости
        lid += ring(r - 9, J.tin[500], STROKE.hairline);
        // профиль высот: обод, канавка, поле, два ребра, серединка
        const c = (rad, u) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${rad}" style="--dh:${this.dh(u)}"/>`;
        const rib = (rad) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${rad}" fill="none" stroke="${PALETTE.ink}" stroke-width="1.6" style="--dh:${this.dh(1)}"/>`;
        lid += '<g class="hpass">' +
            `<path d="${rim}" style="--dh:${this.dh(1.6)}"/>` + c(r - 1.6, 0.9) + c(r - 3, 0.1) + c(r - 3.8, 0.5) +
            rib(r - 6) + rib(r - 9) + '</g>';
        const nails = [0.6, 2.2, 3.6, 5.2].map(a => this.nail(cx + Math.cos(a) * (r - 4.5), cy + Math.sin(a) * (r - 4.5))).join('');
        return this.T(0, 'pine', crack) + this.T(1, 'steel', lid + nails);
    },

    // ---------- КАРАНДАШНАЯ РАЗМЕТКА ----------
    // Пока игры не куплены, крепления — просто железо. Разметка на стенке
    // объясняет его: строитель обвёл, где встанет колесо (круг в настоящий
    // размер, с засечками по сторонам света) и где повиснет короб пачинко
    // (прямоугольник с перехлёстом линий в углах — так размечают плотники).
    // Линии от руки: два чуть разъехавшихся прохода карандаша. Слов нет —
    // только линии (инвариант 9). Графит лежит на дереве: на карте высот
    // его нет, свет его не лепит.
    pencilMarks() {
        const J = PALETTE.greedJunk, f = this.f, S = this.SLOTS;
        const rnd = this.rng(977);
        const line = (d, op) => `<path d="${d}" fill="none" stroke="${J.pencil}" stroke-width="${STROKE.structure}" ` +
            `stroke-linecap="round" opacity="${op}"/>`;
        let out = '', ring = '';
        // круг колеса: дуги с разрывами, два прохода. Колесо стоит — круг
        // и засечки не рисуются (под колесом и щитом их не видно, а засечка
        // справа торчала из-за щита); случайные числа тянутся всё равно,
        // чтобы разметка пачинко не сдвигалась.
        const w = S.wheel, wheel = this.wheelShown && this.wheelShown();
        [[0, 0.9], [1, 0.55]].forEach(([k, op]) => {
            const r = w.r + k * 1.2, dx = k * 0.8, dy = -k * 0.6;
            let a0 = 0.1 + rnd() * 0.2;
            while (a0 < Math.PI * 2) {
                const a1 = Math.min(Math.PI * 2, a0 + 0.9 + rnd() * 0.8);
                const p0 = [w.cx + dx + Math.cos(a0) * r, w.cy + dy + Math.sin(a0) * r];
                const p1 = [w.cx + dx + Math.cos(a1) * r, w.cy + dy + Math.sin(a1) * r];
                ring += line(`M${f(p0[0])} ${f(p0[1])} A${f(r)} ${f(r)} 0 0 1 ${f(p1[0])} ${f(p1[1])}`, op);
                a0 = a1 + 0.05 + rnd() * 0.08;
            }
        });
        // засечки по сторонам света
        [0, 1, 2, 3].forEach(i => {
            const a = i * Math.PI / 2;
            const p0 = [w.cx + Math.cos(a) * (w.r - 5), w.cy + Math.sin(a) * (w.r - 5)];
            const p1 = [w.cx + Math.cos(a) * (w.r + 5), w.cy + Math.sin(a) * (w.r + 5)];
            ring += line(`M${f(p0[0])} ${f(p0[1])} L${f(p1[0])} ${f(p1[1])}`, 0.75);
        });
        if (!wheel) out += ring;
        // Разметка короба: стоят короб и колесо — её не видно, не рисуется
        // (как круг колеса). Один короб её не прячет: левая линия и уголки
        // выходят за него на 8 единиц — их закрывает только щит колеса.
        // Случайные числа тянутся всё равно.
        const box = this.pachinkoShown && this.pachinkoShown();
        let mark = '';
        // прямоугольник короба: стороны с перехлёстом в углах
        const p = S.pachinko, o = 5;
        // габарит короба — снаружи рельсов: между рельсами линии бы под ними и пропали
        const x0 = p.x - 3, x1 = p.x + p.w - 9, y0 = p.y + 3, y1 = p.y + p.h - 40;
        [[x0 - o, y0, x1 + o, y0], [x0 - o, y1, x1 + o, y1], [x0, y0 - o, x0, y1 + o], [x1, y0 - o, x1, y1 + o]].forEach(([ax, ay, bx, by]) => {
            const j = () => (rnd() - 0.5) * 1.2;
            mark += line(`M${f(ax + j())} ${f(ay + j())} L${f(bx + j())} ${f(by + j())}`, 0.7);
        });
        // галочки в углах прямоугольника — «здесь угол короба»
        [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].forEach(([cx, cy, sx, sy]) => {
            mark += line(`M${f(cx + sx * 7)} ${f(cy + sy * 2)} L${f(cx + sx * 2)} ${f(cy + sy * 2)} L${f(cx + sx * 2)} ${f(cy + sy * 7)}`, 0.6);
        });
        // плотницкий крест «здесь» в свободном месте между рельсами
        const kx = p.x + 26, ky = p.y + 10, kw = 40, kh = 32;
        mark += line(`M${f(kx)} ${f(ky)} L${f(kx + kw)} ${f(ky + kh)}`, 0.8) +
            line(`M${f(kx + kw)} ${f(ky)} L${f(kx)} ${f(ky + kh)}`, 0.8);
        // разметка короба — в его пространстве (PACH_AT): короб на аппарате крупнее
        if (!(box && wheel)) out += this.pachG(mark);
        return this.T(0, 'graphite', out);
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
    // box: false — жгут выходит не из распаечной коробки, а из втулки в
    // детали (провода мотора колеса из пластины ступицы).
    harness(x, y, len, seed, box) {
        const J = PALETTE.greedJunk, f = this.f;
        const rnd = this.rng(seed);
        let out = box === false ? this.grommet(x, y - 1.5) : this.junctionBox(x, y - 12, seed);
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

    // Резиновая втулка в металле: через неё провода выходят из детали.
    grommet(x, y) {
        const J = PALETTE.greedJunk, f = this.f;
        return this.T(1, 'rubber', `<ellipse cx="${f(x)}" cy="${f(y)}" rx="5" ry="4.4" fill="${J.wood[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<ellipse cx="${f(x)}" cy="${f(y)}" rx="2.8" ry="2.4" class="pit" fill="${J.hole}"/>` + this.domeH(x, y, 5, 1));
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
