// ================= МОДЕЛЬ ДАННЫХ СВИНОЧЕРВЯ (WORM MODEL) =================
// Хранит ТОЛЬКО данные о внешности персонажа — ни одна отрисовка сюда не
// попадает, за неё отвечает WormRenderer (src/core/worm-renderer.js).
//
// Модель — единый источник правды. Она сохраняется в localStorage и
// используется на главном экране и во всех мини-играх через один и тот же
// WormRenderer, чтобы игрок всегда видел СВОЕГО персонажа, а не заново
// нарисованную заглушку.

const WORM_MODEL_STORAGE_KEY = 'svinocherv_worm_model_v1';
// Версия 2: сегмент-1, сегмент-2 и живот теперь ОДНОГО радиуса (были
// 23/21/19 — "три одинаковых в ряд" по просьбе, сужение начинается только
// ПОСЛЕ живота, на растущих сегментах).
// Версия 4: голова перестала быть кругом — добавлен блок `head.skull`
// (пропорции черепа), глаза переставлены под новую форму морды, у уха
// появился базовый разворот. Версия бампнута, чтобы сохранённые персонажи
// не остались со старой посадкой глаз на новой форме головы.
// Версия 3: добавлен блок `anatomy` — послойная анатомическая модель тела
// (скелет → мышцы → органы → кожа → покрытие кожи), см. ниже. Версия
// бампнута специально, чтобы у игроков, тестирующих через сохранённое в
// localStorage состояние, загрузился новый дефолт (loadWormModel сбрасывает
// на createDefaultWormModel(), если версия не совпадает) — иначе новый блок
// просто отсутствовал бы в старом сохранении.
const WORM_MODEL_VERSION = 4;

// ---------- ДЕФОЛТНЫЕ ЦВЕТА ПО ЗВЕНЬЯМ ЦЕПОЧКИ ----------
// Порядок: сегмент-1 (фикс.), сегмент-2 (фикс.), живот, растущий-1,
// растущий-2, хвост. Взято из текущего вида персонажа (было: hsl(340, 60-i*4%, 50-i*2%)).
// Сегмент-1/сегмент-2/живот — намеренно ОДИНАКОВОГО радиуса (23): это
// вертикальная "стойка" тела, сужение цепочки начинается только у растущих
// сегментов (и далее к хвосту), см. WORM_TAIL_BASE_RATIO в worm-renderer.js.
const WORM_DEFAULT_CHAIN_STYLE = [
    { radius: 23, fill: 'hsl(340, 56%, 48%)', stroke: '#4a1220' }, // segment-1
    { radius: 23, fill: 'hsl(340, 52%, 46%)', stroke: '#4a1220' }, // segment-2
    { radius: 23, fill: 'hsl(340, 48%, 44%)', stroke: '#4a1220' }, // belly
    { radius: 17, fill: 'hsl(340, 44%, 42%)', stroke: '#4a1220' }, // growing-1
    { radius: 15, fill: 'hsl(340, 40%, 40%)', stroke: '#4a1220' }, // growing-2
    { radius: 13, fill: 'hsl(340, 36%, 38%)', stroke: '#4a1220' }  // tail
];

// ---------- ДЕТЕРМИНИРОВАННЫЙ ГЕНЕРАТОР (для вариаций особи) ----------
// Тот же принцип, что уже используется в рендерере для шума на глазах/зубах:
// одинаковый сид — всегда одинаковый результат. Нужен здесь, чтобы
// "разный червяк = разная комбинация" (палитра органов, степень
// прозрачности кожи, пропорции) считалась ОДИН раз при создании модели и
// потом хранилась как обычные данные, а не пересчитывалась при каждом
// рендере.
function wormMulberry32(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function createDefaultBodySegment(styleIndex) {
    const style = WORM_DEFAULT_CHAIN_STYLE[styleIndex] || WORM_DEFAULT_CHAIN_STYLE[WORM_DEFAULT_CHAIN_STYLE.length - 1];
    return {
        radius: style.radius,
        stretchX: 1,
        stretchY: 1,
        scale: 1,
        fill: style.fill,
        stroke: style.stroke
    };
}

function createDefaultEye() {
    return {
        // offsetX хранится как положительное число, для левого глаза зеркалится в рендерере
        // Посадка под новую форму черепа: глаза свиньи мелкие, широко
        // расставленные и сидят высоко — над скулами, а не по центру лица.
        offsetX: 22,
        offsetY: -14,
        stretchX: 1,
        stretchY: 0.9,
        scale: 0.95,
        visible: true,
        color: '#2a1710',
        brow: { angle: 0, visible: true },
        // 0 = веко полностью поднято (не видно), 1 = глаз полностью закрыт
        eyelid: { level: 0 }
    };
}

function createDefaultEar() {
    return {
        shape: 'default',
        stretchX: 1,
        stretchY: 1,
        // Уши крупные: у свиньи они заметная часть силуэта головы. Базовый
        // разворот наружу задаёт рендерер (EAR_BASE_TILT), здесь — только
        // отклонение от него, чтобы "прижатые уши" оставались рабочим
        // состоянием мимики.
        scale: 0.95,
        // 0 = остриём вверх (стандарт). Прижатое ухо — отрицательный угол.
        rotation: 0,
        fill: '#ffb6c1',
        stroke: '#e07b8d',
        visible: true
    };
}

// ================= АНАТОМИЯ: ПОСЛОЙНАЯ МОДЕЛЬ ТЕЛА =================
// Персонаж — не плоский набор эллипсов с градиентом, а слоистый материал.
// Слои снизу вверх (каждый — самостоятельный "стейт", а не ещё один
// SVG-элемент):
//
//   1. skeleton — внутренний каркас. Буквально не рисуется, но задаёт форму:
//      индивидуальную вариацию пропорций каждого сегмента (где тело толще,
//      где тоньше) и сужение черепа к пятачку.
//   2. muscle — слой под кожей: продольные тяжи/бугры, дающие лёгкий рельеф
//      (не гладкий шарик). Слегка смещаются при дыхании/движении.
//   3. organs — НЕ абстрактные пятна, а несколько РАЗНЫХ по форме и
//      поведению структур: 'gut' (вытянутая кишка-трубка), 'sac' (компактный
//      орган-мешочек), 'node' (гроздь узелков), 'vessel' (спинной сосуд).
//      У каждого свой цвет, свой ритм пульсации и своя степень видимости.
//   4. skin — базовый слой. Неидеальный цвет: у каждого сегмента своя
//      вариация тона + крупные мягкие пятна неоднородности внутри сегмента.
//   5. coat — покрытие кожи: блеск слизи (чёткий блик, не размытое пятно),
//      матовые участки, кольцевые бороздки червя, свиные складки, щетина.
//      Локальная прозрачность задаётся здесь же — параметром skin.thinness:
//      где кожа плотнее, органов почти не видно, где тоньше — видно лучше.
//
// ВСЕ параметры этого блока — обычные данные модели, значит:
//   • их можно переопределить контекстным оверрайдом мини-игры
//     (handle.setOverride({ anatomy: { organs: { visibility: 0 } } })),
//   • "разный червяк — разная комбинация" делается сидом (см.
//     createVariedWormModel) без единой правки кода рендерера.
function createDefaultAnatomy() {
    return {
        // Общий рубильник. false — рендерер рисует персонажа как раньше
        // (базовая заливка + блик), без анатомических слоёв. Полезно и как
        // аварийный откат, и как режим экономии для слабых устройств.
        enabled: true,

        // Сид индивидуальной вариации ЭТОЙ особи. Влияет на расположение
        // мышечных тяжей, органов, пятен кожи, складок и щетины. Не влияет
        // на структуру кода — только на детерминированный шум внутри неё.
        seed: 20260817,

        // ---------- 1. СКЕЛЕТ / ВНУТРЕННИЙ КАРКАС ----------
        skeleton: {
            // Доля (±), на которую пропорции конкретного сегмента могут
            // отличаться от номинальных — "где тело толще, где тоньше".
            // Держится маленькой намеренно: цепочка сегментов рассчитана на
            // перекрытие соседей (см. floorLinkBaseLength в рендерере),
            // сильная вариация открыла бы зазоры между звеньями.
            variation: 0.05,
            // Насколько череп сужается к пятачку (свиной профиль вместо
            // ровного шара).
            headTaper: 0.14
        },

        // ---------- 2. МЫШЦЫ ----------
        muscle: {
            tone: 0.55,   // 0 = гладкий шарик, 1 = выраженный рельеф
            bundles: 3,   // сколько продольных тяжей на сегменте
            sway: 0.4     // насколько тяжи "играют" при дыхании/движении
        },

        // ---------- 3. ВНУТРЕННИЕ ОРГАНЫ ----------
        organs: {
            // Общая степень просвечивания органов (множитель к
            // skin.thinness конкретной зоны).
            visibility: 0.66,
            // Плотность набора: 1 = обычный набор, 0.5 = вдвое меньше
            // структур (режим экономии для слабых устройств).
            density: 1,
            // Биолюминесценция: насколько органы светятся изнутри (ореол +
            // яркое ядро). 0 = просто тёмные силуэты под кожей.
            glow: 0.7,

            // ---------- ЕДИНЫЙ КИШЕЧНЫЙ ТРАКТ ----------
            // Кишечник — не набор кусков по сегментам, а ОДНА неразрывная
            // труба вдоль всего тела: от головы вниз по шее, петлями в
            // животе, дальше к хвосту. Осевая линия берётся из той же
            // геометрии, что и силуэт, поэтому тракт всегда повторяет
            // текущий изгиб тела, дыхание и раздутие живота.
            tract: {
                visibility: 0.62,   // множитель к общей видимости органов
                width: 0.13,        // полутолщина трубы (доля радиуса тела)
                bellyWidth: 0.17,   // то же в животе — там кишечник толще
                wave: 0.26,         // амплитуда волны (доля радиуса тела)
                bellyWave: 0.44,    // амплитуда в животе — петли шире
                waveLength: 52,     // длина волны в px вне живота
                loopDensity: 2.8,   // во сколько раз витки чаще в животе
                speed: 0.32         // скорость перистальтики (волна ползёт вдоль тракта)
            },
            pulse: {
                speed: 0.85, // базовая частота (у каждого органа свой множитель)
                amp: 0.07    // амплитуда пульсации (доля размера)
            },
            palette: {
                gut: '#63212f',    // кишка — вытянутая трубка
                sac: '#6c7a33',    // орган-мешочек — компактный, болезненно-оливковый
                node: '#a8703f',   // гроздь узелков
                vessel: '#4a131e'  // спинной сосуд — тёмная линия под кожей
            }
        },

        // ---------- 4. КОЖА (БАЗОВЫЙ СЛОЙ) ----------
        skin: {
            // Сила неоднородности тона внутри одного сегмента (пятна светлее/
            // темнее основной заливки). 0 = плоская заливка как раньше.
            toneVariation: 0.55,
            // Спина темнее брюха — как у настоящего дождевого червя.
            dorsalDarkening: 0.3,
            ventralLightening: 0.1,
            // ЛОКАЛЬНАЯ прозрачность: где кожа плотнее (голова), органы почти
            // не видны; где тоньше (живот) — видно лучше. Ключ 'growing'
            // применяется ко всем растущим сегментам сразу.
            thinness: {
                'head': 0.1,
                'segment-1': 0.3,
                'segment-2': 0.62,
                'belly': 1,
                'growing': 0.7,
                'tail': 0.42
            },
            // Переход червь → свиная голова: насколько цвет сегмента-1 и
            // сегмента-2 подмешан к цвету головы (1 = полностью цвет головы,
            // 0 = чистый цвет тела). Именно это делает шею плавным переходом,
            // а не стыком двух разных существ.
            neckBlend: [0.45, 0.2]
        },

        // ---------- ЛИЦО: СОБСТВЕННАЯ ЖИЗНЬ ----------
        // Персонаж не застывшая маска: даже когда его никто не трогает, у
        // него подрагивают уши и он принюхивается. Любой из этих каналов
        // мини-игра может перехватить через setLivePose (earTilt,
        // snoutTwitch, gazeX/gazeY, browRaise, headTilt, cheekPuff, jawDrop);
        // пока канал не задан — работает собственная мимика.
        face: {
            idle: {
                earTwitch: 1,  // 0 = уши неподвижны
                sniff: 1       // 0 = не принюхивается
            }
        },

        // ---------- 5. ПОКРЫТИЕ КОЖИ (ПОВЕРХНОСТНЫЕ ДЕТАЛИ) ----------
        coat: {
            slimeGloss: 0.45,   // блеск слизи (чёткий блик по кривизне, не размытое пятно)
            matte: 0.35,        // матовые участки — контраст к блеску
            rings: 0.5,         // кольцевые бороздки сегментации (червь)
            dorsalVessel: 0.45, // тёмная линия спинного сосуда вдоль тела
            bristle: 0.45,      // короткая щетина (свиная часть: голова, шея)
            folds: 0.5,         // складки кожи (свиная часть)
            clitellum: 0.5      // поясок-"воротник" на сегменте-2 (червячная деталь,
                                // заодно визуально сшивает голову с телом)
        }
    };
}

function createDefaultWormModel() {
    return {
        version: WORM_MODEL_VERSION,

        // 0..10 — сколько раз к базовым 2 растущим сегментам добавлен ещё один.
        // Механика взросления (что именно двигает этот параметр) решается отдельно.
        growthStage: 0,

        head: {
            scale: 1,
            stretchX: 1,
            stretchY: 1,
            fill: '#ffb6c1',
            stroke: '#e07b8d',

            // ---------- ПРОПОРЦИИ ЧЕРЕПА ----------
            // Форма головы собирается кривыми по этим долям (от rx/ry), а не
            // захардкожена в рендерере: свиной череп спереди — широкий лоб,
            // самые широкие точки на скулах, сужение к челюсти и выступающая
            // вниз морда. Меняя эти числа, можно получить и поросячью
            // круглую голову, и вытянутую взрослую морду, не трогая код.
            skull: {
                browWidth: 0.52,   // ширина свода у макушки
                templeWidth: 0.99, // виски
                cheekWidth: 0.99,  // скулы — самое широкое место
                jawWidth: 0.76,    // челюсть
                muzzleWidth: 0.44, // ширина морды у пятачка
                chinDrop: 1.06,    // насколько морда выступает вниз (доля ry)
                relief: 0.16       // сила рельефа черепа (скулы, виски, брыли)
            },
            ears: {
                left: createDefaultEar(),
                right: createDefaultEar()
            },
            snout: {
                stretchX: 1,
                stretchY: 1,
                scale: 1,
                fill: '#ff8093',
                stroke: '#d6566b'
            },
            mouth: {
                stretchX: 1,
                stretchY: 1,
                scale: 1,
                // 0 = прямая линия, положительное = улыбка, отрицательное = грусть
                curve: 0.28,
                color: '#7a2233',
                // 0 = рот закрыт (видна только кривая линия), 1 = полностью
                // открыт (овал) — используется в контекстных оверрайдах,
                // например при кормлении.
                openness: 0
            }
        },

        eyes: {
            left: createDefaultEye(),
            right: createDefaultEye()
        },

        // Фиксированная часть цепочки: всегда ровно 2 сегмента между головой и животом.
        fixedSegments: [
            createDefaultBodySegment(0),
            createDefaultBodySegment(1)
        ],

        belly: createDefaultBodySegment(2),

        // Растущая часть: длина = 2 + growthStage. Синхронизация длины массива
        // с growthStage — задача будущей системы взросления, не этого модуля.
        growingSegments: [
            createDefaultBodySegment(3),
            createDefaultBodySegment(4)
        ],

        tail: {
            length: 1,
            thickness: 1,
            fill: WORM_DEFAULT_CHAIN_STYLE[5].fill,
            stroke: WORM_DEFAULT_CHAIN_STYLE[5].stroke
        },

        // Послойная анатомия тела (кожа/мышцы/органы/скелет) — см. выше.
        anatomy: createDefaultAnatomy(),

        // Каждый шрам: { id, part, x, y (0..1 локальные координаты внутри
        // сегмента), rotation, seed, type }. part — один из: 'segment-1',
        // 'segment-2', 'belly', 'growing-N', 'tail'. Уши/глаза/пятачок — запрещены.
        scars: [],

        // Каждый аксессуар: { slot, itemId }. Слоты см. в архитектурном
        // документе проекта (claude/worm-model-architecture.md).
        accessories: []
    };
}

// ---------- "РАЗНЫЙ ЧЕРВЯК — РАЗНАЯ КОМБИНАЦИЯ" ----------
// Детерминированная вариация ОДНОЙ И ТОЙ ЖЕ структуры модели: от сида
// меняются оттенок кожи, палитра органов, степень просвечивания, тонус
// мышц и выраженность поверхностных деталей. Структура кода при этом
// одинаковая — отличается только внешний вид конкретной особи.
//
// Нужна и для будущей генерации разных персонажей, и прямо сейчас — чтобы
// проверить, что весь визуал реально параметризуем, а не захардкожен.
function createVariedWormModel(seed) {
    const model = createDefaultWormModel();
    const rnd = wormMulberry32((seed >>> 0) || 1);

    // Базовый оттенок кожи особи: розово-мясной (330-355) или болотно-серый
    // (случайный сдвиг в холод) — но всегда в пределах "нездоровой" гаммы.
    const hue = 320 + Math.floor(rnd() * 45);         // 320..364
    const satBase = 38 + Math.floor(rnd() * 22);      // 38..59
    const lightBase = 40 + Math.floor(rnd() * 12);    // 40..51

    const chain = [model.fixedSegments[0], model.fixedSegments[1], model.belly,
                   model.growingSegments[0], model.growingSegments[1]];
    chain.forEach((seg, i) => {
        seg.fill = `hsl(${hue % 360}, ${satBase - i * 4}%, ${lightBase - i * 2}%)`;
    });
    model.tail.fill = `hsl(${hue % 360}, ${satBase - 20}%, ${lightBase - 10}%)`;
    model.head.fill = `hsl(${(hue + 6) % 360}, ${Math.min(70, satBase + 22)}%, ${lightBase + 24}%)`;
    model.head.snout.fill = `hsl(${(hue + 2) % 360}, ${Math.min(75, satBase + 28)}%, ${lightBase + 16}%)`;
    model.head.ears.left.fill = model.head.fill;
    model.head.ears.right.fill = model.head.fill;

    const a = model.anatomy;
    a.seed = (seed >>> 0) || 1;
    a.organs.visibility = 0.35 + rnd() * 0.4;                  // 0.35..0.75
    a.organs.palette.gut = `hsl(${340 + Math.floor(rnd() * 20)}, ${45 + Math.floor(rnd() * 20)}%, ${28 + Math.floor(rnd() * 12)}%)`;
    a.organs.palette.sac = `hsl(${60 + Math.floor(rnd() * 40)}, ${30 + Math.floor(rnd() * 25)}%, ${26 + Math.floor(rnd() * 12)}%)`;
    a.organs.palette.node = `hsl(${20 + Math.floor(rnd() * 25)}, ${40 + Math.floor(rnd() * 20)}%, ${32 + Math.floor(rnd() * 10)}%)`;
    a.organs.pulse.speed = 0.6 + rnd() * 0.6;
    a.organs.glow = 0.3 + rnd() * 0.55;
    a.organs.tract.wave = 0.22 + rnd() * 0.16;
    a.organs.tract.bellyWave = 0.42 + rnd() * 0.2;
    a.organs.tract.loopDensity = 2.6 + rnd() * 1.6;
    a.organs.tract.width = 0.13 + rnd() * 0.07;
    a.muscle.tone = 0.35 + rnd() * 0.5;
    a.muscle.bundles = 2 + Math.floor(rnd() * 3);              // 2..4
    a.skin.toneVariation = 0.35 + rnd() * 0.45;
    a.skin.dorsalDarkening = 0.2 + rnd() * 0.22;
    a.coat.slimeGloss = 0.35 + rnd() * 0.45;
    a.coat.rings = 0.3 + rnd() * 0.45;
    a.coat.bristle = rnd() * 0.7;
    a.coat.folds = 0.25 + rnd() * 0.5;
    a.coat.clitellum = rnd() < 0.75 ? 0.35 + rnd() * 0.4 : 0;  // поясок есть не у каждой особи
    a.skeleton.variation = 0.02 + rnd() * 0.05;

    return model;
}

// ---------- ПЕРСИСТЕНЦИЯ ----------
function loadWormModel() {
    try {
        const raw = localStorage.getItem(WORM_MODEL_STORAGE_KEY);
        if (!raw) return createDefaultWormModel();
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== WORM_MODEL_VERSION) return createDefaultWormModel();
        // Страховка от сохранений, сделанных до появления блока anatomy
        // (или с частично вырезанным блоком): недостающие ветки достраиваются
        // дефолтами, уже имеющиеся значения игрока сохраняются.
        parsed.anatomy = deepMergeWormObjects(createDefaultAnatomy(), parsed.anatomy || {});
        return parsed;
    } catch (err) {
        return createDefaultWormModel();
    }
}

function saveWormModel(model) {
    try {
        localStorage.setItem(WORM_MODEL_STORAGE_KEY, JSON.stringify(model));
    } catch (err) {
        // тихо игнорируем (приватный режим браузера / переполнение хранилища)
    }
}

// ---------- ОВЕРРАЙДЫ КОНТЕКСТА ----------
// Глубокое слияние: override поверх base. Массивы (scars/accessories и т.п.)
// заменяются целиком, если присутствуют в override, иначе берутся из base.
// base НИКОГДА не мутируется — возвращается новый объект.
function mergeWormOverride(base, override) {
    if (!override) return base;
    return deepMergeWormObjects(base, override);
}

function deepMergeWormObjects(base, patch) {
    if (Array.isArray(patch)) return patch.slice();
    if (patch === null || typeof patch !== 'object') return patch;

    const result = Array.isArray(base) ? base.slice() : Object.assign({}, base || {});
    Object.keys(patch).forEach(key => {
        const patchVal = patch[key];
        const baseVal = base ? base[key] : undefined;
        const patchIsObj = patchVal && typeof patchVal === 'object' && !Array.isArray(patchVal);
        const baseIsObj = baseVal && typeof baseVal === 'object' && !Array.isArray(baseVal);
        if (patchIsObj && baseIsObj) {
            result[key] = deepMergeWormObjects(baseVal, patchVal);
        } else {
            result[key] = Array.isArray(patchVal) ? patchVal.slice() : patchVal;
        }
    });
    return result;
}

window.WormModelAPI = {
    STORAGE_KEY: WORM_MODEL_STORAGE_KEY,
    VERSION: WORM_MODEL_VERSION,
    createDefaultWormModel,
    createDefaultAnatomy,
    createVariedWormModel,
    loadWormModel,
    saveWormModel,
    mergeWormOverride
};
