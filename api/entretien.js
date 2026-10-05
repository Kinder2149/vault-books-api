// GET /api/entretien — appelée chaque nuit par la tâche planifiée de Vercel (voir vercel.json, "crons").
// Garde Supabase actif et purge le cache et le journal. Protégée par CRON_SECRET (et NON par la clé d'application, qui n'est pas secrète).
import { repondre } from '../src/http.js';
import { lireConfig } from '../src/config.js';
import { VERSION_CACHE } from '../src/service.js';
import { autoriseCron, creerEntretien } from '../src/entretien.js';

export default async function handler(req, res) {
  const cfg = lireConfig();
  if (!cfg.cronSecret) return repondre(res, 503, { erreur: 'CRON_SECRET non configuré : entretien désactivé.' });
  if (!autoriseCron(req.headers.authorization, cfg.cronSecret)) return repondre(res, 401, { erreur: 'Non autorisé.' });
  if (!cfg.supabaseUrl || !cfg.supabaseKey) return repondre(res, 503, { erreur: 'Supabase non configuré.' });

  try {
    const resultat = await creerEntretien({ url: cfg.supabaseUrl, cle: cfg.supabaseKey, version: VERSION_CACHE }).executer();
    console.log('[entretien]', JSON.stringify(resultat));
    repondre(res, 200, resultat);
  } catch (e) {
    console.error('[entretien]', e);
    repondre(res, 502, { ok: false, erreur: e.message });
  }
}
