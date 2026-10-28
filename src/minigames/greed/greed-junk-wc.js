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
//
// На аппарате приёмник ЛЕЖИТ НА БОКУ над лотком, щелью вправо — к банке
// (решение игрока, docs/plan/29-greed-layout.md); «WC» читается боком, так
// и задумано. С плашки сняты окошко таблички, лопатка и ковш возврата —
// осталось то, ради чего он здесь: купол со щелью и «WC». На свободное место
// наклеен стикер — уже не боком, а ровно (переклеили). Рисунок плашки — в
// прежних координатах (SLOTS.wc, стоя), на место его ставит WC_AT.
Object.assign(GreedJunk, {
    WC_AT: { ax: 273, ay: 530, x: 180, y: 525, s: 1.25, rot: 90 },
    // точка плашки (стоя) → поле аппарата
    wcPt(x, y) {
        const A = this.WC_AT, a = A.rot * Math.PI / 180, dx = (x - A.ax) * A.s, dy = (y - A.ay) * A.s;
        return [A.x + dx * Math.cos(a) - dy * Math.sin(a), A.y + dx * Math.sin(a) + dy * Math.cos(a)];
    },
    wcG(inner) {
        const A = this.WC_AT;
        return `<g transform="translate(${A.x} ${A.y}) rotate(${A.rot}) scale(${A.s}) translate(${-A.ax} ${-A.ay})">${inner}</g>`;
    },
    // где на плашке купол со щелью и стикер (координаты плашки, стоя)
    wcSlotAt() { const B = this.SLOTS.wc; return [B.x + B.w / 2, B.y + 25]; },
    wcStickerAt() { const B = this.SLOTS.wc; return [B.x + B.w / 2, B.y + 57]; },
    // Приёмник на аппарате: плашка повёрнута, стикер наклеен ровно.
    wcOnBox() {
        const A = this.WC_AT, [sx, sy] = this.wcStickerAt(), [px, py] = this.wcPt(sx, sy);
        return this.wcG(this.wcSlot()) +
            `<g transform="translate(${this.f(px)} ${this.f(py)}) scale(${A.s}) translate(${-sx} ${-sy})">${this.wcSticker(sx, sy)}</g>`;
    },

    wcSlot() {
        const J = PALETTE.greedJunk, W = J.reel.wc, f = this.f, B = this.SLOTS.wc, ink = PALETTE.ink;
        const rnd = this.rng(377);
        const x = B.x, y = B.y, w = B.w, h = B.h, cx = x + w / 2;
        let out = '';
        // обломки двери: рваный лист ламината шире плашки, торец — ДСП двери
        let d = '';
        // излом рваный: через точку — зубец щепы, то длинный, то короткий
        const n = 40;
        for (let i = 0; i < n; i++) {
            const a = i / n * Math.PI * 2, spike = i % 2 ? 0 : rnd() * 3.4;
            const rx = w / 2 + 5 + rnd() * 5 + spike, ry = h / 2 + 4 + rnd() * 4 + spike;   // лоскуты двери торчат из-под плашки
            const k = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) * w / h ? 1 / Math.abs(Math.cos(a)) : (h / w) / Math.abs(Math.sin(a));
            const r = Math.min(k, 1.25);
            d += (i ? ' L' : 'M') + f(cx + Math.cos(a) * rx * r * 0.82) + ' ' + f(y + h / 2 + Math.sin(a) * ry * r * 0.82);
        }
        d += ' Z';
        out += `<g><path d="${d}" class="fx" fill="${J.hole}" opacity="0.35" transform="translate(1.2 1.8)"/>`;
        out += this.T(4, 'plastic', `<path d="${d}" fill="${W.doorEdge}" stroke="${ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>` +
            `<path d="${d}" fill="${W.door}" transform="translate(${f(cx * 0.04)} ${f((y + h / 2) * 0.04)}) scale(0.96)"/>` +
            // царапины и щепа на изломе: светлые волокна ДСП двери
            `<path d="M${x + w + 1} ${y + 10} l3 3 M${x + w + 1} ${y + h - 12} l4 4" stroke="${W.doorLo}" stroke-width="0.6"/>` +
            `<path d="M${cx - 10} ${y - 5} l-2 -2.4 M${cx + 6} ${y - 6} l1.4 -2.6 M${cx - 4} ${y + h + 6} l-1.6 2.2 M${cx + 10} ${y + h + 5} l2 2" stroke="${W.doorEdge}" stroke-width="0.7" stroke-linecap="round"/>` +
            // обломок прихвачен к ящику двумя саморезами — сверху и снизу
            this.bolt(cx - 9, y - 3.6, 1.3) + this.bolt(cx + 7, y + h + 3.8, 1.3)) + '</g>';
        // Коробка механизма: чёрный пластик за плашкой, у вырванного замка
        // выглядывает справа — видно, что это прибор, а не наклейка. Сверху
        // из неё — пучок цветных проводов, сбоку разъём, в него входит трос
        // от кулисы рычага (shiftCable).
        {
            const bx = x + w - 6, by = y + 8, bw = 12, bh = 40;
            let m = `<rect x="${bx + 1}" y="${by + 1.6}" width="${bw}" height="${bh}" rx="1.6" class="fx" fill="${J.hole}" opacity="0.45"/>` +
                `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="1.6" fill="${W.bezel}" stroke="${ink}" stroke-width="${STROKE.structure}"/>` +
                `<path d="M${bx + bw - 1.4} ${by + 2} V${by + bh - 2}" class="hl" stroke="${J.tin[700]}" stroke-width="0.6"/>` +
                // литые рёбра корпуса
                `<path d="M${bx + 6} ${by + 14} H${bx + bw - 1} M${bx + 6} ${by + 26} H${bx + bw - 1}" stroke="${J.tin[900]}" stroke-width="0.6"/>` +
                // разъём под трос
                `<rect x="${bx + bw - 4.6}" y="${by + 2.6}" width="4" height="6" rx="0.6" fill="${J.tin[900]}" stroke="${ink}" stroke-width="${STROKE.detail}"/>`;
            // провода пучком из верха коробки, загнуты и уходят в ящик
            const P = J.paint;
            [[P.red, -1.6], [P.yellow, 0], [P.blue, 1.6]].forEach(([col, dx], k) => {
                // торчат из видимой части коробки, петлёй вверх и в щель ящика у стойки
                const d0 = `M${f(bx + 9 + dx)} ${by + 0.5} C${f(bx + 8 + dx * 2)} ${f(by - 7 - k)} ${f(bx + 15 + dx)} ${f(by - 9 + k)} ${f(bx + 14.5 + dx * 0.5)} ${f(by - 1 + k * 1.6)}`;
                m += `<path d="${d0}" fill="none" stroke="${ink}" stroke-width="1.5" stroke-linecap="round"/>` +
                    `<path d="${d0}" fill="none" stroke="${col}" stroke-width="0.9" stroke-linecap="round"/>`;
            });
            out += this.T(7, 'plastic', m);
        }
        // Плашка — как у фабричного монетоприёмника (референсы игрока):
        // хромовая рамка с фаской, лицо в мелкой «молотковой» фактуре, купол
        // с щелью, окошко таблички, лопатка возврата и чашечка внизу.
        const r = 2.4, bv = 3.2;
        const rr = (X, Y, W, H, R) => `M${f(X + R)} ${f(Y)} H${f(X + W - R)} Q${f(X + W)} ${f(Y)} ${f(X + W)} ${f(Y + R)} V${f(Y + H - R)} Q${f(X + W)} ${f(Y + H)} ${f(X + W - R)} ${f(Y + H)} H${f(X + R)} Q${f(X)} ${f(Y + H)} ${f(X)} ${f(Y + H - R)} V${f(Y + R)} Q${f(X)} ${f(Y)} ${f(X + R)} ${f(Y)} Z`;
        out += `<path d="${rr(x, y, w, h, r)}" class="fx" fill="${J.hole}" opacity="0.45" transform="translate(1.6 2.4)"/>`;
        let g = `<path d="${rr(x, y, w, h, r)}" fill="${J.tin[300]}" stroke="${ink}" stroke-width="${STROKE.structure}"/>`;
        // фаска: верх и левый скат светлые, низ и правый — тёмные
        const X0 = x + bv, Y0 = y + bv, X1 = x + w - bv, Y1 = y + h - bv;
        g += `<path d="M${x + 1} ${y + 1} L${x + w - 1} ${y + 1} L${X1} ${Y0} L${X0} ${Y0} Z" fill="${J.tin[100]}"/>` +
            `<path d="M${x + 1} ${y + 1} L${X0} ${Y0} L${X0} ${Y1} L${x + 1} ${y + h - 1} Z" fill="${J.tin[100]}" opacity="0.7"/>` +
            `<path d="M${x + w - 1} ${y + 1} L${x + w - 1} ${y + h - 1} L${X1} ${Y1} L${X1} ${Y0} Z" fill="${J.tin[500]}"/>` +
            `<path d="M${x + 1} ${y + h - 1} L${x + w - 1} ${y + h - 1} L${X1} ${Y1} L${X0} ${Y1} Z" fill="${J.tin[700]}"/>`;
        // Хром рамки — полосами отражения: на каждой грани тёмная полоса
        // посередине и светлая кромка. Без них рамка и лицо сливались в одну
        // светлую плашку.
        g += `<path d="M${x + 6} ${y + 1.9} H${x + w - 6}" stroke="${J.tin[500]}" stroke-width="0.9" opacity="0.8"/>` +
            `<path d="M${x + 1.9} ${y + 8} V${y + h - 10}" stroke="${J.tin[500]}" stroke-width="0.8" opacity="0.6"/>` +
            `<path d="M${x + w - 1.9} ${y + 6} V${y + h - 6}" stroke="${J.tin[900]}" stroke-width="0.8" opacity="0.6"/>` +
            `<path d="M${x + 5} ${y + h - 1.9} H${x + w - 5}" stroke="${J.tin[900]}" stroke-width="0.8" opacity="0.6"/>` +
            `<path d="M${x + 3} ${y + 0.9} H${x + w - 3}" class="hl" stroke="${J.tin[100]}" stroke-width="0.6"/>`;
        // лицо — матовое и темнее рамки: на нём хромовые детали и читаются
        g += `<rect x="${X0}" y="${Y0}" width="${X1 - X0}" height="${Y1 - Y0}" fill="${J.tin[500]}" stroke="${J.tin[700]}" stroke-width="0.5"/>` +
            `<path d="M${X0 + 0.3} ${Y0 + 0.5} H${X1 - 0.3}" stroke="${J.tin[700]}" stroke-width="0.8"/>`;
        // молотковая фактура: мелкая и тихая (крупные белые точки читались снегом)
        let lt = '', dk = '';
        for (let i = 0; i < 420; i++) {
            const dx = X0 + 0.4 + rnd() * (X1 - X0 - 0.8), dy = Y0 + 0.4 + rnd() * (Y1 - Y0 - 0.8), rr0 = f(0.14 + rnd() * 0.14);
            if (rnd() < 0.5) lt += `M${f(dx)} ${f(dy)} h0.01`; else dk += `M${f(dx)} ${f(dy)} h0.01`;
        }
        g += `<path d="${lt}" stroke="${J.tin[300]}" stroke-width="0.4" stroke-linecap="round" opacity="0.7"/>` +
            `<path d="${dk}" stroke="${J.tin[700]}" stroke-width="0.35" stroke-linecap="round" opacity="0.5"/>`;
        // Износ. Грязь копится в углах у рамки и вокруг того, за что берутся:
        // купол и лопатка засалены пальцами. Царапины — по рамке, вмятина —
        // внизу слева, куда били, когда выламывали.
        const gid = 'gj-wc-grime';
        g += `<filter id="${gid}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>` +
            `<g filter="url(#${gid})" opacity="0.75">` +
            `<ellipse cx="${cx}" cy="${y + 25}" rx="10.5" ry="10.5" fill="none" stroke="${J.tin[900]}" stroke-width="2"/>` +
            `<ellipse cx="${cx + 4}" cy="${y + 66}" rx="5" ry="6" fill="${J.tin[900]}" opacity="0.6"/>` +
            `<path d="M${X0 + 1} ${Y1 - 1} H${X1 - 1} M${X0 + 1} ${Y0 + 1} V${Y1 - 1}" stroke="${J.tin[900]}" stroke-width="1.6" opacity="0.7"/></g>`;
        let sc = '';
        for (let i = 0; i < 9; i++) {
            const side = i % 3, t = rnd();
            const [sx0, sy0] = side === 0 ? [x + 3 + t * (w - 6), y + 1.2 + rnd() * 1.4] : side === 1 ? [x + 1.2 + rnd() * 1.4, y + 4 + t * (h - 8)] : [x + w - 2.6 + rnd() * 1.4, y + 4 + t * (h - 8)];
            const a = rnd() * Math.PI, L = 1 + rnd() * 2.5;
            sc += `M${f(sx0)} ${f(sy0)} l${f(Math.cos(a) * L)} ${f(Math.sin(a) * L)} `;
        }
        g += `<path d="${sc}" stroke="${J.tin[100]}" stroke-width="0.3" stroke-linecap="round" opacity="0.9"/>`;
        g += `<path d="M${x + 1.4} ${y + h - 16} Q${x + 3.6} ${y + h - 13} ${x + 1.4} ${y + h - 10}" fill="none" stroke="${J.tin[900]}" stroke-width="0.7" opacity="0.7"/>` +
            `<path d="M${x + 2.4} ${y + h - 15.6} Q${x + 4.2} ${y + h - 13} ${x + 2.4} ${y + h - 10.4}" fill="none" stroke="${J.tin[100]}" stroke-width="0.5"/>`;
        // квадратные гнёзда по углам; в двух — саморезы в ящик, третий
        // заменён гвоздём, четвёртое пустое и разорвано (так выдирали)
        const sq = (qx, qy) => `<rect x="${f(qx - 1.6)}" y="${f(qy - 1.6)}" width="3.2" height="3.2" class="pit" fill="${J.tin[900]}"/>` +
            `<path d="M${f(qx - 1.6)} ${f(qy + 1.6)} H${f(qx + 1.6)} V${f(qy - 1.6)}" stroke="${J.tin[100]}" stroke-width="0.4" fill="none"/>`;
        const cs = [[x + 5.5, y + 5.5], [x + w - 5.5, y + 5.5], [x + 5.5, y + h - 5.5], [x + w - 5.5, y + h - 5.5]];
        cs.slice(1).forEach(([qx, qy]) => { g += sq(qx, qy); });
        g += this.bolt(cs[2][0], cs[2][1], 1.5) + this.bolt(cs[3][0], cs[3][1], 1.5);
        // ржавые потёки от саморезов — вниз, через рамку
        [cs[2], cs[3]].forEach(([qx, qy], k) => {
            g += `<path d="M${f(qx - 0.8)} ${f(qy + 1)} Q${f(qx - 0.4)} ${f(qy + 3.5)} ${f(qx + 0.2 - k * 0.4)} ${f(y + h + 0.6)} L${f(qx + 1 - k * 0.4)} ${f(y + h + 0.6)} Q${f(qx + 0.8)} ${f(qy + 3)} ${f(qx + 0.9)} ${f(qy + 1)} Z" fill="${J.rust[500]}" opacity="0.5"/>`;
        });
        // гвоздь вместо самореза: забит не до конца и загнут молотком вбок
        {
            const [nx, ny] = cs[1];
            g += `<path d="M${f(nx + 0.3)} ${f(ny + 0.2)} L${f(nx - 1.4)} ${f(ny + 1.3)} L${f(nx - 4)} ${f(ny + 1.5)}" fill="none" stroke="${ink}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>` +
                `<path d="M${f(nx + 0.3)} ${f(ny + 0.2)} L${f(nx - 1.4)} ${f(ny + 1.3)} L${f(nx - 4)} ${f(ny + 1.5)}" fill="none" stroke="${J.tin[500]}" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"/>` +
                `<circle cx="${f(nx + 0.6)}" cy="${f(ny - 0.2)}" r="1.5" fill="${J.tin[300]}" stroke="${ink}" stroke-width="${STROKE.detail}"/>` +
                `<circle cx="${f(nx + 0.2)}" cy="${f(ny - 0.6)}" r="0.6" fill="${J.tin[100]}"/>`;
        }
        // Четвёртый угол выдран вместе с саморезом: на месте гнезда рваная
        // дыра, сквозь неё видна дверь, края загнуты наружу заусенцами.
        // Было: тёмный квадрат с трещинами — читался битым пикселем.
        {
            const [hx, hy] = cs[0];
            const hd = `M${f(hx - 2)} ${f(hy - 1)} L${f(hx - 0.6)} ${f(hy - 2.2)} L${f(hx + 1.8)} ${f(hy - 1.6)} L${f(hx + 1.2)} ${f(hy + 0.2)} L${f(hx + 2.2)} ${f(hy + 1.6)} L${f(hx - 0.4)} ${f(hy + 2)} L${f(hx - 1.6)} ${f(hy + 1)} Z`;
            g += `<path d="${hd}" fill="${W.doorLo}" stroke="${J.tin[900]}" stroke-width="0.4" stroke-linejoin="round"/>` +
                `<path d="M${f(hx - 0.6)} ${f(hy - 2.2)} l-0.4 -1 M${f(hx + 2.2)} ${f(hy + 1.6)} l1 0.4 M${f(hx - 1.6)} ${f(hy + 1)} l-0.9 0.7" stroke="${J.tin[100]}" stroke-width="0.5" stroke-linecap="round"/>`;
        }
        out += this.T(9, 'polished', g);
        // купол приёма: полированный диск, щель через него сверху вниз
        const dy0 = y + 25, R = 8;
        // Хром купола: ступени светлеют к блику сверху-слева и размыты —
        // переход мягкий, как у полированной полусферы. Было: плоский
        // светлый диск с дугами-чёрточками и толстой чёрной щелью.
        const dc = `gj-wc-dome`;
        let c = `<clipPath id="${dc}"><circle cx="${cx}" cy="${dy0}" r="${R}"/></clipPath>` +
            `<filter id="${dc}-b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.3"/></filter>` +
            `<circle cx="${cx + 0.6}" cy="${dy0 + 1}" r="${R + 0.4}" class="fx" fill="${J.hole}" opacity="0.4"/>` +
            // обод — хромовое кольцо, светлое сверху и тёмное снизу (было
            // толстое чёрное кольцо — читалось дырой вокруг купола)
            `<circle cx="${cx}" cy="${dy0}" r="${R + 1.4}" fill="${J.tin[300]}" stroke="${ink}" stroke-width="${STROKE.detail}"/>` +
            `<path d="M${f(cx - R - 0.7)} ${f(dy0 + 1)} A${R + 0.7} ${R + 0.7} 0 0 1 ${f(cx + R * 0.5)} ${f(dy0 - R * 0.95)}" class="hl" fill="none" stroke="${J.tin[100]}" stroke-width="0.8"/>` +
            `<path d="M${f(cx + R + 0.7)} ${f(dy0 - 1)} A${R + 0.7} ${R + 0.7} 0 0 1 ${f(cx - R * 0.5)} ${f(dy0 + R * 0.95)}" fill="none" stroke="${J.tin[700]}" stroke-width="0.8"/>` +
            `<circle cx="${cx}" cy="${dy0}" r="${R + 0.1}" fill="none" stroke="${J.tin[900]}" stroke-width="0.4"/>` +
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
        out += this.T(11, 'polished', c);
        // «WC» — заводская штамповка вверху лица, залита чёрной эмалью,
        // эмаль местами стёрлась.
        {
            const wy = y + 8.6, wd = `M${cx - 10} ${wy - 3.4} L${cx - 8} ${wy + 3.4} L${cx - 6} ${wy - 1} L${cx - 4} ${wy + 3.4} L${cx - 2} ${wy - 3.4}` +
                ` M${cx + 8} ${wy - 2.3} A3.8 3.8 0 1 0 ${cx + 8} ${wy + 2.3}`;
            out += this.T(9.2, 'polished', this.rodH(wd, 2.2, 0.7) +
                `<path d="${wd}" fill="none" class="hl" stroke="${J.tin[100]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" transform="translate(0.4 0.5)"/>` +
                `<path d="${wd}" fill="none" stroke="${J.tin[900]}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>` +
                `<path d="M${cx - 7.2} ${wy + 1.6} l0.6 -1.2 M${cx + 4.6} ${wy - 1.2} l0.7 0.5" stroke="${J.tin[500]}" stroke-width="0.7" stroke-linecap="round"/>`);
        }
        return out;
    },

    // ---------- МАРКЕР ОТ РУКИ ----------
    // Каждый значок рисуется заново своей «рукой» (своим зерном): точки
    // штрихов дрожат, концы недотянуты или с перелётом, пропорции и наклон
    // плавают. Одинаковых значков нет (решение игрока: «прям человеческой
    // рукой»). Пишут им стикер монетоприёмника и скотч на банке; был ещё
    // почерк тряпки с таблицей выплат — тряпку убрали.
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
    // Жёлтый офисный стикер — квадратный листок из блока (игрок: офисные —
    // квадратные; был 31×22, «как ярлык»): верх приклеен
    // клеевой полосой и лежит ровно, низ отходит — бумага пружинит, правый
    // нижний угол приподнят дугой. Приподнятое светлее (ловит свет), под
    // ним тень на табличку. Наклеен косо, поверх цены на табличке.
    // Было: прямоугольник со срезанным углом и треугольником — читался
    // ярлыком с вырезом, а не загнутой бумажкой.
    // Цена от руки маркером: «1» и монетка — тем же почерком, что тряпка.
    wcSticker(cx, cy) {
        const J = PALETTE.greedJunk, W = J.reel.wc, f = this.f, ink = J.reel.rag.marker;
        const rnd = this.rng(4242), sw = 30, sh = 30, x = cx - sw / 2, y = cy - sh / 2;
        const X1 = x + sw, Y1 = y + sh, c = 8, gl = 5;   // c — отогнутый угол, gl — клеевая полоса
        // контур: верх прямой, бока чуть выгнуты, низ провис, угол — дугой вверх
        const out = `M${f(x)} ${f(y)} H${f(X1)} Q${f(X1 + 0.4)} ${f(y + sh * 0.5)} ${f(X1)} ${f(Y1 - c)} ` +
            `C${f(X1 - 0.5)} ${f(Y1 - c * 0.38)} ${f(X1 - c * 0.42)} ${f(Y1 - 1)} ${f(X1 - c)} ${f(Y1 - 0.5)} ` +
            `Q${f(x + sw * 0.45)} ${f(Y1 + 0.9)} ${f(x + 0.4)} ${f(Y1 + 0.2)} Q${f(x - 0.4)} ${f(y + sh * 0.5)} ${f(x)} ${f(y)} Z`;
        const id = 'gj-wc-st';
        let g = `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1"/></filter>` +
            // тень: у приклеенного верха — никакой, под отошедшим низом и углом — гуще
            `<path d="M${f(x + 2)} ${f(Y1 - 3)} Q${f(x + sw * 0.5)} ${f(Y1 + 1.6)} ${f(X1 - 3)} ${f(Y1)} L${f(X1 + 1)} ${f(Y1 - c * 0.7)} L${f(X1 + 2)} ${f(Y1 + 1.6)} L${f(x + 2)} ${f(Y1 + 2)} Z" ` +
            `class="fx" fill="${J.hole}" opacity="0.6" filter="url(#${id})" transform="translate(0.7 1.2)"/>` +
            `<path d="${out}" fill="${W.sticker}" stroke="${W.stickerLo}" stroke-width="0.4" stroke-linejoin="round"/>` +
            // клеевая полоса: чуть плотнее цветом, нижняя граница едва видна
            `<path d="M${f(x + 0.3)} ${f(y + gl)} H${f(X1 - 0.3)}" stroke="${W.stickerLo}" stroke-width="0.3" opacity="0.5"/>` +
            `<rect x="${f(x)}" y="${f(y)}" width="${sw}" height="${gl}" fill="${W.stickerLo}" opacity="0.14"/>` +
            // приподнятый низ: светлая полоса, сильнее к углу
            `<path d="M${f(x + 2)} ${f(Y1 - 1.6)} Q${f(x + sw * 0.5)} ${f(Y1 - 0.7)} ${f(X1 - c * 0.8)} ${f(Y1 - 1.4)}" fill="none" stroke="${W.stickerHi}" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>` +
            `<path d="M${f(X1 - c * 1.15)} ${f(Y1 - 1.8)} C${f(X1 - c * 0.55)} ${f(Y1 - 2.4)} ${f(X1 - 1.4)} ${f(Y1 - c * 0.6)} ${f(X1 - 1)} ${f(Y1 - c * 1.1)}" fill="none" stroke="${W.stickerHi}" stroke-width="3" stroke-linecap="round"/>` +
            // сгиб, от которого угол пошёл вверх
            `<path d="M${f(X1 - c * 1.5)} ${f(Y1 - 0.6)} Q${f(X1 - c * 0.9)} ${f(Y1 - c * 0.8)} ${f(X1 - 0.1)} ${f(Y1 - c * 1.45)}" fill="none" stroke="${W.stickerLo}" stroke-width="0.4" opacity="0.8"/>` +
            // рельеф: низ и угол выше плоскости
            `<g class="hpass"><path d="M${f(x + 2)} ${f(Y1 - 3)} H${f(X1 - 3)}" stroke="#000" stroke-width="3" style="--dh:${this.dh(0.3)}"/>` +
            `<circle cx="${f(X1 - 2.6)}" cy="${f(Y1 - 2.6)}" r="3.4" style="--dh:${this.dh(0.9)}"/></g>`;
        // Надпись — в своей коробке 14×13 и растянута на листок: почерк тот
        // же, что был, только крупно, как пишут маркером на стикере.
        const k = 2, tx = x + 1.6, ty = y + gl - 2.6;
        const one = this.handPath([[1.4, 5.6], [3.2, 3.9]], rnd, false, 0.1) + ' ' +
            this.handPath([[3.2, 3.9], [3.1, 10.6]], rnd, false, 0.1) + ' ' +
            this.handPath([[1.8, 10.7], [4.4, 10.5]], rnd, false, 0.08);
        // «×» между числом и монетой: без него «1» и монета читались «10»
        const times = this.handPath([[5.3, 6.3], [6.9, 8.1]], rnd, false, 0.06) + ' ' +
            this.handPath([[6.9, 6.3], [5.3, 8.1]], rnd, false, 0.06);
        // монета в ракурсе, с ребром и насечками, с блеском
        const mx = 10.4, my = 7.4;
        const coin = this.handOval(mx, my, 2.7, 1.8, rnd, 8) + ' ' +
            this.handPath([[mx - 2.7, my], [mx - 2.6, my + 1.2], [mx - 1.4, my + 2.6], [mx, my + 3], [mx + 1.4, my + 2.6], [mx + 2.6, my + 1.2], [mx + 2.7, my]], rnd, false, 0.06) + ' ' +
            [-1.6, -0.5, 0.5, 1.6].map(dx => this.handPath([[mx + dx, my + 2.1 - Math.abs(dx) * 0.2], [mx + dx, my + 3 - Math.abs(dx) * 0.3]], rnd, false, 0.02)).join(' ') + ' ' +
            this.handOval(mx, my, 1.3, 0.8, rnd, 6) + ' ' +
            this.handPath([[mx + 1.4, my - 2.6], [mx + 2.2, my - 3.6]], rnd, false, 0.03) + ' ' + this.handPath([[mx + 2.6, my - 2], [mx + 3.4, my - 2.6]], rnd, false, 0.03);
        // маркер подсыхал: поверх основного штриха — тот же, тоньше и светлее
        // с разрывами, будто перо скребло
        g += `<g transform="translate(${f(tx)} ${f(ty)}) scale(${k})">` +
            `<path d="${one} ${times} ${coin}" fill="none" stroke="${ink}" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>` +
            `<path d="${one} ${coin}" fill="none" stroke="${W.sticker}" stroke-width="0.14" stroke-dasharray="0.4 1" opacity="0.6"/></g>`;
        // захватан: серый отпечаток у правого края и затёртая левая кромка
        g += `<ellipse cx="${f(X1 - 4.6)}" cy="${f(y + 8)}" rx="3.4" ry="4.4" fill="${J.tin[700]}" opacity="0.13" filter="url(#${id})"/>` +
            `<path d="M${f(x + 0.5)} ${f(y + gl + 1)} V${f(Y1 - 1.5)}" stroke="${W.stickerHi}" stroke-width="0.8" opacity="0.7"/>`;
        return this.T(10, 'paper', `<g transform="rotate(-5 ${f(cx)} ${f(cy)})">${g}</g>`);
    }
});
