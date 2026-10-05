/*
 * images.js — une image de couverture est-elle exploitable ? Fonction pure.
 * Mesuré le 2026-10-05 : Hardcover rend parfois une miniature de 98 px (illisible sur une grille de téléphone).
 * Sous 200 px de large, on préfère chercher mieux ailleurs (Open Library : ~300 px) et ne garder la miniature qu'en dernier recours.
 * Sans largeur connue, on fait confiance à l'image.
 */
export const LARGEUR_MIN = 200;

export const utilisable = (img) => Boolean(img?.url) && (!img.width || img.width >= LARGEUR_MIN);
export const petite = (img) => Boolean(img?.url) && !utilisable(img);
