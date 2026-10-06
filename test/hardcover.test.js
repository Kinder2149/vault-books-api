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

test("Hardcover : editionsEnLangue avec voisines — un second champ, et l'image voisine est attachée à l'édition retenue de chaque livre", async () => {
  let corps;
  const donnees = { data: {
    editions: [{ id: 1, book_id: 10, title: 'T', isbn_13: '1', image: { url: 'petite', width: 98 } }, { id: 2, book_id: 11, title: 'U', isbn_13: '2', image: { url: 'ok', width: 300 } }],
    voisines: [{ book_id: 10, image: { url: 'grande', width: 400 } }],
  } };
  const hc = creerHardcover({ cle: 'k', fetchImpl: async (u, o) => { corps = JSON.parse(o.body); return { status: 200, ok: true, headers: { get: () => null }, json: async () => donnees }; }, limiteur: async () => {} });
  const m = await hc.editionsEnLangue([10, 11], 'fr', { voisines: true });
  assert.match(corps.query, /voisines: editions/);
  assert.match(corps.query, /width: \{_gte: 200\}/);
  assert.equal(m.get(10)._imageVoisine.url, 'grande');
  assert.equal(m.get(11)._imageVoisine, undefined);
  // Sans l'option : une seule requête de champ, rien de plus décompté.
  await hc.editionsEnLangue([10], 'fr');
  assert.doesNotMatch(corps.query, /voisines/);
});

// ---- saga : les tomes rattachés à une autre saga « mise en avant » ne doivent pas disparaître (validation du catalogue, 2026-10-06)
function hardcoverFauxPourSerie(reponses) {
  const requetes = [];
  const fetchImpl = async (_url, init) => {
    const corps = JSON.parse(init.body);
    requetes.push(corps);
    return reponse(200, { data: reponses.shift() });
  };
  const h = creerHardcover({ cle: 'x', fetchImpl, limiteur: async () => {}, pausesReessaiMs: [] });
  return { h, requetes };
}
const ligne = (position, id, titre, users = 10) => ({ position, book: { id, title: titre, users_count: users, release_date: null, image: null } });

test('saga : un tome absent de la requête « mise en avant » est retrouvé par une 2e requête ciblée sur les positions manquantes', async () => {
  const { h, requetes } = hardcoverFauxPourSerie([
    { series_by_pk: { id: 1150, name: 'Dune', primary_books_count: 4, book_series: [ligne(1, 1, 'Dune'), ligne(2, 2, 'Dune Messiah'), ligne(2, 22, 'Le Messie de Dune')] } },
    { series_by_pk: { book_series: [ligne(3, 3, 'Children of Dune', 500), ligne(4, 4, 'God Emperor of Dune', 400)] } },
  ]);
  const s = await h.serie(1150);
  assert.equal(requetes.length, 2);
  assert.deepEqual(requetes[1].variables.positions, [3, 4]);
  assert.deepEqual([...new Set(s.book_series.map((e) => e.position))].sort(), [1, 2, 3, 4]);
  assert.equal(s.book_series.length, 5);   // les 3 lignes de départ (dont la traduction du tome 2) + les 2 retrouvées
});

test('saga : si tous les tomes annoncés sont là, aucun appel de plus (le quota Hardcover est compté)', async () => {
  const { h, requetes } = hardcoverFauxPourSerie([
    { series_by_pk: { id: 5, name: 'Complète', primary_books_count: 2, book_series: [ligne(1, 1, 'A'), ligne(2, 2, 'B')] } },
  ]);
  await h.serie(5);
  assert.equal(requetes.length, 1);
});

test("saga : un total annoncé inconnu (null) ou une 2e requête qui échoue ne casse pas la saga", async () => {
  const { h } = hardcoverFauxPourSerie([{ series_by_pk: { id: 6, name: 'Sans total', primary_books_count: null, book_series: [ligne(1, 1, 'A')] } }]);
  assert.equal((await h.serie(6)).book_series.length, 1);
  let n = 0;
  const fetchImpl = async () => { n += 1; return n === 1 ? reponse(200, { data: { series_by_pk: { id: 7, name: 'X', primary_books_count: 3, book_series: [ligne(1, 1, 'A')] } } }) : reponse(500, {}); };
  const h2 = creerHardcover({ cle: 'x', fetchImpl, limiteur: async () => {}, pausesReessaiMs: [] });
  assert.equal((await h2.serie(7)).book_series.length, 1);
});
