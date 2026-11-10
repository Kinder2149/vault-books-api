# Plan de tests — cadrer la mission, le besoin et les services

> Objectif : transformer chaque phrase du besoin en un test qui passe ou échoue, **avant** d'écrire l'API.
> Les tests A et B s'exécutent déjà (`archive/prototype-mesures/tests/`). C, D, E sont spécifiés ici et
> s'exécuteront contre l'API quand elle existera ; leurs jeux de cas sont dans `test/fixtures-pertinence/`.
> Les seuils sont des **propositions** à valider par Kinder.

## Besoin → critère mesurable

| # | Besoin exprimé | Critère de réussite (proposé) | Test |
|---|---|---|---|
| 1 | « Les services gratuits sont fiables » | Chaque source répond ≥ 95 % du temps, médiane < 2 s, format stable | **A** |
| 2 | « Les bonnes couvertures » | ≥ 90 % des éditions ont une couverture ; 0 couverture qui appartient à un autre livre | **B** |
| 3 | « La saga complète, dans l'ordre, sans mélanger les éditeurs » | Pour chaque saga de référence : 100 % des tomes présents, ordre exact, 1 carte par tome | **C** |
| 4 | « Une recherche pertinente par titre » | Le bon livre/la bonne saga dans le top 3 pour ≥ 95 % des requêtes de référence | **C** |
| 5 | « Français ou anglais au choix » | Avec `lang=fr`, 0 résultat anglais (hors VO sans traduction) ; idem pour `en` | **C** |
| 6 | « Un livre qui sort demain, quand est-il dans ma base ? » | Délai mesuré entre la date de parution et la présence en base ; objectif ≤ 7 jours, sinon repli en direct | **D** |
| 7 | « Gratuit, < 100 utilisateurs/jour » | Tient dans les limites de Supabase gratuit (taille, requêtes) ; temps de réponse < 500 ms | **E** |

## A. Santé des services (exécutable)

`node archive/prototype-mesures/tests/services.mjs` — pour chaque source : disponibilité sur 5 appels, latence médiane et pire cas,
et vérification de **comportements dont on dépend** (déjà observés par Vault Read, qu'on veut confirmer) :

- BnF : le filtre « texte imprimé » exclut-il les non-livres ? un ISBN-13 ancien ne répond-il qu'en ISBN-10 ?
- Open Library : `readinglog_count` n'est rendu que si demandé ; une couverture absente rend 404 avec `default=false`.
- Google Books : taux de 503/429 sans clé ; présence de `industryIdentifiers`.
- Wikidata : l'endpoint SPARQL répond, la recherche d'entités aussi.

## B. Couvertures (exécutable)

`node archive/prototype-mesures/tests/couvertures.mjs` — pour un échantillon d'ISBN par saga (Wikidata + BnF) :

1. **Présence** : Open Library (par ISBN, `default=false`) et Google Books (par ISBN) rendent-ils une image ?
2. **Qualité** : dimensions réelles (largeur ≥ 200 px) et poids ; détection des images « fantômes ».
3. **Association** : le volume Google rendu porte-t-il bien l'ISBN demandé ? quel est son titre ?
4. **Contrôle visuel** : génération d'une **planche-contact HTML** par saga (`sorties/ ou archive/prototype-mesures/out/couvertures.html`),
   car « la bonne couverture sur le bon tome » ne se juge pas par un chiffre, mais à l'œil.

## C. Pertinence et sagas (spécifié, à exécuter contre l'API)

Jeu : `test/fixtures-pertinence/sagas.json` (sagas, tomes attendus) et `test/fixtures-pertinence/requetes.json` (requêtes + résultat attendu).

- Requêtes du banc de Vault Read : harry potter, le seigneur des anneaux, le trone de fer, la quete d'ewilan, la passe-miroir,
  game of thrones, germinal, les fourmis.
- Variantes à tester pour chacune : avec/sans article, accents manquants, faute de frappe, titre anglais vs français, auteur seul.
- Sagas : nombre de tomes, ordre, 1 résultat par tome (pas 5 éditions du tome 1), coffrets/intégrales à part.
- Langue : `lang=fr` et `lang=en` sur « game of thrones ».

## D. Fraîcheur (spécifié)

Choisir 10 livres parus dans les 30 derniers jours (fr et en), puis mesurer pour chacun, **chaque jour pendant 2 semaines**,
dans quelle source il apparaît (BnF, Google, Open Library, Wikidata) et à quelle date. Résultat : le délai réel de chaque
source, qui décide de la fréquence des imports et du besoin d'un repli en direct.

## E. Capacité (spécifié, après le prototype de données)

Taille de la base filtrée (fr + en) mesurée sur un import réel ; temps de réponse des requêtes `/search` sur Supabase gratuit ;
comportement après 7 jours sans activité (mise en pause).

## F. Validation du catalogue (2026-10-05)

Jeu de 117 cas, critère en 6 axes, lanceur `scripts/validation-catalogue.mjs` : voir `docs/resultats-validation-1.md`.

## Règle

Aucune amélioration de l'API n'est « réussie » sans un chiffre avant/après sur ces tests.
