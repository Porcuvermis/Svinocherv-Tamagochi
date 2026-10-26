// ================= АППАРАТ АЛЧНОСТИ: МОНЕТОПРИЁМНИК =================
// Продолжение GreedJunk. Монетный замок, вырванный из двери общественного
// туалета: стальная плашка с заводским «WC» сверху, щелью под монету и
// окошком цены внизу, заклеенным жёлтым офисным стикером с ценой от руки —
// «1» и нарисованная монета. Вокруг — обломки двери, к которой он был
// привинчен; к ящику прикручен чем попало. Сверху в него уходит трос от
// кулисы рычага — два органа управления связаны одним проводом.
//
// «WC» — третье исключение из правила «ни одного слова в холсте»,
// объявлено игроком (CLAUDE.md, инвариант 9): это заводская штамповка,
// часть вещи, а не подпись.
Object.assign(GreedJunk, {
    wcSlot() {
        const J = PALETTE.greedJunk, W = J.reel.wc, f = this.f, B = this.SLOTS.wc, ink = PALETTE.ink;
        const rnd = this.rng(377);
        const x = B.x, y = B.y, w = B.w, h = B.h, cx = x + w / 2;
        let out = '';
        // обломки двери: рваный лист ламината шире плашки, торец — ДСП двери
        let d = '';
        const n = 22;
        for (let i = 0; i < n; i++) {
            const a = i / n * Math.PI * 2;
            const rx = w / 2 + 5 + rnd() * 7, ry = h / 2 + 4 + rnd() * 6;   // лоскуты двери торчат из-под плашки
            const k = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) * w / h ? 1 / Math.abs(Math.cos(a)) : (h / w) / Math.abs(Math.sin(a));
            const r = Math.min(k, 1.25);
            d += (i ? ' L' : 'M') + f(cx + Math.cos(a) * rx * r * 0.82) + ' ' + f(y + h / 2 + Math.sin(a) * ry * r * 0.82);
        }
        d += ' Z';
        // слева обломки срезаны по краю доски с тряпкой — на неё не лезут
        out += `<clipPath id="gj-wc-door"><rect x="${x - 2}" y="${y - 20}" width="${w + 30}" height="${h + 40}"/></clipPath>`;
        out += `<g clip-path="url(#gj-wc-door)"><path d="${d}" class="fx" fill="${J.hole}" opacity="0.35" transform="translate(1.2 1.8)"/>`;
        out += this.T(4, 'plastic', `<path d="${d}" fill="${W.doorEdge}" stroke="${ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>` +
            `<path d="${d}" fill="${W.door}" transform="translate(${f(cx * 0.04)} ${f((y + h / 2) * 0.04)}) scale(0.96)"/>` +
            // пятна и царапины двери
            `<path d="M${x + w + 1} ${y + 10} l3 3 M${x + w + 1} ${y + h - 12} l4 4" stroke="${W.doorLo}" stroke-width="0.6"/>`) + '</g>';
        // стальная плашка замка
        const r = 3;
        const plate = `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;
        let g = `<path d="${plate}" fill="${J.tin[300]}" stroke="${ink}" stroke-width="${STROKE.structure}"/>`;
        // шлифовка: тонкие продольные риски
        let brush = '';
        for (let i = 0; i < 26; i++) {
            const yy = y + 2 + rnd() * (h - 4), x0 = x + 1.5 + rnd() * 8;
            brush += `M${f(x0)} ${f(yy)} L${f(Math.min(x + w - 1.5, x0 + 10 + rnd() * 24))} ${f(yy)} `;
        }
        g += `<path d="${brush}" stroke="${J.tin[100]}" stroke-width="0.25" opacity="0.6"/>`;
        g += `<path d="M${x + 2} ${y + 1.2} H${x + w - 2}" class="hl" stroke="${J.tin[100]}" stroke-width="0.8"/>`;
        g += `<path d="M${x + 1.4} ${y + h - 1} H${x + w - 1.4}" stroke="${J.tin[700]}" stroke-width="0.6" opacity="0.7"/>`;
        // верхний левый угол отогнут — замок выламывали
        g += `<path d="M${x} ${y + 9} L${x + 7} ${y} L${x + 1.5} ${y} Q${x} ${y} ${x} ${y + 1.5} Z" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.detail}"/>`;
        // WC — выдавлено штампом и залито чёрной эмалью, эмаль местами
        // стёрлась. Было: только выдавлено, металл по металлу — не читалось.
        const wy = y + 12, wd = `M${cx - 12} ${wy - 4.5} L${cx - 9.6} ${wy + 4.5} L${cx - 7.2} ${wy - 1.5} L${cx - 4.8} ${wy + 4.5} L${cx - 2.4} ${wy - 4.5}` +
            ` M${cx + 8.6} ${wy - 3} A4.8 4.8 0 1 0 ${cx + 8.6} ${wy + 3}`;
        g += this.rodH(wd, 2.8, 0.9);
        g += `<path d="${wd}" fill="none" class="hl" stroke="${J.tin[100]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" transform="translate(0.5 0.6)"/>`;
        g += `<path d="${wd}" fill="none" stroke="${J.tin[900]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
        g += `<path d="M${cx - 9.2} ${wy + 2.6} l0.8 -1.6 M${cx + 3.9} ${wy - 1.4} l0.9 0.6" stroke="${J.tin[500]}" stroke-width="0.9" stroke-linecap="round"/>`;
        // крепёж: два самореза в ящик, вместо третьего — гвоздь загнут, у
        // четвёртого дыра пустая и разорвана (так и выдирали)
        g += this.bolt(x + 4.5, y + h - 4.5, 1.6) + this.bolt(x + w - 4.5, y + h - 4.5, 1.6);
        g += `<path d="M${x + w - 6} ${y + 4.2} q2 -1.5 3.5 0.4" fill="none" stroke="${J.tin[900]}" stroke-width="1"/>` + this.nail(x + w - 6, y + 4.2);
        g += `<path d="M${x + 3} ${y + 7.6} q0.6 -1.6 1.8 -0.2 l0.4 2 q-1.2 1 -2 -0.4 Z" class="pit" fill="${J.hole}"/>`;
        out += this.T(6, 'steel', g);
        // гнездо щели: выпуклая рамка, в ней узкая щель под монету
        const sy = y + 22, sw = 14, sh = 22;
        let s = `<rect x="${cx - sw / 2 + 0.6}" y="${sy + 1}" width="${sw}" height="${sh}" rx="2.4" class="fx" fill="${J.hole}" opacity="0.4"/>` +
            `<rect x="${cx - sw / 2}" y="${sy}" width="${sw}" height="${sh}" rx="2.4" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.structure}"/>` +
            `<rect x="${cx - sw / 2 + 1.5}" y="${sy + 1.5}" width="${sw - 3}" height="${sh - 3}" rx="1.6" fill="${J.tin[300]}"/>` +
            `<path d="M${cx - sw / 2 + 2} ${sy + 1.2} H${cx + sw / 2 - 2}" class="hl" stroke="${J.tin[100]}" stroke-width="0.7"/>` +
            // щель: тёмная, с фаской
            `<rect x="${cx - 1.4}" y="${sy + 4}" width="2.8" height="${sh - 8}" rx="1.2" class="pit" fill="${J.hole}" stroke="${J.tin[900]}" stroke-width="0.5"/>` +
            `<path d="M${cx + 1.6} ${sy + 4.5} V${sy + sh - 4.5}" class="hl" stroke="${J.tin[100]}" stroke-width="0.4"/>` +
            // засаленно вокруг щели — сюда тыкали монетой
            `<ellipse cx="${cx}" cy="${sy + sh / 2}" rx="5" ry="8" fill="${J.tin[700]}" opacity="0.18"/>`;
        out += this.T(8, 'steel', s);
        // окошко цены: утопленная рамка, заклеенная стикером
        const py = y + h - 20, pw = 26, ph = 12;
        out += this.T(5, 'steel', `<rect x="${cx - pw / 2}" y="${py}" width="${pw}" height="${ph}" rx="1" fill="${J.tin[700]}" stroke="${ink}" stroke-width="${STROKE.detail}"/>`);
        out += this.wcSticker(cx, py + ph / 2);
        return out;
    },

    // Жёлтый офисный стикер, наклеен косо, нижний угол отклеился и загнулся.
    // Цена от руки маркером: «1» и монетка — тем же почерком, что тряпка.
    wcSticker(cx, cy) {
        const J = PALETTE.greedJunk, W = J.reel.wc, f = this.f, ink = J.reel.rag.marker;
        const rnd = this.rng(4242), sw = 25, sh = 15, x = cx - sw / 2, y = cy - sh / 2;
        const sq = `M${x} ${y} H${x + sw} V${y + sh - 5} L${x + sw - 5} ${y + sh} H${x} Z`;
        let g = `<path d="${sq}" class="fx" fill="${J.hole}" opacity="0.25" transform="translate(0.6 0.9)"/>` +
            `<path d="${sq}" fill="${W.sticker}" stroke="${W.stickerLo}" stroke-width="0.4"/>` +
            // клеевая полоса сверху — чуть темнее
            `<rect x="${x}" y="${y}" width="${sw}" height="3.2" fill="${W.stickerLo}" opacity="0.25"/>` +
            // загнутый уголок: изнанка светлее, тень под ним
            `<path d="M${x + sw} ${y + sh - 5} L${x + sw - 5} ${y + sh} L${x + sw - 4.2} ${y + sh - 4.2} Z" fill="${W.stickerHi}" stroke="${W.stickerLo}" stroke-width="0.4"/>`;
        // «1»: носик и палка
        const one = this.handPath([[x + 4.6, y + 6], [x + 6.8, y + 4]], rnd, false, 0.2) + ' ' +
            this.handPath([[x + 6.8, y + 4], [x + 6.6, y + 11.6]], rnd, false, 0.2);
        // монета — в ракурсе, с ребром: плоский кружок рядом с «1» читался
        // как «10». Ребро снизу и насечки на нём делают её монетой.
        const mx = x + 17.5, my = y + 7;
        const coin = this.handOval(mx, my, 4.4, 2.8, rnd, 8) + ' ' +
            this.handPath([[mx - 4.4, my], [mx - 4.3, my + 1.8], [mx - 2.4, my + 3.9], [mx, my + 4.6], [mx + 2.4, my + 3.9], [mx + 4.3, my + 1.8], [mx + 4.4, my]], rnd, false, 0.12) + ' ' +
            [-2.6, -0.9, 0.9, 2.6].map(dx => this.handPath([[mx + dx, my + 2.9 - Math.abs(dx) * 0.2], [mx + dx, my + 4.3 - Math.abs(dx) * 0.3]], rnd, false, 0.05)).join(' ') + ' ' +
            this.handOval(mx, my, 2.2, 1.3, rnd, 6);
        g += `<path d="${one} ${coin}" fill="none" stroke="${ink}" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
        return this.T(6.5, 'paper', `<g transform="rotate(-5 ${f(cx)} ${f(cy)})">${g}</g>`);
    }
});
