/*
 * http.js — petits utilitaires communs aux fonctions HTTP (Vercel) et au serveur local.
 * Les gestionnaires n'utilisent que `req.url`, `req.method`, `req.headers` et `res.statusCode/setHeader/end` :
 * ils tournent donc aussi bien sous Vercel que sous `node:http`.
 */
import { ErreurRequete, ErreurQuota } from './service.js';
import { ligneDeJournal } from './journal.js';
import { creerLimiteClient, clientDe } from './limite.js';

// Une limite par client (voir limite.js) : 90 appels par minute, très au-dessus d'un usage normal (recherche au fil de la frappe comprise).
const limiteClient = creerLimiteClient({ fenetreMs: 60_000, max: 90 });

/** Sans clé configurée, tout passe (développement). Sinon : la clé courante, ou l'ancienne pendant une rotation. */
export function cleAcceptee(recue, cfg) {
  if (!cfg.appKey) return true;
  return recue === cfg.appKey || (Boolean(cfg.appKeyPrecedente) && recue === cfg.appKeyPrecedente);
}

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
  // Ce qu'il faut au journal : jamais le corps, seulement le statut et l'état du cache.
  res._meta = { ...(res._meta || {}), statut, cache: corps && corps.cache };
  res.end(JSON.stringify(corps));
}

/**
 * Enveloppe commune : OPTIONS, méthode, clé d'application, erreurs mises en forme, et JOURNAL des appels.
 * Le journal est écrit APRÈS l'envoi de la réponse : l'utilisateur n'attend jamais pour lui.
 * @param {Function} fn corps de la route
 * @param {{route?: string}} options `route` : nom court inscrit au journal ; sans lui, rien n'est journalisé
 */
export function gestionnaire(fn, { route } = {}) {
  return async (req, res) => {
    const debut = Date.now();
    let app = null;
    let url = null;
    try {
      if (req.method === 'OPTIONS') return repondre(res, 204, {});
      if (req.method !== 'GET') return repondre(res, 405, { erreur: 'Méthode non autorisée.' });
      const { obtenirApp } = await import('./app.js');
      app = obtenirApp();
      if (!cleAcceptee(req.headers['x-app-key'], app.cfg)) {
        return repondre(res, 401, { erreur: 'Clé d\'application manquante ou invalide.' });
      }
      const limite = limiteClient.verifier(clientDe(req.headers));
      if (!limite.autorise) {
        res.setHeader('retry-after', String(limite.reessayerDansSecondes));
        return repondre(res, 429, { erreur: 'Trop de requêtes : réessayez dans un instant.' });
      }
      url = new URL(req.url, 'http://localhost');
      return await fn({ url, app, res });
    } catch (e) {
      if (e instanceof ErreurRequete) return repondre(res, 400, { erreur: e.message });
      if (e instanceof ErreurQuota) {
        res._meta = { ...(res._meta || {}), erreur: 'quota de la source' };
        return repondre(res, 503, { erreur: 'Le catalogue est en mode économie (quota de la source) : réessayez plus tard.' });
      }
      console.error('[api]', e);
      res._meta = { ...(res._meta || {}), erreur: e.message };
      return repondre(res, 502, { erreur: 'Source de données indisponible, réessayez dans un instant.' });
    } finally {
      if (route && app && app.journal && req.method === 'GET') {
        const m = res._meta || {};
        await app.journal.noter(ligneDeJournal({
          route, statut: m.statut ?? res.statusCode, ms: Date.now() - debut, cache: m.cache,
          lang: url && url.searchParams.get('lang'), erreur: m.erreur,
        }));
      }
    }
  };
}

/*
 * PAS DE CACHE PARTAGÉ (CDN). Le CDN de Vercel clef ses réponses sur l'adresse, pas sur l'en-tête `x-app-key` : une réponse déjà servie à l'application
 * devenait lisible SANS clé (constaté le 2026-10-05 : le test « sans clé -> 401 » rendait 200 sur une adresse déjà demandée). Le service a son propre
 * cache (Supabase) et répond en quelques dizaines de ms une fois chaud : le cache de bord n'apportait presque rien. `private` ne laisse que le cache de l'appelant.
 */
export const CACHE_CDN = 'private, max-age=60';
