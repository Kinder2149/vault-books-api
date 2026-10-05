// Le contrat entre le service et Vault Read.
//   npm run contrat -- --live      compare le service DÉPLOYÉ au contrat (URL et clé : VAULT_API_URL / VAULT_API_KEY, ou client/.env de vault-read)
//   npm run contrat -- --copier    copie contrat + exemples dans vault-read/client/tests/contrat/ (à relancer quand le contrat change)
//   npm run contrat -- --enregistrer   ré-enregistre les exemples depuis le service déployé (puis --copier)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { contrat, verifier } from '../src/contrat.js';

const racine = new URL('../', import.meta.url);
const clientTests = new URL('../../vault-read/client/tests/contrat/', import.meta.url);

function acces() {
  let url = process.env.VAULT_API_URL; let cle = process.env.VAULT_API_KEY;
  const env = new URL('../../vault-read/client/.env', import.meta.url);
  if ((!url || !cle) && existsSync(env)) {
    const lignes = Object.fromEntries(readFileSync(env, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
    url = url || lignes.VITE_VAULT_API_URL; cle = cle || lignes.VITE_VAULT_API_KEY;
  }
  if (!url || !cle) { console.error('URL ou clé introuvable (VAULT_API_URL / VAULT_API_KEY).'); process.exit(2); }
  return { url: url.replace(/\/$/, ''), cle };
}

async function obtenir({ url, cle }, chemin) {
  const r = await fetch(url + chemin, { headers: { 'x-app-key': cle } });
  if (!r.ok) throw new Error(`${chemin} → ${r.status}`);
  return r.json();
}

/** Les cinq réponses de référence : une saga française, un auteur, un ISBN, et le livre et la saga qu'ils désignent. */
async function releve(a) {
  const titre = await obtenir(a, '/v1/search?q=chevaliers%20d%27%C3%A9meraude&lang=fr');
  const auteur = await obtenir(a, '/v1/search?q=anne%20robillard&lang=fr&mode=auteur');
  const isbn = await obtenir(a, '/v1/isbn/9782749910147');
  const saga = titre.resultats.find((c) => c.type === 'serie');
  const serie = await obtenir(a, `/v1/series/${saga.id}?lang=fr`);
  const livre = await obtenir(a, `/v1/books/${isbn.livre.id}?lang=fr`);
  return { 'search-titre': titre, 'search-auteur': auteur, isbn, serie, livre };
}

const mode = process.argv[2];
if (mode === '--live' || mode === '--enregistrer') {
  const reponses = await releve(acces());
  let ecarts = 0;
  for (const [nom, valeur] of Object.entries(reponses)) {
    const liste = verifier(valeur, contrat[nom]);
    console.log(`${liste.length ? '✗' : '✓'} ${nom}${liste.length ? '\n   ' + liste.slice(0, 8).join('\n   ') : ''}`);
    ecarts += liste.length;
    if (mode === '--enregistrer') {
      delete valeur.cache;   // varie d'un appel à l'autre : pas une partie du contrat
      writeFileSync(new URL(`contrat/exemples/${nom}.json`, racine), JSON.stringify(valeur, null, 2) + '\n');
    }
  }
  process.exit(ecarts ? 1 : 0);
} else if (mode === '--copier') {
  mkdirSync(new URL('exemples/', clientTests), { recursive: true });
  copyFileSync(new URL('src/contrat.js', racine), new URL('contrat.js', clientTests));
  for (const f of readdirSync(new URL('contrat/exemples/', racine))) copyFileSync(new URL(`contrat/exemples/${f}`, racine), new URL(`exemples/${f}`, clientTests));
  console.log('Contrat copié dans vault-read/client/tests/contrat/');
} else {
  console.error('Usage : npm run contrat -- --live | --copier | --enregistrer');
  process.exit(2);
}
