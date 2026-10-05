/*
 * journal.js — le journal des appels (table request_log, voir supabase/migrations/0002_journal.sql).
 *
 * RÈGLES, qui sont des promesses faites aux utilisateurs :
 *  - on n'écrit JAMAIS le texte d'une recherche, JAMAIS une adresse IP, JAMAIS un en-tête ;
 *  - un message d'erreur n'est gardé que pour une panne de SOURCE (5xx), tronqué, jamais pour une erreur de requête (4xx) : celle-ci
 *    peut citer ce que l'utilisateur a saisi ;
 *  - écrire dans le journal n'est jamais une raison d'échouer, ni de ralentir la réponse : l'appel part APRÈS que la réponse a été envoyée.
 */
import { entetesSupabase } from './supabase.js';

const LANGUES = new Set(['fr', 'en']);
const ERREUR_MAX = 120;

/** La ligne à écrire pour un appel terminé. Fonction pure, testée : c'est elle qui garantit ce qui sort du service. */
export function ligneDeJournal({ route, statut, ms, cache, lang, erreur }) {
  return {
    route,
    statut,
    ms: Math.max(0, Math.round(ms)),
    cache: ['frais', 'perime', 'absent'].includes(cache) ? cache : null,
    langue: LANGUES.has(String(lang || '').toLowerCase()) ? String(lang).toLowerCase() : null,
    erreur: statut >= 500 && erreur ? String(erreur).slice(0, ERREUR_MAX) : null,
  };
}

export function creerJournal({ url, cle, fetchImpl = fetch, delaiMs = 1500 }) {
  const base = `${url}/rest/v1`;

  async function avecDelai(fn) {
    const arret = new AbortController();
    const minuteur = setTimeout(() => arret.abort(), delaiMs);
    try { return await fn(arret.signal); } finally { clearTimeout(minuteur); }
  }

  return {
    /** Écrit une ligne. Ne rejette jamais. */
    async noter(ligne) {
      try {
        await avecDelai((signal) => fetchImpl(`${base}/request_log`, {
          method: 'POST',
          headers: entetesSupabase(cle, { 'content-type': 'application/json', prefer: 'return=minimal' }),
          body: JSON.stringify(ligne),
          signal,
        }));
      } catch { /* le journal n'est jamais une raison d'échouer */ }
    },

    /** Les statistiques des N dernières heures (fonction SQL `stats_requetes`). Rend null si indisponible. */
    async stats(heures = 24) {
      try {
        const r = await avecDelai((signal) => fetchImpl(`${base}/rpc/stats_requetes`, {
          method: 'POST',
          headers: entetesSupabase(cle, { 'content-type': 'application/json' }),
          body: JSON.stringify({ heures }),
          signal,
        }));
        return r.ok ? await r.json() : null;
      } catch {
        return null;
      }
    },
  };
}
