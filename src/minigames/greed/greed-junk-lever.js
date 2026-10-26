// АППАРАТ АЛЧНОСТИ: КУЛИСА, РЫЧАГ И СБОРКА КОРПУСА (bodySvg)
// Продолжение GreedJunk (greed-junk.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после greed-junk.js.
Object.assign(GreedJunk, {

    // ---------- КУЛИСА ----------
    // Рычаг — кулиса старой коробки передач: гофрированная резиновая юбка,
    // хромированный шток и круглая рукоять со схемой шести передач. Ходит
    // НА ИГРОКА, а не вбок: вбок на экране телефона места нет.
    // Корпус — кусок пола старой машины, вырезанный болгаркой вместе с
    // кулисой: заводская краска хаки, выштампованные рёбра жёсткости,
    // индикатор готовности в бывшей дренажной дырке, рамка юбки из салона. Сверху и
    // справа края заводские (скруглённая штамповка, завальцовка), снизу —
    // свежий рез с побежалостью, слева отогнут фланец и привёрнут к
    // ящику. Из кулисы трос переключения уходит в нижний ящик — это и
    // есть связь рычага с барабанами. Было: ровная серая пластина с
    // «улыбкой»-вмятиной и две шестерни сбоку ни к чему.
    leverMount() {
        const J = PALETTE.greedJunk, C = J.car, P = this.SLOTS.pivot, f = this.f;
        const rnd = this.rng(77);
        const x0 = 314, y0 = 384, x1 = 356, y1 = 464;      // низ стоит на верхней грани полки
        // Нижний край — рез болгаркой: прямой, чуть наискось (резали по
        // разметке на глаз). Было: зубчатая «пила» — так режут ножницами
        // по жести, а не диском, и смотрелось это неряшливой каймой.
        const yl = y1 - 1, yr = y1 - 3;                // рез слева и справа
        const at = (x) => yl + (yr - yl) * (x - x0) / (x1 + 0.6 - x0);
        const body = `M${x0} ${y0 + 5} Q${x0} ${y0} ${x0 + 5} ${y0} L${x1 - 4} ${y0} Q${x1} ${y0} ${x1} ${y0 + 4} L${x1 + 0.6} ${yr} L${x0} ${yl} Z`;
        let g = `<path d="${body}" class="fx" fill="${J.hole}" opacity="0.35" transform="translate(1.6 2.4)"/>` +
            `<path d="${body}" fill="${C.base}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>`;
        // завальцовка правого края: светлая кромка
        g += `<path d="M${x1 - 1.6} ${y0 + 4} L${x1 - 1.2} ${y1 - 3}" class="hl" stroke="${C.hi}" stroke-width="1.2"/>`;
        // рёбра жёсткости — выштамповка: вытянутые валики
        const rib = (y) => {
            const d = `M${x0 + 9} ${y} L${x1 - 7} ${y}`;
            // Без обводки: выштамповка — это изгиб того же листа, а не
            // накладка; с контуром рёбра читались прорезями-кнопками.
            return `<path d="M${x0 + 9} ${y + 1.6} L${x1 - 7} ${y + 1.6}" stroke="${C.lo}" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>` +
                `<path d="M${x0 + 9} ${y - 1.4} L${x1 - 7} ${y - 1.4}" class="hl" stroke="${C.hi}" stroke-width="1.2" stroke-linecap="round"/>` +
                this.rodH(d, 4.4, 1.6);
        };
        g += rib(424) + rib(438);
        // сколы краски до грунта и ржавчины — по краям и у реза
        [[x1 - 3, y0 + 14, 2.4], [x0 + 6, y1 - 7, 3], [x1 - 6, y1 - 6, 2.2], [x0 + 20, y0 + 2.4, 1.8]].forEach(([cx, cy, r]) => {
            const pts = [];
            for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, rr = r * (0.6 + rnd() * 0.6); pts.push(`${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr * 0.8)}`); }
            g += `<path d="M${pts.join(' L')} Z" fill="${J.primer.base}"/>` +
                `<circle cx="${f(cx + 0.3)}" cy="${f(cy + 0.4)}" r="${f(r * 0.35)}" fill="${J.rust[500]}"/>`;
        });
        // рез: над кромкой полоса побежалости (лист грелся от диска), под
        // ней тонкая окалина и ровная полоска свежего металла по кромке
        const band = (h0, h1) => `M${x0 + 0.6} ${f(yl - h1)} L${x1 + 0.2} ${f(yr - h1)} L${x1 + 0.2} ${f(yr - h0)} L${x0 + 0.6} ${f(yl - h0)} Z`;
        const xm = (x0 + x1) / 2, ym = at(xm);
        g += `<g transform="rotate(90 ${f(xm)} ${f(ym - 3)}) rotate(${f(Math.atan2(yr - yl, x1 - x0) * 180 / Math.PI)} ${f(xm)} ${f(ym - 3)})">` +
            `<rect x="${f(xm - 3.5)}" y="${f(ym - 3 - (x1 - x0) / 2)}" width="7" height="${x1 - x0}" fill="url(#gj-temper)" opacity="0.35"/></g>`;
        g += `<path d="${band(0.4, 1.9)}" fill="${J.tin[900]}" opacity="0.85"/>`;
        g += `<path d="${band(0.4, 1.2)}" fill="${J.tin[100]}"/>`;
        g += this.readyLampBody();
        let out = this.T(7, 'paint', g);
        // фланец слева отогнут к ящику: узкая полоса в тени и три болта
        out += this.T(8, 'paint', `<path d="M${x0} ${y0 + 5} L${x0 + 4} ${y0 + 3} L${x0 + 4} ${y1 - 1.5} L${x0} ${y1 - 1} Z" fill="${C.lo}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            [402, 430, 454].map(y => this.bolt(x0 + 2, y, 1.6)).join(''));
        // Крышка корпуса: толстый загнутый край листа, на нём рамка юбки.
        // Юбка выходит из корпуса сквозь крышку, а не стоит на кромке, как
        // на полке. Корпус почти на уровне глаз — верх крышки виден ребром.
        out += this.T(9, 'paint', `<rect x="${x0 - 2}" y="${y0 - 5}" width="${x1 - x0 + 4}" height="8" rx="2.4" fill="${C.base}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<line x1="${x0}" y1="${y0 - 3.6}" x2="${x1}" y2="${y0 - 3.6}" class="hl" stroke="${C.hi}" stroke-width="0.9"/>` +
            this.rodH(`M${x0} ${y0 - 1} L${x1} ${y0 - 1}`, 7, 1.6) +
            this.bolt(x0 + 2.4, y0 - 1, 1.5) + this.bolt(x1 - 2.4, y0 - 1, 1.5));
        // рамка юбки — в leverSvg: она прижимает низ юбки и рисуется поверх
        out += this.shiftCable();
        return out;
    },

    // Индикатор готовности рычага — в бывшей дренажной дырке: резиновое
    // кольцо и в нём затёртый мутный колпачок из серо-зелёной резины, как
    // на старых военных приборах. Под ним тусклая лампочка: горит красным,
    // пока рычаг дёргать нельзя (идёт крутка), зелёным — когда можно. Свет
    // живой, рисуется поверх корпуса (readyLampGlow, GreedJunkLit).
    READY_LAMP: { x: 345, y: 450, r: 4.2 },
    readyLampBody() {
        const J = PALETTE.greedJunk, Lm = J.lamp, R = this.READY_LAMP, f = this.f;
        let g = `<circle cx="${R.x}" cy="${R.y}" r="${R.r + 1.6}" fill="${J.tin[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            this.domeH(R.x, R.y, R.r + 1.6, 1);
        let cap = `<circle cx="${R.x}" cy="${R.y}" r="${R.r}" fill="${Lm.cap}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>` +
            // затёртость: матовые царапины и тёмный ободок у края
            `<circle cx="${R.x}" cy="${R.y}" r="${f(R.r - 0.6)}" fill="none" stroke="${Lm.capLo}" stroke-width="0.6" opacity="0.6"/>` +
            `<path d="M${f(R.x - 2.4)} ${f(R.y + 1.2)} L${f(R.x + 0.6)} ${f(R.y - 1.8)} M${f(R.x - 0.4)} ${f(R.y + 2.4)} L${f(R.x + 2)} ${f(R.y + 0.2)}" stroke="${Lm.capLo}" stroke-width="0.3" opacity="0.7"/>` +
            this.domeH(R.x, R.y, R.r, 2);
        return this.T(2, 'rubber', g) + this.T(3, 'plastic', cap);
    },
    // Свет индикатора: red и green — накал 0..1. Колпачок рассеивает:
    // тусклая заливка его цветом, мягкое пятно нити посередине и слабый
    // ореол на краске вокруг — без резких краёв.
    readyLampDefs() {
        const Lm = PALETTE.greedJunk.lamp;
        return ['red', 'green'].map(k =>
            `<radialGradient id="gj-ind-${k}"><stop offset="0" stop-color="${Lm[k + 'Core']}" stop-opacity="0.95"/>` +
            `<stop offset="0.55" stop-color="${Lm[k]}" stop-opacity="0.55"/><stop offset="1" stop-color="${Lm[k]}" stop-opacity="0"/></radialGradient>` +
            // нить в самой середине — ярче всего колпачка
            `<radialGradient id="gj-ind-${k}-hot"><stop offset="0" stop-color="${Lm.hot}" stop-opacity="1"/>` +
            `<stop offset="0.45" stop-color="${Lm[k + 'Core']}" stop-opacity="0.85"/><stop offset="1" stop-color="${Lm[k + 'Core']}" stop-opacity="0"/></radialGradient>`).join('');
    },
    readyLampGlow(red, green) {
        const R = this.READY_LAMP, f = this.f, Lm = PALETTE.greedJunk.lamp;
        let out = '';
        [['red', red], ['green', green]].forEach(([k, v]) => {
            if (v < 0.02) return;
            out += `<circle cx="${R.x}" cy="${R.y}" r="${f(R.r * 3)}" fill="url(#gj-ind-${k})" opacity="${f(0.35 * v)}" style="mix-blend-mode:screen"/>` +
                `<circle cx="${R.x}" cy="${R.y}" r="${f(R.r - 0.3)}" fill="${Lm[k]}" opacity="${f(0.6 * v)}"/>` +
                `<circle cx="${R.x}" cy="${f(R.y + 0.3)}" r="${f(R.r * 0.85)}" fill="url(#gj-ind-${k})" opacity="${f(0.9 * v)}" style="mix-blend-mode:screen"/>` +
                `<circle cx="${R.x}" cy="${f(R.y + 0.2)}" r="${f(R.r * 0.62)}" fill="url(#gj-ind-${k}-hot)" opacity="${f(v)}"/>`;
        });
        // затёртость колпачка видна и на горящей лампе: свет идёт сквозь
        // царапины, они темнее
        if (out) out += `<path d="M${f(R.x - 2.4)} ${f(R.y + 1.2)} L${f(R.x + 0.6)} ${f(R.y - 1.8)} M${f(R.x - 0.4)} ${f(R.y + 2.4)} L${f(R.x + 2)} ${f(R.y + 0.2)}" stroke="${Lm.capLo}" stroke-width="0.3" opacity="0.6"/>` +
            `<circle cx="${R.x}" cy="${R.y}" r="${f(R.r - 0.6)}" fill="none" stroke="${Lm.capLo}" stroke-width="0.6" opacity="0.25"/>`;
        return out;
    },

    // Трос переключения: чёрная оболочка из втулки внизу кулисы, дугой
    // вниз и в нижний ящик через втулку. На концах — обжатые стальные
    // наконечники оболочки.
    shiftCable() {
        const J = PALETTE.greedJunk, f = this.f;
        // уходит в монетоприёмник (wcSlot): провод связывает рычаг и щель —
        // два органа управления одного аппарата (решение игрока)
        const pts = [[326, 454], [330, 472], [326, 492], [313, 503], [303, 503.6]];
        const d = this.smooth(pts);
        let out = `<path d="${d}" class="fx" fill="none" stroke="${J.hole}" stroke-width="4" stroke-linecap="round" opacity="0.3" transform="translate(1.4 2)"/>` +
            this.rodH(d, 3.6) +
            `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="4.4" stroke-linecap="round"/>` +
            `<path d="${d}" fill="none" stroke="${J.tin[900]}" stroke-width="3" stroke-linecap="round"/>` +
            `<path d="${d}" fill="none" class="hl" stroke="${J.tin[500]}" stroke-width="0.6" opacity="0.7" transform="translate(-0.6 -0.2)"/>`;
        // наконечники: короткие стальные гильзы с насечкой обжима
        const ferrule = (a, b) => {
            const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(ang), s = Math.sin(ang);
            const e = [a[0] + c * 5, a[1] + s * 5];
            const dd = `M${f(a[0])} ${f(a[1])} L${f(e[0])} ${f(e[1])}`;
            // гильза выходит из дыры на нас: у дыры её торец скруглён
            return this.rodH(dd, 4.6, 2) + `<path d="${dd}" stroke="${PALETTE.ink}" stroke-width="5.4" stroke-linecap="round"/>` +
                `<path d="${dd}" stroke="${J.tin[500]}" stroke-width="4" stroke-linecap="round"/>` +
                `<path d="M${f(a[0] + c * 2.5 - s * 2)} ${f(a[1] + s * 2.5 + c * 2)} L${f(a[0] + c * 2.5 + s * 2)} ${f(a[1] + s * 2.5 - c * 2)}" stroke="${J.tin[700]}" stroke-width="0.6"/>`;
        };
        out += ferrule(pts[0], pts[1]) + ferrule(pts[4], pts[3]);
        // Нижний конец — в разъём коробки монетоприёмника (greed-junk-wc.js),
        // втулки там нет.
        // Обе втулки — ПОД тросом: трос выходит из самой дыры втулки и в
        // дыру же уходит. Было: верхняя втулка лежала поверх, и трос
        // вылезал из-под её края, а дыра оставалась пустой.
        return this.grommet(pts[0][0], pts[0][1]) + this.T(8, 'rubber', out);
    },

    // Шток и рукоять — отдельно: при рывке шток укорачивается (уходит на
    // игрока) и рукоять опускается, корпус при этом не перерисовывается.
    // Юбка тоже живая: она сминается вместе со штоком.
    // Было плоско: юбка — стопка шайб двух цветов, рукоять — монета
    // (купол 5 при радиусе 17), хром — серая полоска. Теперь:
    //   * юбка — одна чёрная резина, гофры — валики, каждый выпуклый и
    //     поперёк (эллиптический купол на карте высот), сужается кверху;
    //     кольца выше глаза, поэтому дуги гофр чуть выгнуты вверх;
    //   * сверху юбка обжата на штоке хомутом;
    //   * хром — полосами отражения вдоль (тёмная и светлая), так он и
    //     читается хромом, а не крашеной трубкой;
    //   * рукоять — шар бакелита с гравировкой схемы, на хромовой втулке.
    // Геометрия рычага при рывке pull (0 — покой, 1 — до упора, меньше
    // нуля — откат назад): рычаг заваливается НА ИГРОКА до 75°. Спереди
    // это видно так: шток короче (ракурс), рукоять ниже и крупнее (ближе),
    // юбка сминается и раздаётся вширь, как резина. Было 55° и без
    // раздутия юбки — рукоять опускалась на 21 единицу, рывок не читался. Рисунок — в покое; рывок двигает готовые
    // освещённые части по этой геометрии (GreedJunkLit, «Рычаг»).
    LEVER_TILT: 75,
    leverGeom(pull) {
        const P = this.SLOTS.pivot;
        const th = pull * this.LEVER_TILT * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
        const squash = Math.max(0, sn);
        const base = P.y - 16, h0 = 40 * (1 - 0.45 * squash), top = base - h0;
        const K = { x: P.x, y: top - 50 * cs, r: 15 * (1 + 0.15 * sn) };
        return { base, h0, top, K, s0: K.y + K.r - 2, cs, sn, bootW: 1 + 0.12 * squash };
    },
    // Части рычага отдельно — для рывка. Вместе — leverSvg.
    leverParts(noPattern) {
        const J = PALETTE.greedJunk, P = this.SLOTS.pivot, V = this.VP || { y: 388 }, f = this.f;
        const G = this.leverGeom(0);
        const base = G.base, rings = 6, h0 = G.h0, top = G.top;
        const wAt = (t) => 30 - t * 19;                  // ширина юбки по высоте 0..1
        const bow = (y, w) => w * Math.max(0, (V.y - y) / 230) * 0.5;
        // силуэт: валик шире, впадина уже
        const L = [], R = [];
        for (let i = 0; i <= rings * 2; i++) {
            const t = i / (rings * 2), y = base - t * h0, w = wAt(t) + (i % 2 ? 2.4 : -0.6);
            L.push([P.x - w / 2, y]); R.push([P.x + w / 2, y]);
        }
        const sil = this.smooth(L) + ' L' + R.slice().reverse().map(p => `${f(p[0])} ${f(p[1])}`).join(' L') + ' Z';
        let boot = `<path d="${sil}" fill="${J.tin[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>`;
        let bootH = '';
        for (let i = 0; i < rings; i++) {
            const tr = (i + 0.5) / rings, y = base - tr * h0, w = wAt(tr) + 2.4, b = bow(y, w);
            const yv = base - (i + 1) / rings * h0, wv = wAt((i + 1) / rings) - 0.6;
            // гребень: блик сверху валика; складка над ним — тёмная дуга
            boot += `<path d="M${f(P.x - w / 2 + 2)} ${f(y - 1.4)} Q${f(P.x)} ${f(y - 1.4 - b * 2)} ${f(P.x + w / 2 - 2)} ${f(y - 1.4)}" fill="none" class="hl" stroke="${J.tin[500]}" stroke-width="0.9" stroke-linecap="round" opacity="0.8"/>`;
            if (i < rings - 1) boot += `<path d="M${f(P.x - wv / 2)} ${f(yv)} Q${f(P.x)} ${f(yv - bow(yv, wv) * 2)} ${f(P.x + wv / 2)} ${f(yv)}" fill="none" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}" stroke-linecap="round" opacity="0.85"/>`;
            const ry = h0 / rings * 0.62;
            bootH += `<g transform="translate(${f(P.x)} ${f(y)}) scale(1 ${f(ry / (w / 2))}) translate(${f(-P.x)} ${f(-y)})">${this.domeH(P.x, y, w / 2, 4)}</g>`;
        }
        // хомут: стальная лента со стяжным винтом сбоку
        const cw = wAt(1) + 1.4;
        const clamp = `<rect x="${f(P.x - cw / 2)}" y="${f(top - 1)}" width="${f(cw)}" height="3.6" rx="1.2" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<rect x="${f(P.x + cw / 2 - 1)}" y="${f(top - 1.6)}" width="3.4" height="4.8" rx="0.8" fill="${J.tin[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            this.rodH(`M${f(P.x - cw / 2 + 1)} ${f(top + 0.8)} L${f(P.x + cw / 2 - 1)} ${f(top + 0.8)}`, 3.4, 1.4);
        // шток
        const K = G.K;
        const s0 = G.s0, sw = 6;
        let shaft = `<rect x="${P.x - sw / 2}" y="${f(s0)}" width="${sw}" height="${f(top - s0 + 1)}" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            // отражение окружения: светлое небо слева, тёмный пол посередине,
            // светлый рефлекс у правого края
            `<rect x="${P.x - 2.2}" y="${f(s0 + 1)}" width="1.1" height="${f(top - s0 - 1)}" fill="${J.tin[100]}"/>` +
            `<rect x="${P.x + 0.2}" y="${f(s0 + 1)}" width="1.4" height="${f(top - s0 - 1)}" fill="${J.tin[700]}"/>` +
            `<rect x="${P.x + 1.9}" y="${f(s0 + 1)}" width="0.6" height="${f(top - s0 - 1)}" fill="${J.tin[100]}" opacity="0.7"/>` +
            this.rodH(`M${P.x} ${f(s0)} L${P.x} ${f(top)}`, sw, 3);
        // втулка рукояти: хромовый стакан, в который вкручен шар
        const cup = `<rect x="${P.x - 4.6}" y="${f(s0 - 1)}" width="9.2" height="6" rx="1.4" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<rect x="${P.x - 3}" y="${f(s0)}" width="1.2" height="4" fill="${J.tin[100]}"/><rect x="${P.x + 0.6}" y="${f(s0)}" width="1.6" height="4" fill="${J.tin[700]}"/>` +
            this.rodH(`M${P.x} ${f(s0)} L${P.x} ${f(s0 + 4)}`, 9, 3.4);
        // схема передач гравировкой: три вертикали через поперечину,
        // точки на концах; лежит на шаре чуть ниже его поверхности
        const KP = this.knobPattern(K.x, K.y, K.r, this.KNOB_PHI);
        let pattern = KP.lines.map(l => `<polyline points="${l.map(q => `${f(q[0])},${f(q[1])}`).join(' ')}" fill="none"/>`).join('');
        let dots = KP.dots.map(d => `<circle cx="${f(d[0])}" cy="${f(d[1])}" r="${f(d[2])}"/>`).join('');
        const rise = 12;
        const knob = `<circle cx="${K.x + 1.5}" cy="${K.y + 2.5}" r="${K.r}" class="fx" fill="${J.hole}" opacity="0.3"/>` +
            `<circle cx="${K.x}" cy="${K.y}" r="${K.r}" fill="${J.tin[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.contour}"/>` +
            this.domeH(K.x, K.y, K.r, rise) +
            (noPattern ? '' : `<g style="--dh:${this.dh(rise * 0.9)}">` +
            `<g stroke="${J.paint.cream}" stroke-width="${STROKE.structure}" stroke-linecap="round" stroke-linejoin="round">${pattern}</g>` +
            `<g fill="${J.paint.cream}">${dots}</g></g>`) +
            `<ellipse cx="${K.x - 6}" cy="${K.y - 7.5}" rx="4.6" ry="2.6" class="hl" fill="${J.tin[300]}" opacity="0.55" transform="rotate(-35 ${K.x - 6} ${K.y - 7.5})"/>`;
        return {
            boot: this.T(10, 'rubber', boot + bootH),
            frame: this.bootFrame(),
            shaft: this.T(9, 'polished', shaft),
            clamp: this.T(11, 'steel', clamp),
            knob: this.T(9, 'polished', cup) + this.T(8, 'bakelite', knob)
        };
    },
    LEVER_ORDER: ['boot', 'frame', 'shaft', 'clamp', 'knob'],
    leverSvg() {
        const L = this.leverParts();
        return '<g class="gj-lever">' + this.LEVER_ORDER.map(k => L[k]).join('') + '</g>';
    },
    // Схема передач на рукояти — на её «макушке», полюсе шара, который
    // смотрит туда же, куда шток. В покое полюс отклонён к игроку на
    // KNOB_PHI: схема на верхней части шара, сжата по высоте. На рывке
    // шар поворачивается вместе со штоком, и схема сползает через центр
    // вниз — по ней и видно, что рукоять наклоняется, а не раздувается.
    // Было: схема всегда смотрела прямо на нас, и при рывке казалось,
    // что шар просто растёт.
    // Точка схемы (u, v) лежит на сфере: от полюса p вдоль осей x и t
    // (t — вниз и к нам); на экран — проекция, обратная сторона скрыта.
    KNOB_PHI: 50,
    knobPattern(cx, cy, r, phiDeg) {
        const ph = phiDeg * Math.PI / 180, g = 7 * r / 15, R = r;
        const p = [0, -Math.cos(ph), Math.sin(ph)], t = [0, Math.sin(ph), Math.cos(ph)];
        const at = (u, v) => {
            const d = [u / R, p[1] + (v / R) * t[1], p[2] + (v / R) * t[2]];
            const n = Math.hypot(d[0], d[1], d[2]);
            return [cx + R * d[0] / n, cy + R * d[1] / n, d[2] / n];
        };
        const seg = (u0, v0, u1, v1) => {
            const pts = [];
            for (let i = 0; i <= 8; i++) {
                const q = at(u0 + (u1 - u0) * i / 8, v0 + (v1 - v0) * i / 8);
                if (q[2] > 0.08) pts.push(q);
            }
            return pts;
        };
        const lines = [seg(-g, 0, g, 0)].concat([-g, 0, g].map(u => seg(u, -g, u, g))).filter(l => l.length > 1);
        const dots = [];
        [-g, 0, g].forEach(u => [-g, g].forEach(v => {
            const q = at(u, v);
            if (q[2] > 0.08) dots.push([q[0], q[1], 1.2 * r / 15 * (0.55 + 0.45 * q[2])]);
        }));
        return { lines, dots };
    },
    // Одна часть рычага на прозрачном фоне, участком crop — для рывка.
    leverPartSvg(pass, crop, part) {
        this.pass = pass;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${crop.x} ${crop.y} ${crop.w} ${crop.h}">` +
            this.passStyle(pass) + this.defs() + this.leverParts(true)[part] + '</svg>';
    },

    // Рамка юбки из салона: чёрное пластиковое кольцо на двух саморезах
    // в крышку кулисы. Лежит ПОВЕРХ низа юбки и прижимает его — юбка
    // заправлена под рамку. Было: рамка рисовалась с корпусом, юбка
    // закрывала её целиком и просто стояла на крышке, ни к чему не
    // прикреплённая.
    bootFrame() {
        const J = PALETTE.greedJunk, P = this.SLOTS.pivot;
        const y = P.y - 19, w = 38, h = 6;
        return this.T(12, 'plastic', `<rect x="${P.x - w / 2 + 1}" y="${y - 1.6}" width="${w - 2}" height="2" class="fx" fill="${J.hole}" opacity="0.5"/>` +
            `<rect x="${P.x - w / 2}" y="${y}" width="${w}" height="${h}" rx="2.6" fill="${J.tin[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<line x1="${P.x - w / 2 + 3}" y1="${y + 1.2}" x2="${P.x + w / 2 - 3}" y2="${y + 1.2}" class="hl" stroke="${J.tin[500]}" stroke-width="${STROKE.hairline}"/>` +
            this.rodH(`M${P.x - w / 2 + 3} ${y + h / 2} L${P.x + w / 2 - 3} ${y + h / 2}`, h - 1, 1.4) +
            this.bolt(P.x - w / 2 + 3.6, y + h / 2, 1.3) + this.bolt(P.x + w / 2 - 3.6, y + h / 2, 1.3));
    },

    // Тень на барабанах от верхней и левой кромки окна. Отдельным слоем:
    // в игре барабаны крутятся ПОВЕРХ корпуса, и тень должна лечь поверх
    // них, иначе окно снова станет плоским.
    reelShadeSvg() {
        const J = PALETTE.greedJunk;
        return this.SLOTS.reels.map(r =>
            `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="5" class="fx" fill="url(#gj-reel-shade)"/>` +
            `<rect x="${r.x}" y="${r.y}" width="8" height="${r.h}" rx="4" class="fx" fill="${J.hole}" opacity="0.25"/>`
        ).join('');
    },

    // Тень от верхнего щита на табло.
    topShade() {
        return this.shade(54, 290, 252, 14);
    },

    // pass — проход рисунка (greed-junk-light.js): baked, albedo, height, mat.
    // crop — участок поля {x, y, w, h}: растр только его (кадры рычага).
    // lever: false — корпус без рычага.
    bodySvg(pass, crop, lever) {
        this.pass = pass || 'baked';
        const clip = `<clipPath id="gj-face"><rect x="62" y="312" width="236" height="148" rx="2"/></clipPath>`;
        const vb = crop ? `${crop.x} ${crop.y} ${crop.w} ${crop.h}` : `0 0 ${this.W} ${this.H}`;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">` +
            this.passStyle(this.pass) +
            this.defs().replace('</defs>', clip + '</defs>') +
            this.plinth() + this.body() + this.topBox() + this.head() + this.topShade() + this.leverMount() +
            (lever === false ? '' : this.leverSvg()) +
            `</svg>`;
    },
});
