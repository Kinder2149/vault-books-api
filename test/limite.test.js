import test from 'node:test';
import assert from 'node:assert/strict';
import { creerLimiteClient, clientDe } from '../src/limite.js';

test('limite : le 91e appel de la minute est refusé, les 90 premiers passent', () => {
  let t = 0;
  const l = creerLimiteClient({ max: 90, fenetreMs: 60_000, maintenant: () => t });
  for (let i = 1; i <= 90; i += 1) assert.equal(l.verifier('1.2.3.4').autorise, true, `appel ${i}`);
  const refus = l.verifier('1.2.3.4');
  assert.equal(refus.autorise, false);
  assert.ok(refus.reessayerDansSecondes >= 1 && refus.reessayerDansSecondes <= 60);
});

test('limite : chaque client a son compteur ; un abus ne gêne pas les autres', () => {
  const l = creerLimiteClient({ max: 2, maintenant: () => 0 });
  l.verifier('a'); l.verifier('a');
  assert.equal(l.verifier('a').autorise, false);
  assert.equal(l.verifier('b').autorise, true);
});

test('limite : la fenêtre se renouvelle, et la mémoire est nettoyée (rien ne s\'accumule)', () => {
  let t = 0;
  const l = creerLimiteClient({ max: 1, fenetreMs: 1000, maintenant: () => t });
  l.verifier('a');
  assert.equal(l.verifier('a').autorise, false);
  t = 1500;
  assert.equal(l.verifier('a').autorise, true);
  for (let i = 0; i < 50; i += 1) l.verifier(`c${i}`);
  t = 5000;
  l.verifier('z');
  assert.ok(l.taille() <= 2);
});

test('client : première adresse de la chaîne ; sans en-tête, null (regroupés sous « inconnu »)', () => {
  assert.equal(clientDe({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }), '203.0.113.9');
  assert.equal(clientDe({ 'x-vercel-forwarded-for': '198.51.100.7', 'x-forwarded-for': '1.1.1.1' }), '198.51.100.7');
  assert.equal(clientDe({}), null);
});
