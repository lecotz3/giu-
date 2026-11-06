// Service worker: deixa o site abrir como app e funcionar sem internet.
// Troque a versão quando quiser forçar todo mundo a baixar tudo de novo.
const VERSAO = 'giu-v1';
const BASE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/imgs/A_gente.jpeg'];
const CDNS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const daqui = url.origin === self.location.origin;

  // placar sincronizado, YouTube e Spotify sempre vão direto pra rede
  if (daqui && url.pathname.startsWith('/api/')) return;

  // a página: rede primeiro (pra pegar novidades), cache se estiver sem internet
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) { const copia = res.clone(); caches.open(VERSAO).then(c => c.put('/', copia)); }
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // fotos e ícones: cache primeiro
  if (daqui && /^\/(imgs|icons)\//.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copia = res.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); }
        return res;
      }))
    );
    return;
  }

  // fontes e bibliotecas: responde do cache e atualiza por trás
  if (CDNS.includes(url.hostname)) {
    e.respondWith(
      caches.open(VERSAO).then(c => c.match(req).then(hit => {
        const rede = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || rede;
      }))
    );
  }
});
