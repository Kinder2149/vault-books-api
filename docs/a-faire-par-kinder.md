# À faire par Kinder : pas à pas

Classé par urgence. Pour chaque point : **quoi**, **où trouver l'information**, **quoi en faire**, **comment vérifier**.
Règle générale : une clé ou un secret ne se colle **jamais** dans une conversation ni dans git. On l'ouvre dans le fichier `.env` sur ton ordinateur et on la colle directement dans le service concerné.

Le fichier `.env` du service est ici : `C:\Users\v.coutry\Dev\Projects\vault-books-api\.env` (ouvre-le avec le Bloc-notes). Il contient une ligne par secret, sous la forme `NOM=valeur`.

---

## 🔴 Urgent (avant le 12 octobre)

### 1. `CRON_SECRET` dans Vercel (~3 min) — variable ajoutée le 5 octobre ✅ (reste à vérifier après redéploiement)
*Pourquoi :* sans lui, l'entretien nocturne est désactivé (je l'ai vérifié : il répond « non configuré ») et Supabase se met en pause après 7 jours sans activité.
1. Dans `.env`, repère la ligne `CRON_SECRET=…` et copie ce qui est **après** le `=`.
2. vercel.com → ton projet **vault-books-api** → **Settings** → **Environment Variables**.
3. *Key* : `CRON_SECRET` · *Value* : la valeur copiée · coche **Production** → **Save**.
4. Onglet **Deployments** → le dernier déploiement → **⋯** → **Redeploy**.
*Vérifier :* dis-moi « c'est fait », je teste moi-même (la route doit répondre 401 au lieu de 503).

### 2. Secrets GitHub (~4 min)
*Pourquoi :* sauvegarde nocturne des corrections, suivi de fraîcheur, réchauffement BnF.
1. github.com/Kinder2149/vault-books-api → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Crée trois secrets, un par un (nom exact → valeur à copier depuis `.env`) :
   - `SUPABASE_URL` → la valeur de `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY` → la valeur de `SUPABASE_SERVICE_KEY`
   - `HARDCOVER_API_KEY` → la valeur de `HARDCOVER_API_KEY`
3. Onglet **Actions** → « Sauvegarde des corrections » → **Run workflow**. Puis « Test de fraîcheur » → **Run workflow**.
*Vérifier :* les deux passent au vert (coche verte). Rouge = ouvre l'exécution et dis-moi le message.

### 3. Révoquer l'ancienne clé Google (~2 min)
*Pourquoi :* elle a été écrite dans une conversation ; elle ne sert plus à rien.
console.cloud.google.com → ton projet → **APIs et services** → **Identifiants** → ligne de la clé qui commence par `AIzaSyBS…` → **⋯** → **Supprimer**.
*Attention :* si l'application Vault Read actuelle utilise une clé Google pour la recherche de secours, **ne supprime que celle qui a fuité** (celle dont le début est ci-dessus), pas une autre.

---

## 🟠 Cette semaine

### 4. Essai sur téléphone (~20 min)
1. Dans `C:\Users\v.coutry\Dev\Projects\vault-read\client\.env`, les lignes `VITE_VAULT_API_URL` et `VITE_VAULT_API_KEY` doivent exister (c'est déjà le cas ici).
2. Construis l'application depuis la branche `feature/catalogue-api` et installe-la sur le téléphone (comme pour tes versions habituelles).
3. Remplis `docs/fiche-essai-telephone.md` (dans `vault-books-api`) : OK / Gênant / KO + une phrase.
4. Renvoie-moi les lignes non-OK (copie du texte, ou une photo).

### 5. Message à Hardcover (~10 min)
*Pourquoi :* leur réponse décide si l'app peut devenir publique.
1. Ouvre `docs/conformite.md`, section 1, « Message prêt à envoyer » (en anglais).
2. Envoie-le depuis ton adresse. Où : le formulaire/contact de hardcover.app, ou leur Discord (canal de l'API) — regarde dans le pied de page de hardcover.app → *Contact* ou *Community*.
3. Quand ils répondent, colle-moi leur réponse : je la consigne dans `conformite.md` (section 5).

### 6. Surveillance externe (~5 min)
1. Crée un compte gratuit sur **uptimerobot.com**.
2. **Add New Monitor** → type **HTTP(s) – Keyword** → URL : `https://vault-books-api.vercel.app/v1/health` (vérifie que c'est bien l'adresse de ton service : c'est celle de `VITE_VAULT_API_URL` dans `vault-read/client/.env`, suivie de `/v1/health`) → mot-clé : `ok` → intervalle 5 min.
3. Alerte : ton e-mail (ou l'application mobile UptimeRobot pour une notification téléphone — c'est ta réponse à « canal d'alerte »).
*Vérifier :* le moniteur passe à « Up ».

### 7. Valider les noms de sagas en français (~20 min)
Ouvre `docs/noms-sagas-a-valider.md` : 43 propositions. Barre ou corrige celles qui sont fausses, puis dis-moi lesquelles exclure ; j'applique le reste.

### 8. Tes vraies recherches (~10 min)
Écris une liste de 30 recherches que tu fais vraiment (titres, sagas, auteurs, avec fautes si ça t'arrive). Un message suffit : une recherche par ligne, et le livre que tu attends à chaque fois si tu y penses.

---

## 🟡 Décisions à me donner (une ligne chacune)

| Décision | Où trouver de quoi décider |
|---|---|
| **Statut du projet** : A personnel / B public gratuit / C payant | `docs/statut-projet.md` (tableau comparatif, ma recommandation : A maintenant, B si Hardcover accepte) |
| **Branche concurrente** `claude/search-results-saga-organization-…` : archiver ou abandonner | Elle existe encore en ligne. Archiver = la renommer en `archive/…` (rien n'est perdu) ; abandonner = la supprimer. Je recommande d'archiver. |
| **Canal d'alerte** : e-mail ou notification téléphone | Voir point 6 |

---

## 🟢 Plus tard

### 9. Adresse publique de la politique de confidentialité (après la fusion dans `main`)
github.com/Kinder2149/vault-read → **Settings** → **Pages** → vérifie *Source* : branche `main`, dossier `/docs`. L'adresse affichée en haut (du type `https://kinder2149.github.io/vault-read/`) est celle à donner au Play Store. Envoie-la-moi pour que je l'ajoute dans l'application.

### 10. Relire la politique de confidentialité et la page de retrait d'images
Fichiers : `vault-read/docs/index.html` et `vault-read/docs/retrait-images.html` (double-clic = s'ouvrent dans le navigateur). Vérifie que tu es d'accord avec chaque phrase, et que `vcoutry@gmail.com` est bien l'adresse que tu veux rendre publique.

### 11. Le 19 octobre
Demande-moi : « rapport de fraîcheur ». Je te lis les délais de la BnF et d'Open Library et on décide de la page « nouveautés ».

### 12. Optionnel : règle de limitation dans le pare-feu Vercel
Étapes dans `docs/exploitation.md` §3 point 4. Je ne modifie pas les réglages de sécurité moi-même.

---

## Ce qui se déclenche ensuite (moi)
- Après 4 et 7 : j'applique les noms, relance les mesures de pertinence.
- Après 4 : je corrige ce que l'essai a remonté.
- Quand tu dis « fusionne » : je fusionne `feature/catalogue-api` dans `main` et je supprime la branche.
