// ================= САД: ЗНАЧКИ, ИНСТРУМЕНТЫ, ЛЕЙКА, МЕШОК, ЦЕННИК, СТРЕЛКИ, МАГАЗИН =================
// Продолжение GARDEN_ART (garden-art.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после garden-art.js.
Object.assign(GARDEN_ART, {

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
                <text class="gd-price" x="0" y="19">${Backend.gardenBedCost().amount}</text>
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
    // Один добытый ресурс: сколько и чего. Число стоит ПЕРЕД значком, как в
    // любой строке добычи, и без него значок врёт — трава даёт два сена, а
    // сноп рисуется один.
    //
    // «+2» словом не является (инвариант 9): цифра — пиктограмма количества,
    // плюс — знак, а не буква.
    gain(kind, key, amount) {
        const n = amount == null ? 1 : amount;
        return `<g class="gd-find" data-gain="${kind}">
            <text class="gd-gain" x="-20" y="6">+${n}</text>
            <g transform="translate(10 0)">${this.gainIcon(kind, key)}</g>
        </g>`;
    },

    gainIcon(kind, key) {
        const k = gdPal(), ink = gdInk(), S = gdS();
        if (kind === 'gold') {
            return `<g>
                <circle r="15" fill="${k.coin[500]}" stroke="${ink}" stroke-width="${S.structure}"/>
                <circle r="9" fill="none" stroke="${ink}" stroke-width="${S.detail}" opacity="0.6"/>
            </g>`;
        }
        if (kind === 'seed') return `<g transform="scale(1.1)">${this.seedItem(key || 'potato')}</g>`;
        // Сено — второй продукт любого растения.
        if (kind === 'hay') return `<g transform="scale(1.15)">${this.hay()}</g>`;
        // Плод рисует КУХНЯ своим же кодом: то, что выросло на грядке, и то,
        // что потом тащат на доску, — один предмет.
        if (kind === 'fruit') {
            return (typeof KITCHEN_ART !== 'undefined')
                ? `<g transform="scale(0.4)">${KITCHEN_ART.ingredient(key, 3)}</g>` : '';
        }
        // Осколок лени: обломок с зазубренным краем — по силуэту видно, что
        // это ЧАСТЬ чего-то целого.
        if (kind === 'sloth_shard') {
            return `<g>
                <path d="M-13 -8 L4 -14 L14 2 L6 15 L-8 12 L-14 2 Z"
                      fill="${k.turf[300]}" stroke="${ink}" stroke-width="${S.structure}" stroke-linejoin="round"/>
                <path d="M-6 -4 L2 8" stroke="${ink}" stroke-width="${S.detail}" opacity="0.5"/>
            </g>`;
        }
        // Осколок жетона гнева — то же тело, но своего цвета: валюта чужая.
        return `<g>
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
        if (kind === 'shop') return this.shopBasket();
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

    // ---------- ЦЕННИК НА ПОЛКЕ ----------
    // Магазин лени не экран, а ЦЕННИКИ на тех же предметах, которыми
    // работают (план, раздел 6). Причина та же, по которой мешок открывается
    // тапом: отдельный экран покупок — это меню, а сад про предметы.
    //
    // Ценник висит НАД инструментом и нажимается сам по себе: тап по
    // инструменту берёт его в руку, тап по ценнику покупает ступень. Две
    // разные цели у двух разных дел — иначе пришлось бы заводить жест-
    // исключение, а он стоит дороже того, что защищает (раздел 4а).
    //
    // Не по карману — ценник приглушён и жетон серый, но ОСТАЁТСЯ нажимаемым:
    // выключенный ценник молчит, а молчание читается поломкой
    // (docs/traps.md, п. 91).
    priceTag(price, enough) {
        const k = gdPal(), ink = gdInk(), S = gdS();
        const cur = Object.keys(price || {})[0];
        const n = price ? price[cur] : 0;
        return `<g class="gd-tag${enough ? '' : ' gd-poor'}">
            ${gdGrab(0, 0, 30, 20)}
            <rect x="-27" y="-15" width="54" height="30" rx="13"
                  fill="${k.wood[300]}" stroke="${ink}" stroke-width="${S.structure}"/>
            <g transform="translate(-11 0) scale(0.62)">${this.token(enough)}</g>
            <text class="gd-price gd-tag-n" x="10" y="6">${n}</text>
        </g>`;
    },

    // Ступень выкуплена до потолка — вместо ценника галочка. Пустое место
    // читалось бы как «ценник не нарисовался», а галочка говорит «всё».
    tagDone() {
        const k = gdPal(), ink = gdInk(), S = gdS();
        return `<g class="gd-tag gd-tag-done">
            <circle r="13" fill="${k.turf[300]}" stroke="${ink}" stroke-width="${S.structure}"/>
            <path d="M-6 0 l4 5 l8 -10" fill="none" stroke="${ink}"
                  stroke-width="${S.structure}" stroke-linecap="round" stroke-linejoin="round"/>
        </g>`;
    },

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

    // ---------- СТРЕЛКИ ПЕРЕХОДА МЕЖДУ ГРЯДКАМИ ----------
    // Свободной панорамы у сада больше нет: в центре внимания ВСЕГДА одна
    // грядка, к соседней переезжают стрелкой. Разбор почему —
    // docs/plan/19-sloth-garden.md, раздел 1а.
    //
    // ЗОНА большая, РИСУНОК маленький. Это разные вещи, и путать их дорого:
    // попасть пальцем надо не целясь — значит полоса во весь край экрана; а
    // видеть игрок должен грядку, а не две серые плашки по бокам — значит на
    // виду остаётся одна галочка. Серую подложку убрали ровно поэтому: она
    // занимала собой столько же места, сколько зона, и экран читался как
    // «две кнопки, между ними что-то растёт».
    //
    // Стрелки НЕ ВИДНО там, где идти некуда. Приглушённая стрелка в никуда
    // была бы вопросом без ответа: игрок жмёт, ничего не происходит, и
    // причину показать нечем — направления, которого нет, не существует
    // (в отличие от цены, которой не хватило: её можно вздрогнуть).
    ARROW: { w: 62, y: 340, h: 300, pad: 0 },

    navArrow(dir) {
        const A = this.ARROW, ink = gdInk(), k = gdPal();
        const x = dir < 0 ? A.pad : 390 - A.pad - A.w;
        // Галочка рисуется от центра полосы и поворачивается зеркалом:
        // два отдельных пути разъехались бы по толщине и наклону.
        //
        // Знак проверен НА ЭКРАНЕ, а не выведен в уме: остриё галочки — это
        // средняя точка пути, и при tip = −9 у стрелки «влево» оно уезжало
        // ВПРАВО. Сторону в этом проекте проверяют, а не считают
        // (CLAUDE.md, «правило направления»).
        const cx = x + A.w / 2, cy = A.y + A.h / 2;
        const tip = dir < 0 ? 10 : -10;
        const d = `M${(cx + tip).toFixed(0)} ${(cy - 15).toFixed(0)}
                   L${(cx - tip).toFixed(0)} ${cy}
                   L${(cx + tip).toFixed(0)} ${(cy + 15).toFixed(0)}`;
        // Галочка рисуется ДВАЖДЫ: сначала тёмная и толстая, сверху светлая.
        // Подложки под ней больше нет, а фон под стрелкой бывает любой — от
        // светлого неба до тёмной земли, — и светлая линия на светлом
        // пропадает. Тёмный подбой стоит дешевле любой плашки: он ровно по
        // форме самой галочки и места собой не занимает.
        return `<g class="gd-arrow" data-dir="${dir}">
            <rect x="${x}" y="${A.y}" width="${A.w}" height="${A.h}"
                  fill="#000" fill-opacity="0" pointer-events="all"/>
            <path d="${d}" fill="none" stroke="${ink}" stroke-width="10"
                  stroke-opacity="0.3" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="${d}" fill="none" stroke="${k.sky[100]}" stroke-width="4.5"
                  stroke-linecap="round" stroke-linejoin="round"/>
        </g>`;
    },

    // ---------- ВХОД В МАГАЗИН ----------
    // Корзина на полке. Намеренно самая простая вещь в саду: магазин пока
    // нужен работающим, а не красивым, и оформлять его будут отдельно.
    // Рисуется в тех же габаритах, что остальные предметы полки.
    shopBasket() {
        const k = gdPal(), ink = gdInk(), S = gdS();
        return `${gdGrab(0, 0, 30, 32)}
            <path d="M-22 -6 H22 L17 20 H-17 Z" fill="${k.wood[300]}"
                  stroke="${ink}" stroke-width="${S.contour}" stroke-linejoin="round"/>
            <path d="M-14 -6 q0 -16 14 -16 q14 0 14 16" fill="none"
                  stroke="${ink}" stroke-width="${S.structure}" stroke-linecap="round"/>
            <path d="M-22 2 H22 M-9 -6 L-7 20 M9 -6 L7 20" fill="none"
                  stroke="${k.wood[500]}" stroke-width="${S.detail}"/>
        </g>`.replace('</g>', '');
    },

    // Закрытый мешок: перевязанный горловиной куль. Рисуется в тех же
    // габаритах, что и остальные инструменты на полке.
    sackClosed() {
        const k = gdPal(), ink = gdInk(), S = gdS();
        const w = 27;
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

        // Место каждого вида закреплено, поэтому ячейка никуда не девается,
        // что бы с ней ни было. Пустая приглушена, но остаётся: вид знаком,
        // семечек нет, — по ней видно, что искать. Купить её тут нельзя:
        // покупки живут в магазине (sloth-shop.js), и одно и то же не должно
        // продаваться в двух местах.
        (items || []).forEach((it, n) => {
            const c = this.sackCell(n);
            out.push(`<g class="gd-sack-cell gd-${it.state}" data-key="${it.key}"
                         data-state="${it.state}"
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
});
