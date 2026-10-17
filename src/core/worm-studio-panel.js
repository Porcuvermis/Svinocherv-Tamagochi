// ================= СТУДИЯ: ПАНЕЛЬ =================
// Навигация по ярусам, ручки, что уместно, пресеты, контекст для агента, кнопки, стоп.
// Продолжение WormStudio (worm-studio.js): свойства добавляются на тот же
// объект, `this` в методах — он же. Подключается сразу после worm-studio.js.
Object.assign(WormStudio, {

    // ---------- НАВИГАЦИЯ: ОДИН ЯРУС ----------
    // Было два ряда сразу: пять разделов и плитки открытого раздела. Вместе
    // они съедали девяносто точек из двухсот пятнадцати, которые есть у
    // панели в холсте Telegram, — то есть почти половину места отдавали
    // тому, что уже выбрано и менять его не собираются.
    //
    // Теперь ярус один: либо разделы, либо «‹ раздел» и его части. Куда
    // нажали, там и стоишь, а название раздела написано на кнопке возврата —
    // потеряться негде.
    renderNav() {
        const nav = this.root.querySelector('[data-out="nav"]');
        if (!this.row) {
            nav.innerHTML = WORM_STUDIO_ROWS.map(r =>
                `<button data-row="${r.key}">${r.title}</button>`).join('');
            nav.scrollLeft = 0;
            return;
        }
        const row = WORM_STUDIO_ROWS.find(r => r.key === this.row);
        if (!row) { this.row = null; this.renderNav(); return; }
        let html = `<button data-row="" class="ws-back">‹ ${row.title}</button>`;
        // Показываем только то, что СЕЙЧАС есть на экране: растущих сегментов
        // может не вырасти, ухо бывает спрятано шляпой. Плитка, ведущая в
        // никуда, хуже отсутствующей.
        (row.keys || []).forEach(c => {
            const e = (typeof WormParts !== 'undefined') ? WormParts.get(c.k) : null;
            if (!e) return;
            if (this.handle && !WormParts.at(this.handle, c.k)) return;
            const on = this.sameSubject(c.k, this.picked);
            html += `<button data-chip="${c.k}" class="${on ? 'on' : ''}">${c.t || e.title}</button>`;
        });
        nav.innerHTML = html;

        // Выбранная плитка подъезжает в середину ряда. Без этого тык в
        // персонажа переключал раздел, а сама плитка оставалась за краем — и
        // выходило, что выбранного на экране не видно вовсе.
        // Считаем сдвиг руками, а не scrollIntoView: тот заодно прокручивает
        // всех предков, а студия — экран, который не скроллится.
        const on = nav.querySelector('.on');
        if (on) nav.scrollLeft = Math.max(0, on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2);
    },

    // ---------- ОДИН ЛИ ЭТО ПРЕДМЕТ ----------
    // Плитка «скулы» обязана гореть и на левой скуле, и на правой, и на
    // голове, когда тянут её контур. Иначе экран показывает одно, а правят
    // другое — а это первое, на что смотрит глаз.
    sameSubject(chipKey, picked) {
        if (!chipKey || !picked) return false;
        if (chipKey === picked) return true;
        if (this.twin(picked) === chipKey) return true;
        const ear = this.earOf(picked);
        if (ear) return chipKey === 'ear-' + ear || chipKey === 'ear-left';
        if (this.isChainish(picked)) return picked.replace(/^girth-/, '') === chipKey;
        // Контур черепа тянут, оставаясь «на голове»: точка сама по себе
        // плитки не имеет.
        if (this.isSkullish(picked) && chipKey === 'head') return picked === 'head';
        return false;
    },

    // Близнец с другой стороны: у пар это половина смысла экрана, а отдельной
    // плитки им не полагается — ряд от этого уезжал за край.
    twin(key) {
        if (!key) return null;
        if (/-left$/.test(key)) return key.replace(/-left$/, '-right');
        if (/-right$/.test(key)) return key.replace(/-right$/, '-left');
        return null;
    },

    // ---------- РУЧКИ ----------
    // Ползунок плюс две кнопки шага. Ползунок хорош для «примерно», кнопки —
    // для «ещё чуть-чуть»: пальцем по ползунку точнее 0.05 не попасть, а
    // доводка нужна именно такая.
    knobKeys() {
        if (this.row === 'light') {
            return (WORM_STUDIO_ROWS.find(r => r.key === 'light').knobs || []);
        }
        const e = this.picked && typeof WormParts !== 'undefined' ? WormParts.get(this.picked) : null;
        if (!e) return [];
        return (e.knobs || []).filter(k => WormLook.knob(k));
    },

    // Обхват выбранного звена — своя строка ползунка, как перекос у черепа.
    // Без неё панель после перетаскивания стоит на нуле и выглядит
    // сломанной: правка есть, а показать её нечем.
    girthKey() {
        const e = this.picked && typeof WormParts !== 'undefined' ? WormParts.get(this.picked) : null;
        return (e && e.girth) ? e.girth.path : null;
    },

    skewKey() {
        const e = this.picked && typeof WormParts !== 'undefined' ? WormParts.get(this.picked) : null;
        if (!e || e.kind !== 'landmark' || !e.skull || e.skull.side === 0) return null;
        const name = { forehead: 'brow', temple: 'temple', cheek: 'cheek',
                       jowl: 'jaw', 'muzzle-edge': 'muzzle' }[e.key.replace(/-(left|right)$/, '')];
        return name ? name + (e.skull.side < 0 ? 'L' : 'R') : null;
    },

    renderKnobs(force) {
        const host = this.root.querySelector('[data-out="knobs"]');
        const sig = this.row + '|' + (this.picked || '');
        // Пересобираем ряд ТОЛЬКО когда сменилось выбранное: пересобранный
        // под пальцем ползунок обрывает жест (docs/traps.md, п. 139).
        if (!force && sig === this.knobsFor) { this.syncKnobs(); return; }
        this.knobsFor = sig;

        const rows = [];
        const gk = this.girthKey();
        if (gk) {
            const v = (WormLook.girth && WormLook.girth[gk]) || 0;
            rows.push(this.knobRow('обхват', `data-girth="${gk}"`, v, -0.8, 1.5, false));
        }
        const sk = this.skewKey();
        if (sk) {
            const v = (WormLook.skew && WormLook.skew[sk]) || 0;
            rows.push(this.knobRow('перекос', `data-skew="${sk}"`, v, -0.6, 0.6, false));
        }
        this.knobKeys().forEach(key => {
            const k = WormLook.knob(key);
            const v = WormLook.values[key] || 0;
            rows.push(this.knobRow(k.title, `data-knob="${key}"`, v, -1, 1, WormLook.isLocked(key)));
        });
        host.innerHTML = rows.length ? rows.join('')
            : '<div class="ws-dim">у этой вещи ручек нет — её крутят только целиком</div>';
        this.syncSteps();
        this.syncContext();
        this.renderPresets();
    },

    // ---------- ЧТО СЕЙЧАС УМЕСТНО ----------
    // Ракурс имеет смысл только на голове: там половина ошибок видна лишь
    // на повороте. Для тела, кожи и света это лишняя строка, которая в
    // холсте Telegram стоила ровно того места, которого не хватало.
    //
    // Откат и сброс — только когда есть что откатывать. Кнопка, которая
    // ничего не делает, обязана отсутствовать, а не быть серой.
    syncContext() {
        // Вторая сторона — кнопкой в шапке, рядом с именем: это про то, КОГО
        // правят, а не про то, что крутят. Плитки у правой скулы нет
        // намеренно — с ней ряд уезжал за край экрана.
        const tw = this.twin(this.picked);
        const swap = this.root.querySelector('[data-out="twin"]');
        if (swap) {
            swap.classList.toggle('ws-hide', !(tw && WormParts.get(tw)));
            if (tw && WormParts.get(tw)) swap.title = WormParts.get(tw).title;
        }
        const foot = this.root.querySelector('[data-out="foot"]');
        if (foot) foot.classList.toggle('ws-hide', !this.headish(this.picked));
        const edits = this.root.querySelector('[data-out="edits"]');
        if (edits) edits.classList.toggle('ws-hide', !Object.keys(WormLook.patch()).length);
    },

    // ---------- ПРЕСЕТЫ ----------
    // Область — либо выбранная часть, либо весь червь. Переключатель один и
    // подписан тем, что сейчас сохранится: гадать, на что нажимаешь
    // «сохранить», не надо.
    scope() {
        if (this.scopeAll || !this.picked) return WormPresets.ALL;
        return WormPresets.scopeOf(this.picked);
    },

    scopeTitle() {
        if (this.scope() === WormPresets.ALL) return 'весь червь';
        const e = WormParts.get(this.picked);
        return e ? e.title : this.picked;
    },

    renderPresets() {
        if (typeof WormPresets === 'undefined') return;
        const sc = this.scope();
        const btn = this.root.querySelector('[data-out="scope"]');
        if (btn) btn.textContent = this.scopeTitle();
        const sel = this.root.querySelector('[data-out="preset"]');
        if (!sel) return;
        const было = sel.value;
        const имена = WormPresets.names(sc);
        sel.innerHTML = имена.map(n => `<option value="${n}">${n}</option>`).join('');
        sel.value = имена.indexOf(было) >= 0 ? было : WormPresets.DEFAULT;
    },

    loadPreset(name) {
        if (!this.handle) return;
        WormPresets.load(this.handle, this.scope(), name);
        WormLook.flush();
        this.renderKnobs(true);
    },

    savePreset() {
        const sc = this.scope();
        // Диалог именно здесь и именно prompt: студия — инструмент отладки,
        // своё окно ввода ей заводить не за чем.
        const name = window.prompt('Имя пресета для «' + this.scopeTitle() + '»:', '');
        if (!WormPresets.save(sc, name)) return;
        this.renderPresets();
        const sel = this.root.querySelector('[data-out="preset"]');
        if (sel) sel.value = String(name).trim();
    },

    delPreset() {
        const sel = this.root.querySelector('[data-out="preset"]');
        if (!sel || sel.value === WormPresets.DEFAULT) return;
        if (!window.confirm('Удалить пресет «' + sel.value + '»?')) return;
        WormPresets.remove(this.scope(), sel.value);
        this.renderPresets();
    },

    // ---------- КОНТЕКСТ ДЛЯ АГЕНТА ----------
    // Не «персонаж выглядит плоским», а разбор: что выбрано, что под ним,
    // какой ракурс, какие ручки на это влияют и что с ними сейчас. Собирает
    // его инспектор — второй такой сборщик разошёлся бы с этим при первой
    // же правке.
    showContext() {
        const ta = this.root.querySelector('[data-out="ctx"]');
        if (!ta || typeof WormInspect === 'undefined') return;
        if (!ta.classList.contains('ws-hide')) { this.hideContext(); return; }
        const c = WormInspect.contextFor(this.handle, this.picked);
        ta.value = JSON.stringify(c, null, 1);
        ta.classList.remove('ws-hide');
        // Пока читают разбор — ручки, пресеты и ракурс уходят. Не ради
        // красоты: вместе они не влезают в панель, а крутить что-то,
        // одновременно читая JSON, всё равно никто не станет.
        this.root.querySelector('.ws-sheet').classList.add('ws-ctx');
        ta.focus(); ta.select();
        // Буфер бывает запрещён — тогда текст просто выделен, копируй руками.
        try { navigator.clipboard.writeText(ta.value); } catch (err) { /* и ладно */ }
    },

    hideContext() {
        const ta = this.root.querySelector('[data-out="ctx"]');
        if (ta) ta.classList.add('ws-hide');
        const sh = this.root.querySelector('.ws-sheet');
        if (sh) sh.classList.remove('ws-ctx');
    },

    headish(key) {
        if (!key) return this.row === 'face' || this.row === 'skull';
        if (this.isSkullish(key) || this.earOf(key)) return true;
        const e = (typeof WormParts !== 'undefined') ? WormParts.get(key) : null;
        return !!(e && (e.parent === 'head' || e.key === 'head'));
    },

    knobRow(title, attr, v, min, max, locked) {
        return `<div class="ws-knob">
            <span class="ws-lbl">${title}</span>
            <button class="ws-step" data-step="-1" ${attr}>−</button>
            <input type="range" ${attr} min="${min}" max="${max}" step="0.02"
                   value="${v}"${locked ? ' disabled' : ''}>
            <button class="ws-step" data-step="1" ${attr}>+</button>
            <span class="ws-val">${v >= 0 ? '+' : ''}${v.toFixed(2)}</span>
        </div>`;
    },

    // Обновление чисел БЕЗ пересборки ряда. Ползунок, которым сейчас
    // управляют, не трогаем вовсе: запись в value посреди жеста дёргает
    // бегунок.
    syncKnobs() {
        this.root.querySelectorAll('.ws-knob input').forEach(inp => {
            const k = inp.getAttribute('data-knob'), s = inp.getAttribute('data-skew');
            const g = inp.getAttribute('data-girth');
            const v = k ? (WormLook.values[k] || 0)
                    : g ? ((WormLook.girth && WormLook.girth[g]) || 0)
                        : ((WormLook.skew && WormLook.skew[s]) || 0);
            if (document.activeElement !== inp) inp.value = String(v);
            const out = inp.parentNode.querySelector('.ws-val');
            if (out) out.textContent = (v >= 0 ? '+' : '') + v.toFixed(2);
        });
        this.syncSteps();
    },

    syncSteps() {
        const n = Object.keys(WormLook.patch()).length;
        const out = this.root.querySelector('[data-out="steps"]');
        // Цифра без слова: место в шапке меряется буквами, а «правок» тут
        // ничего не объясняет — число стоит рядом с откатом и сбросом.
        if (out) out.textContent = n ? String(n) : '';
        const edits = this.root.querySelector('[data-out="edits"]');
        if (edits) edits.classList.toggle('ws-hide', !n);
    },

    // ---------- КНОПКИ ----------
    onClick(e) {
        const t = e.target;
        if (!t) return;
        const row = t.getAttribute && t.getAttribute('data-row');
        const chip = t.getAttribute && t.getAttribute('data-chip');
        const step = t.getAttribute && t.getAttribute('data-step');
        const act = t.getAttribute && t.getAttribute('data-act');
        if (row) { this.row = row; if (row === 'light') this.picked = null; this.renderNav(); this.renderKnobs(true); return; }
        if (chip) { this.select(chip); return; }
        if (step) { this.bump(t, +step * 0.05); return; }
        if (!act) return;
        if (act === 'twin') { const t = this.twin(this.picked); if (t) this.select(t); return; }
        if (act === 'scope') { this.scopeAll = !this.scopeAll; this.renderPresets(); return; }
        if (act === 'preset-save') { this.savePreset(); return; }
        if (act === 'preset-del') { this.delPreset(); return; }
        if (act === 'ctx') { this.showContext(); return; }
        if (act === 'close') this.close();
        else if (act === 'freeze') this.setFrozen(!this.frozen);
        else if (act === 'undo') { WormLook.undo(this.handle); this.renderKnobs(true); }
        else if (act === 'reset') { WormLook.reset(this.handle); this.renderKnobs(true); }
        else if (act === 'zoom-in') this.zoomBy(1.4);
        else if (act === 'zoom-out') this.zoomBy(1 / 1.4);
        else if (act === 'zoom-all') this.frameAll();
        else if (act === 'yaw-auto') {
            if (this.handle) this.handle.setHeadPose('auto');
            const r = this.root.querySelector('[data-in="yaw"]');
            if (r) r.value = '0';
        }
    },

    bump(btn, d) {
        const k = btn.getAttribute('data-knob'), s = btn.getAttribute('data-skew');
        const g = btn.getAttribute('data-girth');
        if (g) {
            WormLook.setGirth(this.handle, g, ((WormLook.girth && WormLook.girth[g]) || 0) + d);
        } else if (k) {
            WormLook.apply(this.handle, { [k]: d });
        } else if (s) {
            const name = s.slice(0, -1), side = s.slice(-1) === 'L' ? -1 : 1;
            WormLook.setSkew(this.handle, name, side, d);
        }
        WormLook.flush();
        this.syncKnobs();
    },

    onInput(e) {
        const inp = e.target;
        if (!inp || inp.tagName !== 'INPUT') return;
        this.busy = Date.now();
        const v = parseFloat(inp.value);
        if (inp.getAttribute('data-in') === 'yaw') {
            if (this.handle) this.handle.setHeadPose(v);
            return;
        }
        const k = inp.getAttribute('data-knob'), s = inp.getAttribute('data-skew');
        const g = inp.getAttribute('data-girth');
        if (g) WormLook.setGirth(this.handle, g, v);
        else if (k) WormLook.apply(this.handle, { [k]: v }, { absolute: true });
        else if (s) {
            const name = s.slice(0, -1), side = s.slice(-1) === 'L' ? -1 : 1;
            if (!WormLook.skew) WormLook.skew = {};
            WormLook.skew[s] = v;
            WormLook.setSkew(this.handle, name, side, 0);
        } else return;
        // Обновляем ТОЛЬКО число рядом. Пересборка ряда убила бы узел под
        // пальцем — ловушка №139.
        const out = inp.parentNode.querySelector('.ws-val');
        if (out) out.textContent = (v >= 0 ? '+' : '') + v.toFixed(2);
        this.syncSteps();
    },

    zoomBy(k) {
        if (!this.camTo) return;
        this.camTo.z = Math.max(0.5, Math.min(10, this.camTo.z * k));
    },

    // ---------- СТОП ----------
    // Кнопка, которой не хватало сильнее всего: в движущуюся цель не попасть
    // ни пальцем, ни глазом. Дыхание и моргание снимаются опциями рендерера —
    // персонажа не разбирают и не пересобирают, просто следующий кадр
    // считает его неподвижным.
    setFrozen(v) {
        this.frozen = v;
        if (this.handle) this.handle.setOptions({ idleWave: !v, blink: !v, wander: false });
        this.syncIcons();
    },

    syncIcons() {
        const f = this.root.querySelector('[data-act="freeze"]');
        if (f) { f.textContent = this.frozen ? '⏸' : '▶'; f.classList.toggle('on', this.frozen); }

    },
});
