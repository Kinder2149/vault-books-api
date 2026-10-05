# Analyse de Vault Read — ce qu'on en retient pour l'API

> Lecture seule de `vault-read/client/src/{books,tomes}.js` et `sources/{google,openlibrary,bnf}.js`
> (état du dépôt au 2026-10-05). Rien n'a été modifié dans Vault Read.
> Les `tests/banc-recherche.js` et `tests/controle-sources.js` n'ont pas encore été lus.

## 1. Comment Vault Read cherche aujourd'hui

À chaque recherche, depuis le téléphone :

1. **Google Books** `intitle:...` (`langRestrict=fr`, 20 résultats/page) = la découverte.
2. En parallèle, **BnF** (SRU) pour combler ISBN/éditeur/année, et **Open Library** `search.json`
   pour savoir quel *auteur* fait autorité sur la requête (`rangAuteur`).
3. Le client **rattrape les défauts des sources par heuristiques** : fusion de doublons,
   score de pertinence, filtre « hors sujet », détection des tomes par expressions régulières.

Conclusion : la logique est riche et bien mesurée, mais elle compense à chaque recherche le fait
que les sources ne sont pas faites pour ça. C'est exactement ce qu'on veut sortir de l'app.

## 2. Ce qu'on peut reprendre tel quel (fonctions pures, sans réseau)

| Fonction (fichier) | Rôle | Pour l'API |
|---|---|---|
| `numeroDeTome`, `nomDeSerie` (`tomes.js`) | Lit « Tome 3 », « T5 », « . 4, » (forme BnF), chiffres romains | Étape d'**import** (une fois par livre), plus à chaque recherche |
| `titreOeuvre`, `cleRegroupement`, `MOTS_EDITION` (`books.js`) | Titre réduit à l'œuvre, sans mentions d'édition/format | Base du regroupement en `works` |
| `profilAuteur`, `memeAuteur` | « J.R.R. Tolkien » = « John Ronald Reuel Tolkien » | Table `authors` + alias |
| `fusionnerDoublons` (union-find : ISBN = preuve, titre+auteur+tome = clé) | Une carte par livre | Transposable en SQL/Node à l'import |
| `scorePertinence` | titre exact 100 / préfixe 70 / contient 40, pénalité de longueur, complétude, + français | Devient le classement de `/search` |
| `lireCycle` (`openlibrary.js`) | Lit le champ `series` d'OL | Source de séries |

Principes à garder, déjà mesurés par Vault Read :
- **Une carte par œuvre**, mais **coffret et intégrale non numérotée restent séparés** (tranche 31).
- Mieux vaut **une carte en trop qu'une fusion fausse**.
- L'article de tête (« A », « Le ») ne compte pas dans la comparaison.
- Le **filtre hors-sujet par auteur** (un essai sur Game of Thrones n'est pas écrit par Martin) :
  c'est le signal qui a le mieux marché.

## 3. Pièges de sources déjà découverts (à ne pas redécouvrir)

**Google Books**
- Quota **1 000 requêtes/jour par projet** ; 503 en rafales. Un import hors ligne par lots l'évite.
- Couvertures : `http://` à passer en `https://`, `zoom=2` (300×474) au lieu de 1, retirer `&edge=curl`.
  Elles manquent pour ~35 % des volumes. `pageCount=0` veut dire « inconnu ». Dates tantôt `YYYY`,
  tantôt `YYYY-MM-DD`. Un volume peut n'avoir aucun ISBN (OCLC seul).
- `orderBy=newest` est ignoré.

**Open Library**
- Anglophone ; **65 % des ISBN français y sont inconnus**.
- Couverture : utiliser l'**identifiant de couverture** (`/b/id/{cover_i}`), ou par ISBN avec
  **`?default=false`**, sinon image d'un pixel en statut 200.
- `/isbn/` fait une redirection ; `/works/` peut rendre un `/type/redirect` ; dates en texte libre
  (« Aug 26, 2021 ») ; descriptions tantôt texte, tantôt `{type, value}`.
- `readinglog_count` = popularité, mais n'est rendu que si demandé dans `fields=`. Utile surtout comme
  **rang**, pas comme compte (biais anglophone).
- Disponibilité irrégulière (de 0,5 s à 9 s, ou coupure).

**BnF**
- Dépôt légal : couvre tout livre publié en France, sans clé, sans quota. Mais **ni couverture ni résumé**.
- Filtre obligatoire `bib.doctype any "a"` (sinon cassettes et disques).
- Anciens livres indexés en **ISBN-10** (conversion 13→10 nécessaire).
- Format `dublincore` : auteurs avec rôle et dates à nettoyer, éditeur avec ville, **jamais le mot
  « tome »** (numéro après un point ou une virgule). Le champ **« Collection »** nomme souvent la série.
- Pertinence médiocre en recherche libre ; excellente pour « toutes les éditions de ce texte ».

## 4. Causes réelles de vos trois échecs, d'après le code

- **Saga mélangée entre éditeurs** : l'ordre vient d'une regex sur le *titre*. Pas de notion de série
  stockée. `separerLesTomes` exige 3 tomes distincts, et la page 1 de Google n'en contient souvent que 2.
  → Il faut une table `series` avec `position`, alimentée à l'import (BnF « Collection », champ `series`
  d'OL, Wikidata), et pas une déduction à l'affichage.
- **Couvertures mal associées** : Vault Read a corrigé le 2026-08-30 une clé de fusion qui coupait le
  titre au « : » et réunissait des tomes différents. La couverture appartient à un *volume Google* ou
  à un *identifiant OL*, pas à une œuvre. → Dans l'API : **une couverture par édition (ISBN)**, jamais
  héritée de l'œuvre, avec vérification que l'image existe.
- **« Game of Thrones » / « Seigneur des anneaux »** : titres français ≠ titres canoniques OL
  (« Le Trône de fer » ≠ « A Game of Thrones »). Vault Read le contourne en rapprochant par *auteur*.
  → L'API doit stocker les **titres alternatifs** (VO, traduction) sur l'œuvre.

## 5. Ce que Vault Read ne fait pas et que l'API devra faire

- **Choix de langue fr/en** : Vault Read force `langRestrict=fr`. À rendre paramétrable (`lang=fr|en`).
- **Séries comme objets stockés** (pas des regex).
- **Titres alternatifs** et alias d'auteurs.
- **Validation des couvertures** (pas d'image fantôme).
- **Mises à jour planifiées** (imports + cron) au lieu d'un appel au moment de la recherche.

## 6. Questions ouvertes issues de cette lecture

1. Les 3 sources suffisent-elles pour les séries ? Wikidata (propriétés « série » et « numéro dans la série »)
   est à tester sur vos 3 sagas.
2. Licence de stockage de Google Books : à vérifier avant d'y copier des données (les URLs de couvertures,
   elles, peuvent être référencées).
3. `banc-recherche.js` : quelles requêtes de référence contient-il ? À lire pour construire notre jeu de test.
