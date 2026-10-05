# Comment l'API fonctionne, se gère et s'utilise

> Proposition au 2026-10-05, issue des mesures 1 à 3. Les choix marqués **[à valider]** attendent l'accord de Kinder.
> Principe directeur : **une API fine devant Hardcover**, avec cache Supabase, notre tri, des corrections manuelles,
> et des sources interchangeables. Pas de copie complète du catalogue.

## 1. Vue d'ensemble

```
 Vault Read (app)
      │  1 seul appel HTTPS, clé d'application
      ▼
 ┌──────────────────────────── API (Vercel, JS) ───────────────────────────┐
 │  /v1/search   /v1/series/:id   /v1/books/:id   /v1/isbn/:isbn   /health │
 │   1. lit le cache (Supabase)        4. applique NOTRE tri + corrections │
 │   2. sinon appelle les sources      5. enregistre dans le cache         │
 │   3. normalise vers NOTRE format    6. répond                           │
 └───────┬───────────────────┬───────────────────┬─────────────────────────┘
         ▼                   ▼                   ▼
   Hardcover (principal)   BnF (éditions FR)   Open Library / Wikidata (couvertures, contrôle)
         
 Supabase : cache + corrections + journaux          GitHub Actions : tâches planifiées (lentes)
```

Chaque source a **un seul adaptateur** (`sources/hardcover.js`, `sources/bnf.js`…), comme dans Vault Read (règle « un seul `fetch` par source »).
Remplacer une source = remplacer un fichier.

## 2. Ce que l'app reçoit (le contrat)

| Appel | Rôle |
|---|---|
| `GET /v1/search?q=…&lang=fr\|en&limit=20` | Cartes de résultats : **une carte par œuvre ou par saga**, déjà triées. Chaque carte : titre, auteurs, couverture, langue, et si saga : nom + nombre de tomes. |
| `GET /v1/series/:id` | La saga **dans l'ordre** : tomes avec numéro, titre, couverture, nombre d'éditions. |
| `GET /v1/books/:id` | Une œuvre et **toutes ses éditions** (éditeur, année, ISBN, couverture) pour choisir celle qu'on possède. |
| `GET /v1/isbn/:isbn` | Pour le scan : l'édition + son œuvre. |
| `GET /health` | État des sources, âge du cache (pour la supervision). |

Réponses en JSON, versionnées (`/v1`) : on peut changer l'intérieur sans casser l'app.
`lang` filtre la **langue de l'édition** ; sans `lang`, on utilise la langue de l'app.

## 3. Le trajet d'une recherche (cache en lecture-écriture)

1. L'app envoie `search?q=le seigneur des anneaux&lang=fr`.
2. L'API normalise la requête (minuscules, sans accents ni article) et cherche dans `search_cache`.
3. **Cache frais** (< 7 jours) → réponse immédiate (quelques dizaines de ms). Pas d'appel externe.
4. **Cache périmé** → on répond tout de suite avec l'ancien résultat et on **rafraîchit en arrière-plan** (`stale-while-revalidate`).
5. **Rien en cache** → appel à Hardcover (≈ 200 ms), tri maison, enregistrement, réponse. Si Hardcover répond mal : repli BnF, sinon message clair.
6. Le tri maison reprend la logique de Vault Read : regroupement par œuvre/saga, coffrets et intégrales à part, filtre hors-sujet par auteur,
   classement par titre exact + popularité (lecteurs Hardcover).

Effet : les recherches déjà faites par n'importe quel utilisateur sont gratuites pour les suivants. Les **5 000 appels/jour** de Hardcover
(60/minute) ne se consomment que sur les nouveautés de recherche.

## 4. Les données dans Supabase

| Table | Contenu |
|---|---|
| `works`, `editions`, `authors` | Ce qu'on a rencontré, au format maison (ISBN, éditeur, année, langue, couverture, source). |
| `series`, `series_books` | Sagas et position de chaque tome (positions décimales rangées à part : préquelles, hors-série). |
| `search_cache` | Requête normalisée + langue → liste d'identifiants + date. |
| `overrides` | **Nos corrections** : tome manquant, mauvais rattachement, bonne couverture d'une édition. Elles **gagnent toujours** sur les sources. |
| `cover_checks` | Résultat de la vérification de chaque couverture (existe, taille, générique ?). |
| `request_log` | Une ligne par appel : durée, source utilisée, erreur. Sert à la supervision. |

Taille attendue : quelques dizaines de Mo au début (le cache grossit avec les recherches réelles), très loin des 500 Mo gratuits.

## 5. Couvertures

Cascade **par ISBN**, jamais par œuvre : Hardcover → Open Library → (BnF) → couverture dessinée.
Chaque couverture est **vérifiée** une fois (image réelle, ≥ 200 px, pas une image générique) puis mémorisée dans `cover_checks`.
Une couverture ne peut pas être « héritée » d'un autre tome. Pour un tome sans couverture, vous la fournissez une fois (`overrides`).
On enregistre l'URL, pas l'image (limite les questions de droits). **[à valider : copier les couvertures validées dans Supabase Storage ?]**

## 6. Mises à jour : quand un livre apparaît

| Mécanisme | Fréquence | Rôle |
|---|---|---|
| **À la demande** | À chaque recherche absente du cache | Un livre cherché par quelqu'un entre dans la base. |
| **Durée de vie du cache** | Recherches : 7 jours. Sagas en cours : 24 h. Sagas terminées : 30 jours. | Les tomes récents apparaissent sans action. |
| **Tâche nocturne** (GitHub Actions) | Chaque nuit | Rafraîchit les sagas **en cours** les plus consultées, repère un nouveau tome, garde Supabase actif. |
| **Tâche hebdomadaire BnF** | 1 fois/semaine, **≈ 1 requête/s** | Complète les éditions françaises des œuvres en cache. La BnF coupe les clients trop rapides (observé). |
| **Contrôle des couvertures** | Hebdomadaire | Re-vérifie les couvertures en échec ou anciennes. |

Un livre qui sort demain apparaît **quand Hardcover (ou la BnF) le connaît**, et au plus tard au prochain rafraîchissement de sa saga
(≤ 24 h pour une saga en cours). Aucune source gratuite ne garantit la veille de la sortie : on l'annonce, on ne le promet pas.

## 7. Où ça tourne, et ce que ça coûte **[à valider]**

| Rôle | Choix proposé | Pourquoi |
|---|---|---|
| API (requêtes de l'app) | **Vercel** (fonctions Node, JS) | Pas de mise en veille de 30-60 s comme Render gratuit ; déploiement par git comme vos autres projets ; réutilise le JS de Vault Read. |
| Base, cache, stockage | **Supabase** | Déjà décidé : Postgres, recherche, corrections modifiables en quelques clics. |
| Tâches planifiées | **GitHub Actions** (cron) | Gratuit, longues durées permises (utile pour la BnF lente), secrets chiffrés, vous le connaissez. |
| Clés (Hardcover, Google) | Variables d'environnement Vercel/GitHub | Jamais dans l'app ni dans git. |

Alternative : tout dans Supabase (Edge Functions + `pg_cron`), un seul fournisseur, mais TypeScript/Deno et Docker pour le développement local.
Coût : **0 €** tant qu'on reste dans les offres gratuites. À noter : l'offre gratuite de Vercel est prévue pour un usage non commercial ;
si Vault Read devient commercial, il faudra un plan payant, comme pour Hardcover.

## 8. Gérer au quotidien

- **Corriger une saga ou une couverture** : table `overrides` via le tableau de bord Supabase (aucun code). Plus tard : petite page d'admin protégée.
- **Voir si ça va** : `/health` + vue SQL sur `request_log` (taux d'erreur, latence médiane, part servie par le cache, appels Hardcover du jour).
- **Alertes** : une tâche GitHub qui échoue vous envoie un e-mail ; un test quotidien « nos 15 requêtes de référence » compare le résultat à l'attendu.
- **Quotas** : on lit les en-têtes `RateLimit` de Hardcover ; à 80 % du quota du jour, on sert uniquement le cache.
- **Sécurité** : clé d'application dans l'app (elle ne peut pas être secrète dans un APK : on ne l'utilise que pour limiter l'abus),
  limite de requêtes par IP, jamais d'accès direct à Hardcover depuis l'app.
- **Conformité** : mention « Données Hardcover », procédure de retrait (DMCA) pour les images, aucune donnée d'utilisateur Hardcover utilisée.

## 9. Brancher Vault Read, sans casser l'app

Vault Read a déjà la bonne architecture : `composants → api.js → store.js → db.js` et `books.js` seul à connaître les sources.
On ajoute **une source de plus** : `sources/vaultapi.js` (un seul `fetch`), et `books.js` l'interroge **en premier**.

- **Aucun composant ne change** (la façade `api.js` garde ses signatures).
- **Les anciennes sources restent en repli** : si notre API est injoignable, l'app fonctionne comme aujourd'hui.
- Un interrupteur (réglage ou variable) permet d'activer/désactiver la nouvelle voie pendant les tests.
- La logique de tri (`tomes.js`, fusion, filtre) est retirée **progressivement** une fois l'API éprouvée : un test à la fois.
- L'archive locale de recherches de l'app reste en place (consultation hors ligne).

## 10. Feuille de route, avec le critère de passage de chaque étape

| Étape | Contenu | On passe à la suivante quand… |
|---|---|---|
| 1. Squelette | Schéma Supabase, `/search` et `/series/:id` sur Hardcover avec cache, tri de base | Le **test C** passe sur nos 13+ requêtes (saga en une carte, bon ordre) |
| 2. Français et couvertures | BnF lent, cascade de couvertures, `overrides`, filtre de langue | Les 3 sagas test sont **complètes, dans l'ordre, avec les bonnes couvertures** (contrôle visuel de Kinder) |
| 3. Branchement | `vaultapi.js` dans Vault Read, interrupteur, repli | Kinder utilise l'app sur téléphone une semaine sans régression |
| 4. Exploitation | Tâches nocturnes, supervision, alertes, page « À propos / sources » | Test D (fraîcheur) mesuré sur 2 semaines ; tout est vert |

## 11. Risques connus

- **Hardcover** : bêta, usage personnel, stockage non précisé → question à poser ; adaptateur remplaçable.
- **Séries françaises incomplètes** chez Hardcover → corrections manuelles ; Wikidata en contrôle.
- **Couvertures plafonnées à ~70 %** sans intervention → couverture dessinée + saisie manuelle.
- **BnF** : coupe les connexions rapides → tâches lentes, reprenables.
- **Google Books** : instable (0 résultat constaté) → pas une dépendance ; éventuellement un repli à retester.
