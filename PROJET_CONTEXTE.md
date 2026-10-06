# PROJET_CONTEXTE — « Vault Books API »

> Document de cadrage : pourquoi ce projet existe, ce qui est décidé, où en est-on, **comment reprendre le travail depuis un autre poste** (§6).
> Le fonctionnement détaillé est dans `docs/architecture-fonctionnement.md`, l'exploitation dans `docs/exploitation.md`, la suite dans `docs/plan-complet.md`,
> **les actions de Kinder pas à pas dans `docs/a-faire-par-kinder.md`**.
>
> **État au 2026-10-05 (fin de journée) : en ligne, stable, phases 0 à 5 faites côté code** — https://vault-books-api.vercel.app (Vercel) + Supabase + GitHub `Kinder2149/vault-books-api`.
> 5 routes de données (titre, auteur, saga, livre, ISBN), journal, entretien nocturne **actif** (`CRON_SECRET` posé et vérifié), mode économie, limite par client,
> retrait d'images, rotation de clé, relecture nocturne des sagas en cours, outil de correction, sauvegarde des corrections.
> 175 tests automatiques (`node --test test/`) ; côté Vault Read 384 tests (`npx vitest run` dans `client/`) ; contrôle en ligne `npm run smoke` 14/14 ; contrat `npm run contrat -- --live` conforme.
> **Ce qui reste dépend de Kinder** : voir §5 et `docs/a-faire-par-kinder.md`.
>
> **MISSION EN COURS (2026-10-05) — validation du catalogue, branche `validation-catalogue`** : jeu de 117 cas + lanceur rejouable ; mesure de départ **71/116 (61 %)**, après correctif des tomes manquants **85/116 (73 %)** (correctif sur la branche, **non déployé**, en attente de l'accord de Kinder).
> **Point de reprise : `docs/resultats-validation-1.md`** (critère validé, causes des échecs, étapes restantes). Le `.env` du service est reconstitué (2026-10-06) ; prochaine étape : corrections par les données (`npm run corriger`), vérification des attendus, rapport final.

## 1. Pourquoi ce projet

Vault Read interrogeait Google Books, Open Library et la BnF en direct depuis le téléphone. Aucune de ces sources n'est faite pour retrouver un livre :
l'ordre d'une saga se devinait par expression régulière sur le titre, les couvertures se rattachaient à l'œuvre et non à l'édition (couvertures du mauvais tome),
Google tombait en panne par rafales (1 000 requêtes/jour partagées). **Décision : sortir le tri de l'application** et le confier à un service à part.

Cas de test fondateurs : « game of thrones », « seigneur des anneaux » (saga complète, dans l'ordre, sans mélange d'éditeurs) et « Les Chevaliers d'Émeraude » (bonne couverture sur le bon tome).

## 2. Décisions prises (et leur raison, mesurée)

| Décision | Raison | Détail |
|---|---|---|
| **Service séparé** de Vault Read, dont l'app n'est qu'un client | Réutilisable, déployé et corrigé indépendamment | — |
| **Hardcover** comme source principale | Meilleur pour l'ordre des sagas, la popularité et les éditions par langue ; connaît les livres des mois avant leur sortie | `docs/resultats-mesure-3.md`, `-5.md` |
| **BnF** pour les éditions françaises | Dépôt légal : éditeur, année, ISBN ; mais coupe les clients rapides (adaptateur espacé ≥ 1,1 s) | `docs/resultats-mesure-2.md` |
| **Open Library** pour les couvertures de repli | 40 à 60 % de couverture française par ISBN | idem |
| **Google Books abandonné** comme dépendance du service | 0 résultat constaté, quota de 1 000/jour (reste un repli côté application) | `docs/resultats-mesure-2.md` |
| Hébergement **Vercel + Supabase**, gratuit | Fonctions sans mise en veille, base avec tableau de bord pour les corrections | `docs/mise-en-service.md` |
| **Cache** (30 jours max) plutôt que copie du catalogue | Moins de travail, moins de risque juridique, suit Hardcover à jour | `docs/architecture-fonctionnement.md` §6 |
| **Corrections manuelles** qui gagnent toujours | Aucune source n'est parfaite (Trône de fer, Seigneur des anneaux) | `docs/exploitation.md` §6 |
| **Retrait d'image immédiat** (`npm run corriger -- masquer <url>`) | Demande d'un ayant droit : effectif en < 5 min (simulé : 216 s) | `docs/exploitation.md` §10 |
| Vault Read garde ses **anciennes sources en repli** | Le service ne doit jamais rendre l'application moins fiable | `vault-read` : tranche 33 |
| **Contrat** de réponses partagé avec l'application | Un champ qui change fait échouer les tests des deux dépôts | `src/contrat.js`, `contrat/exemples/` |

## 3. Les besoins d'origine, et où ils en sont

| Besoin exprimé | État |
|---|---|
| Une recherche pertinente par titre | ✅ FR 80/80, EN 35/35 ; **à valider sur tes 30 vraies recherches** (`test/fixtures-pertinence/requetes-kinder.json`, à créer) |
| La saga complète, dans l'ordre, sans mélange d'éditeurs | ✅ 3 sagas de référence + beaucoup d'autres |
| Les bonnes couvertures | ✅ 93 % de couvertures réelles, 0 partagée ; 14 tomes sans vraie couverture (surtout *Journal d'un dégonflé*) |
| Français ou anglais au choix | ✅ paramètre `lang` ; 43 noms de sagas français **proposés, à valider** (`docs/noms-sagas-a-valider.md`) |
| Scan de code-barres | ✅ `/v1/isbn/:isbn` (pages, éditeur, couverture de l'édition, résumé) |
| Recherche par auteur | ✅ `mode=auteur` ; branchée dans l'application (branche `feature/catalogue-api`) |
| Résumés | ✅ via l'ISBN (souvent en anglais, non traduit) |
| Hébergement gratuit | ✅ marge mesurée : 6× sur la base, ≥ 3× sur Hardcover dès 85 % de cache (`docs/resultats-mesure-5.md`) |
| Fonctionnement hors ligne de l'application | ✅ recherches du catalogue archivées côté téléphone |
| « Un livre qui sort demain, quand est-il dans ma base ? » | ✅ Hardcover : 60/60 livres anglais connus avant la sortie (219 j avant), 72 % des français ; saga en cours relue chaque nuit. **Relevé de fraîcheur sur 2 semaines en cours** (rapport le 19 octobre) |
| Suggestions et « tome suivant » sans Google | ⏳ à faire côté application, après l'essai téléphone |

## 4. Questions ouvertes

- **Hardcover** : cache accepté ? usage public ? attribution ? (`docs/conformite.md` §1 — message prêt, **à envoyer par Kinder**).
- **Statut de Vault Read** : personnel, gratuit public, monétisé ? (`docs/statut-projet.md`, recommandation : personnel maintenant).
- **Canal d'alerte** (e-mail ou téléphone) pour la surveillance externe de `/v1/health`.
- **Branche concurrente** `claude/search-results-saga-organization-…` dans Vault Read : archiver (recommandé) ou supprimer.

## 5. Ce qui reste à faire

**Par Kinder** (détail pas à pas : `docs/a-faire-par-kinder.md`)
1. Secrets GitHub : `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `HARDCOVER_API_KEY` — **ajoutés et vérifiés le 5 octobre** (sauvegarde, fraîcheur et réchauffement BnF : exécutions manuelles au vert). **Fait.**
2. Révoquer l'ancienne clé Google qui a fuité.
3. Message à Hardcover ; surveillance externe (UptimeRobot) sur `/v1/health`.
4. Essai sur téléphone (`docs/fiche-essai-telephone.md`) ; 30 vraies recherches ; valider les 43 noms de sagas.
5. Décisions : statut, branche concurrente, canal d'alerte ; relire la politique de confidentialité et la page de retrait d'images (`vault-read/docs/`).

**Par Claude, une fois ces retours reçus**
- Appliquer les noms : `npm run importer-noms -- --appliquer [--sauf …]`, puis `npm run pertinence -- kinder`.
- Corriger ce que l'essai téléphone remonte.
- Fusionner `feature/catalogue-api` dans `main` de Vault Read **uniquement sur accord explicite de Kinder**, puis supprimer la branche.
- Le 19 octobre : `node --env-file=.env scripts/fraicheur.mjs rapport`, décider de la page « nouveautés ».
- Suggestions / « tome suivant » sans Google (côté application).
- Après 2 à 4 semaines d'usage sans problème : retirer l'ancien code devenu inutile dans Vault Read.
- Après un mois : relire la part servie par le cache dans `/v1/status` (objectif ≥ 80 %).

## 6. Reprendre le travail depuis un autre poste

### 6.1 Ce qu'il faut sur la machine
Node 20 ou plus, git, un éditeur. Les deux dépôts côte à côte dans le même dossier (les scripts s'attendent à `..\vault-read` à côté de `vault-books-api`) :

```bash
git clone https://github.com/Kinder2149/vault-books-api.git
git clone https://github.com/Kinder2149/vault-read.git
cd vault-read && git checkout feature/catalogue-api
```

### 6.2 Les deux fichiers `.env` (ils ne sont PAS dans git, et c'est voulu)
Il faut les **copier depuis le premier poste** (clé USB ou gestionnaire de mots de passe, jamais par message). Sans copie, il faut regénérer :

| Fichier | Lignes | Si on doit les retrouver |
|---|---|---|
| `vault-books-api/.env` | `HARDCOVER_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `APP_KEY`, `CRON_SECRET` | Hardcover : hardcover.app → compte → *API*. Supabase : tableau de bord du projet **vault-books-api** → *Project Settings* → *API*. Vercel **ne rend pas** les valeurs déjà enregistrées (variables « sensibles ») : si `APP_KEY` ou `CRON_SECRET` sont perdus, en générer de nouveaux (32 caractères aléatoires) **et** les remplacer dans Vercel, puis redéployer. |
| `vault-read/client/.env` | `VITE_VAULT_API_URL` (= `https://vault-books-api.vercel.app`), `VITE_VAULT_API_KEY` (= la valeur de `APP_KEY`) | — |

Puis, dans chaque dépôt : `npm install` (dans `vault-read`, aussi dans `client/`).

### 6.3 Vérifier que tout est sain (5 minutes)
```bash
cd vault-books-api && node --test test/*.test.js   # 175 tests, 0 échec (Node 24 : `node --test test/` échoue ; la CI Node 20 garde l'ancienne forme)
npm run smoke                                 # 14/14 contre le service en ligne
npm run contrat -- --live                     # 5 réponses conformes au contrat
cd ../vault-read/client && npx vitest run     # 384 tests, 0 échec
```
Et `https://vault-books-api.vercel.app/v1/health` doit répondre `"ok":true`.

### 6.4 Liens directs GitHub (si le menu est difficile à trouver)
- Secrets : https://github.com/Kinder2149/vault-books-api/settings/secrets/actions
- Workflows (lancer / voir le résultat) : https://github.com/Kinder2149/vault-books-api/actions
- Pages (adresse publique de la politique) : https://github.com/Kinder2149/vault-read/settings/pages

### 6.5 Règles de travail à ne pas oublier
- **Vault Read** : jamais travailler sur `main` ; une branche par mission ; fusion **seulement avec l'accord de Kinder** ; ne jamais toucher aux branches `archive/*` ; supprimer la branche après fusion (`CLAUDE.md` du dépôt).
- **Vault Books API** : `main` déploie automatiquement sur Vercel à chaque envoi — donc toujours lancer `node --test test/` avant d'envoyer.
- **Aucune clé** dans git, dans un message ou dans un fichier versionné. Une clé collée par erreur est à révoquer.
- Une correction de saga ou de couverture se fait avec `npm run corriger -- …` (`docs/exploitation.md` §6), jamais en modifiant le code.

### 6.6 Dire à Claude pour reprendre
**Validation du catalogue en cours** : `git fetch && git checkout validation-catalogue`, copier le `.env` du service, puis dire : *« Lis PROJET_CONTEXTE.md et docs/resultats-validation-1.md, puis continue la validation du catalogue à l'étape 1 des « Ce qui reste à faire ». »*
Autre reprise : ouvrir une session dans `vault-books-api` et écrire par exemple : *« Lis PROJET_CONTEXTE.md et docs/a-faire-par-kinder.md. Voici ce que j'ai fait depuis : … »* — puis donner les retours (fiche d'essai remplie, noms de sagas validés, réponse de Hardcover, décisions du §4).

## 7. Index des documents

| Document | Contenu |
|---|---|
| `README.md` | Démarrer, routes, commandes |
| `docs/a-faire-par-kinder.md` | **Les actions de Kinder, pas à pas** |
| `docs/architecture-fonctionnement.md` | Comment ça marche, **état réel** |
| `docs/exploitation.md` | Surveiller, réparer, corriger, retirer une image, tourner la clé ; secrets ; échéances |
| `docs/plan-complet.md` | Les phases 0 à 5 et leur état |
| `docs/mise-en-service.md` | Création de Supabase, GitHub, Vercel |
| `docs/conformite.md` | Hardcover, BnF, Open Library, hébergement ; message à Hardcover ; checklist de publication |
| `docs/statut-projet.md` | Personnel / public gratuit / payant, comparaison |
| `docs/fiche-essai-telephone.md` | Les 16 gestes de l'essai sur téléphone |
| `docs/plan-de-tests.md` | Tests A à E et leurs seuils |
| `docs/resultats-validation-1.md` | **Validation du catalogue : critère, mesure de départ, causes, étapes restantes (reprise)** |
| `docs/resultats-validation-1-brut.md` | Tableau cas par cas de la mesure de départ |
| `test/fixtures-pertinence/requetes-kinder.json` | Jeu de 117 cas (rejouable : `scripts/validation-catalogue.mjs`) |
| `docs/resultats-mesure-1.md` … `-5.md` | Mesures (sources, couvertures, résumés, fraîcheur et capacité) |
| `docs/noms-sagas-a-valider.md` | 43 noms français proposés |
| `docs/analyse-vault-read.md` | Ce qu'on a repris de Vault Read |
| `contrat/` | Réponses réelles enregistrées : le contrat avec l'application |
| `data/fraicheur.json` | Relevés quotidiens du test de fraîcheur |
| `archive/prototype-mesures/` | Scripts de mesure jetables (non maintenus) |
