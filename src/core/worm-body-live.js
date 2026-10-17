// ================= ЧЕРВЬ: ИСТОЩЕНИЕ, ЕДА В КИШКЕ, РЁБРА =================
// Кусок монтажа (WormRenderer.mount): запекание истощения в цвета, комки еды
// в кишке покадрово, разворот грудной клетки. Отдаёт функции для tick и handle.
//
// Текст перенесён из mount как есть и обёрнут в функцию: зависимости от
// экземпляра приходят параметром, наружу отдаются объявленные здесь имена.
function attachWormBodyLive({ state }) {
    // ---------- ЗАПЕКАНИЕ ИСТОЩЕНИЯ В ЦВЕТА ----------
    // Список цветных узлов собирается ОДИН РАЗ на сборку тела, а не
    // ищется заново на каждую ступень: пробежка по семи сотням узлов
    // ради двух десятков ступеней — ровно та мелочь, из которой потом
    // складывается «почему-то тормозит».
    //
    // Ступень грубая (1/16) намеренно. Показанное истощение подтягивается
    // к цели за кадры, и на каждый такой кадр перекрашивать полтысячи
    // атрибутов незачем: переход идёт секунду-две, шестнадцати ступеней
    // на нём глазом не различить, а работы в двадцать раз меньше.
    const WITHER_STEP = 16;

    function collectWitherNodes() {
        const out = [];
        const root = state.built && state.built.root;
        if (!root) { state.witherNodes = out; return; }
        const nodes = root.querySelectorAll('*');
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            for (let k = 0; k < WITHER_COLOR_ATTRS.length; k++) {
                const a = WITHER_COLOR_ATTRS[k];
                const v = n.getAttribute(a);
                // url(...) и none пропускаем сразу: у первого цвет лежит в
                // стопах градиента (они в этом же дереве и попадут сюда
                // сами), у второго цвета нет вовсе.
                if (!v || v === 'none' || v.indexOf('url(') === 0) continue;
                out.push({ n, a, base: v });
            }
        }
        state.witherNodes = out;
    }

    // Цвет для узла, который рождается ПОСЛЕ сборки тела и потому в
    // списке запекания не лежит: комок еды в кишке, жидкость во рту.
    // Раньше их красил тот же фильтр, что и всё тело, — теперь надо
    // руками, иначе у обесцвеченного червя внутренности останутся
    // сочными.
    function witherPaint(css) {
        const s = state.witherBaked;
        if (css == null || s == null || s >= 0.999) return css;
        return witherColor(css, s) || css;
    }

    // Здоровому червю (s = 1) цвета возвращаются исходные: witherColor при
    // единице даёт тот же оттенок, только записанный как rgb(...).
    function bakeWither(force) {
        const s = Math.max(0, Math.min(1, state.witherShown));
        const step = Math.round(s * WITHER_STEP) / WITHER_STEP;
        if (!force && state.witherBaked === step) return;
        state.witherBaked = step;
        if (!state.witherNodes) collectWitherNodes();
        const list = state.witherNodes;
        for (let i = 0; i < list.length; i++) {
            const it = list[i];
            const out = witherColor(it.base, step);
            if (out) setAttr(it.n, it.a, out);
        }
        // Комки еды живут отдельным слоем и в списке не лежат: они
        // появляются и исчезают по ходу пищеварения.
        const tract = state.built && state.built.gutTract;
        if (tract) tract.foodNodes.forEach(paintBolus);
    }

    // Цвета одного комка под текущее истощение.
    function paintBolus(ref) {
        if (!ref || !ref.base) return;
        setAttr(ref.wall, 'fill', witherPaint(ref.base.wall));
        setAttr(ref.body, 'fill', witherPaint(ref.base.body));
        setAttr(ref.shine, 'fill', witherPaint(ref.base.shine));
    }

    // ---------- ЕДА В КИШКЕ, ПОКАДРОВО ----------
    // Что здесь считается и почему именно здесь:
    //
    // * Раньше положение комков ставил вызывающий, пятнадцать раз в
    //   секунду. Пятнадцать шагов в секунду — это видимые рывки, а платил
    //   за них весь тракт целиком (маска + обрезка, см. createGutTract).
    //   Теперь вызывающий говорит только «комок вот на такой доле пути»,
    //   а движение, перистальтика и видимость считаются в кадре и стоят
    //   двух атрибутов на комок.
    // * Перистальтика — не украшение: без неё комок ПОЛЗЁТ равномерно,
    //   и в фазе кишечника (десять минут на путь) это выглядит зависшей
    //   картинкой. Волна сжимает комок вдоль трубы и подталкивает
    //   вперёд — видно, что его именно проталкивают.
    // * Видимость считается по плотности кожи, но с ПОЛОМ: там, где кожа
    //   плотная, кишку не видно вовсе, а еду видно приглушённо. Иначе
    //   самое интересное — как червь глотает — происходило бы за
    //   непрозрачной шеей.
    const FOOD_PULSE_HZ = 0.85;   // волн перистальтики в секунду
    const FOOD_NUDGE = 0.014;     // на сколько доли пути толкает волна
    // Комок ВИДНО ЛУЧШЕ, чем саму кишку, и это осознанно: кишка — фон,
    // а комок — единственное, что здесь происходит. Под плотной кожей
    // он не пропадает совсем, иначе самое интересное (как червь глотает)
    // случалось бы за непрозрачной шеей.
    const FOOD_SEE_BOOST = 0.28;  // насколько комок виднее кишки
    const FOOD_SEE_FLOOR = 0.5;   // доля видимости там, где кожа плотная

    function updateFood(dtSec) {
        const tract = state.built && state.built.gutTract;
        if (!tract || !tract.foodNodes.length) return;
        const list = state.digest.boluses;
        const pts = tract.corePts || [];
        state.foodPhase += dtSec;

        for (let i = 0; i < tract.foodNodes.length; i++) {
            const ref = tract.foodNodes[i];
            const b = list[i];
            if (!b || pts.length < 2) {
                if (ref.shown) { setAttr(ref.group, 'opacity', '0'); ref.shown = false; }
                continue;
            }
            // Своя фаза у каждого комка: иначе три проглоченных куска
            // сжимались бы разом, как один организм.
            const wave = state.foodPhase * FOOD_PULSE_HZ + i * 0.41;
            const squeeze = Math.sin((wave - Math.floor(wave)) * Math.PI * 2);
            const sPos = Math.max(0, Math.min(1, b.s + FOOD_NUDGE * squeeze));

            // Точка на осевой линии — сложение и умножение вместо промера
            // SVG-пути: строка пути меняется вслед за телом, и кеш длины
            // всё равно был бы недействителен каждый кадр.
            const fs = sPos * (pts.length - 1);
            const i0 = Math.min(pts.length - 2, Math.floor(fs));
            const k = fs - i0;
            const a = pts[i0], c = pts[i0 + 1];
            const x = a[0] + (c[0] - a[0]) * k;
            const y = a[1] + (c[1] - a[1]) * k;
            // Комок вытянут ВДОЛЬ кишки: он её растягивает, а не лежит
            // поперёк.
            const ang = Math.atan2(c[1] - a[1], c[0] - a[0]) * 180 / Math.PI;
            // Толчок вытягивает комок вдоль трубы, откат — округляет.
            // Плюс комок ужимается там, где тело тоньше него самого: на
            // хвосте оно вдвое тоньше живота, а маски, которая раньше
            // прятала вылезшее, у слоя еды больше нет.
            const rr = tract.coreR || null;
            const rLocal = rr && rr.length > i0 + 1
                ? rr[i0] + (rr[i0 + 1] - rr[i0]) * k : 0;
            const fit = rLocal > 0
                ? Math.min(1, (rLocal * 0.82) / Math.max(1, ref.size * 1.4)) : 1;
            const sx = fit * (1 + 0.24 * squeeze);
            const sy = fit * (1 - 0.16 * squeeze);
            setAttr(ref.group, 'transform',
                `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${ang.toFixed(1)}) ` +
                `scale(${sx.toFixed(3)},${sy.toFixed(3)})`);

            const thin = skinThinAt(tract.thinByIdx, sPos);
            const vis = (state.foodVis + FOOD_SEE_BOOST)
                      * (FOOD_SEE_FLOOR + (1 - FOOD_SEE_FLOOR) * thin);
            setAttr(ref.group, 'opacity', clamp01(vis).toFixed(3));
            // Перетяжка видна только на толчке: мышца сжалась — комок
            // поехал. На откате её нет вовсе.
            setAttr(ref.pinch, 'opacity',
                (squeeze > 0 ? squeeze * 0.75 : 0).toFixed(2));
            ref.shown = true;
        }
    }

    // ---------- РАЗВОРОТ ГРУДНОЙ КЛЕТКИ ----------
    // Клетка живёт в трёх измерениях (ribPath) и пересчитывается, когда
    // тело поворачивается. Цена вопроса — восемнадцать записей в дерево
    // на заметный поворот, и ноль, пока червь стоит: ракурс сравнивается
    // с уже нарисованным.
    function updateRibCage() {
        const cage = state.built && state.built.ribCage;
        if (!cage) return;
        // Ракурс тела — тот же признак, по которому доворачивается
        // голова: куда лежит хвост. 0 — тело смотрит в камеру,
        // ±90° — профиль. Мини-игра может задать его сама (bodyYaw),
        // если водит червя не хвостом.
        const live = state.livePose.bodyYaw;
        const k = live != null ? Math.max(-1, Math.min(1, live))
                               : -Math.cos(state.tailAngle * Math.PI / 180);
        const psi = k * Math.PI / 2;
        if (cage.psi != null && Math.abs(psi - cage.psi) < 0.026) return;
        cage.psi = psi;

        // Вся клетка ещё и ДОВОРАЧИВАЕТСЯ. Ось тела в животе нарисована
        // наискосок — так тело и лежит, когда мы видим его сбоку. Но
        // когда червь поворачивается к камере, хвост уходит в глубину, и
        // туловище на экране становится почти отвесным: клетка обязана
        // встать вместе с ним, иначе анфас выходит перекошенным. Поворот
        // делается ОДНИМ transform на половину клетки — его всё равно
        // переписывает пульсация органов, так что это ноль лишней работы.
        const beta = RIB_TURN_DEG * Math.cos(psi);
        cage.walls.forEach(w => { w.rot = beta; });

        for (let i = 0; i < cage.list.length; i++) {
            const rib = cage.list[i];
            const r = ribPath(rib, psi);
            setAttr(rib.shadow, 'd', r.d);
            setAttr(rib.line, 'd', r.d);
            // Ближнее ребро ярче дальнего. Ступенями по шестым долям:
            // иначе на каждый кадр поворота приходится ещё по две записи
            // на ребро, а разницы в четверть процента прозрачности никто
            // не увидит.
            const near = Math.round(r.near * 6) / 6;
            if (rib.shown !== near) {
                rib.shown = near;
                setAttr(rib.line, 'opacity', (0.28 + 0.26 * near).toFixed(2));
                setAttr(rib.shadow, 'opacity', (0.1 + 0.16 * near).toFixed(2));
            }
        }

        // Половина клетки, которая ближе к зрителю, рисуется ПОВЕРХ
        // органов, дальняя — под ними. При развороте они меняются
        // ролями: две перестановки узлов на весь разворот, а не на кадр.
        if (cage.groups.length === 2) {
            const frontIsB = Math.sin(psi) > 0;
            if (cage.frontIsB !== frontIsB) {
                cage.frontIsB = frontIsB;
                const layer = cage.groups[0].parentNode;
                if (layer) {
                    layer.insertBefore(frontIsB ? cage.groups[0] : cage.groups[1], layer.firstChild);
                    layer.appendChild(frontIsB ? cage.groups[1] : cage.groups[0]);
                }
            }
        }
    }
    return { WITHER_STEP, collectWitherNodes, witherPaint, bakeWither, paintBolus, FOOD_PULSE_HZ, FOOD_NUDGE, FOOD_SEE_BOOST, FOOD_SEE_FLOOR, updateFood, updateRibCage };
}
