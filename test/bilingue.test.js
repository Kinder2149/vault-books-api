import test from 'node:test';
import assert from 'node:assert/strict';
import { construireSerie, fusionnerLangues, projeterSerie, langueDuTitre, typeDeSaga } from '../src/series.js';
import { creerService, ErreurRequete, memoiser } from '../src/service.js';
import { cacheMemoire } from '../src/cache.js';

const livre = (id, title, users = 0, release_date = null) => ({ id, title, users_count: users, release_date, image: null });
const entree = (position, book, extra = {}) => ({ position, book, ...extra });
const edition = (id, title, isbn) => ({ id, title, isbn_13: isbn, publisher: { name: 'Éd.' }, release_date: '2005-01-01', image: null });
const SERIE = { id: 1150, name: 'Dune', primary_books_count: 3 };
const AUJOURDHUI = '2026-10-06';

test("tome paru mais sans édition française : « indisponible_langue » (pas « à paraître »), titre en anglais plutôt qu'en italien", () => {
  // Données réelles de Dune (tome 7) : un livre italien à 1 lecteur sans date, un polonais, un anglais à 0 lecteur.
  const entrees = [
    entree(7, livre(1, 'I cacciatori di Dune', 1)),
    entree(7, livre(2, 'Łowcy Diuny', 0, '2006-04-22')),
    entree(7, livre(3, 'Hunters Of Dune', 0, '2006-04-22')),
  ];
  const s = construireSerie({ serie: SERIE, entrees, editions: new Map(), lang: 'fr', aujourdhui: AUJOURDHUI });
  const t = s.tomes[0];
  assert.equal(t.statut, 'indisponible_langue');
  assert.equal(t.aParaitre, false);
  assert.equal(t.titre, 'Hunters Of Dune');
  assert.equal(t.langueTitre, 'en');
  assert.deepEqual([s.disponibles, s.indisponibles, s.aParaitre], [0, 1, 0]);
});

test("tome sans édition française mais avec une édition anglaise : le titre de repli est l'anglais, et on le dit", () => {
  const entrees = [entree(1, livre(1, 'Dune', 5000, '1965-08-01'))];
  const edEn = new Map([[1, edition(1, 'Dune (Ace)', '9780441172719')]]);
  const fr = construireSerie({ serie: SERIE, entrees, editions: new Map(), editionsAutre: edEn, lang: 'fr', aujourdhui: AUJOURDHUI });
  assert.equal(fr.tomes[0].statut, 'indisponible_langue');
  assert.equal(fr.tomes[0].titre, 'Dune (Ace)');
  assert.equal(fr.tomes[0].langueTitre, 'en');
  const en = construireSerie({ serie: SERIE, entrees, editions: edEn, lang: 'en', aujourdhui: AUJOURDHUI });
  assert.equal(en.tomes[0].statut, 'disponible');
  assert.equal(en.tomes[0].langueTitre, 'en');
});

test("« à paraître » seulement pour une date future, ou sans date ni édition dans aucune langue", () => {
  const entrees = [
    entree(1, livre(1, 'Un', 5, '2003-01-01')), entree(2, livre(2, 'Deux', 5, '2999-01-01')), entree(3, livre(3, 'The Winds of Winter', 9000)),
  ];
  const s = construireSerie({ serie: SERIE, entrees, editions: new Map(), lang: 'fr', aujourdhui: AUJOURDHUI });
  assert.deepEqual(s.tomes.map((t) => t.statut), ['indisponible_langue', 'a_paraitre', 'a_paraitre']);
});

test('titre dans la langue demandée : langueTitre vaut la langue', () => {
  const s = construireSerie({ serie: SERIE, entrees: [entree(1, livre(1, 'Dune', 5))], editions: new Map([[1, edition(1, 'Dune', '1')]]), lang: 'fr', aujourdhui: AUJOURDHUI });
  assert.equal(s.tomes[0].langueTitre, 'fr');
  assert.equal(s.tomes[0].statut, 'disponible');
});

test('langue probable d’un titre, type de saga', () => {
  assert.equal(langueDuTitre('Hunters of Dune'), 'en');
  assert.equal(langueDuTitre('Le Messie de Dune'), 'fr');
  assert.equal(langueDuTitre('I cacciatori di Dune'), null);
  assert.equal(typeDeSaga('Dune Sequels'), 'suites');
  assert.equal(typeDeSaga('Dune Prequels'), 'prequelles');
  assert.equal(typeDeSaga('The Witcher Universe'), 'spin_off');
  assert.equal(typeDeSaga('The Wheel of Time'), 'cycle_principal');
});

test('forme bilingue : chaque tome porte ses deux langues, et la projection redonne la forme à plat', () => {
  const entrees = [entree(1, livre(1, 'Dune', 5000, '1965-01-01')), entree(2, livre(2, 'Dune Messiah', 4000, '1969-01-01'))];
  const edFr = new Map([[1, edition(1, 'Dune', '1')]]);
  const edEn = new Map([[1, edition(2, 'Dune', '2')], [2, edition(3, 'Dune Messiah', '3')]]);
  const fr = construireSerie({ serie: SERIE, entrees, editions: edFr, editionsAutre: edEn, lang: 'fr', aujourdhui: AUJOURDHUI });
  const en = construireSerie({ serie: SERIE, entrees, editions: edEn, editionsAutre: edFr, lang: 'en', aujourdhui: AUJOURDHUI });
  const bi = fusionnerLangues({ fr, en, noms: { fr: 'Dune', en: 'Dune' }, languesNoms: { fr: 'en', en: 'en' } });
  assert.deepEqual(bi.tomes.map((t) => [t.position, t.langues.fr.statut, t.langues.en.statut]), [[1, 'disponible', 'disponible'], [2, 'indisponible_langue', 'disponible']]);
  const aplat = projeterSerie(bi, 'fr');
  assert.equal(aplat.langue, 'fr');
  assert.equal(aplat.langueNom, 'en');   // pas de nom français enregistré : repli sur le nom canonique, signalé
  assert.deepEqual(aplat.tomes.map((t) => [t.position, t.titre, t.statut, t.langueTitre]), [[1, 'Dune', 'disponible', 'fr'], [2, 'Dune Messiah', 'indisponible_langue', 'en']]);
  assert.deepEqual([aplat.disponibles, aplat.indisponibles, aplat.aParaitre], [1, 1, 0]);
  assert.equal(projeterSerie(bi, 'en').disponibles, 2);
});

// ------------------------------------------------------------------ service

function fauxHc({ serie, editionsParLangue = { fr: new Map(), en: new Map() }, candidats = [] } = {}) {
  const appels = { serie: 0, editions: 0, rechercher: 0, candidats: 0, livre: 0 };
  return {
    appels,
    async serie() { appels.serie += 1; return serie; },
    async editionsEnLangue(ids, lang) { appels.editions += 1; return new Map([...editionsParLangue[lang]].filter(([id]) => ids.includes(id))); },
    async candidatsPositions() { appels.candidats += 1; return candidats; },
    async rechercher() { appels.rechercher += 1; return [{ id: '1', title: 'Dune', author_names: ['Frank Herbert'], users_count: 500, image: { url: 'https://img/a.jpg' }, alternative_titles: [], compilation: false, featured_series: null }]; },
    async rechercherAuteurs() { return []; },
    async editionsParLivre() { return new Map(); },
  };
}

test('série lang=both : un seul calcul pour les deux langues, puis fr et en servis depuis le cache sans rappeler la source', async () => {
  const serie = { id: 1150, name: 'Dune', primary_books_count: 2, book_series: [entree(1, livre(1, 'Dune', 5000, '1965-01-01')), entree(2, livre(2, 'Dune Messiah', 4000, '1969-01-01'))] };
  const hc = fauxHc({ serie, editionsParLangue: { fr: new Map([[1, edition(1, 'Dune', '1')]]), en: new Map([[1, edition(2, 'Dune', '2')], [2, edition(3, 'Dune Messiah', '3')]]) } });
  const s = creerService({ hardcover: hc, cache: cacheMemoire(), overrides: { series: { 1150: { noms: { fr: 'Dune (cycle)' } } }, couvertures: {} } });

  const both = await s.serie(1150, 'both');
  assert.deepEqual(both.noms, { fr: 'Dune (cycle)', en: 'Dune' });
  assert.equal(both.tomes[1].langues.fr.statut, 'indisponible_langue');
  assert.equal(both.tomes[1].langues.en.statut, 'disponible');
  assert.equal(hc.appels.serie, 1);

  const fr = await s.serie(1150, 'fr');
  const en = await s.serie(1150, 'en');
  assert.equal(fr.nom, 'Dune (cycle)');
  assert.equal(fr.langueNom, 'fr');
  assert.equal(en.nom, 'Dune');
  assert.equal(fr.tomes[1].titre, 'Dune Messiah');
  assert.equal(fr.tomes[1].langueTitre, 'en');
  assert.equal(en.disponibles, 2);
  assert.equal(hc.appels.serie, 1, "changer de langue ne rappelle pas la source");
  assert.equal(fr.cache, 'frais');
});

test('série : une langue inconnue reste une erreur de requête', async () => {
  const s = creerService({ hardcover: fauxHc({ serie: null }), cache: cacheMemoire() });
  await assert.rejects(() => s.serie(1, 'de'), ErreurRequete);
});

test("série : les autres livres d'une position sont cherchés quand la langue y manque (Narnia : « Prince Caspian » à la place du volume double)", async () => {
  const double = livre(10, 'Tales of Narnia: Prince Caspian/The Voyage of the Dawn Treader', 7, '1950-01-01');
  const vrai = livre(11, 'Prince Caspian', 1933, '1951-10-15');
  const serie = { id: 5485, name: 'Narnia', primary_books_count: 1, book_series: [entree(2, double)] };
  const hc = fauxHc({
    serie,
    candidats: [entree(2, vrai, { retrouvee: true })],
    editionsParLangue: { fr: new Map([[11, edition(1, 'Le Prince Caspian', '9782070612000')]]), en: new Map([[10, edition(2, 'Tales', '2')], [11, edition(3, 'Prince Caspian', '3')]]) },
  });
  const s = creerService({ hardcover: hc, cache: cacheMemoire() });
  const fr = await s.serie(5485, 'fr');
  assert.equal(fr.tomes[0].titre, 'Le Prince Caspian');
  assert.equal(fr.tomes[0].statut, 'disponible');
  assert.equal(hc.appels.candidats, 1);
});

test("série : si une panne empêche d'élargir les candidats, la saga est rendue telle que la 1re requête l'a donnée", async () => {
  const serie = { id: 1, name: 'S', primary_books_count: 1, book_series: [entree(1, livre(1, 'Un', 5, '2000-01-01'))] };
  const hc = { ...fauxHc({ serie }), async candidatsPositions() { throw new Error('panne'); } };
  const s = creerService({ hardcover: hc, cache: cacheMemoire() });
  const r = await s.serie(1, 'fr');
  assert.equal(r.tomes[0].statut, 'indisponible_langue');
});

test("recherche lang=both : la source n'est interrogée qu'une fois pour les deux langues, chaque carte porte son statut et la langue de son titre", async () => {
  const hc = fauxHc();
  const s = creerService({ hardcover: hc, cache: cacheMemoire() });
  const r = await s.rechercher('dune', 'both');
  assert.deepEqual(Object.keys(r.langues), ['fr', 'en']);
  assert.equal(hc.appels.rechercher, 1);
  assert.equal(r.langues.fr.langue, 'fr');
  assert.equal(r.langues.fr.resultats[0].statut, 'indisponible_langue');
  assert.equal(r.langues.fr.resultats[0].langueTitre, null);
  assert.equal(r.requete, 'dune');
});

test('carte de saga : noms dans les deux langues, et langueNom dit si le titre affiché est un repli', async () => {
  const hit = { id: '1', title: 'Dune', author_names: ['Frank Herbert'], users_count: 5000, image: { url: 'https://img/a.jpg' }, alternative_titles: [], compilation: false, featured_series: { position: 1, series: { id: 1150, name: 'Dune', primary_books_count: 6 } } };
  const hc = { ...fauxHc(), async rechercher() { return [hit]; } };
  const s = creerService({ hardcover: hc, cache: cacheMemoire(), overrides: { series: { 1150: { noms: { fr: 'Le Cycle de Dune' } } }, couvertures: {} } });
  const fr = await s.rechercher('dune', 'fr');
  assert.equal(fr.resultats[0].titre, 'Le Cycle de Dune');
  assert.deepEqual(fr.resultats[0].noms, { fr: 'Le Cycle de Dune', en: 'Dune' });
  assert.equal(fr.resultats[0].langueNom, 'fr');
  const sans = creerService({ hardcover: hc, cache: cacheMemoire() });
  assert.equal((await sans.rechercher('dune', 'fr')).resultats[0].langueNom, 'en');
});

test('mémoïsation de la source : un même appel est partagé', async () => {
  let n = 0;
  const m = memoiser({ async rechercher(q) { n += 1; return [q]; }, async rechercherAuteurs() { return []; }, async livresDeLAuteur() { return []; } });
  await Promise.all([m.rechercher('a'), m.rechercher('a'), m.rechercher('b')]);
  assert.equal(n, 2);
});

test("tome sans aucune édition : le titre d'origine du livre (canonical) remplace une traduction étrangère (« I vermi della sabbia di Dune » → « Sandworms of Dune »)", () => {
  const italien = { ...livre(1, 'I vermi della sabbia di Dune', 1), canonical: { id: 9, title: 'Sandworms of Dune' } };
  const s = construireSerie({ serie: SERIE, entrees: [entree(8, italien), entree(8, livre(2, 'Czerwie Diuny', 0, '2007-08-07'))], editions: new Map(), lang: 'fr', aujourdhui: AUJOURDHUI });
  assert.equal(s.tomes[0].titre, 'Sandworms of Dune');
  assert.equal(s.tomes[0].langueTitre, 'en');
  assert.equal(s.tomes[0].statut, 'indisponible_langue');
});

test('recherche : « hary poter » (deux fautes) retrouve Harry Potter par correction d’un mot à la fois ; aucun score négatif n’est renvoyé', async () => {
  const hp = { id: '1', title: "Harry Potter and the Philosopher's Stone", author_names: ['J.K. Rowling'], users_count: 15000, image: { url: 'https://img/a.jpg' }, alternative_titles: [], compilation: false, featured_series: { position: 1, series: { id: 1185, name: 'Harry Potter', primary_books_count: 7 } } };
  const bruit = { id: '9', title: 'Ländliches Mörder-Idyll: Vier Krimis', author_names: ['A. Bekker'], users_count: 0, image: null, alternative_titles: [], compilation: false, featured_series: null };
  const demandees = [];
  const hc = { ...fauxHc(), async rechercher(q) { demandees.push(q); return q === 'harry potter' ? [hp] : (q === 'hary poter' ? [bruit] : (q === 'harry poter' ? [hp] : [bruit])); }, async editionsEnLangue() { return new Map(); } };
  const s = creerService({ hardcover: hc, cache: cacheMemoire() });
  const r = await s.rechercher('hary poter', 'fr');
  assert.equal(r.resultats[0].titre, 'Harry Potter');
  assert.ok(r.resultats.every((c) => c.score >= 0));
  assert.ok(demandees.includes('harry poter'));
});

test('recherche : un livre sans rapport à score négatif n’est jamais rendu, même seul', async () => {
  const bruit = { id: '9', title: 'Ländliches Mörder-Idyll: Vier Krimis', author_names: ['A. Bekker'], users_count: 0, image: null, alternative_titles: [], compilation: false, featured_series: null };
  const hc = { ...fauxHc(), async rechercher() { return [bruit]; }, async editionsEnLangue() { return new Map(); } };
  const s = creerService({ hardcover: hc, cache: cacheMemoire(), overrides: { series: {}, couvertures: {}, recherches: {} } });
  const r = await s.rechercher('zzzz qqqq', 'fr');
  assert.deepEqual(r.resultats, []);
});

test('carte de saga : type de saga et nombre de tomes lu à la série (l’index de recherche est en retard)', async () => {
  const hit = (id, nom, n) => ({ id: String(id), title: nom, author_names: ['Frank Herbert'], users_count: 5000, image: null, alternative_titles: [], compilation: false, featured_series: { position: 1, series: { id, name: nom, primary_books_count: n } } });
  const hc = { ...fauxHc(), async rechercher() { return [hit(1150, 'Dune', 6), hit(202993, 'Dune Sequels', 2)]; }, async totauxSeries() { return new Map([[1150, 8]]); } };
  const s = creerService({ hardcover: hc, cache: cacheMemoire() });
  const r = await s.rechercher('dune', 'fr');
  const dune = r.resultats.find((c) => c.id === 1150);
  const suites = r.resultats.find((c) => c.id === 202993);
  assert.equal(dune.tomes, 8);
  assert.equal(dune.typeSaga, 'cycle_principal');
  assert.equal(suites.typeSaga, 'suites');
  assert.equal(suites.tomes, 2);
});
