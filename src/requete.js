/*
 * requete.js — comprendre une requête mal tapée. Fonctions pures.
 *
 * Mesuré le 2026-10-05 sur Hardcover (voir docs/resultats-mesure-4.md) :
 *  - l'article de tête GÊNE son moteur : « le da vinci code » ne rend rien, « da vinci code » rend le livre de Dan Brown ;
 *  - « tolkien hobbit » est perdu (guides et analyses du Hobbit) alors que « tolkien » et « hobbit » seuls sont parfaits :
 *    il faut reconnaître l'AUTEUR dans la requête, le retirer, chercher le reste, et favoriser cet auteur.
 */
import { normaliser, mots } from './text.js';

const ARTICLES = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'des', 'the', 'a', 'an']);

/** La requête sans son article de tête, ou null s'il n'y en a pas (ou si c'est le seul mot). « le da vinci code » → « da vinci code ». */
export function sansArticleInitial(texte) {
  const m = mots(normaliser(texte));
  return m.length > 1 && ARTICLES.has(m[0]) ? m.slice(1).join(' ') : null;
}

/**
 * Les morceaux de la requête qui pourraient être un nom d'auteur : le début et la fin, sur un ou deux mots.
 * « tolkien hobbit » → [« tolkien »], [« hobbit »] ; « stephen king ça » → « stephen », « ça », « stephen king », « king ça ».
 * Une requête d'un seul mot n'en a pas : on ne peut pas à la fois la prendre pour l'auteur et pour le titre.
 */
export function candidatsAuteur(texte) {
  const t = mots(normaliser(texte));
  if (t.length < 2) return [];
  const vus = new Set();
  const liste = [];
  const ajouter = (morceau, reste) => {
    const cle = morceau.join(' ');
    if (!cle || vus.has(cle) || reste.length === 0) return;
    vus.add(cle);
    liste.push({ texte: cle, mots: morceau, reste: reste.join(' ') });
  };
  ajouter(t.slice(0, 1), t.slice(1));
  ajouter(t.slice(-1), t.slice(0, -1));
  if (t.length >= 3) {
    ajouter(t.slice(0, 2), t.slice(2));
    ajouter(t.slice(-2), t.slice(0, -2));
  }
  return liste;
}

/**
 * Ce morceau désigne-t-il CET auteur de Hardcover ? Tous ses mots doivent figurer dans le nom (ou un nom alternatif) ; et l'auteur doit
 * être assez fourni pour que ce ne soit pas un hasard (un mot seul n'est un auteur que s'il en a ≥ 10 livres : « dune » ne devient pas un auteur).
 */
export function auteurCorrespond(doc, candidat) {
  if (!doc) return false;
  const livres = Number(doc.books_count) || 0;
  if (livres < (candidat.mots.length >= 2 ? 3 : 10)) return false;
  if (candidat.mots.length === 1 && candidat.mots[0].length < 3) return false;
  const noms = [doc.name, ...(doc.alternate_names || [])].filter(Boolean);
  return noms.some((nom) => {
    const dedans = new Set(mots(normaliser(nom)));
    return candidat.mots.every((m) => dedans.has(m));
  });
}
