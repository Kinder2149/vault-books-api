/*
 * Test B3 — Hardcover (API GraphQL) : séries, ordre des tomes, couvertures par ISBN.
 *   node prototype/tests/hardcover.mjs
 * Prérequis : HARDCOVER_API_KEY dans vault-books-api/.env (jamais dans le chat ni dans un fichier versionné).
 * Limite connue de l'API (à confirmer dans leur doc) : ~60 requêtes/minute → on reste sous 1 requête/seconde.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { appeler, pause, mediane, vert, rouge } from '../lib.mjs';

const CLE = (process.env.HARDCOVER_API_KEY || '').trim();
if (!CLE) { console.error('HARDCOVER_API_KEY absente de .env'); process.exit(1); }
// La clé est parfois fournie avec son préfixe « Bearer » : on accepte les deux.
const AUTH = /^bearer /i.test(CLE) ? CLE : `Bearer ${CLE}`;

async function gql(query, variables = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch('https://api.hardcover.app/v1/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: AUTH, 'user-agent': 'VaultBooksAPI-prototype/0.1' },
      body: JSON.stringify({ query, variables }),
    });
    const texte = await r.text();
    let json; try { json = JSON.parse(texte); } catch { json = { brut: texte.slice(0, 300) }; }
    return { status: r.status, ms: Date.now() - t0, ...json };
  } catch (e) { return { status: 0, ms: Date.now() - t0, erreur: e.message }; }
}
const resume = (r) => (r.errors ? `ERREUR ${JSON.stringify(r.errors).slice(0, 300)}` : r.erreur || r.brut || '');
const sortie = {};

// ---- 1. Ping
console.log('--- 1. Connexion ---');
const ping = await gql('query { me { id username } }');
sortie.ping = ping;
console.log(ping.status === 200 && !ping.errors ? vert(`OK (${ping.ms} ms)`) : rouge(`ÉCHEC statut ${ping.status} ${resume(ping)}`), JSON.stringify(ping.data || {}));
await pause(1100);

// ---- 2. Recherche par titre : séries et ordre
console.log('\n--- 2. Recherche (séries, auteurs, couvertures) ---');
sortie.recherches = {};
for (const q of ['game of thrones', 'le trone de fer', 'le seigneur des anneaux', "les chevaliers d'emeraude"]) {
  const r = await gql(`query ($q: String!) { search(query: $q, query_type: "Book", per_page: 6, page: 1) { results } }`, { q: q });
  sortie.recherches[q] = r;
  console.log(`\n« ${q} » → statut ${r.status}, ${r.ms} ms ${resume(r)}`);
  const hits = r.data?.search?.results?.hits || [];
  console.log(`   ${r.data?.search?.results?.found ?? '?'} résultats annoncés`);
  hits.forEach((h) => {
    const d = h.document || {};
    console.log(`   - ${d.title} | ${(d.author_names || []).slice(0, 2).join(', ')} | séries: ${(d.series_names || []).join(' ; ') || '—'} | image: ${d.image?.url ? 'oui' : 'non'} | lecteurs: ${d.users_count ?? d.users_read_count ?? '?'}`);
  });
  await pause(1100);
}

// ---- 3. Couvertures par ISBN-13 (lots de 15)
console.log('\n--- 3. Couvertures par ISBN (mêmes 94 ISBN que les tests B et B2) ---');
const base = JSON.parse(readFileSync(new URL('../out/couvertures.json', import.meta.url), 'utf8'));
const trouves = new Map();
let premiereErreur = null;
for (let i = 0; i < base.length; i += 15) {
  const lot = base.slice(i, i + 15).map((e) => e.isbn);
  const r = await gql(
    `query ($isbns: [String!]) { editions(where: {isbn_13: {_in: $isbns}}) { id isbn_13 title image { url width height } book { title } } }`,
    { isbns: lot });
  if (r.errors && !premiereErreur) { premiereErreur = resume(r); console.log(rouge(premiereErreur)); }
  (r.data?.editions || []).forEach((e) => trouves.set(e.isbn_13, e));
  console.log(`   lot ${i / 15 + 1} : ${(r.data?.editions || []).length} éditions trouvées (${r.ms} ms, statut ${r.status})`);
  await pause(1100);
}
sortie.editions = [...trouves.values()];
const SAGAS = [['got', 'Trône de fer'], ['lotr', 'Seigneur des anneaux'], ['emeraude', "Chevaliers d'Émeraude"]];
console.log('\n=== BILAN Hardcover ===');
for (const [id, nom] of SAGAS) {
  const l = base.filter((x) => x.saga === id);
  const connues = l.filter((x) => trouves.has(x.isbn));
  const avecImage = connues.filter((x) => trouves.get(x.isbn).image?.url);
  const p = (n) => `${Math.round((100 * n) / l.length)} %`;
  const ol = l.filter((x) => x.ol.ok).length;
  const union = l.filter((x) => x.ol.ok || trouves.get(x.isbn)?.image?.url).length;
  console.log(`${nom} (${l.length}) : édition connue ${p(connues.length)} | avec image ${p(avecImage.length)} | OL seul ${p(ol)} | OL + Hardcover ${p(union)}`);
}
writeFileSync(new URL('../out/hardcover.json', import.meta.url), JSON.stringify(sortie, null, 2));
