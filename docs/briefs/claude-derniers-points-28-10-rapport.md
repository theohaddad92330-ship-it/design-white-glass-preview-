# Rapport lot N12 — `claude/derniers-points-28-10` (SHA : voir `git log` de la branche, poussée)

Bilan : 18 points. 6 livrés (code + garde), 5 déjà là (preuve lue, garde citée), 7 retenus avec raison. Registre : `.claude/notes/registre-2026-10-28-n12.md`. Aucun navigateur, aucun accès prod, pas de pytest (pas de venv `apps/ia`) : tout ce qui est IA ou prod est lu, jamais rejoué.

- **#4285.1** livré — `CandidateRow.tsx` (sujet › `candidate-subject-proof`, appelé par la liste Découvrir) ; `FactSourceLink`/`formatFactDate` extraits de `CandidateFacts.tsx` (un seul rendu du lien) ; garde `CandidateRow.subjectProof.test.tsx` (sans URL : aucun lien).
- **#4524.9** livré — `approach-grounding.ts:60` + `approach-api.ts` (`website`) → `useApproachGrounding` ; garde `approach-grounding.test.ts`.
- **#4600.4** livré — `team-guardrails.service.ts` `contactDuplicates` + `emailProvesIdentity` (`contact-duplicate-proposals.ts`) ; garde `team-guardrails.duplicates.spec.ts`.
- **#4529.5** livré (garde seule, comportement déjà correct) — `context-contract.controller.spec.ts`.
- **#4471.7** code livré (journal `durationMs`/fiches lues, `duplicates.sweeper.ts`), mesure prod à faire → retenu.
- **Déjà là** : #4293.7 (`chat_tools.py:12158`), #4420.4, #4519.2, #4574.7 (+2 tests vue Entreprises), #4597.7, #4593.4 (décision 27/10 à confirmer).
- **Retenus** : #4287.4 (comportement modèle), #4291.8, #4295.26 (non spécifié), #4419.8, #4465.1 (donnée absente), #4523.5 (navigateur), #4556.3.

Jumeaux possibles non touchés (hors périmètre, à vérifier) : lecture de `recent_signals` sans filtre d'homonyme dans `notifications.service.ts:693`, `outreach-message.service.ts:1251`, `contacts.service.ts:2514`. `admin/identity-duplicates.ts` porte sa propre copie de `SHARED_BY_MANY_MIN` (GA-26).

Portes : vitest ciblé (approach 6 specs, discover CandidateRow/Facts 108+33, personNameRail 8) exit 0 ; jest ciblé (context-contract, team-guardrails 40, duplicates.sweeper 44) exit 0 ; `turbo build` packages exit 0 ; typechecks web et api-tests : voir fin de ce fichier.

Questions : (1) #4556.3 — une levée sur un compte RÉEL de la liste contredit « jamais de donnée fictive » en démo ; on la laisse venir des fils de levées en prod ? (2) #4291.8 — le verdict du brief est tronqué (« section h… ») : quel défaut reste sur la section des gagnés ? (3) #4295.26 — quelle spec pour l'organigramme enrichi ? (4) #4593.4 — Louis confirme la formulation du 27/10 ? (5) #4287.4 — accepter une règle de prompt « question de même forme = même famille » malgré l'absence de mesure ?

Typecheck web (tsc --noEmit) : exit 0, 0 `error TS`. API `check-types:tests` : exit 0, 0 `error TS`.
