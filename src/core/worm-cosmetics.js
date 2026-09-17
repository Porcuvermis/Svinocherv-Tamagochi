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
    art(itemId, r, skin, fit) {
        const pattern = this.ITEMS[itemId];
        if (!pattern) return null;
        return WormGarment.build(pattern, fit || { rx: r, ry: r }, skin);
    },

    // Полуширина предмета в долях радиуса части. По ней надетое прижимается
    // к телу при повороте. У ткани она не объявляется вовсе — выкройка сама
    // доходит до краёв части, и число берётся оттуда.
    halfWidth(itemId) {
        return WormGarment.halfWidth(this.ITEMS[itemId]);
    },

    // Посадка относительно поворота головы:
    //   face  — лежит на лице, едет вместе с чертами (очки);
    //   crown — надет на череп сверху, лишь слегка ведёт за лицом (цилиндр);
    //   axis  — на оси части, поворот головы его не касается (всё остальное).
    fit(itemId) {
        const p = this.ITEMS[itemId];
        return (p && p.seat) || 'axis';
    },

    ITEMS: {

        // ---------- ГОЛОВА ----------
        // Цилиндр не кроится по черепу: он НАДЕТ на него. Уровень полей
        // берётся от брови — цилиндр, надвинутый на глаза, читается не
        // нарядом, а тем, что персонаж прячется.
        'top-hat': {
            kind: 'rigid', seat: 'crown', halfW: 1.02,
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
            kind: 'rigid', seat: 'face', halfW: 0.72,
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

        // ---------- ШЕЯ ----------
        // Бабочка была розовой мошкой на шее и не читалась вовсе. Теперь это
        // ВОРОТНИК — светлая полоса во всю шею — и бабочка НА нём. Светлое
        // поле тут важнее самой бабочки: кожа у червя бывает почти чёрной, и
        // тёмная вещь на ней не видна ни в каком ракурсе.
        'bow-tie': {
            kind: 'cloth', cover: [-0.66, 0.34],
            base: g => g.C.linen[500],
            paint: g => `<path d="${g.band(0.0, 0.22)}" fill="${g.C.linen[300]}"/>`,
            over(g) {
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
            kind: 'rigid', seat: 'axis', halfW: 0.9, swing: 0.8,
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
        'tux': {
            kind: 'cloth', cover: [-0.74, 0.36], swing: 1,
            base: g => g.C.cloth[500],
            paint(g) {
                const C = g.C;
                // Манишка. Клин от плеч к пуговице: узнаваемая примета фрака
                // — не чёрное, а БЕЛОЕ.
                const shirt = g.d([[-0.58, 0.02], [0.58, 0.02], [0.24, 0.62], [0, 0.78], [-0.24, 0.62]]);
                // Лацканы — тёмная кайма по краю манишки. Не четвёртая
                // фигура: они лежат внутри её силуэта и только отделяют
                // белое от сукна.
                const lapel = (dir) => `<path d="${g.d([[dir * 0.58, 0.02], [dir * 0.94, 0.04],
                                                        [dir * 0.30, 0.74], [dir * 0.14, 0.60]])}"
                          fill="${C.cloth[900]}"/>`;
                return `${lapel(-1)}${lapel(1)}
                    <path d="${shirt}" fill="${C.linen[300]}" stroke="${g.ink}" stroke-width="${STROKE.hairline}"/>
                    <path d="${g.d([[-0.60, 0.0], [0.60, 0.0], [0.52, 0.14], [-0.52, 0.14]])}"
                          fill="${C.linen[500]}" stroke="${g.ink}" stroke-width="${STROKE.hairline}"/>`;
            },
            // Фалды. Выходят из-под подола и свисают ниже тела — по этому
            // хвосту фрак и отличают от пиджака. Кусок ОДИН, с вырезом
            // посередине: двумя отдельными клиньями это читалось штанинами.
            hang(g) {
                const C = g.C;
                const pts = [[-0.92, -0.04], [0.92, -0.04], [0.68, 0.70], [0.30, 0.84],
                             [0.10, 0.54], [-0.10, 0.54], [-0.30, 0.84], [-0.68, 0.70]];
                const d = 'M ' + pts.map(q => g.po(q[0], 1, q[1])).join(' L ') + ' Z';
                return `<path d="${d}" fill="${C.cloth[900]}" stroke="${g.ink}"
                          stroke-width="${STROKE.detail}" stroke-linejoin="round"/>`;
            },
            over(g) {
                const b = g.at(0, 0.84);
                return `<circle cx="${b.x.toFixed(2)}" cy="${b.y.toFixed(2)}"
                        r="${(Math.min(g.rx, g.ry) * 0.09).toFixed(2)}" fill="${g.C.gold[500]}"
                        stroke="${g.C.gold[700]}" stroke-width="${STROKE.hairline}"/>`;
            }
        },

        // Лента через тело — самый «конкурсный» предмет во всём гардеробе, и
        // потому самый тщеславный: она ничего не значит и надета затем, чтобы
        // её увидели. Оба конца стоят на u = ±1, то есть РОВНО на краю тела:
        // лента через плечо тем и лента, что уходит за бока.
        'sash': {
            kind: 'cloth', cover: [-0.80, 0.80],
            base: g => g.C.silk[500],
            // Через плечо, а не поперёк пояса: правый конец высоко, левый
            // низко. Уклон был в девять градусов и читался ремнём.
            cut: g => [[-1, 0.58], [1, 0.02], [1, 0.28], [-1, 0.84]],
            paint: g => `<path d="${g.d([[-1, 0.58], [1, 0.02], [1, 0.10], [-1, 0.66]])}"
                          fill="${g.C.silk[300]}" opacity="0.75"/>`,
            over(g) {
                // Медаль была в полрадиуса части и вылезала за тело шаром.
                const q = g.at(0.40, 0.30), r = Math.min(g.rx, g.ry) * 0.2;
                return `<circle cx="${q.x.toFixed(2)}" cy="${q.y.toFixed(2)}" r="${r.toFixed(2)}"
                          fill="${g.C.gold[500]}" stroke="${g.C.gold[700]}" stroke-width="${STROKE.detail}"/>
                    <circle cx="${q.x.toFixed(2)}" cy="${q.y.toFixed(2)}" r="${(r * 0.46).toFixed(2)}"
                          fill="${g.C.gold[300]}"/>`;
            }
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
            kind: 'rigid', seat: 'axis', halfW: 1.7, swing: 1.3,
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
