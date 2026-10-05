import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliser, sansArticle } from '../src/text.js';
import { correspondance, popularite, construireCartes } from '../src/rank.js';

const hit = (o) => ({ id: String(o.id), title: o.title, author_names: o.auteurs || ['X'], users_count: o.lecteurs ?? 0,
  image: { url: 'https://img/x.jpg' }, alternative_titles: o.alt || [], compilation: false,
  featured_series: o.serie ? { position: o.pos ?? 1, series: { id: o.serie, name: o.nomSerie || 'Serie', primary_books_count: o.total ?? 5 } } : null });

test('normaliser retire accents, casse et ponctuation', () => {
  assert.equal(normaliser("Les Chevaliers d'Émeraude !"), 'les chevaliers d emeraude');
});

test("l'article de tête ne compte pas, mais un titre d'un seul mot est gardé", () => {
  assert.equal(sansArticle('the lord of the rings'), 'lord of the rings');
  assert.equal(sansArticle('le'), 'le');
});

test('correspondance : exact > début > contient', () => {
  assert.equal(correspondance('A Game of Thrones', 'game of thrones'), 100);   // article ignoré
  assert.equal(correspondance('Game of Thrones Cookbook', 'game of thrones'), 70);
  assert.equal(correspondance('The Making of Game of Thrones', 'game of thrones'), 40);
  assert.equal(correspondance('Dune', 'germinal'), 0);
});

test('popularité : croissante et plafonnée', () => {
  assert.ok(popularite(1000) > popularite(10));
  assert.equal(popularite(1e12), 40);
  assert.equal(popularite(undefined), 0);
});

test('une saga forme UNE carte, quel que soit le nombre de livres trouvés', () => {
  const hits = [
    hit({ id: 1, title: 'A Game of Thrones', lecteurs: 9000, serie: 981, nomSerie: 'A Song of Ice and Fire', pos: 1 }),
    hit({ id: 2, title: 'A Clash of Kings', lecteurs: 5000, serie: 981, nomSerie: 'A Song of Ice and Fire', pos: 2 }),
    hit({ id: 3, title: 'A Storm of Swords', lecteurs: 4000, serie: 981, nomSerie: 'A Song of Ice and Fire', pos: 3 }),
  ];
  const cartes = construireCartes(hits, 'game of thrones');
  assert.equal(cartes.length, 1);
  assert.equal(cartes[0].type, 'serie');
  assert.equal(cartes[0].id, 981);
  assert.equal(cartes[0].tomes, 5);
});

test('les compilations (coffrets) ne sont jamais des résultats', () => {
  const coffret = { ...hit({ id: 9, title: 'Game of Thrones Boxed Set', lecteurs: 500 }), compilation: true };
  assert.equal(construireCartes([coffret], 'game of thrones').length, 0);
});

test("la popularité départage des titres homonymes (« les fourmis » : Werber avant Vian)", () => {
  const hits = [
    hit({ id: 1, title: 'Les Fourmis', auteurs: ['Boris Vian'], lecteurs: 9 }),
    hit({ id: 2, title: 'Empire of the Ants', auteurs: ['Bernard Werber'], lecteurs: 170, alt: ['Les fourmis'] }),
  ];
  const cartes = construireCartes(hits, 'les fourmis');
  assert.equal(cartes[0].auteurs[0], 'Bernard Werber');
});

test("un roman cherché par son titre au milieu d'un grand cycle est un LIVRE (germinal), pas la série", () => {
  const h = hit({ id: 1, title: 'Germinal', auteurs: ['Émile Zola'], lecteurs: 343, serie: 5, nomSerie: 'Les Rougon-Macquart', pos: 13, total: 20 });
  const [c] = construireCartes([h], 'germinal');
  assert.equal(c.type, 'livre');
  assert.deepEqual(c.serie, { id: 5, nom: 'Les Rougon-Macquart', position: 13 });
});

test("mais le tome 1 d'une saga reste une carte SAGA (game of thrones)", () => {
  const h = hit({ id: 1, title: 'A Game of Thrones', lecteurs: 9800, serie: 981, nomSerie: 'A Song of Ice and Fire', pos: 1, total: 5 });
  assert.equal(construireCartes([h], 'game of thrones')[0].type, 'serie');
});

test('les séries « de facture » passent derrière les vraies sagas', () => {
  const hits = [
    hit({ id: 1, title: 'Dune', lecteurs: 14000, serie: 10, nomSerie: 'Dune', pos: 1, total: 6 }),
    hit({ id: 2, title: 'Dune', lecteurs: 14000, serie: 11, nomSerie: 'Dune Split-Volume Translation', pos: 1, total: 8 }),
  ];
  const cartes = construireCartes(hits, 'dune');
  assert.equal(cartes[0].titre, 'Dune');
  assert.ok(cartes[1].score < cartes[0].score - 30);
});

test('les corrections renomment une saga et fusionnent ses doublons', () => {
  const hits = [
    hit({ id: 1, title: 'The Fellowship of the Ring', lecteurs: 9900, serie: 1130, nomSerie: 'The Lord of the Rings', total: 3 }),
    hit({ id: 2, title: 'La fraternité de l\'anneau', lecteurs: 5, serie: 87481, nomSerie: 'Le Seigneur des Anneaux', total: 3 }),
  ];
  const cartes = construireCartes(hits, 'seigneur des anneaux', {
    idCanonique: (id) => (id === 87481 ? 1130 : id),
    nom: (id, lang, d) => (id === 1130 && lang === 'fr' ? 'Le Seigneur des anneaux' : d),
    lang: 'fr',
  });
  assert.equal(cartes.length, 1);
  assert.equal(cartes[0].titre, 'Le Seigneur des anneaux');
});
