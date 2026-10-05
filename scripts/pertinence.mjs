/*
 * Mesure de pertinence sur un jeu de requêtes, contre les VRAIES sources (cache en mémoire : on mesure le code d'aujourd'hui, pas des réponses
 * déjà mises en cache par une version précédente).
 *
 *   node --env-file=.env scripts/pertinence.mjs fr           # test/fixtures-pertinence/requetes-fr.json
 *   node --env-file=.env scripts/pertinence.mjs en
 *   node --env-file=.env scripts/pertinence.mjs kinder       # requetes-kinder.json (recherches réelles de Kinder)
 *   node --env-file=.env scripts/pertinence.mjs fr --detail  # affiche aussi les 3 premiers résultats des réussites
 *
 * Critères par requête :
 *   - AUTEUR : un résultat de l'auteur attendu dans les 3 premiers ;
 *   - RANG 1 : le résultat de cet auteur est le PREMIER (plus exigeant : c'est ce que l'utilisateur voit en premier) ;
 *   - TYPE : si l'attendu est « saga », la 1re carte doit être une carte série.
 * Une requête réussit si AUTEUR et TYPE sont vrais. Écrit sorties/pertinence-<jeu>.json (détail) et affiche le bilan par catégorie.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { obtenirApp } from '../src/app.js';
import { normaliser, nomFamille } from '../src/text.js';

const vert = (t) => `\x1b[32m${t}\x1b[0m`;
const rouge = (t) => `\x1b[31m${t}\x1b[0m`;
const gris = (t) => `\x1b[90m${t}\x1b[0m`;

const jeu = process.argv[2] || 'fr';
const detail = process.argv.includes('--detail');
const fichier = new URL(`../test/fixtures-pertinence/requetes-${jeu}.json`, import.meta.url);
const { lang, requetes, mode } = JSON.parse(readFileSync(fichier, 'utf8'));

// Mémoire seule : ni cache Supabase (il servirait d'anciennes réponses), ni journal. Les corrections viennent du fichier, comme en repli.
const { service } = obtenirApp({ ...process.env, SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '' });

const memeAuteur = (c, attendu) => (c.auteurs || []).some((a) => nomFamille(a) === nomFamille(attendu) || normaliser(a).includes(normaliser(attendu)));

let nbOk = 0;
let nbRang1 = 0;
const parCategorie = {};
const rapport = [];
const t0 = Date.now();

for (const q of requetes) {
  let r;
  try { r = mode === 'auteur' ? await service.rechercherAuteur(q.texte, q.lang || lang) : await service.rechercher(q.texte, q.lang || lang); } catch (e) { r = { resultats: [], erreur: e.message }; }
  if (mode === 'auteur') {
    const ok = !r.erreur && r.auteur && nomFamille(r.auteur.nom) === nomFamille(q.auteur) && r.resultats.length >= (q.minimum || 1)
      && (!q.saga || r.resultats.slice(0, 6).some((c) => c.type === 'serie' && normaliser(c.titre).includes(normaliser(q.saga))));
    const cause = r.erreur ? `erreur : ${r.erreur}` : (!r.auteur ? 'aucun auteur trouvé' : (nomFamille(r.auteur.nom) !== nomFamille(q.auteur) ? `auteur retenu : ${r.auteur.nom}` : (r.resultats.length < (q.minimum || 1) ? `seulement ${r.resultats.length} carte(s)` : `saga « ${q.saga} » absente des 6 premières`)));
    if (ok) nbOk += 1;
    parCategorie[q.categorie || 'auteur'] ||= { ok: 0, total: 0 };
    parCategorie[q.categorie || 'auteur'].total += 1;
    if (ok) parCategorie[q.categorie || 'auteur'].ok += 1;
    rapport.push({ texte: q.texte, ok, cause: ok ? '' : cause, auteur: r.auteur, nb: r.resultats.length, top: r.resultats.slice(0, 6).map((c) => ({ type: c.type, titre: c.titre, tomes: c.tomes })) });
    if (!ok || detail) {
      console.log(` « ${q.texte} » → ${r.auteur ? r.auteur.nom : 'aucun auteur'} (${r.resultats.length} cartes)${ok ? '' : rouge(` — ${cause}`)}`);
      r.resultats.slice(0, 6).forEach((c, i) => console.log(gris(`       ${i + 1}. [${c.type}] ${c.titre}${c.tomes ? ` (${c.tomes} tomes)` : ''}`)));
    }
    continue;
  }
  const top = r.resultats.slice(0, 3);
  const rang = r.resultats.findIndex((c) => memeAuteur(c, q.auteur));
  const auteurOk = rang >= 0 && rang < 3;
  const rang1 = rang === 0;
  const typeOk = q.type !== 'saga' || (top[0] && top[0].type === 'serie');
  const ok = auteurOk && typeOk;
  if (ok) nbOk += 1;
  if (rang1) nbRang1 += 1;
  const cat = q.categorie || 'divers';
  parCategorie[cat] ||= { ok: 0, total: 0 };
  parCategorie[cat].total += 1;
  if (ok) parCategorie[cat].ok += 1;

  const cause = r.erreur ? `erreur : ${r.erreur}` : (!auteurOk ? (rang < 0 ? 'auteur absent des résultats' : `auteur au rang ${rang + 1}`) : (!typeOk ? `1re carte « ${top[0]?.type || 'aucune'} » au lieu d'une saga` : ''));
  rapport.push({ texte: q.texte, categorie: cat, ok, rang1, rang: rang + 1, cause, top: top.map((c) => ({ type: c.type, titre: c.titre, auteurs: c.auteurs?.slice(0, 2), score: c.score })) });

  if (!ok || detail) {
    console.log(`${ok ? vert('OK  ') : rouge('KO  ')} « ${q.texte} » (${cat}) — attendu ${q.auteur}/${q.type}${cause ? rouge(` — ${cause}`) : ''}`);
    top.forEach((c, i) => console.log(gris(`       ${i + 1}. [${c.type}] ${c.titre} | ${(c.auteurs || []).slice(0, 2).join(', ')} | score ${c.score}`)));
  }
}

console.log(`\n=== ${jeu.toUpperCase()} (lang=${lang}) : ${nbOk}/${requetes.length} réussies (${Math.round((100 * nbOk) / requetes.length)} %) ; auteur en 1re position : ${nbRang1}/${requetes.length} — ${Math.round((Date.now() - t0) / 1000)} s ===`);
Object.entries(parCategorie).forEach(([c, v]) => console.log(`  ${(c + ' ').padEnd(32, '.')} ${v.ok}/${v.total}`));
mkdirSync(new URL('../sorties/', import.meta.url), { recursive: true });
writeFileSync(new URL(`../sorties/pertinence-${jeu}.json`, import.meta.url), JSON.stringify({ jeu, lang, date: new Date().toISOString(), ok: nbOk, total: requetes.length, rang1: nbRang1, rapport }, null, 2));
console.log(`Détail : sorties/pertinence-${jeu}.json`);
