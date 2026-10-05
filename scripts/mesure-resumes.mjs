/*
 * Mesure : Hardcover fournit-il un RÉSUMÉ exploitable, et dans quelle langue ? (décision : l'ajouter ou non aux routes /books et /isbn)
 *   node --env-file=.env scripts/mesure-resumes.mjs
 * Pour chaque requête du jeu français, on lit le premier résultat de la recherche (qui porte déjà `description`, sans requête de plus).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { creerHardcover } from '../src/sources/hardcover.js';
import { normaliser, mots } from '../src/text.js';

const hc = creerHardcover({ cle: process.env.HARDCOVER_API_KEY });
const { requetes } = JSON.parse(readFileSync(new URL('../test/fixtures-pertinence/requetes-fr.json', import.meta.url), 'utf8'));

const FR = new Set(['le', 'la', 'les', 'des', 'du', 'de', 'un', 'une', 'et', 'est', 'qui', 'que', 'dans', 'pour', 'sur', 'avec', 'son', 'sa', 'ses', 'au', 'aux', 'par', 'il', 'elle', 'ne', 'pas', 'se', 'ce', 'cette']);
const EN = new Set(['the', 'of', 'and', 'a', 'to', 'in', 'is', 'that', 'it', 'with', 'for', 'as', 'was', 'his', 'her', 'he', 'she', 'on', 'by', 'an', 'this', 'from', 'but', 'are', 'who']);
function langue(texte) {
  const m = mots(normaliser(texte));
  const fr = m.filter((x) => FR.has(x)).length;
  const en = m.filter((x) => EN.has(x)).length;
  return fr > en * 1.3 ? 'fr' : (en > fr * 1.3 ? 'en' : 'incertain');
}

const vus = new Set();
const lignes = [];
for (const q of requetes) {
  const docs = await hc.rechercher(q.texte, 1);
  const d = docs[0];
  if (!d || vus.has(d.id)) continue;
  vus.add(d.id);
  const desc = String(d.description || '').trim();
  lignes.push({ requete: q.texte, titre: d.title, lecteurs: d.users_count, longueur: desc.length, langue: desc.length > 80 ? langue(desc) : null });
}

const total = lignes.length;
const avec = lignes.filter((l) => l.longueur > 80);
const parLangue = (code) => avec.filter((l) => l.langue === code).length;
const pct = (n, sur) => `${Math.round((100 * n) / sur)} %`;
console.log(`\n${total} livres examinés (premier résultat de chaque requête du jeu français)`);
console.log(`  avec un résumé exploitable (> 80 caractères) : ${avec.length}/${total} (${pct(avec.length, total)})`);
console.log(`  en français : ${parLangue('fr')} (${pct(parLangue('fr'), total)}) · en anglais : ${parLangue('en')} (${pct(parLangue('en'), total)}) · incertain : ${parLangue('incertain')}`);
console.log(`  sans résumé : ${total - avec.length}`);
lignes.filter((l) => l.longueur <= 80).slice(0, 8).forEach((l) => console.log(`     sans résumé : ${l.titre} (${l.lecteurs} lecteurs)`));
mkdirSync(new URL('../sorties/', import.meta.url), { recursive: true });
writeFileSync(new URL('../sorties/mesure-resumes.json', import.meta.url), JSON.stringify({ date: new Date().toISOString(), total, lignes }, null, 2));
