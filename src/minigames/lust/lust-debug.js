// ================= DEBUG-ПАНЕЛЬ ПОХОТИ =================
// Видна при включённом DebugMode и только пока открыта ванная. Не игра,
// поэтому правило «ни одного слова» (инвариант 9) сюда не распространяется.
//
// ---------- ЗАЧЕМ ----------
// Прокачка похоти меряется месяцами (309 дней у среднего игрока), и главное,
// что в ней надо проверять, — РУКОЙ, а не цифрой: как хвост слушается свайпа
// на нулевой ступени и на десятой. Честным путём до десятой ступени полгода.
// Тут ступени ставятся кнопкой, жетоны выдаются кнопкой, а до финала можно
// дойти, не отмывая червя каждый раз заново.
//
// Две кнопки здесь не прихоть, а условие проверки:
//   «награда готова» — после игры на жетон таймер награды закрыт на 6 часов,
//                      и следующий забег был бы «только помыть», без хвоста;
//   «сразу в финал»  — хвост при разных ступенях сравнивается десятки раз
//                      подряд, и мытьё перед каждым заходом съедало бы всё
//                      время проверки.
//
// ---------- ЧЕГО ЗДЕСЬ НЕТ ----------
// Ничего, что начисляет награду в обход конфига (инвариант 2). Жетоны
// выдаются той же дверью, что и в других грехах (Backend.grantCurrency,
// помеченная как debug), а ступени ставятся прямо в состояние: это не
// покупка, а перемотка к нужной ступени, и списывать за неё незачем.
const LustDebug = {
    panel: null,
    host: null,

    init(hostEl) {
        if (this.panel || !hostEl) return;
        if (typeof DebugMode === 'undefined' || typeof ECONOMY === 'undefined') return;
        // Панель кладётся ВНУТРЬ рамки окна: экран мини-игры растянут на весь
        // вьюпорт, и его верх на телефоне уходит под чёлку — кнопки видно, а
        // нажать нельзя (то же решение, что у тщеславия).
        this.host = hostEl.querySelector('.mg-body') || hostEl;

        this.panel = document.createElement('div');
        this.panel.id = 'lu-debug';
        // Пальцы панели не должны доходить до сцены: иначе тап по «+»
        // заодно включал бы душ или брал мыло под панелью.
        this.panel.addEventListener('pointerdown', (e) => e.stopPropagation());
        this.panel.addEventListener('click', (e) => {
            const act = e.target && e.target.getAttribute('data-act');
            if (!act) return;
            e.stopPropagation();
            this.run(act);
        });
        this.host.appendChild(this.panel);

        DebugMode.onChange(() => this.render());
        this.render();
    },

    conf() { return ECONOMY.minigames.lust.upgrades; },
    lines() { return this.conf().order; },

    // Ступень ставится прямо в состояние. Ступень мыла меняет СКОРОСТЬ шкалы,
    // поэтому шкала сперва фиксируется на сейчас — ровно как при покупке
    // (Backend.buyUpgrade): иначе новая скорость пересчитала бы прошедшее
    // время, и шкала прыгнула бы.
    setLevel(key, lvl) {
        const branch = this.conf()[key];
        const next = Math.max(0, Math.min(branch.levels.length, lvl));
        if ((ECONOMY.sins.lust || {}).drainUpgrade === key)
            GameState.setSinValue('lust', GameState.sinValue('lust'));
        GameState.data.upgrades['lust_' + key] = next;
    },

    level(key) { return GameState.upgradeLevel('lust_' + key); },

    run(act) {
        if (!GameState.data) return;
        const [cmd, key] = act.split(':');

        if (cmd === 'tok') Backend.grantCurrency('lust_token', +key);
        else if (cmd === 'up') this.setLevel(key, this.level(key) + 1);
        else if (cmd === 'dn') this.setLevel(key, this.level(key) - 1);
        else if (cmd === 'min') this.setLevel(key, 0);
        else if (cmd === 'max') this.setLevel(key, this.conf()[key].levels.length);
        else if (cmd === 'allmin') this.lines().forEach(k => this.setLevel(k, 0));
        else if (cmd === 'allmax') this.lines().forEach(k => this.setLevel(k, this.conf()[k].levels.length));
        else if (cmd === 'ready') GameState.data.sins.lust.paid_at = null;
        else if (cmd === 'finale') this.jumpToFinale();
        GameState.save();

        // Прилавок, если открыт, обязан показать новые ступени и кошелёк.
        if (typeof LustShop !== 'undefined' && LustShop.open) LustShop.render();
        if (typeof GameManager !== 'undefined' && GameManager.updateUI) GameManager.updateUI();
        this.render();
    },

    // ---------- СРАЗУ В ФИНАЛ ----------
    // Тем же путём, каким туда приходит игра, только без мытья, пузырей и
    // поглаживания: вода включается, хвост встаёт на место, заряд полный, и
    // стартует финал. Своего кода финала здесь нет — только вызовы той же
    // мини-игры, чтобы проверялось ровно то, что играется.
    jumpToFinale() {
        const L = (typeof LustMinigame !== 'undefined') ? LustMinigame : null;
        if (!L || !L.screenElement || !L.screenElement.classList.contains('active')) return;
        if (typeof LustShop !== 'undefined') LustShop.close();
        L.stopClocks();
        L.stopPanting();
        L.drag = null;
        L.startWater();
        // startWater через секунду переводит забег к мылу — здесь это лишнее.
        if (L.fillRaf) { cancelAnimationFrame(L.fillRaf); L.fillRaf = 0; }
        L.paidRun = true;
        L.pile = null;
        L.raiseTail();
        // Пузырей и горки не будет: хвост сразу открыт.
        L.bubbles = [];
        L.el('bt-foam').innerHTML = '';
        L.el('bt-bubbles').innerHTML = '';
        L.charge = 1;
        L.startFinale();
    },

    render() {
        if (!this.panel) return;
        this.panel.classList.toggle('visible', !!DebugMode.enabled);
        if (!DebugMode.enabled || !GameState.data) return;
        // Ещё раз — когда рамка окна доехала. На входе в ванную рамка
        // въезжает масштабом (0.94 → 1 за 0.3 с, minigame-window.css), и
        // замер в этот момент видит тело окна ниже, чем оно встанет: отступ
        // выходил нулевым, и панель оставалась под инспектором.
        this.placeBelowInspector();
        clearTimeout(this.placeTimer);
        this.placeTimer = setTimeout(() => this.placeBelowInspector(), 420);

        const conf = this.conf();
        const line = (key) => {
            const lvl = this.level(key), max = conf[key].levels.length;
            return `<span class="lu-debug-tag">${conf[key].emoji}${lvl}/${max}</span>` +
                   `<button data-act="min:${key}">0</button>` +
                   `<button data-act="dn:${key}">−</button>` +
                   `<button data-act="up:${key}">+</button>` +
                   `<button data-act="max:${key}">макс</button>`;
        };
        const t = (typeof LustMinigame !== 'undefined' && LustMinigame.tailTier)
            ? LustMinigame.tailTier() : {};
        const r = Backend.rewardReady('lust');
        const fmt = (h) => (Math.round(h * 10) / 10).toString();

        this.panel.innerHTML = `
            <div class="lu-debug-row">
                <span class="lu-debug-tag">💗${GameState.currency('lust_token')}
                    💧${GameState.currency('lust_shard')}</span>
                <button data-act="tok:10">+10</button>
                <button data-act="tok:100">+100</button>
                <span class="lu-debug-tag">награда ${r.ready ? 'готова' : 'через ' + fmt(r.hoursLeft) + ' ч'}</span>
                <button data-act="ready">награда готова</button>
            </div>
            ${this.lines().map(k => `<div class="lu-debug-row">${line(k)}</div>`).join('')}
            <div class="lu-debug-row">
                <button data-act="allmin">всё 0</button>
                <button data-act="allmax">всё макс</button>
                <button data-act="finale">сразу в финал</button>
            </div>
            <div class="lu-debug-row">
                <span class="lu-debug-tag">толчков ${t.shots} · сила ${(t.minPower || 0).toFixed(2)}…${(t.maxPower == null ? 1 : t.maxPower).toFixed(2)}
                    · ±${t.spread}° · отдача ${t.gain} · выпрям. ${t.relax}</span>
            </div>
            <div class="lu-debug-row">
                <span class="lu-debug-tag">шкала пустеет за ${fmt(GameState.drainHours('lust'))} ч ·
                    награда раз в ${fmt(GameState.rewardCooldownHours('lust'))} ч</span>
            </div>`;
    }
};

// Панель инспектора персонажа (#wi-panel) в debug-режиме висит поверх
// всего у верхнего края — и накрывала первую строку этой панели: кнопки
// «+10» и «награда готова» были видны, но тап уходил инспектору. Поэтому
// панель встаёт ПОД ним, и отступ меряется, а не угадывается: инспектор
// живёт в пикселях экрана, а эта панель — в единицах холста, и перевод
// между ними — масштаб холста (инвариант 11).
LustDebug.placeBelowInspector = function () {
    const wi = document.getElementById('wi-panel');
    let top = 0;
    // Отсчёт — от того, относительно кого панель ДЕЙСТВИТЕЛЬНО стоит
    // (offsetParent), а не от хозяина: тело окна не позиционировано, и
    // `top` у панели считается от рамки над ним. Первая версия мерила от
    // тела окна и промахивалась ровно на высоту шапки.
    const base = this.panel.offsetParent || this.host;
    if (wi && getComputedStyle(wi).display !== 'none' && base) {
        const w = wi.getBoundingClientRect(), h = base.getBoundingClientRect();
        const k = h.width / (base.offsetWidth || h.width) || 1;
        top = Math.max(0, (w.bottom - h.top) / k + 4);
    }
    this.panel.style.top = top.toFixed(0) + 'px';
};

if (typeof window !== 'undefined') window.LustDebug = LustDebug;
