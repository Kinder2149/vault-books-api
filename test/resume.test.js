import test from 'node:test';
import assert from 'node:assert/strict';
import { nettoyerResume, langueResume } from '../src/resume.js';

test('résumé : balises et entités HTML retirées, espaces réduits', () => {
  const t = nettoyerResume('<p>Dans un monde où les <b>dragons</b> sont revenus, un jeune h&eacute;ros&nbsp;part &amp; cherche sa&nbsp;famille.</p><p>Il rencontrera des alli&eacute;s inattendus.</p>');
  assert.ok(!/[<>]/.test(t));
  assert.match(t, /dragons sont revenus/);
  assert.match(t, /cherche sa famille/);
  assert.match(t, /\n\n/);                                 // les paragraphes restent séparés
});

test("résumé : trop court (mention d'éditeur) → null ; absent → null", () => {
  assert.equal(nettoyerResume('Roman.'), null);
  assert.equal(nettoyerResume(''), null);
  assert.equal(nettoyerResume(null), null);
});

test('résumé : coupé proprement à 1 500 caractères, à la fin d\'une phrase si possible, avec des points de suspension', () => {
  const phrase = 'Le héros traverse la forêt sombre pour retrouver son frère disparu depuis des années. ';
  const t = nettoyerResume(phrase.repeat(40));
  assert.ok(t.length <= 1501);
  assert.ok(t.endsWith('…'));
  assert.ok(t.slice(0, -1).trimEnd().endsWith('.'));
});

test('langue du résumé : français, anglais, ou null quand on ne peut pas trancher', () => {
  assert.equal(langueResume('Dans un royaume où la magie est interdite, une jeune fille qui ne connaît pas son pouvoir part pour la capitale avec son frère.'), 'fr');
  assert.equal(langueResume('In a kingdom where magic is forbidden, a young girl who does not know her power travels to the capital with her brother.'), 'en');
  assert.equal(langueResume('Dune Arrakis Paul Atreides'), null);          // trop peu de mots courants
  assert.equal(langueResume(null), null);
});
