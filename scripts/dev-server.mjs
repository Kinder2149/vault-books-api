/*
 * Serveur local : mêmes routes que Vercel, sans rien installer.
 *   npm run dev   puis   http://localhost:3000/v1/search?q=game%20of%20thrones&lang=fr
 */
import { createServer } from 'node:http';
import search from '../api/search.js';
import series from '../api/series.js';
import books from '../api/books.js';
import health from '../api/health.js';

const PORT = Number(process.env.PORT) || 3000;

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/v1/search') return search(req, res);
  if (url.pathname === '/v1/health') return health(req, res);
  const m = url.pathname.match(/^\/v1\/(series|books)\/(\d+)\/?$/);
  if (m) {
    req.url = `/api/${m[1]}?id=${m[2]}&${url.searchParams}`;
    return (m[1] === 'series' ? series : books)(req, res);
  }
  res.statusCode = 404;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ erreur: 'Route inconnue. Essayez /v1/search?q=…, /v1/series/:id, /v1/books/:id, /v1/health.' }));
}).listen(PORT, () => console.log(`Vault Books API (dev) : http://localhost:${PORT}/v1/health`));
