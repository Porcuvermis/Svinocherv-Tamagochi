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
    art(itemId, r, skin) {
        const fn = this.ITEMS[itemId];
        return fn ? fn(r, skin) : null;
    },

    ITEMS: {
        // ---------- ГОЛОВА ----------
        // Цилиндр сидит НА макушке, а не по центру головы: слот даёт точку
        // части, «сверху» знает только сам предмет.
        'top-hat'(r) {
            const C = PALETTE.redCarpet;
            const w = r * 0.92, h = r * 1.05, brim = r * 1.35, top = -r * 0.72;
            return `<g class="worm-cos" transform="rotate(-7)">
                <rect x="${-brim}" y="${top - 4}" width="${brim * 2}" height="${r * 0.17}" rx="${r * 0.08}"
                      fill="${C.cloth[900]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>
                <path d="M ${-w} ${top} L ${-w * 0.86} ${top - h} L ${w * 0.86} ${top - h} L ${w} ${top} Z"
                      fill="${C.cloth[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>
                <rect x="${-w * 0.95}" y="${top - h * 0.34}" width="${w * 1.9}" height="${h * 0.26}"
                      fill="${C.silk[500]}"/>
                <path d="M ${-w * 0.8} ${top - h * 0.94} L ${-w * 0.2} ${top - h * 0.94}"
                      stroke="${C.cloth[500]}" stroke-width="${STROKE.detail}" fill="none" opacity="0.8"/>
            </g>`;
        },

        // Очки лежат на глазах, то есть чуть выше центра головы и во всю её
        // ширину: узкие очки на морде такой ширины читаются царапиной.
        'shades'(r) {
            const C = PALETTE.redCarpet;
            const y = r * 0.03, w = r * 0.6, h = r * 0.5, gap = r * 0.14;
            const lens = (cx) => `<rect x="${cx - w / 2}" y="${y - h / 2}" width="${w}" height="${h}"
                      rx="${h * 0.42}" fill="${C.lens[500]}" stroke="${C.gold[500]}"
                      stroke-width="${STROKE.structure}"/>
                <path d="M ${cx - w * 0.34} ${y + h * 0.18} L ${cx + w * 0.1} ${y - h * 0.26}"
                      stroke="${C.gold[300]}" stroke-width="${STROKE.detail}" opacity="0.7" fill="none"/>`;
            return `<g class="worm-cos">
                ${lens(-(w / 2 + gap / 2))}
                ${lens(w / 2 + gap / 2)}
                <rect x="${-gap / 2}" y="${y - h * 0.12}" width="${gap}" height="${h * 0.22}"
                      fill="${C.gold[500]}"/>
                <rect x="${-(w + gap / 2 + r * 0.2)}" y="${y - h * 0.1}" width="${r * 0.22}" height="${h * 0.18}"
                      fill="${C.gold[700]}"/>
                <rect x="${w + gap / 2}" y="${y - h * 0.1}" width="${r * 0.22}" height="${h * 0.18}"
                      fill="${C.gold[700]}"/>
            </g>`;
        },

        // ---------- ШЕЯ ----------
        'bow-tie'(r) {
            const C = PALETTE.redCarpet;
            const w = r * 0.85, h = r * 0.6;
            return `<g class="worm-cos">
                <path d="M ${-w} ${-h} Q ${-w * 0.25} 0 ${-w} ${h} Q ${-w * 0.4} ${h * 0.3} ${-r * 0.16} 0
                         Q ${-w * 0.4} ${-h * 0.3} ${-w} ${-h} Z"
                      fill="${C.silk[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>
                <path d="M ${w} ${-h} Q ${w * 0.25} 0 ${w} ${h} Q ${w * 0.4} ${h * 0.3} ${r * 0.16} 0
                         Q ${w * 0.4} ${-h * 0.3} ${w} ${-h} Z"
                      fill="${C.silk[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>
                <rect x="${-r * 0.2}" y="${-h * 0.55}" width="${r * 0.4}" height="${h * 1.1}" rx="${r * 0.1}"
                      fill="${C.silk[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>
            </g>`;
        },

        // Цепь обнимает шею и провисает: ровная дуга поперёк тела читается
        // ошейником, а не золотом.
        'chain'(r) {
            const C = PALETTE.redCarpet;
            const w = r * 1.02, sag = r * 0.72;
            let links = '';
            for (let i = -3; i <= 3; i++) {
                const t = i / 3;
                links += `<circle cx="${(w * t).toFixed(1)}" cy="${(sag * (1 - t * t) * 0.72).toFixed(1)}"
                          r="${(r * 0.13).toFixed(1)}" fill="${C.gold[500]}"
                          stroke="${C.gold[700]}" stroke-width="${STROKE.hairline}"/>`;
            }
            return `<g class="worm-cos">
                <path d="M ${-w} 0 Q 0 ${sag * 1.25} ${w} 0"
                      fill="none" stroke="${C.gold[700]}" stroke-width="${r * 0.11}" stroke-linecap="round"/>
                ${links}
                <circle cx="0" cy="${(sag * 0.86).toFixed(1)}" r="${(r * 0.2).toFixed(1)}"
                        fill="${C.gold[300]}" stroke="${C.gold[700]}" stroke-width="${STROKE.detail}"/>
            </g>`;
        },

        // ---------- ТЕЛО ----------
        // Фрак — это два лацкана по бокам живота и полоска рубашки между
        // ними. Целиком одевать тело нельзя: под одеждой пропадёт весь живот,
        // а он — единственная вершина силуэта (docs/art-direction.md §4.1).
        'tux'(r) {
            const C = PALETTE.redCarpet;
            const w = r * 1.02, h = r * 0.98;
            const side = (dir) => `<path d="M ${dir * w * 0.16} ${-h}
                         L ${dir * w} ${-h * 0.72} L ${dir * w * 0.92} ${h * 0.86}
                         L ${dir * w * 0.3} ${h * 0.5} Z"
                      fill="${C.cloth[700]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>
                <path d="M ${dir * w * 0.16} ${-h} L ${dir * w * 0.62} ${-h * 0.66}
                         L ${dir * w * 0.34} ${h * 0.1} Z"
                      fill="${C.cloth[500]}" opacity="0.9"/>`;
            return `<g class="worm-cos">
                ${side(-1)}${side(1)}
                <path d="M ${-w * 0.18} ${-h * 0.96} L ${w * 0.18} ${-h * 0.96}
                         L ${w * 0.12} ${h * 0.2} L ${-w * 0.12} ${h * 0.2} Z"
                      fill="${C.night[500]}" opacity="0.55"/>
                <circle cx="0" cy="${h * 0.28}" r="${r * 0.09}" fill="${C.gold[500]}"/>
            </g>`;
        },

        // Лента через тело — самый «конкурсный» предмет во всём гардеробе, и
        // потому самый тщеславный: она ничего не значит и надета затем, чтобы
        // её увидели.
        'sash'(r, skin) {
            const C = PALETTE.redCarpet;
            const w = r * 1.55, band = r * 0.58;
            return `<g class="worm-cos" transform="rotate(-24)">
                <rect x="${-w}" y="${-band / 2}" width="${w * 2}" height="${band}"
                      fill="${C.silk[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>
                <rect x="${-w}" y="${-band / 2}" width="${w * 2}" height="${band * 0.22}"
                      fill="${C.silk[300]}" opacity="0.75"/>
                <circle cx="${w * 0.48}" cy="0" r="${band * 0.52}"
                        fill="${C.gold[500]}" stroke="${C.gold[700]}" stroke-width="${STROKE.detail}"/>
                <circle cx="${w * 0.48}" cy="0" r="${band * 0.24}" fill="${C.gold[300]}"/>
            </g>`;
        },

        // ---------- ХВОСТ ----------
        'tail-sock'(r) {
            const C = PALETTE.redCarpet;
            const w = r * 1.05, h = r * 1.15;
            return `<g class="worm-cos">
                <path d="M ${-w} ${-h * 0.5} Q 0 ${-h * 0.78} ${w} ${-h * 0.5}
                         L ${w * 0.82} ${h * 0.62} Q 0 ${h * 0.92} ${-w * 0.82} ${h * 0.62} Z"
                      fill="${C.cloth[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>
                <path d="M ${-w * 0.94} ${-h * 0.16} Q 0 ${-h * 0.44} ${w * 0.94} ${-h * 0.16}"
                      fill="none" stroke="${C.gold[500]}" stroke-width="${r * 0.16}"/>
            </g>`;
        },

        'tail-bow'(r) {
            const C = PALETTE.redCarpet;
            const w = r * 1.7, h = r * 1.25;
            const loop = (dir) => `<path d="M 0 0 Q ${dir * w} ${-h} ${dir * w * 0.86} 0
                         Q ${dir * w} ${h} 0 0 Z"
                      fill="${C.silk[500]}" stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}"/>`;
            return `<g class="worm-cos" transform="translate(0,${(-r * 1.05).toFixed(1)})">
                ${loop(-1)}${loop(1)}
                <path d="M ${-w * 0.24} ${h * 0.1} L ${-w * 0.44} ${h * 1.25}
                         L ${-w * 0.05} ${h * 0.86} Z" fill="${C.silk[700]}"/>
                <path d="M ${w * 0.24} ${h * 0.1} L ${w * 0.44} ${h * 1.25}
                         L ${w * 0.05} ${h * 0.86} Z" fill="${C.silk[700]}"/>
                <circle cx="0" cy="0" r="${r * 0.22}" fill="${C.silk[300]}"
                        stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>
            </g>`;
        }
    }
};

if (typeof window !== 'undefined') window.WormCosmetics = WormCosmetics;
