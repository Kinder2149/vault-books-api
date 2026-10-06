/*
 * sources/hardcover.js — SEUL fichier qui parle à Hardcover. Un seul `fetch`, dans `gql`.
 * Règles de l'API (doc officielle, 2026-10-05) : appels côté serveur uniquement, 60 requêtes/minute,
 * `_ilike` et autres recherches partielles interdits, requêtes de recherche limitées à 2 s.
 * Chaque champ de premier niveau d'une requête compte comme un appel : on groupe le moins possible, on n'en met pas plus de 1.
 */

import { FORMATS_AUDIO } from '../formats.js';

const URL_API = 'https://api.hardcover.app/v1/graphql';
const DELAI_MAX_MS = 10000;
const PAUSES_REESSAI_MS = [500, 1500];   // 429 et 503 : l'API dit « sans danger de réessayer »
const PAUSE_MAX_MS = 5000;
const MAX_POSITIONS_RETROUVEES = 60;      // tomes manquants cherchés d'un coup (au-delà : saga géante, on garde ce que la 1re requête a rendu)
const LIMITE_LIGNES_RETROUVEES = 400;   // plusieurs traductions par position : de quoi couvrir ~50 positions sans alourdir la réponse

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

  /**
   * Les livres d'une série qui n'y sont PAS « mis en avant », aux positions données : les traductions et autres éditions d'un tome.
   * Marqués `retrouvee` : ces positions ont déjà été élargies, inutile d'y revenir. Une panne remonte à l'appelant.
   */
  async function candidatsPositions(id, positions) {
    const r = await gql(`query ($id: Int!, $positions: [float8!]) { series_by_pk(id: $id) {
      book_series(where: {featured: {_eq: false}, position: {_in: $positions}, book: {compilation: {_eq: false}}},
                  order_by: [{position: asc}, {book: {users_count: desc}}], limit: ${LIMITE_LIGNES_RETROUVEES}) {
        position book { id title users_count release_date image { url width } canonical { id title } } } } }`, { id, positions });
    return (r.series_by_pk?.book_series || []).map((e) => ({ ...e, retrouvee: true }));
  }

  return {
    /** Le quota, tel que vu dans la dernière réponse (valeurs nulles tant qu'aucun appel n'a eu lieu dans ce processus). */
    quota: () => ({ ...quota }),

    candidatsPositions,

    /** Hardcover répond-il ? `__typename` est une requête d'introspection : elle ne compte pas dans le quota (doc officielle). */
    async ping() {
      await gql('query { __typename }');
      return true;
    },

    /**
     * Les livres parus (ou annoncés) entre deux dates, du plus lu au moins lu — pour les MESURES (fraîcheur), pas pour les routes du service.
     * En anglais : des livres (leurs éditions les plus lues). En français : des éditions françaises, puisque c'est l'édition qui porte la date.
     * @returns {Promise<object[]>} { bookId, titre, auteur, date, lecteurs, isbns: [..] }
     */
    async parutions({ du, au, langue = 'en', limite = 25 }) {
      if (langue === 'fr') {
        const data = await gql(`query ($du: date!, $au: date!, $n: Int!) { editions(where: {language: {code2: {_eq: "fr"}}, isbn_13: {_is_null: false}, release_date: {_gte: $du, _lte: $au}}, order_by: {book: {users_count: desc}}, limit: $n) {
          isbn_13 title release_date book { id title users_count created_at contributions { author { name } } } } }`, { du, au, n: limite * 3 });
        const vus = new Set();
        return (data.editions || []).filter((e) => !vus.has(e.book.id) && vus.add(e.book.id)).slice(0, limite).map((e) => ({
          bookId: e.book.id, titre: e.title, auteur: e.book.contributions?.[0]?.author?.name || null, date: e.release_date, lecteurs: e.book.users_count, creeLe: e.book.created_at, isbns: [e.isbn_13],
        }));
      }
      const data = await gql(`query ($du: date!, $au: date!, $n: Int!) { books(where: {compilation: {_eq: false}, release_date: {_gte: $du, _lte: $au}}, order_by: {users_count: desc}, limit: $n) {
        id title release_date users_count created_at contributions { author { name } } editions(where: {isbn_13: {_is_null: false}}, limit: 3, order_by: {users_count: desc}) { isbn_13 } } }`, { du, au, n: limite });
      return (data.books || []).map((b) => ({
        bookId: b.id, titre: b.title, auteur: b.contributions?.[0]?.author?.name || null, date: b.release_date, lecteurs: b.users_count, creeLe: b.created_at, isbns: b.editions.map((e) => e.isbn_13),
      }));
    },

    /** L'état d'un livre chez Hardcover : combien d'éditions, d'ISBN, d'images, et ce qu'on sait de lui (pour suivre son enrichissement). */
    async etatLivre(id) {
      const data = await gql(`query ($id: Int!) { books_by_pk(id: $id) { id release_date description image { url }
        editions { isbn_13 pages image { url } language { code2 } } } }`, { id });
      const b = data.books_by_pk;
      if (!b) return null;
      return {
        date: b.release_date, description: Boolean(b.description), imageLivre: Boolean(b.image?.url),
        editions: b.editions.length, isbns: b.editions.filter((e) => e.isbn_13).map((e) => e.isbn_13),
        avecImage: b.editions.filter((e) => e.image?.url).length, avecPages: b.editions.filter((e) => e.pages).length,
      };
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
    /**
     * Une série et ses entrées numérotées (position ≥ 1), sans les compilations.
     * Première requête : les livres dont CETTE série est la série « mise en avant » (peu de lignes, sans les traductions rattachées ailleurs).
     * Mesuré le 2026-10-06 : un tome rattaché à plusieurs séries n'y figure que dans sa série mise en avant (Dune 6 sur 8, Narnia 3 sur 7,
     * Ender 2 sur 6). Si des positions entières manquent par rapport au total annoncé, une 2e requête, limitée à ces positions et sans le
     * filtre, les retrouve. Une saga complète ne coûte donc aucun appel de plus ; une panne de la 2e requête laisse la saga incomplète, pas en erreur.
     */
    async serie(id) {
      const data = await gql(`query ($id: Int!) { series_by_pk(id: $id) {
        id name primary_books_count
        book_series(where: {featured: {_eq: true}, position: {_gte: 1}, book: {compilation: {_eq: false}}}, order_by: {position: asc}) {
          position book { id title users_count release_date image { url width } canonical { id title } } } } }`, { id });
      const serie = data.series_by_pk || null;
      const annonces = serie?.primary_books_count;
      if (!serie || !Number.isInteger(annonces) || annonces < 1) return serie;

      const presentes = new Set(serie.book_series.map((e) => e.position).filter(Number.isInteger));
      const manquantes = [];
      for (let p = 1; p <= annonces && manquantes.length < MAX_POSITIONS_RETROUVEES; p += 1) if (!presentes.has(p)) manquantes.push(p);
      if (!manquantes.length) return serie;

      try {
        serie.book_series = serie.book_series.concat(await candidatsPositions(id, manquantes))
          .sort((a, b) => a.position - b.position);
      } catch { /* la saga reste telle que la 1re requête l'a rendue */ }
      return serie;
    },

    /**
     * L'édition qui porte cet ISBN-13 : métadonnées (éditeur, date, pages, langue, image), le livre et sa saga.
     * AUCUN filtre de langue : un ISBN désigne une édition précise, souvent en version originale.
     * Si plusieurs lignes portent le même ISBN, la plus lue d'abord.
     */
    async editionParIsbn(isbn13) {
      const data = await gql(`query ($isbn: String!) { editions(where: {isbn_13: {_eq: $isbn}}, order_by: {users_count: desc}, limit: 3) {
        id title isbn_13 isbn_10 release_date pages edition_format audio_seconds reading_format { format } language { code2 } publisher { name } image { url width }
        book { id title description image { url width } contributions { author { name } }
          book_series { position featured series { id name primary_books_count } } } } }`, { isbn: isbn13 });
      return (data.editions || [])[0] || null;
    },

    /** Un livre : titre, auteurs, séries, et TOUTES ses éditions dans la langue (jusqu'à 100, les plus lues d'abord). */
    async livre(id, lang) {
      const data = await gql(`query ($id: Int!, $lang: String!) { books_by_pk(id: $id) {
        id title description users_count image { url width }
        contributions { author { name } }
        book_series { position series { id name primary_books_count } }
        editions(where: {language: {code2: {_eq: $lang}}}, order_by: {users_count: desc}, limit: 100) {
          id title subtitle isbn_13 isbn_10 release_date pages edition_format audio_seconds reading_format { format } publisher { name } image { url width } users_count } } }`,
      { id, lang });
      return data.books_by_pk || null;
    },

    /**
     * La meilleure édition de chaque livre dans une langue (code ISO à 2 lettres), en un seul appel.
     * @returns {Promise<Map<number, object>>} bookId → édition
     */
    async editionsEnLangue(bookIds, lang, { voisines = false, secoursAudio = true } = {}) {
      const ids = [...new Set(bookIds.map(Number))].filter(Boolean);
      if (!ids.length) return new Map();
      const champs = 'id book_id title subtitle isbn_13 isbn_10 release_date pages edition_format audio_seconds reading_format { format } publisher { name } image { url width }';
      const ordre = 'order_by: [{book_id: asc}, {users_count: desc}], distinct_on: book_id, limit: 500';
      const base = 'book_id: {_in: $ids}, language: {code2: {_eq: $lang}}';
      /*
       * L'AUDIO n'est jamais « l'édition » d'un livre qui existe en papier (mesuré le 2026-10-06 : pour Harry Potter 1 la plus lue en français,
       * 163 lecteurs, est le livre audio de 2018, et sa couverture devenait celle du tome). On l'écarte donc dans la requête ; les livres qui
       * n'ont QUE de l'audio sont repris dans un second temps (voir plus bas), signalés par leur format.
       */
      const sansAudio = `audio_seconds: {_is_null: true}, _and: [{_or: [{reading_format_id: {_is_null: true}}, {reading_format_id: {_neq: 2}}]}, {_or: [{edition_format: {_is_null: true}}, {edition_format: {_nin: ${JSON.stringify(FORMATS_AUDIO)}}}]}]`;
      /*
       * `voisines` : pour chaque livre, en plus de sa meilleure édition, l'image de l'édition la plus lue qui en a une d'AU MOINS 200 px
       * (mesuré le 2026-10-05 : sur « Journal d'un dégonflé », 11 tomes sur 16 n'avaient qu'une miniature de 98 px chez Hardcover). Un second
       * champ de la requête, donc un appel de plus décompté : réservé aux sagas, jamais aux recherches.
       */
      const data = await gql(`query ($ids: [Int!], $lang: String!) {
        editions(where: {${base}, ${sansAudio}}, ${ordre}) { ${champs} }
        ${voisines ? `voisines: editions(where: {${base}, ${sansAudio}, image: {width: {_gte: 200}}}, ${ordre}) { book_id image { url width } }` : ''} }`,
      { ids, lang });
      const parLivre = new Map((data.editions || []).map((e) => [e.book_id, e]));
      for (const v of data.voisines || []) {
        const e = parLivre.get(v.book_id);
        if (e) e._imageVoisine = v.image;
      }
      // Les livres sans édition « lisible » dans la langue : y en a-t-il une en audio ? (un appel de plus, seulement s'il en manque)
      const absents = ids.filter((id) => !parLivre.has(id));
      if (absents.length && secoursAudio) {
        try {
          const audio = await gql(`query ($ids: [Int!], $lang: String!) { editions(where: {${base}}, ${ordre}) { ${champs} } }`, { ids: absents, lang });
          for (const e of audio.editions || []) parLivre.set(e.book_id, e);
        } catch { /* sans ce complément, ces livres restent « indisponibles » : on ne fait pas échouer la saga */ }
      }
      return parLivre;
    },
  };
}


