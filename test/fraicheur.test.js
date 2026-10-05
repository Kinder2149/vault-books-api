import test from 'node:test';
import assert from 'node:assert/strict';
import { choisirLivres, avanceDeCatalogage, premieresApparitions, resumer } from '../src/fraicheur.js';

test('fraîcheur : on suit les livres qui ont un ISBN d\'abord, puis les plus lus, un par livre', () => {
  const c = [
    { bookId: 1, lecteurs: 500, isbns: [] },
    { bookId: 2, lecteurs: 10, isbns: ['978'] },
    { bookId: 2, lecteurs: 10, isbns: ['978'] },
    { bookId: 3, lecteurs: 50, isbns: ['979'] },
  ];
  assert.deepEqual(choisirLivres(c, 3).map((x) => x.bookId), [3, 2, 1]);
  assert.deepEqual(choisirLivres(c, 1).map((x) => x.bookId), [3]);
});

test('fraîcheur : l\'avance de catalogage compte les livres créés avant leur parution (écart négatif)', () => {
  const a = avanceDeCatalogage([
    { date: '2026-09-10', creeLe: '2026-03-10T00:00:00Z' },
    { date: '2026-09-10', creeLe: '2026-09-10T08:00:00Z' },
    { date: '2026-09-10', creeLe: '2026-09-20T00:00:00Z' },
    { date: null, creeLe: '2026-09-20T00:00:00Z' },
  ]);
  assert.equal(a.echantillon, 3);
  assert.equal(a.avantParution, 2);
  assert.equal(a.mediane, 0);
  assert.equal(avanceDeCatalogage([]), null);
});

test('fraîcheur : le premier jour positif de chaque critère, et son écart avec la parution', () => {
  const livres = [{ id: 'fr-1', titre: 'X', date: '2026-10-10', langue: 'fr' }];
  const releves = [
    { date: '2026-10-08', livre: 'fr-1', criteres: { bnf: false, hcIsbn: true } },
    { date: '2026-10-12', livre: 'fr-1', criteres: { bnf: true, hcIsbn: true } },
    { date: '2026-10-09', livre: 'fr-1', criteres: { bnf: false, hcIsbn: true } },
    { date: '2026-10-13', livre: 'fr-1', criteres: { bnf: true, hcIsbn: true } },
  ];
  const [a] = premieresApparitions(livres, releves);
  assert.deepEqual(a.criteres.bnf, { jour: '2026-10-12', apresParution: 2 });
  assert.deepEqual(a.criteres.hcIsbn, { jour: '2026-10-08', apresParution: -2 });
  assert.equal(a.releves, 4);
});

test('fraîcheur : « non mesurable » (null) n\'est pas « absent », et un critère jamais vu reste null', () => {
  const livres = [{ id: 'en-1', titre: 'Y', date: '2026-10-10', langue: 'en' }];
  const releves = [{ date: '2026-10-11', livre: 'en-1', criteres: { bnf: null, olNotice: false } }];
  const [a] = premieresApparitions(livres, releves);
  assert.equal(a.criteres.bnf, null);
  assert.equal(a.criteres.olNotice, null);
});

test('fraîcheur : le résumé donne la médiane par langue et critère', () => {
  const app = [
    { langue: 'fr', criteres: { bnf: { apresParution: 1 } } },
    { langue: 'fr', criteres: { bnf: { apresParution: 5 } } },
    { langue: 'fr', criteres: { bnf: null } },
    { langue: 'en', criteres: { bnf: null } },
  ];
  const r = resumer(app);
  const fr = r.find((x) => x.langue === 'fr');
  assert.deepEqual([fr.suivis, fr.vus, fr.medianeJours], [3, 2, 5]);
  assert.equal(r.find((x) => x.langue === 'en').medianeJours, null);
});
