# Rapport — vieilles issues v7 (écrans)

Branche `claude/ecrans-vieilles-31-10-v7` (base : integration/recette-31-10-soir). Pas de PR (le fil intègre).
SHA : 2e77231a (/pipeline) · 7221fdaf (#2915.3) · 3141abf4 (API archivés) · 2bf50a56 (hook + fragment) — voir `git log`.

- **#2915.3 FAIT** — `apps/web/src/features/accounts/lib/analysisRuns.ts:73` (`formatRunDate`) : « 31/10 à 14:05 » en heure LOCALE via `formatDate` (`lib/locale`), année seulement hors année en cours, « — » si date inconnue ; clé `runs.dateAt` FR+EN (`accountDetail.json`). Avant : UTC figé « DD/MM/YYYY HH:mm » (l'heure y était, mais en UTC et non localisée). « Mes analyses » (`AnalysisHistoryPage`) utilisait déjà `formatDateTime` : déjà juste.
- **Archivage FAIT** — deux causes : (1) API `projects.service.ts` `listForWorkspace` rendait aussi les archivés → carte au kanban après rechargement ; exclus par défaut, la fiche (`id`) et `archived=only` gardent la leur. (2) Web `useArchiveOpportunity.ts:21` n'invalidait que `['projects']` alors que le kanban est sous `['opportunities','list']` ; nouvelle racine `projectQueryKeys.opportunities`.
- **/pipeline FAIT** — `legacy-addresses.ts` → `/projects`, requête + ancre gardées (`legacy-addresses.test.ts`).
- Tests ajoutés : `useArchiveOpportunity.test.tsx` (rouge→vert), 2 cas `projects.service.spec.ts` (1 rouge→vert), cas `formatRunDate` + 2 cas /pipeline. Verts : 71 fichiers sections/analysisRuns, 44 projets, jest projects.service (65). Le test /pipeline n'a pas été vu rouge avant le code.
- `tsc -p apps/web` : voir fin de ce fichier / non confirmé si absent. tsc api non lancé (ts-jest a typé le service).
- Hors périmètre touché : aucun. Fragment `changes/ecrans-vieilles-31-10-v7.yml` (non fusionné, non validé par fusion_fragments).
- Non fait : vérification visuelle en navigateur ; compteur « 1 archivée » relu via `useArchivedProjects` (clé sous `['projects']`, invalidée).
- Choix à valider : l'exclusion des archivés vaut aussi pour `?account_id=` (seul `id` les garde).
- tsc web : bruité par TS6305 (contracts/dist non construit, pas de build en cloud) ; aucune erreur propre aux fichiers touchés.
