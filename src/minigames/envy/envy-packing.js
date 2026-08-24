// ================= УПАКОВКА ПОЛОТНА (мини-игра «Зависть») =================
// Задача: разложить полсотни наклеек так, чтобы между ними не осталось щелей,
// но и наползали они друг на друга по минимуму.
//
// Решение в две ступени.
//
// 1. МЕСТА. Точки ставятся по сотовой решётке с разбросом, а потом
//    «отпускаются» релаксацией Ллойда: каждая точка переезжает в центр
//    тяжести своей ячейки Вороного, и так пару раз. Чистая решётка читается
//    глазом как решётка — облако из одинаковых наклеек выглядело бы
//    расчерченным; чистый же случай даёт сгустки и проплешины. Ллойд —
//    середина: точки перестают стоять рядами, но остаются равномерными.
//
// 2. ЯЧЕЙКИ. По этим точкам строится диаграмма Вороного, обрезанная полем.
//    Ячейки замощают поле без остатка — значит, если каждая наклейка накроет
//    свою ячейку, щелей в полотне не будет по построению, а не по удаче.
//    Наклейке для этого сообщается радиус её ячейки, а добирает она его
//    окантовкой (см. envy-images.js).
//
// Диаграмма считается перебором по полуплоскостям: для полусотни точек это
// пара тысяч отсечений многоугольника, доли миллисекунды. Готовая библиотека
// ради этого в проект не поедет — она весит больше, чем весь этот файл.

const ENVY_PACKING = {

    // Сотовая решётка с разбросом. Нечётные ряды короче на точку и потому
    // сдвинуты на полшага — соты получаются сами.
    seed(cols, rows, cell, rowStep, jitter) {
        const pts = [];
        for (let r = 0; r < rows; r++) {
            const count = (r % 2) ? cols - 1 : cols;
            for (let c = 0; c < count; c++) {
                pts.push({
                    x: (c - (count - 1) / 2) * cell + (Math.random() - 0.5) * 2 * jitter,
                    y: (r - (rows - 1) / 2) * rowStep + (Math.random() - 0.5) * 2 * jitter
                });
            }
        }
        return pts;
    },

    // Полуплоскость «ближе к a, чем к b»: серединный перпендикуляр отрезка ab.
    // Отсечение по Сазерленду–Ходжману.
    clipHalf(polygon, a, b) {
        const nx = b.x - a.x, ny = b.y - a.y;
        const limit = (b.x * b.x + b.y * b.y - a.x * a.x - a.y * a.y) / 2;
        const inside = (p) => p.x * nx + p.y * ny <= limit;

        const out = [];
        for (let i = 0; i < polygon.length; i++) {
            const cur = polygon[i];
            const prev = polygon[(i + polygon.length - 1) % polygon.length];
            const curIn = inside(cur), prevIn = inside(prev);

            if (curIn !== prevIn) {
                const dx = cur.x - prev.x, dy = cur.y - prev.y;
                const denom = dx * nx + dy * ny;
                if (Math.abs(denom) > 1e-12) {
                    const t = (limit - (prev.x * nx + prev.y * ny)) / denom;
                    out.push({ x: prev.x + dx * t, y: prev.y + dy * t });
                }
            }
            if (curIn) out.push(cur);
        }
        return out;
    },

    cellOf(points, index, bounds) {
        let poly = [
            { x: bounds.x0, y: bounds.y0 },
            { x: bounds.x1, y: bounds.y0 },
            { x: bounds.x1, y: bounds.y1 },
            { x: bounds.x0, y: bounds.y1 }
        ];
        const a = points[index];
        for (let j = 0; j < points.length && poly.length; j++) {
            if (j !== index) poly = this.clipHalf(poly, a, points[j]);
        }
        return poly;
    },

    centroid(poly, fallback) {
        let area = 0, cx = 0, cy = 0;
        for (let i = 0; i < poly.length; i++) {
            const p = poly[i], q = poly[(i + 1) % poly.length];
            const cross = p.x * q.y - q.x * p.y;
            area += cross;
            cx += (p.x + q.x) * cross;
            cy += (p.y + q.y) * cross;
        }
        if (Math.abs(area) < 1e-9) return fallback;
        return { x: cx / (3 * area), y: cy / (3 * area) };
    },

    // Двигаются только реальные точки; призраки стоят на месте и лишь
    // участвуют в построении ячеек.
    relax(points, bounds, iterations, ghosts) {
        const fixed = ghosts || [];
        for (let it = 0; it < iterations; it++) {
            const all = points.concat(fixed);
            const moved = points.map((p, i) => this.centroid(this.cellOf(all, i, bounds), p));
            for (let i = 0; i < points.length; i++) points[i] = moved[i];
        }
        return points;
    },

    // Радиус ячейки — расстояние до самой дальней её вершины. Именно его
    // наклейка обязана накрыть: накроешь дальнюю вершину — накроешь всю
    // выпуклую ячейку.
    radiusOf(point, poly) {
        let r = 0;
        for (const v of poly) r = Math.max(r, Math.hypot(v.x - point.x, v.y - point.y));
        return r;
    },

    // Точки, их ячейки и радиусы — всё, что нужно для раскладки облака.
    //
    // Вокруг поля ставится кольцо запасных точек, а в облако идут только
    // внутренние. Без него краевые ячейки обрезались прямоугольником поля и
    // выходили вдвое крупнее прочих: одна и та же наклейка попадалась то
    // крохотной, то огромной, а самые большие переставали помещаться в ореол
    // под пальцем. Теперь каждая ячейка ограничена соседями со всех сторон.
    build(cols, rows, cell, rowStep, jitter, bounds, iterations) {
        const ext = {
            x0: bounds.x0 - cell, y0: bounds.y0 - rowStep,
            x1: bounds.x1 + cell, y1: bounds.y1 + rowStep
        };

        // Кольцо неподвижных точек-соседей ЗА полем. Оно не даёт наклеек само,
        // но ограничивает крайние ячейки: без него их обрезал прямоугольник
        // поля, углы уходили далеко, и краевые наклейки выходили вдвое крупнее
        // прочих. Ставить вместо этого лишние ряды внутрь поля нельзя —
        // релаксация растащит их по расширенной области, и полотно отойдёт от
        // краёв, оставив пустые поля сверху и снизу.
        const ghosts = [];
        for (let x = ext.x0; x <= ext.x1 + 1e-6; x += cell) {
            ghosts.push({ x, y: ext.y0 }, { x, y: ext.y1 });
        }
        for (let y = ext.y0 + rowStep; y < ext.y1 - 1e-6; y += rowStep) {
            ghosts.push({ x: ext.x0, y }, { x: ext.x1, y });
        }

        const real = this.seed(cols, rows, cell, rowStep, jitter);
        this.relax(real, bounds, iterations === undefined ? 2 : iterations, ghosts);

        const all = real.concat(ghosts);
        return real.map((p, i) => {
            const poly = this.cellOf(all, i, ext);
            return { x: p.x, y: p.y, cell: poly, radius: this.radiusOf(p, poly) };
        });
    }
};

if (typeof window !== 'undefined') window.ENVY_PACKING = ENVY_PACKING;
