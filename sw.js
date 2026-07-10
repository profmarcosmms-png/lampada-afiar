/* =============================================================
   Service Worker — LÂMPADA (AFIAR)
   Autor: Evangelista Marcos Monteiro
   Estratégia: cache-first para o "casco" do app (funciona offline),
   network-first para chamadas externas (Anthropic API etc.)
   ============================================================= */

// Ao mudar qualquer arquivo (index.html, ícone, manifest), aumente a
// versão abaixo para forçar os aparelhos a baixarem a nova versão.
const CACHE_NAME = 'lampada-afiar-v3';

// Arquivos que compõem o app e devem ficar disponíveis offline:
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png'
];

// ---------- Instalação: baixa tudo para o cache ----------
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
});

// ---------- Ativação: limpa versões antigas do cache ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ---------- Interceptação de requisições ----------
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Apenas GET é passível de cache.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Requisições para APIs externas (Anthropic, Pollinations, etc.):
  // vão direto para a rede — não faz sentido colocar em cache.
  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin) {
    return; // deixa o navegador tratar normalmente
  }

  // Navegações (recarregar a página do app) → cache-first, com fallback à rede.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => {
        return cached || fetch(req);
      })
    );
    return;
  }

  // Demais arquivos do app → cache-first com atualização em segundo plano.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((networkRes) => {
        // Só coloca no cache respostas válidas.
        if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return networkRes;
      }).catch(() => cached); // sem rede? usa o que tem em cache
      return cached || fetchPromise;
    })
  );
});
