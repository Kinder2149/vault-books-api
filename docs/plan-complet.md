# Plan complet — de « ça marche » à « on peut publier »

> Établi le 2026-10-05 à partir du bilan d'état (service en ligne, 84 tests, branche Vault Read `feature/catalogue-api` non fusionnée).
> Chaque point a un **critère de réussite vérifiable** : la règle du projet reste « aucune amélioration n'est acquise sans un chiffre avant/après ».
> Tailles : **S** < 1 h · **M** 1 à 3 h · **L** une demi-journée ou plus (temps de travail de Claude, hors attentes).
> Qui : **C** = Claude · **K** = Kinder (compte, clé, essai téléphone, décision). Les clés ne sont jamais saisies par Claude.

## 0. Où on en est (faits mesurés)

| | État |
|---|---|
| Service | En ligne (Vercel + Supabase + Hardcover/BnF/Open Library) ; fumée 14/14 ; 0 erreur depuis le limiteur de débit |
| Routes | `/v1/search`, `/v1/series/:id`, `/v1/books/:id`, `/v1/isbn/:isbn`, `/v1/health` |
| Qualité mesurée | Pertinence 13/13 requêtes, 3/3 sagas de référence ; couvertures réelles 100 / 100 / 95 % ; ~40 requêtes variées essayées à la main |
| Vault Read | Branche `feature/catalogue-api` (358 tests) : recherche, éditions, scan d'ISBN ; **jamais essayée sur téléphone, non fusionnée** |
| Risque immédiat | **Supabase gratuit se met en pause après ~7 jours sans appel** (échéance ≈ 12 octobre) ; 101 entrées de cache sur 129 sont mortes |

## 1. Inventaire de ce qui manque

| # | Manque | Domaine | Gravité |
|---|---|---|---|
| 1 | Aucune tâche d'entretien (garder Supabase actif, purger le cache) | Exploitation | **Haute** |
| 2 | Aucune supervision (journal des appels, alerte, état des sources) | Exploitation | **Haute** |
| 3 | Quota Hardcover non suivi (5 000 requêtes/jour, 60/min) ; aucune limite par client | Exploitation | Moyenne |
| 4 | Pas d'intégration continue (rien n'empêche de déployer un code qui casse) | Exploitation | Moyenne |
| 5 | Corrections manuelles : seule sauvegarde = la base Supabase, aucun outil pratique | Exploitation | Moyenne |
| 6 | Noms de sagas en anglais sans correction manuelle (« The Kingkiller Chronicle ») | Données | **Haute** (impact visible) |
| 7 | Requêtes « auteur + titre » mal classées (« stephen king ça ») | Données | Moyenne |
| 8 | Recherche par auteur non branchée (Vault Read utilise encore Google) | Données | Moyenne |
| 9 | Pas de résumé (description) | Données | Basse |
| 10 | Couvertures mesurées sur 3 sagas seulement ; pas de contrôle périodique ; trous connus (Trône de fer 5.3) | Données | Moyenne |
| 11 | Jeu de pertinence trop petit (~40 requêtes) ; anglais peu testé | Données | Moyenne |
| 12 | Fraîcheur jamais mesurée (« un livre qui sort demain ») ; capacité jamais mesurée | Mesure | Moyenne |
| 13 | Essai sur téléphone ; fusion ; branche concurrente `claude/search-results-saga-…` à arbitrer | Intégration | **Haute** |
| 14 | Hors ligne : les résultats du catalogue ne sont pas archivés (l'archive 7 jours ne retient que les anciennes sources) | Intégration | Moyenne |
| 15 | Format API/app non verrouillé par un test commun (risque de dérive silencieuse) | Intégration | Moyenne |
| 16 | Clé d'application extractible d'un APK ; aucun plan de rotation | Sécurité | Moyenne |
| 17 | Hardcover : stockage du catalogue, usage commercial, attribution, retrait d'images (DMCA) | Juridique | **Haute avant publication** |
| 18 | Vie privée : l'app envoie désormais les recherches à NOTRE service (et à Vercel, Supabase, Hardcover) ; la promesse « rien ne quitte l'appareil » doit être réécrite | Juridique | **Haute avant publication** |
| 19 | Offres gratuites non commerciales (Vercel Hobby, Hardcover gratuit) si Vault Read devient commercial | Juridique | Selon le projet |
| 20 | Documentation périmée (architecture, contexte) ; dossier `prototype/` et clé Google à nettoyer | Documentation | Moyenne |
| 21 | Aucun runbook (que faire si Hardcover tombe, Supabase est en pause, une clé fuit) | Documentation | Moyenne |

## 2. Phases

### Phase 0 — Remise à plat (immédiat, ~1 session) · C, un geste de K

| Tâche | Réf. | Taille | Qui | Critère de réussite |
|---|---|---|---|---|
| Réécrire `architecture-fonctionnement.md` et le haut de `PROJET_CONTEXTE.md` pour décrire **ce qui existe** (pas le plan initial) | 20 | M | C | Aucune table ou mécanisme cité qui n'existe pas ; relu par recoupement avec le code |
| Nettoyer : retirer ou archiver `prototype/` (scripts jetables), garder les mesures dans `docs/` ; supprimer la clé Google de `.env` | 20 | S | C / K | `git grep` sans clé ; `prototype/` ne dépend plus d'un chemin hors dépôt |
| Régénérer ou supprimer la clé Google collée dans le chat | 20 | S | **K** | Clé révoquée dans Google Cloud |
| Intégration continue : GitHub Actions lance `npm test` à chaque push (API) et à chaque push de branche (Vault Read, `npx vitest run`) | 4 | M | C | Un test volontairement cassé fait échouer l'action ; e-mail GitHub reçu |
| **Écrire à Hardcover** (Discord ou e-mail) : cache/stockage du catalogue, usage dans une application publique, attribution, DMCA. Je rédige le message. | 17 | S | C rédige, **K** envoie | Message envoyé ; réponse archivée dans `docs/conformite.md` (le délai de réponse est externe : on le lance tôt) |

### Phase 1 — Exploitation et fiabilité (avant tout usage réel) · ~2 sessions

| Tâche | Réf. | Taille | Qui | Critère de réussite |
|---|---|---|---|---|
| **Entretien quotidien** : route `/api/entretien` appelée par une tâche planifiée (Vercel Cron ; limite du plan gratuit à vérifier dans la doc à ce moment-là). Elle lit Supabase (garde le projet actif), **purge** les entrées d'anciennes versions et celles plus vieilles que 30 jours (60 à l origine ; voir la mesure de capacité), enregistre la taille de la base | 1 | M | C ; **K** ajoute la variable `CRON_SECRET` dans Vercel | Après 48 h : tâche exécutée 2 fois, entrées mortes = 0, appel sans secret refusé (401) |
| **Journal des appels** : table `request_log` (route, statut, durée, cache frais/périmé/absent, source utilisée, erreur). **Aucun texte de recherche, aucune IP** (voir 18) ; conservation 30 jours | 2, 18 | M | C | Requête SQL « taux d'erreur et latence p50/p95 sur 24 h » fonctionne ; vérifié qu'aucune donnée personnelle n'est écrite |
| **État détaillé** `/v1/status` (protégé) : Supabase lisible, Hardcover joignable, BnF joignable, âge du cache, requêtes Hardcover du jour | 2 | M | C | Réponse correcte avec une source simulée en panne (test) |
| **Surveillance externe** : un moniteur gratuit (p. ex. UptimeRobot) interroge `/v1/health` toutes les 5 min et prévient par e-mail | 2 | S | **K** (compte) + C (doc) | E-mail reçu lors d'une panne provoquée |
| **Garde du quota Hardcover** : lecture des en-têtes `RateLimit`, compteur du jour ; à 80 %, le service ne sert plus que le cache (réponse signalée) | 3 | M | C | Test avec en-têtes simulés ; message clair côté app (repli sur anciennes sources) |
| **Limite par client** : quota d'appels par minute/jour par clé d'application et par IP (compteur Supabase ou règle du pare-feu Vercel, à trancher selon ce que le plan gratuit permet) | 3, 16 | M | C | Test de charge court : le 61ᵉ appel/minute reçoit 429, les autres passent |
| **Sauvegarde des corrections** : export quotidien de `series_overrides` et `cover_overrides` vers `data/overrides.json` (fichier versionné = copie de secours, aussi utilisé en repli) | 5 | M | C | Suppression volontaire d'une ligne de test → restaurée depuis le fichier |
| **Outil de correction** : commandes `npm run corriger -- serie 981 --nom-fr "…"`, `… couverture isbn 978… <url>` qui écrivent dans Supabase et vérifient l'image | 5, 10 | M | C | Une correction faite en 1 commande apparaît en ligne dans les 5 minutes |
| **Runbook** `docs/exploitation.md` : Hardcover en panne, Supabase en pause, clé divulguée (rotation `APP_KEY`, `HARDCOVER_API_KEY`), restauration, calendrier d'expiration de la clé Hardcover | 21, 16 | M | C | Chaque scénario a des commandes exactes ; un scénario joué à blanc |

### Phase 2 — Qualité des données · ~3 à 4 sessions

| Tâche | Réf. | Taille | Qui | Critère de réussite |
|---|---|---|---|---|
| **Noms français des sagas** : script qui liste les 150 séries les plus consultées/populaires (journal + Hardcover) et propose un nom français déduit des éditions françaises ; **Kinder valide la liste** ; import dans `series_overrides` | 6 | L | C ; **K** valide (≈ 20 min) | Les 100 sagas les plus fréquentes s'affichent avec un nom français ; test de non-régression |
| **Auteur + titre** : détecter le nom d'auteur dans la requête (comparaison avec les auteurs des résultats), le retirer du calcul de titre et s'en servir comme filtre | 7 | M | C | « stephen king ça », « tolkien hobbit », « werber fourmis » rendent le bon livre/la bonne saga en tête ; ajoutés au jeu de tests |
| **Jeu de pertinence élargi** : 100 requêtes (classiques, manga, BD, jeunesse, SF/fantasy, non-fiction, titres homonymes, fautes de frappe, anglais) avec résultat attendu. **Kinder fournit 30 recherches réelles** (historique de l'app) | 11 | L | C ; **K** (liste) | `npm run test:c` ≥ 95 % ; rapport des échecs classés par cause |
| **Recherche par auteur** : route `/v1/search?mode=auteur` (auteur → sagas et livres regroupés) | 8 | M | C | Auteur populaire rend ses sagas dans l'ordre de popularité ; test réel |
| **Résumés** : mesurer d'abord la couverture réelle (Hardcover, Open Library) sur 100 livres français ; ajouter à `/books` et `/isbn` **si ≥ 60 %**, sinon laisser Open Library côté app | 9 | M | C | Décision chiffrée consignée |
| **Couvertures à grande échelle** : mesure sur ≥ 200 ISBN de 10 sagas variées ; **contrôle hebdomadaire** des couvertures en échec (URL vivante, taille) ; liste des trous pour correction manuelle | 10 | L | C | ≥ 90 % de couvertures réelles sur le jeu ; trous listés ; aucune image partagée entre deux tomes |
| **Bruit et hors-sujet** : revue guidée par le journal (requêtes avec résultats douteux) | 7, 11 | M | C | Taux de requêtes « douteuses » en baisse sur le jeu |
| **Anglais** : jeu dédié (30 requêtes) et vérification des noms de séries EN | 11 | M | C | ≥ 95 % ; 0 titre français quand `lang=en` |

### Phase 3 — Intégration dans Vault Read · ~3 sessions + essais de Kinder

| Tâche | Réf. | Taille | Qui | Critère de réussite |
|---|---|---|---|---|
| **Essai sur téléphone** : je prépare une **fiche d'essai** (≈ 15 gestes : recherche saga, scan, ajout, édition, hors ligne, interrupteur, langue) | 13 | S | C prépare, **K** exécute | Fiche remplie ; anomalies listées |
| **Arbitrer la branche `claude/search-results-saga-organization-…`** (abandonner ou archiver sous `archive/…`) | 13 | S | **K** décide, C exécute | Plus aucune branche concurrente en suspens |
| **Hors ligne** : archiver aussi les résultats du catalogue (24 h) pour qu'une recherche déjà faite fonctionne sans réseau | 14 | M | C | Test : réseau coupé après une première recherche → résultats servis, signalés « anciens » |
| **Tests de contrat** : réponses réelles enregistrées une fois et partagées ; l'API et l'app échouent si le format dérive | 15 | M | C | Changer un nom de champ dans l'API fait échouer les tests de l'app |
| **Corrections issues de l'essai** | 13 | M–L | C | Fiche d'essai sans anomalie bloquante |
| **Fusion dans `main`** (règle du dépôt : accord explicite de Kinder, puis suppression de la branche) | 13 | S | **K** accord, C exécute | `main` à jour, branche supprimée, tests verts |
| **Brancher la recherche par auteur et les résumés** (si décidés en phase 2) | 8, 9 | M | C | Les trois modes passent par le catalogue avec repli |
| **Retirer le code devenu inutile** (lecture de « Tome N » dans les titres, fusion, notoriété Open Library) — **seulement après 2 à 4 semaines d'usage sans régression** | — | M | C | Moins de code, mêmes tests de comportement |
| **Plan de rotation de la clé d'application** : rotation côté service + nouvelle version de l'app ; envisager un jeton par installation si abus constaté | 16 | M | C | Procédure testée en environnement de test |

### Phase 4 — Conformité et publication · en parallèle, dès la réponse de Hardcover

| Tâche | Réf. | Taille | Qui | Critère de réussite |
|---|---|---|---|---|
| **Statut du projet** : Vault Read restera-t-il personnel, gratuit public, ou monétisé ? Décide des offres (Vercel Hobby non commercial ; Hardcover gratuit « usage personnel » ; Supabase) | 19 | — | **K** | Décision écrite ; coût mensuel estimé si changement de plan |
| **Attribution** « Données Hardcover » visible dans l'app (écran Réglages / À propos) ; mentions BnF et Open Library | 17 | S | C | Présente dans l'APK |
| **Procédure de retrait d'images (DMCA)** : page publique + adresse de contact ; processus pour retirer une couverture (outil de correction) | 17 | M | C rédige, **K** fournit l'adresse | Un retrait simulé réussit en < 24 h |
| **Politique de confidentialité** réécrite : recherches envoyées à notre service (hébergé chez Vercel/Supabase, source Hardcover), pas de compte, pas d'identifiant, journal 30 jours sans texte de recherche | 18 | M | C rédige, **K** relit | Texte conforme à ce que le code fait réellement (vérifié contre le journal) |
| **Préparation Play Store** (déjà listée dans `PROJET_CONTEXTE.md` §11 de Vault Read) | — | L | K + C | Hors périmètre de ce plan, dépend des points ci-dessus |

### Phase 5 — Mesures dans la durée et évolutions · après la mise en service

> **État au 5 octobre 2026** : capacité mesurée, relevés de fraîcheur lancés (rapport le 19 octobre), relecture nocturne des sagas en cours et réchauffement BnF livrés. Détail et chiffres : docs/resultats-mesure-5.md. Reste : suggestions / « tome suivant » et nouveautés (dépendent de l'essai téléphone et du relevé du 19).

| Tâche | Réf. | Taille | Qui | Critère de réussite |
|---|---|---|---|---|
| **Test de fraîcheur** : 10 livres parus récemment (fr et en), relevé quotidien pendant 2 semaines dans chaque source | 12 | M + attente | C | Délai réel de chaque source ; fréquence de rafraîchissement décidée sur chiffres |
| **Rafraîchissement des sagas en cours** : la tâche nocturne relit les sagas les plus consultées et signale un nouveau tome | 12 | M | C | Un nouveau tome apparaît ≤ 24 h après son entrée chez Hardcover |
| **Éditions françaises hebdomadaires via la BnF** (≈ 1 requête/s, reprenable) | 12 | M | C | Éditions BnF présentes sans appel en direct ; 0 coupure de connexion |
| **Test de capacité** : croissance de la base (cache), latence sous charge légère, limites des offres gratuites mesurées (pas supposées) | 12 | M | C | Rapport chiffré, marge ≥ 3× sur 100 utilisateurs/jour |
| **Suggestions et « tome suivant »** : remplacer l'usage de Google (1 000 requêtes/jour) par les sagas du service | — | L | C | Suggestions sans Google ; « tome suivant » exact |
| **Nouveautés / sorties à venir** : seulement si le test de fraîcheur montre qu'une source les publie | — | L | C | Dépend du résultat de la mesure |

## 3. Ordre conseillé et dépendances

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► (Phase 5, mesures longues)
   │                       │
   │ message Hardcover     └─► Phase 3 (essai téléphone par K à tout moment après la Phase 1)
   └──────────────────────────────► Phase 4 (dès la réponse de Hardcover)
```

1. **Phase 0 et Phase 1 d'abord** : elles éliminent les deux risques réels (pause Supabase le ~12 octobre, aveuglement en cas de panne).
2. **Le message à Hardcover part tout de suite** : c'est le seul point dont le délai ne dépend pas de nous.
3. **L'essai téléphone** peut se faire dès la Phase 1 terminée ; les corrections de la Phase 3 s'enchaînent ensuite.
4. **La suppression de code dans Vault Read attend** que le service ait fait ses preuves en usage.

## 4. Jalons et critères d'arrêt

| Jalon | Contenu | Prêt quand |
|---|---|---|
| **J1 — Stable** | Phases 0 et 1 | Entretien actif depuis 48 h ; journal et état visibles ; CI verte ; runbook écrit |
| **J2 — Fiable** | + Phase 2 | Pertinence ≥ 95 % sur 100 requêtes ; couvertures ≥ 90 % ; 100 sagas avec nom français |
| **J3 — Intégré** | + Phase 3 | Essai téléphone sans anomalie bloquante ; branche fusionnée ; hors ligne OK |
| **J4 — Publiable** | + Phase 4 | Réponse de Hardcover consignée ; attribution, DMCA, confidentialité en place ; décision sur les offres payantes |
| **J5 — Éprouvé** | + Phase 5 | Fraîcheur et capacité mesurées ; marges documentées |

## 5. Indicateurs suivis en continu (alimentés par le journal)

Taux de réussite des appels (objectif ≥ 99 %) · latence p95 à froid (≤ 5 s) et à chaud (≤ 500 ms) · part servie par le cache (≥ 80 % après un mois) ·
requêtes Hardcover/jour (< 50 % du quota) · taille de la base (< 100 Mo) · nombre de requêtes sans résultat (liste hebdomadaire pour alimenter les corrections).

## 6. Risques et plans de repli

| Risque | Probabilité | Effet | Repli |
|---|---|---|---|
| Hardcover refuse le stockage ou l'usage public | Moyenne | Fort : change l'architecture | Réduire le cache à la durée minimale ; basculer vers Open Library + BnF + Wikidata (adaptateurs déjà isolés) ; ou accord commercial |
| Hardcover change l'API (bêta) ou réinitialise les clés | Moyenne | Moyen | Service sert le cache périmé ; adaptateur unique à corriger ; calendrier d'expiration dans le runbook |
| Abus de la clé d'application extraite de l'APK | Faible à moyenne | Moyen : quota Hardcover épuisé | Limite par client (Phase 1), rotation, jeton par installation |
| Supabase en pause ou limites atteintes | Moyenne sans entretien | Fort : cache indisponible | Entretien (Phase 1) ; l'API retombe sur la mémoire de la fonction ; app retombe sur anciennes sources |
| Qualité des données Hardcover insuffisante pour une saga | Certaine, au cas par cas | Faible | Table de corrections + outil dédié |
| Services gratuits plafonnés si l'app grandit | Faible aujourd'hui | Moyen | Mesure de capacité (Phase 5) ; passage à une offre payante budgété |

## 7. Décisions attendues de Kinder

1. **Statut de Vault Read** : personnel, public gratuit, ou monétisé ? (conditionne la Phase 4 et le choix des offres.)
2. **Canal d'alerte** : e-mail suffit-il, ou préférez-vous une notification sur téléphone ?
3. **Noms français** : êtes-vous d'accord pour valider une liste de ~100 sagas (≈ 20 minutes) ?
4. **Branche concurrente** `claude/search-results-saga-organization-…` : abandonner ou archiver ?
5. **Calendrier** : on enchaîne les phases 0 et 1 maintenant ?
