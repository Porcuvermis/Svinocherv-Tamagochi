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
        return g;
    },

    // Поверхность воды: тот же контур, что у чаши, залитый веером
    // треугольников от центра. Прямоугольная плоскость торчала бы углами
    // сквозь стенки, круглая не легла бы в углы.
    // Поверхность воды: тот же контур чаши, смещённый внутрь на толщину
    // стенки. Пропорциональное ужатие сюда не годится — оно уводит углы.
    water(opts) {
        const o = Object.assign({ len: 17, wide: 7.4, deep: 5.2, level: -1.5,
                                  corner: 2.6, seg: 13, wall: 0.44 }, opts || {});
        const plan = BATH_MODELS.roundedPlan(o.len, o.wide, o.corner, o.seg);
        return BATH_MODELS.flat(
            BATH_MODELS.fan(BATH_MODELS.inset(plan, o.wall), o.level, true));
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
