# PROJET_CONTEXTE — « Vault Books API »

> Document de cadrage : pourquoi ce projet existe, ce qui est décidé, où en est-on. Le fonctionnement détaillé est dans
> `docs/architecture-fonctionnement.md`, l'exploitation dans `docs/exploitation.md`, la suite dans `docs/plan-complet.md`.
>
> **État au 2026-10-05 : en ligne et stable** — https://vault-books-api.vercel.app (Vercel) + Supabase + GitHub `Kinder2149/vault-books-api`.
> 5 routes de données, journal, entretien nocturne, mode économie, limite par client, outil de correction, sauvegarde des corrections.
> 119 tests automatiques ; contrôle en ligne `npm run smoke` : 14/14 ; pertinence 13/13 requêtes et 3/3 sagas de référence.
> **Pas encore fait** : essai sur téléphone et fusion côté Vault Read, réponse de Hardcover, éléments de conformité (voir `docs/plan-complet.md`).

## 1. Pourquoi ce projet

Vault Read interrogeait Google Books, Open Library et la BnF en direct depuis le téléphone. Aucune de ces sources n'est faite pour retrouver un livre :
l'ordre d'une saga se devinait par expression régulière sur le titre, les couvertures se rattachaient à l'œuvre et non à l'édition (couvertures du mauvais tome),
Google tombait en panne par rafales (1 000 requêtes/jour partagées). **Décision : sortir le tri de l'application** et le confier à un service à part.

Cas de test fondateurs : « game of thrones », « seigneur des anneaux » (saga complète, dans l'ordre, sans mélange d'éditeurs) et « Les Chevaliers d'Émeraude » (bonne couverture sur le bon tome).

## 2. Décisions prises (et leur raison, mesurée)

| Décision | Raison | Détail |
|---|---|---|
| **Service séparé** de Vault Read, dont l'app n'est qu'un client | Réutilisable, déployé et corrigé indépendamment | — |
| **Hardcover** comme source principale | Meilleur pour l'ordre des sagas, la popularité et les éditions par langue ; 70 % de couvertures par ISBN | `docs/resultats-mesure-3.md` |
| **BnF** pour les éditions françaises | Dépôt légal : éditeur, année, ISBN ; mais coupe les clients rapides | `docs/resultats-mesure-2.md` |
| **Open Library** pour les couvertures de repli | 40 à 60 % de couverture française par ISBN | idem |
| **Google Books abandonné** | 0 résultat constaté sur nos requêtes, quota de 1 000/jour | `docs/resultats-mesure-2.md` |
| Hébergement **Vercel + Supabase**, gratuit | Fonctions sans mise en veille, base avec tableau de bord pour les corrections | `docs/mise-en-service.md` |
| **Cache** plutôt que copie du catalogue | Moins de travail, moins de risque juridique, suit Hardcover à jour | `docs/architecture-fonctionnement.md` §6 |
| **Corrections manuelles** qui gagnent toujours | Aucune source n'est parfaite (Trône de fer, Seigneur des anneaux) | `docs/exploitation.md` §6 |
| Vault Read garde ses **anciennes sources en repli** | Le service ne doit jamais rendre l'application moins fiable | `vault-read` : tranche 33 |

## 3. Les besoins d'origine, et où ils en sont

| Besoin exprimé | État |
|---|---|
| Une recherche pertinente par titre | ✅ 13/13 requêtes de référence ; ~40 requêtes variées essayées ; jeu élargi à faire (plan, phase 2) |
| La saga complète, dans l'ordre, sans mélange d'éditeurs | ✅ 3/3 sagas de référence, plus Dune, Harry Potter, Hunger Games… |
| Les bonnes couvertures | ✅ 100 / 100 / 95 % de couvertures réelles sur les 3 sagas ; mesure à grande échelle à faire |
| Français ou anglais au choix | ✅ paramètre `lang` ; noms de sagas français seulement pour les 3 de référence (plan, phase 2) |
| Scan de code-barres | ✅ `/v1/isbn/:isbn` (pages, éditeur, couverture de l'édition) |
| Hébergement gratuit | ✅ Vercel Hobby + Supabase Free ; limites à garder en tête dans `docs/conformite.md` §4 |
| « Un livre qui sort demain, quand est-il dans ma base ? » | ⏳ Dès que Hardcover le connaît (≤ 24 h pour une saga en cours après le rafraîchissement nocturne, à construire) ; **non mesuré** |
| Recherche par auteur, résumés | ⏳ non faits |

## 4. Questions ouvertes

- **Hardcover** : cache accepté ? usage public ? attribution ? (`docs/conformite.md` §1 — message prêt, à envoyer par Kinder)
- Statut de Vault Read : personnel, gratuit public, monétisé ? (conditionne les offres d'hébergement)
- Fraîcheur et capacité à mesurer (`docs/plan-de-tests.md` D et E).

## 5. Index des documents

| Document | Contenu |
|---|---|
| `README.md` | Démarrer, routes, commandes |
| `docs/architecture-fonctionnement.md` | Comment ça marche, **état réel** |
| `docs/exploitation.md` | Surveiller, réparer, corriger ; secrets ; échéances |
| `docs/plan-complet.md` | Ce qu'il reste à faire, en phases, avec critères |
| `docs/mise-en-service.md` | Création de Supabase, GitHub, Vercel |
| `docs/conformite.md` | Hardcover, BnF, Open Library, hébergement ; message à Hardcover |
| `docs/plan-de-tests.md` | Tests A à E et leurs seuils |
| `docs/resultats-mesure-1.md` … `-3.md` | Mesures des sources (historiques) |
| `docs/analyse-vault-read.md` | Ce qu'on a repris de Vault Read |
| `archive/prototype-mesures/` | Scripts de mesure jetables (non maintenus) |
