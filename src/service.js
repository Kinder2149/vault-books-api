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
import { construireCartes } from './rank.js';
import { construireSerie } from './series.js';
import { fusionnerEditions } from './editions.js';
import { indexer } from './overrides.js';

const VERSION_CACHE = 'v2';   // à incrémenter quand le tri ou le format change : invalide tout le cache d'un coup
const MAX_LIVRES_VERIFIES = 60;
const NB_RESULTATS = 20;
const CONCURRENCE_COUVERTURES = 4;

export class ErreurRequete extends Error {}

/** `fn` sur chaque élément, `n` à la fois. */
async function enParallele(elements, n, fn) {
  const file = [...elements];
  await Promise.all(Array.from({ length: Math.min(n, file.length) }, async () => {
    while (file.length) await fn(file.shift());
  }));
}

export function creerService({ hardcover, bnf = null, cache, overrides = { series: {}, couvertures: {} }, couvertures = null }) {
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
  async function rechercher(texte, langue) {
    const lang = verifierLangue(langue);
    const q = normaliser(texte);
    if (q.length < 2) throw new ErreurRequete('Recherche trop courte (2 caractères minimum).');

    return avecCache(`search:${VERSION_CACHE}:${lang}:${q}`, TTL.recherche, async () => {
      const idx = indexer(await lireOverrides());
      const hits = await hardcover.rechercher(texte);
      let cartes = construireCartes(hits, texte, { idCanonique: idx.idCanonique, nom: idx.nom, lang });

      // Quelles œuvres existent dans la langue demandée ? Un seul appel pour toutes les cartes.
      const ids = cartes.slice(0, NB_RESULTATS).flatMap((c) => c._livres).slice(0, MAX_LIVRES_VERIFIES);
      const editions = await hardcover.editionsEnLangue(ids, lang);

      cartes = cartes.map((c) => {
        const edition = editions.get(c._meilleurLivre) || c._livres.map((id) => editions.get(id)).find(Boolean) || null;
        const dispo = Boolean(edition);
        const carte = { ...c, langueDisponible: dispo, score: c.score + (dispo ? 10 : 0) };
        // Pour un livre isolé, titre et couverture de l'ÉDITION dans la langue : c'est celle que l'utilisateur possède.
        if (c.type === 'livre' && edition) {
          carte.titre = edition.title || c.titre;
          carte.couverture = edition.image?.url || c.couverture;
        }
        return carte;
      }).sort((a, b) => b.score - a.score);

      const dansLaLangue = cartes.filter((c) => c.langueDisponible);
      const retenues = (dansLaLangue.length ? dansLaLangue : cartes).slice(0, NB_RESULTATS);
      return {
        requete: texte,
        langue: lang,
        langueNonDisponible: dansLaLangue.length === 0 && cartes.length > 0,
        resultats: retenues.map(({ _livres, _meilleurLivre, ...publique }) => publique),
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

      const editions = await hardcover.editionsEnLangue(entrees.map((e) => e.book.id), lang);
      const resultat = construireSerie({
        serie: principale, entrees, editions, lang,
        nom: idx.nom(canon, lang, principale.name),
        exclurePositions: ov.series?.[String(canon)]?.exclurePositions || [],
      });

      const lignes = [...resultat.tomes, ...resultat.tomes.flatMap((t) => t.parties), ...resultat.horsSerie];
      await enrichirCouvertures(lignes, { idx, serieId: canon });
      lignes.forEach((l) => { delete l._couvertureLivre; delete l._couverturePetite; });
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
          notices = await bnf.editionsDe(titreCourt(titreLangue), auteurs[0]);
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
        serie: serieLien ? { id: idx.idCanonique(serieLien.series.id), nom: idx.nom(idx.idCanonique(serieLien.series.id), lang, serieLien.series.name), position: serieLien.position } : null,
        editions,
        sourceBnf,
      };
    });
  }

  return { rechercher, serie, livre };
}

