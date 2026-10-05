/*
 * images.js — une image de couverture est-elle exploitable ? Fonction pure.
 * Mesuré le 2026-10-05 : Hardcover rend parfois une miniature de 98 px (illisible sur une grille de téléphone).
 * Sous 200 px de large, on préfère chercher mieux ailleurs (Open Library : ~300 px) et ne garder la miniature qu'en dernier recours.
 * Sans largeur connue, on fait confiance à l'image.
 */
export const LARGEUR_MIN = 200;

export const utilisable = (img) => Boolean(img?.url) && (!img.width || img.width >= LARGEUR_MIN);
export const petite = (img) => Boolean(img?.url) && !utilisable(img);

/** Dimensions d'un JPEG, PNG ou GIF lues dans l'en-tête, sans dépendance. Rend null si l'image est illisible. */
export function dimensionsImage(buf) {
  try {
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) { i += 1; continue; }
        const marqueur = buf[i + 1];
        const longueur = buf.readUInt16BE(i + 2);
        if (marqueur >= 0xc0 && marqueur <= 0xcf && marqueur !== 0xc4 && marqueur !== 0xc8 && marqueur !== 0xcc) {
          return { h: buf.readUInt16BE(i + 5), l: buf.readUInt16BE(i + 7), format: 'jpeg' };
        }
        i += 2 + longueur;
      }
    }
    if (buf.slice(1, 4).toString() === 'PNG') return { l: buf.readUInt32BE(16), h: buf.readUInt32BE(20), format: 'png' };
    if (buf.slice(0, 3).toString() === 'GIF') return { l: buf.readUInt16LE(6), h: buf.readUInt16LE(8), format: 'gif' };
  } catch { /* image illisible */ }
  return null;
}
