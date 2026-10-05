/* isbn.js — ISBN : validation, conversion, extraction depuis un texte libre. Fonctions pures. */

function cle13(douze) {
  let s = 0;
  for (let i = 0; i < 12; i += 1) s += Number(douze[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (s % 10)) % 10);
}

function cle10(neuf) {
  let s = 0;
  for (let i = 0; i < 9; i += 1) s += (10 - i) * Number(neuf[i]);
  const r = (11 - (s % 11)) % 11;
  return r === 10 ? 'X' : String(r);
}

export function isbn10Vers13(isbn10) {
  const s = String(isbn10 || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (s.length !== 10 || cle10(s.slice(0, 9)) !== s[9]) return null;
  const corps = `978${s.slice(0, 9)}`;
  return corps + cle13(corps);
}

export function isbn13Vers10(isbn13) {
  const s = String(isbn13 || '').replace(/[^0-9]/g, '');
  if (s.length !== 13 || !s.startsWith('978')) return null;
  return s.slice(3, 12) + cle10(s.slice(3, 12));
}

/** ISBN-13 valide (clé de contrôle comprise), à partir d'un ISBN-10 ou 13 écrit n'importe comment. Sinon null. */
export function versIsbn13(brut) {
  const s = String(brut || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (s.length === 13) return cle13(s.slice(0, 12)) === s[12] ? s : null;
  if (s.length === 10) return isbn10Vers13(s);
  return null;
}

/**
 * Le PREMIER ISBN d'un texte libre de la BnF : « ISBN 978-2-290-01943-6 (br.) : 6 EUR ».
 * Les chiffres du prix ne doivent pas se coller à l'ISBN : on lit un seul jeton de chiffres et de tirets.
 */
export function extraireIsbn13(texte) {
  const m = String(texte || '').match(/\d[\d-]{8,16}[\dXx]/);
  return m ? versIsbn13(m[0]) : null;
}
