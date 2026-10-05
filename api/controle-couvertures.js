// GET /api/controle-couvertures — appelée chaque lundi par la tâche planifiée de Vercel (voir vercel.json, "crons").
// Vérifie que les couvertures corrigées à la main répondent encore ; garde le résultat pour /v1/status. Protégée par CRON_SECRET.
import { repondre } from '../src/http.js';
import { lireConfig } from '../src/config.js';
import { autoriseCron } from '../src/entretien.js';
import { creerControleCouvertures } from '../src/controle-couvertures.js';
import { cacheSupabase } from '../src/cache.js';

export default async function handler(req, res) {
  const cfg = lireConfig();
  if (!cfg.cronSecret) return repondre(res, 503, { erreur: 'CRON_SECRET non configuré : contrôle désactivé.' });
  if (!autoriseCron(req.headers.authorization, cfg.cronSecret)) return repondre(res, 401, { erreur: 'Non autorisé.' });
  if (!cfg.supabaseUrl || !cfg.supabaseKey) return repondre(res, 503, { erreur: 'Supabase non configuré.' });

  try {
    const resultat = await creerControleCouvertures({ url: cfg.supabaseUrl, cle: cfg.supabaseKey }).executer();
    await cacheSupabase({ url: cfg.supabaseUrl, cle: cfg.supabaseKey }).set('controle:couvertures', resultat);
    console.log('[controle-couvertures]', JSON.stringify({ total: resultat.total, mortes: resultat.mortes.length }));
    if (resultat.mortes.length) console.error('[controle-couvertures] ADRESSES MORTES', JSON.stringify(resultat.mortes));
    repondre(res, 200, { ok: true, ...resultat });
  } catch (e) {
    console.error('[controle-couvertures]', e);
    repondre(res, 502, { ok: false, erreur: e.message });
  }
}
