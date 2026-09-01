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
        parts.push(`<g id="gd-stream" filter="url(#gd-goo)" fill="${k.sky[500]}"></g>`);
        return parts.join('');
    },

    // ---------- ОДНА ГРЯДКА ----------
    // Состояние грядки видно ПО НЕЙ САМОЙ, без подписей:
    //   locked   — завалена камнями и хворостом,
    //   empty    — вскопанная рыхлая земля,
    //   sown     — бугорок с семенем, земля сухая,
    //   growing  — росток тем выше, чем ближе срок,
    //   weedy    — выросло, но заросло сорняками,
    //   ripening — прополото, плод набухает,
    //   ripe     — плод налился, его видно целиком.
    bed(state, opts) {
        const k = gdPal(), ink = gdInk(), S = gdS();
        const o = opts || {};
        const x = 0, y = this.SOIL_Y;
        const hw = this.BED_W / 2;
        const out = [];

        // Короб грядки — трапеция: низ шире верха, как доска на кухне. Из этого
        // сразу читается, что смотрим сверху-сбоку, а не в упор.
        out.push(`
        <path d="M${-hw + 16} ${y - 34} H${hw - 16} L${hw} ${y + 22} H${-hw} Z"
              fill="${k.soil[500]}" stroke="${ink}" stroke-width="${S.contour}" stroke-linejoin="round"/>`);

        if (state === 'locked') {
            // Завал: камни и хворост. Форма из сида грядки, чтобы шесть
            // заваленных грядок не были одинаковыми.
            const rng = gdRng(o.seed || 3);
            for (let i = 0; i < 7; i++) {
                const px = (rng() * 2 - 1) * (hw - 26);
                const py = y - 18 + rng() * 30;
                const r = 9 + rng() * 13;
                out.push(`<ellipse cx="${px.toFixed(0)}" cy="${py.toFixed(0)}" rx="${r.toFixed(0)}" ry="${(r * 0.72).toFixed(0)}"
                        fill="${rng() > 0.5 ? k.iron[300] : k.wood[500]}" stroke="${ink}" stroke-width="${S.detail}"/>`);
            }
            out.push(gdGrab(0, y - 10, hw, 44));
            return out.join('');
        }

        // Вскопанная земля: борозды. Они темнее самой земли — по ним и видно,
        // что грядку трогали.
        out.push(`<path d="M${-hw + 30} ${y - 16} H${hw - 30} M${-hw + 26} ${y - 2} H${hw - 26} M${-hw + 22} ${y + 12} H${hw - 22}"
                        stroke="${k.soil[700]}" stroke-width="${S.detail}" opacity="0.7"/>`);

        if (state === 'sown') {
            out.push(`<ellipse cx="0" cy="${y - 6}" rx="14" ry="9" fill="${k.soil[300]}"
                               stroke="${ink}" stroke-width="${S.detail}"/>`);
        }

        if (o.plant && (state === 'growing' || state === 'weedy' || state === 'ripening' || state === 'ripe')) {
            out.push(this.plant(o.plant, o.growth, state, o.fruitKey, o.seed || 1));
        }

        if (state === 'weedy') {
            // Сорняки поверх растения: они и есть «руками сюда».
            const rng = gdRng((o.seed || 5) + 91);
            for (let i = 0; i < 6; i++) {
                const px = (rng() * 2 - 1) * (hw - 30);
                const h = 26 + rng() * 26;
                const bend = (rng() * 2 - 1) * 16;
                out.push(`<path d="M${px.toFixed(0)} ${y - 8} q${bend.toFixed(0)} ${(-h * 0.6).toFixed(0)} ${(bend * 1.6).toFixed(0)} ${(-h).toFixed(0)}"
                        fill="none" stroke="${k.weed[500]}" stroke-width="${S.structure}" stroke-linecap="round"/>`);
            }
        }

        out.push(gdGrab(0, y - 20, hw, 56));
        return out.join('');
    },

    // ---------- РАСТЕНИЕ ----------
    // Трейты приходят из PlantModel (вид закрепляет полосу оттенка и форму,
    // сид отпускает остальное). growth 0..1 — насколько оно поднялось: это и
    // есть видимая шкала времени.
    plant(p, growth, state, fruitKey, seed) {
        const ink = gdInk(), S = gdS();
        const g = Math.max(0.08, Math.min(1, growth));
        const y0 = this.SOIL_Y - 18;       // поверхность грядки, а не её кромка
        const h = 40 + p.heightFrac * 180 * g;
        const tilt = (p.tilt || 0) * Math.PI / 180;
        const curve = (p.curve || 0) * 26;

        const stem = `hsl(${p.hue}, ${p.satBase.toFixed(0)}%, ${p.lightBase.toFixed(0)}%)`;
        const leaf = `hsl(${p.hue}, ${(p.satBase + 8).toFixed(0)}%, ${(p.lightBase + 16).toFixed(0)}%)`;

        // Стебель: кубическая кривая от земли. Низ строго вертикальный —
        // иначе основание выглядит приклеенным поверх грядки, а не растущим
        // из неё (та же ошибка, что чинили в прежнем саду).
        const tipX = Math.sin(tilt) * h * 0.8;
        const tipY = y0 - h;
        const d = `M0 ${y0} C0 ${(y0 - h * 0.34).toFixed(1)} ${(curve).toFixed(1)} ${(y0 - h * 0.7).toFixed(1)} ${tipX.toFixed(1)} ${tipY.toFixed(1)}`;

        const out = [`<path d="${d}" fill="none" stroke="${stem}"
                            stroke-width="${(3.4 + p.thickness).toFixed(1)}" stroke-linecap="round"/>`];

        // Листья по плану из модели: доля высоты, сторона, вариация размера.
        // Форма рисуется в СВОЕЙ системе координат и поворачивается целиком:
        // считать изогнутый лист прямо в координатах сцены — верный способ
        // получить тонкий серп вместо листа, что и вышло с первого раза.
        const shape = {
            oval:    (L, W) => `M0 0 Q${(L * 0.5).toFixed(1)} ${(-W).toFixed(1)} ${L.toFixed(1)} 0 Q${(L * 0.5).toFixed(1)} ${W.toFixed(1)} 0 0 Z`,
            pointed: (L, W) => `M0 0 Q${(L * 0.45).toFixed(1)} ${(-W).toFixed(1)} ${L.toFixed(1)} 0 Q${(L * 0.45).toFixed(1)} ${(W * 0.7).toFixed(1)} 0 0 Z`,
            heart:   (L, W) => `M0 0 Q${(L * 0.3).toFixed(1)} ${(-W * 1.25).toFixed(1)} ${(L * 0.72).toFixed(1)} ${(-W * 0.4).toFixed(1)} Q${L.toFixed(1)} ${(W * 0.15).toFixed(1)} ${(L * 0.6).toFixed(1)} ${(W * 0.7).toFixed(1)} Q${(L * 0.3).toFixed(1)} ${(W * 1.1).toFixed(1)} 0 0 Z`,
            fern:    (L, W) => `M0 0 Q${(L * 0.5).toFixed(1)} ${(-W * 0.75).toFixed(1)} ${L.toFixed(1)} ${(-W * 0.2).toFixed(1)} Q${(L * 0.5).toFixed(1)} ${(W * 0.55).toFixed(1)} 0 0 Z`
        };
        const draw = shape[p.leafShape] || shape.oval;

        (p.leaves || []).forEach(lf => {
            if (lf.t > g) return;                       // ещё не дорос до этого листа
            const t = lf.t;
            const lx = curve * t * (1 - t) * 3 + tipX * t * t;
            const ly = y0 - h * t;
            const L = (16 + 22 * p.leafSizeBase) * (lf.sizeScale || 1) * g;
            const W = L * 0.42;
            // Лист смотрит вверх-вбок: вниз он висел бы увядшим.
            const ang = lf.side > 0 ? -32 + (lf.angleVar || 0) * 40 : -148 - (lf.angleVar || 0) * 40;
            out.push(`<g transform="translate(${lx.toFixed(1)} ${ly.toFixed(1)}) rotate(${ang.toFixed(0)})">
                <path d="${draw(L, W)}" fill="${leaf}" stroke="${ink}" stroke-width="${S.detail}"
                      stroke-linejoin="round"/>
                <path d="M0 0 L${(L * 0.85).toFixed(1)} 0" stroke="${stem}" stroke-width="${S.hairline}" opacity="0.7"/>
            </g>`);
        });

        // Плод. Рисует его КУХНЯ своим же кодом: то, что выросло на грядке, и
        // то, что потом тащат на разделочную доску, — один и тот же предмет, и
        // второй картинки того же помидора в игре быть не должно.
        if ((state === 'ripening' || state === 'ripe') && fruitKey && typeof KITCHEN_ART !== 'undefined') {
            const scale = state === 'ripe' ? 0.42 : 0.28;
            out.push(`<g transform="translate(${tipX.toFixed(1)} ${(tipY + 10).toFixed(1)}) scale(${scale})">
                        ${KITCHEN_ART.ingredient(fruitKey, seed)}
                      </g>`);
        }
        return out.join('');
    },

    // ---------- ЗНАЧОК НАД ГРЯДКОЙ ----------
    // Главный ответ на вопрос «а что дальше». Над каждой грядкой висит одно
    // из двух:
    //   * ЧЕМ её надо тронуть — маленький значок нужного инструмента. Грядка
    //     сама просит лопату, семечко, лейку или грабли, и просьбу видно, не
    //     подходя к ней;
    //   * СКОЛЬКО ещё ждать — кольцо, которое заполняется.
    //
    // Без этого сад читался так: посадил, полил, росток есть — и дальше
    // непонятно ничего. Растение показывает время, но не показывает, нужен ли
    // от игрока ход ПРЯМО СЕЙЧАС, а это разные вопроса.
    badge(kind, frac) {
        const k = gdPal(), ink = gdInk(), S = gdS();
        if (kind === 'wait') {
            const r = 15, C = 2 * Math.PI * r;
            const done = Math.max(0, Math.min(1, frac));
            return `<g class="gd-badge gd-badge-wait">
                <circle r="${r + 6}" fill="${k.soil[700]}" opacity="0.55"/>
                <circle r="${r}" fill="none" stroke="${k.sky[100]}" stroke-width="4" opacity="0.35"/>
                <circle r="${r}" fill="none" stroke="${k.sky[100]}" stroke-width="4"
                        stroke-linecap="round" transform="rotate(-90)"
                        stroke-dasharray="${(C * done).toFixed(1)} ${C.toFixed(1)}"/>
            </g>`;
        }
        // Значок инструмента — тот же рисунок, что на полке, только мельче:
        // игрок ищет глазами ровно ту вещь, которую грядка просит.
        const art = kind === 'hand'
            ? `<path d="M-9 6 q-4 -12 2 -12 q2 -8 6 -4 q3 -7 6 -1 q4 -4 5 3 l1 10 q0 8 -9 8 q-8 0 -11 -4 Z"
                     fill="${PALETTE.flesh ? PALETTE.flesh[300] : '#e8b0a8'}" stroke="${ink}" stroke-width="${S.structure}"
                     stroke-linejoin="round"/>`
            : `<g transform="scale(0.62)">${this.tool(kind === 'seed' ? 'spade' : kind)}</g>`;
        const inner = kind === 'seed'
            ? `<g transform="scale(0.5)">${this.seedPacket('potato', 3)}</g>`
            : art;
        return `<g class="gd-badge gd-badge-need">
            <circle r="24" fill="${k.soil[700]}" opacity="0.55"/>
            ${inner}
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

    // Пакетик семян: сквозь окошко видно, что внутри — тот самый продукт,
    // который вырастет и который потом окажется на кухне.
    seedPacket(key, seed) {
        const k = gdPal(), ink = gdInk(), S = gdS();
        const art = (typeof KITCHEN_ART !== 'undefined') ? KITCHEN_ART.ingredient(key, seed || 3) : '';
        return `${gdGrab(0, 0, 26, 30)}
            <rect x="-20" y="-26" width="40" height="52" rx="5" fill="${k.wood[300]}"
                  stroke="${ink}" stroke-width="${S.structure}"/>
            <rect x="-20" y="-26" width="40" height="10" fill="${k.wood[500]}"/>
            <clipPath id="gd-pack-${key}"><rect x="-14" y="-12" width="28" height="30" rx="4"/></clipPath>
            <g clip-path="url(#gd-pack-${key})">
                <rect x="-14" y="-12" width="28" height="30" fill="${k.sky[100]}"/>
                <g transform="translate(0 4) scale(0.3)">${art}</g>
            </g>
            <rect x="-14" y="-12" width="28" height="30" rx="4" fill="none"
                  stroke="${ink}" stroke-width="${S.detail}"/>`;
    }
};

if (typeof window !== 'undefined') window.GARDEN_ART = GARDEN_ART;
