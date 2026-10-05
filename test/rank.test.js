import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliser, sansArticle } from '../src/text.js';
import { correspondance, popularite, construireCartes, ecarterBruit } from '../src/rank.js';

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

// ------------------------------------------------------------------ bruit

const carte = (titre, auteur, lecteurs, score) => ({ titre, auteurs: [auteur], lecteurs, score });

test("bruit : un homonyme quasi inconnu d'un autre auteur disparaît derrière une œuvre très lue (le petit prince)", () => {
  const cartes = [
    carte('Le Petit Prince', 'Antoine de Saint-Exupéry', 5581, 154),
    carte('Les Contes Interdits', 'L.P. Sicard', 2, 119.7),
    carte('Le Petit Prince raconté aux enfants', 'Antoine de Saint-Exupéry', 1, 75.6),
    carte('Reborn!', 'Akira Amano', 1, 41.6),
  ];
  assert.deepEqual(ecarterBruit(cartes).map((c) => c.titre), ['Le Petit Prince', 'Le Petit Prince raconté aux enfants']);
});

test('bruit : un homonyme réellement lu reste (les fourmis : Werber et Vian)', () => {
  const cartes = [carte('La Saga des Fourmis', 'Bernard Werber', 170, 140), carte('Les Fourmis', 'Boris Vian', 9, 126)];
  assert.equal(ecarterBruit(cartes).length, 2);
});

test('bruit : un score négatif disparaît, mais seulement derrière une tête sûre', () => {
  assert.deepEqual(ecarterBruit([carte('Foundation', 'Isaac Asimov', 6079, 72), carte('Coffret en 5 volumes', 'Isaac Asimov', 1, -13)]).map((c) => c.titre), ['Foundation']);
  const faible = [carte('Un', 'A', 1, 30), carte('Deux', 'B', 1, -5)];
  assert.equal(ecarterBruit(faible).length, 2);             // aucune réponse franche : on ne juge pas
});

test('bruit : sans œuvre dominante (moins de 500 lecteurs en tête), seuls les scores négatifs partent', () => {
  const cartes = [carte('Les Chevaliers d\'Émeraude', 'Anne Robillard', 36, 102), carte('Autre', 'Quelqu\'un', 0, 60)];
  assert.equal(ecarterBruit(cartes).length, 2);
});

test('bruit : le premier résultat reste toujours, même seul', () => {
  assert.equal(ecarterBruit([carte('X', 'Y', 0, 80)]).length, 1);
  assert.deepEqual(ecarterBruit([]), []);
});

test('bruit : une série « technique » (traductions découpées, ordre de parution) disparaît derrière une vraie œuvre, jamais seule', () => {
  const tech = { ...carte('Dune Split-Volume Translation', 'Frank Herbert', 3, 87.5), _technique: true };
  assert.deepEqual(ecarterBruit([carte('Dune', 'Frank Herbert', 14234, 154), tech]).map((c) => c.titre), ['Dune']);
  assert.equal(ecarterBruit([tech]).length, 1);                                       // seule, elle reste : on ne rend jamais rien
});

test('bruit : un titre de plus de 20 mots (catalogue de bibliothèque) disparaît', () => {
  const long = carte('Catalogue des livres de la bibliothèque de feu C. L. L\'Héritier de Brutelle par G. Debure l\'aîné avec un extrait de l\'éloge du citoyen l\'Héritier par le citoyen Cuvier la vente se fera dans le courant du mois de germinal', 'Debure', 0, 49.6);
  assert.deepEqual(ecarterBruit([carte('Germinal', 'Émile Zola', 343, 144), long]).map((c) => c.titre), ['Germinal']);
});

test('construireCartes : une série « Split-Volume Translation » est marquée technique, une vraie saga non', () => {
  const h = (id, nom) => ({ id: String(id), title: 'Dune', author_names: ['Frank Herbert'], users_count: 10, image: { url: 'x' }, alternative_titles: [], compilation: false,
    featured_series: { position: 1, series: { id, name: nom, primary_books_count: 5 } } });
  const cartes = construireCartes([h(1, 'Dune'), h(2, 'Dune Split-Volume Translation')], 'dune');
  assert.deepEqual(cartes.map((c) => [c.titre, c._technique]).sort((a, b) => a[0].localeCompare(b[0])), [['Dune', false], ['Dune Split-Volume Translation', true]]);
});
