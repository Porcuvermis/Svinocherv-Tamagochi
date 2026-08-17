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

    // ---- ГЕНЕРАЦИЯ ОДНОГО РАСТЕНИЯ ----
    // Возвращает плоский трейт-объект + предрасчитанный план листьев
    // (leaves[]), где на каждый лист уже определено: доля высоты стебля
    // t (0..1), сторона side, вариация угла и размера, лёгкий сдвиг
    // оттенка (лист "наследует" hue стебля + небольшое отклонение).
    generate() {
        const stemTypeKeys = Object.keys(this.STEM_TYPES);
        const stemType = stemTypeKeys[Math.floor(Math.random() * stemTypeKeys.length)];
        const arrangement = this.LEAF_ARRANGEMENTS[Math.floor(Math.random() * this.LEAF_ARRANGEMENTS.length)];
        const leafShape = this.LEAF_SHAPES[Math.floor(Math.random() * this.LEAF_SHAPES.length)];

        const hue = 30 + Math.floor(Math.random() * 250);          // 30-280: от жёлто-зелёного через зелёный, сине-зелёный, до сине-фиолетового — гораздо шире прежнего
        const satBase = 38 + Math.random() * 30;                    // 38-68% — разброс насыщенности, а не одна и та же "формула" для всех растений
        const lightBase = 26 + Math.random() * 14;                  // база яркости стебля у основания

        const leafCount = 4 + Math.floor(Math.random() * 8);        // 4-11 — больше вариативности количества, чем раньше (3-8)

        const plant = {
            // -- стебель --
            stemType,
            hue,
            satBase,
            lightBase,
            heightFrac: 0.5 + Math.random() * 0.5,                  // 0.5-1.0
            tilt: (Math.random() - 0.5) * 56,                       // -28..28° общий наклон (после вертикального "корневого" участка)
            curve: (Math.random() - 0.5) * 1.8,
            thickness: 0.5 + Math.random() * 1.9,                   // 0.5-2.4 — шире диапазон толщины
            wobblePhase: Math.random() * Math.PI * 2,

            // -- крепление к земле ("корень") --
            // rootFlare — во сколько раз шире у самой земли расширяется
            // основание стебля (создаёт эффект "уходит корнем в почву"
            // вместо резкого обрубленного низа). rootBumps — 2-4
            // небольших нерегулярных бугорка вокруг основания, чтобы
            // корневая часть не была идеальным овалом.
            rootFlare: 1.5 + Math.random() * 1.1,
            rootBumps: Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => ({
                angle: Math.random() * Math.PI * 2,
                dist: 0.35 + Math.random() * 0.55,
                r: 0.25 + Math.random() * 0.3
            })),

            // -- листья --
            leafShape,
            leafArrangement: arrangement,
            leafCount,
            leafSizeBase: 0.85 + Math.random() * 0.5,               // общий множитель размера листьев для этого растения
            leaves: [],                                             // заполняется ниже buildLeafPlan()

            // -- цветок / плод --
            flowerColor: this.FLOWER_COLORS[Math.floor(Math.random() * this.FLOWER_COLORS.length)],
            petalCount: 5 + Math.floor(Math.random() * 4),          // 5-8
            fruitIcon: this.FRUIT_ICONS[Math.floor(Math.random() * this.FRUIT_ICONS.length)]
        };

        plant.leaves = this.buildLeafPlan(leafCount, arrangement);
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
    buildLeafPlan(nLeaves, arrangement) {
        const tMin = 0.16, tMax = 0.90;
        const leaves = [];
        const self = this;

        function pushLeaf(t, side) {
            leaves.push({
                t: self.clamp01(t, tMin, tMax),
                side,
                angleVar: (Math.random() - 0.5) * 0.22,
                distScale: 0.9 + Math.random() * 0.28,
                sizeScale: 0.8 + Math.random() * 0.4,
                hueShift: (Math.random() - 0.5) * 14,
                popDelay: Math.random() * 0.03
            });
        }

        if (arrangement === 'opposite') {
            // Пары листьев на одной высоте, по разные стороны стебля
            const pairs = Math.max(1, Math.round(nLeaves / 2));
            for (let i = 0; i < pairs; i++) {
                const t = tMin + (tMax - tMin) * ((i + 0.5) / pairs);
                const jitter = (Math.random() - 0.5) * ((tMax - tMin) / pairs) * 0.3;
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
                    const side = k === 2 ? (Math.random() < 0.5 ? 1 : -1) : (k === 0 ? 1 : -1);
                    pushLeaf(t + (Math.random() - 0.5) * 0.015, side);
                }
            }
        } else {
            // 'alternate' — очередное листорасположение: сторона почти
            // всегда переключается, но не строго механически (~62%
            // шанс переключиться, иначе повторить — не длиннее 2 подряд)
            let side = Math.random() < 0.5 ? 1 : -1;
            let repeats = 0;
            for (let i = 0; i < nLeaves; i++) {
                const t = tMin + (tMax - tMin) * ((i + 0.5) / nLeaves);
                const jitter = (Math.random() - 0.5) * ((tMax - tMin) / nLeaves) * 0.4;
                pushLeaf(t + jitter, side);
                if (repeats >= 1 || Math.random() < 0.62) {
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
