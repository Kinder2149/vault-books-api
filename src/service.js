/*
 * service.js — la logique de l'API, indépendante du serveur HTTP (testable sans réseau).
 * Les dépendances sont injectées : `hardcover` (source principale), `bnf` (éditions françaises, facultative),
 * `cache`, `overrides` (corrections manuelles : un objet, ou une fonction asynchrone qui le rend) et `couvertures`.
 *
 * Trajet d'une requête : cache frais → réponse ; sinon source → tri → cache → réponse ;
 * source en panne mais cache périmé disponible → on rend le périmé (mieux que rien, comme dans Vault Read).
 */
import { TTL, LANGUES, LANGUE_PAR_DEFAUT } from './config.js';
import { normaliser } from './text.js';
import { construireCartes, ecarterBruit } from './rank.js';
import { construireSerie } from './series.js';
import { fusionnerEditions } from './editions.js';
import { indexer, urlsMasquees } from './overrides.js';
import { versIsbn13 } from './isbn.js';
import { sansArticleInitial, candidatsAuteur, auteurCorrespond } from './requete.js';
import { nomFamille } from './text.js';
import { nettoyerResume, langueResume } from './resume.js';
import { utilisable, petite } from './images.js';

export const VERSION_CACHE = 'v5';   // à incrémenter quand le tri ou le format change : invalide tout le cache d'un coup
const MAX_LIVRES_VERIFIES = 60;
const NB_RESULTATS = 20;
const CONCURRENCE_COUVERTURES = 4;

export class ErreurRequete extends Error {}

// Le quota du jour de la source est presque épuisé : on ne sert plus que ce qu'on a déjà (voir vecCache).
export class ErreurQuota extends Error {}

// En dessous de ce nombre de requêtes restantes sur les 5 000 du jour (20 %), le service passe en mode économie.
export const SEUIL_QUOTA_JOUR = 1000;

// Une tête de liste au-dessus de ce score est une réponse franche : on n'essaie pas de reformuler la requête (chaque variante coûte une requête Hardcover).
const SEUIL_FRANC = 70;
// Bonus donné aux résultats de l'auteur reconnu dans la requête (« tolkien hobbit » : les livres de Tolkien passent devant les guides sur le Hobbit).
const BONUS_AUTEUR = 40;

const DELAI_BNF_MS = 5000;

/** La promesse, ou une erreur si elle met plus de `ms`. Elle continue en arrière-plan : la file de la BnF n'est pas interrompue. */
function avecDelai(promesse, ms) {
  let minuteur;
  const limite = new Promise((_, rejet) => { minuteur = setTimeout(() => rejet(new Error('délai dépassé')), ms); });
  promesse.catch(() => {});   // une panne tardive d'une promesse abandonnée ne doit pas faire tomber le processus
  return Promise.race([promesse, limite]).finally(() => clearTimeout(minuteur));
}

/** `fn` sur chaque élément, `n` à la fois. */
async function enParallele(elements, n, fn) {
  const file = [...elements];
  await Promise.all(Array.from({ length: Math.min(n, file.length) }, async () => {
    while (file.length) await fn(file.shift());
  }));
}

export function creerService({ hardcover, bnf = null, cache, overrides = { series: {}, couvertures: {} }, couvertures = null, delaiBnfMs = DELAI_BNF_MS, seuilQuotaJour = SEUIL_QUOTA_JOUR }) {
  const lireOverrides = typeof overrides === 'function' ? overrides : async () => overrides;

  async function lire(cle) {
    try { return await cache.get(cle); } catch { return null; }
  }
  async function ecrire(cle, valeur) {
    try { await cache.set(cle, valeur); } catch { /* écrire le cache n'est jamais une raison d'échouer */ }
  }

  /** Cache-aside avec repli sur le périmé. `ttl` : une durée, ou une fonction de la valeur (pour un TTL court sur un résultat dégradé). */
  async function avecCache(cle, ttl, calculer) {
    const c = await lire(cle);
    if (c && c.ageMs < (typeof ttl === 'function' ? ttl(c.valeur) : ttl)) return { ...c.valeur, cache: 'frais' };

    /*
     * MODE ÉCONOMIE. Hardcover donne 5 000 requêtes par jour ; quand il en reste moins de seuilQuotaJour, on ne sollicite plus la source :
     * on sert ce qu'on a (même périmé), et sans rien en cache on refuse proprement (503) — l'application retombe alors sur ses
     * anciennes sources. Mieux vaut un service un peu moins frais jusqu'à minuit qu'un service coupé le reste de la journée.
     */
    const restant = hardcover.quota ? hardcover.quota().restantJour : null;
    if (Number.isFinite(restant) && restant < seuilQuotaJour) {
      if (c) return { ...c.valeur, cache: 'perime' };
      throw new ErreurQuota('quota de la source presque épuisé');
    }

    try {
      const valeur = await calculer();
      if (valeur) await ecrire(cle, valeur);
      return valeur ? { ...valeur, cache: 'absent' } : null;
    } catch (e) {
      if (c) return { ...c.valeur, cache: 'perime' };
      throw e;
    }
  }

  function verifierLangue(lang) {
    const l = String(lang || LANGUE_PAR_DEFAUT).toLowerCase();
    if (!LANGUES.includes(l)) throw new ErreurRequete(`Langue non prise en charge : ${lang}. Valeurs : ${LANGUES.join(', ')}.`);
    return l;
  }

  function verifierId(id, nom) {
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) throw new ErreurRequete(`Identifiant de ${nom} invalide.`);
    return n;
  }

  // ---------------------------------------------------------------- recherche
  /**
   * Les cartes de la meilleure reformulation de la requête. On cherche d'abord comme tapé (ou selon un alias, voir `recherches` dans les corrections) ;
   * seulement si la tête de liste est faible, on essaie — dans l'ordre, en gardant la meilleure :
   *  1. SANS L'ARTICLE DE TÊTE (« le da vinci code » ne rend rien chez Hardcover, « da vinci code » rend Dan Brown) ;
   *  2. en RECONNAISSANT L'AUTEUR dans la requête (« tolkien hobbit » : on cherche « hobbit » et on favorise Tolkien).
   * Chaque variante coûte une requête Hardcover : on ne reformule donc jamais une réponse franche, ni quand le quota du jour est bas.
   */
  async function meilleuresCartes(texte, idx, lang) {
    // Un alias s'écrit sans article (« journal d'un dégonflé ») : on essaie la requête telle quelle, puis sans son article de tête (« le journal d'un dégonflé »).
    const sansArt = sansArticleInitial(texte);
    const alias = idx.alias(normaliser(texte)) || (sansArt ? idx.alias(sansArt) : null);
    const cible = alias || texte;
    const evaluer = async (requeteHc, auteur = null) => {
      const hits = await hardcover.rechercher(requeteHc);
      let cartes = construireCartes(hits, requeteHc, { idCanonique: idx.idCanonique, nom: idx.nom, lang });
      if (auteur) {
        const famille = nomFamille(auteur.name);
        cartes = cartes.map((c) => ((c.auteurs || []).some((a) => nomFamille(a) === famille) ? { ...c, score: c.score + BONUS_AUTEUR } : c))
          .sort((a, b) => b.score - a.score);
      }
      return { cartes, tete: cartes.length ? cartes[0].score : -Infinity };
    };
    const quotaBas = () => {
      const restant = hardcover.quota ? hardcover.quota().restantJour : null;
      return Number.isFinite(restant) && restant < 2 * seuilQuotaJour;
    };

    let meilleur = await evaluer(cible);
    if (meilleur.tete >= SEUIL_FRANC || quotaBas()) return meilleur.cartes;

    const sansArticle = sansArticleInitial(cible);
    if (sansArticle) {
      const v = await evaluer(sansArticle);
      if (v.tete > meilleur.tete) meilleur = v;
      if (meilleur.tete >= SEUIL_FRANC) return meilleur.cartes;
    }

    // Une seule hypothèse d'auteur est retenue : la première qui correspond à un auteur connu de Hardcover.
    for (const candidat of candidatsAuteur(cible)) {
      let docs = [];
      try { docs = await hardcover.rechercherAuteurs(candidat.texte, 3); } catch { continue; }
      const auteur = docs.find((d) => auteurCorrespond(d, candidat));
      if (!auteur) continue;
      const v = await evaluer(candidat.reste, auteur);
      if (v.tete > meilleur.tete) meilleur = v;
      break;
    }
    return meilleur.cartes;
  }

  /**
   * La fin commune de toute recherche : quelles œuvres existent dans la langue demandée (UN appel pour toutes les cartes), titre, couverture,
   * ISBN et éditeur de l'ÉDITION dans la langue pour un livre isolé, tri, filtre de langue. `ecarter` retire le bruit (recherche par titre
   * seulement : une recherche par auteur n'a pas de « tête de liste sûre » à juger).
   */
  async function finaliser(cartes, lang, { ecarter }) {
    const ids = cartes.slice(0, NB_RESULTATS).flatMap((c) => c._livres).slice(0, MAX_LIVRES_VERIFIES);
    const editions = await hardcover.editionsEnLangue(ids, lang);

    let finales = cartes.map((c) => {
      const edition = editions.get(c._meilleurLivre) || c._livres.map((id) => editions.get(id)).find(Boolean) || null;
      const dispo = Boolean(edition);
      const carte = { ...c, langueDisponible: dispo, score: c.score + (dispo ? 10 : 0) };
      // Pour un livre isolé, titre et couverture de l'ÉDITION dans la langue : c'est celle que l'utilisateur possède.
      if (c.type === 'livre' && edition) {
        carte.titre = edition.title || c.titre;
        carte.couverture = edition.image?.url || c.couverture;
        // Ce qu'il faut pour AJOUTER ce livre sans second appel : l'ISBN, l'éditeur et la date de l'édition choisie.
        carte.isbn13 = versIsbn13(edition.isbn_13);
        carte.editeur = edition.publisher?.name || null;
        carte.date = edition.release_date || null;
      }
      return carte;
    }).sort((a, b) => b.score - a.score);

    // Le bruit s'écarte APRÈS le bonus de langue : c'est le classement final qui désigne la tête de liste.
    if (ecarter) finales = ecarterBruit(finales);
    const dansLaLangue = finales.filter((c) => c.langueDisponible);
    const retenues = (dansLaLangue.length ? dansLaLangue : finales).slice(0, NB_RESULTATS);
    return {
      langueNonDisponible: dansLaLangue.length === 0 && finales.length > 0,
      // Les champs de travail (préfixés « _ ») ne quittent jamais le service.
      resultats: retenues.map((c) => Object.fromEntries(Object.entries(c).filter(([k]) => !k.startsWith('_')))),
    };
  }

  async function rechercher(texte, langue) {
    const lang = verifierLangue(langue);
    const q = normaliser(texte);
    if (q.length < 2) throw new ErreurRequete('Recherche trop courte (2 caractères minimum).');

    return avecCache(`search:${VERSION_CACHE}:${lang}:${q}`, TTL.recherche, async () => {
      const idx = indexer(await lireOverrides());
      const cartes = await meilleuresCartes(texte, idx, lang);
      return { requete: texte, langue: lang, ...(await finaliser(cartes, lang, { ecarter: true })) };
    });
  }

  /**
   * Recherche PAR AUTEUR : les sagas et les livres de l'auteur, du plus lu au moins lu, regroupés comme pour une recherche par titre.
   * L'auteur retenu est le premier que Hardcover propose dont le nom contient tous les mots tapés (« tolkien » → J.R.R. Tolkien) ; les
   * suivants sont rendus dans `autresAuteurs` pour qu'on puisse proposer « vous cherchiez peut-être… ».
   */
  async function rechercherAuteur(texte, langue) {
    const lang = verifierLangue(langue);
    const q = normaliser(texte);
    if (q.length < 2) throw new ErreurRequete('Recherche trop courte (2 caractères minimum).');

    return avecCache(`auteur:${VERSION_CACHE}:${lang}:${q}`, TTL.recherche, async () => {
      const idx = indexer(await lireOverrides());
      const docs = await hardcover.rechercherAuteurs(texte, 5);
      const mots = q.split(' ');
      // Parmi les auteurs dont le nom contient TOUS les mots tapés, le plus FOURNI (« dumas » : Alexandre Dumas, pas un homonyme à 2 livres).
      const correspondants = docs.filter((d) => mots.every((m) => [d.name, ...(d.alternate_names || [])].some((nom) => normaliser(nom).split(' ').includes(m))));
      const retenu = [...correspondants].sort((a, b) => (Number(b.books_count) || 0) - (Number(a.books_count) || 0))[0] || docs[0];
      if (!retenu) return { requete: texte, langue: lang, mode: 'auteur', auteur: null, autresAuteurs: [], langueNonDisponible: false, resultats: [] };

      const livres = await hardcover.livresDeLAuteur(retenu.id);
      // Pas de titre à comparer à la requête (c'est un nom d'auteur) : le classement vient de la popularité.
      const cartes = construireCartes(livres, texte, { idCanonique: idx.idCanonique, nom: idx.nom, lang });
      return {
        requete: texte,
        langue: lang,
        mode: 'auteur',
        auteur: { id: Number(retenu.id), nom: retenu.name, livres: Number(retenu.books_count) || null },
        autresAuteurs: docs.filter((d) => d !== retenu).slice(0, 3).map((d) => ({ id: Number(d.id), nom: d.name, livres: Number(d.books_count) || null })),
        ...(await finaliser(cartes, lang, { ecarter: false })),
      };
    });
  }
  // ---------------------------------------------------------------- saga
  async function enrichirCouvertures(lignes, { idx, serieId }) {
    if (!couvertures) return;
    await enParallele(lignes, CONCURRENCE_COUVERTURES, async (t) => {
      const isbn13 = t.edition?.isbn13 || null;
      const r = await couvertures.resoudre({
        isbn13,
        couvertureEdition: t.couvertureSource === 'edition' ? t.couverture : null,
        couvertureVoisine: t._couvertureVoisine,
        couverturePetite: t._couverturePetite,
        couvertureLivre: t._couvertureLivre,
        correction: idx.couverture({ isbn13, serieId, position: t.position }),
      });
      t.couverture = r.url;
      t.couvertureSource = r.source;
      t.couvertureApproximative = r.approximative;
      t.couvertureBasseDefinition = Boolean(r.basseDefinition);
    });
  }

  async function serie(id, langue) {
    const lang = verifierLangue(langue);
    const numero = verifierId(id, 'série');
    const ov = await lireOverrides();
    const idx = indexer(ov);
    const canon = idx.idCanonique(numero);

    return avecCache(`serie:${VERSION_CACHE}:${lang}:${canon}`, TTL.serie, async () => {
      const principale = await hardcover.serie(canon);
      if (!principale) return null;

      // Séries doublons déclarées dans les corrections : on réunit leurs entrées (ex. séries françaises incomplètes).
      let entrees = [...principale.book_series];
      for (const d of (ov.series?.[String(canon)]?.fusionner || [])) {
        const autre = await hardcover.serie(d);
        if (autre) entrees = entrees.concat(autre.book_series);
      }

      const editions = await hardcover.editionsEnLangue(entrees.map((e) => e.book.id), lang, { voisines: true });
      const resultat = construireSerie({
        serie: principale, entrees, editions, lang,
        nom: idx.nom(canon, lang, principale.name),
        exclurePositions: ov.series?.[String(canon)]?.exclurePositions || [],
      });

      const lignes = [...resultat.tomes, ...resultat.tomes.flatMap((t) => t.parties), ...resultat.horsSerie];
      await enrichirCouvertures(lignes, { idx, serieId: canon });
      lignes.forEach((l) => { delete l._couvertureLivre; delete l._couverturePetite; delete l._couvertureVoisine; });
      return resultat;
    });
  }

  // ---------------------------------------------------------------- éditions d'un livre
  const titreCourt = (t) => String(t || '').split(/ : | \(/)[0].trim();

  async function livre(id, langue) {
    const lang = verifierLangue(langue);
    const numero = verifierId(id, 'livre');
    // Une réponse sans la BnF (panne) ne reste que 1 h en cache : on retentera bientôt.
    const ttl = (v) => (v.sourceBnf === 'indisponible' ? 60 * 60 * 1000 : TTL.recherche);

    return avecCache(`livre:${VERSION_CACHE}:${lang}:${numero}`, ttl, async () => {
      const idx = indexer(await lireOverrides());
      const l = await hardcover.livre(numero, lang);
      if (!l) return null;

      const auteurs = [...new Set((l.contributions || []).map((c) => c.author?.name).filter(Boolean))];
      const titreLangue = l.editions?.[0]?.title || l.title;

      // La BnF ne couvre que le français ; et une panne de la BnF ne doit jamais faire échouer la réponse.
      let notices = [];
      let sourceBnf = 'non-applicable';
      if (lang === 'fr' && bnf) {
        try {
          // La BnF est parfois lente (mesuré : 9 s) : au-delà de 5 s on répond sans elle, avec un TTL court pour retenter bientôt.
          notices = await avecDelai(bnf.editionsDe(titreCourt(titreLangue), auteurs[0]), delaiBnfMs);
          sourceBnf = 'ok';
        } catch {
          sourceBnf = 'indisponible';
        }
      }

      const editions = fusionnerEditions({ editionsHardcover: l.editions, noticesBnf: notices, titre: titreCourt(titreLangue), auteur: auteurs[0] });
      const serieLien = l.book_series?.[0];

      await enParallele(editions, CONCURRENCE_COUVERTURES, async (e) => {
        const r = couvertures
          ? await couvertures.resoudre({
            isbn13: e.isbn13,
            couvertureEdition: e.couverture,
            couverturePetite: e.couverturePetite,
            couvertureLivre: l.image?.url,
            correction: idx.couverture({ isbn13: e.isbn13, serieId: serieLien?.series?.id, position: serieLien?.position }),
          })
          : { url: e.couverture, source: e.couverture ? 'hardcover' : null, approximative: false };
        e.couverture = { url: r.url, source: r.source, approximative: r.approximative, basseDefinition: Boolean(r.basseDefinition) };
        delete e.couverturePetite;
      });

      return {
        id: numero,
        titre: l.title,
        titreLangue,
        auteurs,
        langue: lang,
        resume: nettoyerResume(l.description),
        resumeLangue: langueResume(nettoyerResume(l.description)),
        serie: serieLien ? { id: idx.idCanonique(serieLien.series.id), nom: idx.nom(idx.idCanonique(serieLien.series.id), lang, serieLien.series.name), position: serieLien.position } : null,
        editions,
        sourceBnf,
      };
    });
  }

  // ---------------------------------------------------------------- scan d'un ISBN
  const LANGUES_BNF = { fre: 'fr', eng: 'en' };

  /**
   * L'édition qui porte cet ISBN, pour le scan de code-barres. Hardcover d'abord (éditeur, date, pages, langue, couverture, livre et saga),
   * la BnF en repli pour ce qu'il ignore (ISBN récents en 979, éditions québécoises) : elle ne donne ni pages ni saga, mais assez pour ajouter le livre.
   * AUCUN filtre de langue : un ISBN désigne une édition précise, souvent en version originale.
   * @returns {Promise<object|null>} null si aucune source ne connaît cet ISBN
   */
  async function isbn(brut) {
    const isbn13 = versIsbn13(brut);
    if (!isbn13) throw new ErreurRequete('ISBN invalide : 10 ou 13 chiffres, clé de contrôle comprise.');
    const ttl = (v) => (v.trouve ? TTL.isbn : (v.incertain ? TTL.isbnIncertain : TTL.isbnAbsent));

    const r = await avecCache(`isbn:${VERSION_CACHE}:${isbn13}`, ttl, async () => {
      const idx = indexer(await lireOverrides());
      const ed = await hardcover.editionParIsbn(isbn13);

      if (ed) {
        const serieLien = (ed.book?.book_series || []).find((s) => s.featured) || ed.book?.book_series?.[0] || null;
        const canon = serieLien ? idx.idCanonique(serieLien.series.id) : null;
        const langue = LANGUES.includes(ed.language?.code2) ? ed.language.code2 : LANGUE_PAR_DEFAUT;
        const couverture = couvertures
          ? await couvertures.resoudre({
            isbn13,
            couvertureEdition: utilisable(ed.image) ? ed.image.url : null,
            couverturePetite: petite(ed.image) ? ed.image.url : null,
            couvertureLivre: ed.book?.image?.url || null,
            correction: idx.couverture({ isbn13, serieId: canon, position: serieLien?.position }),
          })
          : { url: utilisable(ed.image) ? ed.image.url : null, source: ed.image ? 'hardcover' : null, approximative: false };
        return {
          trouve: true,
          isbn13,
          titre: ed.title,
          auteurs: [...new Set((ed.book?.contributions || []).map((c) => c.author?.name).filter(Boolean))],
          editeur: ed.publisher?.name || null,
          date: ed.release_date || null,
          langue: ed.language?.code2 || null,
          nbPages: ed.pages || null,
          format: ed.edition_format || null,
          couverture: { url: couverture.url, source: couverture.source, approximative: couverture.approximative, basseDefinition: Boolean(couverture.basseDefinition) },
          livre: ed.book ? { id: ed.book.id, titre: ed.book.title } : null,
          resume: nettoyerResume(ed.book?.description),
          resumeLangue: langueResume(nettoyerResume(ed.book?.description)),
          serie: serieLien ? {
            id: canon, nom: idx.nom(canon, langue, serieLien.series.name), position: serieLien.position, total: serieLien.series.primary_books_count ?? null,
          } : null,
          sources: ['hardcover'],
        };
      }

      // Inconnu de Hardcover : la BnF, avec un délai borné. Une BnF muette ne prouve PAS que l'ISBN n'existe pas.
      let notice = null;
      let bnfMuette = !bnf;
      if (bnf) {
        try { notice = await avecDelai(bnf.parIsbn(isbn13), delaiBnfMs); } catch { bnfMuette = true; }
      }
      if (!notice) return { trouve: false, incertain: bnfMuette, isbn13 };

      const couverture = couvertures
        ? await couvertures.resoudre({ isbn13, correction: idx.couverture({ isbn13 }) })
        : { url: null, source: null, approximative: false };
      return {
        trouve: true,
        isbn13,
        titre: notice.titre,
        auteurs: notice.auteurs,
        editeur: notice.editeur,
        date: notice.annee,
        langue: LANGUES_BNF[notice.langue] || null,
        nbPages: null,
        format: null,
        couverture: { url: couverture.url, source: couverture.source, approximative: false, basseDefinition: false },
        livre: null,
        resume: null,
        resumeLangue: null,
        serie: null,
        sources: ['bnf'],
      };
    });
    return r.trouve ? r : null;
  }

  /*
   * IMAGES RETIRÉES. Une image que son ayant droit a demandé de retirer (`npm run corriger -- masquer <adresse>`) n'est plus jamais rendue,
   * quelle que soit la route, le champ ou la source, et SANS attendre l'expiration du cache : le retrait s'applique à la sortie, sur une copie.
   * Le client affiche alors une couverture dessinée.
   */
  const avecRetraits = (fn) => async (...args) => {
    const resultat = await fn(...args);
    let masquees = new Set();
    try { masquees = urlsMasquees(await lireOverrides()); } catch { /* sans corrections lisibles, on rend ce qu'on a */ }
    return masquees.size ? sansImages(resultat, masquees) : resultat;
  };

  return {
    rechercher: avecRetraits(rechercher),
    rechercherAuteur: avecRetraits(rechercherAuteur),
    serie: avecRetraits(serie),
    livre: avecRetraits(livre),
    isbn: avecRetraits(isbn),
  };
}

/** Copie de `valeur` où toute chaîne égale à une adresse retirée devient null. Ne modifie jamais l'original (il peut venir du cache mémoire). */
export function sansImages(valeur, masquees) {
  if (typeof valeur === 'string') return masquees.has(valeur) ? null : valeur;
  if (Array.isArray(valeur)) return valeur.map((v) => sansImages(v, masquees));
  if (valeur && typeof valeur === 'object') return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, sansImages(v, masquees)]));
  return valeur;
}

