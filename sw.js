// 오프라인용 서비스 워커 (GitHub Pages 같은 https 주소에서만 켜져요)
// - 앱 파일: 인터넷이 되면 항상 최신 파일, 안 되면 저장해 둔 파일
// - 글꼴·단어 분석 사전(CDN): 한 번 받으면 저장해 두고 재사용
// - 번역 서비스: 항상 인터넷 필요 (저장 안 함)
const APP_CACHE = 'app-v1';
const CDN_CACHE = 'cdn-v1';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js', 'js/content.js', 'js/storage.js', 'js/speech.js', 'js/icons.js',
  'js/lesson.js', 'js/practice.js', 'js/quiz.js', 'js/review.js', 'js/compare.js',
  'js/translate.js', 'js/analyzer.js',
  'content/topics.json', 'content/topics/greetings.json', 'content/topics/self-intro.json',
  'icons/icon-192.png',
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE && k !== CDN_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 앱 파일: 최신 우선, 실패하면 저장본
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(APP_CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
    );
    return;
  }

  // CDN: 저장본 우선
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CDN_CACHE).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
  }
});
