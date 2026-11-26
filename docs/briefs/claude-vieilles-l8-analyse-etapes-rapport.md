# Rapport — claude/vieilles-l8-analyse-etapes (L8, #2164)

Branche `claude/vieilles-l8-analyse-etapes`, depuis `origin/main` cd8c482d. Aucune PR (le fil l'ouvre).

## Par point

- **2164.38** contacts non reconfirmés nominatifs — livré `f957c1dc` (RefreshOutcomeCard : liste des noms ; libellé « non reconfirmé », jamais « parti », garde #2318.4). Démo déjà semée (`demo-dataset.ts:2271`).
- **2164.39** nouvelles entités nominatives — livré `f957c1dc` (même carte).
- **2164.29** « Ce que nous savions déjà » — livré `0bef0126` (AccountChangesCard : compte du dossier AVANT vérification, le neuf retiré ; rien de connu ⇒ aucune section, jamais « 0 »).
- **2164.30** « Ce qui est nouveau » — livré `0bef0126` (section nommée au-dessus des lignes datées). Démo : Société Générale (#4180, déjà seedée).
- **2164.34** « Ce que je ferais maintenant » — livré `0bef0126` (intitulé `bellumRead.nextAction` FR/EN, accountDetail.json ; aucun composant du bandeau « Le regard de Laura » touché).
- **2164.17** corriger une ambiguïté pendant le job — livré `784dcf1a` (worker) + `cddd66f6` (routes + carte) :
  pause = job BullMQ différé (`DelayedError`, comme #2519) portant la question dans `job.data` ⇒ aucune valeur neuve en base, pas de migration ;
  run lancé par NOM seulement, une seule question par run ; réponse = hypothèse ⇒ recherche gardée ; autre SIREN ⇒ recherche relancée verrouillée ;
  sans réponse en 5 min ⇒ reprise sur l'hypothèse (comportement d'avant). Même job ⇒ aucun débit de plus.
  `GET /analysis/:id/entity-question`, `POST /analysis/:id/entity-answer` ; carte `AnalysisEntityQuestionCard` dans les deux rendus « analyse en cours » de `AccountDetail.tsx`.
  Démo : vide à dessein (fragment `changes/`). Correctif `2fa81c9b` : type du spec worker, fiche `agent_docs/pipeline.md` (exigée par « La doc suit le code », hors périmètre déclaré).
- **2164.4 / .5 / .6** étapes réutilisation / recherche actuelle / recherche thématique — **non fait** (débordement, voir Q1).
- **2164.57** sélection transmise à Laura — **non fait** (débordement, voir Q2).

## Tests (rouge → vert)

contracts `analysis.entity-question.test.ts` (5) ; api `analysis-entity-pause.spec.ts` (8), `analysis.worker.spec.ts` (114, dont 5 neufs), `analysis.service.spec.ts` (182, dont 5 neufs) ;
web `RefreshOutcomeCard.test.tsx` (26), `AccountChangesCard.test.tsx` + `BellumReadCard.test.tsx` (19), `AnalysisEntityQuestionCard.test.tsx` (3), `AccountDetail.test.tsx`.
`check-types` + `check-types:tests` @bellum/api et `check-types` @bellum/web : 0 `error TS` ; `pnpm ci:local` vert à chaque push.

## Questions

- **Q1 (2164.4-.6)** — `ANALYSIS_STEPS` ne peut grandir qu'EN FIN (GA-08, `enum-additivity.test.ts`), or `apps/web/src/stores/analysisStore.ts:333-362` déduit l'avancement de l'INDEX : une étape `reuse_existing` émise au début cocherait les 9 étapes d'avant (et `analysis-step-progress.ts` dirait « Étape 10 sur 12 »). Il faut un ordre d'affichage `ANALYSIS_STEP_ORDER` dans le contrat ET le brancher dans `stores/analysisStore.ts`, `lib/analysis-step-progress.ts`, `lib/analysis-subscription.ts`, `components/analysis/AnalysisProgressCard.tsx` — hors périmètre. On l'ouvre ? Émetteurs prévus : réutilisation = worker API (`runViaGraph`, quand `previousAnalysis`/`accountFacts`/`knownContacts`/`crmPresence`/`internalHistory` sont non vides) ; recherche actuelle / thématique = IA `phase1_research.py` (recherche web ~l.1203 ; sources thématiques offres/BOAMP/DECP ~l.990-1150).
- **Q2 (2164.57)** — aucune notion de « sélection » n'existe entre le résultat d'Analyser et Laura. Livrer exige le DTO + contrôleur `ia-proxy.controller.ts` (`chatContext.build`), le composeur du chat web et le bloc de prompt IA ; `chat-context.service.ts` seul serait du code sans appelant. Périmètre élargi ?
- **Q3 (2164.17)** — la réponse n'est pas inscrite comme correction versionnée (`entity_resolution_corrections`, module accounts, hors périmètre) : elle verrouille le run, la recherche relancée écrit le bon verdict. Faut-il aussi la journaliser comme correction humaine ?
- **Q4** — délai d'attente de la question fixé à 5 min (`ENTITY_QUESTION_WAIT_MS`) : à confirmer.

SHA de tête : voir le commit qui ajoute ce rapport (parent `2fa81c9b`).
