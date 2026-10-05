import test from 'node:test';
import assert from 'node:assert/strict';
import { autoriseCron, lireTotal, creerEntretien, AGE_MAX_CACHE_MS, AGE_MAX_JOURNAL_MS } from '../src/entretien.js';

test('cron : sans secret configuré, tout est refusé (même un en-tête vide ou « Bearer undefined »)', () => {
  assert.equal(autoriseCron(undefined, ''), false);
  assert.equal(autoriseCron('Bearer ', ''), false);
  assert.equal(autoriseCron('Bearer undefined', undefined), false);
});

test('cron : seul « Bearer <secret> » exact est accepté', () => {
  assert.equal(autoriseCron('Bearer s3cret', 's3cret'), true);
  assert.equal(autoriseCron('Bearer autre', 's3cret'), false);
  assert.equal(autoriseCron('s3cret', 's3cret'), false);
  assert.equal(autoriseCron(undefined, 's3cret'), false);
});

test('Content-Range : le total est lu après la barre oblique', () => {
  assert.equal(lireTotal('0-0/129'), 129);
  assert.equal(lireTotal('*/101'), 101);
  assert.equal(lireTotal('*/0'), 0);
  assert.equal(lireTotal(null), null);
  assert.equal(lireTotal('n/importe quoi'), null);
});

/** Un faux Supabase qui note les requêtes et rend des totaux. */
function fauxSupabase({ totaux = {}, supprimes = {}, journalAbsent = false } = {}) {
  const appels = [];
  const fetchImpl = async (url, opts = {}) => {
    const methode = opts.method || 'GET';
    appels.push({ methode, url: decodeURIComponent(url), entetes: opts.headers });
    if (journalAbsent && url.includes('/request_log')) return { ok: false, status: 404, headers: { get: () => null } };
    const table = url.match(/rest\/v1\/([a-z_]+)/)[1];
    if (methode === 'DELETE') {
      const cle = url.includes('fetched_at') ? 'vieilles' : (table === 'request_log' ? 'journal' : 'versions');
      return { ok: true, status: 200, headers: { get: () => `*/${supprimes[cle] ?? 0}` } };
    }
    return { ok: true, status: 200, headers: { get: () => `0-0/${totaux[table] ?? 0}` } };
  };
  return { appels, fetchImpl };
}

test("entretien : purge les anciennes versions SAUF les clés sans version (cover:, quota:), puis les entrées trop vieilles, puis le journal", async () => {
  const { appels, fetchImpl } = fauxSupabase({ totaux: { cache_entries: 129, request_log: 40 }, supprimes: { versions: 101, vieilles: 2, journal: 5 } });
  const t = 1_800_000_000_000;
  const r = await creerEntretien({ url: 'https://x.supabase.co', cle: 'sb_secret_k', version: 'v4', fetchImpl, maintenant: () => t }).executer();

  const suppressions = appels.filter((a) => a.methode === 'DELETE');
  assert.equal(suppressions.length, 3);
  assert.match(suppressions[0].url, /cache_entries\?and=\(key\.not\.like\.\*:v4:\*,key\.not\.like\.cover:\*,key\.not\.like\.quota:\*,key\.not\.like\.controle:\*\)/);
  assert.match(suppressions[1].url, new RegExp(`cache_entries\\?fetched_at=lt\\.${new Date(t - AGE_MAX_CACHE_MS).toISOString().replace(/[.]/g, '\\.')}`));
  assert.match(suppressions[2].url, new RegExp(`request_log\\?at=lt\\.${new Date(t - AGE_MAX_JOURNAL_MS).toISOString().replace(/[.]/g, '\\.')}`));
  assert.equal(r.anciennesVersions, 101);
  assert.equal(r.tropVieilles, 2);
  assert.equal(r.journalPurge, 5);
  assert.equal(r.ok, true);
});

test("entretien : la clé secrète part dans apikey seulement (format sb_secret_), et l'entretien lit AVANT d'écrire (garde le projet actif)", async () => {
  const { appels, fetchImpl } = fauxSupabase();
  await creerEntretien({ url: 'https://x.supabase.co', cle: 'sb_secret_k', version: 'v4', fetchImpl }).executer();
  assert.equal(appels[0].methode, 'GET');
  assert.equal(appels[0].entetes.apikey, 'sb_secret_k');
  assert.equal(appels[0].entetes.authorization, undefined);
});

test("entretien : une table de journal absente ne fait PAS échouer l'entretien du cache", async () => {
  const { fetchImpl } = fauxSupabase({ journalAbsent: true, supprimes: { versions: 3 } });
  const r = await creerEntretien({ url: 'https://x.supabase.co', cle: 'k', version: 'v4', fetchImpl }).executer();
  assert.equal(r.anciennesVersions, 3);
  assert.equal(r.journal, null);
  assert.equal(r.journalPurge, null);
});

test("entretien : une panne de Supabase est une erreur (le cron la signalera), pas un faux succès", async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, headers: { get: () => null } });
  await assert.rejects(() => creerEntretien({ url: 'https://x.supabase.co', cle: 'k', version: 'v4', fetchImpl }).executer(), /503/);
});
