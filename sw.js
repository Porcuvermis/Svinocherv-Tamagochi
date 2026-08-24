// ================= SERVICE WORKER: СВЕЖАЯ СБОРКА + ОФЛАЙН =================
// Задача ровно одна: с телефона всегда открывается АКТУАЛЬНАЯ сборка, но
// игра не умирает в метро без сети.
//
// ---------- ПОЧЕМУ ЗДЕСЬ КЕШ В ПРИОРИТЕТЕ, А НЕ СЕТЬ ----------
// Первая версия была network-first на всё: каждый файл сначала спрашивался
// у сети, кеш работал страховкой. Расплата обнаружилась на айфоне: перед
// первым кадром страницы браузер обязан скачать index.html, восемь таблиц
// стилей и скрипты — и всё это ждало мобильную сеть, до четырёх секунд
// таймаута на каждый запрос. Пока ждёт, вебвью показывает свой белый фон.
// Та самая вспышка белым на запуске бралась ровно отсюда.
//
// Ключ к развязке — в имени кеша: оно содержит номер сборки, и при
// активации новой сборки все прошлые кеши удаляются. То есть в кеше физически
// не может лежать файл от другой сборки: он либо от текущей, либо его нет.
// Значит отдавать из кеша — не «показать вчерашний код», а «показать ровно
// ту сборку, которая сейчас установлена», и сделать это мгновенно.
//
// Свежесть при этом обеспечивает не запрос за каждым файлом, а sw.js: при
// деплое в него подставляется новый номер сборки, браузер сам замечает, что
// файл изменился, ставит новый service worker — а тот приходит с пустым
// кешем и тянет всё заново из сети. Страница на это отвечает перезагрузкой
// под чёрной пеленой (boot.js + src/core/boot-screen.js), незаметно для
// игрока.
//
// Итого: сеть перестала стоять между запуском и первым кадром, а актуальность
// сборки проверяется там, где это ничего не тормозит.
//
// Единственное исключение — сама навигация (запрос страницы). Она отдаётся
// из кеша сразу, но в фоне всё равно перекачивается: это страховка на случай,
// если index.html когда-нибудь поменяется без смены sw.js.
//
// BUILD подставляется workflow'ом при деплое (.github/workflows/deploy-pages.yml).
// В репозитории здесь всегда 'dev' — это признак «файл открыт не с Pages».
const BUILD = '__BUILD__';

// Имя кеша содержит и адрес сборки, и её версию. Адрес важен потому, что на
// одном домене живут и основная версия (/), и превью веток (/preview/…/):
// кеши у них общие на весь домен, и без разделения по scope соседняя сборка
// затирала бы кеш предыдущей на каждом запуске.
const SCOPE = new URL(self.registration.scope).pathname;
const CACHE_PREFIX = 'svinocherv:' + SCOPE + ':';
const CACHE = CACHE_PREFIX + BUILD;

// Отдельный кеш для vendor/ — он НЕ привязан к номеру сборки и переживает
// деплои. Правило для сторонних библиотек: они кладутся в vendor/, версия
// прибивается прямо в URL (?v=r128), и тогда их не надо перекачивать при
// каждой правке игры. Сейчас там лежит three.js — на нём сцена «Зависти».
const VENDOR_CACHE = 'svinocherv-vendor';
const VENDOR = /\/vendor\//;

// Сколько ждём сеть, когда файла нет в кеше и деваться некуда. Мобильный
// интернет умеет не отвечать вовсе, а не отдавать ошибку: без таймаута игра
// просто висит.
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
    // Новая сборка не ждёт закрытия всех вкладок: обновление должно доезжать
    // с первого открытия иконки с домашнего экрана.
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        // Чистим только свои прошлые сборки: чужие scope и общий кеш
        // библиотек не трогаем.
        const names = await caches.keys();
        const stale = names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE);
        await Promise.all(stale.map((n) => caches.delete(n)));
        await self.clients.claim();
    })());
});

self.addEventListener('message', (event) => {
    if (event.data === 'skip-waiting') self.skipWaiting();
});

function timeout(ms) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error('network timeout')), ms));
}

async function fromNetwork(request, cache) {
    const response = await Promise.race([fetch(request), timeout(NETWORK_TIMEOUT_MS)]);
    if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
    return response;
}

// Файл своей сборки: в кеше он может быть только от неё же (см. шапку),
// поэтому кеш — не «старая копия», а самый быстрый способ отдать нужное.
async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    return fromNetwork(request, cache);
}

// Навигация — единственный запрос, который стоит между запуском приложения и
// первым кадром. Поэтому отдаём кеш немедленно, а свежую копию докачиваем в
// фоне, уже никого не задерживая.
async function shellFirst(request, event) {
    const cache = await caches.open(CACHE);
    // ignoreSearch: игра открывается и как './', и как './?mode=standalone'
    // (start_url из манифеста) — это одна и та же страница.
    const cached = await cache.match(request)
        || await cache.match(request, { ignoreSearch: true })
        || await cache.match('./index.html');

    if (cached) {
        event.waitUntil(fromNetwork(request, cache).catch(() => {}));
        return cached;
    }

    try {
        return await fromNetwork(request, cache);
    } catch (err) {
        // Совсем нечего показать: ни сети, ни копии страницы.
        const fallback = await cache.match('./index.html') || await cache.match('./');
        if (fallback) return fallback;
        throw err;
    }
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;   // чужие хосты не трогаем

    // Каждая сборка отвечает только за свою папку.
    if (!url.pathname.startsWith(SCOPE)) return;
    // Отдельно: scope корневой сборки — '/', то есть формально накрывает и
    // превью веток. Лезть в них она не должна, у каждого превью свой
    // service worker и свой кеш в своей папке.
    if (SCOPE === '/' && url.pathname.startsWith('/preview/')) return;
    // build.txt — способ проверить версию, не открывая игру (см.
    // docs/deploy-iphone.md). Отдавать его из кеша нельзя: диагностика,
    // которая показывает вчерашний ответ, хуже отсутствующей.
    if (url.pathname.endsWith('/build.txt')) return;

    if (request.mode === 'navigate') {
        event.respondWith(shellFirst(request, event));
    } else if (VENDOR.test(url.pathname)) {
        // Библиотека не меняется в пределах своей версии и живёт в кеше,
        // который переживает деплои: 600 КБ незачем качать заново на каждую
        // правку игры.
        event.respondWith(cacheFirst(request, VENDOR_CACHE));
    } else {
        // Свой код и ассеты — из кеша текущей сборки, а если там пусто
        // (сборка только что сменилась) — из сети, с записью в кеш.
        event.respondWith(cacheFirst(request, CACHE));
    }
});
