// ================= ГНЕВ: ЭКРАНЫ ЗАБЕГА =================
// Старт, сундук, выбор награды, магазин и событие забега, итог, отказ,
// брошенный забег, полёт добычи на счётчики.
// Продолжение WrathRogue (wrath-rogue.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после wrath-rogue.js.
Object.assign(WrathRogue, {

    // ---------- ОКНО ВХОДА ----------
    // На экране ровно три вещи: ЧТО выбрать, ГДЕ посмотреть награду и ЧЕМ
    // подтвердить. Ни одного числа, пока игрок сам его не спросит.
    //
    // ---------- ЧТО БЫЛО ДО ----------
    // Окно выкладывало всё сразу: сравнение «ты против босса», дорогу узлами
    // и строку «цена → добыча». Каждый блок по отдельности был осмыслен, а
    // вместе они давали шесть одинаковых плашек, из которых нажимались три.
    // Игрок видел набор чисел и не понимал ни где кнопка, ни что чему
    // соответствует (docs/traps.md, п. 82).
    //
    // Выброшено по одному правилу: «помогает ли это решить, идти или нет».
    //
    //   ДОРОГА — нет. Карта нарисована прямо за этим окном.
    //   С ЧЕМ ВХОДИШЬ — нет. Одинаково на всех сложностях, значит выбирать по
    //   нему нечего; это факт о режиме, а не о выборе.
    //   ЧИСЛА БОССА — хуже, чем нет: 50 → 56 → 60 выглядит «почти то же
    //   самое», а доходимость падает с 40% до 8%. Цифра прямо врала.
    //   ЦЕНА — одинаковая на всех трёх, в сравнении ей делать нечего. Её
    //   место на кнопке, которой платят.
    //
    // ---------- ЧТО ОСТАЛОСЬ ----------
    // Огоньки — выбор. СУНДУК — награда: он говорит «здесь добыча» сам, без
    // подписи и без обучения, а числа прячет внутрь и показывает по нажатию.
    // Кнопка — цена. Три предмета, три роли, и каждый нажимается.
    renderStart() {
        const cfg = Backend.rogueConfig();
        const levels = Backend.rogueLevels();
        if (this.level == null) this.level = 0;
        if (this.level >= levels.length) this.level = levels.length - 1;
        const level = Backend.rogueLevel(this.level);
        const price = level.entry || (cfg ? cfg.entry : {});
        const enough = !Object.keys(price).some(key => GameState.currency(key) < price[key]);

        const picker = levels.map((l, i) => `
            <button type="button" class="rogue-level${i === this.level ? ' on' : ''}"
                    data-level="${i}">${l.sign}</button>`).join('');

        this.cardEl.className = 'rogue-card shown start';
        this.cardEl.innerHTML = `
            <div class="rogue-levels">${picker}</div>
            <button type="button" class="rogue-chest" id="rogue-chest">
                ${LootArt.chest()}
            </button>`;

        this.cardEl.querySelectorAll('.rogue-level').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.level = Number(btn.dataset.level) || 0;
                this.renderStart();
            };
        });
        const chest = this.cardEl.querySelector('#rogue-chest');
        if (chest) chest.onclick = (e) => { e.stopPropagation(); this.openChest(); };

        // Цена — на кнопке, которой платят, и больше нигде. Не хватило —
        // кнопка приглушена, а ЧЕГО не хватило, отвечает кошелёк в шапке.
        // Кнопка нажимается ВСЕГДА, даже когда не хватает: выключенная
        // кнопка не отвечает ничем, а игрок жмёт именно её. Приглушённость
        // говорит «дорого», а сам отказ показывает вспыхнувший жетон в шапке.
        this.setAction(this.priceText(price), () => this.start());
        if (this.actionEl) this.actionEl.classList.toggle('poor', !enough);
    },

    // ---------- ЧТО В СУНДУКЕ ----------
    // Открывается по нажатию на сундук и показывает то, что игрок ГАРАНТИРОВАННО
    // унесёт, пройдя забег целиком. Не «сколько примерно», не «с какой
    // вероятностью» — просто содержимое, как в любой игре с сундуками.
    //
    // Сложность переключается прямо здесь: от неё едет вся добыча, и заставлять
    // закрывать окно ради сравнения — то же самое, что заставлять запоминать.
    openChest() {
        const cfg = Backend.rogueConfig();
        const levels = Backend.rogueLevels();
        const level = Backend.rogueLevel(this.level);

        // Что падает за полный проход: складывается по карте, как и раньше, но
        // теперь вместе с кладовой — мясо роняют мини-босс и босс.
        const coin = {}, pantry = {};
        (cfg ? cfg.map : []).forEach(step => {
            if (!step.enemy) return;
            const reward = (cfg.enemies[step.enemy] || {}).reward || {};
            Object.keys(reward.currencies || {}).forEach(key => {
                coin[key] = (coin[key] || 0) + Math.round(reward.currencies[key] * (level.loot || 1));
            });
            Object.keys(reward.pantry || {}).forEach(key => {
                pantry[key] = (pantry[key] || 0) + Math.round(reward.pantry[key] * (level.loot || 1));
            });
        });

        // Жетоны и осколки — одна валюта: осколок это треть жетона, и «2 жетона
        // и 2 осколка» заставляло бы складывать. Считается в девятых и рисуется
        // как в кошельке: целые со счётчиком плюс остаток недособранным.
        const per = (ECONOMY.exchange.wrath_shard || {}).per || 3;
        const ninths = (coin.wrath_token || 0) * TokenArt.PIECES
                     + (coin.wrath_shard || 0) * (TokenArt.PIECES / per);
        const whole = Math.floor(ninths / TokenArt.PIECES);
        const rest = Math.round(ninths % TokenArt.PIECES);

        const rows = [];
        if (whole) rows.push(`${TokenArt.svg('wrath_token', 0, { whole: true })}<b>${whole}</b>`);
        if (rest) rows.push(TokenArt.svg('wrath_token', rest));
        const tokenRow = rows.length ? `<div class="loot-row">${rows.join('')}</div>` : '';
        const goldRow = coin.gold
            ? `<div class="loot-row">${currencyMark('gold')}<b>${coin.gold}</b></div>` : '';

        // Мясо рисуется ТЕМ ЖЕ рисунком, что лежит в холодильнике кухни: игрок
        // должен узнать его с первого взгляда и понять, куда оно поедет.
        // Своего мяса гнев не заводит (src/config/kitchen.js).
        const meatRow = Object.keys(pantry).map(key => {
            const art = (typeof KITCHEN_ART !== 'undefined' && KITCHEN_ART.ingredientRaw)
                ? `<svg class="loot-meat" viewBox="-72 -62 144 124" aria-hidden="true">
                       ${KITCHEN_ART.ingredientRaw(key, 1)}</svg>`
                : ((KITCHEN.ingredients[key] || {}).emoji || '');
            return `<div class="loot-row">${art}<b>${pantry[key]}</b></div>`;
        }).join('');

        const picker = levels.map((l, i) => `
            <button type="button" class="rogue-level${i === this.level ? ' on' : ''}"
                    data-level="${i}">${l.sign}</button>`).join('');

        this.cardEl.className = 'rogue-card shown chest';
        this.cardEl.innerHTML = `
            <div class="rogue-levels">${picker}</div>
            <button type="button" class="rogue-chest open" id="rogue-chest-close">
                ${LootArt.chest({ open: true })}
            </button>
            <div class="loot-list">${tokenRow}${goldRow}${meatRow}</div>`;

        this.cardEl.querySelectorAll('.rogue-level').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.level = Number(btn.dataset.level) || 0;
                // Перерисовывается открытый сундук, а не окно входа: игрок
                // сравнивает добычу, и закрывать его ради этого незачем.
                this.openChest();
            };
        });
        const close = this.cardEl.querySelector('#rogue-chest-close');
        if (close) close.onclick = (e) => { e.stopPropagation(); this.renderStart(); };

        // Кнопка внизу остаётся той же: цена и вход. Из открытого сундука можно
        // уйти прямо в забег, не закрывая его.
        const price = level.entry || (cfg ? cfg.entry : {});
        const enough = !Object.keys(price).some(key => GameState.currency(key) < price[key]);
        // Кнопка нажимается ВСЕГДА, даже когда не хватает: выключенная
        // кнопка не отвечает ничем, а игрок жмёт именно её. Приглушённость
        // говорит «дорого», а сам отказ показывает вспыхнувший жетон в шапке.
        this.setAction(this.priceText(price), () => this.start());
        if (this.actionEl) this.actionEl.classList.toggle('poor', !enough);
    },

    // ---------- ВЫБОР НАГРАДЫ ----------
    // Пока он не сделан, дальше по карте не пускает. Выбор лежит в состоянии
    // и переживает перезаход — иначе он терялся бы вместе со свёрнутой игрой.
    renderChoice(run) {
        const cfg = Backend.rogueConfig();
        const cards = (run.pending.choices || []).map(id => {
            const boost = cfg.boosts[id];
            if (!boost) return '';
            // Что даёт карточка — значком и числом. Названия у усиления
            // нет: «+2» рядом с мечом и есть название.
            return `
                <button type="button" class="rogue-boost" data-boost="${id}">
                    <span class="rogue-boost-emoji">${boost.emoji}</span>
                    <b>+${boost.damage || boost.hp || boost.armor}</b>
                </button>`;
        }).join('');

        this.cardEl.className = 'rogue-card shown';
        this.cardEl.innerHTML = `
            <div class="rogue-card-icon">🎁</div>
            <div class="rogue-boosts">${cards}</div>`;

        Array.prototype.forEach.call(this.cardEl.querySelectorAll('.rogue-boost'), el => {
            el.onclick = (e) => { e.stopPropagation(); this.chooseBoost(el.dataset.boost); };
        });

        this.setAction('👆', null);
    },

    // ---------- МАГАЗИН ЗАБЕГА ----------
    // Путь развилки, где зубы наконец тратятся. Витрина — три вещи, каждая
    // значком и ценой; купить можно сколько угодно, пока хватает зубов, а
    // уйти — кнопкой внизу.
    //
    // Что уже купил, из витрины НЕ пропадает: пустое место на месте вещи
    // читается как «сломалось». Оно гаснет и перестаёт нажиматься — так же,
    // как выкупленная ступень в лавке снаряжения.
    //
    // Названий нет и не будет: «🗡 +2» и есть название (инвариант 9).
    renderShop(run) {
        const cfg = Backend.rogueConfig();
        const shop = (cfg && cfg.shop) || { items: {} };
        const bought = run.pending.bought || [];

        const rows = (run.pending.offer || []).map(id => {
            const item = (shop.items || {})[id];
            if (!item) return '';
            // Пустая вещь показана так же, как купленная: она гаснет и не
            // нажимается. Перевязка на полном здоровье ничего не даст, а зубы
            // спишет — это ловушка, а не выбор.
            const sold = bought.indexOf(id) >= 0 || Backend.rogueEffectEmpty(run, item.effect);
            const poor = run.teeth < item.price;
            return `
                <button type="button" class="rogue-buy${sold ? ' sold' : ''}${poor ? ' poor' : ''}"
                        data-item="${id}" ${sold ? 'disabled' : ''}>
                    <span class="buy-emoji">${item.emoji}</span>
                    <b class="buy-gain">${this.effectText(item.effect, run)}</b>
                    <span class="buy-price">🦷 ${item.price}</span>
                </button>`;
        }).join('');

        this.cardEl.className = 'rogue-card shown shop';
        this.cardEl.innerHTML = `
            <div class="rogue-card-icon">💰</div>
            <div class="rogue-buys">${rows}</div>`;

        Array.prototype.forEach.call(this.cardEl.querySelectorAll('.rogue-buy'), el => {
            el.onclick = (e) => { e.stopPropagation(); this.buy(el.dataset.item); };
        });

        // Уйти из магазина — отдельным шагом: покупок может быть несколько, и
        // решает игрок, а не последняя цена.
        this.setAction('➜', () => {
            Backend.closeRogueShop();
            if (typeof Haptics !== 'undefined') Haptics.tick();
            this.render();
        });
    },

    buy(id) {
        const answer = Backend.buyRogueItem(id);
        if (!answer.ok) {
            // Не хватило зубов — вспыхивает их счётчик в строке забега. Это
            // тот же приём, что у кошелька в шапке: отказ показывается там,
            // где лежит недостающее, а не там, где нажали.
            if (answer.error === 'not_enough') {
                this.flashTeeth();
                if (typeof Haptics !== 'undefined') Haptics.notify('error');
            }
            return;
        }
        if (typeof Haptics !== 'undefined') Haptics.notify('success');
        this.flyGains(answer.gained);
        this.render();
    },

    // ---------- СЛУЧАЙНОЕ СОБЫТИЕ ----------
    // Каждое событие — ОБМЕН, и вариантов ровно два. Слева отдал, справа
    // получил, между ними стрелка: единственная раскладка, которая читается
    // без слов, когда стороны РАЗНЫЕ (docs/traps.md, п. 82). «Повезло / не
    // повезло» показать нечем, поэтому события здесь не лотерея, а решение.
    renderEvent(run) {
        const cfg = Backend.rogueConfig();
        const event = ((cfg && cfg.events) || {})[run.pending.id];
        if (!event) { Backend.takeRogueEvent(0); this.render(); return; }

        const rows = (event.options || []).map((opt, i) => {
            const give = this.effectText(opt, run, -1);
            const take = this.effectText(opt, run, 1);
            // Зубов не хватило — вариант гаснет. Долгов в забеге нет.
            const poor = opt.teeth < 0 && run.teeth < -opt.teeth;
            return `
                <button type="button" class="rogue-deal${poor ? ' poor' : ''}"
                        data-option="${i}" ${poor ? 'disabled' : ''}>
                    <span class="deal-give">${give}</span>
                    <span class="deal-arrow">➜</span>
                    <span class="deal-take">${take}</span>
                </button>`;
        }).join('');

        this.cardEl.className = 'rogue-card shown event';
        this.cardEl.innerHTML = `
            <div class="rogue-card-icon">${event.emoji}</div>
            <div class="rogue-deals">${rows}</div>`;

        Array.prototype.forEach.call(this.cardEl.querySelectorAll('.rogue-deal'), el => {
            el.onclick = (e) => { e.stopPropagation(); this.takeEvent(Number(el.dataset.option)); };
        });

        this.setAction('👆', null);
    },

    takeEvent(index) {
        const answer = Backend.takeRogueEvent(index);
        if (!answer.ok) {
            if (answer.error === 'not_enough') this.flashTeeth();
            return;
        }
        if (typeof Haptics !== 'undefined') Haptics.impact('medium');
        this.flyGains(answer.gained);
        this.render();
    },

    // ---------- ЭФФЕКТ СТРОКОЙ ----------
    // Один формат на товар магазина и на вариант события: значок и число.
    // sign выбирает, какую половину показать, — отрицательную (цена) или
    // положительную (награда): из этого и складывается обмен со стрелкой.
    //
    // Доля здоровья переводится в ЧИСЛО хп прямо здесь. «30%» игроку нечего
    // делить в уме, а «+6» он сравнит с полосой над картой одним взглядом.
    effectText(eff, run, sign) {
        if (!eff) return '';
        const want = (v) => sign == null || (sign > 0 ? v > 0 : v < 0);
        const out = [];

        // ТРИ ЗНАЧКА НА ВСЁ. Здесь стоял четвёртый — 💪 для maxHp, — и он
        // ничего не значил: рядом ❤️ было здоровьем, 🗡 уроном, 🛡 бронёй, а
        // 💪 непонятно чем. Механика у него была ровно та же, что у здоровья
        // (поднять максимум и вылечить), поэтому значок теперь общий.
        const hp = (eff.hp || 0) + (eff.hpShare ? (run ? run.maxHp : 20) * eff.hpShare : 0);
        if (hp && want(hp)) out.push(`❤️ ${hp > 0 ? '+' : '−'}${Math.abs(Math.round(hp))}`);
        if (eff.damage && want(eff.damage)) out.push(`🗡 +${eff.damage}`);
        if (eff.armor && want(eff.armor)) out.push(`🛡 +${eff.armor}`);
        if (eff.teeth && want(eff.teeth)) {
            out.push(`🦷 ${eff.teeth > 0 ? '+' : '−'}${Math.abs(eff.teeth)}`);
        }
        Object.keys(eff.currencies || {}).forEach(key => {
            if (want(eff.currencies[key])) out.push(`${currencyMark(key)} +${eff.currencies[key]}`);
        });
        return out.join(' ');
    },

    // Не хватило зубов — дёргается их счётчик в строке забега, а не кнопка,
    // по которой нажали: отказ показывается там, где лежит недостающее.
    flashTeeth() {
        const el = this.statusEl && this.statusEl.querySelector('.rogue-teeth');
        if (!el) return;
        el.classList.remove('lack');
        void el.offsetWidth;
        el.classList.add('lack');
    },

    // ---------- ИТОГ ЗАБЕГА ----------
    // Отдельный экран, а не сообщение поверх предложения войти. Причина та
    // же, по которой в бою кнопка «Окей» появляется с задержкой: забег
    // кончился, палец ещё на кнопке, а следующий тап по этому же месту стоил
    // бы жетона. Единственная кнопка здесь — уход в лобби.
    renderSummary() {
        const s = this.summary;
        const won = Object.keys(s.currencies || {})
            .map(key => `${currencyMark(key)} +${s.currencies[key]}`).join('  ');
        // Сгоревшие зубы показаны минусом: это и есть «они живут только
        // внутри забега», сказанное числом.
        const lost = s.teethLost ? `🦷 −${s.teethLost}` : '';

        // Знак итога: кубок за пройденный, череп за проигранный и белый флаг
        // за брошенный. Три разных конца — три разных знака: череп над
        // забегом, который игрок бросил сам, сказал бы неправду.
        const sign = s.win ? '🏆' : (s.abandoned ? '🏳️' : '💀');
        this.cardEl.className = `rogue-card shown ${s.win ? 'win' : 'lose'}`;
        this.cardEl.innerHTML = `
            <div class="rogue-card-icon">${sign}</div>
            <div class="rogue-card-row">${s.nodesDone}/${s.nodesTotal}</div>
            ${won ? `<div class="rogue-card-row loot">${won}</div>` : ''}
            ${lost ? `<div class="rogue-card-row lost">${lost}</div>` : ''}`;

        this.setAction('↩', () => this.host.showLobby());
    },

    setAction(text, onClick) {
        if (!this.actionEl) return;
        this.actionEl.innerHTML = `<b>${text}</b>`;
        this.actionEl.disabled = !onClick;
        this.actionEl.onclick = onClick
            ? (e) => { e.stopPropagation(); onClick(); }
            : null;
    },

    // ---------- ДЕЙСТВИЯ ----------
    // Вход: жетон списан — это и говорится, минусом на жетоне. Не хватило —
    // тот же жетон вспыхивает красным в кошельке.
    // ---------- ОТКАЗ ОТВЕЧАЕТ ----------
    // Не хватило жетона — вспыхивает сам жетон в шапке, ровно как в лавке и
    // в прокачке (WrathLobby.flashLack). До этого здесь молчали дважды:
    // кнопка входа при нехватке была ВЫКЛЮЧЕНА (disabled), то есть тап по ней
    // не доходил вообще, а если бы и дошёл — записывалась переменная lack,
    // которую никто не читал. Игрок жал на приглушённую кнопку и не получал
    // ничего: ни ответа, ни причины.
    start() {
        const answer = Backend.startRun(this.level);
        if (!answer.ok) {
            if (typeof WrathLobby !== 'undefined') {
                WrathLobby.flashLack(answer.currency || 'wrath_token');
            }
            if (typeof Haptics !== 'undefined') Haptics.notify('error');
            return;
        }
        if (typeof Haptics !== 'undefined') Haptics.impact('medium');
        // О списанном жетоне здесь не сообщается: цифра уже вылетела из
        // кошелька в шапке (src/core/wallet-fx.js). Строка «🔴 −1» под картой
        // висела до следующей перерисовки, говорила ровно то, что было
        // написано на только что нажатой кнопке, и с кошельком никак не
        // связывалась.
        this.render();
    },

    // ---------- УДЕРЖАНИЕ ФЛАГА ----------
    // Полторы секунды пальцем на флаге. Кнопка при этом наливается — это и
    // есть объяснение жеста: нажал, увидел, что что-то набирается, держишь
    // дальше. Отпустил раньше — ничего не случилось.
    //
    // Слушатели на pointer*, а не на click: клик приходит уже ПОСЛЕ отпускания
    // и о том, сколько палец лежал, не знает вовсе.
    bindAbandon() {
        const el = this.abandonEl;
        if (!el) return;
        el.style.touchAction = 'none';

        const start = (e) => {
            if (!Backend.run() || this.abandonTimer) return;
            e.preventDefault();
            e.stopPropagation();
            el.classList.add('holding');
            if (typeof Haptics !== 'undefined') Haptics.tick();
            this.abandonTimer = setTimeout(() => {
                this.abandonTimer = null;
                el.classList.remove('holding');
                // Тяжёлая отдача: то, что случилось, дорого стоит.
                if (typeof Haptics !== 'undefined') Haptics.impact('heavy');
                this.takeAbandon(Backend.abandonRun());
            }, this.ABANDON_MS);
        };

        el.addEventListener('pointerdown', start);
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(name => {
            el.addEventListener(name, () => this.cancelAbandon());
        });

        // Палец УЕХАЛ с кнопки, не отпуская, — это тоже «передумал», и на
        // пальце это единственный способ передумать аккуратно.
        //
        // Проверяется КООРДИНАТАМИ, а не pointerleave. Причина в том, как
        // браузер ведёт себя с касанием: на touch он молча захватывает
        // указатель за элементом, pointermove продолжает приходить сюда же, а
        // pointerleave не приходит до самого отпускания. То есть на мыши
        // отмена работала бы, а на телефоне — нет, и уехавший палец всё равно
        // бросал бы забег. Для действия без отмены это недопустимо.
        el.addEventListener('pointermove', (e) => {
            if (!this.abandonTimer) return;
            const r = el.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right
                || e.clientY < r.top || e.clientY > r.bottom) this.cancelAbandon();
        });
    },

    cancelAbandon() {
        if (this.abandonTimer) { clearTimeout(this.abandonTimer); this.abandonTimer = null; }
        if (this.abandonEl) this.abandonEl.classList.remove('holding');
    },

    // ---------- БРОШЕННЫЙ ЗАБЕГ КОНЧАЕТСЯ ИТОГОМ ----------
    // Раньше бросок просто стирал забег и звал render(), а тот показывал ОКНО
    // ВХОДА. Дальше происходило вот что: флаг живёт в одной строке с кнопкой
    // действия и при отсутствии забега ПРОПАДАЛ вместе со своим местом —
    // кнопка входа растягивалась на всю ширину и вставала ровно под палец,
    // который только что держал флаг. Следующий тап по тому же месту платил
    // жетон за новый забег. Тап, тап, тап — и кошелёк пуст.
    //
    // Теперь брошенный забег кончается тем же итоговым окном, что и любой
    // другой: с него уходят одной кнопкой в лобби, и платящей кнопки на
    // экране нет вовсе. Механизм не новый — он ровно для этого и заведён
    // («забег кончился, палец ещё на кнопке, а вход стоит жетон»).
    takeAbandon(answer) {
        if (!answer || !answer.ok) { this.render(); return; }
        this.summary = {
            win: false,
            abandoned: true,
            nodesDone: answer.nodesDone,
            nodesTotal: answer.nodesTotal,
            currencies: {},
            teethLost: answer.teethLost || 0
        };
        this.render();
    },

    chooseBoost(id) {
        const cfg = Backend.rogueConfig();
        const answer = Backend.chooseBoost(id);
        if (!answer.ok) { this.render(); return; }
        // Что взяли — видно по самому усилению: оно встаёт чипом в строку
        // забега, рядом со здоровьем и зубами. Отдельная строка сообщала о
        // том же самом вторым способом.
        this.render();
    },

    // Узел карты. Бой уходит на экран боя и возвращается оттуда колбэками,
    // остальное решается на месте.
    enterNode(index, option) {
        const run = Backend.run();
        if (!run || run.pending || index !== run.node) return;
        const node = run.map[index];
        if (!node || node.locked) return;

        // Развилка: прошли выбранным путём, дорога сходится дальше сама.
        if (node.kind === 'fork') {
            this.takeAnswer(Backend.resolveNode('win', option));
            this.render();
            return;
        }

        const enemy = Backend.rogueEnemy(node);
        if (enemy) {
            this.host.startRogueFight({
                enemy,
                hp: run.hp,
                maxHp: run.maxHp,
                bonus: run.bonus,
                // Исход засчитывается сразу по концу боя, а не по кнопке
                // «Окей»: здоровье уже записано, и закрытая между ними игра
                // не должна стирать бой.
                onResult: (outcome) => this.takeFight(outcome),
                onClose: () => this.host.showRogue()
            });
            return;
        }

        this.takeAnswer(Backend.resolveNode('win'));
        this.render();
    },

    // Ответ на бой: узел засчитан, а строкой возвращается то, что показать
    // прямо в окне боя, не отправляя игрока смотреть на карту.
    takeFight(outcome) {
        const answer = Backend.resolveNode(outcome === 'win' ? 'win' : 'lose');
        this.takeAnswer(answer);
        if (!answer || !answer.ok) return '';
        if (answer.outcome !== 'win') return '💀';
        return this.gainText(answer.gained) || '';
    },

    // Разбор ответа Backend: что показать и не кончился ли забег.
    takeAnswer(answer) {
        if (!answer || !answer.ok) return;
        if (answer.finished) {
            this.summary = {
                win: answer.outcome === 'win',
                nodesDone: answer.nodesDone,
                nodesTotal: answer.nodesTotal,
                currencies: (answer.gained && answer.gained.currencies) || {},
                teethLost: answer.teethLost || 0
            };
            return;
        }
        this.flyGains(answer.gained);
    },

    // ---------- ДОБЫЧА ПОКАЗЫВАЕТСЯ НА СЧЁТЧИКАХ ----------
    // Валюты (жетон, осколок, золото) вылетают сами: их показывает WalletFx
    // прямо из кошелька в шапке, по событию от GameState.addCurrency. Здесь
    // остаются два счётчика, которых в кошельке нет, — зубы и здоровье
    // забега. Они живут внутри забега и стоят в строке над картой, поэтому
    // цифра вылетает оттуда же. Мясо не показывается: оно едет в кладовую
    // кухни, счётчика на этом экране у него нет, и строка награды в окне боя
    // о нём уже сказала.
    flyGains(gained) {
        if (typeof WalletFx === 'undefined') return;
        const g = gained || {};
        if (g.teeth) WalletFx.show('teeth', g.teeth, '🦷');
        if (g.healed) WalletFx.show('hp', g.healed, '❤️');
    },

    gainText(gained) {
        const g = gained || {};
        const parts = [];
        if (g.teeth) parts.push(`🦷 +${g.teeth}`);
        if (g.healed) parts.push(`❤️ +${g.healed}`);
        Object.keys(g.currencies || {}).forEach(key => {
            parts.push(`${currencyMark(key)} +${g.currencies[key]}`);
        });
        // МЯСО. Сундук его обещал — значит, в момент выпадения оно обязано
        // появиться в строке, иначе обещание нечем подтвердить. Рисунок тот
        // же, что в сундуке и в холодильнике кухни: продукт узнаётся, а не
        // читается.
        Object.keys(g.pantry || {}).forEach(key => {
            const art = (typeof KITCHEN_ART !== 'undefined' && KITCHEN_ART.ingredientRaw)
                ? `<svg class="gain-meat" viewBox="-72 -62 144 124" aria-hidden="true">
                       ${KITCHEN_ART.ingredientRaw(key, 1)}</svg>`
                : ((KITCHEN.ingredients[key] || {}).emoji || '');
            parts.push(`${art} +${g.pantry[key]}`);
        });
        return parts.join(' · ');
    },

    priceText(price) {
        return Object.keys(price || {})
            .map(key => `${currencyMark(key)} ${price[key]}`).join(' · ');
    },
});
