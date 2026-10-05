import test from 'node:test';
import assert from 'node:assert/strict';
import { cleAcceptee } from '../src/http.js';

test("clé d'application : sans clé configurée tout passe ; avec, seule la bonne passe", () => {
  assert.equal(cleAcceptee(undefined, { appKey: '' }), true);
  assert.equal(cleAcceptee('a', { appKey: 'a' }), true);
  assert.equal(cleAcceptee('b', { appKey: 'a' }), false);
  assert.equal(cleAcceptee(undefined, { appKey: 'a' }), false);
});

test("rotation : l'ancienne clé reste acceptée tant qu'elle est configurée, et une clé vide n'ouvre rien", () => {
  const cfg = { appKey: 'nouvelle', appKeyPrecedente: 'ancienne' };
  assert.equal(cleAcceptee('ancienne', cfg), true);
  assert.equal(cleAcceptee('nouvelle', cfg), true);
  assert.equal(cleAcceptee('autre', cfg), false);
  assert.equal(cleAcceptee('', { appKey: 'nouvelle', appKeyPrecedente: '' }), false);
  assert.equal(cleAcceptee(undefined, { appKey: 'nouvelle', appKeyPrecedente: '' }), false);
});
