/*
 * Test B2 — autres sources de couvertures, sur les mêmes ISBN que le test B.
 *   node prototype/tests/couvertures-autres.mjs
 * Sources : service de couvertures de la BnF (via l'ark de la notice), Amazon (ancienne URL par ISBN-10, mesure seule :
 * conditions d'usage à ne pas supposer), et Open Library (rappel).
 * Une image dont l'empreinte revient ≥ 3 fois est un « remplaçant » (image générique), jamais une couverture.
 * Sortie : prototype/out/couvertures2.json + couvertures2.html
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { appeler, dimensionsImage, pause, mediane, vert, rouge } from '../lib.mjs';

const base = JSON.parse(readFileSync(new URL('../out/couvertures.json', import.meta.url), 'utf8'));

const sru = (q) => `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&recordSchema=dublincore&maximumRecords=1&query=${encodeURIComponent(q)}`;
function isbn13vers10(s) {
  if (!s.startsWith('978')) return null;
  const c = s.slice(3, 12);
  let t = 0;
  for (let i = 0; i < 9; i += 1) t += (10 - i) * Number(c[i]);
  const r = (11 - (t % 11)) % 11;
  return c + (r === 10 ? 'X' : String(r));
}
const arkDe = (xml) => (String(xml).match(/ark:\/12148\/cb[0-9a-z]+/) || [])[0] || null;

/*
 * Rend l'ark, null (la BnF n'a pas la notice) ou { panne } (la BnF ne répond pas).
 * Distinction indispensable : un premier essai a pris des coupures réseau (ECONNRESET, la BnF
 * coupe la connexion quand on l'enchaîne trop vite) pour des « notices absentes ».
 */
async function ark(isbn13) {
  for (const forme of [isbn13, isbn13vers10(isbn13)].filter(Boolean)) {
    let r;
    for (let essai = 0; essai < 3; essai += 1) {
      r = await appeler(sru(`bib.isbn all "${forme}"`));
      if (r.status === 200) break;
      await pause(4000 * (essai + 1));
    }
    if (r.status !== 200) return { panne: r.erreur || `HTTP ${r.status}` };
    const a = arkDe(r.corps);
    if (a) return a;
    await pause(1200);
  }
  return null;
}

async function image(url) {
  const r = await appeler(url, { binaire: true, timeoutMs: 20000 });
  if (r.status !== 200 || !r.corps?.length) return { ok: false, status: r.status || r.erreur };
  const dim = dimensionsImage(r.corps);
  const empreinte = createHash('md5').update(r.corps).digest('hex').slice(0, 10);
  return { ok: Boolean(dim) && dim.l >= 150 && r.corps.length > 3000, status: 200, octets: r.corps.length, dim, empreinte, url };
}

const lignes = [];
let panneBnf = 0;
for (const e of base) {
  const a = await ark(e.isbn);
  if (a?.panne) panneBnf += 1;
  const bnf = typeof a === 'string'
    ? await image(`https://catalogue.bnf.fr/couverture?&appName=NE&idArk=${a}&couverture=1`)
    : { ok: false, status: a?.panne ? `BnF injoignable (${a.panne})` : 'pas de notice' };
  await pause(1200);
  const dix = isbn13vers10(e.isbn);
  const amz = dix ? await image(`https://images-na.ssl-images-amazon.com/images/P/${dix}.01.LZZZZZZZ.jpg`) : { ok: false, status: 'pas d\'ISBN-10' };
  await pause(300);
  lignes.push({ saga: e.saga, isbn: e.isbn, titre: e.titre, editeur: e.editeur, ark: typeof a === 'string' ? a : null, ol: e.ol, bnf, amazon: amz });
  const f = (r) => (r.ok ? vert(`${r.dim.l}x${r.dim.h}`) : rouge(r.status));
  console.log(`${e.isbn} ${(e.titre || '').slice(0, 30).padEnd(30)} OL ${f(e.ol)} | BnF ${f(bnf)} | Amazon ${f(amz)}`);
}

// Remplaçants : même empreinte ≥ 3 fois
const compte = {};
lignes.forEach((l) => ['bnf', 'amazon'].forEach((s) => { const h = l[s].empreinte; if (h) compte[h] = (compte[h] || 0) + 1; }));
lignes.forEach((l) => ['bnf', 'amazon'].forEach((s) => {
  if (l[s].empreinte && compte[l[s].empreinte] >= 3) { l[s].ok = false; l[s].remplacant = true; l[s].status = 'image générique'; }
}));

if (panneBnf) console.log(rouge(`\n/!\\ La BnF n'a pas répondu pour ${panneBnf}/${lignes.length} ISBN : la colonne BnF est PARTIELLE, relancer plus tard.`));
console.log('\n=== BILAN (hors images génériques) ===');
const SAGAS = [['got', 'Trône de fer'], ['lotr', 'Seigneur des anneaux'], ['emeraude', "Chevaliers d'Émeraude"]];
for (const [id, nom] of SAGAS) {
  const l = lignes.filter((x) => x.saga === id);
  const p = (n) => `${Math.round((100 * n) / l.length)} %`;
  const o = l.filter((x) => x.ol.ok).length;
  const b = l.filter((x) => x.bnf.ok).length;
  const z = l.filter((x) => x.amazon.ok).length;
  const un = l.filter((x) => x.ol.ok || x.bnf.ok || x.amazon.ok).length;
  const unSansAmazon = l.filter((x) => x.ol.ok || x.bnf.ok).length;
  console.log(`${nom} (${l.length}) : OL ${p(o)} | BnF ${p(b)} | Amazon ${p(z)} | OL+BnF ${p(unSansAmazon)} | les 3 ${p(un)} | rien ${p(l.length - un)}`);
  console.log(`   largeur médiane : OL ${mediane(l.filter((x) => x.ol.ok).map((x) => x.ol.dim.l)) ?? '—'} | BnF ${mediane(l.filter((x) => x.bnf.ok).map((x) => x.bnf.dim.l)) ?? '—'} | Amazon ${mediane(l.filter((x) => x.amazon.ok).map((x) => x.amazon.dim.l)) ?? '—'}`);
}
const remp = Object.entries(compte).filter(([, n]) => n >= 3);
console.log(`Images génériques repérées : ${remp.map(([h, n]) => `${h} ×${n}`).join(', ') || 'aucune'}`);

writeFileSync(new URL('../out/couvertures2.json', import.meta.url), JSON.stringify(lignes, null, 2));

const esc = (t) => String(t || '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const cel = (r, nom) => (r.ok
  ? `<figure><img loading="lazy" src="${esc(r.url)}" alt=""><figcaption>${nom} ${r.dim.l}×${r.dim.h}</figcaption></figure>`
  : `<figure class="vide"><div>—</div><figcaption>${nom} : ${esc(r.status)}</figcaption></figure>`);
writeFileSync(new URL('../out/couvertures2.html', import.meta.url), `<!doctype html><meta charset="utf-8"><title>Couvertures : Open Library, BnF, Amazon</title>
<style>body{font:14px system-ui;margin:16px;background:#fafafa}.ligne{display:grid;grid-template-columns:230px 1fr;gap:12px;border-bottom:1px solid #ddd;padding:8px 0}
figure{display:inline-block;margin:0 10px 0 0;text-align:center}img{height:190px;border:1px solid #ccc}.vide div{height:190px;width:125px;background:#eee;display:grid;place-items:center;color:#999}
figcaption{font-size:11px;color:#555}small{color:#666}</style><h1>Open Library | BnF | Amazon (par ISBN)</h1>
${SAGAS.map(([id, nom]) => `<h2>${esc(nom)}</h2>${lignes.filter((x) => x.saga === id).map((x) => `<div class="ligne"><div><b>${esc(x.titre)}</b><br><small>${esc(x.editeur)}<br>${x.isbn}</small></div><div>${cel(x.ol, 'Open Library')}${cel(x.bnf, 'BnF')}${cel(x.amazon, 'Amazon')}</div></div>`).join('')}`).join('')}`);
console.log('\nPlanche : prototype/out/couvertures2.html');
