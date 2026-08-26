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
    MODES: [
        { key: 'duel',  emoji: '⚔️', name: 'Бой с ботом',   note: 'быстрый бой один на один', ready: true },
        { key: 'pvp',   emoji: '🤝', name: 'Бой с игроком', note: 'по коду комнаты',           ready: false },
        { key: 'rogue', emoji: '🗺', name: 'Рогалик',       note: 'за жетон гнева',            ready: false },
        { key: 'shop',  emoji: '🏪', name: 'Магазин гнева', note: 'снаряжение за жетоны',      ready: true }
    ],

    host: null,
    root: null,
    statsEl: null,
    columns: null,
    wormStage: null,
    modesEl: null,
    cardEl: null,
    wormHandle: null,
    openSlot: null,
    scarLineEl: null,
    toastEl: null,
    askEl: null,
    toastTimer: null,
    healClock: null,

    init(host) {
        this.host = host;
        this.root = document.getElementById('wrath-lobby');
        if (!this.root) return;

        this.statsEl = document.getElementById('wrath-stats');
        this.columns = {
            left: document.getElementById('wrath-gear-left'),
            right: document.getElementById('wrath-gear-right')
        };
        this.wormStage = document.getElementById('wrath-lobby-worm');
        this.wormBox = this.wormStage ? this.wormStage.parentElement : null;
        this.modesEl = document.getElementById('wrath-modes');
        this.cardEl = document.getElementById('wrath-slot-card');
        this.scarLineEl = document.getElementById('wrath-scar-line');
        this.toastEl = document.getElementById('wrath-toast');
        this.askEl = document.getElementById('wrath-ask');

        this.buildSlots();
        this.buildModes();

        // Тап по червю — обмен шрамов. Обработчик на коробке, а не на самом
        // SVG: тело узкое и извилистое, попасть по нему пальцем труднее, чем
        // по области, где он стоит. Промахнуться некуда — в этой области
        // больше ничего нет.
        if (this.wormBox) {
            this.wormBox.style.pointerEvents = 'auto';
            this.wormBox.addEventListener('click', (e) => {
                e.stopPropagation();
                this.tapWorm();
            });
        }

        const yes = document.getElementById('wrath-ask-yes');
        const no = document.getElementById('wrath-ask-no');
        if (yes) yes.onclick = (e) => { e.stopPropagation(); this.confirmExchange(); };
        if (no) no.onclick = (e) => { e.stopPropagation(); this.hideAsk(); };

        // Тап мимо карточки закрывает её. Слушатель на самом экране, а не на
        // документе: закрытая мини-игра не должна ничего ловить.
        this.root.addEventListener('click', (e) => {
            if (this.askEl && this.askEl.contains(e.target)) return;
            if (!this.openSlot) return;
            if (this.cardEl.contains(e.target)) return;
            if (e.target.closest('.gear-slot')) return;
            this.hideCard();
        });
    },

    // ---------- ЖИЗНЕННЫЙ ЦИКЛ ЭКРАНА ----------
    enter() {
        this.mountWorm();
        this.refresh();
        // Пока лобби открыто, число здоровья пересчитывается раз в секунду:
        // иначе игрок смотрит на «3 из 13» и не видит, что оно растёт.
        if (!this.healClock) {
            this.healClock = WrathFighter.startHealClock(() => this.refreshHealth());
        }
    },

    leave() {
        if (this.wormHandle) {
            this.wormHandle.destroy();
            this.wormHandle = null;
        }
        if (this.healClock) {
            this.healClock.stop();
            this.healClock = null;
        }
        this.hideCard();
        this.hideAsk();
        this.hideToast();
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

        // Вписывается по реальному силуэту и только после первого кадра:
        // сегменты получают transform в tick(), не при сборке.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            WrathFighter.fitWorm(this.wormHandle, this.wormStage, this.wormBox, 0.95);
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
            el.innerHTML = `
                <span class="gear-icon"></span>
                <span class="gear-label">${slot.name}</span>
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
            el.innerHTML = `
                <span class="mode-emoji">${mode.ready ? mode.emoji : '🔒'}</span>
                <span class="mode-text">
                    <span class="mode-name">${mode.name}</span>
                    <span class="mode-note" data-note="${mode.key}">${mode.ready ? mode.note : 'скоро — ' + mode.note}</span>
                </span>
            `;
            el.onclick = (e) => {
                e.stopPropagation();
                // Проверяется класс, а не поле конфига: бой ещё и запирается
                // на время зарастания червя.
                if (el.classList.contains('locked')) {
                    if (mode.key === 'duel') {
                        const health = WrathFighter.playerHp();
                        this.showToast(`Червь без сил — зарастает: ${health.healSeconds} с`);
                    }
                    return;
                }
                this.host.startMode(mode.key);
            };
            this.modesEl.appendChild(el);
        });
    },

    // Показать текущее состояние: что надето и что это даёт.
    refresh() {
        const equipment = (GameState.data && GameState.data.equipment) || {};

        WRATH_GEAR.slots.forEach(slot => {
            const el = this.root.querySelector(`.gear-slot[data-slot="${slot.key}"]`);
            if (!el) return;
            const item = WRATH_GEAR.items[equipment[slot.key]];
            const icon = el.querySelector('.gear-icon');
            const label = el.querySelector('.gear-label');
            el.classList.toggle('filled', !!item);
            icon.textContent = item ? item.emoji : slot.emoji;
            label.textContent = item ? item.name : slot.name;
        });

        // Кошелёк показан там, где он что-то значит, — в строке магазина.
        // Отдельной панели для двух чисел не заводим: экран и так плотный.
        const shopNote = this.root.querySelector('.mode-note[data-note="shop"]');
        if (shopNote) {
            const per = (ECONOMY.exchange.wrath_shard && ECONOMY.exchange.wrath_shard.per) || 3;
            shopNote.textContent = `🎟 ${GameState.currency('wrath_token')} · `
                + `🩸 ${GameState.currency('wrath_shard')}/${per} до жетона`;
        }

        if (this.statsEl) {
            const s = WrathFighter.summary(WrathFighter.stats(equipment));
            this.statsEl.innerHTML = `
                <span class="stat" id="wrath-hp-stat"></span>
                <span class="stat"><b>🗡 ${s.damage}</b><i>урон</i></span>
                <span class="stat"><b>🛡 ${s.armor}</b><i>броня гол/тело/хвост</i></span>
            `;
        }

        this.refreshHealth();
        this.refreshScarLine();
    },

    // ---------- ЗДОРОВЬЕ ----------
    // Отдельно от общего refresh: пересчитывается раз в секунду, а
    // перестраивать ради этого весь экран незачем.
    refreshHealth() {
        const health = WrathFighter.playerHp();

        const hpStat = this.root.querySelector('#wrath-hp-stat');
        if (hpStat) {
            hpStat.innerHTML = health.full
                ? `<b>❤️ ${health.max}</b><i>здоровье</i>`
                : `<b class="hurt">❤️ ${health.hp}/${health.max}</b><i>зарастает: ${health.healSeconds} с</i>`;
        }

        // Драться без здоровья нельзя — и это не поломка, а ожидание. Кнопка
        // не прячется, а говорит, сколько осталось ждать.
        const duelBtn = this.root.querySelector('.mode-btn[data-mode="duel"]');
        if (duelBtn) {
            const dead = health.hp <= 0;
            duelBtn.classList.toggle('locked', dead);
            duelBtn.classList.toggle('ready', !dead);
            const note = duelBtn.querySelector('.mode-note');
            const mode = this.MODES.find(m => m.key === 'duel');
            if (note) {
                note.textContent = dead
                    ? `червь без сил — зарастает: ${health.healSeconds} с`
                    : (mode ? mode.note : '');
            }
        }
    },

    // ---------- СТРОКА ШРАМОВ ----------
    // Она же подсказка про тап: без неё обмен — невидимая функция.
    refreshScarLine() {
        if (!this.scarLineEl) return;
        const rule = ECONOMY.marks.exchange;
        const have = (GameState.data.scars || []).length;
        const conf = ECONOMY.currencies[rule.currency];
        const ready = have >= rule.scars;

        this.scarLineEl.classList.toggle('ready', ready);
        this.scarLineEl.textContent = ready
            ? `🩹 ${have} шрамов — тапни по червю, чтобы обменять ${rule.scars} на ${conf ? conf.emoji : ''} ${rule.amount}`
            : `🩹 шрамы: ${have} из ${rule.scars} до обмена`;
    },

    // ---------- ОБМЕН ШРАМОВ ----------
    // Тап по червю. Мало шрамов — просто всплывает сообщение и гаснет:
    // диалог с кнопкой «ок» здесь был бы наказанием за любопытство. Хватает —
    // спрашиваем, потому что шрамы не вернуть.
    tapWorm() {
        if (this.openSlot) { this.hideCard(); return; }
        const rule = ECONOMY.marks.exchange;
        const have = (GameState.data.scars || []).length;

        if (have < rule.scars) {
            this.showToast(`Шрамов мало: ${have} из ${rule.scars}`);
            return;
        }
        this.showAsk(rule, have);
    },

    showAsk(rule, have) {
        if (!this.askEl) return;
        const conf = ECONOMY.currencies[rule.currency];
        const textEl = document.getElementById('wrath-ask-text');
        if (textEl) {
            textEl.innerHTML = `Обменять ${rule.scars} шрамов на `
                + `<b>${conf ? conf.emoji : ''} ${rule.amount}</b>?<br>`
                + `<span class="ask-sub">Сойдут самые старые. Останется ${have - rule.scars}.</span>`;
        }
        this.askEl.classList.add('show');
    },

    hideAsk() {
        if (this.askEl) this.askEl.classList.remove('show');
    },

    confirmExchange() {
        const answer = Backend.exchangeScars();
        this.hideAsk();
        if (!answer.ok) {
            this.showToast('Обменять не вышло');
            return;
        }

        const conf = ECONOMY.currencies[answer.currency];
        this.showToast(`${answer.removed} шрамов сошло · ${conf ? conf.emoji : ''} +${answer.amount}`);

        // Тело перерисовывается сразу: обмен — это в первую очередь про то,
        // как червь выглядит. И здесь, и на главном экране.
        if (this.wormHandle) {
            this.wormHandle.setOverride({ scars: GameState.data.scars });
        }
        if (typeof refreshWormMarks === 'function') refreshWormMarks();
        this.refresh();
    },

    // ---------- ВСПЛЫВАЮЩЕЕ СООБЩЕНИЕ ----------
    showToast(text) {
        if (!this.toastEl) return;
        this.toastEl.textContent = text;
        this.toastEl.classList.add('show');
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => this.hideToast(), 2200);
    },

    hideToast() {
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
            this.toastTimer = null;
        }
        if (this.toastEl) this.toastEl.classList.remove('show');
    },

    // ---------- КАРТОЧКА СЛОТА ----------
    // Что в слоте, что это даёт и чем заменить. Пока предметов нет ни у кого,
    // карточка честно говорит, откуда они возьмутся, — пустой слот без
    // объяснения читается как поломка.
    showCard(slotKey) {
        const slot = WRATH_GEAR.slots.find(s => s.key === slotKey);
        if (!slot || !this.cardEl) return;

        const equipment = (GameState.data && GameState.data.equipment) || {};
        const inventory = (GameState.data && GameState.data.inventory) || {};
        const equippedId = equipment[slotKey];

        const available = Object.keys(inventory).filter(id => {
            const item = WRATH_GEAR.items[id];
            return item && item.slot === slotKey && id !== equippedId;
        });

        const rows = available.map(id => {
            const item = WRATH_GEAR.items[id];
            return `<button type="button" class="card-item" data-item="${id}">
                        <span>${item.emoji} ${item.name}</span>
                        <span class="card-item-stat">${this.itemStatText(item)}</span>
                    </button>`;
        }).join('');

        const equipped = WRATH_GEAR.items[equippedId];
        this.cardEl.innerHTML = `
            <div class="card-head">
                <span class="card-title">${slot.emoji} ${slot.name}</span>
                <span class="card-hint">${slot.hint}</span>
            </div>
            ${equipped
                ? `<div class="card-current">Надето: ${equipped.emoji} ${equipped.name}
                       <span class="card-item-stat">${this.itemStatText(equipped)}</span>
                   </div>
                   <button type="button" class="card-item strip" data-item="">Снять</button>`
                : '<div class="card-current empty">Слот пуст</div>'}
            ${rows || (available.length ? '' : `<div class="card-note">Надеть нечего: предметы появятся в магазине гнева и в рогалике.</div>`)}
        `;

        this.cardEl.querySelectorAll('.card-item').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                // Надевает Backend, а не интерфейс: проверки «есть ли предмет»
                // и «тот ли слот» на сервере будут теми же самыми.
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

    itemStatText(item) {
        const parts = [];
        if (item.damage) parts.push(`+${item.damage} урон`);
        if (item.hp) parts.push(`+${item.hp} ХП`);
        if (item.armor) {
            const names = { head: 'голова', body: 'тело', tail: 'хвост' };
            Object.keys(item.armor).forEach(zone => {
                if (item.armor[zone]) parts.push(`−${item.armor[zone]} урона в ${names[zone] || zone}`);
            });
        }
        return parts.join(' · ');
    }
};

if (typeof window !== 'undefined') {
    window.WrathLobby = WrathLobby;
}
