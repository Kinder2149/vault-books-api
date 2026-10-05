/* config.js — réglages, lus dans l'environnement. Aucune clé n'est écrite ici. */

const JOUR = 24 * 60 * 60 * 1000;

export const TTL = {
  recherche: 7 * JOUR,
  serie: 1 * JOUR,   // une saga en cours peut recevoir un tome : on la relit chaque jour
  isbn: 30 * JOUR,   // une édition ne change presque jamais
  isbnAbsent: 1 * JOUR,         // un ISBN inconnu aujourd'hui peut être catalogué demain
  isbnIncertain: 5 * 60 * 1000, // inconnu de Hardcover ET la BnF n'a pas répondu : on retentera très bientôt
};

export const LANGUES = ['fr', 'en'];
export const LANGUE_PAR_DEFAUT = 'fr';

export function lireConfig(env = process.env) {
  return {
    hardcoverKey: (env.HARDCOVER_API_KEY || '').trim(),
    supabaseUrl: (env.SUPABASE_URL || '').trim().replace(/\/$/, ''),
    supabaseKey: (env.SUPABASE_SERVICE_KEY || '').trim(),
    // Clé d'application facultative : sert à limiter l'abus, pas à protéger un secret (un APK ne garde rien de secret).
    appKey: (env.APP_KEY || '').trim(),
    // Ancienne clé, acceptée le temps de la rotation (les applications déjà installées gardent l'ancienne jusqu'à leur mise à jour).
    appKeyPrecedente: (env.APP_KEY_PRECEDENTE || '').trim(),
    // Secret de la tâche planifiée (Vercel Cron l'envoie en Authorization: Bearer …). Sans lui, la route d'entretien refuse tout.
    cronSecret: (env.CRON_SECRET || '').trim(),
  };
}
