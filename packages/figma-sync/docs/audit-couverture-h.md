# Audit de couverture — Lot H (#2799, 25/09/2026)

Comparaison exhaustive de chacune des 25 specs sorties de leur état condensé par le lot H (sections, onglets,
filtres, actions/boutons, colonnes de tableau, états vide/erreur/chargement, sous-vues) contre la page réelle
correspondante. Une ligne par spec : **complète** si rien ne manque, sinon le détail des manques avec leur
`fichier:ligne` dans la vraie page. Chaque manque listé ici a été corrigé dans un commit dédié à sa spec (sauf
mention contraire) — voir l'historique Git de la branche pour le détail des changements.

**Statut : les 25 specs sont closes** (23 avec des manques corrigés, 2 déjà complètes : `dm/flags`,
`app/settings-activity`) — dernière spec fermée le 25/09/2026.

## dm/accueil

Manques (corrigés) : le tableau « Mouvements du mois » a trois états distincts non représentés (erreur API,
aucun mois figé, mois figé sans mouvement) — `apps/dashboard-manager/src/app/_components/cockpit-business-panel.tsx:200-234`,
`cockpit-business.logic.ts:223-237` ; les deux graphiques (waterfall, courbe 12 mois) ont chacun leur message de
repli propre quand aucun mois n'est figé — `cockpit-business-panel.tsx:165-169,180-184`.

## dm/clients

Manques (corrigés) : le formulaire complet « Provisionner un client » (ESN, propriétaire, plan & quota,
conditions commerciales, destinataire de facture, équipe à inviter, aperçu 6 étapes, panneau de résultat) —
`apps/dashboard-manager/src/app/clients/_components/create-client-form.tsx:314-790` ; le formulaire « Créer
l'ESN » indépendant — `apps/dashboard-manager/src/app/esn/_components/create-workspace.tsx:43-66` ; le filtre de
recherche sur le tableau ESN — `esn-directory.tsx:36-68` ; la grille de 4 KPI et le sélecteur de fenêtre
temporelle (7j/30j/90j) de la section Équipes — `teams-panel.tsx:27-108` ; la section « Méthodologie & limites »
— `teams-panel.tsx:191-202` ; la colonne « Activation » réelle (fraction + taux, ou texte de retenue
statistique) au lieu d'un statut catégoriel — `teams-panel.tsx:179-184`.

## dm/facturation

Manques (corrigés) : colonne « Enrichissements (obsolète) » du Catalogue — `plans-editor.tsx:269` ; la
confirmation d'édition d'offre (clients concernés, champs modifiés, avertissements prix/fonction retirée) —
`plans-editor.tsx:417-500` ; le bandeau de contrats critiques du jour sur « Sur facture » —
`manual-clients-panel.tsx:80-109` ; le journal interactif de factures par client (au lieu d'un texte statique) —
`invoice-ledger.tsx:63-103` ; la navigation temporelle du calendrier (mois précédents/suivants/courant) —
`billing-calendar-panel.tsx:244-278` ; l'avertissement de grille au-delà de 240 périodes dérivées —
`billing-calendar-panel.tsx:221-230` ; le panneau détaillé de période + panneau de relance complet (ton,
aperçu, litige, historique) — `billing-calendar-panel.tsx:374-473`, `billing-reminder-panel.tsx`.

## dm/couts

Manques (corrigés) : note sur les fournisseurs repliés sous « autres » — `couts/page.tsx:241-249` ; ligne de
verdict principale de « Pic surveillé » (alerte/calme/inconnu) — `couts/page.tsx:256-266` ; paragraphe
explicatif de « Coût par opération » — `couts/page.tsx:297-306` ; phrase « Ce qu'il faudrait pour le débloquer »
de « Marge brute » — `couts/page.tsx:322-327` ; paragraphe de repère médian SaaS non affiché en face d'un chiffre
— `couts/page.tsx:335-338`.

## dm/health

Manques (corrigés) : colonne « Cause » et libellé correct « Espaces touchés » (pas « Occurrences ») dans « Ce
qui casse vu du client » — `health/_components/client-facing-errors.tsx:70-89` ; les deux bandeaux d'alerte
critiques de « Capacités coupées » — `kill-switch-panel.tsx:76-89` ; la phrase de synthèse en pied de section —
`kill-switch-panel.tsx:120-125` ; les 6 colonnes manquantes du tableau « Coût par prompt » (9 colonnes réelles
contre 3 dans la spec) — `cost-metrics-panel.tsx:67-81` ; le tableau conditionnel « Générations tronquées » —
`cost-metrics-panel.tsx:114-145` ; les bandeaux d'alerte du coût par prompt — `cost-metrics-panel.tsx:53-65` ;
« État des sources externes » modélisé en tableau à 6 colonnes (pas une liste label/valeur) —
`source-health-panel.tsx:90-128`.

## dm/audit

Manques (corrigés) : `MaskedEmail` est un bouton qui révèle l'e-mail au clic et journalise l'opérateur (pas un
texte figé) — `apps/dashboard-manager/src/app/_components/masked-email.tsx:26-52`, utilisé par
`audit/_components/audit-table.tsx:52` ; le paragraphe conditionnel « Filtres additionnels actifs » + lien
« Tout afficher » — `audit-filtres.tsx:78-93`.

## dm/impersonations

Manques (corrigés) : même écart `MaskedEmail` que `dm/audit` — `masked-email.tsx:26-52`, utilisé par
`impersonations/_components/impersonations-table.tsx:42`.

## dm/esn-detail

Manques (corrigés) : le formulaire d'ajout de membre demande un userId (UUID) et un sélecteur de rôle
(Membre/Admin/Propriétaire), pas un simple champ e-mail — `esn/[id]/_components/add-member.tsx:9-13,49-62` ;
deux états supplémentaires de `EsnProfilePanel` (indisponible, aucune fiche partagée) —
`esn-profile-panel.tsx:42-51,57-61` ; les cinq états réels de `OwnerInvitationPanel` (contre un seul dans la
spec) — `owner-invitation-panel.tsx:29-49,59-86` ; le retour d'état de `RenameWorkspace` après sauvegarde —
`rename-workspace.tsx:46-50` ; la confirmation avant retrait d'un membre — `remove-member-button.tsx:16` ; les
états vides réels des tableaux Membres/Invitations — `esn/[id]/page.tsx:63-66,112-115`.

## dm/integrations

Manques (corrigés) : la rangée de 4 cartes KPI de l'onglet « Par client » (au lieu d'une ligne de texte) —
`integrations/_components/clients-panel.tsx:109-128` ; la rangée de 2 cartes KPI de l'onglet « Livraisons » —
`deliveries-panel.tsx:66-75` ; la note de troncature des livraisons — `deliveries-panel.tsx:96-100` ; les états
vide/erreur distincts par panneau (Catalogue/Par client/Livraisons) au lieu d'un état générique unique —
`catalogue-panel.tsx:54-56`, `clients-panel.tsx:57-59`, `deliveries-panel.tsx:53-60`.

## dm/changelog

Manques (corrigés) : contenu bilingue français/anglais systématique (titres, en-têtes, notes) —
`changelog/page.tsx:39-41,52-73,79-121` ; l'avertissement sur la liste de suppression non évaluée —
`changelog/page.tsx:118-122` ; le cas « entrée retirée du catalogue » et le vrai `0` (pas un tiret) pour les
entrées non reçues — `changelog/page.tsx:140,144` ; l'état dégradé de la page quand `delivery` est absent côté
API — `changelog/page.tsx:48-154`.

## dm/flags

**Complète.** La spec reflète fidèlement les deux champs de filtre, le tableau à 4 colonnes, la raison unique du
« non mesuré », les trois états (vide/chargement/erreur) et le mode lecture-seule.

## dm/analysis-detail

Manques (corrigés) : badge qualité (Quality Judge) avec compteur d'issues —
`analysis/[id]/_components/AnalysisHeader.tsx:124-132` ; badge SIREN dans l'en-tête —
`AnalysisHeader.tsx:141` ; bloc « Score /25 — pourquoi » (répartition par axe) — `AnalysisHeader.tsx:235-251` ;
bannière « identité incertaine » — `AnalysisHeader.tsx:167-187` ; état « Échec de l'analyse » distinct de
l'erreur de chargement — `AnalysisHeader.tsx:255-276` ; ligne de couverture du Grounding —
`AnalysisHeader.tsx:336-343` ; champ « Angle », badge de cohérence et badge de tier sur les cartes « Top
offres » — `AnalysisContract.tsx:80-123` ; note « hypothèses à vérifier (règle 70 %) » —
`AnalysisContract.tsx:139-144` ; tier (P1/P2/P3) des périmètres prioritaires — `AnalysisContract.tsx:58-69` ;
texte stratégique par concurrent — `AnalysisCompany.tsx:170-179` ; paragraphe « stratégie » de chaque angle
d'attaque — `AnalysisSignals.tsx:41-43` ; 4ᵉ zone de chasse « Quick win » — `AnalysisEntities.tsx:10-15,39-48` ;
champs « à vendre », « stack » et autonomie IT par entité — `AnalysisEntities.tsx:84-100` ; 3 sous-sections du
plan d'action (« Si pas de réponse », « Évaluation », « Stratégie concurrentielle ») — `AnalysisPlan.tsx:19-26` ;
contenu réel par contact (provenance, raison de priorité, téléphone, LinkedIn, détails Apollo, résumé de profil,
« pourquoi ce contact », leviers/peurs, **message prêt à envoyer**) — `AnalysisContacts.tsx:296-417`.

## app/pilotage-finance

Manques (corrigés) : formulaire de saisie de l'objectif de marge sur l'anneau « Taux de réalisation » —
`apps/web/src/features/pilotage/finance/FinanceTargetRing.tsx:99,181-250` ; tendances période/période sur les 4
lignes de CA et sur « Marge de l'espace » — `apps/web/src/features/pilotage/view/FinancePanel.tsx:368-381,531-543` ;
affordance « Explique-moi ce chiffre » sur Signé/Marge/Intercontrat/Délai de paiement — `FinancePanel.tsx:894-900,920` ;
pastilles de cible par indicateur — `FinancePanel.tsx:494,552,586,672` ; états « réservé aux responsables »
(par bloc et panneau entier) et bannière de portée restreinte — `FinancePanel.tsx:305-330,838-840` ;
sélecteur d'horizon et bascule de vue du prévisionnel — `FinanceForecastHorizons.tsx:65-93`.

## app/missions-encaissements

Manques (corrigés) : sous-vue « Ouvrir un litige » (`DisputeDialog`, en ligne sous le tableau malgré son nom,
pas une surcouche) — `apps/web/src/features/missions/view/CollectionsPage.tsx:727-763` ; sous-vue « Enregistrer
un règlement » (`PaymentDialog`, même écart de nommage) — `PaymentDialog.tsx:35-77` ; geste de menu « Consigner
une relance » (toujours présent, quel que soit le statut de la ligne) — `CollectionsPage.tsx:715` ; ligne
d'exemple d'une facture partiellement réglée (Réglé / Reste dû nommés, jamais un cinquième statut) —
`CollectionsPage.tsx:592-608`.

## app/missions-paiements

Manques (corrigés) : menu d'actions « … » par ligne (Marquer payé/Relancer/Refuser + motif) —
`apps/web/src/features/payments/view/PaymentsPage.tsx:496-508,866-908` ; modale « Refuser un paiement » —
`PaymentsPage.tsx:918-955` ; états « préparée mais pas transmise » et « refusée/rappelée » de la colonne
« Cession » — `PaymentsPage.tsx:729-748`.

## app/missions-cra

Manques (corrigés) : bandeau d'accès dégradé sans email —
`apps/web/src/features/missions/view/TimesheetsPage.tsx:107` ; statut « escaladé » (badge + compteur) —
`TimesheetsPage.tsx:40,60,200-204` ; compteur de jours déclarés du résumé — `TimesheetsPage.tsx:205-211` ;
badge d'écart et liste d'anomalies par ligne — `TimesheetsPage.tsx:469-494` ; mentions « Déclaré par »/« Revu en
interne par » — `TimesheetsPage.tsx:454-467` ; rappel avant échéance — `TimesheetsPage.tsx:437-443` ; boutons
« Enregistrer la validation client », « Rejeter » (+ formulaire), « Marquer non applicable » (+ formulaire,
trace, annulation) — `TimesheetsPage.tsx:525-550,624-666,668-814` ; mentions « Approuvé par »/« Relances
envoyées » — `TimesheetsPage.tsx:579-599` ; second état vide (filtre masquant un mois avec relevés) —
`TimesheetsPage.tsx:236-248`.

## app/team

Manques (corrigés) : état « verrouillé » (palier requis) — `apps/web/src/routes/team/index.tsx:13`,
`PlanFeatureLocked.tsx:61-80` ; état d'erreur 403 dédié — `ManagerDashboardPage.tsx:105-116` ; cas
supplémentaires et état vide de la file d'arbitrage — `ManagerDashboardPage.tsx:122-166` ; onglets, compteurs et
badges de `SharedActionsQueue` — `SharedActionsQueue.tsx:66-134` ; `CoachingPanel` —
`ManagerDashboardPage.tsx:255-257`, `CoachingPanel.tsx:42-59` ; cause d'inactivité sous la date —
`ManagerDashboardPage.tsx:847-863` ; éditeur d'objectif du mois — `ObjectivesPanel.tsx:132-193` ; `PipelineStrip`
— `ManagerDashboardPage.tsx:267,762-789` ; contrôle d'attribution par ligne — `ManagerDashboardPage.tsx:736-757` ;
compositeur de commentaire — `TeamCommentsPanel.tsx:45-86` ; accordéon et ordre du jour de `RitualsPanel` —
`RitualsPanel.tsx:67-119` ; texte de pied de page — `ManagerDashboardPage.tsx:398-400`.

## app/expenses-index

Manques (corrigés) : sélecteur « par page » de la pagination — `ExpenseReportsPage.tsx:389-394` ; second état
vide (filtres actifs) — `ExpenseReportsPage.tsx:273-293` ; sous-vue `ExpenseReportEditor` —
`ExpenseReportsPage.tsx:318-325,186-188` ; bloc de chiffres-clés du dossier — `ExpenseReportDrawer.tsx:165-182` ;
état « conforme » et bascule d'anomalies — `ExpenseReportDrawer.tsx:516-562` ; les 3 verdicts réels de
`PolicyCard` — `ExpenseReportDrawer.tsx:564-601` ; ligne TVA non mesurée — `ExpenseReportDrawer.tsx:628-632` ;
section « Détail des lignes » — `ExpenseReportDrawer.tsx:192-230,474-514` ; détail des pièces jointes —
`ExpenseReportDrawer.tsx:236-281` ; dépôt de justificatif — `ExpenseReportDrawer.tsx:287` ; bloc
« Recommandation » — `ExpenseReportDrawer.tsx:290-317` ; trace de rejet — `ExpenseReportDrawer.tsx:319-333` ;
barre d'actions complète du dossier — `ExpenseReportDrawer.tsx:336-447`.

## app/billing

Manques (corrigés) : `NoLicenseBanner` — `Billing.tsx:96`, `NoLicenseBanner.tsx:32-55` ; `PlanPickerDialog` —
`Billing.tsx:118-124` ; avantages/statut/notice propriétaire de la carte Plan — `PlanCard.tsx:36,62-72` ; ligne
de répartition et notice propriétaire de la carte Crédits — `CreditsCard.tsx:24-33` ; bouton « Ajouter » par
pack (au lieu d'un bouton partagé) — `TopupCard.tsx:26-32,58-68` ; formule affichée, indices de provenance,
bouton Réinitialiser du simulateur — `ProfitabilityCalculator.tsx:97,101-167` ; historique de facturation et
mouvements de crédits en LISTE de cartes (pas en tableau), avec bouton de téléchargement et statut « en
attente » — `InvoiceHistoryCard.tsx:34-108`, `CreditLedgerCard.tsx:38-60`.

## app/rfp

Manques factuels (corrigés) : sous-titre de l'entête — `RfpPage.tsx:66` ; lien `AskLaura` — `RfpPage.tsx:73` ;
hint formats acceptés + erreur fichier trop lourd — `RfpPage.tsx:184-192` ; état vide propre à la liste de
dossiers — `RfpPage.tsx:244,257-258` ; listes Signaux d'alerte/Conditions/Questions de la Recommandation —
`RfpPage.tsx:333-335` ; conditionnalité des boutons On y va/On renonce (masqués une fois décidés) —
`RfpPage.tsx:336-345` ; ligne « en attente par responsable » et état « prêt pour l'export » de la Conformité —
`RfpPage.tsx:361-377` ; champ Responsable éditable et champ risque par exigence — `RfpPage.tsx:420-457` ;
bouton « Rédiger » conditionnel — `RfpPage.tsx:458-468` ; message « aucun projet disponible » —
`RfpPage.tsx:615-619`. Aucun conflit de cible identifié — tous les écarts relevés sont des manques factuels, pas
des désaccords produit ; conformément au périmètre du lot, la logique/cible de `rfp` n'a pas été réécrite.

## app/projects-needs

Manques (corrigés) : deuxième rangée de 5 compteurs cliquables + `HygieneBadge` —
`OpenNeedsPage.tsx:577-618` ; colonnes « Périmètre » et « Matching » du tableau (21 colonnes réelles, pas 19) —
`OpenNeedsTable.tsx:185-190,217` ; ~7 champs manquants du tiroir « Plus de filtres » (Séniorité, Lieu, Statut,
Démarre dans, 3 bascules) + `SavedNeedViews` — `NeedsFilterDrawer.tsx:93-187` ; sous-vue `NeedFromRfpPreview` (en
ligne, pas une surcouche) — `OpenNeedsPage.tsx:415-433` ; bouton « Importer des fiches de poste » de l'état vide
— `OpenNeedsPage.tsx:560-566`. `NeedConsultantDoor`/`MatchDrawer` restent hors de cette spec : ce sont de vraies
surcouches (`Dialog`/`Sheet`), déjà tenues par le registre séparé `src/spec/overlays/`.

## app/settings-mes-donnees

Manques (corrigés) : état `partial` (comptes de lignes revenus `null`) absent de `states` —
`apps/web/src/features/settings/view/MyDataView.tsx:175-182`.

## app/settings-activity

**Complète.** Les écarts réels (carte vs tableau, 13 valeurs du filtre événement, état « permission », doubles
vides) sont déjà consignés dans les `uxNotes` de la spec.

## app/settings-legal-entities

Manques (corrigés) : formulaire d'édition inline (`EditLegalEntityForm`, 6 champs + Enregistrer/Annuler) —
`apps/web/src/features/legal-entities/view/LegalEntitiesView.tsx:158-160,315-352`.

## site/product

Manques (corrigés) : légende à 4 couleurs sous la carte de France — `apps/website/src/features/product/ProductSites.tsx:229-236` ;
contenu du tableau « Sites prioritaires » corrigé pour correspondre aux vraies données (type et verdict par
site) — `ProductSites.tsx:99-114`, `messages/fr/product.json:78-81` ; badge « Priorité haute » rendu en variante
succès (pas danger) — `apps/website/src/components/AppMockup.tsx:186-188` ; puce de score de contact toujours en
variante succès (pas warning) — `apps/website/src/features/product/ProductContacts.tsx:101-115`.
