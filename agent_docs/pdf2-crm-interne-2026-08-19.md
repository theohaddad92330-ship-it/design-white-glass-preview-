# PDF 2/9 — CRM interne complet — 19 août 2026

Source : `agent_docs/sources/pdf-2-crm-interne-2026-08-19.pdf` (18 pages, lues
intégralement le 19/08/2026). Auteur ORION. Prérequis déclaré : PDF 1
(`agent_docs/pdf1-architecture-globale-2026-08-19.md`).

Ce document ne redit rien du PDF 1. Il détaille les objets commerciaux, leurs
écrans, leurs boutons et leurs déplacements : compte / entité / site, contact,
influence, couverture, signal, projet, besoin, opportunité, pipeline, relances,
séquences, points de génération de message, capitalisation, kanban et drag & drop.

## 0. Ce qu'il faut savoir avant de le lire

Le PDF 1 avait mis **hors périmètre** exactement ce que celui-ci spécifie : les
domaines Capitalisation (REX / preuves) et Partenaire, `effectsForMove`, et les
21 routes nouvelles — « les construire depuis le seul PDF 1 reviendrait à
inventer les écrans que les PDF suivants doivent spécifier ». PDF 2 fournit ces
écrans pour six d'entre elles.

Comme son frère, ses marqueurs `[Confirmé — repo]` demandent vérification : il
annonce `saved_views` sans contenu par défaut (vrai), mais aussi des choses que
le chantier CRM/ATS T0→T11 du 17/08 a déjà tranchées autrement.

---

## 1. Inventaire

Statuts : `LIVRÉ` (preuve `fichier:ligne`) · `PARTIEL` · `ABSENT` · `PÉRIMÉ`
(contredit par une décision postérieure) · `REFUS` (contredit une règle
permanente) · `DÉCISION`.

### §1 — Périmètre et personas (p. 1)

| #   | p.  | Exigence                                                                                          | Statut  | Preuve / raison                                                                                                                |
| --- | --- | ------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 1   | Personas P2 Business Manager (principal), P1 Dirigeant, P4 Manager, P3 Recruteur                  | PARTIEL | `workspace.ts:32-52` — 9 rôles dont `recruiter` et `finance` livrés le 19/08 ; pas de persona « dirigeant » distinct d'`owner` |
| 2   | 1   | Problèmes résolus : saisie 8-12 h/sem, relances oubliées, plan jamais rafraîchi, besoins enterrés | —       | énoncé, pas une exigence                                                                                                       |

### §2 — Granularité Compte / Entité / Site (p. 2)

| #   | p.  | Exigence                                                                                   | Statut | Preuve / raison                                                                                                                                                                                                                                                                           |
| --- | --- | ------------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3   | 2   | « Les trois existent (`account`, `account_entity`, `site`) » `[Confirmé — repo]`           | ABSENT | **le marqueur est faux.** `accounts` existe ; `account_entity` n'existe pas ; `site` n'est pas une table — l'onglet Sites pagine `raw_analysis.branches` (`accounts.controller.ts:327`). `legal_entities` (`legal-entity.entity.ts:13`) est la société **de l'ESN**, pas une BU du client |
| 4   | 2   | R1 — un contact appartient à une ENTITÉ ; sans entité connue → « périmètre non déterminé » | ABSENT | `contact.entity.ts:45` : `entity: string \| null`, texte libre sans FK ; 0 occurrence de « périmètre non déterminé »                                                                                                                                                                      |
| 5   | 2   | R2 — un projet appartient à une entité                                                     | ABSENT | `project.entity.ts` : `account_id` seul, aucune colonne `entity_id`                                                                                                                                                                                                                       |
| 6   | 2   | R3 — une mission porte un SITE                                                             | ABSENT | `mission.entity.ts:44` porte `legal_entity_id` (société de l'ESN), aucun `site_id`                                                                                                                                                                                                        |
| 7   | 2   | R4 — le score et le plan vivent au niveau COMPTE                                           | LIVRÉ  | `account.entity.ts:98` (`priority_score`), `action-plan.entity.ts:10` (`account_id`)                                                                                                                                                                                                      |
| 8   | 2   | R5 — « rang 1 en place » est une propriété de l'ENTITÉ                                     | ABSENT | seule occurrence de rang1/rang2 : `sales-context.ts:75`, qui décrit la position de **l'ESN** dans la sous-traitance, pas une propriété du client                                                                                                                                          |
| 9   | 2   | « Ce qui casse si on aplatit » : BU accessible/non, matching mobilité faux                 | —      | argumentaire — voir décision D-A                                                                                                                                                                                                                                                          |

### §3 — Écran Portefeuille `/accounts` (p. 2-3)

| #     | p.  | Exigence                                                                                         | Statut  | Preuve / raison                                                                                                                                                      |
| ----- | --- | ------------------------------------------------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10    | 2   | Titre « Comptes », phrase de portefeuille, CTA « Nouvelle analyse » + Importer / Vues / Exporter | PARTIEL | titre `AccountsPage.tsx:137` ; la phrase n'existe pas ; le seul CTA est « Lancer ma première analyse » dans l'état vide ; la barre d'outils n'a que recherche+filtre |
| 11-25 | 3   | Les 15 colonnes de la liste                                                                      | PARTIEL | 5 colonnes réelles (`AccountsTableHeaderRow.tsx:19-38`) : Société, Score (cercle **/10**), Dernière analyse, Signal principal, lien Ouvrir. Manquent 12 des 15       |
| 26    | 3   | Score /25 avec micro-barre par axe au survol                                                     | PARTIEL | le /25 existe côté évaluation (`ScoreSummaryCard.tsx:19`) ; la liste affiche un cercle /10 (`ScoreCircle.tsx`)                                                       |
| 27    | 3   | Cellule vide = « – » gris + tooltip « jamais renseigné », jamais 0, jamais une date estimée      | PARTIEL | `-`/`—` affichés (`AccountTableRow.tsx:161-173`) sans tooltip ; 0 occurrence de « jamais renseigné »                                                                 |
| 28    | 3   | Les 13 filtres                                                                                   | PARTIEL | 3 sur 13 (`account.ts:236-245` : status, sector, score) ; manquent propriétaire, porte, zone, effectif, signal < 30 j, sans prochaine action, dormant > 90 j…        |
| 29    | 3   | Mécanisme `saved_views` pour le scope `accounts`                                                 | LIVRÉ   | `saved-view.entity.ts:9-35`, scope `accounts` dans `governance.ts:23`, endpoint `governance.controller.ts:55`                                                        |
| 30    | 3   | …mais **aucune UI** ne le consomme                                                               | ABSENT  | 0 occurrence de `governance/views` dans `apps/web/src` ; `GovernancePanel.tsx` ne gère que champs perso + doublons                                                   |
| 31    | 3   | Les 5 vues sauvegardées PAR DÉFAUT                                                               | ABSENT  | aucune seed, aucune migration                                                                                                                                        |
| 32    | 3   | 6 actions de masse (assigner, liste, veille, écarter avec motif, tâche, exporter)                | ABSENT  | `SelectionBar.tsx` n'offre que « Comparer » ; aucune route bulk sur `accounts.controller.ts`                                                                         |
| 33    | 3   | Garde : > 50 comptes sélectionnés → niveau N3 (validation manager)                               | ABSENT  | le mécanisme N1→N5 existe (`approval-policy.ts:120`, `canDecide`) mais n'est pas branché sur une action de masse compte                                              |
| 34    | 3   | Les 4 états de l'écran (empty_never, empty_true, loading, error)                                 | PARTIEL | 3 sur 4 ; **`error` n'est jamais rendu** — `useAccounts` expose `isError`, `AccountsPage.tsx:28-33` ne le déstructure pas                                            |

### §4 — Dossier de compte `/accounts/$id` (p. 2-4)

| #     | p.  | Exigence                                                                                       | Statut   | Preuve / raison                                                                                                                                                     |
| ----- | --- | ---------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 35    | 2   | En-tête : score /25, badge de fraîcheur, propriétaire, porte, phrase, CTA                      | PARTIEL  | `AccountDetailHero.tsx:34-146` porte nom, statut d'analyse, secteur, SIREN, Actualiser/Exporter/Partager ; ni score, ni fraîcheur, ni owner, ni porte               |
| 36-46 | 3   | Les 9 premiers onglets `[Confirmé — repo]`                                                     | LIVRÉ    | `AccountDetailTabsBar.tsx:4-17` — overview, contacts, organigramme, coverage, sites, veille, plan, evaluation, history                                              |
| 47    | 3   | Onglet 10 **Projets** — à créer                                                                | ABSENT   | aucun onglet Projets dans `account-detail/tabs/`                                                                                                                    |
| 48    | 3   | Onglet 11 **Missions** — à créer                                                               | ABSENT   | idem                                                                                                                                                                |
| 49    | 3   | Onglet 12 **Preuves & REX** — à créer                                                          | ABSENT   | domaine entier absent : `flow-registry.ts:182-195` (« ni table `rex`, ni `proof`, ni `testimonial` »)                                                               |
| 50    | 3   | D11 — 13ᵉ onglet **Partenaires** (rang 2)                                                      | DÉCISION | aucune table `partner` ; le seul « rang2 » est un état de relation par contact (`cadence-templates.ts:84`)                                                          |
| 51    | 3   | Onglet Plan : « versions à créer »                                                             | ABSENT   | `accounts.service.ts:1279-1286` — `applyPlan` ÉCRASE `raw_analysis.plan`, aucune version conservée                                                                  |
| 52    | 3   | Onglet Projets : bandeau d'entonnoir, signaux jamais comptés dans l'entonnoir                  | ABSENT   | l'entonnoir existe sur `/projects` (`PipelineBoard.tsx:56-81`), pas dans le dossier                                                                                 |
| 53    | 3   | Onglet Projets : 9 colonnes + 4 actions par ligne                                              | ABSENT   | —                                                                                                                                                                   |
| 54    | 3   | Onglet Preuves & REX : 3 blocs + état vide                                                     | ABSENT   | —                                                                                                                                                                   |
| 55    | 3-4 | B1 « Analyser ce compte » — modal de périmètre, coût exact, 8 crédits                          | PARTIEL  | `ScopeConfirmPanel.tsx:16-157` montre objet, périmètre et coût estimé ; la valeur fixe « 8 crédits » et le tooltip du PDF n'existent pas                            |
| 56    | 4   | B1 — écran de désambiguïsation homonymes AVANT débit                                           | PARTIEL  | la résolution SIREN existe côté recherche ; pas d'écran dédié nommé                                                                                                 |
| 57    | 4   | B1 — dossier livré en `partial` quand une source de veille est en panne                        | ABSENT   | `account.status` ne connaît pas `partial`                                                                                                                           |
| 58    | 4   | B2 « Prioriser ce compte » = porte G1, popover à 3 choix                                       | ABSENT   | la porte `account_priority` est **déclarée** (`decision-gate.ts:29`) et **jamais franchie** — zéro appelant ; l'écran offre un statut sans motif                    |
| 59    | 4   | Colonnes `account.priority_gate` (pending/prioritised/parked) + `gate_reason`                  | ABSENT   | 0 occurrence                                                                                                                                                        |
| 60    | 4   | Motif OBLIGATOIRE à l'écartement + catalogue de 7 motifs (« autre » à texte libre OBLIGATOIRE) | ABSENT   | `useArchiveAccount.ts:7-23` archive sans motif                                                                                                                      |
| 61    | 4   | Un compte écarté disparaît de Découvrir avec « écarté le {date} — {motif} »                    | ABSENT   | —                                                                                                                                                                   |
| 62    | 4   | `parked → prioritised` interdit sans repasser par `pending`                                    | ABSENT   | —                                                                                                                                                                   |
| 63    | 4   | B3 « Rafraîchir le plan » — n'apparaît que s'il existe des signaux postérieurs                 | PARTIEL  | `ReplanNudge.tsx:18-53` existe mais son déclencheur est un ÉVÉNEMENT CONTACT (`contacts.service.ts:1609-1628`), pas la date du plan                                 |
| 64    | 4   | B3 — drawer « Ce qui a changé », coût 1 à 4 crédits, ancienne version gardée                   | ABSENT   | le replan est explicitement **gratuit** (`ReplanDialog.tsx:34-39`) et n'archive rien (item 51)                                                                      |
| 65    | 4   | B4 « Exporter le dossier » — PDF / Word / lien expirant, date figée en pied                    | PARTIEL  | PDF `AccountPdfDocument.tsx:388-389` (date en pied), lien expirant `account-share.entity.ts:37`, Word `documents.controller.ts:35` — mais le Word n'est pas sous B4 |
| 66    | 4   | B5 « Demander au copilote » depuis le dossier + 4 suggestions                                  | PARTIEL  | le lien compte→copilote n'existe que depuis la LISTE (`AccountTableRow.tsx:78`) ; les 4 suggestions exactes n'existent pas                                          |

### §5 — Contacts (p. 4-5)

| #   | p.  | Exigence                                                                         | Statut  | Preuve / raison                                                                                                                                                                                                                                                                 |
| --- | --- | -------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 67  | 4   | Les 11 colonnes de la liste contacts                                             | PARTIEL | `ContactTableRow.tsx:111-353` — manquent ENTITÉ (seule « Entreprise »), Consentement, Dernière interaction (un booléen « déjà contacté »), et la Source affichée est le fournisseur, pas INTERNE/PUBLIC/HYPOTHÈSE/RISQUE                                                        |
| 68  | 4   | Badge RISQUE = employeur détecté ≠ compte `[Confirmé — repo]`                    | PARTIEL | **le calcul existe, le badge n'existe pas.** `contact-score.ts:47-75` (`isObsoleteContact`, `contactSourceTag` → `'RISQUE'`) ; seul consommateur : le back-office (`internal-telemetry.controller.ts:11-13`). 0 occurrence de `sourceTag` dans `apps/web/src/features/contacts` |
| 69  | 4   | RISQUE affiché en rouge avec la DATE DE DÉTECTION                                | ABSENT  | aucun champ de date de détection sur `contact.entity.ts`                                                                                                                                                                                                                        |
| 70  | 4   | Un contact RISQUE ne part JAMAIS en séquence sans confirmation explicite         | ABSENT  | `outreach.service.ts:80-84` ne lit ni `lifecycle_state` ni `employerMismatch`                                                                                                                                                                                                   |
| 71  | 4   | Proposer de chercher le SUCCESSEUR sur le même poste                             | ABSENT  | 0 occurrence de « successeur »                                                                                                                                                                                                                                                  |
| 72  | 5   | L'ancien contact n'est pas supprimé : il devient une entrée du réseau            | PARTIEL | l'état `historique` existe (`classified-data.ts:638`) mais est **inatteignable** — aucun chemin applicatif ne pose `employerMismatch`/`rejected`                                                                                                                                |
| 73  | 5   | Funnel de couverture rendant lisibles la COUVERTURE **et le COÛT**               | PARTIEL | `ContactsFunnelBand.tsx` + `contactFunnel.ts:1-51` couvrent la couverture ; aucune dimension coût (les clés i18n `bulk.enrichCost`/`bulk.nothingBillable` sont **mortes**, 0 usage)                                                                                             |
| 74  | 5   | B6 « Enrichir » — nombre de contacts et coût maximum montrés avant le clic       | LIVRÉ   | `EnrichConfirmDialog` via `ContactTableRow.tsx:339-351` et `ContactContent.tsx:266-298`                                                                                                                                                                                         |
| 75  | 5   | Cascade multi-fournisseurs jamais nommés au client `[Confirmé — repo]`           | LIVRÉ   | `contacts.json:455` « via nos sources d'enrichissement » ; garde `no-vendor-names.test.ts`                                                                                                                                                                                      |
| 76  | 5   | B6 — message agrégé « 6 trouvés, 4 sans résultat, 6 crédits débités »            | ABSENT  | un toast par contact (`useEnrichContact.ts:103-136`) ; la boucle de masse **avale les erreurs** (`ContactContent.tsx:276-279`)                                                                                                                                                  |
| 77  | 5   | B6 — un contact en liste de suppression est ignoré ET mentionné                  | ABSENT  | la suppression list est vérifiée à l'ENVOI (`contacts.service.ts:1795`), jamais à l'enrichissement                                                                                                                                                                              |
| 78  | 5   | B6 — écrit `field_provenance`                                                    | PARTIEL | écrit par le pipeline (`contacts.service.ts:2275`), **pas** par l'enrichissement à la demande                                                                                                                                                                                   |
| 79  | 5   | Crédit débité seulement si trouvé, remboursé sinon `[Confirmé — repo]`           | LIVRÉ   | `contacts.service.ts:1348` (`matched`) puis `:1458-1470` ; dialogue `EnrichConfirmDialog.tsx:65`                                                                                                                                                                                |
| 80  | 5   | Cycle de vie à 7 états + transition journalisée avec sa source                   | LIVRÉ   | `classified-data.ts:632-640` (7 états), `contact-lifecycle-transition.entity.ts:15-38` (`from_state`, `to_state`, `source`, `occurred_at`, `actor`)                                                                                                                             |
| 81  | 5   | …avec le vocabulaire exact du PDF (`contactable`, `engaged`, `replied`)          | PÉRIMÉ  | `engaged`/`replied` vivent sur un AUTRE axe, déjà livré : `contactStatusSchema` (`contact.ts:27`). Renommer un enum est le 1ᵉʳ interdit du §2.3 du PDF 1                                                                                                                        |
| 82  | 5   | Retour arrière autorisé AVEC MOTIF                                               | ABSENT  | aucun champ motif sur `contact-lifecycle-transition.entity.ts`                                                                                                                                                                                                                  |
| 83  | 5   | `excluded` atteignable partout, levable par un humain uniquement                 | ABSENT  | l'équivalent `rejete` dépend d'un drapeau `rejected` jamais posé — état mort                                                                                                                                                                                                    |
| 84  | 5   | Organigramme : chaque arête porte type, source, statut de vérité                 | LIVRÉ   | `org-graph.ts:169-178` (`type`, `sourceIds`, `confidence`, `verified`)                                                                                                                                                                                                          |
| 85  | 5   | Inféré jamais présenté comme vérité, badge « déduit », explication au clic       | LIVRÉ   | `accountOrg.json:181`, `OrgGraphViews.tsx:217-249`, plafond de confiance `orgGraphData.ts:70-77`, preuves `OrgSourceChips.tsx`                                                                                                                                                  |
| 86  | 5   | …et l'utilisateur peut confirmer d'un geste, ce qui bascule l'arête en `human`   | ABSENT  | « Vérifier ce lien » relance une recherche de preuve PUBLIQUE (`org-graph-verify.ts:26-59`) ; aucune valeur `human` sur le schéma d'arête                                                                                                                                       |
| 87  | 5   | Chemin recommandé : point d'entrée, POURQUOI, quelle relation existante l'appuie | PARTIEL | point d'entrée + pourquoi : `OrgGraphViews.tsx:412-457` ; la relation existante qui l'appuie n'existe pas (`unlocks` est prospectif)                                                                                                                                            |
| 88  | 4   | Priorité contact /100                                                            | LIVRÉ   | `classified-data.ts:320-399` (6 critères), `agent_docs/kb/contact-priority-score-100.md`                                                                                                                                                                                        |

### §6 — Signaux et veille (p. 5-6)

| #     | p.  | Exigence                                                                                | Statut  | Preuve / raison                                                                                                                                                                                     |
| ----- | --- | --------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 89    | 5   | Un signal est un fait DATÉ et SOURCÉ, jamais une interprétation                         | PARTIEL | `signal-history.entity.ts:34,37` portent `signal_date` et `source`, **tous deux nullables** (`1787952416309-SignalHistory.ts:41-42`)                                                                |
| 90-96 | 5   | Les 7 types et leur fenêtre de fraîcheur utile (60/deadline/180/90/180/365/permanente)  | ABSENT  | une seule fenêtre transverse existe, 24 mois (`signal_freshness.py:28-58`, `account.ts:502-523`) ; les collecteurs ont leurs propres bornes (365 j France Travail/APEC, 548 j BOAMP, aucune BODACC) |
| 97    | 5   | Le decay : au-delà du seuil, `périmé` — consultable, ne déclenche plus rien, hors score | PARTIEL | binaire `current`/`archive` à 24 mois, exclu du compteur (`accounts.service.ts:270`) et des digests ; pas de troisième état, pas de seuil par type                                                  |
| 98    | 5   | On ne SUPPRIME jamais un signal, on le date                                             | LIVRÉ   | `signal-history.service.ts:119-131` (`resolved_at`, jamais de `DELETE`)                                                                                                                             |
| 99    | 6   | Écran Veille `/watchlist` — 9 colonnes                                                  | PARTIEL | 5 colonnes (`WatchlistTable.tsx:64-68`) ; Type au survol seulement, Source non cliquable, ni Confiance ni « Projet créé ? »                                                                         |
| 100   | 6   | Filtres : type, période, compte, avec/sans projet créé, fraîcheur                       | ABSENT  | les filtres réels sont d'un autre axe (`watchlist.ts:165-166`)                                                                                                                                      |
| 101   | 6   | Actions : Créer un projet · Écarter le signal avec motif · Rafraîchir le plan           | ABSENT  | actions réelles : « En faire une action », « Ouvrir le dossier », « Me prévenir » (`WatchlistDetailPanel.tsx:226-251`)                                                                              |

### §7 — Besoins et opportunités (p. 6-8)

| #       | p.  | Exigence                                                                                                       | Statut   | Preuve / raison                                                                                                                                                                                                                     |
| ------- | --- | -------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 102     | 6   | Projet = `opportunities`, Besoin = `project_needs` `[Confirmé — repo]`                                         | LIVRÉ    | `1789344812907-ProjectPivot.ts:106-121` ; 24 colonnes sur `opportunities`, 16 sur `project_needs`                                                                                                                                   |
| 103     | 6   | 1 projet → 0..n besoins ; 1 besoin → 1 projet                                                                  | LIVRÉ    | `project_id uuid NOT NULL REFERENCES opportunities(id)` (`ProjectPivot.ts:109`), borne 50 (`project-pipeline.service.ts:24`)                                                                                                        |
| 104     | 6   | Le montant vit sur le PROJET, jamais sur le besoin                                                             | LIVRÉ    | `project.entity.ts:57-58` vs `project-need.entity.ts:44` (`target_tjm_cents` seul)                                                                                                                                                  |
| 105     | 6   | Le projet porte 9 étapes, le besoin 4 statuts                                                                  | LIVRÉ    | `project.ts:52-62` et `project.ts:396-398`                                                                                                                                                                                          |
| 106-116 | 6   | Les 11 sources de création d'un besoin                                                                         | ABSENT   | aucune colonne `source` sur `project_needs` ; la seule création est manuelle (`project-pipeline.service.ts:152-175`)                                                                                                                |
| 117     | 6   | D12 — LinkedIn comme source : **refus**, alternative « créer depuis un texte collé »                           | PÉRIMÉ   | déjà tranché et documenté : le scraping est un refus permanent du dépôt (`CLAUDE.md`, § « Réseau professionnel sans scraping »). La reco du PDF est celle du produit                                                                |
| 118     | 6   | Provenance `human / pipeline / model / connector` sur un besoin                                                | ABSENT   | l'enum existe (`provenance.ts:31`) mais `project_need` n'est pas un type d'entité couvert (`provenance.ts:64`)                                                                                                                      |
| 119     | 6   | Un besoin créé par un pipeline ou un modèle arrive TOUJOURS « à qualifier »                                    | ABSENT   | statut par défaut `open` ; aucun code ne distingue une création humaine d'une création automatique                                                                                                                                  |
| 120     | 6-7 | Les ~28 champs d'un besoin (§7.3)                                                                              | PARTIEL  | 8 présents sur 28 (`project-need.entity.ts:16-73`). Manquent notamment `source`, `urgency`, `contact_id`, `owner_id`, `budget_cents`, `min_tjm_cents`, `expertise`, `context`, `stack[]`, `constraints`, `detected_at`, `staffable` |
| 121     | 7   | Interdits : deviner un budget, estimer un TJM de marché, inférer une séniorité, marquer `required` sans preuve | ABSENT   | sans objet aujourd'hui — aucun pipeline n'écrit dans `project_needs`, tout est saisi à la main                                                                                                                                      |
| 122     | 7-8 | §7.4 — 11 phases de travail DÉRIVÉES, `status` inchangé à 4 valeurs                                            | ABSENT   | 0 occurrence de `work_phase`, `deriveWorkPhase`, `isPhaseValidForStatus`                                                                                                                                                            |
| 123     | 8   | D13 — 11 statuts en base **ou** phase dérivée ? Reco du PDF : phase dérivée                                    | DÉCISION | le dépôt a déjà ce grain ailleurs : `deriveOutreachDisplayStatus` (`outreach-sequence.ts:84-124`) dérive 10 statuts d'affichage sur 4 en base                                                                                       |
| 124     | 8   | §7.5 — écran `/projects/needs`, 16 colonnes, filtres, 4 actions par ligne                                      | ABSENT   | aucune route ; `/needs` redirige vers `/projects` (`routes/needs/index.tsx:12-15`) ; les besoins ne se voient que dans le drawer d'un projet (`ProjectNeedsPanel.tsx`)                                                              |
| 125     | 8   | Compteur de shortlist par besoin                                                                               | ABSENT   | `listNeeds` ne joint jamais `submissions` (`project-pipeline.service.ts:146-150`)                                                                                                                                                   |
| 126     | 8   | §7.6 — porte G3 « Besoin staffable ? », 3 issues                                                               | PARTIEL  | la porte est **déclarée** (`decision-gate.ts:32-33`, `1789512847391-DecisionGates.ts:56`) et **jamais franchie** — zéro appelant                                                                                                    |
| 127     | 8   | Catalogue de 7 motifs de non-staffabilité                                                                      | ABSENT   | —                                                                                                                                                                                                                                   |
| 128     | 8   | KPI « taux de besoins refusés PAR CAUSE »                                                                      | ABSENT   | —                                                                                                                                                                                                                                   |
| 129     | 8   | §7.7 — score de chance de closing 0-100, 6 axes pondérés                                                       | REFUS    | arbitrage n°4 du 16/08 (`crm-ats-plan.md:16`) : « aucune probabilité, aucun forecast pondéré », réaffirmé `project.ts:528`. Déjà refusé une fois comme D10 du PDF 1 (`pdf1-…-2026-08-19.md:265`)                                    |
| 130     | 18  | D14 — « le score de closing est-il visible du commercial ? oui, avec ses axes »                                | PÉRIMÉ   | même arbitrage. Ce qui EST exposé est un score d'**engagement**, décomposé, `null` quand rien n'est lisible (`crm-pipeline.ts:67-85`)                                                                                               |

### §8 — Pipeline `/projects` (p. 9-10)

| #   | p.   | Exigence                                                                  | Statut  | Preuve / raison                                                                                                                                                                               |
| --- | ---- | ------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 131 | 9    | Deux vues : Kanban 5 étapes / Liste 9 étapes                              | PARTIEL | deux « lentilles » existent (`ProjectsPage.tsx:28`) : le kanban à 5 colonnes (`PipelineBoard.tsx:83-142`) et une liste de COMPTES, pas les 9 étapes du pipe                                   |
| 132 | 9    | En-tête de colonne « Qualifié · 7 projets · 84 000 € · 3 sans montant »   | PARTIEL | les 4 informations existent (`PipelineBoard.tsx:91-105`), pas sur une ligne unique                                                                                                            |
| 133 | 9    | Un projet sans montant n'entre dans AUCUNE somme, compté à part           | LIVRÉ   | `project.ts:549-565` (`pipelineSummary`, `without_amount`)                                                                                                                                    |
| 134 | 9    | Bandeau d'entonnoir + clic « détectés » → liste filtrée Qualifier/Écarter | PARTIEL | le bandeau existe (`PipelineBoard.tsx:56-81`) ; le clic bascule de lentille, pas vers une liste de projets `detected` ; aucun bouton Qualifier/Écarter                                        |
| 135 | 9    | Carte de projet à 5 lignes, 1 alerte maximum                              | PARTIEL | 3 lignes (`PipelineBoard.tsx:113-137`) ; ni complétude BTMMP+besoins, ni alerte d'immobilité                                                                                                  |
| 136 | 9    | §8.5 — tableau complet des effets du dépôt (7 destinations)               | PARTIEL | les effets MÉCANIQUES existent (`stageTransitionEffects`, `project.ts:582-594`) et le motif de perte est obligatoire (`project.ts:220-229`) ; **aucune** proposition, **aucune** vérification |
| 137 | 9    | Le geste lui-même est un glisser-déposer                                  | ABSENT  | aucune bibliothèque de drag & drop dans `apps/web` ; l'étape change par un menu (`ProjectStageControl.tsx:72-92`) — voir décision D-D                                                         |
| 138 | 9    | Retour arrière depuis `won` : efface `closed_at`/`outcome`, journalise    | LIVRÉ   | `project.ts:591-593` + `projects.service.ts:250-260` (`traceStageChange`) + porte G8 (`projects.controller.ts:311-315`)                                                                       |
| 139 | 9    | …et **signale si une mission a déjà été créée**                           | ABSENT  | `mission.entity.ts:40` porte `opportunity_id`, jamais consulté à la transition                                                                                                                |
| 140 | 9    | Drawer projet à 9 onglets                                                 | PARTIEL | pas d'onglets, des sections défilantes (`ProjectDetailSheet.tsx:46-107`) : Besoins, BTMMP, Positionnements, Historique présents ; Contacts, Similaires, Preuves absents du drawer             |
| 141 | 9-10 | Panneau BTMMP — 6 axes libres, complétude x/6, « qualifié » = 6/6         | LIVRÉ   | `project.ts:126-134`, `:321-335` (`btmmpCompleteness`), `BtmmpPanel.tsx:26-77`                                                                                                                |
| 142 | 10   | Bouton « Générer les questions manquantes » (axes vides uniquement)       | ABSENT  | 0 occurrence                                                                                                                                                                                  |
| 143 | 10   | §8.7 — Kanban Besoins, 11 colonnes (`work_phase`) + propositions          | ABSENT  | dépend de l'item 122. Le board Missions à 12 colonnes (`mission-board.ts:31-43`) est un objet voisin mais différent : projection en LECTURE sur projets+missions, sans UI web                 |

### §9 — Tâches, notes, timeline (p. 10)

| #   | p.  | Exigence                                                             | Statut  | Preuve / raison                                                                                                                                                          |
| --- | --- | -------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 144 | 10  | Tâches : libellé, échéance, propriétaire, objet lié, source, statut  | PARTIEL | `task.ts:46-67` ; l'objet lié s'arrête à compte/contact/projet (`1789368204517-Tasks.ts:26-45`) — ni besoin, ni mission, ni positionnement — et **aucun champ `source`** |
| 145 | 10  | Les tâches en retard sont comptées À PART                            | LIVRÉ   | `task.ts:134-221` (`overdueCount` distinct de `todayCount`), `TaskList.tsx:44-56`                                                                                        |
| 146 | 10  | Notes polymorphes, provenance `human`, jamais réécrites par un agent | LIVRÉ   | `note.ts:1-48`, `notes.service.ts:33-60`, aucune route agent (`crm-core.controller.ts:127-159`)                                                                          |
| 147 | 10  | Bouton « Structurer » sur une note, champs validés un par un         | ABSENT  | le « Structurer » existant porte sur les comptes rendus de rendez-vous (`meeting-notes.service.ts:138-188`), pas sur une note enregistrée, et pousse ses tâches en lot   |
| 148 | 10  | Timeline unifiée sur compte, contact, projet **et besoin**           | PARTIEL | trois scopes livrés (`activity.ts:211-213`) ; pas de scope besoin ; ni `submission` ni `signal` dans `ACTIVITY_KINDS`                                                    |
| 149 | 10  | Chaque entrée : canal, auteur, date, **badge** de provenance, lien   | PARTIEL | `TimelinePanel.tsx:250-280` — la provenance est un texte, pas un badge                                                                                                   |
| 150 | 10  | Le corps est stocké mais le copilote ne le restitue jamais           | LIVRÉ   | arbitrage n°9 (`crm-ats-plan.md:24`), garde `test_chat_mailbox_tools.py:8-10`                                                                                            |
| 151 | 10  | La timeline affiche l'objet et un résumé, pas le contenu intégral    | PARTIEL | extrait à 220 caractères (`timeline.ts:100-108`) mais « développer » révèle le corps entier dans la ligne (`TimelinePanel.tsx:236-239`)                                  |

### §10 — Relances et séquences (p. 10-12)

| #       | p.    | Exigence                                                                                 | Statut  | Preuve / raison                                                                                                                                                                                                                                                  |
| ------- | ----- | ---------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 152     | 10    | Relance ≠ séquence — portée, déclencheur, nombre, niveau, arrêt                          | PARTIEL | deux systèmes distincts existent : playbooks (`playbook.ts:27-59`, 1 relance max par cible) et outreach (`outreach-sequence.ts`, 3-4 touches) ; une séquence porte UN contact (`1785830000000-OutreachSequences.ts:25`, `contact_id NOT NULL`), jamais une liste |
| 153     | 10    | D3 — la cadence 3 touches vit en séquence validée, jamais en playbook autonome           | PÉRIMÉ  | tranché : la cadence découle du scénario relationnel (`contact-cadence.ts:42-62`) et `PLAYBOOK_MAX_PER_TARGET = 1`                                                                                                                                               |
| 154     | 11    | Écran `/actions/sequences` — le module existe côté API, sans écran                       | ABSENT  | endpoints `outreach.controller.ts:23-73` ; les séquences ne s'affichent que dans une carte de fiche contact (`ContactOutreachCard.tsx`)                                                                                                                          |
| 155-162 | 11    | Les 8 statuts tous DÉRIVÉS, jamais saisis                                                | LIVRÉ   | **et plus fin que demandé** : `deriveOutreachDisplayStatus` (`outreach-sequence.ts:84-124`) rend 10 valeurs, dont `ready_to_copy` que le PDF n'a pas                                                                                                             |
| 163     | 11    | « Une séquence « active » sans connecteur d'envoi est un mensonge produit »              | LIVRÉ   | c'est exactement la raison écrite dans `outreach-sequence.ts:28-40` ; `active` n'est **jamais** affiché                                                                                                                                                          |
| 164     | 11    | Les 9 colonnes de l'écran Séquences                                                      | ABSENT  | —                                                                                                                                                                                                                                                                |
| 165     | 11    | Constructeur d'étapes : canal, J+n, condition d'entrée, d'arrêt, niveau, contenu         | PARTIEL | l'API accepte des étapes libres (`outreach-sequence.ts:269-280`, 12 max) ; le web fige un gabarit (`ContactOutreachCard.tsx:30`)                                                                                                                                 |
| 166     | 11    | 4 conditions d'arrêt imposées et NON désactivables                                       | PARTIEL | réponse et rendez-vous arrêtent la séquence (`contacts.service.ts:1634-1650`) ; **opt-out et bounce ne l'arrêtent pas** — l'envoi est bloqué, la séquence reste active avec ses étapes en attente                                                                |
| 167     | 11    | Un test de garde vérifie qu'aucune API ne permet de les retirer                          | ABSENT  | —                                                                                                                                                                                                                                                                |
| 168     | 11    | B7 — simulation obligatoire avant armement, rapport persisté                             | PARTIEL | la simulation existe pour les **playbooks** (`playbook.ts:157-205`, `playbooks.controller.ts:98`) ; elle n'est **pas persistée** et l'armement ne l'exige pas. Côté outreach, rien : une séquence ne s'« arme » pas, elle prépare                                |
| 169-175 | 11-12 | §10.6 — les 7 points de génération de message                                            | PARTIEL | un seul existe : la fiche contact (`ContactIcebreakers.tsx:41-52`) ; le copilote propose un brouillon (`prepare_mail_draft`)                                                                                                                                     |
| 176     | 12    | Règles communes : 3 variantes, preuve affichée, décochable, verdict à 3 valeurs          | ABSENT  | 0 occurrence                                                                                                                                                                                                                                                     |
| 177     | 12    | Sans signature : brouillon NON signé, mention visible, jamais de marque-place            | LIVRÉ   | `mailbox-backend.ts:119`, `mailbox.service.ts:429`, `1788800001-MailboxSignature.ts:10-16`                                                                                                                                                                       |
| 178     | 12    | Gmail/Outlook = brouillon réel ; Teams = message préparé ; sans capacité = tâche interne | PARTIEL | brouillons réels livrés (`google-mail.backend.ts:177-200`, `microsoft-mail.backend.ts:129-147`) ; Teams n'est pas un canal de message dans le dépôt ; pas de repli en tâche interne                                                                              |

### §11 — Qualité de données (p. 12)

| #   | p.  | Exigence                                                               | Statut  | Preuve / raison                                                                                                                                                               |
| --- | --- | ---------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 179 | 12  | `duplicate_pairs` alimentée depuis les contacts natifs, comptes exclus | LIVRÉ   | `1789411862049-Governance.ts:87-108`, `duplicates.sweeper.ts:29-35` (l'exclusion et sa raison sont écrites)                                                                   |
| 180 | 12  | …et c'est écrit **à l'utilisateur**                                    | ABSENT  | la raison n'existe qu'en commentaire de code ; l'écran n'en dit rien                                                                                                          |
| 181 | 12  | Écran : paire, raison, décision `merged`/`dismissed`                   | LIVRÉ   | `GovernancePanel.tsx:180-200`, `governance.controller.ts:113-125`                                                                                                             |
| 182 | 12  | …avec aperçu AVANT/APRÈS champ par champ                               | ABSENT  | seuls deux libellés et une raison textuelle sont affichés                                                                                                                     |
| 183 | 12  | Aucune fusion automatique ; une décision `dismissed` est mémorisée     | LIVRÉ   | `governance.service.ts:305-310`, index unique `Governance.ts:107`, lecture `decision = 'pending'` (`governance.service.ts:243`)                                               |
| 184 | 12  | Provenance visible AU SURVOL d'un champ critique                       | PARTIEL | `field-provenance.entity.ts:9-43` + `RecordHistory.tsx:51-80`, mais ouvert par un bouton « Historique », pas au survol ; ni statut « confirmé », ni « 3 valeurs précédentes » |
| 185 | 12  | Champs critiques : compte, contact, projet, besoin                     | PARTIEL | compte et contact suivis (`record-fields.ts:14-36`) ; **projet et besoin n'ont aucune provenance**                                                                            |
| 186 | 12  | §11.3 — écran `/settings/catalogues`, 8 catalogues, versionnement      | ABSENT  | aucune route ; motifs de perte et champs perso vivent dans l'onglet CRM de `/knowledge`                                                                                       |
| 187 | 12  | Motifs de perte de projet                                              | PARTIEL | table et CRUD (`loss-reason.entity.ts:16`, `projects.controller.ts:163-184`), **aucune UI d'administration**                                                                  |
| 188 | 12  | Libellés des 5 étapes du pipe                                          | PARTIEL | table et endpoint (`pipeline-stage-label.entity.ts:16`, `project-pipeline.service.ts:82-94`), **aucune UI**                                                                   |
| 189 | 12  | Motifs d'écartement de compte                                          | ABSENT  | —                                                                                                                                                                             |
| 190 | 12  | Motifs de non-staffabilité                                             | ABSENT  | —                                                                                                                                                                             |
| 191 | 12  | Motifs de fin de positionnement — « existe, à exposer »                | PARTIEL | liste fermée de 9 motifs en code (`submission.ts:85-95`), non exposée comme catalogue                                                                                         |
| 192 | 12  | Compétences normalisées                                                | PARTIEL | dictionnaire d'alias statique (`skill-referential.ts:32-75`) dont `skillReferential()` n'a **aucun appelant**                                                                 |
| 193 | 12  | Offres et wedge                                                        | ABSENT  | —                                                                                                                                                                             |
| 194 | 12  | Champs personnalisés, 10 max par entité                                | LIVRÉ   | `governance.ts:88`, `governance.service.ts:140-151`, `GovernancePanel.tsx:46-51`                                                                                              |
| 195 | 12  | Un motif utilisé ne peut pas être supprimé, seulement désactivé        | PARTIEL | tout est archivable, jamais supprimable (`project-pipeline.service.ts:138-142`) — mais la désactivation n'est conditionnée à aucun usage                                      |
| 196 | 12  | Chaque catalogue affiche le nombre d'usages par valeur                 | ABSENT  | aucun comptage                                                                                                                                                                |

### §12 — Capitalisation, vue compte (p. 12-13)

| #       | p.    | Exigence                                                                              | Statut | Preuve / raison                                                                                                                                         |
| ------- | ----- | ------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 197-200 | 12-13 | Les 4 blocs (missions livrées, preuves, REX en attente, témoignages)                  | ABSENT | domaine entier absent, et le dépôt le DIT : `flow-registry.ts:182-195`                                                                                  |
| 201     | 13    | Une preuve interne n'apparaît jamais dans un contenu client ; fonction pure et testée | ABSENT | `proofStrength`/`isProofUsable` sont nommées dans le PDF 1 comme restant à écrire, faute de consommateur (`pdf1-…:419`) — PDF 2 fournit ce consommateur |

### §13 — Les 12 automatisations CRM (p. 13)

Le dépôt a deux catalogues : `routine-catalog.ts` (23 routines qui NOTIFIENT, jamais
n'écrivent) et `workflow-catalog.ts` (5 workflows qui écrivent, sous approbation).
Aucun ne porte la notation N1/N2/N3 du PDF.

| #   | p.  | Automatisation                                 | Statut  | Preuve / raison                                                                                                                                                                              |
| --- | --- | ---------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 202 | 13  | CRM-01 RDV terminé → note + tâche J+2          | PARTIEL | routine `meeting_followup` (`routine-catalog.ts:246-263`) notifie ; le workflow `MEETING_FOLLOW_UP` écrit mais se déclenche AVANT le rendez-vous ; pas d'idempotence par `calendar_event_id` |
| 203 | 13  | CRM-02 réponse reçue → proposer le statut      | PARTIEL | routine `positive_replies` (`:85-101`) notifie sans proposer                                                                                                                                 |
| 204 | 13  | CRM-03 compte suivi sans prochaine action 30 j | PARTIEL | `intervention-rules.ts:196-208` + routine `crm_followups` (`:210-227`) — mais sur le CRM **externe**                                                                                         |
| 205 | 13  | CRM-04 projet immobile au-delà du SLA d'étape  | ABSENT  | aucun seuil par étape                                                                                                                                                                        |
| 206 | 13  | CRM-05 doublons hebdomadaires                  | LIVRÉ   | routine `crm_duplicates` (`:354-371`), jamais de fusion                                                                                                                                      |
| 207 | 13  | CRM-06 contact change de poste                 | ABSENT  | (le calcul RISQUE existe — item 68 — mais aucune automatisation ne s'y branche)                                                                                                              |
| 208 | 13  | CRM-07 projet `won` → proposer la mission      | ABSENT  | `stageTransitionEffects` ne déclenche rien                                                                                                                                                   |
| 209 | 13  | CRM-08 signal fiable → re-scorer               | PARTIEL | workflow `SIGNAL_TO_ACCOUNT_OPENING` (`workflow-catalog.ts:43-88`), un seul niveau                                                                                                           |
| 210 | 13  | CRM-09 plan de compte > 30 jours               | ABSENT  | —                                                                                                                                                                                            |
| 211 | 13  | CRM-10 besoin ouvert sans shortlist 5 j        | ABSENT  | dépend de l'item 125                                                                                                                                                                         |
| 212 | 13  | CRM-11 compte écarté + signal fort             | ABSENT  | dépend de la porte G1 (item 58)                                                                                                                                                              |
| 213 | 13  | CRM-12 fil sortant sans réponse 7 j            | PARTIEL | routine `no_reply_follow_up` (`:66-83`) notifie ; pas de brouillon avec angle nouveau                                                                                                        |

### §14 — Permissions (p. 13)

| #   | p.  | Ligne                                   | Statut  | Preuve / raison                                                                                          |
| --- | --- | --------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| 214 | 13  | Lire son portefeuille — `sales`         | LIVRÉ   | `portfolio-visibility.ts:53-61`, `accounts.controller.ts:92-101`                                         |
| 215 | 13  | Lire tout le portefeuille — selon D5    | LIVRÉ   | réglable par espace depuis le 19/08 (`portfolio-visibility.ts:25-36`)                                    |
| 216 | 13  | Créer / éditer un compte — `sales`      | ABSENT  | **défaut réel** : `accounts.controller.ts:343` (`@Post()`) ne déclare AUCUNE permission — voir X2        |
| 217 | 13  | Prioriser / écarter                     | ABSENT  | idem `:383` et `:393`, et la porte elle-même n'existe pas                                                |
| 218 | 13  | Réassigner un propriétaire — `manager`  | LIVRÉ   | `account-assignment.service.ts:41-63` (`team:manage`)                                                    |
| 219 | 13  | Créer un besoin — `sales`, `recruiter`  | LIVRÉ   | `projects.controller.ts:221` (`records:write`), tenu par `sales` et `recruiter` (`workspace.ts:134,156`) |
| 220 | 13  | Porte G3 — `recruiter`, `sales`         | ABSENT  | la porte n'a pas d'appelant                                                                              |
| 221 | 13  | Voir le montant d'un projet — `sales`   | LIVRÉ   | l'écriture est gardée (`projects.controller.ts:353`) ; la lecture suit l'appartenance à l'espace         |
| 222 | 13  | Voir le CA généré — `finance:read`      | ABSENT  | le champ « CA généré » n'existe pas sur un compte                                                        |
| 223 | 13  | Écrire dans le CRM externe + validation | PARTIEL | `projects.controller.ts:388` (`data:export`) ; pas de permission `crm:write_external` distincte          |
| 224 | 13  | Gérer les catalogues — `admin`          | PARTIEL | `governance.controller.ts:80,86` (`team:manage`, donc aussi `sales_ops`)                                 |
| 225 | 13  | Supprimer (soft delete) — `admin`       | ABSENT  | `accounts.service.ts:1048-1056` supprime sans vérifier de permission                                     |

### §15 — Les 15 cas limites (p. 13-14)

| #   | p.    | Cas                                                             | Statut  | Preuve / raison                                                                                              |
| --- | ----- | --------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| 226 | 13-14 | Deux entités du même groupe → fusion proposée                   | ABSENT  | les comptes sont explicitement hors du détecteur (`duplicates.sweeper.ts:29-35`)                             |
| 227 | 14    | Compte déjà dans le CRM connecté → badge, pas de doublon        | LIVRÉ   | `crm-presence.ts:29-38`                                                                                      |
| 228 | 14    | Holding sans salarié → orienter vers l'opérationnel             | PARTIEL | filtrage SCI/holding/GIE côté IA (`research.schema.json:93`)                                                 |
| 229 | 14    | Personne physique d'un registre → exclue avec un code           | LIVRÉ   | `account_qualification.py:50` (`NATURAL_PERSON`)                                                             |
| 230 | 14    | Contact sans entité → rattachement par domaine e-mail           | ABSENT  | dépend de l'item 4                                                                                           |
| 231 | 14    | Deux comptes, même domaine → fusion proposée                    | ABSENT  | exclusion volontaire et documentée                                                                           |
| 232 | 14    | Projet sans montant en négociation → autorisé, compté à part    | LIVRÉ   | `project.ts:500-575`                                                                                         |
| 233 | 14    | Retour arrière depuis `won` avec mission créée → bloqué         | ABSENT  | item 139                                                                                                     |
| 234 | 14    | Besoin à 0 compétence → matching grisé avec le motif            | ABSENT  | `consultant-matching.ts:349` n'a pas de garde sur la liste vide                                              |
| 235 | 14    | Besoin dupliqué → fusion proposée, deux sources gardées         | ABSENT  | —                                                                                                            |
| 236 | 14    | Deadline d'AO dépassée → `lost`, motif « hors délai »           | ABSENT  | `due_at` ne sert qu'au tri (`rfp.service.ts:61`)                                                             |
| 237 | 14    | CRM externe en limite de débit → file, `degraded`               | ABSENT  | —                                                                                                            |
| 238 | 14    | Enregistrement supprimé côté CRM → `sync_link` orphelin         | ABSENT  | `sync-link.entity.ts:12-37` n'a pas de colonne d'état                                                        |
| 239 | 14    | Import créant 300 doublons → montrés au dry-run                 | LIVRÉ   | reprise CRM simulée (T9, PR #958) et import CSV en deux temps (`contacts/csv-import.ts`)                     |
| 240 | 14    | Opt-out dans une action de masse → écarté ET listé avec sa date | PARTIEL | `playbooks.service.ts:167-210` écarte et nomme le motif ; `isSuppressed` ne rend qu'un booléen, sans la date |

### §16 — Les 13 KPI du domaine CRM (p. 14)

| #   | p.  | KPI                                             | Statut  | Preuve / raison                                                                        |
| --- | --- | ----------------------------------------------- | ------- | -------------------------------------------------------------------------------------- |
| 241 | 14  | Comptes ouverts / mois (passages `prioritised`) | ABSENT  | `manager.service.ts:820-848` compte les créations, pas les passages                    |
| 242 | 14  | Comptes sans prochaine action                   | PARTIEL | `manager.service.ts:280-297` mesure l'inactivité passée, pas l'absence de tâche future |
| 243 | 14  | Délai signal → action                           | ABSENT  | —                                                                                      |
| 244 | 14  | Taux détecté → qualifié                         | ABSENT  | —                                                                                      |
| 245 | 14  | Âge moyen d'étape                               | ABSENT  | `stage_entered_at` existe, aucune agrégation                                           |
| 246 | 14  | Pipeline value (montants saisis)                | LIVRÉ   | `project.ts:520`                                                                       |
| 247 | 14  | Projets sans montant                            | LIVRÉ   | `project.ts:521`                                                                       |
| 248 | 14  | Besoins ouverts sans shortlist                  | ABSENT  | dépend de l'item 125                                                                   |
| 249 | 14  | Taux de besoins non staffables PAR CAUSE        | ABSENT  | dépend de la porte G3                                                                  |
| 250 | 14  | Chance de closing non mesurable                 | REFUS   | item 129                                                                               |
| 251 | 14  | Fraîcheur médiane des plans                     | ABSENT  | —                                                                                      |
| 252 | 14  | Taux de doublons contacts                       | ABSENT  | calculable depuis `duplicate_pairs`, jamais calculé                                    |
| 253 | 14  | Part des activités capturées automatiquement    | ABSENT  | `activity.ts:74` distingue `manual` des sources auto, jamais agrégé                    |

### §17-§18 — Les 6 tickets et les 6 décisions (p. 14-18)

| #   | p.    | Ticket / décision                                                | Statut   | Preuve / raison                                                      |
| --- | ----- | ---------------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| 254 | 14-15 | **BEL-CRM-101** écran Besoins ouverts (P0)                       | ABSENT   | items 124-125 → **lot C**                                            |
| 255 | 15-16 | **BEL-CRM-102** porte G1 de priorisation (P0)                    | ABSENT   | items 58-62 → **lot D**                                              |
| 256 | 16-17 | **BEL-CRM-103** écran Séquences, statuts dérivés (P0)            | PARTIEL  | la dérivation est livrée (item 155), l'écran non → **lot E**         |
| 257 | 17    | **BEL-CRM-104** onglet Projets du dossier (P1)                   | ABSENT   | items 52-53 → **lot G**                                              |
| 258 | 17    | **BEL-CRM-105** catalogues d'espace (P1)                         | ABSENT   | items 186-196 → **lot H**                                            |
| 259 | 17    | **BEL-CRM-106** phase de travail dérivée (P0)                    | ABSENT   | item 122 → **lot B**, sous décision D13                              |
| 260 | 18    | D11 onglet Partenaires                                           | DÉCISION | aucune table partenaire — voir décision D-C                          |
| 261 | 18    | D12 LinkedIn comme source de besoin → refus                      | PÉRIMÉ   | item 117 : c'est déjà la règle du dépôt                              |
| 262 | 18    | D13 phase dérivée                                                | DÉCISION | item 123                                                             |
| 263 | 18    | D14 score de closing visible                                     | PÉRIMÉ   | item 130                                                             |
| 264 | 18    | D15 un besoin sans projet parent → non                           | LIVRÉ    | déjà garanti en base : `project_id NOT NULL` (`ProjectPivot.ts:109`) |
| 265 | 18    | D5 (rappel) cloisonnement : lecture ouverte, écriture cloisonnée | LIVRÉ    | tranché et livré le 19/08 (`portfolio-visibility.ts`)                |

---

## 2. Ce que le croisement a trouvé et que le PDF ne demandait pas

Cinq défauts, aucun inscrit au PDF. Tous corrigeables sans décision produit.

**X1 — Le badge RISQUE est calculé et n'atteint jamais le commercial.**
Le PDF appelle ce badge « à ne surtout pas perdre » et le déclare `[Confirmé — repo]`.
Le CALCUL existe bien (`contact-score.ts:47-75` — l'employeur remonté par
l'enrichissement est comparé au compte, et `contactSourceTag` rend `'RISQUE'`), mais
son seul lecteur est le tableau de bord opérateur (`internal-telemetry.controller.ts:11-13`,
gardé par le secret interne). Zéro occurrence de `sourceTag` dans `apps/web/src/features/contacts`.
Conséquence concrète : un contact qui a quitté l'entreprise reste, pour le commercial,
un contact ordinaire — il l'appelle, il lui écrit, il le met en séquence.

**X2 — Les écritures du contrôleur `accounts` ne déclarent aucune permission.**
`@Post()` (créer), `@Post(':id/archive')`, `@Patch(':id/commercial-status')` et
`@Patch(':id/relationship-memory')` ne portent aucun `@RequirePermission`
(`accounts.controller.ts:343,383,393,410`), là où le contrôleur `projects` le fait
partout. `WorkspacePermissionGuard` étant fail-open, le rôle `viewer` — documenté
« strictly read-only … refused on every mutation » (`workspace.ts:104-106`) — crée,
archive et re-classe des comptes. `finance` aussi, dont la matrice dit explicitement
« AUCUN droit d'écriture sur les fiches ». Le contrôleur figure dans la liste gelée de
GA-05 (`endpoint-guards.spec.ts:37`) : cette liste « ne doit que RÉTRÉCIR », et c'est
exactement ce que le §14 du PDF demande.

**X3 — Un opt-out ou un bounce n'arrête pas une séquence.**
Le §10.4 impose quatre conditions d'arrêt « non désactivables ». Deux le sont
(réponse et rendez-vous, `contacts.service.ts:1634-1650`). Les deux autres ne le sont
pas : la liste de suppression et le rebond bloquent l'ENVOI au dernier moment
(`mailbox.service.ts:315-316`), mais la séquence reste `active` avec ses étapes en
attente, indéfiniment — elle continue de compter dans les tableaux, de proposer des
échéances, et de faire croire qu'un fil est vivant.

**X4 — L'écran Portefeuille ne rend jamais son état d'erreur.**
`useAccounts` expose bien `isError`, mais `AccountsPage.tsx:28-33` ne déstructure que
`isLoading`. Une liste qui échoue s'affiche donc comme une liste VIDE, avec le message
« Ton portefeuille est vide. Analyse un premier compte » — c'est-à-dire qu'une panne se
lit comme un fait. Le §3.5 du PDF réclame les quatre états, et c'est le seul manquant.

**X5 — L'enrichissement de masse avale ses échecs.**
La boucle `ContactContent.tsx:266-298` déclenche un enrichissement par contact et
n'agrège rien : un `catch` vide (`:276-279`) fait disparaître les erreurs, et
l'utilisateur reçoit N notifications individuelles au lieu du « 6 trouvés, 4 sans
résultat, 6 crédits débités » que le §5.4 demande. Sur dix contacts dont quatre
échouent, rien ne le dit.

### Constats non corrigés ici

- `GET /accounts/:id/timeline` (`accounts.controller.ts:125`, `account-timeline.service.ts`)
  n'a **aucun appelant** — ni web, ni MCP, ni API publique. L'onglet Historique passe par
  les activités. Endpoint mort, laissé en place : le retirer casserait un client externe
  éventuel sans rien réparer.
- `apps/web/src/features/projects/portfolio/view/NeedsPage.tsx` (159 lignes) n'est routée
  nulle part. À ne pas confondre avec l'écran du lot C : cette page-là liste les besoins
  DÉTECTÉS par l'analyse d'un compte, un autre objet.
- Les clés i18n `contacts.bulk.enrichCost` et `bulk.nothingBillable` n'ont aucun usage.

---

## 3. Lots d'implémentation

Ordonnés par dépendance. Chaque lot est autonome et peut partir seul.

- **Lot A — Les 5 défauts trouvés** (X1→X5) — dépend de : rien.
  Le lot à plus forte valeur : cinq régressions actives, aucune décision produit.
  X2 retire `accounts.controller.ts` de la liste gelée de GA-05.
- **Lot B — BEL-CRM-106, la phase de travail dérivée** (item 122) — dépend de : la
  décision D13. Fonctions PURES `deriveWorkPhase` et `isPhaseValidForStatus` dans
  `packages/contracts`. **Aucune valeur ajoutée à l'enum `status`** : les 4 valeurs
  contractuelles restent, la phase se calcule. Même grain que
  `deriveOutreachDisplayStatus`, qui a déjà tranché cette question pour les séquences.
- **Lot C — BEL-CRM-101, l'écran Besoins ouverts** (items 124-125) — dépend de : B.
  `GET /projects/needs` transverse, paginé côté serveur, filtré, avec le compteur de
  shortlist par besoin ; route `/projects/needs`, colonnes, états, i18n, démo.
- **Lot D — BEL-CRM-102, la porte G1 de priorisation** (items 58-62) — dépend de : rien.
  Migration ADDITIVE `priority_gate` + `gate_reason`, backfill, transition
  `parked → prioritised` interdite, catalogue de motifs d'écartement, et — c'est le
  point — le premier appelant réel de la porte `account_priority`, déclarée depuis le
  19/08 et jamais franchie.
- **Lot E — BEL-CRM-103, l'écran Séquences** (items 154, 164-167) — dépend de : A (X3).
  L'écran manquant au-dessus d'un module qui existe, avec le statut DÉRIVÉ déjà livré,
  et la garde qui vérifie qu'aucune API ne retire une condition d'arrêt.
- **Lot F — La porte G3 et le besoin staffable** (items 126-128, 190, 249) — dépend de : B, D.
  `staffable` + motif, franchissement journalisé, catalogue de motifs, KPI par cause.
- **Lot G — BEL-CRM-104, l'onglet Projets du dossier compte** (items 52-53) — dépend de : rien.
- **Lot H — BEL-CRM-105, les catalogues d'espace** (items 186-196) — dépend de : D, F.
  Un écran, les catalogues qui existent sans UI (motifs de perte, libellés d'étapes) et
  ceux que D et F créent, avec l'usage compté par valeur et le refus de supprimer ce qui sert.
- **Lot I — Le panneau d'effet d'un changement d'étape** (items 135-139, 142) — dépend de : la
  décision D-D. `effectsForMove` — l'une des cinq fonctions pures que le PDF 1 avait
  laissées non écrites faute de consommateur, et dont le §8.5 est justement le
  consommateur —, la carte de projet complète, et le blocage du retour arrière depuis
  `won` quand une mission existe.

---

## 4. Décisions — tranchées par Louis le 19/08/2026

| #   | Question                                                                          | Reco                     | Réponse de Louis                    |
| --- | --------------------------------------------------------------------------------- | ------------------------ | ----------------------------------- |
| D13 | 11 statuts de besoin en base, ou une phase de travail dérivée ?                   | phase dérivée            | **11 statuts EN BASE**              |
| D-B | La granularité Compte / Entité / Site : chantier dédié plus tard, ou maintenant ? | chantier dédié           | **maintenant, avant les tickets**   |
| D-C | Capitalisation (Preuves & REX) et Partenaires (D11) : reporter ou construire ?    | reporter les deux        | **construire les deux**             |
| D-D | Le §8.5 : panneau d'effet sur le sélecteur, ou vrai glisser-déposer ?             | panneau sur le sélecteur | **ajouter le glisser-déposer**      |
| D11 | Onglet Partenaires dédié                                                          | —                        | tranché par D-C : **oui**           |
| D12 | LinkedIn comme source de besoin                                                   | —                        | déjà tranché : **refus** (item 117) |
| D14 | Score de chance de closing visible du commercial                                  | —                        | déjà tranché : **non** (item 130)   |
| D15 | Un besoin peut-il exister sans projet parent                                      | —                        | déjà garanti en base (item 264)     |
| D5  | Cloisonnement de portefeuille                                                     | —                        | livré le 19/08 (item 265)           |

### Ce que D13 veut dire exactement, et ce qu'il ne veut pas dire

Le §2.3 du PDF 1 pose un interdit que ce chantier ne lève pas : **on ne renomme
jamais une valeur d'enum**, et la garde `enum-additivity.test.ts` refuse toute
amputation ou insertion. Les onze états entrent donc en base **par ajout** :
`PROJECT_NEED_STATUSES` s'allonge, les données sont reprises
(`open → to_qualify`, `staffed → won`), et les deux anciennes valeurs restent
ACCEPTÉES par la contrainte sans plus être écrites — une écriture en vol pendant
le déploiement ne peut pas être rejetée. `cancelled` survit comme état de plein
droit : un besoin annulé par l'ESN n'est pas un besoin « perdu » chez le client,
et les confondre fausserait le taux de perte.

### Ce que D-B ajoute au chantier

La granularité passe donc **avant** les six tickets, parce que la colonne
« Entité » de trois écrans, le rattachement d'un contact, le rang 1 en place et
la mobilité d'une mission en dépendent tous. C'est le lot 0.

---

## 5. Ce qu'on ne promet pas

- **Le score de chance de closing** (§7.7, D14) — l'arbitrage n°4 du 16/08
  interdit toute probabilité et tout prévisionnel pondéré ; un « score de chance
  de closing » en EST une. Déjà refusé une fois, comme D10 du PDF 1. Ce qui est
  exposé à la place est un score d'ENGAGEMENT, décomposé, `null` quand rien
  n'est lisible.
- **LinkedIn comme source de besoin** (D12) — le scraping expose le compte de
  l'utilisateur à la suspension. Le PDF lui-même recommande le refus, et le
  chemin retenu (`pasted_text`) est livré : l'utilisateur colle une offre, la
  provenance reste HUMAINE parce que c'est lui qui a apporté le texte.
- **Renommer le cycle de vie des contacts** vers le vocabulaire du §5.5 —
  renommer une valeur d'enum est le premier interdit du §2.3 du PDF 1. Les deux
  états qui semblaient manquer (`engaged`, `replied`) vivent déjà sur un AUTRE
  axe, livré depuis longtemps.
- **Le retour arrière avec motif sur une transition de contact** (item 82) et
  **l'état `excluded` atteignable partout** (item 83) — l'état `rejete` existe
  mais son drapeau n'est jamais posé. Le corriger demande de décider QUI peut
  exclure un contact et ce que ça entraîne sur les séquences en cours ; c'est
  une décision produit, pas un oubli technique.
- **Les fenêtres de fraîcheur par type de signal** (items 90-97) — le dépôt a
  une fenêtre transverse de 24 mois et des bornes par collecteur. Poser sept
  seuils différents change ce qui compte dans le score de TOUS les comptes
  existants : à faire sur une mesure, pas sur une lecture de PDF.
- **Les 12 automatisations CRM du §13** — cinq ont un équivalent partiel, sept
  n'existent pas. Elles dépendent du catalogue de routines, qui a sa propre
  discipline (« n'y figure que ce que les connecteurs savent RÉELLEMENT
  faire ») ; les y inscrire sans les brancher produirait des cases à cocher qui
  ne font rien.
- **Les 13 KPI du §16** — quatre existent, neuf demandent des agrégats
  nouveaux. Les indicateurs vivent au back-office par arbitrage du 03/08 ; les
  poser côté application contredirait cette décision.

## 6. État de livraison

Douze lots, mergés dans `main` par la **PR #991** (un commit par lot).

| Lot | Contenu                                                | Mergé | Vérifié en live |
| --- | ------------------------------------------------------ | ----- | --------------- |
| 0   | La granularité Compte / Entité / Site (D-B)            | ✅    | phase 5         |
| A   | Les 5 défauts trouvés en croisant (X1→X5)              | ✅    | phase 5         |
| B   | Les onze états de besoin, en base (D13)                | ✅    | phase 5         |
| C   | L'écran « Besoins ouverts » (BEL-CRM-101)              | ✅    | phase 5         |
| D   | La porte G1 de priorisation (BEL-CRM-102)              | ✅    | phase 5         |
| E   | L'écran Séquences et ses statuts dérivés (BEL-CRM-103) | ✅    | phase 5         |
| F   | La porte G3 « besoin staffable ? »                     | ✅    | phase 5         |
| G   | L'onglet Projets d'un compte (BEL-CRM-104)             | ✅    | phase 5         |
| H   | Les huit catalogues d'espace (BEL-CRM-105)             | ✅    | phase 5         |
| I   | Le glisser-déposer et son panneau d'effet (D-D)        | ✅    | phase 5         |
| J   | La capitalisation : preuves, REX, témoignages (D-C)    | ✅    | phase 5         |
| K   | L'onglet Partenaires (D11, D-C)                        | ✅    | phase 5         |

Suites au dernier commit : **API 5134**, **web 2582**, **contrats 1257**,
**IA 4124**. `check-types` 23/23, `format:check` et `lint:exports:types`
propres.

### Les cinq fonctions pures du PDF 1 sont désormais toutes écrites

`effectsForMove` (§8.5), `proofStrength` et `isProofUsable` (§12),
`partnerScore` et `rank1Recommendation` (§4.1, D11). Le PDF 1 les avait nommées
et laissées non écrites faute de consommateur — le PDF 2 est ce consommateur, et
chacune a maintenant un appelant réel.

---

## 7. Phase 5 — la recette en production

Faite sur le lien de démonstration, une fois chaque commit déployé sur l'API
**et** sur le service IA (vérifié en comparant `.commit` et `.ia.commit`
SÉPARÉMENT — un `grep` sur le corps entier matche le commit de l'IA et annonce
« déployé » à tort ; l'erreur a été refaite ici, puis corrigée).

### Ce qui a été exercé pour de vrai, pas seulement chargé

- **La porte G3** — le motif est obligatoire (bouton inerte tant que le champ
  est vide), le besoin est clos avec sa raison, il sort de « Besoins ouverts »,
  et le motif choisi (« Zone non couverte ») apparaît au catalogue de l'espace
  avec **1 usage**. La chaîne lot F → lot H, de bout en bout.
- **La porte G1** — le popover à trois issues, la priorisation persistée
  (« À trancher » devient « Priorisé »).
- **L'onglet Partenaires** — la recommandation est rendue **par entité**, et les
  quatre entités de Société Générale (Boursorama, BoursoBank, Société Générale,
  Treezor) ont été RÉCONCILIÉES depuis les libellés des contacts : c'est la
  preuve du lot 0 en production. Une ESN déclarée sort « Rang inconnu ·
  Relation inconnue · 10/100 » — rien n'est deviné.
- **La colonne Entité** de la liste des contacts, remplie et distincte
  d'« Entreprise ».
- **Le balayage ZÉRO régression** — les onze entrées de navigation et les cinq
  écrans de Réglages ouverts un par un. Console sans erreur.

### Cinq défauts trouvés en production, et corrigés

Aucun n'était visible dans les 9 000 tests verts.

1. **L'écran Catalogues s'ouvrait vide sur une colonne mal nommée.** La lecture
   des offres interrogeait `profiles.offers`, qui n'existe pas — elles vivent
   sur `esn_profiles.expertise_areas`. Le vrai défaut n'est pas la faute de
   frappe : un `Promise.all` de six requêtes fait tomber la réponse ENTIÈRE dès
   que l'une jette. Sept catalogues corrects sont partis avec un huitième mal
   écrit. Chaque bloc est désormais lu séparément et tolérammment.
2. **L'onglet Projets affichait ses clés de traduction** (`kind.implication`,
   `stage.detected`) : trois chemins de clé faux. Les treize clés dynamiques des
   écrans du PDF 2 sont maintenant inscrites dans `enum-keys.test.ts`.
3. **Les motifs de fin de positionnement s'affichaient en clés brutes** —
   `other_supplier` au lieu d'« Autre fournisseur ».
4. **Le sélecteur d'étape passait à côté de son propre panneau d'effet** : deux
   chemins pour le même geste, un gouverné et un non. Les deux y passent
   désormais, ce qui rend aussi la gouvernance atteignable au clavier.
5. **La carte glissable avait tué le clic qui ouvre le projet.** Le capteur de
   pointeur annule l'événement par défaut, donc le `click` ne part jamais : on
   perdait le tiroir (détail, BTMMP, besoins, positionnements) pour gagner un
   glissement. La poignée est séparée du corps.

### Le panneau d'effet, vérifié de bout en bout

Depuis le sélecteur d'étape du tiroir : « Déplacer vers "Besoin exprimé" » →
**ce qui change** (l'étape, la date d'entrée d'étape) · **ce que je propose**
(☑ créer les besoins, ☑ lancer le matching, ☐ demander le budget, marqué « sort
de l'outil » et NON coché) · **ce que je vérifie** (« les compétences
sont-elles renseignées ? »). Confirmé, le déplacement a persisté : la colonne
Qualifié est passée de 2 à 1 et Besoin exprimé de 90 000 € à 135 000 €.

### Ce qui n'a PAS pu être vérifié en recette

**Le glissement lui-même.** Ni `left_click_drag` ni des `PointerEvent`
synthétiques ne déclenchent `@dnd-kit` — ses événements ne sont pas `isTrusted`.
Le clic sur le corps de la carte, lui, EST vérifié (un `.click()` programmatique
ouvre bien le tiroir) : c'est l'automatisation que le capteur avale, pas la
fonctionnalité. Le glissement reste à essayer à la main.

C'est précisément pour ça que le panneau d'effet s'ouvre AUSSI depuis le
sélecteur : la gouvernance du §8.5 est atteignable sans glisser — au clavier —
et cette voie-là est vérifiée.
