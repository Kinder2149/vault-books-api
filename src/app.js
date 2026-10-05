/*
 * app.js — assemble le service avec ses vraies dépendances.
 * Une seule instance par processus : les fonctions serverless la réutilisent tant qu'elles sont « chaudes ».
 */
import { lireConfig } from './config.js';
import { creerHardcover } from './sources/hardcover.js';
import { creerBnf } from './sources/bnf.js';
import { cacheMemoire, cacheSupabase } from './cache.js';
import { chargerOverrides, overridesSupabase } from './overrides.js';
import { creerCouvertures } from './covers.js';
import { creerService } from './service.js';

let instance = null;

export function obtenirApp(env = process.env) {
  if (instance) return instance;
  const cfg = lireConfig(env);
  const supabase = cfg.supabaseUrl && cfg.supabaseKey;
  const cache = supabase ? cacheSupabase({ url: cfg.supabaseUrl, cle: cfg.supabaseKey }) : cacheMemoire();
  const fichier = chargerOverrides();
  instance = {
    cfg,
    cache,
    service: creerService({
      hardcover: creerHardcover({ cle: cfg.hardcoverKey }),
      bnf: creerBnf(),
      cache,
      overrides: supabase ? overridesSupabase({ url: cfg.supabaseUrl, cle: cfg.supabaseKey, repli: fichier }) : fichier,
      couvertures: creerCouvertures({ cache }),
    }),
  };
  return instance;
}
