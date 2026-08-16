// ================= МОДЕЛЬ ДАННЫХ СВИНОЧЕРВЯ (WORM MODEL) =================
// Хранит ТОЛЬКО данные о внешности персонажа — ни одна отрисовка сюда не
// попадает, за неё отвечает WormRenderer (src/core/worm-renderer.js).
//
// Модель — единый источник правды. Она сохраняется в localStorage и
// используется на главном экране и во всех мини-играх через один и тот же
// WormRenderer, чтобы игрок всегда видел СВОЕГО персонажа, а не заново
// нарисованную заглушку.

const WORM_MODEL_STORAGE_KEY = 'svinocherv_worm_model_v1';
const WORM_MODEL_VERSION = 1;

// ---------- ДЕФОЛТНЫЕ ЦВЕТА ПО ЗВЕНЬЯМ ЦЕПОЧКИ ----------
// Порядок: сегмент-1 (фикс.), сегмент-2 (фикс.), живот, растущий-1,
// растущий-2, хвост. Взято из текущего вида персонажа (было: hsl(340, 60-i*4%, 50-i*2%)).
const WORM_DEFAULT_CHAIN_STYLE = [
    { radius: 23, fill: 'hsl(340, 56%, 48%)', stroke: '#4a1220' }, // segment-1
    { radius: 21, fill: 'hsl(340, 52%, 46%)', stroke: '#4a1220' }, // segment-2
    { radius: 19, fill: 'hsl(340, 48%, 44%)', stroke: '#4a1220' }, // belly
    { radius: 17, fill: 'hsl(340, 44%, 42%)', stroke: '#4a1220' }, // growing-1
    { radius: 15, fill: 'hsl(340, 40%, 40%)', stroke: '#4a1220' }, // growing-2
    { radius: 13, fill: 'hsl(340, 36%, 38%)', stroke: '#4a1220' }  // tail
];

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
        offsetX: 15,
        offsetY: -10,
        stretchX: 1,
        stretchY: 1,
        scale: 1,
        visible: true,
        color: '#000000',
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
        scale: 1,
        // 0 = остриём вверх (стандарт). Прижатое ухо — отрицательный угол.
        rotation: 0,
        fill: '#ffb6c1',
        stroke: '#e07b8d',
        visible: true
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
                curve: 0.5,
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

        // Каждый шрам: { id, part, x, y (0..1 локальные координаты внутри
        // сегмента), rotation, seed, type }. part — один из: 'segment-1',
        // 'segment-2', 'belly', 'growing-N', 'tail'. Уши/глаза/пятачок — запрещены.
        scars: [],

        // Каждый аксессуар: { slot, itemId }. Слоты см. в архитектурном
        // документе проекта (claude/worm-model-architecture.md).
        accessories: []
    };
}

// ---------- ПЕРСИСТЕНЦИЯ ----------
function loadWormModel() {
    try {
        const raw = localStorage.getItem(WORM_MODEL_STORAGE_KEY);
        if (!raw) return createDefaultWormModel();
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== WORM_MODEL_VERSION) return createDefaultWormModel();
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
    loadWormModel,
    saveWormModel,
    mergeWormOverride
};
