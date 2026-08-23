// ================= SERVICE WORKER: СВЕЖАЯ СБОРКА + ОФЛАЙН =================
// Задача ровно одна: с телефона всегда открывается АКТУАЛЬНАЯ сборка, но
// игра не умирает в метро без сети.
//
// Поэтому стратегия — network-first, а не cache-first: сеть есть — берём
// свежий файл и кладём копию в кеш; сети нет — отдаём копию. Cache-first
// (обычный дефолт из туториалов) на айфоне даёт ровно ту боль, из-за которой
// всё это и затевалось: экран показывает вчерашний код, а ты гадаешь,
// доехал ли пуш.
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
// каждой правке игры. Сейчас там пусто — three.js оттуда убран, потому что
// игра его не использует.
const VENDOR_CACHE = 'svinocherv-vendor';
const VENDOR = /\/vendor\//;

// Сколько ждём сеть, прежде чем показать кеш. Мобильный интернет умеет не
// отвечать вовсе, а не отдавать ошибку: без таймаута игра просто висит.
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

async function networkFirst(request) {
    const cache = await caches.open(CACHE);
    try {
        const response = await Promise.race([fetch(request), timeout(NETWORK_TIMEOUT_MS)]);
        if (response && response.ok) cache.put(request, response.clone());
        return response;
    } catch (err) {
        const cached = await cache.match(request);
        if (cached) return cached;
        // Навигация без сети и без точного совпадения — отдаём стартовую
        // страницу, иначе Safari покажет свою «нет интернета».
        if (request.mode === 'navigate') {
            const fallback = await cache.match('./index.html') || await cache.match('./');
            if (fallback) return fallback;
        }
        throw err;
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(VENDOR_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
    return response;
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

    if (VENDOR.test(url.pathname)) {
        // Библиотека не меняется в пределах своей версии — сеть дёргать незачем.
        event.respondWith(cacheFirst(request));
    } else {
        // Свой код — всегда пробуем сеть: это и есть «актуальная сборка».
        event.respondWith(networkFirst(request));
    }
});
