# Registre #4292 — preuve de câblage (27/10/2026, lot L-EPOPEE-4292)

Méthode : `git grep` de l'appelant, route → écran → composant → service. Aucune exécution (tests ciblés non nécessaires : aucun code touché).
Verdict : **câblé** pour tout ce qui est vérifiable ; aucun orphelin trouvé. Preuves à l'écran = colonne 4 (non rejouées ici, pas de prod).

| # | Verdict | Appelant (fichier:ligne) | Geste de recette |
| --- | --- | --- | --- |
| 4292.1 | déjà là | 4 écrans listés dans 4292.2/6/8/9 — voir lignes ci-dessous | balayer Accès, Organigramme, Aperçu, Contacts |
| 4292.2 | déjà là | TabAccess.tsx:348 → PersonalAccessPathsCard:1109 `DecisionMakerBadge`; API account-access.service.ts:833 | Fiche compte › Accès : badge « Décideur » |
| 4292.3 | déjà là | plan-items.controller.ts:153 → action-plan-items.service.ts:872 (idempotence 409); web ActionPlanBoard.tsx:494/501 → usePlanItems.ts:154 | Créer un événement d'agenda depuis une action : 2e rattachement → conflit |
| 4292.4 | reformulé | decision-louis-17-10 #3711.17 | — |
| 4292.5 | déjà là | AccountOpportunityScreen.tsx:186 → QualificationLeadsQueue.tsx:267 « X affichés sur Y »; AccountDetailTabContent.tsx:324 | Opportunités › « n affichés sur N » |
| 4292.6 | déjà là | TabOrganigramme.tsx:378 → HierarchyOrgView.tsx:186 (avis) ; focalOrgData.ts:1159 (Non enrichis) | Veolia › Organigramme › Groupe › entité vide |
| 4292.7 | reformulé | NO-GO ratifié | — |
| 4292.8 | déjà là | TabOverview.tsx:522 AccountChangesCard → api.ts:1041 → accounts.controller.ts:1201 → account-changes.service.ts | Compte sans changement : « rien de nouveau » |
| 4292.9-11 | câblé | TabContacts.tsx:365 PriorityPathSection ; contacts.service.ts:2275/2309 (rankForAccount, statut d'accès), 2619, 2774 ; contact-ranking.ts:713 | Même compte, statut basculé : ordre change, contenu identique |
| 4292.12 | déjà là | libellés génériques accountDetail.json:287-288 | échec d'analyse : « recherche web / registre légal » |
| 4292.13 | déjà là | AccountDetailHero.tsx:90 useAccountPdfExport → account-pdf/export.tsx:5 → normalize.ts:187 (PDF_CONTACTS_LIMIT=40) | PDF Servier : plafond, pas de gel |
| 4292.14 | reformulé | #4188 | — |
| 4292.15 | déjà là | ReplyBlockView.tsx:34 → AccountRankingCard.tsx:160/282 | Chat : classement › Exporter en CSV |
| 4292.16-18 | câblé | ContactDetail.tsx:188 → ContactKeyInfo.tsx (stacked, plus de « Non vérifié » ni « Nature non vérifiée » sans donnée) | /contacts/<id> : coordonnées lisibles |
| 4292.19 | déjà là | PriorityPathSection.tsx:118 (offerSettling) | Thales › Personnes : deux rendus, même score/dénominateur |

Démo : aucune nouveauté visible livrée ce lot → aucun semis ni entrée `demo-coverage` à ajouter. Droits : aucune route/menu neuf.
