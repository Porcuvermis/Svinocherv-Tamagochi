// ================= ВИЗУАЛЬНЫЕ СУЩНОСТИ ЧЕРВЯ =================
// Таблица имён: «левая скула», «пятачок», «покров кожи». Ни строчки
// рисования — только ответ на вопрос «как эта штука называется и где она
// сейчас на экране».
//
// ---------- ЗАЧЕМ ----------
// В персонаже 655 узлов, и имя есть у 111. Ткнуть пальцем в голову и
// спросить дерево, что там, — значит получить `head-tilt`: техническую
// обёртку, которой в теле не существует. Из 27 значений `data-part` в живом
// дереве примерно десяток именно такие.
//
// Хуже того: САМЫХ НУЖНЫХ сущностей в дереве нет вовсе. «Скула» — не узел,
// а точка на кривой черепа (worm-silhouette.js, wormSkullHalf). Разметить
// её атрибутом нельзя: размечать нечего.
//
// Поэтому имена живут ЗДЕСЬ, снаружи, таблицей. Рендерер об этом файле не
// знает и знать не должен: убери его — ничего не изменится.
//
// ---------- ТРИ СОРТА, И ДРУГИХ НЕТ ----------
// Всё, во что можно ткнуть, — одно из трёх, и обращаться с ними надо
// по-разному. Это не классификация ради классификации: от сорта зависит,
// можно ли вещь ТАЩИТЬ мышкой.
//
//   node     — узел дерева: глаз, ухо, пятачок, сегмент, хвост. Есть
//              `data-part`, своя геометрия. Позиция выражена числами модели,
//              значит перетаскивание обратимо.
//   landmark — точка на кривой: скула, висок, лоб, брыло, подбородок. В
//              дереве её нет, считается формулой. Тащится ручкой по контуру.
//   layer    — процедурная масса: мышцы, кольца, щетина, органы, блик. Это
//              те самые 83% безымянных узлов, и они безымянны ПРАВИЛЬНО:
//              положение каждого — шум от сида. Тащить нечего, крутится
//              только целиком (плотность, сила, видимость).
//
// ---------- ЧТО ТАКОЕ `knobs` ----------
// Имена ручек будущего пульта. Сейчас это просто строки: пульта ещё нет, и
// таблица о нём ничего не знает. Они здесь затем, что ответ на вопрос «я
// ткнул в скулу — что крутить?» должен лежать в одном месте с именем, а не
// собираться заново каждым, кому понадобится.
//
// ---------- СИСТЕМА КООРДИНАТ ----------
// `at()` отвечает в единицах КОРНЕВОГО svg персонажа. Пересчёт идёт
// отношением двух CTM (`svg` и элемента), поэтому множитель css-масштаба
// холста сокращается и ответ не зависит от того, учитывает браузер
// трансформацию предка или нет (ловушка, из-за которой существует
// src/core/svg-space.js). Дальше в экран — через `SvgSpace.toClient`,
// который считает без матриц вовсе.

// ---------- ТЕХНИЧЕСКИЕ ОБЁРТКИ ----------
// `data-part`, за которыми не стоит ничего, что игрок назвал бы частью
// тела. Это слои поворота, наклона и группировки. Поиск «чья это фигура»
// проходит их насквозь — иначе на любой вопрос про голову приходит ответ
// «head-tilt».
const WORM_PART_WRAPPERS = new Set([
    'head-face',      // зеркало головы при headFlip
    'head-tilt',      // наклон головы
    'tail-bend',      // косметический доворот хвоста
    'eyes', 'ears',   // контейнеры пары
    'gaze-left', 'gaze-right',          // сдвиг зрачка
    'eyesmile-left', 'eyesmile-right'   // складка под глазом при улыбке
]);

// ---------- КУБИЧЕСКАЯ КРИВАЯ ----------
// Обычная математика Безье, не описание чего-либо: описание контура целиком
// лежит в worm-silhouette.js и спрашивается оттуда.
function wormCubicAt(p0, c1, c2, p3, t) {
    const u = 1 - t;
    const b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
    return {
        x: b0 * p0[0] + b1 * c1[0] + b2 * c2[0] + b3 * p3[0],
        y: b0 * p0[1] + b1 * c1[1] + b2 * c2[1] + b3 * p3[1]
    };
}

// ---------- ТОЧКА НА КОНТУРЕ ЧЕРЕПА ----------
// Половина контура — три кривые сверху вниз:
//   0: макушка → лоб → висок → скула
//   1: скула   → брыло → край морды
//   2: морда   → подбородок
// Ориентир задаётся номером кривой и долей вдоль неё. Доля, а не контрольная
// точка: контрольные точки у кривой лежат В СТОРОНЕ от неё, и ручка,
// поставленная в контрольную точку, висела бы рядом с силуэтом, а не на нём.
// Игрок же тычет в то, что видит, — то есть в контур.
function wormSkullPointAt(cfg, yaw, side, segIdx, t) {
    const half = WormSilhouette.skullHalf(cfg, yaw, side);
    if (!half || !half[segIdx]) return null;
    const start = segIdx === 0 ? [0, -1] : half[segIdx - 1].p;
    const s = half[segIdx];
    return wormCubicAt(start, s.c1, s.c2, s.p, t);
}

// ---------- ОРИЕНТИРЫ ЧЕРЕПА ----------
// side: −1 левая половина, +1 правая — та же сторона, что у `eye-left` и
// `ear-left` (они строятся с mirror −1). Левое у всех сущностей означает
// одно и то же; проверяет это tools/test-worm-parts.js.
const WORM_SKULL_MARKS = [
    { key: 'crown',  title: 'макушка',    seg: 0, t: 0,    mid: true,  knob: 'headHeight' },
    // Ключ `forehead`, а не `brow`: бровь в дереве уже зовётся `brow-left`,
    // и два разных места с одним именем — это ровно тот способ, которым
    // таблица имён начинает врать. Поймано прогоном.
    { key: 'forehead', title: 'лоб',      seg: 0, t: 0.34, knob: 'headWidthBrow' },
    { key: 'temple', title: 'висок',      seg: 0, t: 0.70, knob: 'headWidthTemple' },
    { key: 'cheek',  title: 'скула',      seg: 0, t: 1,    knob: 'headWidthCheek' },
    { key: 'jowl',   title: 'брыло',      seg: 1, t: 0.55, knob: 'headWidthJaw' },
    { key: 'muzzle-edge', title: 'край морды', seg: 1, t: 1, knob: 'headWidthMuzzle' },
    { key: 'chin',   title: 'подбородок', seg: 2, t: 1,    mid: true,  knob: 'headChin' }
];

// ---------- УЗЛЫ ----------
// Имя в дереве → имя для человека. Здесь только то, что игрок назвал бы
// частью тела: обёртки в список не попадают по определению.
const WORM_NODE_PARTS = [
    // `volume` и `relief` здесь НЕ лежат намеренно: это свойства СВЕТА, а не
    // головы, и живут они в своём ряду. Продублировать их сюда значит
    // показывать пять ползунков там, где по делу три, — а в холсте Telegram
    // каждая лишняя строка съедает персонажа.
    { part: 'head',      title: 'голова',      knobs: ['headSize', 'headWide', 'headHeight'] },
    { part: 'snout',     title: 'пятачок',     parent: 'head', yawRole: 'surface', knobs: ['snout', 'snoutWide'] },
    { part: 'mouth',     title: 'рот',         parent: 'head', yawRole: 'surface', knobs: ['mood', 'mouthWidth'] },
    { part: 'jaw',       title: 'челюсть',     parent: 'head', yawRole: 'face',    knobs: ['headWidthJaw', 'headChin'] },
    { part: 'muzzle',    title: 'морда',       parent: 'head', yawRole: 'face',    knobs: ['headWidthMuzzle', 'snout'] },
    { part: 'eye-left',  title: 'левый глаз',  parent: 'head', yawRole: 'surface', knobs: ['eyeSize', 'eyePlace', 'eyeHeight'] },
    { part: 'eye-right', title: 'правый глаз', parent: 'head', yawRole: 'surface', knobs: ['eyeSize', 'eyePlace', 'eyeHeight'] },
    { part: 'brow-left', title: 'левая бровь', parent: 'head', yawRole: 'surface', knobs: ['browAngle', 'browLift', 'browArc', 'browThick'] },
    { part: 'brow-right', title: 'правая бровь', parent: 'head', yawRole: 'surface', knobs: ['browAngle', 'browLift', 'browArc', 'browThick'] },
    { part: 'eyelid-left', title: 'левое веко', parent: 'head', yawRole: 'surface', knobs: ['mood'] },
    { part: 'eyelid-right', title: 'правое веко', parent: 'head', yawRole: 'surface', knobs: ['mood'] },
    { part: 'ear-left',  title: 'левое ухо',   parent: 'head', yawRole: 'surface', knobs: ['earSize', 'earTilt'] },
    { part: 'ear-right', title: 'правое ухо',  parent: 'head', yawRole: 'surface', knobs: ['earSize', 'earTilt'] },
    { part: 'segment-1', title: 'шея',         knobs: ['neck', 'thickness'] },
    { part: 'segment-2', title: 'загривок',    knobs: ['thickness'] },
    { part: 'belly',     title: 'живот',       knobs: ['bellySize', 'thickness'] },
    { part: 'tail',      title: 'хвост',       knobs: ['tailLength', 'tailThickness'] }
];

// Растущие сегменты именуются по номеру: их число меняется со взрослением,
// и перечислять их поимённо значило бы переписывать таблицу при каждом
// апгрейде. Потолок взят из модели (0..10 ступеней к двум базовым).
const WORM_GROWING_MAX = 12;

// ---------- СЛОИ ----------
// Процедурная масса. Ищется по классу: у самих фигур внутри класса нет и не
// будет, а у слоя-хозяина есть.
//
// Порядок в списке — порядок СВЕРХУ ВНИЗ по стопке, как его увидит кисть:
// сначала то, что ближе к глазу.
const WORM_LAYER_PARTS = [
    { cls: 'worm-wear-layer',    title: 'наряд',              knobs: [] },
    { cls: 'worm-scar-layer',    title: 'шрамы',              knobs: [] },
    { cls: 'worm-surface-layer', title: 'блик и матовость',   knobs: ['gloss', 'matte'] },
    { cls: 'worm-coat-layer',    title: 'покров кожи',        knobs: ['detail', 'rings', 'bristle', 'folds'] },
    { cls: 'worm-head-detail',   title: 'детали головы',      knobs: ['detail'] },
    { cls: 'worm-skull-shading', title: 'рельеф черепа',      knobs: ['relief'] },
    { cls: 'worm-snout-wrinkles', title: 'морщины пятачка',   knobs: ['detail'] },
    { cls: 'worm-snout-pores',   title: 'поры пятачка',       knobs: ['detail'] },
    { cls: 'worm-teeth',         title: 'зубы',               knobs: [] },
    { cls: 'worm-eye-veins',     title: 'сосуды глаза',       knobs: ['detail'] },
    { cls: 'worm-eye-lashes',    title: 'ресницы',            knobs: ['detail'] },
    { cls: 'worm-eye-folds',     title: 'складки века',       knobs: ['detail'] },
    { cls: 'worm-ear-vessels',   title: 'сосуды уха',         knobs: ['detail'] },
    { cls: 'worm-ear-fringe',    title: 'опушка уха',         knobs: ['bristle'] },
    { cls: 'worm-body-rings',    title: 'кольца сегментации', knobs: ['rings'] },
    { cls: 'worm-skin-tone',     title: 'тон кожи',           knobs: ['skinTone', 'detail'] },
    { cls: 'worm-neck-blend',    title: 'переход шеи',        knobs: [] },
    { cls: 'worm-muscle-layer',  title: 'мышцы',              knobs: ['relief', 'detail'] },
    { cls: 'worm-organ-ribs',    title: 'рёбра',              knobs: ['organs'] },
    { cls: 'worm-gut-tract',     title: 'кишечный тракт',     knobs: ['guts', 'organs'] },
    { cls: 'worm-organ-vessels', title: 'сосуды',             knobs: ['organs'] },
    { cls: 'worm-organ-layer',   title: 'органы',             knobs: ['organs', 'translucency'] },
    { cls: 'worm-hull-rim',      title: 'отражённый свет',    knobs: ['volume', 'lightAngle'] },
    { cls: 'worm-hull-outline',  title: 'силуэт',             knobs: [] },
    { cls: 'worm-floor-shadow',  title: 'тень на полу',       knobs: ['volume'] },
    { cls: 'worm-slime-layer',   title: 'след слизи',         knobs: [] }
];

// ---------- ТОЧКИ КОНТУРА УХА ----------
// Второй сорт ориентиров, после черепа. Разница в том, где они живут: у
// черепа точка считается формулой по кривой, у уха — лежит в МЕСТНЫХ
// координатах самого уха (WORM_EAR_ANCHORS в worm-head.js), и двигается не
// ручкой-числом, а прямым сдвигом.
//
// Ради них всё и затевалось: «сделай ухо поострее, а мочку ниже» — это
// «потяни кончик вверх, а мочку вниз», и делается пальцем.
const WORM_EAR_MARKS = [
    { key: 'ear-base',  title: 'основание уха' },
    { key: 'ear-front', title: 'передний край уха' },
    { key: 'ear-tip',   title: 'кончик уха' },
    { key: 'ear-break', title: 'излом уха' },
    { key: 'ear-lobe',  title: 'мочка уха' }
];

// ---------- ОБХВАТ ЗВЕНА ----------
// Третий сорт ориентиров. Череп — точка на кривой, ухо — точка в местных
// координатах части, а это — ВЕРХНЯЯ КРОМКА одного звена цепочки.
//
// Зачем отдельно от ручки «толщина тела». Та двигает всю цепочку разом и
// форму сохраняет: тело становится толще или тоньше целиком. А профиль
// силуэта — «где толще, где тоньше» — выводился из сида и руками не
// правился вовсе. Между тем именно он и есть фигура: горб на загривке,
// перехват за животом, сужение к хвосту.
//
// Ручку на звено заводить нельзя: звеньев от четырёх до двенадцати, и
// список ручек переписывался бы при каждом взрослении. Поэтому обхват —
// не ручка, а прямое значение на пути модели, как форма уха.
const WORM_GIRTH_LINKS = [
    { part: 'belly', path: 'belly', title: 'обхват живота' }
];
// Остальные звенья именуются по номеру — их количество меняется со
// взрослением (см. WORM_GROWING_MAX).
const WORM_GIRTH_FIXED = 2;

const WormParts = {

    WRAPPERS: WORM_PART_WRAPPERS,

    // ---------- ТАБЛИЦА ----------
    // Собирается один раз и кэшируется: она не зависит ни от модели, ни от
    // того, что сейчас на экране. Чего на экране нет — просто не найдётся
    // при вызове at().
    _list: null,

    list() {
        if (this._list) return this._list;
        const out = [];

        WORM_NODE_PARTS.forEach(n => out.push({
            key: n.part,
            title: n.title,
            kind: 'node',
            part: n.part,
            parent: n.parent || null,
            yawRole: n.yawRole || null,
            knobs: n.knobs || []
        }));

        for (let i = 1; i <= WORM_GROWING_MAX; i++) {
            out.push({
                key: `growing-${i}`,
                title: `сегмент ${i}`,
                kind: 'node',
                part: `growing-${i}`,
                parent: null,
                yawRole: null,
                knobs: ['thickness']
            });
        }

        WORM_SKULL_MARKS.forEach(m => {
            // Средние ориентиры (макушка, подбородок) стоят на оси и стороны
            // не имеют: «левый подбородок» — это не то, что кто-нибудь
            // скажет вслух.
            const sides = m.mid ? [{ s: 0, k: '', t: '' }]
                                : [{ s: -1, k: '-left', t: 'левый ' },
                                   { s: 1, k: '-right', t: 'правый ' }];
            sides.forEach(side => {
                out.push({
                    key: m.key + side.k,
                    // «левая скула», а не «левый скула»: род берётся из
                    // самого названия, потому что иначе получается робот.
                    title: side.t ? wormFeminine(side.t, m.title) : m.title,
                    kind: 'landmark',
                    part: 'head',
                    parent: 'head',
                    yawRole: 'surface',
                    knobs: [m.knob, 'headSize'],
                    skull: { seg: m.seg, t: m.t, side: side.s }
                });
            });
        });

        // Точки контура уха — по пять на сторону. `form: true` отличает их
        // от черепных: тащатся они прямым сдвигом, а не ручкой.
        WORM_EAR_MARKS.forEach(m => {
            [{ s: -1, k: 'left', t: 'левого' }, { s: 1, k: 'right', t: 'правого' }].forEach(side => {
                out.push({
                    key: m.key + '-' + side.k,
                    title: m.title.replace(' уха', ' ' + side.t + ' уха'),
                    kind: 'landmark',
                    part: 'ear-' + side.k,
                    parent: 'head',
                    yawRole: 'surface',
                    knobs: ['earSize'],
                    form: { point: m.key, side: side.s, host: 'ear-' + side.k }
                });
            });
        });

        // Обхват звена: верхняя кромка силуэта в этом месте. Считается от
        // габарита самого узла, а не от чисел модели: узел уже стоит там,
        // где его поставила цепочка, с дыханием и деформацией.
        const girth = WORM_GIRTH_LINKS.slice();
        for (let i = 1; i <= WORM_GIRTH_FIXED; i++) {
            girth.push({ part: `segment-${i}`, path: `fixedSegments.${i - 1}`,
                         title: i === 1 ? 'обхват шеи' : 'обхват загривка' });
        }
        for (let i = 1; i <= WORM_GROWING_MAX; i++) {
            girth.push({ part: `growing-${i}`, path: `growingSegments.${i - 1}`,
                         title: `обхват сегмента ${i}` });
        }
        girth.forEach(g => out.push({
            key: 'girth-' + g.part,
            title: g.title,
            kind: 'landmark',
            part: g.part,
            parent: null,
            yawRole: null,
            knobs: ['thickness'],
            girth: { part: g.part, path: g.path }
        }));

        WORM_LAYER_PARTS.forEach((l, i) => out.push({
            key: l.cls.replace(/^worm-/, ''),
            title: l.title,
            kind: 'layer',
            cls: l.cls,
            depth: i,
            parent: null,
            yawRole: null,
            knobs: l.knobs || []
        }));

        this._list = out;
        return out;
    },

    get(key) {
        return this.list().find(e => e.key === key) || null;
    },

    // ---------- ГДЕ ОНА СЕЙЧАС ----------
    // Ответ в единицах корневого svg персонажа. null означает «этой вещи
    // сейчас на экране нет» — растущего сегмента ещё не выросло, ухо
    // спрятано шляпой, анатомия выключена. Это нормальный ответ, а не сбой.
    at(handle, key) {
        const e = typeof key === 'string' ? this.get(key) : key;
        const svg = handle && handle.svgRoot;
        if (!e || !svg) return null;
        const root = svg.querySelector('.worm-root');
        if (!root) return null;

        if (e.kind === 'landmark') {
            if (e.form) return this._atForm(handle, svg, root, e);
            if (e.girth) return this._atGirth(handle, svg, root, e);
            return this._atLandmark(handle, svg, root, e);
        }

        const el = this.find(root, e);
        if (!el) return null;
        let box;
        try { box = el.getBBox(); } catch (err) { return null; }
        if (!box.width && !box.height) return null;
        const p = wormPointIn(svg, el, box.x + box.width / 2, box.y + box.height / 2);
        return p ? { x: p.x, y: p.y, el, entity: e } : null;
    },

    _atLandmark(handle, svg, root, e) {
        // Ориентир живёт в системе координат головы, а не сцены: там же, где
        // его рисуют. Обёртку берём самую внутреннюю (`head-tilt`) — в ней
        // уже учтены и наклон, и зеркало при headFlip, поэтому считать их
        // отдельно не надо.
        const host = root.querySelector('[data-part="head-tilt"]')
                  || root.querySelector('[data-part="head"]');
        if (!host || typeof WormSilhouette === 'undefined') return null;
        const model = this.model(handle);
        if (!model || !model.head) return null;
        const yaw = this.yaw(handle);
        const n = wormSkullPointAt(model.head.skull, yaw, e.skull.side, e.skull.seg, e.skull.t);
        if (!n) return null;
        const r = WormSilhouette.headRadii(model.head);
        const p = wormPointIn(svg, host, n.x * r.rx, n.y * r.ry);
        return p ? { x: p.x, y: p.y, el: host, entity: e, local: n } : null;
    },

    // Точка контура части тела (сейчас — уха). Живёт в МЕСТНЫХ координатах
    // самого узла: ровно там, где её рисуют, поэтому зеркало, поворот и
    // масштаб учитывать отдельно не надо — их уже держит трансформ узла.
    _atForm(handle, svg, root, e) {
        const host = root.querySelector(`[data-part="${e.form.host}"]`);
        if (!host || typeof wormEarPoint !== 'function') return null;
        const model = this.model(handle);
        const side = e.form.host.replace('ear-', '');
        const ear = model && model.head && model.head.ears ? model.head.ears[side] : null;
        if (!ear || ear.visible === false) return null;
        const n = wormEarPoint(e.form.side, ear.form, e.form.point);
        if (!n) return null;
        const p = wormPointIn(svg, host, n.x, n.y);
        return p ? { x: p.x, y: p.y, el: host, entity: e, local: n } : null;
    },

    // Верхняя кромка звена цепочки. Не из чисел модели, а из ГАБАРИТА узла:
    // звено уже стоит там, куда его поставила цепочка, с дыханием и
    // деформацией. Считать его положение заново значило бы завести второе
    // описание позы — ровно ту ошибку, из-за которой шрамы висели в воздухе
    // рядом с головой (ловушка 103).
    _atGirth(handle, svg, root, e) {
        const el = root.querySelector(`[data-part="${e.girth.part}"]`);
        if (!el) return null;
        let box;
        try { box = el.getBBox(); } catch (err) { return null; }
        if (!box.width || !box.height) return null;
        const cx = box.x + box.width / 2;
        const top = wormPointIn(svg, el, cx, box.y);
        const mid = wormPointIn(svg, el, cx, box.y + box.height / 2);
        if (!top || !mid) return null;
        // `centre` нужен перетаскиванию: обхват меряется расстоянием от
        // середины звена до кромки, а не абсолютной высотой на экране.
        return { x: top.x, y: top.y, el, entity: e, centre: mid };
    },

    // Экран → МЕСТНЫЕ координаты узла. Обратная сторона wormPointIn, и
    // считается так же — отношением двух CTM, чтобы множитель css-масштаба
    // холста сократился. Нужна перетаскиванию точек контура: там палец
    // переводится прямо в числа формы, без замера чувствительности.
    localIn(handle, el, clientX, clientY) {
        const svg = handle && handle.svgRoot;
        if (!svg || !el || typeof SvgSpace === 'undefined') return null;
        const v = SvgSpace.fromClient(svg, clientX, clientY);
        const m = el.getScreenCTM();
        const s = svg.getScreenCTM();
        if (!m || !s) return null;
        const pt = svg.createSVGPoint();
        pt.x = v.x; pt.y = v.y;
        const q = pt.matrixTransform(m.inverse().multiply(s));
        return { x: q.x, y: q.y };
    },

    // То же, но в экранных координатах. Через SvgSpace, а не через CTM:
    // один-единственный getScreenCTM зависит от того, учитывает ли браузер
    // трансформацию предка, и на айфоне в Telegram врёт.
    client(handle, key) {
        const p = this.at(handle, key);
        if (!p || typeof SvgSpace === 'undefined') return null;
        const c = SvgSpace.toClient(handle.svgRoot, p.x, p.y);
        return { x: c.x, y: c.y, el: p.el, entity: p.entity };
    },

    // ---------- НАЙТИ УЗЕЛ ----------
    find(root, e) {
        if (!root || !e) return null;
        if (e.kind === 'layer') return root.querySelector('.' + e.cls);
        if (e.part) return root.querySelector(`[data-part="${e.part}"]`);
        return null;
    },

    // ---------- ЧЬЯ ЭТО ФИГУРА ----------
    // Главная функция файла. Принимает ЛЮБОЙ элемент из-под пальца и
    // отвечает по-человечески. Обёртки проходятся насквозь: без этого тык в
    // голову даёт `head-tilt`, а такой части тела не существует.
    identify(el) {
        if (!el || !el.closest) return null;
        const list = this.list();

        // Слой ищем первым: фигура внутри `worm-coat-layer` принадлежит
        // покрову кожи, а не сегменту, на котором он лежит. Сегмент при
        // этом никуда не девается — он уходит в `part`.
        let layer = null;
        for (const e of list) {
            if (e.kind !== 'layer') continue;
            if (el.closest('.' + e.cls)) { layer = e; break; }
        }

        // Часть тела: поднимаемся по цепочке `data-part`, пока не встретим
        // не-обёртку.
        let node = null, cur = el;
        while (cur && cur.closest) {
            const host = cur.closest('[data-part]');
            if (!host) break;
            const name = host.getAttribute('data-part');
            if (!WORM_PART_WRAPPERS.has(name)) {
                node = list.find(e => e.kind === 'node' && e.part === name) || null;
                if (node) break;
            }
            cur = host.parentElement;
        }

        // `data-anat` — запасной ответ: анатомические слои висят на нём, а
        // не на `data-part`.
        let anatName = null;
        const anatHost = el.closest('[data-anat]');
        if (anatHost) anatName = anatHost.getAttribute('data-anat');
        if (!node && anatName) {
            node = list.find(e => e.kind === 'node' && e.part === anatName) || null;
        }

        if (!layer && !node) return null;
        return {
            entity: layer || node,
            part: node,
            layer,
            title: layer && node ? `${layer.title} · ${node.title}`
                 : (layer ? layer.title : node.title)
        };
    },

    // ---------- КИСТЬ: СТОПКА ПОД ПАЛЬЦЕМ ----------
    // Отдаёт то, что увидит человек, а не то, что лежит в дереве: девять
    // технических слоёв схлопываются в три-четыре осмысленных. Повторы
    // убираются — иначе «покров кожи» приходит пять раз подряд, по разу на
    // каждую фигуру внутри него.
    //
    // Порядок — сверху вниз, как их и перебирают колесом.
    stack(handle, clientX, clientY) {
        const svg = handle && handle.svgRoot;
        if (!svg || typeof document === 'undefined') return [];
        const root = svg.querySelector('.worm-root');
        if (!root) return [];
        const out = [], seen = new Set();
        const hits = document.elementsFromPoint(clientX, clientY);
        for (const el of hits) {
            // Всё, что ниже самого персонажа (комната, пол, фон), к нему
            // отношения не имеет и в переборе участвовать не должно.
            if (!root.contains(el)) continue;
            const id = this.identify(el);
            if (!id) continue;
            const k = id.entity.key + '|' + (id.part ? id.part.key : '');
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(Object.assign({ el }, id));
        }
        return out;
    },

    // ---------- ТЕКУЩЕЕ СОСТОЯНИЕ ----------
    // Модель ПОСЛЕ оверрайда — та, по которой персонаж нарисован сейчас.
    // Если ручка старая и getModel не умеет, честно падаем на сохранённую:
    // лучше показать базовую модель, чем не показать ничего.
    model(handle) {
        if (handle && typeof handle.getModel === 'function') return handle.getModel();
        if (typeof WormModelAPI !== 'undefined') return WormModelAPI.loadWormModel();
        return null;
    },

    // Ракурс головы прямо сейчас. Каналов два: именованная поза
    // (setHeadPose) и живой (setLivePose({ headYaw })). Живой перебивает,
    // потому что он и в рендерере перебивает.
    yaw(handle) {
        if (!handle) return 0;
        const live = typeof handle.getLivePose === 'function' ? handle.getLivePose() : null;
        if (live && live.headYaw != null) return live.headYaw;
        if (typeof handle.getHeadPose === 'function') {
            const p = handle.getHeadPose();
            if (p && p.current != null) return p.current;
        }
        return 0;
    }
};

// ---------- ОТНОШЕНИЕ ДВУХ CTM ----------
// Точка из системы элемента в систему корневого svg. Именно ОТНОШЕНИЕ, а не
// один getScreenCTM: множитель css-трансформации предка входит в обе матрицы
// и сокращается. Один getScreenCTM на это не годится — учитывает ли он
// предка, решает браузер (Chromium да, WebKit нет), и на айфоне в Telegram
// ответ уезжал бы на масштаб холста.
//
// Порядок умножения важен: сначала из элемента в экран, потом из экрана в
// svg, то есть S⁻¹ × E. Обратный порядок годами не всплывал, потому что обе
// матрицы были переносами, и сломался на первом зеркальном персонаже —
// ровно та же ошибка уже стоила бага в getPartPoint.
function wormPointIn(svg, el, lx, ly) {
    if (!svg.createSVGPoint || !el.getScreenCTM || !svg.getScreenCTM) return null;
    try {
        const m = svg.getScreenCTM().inverse().multiply(el.getScreenCTM());
        const p = svg.createSVGPoint();
        p.x = lx; p.y = ly;
        const q = p.matrixTransform(m);
        return { x: q.x, y: q.y };
    } catch (err) {
        return null;
    }
}

// «левый» + «скула» = «левая скула». Словарь короткий и закрытый: родов
// три, а сущностей, которым нужна сторона, семь.
function wormFeminine(sidePrefix, title) {
    const fem = /^(скула|бровь|морда)/.test(title);
    const neut = /^(веко|ухо|брыло)/.test(title);
    const side = sidePrefix.trim();
    const form = fem ? side.replace(/ый$/, 'ая') : (neut ? side.replace(/ый$/, 'ое') : side);
    return form + ' ' + title;
}

if (typeof window !== 'undefined') window.WormParts = WormParts;
if (typeof module !== 'undefined' && module.exports) module.exports = WormParts;
