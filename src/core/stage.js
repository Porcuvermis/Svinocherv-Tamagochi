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

    viewport() {
        const vv = window.visualViewport;
        return {
            w: Math.max(1, vv ? vv.width : window.innerWidth),
            h: Math.max(1, vv ? vv.height : window.innerHeight)
        };
    },

    apply() {
        const { w, h } = this.viewport();
        // Вписываем целиком: масштаб по меньшей из двух сторон. Не «заполнить
        // экран» — заполнение обрезало бы края, а обрезать в игре нечего:
        // за краем окажется то крестик выхода, то сам персонаж.
        const scale = Math.min(w / STAGE_W, h / STAGE_H);
        document.documentElement.style.setProperty('--stage-scale', scale.toFixed(4));

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
