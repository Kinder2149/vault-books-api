/*
 * sources/hardcover.js — SEUL fichier qui parle à Hardcover. Un seul `fetch`, dans `gql`.
 * Règles de l'API (doc officielle, 2026-10-05) : appels côté serveur uniquement, 60 requêtes/minute,
 * `_ilike` et autres recherches partielles interdits, requêtes de recherche limitées à 2 s.
 * Chaque champ de premier niveau d'une requête compte comme un appel : on groupe le moins possible, on n'en met pas plus de 1.
 */

const URL_API = 'https://api.hardcover.app/v1/graphql';
const DELAI_MAX_MS = 10000;
const PAUSES_REESSAI_MS = [500, 1500];   // 429 et 503 : l'API dit « sans danger de réessayer »
const PAUSE_MAX_MS = 5000;

/**
 * Limiteur de débit (seau à jetons) : au plus `capacite` appels d'un coup, puis `parSeconde` par seconde. Il FAIT ATTENDRE au lieu de laisser
 * échouer. Hardcover autorise 60 requêtes/minute et une rafale de 10 : une recherche jamais faite coûte 2 appels, et chaque saga dépliée
 * par l'application en coûte 2 de plus — trois sagas en parallèle suffisent à saturer la rafale (mesuré le 2026-10-05 sur « dune » et
 * « les fourmis » : sagas dépliées en échec, résultats dégradés). Par processus : sans coordination entre instances, mais avec moins de
 * 100 utilisateurs par jour l'ordre de grandeur est le bon, et le réessai sur 429 couvre le reste.
 */
export function creerLimiteur({ capacite = 8, parSeconde = 0.9, maintenant = Date.now, attendre = (ms) => new Promise((ok) => setTimeout(ok, ms)) } = {}) {
  let jetons = capacite;
  let dernier = maintenant();
  let file = Promise.resolve();
  return function acquerir() {
    const tache = file.then(async () => {
      for (;;) {
        const t = maintenant();
        jetons = Math.min(capacite, jetons + ((t - dernier) / 1000) * parSeconde);
        dernier = t;
        if (jetons >= 1) { jetons -= 1; return; }
        await attendre(Math.ceil(((1 - jetons) / parSeconde) * 1000));
      }
    });
    file = tache.catch(() => {});
    return tache;
  };
}

/**
 * L'en-tête `RateLimit` de Hardcover : `"Free";r=8;t=0, "daily";r=4231;t=51234` — `r` = requêtes restantes, `t` = secondes avant remise à zéro.
 * La première entrée est la minute (le nom du plan varie : Free, Supporter…), « daily » est le quota du jour.
 * @returns {{restantMinute: number|null, restantJour: number|null}|null} null si l'en-tête est absent ou illisible
 */
export function lireRateLimit(entete) {
  if (!entete) return null;
  const jour = String(entete).match(/"daily"\s*;\s*r\s*=\s*(\d+)/i);
  const minute = String(entete).match(/^\s*"(?!daily")[^"]*"\s*;\s*r\s*=\s*(\d+)/i);
  if (!jour && !minute) return null;
  return { restantMinute: minute ? Number(minute[1]) : null, restantJour: jour ? Number(jour[1]) : null };
}

export function creerHardcover({ cle, fetchImpl = fetch, limiteur = creerLimiteur(), pausesReessaiMs = PAUSES_REESSAI_MS, maintenant = Date.now } = {}) {
  if (!cle) throw new Error('HARDCOVER_API_KEY manquante');
  const auth = `Bearer ${cle.replace(/^bearer /i, '')}`;

  // Le dernier état connu du quota, d'après les en-têtes des réponses : il ne coûte aucune requête de plus.
  let quota = { restantMinute: null, restantJour: null, vuA: null };
  function noterQuota(entete) {
    const lu = lireRateLimit(entete);
    if (lu) quota = { ...quota, ...Object.fromEntries(Object.entries(lu).filter(([, v]) => v !== null)), vuA: maintenant() };
  }

  async function gql(requete, variables = {}, essai = 0) {
    await limiteur();
    const arret = new AbortController();
    const minuteur = setTimeout(() => arret.abort(), DELAI_MAX_MS);
    try {
      const r = await fetchImpl(URL_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: auth, 'user-agent': 'VaultBooksAPI/0.1' },
        body: JSON.stringify({ query: requete, variables }),
        signal: arret.signal,
      });
      noterQuota(r.headers?.get?.('ratelimit'));
      if ((r.status === 429 || r.status === 503) && essai < pausesReessaiMs.length) {
        // Si Hardcover dit combien attendre (en-tête Retry-After, en secondes), on l'écoute ; sinon pause croissante.
        const demande = Number(r.headers?.get?.('retry-after')) * 1000;
        const pause = Math.min(PAUSE_MAX_MS, Math.max(pausesReessaiMs[essai], Number.isFinite(demande) ? demande : 0));
        await new Promise((ok) => setTimeout(ok, pause));
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
    /** Le quota, tel que vu dans la dernière réponse (valeurs nulles tant qu'aucun appel n'a eu lieu dans ce processus). */
    quota: () => ({ ...quota }),

    /** Hardcover répond-il ? `__typename` est une requête d'introspection : elle ne compte pas dans le quota (doc officielle). */
    async ping() {
      await gql('query { __typename }');
      return true;
    },

    /** Recherche de livres. Rend les documents tels que Hardcover les indexe. */
    async rechercher(texte, perPage = 25) {
      const data = await gql(
        'query ($q: String!, $n: Int!) { search(query: $q, query_type: "Book", per_page: $n, page: 1) { results } }',
        { q: texte, n: perPage });
      return (data.search?.results?.hits || []).map((h) => h.document).filter(Boolean);
    },

    /** Recherche d'AUTEURS (nom, noms alternatifs, nombre de livres) : sert à reconnaître un nom d'auteur dans une requête. */
    async rechercherAuteurs(texte, perPage = 3) {
      const data = await gql(
        'query ($q: String!, $n: Int!) { search(query: $q, query_type: "Author", per_page: $n, page: 1) { results } }',
        { q: texte, n: perPage });
      return (data.search?.results?.hits || []).map((h) => h.document).filter(Boolean);
    },

    /**
     * Les livres d'un auteur, du plus lu au moins lu (compilations exclues), rendus sous la MÊME forme que les résultats de recherche :
     * ils passent ainsi par le même regroupement en cartes (sagas en une carte, livres isolés).
     */
    async livresDeLAuteur(auteurId, limite = 60) {
      const data = await gql(`query ($id: Int!, $n: Int!) { authors_by_pk(id: $id) { id name
        contributions(where: {book: {compilation: {_eq: false}}}, order_by: {book: {users_count: desc}}, limit: $n) {
          book { id title users_count release_year image { url width } book_series { position featured series { id name primary_books_count } } } } } }`,
      { id: Number(auteurId), n: limite });
      const a = data.authors_by_pk;
      if (!a) return [];
      return a.contributions.filter((c) => c.book).map(({ book }) => {
        // La série mise en avant ; à défaut (fréquent : Zola), la plus fournie qui n'est pas un regroupement d'éditions.
        const liens = book.book_series || [];
        const technique = /split[- ]volume|publication order|omnibus|boxed|box set/i;
        const lien = liens.find((s) => s.featured)
          || [...liens].filter((s) => !technique.test(s.series?.name || '')).sort((a, b) => (b.series?.primary_books_count || 0) - (a.series?.primary_books_count || 0))[0]
          || null;
        return {
          id: String(book.id),
          title: book.title,
          author_names: [a.name],
          users_count: book.users_count,
          release_year: book.release_year,
          image: book.image,
          alternative_titles: [],
          compilation: false,
          featured_series: lien ? { position: lien.position, series: lien.series } : null,
        };
      });
    },
    /** Une série et ses entrées numérotées (position ≥ 1), sans les compilations. */
    async serie(id) {
      const data = await gql(`query ($id: Int!) { series_by_pk(id: $id) {
        id name primary_books_count
        book_series(where: {featured: {_eq: true}, position: {_gte: 1}, book: {compilation: {_eq: false}}}, order_by: {position: asc}) {
          position book { id title users_count release_date image { url width } } } } }`, { id });
      return data.series_by_pk || null;
    },

    /**
     * L'édition qui porte cet ISBN-13 : métadonnées (éditeur, date, pages, langue, image), le livre et sa saga.
     * AUCUN filtre de langue : un ISBN désigne une édition précise, souvent en version originale.
     * Si plusieurs lignes portent le même ISBN, la plus lue d'abord.
     */
    async editionParIsbn(isbn13) {
      const data = await gql(`query ($isbn: String!) { editions(where: {isbn_13: {_eq: $isbn}}, order_by: {users_count: desc}, limit: 3) {
        id title isbn_13 release_date pages edition_format language { code2 } publisher { name } image { url width }
        book { id title image { url width } contributions { author { name } }
          book_series { position featured series { id name primary_books_count } } } } }`, { isbn: isbn13 });
      return (data.editions || [])[0] || null;
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


