// ================= ГНЕВ: ФОНЫ ЭКРАНОВ =================
// До этого все пять экранов греха стояли на одной заливке — тёмно-красном
// градиенте, — и червь в лобби висел в пустоте: ни пола, ни тени контакта, ни
// намёка на то, ГДЕ он находится (art-direction.md, разд. 6). Экраны при этом
// не отличались друг от друга ничем, кроме содержимого: лавка, кузня и
// подземелье выглядели одним местом.
//
// Теперь у каждого режима своё МЕСТО, и это не украшение, а работа на
// читаемость: место объясняет, что здесь делают, без единого слова
// (инвариант 9).
//
//   лобби  — яма бойца: земляной пол, столб света, стойки со снаряжением
//   бой    — арена: песок, трибуна силуэтами, ограждение, факелы
//   лавка  — торговый ряд: дощатая стена, тёплый свет из угла, прилавок
//   качка  — кузня: горн с углями и наковальня силуэтом
//   забег  — подземелье: пять сводов вглубь и факелы у входа
//
// Два экрана из пяти — со СПИСКОМ, и это отдельное ограничение: за списком
// живёт не обстановка, а атмосфера. Разбор — в комментарии к glow() и в
// docs/traps.md, п. 86.
//
// ---------- ТРИ ОГРАНИЧЕНИЯ, ИЗ КОТОРЫХ ВСЁ ВЫВОДИТСЯ ----------
//
// 1. ЧЕРВЬ ГЛАВНЫЙ. Тело залито flesh[500] = #a75863. Пол обязан быть
//    заметно СВЕТЛЕЕ, стены — темнее: тогда в кадре три уровня светлоты, а
//    боец сидит в среднем и держит силуэт (art-direction.md, §2.1, чек-лист
//    п. 2). Насыщенность фона приглушена: ярче червя на его экране не имеет
//    права быть ничто, кроме огня, а огонь дан точками (§2.5).
//
// 2. ФОН НЕ СТОИТ НИ ОДНОГО КАДРА. Это статический SVG, который собирается
//    один раз при переключении экрана и дальше не трогается: ни анимаций, ни
//    фильтров, ни масок. Бесконечная css-анимация внутри общего svg уже
//    красила тут всю сцену каждый кадр (docs/traps.md, пп. 36–38), а фильтр
//    на живом слое стоит отдельного буфера (п. 73). Мерцание факелов поэтому
//    нарисовано зaревом, а не анимировано.
//
// 3. ФОН НЕ ЛОВИТ ПАЛЬЦЫ. pointer-events: none на всём слое: под ним лежат
//    кнопки и зоны ударов, и перехваченный тап — это сломанная мини-игра.
//
// Цвета — PALETTE.wrathScene, толщины — STROKE. Хардкода hex здесь нет
// (docs/art-direction.md).

const WrathBackdrop = {

    W: 390,
    H: 800,

    // ---------- СБОРКА ----------
    // Вернуть разметку фона для экрана. Неизвестный экран — пустая строка, а
    // не заглушка: бой без фона выглядит хуже, чем бой с чужим фоном, но
    // молчание честнее подмены.
    svg(screen) {
        const draw = this[screen];
        if (typeof draw !== 'function') return '';
        return `<svg class="wrath-backdrop-svg" viewBox="0 0 ${this.W} ${this.H}"
                     preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                    ${draw.call(this, screen)}
                    ${this.vignette(screen)}
                </svg>`;
    },

    // ---------- ОБЩИЕ ЧАСТИ ----------

    // Виньетка. Затемняет края и собирает взгляд в центр — в тот самый
    // средний уровень светлоты, где стоит червь. Радиальный градиент, а не
    // фильтр: фильтр здесь стоил бы буфера на весь экран.
    vignette(id) {
        const ink = PALETTE.ink;
        return `
            <defs>
                <radialGradient id="wb-vig-${id}" cx="50%" cy="46%" r="76%">
                    <stop offset="62%" stop-color="${ink}" stop-opacity="0"/>
                    <stop offset="100%" stop-color="${ink}" stop-opacity="0.58"/>
                </radialGradient>
            </defs>
            <rect x="0" y="0" width="${this.W}" height="${this.H}"
                  fill="url(#wb-vig-${id})"/>`;
    },

    // Пол. Светлее всего НЕ у дальнего края и не у ближнего, а там, где
    // стоит боец: на него падает пятно сверху, и к краям свет уходит. Ровная
    // заливка от тёмного к светлому здесь пробовалась первой — весь низ
    // экрана становился светлым пустым полем и перетягивал взгляд с червя.
    // Пятно смещено влево от центра: источник света в проекте один и идёт
    // сверху-слева (art-direction.md, разд. 3).
    ground(id, y, ramp) {
        const h = this.H - y;
        return `
            <defs>
                <linearGradient id="wb-gr-${id}" x1="0" y1="${y}" x2="0" y2="${this.H}"
                                gradientUnits="userSpaceOnUse">
                    <stop offset="0" stop-color="${ramp[700]}"/>
                    <stop offset="0.4" stop-color="${ramp[500]}"/>
                    <stop offset="1" stop-color="${ramp[700]}"/>
                </linearGradient>
                <radialGradient id="wb-spot-${id}" cx="44%" cy="14%" r="58%">
                    <stop offset="0" stop-color="${ramp[100] || ramp[300]}" stop-opacity="0.6"/>
                    <stop offset="1" stop-color="${ramp[100] || ramp[300]}" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <rect x="0" y="${y}" width="${this.W}" height="${h}" fill="url(#wb-gr-${id})"/>
            <rect x="0" y="${y}" width="${this.W}" height="${h}" fill="url(#wb-spot-${id})"/>
            <line x1="0" y1="${y}" x2="${this.W}" y2="${y}"
                  stroke="${PALETTE.ink}" stroke-width="${STROKE.structure}" opacity="0.7"/>`;
    },

    // Тень контакта. Без неё персонаж висит в воздухе — это отдельный пункт
    // чек-листа приёмки, и до сих пор в лобби он был провален.
    contact(cx, cy, rx) {
        return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${rx * 0.19}"
                         fill="${PALETTE.ink}" opacity="0.42"/>`;
    },

    // Факел. Один источник тепла на весь тёмный кадр, поэтому и зарево
    // рисуется явно: без него огонёк читается жёлтой точкой, а не светом.
    // Мерцания нет намеренно — см. ограничение 2 в шапке файла.
    torch(x, y, scale) {
        const F = PALETTE.wrathScene.fire;
        const W = PALETTE.wrathScene.wood;
        const s = scale || 1;
        const gid = `wb-tg-${Math.round(x)}-${Math.round(y)}`;
        return `
            <defs>
                <radialGradient id="${gid}" cx="50%" cy="50%" r="50%">
                    <stop offset="0" stop-color="${F[300]}" stop-opacity="0.5"/>
                    <stop offset="0.45" stop-color="${F[500]}" stop-opacity="0.18"/>
                    <stop offset="1" stop-color="${F[500]}" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <circle cx="${x}" cy="${y}" r="${70 * s}" fill="url(#${gid})"/>
            <g transform="translate(${x} ${y}) scale(${s})">
                <path d="M-4 4 L4 4 L3 30 L-3 30 Z" fill="${W[700]}"
                      stroke="${PALETTE.ink}" stroke-width="${STROKE.detail}"/>
                <path d="M0 -20 C 9 -8, 9 2, 0 7 C -9 2, -9 -8, 0 -20 Z"
                      fill="${F[500]}"/>
                <path d="M0 -13 C 5 -5, 5 1, 0 4 C -5 1, -5 -5, 0 -13 Z"
                      fill="${F[300]}"/>
                <path d="M0 -6 C 2 -2, 2 1, 0 2 C -2 1, -2 -2, 0 -6 Z"
                      fill="${F[100]}"/>
            </g>`;
    },

    // Столб света сверху. Яма открыта, свет падает сверху-слева — и это же
    // заполняет верх кадра, который иначе остаётся мёртвым тёмным полем.
    // Прозрачность держится низкой: это СВЕТ, а не акцентный цвет, и на
    // правило «акцент даётся малой площадью» он не покушается.
    //
    // Заливка РАДИАЛЬНАЯ, а не вертикальная, и центр её у источника — над
    // верхом кадра. Вертикальный градиент пробовался первым: свет гас книзу,
    // но по бокам обрывался ровно по краю полигона, и на тёмной стене
    // читались две чёткие линии — светом это быть перестаёт. Радиальный гасит
    // и вбок, поэтому боков не видно; верхняя кромка уходит за край кадра.
    shaft(id) {
        const F = PALETTE.wrathScene.fire;
        return `
            <defs>
                <radialGradient id="wb-sh-${id}" cx="158" cy="40" r="430"
                                gradientUnits="userSpaceOnUse">
                    <stop offset="0" stop-color="${F[100]}" stop-opacity="0.15"/>
                    <stop offset="0.55" stop-color="${F[100]}" stop-opacity="0.05"/>
                    <stop offset="1" stop-color="${F[100]}" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <path d="M52 -40 L264 -40 L362 ${this.H} L-34 ${this.H} Z"
                  fill="url(#wb-sh-${id})"/>`;
    },

    // Стена. Общая заготовка для ямы, лавки и кузни: вертикальная рампа,
    // темнее книзу — там, где она уходит за спину бойца.
    wall(id, y, ramp) {
        return `
            <defs>
                <linearGradient id="wb-wl-${id}" x1="0" y1="0" x2="0" y2="${y}"
                                gradientUnits="userSpaceOnUse">
                    <stop offset="0" stop-color="${ramp[500]}"/>
                    <stop offset="0.45" stop-color="${ramp[700]}"/>
                    <stop offset="1" stop-color="${ramp[900] || ramp[700]}"/>
                </linearGradient>
            </defs>
            <rect x="0" y="0" width="${this.W}" height="${y}" fill="url(#wb-wl-${id})"/>`;
    },

    // ---------- ЛОББИ: ЯМА БОЙЦА ----------
    // Место, где боец ждёт выхода: земляной пол, глухие стены, две стойки со
    // снаряжением по бокам. Стойки стоят РОВНО под колонками слотов, и это
    // не совпадение: рамка слота садится на стойку и начинает читаться как
    // крюк с вещью, а не как пустой квадрат в пустоте.
    // Горизонт стоит ровно под ногами червя, а не «где-нибудь пониже»: тень
    // контакта обязана лечь на стык, иначе боец висит над полом — ровно то,
    // что было до фона, только теперь это стало видно.
    LOBBY_HORIZON: 492,

    lobby() {
        const S = PALETTE.wrathScene;
        const horizon = this.LOBBY_HORIZON;
        return `
            ${this.wall('lobby', horizon, S.pit)}
            ${this.shaft('lobby')}
            ${this.rack(52, 236, horizon)}
            ${this.rack(338, 236, horizon)}
            ${this.ground('lobby', horizon, S.sand)}
            ${this.scuffs(horizon)}
            ${this.contact(195, horizon + 6, 88)}`;
    },

    // Стойка со снаряжением: два столба, вкопанных в пол, и перекладина.
    // Стойка со снаряжением: столб, вкопанный в пол, и оголовок. Узкая и
    // тёмная намеренно — она ФОН: широкая светлая стойка спорила с червём за
    // внимание и разрезала кадр надвое (art-direction.md, §1.2 о дозировке).
    rack(x, top, bottom) {
        const W = PALETTE.wrathScene.wood;
        return `
            <g opacity="0.92">
                <rect x="${x - 13}" y="${top}" width="26" height="${bottom - top + 6}"
                      fill="${W[700]}" stroke="${PALETTE.ink}"
                      stroke-width="${STROKE.structure}"/>
                <rect x="${x - 13}" y="${top}" width="8" height="${bottom - top + 6}"
                      fill="${W[500]}" opacity="0.7"/>
                <rect x="${x - 23}" y="${top - 11}" width="46" height="13" rx="3"
                      fill="${W[500]}" stroke="${PALETTE.ink}"
                      stroke-width="${STROKE.structure}"/>
                <ellipse cx="${x}" cy="${bottom + 5}" rx="26" ry="7"
                         fill="${PALETTE.ink}" opacity="0.4"/>
            </g>`;
    },

    // Следы на утоптанной земле. Дозировка: несколько коротких борозд, а не
    // текстура по всей площади — иначе пол начинает спорить с червём.
    scuffs(y) {
        const ink = PALETTE.ink;
        const marks = [
            [40, 36, 54], [120, 74, 38], [268, 52, 62],
            [330, 98, 44], [176, 126, 70], [62, 150, 58]
        ];
        return marks.map(([x, dy, len]) => `
            <path d="M${x} ${y + dy} q ${len / 2} ${-4} ${len} 1"
                  fill="none" stroke="${ink}" stroke-width="${STROKE.detail}"
                  stroke-linecap="round" opacity="0.2"/>`).join('');
    },

    // ---------- БОЙ: АРЕНА ----------
    // Тот же песок, что в яме, но вокруг — трибуна. Толпа дана силуэтами в
    // три ступени светлоты: одинаково чёрная толпа читается стеной, а не
    // людьми (тот же приём, что у ковровой дорожки тщеславия).
    //
    // Горизонт стоит ВЫШЕ ОБОИХ бойцов, а не между ними. Первый вариант
    // делил экран пополам, и верхний боец оказывался стоящим на стене, а не
    // на песке: раскладка боя диагональная — противник вверху-справа, игрок
    // внизу-слева, — и оба обязаны быть на одной плоскости. Глубину даёт не
    // линия горизонта, а размер и пятно света.
    duel() {
        const S = PALETTE.wrathScene;
        const horizon = 252;
        return `
            ${this.wall('duel', horizon, S.stone)}
            ${this.crowdRow(128, 26, S.crowd[900])}
            ${this.crowdRow(152, 30, S.crowd[700])}
            ${this.crowdRow(178, 34, S.crowd[500])}
            <rect x="0" y="${horizon - 46}" width="${this.W}" height="48"
                  fill="${S.stone[700]}" stroke="${PALETTE.ink}"
                  stroke-width="${STROKE.structure}"/>
            ${this.barrier(horizon - 46)}
            ${this.ground('duel', horizon, S.sand)}
            ${this.torch(30, 150, 0.95)}
            ${this.torch(360, 150, 0.95)}
            ${this.contact(238, 294, 62)}
            ${this.contact(150, 706, 92)}`;
    },

    // Ряд зрителей. Головы с просветами и общая полоса плеч под ними: без
    // плеч ряд читается грядкой камней. Ряды идут ВНАХЛЁСТ — между ними не
    // должно быть видно стены: три полосы с зазорами читались не толпой, а
    // ярусами кладки. Считается по формуле, чтобы ряд двигался одним числом.
    crowdRow(y, step, color) {
        const r = step * 0.3;
        let heads = '';
        for (let x = 0; x < this.W + step; x += step) {
            heads += `M${x - r} ${y} a ${r} ${r * 1.2} 0 0 1 ${r * 2} 0 Z `;
        }
        return `
            <rect x="0" y="${y - 1}" width="${this.W}" height="${step * 0.7}"
                  fill="${color}"/>
            <path d="${heads}" fill="${color}"/>`;
    },

    // Ограждение арены: частокол вертикальных прутьев по верху барьера.
    barrier(y) {
        const I = PALETTE.wrathScene.iron;
        let out = '';
        for (let x = 12; x < this.W; x += 26) {
            out += `<rect x="${x}" y="${y - 20}" width="4" height="22"
                          fill="${I[500]}" opacity="0.8"/>`;
        }
        return out;
    },

    // ---------- ЛАВКА: ТОРГОВЫЙ РЯД ----------
    // Дощатая стена, тёплый свет из угла и прилавок понизу. Обстановки нет
    // намеренно — разбор в комментарии к glow().
    shop() {
        const S = PALETTE.wrathScene;
        const counter = 648;
        return `
            ${this.wall('shop', counter, S.wood)}
            ${this.planks(counter)}
            ${this.nails(counter)}
            ${this.glow(40, 130, 300, 0.3, 'shop')}
            <rect x="0" y="${counter}" width="${this.W}" height="${this.H - counter}"
                  fill="${S.wood[700]}"/>
            <rect x="0" y="${counter}" width="${this.W}" height="16"
                  fill="${S.wood[300]}" stroke="${PALETTE.ink}"
                  stroke-width="${STROKE.structure}"/>`;
    },

    // Доски стены: только швы, без заливки каждой доски — сплошная полосатая
    // текстура на весь экран перебивает список поверх неё.
    planks(bottom) {
        const ink = PALETTE.ink;
        let out = '';
        for (let x = 30; x < this.W; x += 58) {
            out += `<line x1="${x}" y1="0" x2="${x}" y2="${bottom}"
                          stroke="${ink}" stroke-width="${STROKE.detail}" opacity="0.28"/>`;
        }
        return out;
    },

    // Тёплый свет в углу. Предмета нет вовсе — и это вывод, а не лень.
    //
    // Первая лавка была обставлена как настоящая: полог с фестонами, ряд
    // крюков под товар, ящики у прилавка, фонарь на цепи. На экране со
    // СПИСКОМ всё это оказалось шумом: крюки пришлись ровно на первую строку,
    // полог — на ряд вкладок, фонарь сел на вкладку и прочитался непонятной
    // трапецией, ящики ушли под подвал. Отсюда правило, стоившее переделки:
    // за списком живёт не обстановка, а АТМОСФЕРА — стена, свет и пол.
    // Предмет ставится только туда, где список его не накроет, а свет не
    // накрывает ничего: он под всем.
    glow(x, y, r, strength, id) {
        const F = PALETTE.wrathScene.fire;
        return `
            <defs>
                <radialGradient id="wb-glow-${id}" cx="50%" cy="50%" r="50%">
                    <stop offset="0" stop-color="${F[300]}" stop-opacity="${strength}"/>
                    <stop offset="0.5" stop-color="${F[500]}" stop-opacity="${strength * 0.35}"/>
                    <stop offset="1" stop-color="${F[500]}" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <circle cx="${x}" cy="${y}" r="${r}" fill="url(#wb-glow-${id})"/>`;
    },

    // Гвозди в досках. Единственная «деталь» стены лавки: точки высокой
    // плотности вместо текстуры по всей площади (art-direction.md, §2.5).
    nails(bottom) {
        const I = PALETTE.wrathScene.iron;
        let out = '';
        for (let x = 30; x < this.W; x += 58) {
            for (let y = 190; y < bottom; y += 178) {
                out += `<circle cx="${x}" cy="${y}" r="2.6" fill="${I[300]}" opacity="0.3"/>`;
            }
        }
        return out;
    },

    // ---------- ПРОКАЧКА: КУЗНЯ ----------
    // Единственное место в игре, где свет идёт СНИЗУ: из горна. Это не спор с
    // правилом «источник один, сверху-слева», а его частный случай — горн и
    // есть источник, и он в кадре виден. Дан малой площадью и высокой
    // плотностью, как и положено акценту (art-direction.md, §2.5).
    boost() {
        const S = PALETTE.wrathScene;
        const floor = 664;
        return `
            ${this.wall('boost', floor, S.stone)}
            ${this.forge(300, floor)}
            ${this.ground('boost', floor, S.sand)}
            ${this.anvil(92, floor)}`;
    },

    // Горн: арка топки с углями. Зарево отдельным градиентом — без него угли
    // читаются оранжевым пятном на стене, а не огнём в нише.
    //
    // Первый горн был вдвое больше и занимал треть экрана. Оранжевого на
    // кадре выходило далеко за те 8–10%, которые правило отводит акценту
    // (art-direction.md, §2.5), и смотреть на экране прокачки хотелось на
    // него, а не на ступени. Теперь он мал и наполовину уходит под подвал:
    // видно ровно столько, чтобы понять, где стоишь.
    forge(x, floor) {
        const S = PALETTE.wrathScene;
        const top = floor - 124;
        return `
            <defs>
                <radialGradient id="wb-forge" cx="50%" cy="70%" r="60%">
                    <stop offset="0" stop-color="${S.fire[300]}" stop-opacity="0.42"/>
                    <stop offset="0.5" stop-color="${S.fire[500]}" stop-opacity="0.15"/>
                    <stop offset="1" stop-color="${S.fire[500]}" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <circle cx="${x}" cy="${floor - 44}" r="150" fill="url(#wb-forge)"/>
            <path d="M${x - 48} ${floor} L${x - 48} ${top + 38}
                     a 48 48 0 0 1 96 0 L${x + 48} ${floor} Z"
                  fill="${S.stone[900]}" stroke="${PALETTE.ink}"
                  stroke-width="${STROKE.contour}"/>
            <path d="M${x - 34} ${floor} L${x - 34} ${top + 48}
                     a 34 34 0 0 1 68 0 L${x + 34} ${floor} Z"
                  fill="${S.fire[700]}"/>
            <ellipse cx="${x}" cy="${floor - 12}" rx="30" ry="13" fill="${S.fire[500]}"/>
            <ellipse cx="${x - 5}" cy="${floor - 15}" rx="16" ry="7" fill="${S.fire[300]}"/>
            <ellipse cx="${x - 8}" cy="${floor - 16}" rx="6" ry="3" fill="${S.fire[100]}"/>`;
    },

    // Наковальня. Узнаётся ровно силуэтом: рог с одной стороны, талия,
    // широкая пята. Стоит против зарева и потому ТЁМНАЯ: светлая железка
    // спорила с червём по светлоте и тянула взгляд в угол.
    anvil(x, floor) {
        const I = PALETTE.wrathScene.iron;
        const W = PALETTE.wrathScene.wood;
        const y = floor - 4;
        return `
            <g opacity="0.95">
                <path d="M${x - 24} ${y} l 7 -24 l 34 0 l 7 24 Z"
                      fill="${W[700]}" stroke="${PALETTE.ink}"
                      stroke-width="${STROKE.structure}"/>
                <path d="M${x - 31} ${y - 24} l 9 0 l 3 -11 l 40 0 l 3 11 l 9 0
                         l 0 -9 l -13 0 l -4 -10 l -29 0 l -4 10 l -13 0 Z"
                      fill="${I[900]}" stroke="${PALETTE.ink}"
                      stroke-width="${STROKE.structure}"/>
                <path d="M${x - 33} ${y - 43} l 66 0 l 19 -7 l -19 -6 l -66 0 Z"
                      fill="${I[700]}" stroke="${PALETTE.ink}"
                      stroke-width="${STROKE.structure}"/>
            </g>`;
    },

    // ---------- ЗАБЕГ: ПОДЗЕМЕЛЬЕ ----------
    // Своды, уходящие вглубь. Дорога забега лежит поверх них, и вместе это
    // читается как путь В ГЛУБИНУ: каждый следующий узел дальше предыдущего.
    // Уменьшающиеся арки — самый дешёвый способ показать глубину без единой
    // линии перспективы (art-direction.md, §4.3).
    rogue() {
        const S = PALETTE.wrathScene;
        const vpY = 300;
        // Дальняя арка САМАЯ ТЁМНАЯ и САМАЯ МЕЛКАЯ, ближняя — светлая и
        // тёплая: свет идёт от факелов у входа и до глубины не достаёт.
        // Ближайшая берёт цвет из земли, а не из камня: она освещена огнём, а
        // свет перенимает цвет источника (art-direction.md, §2.6).
        //
        // Все четыре ступени сперва были из одного холодного камня, и тоннель
        // тонул: поверх него лежит доска карты со своей заливкой, и разрыв
        // между соседними тонами она съедала целиком. Разрыв поэтому взят
        // крупный, а ступеней пять.
        const steps = [
            { w: 44, h: 60, c: S.stone[900] },
            { w: 90, h: 122, c: S.stone[700] },
            { w: 140, h: 190, c: S.stone[500] },
            { w: 194, h: 262, c: S.stone[300] },
            { w: 252, h: 340, c: S.sand[700] }
        ];
        let arches = '';
        // От ближней к дальней: ближняя рисуется первой и перекрывается
        // следующими. Обратный порядок рассыпает глубину — дальняя арка
        // оказывается поверх ближней.
        for (let i = steps.length - 1; i >= 0; i--) {
            const a = steps[i];
            arches += this.arch(195, vpY, a.w, a.h, a.c);
        }
        return `
            <rect x="0" y="0" width="${this.W}" height="${this.H}" fill="${S.stone[900]}"/>
            ${arches}
            ${this.masonry(vpY)}
            ${this.ground('rogue', 604, S.stone)}
            ${this.torch(38, 268, 1.15)}
            ${this.torch(352, 268, 1.15)}`;
    },

    // Одна арка свода: полукруг сверху и прямые стены вниз до пола.
    arch(cx, cy, w, h, color) {
        return `<path d="M${cx - w} ${this.H} L${cx - w} ${cy}
                         a ${w} ${h * 0.5} 0 0 1 ${w * 2} 0
                         L${cx + w} ${this.H} Z"
                      fill="${color}" stroke="${PALETTE.ink}"
                      stroke-width="${STROKE.detail}"/>`;
    },

    // Кладка ближней арки: швы между блоками, расходящиеся от свода. Только
    // на ближней — на дальних они слились бы в шум.
    masonry(cy) {
        const ink = PALETTE.ink;
        let out = '';
        for (let i = 0; i <= 8; i++) {
            const a = Math.PI + (Math.PI * i) / 8;
            const x1 = 195 + Math.cos(a) * 214;
            const y1 = cy + Math.sin(a) * 148;
            const x2 = 195 + Math.cos(a) * 256;
            const y2 = cy + Math.sin(a) * 178;
            out += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}"
                          x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
                          stroke="${ink}" stroke-width="${STROKE.detail}" opacity="0.45"/>`;
        }
        return out;
    }
};

if (typeof window !== 'undefined') {
    window.WrathBackdrop = WrathBackdrop;
}
