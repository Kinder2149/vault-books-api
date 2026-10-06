/*
 * covers.js — la couverture d'une édition, par cascade et PAR ISBN (jamais héritée d'un autre tome, jamais d'une autre langue).
 *
 * Ordre : correction manuelle > image de l'édition chez Hardcover (≥ 200 px) > Open Library par ISBN (vérifiée, pages de titre scannées écartées) > image d'une autre édition de la MÊME langue du même tome > miniature de l'édition > rien (l'app dessine une couverture).
 * L'image du « livre » chez Hardcover n'est un recours QUE pour un scan d'ISBN (une édition précise, sans langue demandée) : pour une bibliothèque dans une langue, elle peut être celle d'une autre langue, donc on ne la prend pas.
 *
 * Open Library : `default=false` est indispensable, sinon elle rend une image d'un pixel avec un statut 200 (piège mesuré).
 * On ne l'interroge que pour les éditions sans image Hardcover, et le résultat (présente ou absente) est mis en cache :
 * 30 jours si trouvée, 3 jours sinon. Open Library limite les requêtes par ISBN (≈ 100 / 5 min / IP) : le cache est donc obligatoire.
 */

import { partBlanche } from './images.js';

const JOUR = 24 * 60 * 60 * 1000;
const TTL_TROUVEE = 30 * JOUR;
const TTL_ABSENTE = 3 * JOUR;
const DELAI_MAX_MS = 5000;
const OL = 'https://covers.openlibrary.org/b/isbn';
// Au-delà de cette part de blanc, l'image est une page de titre scannée, pas une couverture (voir partBlanche : 0,92 mesuré, < 0,01 sur les vraies couvertures).
const BLANC_MAX = 0.75;

// Qualité estimée d'une couverture selon son origine (0 à 1) : de quoi laisser l'application masquer ce qui est douteux.
export const QUALITE_SOURCE = { correction: 1, hardcover: 0.9, openlibrary: 0.8, 'hardcover-voisine': 0.7, 'hardcover-petite': 0.4, 'hardcover-livre': 0.2 };
export const qualiteCouverture = (source) => QUALITE_SOURCE[source] ?? 0;

export function creerCouvertures({ cache, fetchImpl = fetch }) {
  async function olExiste(url) {
    const arret = new AbortController();
    const minuteur = setTimeout(() => arret.abort(), DELAI_MAX_MS);
    try {
      const r = await fetchImpl(url, { redirect: 'follow', signal: arret.signal });
      if (r.status === 404) return false;
      if (!r.ok) return null;                      // quota, panne : on ne sait pas, on ne mémorise rien
      const octets = Buffer.from(await r.arrayBuffer());
      if (octets.length <= 4000) return false;     // une image minuscule n'est pas une couverture
      const blanc = partBlanche(octets);
      return blanc === null || blanc < BLANC_MAX;  // une page de titre scannée non plus ; une image illisible, on ne la juge pas
    } catch {
      return null;
    } finally {
      clearTimeout(minuteur);
    }
  }

  /** Open Library par ISBN-13, avec cache. Rend l'URL ou null. */
  async function openLibrary(isbn13) {
    const cle = `cover:v2:ol:${isbn13}`;
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

  async function cascade({ isbn13, couvertureEdition, couvertureVoisine, couverturePetite, couvertureLivre, correction }) {
    if (correction) return { url: correction, source: 'correction', approximative: false };
    if (couvertureEdition) return { url: couvertureEdition, source: 'hardcover', approximative: false };
    if (isbn13) {
      const ol = await openLibrary(isbn13);
      if (ol) return { url: ol, source: 'openlibrary', approximative: false };
    }
    // Après Open Library (qui rend la couverture de CETTE édition, par ISBN) : celle d'une autre édition de la même langue.
    if (couvertureVoisine) return { url: couvertureVoisine, source: 'hardcover-voisine', approximative: false };
    if (couverturePetite) return { url: couverturePetite, source: 'hardcover-petite', approximative: false, basseDefinition: true };
    if (couvertureLivre) return { url: couvertureLivre, source: 'hardcover-livre', approximative: true };
    return { url: null, source: null, approximative: false };
  }

  return {
    /**
     * @param {{isbn13?: string, couvertureEdition?: string, couvertureVoisine?: string, couverturePetite?: string, couvertureLivre?: string, correction?: string}} p
     * `couvertureLivre` : à ne fournir que pour un scan d'ISBN (voir l'en-tête).
     * @returns {Promise<{url: string|null, source: string|null, approximative: boolean, qualite: number}>}
     */
    async resoudre(p) {
      const r = await cascade(p);
      return { ...r, qualite: qualiteCouverture(r.source) };
    },
  };
}
