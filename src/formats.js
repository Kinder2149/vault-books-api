/*
 * formats.js — ce qu'une édition EST (papier, poche, numérique, audio) et si ses pages sont crédibles. Fonctions pures.
 *
 * Hardcover décrit le format en texte libre (« Mass Market Paperback », « Kindle Edition », « Audible Audio »…), parfois vide, parfois faux
 * (mesuré le 2026-10-06 sur Harry Potter 1 : des « MP3 CD » rangés en lecture, 90 éditions sans format). Trois indices, dans l'ordre :
 * la durée audio, le format de lecture (Listened / Ebook), puis le texte.
 */

export const FORMATS = ['papier', 'poche', 'numerique', 'audio'];

// Les noms de format audio vus chez Hardcover : la requête de choix d'édition les écarte tels quels (voir sources/hardcover.js).
export const FORMATS_AUDIO = ['Audiobook', 'Audible', 'Audio CD', 'Audible Audio', 'Unabridged Audiobook', 'Audio Cassette', 'MP3 CD', 'Audio', 'Audio Download', 'CD', 'Cassette'];

const AUDIO = /audio|\bcd\b|mp3|cassette|listen/i;
const NUMERIQUE = /e-?book|kindle|epub|kobo|digital|pdf|numérique|numerique/i;
const POCHE = /mass market|pocket|poche|j'ai lu|folio/i;
const PAPIER = /paperback|hardcover|hardback|broch|reli|library binding|board book|spiral|cartonn|print/i;

/**
 * @param {{edition_format?: string|null, reading_format?: {format?: string}|null, audio_seconds?: number|null}} e une édition Hardcover
 * @returns {'papier'|'poche'|'numerique'|'audio'|null} null quand rien ne permet de trancher
 */
export function formatNormalise(e) {
  if (!e) return null;
  const texte = String(e.edition_format || '');
  const lecture = e.reading_format?.format || null;
  if (Number(e.audio_seconds) > 0 || lecture === 'Listened' || AUDIO.test(texte)) return 'audio';
  if (lecture === 'Ebook' || NUMERIQUE.test(texte)) return 'numerique';
  if (POCHE.test(texte)) return 'poche';
  if (PAPIER.test(texte)) return 'papier';
  return null;
}

/** Rang pour choisir « la » édition d'un livre : le papier avant le numérique, l'audio en dernier recours. */
export const rangFormat = (f) => ({ papier: 0, poche: 0, null: 1, numerique: 2, audio: 3 }[String(f)] ?? 1);

const PAGES_MIN = 30;     // « Le Feu dans le ciel » : 11 pages chez Hardcover (valeur de formulaire, pas un livre)
const PAGES_MAX = 3500;

/** Un nombre de pages crédible pour un livre, sinon null. Hardcover y a mis des 0, des 1, des numéros de tome. Jamais de pages pour de l'audio. */
export function pagesPlausibles(pages, format = null) {
  const n = Number(pages);
  if (format === 'audio' || !Number.isFinite(n) || n < PAGES_MIN || n > PAGES_MAX) return null;
  return Math.round(n);
}
