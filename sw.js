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
const CACHE = 'svinocherv-' + BUILD;

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
        const names = await caches.keys();
        await Promise.all(names.map((n) => (n === CACHE ? null : caches.delete(n))));
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
    const cache = await caches.open(CACHE);
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
    if (url.origin === self.location.origin) {
        // Свой код — всегда пробуем сеть: это и есть «актуальная сборка».
        event.respondWith(networkFirst(request));
    } else {
        // Чужая статика с CDN (three.js) прибита к версии в URL и не меняется —
        // её можно держать в кеше и не дёргать сеть на каждом запуске.
        event.respondWith(cacheFirst(request));
    }
});
