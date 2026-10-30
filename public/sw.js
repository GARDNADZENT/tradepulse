/* Service worker for TRADERSPULSE PWA
 *
 * Strategy:
 * - Dev/preview hosts (localhost, 127.0.0.1, *.e2b.app): purge all caches and unregister
 *   so live dev builds never serve stale split chunks.
 * - Production hosts: network-first for navigations & JS/CSS bundles (falling back to cache
 *   offline) and cache-first for static icons/media.
 */
const CACHE_NAME = 'traderspulse-v5';
const IS_DEV_OR_PREVIEW =
    self.location.hostname === 'localhost' ||
    self.location.hostname === '127.0.0.1' ||
    self.location.hostname.endsWith('.e2b.app');

self.addEventListener('install', (event) => {
    if (IS_DEV_OR_PREVIEW) {
        self.skipWaiting();
        return;
    }
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => cache.addAll(['./', './manifest.webmanifest']))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    if (IS_DEV_OR_PREVIEW) {
        event.waitUntil(
            caches
                .keys()
                .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
                .then(() => self.clients.claim())
                .then(() => self.registration.unregister())
        );
        return;
    }
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (IS_DEV_OR_PREVIEW) return;

    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    const isCodeOrDoc =
        request.mode === 'navigate' ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.html');

    if (isCodeOrDoc) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() =>
                    caches
                        .match(request)
                        .then((cached) => cached || (request.mode === 'navigate' ? caches.match('./') : Response.error()))
                )
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request).then((response) => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                }
                return response;
            });
        })
    );
});
