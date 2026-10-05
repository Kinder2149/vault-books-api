/*
 * covers.js — la couverture d'une édition, par cascade et PAR ISBN (jamais héritée d'un autre tome).
 *
 * Ordre : correction manuelle > image de l'édition chez Hardcover (≥ 200 px) > Open Library par ISBN (vérifiée) > miniature de l'édition > image du livre canonique
 * (marquée `approximative` : elle peut être celle d'une autre langue) > rien (l'app dessine une couverture).
 *
 * Open Library : `default=false` est indispensable, sinon elle rend une image d'un pixel avec un statut 200 (piège mesuré).
 * On ne l'interroge que pour les éditions sans image Hardcover, et le résultat (présente ou absente) est mis en cache :
 * 30 jours si trouvée, 3 jours sinon. Open Library limite les requêtes par ISBN (≈ 100 / 5 min / IP) : le cache est donc obligatoire.
 */

const JOUR = 24 * 60 * 60 * 1000;
const TTL_TROUVEE = 30 * JOUR;
const TTL_ABSENTE = 3 * JOUR;
const DELAI_MAX_MS = 5000;
const OL = 'https://covers.openlibrary.org/b/isbn';

export function creerCouvertures({ cache, fetchImpl = fetch }) {
  async function olExiste(url) {
    const arret = new AbortController();
    const minuteur = setTimeout(() => arret.abort(), DELAI_MAX_MS);
    try {
      const r = await fetchImpl(url, { method: 'HEAD', redirect: 'follow', signal: arret.signal });
      if (r.status === 404) return false;
      if (!r.ok) return null;                      // quota, panne : on ne sait pas, on ne mémorise rien
      const taille = Number(r.headers.get('content-length'));
      return !taille || taille > 4000;             // une image minuscule n'est pas une couverture
    } catch {
      return null;
    } finally {
      clearTimeout(minuteur);
    }
  }

  /** Open Library par ISBN-13, avec cache. Rend l'URL ou null. */
  async function openLibrary(isbn13) {
    const cle = `cover:v1:ol:${isbn13}`;
    try {
      const c = await cache.get(cle);
      if (c && c.ageMs < (c.valeur.url ? TTL_TROUVEE : TTL_ABSENTE)) return c.valeur.url;
    } catch { /* cache en panne : on interroge la source */ }

    const url = `${OL}/${isbn13}-L.jpg?default=false`;
    const existe = await olExiste(url);
    if (existe === null) return null;
    try { await cache.set(cle, { url: existe ? url : null }); } catch { /* sans cache, on repaiera l'appel */ }
    return existe ? url : null;
  }

  return {
    /**
     * @param {{isbn13?: string, couvertureEdition?: string, couvertureLivre?: string, correction?: string}} p
     * @returns {Promise<{url: string|null, source: string|null, approximative: boolean}>}
     */
    async resoudre({ isbn13, couvertureEdition, couverturePetite, couvertureLivre, correction }) {
      if (correction) return { url: correction, source: 'correction', approximative: false };
      if (couvertureEdition) return { url: couvertureEdition, source: 'hardcover', approximative: false };
      if (isbn13) {
        const ol = await openLibrary(isbn13);
        if (ol) return { url: ol, source: 'openlibrary', approximative: false };
      }
      if (couverturePetite) return { url: couverturePetite, source: 'hardcover-petite', approximative: false, basseDefinition: true };
      if (couvertureLivre) return { url: couvertureLivre, source: 'hardcover-livre', approximative: true };
      return { url: null, source: null, approximative: false };
    },
  };
}

