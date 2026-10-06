import test from 'node:test';
import assert from 'node:assert/strict';
import { nettoyerResume, langueResume, resumePourLangue } from '../src/resume.js';
import { creerService } from '../src/service.js';
import { cacheMemoire } from '../src/cache.js';

const FR = "Dans un royaume où la magie est interdite, une jeune fille qui ne connaît pas son pouvoir part pour la capitale avec son frère et ses amis.";
const EN = 'In a kingdom where magic is forbidden, a young girl who does not know her power travels to the capital with her brother and her friends.';

test('résumé : le balisage Markdown est retiré (gras, titres, liens, renvois de notes, adresses, séparateurs)', () => {
  const brut = `### Résumé\n\n**Harry Potter** vit chez les Dursley, qui le traitent *très* mal ([Source][1]). Voir [la fiche](https://openlibrary.org/works/OL1W) et http://example.org/x.\n\n----\n\nUn jour, une lettre arrive pour lui[2] : il est sorcier, et son destin va changer.\n\n[1]: https://openlibrary.org/works/OL82563W\n[2]: https://example.org`;
  const t = nettoyerResume(brut);
  assert.doesNotMatch(t, /[*#]|\]\(|\[\d\]|https?:|----|openlibrary/);
  assert.match(t, /^Résumé\n\nHarry Potter vit chez les Dursley, qui le traitent très mal\./);
  assert.match(t, /Un jour, une lettre arrive pour lui : il est sorcier/);
  assert.doesNotMatch(t, /Source/);
});

test('résumé : un astérisque ou un souligné légitime au milieu d’un mot reste', () => {
  const t = nettoyerResume(`${FR} Le code secret est a*b_c et il ne faut pas le perdre.`);
  assert.match(t, /a\*b_c/);
});

test('résumé : un texte réduit à du balisage ou à un lien n’est pas un résumé', () => {
  assert.equal(nettoyerResume('**[Source](https://x.org/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)**'), null);
});

test('langue du résumé : français, anglais, et les langues tierces (espagnol, allemand, italien, portugais) sont reconnues comme telles', () => {
  assert.equal(langueResume(FR), 'fr');
  assert.equal(langueResume(EN), 'en');
  assert.equal(langueResume('En un reino donde la magia está prohibida, una joven que no conoce su poder viaja a la capital con su hermano y los amigos del pueblo.'), 'es');
  assert.equal(langueResume('In einem Königreich, in dem die Magie verboten ist, reist ein junges Mädchen mit ihrem Bruder und den Freunden in die Hauptstadt, und das ist nicht einfach.'), 'de');
  assert.equal(langueResume('In un regno dove la magia è proibita, una giovane che non conosce il suo potere viaggia verso la capitale con suo fratello e con gli amici del villaggio.'), 'it');
  assert.equal(langueResume('Dune Arrakis Paul Atreides'), null);
});

test('résumé mêlé de deux langues : indécidable, donc absent dans les deux', () => {
  const mele = `${FR} ${EN}`;
  assert.equal(langueResume(mele), null);
  assert.deepEqual(resumePourLangue(mele, 'fr'), { resume: null, resumeLangue: null });
  assert.deepEqual(resumePourLangue(mele, 'en'), { resume: null, resumeLangue: null });
});

test('résumé pour une langue : rendu s’il est dans cette langue, absent sinon — jamais l’autre langue', () => {
  assert.deepEqual(resumePourLangue(FR, 'fr'), { resume: FR, resumeLangue: 'fr' });
  assert.deepEqual(resumePourLangue(FR, 'en'), { resume: null, resumeLangue: null });
  assert.deepEqual(resumePourLangue(EN, 'fr'), { resume: null, resumeLangue: null });
  assert.deepEqual(resumePourLangue(null, 'fr'), { resume: null, resumeLangue: null });
});

test('livre lang=both : le résumé français n’apparaît que dans le bloc français, l’anglais que dans l’anglais', async () => {
  const hc = { async livre(id, lang) { return { id: 5, title: 'Le Feu dans le ciel', description: FR, contributions: [], book_series: [], editions: [{ id: 1, title: 'Le Feu', isbn_13: '9782890746626', publisher: { name: 'M' }, release_date: '2003-01-01', image: null }] }; }, async rechercher() { return []; } };
  const r = await creerService({ hardcover: hc, cache: cacheMemoire() }).livre(5, 'both');
  assert.equal(r.langues.fr.resume, FR);
  assert.equal(r.langues.en.resume, null);
});

test('isbn : le résumé doit être dans la langue de l’édition scannée', async () => {
  const ed = (code) => ({ id: 1, title: 'T', isbn_13: '9782890746626', pages: 300, language: { code2: code }, publisher: { name: 'M' }, release_date: '2003-01-01', image: null, book: { id: 5, title: 'T', description: EN, contributions: [], book_series: [] } });
  const fr = await creerService({ hardcover: { async editionParIsbn() { return ed('fr'); } }, cache: cacheMemoire() }).isbn('9782890746626');
  assert.equal(fr.resume, null);
  const en = await creerService({ hardcover: { async editionParIsbn() { return ed('en'); } }, cache: cacheMemoire() }).isbn('9782890746626');
  assert.equal(en.resume, EN);
});

test('livre : sans résumé dans la langue, celui d’une TRADUCTION du livre est pris (un appel de plus) ; sans traduction convenable, absent', async () => {
  let appels = 0;
  const hc = {
    async livre() { return { id: 5, title: 'Harry Potter and the Philosopher’s Stone', canonical_id: null, description: EN, contributions: [], book_series: [], editions: [] }; },
    async descriptionsLivre(id) { appels += 1; assert.equal(id, 5); return [EN, FR]; },
  };
  const s = creerService({ hardcover: hc, cache: cacheMemoire() });
  const fr = await s.livre(5, 'fr');
  assert.equal(fr.resume, FR);
  assert.equal(fr.resumeLangue, 'fr');
  const en = await s.livre(5, 'en');
  assert.equal(en.resume, EN);
  assert.equal(appels, 1, 'le résumé anglais est direct : aucun appel de plus');
  const sans = creerService({ hardcover: { ...hc, async descriptionsLivre() { return [EN]; } }, cache: cacheMemoire() });
  assert.equal((await sans.livre(5, 'fr')).resume, null);
  const enPanne = creerService({ hardcover: { ...hc, async descriptionsLivre() { throw new Error('panne'); } }, cache: cacheMemoire() });
  assert.equal((await enPanne.livre(5, 'fr')).resume, null);
});

test('livre : pour un livre traduit, on cherche à partir de l’œuvre d’origine (canonical_id)', async () => {
  let demande = null;
  const hc = {
    async livre() { return { id: 99, title: 'Le Feu dans le ciel', canonical_id: 7, description: EN, contributions: [], book_series: [], editions: [] }; },
    async descriptionsLivre(id) { demande = id; return [FR]; },
  };
  const r = await creerService({ hardcover: hc, cache: cacheMemoire() }).livre(99, 'fr');
  assert.equal(demande, 7);
  assert.equal(r.resume, FR);
});
