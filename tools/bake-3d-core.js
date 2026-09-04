// ============ ЗАПЕКАНИЕ 3Д-МОДЕЛИ В ПУТИ SVG ============
//
// Работает В БРАУЗЕРЕ, под управлением tools/bake-3d.js. На выходе — обычные
// пути SVG в координатах сцены игры (720×1440). В рантайм three.js не
// попадает: он нужен только здесь.
//
// ---------- ЧТО ИМЕННО ДЕЛАЕТСЯ ----------
// 1. Модель строится процедурно (тела вращения, коробки, выдавливания).
// 2. Каждый треугольник проецируется КАМЕРОЙ — отсюда и берётся перспектива,
//    вместо того чтобы угадывать её вручную.
// 3. Треугольники, повёрнутые от зрителя, выбрасываются.
// 4. Освещённость каждого треугольника КВАНТУЕТСЯ по ступеням палитры. Это
//    не упрощение ради веса: ровно так и устроена вся графика игры — форму
//    держит перепад между гранями, а не плавная растяжка и не контур
//    (docs/art-direction.md).
// 5. Треугольники одной ступени сливаются в ОДИН путь. Иначе на предмет
//    уходит шестьсот тегов вместо шести.
//
// ---------- ПОЧЕМУ ТРЕУГОЛЬНИКИ РАСШИРЯЮТСЯ ----------
// Соседние треугольники одной ступени сходятся ВСТЫК, а встык на сглаженных
// краях всегда даёт светлую нить по шву — это уже известная грабля
// (docs/kitchen-checks.md, правило перекрытия). Поэтому каждый треугольник
// раздувается от своего центра на долю единицы, и швы перекрываются.

const BAKE = {

    // Свет — из ВЕРХНЕГО ЛЕВОГО угла, как у всей остальной графики игры.
    // Разный свет на соседних предметах разваливает сцену сильнее, чем
    // разный цвет.
    //
    // Это вектор НА источник, а не от него. Первая версия стояла с y = -0.7,
    // то есть светила снизу: верхние грани уходили в тень, и предмет
    // получался вывернутым наизнанку.
    LIGHT: { x: -0.55, y: 0.78, z: 0.42 },

    // Раздутия треугольников здесь НЕТ, и это важно.
    //
    // Им перекрывали светлую нить на стыке соседних заливок, но лечило оно
    // симптом и ломало главное: раздутые треугольники перестают сходиться
    // общими рёбрами, а разрез ступени по изолинии (см. bake) как раз на
    // общих рёбрах и держится — границы у соседей расходятся, и предмет
    // снова покрывается мозаикой из собственных граней.
    //
    // Нить со стыка снимает обводка заливки ЕЁ ЖЕ цветом (см. draw() в
    // bath-baked.js): она перекрывает шов и снаружи, и изнутри, не сдвигая
    // ни одной вершины.


    // ---------- КАМЕРА ----------
    // Камера ОДНА на всю комнату, и это ключевое свойство: наезды в игре —
    // это crop и zoom одной картинки (GluttonyMinigame.setCamera вешает
    // transform на группу), а не движение камеры в пространстве. Значит и
    // запекать надо один ракурс, и никакой комбинаторики «предмет × угол»
    // не возникает.
    //
    // Фокусное ДЛИННОЕ: близкая точка схода расфокусировала бы низ комнаты
    // веером наклонов, ровно как это случилось при ручной отрисовке.
    camera(opts) {
        const o = Object.assign({
            fov: 14,              // длинный объектив: почти параллельная проекция
            at: { x: 0, y: -1.2, z: 0 },
            from: { x: 1.2, y: 8.6, z: 11.8 },
            // Куда встаёт центр кадра в координатах сцены игры и сколько
            // единиц сцены приходится на единицу мира.
            origin: { x: 360, y: 780 },
            scale: 41
        }, opts || {});
        const cam = new THREE.PerspectiveCamera(o.fov, 1, 0.1, 1000);
        cam.position.set(o.from.x, o.from.y, o.from.z);
        cam.lookAt(o.at.x, o.at.y, o.at.z);
        cam.updateMatrixWorld(true);
        cam.updateProjectionMatrix();
        return { cam, origin: o.origin, scale: o.scale };
    },

    // Мир → координаты сцены игры.
    project(v, view) {
        const p = v.clone().project(view.cam);
        return {
            x: view.origin.x + p.x * view.scale,
            // В NDC ось Y смотрит вверх, в SVG — вниз.
            y: view.origin.y - p.y * view.scale
        };
    },

    // ---------- ЗАПЕЧЬ НАБОР ПРЕДМЕТОВ ----------
    // items — [{ root, ramp, name }]. Запекаются ВМЕСТЕ и одним проходом, а
    // не по одному: иначе вода не может оказаться внутри чаши, а только
    // целиком перед ней или целиком за ней.
    //
    // ---------- ПОРЯДОК РИСОВАНИЯ ----------
    // Между ПРЕДМЕТАМИ порядок задан СПИСКОМ, а внутри предмета — по глубине.
    //
    // Две попытки до этого были неверны. Сортировка по ступени света клала
    // светлое поверх тёмного: наружная стенка ванны закрывала собой её же
    // полость, и чаша читалась сплошной коробкой. Сквозная сортировка по
    // глубине ломалась там, где поверхности СОПРИКАСАЮТСЯ: ванна стоит на
    // полу, у большой плиты пола один центр на десять единиц глубины, и пол
    // рисовался поверх ванны. Дробление пола на сетку не спасло —
    // соприкасающиеся поверхности алгоритм художника не разводит в принципе,
    // для этого нужен буфер глубины, которого у SVG нет.
    //
    // Список же решает это даром и ровно так, как устроена кухня: стена,
    // пол, оборудование, ванна, вода. Порядок — решение художника, а не
    // результат вычисления.
    // ---------- РАМПА ПОДРОБНЕЕ ----------
    // Художественная рампа задаётся четырьмя-шестью цветами: это удобно
    // править и мало для света. Между соседними ступенями достраиваются
    // промежуточные — перепад между гранями остаётся, но перестаёт быть
    // лестницей в три ступени на весь предмет.
    //
    // Достраивается ЗДЕСЬ, а не в палитре: в палитре должно лежать решение
    // художника, а не его интерполяция.
    RAMP_STEPS: 8,
    _rampCache: {},
    fatRamp(colors) {
        const key = colors.join('');
        if (this._rampCache[key]) return this._rampCache[key];
        const N = this.RAMP_STEPS;
        if (colors.length >= N) return (this._rampCache[key] = colors);
        const rgb = colors.map(c => [parseInt(c.slice(1, 3), 16),
                                     parseInt(c.slice(3, 5), 16),
                                     parseInt(c.slice(5, 7), 16)]);
        const out = [];
        for (let i = 0; i < N; i++) {
            const t = i / (N - 1) * (rgb.length - 1);
            const j = Math.min(rgb.length - 2, Math.floor(t)), f = t - j;
            const v = [0, 1, 2].map(k => Math.round(
                rgb[j][k] + (rgb[j + 1][k] - rgb[j][k]) * f));
            out.push('#' + v.map(x => x.toString(16).padStart(2, '0')).join(''));
        }
        return (this._rampCache[key] = out);
    },

    bake(items, view, opts) {
        const o = Object.assign({ minLight: 0.06, maxLight: 0.98 }, opts || {});
        const light = new THREE.Vector3(this.LIGHT.x, this.LIGHT.y, this.LIGHT.z)
            .normalize();
        const tris = [];
        const order = [];
        const camPos = view.cam.position;

        for (const item of (Array.isArray(items) ? items : [items])) {
            // РАСПИЛ ПО ГЛУБИНЕ. Предмет, внутри которого что-то стоит (червь
            // в ванне), нельзя нарисовать одним куском: дальняя его половина
            // обязана быть ЗА персонажем, ближняя — ПЕРЕД ним. Треугольник
            // уходит в ту половину, по какую сторону от splitZ лежит его
            // центр; порядок между половинами задаётся списком, как обычно.
            const cut = item.splitZ;
            const base = item.name;
            const nameOf = (mz) => cut == null ? item.name
                : item.name + (mz < cut ? 'Far' : 'Near');
            if (cut == null) order.push(item.name);
            else order.push(item.name + 'Far', item.name + 'Near');
            item.root.updateMatrixWorld(true);
            item.root.traverse(node => {
                if (!node.isMesh) return;
                // Часть предмета может краситься СВОЕЙ рампой: у ванны нутро
                // темнее наружной стенки, и одной рампой на всё она читается
                // белым слитком.
                const ramp = this.fatRamp((node.userData.part && item.ramps
                    && item.ramps[node.userData.part]) || item.ramp);

                // ПЛОСКАЯ поверхность выходит ОДНИМ контуром, а не набором
                // треугольников. У плоскости одна нормаль, то есть одна
                // ступень света на всю площадь, и бить её на треугольники
                // незачем — а швы между ними видны: веер, которым была
                // залита вода, шёл через чашу «бабочкой» из тонких щелей,
                // сходящихся в центре, где перекрытие вырождается в ноль.
                if (node.userData.outline) {
                    const pts = node.userData.outline.map(p =>
                        this.project(new THREE.Vector3(p.x, p.y, p.z)
                            .applyMatrix4(node.matrixWorld), view));
                    const nrm = new THREE.Vector3(0, 1, 0)
                        .applyMatrix3(new THREE.Matrix3()
                            .getNormalMatrix(node.matrixWorld)).normalize();
                    const lit = Math.max(o.minLight, Math.min(o.maxLight,
                        nrm.dot(light) * 0.5 + 0.5));
                    // Глубина — по ЦЕНТРУ САМОГО КОНТУРА, а не по позиции
                    // меша. Плоскости строятся сразу в мировых координатах и
                    // стоят в нуле, поэтому позиция у всех у них одна: стена,
                    // пол и вода получали одинаковую глубину, порядок между
                    // ними выходил произвольным, и стена легла поверх всей
                    // комнаты.
                    const mid = new THREE.Vector3();
                    for (const p of node.userData.outline) mid.add(
                        new THREE.Vector3(p.x, p.y, p.z));
                    mid.multiplyScalar(1 / node.userData.outline.length)
                       .applyMatrix4(node.matrixWorld);
                    tris.push({
                        depth: mid.distanceTo(camPos), lit, ramp,
                        name: nameOf(mid.z), base, poly: pts, raw: pts
                    });
                    return;
                }

                const geo = node.geometry;
                const pos = geo.attributes.position;
                const nrm = geo.attributes.normal;
                const idx = geo.index;
                const count = idx ? idx.count : pos.count;
                const nm = new THREE.Matrix3().getNormalMatrix(node.matrixWorld);
                const a = new THREE.Vector3(), b = new THREE.Vector3(),
                      c = new THREE.Vector3();
                const ab = new THREE.Vector3(), ac = new THREE.Vector3(),
                      n = new THREE.Vector3(), mid = new THREE.Vector3();
                const sm = new THREE.Vector3(), vn = new THREE.Vector3();

                for (let i = 0; i < count; i += 3) {
                    const i0 = idx ? idx.getX(i) : i;
                    const i1 = idx ? idx.getX(i + 1) : i + 1;
                    const i2 = idx ? idx.getX(i + 2) : i + 2;
                    a.fromBufferAttribute(pos, i0).applyMatrix4(node.matrixWorld);
                    b.fromBufferAttribute(pos, i1).applyMatrix4(node.matrixWorld);
                    c.fromBufferAttribute(pos, i2).applyMatrix4(node.matrixWorld);

                    const pa = this.project(a, view), pb = this.project(b, view),
                          pc = this.project(c, view);
                    // Отбраковка по знаку площади В ПРОЕКЦИИ: надёжнее, чем
                    // по нормали, потому что учитывает и саму перспективу.
                    const area = (pb.x - pa.x) * (pc.y - pa.y)
                               - (pc.x - pa.x) * (pb.y - pa.y);
                    if (area >= -1e-6) continue;

                    // Нормаль грани. Вершины УЖЕ переведены в мир, значит и
                    // векторное произведение их рёбер — мировая нормаль.
                    // Стояло ещё и умножение на матрицу нормалей: повёрнутый
                    // предмет получал свой поворот ВТОРОЙ раз, и свет на нём
                    // лежал не с той стороны. На неповёрнутых (ванна, стена)
                    // матрица единичная — потому ошибка и жила так долго.
                    ab.subVectors(b, a); ac.subVectors(c, a);
                    n.crossVectors(ab, ac).normalize();

                    // ---------- СГЛАЖЕННАЯ НОРМАЛЬ ----------
                    // Свет считается не по грани, а по УСРЕДНЁННЫМ нормалям
                    // вершин: у гнутой поверхности соседние треугольники
                    // получают почти одинаковую освещённость, и вместо
                    // гранёного бока выходит перелив. Без этого труба душа,
                    // борт ванны и раструб лейки показывали собственную
                    // сетку — каждая грань своей ступенью.
                    //
                    // НО только там, где поверхность действительно гнутая.
                    // Если усреднённая нормаль сильно расходится с нормалью
                    // грани, это настоящий перелом (борт, торец, фаска), и
                    // сглаживать его нельзя: предмет потеряет форму.
                    // Освещённость считается В КАЖДОЙ ВЕРШИНЕ, а не одна на
                    // грань. Одна на грань — это и есть «видно сетку»: у
                    // каждого треугольника своя ступень, и модель показывает
                    // собственное разбиение. По трём значениям в вершинах
                    // свет внутри треугольника меняется линейно, и границу
                    // ступени можно провести ГДЕ НАДО, а не по рёбрам.
                    const face = Math.max(o.minLight, Math.min(o.maxLight,
                        n.dot(light) * 0.5 + 0.5));
                    let lv = [face, face, face];
                    if (nrm) {
                        sm.set(0, 0, 0);
                        for (const j of [i0, i1, i2])
                            sm.add(vn.fromBufferAttribute(nrm, j));
                        sm.applyMatrix3(nm).normalize();
                        // Сглаживаем только НАСТОЯЩУЮ кривизну. Если
                        // усреднённая нормаль сильно расходится с нормалью
                        // грани, это перелом (борт, торец, фаска) — его
                        // сглаживание съело бы форму.
                        if (sm.dot(n) > 0.8) lv = [i0, i1, i2].map(j => {
                            vn.fromBufferAttribute(nrm, j)
                              .applyMatrix3(nm).normalize();
                            return Math.max(o.minLight, Math.min(o.maxLight,
                                vn.dot(light) * 0.5 + 0.5));
                        });
                    }
                    const lit = (lv[0] + lv[1] + lv[2]) / 3;

                    mid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
                    tris.push({
                        depth: mid.distanceTo(camPos),
                        lit, lv, ramp, name: nameOf(mid.z), base,
                        // Контур считается по НЕРАЗДУТЫМ вершинам: раздутие
                        // разводит общие рёбра соседей, и они перестают
                        // сходиться — силуэт рассыпается на отдельные палки.
                        raw: [pa, pb, pc],
                        p: [pa, pb, pc]
                    });
                }
            });
        }

        // Усреднения света по соседним треугольникам здесь БОЛЬШЕ НЕТ, и
        // это не потеря. Оно затыкало ровно одну дыру: у двух треугольников
        // одного четырёхугольника ступени расходились, и по диагонали шла
        // черта. Свет, посчитанный в вершинах, этой дыры не оставляет вовсе —
        // общие вершины у соседей одни и те же.

        // ---------- СВЕТ РАСТЯГИВАЕТСЯ ПО ВСЕЙ РАМПЕ ПРЕДМЕТА ----------
        // Освещённость грани сама по себе почти никогда не занимает весь
        // диапазон: у чаши, все грани которой смотрят вверх и внутрь, она
        // лежала между 0.75 и 0.95 — и после квантования ВЕСЬ предмет
        // приходился на две верхних ступени рампы. Ванна выходила листом
        // белой бумаги, а перепад между гранями, на котором держится вся
        // графика игры, пропадал.
        //
        // Поэтому наблюдённый разброс предмета растягивается на всю рампу.
        // Это не «поярче»: это единственный способ получить у предмета
        // светлую и тёмную сторону, не подбирая рампу под каждый ракурс.
        //
        // Совсем плоскому предмету (стена, пол, вода) растягивать нечего —
        // ему даётся одна средняя ступень.
        //
        // Растягивается КАЖДАЯ РАМПА ОТДЕЛЬНО, а не предмет целиком. У ванны
        // нутро красится тёмной рампой, наружа — светлой, и общий на двоих
        // разброс задавало нутро: вся наружная стенка вместе с бортом
        // сваливалась в две верхних ступени, борт не отделялся от стенки, и
        // чаша снова выходила листом бумаги.
        const FLAT = 0.035;
        const keyOf = (t) => t.base + '|' + t.ramp[0];
        const range = new Map();
        for (const t of tris) {
            const k = keyOf(t);
            const r = range.get(k) || { lo: 1e9, hi: -1e9 };
            if (t.lit < r.lo) r.lo = t.lit;
            if (t.lit > r.hi) r.hi = t.lit;
            range.set(k, r);
        }
        // ---------- СТУПЕНЬ РЕЖЕТСЯ ПО ИЗОЛИНИИ, А НЕ ПО РЕБРУ ----------
        // Вот это и есть «видно сетку полигонов». Заливка у треугольника
        // одна, поэтому граница между двумя ступенями света могла проходить
        // ТОЛЬКО по его рёбрам — и шла зигзагом по разбиению модели.
        // Никакое сглаживание света этого не лечит: чем мягче свет, тем
        // длиннее зигзаг.
        //
        // Свет внутри треугольника меняется линейно (значения известны в
        // вершинах), значит линия равной освещённости — прямая, и её можно
        // ПОСЧИТАТЬ. Треугольник режется по каждой такой линии, и каждый
        // кусок заливается своей ступенью. Границы ступеней после этого
        // идут по форме предмета, а не по его сетке, и низкополигональная
        // модель перестаёт показывать, из чего она сложена.
        const out2 = [];
        for (const t of tris) {
            const r = range.get(keyOf(t));
            const n = t.ramp.length - 1;
            const flat = (r.hi - r.lo) < FLAT;
            const norm = (v) => flat ? 0.62 : (v - r.lo) / (r.hi - r.lo);
            const step = (k) => t.ramp[Math.max(0, Math.min(n, Math.round(k * n)))];
            const pts = t.poly || t.p;
            if (flat || !t.lv || t.lv.length !== 3) {
                t.color = step(norm(t.lit));
                out2.push(t);
                continue;
            }
            const kv = t.lv.map(norm);
            if (Math.round(Math.min(...kv) * n) === Math.round(Math.max(...kv) * n)) {
                t.color = step(kv[0]);
                out2.push(t);
                continue;
            }
            // Резать надо ПО РАЗДУТЫМ вершинам — по ним и рисуется заливка.
            let cur = { poly: pts, vals: t.lv.map(norm) };
            for (let i = 0; i < n && cur; i++) {
                const th = (i + 0.5) / n;
                const lo = Math.min(...cur.vals), hi = Math.max(...cur.vals);
                if (lo >= th) continue;
                if (hi <= th) {
                    out2.push(Object.assign({}, t, { poly: cur.poly,
                        color: t.ramp[i], raw: null }));
                    cur = null;
                    break;
                }
                const cut = this.clipAt(cur.poly, cur.vals, th);
                if (cut[0].poly.length > 2)
                    out2.push(Object.assign({}, t, { poly: cut[0].poly,
                        color: t.ramp[i], raw: null }));
                cur = cut[1].poly.length > 2 ? cut[1] : null;
            }
            // Остаток лежит выше последнего порога — это верхняя ступень.
            // Считать её по среднему нельзя: среднее иногда падало на
            // ступень ниже, и по предмету шли лишние полосы.
            if (cur) out2.push(Object.assign({}, t, { poly: cur.poly,
                color: t.ramp[n], raw: null }));
        }
        // Контуры считаются ДО разреза: им нужны целые треугольники.
        this.lastOutlines = this.outlines(tris);
        tris.length = 0;
        tris.push(...out2);

        // Сортировка ВНУТРИ предмета: между предметами порядок уже задан
        // списком, и перемешивать их нельзя.
        const out = [];
        for (const name of order) {
            const own = tris.filter(t => t.name === name);
            own.sort((p, q) => q.depth - p.depth);
            out.push(...own);
        }

        // Подряд идущие треугольники одного цвета сливаются в один путь:
        // иначе на предмет уходят сотни тегов вместо десятка. Слияние идёт
        // ТОЛЬКО по соседям в порядке рисования — иначе оно снова
        // перепутало бы глубину.
        const parts = [];
        for (const t of out) {
            const pts = t.poly || t.p;
            // Координаты заливок округляются ДО ЦЕЛЫХ. Полупиксельная
            // точность здесь не нужна: предмет рисуется не крупнее своего
            // запечённого размера, а шов в полединицы всё равно перекрыт
            // обводкой заливки. Разрез ступеней по изолиниям утроил число
            // кусков, и лишний знак после запятой стоил бы десяток килобайт
            // на ровном месте.
            const d = 'M' + pts.map(p => `${Math.round(p.x)} ${Math.round(p.y)}`)
                                .join('L') + 'Z';
            const last = parts[parts.length - 1];
            if (last && last.color === t.color) { last.d += d; last.tris++; }
            else parts.push({ color: t.color, d, tris: 1, name: t.name });
        }
        return parts;
    },

    // ---------- РАЗРЕЗ МНОГОУГОЛЬНИКА ПО УРОВНЮ ----------
    // Значения заданы в вершинах и меняются вдоль ребра линейно, поэтому
    // точка пересечения с уровнем считается точно. Возвращает две части:
    // «не выше уровня» и «не ниже».
    clipAt(poly, vals, th) {
        const lo = { poly: [], vals: [] }, hi = { poly: [], vals: [] };
        for (let i = 0; i < poly.length; i++) {
            const j = (i + 1) % poly.length;
            const a = poly[i], b = poly[j], va = vals[i], vb = vals[j];
            (va <= th ? lo : hi).poly.push(a);
            (va <= th ? lo : hi).vals.push(va);
            if ((va < th && vb > th) || (va > th && vb < th)) {
                const f = (th - va) / (vb - va);
                const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
                lo.poly.push(p); lo.vals.push(th);
                hi.poly.push(p); hi.vals.push(th);
            }
        }
        return [lo, hi];
    },



    // ---------- ЯКОРЯ ----------
    // Именованные точки МИРА, спроецированные в координаты сцены. Ими
    // заменяются вручную подогнанные гнёзда: место крана, посадка червя,
    // полка. Раньше такие числа подбирались глазом и разъезжались с
    // картинкой при каждой её правке — теперь они из неё выводятся.
    anchors(points, view) {
        const out = {};
        for (const name of Object.keys(points)) {
            const p = points[name];
            const q = this.project(new THREE.Vector3(p.x, p.y, p.z), view);
            out[name] = { x: Math.round(q.x), y: Math.round(q.y) };
        }
        return out;
    },

    // Отрезки МИРА, спроецированные в координаты сцены. Ими кладётся сетка
    // швов кафеля: линия на плоскости в перспективе — всё ещё прямая, и
    // достаточно спроецировать её концы.
    segments(list, view) {
        return list.map(([a, b]) => {
            const p = this.project(new THREE.Vector3(a.x, a.y, a.z), view);
            const q = this.project(new THREE.Vector3(b.x, b.y, b.z), view);
            return [+p.x.toFixed(1), +p.y.toFixed(1),
                    +q.x.toFixed(1), +q.y.toFixed(1)];
        });
    },

    // ---------- КОНТУР СИЛУЭТА ----------
    // Тонкая чернильная линия по краю предмета. Не по каждой грани — только
    // по внешнему краю, и именно поэтому она читается мультяшной обводкой, а
    // не сеткой полигонов.
    //
    // Зачем вообще: запечённое из трёхмерного всегда угловато по краю, и
    // низкополигональность видно первым делом на силуэте. Добавлять
    // полигоны — дорого и всё равно не спасает; обводка прячет фаску даром и
    // заодно собирает предмет в одну фигуру.
    //
    // Как считается: ребро, у которого ровно ОДИН треугольник, лежит на краю
    // видимой части. Общие рёбра соседей встречаются дважды и отбрасываются.
    // Считается это по БАЗОВОМУ предмету, а не по половине распила: иначе по
    // линии распила пошла бы лишняя черта поперёк ванны.
    outlines(tris) {
        const key = (p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
        const byBase = new Map();
        for (const t of tris) {
            if (!t.raw) continue;
            const b = t.base || t.name;
            if (!byBase.has(b)) byBase.set(b, new Map());
            const edges = byBase.get(b);
            const n = t.raw.length;
            for (let i = 0; i < n; i++) {
                const a = t.raw[i], c = t.raw[(i + 1) % n];
                const ka = key(a), kc = key(c);
                const k = ka < kc ? ka + '|' + kc : kc + '|' + ka;
                const e = edges.get(k);
                if (e) e.n++;
                else edges.set(k, { n: 1, a, b: c, name: t.name });
            }
        }

        // Оставшиеся рёбра сшиваются в ломаные. Идти можно ТОЛЬКО через
        // вершины, где сходятся ровно два краевых ребра: в остальных ход
        // неоднозначен, и любая догадка о продолжении уводила ломаную через
        // всю фигуру — в углах ванны из таких перескоков вырастали чёрные
        // веера. Там, где ход неоднозначен, ломаная просто обрывается.
        const out = {};
        for (const [, edges] of byBase) {
            // Габарит предмета: по нему отсекаются осколки обводки.
            let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
            for (const [, e] of edges)
                for (const p of [e.a, e.b]) {
                    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
                    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
                }
            const diag = Math.hypot(x1 - x0, y1 - y0);
            const byName = new Map();
            for (const [, e] of edges) {
                if (e.n !== 1) continue;
                if (!byName.has(e.name)) byName.set(e.name, []);
                byName.get(e.name).push(e);
            }
            for (const [name, list] of byName) {
                const links = new Map();
                const add = (k, e) => {
                    if (!links.has(k)) links.set(k, []);
                    links.get(k).push(e);
                };
                for (const e of list) { add(key(e.a), e); add(key(e.b), e); }
                const used = new Set();
                const chains = [];
                const walk = (e0, fromKey) => {
                    const pts = [fromKey === key(e0.a) ? e0.a : e0.b,
                                 fromKey === key(e0.a) ? e0.b : e0.a];
                    used.add(e0);
                    let cur = key(pts[1]), guard = list.length + 4;
                    while (guard-- > 0) {
                        const at = links.get(cur) || [];
                        if (at.length !== 2) break;         // развилка — обрыв
                        const next = at.find(e => !used.has(e));
                        if (!next) break;
                        used.add(next);
                        const p = key(next.a) === cur ? next.b : next.a;
                        pts.push(p);
                        cur = key(p);
                        if (cur === key(pts[0])) break;
                    }
                    return pts;
                };
                // Сначала от развилок и концов, потом то, что осталось, —
                // замкнутые кольца.
                for (const e of list) {
                    if (used.has(e)) continue;
                    for (const end of [key(e.a), key(e.b)]) {
                        if ((links.get(end) || []).length === 2) continue;
                        chains.push(walk(e, end));
                        break;
                    }
                }
                for (const e of list) {
                    if (used.has(e)) continue;
                    chains.push(walk(e, key(e.a)));
                }
                // Не всякая цепочка краевых рёбер — силуэт. Отбраковка режет
                // предмет на куски, и у внутреннего куска появляется
                // собственная граница. У дальней половины ванны из неё
                // вырастали два чёрных плавника под чашей: в углу чаши
                // протяжка даёт веер осколочных треугольников, у каждого
                // почти все рёбра краевые, и обход складывал их в гармошку —
                // ломаную длиной в полтысячи пикселей внутри пятна тридцать
                // на двадцать. Обведённая линией в пять, она выходила
                // сплошной кляксой.
                //
                // Отсюда два признака, по которым осколок отличается от
                // силуэта. Силуэт СОРАЗМЕРЕН предмету — осколок мельче его
                // сотой доли. И силуэт НЕ СКЛАДЫВАЕТСЯ вдвое: у кольца вокруг
                // фигуры длина втрое больше её диагонали, у гармошки — в
                // десятки раз.
                out[name] = (out[name] || []).concat(chains.filter(c => {
                    if (c.length <= 2) return false;
                    let len = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
                    for (let i = 0; i < c.length; i++) {
                        if (i) len += Math.hypot(c[i].x - c[i - 1].x,
                                                 c[i].y - c[i - 1].y);
                        x0 = Math.min(x0, c[i].x); y0 = Math.min(y0, c[i].y);
                        x1 = Math.max(x1, c[i].x); y1 = Math.max(y1, c[i].y);
                    }
                    const own = Math.hypot(x1 - x0, y1 - y0);
                    return own > diag * 0.035 && len < own * 6;
                }));
            }
        }
        return out;
    },

    // Ломаная → путь со СГЛАЖЕННЫМИ тупыми углами. Резкие повороты (борт
    // ванны, край полки) остаются резкими: округлить всё подряд значит
    // превратить предметы в кляксы.
    //
    // Ломаная может быть и незамкнутой — там, где силуэт оборвался на
    // развилке. Замыкать её насильно нельзя: получится хорда через предмет.
    smooth(pts, sharpDeg) {
        const sharp = Math.cos((sharpDeg == null ? 62 : sharpDeg) * Math.PI / 180);
        const p = pts.slice();
        const closed = p.length > 3
            && Math.hypot(p[0].x - p[p.length - 1].x,
                          p[0].y - p[p.length - 1].y) < 0.01;
        if (closed) p.pop();
        const n = p.length;
        if (n < 3) return '';
        const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        const at = (i) => p[(i + n) % n];
        let d = '';
        const from = closed ? 0 : 1, to = closed ? n - 1 : n - 2;
        d = closed ? `M${mid(at(-1), p[0]).x.toFixed(1)} ${mid(at(-1), p[0]).y.toFixed(1)}`
                   : `M${p[0].x.toFixed(1)} ${p[0].y.toFixed(1)}`;
        for (let i = from; i <= to; i++) {
            const a = at(i - 1), b = p[i], c = at(i + 1);
            const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
            const lu = Math.hypot(ux, uy) || 1, lv = Math.hypot(vx, vy) || 1;
            const cosT = (ux * vx + uy * vy) / (lu * lv);
            const m1 = mid(b, c);
            if (cosT < sharp) {
                d += `L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
                d += `L${m1.x.toFixed(1)} ${m1.y.toFixed(1)}`;
            } else {
                d += `Q${b.x.toFixed(1)} ${b.y.toFixed(1)} `
                   + `${m1.x.toFixed(1)} ${m1.y.toFixed(1)}`;
            }
        }
        if (!closed) d += `L${p[n - 1].x.toFixed(1)} ${p[n - 1].y.toFixed(1)}`;
        return closed ? d + 'Z' : d;
    },

    // Готовая разметка предмета.
    markup(parts, cls) {
        return `<g class="${cls || 'baked'}">\n` + parts.map(p =>
            `    <path fill="${p.color}" d="${p.d}"/>`).join('\n') + `\n</g>`;
    },

    // Габарит запечённого: его спрашивает и проверка подгонки, и аудит.
    box(parts) {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const p of parts)
            for (const m of p.d.matchAll(/([-\d.]+) ([-\d.]+)/g)) {
                const x = +m[1], y = +m[2];
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
        return { x: Math.round(x0), y: Math.round(y0),
                 w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
    }
};
