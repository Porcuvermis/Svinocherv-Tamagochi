// ================= ЭКРАН ЗАГРУЗКИ: КОГДА ОТКРЫВАТЬ =================
// Игровой логики здесь нет. Этот файл отвечает на вопрос «когда игра готова
// показаться», а как она при этом выглядит — задано инлайном в <head>
// index.html (класс .boot-veil и его стили).
//
// ---------- ПОЧЕМУ РАЗДЕЛЕНО ИМЕННО ТАК ----------
// Всё, что подключается ссылкой, — это запрос в сеть ДО первого кадра, а
// пока он идёт, экран белый. Поэтому вид пелены (чёрный фон + обрезка
// #game-container в точку) обязан быть инлайном, без единого запроса, а
// этот файл спокойно грузится в конце <body>: к моменту, когда решение
// «пора открывать» вообще может понадобиться, он давно на месте.
//
// ---------- ЗАЧЕМ ВСЁ ЭТО ----------
// Запуск с домашнего экрана выглядел как двойная загрузка: экран показывал
// игру, моргал и загружался ещё раз. Причина — перезагрузка страницы при
// смене service worker'а (см. boot.js): свежая сборка приезжает после того,
// как игра уже нарисовалась. Прятать саму перезагрузку нельзя, она нужна,
// а вот прятать её ОТ ГЛАЗ — можно: под пеленой любые пересборки экрана
// происходят в черноте.
//
// Плюс запас на будущее: игра будет тяжелеть, и «пусто → внезапно всё» —
// худший вариант появления. Лучше секунда честной черноты и театральное
// открытие кругом из центра.
//
// ---------- КТО СНИМАЕТ ПЕЛЕНУ ----------
// Не таймер, а список «держателей» (holds). Пелена уходит, когда список
// пуст И прошло минимум времени черноты. Держат:
//   'document'   — до window.load (стили, скрипты, картинки);
//   'game'       — до первого нарисованного кадра свиночервя (main.js);
//   'sw-check'   — пока идёт проверка обновления (boot.js);
//   'sw-install' — пока новая сборка ставится, чтобы перезагрузка
//                  случилась под чернотой.
// Сверху — предохранители: HARD_CAP_MS здесь и таймер в самом index.html на
// случай, если этот файл вообще не доехал. Чёрный экран навсегда не должен
// получиться ни при каком раскладе.
(function () {
    const REVEAL_MS = 1100;     // столько же, сколько transition в <head>
    const MIN_BLACK_MS = 900;   // минимум черноты, чтобы открытие читалось
    const HARD_CAP_MS = 7000;   // предохранитель: дальше показываем как есть
    const COVER_MS = 300;       // затемнение перед перезагрузкой на ходу

    const root = document.documentElement;

    // Отсчёт черноты идёт от НАЧАЛА НАВИГАЦИИ, а не от запуска этого файла:
    // пелена появилась ещё в <head>, а сюда исполнение доходит позже, и
    // считать от него — значит держать чёрный экран лишние доли секунды.
    // performance.now() как раз и есть «сколько прошло с начала навигации».
    const since = () => (window.performance && performance.now)
        ? performance.now()
        : (Date.now() - fallbackStart);
    const fallbackStart = Date.now();

    // Сколько едет круг, задано в CSS (инлайн в <head>). Здесь это число
    // нужно ровно для одного: понять, когда анимация кончилась и класс
    // можно снимать. Настройку «меньше движения» CSS учитывает сам.
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const revealMs = calm ? 200 : REVEAL_MS;

    // Разметка уже пришла с классом .boot-veil (инлайн-скрипт в <head>) —
    // здесь только снимаем предохранитель оттуда: дальше за открытие
    // отвечает этот файл.
    if (window.__bootFailsafe) {
        clearTimeout(window.__bootFailsafe);
        window.__bootFailsafe = null;
    }

    // Если класса нет, значит инлайн-часть из index.html не отработала.
    // Своими руками её не воспроизводим: без стилей пелены (они там же)
    // получился бы не чёрный экран, а просто невидимая игра.
    const veiled = root.classList.contains('boot-veil');

    const holds = new Set(['document', 'game']);
    let state = veiled ? 'veiled' : 'done';   // veiled → opening → done
    let minBlackTimer = null;

    const capTimer = setTimeout(() => {
        // Что-то не отпустило свой hold. Показать игру важнее, чем дождаться.
        if (holds.size) console.warn('[Пелена] снята по таймауту, держали:', Array.from(holds));
        open();
    }, HARD_CAP_MS);

    function open() {
        if (state !== 'veiled') return;
        state = 'opening';
        clearTimeout(capTimer);
        clearTimeout(minBlackTimer);

        root.classList.add('boot-open');

        setTimeout(() => {
            // Снимаем оба класса: clip-path не должен пережить открытие,
            // иначе он продолжит резать position:fixed мини-игры.
            root.classList.remove('boot-veil', 'boot-open');
            state = 'done';
            document.dispatchEvent(new CustomEvent('boot:revealed'));
        }, revealMs + 60);
    }

    function maybeOpen() {
        if (state !== 'veiled' || holds.size) return;
        const waited = since();
        if (waited >= MIN_BLACK_MS) {
            open();
        } else {
            clearTimeout(minBlackTimer);
            minBlackTimer = setTimeout(maybeOpen, MIN_BLACK_MS - waited);
        }
    }

    window.BootScreen = {
        // Задержать открытие. Токен — строка, повторный hold с тем же
        // токеном ничего не ломает.
        hold(token) {
            if (state === 'veiled') holds.add(token);
        },

        release(token) {
            if (!holds.delete(token)) return;
            maybeOpen();
        },

        // true, пока экран чёрный: boot.js по этому признаку решает, можно
        // ли перезагружаться молча.
        isVeiled() {
            return state === 'veiled';
        },

        // Перезагрузка на ходу: сначала уводим экран в чёрное, потом
        // reload. Новая страница поднимется уже под своей пеленой.
        coverThenReload() {
            if (state === 'veiled') {
                location.reload();
                return;
            }
            const cover = document.createElement('div');
            cover.id = 'boot-cover';
            (document.body || root).appendChild(cover);
            // Кадр на применение стартовой прозрачности, иначе браузер
            // склеит оба состояния и перехода не будет.
            requestAnimationFrame(() => {
                cover.classList.add('on');
                setTimeout(() => location.reload(), COVER_MS + 40);
            });
        }
    };

    if (document.readyState === 'complete') {
        window.BootScreen.release('document');
    } else {
        window.addEventListener('load', () => window.BootScreen.release('document'));
    }

    // Если на старте что-то упало, свой hold уже никто не отпустит. Держать
    // из-за этого чёрный экран до предохранителя — худшее, что можно
    // сделать: игрок увидит «приложение не запускается» вместо ошибки.
    // Поэтому на любой сбой открываемся сразу, что бы там ни было готово.
    const openAfterCrash = () => {
        holds.clear();
        setTimeout(maybeOpen, 150);
    };
    window.addEventListener('error', openAfterCrash);
    window.addEventListener('unhandledrejection', openAfterCrash);
})();
