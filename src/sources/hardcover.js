/*
 * sources/hardcover.js — SEUL fichier qui parle à Hardcover. Un seul `fetch`, dans `gql`.
 * Règles de l'API (doc officielle, 2026-10-05) : appels côté serveur uniquement, 60 requêtes/minute,
 * `_ilike` et autres recherches partielles interdits, requêtes de recherche limitées à 2 s.
 * Chaque champ de premier niveau d'une requête compte comme un appel : on groupe le moins possible, on n'en met pas plus de 1.
 */

const URL_API = 'https://api.hardcover.app/v1/graphql';
const DELAI_MAX_MS = 10000;
const PAUSES_REESSAI_MS = [500, 1500];   // 429 et 503 : l'API dit « sans danger de réessayer »

export function creerHardcover({ cle, fetchImpl = fetch } = {}) {
  if (!cle) throw new Error('HARDCOVER_API_KEY manquante');
  const auth = `Bearer ${cle.replace(/^bearer /i, '')}`;

  async function gql(requete, variables = {}, essai = 0) {
    const arret = new AbortController();
    const minuteur = setTimeout(() => arret.abort(), DELAI_MAX_MS);
    try {
      const r = await fetchImpl(URL_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: auth, 'user-agent': 'VaultBooksAPI/0.1' },
        body: JSON.stringify({ query: requete, variables }),
        signal: arret.signal,
      });
      if ((r.status === 429 || r.status === 503) && essai < PAUSES_REESSAI_MS.length) {
        await new Promise((ok) => setTimeout(ok, PAUSES_REESSAI_MS[essai]));
        return gql(requete, variables, essai + 1);
      }
      const corps = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`Hardcover a répondu ${r.status}${corps.error ? ` (${corps.error})` : ''}`);
      if (corps.errors) throw new Error(`Hardcover : ${corps.errors[0]?.message || 'erreur GraphQL'}`);
      return corps.data;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Hardcover ne répond pas.');
      throw e;
    } finally {
      clearTimeout(minuteur);
    }
  }

  return {
    /** Recherche de livres. Rend les documents tels que Hardcover les indexe. */
    async rechercher(texte, perPage = 25) {
      const data = await gql(
        'query ($q: String!, $n: Int!) { search(query: $q, query_type: "Book", per_page: $n, page: 1) { results } }',
        { q: texte, n: perPage });
      return (data.search?.results?.hits || []).map((h) => h.document).filter(Boolean);
    },

    /** Une série et ses entrées numérotées (position ≥ 1), sans les compilations. */
    async serie(id) {
      const data = await gql(`query ($id: Int!) { series_by_pk(id: $id) {
        id name primary_books_count
        book_series(where: {featured: {_eq: true}, position: {_gte: 1}, book: {compilation: {_eq: false}}}, order_by: {position: asc}) {
          position book { id title users_count release_date image { url width } } } } }`, { id });
      return data.series_by_pk || null;
    },

    /** Un livre : titre, auteurs, séries, et TOUTES ses éditions dans la langue (jusqu'à 100, les plus lues d'abord). */
    async livre(id, lang) {
      const data = await gql(`query ($id: Int!, $lang: String!) { books_by_pk(id: $id) {
        id title users_count image { url width }
        contributions { author { name } }
        book_series { position series { id name primary_books_count } }
        editions(where: {language: {code2: {_eq: $lang}}}, order_by: {users_count: desc}, limit: 100) {
          id title isbn_13 release_date edition_format publisher { name } image { url width } users_count } } }`,
      { id, lang });
      return data.books_by_pk || null;
    },

    /**
     * La meilleure édition de chaque livre dans une langue (code ISO à 2 lettres), en un seul appel.
     * @returns {Promise<Map<number, object>>} bookId → édition
     */
    async editionsEnLangue(bookIds, lang) {
      const ids = [...new Set(bookIds.map(Number))].filter(Boolean);
      if (!ids.length) return new Map();
      const data = await gql(`query ($ids: [Int!], $lang: String!) {
        editions(where: {book_id: {_in: $ids}, language: {code2: {_eq: $lang}}},
                 order_by: [{book_id: asc}, {users_count: desc}], distinct_on: book_id, limit: 500) {
          id book_id title isbn_13 release_date edition_format publisher { name } image { url width } } }`,
      { ids, lang });
      return new Map((data.editions || []).map((e) => [e.book_id, e]));
    },
  };
}


