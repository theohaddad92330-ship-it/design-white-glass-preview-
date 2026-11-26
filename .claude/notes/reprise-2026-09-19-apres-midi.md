# Reprise — 19/09/2026, 14:00 (fin de lot, avant /clear)

Registres : branche `chore/recette-19-09` (worktree `.claude/worktrees/recette-19-09`), tête `4379a9a9b` — garde `tools/registres/test_coherence.py` verte.
Suivi des branches (scratchpad, non versionné) : `/private/tmp/claude-501/-Users-louisschlegel-Desktop-belllum-monorepo/22fd8cd9-0b61-47cb-803a-80837f8e3f59/scratchpad/x2-branches.md`.
Production : web/api/ia = `501526d63` (vague X1, #2657, servie à 10:59Z).

## En vol au moment du /clear (les branches gardent chaque commit)
- **Intégrateur X2** : `integration/vague-19-09-x2` @f091696f7, 89 commits, NON POUSSÉE ; suites complètes en cours dans `.claude/worktrees/agent-aa128e39d3b882016`. Contient E, A2, K, J, L, F2 (⊃F), C/M, N, H (⊃H2), B (PAS B2), chore/recette (→4e9128439) ; doctrine C renumérotée c68 ; 2 correctifs (tool_latency_observations, /settings/workspace-rules au catalogue Laura). Si l'agent est mort : relancer les portes rapides (tsc web, api check-types, jest architecture + demo-coverage — verts à 13:44), pousser, PR draft, la CI fait le reste.
- **I3** `feat/la-relation-se-recalcule-sans-cout-19-09` (sur I2) — rejeu GRATUIT de l'axe relation + libellé qui nomme ses sources (#2298.4).
- **B4** FINI `feat/un-effacement-pose-toujours-son-opposition-19-09` @0bb1b16a5 — opposition toujours posée + purge `org_graph_corrections` (#2297.51). ⚠️ **QUESTION LOUIS avant X3** : B4 a écrit dans la doctrine de l'effacement une exception à « une correction humaine gagne toujours » (une correction qui nomme la personne effacée est supprimée) au lieu de s'arrêter comme le demandait le brief. Valider ou retirer.

## Vague X3 (prête, à intégrer après X2 servie) — prendre les TÊTES de chaîne
P `feat/les-partenaires-disent-complementarite-et-rang-deux-19-09` @b26cde3c9 (sur C/M) · Q `feat/les-renouvellements-ont-leur-manager-et-leur-action-19-09` @4a5de7cad · S2 `fix/la-duree-ne-parle-que-de-ce-quelle-mesure-19-09` @2e5bb9999 (⊃S) · H4 `feat/le-deck-du-compte-reste-permis-19-09` @9b1a169c6 (⊃H3) · R `feat/le-modele-de-contrat-survit-a-la-recherche-19-09` @07c60b73a (⊃N) · B4 (⊃B3⊃B2, doctrine effacement = **c69**) · I3 (⊃I2) · `chore/recette-19-09`.
⚠️ B2/B3/B4 exigent `PERSON_ERASURE_HMAC_KEY` : **POSÉE** le 19/09 sur Railway, service `belllum-backend-service`, production (64 hex, sans redéploiement). Sans elle : 503.
⚠️ R pose `SEGMENT_CAPABILITY_EPOCH.signals = 2026-09-19T11:20:34Z` : TOUT compte analysé avant affichera « collecte antérieure » sur les signaux (voulu par la doctrine du 18/09) — le dire à Louis au déploiement.

## Tranché aujourd'hui (QCM Louis, après-midi)
Tags : graphie de la 1re saisie (dédoublonnage insensible à la casse) · Découvrir : intérim à part, « Profession libérale » tel quel, régie + persistance lancées · Effacement : opposition gardée EN EMPREINTE, et CRÉÉE si absente ; HMAC clé dédiée ; organigramme purgé tout de suite · Règle d'export : PDF, Word, deck du compte et dossiers de compétences PERMIS ; fil de chat, talent, contacts.xlsx bloqués ; exemptions H2 validées · Mapping ACTION_TARGET_DOMAIN de J accepté tel quel (project/verification → null).

## Recetté cet après-midi (R23-R26, prod)
2120.19/.27/.45/.46/.47/.56 · 2298.1/.2/.3 · 2567.1 · 2195.1/.2/.4/.6/.7/.8/.9/.10/.11/.13/.14/.15/.16/.19/.21/.24/.27/.28/.36/.53 · 2058.3 · 2323.33 · 2565.9/.11 · 1950.14/.18/.20.
Réfutés → relancés : 2120.57 (durée) → S+S2 · 2195.12 (Manager) → Q · 2298.4 (relation STOCKÉE à l'analyse) → I2+I3.

## Mergé/servi, pas encore prouvé
2306.25 (aucun dossier antérieur à un changement de secteurs) · 2298.6 (aucun collègue) · 2120.28/.29 (aucun CIO/CTO groupe) · 2120.69 (aucun téléphone révélé) · 2195.35/.50 (aucune mission sans date) · 2195.48 (la saisie « Engage le renouvellement… » est BLOQUÉE par le classifieur de l'outillage → tester à la main, ou formulation neutre).

## Reste, dans l'ordre
1. X2 : PR → CI → merge → déploiement (`/version` + chaîne web dans le bundle, `grepbundle2.py`) → recette des points X2.
2. Après X2 servie : dryRun du remboursement 2650.2 (`POST /internal/admin/credits/refresh-refunds`, `x-internal-secret` via `railway run --service belllum-backend-service`), relire les lignes (peut dépasser 3 : groupement par PHASE), puis réel.
3. Intégrer X3, déployer, recetter.
4. Clôtures proches (compter `recetté`+`écarté` = total) : #2195 (reste .12 en X3, .35/.50 sans donnée, .48 à la main), #2565 (.2/.10/.12), #2532 (.2 en X2), #2591/#2602 (salle de démo — « pas aujourd'hui »), #2604.2 (à coder).
5. Outillage : `registre.py` corrigé dans SKILLS_TEMPLATES (preuve = colonne APRÈS l'état ; 20 constats de #2195 avaient été écrasés, restaurés `e8f1ffb68`) — modification NON COMMITÉE (ce dépôt porte d'autres changements en cours). Tableau de suivi : non publié (l'Artifact demande la permission de Louis).
6. Côté Louis : corriger lui-même son profil (pollué le 19/09 matin) · compte vierge de test · téléphone (2598.4) · onboarding (2060.9).
