/*
 * Vérifie que Supabase est bien configuré, SANS jamais afficher de clé.
 *   npm run verifier:supabase
 * Contrôles : variables présentes, tables créées, amorçage des corrections, écriture + lecture + suppression dans le cache.
 */
import { lireConfig } from '../src/config.js';
import { cacheSupabase } from '../src/cache.js';
import { entetesSupabase } from '../src/supabase.js';

const vert = (t) => `\x1b[32m${t}\x1b[0m`;
const rouge = (t) => `\x1b[31m${t}\x1b[0m`;
const cfg = lireConfig();
let echecs = 0;
const ok = (b, msg, detail = '') => { if (!b) echecs += 1; console.log(`${b ? vert('OK  ') : rouge('KO  ')} ${msg}${detail ? ` — ${detail}` : ''}`); return b; };

ok(Boolean(cfg.supabaseUrl), 'SUPABASE_URL présent', cfg.supabaseUrl ? cfg.supabaseUrl.replace(/^(https:\/\/)([a-z0-9]{4})[a-z0-9]*/, '$1$2…') : 'absent de .env');
ok(Boolean(cfg.supabaseKey), 'SUPABASE_SERVICE_KEY présent', cfg.supabaseKey ? `format ${/^sb_secret_/.test(cfg.supabaseKey) ? 'nouvelle clé secrète' : /^eyJ/.test(cfg.supabaseKey) ? 'ancienne clé service_role (JWT)' : 'INCONNU'}` : 'absent de .env');
if (/^sb_publishable_/.test(cfg.supabaseKey) || /anon/i.test(cfg.supabaseKey)) ok(false, 'clé trop faible', 'vous avez collé la clé PUBLIQUE ; il faut la clé SECRÈTE (service_role)');
if (!cfg.supabaseUrl || !cfg.supabaseKey) process.exit(1);

const entetes = entetesSupabase(cfg.supabaseKey);
for (const table of ['cache_entries', 'series_overrides', 'cover_overrides']) {
  const r = await fetch(`${cfg.supabaseUrl}/rest/v1/${table}?select=*&limit=1`, { headers: entetes }).catch((e) => ({ ok: false, status: e.message }));
  ok(r.ok, `table ${table} accessible`, r.ok ? '' : `HTTP ${r.status} — la migration a-t-elle été exécutée ? la clé est-elle la bonne ?`);
}

const r = await fetch(`${cfg.supabaseUrl}/rest/v1/series_overrides?select=series_id,name_fr&order=series_id`, { headers: entetes }).catch(() => null);
const lignes = r?.ok ? await r.json() : [];
ok(lignes.length >= 3, 'corrections de départ présentes (Trône de fer, Seigneur des anneaux, Chevaliers d\'Émeraude)', `${lignes.length} ligne(s) : ${lignes.map((l) => l.name_fr).join(' | ')}`);

try {
  const cache = cacheSupabase({ url: cfg.supabaseUrl, cle: cfg.supabaseKey });
  const cle = `verif:${Date.now()}`;
  await cache.set(cle, { bonjour: 'monde' });
  const lu = await cache.get(cle);
  ok(lu?.valeur?.bonjour === 'monde', 'cache : écriture puis lecture', `âge ${lu?.ageMs} ms`);
  const d = await fetch(`${cfg.supabaseUrl}/rest/v1/cache_entries?key=eq.${encodeURIComponent(cle)}`, { method: 'DELETE', headers: entetes });
  ok(d.ok, 'cache : suppression de l\'entrée de test');
} catch (e) {
  ok(false, 'cache : aller-retour', e.message);
}

console.log(echecs ? rouge(`\n${echecs} contrôle(s) en échec.`) : vert('\nSupabase est prêt.'));
process.exit(echecs ? 1 : 0);
