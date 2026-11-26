# Brief — intégration des lots 4962 A B C E F G H (retours bêta #4962-#5029)

Plafond : 300 tours (à 240 : commit du vert, push, rapport, stop).
Branche : `claude/integration-4962` (EXISTANTE, part de origin/main, porte ce brief).
Périmètre : apps/web/src/, apps/api/src/, apps/api/scripts/, apps/ia/app/, apps/ia/tests/, packages/contracts/src/, packages/i18n/, docs/briefs/, agent_docs/, changes/

## 1. Fusionner, dans l'ordre

`git merge --no-ff origin/claude/lot-4962-{a,b,c,e,f,g,h}` (un merge par branche, `git fetch` d'abord).
Conflit connu au merge de C : `apps/web/src/features/discover/lib/discover-needs-freetext{.ts,.test.ts}` — garder LES DEUX côtés (fonctions et tests de chaque lot), puis vitest de ce fichier.
Chaque rapport est dans `docs/briefs/claude-lot-4962-<x>-rapport.md` : le lire avant de résoudre un conflit sur ses fichiers.

## 2. Correctif #5016 — « une correction humaine gagne » (arbitrage Louis 31/10 10:55)

Lot F a fait de `consultant_skills` la source qui fait foi : `syncStack` (consultants.service.ts) réajoute à `consultants.stack` les compétences du référentiel après création, après modification et après commit de CV ; le script `apps/api/scripts/consultant-stack-sync-catch-up.ts` rattrape les fiches divergentes.
Défaut : une personne qui RETIRE une compétence de la stack dans le formulaire la voit revenir (syncStack après update réinjecte les compétences d'origine CV ; `pruneDeclaredSkills` n'efface que les `declared`).
À livrer (TDD, test rouge d'abord dans `skill-stack-sync.spec.ts`) :

- une modification humaine qui porte `stack` fait foi : après elle, `syncStack` ne réajoute PAS ce que la personne a retiré (ni à cet enregistrement, ni aux suivants — un commit de CV ultérieur n'y remet que des compétences NOUVELLES pour cette fiche) ;
- le rattrapage `runStackSyncCatchUp` saute toute fiche dont la stack a été corrigée à la main.
- Comment le savoir : cherche d'abord un marqueur EXISTANT (journal d'écriture des champs — `changes` de `update` — s'il est persisté ; `consultant_skills` archivé/`origin`). S'il n'en existe aucun, la voie autorisée : colonne nullable ADDITIVE `consultants.stack_edited_by_human_at timestamptz` (migration ajout seulement, contrainte élargie AVANT le code, GA-11/12), posée par `update` quand `input.stack !== undefined` ; syncStack et rattrapage ne réajoutent rien à une fiche marquée, sauf compétence entrée APRÈS la date. Jamais de suppression de ligne (on archive, on ne supprime pas).
- trace `// #5016.3 — correction humaine gagne` au comportement. Ne lance PAS le script.

## 3. Antériorité — 46 décisions touchées, à nommer

La porte `porte-lot.py anteriorite` (claude-skills : `plugins/livraison/scripts/porte-lot.py`) refuse chaque ligne modifiée qui portait un `#NNN` non nommé. Liste en annexe. Pour CHACUNE : lire la ligne blâmée (avant/après) et `gh issue view N --json title,state` si gh est là, puis écrire une ligne dans `docs/briefs/claude-integration-4962-anteriorite.md` :

- `garde #N — <ce qui est préservé>` (cas courant : ligne déplacée/reformatée, comportement intact) ;
- `revient sur #N — <décision de Louis du 31/10 qui le justifie : contrat du lot X>` (ex. #4399 « sections pliables » revient, voulu par #4965/#5005) ;
- `QUESTION #N — <ce qui change, pourquoi c'est douteux>` si aucune décision écrite ne couvre le changement : NE PAS défaire le code, le dire au rapport.
  Ce fichier est sur la branche, la porte le lit. Relance la porte si le script est disponible : `python3 -u <claude-skills>/plugins/livraison/scripts/porte-lot.py tout --base origin/main --head HEAD --brief docs/briefs/claude-integration-4962.md` (copie le brief en remplaçant `/_` par `/*` dans la ligne Périmètre si Prettier l'a abîmée) — rc et refus restants au rapport.

## 4. Gates, ciblés seulement

Par lot, les specs que son rapport cite (≤ 5 fichiers par lot), + les fichiers touchés par un conflit, + `tsc -p apps/web` et `tsc -p apps/api` (erreurs `@bellum/*` non construits = préexistantes, à nommer). Construire `packages/{contracts,utils,errors,http,observable}` si vitest l'exige. JAMAIS la suite complète, ni check-types racine, ni build : c'est la CI.
Rouge connu préexistant : `apps/ia/tests/test_discover_hiring_depth_4045.py::test_every_card_of_a_full_page_keeps_its_hiring_signal` (rouge sur main) — ne pas corriger, nommer.

## 5. PR

Push, puis `gh pr create --base main --head claude/integration-4962` PRÊTE (pas draft), titre `Retours bêta 31/10 — lots A B C E F G H (#4962-#5029)`, corps : une ligne par issue `Refs #N — livré/déjà là/non fait` (JAMAIS `Closes`/`Fixes` : la clôture suit la recette en production). Fin du corps :
🤖 Generated with [Claude Code](https://claude.com/claude-code)

Puis STOP (ne suis pas la CI).

## Droits

Aucune surface d'accès touchée (porte `droits` : « surface d'accès non touchée » sur les 7 lots). Si un conflit t'y fait toucher (route, menu, permission), STOP et question.

## Je ne fais pas

Pas de nouvelle fonctionnalité ; pas de #4971, #5027.2, #4969.1, #5017.2, #4988.2 (bloqués, questions déjà posées) ; pas de lot I (en vol).

## Rapport

`docs/briefs/claude-integration-4962-rapport.md` (≤ 15 lignes : SHA de tête, n° PR, conflits résolus, correctif #5016 fichier:ligne, compte garde/revient/QUESTION, tests lancés + résultat, rouges préexistants). Commit + push. STOP.

## Annexe — refus d'antériorité (porte du 31/10 12:55)

- lot a : #82 — apps/web/src/components/contacts/RoleBadge.tsx:14 (commit ce660006e, 8 ligne(s))
- lot a : #681 — apps/web/src/features/accounts/view/account-detail/tabs/organigramme/OrgGraphViews.tsx:449 (commit 2bfd8b412, 1 ligne(s))
- lot a : #766 — apps/web/src/features/accounts/view/account-detail/tabs/organigramme/OrgGraphViews.tsx:234 (commit 16578af79, 3 ligne(s))
- lot a : #2366 — apps/web/src/features/accounts/view/account-detail/components/contact-engagement/EngagementCreateCallTask.tsx:57 (commit 384702b8a, 19 ligne(s))
- lot a : #2395 — apps/web/src/features/accounts/view/account-detail/components/contact-engagement/EngagementCreateCallTask.tsx:66 (ligne, 1 ligne(s))
- lot a : #3423 — apps/web/src/features/accounts/view/account-detail/tabs/organigramme/FocalOrgView.tsx:951 (commit e44f7eaab, 4 ligne(s))
- lot a : #3528 — apps/web/src/features/accounts/view/account-detail/tabs/organigramme/FocalOrgView.tsx:951 (commit e44f7eaab, 4 ligne(s))
- lot a : #3687 — apps/web/src/features/accounts/view/account-detail/components/contact-engagement/EngagementCreateCallTask.tsx:66 (commit abc8affa7, 1 ligne(s))
- lot a : #3688 — apps/web/src/features/accounts/view/account-detail/components/contact-engagement/EngagementCreateCallTask.tsx:66 (commit abc8affa7, 1 ligne(s))
- lot a : #3696 — apps/web/src/features/accounts/view/account-detail/components/contact-engagement/EngagementCallBar.test.tsx:31 (commit 558bc0353, 5 ligne(s))
- lot a : #4016 — apps/web/src/features/accounts/view/account-detail/tabs/organigramme/FocalOrgView.tsx:951 (commit 309b032fe, 2 ligne(s))
- lot a : #4072 — apps/web/src/features/accounts/view/account-detail/tabs/organigramme/OrgInfluenceMap.tsx:843 (commit 8374f0379, 3 ligne(s))
- lot a : #4570 — apps/web/src/features/contacts/view/approach/CallApproachBody.test.tsx:126 (commit b8a3871e7, 1 ligne(s))
- lot b : #263 — apps/web/src/features/accounts/view/account-detail/tabs/evaluation/ScoreSummaryCard.tsx:168 (commit 2b5f11b4a, 4 ligne(s))
- lot b : #808 — apps/web/src/features/accounts/view/account-detail/tabs/evaluation/ScoreSummaryCard.tsx:168 (commit 953fe6176, 4 ligne(s))
- lot b : #1343 — apps/web/src/features/accounts/view/AccountsPage.tsx:570 (commit 1188d1346, 25 ligne(s))
- lot b : #1579 — apps/web/src/features/accounts/view/AccountsPage.tsx:570 (commit b949638d5, 1 ligne(s))
- lot b : #1580 — apps/web/src/features/accounts/view/AccountsPage.tsx:570 (commit b949638d5, 1 ligne(s))
- lot b : #1689 — apps/web/src/features/accounts/view/AccountsPage.tsx:570 (commit b949638d5, 1 ligne(s))
- lot b : #1796 — apps/web/src/components/disclosure/CollapsedSection.test.tsx:14 (commit 5fa096d57, 3 ligne(s))
- lot b : #1812 — apps/web/src/components/disclosure/CollapsedSection.test.tsx:14 (commit 5fa096d57, 3 ligne(s))
- lot b : #2117 — apps/web/src/i18n/locales/en/accounts.json:537 (commit bde102001, 2 ligne(s))
- lot b : #3299 — apps/web/src/features/accounts/view/AccountsPage.tsx:570 (ligne, 4 ligne(s))
- lot b : #3300 — apps/web/src/features/accounts/view/AccountsPage.tsx:570 (commit 54ef6875d, 3 ligne(s))
- lot b : #4331 — apps/web/src/features/contacts/view/contact-detail/components/ContactEnrichButton.tsx:35 (commit 28c937927, 1 ligne(s))
- lot b : #4498 — apps/web/src/features/accounts/view/AccountsPage.tsx:579 (commit 9e4388227, 2 ligne(s))
- lot b : #4537 — apps/web/src/features/contacts/view/approach/CallApproachBody.tsx:44 (commit 6dd06c864, 1 ligne(s))
- lot b : #4544 — apps/web/src/features/contacts/view/approach/CallApproachBody.tsx:44 (commit 6dd06c864, 1 ligne(s))
- lot b : #4643 — apps/web/src/features/accounts/view/AccountsPage.tsx:579 (commit 581ccec60, 4 ligne(s))
- lot b : #4752 — apps/web/src/features/contacts/view/approach/approach-grounding.ts:1 (commit b37bd354d, 1 ligne(s))
- lot c : #2104 — apps/api/src/modules/mailbox/thread-account-link.ts:130 (commit 8d6142e49, 2 ligne(s))
- lot c : #3203 — apps/ia/app/routers/discover_signals.py:712 (commit b5f27661b, 2 ligne(s))
- lot c : #3204 — apps/ia/app/routers/discover_signals.py:712 (commit b5f27661b, 2 ligne(s))
- lot c : #3238 — apps/web/src/features/discover/lib/discover-normalize.ts:201 (commit 854ebc06d, 1 ligne(s))
- lot c : #4044 — apps/web/src/features/accounts/view/account-detail/tabs/opportunities/OpportunityCards.test.tsx:232 (commit 75703a2ef, 3 ligne(s))
- lot c : #4386 — apps/web/src/features/accounts/view/account-detail/tabs/opportunities/OpportunityCards.test.tsx:199 (commit d62583e78, 1 ligne(s))
- lot c : #4494 — apps/web/src/features/discover/lib/discover-framing.ts:54 (commit 520fc730e, 3 ligne(s))
- lot c : #4824 — apps/web/src/features/discover/lib/discover-needs-freetext.ts:1 (commit ad8a0e334, 3 ligne(s))
- lot c : #4832 — apps/web/src/features/discover/lib/discover-needs-freetext.ts:1 (commit ad8a0e334, 3 ligne(s))
- lot c : #4907 — apps/web/src/features/accounts/view/account-detail/tabs/veille/AccountJobOffersPanel.test.tsx:21 (commit fddd51824, 10 ligne(s))
- lot c : #4911 — apps/web/src/features/discover/lib/discover-needs-freetext.ts:1 (commit ad8a0e334, 3 ligne(s))
- lot e : #825 — apps/web/src/features/demo/useIsDemo.ts:12 (commit 3e0117bbd, 2 ligne(s))
- lot f : #995 — apps/api/src/modules/consultants/cv-parse.service.spec.ts:763 (commit f48ac095c, 2 ligne(s))
- lot g : #2015 — apps/web/src/features/onboarding/lib/questions/role.ts:3 (commit b4bca93ab, 1 ligne(s))
- lot g : #2018 — apps/web/src/features/onboarding/lib/questions/role.ts:3 (commit b4bca93ab, 2 ligne(s))
- lot h : #3769 — apps/ia/app/services/chat_tools.py:21158 (commit 0311b3d94, 1 ligne(s))

## Annexe — antériorité nommée (voir claude-integration-4962-anteriorite.md)

- garde #82 — ligne (RoleBadge.tsx:14) déplacée/reformatée par un lot 4962, comportement intact (feat(web): server-side list filtering, FilterBar molecule, a)
- garde #263 — ScoreSummaryCard : ligne reformatée par #4991 (lot B), le score reste décomposé en axes
- garde #681 — ligne (OrgGraphViews.tsx:449) déplacée/reformatée par un lot 4962, comportement intact (feat(org-mapping): the OrgGraph « 4 views » on the Organigra)
- garde #766 — ligne (OrgGraphViews.tsx:234) déplacée/reformatée par un lot 4962, comportement intact (feat(organigramme): afficher tout ce que le graphe porte (an)
- garde #795 — discover-filters : le rail unifié et croisable reste ; le rayon de ville prime sur le nom (#4627, lot M/M2, décision Louis 31/10)
- revient sur #808 — la note de compte s’affiche en MOTS (`score-words`) avec repli sur le détail en points : décision Louis 31/10, #4991 (lot B)
- garde #825 — ligne (useIsDemo.ts:12) déplacée/reformatée par un lot 4962, comportement intact (feat(demo): lien de démonstration partagé, analyse jouable, )
- garde #995 — ligne (cv-parse.service.spec.ts:763) déplacée/reformatée par un lot 4962, comportement intact (fix(vivier): les compétences saisies rejoignent le référenti)
- garde #1343 — ligne (AccountsPage.tsx:570) déplacée/reformatée par un lot 4962, comportement intact (feat(web,contracts): l'effort et les commandes rejoignent le)
- garde #1579 — ligne (AccountsPage.tsx:570) déplacée/reformatée par un lot 4962, comportement intact ([beta:bug] /accounts — COMPTES — ADRESSABILITÉ / ACCÈS — PRO)
- garde #1580 — ligne (AccountsPage.tsx:570) déplacée/reformatée par un lot 4962, comportement intact ([beta:bug] /accounts — COMPTES — BANDEAU SYNTHÈSE — ACTIONNA)
- garde #1689 — ligne (AccountsPage.tsx:570) déplacée/reformatée par un lot 4962, comportement intact (feat(web,api,ia): le bandeau de portefeuille devient un racc)
- revient sur #1796 — sections de Découvrir pliables d’office : CollapsedSection garde sa valeur par défaut et ajoute `persistKey` (état mémorisé par section), voulu par #4965 (Louis 31/10, lot B)
- revient sur #1812 — CollapsedSection : le test de repli suit le nouveau `persistKey` (#4965, lot B) ; le comportement par défaut est intact
- garde #1912 — ligne (markdown.tsx:47) déplacée/reformatée par un lot 4962, comportement intact ([beta:metier] /chat — LAURA — REFAIRE LA ZONE DE SAISIE COMM)
- garde #1944 — ligne (markdown.tsx:47) déplacée/reformatée par un lot 4962, comportement intact ([beta:autre] /chat — LAURA — MOBILE ET ACCESSIBILITÉ — P1)
- garde #2015 — ligne (role.ts:3) déplacée/reformatée par un lot 4962, comportement intact ([beta:metier] /onboarding/0a3c1861-840d-4606-8324-5fbea19baf)
- garde #2018 — ligne (role.ts:3) déplacée/reformatée par un lot 4962, comportement intact ([beta:metier] /onboarding/0a3c1861-840d-4606-8324-5fbea19baf)
- garde #2048 — ligne (outillage-connected-tools.test.ts:2) déplacée/reformatée par un lot 4962, comportement intact ([beta:metier] /onboarding/0a3c1861-840d-4606-8324-5fbea19baf)
- garde #2054 — ligne (demo-coverage.ts:6016) déplacée/reformatée par un lot 4962, comportement intact ([beta:autre] /onboarding/0a3c1861-840d-4606-8324-5fbea19baff)
- garde #2055 — ligne (index.test.ts:150) déplacée/reformatée par un lot 4962, comportement intact ([beta:metier] /onboarding/0a3c1861-840d-4606-8324-5fbea19baf)
- garde #2104 — ligne (thread-account-link.ts:130) déplacée/reformatée par un lot 4962, comportement intact ([beta:metier] /mailbox — AUJOURD’HUI V3 — TRAITER LA MESSAGE)
- garde #2117 — ligne (accounts.json:537) déplacée/reformatée par un lot 4962, comportement intact ([beta:metier] /accounts — DOSSIER COMPTE V4 — HERO DÉCISIONN)
- garde #2136 — ligne (DiscoverStates.test.tsx:1) déplacée/reformatée par un lot 4962, comportement intact ([beta:bug] /discover — cv échange)
- garde #2366 — ligne (EngagementCreateCallTask.tsx:57) déplacée/reformatée par un lot 4962, comportement intact ([beta:metier] /chat — LAU-FINAL-081 — OUTREACH DOMAIN MODEL )
- garde #2395 — EngagementCreateCallTask : ligne reformatée par le lot A (appel), comportement intact
- garde #2430 — ligne (Chat.tsx:1375) déplacée/reformatée par un lot 4962, comportement intact ([beta:metier] /chat — LAU-FINAL-144 — CONVERSATION LIFECYCLE)
- garde #2616 — ligne (discover_signals.py:83) déplacée/reformatée par un lot 4962, comportement intact ([beta:metier] /discover — « Comptes qui recrutent » : des re)
- garde #2617 — discover-filters-reach : l’entrée `cityRadiusKm` passe de `mute` à `screen` (lot M2, « le rayon prime sur le nom »), la garde dit toujours NON
- garde #2621 — discover-filters-reach : pays par défaut intact, seule l’entrée du rayon change (lot M2)
- garde #2642 — discover-filters-reach : sélection multi-régions intacte, seule l’entrée du rayon change (lot M2)
- garde #2678 — ligne (markdown.tsx:580) déplacée/reformatée par un lot 4962, comportement intact ([beta:metier] /chat — Je demande une liste des dernières lev)
- garde #2721 — ligne (markdown.tsx:580) déplacée/reformatée par un lot 4962, comportement intact ([beta:metier] /chat — Laura n'a aucun outil de recherche web)
- garde #2932 — ScoreSummaryCard : verdict nommé conservé, seule l’étiquette de score change (#4991, lot B)
- garde #3203 — ligne (discover_signals.py:712) déplacée/reformatée par un lot 4962, comportement intact ([beta:bug] /chat — LAU-FINAL-209 — DELIVERY MODEL & REMOTE F)
- garde #3204 — ligne (discover_signals.py:712) déplacée/reformatée par un lot 4962, comportement intact ([beta:metier] /chat — LAU-FINAL-210 — JOB & HIRING SIGNAL IN)
- garde #3238 — ligne (discover-normalize.ts:201) déplacée/reformatée par un lot 4962, comportement intact (Épopée — Extraction complète, agrégation et positionnement d)
- garde #3273 — ligne (markdown.tsx:461) déplacée/reformatée par un lot 4962, comportement intact ([beta:bug] /chat — modifier les textes car c'est illisible, )
- garde #3299 — ligne (AccountsPage.tsx:570) déplacée/reformatée par un lot 4962, comportement intact ([beta:bug] /accounts — déplace sur la ligne du dessus, que t)
- garde #3300 — ligne (AccountsPage.tsx:570) déplacée/reformatée par un lot 4962, comportement intact ([beta:bug] /accounts — mets ces kpis en une ligne avec quand)
- garde #3367 — ligne (Chat.tsx:1269) déplacée/reformatée par un lot 4962, comportement intact ([beta:bug] /chat — un fil ne se rouvre plus après rechargeme)
- garde #3423 — ligne (FocalOrgView.tsx:951) déplacée/reformatée par un lot 4962, comportement intact ([beta:metier] /chat — Ajouter des tests de cohérence transve)
- garde #3528 — ligne (FocalOrgView.tsx:951) déplacée/reformatée par un lot 4962, comportement intact ([beta:bug] /discover — limiter la recherche à 5 secteurs/sou)
- garde #3676 — ligne (lineNature.ts:17) déplacée/reformatée par un lot 4962, comportement intact (Dossier Compte — lire signaux, pistes et besoins confirmés e)
- garde #3687 — ligne (EngagementCreateCallTask.tsx:66) déplacée/reformatée par un lot 4962, comportement intact (Fiche Contact — recomposer en zones sans perdre en-tête, rel)
- garde #3688 — ligne (EngagementCreateCallTask.tsx:66) déplacée/reformatée par un lot 4962, comportement intact (Fiche Contact — ajouter une note et retrouver l'historique s)
- garde #3696 — ligne (EngagementCallBar.test.tsx:31) déplacée/reformatée par un lot 4962, comportement intact (Contacter — lire, corriger et reprendre un message dans un e)
- garde #3697 — ligne (bellum_outreach.py:95) déplacée/reformatée par un lot 4962, comportement intact (Contacter — préparer l'appel, consigner l'appel passé, plani)
- garde #3769 — ligne (chat_tools.py:21158) déplacée/reformatée par un lot 4962, comportement intact ([beta:metier] /chat — BEL-LAU-1015 — Cohérence de style et d)
- garde #3773 — ligne (home-resume.ts:33) déplacée/reformatée par un lot 4962, comportement intact ([beta:bug] /chat — BEL-LAU-0610-002 — Transformer l’accueil )
- garde #3788 — ligne (useCloseDemoOnLogin.ts:48) déplacée/reformatée par un lot 4962, comportement intact ([bug] /login — après une salle démo, « Se connecter » rouvre)
- garde #3812 — consultants.service : import de pruneDeclaredSkills conservé, l’import s’élargit à syncStackFromSkills (#5016, lot F)
- garde #3923 — ligne (answers.test.ts:520) déplacée/reformatée par un lot 4962, comportement intact (Pertinence au contexte de l'utilisateur — un signal hors mét)
- garde #4016 — ligne (FocalOrgView.tsx:951) déplacée/reformatée par un lot 4962, comportement intact (Épopée — Levée des verrous produit (décisions Louis 11/10))
- garde #4022 — ligne (AccountOpportunityScreen.tsx:110) déplacée/reformatée par un lot 4962, comportement intact ([beta:bug] /accounts/db060e68-0b0a-4876-9a04-c854d8a2ca62 — )
- revient sur #4044 — OpportunityCards : plusieurs signaux focalisés (`focusKeys[]`), contrat de #5005 (lot C, revient sur #4399)
- garde #4062 — ligne (ApproachPage.tsx:530) déplacée/reformatée par un lot 4962, comportement intact ([beta:bug] /accounts — BEL-AM-1210-012 — « Préparer un messa)
- garde #4072 — ligne (OrgInfluenceMap.tsx:843) déplacée/reformatée par un lot 4962, comportement intact (Écrans d action : plan, relances, préparation de RDV, organi)
- garde #4331 — ligne (ContactEnrichButton.tsx:35) déplacée/reformatée par un lot 4962, comportement intact (Fiche contact — menu d'actions à retravailler en design)
- garde #4386 — OpportunityCards.test : cas de recherche par nom conservé, test mis à jour pour `focusKeys[]` (#5005)
- garde #4432 — ligne (contacts.service.ts:8) déplacée/reformatée par un lot 4962, comportement intact (Préparer le dossier depuis Découvrir ou Laura — reprendre le)
- garde #4494 — ligne (discover-framing.ts:54) déplacée/reformatée par un lot 4962, comportement intact (Découvrir — filtres refaits sur la modale « Cadrer la recher)
- garde #4497 — ligne (AccountContent.tsx:441) déplacée/reformatée par un lot 4962, comportement intact (Comptes — mise en page de la liste au dessin de la maquette )
- garde #4498 — ligne (AccountsPage.tsx:579) déplacée/reformatée par un lot 4962, comportement intact (Comptes — filtres du portefeuille dans la modale « Filtrer m)
- garde #4524 — ligne (engagement.json:726) déplacée/reformatée par un lot 4962, comportement intact (Préparer l'approche — choisir sur quoi Laura s'appuie (signa)
- garde #4525 — ligne (engagement.json:726) déplacée/reformatée par un lot 4962, comportement intact (Préparer l'approche — Appel en onglet comme E-mail/LinkedIn,)
- garde #4537 — ligne (CallApproachBody.tsx:44) déplacée/reformatée par un lot 4962, comportement intact (Intégration 24/10 I : correctifs PR12, rafale e-mails, Mon C)
- garde #4544 — ligne (CallApproachBody.tsx:44) déplacée/reformatée par un lot 4962, comportement intact (Intégration II — erreurs de prod, restes, vocal, décisions L)
- garde #4570 — ligne (CallApproachBody.test.tsx:126) déplacée/reformatée par un lot 4962, comportement intact (integ: vague VII — 12 lots (25/10))
- garde #4643 — ligne (AccountsPage.tsx:579) déplacée/reformatée par un lot 4962, comportement intact (Comptes — les puces de filtre se cumulent, et la bande de ch)
- garde #4752 — ligne (approach-grounding.ts:1) déplacée/reformatée par un lot 4962, comportement intact (integ: vague O — 12 branches dormantes du 28/10 (~40 issues))
- garde #4824 — ligne (discover-needs-freetext.ts:1) déplacée/reformatée par un lot 4962, comportement intact (Découvrir — la pastille « Fit marché : recoupe … » est coupé)
- garde #4832 — ligne (discover-needs-freetext.ts:1) déplacée/reformatée par un lot 4962, comportement intact (Signaux — une date incomplète vaut le 1er janvier côté TypeS)
- garde #4841 — ligne (discover-needs-freetext.ts:2) déplacée/reformatée par un lot 4962, comportement intact (Découvrir — la zone dite dans la phrase libre n'arrive pas a)
- garde #4907 — ligne (AccountJobOffersPanel.test.tsx:21) déplacée/reformatée par un lot 4962, comportement intact (fix(ia): DECATHLON — offres du métier du vendeur + recherche)
- garde #4911 — ligne (discover-needs-freetext.ts:1) déplacée/reformatée par un lot 4962, comportement intact (fix(web): Découvrir 3/3 — pastille Fit marché, zone dite en )
- garde #4945 — ligne (discover-needs-freetext.test.ts:2) déplacée/reformatée par un lot 4962, comportement intact (Découvrir — une zone non reconnue dans la phrase libre n'est)
- garde #1477 — chat-nav-route : le mock de useIsDemo gagne useDemoSpaceStatus (E2), comportement intact
- garde #2382 — outreach.controller : route dédiée ajoutée par le lot N (#5029, bench-push validée par Louis), séquences existantes intactes
- garde #2551 — ReverseMarketPage : ligne reformatée par le lot N (#5029.1), comportement intact
- garde #3935 — prompt_fingerprint.json régénéré par son script (UPDATE_PROMPT_GOLDEN=1), jamais à la main
- garde #4060 — prompt_fingerprint.json régénéré par son script
- garde #4074 — prompt_fingerprint.json régénéré par son script
- garde #3942 — ContactsPageContent : tri par zone conservé, groupé aussi par ville/région (#4982, lot K)
- garde #4166 — demo-playbook-sequences.spec : le jeu de démo suit la colonne consultant_id (#5029, lot N)
- garde #4167 — outreach.service : séquence mono-contact intacte (c74), consultant_id optionnel ajouté (#5029, lot N)
- garde #4361 — demo-scripts : séquence de démo reformatée pour consultant_id (#5029, lot N)
- garde #4419 — discover-needs-freetext : la zone dite reste une zone ; un métier seul + zone dite est le besoin, mais une ville nue après un métier seul reste un mot-clé (#5002, lot C)
- garde #5031 — discover-types : le tableau unique Actuel/Historique est gardé, N le porte (lot N)
