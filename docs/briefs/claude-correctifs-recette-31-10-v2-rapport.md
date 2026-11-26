# Rapport — correctifs recette prod 31/10, vague 2

Branche `claude/correctifs-recette-31-10-v2` (SHA de tête : voir le dernier commit). Deux sessions ont poussé sur la même branche (réécritures du brief, #4523.1 et #3803.2 faits en double) : rebase sans force, doublon retiré.

- **#4523.1** — fait par l'autre session (`03eff67b`, `ContactDetail.tsx`, garde `ContactDetail.layout.test.ts`). De mon côté : non reproduit sur le code de `main` (DOM réel + Tailwind compilé dans Chromium : aside au sommet de la grille, épinglé à 16 px à 1500 et 3000). Test = structure seulement (jsdom ne met rien en page). À re-mesurer en prod après déploiement.
- **#4193.2** — `987b9079` : `PipelineSummaryLine.tsx` (« N actives » + « N gagnées, à part »), `model/pipeline-total.ts` (`activeAndWonCounts`), `PipelineBoard.tsx`, `ProjectsPage.tsx`, locales FR+EN. Tests : `PipelineBoard.test.tsx`, `PipelineBoard.theoFigures.test.tsx`, `ProjectsPage.v22.test.tsx`. Le tableau garde toutes les lignes (#4291.8) ; les gagnées sont nommées à part.
- **#3803.2** — cause : le texte (csv/txt/json) partait sans `filename`, `persistDocumentSource` ne rangeait rien. `ceb521fb` (Chat, Connaissances) + `88e6479d` (analyse, import de contexte). Dépôts neufs seulement. Tests : `Knowledge.test.tsx`, `useAnalysisAttachments.test.ts`.
- **#2408.81** — `AskLauraMenuItem.tsx` (nouveau), `AskLaura.tsx` (`useAskLauraChatSearch` partagé), `MissionsTable.tsx:~700`. Revient sur #4194 (test inversé dans `MissionsTable.test.tsx`).
- **#4526.3** — `FollowedAccountsSection.tsx` (prop `crmAccountIds`, intersection, état vide nommé), `AccountsPage.tsx`. Limite : l'intersection porte sur les comptes CRM déjà chargés par la liste (première page). Tests : `FollowedAccountsSection.test.tsx`, `AccountsPage.followedLens.test.tsx`.
- **#2212.15** — `fill-and-advance` retiré (`guide-store.ts`, `GuideHost.tsx`, `fillGuideAnchorField`), clés orphelines retirées FR+EN. #3646 gardé. Test : `guide-registry.test.ts`.
- **#3586.9** — déjà juste : entrée `2026-10-04-drive-interne-rag-produit` (`entries.ts:1958`, `labels.fr.ts:7506`, `labels.en.ts:7425`). Rien à ajouter.

Non lancé : `pnpm ci:local`, `tsc` (contracts non buildé en VM), suite complète. Aucun fichier hors périmètre.
