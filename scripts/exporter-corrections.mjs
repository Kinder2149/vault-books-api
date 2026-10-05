/*
 * Sauvegarde des corrections : recopie Supabase (source de vérité) dans data/overrides.json (copie de secours, versionnée dans git, et repli du service).
 *   node --env-file=.env scripts/exporter-corrections.mjs
 * Lancé chaque nuit par .github/workflows/sauvegarde-corrections.yml. N'écrit le fichier que si le contenu a changé.
 * Lecture STRICTE : une panne de Supabase fait échouer le script (le fichier n'est alors pas touché), elle n'est jamais prise pour « zéro correction ».
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { lireConfig } from '../src/config.js';
import { lireOverridesSupabase } from '../src/overrides.js';

const cfg = lireConfig();
if (!cfg.supabaseUrl || !cfg.supabaseKey) { console.error('SUPABASE_URL et SUPABASE_SERVICE_KEY sont requis.'); process.exit(1); }

const chemin = new URL('../data/overrides.json', import.meta.url);
const lues = await lireOverridesSupabase({ url: cfg.supabaseUrl, cle: cfg.supabaseKey });

// Garde-fou : ne jamais écraser une sauvegarde riche par un export vide (base vidée par erreur, mauvaise clé…).
let avant = {};
try { avant = JSON.parse(readFileSync(chemin, 'utf8')); } catch { /* pas de fichier */ }
const nbAvant = Object.keys(avant.series || {}).length + Object.keys(avant.couvertures || {}).length;
const nbApres = Object.keys(lues.series).length + Object.keys(lues.couvertures).length;
if (nbApres === 0 && nbAvant > 0) {
  console.error(`Export vide alors que la sauvegarde contient ${nbAvant} correction(s) : refusé (si c'est voulu, éditez data/overrides.json à la main).`);
  process.exit(1);
}

const contenu = {
  _note: 'SAUVEGARDE automatique des corrections de Supabase (réécrite chaque nuit par scripts/exporter-corrections.mjs). Source de vérité : les tables series_overrides et cover_overrides. Sert aussi de repli au service si Supabase ne répond pas. Pour corriger : npm run corriger.',
  couvertures: lues.couvertures,
  series: Object.fromEntries(Object.entries(lues.series).map(([id, s]) => {
    const { note, ...reste } = s;
    return [id, { ...(note ? { _commentaire: note } : {}), ...reste }];
  })),
};
const texte = `${JSON.stringify(contenu, null, 2)}\n`;
let ancien = '';
try { ancien = readFileSync(chemin, 'utf8'); } catch { /* absent */ }
if (ancien.replace(/\r\n/g, '\n') === texte) {
  console.log(`Aucun changement (${Object.keys(lues.series).length} série(s), ${Object.keys(lues.couvertures).length} couverture(s)).`);
} else {
  writeFileSync(chemin, texte);
  console.log(`Sauvegarde mise à jour : ${Object.keys(lues.series).length} série(s), ${Object.keys(lues.couvertures).length} couverture(s).`);
}
