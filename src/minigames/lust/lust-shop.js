// ================= МАГАЗИН ПОХОТИ: ЛОГИКА =================
// Показ — рекламный лист в журнале на унитазе (lust-mag.js, mag-ad-art.js).
// Журнал открывается ТОЛЬКО до забега и после него: посреди мытья магазина
// нет — подготовился, отыграл, потратил (docs/plan/21-lust-bath.md, разд. 6).
// Здесь — только то, что листу и зову журнала нужно знать: полки, ступени,
// по карману ли, и сама покупка.
//
// Три полки (замысел — docs/plan/21-lust-bath.md, разд. 7):
//
//   хвост   — ЕДИНСТВЕННАЯ полка, которая двигает доход: толчки, сила,
//             разброс струи и послушность хвоста одной ступенью;
//   мыло    — мылиться быстрее и дольше оставаться чистым: шкала похоти
//             пустеет медленнее (12 → 24 ч);
//   мочалка — тереть быстрее и раньше снова играть на жетон: таймер
//             награды короче (6 → 3 ч).
//
// ---------- ПОКУПАЕТ НЕ ЭКРАН ----------
// Проверка цены, списание и потолок — Backend.buyUpgrade('<ветка>', 'lust').
// Здесь только вызов (инвариант 2).

const LustShop = {

    // Порядок полок берётся из конфига, а не повторяется здесь: два списка
    // одного и того же однажды разойдутся (docs/traps.md, п. 142).
    branches() {
        const u = this.conf();
        return (u.order || []).filter(key => {
            const b = u[key];
            if (!b || !b.levels) return false;
            // Выкупленная до потолка полка УХОДИТ: смотреть на то, что уже
            // своё, незачем — то же правило, что в лавке гнева, на кухне и
            // в саду.
            return this.level(key) < b.levels.length;
        });
    },

    conf() {
        return (typeof ECONOMY !== 'undefined' && ECONOMY.minigames
                && ECONOMY.minigames.lust && ECONOMY.minigames.lust.upgrades) || {};
    },

    level(key) {
        return (typeof GameState !== 'undefined' && GameState.upgradeLevel)
            ? GameState.upgradeLevel('lust_' + key) : 0;
    },

    // Есть ли в магазине хоть одна ступень по карману — по ней зовёт журнал
    // на унитазе (BATH_MAG.call).
    anyAffordable() {
        const u = this.conf();
        return this.branches().some(key => {
            const lv = u[key].levels[this.level(key)];
            return !!(lv && lv.price) && this.affordable(lv.price);
        });
    },

    affordable(price) {
        return !Object.keys(price || {}).some(cur => GameState.currency(cur) < price[cur]);
    },

    // ================= ПОКУПКА =================
    buy(key) {
        const res = Backend.buyUpgrade(key, 'lust');
        if (res && res.ok) {
            if (typeof Haptics !== 'undefined') Haptics.notify('success');
            if (key === 'soap' && typeof BATH_SOAP !== 'undefined') BATH_SOAP.refresh();
            if (key === 'cloth' && typeof BATH_CLOTH !== 'undefined') BATH_CLOTH.refresh();
            return;
        }
        if (typeof Haptics !== 'undefined') Haptics.notify('error', true);
    }
};

if (typeof window !== 'undefined') window.LustShop = LustShop;
