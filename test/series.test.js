import test from 'node:test';
import assert from 'node:assert/strict';
import { construireSerie } from '../src/series.js';

const livre = (id, title, users = 0, img = true) => ({ id, title, users_count: users, image: img ? { url: `https://img/${id}.jpg` } : null });
const entree = (position, book) => ({ position, book });
const edition = (id, title, isbn, editeur = 'Michel Lafon') => ({ id, title, isbn_13: isbn, publisher: { name: editeur }, release_date: '2009-05-14', image: { url: `https://img/e${id}.jpg` } });

const SERIE = { id: 25608, name: "Les Chevaliers d'Émeraude", primary_books_count: 12 };

test("par position, le livre qui a une édition dans la langue gagne sur sa traduction étrangère", () => {
  const entrees = [
    entree(1, livre(10, 'Fire in the Sky', 1)),
    entree(1, livre(11, 'Le Feu dans le ciel', 36)),
    entree(2, livre(20, 'The Dragons of the Dark Emperor', 1)),
    entree(2, livre(21, "Les dragons de l'Empereur Noir", 32)),
  ];
  const editions = new Map([[11, edition(1, 'Le Feu dans le ciel', '9782890746626')], [21, edition(2, "Les dragons de l'Empereur Noir", '9782890746725')]]);
  const s = construireSerie({ serie: SERIE, entrees, editions, lang: 'fr' });
  assert.deepEqual(s.tomes.map((t) => t.titre), ['Le Feu dans le ciel', "Les dragons de l'Empereur Noir"]);
  assert.deepEqual(s.tomes.map((t) => t.edition.isbn13), ['9782890746626', '9782890746725']);
  assert.equal(s.disponibles, 2);
});

test("un doublon « Tome 7 : … » sans édition FR ne remplace pas la vraie entrée", () => {
  const entrees = [entree(7, livre(70, "Les Chevaliers d'Emeraude, Tome 7 : L'enlèvement", 1)), entree(7, livre(71, "L'enlèvement", 25))];
  const editions = new Map([[71, edition(7, "L'enlèvement", '9782890746824')]]);
  const s = construireSerie({ serie: SERIE, entrees, editions, lang: 'fr' });
  assert.equal(s.tomes.length, 1);
  assert.equal(s.tomes[0].livreId, 71);
});

test('les positions décimales sont rangées en « parties » sous leur tome, jamais mélangées aux tomes entiers', () => {
  const entrees = [entree(1, livre(1, 'A Game of Thrones', 9808)), entree(1.1, livre(2, 'Le trône de fer', 21)), entree(1.2, livre(3, 'Le Donjon Rouge', 11)), entree(2, livre(4, 'A Clash of Kings', 5000))];
  const editions = new Map([[1, edition(4, 'Intégrale 1', '9782290019436', "J'ai lu")], [2, edition(5, 'Le trône de fer', '9782290302866', "J'ai lu")], [3, edition(6, 'Le Donjon Rouge', '9782290313183', "J'ai lu")]]);
  const s = construireSerie({ serie: { id: 981, name: 'ASOIAF', primary_books_count: 6 }, entrees, editions, lang: 'fr' });
  assert.deepEqual(s.tomes.map((t) => t.position), [1, 2]);
  assert.deepEqual(s.tomes[0].parties.map((p) => p.position), [1.1, 1.2]);
  assert.deepEqual(s.tomes[1].parties, []);
});

test("un tome sans édition entière mais avec des volumes coupés dans la langue reste disponible", () => {
  const entrees = [entree(3, livre(30, 'A Storm of Swords', 5095)), entree(3.1, livre(31, 'Intrigues à Port-Réal', 5)), entree(3.2, livre(32, "L'épée de feu", 5))];
  const editions = new Map([[31, edition(1, 'Intrigues à Port-Réal', '9782290325704')], [32, edition(2, "L'épée de feu", '9782290329535')]]);
  const s = construireSerie({ serie: { id: 981, name: 'ASOIAF', primary_books_count: 6 }, entrees, editions, lang: 'fr' });
  assert.equal(s.tomes[0].disponible, true);
  assert.equal(s.tomes[0].viaParties, true);
  assert.equal(s.tomes[0].edition, null);
  assert.equal(s.disponibles, 1);
});

test('une position exclue par les corrections disparaît (ex. Tom Bombadil à 1.5)', () => {
  const entrees = [entree(1, livre(1, 'The Fellowship of the Ring', 9932)), entree(1.5, livre(2, 'The Adventures of Tom Bombadil', 6))];
  const s = construireSerie({ serie: { id: 1130, name: 'LOTR', primary_books_count: 3 }, entrees, editions: new Map(), lang: 'fr', exclurePositions: [1.5] });
  assert.deepEqual(s.tomes[0].parties, []);
  assert.deepEqual(s.horsSerie, []);
});

test('une position décimale sans tome parent va en hors-série', () => {
  const s = construireSerie({ serie: SERIE, entrees: [entree(0.5, livre(9, 'Préquelle', 3))], editions: new Map(), lang: 'fr' });
  assert.equal(s.tomes.length, 0);
  assert.equal(s.horsSerie.length, 1);
});

test("un tome sans édition dans la langue reste visible, marqué indisponible", () => {
  const s = construireSerie({ serie: SERIE, entrees: [entree(3, livre(30, 'Piège au royaume des ombres', 10))], editions: new Map(), lang: 'fr' });
  assert.equal(s.tomes[0].disponible, false);
  assert.equal(s.tomes[0].edition, null);
  assert.equal(s.disponibles, 0);
});

test('la couverture vient de l\'édition dans la langue, sinon du livre', () => {
  const entrees = [entree(1, livre(1, 'Un', 5)), entree(2, livre(2, 'Deux', 5))];
  const s = construireSerie({ serie: SERIE, entrees, editions: new Map([[1, edition(9, 'Un', '1')]]), lang: 'fr' });
  assert.equal(s.tomes[0].couverture, 'https://img/e9.jpg');
  assert.equal(s.tomes[1].couverture, 'https://img/2.jpg');
});

test('un tome pas encore paru est signalé et ne compte pas dans « disponibles »', () => {
  const entrees = [{ position: 1, book: { ...livre(1, 'Un', 5), release_date: '2003-01-01' } }, { position: 2, book: { ...livre(2, 'Deux', 5), release_date: '2999-01-01' } }];
  const s = construireSerie({ serie: SERIE, entrees, editions: new Map([[1, edition(1, 'Un', '1')], [2, edition(2, 'Deux', '2')]]), lang: 'fr', aujourdhui: '2026-10-05' });
  assert.equal(s.tomes[1].aParaitre, true);
  assert.equal(s.disponibles, 1);
  assert.equal(s.aParaitre, 1);
});

test("la source de la couverture est tracée : image d'édition ou, à défaut, image du livre", () => {
  const entrees = [entree(1, livre(1, 'Un', 5)), entree(2, livre(2, 'Deux', 5))];
  const ed = { id: 1, title: 'Un', isbn_13: '1', image: { url: 'https://img/e.jpg' } };
  const s = construireSerie({ serie: SERIE, entrees, editions: new Map([[1, ed], [2, { id: 2, title: 'Deux', isbn_13: '2', image: null }]]), lang: 'fr' });
  assert.equal(s.tomes[0].couvertureSource, 'edition');
  assert.equal(s.tomes[1].couvertureSource, 'livre');
});

test('sans date de sortie ni édition dans la langue, un tome est « à paraître » (The Winds of Winter) ; avec une édition, non', () => {
  const sansDate = (id) => ({ ...livre(id, `T${id}`, 5), release_date: null });
  const s = construireSerie({ serie: SERIE, entrees: [entree(1, sansDate(1)), entree(2, sansDate(2))], editions: new Map([[1, edition(1, 'T1', '1')]]), lang: 'fr', aujourdhui: '2026-10-05' });
  assert.deepEqual(s.tomes.map((t) => t.aParaitre), [false, true]);
});

test('une édition dont l\'image fait moins de 200 px est tracée « edition-petite », pas « edition »', () => {
  const ed = { id: 1, title: 'Un', isbn_13: '1', image: { url: 'https://img/p.jpg', width: 98 } };
  const s = construireSerie({ serie: SERIE, entrees: [entree(1, livre(1, 'Un', 5))], editions: new Map([[1, ed]]), lang: 'fr' });
  assert.equal(s.tomes[0].couvertureSource, 'edition-petite');
  assert.equal(s.tomes[0]._couverturePetite, 'https://img/p.jpg');
});
