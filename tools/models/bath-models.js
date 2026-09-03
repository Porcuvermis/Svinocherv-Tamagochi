// ============ МОДЕЛИ ВАННОЙ ============
// Процедурная геометрия для запекания (tools/bake-3d-core.js). Никаких
// внешних файлов моделей: geometry — это код, она весит ноль килобайт и
// правится там же, где всё остальное.
//
// Единица мира — примерно дециметр: ванна 17 × 7 × 6, чтобы числа читались.

const BATH_MODELS = {

    // ---------- ВАННА ----------
    // ТЕЛО ВРАЩЕНИЯ по профилю сечения, растянутое в овал. Не коробка с
    // вычтенной полостью: CSG в three.js нет, а вложенная оболочка не
    // работает — у наружной коробки есть верхняя грань, и она перекрывает
    // полость при любом порядке рисования. Проверено: чаша читалась
    // сплошным белым бруском.
    //
    // Профиль идёт от центра дна НАРУЖУ по внутренней стенке, перекатывается
    // через борт и спускается по наружной. Получается настоящий открытый
    // сосуд: верхней грани у него нет вовсе, внутренняя поверхность видна, а
    // борт имеет толщину и валик.
    tub(opts) {
        const o = Object.assign({ len: 17, wide: 7.4, deep: 5.2, corner: 2.6, seg: 13 },
                                opts || {});
        const R = o.wide / 2;                       // радиус до наружного борта
        const P = (x, y) => new THREE.Vector2(x * R, y);
        const profile = [
            P(0.00, -o.deep),          // центр дна
            P(0.58, -o.deep),
            P(0.80, -o.deep + 0.55),   // фаска дна: без неё дно втыкается в стенку
            P(0.865, -o.deep + 1.6),
            P(0.885, -1.1),            // внутренняя стенка
            P(0.905, -0.34),
            P(1.00, 0.0),              // валик борта
            P(1.055, -0.42),
            P(1.045, -2.4),            // наружная стенка
            P(1.00, -o.deep + 0.5),
            P(0.90, -o.deep),          // подошва
            P(0.66, -o.deep - 0.05)
        ];
        // Профиль ПРОТЯГИВАЕТСЯ по контуру со скруглёнными углами, а не
        // крутится вокруг оси. Кручение даёт круглое сечение, и растянутый
        // круг читается тазом: у ванны бока ПРЯМЫЕ, и скруглены только углы.
        const plan = BATH_MODELS.roundedPlan(o.len, o.wide, o.corner, o.seg);
        const g = new THREE.Group();
        g.add(new THREE.Mesh(BATH_MODELS.sweep(profile, plan, R)));
        // Дно чаши: тот же контур, смещённый внутрь ровно на вынос первой
        // точки профиля. Так дно попадает в стенку, а не рядом с ней.
        g.add(BATH_MODELS.flat(BATH_MODELS.fan(
            BATH_MODELS.inset(plan, R - profile[1].x), -o.deep, true)));
        // Ванна СТОИТ НА ПОЛУ. Модель строит её с бортом на нуле — это
        // удобный якорь для профиля, — но в комнате нулём является пол, и
        // без подъёма чаша оказывалась в него утопленной по самый борт.
        g.position.y = o.deep;
        return g;
    },

    // Поверхность воды: тот же контур чаши, смещённый внутрь на толщину
    // стенки. Пропорциональное ужатие сюда не годится — оно уводит углы:
    // прямоугольник торчал бы сквозь стенки, круг не лёг бы в углы.
    water(opts) {
        const o = Object.assign({ len: 17, wide: 7.4, deep: 5.2, level: -1.5,
                                  corner: 2.6, seg: 13, wall: 0.44 }, opts || {});
        const plan = BATH_MODELS.roundedPlan(o.len, o.wide, o.corner, o.seg);
        // Уровень задан ОТ БОРТА (число отрицательное), а борт стоит на
        // высоте deep над полом — как и сама ванна.
        return BATH_MODELS.flat(
            BATH_MODELS.fan(BATH_MODELS.inset(plan, o.wall),
                            o.deep + o.level, true));
    },

    // ---------- РАСКЛАДКА КОМНАТЫ ----------
    // Все числа мира в одном месте. Пол на нуле, ванна стоит на нём, стена
    // за ванной. Отсюда же берутся ЯКОРЯ — точки, которые запекание
    // проецирует в гнёзда игры: место крана, посадка червя, полка. Раньше
    // такие числа подбирались глазом и разъезжались с картинкой при каждой
    // её правке.
    LAYOUT: {
        tub:   { len: 13, wide: 6.4, deep: 5.2, corner: 2.2, seg: 11 },
        wallZ: -3.9,          // стена сразу за ванной
        // Комната нарочно с ЗАПАСОМ по краям: камера наезжает вписыванием
        // прямоугольника целиком (contain), и на общем плане в кадр лезет
        // всё, что вокруг. Стены ровно по кадру не хватало — сверху зияла
        // дыра в фон окна.
        roomW: 12,            // половина ширины комнаты
        roomH: 26,            // до верха стены
        floorFront: 15,       // докуда виден пол перед ванной
        // Уровень воды от борта. Мелкая ванна выглядит НЕ мелкой, а
        // недоналитой: смотрим сверху, и полоса сухой внутренней стенки
        // между водой и ближним бортом проецируется в широкое белое поле
        // на треть кадра. Полсантиметра до борта — и чаша читается полной.
        water: -0.5,
        shower: { x: -5.0, y: 12.4, z: -1.6, riser: 6.6 },
        // Смеситель ВЫШЕ борта на три единицы. На 6.6 его закрывал
        // дальний борт: смотрим сверху, и борт проецируется вверх.
        faucet: { x: -4.2, y: 8.4 },
        shelf:  { x: 4.3, y: 9.0, w: 4.6 }
    },

    // Якоря: точки МИРА, которые запекание переводит в координаты сцены.
    anchorPoints() {
        const L = BATH_MODELS.LAYOUT, T = L.tub;
        return {
            // Кран: тап по нему включает воду и начинает забег.
            faucet: { x: L.faucet.x, y: L.faucet.y, z: L.wallZ + 0.5 },
            // Лейка душа: из неё льётся на червя.
            showerHead: { x: L.shower.x, y: L.shower.y - 1.1, z: L.shower.z },
            // Мыло и мочалка на полке — их ТАЩАТ на червя.
            soap:  { x: L.shelf.x - 1.2, y: L.shelf.y + 0.7, z: L.wallZ + 1.1 },
            cloth: { x: L.shelf.x + 1.5, y: L.shelf.y + 0.7, z: L.wallZ + 1.1 },
            // Червь лежит в воде, ближе к дальнему борту: спереди в финале
            // всплывает хвост, и место ему надо оставить.
            // Червь сидит ВЫШЕ уровня воды на полтора корпуса: в финале
            // работает морда — открытый рот ловит струю, — и утопить её по
            // самые уши значит выбросить весь финал.
            worm: { x: 0, y: T.deep + L.water + 1.7, z: -0.9 },
            // Хвост в финале всплывает У БЛИЖНЕГО БОРТА И ЛЕВЕЕ головы: между
            // ним и ртом должна остаться дуга, по которой летит струя. Стоял
            // он ровно под головой — лететь было некуда, весь финал сводился
            // к попаданию в упор.
            tail: { x: -2.4, y: T.deep + L.water, z: 0.1 },
            // Углы борта: по ним игра знает, где чаша, не повторяя чисел.
            rimL: { x: -T.len / 2, y: T.deep, z: 0 },
            rimR: { x: T.len / 2, y: T.deep, z: 0 },
            rimFront: { x: 0, y: T.deep, z: T.wide / 2 }
        };
    },

    // Сетка швов кафеля ОТРЕЗКАМИ В МИРЕ. Не геометрией: вдавленные швы
    // стоили бы тысяч треугольников. Не двумерной сеткой поверх готовой
    // картинки: между четырьмя углами проекции плоскости honest-интерполяция
    // не линейная, а проективная, и «на глаз» она разъедется. Отрезки
    // проецируются той же камерой, что и всё остальное, — и ложатся точно.
    tileLines(step) {
        const L = BATH_MODELS.LAYOUT, W = L.roomW, S = step || 1.7;
        const out = [];
        for (let x = -W; x <= W + 0.01; x += S)
            out.push([{ x, y: 0, z: L.wallZ }, { x, y: L.roomH, z: L.wallZ }]);
        for (let y = 0; y <= L.roomH + 0.01; y += S)
            out.push([{ x: -W, y, z: L.wallZ }, { x: W, y, z: L.wallZ }]);
        return out;
    },

    // ---------- КОМНАТА ----------
    // Пол и стена — РАЗНЫЕ предметы: у них разные рампы палитры. Одной
    // рампой на двоих комната выходила ровно белой, и ванна в ней терялась:
    // отделение по светлоте — основа всей графики игры.
    //
    // Кафель НЕ геометрией: сетка швов на плоской стене рисуется в 2д поверх
    // запечённого. Плоскость в перспективе и так правильная, а вдавленные
    // швы стоили бы тысяч треугольников ни за что.
    floor() {
        const L = BATH_MODELS.LAYOUT, W = L.roomW;
        // Одной плитой: порядок между предметами задан списком, и дробить
        // пол на ячейки ради сортировки больше незачем.
        //
        // Задняя кромка заходит ЗА стену на полторы единицы. Сведённые
        // встык, пол и стена оставляли по стыку светлую нить от сглаживания
        // — ту же самую, из-за которой на кухне действует правило
        // «стыки обязаны перекрываться».
        return BATH_MODELS.quad(
            [{ x: -W, y: 0, z: L.wallZ - 1.5 }, { x: W, y: 0, z: L.wallZ - 1.5 },
             { x: W, y: 0, z: L.floorFront }, { x: -W, y: 0, z: L.floorFront }]);
    },

    wall() {
        const L = BATH_MODELS.LAYOUT, W = L.roomW;
        // Стена плоская и стоит целиком дальше всего — дробить её незачем,
        // и одним путём она дешевле.
        return BATH_MODELS.quad(
            [{ x: -W, y: L.roomH, z: L.wallZ }, { x: W, y: L.roomH, z: L.wallZ },
             { x: W, y: 0, z: L.wallZ }, { x: -W, y: 0, z: L.wallZ }]);
    },

    // Плоский четырёхугольник с запомненным контуром: выйдет одним путём.
    quad(pts) {
        const v = [], idx = [0, 1, 2, 0, 2, 3];
        for (const p of pts) v.push(p.x, p.y, p.z);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        geo.userData.outline = pts.map(p => ({ x: p.x, y: p.y, z: p.z }));
        return BATH_MODELS.flat(geo);
    },

    // Тот же четырёхугольник, но РАЗБИТЫЙ на сетку. Нужен для больших
    // плоскостей — пола и стены.
    //
    // Порядок рисования у запекания — по глубине ЦЕНТРА фигуры, и у плиты
    // пола в десять единиц глубиной один центр ничего не решает: пол уходил
    // от стены до переднего края кадра, его середина оказывалась ближе
    // ванны, и он рисовался ПОВЕРХ неё. Разбитый на ячейки, он сортируется
    // с ванной вперемешку, как и должен.
    //
    // Швов от этого не возникает: у плоскости одна нормаль, значит все
    // ячейки одного цвета, а подряд идущие ячейки одного цвета запекание
    // сливает в один путь.
    quadGrid(pts, nu, nv) {
        const g = new THREE.Group();
        const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t,
                                     y: a.y + (b.y - a.y) * t,
                                     z: a.z + (b.z - a.z) * t });
        for (let i = 0; i < nu; i++) {
            for (let j = 0; j < nv; j++) {
                const u0 = i / nu, u1 = (i + 1) / nu;
                const v0 = j / nv, v1 = (j + 1) / nv;
                // Билинейная выборка по четырём углам исходной плиты.
                const at = (u, v) => lerp(lerp(pts[0], pts[1], u),
                                          lerp(pts[3], pts[2], u), v);
                g.add(BATH_MODELS.quad([at(u0, v0), at(u1, v0),
                                        at(u1, v1), at(u0, v1)]));
            }
        }
        return g;
    },

    // ---------- ДУШ ----------
    // Стояк по стене, колено и раструб лейки. Труба — протяжка окружности
    // по кривой: у three.js это TubeGeometry, и вручную её строить незачем.
    shower() {
        const L = BATH_MODELS.LAYOUT, S = L.shower;
        const g = new THREE.Group();
        const path = new THREE.CatmullRomCurve3([
            new THREE.Vector3(S.x, S.riser, L.wallZ + 0.35),
            new THREE.Vector3(S.x, S.y - 0.6, L.wallZ + 0.35),
            new THREE.Vector3(S.x, S.y + 0.9, L.wallZ + 1.0),
            new THREE.Vector3(S.x + 1.1, S.y + 1.2, S.z + 0.4),
            new THREE.Vector3(S.x + 1.9, S.y + 0.5, S.z)
        ], false, 'catmullrom', 0.4);
        g.add(new THREE.Mesh(new THREE.TubeGeometry(path, 26, 0.26, 8, false)));
        // Раструб: усечённый конус, широким концом ВНИЗ.
        const head = new THREE.Mesh(
            new THREE.CylinderGeometry(0.44, 1.15, 1.1, 16, 1, false));
        head.position.set(S.x + 1.9, S.y - 0.4, S.z);
        g.add(head);
        // Донце лейки — плоский диск, из него и льётся.
        const face = new THREE.Mesh(new THREE.CircleGeometry(1.15, 16));
        face.geometry.rotateX(-Math.PI / 2);
        face.position.set(S.x + 1.9, S.y - 0.96, S.z);
        g.add(face);
        return g;
    },

    // ---------- СМЕСИТЕЛЬ ----------
    faucet() {
        const L = BATH_MODELS.LAYOUT, F = L.faucet;
        const g = new THREE.Group();
        // Розетка на стене.
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.5, 14));
        base.rotation.x = Math.PI / 2;
        base.position.set(F.x, F.y, L.wallZ + 0.24);
        g.add(base);
        // Излив: короткое колено вниз, как у ванной, а не гусак кухни.
        const path = new THREE.CatmullRomCurve3([
            new THREE.Vector3(F.x, F.y, L.wallZ + 0.4),
            new THREE.Vector3(F.x, F.y - 0.1, L.wallZ + 1.5),
            new THREE.Vector3(F.x, F.y - 0.9, L.wallZ + 2.2)
        ], false, 'catmullrom', 0.4);
        g.add(new THREE.Mesh(new THREE.TubeGeometry(path, 14, 0.3, 8, false)));
        // Рычаг: один, как у современного смесителя.
        const lever = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 1.5));
        lever.position.set(F.x - 0.1, F.y + 0.8, L.wallZ + 0.9);
        lever.rotation.x = -0.24;
        g.add(lever);
        return g;
    },

    // ---------- ПОЛКА ----------
    shelf() {
        const L = BATH_MODELS.LAYOUT, S = L.shelf;
        const g = new THREE.Group();
        const slab = new THREE.Mesh(new THREE.BoxGeometry(S.w, 0.34, 1.9));
        slab.position.set(S.x, S.y, L.wallZ + 1.05);
        g.add(slab);
        // Кронштейны: без них полка приклеена к стене.
        for (const dx of [-S.w / 2 + 0.5, S.w / 2 - 0.5]) {
            const br = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.9));
            br.position.set(S.x + dx, S.y - 0.5, L.wallZ + 0.55);
            g.add(br);
        }
        return g;
    },

    // ---------- МЫЛО И МОЧАЛКА ----------
    // Оба — скруглённые бруски, но разной формы и пропорции: на полке их
    // разводит силуэт, а не только цвет.
    soap() {
        const a = BATH_MODELS.anchorPoints().soap;
        const m = new THREE.Mesh(BATH_MODELS.roundedBox(2.3, 0.75, 1.35, 0.34, 3));
        m.position.set(a.x, a.y - 0.3, a.z);
        m.rotation.y = 0.22;
        return m;
    },

    cloth() {
        const a = BATH_MODELS.anchorPoints().cloth;
        // Губка ВЫШЕ и короче мыла: мятый кубик против плоского бруска.
        const m = new THREE.Mesh(BATH_MODELS.roundedBox(1.8, 1.25, 1.5, 0.42, 3));
        m.position.set(a.x, a.y - 0.1, a.z);
        m.rotation.y = -0.3;
        return m;
    },

    // Контур, смещённый внутрь на заданную величину. Им ставятся вода и дно
    // чаши: они обязаны попадать РОВНО на стенку, а не «примерно туда».
    inset(plan, by) {
        return plan.map(q => ({ x: q.x - q.nx * by, z: q.z - q.nz * by,
                                nx: q.nx, nz: q.nz, r: q.r }));
    },

    // Заливка контура веером от центра: дно чаши и поверхность воды.
    // Протяжка сама дно не закрывает — у неё профиль начинается НА контуре,
    // а не в центре, и середина остаётся сквозной дырой.
    //
    // up === true — поверхность смотрит вверх (вода, дно изнутри).
    fan(plan, y, up) {
        const v = [0, y, 0], idx = [];
        for (const q of plan) v.push(q.x, y, q.z);
        for (let i = 1; i <= plan.length; i++) {
            const j = i === plan.length ? 1 : i + 1;
            if (up) idx.push(0, j, i); else idx.push(0, i, j);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        // Контур запоминается: запекание выведет плоскость ОДНИМ путём, а не
        // веером треугольников со швами (см. bake-3d-core.js).
        geo.userData.outline = plan.map(q => ({ x: q.x, y, z: q.z }));
        return geo;
    },

    // ---------- ПРОТЯЖКА ПРОФИЛЯ ПО КОНТУРУ ----------
    // Обобщение тела вращения: вместо окружности профиль ведут по
    // произвольному замкнутому контуру. Этим и отличается ванна от таза.
    //
    // profile — точки сечения (x = вынос наружу от контура, y = высота),
    // plan — контур в плане с наружной нормалью в каждой точке,
    // R — на какой вынос профиля рассчитан контур (профиль нормируется).
    sweep(profile, plan, R) {
        const v = [], idx = [];
        const N = plan.length, M = profile.length;
        for (let i = 0; i < N; i++) {
            const q = plan[i];
            for (let j = 0; j < M; j++) {
                const pr = profile[j];
                // Вынос откладывается ПО НОРМАЛИ контура, и контур проходит
                // по НАРУЖНОМУ борту: точка профиля с выносом меньше R лежит
                // внутрь от него на (R - x).
                //
                // Стояло умножение на радиус скругления угла — то есть на
                // произвольное число, никак не связанное с профилем. Стенка
                // чаши и поверхность воды вставали в разные места, и между
                // ними зияла дыра.
                const off = pr.x - R;
                v.push(q.x + q.nx * off, pr.y, q.z + q.nz * off);
            }
        }
        for (let i = 0; i < N; i++) {
            const i2 = (i + 1) % N;
            for (let j = 0; j < M - 1; j++) {
                const a = i * M + j, b = i * M + j + 1;
                const c = i2 * M + j, d = i2 * M + j + 1;
                idx.push(a, b, d, a, d, c);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        return geo;
    },

    // Контур в плане: прямоугольник со скруглёнными углами. Возвращает точки
    // с наружной нормалью — по ней протяжка и откладывает вынос профиля.
    roundedPlan(len, wide, corner, segPerCorner) {
        const hx = len / 2 - corner, hz = wide / 2 - corner;
        const pts = [];
        // Четыре угла, каждый — дуга; между ними прямые участки получаются
        // сами, потому что соседние точки дуг лежат на одной нормали.
        const corners = [[hx, hz, 0], [-hx, hz, Math.PI / 2],
                         [-hx, -hz, Math.PI], [hx, -hz, Math.PI * 1.5]];
        for (const [cx, cz, a0] of corners) {
            for (let k = 0; k <= segPerCorner; k++) {
                const a = a0 + (k / segPerCorner) * (Math.PI / 2);
                const nx = Math.cos(a), nz = Math.sin(a);
                pts.push({ x: cx + nx * corner, z: cz + nz * corner,
                           nx, nz, r: corner });
            }
        }
        return pts;
    },

    // Меш из плоской геометрии: контур переносится на сам меш, потому что
    // запекание спрашивает его именно там.
    flat(geo) {
        const m = new THREE.Mesh(geo);
        m.userData.outline = geo.userData.outline;
        return m;
    },

    // ---------- ВСПОМОГАТЕЛЬНОЕ ----------
    // Скруглённая коробка: сегменты по углам, а не фаска в одну грань.
    // Одна фаска на угол читается срезом, а не скруглением.
    roundedBox(w, h, d, r, seg) {
        const shape = new THREE.Shape();
        const hw = w / 2 - r, hd = d / 2 - r;
        shape.moveTo(-hw, -hd - r);
        shape.lineTo(hw, -hd - r);
        shape.absarc(hw, -hd, r, -Math.PI / 2, 0, false);
        shape.lineTo(hw + r, hd);
        shape.absarc(hw, hd, r, 0, Math.PI / 2, false);
        shape.lineTo(-hw, hd + r);
        shape.absarc(-hw, hd, r, Math.PI / 2, Math.PI, false);
        shape.lineTo(-hw - r, -hd);
        shape.absarc(-hw, -hd, r, Math.PI, Math.PI * 1.5, false);
        const geo = new THREE.ExtrudeGeometry(shape, {
            depth: h, bevelEnabled: true, bevelThickness: 0.18,
            bevelSize: 0.18, bevelSegments: 2, curveSegments: seg || 4
        });
        // Выдавливание идёт по Z; разворачиваем, чтобы высота была по Y.
        geo.rotateX(-Math.PI / 2);
        // Центрируем по высоте. Стояло +h/2, то есть коробка уезжала вверх
        // на всю свою высоту, и вода оказывалась НИЖЕ ванны.
        geo.translate(0, -h / 2, 0);
        return geo;
    },

    // Вывернуть нормали и обход: нужна внутренняя сторона оболочки.
    flip(geo) {
        const idx = geo.index;
        if (idx) {
            for (let i = 0; i < idx.count; i += 3) {
                const t = idx.getX(i);
                idx.setX(i, idx.getX(i + 2));
                idx.setX(i + 2, t);
            }
            idx.needsUpdate = true;
        }
        geo.computeVertexNormals();
        return geo;
    }
};
