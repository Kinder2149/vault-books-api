/*
 * Test C — pertinence et sagas, contre le VRAI service (sources réelles, cache mémoire).
 *   npm run test:c
 * Critères (plan de tests, §C) :
 *  1. le bon auteur est dans le top 3 ;
 *  2. quand la requête vise une saga, le 1er résultat est UNE carte « série » ;
 *  3. pour nos 3 sagas de référence : tomes entiers disponibles dans la langue = tomes attendus (fixtures/sagas.json).
 * Compte environ 2 appels Hardcover par recherche : on espace les requêtes pour rester sous 60/minute.
 */
import { readFileSync } from 'node:fs';
import { obtenirApp } from '../src/app.js';
import { normaliser } from '../src/text.js';

const vert = (t) => `\x1b[32m${t}\x1b[0m`;
const rouge = (t) => `\x1b[31m${t}\x1b[0m`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const fix = (n) => JSON.parse(readFileSync(new URL(`../prototype/fixtures/${n}.json`, import.meta.url), 'utf8'));
const { service } = obtenirApp();

const requetes = fix('requetes').requetes;
let bons = 0;
console.log('=== C1 : recherche (lang=fr) ===');
for (const q of requetes) {
  const r = await service.rechercher(q.texte, 'fr');
  const top = r.resultats.slice(0, 3);
  const auteurOk = top.some((c) => c.auteurs.some((a) => normaliser(a).includes(normaliser(q.attendu.auteur))));
  const typeOk = q.attendu.type !== 'saga' || top[0]?.type === 'serie';
  const ok = auteurOk && typeOk;
  if (ok) bons += 1;
  console.log(`${ok ? vert('OK  ') : rouge('KO  ')} « ${q.texte} »${q.variante ? ` (${q.variante})` : ''} — attendu ${q.attendu.auteur}/${q.attendu.type}`
    + `${auteurOk ? '' : ' [auteur absent du top 3]'}${typeOk ? '' : ' [pas une carte saga en tête]'}`);
  top.forEach((c, i) => console.log(`       ${i + 1}. [${c.type}] ${c.titre} | ${c.auteurs.slice(0, 2).join(', ')} | ${c.tomes ? `${c.tomes} tomes | ` : ''}score ${c.score}`));
  await pause(2200);
}
console.log(`\nC1 : ${bons}/${requetes.length} requêtes OK (objectif 95 %)\n`);

console.log('=== C2 : sagas complètes et dans l\'ordre (lang=fr) ===');
const sagas = fix('sagas').sagas;
let sagasOk = 0;
for (const s of sagas) {
  const r = await service.rechercher(s.requetes[0], 'fr');
  const carte = r.resultats.find((c) => c.type === 'serie');
  if (!carte) { console.log(rouge(`KO  ${s.id} : aucune carte saga pour « ${s.requetes[0]} »`)); continue; }
  await pause(2200);
  const detail = await service.serie(carte.id, 'fr');
  const entiers = detail.tomes;
  const dispos = entiers.filter((t) => t.disponible);
  const ordre = entiers.every((t, i) => i === 0 || t.position > entiers[i - 1].position);
  const nbParties = entiers.reduce((n, t) => n + t.parties.length, 0);
  const ok = dispos.length >= s.tomesAttendus && ordre;
  if (ok) sagasOk += 1;
  console.log(`${ok ? vert('OK  ') : rouge('KO  ')} ${s.id} — « ${detail.nom} » : ${dispos.length}/${s.tomesAttendus} tomes disponibles en fr, ordre ${ordre ? 'correct' : 'FAUX'}, ${nbParties} volume(s) coupé(s), ${detail.horsSerie.length} hors-série`);
  const ligne = (t, marque) => `${String(t.position).padStart(4)} ${marque} ${t.titre.slice(0, 44).padEnd(44)} ${t.edition ? `${t.edition.editeur || '?'} | ${t.edition.isbn13 || '-'}` : (t.viaParties ? '— en volumes coupés' : '— indisponible en fr')} | couv ${t.couverture ? 'oui' : 'NON'}`;
  detail.tomes.slice(0, 8).forEach((t) => {
    console.log(`       ${ligne(t, '       ')}`);
    t.parties.forEach((p) => console.log(`       ${ligne(p, '  └ vol.')}`));
  });
  await pause(2200);
}
console.log(`\nC2 : ${sagasOk}/${sagas.length} sagas conformes`);
