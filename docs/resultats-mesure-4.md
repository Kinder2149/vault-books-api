# Mesure 4 — qualité du service (phase 2, 2026-10-05)

Outils : `npm run pertinence -- fr|en|auteur`, `scripts/mesure-couvertures.mjs`, `scripts/mesure-resumes.mjs`. Toutes les mesures sont faites **contre les vraies sources**, avec un cache en mémoire (donc le code d'aujourd'hui, pas des réponses déjà en cache).
**Réserve importante** : les attentes des jeux de test sont écrites par Claude d'après sa connaissance des livres, et une partie des réussites vient de **corrections de données ajoutées à la main** pendant la mesure (voir ci-dessous). Le vrai juge sera le jeu de recherches réelles de Kinder (`requetes-kinder.json`, à fournir).

## 1. Pertinence de la recherche par titre

| Jeu | Avant | Après le code | Après les données |
|---|---|---|---|
| **Français** (80 requêtes : classiques, sagas, BD/manga, polar, essais, « auteur + titre », fautes de frappe, sans accents) | 74/80 (93 %) | 77/80 (96 %) | **80/80 (100 %)** |
| **Anglais** (35 requêtes) | — | — | **35/35 (100 %)** |

**Ce que les échecs ont montré**, et ce qui les a réglés :

| Cause | Exemple | Réglée par |
|---|---|---|
| L'article de tête gêne le moteur de Hardcover | « le da vinci code » → aucun résultat ; « da vinci code » → Dan Brown | **Code** : retenter sans article quand la tête de liste est faible |
| Requête « auteur + titre » | « tolkien hobbit » → guides sur le Hobbit | **Code** : reconnaître l'auteur (recherche d'auteurs de Hardcover), chercher le reste, favoriser l'auteur |
| Titre français absent de l'index de Hardcover | « journal d'un dégonflé », « millénium », « et il n'en resta plus aucun » | **Données** : alias de recherche (`npm run corriger -- alias`) — 4 alias au départ, 6 de plus pour les sagas |
| Nom de saga français inconnu | « les schtroumpfs » rend un livre avant la saga « The Smurfs » | **Code** (une carte série est aussi notée sur son nom affiché) + **données** (nom français de la saga) |

Honnêteté : sans les **4 alias et 1 nom de saga ajoutés à la main**, le résultat est 77/80. Les alias sont de la donnée curée qui se maintient avec l'outil ; ils ne sont pas une « triche » (ils servent aussi en production), mais ils ne prouvent pas que le tri généralise : seuls les alias connus sont corrigés.

Coût : une requête faible déclenche jusqu'à 1 + 4 + 1 appels Hardcover de plus (article, recherche d'auteur, reste de la requête) ; elles sont désactivées quand le quota est bas.

## 2. Recherche par auteur (`/v1/search?mode=auteur`)

18 requêtes (noms complets, noms seuls, une faute de frappe) : **17/18 (94 %)**. Le dernier échec : l'attente « fondation » alors que la saga s'appelle « Foundation » chez Hardcover (nom français à valider, voir `docs/noms-sagas-a-valider.md`).
Défauts trouvés et corrigés : « dumas » retenait un homonyme à 2 livres (on prend maintenant l'auteur le plus fourni) ; les livres de Zola n'étaient pas regroupés en saga (on retient la série la plus fournie quand aucune n'est « mise en avant »).

## 3. Couvertures à grande échelle (198 tomes, 20 sagas)

| | Avant | Après |
|---|---|---|
| Couvertures réelles et valides (téléchargées, ≥ 200 px) | 176/198 (89 %) | **184/198 (93 %)** |
| Images partagées entre deux tomes (mauvaise association) | **0** | **0** |
| Sources | Hardcover 164 · miniature 17 · livre 11 · Open Library 5 | Hardcover 164 · **édition voisine 11** · miniature 9 · livre 8 · Open Library 5 |

Cause des manques : **miniatures de 98 px** chez Hardcover. Correction : pour les sagas, l'image d'une **autre édition française du même tome** (≥ 200 px) passe avant la miniature (un champ de requête de plus, uniquement pour `/series`).
Il reste 14 tomes sans couverture réelle, surtout *Journal d'un dégonflé* (10/16) : liste dans `data/couvertures-trous.json`, à corriger avec `npm run corriger -- couverture serie:<id>:<position> <url>` quand cela compte.

## 4. Résumés

Sur 70 livres du jeu français : **74 % ont un résumé** (> 80 caractères) mais **10 % seulement en français** (64 % en anglais).
Décision : le résumé est rendu par `/v1/isbn` et `/v1/books`, **avec sa langue** (`resumeLangue: fr|en|null`), nettoyé du HTML et coupé à 1 500 caractères. Vault Read accepte déjà un résumé anglais plutôt qu'un vide (« on ne traduit pas »).

## 5. Noms français de sagas

84 sagas courantes examinées : 38 à renommer au départ (43 après ajout d'alias), 39 déjà bonnes. Liste à valider : `docs/noms-sagas-a-valider.md` ; import après validation : `npm run importer-noms -- --appliquer [--sauf id,id] [--nom id="Nom"]`.

## 6. Ce qui reste à faire pour clore la phase 2

- Jeu de **recherches réelles de Kinder** (30) → `requetes-kinder.json`, puis `npm run pertinence -- kinder`.
- **Validation** des noms de sagas.
- Contrôle périodique des URLs de couvertures corrigées à la main (tâche hebdomadaire).
