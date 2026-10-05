/*
 * rank.js — noter les résultats et les regrouper en CARTES (une par œuvre ou par saga).
 * Fonctions pures. La logique de pertinence vient de Vault Read (tomes.js : correspondance de titre,
 * pénalité de longueur), complétée par la popularité Hardcover (nombre de lecteurs), qui y manquait.
 */
import { normaliser, sansArticle, mots } from './text.js';

/** Correspondance titre/requête de 0 à 100 : exact > début > contient > mots présents. */
export function correspondance(titre, requete) {
  const t = sansArticle(normaliser(titre));
  const q = sansArticle(normaliser(requete));
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.startsWith(`${q} `)) return 70;
  if (t.includes(q)) return 40;
  const cherches = mots(q);
  const presents = new Set(mots(t));
  const trouves = cherches.filter((m) => presents.has(m)).length;
  return Math.round(25 * (trouves / cherches.length));
}

/** Un titre bien plus long que la recherche est la signature de l'essai et du guide. Plafonnée à 40. */
export function penaliteLongueur(titre, requete) {
  const enTrop = mots(normaliser(titre)).length - mots(normaliser(requete)).length;
  return enTrop <= 0 ? 0 : Math.min(enTrop * 4, 40);
}

/** Popularité en échelle logarithmique : 10 lecteurs ≈ 12, 1 000 ≈ 36. Plafonnée à 40. */
export function popularite(lecteurs) {
  return Math.min(40, 12 * Math.log10(1 + (Number(lecteurs) || 0)));
}

/** Note d'un résultat Hardcover : le meilleur titre connu (titre + titres alternatifs) fait foi. */
export function noterResultat(hit, requete) {
  const titres = [hit.title, ...(hit.alternative_titles || [])].filter(Boolean);
  const meilleur = Math.max(...titres.map((t) => correspondance(t, requete)));
  const titreAffiche = titres.find((t) => correspondance(t, requete) === meilleur) || hit.title;
  return correspondance(titreAffiche, requete)
    - penaliteLongueur(hit.title, requete) * (meilleur === 100 ? 0 : 1)
    + popularite(hit.users_count)
    + (hit.image?.url ? 4 : 0);
}

/**
 * Regroupe les résultats en cartes. Une saga (série d'au moins 2 livres principaux) devient UNE carte,
 * quel que soit le nombre de tomes ou d'éditions trouvés ; un livre isolé reste une carte.
 *
 * @param {object[]} hits documents Hardcover
 * @param {string} requete
 * @param {{idCanonique?: (id:number)=>number, nom?: Function, lang?: string}} options
 */
export function construireCartes(hits, requete, { idCanonique = (x) => x, nom = (_i, _l, d) => d, lang = 'fr' } = {}) {
  const groupes = new Map();

  for (const h of hits || []) {
    if (h.compilation) continue;                       // coffrets, intégrales : jamais « le » livre
    const serie = h.featured_series?.series;
    const saga = serie && (serie.primary_books_count ?? 0) >= 2;
    const serieId = saga ? idCanonique(serie.id) : null;
    const cle = saga ? `s:${serieId}` : `w:${h.id}`;
    if (!groupes.has(cle)) groupes.set(cle, { cle, serie: saga ? serie : null, serieId, membres: [] });
    groupes.get(cle).membres.push({ hit: h, note: noterResultat(h, requete) });
  }

  return [...groupes.values()].map((g) => {
    g.membres.sort((a, b) => b.note - a.note);
    const meilleur = g.membres[0];
    const premier = [...g.membres].sort((a, b) =>
      (a.hit.featured_series?.position ?? 99) - (b.hit.featured_series?.position ?? 99))[0];
    const hit = meilleur.hit;
    const nomSerie = g.serie ? nom(g.serieId, lang, g.serie.name) : null;

    /*
     * UN ROMAN CHERCHÉ PAR SON TITRE, AU MILIEU D'UN GRAND CYCLE, EST UN LIVRE, PAS UNE SAGA.
     * « germinal » rendait la série « Les Rougon-Macquart » (20 tomes) : Germinal en est le 13e roman, et la série ne
     * porte pas le nom cherché. Pour « game of thrones », au contraire, le livre est le tome 1 : l'utilisateur veut la saga.
     * Règle : titre exact + le nom de la série ne correspond pas à la recherche + le livre n'est pas le premier → carte livre.
     */
    const position = hit.featured_series?.position;
    const livreDuMilieu = g.serie
      && correspondance(hit.title, requete) === 100
      && correspondance(nomSerie, requete) < 70
      && position > 1;
    const commeSerie = g.serie && !livreDuMilieu;

    // Les séries « de facture » (traductions découpées, ordre de publication, coffrets) sont du bruit, pas des sagas.
    const bruit = commeSerie && MOTIF_SERIE_BRUIT.test(g.serie.name) ? 40 : 0;

    return {
      type: commeSerie ? 'serie' : 'livre',
      id: commeSerie ? g.serieId : Number(hit.id),
      titre: commeSerie ? nomSerie : hit.title,
      auteurs: hit.author_names || [],
      couverture: (commeSerie ? premier.hit : hit).image?.url || hit.image?.url || null,
      tomes: commeSerie ? g.serie.primary_books_count : null,
      serie: !commeSerie && g.serie ? { id: g.serieId, nom: nomSerie, position } : undefined,
      lecteurs: Math.max(...g.membres.map((m) => m.hit.users_count || 0)),
      annee: hit.release_year || null,
      score: Math.round((meilleur.note - bruit) * 10) / 10,
      // Pour la suite du traitement : les livres Hardcover derrière la carte (jamais envoyés à l'app).
      _livres: g.membres.map((m) => Number(m.hit.id)),
      _meilleurLivre: Number(hit.id),
    };
  }).sort((a, b) => b.score - a.score);
}

const MOTIF_SERIE_BRUIT = /split[- ]volume|publication order|omnibus|boxed|box set|graphic novel|sequels?\b/i;
