# Rapport — correctifs-recette-pr12-b-2410

1. **#4500.1 / #4500.2 — corrigé.** `CvAutoReadBanner` n'était rendu que par `ConsultantsPage.tsx` (un seul appelant, jamais inversé :
   le test de page mockait des données vides, donc ne l'a jamais vu). Rendu retiré, composant + test + hooks `useCvAutoRead*`
   - type/méthodes API front + clés i18n `autoRead` supprimés. Lecture auto serveur inchangée. Doctrine datée 24/10 ajoutée
     dans `agent_docs/doctrine.md`. Info qui ne sera plus visible nulle part : les échecs de lecture nommés + « Relancer les échecs »
     (BATCH-CV #3935) — aucun autre écran ne les porte ; à arbitrer par Louis. Test : `ConsultantsPage.theo.test.tsx`.
2. **#4500.4 — corrigé.** `TalentCompletenessScore` : `shrink-0` → `min-w-0 break-words` (retour à la ligne, `title` conservé).
   Test : `TalentCompletenessScore.test.tsx`.
3. **#4508.1 — corrigé.** `ContactsFunnelLine` rendu par la bande contextuelle sous les onglets (`AccountDetailTabContent.tsx`) :
   retiré (composant, test, clés i18n supprimés ; l'onglet Contacts ne l'avait déjà plus depuis #3685.5, donc l'entonnoir
   n'est plus affiché nulle part — à confirmer). Onglets overview/brief/evaluation sortis de la bande (elle serait vide).
   La carte `KnownAccountValueCard` (veille/projects/missions) reste : le brief ne la vise pas. Revient sur #3709.
   Test : `AccountDetailTabContent.test.tsx`.
4. **#4470 — corrigé (badge intermédiaire) / conforme (verdict).** `AccountIntermediaryFlag` : `whitespace-nowrap shrink-0` →
   `min-w-0 max-w-full break-words`. Le verdict « ÉCARTER POUR CET OBJECTIF » (`AccountDecisionCell`) était déjà corrigé
   (garde `AccountDecisionCell.overflow.test.tsx` présente). Test : `AccountIntermediaryFlag.test.tsx`.

Vérifs : `tsc --noEmit -p apps/web` = 0 error TS (après `pnpm build` de packages/contracts) ; 4 specs touchées = 78 verts ;
`src/architecture` : 2050 verts, 4 fichiers rouges tous pour `@bellum/utils` non construit dans la VM (pas liés au lot).
Écarts : tests écrits en même temps que le correctif, pas vus rouges avant ; pas d'entrée changelog ; knip/i18n-parity non lancés.
