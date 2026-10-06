/*
 * series.js — construire « la saga dans l'ordre » pour une langue, puis dans les DEUX langues. Fonctions pures.
 *
 * Constats mesurés sur Hardcover (2026-10-05) qui dictent les règles :
 *  - chaque traduction est parfois un LIVRE distinct à la même position (« Fire in the Sky » à côté de « Le Feu dans le ciel »),
 *    et les éditions françaises sont parfois rattachées au livre canonique anglais ;
 *    → par position, on garde le livre qui a une édition dans la langue demandée, puis le plus lu ;
 *  - les positions décimales (1.1, 1.2…) sont les VOLUMES COUPÉS d'un tome (éditions françaises du Trône de fer, chaque roman en 3-4 poches),
 *    ou parfois des hors-séries (Tom Bombadil à 1.5) : on les range en `parties` sous leur tome ;
 *  - un tome sans édition entière peut exister en volumes coupés : il reste disponible (`viaParties`) ;
 *  - un tome sans AUCUNE édition dans la langue reste dans la liste : la saga reste complète à l'écran. Son `statut` dit pourquoi :
 *    `indisponible_langue` (l'œuvre est parue, pas dans cette langue) ou `a_paraitre` (pas encore paru) — voir `statutAbsent` ;
 *  - un tome sans édition dans la langue prend le TITRE de l'autre langue (repli), signalé par `langueTitre` ;
 *  - les corrections peuvent exclure des positions (`exclurePositions`).
 *
 * Couverture : `couvertureSource` dit d'où elle vient. « edition » = l'image de l'édition dans la langue (la bonne) ;
 * « livre » = l'image du livre canonique, qui peut être celle d'une autre langue : la couche couvertures (covers.js) tente
 * d'abord de la remplacer par celle de l'édition, et signale sinon qu'elle est approximative.
 */

import { utilisable, petite } from './images.js';
import { normaliser, mots } from './text.js';

const parent = (position) => Math.floor(position);

const MOTS_TITRE = {
  fr: new Set(['le', 'la', 'les', 'des', 'du', 'de', 'un', 'une', 'et', 'au', 'aux', 'l', 'd', 'sur', 'dans']),
  en: new Set(['the', 'of', 'and', 'a', 'an', 'to', 'in', 'on', 'for', 'with', 'from']),
};

/** La langue probable d'un TITRE d'après ses petits mots (« Hunters of Dune » → en), ou null quand on ne peut pas trancher (un seul mot, langue tierce). */
export function langueDuTitre(titre) {
  const m = mots(normaliser(titre));
  const fr = m.filter((x) => MOTS_TITRE.fr.has(x)).length;
  const en = m.filter((x) => MOTS_TITRE.en.has(x)).length;
  if (fr > en) return 'fr';
  if (en > fr) return 'en';
  return null;
}

/** cycle_principal | suites | prequelles | spin_off, deviné sur le nom de la série (« Dune Sequels »). */
export function typeDeSaga(nom) {
  const n = String(nom || '');
  if (/pr[eé]quel|pr[eé]lude/i.test(n)) return 'prequelles';
  if (/sequels?\b|suites?\b|continuation/i.test(n)) return 'suites';
  if (/spin-?offs?\b|universe\b|univers\b|companion|derivative|extended/i.test(n)) return 'spin_off';
  return 'cycle_principal';
}

/**
 * Le STATUT d'un tome absent de la langue. Deux états, qu'il ne faut plus confondre :
 *  - a_paraitre : une date future, ou aucune date et aucune édition dans AUCUNE langue (The Winds of Winter) ;
 *  - indisponible_langue : l'œuvre est parue (date passée, ou éditée dans l'autre langue), mais sans édition dans cette langue.
 */
function statutAbsent(candidats, editionsAutre, aujourdhui) {
  const dates = candidats.map((c) => c.book.release_date).filter(Boolean).sort();
  const editeeAilleurs = candidats.some((c) => editionsAutre.has(c.book.id));
  if (dates.length && dates[0] > aujourdhui) return 'a_paraitre';
  if (!dates.length && !editeeAilleurs) return 'a_paraitre';
  return 'indisponible_langue';
}

function entree(position, candidats, editions, aujourdhui, { editionsAutre, langAutre, lang }) {
  // Priorité : a une édition dans la langue > plus de lecteurs > a une image.
  const classes = [...candidats].sort((x, y) =>
    (editions.has(y.book.id) - editions.has(x.book.id))
    || ((y.book.users_count || 0) - (x.book.users_count || 0))
    || (Boolean(y.book.image?.url) - Boolean(x.book.image?.url)));
  let choisi = classes[0].book;
  const ed = editions.get(choisi.id) || null;

  let titre = ed?.title || choisi.title;
  let langueTitre = lang;
  if (!ed) {
    // Sans édition dans la langue : le titre vient de l'AUTRE langue (le repli) ; à défaut, le titre de candidat qui ressemble le plus à de
    // l'anglais, plutôt que la traduction étrangère la plus lue (« I cacciatori di Dune » → « Hunters of Dune »).
    const enAutre = classes.find((c) => editionsAutre.has(c.book.id));
    if (enAutre) {
      choisi = enAutre.book;
      titre = editionsAutre.get(choisi.id).title || choisi.title;
      langueTitre = langAutre;
    } else {
      // Hardcover relie chaque traduction à son livre d'origine (`canonical`) : son titre est le repli le plus sûr (« I vermi della sabbia di Dune »
      // → « Sandworms of Dune »). Sans lui, le titre de candidat qui ressemble le plus à de l'anglais ou du français.
      const rang = (c) => ({ en: 0, fr: 1 }[langueDuTitre(c.book.title)] ?? 2);
      const avecOrigine = classes.find((c) => c.book.canonical?.title);
      choisi = (avecOrigine || [...classes].sort((x, y) => rang(x) - rang(y))[0]).book;
      titre = avecOrigine ? avecOrigine.book.canonical.title : choisi.title;
      langueTitre = langueDuTitre(titre);
    }
  }

  const couvertureEdition = utilisable(ed?.image) ? ed.image.url : null;
  const couverturePetite = petite(ed?.image) ? ed.image.url : null;
  // Une AUTRE édition française du même tome, avec une image assez grande (voir hardcover.editionsEnLangue) : utile quand l'édition retenue n'a qu'une miniature.
  const couvertureVoisine = !couvertureEdition && utilisable(ed?._imageVoisine) ? ed._imageVoisine.url : null;
  // Une édition annoncée (date future) reste « à paraître » : on peut la précommander, mais elle ne se lit pas encore.
  const statut = ed ? (choisi.release_date > aujourdhui ? 'a_paraitre' : 'disponible') : statutAbsent(candidats, editionsAutre, aujourdhui);
  return {
    position,
    titre,
    langueTitre,
    livreId: choisi.id,
    statut,
    disponible: Boolean(ed),
    aParaitre: statut === 'a_paraitre',
    // Pas de repli sur l'image du « livre » : elle peut être celle d'une autre langue. Sans image de l'édition, l'application dessine la couverture.
    couverture: couvertureEdition || couverturePetite,
    couvertureSource: couvertureEdition ? 'edition' : (couverturePetite ? 'edition-petite' : null),
    _couverturePetite: couverturePetite,
    _couvertureVoisine: couvertureVoisine,
    edition: ed && {
      id: ed.id,
      isbn13: ed.isbn_13 || null,
      editeur: ed.publisher?.name || null,
      date: ed.release_date || null,
      format: ed.edition_format || null,
    },
    lecteurs: choisi.users_count || 0,
  };
}

function comptes(tomes) {
  return {
    disponibles: tomes.filter((t) => t.statut === 'disponible').length,
    indisponibles: tomes.filter((t) => t.statut === 'indisponible_langue').length,
    aParaitre: tomes.filter((t) => t.statut === 'a_paraitre').length,
  };
}

/**
 * La saga dans UNE langue.
 * @param {Map<number, object>} [editionsAutre] les éditions de l'AUTRE langue : elles donnent le statut exact et le titre de repli
 */
export function construireSerie({ serie, entrees, editions, lang, nom, exclurePositions = [], aujourdhui = new Date().toISOString().slice(0, 10), editionsAutre = new Map(), langAutre = lang === 'fr' ? 'en' : 'fr' }) {
  const exclues = new Set(exclurePositions.map(Number));
  const parPosition = new Map();
  for (const e of entrees || []) {
    if (exclues.has(Number(e.position))) continue;
    if (!parPosition.has(e.position)) parPosition.set(e.position, []);
    parPosition.get(e.position).push(e);
  }

  const lignes = [...parPosition.entries()].sort((a, b) => a[0] - b[0])
    .map(([position, candidats]) => entree(position, candidats, editions, aujourdhui, { editionsAutre, langAutre, lang }));

  const tomes = lignes.filter((l) => Number.isInteger(l.position)).map((t) => ({ ...t, parties: [] }));
  const horsSerie = [];
  for (const l of lignes.filter((x) => !Number.isInteger(x.position))) {
    const tome = tomes.find((t) => t.position === parent(l.position));
    if (tome) tome.parties.push(l); else horsSerie.push(l);
  }
  for (const t of tomes) {
    t.viaParties = !t.disponible && t.parties.some((p) => p.disponible);
    t.disponible = t.disponible || t.viaParties;
    // Des volumes coupés disponibles prouvent que le tome est paru.
    if (t.viaParties) { t.aParaitre = false; t.statut = 'disponible'; }
  }

  return {
    id: serie.id,
    nom: nom || serie.name,
    langue: lang,
    typeSaga: typeDeSaga(serie.name),
    totalPrincipal: serie.primary_books_count ?? null,
    tomes,
    horsSerie,
    // « 12 tomes, 12 disponibles » : permet à l'app d'afficher l'état de la saga dans la langue choisie.
    ...comptes(tomes),
  };
}

const sansPosition = ({ position, ...reste }) => reste;

/**
 * La saga dans LES DEUX langues : un résultat de `construireSerie` par langue, réuni tome par tome.
 * Forme : { id, noms: {fr, en}, tomes: [{ position, langues: { fr: {…}, en: {…} } }], comptes }. C'est cette forme qui est mise en cache :
 * `projeterSerie` en tire la réponse à plat d'une seule langue, sans rien rechercher de nouveau.
 */
export function fusionnerLangues({ fr, en, noms, languesNoms }) {
  const reunir = (listeFr, listeEn) => listeFr.map((tf) => {
    const te = listeEn.find((x) => x.position === tf.position);
    return { position: tf.position, langues: { fr: sansPosition(tf), en: te ? sansPosition(te) : null } };
  });
  return {
    id: fr.id,
    noms,
    languesNoms,
    typeSaga: fr.typeSaga,
    totalPrincipal: fr.totalPrincipal,
    nbTomes: fr.totalPrincipal ?? fr.tomes.length,
    tomes: reunir(fr.tomes, en.tomes),
    horsSerie: reunir(fr.horsSerie, en.horsSerie),
    comptes: {
      fr: { disponibles: fr.disponibles, indisponibles: fr.indisponibles, aParaitre: fr.aParaitre },
      en: { disponibles: en.disponibles, indisponibles: en.indisponibles, aParaitre: en.aParaitre },
    },
  };
}

/** La réponse à plat d'UNE langue : la forme historique, enrichie de `statut`, `langueTitre`, `noms`, `typeSaga`… */
export function projeterSerie(bi, lang) {
  const aplatir = (liste) => liste.map((t) => ({ position: t.position, ...(t.langues[lang] || {}) }));
  return {
    id: bi.id,
    nom: bi.noms[lang],
    langueNom: bi.languesNoms[lang],
    noms: bi.noms,
    langue: lang,
    typeSaga: bi.typeSaga,
    totalPrincipal: bi.totalPrincipal,
    nbTomes: bi.nbTomes,
    tomes: aplatir(bi.tomes),
    horsSerie: aplatir(bi.horsSerie),
    ...bi.comptes[lang],
    ...(bi.cache ? { cache: bi.cache } : {}),
  };
}
