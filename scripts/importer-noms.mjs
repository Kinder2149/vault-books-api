/*
 * Enregistre les noms français de sagas APRÈS validation (liste produite par scripts/proposer-noms-sagas.mjs).
 *   node --env-file=.env scripts/importer-noms.mjs                              # simulation : montre ce qui serait enregistré
 *   node --env-file=.env scripts/importer-noms.mjs --appliquer                  # enregistre tout dans Supabase
 *   node --env-file=.env scripts/importer-noms.mjs --appliquer --sauf 1044,152692            # tout SAUF ces séries
 *   node --env-file=.env scripts/importer-noms.mjs --appliquer --nom 1059="Le Cycle d'Ender"  # corrige un nom au passage
 * Chaque enregistrement passe par l'outil de correction : le cache concerné est invalidé, la sauvegarde nocturne le recopiera dans git.
 */
import { readFileSync } from 'node:fs';
import { lireConfig } from '../src/config.js';
import { creerCorrections } from '../src/corrections.js';

const args = process.argv.slice(2);
const appliquer = args.includes('--appliquer');
const valeur = (opt) => { const i = args.indexOf(opt); return i >= 0 ? args[i + 1] : null; };
const sauf = new Set((valeur('--sauf') || '').split(',').map((x) => x.trim()).filter(Boolean).map(Number));
const renommages = new Map(args.flatMap((a, i) => (args[i - 1] === '--nom' ? [[Number(a.split('=')[0]), a.split('=').slice(1).join('=')]] : [])));

const { aRenommer } = JSON.parse(readFileSync(new URL('../data/noms-sagas-proposes.json', import.meta.url), 'utf8'));
const cfg = lireConfig();
const c = appliquer ? creerCorrections({ url: cfg.supabaseUrl, cle: cfg.supabaseKey }) : null;
if (appliquer && (!cfg.supabaseUrl || !cfg.supabaseKey)) { console.error('SUPABASE_URL et SUPABASE_SERVICE_KEY sont requis pour --appliquer.'); process.exit(1); }

let nb = 0;
for (const s of aRenommer) {
  if (sauf.has(s.id)) { console.log(`  écartée   #${s.id} ${s.nomActuel}`); continue; }
  const nom = renommages.get(s.id) || s.nom;
  if (!appliquer) { console.log(`  à écrire  #${s.id} « ${s.nomActuel} » → « ${nom} »`); nb += 1; continue; }
  await c.enregistrerSerie(s.id, { 'nom-fr': nom, 'nom-en': s.nomActuel, note: 'nom français validé (liste de noms de sagas)' });
  console.log(`  enregistrée #${s.id} → « ${nom} »`);
  nb += 1;
}
console.log(`\n${nb} saga(s) ${appliquer ? 'enregistrée(s)' : 'à enregistrer (simulation : ajoutez --appliquer)'}.`);
