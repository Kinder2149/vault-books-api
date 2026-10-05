/*
 * cache.js — cache clé/valeur. Deux implémentations, même interface :
 *   get(cle) → { valeur, ageMs } | null      set(cle, valeur)
 * `memoire` pour le développement et les tests ; `supabase` en production (table cache_entries, voir supabase/migrations).
 * Supabase est appelé par son API REST (PostgREST) : aucune dépendance à installer.
 */

import { entetesSupabase } from './supabase.js';

export function cacheMemoire() {
  const m = new Map();
  return {
    nom: 'memoire',
    async get(cle) {
      const e = m.get(cle);
      return e ? { valeur: e.valeur, ageMs: Date.now() - e.pose } : null;
    },
    async set(cle, valeur) { m.set(cle, { valeur, pose: Date.now() }); },
  };
}

export function cacheSupabase({ url, cle: cleService, fetchImpl = fetch }) {
  const entetes = entetesSupabase(cleService, { 'content-type': 'application/json' });
  return {
    nom: 'supabase',
    async get(cle) {
      const r = await fetchImpl(`${url}/rest/v1/cache_entries?key=eq.${encodeURIComponent(cle)}&select=value,fetched_at`, { headers: entetes });
      if (!r.ok) throw new Error(`Supabase (lecture cache) a répondu ${r.status}`);
      const [ligne] = await r.json();
      return ligne ? { valeur: ligne.value, ageMs: Date.now() - new Date(ligne.fetched_at).getTime() } : null;
    },
    async set(cle, valeur) {
      const r = await fetchImpl(`${url}/rest/v1/cache_entries?on_conflict=key`, {
        method: 'POST',
        headers: { ...entetes, prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ key: cle, value: valeur, fetched_at: new Date().toISOString() }),
      });
      if (!r.ok) throw new Error(`Supabase (écriture cache) a répondu ${r.status}`);
    },
  };
}

