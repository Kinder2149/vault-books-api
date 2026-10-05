# Mesure 3 — Hardcover (2026-10-05)

Scripts : `prototype/tests/hardcover.mjs` (recherche + couvertures par ISBN), `prototype/tests/hardcover-series.mjs` (séries).
Clé : `read:catalog` seulement, dans `.env`.

## Ce que Hardcover apporte

| Besoin | Constat |
|---|---|
| Recherche par titre | 160-200 ms. « game of thrones » → *A Game of Thrones* (9 806 lecteurs) en tête ; auteur, séries, image, nombre de lecteurs (`users_count`) dans chaque résultat. FR : « le trone de fer » → *Le trône de fer*. |
| Couvertures par ISBN-13 (94 ISBN) | Édition connue + image : Trône de fer **67 %**, Seigneur des anneaux **73 %**, Chevaliers d'Émeraude **68 %**. Union avec Open Library : 72 % / 73 % / 68 %. |
| Séries et ordre | **Les Chevaliers d'Émeraude : série #25608, 12 tomes principaux numérotés 1 à 12, titres français** (le tome 2 manque chez Wikidata, pas ici). Trône de fer : série #981, 6 « principaux ». Seigneur des anneaux : la série anglaise est mélangée au Hobbit ; la série française (#87481) ne contient que 2 livres. |
| Popularité | `users_count` (lecteurs Hardcover), exploitable pour classer. |

## Défauts à traiter

- **Plusieurs entrées à la même position** : intégrales, coffrets, audiobooks, éditions étrangères, doublons « Tome 7 » (position 1 ×15 pour le Trône de fer).
  → on retient `primary_books_count` / `featured` et on applique les règles « coffret/intégrale à part » de Vault Read.
- **Positions décimales** (0.4, 0.5, 2.5) : préquelles et hors-séries ; à ranger dans « autres ».
- **La série française n'est pas toujours complète** (Seigneur des anneaux) : le rattachement des traductions à l'œuvre canonique est à faire chez nous.
- `_ilike` et les recherches partielles sont **interdits** (seul `_eq` exact + l'endpoint `search`).

## Limites et conditions d'usage (doc officielle, lue le 2026-10-05)

- **Plan gratuit : 5 000 requêtes/jour, 60/minute, rafale de 10.** Largement suffisant pour des imports étalés et < 100 utilisateurs.
- Offre décrite comme destinée à un usage **personnel** ; un produit commercial ou un site public doit prévoir autre chose : les « limites commerciales » sont annoncées mais pas encore disponibles.
- **Données de catalogue** (livres, séries, éditions) : pas de droits revendiqués, « à vos risques » ; **interdit en revanche** d'exploiter les données des utilisateurs (bibliothèques, avis, listes) dans un produit public/commercial. Les agrégats (nombre de lecteurs, note moyenne) sont permis **s'ils sont attribués à Hardcover**.
- **Les images sont déposées par les utilisateurs** : un site public doit avoir une procédure de retrait **DMCA**.
- Interdit d'entraîner des LLM publics ou commerciaux avec les données.
- Requêtes à lancer **côté serveur uniquement** (pas depuis le navigateur ni l'app mobile). Cela cadre avec notre API.
- API en **bêta** : peut changer, jetons réinitialisables sans préavis.
- Aucune phrase lue ne parle explicitement de **stocker une copie** du catalogue : à clarifier avec Hardcover (Discord ou e-mail) avant publication.

## Conclusion

Hardcover est la **meilleure source trouvée pour l'ordre des sagas, la popularité et les couvertures** (≈ 70 %, légales par API).
Il ne suffit pas seul (séries françaises incomplètes, couvertures de poche/collector manquantes), mais il devient l'**ossature** :

1. Séries et ordre : Hardcover → vérification Wikidata → corrections manuelles.
2. Éditions françaises (éditeur, ISBN, année) : BnF, à débit lent.
3. Couvertures : Hardcover → Open Library → couverture dessinée ou fournie à la main.
4. Popularité : `users_count`.

## À éclaircir avant de s'engager

- Vault Read est-il (ou sera-t-il) publié sur le Play Store ? Si oui, c'est un « produit public » : DMCA + attribution Hardcover + vérification de l'accord de stockage.
- Demander à Hardcover s'ils acceptent un cache/copie de leur catalogue pour une app personnelle.
