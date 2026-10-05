/*
 * Test B4 — Hardcover : les séries et l'ORDRE des tomes pour nos sagas.
 *   node prototype/tests/hardcover-series.mjs
 */
import { writeFileSync } from 'node:fs';
import { pause, vert, rouge } from '../lib.mjs';

const CLE = (process.env.HARDCOVER_API_KEY || '').trim();
if (!CLE) { console.error('HARDCOVER_API_KEY absente de .env'); process.exit(1); }
const AUTH = /^bearer /i.test(CLE) ? CLE : `Bearer ${CLE}`;

async function gql(query, variables = {}) {
  const r = await fetch('https://api.hardcover.app/v1/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: AUTH, 'user-agent': 'VaultBooksAPI-prototype/0.1' },
    body: JSON.stringify({ query, variables }),
  });
  const t = await r.text();
  try { return { status: r.status, ...JSON.parse(t) }; } catch { return { status: r.status, brut: t.slice(0, 200) }; }
}

const NOMS = ['A Song of Ice and Fire', 'The Lord of the Rings', 'Le Seigneur des Anneaux', "Les Chevaliers d'Émeraude"];
const sortie = {};
for (const nom of NOMS) {
  const r = await gql(`query ($n: String!) {
    series(where: {name: {_eq: $n}}, limit: 5, order_by: {books_count: desc}) {
      id name books_count primary_books_count
      author { name }
      book_series(order_by: {position: asc}) { position featured book { id title users_count } }
    } }`, { n: nom });
  sortie[nom] = r;
  console.log(`\n=== « ${nom} » ===`);
  if (r.errors) { console.log(rouge(`ERREUR ${JSON.stringify(r.errors).slice(0, 400)}`)); await pause(1100); continue; }
  const liste = r.data?.series || [];
  if (!liste.length) console.log('Aucune série trouvée.');
  for (const s of liste) {
    console.log(`Série #${s.id} « ${s.name} » — ${s.author?.name || '?'} — ${s.books_count} livres (${s.primary_books_count} principaux)`);
    // On n'affiche que les tomes numérotés, dans l'ordre ; le reste (coffrets, intégrales sans position) est compté.
    const num = (s.book_series || []).filter((b) => b.position !== null);
    const sans = (s.book_series || []).length - num.length;
    num.slice(0, 16).forEach((b) => console.log(`   ${String(b.position).padStart(4)} | ${b.book.title} | lecteurs ${b.book.users_count ?? '?'}${b.featured ? '' : ' (hors liste principale)'}`));
    if (num.length > 16) console.log(`   … ${num.length - 16} autres numérotés`);
    if (sans) console.log(`   (${sans} entrées sans numéro)`);
  }
  await pause(1100);
}
writeFileSync(new URL('../out/hardcover-series.json', import.meta.url), JSON.stringify(sortie, null, 2));

