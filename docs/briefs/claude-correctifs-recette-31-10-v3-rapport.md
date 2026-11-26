# Rapport — correctifs recette prod 31/10, vague 3 (branche claude/correctifs-recette-31-10-v3)

SHA : f7375960 (#4197.2 #4167.3) · 5e8ad8a3 (#4197.4) · 841be20d (brouillon) · 2acf77d2 (#2276.61) · 9409b540 + suivants (#2732.1 #5022.1) · dernier : voir `git log`.

- **#4197.2/#4167.3 FAIT** : `apps/web/src/lib/legacy-addresses.ts:63-72` — `/missions/board`→`/missions?vue=liste`, `/actions/chaines` et `/pilotage/parcours`→`/pilotage#parcours` ; le réécrivain accepte une cible avec recherche/ancre (celles de l'ancien lien gagnent). Jumelles : `/consultants/submissions`, `/projects/pistes`, `/consultants/pool`, `/missions/renouvellements` étaient déjà couvertes ; `/actions/ecritures` et `/favorites` laissées « introuvable » (garde #4359 `route-migration-registry.test.ts`, à re-trancher par Louis).
- **#4197.4 FAIT** : `planning-views.ts:69-90` (puces `ending60`/`ending90`, cumulatives), `PlanningTable.tsx` (colonne Renouvellement, « — » si inconnu), locales FR+EN.
- **#2732.1/#5022.1 FAIT** : `import-writer.service.ts` `writeMissions` ; `mission` ajouté à `WRITABLE_IMPORT_OBJECTS` (`import.ts:172`) — aucune migration (`import_sessions.type` accepte déjà `mission`, statuts `active`/`ready_to_start`/`archived` déjà dans la contrainte). Lignes refusées nommées (n° + motif) dans `report.errors`. Annulation = statut `archived`. Formats dits avant dépôt : `CreateMissionFromDocumentDialog`.
- **#2732.2 DÉJÀ JUSTE (écriture)** : `import-writer-talents.spec.ts` prouve la création des talents ; refus de CV nommés par fichier (rapport existant). Ajouté : ligne « Formats lus » dans `CvZipImportDialog`.
- **#2276.61 FAIT** : `laura-job.executor.ts` `announce` — cloche aussi sans fil d'origine (lien `/chat`), aussi sur `markUnknown`, échec journalisé (plus avalé) ; destinataire = `run.user_id` seul.
- **Brouillon FAIT** : `composer-draft.ts` — « new » propre à l'onglet (sessionStorage), conversation = sa clé.
- Tests ajoutés : legacy-addresses (+8), planning-views/PlanningPage (+4), composer-draft (+4), laura-job.executor (+4, 1 témoin réécrit), import-writer-missions (4), import-resume (+1), ImportWizardErrors (+1), dialogues formats (+2). Verts en ciblé ; web `tsc` non vérifiable (dist contracts absent), API `tsc` propre sur import/action-os.
- Tests existants adaptés (évolution voulue, pas d'affaiblissement) : `import.test.ts` (liste writable à six), témoin « sans conversation » #2276.62, PlanningPage (six colonnes).
- Fichier hors périmètre : `changes/correctifs-recette-31-10-v3.yml` (fragment changelog, format README). Non fait : `pnpm ci:local`, démo (aucune donnée affichée nouvelle), ligne affectation consultant à l'import (non devinée).
- Question : valider `/missions?vue=liste` comme destination de l'ancien Board.
