-- Alias de recherche : pour un titre français ABSENT de l'index de Hardcover, ce qu'il faut réellement lui demander.
-- Exemple : « journal d'un dégonflé » (introuvable) → « diary of a wimpy kid » (le livre de Jeff Kinney, dont les éditions françaises sont rattachées).
-- À exécuter UNE fois dans Supabase (SQL Editor) ; relançable sans danger. Gérer avec : npm run corriger -- alias "<requête>" "<cible>".

create table if not exists public.search_aliases (
  query_norm text primary key,     -- la requête NORMALISÉE (minuscules, sans accents ni ponctuation)
  target     text not null,        -- ce qu'on cherche vraiment chez Hardcover
  note       text,
  updated_at timestamptz not null default now()
);
alter table public.search_aliases enable row level security;   -- fermé au public
