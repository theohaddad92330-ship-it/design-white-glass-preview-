# Registre — lot TALENTS-VIVIER (vague L, 27/10/2026)

Constat : tout le lot est DÉJÀ sur origin/main (vague IX, #4606 + intégrations suivantes). Appelants vérifiés, rien recodé.

| Point | État | Appelant / preuve en recette |
| --- | --- | --- |
| #4500.1 cinq encarts retirés | déjà là | `ConsultantsPage.tsx:597` (commentaire de retrait), plus de montage de `TalentStatsBanner` ; test `ConsultantsPage.theo.test.tsx:193`. Recette : /consultants (prod + démo) ne montre ni encarts ni « 0 sur 9 ». |
| #4500.2/.3 bandeaux « disponibilité inconnue » et « CV lu avant le correctif » | déjà là | `ConsultantsPage.tsx:626` ; `doctrine.md:131` (renversement #2543 daté) ; test `:228`. |
| #4500.4 recherche + « Filtres » → modale complète | déjà là | `TalentFilters` monté `ConsultantsPage.tsx:576-586`, `TalentFilterDialog` (14 critères + ancienne barre, test `:326`). Recette : compter les filtres avant/après. |
| #4500.5 liste maquette | déjà là | `vivierTableColumns.ts` (colonnes par priorité, cartes < 768 px) ; test `:240`. |
| #4576 fiche : dispo une seule fois, « Consultant » une fois, en-tête Théo | déjà là | `TalentDetailPage.tsx:435` (seul montage du badge), `TalentProfileTab.tsx:131` ; tests `TalentDetail.test.tsx:1800`, `TalentDetailPage.theo-layout.test.ts:72-77` (témoin NON). |
| #4577 édition en place | déjà là | `TalentFieldGroup.tsx` (un formulaire générique, `records:write`, rollback sur erreur) ; refus testé `TalentDetail.test.tsx`. |
| #4578 lien d'aide + 2 boutons sur une ligne | déjà là | `CustomerPageContent.tsx:170-184` (`guideLink` dans le PageHeader) ; `CustomerPageContent.guide-row.test.tsx`. |
| #4575 cinq icônes du pied | déjà là | `SidebarFooterActions.tsx:34` `withCollapseToggle`, monté `NavUser.tsx:38` ; `footer-single-row.test.tsx`. |
| #4532 export du vivier = carte de Mes données | déjà là | `MyDataTabs.tsx:49` → `VivierExportCard` (`useDataExit`) ; `routes/settings/vivier-export.tsx` redirige (`beforeLoad`) ; menu sans entrée. |
| #4532 droit : autre espace refusé | livré | `bulk-export.service.spec.ts` « REFUS — … AUTRE espace » (état + téléchargement : NotFound, aucun CSV). Export ATS : `ats-export.service.spec.ts:36` déjà. |
