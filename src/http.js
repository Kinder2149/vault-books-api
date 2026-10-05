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
  res.setHeader('vary', 'x-app-key');
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

/*
 * PAS DE CACHE PARTAGÉ (CDN). Le CDN de Vercel clef ses réponses sur l'adresse, pas sur l'en-tête x-app-key : une réponse déjà servie à l'application
 * devenait lisible SANS clé (constaté le 2026-10-05 : le test « sans clé -> 401 » rendait 200 sur une adresse déjà demandée). Le service a son propre
 * cache (Supabase) et répond en quelques dizaines de ms une fois chaud : le cache de bord n'apportait presque rien. private ne laisse que le cache de l'appelant.
 */
export const CACHE_CDN = 'private, max-age=60';
