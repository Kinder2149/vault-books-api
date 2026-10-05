import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { contrat, verifier } from '../src/contrat.js';

const exemple = (nom) => JSON.parse(readFileSync(new URL(`../contrat/exemples/${nom}.json`, import.meta.url), 'utf8'));

test('contrat : chaque exemple réel enregistré est conforme', () => {
  for (const nom of Object.keys(contrat)) assert.deepEqual(verifier(exemple(nom), contrat[nom]), [], nom);
});

test('contrat : chaque exemple a son schéma (aucun fichier orphelin)', () => {
  const fichiers = readdirSync(new URL('../contrat/exemples/', import.meta.url)).map((f) => f.replace(/\.json$/, '')).sort();
  assert.deepEqual(fichiers, Object.keys(contrat).sort());
});

test('contrat : un champ lu qui disparaît, change de type ou devient null est détecté', () => {
  const s = exemple('serie');
  delete s.tomes[0].livreId;
  assert.match(verifier(s, contrat.serie)[0], /tomes\[0\]\.livreId: absent/);
  const i = exemple('isbn');
  i.nbPages = '435';
  assert.match(verifier(i, contrat.isbn)[0], /nbPages: string/);
  const r = exemple('search-titre');
  r.resultats[0].titre = null;
  assert.match(verifier(r, contrat['search-titre'])[0], /titre: null/);
});

test('contrat : la sortie RÉELLE du service (recherche) respecte le contrat', async () => {
  const { creerService } = await import('../src/service.js');
  const { cacheMemoire } = await import('../src/cache.js');
  const hit = { id: '1', title: 'Dune', author_names: ['Frank Herbert'], users_count: 90, image: { url: 'https://img/d.jpg' }, alternative_titles: [], compilation: false, featured_series: null };
  const hc = { async rechercher() { return [hit]; }, async editionsEnLangue() { return new Map([[1, { title: 'Dune', image: { url: 'https://img/e.jpg' } }]]); } };
  const r = await creerService({ hardcover: hc, cache: cacheMemoire() }).rechercher('dune', 'fr');
  assert.deepEqual(verifier(r, contrat['search-titre']), []);
});
