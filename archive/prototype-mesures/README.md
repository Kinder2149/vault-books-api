# Scripts de mesure archivés

Scripts JETABLES écrits le 2026-10-05 pour **mesurer** les sources (BnF, Open Library, Wikidata, Google Books, Hardcover) avant de construire le service.
Leurs résultats sont dans `docs/resultats-mesure-1.md`, `-2.md` et `-3.md` ; ils ne servent plus au fonctionnement du projet et **ne sont pas maintenus**.

- Ils ne sont pas lancés par les tests ni par l'intégration continue.
- `mesure.mjs` lit une fonction pure de Vault Read (`../../../vault-read/client/src/tomes.js`) : il suppose que les deux dépôts sont voisins.
- Les sorties vont dans `archive/prototype-mesures/out/` (non versionné).
- Pour contrôler le service **aujourd'hui**, utiliser les scripts de `scripts/` : `npm run test:c`, `npm run planche`, `npm run smoke`, `npm run verifier:supabase`.
