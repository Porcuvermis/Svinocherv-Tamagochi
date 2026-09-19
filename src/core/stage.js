// ================= СЦЕНА: ОДИН ХОЛСТ НА ВСЕ ЭКРАНЫ =================
// Игра рисуется в холсте постоянного размера (STAGE_W × STAGE_H условных
// пикселей), а под окно подгоняется целиком — одним масштабом. Ничего не
// перестраивается: ни при повороте телефона, ни когда на компьютере тянут
// угол окна.
//
// ---------- ПОЧЕМУ НЕ РЕЗИНОВАЯ ВЁРСТКА ----------
// До этого всё считалось от размеров окна: комната, перспектива, HUD, меню.
// Для формы, под которую верстали, выходило хорошо, для любой другой —
// ерунда: в горизонтали персонаж уезжал под нижнюю кромку, а в широком окне
// кружки грехов расползались через весь экран.
//
// Резиновая вёрстка честно решается только одним способом: рисовать каждый
// экран дважды, под вертикаль и под горизонталь, и дальше делать так с
// каждой новой мини-игрой. Для тамагочи это не окупается.
//
// Фиксированный холст снимает вопрос целиком: раскладка ровно одна, её
// достаточно проверить один раз. Побочная выгода — прыгающая высота окна в
// Telegram (развернули приложение, вылезла клавиатура) перестаёт что-либо
// значить.
//
// Размер холста — 390×844: логический размер распространённого телефона.
// На более коротких экранах по бокам останутся поля цвета фона, на длинных —
// сверху и снизу. Это осознанный размен: поля лучше, чем разъезжающаяся
// раскладка.
const STAGE_W = 390;
const STAGE_H = 844;

const Stage = {
    overlay: null,
    probe: null,

    init() {
        this.overlay = document.getElementById('rotate-overlay');

        const root = document.documentElement;
        root.style.setProperty('--stage-w', STAGE_W + 'px');
        root.style.setProperty('--stage-h', STAGE_H + 'px');

        this.apply();

        // Пересчитываем на всё, что меняет размер окна. visualViewport — про
        // клавиатуру и панели браузера: window.innerHeight про них врёт.
        window.addEventListener('resize', () => this.apply());
        window.addEventListener('orientationchange', () => setTimeout(() => this.apply(), 120));
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => this.apply());
        }

        this.askPlatformForPortrait();
    },

    // ---------- СКОЛЬКО МЕСТА НА САМОМ ДЕЛЕ ----------
    // Обычная страница: visualViewport — это ровно то, что видно
    // (window.innerHeight врёт про панели браузера и клавиатуру).
    //
    // Telegram: врёт уже сам visualViewport. Вебвью мини-приложения ВЫШЕ
    // видимой области — часть его уходит под шапку клиента и под нижнюю
    // кромку, — а высоту он отдаёт полную. Игра из-за этого масштабировалась
    // под несуществующее место, и её ровно на эту разницу срезало сверху и
    // снизу: в бою гнева уплывающая цифра урона уходила за край экрана.
    //
    // Правду знает сам клиент:
    //   viewportStableHeight — видимая высота без учёта временных панелей
    //                          (клавиатуры), то есть то, во что верстать;
    //   safeAreaInset        — чёлка и полоска «домой» устройства;
    //   contentSafeAreaInset — сверху шапка клиента, снизу его кромка.
    //                          В обычном (не полноэкранном) режиме нули,
    //                          но вычитать их надо: полноэкранный режим —
    //                          вопрос одной строки в будущем.
    //
    // ---------- И ОДНО МЕСТО НА ВСЕ БЕЗОПАСНЫЕ ЗОНЫ ----------
    // Чёлка и полоска «домой» вычитаются ЗДЕСЬ, и только здесь. Внутри
    // холста никаких env(safe-area-inset-*) быть не должно: он уже вписан в
    // безопасную область целиком, и второй отступ отъедает место повторно —
    // да ещё в настоящих пикселях устройства, а холст масштабирован
    // (docs/traps.md, п. 134). Стережёт это tools/test-stage-fit.js.
    //
    // Вне Telegram зоны берутся у самого браузера: в мини-приложении,
    // добавленном на домашний экран, видимая область включает чёлку, и без
    // этого вычитания крестик выхода оказался бы под ней.
    viewport() {
        const vv = window.visualViewport;
        let w = Math.max(1, vv ? vv.width : window.innerWidth);
        let h = Math.max(1, vv ? vv.height : window.innerHeight);

        const tg = window.Telegram && window.Telegram.WebApp;
        if (!tg) {
            const css = this.cssSafeArea();
            h = Math.max(1, h - css.top - css.bottom);
            w = Math.max(1, w - css.left - css.right);
        }
        if (tg) {
            const stable = Number(tg.viewportStableHeight) || Number(tg.viewportHeight) || 0;
            if (stable > 0) h = Math.min(h, stable);

            const safe = tg.safeAreaInset || {};
            const content = tg.contentSafeAreaInset || {};
            const cut = (Number(safe.top) || 0) + (Number(safe.bottom) || 0)
                      + (Number(content.top) || 0) + (Number(content.bottom) || 0);
            const side = (Number(safe.left) || 0) + (Number(safe.right) || 0)
                       + (Number(content.left) || 0) + (Number(content.right) || 0);
            if (cut > 0) h = Math.max(1, h - cut);
            if (side > 0) w = Math.max(1, w - side);
        }

        return { w, h };
    },

    // ---------- БЕЗОПАСНЫЕ ЗОНЫ ОТ БРАУЗЕРА ----------
    // Прочитать env(safe-area-inset-*) из js напрямую нельзя — это значение
    // css. Поэтому в разметке живёт невидимая пробка, у которой эти отступы
    // проставлены, и мы читаем её посчитанный стиль.
    //
    // Пробка создаётся ОДИН раз и остаётся в дереве: значения меняются при
    // повороте телефона, и пересоздавать её на каждый resize значило бы
    // трогать дерево там, где достаточно прочитать.
    cssSafeArea() {
        if (!this.probe) {
            const el = document.createElement('div');
            el.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;' +
                'visibility:hidden;pointer-events:none;' +
                'padding-top:env(safe-area-inset-top);' +
                'padding-right:env(safe-area-inset-right);' +
                'padding-bottom:env(safe-area-inset-bottom);' +
                'padding-left:env(safe-area-inset-left);';
            document.body.appendChild(el);
            this.probe = el;
        }
        const cs = getComputedStyle(this.probe);
        const n = (v) => Number.parseFloat(v) || 0;
        return { top: n(cs.paddingTop), right: n(cs.paddingRight),
                 bottom: n(cs.paddingBottom), left: n(cs.paddingLeft) };
    },

    apply() {
        const { w, h } = this.viewport();
        // Вписываем целиком: масштаб по меньшей из двух сторон. Не «заполнить
        // экран» — заполнение обрезало бы края, а обрезать в игре нечего:
        // за краем окажется то крестик выхода, то сам персонаж.
        const scale = Math.min(w / STAGE_W, h / STAGE_H);
        document.documentElement.style.setProperty('--stage-scale', scale.toFixed(4));

        // ---------- ЦЕНТР ВИДИМОГО, А НЕ ЦЕНТР СТРАНИЦЫ ----------
        // Холст стоит серединой в середине родителя, и обычно это одно и то
        // же. Не одно и то же в двух случаях: в Telegram страница выше
        // видимой области (середина страницы оказывается ниже середины
        // экрана), а на телефоне с чёлкой видимая область смещена вниз
        // относительно окна. Оба случая — один и тот же расчёт: центр
        // безопасной полосы это её верх плюс половина высоты.
        const tg = window.Telegram && window.Telegram.WebApp;
        const root = document.documentElement;
        let top;
        if (tg) {
            const safe = tg.safeAreaInset || {};
            const content = tg.contentSafeAreaInset || {};
            top = (Number(safe.top) || 0) + (Number(content.top) || 0);
        } else {
            top = this.cssSafeArea().top;
        }
        root.style.setProperty('--stage-top', (top + h / 2).toFixed(1) + 'px');

        this.updateRotateHint(w, h);
    },

    // Просьба перевернуть телефон. Показывается только там, где она уместна:
    // телефон, лежащий боком. На компьютере широкое окно — это нормально,
    // игра просто вписывается в него и остаётся играбельной.
    updateRotateHint(w, h) {
        if (!this.overlay) return;
        const landscape = w > h;
        const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        // Порог именно такой: у телефона, лежащего боком, короткая сторона
        // около 390–430. Окно браузера на компьютере высотой 500 — это не
        // «телефон боком», игра туда прекрасно вписывается, и просить
        // человека перевернуть монитор было бы странно.
        const phoneSized = Math.min(w, h) < 430;
        this.overlay.classList.toggle('visible', landscape && (touch || phoneSized));
    },

    // Там, где платформа умеет держать ориентацию, просим её об этом. Это
    // страховка, а не решение: Safari на iOS манифест игнорирует, а
    // Telegram умеет лишь в свежих версиях. Поэтому всё выше работает и без
    // всякой блокировки.
    askPlatformForPortrait() {
        try {
            const tg = window.Telegram && window.Telegram.WebApp;
            if (tg) {
                if (typeof tg.expand === 'function') tg.expand();
                if (typeof tg.lockOrientation === 'function') tg.lockOrientation();
            }
            if (screen.orientation && typeof screen.orientation.lock === 'function') {
                // Без полноэкранного режима браузеры это отклоняют — ловим
                // отказ молча, он ничего не ломает.
                const p = screen.orientation.lock('portrait');
                if (p && typeof p.catch === 'function') p.catch(() => {});
            }
        } catch (err) {
            /* платформа не умеет — работаем как есть */
        }
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Stage.init());
} else {
    Stage.init();
}

if (typeof window !== 'undefined') {
    window.Stage = Stage;
    window.STAGE_SIZE = { width: STAGE_W, height: STAGE_H };
}
