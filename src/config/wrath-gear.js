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
    // shape — силуэт того, что в слот встаёт: контур на сетке 24×24. Пустой
    // слот рисует его вместо значка, и по силуэту сразу понятно, что сюда
    // ставится. Эмодзи для этого не годится: оно цветное, мелкое и в
    // приглушённом виде читается как «выключенная кнопка», а не как «место
    // под шлем». Тот же силуэт стоит на вкладке магазина.
    slots: [
        {
            key: 'helmet', name: 'Шлем', emoji: '🪖', column: 'left',
            hint: '− урон в голову',
            shape: 'M12 3a8 8 0 0 0-8 8v3h16v-3a8 8 0 0 0-8-8z'
                 + 'M2.5 15.5h19a1.2 1.2 0 0 1 0 3.4h-19a1.2 1.2 0 0 1 0-3.4z'
        },
        {
            key: 'armor', name: 'Броня', emoji: '🦺', column: 'left',
            hint: '− урон в тело',
            shape: 'M9 2.5l3 2 3-2 5.5 3-2.2 3.6V21H5.7V9.1L3.5 5.5z'
        },
        {
            key: 'gloves', name: 'Перчатки', emoji: '🧤', column: 'left',
            hint: '+ урон',
            shape: 'M9.6 3.4h4.2A3.6 3.6 0 0 1 17.4 7v13.8H9.6z'
                 + 'M9.6 9.4H7a2.6 2.6 0 0 0 0 5.2h2.6z'
        },
        {
            key: 'weapon', name: 'Оружие', emoji: '🗡', column: 'right',
            hint: '+ урон',
            shape: 'M12 1.4l3.5 11.6H8.5z M5 13.4h14v2.5H5z M10.7 16.3h2.6v6.3h-2.6z'
        },
        {
            key: 'shield', name: 'Щит', emoji: '🛡', column: 'right',
            hint: '− урон в тело',
            shape: 'M12 2l9 3.2v6.4c0 5.4-3.8 9.4-9 10.4-5.2-1-9-5-9-10.4V5.2z'
        }
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
    // ---------- ЛЕСТНИЦА: ПО ЧЕМУ РАССТАВЛЕНЫ ЧИСЛА ----------
    // Каждая следующая ступень слота примерно вдвое дороже предыдущей
    // (модель — docs/plan/15-progression.md, ЦЕНА(n) = Ц0 × 1.9^n), а даёт
    // заметно меньше, чем вдвое. На этом и держится долгая часть игры: цена
    // растёт быстрее силы.
    //
    // Проверено калькулятором по живому конфигу (tools/progression.js): если
    // покупать по одному предмету, начиная с самого дешёвого, сила растёт
    // ровными шагами ×1.03…×1.11 за покупку. Ям и скачков в лестнице нет —
    // это и было единственным требованием к числам.
    //
    // Слоты не взаимозаменяемы, у каждого своя роль:
    //   оружие    — самый крупный урон, самый дорогой слот
    //   перчатки  — тот же урон дешевле и с меньшим потолком
    //   шлем      — голова: броня и немного здоровья
    //   броня     — тело: главный источник здоровья
    //   щит       — тело и хвост сразу, брони меньше, чем у брони
    //
    // Названия в игре не показываются (инвариант 9) — значок и есть имя. Они
    // здесь для того, чтобы разговаривать о предметах в правках и планах.
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
        'rusty-saw': {
            slot: 'weapon', tier: 4, name: 'Ржавая пила', emoji: '🪚',
            damage: 4, price: { wrath_token: 11 }
        },
        'meat-hook': {
            slot: 'weapon', tier: 5, name: 'Мясницкий крюк', emoji: '🪝',
            damage: 5, price: { wrath_token: 20 }
        },
        'great-tusk': {
            slot: 'weapon', tier: 6, name: 'Бивень', emoji: '🦣',
            damage: 6, price: { wrath_token: 36 }
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
        'bucket-helm': {
            slot: 'helmet', tier: 3, name: 'Ведро', emoji: '🪣',
            armor: { head: 3 }, hp: 3, price: { wrath_token: 8 }
        },
        'horned-helm': {
            slot: 'helmet', tier: 4, name: 'Рогатый шлем', emoji: '🐃',
            armor: { head: 4 }, hp: 4, price: { wrath_token: 15 }
        },
        'hog-skull': {
            slot: 'helmet', tier: 5, name: 'Череп Хряка', emoji: '🐗',
            armor: { head: 5 }, hp: 5, price: { wrath_token: 27 }
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
        'beetle-shell': {
            slot: 'armor', tier: 3, name: 'Панцирь жука', emoji: '🪲',
            armor: { body: 3 }, hp: 4, price: { wrath_token: 10 }
        },
        'bone-mail': {
            slot: 'armor', tier: 4, name: 'Костяная кольчуга', emoji: '⛓',
            armor: { body: 4 }, hp: 6, price: { wrath_token: 18 }
        },
        'chitin-plate': {
            slot: 'armor', tier: 5, name: 'Хитин', emoji: '🦂',
            armor: { body: 5 }, hp: 8, price: { wrath_token: 32 }
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
        'claw-gloves': {
            slot: 'gloves', tier: 3, name: 'Когти', emoji: '🐾',
            damage: 3, price: { wrath_token: 8 }
        },
        'knuckles': {
            slot: 'gloves', tier: 4, name: 'Кастет', emoji: '👊',
            damage: 4, price: { wrath_token: 14 }
        },
        'pincers': {
            slot: 'gloves', tier: 5, name: 'Клешни', emoji: '🦀',
            damage: 5, price: { wrath_token: 25 }
        },

        // ---- щит: тело и хвост ----
        'lid-shield': {
            slot: 'shield', tier: 1, name: 'Крышка', emoji: '🛢',
            armor: { body: 1 }, price: { wrath_token: 1 }
        },
        'tower-shield': {
            slot: 'shield', tier: 2, name: 'Ростовой щит', emoji: '🚪',
            armor: { body: 1, tail: 1 }, hp: 1, price: { wrath_token: 4 }
        },
        'barn-door': {
            slot: 'shield', tier: 3, name: 'Дверь сарая', emoji: '🚧',
            armor: { body: 2, tail: 1 }, hp: 2, price: { wrath_token: 8 }
        },
        'turtle-shell': {
            slot: 'shield', tier: 4, name: 'Панцирь черепахи', emoji: '🐢',
            armor: { body: 2, tail: 2 }, hp: 3, price: { wrath_token: 15 }
        },
        'tombstone': {
            slot: 'shield', tier: 5, name: 'Надгробие', emoji: '🪦',
            armor: { body: 3, tail: 3 }, hp: 4, price: { wrath_token: 27 }
        }
    }
};

if (typeof window !== 'undefined') {
    window.WRATH_GEAR = WRATH_GEAR;
}
