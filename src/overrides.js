/*
 * overrides.js — corrections manuelles. Elles gagnent toujours sur les sources.
 * Forme :
 *   { series: { "<id canonique>": { noms: {fr, en}, fusionner: [ids doublons], exclurePositions: [nombres] } },
 *     couvertures: { "isbn:978…": url, "serie:<id>:<position>": url } }
 * Deux origines, même forme : le fichier data/overrides.json (développement, amorçage) et Supabase (production).
 */
import { readFileSync } from 'node:fs';
import { entetesSupabase } from './supabase.js';

const VIDE = { series: {}, couvertures: {} };

export function chargerOverrides(chemin = new URL('../data/overrides.json', import.meta.url)) {
  try {
    const o = JSON.parse(readFileSync(chemin, 'utf8'));
    return { series: o.series || {}, couvertures: o.couvertures || {} };
  } catch {
    return { ...VIDE };
  }
}

/**
 * Lit les corrections dans Supabase (tables series_overrides et cover_overrides) et les garde 5 minutes en mémoire.
 * En cas d'échec de lecture : on rend la dernière version connue, sinon le fichier — jamais une erreur pour l'utilisateur.
 */
export function overridesSupabase({ url, cle, repli = chargerOverrides(), fetchImpl = fetch, ttlMs = 5 * 60 * 1000 }) {
  const entetes = entetesSupabase(cle);
  let memo = null;
  let pose = 0;

  async function lire(table) {
    const r = await fetchImpl(`${url}/rest/v1/${table}?select=*`, { headers: entetes });
    if (!r.ok) throw new Error(`Supabase (${table}) a répondu ${r.status}`);
    return r.json();
  }

  return async function obtenir() {
    if (memo && Date.now() - pose < ttlMs) return memo;
    try {
      const [series, couvertures] = await Promise.all([lire('series_overrides'), lire('cover_overrides')]);
      const fusion = { series: { ...repli.series }, couvertures: { ...repli.couvertures } };
      for (const s of series) {
        fusion.series[String(s.series_id)] = {
          noms: { fr: s.name_fr || undefined, en: s.name_en || undefined },
          fusionner: s.merge_ids || [],
          exclurePositions: (s.exclude_positions || []).map(Number),
        };
      }
      for (const c of couvertures) fusion.couvertures[c.key] = c.url;
      memo = fusion;
      pose = Date.now();
      return memo;
    } catch {
      return memo || repli;
    }
  };
}

/** Vue pratique : id doublon → id canonique, nom d'une série dans une langue, correction de couverture. */
export function indexer(overrides) {
  const alias = new Map();
  const series = overrides?.series || {};
  const couvertures = overrides?.couvertures || {};
  for (const [canon, o] of Object.entries(series)) {
    (o.fusionner || []).forEach((id) => alias.set(Number(id), Number(canon)));
  }
  return {
    idCanonique: (id) => alias.get(Number(id)) ?? Number(id),
    nom: (id, lang, parDefaut) => series[String(id)]?.noms?.[lang] ?? parDefaut,
    existe: (id) => Boolean(series[String(id)]),
    couverture: ({ isbn13, serieId, position }) =>
      (isbn13 && couvertures[`isbn:${isbn13}`]) || (serieId && couvertures[`serie:${serieId}:${position}`]) || null,
  };
}

