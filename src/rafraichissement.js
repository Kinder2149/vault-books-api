/*
 * rafraichissement.js — la tâche nocturne relit les sagas EN COURS et signale un nouveau tome.
 *
 * Une saga est « en cours » quand elle annonce des tomes à paraître, ou quand elle en annonce plus (`totalPrincipal`) qu'elle n'en a de
 * disponibles. Sans cette tâche, une saga n'est relue que si quelqu'un la consulte, et au plus une fois par jour (TTL d'un jour) : un tome
 * sorti pendant la nuit ne serait vu qu'à la prochaine consultation. Avec elle, les sagas en cours les plus anciennes du cache sont relues
 * chaque nuit, dans la limite d'un budget d'appels et de temps, et chaque tome qui devient disponible est consigné.
 *
 * Elle ne touche JAMAIS à la source quand le quota du jour est bas (le service lève alors ErreurQuota : on s'arrête, sans erreur).
 */
import { entetesSupabase } from './supabase.js';
import { ErreurQuota } from './service.js';

export const MAX_SAGAS_PAR_NUIT = 12;
export const BUDGET_MS = 40_000;
export const CLE_NOUVEAUTES = 'controle:nouveautes';
const MAX_EVENEMENTS = 50;

/** « serie:v5:fr:25608 » → { lang: 'fr', id: 25608 } ; null si la clé n'est pas une clé de saga de cette version. */
export function lireCleSerie(cle, version) {
  const m = String(cle).match(new RegExp(`^serie:${version}:(fr|en):(\\d+)$`));
  return m ? { lang: m[1], id: Number(m[2]) } : null;
}

/** Les sagas à relire cette nuit : les en cours d'abord, les plus anciennes d'abord. `lignes` : { key, fetched_at, aparaitre, disp, total }. */
export function choisirSagas(lignes, version, max = MAX_SAGAS_PAR_NUIT) {
  return lignes
    .map((l) => ({ ...l, ...lireCleSerie(l.key, version) }))
    .filter((l) => l.id)
    .filter((l) => (Number(l.aparaitre) || 0) > 0 || (Number.isFinite(Number(l.total)) && l.total !== null && Number(l.disp) < Number(l.total)))
    .sort((a, b) => String(a.fetched_at).localeCompare(String(b.fetched_at)))
    .slice(0, max);
}

/** Les tomes devenus disponibles entre deux états d'une saga. */
export function nouveauxTomes(avant, apres) {
  const dispoAvant = Number(avant) || 0;
  const dispoApres = Number(apres) || 0;
  return dispoApres > dispoAvant ? dispoApres - dispoAvant : 0;
}

export function creerRafraichissement({ url, cle, service, cache, version, maintenant = Date.now, fetchImpl = fetch, budgetMs = BUDGET_MS, maxSagas = MAX_SAGAS_PAR_NUIT }) {
  const base = `${url}/rest/v1`;

  async function lignes() {
    const select = 'key,fetched_at,aparaitre:value->aParaitre,disp:value->disponibles,total:value->totalPrincipal';
    const r = await fetchImpl(`${base}/cache_entries?key=like.${encodeURIComponent(`serie:${version}:*`)}&select=${select}&order=fetched_at.asc&limit=300`, { headers: entetesSupabase(cle) });
    if (!r.ok) throw new Error(`Supabase (lecture des sagas) a répondu ${r.status}`);
    return r.json();
  }

  return {
    async executer() {
      const debut = maintenant();
      const choisies = choisirSagas(await lignes(), version, maxSagas);
      const nouveautes = [];
      let relues = 0;
      let arret = null;

      for (const s of choisies) {
        if (maintenant() - debut > budgetMs) { arret = 'budget de temps'; break; }
        try {
          const apres = await service.serie(s.id, s.lang, { rafraichir: true });
          relues += 1;
          const n = nouveauxTomes(s.disp, apres?.disponibles);
          if (n > 0) nouveautes.push({ id: s.id, nom: apres.nom, langue: s.lang, nouveaux: n, disponibles: apres.disponibles, le: new Date(maintenant()).toISOString() });
        } catch (e) {
          if (e instanceof ErreurQuota) { arret = 'quota du jour'; break; }
          // Une saga qui échoue ne retient pas les autres.
        }
      }

      if (nouveautes.length && cache) {
        try {
          const ancien = (await cache.get(CLE_NOUVEAUTES))?.valeur?.evenements || [];
          await cache.set(CLE_NOUVEAUTES, { evenements: [...nouveautes, ...ancien].slice(0, MAX_EVENEMENTS) });
        } catch { /* consigner n'est pas essentiel */ }
      }
      return { candidates: choisies.length, relues, nouveautes, arret, duree_ms: maintenant() - debut };
    },
  };
}

// ---------------------------------------------------------------------------
// Réchauffement hebdomadaire des éditions françaises (BnF)
// ---------------------------------------------------------------------------

/**
 * Les livres (tomes) des sagas du cache, à relire pour que leurs éditions françaises — celles de la BnF — soient en cache AVANT qu'on les
 * demande : la BnF est lente (jusqu'à 9 s) et n'accepte qu'une requête par seconde environ, ce qu'une consultation en direct ne peut pas se permettre.
 * @param {{value: object}[]} sagas lignes du cache `serie:…` (valeur complète)
 * @returns {number[]} identifiants de livres, sans doublon, dans l'ordre des sagas
 */
export function livresARechauffer(sagas, max = 60) {
  const vus = new Set();
  const ids = [];
  for (const s of sagas) {
    for (const t of s.value?.tomes || []) {
      if (!t.disponible || !t.livreId || vus.has(t.livreId)) continue;
      vus.add(t.livreId);
      ids.push(t.livreId);
      for (const p of t.parties || []) if (p.livreId && !vus.has(p.livreId)) { vus.add(p.livreId); ids.push(p.livreId); }
    }
  }
  return ids.slice(0, max);
}

/**
 * Relit (via le service, donc avec son cache) les livres donnés. Une réponse déjà fraîche ne coûte rien et ne rappelle ni Hardcover ni la BnF :
 * relancer après une coupure REPREND donc là où on s'était arrêté. La BnF est espacée par son adaptateur (≥ 1,1 s).
 */
export async function rechauffer({ service, ids, lang = 'fr', maintenant = Date.now, budgetMs = 10 * 60_000 }) {
  const debut = maintenant();
  const bilan = { demandes: 0, dejaEnCache: 0, bnfOk: 0, bnfIndisponible: 0, absents: 0, arret: null };
  for (const id of ids) {
    if (maintenant() - debut > budgetMs) { bilan.arret = 'budget de temps'; break; }
    try {
      const r = await service.livre(id, lang);
      bilan.demandes += 1;
      if (!r) bilan.absents += 1;
      else if (r.cache === 'frais') bilan.dejaEnCache += 1;
      else if (r.sourceBnf === 'indisponible') bilan.bnfIndisponible += 1;
      else bilan.bnfOk += 1;
    } catch (e) {
      if (e instanceof ErreurQuota) { bilan.arret = 'quota du jour'; break; }
    }
  }
  return { ...bilan, duree_ms: maintenant() - debut };
}
