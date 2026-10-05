import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { versIsbn13, isbn13Vers10, extraireIsbn13 } from '../src/isbn.js';
import { lireNotices, creerBnf } from '../src/sources/bnf.js';
import { fusionnerEditions, titreCorrespond, auteurCorrespond } from '../src/editions.js';

const XML = readFileSync(new URL('./fixtures/bnf-sample.xml', import.meta.url), 'utf8');

test('ISBN : conversions et validation de la clé de contrôle', () => {
  assert.equal(versIsbn13('2226052577'), '9782226052575');         // ISBN-10 → 13 (exemple de Vault Read : Les Fourmis)
  assert.equal(isbn13Vers10('9782226052575'), '2226052577');
  assert.equal(versIsbn13('978-2-7499-0625-6'), '9782749906256');
  assert.equal(versIsbn13('9782749906257'), null);                  // clé fausse
  assert.equal(versIsbn13('abc'), null);
});

test("ISBN : les chiffres du prix ne se collent pas à l'ISBN", () => {
  assert.equal(extraireIsbn13('ISBN 978-2-7499-0625-6 (br.) : 6 EUR'), '9782749906256');
  assert.equal(extraireIsbn13('ISBN 2-266-04650-0'), '9782266046503');
  assert.equal(extraireIsbn13('pas d\'isbn ici'), null);
});

test('BnF : lecture des notices (titre, auteur, éditeur, année, ISBN, collection)', () => {
  const n = lireNotices(XML);
  assert.equal(n.length, 3);
  assert.deepEqual(n[0], { ark: 'ark:/12148/cb41127100x', titre: 'Le feu dans le ciel', auteurs: ['Anne Robillard'],
    editeur: 'M. Lafon', annee: '2007', isbn13: '9782749906256', collection: null, langue: 'fre' });
  assert.equal(n[1].editeur, 'Presses pocket');
  assert.equal(n[1].collection, 'Presses pocket ; 2657-2659');
  assert.deepEqual(n[1].auteurs, ['John Ronald Reuel Tolkien', 'Francis Ledoux']);
  assert.equal(n[2].isbn13, null);
});

test('BnF : une coupure de connexion est rattrapée une fois, puis signalée clairement', async () => {
  let appels = 0;
  const coupe = async () => { appels += 1; throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } }); };
  const bnf = creerBnf({ fetchImpl: coupe, ecartMs: 0, pauseReessaiMs: 1 });
  await assert.rejects(() => bnf.editionsDe('dune', 'herbert'), /ECONNRESET/);
  assert.equal(appels, 2);
});

test('BnF : les requêtes sont espacées (jamais deux en même temps)', async () => {
  const debuts = [];
  const lente = async () => { debuts.push(Date.now()); return { ok: true, text: async () => XML }; };
  const bnf = creerBnf({ fetchImpl: lente, ecartMs: 60 });
  await Promise.all([bnf.editionsDe('a', 'b'), bnf.editionsDe('c', 'd'), bnf.editionsDe('e', 'f')]);
  assert.ok(debuts[1] - debuts[0] >= 55);
  assert.ok(debuts[2] - debuts[1] >= 55);
});

test("titre : l'édition collector correspond, un titre plus court ou différent non", () => {
  assert.equal(titreCorrespond('Le feu dans le ciel (Édition collector) Anne Robillard', 'Le Feu dans le ciel'), true);
  assert.equal(titreCorrespond('Le Seigneur des anneaux. 3. Les Deux tours', 'Les Deux Tours'), true);
  assert.equal(titreCorrespond('Le feu', 'Le Feu dans le ciel'), false);
  assert.equal(titreCorrespond('Les dragons de l\'Empereur Noir', 'Le Feu dans le ciel'), false);
});

test("auteur : le nom de famille fait foi (« J. R. R. Tolkien » = « John Ronald Reuel Tolkien »)", () => {
  assert.equal(auteurCorrespond(['John Ronald Reuel Tolkien'], 'J.R.R. Tolkien'), true);
  assert.equal(auteurCorrespond(['Boris Vian'], 'Bernard Werber'), false);
});

test('fusion : Hardcover fait foi, la BnF comble et ajoute, sans doublon ni livre étranger', () => {
  const hc = [
    { isbn_13: '9782749906256', title: 'Le Feu dans le ciel', publisher: null, release_date: null, image: { url: 'https://img/1.jpg' }, edition_format: 'Paperback' },
    { isbn_13: null, title: 'Sans ISBN', publisher: { name: 'X' } },
  ];
  const bnf = [
    { isbn13: '9782749906256', titre: 'Le feu dans le ciel', auteurs: ['Anne Robillard'], editeur: 'M. Lafon', annee: '2007', collection: null },
    { isbn13: '9782749915357', titre: 'Le feu dans le ciel', auteurs: ['Anne Robillard'], editeur: 'M. Lafon poche', annee: '2012', collection: null },
    { isbn13: '9782890746725', titre: "Les dragons de l'Empereur Noir", auteurs: ['Anne Robillard'], editeur: 'Mortagne', annee: '2003', collection: null },
    { isbn13: '9782266046503', titre: 'Le feu dans le ciel', auteurs: ['Boris Vian'], editeur: 'Autre', annee: '1999', collection: null },
  ];
  const e = fusionnerEditions({ editionsHardcover: hc, noticesBnf: bnf, titre: 'Le Feu dans le ciel', auteur: 'Anne Robillard' });
  assert.deepEqual(e.map((x) => x.isbn13), ['9782749915357', '9782749906256']);   // récentes d'abord ; 3e = autre titre, 4e = autre auteur, 2e HC sans ISBN
  assert.equal(e[1].editeur, 'M. Lafon');                  // comblé par la BnF
  assert.equal(e[1].date, '2007');
  assert.equal(e[1].couverture, 'https://img/1.jpg');      // gardée de Hardcover
  assert.deepEqual(e[1].sources, ['hardcover', 'bnf']);
});


test("titre BnF : le numéro de volume écrit après les deux-points est conservé (Le trône de fer : l'intégrale. 1)", () => {
  assert.equal(titreCorrespond("Le trône de fer : l'intégrale. 1", "Le trône de Fer l'intégrale 1"), true);
  assert.equal(titreCorrespond("Le trône de fer : l'intégrale. 2", "Le trône de Fer l'intégrale 1"), false);
});

test('fusion : une notice BnF répétée pour le même ISBN ne duplique pas la source', () => {
  const n = { isbn13: '9782749906256', titre: 'Le feu dans le ciel', auteurs: ['Anne Robillard'], editeur: 'M. Lafon', annee: '2007', collection: null };
  const e = fusionnerEditions({ editionsHardcover: [], noticesBnf: [n, n, n], titre: 'Le Feu dans le ciel', auteur: 'Anne Robillard' });
  assert.deepEqual(e[0].sources, ['bnf']);
});

test('fusion : une miniature Hardcover (< 200 px) n\'est pas une couverture, mais est gardée en dernier recours', () => {
  const hc = [{ isbn_13: '9782749906256', title: 'x', image: { url: 'https://img/petite.jpg', width: 98 } }];
  const [e] = fusionnerEditions({ editionsHardcover: hc, noticesBnf: [], titre: 'x', auteur: '' });
  assert.equal(e.couverture, null);
  assert.equal(e.couverturePetite, 'https://img/petite.jpg');
});

test("BnF par ISBN : tente l'ISBN-13, PUIS sa forme ISBN-10 (livres d'avant 2007), et rend l'ISBN demandé", async () => {
  const requetes = [];
  const fetchImpl = async (url) => {
    const q = new URL(url).searchParams.get('query');
    requetes.push(q);
    return { ok: true, text: async () => (q.includes('2226052577') ? XML : '<srw:numberOfRecords>0</srw:numberOfRecords>') };
  };
  const bnf = creerBnf({ fetchImpl, ecartMs: 0 });
  const notice = await bnf.parIsbn('9782226052575');
  assert.deepEqual(requetes, ['bib.isbn all "9782226052575"', 'bib.isbn all "2226052577"']);
  assert.equal(notice.titre, 'Le feu dans le ciel');          // 1re notice de la fixture
  assert.equal(notice.isbn13, '9782226052575');               // celui du code-barres scanné, pas celui de la notice
});

test('BnF par ISBN : aucune des deux formes → null', async () => {
  const bnf = creerBnf({ fetchImpl: async () => ({ ok: true, text: async () => '<srw:numberOfRecords>0</srw:numberOfRecords>' }), ecartMs: 0 });
  assert.equal(await bnf.parIsbn('9780000000002'), null);
});
