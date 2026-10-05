/*
 * resume.js — nettoyer et qualifier le résumé d'un livre (champ `description` de Hardcover). Fonctions pures.
 * Mesuré le 2026-10-05 (scripts/mesure-resumes.mjs) : 74 % des livres du jeu français ont un résumé, mais 10 % seulement en français,
 * 64 % en anglais. On rend donc le résumé AVEC sa langue : l'application décide (Vault Read préfère un résumé anglais à un vide, sans traduire).
 */
import { normaliser, mots } from './text.js';

const LONGUEUR_MAX = 1500;
const LONGUEUR_MIN = 80;   // en dessous, ce n'est pas un résumé (« Roman. », une mention d'éditeur)

const FR = new Set(['le', 'la', 'les', 'des', 'du', 'de', 'un', 'une', 'et', 'est', 'qui', 'que', 'dans', 'pour', 'sur', 'avec', 'son', 'sa', 'ses', 'au', 'aux', 'par', 'il', 'elle', 'ne', 'pas', 'se', 'ce', 'cette']);
const EN = new Set(['the', 'of', 'and', 'a', 'to', 'in', 'is', 'that', 'it', 'with', 'for', 'as', 'was', 'his', 'her', 'he', 'she', 'on', 'by', 'an', 'this', 'from', 'but', 'are', 'who']);

/** Texte brut : balises et entités HTML retirées, espaces réduits, coupé proprement à 1 500 caractères. Rend null si trop court. */
export function nettoyerResume(brut) {
  if (!brut) return null;
  let t = String(brut)
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length < LONGUEUR_MIN) return null;
  if (t.length > LONGUEUR_MAX) {
    const coupe = t.slice(0, LONGUEUR_MAX);
    const fin = Math.max(coupe.lastIndexOf('. '), coupe.lastIndexOf('! '), coupe.lastIndexOf('? '));
    t = `${fin > LONGUEUR_MAX * 0.6 ? coupe.slice(0, fin + 1) : coupe.replace(/\s+\S*$/, '')}…`;
  }
  return t;
}

/** 'fr', 'en', ou null quand on ne peut pas trancher (texte court, mêlé, autre langue). */
export function langueResume(texte) {
  if (!texte) return null;
  const m = mots(normaliser(texte));
  const fr = m.filter((x) => FR.has(x)).length;
  const en = m.filter((x) => EN.has(x)).length;
  if (fr + en < 4) return null;
  if (fr > en * 1.3) return 'fr';
  if (en > fr * 1.3) return 'en';
  return null;
}
