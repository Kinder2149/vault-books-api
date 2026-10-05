/*
 * fraicheur.js — le calcul du test de fraîcheur (voir scripts/fraicheur.mjs et docs/resultats-mesure-fraicheur.md).
 *
 * Question : combien de temps après leur parution (ou leur annonce) un livre est-il COMPLET dans chaque source — présent, avec ses ISBN, sa
 * couverture, ses pages ? La réponse décide de la fréquence de rafraîchissement du cache et de l'intérêt d'une page « nouveautés ».
 * Fonctions pures : le script ne fait que les nourrir de relevés.
 */

const JOUR = 24 * 60 * 60 * 1000;
const jours = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / JOUR);

/** Les livres à suivre : les plus lus, un par livre, `n` en tout, ceux qui ont un ISBN d'abord (sans lui, la BnF et Open Library sont muettes). */
export function choisirLivres(candidats, n = 5) {
  const vus = new Set();
  return [...candidats]
    .sort((a, b) => (Boolean(b.isbns?.length) - Boolean(a.isbns?.length)) || ((b.lecteurs || 0) - (a.lecteurs || 0)))
    .filter((c) => !vus.has(c.bookId) && vus.add(c.bookId))
    .slice(0, n);
}

/** Avance de Hardcover : pour des livres déjà parus, créé AVANT ou APRÈS leur date de parution ? (jours ; négatif = avant) */
export function avanceDeCatalogage(livres) {
  const ecarts = livres.filter((l) => l.creeLe && l.date).map((l) => jours(l.date, l.creeLe)).sort((a, b) => a - b);
  if (!ecarts.length) return null;
  const mediane = ecarts[Math.floor(ecarts.length / 2)];
  return {
    echantillon: ecarts.length,
    avantParution: ecarts.filter((e) => e <= 0).length,
    mediane,
    p90: ecarts[Math.min(ecarts.length - 1, Math.floor(ecarts.length * 0.9))],
  };
}

/**
 * Pour chaque livre et chaque critère (`bnf`, `olNotice`, `olCouverture`, `hcIsbn`, `hcImage`, `hcPages`), le premier jour où le relevé
 * est positif, et son écart avec la date de parution. `null` = pas encore vu.
 * @param {{id:string, date:string}[]} livres
 * @param {{date:string, livre:string, criteres:Object<string, boolean|null>}[]} releves un relevé par livre et par jour
 */
export function premieresApparitions(livres, releves) {
  return livres.map((l) => {
    const propres = releves.filter((r) => r.livre === l.id).sort((a, b) => a.date.localeCompare(b.date));
    const criteres = {};
    for (const r of propres) {
      for (const [nom, vrai] of Object.entries(r.criteres)) {
        if (!(nom in criteres)) criteres[nom] = null;
        if (vrai === true && criteres[nom] === null) criteres[nom] = { jour: r.date, apresParution: jours(l.date, r.date) };
      }
    }
    return { id: l.id, titre: l.titre, date: l.date, langue: l.langue, releves: propres.length, criteres };
  });
}

/** Résumé par critère et par langue : combien de livres vus, délai médian après la parution (négatif = avant). */
export function resumer(apparitions) {
  const parCritere = {};
  for (const a of apparitions) {
    for (const [nom, v] of Object.entries(a.criteres)) {
      const cle = `${a.langue}:${nom}`;
      const o = (parCritere[cle] ||= { langue: a.langue, critere: nom, suivis: 0, vus: [] });
      o.suivis += 1;
      if (v) o.vus.push(v.apresParution);
    }
  }
  return Object.values(parCritere).map((o) => {
    const tries = [...o.vus].sort((a, b) => a - b);
    return { langue: o.langue, critere: o.critere, suivis: o.suivis, vus: tries.length, medianeJours: tries.length ? tries[Math.floor(tries.length / 2)] : null };
  }).sort((a, b) => (a.langue + a.critere).localeCompare(b.langue + b.critere));
}
