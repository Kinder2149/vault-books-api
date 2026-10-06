import test from 'node:test';
import assert from 'node:assert/strict';
import { creerCouvertures } from '../src/covers.js';
import { cacheMemoire } from '../src/cache.js';
import { indexer, overridesSupabase } from '../src/overrides.js';

const reponse = (status, taille) => ({ status, ok: status >= 200 && status < 300, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(taille || 0) });

test('cascade : la correction manuelle gagne sur tout', async () => {
  const c = creerCouvertures({ cache: cacheMemoire(), fetchImpl: async () => { throw new Error('ne doit pas être appelé'); } });
  const r = await c.resoudre({ isbn13: '1', couvertureEdition: 'hc', correction: 'main' });
  assert.deepEqual(r, { url: 'main', source: 'correction', approximative: false, qualite: 1 });
});

test("cascade : l'image de l'édition Hardcover évite tout appel à Open Library", async () => {
  const c = creerCouvertures({ cache: cacheMemoire(), fetchImpl: async () => { throw new Error('ne doit pas être appelé'); } });
  assert.equal((await c.resoudre({ isbn13: '1', couvertureEdition: 'hc' })).source, 'hardcover');
});

test('cascade : sans image Hardcover, Open Library par ISBN (default=false) ; le résultat est mis en cache', async () => {
  const urls = [];
  const c = creerCouvertures({ cache: cacheMemoire(), fetchImpl: async (u) => { urls.push(u); return reponse(200, 30000); } });
  const a = await c.resoudre({ isbn13: '9782749906256', couvertureLivre: 'livre' });
  const b = await c.resoudre({ isbn13: '9782749906256', couvertureLivre: 'livre' });
  assert.equal(a.source, 'openlibrary');
  assert.match(a.url, /9782749906256-L\.jpg\?default=false$/);
  assert.equal(b.source, 'openlibrary');
  assert.equal(urls.length, 1);                              // 2e résolution servie par le cache
});

test("cascade : Open Library 404 → image du livre, marquée APPROXIMATIVE ; l'absence est mémorisée", async () => {
  let appels = 0;
  const c = creerCouvertures({ cache: cacheMemoire(), fetchImpl: async () => { appels += 1; return reponse(404); } });
  const a = await c.resoudre({ isbn13: '9782749906256', couvertureLivre: 'livre' });
  await c.resoudre({ isbn13: '9782749906256', couvertureLivre: 'livre' });
  assert.deepEqual(a, { url: 'livre', source: 'hardcover-livre', approximative: true, qualite: 0.2 });
  assert.equal(appels, 1);
});

test("cascade : une image minuscule d'Open Library n'est pas une couverture", async () => {
  const c = creerCouvertures({ cache: cacheMemoire(), fetchImpl: async () => reponse(200, 800) });
  const r = await c.resoudre({ isbn13: '9782749906256' });
  assert.equal(r.url, null);
});

test("cascade : Open Library en panne ou limitée (429) → on ne mémorise rien et on retombe sur le livre", async () => {
  const cache = cacheMemoire();
  const c = creerCouvertures({ cache, fetchImpl: async () => reponse(429) });
  const r = await c.resoudre({ isbn13: '9782749906256', couvertureLivre: 'livre' });
  assert.equal(r.approximative, true);
  assert.equal(await cache.get('cover:v2:ol:9782749906256'), null);
});

test('corrections : par ISBN ou par tome de saga', () => {
  const idx = indexer({ series: {}, couvertures: { 'isbn:9782749906256': 'a', 'serie:25608:3': 'b' } });
  assert.equal(idx.couverture({ isbn13: '9782749906256' }), 'a');
  assert.equal(idx.couverture({ isbn13: '0', serieId: 25608, position: 3 }), 'b');
  assert.equal(idx.couverture({ isbn13: '0', serieId: 25608, position: 4 }), null);
});

test("corrections Supabase : fusionnées avec le fichier, gardées en mémoire, et dernière version connue en cas de panne", async () => {
  let appels = 0;
  let panne = false;
  const fetchImpl = async (u) => {
    appels += 1;
    if (panne) return { ok: false, status: 500, json: async () => [] };
    if (u.includes('series_overrides')) return { ok: true, json: async () => [{ series_id: 5, name_fr: 'Cinq', name_en: null, merge_ids: [6], exclude_positions: ['1.5'] }] };
    return { ok: true, json: async () => [{ key: 'isbn:1', url: 'u' }] };
  };
  const obtenir = overridesSupabase({ url: 'http://x', cle: 'k', repli: { series: { 1: { noms: { fr: 'Un' } } }, couvertures: {} }, fetchImpl, ttlMs: 20 });
  const o = await obtenir();
  assert.equal(o.series[5].noms.fr, 'Cinq');
  assert.deepEqual(o.series[5].exclurePositions, [1.5]);
  assert.equal(o.series[1].noms.fr, 'Un');
  assert.equal(o.couvertures['isbn:1'], 'u');
  await obtenir(); assert.equal(appels, 3);                   // 2e lecture dans le TTL : mémoire (3 tables lues la 1re fois : séries, couvertures, alias)
  panne = true;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal((await obtenir()).series[5].noms.fr, 'Cinq');  // panne : dernière version connue
});

test("cascade : miniature de l'édition APRÈS Open Library, marquée basse définition, avant l'image du livre", async () => {
  const c = creerCouvertures({ cache: cacheMemoire(), fetchImpl: async () => reponse(404) });
  const r = await c.resoudre({ isbn13: '9782749906256', couverturePetite: 'petite', couvertureLivre: 'livre' });
  assert.deepEqual(r, { url: 'petite', source: 'hardcover-petite', approximative: false, basseDefinition: true, qualite: 0.4 });
});

test('cascade : Open Library passe devant une miniature Hardcover', async () => {
  const c = creerCouvertures({ cache: cacheMemoire(), fetchImpl: async () => reponse(200, 30000) });
  const r = await c.resoudre({ isbn13: '9782749906256', couverturePetite: 'petite' });
  assert.equal(r.source, 'openlibrary');
});

test("cascade : l'image d'une édition voisine passe APRÈS Open Library (couverture de cette édition) et AVANT la miniature", async () => {
  const sansOl = creerCouvertures({ cache: cacheMemoire(), fetchImpl: async () => reponse(404) });
  const r = await sansOl.resoudre({ isbn13: '9782749906256', couvertureVoisine: 'voisine', couverturePetite: 'petite', couvertureLivre: 'livre' });
  assert.deepEqual(r, { url: 'voisine', source: 'hardcover-voisine', approximative: false, qualite: 0.7 });
  const avecOl = creerCouvertures({ cache: cacheMemoire(), fetchImpl: async () => reponse(200, 30000) });
  assert.equal((await avecOl.resoudre({ isbn13: '9782749906256', couvertureVoisine: 'voisine' })).source, 'openlibrary');
});
