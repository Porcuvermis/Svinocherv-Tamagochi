// ================= САД: ГРЯДКА, ИНСТРУМЕНТ В РАБОТЕ, РАСТЕНИЕ =================
// Продолжение GARDEN_ART (garden-art.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после garden-art.js.
Object.assign(GARDEN_ART, {

    // ---------- ОДНА ГРЯДКА ----------
    // Состояние грядки видно ПО НЕЙ САМОЙ, без подписей:
    //   locked   — завалена камнями и хворостом, разбирают руками,
    //   empty    — расчищена, но земля нетронутая и ровная,
    //   dug      — вскопана лунка: борозды и ямка под семя,
    //   sown     — в лунке семя, земля сухая,
    //   growing  — росток тем выше, чем ближе срок,
    //   weedy    — выросло, но заросло сорняками,
    //   ripening — прополото, плод набухает,
    //   ripe     — плод налился, его видно целиком.
    //
    // Разница между «расчищена» и «вскопана» — не украшение: посадка идёт
    // только в лунку, и если ровную землю не отличить от вскопанной, игрок не
    // поймёт, почему семя не ложится.
    bed(state, opts) {
        const k = gdPal(), ink = gdInk(), S = gdS();
        const o = opts || {};
        const y = this.SOIL_Y;
        const hw = this.BED_W / 2;
        const out = [];
        // Доля выполненной ручной работы над этой грядкой. Грядка меняется ОТ
        // КАЖДОГО ДВИЖЕНИЯ игрока: камни разлетаются по одному, лунка
        // углубляется, сорняки убывают. Без этого работа читалась бы как
        // «дёргаю, и ничего не происходит».
        const w = o.work || null;
        const wf = w ? Math.max(0, Math.min(1, w.frac)) : 0;

        // Короб грядки — трапеция: низ шире верха, как доска на кухне. Из этого
        // сразу читается, что смотрим сверху-сбоку, а не в упор.
        out.push(`
        <path d="M${-hw + 16} ${y - 34} H${hw - 16} L${hw} ${y + 22} H${-hw} Z"
              fill="${k.soil[500]}" stroke="${ink}" stroke-width="${S.contour}" stroke-linejoin="round"/>`);

        if (state === 'locked') {
            // Завал: камни и хворост. Форма из сида грядки, чтобы шесть
            // заваленных грядок не были одинаковыми. Пока его разбирают,
            // камни убывают по одному за движение.
            const rng = gdRng(o.seed || 3);
            const total = 7;
            const left = w && w.action === 'clear' ? Math.ceil(total * (1 - wf)) : total;
            for (let i = 0; i < total; i++) {
                const px = (rng() * 2 - 1) * (hw - 26);
                const py = y - 18 + rng() * 30;
                const r = 9 + rng() * 13;
                const stone = rng() > 0.5;
                if (i >= left) continue;
                out.push(`<ellipse cx="${px.toFixed(0)}" cy="${py.toFixed(0)}" rx="${r.toFixed(0)}" ry="${(r * 0.72).toFixed(0)}"
                        fill="${stone ? k.iron[300] : k.wood[500]}" stroke="${ink}" stroke-width="${S.detail}"/>`);
            }
            out.push(gdGrab(0, y - 10, hw, 44));
            return out.join('');
        }

        if (state === 'empty' && !(w && w.action === 'dig')) {
            // Расчищено, но не тронуто: ровная земля, редкие камушки. Борозд
            // нет — им взяться неоткуда, лопата сюда ещё не приходила.
            const rng = gdRng((o.seed || 3) + 41);
            for (let i = 0; i < 5; i++) {
                out.push(`<ellipse cx="${((rng() * 2 - 1) * (hw - 30)).toFixed(0)}" cy="${(y - 12 + rng() * 24).toFixed(0)}"
                                   rx="${(3 + rng() * 4).toFixed(0)}" ry="${(2 + rng() * 3).toFixed(0)}"
                                   fill="${k.soil[300]}" opacity="0.7"/>`);
            }
            out.push(gdGrab(0, y - 20, hw, 56));
            return out.join('');
        }

        // Вскопанная земля: борозды. Они темнее самой земли — по ним и видно,
        // что грядку трогали лопатой. Пока копают — проступают постепенно.
        const furrow = (w && w.action === 'dig') ? wf : 1;
        out.push(`<path d="M${-hw + 30} ${y - 16} H${hw - 30} M${-hw + 26} ${y - 2} H${hw - 26} M${-hw + 22} ${y + 12} H${hw - 22}"
                        stroke="${k.soil[700]}" stroke-width="${S.detail}" opacity="${(0.7 * furrow).toFixed(2)}"/>`);

        if (w && w.action === 'dig') {
            // Лунка углубляется с каждым рывком лопаты, а рядом растёт кучка
            // выброшенной земли: копание видно по тому, что земли стало где-то
            // больше, а где-то меньше.
            out.push(this.hole(wf));
            out.push(`<ellipse cx="${(hw * 0.42).toFixed(0)}" cy="${(y + 2).toFixed(0)}"
                               rx="${(10 + 22 * wf).toFixed(1)}" ry="${(4 + 9 * wf).toFixed(1)}"
                               fill="${k.soil[300]}" stroke="${ink}" stroke-width="${S.hairline}" opacity="0.9"/>`);
            out.push(gdGrab(0, y - 20, hw, 56));
            return out.join('');
        }

        if (state === 'dug') {
            out.push(this.hole(1));
            // Пока приминают землю — над лункой растёт бугорок с семенем.
            if (w && w.action === 'sow') {
                out.push(`<ellipse cx="0" cy="${(y - 6 - 2 * wf).toFixed(1)}"
                                   rx="${(13 + 11 * wf).toFixed(1)}" ry="${(4 + 4 * wf).toFixed(1)}"
                                   fill="${k.soil[300]}" stroke="${ink}" stroke-width="${S.detail}"/>`);
            }
        }

        if (state === 'sown') {
            // В лунке лежит семя: валик земли остался, ямка засыпана бугорком.
            out.push(`
                <ellipse cx="0" cy="${y - 6}" rx="24" ry="12" fill="${k.soil[300]}" opacity="0.7"/>
                <ellipse cx="0" cy="${y - 8}" rx="13" ry="8" fill="${k.soil[300]}"
                         stroke="${ink}" stroke-width="${S.detail}"/>`);
        }

        if (o.plant && (state === 'growing' || state === 'weedy' || state === 'ripening' || state === 'ripe')) {
            out.push(this.plant(o.plant, o.growth, state, o.fruitKey, o.seed || 1, o.uid == null ? 0 : o.uid));
        }

        if (state === 'growing' && w && w.action === 'fertilize') {
            // Какашку не кладут целиком — её растирают по грядке. Комков
            // становится меньше, тёмных пятен в земле больше.
            const rng = gdRng((o.seed || 7) + 13);
            const total = 3;
            const left = Math.ceil(total * (1 - wf));
            for (let i = 0; i < total; i++) {
                const px = (rng() * 2 - 1) * (hw - 46);
                if (i < left) {
                    out.push(`<g transform="translate(${px.toFixed(0)} ${(y - 4).toFixed(0)}) scale(0.5)">
                                ${this.tool('dung')}</g>`);
                } else {
                    out.push(`<ellipse cx="${px.toFixed(0)}" cy="${(y - 2).toFixed(0)}" rx="26" ry="9"
                                       fill="${k.dung[700]}" opacity="0.55"/>`);
                }
            }
        }

        if (state === 'weedy') {
            // Сорняки поверх растения: они и есть «руками сюда». Выдираются по
            // одному, и рядом растёт кучка выдранного.
            const rng = gdRng((o.seed || 5) + 91);
            const total = 6;
            const left = (w && w.action === 'weed') ? Math.ceil(total * (1 - wf)) : total;
            for (let i = 0; i < total; i++) {
                const px = (rng() * 2 - 1) * (hw - 30);
                const h = 26 + rng() * 26;
                const bend = (rng() * 2 - 1) * 16;
                if (i >= left) continue;
                out.push(`<path d="M${px.toFixed(0)} ${y - 8} q${bend.toFixed(0)} ${(-h * 0.6).toFixed(0)} ${(bend * 1.6).toFixed(0)} ${(-h).toFixed(0)}"
                        fill="none" stroke="${k.weed[500]}" stroke-width="${S.structure}" stroke-linecap="round"/>`);
            }
            if (w && w.action === 'weed' && wf > 0) {
                out.push(`<g transform="translate(${(-hw * 0.62).toFixed(0)} ${(y + 8).toFixed(0)})">
                    <ellipse rx="${(8 + 20 * wf).toFixed(1)}" ry="${(3 + 7 * wf).toFixed(1)}" fill="${k.weed[700]}" opacity="0.85"/>
                    <path d="M${(-6 - 8 * wf).toFixed(0)} -2 q6 -10 12 -3 M2 -3 q7 -9 12 -1"
                          fill="none" stroke="${k.weed[500]}" stroke-width="${S.detail}" stroke-linecap="round"/>
                </g>`);
            }
        }

        out.push(gdGrab(0, y - 20, hw, 56));
        return out.join('');
    },

    // Лунка: тёмная ямка с валиком выброшенной земли по краю. frac — насколько
    // она уже выкопана.
    hole(frac) {
        const k = gdPal(), ink = gdInk(), S = gdS();
        const f = Math.max(0.08, Math.min(1, frac));
        const y = this.SOIL_Y - 6;
        return `
            <ellipse cx="0" cy="${y}" rx="${(26 * f).toFixed(1)}" ry="${(14 * f).toFixed(1)}"
                     fill="${k.soil[300]}" opacity="0.8"/>
            <ellipse cx="0" cy="${y}" rx="${(20 * f).toFixed(1)}" ry="${(10 * f).toFixed(1)}"
                     fill="${k.soil[700]}" stroke="${ink}" stroke-width="${S.detail}"/>`;
    },

    // ---------- ИНСТРУМЕНТ В РАБОТЕ ----------
    // Пока идёт работа, предмет стоит НАД грядкой в рабочем положении и
    // ходит вместе с пальцем. Он же — единственный отклик на движение: без
    // него игрок дёргает пальцем в пустоту и не понимает, засчитывается ли
    // это.
    //
    // swing — где сейчас палец в размахе (−1..1), frac — сколько работы уже
    // сделано. Рисуется в координатах грядки, как и всё остальное.
    workTool(action, swing, frac) {
        const y = this.SOIL_Y;
        const sw = Math.max(-1, Math.min(1, swing || 0));
        const f = Math.max(0, Math.min(1, frac || 0));

        if (action === 'dig') {
            // Лопата воткнута в землю и ходит вверх-вниз вместе с пальцем.
            // Уходит она тем глубже, чем больше выкопано.
            // Знак ПРЯМОЙ: палец вниз — лопата вниз. С обратным знаком
            // инструмент уезжал навстречу пальцу, и это читалось как поломка.
            const lift = sw * 26;
            return `<g transform="translate(-6 ${(y - 38 + 14 * f + lift).toFixed(1)}) rotate(${(-16 + sw * 7).toFixed(1)})">
                        <g transform="scale(1.25)">${this.tool('spade')}</g>
                    </g>`;
        }
        if (action === 'weed') {
            // Грабли стоят зубьями в земле, и их ТЯНУТ К СЕБЕ — то есть вниз
            // по экрану, а не возят вбок. Направление движения инструмента
            // обязано совпадать с тем, куда игрок ведёт палец: расхождение
            // читается как поломка (это и было первым отзывом).
            return `<g transform="translate(0 ${(y - 44 + sw * 30).toFixed(1)}) rotate(${(-6 + sw * 8).toFixed(1)})">
                        <g transform="scale(1.25)">${this.tool('rake')}</g>
                    </g>`;
        }
        if (action === 'clear') {
            // Завал разбирают рукой: она ходит вбок и откидывает камни.
            return `<g transform="translate(${(sw * 46).toFixed(1)} ${(y - 34).toFixed(1)}) rotate(${(sw * 18).toFixed(1)})">
                        <g transform="scale(1.7)">${this.hand()}</g>
                    </g>`;
        }
        if (action === 'harvest') {
            // Рука тянет плод вверх: чем сильнее рывок, тем выше она ушла.
            return `<g transform="translate(0 ${(y - 60 + sw * 30).toFixed(1)})">
                        <g transform="scale(1.7)">${this.hand()}</g>
                    </g>`;
        }
        // Посев и удобрение: ладонь приминает и растирает землю, прижимаясь к
        // ней в середине каждого движения.
        const press = 6 * (1 - Math.abs(sw));
        return `<g transform="translate(${(sw * 40).toFixed(1)} ${(y - 30 + press).toFixed(1)}) rotate(${(sw * 12).toFixed(1)})">
                    <g transform="scale(1.7)">${this.hand()}</g>
                </g>`;
    },

    // Ладонь. Одна на всё: значок над грядкой, работа руками, будущие
    // подсказки. Второй руки в игре быть не должно.
    hand() {
        const ink = gdInk(), S = gdS();
        return `<path d="M-9 6 q-4 -12 2 -12 q2 -8 6 -4 q3 -7 6 -1 q4 -4 5 3 l1 10 q0 8 -9 8 q-8 0 -11 -4 Z"
                      fill="${PALETTE.flesh ? PALETTE.flesh[300] : '#e8b0a8'}" stroke="${ink}"
                      stroke-width="${S.structure}" stroke-linejoin="round"/>`;
    },

    // ---------- РАСТЕНИЕ ----------
    // Это ПОРТ прежнего сада, где растение рисовалось на canvas: там оно
    // получалось живым — стебель сужался кверху и врастал в почву корневым
    // расширением, листья цеплялись к настоящей кривой стебля и имели
    // прожилки, на верхушке распускался цветок. Первая SVG-версия всё это
    // растеряла (кривая одной линией, лист одной заливкой) — и сад стал
    // выглядеть чертежом. Здесь та же геометрия, но нарисованная в SVG:
    // одна система координат со всей сценой, одна камера, никаких шести
    // холстов, которые надо синхронизировать с масштабом стейджа.
    //
    // Числа геометрии живут в СЦЕНЕ (грядка 216 единиц шириной), а не в
    // пикселях холста: сцена одного размера всегда (инвариант 11), поэтому
    // пересчитывать нечего.
    PLANT_MAX_H: 210,
       // высота самого рослого вида при полном росте
    PLANT_LATERAL: 62,
      // предел бокового ухода: за свою грядку не вылезаем

    // Насколько растение поднялось над землёй. Отдельной функцией, потому что
    // это же число нужно экрану, чтобы повесить значок НАД кустом: два разных
    // расчёта высоты разъезжаются, и значок садится кусту на голову.
    plantHeight(p, growth) {
        const g = Math.max(0.08, Math.min(1, growth));
        return Math.max(18, this.PLANT_MAX_H * p.heightFrac * g);
    },

    // Кубическая кривая стебля. P0 — земля, P1 строго над ней (стебель всегда
    // выходит из почвы вертикально, иначе основание выглядит приклеенным),
    // P2/P3 — наклон и изгиб по типу стебля.
    stemGeo(p, growth) {
        const stemDef = PlantModel.STEM_TYPES[p.stemType] || PlantModel.STEM_TYPES.straight;
        const len = this.plantHeight(p, growth);
        const tiltRad = (p.tilt || 0) * Math.PI / 180;
        let lateral = Math.sin(tiltRad) * len + (p.curve || 0) * len * stemDef.curveMul;
        lateral = Math.max(-this.PLANT_LATERAL, Math.min(this.PLANT_LATERAL, lateral));
        const rootLen = len * 0.22;
        const geo = {
            len, stemDef, lateral,
            P0: { x: 0, y: 0 },
            P1: { x: 0, y: -rootLen },
            P2: { x: lateral * 0.72, y: -len * 0.62 },
            P3: { x: lateral, y: -len }
        };
        const tip = this.stemPointAt(geo, p, 1);
        geo.tipX = tip.x; geo.tipY = tip.y;
        return geo;
    },

    cubicPoint(a, b, c, d, t) {
        const u = 1 - t;
        return {
            x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
            y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y
        };
    },

    cubicTangent(a, b, c, d, t) {
        const u = 1 - t;
        return {
            x: 3 * u * u * (b.x - a.x) + 6 * u * t * (c.x - b.x) + 3 * t * t * (d.x - c.x),
            y: 3 * u * u * (b.y - a.y) + 6 * u * t * (c.y - b.y) + 3 * t * t * (d.y - c.y)
        };
    },

    // Точка НА РЕАЛЬНО НАРИСОВАННОЙ кривой в доле t плюс единичная нормаль.
    // Единственное место, где считаются точки стебля: когда листья крепились
    // к прямой «земля → верхушка», а стебель рисовался кривой, листья на
    // изогнутых стеблях съезжали в сторону от него.
    stemPointAt(geo, p, t) {
        const pt = this.cubicPoint(geo.P0, geo.P1, geo.P2, geo.P3, t);
        const tan = this.cubicTangent(geo.P0, geo.P1, geo.P2, geo.P3, t);
        const tl = Math.hypot(tan.x, tan.y) || 1;
        const nx = -tan.y / tl, ny = tan.x / tl;
        let x = pt.x, y = pt.y;
        if (geo.stemDef.wobbleAmp > 0) {
            // Амплитуда волны растёт от нуля у земли к максимуму у верхушки:
            // излом не должен портить вертикальный старт.
            const wob = geo.stemDef.wobbleAmp *
                Math.sin(t * Math.PI * geo.stemDef.wobbleFreq * 2 + (p.wobblePhase || 0)) * geo.len * 0.11 * t;
            x += nx * wob; y += ny * wob;
        }
        const lim = this.PLANT_LATERAL + 12;
        return { x: Math.max(-lim, Math.min(lim, x)), y, nx, ny };
    },

    // Ширина стебля в доле t: сужается кверху, у самой земли расширяется
    // корневым утолщением.
    stemWidthAt(t, base, tip, p) {
        let w = base + (tip - base) * t;
        if (t < 0.14) w += base * ((p.rootFlare || 1.6) - 1) * (1 - t / 0.14) * 0.5;
        return w;
    },

    // Формы листа. Рисуются В СВОЕЙ системе координат (черешок в нуле, лист
    // вдоль +x) и поворачиваются целиком: считать изогнутый лист сразу в
    // координатах сцены — верный способ получить тонкий серп вместо листа.
    leafPath(shape, L, W) {
        if (shape === 'pointed') {
            return `M0 0 Q${(L * 0.32).toFixed(1)} ${(-W * 0.42).toFixed(1)} ${L.toFixed(1)} 0
                    Q${(L * 0.32).toFixed(1)} ${(W * 0.42).toFixed(1)} 0 0 Z`;
        }
        if (shape === 'heart') {
            const n = W * 0.14;
            return `M0 0 Q${(L * 0.18).toFixed(1)} ${(-n).toFixed(1)} ${(L * 0.42).toFixed(1)} ${(-W * 0.62).toFixed(1)}
                    Q${(L * 0.95).toFixed(1)} ${(-W * 0.3).toFixed(1)} ${L.toFixed(1)} 0
                    Q${(L * 0.95).toFixed(1)} ${(W * 0.3).toFixed(1)} ${(L * 0.42).toFixed(1)} ${(W * 0.62).toFixed(1)}
                    Q${(L * 0.18).toFixed(1)} ${n.toFixed(1)} 0 0 Z`;
        }
        if (shape === 'fern') {
            // Перистый лист: центральная ость с дольками по обе стороны.
            const segs = 5;
            let d = 'M0 0';
            for (let s = 1; s <= segs; s++) {
                const t = s / segs, sx = L * t;
                const sw = W * 0.5 * Math.sin(Math.PI * t) + W * 0.06;
                d += ` Q${(sx - L * 0.06).toFixed(1)} ${(-sw).toFixed(1)} ${sx.toFixed(1)} ${(-W * 0.05).toFixed(1)}`;
            }
            d += ` L${L.toFixed(1)} 0`;
            for (let s = segs; s >= 1; s--) {
                const t = s / segs, sx = L * t;
                const sw = W * 0.5 * Math.sin(Math.PI * t) + W * 0.06;
                d += ` Q${(sx - L * 0.06).toFixed(1)} ${sw.toFixed(1)} ${(sx - L / segs).toFixed(1)} ${(W * 0.05 * (s % 2 === 0 ? 1 : 0.4)).toFixed(1)}`;
            }
            return d + ' L0 0 Z';
        }
        return `M0 0 Q${(L * 0.4).toFixed(1)} ${(-W * 0.6).toFixed(1)} ${L.toFixed(1)} 0
                Q${(L * 0.4).toFixed(1)} ${(W * 0.6).toFixed(1)} 0 0 Z`;
    },

    // Само растение. uid нужен только для имён градиентов: шесть грядок живут
    // в одном документе, и одинаковые id склеили бы их заливки.
    plant(p, growth, state, fruitKey, seed, uid) {
        const g = Math.max(0.08, Math.min(1, growth));
        const y0 = this.SOIL_Y - 18;            // поверхность грядки, не кромка короба
        const geo = this.stemGeo(p, g);
        const id = (n) => `gd-${uid}-${n}`;

        const H = p.hue, Sa = Math.round(p.satBase), Li = Math.round(p.lightBase);
        const hsl = (h, s, l) => `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(Math.max(6, Math.min(92, l)))}%)`;

        const base = Math.max(3, 3 + p.thickness * 5.5 * g);
        const tipW = Math.max(1, base * 0.2);

        const defs = [];
        const out = [];

        // ---- КОРНЕВОЕ РАСШИРЕНИЕ ----
        // Мягкое пятно цвета стебля с бугорками: без него основание выглядит
        // обрубленным и приклеенным поверх грядки.
        const flareW = base * (p.rootFlare || 1.6), flareH = flareW * 0.4;
        defs.push(`<radialGradient id="${id('rt')}">
            <stop offset="0" stop-color="${hsl(H, Sa, Li - 10)}"/>
            <stop offset="1" stop-color="${hsl(H, Sa, Li - 10)}" stop-opacity="0"/>
        </radialGradient>`);
        out.push(`<ellipse cx="0" cy="0" rx="${(flareW * 0.75).toFixed(1)}" ry="${flareH.toFixed(1)}"
                           fill="url(#${id('rt')})"/>`);
        (p.rootBumps || []).forEach(b => {
            const bx = Math.cos(b.angle) * flareW * b.dist * 0.55;
            const by = Math.abs(Math.sin(b.angle)) * flareH * b.dist * 0.2;
            out.push(`<ellipse cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}"
                               rx="${(flareW * b.r * 0.5).toFixed(1)}" ry="${(flareH * b.r * 0.6).toFixed(1)}"
                               fill="${hsl(H, Sa, Li - 14)}" opacity="0.75"/>`);
        });

        // ---- СТЕБЕЛЬ ----
        // Не линия, а силуэт: две стороны, посчитанные от нормали к кривой.
        // Линией постоянной толщины стебель читается проводом.
        const SAMPLES = 20;
        const left = [], right = [];
        for (let i = 0; i <= SAMPLES; i++) {
            const t = i / SAMPLES;
            const sp = this.stemPointAt(geo, p, t);
            const hwid = this.stemWidthAt(t, base, tipW, p) / 2;
            left.push([sp.x + sp.nx * hwid, sp.y + sp.ny * hwid]);
            right.push([sp.x - sp.nx * hwid, sp.y - sp.ny * hwid]);
        }
        const poly = 'M' + left.map(pt => `${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`).join(' L') +
                     ' L' + right.reverse().map(pt => `${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`).join(' L') + ' Z';
        defs.push(`<linearGradient id="${id('st')}" x1="${(-base).toFixed(1)}" y1="0" x2="${base.toFixed(1)}" y2="0"
                                   gradientUnits="userSpaceOnUse">
            <stop offset="0"    stop-color="${hsl(H, Sa, Li - 8)}"/>
            <stop offset="0.45" stop-color="${hsl(H, Sa, Li + 6)}"/>
            <stop offset="0.7"  stop-color="${hsl(H, Math.min(70, Sa + 8), Li + 16)}"/>
            <stop offset="1"    stop-color="${hsl(H, Sa, Li - 4)}"/>
        </linearGradient>`);
        out.push(`<path d="${poly}" fill="url(#${id('st')})" stroke="${hsl(H, Sa, Li - 12)}"
                        stroke-width="${gdS().hairline}" stroke-linejoin="round"/>`);

        // ---- ЛИСТЬЯ ----
        // Три градиента на растение, а не по одному на лист: листьев бывает
        // полтора десятка, а грядок шесть, и каждый градиент — узел в
        // документе, который перестраивается каждую секунду.
        for (let v = 0; v < 3; v++) {
            const hv = H + (v - 1) * 5;
            defs.push(`<linearGradient id="${id('lf' + v)}" x1="0" y1="0" x2="1" y2="0.6">
                <stop offset="0"    stop-color="${hsl(hv, Sa - 6, Li + 2 + v * 3)}"/>
                <stop offset="0.55" stop-color="${hsl(hv, Sa + 10, Li + 16 + v * 3)}"/>
                <stop offset="1"    stop-color="${hsl(hv + 6, Sa + 14, Li + 26 + v * 2)}"/>
            </linearGradient>`);
        }

        (p.leaves || []).forEach((lf, n) => {
            // Лист появляется не сразу: он «раскрывается», когда стебель дорос
            // до его высоты. Иначе куст вырастает целиком и рост не читается.
            const revealAt = lf.t * 0.78;
            if (g < revealAt) return;
            const local = Math.min(1, (g - revealAt) / 0.22);
            if (local <= 0) return;

            const sp = this.stemPointAt(geo, p, lf.t);
            const hwid = this.stemWidthAt(lf.t, base, tipW, p) / 2;
            const nx = sp.nx * lf.side, ny = sp.ny * lf.side;
            // Черешок выносит крепление НА поверхность стебля, а не в его
            // центр: иначе лист проваливается внутрь стебля.
            const lx = sp.x + nx * hwid * 0.55 * (lf.distScale || 1);
            const ly = sp.y + ny * hwid * 0.55 * (lf.distScale || 1);
            const ang = (Math.atan2(ny, nx) + (lf.angleVar || 0)) * 180 / Math.PI;

            const sizeMul = p.leafSizeBase * (lf.sizeScale || 1) * local;
            // Лист меряется от стебля, а не от холста: тонкий стебель с
            // огромным листом выглядит поломанным. Числа подняты против
            // прежнего сада ровно во столько, во сколько сцена грядки крупнее
            // того холста в горшке.
            const L = Math.max(5, (15 + p.thickness * 10) * sizeMul);
            const W = L * 0.56;
            const grad = id('lf' + (n % 3));

            const veins = p.leafShape === 'fern' ? '' : `
                <path d="M2 0 L${(L - 2).toFixed(1)} 0" stroke="${hsl(H, Sa - 4, Li - 12)}"
                      stroke-width="${gdS().hairline}" opacity="0.55" fill="none"/>
                <path d="M${(L * 0.3).toFixed(1)} 0 Q${(L * 0.5).toFixed(1)} ${(-W * 0.18).toFixed(1)} ${(L * 0.68).toFixed(1)} ${(-W * 0.32).toFixed(1)}
                         M${(L * 0.3).toFixed(1)} 0 Q${(L * 0.5).toFixed(1)} ${(W * 0.18).toFixed(1)} ${(L * 0.68).toFixed(1)} ${(W * 0.32).toFixed(1)}"
                      stroke="${hsl(H, Sa - 4, Li - 12)}" stroke-width="${gdS().hairline}" opacity="0.35" fill="none"/>`;

            out.push(`<g transform="translate(${lx.toFixed(1)} ${ly.toFixed(1)}) rotate(${ang.toFixed(1)})">
                <path d="${this.leafPath(p.leafShape, L, W)}" fill="url(#${grad})"
                      stroke="${hsl(H, Sa, Li - 14)}" stroke-width="${gdS().hairline}" stroke-linejoin="round"/>
                ${veins}
            </g>`);
        });

        // ---- ЦВЕТОК ----
        // Только пока плода нет: цветок — обещание урожая, и висеть рядом с
        // готовым плодом ему незачем.
        if (g > 0.86 && state === 'growing') {
            const bloom = Math.min(1, (g - 0.86) / 0.14);
            out.push(this.flower(geo.tipX, geo.tipY, bloom, p, id('fl')));
        }

        // ---- ПЛОД ----
        // Рисует его КУХНЯ своим же кодом: то, что выросло на грядке, и то,
        // что потом тащат на разделочную доску, — один предмет, и второй
        // картинки того же помидора в игре быть не должно.
        // fruitKey === null — плода у вида нет (трава). Проверка обязательна:
        // по неизвестному ключу кухня отдаёт запасной рисунок, и на грядке
        // вырастал пищеблок.
        if ((state === 'ripening' || state === 'ripe') && fruitKey && typeof KITCHEN_ART !== 'undefined') {
            const scale = state === 'ripe' ? 0.46 : 0.3;
            out.push(`<g transform="translate(${geo.tipX.toFixed(1)} ${(geo.tipY + 12).toFixed(1)}) scale(${scale})">
                        ${KITCHEN_ART.ingredient(fruitKey, seed)}
                      </g>`);
        }

        return `<g transform="translate(0 ${y0})">
            <defs>${defs.join('')}</defs>
            ${out.join('')}
        </g>`;
    },

    // Цветок: лепестки-капли с градиентом от тёмного основания к светлому
    // кончику, мягкий ореол и сердцевина. Плоские кружки на месте цветка
    // выглядели наклейкой.
    flower(cx, cy, bloom, p, gid) {
        const len = (11 + p.thickness * 2.4) * bloom, wide = len * 0.52;
        const petals = [];
        const count = p.petalCount || 6;
        for (let i = 0; i < count; i++) {
            petals.push(`<path transform="rotate(${(360 * i / count).toFixed(1)})"
                d="M0 0 Q${(len * 0.35).toFixed(1)} ${(-wide * 0.5).toFixed(1)} ${len.toFixed(1)} 0
                   Q${(len * 0.35).toFixed(1)} ${(wide * 0.5).toFixed(1)} 0 0 Z"
                fill="url(#${gid}-p)"/>`);
        }
        const core = len * 0.42;
        return `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)})">
            <defs>
                <radialGradient id="${gid}-g">
                    <stop offset="0" stop-color="${p.flowerColor}" stop-opacity="0.33"/>
                    <stop offset="1" stop-color="${p.flowerColor}" stop-opacity="0"/>
                </radialGradient>
                <linearGradient id="${gid}-p" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stop-color="${p.flowerColor}" stop-opacity="0.75"/>
                    <stop offset="1" stop-color="${p.flowerColor}"/>
                </linearGradient>
                <radialGradient id="${gid}-c" cx="0.35" cy="0.35">
                    <stop offset="0" stop-color="#fff8d0"/>
                    <stop offset="1" stop-color="#e8b93a"/>
                </radialGradient>
            </defs>
            <circle r="${(len * 2.1).toFixed(1)}" fill="url(#${gid}-g)"/>
            ${petals.join('')}
            <circle r="${core.toFixed(1)}" fill="url(#${gid}-c)" stroke="rgba(140,100,10,0.35)" stroke-width="${gdS().hairline}"/>
        </g>`;
    },
});
