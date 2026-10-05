// GET /v1/health — répond sans appeler de source : sert à vérifier que le déploiement est vivant.
import { repondre } from '../src/http.js';
import { lireConfig } from '../src/config.js';

export default async function handler(req, res) {
  const cfg = lireConfig();
  repondre(res, 200, {
    ok: true,
    version: '0.1.0',
    cache: cfg.supabaseUrl && cfg.supabaseKey ? 'supabase' : 'memoire',
    hardcover: cfg.hardcoverKey ? 'configure' : 'cle manquante',
  });
}
