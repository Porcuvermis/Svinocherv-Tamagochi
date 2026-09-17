// ================= КОСМЕТИКА НА ТЕЛЕ: КАК ОНА НАРИСОВАНА =================
// Восемь предметов гардероба тщеславия. Каталог (что почём) — в
// src/config/pride-wardrobe.js, здесь только КАРТИНКА, ровно как у шрамов:
// src/core/worm-marks.js считает их геометрию, а рисует рендерер.
//
// ---------- ПОЧЕМУ В ЯДРЕ, А НЕ В МИНИ-ИГРЕ ----------
// Купленное носится ВЕЗДЕ — в комнате, на кухне, в ванной, в бою, — а не
// только на дорожке (docs/plan/17-pride.md, раздел 8). Значит рисовать это
// обязан рендерер персонажа, и лежать оно должно рядом с ним. Мини-игра
// тщеславия здесь только продавец.
//
// ---------- СИСТЕМА КООРДИНАТ ----------
// Предмет рисуется в МЕСТНЫХ координатах своей части тела: начало — центр
// части, единица — её радиус (он приезжает параметром r). Поэтому один и тот
// же цилиндр правильно сидит и на маленькой голове детёныша, и на взрослой:
// он не знает пикселей вовсе.
//
// Узел вешается внутрь того же слоя, что и шрамы (`worm-scar-layer`), а тот
// живёт ребёнком группы части. Отсюда бесплатно берётся всё остальное: тело
// шевелится — одежда шевелится вместе с ним, голова наклоняется — цилиндр
// наклоняется, и ни одной строчки в покадровой анимации.
const WormCosmetics = {

    // Что рисовать для предмета. Возвращает строку SVG в местных координатах
    // части; null — предмета нет, вешать нечего.
    // fit — настоящие габариты части: { rx, ry } и, для головы, опорные точки
    // лица (eyeY, eyeX, eyeR). Без них предмет кроится по кругу, а часть —
    // эллипс, и концы повисают в воздухе.
    art(itemId, r, skin, fit) {
        const fn = this.ITEMS[itemId];
        return fn ? fn(r, skin, fit || { rx: r, ry: r }) : null;
    },

    // Полуширина предмета в долях радиуса части. По ней надетое на лицо
    // прижимается к контуру при повороте — как дальний глаз.
    HALF_WIDTH: { 'shades': 0.72, 'top-hat': 1.02 },
    halfWidth(itemId) {
        return this.HALF_WIDTH[itemId] || 0;
    },

    // ---------- КРОЙ ПО ЭЛЛИПСУ ЧАСТИ ----------
    // Часть тела — эллипс rx×ry, а не круг. Одежда, скроенная по кругу,
    // концами повисает в воздухе: лента через тело выходила за силуэт на
    // треть длины. Две вспомогалки ниже дают точки НА краю части и предельную
    // длину полосы, у которой углы ещё внутри.
    edge(rx, ry, aDeg, k) {
        const a = aDeg * Math.PI / 180, kk = k == null ? 1 : k;
        return { x: rx * kk * Math.cos(a), y: ry * kk * Math.sin(a) };
    },

    // Дуга по краю части от угла a0 до a1 — точками, чтобы кромка одежды шла
    // ровно по телу, а не по хорде.
    edgeArc(rx, ry, a0, a1, k, steps) {
        const n = steps || 10;
        let d = '';
        for (let i = 0; i <= n; i++) {
            const p = this.edge(rx, ry, a0 + (a1 - a0) * i / n, k);
            d += ` L ${p.x.toFixed(2)},${p.y.toFixed(2)}`;
        }
        return d;
    },

    // Наибольшая полудлина полосы шириной 2*halfW, повёрнутой на aDeg, у
    // которой УГЛЫ ещё лежат внутри части. Считается перебором, а не
    // формулой: формула тут длиннее и легко врёт на краю.
    bandHalfLength(rx, ry, aDeg, halfW) {
        const a = aDeg * Math.PI / 180;
        const cos = Math.cos(a), sin = Math.sin(a);
        const inside = (L) => {
            for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
                const x = sx * L * cos - sy * halfW * sin;
                const y = sx * L * sin + sy * halfW * cos;
                if ((x / rx) * (x / rx) + (y / ry) * (y / ry) > 1) return false;
            }
            return true;
        };
        let lo = 0, hi = Math.max(rx, ry) * 2;
        for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; inside(m) ? lo = m : hi = m; }
        return lo;
    },

    // ---------- ПОСАДКА ----------
    // Как предмет относится к повороту головы. Не украшение записи: пока
    // посадки не было, всё надетое на голову висело статическим узлом — лицо
    // поворачивалось, а очки оставались мимо глаз и шляпа уезжала с черепа.
    //
    //   face  — лежит на лице, едет вместе с чертами (очки);
    //   crown — надет на череп сверху, лишь слегка ведёт за лицом (цилиндр);
    //   axis  — на оси части, поворот головы его не касается (всё остальное).
    FIT: {
        'top-hat': 'crown',
        'shades': 'face'
    },

    fit(itemId) {
        return this.FIT[itemId] || 'axis';
    },

    ITEMS: {
        // ---------- ГОЛОВА ----------
        // Цилиндр сидит НА макушке, а не по центру головы: слот даёт точку
        // части, «сверху» знает только сам предмет.
        'top-hat'(r, skin, fit) {
            const C = PALETTE.redCarpet;
            const ry = (fit && fit.ry) || r;
            // ---------- ГДЕ У ШЛЯПЫ НИЗ ----------
            // Поля лежат ВЫШЕ бровей, а не на них: цилиндр, надвинутый на
            // глаза, читается не нарядом, а тем, что персонаж прячется.
            // Бровь поднята примерно на 1.7 радиуса глаза над его центром,
            // отсюда и уровень полей.
            const eyeTop = ((fit && fit.eyeY) || -ry * 0.35) - ((fit && fit.eyeR) || r * 0.2) * 1.7;
            const brimY = eyeTop - ry * 0.1;
            // Поля были в 1.35 радиуса и резали уши пополам. Череп на этой
            // высоте всего 0.7 радиуса полушириной — поле чуть шире его и
            // проходит ПЕРЕД ушами, а не сквозь них.
            const brim = r * 1.02, w = r * 0.6, h = ry * 1.0;
            return `<g class="worm-cos" transform="rotate(-6)">
                <path d="M ${-w} ${brimY} L ${-w * 0.88} ${brimY - h} L ${w * 0.88} ${brimY - h} L ${w} ${brimY} Z"
                      fill="${C.cloth[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>
                <rect x="${-w * 0.97}" y="${brimY - h * 0.3}" width="${w * 1.94}" height="${h * 0.24}"
                      fill="${C.silk[500]}"/>
                <path d="M ${-w * 0.78} ${brimY - h * 0.9} L ${-w * 0.2} ${brimY - h * 0.9}"
                      stroke="${C.cloth[500]}" stroke-width="${STROKE.detail}" fill="none" opacity="0.8"/>
                <rect x="${-brim}" y="${brimY - ry * 0.08}" width="${brim * 2}" height="${ry * 0.15}"
                      rx="${ry * 0.07}"
                      fill="${C.cloth[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>
            </g>`;
        },

        // Очки лежат на глазах, то есть чуть выше центра головы и во всю её
        // ширину: узкие очки на морде такой ширины читаются царапиной.
        'shades'(r, skin, fit) {
            const C = PALETTE.redCarpet;
            // Очки садятся НА ГЛАЗА: их высота и разлёт берутся от самих глаз,
            // а не подбираются. Раньше линзы стояли на 0.03 радиуса ниже
            // центра головы — то есть на треть глаза ниже самих глаз.
            const y = (fit && fit.eyeY) || -r * 0.35;
            const eyeX = (fit && fit.eyeX) || r * 0.55;
            const eyeR = (fit && fit.eyeR) || r * 0.2;
            const w = eyeR * 2.1, h = eyeR * 1.7;
            const lens = (cx) => `<rect x="${cx - w / 2}" y="${y - h / 2}" width="${w}" height="${h}"
                      rx="${h * 0.42}" fill="${C.lens[500]}" stroke="${C.gold[500]}"
                      stroke-width="${STROKE.structure}"/>
                <path d="M ${cx - w * 0.34} ${y + h * 0.18} L ${cx + w * 0.1} ${y - h * 0.26}"
                      stroke="${C.gold[300]}" stroke-width="${STROKE.detail}" opacity="0.7" fill="none"/>`;
            return `<g class="worm-cos">
                <path d="M ${-eyeX} ${y} L ${eyeX} ${y}" stroke="${C.gold[500]}"
                      stroke-width="${eyeR * 0.24}" fill="none"/>
                ${lens(-eyeX)}
                ${lens(eyeX)}
                <path d="M ${-(eyeX + w / 2)} ${y} L ${-(eyeX + w / 2 + eyeR * 0.5)} ${y + eyeR * 0.2}"
                      stroke="${C.gold[700]}" stroke-width="${eyeR * 0.22}" fill="none" stroke-linecap="round"/>
                <path d="M ${eyeX + w / 2} ${y} L ${eyeX + w / 2 + eyeR * 0.5} ${y + eyeR * 0.2}"
                      stroke="${C.gold[700]}" stroke-width="${eyeR * 0.22}" fill="none" stroke-linecap="round"/>
            </g>`;
        },

        // ---------- ШЕЯ ----------
        'bow-tie'(r, skin, fit) {
            const C = PALETTE.redCarpet;
            const rx = (fit && fit.rx) || r, ry = (fit && fit.ry) || r;
            // Шея — самый узкий сегмент, и бабочка по кругу вылезала за него
            // краями петель. Кроим по настоящему эллипсу части.
            const w = rx * 0.82, h = ry * 0.52;
            return `<g class="worm-cos">
                <path d="M ${-w} ${-h} Q ${-w * 0.25} 0 ${-w} ${h} Q ${-w * 0.4} ${h * 0.3} ${-rx * 0.16} 0
                         Q ${-w * 0.4} ${-h * 0.3} ${-w} ${-h} Z"
                      fill="${C.silk[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>
                <path d="M ${w} ${-h} Q ${w * 0.25} 0 ${w} ${h} Q ${w * 0.4} ${h * 0.3} ${rx * 0.16} 0
                         Q ${w * 0.4} ${-h * 0.3} ${w} ${-h} Z"
                      fill="${C.silk[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>
                <rect x="${-rx * 0.2}" y="${-h * 0.55}" width="${rx * 0.4}" height="${h * 1.1}" rx="${rx * 0.1}"
                      fill="${C.silk[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>
            </g>`;
        },

        // Цепь обнимает шею и провисает: ровная дуга поперёк тела читается
        // ошейником, а не золотом.
        'chain'(r, skin, fit) {
            const C = PALETTE.redCarpet;
            const rx = (fit && fit.rx) || r, ry = (fit && fit.ry) || r;
            // Провис считается от ВЫСОТЫ сегмента, а не от радиуса: на
            // приплюснутом сегменте цепь по кругу уходила ниже тела.
            const w = rx * 0.9, sag = ry * 0.5;
            let links = '';
            for (let i = -3; i <= 3; i++) {
                const t = i / 3;
                links += `<circle cx="${(w * t).toFixed(1)}" cy="${(sag * (1 - t * t) * 0.72).toFixed(1)}"
                          r="${(Math.min(rx, ry) * 0.13).toFixed(1)}" fill="${C.gold[500]}"
                          stroke="${C.gold[700]}" stroke-width="${STROKE.hairline}"/>`;
            }
            return `<g class="worm-cos">
                <path d="M ${-w} 0 Q 0 ${sag * 1.9} ${w} 0"
                      fill="none" stroke="${C.gold[700]}" stroke-width="${Math.min(rx, ry) * 0.11}" stroke-linecap="round"/>
                ${links}
                <circle cx="0" cy="${(sag * 0.86).toFixed(1)}" r="${(Math.min(rx, ry) * 0.2).toFixed(1)}"
                        fill="${C.gold[300]}" stroke="${C.gold[700]}" stroke-width="${STROKE.detail}"/>
            </g>`;
        },

        // ---------- ТЕЛО ----------
        // Фрак — это два лацкана по бокам живота и полоска рубашки между
        // ними. Целиком одевать тело нельзя: под одеждой пропадёт весь живот,
        // а он — единственная вершина силуэта (docs/art-direction.md §4.1).
        'tux'(r, skin, fit) {
            const C = PALETTE.redCarpet;
            const rx = (fit && fit.rx) || r, ry = (fit && fit.ry) || r;
            const K = 0.94;                 // кромка идёт чуть внутри контура
            // ---------- ФРАК ОТКРЫТ, А НЕ ЗАСТЁГНУТ ----------
            // Лацканы лежат по КРАЯМ живота, середина остаётся голой. Первая
            // версия кроила их по кругу, и углы торчали за тело; вторая
            // затянула живот целиком чёрным — а живот единственная вершина
            // силуэта (docs/art-direction.md §4.1), закрывать его нельзя.
            const inner = rx * 0.44;
            const side = (dir) => {
                const a0 = dir > 0 ? -58 : 238, a1 = dir > 0 ? 58 : 122;
                const p0 = WormCosmetics.edge(rx, ry, a0, K);
                const p1 = WormCosmetics.edge(rx, ry, a1, K);
                return `<path d="M ${p0.x.toFixed(2)},${p0.y.toFixed(2)}`
                     + WormCosmetics.edgeArc(rx, ry, a0, a1, K, 10)
                     + ` L ${(dir * inner * 0.8).toFixed(2)},${(p1.y * 0.86).toFixed(2)}`
                     + ` L ${(dir * inner).toFixed(2)},${(-ry * 0.1).toFixed(2)}`
                     + ` L ${(dir * inner * 0.72).toFixed(2)},${(p0.y * 0.86).toFixed(2)} Z"
                      fill="${C.cloth[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>
                <path d="M ${(dir * inner * 0.72).toFixed(2)},${(p0.y * 0.86).toFixed(2)}
                         L ${(dir * rx * 0.78).toFixed(2)},${(-ry * 0.42).toFixed(2)}
                         L ${(dir * inner).toFixed(2)},${(-ry * 0.1).toFixed(2)} Z"
                      fill="${C.cloth[500]}" opacity="0.9"/>`;
            };
            return `<g class="worm-cos">
                ${side(-1)}${side(1)}
                <circle cx="${(-inner * 0.86).toFixed(2)}" cy="${(ry * 0.12).toFixed(2)}"
                        r="${(Math.min(rx, ry) * 0.08).toFixed(2)}" fill="${C.gold[500]}"/>
            </g>`;
        },

        // Лента через тело — самый «конкурсный» предмет во всём гардеробе, и
        // потому самый тщеславный: она ничего не значит и надета затем, чтобы
        // её увидели.
        'sash'(r, skin, fit) {
            const C = PALETTE.redCarpet;
            const rx = (fit && fit.rx) || r, ry = (fit && fit.ry) || r;
            const TILT = -24;
            const band = Math.min(rx, ry) * 0.46;
            // ---------- КОНЦЫ ЛЕНТЫ СРЕЗАНЫ ПО ТЕЛУ ----------
            // Прямоугольник, вписанный углами, получается вдвое короче тела и
            // читается нашивкой. Лента идёт во всю ширину, а её концы
            // обрезаны краем живота — как и положено ленте через плечо.
            const a = TILT * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
            // Для каждой из двух кромок ленты ищем, где она упирается в край.
            const reach = (sy) => {
                const oy = sy * band / 2;
                let lo = 0, hi = Math.max(rx, ry) * 2;
                for (let i = 0; i < 30; i++) {
                    const m = (lo + hi) / 2;
                    const x = m * cos - oy * sin, y = m * sin + oy * cos;
                    ((x / rx) * (x / rx) + (y / ry) * (y / ry) <= 0.94) ? lo = m : hi = m;
                }
                return lo;
            };
            const rTop = reach(-1), rBot = reach(1);
            const h = band / 2;
            const d = `M ${(-rTop).toFixed(2)},${(-h).toFixed(2)}`
                    + ` L ${rTop.toFixed(2)},${(-h).toFixed(2)}`
                    + ` L ${rBot.toFixed(2)},${h.toFixed(2)}`
                    + ` L ${(-rBot).toFixed(2)},${h.toFixed(2)} Z`;
            return `<g class="worm-cos" transform="rotate(${TILT})">
                <path d="${d}" fill="${C.silk[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>
                <path d="M ${(-rTop).toFixed(2)},${(-h).toFixed(2)} L ${rTop.toFixed(2)},${(-h).toFixed(2)}
                         L ${rTop.toFixed(2)},${(-h + band * 0.24).toFixed(2)}
                         L ${(-rTop).toFixed(2)},${(-h + band * 0.24).toFixed(2)} Z"
                      fill="${C.silk[300]}" opacity="0.75"/>
                <circle cx="${(rTop * 0.5).toFixed(2)}" cy="0" r="${(band * 0.5).toFixed(2)}"
                        fill="${C.gold[500]}" stroke="${C.gold[700]}" stroke-width="${STROKE.detail}"/>
                <circle cx="${(rTop * 0.5).toFixed(2)}" cy="0" r="${(band * 0.23).toFixed(2)}" fill="${C.gold[300]}"/>
            </g>`;
        },

        // ---------- ХВОСТ ----------
        'tail-sock'(r, skin, fit) {
            const C = PALETTE.redCarpet;
            const rx = (fit && fit.rx) || r, ry = (fit && fit.ry) || r;
            // Гетра была в один радиус и терялась на хвосте узкой полоской.
            const w = rx * 1.1, h = ry * 1.28;
            return `<g class="worm-cos">
                <path d="M ${-w} ${-h * 0.5} Q 0 ${-h * 0.78} ${w} ${-h * 0.5}
                         L ${w * 0.82} ${h * 0.62} Q 0 ${h * 0.92} ${-w * 0.82} ${h * 0.62} Z"
                      fill="${C.cloth[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>
                <path d="M ${-w * 0.94} ${-h * 0.16} Q 0 ${-h * 0.44} ${w * 0.94} ${-h * 0.16}"
                      fill="none" stroke="${C.gold[500]}" stroke-width="${Math.min(rx, ry) * 0.16}"/>
            </g>`;
        },

        'tail-bow'(r, skin, fit) {
            const C = PALETTE.redCarpet;
            const rx = (fit && fit.rx) || r, ry = (fit && fit.ry) || r;
            // Бант СИДИТ на хвосте, а не парит над ним: узел лежит на теле,
            // петли уходят вверх. Здесь был сдвиг на целый радиус вверх —
            // треть банта висела в воздухе.
            const w = rx * 1.7, h = ry * 1.15;
            const loop = (dir) => `<path d="M 0 0 Q ${dir * w} ${-h} ${dir * w * 0.86} 0
                         Q ${dir * w} ${h} 0 0 Z"
                      fill="${C.silk[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
            return `<g class="worm-cos" transform="translate(0,${(-ry * 0.3).toFixed(1)})">
                ${loop(-1)}${loop(1)}
                <path d="M ${-w * 0.24} ${h * 0.1} L ${-w * 0.44} ${h * 1.25}
                         L ${-w * 0.05} ${h * 0.86} Z" fill="${C.silk[700]}"/>
                <path d="M ${w * 0.24} ${h * 0.1} L ${w * 0.44} ${h * 1.25}
                         L ${w * 0.05} ${h * 0.86} Z" fill="${C.silk[700]}"/>
                <circle cx="0" cy="0" r="${Math.min(rx, ry) * 0.26}" fill="${C.silk[300]}"
                        stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>
            </g>`;
        }
    }
};

if (typeof window !== 'undefined') window.WormCosmetics = WormCosmetics;
