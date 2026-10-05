/*
 * Propose les NOMS FRANÇAIS de sagas à corriger, après avoir vérifié ce que le service rend AUJOURD'HUI pour chaque nom français usuel.
 *   node --env-file=.env scripts/proposer-noms-sagas.mjs
 * Écrit docs/noms-sagas-a-valider.md (à relire par Kinder) et data/noms-sagas-proposes.json (importé après validation par
 * scripts/importer-noms.mjs). Cache en mémoire : on mesure le code d'aujourd'hui, avec les corrections du fichier data/overrides.json.
 * Chaque saga est classée :  « à renommer » (la saga existe sous un autre nom) · « déjà bon » · « introuvable / à vérifier ».
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { obtenirApp } from '../src/app.js';
import { normaliser, nomFamille } from '../src/text.js';

const { service } = obtenirApp({ ...process.env, SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '' });
const { sagas } = JSON.parse(readFileSync(new URL('../data/sagas-a-nommer.json', import.meta.url), 'utf8'));

const memeAuteur = (carte, auteur) => (carte.auteurs || []).some((a) => nomFamille(a) === nomFamille(auteur) || normaliser(a).includes(normaliser(auteur)));

const aRenommer = [];
const dejaBon = [];
const introuvables = [];

for (const s of sagas) {
  let r;
  try { r = await service.rechercher(s.nom, 'fr'); } catch (e) { introuvables.push({ ...s, raison: `erreur : ${e.message}` }); continue; }
  const cartes = r.resultats.slice(0, 6);
  // La saga de cet auteur : on préfère celle dont le nom ressemble à ce qu'on cherche, sinon la première série de l'auteur.
  const series = cartes.filter((c) => c.type === 'serie' && memeAuteur(c, s.auteur));
  // Une série qui porte le NOM DE L'AUTEUR (« Agatha Christie ») est un fourre-tout, pas la saga cherchée (« Miss Marple »).
  const nomAuteur = normaliser(s.auteur);
  const candidates = series.filter((c) => normaliser(c.titre) === normaliser(s.nom) || !normaliser(c.titre).split(' ').includes(nomAuteur));
  const choisie = candidates.find((c) => normaliser(c.titre) === normaliser(s.nom)) || candidates[0];
  if (!choisie) {
    const livre = cartes.find((c) => memeAuteur(c, s.auteur));
    introuvables.push({ ...s, raison: livre ? `pas de saga, un livre : « ${livre.titre} »` : 'aucun résultat de cet auteur', premier: cartes[0] ? `[${cartes[0].type}] ${cartes[0].titre}` : null });
  } else if (normaliser(choisie.titre) === normaliser(s.nom)) {
    dejaBon.push({ ...s, id: choisie.id, tomes: choisie.tomes });
  } else {
    aRenommer.push({ ...s, id: choisie.id, nomActuel: choisie.titre, tomes: choisie.tomes, lecteurs: choisie.lecteurs, autres: series.filter((c) => c !== choisie).map((c) => `${c.titre} (#${c.id})`) });
  }
}

const ligne = (x) => `| ☐ | ${x.id} | ${x.nomActuel} | **${x.nom}** | ${x.auteur} | ${x.tomes ?? '?'} | ${x.lecteurs ?? '?'} | ${x.autres?.length ? `aussi : ${x.autres.join(' ; ')}` : ''} |`;
const md = `# Noms français de sagas à valider

> Généré le ${new Date().toISOString().slice(0, 10)} par \`scripts/proposer-noms-sagas.mjs\`. **Kinder** : cochez ce que vous validez (ou dites-moi « tout sauf … »), corrigez le nom français si besoin.
> Un nom validé est enregistré par \`npm run corriger -- serie <id> --nom-fr "<nom>"\` : la saga s'affichera sous ce nom ET répondra à une recherche de ce nom.

## 1. À renommer (${aRenommer.length}) — la saga existe, mais sous un autre nom (souvent anglais)

| ✔ | id | Nom actuel | Nom français proposé | Auteur | Tomes | Lecteurs | Remarque |
|---|---|---|---|---|---|---|---|
${aRenommer.map(ligne).join('\n')}

## 2. Déjà bon (${dejaBon.length})

${dejaBon.map((x) => `${x.nom} (#${x.id}, ${x.tomes ?? '?'} tomes)`).join(' · ')}

## 3. Introuvable ou à vérifier (${introuvables.length}) — le service ne rend pas de saga de cet auteur sous ce nom

| Nom cherché | Auteur | Constat | Premier résultat |
|---|---|---|---|
${introuvables.map((x) => `| ${x.nom} | ${x.auteur} | ${x.raison} | ${x.premier || ''} |`).join('\n')}

> Pour une ligne de la section 3, deux issues : un **alias de recherche** (\`npm run corriger -- alias "<nom>" "<titre anglais>"\`) si le titre français est absent de Hardcover, ou rien si Hardcover n'a pas cette saga.
`;
writeFileSync(new URL('../docs/noms-sagas-a-valider.md', import.meta.url), md);
writeFileSync(new URL('../data/noms-sagas-proposes.json', import.meta.url), JSON.stringify({ date: new Date().toISOString(), aRenommer: aRenommer.map(({ id, nom, nomActuel, auteur }) => ({ id, nom, nomActuel, auteur })), dejaBon: dejaBon.length, introuvables: introuvables.map(({ nom, auteur, raison }) => ({ nom, auteur, raison })) }, null, 2));
console.log(`${sagas.length} sagas examinées : ${aRenommer.length} à renommer · ${dejaBon.length} déjà bonnes · ${introuvables.length} introuvables ou à vérifier`);
console.log('Écrit : docs/noms-sagas-a-valider.md et data/noms-sagas-proposes.json');
