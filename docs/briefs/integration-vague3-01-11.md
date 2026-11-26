# Intégration vague 3 (01/11/2026) — démo D3, fiches, Zoho, Découvrir, fiche talent, L8-bis

Périmètre : apps/api/src/modules/demo/**, apps/api/src/modules/zoho/**, apps/api/src/modules/consultants/consultants.controller.ts, apps/api/src/modules/analysis/**, apps/ia/app/knowledge/**, apps/ia/app/services/**, apps/web/src/features/accounts/**, apps/web/src/features/consultants/**, apps/web/src/features/brief/**, apps/web/src/components/primitives/**, apps/web/src/i18n/locales/**, packages/contracts/src/schemas/**, changes/_.yml, docs/briefs/_.md

## Branches fusionnées (dans l'ordre)

1. `fix/demo-defauts-d3-01-11` (#4290 #4295 #4556 #4116 #2616 #2128 #4107)
2. `fix/fiches-defauts-recette-01-11` (#4813 #4345 #4802 #4198)
3. `fix/zoho-multi-dc-4380` (#4380)
4. `fix/decouvrir-defauts-recette-01-11` (#4732 #4814 #4677 #4433 #4793)
5. `feat/fiche-talent-arbitrages-01-11` (#4543 #4576 #4577)
6. `claude/vieilles-l8b-ordre-etapes` (#2164, contient le lot L8, aussi dans la PR #5094)

Aucun conflit textuel ; `tests-node.generated.ts` régénéré. Deux défauts d'intégration corrigés : la route `GET :accountId/entity-question` (L8) porte `@WorkspaceRead()` (GA-05, 389 contre 388), et `AnalysisEntityQuestionCard` n'écrit plus `max-w-[70ch]` (GA-34, `Text` porte la borne).

## Droits

- Fiche talent : qui modifie = `records:write` (`PUT /consultants/:id`, inchangé) ; refusé : `viewer` (403 par la vraie garde, `consultant-inline-edit-refusal.spec.ts`) ; sans `records:write` la fiche se lit en lecture seule. La provenance `field_sources` se lit comme la fiche.
- Réponse à la question d'identité (L8) : `analysis:run` (`POST :accountId/entity-answer`) ; la lecture de la question est `@WorkspaceRead()`, comme le statut.
- Zoho : `integrations:manage` inchangé. Découvrir, démo D3, fiches : aucune route, garde ni rôle ajouté.

## Je ne fais pas

- Pas de Laura V8 (#5032-#5048), pas de #4962-#5029, pas de #4945, pas de ManagerDashboardPage.
- Aucune réponse aux questions des rapports de lot, aucun élargissement de périmètre.
- Pas de colonne « Négociation » ni de cinquième statut ; aucune étape inventée (#4195.5 reste une décision produit).

## Je défais

- Revient sur #4016 L4.1 : « aucune ligne `human` n'est semée en démo » devient « aucune sur un compte ou un contact » (une seule `human` sur un talent, le TJM de Camille Roussel) ; garde `demo-estimated-email-coverage.spec.ts` resserrée.
- Revient sur #4543 : le test d'AccountBrief interdisait « renseign » partout ; il interdit maintenant seulement la phrase de repli « aucune inconnue » (« Non renseigné(e) » remplace « rien à signaler », non mesuré ≠ 0).
- Garde #4576.9 : la garde Théo (`layoutOrderHolds`, disponibilité dans l'onglet Profil) est gardée telle quelle.
- Garde #1847, #4345.2, #2150.21, #4271 (c76 : le rôle change l'ORDRE, jamais le CONTENU), #4429.5, #4640, c144, #4746, #4814, #4677.1, #4305.2, #4791.4, #4793.1, #3941.5.
- Revient sur #2185 : l'en-tête de la fiche talent suit la maquette V22 (un titre, une ligne métier · lieu, une ligne de méta, gestes à droite), raison : arbitrage Louis 01/11 #4576.5.
- Garde #60, #89, #157, #795, #1225, #1607, #1846, #2646, #2836, #3243, #3263, #3666, #3814, #3908, #3935, #4045, #4046, #4068, #4106, #4158, #4187, #4189, #4191, #4362, #4402, #4419, #4503, #4517, #4580, #4606, #4627, #4628, #4673, #4762 : lignes touchées par les lots fusionnés, comportement conservé (relues, aucune décision renversée).
