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

    // На сколько раздувать треугольник от центра, чтобы перекрыть шов.
    SEAM: 0.35,

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
    bake(items, view, opts) {
        const o = Object.assign({ minLight: 0.06, maxLight: 0.98 }, opts || {});
        const light = new THREE.Vector3(this.LIGHT.x, this.LIGHT.y, this.LIGHT.z)
            .normalize();
        const tris = [];
        const order = [];
        const camPos = view.cam.position;

        for (const item of (Array.isArray(items) ? items : [items])) {
            const ramp = item.ramp;
            order.push(item.name);
            item.root.updateMatrixWorld(true);
            item.root.traverse(node => {
                if (!node.isMesh) return;

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
                    let lit = nrm.dot(light) * 0.5 + 0.5;
                    lit = Math.max(o.minLight, Math.min(o.maxLight, lit));
                    const step = Math.min(ramp.length - 1, Math.max(0,
                        Math.round(lit * (ramp.length - 1))));
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
                        depth: mid.distanceTo(camPos), color: ramp[step],
                        name: item.name, poly: pts
                    });
                    return;
                }

                const geo = node.geometry;
                const pos = geo.attributes.position;
                const idx = geo.index;
                const count = idx ? idx.count : pos.count;
                const nm = new THREE.Matrix3().getNormalMatrix(node.matrixWorld);
                const a = new THREE.Vector3(), b = new THREE.Vector3(),
                      c = new THREE.Vector3();
                const ab = new THREE.Vector3(), ac = new THREE.Vector3(),
                      n = new THREE.Vector3(), mid = new THREE.Vector3();

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

                    ab.subVectors(b, a); ac.subVectors(c, a);
                    n.crossVectors(ab, ac).applyMatrix3(nm).normalize();
                    let lit = n.dot(light) * 0.5 + 0.5;
                    lit = Math.max(o.minLight, Math.min(o.maxLight, lit));
                    const step = Math.min(ramp.length - 1, Math.max(0,
                        Math.round(lit * (ramp.length - 1))));

                    mid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
                    tris.push({
                        depth: mid.distanceTo(camPos),
                        color: ramp[step], name: item.name,
                        p: this.grow([pa, pb, pc], this.SEAM)
                    });
                }
            });
        }

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
            const d = 'M' + pts.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
                                .join('L') + 'Z';
            const last = parts[parts.length - 1];
            if (last && last.color === t.color) { last.d += d; last.tris++; }
            else parts.push({ color: t.color, d, tris: 1, name: t.name });
        }
        return parts;
    },

    // Раздуть треугольник от центра: перекрыть шов с соседом того же цвета.
    //
    // Раздувается на долю СОБСТВЕННОГО размера, а не на постоянную величину.
    // Постоянная выворачивала длинные тонкие треугольники — веер, которым
    // залита поверхность воды, шёл «бабочкой» через всю чашу. Доля короткой
    // стороны безопасна для любой формы.
    grow(t, by) {
        const cx = (t[0].x + t[1].x + t[2].x) / 3;
        const cy = (t[0].y + t[1].y + t[2].y) / 3;
        const d = t.map(p => Math.hypot(p.x - cx, p.y - cy));
        const step = Math.min(by, Math.min(d[0], d[1], d[2]) * 0.06);
        return t.map((p, i) => {
            const len = d[i] || 1;
            return { x: p.x + (p.x - cx) / len * step,
                     y: p.y + (p.y - cy) / len * step };
        });
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
