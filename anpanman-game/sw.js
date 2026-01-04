const CACHE_NAME = 'anpanman-pop-v2';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './game.js',
    './public/assets/anpanman.png',
    './public/assets/baikinman.png',
    './public/assets/dokinchan.png',
    './public/assets/melonpanna.png',
    './public/assets/char0.png',
    './public/assets/char1.jpg',
    './public/assets/char2.jpg',
    './public/assets/char3.jpg',
    './public/assets/char4.png',
    './public/assets/char5.jpg',
    './public/assets/char6.png',
    './public/assets/char7.jpg',
    './public/sounds/bgm.mp3',
    './public/sounds/explosion.mp3',
    './public/sounds/correct.mp3',
    './public/sounds/wrong.mp3',
    './public/sounds/kawaii.m4a',
    './public/sounds/mochimochi.m4a',
    './public/sounds/daisuki.m4a'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
