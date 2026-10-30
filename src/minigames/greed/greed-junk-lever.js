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
    // ---------- ЛАМПА НАД РЫЧАГОМ ----------
    // Источник света рычага (решение игрока): маленький металлический
    // плафон прямо над шаром, колба выглядывает из-под него. Свет от неё —
    // GreedJunkLit.LIGHTS[0], ореол на корпусе — KEY.leverLamp.
    //
    // Рисуется не в корпусе, а живым слоем поверх всего (GreedJunkLit.liveParts):
    // под коробом пачинко до шара всего ~18 единиц, и плафон, влезающий
    // туда целиком, на телефоне выходил ~28×15 точек — плоской трапецией,
    // «наброском» (игрок). Поверх короба он заходит на низ его панели —
    // туда, откуда ушла кнопка, — и становится вещью: колокол с выпуклыми
    // боками, закатанная кромка, горловина с патроном, шнур, лапка на
    // винтах. Свет на нём нарисован (шейдер его не видит): эмаль светлее
    // сверху, изнутри плафон горит отражением колбы — так и читается, что
    // светит именно он.
    LEVER_LAMP: { x: 314, top: 260, rim: 280, wTop: 20, wRim: 30, bulb: 6 },
    leverLampSvg() {
        const J = PALETTE.greedJunk, E = J.carOld, Lb = J.bulb, L = this.LEVER_LAMP, f = this.f, ink = PALETTE.ink;
        const x = L.x, t = L.top, r = L.rim, ht = L.wTop / 2, hr = L.wRim / 2;
        const defs = `<defs>` +
            // эмаль: сверху светлее (общий свет гаража), к кромке темнее
            `<linearGradient id="gj-ll-enamel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${E.hi}"/><stop offset="0.55" stop-color="${E.base}"/><stop offset="1" stop-color="${E.lo}"/></linearGradient>` +
            // бока колокола уходят от света — темнее к краям
            `<linearGradient id="gj-ll-side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${PALETTE.ink}" stop-opacity="0.5"/><stop offset="0.3" stop-color="${PALETTE.ink}" stop-opacity="0"/>` +
            `<stop offset="0.65" stop-color="${PALETTE.ink}" stop-opacity="0"/><stop offset="1" stop-color="${PALETTE.ink}" stop-opacity="0.6"/></linearGradient>` +
            // нутро плафона, освещённое колбой
            `<radialGradient id="gj-ll-inside" cx="0.5" cy="0.9" r="0.7"><stop offset="0" stop-color="${Lb.lit.core}"/><stop offset="0.45" stop-color="${Lb.glow}"/><stop offset="1" stop-color="${Lb.amber}"/></radialGradient>` +
            // колба: накал в середине, к краю янтарь
            `<radialGradient id="gj-ll-bulb" cx="0.45" cy="0.35" r="0.65"><stop offset="0" stop-color="${Lb.lit.core}"/><stop offset="0.5" stop-color="${Lb.lit.pear}"/><stop offset="1" stop-color="${Lb.glow}"/></radialGradient>` +
            // ореол вокруг колбы и вниз, на шар
            `<radialGradient id="gj-ll-halo"><stop offset="0" stop-color="${Lb.lit.core}" stop-opacity="0.95"/><stop offset="0.3" stop-color="${Lb.lit.pear}" stop-opacity="0.5"/><stop offset="0.6" stop-color="${Lb.glow}" stop-opacity="0.18"/><stop offset="1" stop-color="${Lb.glow}" stop-opacity="0"/></radialGradient>` +
            `<filter id="gj-ll-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.2"/></filter>` +
            `</defs>`;
        // силуэт колокола: плечи скруглены, бока выпуклые, низ шире
        const bell = `M${f(x - ht + 2.5)} ${f(t)} L${f(x + ht - 2.5)} ${f(t)} Q${f(x + ht)} ${f(t)} ${f(x + ht + 0.6)} ${f(t + 3)} ` +
            `Q${f(x + hr - 1.5)} ${f(r - 7)} ${f(x + hr)} ${f(r)} L${f(x - hr)} ${f(r)} Q${f(x - hr + 1.5)} ${f(r - 7)} ${f(x - ht - 0.6)} ${f(t + 3)} ` +
            `Q${f(x - ht)} ${f(t)} ${f(x - ht + 2.5)} ${f(t)} Z`;
        let o = defs;
        // тень плафона на то, что за ним: свет гаража сверху-слева
        o += `<path d="${bell}" fill="${ink}" opacity="0.35" filter="url(#gj-ll-blur)" transform="translate(1.6 2.2)"/>`;
        // лапка: стальная полоса от горловины вверх, на двух винтах к панели
        const ty = t - 9;
        o += `<rect x="${f(x - 3)}" y="${f(ty)}" width="6" height="${f(t - ty + 1)}" rx="1" fill="${J.tin[500]}" stroke="${ink}" stroke-width="${STROKE.detail}"/>` +
            `<path d="M${f(x - 2.2)} ${f(ty + 1)} L${f(x - 2.2)} ${f(t)}" stroke="${J.tin[100]}" stroke-width="0.7" opacity="0.7"/>` +
            [ty + 2.4, ty + 6].map(y => `<circle cx="${x}" cy="${f(y)}" r="1.25" fill="${J.tin[300]}" stroke="${ink}" stroke-width="0.5"/>` +
                `<path d="M${f(x - 0.8)} ${f(y + 0.5)} L${f(x + 0.8)} ${f(y - 0.5)}" stroke="${ink}" stroke-width="0.45"/>`).join('');
        // шнур в оплётке: из горловины вправо и вниз, под монеты рамки
        const cord = `M${f(x + 4)} ${f(t - 1.5)} C${f(x + 11)} ${f(t - 4)} ${f(x + 15)} ${f(t + 2)} ${f(x + 19)} ${f(t + 1)} S${f(x + 25)} ${f(t - 3)} 342 ${f(t + 2)}`;
        o += `<path d="${cord}" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>` +
            `<path d="${cord}" fill="none" stroke="${J.wood[700]}" stroke-width="1.5" stroke-linecap="round"/>` +
            `<path d="${cord}" fill="none" stroke="${J.wood[300]}" stroke-width="0.5" stroke-dasharray="0.8 1.1" opacity="0.8"/>`;
        // горловина: латунный стакан патрона с накаткой
        o += `<rect x="${f(x - 4.2)}" y="${f(t - 3.4)}" width="8.4" height="4.2" rx="1" fill="${J.brass.base}" stroke="${ink}" stroke-width="${STROKE.detail}"/>` +
            [-2.4, -0.8, 0.8, 2.4].map(d => `<path d="M${f(x + d)} ${f(t - 2.8)} L${f(x + d)} ${f(t + 0.2)}" stroke="${J.brass.lo}" stroke-width="0.5"/>`).join('') +
            `<path d="M${f(x - 3.4)} ${f(t - 2.6)} L${f(x + 1)} ${f(t - 2.6)}" stroke="${J.brass.hi}" stroke-width="0.6" stroke-linecap="round"/>`;
        // ореол — до колбы: колба и кромка лягут поверх
        o += `<ellipse cx="${x}" cy="${f(r + 3)}" rx="24" ry="15" fill="url(#gj-ll-halo)"/>`;
        // корпус плафона
        o += `<path d="${bell}" fill="url(#gj-ll-enamel)"/>` +
            `<path d="${bell}" fill="url(#gj-ll-side)"/>`;
        // прорези для жара: три штампованные щели на плече
        [-5, 0, 5].forEach(d => {
            o += `<rect x="${f(x + d - 1.6)}" y="${f(t + 2.4)}" width="3.2" height="1.3" rx="0.65" fill="${J.hole}"/>` +
                `<path d="M${f(x + d - 1.4)} ${f(t + 3.9)} L${f(x + d + 1.4)} ${f(t + 3.9)}" stroke="${E.scratch}" stroke-width="0.4" opacity="0.8"/>`;
        });
        // блик эмали по плечу, сколы до металла, ржавый потёк с кромки
        o += `<path d="M${f(x - ht + 2)} ${f(t + 1)} Q${f(x - 3)} ${f(t + 0.4)} ${f(x + 2)} ${f(t + 0.8)}" fill="none" stroke="${J.alu[100]}" stroke-width="0.9" stroke-linecap="round" opacity="0.55"/>` +
            `<path d="M${f(x - ht - 0.2)} ${f(t + 5)} Q${f(x - hr + 2)} ${f(r - 6)} ${f(x - hr + 1.2)} ${f(r - 2)}" fill="none" stroke="${E.scratch}" stroke-width="0.6" opacity="0.6"/>` +
            `<path d="M${f(x + 5.5)} ${f(t + 8)} l2.2 -0.7 l1 1.5 l-1.4 1.2 l-1.6 -0.3 z" fill="${J.tin[300]}" stroke="${E.lo}" stroke-width="0.35"/>` +
            `<path d="M${f(x - 8)} ${f(r - 5)} l1.6 -0.5 l0.6 1.1 l-1.5 0.6 z" fill="${J.tin[300]}" stroke="${E.lo}" stroke-width="0.35"/>` +
            `<path d="M${f(x + 9)} ${f(r - 1)} q0.4 2.6 -0.2 4.4" fill="none" stroke="${J.rust[500]}" stroke-width="1" stroke-linecap="round" opacity="0.7"/>`;
        // контур колокола
        o += `<path d="${bell}" fill="none" stroke="${ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>`;
        // нутро: из-под кромки видна освещённая изнанка (взгляд чуть снизу)
        o += `<path d="M${f(x - hr + 1.2)} ${f(r - 0.4)} Q${x} ${f(r - 5.5)} ${f(x + hr - 1.2)} ${f(r - 0.4)} Z" fill="url(#gj-ll-inside)"/>`;
        // колба — после изнанки: висит из горловины сквозь проём, ниже кромки
        const by = r + 2.8, br = L.bulb;
        o += `<circle cx="${x}" cy="${f(by)}" r="${br}" fill="url(#gj-ll-bulb)" stroke="${J.bulb.amber}" stroke-width="${STROKE.detail}"/>`;
        let zig = `M${f(x - 2.4)} ${f(by + 0.4)}`;
        for (let i = 1; i <= 6; i++) zig += ` L${f(x - 2.4 + 0.8 * i)} ${f(by + 0.4 + (i % 2 ? 0.9 : 0))}`;
        o += `<path d="${zig}" fill="none" stroke="${J.bulb.lit.core}" stroke-width="0.9" stroke-linejoin="round"/>` +
            `<path d="M${f(x - 2.4)} ${f(by - 3)} L${f(x - 2.4)} ${f(by + 0.4)} M${f(x + 2.4)} ${f(by - 3)} L${f(x + 2.4)} ${f(by + 0.4)}" stroke="${J.bulb.wire}" stroke-width="0.45"/>` +
            `<path d="M${f(x - 3.6)} ${f(by + 1.2)} Q${f(x - 3.2)} ${f(by + 3.6)} ${f(x - 0.8)} ${f(by + 4.4)}" fill="none" stroke="${J.bulb.lit.core}" stroke-width="0.8" stroke-linecap="round" opacity="0.9"/>`;
        // свечение поверх колбы: накал размывает её край — светит, а не
        // нарисован кружком
        o += `<ellipse cx="${x}" cy="${f(by + 0.5)}" rx="${f(br * 1.7)}" ry="${f(br * 1.35)}" fill="url(#gj-ll-halo)" opacity="0.8"/>`;
        // закатанная кромка: валик, по нему ободранная до стали полоса и
        // тёплый отсвет снизу от колбы
        o += `<rect x="${f(x - hr - 0.8)}" y="${f(r - 0.6)}" width="${f(2 * hr + 1.6)}" height="2.4" rx="1.2" fill="${E.lo}" stroke="${ink}" stroke-width="${STROKE.detail}"/>` +
            `<path d="M${f(x - hr + 1)} ${f(r + 0.2)} L${f(x - 3)} ${f(r + 0.2)}" stroke="${J.tin[300]}" stroke-width="0.6" stroke-linecap="round" opacity="0.8"/>` +
            `<path d="M${f(x - 6)} ${f(r + 1.3)} L${f(x + 6)} ${f(r + 1.3)}" stroke="${Lb.glow}" stroke-width="0.7" stroke-linecap="round" opacity="0.9"/>`;
        return `<g class="gj-lever-lamp">${o}</g>`;
    },

    leverMount() {
        const J = PALETTE.greedJunk, C = J.car, P = this.SLOTS.pivot, f = this.f;
        const rnd = this.rng(77);
        const x0 = P.x - 20, y0 = 384, x1 = P.x + 22, y1 = 464;      // низ стоит на верхней грани полки
        // Нижний край — рез болгаркой, прямой. Было: чуть наискось (резали
        // на глаз), но корпус стоит на полке, и косой низ на ровной доске
        // читался перекосом — справа под коробом зиял клин. До переделки
        // раскладки правый угол был под монетами рамки, и клина не было видно.
        // Ещё раньше: зубчатая «пила» — так режут ножницами по жести, а не
        // диском, и смотрелось это неряшливой каймой.
        const yl = y1 - 1, yr = y1 - 1;                // рез слева и справа
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
        let out = this.T(this.LEVER_H.box, 'paint', g);
        // фланец слева отогнут к ящику: узкая полоса в тени и три болта
        out += this.T(this.LEVER_H.flange, 'paint', `<path d="M${x0} ${y0 + 5} L${x0 + 4} ${y0 + 3} L${x0 + 4} ${y1 - 1.5} L${x0} ${y1 - 1} Z" fill="${C.lo}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            [402, 430, 454].map(y => this.bolt(x0 + 2, y, 1.6)).join(''));
        // Крышка корпуса: толстый загнутый край листа, на нём рамка юбки.
        // Юбка выходит из корпуса сквозь крышку, а не стоит на кромке, как
        // на полке. Корпус почти на уровне глаз — верх крышки виден ребром.
        out += this.T(this.LEVER_H.lid, 'paint', `<rect x="${x0 - 2}" y="${y0 - 5}" width="${x1 - x0 + 4}" height="8" rx="2.4" fill="${C.base}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
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
    // Крупнее, чем была (4.2): на телефоне лампа читалась точкой в 7 pt.
    READY_LAMP: { x: 325, y: 449, r: 6 },
    readyLampBody() {
        const J = PALETTE.greedJunk, Lm = J.lamp, R = this.READY_LAMP, f = this.f;
        let g = `<circle cx="${R.x}" cy="${R.y}" r="${R.r + 1.6}" fill="${J.tin[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            this.domeH(R.x, R.y, R.r + 1.6, 1);
        let cap = `<circle cx="${R.x}" cy="${R.y}" r="${R.r}" fill="${Lm.cap}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>` +
            // затёртость: матовые царапины и тёмный ободок у края
            `<circle cx="${R.x}" cy="${R.y}" r="${f(R.r - 0.6)}" fill="none" stroke="${Lm.capLo}" stroke-width="0.6" opacity="0.6"/>` +
            `<path d="M${f(R.x - 2.4)} ${f(R.y + 1.2)} L${f(R.x + 0.6)} ${f(R.y - 1.8)} M${f(R.x - 0.4)} ${f(R.y + 2.4)} L${f(R.x + 2)} ${f(R.y + 0.2)}" stroke="${Lm.capLo}" stroke-width="0.3" opacity="0.7"/>` +
            this.domeH(R.x, R.y, R.r, 2);
        // на коробе, а не в яме под ним (было 2 и 3 при коробе 7)
        return this.T(this.LEVER_H.lampRing, 'rubber', g) + this.T(this.LEVER_H.lampCap, 'plastic', cap);
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
        // два органа управления одного аппарата (решение игрока). Приёмник
        // лежит над лотком (WC_AT): трос идёт из кулисы вниз-влево, мимо
        // горла банки, в разъём коробки механизма — у лежачего она снизу.
        const B = this.SLOTS.wc, [ex, ey] = this.wcPt(B.x + B.w - 6 + 12 - 2.6, B.y + 8 + 5.6);
        const pts = [[306, 454], [300, 476], [276, 496], [248, 540], [ex + 9, ey + 0.5], [ex, ey]];
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
        out += ferrule(pts[0], pts[1]) + ferrule(pts[5], pts[4]);
        // Нижний конец — в разъём коробки монетоприёмника (greed-junk-wc.js),
        // втулки там нет.
        // Обе втулки — ПОД тросом: трос выходит из самой дыры втулки и в
        // дыру же уходит. Было: верхняя втулка лежала поверх, и трос
        // вылезал из-под её края, а дыра оставалась пустой.
        return this.grommet(pts[0][0], pts[0][1], this.LEVER_H.grommet) + this.T(this.LEVER_H.cable, 'rubber', out);
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
    // Рукоять над юбкой: шток короче, чем был (50), — рукоять не упирается в
    // кнопку пачинко над ней, две мишени для пальца не слипаются. При 32
    // шар в покое ложился на стык верхнего ящика и полку короба.
    LEVER_REACH: 29,
    leverGeom(pull) {
        const P = this.SLOTS.pivot;
        const th = pull * this.LEVER_TILT * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
        const squash = Math.max(0, sn);
        const base = P.y - 16, h0 = 40 * (1 - 0.45 * squash), top = base - h0;
        const K = { x: P.x, y: top - this.LEVER_REACH * cs, r: 15 * (1 + 0.15 * sn) };
        return { base, h0, top, K, s0: K.y + K.r - 2, cs, sn, bootW: 1 + 0.12 * squash };
    },
    // Части рычага отдельно — для рывка. Вместе — leverSvg.
    leverParts(noPattern) {
        const J = PALETTE.greedJunk, P = this.SLOTS.pivot, V = this.VP || { y: 388 }, f = this.f, LH = this.LEVER_H;
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
            // Валики встык, без нахлёста: нахлёст (0.62) клал край следующего
            // валика поверх склона предыдущего — ниже его, и в складке выходила
            // канавка (tools/greed-sink.js).
            const ry = h0 / rings * 0.5;
            bootH += `<g transform="translate(${f(P.x)} ${f(y)}) scale(1 ${f(ry / (w / 2))}) translate(${f(-P.x)} ${f(-y)})">${this.domeH(P.x, y, w / 2, LH.ribRise)}</g>`;
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
            this.rodH(`M${P.x} ${f(s0)} L${P.x} ${f(top)}`, sw, LH.shaftRise);
        // Втулка рукояти: хромовый стакан, в который вкручен шар. Своя часть,
        // ПОВЕРХ низа шара (гнездо): шток уходит под неё. Было — под шаром, и
        // низ шара, нарисованный поверх, был ниже стакана: канава по низу
        // шара, светлая кайма в покое (docs/bench/greed-audit.md, разд. 8).
        const cup = `<rect x="${P.x - 4.6}" y="${f(s0 + 1)}" width="9.2" height="6" rx="1.4" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<rect x="${P.x - 3}" y="${f(s0 + 2)}" width="1.2" height="4" fill="${J.tin[100]}"/><rect x="${P.x + 0.6}" y="${f(s0 + 2)}" width="1.6" height="4" fill="${J.tin[700]}"/>` +
            this.rodH(`M${P.x} ${f(s0 + 2)} L${P.x} ${f(s0 + 6)}`, 9, LH.cupRise);
        // схема передач гравировкой: три вертикали через поперечину,
        // точки на концах; лежит на шаре чуть ниже его поверхности
        const KP = this.knobPattern(K.x, K.y, K.r, this.KNOB_PHI);
        let pattern = KP.lines.map(l => `<polyline points="${l.map(q => `${f(q[0])},${f(q[1])}`).join(' ')}" fill="none"/>`).join('');
        let dots = KP.dots.map(d => `<circle cx="${f(d[0])}" cy="${f(d[1])}" r="${f(d[2])}"/>`).join('');
        const rise = LH.ballRise;
        const knob = `<circle cx="${K.x + 1.5}" cy="${K.y + 2.5}" r="${K.r}" class="fx" fill="${J.hole}" opacity="0.3"/>` +
            `<circle cx="${K.x}" cy="${K.y}" r="${K.r}" fill="${J.tin[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.contour}"/>` +
            // Купол — на всю толщину контура: контур снаружи радиуса лежал на
            // карте высот плоским кольцом у подножия купола, глянец ловил на
            // нём свет, и вокруг шара читался резиновый обод (игрок: «такая
            // окантовка бывает у круга, но не у шара»). Теперь край — склон
            // сферы.
            this.domeH(K.x, K.y, K.r + STROKE.contour / 2, rise) +
            (noPattern ? '' : `<g style="--dh:${this.dh(rise * 0.9)}">` +
            `<g stroke="${J.paint.cream}" stroke-width="${STROKE.structure}" stroke-linecap="round" stroke-linejoin="round">${pattern}</g>` +
            `<g fill="${J.paint.cream}">${dots}</g></g>`) +
            `<ellipse cx="${K.x - 6}" cy="${K.y - 7.5}" rx="4.6" ry="2.6" class="hl" fill="${J.tin[300]}" opacity="0.55" transform="rotate(-35 ${K.x - 6} ${K.y - 7.5})"/>`;
        return {
            boot: this.T(LH.boot, 'rubber', boot + bootH),
            frame: this.bootFrame(),
            shaft: this.T(LH.shaft, 'polished', shaft),
            clamp: this.T(LH.clamp, 'steel', clamp),
            knob: this.T(LH.ball, 'bakelite', knob),
            cup: this.T(LH.cup, 'polished', cup)
        };
    },
    // Высоты рычага (единицы карты высот; потолок 20). Правило: часть выше
    // того, на чём лежит и что нарисовано под ней (tools/greed-sink.js).
    // Под рычагом — табло (9) и стойка (6); короб рычага — на табло.
    //   короб 9.3, фланец 9.6, крышка 10; лампа готовности — на коробе;
    //   юбка 9.5, валики +3 → 12.5; рамка и хомут поверх юбки — 12.6;
    //   шток 9.2 (+2.5) — лежит на табло, концы под хомутом и стаканом;
    //   шар 9.5 (+10.5 → 20) — край выше табло;
    //   стакан 12 (+2) — поверх низа шара (там шар до 11.8).
    // Было: шар 8 на табло 9, стакан 9+3.4 под низом шара, короб 7 на табло
    // 9, лампа 2–3 в коробе — канавы по контурам, светлая кайма в покое.
    LEVER_H: { box: 9.3, flange: 9.6, lid: 10, lampRing: 9.4, lampCap: 9.9, cable: 10, grommet: 9.4,
        boot: 9.5, ribRise: 3, frame: 12.6, shaft: 9.2, shaftRise: 2.5, clamp: 12.6, ball: 9.5, ballRise: 10.5, cup: 12, cupRise: 2 },
    // Стакан — после шара: поверх его низа.
    LEVER_ORDER: ['boot', 'frame', 'shaft', 'clamp', 'knob', 'cup'],
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
        return this.T(this.LEVER_H.frame, 'plastic', `<rect x="${P.x - w / 2 + 1}" y="${y - 1.6}" width="${w - 2}" height="2" class="fx" fill="${J.hole}" opacity="0.5"/>` +
            `<rect x="${P.x - w / 2}" y="${y}" width="${w}" height="${h}" rx="2.6" fill="${J.tin[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<line x1="${P.x - w / 2 + 3}" y1="${y + 1.2}" x2="${P.x + w / 2 - 3}" y2="${y + 1.2}" class="hl" stroke="${J.tin[500]}" stroke-width="${STROKE.hairline}"/>` +
            this.rodH(`M${P.x - w / 2 + 3} ${y + h / 2} L${P.x + w / 2 - 3} ${y + h / 2}`, h - 1, 1.4) +
            this.bolt(P.x - w / 2 + 3.6, y + h / 2, 1.3) + this.bolt(P.x + w / 2 - 3.6, y + h / 2, 1.3));
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
        const vb = crop ? `${crop.x} ${crop.y} ${crop.w} ${crop.h}` : `0 ${this.Y0} ${this.W} ${this.H}`;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">` +
            this.passStyle(this.pass) +
            this.defs().replace('</defs>', clip + '</defs>') +
            this.plinth() + this.body() + this.topBox() + this.head() + this.topPostEnds() + this.topShade() + this.leverMount() +
            (lever === false ? '' : this.leverSvg()) +
            `</svg>`;
    },
});
