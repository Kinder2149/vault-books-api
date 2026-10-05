import test from 'node:test';
import assert from 'node:assert/strict';
import { creerService, sansImages } from '../src/service.js';
import { urlsMasquees, PREFIXE_MASQUE } from '../src/overrides.js';
import { cacheMemoire } from '../src/cache.js';
import { creerCorrections } from '../src/corrections.js';

const IMG = 'https://assets.hardcover.app/edition/1/retiree.jpg';
const AUTRE = 'https://assets.hardcover.app/edition/2/autre.jpg';

test('retrait : sansImages remplace partout l\'adresse retirée, sans toucher aux autres ni à l\'original', () => {
  const original = { resultats: [{ couverture: IMG, titre: IMG.slice(0, 5) }, { couverture: AUTRE }], deep: { couverture: { url: IMG } } };
  const copie = sansImages(original, new Set([IMG]));
  assert.equal(copie.resultats[0].couverture, null);
  assert.equal(copie.resultats[1].couverture, AUTRE);
  assert.equal(copie.deep.couverture.url, null);
  assert.equal(original.resultats[0].couverture, IMG);      // l'original (peut-être dans le cache mémoire) est intact
});

test('retrait : les adresses retirées se lisent dans les clés masque:<url>', () => {
  const s = urlsMasquees({ couvertures: { [`${PREFIXE_MASQUE}${IMG}`]: IMG, 'isbn:9782749910147': AUTRE } });
  assert.deepEqual([...s], [IMG]);
  assert.equal(urlsMasquees(undefined).size, 0);
});

test('retrait : le service ne rend plus l\'image retirée, tout de suite, même servie par le cache', async () => {
  const doc = { id: '1', title: 'Dune', author_names: ['Frank Herbert'], users_count: 90, image: { url: IMG }, alternative_titles: [], compilation: false, featured_series: null };
  const hc = { async rechercher() { return [doc]; }, async editionsEnLangue() { return new Map([[1, { title: 'Dune', image: { url: IMG } }]]); } };
  let overrides = { series: {}, couvertures: {} };
  const s = creerService({ hardcover: hc, cache: cacheMemoire(), overrides: async () => overrides });
  const avant = await s.rechercher('dune', 'fr');
  assert.ok(JSON.stringify(avant).includes(IMG), "l'image est rendue avant le retrait");

  overrides = { series: {}, couvertures: { [`${PREFIXE_MASQUE}${IMG}`]: IMG } };
  const apres = await s.rechercher('dune', 'fr');          // 2e appel : servi par le cache
  assert.equal(apres.cache, 'frais');
  assert.ok(!JSON.stringify(apres).includes(IMG));
});

test('retrait : l\'outil écrit la clé masque:<url> et refuse une adresse qui n\'est pas https', async () => {
  const appels = [];
  const fetchImpl = async (url, opts = {}) => { appels.push({ url, body: opts.body && JSON.parse(opts.body) }); return { ok: true, status: 200, headers: { get: () => null } }; };
  const c = creerCorrections({ url: 'https://x.supabase.co', cle: 'k', fetchImpl });
  await c.masquerImage(IMG, 'demande');
  assert.equal(appels[0].body.key, `masque:${IMG}`);
  assert.equal(appels[0].body.url, IMG);
  await assert.rejects(() => c.masquerImage('http://x/y.jpg'), /https/);
  await assert.rejects(() => c.masquerImage('https://x/y .jpg'), /https/);
});
