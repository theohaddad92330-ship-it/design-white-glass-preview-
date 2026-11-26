# Lot F — Code court (#4714.4 #4875.1-3 #4711.2)

Contrat validé par Louis le 04/11/2026 (QCM). Base : `origin/main` 14052e2076.

## Je fais (points)

- **#4714.4** — la file d'écritures CRM (`apps/web/src/features/crm/view/CrmWriteQueueState.tsx`) DIT ce que la synchro écrit seule : « la synchro remplit sans clic les e-mails et téléphones vides » (décision c147). Texte dans toutes les langues du dépôt (i18n) ; test qui sait dire NON (le texte absent → rouge).
- **#4875.1** — décision Louis 31/10 (`.claude/notes/arbitrages-louis-2026-10-31-qcm-numerotation.md:30`) : « Je ne sais pas encore » est ACCEPTÉ sur une clé exigée de type liste, PERSISTÉ comme statut (pas comme valeur vide).
- **#4875.2** — le cadrage (`apps/web/src/features/onboarding/components/FramingValidationBlock.tsx:76`) et la porte (`isAnswerFilled`, `packages/contracts/src/schemas/onboarding.ts:698`) voient cette clé PAREIL : un test commun (même entrée → même verdict).
- **#4875.3** — le cadrage ne se dit JAMAIS « complet » si la relecture (`/onboarding/$id/review`) nomme un manque. Test : 4 clés liste en « Je ne sais pas encore » → pas « complet ».
- **#4711.2** — `GET /version` rend `"built_at": null` en production sur l'API ET l'IA (mesuré 04/11, commit 14052e2076). `apps/api/railway.json:5` écrit `build-time.txt` au build, mais la valeur n'arrive pas. Trouver où ça casse (commande de build Railway non exécutée ? fichier écrit hors de l'image ? chemin relu faux ? Dockerfile qui ignore railway.json ?) et corriger pour que les DEUX services rendent une date ISO. Test unitaire du lecteur (fichier présent → date ; absent → null).

## Je ne fais PAS

Aucun nouvel envoi ni écriture CRM sans clic. Aucune migration qui rétrécit. Ne pas toucher aux droits.

## Droits

Aucune surface d'accès touchée.

## Je défais

Rien. Garde #4714, #4875, #4711.

Périmètre : apps/web/src/features/crm/**, apps/web/src/features/onboarding/**, apps/web/src/i18n/**, apps/web/src/locales/**, packages/contracts/src/schemas/onboarding*, apps/api/src/modules/health/**, apps/api/railway.json, apps/ia/railway.json, apps/api/Dockerfile, apps/ia/Dockerfile, apps/ia/app/*_version_, apps/ia/app/main.py

## Règles

- Antériorité d'abord : `git log origin/main --oneline --grep '<n°>'` ; un point déjà livré se dit « déjà là » et ne se recode pas.
- Commentaire `// #NNNN.N` à l'endroit du comportement. TDD.
- Tests CIBLÉS seulement (≤ 5 specs, `tsc -p` du paquet) ; jamais la suite complète ni le build.
- Une routine cloud ne peut PAS pousser `.github/workflows/**` : n'y touche pas. Scope commitlint `infra`, jamais `ci`.
- Plafond 300 tours ; à 80 % commit de ce qui est vert, push, rapport, stop.
- Push SIMPLE sur `claude/f-code-court-0411`, jamais --force ni --no-verify. Aucune PR.
- Preuve du push : `gh api repos/Bellum-AI/belllum-monorepo/branches/claude/f-code-court-0411 --jq .commit.sha`.
- Rapport ≤ 15 lignes : branche, SHA, un statut par point, puis STOP.
