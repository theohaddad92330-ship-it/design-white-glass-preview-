# Rapport N3 — branche `claude/listes-compteurs-28-10`

Constat : les six points (#4643 #4644 #4660 #4661 #4659 #4649) sont DÉJÀ corrigés sur `origin/main` (commits du 27/10 : 581ccec6, ac3abad2, b29384c0, fc9682f6, ea5f47cc, c973e5b1, 7591ecc4). Relus un par un ; seule la garde de famille de #4659 manquait. Détail et preuves : `.claude/notes/registre-2026-10-28-n3.md`.

- #4643 → `AccountsCrmChip.tsx:12-31` (appelant `AccountsPage.tsx:205-209`), bande `AccountsPage.tsx:432-511` → tests `AccountsSourceExclusion.test.ts`, `AccountsKeyFigures.scoped.test.tsx`. État vide nommé : `AccountContent.tsx` (`emptyFiltered.notInSource`, fr+en).
- #4644 → `contactsPager.ts:6` (appelant `ContactContent.tsx:776`, `disabled` `:1514`) → `contactsPager.test.ts`. Pas d'autre liste ne partage ce pager ; jumeau import déjà borné (`pageBounds`).
- #4660 → `contacts.service.ts:331-340,3920` → `contacts.service.channel-tally.spec.ts:185` (jamais relancé ici : jest API non demandé hors périmètre, tests du 27/10 verts en CI).
- #4661 → `ContactsRecommendedToggle.tsx` (appelant `ContactContent.tsx:1363`) → ses deux tests.
- #4659 → pastille `AccountTableRow.tsx:603` → `AccountsTable.accessClass.test.tsx` ; NOUVEAU : garde `architecture/a-label-never-glues-an-initial-to-a-word.test.ts` (famille, locales fr+en ; seul nom propre toléré : OAuth).
- #4649 → `AccountKnowledgeCounters.tsx:54` (prédicat `countListedEntities` partagé avec Sites) → `AccountKnowledgeCounters.test.tsx`.

Mesures avant/après : non rejouées sur donnée de prod (VM sans accès) ; les valeurs de recette sont dans les issues, les tests du 27/10 les gardent.
Portes : `turbo build --filter='./packages/*'` exit 0 ; vitest 5 specs existantes (34 tests) exit 0 ; nouvelle garde 3/3 exit 0 (rouge d'abord sur « OAuth », corrigé). Pas de tsc complet (interdit VM).
Questions : aucune d'antériorité. Produit : « 5 entités / 4 documentées » a été résolu par UN prédicat (pas de sous-ensemble nommé) — conforme à l'option 1 de #4649.
Jumeaux nommés : aucun nouveau. Rien de BoondManager touché.
