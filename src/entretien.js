/*
 * entretien.js — l'entretien quotidien du service (appelé par la tâche planifiée de Vercel, route /api/entretien).
 *
 * Il fait trois choses, et la première est la plus importante :
 *  1. GARDER SUPABASE ACTIF. Un projet gratuit se met en pause après ~7 jours sans activité ; l'entretien lit et écrit chaque jour.
 *  2. PURGER le cache : les entrées d'une ancienne version du format (`search:v3:…` quand la version courante est v4) ne servent plus
 *     à personne, et celles plus vieilles que 30 jours sont périmées de toute façon (le plus long TTL est de 30 jours ; mesuré le 2026-10-05, 60 jours de cache laissaient moins de 3× de marge sur les 500 Mo gratuits). Les clés de
 *     couvertures (`cover:…`), de quota (`quota:…`) et de contrôle (`controle:…`) n'ont pas de version : elles ne partent que par l'âge.
 *  3. PURGER le journal des appels au-delà de 30 jours (aucune donnée personnelle n'y est écrite, mais la durée est bornée par principe).
 *
 * Tout passe par l'API REST de Supabase : aucune dépendance.
 */
import { entetesSupabase } from './supabase.js';

const JOUR = 24 * 60 * 60 * 1000;
export const AGE_MAX_CACHE_MS = 30 * JOUR;
export const AGE_MAX_JOURNAL_MS = 30 * JOUR;

/** La tâche planifiée de Vercel envoie `Authorization: Bearer <CRON_SECRET>`. Sans secret configuré, on refuse TOUT. */
export function autoriseCron(enteteAuthorization, secret) {
  if (!secret) return false;
  return enteteAuthorization === `Bearer ${secret}`;
}

// Le nombre de lignes lu dans l'en-tête Content-Range : « 0-0/42 » pour une lecture, « étoile/42 » pour une suppression.
export function lireTotal(contentRange) {
  const m = String(contentRange || '').match(/\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

export function creerEntretien({ url, cle, version, fetchImpl = fetch, maintenant = Date.now }) {
  const base = `${url}/rest/v1`;

  async function compter(table) {
    const r = await fetchImpl(`${base}/${table}?select=*&limit=1`, { headers: entetesSupabase(cle, { prefer: 'count=exact' }) });
    if (!r.ok) throw new Error(`Supabase (${table}) a répondu ${r.status}`);
    return lireTotal(r.headers.get('content-range'));
  }

  /** Supprime les lignes qui correspondent au filtre PostgREST ; rend combien. */
  async function supprimer(table, filtre) {
    const r = await fetchImpl(`${base}/${table}?${filtre}`, { method: 'DELETE', headers: entetesSupabase(cle, { prefer: 'count=exact,return=minimal' }) });
    if (!r.ok) throw new Error(`Supabase (suppression dans ${table}) a répondu ${r.status}`);
    return lireTotal(r.headers.get('content-range')) ?? 0;
  }

  return {
    async executer() {
      const debut = maintenant();
      const entreesAvant = await compter('cache_entries');

      // Les clés versionnées (search/serie/livre/isbn) d'une AUTRE version que la courante. Les clés sans version (cover:, quota:) sont exclues.
      const anciennesVersions = await supprimer('cache_entries',
        `and=(key.not.like.*:${version}:*,key.not.like.cover:*,key.not.like.quota:*,key.not.like.controle:*)`);

      const limiteCache = new Date(debut - AGE_MAX_CACHE_MS).toISOString();
      const tropVieilles = await supprimer('cache_entries', `fetched_at=lt.${limiteCache}`);

      let journalPurge = null;
      let journal = null;
      try {
        const limiteJournal = new Date(debut - AGE_MAX_JOURNAL_MS).toISOString();
        journalPurge = await supprimer('request_log', `at=lt.${limiteJournal}`);
        journal = await compter('request_log');
      } catch { /* la table du journal n'existe pas encore : l'entretien du cache ne doit pas en dépendre */ }

      return {
        ok: true,
        version,
        entreesAvant,
        entreesApres: await compter('cache_entries'),
        anciennesVersions,
        tropVieilles,
        journal,
        journalPurge,
        duree_ms: maintenant() - debut,
      };
    },
  };
}
