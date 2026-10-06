# Rapport — validation du catalogue Vault Books API

> Mission du 2026-10-05/06. Service en ligne : https://vault-books-api.vercel.app. Jeu : 117 cas (`test/fixtures-pertinence/requetes-kinder.json`), 116 jouables (l'ISBN 979 reste à relever). Critère de réussite validé par Kinder : voir `docs/resultats-validation-1.md` §1.

## Score global
| | Départ (5 oct.) | Après (6 oct., en ligne) |
|---|---|---|
| Cas réussis | **71/116 (61.2 %)** | **103/116 (88.8 %)** |
| Critères individuels réussis | 91.7 % | 97 % |
| Cas corrigés / régressions | — | 32 corrigés, 0 régression(s) |

Ce qui a changé en production : **3 corrections de données** (Harry Potter tome 8 exclu, Percy Jackson tome 8 exclu, alias « lord of the rings ») et **3 correctifs de code** (tomes rattachés à une autre saga retrouvés ; mots parasites « intégrale / coffret / tome N » retirés en cas de réponse faible ; auteur avec faute de frappe). 182 tests automatiques. Les attendus erronés du jeu (ISBN, nombres de tomes) ont été rectifiés avec leur source : ils expliquent une partie de la hausse.

## Limites qui restent (ce que Hardcover ne sait pas faire)
- **Sandman** : 75 numéros isolés au lieu de 10 volumes. **Lucky Luke** (70/82), **Gaston Lagaffe** (7/14), **Geronimo Stilton** (81/82), **Walking Dead** (31/32) : données incomplètes chez Hardcover ou au-delà du plafond du correctif (60 positions, 400 lignes).
- **Couvertures** : pour 5 sagas (Trône de fer, Roue du temps, Millenium, Arsène Lupin, Journal d'un dégonflé), ni Hardcover ni Open Library n'ont l'image de l'édition ; seule une image source fiable, fournie par Kinder, peut les remplacer (`npm run corriger -- couverture …`).
- **Fautes de frappe** doubles (« harri poter ») : non trouvées. Une seule faute passe.
- **La carte de recherche** affiche le total de l'index de recherche de Hardcover (« Dune (6) »), alors que la saga rend 8 tomes : à signaler côté application (se fier au détail de la saga).
- **Titres de tomes sans édition française** : restent dans la langue d'origine de Hardcover (ex. Dune tome 7 en italien) et sont marqués indisponibles.
- **Omnibus à position unique** (Maigret 19, Assassin royal 14) : laissés, pour ne pas créer de trou.
- Erreurs serveur (502) ponctuelles constatées avant correction (≈ 4 %/24 h) : cause non établie, journaux Vercel non lus ; à surveiller dans `/v1/status`.

## Tableau cas par cas
| Cas | Requête | Départ | Après | Bilan | Critères en défaut |
|---|---|---|---|---|---|
| S01 | harry potter | ÉCHOUÉ | réussi | **corrigé** |  |
| S02 | seigneur des anneaux | réussi | réussi | réussi |  |
| S03 | game of thrones | ÉCHOUÉ | ÉCHOUÉ | échoué | couverture |
| S04 | les chevaliers d'émeraude | réussi | réussi | réussi |  |
| S05 | dune | ÉCHOUÉ | réussi | **corrigé** |  |
| S06 | la roue du temps | ÉCHOUÉ | ÉCHOUÉ | échoué | couverture |
| S07 | les annales du disque-monde | ÉCHOUÉ | réussi | **corrigé** |  |
| S08 | fils des brumes | ÉCHOUÉ | réussi | **corrigé** |  |
| S09 | eragon | ÉCHOUÉ | réussi | **corrigé** |  |
| S10 | le sorceleur | ÉCHOUÉ | réussi | **corrigé** |  |
| S11 | l'assassin royal | ÉCHOUÉ | ÉCHOUÉ | échoué | complet, propre |
| S12 | le monde de narnia | ÉCHOUÉ | réussi | **corrigé** |  |
| S13 | a la croisée des mondes | réussi | réussi | réussi |  |
| S14 | la passe-miroir | réussi | réussi | réussi |  |
| S15 | la quête d'ewilan | réussi | réussi | réussi |  |
| S16 | fondation | réussi | réussi | réussi |  |
| S17 | hunger games | réussi | réussi | réussi |  |
| S18 | hypérion | ÉCHOUÉ | réussi | **corrigé** |  |
| S19 | le problème à trois corps | ÉCHOUÉ | réussi | **corrigé** |  |
| S20 | ender | ÉCHOUÉ | réussi | **corrigé** |  |
| S21 | millenium | ÉCHOUÉ | ÉCHOUÉ | échoué | couverture |
| S22 | sherlock holmes | ÉCHOUÉ | réussi | **corrigé** |  |
| S23 | hercule poirot | ÉCHOUÉ | réussi | **corrigé** |  |
| S24 | maigret | ÉCHOUÉ | ÉCHOUÉ | échoué | complet, propre |
| S25 | jack reacher | ÉCHOUÉ | réussi | **corrigé** |  |
| S26 | arsène lupin | ÉCHOUÉ | ÉCHOUÉ | échoué | complet, edition, couverture |
| S27 | journal d'un dégonflé | ÉCHOUÉ | ÉCHOUÉ | échoué | edition, couverture |
| S28 | percy jackson | ÉCHOUÉ | réussi | **corrigé** | complet |
| S29 | les royaumes de feu | ÉCHOUÉ | réussi | **corrigé** |  |
| S30 | geronimo stilton | ÉCHOUÉ | ÉCHOUÉ | échoué | complet |
| S31 | le club des cinq | réussi | réussi | réussi |  |
| I01 | germinal | réussi | réussi | réussi |  |
| I02 | 1984 | réussi | réussi | réussi |  |
| I03 | l'étranger | réussi | réussi | réussi |  |
| I04 | le petit prince | réussi | réussi | réussi |  |
| I05 | madame bovary | réussi | réussi | réussi |  |
| I06 | les misérables | réussi | réussi | réussi |  |
| I07 | le comte de monte-cristo | réussi | réussi | réussi |  |
| I08 | fahrenheit 451 | réussi | réussi | réussi |  |
| I09 | le nom de la rose | réussi | réussi | réussi |  |
| I10 | crime et châtiment | ÉCHOUÉ | réussi | **corrigé** |  |
| I11 | cent ans de solitude | réussi | réussi | réussi |  |
| I12 | l'alchimiste | réussi | réussi | réussi |  |
| I13 | la ligne verte | réussi | réussi | réussi |  |
| I14 | la vérité sur l'affaire harry quebert | réussi | réussi | réussi |  |
| I15 | la fille de papier | réussi | réussi | réussi |  |
| I16 | stupeurs et tremblements | réussi | réussi | réussi |  |
| I17 | soumission | réussi | réussi | réussi |  |
| I18 | veiller sur elle | réussi | réussi | réussi |  |
| I19 | l'amie prodigieuse | réussi | réussi | réussi |  |
| I20 | kafka sur le rivage | réussi | réussi | réussi |  |
| R01 | onyx storm | réussi | réussi | réussi |  |
| R02 | fourth wing | réussi | réussi | réussi |  |
| R03 | wind and truth (en) | réussi | réussi | réussi |  |
| R04 | the winds of winter (en) | réussi | réussi | réussi |  |
| R05 | houris | réussi | réussi | réussi |  |
| R06 | intermezzo | réussi | réussi | réussi |  |
| M01 | one piece | ÉCHOUÉ | réussi | **corrigé** |  |
| M02 | naruto | ÉCHOUÉ | réussi | **corrigé** |  |
| M03 | death note | réussi | réussi | réussi |  |
| M04 | l'attaque des titans | réussi | réussi | réussi |  |
| M05 | fullmetal alchemist | réussi | réussi | réussi |  |
| M06 | dragon ball | ÉCHOUÉ | réussi | **corrigé** |  |
| M07 | berserk | réussi | réussi | réussi |  |
| B01 | astérix | ÉCHOUÉ | réussi | **corrigé** |  |
| B02 | tintin | ÉCHOUÉ | réussi | **corrigé** |  |
| B03 | lucky luke | ÉCHOUÉ | ÉCHOUÉ | échoué | complet |
| B04 | blacksad | réussi | réussi | réussi |  |
| B05 | gaston lagaffe | ÉCHOUÉ | ÉCHOUÉ | échoué | complet |
| B06 | persepolis | réussi | réussi | réussi |  |
| C01 | watchmen | réussi | réussi | réussi |  |
| C02 | sandman | ÉCHOUÉ | ÉCHOUÉ | échoué | complet |
| C03 | maus | réussi | réussi | réussi |  |
| C04 | the walking dead (en) | ÉCHOUÉ | ÉCHOUÉ | échoué | complet |
| C05 | saga (en) | ÉCHOUÉ | réussi | **corrigé** |  |
| A01 | tolkien | réussi | réussi | réussi |  |
| A02 | stephen king | réussi | réussi | réussi |  |
| A03 | amélie nothomb | réussi | réussi | réussi |  |
| A04 | guillaume musso | réussi | réussi | réussi |  |
| A05 | haruki murakami | réussi | réussi | réussi |  |
| A06 | eiichiro oda | réussi | réussi | réussi |  |
| A07 | hergé | réussi | réussi | réussi |  |
| A08 | frank herbert | réussi | réussi | réussi |  |
| A09 | nothomb | réussi | réussi | réussi |  |
| A10 | j k rowlin | ÉCHOUÉ | réussi | **corrigé** |  |
| A11 | joël dicker | réussi | réussi | réussi |  |
| N01 | 9782070541270 | ÉCHOUÉ | réussi | **corrigé** |  |
| N02 | 0441172717 | réussi | réussi | réussi |  |
| N03 | 9780547928227 | réussi | réussi | réussi |  |
| N04 | A_RELEVER_979 | ignoré | ignoré | ignoré |  |
| N05 | 9789999999991 | ÉCHOUÉ | réussi | **corrigé** |  |
| N06 | 123 | réussi | réussi | réussi |  |
| V01 | ça | réussi | réussi | réussi |  |
| V02 | éragon | ÉCHOUÉ | réussi | **corrigé** |  |
| V03 | hobbit | réussi | réussi | réussi |  |
| V04 | le hobbit | réussi | réussi | réussi |  |
| F01 | harri poter | ÉCHOUÉ | ÉCHOUÉ | échoué | rapide, trouve |
| F02 | le seigneur des aneaux | réussi | réussi | réussi |  |
| F03 | hunger gamez | réussi | réussi | réussi |  |
| L01 | lord of the rings | ÉCHOUÉ | réussi | **corrigé** |  |
| L02 | the little prince | réussi | réussi | réussi |  |
| L03 | a song of ice and fire | ÉCHOUÉ | réussi | **corrigé** |  |
| L04 | le petit prince (en) | réussi | réussi | réussi |  |
| L05 | le seigneur des anneaux (en) | réussi | réussi | réussi |  |
| L06 | game of thrones (en) | réussi | réussi | réussi |  |
| L07 | dune (en) | ÉCHOUÉ | réussi | **corrigé** |  |
| L08 | harry potter (en) | ÉCHOUÉ | réussi | **corrigé** |  |
| K01 | harry potter coffret | réussi | réussi | réussi |  |
| K02 | le seigneur des anneaux intégrale | ÉCHOUÉ | réussi | **corrigé** |  |
| K03 | sherlock holmes intégrale | réussi | réussi | réussi |  |
| D01 | les fourmis | réussi | réussi | réussi |  |
| D02 | origine | réussi | réussi | réussi |  |
| D03 | inferno | réussi | réussi | réussi |  |
| D04 | la chute | réussi | réussi | réussi |  |
| T01 | it | réussi | réussi | réussi |  |
| T02 | nous | ÉCHOUÉ | réussi | **corrigé** |  |
| T03 | la peste | réussi | réussi | réussi |  |
