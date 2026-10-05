/*
 * Test de fumée d'une API DÉPLOYÉE (ou locale) : les routes répondent-elles, avec le bon format ?
 *   node --env-file=.env scripts/smoke.mjs https://vault-books-api-xxxx.vercel.app
 *   node --env-file=.env scripts/smoke.mjs http://localhost:3000
 * Si APP_KEY est défini dans .env, il est envoyé dans l'en-tête x-app-key (jamais affiché).
 */
const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base) { console.error('Usage : node --env-file=.env scripts/smoke.mjs <url-de-base>'); process.exit(1); }

const vert = (t) => `\x1b[32m${t}\x1b[0m`;
const rouge = (t) => `\x1b[31m${t}\x1b[0m`;
const headers = process.env.APP_KEY ? { 'x-app-key': process.env.APP_KEY.trim() } : {};
let echecs = 0;

async function appeler(chemin) {
  const t0 = Date.now();
  const r = await fetch(base + chemin, { headers }).catch((e) => ({ status: 0, erreur: e.message }));
  const corps = r.json ? await r.json().catch(() => null) : null;
  return { status: r.status, ms: Date.now() - t0, corps, erreur: r.erreur };
}
function verifier(ok, msg, detail = '') { if (!ok) echecs += 1; console.log(`${ok ? vert('OK  ') : rouge('KO  ')} ${msg}${detail ? ` — ${detail}` : ''}`); }

const sante = await appeler('/v1/health');
verifier(sante.status === 200 && sante.corps?.ok, 'GET /v1/health', `${sante.ms} ms, cache ${sante.corps?.cache}, hardcover ${sante.corps?.hardcover}${sante.erreur ? ` (${sante.erreur})` : ''}`);
verifier(sante.corps?.cache === 'supabase', 'le cache est bien Supabase (pas la mémoire)', `valeur : ${sante.corps?.cache}`);

const recherche = await appeler('/v1/search?q=les%20chevaliers%20d%27%C3%A9meraude&lang=fr');
const carte = recherche.corps?.resultats?.[0];
verifier(recherche.status === 200 && carte?.type === 'serie', 'GET /v1/search (saga en tête)', `${recherche.ms} ms, « ${carte?.titre} », ${carte?.tomes} tomes, cache ${recherche.corps?.cache}`);

const serie = carte ? await appeler(`/v1/series/${carte.id}?lang=fr`) : null;
verifier(serie?.status === 200 && serie.corps.disponibles === 12, 'GET /v1/series/:id (12 tomes en français)', serie ? `${serie.ms} ms, ${serie.corps?.disponibles}/${serie.corps?.totalPrincipal}` : 'pas de série');

const livreId = serie?.corps?.tomes?.[0]?.livreId;
const livre = livreId ? await appeler(`/v1/books/${livreId}?lang=fr`) : null;
verifier(livre?.status === 200 && livre.corps.editions?.length > 0, 'GET /v1/books/:id (éditions)', livre ? `${livre.ms} ms, ${livre.corps?.editions?.length} éditions, BnF : ${livre.corps?.sourceBnf}` : 'pas de livre');

const encore = await appeler('/v1/search?q=les%20chevaliers%20d%27%C3%A9meraude&lang=fr');
verifier(encore.corps?.cache === 'frais' || encore.ms < recherche.ms, '2e recherche identique plus rapide / servie par le cache', `${encore.ms} ms, cache ${encore.corps?.cache}`);

const scan = await appeler('/v1/isbn/9782749910147');
verifier(scan.status === 200 && scan.corps?.titre === 'Les dieux déchus' && scan.corps?.nbPages === 435 && scan.corps?.serie?.position === 8,
  'GET /v1/isbn/:isbn (Hardcover : titre, pages, saga)', `${scan.ms} ms, « ${scan.corps?.titre} », ${scan.corps?.nbPages} p., tome ${scan.corps?.serie?.position}, couv ${scan.corps?.couverture?.source}`);
const scanBnf = await appeler('/v1/isbn/9791022400640');
verifier(scanBnf.status === 200 && scanBnf.corps?.sources?.includes('bnf'), 'GET /v1/isbn/:isbn (repli BnF, ISBN récent)', `${scanBnf.ms} ms, « ${scanBnf.corps?.titre} », ${scanBnf.corps?.editeur}`);
const inconnu = await appeler('/v1/isbn/9789999999991');
verifier(inconnu.status === 404, 'ISBN valide mais inconnu partout → 404', `${inconnu.ms} ms`);
verifier((await appeler('/v1/isbn/9782226052579')).status === 400, 'ISBN à clé de contrôle fausse → 400');

verifier((await appeler('/v1/search?q=a&lang=fr')).status === 400, 'recherche trop courte → 400');
verifier((await appeler('/v1/search?q=dune&lang=de')).status === 400, 'langue inconnue → 400');
verifier((await appeler('/v1/series/999999999?lang=fr')).status === 404, 'série inconnue → 404');

if (process.env.APP_KEY) {
  // Sur une adresse DÉJÀ servie avec la clé (donc potentiellement en cache de bord) : un cache partagé la rendrait sans clé.
  const sansCle = await fetch(base + '/v1/search?q=les%20chevaliers%20d%27%C3%A9meraude&lang=fr').then((r) => r.status).catch(() => 0);
  verifier(sansCle === 401, 'sans clé d\'application → 401, même sur une adresse déjà servie', `statut ${sansCle}`);
}
console.log(echecs ? rouge(`\n${echecs} contrôle(s) en échec.`) : vert('\nTout est bon.'));
process.exit(echecs ? 1 : 0);
