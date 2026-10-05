/*
 * text.js — normalisation de comparaison. Fonctions pures, aucune dépendance.
 * Même idée que `comparable()` de Vault Read : minuscules, sans accents, ponctuation en espaces.
 */

const ARTICLES = new Set(['a', 'an', 'the', 'le', 'la', 'les', 'l', 'un', 'une', 'des']);

export function normaliser(texte) {
  return String(texte || '')
    .toLowerCase()
    .normalize('NFD')
    // Signes combinants (accents) écrits en échappement : invisibles à l'édition.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function mots(normalise) {
  return normalise ? normalise.split(' ').filter(Boolean) : [];
}

/** L'article de tête ne compte pas : personne ne le tape et les sources ne s'accordent pas dessus. */
export function sansArticle(normalise) {
  const m = mots(normalise);
  return m.length > 1 && ARTICLES.has(m[0]) ? m.slice(1).join(' ') : normalise;
}
