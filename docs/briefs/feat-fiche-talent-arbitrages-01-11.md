# Fiche talent — arbitrages Louis du 01/11/2026 (#4543.5, #4577.3, #4577.6, #4576.5, #4576.9)

Périmètre : apps/web/src/features/consultants/view/detail/TalentDetailHeader.tsx, apps/web/src/features/consultants/view/detail/TalentFieldGroup.tsx, apps/web/src/components/primitives/InlineEditableField.tsx, apps/web/src/features/consultants/lib/talentInlineFields.ts, apps/web/src/features/brief/lib/brief-unknowns.ts, apps/web/src/i18n/locales/fr/consultants.json, apps/web/src/i18n/locales/en/consultants.json, apps/web/src/i18n/locales/fr/brief.json, apps/web/src/i18n/locales/en/brief.json, apps/api/src/modules/consultants/consultants.controller.ts, packages/contracts/src/schemas/consultant.ts, apps/api/src/modules/demo/demo-dataset.ts, apps/api/src/modules/demo/demo-seed.service.ts, apps/api/src/modules/demo/demo-seed-fingerprint.ts, apps/api/src/modules/demo/demo-coverage.ts

## Ce qui est tranché (QCM Louis 01/11/2026)

- #4543.5 : une catégorie vide (concurrence, achats) que l'analyse n'a pas relevée se dit « Non renseigné(e) », jamais « rien à signaler » (non mesuré ≠ 0, GA-18 / GA-19).
- #4577.3 + #4577.6 : tout champ de la fiche talent est éditable (connecteur et CV compris, #4402.1) ; une correction est marquée « Saisi à la main » et n'est jamais écrasée par une resynchro (une correction humaine gagne toujours).
- #4576.5 + #4576.9 : l'en-tête suit la maquette V22 (`talentDetail`, Bellum_V22_Produit_Complet.html) : un titre, une ligne métier · lieu, une ligne de méta, les gestes à droite.

## Antériorité (git grep d'abord)

La provenance PAR CHAMP existait déjà : table `field_provenance` (`ProvenanceService`), écrite par `PUT /consultants/:id` avec la source `human` (`rule: talent_form`), respectée par l'enrichissement, la revue de CV et l'engagement (`applyFieldUpdates`). Il manquait sa LECTURE par la fiche : aucune migration n'était nécessaire (la contrainte SQL accepte déjà `human`, GA-11/12). Livré : `field_sources` sur `GET /consultants/:id` (contrat Zod optionnel, lu par le contrôleur, GA-07), marqueur « Saisi à la main » champ par champ.

## Droits

- Qui modifie : `records:write` (`PUT /consultants/:id`, inchangé).
- Refusé : `viewer` (403 par la vraie garde, `consultant-inline-edit-refusal.spec.ts`, déjà en place) ; côté écran, sans `records:write` la fiche se lit en lecture seule (`TalentFieldGroup`, fail-closed).
- Test : `consultant-inline-edit-refusal.spec.ts` (le REFUS) ; `consultant-field-sources.spec.ts` (la lecture de la provenance reste ouverte à qui lit la fiche, comme la fiche elle-même).

## Je défais

Rien, sauf ce que l'antériorité révèle :

- #4016 L4.1 : « aucune ligne `human` n'est semée en démo » devient « aucune sur un compte ou un contact » (une seule `human` sur un talent, le TJM de Camille Roussel) ; garde `demo-estimated-email-coverage.spec.ts` resserrée.
- #4543 : le test d'AccountBrief interdisait « renseign » partout ; il interdit maintenant seulement la phrase de repli « aucune inconnue ».
- #4576.9 : la garde Théo (disponibilité dans l'onglet Profil, `layoutOrderHolds`) est gardée telle quelle ; seuls le statut, « suivi par » et la mise à jour changent de place dans l'en-tête.
