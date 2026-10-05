// GET /v1/search?q=…&lang=fr|en
import { gestionnaire, repondre, CACHE_CDN } from '../src/http.js';

export default gestionnaire(async ({ url, app, res }) => {
  const donnees = await app.service.rechercher(url.searchParams.get('q'), url.searchParams.get('lang'));
  repondre(res, 200, donnees, { cacheControl: CACHE_CDN });
});
