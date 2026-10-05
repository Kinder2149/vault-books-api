-- Journal des appels du service : de quoi savoir si ça va (taux d'erreur, latence, part servie par le cache).
-- À exécuter UNE fois dans Supabase (SQL Editor) ; relançable sans danger.
--
-- VIE PRIVÉE : AUCUN texte de recherche, AUCUNE adresse IP, AUCUN identifiant n'est écrit ici. Seulement la route, le statut, la durée,
-- l'état du cache, la langue demandée (fr/en) et, pour une panne de source, un message court. Conservation : 30 jours (purge quotidienne,
-- voir src/entretien.js).

create table if not exists public.request_log (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  route   text not null,       -- search | series | books | isbn | status
  statut  integer not null,    -- code HTTP rendu
  ms      integer not null,    -- durée côté serveur
  cache   text,                -- frais | perime | absent | (vide si non applicable)
  langue  text,                -- fr | en
  erreur  text                 -- message court d'une panne de source (jamais une saisie de l'utilisateur)
);
create index if not exists request_log_at_idx on public.request_log (at);
alter table public.request_log enable row level security;   -- fermé au public : seule la clé secrète du service y accède

-- Statistiques sur les N dernières heures, en un seul appel : select public.stats_requetes(24);
create or replace function public.stats_requetes(heures integer default 24)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'heures', heures,
    'total', count(*),
    'erreurs_5xx', count(*) filter (where statut >= 500),
    'erreurs_4xx', count(*) filter (where statut between 400 and 499),
    'taux_erreur_5xx', case when count(*) = 0 then 0 else round((count(*) filter (where statut >= 500))::numeric / count(*), 4) end,
    'ms_p50', round(coalesce(percentile_cont(0.5) within group (order by ms), 0)::numeric),
    'ms_p95', round(coalesce(percentile_cont(0.95) within group (order by ms), 0)::numeric),
    'cache_frais', count(*) filter (where cache = 'frais'),
    'cache_absent', count(*) filter (where cache = 'absent'),
    'cache_perime', count(*) filter (where cache = 'perime'),
    'par_route', coalesce((select jsonb_object_agg(r.route, r.n)
                           from (select route, count(*) as n from public.request_log
                                 where at > now() - make_interval(hours => heures) group by route) r), '{}'::jsonb)
  )
  from public.request_log
  where at > now() - make_interval(hours => heures);
$$;

revoke all on function public.stats_requetes(integer) from public, anon, authenticated;
