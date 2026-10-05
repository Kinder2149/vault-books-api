import test from 'node:test';
import assert from 'node:assert/strict';
import { adresseVivante, creerControleCouvertures } from '../src/controle-couvertures.js';

const rep = (status, type = 'image/jpeg', taille = 50000) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => ({ 'content-type': type, 'content-length': String(taille) }[k.toLowerCase()] ?? null) } });

test('adresse vivante : une image qui répond 200 est vivante ; 404, page HTML ou image minuscule ne le sont pas', async () => {
  assert.equal((await adresseVivante('https://x/a.jpg', async () => rep(200))).vivante, true);
  assert.equal((await adresseVivante('https://x/a.jpg', async () => rep(404))).vivante, false);
  assert.match((await adresseVivante('https://x/a.jpg', async () => rep(200, 'text/html'))).raison, /text\/html/);
  assert.match((await adresseVivante('https://x/a.jpg', async () => rep(200, 'image/gif', 43))).raison, /43 octets/);
});

test("adresse vivante : HEAD refusé (405) → on retente en GET ; un réseau coupé est une adresse morte, pas une erreur", async () => {
  const methodes = [];
  const f = async (u, o) => { methodes.push(o.method); return o.method === 'HEAD' ? rep(405) : rep(200); };
  assert.equal((await adresseVivante('https://x/a.jpg', f)).vivante, true);
  assert.deepEqual(methodes, ['HEAD', 'GET']);
  const coupe = await adresseVivante('https://x/a.jpg', async () => { throw new Error('ENOTFOUND'); });
  assert.deepEqual([coupe.vivante, coupe.raison], [false, 'ENOTFOUND']);
});

test('contrôle : liste les corrections dont l\'adresse est morte, triées, avec le total', async () => {
  const f = async (u) => {
    if (String(u).includes('supabase')) return { ok: true, json: async () => [{ key: 'isbn:2', url: 'https://x/mort.jpg' }, { key: 'isbn:1', url: 'https://x/vivant.jpg' }, { key: 'serie:5:3', url: 'https://x/mort2.jpg' }] };
    return String(u).includes('mort') ? rep(404) : rep(200);
  };
  const r = await creerControleCouvertures({ url: 'https://x.supabase.co', cle: 'k', fetchImpl: f, maintenant: () => 0 }).executer();
  assert.equal(r.total, 3);
  assert.deepEqual(r.mortes.map((m) => m.cle), ['isbn:2', 'serie:5:3']);
  assert.equal(r.verifieLe, '1970-01-01T00:00:00.000Z');
});

test("contrôle : aucune correction → rien à vérifier ; une panne de Supabase est une erreur", async () => {
  const vide = async () => ({ ok: true, json: async () => [] });
  assert.deepEqual((await creerControleCouvertures({ url: 'https://x', cle: 'k', fetchImpl: vide }).executer()).mortes, []);
  await assert.rejects(() => creerControleCouvertures({ url: 'https://x', cle: 'k', fetchImpl: async () => ({ ok: false, status: 500 }) }).executer(), /500/);
});
