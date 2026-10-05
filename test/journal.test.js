import test from 'node:test';
import assert from 'node:assert/strict';
import { ligneDeJournal, creerJournal } from '../src/journal.js';

test("journal : la ligne ne contient QUE route, statut, durée, cache, langue, erreur — jamais de texte de recherche ni d'IP", () => {
  const l = ligneDeJournal({ route: 'search', statut: 200, ms: 123.7, cache: 'frais', lang: 'FR', q: 'stephen king', ip: '1.2.3.4', entetes: { 'x-app-key': 'secret' } });
  assert.deepEqual(Object.keys(l).sort(), ['cache', 'erreur', 'langue', 'ms', 'route', 'statut']);
  assert.deepEqual(l, { route: 'search', statut: 200, ms: 124, cache: 'frais', langue: 'fr', erreur: null });
  assert.equal(JSON.stringify(l).includes('stephen'), false);
});

test("journal : un message d'erreur n'est gardé que pour une panne de source (5xx), tronqué ; jamais pour une erreur de requête (4xx)", () => {
  assert.equal(ligneDeJournal({ route: 'search', statut: 400, ms: 1, erreur: 'Langue non prise en charge : de' }).erreur, null);
  assert.equal(ligneDeJournal({ route: 'search', statut: 502, ms: 1, erreur: 'Hardcover a répondu 429' }).erreur, 'Hardcover a répondu 429');
  assert.equal(ligneDeJournal({ route: 'search', statut: 502, ms: 1, erreur: 'x'.repeat(500) }).erreur.length, 120);
});

test('journal : valeurs inconnues ramenées à null (langue, cache), durée jamais négative', () => {
  const l = ligneDeJournal({ route: 'isbn', statut: 200, ms: -5, cache: 'bizarre', lang: 'xx' });
  assert.deepEqual([l.cache, l.langue, l.ms], [null, null, 0]);
});

test('journal : une panne ou un délai dépassé ne fait JAMAIS échouer l\'appelant', async () => {
  const panne = creerJournal({ url: 'http://x', cle: 'k', fetchImpl: async () => { throw new Error('réseau coupé'); } });
  await panne.noter({ route: 'search', statut: 200, ms: 1 });                       // ne rejette pas
  const lent = creerJournal({ url: 'http://x', cle: 'k', delaiMs: 20, fetchImpl: (u, o) => new Promise((_, rejet) => o.signal.addEventListener('abort', () => rejet(new Error('abort')))) });
  const t0 = Date.now();
  await lent.noter({ route: 'search', statut: 200, ms: 1 });
  assert.ok(Date.now() - t0 < 500);
  assert.equal(await panne.stats(24), null);
});

test('journal : écrit une ligne en POST sur request_log, et lit les statistiques par la fonction SQL', async () => {
  const appels = [];
  const fetchImpl = async (url, o) => { appels.push({ url, methode: o.method, corps: o.body, entetes: o.headers }); return { ok: true, json: async () => ({ total: 7 }) }; };
  const j = creerJournal({ url: 'https://x.supabase.co', cle: 'sb_secret_k', fetchImpl });
  await j.noter({ route: 'search', statut: 200, ms: 5, cache: 'frais', langue: 'fr', erreur: null });
  assert.equal(appels[0].url, 'https://x.supabase.co/rest/v1/request_log');
  assert.equal(appels[0].entetes.apikey, 'sb_secret_k');
  assert.deepEqual((await j.stats(48)), { total: 7 });
  assert.equal(appels[1].url, 'https://x.supabase.co/rest/v1/rpc/stats_requetes');
  assert.equal(appels[1].corps, '{"heures":48}');
});
