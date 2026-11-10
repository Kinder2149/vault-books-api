# Rapport pour la conversation du service (vault-books-api) — essai émulateur du 6 octobre 2026

> De : conversation Vault Read (application). À : conversation `vault-books-api`.
> Source : essai complet sur émulateur (fiche `docs/fiche-essai-emulateur.md`), détail geste par geste dans `resultat.md`, captures dans `captures\`.
> Complété par des appels directs au service (clé lue dans `client/.env`, jamais affichée) pour séparer ce qui vient du service de ce qui vient de l'application. Les résultats de ces appels sont cités ci-dessous, avec l'état du service au 6 octobre en fin de matinée.
> Version testée : `main` au commit `4dbfe6b` + une seule ligne de contexte (sans effet sur le code). Appareil virtuel `Medium_Phone_API_36.1`. Le service tourne en ligne, donc un résultat peut changer entre deux essais.

## 0. Résumé en cinq lignes

1. Le service répond bien pour les sagas (Dune : 8 tomes, Narnia : 7 tomes, Harry Potter : 7). **Ce qui manque à l'écran vient surtout de l'application**, qui masque les tomes « non disponibles » ou « à paraître ».
2. **Défauts réels du service** : titres de sagas en anglais en mode français, un livre sans rapport avec un score négatif renvoyé pour « hary poter », saga « Sandman » en tête côté service mais absente à l'écran (à vérifier), couvertures de mauvais tomes ou de mauvaise langue, titres de tomes en italien.
3. **Éléments manquants côté service** pour que l'application montre ce qu'on attend : nom de saga traduit, résumé en français, statut d'un tome indisponible exploitable, nombre de pages fiable, tolérance aux fautes de frappe.
4. **Vitesse** : le service répond en 0,1 à 0,7 s à chaud ; les ~10 s relevés sur émulateur viennent donc surtout de l'application (appels en chaîne, relance de l'application entre les mesures, délai de mon outil de mesure) et pas du service.
5. **Rien n'a été modifié** dans le service ni dans l'application pendant cet essai.

## 1. Problèmes rencontrés — avec la cause probable

Légende cause : **SERVICE** (à corriger chez vous), **APPLICATION** (reste de notre côté), **À VÉRIFIER** (je n'ai pas pu trancher).

| # | Constat à l'écran | Ce que dit le service (appel direct) | Cause |
|---|---|---|---|
| P1 | « Dune » affiche 6 tomes ; tomes 7 et 8 absents (la fiche attendait « visibles et marqués indisponibles ») | `/v1/series/1150?lang=fr` rend **8 tomes** : 1 à 6 `disponible=true` ; 7 « I cacciatori di Dune » et 8 « I vermi della sabbia di Dune » `disponible=false`, `aParaitre=true`. | **APPLICATION** : `client/src/sources/vaultapi.js` ligne 136 filtre `t.disponible && !t.aParaitre`. C'est un choix de l'application, contraire à l'attente de la fiche. **SERVICE** en plus : les deux titres sont en **italien**, et un tome « `aParaitre` » pour des livres parus en 2008 (Hunters of Dune, Sandworms of Dune) est trompeur (ce ne sont pas des « à paraître », ce sont des livres sans édition française trouvée). |
| P2 | « Narnia » : 6 tomes, ordre brouillé, titre de saga en anglais | `/v1/series/5485` rend **7 tomes**, tome 2 « Tales of Narnia: Prince Caspian/The Voyage of the Dawn Treader » `disponible=false` ; saga nommée « The Chronicles of Narnia (Publication Order) ». | **APPLICATION** pour le tome 2 masqué (même filtre que P1). **SERVICE** pour le nom de saga en anglais, et pour le tome 2 qui est un **volume double anglais** (« Prince Caspian / Dawn Treader ») au lieu de « Le Prince Caspian » seul. L'ordre brouillé vu à l'écran n'est pas confirmé côté service : à vérifier (voir P10). |
| P3 | « Dune Sequels » : la carte attendue n'apparaît pas | La recherche « dune » rend deux sagas : « Dune » (score 154) et « Dune Sequels » (score 105,5). | **À VÉRIFIER** (application) : seule « Dune » se déplie ; « Dune Sequels » n'est pas visible à l'écran. Probable : ses tomes sont tous « non disponibles » et filtrés. À confirmer avec P1. |
| P4 | « hary poter » : un seul livre sans rapport (« Ländliches Mörder-Idyll », Alfred Bekker) | `/v1/search?q=hary poter` rend ce seul livre, `score=-8` (négatif). | **SERVICE** : la tolérance aux fautes ne rattrape pas « hary poter » (une faute par mot) et le service renvoie quand même un livre au score négatif. **APPLICATION** : elle affiche ce résultat au lieu de le juger trop faible. Cas à ajouter aux recherches de validation : `hary poter` doit rendre Harry Potter ; un score négatif ne devrait pas être renvoyé tel quel. |
| P5 | « sandman » : 3 livres plats dont « Sandman Slim » (hors sujet), pas la saga | `/v1/search?q=sandman` rend 3 **sagas** : « The Sandman » (1057, score 147), « Sandman Edición Absolute » (11925, 122,4), « Sandman Slim » (5672, 116,8). | **À VÉRIFIER** (application) : le service met bien « The Sandman » en tête, l'écran ne l'a pas montrée. Probable : la saga est dépliée en tomes tous indisponibles en français → filtrés → repli sur des cartes. À confirmer. Côté **SERVICE** : « Sandman Edición Absolute » est en espagnol (même défaut que P1/P2 : langues mélangées). |
| P6 | Titres de sagas en anglais en mode français : « The Wheel of Time », « Diary of a Wimpy Kid », « The Chronicles of Narnia (Publication Order) » | Le champ `nom` de la saga est le nom canonique anglais ; aucun nom français fourni. | **SERVICE** : manque un nom de saga localisé (`nom` dans la langue demandée, avec repli sur l'anglais). |
| P7 | Résumés **en anglais** pour des éditions françaises (Dune Robert Laffont, Harry Potter Gallimard), parfois avec balisage brut (`**`, `###`, `[1]`, URL openlibrary) | Les résumés viennent d'Open Library ; l'application (`resume: null` dans les cartes de saga) les récupère ailleurs, sur fiche. | **SERVICE** (source) + **APPLICATION** (affichage). Demande : un résumé **dans la langue demandée** quand il existe, et nettoyé (pas de Markdown, pas de lien). |
| P8 | Couvertures de mauvais tome ou de mauvaise langue | Voir détail §2. | **SERVICE** (couverture associée à une édition qui n'est pas la bonne). |
| P9 | Fiche d'un tome : « Pagination retenue : 11 pages » pour « Le Feu dans le ciel » (Chevaliers d'Émeraude tome 1) | Le service fournit `pages` pour cette édition (valeur 11, ISBN 9782890746626). | **SERVICE** : valeur douteuse (un roman de ce genre a des centaines de pages). Demande : plausibilité (rejeter un nombre de pages incohérent, par exemple < 30 pour un roman). |
| P10 | Ordre brouillé des tomes de Narnia et de « anne robillard » (Chevaliers d'Émeraude hors ordre) | Le service rend `position` par tome. | **À VÉRIFIER** (côté application : tri du mode auteur ?). Le mode auteur affiche une liste plate sans en-têtes de saga alors que `deplier(..., {maxTomes: 8})` existe : l'application ne montre pas les sagas dépliées comme la fiche l'attendait. Restera de notre côté (**APPLICATION**). |
| P11 | Recherche par ISBN 9782070541270 : OK (Gallimard Jeunesse, 232 pages, « Cycle : Harry Potter, tome 1 ») ; ISBN 0441172717 : OK | `/v1/isbn/...` fonctionne. | OK. Le résumé en anglais reste à traiter (P7). |
| P12 | Mode avion : message « Failed to fetch » en anglais technique ; bandeau qui cite « Google Books » au lieu du catalogue | — | **APPLICATION** uniquement. |
| P13 | Catalogue désactivé : recherche très lente (> 8 s puis ~15-20 s) | — | Hors service (sources classiques Google / Open Library / BnF). À titre d'information. |

## 2. Couvertures — liste à corriger côté service

| Recherche | Tome | Constat |
|---|---|---|
| `le trone de fer` | tome 3 « Intrigues à Port-Réal » | couverture portant la mention « 6 » (connu) |
| `game of thrones` (langue Anglais) | tome 2 « A Clash of Kings » | couverture **portugaise** (« A Fúria dos Reis ») |
| `game of thrones` (langue Anglais) | tome 6 « The Winds of Winter » | livre **non paru** présenté comme tome 6 |
| `la roue du temps` | tome 4 « La Montée des orages » | couverture mentionnant « 7 » |
| `la roue du temps` | tome 6 « Le Seigneur du chaos » | couverture mentionnant « XI » |
| `journal d'un degonfle` | tome 5 | couverture anglaise « The Ugly Truth » au milieu de couvertures françaises (Seuil) |
| `harry potter` | tome 1 | couverture d'**édition audio** (logos CD / mp3, 2018) au lieu de la couverture papier habituelle |
| `chevaliers d'emeraude` | tome 2 « Les dragons de l'Empereur Noir » | couverture quasi blanche (page de titre scannée « Tome V — L'île des Lézards ») : mauvais tome et couverture inexploitable |

## 3. Améliorations à faire (service)

1. **Nom de saga localisé** dans `/v1/series/:id` et dans les cartes de recherche (P6).
2. **Statut d'un tome plus clair** : distinguer `indisponible en français` de `à paraître` (P1). Aujourd'hui `aParaitre=true` est utilisé pour des livres parus depuis longtemps. Proposition : `statut: 'disponible' | 'indisponible_langue' | 'a_paraitre'`.
3. **Titre de tome toujours dans la langue demandée**, ou à défaut un indicateur `langueTitre` pour qu'on puisse l'afficher en gris (P1 italien, P5 espagnol).
4. **Volumes doubles** (Narnia tome 2 « Prince Caspian / Dawn Treader ») : rendre le tome unique si une édition française existe, sinon un tome indisponible clairement nommé (P2).
5. **Résumé** dans la langue demandée, nettoyé de tout Markdown et lien (P7).
6. **Tolérance aux fautes de frappe** sur plusieurs mots (« hary poter », « harri poter ») et **ne pas renvoyer de résultat à score négatif** (P4).
7. **Plausibilité du nombre de pages** (P9).
8. **Choix de la couverture** : écarter les couvertures de pages de titre scannées et les éditions audio quand une édition papier existe ; vérifier la langue de la couverture par rapport à `lang` (§2).
9. **Plusieurs éditions par œuvre** exposées de façon exploitable (la fiche de l'application dit « Un seul exemplaire pour l'instant » : G10 de la fiche d'essai attend un choix d'édition) : un `GET /v1/books/:id/editions` ou un champ `editions[]` avec éditeur, année, format (papier / poche / numérique / audio), couverture et ISBN.
10. **Signalement des ex-æquo de saga** (« Dune » et « Dune Sequels ») : un champ `typeSaga` (cycle principal / suites / préquelles) pour que l'application puisse les présenter ensemble.

## 4. Éléments manquants (côté service) pour ce que l'application affiche

- **Nom de saga français** (P6).
- **Résumé français** (P7).
- **Format de l'édition** (papier, poche, numérique, audio) : permet d'écarter l'audio en couverture du tome 1 d'Harry Potter.
- **Statut d'un tome** exploitable (P1).
- **Liste des éditions d'une œuvre** (amélioration 9).
- **Un champ de qualité de donnée** par couverture et par nombre de pages (valeur 0 à 1) pour que l'application puisse masquer ce qui est douteux.

## 5. Ce qui reste du côté de l'application (pour information, pas pour vous)

- Masquer ou afficher les tomes indisponibles / à paraître : **décision à prendre avec Kinder** (ligne 136 de `vaultapi.js`). La fiche d'essai attendait « visibles et marqués indisponibles » ; le code masque.
- Mode **Auteur** : liste plate sans sagas dépliées.
- Messages hors ligne (« Failed to fetch », bandeau qui cite Google Books).
- Jargon technique visible dans les fiches (« Œuvre identifiée ol:OL… »).
- Rubrique « Sources des données » sans Hardcover ni catalogue.
- Complément par Google / Open Library / BnF quand le catalogue ne connaît pas un livre (préquelles de Dune) : toujours absent.

## 6. Vitesse

| Mesure | Attendu | Relevé |
|---|---|---|
| Service à chaud, `/v1/search` | — | 125 à 666 ms |
| Service à chaud, `/v1/series/:id` | — | 115 à 265 ms |
| Application sur émulateur, recherche d'une saga | ≤ 5 s | ≈ 10 s (précision ≈ 3 s, application relancée avant chaque essai) |
| Application, même recherche une seconde fois | ≤ 1 s | ≈ 10 s : aucun gain visible dans ce protocole |

Lecture : le service tient largement le délai ; l'écart vient de l'application (appels successifs `search` + `series` par saga, relance de l'application, réseau du PC). À mesurer sur téléphone avant de conclure.

## 7. Recherches à ajouter à la validation du service

- `hary poter` → doit rendre Harry Potter.
- `sandman` → « The Sandman » en tête et dépliable en français.
- `dune` → vérifier que « Dune Sequels » est accompagnée d'un statut utile pour ses tomes indisponibles.
- `le monde de narnia` → tome 2 = un seul volume français.
- `game of thrones` en anglais → couverture du tome 2 en anglais (pas en portugais).
- `la roue du temps` et `journal d'un degonfle` → couvertures de bon tome, de bonne langue.
- `chevaliers d'emeraude` → tome 2 avec une couverture exploitable.

## 8. Où trouver les preuves

`V:\DEV\PROJETS\applications_web\Vault Read API\essai-emulateur\` : `resultat.md` (fiche remplie, 27 gestes) et `captures\` (une capture par geste ; X01 et X02 pour les défauts de fiche).
