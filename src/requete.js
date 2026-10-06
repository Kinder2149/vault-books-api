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

const PARASITES = new Set(['integrale', 'integral', 'coffret', 'box', 'boxset', 'set', 'omnibus', 'complet', 'complete', 'saga', 'trilogie', 'tetralogie', 'cycle', 'serie', 'collection', 'edition', 'poche', 'livre', 'roman']);
const MOT_TOME = new Set(['tome', 'tomes', 'volume', 'vol', 't']);
const NUMERO = /^(\d{1,3}|[ivx]{1,4})$/;

/**
 * La requête sans les mots qui décrivent l'objet plutôt que le titre : « intégrale », « coffret », « tome 2 », « saga »… en tête ou en fin.
 * « le seigneur des anneaux intégrale » → « le seigneur des anneaux » (Hardcover ne rend rien avec le mot de trop). Un mot du milieu n'est jamais
 * touché (« la saga des gardiens »), on ne vide jamais la requête, et null dit « rien à retirer ».
 */
export function sansMotsParasites(texte) {
  const m = mots(normaliser(texte));
  const reste = [...m];
  while (reste.length > 1) {
    const dernier = reste[reste.length - 1];
    if (NUMERO.test(dernier) && reste.length > 2 && MOT_TOME.has(reste[reste.length - 2])) reste.splice(-2, 2);
    else if (PARASITES.has(dernier) || MOT_TOME.has(dernier)) reste.pop();
    else break;
  }
  while (reste.length > 1 && (PARASITES.has(reste[0]) || MOT_TOME.has(reste[0]))) reste.shift();
  const tousParasites = reste.every((w) => PARASITES.has(w) || MOT_TOME.has(w));
  return !tousParasites && reste.length < m.length ? reste.join(' ') : null;
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

const VOYELLES = new Set(['a', 'e', 'i', 'o', 'u', 'y']);

/** Les graphies voisines d'un mot, de la plus probable à la moins probable (sans doublon, sans le mot lui-même). */
export function variantesDeMot(mot) {
  const v = [];
  const ajouter = (m) => { if (m !== mot && !v.includes(m)) v.push(m); };
  const lettres = [...mot];
  // 1. La consonne DOUBLÉE oubliée, entre deux voyelles (« hary » → « harry », « poter » → « potter », « aneau » → « anneau »).
  for (let i = 1; i < lettres.length - 1; i += 1) {
    if (!VOYELLES.has(lettres[i]) && VOYELLES.has(lettres[i - 1]) && VOYELLES.has(lettres[i + 1]) && /[a-z]/.test(lettres[i])) {
      ajouter(lettres.slice(0, i + 1).join('') + lettres.slice(i).join(''));
    }
  }
  // 2. Une consonne doublée à tort (« harrry » → « harry »).
  for (let i = 1; i < lettres.length; i += 1) if (lettres[i] === lettres[i - 1] && !VOYELLES.has(lettres[i])) ajouter(lettres.slice(0, i).join('') + lettres.slice(i + 1).join(''));
  // 3. i/y confondus (« harri » → « harry »), en fin de mot ou entre consonnes.
  for (let i = 0; i < lettres.length; i += 1) {
    if (lettres[i] === 'i' || lettres[i] === 'y') ajouter(lettres.slice(0, i).join('') + (lettres[i] === 'i' ? 'y' : 'i') + lettres.slice(i + 1).join(''));
  }
  // 4. Deux lettres inversées à l'intérieur du mot (« hrary »).
  for (let i = 1; i < lettres.length - 2; i += 1) if (lettres[i] !== lettres[i + 1]) ajouter(lettres.slice(0, i).join('') + lettres[i + 1] + lettres[i] + lettres.slice(i + 2).join(''));
  return v;
}

/**
 * Les requêtes à essayer quand Hardcover ne reconnaît rien : la requête avec UN mot corrigé à la fois (il ne tolère qu'une faute par requête, mesuré
 * le 2026-10-06 : « harry poter » passe, « hary poter » et « hary potter » non). Les mots courts (≤ 2 lettres) ne sont pas touchés.
 * @returns {{requete: string, mot: number, variante: string}[]} au plus `max`, les corrections les plus probables d'abord
 */
export function variantesDeFaute(texte, max = 8) {
  const m = mots(normaliser(texte));
  const rangs = [];
  m.forEach((mot, i) => {
    if (mot.length <= 2 || NUMERO.test(mot)) return;
    variantesDeMot(mot).forEach((variante, r) => rangs.push({ r, i, variante }));
  });
  return rangs.sort((a, b) => a.r - b.r || a.i - b.i).slice(0, max)
    .map(({ i, variante }) => ({ requete: m.map((x, j) => (j === i ? variante : x)).join(' '), mot: i, variante }));
}
