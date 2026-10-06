/*
 * resume.js — nettoyer et qualifier le résumé d'un livre (champ `description` de Hardcover). Fonctions pures.
 * Mesuré le 2026-10-05 (scripts/mesure-resumes.mjs) : 74 % des livres du jeu français ont un résumé, mais 10 % seulement en français,
 * 64 % en anglais. Hardcover ne garde qu'UN texte par livre, et la BnF n'en fournit pas (vérifié le 2026-10-06 : aucune zone « résumé »).
 *
 * Règle de la bibliothèque bilingue : un résumé n'est rendu QUE dans la langue demandée. Dans une autre langue, ou mêlé de deux langues, il est
 * absent (`resumePourLangue`) : on ne mélange jamais. Il est rendu nettoyé : ni balise, ni Markdown, ni lien, ni renvoi de note.
 */
import { normaliser, mots } from './text.js';

const LONGUEUR_MAX = 1500;
const LONGUEUR_MIN = 80;   // en dessous, ce n'est pas un résumé (« Roman. », une mention d'éditeur)

// Petits mots de chaque langue. Un mot partagé (« la », « de ») compte pour chacune : c'est l'ensemble qui tranche.
const MOTS = {
  fr: ['le', 'la', 'les', 'des', 'du', 'de', 'un', 'une', 'et', 'est', 'qui', 'que', 'dans', 'pour', 'sur', 'avec', 'son', 'sa', 'ses', 'au', 'aux', 'par', 'il', 'elle', 'ne', 'pas', 'se', 'ce', 'cette', 'sont', 'ont', 'mais', 'leur', 'nous', 'vous'],
  en: ['the', 'of', 'and', 'a', 'to', 'in', 'is', 'that', 'it', 'with', 'for', 'as', 'was', 'his', 'her', 'he', 'she', 'on', 'by', 'an', 'this', 'from', 'but', 'are', 'who', 'their', 'they', 'has', 'have', 'will'],
  es: ['el', 'los', 'las', 'y', 'en', 'con', 'por', 'para', 'una', 'es', 'se', 'del', 'al', 'lo', 'su', 'como', 'pero', 'que', 'de', 'la', 'un'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'ein', 'eine', 'zu', 'den', 'von', 'auf', 'fur', 'dem', 'sich', 'des', 'im', 'auch', 'sie', 'er'],
  it: ['il', 'di', 'che', 'e', 'per', 'un', 'una', 'con', 'non', 'della', 'nel', 'sono', 'gli', 'le', 'la', 'del', 'si', 'da', 'lo', 'dei'],
  pt: ['o', 'os', 'as', 'um', 'uma', 'nao', 'com', 'para', 'do', 'da', 'dos', 'em', 'que', 'de', 'se', 'por', 'mais', 'uma'],
};
const ENSEMBLES = Object.fromEntries(Object.entries(MOTS).map(([l, m]) => [l, new Set(m)]));

/**
 * Texte brut : balises HTML, Markdown (gras, titres, listes de liens, séparateurs), adresses et renvois de notes retirés,
 * espaces réduits, coupé proprement à 1 500 caractères. Rend null si trop court.
 */
export function nettoyerResume(brut) {
  if (!brut) return null;
  let t = String(brut)
    // HTML
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\r\n?/g, '\n')
    // Markdown : définitions de liens « [1]: http… », liens « [texte](url) » et « [texte][1] », renvois « [1] »
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')
    .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/\[\d{1,3}\]/g, '')
    // parenthèses qui ne contenaient qu'une source ou un lien : « ([Source][1]) », « (source: http…) »
    .replace(/\(\s*(?:source|sources|see|voir)\b[^)]*\)/gi, '')
    // adresses nues
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '')
    // titres, citations, séparateurs
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*(?:[-*_]\s*){3,}$/gm, '')
    // gras, italique, code (les astérisques isolés au milieu d'un mot ne sont pas touchés)
    .replace(/(\*\*|__)(.+?)\1/gs, '$2')
    .replace(/(^|[\s(])\*(\S[^*\n]*?)\*(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/(^|[\s(])_(\S[^_\n]*?)_(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1')
    // listes à puces : on garde le texte, sans le signe
    .replace(/^\s*[-*•]\s+/gm, '')
    // astérisques et soulignés orphelins laissés par un balisage cassé
    .replace(/\*{2,}|_{2,}/g, '')
    .replace(/[ \t]+/g, ' ').replace(/ ([.,])/g, '$1').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length < LONGUEUR_MIN) return null;
  if (t.length > LONGUEUR_MAX) {
    const coupe = t.slice(0, LONGUEUR_MAX);
    const fin = Math.max(coupe.lastIndexOf('. '), coupe.lastIndexOf('! '), coupe.lastIndexOf('? '));
    t = `${fin > LONGUEUR_MAX * 0.6 ? coupe.slice(0, fin + 1) : coupe.replace(/\s+\S*$/, '')}…`;
  }
  return t;
}

/**
 * 'fr', 'en', 'es', 'de', 'it', 'pt', ou null quand on ne peut pas trancher (texte court, mêlé de deux langues).
 * La langue gagnante doit dépasser la 2e de 30 %.
 */
export function langueResume(texte) {
  if (!texte) return null;
  const m = mots(normaliser(texte));
  const scores = Object.entries(ENSEMBLES).map(([l, e]) => [l, m.filter((x) => e.has(x)).length]).sort((a, b) => b[1] - a[1]);
  const [premiere, seconde] = scores;
  if (premiere[1] < 4) return null;
  return premiere[1] > seconde[1] * 1.3 ? premiere[0] : null;
}

/**
 * Le résumé à rendre pour une langue : nettoyé, et seulement s'il est écrit dans CETTE langue. Un texte anglais pour une demande française,
 * ou un texte mêlé, est absent (mieux vaut rien qu'un mélange : l'application peut lire l'autre langue dans la réponse bilingue).
 * @returns {{resume: string|null, resumeLangue: string|null}} `resumeLangue` : la langue du texte rendu
 */
export function resumePourLangue(brut, lang) {
  const propre = nettoyerResume(brut);
  const langue = langueResume(propre);
  return propre && langue === lang ? { resume: propre, resumeLangue: langue } : { resume: null, resumeLangue: null };
}
