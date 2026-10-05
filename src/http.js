/*
 * http.js — petits utilitaires communs aux fonctions HTTP (Vercel) et au serveur local.
 * Les gestionnaires n'utilisent que `req.url`, `req.method`, `req.headers` et `res.statusCode/setHeader/end` :
 * ils tournent donc aussi bien sous Vercel que sous `node:http`.
 */
import { ErreurRequete } from './service.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, x-app-key',
  'access-control-allow-methods': 'GET, OPTIONS',
};

export function repondre(res, statut, corps, { cacheControl = 'no-store' } = {}) {
  res.statusCode = statut;
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', cacheControl);
  res.end(JSON.stringify(corps));
}

/** Enveloppe commune : OPTIONS, méthode, clé d'application, erreurs mises en forme. */
export function gestionnaire(fn) {
  return async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return repondre(res, 204, {});
      if (req.method !== 'GET') return repondre(res, 405, { erreur: 'Méthode non autorisée.' });
      const { obtenirApp } = await import('./app.js');
      const app = obtenirApp();
      if (app.cfg.appKey && req.headers['x-app-key'] !== app.cfg.appKey) {
        return repondre(res, 401, { erreur: 'Clé d\'application manquante ou invalide.' });
      }
      const url = new URL(req.url, 'http://localhost');
      return await fn({ url, app, res });
    } catch (e) {
      if (e instanceof ErreurRequete) return repondre(res, 400, { erreur: e.message });
      console.error('[api]', e);
      return repondre(res, 502, { erreur: 'Source de données indisponible, réessayez dans un instant.' });
    }
  };
}

// Cache de bord (CDN Vercel) : une réponse partagée 5 min, et resservie périmée pendant qu'elle se renouvelle.
export const CACHE_CDN = 's-maxage=300, stale-while-revalidate=86400';
