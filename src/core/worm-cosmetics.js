// ================= КОСМЕТИКА НА ТЕЛЕ: КАК ОНА НАРИСОВАНА =================
// Восемь предметов гардероба тщеславия. Каталог (что почём) — в
// src/config/pride-wardrobe.js, кроильный станок — в src/core/worm-garment.js,
// здесь только КАРТИНКА.
//
// ---------- ПОЧЕМУ В ЯДРЕ, А НЕ В МИНИ-ИГРЕ ----------
// Купленное носится ВЕЗДЕ — в комнате, на кухне, в ванной, в бою, — а не
// только на дорожке (docs/plan/17-pride.md, раздел 8). Значит рисовать это
// обязан рендерер персонажа, и лежать оно должно рядом с ним. Мини-игра
// тщеславия здесь только продавец.
//
// ---------- КАК ЧИТАТЬ ЭТОТ ФАЙЛ ----------
// Предмет — это ЗАПИСЬ, а не функция с путями. Ткань описывается охватом
// (докуда по части) и точками в координатах выкройки (u, v): u — поперёк
// тела, где ±1 РОВНО край части, v — вдоль охвата сверху вниз. Ни одного
// `rx * 0.46` здесь быть не должно: как только оно появляется, вещь снова
// начинает жить своей жизнью и промахиваться мимо тела.
//
// Исключение — род `rigid`: очки, цилиндр, банты. Они не кроятся по телу, а
// надеваются на опору (глаз, макушка, ось части), и выкройка им мешает.
const WormCosmetics = {

    // Что рисовать для предмета. Возвращает строку SVG в местных координатах
    // части; null — предмета нет, вешать нечего.
    art(itemId, r, skin, fit, sub, ref) {
        const pattern = this.ITEMS[itemId];
        if (!pattern) return null;
        // Витрина зовёт без fit и без части: там надо показать вещь целиком.
        // У многочастной для этого есть `card` — одна картинка на карточку.
        if (!sub && pattern.parts) {
            return pattern.card ? WormGarment.build(
                Object.assign({}, pattern, pattern.card, { parts: null }),
                fit || { rx: r, ry: r }, skin) : null;
        }
        return WormGarment.build(pattern, fit || { rx: r, ry: r }, skin, sub, ref);
    },

    // Многочастная ли вещь и какие у неё части.
    partsOf(itemId) {
        const p = this.ITEMS[itemId];
        return (p && p.parts) ? Object.keys(p.parts) : null;
    },

    // Полуширина предмета в долях радиуса части. По ней надетое прижимается
    // к телу при повороте. У ткани она не объявляется вовсе — выкройка сама
    // доходит до краёв части, и число берётся оттуда.
    halfWidth(itemId, sub) {
        const p = this.ITEMS[itemId];
        if (p && p.parts && sub) return WormGarment.halfWidth(Object.assign({}, p, p.parts[sub]));
        return WormGarment.halfWidth(p);
    },

    // ---------- ПОСАДКИ ЗДЕСЬ НЕТ ----------
    // Она объявлялась в предмете и была лишним решением у художника: любые
    // очки садятся на глаза, любая шляпа — на макушку, любая сигара — на рот.
    // Теперь посадку даёт ГНЕЗДО (`seat` в WormMarks.SLOTS), а предмету
    // остаётся только картинка.

    ITEMS: {

        // ---------- ГОЛОВА ----------
        // Цилиндр не кроится по черепу: он НАДЕТ на него. Уровень полей
        // берётся от брови — цилиндр, надвинутый на глаза, читается не
        // нарядом, а тем, что персонаж прячется.
        'top-hat': {
            kind: 'rigid', halfW: 1.02,
            draw(g) {
                const C = g.C, ry = g.ry, r = g.rx;
                const brimY = g.eye.y - g.eye.r * 1.7 - ry * 0.1;
                // Поля чуть шире черепа на этой высоте — проходят ПЕРЕД
                // ушами, а не сквозь них.
                const brim = r * 1.02, w = r * 0.6, h = ry * 1.0;
                return `<g transform="rotate(-6)">
                    <path d="M ${-w} ${brimY} L ${-w * 0.88} ${brimY - h} L ${w * 0.88} ${brimY - h} L ${w} ${brimY} Z"
                          fill="${C.cloth[700]}" stroke="${g.ink}" stroke-width="${STROKE.structure}"/>
                    <rect x="${-w * 0.97}" y="${brimY - h * 0.3}" width="${w * 1.94}" height="${h * 0.24}"
                          fill="${C.silk[500]}"/>
                    <path d="M ${-w * 0.78} ${brimY - h * 0.9} L ${-w * 0.2} ${brimY - h * 0.9}"
                          stroke="${C.cloth[500]}" stroke-width="${STROKE.detail}" fill="none" opacity="0.8"/>
                    <rect x="${-brim}" y="${brimY - ry * 0.08}" width="${brim * 2}" height="${ry * 0.15}"
                          rx="${ry * 0.07}"
                          fill="${C.cloth[900]}" stroke="${g.ink}" stroke-width="${STROKE.detail}"/>
                </g>`;
            }
        },

        // Очки — единственная вещь, которая читалась и до появления выкройки.
        // Причина ровно одна: её размер задан ЧЕРТОЙ лица, а не долей
        // радиуса, и она едет вместе с этой чертой. Выкройка делает то же
        // самое для ткани.
        'shades': {
            kind: 'rigid', halfW: 0.72,
            draw(g) {
                const C = g.C;
                const y = g.eye.y, eyeX = g.eye.x, eyeR = g.eye.r;
                const w = eyeR * 2.1, h = eyeR * 1.7;
                const lens = (cx) => `<rect x="${cx - w / 2}" y="${y - h / 2}" width="${w}" height="${h}"
                          rx="${h * 0.42}" fill="${C.lens[500]}" stroke="${C.gold[500]}"
                          stroke-width="${STROKE.structure}"/>
                    <path d="M ${cx - w * 0.34} ${y + h * 0.18} L ${cx + w * 0.1} ${y - h * 0.26}"
                          stroke="${C.gold[300]}" stroke-width="${STROKE.detail}" opacity="0.7" fill="none"/>`;
                return `<path d="M ${-eyeX} ${y} L ${eyeX} ${y}" stroke="${C.gold[500]}"
                          stroke-width="${eyeR * 0.24}" fill="none"/>
                    ${lens(-eyeX)}
                    ${lens(eyeX)}
                    <path d="M ${-(eyeX + w / 2)} ${y} L ${-(eyeX + w / 2 + eyeR * 0.5)} ${y + eyeR * 0.2}"
                          stroke="${C.gold[700]}" stroke-width="${eyeR * 0.22}" fill="none" stroke-linecap="round"/>
                    <path d="M ${eyeX + w / 2} ${y} L ${eyeX + w / 2 + eyeR * 0.5} ${y + eyeR * 0.2}"
                          stroke="${C.gold[700]}" stroke-width="${eyeR * 0.22}" fill="none" stroke-linecap="round"/>`;
            }
        },

        // Сигара во рту. Твёрдая вещь: сидит на морде и едет вместе с
        // ней — узел повторяет transform самой морды, своей формулы у него
        // нет (одно описание на всех, docs/traps.md, п. 103).
        // Сигара во рту. Рисуется в МЕСТНЫХ координатах РТА: уголки губ на
        // x = ±face.mouthHalf, начало — середина рта. Узел повторяет
        // transform самого рта, поэтому и сдвиг, и сужение при повороте
        // достаются даром и ровно те же, что у рта (docs/traps.md, п. 103).
        'cigar': {
            kind: 'rigid', halfW: 0.75,
            draw(g) {
                const C = g.C, W = WormSilhouette.face.mouthHalf;
                const x0 = W * 0.72, len = W * 1.5, th = W * 0.17;
                return `<g transform="translate(${x0.toFixed(2)},0) rotate(-12)">
                    <rect x="0" y="${(-th).toFixed(2)}" width="${len.toFixed(2)}" height="${(th * 2).toFixed(2)}"
                          rx="${th.toFixed(2)}" fill="${C.linen[500]}"
                          stroke="${g.ink}" stroke-width="${STROKE.detail}"/>
                    <rect x="${(len * 0.6).toFixed(2)}" y="${(-th).toFixed(2)}"
                          width="${(len * 0.2).toFixed(2)}" height="${(th * 2).toFixed(2)}"
                          fill="${C.gold[700]}"/>
                    <circle cx="${len.toFixed(2)}" cy="0" r="${(th * 1.1).toFixed(2)}"
                            fill="${C.glow[300]}" stroke="${g.ink}" stroke-width="${STROKE.hairline}"/>
                </g>`;
            }
        },

        // Серьга. Рисуется в МЕСТНЫХ координатах уха и вешается на оба:
        // узел повторяет transform своего уха, поэтому дальнее ухо само
        // сожмётся и уедет, а зеркало левой стороны ставит монтаж.
        // Якорь (наружный нижний угол уха) и масштаб — у силуэта: предмету
        // их знать неоткуда.
        'earrings': {
            kind: 'rigid', halfW: 0.4, swing: 1.6,
            draw(g) {
                const F = WormSilhouette.face;
                const r = F.earUnit * 0.13;
                return `<circle cx="${F.earJewelX}" cy="${F.earJewelY}" r="${(r * 0.42).toFixed(2)}"
                          fill="${g.C.gold[700]}"/>`;
            },
            // Подвеска качается на ходу — тем и отличается серьга от нашивки.
            hang(g) {
                const C = g.C, F = WormSilhouette.face;
                const r = F.earUnit * 0.13, x = F.earJewelX, y = F.earJewelY;
                return `<g transform="translate(${x},${y})">
                    <path d="M 0 0 L 0 ${(r * 1.5).toFixed(2)}" stroke="${C.gold[700]}"
                          stroke-width="${(r * 0.34).toFixed(2)}" fill="none"/>
                    <circle cx="0" cy="${(r * 2.3).toFixed(2)}" r="${r.toFixed(2)}"
                            fill="${C.gold[500]}" stroke="${g.ink}" stroke-width="${STROKE.hairline}"/>
                    <circle cx="${(-r * 0.3).toFixed(2)}" cy="${(r * 2).toFixed(2)}"
                            r="${(r * 0.3).toFixed(2)}" fill="${C.gold[300]}"/></g>`;
            }
        },

        // ---------- ШЕЯ ----------
        // Бабочка была розовой мошкой на шее и не читалась вовсе. Теперь это
        // ВОРОТНИК — светлая полоса во всю шею — и бабочка НА нём. Светлое
        // поле тут важнее самой бабочки: кожа у червя бывает почти чёрной, и
        // тёмная вещь на ней не видна ни в каком ракурсе.
        'bow-tie': {
            kind: 'cloth', cover: [-0.66, 0.34],
            base: g => g.C.linen[500],
            // Блик по верхней кромке нарисован НА ткани — едет с обшивкой.
            paint: g => `<path d="${g.band(0.0, 0.22)}" fill="${g.C.linen[300]}"/>`,
            // Бабочка лежит на груди: при развороте съезжает и сужается.
            faceHalf: 0.9,
            face(g) {
                const C = g.C;
                // Петли доходят до u = ±1, то есть уходят ЗА шею. Пока они
                // кончались внутри (0.9), их обведённый край шёл вертикальной
                // линией по краю воротника — и весь воротник читался
                // картонной коробкой. Бабочка шириной с шею её и обнимает.
                const wing = (dir) => `<path d="${g.d([[dir, 0.14], [dir * 0.16, 0.52], [dir, 0.94]])}"
                          fill="${C.silk[500]}" stroke="${g.ink}" stroke-width="${STROKE.detail}"
                          stroke-linejoin="round"/>`;
                const knot = g.at(0, 0.52);
                return `${wing(-1)}${wing(1)}
                    <ellipse cx="${knot.x.toFixed(2)}" cy="${knot.y.toFixed(2)}"
                             rx="${(g.hw(0.52) * 0.18).toFixed(2)}" ry="${(Math.abs(g.y(0.86) - g.y(0.2)) / 2).toFixed(2)}"
                             fill="${C.silk[700]}" stroke="${g.ink}" stroke-width="${STROKE.detail}"/>`;
            }
        },

        // Цепь — твёрдая вещь: она не кроится, а ЛЕЖИТ на шее и провисает.
        // Подвеска отдельным качающимся куском: тем и отличается наряд от
        // наклейки.
        'chain': {
            kind: 'rigid', halfW: 0.9, swing: 0.8,
            draw(g) {
                const C = g.C, unit = Math.min(g.rx, g.ry);
                // Концы подобраны так, чтобы КРАЙ звена был внутри шеи, а не
                // его центр: звено — круг, и на u = ±0.98 половина его висела
                // в воздухе.
                const end = 0.84;
                const a = g.at(-end, 0.16), b = g.at(end, 0.16), mid = g.at(0, 0.92);
                let links = '';
                for (let i = -3; i <= 3; i++) {
                    const t = i / 3;
                    const q = g.at(t * end, 0.16 + (1 - t * t) * 0.62);
                    links += `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${(unit * 0.13).toFixed(1)}"
                              fill="${C.gold[500]}" stroke="${C.gold[700]}" stroke-width="${STROKE.hairline}"/>`;
                }
                return `<path d="M ${a.x.toFixed(2)},${a.y.toFixed(2)} Q ${mid.x.toFixed(2)},${(mid.y * 1.18).toFixed(2)}
                              ${b.x.toFixed(2)},${b.y.toFixed(2)}"
                          fill="none" stroke="${C.gold[700]}" stroke-width="${unit * 0.11}" stroke-linecap="round"/>
                    ${links}`;
            },
            hang(g) {
                const C = g.C, unit = Math.min(g.rx, g.ry), q = g.at(0, 0.9);
                return `<circle cx="${q.x.toFixed(2)}" cy="${q.y.toFixed(2)}" r="${(unit * 0.2).toFixed(1)}"
                          fill="${C.gold[300]}" stroke="${C.gold[700]}" stroke-width="${STROKE.detail}"/>`;
            }
        },

        // ---------- ТЕЛО ----------
        // ФРАК. Форма не подобрана, а взята у самого сегмента: охват начат
        // выше середины живота, поэтому плечи получаются у́же подола сами —
        // это профиль эллипса, а не подогнанная трапеция.
        //
        // Три читаемые фигуры, больше на предмете размером с монету нельзя:
        //   1. тёмное сукно от края до края тела — силуэт пиджака;
        //   2. светлая манишка клином — единственное, по чему фрак узнают;
        //   3. фалды, выходящие из-под подола и качающиеся на ходу.
        // Нижняя треть живота остаётся голой: живот — вершина силуэта
        // (docs/art-direction.md §4.1).
        // ---------- ФРАК: ОДНА ВЕЩЬ, ДВЕ ПОЛОВИНЫ ----------
        // Верхняя одежда занимает ДВА соседних сегмента и рисуется верхом и
        // низом. Для игрока это одна вещь: сегменты перекрываются, половины
        // стоят вплотную, шва не видно. Раньше пиджак жил на одном животе, и
        // костюм читался разорванным — воротник на шее, пиджак на животе,
        // между ними голое тело.
        //
        // Ширины манишки заданы через g.uOf — в ОБЩИХ единицах вещи, а не в
        // долях своего сегмента. Иначе половины не сходятся по шву: сегменты
        // разной толщины, и одна и та же доля даёт разную ширину.
        'tux': {
            kind: 'cloth',
            parts: {
                // Верх: плечи, воротник, начало манишки.
                upper: {
                    cover: [-0.80, 0.78], swing: 0,
                    base: g => g.C.cloth[500],
                    faceHalf: 0.6,
                    face(g) {
                        const C = g.C;
                        const w0 = g.uOf(0.06, 0.30), w1 = g.uOf(1, 0.24);
                        const shirt = g.d([[-w0, 0.06], [w0, 0.06], [w1, 1], [-w1, 1]]);
                        const lapel = (dir) => `<path d="${g.d([[dir * w0, 0.06], [dir * 0.95, 0.10],
                                                               [dir * w1 * 1.7, 1], [dir * w1, 1]])}"
                                  fill="${C.cloth[900]}"/>`;
                        return `${lapel(-1)}${lapel(1)}
                            <path d="${shirt}" fill="${C.linen[300]}"
                                  stroke="${g.ink}" stroke-width="${STROKE.hairline}"/>
                            <path d="${g.d([[-g.uOf(0, 0.34), 0], [g.uOf(0, 0.34), 0],
                                            [g.uOf(0.16, 0.30), 0.16], [-g.uOf(0.16, 0.30), 0.16]])}"
                                  fill="${C.linen[500]}" stroke="${g.ink}"
                                  stroke-width="${STROKE.hairline}"/>`;
                    }
                },
                // Низ: продолжение манишки, пуговица, подол и фалды.
                lower: {
                    cover: [-0.92, 0.10], swing: 1,
                    base: g => g.C.cloth[500],
                    faceHalf: 0.55,
                    face(g) {
                        const C = g.C;
                        const w0 = g.uOf(0, 0.24);
                        const shirt = g.d([[-w0, 0], [w0, 0], [w0 * 0.5, 0.52], [0, 0.66],
                                           [-w0 * 0.5, 0.52]]);
                        const lapel = (dir) => `<path d="${g.d([[dir * w0, 0], [dir * w0 * 1.7, 0],
                                                               [dir * w0 * 0.7, 0.62], [dir * w0 * 0.4, 0.5]])}"
                                  fill="${C.cloth[900]}"/>`;
                        return `${lapel(-1)}${lapel(1)}
                            <path d="${shirt}" fill="${C.linen[300]}"
                                  stroke="${g.ink}" stroke-width="${STROKE.hairline}"/>`;
                    },
                    over(g) {
                        const b = g.at(0, 0.78);
                        return `<circle cx="${b.x.toFixed(2)}" cy="${b.y.toFixed(2)}"
                                r="${(Math.min(g.rx, g.ry) * 0.09).toFixed(2)}" fill="${g.C.gold[500]}"
                                stroke="${g.C.gold[700]}" stroke-width="${STROKE.hairline}"/>`;
                    },
                    // Фалды: по ним фрак и отличают от пиджака. Кусок ОДИН, с
                    // вырезом посередине — двумя клиньями это читалось
                    // штанинами. У́же подола, чтобы были видны бока живота.
                    hang(g) {
                        const pts = [[-0.70, -0.02], [0.70, -0.02], [0.60, 0.72], [0.28, 0.86],
                                     [0.10, 0.56], [-0.10, 0.56], [-0.28, 0.86], [-0.60, 0.72]];
                        const d = 'M ' + pts.map(q => g.po(q[0], 1, q[1])).join(' L ') + ' Z';
                        return `<path d="${d}" fill="${g.C.cloth[900]}" stroke="${g.ink}"
                                  stroke-width="${STROKE.detail}" stroke-linejoin="round"/>`;
                    }
                }
            }
        },

        // Лента через тело — самый «конкурсный» предмет во всём гардеробе, и
        // потому самый тщеславный: она ничего не значит и надета затем, чтобы
        // её увидели. Оба конца стоят на u = ±1, то есть РОВНО на краю тела:
        // лента через плечо тем и лента, что уходит за бока.
        // Лента — не верхняя одежда, а украшение поверх: она занимает одну
        // половину гнезда. Верхняя одежда (пиджаки, фраки, куртки) обязана
        // занимать обе — иначе костюм снова разорвётся.
        'sash': {
            kind: 'cloth', parts: { lower: {
            cover: [-0.80, 0.80],
            base: g => g.C.silk[500],
            // Через плечо, а не поперёк пояса: правый конец высоко, левый
            // низко. Уклон был в девять градусов и читался ремнём.
            cut: g => [[-1, 0.58], [1, 0.02], [1, 0.28], [-1, 0.84]],
            // Блик идёт вдоль самой ленты — это рисунок НА ткани.
            paint: g => `<path d="${g.d([[-1, 0.58], [1, 0.02], [1, 0.10], [-1, 0.66]])}"
                          fill="${g.C.silk[300]}" opacity="0.75"/>`,
            // Медаль лежит на груди.
            faceHalf: 0.5,
            over(g) {
                // Медаль была в полрадиуса части и вылезала за тело шаром.
                const q = g.at(0.40, 0.30), r = Math.min(g.rx, g.ry) * 0.2;
                return `<circle cx="${q.x.toFixed(2)}" cy="${q.y.toFixed(2)}" r="${r.toFixed(2)}"
                          fill="${g.C.gold[500]}" stroke="${g.C.gold[700]}" stroke-width="${STROKE.detail}"/>
                    <circle cx="${q.x.toFixed(2)}" cy="${q.y.toFixed(2)}" r="${(r * 0.46).toFixed(2)}"
                          fill="${g.C.gold[300]}"/>`;
            } } }
        },

        // ---------- ХВОСТ ----------
        // Гетра: ткань во всю ширину хвоста. Полоса у́же тела читалась
        // пластырем, а не одеждой.
        // Гетра кроится ВДОЛЬ хвоста (`along`): по толщине это было колечко
        // в палец шириной. Полосы идут ПОПЕРЁК него — то есть по постоянному
        // u, потому что у длинной части u бежит вдоль.
        'tail-sock': {
            kind: 'cloth', along: true, cover: [-0.90, 0.90],
            base: g => g.C.cloth[500],
            paint(g) {
                const stripe = (u0, u1, c) => `<path d="${g.d([[u0, 0], [u1, 0], [u1, 1], [u0, 1]])}"
                          fill="${c}"/>`;
                return stripe(-0.18, 0.12, g.C.gold[500])
                     + stripe(-0.98, -0.78, g.C.cloth[700])
                     + stripe(0.78, 0.98, g.C.cloth[700]);
            }
        },

        // Бант — твёрдая вещь: он СИДИТ на хвосте узлом, петли уходят вверх,
        // концы свисают и качаются.
        'tail-bow': {
            kind: 'rigid', halfW: 1.7, swing: 1.3,
            draw(g) {
                const C = g.C, w = g.rx * 1.7, h = g.ry * 1.15, up = -g.ry * 0.3;
                const loop = (dir) => `<path d="M 0 0 Q ${dir * w} ${-h} ${dir * w * 0.86} 0
                             Q ${dir * w} ${h} 0 0 Z"
                          fill="${C.silk[500]}" stroke="${g.ink}" stroke-width="${STROKE.structure}"/>`;
                return `<g transform="translate(0,${up.toFixed(1)})">${loop(-1)}${loop(1)}
                    <circle cx="0" cy="0" r="${Math.min(g.rx, g.ry) * 0.26}" fill="${C.silk[300]}"
                            stroke="${g.ink}" stroke-width="${STROKE.detail}"/></g>`;
            },
            hang(g) {
                const C = g.C, w = g.rx * 1.7, h = g.ry * 1.15, up = -g.ry * 0.3;
                return `<g transform="translate(0,${up.toFixed(1)})">
                    <path d="M ${-w * 0.24} ${h * 0.1} L ${-w * 0.44} ${h * 1.25}
                             L ${-w * 0.05} ${h * 0.86} Z" fill="${C.silk[700]}"/>
                    <path d="M ${w * 0.24} ${h * 0.1} L ${w * 0.44} ${h * 1.25}
                             L ${w * 0.05} ${h * 0.86} Z" fill="${C.silk[700]}"/></g>`;
            }
        }
    }
};

if (typeof window !== 'undefined') window.WormCosmetics = WormCosmetics;
