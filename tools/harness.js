// ================= ОБЩАЯ ОБВЯЗКА ПРОГОНОВ =================
// Даёт любому прогону два переключателя, которых ему не хватало, чтобы
// поймать целый класс ошибок:
//
//   SVINO_VIEWPORT=390x700   размер окна. По умолчанию 390×844 — ровно
//                            холст игры, то есть масштаб РОВНО ЕДИНИЦА. На
//                            нём годами не всплывало всё, что перепутало
//                            пиксели экрана с единицами сцены: множитель был
//                            единицей, и ошибка ничего не меняла. Внутри
//                            Telegram видимая высота меньше — и вылезло всё
//                            сразу.
//
//   SVINO_FAKE_CTM=1         getScreenCTM возвращает матрицу БЕЗ
//                            трансформации предка — так ведёт себя WebKit
//                            (айфон), а прогоны идут в Chromium, где она
//                            учитывается. Единственный способ проверить с
//                            этой машины поведение телефона.
//
// Пример:
//   SVINO_VIEWPORT=390x700 SVINO_FAKE_CTM=1 \
//     NODE_PATH=/opt/node22/lib/node_modules node tools/test-lust.js
//
// Прогон, который водит пальцем, обязан считать экранные координаты через
// SvgSpace.toClient, а НЕ через getScreenCTM: иначе под этим переключателем
// он промахнётся сам и обвинит игру.
function viewport(extra) {
    const raw = process.env.SVINO_VIEWPORT || '390x844';
    const m = /^(\d+)x(\d+)$/.exec(raw.trim());
    const size = m ? { width: +m[1], height: +m[2] } : { width: 390, height: 844 };
    return Object.assign({ viewport: size }, extra || {});
}

async function prepare(page) {
    if (!process.env.SVINO_FAKE_CTM) return;
    await page.addInitScript(() => {
        const orig = SVGGraphicsElement.prototype.getScreenCTM;
        SVGGraphicsElement.prototype.getScreenCTM = function () {
            const m = orig.call(this);
            const box = document.getElementById('game-container');
            if (!m || !box) return m;
            const r = box.getBoundingClientRect();
            const k = (r.width / (box.clientWidth || r.width)) || 1;
            if (Math.abs(k - 1) < 0.0001) return m;
            const root = this.ownerSVGElement || this;
            return root.createSVGMatrix()
                .translate(r.left, r.top).scale(1 / k).translate(-r.left, -r.top)
                .multiply(m);
        };
    });
}

module.exports = { viewport, prepare };
