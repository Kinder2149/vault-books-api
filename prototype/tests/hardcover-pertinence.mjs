/*
 * Test C appliqué à Hardcover seul : sans notre tri, que rend leur recherche pour nos requêtes de référence ?
 *   node --env-file=.env prototype/tests/hardcover-pertinence.mjs
 * Critère : un résultat de l'auteur attendu dans les 3 premiers ; on note aussi le nombre de tomes de la série en tête.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pause, vert, rouge, jaune } from '../lib.mjs';

const CLE = (process.env.HARDCOVER_API_KEY || '').trim();
if (!CLE) { console.error('HARDCOVER_API_KEY absente de .env'); process.exit(1); }
const AUTH = /^bearer /i.test(CLE) ? CLE : `Bearer ${CLE}`;
const fix = JSON.parse(readFileSync(new URL('../fixtures/requetes.json', import.meta.url), 'utf8'));

const cas = [...fix.requetes.map((r) => ({ texte: r.texte, auteur: r.attendu.auteur, variante: r.variante || '' })),
  { texte: 'les chevaliers d\'emeraude tome 2', auteur: 'Robillard', variante: 'tome précis' },
  { texte: 'le hobbit', auteur: 'Tolkien', variante: 'titre FR' }];

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
let bons = 0; const rapport = [];
for (const c of cas) {
  const r = await fetch('https://api.hardcover.app/v1/graphql', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: AUTH, 'user-agent': 'VaultBooksAPI-prototype/0.1' },
    body: JSON.stringify({ query: 'query ($q: String!) { search(query: $q, query_type: "Book", per_page: 5, page: 1) { results } }', variables: { q: c.texte } }),
  });
  const j = await r.json().catch(() => ({}));
  const hits = (j.data?.search?.results?.hits || []).map((h) => h.document);
  const top3 = hits.slice(0, 3);
  const rang = hits.findIndex((d) => (d.author_names || []).some((a) => norm(a).includes(norm(c.auteur))));
  const ok = rang >= 0 && rang < 3;
  if (ok) bons += 1;
  console.log(`${ok ? vert('OK  ') : rouge('KO  ')} « ${c.texte} »${c.variante ? ` (${c.variante})` : ''} → auteur ${c.auteur} au rang ${rang >= 0 ? rang + 1 : 'absent'}`);
  top3.forEach((d, i) => console.log(`       ${i + 1}. ${String(d.title).slice(0, 70)} | ${(d.author_names || []).slice(0, 2).join(', ')} | lecteurs ${d.users_count ?? '?'}`));
  rapport.push({ ...c, ok, rang: rang + 1, top3: top3.map((d) => ({ titre: d.title, auteurs: d.author_names, lecteurs: d.users_count })) });
  await pause(1100);
}
console.log(`\nBilan : ${bons}/${cas.length} requêtes avec le bon auteur dans le top 3 (objectif proposé : 95 %).`);
writeFileSync(new URL('../out/hardcover-pertinence.json', import.meta.url), JSON.stringify(rapport, null, 2));
