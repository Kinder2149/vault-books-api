/*
 * Serveur local : mêmes routes que Vercel, sans rien installer.
 *   npm run dev   puis   http://localhost:3000/v1/search?q=game%20of%20thrones&lang=fr
 */
import { createServer } from 'node:http';
import search from '../api/search.js';
import series from '../api/series.js';
import books from '../api/books.js';
import isbn from '../api/isbn.js';
import health from '../api/health.js';
import status from '../api/status.js';
import entretien from '../api/entretien.js';
import controleCouvertures from '../api/controle-couvertures.js';

const PORT = Number(process.env.PORT) || 3000;

const ROUTES = {
  series: { motif: /^\/v1\/series\/(\d+)\/?$/, param: 'id', gestionnaire: series },
  books: { motif: /^\/v1\/books\/(\d+)\/?$/, param: 'id', gestionnaire: books },
  isbn: { motif: /^\/v1\/isbn\/([0-9Xx-]+)\/?$/, param: 'isbn', gestionnaire: isbn },
};

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/v1/search') return search(req, res);
  if (url.pathname === '/v1/health') return health(req, res);
  if (url.pathname === '/v1/status') return status(req, res);
  if (url.pathname === '/api/entretien') return entretien(req, res);
  if (url.pathname === '/api/controle-couvertures') return controleCouvertures(req, res);
  for (const [nom, r] of Object.entries(ROUTES)) {
    const m = url.pathname.match(r.motif);
    if (m) {
      req.url = `/api/${nom}?${r.param}=${m[1]}&${url.searchParams}`;
      return r.gestionnaire(req, res);
    }
  }
  res.statusCode = 404;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ erreur: 'Route inconnue. Essayez /v1/search?q=…, /v1/series/:id, /v1/books/:id, /v1/isbn/:isbn, /v1/health.' }));
}).listen(PORT, () => console.log(`Vault Books API (dev) : http://localhost:${PORT}/v1/health`));
