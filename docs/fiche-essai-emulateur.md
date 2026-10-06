# Fiche d'essai sur émulateur — Vault Read + catalogue Vault Books

> **Pour : une conversation Claude Code ouverte dans le dossier de l'application** (`V:\DEV\PROJETS\applications_web\Vault Read`).
> **Mission : OBSERVER et RAPPORTER, pas corriger.** Lancer l'application sur un émulateur Android, rejouer les gestes ci-dessous, et rendre à Kinder une fiche remplie, avec captures.
> Préparée le 2026-10-06 par la conversation du service (`vault-books-api`), qui traitera ensuite les retours. Remplace pour l'émulateur la fiche `docs/fiche-essai-telephone.md` (16 gestes), dont elle reprend les gestes et ajoute ceux issus de la validation du catalogue.
> Kinder est product owner, non développeur : parler en français, en termes fonctionnels, **UNE option justifiée** quand une décision est nécessaire. Ne poser qu'UNE question à la fois, la plus importante.

## 0. Ce qui a changé depuis le premier essai (5 octobre) — pour savoir ce qu'on doit voir

Le service (https://vault-books-api.vercel.app) a été corrigé le 6 octobre. Score de validation en ligne : 103 cas sur 116 (89 %), contre 71 (61 %). Concrètement :
- **Les sagas rendent leurs tomes cachés** : « Dune » a **8 tomes** (au lieu de 6) ; les tomes 7 et 8 (suites de Brian Herbert) sont **marqués indisponibles** faute d'édition française trouvée, mais **visibles**. « Narnia » 7 tomes (au lieu de 3), « Ender » 6 (au lieu de 2).
- « Harry Potter » a 7 tomes (le faux tome 8 est retiré), « lord of the rings » (en français) rend la saga en tête, « le seigneur des anneaux intégrale » trouve la saga, « j k rowlin » trouve J.K. Rowling.
- **Connu et accepté, à ne pas signaler comme nouveau défaut** : la carte de recherche peut afficher un ancien total (« Dune (6) ») alors que la saga rend 8 ; « Sandman » rend 75 numéros isolés ; quelques sagas géantes sont incomplètes (Lucky Luke, Gaston, Geronimo Stilton, Walking Dead) ; « harri poter » (deux fautes) ne trouve rien ; des couvertures approximatives sur Trône de fer, Roue du temps, Millenium, Arsène Lupin, Journal d'un dégonflé. **À signaler en revanche** : comment l'application *affiche* ces cas.

## 1. Règles non négociables

- **Hygiène git (CLAUDE.md de Vault Read)** : avant tout, regarder `git status`. **Au 2026-10-06, le dépôt était sur `main` avec `PROJET_CONTEXTE.md` modifié et non enregistré** : **s'arrêter, montrer à Kinder ce fichier et depuis quand, et le laisser choisir** (enregistrer, mettre de côté, abandonner). Ne jamais le jeter soi-même. Puis récupérer l'état en ligne.
- Travailler sur la branche **`feature/catalogue-api`** (celle qui contient le catalogue). **Ne rien fusionner dans `main`** : la fusion exige l'accord explicite de Kinder, dans la conversation.
- **Ne modifier ni le code de l'application ni le service.** Un défaut trouvé se rapporte, il ne se corrige pas ici. (Seule exception : une modification **indispensable pour construire ou lancer** l'application, à signaler explicitement, jamais enregistrée sans accord.)
- **Aucune clé affichée** dans la conversation ni écrite dans un fichier versionné. `client/.env` doit contenir `VITE_VAULT_API_URL` (= `https://vault-books-api.vercel.app`) et `VITE_VAULT_API_KEY` : vérifier seulement que les deux lignes existent et que la clé a 32 caractères.
- Ne jamais toucher une branche `archive/*`. Aucune fusion, aucun envoi en ligne sans demande de Kinder.

## 2. Préparer l'émulateur (déjà installé sur ce poste)

- SDK : `C:\Users\vcout\Android\Sdk` → en réalité `C:\Users\vcout\AppData\Local\Android\Sdk` (contient `emulator\emulator.exe` et `platform-tools\adb.exe`).
- Appareils virtuels existants : **`Medium_Phone_API_36.1`** (recommandé : Android récent, plus proche d'un téléphone actuel) et `LC2`.
- **Piège : le Java par défaut du poste est un Java 8** (`C:\Program Files (x86)\Common Files\Oracle\Java\java8path`). Construire une application Android demande **JDK 17 ou plus** : chercher celui d'Android Studio (dossier `jbr`) et le désigner pour la commande (`JAVA_HOME`), sans modifier la configuration du poste.
- Construire : depuis `client/`, `npm run android` (build + synchronisation Capacitor), puis la construction Gradle du dossier `client/android` (`gradlew assembleDebug`). Installer avec `adb install -r`. Des anciens APK existent à la racine du dépôt (`vault-read-test-catalogue.apk`…) : **ne pas les utiliser**, ils sont antérieurs aux correctifs ; il faut un build de la branche actuelle.
- Piloter l'émulateur avec `adb` : `adb exec-out screencap -p > capture.png` (captures), `adb shell uiautomator dump` (repérer les éléments), `adb shell input tap/text/keyevent`. Le mode avion : `adb shell cmd connectivity airplane-mode enable|disable` (sinon couper le réseau depuis la barre de l'émulateur).
- **Avant les gestes** : dans l'application, Réglages → carte « Catalogue » : l'interrupteur doit être **activé**, la langue **Français**.

## 3. Où ranger les résultats

Créer le dossier **`V:\DEV\PROJETS\applications_web\Vault Read API\essai-emulateur\`** (il est hors des deux dépôts, rien à versionner) :
- `resultat.md` : la fiche remplie (format §6) ;
- `captures\` : une capture par geste, nommée `G01.png`, `G02.png`, … `N01.png`… (le numéro du geste).

## 4. Les gestes (reprise de la fiche du 5 octobre, attendus mis à jour)

Pour chaque geste : **OK**, **Gênant** (marche mais mal) ou **KO**, une phrase si ce n'est pas OK, et la capture.

| # | Geste | Résultat attendu |
|---|---|---|
| G01 | Chercher `chevaliers d'émeraude` | Saga **complète, tomes 1 à 12 dans l'ordre**, un éditeur par tome, couvertures toutes différentes |
| G02 | Chercher `le trône de fer` | Tomes dans l'ordre, pas de mélange d'éditeurs. (Les titres « L'Intégrale 1 à 5 » sont les vrais titres des éditions J'ai lu : normal.) |
| G03 | Chercher `seigneur des anneaux` | Trois tomes (+ éventuellement le Hobbit), pas de bruit |
| G04 | Chercher `game of thrones` après avoir passé la langue du catalogue sur **English** ; puis remettre Français | Tomes en anglais ; retour au français correct |
| G05 | Recherche par **auteur** : `anne robillard` | Ses sagas d'abord (dépliées, 8 tomes max chacune), puis ses livres isolés |
| G06 | Chercher `hary poter` (une faute) | Harry Potter remonte quand même |
| G07 | **Scanner** un code-barres | Fiche avec éditeur, date, **pages**, couverture de CETTE édition. **Émulateur : la caméra est virtuelle.** Essayer d'abord de saisir l'ISBN à la main si l'application le permet, avec `9782070541270` (Harry Potter à l'école des sorciers, Gallimard Jeunesse) ; sinon écrire « non faisable à l'émulateur — à faire sur téléphone » |
| G08 | Scanner / saisir un livre ancien (ISBN à 10 chiffres) : `0441172717` (Dune, en anglais) | La fiche s'ouvre quand même |
| G09 | **Ajouter** un tome de saga à la bibliothèque, ouvrir sa fiche | « tome N sur 12 » ; résumé présent si le service en a un |
| G10 | Dans la fiche, **choisir une autre édition** | Chaque édition a sa couverture ; changer d'édition change la couverture |
| G11 | Ajouter deux fois le même livre | Il n'apparaît qu'une fois |
| G12 | **Mode avion** : refaire la recherche de G01 | Résultats servis, annoncés « anciens », aucune erreur rouge |
| G13 | Mode avion : chercher un livre jamais cherché (`la horde du contrevent`) | Message d'erreur clair, pas d'écran blanc |
| G14 | Réseau revenu : refaire G01 | Résultats frais, plus de mention « ancien » |
| G15 | Réglages → couper le catalogue, chercher `dune` | La recherche marche comme avant (Google, Open Library, BnF) ; **puis remettre le catalogue sur activé** |
| G16 | Réglages → « Sources des données » → « Hardcover » | La page s'ouvre dans le navigateur, pas dans l'application |

### Gestes nouveaux (issus de la validation du catalogue)

| # | Geste | Résultat attendu |
|---|---|---|
| N01 | Chercher `dune`, ouvrir la saga « Dune » | **8 tomes** ; tomes 1 à 6 disponibles ; tomes 7 et 8 **visibles et marqués indisponibles** (peuvent avoir un titre étranger). **Noter ce que l'application montre pour un tome indisponible** (grisé ? message ? possibilité de le chercher ailleurs ?) |
| N02 | Sur la même recherche, regarder la carte « Dune » avant de l'ouvrir et la carte « Dune Sequels » | La carte peut dire « 6 tomes » (connu). **Noter** ce que voit l'utilisateur : incohérence visible entre la carte et la saga ouverte ? |
| N03 | Chercher `le monde de narnia` | 7 tomes (le tome 2 peut être marqué indisponible) |
| N04 | Chercher `lord of the rings` (langue Français) | La saga « Le Seigneur des anneaux » est **en tête** |
| N05 | Chercher `le seigneur des anneaux intégrale` | La saga est trouvée (pas de « aucun résultat ») |
| N06 | Chercher `harry potter`, ouvrir la saga | **7 tomes**, pas de tome 8 |
| N07 | Recherche par auteur `frank herbert` | « Dune » en saga + ses livres isolés |
| N08 | Chercher `j k rowlin` en mode auteur | J.K. Rowling est trouvée |
| N09 | Chercher `la roue du temps` puis `journal d'un dégonflé`, regarder les couvertures | Noter les tomes dont la couverture est **absente, dessinée par défaut, identique à un autre tome ou approximative** (connu : Roue du temps, Journal d'un dégonflé) |
| N10 | Chercher `sandman` | Connu : défaut du fournisseur (75 numéros). **Noter seulement** si l'application plante ou devient lente |
| N11 | **Complément par d'autres sources** : après N01, regarder si l'application propose de retrouver un tome indisponible (Hunters of Dune) ou des livres que le catalogue n'a pas (préquelles de Dune, par exemple « Avant Dune ») par Google / Open Library / BnF | **Constat attendu à rapporter tel quel** : « le catalogue répond, l'application ne complète plus » est un défaut déjà évoqué le 5 octobre ; dire si c'est toujours vrai |

## 5. Vitesse

Sur émulateur, le réseau est celui du PC : **ce n'est pas représentatif d'un réseau mobile**. Mesurer quand même (chrono) et le dire :

| Mesure | Attendu (sur téléphone) | Relevé (émulateur) |
|---|---|---|
| Première recherche d'une saga jamais cherchée (ex. `le monde de narnia`) | ≤ 5 s | |
| Même recherche une seconde fois | ≤ 1 s | |
| Saisie ISBN (ou scan) jusqu'à la fiche | ≤ 3 s | |

## 6. Format du retour (à écrire dans `essai-emulateur\resultat.md`, puis résumer à Kinder)

1. **En une phrase** : l'application est-elle meilleure qu'au premier essai, et le problème principal restant.
2. **Tableau** : `# | OK / Gênant / KO | une phrase | capture`, pour G01 à G16 et N01 à N11. Les gestes non faisables à l'émulateur sont écrits « non faisable — à faire sur téléphone », jamais « OK » par défaut.
3. **À signaler en plus** : saga incomplète ou mal ordonnée (nom exact tapé) ; couverture fausse ou identique sur deux tomes ; livre cherché qui n'apparaît pas (nom exact tapé : il sera ajouté aux vraies recherches de Kinder).
4. **Ce qui sort de la mission** : tout défaut de l'**application** (pas du service) listé à part, avec la capture, sans correction.
5. **Version testée** : nom de la branche, identifiant du commit, date, appareil virtuel utilisé.

Kinder rapportera ce fichier dans la conversation du service (`vault-books-api`) : chaque ligne « Gênant » ou « KO » dont la cause est le service devient une correction là-bas ; celles qui viennent de l'application restent du côté de cette conversation.

## 7. Fin de mission

Remettre l'application dans l'état normal (catalogue activé, langue Français), arrêter l'émulateur si c'est cette conversation qui l'a lancé, ne rien laisser de modifié dans Vault Read **sauf accord de Kinder**, et dire à Kinder où sont `resultat.md` et les captures.
