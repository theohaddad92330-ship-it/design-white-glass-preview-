base : 6ea2f13b1 — 21/09/2026 (réconciliation ; base précédente 93f7a4044089d826632ba1d8fff544e0dd962cba — 18/09/2026) ‖ réconcilié contre 7d11787d9be5e0e7f17102e0ffcd5b39bfb5a379 — 22/09/2026 (R2, +298 commits) : 24 points retenu revérifiés (need-status.ts, need-vagueness.ts, need-verdict.ts, submission.entity.ts, chat_tools.py) — seul commit pertinent est #2679 (offer_reply_options), sans rapport ; 0 flip

25/09/2026 (agent feat/reste-2323-25-09, branche `feat/reste-2323-25-09`) — les 24 `retenu`
repris un par un contre `origin/main` + `origin/integration-vague-42-25-09` (rien de pertinent
sur cette dernière : 18 commits, aucun ne touche need-status/need-verdict/submission/chat_tools).
Les annotations « RECLASSÉ 24/09 : raison floue » de la veille ne citaient aucune preuve — reprises
ici avec preuve fichier:ligne à chaque fois. Résultat : **3 livrés** (.13, .30, .47 — une seule
porte MATCHER, `needMatcherGate`), **1 flip vers déjà là** (.28 — `channel`), **20 restent retenu**
avec une raison PRÉCISE (pas une même phrase recopiée) : 2 attendent une décision de forme (.18,
.22), 2 sont des agrégations Submission→Need à câbler (.23, .25, pointeurs donnés), 2 restent des
petites features déjà possibles en texte libre mais pas encore nommées (.10, .11), et **14** forment
un système cohérent absent — niveau DÉTECTÉ (.1) + moteur de priorisation de questions
(.32/.34/.35/.36) + détection de contradictions (.38-.45) + résumé qualité qui en dépend (.46) :
**épopée**, voir commentaire posé sur #2323.

25/09/2026 (bis, agent `feat/reste-2323-bis-25-09`) — finition des 6 points non-épopée
laissés par le lot précédent. **4 livrés** : .10/.11 (presets « Expiré »/« Non pertinent »
sur `close_cancelled`, `NeedActionsMenu.tsx` — test d'interaction écrit D'ABORD, le
dialogue n'avait aucun test) et .23/.25 (`needHasConsultantAgreement` /
`needHasEngagedConsultant`, `need-submission-gate.ts` — agrégation need-level pure,
sans migration, sur les pointeurs `submission.ts` laissés par le lot précédent).
**2 tranchés sans Louis, restent `retenu`** : .18 (flag 3 états, jamais une dérivation
skills/seniority — fabriquerait un accord CLIENT depuis une donnée interne) et .22
(texte libre, jamais une énumération inventée) — décision écrite pour débloquer un
futur petit lot ; l'implémentation (colonne + migration + service + UI + démo) reste
hors budget de cette session, donc PAS marquée `livré` sans code réel derrière.

# Registre — #2323 LAU-FINAL-064 — need quality gates et qualification progressive

Mesure faite par `git grep` contre `origin/main` (sha ci-dessus). État `écarté` interdit —
tout point qui heurte la doctrine reste `retenu` et part en question (voir rapport de l'agent).
Prior art : `NEED_STATUS_ORDER` (packages/contracts/src/schemas/need-status.ts) porte onze états
(`to_qualify → qualified → to_match → matching → shortlist_ready → submitted → client_review →
won/lost/on_hold/to_reactivate`, + `cancelled`) qui recoupent largement les six NIVEAUX demandés
ici. Ce qui manque : un ÉTAT avant `to_qualify` (DÉTECTÉ), les issues `expiré`/`non pertinent`,
et surtout la fonction de GATE elle-même (aucun `isMatchable`/`canPresent` trouvé — le statut se
stocke, rien ne calcule s'il est atteint). `need-vagueness.ts` documente que la détection de
CONTRADICTION reste `retenu` (même citation que #2322.19/.55).

## #2323 — LAU-FINAL-064 — need quality gates et qualification progressive

| numéro | demande en huit mots | sujet | mesure | état | preuve |
|---|---|---|---|---|---|
| 2323.1 | Niveau DÉTECTÉ : contexte suggère un besoin potentiel | niveau | git grep état avant to_qualify | retenu | ÉPOPÉE 25/09 : aucun état avant `to_qualify` (need-status.ts:17-29) — un besoin « détecté » par Laura en conversation, avant confirmation, suppose une entité/étape distincte de `project_needs`, avec sa détection IA, sa route, son état DB et son écran ; plusieurs jours |
| 2323.2 | Niveau À QUALIFIER | niveau | 'to_qualify' | déjà là | packages/contracts/src/schemas/need-status.ts:18 |
| 2323.3 | Niveau MATCHABLE | niveau | 'to_match'/'matching' | déjà là | packages/contracts/src/schemas/need-status.ts:20-21 |
| 2323.4 | Niveau PRÉSENTABLE | niveau | 'shortlist_ready'/'submitted' | déjà là | packages/contracts/src/schemas/need-status.ts:22-23 |
| 2323.5 | Niveau PRÊT À ENGAGER | niveau | 'client_review' | déjà là | packages/contracts/src/schemas/need-status.ts:24 |
| 2323.6 | Niveau CLOS (umbrella) | niveau | won/lost/cancelled/on_hold groupés | déjà là | packages/contracts/src/schemas/need-status.ts:25-27,38-45 |
| 2323.7 | Clos : gagné | niveau | 'won' | déjà là | packages/contracts/src/schemas/need-status.ts:25 |
| 2323.8 | Clos : perdu | niveau | 'lost' | déjà là | packages/contracts/src/schemas/need-status.ts:26 |
| 2323.9 | Clos : annulé | niveau | 'cancelled' | déjà là | packages/contracts/src/schemas/need-status.ts:38-45 |
| 2323.10 | Clos : expiré | niveau | preset `NEED_CANCELLED_REASON_PRESETS` (need-actions.ts) | livré | 25/09 (bis) `feat/reste-2323-bis-25-09` : test d'interaction D'ABORD (`NeedActionsMenu.test.tsx`, absent jusqu'ici), puis les presets — deux chips « Expiré »/« Non pertinent » sur le dialogue `close_cancelled` (`NeedActionsMenu.tsx`), remplissent `status_reason` (texte libre, jamais fermé), même principe que `DEFAULT_UNSTAFFABLE_REASONS`. i18n FR/EN (`openNeeds.closeCancelled.presets.*`) |
| 2323.11 | Clos : non pertinent | niveau | idem | livré | 25/09 (bis) : même commit, même preset (« Non pertinent »), même test |
| 2323.12 | Ne jamais obliger à compléter 100 % des champs avant toute action | règle générale | champs `nullable().optional()` massivement | déjà là | packages/contracts/src/schemas/project.ts (quasi tous les champs hors `id`/`account_id`/`title`/`skills`/`headcount` sont `nullable`/`optional`) |
| 2323.13 | Gate MATCHER : travail à réaliser | gate matcher | absent du schéma (#2322.31) | livré | 25/09 `feat/reste-2323-25-09` : `title` obligatoire dès la création (`createProjectNeedSchema`, project.ts) — toujours présent sur un besoin persisté ; porté par `needMatcherGate` (packages/contracts/src/schemas/need-matcher-gate.ts) |
| 2323.14 | Gate MATCHER : compétences indispensables | gate matcher | requiredSkillSchema.required=true | déjà là | packages/contracts/src/schemas/project.ts:784 |
| 2323.15 | Gate MATCHER : séniorité approximative | gate matcher | seniority | déjà là | packages/contracts/src/schemas/project.ts:814 |
| 2323.16 | Gate MATCHER : localisation ou mode de travail | gate matcher | location + remote (#2322.42 résolu 21/09) | déjà là | packages/contracts/src/schemas/project.ts:820 (location), :848 (`remote`, #2173.29) ‖ 21/09 réconciliation : le télétravail cité comme absent (#2322.42) est désormais lui-même déjà là |
| 2323.17 | Gate MATCHER : timing | gate matcher | start_on | déjà là | packages/contracts/src/schemas/project.ts:818 |
| 2323.18 | Gate PRÉSENTER : accord sur le type de profil | gate présenter | git grep accord type profil scope project.ts | retenu | 25/09 (bis) TRANCHÉ SANS LOUIS : ni champ libre, ni dérivation de `skills`/`seniority` — dériver de ces deux champs fabriquerait un accord CLIENT à partir d'une donnée strictement INTERNE (notre propre définition du besoin n'est pas la preuve que le client l'a validée ; doctrine « jamais de donnée fictive »). Forme retenue : un flag à TROIS états (`unknown`/`agreed`/`not_agreed`), même famille que `staffable` (staffable-gate.ts) — UNKNOWN ≠ ZERO, un besoin non encore confirmé avec le client n'est pas « refusé ». Reste `retenu` : la décision débloque le codage (colonne + `updateProjectNeed` + contrôle façon `NeedStaffableControl.tsx` + démo), mais ce lot (migration + service + UI + démo) est hors budget de cette session — non fabriqué en « livré » sans code réel |
| 2323.19 | Gate PRÉSENTER : destinataire | gate présenter | contact_id (champ générique, pas nommé « destinataire ») | déjà là | packages/contracts/src/schemas/project.ts:833 |
| 2323.20 | Gate PRÉSENTER : conditions | gate présenter | constraints | déjà là | packages/contracts/src/schemas/project.ts:840 |
| 2323.21 | Gate PRÉSENTER : budget ou fourchette si nécessaire | gate présenter | budget_cents/target_tjm_cents | déjà là | packages/contracts/src/schemas/project.ts:818,836 |
| 2323.22 | Gate PRÉSENTER : processus | gate présenter | absent (#2322.47) | retenu | 25/09 (bis) TRANCHÉ SANS LOUIS : texte libre, comme `conditions`/`status_reason` (project.ts) — jamais une énumération ni une checklist, qui supposeraient de fixer À L'AVANCE le nombre et le nom des étapes, une décision produit qu'aucune spec ne donne ; le texte libre n'invente rien et reste éditable, exactement le principe qui tient déjà `conditions` (#2323.20) et `availability`/`outcomeDetail` (submission.ts). Reste `retenu`, même raison budgétaire que .18 : la décision débloque un futur petit lot (colonne + schéma + UI + démo), non implémenté ce lot-ci |
| 2323.23 | Gate PRÉSENTER : accord consultant | gate présenter | `needHasConsultantAgreement` (need-submission-gate.ts) | livré | 25/09 (bis) `feat/reste-2323-bis-25-09` : agrégation need-level pure, sans migration — `needHasConsultantAgreement(submissions)` lit `stage`/`substatus` de chaque positionnement du besoin, `true` dès qu'au moins un a dépassé `consultant_agreement_pending` (`ready_to_present` et au-delà, `SUBSTATUS_TRANSITIONS` submission.ts). `withdrawn`/`archived` et `substatus` null sur `shortlisted` restent `false` — AMBIGUS, jamais fabriqués en preuve positive. 17 tests (`need-submission-gate.test.ts`) |
| 2323.24 | Gate DÉMARRER : validation client | gate démarrer | status='client_review' (état, pas booléen dédié) | déjà là | packages/contracts/src/schemas/need-status.ts:24 |
| 2323.25 | Gate DÉMARRER : consultant engagé | gate démarrer | `needHasEngagedConsultant` (need-submission-gate.ts) | livré | 25/09 (bis) : même fichier, même commit — `needHasEngagedConsultant(submissions)` = `true` dès qu'un positionnement a `stage==='accepted'` (couvre `selected` ET `converted_to_mission`, les deux retombent sur ce stage — `SUBSTATUS_TO_STAGE`, submission.ts). Pas d'ambiguïté substatus/null ici : le stage seul suffit |
| 2323.26 | Gate DÉMARRER : dates | gate démarrer | start_on/duration_months | déjà là | packages/contracts/src/schemas/project.ts:818-819 |
| 2323.27 | Gate DÉMARRER : conditions commerciales | gate démarrer | budget_cents/target_tjm_cents (recoupe 2323.21) | déjà là | packages/contracts/src/schemas/project.ts:818,836 |
| 2323.28 | Gate DÉMARRER : chaîne contractuelle | gate démarrer | git grep chaîne contractuelle scope project.ts | déjà là | 25/09 FLIP : `channel` (project.ts:892, `NEED_CHANNELS` = `direct`/`partenaire`/`portage`, project.ts:791-799) EST la chaîne contractuelle — direct client, via partenaire, ou portage. Raison manquée les fois précédentes faute d'avoir cherché le terme métier plutôt que la traduction littérale |
| 2323.29 | Une inconnue réduit la confiance | UNKNOWN≠ZERO | staffable='unknown' + doctrine non-mesuré-nommé | déjà là | packages/contracts/src/schemas/project.ts:851-853 |
| 2323.30 | Une inconnue produit une question ou une action | UNKNOWN≠ZERO | git grep question générée depuis inconnue scope need | livré | 25/09 `feat/reste-2323-25-09` : `needMatcherLaunchTooltip` (apps/web/.../open-needs/model/need-matcher-gate-label.ts) NOMME les critères MATCHER manquants (séniorité/localisation-mode/timing) au lieu de rester muet, sans jamais bloquer dessus (#2323.31) |
| 2323.31 | Une inconnue ne rend jamais automatiquement le besoin mauvais | UNKNOWN≠ZERO : no-go | need-vagueness.ts (« vague ≠ incomplet ») + doctrine GA-18/19 | déjà là | packages/contracts/src/schemas/need-vagueness.ts:11-16 |
| 2323.32 | Choisir la question qui change le plus le matching | questions priorisées | git grep priorisation question scope need | retenu | ÉPOPÉE 25/09 (avec .34/.35/.36) : `needVerdictPriorityQuestion` (need-verdict.ts) priorise un axe DIFFÉRENT (GO/NO-GO staffing : economics/feasibility/etc., scope confirmé différent depuis toujours sur ce registre). Un moteur de priorisation dédié à la QUALIFICATION du besoin (5 axes : matching/économie/faisabilité/consentement/timing, avec un poids relatif à trancher) est un système de décision à concevoir, pas une lecture de champ ; plusieurs jours |
| 2323.33 | Choisir la question qui change le plus l'économie | questions priorisées | need-verdict.ts axe 'economics' (scope différent : verdict staffing) | recetté | LIVRÉ branche feat/le-dossier-propose-son-recalcul-19-09 (d9e0fc4df) : needVerdictPriorityQuestion (need-verdict.ts) → NeedVerdictBanner.tsx:143-155 « Laura demande d'abord : Économie » + pourquoi ; tests 39/39 + 8/8. ‖ RECETTÉ R25 19/09 prod web/api/ia `501526d63` /projects/needs/975d5ad9-… (« Développeur Java / Spring Boot », LVMH) : « Laura demande d'abord : Économie — sans TJM cible ni plancher, aucun « oui » n'est possible ». |
| 2323.34 | Choisir la question qui change le plus la faisabilité | questions priorisées | need-verdict.ts axe 'feasibility' (scope différent) | retenu | ÉPOPÉE 25/09 — même moteur que .32 |
| 2323.35 | Choisir la question qui change le plus le consentement | questions priorisées | git grep consentement scope need | retenu | ÉPOPÉE 25/09 — même moteur que .32 ; « consentement » n'existe nulle part comme axe |
| 2323.36 | Choisir la question qui change le plus le timing | questions priorisées | idem | retenu | ÉPOPÉE 25/09 — même moteur que .32 |
| 2323.37 | Ne jamais demander tout ce qui manque en une fois | questions priorisées : no-go sur-questionnement | ambiguite_deja_demandee (#2300.38, infra voisine) | déjà là | apps/ia/app/models/request_intent_contract.py:83-85 (« pas deux tours de clarification ») — discipline générique, pas prouvée spécifique aux besoins |
| 2323.38 | Détecter : démarrage immédiat + processus en 4 étapes | contradictions | need-vagueness.ts confirme absent | retenu | ÉPOPÉE 25/09 : `git grep contradiction` sur origin/main ne rend QUE deux concepts sans rapport (contradictions de FICHE COMPTE, PDF 6 §5.3, endpoint-guards.spec.ts:797 ; contradiction d'ONBOARDING, product-tracker-emits-no-content.spec.ts:90) — rien pour les besoins. Dépend en plus de `presentation_process` (.22), absent |
| 2323.39 | Détecter : senior demandé + budget junior | contradictions | idem | retenu | ÉPOPÉE 25/09 — même moteur que .38 |
| 2323.40 | Détecter : full remote + présence cinq jours | contradictions | idem | retenu | ÉPOPÉE 25/09 — même moteur que .38 |
| 2323.41 | Détecter : freelance exclu + utilisateur ne place que des freelances | contradictions | idem | retenu | ÉPOPÉE 25/09 — même moteur que .38, ET données CROSS-DOMAINE (profil de l'utilisateur, hors `project_needs`) |
| 2323.42 | Détecter : mission longue + budget non validé | contradictions | idem | retenu | ÉPOPÉE 25/09 — même moteur que .38 |
| 2323.43 | Détecter : habilitation obligatoire non disponible | contradictions | idem | retenu | ÉPOPÉE 25/09 — même moteur que .38, ET données CROSS-DOMAINE (vivier consultants, `clearances`) |
| 2323.44 | Nommer la contradiction détectée | contradictions | idem, mécanisme absent | retenu | ÉPOPÉE 25/09 — dépend des 6 détecteurs (.38-.43), aucun n'existe |
| 2323.45 | Proposer un arbitrage sur la contradiction | contradictions | idem | retenu | ÉPOPÉE 25/09 — dépend de .44 |
| 2323.46 | Produire un résumé qualité (« matchable mais pas présentable, il manque X ») | quality summary | git grep quality summary scope need | retenu | ÉPOPÉE 25/09 : `qualitySummary`/`quality_summary` absent partout (git grep, 0 résultat). Un résumé « matchable mais pas présentable » suppose que le gate PRÉSENTER existe (.18/.22/.23 non résolus) — dépendant, pas isolable |
| 2323.47 | Ne jamais lancer un matching ou un push si le critère bloquant principal est inconnu | NO-GO (explicite de l'issue) | aucune gate de blocage trouvée avant matching | livré | 25/09 `feat/reste-2323-25-09` : `needMatcherGate(need).canLaunch` (packages/contracts/src/schemas/need-matcher-gate.ts) — SEUL critère décisif = compétences, source unique remplaçant 3 vérifications dupliquées (ProjectNeedsPanel/NeedDetailPage/OpenNeedsTable). Le NO-GO sur le « push profil » (présentation d'un candidat) n'a pas d'équivalent trouvé — non couvert, à vérifier séparément |
