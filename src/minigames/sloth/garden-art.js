// ================= ГРАФИКА САДА: ВСЁ РИСУЕТСЯ ЗДЕСЬ =================
// Ни одного эмодзи. Участок, грядки, инструменты и само растение — свои SVG,
// собранные строками, как кухня в kitchen-art.js.
//
// ---------- ДВА СЛОЯ ----------
// Участок живёт в системе координат СЦЕНЫ: она шире экрана, и по ней ездит
// камера — сад разглядывают, ведя пальцем вбок. Инструменты лежат в
// координатах ЭКРАНА и камере не подчиняются: их держат перед собой, они не
// уезжают вместе с грядками. Ровно та же пара слоёв, что на кухне.
//
// ---------- РАСТЕНИЕ РИСУЕТСЯ ЗДЕСЬ ЖЕ, А НЕ НА CANVAS ----------
// Прежний сад рисовал растение на отдельном canvas в горшке. С шестью
// грядками это шесть холстов, которые надо синхронизировать с масштабом
// стейджа и перерисовывать на каждый ресайз. Здесь растение — такой же SVG в
// той же сцене, что и всё остальное: одна система координат, одна камера,
// один порядок отрисовки. Форма берётся из PlantModel (трейты и план
// листьев), а он выводит её из сида — растение переживает перезагрузку.
//
// ---------- ЧТО ПОКАЗЫВАЕТ ВРЕМЯ ----------
// Часы и минуты в игре без слов показать нечем, кроме самого растения:
// росток тем выше, чем ближе срок. Это и есть шкала — она же и картинка.

const gdPal = () => PALETTE.garden;
const gdInk = () => PALETTE.ink;

// Толщины: сцена сада нарисована в масштабе стейджа (1:1), поэтому лестница
// линий берётся как есть, без удвоения, — в отличие от кухни, нарисованной
// в двойном размере.
const gdS = () => STROKE;

function gdRng(seed) {
    let h = (seed >>> 0) ^ 0x85ebca6b;
    return function () {
        h = (h + 0x6D2B79F5) >>> 0;
        let t = h;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Невидимая зона захвата. Как и на кухне: `fill="none"` событий не ловит,
// нужна прозрачная заливка. Центр задаётся явно — грядки нарисованы в
// абсолютных координатах сцены, и зона с центром в нуле уехала бы в небо
// (docs/traps.md, п. 1).
function gdGrab(x, y, rx, ry) {
    return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"
                     fill="#000" fill-opacity="0" pointer-events="all"/>`;
}

const GARDEN_ART = {

    // ---------- ГЕОМЕТРИЯ ----------
    // Грядки в один ряд: панорама вбок читается как «иду вдоль участка», а
    // сетка два на три потребовала бы ещё и вертикального хода — два жеста
    // там, где хватает одного.
    // Грядка занимает больше половины ширины экрана: она — главный предмет
    // сада, и работать с ней придётся пальцем. Мелкая грядка тонет в газоне и
    // требует целиться.
    BED_W: 216,
    BED_STEP: 238,
    BED_X0: 136,          // центр первой грядки в координатах сцены
    SOIL_Y: 618,          // линия земли
    // Горизонт низко: между ним и грядками должна остаться полоса газона, а
    // не половина экрана. При высоком горизонте участок читался пустым полем,
    // на краю которого зачем-то стоят две грядки.
    SKY_H: 430,

    bedX(i) { return this.BED_X0 + i * this.BED_STEP; },
    sceneW(n) { return this.BED_X0 * 2 + (n - 1) * this.BED_STEP; },

    // ---------- УЧАСТОК ----------
    scene(bedCount) {
        const k = gdPal(), ink = gdInk(), S = gdS();
        const W = this.sceneW(bedCount);
        const parts = [];

        parts.push(`
        <defs>
            <!-- «Гуашь» для струи из лейки: та же, что на кухне. Шарики под
                 ней сливаются в связную воду, отдельных не видно. -->
            <filter id="gd-goo" x="-25%" y="-15%" width="150%" height="130%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b"/>
                <feColorMatrix in="b" type="matrix" values="
                    1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 26 -11"/>
            </filter>
        </defs>

        <rect x="-400" y="-400" width="${W + 800}" height="${this.SOIL_Y + 400}" fill="${k.sky[300]}"/>
        <rect x="-400" y="${this.SKY_H}" width="${W + 800}" height="${this.SOIL_Y - this.SKY_H + 900}"
              fill="${k.turf[500]}"/>
        <path d="M-400 ${this.SKY_H} H${W + 400}" stroke="${k.turf[700]}" stroke-width="${S.structure}"/>`);

        // Далёкие холмы: горизонт нужен, чтобы небо не было плоской заливкой,
        // а участок читался как место под открытым небом.
        const rng = gdRng(7);
        for (let i = 0; i < 7; i++) {
            const cx = -200 + i * ((W + 400) / 6);
            const rx = 150 + rng() * 130, ry = 40 + rng() * 46;
            parts.push(`<ellipse cx="${cx.toFixed(0)}" cy="${this.SKY_H}" rx="${rx.toFixed(0)}" ry="${ry.toFixed(0)}"
                                 fill="${k.turf[700]}" opacity="0.45"/>`);
        }
        for (let i = 0; i < 5; i++) {
            const cx = 40 + i * ((W + 200) / 4.5);
            const cy = 70 + rng() * 90;
            const r = 26 + rng() * 22;
            parts.push(`<g opacity="0.9">
                <ellipse cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" rx="${(r * 1.7).toFixed(0)}" ry="${r.toFixed(0)}" fill="${k.sky[100]}"/>
                <ellipse cx="${(cx + r).toFixed(0)}" cy="${(cy - r * 0.4).toFixed(0)}" rx="${r.toFixed(0)}" ry="${(r * 0.75).toFixed(0)}" fill="${k.sky[100]}"/>
            </g>`);
        }

        // Трава на переднем плане: без неё нижняя треть экрана — плоская
        // заливка, и участок не читается как земля, по которой ходят.
        for (let i = 0; i < 140; i++) {
            const gx = -180 + rng() * (W + 360);
            const gy = this.SOIL_Y + 40 + rng() * 190;
            const gh = 8 + rng() * 14;
            parts.push(`<path d="M${gx.toFixed(0)} ${gy.toFixed(0)} q${(rng() * 8 - 4).toFixed(0)} ${(-gh * 0.7).toFixed(0)} ${(rng() * 10 - 5).toFixed(0)} ${(-gh).toFixed(0)}"
                    fill="none" stroke="${k.turf[700]}" stroke-width="${S.detail}" stroke-linecap="round" opacity="0.55"/>`);
        }

        for (let i = 0; i < bedCount; i++) {
            parts.push(`<g id="gd-bed-${i}" class="gd-bed" data-bed="${i}"></g>`);
        }
        // Находки живут в СВОЁМ слое, а не внутри грядки: грядка
        // перерисовывается целиком раз в секунду, и всплывающая монетка
        // исчезала бы на середине полёта — что и происходило, пока она была
        // её ребёнком.
        // Слой ручной работы: инструмент в рабочем положении. Отдельно от
        // грядки по той же причине, что и находки, — грядка перерисовывается
        // целиком, а инструмент должен ходить за пальцем каждый кадр.
        parts.push(`<g id="gd-work"></g>`);
        parts.push(`<g id="gd-finds"></g>`);
        parts.push(`<g id="gd-stream" filter="url(#gd-goo)" fill="${k.water[500]}"></g>`);
        return parts.join('');
    },

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
    // пикселях холста: сцена одного размера всегда (инвариант 10), поэтому
    // пересчитывать нечего.
    PLANT_MAX_H: 210,       // высота самого рослого вида при полном росте
    PLANT_LATERAL: 62,      // предел бокового ухода: за свою грядку не вылезаем

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

    // ---------- ЗНАЧОК НАД ГРЯДКОЙ ----------
    // Главный ответ на вопрос «а что дальше». Над каждой грядкой висит одно
    // из двух:
    //   * ЧЕМ её надо тронуть — маленький значок нужного инструмента. Грядка
    //     сама просит руку, лопату, семечко, лейку или грабли, и просьбу
    //     видно, не подходя к ней;
    //   * СКОЛЬКО ещё ждать — кольцо со временем внутри.
    //
    // Время внутри кольца — цифрами. Цифра не слово (инвариант 9), а кольцо
    // без числа отвечает только «скоро/не скоро»: разницу между двумя часами
    // и двадцатью минутами по дуге не увидеть, а решение «ждать или скинуть
    // какашкой» принимается именно по ней.
    badge(kind, frac, leftMs) {
        const k = gdPal(), ink = gdInk(), S = gdS();
        if (kind === 'wait') {
            const r = 20, C = 2 * Math.PI * r;
            const done = Math.max(0, Math.min(1, frac));
            return `<g class="gd-badge gd-badge-wait">
                <circle r="${r + 7}" fill="${k.soil[700]}" opacity="0.62"/>
                <circle r="${r}" fill="none" stroke="${k.sky[100]}" stroke-width="4" opacity="0.3"/>
                <circle r="${r}" fill="none" stroke="${k.sky[100]}" stroke-width="4"
                        stroke-linecap="round" transform="rotate(-90)"
                        stroke-dasharray="${(C * done).toFixed(1)} ${C.toFixed(1)}"/>
                <text class="gd-clock" x="0" y="0">${this.clock(leftMs)}</text>
            </g>`;
        }
        // Кольцо работы: сколько движений уже сделано. Не пульсирует —
        // работа идёт прямо сейчас, звать никуда не надо.
        if (kind === 'work') {
            const r = 20, C = 2 * Math.PI * r;
            const done = Math.max(0, Math.min(1, frac));
            return `<g class="gd-badge gd-badge-wait">
                <circle r="${r + 7}" fill="${k.soil[700]}" opacity="0.62"/>
                <circle r="${r}" fill="none" stroke="${k.turf[300]}" stroke-width="5" opacity="0.3"/>
                <circle r="${r}" fill="none" stroke="${k.turf[300]}" stroke-width="5"
                        stroke-linecap="round" transform="rotate(-90)"
                        stroke-dasharray="${(C * done).toFixed(1)} ${C.toFixed(1)}"/>
            </g>`;
        }
        // Цена заваленной грядки: жетон лени и сколько их надо. Цифра не
        // слово (инвариант 9), а «сколько стоит» показать больше нечем.
        // Красным — когда не хватает: отказ должен быть виден ДО того, как
        // игрок начнёт разгребать завал.
        if (kind === 'price') {
            const enough = !!leftMs;          // сюда приходит «хватает ли»
            return `<g class="gd-badge gd-badge-need">
                <circle r="26" fill="${k.soil[700]}" opacity="${enough ? 0.55 : 0.7}"/>
                <g transform="translate(0 -6) scale(0.85)">${this.token(enough)}</g>
                <text class="gd-price" x="0" y="19">${GARDEN.BED_COST.amount}</text>
            </g>`;
        }
        // Значок инструмента — тот же рисунок, что на полке, только мельче:
        // игрок ищет глазами ровно ту вещь, которую грядка просит.
        const inner = kind === 'hand'
            ? this.hand()
            : kind === 'seed'
                ? `<g transform="scale(0.85)">${this.seedItem('potato')}</g>`
                : `<g transform="scale(0.62)">${this.tool(kind)}</g>`;
        return `<g class="gd-badge gd-badge-need">
            <circle r="24" fill="${k.soil[700]}" opacity="0.55"/>
            ${inner}
        </g>`;
    },

    // Часы без слов: «2:45» — это два часа сорок пять минут, «12:30» — двенадцать
    // с половиной минут. Буквы «ч» и «м» здесь были бы подписью, а циферблат
    // читается сам: крупная доля слева, мелкая справа, как на любых часах.
    clock(ms) {
        const left = Math.max(0, ms || 0);
        const totalMin = Math.ceil(left / 60000);
        if (totalMin >= 60) {
            const h = Math.floor(totalMin / 60), m = totalMin % 60;
            return `${h}:${String(m).padStart(2, '0')}`;
        }
        const sec = Math.ceil(left / 1000);
        return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    },

    // Жетон лени: росток в круге. Тем же значком помечена цена грядки и
    // будущий магазин — валюта обязана выглядеть одинаково везде, иначе её
    // не узнать.
    token(enough) {
        const k = gdPal(), ink = gdInk(), S = gdS();
        const body = enough === false ? k.iron[300] : k.turf[300];
        return `<g>
            <circle r="15" fill="${body}" stroke="${ink}" stroke-width="${S.structure}"/>
            <path d="M0 7 V-3 q0 -8 8 -9 q1 8 -8 9 M0 1 q0 -7 -8 -8 q-1 7 8 8"
                  fill="none" stroke="${ink}" stroke-width="${S.detail}" stroke-linecap="round"/>
        </g>`;
    },

    // ---------- НАХОДКА ----------
    // Что попалось в земле — показывается ПРЕДМЕТОМ, а не числом в углу
    // экрана. Число в кошельке игрок не связывает с ямкой, которую только что
    // выкопал, а связь «копнул — нашёл» и есть весь смысл находок.
    find(kind, key) {
        const k = gdPal(), ink = gdInk(), S = gdS();
        if (kind === 'gold') {
            return `<g class="gd-find">
                <circle r="15" fill="${k.coin[500]}" stroke="${ink}" stroke-width="${S.structure}"/>
                <circle r="9" fill="none" stroke="${ink}" stroke-width="${S.detail}" opacity="0.6"/>
            </g>`;
        }
        if (kind === 'seed') {
            return `<g class="gd-find"><g transform="scale(1.1)">${this.seedItem(key || 'potato')}</g></g>`;
        }
        // Сено — второй продукт любого растения. Показывается так же, как
        // находка: предметом над грядкой, а не цифрой в кошельке.
        if (kind === 'hay') {
            return `<g class="gd-find"><g transform="scale(1.15)">${this.hay()}</g></g>`;
        }
        // Осколок жетона: обломок с зазубренным краем, а не аккуратная
        // фигура — по силуэту сразу видно, что это ЧАСТЬ чего-то целого.
        return `<g class="gd-find">
            <path d="M-13 -8 L4 -14 L14 2 L6 15 L-8 12 L-14 2 Z"
                  fill="${k.shard[500]}" stroke="${ink}" stroke-width="${S.structure}" stroke-linejoin="round"/>
            <path d="M-6 -4 L2 8" stroke="${ink}" stroke-width="${S.detail}" opacity="0.5"/>
        </g>`;
    },

    // ---------- ИНСТРУМЕНТЫ ----------
    // Лежат на переднем плане и камере не подчиняются: их держат перед собой.
    // Интерфейс диегетический — предмет тащат на грядку, а не выбирают в меню.
    tool(kind) {
        const k = gdPal(), ink = gdInk(), S = gdS();
        const line = `stroke="${ink}" stroke-width="${S.structure}" stroke-linejoin="round"`;
        switch (kind) {
            case 'spade':
                return `${gdGrab(0, 0, 26, 34)}
                    <rect x="-4" y="-34" width="8" height="40" rx="4" fill="${k.wood[500]}" ${line}/>
                    <path d="M-13 4 H13 L9 26 Q0 34 -9 26 Z" fill="${k.iron[300]}" ${line}/>`;
            case 'can':
                // Носик описан ЗДЕСЬ же (CAN_SPOUT/CAN_AXIS ниже): откуда
                // течёт вода — свойство рисунка, и экран не должен угадывать
                // его координаты по памяти.
                return `${gdGrab(0, 0, 30, 26)}
                    <path d="M-18 -8 h30 v26 q0 8 -8 8 h-14 q-8 0 -8 -8 Z" fill="${k.iron[500]}" ${line}/>
                    <path d="M-18 -2 l-14 -12 l-4 6 l12 12 Z" fill="${k.iron[300]}" ${line}/>
                    <path d="M-4 -8 q0 -14 12 -14" fill="none" stroke="${ink}" stroke-width="${S.detail}"/>`;
            case 'rake':
                return `${gdGrab(0, 0, 26, 34)}
                    <rect x="-4" y="-34" width="8" height="40" rx="4" fill="${k.wood[500]}" ${line}/>
                    <path d="M-16 6 H16" stroke="${k.iron[500]}" stroke-width="7" stroke-linecap="round"/>
                    <path d="M-13 6 V22 M-4 6 V24 M5 6 V24 M14 6 V22"
                          stroke="${k.iron[500]}" stroke-width="4" stroke-linecap="round"/>`;
            case 'dung':
                // Удобрение — та самая какашка, которую червь оставил на полу.
                return `${gdGrab(0, 0, 26, 20)}
                    <ellipse cx="0" cy="10" rx="22" ry="10" fill="${k.dung[500]}" ${line}/>
                    <ellipse cx="-2" cy="-1" rx="15" ry="8" fill="${k.dung[500]}" ${line}/>
                    <ellipse cx="2" cy="-11" rx="9" ry="6" fill="${k.dung[300]}" ${line}/>`;
            default:
                return '';
        }
    },

    // ---------- НОСИК ЛЕЙКИ ----------
    // Точка, из которой выходит вода, и направление её оси — в СВОИХ
    // координатах лейки, до поворота и масштаба. Экран поворачивает их вместе
    // с предметом: так струя выходит из носика при любом наклоне, а не из
    // точки, подобранной на глаз под один-единственный угол.
    CAN_SPOUT: { x: -34, y: -12 },
    CAN_AXIS:  { x: -16, y: -10 },
    // На сколько опрокидывается лейка при поливе. Знак тот же, что у SVG
    // rotate: против часовой — носик уходит вниз.
    CAN_TILT: -52,

    // Лужа под струёй: сколько вылито, столько и мокрого. Это единственный
    // показатель прогресса полива, который не требует ни цифр, ни подписи —
    // земля просто темнеет.
    puddle(frac) {
        const k = gdPal();
        const f = Math.max(0, Math.min(1, frac));
        const rx = 10 + 44 * f, ry = 4 + 13 * f;
        // Мокрая земля ТЕМНЕЕТ — это и читается как «полито». Синяя лужа на
        // грядке выглядела бы разлитой краской: воду видно в струе, а в земле
        // видно только её след.
        return `<ellipse cx="0" cy="0" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}"
                         fill="${k.soil[700]}" opacity="${(0.3 + 0.55 * f).toFixed(2)}"/>
                <ellipse cx="0" cy="${(-ry * 0.15).toFixed(1)}" rx="${(rx * 0.5).toFixed(1)}" ry="${(ry * 0.45).toFixed(1)}"
                         fill="${k.water[500]}" opacity="${(0.2 + 0.3 * f).toFixed(2)}"/>`;
    },

    // ---------- МЕШОК С СЕМЕНАМИ ----------
    // Вместо ряда одинаковых пакетиков — один мешок. Причина простая: видов
    // будет больше, чем помещается на полке, и ряд пакетиков превратился бы в
    // ленту прокрутки, то есть в меню. Мешок — предмет: его держат, его
    // открывают, в него заглядывают. Интерфейс остаётся диегетическим, как
    // холодильник на кухне.
    //
    // Открывается удержанием: короткий тап по мешку ничего не делает, и это
    // правильно — полка тесная, случайное касание не должно разворачивать
    // пол-экрана.
    // Нутро — скруглённый ПРЯМОУГОЛЬНИК, а не овал: в мешок разложена сетка,
    // и у овала угловые ячейки вылезают за край — семечко лежит наполовину
    // снаружи. Форма подчиняется раскладке, а не наоборот.
    SACK: { cx: 195, cy: 688, w: 336, h: 212, cols: 4, rows: 2 },

    // Центр ячейки по её номеру. Место каждого вида ЗАКРЕПЛЕНО (порядок
    // берётся из таблицы видов): через неделю игрок помнит, что помидор лежит
    // второй во втором ряду, и тянется туда не глядя. Сетка при этом не
    // нарисована — ячейки нужны раскладке, а не глазу.
    sackCell(n) {
        const S = this.SACK;
        const cw = S.w / S.cols, ch = S.h / S.rows;
        const col = n % S.cols, row = Math.floor(n / S.cols);
        return {
            x: S.cx - S.w / 2 + cw * (col + 0.5),
            y: S.cy - S.h / 2 + ch * (row + 0.5),
            w: cw, h: ch
        };
    },

    // Закрытый мешок: перевязанный горловиной куль. Рисуется в тех же
    // габаритах, что и остальные инструменты на полке.
    sackClosed(hold) {
        const k = gdPal(), ink = gdInk(), S = gdS();
        // hold 0..1 — насколько долго его держат: мешок раздувается, и по
        // этому видно, что удержание работает и сколько осталось.
        const h = Math.max(0, Math.min(1, hold || 0));
        const w = 26 + 4 * h;
        return `${gdGrab(0, 0, 30, 34)}
            <path d="M${-w} 8 q0 -20 ${w * 0.5} -24 q${w * 0.5} 4 ${w} 24 q0 18 -${w} 18 q-${w} 0 -${w} -18 Z"
                  transform="translate(0 4)" fill="${k.wood[300]}" stroke="${ink}"
                  stroke-width="${S.contour}" stroke-linejoin="round"/>
            <path d="M-13 -14 q13 -8 26 0 q-4 -12 -13 -14 q-9 2 -13 14 Z"
                  fill="${k.wood[500]}" stroke="${ink}" stroke-width="${S.structure}" stroke-linejoin="round"/>
            <path d="M-14 -13 q14 6 28 0" fill="none" stroke="${ink}" stroke-width="${S.structure}"/>
            <path d="M-6 6 q6 -4 12 0 M-8 14 q8 -4 16 0" fill="none"
                  stroke="${k.wood[500]}" stroke-width="${S.detail}" opacity="0.8"/>`;
    },

    // Открытый мешок: вид СВЕРХУ, как будто заглядываешь внутрь. Отвёрнутая
    // горловина кольцом, тёмное нутро, и в нём по ячейкам разложены семена.
    // items — [{ key, count }] в порядке ячеек; count === null означает
    // «бесконечно» (трава), и цифры у неё нет.
    sackOpen(items) {
        const k = gdPal(), ink = gdInk(), S = gdS();
        const B = this.SACK;
        const x = B.cx - B.w / 2, y = B.cy - B.h / 2;
        const out = [`
            <rect x="${(x - 16).toFixed(1)}" y="${(y - 14).toFixed(1)}"
                  width="${(B.w + 32).toFixed(1)}" height="${(B.h + 28).toFixed(1)}" rx="42"
                  fill="${k.wood[500]}" stroke="${ink}" stroke-width="${S.contour}"/>
            <rect x="${(x - 7).toFixed(1)}" y="${(y - 6).toFixed(1)}"
                  width="${(B.w + 14).toFixed(1)}" height="${(B.h + 12).toFixed(1)}" rx="36"
                  fill="${k.wood[300]}" stroke="${ink}" stroke-width="${S.structure}"/>
            <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${B.w}" height="${B.h}" rx="30"
                  fill="${k.soil[700]}"/>
            <ellipse cx="${B.cx}" cy="${y.toFixed(1)}" rx="${(B.w * 0.46).toFixed(1)}" ry="${(B.h * 0.3).toFixed(1)}"
                     fill="#000" opacity="0.16"/>`];

        // Сено лежит тут же, в углу горловины: им будут покупаться семена, и
        // смотреть на него игрок будет ровно в тот момент, когда открыл мешок
        // и увидел пустые ячейки.
        if (typeof GameState !== 'undefined') {
            // Над горловиной, а не внутри: внутри всё место занято ячейками,
            // и сноп налез бы на семена.
            out.push(`<g transform="translate(${B.cx} ${(y - 34).toFixed(1)})">
                ${this.hay()}
                <text class="gd-seed-count" x="26" y="8">${GameState.currency('hay')}</text>
            </g>`);
        }

        (items || []).forEach((it, n) => {
            const c = this.sackCell(n);
            const empty = it.count === 0;
            out.push(`<g class="gd-sack-cell${empty ? ' gd-empty' : ''}" data-key="${it.key}"
                         transform="translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})">
                ${gdGrab(0, 0, c.w / 2 - 2, c.h / 2 - 2)}
                <g transform="translate(0 -6)">${this.seedItem(it.key)}</g>
                ${it.count === null ? '' : `<text class="gd-seed-count" x="0" y="32">${it.count}</text>`}
            </g>`);
        });
        return out.join('');
    },

    // Одна семечка в ячейке: горстка зёрен цвета своего вида и над ней —
    // маленький силуэт того, что вырастет. Без силуэта семена неразличимы:
    // зерно и зерно, а игрок выбирает не зерно, а помидор.
    seedItem(key) {
        const ink = gdInk(), S = gdS(), k = gdPal();
        const spec = (typeof GARDEN !== 'undefined' && GARDEN.species[key]) || null;
        const hue = spec ? Math.round((spec.hue[0] + spec.hue[1]) / 2) : 90;
        const grain = `hsl(${hue}, 34%, 42%)`;
        const rng = gdRng(key.length * 37 + 11);
        const heap = [];
        for (let i = 0; i < 5; i++) {
            const gx = (rng() * 2 - 1) * 13;
            const gy = 8 + rng() * 7;
            heap.push(`<ellipse cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" rx="5" ry="3.4"
                                transform="rotate(${(rng() * 60 - 30).toFixed(0)} ${gx.toFixed(1)} ${gy.toFixed(1)})"
                                fill="${grain}" stroke="${ink}" stroke-width="${S.hairline}"/>`);
        }
        // Что вырастет. У плодовых это сам плод — тот же рисунок, что на
        // кухне; у травы плода нет, и вместо него пучок травы: по нему сразу
        // видно, что это «просто трава», а не чей-то урожай.
        const top = (spec && spec.fruit && typeof KITCHEN_ART !== 'undefined')
            ? `<g transform="translate(0 -8) scale(0.26)">${KITCHEN_ART.ingredient(spec.fruit, 3)}</g>`
            : `<g transform="translate(0 -6)">
                 <path d="M0 8 q-3 -12 -10 -18 M0 8 q0 -14 0 -20 M0 8 q3 -12 10 -17"
                       fill="none" stroke="hsl(${hue}, 40%, 44%)" stroke-width="3" stroke-linecap="round"/>
               </g>`;
        return `<g>${heap.join('')}${top}</g>`;
    },

    // Сено: перевязанный сноп. Второй продукт любого растения, и валюта, на
    // которую потом будут покупаться семена.
    hay() {
        const k = gdPal(), ink = gdInk(), S = gdS();
        return `<g>
            <path d="M-14 12 q2 -22 6 -26 M-6 13 q0 -24 2 -28 M2 13 q2 -24 6 -27 M10 12 q0 -20 4 -24"
                  fill="none" stroke="${k.wood[300]}" stroke-width="4" stroke-linecap="round"/>
            <path d="M-16 6 q16 6 32 -2" fill="none" stroke="${ink}" stroke-width="${S.structure}"/>
            <path d="M-15 12 q16 6 31 -3" fill="none" stroke="${k.wood[500]}" stroke-width="${S.structure}"/>
        </g>`;
    },

};

if (typeof window !== 'undefined') window.GARDEN_ART = GARDEN_ART;
