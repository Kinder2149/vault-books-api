# Vault Books API

API de catalogue de livres pour Vault Read : recherche triée (une carte par œuvre ou par saga), sagas dans l'ordre,
éditions et couvertures dans la langue choisie (fr/en). Source principale : Hardcover ; cache : Supabase.

Mise en service (Supabase, GitHub, Vercel) : [docs/mise-en-service.md](docs/mise-en-service.md) · Cadrage et décisions : [PROJET_CONTEXTE.md](PROJET_CONTEXTE.md) · fonctionnement : [docs/architecture-fonctionnement.md](docs/architecture-fonctionnement.md) · mesures : `docs/resultats-mesure-*.md`.

## Démarrer en local

```bash
cp .env.example .env      # puis renseigner HARDCOVER_API_KEY (permission read:catalog)
npm run dev               # http://localhost:3000/v1/health
npm test                  # tests unitaires, sans réseau
npm run test:c            # test de pertinence et de sagas, contre le vrai Hardcover
npm run planche           # contrôle des couvertures et des éditions + planche-contact à regarder
npm run verifier:supabase  # Supabase est-il bien configuré ?
npm run smoke -- <url>    # test de fumée d'une API déployée
```

Sans `SUPABASE_URL` et `SUPABASE_SERVICE_KEY`, le cache est en mémoire (perdu à l'arrêt).

## Routes

| Route | Rôle |
|---|---|
| `GET /v1/search?q=…&lang=fr\|en` | Cartes triées : `serie` (saga) ou `livre`. |
| `GET /v1/books/:id?lang=fr\|en` | Les éditions d'un livre (Hardcover + BnF) : ISBN, éditeur, année, couverture vérifiée et sa source. |
| `GET /v1/series/:id?lang=fr\|en` | La saga : tomes dans l'ordre, volumes coupés en `parties`, édition (ISBN, éditeur) et couverture par tome. |
| `GET /v1/health` | Vivant ? Cache et clé configurés ? |

## Corrections manuelles

`data/overrides.json` (développement) ; table `series_overrides` (production, voir `supabase/migrations/`) :
nom français d'une saga, séries doublons à fusionner, positions à exclure. Elles gagnent toujours sur Hardcover.

## Écarts avec le document d'architecture (étape 1)

- Le rafraîchissement du cache est **synchrone** (le périmé n'est servi qu'en cas de panne de la source) ; le « sert l'ancien pendant qu'on renouvelle »
  est assuré par le cache de bord de Vercel (`stale-while-revalidate`).
- Le cache est un **clé/valeur** (`cache_entries`) ; les tables `works` / `editions` n'arrivent qu'avec l'étape 2, si elles s'avèrent utiles.
- Les corrections sont lues depuis **Supabase** quand il est configuré (mémorisées 5 min), sinon depuis le fichier.

