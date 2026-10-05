import test from 'node:test';
import assert from 'node:assert/strict';
import { creerLimiteur, creerHardcover } from '../src/sources/hardcover.js';

function horloge() {
  let t = 0;
  const attentes = [];
  return { maintenant: () => t, attendre: async (ms) => { attentes.push(ms); t += ms; }, attentes, avancer: (ms) => { t += ms; } };
}

test('limiteur : la rafale passe sans attendre, puis chaque appel attend son tour', async () => {
  const h = horloge();
  const acquerir = creerLimiteur({ capacite: 3, parSeconde: 1, maintenant: h.maintenant, attendre: h.attendre });
  await acquerir(); await acquerir(); await acquerir();
  assert.deepEqual(h.attentes, []);               // 3 jetons : aucune attente
  await acquerir();
  assert.deepEqual(h.attentes, [1000]);           // 4e : une seconde, à 1 jeton/s
  await acquerir();
  assert.deepEqual(h.attentes, [1000, 1000]);
});

test('limiteur : le seau se remplit pendant les pauses, sans dépasser sa capacité', async () => {
  const h = horloge();
  const acquerir = creerLimiteur({ capacite: 2, parSeconde: 1, maintenant: h.maintenant, attendre: h.attendre });
  await acquerir(); await acquerir();
  h.avancer(60_000);                               // une minute plus tard : seau plein (2), pas 60
  await acquerir(); await acquerir();
  assert.deepEqual(h.attentes, []);
  await acquerir();
  assert.deepEqual(h.attentes, [1000]);
});

test('limiteur : des appels simultanés sont servis un par un, sans se doubler', async () => {
  const h = horloge();
  const acquerir = creerLimiteur({ capacite: 1, parSeconde: 2, maintenant: h.maintenant, attendre: h.attendre });
  await Promise.all([acquerir(), acquerir(), acquerir()]);
  assert.deepEqual(h.attentes, [500, 500]);
});

const reponse = (status, corps, entetes = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: (k) => entetes[k.toLowerCase()] ?? null }, json: async () => corps });

test('Hardcover : chaque appel passe par le limiteur, réessais compris', async () => {
  let acquis = 0;
  const reponses = [reponse(429, {}), reponse(200, { data: { ok: 1 } })];
  const hc = creerHardcover({ cle: 'k', fetchImpl: async () => reponses.shift(), limiteur: async () => { acquis += 1; }, pausesReessaiMs: [1, 1] });
  await hc.rechercher('dune');
  assert.equal(acquis, 2);                         // l'appel initial + le réessai
});

test('Hardcover : un 429 est réessayé puis réussit ; Retry-After est écouté', async () => {
  const debut = Date.now();
  const reponses = [reponse(429, {}, { 'retry-after': '0.05' }), reponse(200, { data: { search: { results: { hits: [{ document: { id: '1' } }] } } } })];
  const hc = creerHardcover({ cle: 'k', fetchImpl: async () => reponses.shift(), limiteur: async () => {}, pausesReessaiMs: [1, 1] });
  const docs = await hc.rechercher('dune');
  assert.equal(docs.length, 1);
  assert.ok(Date.now() - debut >= 45);             // a attendu ce que Hardcover a demandé (50 ms), pas seulement 1 ms
});

test('Hardcover : un 429 qui persiste finit en erreur claire', async () => {
  const hc = creerHardcover({ cle: 'k', fetchImpl: async () => reponse(429, { error: 'Too Many Requests' }), limiteur: async () => {}, pausesReessaiMs: [1, 1] });
  await assert.rejects(() => hc.rechercher('dune'), /429/);
});

import { lireRateLimit } from '../src/sources/hardcover.js';

test("quota : l'en-tête RateLimit est lu (minute et jour), quel que soit le nom du plan", () => {
  assert.deepEqual(lireRateLimit('"Free";r=8;t=0, "daily";r=4231;t=51234'), { restantMinute: 8, restantJour: 4231 });
  assert.deepEqual(lireRateLimit('"Supporter";r=12;t=3, "daily";r=49000;t=100'), { restantMinute: 12, restantJour: 49000 });
  assert.deepEqual(lireRateLimit('"daily";r=10;t=5'), { restantMinute: null, restantJour: 10 });
  assert.equal(lireRateLimit(null), null);
  assert.equal(lireRateLimit('illisible'), null);
});

test("quota : Hardcover mémorise le dernier état vu dans les en-têtes de ses réponses, sans appel de plus", async () => {
  const rep = (entete) => ({ status: 200, ok: true, headers: { get: (k) => (k.toLowerCase() === 'ratelimit' ? entete : null) }, json: async () => ({ data: { search: { results: { hits: [] } } } }) });
  const hc = creerHardcover({ cle: 'k', fetchImpl: async () => rep('"Free";r=3;t=0, "daily";r=950;t=100'), limiteur: async () => {}, maintenant: () => 42 });
  assert.deepEqual(hc.quota(), { restantMinute: null, restantJour: null, vuA: null });   // rien de connu avant le premier appel
  await hc.rechercher('dune');
  assert.deepEqual(hc.quota(), { restantMinute: 3, restantJour: 950, vuA: 42 });
});

test('Hardcover : ping utilise une requête d\'introspection (qui ne compte pas dans le quota)', async () => {
  let corps;
  const hc = creerHardcover({ cle: 'k', fetchImpl: async (u, o) => { corps = JSON.parse(o.body); return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ data: { __typename: 'query_root' } }) }; }, limiteur: async () => {} });
  assert.equal(await hc.ping(), true);
  assert.match(corps.query, /__typename/);
});
