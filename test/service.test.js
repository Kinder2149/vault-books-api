import test from 'node:test';
import assert from 'node:assert/strict';
import { creerService, ErreurRequete } from '../src/service.js';
import { cacheMemoire } from '../src/cache.js';

const doc = (id, title, extra = {}) => ({ id: String(id), title, author_names: ['Anne Robillard'], users_count: 30, image: { url: 'https://img/a.jpg' }, alternative_titles: [], compilation: false, featured_series: null, ...extra });

function faux({ hits = [], editions = new Map(), serie = null, panne = false } = {}) {
  const appels = { rechercher: 0, serie: 0, editions: 0 };
  return {
    appels,
    async rechercher() { appels.rechercher += 1; if (panne) throw new Error('Hardcover ne répond pas.'); return hits; },
    async serie() { appels.serie += 1; if (panne) throw new Error('panne'); return serie; },
    async editionsEnLangue() { appels.editions += 1; return editions; },
  };
}

test('une 2e recherche identique est servie par le cache, sans appeler la source', async () => {
  const hc = faux({ hits: [doc(1, 'Le Feu dans le ciel')], editions: new Map([[1, { title: 'Le Feu dans le ciel', image: { url: 'https://img/e.jpg' } }]]) });
  const s = creerService({ hardcover: hc, cache: cacheMemoire() });
  const a = await s.rechercher("Chevaliers d'Émeraude", 'fr');
  const b = await s.rechercher("chevaliers d'emeraude", 'fr');   // même requête une fois normalisée
  assert.equal(a.cache, 'absent');
  assert.equal(b.cache, 'frais');
  assert.equal(hc.appels.rechercher, 1);
});

test('source en panne : on rend le résultat périmé plutôt qu\'une erreur', async () => {
  const cache = cacheMemoire();
  await cache.set('search:v4:fr:dune', { requete: 'dune', langue: 'fr', resultats: [{ titre: 'Dune' }] });
  // Le cache est « jeune » ici : on force le périmé en le remplaçant par une entrée ancienne.
  const vieux = { async get() { return { valeur: { requete: 'dune', langue: 'fr', resultats: [{ titre: 'Dune' }] }, ageMs: 99 * 24 * 3600 * 1000 }; }, async set() {} };
  const s = creerService({ hardcover: faux({ panne: true }), cache: vieux });
  const r = await s.rechercher('dune', 'fr');
  assert.equal(r.cache, 'perime');
  assert.equal(r.resultats[0].titre, 'Dune');
});

test('source en panne et rien en cache : l\'erreur remonte', async () => {
  const s = creerService({ hardcover: faux({ panne: true }), cache: cacheMemoire() });
  await assert.rejects(() => s.rechercher('dune', 'fr'), /ne répond pas/);
});

test('une panne du cache ne fait pas échouer la requête', async () => {
  const casse = { async get() { throw new Error('cache KO'); }, async set() { throw new Error('cache KO'); } };
  const s = creerService({ hardcover: faux({ hits: [doc(1, 'Dune')] }), cache: casse });
  const r = await s.rechercher('dune', 'en');
  assert.equal(r.resultats.length, 1);
});

test('langue : une valeur inconnue et une recherche trop courte sont des erreurs de requête', async () => {
  const s = creerService({ hardcover: faux(), cache: cacheMemoire() });
  await assert.rejects(() => s.rechercher('dune', 'de'), ErreurRequete);
  await assert.rejects(() => s.rechercher('d', 'fr'), ErreurRequete);
});

test('filtre de langue : seules les œuvres ayant une édition dans la langue restent', async () => {
  const hits = [doc(1, 'Fire in the Sky', { users_count: 50 }), doc(2, 'Le Feu dans le ciel', { users_count: 40 })];
  const editions = new Map([[2, { title: 'Le Feu dans le ciel', image: { url: 'https://img/fr.jpg' } }]]);
  const s = creerService({ hardcover: faux({ hits, editions }), cache: cacheMemoire() });
  const r = await s.rechercher('feu dans le ciel', 'fr');
  assert.deepEqual(r.resultats.map((c) => c.titre), ['Le Feu dans le ciel']);
  assert.equal(r.langueNonDisponible, false);
});

test('aucune œuvre dans la langue : on rend tout, en le signalant', async () => {
  const s = creerService({ hardcover: faux({ hits: [doc(1, 'Some Obscure Book')], editions: new Map() }), cache: cacheMemoire() });
  const r = await s.rechercher('obscure', 'fr');
  assert.equal(r.langueNonDisponible, true);
  assert.equal(r.resultats.length, 1);
});

test("série : les doublons déclarés dans les corrections sont réunis et le nom vient de la correction", async () => {
  const principale = { id: 1130, name: 'The Lord of the Rings', primary_books_count: 3, book_series: [{ position: 1, book: { id: 1, title: 'The Fellowship of the Ring', users_count: 9932, image: null } }] };
  const doublon = { id: 87481, name: 'Le Seigneur des Anneaux', primary_books_count: 3, book_series: [{ position: 3, book: { id: 3, title: 'Le retour du Roi', users_count: 0, image: null } }] };
  const hc = { ...faux(), async serie(id) { return id === 1130 ? principale : doublon; } };
  const overrides = { series: { 1130: { noms: { fr: 'Le Seigneur des anneaux' }, fusionner: [87481] } } };
  const s = creerService({ hardcover: hc, cache: cacheMemoire(), overrides });
  const r = await s.serie(87481, 'fr');   // demandée par l'ID doublon : redirigée vers la série canonique
  assert.equal(r.id, 1130);
  assert.equal(r.nom, 'Le Seigneur des anneaux');
  assert.deepEqual(r.tomes.map((t) => t.position), [1, 3]);
});

test('série inconnue : null, et rien n\'est mis en cache', async () => {
  const cache = cacheMemoire();
  const s = creerService({ hardcover: faux({ serie: null }), cache });
  assert.equal(await s.serie(999999, 'fr'), null);
  assert.equal(await cache.get('serie:v4:fr:999999'), null);
});


// ------------------------------------------------------------------ éditions d'un livre (étape 2)

const livreHc = () => ({
  id: 927288, title: "Les dragons de l'Empereur Noir", image: { url: 'https://img/livre.jpg' },
  contributions: [{ author: { name: 'Anne Robillard' } }],
  book_series: [{ position: 2, series: { id: 25608, name: "Les Chevaliers d'Émeraude", primary_books_count: 12 } }],
  editions: [{ id: 1, title: "Les dragons de l'Empereur Noir", isbn_13: '9782890746725', publisher: { name: 'Mortagne' }, release_date: '2003-01-01', image: { url: 'https://img/e1.jpg' } }],
});
const notice = (isbn13, titre, annee) => ({ isbn13, titre, auteurs: ['Anne Robillard'], editeur: 'Michel Lafon', annee, collection: null });
const couvFaux = { async resoudre({ couvertureEdition, couvertureLivre }) { return couvertureEdition ? { url: couvertureEdition, source: 'hardcover', approximative: false } : { url: couvertureLivre, source: 'hardcover-livre', approximative: true }; } };

test('livre : éditions Hardcover + BnF fusionnées, couverture approximative signalée', async () => {
  const hc = { ...faux(), async livre() { return livreHc(); } };
  const bnf = { async editionsDe() { return [notice('9782749907482', "Les dragons de l'Empereur Noir", '2008')]; } };
  const s = creerService({ hardcover: hc, bnf, cache: cacheMemoire(), couvertures: couvFaux });
  const r = await s.livre(927288, 'fr');
  assert.equal(r.sourceBnf, 'ok');
  assert.deepEqual(r.editions.map((e) => e.isbn13), ['9782749907482', '9782890746725']);
  assert.equal(r.editions[1].couverture.approximative, false);
  assert.equal(r.editions[0].couverture.approximative, true);       // pas d'image d'édition : image du livre, signalée
  assert.deepEqual(r.serie, { id: 25608, nom: "Les Chevaliers d'Émeraude", position: 2 });
});

test('livre : BnF en panne → on rend quand même les éditions Hardcover, avec un TTL court', async () => {
  const hc = { ...faux(), async livre() { return livreHc(); } };
  const bnf = { async editionsDe() { throw new Error('BnF injoignable (ECONNRESET)'); } };
  const s = creerService({ hardcover: hc, bnf, cache: cacheMemoire(), couvertures: couvFaux });
  const r = await s.livre(927288, 'fr');
  assert.equal(r.sourceBnf, 'indisponible');
  assert.equal(r.editions.length, 1);
});

test("livre : en anglais la BnF n'est pas interrogée", async () => {
  let appels = 0;
  const hc = { ...faux(), async livre() { return livreHc(); } };
  const bnf = { async editionsDe() { appels += 1; return []; } };
  const s = creerService({ hardcover: hc, bnf, cache: cacheMemoire(), couvertures: couvFaux });
  const r = await s.livre(927288, 'en');
  assert.equal(appels, 0);
  assert.equal(r.sourceBnf, 'non-applicable');
});

test('livre : identifiant invalide → erreur de requête ; livre inconnu → null', async () => {
  const s = creerService({ hardcover: { ...faux(), async livre() { return null; } }, cache: cacheMemoire() });
  await assert.rejects(() => s.livre('abc', 'fr'), ErreurRequete);
  assert.equal(await s.livre(123, 'fr'), null);
});

test('saga : la couverture des tomes passe par la cascade (correction par tome > édition > Open Library)', async () => {
  const principale = { id: 25608, name: 'E', primary_books_count: 2, book_series: [
    { position: 1, book: { id: 1, title: 'Un', users_count: 5, image: { url: 'https://img/livre1.jpg' } } },
    { position: 2, book: { id: 2, title: 'Deux', users_count: 5, image: { url: 'https://img/livre2.jpg' } } }] };
  const editions = new Map([[1, { id: 1, title: 'Un', isbn_13: '9782890746626', image: null }], [2, { id: 2, title: 'Deux', isbn_13: '9782890746725', image: null }]]);
  const hc = { ...faux(), async serie() { return principale; }, async editionsEnLangue() { return editions; } };
  const couvertures = { async resoudre({ isbn13, correction, couvertureLivre }) {
    if (correction) return { url: correction, source: 'correction', approximative: false };
    return isbn13 === '9782890746626' ? { url: 'https://ol/1.jpg', source: 'openlibrary', approximative: false } : { url: couvertureLivre, source: 'hardcover-livre', approximative: true };
  } };
  const overrides = { series: {}, couvertures: { 'serie:25608:2': 'https://main/2.jpg' } };
  const s = creerService({ hardcover: hc, cache: cacheMemoire(), overrides, couvertures });
  const r = await s.serie(25608, 'fr');
  assert.equal(r.tomes[0].couverture, 'https://ol/1.jpg');
  assert.equal(r.tomes[0].couvertureSource, 'openlibrary');
  assert.equal(r.tomes[1].couverture, 'https://main/2.jpg');
  assert.equal(r.tomes[1].couvertureSource, 'correction');
  assert.equal(r.tomes[0]._couvertureLivre, undefined);          // détail interne jamais exposé
});

test("livre isolé : la carte porte l'ISBN, l'éditeur et la date de l'édition dans la langue (de quoi l'ajouter sans second appel)", async () => {
  const hits = [doc(1, 'Germinal')];
  const editions = new Map([[1, { title: 'Germinal', isbn_13: '978-2-07-036822-8', publisher: { name: 'Gallimard' }, release_date: '1999-01-01', image: { url: 'https://img/e.jpg' } }]]);
  const s = creerService({ hardcover: faux({ hits, editions }), cache: cacheMemoire() });
  const r = await s.rechercher('germinal', 'fr');
  assert.deepEqual([r.resultats[0].isbn13, r.resultats[0].editeur, r.resultats[0].date], ['9782070368228', 'Gallimard', '1999-01-01']);
});

test("livre : une BnF trop lente (> 5 s) n'attend pas : réponse Hardcover seul, marquée indisponible (TTL court)", async () => {
  const hc = { ...faux(), async livre() { return livreHc(); } };
  const bnfLente = { editionsDe: () => new Promise(() => {}) };            // ne répond jamais
  const s = creerService({ hardcover: hc, bnf: bnfLente, cache: cacheMemoire(), couvertures: couvFaux, delaiBnfMs: 30 });
  const t0 = Date.now();
  const r = await s.livre(927288, 'fr');
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(r.sourceBnf, 'indisponible');
  assert.equal(r.editions.length, 1);
});
