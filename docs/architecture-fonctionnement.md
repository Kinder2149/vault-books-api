# Comment le service fonctionne (état réel, 2026-10-05)

> Ce document décrit **ce qui existe et tourne**, vérifié contre le code. Ce qui reste à faire est dans `docs/plan-complet.md`.
> Mesures ayant conduit à ces choix : `docs/resultats-mesure-1.md` à `-3.md`. Exploitation au quotidien : `docs/exploitation.md`.

## 1. Vue d'ensemble

```
 Vault Read (app Android)
      │  HTTPS, en-tête x-app-key (pas un secret : elle est dans l'APK)
      ▼
 ┌─────────────────────── Vercel (fonctions Node, région Paris) ───────────────────────┐
 │  /v1/search  /v1/series/:id  /v1/books/:id  /v1/isbn/:isbn  /v1/status  /v1/health │
 │     │ clé d'application ─► limite par client (90/min) ─► service.js                 │
 │     │                                      │ 1 cache Supabase (frais ? on répond)   │
 │     │                                      │ 2 sinon sources ─► tri ─► cache        │
 │     │                                      │ 3 source en panne ─► cache périmé      │
 │     └── journal (après l'envoi de la réponse)                                       │
 └───────────────┬───────────────────────┬────────────────────────┬────────────────────┘
                 ▼                       ▼                        ▼
         Hardcover (principale)     BnF (éditions FR)      Open Library (couvertures)
         
 Supabase : cache_entries · series_overrides · cover_overrides · request_log
 Tâches : Vercel Cron 03:17 (/api/entretien) · GitHub Actions 04:30 (sauvegarde des corrections) · tests à chaque push
```

Chaque source a **un seul adaptateur** (`src/sources/*.js`) ; remplacer une source = remplacer un fichier.

## 2. Les routes

| Route | Rend | Cache |
|---|---|---|
| `GET /v1/search?q=&lang=fr\|en\|both` | Cartes triées : une par œuvre (`livre`) ou par saga (`serie`). Un livre isolé porte ISBN, éditeur, date. | 7 jours |
| `GET /v1/series/:id?lang=fr\|en\|both` | La saga : tomes dans l'ordre (volumes coupés en `parties`), édition (ISBN, éditeur) et couverture par tome, `statut`, `langueTitre`, `noms` {fr, en}, `typeSaga`, compteurs `disponibles`/`indisponibles`/`aParaitre`. Calculée UNE fois pour les deux langues (clé de cache `serie:v6:both:<id>`) | 1 jour |
| `GET /v1/books/:id?lang=fr\|en\|both` | Toutes les éditions d'un livre (Hardcover + BnF), une par ISBN, couverture par édition | 7 jours (1 h si la BnF n'a pas répondu) |
| `GET /v1/isbn/:isbn` | L'édition d'un code-barres : éditeur, date, **pages**, langue, couverture, livre, saga. ISBN-10 accepté. **Aucun filtre de langue.** 404 si inconnu | 30 jours (1 j si absent, 5 min si incertain) |
| `GET /v1/status` | État détaillé (Supabase, Hardcover, quota du jour, statistiques 24 h) ; `?profond=1` teste la BnF | aucun |
| `GET /v1/health` | « Vivant ? » sans clé, sans appel de source | aucun |
| `GET /api/entretien` | Tâche nocturne (protégée par `CRON_SECRET`) | — |

Toutes sont en `GET`, protégées par la clé d'application (sauf `/v1/health`), renvoient du JSON, et sont `Cache-Control: private` (voir §6).

## 3. Le trajet d'une requête

1. **Clé d'application**, puis **limite par client** (90 appels/minute/IP, en mémoire, jamais écrite).
2. Le service normalise la requête (minuscules, sans accents, sans article) et lit **le cache Supabase** (clé `type:vN:langue:…`).
3. Cache **frais** → réponse (≈ 30 ms). Cache périmé ou absent → on appelle les sources, on trie, on enregistre.
4. **Source en panne** et cache périmé disponible → on rend le périmé (`cache: "perime"`). Rien en cache → 502.
5. **Mode économie** : sous 1 000 requêtes Hardcover restantes (sur 5 000/jour, lues dans les en-têtes `RateLimit`), le cache — même périmé — est seul servi ; sans cache : 503 propre. L'application retombe alors sur ses anciennes sources.
6. La réponse part, **puis** une ligne est écrite au journal.

## 4. Le tri (ce qui rend la recherche pertinente)

- **Regroupement** (`src/rank.js`) : une saga devient UNE carte, quel que soit le nombre de tomes ou d'éditions trouvés. Un roman cherché par son titre au milieu d'un grand cycle reste un livre (« germinal »). Coffrets et compilations ne sont jamais « le » livre.
- **Note** = correspondance du titre (exact > début > contient > mots) + popularité (nombre de lecteurs Hardcover, échelle logarithmique) + bonus de langue ; titres alternatifs pris en compte.
- **Bruit écarté** quand une réponse franche existe : scores négatifs, titres de plus de 20 mots, séries « techniques » (traductions découpées, ordre de parution, coffrets) et homonymes quasi inconnus d'un autre auteur derrière une œuvre très lue.
- **Langue** : seules les œuvres qui ont une édition dans la langue demandée restent ; sinon tout est rendu, avec `langueNonDisponible: true`.

## 5. Sagas et couvertures

- **Sagas** (`src/series.js`) : par position, on garde le livre qui a une édition dans la langue, puis le plus lu. Les positions décimales (1.1, 1.2…) sont des **volumes coupés** rangés en `parties` sous leur tome ; un tome existant seulement en volumes coupés reste disponible (`viaParties`) ; un tome sans édition dans la langue reste listé avec un `statut` : `indisponible_langue` (l'œuvre est parue, mais pas dans cette langue) ou `a_paraitre` (date future, ou ni date ni édition dans aucune langue) ; son titre est alors celui de l'AUTRE langue, ou le titre d'origine de Hardcover (`canonical`), avec `langueTitre` pour le dire. `lang=both` rend `{ langues: { fr, en } }` (recherche, auteur, livre) ou, pour une saga, des tomes portant `langues: { fr, en }` ; les positions entières sans édition dans une langue sont élargies à tous les livres de la position (Narnia : « Prince Caspian » à la place du volume double).
- **Couvertures, toujours PAR ISBN** (`src/covers.js`) : correction manuelle > image de l'édition chez Hardcover (≥ 200 px) > Open Library par ISBN (vérifiée par `HEAD`, mise en cache 30 j / 3 j) > miniature > image du livre canonique (marquée `approximative`). Chaque couverture indique sa `source`.
- **Corrections manuelles** (`src/overrides.js`, tables `series_overrides` et `cover_overrides`) : nom français/anglais d'une saga, séries doublons à fusionner, positions à exclure, couverture d'une édition ou d'un tome. Elles **gagnent toujours** sur Hardcover. Outil : `npm run corriger`. Copie de secours : `data/overrides.json`, réécrit chaque nuit.

## 6. Décisions techniques à connaître

| Décision | Raison |
|---|---|
| Cache **clé/valeur** dans Supabase (pas de tables `works`/`editions`) | Hardcover fournit déjà œuvres et éditions ; on ne copie pas le catalogue, on garde ce qui a été demandé |
| Rafraîchissement **synchrone** (pas de « sert l'ancien pendant qu'on renouvelle ») | Simplicité ; le périmé n'est servi que si la source est en panne ou le quota bas |
| **Pas de cache de bord (CDN)** : réponses `private`, `Vary: x-app-key` | Constaté le 2026-10-05 : une réponse déjà servie à l'app devenait lisible sans clé |
| Version de cache dans les clés (`VERSION_CACHE`) | Un changement de tri ou de format invalide tout d'un coup ; l'entretien purge les anciennes versions |
| Limiteur de débit Hardcover (seau à jetons 8 + 0,9/s) | Plusieurs sagas dépliées d'un coup saturaient la rafale de 10 (mesuré) |
| BnF **en file, ≥ 1,1 s entre deux requêtes, bornée à 5 s** | La BnF coupe les connexions d'un client rapide (mesuré) |
| Clé d'application **non secrète** | Un APK ne garde rien de secret ; elle limite seulement l'abus (plus la limite par client) |
| Journal **sans texte de recherche ni IP**, 30 jours | Promesse de vie privée faite aux utilisateurs |

## 7. Ce qui n'existe PAS (voir `docs/plan-complet.md`)

Recherche par auteur · résumés · rafraîchissement automatique des sagas en cours · éditions BnF préchargées · test de fraîcheur et de capacité · noms français des sagas hors vos 3 de référence · réponse de Hardcover sur le cache et l'usage public · attribution, procédure de retrait d'images et politique de confidentialité côté application.
