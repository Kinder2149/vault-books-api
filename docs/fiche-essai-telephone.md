# Fiche d'essai sur téléphone — Vault Read + catalogue Vault Books

À remplir par Kinder, environ 20 minutes. Pour chaque geste : **OK**, **Gênant** (marche mais mal) ou **KO**, et une phrase si ce n'est pas OK.
Version à installer : build de la branche `feature/catalogue-api` (le fichier `client/.env` doit contenir l'adresse et la clé du service au moment du build).

Avant de commencer : Réglages → carte « Catalogue » → l'interrupteur est sur **activé**, la langue est **Français**.

| # | Geste | Résultat attendu | Résultat |
|---|---|---|---|
| 1 | Chercher `chevaliers d'émeraude` | La saga arrive **complète, tomes 1 à 12 dans l'ordre**, une seule éditeur par tome, chaque couverture différente | |
| 2 | Chercher `le trône de fer` | Les tomes sont dans l'ordre, pas de mélange d'éditeurs | |
| 3 | Chercher `seigneur des anneaux` | Les trois tomes + éventuellement le Hobbit, pas de bruit (jeux, guides) | |
| 4 | Chercher `game of thrones` en passant la langue du catalogue sur **English** | Les tomes en anglais ; revenir sur Français ensuite | |
| 5 | Chercher par **auteur** : `anne robillard` | Ses sagas d'abord (dépliées, 8 tomes max chacune), puis ses livres isolés | |
| 6 | Chercher `harry potter` (faute volontaire : `hary poter`) | Le bon résultat remonte quand même | |
| 7 | **Scanner** le code-barres d'un livre papier que vous avez | Fiche avec éditeur, date, **nombre de pages**, couverture de CETTE édition | |
| 8 | Scanner un livre ancien (avant 2007, ISBN à 10 chiffres au dos) | La fiche s'ouvre quand même | |
| 9 | **Ajouter** un tome de saga à la bibliothèque, puis ouvrir la fiche | Le tome est annoncé « tome N sur 12 » ; résumé présent si le service en a un | |
| 10 | Dans la fiche, **choisir une autre édition** | Les éditions proposées ont chacune leur couverture ; changer d'édition change la couverture | |
| 11 | Ajouter le même livre deux fois de suite | Il n'apparaît qu'une fois | |
| 12 | **Mode avion** : refaire la recherche du geste 1 | Résultats servis, annoncés « anciens » ; aucune erreur rouge | |
| 13 | Mode avion : chercher un livre jamais cherché | Message d'erreur clair (pas d'écran blanc) | |
| 14 | Réseau revenu : refaire la recherche | Résultats frais, plus de mention « ancien » | |
| 15 | Réglages → couper le catalogue, chercher `dune` | La recherche marche comme avant (Google, Open Library, BnF) | |
| 16 | Réglages → « Sources des données » → toucher « Hardcover » | La page s'ouvre dans le navigateur du téléphone, pas dans l'application | |

## Vitesse (au chrono, réseau mobile)

| Mesure | Attendu | Relevé |
|---|---|---|
| Première recherche d'une saga jamais cherchée | ≤ 5 s | |
| Même recherche une seconde fois | ≤ 1 s | |
| Scan jusqu'à la fiche | ≤ 3 s | |

## À signaler en plus

- Une saga **incomplète** ou **mal ordonnée** (donnez le nom exact tapé).
- Une couverture **fausse** ou **identique sur deux tomes**.
- Un livre cherché qui **n'apparaît pas** : ajoutez-le à `data/requetes-kinder.json` (la liste de vos vraies recherches) — c'est ce qui sert à régler la pertinence.

Retournez la fiche remplie : chaque ligne « Gênant » ou « KO » devient une correction.
