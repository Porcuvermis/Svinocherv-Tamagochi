// ================= РОГАЛИК ГНЕВА: КАРТА ЗАБЕГА =================
// Экран забега: где игрок на карте, сколько у него здоровья и зубов, что
// дальше. Сам забег живёт не здесь, а в состоянии (state.runs.wrath) и в
// Backend — этот файл только показывает и зовёт.
//
// ---------- ПОЧЕМУ ЗАБЕГ НЕ СЕССИЯ ЭКРАНА ----------
// Мобильная сессия обязательно прервётся: звонок, свёрнутый Telegram,
// разряженный телефон. Потерять забег на шесть боёв вместе с жетоном — худшее,
// что может случиться в игре (docs/plan/03-wrath.md). Поэтому состояние
// пишется после КАЖДОГО узла, а вход при незавершённом забеге предлагает
// продолжить, а не начинает новый.
//
// Разбор и порядок работ — docs/plan/10-wrath-rogue.md.

const WrathRogue = {

    // Как показывается узел карты. Данные, а не ветвление в разметке: узлов
    // станет больше, и добавляться они должны записью.
    NODE_KINDS: {
        fight:    { emoji: '⚔️', name: 'Бой' },
        fork:     { emoji: '🔀', name: 'Развилка' },
        miniboss: { emoji: '👹', name: 'Мини-босс' },
        boss:     { emoji: '💀', name: 'Босс' }
    },

    host: null,
    root: null,
    statusEl: null,
    mapEl: null,
    actionEl: null,
    messageEl: null,
    message: null,
    // Итог законченного забега. Пока он на экране, войти в новый нельзя:
    // забег только что кончился, палец ещё на кнопке, а вход стоит жетон.
    summary: null,

    init(host) {
        this.host = host;
        this.root = document.getElementById('wrath-rogue');
        if (!this.root) return;

        this.statusEl = document.getElementById('rogue-status');
        this.mapEl = document.getElementById('rogue-map');
        this.actionEl = document.getElementById('rogue-action');
        this.messageEl = document.getElementById('rogue-message');

        const back = document.getElementById('wrath-rogue-back');
        if (back) back.onclick = (e) => { e.stopPropagation(); this.host.showLobby(); };
    },

    enter() {
        this.message = null;
        this.summary = null;
        this.render();
    },

    leave() {
        this.message = null;
        this.summary = null;
    },

    // ---------- ПОКАЗ ----------
    render() {
        if (!this.root) return;
        if (this.summary) { this.renderSummary(); return; }
        const run = Backend.run();
        if (run) this.renderRun(run);
        else this.renderStart();
    },

    // ---------- ИТОГ ЗАБЕГА ----------
    // Отдельный экран, а не сообщение поверх предложения войти. Причина та
    // же, по которой в бою кнопка «Окей» появляется с задержкой: забег
    // кончился, палец ещё на кнопке, а следующий тап по этому же месту стоил
    // бы жетона. Единственная кнопка здесь — уход в лобби.
    renderSummary() {
        const s = this.summary;
        if (this.statusEl) this.statusEl.innerHTML = WrathShop.walletHtml();

        if (this.mapEl) {
            const lines = [];
            Object.keys(s.currencies || {}).forEach(key => {
                const conf = ECONOMY.currencies[key];
                lines.push(`<li>${conf ? conf.emoji : key} +${s.currencies[key]}</li>`);
            });
            if (s.goldLost) lines.push(`<li>🪙 ${s.goldLost} в копилке сгорело</li>`);
            if (!lines.length) lines.push('<li>ничего вынести не удалось</li>');

            this.mapEl.innerHTML = `
                <div class="rogue-intro rogue-summary ${s.win ? 'win' : 'lose'}">
                    <div class="rogue-intro-title">${s.win ? '🏆 Забег пройден' : '💀 Забег окончен'}</div>
                    <p>Узлов пройдено: ${s.nodesDone} из ${s.nodesTotal}.</p>
                    <ul class="rogue-summary-list">${lines.join('')}</ul>
                    <p class="rogue-intro-note">Зубы сгорели — они живут только внутри забега.</p>
                </div>`;
        }

        this.setAction('В лобби', () => this.host.showLobby());
        if (this.messageEl) this.messageEl.classList.remove('show');
    },

    // Забега нет: предложение войти. Цена и то, что за неё будет, написаны
    // прямо здесь — жетон невозвратный, и игрок должен понимать, на что идёт.
    renderStart() {
        const cfg = Backend.rogueConfig();
        const price = cfg ? cfg.entry : {};
        const enough = !Object.keys(price).some(key => GameState.currency(key) < price[key]);
        const nodes = cfg ? cfg.map.length : 0;
        const fights = cfg ? cfg.map.filter(k => k === 'fight').length : 0;

        if (this.statusEl) this.statusEl.innerHTML = WrathShop.walletHtml();

        if (this.mapEl) {
            this.mapEl.innerHTML = `
                <div class="rogue-intro">
                    <div class="rogue-intro-title">🗺 Забег</div>
                    <p>${nodes} узлов: ${fights} рядовых боёв, две развилки, мини-босс и босс.
                    Золото копится по дороге, но выдаётся только за мини-босса и босса.</p>
                    <p>Здоровье в забеге своё и начинается полным. Проиграл бой — забег окончен,
                    жетон сгорел.</p>
                    <p class="rogue-intro-note">Забег можно бросить и вернуться к нему хоть через
                    неделю: он сохраняется после каждого узла.</p>
                </div>`;
        }

        this.setAction(
            enough ? `Войти за ${this.priceText(price)}` : `Нужен ${this.priceText(price)}`,
            enough ? () => this.start() : null
        );
    },

    renderRun(run) {
        const cfg = Backend.rogueConfig();
        const node = run.map[run.node];

        if (this.statusEl) {
            this.statusEl.innerHTML = `
                <span class="wallet-item"><b>❤️ ${run.hp}/${run.maxHp}</b><i>здоровье</i></span>
                <span class="wallet-item"><b>🦷 ${run.teeth}</b><i>зубы</i></span>
                <span class="wallet-item"><b>🪙 ${run.goldBank}</b><i>в копилке</i></span>
            `;
        }

        if (this.mapEl) {
            this.mapEl.innerHTML = run.map.map((n, i) => {
                const kind = this.NODE_KINDS[n.kind] || { emoji: '•', name: n.kind };
                const state = n.done ? 'done' : (i === run.node ? 'current' : 'future');
                // Вторая половина забега злее — это видно на карте заранее,
                // чтобы мини-босс читался как рубеж, а не как сюрприз.
                const late = i > run.map.findIndex(x => x.kind === 'miniboss');
                return `
                    <div class="rogue-node ${state}${late ? ' late' : ''}">
                        <span class="rogue-node-emoji">${n.done ? '✓' : kind.emoji}</span>
                        <span class="rogue-node-name">${kind.name}</span>
                        ${i === run.node ? '<span class="rogue-node-here">ты здесь</span>' : ''}
                    </div>`;
            }).join('');
        }

        if (!node) {
            this.setAction('Забег пройден', () => this.host.showLobby());
            return;
        }

        const kind = this.NODE_KINDS[node.kind] || { name: node.kind };
        this.setAction(`${kind.emoji} ${kind.name}`, () => this.enterNode(node));
        this.showMessage();
    },

    setAction(text, onClick) {
        if (!this.actionEl) return;
        this.actionEl.textContent = text;
        this.actionEl.disabled = !onClick;
        this.actionEl.onclick = onClick
            ? (e) => { e.stopPropagation(); onClick(); }
            : null;
    },

    showMessage() {
        if (!this.messageEl) return;
        this.messageEl.textContent = this.message || '';
        this.messageEl.classList.toggle('show', !!this.message);
    },

    // ---------- ДЕЙСТВИЯ ----------
    start() {
        const answer = Backend.startRun();
        if (!answer.ok) {
            this.message = answer.error === 'not_enough'
                ? 'Не хватает жетонов на вход.'
                : 'Начать забег не вышло.';
        } else {
            this.message = 'Забег начат. Жетон сгорел — теперь только вперёд.';
        }
        this.render();
    },

    // ЗАГЛУШКА ШАГА 1: узел сразу засчитывается как пройденный.
    // На шаге 2 сюда встанет бой (wrath-duel.js с противником от узла), на
    // шаге 4 — развилка. Пока важно другое: что карта, сохранение и выдача
    // наград работают и переживают перезаход.
    enterNode(node) {
        const run = Backend.run();
        const total = run ? run.map.length : 0;
        const index = run ? run.node : 0;

        const answer = Backend.resolveNode('win');
        if (!answer.ok) {
            this.message = 'Узел не засчитался.';
            this.render();
            return;
        }

        const g = answer.gained || {};
        if (answer.finished) {
            this.summary = {
                win: answer.outcome === 'win',
                nodesDone: answer.outcome === 'win' ? total : index,
                nodesTotal: total,
                currencies: g.currencies || {},
                goldLost: answer.goldLost || 0
            };
            this.render();
            return;
        }

        const parts = [];
        if (g.teeth) parts.push(`🦷 +${g.teeth}`);
        if (g.gold) parts.push(`🪙 +${g.gold} в копилку`);
        if (g.healed) parts.push(`❤️ +${g.healed}`);
        Object.keys(g.currencies || {}).forEach(key => {
            const conf = ECONOMY.currencies[key];
            parts.push(`${conf ? conf.emoji : key} +${g.currencies[key]}`);
        });
        this.message = parts.join(' · ');
        this.render();
    },

    priceText(price) {
        return Object.keys(price || {}).map(key => {
            const conf = ECONOMY.currencies[key];
            return `${conf ? conf.emoji : key} ${price[key]}`;
        }).join(' · ');
    }
};

if (typeof window !== 'undefined') {
    window.WrathRogue = WrathRogue;
}
