# Rapport — vieilles issues 31/10 v4 (branche claude/correctifs-vieilles-31-10-v4)

SHA: voir `git log origin/claude/correctifs-vieilles-31-10-v4` (6 commits de contenu après le brief a7b4f106).

1. #2160.9 FAIT — `ContactHeader.tsx` (ligne `contact-hero-owner`, nom ou « Non attribué », rien si `owner` non servi) ; Informations clés inchangé. Revient sur #4504.3 (test d'en-tête ajusté).
2. #2197.9 FAIT — `InvoiceReadinessTable.tsx` : « Société facturante » `xl:table-cell`, Contrôles 20 % à xl. ⚠️ Non mesuré au navigateur (pas de rendu ici) : TJM/CRA/responsable restent en 2xl ; à recetter à 1280 px (débordement #2575/#3709).
3. #2200.13/.14/.21 FAIT — `QueueTraceLine.tsx` partagé (ApprovalTraceLine, messages de séquence `OutreachQueuePreview.tsx`, relances `PlaybookSendList`) : auteur · source · prochaine action, inconnu = aucune ligne.
4. #2395.8 FAIT — `createPlanActionSchema.expected_outcome` requis (tâches : objectif + résultat déjà requis avant ce lot) ; `AddPlanActionForm` (champ + message nommé), formulaires manager (TeamEquipeActions, TeamPlansPage) et créations en un clic (gabarits FR/EN). Lecture des lignes existantes inchangée.
5. c80 FAIT — `doctrine-registry.ts` codeState `partial`, enforcement `guarded`, preuves ; GA-38 vert.
   Démo : classée `DEMO_CONTACT_OWNER_AND_APPROVAL_TRACE_COVERAGE` (aucune ligne neuve : assigned_to et messages semés). Changelog : `changes/correctifs-vieilles-31-10-v4.yml` (à fusionner).
   Tests ajoutés : ContactHeader, InvoiceReadinessPanel, OutreachQueuePreview, ActionCenter, AddPlanActionForm, TeamEquipe, action-plan-items (contrat), service API prepareForContact, doctrine-registry, démo. Verts : web tsc, architecture web (2171), jest actions/demo.
   Non fait / nommé : chemins SANS résultat attendu qui restent (internes, non cassés) — `apps/api/src/modules/manager/team-review.service.ts` (createFromPlan, toléré par type) et `routines/routine-executors.ts:780` (préparation de rendez-vous, reason/expected_outcome null) : hors périmètre. API tsc : erreurs seules `@bellum/email` non buildé (environnement).
