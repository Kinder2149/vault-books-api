// Test de capacité LÉGER du service déployé : latence à froid et à chaud, erreurs, poids des réponses, quota Hardcover consommé.
//   npm run charge            (URL et clé : VAULT_API_URL / VAULT_API_KEY, ou client/.env de vault-read)
// Léger par construction : ~12 requêtes à froid (≈ 60 appels Hardcover) puis ~120 requêtes à chaud. Ne s'approche jamais du seuil d'économie.
import { readFileSync, existsSync } from 'node:fs';

let url = process.env.VAULT_API_URL; let cle = process.env.VAULT_API_KEY;
const env = new URL('../../vault-read/client/.env', import.meta.url);
if ((!url || !cle) && existsSync(env)) {
  const l = Object.fromEntries(readFileSync(env, 'utf8').split(/\r?\n/).filter((x) => x.includes('=')).map((x) => [x.slice(0, x.indexOf('=')).trim(), x.slice(x.indexOf('=') + 1).trim()]));
  url = url || l.VITE_VAULT_API_URL; cle = cle || l.VITE_VAULT_API_KEY;
}
if (!url || !cle) { console.error('URL ou clé introuvable.'); process.exit(2); }
url = url.replace(/\/$/, '');

const TITRES = ['fondation asimov', 'le nom du vent', 'fahrenheit 451', 'les piliers de la terre', 'la horde du contrevent', 'sapiens harari',
  'le petit prince', 'dune herbert', 'american gods gaiman', 'millenium larsson', 'la servante ecarlate', 'le comte de monte cristo'];

async function appeler(chemin) {
  const t0 = performance.now();
  try {
    const r = await fetch(url + chemin, { headers: { 'x-app-key': cle } });
    const corps = await r.arrayBuffer();
    return { ms: performance.now() - t0, statut: r.status, octets: corps.byteLength };
  } catch (e) {
    return { ms: performance.now() - t0, statut: 0, octets: 0 };
  }
}

async function enParallele(taches, n) {
  const sortie = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < taches.length) { const k = i++; sortie[k] = await taches[k](); } }));
  return sortie;
}

const centile = (v, p) => { const s = [...v].sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))]) : null; };
function resume(nom, rs) {
  const ms = rs.map((r) => r.ms); const ko = rs.filter((r) => r.statut !== 200).length;
  const octets = Math.round(rs.reduce((a, r) => a + r.octets, 0) / rs.length / 1024);
  console.log(`${nom.padEnd(34)} n=${String(rs.length).padStart(3)}  p50 ${String(centile(ms, 0.5)).padStart(5)} ms  p95 ${String(centile(ms, 0.95)).padStart(5)} ms  max ${String(centile(ms, 1)).padStart(5)} ms  erreurs ${ko}  ${octets} ko/réponse`);
  return { ms, ko };
}
const quota = async () => { const r = await fetch(`${url}/v1/status`, { headers: { 'x-app-key': cle } }); const j = await r.json(); return j.hardcover?.quota?.restantJour ?? null; };

const avant = await quota();
console.log(`Quota Hardcover restant avant : ${avant}\n`);

const froid = resume('À froid : 12 recherches inédites', await enParallele(TITRES.map((t) => () => appeler(`/v1/search?q=${encodeURIComponent(t)}&lang=fr`)), 3));
const apresFroid = await quota();

const chaud = resume('À chaud : mêmes recherches ×6', await enParallele(Array.from({ length: 72 }, (_, i) => () => appeler(`/v1/search?q=${encodeURIComponent(TITRES[i % TITRES.length])}&lang=fr`)), 10));
const serie = resume('À chaud : saga (tomes) ×30', await enParallele(Array.from({ length: 30 }, () => () => appeler('/v1/series/25608?lang=fr')), 10));
const isbn = resume('À chaud : scan ISBN ×30', await enParallele(Array.from({ length: 30 }, () => () => appeler('/v1/isbn/9782749910147')), 10));
const apres = await quota();

console.log(`\nQuota Hardcover consommé : à froid ${avant - apresFroid} (≈ ${((avant - apresFroid) / TITRES.length).toFixed(1)} par recherche inédite), à chaud ${apresFroid - apres}`);
const toutes = [froid, chaud, serie, isbn];
console.log(`Erreurs au total : ${toutes.reduce((a, r) => a + r.ko, 0)}`);
