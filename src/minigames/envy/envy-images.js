// ================= ПУЛ ЧУЖИХ ОБРАЗОВ (мини-игра «Зависть») =================
// То, чему завидуют: кошка, собака, машина, мешок денег, пачка сигарет.
// Дальше пул просто дополняется — добавить образ значит дописать одну запись
// в ENVY_IMAGES, больше ничего трогать не нужно.
//
// Каждый образ — НАБОР ПУТЕЙ, а не картинка. Это принципиально: из пути
// можно получить не только заливку, но и раздутие контура (обводка толщиной
// 2d плюс заливка дают ровно смещённый наружу силуэт со скруглёнными
// стыками). На этом стоит вся упаковка полотна: окантовка стикера — не
// украшение, а та величина, которой образ добирает до своей ячейки, чтобы
// между наклейками не осталось щелей.
//
// Правило для новых образов: силуэт должен плотно набивать свой круг.
// Не «одинаковый габарит», а одинаковая заполненность: тонкая длинная форма
// (сигарета, копьё) потребует такой окантовки, что превратится в плашку.
// Поэтому пачка сигарет, а не сигарета; машина в три четверти, а не строго
// сбоку. Отношение вписанного круга к описанному желательно не ниже 0.45 —
// измеряется само, см. ENVY_IMAGE_POOL.measure().

// Каждый примитив — СВОЙ Path2D. Иначе arc/ellipse дотягивает линию от
// текущей точки к началу дуги, и глаза с носом слипаются в загогулину: так
// первая версия собаки и машины превратилась в кляксу.
const circle = (x, y, rx, ry, rot) => {
    const p = new Path2D();
    p.ellipse(x, y, rx, ry === undefined ? rx : ry, rot || 0, 0, Math.PI * 2);
    return p;
};
const poly = (...pts) => {
    const p = new Path2D();
    pts.forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y));
    p.closePath();
    return p;
};
const bar = (x, y, w, h) => { const p = new Path2D(); p.rect(x, y, w, h); return p; };

const ENVY_IMAGES = [
    {
        key: 'cat',
        title: 'кошка',
        // Голова анфас. Уши намеренно широкие у основания — узкие давали бы
        // тонкие отростки, которые окантовка раздувает в бесформенные рожки.
        silhouette: () => [
            poly([0.255, 0.50], [0.30, 0.16], [0.52, 0.38]),
            poly([0.745, 0.50], [0.70, 0.16], [0.48, 0.38]),
            circle(0.5, 0.56, 0.315, 0.285)
        ],
        details: () => [
            circle(0.395, 0.525, 0.048, 0.065),
            circle(0.605, 0.525, 0.048, 0.065),
            poly([0.45, 0.625], [0.55, 0.625], [0.5, 0.69]),
            bar(0.145, 0.60, 0.155, 0.021), bar(0.145, 0.665, 0.155, 0.021),
            bar(0.70, 0.60, 0.155, 0.021), bar(0.70, 0.665, 0.155, 0.021)
        ]
    },
    {
        key: 'dog',
        title: 'собака',
        // Висячие уши по бокам добирают силуэт до круга — пёс ложится в
        // полотно плотнее кошки, у которой уши торчат вверх.
        silhouette: () => [
            circle(0.19, 0.55, 0.125, 0.245, 0.15),
            circle(0.81, 0.55, 0.125, 0.245, -0.15),
            circle(0.5, 0.47, 0.27, 0.255),
            circle(0.5, 0.685, 0.205, 0.165)
        ],
        details: () => [
            circle(0.405, 0.44, 0.043, 0.052),
            circle(0.595, 0.44, 0.043, 0.052),
            circle(0.5, 0.625, 0.065, 0.048),
            bar(0.487, 0.655, 0.026, 0.075),
            poly([0.40, 0.735], [0.60, 0.735], [0.60, 0.757], [0.40, 0.757])
        ]
    },
    {
        key: 'car',
        title: 'машина',
        // Кузов приземистый и с большими колёсами: вытянутый силуэт плохо
        // набивает круг, и окантовка вокруг него расползается в плашку.
        silhouette: () => [
            (() => {
                const p = new Path2D();
                p.moveTo(0.10, 0.70);
                p.lineTo(0.115, 0.545);
                p.quadraticCurveTo(0.145, 0.495, 0.235, 0.475);
                p.lineTo(0.325, 0.295);
                p.quadraticCurveTo(0.50, 0.245, 0.675, 0.295);
                p.lineTo(0.765, 0.475);
                p.quadraticCurveTo(0.855, 0.495, 0.885, 0.545);
                p.lineTo(0.90, 0.70);
                p.closePath();
                return p;
            })(),
            circle(0.275, 0.715, 0.125),
            circle(0.725, 0.715, 0.125)
        ],
        details: () => [
            poly([0.355, 0.325], [0.485, 0.325], [0.485, 0.455], [0.295, 0.455]),
            poly([0.515, 0.325], [0.645, 0.325], [0.705, 0.455], [0.515, 0.455]),
            circle(0.275, 0.715, 0.052),
            circle(0.725, 0.715, 0.052)
        ]
    },
    {
        key: 'money',
        title: 'мешок денег',
        silhouette: () => [
            (() => {
                const p = new Path2D();
                p.moveTo(0.35, 0.37);
                p.bezierCurveTo(0.09, 0.53, 0.11, 0.87, 0.50, 0.87);
                p.bezierCurveTo(0.89, 0.87, 0.91, 0.53, 0.65, 0.37);
                p.closePath();
                return p;
            })(),
            poly([0.335, 0.19], [0.665, 0.19], [0.645, 0.39], [0.355, 0.39])
        ],
        details: () => [
            bar(0.478, 0.475, 0.044, 0.315),
            (() => {
                // знак валюты одной лентой, без слипающихся дуг
                const p = new Path2D();
                p.moveTo(0.615, 0.575);
                p.lineTo(0.545, 0.575);
                p.quadraticCurveTo(0.545, 0.535, 0.50, 0.535);
                p.quadraticCurveTo(0.452, 0.535, 0.452, 0.578);
                p.quadraticCurveTo(0.452, 0.607, 0.523, 0.622);
                p.quadraticCurveTo(0.625, 0.643, 0.625, 0.718);
                p.quadraticCurveTo(0.625, 0.795, 0.50, 0.795);
                p.quadraticCurveTo(0.378, 0.795, 0.378, 0.705);
                p.lineTo(0.452, 0.705);
                p.quadraticCurveTo(0.452, 0.737, 0.50, 0.737);
                p.quadraticCurveTo(0.551, 0.737, 0.551, 0.702);
                p.quadraticCurveTo(0.551, 0.673, 0.478, 0.657);
                p.quadraticCurveTo(0.378, 0.635, 0.378, 0.567);
                p.quadraticCurveTo(0.378, 0.495, 0.50, 0.495);
                p.quadraticCurveTo(0.615, 0.495, 0.615, 0.575);
                p.closePath();
                return p;
            })()
        ]
    },
    {
        key: 'smokes',
        title: 'пачка сигарет',
        // Именно пачка, а не сигарета: коробка почти квадратная и потому
        // ложится в полотно без разросшейся окантовки.
        silhouette: () => [
            bar(0.335, 0.175, 0.095, 0.20),
            bar(0.4525, 0.135, 0.095, 0.24),
            bar(0.57, 0.205, 0.095, 0.17),
            poly([0.245, 0.375], [0.755, 0.375], [0.755, 0.85], [0.245, 0.85]),
            poly([0.245, 0.395], [0.755, 0.395], [0.79, 0.285], [0.28, 0.285])
        ],
        details: () => [
            bar(0.335, 0.175, 0.095, 0.06),
            bar(0.4525, 0.135, 0.095, 0.06),
            bar(0.57, 0.205, 0.095, 0.06),
            bar(0.245, 0.395, 0.51, 0.028),
            bar(0.325, 0.545, 0.35, 0.085)
        ]
    }
];

// ---------- ГЕОМЕТРИЯ НАКЛЕЙКИ ----------
// Наклейка — это КРУГ, из которого местами торчит силуэт. Круг и отвечает за
// упаковку: он один накрывает ячейку, и полотно смыкается по построению.
//
// Почему именно круг, а не просто раздутый силуэт: чтобы одинаковые фигуры
// покрыли плоскость без щелей, их суммарная площадь минимум на 21% больше
// поля — и достигается этот минимум только кругами. Первая версия раздувала
// силуэт равномерно, наклейки выходили некруглыми, и наползание намеряло 37%
// вместо обещанных десяти. Круг с выступами держится у теоретического
// предела, а выступы (уши, колёса, горловина мешка) оставляют наклейке
// характер формы.
const ENVY_CORE = 0.40;    // радиус круга наклейки, в долях спрайта
const ENVY_BULGE = 1.18;   // насколько силуэту позволено торчать за круг
const ENVY_RIM = 0.022;    // белый кант поверх всего, в долях спрайта

// Яркости в текстуре. Цвет наклейке даёт material.color, а текстура несёт
// только светлоту: белый кант, тело в цвет, тёмный рисунок. Так одна
// текстура работает с любым цветом из палитры.
const ENVY_INK = {
    rim: '#ffffff',
    body: '#d2d2d2',
    art: '#4a4a4a'
};

const ENVY_IMAGE_POOL = {
    ready: false,
    images: [],

    // Во сколько раз габарит наклейки больше радиуса её ячейки. Круг накрывает
    // ячейку ровно, а сверх него торчат выступы силуэта и белый кант — вот на
    // это поле по краям полотна и закладывается.
    span: (ENVY_CORE * ENVY_BULGE + ENVY_RIM) / ENVY_CORE,

    // Готовит текстуры и обмеры один раз за запуск.
    build(THREE) {
        if (this.ready) return this.images;

        this.images = ENVY_IMAGES.map(def => {
            const paths = def.silhouette();
            const details = def.details ? def.details() : [];
            const m = this.measure(paths);

            const canvas = this.render(paths, details, m);
            const texture = new THREE.CanvasTexture(canvas);
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = false;

            return {
                key: def.key,
                title: def.title,
                core: ENVY_CORE,          // им наклейка и накрывает свою ячейку
                inRadius: m.inRadius,
                outRadius: m.outRadius,
                texture,
                mask: this.maskOf(canvas)
            };
        });

        this.ready = true;
        return this.images;
    },

    // Круг плюс силуэт, нарисованные одним цветом, дают объединение даром —
    // никаких операций над контурами не нужно. Белый кант получается тем же
    // приёмом слоем ниже: обводка толщиной 2*ENVY_RIM со скруглёнными стыками
    // плюс заливка — это ровно контур, смещённый наружу.
    render(paths, details, m) {
        const S = 256;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = S;
        const ctx = canvas.getContext('2d');
        ctx.scale(S, S);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Силуэт вписывается так, чтобы его дальняя точка торчала за круг
        // ровно на ENVY_BULGE, а центр вписанного круга совпал с центром
        // спрайта: у мешка денег вся масса внизу, и без этого сдвига он сел бы
        // в ячейку боком.
        const k = (ENVY_CORE * ENVY_BULGE) / m.outRadius;
        const put = (fn) => {
            ctx.save();
            ctx.translate(0.5, 0.5);
            ctx.scale(k, k);
            ctx.translate(-0.5 + m.offsetX, -0.5 + m.offsetY);
            fn();
            ctx.restore();
        };

        const disc = new Path2D();
        disc.arc(0.5, 0.5, ENVY_CORE, 0, Math.PI * 2);

        const layer = (color, grow) => {
            ctx.fillStyle = color;
            ctx.strokeStyle = color;
            if (grow > 0) { ctx.lineWidth = 2 * grow; ctx.stroke(disc); }
            ctx.fill(disc);
            put(() => {
                for (const p of paths) {
                    if (grow > 0) { ctx.lineWidth = 2 * grow / k; ctx.stroke(p); }
                    ctx.fill(p);
                }
            });
        };

        layer(ENVY_INK.rim, ENVY_RIM);
        layer(ENVY_INK.body, 0);

        ctx.fillStyle = ENVY_INK.art;
        put(() => { for (const p of details) ctx.fill(p); });

        return canvas;
    },

    // Альфа-маска для попадания пальцем: по ней ловится реальный силуэт
    // наклейки, а не квадрат спрайта. Мелкой сетки хватает — палец толще.
    maskOf(canvas) {
        const N = 48;
        const small = document.createElement('canvas');
        small.width = small.height = N;
        const ctx = small.getContext('2d');
        ctx.drawImage(canvas, 0, 0, N, N);
        const data = ctx.getImageData(0, 0, N, N).data;
        const bits = new Uint8Array(N * N);
        for (let i = 0; i < N * N; i++) bits[i] = data[i * 4 + 3] > 110 ? 1 : 0;
        return { size: N, bits };
    },

    // Обмер силуэта по растру: где у него самый большой вписанный круг,
    // насколько он велик и как далеко торчит самая дальняя точка.
    //
    // Центр вписанного круга — это и есть точка, за которую наклейку надо
    // сажать в ячейку: у мешка денег вся масса внизу, и если считать от
    // середины квадрата, вписанный круг выходит вдвое меньше настоящего, а
    // значит окантовки потребуется вдвое больше. Поэтому образ потом
    // сдвигается так, чтобы этот центр попал в середину спрайта.
    measure(paths) {
        const N = 128;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = N;
        const ctx = canvas.getContext('2d');
        ctx.scale(N, N);
        ctx.fillStyle = '#fff';
        for (const p of paths) ctx.fill(p);
        const data = ctx.getImageData(0, 0, N, N).data;

        // Расстояние до ближайшего фона — двухпроходный chamfer. Точнее
        // перебора окружностей и не зависит от того, звёздчатая фигура или нет.
        const INF = 1e6, D1 = 1, D2 = Math.SQRT2;
        const dist = new Float32Array(N * N);
        for (let i = 0; i < N * N; i++) dist[i] = data[i * 4 + 3] > 110 ? INF : 0;

        const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N) ? 0 : dist[y * N + x];
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                const i = y * N + x;
                if (dist[i] === 0) continue;
                dist[i] = Math.min(dist[i], at(x - 1, y) + D1, at(x, y - 1) + D1,
                    at(x - 1, y - 1) + D2, at(x + 1, y - 1) + D2);
            }
        }
        for (let y = N - 1; y >= 0; y--) {
            for (let x = N - 1; x >= 0; x--) {
                const i = y * N + x;
                if (dist[i] === 0) continue;
                dist[i] = Math.min(dist[i], at(x + 1, y) + D1, at(x, y + 1) + D1,
                    at(x + 1, y + 1) + D2, at(x - 1, y + 1) + D2);
            }
        }

        let best = 0, bx = N / 2, by = N / 2;
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                const d = dist[y * N + x];
                if (d > best && d < INF) { best = d; bx = x + 0.5; by = y + 0.5; }
            }
        }

        const cx = bx / N, cy = by / N;
        let outRadius = 0;
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                if (data[(y * N + x) * 4 + 3] <= 110) continue;
                outRadius = Math.max(outRadius, Math.hypot((x + 0.5) / N - cx, (y + 0.5) / N - cy));
            }
        }

        return {
            inRadius: best / N,
            outRadius: outRadius || 0.5,
            offsetX: 0.5 - cx,      // на столько сдвигаем образ при отрисовке
            offsetY: 0.5 - cy
        };
    },

};

if (typeof window !== 'undefined') {
    window.ENVY_IMAGES = ENVY_IMAGES;
    window.ENVY_IMAGE_POOL = ENVY_IMAGE_POOL;
}
