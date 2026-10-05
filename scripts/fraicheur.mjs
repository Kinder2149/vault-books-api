// Le test de fraîcheur : combien de temps après leur parution les livres sont-ils complets dans chaque source ?
//   node --env-file=.env scripts/fraicheur.mjs avance             combien de jours AVANT leur parution Hardcover catalogue les livres (mesure immédiate)
//   node --env-file=.env scripts/fraicheur.mjs choisir            choisit 5 livres anglais et 5 français parus ou annoncés autour d'aujourd'hui
//   node --env-file=.env scripts/fraicheur.mjs releve             un relevé du jour pour chaque livre suivi (à lancer chaque jour : workflow fraicheur.yml)
//   node --env-file=.env scripts/fraicheur.mjs rapport            délais constatés, par source et par langue
// Données : data/fraicheur.json { livres, releves } (versionné par le workflow). Utilise HARDCOVER_API_KEY ; BnF et Open Library n'ont pas de clé.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { lireConfig } from '../src/config.js';
import { creerHardcover } from '../src/sources/hardcover.js';
import { creerBnf } from '../src/sources/bnf.js';
import { choisirLivres, avanceDeCatalogage, premieresApparitions, resumer } from '../src/fraicheur.js';

const FICHIER = new URL('../data/fraicheur.json', import.meta.url);
const jour = (decalage = 0) => new Date(Date.now() + decalage * 86_400_000).toISOString().slice(0, 10);
const lire = () => (existsSync(FICHIER) ? JSON.parse(readFileSync(FICHIER, 'utf8')) : { livres: [], releves: [] });
const ecrire = (d) => writeFileSync(FICHIER, JSON.stringify(d, null, 2) + '\n');

const cfg = lireConfig();
if (!cfg.hardcoverKey && process.argv[2] !== 'rapport') { console.error('HARDCOVER_API_KEY manquante.'); process.exit(2); }
const hc = creerHardcover({ cle: cfg.hardcoverKey });

async function existe(url, methode = 'GET') {
  try { return (await fetch(url, { method: methode, redirect: 'follow', headers: { 'user-agent': 'vault-books-api fraicheur (contact: vcoutry@gmail.com)' } })).ok; } catch { return null; }
}

const commande = process.argv[2];

if (commande === 'avance') {
  for (const langue of ['en', 'fr']) {
    const livres = await hc.parutions({ du: jour(-45), au: jour(-7), langue, limite: 60 });
    const a = avanceDeCatalogage(livres);
    console.log(`${langue} : ${a ? `${a.avantParution}/${a.echantillon} livres catalogués AVANT ou le jour de leur parution ; écart médian ${a.mediane} j (négatif = avant), 90e centile ${a.p90} j` : 'pas assez de données'}`);
  }
} else if (commande === 'choisir') {
  const d = lire();
  const ajoutes = [];
  for (const langue of ['en', 'fr']) {
    const candidats = await hc.parutions({ du: jour(-3), au: jour(21), langue, limite: 40 });
    for (const c of choisirLivres(candidats, 5)) {
      if (d.livres.some((l) => l.bookId === c.bookId)) continue;
      const l = { id: `${langue}-${c.bookId}`, langue, bookId: c.bookId, titre: c.titre, auteur: c.auteur, date: c.date, isbns: c.isbns, choisiLe: jour() };
      d.livres.push(l); ajoutes.push(l);
    }
  }
  ecrire(d);
  ajoutes.forEach((l) => console.log(`+ ${l.langue} ${l.date} ${l.titre} (${l.auteur || '?'}) ${l.isbns.join(' ')}`));
  console.log(`${ajoutes.length} livre(s) ajouté(s) ; ${d.livres.length} suivis.`);
} else if (commande === 'releve') {
  const d = lire();
  const bnf = creerBnf();
  const aujourdhui = jour();
  if (d.releves.some((r) => r.date === aujourdhui)) { console.log('Déjà relevé aujourd’hui.'); process.exit(0); }
  for (const l of d.livres) {
    const etat = await hc.etatLivre(l.bookId);
    const isbns = [...new Set([...(l.isbns || []), ...(etat?.isbns || [])])];
    l.isbns = isbns;
    const isbn = isbns[0];
    const criteres = {
      hcIsbn: Boolean(etat && etat.isbns.length),
      hcImage: Boolean(etat && etat.avecImage > 0),
      hcPages: Boolean(etat && etat.avecPages > 0),
      // Sans ISBN, la BnF et Open Library ne peuvent pas répondre : null = non mesurable ce jour-là (≠ faux).
      bnf: isbn && l.langue === 'fr' ? Boolean(await bnf.parIsbn(isbn).catch(() => null)) : null,
      olNotice: isbn ? await existe(`https://openlibrary.org/isbn/${isbn}.json`) : null,
      olCouverture: isbn ? await existe(`https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`, 'HEAD') : null,
    };
    d.releves.push({ date: aujourdhui, livre: l.id, criteres, editions: etat?.editions ?? 0 });
    console.log(`${l.langue} ${l.titre.slice(0, 40).padEnd(40)} ${Object.entries(criteres).map(([k, v]) => `${k}=${v === null ? '·' : v ? 'oui' : 'non'}`).join(' ')}`);
  }
  ecrire(d);
} else if (commande === 'rapport') {
  const d = lire();
  const app = premieresApparitions(d.livres, d.releves);
  console.log(`${d.livres.length} livre(s) suivis, ${d.releves.length} relevé(s), du ${d.releves[0]?.date || '—'} au ${d.releves.at(-1)?.date || '—'}\n`);
  app.forEach((a) => console.log(`${a.langue} ${a.date} ${a.titre.slice(0, 38).padEnd(38)} ${Object.entries(a.criteres).map(([k, v]) => `${k}:${v ? `J${v.apresParution >= 0 ? '+' : ''}${v.apresParution}` : '—'}`).join(' ')}`));
  console.log('\nPar source (J = jour de parution ; négatif = avant) :');
  resumer(app).forEach((r) => console.log(`  ${r.langue} ${r.critere.padEnd(13)} vus ${r.vus}/${r.suivis}  médiane ${r.medianeJours === null ? '—' : `J${r.medianeJours >= 0 ? '+' : ''}${r.medianeJours}`}`));
} else {
  console.error('Usage : avance | choisir | releve | rapport');
  process.exit(2);
}
