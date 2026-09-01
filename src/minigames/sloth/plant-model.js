// ================= МОДЕЛЬ РАСТЕНИЯ (ГРЕХ ЛЕНИ / САД) =================
// Аналог src/core/worm-model.js, но для растения в мини-игре сада:
// здесь описывается ТОЛЬКО структура и трейты — какие бывают стебли,
// какие бывают листья, как растение "крепится" к земле и как листья
// расставляются вдоль стебля так, чтобы не наезжать друг на друга.
// Сама отрисовка (перевод этой модели в пиксели конкретного canvas)
// живёт в sloth.js (PlantRenderer), как worm-renderer.js делает для
// worm-model.js. Модель НЕ знает о размерах canvas — все величины тут
// либо безразмерные (0..1 доли), либо углы/индексы.
const PlantModel = {

    // ---- ТИПЫ СТЕБЛЯ ----
    // Каждый тип задаёт форму кривой стебля: насколько сильно "тянет"
    // общий изгиб (curveMul) и есть ли у стебля волнообразный/ломаный
    // рисунок поверх основного изгиба (wobbleAmp/wobbleFreq). Стебель
    // ВСЕГДА начинается строго вертикально из земли (см. rootLen в
    // PlantRenderer.getStemGeometry) — это отдельно от типа, чтобы
    // растение всегда выглядело реально "растущим из горшка", а не
    // приклеенным под случайным углом.
    STEM_TYPES: {
        straight: { curveMul: 0.32, wobbleAmp: 0,    wobbleFreq: 0 },
        arching:  { curveMul: 1.30, wobbleAmp: 0,    wobbleFreq: 0 },
        zigzag:   { curveMul: 0.55, wobbleAmp: 0.55, wobbleFreq: 2.1 },
        spiral:   { curveMul: 0.70, wobbleAmp: 0.32, wobbleFreq: 1.15 }
    },

    LEAF_SHAPES: ['oval', 'pointed', 'heart', 'fern'],

    // ---- ТИПЫ ЛИСТОРАСПОЛОЖЕНИЯ ----
    // Определяют, КАК считаются точки крепления листьев к стеблю
    // (см. buildLeafPlan). Не только "через один" — так и получалась
    // жалоба "все листья с одной стороны".
    LEAF_ARRANGEMENTS: ['alternate', 'opposite', 'whorled'],

    FLOWER_COLORS: ['#ffd166', '#ef476f', '#f4a261', '#c04dbf', '#118ab2', '#ff8fab', '#8ac926'],
    FRUIT_ICONS: ['🍓', '🍅', '🍆', '🫐', '🍇', '🌶️'],

    clamp01(v, a, b) { return Math.max(a, Math.min(b, v)); },

    // ---- СЛУЧАЙНОСТЬ ИЗ СИДА ----
    // Растение живёт часами и лежит в сохранении. С Math.random() оно
    // выглядело бы ПО-НОВОМУ ПОСЛЕ КАЖДОЙ ПЕРЕЗАГРУЗКИ страницы: посадил
    // золотистое деревце, вернулся — стоит синий куст. Поэтому форма выводится
    // из сида, как отметины на теле (worm-marks.js) и наклейки зависти, а в
    // сейве лежит несколько байт вместо списка точек.
    //
    // Тот же генератор, что в kitchen-art.js: одинаковый сид — одинаковая
    // форма, на любом устройстве и в любой сборке.
    rng(seed) {
        let h = (seed >>> 0) ^ 0x9e3779b9;
        return function () {
            h = (h + 0x6D2B79F5) >>> 0;
            let t = h;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },

    // ---- ГЕНЕРАЦИЯ ОДНОГО РАСТЕНИЯ ----
    // Вид ЗАКРЕПЛЯЕТ (полоса оттенка, допустимые стебли, форма листа,
    // высота), сид ОТПУСКАЕТ (точный оттенок внутри полосы, кривизна, фаза
    // волны, расстановка листьев). Пять кустов картошки подряд будут все
    // приземистыми и тускло-зелёными — и ни один не повторит другой.
    //
    // Таблица видов лежит в src/config/garden.js: новый вид — запись в ней,
    // рендерер не трогается. Тот же приём, что у комнат (rooms.js).
    // Возвращает плоский трейт-объект + предрасчитанный план листьев
    // (leaves[]), где на каждый лист уже определено: доля высоты стебля
    // t (0..1), сторона side, вариация угла и размера, лёгкий сдвиг
    // оттенка (лист "наследует" hue стебля + небольшое отклонение).
    generate(species, seed) {
        // Без сида — случайный: старые вызовы generate() продолжают работать,
        // просто их растение не переживает перезагрузку.
        const rnd = this.rng(typeof seed === 'number' ? seed : Math.floor(Math.random() * 1e9));
        const spec = (typeof GARDEN !== 'undefined' && GARDEN.species[species]) || null;

        // Выбор из списка и число из полосы — две операции, которыми
        // описывается ВЕСЬ вид. Всё, что вид не задал, берётся из общих
        // диапазонов: так таблица видов остаётся короткой и читаемой, а новый
        // вид можно завести, указав два-три поля.
        const pick = (list, fallback) => {
            const src = (list && list.length) ? list : fallback;
            return src[Math.floor(rnd() * src.length)];
        };
        const band = (b, lo, hi) => {
            const a = b ? b[0] : lo, z = b ? b[1] : hi;
            return a + rnd() * (z - a);
        };

        const stemType = pick(spec && spec.stems, Object.keys(this.STEM_TYPES));
        const arrangement = pick(spec && spec.arrangements, this.LEAF_ARRANGEMENTS);
        const leafShape = pick(spec && spec.leaves, this.LEAF_SHAPES);

        // Оттенок: у вида — своя полоса, без вида — вся радуга, как раньше.
        const hue = Math.floor(band(spec && spec.hue, 30, 280));
        const satBase = band(spec && spec.sat, 38, 68);
        const lightBase = band(spec && spec.light, 26, 40);

        const leafCount = Math.round(band(spec && spec.leafCount, 4, 11));

        const plant = {
            // -- чем это выросло --
            // species — ключ ИНГРЕДИЕНТА КУХНИ: вырастил морковь, и в кладовую
            // ляжет ровно та морковь, которую потом тащишь на разделочную доску.
            species: species || null,
            seed: typeof seed === 'number' ? seed : null,

            // -- стебель --
            stemType,
            hue,
            satBase,
            lightBase,
            heightFrac: band(spec && spec.height, 0.5, 1.0),
            tilt: (rnd() - 0.5) * 56,                               // -28..28°
            curve: (rnd() - 0.5) * 1.8,
            thickness: band(spec && spec.thickness, 0.5, 2.4),
            wobblePhase: rnd() * Math.PI * 2,

            // -- крепление к земле ("корень") --
            // rootFlare — во сколько раз шире у самой земли расширяется
            // основание стебля (создаёт эффект "уходит корнем в почву"
            // вместо резкого обрубленного низа). rootBumps — 2-4
            // небольших нерегулярных бугорка вокруг основания, чтобы
            // корневая часть не была идеальным овалом.
            rootFlare: 1.5 + rnd() * 1.1,
            rootBumps: Array.from({ length: 2 + Math.floor(rnd() * 3) }, () => ({
                angle: rnd() * Math.PI * 2,
                dist: 0.35 + rnd() * 0.55,
                r: 0.25 + rnd() * 0.3
            })),

            // -- листья --
            leafShape,
            leafArrangement: arrangement,
            leafCount,
            leafSizeBase: band(spec && spec.leafSize, 0.85, 1.35),
            leaves: [],                                             // заполняется ниже buildLeafPlan()

            // -- цветок / плод --
            // Цвет цветка тоже принадлежит семейству: жёлтый у помидора,
            // белёсый у картошки. Радужный цветок на любом кусте стирал бы
            // всю работу, которую делают полосы оттенка.
            flowerColor: pick(spec && spec.flower, this.FLOWER_COLORS),
            petalCount: 5 + Math.floor(rnd() * 4),                  // 5-8
            // Иконка плода нужна только там, где вида нет: у грядки плод
            // рисует кухня своим же кодом, и второй картинки того же помидора
            // в игре быть не должно.
            fruitIcon: this.FRUIT_ICONS[Math.floor(rnd() * this.FRUIT_ICONS.length)]
        };

        plant.leaves = this.buildLeafPlan(leafCount, arrangement, rnd);
        return plant;
    },

    // ---- ПЛАН ЛИСТЬЕВ ----
    // Считает список точек крепления листьев вдоль стебля (в долях t
    // 0..1 от его длины) вместе с их индивидуальными вариациями. Задача:
    // 1) листья НИКОГДА не толпятся все на одной стороне —
    //    для 'alternate' сторона переключается почти всегда (только
    //    иногда, не чаще ~38% случаев, повторяется), а не жёстко строго
    //    через один (что визуально плохо читается при изгибе стебля);
    // 2) листья равномерно распределены по доступной длине стебля
    //    (tMin..tMax) с небольшим случайным дребезгом, амплитуда
    //    которого ограничена половиной шага между листьями — поэтому
    //    они гарантированно не наезжают друг на друга по высоте, сколько
    //    бы их ни было;
    // 3) при малом числе листьев (напр. 4) они всё равно разнесены на
    //    заметное расстояние и хорошо видны, а не сбиты в кучу у земли.
    buildLeafPlan(nLeaves, arrangement, rnd) {
        // rnd — тот же генератор из сида, что и у самого растения: план
        // листьев обязан воспроизводиться вместе с ним, иначе после
        // перезагрузки листья переедут на другие места.
        const rng = rnd || Math.random;
        const tMin = 0.16, tMax = 0.90;
        const leaves = [];
        const self = this;

        function pushLeaf(t, side) {
            leaves.push({
                t: self.clamp01(t, tMin, tMax),
                side,
                angleVar: (rng() - 0.5) * 0.22,
                distScale: 0.9 + rng() * 0.28,
                sizeScale: 0.8 + rng() * 0.4,
                hueShift: (rng() - 0.5) * 14,
                popDelay: rng() * 0.03
            });
        }

        if (arrangement === 'opposite') {
            // Пары листьев на одной высоте, по разные стороны стебля
            const pairs = Math.max(1, Math.round(nLeaves / 2));
            for (let i = 0; i < pairs; i++) {
                const t = tMin + (tMax - tMin) * ((i + 0.5) / pairs);
                const jitter = (rng() - 0.5) * ((tMax - tMin) / pairs) * 0.3;
                pushLeaf(t + jitter, 1);
                if (leaves.length < nLeaves) pushLeaf(t + jitter, -1);
            }
        } else if (arrangement === 'whorled') {
            // Мутовки: группы по 3 листа на одной высоте, равномерно по
            // кругу — здесь визуально упрощено до "лево / право / чуть
            // развёрнутый к зрителю" через angleVar, т.к. рисуем в 2D.
            const whorls = Math.max(1, Math.round(nLeaves / 3));
            for (let i = 0; i < whorls; i++) {
                const t = tMin + (tMax - tMin) * ((i + 0.5) / whorls);
                for (let k = 0; k < 3 && leaves.length < nLeaves; k++) {
                    const side = k === 2 ? (rng() < 0.5 ? 1 : -1) : (k === 0 ? 1 : -1);
                    pushLeaf(t + (rng() - 0.5) * 0.015, side);
                }
            }
        } else {
            // 'alternate' — очередное листорасположение: сторона почти
            // всегда переключается, но не строго механически (~62%
            // шанс переключиться, иначе повторить — не длиннее 2 подряд)
            let side = rng() < 0.5 ? 1 : -1;
            let repeats = 0;
            for (let i = 0; i < nLeaves; i++) {
                const t = tMin + (tMax - tMin) * ((i + 0.5) / nLeaves);
                const jitter = (rng() - 0.5) * ((tMax - tMin) / nLeaves) * 0.4;
                pushLeaf(t + jitter, side);
                if (repeats >= 1 || rng() < 0.62) {
                    side = -side;
                    repeats = 0;
                } else {
                    repeats++;
                }
            }
        }

        leaves.sort((a, b) => a.t - b.t);
        return leaves;
    }
};
