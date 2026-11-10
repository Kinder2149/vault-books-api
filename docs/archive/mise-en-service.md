# Mise en service : créer Supabase et Vercel

> Les écrans des fournisseurs évoluent : si un libellé diffère légèrement, cherchez le même mot. **Ne collez jamais une clé dans un chat**
> (ni dans un fichier versionné) : elles vont dans `.env` (local) et dans les variables d'environnement de Vercel.
> Ordre conseillé : 1 Supabase → 2 GitHub → 3 Vercel → 4 vérification.

## 1. Supabase (base + cache + corrections)

1. Allez sur <https://supabase.com> → **Start your project** → connexion (compte GitHub possible).
2. **New project** (créez-en un **dédié**, ne réutilisez pas celui de votre autre projet) :
   - *Name* : `vault-books-api`
   - *Database password* : générez-en un fort, **gardez-le dans votre gestionnaire de mots de passe** (on ne s'en sert pas pour l'API, mais il est introuvable ensuite)
   - *Region* : la plus proche de la France (Paris `eu-west-3` si proposée, sinon Frankfurt/London)
   - *Plan* : Free. Attendez 1-2 minutes la fin de la création.
3. Menu de gauche **SQL Editor** → **New query** → collez **tout** le contenu de `supabase/migrations/0001_cache_et_corrections.sql` → **Run**.
   Résultat attendu : « Success. No rows returned ». Vérifiez dans **Table Editor** : 3 tables (`cache_entries`, `series_overrides`, `cover_overrides`)
   et 3 lignes dans `series_overrides`.
4. Récupérez les deux valeurs (menu **Project Settings** ⚙ → **API Keys** / **Data API**) :
   - **Project URL** : `https://xxxxxxxx.supabase.co`
   - La clé **secrète** : soit **« Secret key »** (`sb_secret_…`), soit, onglet *Legacy API keys*, la clé **`service_role`** (`eyJ…`).
     **Pas** la clé « publishable » ni « anon » : elles n'ont pas le droit d'écrire (et c'est voulu).
5. Dans `vault-books-api/.env`, ajoutez (sans espaces ni guillemets) :
   ```
   SUPABASE_URL=https://xxxxxxxx.supabase.co
   SUPABASE_SERVICE_KEY=la_cle_secrete
   ```
6. Vérifiez : `npm run verifier:supabase` → doit finir par « Supabase est prêt. » (le script n'affiche jamais la clé).

Bon à savoir : un projet gratuit **se met en pause après environ 7 jours sans activité** (bouton « Restore project » dans le tableau de bord).
La tâche nocturne de l'étape 4 l'évitera ; d'ici là, un appel de l'API par semaine suffit.

## 2. GitHub (le dépôt que Vercel va lire)

1. <https://github.com/new> → *Repository name* `vault-books-api`, **Private**, **ne cochez ni README, ni .gitignore, ni licence**.
2. Dans le terminal, depuis le dossier du projet :
   ```bash
   cd C:\Users\v.coutry\Dev\Projects\vault-books-api
   git add .
   git status
   ```
   **Contrôle obligatoire :** la liste ne doit **pas** contenir `.env` (seulement `.env.example`). Puis :
   ```bash
   git commit -m "API de catalogue : Hardcover, BnF, cache, corrections (étapes 1 et 2)"
   git branch -M main
   git remote add origin https://github.com/VOTRE-COMPTE/vault-books-api.git
   git push -u origin main
   ```

## 3. Vercel (l'API)

1. <https://vercel.com/signup> → **Continue with GitHub** (plan **Hobby**, gratuit ; réservé à un usage non commercial).
2. **Add New… → Project** → importez `vault-books-api` (autorisez l'accès à ce dépôt si demandé).
3. Écran de configuration : *Framework Preset* **Other**, *Root Directory* `./`, laissez *Build Command* et *Output Directory* **vides**.
4. Dépliez **Environment Variables** et ajoutez **quatre** variables (cochez Production, Preview et Development ; activez *Sensitive* si proposé) :

   | Nom | Valeur |
   |---|---|
   | `HARDCOVER_API_KEY` | la clé Hardcover (celle de votre `.env`) |
   | `SUPABASE_URL` | l'URL du projet Supabase |
   | `SUPABASE_SERVICE_KEY` | la clé secrète Supabase |
   | `APP_KEY` | une valeur aléatoire : `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` — **ajoutez-la aussi dans votre `.env`** |

5. **Deploy**. Une minute plus tard, vous obtenez une adresse `https://vault-books-api-xxxx.vercel.app`.
6. Région des fonctions : le fichier `vercel.json` demande Paris (`cdg1`), près de Supabase. Vérifiable dans *Settings → Functions*.

## 4. Vérifier que tout marche

```bash
npm run smoke -- https://vault-books-api-xxxx.vercel.app
```

Le test appelle `/v1/health`, `/v1/search`, `/v1/series/:id`, `/v1/books/:id`, vérifie le cache Supabase, les erreurs (400, 404) et le refus sans `APP_KEY` (401).
Tout vert = l'API est en ligne. Ensuite seulement : l'étape 3 (brancher Vault Read, avec l'URL et `APP_KEY`).

## Ce qu'on n'utilise pas (ou plus)

- **Google Books / Google Cloud** : plus nécessaire. **Régénérez** quand même la clé qui a été collée dans une conversation, ou supprimez-la.
- **Hardcover** : la clé actuelle suffit. Notez sa date d'expiration. Question à poser à Hardcover (Discord) avant publication :
  « puis-je mettre en cache les réponses du catalogue pour une application de suivi de lecture ? »
