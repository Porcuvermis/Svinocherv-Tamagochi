// ================= ТЩЕСЛАВИЕ: КОСТЮМЕРНАЯ И ВИТРИНА =================
// Интерфейс костюмерной, витрина, полки, покупки, инвентарь слота.
// Продолжение PrideMinigame (pride.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после pride.js.
Object.assign(PrideMinigame, {

    // ---------- ИНТЕРФЕЙС КОСТЮМЕРНОЙ ----------
    // Слоты наряда, кнопка магазина и кнопка старта. Всё рисуется в
    // ВЕРХНЕМ холсте, в единицах сцены, и вжимается в видимую область —
    // холст обрезается по-разному на разных телефонах.
    //
    // Ценников на предметах сцены больше нет: прокачка переехала на свою
    // вкладку витрины. Ценник, висящий на машине посреди выхода, спорил с
    // игрой за внимание, а в костюмерной для покупок есть отдельное место.
    renderUI() {
        if (!this.uiEl) return;
        if (this.phase !== 'wardrobe') { this.uiEl.innerHTML = ''; return; }
        const S = this.safe;
        const worn = GameState.data.cosmetics || {};

        // ---------- РАСКЛАДКА ОТ ЧЕРВЯ, А НЕ ОТ КРАЁВ ----------
        // Слоты стоят двумя столбцами по бокам ОТ ПЕРСОНАЖА и на его высоте:
        // прижатые к краям экрана, они налезали на зеркало и вешалку, а на
        // узком телефоне ещё и резались рамкой окна. Столбец отсчитывается от
        // измеренного силуэта, поэтому держится рядом с червём при любом
        // размере экрана и любом росте персонажа.
        const box = this.wormBox || { x: 140, y: 380, w: 110, h: 250 };
        const gap = 52;
        const cols = {
            left: Math.max(S.x0 + 40, box.x - gap),
            right: Math.min(S.x1 - 40, box.x + box.w + gap)
        };
        // ---------- СТОЛБИК СТРОИТСЯ ПОД ЧИСЛО ГНЁЗД ----------
        // Здесь стояли ДВЕ готовые строки: гнёзд было четыре, по два на
        // сторону. Гнёзд стало семь, и лишние молча ложились друг на друга.
        // Столбик считается от их количества, а карточка ужимается, чтобы
        // весь ряд влез между шапкой и ногами червя.
        const total = { left: 0, right: 0 };
        PRIDE_WARDROBE.slots.forEach(sl => { total[sl.side]++; });
        const most = Math.max(total.left, total.right, 1);
        const top = Math.max(S.y0 + 118, PRIDE_ART.Y_FEET - 268);
        const bottom = PRIDE_ART.Y_FEET - 96;
        const span = Math.max(0, bottom - top);
        const step = most > 1 ? span / (most - 1) : 0;
        const card = Math.max(38, Math.min(62, step - 6));
        const used = { left: 0, right: 0 };

        let out = '';
        PRIDE_WARDROBE.slots.forEach(slot => {
            const x = cols[slot.side];
            // Столбик каждой стороны центрируется по своей длине: три
            // карточки справа не должны висеть выше четырёх слева.
            const n = total[slot.side];
            const y0 = top + (span - step * (n - 1)) / 2;
            const y = y0 + step * used[slot.side]++;
            const art = worn[slot.key]
                ? WormCosmetics.cardArt(worn[slot.key], 15, PALETTE.flesh[500], slot.key) : null;
            out += `<g transform="translate(${x.toFixed(0)},${y.toFixed(0)})">` +
                   PRIDE_ART.slotCard(slot, art, card) + '</g>';
        });

        // Кнопка старта — ПОД червём: он стоит готовый и трогается с места,
        // когда решит игрок. Ниже её ничего быть не должно, поэтому она же и
        // определяет, где кончается экран костюмерной.
        const startY = Math.min(S.y1 - 62, PRIDE_ART.Y_FEET + 84);
        out += `<g transform="translate(${PRIDE_ART.CX},${startY.toFixed(0)})">` +
               PRIDE_ART.startButton(42) + '</g>';
        // Магазин — СПРАВА внизу. Слева нельзя: там кнопка debug-режима, и на
        // телефоне они наезжали друг на друга.
        out += `<g transform="translate(${(S.x1 - 44).toFixed(0)},${(S.y1 - 44).toFixed(0)})">` +
               PRIDE_ART.shopButton(26) + '</g>';
        this.uiEl.innerHTML = out;
    },

    // ---------- ВИТРИНА ----------
    // Две вкладки: наряд и прокачка. Наряд ничего не даёт и виден везде,
    // прокачка меняет числа выхода и не видна нигде — общего у них ровно
    // одно: платят за них поцелуями. Поэтому одна витрина, две полки.
    renderStore() {
        if (!this.storeEl) return;
        if (this.openSlot) {
            this.storeEl.innerHTML = this.slotPanel();
            this.centerSlotArt();
            return;
        }
        if (!this.storeOpen) { this.storeEl.innerHTML = ''; return; }
        const C = PALETTE.redCarpet;
        const S = this.safe;
        const x0 = S.x0 + 14, x1 = S.x1 - 14;
        const boost = this.storeTab === 'boost';
        const rows = boost
            ? ECONOMY.minigames.pride.upgrades.order.length
            : Math.ceil(this.tabItems().length / 2);
        // Панель ровно по содержимому: полки разной длины, и растянутая на
        // весь экран витрина с пустой нижней половиной читается недогрузом.
        const y0 = S.y0 + 74;
        const y1 = y0 + 56 + (boost ? rows * 96 : Math.max(1, rows) * 106) + 16;

        let out = `<rect class="pr-store-back" x="${S.x0}" y="${S.y0}"
                         width="${(S.x1 - S.x0).toFixed(0)}" height="${(S.y1 - S.y0).toFixed(0)}"
                         fill="${C.night[900]}" fill-opacity="0.82"/>
            <rect x="${x0}" y="${y0}" width="${(x1 - x0).toFixed(0)}" height="${(y1 - y0).toFixed(0)}"
                  rx="20" fill="${C.night[700]}" stroke="${C.gold[700]}" stroke-width="2"/>`;

        // ---------- ВКЛАДКИ ----------
        // По одной на слот плюс прокачка, и все — значками. У слотов значка
        // нет и не будет: их иконка — СИЛУЭТ того, что в них встаёт (тот же
        // path, которым пустой слот показывает себя на черве). Одна картинка
        // на две роли, и ни одной буквы (инвариант 9).
        const tabs = PRIDE_WARDROBE.slots.map(sl => ({ key: sl.key, shape: sl.shape }))
                                         .concat([{ key: 'boost', emoji: '⬆' }]);
        // Ширина такая, чтобы ряд вкладок не доехал до крестика в правом
        // углу панели: пять вкладок по 62 упирались в него вплотную.
        const tw = Math.min(56, (x1 - x0 - 76) / tabs.length);
        const first = (x0 + x1) / 2 - (tabs.length * tw) / 2 + tw / 2;
        out += tabs.map((t, i) => {
            const cx = first + i * tw;
            const live = this.storeTab === t.key;
            const face = t.emoji
                ? `<text x="${cx}" y="${y0 + 2}" text-anchor="middle" font-size="22">${t.emoji}</text>`
                : `<g transform="translate(${(cx - 13).toFixed(1)},${(y0 - 21).toFixed(1)}) scale(1.1)"
                       fill="none" stroke="${live ? C.gold[300] : C.rail[500]}" stroke-width="1.8"
                       stroke-linejoin="round"><path d="${t.shape}"/></g>`;
            return `<g class="pr-tab" data-tab="${t.key}">
                <rect x="${(cx - tw / 2 + 3).toFixed(1)}" y="${y0 - 28}"
                      width="${(tw - 6).toFixed(1)}" height="44" rx="13"
                      fill="${live ? C.silk[700] : C.night[900]}"
                      stroke="${live ? C.gold[300] : C.rail[700]}" stroke-width="2"/>
                ${face}</g>`;
        }).join('');

        out += `<g class="pr-store-close" transform="translate(${(x1 - 24).toFixed(0)},${(y0 + 24).toFixed(0)})">
            <circle r="18" fill="${C.night[900]}" stroke="${C.rail[700]}" stroke-width="2"/>
            <path d="M -7 -7 L 7 7 M 7 -7 L -7 7" stroke="${C.flash[500]}"
                  stroke-width="3" stroke-linecap="round"/></g>`;

        out += boost ? this.storeBoost(x0, x1, y0 + 56) : this.storeWear(x0, x1, y0 + 56);
        this.storeEl.innerHTML = out;
    },

    // ---------- ЧТО ЛЕЖИТ НА ПОЛКЕ ----------
    // ТОЛЬКО НЕКУПЛЕННОЕ. Купленный предмет с витрины исчезает и живёт
    // дальше в инвентаре слота.
    //
    // Пока купленное оставалось на полке, витрина работала второй
    // раздевалкой: тап по своей же шляпе её надевал. Два места делали одно и
    // то же, и то, которое для покупок, делало это хуже — без строки
    // «ничего», без порядка слотов, зато с ценниками у вещей, за которые уже
    // заплачено. Витрина — каталог того, чего у тебя ЕЩЁ НЕТ.
    tabItems() {
        const owned = GameState.data.wardrobe || {};
        return PRIDE_WARDROBE.items.filter(i => i.slot === this.storeTab && !owned[i.id]);
    },

    // Полка наряда: НЕкупленные предметы одного слота, по две карточки в ряд.
    // На карточке сам предмет, а не значок: покупают глазами, и что
    // покупаешь, должно быть видно.
    //
    // Состояний у карточки больше нет — она всегда одна и та же «купить».
    // Раскупили полку целиком — вместо карточек стоит галочка: полка пуста не
    // потому, что сломалась, а потому, что здесь всё твоё.
    storeWear(x0, x1, top) {
        const C = PALETTE.redCarpet;
        const wallet = GameState.currency('pride_kiss');
        const items = this.tabItems();
        if (!items.length) {
            const slot = PRIDE_WARDROBE.slots.find(s => s.key === this.storeTab);
            // Силуэт слота и галочка стоят ДРУГ НАД ДРУГОМ, а не в одной
            // точке: наложенные, они читались одним нечитаемым пятном.
            return `<g transform="translate(${((x0 + x1) / 2).toFixed(0)},${(top + 30).toFixed(0)})"
                       opacity="0.8">
                ${slot ? `<g transform="translate(-21,-21) scale(1.75)" fill="none"
                              stroke="${C.rail[700]}" stroke-width="1.4"
                              stroke-linejoin="round"><path d="${slot.shape}"/></g>` : ''}
                <text x="0" y="66" text-anchor="middle" font-size="34"
                      fill="${C.gold[300]}">✓</text></g>`;
        }
        const cw = (x1 - x0 - 30) / 2, ch = 96;
        return items.map((item, i) => {
            const cx = x0 + 15 + cw * (i % 2) + cw / 2;
            const cy = top + Math.floor(i / 2) * (ch + 10) + ch / 2;
            const price = item.price.pride_kiss;
            const rich = wallet >= price;
            const art = WormCosmetics.cardArt(item.id, 24, PALETTE.flesh[500], item.slot);
            return `<g class="pr-item${rich ? ' rich' : ''}" data-item="${item.id}"
                       transform="translate(${cx.toFixed(0)},${cy.toFixed(0)})">
                <rect x="${-cw / 2 + 4}" y="${-ch / 2}" width="${cw - 8}" height="${ch}" rx="14"
                      fill="${C.night[900]}" fill-opacity="0.9"
                      stroke="${rich ? C.rail[500] : C.rail[700]}"
                      stroke-width="${rich ? 2 : 1.6}"/>
                <g transform="translate(0,8)" opacity="0.85">${art}</g>
                <text x="${(cw / 2 - 10).toFixed(0)}" y="${(ch / 2 - 12).toFixed(0)}"
                      text-anchor="end" font-size="15" font-weight="700"
                      fill="${rich ? C.kiss[300] : C.night[500]}">${price}</text>
                <text x="${(-cw / 2 + 12).toFixed(0)}" y="${(ch / 2 - 12).toFixed(0)}"
                      font-size="13">💋</text></g>`;
        }).join('');
    },

    // Полка прокачки: три линии, у каждой лесенка ступеней и цена следующей.
    storeBoost(x0, x1, top) {
        const C = PALETTE.redCarpet;
        const conf = ECONOMY.minigames.pride.upgrades;
        const wallet = GameState.currency('pride_kiss');
        const w = x1 - x0 - 30, h = 84;
        return conf.order.map((key, i) => {
            const branch = conf[key];
            const level = GameState.upgradeLevel('pride_' + key);
            const next = branch.levels[level];
            const price = next ? next.price.pride_kiss : 0;
            const rich = next && wallet >= price;
            const cy = top + i * (h + 12) + h / 2;
            const max = branch.levels.length;
            const step = Math.min(22, (w - 150) / max);
            const pips = Array.from({ length: max }, (_, k) =>
                `<circle cx="${(-w / 2 + 64 + k * step).toFixed(1)}" cy="8" r="5"
                         fill="${k < level ? C.kiss[300] : C.night[500]}"/>`).join('');
            const cost = next
                ? `<text x="${(w / 2 - 14).toFixed(0)}" y="6" text-anchor="end" font-size="19"
                         font-weight="700" fill="${rich ? C.kiss[300] : C.night[500]}">${price}</text>
                   <text x="${(w / 2 - 22 - String(price).length * 12).toFixed(0)}" y="5"
                         text-anchor="end" font-size="14">💋</text>`
                : `<text x="${(w / 2 - 20).toFixed(0)}" y="8" text-anchor="end" font-size="22"
                         fill="${C.gold[300]}">✓</text>`;
            return `<g class="pr-boost${rich ? ' rich' : ''}" data-boost="${key}"
                       transform="translate(${((x0 + x1) / 2).toFixed(0)},${cy.toFixed(0)})">
                <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="14"
                      fill="${C.night[900]}" fill-opacity="0.9"
                      stroke="${rich ? C.kiss[500] : C.rail[700]}" stroke-width="${rich ? 2.2 : 1.6}"/>
                <text x="${(-w / 2 + 20).toFixed(0)}" y="0" font-size="26">${branch.emoji}</text>
                ${pips}${cost}</g>`;
        }).join('');
    },

    // ---------- ПОКУПКИ ----------
    // Решает всё та же сторона, что и всегда: клиент говорит «купи вот это»,
    // а хватает ли валюты — отвечает Backend (инвариант 2).
    buyBoost(key) {
        const answer = Backend.buyUpgrade(key, 'pride');
        if (!answer.ok) { this.deny(`.pr-boost[data-boost="${key}"]`); return; }
        this.resetRun();          // числа следующего выхода изменились
        this.renderAll();
    },

    // Тап по карточке витрины — ТОЛЬКО покупка. Надевать здесь больше нечего:
    // купленное с полки уходит, а надевают его в инвентаре слота.
    //
    // Купленное при этом сразу и НАДЕВАЕТСЯ: игрок покупает шляпу, чтобы её
    // увидеть, и заставлять его после оплаты идти в другое место за тем же
    // самым — лишний шаг. Не понравилось — снимается там же, где всё
    // остальное.
    tapItem(itemId) {
        const item = PRIDE_WARDROBE.items.find(i => i.id === itemId);
        if (!item || (GameState.data.wardrobe || {})[itemId]) return;
        const answer = Backend.buyWardrobe(itemId);
        if (!answer.ok) { this.deny(`.pr-item[data-item="${itemId}"]`); return; }
        Backend.wearCosmetic(item.slot, itemId);
        this.refreshWorm();
        this.renderAll();
    },

    // ---------- ТАП ПО СЛОТУ: ИНВЕНТАРЬ, А НЕ ПЕРЕБОР ----------
    // Раньше слот перебирал купленное по кругу: надето → следующее → голо, а
    // при пустом инвентаре открывал витрину. Перебор врал о содержимом —
    // сколько там вариантов и какие, видно не было, — а прыжок в витрину
    // путал два разных места: где ПОКУПАЮТ и где ОДЕВАЮТСЯ.
    //
    // Теперь как карточка слота в лобби гнева (wrath-lobby.js): тап
    // раскрывает список того, что можно сюда поставить. Повторный тап по
    // тому же слоту закрывает.
    tapSlot(slotKey) {
        this.openSlot = this.openSlot === slotKey ? null : slotKey;
        this.storeOpen = false;
        this.renderStore();
    },

    // ---------- ИНВЕНТАРЬ СЛОТА ----------
    // Только КУПЛЕННОЕ, ценников здесь нет — за ними витрина. Строки идут
    // снизу вверх, и самая нижняя всегда «ничего»: она есть в любом слоте
    // при любом инвентаре, поэтому и стоит там, где палец, а не там, где
    // список кончился. Пусто в шкафу — одна эта строка и остаётся.
    //
    // Надетое помечено галочкой; отдельной кнопки «снять» нет — снять значит
    // выбрать пустую строку. Правило одно: выбери, что тут стоит.
    slotPanel() {
        const C = PALETTE.redCarpet;
        const S = this.safe;
        const slot = PRIDE_WARDROBE.slots.find(s => s.key === this.openSlot);
        if (!slot) return '';
        const worn = (GameState.data.cosmetics || {})[slot.key] || null;
        const owned = PRIDE_WARDROBE.items
            .filter(i => i.slot === slot.key && (GameState.data.wardrobe || {})[i.id]);

        const W = 176;
        const rows = owned.length + 1;            // +1 — строка «ничего»
        // Высота строки подстраивается под длину списка. Предметы рисуются в
        // тех же координатах, что на теле, а там цилиндр уходит вверх почти на
        // две своих радиуса — в тесной строке он вылезал за карточку. Отсюда
        // и запас 72, и общий сдвиг ART_DY ниже: строка обязана вмещать
        // САМЫЙ высокий предмет, а не средний.
        const room = (S.y1 - S.y0) - 140;
        const RH = Math.max(44, Math.min(72, room / rows));
        const ar = Math.max(11, RH * 0.25);       // радиус предмета в строке
        const h = 16 + rows * RH;
        const cx = (S.x0 + S.x1) / 2;
        // Панель по центру видимой области: слот может стоять у самого края,
        // и привязанная к нему карточка уезжала бы за обрез холста.
        const y0 = Math.max(S.y0 + 60, (S.y0 + S.y1) / 2 - h / 2);

        const row = (id, i) => {
            const on = (id || null) === worn;
            const y = y0 + 8 + i * RH + RH / 2;
            const art = id
                ? `<g class="pr-slot-art">${WormCosmetics.cardArt(id, ar, PALETTE.flesh[500], slot.key)}</g>`
                : `<g transform="translate(-12,-12)" fill="none" stroke="${C.rail[500]}"
                       stroke-width="1.6" stroke-linejoin="round"
                       opacity="0.7"><path d="${slot.shape}"/></g>`;
            return `<g class="pr-slot-item" data-slot-item="${id || ''}"
                       transform="translate(${cx.toFixed(0)},${y.toFixed(0)})">
                <rect x="${-W / 2 + 8}" y="${-RH / 2 + 4}" width="${W - 16}" height="${RH - 8}" rx="13"
                      fill="${C.night[900]}" fill-opacity="0.92"
                      stroke="${on ? C.gold[300] : C.rail[700]}" stroke-width="${on ? 2.4 : 1.6}"/>
                <g transform="translate(-26,0)">${art}</g>
                ${on ? `<text x="${W / 2 - 28}" y="7" text-anchor="middle" font-size="20"
                              fill="${C.gold[300]}">✓</text>` : ''}</g>`;
        };

        return `<rect class="pr-store-back" x="${S.x0}" y="${S.y0}"
                      width="${(S.x1 - S.x0).toFixed(0)}" height="${(S.y1 - S.y0).toFixed(0)}"
                      fill="${C.night[900]}" fill-opacity="0.7"/>
            <rect x="${(cx - W / 2).toFixed(0)}" y="${y0.toFixed(0)}" width="${W}" height="${h.toFixed(0)}"
                  rx="18" fill="${C.night[700]}" stroke="${C.gold[700]}" stroke-width="2"/>
            ${owned.map((it, i) => row(it.id, i)).join('')}
            ${row(null, owned.length)}`;
    },

    // ---------- ВЫРОВНЯТЬ ПРЕДМЕТЫ В СТРОКАХ ----------
    // Каждый предмет нарисован в координатах ТОГО МЕСТА, где он сидит на теле:
    // цилиндр висит над точкой крепления, очки стоят на ней, бант — под ней.
    // В списке от этого они разъезжаются по высоте, и ровные карточки
    // выглядят кривыми.
    //
    // Считать смещение по формуле нельзя — оно у каждого предмета своё и
    // меняется с каждым новым. Поэтому спрашиваем настоящий габарит: одно
    // чтение раскладки на строку и только в момент открытия панели, а не в
    // кадровом цикле (docs/traps.md про чтения раскладки — там речь про
    // КАЖДЫЙ кадр, здесь этого нет).
    centerSlotArt() {
        if (!this.storeEl) return;
        this.storeEl.querySelectorAll('.pr-slot-art').forEach(g => {
            const b = g.getBBox();
            if (!b.height) return;
            g.setAttribute('transform', `translate(0,${(-(b.y + b.height / 2)).toFixed(1)})`);
        });
    },

    // Выбор строки в инвентаре слота. Надевает Backend, а не интерфейс:
    // проверки «есть ли предмет» и «тот ли слот» на сервере будут теми же.
    pickSlotItem(itemId) {
        Backend.wearCosmetic(this.openSlot, itemId || null);
        this.refreshWorm();
        this.renderAll();          // renderStore внутри перерисует и панель
    },

    // Наряд живёт в модели персонажа, значит смена наряда — это пересборка
    // модели. Здесь же перекладывается и главный червь на экране комнаты:
    // купленное носится ВЕЗДЕ, и увидеть это игрок должен сразу.
    refreshWorm() {
        this.mountWorm();
        requestAnimationFrame(() => requestAnimationFrame(() => {
            this.layoutWorm();
            this.renderUI();
        }));
        if (window.MainWormHandle && window.WormModelAPI) {
            const m = window.WormModelAPI.loadWormModel();
            if (typeof wormMarksFromState === 'function') m.scars = wormMarksFromState();
            window.MainWormHandle.update(m);
        }
    },

    // Отказ показывается там же, где нажали: карточка дёргается и остаётся
    // тусклой. Текста «не хватает» нет и быть не может (инвариант 9).
    deny(selector) {
        const el = this.screenElement.querySelector(selector);
        if (!el) return;
        el.classList.remove('pr-deny');
        void el.getBBox();
        el.classList.add('pr-deny');
    },
});

// Запуск — здесь, а не в pride.js: этот файл подключается последним,
// и к этому моменту все методы уже на объекте.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PrideMinigame.init());
} else {
    PrideMinigame.init();
}
