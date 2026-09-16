// ================= ЛОББИ ГНЕВА =================
// Первое, что видит игрок, открыв гнев: свой свиночервь, слоты снаряжения
// вокруг него и выбор режима.
//
// ---------- СЛОТЫ СТРОЯТСЯ ИЗ КОНФИГА ----------
// Ни одного слота в разметке: список приходит из WRATH_GEAR.slots. Слотов
// заведомо станет больше — добавить их должно быть можно записью в конфиге,
// без правки html и css. Отсюда же и размер: слоты рисуются небольшими, две
// колонки по бокам от червя растут вниз, а не в стороны.
//
// ---------- СНАРЯЖЕНИЕ НА ТЕЛЕ НЕ ВИДНО ----------
// И это решение, а не недоделка: предметы дают характеристики, а вид червя
// принадлежит косметике, которую игрок покупает именно ради вида. Слоты в
// лобби дают ощущение снаряжённости, не трогая рендерер
// (docs/plan/09-wrath-rework.md, раздел 4).

const WrathLobby = {

    // Режимы гнева. Пока готов один; остальные показываются с замком
    // сознательно — игрок должен видеть, куда растёт грех, а не гадать,
    // всё ли это.
    //
    // Подписей у режимов нет (CLAUDE.md, инвариант 9): значок говорит, что
    // это, а строка под ним — числами, что там прямо сейчас (сколько жетонов
    // в магазине, докуда дошёл забег).
    MODES: [
        { key: 'duel',  emoji: '⚔️', ready: true },
        { key: 'pvp',   emoji: '🤝', ready: false },
        { key: 'rogue', emoji: '🗺', ready: true },
        { key: 'shop',  emoji: '🏪', ready: true }
    ],

    host: null,
    root: null,
    panelEl: null,
    columns: null,
    wormStage: null,
    footEl: null,
    fightEl: null,
    modesEl: null,
    cardEl: null,
    wormHandle: null,
    openSlot: null,
    healClock: null,
    shownWallet: null,
    lackTimer: null,
    holdEl: null,
    holdFillEl: null,
    holdCircumference: 0,
    holdTimer: null,
    holdActive: false,

    init(host) {
        this.host = host;
        this.root = document.getElementById('wrath-lobby');
        if (!this.root) return;

        this.panelEl = document.getElementById('wrath-panel');
        this.columns = {
            left: document.getElementById('wrath-gear-left'),
            right: document.getElementById('wrath-gear-right')
        };
        this.wormStage = document.getElementById('wrath-lobby-worm');
        this.wormBox = this.wormStage ? this.wormStage.parentElement : null;
        this.footEl = document.getElementById('wrath-foot');
        this.fightEl = document.getElementById('wrath-fight');
        this.modesEl = document.getElementById('wrath-modes');
        this.cardEl = document.getElementById('wrath-slot-card');
        this.holdEl = document.getElementById('wrath-hold');
        this.holdFillEl = document.getElementById('wrath-hold-fill');

        this.buildSlots();
        this.buildModes();
        this.bindHold();

        // Кнопка боя. Лобби — это МЕНЮ боя, и драться идут отсюда, а не с
        // кнопки режима внизу: та открывает меню. Пока бой запускался прямо
        // рядом с лавкой и забегом, промах по соседней кнопке стоил здоровья,
        // а оно набирается минутами.
        if (this.fightEl) {
            this.fightEl.onclick = (e) => {
                e.stopPropagation();
                // Заперта — значит без сил. Почему, видно по пустой полосе в
                // шапке: она вздрагивает в ответ на тап.
                if (this.fightEl.classList.contains('locked')) { this.flashPanel(); return; }
                this.host.startFight('duel');
            };
        }

        // Тап мимо карточки закрывает её. Слушатель на самом экране, а не на
        // документе: закрытая мини-игра не должна ничего ловить.
        this.root.addEventListener('click', (e) => {
            if (!this.openSlot) return;
            if (this.cardEl.contains(e.target)) return;
            if (e.target.closest('.gear-slot')) return;
            this.hideCard();
        });
    },

    // ---------- ЖИЗНЕННЫЙ ЦИКЛ ЭКРАНА ----------
    enter() {
        // Вернулись из боя — здоровье снова восстанавливается. Здесь, а не только на
        // выходе из боя: игру закрывают прямо посреди драки, и тогда снимать
        // заморозку будет некому.
        // Во время забега Backend его не разморозит — там здоровье своё.
        Backend.resumeHeal();
        this.mountWorm();
        this.refresh();
    },

    leave() {
        if (this.wormHandle) {
            this.wormHandle.destroy();
            this.wormHandle = null;
        }
        // Часы здоровья здесь НЕ останавливаются: шапка живёт и в лавке, и в
        // прокачке, и на карте забега. Гасит их маршрутизатор, когда шапка
        // уходит с экрана (WrathMinigame.setScreen).
        this.hideCard();
        this.cancelHold(false);
        if (this.lackTimer) { clearTimeout(this.lackTimer); this.lackTimer = null; }
        if (this.panelEl) this.panelEl.classList.remove('lack');
    },

    mountWorm() {
        if (!this.wormStage || this.wormHandle) return;
        if (typeof WormModelAPI === 'undefined' || typeof WormRenderer === 'undefined') return;

        const model = WormModelAPI.loadWormModel();
        this.wormHandle = WormRenderer.mount(this.wormStage, model, {
            context: 'wrath-lobby',
            room: false,        // лобби — не комната, пол и стены тут не нужны
            wander: false,      // боец стоит на месте, а не гуляет
            blink: true,        // но живой: моргает и дышит
            pose: 'standing',
            anchorX: 0.5,
            anchorY: 0.36
        });

        // Кольцо удержания живёт ВНУТРИ сцены персонажа: mount() очищает
        // контейнер, поэтому переносится после монтирования. Внутри сцены оно
        // масштабируется вместе с червём и остаётся над головой при любом
        // размере тела.
        if (this.holdEl) this.wormStage.appendChild(this.holdEl);

        // Вписывается по реальному силуэту и только после первого кадра:
        // сегменты получают transform в tick(), не при сборке.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            WrathFighter.fitWorm(this.wormHandle, this.wormStage, this.wormBox, 1);
            // Ещё кадр: перестановка червя доезжает до экрана только в
            // следующем тике рендерера.
            requestAnimationFrame(() => this.placeHoldRing());
        }));
    },

    // ---------- СЛОТЫ ----------
    buildSlots() {
        if (!this.columns.left || !this.columns.right) return;
        this.columns.left.innerHTML = '';
        this.columns.right.innerHTML = '';

        WRATH_GEAR.slots.forEach(slot => {
            const column = this.columns[slot.column] || this.columns.left;
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'gear-slot';
            el.dataset.slot = slot.key;
            // Пустой слот показывает свой значок вполсилы — это
            // единственное, что подсказывает, ЧТО сюда встаёт. Занятый
            // показывает предмет и прибавку от него: разбивка итога живёт
            // здесь, а в панели наверху — только сумма.
            el.innerHTML = `
                <span class="gear-icon"></span>
                <span class="gear-gain"></span>
            `;
            el.onclick = (e) => { e.stopPropagation(); this.showCard(slot.key); };
            column.appendChild(el);
        });
    },

    buildModes() {
        if (!this.modesEl) return;
        this.modesEl.innerHTML = '';
        this.MODES.forEach(mode => {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'mode-btn' + (mode.ready ? ' ready' : ' locked');
            el.dataset.mode = mode.key;
            // Только значок. Раньше под ним стояла строка чисел — жетоны у
            // лавки, цена входа у забега, — и кнопка переставала быть
            // кнопкой: игрок читал её как табло. Кошелёк уехал в шапку, цена
            // забега — в окно, которое открывается этим же нажатием.
            el.innerHTML = `<span class="mode-emoji">${mode.emoji}</span>`
                + (mode.ready ? '' : '<span class="mode-lock">🔒</span>');
            el.onclick = (e) => {
                e.stopPropagation();
                // Кнопки режимов НЕ запираются по здоровью: они открывают
                // меню, а не начинают действие. Замок остался только у того,
                // чего ещё нет вовсе (бой с игроком).
                if (el.classList.contains('locked')) return;
                this.host.startMode(mode.key);
            };
            this.modesEl.appendChild(el);
        });
    },


    // ---------- ШАПКА ----------
    // Зовётся маршрутизатором при КАЖДОМ переключении экрана: кошелёк мог
    // измениться в лавке, здоровье — набежать, способность — купиться.
    // Отдельный метод, а не часть refresh(), потому что слотов снаряжения на
    // экране лавки нет вовсе.
    refreshHead() {
        if (!this.panelEl) this.panelEl = document.getElementById('wrath-panel');
        const equipment = (GameState.data && GameState.data.equipment) || {};
        // ---------- ШАПКА: ИТОГИ БОЙЦА И КОШЕЛЁК ----------
        // Итоги, и только итоги: сколько всего здоровья, какой разброс удара,
        // сколько брони, что куплено из способностей и сколько жетонов. Из
        // чего это сложилось, написано в самих слотах — так наверху не
        // вырастает стена цифр, а разбивка всё равно под рукой.
        //
        // Кошелёк стоит ЗДЕСЬ, а не под кнопкой лавки, и это не перестановка
        // ради красоты. Число жетонов — такая же характеристика бойца, как
        // урон: оно говорит, что он может себе позволить. Под кнопкой оно
        // превращало кнопку в табло и было видно только из лобби, хотя нужно
        // ровно там, где тратят, — в лавке и в прокачке.
        //
        // Строится ОДИН раз за вход, а раз в секунду обновляются только
        // ширина полосы и число здоровья. Иначе перестройка шапки дёргала бы
        // раскладку каждую секунду — ровно та болезнь, от которой убран
        // счётчик регенерации.
        if (this.panelEl) {
            const stats = WrathFighter.stats(equipment);
            const short = WrathFighter.summary(stats);
            // Броня — ОДНО число. Раньше здесь стояло «5/10/3» — три числа
            // через дробь, по зонам. Их никто не читал, и прочесть было
            // нечем: без слов не объяснить, какая дробь чья
            // (src/config/wrath-gear.js).
            const armor = short.armor;
            const passives = WrathFighter.passives();

            this.panelEl.innerHTML = `
                <div class="panel-row hp">
                    <span class="panel-icon">❤️</span>
                    <span class="panel-bar"><i id="wrath-hp-fill"></i></span>
                    <span class="panel-num" id="wrath-hp-num"></span>
                </div>
                <div class="panel-stats">
                    <span class="panel-chip"><span class="panel-icon">🗡</span>${short.damage}</span>
                    <span class="panel-chip"><span class="panel-icon">🛡</span>${armor}</span>
                    ${passives.length
                        ? `<span class="panel-chip">${passives.map(p => p.emoji).join(' ')}</span>`
                        : ''}
                    <span class="panel-chip wallet" data-cur="wrath_token">
                        ${TokenArt.svg('wrath_token', 0, { whole: true })}
                        <b>${GameState.currency('wrath_token')}</b>
                    </span>
                    <span class="panel-chip wallet" data-cur="wrath_shard">
                        ${TokenArt.svg('wrath_token',
                            TokenArt.progress('wrath_token', 'wrath.duel.lose'))}
                    </span>
                </div>
            `;
        }

        // Сторож кошелька сбрасывается вместе с панелью: чипы новые, и
        // сравнивать их с запомненным от старой панели нельзя.
        this.shownWallet = null;
        this.refreshHealth();

        // ---------- ВЫСОТА ШАПКИ ----------
        // Экраны греха абсолютные и накрыли бы шапку целиком, поэтому она
        // лежит поверх них, а они начинаются от её низа. Насколько отодвинуть,
        // считается ЗДЕСЬ и после перестройки: в шапке то четыре чипа, то
        // пять — с прибитым числом строка характеристик однажды уехала бы под
        // экран. Меряется после кадра, иначе высота ещё нулевая.
        requestAnimationFrame(() => {
            const head = this.panelEl && this.panelEl.parentElement;
            const foot = this.footEl || document.getElementById('wrath-foot');
            // Свойство ставится на ОБЩЕГО РОДИТЕЛЯ, а не на саму шапку:
            // читают его экраны, а они шапке соседи, и через соседа
            // пользовательское свойство не наследуется. Пока стояло на шапке,
            // экраны молча жили на запасном числе из css.
            const host = (head && head.parentElement) || (foot && foot.parentElement);
            if (!host) return;
            // Меряется offsetHeight, а НЕ getBoundingClientRect: весь холст
            // масштабируется под окно (CLAUDE.md, инвариант 11), и рамка
            // возвращает ЭКРАННЫЕ пиксели, а число кладётся обратно в css —
            // то есть в единицы сцены. На айфоне, где масштаб не единица,
            // экраны от этого разъезжались и низ уходил под подвал.
            // offsetHeight трансформации предка не видит.
            if (head) {
                const h = Math.round(head.offsetHeight);
                if (h) host.style.setProperty('--wrath-head-h', h + 'px');
            }
            if (foot) {
                const h = Math.round(foot.offsetHeight);
                if (h) host.style.setProperty('--wrath-foot-h', h + 'px');
            }
        });

        // Число здоровья пересчитывается раз в секунду, пока шапка на экране:
        // иначе игрок смотрит на «3 из 13» и не видит, что оно растёт. Часы
        // живут при ШАПКЕ, а не при лобби, — здоровье видно и из лавки.
        if (!this.healClock) {
            this.healClock = WrathFighter.startHealClock(() => this.refreshHealth());
        }
    },

    // ---------- КОШЕЛЁК В ШАПКЕ ЖИВОЙ ----------
    // Шапка целиком пересобирается только при СМЕНЕ ЭКРАНА — иначе раскладка
    // дёргалась бы на каждой перерисовке. Из этого следовала неприятность,
    // которую видно сразу: жетон списан, а в шапке всё ещё старое число.
    // Хуже всего на входе в забег — там экран не меняется вовсе, и враньё
    // висело до следующего перехода.
    //
    // Поэтому кошелёк подновляется ОТДЕЛЬНО и точечно: меняются два чипа, а
    // не вся панель. Есть сторож по значениям — если ничего не изменилось,
    // в дерево не пишется ничего, и звать это можно хоть каждую секунду.
    refreshWallet() {
        const panel = this.panelEl || document.getElementById('wrath-panel');
        if (!panel) return;

        const tokens = GameState.currency('wrath_token');
        const shards = TokenArt.progress('wrath_token', 'wrath.duel.lose');
        if (this.shownWallet && this.shownWallet.tokens === tokens
            && this.shownWallet.shards === shards) return;
        this.shownWallet = { tokens, shards };

        const whole = panel.querySelector('.panel-chip.wallet[data-cur="wrath_token"] b');
        if (whole) whole.textContent = tokens;
        const part = panel.querySelector('.panel-chip.wallet[data-cur="wrath_shard"]');
        if (part) part.innerHTML = TokenArt.svg('wrath_token', shards);
    },

    // ---------- ОТКАЗ БЕЗ СЛОВ ----------
    // Не хватило валюты — дёргается и краснеет сам чип кошелька в шапке.
    // Раньше это делал кошелёк в строке лавки, но кошелька там больше нет:
    // он один на все экраны и живёт наверху. Значит и отвечать обязан он —
    // причём одинаково, из лавки и из прокачки (docs/plan/11-no-words.md).
    flashLack(key) {
        if (!this.panelEl) return;
        const chip = this.panelEl.querySelector(`.panel-chip.wallet[data-cur="${key}"]`)
                  || this.panelEl.querySelector('.panel-chip.wallet');
        if (!chip) return;
        chip.classList.remove('lack');
        // Пересчёт стиля между снятием и возвратом класса: без него повторный
        // отказ по той же валюте не перезапустит анимацию, и второй тап
        // выглядел бы как «игра меня не услышала».
        void chip.offsetWidth;
        chip.classList.add('lack');
        if (this.lackTimer) clearTimeout(this.lackTimer);
        this.lackTimer = setTimeout(() => {
            this.lackTimer = null;
            if (chip) chip.classList.remove('lack');
        }, 900);
    },

    stopHeadClock() {
        if (this.healClock) this.healClock.stop();
        this.healClock = null;
    },

    // Показать текущее состояние: что надето и что это даёт.
    //
    // Делится надвое СОЗНАТЕЛЬНО. Шапка (здоровье, характеристики, кошелёк)
    // общая на четыре экрана греха и пересобирается при каждом переключении;
    // слоты снаряжения и кнопки режимов живут только в лобби, и трогать их из
    // лавки нечего — там этих узлов на экране просто нет.
    refresh() {
        this.refreshHead();
        const equipment = (GameState.data && GameState.data.equipment) || {};

        WRATH_GEAR.slots.forEach(slot => {
            const el = this.root.querySelector(`.gear-slot[data-slot="${slot.key}"]`);
            if (!el) return;
            const item = WRATH_GEAR.items[equipment[slot.key]];
            const icon = el.querySelector('.gear-icon');
            const gain = el.querySelector('.gear-gain');
            el.classList.toggle('filled', !!item);
            // Пусто — силуэт того, что сюда встаёт. Занято — сам предмет.
            if (item) icon.textContent = item.emoji;
            else icon.innerHTML = WrathFighter.slotShape(slot);
            // Зона брони здесь не пишется: слот и есть зона (шлем — голова,
            // броня — тело), и повторять это значком незачем.
            if (gain) gain.innerHTML = item ? WrathFighter.itemStats(item) : '';
        });

        // Незавершённый забег — первое, что игрок должен увидеть в лобби:
        // он платный и ждёт возвращения. Показывается СОСТОЯНИЕМ кнопки, а не
        // числами под ней: цена и содержимое забега теперь живут во
        // всплывающем окне, которое открывается тем же нажатием.
        const rogueBtn = this.modesEl && this.modesEl.querySelector('.mode-btn[data-mode="rogue"]');
        if (rogueBtn) rogueBtn.classList.toggle('running', !!Backend.run());

    },


    // ---------- ЗДОРОВЬЕ ----------
    // Отдельно от общего refresh: пересчитывается раз в секунду, а
    // перестраивать ради этого весь экран незачем.
    // Раз в секунду меняются ровно два значения: ширина полосы и число на
    // ней. Секунд до полного здоровья мы НЕ показываем — отдельный счётчик
    // был лишним и вдобавок растягивал строку, отчего дёргалась вся раскладка.
    //
    // Полоса рисуется по ДРОБНОМУ здоровью, а число — по целому. Раньше
    // хватало целого: при единице в секунду оно менялось на глазах. Теперь
    // возвращается хп в минуту, целое стоит на месте по минуте кряду — и
    // полоса, нарисованная по нему, выглядела бы застывшей, то есть
    // сломанной. По дробному она ползёт непрерывно, и ждать становится видно.
    refreshHealth() {
        // Кошелёк едет тем же тиком. Это СТРАХОВКА, а не основной путь: там,
        // где валюту тратят, refreshWallet зовётся сразу, иначе число
        // отставало бы на секунду ровно в момент, когда на него смотрят.
        this.refreshWallet();

        const health = WrathFighter.playerHp();

        // Ищется в ПАНЕЛИ, а не в лобби: панель уехала в общую шапку, за
        // пределы экрана лобби, и из лавки this.root её уже не содержит.
        // Пока искали по старому месту, полоса стояла на месте во всех
        // четырёх меню и число под ней не появлялось вовсе.
        const panel = this.panelEl || document.getElementById('wrath-panel');
        if (!panel) return;
        const fill = panel.querySelector('#wrath-hp-fill');
        const num = panel.querySelector('#wrath-hp-num');
        if (fill) fill.style.width = `${Math.max(0, (health.exact / (health.max || 1)) * 100)}%`;
        if (num) {
            num.textContent = `${health.hp}/${health.max}`;
            num.classList.toggle('hurt', !health.full);
        }

        // Драться без здоровья нельзя — и это не поломка, а ожидание.
        // Запирается КНОПКА БОЯ в лобби, а не кнопка режима внизу: та лишь
        // открывает меню, а посмотреть на своего бойца и его снаряжение можно
        // и без сил. Почему заперто, видно по пустой полосе в шапке.
        if (!this.fightEl) this.fightEl = document.getElementById('wrath-fight');
        if (this.fightEl) this.fightEl.classList.toggle('locked', health.hp <= 0);
    },

    // ---------- УДЕРЖАНИЕ НА ЧЕРВЕ ----------
    // Полторы секунды пальцем на персонаже открывают меню прокачки. Жест
    // выбран не ради экзотики: качают самого червя, и «нажать на него» —
    // самое понятное действие. А удержание, а не тап, потому что тап здесь
    // слишком дёшев: по персонажу промахиваются, гладят его, тыкают от
    // нечего делать.
    //
    // Чтобы жест был находим, он ПОКАЗЫВАЕТ СЕБЯ: от первого касания под
    // червём появляется полоска и начинает заполняться. Отпустил раньше —
    // полоска исчезла, но игрок уже увидел, что что-то набиралось.
    HOLD_MS: 1500,

    bindHold() {
        if (!this.wormBox) return;
        // Коробка, а не сам SVG: тело узкое и извилистое, попасть по нему
        // пальцем труднее, чем по области, где червь стоит. Промахнуться
        // некуда — в этой области больше ничего нет.
        this.wormBox.style.pointerEvents = 'auto';
        this.wormBox.style.touchAction = 'none';

        this.wormBox.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            this.startHold();
        });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => {
            this.wormBox.addEventListener(type, () => this.cancelHold(true));
        });

        // Палец УЕХАЛ с червя, не отпуская, — это тоже «передумал».
        //
        // Проверяется КООРДИНАТАМИ, а не pointerleave: на касании браузер
        // молча захватывает указатель за элементом, pointermove продолжает
        // приходить сюда же, а leave не приходит до самого отпускания. На
        // мыши отмена работала бы, на телефоне уехавший палец всё равно
        // открывал бы прокачку. Та же грабля, что у белого флага забега
        // (docs/traps.md, п. 90).
        this.wormBox.addEventListener('pointermove', (e) => {
            if (!this.holdActive) return;
            const r = this.wormBox.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right
                || e.clientY < r.top || e.clientY > r.bottom) this.cancelHold(true);
        });
    },

    // Кольцо ставится над макушкой по РЕАЛЬНЫМ габаритам головы: у
    // подросшего червя голова крупнее и выше, и кольцо переедет вместе с ней.
    // Координаты — в единицах сцены, поэтому масштаб сцены применяется к
    // кольцу сам собой.
    placeHoldRing() {
        if (!this.holdEl || !this.wormHandle) return;
        const headEl = this.wormHandle.svgRoot.querySelector('[data-part="head"]');
        const head = WrathFighter.boxOf(this.wormHandle, headEl);
        if (!head) return;

        const size = Math.max(44, head.w * 0.6);
        this.holdEl.style.width = `${size.toFixed(1)}px`;
        this.holdEl.style.height = `${size.toFixed(1)}px`;
        this.holdEl.style.left = `${head.cx.toFixed(1)}px`;
        // Над макушкой, с зазором: кольцо не должно наезжать на уши.
        this.holdEl.style.top = `${(head.y - size * 0.5).toFixed(1)}px`;
    },

    startHold() {
        if (this.holdActive) return;
        this.holdActive = true;

        // Место кольца считается в момент касания, а не при монтировании:
        // fitWorm() переставляет червя, но сама перестановка доезжает до
        // экрана только следующим кадром рендерера, и позиция головы,
        // измеренная сразу после неё, оказывается ещё старой.
        this.placeHoldRing();
        if (this.holdEl) this.holdEl.classList.add('show');
        if (this.holdFillEl) {
            // Заполнение по кругу — это длина штриха: обводка нарисована
            // пунктиром в одну окружность, и сдвиг пунктира открывает её
            // постепенно. Одно анимируемое свойство, никакой перерисовки.
            if (!this.holdCircumference) {
                const r = Number(this.holdFillEl.getAttribute('r')) || 42;
                this.holdCircumference = 2 * Math.PI * r;
                this.holdFillEl.style.strokeDasharray = this.holdCircumference.toFixed(2);
            }
            // Сброс без перехода, потом рост с переходом: иначе кольцо поедет
            // из прошлого положения.
            this.holdFillEl.style.transition = 'none';
            this.holdFillEl.style.strokeDashoffset = this.holdCircumference.toFixed(2);
            void this.holdFillEl.getBoundingClientRect();
            this.holdFillEl.style.transition = `stroke-dashoffset ${this.HOLD_MS}ms linear`;
            this.holdFillEl.style.strokeDashoffset = '0';
        }

        this.holdTimer = setTimeout(() => {
            this.holdTimer = null;
            this.cancelHold(false);
            this.host.startMode('boost');
        }, this.HOLD_MS);
    },

    // hint=true — палец убрали сами, значит жест не понят: подсказываем.
    // hint=false — удержание сработало или экран закрывается, молчим.
    cancelHold(hint) {
        const wasActive = this.holdActive;
        this.holdActive = false;

        if (this.holdTimer) {
            clearTimeout(this.holdTimer);
            this.holdTimer = null;
        }
        if (this.holdEl) this.holdEl.classList.remove('show');
        if (this.holdFillEl && this.holdCircumference) {
            this.holdFillEl.style.transition = 'stroke-dashoffset 0.15s ease';
            this.holdFillEl.style.strokeDashoffset = this.holdCircumference.toFixed(2);
        }
        // Раньше здесь всплывала подсказка словами. Её нет и не будет:
        // кольцо над головой уже показало себя — начало заполняться и
        // откатилось. Этого достаточно, чтобы понять, что палец надо
        // подержать (CLAUDE.md, инвариант 9).
        void hint; void wasActive;
    },

    // ---------- ОТКАЗ БЕЗ СЛОВ ----------
    // Драться нечем — вздрагивает сама полоса здоровья. Тот же язык, что в
    // магазине, где вздрагивает валюта, которой не хватило: игрок видит, ЧТО
    // мешает, и не читает об этом (docs/plan/11-no-words.md).
    flashPanel() {
        if (!this.panelEl) return;
        this.panelEl.classList.remove('lack');
        void this.panelEl.offsetWidth;
        this.panelEl.classList.add('lack');
    },

    // ---------- КАРТОЧКА СЛОТА ----------
    // Что в слоте и чем это заменить. Где брать предметы, здесь не пишется:
    // магазин виден в том же лобби отдельной строкой, и объяснять это в
    // каждом пустом слоте — шум.
    showCard(slotKey) {
        const slot = WRATH_GEAR.slots.find(s => s.key === slotKey);
        if (!slot || !this.cardEl) return;

        // Повторный тап по тому же слоту закрывает карточку. Иначе закрыть её
        // можно было только попав в пустое место мимо всего кликабельного —
        // а на плотном экране такого места почти нет.
        if (this.openSlot === slotKey) {
            this.hideCard();
            return;
        }

        const equipment = (GameState.data && GameState.data.equipment) || {};
        const inventory = (GameState.data && GameState.data.inventory) || {};
        const equippedId = equipment[slotKey];

        const available = Object.keys(inventory).filter(id => {
            const item = WRATH_GEAR.items[id];
            return item && item.slot === slotKey && id !== equippedId;
        });

        // Карточка — это список того, что можно поставить в слот, включая
        // «ничего». Надетое помечено галочкой; отдельной кнопки «снять» нет
        // — снять значит выбрать пустую строку. Так список читается одним
        // правилом: выбери, что тут стоит.
        const row = (id, item) => {
            const on = (id || null) === (equippedId || null);
            return `<button type="button" class="card-item${on ? ' on' : ''}" data-item="${id || ''}">
                        <span class="card-item-icon">${item ? item.emoji : '⬚'}</span>
                        <span class="card-item-stat">${item ? WrathFighter.itemStats(item) : ''}</span>
                        <span class="card-item-mark">${on ? '✓' : ''}</span>
                    </button>`;
        };

        this.cardEl.innerHTML = `
            <div class="card-head"><span class="card-title">${slot.emoji}</span></div>
            ${row('', null)}
            ${equippedId ? row(equippedId, WRATH_GEAR.items[equippedId]) : ''}
            ${available.map(id => row(id, WRATH_GEAR.items[id])).join('')}
        `;

        this.cardEl.querySelectorAll('.card-item').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                // Надевает Backend, а не интерфейс: проверки «есть ли предмет»
                // и «тот ли слот» на сервере будут теми же самыми.
                //
                // Щелчок в палец — потому что это ПЕРЕКЛЮЧЕНИЕ, самое мелкое
                // событие из тех, что вообще отдают (src/core/haptics.js).
                if (typeof Haptics !== 'undefined') Haptics.tick();
                Backend.equip(slotKey, btn.dataset.item || null);
                this.refresh();
                this.showCard(slotKey);
            };
        });

        this.openSlot = slotKey;
        this.cardEl.classList.add('show');
    },

    hideCard() {
        this.openSlot = null;
        if (this.cardEl) this.cardEl.classList.remove('show');
    },

};

if (typeof window !== 'undefined') {
    window.WrathLobby = WrathLobby;
}
