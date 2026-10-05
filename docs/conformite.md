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

- [ ] **Attribution** « Données Hardcover » visible dans l'application (écran Réglages / À propos), avec lien.
- [ ] **Procédure de retrait d'images (DMCA)** : une page publique, une adresse de contact, un processus de retrait en moins de 24 h (outil `npm run corriger` : couverture à remplacer ou à masquer).
- [ ] **Politique de confidentialité** réécrite : les termes cherchés et les ISBN scannés partent vers notre service (Vercel, Supabase) puis, selon le cas, vers Hardcover, la BnF, Open Library ; aucun compte, aucun identifiant, aucune adresse IP conservée ; journal d'appels de 30 jours sans texte de recherche.
- [ ] **Décision sur le statut** du projet (personnel, gratuit public, monétisé) et sur les offres d'hébergement correspondantes.
