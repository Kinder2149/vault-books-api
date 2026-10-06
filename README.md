# Vault Books API

Service de catalogue de livres pour **Vault Read** : recherche triée (une carte par œuvre ou par saga), sagas dans l'ordre,
éditions et couvertures dans la langue choisie (fr/en), scan d'ISBN. Source principale : Hardcover ; éditions françaises : BnF ;
couvertures de repli : Open Library ; cache et corrections : Supabase ; hébergement : Vercel.

**En ligne** : https://vault-books-api.vercel.app/v1/health

## Documentation

| Pour… | Lire |
|---|---|
| Comprendre le projet et ses décisions | [PROJET_CONTEXTE.md](PROJET_CONTEXTE.md) |
| Savoir comment ça marche (état réel) | [docs/architecture-fonctionnement.md](docs/architecture-fonctionnement.md) |
| Surveiller, réparer, corriger, gérer les secrets | [docs/exploitation.md](docs/exploitation.md) |
| Savoir ce qu'il reste à faire | [docs/plan-complet.md](docs/plan-complet.md) |
| Créer les services (Supabase, GitHub, Vercel) | [docs/mise-en-service.md](docs/mise-en-service.md) |
| Hardcover, licences, vie privée | [docs/conformite.md](docs/conformite.md) |

## Démarrer en local

```bash
cp .env.example .env          # puis renseigner HARDCOVER_API_KEY (permission read:catalog)
npm run dev                   # http://localhost:3000/v1/health
npm test                      # tests unitaires, sans réseau ni secret
```

Sans `SUPABASE_URL` et `SUPABASE_SERVICE_KEY`, le cache est en mémoire (perdu à l'arrêt) et il n'y a pas de journal.

| Commande | Rôle |
|---|---|
| `npm test` | Tests unitaires (aucun appel réel) |
| `npm run test:c` | Pertinence et sagas, contre les vraies sources |
| `npm run planche` | Contrôle des couvertures et des éditions, planche-contact dans `sorties/` |
| `npm run smoke -- <url>` | Contrôle d'un service en ligne ou local (14 vérifications) |
| `npm run verifier:supabase` | Supabase est-il bien configuré ? |
| `npm run corriger -- …` | Corriger une saga ou une couverture (voir `docs/exploitation.md` §6) |
| `npm run sauvegarder` | Recopier les corrections de Supabase dans `data/overrides.json` |

## Routes

| Route | Rôle |
|---|---|
| `GET /v1/search?q=…&lang=fr\|en\|both` | Cartes triées : `serie` (saga) ou `livre` |
| `GET /v1/series/:id?lang=fr\|en\|both` | La saga : tomes dans l'ordre, volumes coupés en `parties`, édition et couverture par tome, `statut` par tome (`disponible` / `indisponible_langue` / `a_paraitre`), nom de saga dans les deux langues. `both` rend les deux langues d'un coup |
| `GET /v1/books/:id?lang=fr\|en\|both` | Les éditions d'un livre (Hardcover + BnF) : ISBN, éditeur, année, couverture et sa source |
| `GET /v1/isbn/:isbn` | L'édition d'un code-barres : éditeur, date, pages, langue, couverture, livre, saga |
| `GET /v1/status` | État détaillé : sources, quota du jour, statistiques des 24 dernières heures |
| `GET /v1/health` | Vivant ? (sans clé) |

Toutes (sauf `health`) exigent l'en-tête `x-app-key`.

## Arborescence

```
api/        points d'entrée Vercel (un fichier par route) + la tâche d'entretien
src/        la logique : sources/ (Hardcover, BnF), rank, series, editions, covers, overrides, corrections, cache, journal, limite, service
scripts/    contrôles et outils (smoke, test-c, planche, corriger, sauvegarder, serveur local)
supabase/   migrations SQL (0001 cache et corrections, 0002 journal)
test/       tests unitaires et jeux de pertinence (fixtures-pertinence/)
data/       overrides.json : sauvegarde et repli des corrections
docs/       documentation ; archive/ : scripts de mesure jetables
.github/    tests à chaque push ; sauvegarde nocturne des corrections
```
