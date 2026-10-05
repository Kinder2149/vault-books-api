import test from 'node:test';
import assert from 'node:assert/strict';
import { analyser, listeDeNombres, ligneSerie, cleCouvertureValide, verifierImage, aInvalider, creerCorrections } from '../src/corrections.js';
import { lireOverridesSupabase } from '../src/overrides.js';

test('ligne de commande : positionnels et options séparés ; une option sans valeur est une erreur', () => {
  assert.deepEqual(analyser(['serie', '1130', '--nom-fr', 'Le Seigneur des anneaux', '--exclure', '1.5']),
    { positionnels: ['serie', '1130'], options: { 'nom-fr': 'Le Seigneur des anneaux', exclure: '1.5' } });
  assert.throws(() => analyser(['serie', '1', '--nom-fr']), /attend une valeur/);
  assert.throws(() => analyser(['serie', '1', '--nom-fr', '--exclure', '2']), /attend une valeur/);
});

test('listes de nombres : espaces tolérés, décimaux admis, texte refusé', () => {
  assert.deepEqual(listeDeNombres('87481, 87482'), [87481, 87482]);
  assert.deepEqual(listeDeNombres('1.5,2.5'), [1.5, 2.5]);
  assert.deepEqual(listeDeNombres(''), []);
  assert.deepEqual(listeDeNombres(undefined), []);
  assert.throws(() => listeDeNombres('1,deux'), /pas un nombre/);
});

test("série : ce qui n'est pas donné est CONSERVÉ depuis la ligne existante", () => {
  const existante = { series_id: 1130, name_fr: 'Le Seigneur des anneaux', name_en: 'The Lord of the Rings', merge_ids: [87481], exclude_positions: [1.5], note: 'ancienne' };
  const l = ligneSerie(1130, { note: 'nouvelle' }, existante);
  assert.deepEqual([l.name_fr, l.name_en, l.merge_ids, l.exclude_positions, l.note], ['Le Seigneur des anneaux', 'The Lord of the Rings', [87481], [1.5], 'nouvelle']);
  const m = ligneSerie(1130, { 'nom-fr': 'LOTR', fusionner: '' }, existante);
  assert.deepEqual([m.name_fr, m.merge_ids], ['LOTR', []]);                 // une valeur vide vide le champ
});

test('série : identifiant invalide, ou correction vide, refusés', () => {
  assert.throws(() => ligneSerie('abc', { 'nom-fr': 'x' }), /identifiant de série/);
  assert.throws(() => ligneSerie(5, {}), /Rien à corriger/);
});

test('couverture : seules les clés isbn:<13 chiffres> et serie:<id>:<position> sont admises', () => {
  for (const ok of ['isbn:9782749910147', 'serie:25608:3', 'serie:981:1.1']) assert.equal(cleCouvertureValide(ok), true, ok);
  for (const ko of ['isbn:123', 'isbn:978274991014X', 'serie:abc:1', 'tome:1', '9782749910147', '']) assert.equal(cleCouvertureValide(ko), false, ko);
});

/** Un PNG minimal avec les dimensions voulues (l'en-tête suffit à `dimensionsImage`). */
function png(largeur, hauteur, taille = 6000) {
  const b = Buffer.alloc(taille);
  b.write('\x89PNG\r\n\x1a\n', 0, 'latin1');
  b.writeUInt32BE(largeur, 16);
  b.writeUInt32BE(hauteur, 20);
  return b;
}
const reponseImage = (buf, status = 200) => async () => ({ ok: status === 200, status, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });

test('image : acceptée si téléchargeable, lisible, ≥ 200 px et > 4 000 octets', async () => {
  const r = await verifierImage('https://x/i.png', reponseImage(png(320, 480)));
  assert.equal(r.ok, true);
  assert.deepEqual([r.dim.l, r.dim.h], [320, 480]);
});

test('image : refusée si en http, trop petite, trop légère, illisible, ou inaccessible', async () => {
  assert.match((await verifierImage('http://x/i.png', reponseImage(png(320, 480)))).raison, /https/);
  assert.match((await verifierImage('https://x/i.png', reponseImage(png(98, 147)))).raison, /trop petite/);
  assert.match((await verifierImage('https://x/i.png', reponseImage(png(320, 480, 500)))).raison, /suspecte/);
  assert.match((await verifierImage('https://x/i.png', reponseImage(Buffer.from('<html>pas une image</html>'.padEnd(5000))))).raison, /pas une image/);
  assert.match((await verifierImage('https://x/i.png', reponseImage(Buffer.alloc(10), 404))).raison, /404/);
  assert.match((await verifierImage('https://x/i.png', async () => { throw new Error('DNS'); })).raison, /injoignable/);
});

test('cache : une correction invalide ce qu\'elle touche, et seulement cela', () => {
  assert.deepEqual(aInvalider({ type: 'serie', id: 1130 }), ['serie:*:1130', 'search:*', 'livre:*', 'isbn:*']);
  assert.deepEqual(aInvalider({ type: 'couverture-isbn', isbn: '9782749910147' }), ['isbn:*:9782749910147', 'serie:*', 'livre:*']);
  assert.deepEqual(aInvalider({ type: 'couverture-serie', id: 25608 }), ['serie:*:25608']);
  assert.ok(!aInvalider({ type: 'serie', id: 1 }).some((m) => m.startsWith('cover:')));            // les couvertures vérifiées (cover:) ne sont jamais invalidées
});

/** Un faux Supabase qui mémorise les requêtes. */
function fauxSupabase(lignes = {}) {
  const appels = [];
  const fetchImpl = async (url, o = {}) => {
    appels.push({ methode: o.method || 'GET', url: decodeURIComponent(url), corps: o.body });
    if ((o.method || 'GET') === 'GET') {
      const table = url.match(/rest\/v1\/([a-z_]+)/)?.[1];
      return { ok: true, status: 200, json: async () => lignes[table] || [], headers: { get: () => null } };
    }
    return { ok: true, status: 200, headers: { get: () => '*/3' } };
  };
  return { appels, fetchImpl };
}

test("correction de série : upsert de la ligne fusionnée avec l'existante, puis invalidation du cache", async () => {
  const { appels, fetchImpl } = fauxSupabase({ series_overrides: [{ series_id: 981, name_fr: 'Le Trône de fer', name_en: null, merge_ids: [], exclude_positions: [], note: null }] });
  const r = await creerCorrections({ url: 'https://x.supabase.co', cle: 'sb_secret_k', fetchImpl }).enregistrerSerie(981, { exclure: '1.5' });
  const ecriture = appels.find((a) => a.methode === 'POST');
  assert.match(ecriture.url, /series_overrides\?on_conflict=series_id/);
  const ligne = JSON.parse(ecriture.corps);
  assert.deepEqual([ligne.name_fr, ligne.exclude_positions], ['Le Trône de fer', [1.5]]);
  assert.deepEqual(appels.filter((a) => a.methode === 'DELETE').map((a) => a.url.split('key=like.')[1]), ['serie:*:981', 'search:*', 'livre:*', 'isbn:*']);
  assert.equal(r.invalidees, 12);                                                                    // 4 motifs × 3 lignes (faux)
});

test("correction de couverture : l'image est vérifiée AVANT toute écriture ; refusée, rien n'est écrit", async () => {
  const { appels, fetchImpl } = fauxSupabase();
  const fetchAvecImage = async (url, o) => (String(url).includes('supabase') ? fetchImpl(url, o) : reponseImage(png(98, 147))());
  const c = creerCorrections({ url: 'https://x.supabase.co', cle: 'k', fetchImpl: fetchAvecImage });
  await assert.rejects(() => c.enregistrerCouverture('isbn:9782749910147', 'https://x/mini.png'), /trop petite/);
  assert.equal(appels.length, 0);
  await assert.rejects(() => c.enregistrerCouverture('mauvaise-cle', 'https://x/i.png'), /Clé invalide/);
});

test('correction de couverture acceptée : écrite, puis les réponses concernées invalidées', async () => {
  const { appels, fetchImpl } = fauxSupabase();
  const f = async (url, o) => (String(url).includes('supabase') ? fetchImpl(url, o) : reponseImage(png(320, 480))());
  await creerCorrections({ url: 'https://x.supabase.co', cle: 'k', fetchImpl: f }).enregistrerCouverture('isbn:9782749910147', 'https://x/bonne.png', 'tome 8');
  assert.match(appels[0].url, /cover_overrides\?on_conflict=key/);
  assert.equal(JSON.parse(appels[0].corps).key, 'isbn:9782749910147');
  assert.deepEqual(appels.filter((a) => a.methode === 'DELETE').map((a) => a.url.split('key=like.')[1]), ['isbn:*:9782749910147', 'serie:*', 'livre:*']);
});

test("sauvegarde : la lecture est STRICTE (une panne est une erreur, jamais « zéro correction »)", async () => {
  await assert.rejects(() => lireOverridesSupabase({ url: 'https://x', cle: 'k', fetchImpl: async () => ({ ok: false, status: 500 }) }), /500/);
  const ok = async (u) => ({ ok: true, json: async () => (u.includes('series_overrides') ? [{ series_id: 5, name_fr: 'Cinq', name_en: null, merge_ids: [6], exclude_positions: ['1.5'], note: 'n' }] : [{ key: 'isbn:1', url: 'u' }]) });
  const r = await lireOverridesSupabase({ url: 'https://x', cle: 'k', fetchImpl: ok });
  assert.deepEqual(r.series[5], { noms: { fr: 'Cinq', en: undefined }, fusionner: [6], exclurePositions: [1.5], note: 'n' });
  assert.deepEqual(r.couvertures, { 'isbn:1': 'u' });
});
