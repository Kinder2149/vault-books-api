// GET /v1/status — l'état détaillé du service (protégé par la clé d'application, comme les autres routes de données).
//   /v1/status            : Supabase, Hardcover (sans coût : requête d'introspection), quota, statistiques des 24 dernières heures
//   /v1/status?profond=1  : + la BnF (1 requête réelle, donc plus lente : à n'utiliser qu'à la main)
// Ne rend AUCUN secret, AUCUNE valeur de configuration : seulement des états.
import { gestionnaire, repondre } from '../src/http.js';

async function mesurer(fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();                       // la durée se mesure APRÈS l'appel (l'ordre des propriétés d'un littéral compte)
    return { ok: true, ms: Date.now() - t0, ...detail };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, erreur: String(e.message).slice(0, 120) };
  }
}

export default gestionnaire(async ({ url, app, res }) => {
  const supabase = app.cache.nom === 'supabase'
    ? await mesurer(async () => { await app.cache.get('statut:test'); return {}; })
    : { ok: true, ms: 0, note: 'cache en mémoire (développement)' };

  const hardcover = await mesurer(async () => { await app.hardcover.ping(); return { quota: app.hardcover.quota() }; });

  const bnf = url.searchParams.get('profond')
    ? await mesurer(async () => { await app.bnf.parIsbn('9782749910147'); return {}; })
    : { ok: null, note: 'non testée (ajouter ?profond=1)' };

  const stats24h = app.journal ? await app.journal.stats(24) : null;
  // Dernier contrôle hebdomadaire des couvertures corrigées à la main (adresses mortes à remplacer).
  let couverturesCorrigees = null;
  try { couverturesCorrigees = (await app.cache.get('controle:couvertures'))?.valeur || null; } catch { /* le statut ne dépend pas de ce détail */ }
  let nouveautes = null;
  try { nouveautes = (await app.cache.get('controle:nouveautes'))?.valeur?.evenements?.slice(0, 10) || null; } catch { /* idem */ }
  const ok = supabase.ok && hardcover.ok && bnf.ok !== false;

  repondre(res, ok ? 200 : 503, {
    ok,
    version: '0.2.0',
    supabase,
    hardcover,
    bnf,
    stats24h,
    couverturesCorrigees,
    // Les derniers tomes devenus disponibles, vus par la relecture nocturne des sagas en cours.
    nouveautes,
    // Le quota du jour restant, en clair : sous 1 000, le service passe en mode économie (cache seul).
    modeEconomie: Number.isFinite(hardcover.quota?.restantJour) && hardcover.quota.restantJour < 1000,
  });
}, { route: 'status' });
