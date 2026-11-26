# Rapport N4 — claude/laura-dit-vrai-28-10

Branche `claude/laura-dit-vrai-28-10`, poussée (pas de PR). Registre : `.claude/notes/registre-2026-10-28-n4.md`.

- **#4631.1** — `prose_card_consistency.py` `drop_prose_promising_missing_list` ; appelant `chat_orchestrator.py` (après `drop_prose_contradicting_cards`). Test : `test_4631_prose_promet_liste_absente.py` (rouge → vert, sait dire NON : carte, puces, table, nombre sans annonce). Le volet « carte alimentée par la même collection » était déjà là (vague XIV, `test_4631_annonce_liste.py`).
- **#4705.1** — `known_shape_gate._unbuilt_how` : « pas dans ton espace » exige `workspace_found == 0` (posé par `chat_orchestrator.py` sur l'entrée d'action de `search_workspace_accounts`) ; comptes trouvés → « sont bien dans ton espace » ; recherche sans résultat lu → conseil générique. Test : `test_4462_laura_liste_noms.py` (+2, 1 adapté).
- **#4671.1** — cause : `AnalysisBatchesService.list` ne relisait jamais les sous-jobs en vol (seul `get` le faisait). `list(workspaceId, createdBy?, live?)` + `analysis-batches.controller.ts` GET. Test : `analysis-batches.service.spec.ts` (+2).
- **#4667.1** — `PendingActions.tsx` (clic « Lancer l'analyse ») n'invalidait pas la liste des comptes (`staleTime` 30 s) que « Mes analyses » lit. Test : `PendingActions.test.tsx` (+2).
- **#4655, #4656** — déjà là (commits 922b2a04, a18dd684), gardes et tests présents ; rien recodé.

**Jumeaux / limites** : `copilot-work-status.controller.ts:103` appelle `list` sans ports → l'état des lots lu par Laura (#4611) reste l'état stocké (non corrigé : pas de ports dans ce contrôleur). Une analyse lancée par « go » côté serveur (outil, `ia-proxy.controller.ts:591`) n'invalide pas le cache web des comptes.

**Portes** : pytest ciblé (4631×2, 4462, 3857, 3859, 3905, 4438) = 0 ; jest `analysis-batches` = 0 ; vitest `PendingActions.test.tsx` 196/196 = 0 ; turbo build packages = 0. tsc web = 0 (0 `error TS`) ; `check-types:tests` api = 0.

**Questions** : (1) #4705.2 — pourquoi la carte `comparison` est refusée en prod pour Servier/Sanofi/Thales n'est pas reproductible sans la réponse brute de `compare_accounts` ; à tracer avec le journal du tour 34ca5aec. (2) Mesure « annonces suivies d'un rendu » avant/après sur 3 conversations et garde `promptfoo (Laura)` : exigent le modèle et ses clés, non exécutés ici — à passer en CI. (3) Démo (règle 9) : aucune donnée nouvelle affichée, rien à semer.
