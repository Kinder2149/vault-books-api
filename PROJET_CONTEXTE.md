# PROJET_CONTEXTE — « Vault Books API »

> Document de cadrage. Il fixe les décisions prises et liste les questions ouvertes.
> État au 2026-10-05 : **étapes 1 et 2 codées** (API locale : `/v1/search`, `/v1/series/:id`, `/v1/books/:id`, `/v1/health` ; Hardcover + BnF,
> cascade de couvertures, corrections, 58 tests unitaires ; test C : 13/13 requêtes et 3/3 sagas ; couvertures réelles 100 %/100 %/95 %).
> **En ligne** depuis le 2026-10-05 : https://vault-books-api.vercel.app (Vercel) + Supabase (projet vault-books-api, cache et corrections) + GitHub Kinder2149/vault-books-api.
> Test de fumée complet vert. Prochaine étape : brancher Vault Read (étape 3). Voir README.md et docs/mise-en-service.md.

## 1. Pourquoi

Vault Read interroge Google Books, Open Library et la BnF en direct depuis le client.
Résultat : recherche peu pertinente, sagas incomplètes ou mélangées entre éditeurs,
couvertures mal associées. Toute la logique de tri vit dans l'app (`tomes.js`,
`books.js`).

**Idée :** construire notre propre catalogue *avant* la recherche de l'utilisateur.
Les mêmes sources alimentent une base nettoyée ; l'app interroge une API qui rend
des résultats déjà triés. La logique de tri sort de l'app.

## 2. Cas de test qui échouent aujourd'hui

- « game of thrones » : on veut la saga complète, dans l'ordre, sans mélanger les éditeurs.
- « seigneur des anneaux » : idem.
- « Les Chevaliers d'Émeraude » : les couvertures étaient associées au mauvais tome.

Ces trois cas servent de base du jeu de test (voir §6).

## 3. Contraintes

- Moins de 100 utilisateurs par jour.
- Recherche principalement **par titre** (auteur et ISBN : secondaire).
- Choix de la langue du catalogue : **français ou anglais**.
- **Couvertures fiables**, une bonne couverture par édition.
- **Hébergement gratuit**, dans les services déjà connus (Render, Vercel, Firebase, Git).
- Projet **distinct** de Vault Read ; l'app n'en sera qu'un client.

## 4. Modèle de données (proposition)

- `works` : l'œuvre (titre normalisé, auteurs, langue, score de popularité).
- `series` : la saga, avec l'ordre des tomes (`series_id`, `position`).
- `editions` : ISBN-10/13, éditeur, date, langue, **couverture**, rattachées à un work.
- `authors`.

Un résultat de recherche = un work (ou une série), jamais 40 éditions en vrac.

## 5. Mises à jour (proposition)

1. Import de fond mensuel (Open Library) et hebdomadaire (BnF).
2. Cron quotidien sur les nouveautés (Google Books).
3. Si une recherche ne trouve rien : interrogation en direct, puis enregistrement
   (cache-aside).

Aucune source gratuite ne garantit un livre la veille de sa sortie.

## 5 ter. Orientation retenue (2026-10-05, après mesures 1 à 3)

**API fine devant Hardcover** (source principale), avec cache Supabase, notre tri, corrections manuelles et sources interchangeables
(BnF pour les éditions françaises, Open Library/Wikidata en appoint). Pas de copie complète du catalogue.
Fonctionnement détaillé et feuille de route : `docs/architecture-fonctionnement.md`. Mesures : `docs/resultats-mesure-{1,2,3}.md`.

## 5 bis. Décision d'hébergement (2026-10-05)

**Supabase (Postgres)** pour la base et la recherche : plein texte, `unaccent`, `pg_trgm`,
écritures quotidiennes sans redéploiement. Déjà utilisé par Kinder sur un autre projet.
Limites à vérifier à l'heure du choix : ~500 Mo en offre gratuite, pause après inactivité
(le cron quotidien garde le projet actif). Une fine API (Render/Vercel) reste optionnelle.

Analyse de l'existant : `docs/analyse-vault-read.md`.

## 6. Questions ouvertes

- Taille réelle du catalogue filtré (à mesurer) : tient-il dans la base gratuite ?
- Licences et quotas actuels des sources, notamment le stockage de données Google Books.
- Reprise de la logique `tomes.js` de Vault Read : la porter telle quelle ou la réécrire ?
- Origine des couvertures (Google, Open Library, BnF) et règle de choix.

## 7. Prochaines étapes

1. Lire `vault-read/client/src/{books,tomes}.js` et `sources/*.js` pour reprendre l'existant.
2. Écrire le jeu de test de pertinence (50 à 100 recherches avec le résultat attendu),
   en commençant par les trois cas du §2. Vault Read a déjà un banc :
   `client/tests/banc-recherche.js`.
3. Prototype jetable : importer un échantillon, mesurer la taille obtenue.
4. Choisir l'hébergement d'après cette mesure, puis écrire le schéma et l'API.

