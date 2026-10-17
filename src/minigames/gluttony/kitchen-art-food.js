// ================= КУХНЯ: ПРОДУКТЫ =================
// Продукты без контура, силуэт, нарезанное, бутыль, картинки для витрины магазина.
// Продолжение KITCHEN_ART (kitchen-art.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после kitchen-art.js.
Object.assign(KITCHEN_ART, {

    // ---------- ПРОДУКТЫ ----------
    // Рисуются в своём старом масштабе и ужимаются целиком: сцена стала
    // мельче (720 против 900), и переписывать все пути ради этого дороже,
    // чем один множитель.
    //
    // ---------- ПОЧЕМУ БЕЗ КОНТУРА ----------
    // Продукты были последним, что осталось от плоской мультяшной кухни:
    // три заливки и чернильная обводка поверх фотографической стали и
    // лакированного дерева. В кадре это читалось наклейками, приклеенными
    // на фотографию, — и никакая проверка этого не ловила, потому что все
    // они спрашивали про геометрию, а не про манеру.
    //
    // Теперь форму держит ПЕРЕПАД, как у всей остальной кухни: тёмная
    // ступень по краю вместо обводки, светлая в первой трети вместо ровной
    // заливки. Свет — из ВЕРХНЕГО ЛЕВОГО угла у всех восьми: разный свет на
    // соседних продуктах разваливает полку сильнее, чем разный цвет.
    //
    // Ступени лежат в палитре (PALETTE.kitchenScene.food), здесь только
    // смещения: они геометрия предмета, а не цвет.
    FOOD_KEYS: ['pork', 'potato', 'carrot', 'tomato', 'berry', 'herb',
                'pepper', 'block'],

    // Цифра остатка стоит ПОД продуктом, на столько единиц ниже его гнезда
    // (до умножения на масштаб продукта). Число объявлено здесь, а не зашито
    // в gluttony.js, потому что его спрашивает проверка подгонки: цифра —
    // такая же часть полки, как сам продукт, и уехать за край или под доску
    // переднего плана она может так же легко.
    COUNT_DY: 82,

    // ПОДОШВА У ВСЕХ ПРОДУКТОВ НА ОДНОЙ ВЫСОТЕ. Гнездо на полке — это одно
    // число, одно на все продукты сразу; значит и низ у них обязан быть на
    // одном уровне, иначе на одной полке помидор тонет, а пищеблок висит.
    // Числа — сдвиг до общей линии, промерен аудитом (tools/audit-food.py,
    // раздел «подошва»), а не подобран на глаз.
    FOOD_DY: { pork: 1, rib: 1, potato: 3.5, carrot: 3, tomato: -6.5,
               berry: -0.5, herb: -0.5, pepper: 1, block: 9.5 },
    // Насколько низ продукта ниже его гнезда — в единицах ДО общего
    // сжатия ITEM. Это число и связывает картинку с полкой: гнездо ставится
    // так, чтобы подошва легла на стекло.
    FOOD_SOLE: 35,

    ingredient(key, seed) {
        const dy = this.FOOD_DY[key] || 0;
        return `<g transform="scale(${this.ITEM}) translate(0 ${dy})">`
             + this.ingredientRaw(key, seed) + `</g>`;
    },

    ingredientRaw(key, seed) {
        const F = ktFood();
        const grab = ktGrab(this.GRAB.rx, this.GRAB.ry);
        // Тень под продуктом: он ЛЕЖИТ на полке, а не висит над ней. Пока
        // тени не было, все восемь висели в воздухе — на снимке полки это
        // первое, что бросалось в глаза.
        const drop = (rx, ry, cy) => ktSoft(rx, ry, cy);

        switch (key) {
            case 'pork':
            case 'rib': {
                const g = koUid('food'), gf = koUid('fat'), gm = koUid('marb');
                return grab + `
                <defs>
                    <!-- Круглый перепад, а не полосой: кусок мяса выпуклый,
                         и свет ложится на него пятном. -->
                    ${koRad(g, -16, -20, 78, koRamp([...F.meat].reverse(),
                        [0, 0.3, 0.52, 0.72, 0.89, 1]))}
                    ${koLin(gf, -44, -16, 6, 30, koRamp([...F.fat].reverse(), [0, 0.55, 1]))}
                    ${koLin(gm, -34, -28, 26, 16, [[0, F.meat[5], 0.95], [0.6, F.meat[5], 0.5],
                                                   [1, F.meat[5], 0]])}
                </defs>
                ${drop(50, 15, 30)}
                <path d="M-46 -8 q-8 -34 26 -40 q40 -8 62 12 q22 20 12 44 q-10 24 -44 26 q-46 4 -56 -42 Z"
                      fill="url(#${g})"/>
                <!-- Прожилки: залитые формы с сужением, а не обводки ровной
                     ширины (docs/art-direction.md). Три штуки вдоль волокна:
                     одна читается царапиной, три — мясом. -->
                <path d="M-30 -24 q26 -12 50 -1 q22 10 22 28 q-7 -15 -25 -22 q-23 -9 -47 -2 Z"
                      fill="url(#${gm})"/>
                <path d="M-33 -6 q28 -10 52 2 q17 9 19 24 q-8 -13 -23 -19 q-24 -10 -48 -3 Z"
                      fill="url(#${gm})" opacity="0.8"/>
                <path d="M-24 10 q24 -8 44 2 q14 7 17 18 q-8 -10 -20 -14 q-20 -7 -41 -2 Z"
                      fill="url(#${gm})" opacity="0.55"/>
                <!-- Жир — ПОЛОСА вдоль всего нижнего края, а не пятнышко в
                     углу. Это единственный признак, по которому кусок мяса
                     опознаётся мясом с полки; пятнышком он читался просто
                     розовым сгустком.
                     Полоса сходит на нет С ОБОИХ концов: срезанная прямо,
                     она упиралась в тупой угол и читалась налепленной
                     сверху, а не краем самого куска. -->
                <path d="M10 34 Q-36 38 -46 -8 Q-20 12 10 34 Z" fill="url(#${gf})"/>`;
            }
            case 'potato': {
                const g = koUid('food'), ge = koUid('eye');
                return grab + `
                <defs>
                    ${koRad(g, -16, -14, 64, koRamp([...F.potato].reverse(),
                        [0, 0.26, 0.48, 0.7, 0.88, 1]))}
                    ${koRad(ge, 0, 0, 6, [[0, F.potato[0]], [1, F.potato[1]]])}
                </defs>
                ${drop(44, 12, 30)}
                <ellipse cx="0" cy="0" rx="46" ry="32" fill="url(#${g})"/>
                <!-- Глазки: ямка тёмная, а НАД ней светлый серпик — так
                     читается вмятина, а не грязь.
                     Их ТРИ и они вразнобой. Две одинаковые ямки рядом в
                     середине картошка немедленно читаются ноздрями: любая
                     симметричная пара пятен на овале становится лицом. -->
                <g>
                    <ellipse cx="19" cy="-3" rx="6" ry="4.4" fill="url(#${ge})"/>
                    <path d="M13 -6 q6 -6 12 -1" fill="none" stroke="${F.potato[4]}"
                          stroke-width="2.4" opacity="0.75" stroke-linecap="round"/>
                    <ellipse cx="-4" cy="16" rx="4.2" ry="3" fill="url(#${ge})"/>
                    <path d="M-8 14 q4 -4 8 -1" fill="none" stroke="${F.potato[4]}"
                          stroke-width="2" opacity="0.6" stroke-linecap="round"/>
                    <ellipse cx="-25" cy="-4" rx="3.2" ry="2.4" fill="url(#${ge})" opacity="0.8"/>
                </g>`;
            }
            case 'carrot': {
                const g = koUid('food'), gr = koUid('ring');
                return grab + `
                <defs>
                    <!-- Перепад ПОПЕРЁК корнеплода: вдоль он бы сделал
                         морковь плоской лентой. -->
                    ${koLin(g, 16, -21, -24, 27, koRamp([...F.carrot].reverse(),
                        [0, 0.22, 0.44, 0.68, 0.87, 1]))}
                    ${koLin(gr, 13, -15, -13, 15, [[0, F.carrot[5], 0.8], [1, F.carrot[5], 0.15]])}
                </defs>
                ${drop(44, 12, 30)}
                <path d="M-38 -26 q46 4 68 44 q6 12 -8 14 q-42 4 -66 -44 q-4 -12 6 -14 Z"
                      fill="url(#${g})"/>
                <!-- Кольца: короткие борозды ПОПЕРЁК корнеплода. СЧИТАЮТСЯ
                     от оси, а не ставятся на глаз: три клина «примерно
                     поперёк» складывались в цепочку и читались молнией,
                     нарисованной на моркови. Каждая борозда начинается на
                     освещённом боку и сходит на нет к теневому — на тёмной
                     стороне борозд и не видно. -->
                ${[[0.3, 12], [0.48, 11], [0.66, 9]].map(([t, len]) => {
                    const px = -38 + 68 * t, py = -26 + 58 * t;   // точка на оси
                    const tx = 0.65, ty = -0.76;                  // поперёк, к свету
                    const ax = 0.76, ay = 0.65;                   // вдоль моркови
                    const w = 2.4;
                    const a = [px + tx * len, py + ty * len];
                    const b = [px - tx * len * 0.5, py - ty * len * 0.5];
                    const f = (v) => v.toFixed(1);
                    return `<path d="M${f(a[0] - ax * w)} ${f(a[1] - ay * w)}
                                     L${f(a[0] + ax * w)} ${f(a[1] + ay * w)}
                                     L${f(b[0])} ${f(b[1])} Z" fill="url(#${gr})"/>`;
                }).join('')}
                <!-- Ботва: три пера, каждое сужается к концу. -->
                <path d="M-36 -25 q-4 -18 4 -28 q6 8 4 27 Z" fill="${F.stem[2]}"/>
                <path d="M-39 -25 q-16 -12 -28 -10 q9 9 26 14 Z" fill="${F.stem[1]}"/>
                <path d="M-38 -26 q-14 -18 -10 -29 q9 6 14 27 Z" fill="${F.stem[3]}"/>`;
            }
            case 'tomato': {
                const g = koUid('food'), gs = koUid('spec'), gc = koUid('calyx');
                return grab + `
                <defs>
                    ${koRad(g, -14, -10, 56, koRamp([...F.tomato].reverse(),
                        [0, 0.18, 0.42, 0.68, 0.88, 1]))}
                    ${koRad(gs, -16, -14, 15, [[0, F.spec, 0.9], [0.55, F.spec, 0.4],
                                               [1, F.spec, 0]])}
                    ${koLin(gc, 0, -36, 0, -18, [[0, F.stem[3]], [1, F.stem[0]]])}
                </defs>
                ${drop(38, 11, 38)}
                <circle cx="0" cy="4" r="38" fill="url(#${g})"/>
                <!-- Блик: помидор глянцевый, и блик — это и есть его
                     глянец. Без него он матовый мячик. -->
                <ellipse cx="-16" cy="-14" rx="15" ry="11" fill="url(#${gs})"/>
                <path d="M0 -34 l-16 -12 l14 2 l-6 -16 l10 12 l8 -14 l2 16 l14 -6 l-10 14 Z"
                      fill="url(#${gc})"/>
                <path d="M-2 -34 q2 -6 4 -6 q3 4 1 7 Z" fill="${F.stem[0]}"/>`;
            }
            case 'berry': {
                // Три ягоды: дальние темнее ближней, иначе горсть читается
                // одним трёхлепестковым пятном.
                const b = (cx, cy, r, lo, hi, crown) => {
                    const g = koUid('food'), gs = koUid('spec');
                    return `<defs>
                        ${koRad(g, cx - r * 0.36, cy - r * 0.4, r * 1.5,
                            koRamp([F.berry[hi], F.berry[hi - 1], F.berry[3],
                                    F.berry[1], F.berry[lo]],
                                   [0, 0.24, 0.52, 0.82, 1]))}
                        ${koRad(gs, cx - r * 0.4, cy - r * 0.45, r * 0.5,
                            [[0, F.spec, 0.55], [1, F.spec, 0]])}
                    </defs>
                    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${g})"/>
                    <circle cx="${cx - r * 0.36}" cy="${cy - r * 0.4}" r="${r * 0.45}"
                            fill="url(#${gs})"/>` + (crown ? `
                    <!-- Корона: по ней голубика и опознаётся ягодой, а не
                         шариком. -->
                    <path d="M${cx - 7} ${cy - 4} l4 -4 l3 4 l4 -5 l3 5 l4 -4 l2 4
                             q-10 5 -20 0 Z" fill="${F.berry[0]}" opacity="0.75"/>` : '');
                };
                return grab + `
                ${drop(40, 12, 36)}
                ${b(-17, 4, 20, 0, 4, false)}
                ${b(15, -4, 22, 0, 5, false)}
                ${b(1, 19, 17, 0, 5, true)}`;
            }
            case 'herb': {
                // Лист: от тёмного основания к светлому кончику, поперёк —
                // жилка клином. Ровная заливка делает зелень бумажной.
                const leaf = (d, rib, a, b) => {
                    const g = koUid('food');
                    return `<defs>${koLin(g, a[0], a[1], b[0], b[1],
                        [[0, F.herb[1]], [0.45, F.herb[3]], [1, F.herb[5]]])}</defs>
                    <path d="${d}" fill="url(#${g})"/>
                    <path d="${rib}" fill="${F.herb[0]}" opacity="0.5"/>`;
                };
                return grab + `
                ${drop(34, 10, 36)}
                <!-- Стебель — клин: снизу толстый, к макушке сходит на нет. -->
                <path d="M-2 36 q-2 -38 8 -68 q4 30 -2 68 Z" fill="${F.herb[1]}"/>
                ${leaf('M4 6 q-30 -6 -34 -28 q26 -4 36 18 Z',
                       'M2 4 q-18 -6 -28 -22 q14 14 29 20 Z', [4, 6], [-30, -22])}
                ${leaf('M6 -12 q30 -8 36 -30 q-28 -2 -38 20 Z',
                       'M7 -13 q20 -8 30 -24 q-16 16 -30 22 Z', [6, -12], [40, -40])}
                ${leaf('M8 -34 q-26 -10 -26 -32 q24 2 30 24 Z',
                       'M7 -35 q-14 -10 -20 -28 q10 18 21 27 Z', [8, -34], [-18, -64])}`;
            }
            case 'pepper': {
                // Чили НАРОЧНО длинный и гнутый: с помидором он одного
                // цвета по природе, и развести их может только силуэт.
                // Проверяется числом — tools/audit-food.py, «различимость».
                const g = koUid('food'), gs = koUid('spec');
                return grab + `
                <defs>
                    ${koLin(g, 14, -18, -8, 22, koRamp([...F.pepper].reverse(),
                        [0, 0.2, 0.42, 0.66, 0.86, 1]))}
                    ${koLin(gs, -14, -22, 10, 4, [[0, F.spec, 0], [0.4, F.spec, 0.5],
                                                  [1, F.spec, 0]])}
                </defs>
                ${drop(44, 12, 34)}
                <path d="M-31 -25 q30 4 52 34 q10 14 1 22 q-10 8 -22 -4
                         q-24 -24 -38 -44 q-6 -9 7 -8 Z" fill="url(#${g})"/>
                <!-- Глянцевая полоса вдоль освещённого бока: у стручка кожа
                     лаковая, и это её единственный признак. -->
                <path d="M-22 -20 q22 6 38 28 q3 5 0 8 q-4 -12 -18 -24 q-12 -10 -22 -10 Z"
                      fill="url(#${gs})"/>
                <path d="M-31 -25 q-10 -14 -3 -22 q9 4 9 20 Z" fill="${F.stem[2]}"/>
                <path d="M-34 -46 q6 -4 9 1 q-5 3 -9 -1 Z" fill="${F.stem[1]}"/>`;
            }
            case 'block':
            default: {
                // Пищеблок — брикет прессованного нечто. Три грани разной
                // светлоты: без них это просто серый прямоугольник, а он
                // должен читаться КУСКОМ, который берут в руку.
                const gt = koUid('blkT'), gf = koUid('blkF'), gs = koUid('blkS');
                const speck = [];
                const rng = ktRng(seed || 3);
                for (let i = 0; i < 14; i++) {
                    const x = -40 + rng() * 66, y = -8 + rng() * 30;
                    speck.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}"
                        width="${(2 + rng() * 4).toFixed(1)}" height="${(2 + rng() * 3).toFixed(1)}"
                        rx="1" fill="${rng() > 0.5 ? F.block[0] : F.block[5]}" opacity="0.4"/>`);
                }
                return grab + `
                <defs>
                    ${koLin(gt, -24, -28, 48, -12, koRamp([F.block[5], F.block[4], F.block[3]],
                                                          [0, 0.5, 1]))}
                    ${koLin(gf, -42, -12, 30, 26, koRamp([F.block[3], F.block[2], F.block[1]],
                                                         [0, 0.55, 1]))}
                    ${koLin(gs, 30, -12, 48, 10, koRamp([F.block[1], F.block[0]], [0, 1]))}
                </defs>
                ${drop(46, 13, 30)}
                <path d="M-42 -12 L-24 -28 H48 L30 -12 Z" fill="url(#${gt})"/>
                <path d="M-42 -12 H30 V26 H-42 Z" fill="url(#${gf})"/>
                <path d="M30 -12 L48 -28 V10 L30 26 Z" fill="url(#${gs})"/>
                <!-- Крошка прессованного нечто: брикет обязан выглядеть
                     НЕаппетитно, это его роль в игре. -->
                ${speck.join('')}`;
            }
        }
    },

    // Полная рампа продукта: шесть ступеней от тёмного края до блика.
    // Кучкам нарезанного нужны те же ступени, что и целому продукту, —
    // иначе нарезанная морковь другого цвета, чем морковь.
    ramp(key) {
        const F = ktFood();
        return {
            pork: F.meat, rib: F.meat, potato: F.potato, carrot: F.carrot,
            tomato: F.tomato, berry: F.berry, herb: F.herb, pepper: F.pepper,
            block: F.block
        }[key] || F.potato;
    },

    // ---------- СИЛУЭТ ----------
    // Взятый продукт не исчезает с полки, а остаётся призраком: видно, что
    // именно взяли и что его можно вернуть.
    //
    // Раньше призрак делался подменой заливок на цвет полки плюс обводка
    // кромкой полки. Обводок у продуктов больше нет, и такая подмена дала бы
    // пятно цвета полки НА полке — то есть ничего. Теперь призрак — сплошной
    // силуэт цветом кромки полки: он темнее её и виден, а объёма у него нет,
    // и с настоящим продуктом его не спутать.
    ghost(key, seed) {
        const s = ktScene();
        const body = this.ingredientRaw(key, seed)
            .replace(/<defs>[\s\S]*?<\/defs>/g, '')
            .replace(/fill="(?!#000)[^"]*"/g, 'fill="' + s.inside.shelfEdge + '"')
            .replace(/stroke="[^"]*"/g, 'stroke="' + s.inside.shelfEdge + '"');
        return `<g opacity="0.34" transform="scale(${this.ITEM})">${body}</g>`;
    },

    // ---------- НАРЕЗАННОЕ ----------
    // Кучка из НЕСКОЛЬКИХ типов сразу: мясо красное, овощи жёлтые, зелень
    // зелёная — и по цвету видно, из чего блюдо.
    chopped(keys, stage, seed) {
        const ramps = keys.map(key => this.ramp(key));
        const grab = ktGrab(96, 54);
        if (stage <= 0) return '';
        const body = stage === 1
            ? grab + ktPile(4 + keys.length * 3, 16, ramps, seed, { spreadX: 78, spreadY: 26 })
            : grab + ktPile(10 + keys.length * 7, 9, ramps, seed + 7, { spreadX: 86, spreadY: 30 });
        return `<g transform="scale(${this.ITEM})">${body}</g>`;
    },

    // ---------- БУТЫЛЬ ----------
    // Рисует склад: бутыль — такой же предмет кухни, как кастрюля, и правится
    // там же, в мастерской.
    bottle(key, empty) {
        return KITCHEN_OBJECTS.liquidBottle.draw({ key, empty });
    },

    // ---------- КАРТИНКИ ДЛЯ ВИТРИНЫ МАГАЗИНА ----------
    // Товар в приложении рисуется ТЕМ ЖЕ рисунком, каким он живёт на кухне
    // (docs/traps.md, п. 83): иначе игрок покупает «какой-то значок», а не
    // нож, который лежит у него на столе.
    //
    // Отдельных спрайтов под витрину поэтому нет ни одного — предмет со
    // склада вставляется в свой же габарит как viewBox. Ровно та «одна
    // строка вместо пересчёта», ради которой склад и разбирали по предметам
    // (комментарий в начале kitchen-objects.js).
    shopTile(box, markup, pad) {
        const m = pad == null ? 12 : pad;
        return `<svg viewBox="${box.x - m} ${box.y - m} ${box.w + m * 2} ${box.h + m * 2}"
                     preserveAspectRatio="xMidYMid meet"
                     style="width:100%;height:100%;display:block">${markup}</svg>`;
    },

    // Утварь. Холодильник — ШКАФ ЦЕЛИКОМ, хотя он вдвое выше плитки: по
    // одной дверце он не опознаётся вовсе (пробовали — вышла белая створка
    // неизвестно от чего), а по двум дверям с ручками опознаётся сразу,
    // даже став узким.
    shopGearArt(key) {
        const O = KITCHEN_OBJECTS;
        if (key === 'knife') return this.shopTile(O.knife.box, O.knife.draw(), 16);
        if (key === 'pot')   return this.shopTile(O.pot.box, O.pot.draw(), 10);
        if (key === 'fridge') {
            return this.shopTile({ x: 0, y: 125, w: 305, h: 835 },
                O.fridgeBody.draw() + O.fridgeDoorTop.draw() + O.fridgeDoorBottom.draw()
                + O.fridgeHandleTop.draw() + O.fridgeHandleBottom.draw(), 20);
        }
        return '';
    },

    // Продукты и жидкости. Продукт нарисован вокруг своего нуля, бутыль —
    // тоже, поэтому габарит у витрины общий и симметричный.
    shopFoodArt(key, seed) {
        if (KITCHEN.liquids[key]) {
            const b = KITCHEN_OBJECTS.liquidBottle.box
                   || { x: -32, y: -60, w: 64, h: 120 };
            return this.shopTile(b, this.bottle(key), 8);
        }
        return this.shopTile({ x: -56, y: -62, w: 112, h: 118 },
                             this.ingredient(key, seed || 1), 6);
    },

    // Доска, поставленная на столешницу у мойки: маленькая, без интерактива.
    boardRest() {
        const b = ktScene().board;
        // Та же доска, что в переднем плане, только маленькая и в
        // перспективе столешницы: кучки нарезанного лежат НА НЕЙ, а не на
        // голой столешнице. Без доски они выглядели рассыпанными в мойку.
        return `<g>
            <path d="M-84 -4 L38 -38 L86 -8 L-36 28 Z" fill="${b.hi}"/>
            <path d="M-79 -2 L38 -33 L78 -9 L-33 24 Z" fill="none"
                  stroke="${b.line}" stroke-width="1.6" opacity="0.7"/>
            <path d="M-36 28 L86 -8 L86 2 L-36 38 Z" fill="${b.shadow}"/>
        </g>`;
    },

    // Кастрюля, которую держат над червём на кормёжке. Отдельный svg со своим
    // viewBox, потому что живёт в вёрстке (её наклоняют поворотом обёртки),
    // а не в сцене. Рисуется теми же рампами, что кастрюля на плите: одна и
    // та же вещь не может быть в кадре из двух разных наборов.
    potHeld(liquid) {
        const st = ktScene().steel;
        const soup = this.liquid(liquid || 'broth');
        const ramp = [[0, st[500]], [0.08, st[100]], [0.15, st[300]], [0.3, st.spec],
                      [0.46, st[300]], [0.66, st[500]], [1, st[700]]]
            .map(s => `<stop offset="${s[0]}" stop-color="${s[1]}"/>`).join('');
        return `<svg viewBox="0 0 200 224" preserveAspectRatio="xMidYMid meet"
                     style="width:100%;height:100%;display:block;overflow:visible">
            <defs>
                <linearGradient id="kt-held-body" gradientUnits="userSpaceOnUse"
                                x1="26" y1="0" x2="174" y2="0">${ramp}</linearGradient>
            </defs>
            <path d="M26 76 q-34 26 -6 62" fill="none" stroke="${st[900]}"
                  stroke-width="11" stroke-linecap="round"/>
            <path d="M174 76 q34 26 6 62" fill="none" stroke="${st[900]}"
                  stroke-width="11" stroke-linecap="round"/>
            <path d="M26 46 H174 V70 Q100 92 26 70 Z" fill="url(#kt-held-body)"/>
            <path d="M26 68 Q100 90 174 68 L162 190 Q100 212 38 190 Z"
                  fill="url(#kt-held-body)"/>
            <ellipse cx="100" cy="46" rx="74" ry="15" fill="${st[900]}"/>
            <ellipse cx="100" cy="48" rx="64" ry="12" fill="${soup[500]}"/>
            <ellipse cx="80" cy="46" rx="22" ry="5" fill="${soup.hi}" opacity="0.75"/>
        </svg>`;
    },
});
