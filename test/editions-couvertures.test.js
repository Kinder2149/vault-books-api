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

test('saga : un tome qui n’existe qu’en volumes coupés prend la couverture de son premier volume illustré', async () => {
  const bk = (id, title, users = 5) => ({ id, title, users_count: users, release_date: '2005-01-01', image: null });
  const serie = { id: 981, name: 'ASOIAF', primary_books_count: 1, book_series: [{ position: 3, book: bk(30, 'A Storm of Swords') }, { position: 3.1, book: bk(31, 'Intrigues') }, { position: 3.2, book: bk(32, 'Épée') }] };
  const ed = (id, i) => ({ id, title: `t${id}`, isbn_13: i, image: { url: `https://img/${id}.jpg`, width: 400 }, publisher: { name: 'J’ai lu' } });
  const hc = {
    async serie() { return serie; },
    async editionsEnLangue(ids, lang) { return lang === 'fr' ? new Map([[31, ed(1, '9782290325704')], [32, ed(2, '9782290329535')]]) : new Map(); },
  };
  const s = creerService({ hardcover: hc, cache: cacheMemoire(), couvertures: creerCouvertures({ cache: cacheMemoire(), fetchImpl: async () => ({ status: 404, ok: false }) }) });
  const r = await s.serie(981, 'fr');
  assert.equal(r.tomes[0].viaParties, true);
  assert.equal(r.tomes[0].couverture, 'https://img/1.jpg');
  assert.equal(r.tomes[0].couvertureSource, 'partie');
});

import { creerHardcover } from '../src/sources/hardcover.js';
import { construireSerie } from '../src/series.js';

test('édition mal étiquetée (« The Ugly Truth » rangé en français) : remplacée par une vraie édition française, ou écartée', async () => {
  const reponses = [
    { data: { editions: [{ id: 1, book_id: 10, title: 'The Ugly Truth' }, { id: 2, book_id: 11, title: 'Le Feu dans le ciel' }, { id: 3, book_id: 12, title: 'The Third Wish' }] } },
    { data: { editions: [{ id: 4, book_id: 10, title: 'The Ugly Truth' }, { id: 5, book_id: 10, title: 'La Vérité toute nue' }, { id: 6, book_id: 12, title: 'The Third Wish' }] } },
  ];
  const requetes = [];
  const fetchImpl = async (_u, o) => { requetes.push(JSON.parse(o.body)); return { status: 200, ok: true, headers: { get: () => null }, json: async () => reponses.shift() }; };
  const hc = creerHardcover({ cle: 'k', fetchImpl, limiteur: async () => {} });
  const m = await hc.editionsEnLangue([10, 11, 12], 'fr', { secoursAudio: false });
  assert.equal(m.get(10).title, 'La Vérité toute nue');   // remplacée
  assert.equal(m.get(11).title, 'Le Feu dans le ciel');   // intacte
  assert.equal(m.has(12), false);                           // aucune vraie édition française : écartée
  assert.equal(requetes.length, 2);
  assert.deepEqual(requetes[1].variables.ids, [10, 12]);
});

test('un livre non paru dont la fiche n’a ni date ni pages (« The Winds of Winter ») est « à paraître », même avec une « édition »', () => {
  const livre = { id: 1, title: 'The Winds of Winter', users_count: 9000, release_date: null, image: null };
  const s = construireSerie({
    serie: { id: 1, name: 'ASOIAF', primary_books_count: 6 }, entrees: [{ position: 6, book: livre }],
    editions: new Map([[1, { id: 9, title: 'The Winds of Winter', isbn_13: '9780002247412', release_date: null, pages: null }]]), lang: 'en', aujourdhui: '2026-10-06',
  });
  assert.equal(s.tomes[0].statut, 'a_paraitre');
  assert.equal(s.aParaitre, 1);
});
