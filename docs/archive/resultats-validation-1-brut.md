# Validation du catalogue — avant (2026-10-05)

Service : https://vault-books-api.vercel.app · 116 cas jouables · **71 réussis (61.2 %)**, 0 partiels, 45 échoués, 1 ignorés · axes réussis : 91.7 % · 547 s

| Cas | Requête | Résultat | Axes en défaut | Détail |
|---|---|---|---|---|
| S01 | harry potter | echoue | complet | 8 tomes rendus, 7 annoncés par le service, 7 attendus ; [serie] Harry Potter (7) — J.K. Rowling, Mary GrandPré |
| S02 | seigneur des anneaux | reussi |  | [serie] Le Seigneur des anneaux (3) — J.R.R. Tolkien |
| S03 | game of thrones | echoue | couverture, propre | [serie] Le Trône de fer (5) — George R.R. Martin |
| S04 | les chevaliers d'émeraude | reussi |  | [serie] Les Chevaliers d'Émeraude (12) — Anne Robillard |
| S05 | dune | echoue | complet | 6 tomes rendus, 8 annoncés par le service, 8 attendus ; [serie] Dune (6) — Frank Herbert |
| S06 | la roue du temps | echoue | sante | saga : HTTP 502 ; [serie] The Wheel of Time (14) — Robert Jordan |
| S07 | les annales du disque-monde | echoue | complet | 37 tomes rendus, 41 annoncés par le service, 35 à 41 attendus ; [serie] Discworld (41) — Terry Pratchett |
| S08 | fils des brumes | echoue | sante | HTTP 502 |
| S09 | eragon | echoue | complet | 5 tomes rendus, 5 annoncés par le service, 4 attendus ; [serie] The Inheritance Cycle (5) — Christopher Paolini |
| S10 | le sorceleur | echoue | complet | 4 tomes rendus, 5 annoncés par le service, 8 à 9 attendus ; [serie] The Witcher (5) — Andrzej Sapkowski, Danusia Stok |
| S11 | l'assassin royal | echoue | complet, propre | 17 tomes rendus, 17 annoncés par le service, 13 à 16 attendus ; [serie] L'Assassin royal (17) — Robin Hobb, Arnaud Mousnier-Lompré |
| S12 | le monde de narnia | echoue | complet | 3 tomes rendus, 7 annoncés par le service, 7 attendus ; [serie] The Chronicles of Narnia (Publication Order) (7) — C. S. Lewis, Pauline Baynes |
| S13 | a la croisée des mondes | reussi |  | [serie] His Dark Materials (3) — Philip Pullman |
| S14 | la passe-miroir | reussi |  | [serie] La Passe-Miroir (4) — Christelle Dabos, Hildegarde Serle |
| S15 | la quête d'ewilan | reussi |  | [serie] La Quête d'Ewilan (3) — Pierre Bottero |
| S16 | fondation | reussi |  | [serie] Foundation (7) — Isaac Asimov |
| S17 | hunger games | reussi |  | [serie] The Hunger Games (5) — Suzanne Collins |
| S18 | hypérion | echoue | complet | 4 tomes rendus, 5 annoncés par le service, 4 attendus ; [serie] Hyperion Cantos (4) — Dan Simmons |
| S19 | le problème à trois corps | echoue | complet | 4 tomes rendus, 4 annoncés par le service, 3 attendus ; [serie] Remembrance of Earth's Past (4) — Cixin Liu, Ken Liu |
| S20 | ender | echoue | complet | 2 tomes rendus, 6 annoncés par le service, 4 à 10 attendus ; [serie] Ender's Saga (6) — Orson Scott Card |
| S21 | millenium | echoue | complet, couverture | 8 tomes rendus, 8 annoncés par le service, 3 à 6 attendus ; [serie] Millennium (8) — Stieg Larsson |
| S22 | sherlock holmes | echoue | complet | 10 tomes rendus, 10 annoncés par le service, 9 attendus ; [serie] Sherlock Holmes (10) — Arthur Conan Doyle, Sidney Paget |
| S23 | hercule poirot | echoue | complet | 43 tomes rendus, 47 annoncés par le service, 33 à 40 attendus ; [serie] Hercule Poirot (48) — Agatha Christie |
| S24 | maigret | echoue | complet, propre | 74 tomes rendus, 75 annoncés par le service, 75 à 103 attendus ; [serie] Inspector Maigret (75) — Georges Simenon |
| S25 | jack reacher | echoue | complet | 20 tomes rendus, 31 annoncés par le service, 25 à 30 attendus ; [serie] Jack Reacher (30) — Lee Child |
| S26 | arsène lupin | echoue | complet, edition, couverture | 20 tomes rendus, 21 annoncés par le service, 15 à 25 attendus ; [serie] Arsène Lupin (21) — Maurice Leblanc, Michael Sims |
| S27 | journal d'un dégonflé | echoue | edition, couverture | [serie] Diary of a Wimpy Kid (20) — Jeff Kinney |
| S28 | percy jackson | echoue | complet | 8 tomes rendus, 8 annoncés par le service, 5 attendus ; [serie] Percy Jackson and the Olympians (7) — Rick Riordan |
| S29 | les royaumes de feu | echoue | complet | 16 tomes rendus, 16 annoncés par le service, 10 à 15 attendus ; [serie] Wings of Fire (16) — Tui T. Sutherland |
| S30 | geronimo stilton | echoue | complet | 81 tomes rendus, 82 annoncés par le service, 50 à 500 attendus ; [serie] Geronimo Stilton (85) — Geronimo Stilton |
| S31 | le club des cinq | reussi |  | [serie] The Famous Five (21) — Enid Blyton |
| I01 | germinal | reussi |  | [livre] Germinal — Émile Zola, Stanley Hochman |
| I02 | 1984 | reussi |  | [livre] 1984 — George Orwell, Peter Hobley Davison |
| I03 | l'étranger | reussi |  | [livre] L'étranger — Albert Camus, Matthew Ward |
| I04 | le petit prince | reussi |  | [livre] Le Petit Prince — Antoine de Saint-Exupéry |
| I05 | madame bovary | reussi |  | [livre] Madame Bovary — Gustave Flaubert, Sérgio Duarte |
| I06 | les misérables | reussi |  | [livre] Les Misérables — Victor Hugo, Christine Donougher |
| I07 | le comte de monte-cristo | reussi |  | [livre] Le Comte de Monte-Cristo I — Alexandre Dumas, Robin Buss |
| I08 | fahrenheit 451 | reussi |  | [serie] Fahrenheit 451 (5) — Ray Bradbury |
| I09 | le nom de la rose | reussi |  | [livre] Le Nom de la rose — Umberto Eco, William Weaver |
| I10 | crime et châtiment | echoue | trouve | auteur ou type attendu absent ; [livre] Crime et Châtiment — Fyodor Dostoevsky, Leonard Stanton |
| I11 | cent ans de solitude | reussi |  | [livre] Cent ans de solitude — Gabriel García Márquez |
| I12 | l'alchimiste | reussi |  | [livre] L'Alchimiste — Paulo Coelho |
| I13 | la ligne verte | reussi |  | [serie] The Green Mile (6) — Stephen King |
| I14 | la vérité sur l'affaire harry quebert | reussi |  | [serie] Marcus Goldman (3) — Joël Dicker, Sam Taylor |
| I15 | la fille de papier | reussi |  | [livre] La fille de papier — Guillaume Musso |
| I16 | stupeurs et tremblements | reussi |  | [livre] Stupeur et tremblements — Amélie Nothomb |
| I17 | soumission | reussi |  | [livre] Soumission — Michel Houellebecq, Lorin Stein |
| I18 | veiller sur elle | reussi |  | [livre] Veiller sur elle — Jean-Baptiste Andrea |
| I19 | l'amie prodigieuse | reussi |  | [serie] L'amica geniale (4) — Elena Ferrante, Ann Goldstein |
| I20 | kafka sur le rivage | reussi |  | [livre] Kafka sur le rivage — Haruki Murakami, Philip Gabriel |
| R01 | onyx storm | reussi |  | [livre] Onyx Storm — Rebecca Yarros |
| R02 | fourth wing | reussi |  | [serie] The Empyrean (3) — Rebecca Yarros |
| R03 | wind and truth (en) | reussi |  | [livre] Wind and Truth — Brandon Sanderson |
| R04 | the winds of winter (en) | reussi |  | [livre] The Winds of Winter — George R.R. Martin |
| R05 | houris | reussi |  | [livre] Houris — Kamel Daoud |
| R06 | intermezzo | reussi |  | [livre] Intermezzo — Sally Rooney |
| M01 | one piece | echoue | complet | 115 tomes rendus, 116 annoncés par le service, 100 à 120 attendus ; [serie] One Piece (116) — Eiichiro Oda, Andy Nakatani |
| M02 | naruto | echoue | complet | 71 tomes rendus, 72 annoncés par le service, 72 attendus ; [serie] Naruto [ナルト] (72) — Masashi Kishimoto |
| M03 | death note | reussi |  | [serie] Death Note (13) — Tsugumi Ohba, Takeshi Obata |
| M04 | l'attaque des titans | reussi |  | [serie] Attack on Titan (34) — Hajime Isayama, Hajime Isayama |
| M05 | fullmetal alchemist | reussi |  | [serie] Fullmetal Alchemist (27) — Hiromu Arakawa, Akira Watanabe |
| M06 | dragon ball | echoue | complet | 14 tomes rendus, 42 annoncés par le service, 34 à 42 attendus ; [serie] Dragon Ball (42 Books) (42) — Akira Toriyama |
| M07 | berserk | reussi |  | [serie] Berserk (43) — Kentaro Miura |
| B01 | astérix | echoue | complet | 39 tomes rendus, 41 annoncés par le service, 38 à 41 attendus ; [serie] Astérix (41) — René Goscinny, Albert Uderzo |
| B02 | tintin | echoue | complet | 18 tomes rendus, 25 annoncés par le service, 23 à 24 attendus ; [serie] Tintin (25) — Hergé, Leslie Lonsdale-Cooper |
| B03 | lucky luke | echoue | complet | 29 tomes rendus, 82 annoncés par le service, 70 à 110 attendus ; [serie] Lucky Luke (82) — Bob de Groot, Morris |
| B04 | blacksad | reussi |  | [serie] Blacksad (7) — Juan Díaz Canales, Juanjo Guarnido |
| B05 | gaston lagaffe | echoue | complet | 0 tomes rendus, 14 annoncés par le service, 19 à 20 attendus ; [serie] Gaston Classique (14) — André Franquin, Stellan Nehlmark |
| B06 | persepolis | reussi |  | [serie] Persepolis (4) — Marjane Satrapi |
| C01 | watchmen | reussi |  | [serie] Watchmen (12) — Alan Moore, Dave Gibbons |
| C02 | sandman | echoue | complet | 75 tomes rendus, 75 annoncés par le service, 10 à 12 attendus ; [serie] The Sandman (75) — Neil Gaiman, Colleen Doran |
| C03 | maus | reussi |  | [serie] Maus (2) — Art Spiegelman, Judith Ertel |
| C04 | the walking dead (en) | echoue | complet | 30 tomes rendus, 32 annoncés par le service, 32 à 33 attendus ; [serie] The Walking Dead (33) — Robert Kirkman, Tony Moore |
| C05 | saga (en) | echoue | complet | 14 tomes rendus, 14 annoncés par le service, 11 à 12 attendus ; [serie] Saga (12) — Fiona Staples, Brian K. Vaughan |
| A01 | tolkien | reussi |  | [serie] Middle Earth (4) |
| A02 | stephen king | reussi |  | [serie] The Shining (2) |
| A03 | amélie nothomb | reussi |  | [livre] Stupeur et tremblements |
| A04 | guillaume musso | reussi |  | [livre] Central Park |
| A05 | haruki murakami | reussi |  | [serie] Haruki Murakami Short Stories (38) |
| A06 | eiichiro oda | reussi |  | [serie] One Piece (116) |
| A07 | hergé | reussi |  | [serie] Tintin (25) |
| A08 | frank herbert | reussi |  | [serie] Dune (8) |
| A09 | nothomb | reussi |  | [livre] Stupeur et tremblements |
| A10 | j k rowlin | echoue | trouve, complet, trouveSaga |  |
| A11 | joël dicker | reussi |  | [serie] Marcus Goldman (3) |
| N01 | 9782070612758 | echoue | trouve |  |
| N02 | 0441172717 | reussi |  |  |
| N03 | 9780547928227 | reussi |  |  |
| N04 | A_RELEVER_979 | ignore |  |  |
| N05 | 9780000000002 | echoue | reponse |  |
| N06 | 123 | reussi |  |  |
| V01 | ça | reussi |  | [livre] Ca - tome 2 — Stephen King |
| V02 | éragon | echoue | complet | 5 tomes rendus, 5 annoncés par le service, 4 attendus ; [serie] The Inheritance Cycle (5) — Christopher Paolini |
| V03 | hobbit | reussi |  | [serie] Middle Earth (4) — J.R.R. Tolkien |
| V04 | le hobbit | reussi |  | [serie] Middle Earth (4) — J.R.R. Tolkien |
| F01 | harri poter | echoue | trouve | auteur ou type attendu absent ; [serie] Chronicles of the Overworld (4) — Licia Troisi |
| F02 | le seigneur des aneaux | reussi |  | [serie] Le Seigneur des anneaux (3) — J.R.R. Tolkien |
| F03 | hunger gamez | reussi |  | [serie] The Hunger Games (5) — Suzanne Collins |
| L01 | lord of the rings | echoue | trouve | [livre] The Lord of the Rings —  |
| L02 | the little prince | reussi |  | [livre] Le Petit Prince — Antoine de Saint-Exupéry |
| L03 | a song of ice and fire | echoue | propre | [serie] Le Trône de fer (5) — George R.R. Martin |
| L04 | le petit prince (en) | reussi |  | [livre] The Little Prince — Antoine de Saint-Exupéry |
| L05 | le seigneur des anneaux (en) | reussi |  | [serie] The Lord of the Rings (3) — J.R.R. Tolkien |
| L06 | game of thrones (en) | reussi |  | [serie] A Song of Ice and Fire (5) — George R.R. Martin |
| L07 | dune (en) | echoue | complet | 6 tomes rendus, 8 annoncés par le service, 6 à 8 attendus ; [serie] Dune (6) — Frank Herbert |
| L08 | harry potter (en) | echoue | complet | 8 tomes rendus, 7 annoncés par le service, 7 attendus ; [serie] Harry Potter (7) — J.K. Rowling, Mary GrandPré |
| K01 | harry potter coffret | reussi |  | [serie] Harry Potter (7) — J.K. Rowling, Mary GrandPré |
| K02 | le seigneur des anneaux intégrale | echoue | trouve | auteur ou type attendu absent |
| K03 | sherlock holmes intégrale | reussi |  | [livre] Le avventure di Sherlock Holmes: Ediz. integrale — Arthur Conan Doyle, A. Büchi |
| D01 | les fourmis | reussi |  | [serie] La Saga des Fourmis (3) — Bernard Werber |
| D02 | origine | reussi |  | [serie] Robert Langdon (6) — Dan Brown |
| D03 | inferno | reussi |  | [livre] Inferno — Dan Brown |
| D04 | la chute | reussi |  | [livre] La chute — Albert Camus, Justin O'Brien |
| T01 | it | reussi |  | [livre] Ca - tome 2 — Stephen King |
| T02 | nous | echoue | trouve | auteur ou type attendu absent ; [livre] Nous — Yevgeny Zamyatin, Clarence Brown |
| T03 | la peste | reussi |  | [livre] La peste — Albert Camus, Stuart Gilbert |