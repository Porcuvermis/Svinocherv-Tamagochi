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
        out += this.T(9, 'paint', face);
        // ---- окно барабанов: глубоко в корпусе ----
        let win = `<rect x="78" y="332" width="204" height="112" rx="2" fill="${J.paint.blueLo}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        win += `<line x1="84" y1="335" x2="276" y2="335" stroke="${J.paint.blue}" stroke-width="${STROKE.detail}"/>`;
        S.reels.forEach(r => {
            win += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="5" class="pit" fill="${J.hole}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
        });
        out += this.T(-10, 'paint', win);
        out += this.tvBezel();
        // кнопки на полке-пульте под табло: разные, как собранные с разных пультов
        [[136, J.paint.orange, 6.5], [168, J.paint.red, 5.5], [196, J.paint.orange, 6.5], [226, J.paint.yellow, 5]].forEach(([bx, c, r]) => {
            out += this.T(9, 'steel', `<circle cx="${bx + 0.8}" cy="${477.8}" r="${r + 2}" class="fx" fill="${J.hole}" opacity="0.3"/>` +
                `<circle cx="${bx}" cy="476" r="${r + 2}" fill="${J.tin[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>`);
            out += this.T(10, 'plastic', `<circle cx="${bx}" cy="475" r="${r}" fill="${c}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
                `<circle cx="${bx - r * 0.3}" cy="${475 - r * 0.35}" r="${r * 0.32}" class="hl" fill="${J.paint.cream}" opacity="0.8"/>` +
                this.domeH(bx, 475, r, 2.5));
        });
        return out;
    },

    // ---------- РАМКА ОКНА: ОТ СТАРОГО ТЕЛЕВИЗОРА ----------
    // Окно барабанов обрамляет пластиковая рамка от старого телевизора,
    // прикрученная к табло четырьмя винтами. Сечение у неё круглое — валик
    // по скруглённому прямоугольнику, — поэтому рёбер и углов-изломов нет
    // вовсе: свет обходит рамку плавно, а с её внутренней кромки в глубину
    // окна падает тень.
    // Было: скос из четырёх трапеций, сходившихся по диагоналям; на растре
    // диагонали выходили небрежными, сколько их ни чинили.
    tvBezel() {
        const J = PALETTE.greedJunk, f = this.f, B = J.bezel;
        const x0 = 72, y0 = 326, x1 = 288, y1 = 450, r = 9, W = 13;
        const d = `M${x0 + r} ${y0} H${x1 - r} A${r} ${r} 0 0 1 ${x1} ${y0 + r} V${y1 - r} A${r} ${r} 0 0 1 ${x1 - r} ${y1} ` +
            `H${x0 + r} A${r} ${r} 0 0 1 ${x0} ${y1 - r} V${y0 + r} A${r} ${r} 0 0 1 ${x0 + r} ${y0} Z`;
        let g = `<path d="${d}" fill="none" stroke="${PALETTE.ink}" stroke-width="${W + STROKE.structure * 2}"/>` +
            `<path d="${d}" fill="none" stroke="${B.base}" stroke-width="${W}"/>` +
            // нарисованный блик и тень — только для запасного вида
            `<path d="${d}" fill="none" class="hl" stroke="${B.hi}" stroke-width="3" transform="translate(-1.5 -1.5)"/>` +
            `<path d="${d}" fill="none" class="fx" stroke="${B.lo}" stroke-width="3" transform="translate(1.5 1.5)"/>` +
            // профиль валика размыт: ступени профиля на крупной рамке иначе
            // читаются полосами
            `<filter id="gj-hblur" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="0.9"/></filter>` +
            `<g filter="url(#gj-hblur)">${this.rodH(d, W, 5)}</g>`;
        // винты по углам — в утолщениях-бобышках
        [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].forEach(([cx, cy]) => {
            g += `<circle cx="${cx}" cy="${cy}" r="6" fill="${B.base}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>` +
                this.domeH(cx, cy, 6, 5.5) + this.bolt(cx, cy, 2.4);
        });
        return this.T(9, 'plastic', g);
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
