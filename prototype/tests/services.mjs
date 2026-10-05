/*
 * Test A — santé des services et vérification des comportements dont on dépend.
 *   node prototype/tests/services.mjs
 * Chaque contrôle affiche OK / ÉCHEC et un détail. Ne modifie rien.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { appeler, mediane, pause, vert, rouge, jaune } from '../lib.mjs';

const RESULTATS = [];
function noter(service, nom, ok, detail) {
  RESULTATS.push({ service, nom, ok, detail });
  console.log(`${ok ? vert('OK    ') : rouge('ÉCHEC ')} [${service}] ${nom} — ${detail}`);
}

/** N appels identiques : taux de réussite + latences. */
async function sante(service, nom, url, n = 5, verif = (r) => r.status === 200, opts = {}) {
  const ms = []; let ok = 0; const statuts = [];
  for (let i = 0; i < n; i += 1) {
    const r = await appeler(url, opts);
    statuts.push(r.status || r.erreur);
    if (verif(r)) { ok += 1; ms.push(r.ms); }
    await pause(600);
  }
  const med = mediane(ms);
  const pire = ms.length ? Math.max(...ms) : null;
  // Seuils proposés : ≥ 95 % de réussite et médiane < 2 s (n=5 → 5/5 exigé).
  noter(service, nom, ok === n && med < 2000,
    `${ok}/${n} réussis, médiane ${med ?? '—'} ms, pire ${pire ?? '—'} ms, statuts [${statuts}]`);
}

const sru = (q, extra = '') => `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&recordSchema=dublincore&maximumRecords=${extra || 5}&query=${encodeURIComponent(q)}`;
const compter = (xml) => Number((String(xml).match(/<srw:numberOfRecords>(\d+)/) || [])[1] || 0);

console.log('\n--- BnF ---');
await sante('BnF', 'recherche par titre', sru('bib.title all "germinal" and bib.doctype any "a"'), 5,
  (r) => r.status === 200 && compter(r.corps) > 0);
{
  const avec = await appeler(sru('bib.title all "asterix" and bib.doctype any "a"'));
  const sans = await appeler(sru('bib.title all "asterix"'));
  noter('BnF', 'le filtre « texte imprimé » réduit bien les résultats', compter(sans.corps) > compter(avec.corps),
    `${compter(avec.corps)} avec filtre / ${compter(sans.corps)} sans`);
}
{
  // Piège connu de Vault Read : ISBN-13 ancien introuvable, ISBN-10 trouvé.
  const t13 = await appeler(sru('bib.isbn all "9782226052575"'));
  const t10 = await appeler(sru('bib.isbn all "2226052577"'));
  noter('BnF', 'ISBN-13 ancien introuvable mais ISBN-10 trouvé (piège confirmé)', compter(t13.corps) === 0 && compter(t10.corps) > 0,
    `ISBN-13 : ${compter(t13.corps)} notice(s), ISBN-10 : ${compter(t10.corps)} notice(s)`);
}

console.log('\n--- Open Library ---');
await sante('OpenLibrary', 'search.json', 'https://openlibrary.org/search.json?title=germinal&limit=3&fields=key,title,author_name', 5,
  (r) => r.status === 200 && JSON.parse(r.corps).docs?.length > 0);
{
  const sans = await appeler('https://openlibrary.org/search.json?title=game+of+thrones&limit=1&fields=key,title');
  const avec = await appeler('https://openlibrary.org/search.json?title=game+of+thrones&limit=1&fields=key,title,readinglog_count');
  const a = JSON.parse(sans.corps).docs?.[0]; const b = JSON.parse(avec.corps).docs?.[0];
  noter('OpenLibrary', '`readinglog_count` absent par défaut, présent si demandé', a?.readinglog_count === undefined && b?.readinglog_count !== undefined,
    `défaut: ${a?.readinglog_count}, demandé: ${b?.readinglog_count}`);
}
{
  const r = await appeler('https://covers.openlibrary.org/b/isbn/9780000000002-L.jpg?default=false', { binaire: true });
  noter('OpenLibrary', 'couverture inexistante → 404 avec default=false', r.status === 404, `statut ${r.status || r.erreur}`);
}

console.log('\n--- Google Books (sans clé) ---');
await sante('Google', 'volumes?q=isbn:', 'https://www.googleapis.com/books/v1/volumes?q=isbn:9782070612758&maxResults=3', 5,
  (r) => r.status === 200 && JSON.parse(r.corps).items?.length > 0);
{
  const r = await appeler('https://www.googleapis.com/books/v1/volumes?q=isbn:9782070612758&maxResults=3');
  const it = r.status === 200 ? JSON.parse(r.corps).items?.[0] : null;
  noter('Google', 'industryIdentifiers et imageLinks présents', Boolean(it?.volumeInfo?.industryIdentifiers && it?.volumeInfo?.imageLinks),
    it ? `titre « ${it.volumeInfo.title} »` : `statut ${r.status}`);
}

console.log('\n--- Wikidata ---');
await sante('Wikidata', 'recherche d\'entités', 'https://www.wikidata.org/w/api.php?action=wbsearchentities&search=Germinal&language=fr&format=json', 5,
  (r) => r.status === 200 && JSON.parse(r.corps).search?.length > 0);
await sante('Wikidata', 'SPARQL', `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent('SELECT ?x WHERE { ?x wdt:P31 wd:Q8261 } LIMIT 3')}`, 3,
  (r) => r.status === 200 && JSON.parse(r.corps).results?.bindings?.length > 0, { headers: { Accept: 'application/sparql-results+json' }, timeoutMs: 30000 });

const echecs = RESULTATS.filter((r) => !r.ok);
console.log(`\nBilan A : ${RESULTATS.length - echecs.length}/${RESULTATS.length} contrôles OK`);
if (echecs.length) console.log(jaune('À examiner : ') + echecs.map((e) => `[${e.service}] ${e.nom}`).join(' ; '));
mkdirSync(new URL('../out/', import.meta.url), { recursive: true });
writeFileSync(new URL('../out/services.json', import.meta.url), JSON.stringify(RESULTATS, null, 2));
