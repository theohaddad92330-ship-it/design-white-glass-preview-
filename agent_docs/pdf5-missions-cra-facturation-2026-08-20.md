# PDF 5/9 — Missions, CRA, facturation et chiffre d'affaires — 20/08/2026

Source : `agent_docs/sources/pdf-5-missions-cra-facturation-2026-08-20.pdf` (13 pages, ORION, daté du 19/08/2026).
Prérequis déclarés : PDF 1 (socle), PDF 2 (projets), PDF 3 (talents), PDF 4 (positionnements) — les quatre sont en prod
(PR #988, #991, #994, #999).

Périmètre : le board Missions à douze colonnes et les effets de chaque déplacement, la fiche mission, le CRA de bout en
bout, le « prêt à facturer », la marge et les quatre chiffres d'affaires, les paiements et les litiges, le renouvellement
et le prévisionnel.

---

## 0. Ce qu'il faut savoir avant de le lire

**Une collision de numérotation.** Le PDF 5 pose ses questions sous les numéros **D26, D27, D28** — or ces trois numéros
ont déjà été attribués et tranchés par le PDF 4 le 20/08 (axes déterministes, langues et habilitations, portée du
chantier). Les questions du PDF 5 sont donc renumérotées **D31 à D36** dans ce tracker, et le tableau du §4 dit à quelle
question du PDF chacune correspond. Réutiliser un numéro déjà pris ferait relire, dans six mois, la mauvaise décision.

**Les marqueurs `[Confirmé — repo]` du PDF 5, vérifiés un par un.** Trois sur six sont exacts, ce qui est mieux que les
PDF précédents — et les trois autres décrivent une capacité de LECTURE comme si elle était une capacité d'ACTION :

| Affirmation du PDF                                                   | Réalité vérifiée                                                                                                                                                                                     |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §7.3 « `REMINDER_SCHEDULE_DAYS = [5, 12, 20]` »                      | **VRAI** — `packages/contracts/src/schemas/invoice-readiness.ts:168`, avec `MAX_REMINDERS` dérivé de sa longueur.                                                                                    |
| §8.2 « les 8 bloqueurs »                                             | **PARTIEL** : il y en a **sept** (`invoice-readiness.ts:34-51`), et trois du PDF manquent — contact facturation, mission sans date de début, litige (seul `timesheet_disputed` existe).              |
| §12 MIS-07 « intervention `renewal_at_risk` »                        | **VRAI** — `intervention-rules.ts:121-134`, seuil 30 j, balayage quotidien.                                                                                                                          |
| §12 FIN-04 « après 3 relances → escalade `invoicing_blocked` »       | **FAUX sur la condition.** L'intervention existe, mais son déclencheur est « 40 jours de blocage », **jamais** le nombre de relances : `remindersSent` n'apparaît pas dans `detectBlockedInvoicing`. |
| §12 FIN-02/03 « relance consultant J+5, puis J+12 et J+20 »          | **FAUX comme automatisation.** `dueReminders()` DIT quelles relances sont dues ; aucune n'est envoyée, et aucun cron ne tourne dans ce module.                                                       |
| §12 MIS-11 « intercontrat > 30 j → push ciblé »                      | **FAUX**, et c'est la deuxième fois : le PDF 3 avait déjà démenti exactement cette phrase. `bench_alert` notifie une liste de noms, il ne pousse rien.                                               |
| §6 « le produit couvre aujourd'hui le CRA et les alertes T-60/T-30 » | **PARTIEL** : les alertes existent (T-60/T-30 via `renewalWindow`), le CRA n'a ni clôture de période, ni endpoint de validation, ni de contestation.                                                 |

**La leçon des PDF 3 et 4 s'applique en plein, et le croisement en a trouvé cinq occurrences de plus** (§2) : une capacité
livrée, testée, et que **rien n'appelle**. Le board à douze colonnes, la route des renouvellements, la case « créer la
mission » du panneau d'effet — les trois existent et aucune n'a de consommateur.

---

## 1. Inventaire

Statuts : `LIVRÉ` · `PARTIEL` · `ABSENT` · `PÉRIMÉ` · `REFUS` · `DÉCISION`.

### §1 — Périmètre et règle fondatrice (p.1)

| #   | Exigence                                                                  | Statut | Preuve / raison                                                                                                                  |
| --- | ------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | BellumAI n'émet AUCUNE facture légale ; il dit ce qui EMPÊCHE de facturer | LIVRÉ  | `invoice-readiness.ts:4-27`, refus explicite `invoice-readiness.controller.ts:42`, garde de langage `no-overpromise.test.ts:103` |
| 2   | Chiffres de cadrage (intercontrat, turnover, marge, DSO)                  | —      | repères de marché, aucune implémentation attendue                                                                                |

### §2 — Le board à 12 colonnes (p.1-2)

| #     | Exigence                                                                         | Statut  | Preuve / raison                                                                                                                          |
| ----- | -------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 3     | Vue unifiée, colonnes 1-6 projets / 7-12 missions, aucune duplication            | LIVRÉ   | `mission-board.ts:91-134`, décision D2 déjà tranchée dans ce sens                                                                        |
| 4     | Badge d'ORIGINE sur chaque carte                                                 | PARTIEL | le champ `source` existe (`mission-board.ts:67-76`) ; **aucun écran ne rend ce board**                                                   |
| 5-16  | Les 12 colonnes, leur objet source, entrée, sortie et alerte                     | PARTIEL | les colonnes existent ; « À créer » n'est alimentée par rien (un projet `won` va en `gagnee`), et aucune alerte de séjour n'est calculée |
| 17-18 | En-tête : nombre, CA restant, « X sans date de fin » compté à part et EXCLU      | ABSENT  | `missionBoardSchema` ne porte que `cards` et `intakeCount`                                                                               |
| 19    | La carte : rôle, consultant ou « à staffer », fin + TJM, marge gated, UNE alerte | ABSENT  | la carte porte `label`, `accountName`, `originState` — rien d'autre                                                                      |
| 20    | Les 12 filtres                                                                   | ABSENT  | `board(workspaceId)` ne prend aucun paramètre                                                                                            |

### §3 — Effets de déplacement (p.2-3)

| #     | Exigence                                                         | Statut             | Preuve / raison                                                                                                 |
| ----- | ---------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| 21    | Chaque dépôt ouvre le panneau ; pré-cochage N1 seulement         | LIVRÉ pour le PIPE | `stage-move.ts:19-27` et `:45-46` — la règle existe, sur les étapes de PROJET                                   |
| 22-33 | Les 12 lignes du tableau d'effets par colonne                    | ABSENT             | `effectsForMove` ne connaît que les 9 étapes de projet, pas les 12 colonnes du board                            |
| 34    | Aucun déplacement silencieux, « Déplacer seulement » toujours là | LIVRÉ pour le pipe | `StageMovePanel.tsx`                                                                                            |
| 35    | Motif obligatoire vers Perdue, catalogue d'espace                | LIVRÉ pour le pipe | `stage-move.ts:81-86` (`reasonRequired`)                                                                        |
| 36    | Reculer autorisé ET journalisé                                   | PARTIEL            | autorisé ; le journal par champ existe (`ProvenanceService`) mais n'est pas branché sur un mouvement de mission |
| 37    | Aucun envoi externe pré-coché                                    | LIVRÉ pour le pipe | `N2()` force `checked: false` — `stage-move.ts:46`                                                              |
| 38    | Case grisée si la capacité manque, avec tooltip                  | ABSENT             | aucune notion de `requires_capability` dans `StageProposal`                                                     |
| 39    | Alternative clavier (touche M)                                   | ABSENT             | —                                                                                                               |
| 40    | Journal `activity` + `record_field_audit` à chaque mouvement     | PARTIEL            | `record_field_audit` existe (`provenance.service.ts:124`) ; `activities` n'a **pas** de colonne `mission_id`    |
| 41    | La colonne 7 est la seule qui CRÉE un objet                      | PARTIEL            | la case `create_mission` existe et **n'est jamais lue** (défaut X1)                                             |
| 42-43 | Arborescence du déplacement, KPI de renouvellement               | ABSENT             | —                                                                                                               |

### §4-5 — Créer une mission, sa fiche, ses deux scores (p.3-4)

| #     | Exigence                                                                        | Statut  | Preuve / raison                                                                                                       |
| ----- | ------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| 44    | Deux entrées : depuis un projet gagné, ou manuelle                              | PARTIEL | `POST /delivery/missions` existe ; aucun pré-remplissage, et **aucun bouton de création côté web**                    |
| 45-58 | Les 15 champs                                                                   | PARTIEL | manquent : site, intitulé du rôle distinct, type de contrat, contact facturation, propriétaire, partenaire            |
| 59-60 | Mission sans date de fin : badge permanent, aucune alerte, exclue du CA restant | PARTIEL | le risque `no_end_date` est calculé (`mission.ts:193`) ; le badge est un texte, et « CA restant » n'existe nulle part |
| 61-68 | Les 8 onglets de la fiche                                                       | ABSENT  | le détail est un tiroir à trois sections empilées, sans onglets, et son « historique » est celui du COMPTE            |
| 69-70 | Scores de risque (7 axes) et d'opportunité (5 axes), 0-100                      | ABSENT  | seule une liste catégorielle de 6 risques existe (`missionRisks`)                                                     |
| 71-72 | Moins de 3 axes ⇒ « non mesurable », avec la liste de ce qui manque             | ABSENT  | précédent le plus proche : `scoreEngagement` rend `null` quand AUCUN signal n'est lisible                             |

### §6 — Onboarding et run (p.4-5)

| #     | Exigence                              | Statut | Preuve / raison                                                                                                          |
| ----- | ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| 73-86 | Les 13 étapes datées, de J-8 à la fin | ABSENT | aucune checklist de mission ; tout ce qui s'appelle « onboarding » dans le dépôt concerne l'inscription d'un utilisateur |

### §7 — CRA (p.5-6)

| #       | Exigence                                                                              | Statut         | Preuve / raison                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 87-94   | Les 8 déclencheurs                                                                    | ABSENT         | aucun cron ne crée un relevé ni ne relance ; les lignes ne naissent que d'une saisie manuelle                                                                                  |
| 95-100  | Les 6 statuts                                                                         | PARTIEL        | quatre existent, d'un autre vocabulaire (`draft`, `submitted`, `validated`, `disputed`) ; manquent `attendu`, `absent`, `non_requis`. La colonne SQL n'a **aucune contrainte** |
| 101     | `REMINDER_SCHEDULE_DAYS = [5, 12, 20]`                                                | LIVRÉ          | `invoice-readiness.ts:168`                                                                                                                                                     |
| 102     | Garde-fous : arrêt, heures calmes, plafond, opt-in                                    | LIVRÉ ailleurs | `playbook.ts:44-56` et `:125-141` — mais ces garde-fous ne protègent que les trois playbooks, pas le CRA                                                                       |
| 103-107 | Les 4 canaux, « jamais brouillon Teams », l'email par défaut, l'annonce avant le clic | ABSENT         | aucune fonction de résolution de canal ; la garde de langage n'interdit pas cette formule                                                                                      |
| 108-111 | Les 4 cas d'écart, mois partiel au prorata CALCULÉ                                    | PARTIEL        | `dayGap` existe et rend `null` proprement ; `expectedWorkingDays` ne connaît pas les bornes d'un mois partiel                                                                  |
| 112     | Écart ≠ 0 empêche `ready`                                                             | PARTIEL        | seul un écart POSITIF devient une anomalie ; un jour manquant ne bloque rien                                                                                                   |
| 113-114 | L'écran `/missions/cra` et ses filtres                                                | ABSENT         | —                                                                                                                                                                              |

### §8 — Prêt à facturer (p.6-7)

| #       | Exigence                                                       | Statut  | Preuve / raison                                                                 |
| ------- | -------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------- |
| 115     | Route dédiée + bandeau permanent « Ce n'est pas une facture »  | PARTIEL | c'est un onglet de `/missions` ; le bandeau existe avec un autre texte          |
| 116-118 | Les trois blocs                                                | PARTIEL | les trois ÉTATS existent, pas les trois blocs et leurs contenus distincts       |
| 119-126 | Les 8 bloqueurs                                                | PARTIEL | sept existent ; manquent contact facturation, date de début, litige             |
| 127     | Aucun montant en « prêt » avec un bloqueur                     | PARTIEL | vrai par ligne ; **faux au total**, qui additionne prêt ET bloqué (défaut X4)   |
| 128     | « Marquer comme facturé » : référence, date, montant, échéance | PARTIEL | l'endpoint n'accepte qu'une date, et le bouton n'ouvre aucun modal              |
| 129-131 | Export CSV/XLSX, Factur-X, la phrase de survol                 | ABSENT  | le module `documents/` sait faire du XLSX, aucun export de facturation n'existe |

### §9-11 — Marge, CA, paiements, prévisionnel (p.7-9)

| #       | Exigence                                            | Statut  | Preuve / raison                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------- | --------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 132-136 | Les QUATRE CA, affichés séparément                  | ABSENT  | des briques existent, rien ne les nomme ni ne les assemble ; « encaissé » n'a aucune source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 137-141 | La formule de marge et la règle « non mesurée »     | LIVRÉ   | `missionMargin` (`staffing.ts:192`) et `dailyMarginPercent` (`mission.ts:205`), tous deux testés                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 142-148 | Les 7 axes de marge                                 | PARTIEL | ⚠️ **Recompté le 29/08/2026 : TROIS axes existent, pas un.** Par mission (`staffing.service.ts:227`), par consultant (`propagation.service.ts:327-393` → `TalentMarginCard`) et **par canal** (`staffing.ts:418-448` → `FinancePanel.tsx:253-274`, avec `intermediationCost` — l'axe « direct vs rang 2 » que le PDF appelle « l'écart qui mesure le coût de l'intermédiation »). Manquent : par client, par offre/expertise, par type de contrat — dont les colonnes existent toutes en base. Le septième, « par commercial », existe en FILTRE (`financeScopeClause`) et pas en ventilation : la source le voulait « avec prudence », **parqué en D147 avec la recommandation de le refuser** — le commercial ne fixe pas les salaires. |
| 149-150 | Alerte de marge sous seuil par espace               | ABSENT  | aucun réglage, aucune intervention                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 151-152 | Le niveau de recouvrement et l'écran Paiements      | ABSENT  | aucune table de paiement ; l'absence est **documentée comme volontaire** dans la migration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 153-156 | Relance graduée J+3/J+15/J+30, jamais sur un litige | ABSENT  | la seule cadence est `[5,12,20]`, sans variation de ton                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 157     | Le litige et ses effets                             | PARTIEL | `timesheet_disputed` bloque la facturation ; il ne suspend PAS les relances (défaut X5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 158     | L'onglet Renouvellements                            | PARTIEL | `GET /delivery/renewals` existe et **n'a aucun appelant** (défaut X3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 159-165 | Le prévisionnel en trois lignes, sans pondération   | PARTIEL | le refus de la pondération est implémenté et documenté (`project.ts:657`) ; les trois lignes n'existent pas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 166-169 | Le prévisionnel de capacité                         | ABSENT  | `deriveStaffing` est la brique, aucune agrégation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### §12-13 — Automatisations, permissions, edge cases, KPI (p.9-10)

| #       | Exigence                                               | Statut                     | Preuve / raison                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 170-193 | Les 24 automatisations                                 | ⚠️ **PÉRIMÉ — voir le §8** | Disait « 2 LIVRÉES sur 24 » le 20/08, et c'était vrai ce jour-là. Remesuré une par une le 29/08 : **12 livrées, 2 livrées à un niveau volontairement abaissé, 5 partielles, 5 absentes**. Un verdict global sur vingt-quatre déclencheurs est le défaut que la passe B reproche à l'archive — le §8 donne, par ligne, le statut, le niveau RÉEL, le garde-fou branché et le DÉCLENCHEUR.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 194-204 | Les permissions, dont `finance:write` et `export:data` | PARTIEL                    | `finance:read` existe ; `finance:write`, `export:data` et le rôle `ops` **n'existent pas**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 205-217 | Les 13 edge cases                                      | PARTIEL                    | mission sans fin, deux consultants, mois facturé ailleurs sont traités ; type de contrat, jalons, historique de TJM, file d'attente ERP ne le sont pas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 218     | Les 17 KPI et leurs 10 cibles chiffrées                | PARTIEL                    | ⚠️ **Recompté le 29/08/2026 : la source en énumère DIX-SEPT, pas dix-huit** (« un total est un argument »). Dix sont calculés ET affichés, cinq ne sont calculés nulle part (CRA avant J+5 — rien n'horodate le dépôt ; délai clôture → prêt à facturer ; taux de renouvellement ; durée d'intercontrat ; l'agrégat de portefeuille des missions à risque), un est structurellement mort (« sous le seuil de marge » : le seuil n'a aucun chemin de saisie, **D148**). **Les CIBLES sont livrées** : `KPI_TARGETS` (`packages/contracts/src/schemas/kpi-targets.ts`) porte les dix que la source chiffre, avec leur SENS, et l'écran Finance en compare quatre. Deux d'entre elles portent sur notre propre ignorance (marge non mesurée < 10 %, missions non mesurables < 20 %) et sont NOMMÉES comme telles à l'écran. Corrigé au passage : le dictionnaire visait 90 % pour les CRA (source : 85 %) et 20 % pour la marge non mesurée (source : 10 % ; le 20 % appartenait aux missions non mesurables, absentes du dictionnaire). |

---

## 2. Ce que le croisement a trouvé et que le PDF ne demandait pas

| #   | Défaut                                                                                      | Preuve                                                                                                                                                         | Pourquoi c'est grave                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| X1  | La case « créer la mission », pré-cochée au passage en « gagné », **n'est jamais lue**      | `stage-move.ts:73` propose `create_mission`; `PipelineBoard.tsx:164` et `ProjectStageControl.tsx:110` appellent `onConfirm({ reason })` en ignorant `accepted` | L'utilisateur coche, valide, et rien ne se passe. C'est le geste qui fait naître une mission — le seul de tout le pipe qui crée un objet.                          |
| X2  | `GET /delivery/board` n'a **aucun consommateur web**                                        | aucune occurrence de `delivery/board` dans `apps/web/src`                                                                                                      | Le board à douze colonnes, livré au socle, n'est visible nulle part.                                                                                               |
| X3  | `missionsApi.renewals()` est déclaré et **jamais appelé**                                   | `apps/web/src/features/missions/api.ts:46`                                                                                                                     | Une route API et un client, pour un écran qui n'existe pas.                                                                                                        |
| X4  | Le total « préparé » additionne les mois PRÊTS **et** BLOQUÉS                               | `invoice-readiness.ts:249-259`                                                                                                                                 | L'écran annonce un montant préparatoire qui inclut ce qu'on ne peut pas facturer — exactement le chiffre qu'un dirigeant lira comme du chiffre d'affaires à venir. |
| X5  | Un relevé CONTESTÉ continue de déclencher des relances                                      | `reminderDue` ne regarde que `state === 'blocked'` (`invoice-readiness.ts:186`)                                                                                | On relance un client qui est en train de contester.                                                                                                                |
| X6  | `activities` n'a pas de colonne `mission_id`                                                | `activity.entity.ts:53-60`                                                                                                                                     | L'« historique » d'une mission affiche celui du COMPTE — donc les échanges d'autres missions du même client.                                                       |
| X7  | `missions.status` n'a **aucune contrainte** en base                                         | `1788290000000-DeliveryOs.ts:35`                                                                                                                               | Six valeurs attendues, zéro garde-fou : une faute de frappe passe, et l'écran affiche une clé brute (défaut déjà vu au chantier CRM).                              |
| X8  | Deux colonnes portent le coût d'une mission                                                 | `missions.daily_cost` et `mission_commercial_terms.loaded_daily_cost_cents`                                                                                    | Deux fonctions de marge lisent deux sources différentes pour deux écrans — la famille de défauts exacte des PDF 3 et 4.                                            |
| X9  | `noticeDays` (préavis contractuel) est saisi et **jamais croisé** avec les seuils T-60/T-30 | `staffing.ts:168`, aucun appelant hors CRUD                                                                                                                    | Un préavis de trois mois alerte au même moment qu'un préavis de huit jours.                                                                                        |

---

## 3. Lots d'implémentation

| Lot | Contenu                                                                                                                                                                | Dépend de |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| A   | Contrat `mission-board.ts` enrichi : agrégats par colonne (`withoutEndDateCount` EXCLU des sommes), carte détaillée, colonne « À créer » réellement alimentée, filtres | —         |
| B   | `board-move.ts` : `effectsForMove` pour les 12 colonnes, `requiresCapability`, 20+ cas de test                                                                         | A         |
| C   | API `GET /missions/board` (agrégats + filtres) et `POST /missions/:id/move` (journal, motif obligatoire)                                                               | A, B      |
| D   | La case « créer la mission » branchée, et les champs manquants de la mission (rôle, type de contrat, contact facturation, propriétaire, site)                          | C         |
| E   | CRA : les 6 statuts, les colonnes qui manquent (consultant, jours prévus, écart, explication, validation), le prorata d'un mois partiel, écart ≠ 0 bloquant            | —         |
| F   | Relances CRA : `resolveChannel`, réutilisation des garde-fous et du chemin d'envoi existants, jamais « brouillon Teams »                                               | E         |
| G   | Prêt à facturer : les 3 bloqueurs manquants, une action par bloqueur, le total qui cesse d'additionner prêt et bloqué, le modal « marquer facturé », l'export          | E         |
| H   | Marge et les quatre CA séparés, l'alerte de seuil par espace                                                                                                           | G         |
| I   | Scores de risque et d'opportunité, avec la règle « moins de 3 axes ⇒ non mesurable »                                                                                   | D         |
| J   | Renouvellements et prévisionnel sans pondération, prévisionnel de capacité                                                                                             | I         |
| K   | Automatisations : ce qui manque vraiment, et pas les 24                                                                                                                | E, G      |
| L   | Web : board, écran CRA, écran facturation, renouvellements · démo · changelog · tracker                                                                                | tous      |

---

## 4. Décisions tranchées par Louis le 20/08/2026

⚠️ Le PDF numérote ses questions D26 à D30 — trois de ces numéros sont **déjà pris** par le PDF 4. Renumérotées ici.

| #   | Question du PDF                                                 | Réponse                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D31 | D2 (rappel) — périmètre du board                                | **Tranché sans question, et il faut le dire précisément.** D2 avait posé « vue de projection, on n'y déplace pas de carte ». Le §3 du PDF 5 demande l'inverse. Les deux se concilient : le board reste une PROJECTION — il ne crée aucun état — mais un déplacement y écrit sur **l'objet d'origine** (le projet change d'étape, la mission change de statut). Ce que D2 interdit, c'est un troisième jeu d'états ; ce n'est pas le geste. |
| D32 | D26 — export Factur-X / UBL / CII                               | **Différé, et écrit.** L'obligation du 01/09/2026 porte sur la RÉCEPTION de factures électroniques par les entreprises — Bellum n'en émet aucune, et n'a donc rien à recevoir. L'export CSV/XLSX alimente l'outil qui, lui, émet et se conforme. Produire un Factur-X depuis un outil qui « n'émet rien » serait la contradiction la plus visible du produit.                                                                              |
| D33 | D27 — niveau de recouvrement                                    | **Niveau 1** : échéances, jours de retard, relance graduée préparée, litige qui suspend les relances. Aucun rapprochement bancaire, aucun lettrage — c'est de la comptabilité.                                                                                                                                                                                                                                                             |
| D34 | D28 — candidats en recrutement dans le prévisionnel de capacité | **Non par défaut, ligne séparée.** Un candidat en cours de recrutement n'est pas une capacité : le compter dans la même colonne ferait promettre au client une personne qui n'a pas signé.                                                                                                                                                                                                                                                 |
| D35 | D29 — mission au forfait : jalons obligatoires                  | **Oui.** Le type de contrat entre sur la mission ; au forfait le CRA passe `non_requis` et le prêt à facturer s'appuie sur un jalon atteint. Sans jalon, un forfait ne serait jamais facturable — ou le serait toujours.                                                                                                                                                                                                                   |
| D36 | D30 — qui saisit le coût chargé                                 | **Créer `finance:write`**, en fin d'enum, accordée à owner/admin/finance. Aujourd'hui le coût est LISIBLE sous `finance:read` et MODIFIABLE par quiconque a `records:write` : un commercial peut écrire un chiffre qu'il n'a pas le droit de lire, et c'est ce chiffre qui détermine la marge de l'ESN.                                                                                                                                    |
| D37 | portée du chantier                                              | **Tout, les 12 lots A→L.**                                                                                                                                                                                                                                                                                                                                                                                                                 |

---

## 5. Ce qu'on ne promet pas

- **Aucune facture légale**, et rien qui y ressemble : pas de numérotation, pas de TVA, pas de mention légale,
  pas de Factur-X (D32). Une facture engage une comptabilité et une obligation de conservation ; un document
  produit « pour aider » créerait une pièce que personne ne pourrait ni corriger ni annuler proprement.
- **Aucune pondération probabiliste dans le prévisionnel** (arbitrage n°4 du 16/08, déjà réaffirmé quatre fois).
  Trois lignes distinctes, aucun total unique — parce qu'un total unique serait faux.
- **Aucune marge estimée.** Coût non renseigné ⇒ « non mesurée », jamais 0 €, jamais une moyenne de marché.
- **Aucun rapprochement bancaire ni lettrage** (D33). Le suivi s'arrête à « cette facture est en retard de
  N jours » ; qui a payé quoi sur quel virement est le travail du comptable.
- **Aucune relance envoyée seule sur le CRA.** Les relances sont PRÉPARÉES et partent par le chemin d'envoi
  existant, avec ses garde-fous — jamais par un second moteur.
- **Jamais l'expression « brouillon Teams ».** Teams n'a pas de brouillon : ce qu'on y prépare est un message
  qui partira entier au clic. Le dire autrement ferait croire à un filet qui n'existe pas.
- **Les candidats en recrutement n'entrent pas dans la capacité** (D34).
- **Les 22 étapes de l'OS de référence** ne seront pas toutes outillées : celles qui exigent un connecteur
  absent (badge, VPN, matériel) resteraient des cases à cocher que rien ne remplit — la version réglages du
  « livré mais jamais appelé » que ce chantier corrige.
- **Le DSO et le taux d'intercontrat restent « non mesurés »** tant que les paiements n'ont pas plusieurs mois
  d'historique réel. Un DSO calculé sur trois factures n'est pas un DSO.

## 6. État de livraison

**PR #1007, mergée sur `main` le 21/08/2026.** Les douze lots A→L sont partis.

| Lot | État     | Ce qui est parti                                                                                                                                                                                                                                  |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | ✅ livré | `MISSION_BOARD_ALERTS` (6, ordonnées par gravité), `worstAlert`, `MISSION_BOARD_STALE_DAYS` (`null` pour « En cours » et « Terminée »), carte détaillée, `summarizeColumn` qui EXCLUT du montant les cartes sans date de fin et les COMPTE à part |
| B   | ✅ livré | `board-move.ts` — `effectsForBoardMove` sur les 12 colonnes, `offerableProposals` (grise, ne retire jamais), `defaultCheckedKeys` (ne coche jamais une action grisée), 16 tests                                                                   |
| C   | ✅ livré | `GET /delivery/board` (agrégats + 8 filtres + `canReadFinance`), `POST /delivery/missions/:id/move`, migration `1789688412753` (5 colonnes + contrainte `status` qui n'existait pas), projet gagné sans mission → colonne « À créer »             |
| D   | ✅ livré | `accepted_actions` traversé de bout en bout, `performedBy` sur chaque proposition, `create_mission` et `park_account` exécutés, le reste rendu en « à faire », 6 tests de contrôleur + 2 gardes web                                               |
| E   | ✅ livré | 3 statuts de plus, maille mission × consultant, `expectedWorkingDaysInWindow`, charge figée au dépôt, `gapBlocksInvoicing` dans les deux sens, migration `1789691847302`                                                                          |
| F   | ✅ livré | `resolveChannel` (déduit de ce qui est branché, jamais un réglage), `toneForReminder` borné à trois, garde de langage contre « brouillon Teams » dans `no-overpromise.test.ts`                                                                    |
| G   | ✅ livré | 3 bloqueurs de plus, `blockedAmountCents` séparé de `preparedAmountCents`, `BLOCKER_ACTIONS`, référence + montant + échéance sur « facturé », export CSV (`readiness-export.ts`, 6 tests), route `/missions/facturation`                          |
| H   | ✅ livré | `revenue.ts` (4 CA, `marginPercent`, `aggregateMargin` pondérée par les jours), `RevenueService`, seuil de marge par espace, `GET /delivery/finance/*`                                                                                            |
| I   | ✅ livré | `mission-scores.ts` — `MIN_AXES_FOR_SCORE = 3`, axes non évaluables NOMMÉS, `MissionScoresService` (5 axes de risque, 4 d'opportunité)                                                                                                            |
| J   | ✅ livré | Lentille Renouvellements (premier appelant de `GET /delivery/renewals`), prévisionnel en 3 lignes non pondérées, `computeCapacity`                                                                                                                |
| K   | ✅ livré | 3 routines (`timesheet_chase`, `invoice_readiness`, `margin_alert`) via `DeliveryRoutinesService` — un seul point d'entrée pour ne pas faire monter GA-07, zéro règle recopiée                                                                    |
| L   | ✅ livré | `/missions/board`, `/missions/cra`, `/missions/facturation`, onglets de nav, i18n FR+EN, 4 entrées de changelog, démo (3ᵉ mission au FORFAIT)                                                                                                     |

**Ajouts non demandés par le PDF, sortis du croisement :** `finance:write` (D36) avec un décorateur
qui accepte plusieurs permissions dont l'UNE suffit — c'est ce qui ouvre la facturation au rôle
Finance sans la retirer aux sièges historiques ; `invoicingNeedsTimesheet` distinct de
`expectsTimesheet`, parce que « ne pas relancer sur un contrat de nature inconnue » est prudent
alors que « le déclarer prêt à facturer sans relevé » ne l'est pas du tout ; et le `timesheetId`
porté jusqu'aux boutons qui l'écrivent.

**Refactorisation collatérale.** `InvoiceReadinessService` et `TimesheetsService` ne résolvent plus
l'espace de travail eux-mêmes : leurs contrôleurs le font. Ce n'est pas du style — GA-07 était
EXACTEMENT au plafond (232/115), et le seul moyen d'ajouter les trois routines sans faire monter le
cliquet était d'en rendre un. La règle §3.2 y gagne au passage.

## 7. Ce que la recette live a trouvé

Six défauts, dont **quatre invisibles pour 9 500 tests verts**. Tous corrigés et redéployés le même
jour ; chacun a laissé une garde derrière lui.

### X1 — Onze endpoints rendaient un tableau là où leur type annonçait un objet

Le plus grave, et le seul qu'un test ne pouvait pas voir. TypeORM ne rend pas la même forme selon
le verbe SQL : pour `UPDATE` et `DELETE`, `PostgresQueryRunner.query` rend `[lignes, nombre]` ;
pour tout le reste, `lignes`. Écrire `rows[0]` après un `UPDATE … RETURNING` donne donc le TABLEAU
des lignes. Comme un tableau est « truthy », chaque `if (!row) throw NotFound` passait, et chaque
champ lu valait `undefined`.

Ce n'est jamais tombé parce que **le web ne lit pas ces réponses** : il invalide son cache et
ré-interroge. Les conséquences réelles étaient pourtant là depuis des mois — la trace
`stage_change` de la timeline n'a JAMAIS fonctionné (celle que le socle annonçait avoir corrigée),
`updateRelationshipMemory` rendait toujours `null`, `appendPlanItem` rendait
`raw_analysis: undefined`, et `linkAction` répondait toujours « lié » puisque `[lignes, nombre]` a
une longueur de 2 quoi qu'il arrive.

Découvert par le seul chemin qui pouvait le dire : une mission créée depuis un projet gagné est
partie en base avec `account_id = NULL`, et c'est une contrainte SQL — pas un type, pas un test —
qui a fini par le signaler.

**Garde** : `returnedRows` / `firstReturnedRow` / `returnedCount`, et un test qui lit les sources
et refuse tout nouveau `UPDATE … RETURNING` lisant son résultat à la main.

### X2 — Un garde que `undefined` traversait

`DeliveryService.create` lisait le compte avec `findOne({ where: { id: input.accountId } })`.
TypeORM **ignore une condition dont la valeur est `undefined`** : la requête rendait donc le
PREMIER compte de l'espace, le contrôle « compte introuvable » passait, et l'insertion partait avec
`account_id = NULL`. Un garde qui laisse passer `undefined` n'est pas un garde : l'identifiant est
désormais refusé AVANT la lecture.

### X3 — Trente propositions traduites de mémoire

Le panneau d'effets du board affichait `board.move.proposal.set_timesheet_cadence` en toutes
lettres. Les libellés avaient été écrits de tête plutôt que depuis le catalogue ; onze n'existaient
pas sous ce nom, et six alertes non plus. La garde de parité FR/EN ne pouvait rien voir : elle
compare les deux fichiers ENTRE EUX, et deux fichiers également incomplets se ressemblent
parfaitement.

**Garde** : `board-move-keys.test.ts` énumère tous les déplacements possibles — board ET pipe — et
exige un libellé pour chaque proposition, vérification, colonne écrite, colonne de board et alerte,
dans les deux langues.

### X4 — Deux bloqueurs de facturation en clé brute

Même famille, autre écran : `readiness.blockers.missing_billing_contact` s'affichait tel quel.
`enum-keys.test.ts` couvrait quatorze catalogues et pas celui-là. Les quatre énumérations que les
écrans du PDF 5 rendent y sont entrées.

### X5 — Deux écrans, deux réponses sur le même relevé

Un relevé à 12 jours sur un mois à 21, sur une mission de nature inconnue : l'écran des relevés
annonçait « rien ne bloque », celui de la facturation refusait la ligne pour « écart non
expliqué ». La cause est une confusion entre deux questions — la nature du contrat décide si l'on
RÉCLAME un relevé, elle ne décide pas du sort d'un relevé qui EXISTE. Un test croise désormais les
deux vues sur les quatre cas d'écart et exige qu'elles tranchent pareil.

### X6 — Créer une mission n'a pas d'annulation, et rien ne le disait

Cocher « créer la mission » produit une mission, et le produit n'a AUCUN chemin de suppression —
délibérément, puisque supprimer une mission effacerait l'historique de facturation qui s'y
accroche. Le panneau du board portait déjà l'avertissement ; celui du pipe, le chemin le plus
emprunté, ne l'avait pas.

### Ce qui a été vérifié en vrai, par des gestes

Déplacer un projet vers « Signé » avec la case cochée → mission créée, `performed: ['create_mission']`,
`pending: ['prepare_onboarding']`. Board : les douze colonnes, les agrégats (« — » et non « 0 € »,
« 2 sans date de fin » comptés à part), le déplacement d'une carte de mission avec son panneau.
Relevés : dépôt, écart négatif détecté, explication d'écart, validation client. Facturation : les
quatre bloqueurs dont les deux nouveaux, le modal « marqué comme facturé » avec sa référence,
l'export CSV (200). Balayage complet de la navigation — Aujourd'hui, Comptes, Projets, Talents,
Missions et ses quatre onglets, Actions et Séquences, Copilote, Pilotage, Réglages : aucune
régression.

**Données de test nettoyées** : le projet est revenu en « détecté », la mission d'essai est passée
en « terminée ». Elle n'a pas pu être supprimée — c'est le défaut X6, et c'est un refus assumé du
produit.

---

## 8. Les 24 automatisations, mesurées une par une — 29/08/2026

⚠️ **Ce tableau REMPLACE la ligne « items 170-193 · Les 24 automatisations · 2 LIVRÉES sur 24 » du
§1.** Elle n'est plus vraie : elle datait du 20/08, avant les lots qui ont livré le board, les
relevés, la facturation et la file d'intervention. Un verdict global sur vingt-quatre déclencheurs
est exactement le défaut que le rapport de la passe B reproche à l'archive (`ARCHIVE-02`, item 1 :
« vingt-quatre déclencheurs, vingt-quatre garde-fous, un verdict »).

Mesure faite contre `origin/main` à `69cb5705d`, source relue en entier (`pdf5.md:466-489`). Pour
chaque ligne, la question posée n'est pas « la fonction existe-t-elle ? » mais **« qu'est-ce qui la
DÉCLENCHE ? »** — un catalogue que rien ne déclenche n'est pas livré.

Les deux déclencheurs réels du domaine, vérifiés montés :

- `InterventionsSweeper` — `@Cron('10 6 * * *', Europe/Paris)` (`interventions.sweeper.ts:98`),
  provider de `PlaybooksModule`, importé par `AppModule`, et `ScheduleModule.forRoot()` booté par
  `OutboxModule` — sans lui aucun `@Cron` du processus ne serait découvert ;
- `RoutinesScheduler` — `@Cron('*/15 * * * *')` (`routines.scheduler.ts:38`), qui demande à chaque
  abonné si une routine lui est due à l'heure de SON fuseau.

Tout le reste est déclenché par un **geste** : un déplacement de carte, un dépôt de relevé, un clic.

| ID         | Ce que la source demande (niveau · garde-fou)                                                    | Statut mesuré                       | Niveau RÉEL | Garde-fou effectivement branché                                                                                       | Déclencheur (`fichier:ligne`)                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------ | ----------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **MIS-01** | projet `won` → proposer la mission · N1 · **jamais automatique**                                 | LIVRÉ                               | N1          | `defaultChecked` réservé à N1 et jamais à un envoi (`board-move.ts:44-46`) ; unicité `(espace, projet)`               | geste : `board-move.ts:164` → `projects.controller.ts:585`                                         |
| **MIS-02** | mission créée → checklist d'onboarding · N1 · —                                                  | PARTIEL                             | N1          | —                                                                                                                     | `board-move.ts:166` — mais **hors** `SERVER_PERFORMED_BOARD_ACTIONS` (`board-move.ts:309`)         |
| **MIS-03** | J+1 → brouillon de check consultant · N2 · **1 seul**                                            | ABSENT                              | —           | —                                                                                                                     | **aucun**                                                                                          |
| **MIS-04** | J+3 → brouillon de check client · N2 · **1 seul**                                                | ABSENT                              | —           | —                                                                                                                     | **aucun**                                                                                          |
| **MIS-05** | J+30 → point de suivi + **créneau** · N2 · —                                                     | LIVRÉ AUTREMENT                     | N1 serveur  | sans date de démarrage, l'action échoue `no_start_date` plutôt que d'inventer une échéance                            | geste : `board-move.ts:176` → `delivery.controller.ts:229`                                         |
| **MIS-06** | T-60 → ouvrir le renouvellement, feedback + dispo · N1 · **date fiable requise**                 | PARTIEL — la fenêtre est **T-30**   | N2          | tenu : une mission sans `ends_on` n'alerte jamais                                                                     | `routine-executors.ts:608` (30 en dur) ; gestes `board-move.ts:188-190` → **D173**                 |
| **MIS-07** | T-30 sans plan → `renewal_at_risk` · N1 · —                                                      | **LIVRÉ**                           | N4          | idem                                                                                                                  | cron : `interventions.sweeper.ts:142` → `intervention-rules.ts:140`                                |
| **MIS-08** | T-15 → proposer le repositionnement · N1 · —                                                     | PARTIEL — le geste existe, pas T-15 | N1          | —                                                                                                                     | gestes : `board-move.ts:191`, `board-move.ts:203`                                                  |
| **MIS-09** | mission terminée → REX + vérification facturation · N1 · —                                       | LIVRÉ (en rappels)                  | N1          | un REX exige un résumé écrit par un humain — refus assumé (`board-move.ts:305`)                                       | geste : `board-move.ts:199-201`                                                                    |
| **MIS-10** | risque > seuil et mesurable → alerte propriétaire + manager · N1 · **jamais sur donnée absente** | ABSENT                              | —           | le score sait déjà se taire ; il n'y a ni seuil ni alerte                                                             | **aucun** — `mission-scores.service.ts:106` n'a que deux lecteurs HTTP                             |
| **MIS-11** | intercontrat > 30 j → **push ciblé** · N1 · —                                                    | PARTIEL — notifie, ne pousse pas    | N4          | —                                                                                                                     | cron : `routines.scheduler.ts:38` → `routine-executors.ts:611`                                     |
| **MIS-12** | mission sans date de fin > 30 j → **rappel unique** · N1 · **1 seul**                            | **LIVRÉ le 29/08**                  | N4          | « 1 seul » = index `interventions_unique` + `ON CONFLICT DO NOTHING` ; forfait/recrutement/inconnu exclus             | cron : `interventions.sweeper.ts:158` → `intervention-rules.ts:640`                                |
| **FIN-01** | **le 25 du mois** → lister les missions facturables · N1 · —                                     | ABSENT                              | —           | —                                                                                                                     | **aucun** — aucune cadence « jour du mois » : `monthly` = 1er OUVRÉ (`routine-schedule.ts:95`)     |
| **FIN-02** | J+5, CRA absent → relance consultant · **N5** · 3 max, heures calmes, arrêt sur réception        | LIVRÉ, **niveau abaissé**           | **N2**      | 3 max ✓ · arrêt sur réception ✓ · heures calmes **sans objet** (le produit n'envoie pas)                              | geste : `timesheets.service.ts:338` → `POST /timesheets/:id/reminder` → **D171**                   |
| **FIN-03** | J+12, J+20 → relances 2 et 3 · **N5** · idem                                                     | LIVRÉ, **niveau abaissé**           | **N2**      | cadence unique `REMINDER_SCHEDULE_DAYS` (`invoice-readiness.ts:355`)                                                  | idem → **D171**                                                                                    |
| **FIN-04** | **après 3 relances** → escalade `invoicing_blocked` · N1 · —                                     | LIVRÉ sous un autre nom et à **2**  | N4          | un compteur inconnu ne remonte pas                                                                                    | cron : sweeper → `intervention-rules.ts` (`timesheet_missing`), seuil `playbook.ts:353` → **D172** |
| **FIN-05** | CRA reçu → calculer l'écart, validation client si requise · N1 · —                               | **LIVRÉ**                           | N1          | l'écart non expliqué BLOQUE (`invoice-readiness.ts:98`)                                                               | geste : dépôt du relevé, `timesheets.controller.ts:73` et `:98`                                    |
| **FIN-06** | CRA validé, écart 0 → montant préparatoire · N1 · **jamais d'émission**                          | **LIVRÉ**                           | N1          | tenu : refus explicite `invoice-readiness.controller.ts:42` + garde de langage ; `prepared()` rend `null`, jamais `0` | dérivé à la lecture : `invoice-readiness.ts:254`                                                   |
| **FIN-07** | écart ≠ 0 → demander l'explication, bloquer · N1 · —                                             | **LIVRÉ**                           | N1          | `unexplained_gap` empêche `ready`                                                                                     | idem                                                                                               |
| **FIN-08** | mois non facturable > 40 j → intervention manager · N1 · —                                       | **LIVRÉ**                           | N4          | on attend que le mois soit CLOS et un peu plus                                                                        | cron : `interventions.sweeper.ts:143` → `intervention-rules.ts:175`                                |
| **FIN-09** | échéance dépassée → relance graduée · N2 · **jamais sur un litige**                              | **LIVRÉ**                           | N1          | tenu **par le compilateur** : `disputedAt`/`disputeResolvedAt` sont OBLIGATOIRES (`invoice-readiness.ts:391`)         | geste, sur l'écran de facturation                                                                  |
| **FIN-10** | marge sous le seuil → alerte propriétaire + manager · N1 · **jamais si coût absent**             | **LIVRÉ**                           | N4          | tenu : marge `null` ⇒ aucune alerte (`revenue.service.ts:238`) ; aucun seuil réglé ⇒ silence, et il le DIT            | cron : `routines.scheduler.ts:38` → routine `margin_alert` (hebdo, **éteinte par défaut**)         |
| **FIN-11** | prolongation sans revalorisation de TJM → signaler · N1 · —                                      | ABSENT                              | —           | —                                                                                                                     | **aucun** — `prepare_extension` est une proposition décochée (`board-move.ts:190`)                 |
| **FIN-12** | facture marquée payée → clore le suivi, MAJ du DSO · **N4** · —                                  | **LIVRÉ**                           | N4          | le DSO dit combien d'observations lui manquent, jamais un chiffre sur trois factures                                  | geste `recordPayment` (`invoice-readiness.service.ts:290`) ; DSO dérivé (`revenue.service.ts:288`) |

**Le compte, et il ne se résume pas à un chiffre** : **12 LIVRÉES**, **2 livrées à un niveau
volontairement ABAISSÉ** (`FIN-02`/`FIN-03`, N5 refusé par doctrine — D171), **5 PARTIELLES**,
**5 ABSENTES**. Le tracker du 20/08 disait « 2 sur 24 » ; il avait raison le 20/08.

**Ce qu'il ne faut PAS recoder** — trous PÉRIMÉS, tranchés autrement depuis :

- `MIS-05` : le créneau J+30 est posé au DÉMARRAGE et non par un cron J+30. C'est mieux : le
  rendez-vous existe dans l'agenda le jour où la mission commence, pas trente jours plus tard.
- `MIS-09` : « collecte REX » ne s'exécute pas et ne DOIT pas s'exécuter — fabriquer un retour
  d'expérience produirait la phrase que ce dépôt s'interdit.
- `FIN-02`/`FIN-03` : le `N5` de la source est un REFUS doctrinal, pas un trou (D171).
- `FIN-06` : « jamais d'émission » n'est pas une phrase, c'est l'absence de code — et une garde de
  langage la tient.
