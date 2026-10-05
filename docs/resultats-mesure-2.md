# Mesure 2 — santé des services (test A) et couvertures (test B), 2026-10-05

Scripts : `archive/prototype-mesures/tests/services.mjs`, `archive/prototype-mesures/tests/couvertures.mjs`. Plan : `docs/plan-de-tests.md`.

## Test A — services : 8/10 OK

| Service | Résultat |
|---|---|
| BnF | 5/5, médiane 81 ms. Filtre « texte imprimé » confirmé (588 vs 930 notices pour « asterix »). Piège ISBN-10 confirmé. |
| Open Library | 5/5, médiane 202 ms. `readinglog_count` seulement si demandé (confirmé). Couverture absente → 404 avec `default=false` (confirmé). |
| Wikidata | Recherche et SPARQL 5/5 et 3/3, médiane 224 ms. |
| **Google Books sans clé** | **0/5 : 429 sur tous les appels.** Inutilisable sans clé depuis cette machine. |

## Test B — couvertures (Open Library seul, Google non mesuré)

| Saga | ISBN testés | Open Library trouve | Aucune source |
|---|---|---|---|
| Trône de fer | 57 | 61 % | 39 % |
| Seigneur des anneaux | 15 | 40 % | 60 % |
| Chevaliers d'Émeraude | 22 | 50 % | 50 % |

- Largeur médiane des images trouvées : ~300-320 px. Qualité correcte pour une grille mobile.
- **Les manques se concentrent sur les éditions françaises récentes ou poche** (Émeraude collector, « Les Deux tours » poche,
  intégrales). Les éditions anglaises sont presque toutes couvertes.
- Association : une couverture Open Library par ISBN est liée à *cette édition* ; elle ne peut pas être « héritée »
  d'un autre tome tant qu'on ne passe pas par l'œuvre. Reste à confirmer à l'œil sur la planche-contact.

## Conclusions

1. **Open Library seul ne suffit pas pour les couvertures françaises** : au mieux 40-60 % sur nos sagas.
2. Il faut au moins une deuxième source (Google Books **avec clé**, ou d'autres : Bibliothèque nationale « Gallica »,
   éditeurs, Babelio, Amazon-Images à éviter pour les conditions d'usage). Google est le candidat naturel : Vault Read mesurait 65 % de couvertures.
3. **Stratégie à tester ensuite** : cascade par ISBN (Open Library → Google → autres), et pour un ISBN sans couverture, repli sur
   la couverture d'une autre édition *du même tome* (pas de la même œuvre !), ou sur une couverture dessinée.

## Google Books avec clé (relance du 2026-10-05) — résultat : inexploitable aujourd'hui

La clé est valide (39 caractères, statut 200), mais sur les 94 ISBN testés, **Google n'a rendu aucun volume** (`totalItems: 0`).
Diagnostic à la main sur quelques requêtes :

| Requête | Résultat |
|---|---|
| `q=isbn:…` (avec ou sans `country=FR`) | 0 résultat, y compris pour un ISBN français et un ISBN anglais courants |
| `q=intitle:germinal` | 0 résultat (c'est pourtant la requête que Vault Read utilise) |
| `q=germinal&country=FR` | 341 résultats, le roman en premier |
| `q=<isbn nu>&country=FR` | Résultats **faux** (« Livres hebdo », « Encountering Enchantment ») |
| Plusieurs appels | 503 intermittents |

Hypothèses (non vérifiées) : dégradation passagère de Google aujourd'hui, ou comportement lié au nouveau projet/clé.
À **refaire un autre jour** avant de conclure. Vault Read, lui, mesurait déjà 503 en rafales et des résultats variables.

## Endpoint de couverture par ISBN de Google (`books.google.com/books/content?vid=ISBN:…`, non documenté)

Testé sur 7 ISBN : pas de clé ni de quota, mais il rend une **image de remplacement** (même fichier de 9 103 octets, 575×750)
pour presque tous les ISBN français testés. Seule la VO du Trône de fer (9780553103540) a une vraie couverture.
Détectable par taille/empreinte, donc sans risque de fausse couverture, mais **sans gain sur le français**. Endpoint non officiel : risque de conditions d'usage.

## Conclusion de la mesure 2

- Sur nos sagas françaises, **aucune source de couverture gratuite testée ne dépasse ~60 %** (Open Library : 40-61 % ; Google : non mesurable aujourd'hui, et son endpoint ISBN ne couvre pas le français).
- Les couvertures manquantes se concentrent sur les **éditions poche, collector et récentes**.
- Ce n'est donc pas un problème de « bon service », mais de **donnée disponible** : il faudra une stratégie de repli (voir ci-dessous).

## Test B2 — autres sources de couvertures (`couvertures-autres.mjs`, 94 ISBN)

| Saga | Open Library | Amazon (ancienne URL par ISBN-10) | OL + Amazon |
|---|---|---|---|
| Trône de fer (57) | 61 % | 65 % | 70 % |
| Seigneur des anneaux (15) | 40 % | 80 % | 87 % |
| Chevaliers d'Émeraude (22) | 50 % | 68 % | 68 % |

- **Amazon est la source qui couvre le mieux le français**, y compris des poches que Open Library n'a pas. Mais c'est une URL **non officielle**,
  images protégées, conditions d'usage défavorables : **mesure uniquement, à ne pas utiliser en production** sans avis juridique.
  Elle ne marche que pour les ISBN en 978 (ISBN-10 existant) : les 979 (récents) en sont exclus.
- Une image générique (même empreinte ≥ 3 fois) a été détectée 24 fois et exclue des résultats.
- **Service de couvertures de la BnF : mesure INVALIDE.** Sur ce test, la BnF a *coupé les connexions* (ECONNRESET) après environ 400 requêtes en
  quelques minutes, et mon premier script a pris ces coupures pour des « notices absentes ». Corrigé dans le script (il distingue maintenant
  « absent » de « injoignable »), mais la BnF restait injoignable plusieurs minutes après. **Enseignement pour l'API : la BnF limite le débit
  d'un client rapide ; les imports devront être lents (≈ 1 requête/s) et reprenables.** À refaire plus tard.

## Pistes à tester ensuite

1. **Autres sources de couvertures** : Gallica/BnF (couvertures numérisées de certains livres), sites d'éditeurs/distributeurs avec ISBN, Wikimedia Commons (couvertures libres), Hardcover.
2. **Repli par tome** : si une édition n'a pas de couverture, prendre celle d'une autre édition *du même tome* (même ISBN-groupe/œuvre), jamais celle d'un autre tome.
3. **Couverture dessinée** (comme Vault Read, `CouvertureDessinee.jsx`) quand rien n'existe, et possibilité de **contribution manuelle** : vous envoyez la bonne couverture pour une saga, elle est stockée dans Supabase Storage.
4. Refaire le test Google un autre jour.
5. Contrôle visuel de `sorties/ ou archive/prototype-mesures/out/couvertures.html` (non versionné).
