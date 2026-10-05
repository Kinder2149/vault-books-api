/*
 * Mesure des COUVERTURES à grande échelle : pour une quinzaine de sagas variées, chaque tome (échantillon de 25 au plus) a-t-il une couverture RÉELLE
 * (image téléchargée, ≥ 200 px) et DISTINCTE (jamais la même image sur deux tomes) ? D'où viennent-elles ?
 *   node --env-file=.env scripts/mesure-couvertures.mjs
 * Écrit sorties/mesure-couvertures.json (détail) et data/couvertures-trous.json (les tomes sans couverture réelle : à corriger avec `npm run corriger`).
 */
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { obtenirApp } from '../src/app.js';
import { dimensionsImage } from '../src/images.js';
import { appeler } from './outils.mjs';

// Sagas variées (id Hardcover) : fantasy, SF, jeunesse, BD, manga, polar, francophone, longues séries.
const SAGAS = [
  [981, 'Le Trône de fer'], [1130, 'Le Seigneur des anneaux'], [25608, "Les Chevaliers d'Émeraude"], [1185, 'Harry Potter'], [6571, 'Astérix'],
  [5193, 'Percy Jackson'], [1015, 'Hunger Games'], [1150, 'Dune'], [5450, 'Fondation'], [5588, 'La Passe-Miroir'],
  [12539, "La Quête d'Ewilan"], [2115, 'Millénium'], [1157, 'Hercule Poirot'], [4624, 'One Piece'], [6102, 'Naruto'],
  [6224, "Journal d'un dégonflé"], [1097, 'La Roue du Temps'], [11905, 'La Saga des Fourmis'], [4794, 'Tintin'], [1033, 'Red Rising'],
];
const ECHANTILLON = 25;

const { service } = obtenirApp({ ...process.env, SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '' });

async function verifier(url) {
  if (!url) return { ok: false, raison: 'aucune' };
  const r = await appeler(url, { binaire: true, timeoutMs: 20000 });
  if (r.status !== 200 || !r.corps?.length) return { ok: false, raison: `HTTP ${r.status || r.erreur}` };
  const d = dimensionsImage(r.corps);
  if (!d || d.l < 200 || r.corps.length < 4000) return { ok: false, raison: `trop petite (${d ? `${d.l}x${d.h}` : '?'})` };
  return { ok: true, empreinte: createHash('md5').update(r.corps).digest('hex').slice(0, 10) };
}

const tout = [];
const trous = [];
let total = 0; let valides = 0; let approx = 0;
const sources = {};

for (const [id, nom] of SAGAS) {
  let serie;
  try { serie = await service.serie(id, 'fr'); } catch (e) { console.log(`${nom} : ERREUR ${e.message}`); continue; }
  if (!serie) { console.log(`${nom} : série introuvable`); continue; }
  const tomes = serie.tomes.filter((t) => t.disponible && !t.aParaitre);
  const pas = Math.max(1, Math.floor(tomes.length / ECHANTILLON));
  const echantillon = tomes.filter((_, i) => i % pas === 0).slice(0, ECHANTILLON);

  const lignes = [];
  for (const t of echantillon) {
    const v = await verifier(t.couverture);
    lignes.push({ position: t.position, titre: t.titre, isbn13: t.edition?.isbn13 || null, source: t.couvertureSource || 'aucune', approximative: Boolean(t.couvertureApproximative), ...v });
  }
  const empreintes = {};
  lignes.forEach((l) => { if (l.ok) empreintes[l.empreinte] = (empreintes[l.empreinte] || []).concat(l.position); });
  const doublons = Object.values(empreintes).filter((p) => p.length > 1);
  const ok = lignes.filter((l) => l.ok).length;

  total += lignes.length; valides += ok; approx += lignes.filter((l) => l.approximative).length;
  lignes.forEach((l) => { sources[l.source] = (sources[l.source] || 0) + 1; });
  lignes.filter((l) => !l.ok).forEach((l) => trous.push({ saga: nom, serieId: id, position: l.position, titre: l.titre, isbn13: l.isbn13, raison: l.raison }));

  console.log(`${nom.padEnd(28)} ${String(ok).padStart(2)}/${String(lignes.length).padEnd(2)} réelles (${Math.round((100 * ok) / Math.max(1, lignes.length))} %)  ${tomes.length} tomes dispo${doublons.length ? `  /!\\ images partagées : ${doublons.map((p) => p.join('=')).join(' ; ')}` : ''}`);
  tout.push({ saga: nom, serieId: id, tomesDisponibles: tomes.length, echantillon: lignes.length, valides: ok, doublons, lignes });
}

console.log(`\n=== ${total} couvertures examinées sur ${tout.length} sagas : ${valides} réelles et valides (${Math.round((100 * valides) / total)} %), ${approx} approximatives ===`);
console.log(`Sources : ${Object.entries(sources).map(([k, v]) => `${k} ${v}`).join(' | ')}`);
console.log(`Sans couverture réelle : ${trous.length} (liste dans data/couvertures-trous.json)`);
mkdirSync(new URL('../sorties/', import.meta.url), { recursive: true });
writeFileSync(new URL('../sorties/mesure-couvertures.json', import.meta.url), JSON.stringify({ date: new Date().toISOString(), total, valides, approx, sources, sagas: tout }, null, 2));
writeFileSync(new URL('../data/couvertures-trous.json', import.meta.url), JSON.stringify({ date: new Date().toISOString(), note: "Tomes sans couverture réelle d'après scripts/mesure-couvertures.mjs : à corriger avec npm run corriger -- couverture serie:<id>:<position> <url>", trous }, null, 2));
