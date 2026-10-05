/*
 * Test B — couvertures : présence, qualité, association au bon ISBN.
 *   node prototype/tests/couvertures.mjs            (échantillon par défaut)
 *   node prototype/tests/couvertures.mjs --max 12   (échantillon BnF par saga)
 * Prérequis : avoir lancé prototype/mesure.mjs (il écrit prototype/out/<saga>.json).
 * Sortie : prototype/out/couvertures.json + planche-contact prototype/out/couvertures.html
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { appeler, dimensionsImage, mediane, pause, versIsbn13, vert, rouge } from '../lib.mjs';

const MAX = Number(process.argv[process.argv.indexOf('--max') + 1]) || 15;
const SAGAS = [
  { id: 'got', nom: 'Le Trône de fer' },
  { id: 'lotr', nom: 'Le Seigneur des anneaux' },
  { id: 'emeraude', nom: "Les Chevaliers d'Émeraude" },
];
const lire = (id) => JSON.parse(readFileSync(new URL(`../out/${id}.json`, import.meta.url), 'utf8'));

/** ISBN à tester : toutes les éditions Wikidata + un échantillon varié de la BnF. */
function echantillon(s) {
  const d = lire(s.id);
  const vus = new Map();
  const ajouter = (isbn, titre, editeur, origine) => {
    const i = versIsbn13(isbn);
    if (i && !vus.has(i)) vus.set(i, { isbn: i, titre, editeur, origine });
  };
  (d.wd.find((w) => w.serie)?.serie.editions || []).forEach((e) =>
    ajouter(e.isbn13?.value, e.edLabel?.value || e.workLabel?.value, e.pubLabel?.value, 'wikidata'));
  const bnf = (d.bnf?.notices || []).filter((n) => n.isbn);
  // pas régulier plutôt que les N premiers : évite de ne tester qu'un seul éditeur
  const pas = Math.max(1, Math.floor(bnf.length / MAX));
  bnf.filter((_, i) => i % pas === 0).slice(0, MAX)
    .forEach((n) => ajouter(n.isbn, n.titre, (n.editeur || '').replace(/\s*\(.*$/, ''), 'bnf'));
  return [...vus.values()];
}

async function image(url) {
  const r = await appeler(url, { binaire: true, timeoutMs: 20000 });
  if (r.status !== 200 || !r.corps?.length) return { ok: false, status: r.status || r.erreur };
  const dim = dimensionsImage(r.corps);
  // Une vraie couverture fait au moins ~200 px de large ; en dessous : vignette ou image fantôme.
  return { ok: Boolean(dim) && dim.l >= 200 && r.corps.length > 4000, status: 200, octets: r.corps.length, dim };
}

async function openLibrary(isbn) {
  return { url: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`,
    ...(await image(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`)) };
}

async function google(isbn) {
  let r;
  for (let essai = 0; essai < 4; essai += 1) {
    // Sans clé, Google refuse presque tout (429). Clé lue dans l'environnement, jamais écrite dans un fichier :
    //   $env:GOOGLE_BOOKS_API_KEY = '...' ; node prototype/tests/couvertures.mjs
    const cle = process.env.GOOGLE_BOOKS_API_KEY ? `&key=${process.env.GOOGLE_BOOKS_API_KEY}` : '';
    r = await appeler(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=5&printType=books${cle}`);
    if (r.status !== 503 && r.status !== 0) break;
    await pause(1500 * (essai + 1));
  }
  if (r.status === 429) return { ok: false, quota: true, status: 429 };
  if (r.status !== 200) return { ok: false, status: r.status || r.erreur };
  const items = JSON.parse(r.corps).items || [];
  // Le volume qui porte VRAIMENT cet ISBN (sinon Google rend un « meilleur » volume voisin).
  const exact = items.find((it) => (it.volumeInfo?.industryIdentifiers || []).some((x) => versIsbn13(x.identifier) === isbn));
  const vol = exact || items[0];
  if (!vol) return { ok: false, status: 200, aucunVolume: true };
  const liens = vol.volumeInfo?.imageLinks || {};
  const brut = liens.thumbnail || liens.smallThumbnail;
  const base = { titreGoogle: vol.volumeInfo?.title, isbnExact: Boolean(exact) };
  if (!brut) return { ...base, ok: false, status: 200, sansImage: true };
  const url = brut.replace(/^http:/, 'https:').replace(/zoom=\d/, 'zoom=2').replace(/&edge=curl/g, '');
  return { ...base, url, ...(await image(url)) };
}

const tout = [];
for (const s of SAGAS) {
  const liste = echantillon(s);
  console.log(`\n=== ${s.nom} : ${liste.length} ISBN testés ===`);
  let quota = false;
  for (const e of liste) {
    const ol = await openLibrary(e.isbn);
    await pause(500);
    const gg = quota ? { ok: false, saute: true } : await google(e.isbn);
    if (gg.quota) { quota = true; console.log(rouge('Quota Google atteint : arrêt des appels Google.')); }
    await pause(500);
    tout.push({ saga: s.id, ...e, ol, google: gg });
    console.log(`${e.isbn} ${(e.titre || '').slice(0, 38).padEnd(38)} OL ${ol.ok ? vert(`${ol.dim.l}x${ol.dim.h}`) : rouge(ol.status)}  Google ${gg.ok ? vert(`${gg.dim.l}x${gg.dim.h}`) : rouge(gg.status ?? 'x')}${gg.ok && !gg.isbnExact ? ' (volume voisin !)' : ''}`);
  }
}

// ---- Bilan
console.log('\n=== BILAN COUVERTURES ===');
for (const s of SAGAS) {
  const l = tout.filter((x) => x.saga === s.id);
  const pct = (n) => `${Math.round((100 * n) / l.length)} %`;
  const ol = l.filter((x) => x.ol.ok).length;
  const gg = l.filter((x) => x.google.ok).length;
  const au = l.filter((x) => x.ol.ok || x.google.ok).length;
  const voisin = l.filter((x) => x.google.ok && !x.google.isbnExact).length;
  console.log(`${s.nom} (${l.length} ISBN) : Open Library ${pct(ol)} | Google ${pct(gg)} | au moins une ${pct(au)} | aucune ${pct(l.length - au)} | Google via volume voisin ${voisin}`);
  console.log(`   largeur médiane : OL ${mediane(l.filter((x) => x.ol.ok).map((x) => x.ol.dim.l)) ?? '—'} px, Google ${mediane(l.filter((x) => x.google.ok).map((x) => x.google.dim.l)) ?? '—'} px`);
}
writeFileSync(new URL('../out/couvertures.json', import.meta.url), JSON.stringify(tout, null, 2));

// ---- Planche-contact : à regarder à l'œil (tome, éditeur, deux sources côte à côte)
const esc = (t) => String(t || '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const cellule = (r, nom) => (r.ok
  ? `<figure><img loading="lazy" src="${esc(r.url)}" alt=""><figcaption>${nom} ${r.dim.l}×${r.dim.h}${r.isbnExact === false ? ' ⚠ volume voisin' : ''}</figcaption></figure>`
  : `<figure class="vide"><div>—</div><figcaption>${nom} : ${esc(r.status ?? 'rien')}</figcaption></figure>`);
const html = `<!doctype html><meta charset="utf-8"><title>Planche-contact des couvertures</title>
<style>body{font:14px system-ui;margin:16px;background:#fafafa}h2{margin-top:32px}
.ligne{display:grid;grid-template-columns:230px 1fr;gap:12px;align-items:start;border-bottom:1px solid #ddd;padding:8px 0}
figure{display:inline-block;margin:0 10px 0 0;text-align:center}img{height:190px;border:1px solid #ccc}
.vide div{height:190px;width:125px;background:#eee;display:grid;place-items:center;color:#999}
figcaption{font-size:11px;color:#555}small{color:#666}</style>
<h1>Couvertures par ISBN — Open Library (gauche) et Google Books (droite)</h1>
<p>À juger à l'œil : est-ce la bonne couverture pour ce titre/éditeur ?</p>
${SAGAS.map((s) => `<h2>${esc(s.nom)}</h2>${tout.filter((x) => x.saga === s.id).map((x) => `
<div class="ligne"><div><b>${esc(x.titre)}</b><br><small>${esc(x.editeur)}<br>${x.isbn} · ${x.origine}</small>${x.google.titreGoogle ? `<br><small>Google : ${esc(x.google.titreGoogle)}</small>` : ''}</div>
<div>${cellule(x.ol, 'Open Library')}${cellule(x.google, 'Google')}</div></div>`).join('')}`).join('')}`;
writeFileSync(new URL('../out/couvertures.html', import.meta.url), html);
console.log('\nPlanche-contact : prototype/out/couvertures.html');
