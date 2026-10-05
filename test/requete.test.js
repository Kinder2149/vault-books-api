import test from 'node:test';
import assert from 'node:assert/strict';
import { sansArticleInitial, candidatsAuteur, auteurCorrespond } from '../src/requete.js';
import { creerService } from '../src/service.js';
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
