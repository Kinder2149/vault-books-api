/*
 * overrides.js — corrections manuelles. Elles gagnent toujours sur les sources.
 * Forme :
 *   { series: { "<id canonique>": { noms: {fr, en}, fusionner: [ids doublons], exclurePositions: [nombres], note } },
 *     couvertures: { "isbn:978…": url, "serie:<id>:<position>": url } }
 * Deux origines, même forme : Supabase (production, source de vérité) et le fichier data/overrides.json (repli, et SAUVEGARDE :
 * il est réécrit chaque nuit depuis Supabase par scripts/exporter-corrections.mjs).
 */
import { readFileSync } from 'node:fs';
import { entetesSupabase } from './supabase.js';

const VIDE = { series: {}, couvertures: {}, recherches: {} };

export function chargerOverrides(chemin = new URL('../data/overrides.json', import.meta.url)) {
  try {
    const o = JSON.parse(readFileSync(chemin, 'utf8'));
    return { series: o.series || {}, couvertures: o.couvertures || {}, recherches: o.recherches || {} };
  } catch {
    return { ...VIDE };
  }
}

/**
 * Lecture STRICTE des corrections dans Supabase : toute erreur est une erreur. C'est ce qu'il faut à la sauvegarde, qui ne doit jamais
 * prendre un repli silencieux pour la réalité. Le service, lui, passe par `overridesSupabase` (qui tolère les pannes).
 */
export async function lireOverridesSupabase({ url, cle, fetchImpl = fetch }) {
  const entetes = entetesSupabase(cle);
  async function lire(table, { optionnelle = false } = {}) {
    const r = await fetchImpl(`${url}/rest/v1/${table}?select=*&order=${{ cover_overrides: 'key', search_aliases: 'query_norm' }[table] || 'series_id'}`, { headers: entetes });
    if (!r.ok) throw new Error(`Supabase (${table}) a répondu ${r.status}`);
    return r.json();
  }
  const [series, couvertures, alias] = await Promise.all([lire('series_overrides'), lire('cover_overrides'), lire('search_aliases', { optionnelle: true })]);
  const resultat = { series: {}, couvertures: {}, recherches: {} };
  for (const s of series) {
    resultat.series[String(s.series_id)] = {
      noms: { fr: s.name_fr || undefined, en: s.name_en || undefined },
      fusionner: (s.merge_ids || []).map(Number),
      exclurePositions: (s.exclude_positions || []).map(Number),
      ...(s.note ? { note: s.note } : {}),
    };
  }
  for (const c of couvertures) resultat.couvertures[c.key] = c.url;
  for (const a of alias) resultat.recherches[a.query_norm] = a.target;
  return resultat;
}

/**
 * Lit les corrections dans Supabase et les garde 5 minutes en mémoire.
 * En cas d'échec de lecture : on rend la dernière version connue, sinon le fichier — jamais une erreur pour l'utilisateur.
 */
export function overridesSupabase({ url, cle, repli = chargerOverrides(), fetchImpl = fetch, ttlMs = 5 * 60 * 1000 }) {
  let memo = null;
  let pose = 0;

  return async function obtenir() {
    if (memo && Date.now() - pose < ttlMs) return memo;
    try {
      const lues = await lireOverridesSupabase({ url, cle, fetchImpl });
      memo = { series: { ...repli.series, ...lues.series }, couvertures: { ...repli.couvertures, ...lues.couvertures }, recherches: { ...repli.recherches, ...lues.recherches } };
      pose = Date.now();
      return memo;
    } catch {
      return memo || repli;
    }
  };
}

/** Préfixe des clés de `cover_overrides` qui désignent une image RETIRÉE (demande d'un ayant droit) : `masque:<adresse https de l'image>`. */
export const PREFIXE_MASQUE = 'masque:';

/** L'ensemble des adresses d'images à ne plus jamais rendre. */
export function urlsMasquees(overrides) {
  return new Set(Object.keys(overrides?.couvertures || {}).filter((k) => k.startsWith(PREFIXE_MASQUE)).map((k) => k.slice(PREFIXE_MASQUE.length)));
}

/** Vue pratique : id doublon → id canonique, nom d'une série dans une langue, correction de couverture. */
export function indexer(overrides) {
  const alias = new Map();
  const series = overrides?.series || {};
  const couvertures = overrides?.couvertures || {};
  const recherches = overrides?.recherches || {};
  for (const [canon, o] of Object.entries(series)) {
    (o.fusionner || []).forEach((id) => alias.set(Number(id), Number(canon)));
  }
  return {
    idCanonique: (id) => alias.get(Number(id)) ?? Number(id),
    nom: (id, lang, parDefaut) => series[String(id)]?.noms?.[lang] ?? parDefaut,
    existe: (id) => Boolean(series[String(id)]),
    // Alias de recherche : une requête (normalisée) → ce qu'il faut réellement chercher chez Hardcover (titres français absents de son index).
    alias: (requeteNormalisee) => recherches[requeteNormalisee] || null,
    couverture: ({ isbn13, serieId, position }) =>
      (isbn13 && couvertures[`isbn:${isbn13}`]) || (serieId && couvertures[`serie:${serieId}:${position}`]) || null,
  };
}
