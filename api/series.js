// GET /v1/series/:id?lang=fr|en   (réécrit en /api/series?id=… par vercel.json)
import { gestionnaire, repondre, CACHE_CDN } from '../src/http.js';

export default gestionnaire(async ({ url, app, res }) => {
  const donnees = await app.service.serie(url.searchParams.get('id'), url.searchParams.get('lang'));
  if (!donnees) return repondre(res, 404, { erreur: 'Série introuvable.' });
  repondre(res, 200, donnees, { cacheControl: CACHE_CDN });
}, { route: 'series' });
