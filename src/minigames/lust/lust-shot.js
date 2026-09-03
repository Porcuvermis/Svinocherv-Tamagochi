// ============ ПОЛЁТ КАПЛИ: ОДНА ФИЗИКА НА ИГРУ И НА КАЛЬКУЛЯТОР ============
//
// Раньше попадание решала формула («долетело, если сила ≥ порога; попало,
// если угол в допуске»), а на экране рисовалась картинка про то же самое, но
// отдельно. Игрок видел, что струя идёт в рот, и не попадал: считалось одно,
// показывалось другое.
//
// Теперь капля — снаряд. Она летит по баллистике, и попадание — это
// СТОЛКНОВЕНИЕ с открытым ртом. Что видно, то и засчитано.
//
// Файл нарочно без единого обращения к DOM: его читает и запускает
// tools/sim-lust.js — тем же шагом, теми же числами. Считать баланс по копии
// физики нельзя ровно по той же причине, по какой нельзя по копии конфига.
const LustShot = {

    // Один толчок. Направление — касательная кончика хвоста; к нему
    // прибавляется разброс струи и увод хвоста, оба покупаются прокачкой.
    // Сила решает начальную скорость, то есть насколько далеко капля летит.
    launch(cfg, tier, dir, rnd) {
        const r = rnd || Math.random;
        const u = (a, b) => a + r() * (b - a);
        const power = u(tier.minPower, 1);
        const err = (u(-tier.spread, tier.spread) + u(-tier.slop, tier.slop))
                  * Math.PI / 180;
        const a = dir + err;
        const v = cfg.speedMin + power * (cfg.speedMax - cfg.speedMin);
        return { vx: Math.cos(a) * v, vy: Math.sin(a) * v, power, err, angle: a };
    },

    // Шаг интегрирования. Возвращает состояние капли; игра рисует его, а
    // калькулятор просто крутит в цикле.
    step(d, cfg) {
        d.vy += cfg.gravity * cfg.dt;
        d.x += d.vx * cfg.dt;
        d.y += d.vy * cfg.dt;
        d.t += cfg.dt;
        return d;
    },

    // Попала ли капля в рот. Рот — КОРЗИНА: круг заданного радиуса вокруг
    // точки рта, а не угловой допуск. Угловой допуск и был причиной, по
    // которой видимое расходилось с засчитанным.
    inMouth(d, mouth, r) {
        const dx = d.x - mouth.x, dy = d.y - mouth.y;
        return dx * dx + dy * dy <= r * r;
    },

    // Долетела, упала или улетела за кадр.
    spent(d, cfg) {
        return d.t >= cfg.maxT || d.y > cfg.floorY
            || d.x < -100 || d.x > 820;
    },

    // Весь полёт разом — для калькулятора и для поиска прицела.
    fly(cfg, from, vel, mouth, r) {
        const d = { x: from.x, y: from.y, vx: vel.vx, vy: vel.vy, t: 0 };
        let near = Infinity;
        while (!this.spent(d, cfg)) {
            this.step(d, cfg);
            const dx = d.x - mouth.x, dy = d.y - mouth.y;
            const dist = Math.hypot(dx, dy);
            if (dist < near) near = dist;
            if (dist <= r) return { hit: true, near: dist, t: d.t };
        }
        return { hit: false, near, t: d.t };
    }
};

if (typeof module !== 'undefined') module.exports = LustShot;
