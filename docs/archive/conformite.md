# Conformité : ce qu'on sait, ce qu'on ignore, ce qu'on demande

> État au 2026-10-05. **Ce n'est pas un avis juridique.** Chaque point marqué « à vérifier » doit l'être avant toute publication de Vault Read.
> Les sources de ce document sont les pages officielles lues le 2026-10-05 (doc de l'API Hardcover) et les constats de nos mesures.

## 1. Hardcover (source principale)

### Ce que dit leur documentation (https://docs.hardcover.app/api/getting-started/)

- API en **bêta**, susceptible de changer ; les jetons peuvent être réinitialisés sans préavis.
- Offre gratuite : **5 000 requêtes/jour, 60/minute, rafale de 10**, décrite comme destinée à un **usage personnel**. Une offre commerciale est annoncée (« bientôt »).
- Les requêtes doivent partir d'un **serveur** (jamais du navigateur ni d'une application mobile) : c'est le cas, notre service garde la clé.
- **Données de catalogue** (livres, séries, éditions) : ils ne revendiquent aucun droit, « à vos risques » ; **les données des utilisateurs** (bibliothèques, avis, listes, notes personnelles…) ne peuvent pas servir à un produit public ou commercial. Nous n'en utilisons aucune.
- **Statistiques agrégées** (nombre de lecteurs, note moyenne) : permises **à condition de citer Hardcover**. Nous utilisons le nombre de lecteurs pour classer.
- **Images** : déposées par les utilisateurs ; un site public doit disposer d'une **procédure de retrait (DMCA)**.
- Interdit : entraîner des modèles de langage publics ou commerciaux avec ces données.

### Ce que cette documentation ne dit PAS (questions ouvertes)

1. **Mettre en cache** des réponses du catalogue (nous le faisons : jusqu'à 7 jours pour les recherches, 30 pour les ISBN) est-il accepté ?
2. **Vault Read** (application Android personnelle, éventuellement publiée gratuitement) relève-t-il de l'« usage personnel » ?
3. À partir de quel volume ou de quelle publication faut-il l'offre commerciale ?
4. **Les URLs d'images** : peut-on les afficher dans l'application (nous ne copions pas les fichiers) ?
5. Quelle **attribution** exacte attendent-ils ?

### Message prêt à envoyer (anglais — leur langue de travail)

> Destinataire à utiliser : la page *contact* de hardcover.app, leur Discord, ou l'adresse citée dans leur documentation pour les demandes de limites (`jules@hardcover.app`).

```
Subject: Question about caching and public use of the Hardcover catalog API

Hi,

I'm building a small personal Android app (a reading tracker, French-speaking, no accounts, no ads) and a small
server-side service that sits between the app and your GraphQL API. I use a personal API key with the read:catalog scope
only: book search, series, editions and cover image URLs. I never read user libraries, reviews, lists or any user data.

Before I publish the app, I'd like to check a few points:

1. My service caches API responses (search results for up to 7 days, edition/ISBN lookups for up to 30 days) to stay far
   below the rate limits. Is that acceptable? Is there a maximum retention you'd like me to respect?
2. If the app is distributed publicly and free of charge on Google Play (expected usage: under 100 users per day),
   is the free plan still appropriate, or should I move to another plan?
3. I only link to the cover images hosted on assets.hardcover.app (I don't copy the files). Is that fine? I'm planning a
   takedown/contact page for rights holders, as your documentation recommends.
4. How would you like Hardcover to be credited? I plan a visible "Data from Hardcover" mention in the app's About screen,
   with a link to hardcover.app.
5. I also rank results by your readers count, and I understand aggregate figures are fine when attributed to Hardcover.

Thank you for the API and for any guidance!

Kind regards,
[Your name]
```

**À faire par Kinder** : envoyer ce message, puis coller ici (section 5) la réponse reçue.

## 2. BnF (éditions françaises)

- Utilisation : le catalogue général de la BnF par son interface SRU publique, sans clé. Nous lisons des **notices bibliographiques** (titre, auteur, éditeur, année, ISBN), jamais d'images.
- **Limite constatée** : la BnF coupe les connexions d'un client trop rapide (observé le 2026-10-05) ; notre adaptateur espace ses requêtes (≥ 1,1 s) et les met en file.
- **À vérifier** : les conditions de réutilisation des données bibliographiques de la BnF (licence applicable) et si un cache de 7 à 30 jours les respecte.

## 3. Open Library (couvertures de repli, 40 à 60 % de couverture française)

- Utilisation : adresse d'image par ISBN (`covers.openlibrary.org`), vérifiée par une requête `HEAD` puis mise en cache ; aucune copie de fichier.
- **À vérifier** : leurs conditions d'utilisation des couvertures et la limite de requêtes par ISBN (≈ 100 toutes les 5 minutes par adresse IP d'après nos lectures, non confirmé).

## 4. Hébergement

| Service | Offre | Limite à garder en tête | À faire si Vault Read devient commercial |
|---|---|---|---|
| Vercel | Hobby (gratuit) | **Usage non commercial** | Passer à l'offre Pro |
| Supabase | Free | Projet mis en pause après ~7 jours sans activité (couvert par l'entretien quotidien) ; ~500 Mo | Offre Pro si besoin de sauvegardes ou de volume |
| Hardcover | Gratuit | Usage personnel | Voir la réponse à la question 2 ci-dessus |

## 5. Réponses reçues

*(à compléter)*

| Date | De qui | Question | Réponse |
|---|---|---|---|
| | | | |

## 6. À produire avant la publication de Vault Read

- [x] **Attribution** « Données Hardcover » dans l'application : carte « Sources des données » dans Réglages (Hardcover cité seulement si le catalogue est actif ; BnF, Open Library, Google Books toujours). Test : famille 19. *(À vérifier sur téléphone : les liens s'ouvrent dans le navigateur — ligne ajoutée à la fiche d'essai.)*
- [x] **Procédure de retrait d'images** : page publique `vault-read/docs/retrait-images.html` (contact `vcoutry@gmail.com`, **à confirmer par Kinder**), commande `npm run corriger -- masquer <adresse>`, runbook `exploitation.md` §10. **Retrait simulé en production le 2026-10-05 : image rendue → `null` en 216 s, puis rétablie.** Critère « < 24 h » atteint.
- [x] **Politique de confidentialité** réécrite (`vault-read/docs/index.html`, 5 octobre 2026), vérifiée contre le code : journal sans texte ni ISBN ni IP (`src/journal.js`), purge à 30 jours (journal) et 30 jours (cache) (`src/entretien.js`), clé de cache contenant le terme cherché (dit), IP lue en mémoire pour la limite de 90 appels/minute (dit), Vercel peut garder une trace technique (dit). **À relire par Kinder.** Elle n'est publiée qu'à la fusion de la branche dans `main`.
- [ ] **Décision sur le statut** du projet : voir `docs/statut-projet.md` (à trancher par Kinder).
- [ ] **Réponse de Hardcover** (section 5) : message à envoyer.
- [ ] Adresse publique de la politique (GitHub Pages) à renseigner dans la fiche Play Store ; ajouter le lien dans l'application une fois l'adresse connue.