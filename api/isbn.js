// GET /v1/isbn/:isbn   (réécrit en /api/isbn?isbn=… par vercel.json)
// L'édition qui porte cet ISBN (10 ou 13 chiffres, tirets admis) : pour le scan de code-barres.
import { gestionnaire, repondre, CACHE_CDN } from '../src/http.js';

export default gestionnaire(async ({ url, app, res }) => {
  const donnees = await app.service.isbn(url.searchParams.get('isbn'));
  if (!donnees) return repondre(res, 404, { erreur: 'ISBN inconnu.' });
  repondre(res, 200, donnees, { cacheControl: CACHE_CDN });
}, { route: 'isbn' });
