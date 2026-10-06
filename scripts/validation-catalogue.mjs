/*
 * Validation du catalogue : rejoue test/fixtures-pertinence/requetes-kinder.json contre le service EN LIGNE et note chaque cas
 * sur les axes du critère de réussite (trouvé, complet, ordre, édition, couverture, propreté, rapidité).
 *
 *   node --env-file=<fichier .env contenant APP_KEY ou VITE_VAULT_API_KEY> scripts/validation-catalogue.mjs [options]
 *     --url <base>        service à tester (défaut : https://vault-books-api.vercel.app)
 *     --nom <étiquette>   préfixe des fichiers de sortie (défaut : mesure) → sorties/validation-<nom>.json et .md
 *     --filtre <ids>      ne rejouer que ces cas, séparés par des virgules (ex. S05,L07) ou un préfixe (ex. S)
 *     --pause <ms>        délai entre deux appels (défaut 2200 : ≈ 27 appels/min, loin des 90/min autorisés)
 *
 * La clé n'est jamais affichée ni écrite. Aucune écriture sur le service (lecture seule).
 * Résultat d'un cas : reussi (tous les axes applicables sont bons) · partiel (seulement le rang 2-3, un détail de couverture ≤ 10 % ou la lenteur) · echoue.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { normaliser, nomFamille } from '../src/text.js';
import { partBlanche } from '../src/images.js';
import { langueResume } from '../src/resume.js';

const arg = (nom, defaut) => { const i = process.argv.indexOf(`--${nom}`); return i > 0 ? process.argv[i + 1] : defaut; };
const base = arg('url', 'https://vault-books-api.vercel.app').replace(/\/$/, '');
const etiquette = arg('nom', 'mesure');
const filtre = arg('filtre', '');
const pause = Number(arg('pause', 2200));
const cle = (process.env.APP_KEY || process.env.VITE_VAULT_API_KEY || '').trim().replace(/^["']|["']$/g, '');
if (!cle) { console.error('Aucune clé : fournir APP_KEY ou VITE_VAULT_API_KEY via --env-file.'); process.exit(1); }

const jeu = JSON.parse(readFileSync(new URL('../test/fixtures-pertinence/requetes-kinder.json', import.meta.url), 'utf8'));
let cas = jeu.requetes.filter((c) => c.route);
if (filtre) { const f = filtre.split(','); cas = cas.filter((c) => f.some((x) => c.id === x || (x.length === 1 && c.id.startsWith(x)))); }

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const LIMITE_LENTEUR_MS = 3000;
const PARASITE = /coffret|box ?set|int[eé]grale|omnibus|compilation|collection complète/i;

async function appeler(chemin) {
  for (let essai = 0; essai < 3; essai += 1) {
    const t0 = Date.now();
    let res;
    try { res = await fetch(base + chemin, { headers: { 'x-app-key': cle } }); } catch (e) { res = { status: 0, erreur: e.message }; }
    const ms = Date.now() - t0;
    const corps = res.json ? await res.json().catch(() => null) : null;
    await dormir(pause);
    if ((res.status === 429 || res.status === 503) && essai < 2) { await dormir(15000); continue; }
    return { status: res.status, ms, corps, erreur: res.erreur };
  }
}

// « Dostoïevski|Dostoevsky » : plusieurs graphies admises pour un même auteur.
const memeAuteur = (carte, attendu) => attendu.split('|').some((v) => (carte.auteurs || []).some((a) => nomFamille(a) === nomFamille(v) || normaliser(a).includes(normaliser(v))));
const plage = (t) => (Array.isArray(t) ? t : [t, t]);
const groupe = (isbn) => (isbn || '').replace(/\D/g, '');
function langueDeIsbn(isbn) {
  const i = groupe(isbn);
  if (i.length !== 13) return null;
  if (i.startsWith('9782') || i.startsWith('97910')) return 'fr';
  if (i.startsWith('9780') || i.startsWith('9781')) return 'en';
  return 'autre';
}

async function noterSerie(c, serie, lang, carte) {
  const axes = {};
  const detail = {};
  const tomes = serie.tomes || [];
  const [min, max] = c.attendu.tomes ? plage(c.attendu.tomes) : [0, Infinity];
  detail.tomes = tomes.length;
  detail.disponibles = serie.disponibles;
  detail.totalPrincipal = serie.totalPrincipal;
  detail.indisponibles = tomes.filter((t) => t.disponible === false).length;
  detail.aParaitre = serie.aParaitre;
  const annonces = serie.totalPrincipal || 0;
  axes.complet = tomes.length >= min && tomes.length <= max && (c.attendu.annoncesIgnore || tomes.length >= annonces);
  if (!axes.complet) detail.completRaison = `${tomes.length} tomes rendus, ${annonces} annoncés par le service, ${min === max ? min : `${min} à ${max}`} attendus`;
  if (c.attendu.aucunTomeCache) { detail.tomesMarquesIndisponibles = detail.indisponibles; }
  if (c.attendu.ordre) {
    const pos = tomes.map((t) => t.position);
    const croissant = pos.every((p, i) => i === 0 || p > pos[i - 1]);
    axes.ordre = croissant;
    if (!croissant) detail.ordreRaison = `positions ${pos.slice(0, 20).join(',')}`;
  }
  const dispos = tomes.filter((t) => t.disponible !== false);
  const aVerifier = dispos.filter((t) => t.edition?.isbn13);
  const langues = aVerifier.map((t) => langueDeIsbn(t.edition.isbn13));
  const mauvaise = langues.filter((l) => l && l !== lang && l !== 'autre').length;
  if (c.attendu.edition) {
    axes.edition = mauvaise === 0;
    detail.editionsAutreLangue = mauvaise;
  }
  if (c.attendu.couverture) {
    const urls = dispos.map((t) => t.couverture).filter(Boolean);
    const sans = dispos.filter((t) => !t.couverture).length;
    const approx = dispos.filter((t) => t.couvertureApproximative).length;
    const partagees = urls.length - new Set(urls).size;
    detail.couverture = { sans, approximatives: approx, partagees, sur: dispos.length };
    const pb = sans + approx + partagees;
    axes.couverture = pb === 0 ? true : (dispos.length && pb / dispos.length <= 0.1 ? 'partiel' : false);
  }
  const att = c.attendu;
  // ---- règles de la bibliothèque bilingue (rapport d'essai du 6 octobre 2026)
  if (att.editionStricte) {   // une édition « dans la langue » dont l'ISBN n'est pas de cette langue (portugais, allemand…) est un défaut
    const ko = aVerifier.filter((t) => langueDeIsbn(t.edition.isbn13) !== lang);
    axes.editionStricte = ko.length === 0;
    if (ko.length) detail.editionsEtrangeres = ko.slice(0, 4).map((t) => `${t.position}:${t.edition.isbn13}`);
  }
  if (att.statuts) {   // { statut: [positions] } : chaque position doit porter ce statut
    const faux = [];
    for (const [statut, positions] of Object.entries(att.statuts)) for (const p of positions) { const t = tomes.find((x) => x.position === p); if (!t || t.statut !== statut) faux.push(`${p}:${t ? t.statut : 'absent'}≠${statut}`); }
    axes.statuts = faux.length === 0;
    if (faux.length) detail.statutsFaux = faux;
  }
  if (att.titresInterdits) {
    const vus = tomes.filter((t) => att.titresInterdits.some((m) => normaliser(t.titre || '').includes(normaliser(m)))).map((t) => t.titre);
    axes.titresLangue = vus.length === 0;
    if (vus.length) detail.titresInterdits = vus;
  }
  if (att.titreTome) {
    const t = tomes.find((x) => x.position === att.titreTome.position);
    axes.titreTome = Boolean(t) && normaliser(t.titre).includes(normaliser(att.titreTome.contient)) && !(att.titreTome.sansSlash && /\//.test(t.titre));
    detail.titreTome = t ? t.titre : 'absent';
  }
  if (att.pasAudio) {
    const audio = dispos.filter((t) => /audio|\bcd\b|mp3/i.test(t.edition?.format || '')).map((t) => `${t.position}:${t.edition.format}`);
    axes.pasAudio = audio.length === 0;
    if (audio.length) detail.audio = audio;
  }
  if (att.pasPageBlanche) {   // la couverture de ces tomes n'est ni absente-par-erreur ni une page de titre scannée
    const blancs = [];
    for (const p of att.pasPageBlanche) {
      const t = tomes.find((x) => x.position === p);
      if (!t || !t.couverture) { blancs.push(`${p}:sans couverture`); continue; }
      try {
        const r = await fetch(t.couverture);
        const part = partBlanche(Buffer.from(await r.arrayBuffer()));
        if (part !== null && part > 0.75) blancs.push(`${p}:page blanche ${Math.round(part * 100)} %`);
      } catch { /* image injoignable : on ne juge pas */ }
    }
    axes.pasPageBlanche = blancs.length === 0;
    if (blancs.length) detail.pagesBlanches = blancs;
  }
  if (att.bilingue) {   // lang=both : les deux langues, tous les tomes, et la même chose que la réponse à plat
    const b = await appeler(`/v1/series/${carte.id}?lang=both`);
    const bi = b.corps;
    let ok = b.status === 200 && bi && typeof bi.noms?.fr === 'string' && typeof bi.noms?.en === 'string' && Array.isArray(bi.tomes) && bi.tomes.length === tomes.length;
    const STATUTS = new Set(['disponible', 'indisponible_langue', 'a_paraitre']);
    if (ok) ok = bi.tomes.every((t) => STATUTS.has(t.langues?.fr?.statut) && STATUTS.has(t.langues?.en?.statut));
    if (ok) ok = bi.tomes.every((t, i) => t.langues[lang].titre === tomes[i].titre && t.langues[lang].statut === tomes[i].statut);
    axes.bilingue = Boolean(ok);
    if (!ok) detail.bilingueRaison = b.status !== 200 ? `HTTP ${b.status}` : 'réponse bilingue incomplète ou différente de la réponse à plat';
  }

  const parasites = tomes.filter((t) => PARASITE.test(t.titre || '')).map((t) => t.titre);
  if (!/coffret|int[eé]grale/.test(c.categorie) && !c.attendu.titresTolere) {
    axes.propre = parasites.length === 0;
    if (parasites.length) detail.parasites = parasites.slice(0, 5);
  }
  return { axes, detail };
}

async function jouerRecherche(c) {
  const lang = c.lang || jeu.lang || 'fr';
  const axes = {};
  const detail = {};
  const r = await appeler(`/v1/search?q=${encodeURIComponent(c.texte)}&lang=${lang}`);
  detail.ms = r.ms;
  detail.statut = r.status;
  if (r.status !== 200 || !r.corps) { axes.sante = false; detail.erreur = r.erreur || `HTTP ${r.status}`; return { axes, detail }; }
  axes.sante = true;
  axes.rapide = r.ms <= LIMITE_LENTEUR_MS ? true : 'partiel';
  const cartes = r.corps.resultats || [];
  axes.sansNegatif = cartes.every((x) => x.score >= 0);   // jamais de résultat à score négatif
  detail.nbCartes = cartes.length;
  detail.top = cartes.slice(0, 3).map((x) => `[${x.type}] ${x.titre}${x.tomes ? ` (${x.tomes})` : ''} — ${(x.auteurs || []).slice(0, 2).join(', ')}`);
  const rang = cartes.findIndex((x) => memeAuteur(x, c.auteur) && (c.attendu.type === 'livre' ? true : x.type === c.attendu.type));
  detail.rang = rang + 1;
  axes.trouve = rang === 0 ? true : (rang > 0 && rang < 3 ? 'partiel' : false);
  if (c.attendu.titreCarte && rang >= 0) axes.titreCarte = normaliser(cartes[rang].titre).includes(normaliser(c.attendu.titreCarte)) && rang === 0;
  if (rang < 0) { detail.trouveRaison = 'auteur ou type attendu absent'; return { axes, detail }; }
  const carte = cartes[rang];
  detail.carte = { id: carte.id, titre: carte.titre, type: carte.type };
  if (c.attendu.type === 'livre') {
    if (c.attendu.couverture) axes.couverture = !!carte.couverture;
    if (c.attendu.exclure) axes.propre = !PARASITE.test(carte.titre || '');
    if (c.attendu.aParaitre) detail.noteAParaitre = 'à contrôler à la main (carte livre sans date dans la recherche)';
    return { axes, detail };
  }
  const s = await appeler(`/v1/series/${carte.id}?lang=${lang}`);
  detail.msSerie = s.ms;
  if (s.status !== 200 || !s.corps) { axes.sante = false; detail.erreur = `saga : HTTP ${s.status}`; return { axes, detail }; }
  const noteS = await noterSerie(c, s.corps, lang, carte);
  Object.assign(axes, noteS.axes);
  Object.assign(detail, noteS.detail);
  return { axes, detail };
}

async function jouerAuteur(c) {
  const lang = c.lang || jeu.lang || 'fr';
  const axes = {};
  const detail = {};
  const r = await appeler(`/v1/search?q=${encodeURIComponent(c.texte)}&mode=auteur&lang=${lang}`);
  detail.ms = r.ms;
  detail.statut = r.status;
  if (r.status !== 200 || !r.corps) { axes.sante = false; detail.erreur = r.erreur || `HTTP ${r.status}`; return { axes, detail }; }
  axes.sante = true;
  axes.rapide = r.ms <= LIMITE_LENTEUR_MS ? true : 'partiel';
  const cartes = r.corps.resultats || [];
  detail.auteurRetenu = r.corps.auteur?.nom || null;
  detail.nbCartes = cartes.length;
  detail.top = cartes.slice(0, 6).map((x) => `[${x.type}] ${x.titre}${x.tomes ? ` (${x.tomes})` : ''}`);
  axes.trouve = !!r.corps.auteur && c.auteur.split('|').some((v) => nomFamille(r.corps.auteur.nom) === nomFamille(v));
  axes.complet = cartes.length >= (c.attendu.minimum || 1);
  if (c.attendu.saga) axes.trouveSaga = cartes.slice(0, 6).some((x) => normaliser(x.titre).includes(normaliser(c.attendu.saga)));
  return { axes, detail };
}

async function jouerIsbn(c) {
  const axes = {};
  const detail = {};
  if (/^A_RELEVER/.test(c.isbn)) { detail.ignore = 'ISBN à relever auprès de la BnF avant la mesure'; return { axes: { ignore: true }, detail }; }
  const r = await appeler(`/v1/isbn/${encodeURIComponent(c.isbn)}`);
  detail.ms = r.ms;
  detail.statut = r.status;
  if (c.attendu.reponse) { axes.reponse = r.status === c.attendu.reponse; axes.rapide = r.ms <= LIMITE_LENTEUR_MS ? true : 'partiel'; return { axes, detail }; }
  if (r.status !== 200 || !r.corps) { axes.sante = false; detail.erreur = r.erreur || `HTTP ${r.status}`; return { axes, detail }; }
  axes.sante = true;
  axes.rapide = r.ms <= LIMITE_LENTEUR_MS ? true : 'partiel';
  const d = r.corps;
  detail.titre = d.titre;
  detail.langue = d.langue;
  detail.editeur = d.editeur;
  axes.trouve = !!d.trouve && normaliser(d.titre || '').includes(normaliser(c.attendu.titreContient || ''));
  if (c.attendu.edition) axes.edition = d.langue === c.attendu.edition;
  if (c.attendu.couverture) axes.couverture = !!d.couverture?.url && !d.couverture.approximative;
  if (c.attendu.pages) axes.pages = !!d.nbPages;
  if (c.attendu.pagesPlausibles) axes.pagesPlausibles = d.nbPages === null || d.nbPages >= 30;
  if (c.attendu.resumeLangue) { const l = langueResume(d.resume); axes.resumeLangue = !d.resume || l === d.langue; detail.resume = d.resume ? `${l} (${d.langue})` : 'absent'; }
  if (c.attendu.prefixe) axes.prefixe = groupe(d.isbn13).startsWith(c.attendu.prefixe);
  return { axes, detail };
}

function verdict(axes) {
  const v = Object.entries(axes).filter(([k]) => k !== 'ignore');
  if (axes.ignore) return 'ignore';
  if (v.some(([, x]) => x === false)) return 'echoue';
  if (v.some(([, x]) => x === 'partiel')) return 'partiel';
  return 'reussi';
}

const resultats = [];
const debut = Date.now();
for (const c of cas) {
  let sortie;
  try {
    sortie = c.route === 'isbn' ? await jouerIsbn(c) : (c.route === 'auteur' ? await jouerAuteur(c) : await jouerRecherche(c));
  } catch (e) { sortie = { axes: { sante: false }, detail: { erreur: e.message } }; }
  const v = verdict(sortie.axes);
  resultats.push({ id: c.id, categorie: c.categorie, requete: c.texte || c.isbn, lang: c.lang || jeu.lang, source: c.source, verdict: v, axes: sortie.axes, detail: sortie.detail });
  const rate = Object.entries(sortie.axes).filter(([, x]) => x !== true).map(([k, x]) => `${k}${x === 'partiel' ? '~' : ''}`).join(' ');
  console.log(`${v === 'reussi' ? 'OK ' : v === 'partiel' ? '~~ ' : v === 'ignore' ? '-- ' : 'KO '} ${c.id} « ${c.texte || c.isbn} »${rate ? `  [${rate}]` : ''}`);
}

const compte = (v) => resultats.filter((r) => r.verdict === v).length;
const jouables = resultats.filter((r) => r.verdict !== 'ignore');
const axesTotal = jouables.flatMap((r) => Object.values(r.axes));
const axesOk = axesTotal.filter((x) => x === true).length;
const bilan = {
  date: new Date().toISOString(), service: base, cas: resultats.length, jouables: jouables.length,
  reussis: compte('reussi'), partiels: compte('partiel'), echoues: compte('echoue'), ignores: compte('ignore'),
  pourcentReussis: Math.round((1000 * compte('reussi')) / (jouables.length || 1)) / 10,
  pourcentAxes: Math.round((1000 * axesOk) / (axesTotal.length || 1)) / 10,
  duree_s: Math.round((Date.now() - debut) / 1000),
};
const parCat = {};
resultats.forEach((r) => { const k = (parCat[r.categorie] ||= { reussi: 0, partiel: 0, echoue: 0, ignore: 0 }); k[r.verdict] += 1; });

mkdirSync(new URL('../sorties/', import.meta.url), { recursive: true });
writeFileSync(new URL(`../sorties/validation-${etiquette}.json`, import.meta.url), JSON.stringify({ bilan, parCategorie: parCat, resultats }, null, 2));
const md = [
  `# Validation du catalogue — ${etiquette} (${bilan.date.slice(0, 10)})`,
  '', `Service : ${base} · ${bilan.jouables} cas jouables · **${bilan.reussis} réussis (${bilan.pourcentReussis} %)**, ${bilan.partiels} partiels, ${bilan.echoues} échoués, ${bilan.ignores} ignorés · axes réussis : ${bilan.pourcentAxes} % · ${bilan.duree_s} s`,
  '', '| Cas | Requête | Résultat | Axes en défaut | Détail |', '|---|---|---|---|---|',
  ...resultats.map((r) => `| ${r.id} | ${r.requete}${r.lang && r.lang !== 'fr' ? ` (${r.lang})` : ''} | ${r.verdict} | ${Object.entries(r.axes).filter(([, x]) => x !== true).map(([k]) => k).join(', ')} | ${[r.detail.completRaison, r.detail.ordreRaison, r.detail.trouveRaison, r.detail.erreur, r.detail.top?.[0]].filter(Boolean).join(' ; ').replace(/\|/g, '/')} |`),
].join('\n');
writeFileSync(new URL(`../sorties/validation-${etiquette}.md`, import.meta.url), md);
console.log(`\n=== ${bilan.reussis}/${bilan.jouables} réussis (${bilan.pourcentReussis} %), ${bilan.partiels} partiels, ${bilan.echoues} échoués ; axes ${bilan.pourcentAxes} % ; ${bilan.duree_s} s ===`);
Object.entries(parCat).forEach(([k, v]) => console.log(`  ${(k + ' ').padEnd(42, '.')} ${v.reussi} ok / ${v.partiel} partiel / ${v.echoue} KO`));
console.log(`Détail : sorties/validation-${etiquette}.md et .json`);
