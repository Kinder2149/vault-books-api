import test from 'node:test';
import assert from 'node:assert/strict';
import { lireCleSerie, choisirSagas, nouveauxTomes, creerRafraichissement, CLE_NOUVEAUTES, livresARechauffer, rechauffer } from '../src/rafraichissement.js';
import { ErreurQuota } from '../src/service.js';
import { cacheMemoire } from '../src/cache.js';

test('rafraîchissement : seules les clés de saga de la version courante sont lues', () => {
  assert.deepEqual(lireCleSerie('serie:v5:fr:25608', 'v5'), { lang: 'fr', id: 25608 });
  assert.equal(lireCleSerie('serie:v4:fr:25608', 'v5'), null);
  assert.equal(lireCleSerie('search:v5:fr:dune', 'v5'), null);
  assert.equal(lireCleSerie('serie:v5:de:1', 'v5'), null);
});

test('rafraîchissement : les sagas en cours d\'abord, les plus anciennes d\'abord, bornées', () => {
  const l = [
    { key: 'serie:v5:fr:1', fetched_at: '2026-10-01T00:00:00Z', aparaitre: 0, disp: 5, total: 5 },    // complète : ignorée
    { key: 'serie:v5:fr:2', fetched_at: '2026-10-04T00:00:00Z', aparaitre: 1, disp: 4, total: 5 },    // à paraître
    { key: 'serie:v5:en:3', fetched_at: '2026-10-02T00:00:00Z', aparaitre: 0, disp: 3, total: 6 },    // incomplète
    { key: 'serie:v5:fr:4', fetched_at: '2026-10-03T00:00:00Z', aparaitre: 0, disp: 3, total: null },  // total inconnu : pas « en cours »
    { key: 'search:v5:fr:x', fetched_at: '2026-09-01T00:00:00Z', aparaitre: 2, disp: 1, total: 9 },
  ];
  assert.deepEqual(choisirSagas(l, 'v5').map((s) => s.id), [3, 2]);
  assert.deepEqual(choisirSagas(l, 'v5', 1).map((s) => s.id), [3]);
});

test('rafraîchissement : un nouveau tome est une hausse du nombre de tomes disponibles', () => {
  assert.equal(nouveauxTomes(4, 5), 1);
  assert.equal(nouveauxTomes(5, 5), 0);
  assert.equal(nouveauxTomes(5, 4), 0);
  assert.equal(nouveauxTomes(null, 3), 3);
});

function fauxSupabase(lignes) {
  return async () => ({ ok: true, status: 200, json: async () => lignes });
}
const lignes = [
  { key: 'serie:v5:fr:2', fetched_at: '2026-10-04T00:00:00Z', aparaitre: 1, disp: 4, total: 5 },
  { key: 'serie:v5:fr:9', fetched_at: '2026-10-05T00:00:00Z', aparaitre: 1, disp: 2, total: 3 },
];

test('rafraîchissement : relit les sagas en cours en forçant le cache et consigne le tome nouveau', async () => {
  const appels = [];
  const service = { async serie(id, lang, opts) { appels.push([id, lang, opts]); return { noms: { fr: `Saga ${id}` }, comptes: { fr: { disponibles: id === 2 ? 5 : 2 } } }; } };
  const cache = cacheMemoire();
  const r = await creerRafraichissement({ url: 'https://x', cle: 'k', service, cache, version: 'v5', fetchImpl: fauxSupabase(lignes) }).executer();
  assert.deepEqual(appels, [[2, 'both', { rafraichir: true }], [9, 'both', { rafraichir: true }]]);
  assert.equal(r.relues, 2);
  assert.equal(r.nouveautes.length, 1);
  assert.equal(r.nouveautes[0].nom, 'Saga 2');
  assert.equal((await cache.get(CLE_NOUVEAUTES)).valeur.evenements[0].nouveaux, 1);
});

test('rafraîchissement : le quota du jour arrête la relecture, sans erreur', async () => {
  const service = { async serie() { throw new ErreurQuota('bas'); } };
  const r = await creerRafraichissement({ url: 'https://x', cle: 'k', service, cache: cacheMemoire(), version: 'v5', fetchImpl: fauxSupabase(lignes) }).executer();
  assert.equal(r.arret, 'quota du jour');
  assert.equal(r.relues, 0);
});

test('rafraîchissement : une saga qui échoue ne retient pas les suivantes ; le budget de temps arrête la boucle', async () => {
  let n = 0;
  const service = { async serie(id) { n += 1; if (id === 2) throw new Error('panne'); return { noms: { fr: 'x' }, comptes: { fr: { disponibles: 2 } } }; } };
  const r = await creerRafraichissement({ url: 'https://x', cle: 'k', service, cache: cacheMemoire(), version: 'v5', fetchImpl: fauxSupabase(lignes) }).executer();
  assert.equal(n, 2);
  assert.equal(r.relues, 1);

  let t = 0;
  const lent = await creerRafraichissement({ url: 'https://x', cle: 'k', service, cache: cacheMemoire(), version: 'v5', fetchImpl: fauxSupabase(lignes), budgetMs: 10, maintenant: () => (t += 100) }).executer();
  assert.equal(lent.arret, 'budget de temps');
});

test('rafraîchissement : une panne de Supabase à la lecture est une erreur (l\'entretien la signalera sans échouer)', async () => {
  const service = { async serie() { return null; } };
  await assert.rejects(() => creerRafraichissement({ url: 'https://x', cle: 'k', service, cache: cacheMemoire(), version: 'v5', fetchImpl: async () => ({ ok: false, status: 503 }) }).executer(), /503/);
});

test('réchauffement : les tomes disponibles des sagas, sans doublon, volumes coupés compris, bornés', () => {
  const sagas = [
    { value: { tomes: [{ disponible: true, livreId: 1, parties: [] }, { disponible: false, livreId: 2, parties: [] }, { disponible: true, livreId: 3, parties: [{ livreId: 30 }] }] } },
    { value: { tomes: [{ disponible: true, livreId: 1, parties: [] }, { disponible: true, livreId: 4 }] } },
    { value: null },
  ];
  assert.deepEqual(livresARechauffer(sagas), [1, 3, 30, 4]);
  assert.deepEqual(livresARechauffer(sagas, 2), [1, 3]);
});

test('réchauffement : le bilan distingue le déjà-frais, la BnF ok, la BnF indisponible, et s\'arrête au quota', async () => {
  const reponses = { 1: { cache: 'frais' }, 2: { cache: 'absent', sourceBnf: 'ok' }, 3: { cache: 'absent', sourceBnf: 'indisponible' }, 4: null };
  const service = { async livre(id) { if (id === 5) throw new ErreurQuota('bas'); return reponses[id]; } };
  const b = await rechauffer({ service, ids: [1, 2, 3, 4, 5, 6] });
  assert.deepEqual([b.demandes, b.dejaEnCache, b.bnfOk, b.bnfIndisponible, b.absents, b.arret], [4, 1, 1, 1, 1, 'quota du jour']);
});
