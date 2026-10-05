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
import { creerJournal } from './journal.js';

let instance = null;

export function obtenirApp(env = process.env) {
  if (instance) return instance;
  const cfg = lireConfig(env);
  const supabase = cfg.supabaseUrl && cfg.supabaseKey;
  const cache = supabase ? cacheSupabase({ url: cfg.supabaseUrl, cle: cfg.supabaseKey }) : cacheMemoire();
  const fichier = chargerOverrides();
  const hardcover = creerHardcover({ cle: cfg.hardcoverKey });
  const bnf = creerBnf();
  instance = {
    cfg,
    cache,
    hardcover,
    bnf,
    // Sans Supabase (développement local), il n'y a pas de journal : les routes fonctionnent à l'identique.
    journal: supabase ? creerJournal({ url: cfg.supabaseUrl, cle: cfg.supabaseKey }) : null,
    service: creerService({
      hardcover,
      bnf,
      cache,
      overrides: supabase ? overridesSupabase({ url: cfg.supabaseUrl, cle: cfg.supabaseKey, repli: fichier }) : fichier,
      couvertures: creerCouvertures({ cache }),
    }),
  };
  return instance;
}
