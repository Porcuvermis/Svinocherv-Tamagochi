// АППАРАТ АЛЧНОСТИ: ВЕРХНИЙ ЯЩИК — КРЕПЛЕНИЯ, КАБЕЛЬ, ГОРБЫЛЬ, РАМКА
// Продолжение GreedJunk (greed-junk.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после greed-junk.js.
Object.assign(GreedJunk, {

    // ---------- ЧАСТИ КОРПУСА ----------
    // Задний щит с креплениями. Креплениями, а НЕ гнёздами по форме игр:
    // сначала на корпус ставится переходник своей формы, к нему цепляются
    // провода, и только на него — аппаратура (референс docs/ref/greed-machine-junk-empty.jpg).
    topBox() {
        const J = PALETTE.greedJunk, S = this.SLOTS, f = this.f;
        // Задняя стенка ящика: она в глубине, поэтому темнее рамки — свет до
        // неё доходит хуже.
        let out = this.backPlanks(28, 24, 288, 270, 211);
        out += `<rect x="28" y="24" width="288" height="270" class="fx" fill="${J.hole}" opacity="0.28"/>`;
        out += `<rect x="28" y="24" width="288" height="270" class="fx" fill="url(#gj-vign)"/>`;
        // карандашная разметка будущих игр — на стенке, под креплениями
        out += this.pencilMarks();
        // поперечина-перекладина, на которой всё висит
        out += this.slabBar();
        // жалюзи и лампа питания внизу ящика (greed-junk-parts.js, louverStrip)
        out += this.louverStrip(34, 270, 276, 20);

        // ---- крепление колеса: ступица от машины на перфоуголке ----
        const w = S.wheel;
        out += this.wheelMount(w.cx, w.cy);
        out += this.socketHome(65, 58);
        out += this.powerCable();
        // провода будущего мотора колеса — из втулки в пластине ступицы
        out += this.harness(w.cx + 40, w.cy - 28, 28, 34, false);
        // латка из крышки банки и блок питания (greed-junk-parts.js)
        out += this.canLid(64, 244);
        out += this.psu(146, 204);
        // от блока питания — к ступице колеса (питание мотора): из сальника
        // на верхней кромке блока в сальник на пластине
        out += this.T(3, 'rubber', this.conduit(this.feedPath(this.PORTS.psuA, this.PORTS.hub, [[160, 186]])));

        // ---- крепление пачинко: два рельса, полка-упор и розетка сбоку ----
        const p = S.pachinko;
        // от блока питания — к правой розетке, в её брусок снизу. Идёт по
        // стенке ЗА левым рельсом (он стоит на скобах, под ним просвет):
        // поверх рельса гофра мешала бы коробу пачинко.
        // Была ещё распаечная коробка с отводом обратно к розетке — две гофры
        // рядом в одну коробку и петля питания читались путаницей.
        out += this.T(3, 'rubber', this.conduit(this.feedPath(this.PORTS.psuB, this.PORTS.brick, [[196, 182], [218, 186], [232, 204]])));
        out += this.rail(p.x + 8, p.y + 6, 14, p.h - 24, -1, 41);
        out += this.rail(p.x + p.w - 34, p.y + 6, 14, p.h - 24, 1, 42);
        // полка-упор, на которую встанет короб (greed-junk-parts.js, shelfAngle)
        out += this.shelfAngle(p.x - 2, p.y + p.h - 38, 96);
        // подвес короба пачинко между рельсами (greed-junk-parts.js, hanger)
        out += this.hanger(p.x + 32, p.y + 50, p.w - 70, 70);
        // Промышленное гнездо на бруске между рельсами; провода пачинко
        // выходят из втулки в том же бруске — отвод от питания розетки.
        out += this.socketPanel(p.x + 34, p.y + 130);
        out += this.harness(p.x + 58, p.y + 158.5, 28, 45, false);
        // штуцеры гофр — ПОСЛЕ всех деталей: конец гофры уходит под гайку
        // штуцера, а штуцер сидит на своей детали поверх неё
        out += ['psuA', 'psuB', 'hub', 'brick'].map(k => this.port(this.PORTS[k])).join('');
        out += this.topFrame();
        return out;
    },

    // ---------- КРЕПЛЕНИЕ КОЛЕСА ----------
    // Ось колеса — ступица с тормозным диском от старой машины: колесо
    // фортуны сядет на её колёсные шпильки, как автомобильное. Держат
    // ступицу три куска перфорированного уголка, сходящиеся к ней с разных
    // сторон и разной длины, — из чего было. Концы уголков посажены на
    // глухари с широкими шайбами: в доску по-другому не прикрутишь.
    // Раньше тут была крестовина из двух полос — читалась знаком «плюс».
    wheelMount(cx, cy) {
        let out = '';
        out += this.angleIron(156, 54, cx + 4, cy - 8, 511);
        out += this.angleIron(118, 262, cx + 2, cy + 8, 512);
        out += this.angleIron(cx + 10, cy + 2, 196, cy + 6, 513);
        // переходная пластина под ступицей: вырезана болгаркой, углы косые
        out += this.cutPlate(cx, cy, 514);
        out += this.brakeDisc(cx, cy);
        return out;
    },

    // Перфорированный уголок от (x1,y1) до (x2,y2): лицевая полка с рядом
    // дыр — круглые через одну с продолговатыми, — и вторая полка, видимая
    // ребром узкой тёмной полосой снизу. На концах — глухари с шайбами.
    angleIron(x1, y1, x2, y2, seed) {
        const J = PALETTE.greedJunk, f = this.f;
        const len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        const W = 12, lip = 3.2;
        let g = '';
        // тень: уголок стоит на ребре второй полки, приподнят
        g += `<rect x="1.5" y="${f(-W / 2 + 3)}" width="${f(len)}" height="${W + lip}" class="fx" fill="${J.hole}" opacity="0.32"/>`;
        // вторая полка ребром — тёмная
        g += `<rect x="0" y="${f(W / 2 - 0.5)}" width="${f(len)}" height="${lip}" fill="${J.primer.lo}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;
        // лицевая полка — в красном грунте-сурике: уголок купили крашеным
        g += `<rect x="0" y="${f(-W / 2)}" width="${f(len)}" height="${W}" fill="url(#gj-primer)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        g += `<line x1="1" y1="${f(-W / 2 + 1)}" x2="${f(len - 1)}" y2="${f(-W / 2 + 1)}" class="hl" stroke="${J.primer.hi}" stroke-width="${STROKE.detail}" opacity="0.8"/>`;
        // сколы грунта до серого железа
        const rr = this.rng(seed);
        for (let i = 0; i < 4; i++) {
            const t = 10 + rr() * (len - 20), yy = (rr() - 0.5) * (W - 4);
            g += `<ellipse cx="${f(t)}" cy="${f(yy)}" rx="${f(1.5 + rr() * 2.5)}" ry="${f(1 + rr())}" fill="${J.tin[500]}" opacity="0.85"/>`;
        }
        // перфорация
        let k = 0;
        for (let t = 14; t < len - 12; t += 9, k++) {
            g += k % 2
                ? `<rect x="${f(t - 3)}" y="-1.5" width="6" height="3" rx="1.5" class="pit" fill="${J.hole}"/>`
                : `<circle cx="${f(t)}" cy="0" r="1.7" class="pit" fill="${J.hole}"/>`;
        }
        // ржавчина по кромке
        g += `<line x1="${f(len * 0.2)}" y1="${f(W / 2 - 1)}" x2="${f(len * 0.55)}" y2="${f(W / 2 - 1)}" stroke="${J.rust[500]}" stroke-width="1.6" opacity="0.5"/>`;
        let out = `<g transform="translate(${f(x1)} ${f(y1)}) rotate(${f(ang)})">${g}</g>`;
        out += this.lagBolt(x1 + (x2 - x1) * 6 / len, y1 + (y2 - y1) * 6 / len);
        return out;
    },

    // Глухарь с шайбой: широкая шайба, шестигранная головка, блик слева сверху.
    lagBolt(x, y) {
        const J = PALETTE.greedJunk, f = this.f;
        const hex = [0, 1, 2, 3, 4, 5].map(i => {
            const a = i * Math.PI / 3 + 0.3;
            return f(x + Math.cos(a) * 3.6) + ',' + f(y + Math.sin(a) * 3.6);
        }).join(' ');
        return `<circle cx="${f(x + 0.8)}" cy="${f(y + 1.3)}" r="6" class="fx" fill="${J.hole}" opacity="0.35"/>` +
            `<circle cx="${f(x)}" cy="${f(y)}" r="6" fill="url(#gj-tin)" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<polygon points="${hex}" fill="${J.tin[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<circle cx="${f(x - 1)}" cy="${f(y - 1)}" r="1.2" fill="${J.tin[100]}" opacity="0.8"/>`;
    },

    // Пластина-переходник: неровный многоугольник с косыми углами.
    cutPlate(cx, cy, seed) {
        const J = PALETTE.greedJunk, f = this.f;
        const rnd = this.rng(seed);
        const pts = [], radii = [];
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2 + 0.2, r = 45 + rnd() * 7;
            radii.push(r);
            pts.push(f(cx + Math.cos(a) * r) + ' ' + f(cy + Math.sin(a) * r));
        }
        const d = 'M' + pts.join(' L') + ' Z';
        let out = `<path d="${d}" class="fx" fill="${J.hole}" opacity="0.3" transform="translate(1.2 1.8)"/>`;
        // сырая сталь, тёмная, в синеву окалины — пластину резали из листа
        out += `<path d="${d}" fill="url(#gj-raw)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>`;
        out += `<path d="${d}" class="fx" fill="url(#gj-dirt)"/>`;
        // Отверстия у каждого угла: пластину сверлили под крепёж «с запасом»,
        // а прикрутили на три болта — остальные дыры пустые, с блестящей
        // заусеницей по нижней кромке (металл свежий, не успел потемнеть).
        // Раньше пустые дыры были разбросаны по доскам кругом — ни к чему
        // не относились и висели в воздухе.
        const used = [0, 3, 5];
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2 + 0.2;
            const hx = cx + Math.cos(a) * (radii[i] - 8), hy = cy + Math.sin(a) * (radii[i] - 8);
            if (used.indexOf(i) !== -1) { out += this.bolt(hx, hy, 2.6); continue; }
            out += `<circle cx="${f(hx)}" cy="${f(hy)}" r="2.7" class="pit" fill="${J.hole}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                `<path d="M${f(hx - 2.7)} ${f(hy + 0.4)} a2.7 2.7 0 0 0 5.4 0" fill="none" class="hl" stroke="${J.tin[100]}" stroke-width="${STROKE.detail}" opacity="0.8"/>`;
        }
        // следы болгарки по краю — короткие светлые чёрточки
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2 + 0.6;
            out += `<line x1="${f(cx + Math.cos(a) * 39)}" y1="${f(cy + Math.sin(a) * 39)}" x2="${f(cx + Math.cos(a) * 43)}" y2="${f(cy + Math.sin(a) * 43)}" stroke="${J.tin[300]}" stroke-width="${STROKE.hairline}" opacity="0.8"/>`;
        }
        return out;
    },

    // Тормозной диск со ступицей. Рабочая полоса диска блестит (по ней
    // ходили колодки — концентрические риски), кромка и центр ржавые.
    // Колпак ступицы выступает выше диска — своя тень. Пять колёсных
    // шпилек и гайка оси со шплинтом.
    brakeDisc(cx, cy) {
        const J = PALETTE.greedJunk, f = this.f;
        let out = '';
        out += `<circle cx="${cx + 2.4}" cy="${cy + 3.8}" r="31" class="fx" fill="${J.hole}" opacity="0.38"/>`;
        out += `<circle cx="${cx}" cy="${cy}" r="31" fill="url(#gj-tin)" stroke="${PALETTE.ink}" stroke-width="${STROKE.contour}"/>`;
        // риски от колодок
        for (let r = 20; r <= 28; r += 1.6) {
            out += `<circle cx="${cx}" cy="${cy}" r="${f(r)}" fill="none" stroke="${r % 3.2 < 1.6 ? J.tin[100] : J.tin[700]}" stroke-width="${STROKE.hairline}" opacity="0.55"/>`;
        }
        // ржавая кромка
        out += `<circle cx="${cx}" cy="${cy}" r="29.6" fill="none" stroke="${J.rust[500]}" stroke-width="2.4" opacity="0.6"/>`;
        // блик на рабочей полосе — сверху слева
        out += `<path d="M${f(cx - 24)} ${f(cy - 8)} A25 25 0 0 1 ${f(cx - 6)} ${f(cy - 24)}" fill="none" class="hl" stroke="${J.tin[100]}" stroke-width="3" stroke-linecap="round" opacity="0.6"/>`;
        // колпак ступицы — выше диска
        const disc = out;
        out = '';
        out += `<circle cx="${cx + 1.6}" cy="${cy + 2.6}" r="17" class="fx" fill="${J.hole}" opacity="0.4"/>`;
        out += `<circle cx="${cx}" cy="${cy}" r="17" fill="url(#gj-tin-dark)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        out += `<circle cx="${cx}" cy="${cy}" r="17" fill="none" stroke="${J.rust[700]}" stroke-width="2" opacity="0.5"/>`;
        out += this.domeH(cx, cy, 17, 2);
        // колёсные шпильки
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
            const sx = cx + Math.cos(a) * 11.5, sy = cy + Math.sin(a) * 11.5;
            out += `<circle cx="${f(sx + 1.2)}" cy="${f(sy + 1.8)}" r="2.6" class="fx" fill="${J.hole}" opacity="0.45"/>` +
                `<circle cx="${f(sx)}" cy="${f(sy)}" r="2.6" fill="${J.tin[300]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                `<circle cx="${f(sx)}" cy="${f(sy)}" r="1.4" fill="none" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>`;
        }
        // гайка оси со шплинтом
        const hex = [0, 1, 2, 3, 4, 5].map(i => {
            const a = i * Math.PI / 3;
            return f(cx + Math.cos(a) * 5.6) + ',' + f(cy + Math.sin(a) * 5.6);
        }).join(' ');
        out += `<polygon points="${hex}" fill="${J.tin[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
            `<circle cx="${cx}" cy="${cy}" r="2.4" fill="${J.tin[900]}"/>` +
            `<path d="M${cx - 3.5} ${cy - 0.5} q3.5 -2 7 0" fill="none" stroke="${J.paint.yellow}" stroke-width="1.1" opacity="0.8"/>` +
            `<circle cx="${cx - 1.6}" cy="${cy - 2}" r="1" class="hl" fill="${J.tin[100]}"/>`;
        return disc + this.T(13, 'steel', out);
    },

    // ---------- КАБЕЛЬ ПИТАНИЯ РОЗЕТКИ ----------
    // Розетка СВОБОДНА: в неё включат колесо, когда его купят, и занятая
    // вилкой она обещала бы, что колесо уже есть. Кабель — это подводка
    // самой розетки: выходит снизу из её коробки через сальник, спускается
    // вдоль боковины в обход ступицы на клипсах и уходит в блок питания —
    // от него вся проводка ящика (обе розетки и мотор колеса).
    powerCable() {
        const J = PALETTE.greedJunk, f = this.f;
        // от розетки вниз вдоль боковины, в обход ступицы, к блоку питания
        const pts = [[65, 71], [64, 88], [57, 104], [52, 124], [50, 160], [51, 196], [60, 214], [90, 222], [120, 224], [148, 226]];
        const d = this.smooth(pts);
        let out = '';
        // тень: кабель лежит на стенке почти вплотную
        out += `<path d="${d}" fill="none" class="fx" stroke="${J.hole}" stroke-width="5" stroke-linecap="round" opacity="0.32" transform="translate(1.2 2)"/>`;
        out += `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="5.4" stroke-linecap="round"/>`;
        out += `<path d="${d}" fill="none" stroke="${J.tin[900]}" stroke-width="3.4" stroke-linecap="round"/>`;
        // блик по кабелю: он круглый, свет ложится узкой линией слева-сверху
        out += `<path d="${d}" fill="none" class="hl" stroke="${J.tin[500]}" stroke-width="0.8" stroke-linecap="round" opacity="0.8" transform="translate(-0.9 -0.4)"/>`;
        out += this.rodH(d, 5.4);
        // сальник на коробке розетки: короткий рифлёный хвостовик
        out += `<path d="M61.5 67 L68.5 67 L67.5 74 L62.5 74 Z" fill="${J.tin[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`;
        [69.4, 71.6].forEach(y => { out += `<line x1="62.4" y1="${y}" x2="67.6" y2="${y}" stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>`; });
        // клипсы: белая пластиковая скоба поперёк кабеля и гвоздик
        [[64, 90, 4], [50.5, 168, -2], [104, 223.5, 92]].forEach(([x, y, a]) => {
            out += this.T(4, 'plastic', `<g transform="rotate(${a} ${x} ${y})">` +
                `<rect x="${x - 6.5}" y="${y - 3}" width="13" height="6" rx="2.6" fill="${J.paint.cream}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                `<line x1="${x - 4}" y1="${y - 1.6}" x2="${x + 4}" y2="${y - 1.6}" class="hl" stroke="${J.tin[100]}" stroke-opacity="0.8" stroke-width="${STROKE.hairline}"/>` +
                `</g>` + this.ironNail(x + (a > 0 ? 4 : -4), y));
        });
        return out;
    },

    // ---------- ПЕРЕКЛАДИНА: ГОРБЫЛЬ ----------
    // Своя история у перекладины: это горбыль — боковой обрезок бревна, его
    // на лесопилке отдают даром. Пиленая грань в дугах от циркулярки,
    // верхний край — в коре, брусок сужается к одному концу и прибит криво,
    // на глаз. Концы заведены за боковины ящика: доски не хватило бы
    // вплотную, и её просто положили поверх с запасом.
    slabBar() {
        const J = PALETTE.greedJunk, f = this.f;
        const rnd = this.rng(313);
        const X0 = 30, X1 = 314, CY = 160, TILT = -2.6;
        const N = 18;
        const top = [], bot = [], bark = [];
        for (let i = 0; i <= N; i++) {
            const t = i / N, x = X0 + (X1 - X0) * t;
            const half = 16 - t * 6;                       // сужается вправо
            const ty = CY - half + (rnd() - 0.5) * 5 - (rnd() < 0.15 ? 3 : 0);    // кора — край рваный, с выбоинами
            top.push([x, ty]);
            bark.push([x, ty + 4.5 + rnd() * 4]);          // толщина коры гуляет
            bot.push([x, CY + half * 0.8 + (rnd() - 0.5) * 0.8]);  // пропил — почти ровный
        }
        const line = pts => pts.map(p => f(p[0]) + ' ' + f(p[1])).join(' L');
        const body = `M${line(top)} L${line(bot.slice().reverse())} Z`;
        const barkBand = `M${line(top)} L${line(bark.slice().reverse())} Z`;
        let g = '';
        // тень на заднюю стенку: горбыль толстый
        g += `<path d="${body}" class="fx" fill="${J.hole}" opacity="0.4" transform="translate(2.5 4.5)"/>`;
        g += `<clipPath id="gj-slab"><path d="${body}"/></clipPath>`;
        g += `<path d="${body}" fill="url(#gj-slab-face)"/>`;
        // дуги циркулярки: большие радиусы, шаг неровный — пилу вели рукой
        let arcs = '';
        for (let x = X0 + 4; x < X1; x += 6 + rnd() * 5) {
            const r = 60 + rnd() * 30;
            arcs += `<path d="M${f(x)} ${CY - 16} A${f(r)} ${f(r)} 0 0 1 ${f(x + 4)} ${CY + 14}" fill="none" ` +
                `stroke="${J.slab.saw}" stroke-width="${STROKE.hairline}" opacity="${f(0.35 + rnd() * 0.35)}"/>`;
        }
        // продольные трещины выветренной древесины
        for (let i = 0; i < 4; i++) {
            const x = X0 + 20 + rnd() * (X1 - X0 - 60), y = CY - 2 + (rnd() - 0.3) * 8;
            arcs += `<path d="M${f(x)} ${f(y)} q${f(10 + rnd() * 10)} ${f((rnd() - 0.5) * 2)} ${f(24 + rnd() * 20)} ${f((rnd() - 0.5) * 2)}" ` +
                `fill="none" stroke="${J.slab.faceLo}" stroke-width="${STROKE.detail}" opacity="0.8"/>`;
        }
        g += `<g clip-path="url(#gj-slab)">${arcs}`;
        // луб — рыжая полоска под корой
        g += `<path d="M${line(bark)}" fill="none" stroke="${J.slab.bast}" stroke-width="2" opacity="0.9"/>`;
        // кора: тёмная подложка и поверх светлые чешуйки-пластины разной
        // ширины, разделённые трещинами. Сплошной тёмной полосой кора
        // читалась тенью.
        g += `<path d="${barkBand}" fill="${J.slab.bark}"/>`;
        for (let i = 0; i < top.length - 1; i++) {
            const a = top[i], b = top[i + 1], c = bark[i + 1], d = bark[i];
            let u = 0;
            while (u < 0.95) {
                const v = Math.min(1, u + 0.18 + rnd() * 0.3);
                const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
                const p1 = lerp(a, b, u + 0.04), p2 = lerp(a, b, v - 0.04), p3 = lerp(d, c, v - 0.06), p4 = lerp(d, c, u + 0.06);
                g += `<path d="M${f(p1[0])} ${f(p1[1] + 0.8)} L${f(p2[0])} ${f(p2[1] + 0.8)} L${f(p3[0])} ${f(p3[1] - 0.8)} L${f(p4[0])} ${f(p4[1] - 0.8)} Z" ` +
                    `fill="${J.slab.barkHi}" opacity="${f(0.55 + rnd() * 0.4)}"/>`;
                u = v;
            }
        }
        g += `</g>`;
        // нижняя кромка пропила ловит меньше света — тёмная линия
        g += `<path d="M${line(bot)}" fill="none" stroke="${J.slab.saw}" stroke-width="${STROKE.detail}" opacity="0.8" transform="translate(0 -1.2)"/>`;
        g += `<path d="${body}" fill="none" stroke="${PALETTE.ink}" stroke-width="${STROKE.contour}" stroke-linejoin="round"/>`;
        // гнутые гвозди: забили, согнулись, добили боком
        [[58, 1], [176, -1], [282, 1]].forEach(([x, dir]) => {
            const y = CY + 2 - (x - X0) / (X1 - X0) * 2;
            g += `<path d="M${x} ${y} q${dir * 4} -1 ${dir * 7} 3" fill="none" stroke="${PALETTE.ink}" stroke-width="2.6" stroke-linecap="round"/>` +
                `<path d="M${x} ${y} q${dir * 4} -1 ${dir * 7} 3" fill="none" stroke="${J.tin[500]}" stroke-width="1.3" stroke-linecap="round"/>` +
                `<circle cx="${x + dir * 7}" cy="${y + 3}" r="1.8" fill="${J.tin[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>` +
                this.rustRun(x, y + 2, 7, x);
        });
        return `<g transform="rotate(${TILT} ${(X0 + X1) / 2} ${CY})">${g}</g>`;
    },

    // ---------- РАМКА ЯЩИКА ----------
    // Верх — не щит, а ЯЩИК без передней стенки: в анфас его толщину видно
    // только по рамке из толстых досок (крышка и две боковины) и по теням,
    // которые рамка бросает внутрь на заднюю стенку — сверху и слева, от
    // света сверху-слева. Крышка шире боковин и нависает: её положили
    // сверху, а не вставили между ними.
    topFrame() {
        const J = PALETTE.greedJunk, f = this.f;
        const IN = { x: 42, y: 36, w: 260, h: 254 };     // проём ящика
        let out = '';
        // тени от рамки на заднюю стенку
        out += `<rect x="${IN.x}" y="${IN.y}" width="${IN.w}" height="22" class="fx" fill="url(#gj-shade)"/>`;
        out += `<rect x="${IN.x}" y="${IN.y}" width="16" height="${IN.h}" class="fx" fill="url(#gj-shade-x)"/>`;
        // боковины: толстые доски, торцом к нам
        out += this.T(14, 'pine', this.planks(24, 30, 18, 262, 1, 13, 'v', 0, 'pine'));
        out += this.T(14, 'pine', this.planks(302, 30, 18, 262, 1, 14, 'v', 0, 'pine'));
        // освещённая кромка левой боковины, тёмная — правой (её грань
        // отвёрнута от света)
        out += `<line x1="26" y1="36" x2="26" y2="288" class="hl" stroke="${J.wood[100]}" stroke-width="${STROKE.detail}" opacity="0.6"/>`;
        out += `<line x1="317" y1="36" x2="317" y2="288" stroke="${J.wood[900]}" stroke-width="${STROKE.structure}" opacity="0.6"/>`;
        // тень крышки на боковины
        out += this.shade(24, 34, 18, 8) + this.shade(302, 34, 18, 8);
        // крышка, нависает над боковинами
        out += this.T(16, 'lacquer', this.planks(16, 14, 312, 22, 1, 15, 'h', 0, 'painted'));
        out += `<line x1="20" y1="16.5" x2="324" y2="16.5" class="hl" stroke="${J.wood[100]}" stroke-width="${STROKE.detail}" opacity="0.7"/>`;
        out += this.cornerBracket(1) + this.cornerBracket(-1);
        return out;
    },

    // Уголок на стыке крышки и боковины: гнутая Г-образная пластина,
    // одно плечо на крышке, другое на боковине. Выдавленное ребро
    // жёсткости по диагонали угла, три шурупа, рыжая кромка там, где
    // стоит вода. side: 1 — левый, −1 — правый (зеркально по оси ящика).
    cornerBracket(side) {
        const J = PALETTE.greedJunk, f = this.f;
        const AX = 172;                                   // ось симметрии ящика
        const X = x => side > 0 ? x : AX * 2 - x;
        const pt = (x, y) => f(X(x)) + ' ' + f(y);
        // контур Г: скруглённый внешний угол, мягкая галтель внутри
        const d = `M${pt(20, 20)} Q${pt(20, 15)} ${pt(25, 15)} L${pt(60, 15)} Q${pt(62, 15)} ${pt(62, 17)} ` +
            `L${pt(62, 32)} Q${pt(62, 34)} ${pt(60, 34)} L${pt(48, 34)} Q${pt(45, 34)} ${pt(45, 37)} ` +
            `L${pt(45, 62)} Q${pt(45, 64)} ${pt(43, 64)} L${pt(22, 64)} Q${pt(20, 64)} ${pt(20, 62)} Z`;
        let out = `<path d="${d}" class="fx" fill="${J.hole}" opacity="0.2" transform="translate(0.6 0.9)"/>`;
        out += `<path d="${d}" fill="url(#gj-tin)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}" stroke-linejoin="round"/>`;
        out += `<path d="${d}" class="fx" fill="url(#gj-dirt)"/>`;
        // фаска: верхние кромки ловят свет, нижние в тени
        out += `<path d="M${pt(23, 16.6)} L${pt(60, 16.6)}" class="hl" stroke="${J.tin[100]}" stroke-width="${STROKE.detail}" opacity="0.85"/>`;
        out += `<path d="M${pt(60, 32.6)} L${pt(48, 32.6)} M${pt(43.6, 38)} L${pt(43.6, 62.6)} L${pt(22, 62.6)}" ` +
            `fill="none" stroke="${J.tin[900]}" stroke-width="${STROKE.detail}" opacity="0.7"/>`;
        out += `<path d="M${pt(21.5, 21)} L${pt(21.5, 61)}" stroke="${side > 0 ? J.tin[100] : J.tin[900]}" ` +
            `stroke-width="${STROKE.detail}" opacity="${side > 0 ? 0.7 : 0.6}"/>`;
        // ребро жёсткости: светлая и тёмная дуга рядом — выдавлено наружу
        out += `<path d="M${pt(27, 25)} L${pt(37, 36)}" class="hl" stroke="${J.tin[100]}" stroke-width="${STROKE.structure}" stroke-linecap="round" opacity="0.8"/>` +
            `<path d="M${pt(28.4, 26.6)} L${pt(38.4, 37.6)}" stroke="${J.tin[900]}" stroke-width="${STROKE.detail}" stroke-linecap="round" opacity="0.7"/>`;
        // ржавая кромка по низу плеч
        out += `<path d="M${pt(46, 33)} L${pt(60, 33)} M${pt(22, 63)} L${pt(43, 63)}" stroke="${J.rust[500]}" stroke-width="2" opacity="0.45"/>`;
        // шурупы и потёки под ними
        [[54, 24.5], [32.5, 48], [32.5, 58]].forEach(([x, y], i) => {
            if (i !== 1) out += this.rustRun(X(x), y + 2, 5 + i * 2, 160 + i + side);
            out += this.bolt(X(x), y, 2);
        });
        return out;
    },

    // Табло с барабанами: облезлая крашеная жесть.
    head() {
        const J = PALETTE.greedJunk, S = this.SLOTS, f = this.f;
        let out = '';
        // Боковые стойки табло — из разного, как всё в гараже: слева доска
        // от лакированной мебели, справа сосна.
        out += this.T(6, 'lacquer', this.planks(34, 290, 20, 182, 1, 51, 'v', 0, 'painted'));
        out += this.T(6, 'pine', this.planks(306, 290, 20, 182, 1, 52, 'v', 0, 'pine'));
        // жестяной лист
        out += this.T(9, 'steel', this.tin(50, 296, 260, 172, 61, { boltR: 3, scratches: 0, stroke: STROKE.contour, tilt: 0.4, z: this.Z.strap }));
        out += this.doorScars();
        // крашеное поле: синяя рамка и лучи
        let face = '';
        face += `<rect x="62" y="312" width="236" height="148" rx="2" fill="url(#gj-blue)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        const cx = 180, cy = 388;
        const rays = [J.paint.orange, J.paint.yellow, J.paint.red, J.paint.yellow];
        for (let i = 0; i < 12; i++) {
            const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 0.5) / 12) * Math.PI * 2;
            const R = 170;
            face += `<path d="M${cx} ${cy} L${f(cx + Math.cos(a0) * R)} ${f(cy + Math.sin(a0) * R)} ` +
                `L${f(cx + Math.cos(a1) * R)} ${f(cy + Math.sin(a1) * R)} z" fill="${rays[i % 4]}" clip-path="url(#gj-face)"/>`;
        }
        // облезлая краска: пятна голой жести
        const rnd = this.rng(71);
        for (let i = 0; i < 14; i++) {
            const px = 66 + rnd() * 226, py = 310 + rnd() * 136;
            if (px > 72 && px < 284 && py > 326 && py < 446) continue;   // не на окне
            const k = 0.6 + rnd() * 0.8;
            face += `<path d="M${f(px)} ${f(py)} q${f(4 * k)} ${f(-3 * k)} ${f(8 * k)} 0 q${f(2 * k)} ${f(4 * k)} ${f(-2 * k)} ${f(6 * k)} q${f(-5 * k)} ${f(k)} ${f(-6 * k)} ${f(-6 * k)} z" fill="${J.tin[300]}" ` +
                `stroke="${J.tin[700]}" stroke-width="${STROKE.hairline}"/>`;
        }
        // ---- окно утоплено в корпус ----
        // Полосатое поле — это СКОС, уходящий от листа вглубь к окну. Свет
        // сверху-слева: верхний скос смотрит вниз и в тени, левый тоже
        // отвёрнут, нижний смотрит вверх и ловит свет, правый — чуть. Без
        // этого скос читался плоской наклейкой.
        const O = [62, 312, 298, 460], I = [78, 332, 282, 444];
        const quad = (pts, fill, op) => `<path d="M${pts.map(q => q.join(' ')).join(' L')} Z" fill="${fill}" opacity="${op}" clip-path="url(#gj-face)"/>`;
        // нарисованный свет скоса — только для запасного вида (fx)
        face += '<g class="fx">' +
            quad([[O[0], O[1]], [O[2], O[1]], [I[2], I[1]], [I[0], I[1]]], J.hole, 0.5) +
            quad([[O[0], O[1]], [I[0], I[1]], [I[0], I[3]], [O[0], O[3]]], J.hole, 0.3) +
            quad([[I[0], I[3]], [I[2], I[3]], [O[2], O[3]], [O[0], O[3]]], J.paint.cream, 0.28) +
            quad([[I[2], I[1]], [O[2], O[1]], [O[2], O[3]], [I[2], I[3]]], J.paint.cream, 0.12) + '</g>';
        // Высота скоса — плавным уклоном от листа (9) вниз к окну (−10):
        // четыре трапеции, у каждой свой градиент серого поперёк скоса.
        // Ступенями (как было) скос выходил полосатым — шейдер ловил края
        // ступеней, а сам уклон почти не читался. Градиент пишется в карту
        // высот как есть: inline-стиль с !important сильнее общего правила
        // прохода, которое красит всё по --h. Обводка тем же градиентом
        // закрывает шов на диагоналях углов: без неё сглаживание краёв
        // оставляло там тёмную щель, и шейдер штриховал углы.
        {
            const g = (v) => { const c = Math.round(this.hv(v) * 255); return `rgb(${c},${c},${c})`; };
            const hi = g(9), lo = g(-10);
            const sides = [
                ['t', [[O[0], O[1]], [O[2], O[1]], [I[2], I[1]], [I[0], I[1]]], [0, O[1], 0, I[1]]],
                ['b', [[O[0], O[3]], [O[2], O[3]], [I[2], I[3]], [I[0], I[3]]], [0, O[3], 0, I[3]]],
                ['l', [[O[0], O[1]], [I[0], I[1]], [I[0], I[3]], [O[0], O[3]]], [O[0], 0, I[0], 0]],
                ['r', [[O[2], O[1]], [I[2], I[1]], [I[2], I[3]], [O[2], O[3]]], [O[2], 0, I[2], 0]]
            ];
            // Размытие в полтора тексела скругляет рёбра скоса: острое
            // ребро на растре выходило лесенкой, и шейдер рисовал по
            // диагоналям пилу.
            face += `<filter id="gj-hblur" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.4"/></filter>`;
            face += '<g class="hpass" filter="url(#gj-hblur)">' + sides.map(([k, pts, v]) =>
                `<linearGradient id="gj-bev-${k}" gradientUnits="userSpaceOnUse" x1="${v[0]}" y1="${v[1]}" x2="${v[2]}" y2="${v[3]}">` +
                `<stop offset="0" stop-color="${hi}"/><stop offset="1" stop-color="${lo}"/></linearGradient>` +
                `<path d="M${pts.map(q => q.join(' ')).join(' L')} Z" style="fill:url(#gj-bev-${k}) !important;stroke:url(#gj-bev-${k}) !important;stroke-width:1.2px;stroke-linejoin:round"/>`
            ).join('') + '</g>';
        }
        // рёбра скоса — линии от углов листа к углам окна
        // концы — чуть не доходя до углов: иначе линия вылезала за угол рамки
        [[O[0], O[1], I[0], I[1]], [O[2], O[1], I[2], I[1]], [O[0], O[3], I[0], I[3]], [O[2], O[3], I[2], I[3]]].forEach(e => {
            const k = 0.06, x1 = e[0] + (e[2] - e[0]) * k, y1 = e[1] + (e[3] - e[1]) * k;
            const x2 = e[2] - (e[2] - e[0]) * k, y2 = e[3] - (e[3] - e[1]) * k;
            face += `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}" stroke-linecap="round" opacity="0.5"/>`;
        });
        // кромка листа над скосом ловит свет
        face += `<path d="M66 ${O[3] - 6} L66 318 Q66 314 70 314 L294 314" fill="none" class="hl" stroke="${J.tin[100]}" stroke-width="${STROKE.detail}" opacity="0.7"/>`;
        out += this.T(9, 'paint', face);
        // рамка окна барабанов — на дне скоса
        // Углы окна и проёма — почти острые: трапеции скоса сходятся в них
        // по диагоналям, а скругления разной кривизны ломали углы.
        let win = `<rect x="78" y="332" width="204" height="112" rx="2" fill="${J.paint.blueLo}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        win += `<line x1="84" y1="335" x2="276" y2="335" stroke="${J.paint.blue}" stroke-width="${STROKE.detail}"/>`;
        S.reels.forEach(r => {
            win += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="5" class="pit" fill="${J.hole}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        });
        out += this.T(-10, 'paint', win);
        out += this.reelWindows();
        out += this.shelfTop();
        out += this.buttonPanel();
        return out;
    },

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
    // Делаются по одной; пока готова груша.
    SHELF_TOP: 466,
    bulbList() {
        return [{ kind: 'pear', x: 150 }, { kind: 'red', x: 200 }];
    },

    buttonPanel() {
        const J = PALETTE.greedJunk, B = J.bakelite, f = this.f;
        const x0 = 118, x1 = 244, y0 = 467, y1 = 485, cy = 476;
        let plate = `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="5" fill="${B.base}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
            `<line x1="${x0 + 4}" y1="${y0 + 1.6}" x2="${x1 - 4}" y2="${y0 + 1.6}" class="hl" stroke="${B.hi}" stroke-width="${STROKE.detail}"/>` +
            this.rodH(`M${x0 + 6} ${cy} L${x1 - 6} ${cy}`, y1 - y0 - 2, 1.2);
        plate += this.bolt(x0 + 6, cy, 1.8) + this.bolt(x1 - 6, cy, 1.8);
        let out = this.T(10, 'plastic', plate);
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
        const inner = draw();
        [this._lean, this._axis] = was;
        return `<g transform="rotate(${roll} ${f(x)} ${f(yb)})">${inner}</g>`;
    },

    // Верхняя грань полки: от передней кромки назад к VP.
    shelfTop() {
        const J = PALETTE.greedJunk, f = this.f, V = this.VP;
        const y0 = this.SHELF_TOP, k = 0.05;
        const back = (x, y) => [x + (V.x - x) * k, y + (V.y - y) * k];
        const a = back(24, y0), b = back(336, y0);
        const d = `M24 ${y0} L${f(a[0])} ${f(a[1])} L${f(b[0])} ${f(b[1])} L336 ${y0} Z`;
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
        return `<path d="${side}" fill="${fill}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}" stroke-linejoin="round"/>` +
            `<ellipse cx="${f(x)}" cy="${f(yt)}" rx="${f(rt)}" ry="${f(et)}" fill="${top || fill}" stroke="${PALETTE.ink}" stroke-width="${STROKE.hairline}"/>`;
    },

    // Патрон на полке: бакелитовый фланец-диск на двух шурупах, на нём
    // чашка конусом, сверху латунное кольцо, в которое ввёрнута лампа.
    // Стоит на верхней грани полки (base — передняя кромка его низа).
    // Возвращает y верха кольца — оттуда начинается цоколь лампы.
    holder(x, base, w) {
        const J = PALETTE.greedJunk, B = J.bakelite, Br = J.brass, f = this.f;
        const fw = w + 9, yb = base - 1;              // диск чуть за кромкой полки
        const disk = this.T(10, 'plastic', this.cyl(x, yb, fw, 1.8, B.base, B.hi));
        const y1 = yb - 1.8, c = this.ax(6);
        let s = this.cyl(x, y1, w + 2, 6, B.base, B.lo, w);
        s += `<path d="M${f(x - w / 2 - 0.4)} ${f(y1 - 1)} L${f(x - w / 2 + 0.5)} ${f(y1 - c + 0.6)}" class="hl" stroke="${B.hi}" stroke-width="0.8"/>`;
        s += this.rodH(`M${x} ${f(y1 - c + 0.4)} L${x} ${f(y1 - 0.4)}`, w + 1, w * 0.4);
        const y2 = y1 - c;
        s += this.cyl(x, y2, w, 1.6, Br.base, Br.hi);
        // шурупы на диске — на его верхней грани, слева и справа
        const screws = this.bolt(x - fw / 2 + 1.9, yb - 1.8, 0.85) + this.bolt(x + fw / 2 - 1.9, yb - 1.8, 0.85);
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
            // специального. Посадка своя: сильно завалена вправо (32°) и к
            // зрителю умеренно (40°) — так видна её длина; у груши наоборот.
            // Трубка — цилиндр по оси (длина укорочена наклоном), верх —
            // полусфера: круг, который с любой стороны круг.
            let h0 = null;
            const lamp = this.leaned(x, base - 2.8, 0.7, 32, () => {
                const h = this.holder(x, base, 6);
                h0 = h;
                let o = h.cup + this.socketBrass(x, h.top, 5.2, 4.6);
                const w = 5.6, t = h.top - this.ax(4.6), len = 24, yt = t - this.ax(len);
                let g = this.cyl(x, t, w, len, L.red, L.red);
                g = g.replace(`fill="${L.red}"`, `fill="${L.red}" opacity="0.82"`);
                // нить — прямая жилка вдоль оси, держатели снизу
                g += `<path d="M${x - 0.8} ${f(t - 1)} L${x - 0.8} ${f(yt + 3)} M${x + 0.8} ${f(t - 1)} L${x + 0.8} ${f(yt + 3)}" stroke="${L.wire}" stroke-width="0.5" opacity="0.8"/>`;
                // полусфера верха
                g += `<circle cx="${x}" cy="${f(yt)}" r="${w / 2}" fill="${L.red}" opacity="0.9" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
                // контур боков поверх, чтобы стык с полусферой не рвал линию
                g += `<path d="M${x - w / 2} ${f(t)} L${x - w / 2} ${f(yt)} M${x + w / 2} ${f(t)} L${x + w / 2} ${f(yt)}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
                g += `<path d="M${x - 1.5} ${f(t - 1.5)} L${x - 1.5} ${f(yt + 0.5)}" class="hl" stroke="${J.alu[100]}" stroke-width="0.9" stroke-linecap="round" opacity="0.75"/>`;
                g += this.rodH(`M${x} ${f(yt)} L${x} ${f(t)}`, w, 2.6) + this.domeH(x, yt, w / 2, 2.6);
                o += this.T(20, 'glass', g);
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
            // маленький янтарный шарик на коротком цоколе
            out += this.socketBrass(x, base, 5.6, 5);
            const t = base - 5, cy = t - 6.5, r = 6.6;
            const d = `M${x - 2.4} ${t} A${r} ${r} 0 1 1 ${x + 2.4} ${t} Z`;
            out += this.T(14, 'glass', this.filament(x, cy, t - 1, 2.6) +
                this.glassBulb(d, L.amber, 0.7, `M${x - 4.4} ${cy + 1} A4.6 4.6 0 0 1 ${x - 1} ${cy - 4.2}`, this.domeH(x, cy, r, 3)));
        } else {
            // «свеча»: дымчатое стекло, вытянутое пламенем, носик закручен
            out += this.socketBrass(x, base, 6, 6);
            const t = base - 6, top = t - 20;
            const d = `M${x - 3} ${t} C${x - 6.5} ${t - 6} ${x - 5} ${top + 8} ${x} ${top + 2} C${x + 1.5} ${top} ${x + 3} ${top - 1} ${x + 2} ${top - 2.4} ` +
                `C${x + 3.4} ${top + 1} ${x + 6.5} ${top + 9} ${x + 3} ${t} Z`;
            out += this.T(14, 'glass', this.filament(x, top + 9, t - 1, 2.4) +
                this.glassBulb(d, L.smoke, 0.62, `M${x - 3.4} ${t - 3} C${x - 4.4} ${t - 8} ${x - 3} ${top + 9} ${x - 1} ${top + 6}`,
                    this.domeH(x, top + 12, 4.6, 3)));
        }
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
        const rnd = this.rng(611);
        let out = '';
        // спиленные петли: вокруг лепестка — грязь и ржавчина двадцати лет,
        // сам лепесток в ржавых потёках
        [322, 434].forEach(y => {
            let leaf = `<rect x="49.5" y="${y - 9}" width="15" height="18" rx="3" class="fx" fill="${J.wood[900]}" opacity="0.25"/>` +
                `<rect x="51" y="${y - 7}" width="11" height="14" rx="1.5" fill="${J.tin[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>` +
                `<rect x="51" y="${y - 7}" width="11" height="14" rx="1.5" fill="url(#gj-rust)" opacity="0.45"/>` +
                `<path d="M53 ${y + 7} l0.8 5 M59 ${y + 7} l-0.6 4" stroke="${J.rust[500]}" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>` +
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
        // лист на 0.4°), иначе полоса расходилась с кромкой. Рез от руки:
        // кромка свежего металла неровной ширины, у неё — чёрная окалина,
        // дальше — побежалость полосой. Заусенец чёрточками за кромкой убран:
        // на фоне досок они читались непонятной штриховкой поверх всего.
        let edge = [], burnt = [];
        for (let y = 298; y <= 466; y += 3) {
            const w = 1.2 + rnd() * 1.8;
            edge.push([310 - w, y]); burnt.push([310 - w - 1.2 - rnd() * 0.8, y]);
        }
        const line = pts => pts.map(p => f(p[0]) + ' ' + f(p[1])).join(' L');
        let cut = `<rect x="300" y="308" width="9" height="148" fill="url(#gj-temper)" opacity="0.45"/>` +
            `<path d="M${line(burnt)} L310 466 L310 298 Z" fill="${J.tin[900]}"/>` +
            `<path d="M${line(edge)} L310 466 L310 298 Z" fill="${J.tin[100]}"/>`;
        out += `<g transform="rotate(0.4 180 382)">` + this.T(9, 'steel', cut) + `</g>`;
        // Отпечаток таблички над окном: под ней краска не выцвела и грязь не
        // легла — остался яркий прямоугольник с тёмной каймой грязи по
        // контуру и пустыми дырами по углам.
        const px = 138, py = 298.5, pw = 84, ph = 12;
        let ghost = `<rect x="${px - 1}" y="${py - 1}" width="${pw + 2}" height="${ph + 2}" rx="1.5" fill="none" stroke="${J.wood[900]}" stroke-width="1" opacity="0.22"/>` +
            `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="1" fill="${J.tin[300]}" opacity="0.5"/>` +
            `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="1" fill="${J.tin[100]}" opacity="0.12"/>`;
        [[px + 3, py + 3], [px + pw - 3, py + 3], [px + 3, py + ph - 3], [px + pw - 3, py + ph - 3]].forEach(([x, y]) => {
            ghost += this.hole(x, y, 1.3) + this.rustRun(x, y + 1.4, 3, Math.round(x));
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
            let drum = `<rect x="${r.x + 1}" y="${r.y + 1}" width="${r.w - 2}" height="${r.h - 2}" rx="4" fill="${J.paint.cream}"/>`;
            // Барабан уходит от глаза к верху и низу окна — затемнение там
            // это его форма, а не нарисованный свет, поэтому оно в цвете,
            // а не в тени (fx). Высотами такой большой цилиндр в узком
            // окне не вылепить: перепада глубины не хватает, а ступени
            // профиля полосили.
            drum += `<rect x="${r.x + 1}" y="${r.y + 1}" width="${r.w - 2}" height="${r.h - 2}" rx="4" fill="url(#gj-drum)"/>`;
            // разделительные риски ячеек барабана
            [-1, 1].forEach(k => {
                const ly = cy + k * r.h / 3;
                drum += `<line x1="${r.x + 3}" y1="${f(ly)}" x2="${r.x + r.w - 3}" y2="${f(ly)}" stroke="${J.plastic.lo}" stroke-width="${STROKE.hairline}"/>`;
            });
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
    TAIL: { len: 14, root: 1.0 },                // выходит из узла вправо-вниз
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
    body() {
        const J = PALETTE.greedJunk, S = this.SLOTS;
        let out = '';
        out += this.planks(40, 484, 280, 98, 2, 81, 'h');
        out += this.tin(40, 484, 22, 22, 91, { bolts: false, scratches: 1 }) + this.bolt(49, 493);
        out += this.tin(298, 484, 22, 22, 92, { bolts: false, scratches: 1 }) + this.bolt(311, 493);
        // тень от полки на ящик
        out += this.shade(40, 486, 280, 14);
        // пустая табличка выплат: светлая доска на гвоздях
        const p = S.plate;
        out += `<path d="${this.wob(p.x, p.y, p.w, p.h, 151, 1)}" fill="url(#gj-wood-light)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        out += `<line x1="${p.x + 4}" y1="${p.y + 2.5}" x2="${p.x + p.w - 4}" y2="${p.y + 2.5}" class="hl" stroke="${J.wood[100]}" stroke-width="${STROKE.detail}" opacity="0.7"/>`;
        [[p.x + 6, p.y + 6], [p.x + p.w - 6, p.y + 6], [p.x + 6, p.y + p.h - 6], [p.x + p.w - 6, p.y + p.h - 6]]
            .forEach(([x, y]) => { out += this.nail(x, y); });
        // лоток
        const t = S.tray;
        out += this.tin(t.x - 8, t.y - 5, t.w + 16, t.h + 10, 101, { bolts: false, scratches: 1, tilt: 0, z: this.Z.strap });
        out += `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="4" class="pit" fill="url(#gj-hole)" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        // латка изолентой на углу
        out += `<path d="${this.wob(268, 548, 40, 10, 153, 0.8)}" fill="${J.tin[900]}" opacity="0.92" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}" transform="rotate(-18 288 553)"/>`;
        // полка поверх стыка табло и ящика — торчит за края
        out += this.T(8, 'pine', this.planks(24, 466, 312, 20, 1, 111, 'h', 0, 'pine'));
        return out;
    },

    // Цоколь: толстая тёмная доска на двух брусках.
    plinth() {
        let out = this.planks(34, 598, 64, 22, 1, 121, 'h') + this.planks(262, 598, 64, 22, 1, 122, 'h');
        out += this.planks(20, 580, 320, 20, 1, 123, 'h');
        return out;
    },
});
