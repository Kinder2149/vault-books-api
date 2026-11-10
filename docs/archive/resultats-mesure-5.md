# Mesure 5 — fraîcheur, capacité, réchauffement (5 octobre 2026)

Tout ce qui suit est **mesuré** sur le service déployé ; ce qui est une projection est dit comme tel.

## 1. Fraîcheur : quand un livre est-il connu ?

Mesure immédiate sur 60 livres parus entre J-45 et J-7 par langue (`node scripts/fraicheur.mjs avance`) : Hardcover les a-t-il catalogués avant leur parution ?

| | Catalogués avant ou le jour de la parution | Écart médian | 90e centile |
|---|---|---|---|
| Anglais | **60 / 60** | 219 jours **avant** | 104 jours avant |
| Français | **43 / 60** (72 %) | 29 jours avant | 10 jours **après** |

**Lecture :** pour l'anglais, un livre est annoncé chez Hardcover plusieurs mois avant sa sortie, avec ISBN, couverture et pages dès les premiers relevés (10 livres suivis : 10/10). Pour le français, une saga sur quatre est catalogué avec un peu de retard (jusqu'à ~10 jours). **Aucune raison de rafraîchir plus d'une fois par jour** : le délai d'un cache de 24 h est inférieur à celui de la source.

**Suivi en cours (2 semaines) :** 10 livres (5 anglais, 5 français, parution du 2 au 14 octobre) relevés chaque jour dans Hardcover, la BnF et Open Library (`.github/workflows/fraicheur.yml` → `data/fraicheur.json` ; `node scripts/fraicheur.mjs rapport`). Premier relevé du 5 octobre : Hardcover complet (ISBN, image, pages) pour 10/10 ; BnF 0/5 et Open Library 1/10 pour les livres pas encore parus — attendu, ils ne sont pas encore sortis. **À relire le 19 octobre** : c'est ce rapport qui dira *quand* la BnF et Open Library rattrapent Hardcover (donc si la BnF vaut d'être interrogée pour une nouveauté).

## 2. Capacité (`npm run charge`, service déployé, 5 octobre)

| Scénario | Requêtes | Médiane | 95e centile | Erreurs |
|---|---|---|---|---|
| Recherche inédite, **en série** | 6 | 1,1 s | 2,3 s | 0 |
| Recherche inédite, **3 en parallèle** (12 en rafale) | 12 | 6,6 s | **17 s** | 0 |
| Recherche déjà vue (cache) | 72 | **100 ms** | 0,8 s | 0 |
| Saga (cache) | 30 | 100 ms | 0,7 s | 0 |
| Scan ISBN (cache) | 30 | 104 ms | 0,7 s | 0 |

- **Réponses :** 1 ko (recherche), 2 ko (ISBN), 6 ko (saga de 12 tomes).
- **Coût Hardcover d'une recherche inédite : 3,3 appels** (mesuré : 39 appels pour 12 recherches). Une recherche en cache : 0.
- **Le point faible est la rafale à froid** : le limiteur (8 appels, puis 0,9 par seconde, pour rester sous les 60/minute de Hardcover) fait attendre. 12 recherches inédites *simultanées* → 17 s pour la dernière, au-delà des 9 s que l'application attend (elle retombe alors sur Google, sans erreur). Pour < 100 utilisateurs par jour, des rafales pareilles n'arrivent pas ; mais **le premier lancement après une communication** (tout le monde cherche en même temps) serait le seul cas à craindre.

### Projection pour 100 utilisateurs par jour (hypothèse : 30 recherches chacun = 3 000 requêtes/jour)

| Taux de cache | Recherches inédites/jour | Appels Hardcover/jour | Marge sur 5 000 |
|---|---|---|---|
| 80 % | 600 | ≈ 2 000 | 2,5× |
| 90 % | 300 | ≈ 1 000 | **5×** |
| 95 % | 150 | ≈ 500 | 10× |

La marge ≥ 3× du plan est tenue **dès 85 % de cache**. Les recherches se répètent beaucoup (titres populaires, sagas) et le service garde chaque réponse 7 jours : 90 % est l'ordre de grandeur attendu, **à confirmer par `/v1/status` après un mois d'usage** (`stats24h`). Sous 1 000 appels restants, le service passe en mode économie (cache seul).

### Base de données (Supabase gratuit : 500 Mo)

Mesure : 76 entrées de cache = 272 ko (≈ 3,6 ko par entrée, index compris) ; 159 lignes de journal = 88 ko (≈ 0,55 ko). Projection : 300 recherches inédites/jour × 3,6 ko = 1,1 Mo/jour de cache ; 3 000 appels/jour × 0,55 ko = 1,7 Mo/jour de journal.

| Rétention du cache | Cache | Journal (30 j) | Total pire cas | Marge sur 500 Mo |
|---|---|---|---|---|
| 60 jours (avant) | 65 Mo | 50 Mo | ≈ 115 Mo | 4,3× |
| **30 jours (maintenant)** | 33 Mo | 50 Mo | ≈ 83 Mo | **6×** |

Ces chiffres supposent 300 recherches *inédites* chaque jour sans aucun recoupement : c'est un pire cas. **Décision : rétention du cache ramenée de 60 à 30 jours** (`AGE_MAX_CACHE_MS`), ce qui double aussi la marge de confidentialité (la politique publiée dit 30 jours).

### Limites des offres gratuites (à vérifier au moment de publier, non mesurées ici)

Vercel Hobby : usage non commercial ; 2 tâches planifiées (utilisées : 2, d'où les relevés de fraîcheur et le réchauffement par GitHub Actions). Supabase gratuit : 500 Mo, pause après ~7 jours d'inactivité (couverte par l'entretien nocturne). Hardcover : 5 000 requêtes/jour, 60/minute.

## 3. Rafraîchissement des sagas en cours (code livré, nuit du 6 octobre)

L'entretien nocturne relit maintenant jusqu'à 12 sagas « en cours » (tomes à paraître, ou moins de tomes disponibles qu'annoncés), les plus anciennes du cache d'abord, en forçant le calcul. Tout tome qui devient disponible est consigné (`/v1/status` → `nouveautes`). Elle s'arrête sans erreur si le quota du jour est bas ou après 40 s. **Critère du plan (« nouveau tome ≤ 24 h après son entrée chez Hardcover »)** : atteint par construction pour les sagas déjà dans le cache ; une saga que personne n'a jamais cherchée n'est pas dans le cache, donc pas surveillée. Limite connue, assumée.

*Aujourd'hui le cache ne contient qu'une saga complète (Les Chevaliers d'Émeraude) : la relecture n'a rien à faire tant qu'il ne contient pas de saga en cours. Elle a été vérifiée par tests (7 cas) et par une exécution réelle (requête de lecture Supabase correcte, 0 candidate).*

## 4. Éditions françaises hebdomadaires (BnF)

`scripts/rechauffer.mjs` (workflow du dimanche) relit les tomes des sagas connues via le service, donc avec son cache : une réponse déjà fraîche ne coûte rien, une coupure se reprend d'elle-même. **Essai réel : 6 livres, 6 réponses BnF complètes, 0 coupure de connexion, 1,9 s par livre** (la BnF est espacée à ≥ 1,1 s par l'adaptateur). Le workflow échoue si plus de la moitié des livres reviennent sans la BnF.

## 5. Ce qui n'est pas fait, et pourquoi

- **Suggestions et « tome suivant » sans Google** (taille L) : changement de l'application (écran de suggestions, ses règles), pas du service. Les données nécessaires existent déjà (`/v1/series`, champ `position`). À traiter après l'essai sur téléphone, avec ta fiche.
- **Page « nouveautés / sorties à venir »** : le plan la conditionne au test de fraîcheur. Premier chiffre favorable (Hardcover connaît 100 % des livres anglais et 72 % des français avant leur sortie, avec leur date), décision **après le relevé du 19 octobre** et ton avis sur l'intérêt produit.

## 6. À faire par Kinder

1. Ajouter le secret de dépôt GitHub **`HARDCOVER_API_KEY`** (la valeur de `.env`), en plus de `SUPABASE_URL` et `SUPABASE_SERVICE_KEY` : sans lui, les workflows de fraîcheur et de réchauffement échouent avec un message clair.
2. Le **19 octobre** : `node --env-file=.env scripts/fraicheur.mjs rapport` (ou me le demander).
3. Après un mois d'usage : ouvrir `/v1/status` et relever la part servie par le cache (objectif ≥ 80 %).
