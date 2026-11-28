// ================= ТЩЕСЛАВИЕ: ВИД ИНТЕРФЕЙСА ГРИМЁРКИ =================
// Ячейки наряда, кнопка выхода, окно покупок — рисунок, без логики (логика —
// pride-store.js). Всё из одной гримёрки: латунь, орех, бархат, лампы. Кнопка
// здесь — не плашка с надписью, а вещь той же комнаты: табличка с лампочками,
// билет, плечики, бирка на нитке (решение игрока: «не сухие кнопочки»).
//
// Ни одной буквы (инвариант 9): значки, цвет и цифры.
const PRIDE_UI = {

    f(n) { return Math.round(n * 10) / 10; },

    // Общие градиенты интерфейса — один раз на холст (в <defs> верхнего svg).
    defs() {
        const D = PALETTE.dressing;
        return `
        <linearGradient id="pru-brass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${D.brass[100]}"/><stop offset="0.45" stop-color="${D.brass[300]}"/>
            <stop offset="1" stop-color="${D.brass[700]}"/></linearGradient>
        <linearGradient id="pru-velvet" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${D.velvet[500]}"/><stop offset="1" stop-color="${D.velvet[700]}"/></linearGradient>
        <linearGradient id="pru-pad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${D.walnut[700]}"/><stop offset="1" stop-color="${D.walnut[900]}"/></linearGradient>
        <linearGradient id="pru-panel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${D.walnut[700]}"/><stop offset="1" stop-color="${D.shade[900]}"/></linearGradient>
        <linearGradient id="pru-ticket" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${D.ivory[300]}"/><stop offset="1" stop-color="${D.ivory[700]}"/></linearGradient>
        <radialGradient id="pru-bulb" cx="0.42" cy="0.4" r="0.62"><stop offset="0" stop-color="${D.bulb.core}"/>
            <stop offset="0.55" stop-color="${D.bulb.body}"/><stop offset="1" stop-color="${D.bulb.glow}"/></radialGradient>
        <radialGradient id="pru-halo"><stop offset="0" stop-color="${D.bulb.glow}" stop-opacity="0.5"/>
            <stop offset="1" stop-color="${D.bulb.glow}" stop-opacity="0"/></radialGradient>
        <radialGradient id="pru-spot" cx="0.5" cy="0" r="1"><stop offset="0" stop-color="${D.bulb.body}" stop-opacity="0.55"/>
            <stop offset="1" stop-color="${D.bulb.body}" stop-opacity="0"/></radialGradient>`;
    },

    // Лампочка: колба и ореол. on=false — погасшая колба (ступень не куплена).
    bulb(x, y, r, on) {
        const D = PALETTE.dressing, f = this.f;
        if (!on) return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${D.walnut[900]}" stroke="${D.brass[500]}" stroke-width="${STROKE.detail}"/>` +
                        `<circle cx="${f(x - r * 0.3)}" cy="${f(y - r * 0.3)}" r="${f(r * 0.28)}" fill="${D.ivory[700]}" opacity="0.35"/>`;
        return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 2.6)}" fill="url(#pru-halo)"/>` +
               `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="url(#pru-bulb)"/>`;
    },

    // ---------- ПОЦЕЛУЙ: ЗНАЧОК ВАЛЮТЫ ----------
    // Свой рисунок, а не эмодзи: эмодзи на айфоне и в прогоне выглядят
    // по-разному, а значок валюты стоит рядом с каждой ценой.
    lips(x, y, s) {
        const D = PALETTE.dressing, k = s || 1, f = this.f;
        return `<g transform="translate(${f(x)},${f(y)}) scale(${k})">
            <path d="M-11 0 Q-6 -8 0 -3.6 Q6 -8 11 0 Q6 8.5 0 8.5 Q-6 8.5 -11 0 Z" fill="${PALETTE.redCarpet.kiss[500]}"
                  stroke="${PALETTE.redCarpet.kiss[700]}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>
            <path d="M-10 0.2 Q0 3 10 0.2" fill="none" stroke="${PALETTE.redCarpet.kiss[700]}" stroke-width="${STROKE.detail}"/>
            <path d="M-5 -3.4 Q-2.5 -4.6 -1 -2.6" fill="none" stroke="${D.ivory[300]}" stroke-width="1.1" opacity="0.7"/></g>`;
    },

    // Кошелёк: латунная плашка, поцелуй и число.
    purse(x, y, value, w) {
        const D = PALETTE.dressing, W = w || 112, H = 34;
        return `<g class="pr-purse" transform="translate(${x},${y})">
            <rect x="0" y="0" width="${W}" height="${H}" rx="${H / 2}" fill="url(#pru-pad)" stroke="url(#pru-brass)" stroke-width="2"/>
            ${this.lips(22, H / 2, 0.95)}
            <text x="${W - 14}" y="${H / 2 + 6.5}" text-anchor="end" font-size="18" font-weight="700"
                  fill="${D.ivory[300]}" style="font-variant-numeric:tabular-nums">${value}</text></g>`;
    },

    // ---------- ЯЧЕЙКА НАРЯДА ----------
    // Бархатная подушечка в латунной оправе, как у шкатулки. Пустая — силуэт
    // гнезда пунктиром; надетая — сама вещь. open — список этой ячейки
    // раскрыт: оправа горит.
    cell(s, inner, state) {
        const D = PALETTE.dressing, f = this.f;
        const open = state === 'open';
        return `<rect x="0" y="0" width="${s}" height="${s}" rx="${f(s * 0.21)}" fill="url(#pru-pad)"
                      stroke="${open ? D.bulb.body : 'url(#pru-brass)'}" stroke-width="${open ? 3 : 2.2}"/>
            <rect x="${f(s * 0.07)}" y="${f(s * 0.07)}" width="${f(s * 0.86)}" height="${f(s * 0.86)}" rx="${f(s * 0.15)}"
                  fill="none" stroke="${D.brass[500]}" stroke-width="${STROKE.hairline}" opacity="0.7"/>
            <rect x="${f(s * 0.12)}" y="${f(s * 0.1)}" width="${f(s * 0.76)}" height="${f(s * 0.06)}" rx="${f(s * 0.03)}"
                  fill="${D.ivory[300]}" opacity="0.12"/>
            ${inner}`;
    },
    // Силуэт гнезда пунктиром — по сетке 24×24 из PRIDE_WARDROBE.slots.
    ghost(shape, s) {
        const D = PALETTE.dressing, k = s * 0.55 / 24, o = (s - 24 * k) / 2;
        return `<g transform="translate(${this.f(o)},${this.f(o)}) scale(${k.toFixed(3)})" fill="none" stroke="${D.brass[300]}"
                   stroke-width="${(1.5 / (k * 1.6)).toFixed(2)}" stroke-dasharray="2.2 1.8" stroke-linejoin="round" opacity="0.75">
                   <path d="${shape}"/></g>`;
    },
    // Галочка «надето»: латунная медалька в углу.
    check(x, y, r) {
        const D = PALETTE.dressing, f = this.f;
        return `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="url(#pru-brass)" stroke="${D.brass[900]}" stroke-width="${STROKE.hairline}"/>
            <path d="M${f(x - r * 0.45)} ${f(y)} l${f(r * 0.32)} ${f(r * 0.34)} l${f(r * 0.6)} ${f(-r * 0.66)}" fill="none"
                  stroke="${D.walnut[900]}" stroke-width="${f(r * 0.28)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    },
    // «Ничего»: пустое гнездо, перечёркнутое.
    nothing(shape, s) {
        const D = PALETTE.dressing, f = this.f;
        return this.ghost(shape, s) +
            `<path d="M${f(s * 0.24)} ${f(s * 0.76)} L${f(s * 0.76)} ${f(s * 0.24)}" stroke="${D.brass[300]}" stroke-width="2.4"
                   stroke-linecap="round" opacity="0.8"/>`;
    },

    // ---------- КНОПКА ВЫХОДА ----------
    // Табличка над дверью на сцену: латунь, бархат, ряд горящих ламп по
    // верху и треугольник «вперёд». Лампы — то же, что вокруг зеркала: одна
    // комната, один язык.
    startPlaque(w, h) {
        const D = PALETTE.dressing, f = this.f;
        let bulbs = '';
        const n = Math.max(5, Math.round(w / 20));
        for (let i = 0; i < n; i++) bulbs += this.bulb(-w / 2 + h * 0.4 + i * (w - h * 0.8) / (n - 1), -h / 2, 3.4, true);
        return `<g id="pr-start-btn" class="pr-start-btn">
            <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="url(#pru-brass)"
                  stroke="${D.brass[900]}" stroke-width="${STROKE.detail}"/>
            <rect x="${-w / 2 + 6}" y="${-h / 2 + 6}" width="${w - 12}" height="${h - 12}" rx="${h / 2 - 6}" fill="url(#pru-velvet)"
                  stroke="${D.brass[700]}" stroke-width="${STROKE.hairline}"/>
            <rect x="${-w / 2 + 14}" y="${-h / 2 + 9}" width="${w - 28}" height="4" rx="2" fill="${D.ivory[300]}" opacity="0.15"/>
            <path d="M${f(-h * 0.2)} ${f(-h * 0.26)} L${f(h * 0.32)} 0 L${f(-h * 0.2)} ${f(h * 0.26)} Z" fill="${D.bulb.body}"
                  stroke="${D.bulb.glow}" stroke-width="${STROKE.hairline}" stroke-linejoin="round"/>
            ${bulbs}</g>`;
    },

    // ---------- ОКНО ПОКУПОК ----------
    panel(x, y, w, h) {
        const D = PALETTE.dressing;
        return `<rect class="pr-store-back" x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="url(#pru-panel)"
                      stroke="url(#pru-brass)" stroke-width="3"/>
            <rect x="${x + 7}" y="${y + 7}" width="${w - 14}" height="${h - 14}" rx="18" fill="none"
                  stroke="${D.brass[500]}" stroke-width="${STROKE.hairline}" opacity="0.6"/>`;
    },
    close(cx, cy, r) {
        const D = PALETTE.dressing;
        return `<g class="pr-store-close" transform="translate(${cx},${cy})">
            <circle r="${r + 8}" fill="transparent"/>
            <circle r="${r}" fill="url(#pru-pad)" stroke="url(#pru-brass)" stroke-width="2.4"/>
            <path d="M${-r * 0.36} ${-r * 0.36} L${r * 0.36} ${r * 0.36} M${r * 0.36} ${-r * 0.36} L${-r * 0.36} ${r * 0.36}"
                  stroke="${D.brass[100]}" stroke-width="3" stroke-linecap="round"/></g>`;
    },

    // Вкладка-табличка. Активная обведена горящими лампами, как зеркало
    // гримёрки; погасшая — тёмная, лампы потушены.
    tab(key, x, y, w, h, icon, on) {
        const D = PALETTE.dressing;
        let bulbs = '';
        const n = 6;
        for (let i = 0; i < n; i++) {
            const bx = x + 16 + i * (w - 32) / (n - 1);
            bulbs += this.bulb(bx, y, 3.2, on) + this.bulb(bx, y + h, 3.2, on);
        }
        return `<g class="pr-tab${on ? ' on' : ''}" data-tab="${key}">
            <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${on ? 'url(#pru-velvet)' : 'url(#pru-pad)'}"
                  stroke="${on ? D.brass[300] : D.brass[700]}" stroke-width="${on ? 2.6 : 1.6}"/>
            <rect x="${x + 6}" y="${y + 6}" width="${w - 12}" height="${h - 12}" rx="11" fill="none"
                  stroke="${D.brass[500]}" stroke-width="${STROKE.hairline}" opacity="${on ? 0.7 : 0.35}"/>
            <g opacity="${on ? 1 : 0.55}">${icon}</g>${bulbs}</g>`;
    },
    // Звезда в лучах прожектора — прокачка шоу.
    icoStar(cx, cy) {
        const D = PALETTE.dressing;
        return `<path d="M${cx - 34} ${cy + 20} L${cx - 14} ${cy - 6} M${cx + 34} ${cy + 20} L${cx + 14} ${cy - 6}"
                      stroke="${D.bulb.body}" stroke-width="2.4" stroke-linecap="round" opacity="0.7"/>
            <path d="M${cx} ${cy - 17} l5.1 10.4 11.4 1.7 -8.3 8 2 11.3 -10.2 -5.4 -10.2 5.4 2 -11.3 -8.3 -8 11.4 -1.7 Z"
                  fill="url(#pru-brass)" stroke="${D.brass[900]}" stroke-width="${STROKE.hairline}" stroke-linejoin="round"/>`;
    },
    // Плечики — магазин одежды.
    icoHanger(cx, cy) {
        const D = PALETTE.dressing;
        return `<path d="M${cx} ${cy - 6} q0 -9 7 -9 q7 0 7 7 q0 5 -7 7.5 L${cx - 26} ${cy + 13} q-4 3 0 4 H${cx + 26} q4 -1 0 -4 L${cx} ${cy - 1}"
                      fill="none" stroke="url(#pru-brass)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`;
    },

    // Билет: кнопка покупки. Цена — цифрами, корешок — с поцелуем. Не хватает
    // поцелуев — билет тусклый; линия выкуплена — на билете латунная галочка.
    ticket(x, y, w, h, price, state, cls) {
        const D = PALETTE.dressing, f = this.f, n = h * 0.22;
        const d = `M${x} ${y} H${x + w} V${f(y + h / 2 - n)} a${f(n)} ${f(n)} 0 0 0 0 ${f(n * 2)} V${y + h} H${x}
                   V${f(y + h / 2 + n)} a${f(n)} ${f(n)} 0 0 0 0 ${f(-n * 2)} Z`;
        const stub = h * 0.95;
        const rich = state === 'rich', done = state === 'done';
        const face = done
            ? this.check(x + w / 2, y + h / 2, h * 0.3)
            : this.lips(x + stub / 2, y + h / 2, 0.9) +
              `<text x="${f(x + stub + (w - stub) / 2)}" y="${f(y + h / 2 + 7)}" text-anchor="middle" font-size="20" font-weight="800"
                     fill="${rich ? D.walnut[900] : D.walnut[500]}" style="font-variant-numeric:tabular-nums">${price}</text>`;
        return `<g class="${cls || 'pr-ticket'}${rich ? ' rich' : ''}" opacity="${rich || done ? 1 : 0.62}">
            <path d="${d}" fill="${done ? 'none' : 'url(#pru-ticket)'}" stroke="${done ? D.brass[500] : D.brass[700]}"
                  stroke-width="${done ? 2 : 1.4}" ${done ? 'stroke-dasharray="5 4"' : ''}/>
            ${done ? '' : `<path d="M${f(x + stub)} ${y + 6} V${y + h - 6}" stroke="${D.brass[700]}" stroke-width="1.2" stroke-dasharray="3 3"/>`}
            ${face}</g>`;
    },

    // Ступени — шесть лампочек: купленные горят.
    pips(x, y, n, lvl, step) {
        let s = '';
        for (let i = 0; i < n; i++) s += this.bulb(x + i * step, y, 7, i < lvl);
        return s;
    },

    // Мини-сцена карточки прокачки: тёмная ниша, прожектор сверху, пол.
    stage(x, y, w, h) {
        const D = PALETTE.dressing;
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${D.shade[900]}"
                      stroke="${D.brass[700]}" stroke-width="${STROKE.detail}"/>
            <path d="M${x + w * 0.42} ${y} L${x + w * 0.58} ${y} L${x + w} ${y + h} L${x} ${y + h} Z" fill="url(#pru-spot)"/>
            <ellipse cx="${x + w / 2}" cy="${y + h - 16}" rx="${w * 0.42}" ry="9" fill="${D.walnut[700]}"/>`;
    },

    // ---------- КАРТИНКИ СТУПЕНЕЙ ----------
    // Толпа: силуэты зрителей с фотоаппаратами, сколько ступеней — столько
    // рядов гуще. Рисунок толпы — тот же, что на дорожке (PRIDE_ART.person).
    crowdArt(cx, base, lvl) {
        const rnd = PRIDE_ART.rng(11);
        const n = 2 + lvl;
        // Дальний ряд темнее и мельче, ближний — светлее и крупнее: толпа
        // читается глубиной, а не гребёнкой (как и на дорожке).
        const tones = [PALETTE.dressing.walnut[300], PALETTE.dressing.walnut[500], PALETTE.dressing.walnut[700]];
        const people = [];
        for (let i = 0; i < n; i++) {
            const row = Math.min(2, Math.floor(i / 3));
            people.push({ row, x: cx + ((i % 3) - 1) * 26 + (rnd() - 0.5) * 14 + (row % 2) * 13, y: base - row * 13 });
        }
        return people.reverse().map(p => {
            const k = 0.07 - p.row * 0.009;
            return `<g transform="translate(${this.f(p.x)},${this.f(p.y)}) scale(${k.toFixed(3)})">${PRIDE_ART.person(rnd, tones[p.row])}</g>`;
        }).join('');
    },
    // Машина: та же, что ждёт у начала дорожки (PRIDE_ART.car).
    carArt(cx, base, lvl) {
        // Открытая дверь машины торчит влево — центр кузова сдвинут вправо,
        // чтобы машина целиком стояла в нише.
        return `<g transform="translate(${cx + 12},${base}) scale(0.056)">${PRIDE_ART.car(lvl)}</g>`;
    },
    // Дорожка: ковёр уходит вглубь, с каждой ступенью длиннее, и столбиков
    // с бархатным канатом больше.
    carpetArt(cx, base, lvl, w) {
        const C = PALETTE.redCarpet, D = PALETTE.dressing, f = this.f;
        const len = 30 + lvl * 13, half0 = w * 0.3, half1 = half0 * (1 - len / 140);
        let s = `<path d="M${f(cx - half0)} ${base} L${f(cx - half1)} ${f(base - len)} L${f(cx + half1)} ${f(base - len)} L${f(cx + half0)} ${base} Z"
                       fill="${C.carpet[500]}" stroke="${C.carpet[700]}" stroke-width="${STROKE.hairline}"/>`;
        const posts = Math.max(1, lvl);
        for (let i = 0; i <= posts; i++) {
            const t = i / Math.max(1, posts), y = base - t * len, hw = half0 + (half1 - half0) * t + 6;
            const ph = 15 * (1 - t * 0.5);
            [-1, 1].forEach(sd => {
                s += `<path d="M${f(cx + sd * hw)} ${f(y)} V${f(y - ph)}" stroke="${D.brass[300]}" stroke-width="${f(2.4 - t)}"/>` +
                     `<circle cx="${f(cx + sd * hw)}" cy="${f(y - ph)}" r="${f(2.2 - t * 0.8)}" fill="${D.brass[100]}"/>`;
            });
            if (i > 0) {
                const tp = (i - 1) / Math.max(1, posts), yp = base - tp * len, hwp = half0 + (half1 - half0) * tp + 6;
                const php = 15 * (1 - tp * 0.5);
                [-1, 1].forEach(sd => {
                    s += `<path d="M${f(cx + sd * hwp)} ${f(yp - php * 0.8)} Q${f(cx + sd * (hw + hwp) / 2)} ${f((y + yp) / 2 - ph * 0.3)} ${f(cx + sd * hw)} ${f(y - ph * 0.8)}"
                                fill="none" stroke="${D.velvet[300]}" stroke-width="1.6"/>`;
                });
            }
        }
        return s;
    },
    // Значки того, что меняет линия: шире зона, выше множитель, дольше висит.
    effectIcon(key, x, y) {
        const D = PALETTE.dressing, c = D.ivory[500];
        if (key === 'crowd') return `<g fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="${x}" cy="${y}" r="6"/><path d="M${x - 15} ${y} h5 M${x - 15} ${y} l3 -3 M${x - 15} ${y} l3 3 M${x + 15} ${y} h-5 M${x + 15} ${y} l-3 -3 M${x + 15} ${y} l-3 3"/></g>`;
        if (key === 'car') return `<g fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round">
            <circle cx="${x}" cy="${y}" r="11"/><path d="M${x - 5} ${y - 5} l10 10 M${x + 5} ${y - 5} l-10 10"/></g>`;
        return `<g fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"><circle cx="${x}" cy="${y}" r="11"/>
            <path d="M${x} ${y - 7} V${y} H${x + 6}"/></g>`;
    },

    // ---------- КАТЕГОРИИ МАГАЗИНА: ПЛЕЧИКИ НА ШТАНГЕ ----------
    // Выбранные опущены ниже соседей и горят бархатом.
    hanger(key, cx, top, w, h, shape, on) {
        const D = PALETTE.dressing, f = this.f, dy = on ? 7 : 0;
        const k = Math.min(w, h) * 0.62 / 24;
        return `<g class="pr-hanger${on ? ' on' : ''}" data-cat="${key}">
            <rect x="${f(cx - w / 2)}" y="${top - 12}" width="${w}" height="${h + 20}" fill="transparent"/>
            <path d="M${cx} ${top - 9} q0 -5 4 -5" fill="none" stroke="${D.brass[300]}" stroke-width="1.6" stroke-linecap="round"/>
            <path d="M${f(cx - w / 2 + 2)} ${top + 6 + dy} L${cx} ${top - 9 + dy * 0.3} L${f(cx + w / 2 - 2)} ${top + 6 + dy}"
                  fill="none" stroke="url(#pru-brass)" stroke-width="2.2" stroke-linejoin="round"/>
            <rect x="${f(cx - w / 2)}" y="${top + 6 + dy}" width="${w}" height="${h}" rx="9"
                  fill="${on ? 'url(#pru-velvet)' : 'url(#pru-pad)'}" stroke="${on ? D.brass[100] : D.brass[700]}" stroke-width="${on ? 2.4 : 1.4}"/>
            <g transform="translate(${f(cx - 12 * k)},${f(top + 6 + dy + h / 2 - 12 * k)}) scale(${k.toFixed(3)})" fill="none"
               stroke="${on ? D.bulb.body : D.brass[300]}" stroke-width="${(1.6 / k).toFixed(2)}" stroke-linejoin="round"><path d="${shape}"/></g></g>`;
    },

    // Зеркало примерки: овал в эмалевой раме, лампы по верхней дуге.
    tryMirror(cx, cy, rx, ry) {
        const D = PALETTE.dressing, f = this.f;
        let bulbs = '';
        for (let i = 0; i <= 8; i++) {
            const a = Math.PI * (1 + i / 8);
            bulbs += this.bulb(cx + Math.cos(a) * (rx + 8), cy + Math.sin(a) * (ry + 8), 4, true);
        }
        return `<ellipse cx="${cx}" cy="${cy}" rx="${rx + 13}" ry="${ry + 13}" fill="${D.ivory[500]}" stroke="${D.ivory[700]}" stroke-width="2"/>
            <ellipse cx="${cx}" cy="${cy}" rx="${rx + 4}" ry="${ry + 4}" fill="none" stroke="${D.ivory[700]}" stroke-width="2"/>
            <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${D.paper[500]}"/>
            <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#pru-spot)" opacity="0.6"/>
            <ellipse cx="${cx}" cy="${f(cy + ry * 0.82)}" rx="${f(rx * 0.7)}" ry="${f(ry * 0.12)}" fill="${D.walnut[500]}" opacity="0.5"/>
            ${bulbs}`;
    },
    // Блик стекла поверх червя в зеркале — чтобы он стоял ЗА стеклом.
    tryGlare(cx, cy, rx, ry) {
        const D = PALETTE.dressing, f = this.f;
        return `<path d="M${f(cx - rx * 0.62)} ${f(cy + ry * 0.4)} Q${f(cx - rx * 0.5)} ${f(cy - ry * 0.55)} ${f(cx + rx * 0.2)} ${f(cy - ry * 0.86)}"
                      fill="none" stroke="${D.glass[100]}" stroke-width="5" stroke-linecap="round" opacity="0.32"/>`;
    },

    // Вещь в магазине: подушечка с бархатом и бирка на нитке с ценой.
    itemCell(x, y, s, on, rich, price) {
        const D = PALETTE.dressing, f = this.f;
        const tw = 58, th = 22, tx = x + s - tw + 6, ty = y - 8;
        return `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="16" fill="url(#pru-pad)"
                      stroke="${on ? D.bulb.body : D.brass[700]}" stroke-width="${on ? 3 : 1.5}"/>
            <ellipse cx="${f(x + s / 2)}" cy="${f(y + s - 18)}" rx="${f(s * 0.34)}" ry="6" fill="${D.velvet[500]}" opacity="0.8"/>
            <path d="M${f(x + s - 16)} ${f(y + 14)} Q${f(x + s - 22)} ${f(y + 2)} ${f(tx + 6)} ${f(ty + th / 2)}" fill="none"
                  stroke="${D.brass[300]}" stroke-width="1.2"/>
            <g opacity="${rich ? 1 : 0.6}">
            <path d="M${f(tx)} ${f(ty + th / 2)} L${f(tx + 9)} ${ty} H${f(tx + tw)} V${f(ty + th)} H${f(tx + 9)} Z" fill="url(#pru-ticket)"
                  stroke="${D.brass[700]}" stroke-width="${STROKE.hairline}"/>
            <circle cx="${f(tx + 8)}" cy="${f(ty + th / 2)}" r="2" fill="${D.walnut[700]}"/>
            ${this.lips(tx + 19, ty + th / 2, 0.5)}
            <text x="${f(tx + tw - 5)}" y="${f(ty + th / 2 + 4.6)}" text-anchor="end" font-size="13" font-weight="800"
                  fill="${D.walnut[900]}" style="font-variant-numeric:tabular-nums">${price}</text></g>`;
    }
};

if (typeof window !== 'undefined') window.PRIDE_UI = PRIDE_UI;
