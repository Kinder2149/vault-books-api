# Mesure 1 — que contiennent les sources pour nos trois sagas ? (2026-10-05)

Script : `prototype/mesure.mjs` (jetable). Réponses brutes dans `prototype/out/` (non versionné).
Couvertures et Google Books **non mesurés** dans cette passe.

| | BnF (dépôt légal FR) | Open Library | Wikidata |
|---|---|---|---|
| **Trône de fer** | 88 notices, 75 avec ISBN, tomes lus : 1-4 | « A Game of Thrones » bien en tête (13 494 lecteurs), mais 18 œuvres dont jeux, coloriage, BD | Série Q45875 : 15 œuvres, 45 éditions (42 ISBN). Mélange de FR/EN/suédois, préquelles, ordre manquant sur 7 |
| **Seigneur des anneaux** | 98 notices, 76 avec ISBN, tomes lus : 1-4 | « The Lord of the Rings » en tête (253 éditions), 34 œuvres parasites | Mon script a retenu **la trilogie de films** (Q190214), pas le livre : mauvais choix de ma part, à refaire |
| **Chevaliers d'Émeraude** | 76 notices, 66 avec ISBN, **0 tome lu** (titres sans numéro) | **30 « œuvres » à 1 édition chacune** : la saga est éclatée | Série Q3231445 : 11 tomes ordonnés + 10 éditions avec ISBN, **le tome 2 manque** |

## Ce qu'on en conclut

1. **Aucune source ne suffit seule.**
   - Wikidata donne le squelette d'une série (ordre) quand elle y existe, mais il est incomplet et bruité.
   - La BnF donne toutes les éditions françaises (éditeur, ISBN, année) mais ni numéro de tome fiable ni couverture.
   - Open Library apporte la notoriété (rang d'auteur, lecteurs), mais son champ `series` était **vide dans les trois cas**, et il est mauvais sur le français.
2. **La saga d'Émeraude explique votre bug de couvertures.** Open Library l'éclate en dizaines de « œuvres » à une édition,
   et la BnF ne porte pas le numéro de tome dans les titres. Impossible de retrouver l'ordre par regex :
   c'est exactement le cas où l'ordre doit venir d'une **donnée de série** (Wikidata) croisée avec les ISBN de la BnF.
3. **Le volume est petit.** 76 à 98 notices BnF par saga, quelques dizaines d'ISBN. Il n'y a pas de problème de taille à ce niveau
   (reste à extrapoler au catalogue entier).
4. **Il faudra une couche de correction manuelle** (table `series_overrides`) pour les sagas majeures : tome manquant (Émeraude 2),
   mauvais rattachement, titres de traduction. Pour moins de 100 utilisateurs, quelques centaines de sagas curées suffisent.

## À mesurer ensuite

- **Couvertures** : pour les ISBN trouvés ci-dessus, tester Open Library (`/b/isbn/{isbn}-L.jpg?default=false`) et Google Books
  (volumes par ISBN) ; mesurer le taux de couverture trouvée et vérifier qu'elle correspond bien au bon tome.
- **Wikidata, Seigneur des anneaux** : retrouver la bonne série livre (Q15228) et son rattachement.
- **Rapprochement BnF ↔ Wikidata par ISBN** : quel pourcentage des ISBN Wikidata retrouve une notice BnF ?
- **Extrapolation de taille** : combien de notices BnF au total pour fr (filtre texte imprimé) ?
