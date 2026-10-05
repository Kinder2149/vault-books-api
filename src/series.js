/*
 * series.js — construire « la saga dans l'ordre » pour une langue. Fonction pure.
 *
 * Constats mesurés sur Hardcover (2026-10-05) qui dictent les règles :
 *  - chaque traduction est parfois un LIVRE distinct à la même position (« Fire in the Sky » à côté de « Le Feu dans le ciel »),
 *    et les éditions françaises sont parfois rattachées au livre canonique anglais ;
 *    → par position, on garde le livre qui a une édition dans la langue demandée, puis le plus lu ;
 *  - les positions décimales (1.1, 1.2…) sont les VOLUMES COUPÉS d'un tome (éditions françaises du Trône de fer, chaque roman en 3-4 poches),
 *    ou parfois des hors-séries (Tom Bombadil à 1.5) : on les range en `parties` sous leur tome ;
 *  - un tome sans édition entière peut exister en volumes coupés : il reste disponible (`viaParties`) ;
 *  - un tome sans AUCUNE édition dans la langue reste dans la liste (`disponible: false`) : la saga reste complète à l'écran ;
 *  - un tome pas encore paru (date future, ou sans date ni édition) est marqué `aParaitre`, et ne compte pas dans « disponibles » ;
 *  - les corrections peuvent exclure des positions (`exclurePositions`).
 *
 * Couverture : `couvertureSource` dit d'où elle vient. « edition » = l'image de l'édition dans la langue (la bonne) ;
 * « livre » = l'image du livre canonique, qui peut être celle d'une autre langue : la couche couvertures (covers.js) tente
 * d'abord de la remplacer par celle de l'édition, et signale sinon qu'elle est approximative.
 */

import { utilisable, petite } from './images.js';

const parent = (position) => Math.floor(position);

function entree(position, candidats, editions, aujourdhui) {
  // Priorité : a une édition dans la langue > plus de lecteurs > a une image.
  const classes = [...candidats].sort((x, y) =>
    (editions.has(y.book.id) - editions.has(x.book.id))
    || ((y.book.users_count || 0) - (x.book.users_count || 0))
    || (Boolean(y.book.image?.url) - Boolean(x.book.image?.url)));
  const choisi = classes[0].book;
  const ed = editions.get(choisi.id) || null;
  const couvertureEdition = utilisable(ed?.image) ? ed.image.url : null;
  const couverturePetite = petite(ed?.image) ? ed.image.url : null;
  const couvertureLivre = choisi.image?.url || null;
  return {
    position,
    titre: ed?.title || choisi.title,
    livreId: choisi.id,
    disponible: Boolean(ed),
    // Hardcover n'expose pas de drapeau « à paraître » : date future, ou aucune date ET aucune édition dans la langue (The Winds of Winter).
    aParaitre: Boolean(choisi.release_date ? choisi.release_date > aujourdhui : !ed),
    couverture: couvertureEdition || couverturePetite || couvertureLivre,
    couvertureSource: couvertureEdition ? 'edition' : (couverturePetite ? 'edition-petite' : (couvertureLivre ? 'livre' : null)),
    _couverturePetite: couverturePetite,
    _couvertureLivre: couvertureLivre,
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

export function construireSerie({ serie, entrees, editions, lang, nom, exclurePositions = [], aujourdhui = new Date().toISOString().slice(0, 10) }) {
  const exclues = new Set(exclurePositions.map(Number));
  const parPosition = new Map();
  for (const e of entrees || []) {
    if (exclues.has(Number(e.position))) continue;
    if (!parPosition.has(e.position)) parPosition.set(e.position, []);
    parPosition.get(e.position).push(e);
  }

  const lignes = [...parPosition.entries()].sort((a, b) => a[0] - b[0])
    .map(([position, candidats]) => entree(position, candidats, editions, aujourdhui));

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
    if (t.viaParties) t.aParaitre = false;
  }

  return {
    id: serie.id,
    nom: nom || serie.name,
    langue: lang,
    totalPrincipal: serie.primary_books_count ?? null,
    tomes,
    horsSerie,
    // « 12 tomes, 12 disponibles » : permet à l'app d'afficher l'état de la saga dans la langue choisie.
    disponibles: tomes.filter((t) => t.disponible && !t.aParaitre).length,
    aParaitre: tomes.filter((t) => t.aParaitre).length,
  };
}



