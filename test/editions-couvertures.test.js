import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatNormalise, pagesPlausibles, rangFormat } from '../src/formats.js';
import { partBlanche } from '../src/images.js';
import { versIsbn10 } from '../src/isbn.js';
import { fusionnerEditions } from '../src/editions.js';
import { creerCouvertures } from '../src/covers.js';
import { creerService } from '../src/service.js';
import { cacheMemoire } from '../src/cache.js';

const fixture = (nom) => readFileSync(new URL(`./fixtures-images/${nom}`, import.meta.url));

test('format : audio, numérique, poche, papier, inconnu — la durée audio et le format de lecture priment sur le texte', () => {
  assert.equal(formatNormalise({ edition_format: 'Audiobook', reading_format: { format: 'Listened' }, audio_seconds: 30060 }), 'audio');
  assert.equal(formatNormalise({ edition_format: 'MP3 CD', reading_format: { format: 'Read' } }), 'audio');   // mal rangé par Hardcover
  assert.equal(formatNormalise({ edition_format: null, audio_seconds: 120 }), 'audio');
  assert.equal(formatNormalise({ edition_format: 'Kindle Edition', reading_format: { format: 'Read' } }), 'numerique');
  assert.equal(formatNormalise({ edition_format: null, reading_format: { format: 'Ebook' } }), 'numerique');
  assert.equal(formatNormalise({ edition_format: 'Mass Market Paperback' }), 'poche');
  assert.equal(formatNormalise({ edition_format: 'Paperback' }), 'papier');
  assert.equal(formatNormalise({ edition_format: 'Hardcover' }), 'papier');
  assert.equal(formatNormalise({ edition_format: null }), null);
  assert.equal(formatNormalise(null), null);
  assert.ok(rangFormat('papier') < rangFormat('numerique') && rangFormat('numerique') < rangFormat('audio'));
});

test('pages : un nombre absurde devient null (11 pages pour un roman), jamais de pages pour de l’audio', () => {
  assert.equal(pagesPlausibles(11), null);
  assert.equal(pagesPlausibles(0), null);
  assert.equal(pagesPlausibles(232), 232);
  assert.equal(pagesPlausibles(99999), null);
  assert.equal(pagesPlausibles(300, 'audio'), null);
  assert.equal(pagesPlausibles(null), null);
});

test('isbn-10 : tiré d’un ISBN-13 en 978, validé, absent pour un 979', () => {
  assert.equal(versIsbn10('9782070541270'), '2070541274');
  assert.equal(versIsbn10('2070541274'), '2070541274');
  assert.equal(versIsbn10('2070541275'), null);
  assert.equal(versIsbn10('9791234567896'), null);
});

test('page de titre scannée : détectée (≈ 92 % de blanc) ; une vraie couverture, non ; ce qui n’est pas un JPEG de base, on ne le juge pas', () => {
  assert.ok(partBlanche(fixture('page-de-titre.jpg')) > 0.75);
  assert.ok(partBlanche(fixture('couverture-hp.jpg')) < 0.1);
  assert.equal(partBlanche(Buffer.from('pas une image')), null);
  assert.equal(partBlanche(Buffer.from([0xff, 0xd8, 0xff, 0xc2, 0, 4, 0, 0])), null);   // progressif
});

const jpeg = (nom) => ({ status: 200, ok: true, headers: { get: () => null }, arrayBuffer: async () => { const b = fixture(nom); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } });

test('Open Library : une page de titre scannée n’est pas une couverture (« Les dragons de l’Empereur Noir »), et on s’en souvient', async () => {
  let appels = 0;
  const c = creerCouvertures({ cache: cacheMemoire(), fetchImpl: async () => { appels += 1; return jpeg('page-de-titre.jpg'); } });
  const a = await c.resoudre({ isbn13: '9782890746725' });
  await c.resoudre({ isbn13: '9782890746725' });
  assert.equal(a.url, null);
  assert.equal(a.qualite, 0);
  assert.equal(appels, 1);
});

test('Open Library : une vraie couverture est gardée, avec sa qualité', async () => {
  const c = creerCouvertures({ cache: cacheMemoire(), fetchImpl: async () => jpeg('couverture-hp.jpg') });
  const r = await c.resoudre({ isbn13: '9782075145930' });
  assert.equal(r.source, 'openlibrary');
  assert.equal(r.qualite, 0.8);
});

test('éditions : format normalisé, ISBN-10, pages plausibles, papier avant audio, une édition audio ne passe pas devant du papier', () => {
  const hc = [
    { isbn_13: '9782075105026', title: 'HP audio', edition_format: 'Audiobook', reading_format: { format: 'Listened' }, audio_seconds: 30060, release_date: '2018-10-04', pages: null },
    { isbn_13: '9782070541270', title: 'HP poche', edition_format: 'Mass Market Paperback', pages: 232, release_date: '1997-06-26', publisher: { name: 'Gallimard Jeunesse' } },
    { isbn_13: '9782890746626', title: 'HP faux', edition_format: 'Paperback', pages: 11, release_date: '2010-01-01' },
  ];
  const e = fusionnerEditions({ editionsHardcover: hc, titre: 'HP' });
  assert.deepEqual(e.map((x) => x.format), ['papier', 'poche', 'audio']);
  const poche = e.find((x) => x.isbn13 === '9782070541270');
  assert.equal(poche.isbn10, '2070541274');
  assert.equal(poche.pages, 232);
  assert.equal(e.find((x) => x.isbn13 === '9782890746626').pages, null);
  assert.equal(e.find((x) => x.format === 'audio').pages, null);
});

test('isbn : pages douteuses → null, format normalisé et ISBN-10', async () => {
  const ed = { id: 1, title: 'Le Feu dans le ciel', isbn_13: '9782890746626', pages: 11, edition_format: 'Paperback', language: { code2: 'fr' }, publisher: { name: 'Mortagne' }, release_date: '2003-01-01', image: null, book: { id: 5, title: 'Le Feu dans le ciel', contributions: [], book_series: [] } };
  const s = creerService({ hardcover: { async editionParIsbn() { return ed; } }, cache: cacheMemoire() });
  const r = await s.isbn('9782890746626');
  assert.equal(r.nbPages, null);
  assert.equal(r.format, 'papier');
  assert.equal(r.formatBrut, 'Paperback');
  assert.equal(r.isbn10, versIsbn10('9782890746626'));
});
