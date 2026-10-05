import test from 'node:test';
import assert from 'node:assert/strict';
import { sansArticleInitial, candidatsAuteur, auteurCorrespond } from '../src/requete.js';
import { creerService, ErreurRequete } from '../src/service.js';
import { cacheMemoire } from '../src/cache.js';

test('article de tête : retiré en français et en anglais, jamais quand c\'est le seul mot', () => {
  assert.equal(sansArticleInitial('le da vinci code'), 'da vinci code');
  assert.equal(sansArticleInitial("L'étranger"), 'etranger');
  assert.equal(sansArticleInitial('The Hobbit'), 'hobbit');
  assert.equal(sansArticleInitial('les misérables'), 'miserables');
  assert.equal(sansArticleInitial('dune'), null);
  assert.equal(sansArticleInitial('le'), null);
  assert.equal(sansArticleInitial('harry potter'), null);
});

test('candidats d\'auteur : début et fin de requête, sur un ou deux mots, sans doublon ; un seul mot n\'en a pas', () => {
  assert.deepEqual(candidatsAuteur('tolkien hobbit').map((c) => [c.texte, c.reste]), [['tolkien', 'hobbit'], ['hobbit', 'tolkien']]);
  assert.deepEqual(candidatsAuteur('stephen king ça').map((c) => [c.texte, c.reste]),
    [['stephen', 'king ca'], ['ca', 'stephen king'], ['stephen king', 'ca'], ['king ca', 'stephen']]);
  assert.deepEqual(candidatsAuteur('dune'), []);
});

const tolkien = { name: 'J.R.R. Tolkien', alternate_names: ['John Ronald Reuel Tolkien'], books_count: 321 };
test("auteur reconnu : tous les mots du morceau dans le nom (ou un nom alternatif), et assez de livres", () => {
  assert.equal(auteurCorrespond(tolkien, { mots: ['tolkien'] }), true);
  assert.equal(auteurCorrespond(tolkien, { mots: ['ronald', 'tolkien'] }), true);       // nom alternatif
  assert.equal(auteurCorrespond(tolkien, { mots: ['hobbit'] }), false);
  assert.equal(auteurCorrespond({ name: 'Hobbit Dragon', books_count: 1 }, { mots: ['hobbit'] }), false);   // 1 livre : pas un auteur
  assert.equal(auteurCorrespond({ name: 'Dune Hunter', books_count: 4 }, { mots: ['dune'] }), false);       // un mot seul exige ≥ 10 livres
  assert.equal(auteurCorrespond({ name: 'Ça Ira', books_count: 50 }, { mots: ['ça'] }), false);              // mot trop court
  assert.equal(auteurCorrespond(null, { mots: ['x'] }), false);
});

// ------------------------------------------------------------------ service : variantes de requête

const hit = (id, title, auteur, lecteurs, extra = {}) => ({ id: String(id), title, author_names: [auteur], users_count: lecteurs, image: { url: 'x' }, alternative_titles: [], compilation: false, featured_series: null, ...extra });

/** Un faux Hardcover dont les réponses dépendent du texte cherché ; il note chaque requête. */
function fauxHc({ parRequete = {}, auteurs = {}, quota = null } = {}) {
  const requetes = [];
  return {
    requetes,
    quota: () => quota || { restantJour: null },
    async rechercher(q) { requetes.push(`livre:${q}`); return parRequete[q] || []; },
    async rechercherAuteurs(q) { requetes.push(`auteur:${q}`); return auteurs[q] || []; },
    async editionsEnLangue() { return new Map(); },
  };
}
const cartesDe = (r) => r.resultats.map((c) => c.titre);

test("réponse franche : aucune reformulation, aucune requête de plus", async () => {
  const hc = fauxHc({ parRequete: { 'harry potter': [hit(1, 'Harry Potter and the Philosopher\'s Stone', 'J.K. Rowling', 15000)] } });
  const r = await creerService({ hardcover: hc, cache: cacheMemoire() }).rechercher('harry potter', 'fr');
  assert.deepEqual(hc.requetes, ['livre:harry potter']);
  assert.equal(cartesDe(r).length, 1);
});

test("article de tête : « le da vinci code » est retenté SANS l'article quand la première réponse est faible", async () => {
  const hc = fauxHc({ parRequete: {
    'le da vinci code': [hit(9, 'Le "Code da Vinci" décrypté', 'Simon Cox', 0)],
    'da vinci code': [hit(1, 'The Da Vinci Code', 'Dan Brown', 5703)],
  } });
  const r = await creerService({ hardcover: hc, cache: cacheMemoire() }).rechercher('le da vinci code', 'fr');
  assert.equal(r.resultats[0].titre, 'The Da Vinci Code');
  assert.deepEqual(hc.requetes.slice(0, 2), ['livre:le da vinci code', 'livre:da vinci code']);
});

test("auteur + titre : « tolkien hobbit » reconnaît Tolkien, cherche « hobbit » et favorise l'auteur", async () => {
  const hc = fauxHc({
    parRequete: {
      'tolkien hobbit': [hit(5, 'The Art of The Hobbit', 'Wayne Hammond', 40)],
      hobbit: [hit(1, 'The Hobbit', 'J.R.R. Tolkien', 12407), hit(6, 'A Hobbit, a Wardrobe, and a Great War', 'Joseph Loconte', 53)],
    },
    auteurs: { tolkien: [tolkien] },
  });
  const r = await creerService({ hardcover: hc, cache: cacheMemoire() }).rechercher('tolkien hobbit', 'fr');
  assert.equal(r.resultats[0].titre, 'The Hobbit');
  assert.ok(hc.requetes.includes('auteur:tolkien') && hc.requetes.includes('livre:hobbit'));
});

test("auteur + titre : un morceau qui n'est pas un auteur connu ne change rien (on garde la meilleure réponse)", async () => {
  const hc = fauxHc({ parRequete: { 'xyz abc': [hit(1, 'Quelque chose', 'Un Auteur', 3)] }, auteurs: { xyz: [], abc: [] } });
  const r = await creerService({ hardcover: hc, cache: cacheMemoire() }).rechercher('xyz abc', 'fr');
  assert.equal(cartesDe(r)[0], 'Quelque chose');
});

test("alias : « journal d'un dégonflé » cherche « diary of a wimpy kid » (titre français absent de l'index)", async () => {
  const hc = fauxHc({ parRequete: { 'diary of a wimpy kid': [hit(1, 'Diary of a Wimpy Kid', 'Jeff Kinney', 742)] } });
  const overrides = { series: {}, couvertures: {}, recherches: { 'journal d un degonfle': 'diary of a wimpy kid' } };
  const r = await creerService({ hardcover: hc, cache: cacheMemoire(), overrides }).rechercher("Journal d'un dégonflé", 'fr');
  assert.deepEqual(hc.requetes, ['livre:diary of a wimpy kid']);
  assert.equal(r.resultats[0].auteurs[0], 'Jeff Kinney');
});

test("quota bas : aucune reformulation (chaque variante coûte une requête Hardcover)", async () => {
  const hc = fauxHc({ parRequete: { 'le da vinci code': [hit(9, 'Guide', 'X', 0)] }, quota: { restantJour: 1500 } });   // < 2 × 1 000
  await creerService({ hardcover: hc, cache: cacheMemoire() }).rechercher('le da vinci code', 'fr');
  assert.deepEqual(hc.requetes, ['livre:le da vinci code']);
});

test("une panne de la recherche d'auteur ne fait pas échouer la recherche", async () => {
  const hc = fauxHc({ parRequete: { 'tolkien hobbit': [hit(5, 'The Art of The Hobbit', 'Wayne Hammond', 40)] } });
  hc.rechercherAuteurs = async () => { throw new Error('Hardcover ne répond pas.'); };
  const r = await creerService({ hardcover: hc, cache: cacheMemoire() }).rechercher('tolkien hobbit', 'fr');
  assert.equal(r.resultats.length, 1);
});

test("alias : trouvé aussi quand la requête commence par un article (« le journal d'un dégonflé » → alias « journal d'un dégonflé »)", async () => {
  const hc = fauxHc({ parRequete: { 'diary of a wimpy kid': [hit(1, 'Diary of a Wimpy Kid', 'Jeff Kinney', 742)] } });
  const overrides = { series: {}, couvertures: {}, recherches: { 'journal d un degonfle': 'diary of a wimpy kid' } };
  const r = await creerService({ hardcover: hc, cache: cacheMemoire(), overrides }).rechercher("le journal d'un dégonflé", 'fr');
  assert.deepEqual(hc.requetes, ['livre:diary of a wimpy kid']);
  assert.equal(r.resultats[0].auteurs[0], 'Jeff Kinney');
});

// ------------------------------------------------------------------ recherche par auteur

const livreAuteur = (id, title, lecteurs, serie = null) => ({
  id: String(id), title, author_names: ['J.R.R. Tolkien'], users_count: lecteurs, image: { url: 'x' }, alternative_titles: [], compilation: false,
  featured_series: serie ? { position: serie.pos, series: { id: serie.id, name: serie.nom, primary_books_count: serie.total } } : null,
});

function fauxAuteurs({ auteurs = [], livres = [], editions = new Map() } = {}) {
  const appels = [];
  return {
    appels,
    quota: () => ({ restantJour: null }),
    async rechercherAuteurs(q) { appels.push(`auteurs:${q}`); return auteurs; },
    async livresDeLAuteur(id) { appels.push(`livres:${id}`); return livres; },
    async editionsEnLangue() { return editions; },
    async rechercher() { return []; },
  };
}

test('auteur : les sagas de l\'auteur en une carte chacune, les livres isolés à part, du plus lu au moins lu', async () => {
  const hc = fauxAuteurs({
    auteurs: [{ id: '132049', name: 'J.R.R. Tolkien', alternate_names: [], books_count: 321 }, { id: '5', name: 'Christopher Tolkien', books_count: 9 }],
    livres: [
      livreAuteur(1, 'The Hobbit', 12407, { id: 10, nom: 'Middle Earth', pos: 1, total: 6 }),
      livreAuteur(2, 'The Fellowship of the Ring', 9932, { id: 11, nom: 'The Lord of the Rings', pos: 1, total: 3 }),
      livreAuteur(3, 'The Two Towers', 6774, { id: 11, nom: 'The Lord of the Rings', pos: 2, total: 3 }),
      livreAuteur(4, 'Letters From Father Christmas', 195),
    ],
  });
  const r = await creerService({ hardcover: hc, cache: cacheMemoire() }).rechercherAuteur('tolkien', 'fr');
  assert.deepEqual(hc.appels, ['auteurs:tolkien', 'livres:132049']);
  assert.equal(r.mode, 'auteur');
  assert.deepEqual(r.auteur, { id: 132049, nom: 'J.R.R. Tolkien', livres: 321 });
  assert.deepEqual(r.autresAuteurs, [{ id: 5, nom: 'Christopher Tolkien', livres: 9 }]);
  assert.deepEqual(r.resultats.map((c) => [c.type, c.titre]), [['serie', 'Middle Earth'], ['serie', 'The Lord of the Rings'], ['livre', 'Letters From Father Christmas']]);
  assert.equal(r.resultats.some((c) => Object.keys(c).some((k) => k.startsWith('_'))), false);   // aucun champ de travail ne fuit
});

test("auteur : le premier auteur dont le nom contient TOUS les mots tapés est retenu, sinon le premier proposé", async () => {
  const hc = fauxAuteurs({ auteurs: [{ id: '1', name: 'Stephen Fry', books_count: 40 }, { id: '2', name: 'Stephen King', books_count: 500 }], livres: [] });
  const r = await creerService({ hardcover: hc, cache: cacheMemoire() }).rechercherAuteur('stephen king', 'fr');
  assert.equal(r.auteur.id, 2);
  const hc2 = fauxAuteurs({ auteurs: [{ id: '9', name: 'Quelqu\'un', books_count: 3 }], livres: [] });
  assert.equal((await creerService({ hardcover: hc2, cache: cacheMemoire() }).rechercherAuteur('inconnu', 'fr')).auteur.id, 9);
});

test('auteur : aucun auteur trouvé → résultats vides (pas une erreur), l\'application retombe sur ses sources', async () => {
  const hc = fauxAuteurs({ auteurs: [] });
  const r = await creerService({ hardcover: hc, cache: cacheMemoire() }).rechercherAuteur('zzzzzz', 'fr');
  assert.deepEqual([r.auteur, r.resultats], [null, []]);
  assert.deepEqual(hc.appels, ['auteurs:zzzzzz']);
});

test('auteur : même cache et mêmes garde-fous que la recherche (trop court, langue, cache frais)', async () => {
  const hc = fauxAuteurs({ auteurs: [{ id: '1', name: 'Albert Camus', books_count: 100 }], livres: [livreAuteur(1, 'L\'Étranger', 5000)] });
  const s = creerService({ hardcover: hc, cache: cacheMemoire() });
  await assert.rejects(() => s.rechercherAuteur('a', 'fr'), ErreurRequete);
  await assert.rejects(() => s.rechercherAuteur('camus', 'de'), ErreurRequete);
  assert.equal((await s.rechercherAuteur('camus', 'fr')).cache, 'absent');
  assert.equal((await s.rechercherAuteur('Camus', 'fr')).cache, 'frais');
  assert.equal(hc.appels.length, 2);
});

test("auteur : en français, seuls les livres qui ont une édition française restent ; un livre isolé reçoit son ISBN et son éditeur", async () => {
  const editions = new Map([[2, { title: "L'Étranger", isbn_13: '9782070360024', publisher: { name: 'Gallimard' }, release_date: '1972', image: { url: 'https://img/fr.jpg' } }]]);
  const hc = fauxAuteurs({
    auteurs: [{ id: '1', name: 'Albert Camus', books_count: 100 }],
    livres: [livreAuteur(1, 'Untranslated Essay', 100), livreAuteur(2, 'The Stranger', 5000)],
    editions,
  });
  const r = await creerService({ hardcover: hc, cache: cacheMemoire() }).rechercherAuteur('camus', 'fr');
  assert.deepEqual(r.resultats.map((c) => c.titre), ["L'Étranger"]);
  assert.deepEqual([r.resultats[0].isbn13, r.resultats[0].editeur], ['9782070360024', 'Gallimard']);
});

test("auteur : l'auteur le plus FOURNI parmi ceux qui correspondent est retenu (« dumas » : Alexandre Dumas, pas un homonyme)", async () => {
  const hc = fauxAuteurs({ auteurs: [{ id: '1', name: 'Dumas', books_count: 2 }, { id: '2', name: 'Alexandre Dumas', books_count: 800 }, { id: '3', name: 'Pierre Dumas', books_count: 30 }], livres: [] });
  const r = await creerService({ hardcover: hc, cache: cacheMemoire() }).rechercherAuteur('dumas', 'fr');
  assert.equal(r.auteur.id, 2);
});
