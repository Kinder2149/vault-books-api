-- Cache clé/valeur + tables de corrections manuelles.
-- À exécuter UNE fois dans Supabase : SQL Editor → coller → Run. Peut être relancé sans danger (if not exists).
-- La clé `service_role` (SUPABASE_SERVICE_KEY) ne doit JAMAIS figurer dans l'app ni dans git.

-- 1. Cache : réponses de l'API et résultats de vérification de couvertures.
create table if not exists public.cache_entries (
  key        text primary key,
  value      jsonb not null,
  fetched_at timestamptz not null default now()
);
create index if not exists cache_entries_fetched_at_idx on public.cache_entries (fetched_at);

-- 2. Corrections de séries : elles gagnent toujours sur les sources.
--    Exemple : Le Seigneur des anneaux (série canonique 1130, doublons 87481-87483, hors-série à exclure : 1.5).
create table if not exists public.series_overrides (
  series_id         integer primary key,                    -- identifiant canonique (Hardcover)
  name_fr           text,                                   -- nom affiché en français
  name_en           text,
  merge_ids         integer[] not null default '{}',        -- séries doublons à réunir dans celle-ci
  exclude_positions numeric[] not null default '{}',        -- positions à ignorer (hors-séries, doublons)
  note              text,
  updated_at        timestamptz not null default now()
);

-- 3. Corrections de couvertures : la BONNE image d'une édition (clé 'isbn:978…') ou d'un tome (clé 'serie:<id>:<position>').
create table if not exists public.cover_overrides (
  key        text primary key,
  url        text not null,
  note       text,
  updated_at timestamptz not null default now()
);

-- 4. Amorçage : les corrections déjà validées sur nos 3 sagas de référence (relancer ne les duplique pas).
insert into public.series_overrides (series_id, name_fr, name_en, merge_ids, exclude_positions, note) values
  (981,   'Le Trône de fer',            'A Song of Ice and Fire', '{}',                 '{}',    'Hardcover y mélange coffrets, traductions et volumes français coupés.'),
  (1130,  'Le Seigneur des anneaux',    'The Lord of the Rings',  '{87481,87482,87483}', '{1.5}', 'Séries 87481-87483 = doublons français incomplets ; 1.5 = Tom Bombadil.'),
  (25608, 'Les Chevaliers d''Émeraude', 'Emerald Knights',        '{}',                 '{}',    'Premier cycle, 12 tomes.')
on conflict (series_id) do nothing;

-- 5. Sécurité : tables fermées au public (aucune politique = personne, sauf la clé service_role côté serveur).
alter table public.cache_entries    enable row level security;
alter table public.series_overrides enable row level security;
alter table public.cover_overrides  enable row level security;
