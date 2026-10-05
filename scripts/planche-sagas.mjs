/*
 * Contrôle qualité des couvertures et des éditions sur le VRAI service, avec planche-contact à regarder à l'œil.
 *   node --env-file=.env scripts/planche-sagas.mjs
 * Pour chaque saga (fr) : d'où vient la couverture de chaque tome, l'image est-elle réelle (téléchargée, ≥ 200 px),
 * et la MÊME image est-elle utilisée pour deux tomes différents (signe d'une couverture mal associée) ?
 * Sortie : sorties/planche-sagas.html (non versionné) + bilan en console.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { obtenirApp } from '../src/app.js';
import { appeler, pause } from './outils.mjs';
import { dimensionsImage } from '../src/images.js';

const vert = (t) => `\x1b[32m${t}\x1b[0m`;
const rouge = (t) => `\x1b[31m${t}\x1b[0m`;
const jaune = (t) => `\x1b[33m${t}\x1b[0m`;
const { service } = obtenirApp();

const SAGAS = [{ id: 25608, nom: "Les Chevaliers d'Émeraude" }, { id: 1130, nom: 'Le Seigneur des anneaux' }, { id: 981, nom: 'Le Trône de fer' }];
const esc = (t) => String(t ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

async function verifier(url) {
  if (!url) return { ok: false, raison: 'aucune' };
  const r = await appeler(url, { binaire: true, timeoutMs: 20000 });
  if (r.status !== 200 || !r.corps?.length) return { ok: false, raison: `HTTP ${r.status || r.erreur}` };
  const d = dimensionsImage(r.corps);
  if (!d || d.l < 200 || r.corps.length < 4000) return { ok: false, raison: `trop petite (${d ? `${d.l}x${d.h}` : '?'}, ${r.corps.length} o)` };
  return { ok: true, dim: d, empreinte: createHash('md5').update(r.corps).digest('hex').slice(0, 10) };
}

let html = '';
const bilan = [];

for (const s of SAGAS) {
  const serie = await service.serie(s.id, 'fr');
  const lignes = serie.tomes.flatMap((t) => [{ ...t, _tome: t.position }, ...t.parties.map((p) => ({ ...p, _tome: t.position, _partie: true }))]);
  for (const l of lignes) l.verif = await verifier(l.couverture);

  const comptes = {};
  lignes.forEach((l) => { if (l.verif.ok) comptes[l.verif.empreinte] = (comptes[l.verif.empreinte] || []).concat(l.position); });
  const doublons = Object.values(comptes).filter((p) => p.length > 1);
  const sources = {};
  lignes.forEach((l) => { const k = l.couvertureSource || 'aucune'; sources[k] = (sources[k] || 0) + 1; });
  const valides = lignes.filter((l) => l.verif.ok).length;
  const approx = lignes.filter((l) => l.couvertureApproximative).length;

  console.log(`\n=== ${serie.nom} : ${serie.disponibles}/${serie.totalPrincipal} tomes, ${lignes.length} lignes (tomes + volumes coupés) ===`);
  console.log(`  couvertures réelles et valides : ${valides}/${lignes.length} (${Math.round((100 * valides) / lignes.length)} %)`);
  console.log(`  sources : ${Object.entries(sources).map(([k, v]) => `${k} ${v}`).join(' | ')}`);
  console.log(`  approximatives (image du livre, peut-être une autre langue) : ${approx}`);
  console.log(doublons.length ? jaune(`  /!\\ même image sur plusieurs positions : ${doublons.map((p) => p.join(' = ')).join(' ; ')}`) : vert('  aucune image partagée entre deux positions'));
  lignes.filter((l) => !l.verif.ok).forEach((l) => console.log(rouge(`  invalide : position ${l.position} « ${l.titre} » → ${l.verif.raison}`)));
  bilan.push({ nom: serie.nom, total: lignes.length, valides, approx, doublons: doublons.length });

  html += `<h2>${esc(serie.nom)} <small>${serie.disponibles}/${serie.totalPrincipal} tomes en français</small></h2><div class="grille">`;
  html += lignes.map((l) => `<figure class="${l._partie ? 'partie' : ''}${l.couvertureApproximative ? ' approx' : ''}${l.verif.ok ? '' : ' ko'}">
    ${l.verif.ok ? `<img loading="lazy" src="${esc(l.couverture)}" alt="">` : `<div class="vide">${esc(l.verif.raison)}</div>`}
    <figcaption><b>${l._partie ? `${l.position} (vol.)` : l.position}</b> ${esc(l.titre)}<br><small>${esc(l.edition?.editeur || (l.viaParties ? 'en volumes coupés' : 'indisponible en fr'))} · ${esc(l.edition?.isbn13 || '')}<br>source : ${esc(l.couvertureSource || 'aucune')}${l.couvertureApproximative ? ' ⚠ approximative' : ''}</small></figcaption></figure>`).join('');
  html += '</div>';
  await pause(1500);
}

// Éditions d'un livre par saga : Hardcover + BnF
html += '<h2>Éditions françaises (Hardcover + BnF)</h2>';
console.log('\n=== Éditions d\'un tome (Hardcover + BnF) ===');
for (const s of SAGAS) {
  const serie = await service.serie(s.id, 'fr');
  const tome = serie.tomes.find((t) => t.edition?.isbn13) || serie.tomes[0];
  const livre = await service.livre(tome.livreId, 'fr');
  if (!livre) { console.log(rouge(`  livre ${tome.livreId} introuvable`)); continue; }
  const deBnf = livre.editions.filter((e) => e.sources.includes('bnf')).length;
  const seulementBnf = livre.editions.filter((e) => e.sources.length === 1 && e.sources[0] === 'bnf').length;
  console.log(`  « ${livre.titreLangue} » (${livre.auteurs[0]}) : ${livre.editions.length} éditions avec ISBN, dont ${deBnf} connues de la BnF (${seulementBnf} uniquement par elle) — BnF : ${livre.sourceBnf}`);
  livre.editions.slice(0, 8).forEach((e) => console.log(`      ${String(e.date || '----').slice(0, 4)} | ${(e.editeur || '?').slice(0, 24).padEnd(24)} | ${e.isbn13} | couv ${e.couverture.source || 'AUCUNE'}${e.couverture.approximative ? ' (approx.)' : ''} | ${e.sources.join('+')}`));
  html += `<h3>${esc(livre.titreLangue)} — ${livre.editions.length} éditions (BnF : ${esc(livre.sourceBnf)})</h3><div class="grille">`
    + livre.editions.map((e) => `<figure class="${e.couverture.approximative ? 'approx' : ''}">${e.couverture.url ? `<img loading="lazy" src="${esc(e.couverture.url)}" alt="">` : '<div class="vide">aucune</div>'}
    <figcaption><b>${esc(e.editeur || '?')}</b> ${esc(String(e.date || '').slice(0, 4))}<br><small>${e.isbn13}<br>${esc(e.sources.join('+'))} · couv : ${esc(e.couverture.source || 'aucune')}${e.couverture.approximative ? ' ⚠' : ''}</small></figcaption></figure>`).join('') + '</div>';
  await pause(1500);
}

writeFileSync(new URL('../sorties/planche-sagas.html', import.meta.url), `<!doctype html><meta charset="utf-8"><title>Planche des sagas</title>
<style>body{font:14px system-ui;margin:16px;background:#fafafa}.grille{display:flex;flex-wrap:wrap;gap:12px}figure{width:150px;margin:0}
img{width:150px;height:225px;object-fit:cover;border:1px solid #ccc}.vide{width:150px;height:225px;background:#fdd;display:grid;place-items:center;color:#a00;text-align:center;font-size:12px}
.partie img{border-color:#99c}.approx img{border:3px solid #e90}.ko img{border-color:red}figcaption{font-size:12px;margin-top:4px}small{color:#666}h2 small{font-weight:normal;color:#666}</style>
<h1>Couvertures par tome — bordure orange = couverture approximative (image du livre, peut-être une autre langue)</h1>${html}`);
console.log('\nPlanche : sorties/planche-sagas.html');
console.log(bilan.every((b) => b.valides === b.total && b.doublons === 0) ? vert('\nTOUTES les couvertures sont réelles et distinctes.') : jaune('\nDes couvertures sont à examiner (voir ci-dessus).'));
