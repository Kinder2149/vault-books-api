// Réchauffe le cache des éditions françaises (BnF) pour les tomes des sagas connues du service. Lancé chaque semaine (workflow rechauffer.yml) ;
// reprenable : ce qui est déjà frais ne coûte rien. Usage : node --env-file=.env scripts/rechauffer.mjs [--max 60]
import { obtenirApp } from '../src/app.js';
import { entetesSupabase } from '../src/supabase.js';
import { VERSION_CACHE } from '../src/service.js';
import { livresARechauffer, rechauffer } from '../src/rafraichissement.js';

const i = process.argv.indexOf('--max');
const max = i > 0 ? Number(process.argv[i + 1]) : 60;
const app = obtenirApp();
if (!app.cfg.supabaseUrl) { console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY manquants.'); process.exit(2); }

const r = await fetch(`${app.cfg.supabaseUrl}/rest/v1/cache_entries?key=like.${encodeURIComponent(`serie:${VERSION_CACHE}:both:*`)}&select=key,value&order=fetched_at.desc&limit=40`, { headers: entetesSupabase(app.cfg.supabaseKey) });
if (!r.ok) { console.error(`Supabase a répondu ${r.status}`); process.exit(1); }
const ids = livresARechauffer(await r.json(), max);
console.log(`${ids.length} livre(s) à relire.`);
const bilan = await rechauffer({ service: app.service, ids });
console.log(JSON.stringify(bilan));
// Une BnF injoignable sur plus de la moitié des livres est un signal : le workflow échoue pour qu'on le voie.
process.exit(bilan.demandes && bilan.bnfIndisponible / bilan.demandes > 0.5 ? 1 : 0);
