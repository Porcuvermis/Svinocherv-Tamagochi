// ================= АППАРАТ АЛЧНОСТИ: МОНЕТОПРИЁМНИК =================
// Продолжение GreedJunk. Монетоприёмник, вырванный из двери общественного
// туалета: хромовая плашка фабричного приёмника, в окошке — заводская синяя
// табличка «WC», цена на ней заклеена жёлтым офисным стикером с ценой от
// руки — «1» и нарисованная монета. Вокруг — обломки двери, к которой он был
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
        // Плашка — как у фабричного монетоприёмника (референсы игрока):
        // хромовая рамка с фаской, лицо в мелкой «молотковой» фактуре, купол
        // с щелью, окошко таблички, лопатка возврата и чашечка внизу.
        const r = 2.4, bv = 2.6;
        const rr = (X, Y, W, H, R) => `M${f(X + R)} ${f(Y)} H${f(X + W - R)} Q${f(X + W)} ${f(Y)} ${f(X + W)} ${f(Y + R)} V${f(Y + H - R)} Q${f(X + W)} ${f(Y + H)} ${f(X + W - R)} ${f(Y + H)} H${f(X + R)} Q${f(X)} ${f(Y + H)} ${f(X)} ${f(Y + H - R)} V${f(Y + R)} Q${f(X)} ${f(Y)} ${f(X + R)} ${f(Y)} Z`;
        let g = `<path d="${rr(x, y, w, h, r)}" fill="${J.tin[300]}" stroke="${ink}" stroke-width="${STROKE.structure}"/>`;
        // фаска: верх и левый скат светлые, низ и правый — тёмные
        const X0 = x + bv, Y0 = y + bv, X1 = x + w - bv, Y1 = y + h - bv;
        g += `<path d="M${x + 1} ${y + 1} L${x + w - 1} ${y + 1} L${X1} ${Y0} L${X0} ${Y0} Z" fill="${J.tin[100]}"/>` +
            `<path d="M${x + 1} ${y + 1} L${X0} ${Y0} L${X0} ${Y1} L${x + 1} ${y + h - 1} Z" fill="${J.tin[100]}" opacity="0.7"/>` +
            `<path d="M${x + w - 1} ${y + 1} L${x + w - 1} ${y + h - 1} L${X1} ${Y1} L${X1} ${Y0} Z" fill="${J.tin[500]}"/>` +
            `<path d="M${x + 1} ${y + h - 1} L${x + w - 1} ${y + h - 1} L${X1} ${Y1} L${X0} ${Y1} Z" fill="${J.tin[700]}"/>`;
        g += `<rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}" fill="${J.tin[300]}" stroke="${J.tin[500]}" stroke-width="0.4"/>`;
        // молотковая фактура: светлые и тёмные крапинки
        let dots = '';
        for (let i = 0; i < 260; i++) {
            const dx = X0 + 0.5 + rnd() * (X1 - X0 - 1), dy = Y0 + 0.5 + rnd() * (Y1 - Y0 - 1);
            dots += `<circle cx="${f(dx)}" cy="${f(dy)}" r="${f(0.22 + rnd() * 0.2)}" fill="${rnd() < 0.5 ? J.tin[100] : J.tin[500]}"/>`;
        }
        g += `<g opacity="0.75">${dots}</g>`;
        // квадратные гнёзда по углам; в двух — саморезы в ящик, третий
        // заменён гвоздём, четвёртое пустое и разорвано (так выдирали)
        const sq = (qx, qy) => `<rect x="${f(qx - 1.6)}" y="${f(qy - 1.6)}" width="3.2" height="3.2" class="pit" fill="${J.tin[900]}"/>` +
            `<path d="M${f(qx - 1.6)} ${f(qy + 1.6)} H${f(qx + 1.6)} V${f(qy - 1.6)}" stroke="${J.tin[100]}" stroke-width="0.4" fill="none"/>`;
        const cs = [[x + 5.5, y + 5.5], [x + w - 5.5, y + 5.5], [x + 5.5, y + h - 5.5], [x + w - 5.5, y + h - 5.5]];
        cs.slice(1).forEach(([qx, qy]) => { g += sq(qx, qy); });
        g += this.bolt(cs[2][0], cs[2][1], 1.5) + this.bolt(cs[3][0], cs[3][1], 1.5) + this.nail(cs[1][0], cs[1][1]);
        // Четвёртый угол выдран вместе с саморезом: на месте гнезда рваная
        // дыра, сквозь неё видна дверь, края загнуты наружу заусенцами.
        // Было: тёмный квадрат с трещинами — читался битым пикселем.
        {
            const [hx, hy] = cs[0];
            const hd = `M${f(hx - 2)} ${f(hy - 1)} L${f(hx - 0.6)} ${f(hy - 2.2)} L${f(hx + 1.8)} ${f(hy - 1.6)} L${f(hx + 1.2)} ${f(hy + 0.2)} L${f(hx + 2.2)} ${f(hy + 1.6)} L${f(hx - 0.4)} ${f(hy + 2)} L${f(hx - 1.6)} ${f(hy + 1)} Z`;
            g += `<path d="${hd}" fill="${W.doorLo}" stroke="${J.tin[900]}" stroke-width="0.4" stroke-linejoin="round"/>` +
                `<path d="M${f(hx - 0.6)} ${f(hy - 2.2)} l-0.4 -1 M${f(hx + 2.2)} ${f(hy + 1.6)} l1 0.4 M${f(hx - 1.6)} ${f(hy + 1)} l-0.9 0.7" stroke="${J.tin[100]}" stroke-width="0.5" stroke-linecap="round"/>`;
        }
        out += this.T(6, 'polished', g);
        // купол приёма: полированный диск, щель через него сверху вниз
        const dy0 = y + 19, R = 9.5;
        // Хром купола: ступени светлеют к блику сверху-слева и размыты —
        // переход мягкий, как у полированной полусферы. Было: плоский
        // светлый диск с дугами-чёрточками и толстой чёрной щелью.
        const dc = `gj-wc-dome`;
        let c = `<clipPath id="${dc}"><circle cx="${cx}" cy="${dy0}" r="${R}"/></clipPath>` +
            `<filter id="${dc}-b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.3"/></filter>` +
            `<circle cx="${cx + 0.6}" cy="${dy0 + 1}" r="${R + 0.4}" class="fx" fill="${J.hole}" opacity="0.4"/>` +
            `<circle cx="${cx}" cy="${dy0}" r="${R + 0.9}" fill="${J.tin[700]}" stroke="${ink}" stroke-width="${STROKE.structure}"/>` +
            `<g clip-path="url(#${dc})"><circle cx="${cx}" cy="${dy0}" r="${R}" fill="${J.tin[500]}"/>` +
            `<g filter="url(#${dc}-b)"><circle cx="${cx - 1}" cy="${dy0 - 1}" r="${R * 0.82}" fill="${J.tin[300]}"/>` +
            `<circle cx="${cx - 2.6}" cy="${dy0 - 2.8}" r="${R * 0.42}" fill="${J.tin[100]}"/>` +
            `<circle cx="${cx + 4.5}" cy="${dy0 + 5}" r="${R * 0.4}" fill="${J.tin[700]}" opacity="0.6"/></g></g>` +
            `<circle cx="${cx}" cy="${dy0}" r="${R}" fill="none" stroke="${J.tin[100]}" stroke-width="0.4" opacity="0.6"/>` +
            this.domeH(cx, dy0, R, 2) +
            // щель: узкая, с фаской — тёмная полоса и светлая кромка справа
            `<rect x="${cx - 0.85}" y="${dy0 - R * 0.72}" width="1.7" height="${R * 1.44}" rx="0.85" class="pit" fill="${J.hole}"/>` +
            `<path d="M${cx + 1.15} ${dy0 - R * 0.66} V${dy0 + R * 0.66}" class="hl" stroke="${J.tin[100]}" stroke-width="0.45" stroke-linecap="round"/>` +
            `<path d="M${cx - 1.2} ${dy0 - R * 0.66} V${dy0 + R * 0.66}" stroke="${J.tin[700]}" stroke-width="0.45" stroke-linecap="round"/>`;
        out += this.T(8, 'polished', c);
        // окошко таблички: чёрная пластиковая рамка, внутри — заводская синяя
        // табличка с «WC»; цену справа заклеили стикером
        const ly = y + 32, lw = 34, lh = 11;
        let l = `<rect x="${cx - lw / 2}" y="${ly}" width="${lw}" height="${lh}" rx="1.2" fill="${W.bezel}" stroke="${ink}" stroke-width="${STROKE.detail}"/>` +
            `<rect x="${cx - lw / 2 + 1.4}" y="${ly + 1.4}" width="${lw - 2.8}" height="${lh - 2.8}" fill="${W.label}"/>` +
            `<path d="M${cx - lw / 2 + 1.6} ${ly + 1.8} H${cx + lw / 2 - 1.6}" stroke="${W.labelHi}" stroke-width="0.5"/>`;
        // «WC» — белая заводская печать; эмаль местами стёрлась
        const wx = cx - lw / 2 + 3.4, wy = ly + lh / 2;
        const wd = `M${wx} ${wy - 2.6} L${wx + 1.5} ${wy + 2.6} L${wx + 3} ${wy - 0.8} L${wx + 4.5} ${wy + 2.6} L${wx + 6} ${wy - 2.6}` +
            ` M${wx + 11.4} ${wy - 1.8} A2.9 2.9 0 1 0 ${wx + 11.4} ${wy + 1.8}`;
        l += `<path d="${wd}" fill="none" stroke="${W.labelInk}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
            `<path d="M${wx + 2.4} ${wy + 1.6} l0.5 -0.9" stroke="${W.label}" stroke-width="0.7"/>`;
        out += this.T(7, 'plastic', l);
        out += this.wcSticker(cx + 8.6, ly + lh / 2 + 0.6);
        // лопатка возврата: хромовый язычок наискось
        // лопатка: узкая у оси, к низу раздаётся каплей (как у фабричной)
        const kx = cx + 3.6, ky = y + 49;
        const kd = `M${kx - 1.2} ${ky - 2.4} L${kx + 4} ${ky + 2.6} Q${kx + 8.4} ${ky + 5.4} ${kx + 6.6} ${ky + 8.2} Q${kx + 4.4} ${ky + 9.8} ${kx + 2.2} ${ky + 6.6} L${kx - 2.4} ${ky - 0.6} Q${kx - 2.8} ${ky - 3.2} ${kx - 1.2} ${ky - 2.4} Z`;
        out += this.T(9, 'polished', `<path d="${kd}" class="fx" fill="${J.hole}" opacity="0.4" transform="translate(0.8 1.2)"/>` +
            `<path d="${kd}" fill="${J.tin[300]}" stroke="${ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>` +
            `<path d="M${kx - 1} ${ky - 1.8} L${kx + 4.6} ${ky + 3.6} Q${kx + 6.6} ${ky + 5} ${kx + 6.2} ${ky + 6.8}" class="hl" fill="none" stroke="${J.tin[100]}" stroke-width="0.9" stroke-linecap="round"/>` +
            `<path d="M${kx + 3} ${ky + 7} Q${kx + 4.6} ${ky + 8.8} ${kx + 6.4} ${ky + 7.8}" fill="none" stroke="${J.tin[700]}" stroke-width="0.8"/>` +
            this.rodH(`M${kx - 1.2} ${ky - 1.4} L${kx + 4.4} ${ky + 4.4}`, 3, 1.4) + this.domeH(kx + 5, ky + 6, 2.6, 1.2));
        // Щель возврата и ковш под ней. Ковш — хромовый носик, торчит на
        // игрока: спереди видна его передняя стенка (скруглена книзу), сверху
        // — тёмный зев, куда щель и выходит. Было: белая чашка-ложка.
        const ry = y + 46, sx = cx - 3.2;
        out += this.T(6, 'steel', `<rect x="${sx - 1.4}" y="${ry}" width="2.8" height="12.6" rx="1.2" class="pit" fill="${J.hole}"/>` +
            `<path d="M${sx + 1.7} ${ry + 0.8} V${ry + 12}" class="hl" stroke="${J.tin[100]}" stroke-width="0.4"/>`);
        // ковш сверху открыт: внутри хромовое дно (светлее), щель выходит в
        // его заднюю стенку; спереди — невысокий бортик со скруглённым низом
        const ty = y + 58, cw = 12, chh = 7;
        const inner = `M${sx - cw / 2} ${ty + 2.4} L${sx - 2} ${ty - 1} H${sx + 2} L${sx + cw / 2} ${ty + 2.4} Z`;
        const front = `M${sx - cw / 2} ${ty + 2.4} H${sx + cw / 2} V${ty + chh - 2.6} Q${sx + cw / 2} ${ty + chh} ${sx + cw / 2 - 3} ${ty + chh} H${sx - cw / 2 + 3} Q${sx - cw / 2} ${ty + chh} ${sx - cw / 2} ${ty + chh - 2.6} Z`;
        out += this.T(10, 'polished', `<path d="${front}" class="fx" fill="${J.hole}" opacity="0.45" transform="translate(0.9 1.6)"/>` +
            `<path d="${inner}" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>` +
            `<path d="M${sx - 1.4} ${ty - 0.8} H${sx + 1.4} L${sx + 1} ${ty + 1.2} H${sx - 1} Z" fill="${J.hole}"/>` +
            `<path d="M${sx - cw / 2 + 1.6} ${ty + 2} L${sx - 1.6} ${ty - 0.4}" class="hl" stroke="${J.tin[100]}" stroke-width="0.6"/>` +
            `<path d="${front}" fill="${J.tin[300]}" stroke="${ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>` +
            `<path d="M${sx - cw / 2 + 1.4} ${ty + 3.4} V${ty + chh - 2.2}" class="hl" stroke="${J.tin[100]}" stroke-width="1.2" stroke-linecap="round"/>` +
            `<path d="M${sx + cw / 2 - 1.2} ${ty + 3.4} V${ty + chh - 2.4}" stroke="${J.tin[500]}" stroke-width="1.1" stroke-linecap="round"/>` +
            `<path d="M${sx - cw / 2 + 0.4} ${ty + 2.7} H${sx + cw / 2 - 0.4}" class="hl" stroke="${J.tin[100]}" stroke-width="0.5"/>` +
            this.rodH(`M${sx - 3} ${ty + 4.6} H${sx + 3}`, 5, 2));
        return out;
    },

    // Жёлтый офисный стикер, наклеен косо, нижний угол отклеился и загнулся.
    // Цена от руки маркером: «1» и монетка — тем же почерком, что тряпка.
    wcSticker(cx, cy) {
        const J = PALETTE.greedJunk, W = J.reel.wc, f = this.f, ink = J.reel.rag.marker;
        const rnd = this.rng(4242), sw = 17, sh = 12, x = cx - sw / 2, y = cy - sh / 2;
        const sq = `M${x} ${y} H${x + sw} V${y + sh - 4} L${x + sw - 4} ${y + sh} H${x} Z`;
        let g = `<path d="${sq}" class="fx" fill="${J.hole}" opacity="0.25" transform="translate(0.6 0.9)"/>` +
            `<path d="${sq}" fill="${W.sticker}" stroke="${W.stickerLo}" stroke-width="0.4"/>` +
            // клеевая полоса сверху — чуть темнее
            `<rect x="${x}" y="${y}" width="${sw}" height="2.6" fill="${W.stickerLo}" opacity="0.25"/>` +
            // загнутый уголок: изнанка светлее, тень под ним
            `<path d="M${x + sw} ${y + sh - 4} L${x + sw - 4} ${y + sh} L${x + sw - 3.4} ${y + sh - 3.4} Z" fill="${W.stickerHi}" stroke="${W.stickerLo}" stroke-width="0.4"/>`;
        // «1»: носик и палка
        const one = this.handPath([[x + 2.6, y + 4.6], [x + 4.4, y + 3]], rnd, false, 0.15) + ' ' +
            this.handPath([[x + 4.4, y + 3], [x + 4.2, y + 9.6]], rnd, false, 0.15);
        // монета — в ракурсе, с ребром: плоский кружок рядом с «1» читался
        // как «10». Ребро снизу и насечки на нём делают её монетой.
        const mx = x + 11, my = y + 5.4;
        const coin = this.handOval(mx, my, 3.6, 2.3, rnd, 8) + ' ' +
            this.handPath([[mx - 3.6, my], [mx - 3.5, my + 1.5], [mx - 2, my + 3.2], [mx, my + 3.8], [mx + 2, my + 3.2], [mx + 3.5, my + 1.5], [mx + 3.6, my]], rnd, false, 0.1) + ' ' +
            [-2.1, -0.7, 0.7, 2.1].map(dx => this.handPath([[mx + dx, my + 2.4 - Math.abs(dx) * 0.2], [mx + dx, my + 3.5 - Math.abs(dx) * 0.3]], rnd, false, 0.04)).join(' ') + ' ' +
            this.handOval(mx, my, 1.8, 1.1, rnd, 6);
        g += `<path d="${one} ${coin}" fill="none" stroke="${ink}" stroke-width="0.75" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
        return this.T(7.5, 'paper', `<g transform="rotate(-7 ${f(cx)} ${f(cy)})">${g}</g>`);
    }
});
