# Rapport — Lot C Découvrir/offres (claude/lot-4962-c)

- **#5000/#4999 contrat** : livré d4bbdccb `packages/contracts/src/schemas/account-job-offers.ts:17-45` (type `CDI|CDD|intérim|freelance|autre|non précisé`, jamais déduit) · fiche `AccountJobOffersPanel.tsx:92-100` · IA 799d1eac `contract_model.py` `contract_type_of` + `discover_signals.py` (Literal élargi, ajout seulement) · web 270ce415 `discover-normalize.ts`, puce `freelanceOnly` (`FilterRail.tsx`, `discover-filters.ts`) + avis `FreelanceAbsenceNotice.tsx`.
- **#5010** : livré d4bbdccb `offerOriginLabel` (hôte de l'URL, liste fermée, jamais `source`), fiche seulement. Découvrir : NON fait — la preuve d'offre sur carte relève de #4663 (ouvert), pré-requis.
- **#5002** : livré 3662de3d `discover-needs-freetext.ts` `bareTrailingCityReading` + `bareCityKeywordNotice` (ZONE_COMMUNES existe côté web, le diagnostic était faux sur ce point) ; notice sous la barre `FilterRail.tsx`.
- **#5003** : livré 7d43d02b `thread-account-link.ts` (`isEsn`), `briefing-actions.ts` (`followUpEsn*`), badge `ThreadList.tsx`. Étiquette, rien de retiré.
- **#5004** : livré c1e4b585 `OpportunityCards.tsx` `cardNature`, `lineNature.ts` (`siteInformation`, ajout).
- **#5005** : livré beb6955a `OpportunityCards.tsx` `focusKeys[]` ; test `OpportunityCards.test.tsx` mis à jour (revient sur #4399).
- **#5006** : livré ebf2a7d6 `discover-out-of-target-reasons.ts`, `OutOfTargetBadge.tsx` monté `CandidateRow.tsx` (NAF 58.29 / tranche haute < 20 ; inconnu = rien).
- **#5009** : livré 9b610133 `SkillSearch.tsx` `SkillOffersReadLine` + IA `offersRead`. Total « trouvées » : aucune source ne le renvoie → `offersTotal` absent, libellé « N offres lues » seul.
- **#4973** : livré (commit suivant) `ProfileSectorLeads.tsx` monté dans `Discover.tsx` : pistes cliquables, rien posé à l'arrivée.
- **Mesure démo** : 17 offres semées (`demo-dataset.ts` it_job_signals), 1 stage écarté ; 0 passe de « CDI »/vide à un autre type (13 CDI restent CDI ; Intérim/CDD/Freelance étaient déjà libellés et sont normalisés). URLs démo = example.org → aucune origine affichée (à dessein).
- **Tests** : contracts 7/7, web (jobOffers 6, opportunities+model 370, discover filters/criteria/architecture 310, freetext 36, SkillSearch 21, OutOfTarget 6, FilterRail, mailbox m1 6), api jest (thread-account-link + briefing-actions 212), ia pytest (contrat 5000, discover_signals_router, volume_4419 verts). `tsc -p apps/web` : 2 erreurs de type (test fiche), corrigées ; api et ia non typés (jest/pytest ciblés seuls).
- **Déjà rouge sans mes changements** : `apps/ia/tests/test_discover_hiring_depth_4045.py::test_every_card_of_a_full_page_keeps_its_hiring_signal`. Ancien test `test_discover_signals_router` (MIS reste None) mis à jour : contrat élargi voulu.
- **Hors périmètre touché** : `apps/web/src/i18n/locales/*` (compagnon i18n du brief). Tests de l'écran `Discover` non lancés (paquets `@bellum/utils`/`errors` non construits dans la VM) : à la CI.
- **Questions** : (1) ajouter « origine » dans Découvrir attend #4663 — ok ? (2) un libellé Adzuna `contract` ambigu tombe en `autre`, pas CDD.
