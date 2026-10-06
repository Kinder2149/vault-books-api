# Validation du catalogue — mesure 1 (état de départ) et reprise

> Mission lancée le 2026-10-05, à la suite de l'essai sur téléphone (« Dune » rend 6 tomes sur 8, suites rangées dans « Dune Sequels », « Hunters of Dune » caché ; aucun livre isolé ni préquelle).
> Branche de travail : **`validation-catalogue`** (jamais `main` avant l'accord explicite de Kinder).
> Phase de cadrage : étape en phase 6 (implémentation). **Cadrage validé par Kinder le 2026-10-05.**

## 1. Le critère de réussite (validé)

Une recherche est **satisfaisante** si, dans la langue demandée :
1. **Trouvé** : le bon livre ou la bonne saga est en 1re carte (2e ou 3e = partiel).
2. **Complet** : tous les tomes de la saga principale, sans doublon d'édition ; un tome sans édition française reste **visible et marqué indisponible**, jamais caché.
3. **Bon ordre** : ordre de parution, sans tome manquant au milieu.
4. **Bonne édition** : bonne langue, pas de mélange d'éditeurs ni de traduction découpée.
5. **Bonne couverture** : réelle, propre au tome, non partagée, jamais dessinée par défaut.
6. **Rien de parasite** : pas de coffret pris pour un tome, pas d'homonyme devant le bon livre ; réponse sans erreur en moins de 3 s.

Résultat d'un cas : **réussi** (tous les axes applicables bons) · **partiel** (seulement rang 2-3, couverture ≤ 10 % en défaut, lenteur) · **échoué**.
**Règle d'univers (validée)** : une saga réunit le cycle original et ses suites officielles, en ordre de parution (cas Dune : 6 + 2 = 8), avec les tomes sans édition française visibles et marqués indisponibles. Correction par fusion de sagas dans `data/overrides.json` / Supabase, pas par le code.

## 2. Le jeu et le lanceur

- Jeu : `test/fixtures-pertinence/requetes-kinder.json` — **117 cas** (31 sagas, 20 livres isolés, 6 récents, 18 manga/BD/comics, 11 auteurs, 6 ISBN, 7 accents/article/fautes, 8 langue croisée / `lang=en`, 10 coffrets/doublons/ambigus). Chaque cas porte son attendu et sa `source` ; **40 cas sont `a_verifier`** (source externe nommée à consulter).
- Lanceur : `scripts/validation-catalogue.mjs` (lecture seule, appels espacés de 2,2 s, ≈ 9 min pour tout le jeu, clé jamais affichée).
- Diagnostic d'une saga : `scripts/diag-saga.mjs` (tomes rendus / annoncés, positions manquantes).

```bash
# depuis vault-books-api ; --env-file pointe un .env contenant APP_KEY ou VITE_VAULT_API_KEY
node --env-file="..\..\Vault Read\client\.env" scripts/validation-catalogue.mjs --nom apres
node --env-file="..\..\Vault Read\client\.env" scripts/validation-catalogue.mjs --nom essai --filtre S05,L07   # quelques cas (ou un préfixe : S, M, B…)
node --env-file="..\..\Vault Read\client\.env" scripts/diag-saga.mjs "dune" "naruto" "dune@en"
```
Sorties : `sorties/validation-<nom>.md` et `.json` (dossier non versionné). La mesure de départ est conservée ici : `docs/resultats-validation-1-brut.md` (tableau cas par cas) et `test/fixtures-pertinence/mesures/validation-avant.json` (détail complet).

## 3. Résultat de la mesure de départ (2026-10-05, service en ligne)

**71 réussis sur 116 jouables (61,2 %)**, 0 partiel, 45 échoués ; 91,7 % des axes individuels réussis. 175 tests automatiques : tous passent.

| Domaine | Résultat |
|---|---|
| Livres isolés, récents, doublons de titre, article de tête | quasi tous réussis |
| Recherche par auteur | 10/11 |
| Sagas fantasy longues | 2/11 · policier 0/6 · SF 2/5 · jeunesse 1/5 |
| Mangas, BD, comics | 8/17 |

### Causes des échecs
1. **Attendu faux (7, déjà corrigés dans le jeu)** : ISBN Harry Potter (c'était *Le Petit Prince* ; le bon : `9782070541270`, vérifié en ligne), « Eragon » = 5 tomes (*Murtagh*), « Dostoïevski/Zamiatine » graphies, Percy Jackson et *Trois corps* en fourchette. **À rejouer** : N01 et N05 (nouvel ISBN « inexistant » `9789999999991` jamais testé ; l'ancien existait chez Hardcover).
2. **Tomes manquants (~15 sagas)** : le service annonce un total (`totalPrincipal`) mais rend moins de tomes : Narnia 3/7, Gaston Lagaffe 0/14, Lucky Luke 29/82, Dragon Ball 14/42, Dune 6/8, Ender 2/6, Tintin 18/25, Jack Reacher 20/31, Sorceleur 4/5, Naruto 71/72 (tome 20 absent)… **Hypothèse forte, non confirmée** : `src/sources/hardcover.js` (requête de saga, ≈ ligne 189) filtre `book_series(where: {featured: {_eq: true}, position: {_gte: 1}, …})` → un livre dont la saga « mise en avant » est une autre disparaît ; `position ≥ 1` écarte aussi les tomes 0 / 0,5. À confirmer avec la clé Hardcover.
3. **Intrus dans les sagas (4)** : intégrales dans *Le Trône de fer* (S03, L03) et *L'Assassin royal* (S11), omnibus dans *Maigret* (S24) ; « tome 8 » lituanien dans Harry Potter (S01, L08) ; « Untitled #8 » dans Percy Jackson. → `exclurePositions` (donnée).
4. **Couvertures approximatives (5)** : Trône de fer (1), Millenium (1), Arsène Lupin (1 + 1 édition d'une autre langue), *Journal d'un dégonflé* (4 sur 16 + 1 autre langue), Roue du temps (1 absente, 2 approximatives).
5. **Défauts de recherche (4, code)** : « lord of the rings » en `lang=fr` → livres anglais d'abord, saga en 5e (derrière une adaptation radio) ; « le seigneur des anneaux intégrale » → **0 résultat** (piste : si 0 résultat, retenter sans le dernier mot) ; « j k rowlin » → un auteur inexistant retenu, 0 carte ; « harri poter » (2 fautes) → non trouvé (limite acceptable).
6. **502 ponctuels (2)** au premier passage, absents au rejeu (S06 saga, S08) ; correspond aux 4 % d'erreurs serveur de `/v1/status`. Journaux Vercel : la requête MCP a dépassé le délai ; à relire depuis le tableau de bord Vercel (Logs, filtre 5xx) ou la table `request_log` de Supabase (`select at, route, statut, erreur from request_log where statut >= 500 order by at desc`).
7. **Attendus à vérifier avant d'en faire des défauts** : Poirot, Maigret, Sherlock Holmes (10 dont 4 indisponibles), Sandman (75 rendus !), One Piece, Astérix, Tintin, Disque-monde, Jack Reacher, Royaumes de feu, Millenium (8 rendus pour 3 à 6 attendus), Hypérion (5 annoncés).

## 3 bis. Mesure 2 — après le correctif « tomes manquants » (2026-10-06, copie locale du service, correctif non déployé)

**85 réussis sur 116 (73,3 %)**, 3 partiels, 28 échoués ; axes 93,5 %. (Départ : 71 réussis, 61,2 %. La hausse mêle le correctif de code et 7 attendus erronés rectifiés dans le jeu.) Détail : `docs/resultats-validation-1-apres1-brut.md`, `test/fixtures-pertinence/mesures/validation-apres1.json`.

**Cause n°2 CONFIRMÉE** (clé Hardcover rebâtie, requête réelle comparée) : `serie()` ne gardait que les livres dont la saga est la saga « mise en avant » (`featured`). Sans ce filtre : Dune 8/8 (6 avant), Narnia 7/7 (3), Ender 6/6 (2), Naruto 72/72 (71), Sorceleur 6 (4).
**Correctif (commit `e91fc2e`, branche seulement)** : dans `src/sources/hardcover.js`, si des positions entières manquent par rapport au total annoncé, 2e requête limitée à ces positions, sans le filtre ; 0 appel de plus pour une saga complète ; panne de la 2e requête = saga inchangée. 3 tests ajoutés (`test/hardcover.test.js`) : le principal échouait avant, passe après ; suite complète **178/178**. Constaté : Dune rend maintenant 8 tomes, les tomes 7 et 8 (suites) marqués indisponibles faute d'édition française trouvée, **visibles** comme le demande le critère.
**Limites du correctif** : jusqu'à 60 positions manquantes / 400 lignes par saga ; restent incomplètes les très grandes séries : Lucky Luke 70/82, Gaston 7/14, Geronimo Stilton 81/82, Maigret 74/75, Walking Dead 31/32. Les tomes 0 et 0,5 (préquelles) restent écartés (`position ≥ 1`). Le titre d'un tome sans édition française est parfois en italien/anglais (ex. Dune 7).

### Ce qui échoue encore (28 cas)
- **Intrus à exclure par donnée** (`exclurePositions`) : Trône de fer (S03, L03 : intégrales), Assassin royal (S11), Maigret (S24, omnibus), Harry Potter tome 8 lituanien (S01, L08), Percy Jackson tome 8 vide (S28).
- **Couvertures** (donnée) : S03, S06, S21, S26, S27.
- **Attendus à vérifier avant d'y voir un défaut** (rendu = annoncé par Hardcover) : Sorceleur, Hypérion, Millenium, Sherlock Holmes, Poirot, Jack Reacher, Royaumes de feu, Tintin, Sandman (75 rendus !), Saga (comics), Walking Dead.
- **Recherche (code)** : L01 « lord of the rings » (alias), K02 « … intégrale » (0 résultat), A10 « j k rowlin », F01 « harri poter » ; F02, F03, K03 sont seulement « lents » (> 3 s) parce que la copie locale démarre à froid : à remesurer en ligne.

## 3 ter. Mesure 3 — après corrections de données et correctifs de recherche (2026-10-06, copie locale du code + corrections de la base)

**100 réussis sur 116 (86,2 %)**, 3 partiels, 13 échoués ; axes 96,4 %. Détail : `docs/resultats-validation-1-apres2-brut.md`, `test/fixtures-pertinence/mesures/validation-apres2.json`. Suite de tests : **182/182**.

**Corrections de DONNÉES appliquées en production le 2026-10-06** (`npm run corriger`, réversibles ; sauvegardées dans `data/overrides.json`) :
| Quoi | Pourquoi |
|---|---|
| Série 1185 (Harry Potter) : exclure la position 8 | pièce de théâtre en lituanien, hors des 7 tomes annoncés |
| Série 5193 (Percy Jackson) : exclure la position 8 | espace réservé « Untitled #8 » sans édition |
| Alias « lord of the rings » → « le seigneur des anneaux » | en `lang=fr`, la saga arrivait 5e derrière des livres anglais |
Vérifiés en ligne : S01, L08, L01, L03, S28 passent.
**Non corrigés volontairement** : « L'Intégrale 1…5 » du Trône de fer = vrais titres d'éditions (mon test les prenait à tort pour des coffrets, corrigé dans le lanceur) ; Maigret tome 19 (omnibus) et Assassin royal tome 14 : seul candidat à cette position, l'exclure ferait un trou.

**Correctifs de CODE (branche seulement, non déployés)** — chacun avec test écrit avant :
1. `e91fc2e` tomes rattachés à une autre saga (voir mesure 2).
2. `2a0181d` **mots parasites** : « … intégrale », « coffret », « tome 2 », « saga » en tête/fin de requête sont retirés pour un essai supplémentaire quand la réponse est faible (« le seigneur des anneaux intégrale » ne rendait rien).
3. dernier commit : **auteur avec faute** (« j k rowlin ») : un auteur quasi inconnu (≤ 2 livres) qui contient exactement les mots tapés ne l'emporte plus sur un vrai auteur (≥ 50 livres) parmi les candidats.

### Attendus vérifiés auprès de sources externes (2026-10-06)
Sorceleur (5 romans + recueils, jusqu'à 8), Hypérion (4 romans, +1 novella), Millenium (6 romans + 2 de Smirnoff), Sherlock Holmes (4 romans + 5 recueils = 9), Poirot (33 romans + nouvelles), Jack Reacher (30 parus, 31e en oct. 2026), Royaumes de feu (≥ 14), Tintin (23 albums + Alph-Art + Lac aux requins), Saga comics (12 parus + 13, 14 annoncés). Ajustés dans le jeu avec leur source.

### Les 13 échecs qui restent
| Cas | Cause | Détail |
|---|---|---|
| C02 Sandman | **Hardcover** | 75 numéros isolés au lieu de 10 volumes (titres mêlés) : pas réparable par exclusion |
| B03 Lucky Luke 70/82, B05 Gaston 7/14, S30 Geronimo 81/82, C04 Walking Dead 31/32 | **limite du correctif** (60 positions / 400 lignes) ou Hardcover incomplet | à examiner ; Gaston est aussi lent (> 3 s) |
| S24 Maigret, S11 Assassin royal | intrus (omnibus) à une position unique | choix : laisser (pas de trou) ; attendu de S11 (13 à 16) à vérifier (BnF) |
| S03, S06, S21, S26, S27 | **couverture** approximative ou absente (Hardcover/Open Library n'ont pas l'image de l'édition) | `corriger couverture` exige une image source fiable et libre ; non fait |
| S26 (édition « autre langue ») | **proxy du lanceur** : un ISBN 978-1 (Createspace) peut être du français | à affiner |
| F01 « harri poter » | **limite Hardcover** (2 fautes) | acceptée |
| F02, F03, K02 « partiels » | lenteur > 3 s sur la copie locale à froid | à remesurer en ligne après déploiement |

## 4. Ce qui reste à faire (dans l'ordre)

1. ~~Récupérer le `.env` du service~~ **Fait le 2026-10-06** (clés Hardcover et Supabase copiées depuis leurs tableaux de bord, testées ; `.env` ignoré par git ; à copier sur la clé USB en fin de journée). Sur un autre poste : recopier ce `.env` dans `vault-books-api/` (`HARDCOVER_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `APP_KEY`).
1 bis. ~~Confirmer la cause des tomes manquants et la corriger par le code~~ **Fait** (voir mesure 2), non déployé.
2. Relever un ISBN 979-10 réel (BnF) pour le cas N04 ; rejouer N01 et N05.
3. Vérifier les attendus `a_verifier` auprès d'une source externe (BnF, Wikipédia, éditeur), corriger le jeu, ne compter comme défaut que ce qui l'est.
4. **Corriger par les données** (`npm run corriger -- …`, voir `docs/exploitation.md` §6) : fusion Dune + Dune Sequels, exclusion des intrus (n°3), couvertures (n°4), alias de recherche (`lord of the rings` → `le seigneur des anneaux`).
5. **Corriger par le code seulement si les données ne suffisent pas** — chaque modification : cadrage court, test qui échoue avant, test qui passe après, suite complète. Candidats : filtre `featured` de la requête de saga (n°2), repli « 0 résultat → retirer le dernier mot » (n°5), tolérance de faute sur le nom d'auteur.
6. Rejouer tout le jeu (`--nom apres`), produire le **rapport final** : tableau cas par cas (réussi / échoué / corrigé), score avant/après, limites restantes (ce que Hardcover ne sait pas faire).
7. Fusion dans `main` **uniquement sur accord explicite de Kinder** (déploiement automatique sur Vercel), puis suppression de la branche.
8. Kinder ajoute ses 30 vraies recherches au même fichier de jeu.

## 5. Pièges rencontrés

- **Node 24** : `node --test test/` échoue (le dossier est lu comme un module) et `node --test` seul ramasse `scripts/test-c.mjs` (script réseau). Utiliser **`node --test test/*.test.js`** → 175 tests, 0 échec. (La CI GitHub, en Node 20, garde `node --test test/`.)
- La route `/v1/isbn/…` rend **200** (`trouve: true`) pour tout ISBN que Hardcover connaît, même sans édition ni couverture (ex. `9780000000002` = un vieux roman). Un ISBN de forme invalide (clé de contrôle fausse) rend 400.
- Le quota Hardcover : ≈ 3 000 appels restants sur 5 000 au 2026-10-05 après-midi ; le jeu complet en consomme peu (réponses en cache), mais espacer les appels.
