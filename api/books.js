// GET /v1/books/:id?lang=fr|en   (réécrit en /api/books?id=… par vercel.json)
// Les éditions d'un livre (Hardcover + BnF), avec ISBN, éditeur, année et couverture vérifiée.
import { gestionnaire, repondre, CACHE_CDN } from '../src/http.js';

export default gestionnaire(async ({ url, app, res }) => {
  const donnees = await app.service.livre(url.searchParams.get('id'), url.searchParams.get('lang'));
  if (!donnees) return repondre(res, 404, { erreur: 'Livre introuvable.' });
  repondre(res, 200, donnees, { cacheControl: CACHE_CDN });
}, { route: 'books' });
