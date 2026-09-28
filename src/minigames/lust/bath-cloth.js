// ================= МОЧАЛКА: ЛЕСТНИЦА ВИДА =================
// Мочалка прокачивает время трения и таймер награды, и с каждой покупкой
// меняется сам ПРЕДМЕТ (docs/plan/21-lust-bath.md, разд. 5д): старая
// кухонная губка → новая → банная губка → пуф → морская губка → люфа →
// рукавица → губка конняку → волшебное облачко. Все вещи — в одном формате
// (овал или прямоугольник одного габарита): узкое и длинное выбивалось бы
// на полке и в руке.
//
// Одна вещь в трёх местах: на полке, в руке и на иконке магазина. Поэтому
// предмет рисуется в координатах СЦЕНЫ вокруг гнезда мочалки, как рисовалась
// запечённая губка: рука (BATH_ART.held) и иконка сдвигают его на гнездо
// сами и ничего не знают о ступенях. Гнездо и зона захвата не двигаются от
// ступени — меняется только картинка. Так же устроено мыло (bath-soap.js).
const BATH_CLOTH = {
    // Вид на каждой ступени. Ещё не нарисованные ступени берут запечённую
    // губку — пока лестница не закончена.
    TIERS: ['old', 'kitchen', 'brick', 'puff', 'sea', 'luffa', 'mitt', 'konjac', 'cloud'],
    uid: 0,

    level() {
        if (typeof GameState === 'undefined' || !GameState.upgradeLevel || typeof Backend === 'undefined') return 0;
        return GameState.upgradeLevel(Backend.upgradeKey('lust', 'cloth')) || 0;
    },
    tier(level) {
        const L = level == null ? this.level() : level;
        return Math.max(0, Math.min(this.TIERS.length - 1, L | 0));
    },

    // where === 'shelf' — предмет на полке: у него есть то, чего нет в руке
    // и на иконке (крошки старой губки на дне корзины).
    draw(level, where) {
        const kind = this.TIERS[this.tier(level)];
        if (kind === 'old') return this.old(where);
        return BATH_BAKED.draw('cloth');
    },

    // Габарит на сцене — по нему захват, упор в край экрана и иконка.
    box(level) {
        const kind = this.TIERS[this.tier(level)];
        if (kind === 'old') return { x: 527, y: 471, w: 89, h: 60 };
        return BATH_BAKED.box('cloth');
    },

    // Полка перерисовывается после покупки и после debug-панели.
    refresh() {
        const el = typeof document !== 'undefined' && document.getElementById('bt-cloth-art');
        if (el) el.innerHTML = this.draw(null, 'shelf');
    },

    // ---------- 0. СТАРАЯ КУХОННАЯ ГУБКА ----------
    // Та же губка, что на ступени 1 (поролон и зелёный абразив сверху), но
    // отслужившая: поролон выцвел и посерел, продавлен посередине (кусок
    // держали одним и тем же пальцем), абразив протёрт до поролона и оборван
    // с угла, поры забиты грязью, пара рваных дыр. На полке под ней крошки —
    // губка сыплется.
    // Вид — коробка в три четверти: лицо, верхняя грань и правый бок, свет
    // сверху-слева. Первая попытка давала глубину сдвинутой копией лица, как
    // у бруска мыла, — с продавленным верхом копия торчала «зубцами», и
    // губка читалась короной.
    old(where) {
        const P = btPal(), R = P.spongeOld, Sc = P.scourOld, ink = PALETTE.ink;
        const id = 'bcl' + (this.uid++);
        const A = BATH_ART.slots().cloth;
        const D = { x: 7, y: -10 };                 // глубина: верх уходит вверх-вправо
        const f = (x, y) => `${(x).toFixed(1)} ${(y).toFixed(1)}`;
        // Лицо: верх чуть провисает (продавлен), бока слегка выпирают.
        const sag = 3.5;
        const face = `M${f(-38, -4)}Q${f(0, -4 + 2 * sag)} ${f(38, -4)}`
            + `Q${f(40.5, 15)} ${f(38, 32)}Q${f(37, 37)} ${f(31, 37)}L${f(-31, 37)}Q${f(-37, 37)} ${f(-38, 32)}Q${f(-40.5, 15)} ${f(-38, -4)}Z`;
        // Верхняя грань: передняя кромка — верх лица, задняя — она же, сдвинутая.
        const top = `M${f(-38, -4)}Q${f(0, -4 + 2 * sag)} ${f(38, -4)}L${f(38 + D.x, -4 + D.y)}`
            + `Q${f(D.x, -4 + D.y + 2 * sag)} ${f(-38 + D.x, -4 + D.y)}Z`;
        // Правый бок: от правого края лица к нему же сдвинутому.
        const side = `M${f(38, -4)}L${f(38 + D.x, -4 + D.y)}Q${f(40.5 + D.x, 15 + D.y)} ${f(38 + D.x, 32 + D.y)}`
            + `Q${f(37.5 + D.x, 34 + D.y)} ${f(34, 36.2)}Q${f(37, 37)} ${f(38, 32)}Q${f(40.5, 15)} ${f(38, -4)}Z`;
        // Абразив: слой поверх верхней грани (та же форма, чуть приподнятая)
        // и полоска толщины на лице. Правый ближний угол оторван.
        const H = 6;                                   // толщина абразива
        const padTop = `M${f(-38, -4 - H)}Q${f(0, -4 - H + 2 * sag)} ${f(22, -4 - H + 1.2)}`
            + `L${f(25, -6 - H)}L${f(27.5, -3.5 - H)}L${f(31, -6.5 - H)}L${f(33, -4.5 - H)}L${f(38 + D.x, -4 + D.y - H)}`
            + `Q${f(D.x, -4 + D.y - H + 2 * sag)} ${f(-38 + D.x, -4 + D.y - H)}Z`;
        const padFace = `M${f(-38, -4 - H)}Q${f(0, -4 - H + 2 * sag)} ${f(22, -4 - H + 1.2)}`
            + `L${f(22, -4 + 1.2)}Q${f(0, -4 + 2 * sag)} ${f(-38, -4)}Z`;
        // Поры: мелкие тёмные точки со светлой кромкой снизу.
        const rnd = btRng(41);
        let pores = '', rims = '';
        for (let i = 0; i < 30; i++) {
            const x = -33 + rnd() * 66, y = 4 + rnd() * 29;
            const rx = 0.7 + rnd() * 1.3, ry = rx * (0.55 + rnd() * 0.3);
            pores += `M${(x - rx).toFixed(1)} ${y.toFixed(1)}a${rx.toFixed(2)} ${ry.toFixed(2)} 0 1 0 ${(2 * rx).toFixed(2)} 0a${rx.toFixed(2)} ${ry.toFixed(2)} 0 1 0 ${(-2 * rx).toFixed(2)} 0Z`;
            rims += `M${(x - rx * 0.8).toFixed(1)} ${(y + ry * 0.6).toFixed(1)}q${(rx * 0.8).toFixed(2)} ${(ry * 0.6).toFixed(2)} ${(rx * 1.6).toFixed(2)} 0`;
        }
        // Поры на боку — сплющены: грань уходит от нас.
        let sp = '';
        for (let i = 0; i < 7; i++) {
            const t = rnd(), x = 39.5 + D.x * (0.2 + rnd() * 0.6), y = 2 + t * 30 + D.y * 0.4;
            sp += `M${(x - 0.5).toFixed(1)} ${y.toFixed(1)}a0.5 0.9 0 1 0 1 0a0.5 0.9 0 1 0 -1 0Z`;
        }
        // Две рваные дыры — губку прокусило жёсткое.
        const holes = 'M-21 18q-2.8 -1.4 -4.2 1.2q-1 2.8 1.7 3.9q3 0.6 3.9 -1.6q0.6 -2.3 -1.4 -3.5Z'
            + 'M13 25q-3 -0.6 -3.6 2q-0.2 2.4 2.4 2.8q2.6 0 3 -2.2q0.2 -2 -1.8 -2.6Z';
        // Щетина абразива на верхней грани: короткие штрихи; в протёртой
        // середине их нет.
        const fz = btRng(9);
        let fuzz = '';
        for (let i = 0; i < 70; i++) {
            const u = fz(), v = fz();
            const x = -36 + u * 60 + v * D.x, y = -4 - H + v * D.y + (1 - Math.pow(2 * u - 1, 2)) * sag * 1.4;
            if (Math.abs(u - 0.45) < 0.12 && v > 0.2 && v < 0.8) continue;
            const a = -0.4 + fz() * 0.8;
            fuzz += `M${x.toFixed(1)} ${y.toFixed(1)}l${(Math.cos(a) * 1.6).toFixed(2)} ${(Math.sin(a) * 1.6).toFixed(2)}`;
        }
        // Протёртое пятно: сквозь абразив проступает поролон.
        // Край — рваный: абразив не стёрся ровным овалом, а вытерся клочьями.
        const wx = -9 + D.x * 0.35, wy = -4 - H + D.y * 0.35 + sag * 1.7;
        const worn = `M${f(wx, wy)}l2.2 -1.6l1.4 0.9l2.4 -1.8l1.8 1.1l2.6 -0.9l1.2 1.3l2.2 -0.2l-1 1.6l1.4 1.1`
            + `l-2.6 0.6l-1.2 1.2l-2.4 -0.5l-1.8 1l-2 -0.8l-2.2 0.7l-1.4 -1.2l-1.8 0.1l0.8 -1.4Z`;
        // Крошки на дне корзины: только на полке.
        let crumbs = '';
        if (where === 'shelf') {
            const cr = btRng(5), fy = BATH_SHELF.FLOORS[1] - A.y;
            for (let i = 0; i < 7; i++) {
                const x = -46 + cr() * 96, y = fy - 1.5 - cr() * 3, s = 1.1 + cr() * 1.6;
                crumbs += `<path d="M${(x - s).toFixed(1)} ${y.toFixed(1)}l${(s * 0.8).toFixed(1)} ${(-s * 1.1).toFixed(1)}l${(s * 1.3).toFixed(1)} ${(s * 0.3).toFixed(1)}l${(-s * 0.4).toFixed(1)} ${(s * 1).toFixed(1)}Z"
                    fill="${R[cr() < 0.5 ? 3 : 2]}" stroke="${ink}" stroke-width="0.8" stroke-linejoin="round"/>`;
            }
        }
        const W2 = 2 * STROKE.contour;
        return `
        <g class="bt-cloth bt-cloth-old" transform="translate(${A.x - 4} ${A.y - 1})">
            <defs>
                <linearGradient id="${id}-face" gradientUnits="userSpaceOnUse" x1="-36" y1="-2" x2="30" y2="40">
                    <stop offset="0" stop-color="${R[3]}"/>
                    <stop offset="0.55" stop-color="${R[2]}"/>
                    <stop offset="1" stop-color="${R[1]}"/>
                </linearGradient>
                <linearGradient id="${id}-pad" gradientUnits="userSpaceOnUse" x1="-36" y1="-18" x2="40" y2="-6">
                    <stop offset="0" stop-color="${Sc[4]}"/>
                    <stop offset="1" stop-color="${Sc[3]}"/>
                </linearGradient>
                <!-- Вмятина — тень прогиба посередине лица. -->
                <radialGradient id="${id}-dent" gradientUnits="userSpaceOnUse" cx="0" cy="6" r="20"
                                gradientTransform="translate(0 6) scale(1.4 0.6) translate(0 -6)">
                    <stop offset="0" stop-color="${R[0]}" stop-opacity="0.4"/>
                    <stop offset="1" stop-color="${R[0]}" stop-opacity="0"/>
                </radialGradient>
                <clipPath id="${id}-clip"><path d="${face}"/></clipPath>
            </defs>
            <!-- Контур всей коробки одним жирным обводом. -->
            <g fill="none" stroke="${ink}" stroke-width="${W2}" stroke-linejoin="round">
                <path d="${side}"/><path d="${top}"/><path d="${padTop}"/><path d="${padFace}"/><path d="${face}"/>
            </g>
            <!-- Бок и верх темнее лица: от света отвёрнуты. -->
            <path d="${side}" fill="${R[1]}"/>
            <path d="${sp}" fill="${P.spongeGrime}" fill-opacity="0.7"/>
            <path d="${top}" fill="${R[3]}"/>
            <path d="${face}" fill="url(#${id}-face)"/>
            <g clip-path="url(#${id}-clip)">
                <path d="${face}" fill="url(#${id}-dent)"/>
                <!-- Въевшаяся грязь: бурые разводы снизу, где губку сжимали. -->
                <path d="M-40 31Q-26 25 -12 31Q2 36 16 29Q28 25 42 31L42 40L-42 40Z" fill="${P.spongeGrime}" fill-opacity="0.35"/>
                <path d="${pores}" fill="${P.spongeGrime}" fill-opacity="0.85"/>
                <path d="${rims}" fill="none" stroke="${R[4]}" stroke-width="0.6" stroke-opacity="0.7" stroke-linecap="round"/>
                <path d="${holes}" fill="${R[0]}" stroke="${ink}" stroke-width="0.9"/>
            </g>
            <!-- Абразив: верх светлее полоски толщины на лице. -->
            <path d="${padFace}" fill="${Sc[2]}"/>
            <path d="${padTop}" fill="url(#${id}-pad)"/>
            <path d="${fuzz}" stroke="${P.scourFuzz}" stroke-width="0.9" stroke-opacity="0.75" stroke-linecap="round"/>
            <path d="${worn}" fill="${R[3]}" fill-opacity="0.8" stroke="${Sc[1]}" stroke-width="0.6" stroke-opacity="0.8" stroke-linejoin="round"/>
            <!-- Свет по передней кромке абразива (сверху-слева). -->
            <path d="M${f(-36.5, -4.6 - H)}Q${f(-14, -4 - H + 2 * sag * 0.8)} ${f(8, -4 - H + 2 * sag * 0.92)}" fill="none" stroke="${Sc[4]}" stroke-width="1.3" stroke-opacity="0.7" stroke-linecap="round"/>
            ${crumbs}
        </g>`;
    }
};

if (typeof window !== 'undefined') window.BATH_CLOTH = BATH_CLOTH;
