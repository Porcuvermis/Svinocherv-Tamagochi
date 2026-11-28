// ================= ТЩЕСЛАВИЕ: ГРИМЁРКА И ОКНО ПОКУПОК =================
// Ячейки наряда, список слота, кнопка выхода и окно покупок (прокачка и
// магазин одежды). Продолжение PrideMinigame (pride.js): `this` — он же.
// Рисунок всех этих вещей — pride-ui-art.js, здесь только раскладка и ход.
//
// ---------- ЧТО ГДЕ (решения игрока, 24–28.11.2026) ----------
//   • Ячейки — НЕ диегетические: колонка квадратиков справа от червя, под
//     большим пальцем правой руки. Порядок — как на теле сверху вниз.
//   • Тап по ячейке — список купленного для этого гнезда, последняя строка
//     «ничего» (снять). Список встаёт слева от колонки, между ней и червём.
//   • Тап по червю, зеркалу или шкафу — одна большая зона: окно покупок.
//   • В окне две вкладки: прокачка (машина, толпа, дорожка) и магазин
//     одежды по категориям-гнёздам. Нажатие на вещь только ПРИМЕРЯЕТ её на
//     червя в зеркале; покупка — отдельной кнопкой-билетом под зеркалом.
//   • В магазине лежит только некупленное: купленное уходит в список своего
//     гнезда и сразу надевается (docs/plan/17-pride.md, раздел 8).
Object.assign(PrideMinigame, {

    // Вкладка окна: 'boost' — прокачка, ключ гнезда — магазин на этой полке.
    storeTab: 'boost',
    wearCat: null,       // какая полка магазина открыта последней
    trySel: null,        // вещь, которую червь примеряет в зеркале
    preview: null,       // второй червь — в зеркале примерки

    // ---------- ЧТО ИЗ СЦЕНЫ ВИДНО НА САМОМ ДЕЛЕ ----------
    // Рамка окна из фотоаппаратов заходит на сцену: по бокам примерно на 36
    // единиц, сверху на 74, снизу на 38 (pride-cameras.js). Интерфейс,
    // поставленный по краю холста, уезжал под камеры — поэтому всё меряется
    // от этого прямоугольника, пересечённого с видимым куском холста.
    VIS: { x0: 36, y0: 74, x1: 352, y1: 806 },
    vis() {
        const S = this.safe, V = this.VIS;
        return { x0: Math.max(S.x0, V.x0), y0: Math.max(S.y0, V.y0),
                 x1: Math.min(S.x1, V.x1), y1: Math.min(S.y1, V.y1) };
    },

    // ---------- РАЗМЕТКА ГРИМЁРКИ ----------
    // Числа — из разметки, согласованной с игроком (документ «Гримёрка
    // тщеславия»): ячейка до 76, промежуток ≈ пятая часть ячейки, поле от края
    // окна 10–20. Гнёзд семь, и в колонку на видимую высоту влезает ячейка
    // 72 — она и берётся, а на низком экране ужимается, но не мельче 52
    // (палец: минимум 44 pt у Apple, 48 dp у Material).
    roomLayout() {
        const V = this.vis(), n = PRIDE_WARDROBE.slots.length;
        const top0 = V.y0 + 26, bot0 = V.y1 - 24;
        const A = bot0 - top0;
        const cell = Math.max(52, Math.min(72, Math.floor(A / (n + (n - 1) * 0.18))));
        const gap = Math.round(cell * 0.18);
        const total = n * cell + (n - 1) * gap;
        const top = top0 + Math.max(0, (A - total) / 2);
        const rows = Array.from({ length: n }, (_, i) => top + i * (cell + gap));
        const startH = 62, startW = 176;
        return { cell, gap, rows, colX: V.x1 - 10 - cell,
                 startX: PRIDE_ROOM.CX, startY: V.y1 - 24 - startH / 2, startW, startH,
                 purse: { x: V.x0 + 4, y: V.y0 + 8 } };
    },

    // Общие градиенты интерфейса — один раз в верхний холст.
    ensureDefs() {
        if (!this.svgEl || this.svgEl.querySelector('#pru-defs')) return;
        const d = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        d.id = 'pru-defs';
        d.innerHTML = PRIDE_UI.defs();
        this.svgEl.insertBefore(d, this.svgEl.firstChild);
    },

    // ---------- ИНТЕРФЕЙС ГРИМЁРКИ ----------
    renderUI() {
        if (!this.uiEl) return;
        if (this.phase !== 'wardrobe') { this.uiEl.innerHTML = ''; return; }
        this.ensureDefs();
        const L = this.roomLayout();
        const worn = GameState.data.cosmetics || {};
        let out = this.openZones();
        PRIDE_WARDROBE.slots.forEach((slot, i) => {
            const id = worn[slot.key];
            const open = this.openSlot === slot.key;
            const art = id ? WormCosmetics.cardArt(id, 15, PALETTE.flesh[500], slot.key) : null;
            const pad = L.cell * 0.17;
            const inner = art
                ? `<g class="pr-fit" data-box="${pad},${pad},${L.cell - pad * 2},${L.cell - pad * 2}">${art}</g>`
                : PRIDE_UI.ghost(slot.shape, L.cell);
            out += `<g class="pr-slot${art ? ' filled' : ''}${open ? ' open' : ''}" data-slot="${slot.key}"
                       transform="translate(${L.colX.toFixed(1)},${L.rows[i].toFixed(1)})">${PRIDE_UI.cell(L.cell, inner, open ? 'open' : '')}</g>`;
        });
        out += `<g transform="translate(${L.startX},${L.startY.toFixed(1)})">${PRIDE_UI.startPlaque(L.startW, L.startH)}</g>`;
        this.uiEl.innerHTML = out;
        this.fitArt(this.uiEl);
    },

    // ---------- БОЛЬШАЯ ЗОНА: ЧЕРВЬ, ЗЕРКАЛО, ШКАФ ----------
    // Невидимые прямоугольники ПОД ячейками: ячейка, лежащая поверх шкафа,
    // выигрывает касание у шкафа, а промежуток между ячейками — шкаф.
    openZones() {
        const M = PRIDE_ROOM.MIR, X = PRIDE_ROOM.WARD.x;
        const r = (x, y, w, h) => `<rect class="pr-open-store" x="${x.toFixed(0)}" y="${y.toFixed(0)}"
                                         width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="transparent"/>`;
        let s = r(M.x - 18, M.y - 20, M.w + 36, 470 - M.y + 20);          // зеркало и столик
        s += r(X - 8, 40, 400 - X, PRIDE_ROOM.FLOOR_Y - 40);              // шкаф с коробкой
        const b = this.roomWormBox();
        if (b) s += r(b.x - 6, b.y - 6, b.w + 12, b.h + 12);              // сам червь
        return s;
    },

    // ---------- СПИСОК ГНЕЗДА ----------
    // Только КУПЛЕННОЕ, ценников нет. Последняя строка — всегда «ничего»: она
    // есть в любом гнезде при любом наборе, поэтому стоит на одном и том же
    // месте под пальцем. Надетое отмечено латунной медалькой.
    //
    // Список встаёт СЛЕВА от колонки, на высоте нажатой ячейки: так червь
    // остаётся на виду, и видно, как села вещь. Строки чуть мельче ячеек
    // колонки — видно, что это её содержимое, а не вторая колонка.
    slotPanel() {
        const slot = PRIDE_WARDROBE.slots.find(s => s.key === this.openSlot);
        if (!slot) return '';
        const D = PALETTE.dressing, V = this.vis(), L = this.roomLayout();
        const worn = (GameState.data.cosmetics || {})[slot.key] || null;
        const owned = PRIDE_WARDROBE.items.filter(i => i.slot === slot.key && (GameState.data.wardrobe || {})[i.id]);
        const rowsN = owned.length + 1;
        const pad = 7, gap = 7;
        let cs = Math.round(L.cell * 0.82);
        const room = V.y1 - V.y0 - 40;
        cs = Math.max(48, Math.min(cs, Math.floor((room - pad * 2 - (rowsN - 1) * gap) / rowsN)));
        const w = cs + pad * 2, h = rowsN * cs + (rowsN - 1) * gap + pad * 2;
        const x = L.colX - 10 - w;
        const ci = PRIDE_WARDROBE.slots.indexOf(slot);
        let y = L.rows[ci];
        y = Math.max(V.y0 + 20, Math.min(y, V.y1 - 20 - h));
        let out = `<rect class="pr-store-back" x="${V.x0}" y="${V.y0}" width="${V.x1 - V.x0}" height="${V.y1 - V.y0}"
                         fill="${D.shade[900]}" fill-opacity="0.35"/>
            <rect x="${x}" y="${y.toFixed(1)}" width="${w}" height="${h}" rx="16" fill="url(#pru-panel)"
                  stroke="url(#pru-brass)" stroke-width="2.4"/>`;
        // Повтор нажатой ячейки поверх затемнения: видно, чей это список.
        const wornArt = worn ? WormCosmetics.cardArt(worn, 15, PALETTE.flesh[500], slot.key) : null;
        const p0 = L.cell * 0.17;
        out += `<g class="pr-slot open" data-slot="${slot.key}" transform="translate(${L.colX.toFixed(1)},${L.rows[ci].toFixed(1)})">` +
            PRIDE_UI.cell(L.cell, wornArt ? `<g class="pr-fit" data-box="${p0},${p0},${L.cell - p0 * 2},${L.cell - p0 * 2}">${wornArt}</g>`
                                          : PRIDE_UI.ghost(slot.shape, L.cell), 'open') + '</g>';
        const row = (id, i) => {
            const ry = y + pad + i * (cs + gap), on = (id || null) === worn;
            const ip = cs * 0.16;
            const inner = id
                ? `<g class="pr-fit" data-box="${ip},${ip},${cs - ip * 2},${cs - ip * 2}">${WormCosmetics.cardArt(id, 15, PALETTE.flesh[500], slot.key)}</g>`
                : PRIDE_UI.nothing(slot.shape, cs);
            return `<g class="pr-slot-item" data-slot-item="${id || ''}" transform="translate(${x + pad},${ry.toFixed(1)})">` +
                   PRIDE_UI.cell(cs, inner, on ? 'open' : '') + (on ? PRIDE_UI.check(cs - 4, 4, 9) : '') + '</g>';
        };
        out += owned.map((it, i) => row(it.id, i)).join('') + row(null, owned.length);
        return out;
    },

    // ---------- ВПИСАТЬ ВЕЩЬ В КЛЕТКУ ----------
    // Каждая вещь нарисована в координатах ТОГО МЕСТА, где сидит на теле:
    // цилиндр висит над точкой крепления, очки стоят на ней, носок — под ней.
    // По формуле их не выровнять — у каждой своё смещение. Поэтому настоящий
    // габарит (getBBox): одно чтение на вещь и только при сборке интерфейса,
    // не в кадре. data-box — клетка, куда вписать: x, y, ширина, высота.
    fitArt(root) {
        root.querySelectorAll('.pr-fit').forEach(g => {
            let b;
            try { b = g.getBBox(); } catch (e) { return; }
            if (!b || !b.width || !b.height) return;
            const [x, y, w, h] = g.dataset.box.split(',').map(Number);
            const k = Math.min(w / b.width, h / b.height, 3);
            const tx = x + w / 2 - (b.x + b.width / 2) * k, ty = y + h / 2 - (b.y + b.height / 2) * k;
            g.setAttribute('transform', `translate(${tx.toFixed(1)},${ty.toFixed(1)}) scale(${k.toFixed(3)})`);
        });
    },

    // ---------- ОКНО ПОКУПОК ----------
    storeBox() {
        const V = this.vis();
        return { x: V.x0 + 4, y: V.y0 + 8, w: V.x1 - V.x0 - 8, h: V.y1 - V.y0 - 14 };
    },

    openStore(tab) {
        this.openSlot = null;
        this.storeOpen = true;
        if (tab) this.storeTab = tab;
        this.trySel = null;
        this.renderStore();
        this.renderHud();      // свой кошелёк у окна — плашка гримёрки прячется
    },

    closeStore() {
        this.storeOpen = false;
        this.openSlot = null;
        this.trySel = null;
        this.previewDestroy();
        if (this.storeEl) this.storeEl.innerHTML = '';
        if (this.hudEl) this.renderHud();
    },

    // Полка магазина, на которую смотрим: последняя открытая, иначе первая,
    // где ещё есть что купить.
    wearKey() {
        const keys = PRIDE_WARDROBE.slots.map(s => s.key);
        if (keys.includes(this.storeTab)) return this.storeTab;
        if (this.wearCat && keys.includes(this.wearCat)) return this.wearCat;
        const owned = GameState.data.wardrobe || {};
        const first = keys.find(k => PRIDE_WARDROBE.items.some(i => i.slot === k && !owned[i.id]));
        return first || keys[0];
    },

    renderStore() {
        if (!this.storeEl) return;
        this.ensureDefs();
        if (this.openSlot) {
            this.previewDestroy();
            this.storeEl.innerHTML = this.slotPanel();
            this.fitArt(this.storeEl);
            return;
        }
        if (!this.storeOpen) { this.storeEl.innerHTML = ''; this.previewDestroy(); return; }
        const P = this.storeBox();
        const boost = this.storeTab === 'boost';
        if (!boost) { this.storeTab = this.wearKey(); this.wearCat = this.storeTab; }
        let out = PRIDE_UI.panel(P.x, P.y, P.w, P.h);
        out += PRIDE_UI.purse(P.x + 14, P.y + 14, GameState.currency('pride_kiss'));
        out += PRIDE_UI.close(P.x + P.w - 31, P.y + 31, 17);
        const tw = (P.w - 28 - 12) / 2, ty = P.y + 66, th = 58;
        out += PRIDE_UI.tab('boost', P.x + 14, ty, tw, th, PRIDE_UI.icoStar(P.x + 14 + tw / 2, ty + th / 2 + 2), boost);
        out += PRIDE_UI.tab('wear', P.x + 26 + tw, ty, tw, th, PRIDE_UI.icoHanger(P.x + 26 + tw * 1.5, ty + th / 2 + 1), !boost);
        const top = ty + th + 20;
        out += boost ? this.storeBoost(P, top) : this.storeWear(P, top);
        this.storeEl.innerHTML = out;
        this.fitArt(this.storeEl);
        if (boost) this.previewDestroy(); else this.previewShow();
    },

    // ---------- ВКЛАДКА 1: ПРОКАЧКА ----------
    // Три карточки, все видны сразу. На каждой — мини-сцена с прожектором и
    // картинкой ТЕКУЩЕЙ ступени (толпа, машина, ковёр), шесть лампочек
    // ступеней, значок того, что меняется, «было → станет» и билет с ценой.
    storeBoost(P, top) {
        const conf = ECONOMY.minigames.pride.upgrades;
        const wallet = GameState.currency('pride_kiss');
        const D = PALETTE.dressing;
        const gap = 12, avail = P.y + P.h - 14 - top, ch = (avail - gap * 2) / 3;
        const x = P.x + 14, w = P.w - 28;
        let defs = '';
        const cards = conf.order.map((key, i) => {
            const br = conf[key], lvl = GameState.upgradeLevel('pride_' + key), max = br.levels.length;
            const next = br.levels[lvl];
            const price = next ? next.price.pride_kiss : 0;
            const state = !next ? 'done' : (wallet >= price ? 'rich' : 'poor');
            const y = top + i * (ch + gap);
            const sw = Math.min(112, w * 0.4), sh = ch - 20, sx = x + 10, sy = y + 10;
            const cx = sx + sw / 2, base = sy + sh - 16;
            let ill = '';
            if (key === 'crowd') ill = PRIDE_UI.crowdArt(cx, base, lvl);
            else if (key === 'car') ill = PRIDE_UI.carArt(cx, base, lvl);
            else ill = PRIDE_UI.carpetArt(cx, base, lvl, sw);
            // Картинка не вылезает из ниши мини-сцены.
            defs += `<clipPath id="pru-stage-${key}"><rect x="${sx}" y="${sy.toFixed(1)}" width="${sw}" height="${sh.toFixed(1)}" rx="12"/></clipPath>`;
            const cur = lvl ? br.levels[lvl - 1].bonus : br.base;
            const fmt = (v) => key === 'car' ? '×' + v : key === 'carpet' ? String(+(v / 1000).toFixed(2)) : String(v);
            const rx = sx + sw + 16, rw = x + w - 12 - rx;
            const step = Math.min(24, (rw - 14) / (max - 1));
            const val = next ? `${fmt(cur)} → ${fmt(next.bonus)}` : fmt(cur);
            return `<g class="pr-boost${state === 'rich' ? ' rich' : ''}" data-boost="${key}">
                <rect x="${x}" y="${y.toFixed(1)}" width="${w}" height="${ch.toFixed(1)}" rx="18" fill="url(#pru-pad)"
                      stroke="${state === 'rich' ? D.brass[300] : D.brass[700]}" stroke-width="${state === 'rich' ? 2.2 : 1.4}"/>
                ${PRIDE_UI.stage(sx, sy, sw, sh)}
                <g clip-path="url(#pru-stage-${key})">${ill}</g>
                ${PRIDE_UI.pips(rx + 7, y + 26, max, lvl, step)}
                ${PRIDE_UI.effectIcon(key, rx + 14, y + 64)}
                <text x="${rx + 34}" y="${(y + 70).toFixed(1)}" font-size="17" font-weight="700" fill="${D.ivory[300]}"
                      style="font-variant-numeric:tabular-nums">${val}</text>
                ${PRIDE_UI.ticket(rx, y + ch - 62, rw, 50, price, state, 'pr-ticket')}
            </g>`;
        }).join('');
        return `<defs>${defs}</defs>` + cards;
    },

    // ---------- ВКЛАДКА 2: МАГАЗИН ----------
    // Плечики-категории на штанге, под ними зеркало примерки со вторым
    // червём, билет покупки и полка вещей с бирками.
    storeWear(P, top) {
        const D = PALETTE.dressing;
        const cats = PRIDE_WARDROBE.slots, n = cats.length;
        const key = this.storeTab;
        const railY = top + 6;
        const span = P.w - 28, step = span / n, hw = Math.min(40, step - 4);
        let out = `<path d="M${P.x + 10} ${railY} H${P.x + P.w - 10}" stroke="url(#pru-brass)" stroke-width="4" stroke-linecap="round"/>`;
        cats.forEach((c, i) => {
            out += PRIDE_UI.hanger(c.key, P.x + 14 + step * (i + 0.5), railY + 10, hw, 38, c.shape, c.key === key);
        });
        // Зеркало примерки.
        const mrx = 78, mry = 98, mcx = P.x + P.w / 2, mcy = railY + 72 + mry;
        this._tryOval = { x: mcx - mrx, y: mcy - mry, w: mrx * 2, h: mry * 2, cat: key };
        out += PRIDE_UI.tryMirror(mcx, mcy, mrx, mry);
        // Билет покупки — отдельной кнопкой, под зеркалом (решение игрока).
        const items = this.tabItems();
        if (this.trySel && !items.some(i => i.id === this.trySel)) this.trySel = null;
        const sel = this.trySel && PRIDE_WARDROBE.items.find(i => i.id === this.trySel);
        const wallet = GameState.currency('pride_kiss');
        const by = mcy + mry + 22;
        if (sel) {
            const price = sel.price.pride_kiss;
            out += PRIDE_UI.ticket(mcx - 84, by, 168, 50, price, wallet >= price ? 'rich' : 'poor', 'pr-buy-wear');
        } else if (items.length) {
            // Ничего не выбрано — пустой контур билета: место, где появится цена.
            out += `<rect x="${mcx - 84}" y="${by}" width="168" height="50" rx="8" fill="none" stroke="${D.brass[500]}"
                          stroke-width="1.6" stroke-dasharray="6 5" opacity="0.35"/>`;
        }
        // Полка: только некупленное.
        const gy = by + 50 + 22, cols = 3, gx = 14;
        // Клетка — сколько влезает до низа окна: полка на одну строку крупнее,
        // на две — мельче, но не мельче пальца.
        const rowsN = Math.max(1, Math.ceil(items.length / cols));
        const availH = P.y + P.h - 16 - gy;
        const s = Math.max(56, Math.min(92, (P.w - 28 - gx * (cols - 1)) / cols, (availH - (rowsN - 1) * 18) / rowsN));
        if (!items.length) {
            // Раскупили полку — она пустая не потому, что сломалась: силуэт
            // гнезда и медалька «здесь всё твоё».
            const slot = cats.find(c => c.key === key);
            out += `<g class="pr-shelf-done" transform="translate(${mcx - 34},${gy + 4})">` +
                   PRIDE_UI.cell(68, PRIDE_UI.ghost(slot.shape, 68), '') + PRIDE_UI.check(62, 6, 12) + '</g>';
            return out;
        }
        const cn = Math.min(items.length, cols);
        const rowW = cn * s + (cn - 1) * gx;
        const x0 = P.x + (P.w - rowW) / 2;
        items.forEach((it, i) => {
            const r = Math.floor(i / cols), c = i % cols;
            const x = x0 + c * (s + gx), y = gy + r * (s + 18);
            const on = it.id === this.trySel;
            const price = it.price.pride_kiss;
            const ip = s * 0.2;
            out += `<g class="pr-item${on ? ' on' : ''}" data-item="${it.id}">` +
                PRIDE_UI.itemCell(x, y, s, on, wallet >= price, price) +
                `<g class="pr-fit" data-box="${(x + ip).toFixed(1)},${(y + ip).toFixed(1)},${(s - ip * 2).toFixed(1)},${(s - ip * 2.3).toFixed(1)}">` +
                WormCosmetics.cardArt(it.id, 15, PALETTE.flesh[500], it.slot) + '</g></g>';
        });
        return out;
    },

    // На полке — ТОЛЬКО некупленное этого гнезда. Пока купленное оставалось
    // на полке, витрина работала второй раздевалкой; теперь это каталог
    // того, чего у тебя ЕЩЁ НЕТ (docs/plan/17-pride.md, раздел 8).
    tabItems() {
        const owned = GameState.data.wardrobe || {};
        const key = this.storeTab === 'boost' ? this.wearKey() : this.storeTab;
        return PRIDE_WARDROBE.items.filter(i => i.slot === key && !owned[i.id]);
    },

    // ---------- ПРИМЕРКА: ВТОРОЙ ЧЕРВЬ В ЗЕРКАЛЕ ----------
    // Тот же персонаж, что в гримёрке, только с примеряемой вещью поверх
    // надетого. Живёт отдельным html-слоем над окном, обрезанным по овалу
    // зеркала; главный червь на это время стоит на паузе — его всё равно не
    // видно под окном, а два живых персонажа — двойная работа каждый кадр.
    tryCosmetics() {
        const worn = Object.assign({}, GameState.data.cosmetics || {});
        const sel = this.trySel && PRIDE_WARDROBE.items.find(i => i.id === this.trySel);
        if (sel) worn[sel.slot] = sel.id;
        return worn;
    },

    previewShow() {
        const O = this._tryOval;
        if (!O || !this.svgEl || !window.WormRenderer || !window.WormModelAPI || !this.wormHandle || !this.wormBox) return;
        const parent = this.wormHost.offsetParent || this.wormHost.parentElement;
        if (!parent) return;
        let clip = document.getElementById('pr-preview');
        if (!clip) {
            clip = document.createElement('div');
            clip.id = 'pr-preview';
            clip.className = 'pr-preview';
            const host = document.createElement('div');
            host.className = 'pr-preview-host';
            clip.appendChild(host);
            const glare = document.createElement('div');
            glare.className = 'pr-preview-glare';
            clip.appendChild(glare);
            parent.appendChild(clip);
        }
        const k = SvgSpace.unit(this.svgEl) || 1;
        const c0 = SvgSpace.toLocal(this.svgEl, O.x, O.y, parent);
        Object.assign(clip.style, { left: c0.x.toFixed(1) + 'px', top: c0.y.toFixed(1) + 'px',
                                    width: (O.w * k).toFixed(1) + 'px', height: (O.h * k).toFixed(1) + 'px' });
        const host = clip.querySelector('.pr-preview-host');
        const model = window.WormModelAPI.loadWormModel();
        model.cosmetics = this.tryCosmetics();
        if (!this.preview) {
            host.style.width = PRIDE_ART.W + 'px';
            host.style.height = PRIDE_ART.H + 'px';
            this.preview = window.WormRenderer.mount(host, model, {
                context: 'pride', wander: false, blink: true, idleWave: true, pose: 'standing',
                tailDepth: 0.62, anchorX: 0.5, anchorY: 0.55
            });
            this.preview.setHeadPose('center', { instant: true });
            this.preview.setLivePose(PRIDE_FACE);
            const pos = this.wormHandle.getPosition();
            this.preview.setPosition(pos.x, pos.y);
            if (this.wormHandle.setPaused) this.wormHandle.setPaused(true);
            host.style.transition = 'none';
        } else {
            this.preview.update(model);
            host.style.transition = 'transform 0.35s cubic-bezier(.3,.7,.3,1)';
        }
        host.style.transform = this.previewTransform(O, c0, parent, k);
    },

    // Где стоит червь в зеркале: для гнёзд головы — по грудь и крупно, для
    // шеи — по пояс, для одежды и хвоста — во весь рост. Смена полки
    // наезжает камерой, а не перескакивает.
    previewTransform(O, c0, parent, k) {
        const B = this.wormBox, S = PRIDE_VIEW.WORM_SCALE;
        const head = ['hat', 'eyes', 'mouth', 'ears'].includes(O.cat);
        const part = head ? 0.52 : (O.cat === 'neck' ? 0.72 : 1.02);
        const r = (O.h * 0.9) / (B.h * part);
        const topY = O.y + O.h * (head ? 0.1 : 0.06);
        const feetY = topY + (PRIDE_ART.Y_FEET - B.y) * r;
        const p0 = SvgSpace.toLocal(this.svgEl, 0, 0, parent);
        const fx = PRIDE_ART.CX / S, fy = PRIDE_ART.Y_FEET / S;
        const bodyCx = B.x + B.w / 2;
        const tx = (O.x + O.w / 2 - (bodyCx - PRIDE_ART.CX) * r) / S, ty = feetY / S;
        return `translate(${(p0.x - c0.x).toFixed(1)}px, ${(p0.y - c0.y).toFixed(1)}px) scale(${(k * S).toFixed(4)}) ` +
               `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${r.toFixed(3)}) translate(${(-fx).toFixed(2)}px, ${(-fy).toFixed(2)}px)`;
    },

    previewDestroy() {
        if (this.preview) {
            this.preview.destroy();
            this.preview = null;
            if (this.wormHandle && this.wormHandle.setPaused) this.wormHandle.setPaused(false);
        }
        const clip = document.getElementById('pr-preview');
        if (clip) clip.remove();
    },

    // ---------- ДЕЙСТВИЯ ----------
    // Нажатие на вещь — примерка, второе нажатие на ту же — снять примерку.
    tryOn(itemId) {
        this.trySel = this.trySel === itemId ? null : itemId;
        this.renderStore();
    },

    // Покупка выбранной вещи. Решает Backend (инвариант 2); купленное сразу и
    // надевается: покупают шляпу, чтобы её увидеть.
    buySelected() {
        const item = this.trySel && PRIDE_WARDROBE.items.find(i => i.id === this.trySel);
        if (!item) return;
        const answer = Backend.buyWardrobe(item.id);
        if (!answer.ok) { this.deny('.pr-buy-wear'); return; }
        Backend.wearCosmetic(item.slot, item.id);
        this.trySel = null;
        this.refreshWorm();
        this.renderStore();
        this.renderHud();
    },
    // Старое имя для прогонов и отладки: «купить вот это» без примерки.
    tapItem(itemId) {
        this.trySel = itemId;
        this.buySelected();
    },

    buyBoost(key) {
        const answer = Backend.buyUpgrade(key, 'pride');
        if (!answer.ok) { this.deny(`.pr-boost[data-boost="${key}"] .pr-ticket`); return; }
        this.resetRun();          // числа следующего выхода изменились
        this.renderAll();
    },

    // ---------- ТАП ПО ЯЧЕЙКЕ: СПИСОК, А НЕ ПЕРЕБОР ----------
    // Перебор по кругу врал о содержимом гнезда; список показывает его
    // целиком (как карточка слота в лобби гнева). Повторный тап — закрыть.
    tapSlot(slotKey) {
        this.openSlot = this.openSlot === slotKey ? null : slotKey;
        this.storeOpen = false;
        this.renderUI();
        this.renderStore();
    },

    // Выбор строки списка. Надевает Backend, а не интерфейс: проверки «есть
    // ли вещь» и «то ли гнездо» на сервере будут теми же.
    pickSlotItem(itemId) {
        Backend.wearCosmetic(this.openSlot, itemId || null);
        this.refreshWorm();
        this.renderAll();
    },

    // Наряд живёт в модели персонажа, значит смена наряда — пересборка модели.
    // Здесь же перекладывается и главный червь комнаты: купленное носится
    // ВЕЗДЕ, и увидеть это игрок должен сразу.
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

    // Отказ — там же, где нажали: вещь дёргается и остаётся тусклой. Текста
    // «не хватает» нет и быть не может (инвариант 9).
    deny(selector) {
        const el = this.screenElement.querySelector(selector);
        if (!el) return;
        el.classList.remove('pr-deny');
        void el.getBBox();
        el.classList.add('pr-deny');
    }
});

// Запуск — здесь, а не в pride.js: этот файл подключается последним,
// и к этому моменту все методы уже на объекте.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PrideMinigame.init());
} else {
    PrideMinigame.init();
}
