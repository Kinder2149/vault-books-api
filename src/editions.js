/*
 * editions.js — les éditions d'un livre dans une langue : Hardcover + BnF réunies, dédoublonnées par ISBN-13. Fonctions pures.
 *
 * Règles :
 *  - on ne garde que les éditions AVEC un ISBN-13 valide : c'est ce que l'utilisateur scanne et ce qui rattache une couverture ;
 *  - Hardcover fait foi pour ce qu'il sait (éditeur, format, image) ; la BnF comble les trous et ajoute les éditions qu'il ignore ;
 *  - une notice BnF n'est retenue que si SON TITRE CONTIENT celui du livre (mots entiers, article de tête ignoré) :
 *    mieux vaut une édition manquante qu'une édition d'un autre livre (même principe que Vault Read : « une carte en trop vaut mieux
 *    qu'une fusion fausse »).
 */
import { normaliser, sansArticle } from './text.js';
import { versIsbn13 } from './isbn.js';
import { utilisable, petite } from './images.js';

/**
 * « Le feu dans le ciel (Édition collector) » correspond à « Le Feu dans le ciel » ; « Le feu » ne correspond pas.
 * Seul le titre du LIVRE est coupé au sous-titre : celui de la notice est gardé entier, car la BnF écrit parfois le numéro de volume
 * après les deux-points (« Le trône de fer : l'intégrale. 1 ») — mesuré sur le Trône de fer, où le couper faisait perdre toutes les éditions.
 */
export function titreCorrespond(titreNotice, titreLivre) {
  const n = ` ${sansArticle(normaliser(titreNotice))} `;
  const l = sansArticle(normaliser(String(titreLivre).split(/ : /)[0]));
  return Boolean(l) && n.includes(` ${l} `);
}

const nomFamille = (nom) => normaliser(nom).split(' ').filter(Boolean).pop() || '';

export function auteurCorrespond(auteursNotice, auteur) {
  const f = nomFamille(auteur);
  return Boolean(f) && (auteursNotice || []).some((a) => nomFamille(a) === f);
}

export function fusionnerEditions({ editionsHardcover = [], noticesBnf = [], titre, auteur }) {
  const parIsbn = new Map();

  for (const e of editionsHardcover) {
    const isbn13 = versIsbn13(e.isbn_13);
    if (!isbn13) continue;
    parIsbn.set(isbn13, {
      isbn13,
      titre: e.title || titre,
      editeur: e.publisher?.name || null,
      date: e.release_date || null,
      format: e.edition_format || null,
      couverture: utilisable(e.image) ? e.image.url : null,
      couverturePetite: petite(e.image) ? e.image.url : null,
      collection: null,
      sources: ['hardcover'],
    });
  }

  for (const n of noticesBnf) {
    if (!n.isbn13) continue;
    if (!titreCorrespond(n.titre, titre) || (auteur && !auteurCorrespond(n.auteurs, auteur))) continue;
    const existante = parIsbn.get(n.isbn13);
    if (existante) {
      existante.editeur ||= n.editeur;
      existante.date ||= n.annee;
      existante.collection ||= n.collection;
      if (!existante.sources.includes('bnf')) existante.sources.push('bnf');
    } else {
      parIsbn.set(n.isbn13, {
        isbn13: n.isbn13, titre: n.titre, editeur: n.editeur, date: n.annee, format: null,
        couverture: null, couverturePetite: null, collection: n.collection, sources: ['bnf'],
      });
    }
  }

  // Les plus récentes d'abord : ce sont celles qu'on trouve en rayon.
  return [...parIsbn.values()].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

