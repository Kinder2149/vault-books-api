// GET /v1/search?q=…&lang=fr|en[&mode=auteur]
//   sans mode : recherche par titre (une carte par œuvre ou par saga)
//   mode=auteur : les sagas et les livres d'un auteur, du plus lu au moins lu
import { gestionnaire, repondre, CACHE_CDN } from '../src/http.js';

export default gestionnaire(async ({ url, app, res }) => {
  const q = url.searchParams.get('q');
  const lang = url.searchParams.get('lang');
  const donnees = url.searchParams.get('mode') === 'auteur'
    ? await app.service.rechercherAuteur(q, lang)
    : await app.service.rechercher(q, lang);
  repondre(res, 200, donnees, { cacheControl: CACHE_CDN });
}, { route: 'search' });
