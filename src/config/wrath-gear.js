// ================= СНАРЯЖЕНИЕ ГНЕВА: СЛОТЫ И ПРЕДМЕТЫ =================
// Данные, без логики — как таблица комнат в src/core/rooms.js. Новый
// предмет = запись в таблице, а не строчка кода в бою. Файл потом переезжает
// на сервер как есть, поэтому здесь нет ни одной функции.
//
// ---------- ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ ECONOMY ----------
// В economy.js лежат числа, которые крутят БАЛАНС: скорости шкал, награды,
// цены. Каталог предметов — это content: он будет расти десятками записей и
// заполнит собой весь конфиг экономики. Числа самого боя (базовые ХП, разброс
// урона) остались в ECONOMY.minigames.wrath, здесь только предметы.
//
// ---------- КАК СЧИТАЮТСЯ ХАРАКТЕРИСТИКИ ----------
// Без хитростей, всё складывается:
//
//     максимум ХП = base.hp + сумма hp надетого
//     урон        = бросок из base.damageMin..base.damageMax + сумма damage
//     получено    = урон противника − armor[зона]  (не ниже нуля)
//
// Базовый урон одинаков в любую зону: зона решает, попал ты или в блок, а не
// сколько снял. Это сознательно (docs/plan/09-wrath-rework.md, вводная 9).

const WRATH_GEAR = {

    // ---------- СЛОТЫ ----------
    // Порядок = порядок показа в лобби. `column` — в какой колонке слот
    // рисуется вокруг червя: слева то, что надето НА тело, справа то, что
    // держат в руках. Слотов будет больше, поэтому колонка — свойство слота,
    // а не позиция в разметке.
    slots: [
        { key: 'helmet', name: 'Шлем',      emoji: '🪖', column: 'left',  hint: '− урон в голову' },
        { key: 'armor',  name: 'Броня',     emoji: '🦺', column: 'left',  hint: '− урон в тело' },
        { key: 'gloves', name: 'Перчатки',  emoji: '🧤', column: 'left',  hint: '+ урон' },
        { key: 'weapon', name: 'Оружие',    emoji: '🗡', column: 'right', hint: '+ урон' },
        { key: 'shield', name: 'Щит',       emoji: '🛡', column: 'right', hint: '− урон в тело' }
    ],

    // ---------- ПРЕДМЕТЫ ----------
    // Продаются в магазине гнева за жетоны (docs/plan/03-wrath.md). Жетон —
    // это три осколка, осколок даётся за победу, значит первый предмет стоит
    // ровно три победы.
    //
    //   slot   — в какой слот встаёт
    //   tier   — ступень внутри слота: по ней магазин показывает «1 из 3»,
    //            то есть потолок объявлен заранее, как требует план
    //   price  — цена в валютах; карта, а не число, чтобы завтра предмет мог
    //            стоить золота или кристалла без правки кода
    //   hp     — прибавка к максимуму здоровья
    //   damage — прибавка к наносимому урону
    //   armor  — сколько урона снимается с прилетевшего в эту зону
    //   unlock — НЕОБЯЗАТЕЛЬНОЕ условие появления в магазине:
    //            { counter: 'wrath.duel.fights', at: 10 }. Пока не выполнено,
    //            предмета в магазине не видно вовсе (Backend.isUnlocked).
    //            Ни у одного предмета пока не стоит — это каркас на будущее
    //
    // Зоны те же три, что у шрамов: 'head' | 'body' | 'tail'.
    items: {
        // ---- оружие: чистый урон ----
        'rusty-blade': {
            slot: 'weapon', tier: 1, name: 'Ржавый клинок', emoji: '🗡',
            damage: 1, price: { wrath_token: 1 }
        },
        'bone-shiv': {
            slot: 'weapon', tier: 2, name: 'Костяная заточка', emoji: '🦴',
            damage: 2, price: { wrath_token: 3 }
        },
        'tusk-saber': {
            slot: 'weapon', tier: 3, name: 'Клыкастая сабля', emoji: '⚔️',
            damage: 3, price: { wrath_token: 6 }
        },

        // ---- шлем: голова ----
        'pot-helmet': {
            slot: 'helmet', tier: 1, name: 'Кастрюля', emoji: '🥘',
            armor: { head: 1 }, hp: 1, price: { wrath_token: 1 }
        },
        'skull-cap': {
            slot: 'helmet', tier: 2, name: 'Череп', emoji: '💀',
            armor: { head: 2 }, hp: 2, price: { wrath_token: 4 }
        },

        // ---- броня: тело ----
        'hide-armor': {
            slot: 'armor', tier: 1, name: 'Шкура', emoji: '🦺',
            armor: { body: 1 }, hp: 2, price: { wrath_token: 2 }
        },
        'bone-plate': {
            slot: 'armor', tier: 2, name: 'Костяной панцирь', emoji: '🛡',
            armor: { body: 2 }, hp: 3, price: { wrath_token: 5 }
        },

        // ---- перчатки: урон ----
        'work-gloves': {
            slot: 'gloves', tier: 1, name: 'Рабочие перчатки', emoji: '🧤',
            damage: 1, price: { wrath_token: 1 }
        },
        'spiked-gloves': {
            slot: 'gloves', tier: 2, name: 'Шипованные', emoji: '🥊',
            damage: 2, price: { wrath_token: 4 }
        },

        // ---- щит: тело и хвост ----
        'lid-shield': {
            slot: 'shield', tier: 1, name: 'Крышка', emoji: '🛢',
            armor: { body: 1 }, price: { wrath_token: 1 }
        },
        'tower-shield': {
            slot: 'shield', tier: 2, name: 'Ростовой щит', emoji: '🚪',
            armor: { body: 1, tail: 1 }, hp: 1, price: { wrath_token: 4 }
        }
    }
};

if (typeof window !== 'undefined') {
    window.WRATH_GEAR = WRATH_GEAR;
}
