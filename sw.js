const CACHE_NAME = 'fitness-pwa-v28';
const ASSETS_TO_CACHE = [
    './?v=28',
    './index.html?v=28',
    './styles.css?v=28',
    './app.js?v=28',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './icon.svg',
    './images/body-front.png',
    './images/body-back.png',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap',
    'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://unpkg.com/lucide@latest/dist/umd/lucide.min.js'
];

const API_HOSTS = ['supabase.co', 'openweathermap.org'];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    const isApiRequest = API_HOSTS.some(host => url.hostname.includes(host));
    if (isApiRequest) return;

    const isStaticCDN = url.hostname.includes('fonts.googleapis.com')
        || url.hostname.includes('fonts.gstatic.com')
        || url.hostname.includes('cdn.jsdelivr.net')
        || url.hostname.includes('unpkg.com');

    if (url.origin !== self.location.origin && !isStaticCDN) return;

    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() =>
                caches.match('./index.html')
            )
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return networkResponse;
            }).catch(() => cached);

            return cached || fetchPromise;
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
