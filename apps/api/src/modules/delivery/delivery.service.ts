import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository, IsNull, Not } from 'typeorm'
import {
  carriedLoadedDailyCostCents,
  ACTIONABLE_RENEWAL_WINDOWS,
  missionBillingAlert,
  type MissionBillingAlert,
  missionRiskSchema,
  missionStatusForColumn,
  missionStatusMove,
  missionStatusSchema,
  UNASSIGNED_MISSIONS_SQL,
  activeMissionNextAction,
  dailyMarginPercent,
  dayGap,
  gapAnomalyMessages,
  financeScopeClause,
  redactFinance,
  daysUntilEnd,
  expectedWorkingDaysInWindow,
  type ActiveMissionRow,
  type ContractKind,
  missionRisks,
  renewalWindow,
  DEFAULT_RENEWAL_WINDOW_DAYS,
  renewalWindowBoundDays,
  renewalWindowDaysSchema,
  resolveRenewalWindowDays,
  type CreateMissionRequest,
  type ExpansionSignal,
  type FinanceScopeInfo,
  type MissionBoardColumn,
  type MissionRisk,
  type MissionSatisfaction,
  type MissionStatus,
  type MoveBoardCard,
  type RenewalWindow,
  type SetRenewalStatusRequest,
  type UpdateMissionRequest,
  canConfirmRenewal,
  RENEWAL_CONFIRMATION_REQUIRES_BOTH_RAILS,
  type SetRenewalClientRailRequest,
  type SetRenewalConsultantRailRequest,
  renewalEngineTier,
  renewalEngineFactors,
  deriveRenewalEngineState,
  repositionTrigger,
  type RenewalEngineFactor,
  type RenewalEngineState,
  type RenewalEngineTier,
  type RepositionTrigger,
  type RepositionTriggerReason,
  repositionReasons,
  type SetMissionRiskResolutionRequest,
  type MarketDemandSignal,
  type ProfileScarcitySignal,
  type OpenNeedsSignal,
  type AccountRepositionSignal,
  type ConsultantRepositionSignal,
  needStillOpenSql,
  type TerritorySnapshotSource,
  POOL_THRESHOLDS,
  type DeliveryMode,
  type SupervisionRole,
  deliveryModeProblems,
} from '@bellum/contracts'
import { receivableAlertsByMission } from './mission-billing-alerts'
import { missionExceptionSignals, type MissionExceptionSignals } from './mission-exception-signals'
import { departmentsFromZones } from '../consultants/matching/reverse-market'
// #2414.48 — même liste de stades « présenté », jamais une seconde à resynchroniser (GA-26).
import { PRESENTED_SUBMISSION_STAGES } from '../proposals/presented-submission-stages'
import { AccountEntity } from '../../database/entities/account.entity'
import { MissionRiskResolutionEntity } from '../../database/entities/mission-risk-resolution.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { CrmDealFactEntity } from '../../database/entities/crm-deal-fact.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { MissionCommercialTermsEntity } from '../../database/entities/mission-commercial-terms.entity'
import { MissionTimesheetEntity } from '../../database/entities/mission-timesheet.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { SubmissionEntity } from '../../database/entities/submission.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CommercialTransitionsService } from '../commercial-transitions/commercial-transitions.service'
import { StaffingService } from './staffing.service'
import { InvoiceReadinessService } from './invoice-readiness.service'
import { ownerDisplayName } from './owner-display-name'
import {
  duplicateValidatedTimesheet,
  overlappingMissionAssignment,
  type DuplicateValidatedTimesheet,
  type OverlappingMission,
} from './timesheet-cross-checks'
import { journalStatusTransition } from './mission-status.service'
import { assertMissionStartGate } from './mission-start-readiness.service'

/**
 * Delivery OS (addendum final p71-72).
 *
 * Ce que ce service apporte, et que ni le CRM ni l'ERP ne font aujourd'hui : les
 * signaux de la fin d'une mission arrivent AVANT la fin, et ils arrivent au
 * commercial. Un renouvellement se prépare à J-60 ; découvert à J-3, il se
 * négocie en position de faiblesse, quand il ne se perd pas.
 *
 * Ce qu'il ne fait PAS, et ne fera pas ici : émettre une facture. Un
 * renouvellement raté coûte une mission, une facture fausse est un problème
 * juridique — mentions obligatoires, TVA, numérotation sans trou, archivage
 * fiscal. Bellum suit la MARGE et les ÉCHÉANCES, deux informations commerciales,
 * et laisse l'émission à l'outil comptable.
 */

/** Une mission avec ce qui se calcule dessus — jamais stocké. */
/**
 * Ce que l'écran Missions LIT — la mission à plat, plus ce qui est calculé.
 *
 * Elle était imbriquée sous une clé `mission`, alors que le web déclarait de
 * son côté un type du MÊME nom, à plat. Chaque champ lu (`label`, `status`,
 * `ends_on`) valait donc `undefined` : des lignes sans titre, toutes « sans
 * date de fin », et un badge affichant la clé brute `status.undefined`. Rien
 * ne pouvait l'attraper — `apiFetch` type la réponse par assertion, donc les
 * deux côtés compilaient, chacun cohérent avec lui-même.
 */
/** #3547 — ce que la mission reprend d'un besoin en forfait encadré. */
type InheritedSupervision = {
  supervision_role: string | null
  client_team_size: number | null
  client_team_names: string[]
}

/**
 * #2414.43 — LA MÉMOIRE MARCHÉ, lue par le CONTRÔLEUR et passée en fonction :
 * ce service n'importe pas le module Mémoire marché (§3.2), il reçoit seulement
 * de quoi demander « quelles technos observe-t-on chez ces comptes ? ». `null`
 * par compte = non couvert (jamais « aucune techno »).
 */
export type ClientStacksResolver = (
  accounts: ReadonlyArray<{ id: string; name: string; website: string | null }>,
) => Promise<ReadonlyMap<string, readonly string[] | null>>

/** Ce qu'on lit d'un compte pour décorer une mission : son nom, et de quoi le DESSINER. */
type AccountLookup = {
  name: string
  logoUrl: string | null
  website: string | null
  /** #2194.22 — l'unité d'affaires du compte PORTEUR (`accounts.business_unit_id`).
   *  `null` = aucune BU déclarée sur ce compte. */
  businessUnitId: string | null
  businessUnitName: string | null
}

type MissionView = MissionEntity & {
  renewal: RenewalWindow
  /**
   * #2195.8 — LE NOMBRE DE JOURS de la fenêtre, puisque c'est lui qui s'affiche.
   *
   * `renewal` reste l'IDENTIFIANT de position (`j15` = premier palier), gelé par
   * GA-08 ; ce que l'écran écrit se calcule depuis ce nombre. Sans lui, un
   * espace réglé sur [20, 40, 70, 100] lirait « J-15 » sur une fenêtre qui
   * s'ouvre à vingt jours.
   *
   * `null` sur `overdue`, `imminent`, `far` et `unknown` : elles n'ont pas de
   * borne réglable, et `0` ferait écrire « à 0 jour » là où la vérité est
   * « cette fenêtre ne se règle pas ».
   */
  renewalBoundDays: number | null
  /**
   * CE QU'IL RESTE À FAIRE, et l'écran où ça se fait (#1354, #1355, #1357).
   *
   * Le champ existait déjà sur `activeMissionRowSchema` et voyageait jusqu'à
   * l'onglet Missions d'un dossier de compte, qui le rend en LIEN. Il ne
   * voyageait PAS sur `GET /delivery/missions` — si bien que `/missions`, la
   * liste qu'on ouvre tous les matins, affichait « Renouvellement non engagé »
   * et « Sans date de fin » en badges muets : l'alerte sans la porte.
   *
   * Il est DÉRIVÉ de `renewal` par `activeMissionNextAction`, la même fonction
   * que le dossier de compte — jamais une seconde échelle d'urgence (GA-26).
   */
  nextAction: ActiveMissionRow['nextAction']
  /** `null` quand l'appelant n'a pas `finance:read` — PRÉSENT et vide, jamais
   *  retiré (D45, 28/08/2026) et jamais mis à zéro : un zéro se lirait comme
   *  une marge nulle, ce qui est une information fausse plutôt qu'une absence
   *  d'information. Ce qui distingue « pas le droit » de « pas mesuré », c'est
   *  `canReadFinance`, rendu à côté de la liste — plus la forme du champ. */
  marginPercent: number | null
  risks: MissionRisk[]
  /** #2408 — le badge de facturation de la ligne (échue > paiement en retard > bloquée) ; absent sans `finance:read`. */
  billingAlert?: MissionBillingAlert | null
  /**
   * #2413.1, .2, .6, .25, .26 — LE PALIER DU MOTEUR DE CADENCE (épopée #2965).
   *
   * Distinct de `renewal` (la fenêtre `j15`…`j60` de #2195.8, réglable par
   * espace) : celui-ci applique le préavis et la durée de la mission sur les
   * bornes par défaut (60/30/15/0 jours), jamais réglable par espace — voir
   * `mission-renewal-engine.ts` pour la raison de ne pas dupliquer l'échelle.
   */
  renewalEngineTier: RenewalEngineTier | 'not_due' | 'unknown'
  /**
   * #2413.28 à .35 — les 8 facteurs moteur, chacun nommé, jamais fabriqué : un
   * facteur que le produit ne collecte pas sort `status: 'absent'` avec sa
   * raison, jamais une valeur devinée (doctrine « non mesuré ≠ 0 »).
   */
  renewalEngineFactors: readonly RenewalEngineFactor[]
  /**
   * #2413.36 à .48 — l'état nommé, DÉRIVÉ de `renewal_status` et du dual track
   * à la lecture. Ne s'écrit jamais en base (`RENEWAL_STATUSES` reste la seule
   * colonne, gelée par GA-08) — voir `mission-renewal-engine.ts`.
   */
  renewalEngineState: RenewalEngineState
  /**
   * #2414.34 à .48 (épopée #2986) — QUAND le moteur de repositionnement doit
   * commencer, croisant le palier de cadence (qui porte déjà le préavis) et la
   * confiance sur le renouvellement (`missionAvailabilityCertainty`) — voir
   * `mission-reposition-trigger.ts`. Ne dit jamais qu'un consultant est
   * disponible, ne lance rien : un signal de MOMENT, lu par un écran.
   */
  repositionTrigger: RepositionTrigger
  /** Toutes les raisons qui tiennent (la première est `repositionTrigger.reasonKey`). */
  repositionReasons: RepositionTriggerReason[]
  /** #2986 — les contraintes déclarées des affectés, TEXTE de la fiche. `[]` = aucune saisie (jamais « aucune contrainte »). */
  repositionConstraints: RepositionConstraint[]
  /**
   * Le nom du compte porteur.
   *
   * Déclaré côté web depuis toujours, lu par la liste ET par l'entête du
   * tiroir de détail — et JAMAIS envoyé. L'entête écrit
   * `accountName ?? 'Compte inconnu'` : toute mission ouverte affichait donc
   * « Compte inconnu » alors que `account_id` est obligatoire en base.
   * Cause racine « colonne lue, jamais écrite » — le repli honnête ressemble
   * exactement à une base vide.
   */
  accountName: string | null
  /**
   * De quoi DESSINER le compte — son logo, et le site qui sert de repli.
   *
   * ⚠️ Les DEUX, jamais le seul logo. `companyLogoSrc` applique une précédence
   * — logo réel d'abord, favicon du site ensuite : n'envoyer que `logo_url`
   * priverait de repli tous les comptes qui n'ont qu'un site.
   *
   * Même cause racine que `accountName` juste au-dessus, une colonne plus
   * loin : `CompanyAvatar` existe, il sert sur vingt-neuf fichiers, les logos
   * s'affichent sur `/accounts` — et la liste des missions rendait une
   * initiale parce que la requête ne sélectionnait que `id` et `company_name`.
   * Un composant juste que personne ne NOURRIT rend exactement la même chose
   * qu'un composant absent.
   */
  accountLogoUrl: string | null
  accountWebsite: string | null
  /**
   * #2194.22 — l'unité d'affaires (BU/agence) du COMPTE porteur.
   *
   * ⚠️ Par défaut NON persistée sur la mission : `accounts.business_unit_id`
   * est la source, résolue ici via `accountsOf`. UNE exception, voulue (#3413,
   * décision Louis 02/10) : un TRANSFERT explicite pose `missions.business_unit_id`,
   * qui prime alors sur celle du compte et est journalisé.
   * `null` = ni BU propre, ni compte avec BU déclarée, ou compte hors périmètre.
   */
  businessUnitId: string | null
  businessUnitName: string | null
  /**
   * #2195.13 — le nom du PORTEUR (`owner_id`), résolu en un lot.
   *
   * `staffing.service.ts:readContacts` savait déjà résoudre un `owner_id`
   * UNIQUE (une mission à la fois, pour le tiroir de contacts) ; la LISTE en
   * demandait une version groupée, sur le modèle d'`accountsOf` juste
   * au-dessus — une requête, pas N. Refuser l'UUID nu tant que cette
   * résolution n'existait pas était le bon appel (`columns.ts`), mais
   * refuser indéfiniment aurait été le défaut n°1 du dépôt : du champ juste,
   * jamais nourri.
   *
   * `null` = aucun porteur, OU lecture illisible (`profiles` hors service) —
   * les deux disent la même chose à l'écran : rien à afficher, jamais un UUID.
   */
  ownerName: string | null
  /**
   * #2195.12 — le nom du/des MANAGER(S) des consultants affectés, résolu en
   * un lot.
   *
   * `ConsultantsService.managerNamesOf` sait déjà résoudre le manager d'UN LOT
   * de fiches (la fiche d'un consultant) ; la liste des missions demande deux
   * sauts de plus : mission → `mission_assignments` → `consultants.manager_id`
   * → `consultants.full_name`. Sur le modèle d'`ownerName` juste au-dessus.
   *
   * `null` = aucun consultant affecté n'a de manager renseigné, OU lecture
   * illisible — les deux disent la même chose à l'écran : « non renseigné »,
   * jamais un nom deviné. Plusieurs consultants affectés avec des managers
   * DISTINCTS rendent les deux noms, triés, séparés par une virgule.
   */
  managerName: string | null
  /**
   * #2953 (#2193.6) — le nom du MANAGER CLIENT (`client_manager_contact_id`),
   * résolu en un lot. La colonne existait déjà (#2836, migration
   * `MissionClientManagerContact`), l'écran d'affectation aussi
   * (`MissionDetailPanel.tsx`) et le résumé du compte l'affichait déjà
   * (`TabMissions.tsx`, `account-missions.service.ts:clientManagersOf`) — mais
   * la fiche d'UNE mission (`GET /delivery/missions?id=…`, celle que lit le
   * dossier) ne le rendait pas : même défaut n°1 que `managerName`/`ownerName`
   * juste au-dessus, une résolution qui existe pour un écran et pas pour
   * l'autre.
   *
   * `null` = non désigné, contact disparu, contact d'un AUTRE compte que
   * celui de la mission (garde de sécurité, jamais mesurée en prod), ou
   * lecture illisible — les quatre disent la même chose à l'écran, jamais un
   * nom deviné.
   */
  clientManagerName: string | null
  /**
   * #2953 (#2193.59) — L'IDENTIFIANT DU CONTACT, à côté de son nom.
   *
   * `clientManagerName` seul refusait tout lien : c'est un contact RÉEL de la
   * table `contacts`, avec une fiche (`/contacts/$id`, déjà ouverte ailleurs
   * pour d'autres contacts d'un même compte) — un nom sans id ne se lie à rien
   * à l'écran. `null` exactement quand `clientManagerName` l'est : les mêmes
   * quatre raisons (non désigné, contact disparu, contact d'un autre compte,
   * lecture illisible) disent la même chose ici, jamais un id sans le nom qui
   * le confirme.
   */
  clientManagerContactId: string | null
  /**
   * #2930 — le libellé du besoin d'origine (`opportunity_id`), résolu en un
   * lot. Sortait en UUID nu et était refusé à l'écran (`MissionDetailTabs.tsx`)
   * faute de résolution groupée — même patron qu'`ownerName`/`managerName`
   * juste au-dessus, sur `opportunities.label`.
   *
   * `null` = aucun besoin lié, besoin introuvable, ou lecture illisible — les
   * trois disent la même chose à l'écran : rien à afficher, jamais un UUID.
   */
  opportunityLabel: string | null
  /**
   * #2953 (#2193.48) — même patron qu'`opportunityLabel` juste au-dessus,
   * sur `submission_id` (le POSITIONNEMENT d'origine). "consultant → besoin",
   * jamais une troisième source de libellé.
   */
  submissionLabel: string | null
  /**
   * Qui est dessus AUJOURD'HUI (affectation non terminée).
   *
   * ⚠️ `[]` et `null` ne disent PAS la même chose : `[]` = on a lu, personne
   * n'est affecté (une alerte, celle que le board nomme `unstaffed`) ;
   * `null` = la lecture a échoué, on ne sait pas. Les confondre ferait
   * afficher « Personne d'affecté » sur des missions correctement staffées.
   */
  assignees: MissionAssignee[] | null
  /**
   * #2194.26 — les compétences CANONIQUES des affectés actifs — pour le
   * filtre Planning, qui filtre côté client (voir la doc de `skillsByMission`).
   * Même distinction `null`/`[]` qu'`assignees` juste au-dessus.
   */
  assignedSkills: string[] | null
  /**
   * #2408.52, #2408.62 — le CHEMIN par lequel la mission est arrivée (`direct`
   * / `partner` / `subcontracting` / `portage` / `unknown`), résolu depuis
   * `mission_commercial_terms.channel` — même table, même porte que
   * `poNumber`/`requiresPo` : `undefined` sans `finance:read`, ou quand la
   * mission n'a aucune ligne de conditions commerciales, jamais un canal
   * deviné à « direct ».
   */
  channel?: string
  /**
   * #2408.53 — la DEVISE du TJM et du contrat (ISO 4217), résolue depuis
   * `mission_commercial_terms.currency` — même table, même porte que
   * `channel` juste au-dessus. Contrairement à `channel` (colonne `default:
   * 'unknown'`), `currency` reste `null` MÊME quand la ligne existe : la
   * colonne est nullable, « non renseignée » n'est jamais devinée à « EUR ».
   * `undefined` = sans `finance:read`, ou aucune ligne de conditions
   * commerciales ; `null` = ligne lue, devise non renseignée.
   */
  currency?: string | null
  /**
   * #2408.33 / #2408.51 — le dernier niveau DÉCLARÉ de chaque rail
   * (`missionSatisfactionOf`). `{ client: null, consultant: null }` = rien de
   * déclaré (« non mesuré ») ; absent = pas lu (chemins d'écriture).
   */
  satisfaction?: MissionSatisfaction
  /**
   * #2408.40 — la SOCIÉTÉ de l'ESN qui porte la mission (`legal_entities`,
   * celle qui émet), résolue en nom en un lot. `null` = non renseignée ou
   * illisible ; absent = pas lu.
   */
  legalEntityName?: string | null
}

/**
 * QUI est sur une mission — l'identité, pas seulement le nom (#1350, #1363).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE CHAMP A CHANGÉ DE FORME PLUTÔT QUE D'ÊTRE DOUBLÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Il rendait `string[]`. Les deux retours demandent un avatar ET une porte vers
 * le profil du consultant : les deux exigent l'identité, qu'un nom ne porte pas
 * — deux homonymes du vivier ouvriraient la même fiche.
 *
 * Ajouter un SECOND champ (`assigneeProfiles`) à côté de l'ancien aurait laissé
 * deux formes de la même chose dans le fil, qui divergent au premier ajout —
 * c'est la cause racine « même nom, forme différente » du dépôt. La forme
 * change donc une fois, et les six lecteurs sont mis à jour avec elle.
 *
 * ⚠️ `photoUrl` est un critère PROTÉGÉ. Il s'affiche sur une fiche, il ne
 * classe personne — et il ne doit pas entrer dans un prompt qui note (doctrine
 * `c58`). Le pont du copilote le RETIRE explicitement avant de rendre ces
 * missions au modèle ; `copilot-bridge-hides-photos.spec.ts` le tient.
 */
// ⚠️ NON exporté : rien hors de ce fichier ne le NOMME — le pont du copilote
// décrit la forme qu'il consomme, et le web déclare la sienne. Un type exporté
// sans consommateur externe est refusé par `pnpm lint:exports:types` (knip).
// #2986 — une contrainte DÉCLARÉE, nommée : l'écran cite le texte saisi sur la fiche,
// jamais un libellé générique. Même règle de non-export que `MissionAssignee`.
type RepositionConstraint = {
  consultantName: string
  kind: 'mobility' | 'conditions'
  text: string
}

type MissionAssignee = {
  id: string
  fullName: string
  /** `null` = aucune photo déposée. Jamais une image devinée. */
  photoUrl: string | null
  /** #2194.39 — la charge de CETTE affectation, 1 à 100 (`mission_assignments.load_percent`). */
  loadPercent: number
}

/**
 * Ce qu'un LIEN DE SOURCE a le droit de resserrer sur la liste (§4.4).
 *
 * Les deux clés sont celles de `PROPAGATION_FILTER_KEYS` — le contrat décide de
 * ce qu'un lien peut porter, et le contrôleur les parse depuis là. Les nommer
 * ici une seconde fois serait la seconde vérité que §4.4 existe pour empêcher ;
 * ce type ne fait que dire au compilateur ce qui arrive.
 */
export type MissionListFilters = {
  accountId?: string
  consultantId?: string
  /**
   * UNE mission, par son identité — ce que lit son DOSSIER (D200, 30/08/2026).
   *
   * ⚠️ Ce n'est PAS une clé de `PROPAGATION_FILTER_KEYS`, et la garde
   * `propagation-source-link.spec.ts` fige cette liste à deux entrées : un
   * lien de source resserre sur un OBJET PORTEUR (un compte, un consultant),
   * jamais sur la ligne elle-même. Le contrôleur la lit donc à part.
   *
   * Pourquoi un filtre et non `GET /delivery/missions/:id` : le précédent est
   * la fiche du besoin, qui passe par `GET /projects/needs?id=…` pour la
   * raison écrite dans `useOpenNeed` — une seconde route recomposerait la
   * ligne ailleurs, et le dossier finirait par ne plus dire la même chose que
   * sa liste. La décoration (fenêtre de renouvellement, marge rédigée,
   * risques, nom du compte) vit à un seul endroit.
   */
  id?: string
  /**
   * #2194.22 — resserre sur les missions dont le COMPTE porteur appartient à
   * cette BU. Même mécanique d'intersection que `consultantId`/`scope` dans
   * `list()` : jamais un remplacement du périmètre d'espace.
   */
  businessUnitId?: string
  /**
   * #2194.26 — resserre sur les missions qu'au moins un affecté ACTIF (comme
   * `assigneesByMission`) porte cette compétence CANONIQUE
   * (`consultant_skills.skill`). La compétence n'est PAS persistée sur la
   * mission — voir la doc de `MissionView.businessUnitId` pour le même refus,
   * même raison : une seconde colonne divergerait du vivier le jour où la
   * compétence d'un consultant change.
   */
  skill?: string
}

/**
 * Le périmètre que l'APPELANT demande sur la liste.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DISTINCT DES FILTRES, ET IL DOIT L'ÊTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un FILTRE dit « resserre sur CET objet » et vient d'un lien de source (§4.4) ;
 * une PORTÉE dit « à qui ça appartient ». Les fondre aurait fait entrer `ownerId`
 * dans `PROPAGATION_FILTER_KEYS`, c'est-à-dire dans ce qu'un lien collé a le
 * droit de porter — et un lien qui porte l'identifiant d'un collègue n'est pas
 * un lien de source, c'est une lecture du portefeuille de quelqu'un d'autre.
 *
 * ⚠️ Et ce n'est pas non plus un `?ownerId=`, pour deux raisons : le navigateur
 * devrait alors connaître son propre identifiant pour demander « le mien », et
 * surtout « le mien » n'est PAS « owner_id = moi ». C'est `owner_id = moi` OU
 * `le compte m'est attribué` — la définition de `financeScopeClause`, écrite
 * pour la raison suivante : « une mission créée depuis un projet gagné n'a
 * souvent aucun propriétaire, et le commercial qui a vendu le compte doit voir
 * ce qu'elle rapporte ». Un `?ownerId=` aurait rendu une liste trop courte, et
 * une liste trop courte se croit.
 */
export type MissionListScope = { kind: 'workspace' } | { kind: 'own'; userId: string }

/**
 * Deux restrictions par identifiant qui se cumulent — l'INTERSECTION, jamais la
 * dernière arrivée.
 *
 * `null` d'un côté = « je ne restreins pas », et il laisse passer l'autre. Les
 * deux à `null` = aucune restriction. Confondre « je ne restreins pas » avec
 * « je restreins à rien » est la cause racine que `missionIdsOf` nomme déjà
 * juste au-dessus : `[]` et `null` ne disent pas la même chose.
 */
function intersectIds(a: string[] | null, b: string[] | null): string[] | null {
  if (a === null) return b
  if (b === null) return a
  const keep = new Set(b)
  return a.filter(id => keep.has(id))
}

/**
 * Les risques qui viennent d'une donnée GARDÉE par `finance:read` — donc
 * gardés comme elle (D43, puis #2408.18 pour le troisième).
 *
 * Nommés ici plutôt qu'écrits deux fois dans une condition : c'est la liste
 * qu'il faudra compléter le jour où un quatrième risque financier apparaît, et
 * l'oublier rouvrirait la fuite en silence.
 *
 * ⚠️ `missing_po` n'est pas une MARGE, mais il vient de la MÊME table
 * (`mission_commercial_terms`) sous le MÊME droit : sans `finance:read`, la
 * requête qui la lit ne part même pas (cf. `commercialTermsByMission`), donc le risque
 * ne peut être ni vrai ni faux pour ce lecteur — il sort, comme les deux
 * risques de marge.
 */
const FINANCE_GATED_RISKS: ReadonlySet<MissionRisk> = new Set<MissionRisk>([
  'margin_at_risk',
  'margin_unknown',
  'missing_po',
  // #2411.6 — même table de fait que `missing_po` : l'état de facturation
  // (`invoice_readiness`) est une donnée financière, gardée par le même droit.
  'invoice_blocked',
])

/**
 * CE QUI FAIT QU'UNE AFFECTATION DIT ENCORE QUI EST EN POSTE AUJOURD'HUI.
 *
 * Nommé une fois et interpolé, jamais recopié : deux lectures posent la même
 * question — les noms des personnes sur une mission, et le nombre de personnes
 * chez un client — et la copie diverge le jour où l'une des deux apprend à
 * tolérer une affectation qui commence demain. C'est la loi 1 du tome 7
 * appliquée à un prédicat SQL.
 *
 * ⚠️ Aucune valeur d'appelant n'entre ici : c'est un FRAGMENT constant, pas un
 * gabarit paramétré. Les valeurs restent des `$n` liés dans chaque requête.
 */
const ASSIGNMENT_STILL_RUNNING = '(ma.ends_on IS NULL OR ma.ends_on >= CURRENT_DATE)'

/**
 * QUELQU'UN EST-IL CHEZ CE CLIENT **AUJOURD'HUI** — la fenêtre complète.
 *
 * ⚠️ COMPOSÉE depuis {@link ASSIGNMENT_STILL_RUNNING}, jamais recopiée : la
 * moitié « pas encore fini » se décide à un seul endroit (GA-26).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LES DEUX MOITIÉS NE SE VALENT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * « Encore en cours » et « déjà commencé » sont deux questions différentes, et
 * les confondre a produit un défaut réel : `expertsByAccount` ne filtrait que
 * sur la fin, si bien qu'une affectation signée pour le mois PROCHAIN comptait
 * comme une personne en poste. Le portefeuille annonçait un expert sur place
 * chez un client où personne n'avait encore mis les pieds.
 *
 * L'inverse est vrai aussi, et c'est pourquoi {@link assigneesByMission} garde
 * la moitié seule : la liste des personnes AFFECTÉES à une mission doit montrer
 * celle qui arrive lundi. Un roster n'est pas un décompte de présence.
 */
const ASSIGNMENT_ON_SITE_TODAY = `(ma.starts_on <= CURRENT_DATE AND ${ASSIGNMENT_STILL_RUNNING})`

/**
 * Les statuts qu'une mission doit porter pour ouvrir une conversation
 * d'expansion : elle TOURNE, ou elle démarre.
 *
 * Nommés une fois pour les deux lectures de la carte — le regroupement par
 * compte et le comptage des experts en poste. Deux listes recopiées feraient
 * compter des experts sur des missions que la carte n'affiche pas.
 */
const EXPANSION_MISSION_STATUSES: readonly MissionStatus[] = ['active', 'onboarding']

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name)

  constructor(
    @InjectRepository(MissionEntity)
    private readonly missions: Repository<MissionEntity>,
    @InjectRepository(MissionTimesheetEntity)
    private readonly timesheets: Repository<MissionTimesheetEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    // Lecture SEULE, et l'entité seulement : le module Projets n'est pas
    // importé — la frontière §3.2 tient, comme pour le board à douze colonnes.
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    /**
     * #2191.17 / #2191.18 — LE BESOIN, pour reprendre son télétravail et son
     * lieu au handoff (`inheritNeedContext`). Lecture SEULE, même garde que
     * `projects` juste au-dessus : le module Projets n'est pas importé.
     */
    @InjectRepository(ProjectNeedEntity)
    private readonly needs: Repository<ProjectNeedEntity>,
    /**
     * La SOURCE du coût chargé — décision D43 du 28/08/2026.
     *
     * La marge se calculait sur `missions.daily_cost`, une colonne qu'aucun
     * écran n'écrit : c'est ici que le formulaire de la fiche enregistre le
     * coût, et donc ici qu'il faut le lire. L'entité est déjà déclarée dans
     * `DeliveryModule.forFeature` — un dépôt injecté sans être déclaré rend le
     * healthcheck rouge en laissant les tests verts (GA-20).
     */
    @InjectRepository(MissionCommercialTermsEntity)
    private readonly terms: Repository<MissionCommercialTermsEntity>,
    /**
     * #2562 — le cache des deals CRM, pour vérifier qu'un `crmDealId` désigné
     * à la création appartient bien à CET espace (jamais un rattachement
     * deviné au cache d'un autre espace). Lecture seule : ce service n'écrit
     * jamais dans `crm_deal_facts`, `CrmDepthService` en reste l'unique
     * écrivain.
     */
    @InjectRepository(CrmDealFactEntity)
    private readonly crmDealFacts: Repository<CrmDealFactEntity>,
    /**
     * #2560.6 — DÉCISION LOUIS 18/09/2026 : vérifier qu'un `consultantId`
     * désigné à la création appartient à CET espace, AVANT d'écrire quoi que
     * ce soit (GA-11/GA-12 : la vérification précède l'écriture). Lecture
     * seule, même garde que `crmDealFacts` juste au-dessus : ce module
     * n'écrit jamais dans `consultants`, le module Vivier en reste l'unique
     * écrivain (règle CLAUDE n°7).
     */
    @InjectRepository(ConsultantEntity)
    private readonly consultants: Repository<ConsultantEntity>,
    /**
     * #2339.7 — vérifier qu'un `submissionId` désigné à la création
     * appartient à CET espace, AVANT d'écrire quoi que ce soit (même garde
     * que `crmDealFacts`/`consultants` juste au-dessus). Lecture seule : ce
     * module n'écrit jamais dans `submissions`, `SubmissionsService` (module
     * Vivier) en reste l'unique écrivain (règle CLAUDE n°7).
     */
    @InjectRepository(SubmissionEntity)
    private readonly submissions: Repository<SubmissionEntity>,
    /**
     * #2560.6 — `StaffingService` vit dans CE module (`delivery.module.ts`) :
     * une injection directe, pas un port — GA-07 ne vise que l'import
     * service→service ENTRE modules. `create()` délègue l'ÉCRITURE de
     * l'affectation à `assign()`, qui reste l'unique écrivain de
     * `mission_assignments`, même garde (`assertConsultant`) qu'un
     * rattachement fait après coup par `PUT /delivery/missions/:id/assignments`.
     */
    private readonly staffing: StaffingService,
    private readonly workspaceContext: WorkspaceContextService,
    // #2320.1/#2339.7 — le journal APPEND-ONLY de la chaîne commerciale
    // (`CommercialTransitionsService.record`) : la mission en est le
    // QUATRIÈME sujet (`need`/`shortlist`/`submission`/`mission`), même geste
    // que `ProjectPipelineService.changeNeedStatus` et
    // `ShortlistService.create`.
    private readonly commercialTransitions: CommercialTransitionsService,
    /**
     * #2411.11 (reste, épopée #2881) — l'historique de résolution d'un risque
     * de mission, PAR DOSSIER (voir la migration `MissionRiskResolutions`).
     */
    @InjectRepository(MissionRiskResolutionEntity)
    private readonly riskResolutions: Repository<MissionRiskResolutionEntity>,
    /**
     * #2411.6 (reste, épopée #2881) — MÊME calcul que l'onglet Facturation
     * (`invoice_readiness.state`), lu ici pour ramener le signal « facture
     * bloquée » au niveau de la mission plutôt que de le recalculer une
     * seconde fois (GA-26). Injection directe : les deux services vivent
     * dans CE module (`delivery.module.ts`), même garde que `staffing`
     * juste au-dessus — GA-07 ne vise que l'import service→service ENTRE
     * modules.
     */
    private readonly invoiceReadiness: InvoiceReadinessService,
  ) {}

  /**
   * Les missions de l'espace, avec leur fenêtre de renouvellement, leur marge et
   * leurs risques — tous CALCULÉS à la lecture.
   *
   * Rien n'est stocké : une fenêtre « J-30 » écrite en base serait fausse le
   * lendemain, et un risque figé survivrait à sa résolution.
   */
  /**
   * Les missions de l'espace.
   *
   * ⚠️ `canReadFinance` est OBLIGATOIRE, et il n'a pas de valeur par défaut.
   *
   * La marge était décorée sans condition, et cette liste est servie par
   * `GET /delivery/missions` — une route sans permission déclarée — ET relayée
   * au copilote. Le taux de marge de chaque mission sortait donc à tout membre
   * de l'espace, y compris un `viewer` ou un `recruiter`, pendant que le même
   * dépôt la retire scrupuleusement partout ailleurs (le board, le vivier, le
   * matching passent tous un drapeau).
   *
   * Un défaut obligatoire plutôt qu'un `= false` : un appelant qui oublie le
   * drapeau doit être refusé par le compilateur, pas silencieusement servi.
   */
  async list(
    userId: string,
    options: {
      canReadFinance: boolean
      filters?: MissionListFilters
      scope?: MissionListScope
      clientStacks?: ClientStacksResolver
    },
  ): Promise<{
    missions: MissionView[]
    canReadFinance: boolean
    scope: FinanceScopeInfo
    /** #2194.7 / #2194.43 — voir la doc d'`intercontractCount`. */
    intercontractCount: number
  }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const { accountId, consultantId, id, businessUnitId, skill } = options.filters ?? {}
    // Défaut « l'espace », et ce défaut n'est pas une commodité : les deux
    // appelants d'avant — `GET /delivery/missions` sans paramètre et le pont du
    // copilote — lisent la liste de l'espace. Un défaut « own » aurait changé
    // leur réponse sans que personne ne l'ait décidé.
    const scope: MissionListScope = options.scope ?? { kind: 'workspace' }

    /**
     * Le filtre par CONSULTANT passe par les affectations : une mission ne
     * porte pas de colonne « consultant », c'est `mission_assignments` qui les
     * relie. Toutes les affectations comptent, terminées comprises — le lien
     * vient de « placé 4 fois », qui compte des missions DÉMARRÉES, pas des
     * missions en cours.
     *
     * ⚠️ `null` = on n'a pas de filtre par consultant. `[]` = ce consultant n'a
     * aucune mission, et la liste doit alors être VIDE — les confondre rendrait
     * toutes les missions de l'espace sous un lien qui en promet quelques-unes.
     */
    const missionIdsOfConsultant = consultantId === undefined ? null : await this.missionIdsOf(consultantId)
    // Le périmètre du LECTEUR, quand il l'a demandé. Il s'INTERSECTE avec le
    // filtre par consultant plutôt que de le remplacer : ouvrir « les missions
    // de ce consultant » depuis un cockpit restreint doit rendre celles qui sont
    // à la fois les siennes et les miennes. Remplacer élargirait l'une des deux
    // en silence, et c'est toujours l'élargissement qu'on ne remarque pas.
    const missionIdsInPortfolio =
      scope.kind === 'own' ? await this.missionIdsInPortfolio(workspaceId, scope.userId) : null
    /**
     * L'identité demandée est un TROISIÈME resserrement, et elle s'INTERSECTE
     * comme les deux autres — elle ne les remplace pas.
     *
     * Ouvrir le dossier d'une mission hors de son portefeuille depuis un
     * cockpit restreint doit rendre le même « introuvable » que d'ailleurs,
     * pas ouvrir une porte dérobée. C'est la même raison que l'intersection du
     * filtre par consultant juste au-dessus : « remplacer élargirait l'une des
     * deux en silence, et c'est toujours l'élargissement qu'on ne remarque
     * pas ».
     *
     * Et l'espace, lui, reste dans le `where` quoi qu'il arrive : ces trois
     * listes resserrent, aucune n'autorise.
     */
    // #2194.22 / #2194.26 — DEUX resserrements de plus, MÊME mécanique
    // d'intersection : la BU du compte porteur, et la compétence d'au moins
    // un affecté actif. Ni l'une ni l'autre n'est une colonne de `missions` —
    // voir `MissionListFilters.businessUnitId`/`.skill`.
    const missionIdsOfBusinessUnitFilter =
      businessUnitId === undefined ? null : await this.missionIdsOfBusinessUnit(workspaceId, businessUnitId)
    const missionIdsOfSkillFilter = skill === undefined ? null : await this.missionIdsOfSkill(workspaceId, skill)
    const restrictedIds = intersectIds(
      intersectIds(intersectIds(missionIdsOfConsultant, missionIdsInPortfolio), id === undefined ? null : [id]),
      intersectIds(missionIdsOfBusinessUnitFilter, missionIdsOfSkillFilter),
    )

    // ⚠️ Le périmètre voyage avec la réponse — même raison que `canReadFinance`
    // juste en dessous : depuis que la liste peut être restreinte, une liste
    // vide ne dit plus si c'est « tu n'as aucune mission » ou « rien ne t'est
    // rattaché ». Le second appelle un geste (réclamer son portefeuille) que le
    // premier n'appelle pas.
    const scopeInfo: FinanceScopeInfo = {
      kind: scope.kind,
      // Sur la portée « espace » la requête ne PART PAS : il n'y a rien hors
      // périmètre, et « 0 hors périmètre » en permanence est un bruit qui cesse
      // d'être lu. Chemin inchangé pour les deux appelants historiques.
      outsideAnyPortfolio: scope.kind === 'own' ? await this.missionsOutsideAnyPortfolio(workspaceId) : null,
    }

    // #2194.7 / #2194.43 — indépendant des trois resserrements ci-dessus : le
    // vivier entier, jamais borné par un filtre de MISSION.
    const intercontractCount = await this.intercontractCount(workspaceId)

    if (restrictedIds !== null && restrictedIds.length === 0) {
      return { canReadFinance: options.canReadFinance, missions: [], scope: scopeInfo, intercontractCount }
    }

    const missions = await this.missions.find({
      where: {
        // ⚠️ `workspace_id` D'ABORD, et il ne bouge pas : le filtre par
        // identité juste en dessous ouvre une lecture par un identifiant que
        // n'importe qui peut taper dans une URL. Un `where: { id }` seul est le
        // défaut d'isolation que ce dépôt nomme depuis des mois.
        workspace_id: workspaceId,
        // Le filtre est SERVEUR parce que le `take` ci-dessous est un PLAFOND
        // et non une page : filtrer 200 lignes déjà tronquées dans le
        // navigateur rendrait un sous-ensemble faux.
        ...(accountId === undefined ? {} : { account_id: accountId }),
        ...(restrictedIds === null ? {} : { id: In(restrictedIds) }),
      },
      // Les fins les plus proches d'abord : c'est l'ordre dans lequel un
      // responsable de compte lit sa liste.
      order: { ends_on: 'ASC', created_at: 'DESC' },
      take: 200,
    })
    const missionIds = missions.map(mission => mission.id)
    // #2195.8 — l'échelle de fenêtres de l'espace, lue UNE fois pour toute la
    // liste. Elle est volontairement HORS du `Promise.all` de droite : les
    // quatre lectures ci-dessous dépendent de `missionIds`, celle-ci ne dépend
    // que de l'espace.
    const renewalScale = await this.renewalWindowDaysOf(workspaceId)
    // Six lectures GROUPÉES et non six par ligne : sur deux cents
    // missions, une requête par mission rend l'écran inutilisable.
    const [
      byMission,
      accountsById,
      assigneesByMission,
      skillsByMission,
      commercialTerms,
      ownersById,
      managersByMission,
      opportunitiesById,
      submissionsById,
      clientManagersByMission,
      resolvedRisksByMission,
      invoiceBlockedMissionIds,
      receivableAlerts,
    ] = await Promise.all([
      this.timesheetsByMission(missionIds),
      this.accountsOf(workspaceId),
      this.assigneesByMission(missionIds),
      // #2194.26 — même portée que `assigneesByMission` juste au-dessus.
      this.skillsByMission(missionIds),
      // Le coût chargé et le bon de commande (#2408.18) ne sont lus QUE pour
      // qui a le droit d'en voir la marge : sans `finance:read` la requête ne
      // part pas, plutôt que de charger une donnée financière pour la jeter
      // juste après.
      options.canReadFinance
        ? this.commercialTermsByMission(missionIds)
        : Promise.resolve({
            costs: new Map<string, number>(),
            poInfo: new Map<
              string,
              {
                requiresPo: boolean
                poNumber: string | null
                noticeDays: number | null
                channel: string
                currency: string | null
              }
            >(),
          }),
      // #2195.13 — les porteurs, en un lot.
      this.ownersOf(missions.map(m => m.owner_id)),
      // #2195.12 — les managers des consultants affectés, en un lot.
      this.managersOf(missionIds),
      // #2930 — le libellé du besoin d'origine, en un lot.
      this.opportunitiesOf(
        workspaceId,
        missions.map(m => m.opportunity_id),
      ),
      // #2953 (#2193.48) — le libellé du positionnement d'origine, en un lot.
      this.submissionsOf(missions.map(m => m.submission_id)),
      // #2953 (#2193.6) — les managers client, en un lot.
      this.clientManagersOf(missions),
      // #2411.11 — les risques déjà marqués « traité », en un lot.
      this.resolvedRisksByMission(missions),
      // #2411.6 — même garde que les conditions commerciales juste au-dessus :
      // l'état de facturation est une donnée financière, lue seulement pour
      // qui a le droit de la voir.
      options.canReadFinance
        ? this.invoiceBlockedByMission(workspaceId, new Date())
        : Promise.resolve(new Set<string>()),
      // #2408 — factures échues / paiements en retard, par mission : même droit que la facturation bloquée.
      options.canReadFinance
        ? this.receivableAlertsOf(workspaceId, new Date())
        : Promise.resolve(new Map<string, ('invoice_overdue' | 'payment_late')[]>()),
    ])
    // #2414.34/.40 — la demande marché, PAR LOT, sur les consultants affectés
    // à CETTE liste seulement (jamais tout le vivier) : une requête de zones +
    // une requête de relevés, après que `assigneesByMission` a résolu qui est
    // affecté, jamais une lecture par mission.
    const assignedConsultantIds =
      assigneesByMission === null
        ? []
        : [...new Set([...assigneesByMission.values()].flatMap(list => list.map(assignee => assignee.id)))]
    // #2979 — HUIT lectures indépendantes (#2414.48, lot E09 08/10 : une huitième
    // s'ajoute), qui ne dépendent que des affectés et des missions déjà lus : elles
    // partent ENSEMBLE. Enchaînées, la latence de la liste était la somme des
    // allers-retours (mesure : spec `les lectures par lot partent ensemble`).
    // Chacune garde son repli propre : aucune ne fait tomber les autres.
    //  - demande marché (#2414.34/.40), rareté du profil (#2414.35), besoins ouverts (#2414.41/.42),
    //  - partenaires et relations du COMPTE client (#2414.44/.45), noms des BU posées par un TRANSFERT (#3413),
    //  - contraintes déclarées des affectés (#2414.37), mémoire marché du client × compétences (#2414.43),
    //  - historique de présentation RÉCENT des affectés, tous besoins confondus (#2414.48).
    const [
      demandByConsultant,
      scarcityByConsultant,
      openNeedsByConsultant,
      accountSignals,
      transferredBuNames,
      constraintsRead,
      marketMemoryByMission,
      presentationHistoryByConsultant,
      exceptionSignalsByMission,
    ] = await Promise.all([
      this.marketDemandByConsultant(assignedConsultantIds, userId, workspaceId),
      this.profileScarcityByConsultant(assignedConsultantIds, workspaceId),
      this.openNeedsByConsultant(assignedConsultantIds, workspaceId),
      this.accountRepositionSignals(
        [...new Set(missions.map(mission => mission.account_id).filter((id): id is string => Boolean(id)))],
        workspaceId,
      ),
      this.businessUnitNamesOf(
        workspaceId,
        missions.map(mission => mission.business_unit_id).filter((id): id is string => Boolean(id)),
      ),
      this.constraintsByConsultant(assignedConsultantIds, workspaceId),
      this.marketMemoryByMission(
        missions,
        assigneesByMission,
        assignedConsultantIds,
        accountsById,
        options.clientStacks,
      ),
      this.presentationHistoryByConsultant(assignedConsultantIds, workspaceId),
      // #2408.3/.16/.17/.20/.21/.40 — les signaux des exceptions L15, en lots.
      this.exceptionSignalsOf(workspaceId, missions, assigneesByMission),
    ])
    const { signals: constraintsByConsultant, declared: declaredConstraints } = constraintsRead
    return {
      // Le DROIT voyage avec la réponse. Depuis que `marginPercent` vaut `null`
      // au lieu de disparaître (D45), la forme du champ ne dit plus si c'est
      // « pas le droit » ou « pas mesuré » — sans ce drapeau, l'écran ne peut
      // plus les dire différemment. Même patron que `GET …/missions/:id/terms`.
      canReadFinance: options.canReadFinance,
      // ⚠️ `scope` et `canReadFinance` répondent à DEUX questions distinctes et
      // ne se remplacent jamais : « quelles missions ai-je le droit de voir »
      // n'est pas « quelles missions sont les miennes ». Un commercial sans
      // `finance:read` sur sa propre liste lit `marginForbidden` ; le même sur
      // une liste vide et restreinte lit « rien ne t'est rattaché ».
      scope: scopeInfo,
      // #2194.7 / #2194.43 — le vivier entier, jamais borné par les filtres
      // de MISSION ci-dessus (voir la doc d'`intercontractCount`).
      intercontractCount,
      missions: missions.map(mission =>
        this.decorate(mission, byMission.get(mission.id) ?? [], options.canReadFinance, {
          // #2195.8 — l'échelle est lue UNE fois pour toute la liste, jamais
          // une requête par ligne : c'est un réglage d'espace, pas une
          // propriété de mission.
          renewalWindowDays: renewalScale,
          loadedDailyCostCents: commercialTerms.costs.get(mission.id) ?? null,
          // #2408.18 — `undefined` côté lookups quand la mission n'a aucune
          // ligne de conditions commerciales : `missionRisks()` lit alors
          // `requiresPo` comme `false`, jamais un PO manquant inventé.
          requiresPo: commercialTerms.poInfo.get(mission.id)?.requiresPo,
          poNumber: commercialTerms.poInfo.get(mission.id)?.poNumber,
          // #2413.2, .25, .28 — même lecture, même garde que `poNumber` : le
          // préavis n'est chargé que pour qui a `finance:read` (les conditions
          // commerciales ne se lisent pas autrement dans cette liste).
          noticePeriodDays: commercialTerms.poInfo.get(mission.id)?.noticeDays,
          // #2408.52, #2408.62 — même lecture, même porte que `poNumber` :
          // absent sans `finance:read`, ou quand la mission n'a aucune ligne de
          // conditions commerciales, jamais un canal deviné à « direct ».
          channel: commercialTerms.poInfo.get(mission.id)?.channel,
          // #2408.53 — même lecture, même porte : `undefined` sans
          // `finance:read` ou sans ligne de conditions commerciales ; `null`
          // (et non `undefined`) quand la ligne existe mais que la devise
          // n'est pas renseignée — les deux absences ne disent pas la même
          // chose (voir `MissionView.currency`).
          currency: commercialTerms.poInfo.get(mission.id)?.currency,
          // `?? null` et non `?? ''` : une chaîne vide s'afficherait comme une
          // cellule blanche, que personne ne distingue d'un nom manquant.
          accountName: accountsById.get(mission.account_id)?.name ?? null,
          accountLogoUrl: accountsById.get(mission.account_id)?.logoUrl ?? null,
          accountWebsite: accountsById.get(mission.account_id)?.website ?? null,
          // #2194.22 — même lookup qu'`accountName` juste au-dessus : la BU du
          // COMPTE… tant qu'aucun TRANSFERT n'a posé la BU propre de la mission
          // (#3413, `missions.business_unit_id`) — qui prime alors.
          businessUnitId: mission.business_unit_id ?? accountsById.get(mission.account_id)?.businessUnitId ?? null,
          businessUnitName: mission.business_unit_id
            ? (transferredBuNames.get(mission.business_unit_id) ?? null)
            : (accountsById.get(mission.account_id)?.businessUnitName ?? null),
          // #2195.13 — `?? null` : aucun porteur, ou lecture illisible, disent
          // la même chose à l'écran.
          ownerName: mission.owner_id ? (ownersById.get(mission.owner_id) ?? null) : null,
          // #2195.12 — `?? null` : aucun consultant affecté n'a de manager, ou
          // lecture illisible, disent la même chose à l'écran — jamais deviné.
          managerName: managersByMission.get(mission.id) ?? null,
          // #2953 (#2193.6 / .59) — `?? null` : non désigné, contact d'un
          // autre compte, ou lecture illisible disent la même chose à
          // l'écran. L'id voyage AVEC le nom (même entrée de map).
          clientManagerName: clientManagersByMission.get(mission.id)?.name ?? null,
          clientManagerContactId: clientManagersByMission.get(mission.id)?.contactId ?? null,
          // #2930 — `?? null` : aucun besoin lié, besoin introuvable, ou
          // lecture illisible disent la même chose à l'écran, jamais un UUID.
          opportunityLabel: mission.opportunity_id ? (opportunitiesById.get(mission.opportunity_id) ?? null) : null,
          // #2953 (#2193.48) — même repli qu'`opportunityLabel` juste au-dessus.
          submissionLabel: mission.submission_id ? (submissionsById.get(mission.submission_id) ?? null) : null,
          // La panne se propage TELLE QUELLE : `null` partout quand la lecture
          // a échoué, jamais un `[]` qui se lirait « personne d'affecté ».
          assignees: assigneesByMission === null ? null : (assigneesByMission.get(mission.id) ?? []),
          // #2414.34/.40 — `undefined` quand la lecture des affectés a échoué
          // (même garde que `assignees` juste au-dessus) : ne biaise jamais
          // le déclencheur, plutôt que de rendre « non mesuré » une mission
          // dont on ne sait même pas qui est affecté.
          marketDemand:
            assigneesByMission === null
              ? undefined
              : DeliveryService.summariseMarketDemand(
                  (assigneesByMission.get(mission.id) ?? []).map(assignee => assignee.id),
                  demandByConsultant,
                ),
          // #2414.35 — `undefined` quand la lecture des affectés a échoué,
          // même garde que `marketDemand` juste au-dessus.
          profileScarcity:
            assigneesByMission === null
              ? undefined
              : DeliveryService.summariseProfileScarcity(
                  (assigneesByMission.get(mission.id) ?? []).map(assignee => assignee.id),
                  scarcityByConsultant,
                ),
          // #2414.41/.42 — `undefined` quand les affectés sont illisibles.
          openNeeds:
            assigneesByMission === null
              ? undefined
              : DeliveryService.summariseOpenNeeds(
                  (assigneesByMission.get(mission.id) ?? []).map(assignee => assignee.id),
                  openNeedsByConsultant,
                ),
          // #2414.44/.45 — signaux du compte client ; `undefined` sans compte (jamais « aucun partenaire »).
          partners: mission.account_id ? accountSignals.get(mission.account_id)?.partners : undefined,
          relations: mission.account_id ? accountSignals.get(mission.account_id)?.relations : undefined,
          // #2414.37 — `undefined` quand les affectés sont illisibles.
          constraints:
            assigneesByMission === null
              ? undefined
              : DeliveryService.summariseConsultantSignal(
                  (assigneesByMission.get(mission.id) ?? []).map(assignee => assignee.id),
                  constraintsByConsultant,
                ),
          // #2986 — le TEXTE des contraintes déclarées des affectés de cette mission.
          constraintDetails: (assigneesByMission?.get(mission.id) ?? []).flatMap(assignee =>
            (declaredConstraints.get(assignee.id) ?? []).map(constraint => ({
              consultantName: assignee.fullName,
              ...constraint,
            })),
          ),
          // #2414.43 — `undefined` sans résolveur (appelant qui ne lit pas la mémoire marché).
          marketMemory: marketMemoryByMission.get(mission.id),
          // #2414.48 — `undefined` quand les affectés sont illisibles, même garde que `constraints`.
          presentationHistory:
            assigneesByMission === null
              ? undefined
              : DeliveryService.summariseConsultantSignal(
                  (assigneesByMission.get(mission.id) ?? []).map(assignee => assignee.id),
                  presentationHistoryByConsultant,
                ),
          // #2194.26 — même distinction `null`/`[]` qu'`assignees` juste au-dessus.
          assignedSkills: skillsByMission === null ? null : (skillsByMission.get(mission.id) ?? []),
          // #2411.11 — les risques marqués « traité » depuis le dernier
          // changement matériel, jamais lus sur les chemins d'écriture
          // (`create`/`updateStatus`) : `decorate()` y reçoit `undefined`,
          // qui ne filtre rien — même garde que `requiresPo`/`owner_id`.
          resolvedRisks: resolvedRisksByMission.get(mission.id),
          // #2411.6 — `undefined` sans `finance:read` (la lecture ne part
          // même pas, même garde que `requiresPo`/`poNumber` juste au-dessus) ;
          // sinon un booléen MESURÉ, jamais deviné.
          invoiceBlocked: options.canReadFinance ? invoiceBlockedMissionIds.has(mission.id) : undefined,
          // #2408.3/.16/.17/.20/.21/.40 — `undefined` quand la lecture a échoué : tout reste muet.
          exceptionSignals: exceptionSignalsByMission.get(mission.id),
          // #2408 — le badge de facturation de la ligne : `undefined` sans `finance:read`, jamais deviné.
          billingAlert: options.canReadFinance
            ? missionBillingAlert({
                blocked: invoiceBlockedMissionIds.has(mission.id),
                receivables: receivableAlerts.get(mission.id) ?? [],
              })
            : undefined,
        }),
      ),
    }
  }

  /**
   * Les missions sur lesquelles ce consultant a été affecté, un jour.
   *
   * Une lecture en échec rend un tableau VIDE, ce qui rend la liste vide : le
   * lien de source promet « les missions de ce consultant », et servir tout
   * l'espace parce qu'une jointure a échoué serait exactement le mensonge que
   * §4.4 interdit. Un écran vide se répare ; un écran trop plein se croit.
   */
  /**
   * Les missions du PORTEFEUILLE du lecteur : celles qu'il porte, et celles des
   * comptes qui lui sont attribués.
   *
   * La condition vient de `financeScopeClause` et n'est PAS recopiée ici : elle
   * est la seule définition de « mon périmètre » du dépôt, et une portée trop
   * large recopiée de travers rend simplement une liste plus longue, qui a l'air
   * juste.
   *
   * ⚠️ AUCUN try/catch, contrairement à `missionIdsOf` juste en dessous, et la
   * différence est délibérée : là-bas, un tableau vide rend une liste vide sous
   * un lien qui promettait quelques missions — c'est réparable et ça se voit.
   * Ici, un tableau vide écrirait « tu n'as aucune mission en cours » sur le
   * cockpit de quelqu'un qui en a douze. Une lecture en échec doit faire échouer
   * le bloc : « les missions n'ont pas pu être chargées » est vrai, « aucune » ne
   * l'est pas.
   */
  private async missionIdsInPortfolio(workspaceId: string, userId: string): Promise<string[]> {
    const own = financeScopeClause({ kind: 'own', workspaceId, userId }, 'm', 2)
    const rows = await this.missions.manager.query<{ id: string }[]>(
      `SELECT m.id FROM missions m WHERE m.workspace_id = $1${own.sql}`,
      [workspaceId, ...own.params],
    )
    return (rows ?? []).map(row => row.id)
  }

  /**
   * Combien de missions ne sont dans le périmètre de PERSONNE.
   *
   * Le SQL vient du contrat (`UNASSIGNED_MISSIONS_SQL`) : c'est le même nombre
   * que servent les six lectures financières, et le recalculer ici en ferait un
   * septième énoncé à tenir en phase.
   */
  private async missionsOutsideAnyPortfolio(workspaceId: string): Promise<number> {
    const rows = await this.missions.manager.query<{ count: string }[]>(UNASSIGNED_MISSIONS_SQL, [workspaceId])
    return Number(rows?.[0]?.count ?? 0)
  }

  /** #3226 — la capacité de delivery de l'espace, telle que l'écran la compte. */
  async capacity(workspaceId: string): Promise<{ intercontractCount: number }> {
    return { intercontractCount: await this.intercontractCount(workspaceId) }
  }

  /**
   * #2194.7 / #2194.43 — LE VIVIER COMPLET, CROISÉ AU PLANNING.
   *
   * `planning-conflicts.ts` (web) calcule ses conflits à partir des MISSIONS,
   * jamais du vivier — son propre commentaire (ligne ~24) nomme l'intercontrat
   * GÉNÉRAL comme hors périmètre : un consultant sans AUCUNE mission active
   * n'apparaît dans aucune structure construite à partir des missions
   * affichées. Ce compte-ci répond à la question que le Gantt ne pouvait pas
   * poser : combien de personnes du vivier sont, EN CE MOMENT, entre deux
   * missions.
   *
   * ⚠️ MÊME DÉFINITION que `deriveStaffing` (`@bellum/contracts`,
   * `availability === 'available'`), traduite en SQL plutôt que recalculée en
   * JS sur un vivier paginé (`GET /talents`, capé à 100 lignes — voir sa
   * propre doc) : Planning a besoin du compte VRAI, pas d'une page. Si
   * `deriveStaffing` change de définition, CETTE requête doit suivre — deux
   * traductions de la même règle qui divergent est le défaut que GA-26 existe
   * pour nommer.
   *
   * ⚠️ Un consultant SANS LA MOINDRE affectation n'est PAS en intercontrat —
   * il n'a jamais été staffé, ce qui est une question différente (même refus
   * que `deriveStaffing` : `assignments.length === 0` ⇒ `'unknown'`, jamais
   * `'available'`). Le `EXISTS` ci-dessous l'exige explicitement.
   *
   * `archived_at IS NULL` : le vivier ACTIF seulement — une fiche archivée ne
   * compte pas comme « libre », elle est sortie du vivier.
   */
  private async intercontractCount(workspaceId: string): Promise<number> {
    const rows = await this.consultants.manager.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count
         FROM consultants c
        WHERE c.workspace_id = $1::uuid
          AND c.archived_at IS NULL
          AND EXISTS (SELECT 1 FROM mission_assignments ma WHERE ma.consultant_id = c.id)
          AND NOT EXISTS (
            SELECT 1 FROM mission_assignments ma2
             WHERE ma2.consultant_id = c.id
               AND ma2.starts_on <= CURRENT_DATE
               AND (ma2.ends_on IS NULL OR ma2.ends_on >= CURRENT_DATE)
          )`,
      [workspaceId],
    )
    return Number(rows?.[0]?.count ?? 0)
  }

  private async missionIdsOf(consultantId: string): Promise<string[]> {
    try {
      const rows = await this.missions.manager.query<{ mission_id: string }[]>(
        `SELECT DISTINCT ma.mission_id FROM mission_assignments ma WHERE ma.consultant_id = $1::uuid`,
        [consultantId],
      )
      return (rows ?? []).map(row => row.mission_id)
    } catch (error) {
      this.logger.error('Affectations illisibles pour le filtre par consultant', { error })
      return []
    }
  }

  /**
   * #2194.22 — les missions dont le COMPTE porteur appartient à cette BU.
   *
   * `WHERE m.workspace_id = $1` D'ABORD, même raison que le `where` principal
   * de `list()` : un `business_unit_id` seul n'isole rien entre espaces, deux
   * espaces pourraient en partager un par coïncidence d'UUID généré ailleurs.
   */
  private async missionIdsOfBusinessUnit(workspaceId: string, businessUnitId: string): Promise<string[]> {
    try {
      const rows = await this.missions.manager.query<{ id: string }[]>(
        `SELECT m.id
           FROM missions m
           JOIN accounts a ON a.id = m.account_id
          WHERE m.workspace_id = $1::uuid AND COALESCE(m.business_unit_id, a.business_unit_id) = $2::uuid`,
        [workspaceId, businessUnitId],
      )
      return (rows ?? []).map(row => row.id)
    } catch (error) {
      this.logger.error('Comptes illisibles pour le filtre par BU', { error })
      return []
    }
  }

  /**
   * #2194.26 — les missions qu'au moins un affecté ACTIF porte cette
   * compétence canonique. Même filtre `ASSIGNMENT_STILL_RUNNING` que
   * `assigneesByMission` : une compétence lue sur une affectation déjà
   * terminée décrirait qui a été là, pas qui répond au filtre aujourd'hui.
   */
  private async missionIdsOfSkill(workspaceId: string, skill: string): Promise<string[]> {
    try {
      const rows = await this.missions.manager.query<{ mission_id: string }[]>(
        `SELECT DISTINCT ma.mission_id
           FROM mission_assignments ma
           JOIN consultant_skills cs ON cs.consultant_id = ma.consultant_id
          WHERE ma.workspace_id = $1::uuid AND cs.skill = $2 AND ${ASSIGNMENT_STILL_RUNNING}`,
        [workspaceId, skill],
      )
      return (rows ?? []).map(row => row.mission_id)
    } catch (error) {
      this.logger.error('Compétences illisibles pour le filtre par compétence', { error })
      return []
    }
  }

  /**
   * Les noms des comptes de l'espace, en une requête.
   *
   * Volontairement SANS try/catch, contrairement aux affectations : le nom du
   * compte n'est pas une décoration, c'est l'identité de la ligne. Une table
   * `accounts` illisible doit faire échouer la lecture — l'écran dit alors
   * « les missions n'ont pas pu être chargées », ce qui est vrai — plutôt que
   * de rendre deux cents missions anonymes qui se liraient « aucun compte
   * renseigné ».
   */
  private async accountsOf(workspaceId: string): Promise<Map<string, AccountLookup>> {
    const rows = await this.accounts.find({
      where: { workspace_id: workspaceId },
      // ⚠️ Élargi le 03/09 : `logo_url` et `website` manquaient, et c'est tout
      // ce qui séparait la liste des missions des logos déjà rendus sur
      // `/accounts`. Une colonne non SÉLECTIONNÉE ne voyage pas, et le
      // composant qui l'attend rend son repli sans rien signaler.
      // #2194.22 — `business_unit_id` s'ajoute : l'IDENTIFIANT voyage avec le
      // reste de la ligne, fatal comme elle si la table est illisible. SON
      // NOM, lui, est une décoration séparée (voir `businessUnitNamesOf`
      // ci-dessous) : une table `business_units` illisible ne doit pas faire
      // échouer toute la liste des missions pour un filtre secondaire.
      select: ['id', 'company_name', 'logo_url', 'website', 'business_unit_id'],
    })
    const businessUnitNames = await this.businessUnitNamesOf(
      workspaceId,
      rows.map(row => row.business_unit_id).filter((id): id is string => id !== null),
    )
    return new Map(
      (rows ?? []).map(row => [
        row.id,
        // `?? null` et jamais `?? ''` : une chaîne vide passerait le test de
        // présence côté écran et rendrait une image cassée, là où `null`
        // retombe proprement sur l'initiale.
        {
          name: row.company_name,
          logoUrl: row.logo_url ?? null,
          website: row.website ?? null,
          businessUnitId: row.business_unit_id ?? null,
          businessUnitName: row.business_unit_id ? (businessUnitNames.get(row.business_unit_id) ?? null) : null,
        },
      ]),
    )
  }

  /**
   * #2194.22 — les NOMS des BU citées, en une requête — sur le modèle
   * d'`ownersOf` juste en dessous : DÉCORATIF, donc AVEC try/catch, sur une
   * table `business_units` que ce module n'importe pas (lecture seule, même
   * garde que `consultants`/`projects` plus haut).
   */
  private async businessUnitNamesOf(
    workspaceId: string,
    businessUnitIds: readonly string[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(businessUnitIds)]
    if (ids.length === 0) return new Map()
    try {
      const rows = await this.accounts.manager.query<{ id: string; name: string }[]>(
        `SELECT id, name FROM business_units WHERE workspace_id = $1::uuid AND id = ANY($2::uuid[])`,
        [workspaceId, ids],
      )
      return new Map((rows ?? []).map(row => [row.id, row.name]))
    } catch (error) {
      this.logger.error('BU illisibles pour la décoration des comptes', { error })
      return new Map()
    }
  }

  /**
   * Les noms des PORTEURS (`owner_id`) de l'espace, en une requête — #2195.13.
   *
   * `staffing.service.ts:readContacts` sait déjà résoudre un `owner_id`
   * UNIQUE, pour le tiroir de contacts d'UNE mission. La liste en demande une
   * version GROUPÉE, sur le modèle d'`accountsOf` — sinon deux cents lignes
   * feraient deux cents requêtes.
   *
   * ⚠️ AVEC try/catch, contrairement à `accountsOf` : le nom du porteur est
   * une DÉCORATION (comme les affectations), pas l'identité de la ligne — une
   * table `profiles` illisible ne doit pas faire échouer toute la liste des
   * missions, elle doit juste laisser la colonne « Owner » vide.
   */
  private async ownersOf(ownerIds: readonly (string | null)[]): Promise<Map<string, string>> {
    const ids = [...new Set(ownerIds.filter((id): id is string => Boolean(id)))]
    if (ids.length === 0) return new Map()
    try {
      const rows = await this.missions.manager.query<
        { user_id: string; first_name: string | null; last_name: string | null; email: string | null }[]
      >(`SELECT user_id, first_name, last_name, email FROM profiles WHERE user_id = ANY($1::uuid[])`, [ids])
      return new Map(
        (rows ?? []).flatMap(row => {
          const name = ownerDisplayName(row.first_name, row.last_name, row.email)
          return name ? ([[row.user_id, name]] as const) : []
        }),
      )
    } catch (error) {
      this.logger.error('Porteurs de mission illisibles', { error })
      return new Map()
    }
  }

  /**
   * Le nom du/des MANAGER(S) des consultants affectés à chaque mission,
   * en une requête — #2195.12.
   *
   * `ConsultantsService.managerNamesOf` sait déjà résoudre le manager d'UN lot
   * de FICHES (la fiche d'un consultant porte `manager_id`) ; la liste des
   * missions demande deux sauts de plus : mission → `mission_assignments` →
   * `consultants.manager_id` → `consultants.full_name`. Sur le modèle
   * d'`ownersOf` juste au-dessus, une requête GROUPÉE, jamais une par ligne.
   *
   * Une mission peut porter plusieurs consultants encore affectés, avec des
   * managers DISTINCTS : les deux noms s'affichent, triés, séparés par une
   * virgule — jamais un seul choisi en silence, ce qui serait deviner.
   *
   * ⚠️ AVEC try/catch, comme `ownersOf` : le manager est une DÉCORATION, pas
   * l'identité de la ligne — une table `consultants` illisible ne doit pas
   * faire échouer toute la liste des missions, elle doit juste laisser la
   * colonne « Manager » vide (« non renseigné », jamais un nom deviné).
   */
  private async managersOf(missionIds: string[]): Promise<Map<string, string>> {
    if (missionIds.length === 0) return new Map()
    try {
      const rows = await this.missions.manager.query<{ mission_id: string; manager_name: string | null }[]>(
        `SELECT DISTINCT ma.mission_id, m.full_name AS manager_name
           FROM mission_assignments ma
           JOIN consultants c ON c.id = ma.consultant_id
           JOIN consultants m ON m.id = c.manager_id
          WHERE ma.mission_id = ANY($1::uuid[])
            AND ${ASSIGNMENT_STILL_RUNNING}
          ORDER BY ma.mission_id, manager_name`,
        [missionIds],
      )
      const grouped = new Map<string, string[]>()
      for (const row of rows ?? []) {
        if (!row.manager_name) continue
        const names = grouped.get(row.mission_id) ?? []
        names.push(row.manager_name)
        grouped.set(row.mission_id, names)
      }
      // Trié en CODE, pas seulement en SQL : deux consultants affectés au même
      // instant peuvent revenir dans n'importe quel ordre selon le plan de la
      // base — un ordre stable est ce qui empêche « Paul Martin, Awa Diallo »
      // de devenir « Awa Diallo, Paul Martin » d'une lecture à l'autre.
      return new Map([...grouped].map(([missionId, names]) => [missionId, [...new Set(names)].sort().join(', ')]))
    } catch (error) {
      this.logger.error('Managers de mission illisibles', { error })
      return new Map()
    }
  }

  /**
   * #2953 (#2193.6) — le nom du MANAGER CLIENT, par mission, en un lot.
   *
   * Même patron qu'`account-missions.service.ts:clientManagersOf` (#2836),
   * mais SANS `accountId` unique en paramètre : cette liste couvre TOUT
   * l'espace, pas un seul compte. La garde d'appartenance se fait donc en
   * CODE, mission par mission — un contact du compte A ne peut jamais
   * décorer une mission du compte B, même si son id a fui d'une manière ou
   * d'une autre dans la colonne.
   *
   * ⚠️ AVEC try/catch, comme `managersOf`/`opportunitiesOf` : c'est une
   * DÉCORATION, pas l'identité de la ligne.
   */
  private async clientManagersOf(missions: MissionEntity[]): Promise<Map<string, { name: string; contactId: string }>> {
    const contactIds = [
      ...new Set(missions.map(mission => mission.client_manager_contact_id).filter((id): id is string => Boolean(id))),
    ]
    if (contactIds.length === 0) return new Map()
    try {
      const rows = await this.missions.manager.query<{ id: string; account_id: string; full_name: string | null }[]>(
        `SELECT id, account_id, full_name FROM contacts WHERE id = ANY($1::uuid[])`,
        [contactIds],
      )
      const contactById = new Map((rows ?? []).map(row => [row.id, row]))
      // #2193.59 — l'ID voyage AVEC le nom, jamais séparément : un lien vers
      // une fiche que le nom n'a pas confirmée (compte différent, contact
      // disparu) pointerait vers la mauvaise personne.
      const byMission = new Map<string, { name: string; contactId: string }>()
      for (const mission of missions) {
        if (!mission.client_manager_contact_id) continue
        const contact = contactById.get(mission.client_manager_contact_id)
        const name = contact?.full_name?.trim()
        if (name && contact?.account_id === mission.account_id) {
          byMission.set(mission.id, { name, contactId: mission.client_manager_contact_id })
        }
      }
      return byMission
    } catch (error) {
      this.logger.error('Managers client de mission illisibles', { error })
      return new Map()
    }
  }

  /**
   * #2411.11 (reste, épopée #2881) — les risques RÉSOLUS de ces missions, en
   * un lot — sur le modèle d'`ownersOf`/`managersOf` juste au-dessus.
   *
   * « Sans changement matériel » (voir la migration `MissionRiskResolutions`) :
   * une résolution dont `mission_updated_at_snapshot` est ANTÉRIEUR à
   * `missions.updated_at` ACTUEL est ignorée ici — la mission a bougé depuis
   * le geste, la fenêtre se referme. Rien n'est écrit pour l'effacer (« on
   * archive, on ne supprime pas ») : la ligne reste, seule la LECTURE cesse de
   * la compter.
   *
   * ⚠️ AVEC try/catch, comme `ownersOf`/`managersOf` : une résolution est une
   * DÉCORATION, pas l'identité de la ligne — une table illisible ne doit
   * jamais faire échouer toute la liste des missions, elle doit juste laisser
   * réapparaître un risque qu'on croyait traité (fail SAFE, jamais un risque
   * masqué à tort).
   */
  private async resolvedRisksByMission(
    missions: readonly Pick<MissionEntity, 'id' | 'updated_at'>[],
  ): Promise<Map<string, Set<MissionRisk>>> {
    if (missions.length === 0) return new Map()
    try {
      const rows = await this.riskResolutions.find({
        where: { mission_id: In(missions.map(mission => mission.id)), resolved_at: Not(IsNull()) },
      })
      const updatedAtById = new Map(missions.map(mission => [mission.id, mission.updated_at]))
      const grouped = new Map<string, Set<MissionRisk>>()
      for (const row of rows) {
        const currentUpdatedAt = updatedAtById.get(row.mission_id)
        if (!currentUpdatedAt || currentUpdatedAt.getTime() > row.mission_updated_at_snapshot.getTime()) continue
        const set = grouped.get(row.mission_id) ?? new Set<MissionRisk>()
        set.add(row.risk)
        grouped.set(row.mission_id, set)
      }
      return grouped
    } catch (error) {
      this.logger.error('Résolutions de risque de mission illisibles', { error })
      return new Map()
    }
  }

  /**
   * #2411.11 (reste, épopée #2881) — « Marquer comme traité » / « Ré-ouvrir »
   * un risque déjà CALCULÉ. `upsert` sur la clé composite `(mission_id, risk)` :
   * un second geste sur le même risque rafraîchit la même ligne, jamais une
   * seconde (même patron que `ReverseMarketDismissalService`).
   */
  async setMissionRiskResolution(
    userId: string,
    missionId: string,
    riskParam: string,
    input: SetMissionRiskResolutionRequest,
    now: Date = new Date(),
  ): Promise<MissionView> {
    // Le paramètre de route DÉSIGNE un risque, il ne le crée pas — la seule
    // énumération valide reste `missionRiskSchema` (contrat), jamais recopiée
    // dans un pipe de route qui pourrait diverger d'elle.
    const parsedRisk = missionRiskSchema.safeParse(riskParam)
    if (!parsedRisk.success) throw new BadRequestException(`Risque de mission inconnu : ${riskParam}`)
    const risk = parsedRisk.data

    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const mission = await this.missions.findOne({ where: { id: missionId, workspace_id: workspaceId } })
    if (!mission) throw new NotFoundException('Cette mission est introuvable dans votre espace de travail.')

    await this.riskResolutions.upsert(
      {
        workspace_id: workspaceId,
        mission_id: missionId,
        risk,
        resolved_at: input.resolved ? now : null,
        resolved_by: input.resolved ? userId : null,
        // Capturé QUE `resolved`, ou ré-ouvert : ré-ouvrir remet la fenêtre à
        // zéro elle aussi, sinon une résolution plus ancienne ré-appliquée par
        // erreur regarderait un instantané périmé.
        mission_updated_at_snapshot: mission.updated_at,
      },
      ['mission_id', 'risk'],
    )

    // Comme `setRenewalStatus` : ni relevés ni coût chargé relus, `false` =
    // « pas lu » et jamais « pas de marge ». L'écran recharge la liste derrière
    // — c'est ELLE qui applique le filtre de résolution (`resolvedRisksByMission`).
    return this.decorate(mission, [], false)
  }

  /**
   * Le libellé du BESOIN D'ORIGINE (`opportunity_id`), en une requête — #2930
   * (point couvert #2191.38).
   *
   * `MissionDetailTabs.tsx` refusait ce lien à l'écran, faute de donnée
   * ATTEIGNABLE depuis une mission : « un identifiant nu, sans libellé ». Ce
   * n'était pas un choix produit — le service ne rendait tout simplement pas
   * le nom de l'affaire (`opportunities.label`, `ProjectEntity`). Même patron
   * qu'`ownersOf`/`managersOf` juste au-dessus : une requête GROUPÉE, jamais
   * une par ligne.
   *
   * ⚠️ AVEC try/catch, comme `ownersOf` : le libellé du besoin est une
   * DÉCORATION, pas l'identité de la ligne — une table `opportunities`
   * illisible ne doit pas faire échouer toute la liste des missions, elle
   * doit juste laisser la ligne « Besoin d'origine » vide.
   */
  private async opportunitiesOf(
    workspaceId: string,
    opportunityIds: readonly (string | null)[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(opportunityIds.filter((id): id is string => Boolean(id)))]
    if (ids.length === 0) return new Map()
    try {
      // #4559 — le filtre d'espace est DANS la requête : une affaire d'un autre
      // espace (donnée antérieure à la garde d'écriture) reste sans libellé.
      const rows = await this.projects.find({
        where: { id: In(ids), workspace_id: workspaceId },
        select: ['id', 'label'],
      })
      return new Map((rows ?? []).map(row => [row.id, row.label]))
    } catch (error) {
      this.logger.error('Besoins d’origine illisibles', { error })
      return new Map()
    }
  }

  /**
   * #2953 (#2193.48) — le libellé du POSITIONNEMENT D'ORIGINE (`submission_id`),
   * en une requête, même patron qu'`opportunitiesOf` juste au-dessus.
   *
   * `MissionDetailTabs.tsx` n'avait aucun libellé ATTEIGNABLE pour ce lien :
   * `submission_id` (écrit à la création, #2339.7) n'était même pas rendu par
   * l'API. Une soumission n'a pas de libellé propre — celui affiché est
   * "consultant → besoin", les deux DÉJÀ lus par `ownersOf`-style lookups
   * (`consultants`, `projects`), jamais une troisième source.
   *
   * ⚠️ AVEC try/catch, comme `opportunitiesOf` : une décoration, pas
   * l'identité de la ligne.
   */
  private async submissionsOf(submissionIds: readonly (string | null)[]): Promise<Map<string, string>> {
    const ids = [...new Set(submissionIds.filter((id): id is string => Boolean(id)))]
    if (ids.length === 0) return new Map()
    try {
      const rows = await this.submissions.find({
        where: { id: In(ids) },
        select: ['id', 'consultant_id', 'project_id'],
      })
      if (rows.length === 0) return new Map()
      const consultantIds = [...new Set(rows.map(row => row.consultant_id))]
      const projectIds = [...new Set(rows.map(row => row.project_id))]
      const [consultantRows, projectRows] = await Promise.all([
        this.consultants.find({ where: { id: In(consultantIds) }, select: ['id', 'full_name'] }),
        this.projects.find({ where: { id: In(projectIds) }, select: ['id', 'label'] }),
      ])
      const consultantById = new Map(consultantRows.map(row => [row.id, row.full_name]))
      const projectById = new Map(projectRows.map(row => [row.id, row.label]))
      const byId = new Map<string, string>()
      for (const row of rows) {
        const label = [consultantById.get(row.consultant_id), projectById.get(row.project_id)]
          .filter((part): part is string => Boolean(part))
          .join(' → ')
        if (label) byId.set(row.id, label)
      }
      return byId
    } catch (error) {
      this.logger.error('Positionnements d’origine illisibles', { error })
      return new Map()
    }
  }

  /**
   * Le coût CHARGÉ et le bon de commande de chaque mission — une requête, pas
   * N, pas deux.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CETTE TABLE ET PAS `missions.daily_cost` (D43 · 28/08/2026)
   * ─────────────────────────────────────────────────────────────────────────
   * Parce que c'est la seule que l'application alimente. Le formulaire de la
   * fiche écrit `mission_commercial_terms.loaded_daily_cost_cents` ; aucun
   * écran, aucun semis et aucun appelant interne n'écrit `missions.daily_cost`.
   * Tant que la marge se calculait dessus, la liste aurait dit « coût chargé
   * non renseigné » sur des missions dont la fiche affichait 32 %.
   *
   * ⚠️ `bigint` revient en CHAÎNE depuis pg, et `Number('')` vaut `0` — soit
   * « 100 % de marge » sur une valeur illisible. Une chaîne vide, un `NaN` ou
   * un négatif valent donc « on ne sait pas » et sortent de la table de coût :
   * c'est la règle de tout le module, `null` n'est jamais `0`.
   *
   * #2408.18 — `requiresPo`/`poNumber` viennent de la MÊME ligne, mais un coût
   * illisible sur une ligne ne doit pas faire disparaître son PO par ailleurs
   * lisible : les deux valeurs sont posées INDÉPENDAMMENT pour chaque ligne,
   * jamais un `continue` commun qui perdrait l'une à cause de l'autre.
   *
   * Une lecture en échec rend deux tables VIDES plutôt que de faire tomber la
   * liste : une marge manquante se lit « non mesurée », ce qui est vrai, et
   * l'écran reste utilisable. Le contraire — deux cents missions invisibles
   * parce qu'une table annexe est illisible — coûte beaucoup plus cher.
   */
  private async commercialTermsByMission(missionIds: string[]): Promise<{
    costs: Map<string, number>
    poInfo: Map<
      string,
      {
        requiresPo: boolean
        poNumber: string | null
        noticeDays: number | null
        channel: string
        currency: string | null
      }
    >
  }> {
    const costs = new Map<string, number>()
    const poInfo = new Map<
      string,
      {
        requiresPo: boolean
        poNumber: string | null
        noticeDays: number | null
        channel: string
        currency: string | null
      }
    >()
    if (missionIds.length === 0) return { costs, poInfo }
    try {
      const rows = await this.terms.find({
        where: { mission_id: In(missionIds) },
        // #2413.2, .25, .28 — `notice_days` (préavis) se lit ICI plutôt que
        // d'être recopié sur `missions` : le dépôt le mesure déjà depuis
        // `upsertCommercialTermsSchema.noticeDays` (`mission_commercial_terms`),
        // et l'y dupliquer aurait été exactement la faute que GA-26 punit — un
        // réglage à deux endroits qui finit par diverger.
        // #2408.52, #2408.62 — `channel` s'ajoute EN FIN, même table et même
        // porte que le reste de cette ligne : le filtre « partenaire » et la
        // vue enregistrée « Partenaires/rang 2 » n'ont sinon aucun canal à lire.
        // #2408.53 — `currency` s'ajoute à son tour, même table, même porte :
        // le filtre « Devise » n'a sinon aucune valeur à lire.
        select: [
          'mission_id',
          'loaded_daily_cost_cents',
          'requires_po',
          'po_number',
          'notice_days',
          'channel',
          'currency',
        ],
      })
      for (const row of rows ?? []) {
        const raw = row.loaded_daily_cost_cents
        if (raw !== null && raw !== undefined && raw !== '') {
          const cents = Number(raw)
          if (Number.isFinite(cents) && cents >= 0) costs.set(row.mission_id, cents)
        }
        poInfo.set(row.mission_id, {
          requiresPo: Boolean(row.requires_po),
          poNumber: row.po_number ?? null,
          noticeDays: row.notice_days ?? null,
          channel: row.channel,
          currency: row.currency ?? null,
        })
      }
      return { costs, poInfo }
    } catch (error) {
      this.logger.error('Conditions commerciales illisibles pour la liste des missions', { error })
      return { costs, poInfo }
    }
  }

  /**
   * #2411.6 (reste, épopée #2881) — les missions dont le mois COURANT de
   * facturation est `blocked`, une requête pour TOUTE la liste plutôt que N
   * (même patron que `commercialTermsByMission` juste au-dessus).
   *
   * MÊME calcul que l'onglet Facturation (`InvoiceReadinessService.list`,
   * précédence `blocked > ready > invoiced > not_due` déjà éprouvée par
   * `DeliveryRoutinesService.blockedInvoicing`) — jamais un second calcul qui
   * pourrait diverger (GA-26). Le mois par défaut de `list()` (le précédent)
   * est le même que celui que la routine d'alerte regarde déjà.
   *
   * Lecture ÉCHOUÉE = ensemble VIDE, jamais une exception qui casserait toute
   * la liste des missions pour un signal qui n'en est qu'un parmi neuf.
   */
  /**
   * #2408.3/.16/.17/.20/.21/.40 — une lecture ÉCHOUÉE = aucun signal (chaque
   * exception reste muette), jamais une liste entière qui tombe.
   */
  private async exceptionSignalsOf(
    workspaceId: string,
    missions: readonly MissionEntity[],
    assigneesByMission: ReadonlyMap<string, readonly { id: string }[]> | null,
  ): Promise<Map<string, MissionExceptionSignals>> {
    try {
      return await missionExceptionSignals(
        this.missions.manager,
        workspaceId,
        missions.map(mission => ({
          id: mission.id,
          account_id: mission.account_id,
          ends_on: mission.ends_on,
          legal_entity_id: mission.legal_entity_id,
        })),
        assigneesByMission,
        new Date().toISOString().slice(0, 10),
      )
    } catch (error) {
      this.logger.error('Signaux d’exception illisibles pour la liste des missions', { error })
      return new Map()
    }
  }

  /** #2408 — une lecture ÉCHOUÉE = aucune alerte, jamais une exception qui casserait toute la liste. */
  private async receivableAlertsOf(
    workspaceId: string,
    now: Date,
  ): Promise<Map<string, ('invoice_overdue' | 'payment_late')[]>> {
    try {
      return await receivableAlertsByMission(this.missions.manager, workspaceId, now)
    } catch (error) {
      this.logger.error('Créances en retard illisibles pour la liste des missions', { error })
      return new Map()
    }
  }

  private async invoiceBlockedByMission(workspaceId: string, now: Date): Promise<ReadonlySet<string>> {
    try {
      const { items } = await this.invoiceReadiness.list(
        workspaceId,
        { blockedOnly: true },
        { canReadFinance: true },
        now,
      )
      return new Set(items.map(item => item.missionId))
    } catch (error) {
      this.logger.error('État de facturation illisible pour la liste des missions', { error })
      return new Set()
    }
  }

  /**
   * Qui est en poste sur chaque mission — une requête, pas N.
   *
   * `null` quand la lecture échoue, et c'est le point du code : une décoration
   * illisible ne fait pas tomber la liste, mais elle ne se DÉGUISE pas non plus
   * en « personne n'est affecté ». Même parti pris que les quatre lectures
   * annexes du board, dont cette requête reprend le filtre : une affectation
   * terminée ne dit pas qui est dessus AUJOURD'HUI.
   */
  private async assigneesByMission(missionIds: string[]): Promise<Map<string, MissionAssignee[]> | null> {
    if (missionIds.length === 0) return new Map()
    try {
      // #1350, #1363 — `c.id` et `c.photo_url` s'ajoutent au nom : l'avatar a
      // besoin de la photo, et la porte vers le profil a besoin de l'identité.
      // Le nom seul ouvrait la fiche du premier homonyme du vivier.
      // #2194.39 — `ma.load_percent` s'ajoute : sans lui, aucune surallocation
      // n'est détectable sur le Planning (`planning-conflicts.ts`), seulement
      // sur le vivier (`staffing.service.ts`, écran différent).
      const rows = await this.missions.manager.query<
        {
          mission_id: string
          consultant_id: string
          full_name: string
          photo_url: string | null
          load_percent: number
        }[]
      >(
        `SELECT ma.mission_id, c.id AS consultant_id, c.full_name, c.photo_url, ma.load_percent
           FROM mission_assignments ma
           JOIN consultants c ON c.id = ma.consultant_id
          WHERE ma.mission_id = ANY($1::uuid[])
            AND ${ASSIGNMENT_STILL_RUNNING}
          ORDER BY c.full_name`,
        [missionIds],
      )
      const grouped = new Map<string, MissionAssignee[]>()
      for (const row of rows ?? []) {
        const list = grouped.get(row.mission_id) ?? []
        // `?? null` et jamais `?? ''` : une chaîne vide se lirait comme une
        // photo qui n'a pas chargé, pas comme une photo absente.
        list.push({
          id: row.consultant_id,
          fullName: row.full_name,
          photoUrl: row.photo_url ?? null,
          loadPercent: row.load_percent,
        })
        grouped.set(row.mission_id, list)
      }
      return grouped
    } catch (error) {
      this.logger.error('Affectations illisibles pour la liste des missions', { error })
      return null
    }
  }

  /**
   * #2414.34/.40 (épopée #2986) — la demande marché des consultants affectés,
   * pour UN LOT de missions : UNE requête de zones + UNE requête de relevés,
   * jamais une par mission ni une par consultant.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * ZÉRO COLLECTE NOUVELLE, MÊME SOURCE QUE `ReverseMarketService`
   * ─────────────────────────────────────────────────────────────────────────
   * `territory_snapshots` est déjà remplie chaque lundi par la veille
   * territoriale (PDF 1) ; `ReverseMarketService.forTalent()` la lit déjà pour
   * UN consultant. Cette méthode ne duplique pas ce calcul (les zones→départe-
   * ments viennent de la même fonction pure, `departmentsFromZones`) — elle en
   * écrit une version PAR LOT, parce que `forTalent()` fait plusieurs requêtes
   * par consultant (candidats, snapshots, annuaire ESN, classement recruteurs)
   * et l'appeler dans le `.map()` de `list()` ouvrirait un N+1 sur un endpoint
   * de liste déjà en production — la même discipline que les six autres
   * lectures groupées de `list()` juste au-dessus.
   *
   * Trois états, jamais un booléen nu (GA-18/19) : un consultant sans zone
   * connue de la veille n'a « pas de demande », il est NON MESURÉ.
   */
  private async marketDemandByConsultant(
    consultantIds: readonly string[],
    userId: string,
    workspaceId: string,
  ): Promise<Map<string, MarketDemandSignal>> {
    const result = new Map<string, MarketDemandSignal>()
    if (consultantIds.length === 0) return result

    // Même aiguillage démo/production que `ReverseMarketService.forTalent()` —
    // `territory_snapshots` est partagée entre tous les espaces et porte des
    // photos de démonstration (`source = 'demo'`) : sans ce filtre, un vrai
    // client verrait le décor de la salle présenté comme un relevé de marché.
    const source: TerritorySnapshotSource = (await this.workspaceContext.isDemoWorkspace(userId)) ? 'demo' : 'sweep'

    const [zoneRows, knownRows] = await Promise.all([
      this.consultants.manager.query<{ id: string; zones: string[] | null }[]>(
        // GA-46 — bornée à l'espace de l'appelant : un identifiant venu d'une
        // affectation ne doit jamais lire le vivier d'un autre espace.
        `SELECT id, zones FROM consultants WHERE id = ANY($1::uuid[]) AND workspace_id = $2`,
        [consultantIds, workspaceId],
      ),
      this.consultants.manager.query<{ department: string }[]>(
        `SELECT DISTINCT department FROM territory_snapshots WHERE source = $1`,
        [source],
      ),
    ])
    const known = knownRows.map(row => row.department)

    const departmentsByConsultant = new Map<string, string[]>()
    const allDepartments = new Set<string>()
    for (const row of zoneRows) {
      const { departments } = departmentsFromZones(row.zones ?? [], known)
      departmentsByConsultant.set(row.id, departments)
      for (const department of departments) allDepartments.add(department)
    }
    if (allDepartments.size === 0) {
      // Aucune zone d'aucun consultant ne résout à un département suivi :
      // NON MESURÉ pour tout le lot, jamais « absent ».
      for (const id of consultantIds) result.set(id, 'non_mesure')
      return result
    }

    const snapshotRows = await this.consultants.manager.query<{ department: string; offers: number | null }[]>(
      `SELECT DISTINCT ON (department) department, offers
         FROM territory_snapshots
        WHERE department = ANY($1::text[]) AND source = $2
        ORDER BY department, taken_on DESC`,
      [Array.from(allDepartments), source],
    )
    const offersByDepartment = new Map(snapshotRows.map(row => [row.department, row.offers]))

    for (const id of consultantIds) {
      const departments = departmentsByConsultant.get(id) ?? []
      if (departments.length === 0) {
        result.set(id, 'non_mesure')
        continue
      }
      const offers = departments.map(department => offersByDepartment.get(department))
      if (offers.some(value => typeof value === 'number' && value > 0)) {
        result.set(id, 'present')
      } else if (offers.some(value => typeof value === 'number')) {
        result.set(id, 'absent')
      } else {
        // Départements résolus mais aucun relevé trouvé (veille pas encore
        // passée sur ce département cette semaine) — mesuré à rien, pas zéro.
        result.set(id, 'non_mesure')
      }
    }
    return result
  }

  /** La demande marché d'UNE mission, résumée depuis ses affectés : PRÉSENTE
   *  si au moins un l'est, sinon ABSENTE si au moins un est mesuré, sinon NON
   *  MESURÉ. Un signal « présent » sur un seul affecté suffit à dire que le
   *  repositionnement peut commencer tôt — le diluer dans une moyenne avec des
   *  collègues non mesurés cacherait le signal utile. */
  private static summariseMarketDemand(
    consultantIds: readonly string[],
    byConsultant: ReadonlyMap<string, MarketDemandSignal>,
  ): MarketDemandSignal {
    const signals = consultantIds.map(id => byConsultant.get(id) ?? 'non_mesure')
    if (signals.some(signal => signal === 'present')) return 'present'
    if (signals.some(signal => signal === 'absent')) return 'absent'
    return 'non_mesure'
  }

  /**
   * #2414.35 (reste, épopée #2986) — la rareté du profil des consultants
   * affectés à CETTE liste, PAR LOT : une requête de compétences typées + une
   * requête de comptage par compétence sur tout le workspace, jamais une
   * requête par consultant. Même seuil que le segment « profils rares » du
   * vivier (`POOL_THRESHOLDS.rareSkillHolders`, `talent-pool.service.ts`) —
   * ZÉRO collecte nouvelle, ZÉRO second seuil à faire vivre ailleurs (GA-26).
   *
   * Trois états, jamais un booléen nu (GA-18/19) : un consultant sans
   * compétence typée connue (`consultant_skills` vide) n'a « pas de profil
   * rare », il est NON MESURÉ.
   */
  private async profileScarcityByConsultant(
    consultantIds: readonly string[],
    workspaceId: string,
  ): Promise<Map<string, ProfileScarcitySignal>> {
    const result = new Map<string, ProfileScarcitySignal>()
    if (consultantIds.length === 0) return result

    const skillRows = await this.consultants.manager.query<{ consultant_id: string; skill: string }[]>(
      `SELECT consultant_id, skill FROM consultant_skills WHERE consultant_id = ANY($1::uuid[])`,
      [consultantIds],
    )
    if (skillRows.length === 0) {
      // Aucune compétence typée sur aucun affecté du lot : NON MESURÉ pour
      // tout le lot, jamais « profil courant ».
      for (const id of consultantIds) result.set(id, 'non_mesure')
      return result
    }

    const skillsByConsultant = new Map<string, string[]>()
    const allSkills = new Set<string>()
    for (const row of skillRows) {
      const list = skillsByConsultant.get(row.consultant_id) ?? []
      list.push(row.skill)
      skillsByConsultant.set(row.consultant_id, list)
      allSkills.add(row.skill)
    }

    // Comptage sur TOUT LE WORKSPACE (jamais borné à ce lot) — la rareté d'une
    // compétence se juge contre le vivier entier, même discipline que
    // `talent-pool.service.ts`.
    const holderRows = await this.consultants.manager.query<{ skill: string; holders: string }[]>(
      `SELECT cs.skill, count(DISTINCT cs.consultant_id) AS holders
         FROM consultant_skills cs
         JOIN consultants c ON c.id = cs.consultant_id
        WHERE c.workspace_id = $1::uuid AND cs.skill = ANY($2::text[]) AND c.archived_at IS NULL
        GROUP BY cs.skill`,
      [workspaceId, Array.from(allSkills)],
    )
    const holdersBySkill = new Map(holderRows.map(row => [row.skill, Number(row.holders)]))

    for (const id of consultantIds) {
      const skills = skillsByConsultant.get(id) ?? []
      if (skills.length === 0) {
        result.set(id, 'non_mesure')
        continue
      }
      const isRare = skills.some(skill => (holdersBySkill.get(skill) ?? 0) < POOL_THRESHOLDS.rareSkillHolders)
      result.set(id, isRare ? 'present' : 'absent')
    }
    return result
  }

  /**
   * #2414.41/.42 — les besoins OUVERTS compatibles des consultants affectés,
   * PAR LOT : une requête de compétences typées + une requête des besoins
   * ouverts du workspace (`needStillOpenSql`). Compatible = un besoin exige
   * une compétence (`skills[].term`, sans casse) que le consultant porte.
   * Un consultant sans compétence typée est NON MESURÉ, jamais « aucun besoin ».
   * Ne lance rien : c'est un signal de MOMENT (NO-GO #2414 : jamais de contact
   * ni de CV automatique).
   */
  private async openNeedsByConsultant(
    consultantIds: readonly string[],
    workspaceId: string,
  ): Promise<Map<string, OpenNeedsSignal>> {
    const result = new Map<string, OpenNeedsSignal>()
    if (consultantIds.length === 0) return result
    const skillRows = await this.consultants.manager.query<{ consultant_id: string; skill: string }[]>(
      `SELECT consultant_id, skill FROM consultant_skills WHERE consultant_id = ANY($1::uuid[])`,
      [consultantIds],
    )
    const needRows = await this.consultants.manager.query<{ skills: { term?: string | null }[] | null }[]>(
      `SELECT n.skills FROM project_needs n
        WHERE n.workspace_id = $1::uuid AND ${needStillOpenSql('n.status')}`,
      [workspaceId],
    )
    const neededTerms = new Set<string>()
    for (const row of needRows) {
      for (const skill of row.skills ?? []) {
        const term = skill?.term?.trim().toLowerCase()
        if (term) neededTerms.add(term)
      }
    }
    const skillsByConsultant = new Map<string, string[]>()
    for (const row of skillRows) {
      const list = skillsByConsultant.get(row.consultant_id) ?? []
      if (row.skill) list.push(row.skill.trim().toLowerCase())
      skillsByConsultant.set(row.consultant_id, list)
    }
    for (const id of consultantIds) {
      const skills = skillsByConsultant.get(id) ?? []
      if (skills.length === 0) {
        result.set(id, 'non_mesure')
        continue
      }
      result.set(id, skills.some(skill => neededTerms.has(skill)) ? 'present' : 'absent')
    }
    return result
  }

  /**
   * #2414.44/.45 — partenaires et relations du compte client, PAR LOT (deux
   * requêtes pour toutes les missions de la liste). Partenaire = ligne du panel
   * (`account_partners`, non écartée) qui n'est pas un concurrent ; relation =
   * contact du compte de source déclarée (CRM, saisie, import). Un compte dont le
   * panel / les contacts n'ont jamais été regardés est NON MESURÉ. Ne lance rien.
   */
  private async accountRepositionSignals(
    accountIds: readonly string[],
    workspaceId: string,
  ): Promise<Map<string, { partners: AccountRepositionSignal; relations: AccountRepositionSignal }>> {
    const result = new Map<string, { partners: AccountRepositionSignal; relations: AccountRepositionSignal }>()
    if (accountIds.length === 0) return result
    const partnerRows = await this.consultants.manager.query<{ account_id: string; total: number; allies: number }[]>(
      `SELECT account_id, COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE relationship <> 'competitor')::int AS allies
         FROM account_partners
        WHERE workspace_id = $1::uuid AND account_id = ANY($2::uuid[]) AND dismissed_at IS NULL
        GROUP BY account_id`,
      [workspaceId, accountIds],
    )
    const contactRows = await this.consultants.manager.query<{ account_id: string; total: number; known: number }[]>(
      `SELECT account_id, COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE lower(source) IN ('crm', 'manual', 'import'))::int AS known
         FROM contacts
        WHERE workspace_id = $1::uuid AND account_id = ANY($2::uuid[]) AND deleted_at IS NULL
        GROUP BY account_id`,
      [workspaceId, accountIds],
    )
    const partners = new Map(partnerRows.map(row => [row.account_id, row]))
    const contacts = new Map(contactRows.map(row => [row.account_id, row]))
    for (const id of accountIds) {
      const partner = partners.get(id)
      const contact = contacts.get(id)
      result.set(id, {
        partners: !partner ? 'non_mesure' : partner.allies > 0 ? 'present' : 'absent',
        relations: !contact ? 'non_mesure' : contact.known > 0 ? 'present' : 'absent',
      })
    }
    return result
  }

  /**
   * #2414.37 — les contraintes DÉCLARÉES des affectés (restriction de mobilité,
   * conditions non négociables). Deux états seulement, à dessein : une fiche sans
   * contrainte saisie ne prouve pas qu'il n'y en a pas — NON MESURÉ, jamais
   * « absent » (GA-18/19). Ne lance rien.
   */
  private async constraintsByConsultant(
    consultantIds: readonly string[],
    workspaceId: string,
  ): Promise<{
    signals: Map<string, ConsultantRepositionSignal>
    declared: Map<string, { kind: 'mobility' | 'conditions'; text: string }[]>
  }> {
    const signals = new Map<string, ConsultantRepositionSignal>()
    const declared = new Map<string, { kind: 'mobility' | 'conditions'; text: string }[]>()
    if (consultantIds.length === 0) return { signals, declared }
    const rows = await this.consultants.manager.query<
      { id: string; mobility: string | null; conditions: string | null }[]
    >(
      `SELECT id,
              btrim(COALESCE(mobility_restrictions, '')) AS mobility,
              btrim(COALESCE(non_negotiable_conditions, '')) AS conditions
         FROM consultants
        WHERE workspace_id = $1::uuid AND id = ANY($2::uuid[])`,
      [workspaceId, consultantIds],
    )
    for (const row of rows) {
      const items: { kind: 'mobility' | 'conditions'; text: string }[] = []
      if (row.mobility) items.push({ kind: 'mobility', text: row.mobility })
      if (row.conditions) items.push({ kind: 'conditions', text: row.conditions })
      if (items.length > 0) declared.set(row.id, items)
    }
    for (const id of consultantIds) signals.set(id, declared.has(id) ? 'present' : 'non_mesure')
    return { signals, declared }
  }

  /**
   * #2414.48 (épopée #2986, lot E09 08/10) — l'historique de présentation
   * RÉCENTE, tous besoins confondus. Distinct de `ProposalsService.
   * countPriorPresentations`, qui répond à une question voisine (combien de
   * fois CE besoin a montré ce profil à UN AUTRE besoin) : ici, aucun besoin
   * de référence — un profil montré récemment À N'IMPORTE QUEL besoin circule
   * déjà sur le marché, c'est le signal que #2986 (commentaire du 07/10,
   * lot S14) a trouvé câblé nulle part.
   *
   * « Récent » n'avait aucune décision préexistante (aucune fenêtre déjà
   * posée sur `submissions`/présentation ailleurs dans le dépôt) ; tranché
   * seul cette nuit, sur le même nombre que `PLAN_STALE_DAYS`
   * (`first-move.ts`) et `DEFAULT_WINDOW_DAYS` (`first-proof-recette.
   * service.ts`) : 90 jours, écrit ici pour être relu, pas deviné à nouveau.
   *
   * Deux états seulement, à dessein : contrairement aux contraintes
   * déclarées (champ qui peut n'avoir jamais été rempli), `submissions` est
   * un journal — l'absence de ligne récente DIT vraiment « pas présenté
   * récemment », ce n'est pas une mesure manquante.
   */
  private static readonly PRESENTATION_HISTORY_RECENT_DAYS = 90

  private async presentationHistoryByConsultant(
    consultantIds: readonly string[],
    workspaceId: string,
  ): Promise<Map<string, ConsultantRepositionSignal>> {
    const result = new Map<string, ConsultantRepositionSignal>()
    if (consultantIds.length === 0) return result
    const since = new Date(Date.now() - DeliveryService.PRESENTATION_HISTORY_RECENT_DAYS * 24 * 60 * 60 * 1000)
    const rows = await this.consultants.manager.query<{ consultant_id: string }[]>(
      `SELECT DISTINCT consultant_id FROM submissions
        WHERE workspace_id = $1::uuid AND consultant_id = ANY($2::uuid[])
          AND stage = ANY($3::text[]) AND COALESCE(submitted_at, created_at) >= $4::timestamptz`,
      [workspaceId, consultantIds, PRESENTED_SUBMISSION_STAGES, since],
    )
    const presented = new Set(rows.map(row => row.consultant_id))
    for (const id of consultantIds) result.set(id, presented.has(id) ? 'present' : 'absent')
    return result
  }

  /**
   * #2414.43 — la mémoire marché du compte client (technos observées chez lui)
   * croisée avec les compétences typées des affectés de CHAQUE mission. Présent =
   * une techno observée est portée par un affecté ; absent = compte couvert et
   * affecté typé, aucun recoupement ; non mesuré = compte non couvert, lecture
   * indisponible ou aucune compétence typée. Un résolveur qui échoue rend NON MESURÉ
   * pour tout le lot : la mémoire marché est un plus, jamais une condition.
   */
  private async marketMemoryByMission(
    missions: readonly MissionEntity[],
    assigneesByMission: Map<string, { id: string }[]> | null,
    consultantIds: readonly string[],
    accountsById: Map<string, AccountLookup>,
    resolver: ClientStacksResolver | undefined,
  ): Promise<Map<string, ConsultantRepositionSignal>> {
    const result = new Map<string, ConsultantRepositionSignal>()
    if (!resolver || assigneesByMission === null) return result
    const accountIds = [...new Set(missions.map(m => m.account_id).filter((id): id is string => Boolean(id)))]
    if (accountIds.length === 0) return result
    let stacks: ReadonlyMap<string, readonly string[] | null>
    try {
      stacks = await resolver(
        accountIds.flatMap(id => {
          const account = accountsById.get(id)
          return account ? [{ id, name: account.name, website: account.website }] : []
        }),
      )
    } catch (error) {
      this.logger.warn('mémoire marché illisible pour le repositionnement', { error })
      return result
    }
    const skillRows =
      consultantIds.length === 0
        ? []
        : await this.consultants.manager.query<{ consultant_id: string; skill: string }[]>(
            `SELECT consultant_id, skill FROM consultant_skills WHERE consultant_id = ANY($1::uuid[])`,
            [consultantIds],
          )
    const skillsOf = new Map<string, Set<string>>()
    for (const row of skillRows) {
      const set = skillsOf.get(row.consultant_id) ?? new Set<string>()
      if (row.skill) set.add(row.skill.trim().toLowerCase())
      skillsOf.set(row.consultant_id, set)
    }
    for (const mission of missions) {
      const stack = mission.account_id ? stacks.get(mission.account_id) : null
      const skills = new Set<string>()
      for (const assignee of assigneesByMission.get(mission.id) ?? []) {
        for (const skill of skillsOf.get(assignee.id) ?? []) skills.add(skill)
      }
      if (!stack || stack.length === 0 || skills.size === 0) {
        result.set(mission.id, 'non_mesure')
        continue
      }
      result.set(mission.id, stack.some(techno => skills.has(techno.trim().toLowerCase())) ? 'present' : 'absent')
    }
    return result
  }

  private static summariseConsultantSignal(
    consultantIds: readonly string[],
    byConsultant: ReadonlyMap<string, ConsultantRepositionSignal>,
  ): ConsultantRepositionSignal {
    const signals = consultantIds.map(id => byConsultant.get(id) ?? 'non_mesure')
    if (signals.some(signal => signal === 'present')) return 'present'
    if (signals.some(signal => signal === 'absent')) return 'absent'
    return 'non_mesure'
  }

  private static summariseOpenNeeds(
    consultantIds: readonly string[],
    byConsultant: ReadonlyMap<string, OpenNeedsSignal>,
  ): OpenNeedsSignal {
    const signals = consultantIds.map(id => byConsultant.get(id) ?? 'non_mesure')
    if (signals.some(signal => signal === 'present')) return 'present'
    if (signals.some(signal => signal === 'absent')) return 'absent'
    return 'non_mesure'
  }

  /** La rareté de profil d'UNE mission, résumée depuis ses affectés : PRÉSENTE
   *  si au moins un porte une compétence rare, sinon ABSENTE si au moins un
   *  est mesuré, sinon NON MESURÉ — même discipline que
   *  `summariseMarketDemand` juste au-dessus. */
  private static summariseProfileScarcity(
    consultantIds: readonly string[],
    byConsultant: ReadonlyMap<string, ProfileScarcitySignal>,
  ): ProfileScarcitySignal {
    const signals = consultantIds.map(id => byConsultant.get(id) ?? 'non_mesure')
    if (signals.some(signal => signal === 'present')) return 'present'
    if (signals.some(signal => signal === 'absent')) return 'absent'
    return 'non_mesure'
  }

  /**
   * #2194.26 — les compétences CANONIQUES des affectés ACTIFS de chaque
   * mission, pour le filtre Planning (qui filtre CÔTÉ CLIENT, sur le modèle
   * de son filtre consultant — voir `missionIdsOfSkill` pour l'équivalent
   * SERVEUR, utilisé par `?skill=`).
   *
   * Même périmètre qu'`assigneesByMission` (`ASSIGNMENT_STILL_RUNNING`) : une
   * compétence lue sur une affectation déjà terminée décrirait qui a été là,
   * pas qui répond aujourd'hui — et même repli `null`/`[]` : `null` = lecture
   * illisible, `[]` = lu, aucune compétence déclarée sur les affectés actifs.
   */
  private async skillsByMission(missionIds: string[]): Promise<Map<string, string[]> | null> {
    if (missionIds.length === 0) return new Map()
    try {
      const rows = await this.missions.manager.query<{ mission_id: string; skill: string }[]>(
        `SELECT DISTINCT ma.mission_id, cs.skill
           FROM mission_assignments ma
           JOIN consultant_skills cs ON cs.consultant_id = ma.consultant_id
          WHERE ma.mission_id = ANY($1::uuid[])
            AND ${ASSIGNMENT_STILL_RUNNING}
          ORDER BY cs.skill`,
        [missionIds],
      )
      const grouped = new Map<string, string[]>()
      for (const row of rows ?? []) {
        const list = grouped.get(row.mission_id) ?? []
        list.push(row.skill)
        grouped.set(row.mission_id, list)
      }
      return grouped
    } catch (error) {
      this.logger.error('Compétences illisibles pour la liste des missions', { error })
      return null
    }
  }

  /**
   * Les missions qui demandent une action MAINTENANT.
   *
   * C'est la vraie porte d'entrée du module : la liste complète sert à consulter,
   * celle-ci sert à agir. Une mission sans date de fin y figure aussi — elle ne
   * sera jamais relancée à temps, ce qui est précisément le trou à combler.
   */
  async renewalsToAct(
    userId: string,
    /**
     * Resserre la fenêtre — « quelles missions finissent sous 30 jours » n'est
     * pas la même question que « lesquelles demandent une action ».
     *
     * Sans ce paramètre, l'appelant recevait les fenêtres actionnables (jusqu'à
     * J+60) quel que soit le nombre de jours demandé. Le copilote annonçait
     * alors « sous 30 jours » au-dessus d'une liste qui allait à 60 : un
     * périmètre affirmé que la donnée ne portait pas.
     */
    withinDays?: number,
    now: Date = new Date(),
    /**
     * LE DROIT FINANCIER DE CELUI QUI LIT — #1365.
     *
     * ⚠️ Il valait `false` EN DUR, et le commentaire l'expliquait par « les
     * renouvellements ne montrent aucun montant ». C'était vrai de l'écran de
     * l'époque, qui rendait des cartes portant la seule échéance ; ce n'est
     * plus vrai depuis que la lentille rend le même tableau que « En cours ».
     * La colonne « Marge » y disait donc « pas ton périmètre » à TOUT LE MONDE,
     * y compris à un directeur qui a le droit — un droit refusé par une
     * constante, pas par un rôle.
     *
     * Le défaut par DÉFAUT reste `false` : les deux appelants internes (le pont
     * du copilote, l'ADV) n'ont aucun rôle à faire valoir, et un défaut ouvert
     * leur aurait servi la marge sans que personne ne l'ait décidé.
     */
    canReadFinance = false,
    /**
     * #2195.50 — DÉCISION LOUIS 20/09/2026 : LA FENÊTRE « AU-DELÀ DE 60 JOURS ».
     *
     * `far` reste HORS de `ACTIONABLE_RENEWAL_WINDOWS` — cette constante répond
     * à « quoi demande un geste MAINTENANT », et `expansionMap` s'appuie dessus
     * pour « bientôt » (juste plus bas) : y ajouter `far` ferait annoncer
     * qu'une mission à trois cents jours finit bientôt.
     *
     * Ce paramètre est donc une PORTE À PART, fermée par défaut : le pont
     * copilote et l'ADV lisent cette méthode pour « ce qui appelle une action »,
     * et une mission lointaine n'en appelle aucune — l'inclure là-bas serait
     * une fausse urgence. Seul `GET /delivery/renewals` (l'écran de décision)
     * l'ouvre : c'est lui qui doit désormais SERVIR les échéances lointaines,
     * pour que « Sans date de fin » ait un « lointain » à précéder.
     */
    includeFar = false,
    clientStacks?: ClientStacksResolver,
  ): Promise<{ missions: MissionView[]; canReadFinance: boolean }> {
    const { missions } = await this.list(userId, { canReadFinance, clientStacks })
    const actionable = missions.filter(
      view =>
        ACTIONABLE_RENEWAL_WINDOWS.includes(view.renewal) ||
        view.renewal === 'unknown' ||
        (includeFar && view.renewal === 'far'),
    )
    if (withinDays === undefined) return { missions: actionable, canReadFinance }
    return {
      missions: actionable.filter(view => {
        // Une mission SANS date de fin reste rendue quelle que soit la fenêtre :
        // elle est justement celle qu'on ne relance jamais à temps. La retirer
        // d'une question bornée la ferait disparaître de toutes les questions.
        const days = daysUntilEnd(view.ends_on, now)
        return days === null || days <= withinDays
      }),
      canReadFinance,
    }
  }

  /**
   * #2407.9 — LA VALIDITÉ DU BON DE COMMANDE, par mission, bornée à l'espace.
   *
   * ⚠️ Donnée `finance:read` (« la partie réservée à finance:read » de
   * `mission_commercial_terms`) : c'est l'APPELANT qui a vérifié le droit — ce
   * service ne le devine pas. La jointure sur `missions.workspace_id` borne la
   * lecture à l'espace même si un identifiant d'un autre espace était passé.
   * Une mission sans validité saisie est ABSENTE de la table rendue — jamais
   * une date devinée.
   */
  async poValidUntilByMission(workspaceId: string, missionIds: readonly string[]): Promise<Map<string, string>> {
    if (missionIds.length === 0) return new Map()
    const rows: { mission_id: string; po_valid_until: string | Date | null }[] = await this.terms
      .createQueryBuilder('t')
      .innerJoin(MissionEntity, 'm', 'm.id = t.mission_id')
      .select(['t.mission_id AS mission_id', 't.po_valid_until AS po_valid_until'])
      .where('m.workspace_id = :workspaceId', { workspaceId })
      .andWhere('t.mission_id IN (:...missionIds)', { missionIds: [...missionIds] })
      .andWhere('t.po_valid_until IS NOT NULL')
      .getRawMany()
    const validity = new Map<string, string>()
    for (const row of rows) {
      const day = row.po_valid_until instanceof Date ? row.po_valid_until.toISOString() : row.po_valid_until
      if (day) validity.set(row.mission_id, day.slice(0, 10))
    }
    return validity
  }

  /**
   * #2195.8 — L'ÉCHELLE DE FENÊTRES DE L'ESPACE, LUE À UN SEUL ENDROIT.
   *
   * `NULL` en base veut dire « cet espace n'a rien réglé », et la valeur se lit
   * alors dans le contrat. Une lecture qui ÉCHOUE rend la même échelle : un
   * incident de base de données ne doit pas faire disparaître des missions de la
   * lentille des renouvellements — c'est exactement l'écran qui sert à ne rien
   * rater.
   */
  private async renewalWindowDaysOf(workspaceId: string): Promise<readonly number[]> {
    try {
      const rows = await this.missions.manager.query<{ renewal_window_days: unknown }[]>(
        `SELECT renewal_window_days FROM workspaces WHERE id = $1`,
        [workspaceId],
      )
      return resolveRenewalWindowDays(rows?.[0]?.renewal_window_days ?? null)
    } catch (err) {
      this.logger.error('renewalWindowDaysOf error', { error: err })
      return DEFAULT_RENEWAL_WINDOW_DAYS
    }
  }

  /**
   * Ce que l'écran de réglages LIT — les bornes, et si elles sont celles de
   * l'espace ou celles du produit.
   *
   * Les deux ne se confondent pas : « nous avons choisi soixante jours » et
   * « personne n'a rien choisi, le produit dit soixante » appellent des phrases
   * différentes à l'écran.
   */
  async renewalWindows(userId: string): Promise<{ days: readonly number[]; isWorkspaceSetting: boolean }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.missions.manager.query<{ renewal_window_days: unknown }[]>(
      `SELECT renewal_window_days FROM workspaces WHERE id = $1`,
      [workspaceId],
    )
    const raw = rows?.[0]?.renewal_window_days ?? null
    return {
      days: resolveRenewalWindowDays(raw),
      // Un réglage ABÎMÉ n'est pas un réglage : il retombe sur l'échelle du
      // produit, et l'écran doit le dire ainsi plutôt que d'afficher des bornes
      // que personne ne reconnaîtra.
      isWorkspaceSetting: renewalWindowDaysSchema.safeParse(raw).success,
    }
  }

  /**
   * Règle les fenêtres de l'espace. `null` REND l'échelle du produit.
   *
   * ⚠️ Les trois garde-fous sont refusés ICI, avant l'écriture, et par le
   * schéma du contrat — jamais par une seconde règle écrite à la main : deux
   * validations divergent le jour où l'une bouge (GA-26). La base ne garde que
   * la FORME (un tableau d'au plus quatre entrées), le contrat garde la RÈGLE.
   */
  async setRenewalWindows(userId: string, days: number[] | null): Promise<{ days: readonly number[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    if (days === null) {
      await this.missions.manager.query(`UPDATE workspaces SET renewal_window_days = NULL WHERE id = $1`, [workspaceId])
      return { days: DEFAULT_RENEWAL_WINDOW_DAYS }
    }
    const parsed = renewalWindowDaysSchema.safeParse(days)
    if (!parsed.success) {
      // Le message NOMME la règle violée — « invalide » enverrait l'utilisateur
      // deviner lequel des trois garde-fous il vient de franchir.
      throw new BadRequestException(parsed.error.issues.map(issue => issue.message).join(' · '))
    }
    await this.missions.manager.query(`UPDATE workspaces SET renewal_window_days = $2::jsonb WHERE id = $1`, [
      workspaceId,
      JSON.stringify(parsed.data),
    ])
    return { days: parsed.data }
  }

  /**
   * La carte d'expansion (p72) : où une mission en cours ouvre une conversation.
   *
   * Le principe du rapport est qu'un consultant en poste voit des choses qu'aucune
   * recherche web ne verra. Ce calcul ne fabrique pas ces informations — il dit
   * seulement OÙ il vaut la peine d'aller les chercher, et pourquoi maintenant.
   */
  async expansionMap(userId: string): Promise<{ signals: ExpansionSignal[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const missions = await this.missions.find({
      where: { workspace_id: workspaceId, status: In([...EXPANSION_MISSION_STATUSES]) },
    })

    const byAccount = new Map<string, MissionEntity[]>()
    for (const mission of missions) {
      const list = byAccount.get(mission.account_id) ?? []
      list.push(mission)
      byAccount.set(mission.account_id, list)
    }

    const experts = await this.expertsByAccount(workspaceId)

    const signals: ExpansionSignal[] = []
    for (const [accountId, accountMissions] of byAccount) {
      // #2195.49 — « bientôt » se DÉRIVE de l'échelle canonique, il ne la
      // recopie plus. La liste littérale `['j60', 'j30', 'imminent']` datait
      // d'une échelle à quatre jalons : le jour où J-45 et J-15 sont nées, une
      // mission à 12 jours a cessé d'être « bientôt » — sans qu'une seule ligne
      // change ici. Une échelle vit à UN endroit (GA-26).
      const endingSoon = accountMissions.filter(mission => {
        const window = renewalWindow(mission.ends_on)
        // `overdue` sort : une mission déjà échue ne « finit pas bientôt »,
        // elle est finie. C'est la seule différence avec `ACTIONABLE`.
        return window !== 'overdue' && ACTIONABLE_RENEWAL_WINDOWS.includes(window)
      }).length
      const expertsOnSite = experts.get(accountId) ?? 0
      signals.push({
        accountId,
        activeMissions: accountMissions.length,
        endingSoon,
        expertsOnSite,
        reason: expansionReason(accountMissions.length, endingSoon, expertsOnSite),
      })
    }
    // Les comptes où il se passe le plus de choses d'abord.
    signals.sort((a, b) => b.endingSoon - a.endingSoon || b.activeMissions - a.activeMissions)
    return { signals }
  }

  /**
   * COMBIEN DE PERSONNES DE L'ESN SONT EN POSTE CHEZ CE CLIENT — une requête,
   * pas N, et surtout PLUS le nombre de missions.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * ⚠️ LE DÉFAUT QUE CETTE MÉTHODE EXISTE POUR CORRIGER
   * ─────────────────────────────────────────────────────────────────────────
   * `expertsOnSite` valait `accountMissions.length` : le MÊME nombre que
   * `activeMissions`, sous un autre nom, sans aucune jointure derrière. Deux
   * compteurs du portefeuille ont été délibérément NON livrés pour cette seule
   * raison — c'est écrit dans `AccountsBillingCounters.tsx` : « les afficher
   * côte à côte montrerait deux fois le même chiffre sous deux noms
   * différents, ce qui est pire que de ne pas le montrer ». Tant que ce champ
   * mentait, la route entière restait inaffichable.
   *
   * `COUNT(DISTINCT ma.consultant_id)` et non `COUNT(*)` : une personne
   * affectée à deux missions du même compte est UNE personne sur place. Sans
   * le `DISTINCT`, on aurait remplacé un doublon par un autre.
   *
   * Le filtre est le MÊME que {@link assigneesByMission} — la constante est
   * partagée (GA-26) : une affectation terminée ne dit pas qui est là
   * AUJOURD'HUI, et deux copies de ce prédicat divergeraient le jour où l'une
   * apprend à tolérer une date.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * ⚠️ AUCUN try/catch, DÉLIBÉRÉMENT
   * ─────────────────────────────────────────────────────────────────────────
   * Ici, contrairement à `assigneesByMission`, ce chiffre EST la réponse et pas
   * une décoration. Une table illisible doit faire échouer la lecture — l'écran
   * dit alors « les chiffres n'ont pas pu être chargés », ce qui est vrai —
   * plutôt que de rendre « 0 expert sur place », qui se lit comme un fait.
   * Même parti pris que `PropagationService` : « cassé » et « non mesurable »
   * se ressemblent trop pour qu'on les confonde.
   *
   * Un compte ABSENT de la réponse, lui, n'a réellement aucune affectation en
   * cours : c'est un fait mesuré, pas un trou de mesure.
   */
  private async expertsByAccount(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.missions.manager.query<{ account_id: string; experts: string }[]>(
      `SELECT m.account_id, COUNT(DISTINCT ma.consultant_id)::text AS experts
         FROM missions m
         JOIN mission_assignments ma ON ma.mission_id = m.id
        WHERE m.workspace_id = $1
          AND m.status = ANY($2::text[])
          AND ${ASSIGNMENT_ON_SITE_TODAY}
        GROUP BY m.account_id`,
      [workspaceId, EXPANSION_MISSION_STATUSES],
    )
    const counts = new Map<string, number>()
    for (const row of rows ?? []) {
      const parsed = Number(row.experts)
      if (!Number.isFinite(parsed) || parsed < 0) continue
      counts.set(row.account_id, parsed)
    }
    return counts
  }

  /**
   * CE QUE LE PORTEFEUILLE AFFICHE EN TÊTE : deux nombres, et de quoi savoir si
   * le second est lisible (31/08/2026).
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * POURQUOI TROIS CHIFFRES POUR DEUX TUILES
   * ─────────────────────────────────────────────────────────────────────────────
   * `activeMissions` et `consultantsOnMission` sont deux mesures DIFFÉRENTES
   * depuis la réparation ci-dessus. Mais « 0 freelance en mission » a deux
   * lectures opposées : personne n'est en poste, ou personne n'a saisi qui l'est.
   * Les confondre ferait annoncer un bench complet à une agence qui tourne à
   * plein — c'est le défaut « cassé et non mesurable se ressemblent ».
   *
   * `missionsWithoutAssignment` tranche. Il ne s'affiche pas comme une tuile :
   * il dit à l'écran s'il a le droit d'afficher la sienne, et sinon quoi écrire
   * à la place. Un dénombrement qui ne porte pas sa population n'est pas une
   * mesure (« aggregates say their denominator »).
   */
  async staffingHeadline(
    userId: string,
  ): Promise<{ activeMissions: number; consultantsOnMission: number; missionsWithoutAssignment: number }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.missions.manager.query<
      { active_missions: string; consultants: string; unstaffed: string }[]
    >(
      `WITH active AS (
         SELECT m.id, m.delivery_mode
           FROM missions m
          WHERE m.workspace_id = $1 AND m.status = ANY($2::text[])
       ),
       covering AS (
         SELECT ma.mission_id, ma.consultant_id
           FROM mission_assignments ma
           JOIN active a ON a.id = ma.mission_id
          WHERE ${ASSIGNMENT_ON_SITE_TODAY}
       )
       SELECT (SELECT COUNT(*) FROM active)::text AS active_missions,
              (SELECT COUNT(DISTINCT consultant_id) FROM covering)::text AS consultants,
              (SELECT COUNT(*) FROM active a
                WHERE a.delivery_mode <> 'supervised'
                  AND NOT EXISTS (SELECT 1 FROM covering c WHERE c.mission_id = a.id))::text AS unstaffed`,
      [workspaceId, EXPANSION_MISSION_STATUSES],
    )
    const row = rows[0]
    return {
      activeMissions: Number(row?.active_missions ?? 0) || 0,
      // ⚠️ DISTINCT sur TOUT l'espace, et non la somme des comptes : quelqu'un
      // partagé entre deux clients est UNE personne. Sommer les comptages par
      // compte le compterait deux fois, et le total dépasserait l'effectif.
      consultantsOnMission: Number(row?.consultants ?? 0) || 0,
      missionsWithoutAssignment: Number(row?.unstaffed ?? 0) || 0,
    }
  }

  /**
   * #2407.3 — L'ÉCRITURE DE LA PROVENANCE, À UN SEUL ENDROIT (GA-26).
   *
   * `create` (client, intitulé) ET `updateMission` (dates, TJM) journalisent
   * chacun sa moitié des champs `MISSION_TRACKED_FIELDS` — deux writers, une
   * seule forme de ligne. Source toujours `human` : les deux appelants
   * exigent une confirmation humaine avant d'écrire (le clic « Créer », le
   * clic « Enregistrer ») — aucun connecteur ni pipeline n'écrit une mission
   * sans ce geste dans ce dépôt aujourd'hui.
   */
  private async recordFieldAudit(
    workspaceId: string,
    missionId: string,
    actorId: string,
    entries: readonly { field: string; oldValue: string | null; newValue: string | null }[],
  ): Promise<void> {
    for (const entry of entries) {
      await this.missions.manager.query(
        `INSERT INTO record_field_audit (workspace_id, entity_type, entity_id, field, old_value, new_value, source, actor_id)
         VALUES ($1, 'mission', $2, $3, $4, $5, 'human', $6)`,
        [workspaceId, missionId, entry.field, entry.oldValue, entry.newValue, actorId],
      )
    }
  }

  /**
   * Crée une mission. Le compte doit appartenir au périmètre de l'appelant.
   *
   * #2561/#2562 — `origin` est INTERNE : seule la reprise d'une vente Odoo
   * (`MissionOdooSalesService`) le passe, jamais le corps HTTP de
   * `POST missions` (`createMissionRequestSchema` ne le porte pas). Une vente
   * déjà reprise rend sa mission EXISTANTE — même geste idempotent que le
   * projet juste en dessous ; l'index unique partiel tranche la course.
   */
  async create(
    userId: string,
    input: CreateMissionRequest,
    origin?: { odooSaleOrderId: number },
  ): Promise<MissionView> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    // Un identifiant ABSENT est refusé AVANT la lecture, et ce n'est pas
    // défensif pour rien : TypeORM IGNORE une condition dont la valeur est
    // `undefined`, si bien que `findOne({ id: undefined })` rend le premier
    // compte de l'espace et laisse passer le garde juste en dessous. La mission
    // partait alors en base avec `account_id = NULL`, et c'est la contrainte
    // SQL — pas le code — qui finissait par le dire (recette du 21/08/2026).
    if (!input.accountId) throw new BadRequestException('Une mission se rattache à un compte.')
    const account = await this.accounts.findOne({
      where: { id: input.accountId, workspace_id: workspaceId },
      select: ['id'],
    })
    if (!account) throw new NotFoundException('Compte introuvable dans votre espace de travail.')

    // Une fin avant le début n'est pas une saisie « à corriger plus tard » : elle
    // produirait une fenêtre de renouvellement « en retard » dès la création, donc
    // une alerte permanente et fausse.
    if (input.startedOn && input.endsOn && input.endsOn < input.startedOn) {
      throw new BadRequestException('La fin de mission ne peut pas précéder son début.')
    }

    // #2562 — le deal CRM dont cette mission est la REPRISE, vérifié dans
    // L'ESPACE de l'appelant. Même raison que le compte au-dessus : un
    // identifiant deviné d'un autre espace ne doit jamais rattacher une
    // mission au cache CRM d'un concurrent.
    if (input.crmDealId) {
      const deal = await this.crmDealFacts.findOne({
        where: { id: input.crmDealId, workspace_id: workspaceId },
      })
      if (!deal) throw new NotFoundException('Ce deal CRM est introuvable dans votre espace de travail.')
    }

    // #2339.7 — le POSITIONNEMENT dont cette mission est la CONVERSION,
    // vérifié dans L'ESPACE de l'appelant. Même raison que le deal CRM juste
    // au-dessus : un identifiant deviné d'un autre espace ne doit jamais
    // rattacher une mission au positionnement d'un concurrent.
    let positioning: Pick<SubmissionEntity, 'id' | 'consultant_id' | 'daily_cost_cents'> | null = null
    if (input.submissionId) {
      const submission = await this.submissions.findOne({
        where: { id: input.submissionId, workspace_id: workspaceId },
        select: ['id', 'consultant_id', 'daily_cost_cents'],
      })
      if (!submission) throw new NotFoundException('Ce positionnement est introuvable dans votre espace de travail.')
      positioning = submission
    }

    // #2560.6 — DÉCISION LOUIS 18/09/2026 : le consultant DÉSIGNÉ à la
    // création, vérifié dans L'ESPACE de l'appelant AVANT toute écriture
    // (GA-11/GA-12) — même garde que le compte et le deal CRM juste
    // au-dessus : un identifiant deviné d'un autre espace ne doit jamais
    // rattacher une mission à un talent qu'il ne devrait pas voir.
    let designatedConsultant: Pick<ConsultantEntity, 'id' | 'full_name' | 'photo_url'> | null = null
    if (input.consultantId) {
      designatedConsultant = await this.consultants.findOne({
        where: { id: input.consultantId, workspace_id: workspaceId },
        select: ['id', 'full_name', 'photo_url'],
      })
      if (!designatedConsultant) throw new BadRequestException('Ce talent n’appartient pas à ton espace')
    }

    // #4559 — l'affaire (`opportunity_id`) et le besoin (`need_id`) sont des
    // identifiants ÉTRANGERS stockés sur la mission, puis relus pour leur
    // libellé : ils doivent appartenir à L'ESPACE de l'appelant, vérifié ICI,
    // avant toute écriture. Sans cela l'intitulé d'une affaire d'un autre
    // espace ressortait sur la mission. Refus clair, jamais un `null` muet.
    if (
      input.opportunityId &&
      (await this.projects.count({ where: { id: input.opportunityId, workspace_id: workspaceId } })) === 0
    ) {
      throw new NotFoundException('Ce projet est introuvable dans votre espace de travail.')
    }
    if (input.needId && (await this.needs.count({ where: { id: input.needId, workspace_id: workspaceId } })) === 0) {
      throw new NotFoundException('Ce besoin est introuvable dans votre espace de travail.')
    }

    // Une affaire porte UNE mission PAR positionnement retenu (BEL-FIX-001 du
    // 26/08, élargi par #4192) : sans positionnement, une seule mission
    // (`missions_opportunity_nosub_uniq`) ; avec, une par positionnement
    // (`missions_opportunity_submission_uniq`).
    //
    // Le chemin est devenu vivant en août : `create_mission` est le seul effet
    // de déplacement exécuté par le serveur, et il arrive PRÉ-COCHÉ sur `won`.
    // Le garde-fou d'écran ne couvre que la SORTIE de `won` — un `perdu → gagné`
    // ou deux clics repassent ici avec la case cochée. Et une mission ne se
    // supprime pas : le doublon serait définitif, avec son relevé, sa
    // facturation et sa marge en double.
    //
    // On rend la mission EXISTANTE plutôt que d'échouer : le geste de
    // l'utilisateur — « ce projet est gagné » — est légitime, c'est sa
    // répétition qui ne doit rien produire. Et on ne réécrit rien au passage :
    // le second appel ne sait pas ce qui a été ajusté sur la mission depuis.
    //
    // La lecture est scopée à l'espace. Sans elle, un identifiant de projet
    // deviné rendrait la mission d'un autre espace, et l'appel se croirait
    // idempotent en la renvoyant.
    if (input.opportunityId) {
      const existing = await this.missions.findOne({
        where: {
          workspace_id: workspaceId,
          opportunity_id: input.opportunityId,
          submission_id: input.submissionId ?? IsNull(),
        },
      })
      if (existing) return this.decorate(existing, [], false)
    }

    // #2561/#2562 — une vente Odoo ne devient qu'UNE mission par espace.
    if (origin?.odooSaleOrderId) {
      const existing = await this.missions.findOne({
        where: { workspace_id: workspaceId, odoo_sale_order_id: origin.odooSaleOrderId },
      })
      if (existing) return this.decorate(existing, [], false)
    }

    // #2191.31 — DÉDOUBLONNAGE : une mission déjà ouverte sur le MÊME besoin,
    // pour le MÊME consultant, sur une période qui CHEVAUCHE. Ne se déclenche
    // que quand les DEUX sont désignés : un besoin seul ne suffit pas à
    // dédoublonner, `headcount > 1` autorise plusieurs consultants distincts
    // sur le même besoin, et ce ne serait alors pas un doublon.
    if (input.needId && input.consultantId) {
      const duplicate = await this.duplicateMissionForNeedAndConsultant(
        workspaceId,
        input.needId,
        input.consultantId,
        input.startedOn ?? today(),
        input.endsOn ?? null,
      )
      if (duplicate) return this.decorate(duplicate, [], false)
    }

    const inherited = await this.inheritProjectContext(workspaceId, input.opportunityId)
    // #2191.17 / #2191.18 — le télétravail et le lieu, repris du BESOIN quand
    // le rôle d'origine est certain (`input.needId`, posé par `soleNeedOf`
    // côté Projets). Une lecture indépendante de `inheritProjectContext` :
    // l'affaire peut porter plusieurs besoins sans qu'aucun ne soit certain,
    // et alors `needId` est absent — ce spread-ci rend `{}`.
    const { supervised: inheritedSupervision, ...inheritedNeed } = await this.inheritNeedContext(
      workspaceId,
      input.needId,
    )

    // #3547 — le FORFAIT ENCADRÉ. L'appelant qui le dit gagne ; sinon la mission
    // reprend celui de son besoin (la nature `inconnu` posée par la conversion
    // devient `forfait` : c'est celle que le besoin a déclarée). Cohérence dite en
    // clair AVANT l'écriture — le CHECK SQL n'est que le filet.
    const inherits = input.deliveryMode === undefined && inheritedSupervision !== null
    const contractKind = inherits && (input.contractKind ?? 'inconnu') === 'inconnu' ? 'forfait' : input.contractKind
    const deliveryMode: DeliveryMode = input.deliveryMode ?? (inherits ? 'supervised' : 'staffed')
    const supervision =
      deliveryMode === 'supervised'
        ? inherits
          ? inheritedSupervision
          : {
              supervision_role: input.supervisionRole ?? null,
              client_team_size: input.clientTeamSize ?? null,
              client_team_names: input.clientTeamNames ?? [],
            }
        : { supervision_role: null, client_team_size: null, client_team_names: [] }
    const [modeProblem] = deliveryModeProblems({
      contract_kind: contractKind ?? 'inconnu',
      delivery_mode: deliveryMode,
      supervision_role: input.supervisionRole,
      client_team_size: input.clientTeamSize,
      client_team_names: input.clientTeamNames,
    })
    if (modeProblem) {
      throw new BadRequestException(
        modeProblem === 'supervised_needs_forfait'
          ? 'Le forfait encadré n’existe qu’au forfait : choisis la nature « Forfait ».'
          : 'Un rôle tenu ou une équipe côté client n’a de sens qu’en forfait encadré.',
      )
    }

    const mission = await this.missions.save(
      this.missions.create({
        workspace_id: workspaceId,
        user_id: userId,
        account_id: input.accountId,
        opportunity_id: input.opportunityId ?? null,
        // Le RÔLE d'origine (migration `1791001000001`, arbitrage du
        // 31/08/2026). Écrit tel qu'il ARRIVE, jamais deviné : l'appelant est le
        // seul à savoir quel besoin cette mission pourvoit, et
        // `applyStageActions` ne le transmet que lorsque l'affaire ne porte
        // qu'un seul rôle. `null` = « rôle d'origine inconnu », jamais « aucun
        // rôle » — c'est cette différence que le bandeau Staffing d'une fiche
        // besoin rend, et elle disparaîtrait derrière un repli.
        need_id: input.needId ?? null,
        // #2561/#2562 — le deal CRM dont cette mission est la REPRISE. Vérifié
        // dans l'espace juste au-dessus ; `null` = pas de correspondance
        // connue, le cas ordinaire.
        crm_deal_id: input.crmDealId ?? null,
        // #2339.7 — le positionnement dont cette mission est la conversion.
        // Vérifié dans l'espace juste au-dessus ; `null` = pas de
        // positionnement connu, le cas ordinaire.
        submission_id: input.submissionId ?? null,
        // #2561/#2562 — la vente Odoo reprise ; `null` hors reprise.
        odoo_sale_order_id: origin?.odooSaleOrderId ?? null,
        ...inherited,
        ...inheritedNeed,
        // La société qui facturera (D9). Absente = espace mono-société, le cas
        // ordinaire — on n'en invente pas une par défaut.
        legal_entity_id: input.legalEntityId ?? null,
        label: input.label,
        // Une mission qui n'a pas commencé est en onboarding : c'est l'état où le
        // travail (contrats, accès, matériel) a lieu, et le confondre avec
        // « active » ferait perdre la seule fenêtre où il est utile de le suivre.
        status: input.startedOn && input.startedOn <= today() ? 'active' : 'onboarding',
        started_on: input.startedOn ?? null,
        ends_on: input.endsOn ?? null,
        daily_rate: input.dailyRate ?? null,
        // ⚠️ `daily_cost` n'est PLUS écrite ici — décision D43 du 28/08/2026.
        //
        // Elle était le seul chemin d'écriture de la colonne, et personne ne
        // l'empruntait : ni le web, ni le service IA, ni `create_mission` (le
        // seul appelant interne, qui dit en toutes lettres « ni TJM, ni
        // dates »). Le coût chargé se saisit dans les conditions commerciales.
        //
        // Retirer le MOYEN et pas seulement l'usage : laisser le champ ouvert
        // ferait atterrir une valeur dans une colonne que plus rien ne lit —
        // exactement le défaut inverse, et tout aussi invisible.

        // `inconnu` par défaut, décidé dans le contrat : une mission dont
        // personne n'a dit la nature ne doit pas réclamer un relevé d'activité
        // comme si elle était en régie.
        contract_kind: contractKind ?? 'inconnu',
        delivery_mode: deliveryMode,
        supervision_role: supervision?.supervision_role ?? null,
        client_team_size: supervision?.client_team_size ?? null,
        client_team_names: supervision?.client_team_names ?? [],
        role_title: input.roleTitle ?? null,
        billing_contact_id: input.billingContactId ?? null,
        // Le propriétaire par défaut est le créateur — vrai au moment de
        // l'écriture, et le laisser vide ferait disparaître la mission de
        // toute vue « les miennes ».
        owner_id: input.ownerId ?? userId,
        // #2320.21 — les DEUX rails, jamais devinés : `null` quand l'appelant
        // ne les déclare pas, le cas ordinaire d'une mission créée sans que
        // les accords aient été formellement recueillis à cet instant.
        client_agreement: input.clientAgreement ?? null,
        client_agreement_date: input.clientAgreementDate ?? null,
        consultant_agreement: input.consultantAgreement ?? null,
        consultant_agreement_date: input.consultantAgreementDate ?? null,
      }),
    )

    // #2407.3 — le CLIENT et l'INTITULÉ ne se posent qu'ICI : aucune route de
    // mise à jour ne les touche ensuite (`updateMissionRequestSchema` ne les
    // porte pas). Sans cette écriture, `GET …/field-sources` rendait `null`
    // sur les deux pour TOUTE mission, même fraîchement créée — un correctif
    // de lecture inerte, faute d'écrivain.
    await this.recordFieldAudit(workspaceId, mission.id, userId, [
      { field: 'account_id', oldValue: null, newValue: input.accountId },
      { field: 'label', oldValue: null, newValue: input.label },
    ])

    // #2320.1/#2339.7 — la mission entre dans le journal de la chaîne
    // commerciale (`commercial_transitions`), APRÈS l'état qu'il ne fait
    // qu'enregistrer — même ordre que `ProjectPipelineService.changeNeedStatus`
    // et `ShortlistService.create`. `proof` nomme le positionnement retenu
    // quand il est connu : c'est la PREUVE que ce point du chantier #2795
    // nommait absente (« mission toujours non câblée dans le journal »).
    await this.commercialTransitions.record({
      workspaceId,
      subjectType: 'mission',
      subjectId: mission.id,
      fromState: null,
      toState: mission.status,
      actorId: userId,
      proof: input.submissionId ? `submission:${input.submissionId}` : null,
    })

    // #2560.6 — l'affectation s'écrit APRÈS la mission : `mission_id` est une
    // clé étrangère de `mission_assignments`, l'affectation ne peut pas
    // exister avant elle. `startsOn` hérite du début de la mission quand il
    // est connu, sinon AUJOURD'HUI — on affecte MAINTENANT, jamais une date
    // devinée. `assigneesByMission` (et non une liste construite à la main
    // ici) : c'est la MÊME lecture, filtrée « toujours en cours », que la
    // fiche verra à son prochain chargement — deux calculs du même fait
    // divergeraient dès qu'une fin d'affectation serait déjà passée.
    let assignees: MissionAssignee[] | null = null
    if (designatedConsultant && input.consultantId) {
      await this.staffing.assign(userId, mission.id, {
        consultantId: input.consultantId,
        loadPercent: 100,
        startsOn: input.startedOn ?? today(),
        endsOn: input.endsOn ?? null,
      })
      const grouped = await this.assigneesByMission([mission.id])
      assignees = grouped?.get(mission.id) ?? null
    }

    // #4191 G4 — le coût journalier CHARGÉ voyage avec la signature : celui du
    // positionnement, à défaut celui du talent (D43 : il vit dans les conditions
    // commerciales, jamais dans `missions.daily_cost`). Absent = AUCUNE ligne,
    // la marge reste « non mesurée ». Jamais d'écrasement d'une saisie.
    await this.carryLoadedCost(workspaceId, mission.id, positioning, input.consultantId)

    // Une mission qu'on vient de créer n'a ni relevé ni marge calculable : le
    // drapeau est à `false` par constat, pas par prudence. Le coût reporté n'est
    // PAS rendu ici : cette route n'exige pas `finance:read`.
    return this.decorate(mission, [], false, { accountName: null, assignees, loadedDailyCostCents: null })
  }

  /**
   * #4191 G4 — reporte le coût journalier chargé du positionnement (à défaut du
   * talent) dans `mission_commercial_terms`. `DO NOTHING` : une ligne déjà saisie
   * à la main gagne toujours. Le canal reste à son défaut (`unknown`) : on ne
   * devine ni la nature ni le canal d'un coût.
   */
  private async carryLoadedCost(
    workspaceId: string,
    missionId: string,
    positioning: Pick<SubmissionEntity, 'consultant_id' | 'daily_cost_cents'> | null,
    designatedConsultantId: string | undefined,
  ): Promise<void> {
    const consultantId = designatedConsultantId ?? positioning?.consultant_id
    const positioned = positioning?.daily_cost_cents == null ? null : Number(positioning.daily_cost_cents)
    let consultantCost: number | null = null
    if (carriedLoadedDailyCostCents(positioned, null) === null && consultantId) {
      const consultant = await this.consultants.findOne({
        where: { id: consultantId, workspace_id: workspaceId },
        select: ['id', 'cost_rate_cents'],
      })
      consultantCost = consultant?.cost_rate_cents == null ? null : Number(consultant.cost_rate_cents)
    }
    const cents = carriedLoadedDailyCostCents(positioned, consultantCost)
    if (cents === null) return
    await this.terms.manager.query(
      `INSERT INTO mission_commercial_terms (mission_id, workspace_id, loaded_daily_cost_cents)
       VALUES ($1, $2, $3)
       ON CONFLICT (mission_id) DO NOTHING`,
      [missionId, workspaceId, cents],
    )
  }

  /**
   * RÉPARER une fiche de mission — contact de facturation, dates, TJM vendu.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CETTE ROUTE EXISTE
   * ─────────────────────────────────────────────────────────────────────────
   * `BLOCKER_ACTIONS` promet un geste et une route pour chacun des bloqueurs de
   * facturation. Trois d'entre eux — `missing_billing_contact`, `missing_rate`,
   * `missing_start_date` — pointaient sur `/missions`, où RIEN ne savait les
   * écrire : ces colonnes n'étaient renseignées qu'à la CRÉATION (et, pour le
   * contact de facturation, uniquement par le semis de démonstration). Une
   * mission créée sans elles restait bloquée pour toujours, avec un bloqueur
   * qui nommait un geste inexistant — exactement le défaut « lecture plus large
   * que l'écriture » que le dépôt traque.
   *
   * Trois règles, chacune pour un accident précis :
   *
   *  - **Un contact de facturation appartient au COMPTE de la mission.** Même
   *    garde que le contact CRA : un contact d'un autre compte n'a aucune
   *    raison de recevoir CETTE facture, et l'accepter romprait le lien
   *    mission → compte → contact que le reste de l'écran suppose.
   *  - **La cohérence des dates se juge sur la ligne FUSIONNÉE.** Un corps
   *    partiel ne dit rien de l'autre borne : n'envoyer que `endsOn` doit être
   *    refusé s'il précède le début DÉJÀ enregistré.
   *  - **Absent ≠ `null`.** Un champ absent est inchangé, un champ à `null` est
   *    effacé — « je n'y touche pas » n'est pas « il n'y en a pas ».
   */
  async updateMission(userId: string, missionId: string, input: UpdateMissionRequest): Promise<MissionView> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const mission = await this.missions.findOne({ where: { id: missionId, workspace_id: workspaceId } })
    if (!mission) throw new NotFoundException('Cette mission est introuvable dans votre espace de travail.')

    if (input.billingContactId) {
      const rows = await this.missions.manager.query<{ id: string }[]>(
        `SELECT id FROM contacts WHERE id = $1 AND account_id = $2 LIMIT 1`,
        [input.billingContactId, mission.account_id],
      )
      if (rows.length === 0) {
        throw new BadRequestException('Ce contact n’appartient pas au compte de la mission.')
      }
    }

    const startedOn = input.startedOn === undefined ? mission.started_on : input.startedOn
    const endsOn = input.endsOn === undefined ? mission.ends_on : input.endsOn
    if (startedOn && endsOn && endsOn < startedOn) {
      throw new BadRequestException('La fin de mission ne peut pas précéder son début.')
    }

    // #2407.10 / #2417.7 — NO-GO : un TJM qui change n'écrase jamais le CA déjà
    // produit sur les mois clos. Avant d'ÉCRASER `daily_rate`, on ferme la
    // fenêtre de l'ANCIEN tarif dans `mission_rate_history` : c'est cette table
    // que `RevenueService.produced()` consulte pour choisir le tarif d'un mois
    // PASSÉ plutôt que le tarif COURANT. Rien à fermer si l'ancien tarif était
    // `null` (rien n'a encore été produit avec un tarif qui n'existait pas) ou
    // si le tarif ne change pas (un `PUT` qui renvoie la même valeur n'écrase
    // rien).
    if (input.dailyRate !== undefined && input.dailyRate !== mission.daily_rate && mission.daily_rate !== null) {
      await this.missions.manager.query(
        `INSERT INTO mission_rate_history (mission_id, workspace_id, daily_rate, effective_from, effective_to)
         VALUES (
           $1, $2, $3,
           COALESCE(
             (SELECT effective_to FROM mission_rate_history WHERE mission_id = $1 ORDER BY effective_from DESC LIMIT 1),
             $4::date
           ),
           $5::date
         )`,
        [missionId, workspaceId, mission.daily_rate, mission.started_on ?? today(), today()],
      )
    }

    // #2407.3 — reco appliquée (decisions §1) : la PROVENANCE des seuls champs
    // DISPUTÉS en pratique (dates, TJM), tracée à chaque changement — qui, quand,
    // d'où (`human` : la fiche). Lue par `GET …/field-sources`.
    const disputed: [string, unknown, unknown][] = [
      ['started_on', mission.started_on, input.startedOn],
      ['ends_on', mission.ends_on, input.endsOn],
      ['daily_rate', mission.daily_rate, input.dailyRate],
    ]
    const asText = (value: unknown): string | null =>
      value === null || value === undefined
        ? null
        : value instanceof Date
          ? value.toISOString().slice(0, 10)
          : String(value)
    for (const [field, before, after] of disputed) {
      if (after === undefined || asText(before) === asText(after)) continue
      await this.recordFieldAudit(workspaceId, missionId, userId, [
        { field, oldValue: asText(before), newValue: asText(after) },
      ])
    }

    if (input.billingContactId !== undefined) mission.billing_contact_id = input.billingContactId
    if (input.startedOn !== undefined) mission.started_on = input.startedOn
    if (input.endsOn !== undefined) mission.ends_on = input.endsOn
    if (input.dailyRate !== undefined) mission.daily_rate = input.dailyRate
    // #1518 — la société PORTEUSE. `null` détache ; la colonne existait déjà et
    // n'avait aucun écrivain de production.
    if (input.legalEntityId !== undefined) mission.legal_entity_id = input.legalEntityId
    // #2953 (#2193.17/.18) — `undefined` laisse le champ intact, `null` ou une
    // chaîne blanche l'efface — même geste que `note` sur `PartnersService.qualify`.
    if (input.objective !== undefined) mission.objective = input.objective?.trim() || null
    if (input.perimeter !== undefined) mission.perimeter = input.perimeter?.trim() || null

    // X66 / #3547 — le mode de réalisation d'une mission EXISTANTE. Cohérence
    // vérifiée sur la ligne FUSIONNÉE, avant toute écriture ; repasser en staffé
    // efface le rôle et l'équipe (le CHECK SQL n'est que le filet).
    const touchesMode =
      input.deliveryMode !== undefined ||
      input.supervisionRole !== undefined ||
      input.clientTeamSize !== undefined ||
      input.clientTeamNames !== undefined
    if (touchesMode) {
      const nextMode = (input.deliveryMode ?? mission.delivery_mode) as DeliveryMode
      const next =
        nextMode === 'supervised'
          ? {
              supervision_role: (input.supervisionRole !== undefined
                ? input.supervisionRole
                : mission.supervision_role) as SupervisionRole | null,
              client_team_size: input.clientTeamSize !== undefined ? input.clientTeamSize : mission.client_team_size,
              client_team_names: input.clientTeamNames ?? mission.client_team_names ?? [],
            }
          : // Repasser en staffé EST un geste légitime qui vide ; ENVOYER un rôle ou une
            // équipe avec un mode staffé est une incohérence, refusée ci-dessous.
            input.deliveryMode === 'staffed'
            ? { supervision_role: null, client_team_size: null, client_team_names: [] as string[] }
            : {
                supervision_role: (input.supervisionRole ?? null) as SupervisionRole | null,
                client_team_size: input.clientTeamSize ?? null,
                client_team_names: input.clientTeamNames ?? [],
              }
      const [modeProblem] = deliveryModeProblems({
        contract_kind: mission.contract_kind,
        delivery_mode: nextMode,
        ...next,
      })
      if (modeProblem) {
        throw new BadRequestException(
          modeProblem === 'supervised_needs_forfait'
            ? 'Le forfait encadré n’existe qu’au forfait : cette mission n’est pas au forfait.'
            : 'Un rôle tenu ou une équipe côté client n’a de sens qu’en forfait encadré.',
        )
      }
      mission.delivery_mode = nextMode
      mission.supervision_role = next.supervision_role
      mission.client_team_size = next.client_team_size
      mission.client_team_names = next.client_team_names
    }

    const saved = await this.missions.save(mission)
    // Ni relevés ni coût chargé relus ici : cette route ne touche à aucun des
    // deux, et les relire pour décorer ferait payer une lecture à un geste qui
    // n'en a pas besoin. `false` = « pas lu », jamais « pas de marge ».
    return this.decorate(saved, [], false)
  }

  /**
   * #2195.22 à .29 — POSER LE STATUT DE RENOUVELLEMENT, et l'ATTRIBUER.
   *
   * ═══════════════════════════════════════════════════════════════════════════
   * CE QUE CETTE MÉTHODE EST, ET CE QU'ELLE N'EST PAS
   * ═══════════════════════════════════════════════════════════════════════════
   * C'est le seul écrivain de `missions.renewal_status`. Il n'y en a pas
   * d'autre, et c'est voulu : un statut qu'une seconde route poserait sans
   * horodatage rendrait « depuis quand attend-on ce retour ? » insoluble.
   *
   * ⚠️ Rien n'est DÉDUIT ici. Le statut ne se calcule pas depuis la fenêtre
   * d'échéance, ni depuis les risques, ni depuis l'activité — il est SAISI. Le
   * déduire aurait fabriqué exactement le pronostic que #2195.25 refuse.
   *
   * `renewal_status_at` et `renewal_status_by` voyagent avec la valeur : sans
   * eux, un « Reconduction annoncée » posé en mars se lirait comme une nouvelle
   * fraîche en septembre. « On archive, on ne supprime pas » — un fait périmé
   * redevient inconnu AVEC SA DATE, il ne se tait pas.
   */
  async setRenewalStatus(
    userId: string,
    missionId: string,
    input: SetRenewalStatusRequest,
    now: Date = new Date(),
  ): Promise<MissionView> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    // Le périmètre d'espace est DANS le `where` et non vérifié après coup : une
    // mission d'un autre espace doit être introuvable, pas refusée — la
    // différence entre les deux réponses dit si l'identifiant existe.
    const mission = await this.missions.findOne({ where: { id: missionId, workspace_id: workspaceId } })
    if (!mission) throw new NotFoundException('Cette mission est introuvable dans votre espace de travail.')

    /**
     * #2413.57 / #2413.67 — LE NO-GO : « renouvelé » exige les DEUX rails.
     *
     * Un accord oral rapporté par le manager, seul, ne suffit plus à faire
     * passer une mission à `renouvele` — il faut que le rail client ET le rail
     * consultant aient répondu `oui` à la poursuite (`canConfirmRenewal`,
     * `@bellum/contracts`). Les sept autres valeurs de `RENEWAL_STATUSES` ne
     * sont PAS concernées : le garde-fou porte sur la confirmation, pas sur le
     * fait d'ouvrir ou de faire avancer la discussion.
     */
    if (
      input.status === 'renouvele' &&
      !canConfirmRenewal(mission.renewal_client_rail, mission.renewal_consultant_rail)
    ) {
      throw new BadRequestException(RENEWAL_CONFIRMATION_REQUIRES_BOTH_RAILS)
    }

    mission.renewal_status = input.status
    // `null` remet la ligne à « non renseigné » — et la TRACE part avec, sinon
    // on garderait l'auteur d'une décision qui n'existe plus.
    mission.renewal_status_at = input.status === null ? null : now
    mission.renewal_status_by = input.status === null ? null : userId

    const saved = await this.missions.save(mission)
    // Comme `updateMission` : ni relevés ni coût chargé relus, `false` = « pas
    // lu » et jamais « pas de marge ». L'écran recharge la liste derrière.
    return this.decorate(saved, [], false)
  }

  /**
   * #2413.49 à .52 — POSER le rail CLIENT.
   *
   * Écrivain à part, symétrique de `setRenewalStatus` : une réponse de rail
   * n'est pas le statut qu'elle étaye, et les deux gardent leur propre trace
   * (`updatedAt`/`updatedBy` DANS le rail, pas de colonne à côté — GA-26, un
   * seul endroit).
   */
  async setRenewalClientRail(
    userId: string,
    missionId: string,
    input: SetRenewalClientRailRequest,
    now: Date = new Date(),
  ): Promise<MissionView> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const mission = await this.missions.findOne({ where: { id: missionId, workspace_id: workspaceId } })
    if (!mission) throw new NotFoundException('Cette mission est introuvable dans votre espace de travail.')

    mission.renewal_client_rail = {
      intent: input.intent,
      scope: input.scope,
      budget: input.budget,
      process: input.process,
      updatedAt: now.toISOString(),
      updatedBy: userId,
    }

    const saved = await this.missions.save(mission)
    return this.decorate(saved, [], false)
  }

  /** #2413.53 à .56 — POSER le rail CONSULTANT, symétrique du rail client. */
  async setRenewalConsultantRail(
    userId: string,
    missionId: string,
    input: SetRenewalConsultantRailRequest,
    now: Date = new Date(),
  ): Promise<MissionView> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const mission = await this.missions.findOne({ where: { id: missionId, workspace_id: workspaceId } })
    if (!mission) throw new NotFoundException('Cette mission est introuvable dans votre espace de travail.')

    mission.renewal_consultant_rail = {
      intent: input.intent,
      conditions: input.conditions,
      availability: input.availability,
      otherOptions: input.otherOptions,
      updatedAt: now.toISOString(),
      updatedBy: userId,
    }

    const saved = await this.missions.save(mission)
    return this.decorate(saved, [], false)
  }

  /**
   * #2195.33 — RATTACHER UNE AFFAIRE DE RENOUVELLEMENT À SA MISSION.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * POURQUOI CETTE MÉTHODE VIT ICI ET PAS DANS `projects`
   * ───────────────────────────────────────────────────────────────────────────
   * `missions` appartient à ce module. Ouvrir un chemin d'écriture vers cette
   * table depuis le module `projects` serait, à l'envers, exactement ce que la
   * décision du 16/09 refusait dans l'autre sens : créer une affaire depuis
   * `delivery`. Chaque module écrit dans SA table (GA-07), et le contrôleur —
   * qui a déjà résolu l'espace et tranché le droit — orchestre les deux.
   *
   * ⚠️ `opportunity_id` n'est JAMAIS touché : il nomme l'affaire qui a produit
   * la mission, pas celle qui la prolonge. Les confondre ferait perdre l'origine
   * de la mission dès le premier renouvellement.
   *
   * ⚠️ Écriture IDEMPOTENTE et non destructive : si la mission porte déjà une
   * affaire de renouvellement, on ne l'écrase pas — on rend `false`, et
   * l'appelant le DIT. Remplacer silencieusement ferait disparaître du pipe une
   * affaire que quelqu'un suit.
   *
   * Rend `true` seulement si le lien a réellement été posé. Aucune exception :
   * l'affaire est déjà créée à ce stade, et faire échouer la réponse HTTP
   * transformerait un lien manquant en création perdue.
   */
  async linkRenewalOpportunity(workspaceId: string, missionId: string, opportunityId: string): Promise<boolean> {
    try {
      // Le périmètre d'espace est DANS le `where` : une mission d'un autre
      // espace est introuvable, pas refusée.
      const mission = await this.missions.findOne({ where: { id: missionId, workspace_id: workspaceId } })
      if (!mission) return false
      if (mission.renewal_opportunity_id) return false
      mission.renewal_opportunity_id = opportunityId
      await this.missions.save(mission)
      return true
    } catch (err) {
      this.logger.error('linkRenewalOpportunity error', { error: err })
      return false
    }
  }

  /**
   * Le contexte HÉRITÉ du projet à la conversion (addendum Stelya §9.1).
   *
   * La règle était écrite dans le docblock de `mission.entity.ts` et
   * implémentée nulle part : les trois colonnes sont restées vides depuis leur
   * migration. Une mission née d'un projet « automatisation d'une ligne
   * automobile » ne portait donc aucun secteur, et le contexte de la demande
   * s'arrêtait à la signature.
   *
   * Trois refus, chacun pour un accident précis :
   *
   *  - **Rien sans projet.** Une mission créée à la main n'hérite de rien ; lui
   *    donner le secteur du COMPTE serait exactement l'erreur que C05 corrige.
   *  - **Rien à copier ⇒ rien d'estampillé.** `inherited_from_project_at` dit
   *    qu'une copie a eu lieu ; le poser sur une copie vide ferait croire que le
   *    projet n'avait pas de secteur alors que, peut-être, on n'a pas su lire.
   *  - **Un échec de lecture ne fait pas tomber la création.** Une mission qui
   *    ne part pas coûte plus cher qu'une mission sans secteur, qui reste
   *    saisissable ensuite.
   */
  private async inheritProjectContext(
    workspaceId: string,
    opportunityId: string | undefined,
  ): Promise<Partial<MissionEntity>> {
    if (!opportunityId) return {}
    try {
      const project = await this.projects.findOne({
        where: { id: opportunityId },
        select: ['id', 'workspace_id', 'application_sector_codes', 'primary_domain_code'],
      })
      // Défense en profondeur : le projet d'un AUTRE espace n'apporte pas son
      // contexte, même si son identifiant a été deviné.
      if (!project || (project.workspace_id && project.workspace_id !== workspaceId)) return {}

      const sectors = project.application_sector_codes ?? []
      const domain = project.primary_domain_code ?? null
      if (sectors.length === 0 && !domain) return {}

      return {
        application_sector_codes: sectors,
        primary_domain_code: domain,
        inherited_from_project_at: new Date(),
      }
    } catch (err) {
      this.logger.error('inheritProjectContext failed', { error: err, tags: { opportunityId } })
      return {}
    }
  }

  /**
   * #2191.17 / #2191.18 — LE TÉLÉTRAVAIL ET LE LIEU DU BESOIN, à LA MÊME
   * CONDITION que `soleNeedOf` (`projects.controller.ts`) : `needId` n'arrive
   * que lorsque le rôle d'origine est CERTAIN. Symétrique à
   * `inheritProjectContext` juste au-dessus, mais sur `project_needs` plutôt
   * que `projects` — lecture SEULE, le module Projets n'est toujours pas
   * importé.
   *
   * Rend TOUJOURS les deux clés (jamais un `{}` partiel comme
   * `inheritProjectContext`) : `null` explicite — jamais deviné — sans besoin
   * désigné, besoin introuvable, besoin d'un AUTRE espace, ou valeur que le
   * besoin lui-même n'a pas déclarée.
   *
   * ⚠️ Un échec de lecture ne fait PAS échouer la création, même raison que
   * `inheritProjectContext` : la mission est le geste demandé.
   */
  private async inheritNeedContext(
    workspaceId: string,
    needId: string | undefined,
  ): Promise<Pick<MissionEntity, 'remote_preference' | 'location'> & { supervised: InheritedSupervision | null }> {
    const nothing = { remote_preference: null, location: null, supervised: null } as const
    if (!needId) return nothing
    try {
      const need = await this.needs.findOne({
        where: { id: needId },
        select: [
          'id',
          'workspace_id',
          'remote',
          'location',
          'delivery_mode',
          'supervision_role',
          'client_team_size',
          'client_team_names',
        ],
      })
      // Défense en profondeur : le besoin d'un AUTRE espace n'apporte pas son
      // contexte, même si son identifiant a été deviné.
      if (!need || (need.workspace_id && need.workspace_id !== workspaceId)) return nothing
      return {
        remote_preference: need.remote,
        location: need.location,
        // #3547 — le FORFAIT ENCADRÉ se transmet à la signature : un besoin
        // encadré donne une mission encadrée, sans que personne ne le ressaisisse.
        supervised:
          need.delivery_mode === 'supervised'
            ? {
                supervision_role: need.supervision_role,
                client_team_size: need.client_team_size,
                client_team_names: need.client_team_names ?? [],
              }
            : null,
      }
    } catch (err) {
      this.logger.error('inheritNeedContext failed', { error: err, tags: { needId } })
      return nothing
    }
  }

  /**
   * #2191.31 — DÉDOUBLONNAGE : une mission déjà OUVERTE sur le MÊME besoin,
   * pour le MÊME consultant, sur une PÉRIODE qui chevauche.
   *
   * Même doctrine que l'idempotence par `opportunity_id`, un peu plus haut
   * dans `create()` : on REND la mission existante plutôt que d'échouer — le
   * geste (« staffer ce besoin avec ce consultant ») est légitime, sa
   * répétition ne doit rien produire de plus. `headcount > 1` reste possible :
   * DEUX consultants DIFFÉRENTS sur le même besoin ne se dédoublonnent JAMAIS
   * l'un l'autre, seule la PAIRE (besoin, consultant) compte.
   *
   * Chevauchement d'intervalles à bornes ouvertes : une fin `NULL` (l'un ou
   * l'autre) ne borne rien de ce côté-là.
   *
   * ⚠️ Un échec de lecture ne fait PAS échouer la création, même raison que
   * `inheritProjectContext`/`inheritNeedContext` : la mission est le geste
   * demandé, la détection n'en est qu'un garde-fou.
   */
  private async duplicateMissionForNeedAndConsultant(
    workspaceId: string,
    needId: string,
    consultantId: string,
    startedOn: string,
    endsOn: string | null,
  ): Promise<MissionEntity | null> {
    try {
      const rows = await this.missions.manager.query<{ id: string }[]>(
        `
          SELECT m.id
          FROM missions m
          JOIN mission_assignments a ON a.mission_id = m.id
          WHERE m.workspace_id = $1
            AND m.need_id = $2
            AND a.consultant_id = $3
            AND (a.ends_on IS NULL OR a.ends_on >= $4)
            AND ($5::date IS NULL OR a.starts_on <= $5)
          LIMIT 1
        `,
        [workspaceId, needId, consultantId, startedOn, endsOn],
      )
      const id = rows[0]?.id
      if (!id) return null
      return await this.missions.findOne({ where: { id, workspace_id: workspaceId } })
    } catch (err) {
      this.logger.error('duplicateMissionForNeedAndConsultant failed', { error: err, tags: { needId, consultantId } })
      return null
    }
  }

  /**
   * L'AUTRE mission qui occupe CE consultant pendant CE mois, s'il y en a une.
   *
   * Le relevé porte sur UNE mission ; si le même consultant a AUSSI une
   * affectation qui chevauche le même mois sur une AUTRE mission, les jours
   * du mois ont pu se partager entre les deux relevés sans que rien ne le
   * dise — un mois à cheval sur deux missions se lisait comme un mois plein
   * sur une seule.
   *
   * Signal, pas un refus : deux missions courtes le même mois arrivent
   * légitimement, et c'est justement ce que ce signal permet de vérifier.
   *
   * Best-effort, comme `missionIdsOf` juste au-dessus : une jointure qui
   * échoue ne doit pas empêcher le dépôt du relevé, elle le prive seulement
   * d'un signal de plus.
   */
  /**
   * ⚠️ La REQUÊTE vit désormais dans `timesheet-cross-checks.ts`, partagée avec
   * le tiroir de relecture (`TimesheetsService.review`). Le prédicat est le
   * même des deux côtés : recopié, il aurait divergé, et un relevé déposé sans
   * chevauchement se serait affiché « chevauchement détecté » à la relecture.
   *
   * Ce qui reste ici est la traduction vers ce que `detectAnomalies` attend —
   * `null` pour « rien trouvé » COMME pour « pas pu lire », c'est-à-dire le
   * comportement du dépôt, inchangé. Une lecture ratée ne fabrique pas une
   * phrase d'anomalie archivée ; c'est la RELECTURE qui dit « non vérifié »,
   * parce que c'est là qu'un humain décide.
   */
  private async overlappingMissionAssignment(
    workspaceId: string,
    consultantId: string,
    missionId: string,
    periodMonth: string,
  ): Promise<OverlappingMission | null> {
    const outcome = await overlappingMissionAssignment(this.missions.manager, {
      workspaceId,
      consultantId,
      missionId,
      periodMonth,
    })
    if (outcome.status === 'unreadable') {
      this.logger.error('Chevauchement de mission illisible pour la détection d’anomalies', {
        tags: { missionId, consultantId },
      })
      return null
    }
    return outcome.status === 'found' ? outcome.value : null
  }

  /**
   * Un AUTRE relevé, sur CETTE mission et CE mois, déjà VALIDÉ par le client.
   *
   * Même partage et même traduction que juste au-dessus : la requête vit dans
   * `timesheet-cross-checks.ts`, le dépôt en garde le comportement d'origine.
   */
  private async duplicateValidatedTimesheet(
    missionId: string,
    periodMonth: string,
    consultantId: string | null,
  ): Promise<DuplicateValidatedTimesheet | null> {
    const outcome = await duplicateValidatedTimesheet(this.missions.manager, {
      missionId,
      periodMonth,
      consultantId,
    })
    if (outcome.status === 'unreadable') {
      this.logger.error('Doublon de relevé validé illisible pour la détection d’anomalies', { tags: { missionId } })
      return null
    }
    return outcome.status === 'found' ? outcome.value : null
  }

  /**
   * Enregistre un relevé d'activité mensuel.
   *
   * L'unicité (mission × mois) est portée par un index : deux saisies simultanées
   * ne peuvent pas doubler les jours facturables. On rattrape le conflit plutôt
   * que de le prévenir par un SELECT — le seul moyen d'être correct sous
   * concurrence.
   */
  async submitTimesheet(
    userId: string,
    missionId: string,
    input: { periodMonth: string; days: number; consultantId?: string; gapExplanation?: string },
  ): Promise<{ timesheet: MissionTimesheetEntity }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const mission = await this.missions.findOne({ where: { id: missionId, workspace_id: workspaceId } })
    if (!mission) throw new NotFoundException('Mission introuvable dans votre espace de travail.')

    // Un forfait n'a pas de relevé (D35). L'accepter quand même laisserait une
    // ligne qui réclamerait ensuite une validation client sur un contrat qui
    // n'en demande aucune.
    const kind = (mission.contract_kind as ContractKind | null) ?? 'inconnu'
    if (kind === 'forfait' || kind === 'recrutement') {
      throw new BadRequestException('Cette mission ne fonctionne pas au relevé d’activité — elle se suit à ses jalons.')
    }

    // La maille est mission × consultant : sans le second terme, le relevé du
    // deuxième consultant écrasait celui du premier, sans un mot.
    const consultantId = input.consultantId ?? null
    const existing = await this.timesheets.findOne({
      // `IsNull()` et non `null` : TypeORM traduit `null` en « colonne
      // ignorée », ce qui retrouverait le relevé d'un AUTRE consultant.
      where: { mission_id: missionId, period_month: input.periodMonth, consultant_id: consultantId ?? IsNull() },
    })
    // La charge attendue tient compte des BORNES de la mission : un mois de
    // démarrage n'a pas 21 jours ouvrés, et le lui reprocher tous les mois
    // transforme l'écart en bruit.
    const expected = expectedWorkingDaysInWindow(input.periodMonth, {
      startedOn: mission.started_on,
      endsOn: mission.ends_on,
    })
    // Les deux signaux qui croisent CE relevé avec le reste de l'espace — la
    // seule raison pour laquelle `detectAnomalies` a besoin d'autre chose que
    // `days`/`expected`. Récupérés ICI, jamais dans `detectAnomalies` : cette
    // fonction reste pure et synchrone, testable sans base de données ; c'est
    // le service, déjà async, qui porte le coût de la lecture.
    //
    // Sans identifiant de consultant, on ne sait pas QUI vérifier pour le
    // chevauchement — la requête ne part pas plutôt que de rendre un signal
    // qu'on ne pourrait rattacher à personne.
    const [overlappingMission, duplicateValidated] = await Promise.all([
      consultantId
        ? this.overlappingMissionAssignment(workspaceId, consultantId, missionId, input.periodMonth)
        : Promise.resolve(null),
      this.duplicateValidatedTimesheet(missionId, input.periodMonth, consultantId),
    ])
    const anomalies = detectAnomalies(input.days, expected, { overlappingMission, duplicateValidated })
    if (existing) {
      // Un relevé VALIDÉ ne se réécrit pas en silence : il a servi de base à une
      // facturation côté comptabilité, et le modifier sans trace créerait un
      // écart que personne ne saurait expliquer.
      if (existing.status === 'validated') {
        throw new BadRequestException('Ce relevé est déjà validé — passez par une correction explicite.')
      }
      existing.days = input.days
      existing.status = 'submitted'
      existing.anomalies = anomalies
      existing.expected_days = expected
      // #2415.5 — QUI a réellement cliqué, distinct de `consultant_id` (DE QUI
      // c'est le mois) : un redépôt met à jour la trace, comme les jours
      // eux-mêmes — elle décrit ce dépôt-CI, pas le premier.
      existing.submitted_by = userId
      // Une explication déjà donnée n'est pas effacée par un nouveau dépôt :
      // elle porte sur un écart que le dépôt vient peut-être de corriger, et
      // c'est l'écart recalculé qui décide, pas elle.
      if (input.gapExplanation) existing.gap_explanation = input.gapExplanation
      return { timesheet: await this.timesheets.save(existing) }
    }

    try {
      const timesheet = await this.timesheets.save(
        this.timesheets.create({
          mission_id: missionId,
          consultant_id: consultantId,
          period_month: input.periodMonth,
          days: input.days,
          status: 'submitted',
          expected_days: expected,
          gap_explanation: input.gapExplanation ?? null,
          anomalies,
          // #2415.5 — voir le commentaire du chemin de mise à jour ci-dessus.
          submitted_by: userId,
        }),
      )
      return { timesheet }
    } catch (error) {
      const conflict = await this.timesheets.findOne({
        where: { mission_id: missionId, period_month: input.periodMonth, consultant_id: consultantId ?? IsNull() },
      })
      if (conflict) return { timesheet: conflict }
      throw error
    }
  }

  /** Les relevés d'un lot de missions, groupés — une requête, pas N. */
  private async timesheetsByMission(missionIds: string[]): Promise<Map<string, MissionTimesheetEntity[]>> {
    if (missionIds.length === 0) return new Map()
    const rows = await this.timesheets.find({ where: { mission_id: In(missionIds) } })
    const grouped = new Map<string, MissionTimesheetEntity[]>()
    for (const row of rows) {
      const list = grouped.get(row.mission_id) ?? []
      list.push(row)
      grouped.set(row.mission_id, list)
    }
    return grouped
  }

  /**
   * Attache à une mission ce qui se calcule dessus, et ce qui se lit à côté.
   *
   * `lookups` est FACULTATIF parce que les autres appelants (`create`,
   * `updateStatus`) décorent une mission qu'ils viennent d'écrire, sans avoir
   * chargé le contexte de tout l'espace pour une seule ligne. Ils rendent donc
   * `null` sur les deux — « pas lu », qui est la vérité.
   */
  private decorate(
    mission: MissionEntity,
    timesheets: MissionTimesheetEntity[],
    canReadFinance: boolean,
    lookups: {
      accountName: string | null
      accountLogoUrl?: string | null
      accountWebsite?: string | null
      /** #2194.22 — facultatif, même raison qu'`accountLogoUrl` : `create`/
       *  `updateStatus` décorent une mission qu'ils viennent d'écrire. */
      businessUnitId?: string | null
      businessUnitName?: string | null
      /** #2195.13 — facultatif : `create`/`updateStatus` décorent une mission
       *  qu'ils viennent d'écrire, sans avoir chargé le lot de l'espace. */
      ownerName?: string | null
      /** #2195.12 — facultatif, même raison que `ownerName`. */
      managerName?: string | null
      /** #2953 (#2193.6) — facultatif, même raison que `managerName` : `create`/
       *  `updateStatus` décorent une mission qui vient d'être créée/changée,
       *  sans avoir chargé le lot de l'espace. */
      clientManagerName?: string | null
      /** #2953 (#2193.59) — facultatif, même raison que `clientManagerName`. */
      clientManagerContactId?: string | null
      /** #2930 — facultatif, même raison qu'`ownerName` : `create`/`updateStatus`
       *  décorent une mission qu'ils viennent d'écrire, sans avoir chargé le
       *  lot de l'espace. */
      opportunityLabel?: string | null
      /** #2953 (#2193.48) — facultatif, même raison qu'`opportunityLabel`. */
      submissionLabel?: string | null
      assignees: MissionAssignee[] | null
      /** #2194.26 — facultatif : `create`/`updateStatus` décorent une mission
       *  qui vient d'être créée/changée, sans affecté actif à relire. */
      assignedSkills?: string[] | null
      /** Le coût CHARGÉ des conditions commerciales, en centimes (D43). `null`
       *  chez les appelants qui décorent une mission qu'ils viennent d'écrire :
       *  elle n'a pas encore de conditions, et « pas lu » est la vérité. */
      loadedDailyCostCents: number | null
      /**
       * #2408.18 — même table que le coût chargé (`mission_commercial_terms`),
       * même appelants facultatifs : `create`/`updateStatus` décorent une
       * mission qui n'a pas encore de conditions commerciales.
       */
      requiresPo?: boolean
      poNumber?: string | null
      /**
       * #2408.52, #2408.62 — même table, même appelants facultatifs que
       * `poNumber` juste au-dessus : `create`/`updateStatus` décorent une
       * mission qui n'a pas encore de conditions commerciales, et une lecture
       * sans `finance:read` ne charge jamais cette table (voir `list`).
       */
      channel?: string
      /**
       * #2408.53 — même table, même appelants facultatifs que `channel` juste
       * au-dessus. `null` (et non `undefined`) reste une valeur possible ICI
       * aussi : `create`/`updateStatus` qui viennent d'écrire une devise
       * connue la passent, ceux qui n'en ont pas lu du tout omettent la clé.
       */
      currency?: string | null
      /**
       * #2408.3/.16/.17/.20/.21/.40 — les signaux des exceptions L15, lus par
       * lot (`missionExceptionSignals`). `undefined` chez `create`/
       * `updateStatus` : aucune exception allumée sur un silence.
       */
      exceptionSignals?: MissionExceptionSignals
      /**
       * #2195.8 — l'échelle de fenêtres de l'ESPACE, lue UNE fois par `list` et
       * passée ici. Absente chez les appelants qui décorent une mission qu'ils
       * viennent d'écrire : ils rendent alors l'échelle du produit, qui est
       * exactement ce que faisait le code d'avant le 16/09/2026.
       */
      renewalWindowDays?: readonly number[]
      /**
       * #2413.2, .25, .28 — le PRÉAVIS, lu depuis `mission_commercial_terms.
       * notice_days` (jamais dupliqué sur `missions`, voir
       * `commercialTermsByMission`). `undefined` chez les appelants qui
       * décorent une mission qu'ils viennent d'écrire, sans avoir chargé les
       * conditions commerciales — même repli que `poNumber` juste au-dessus.
       */
      noticePeriodDays?: number | null
      /**
       * #2411.11 — les risques marqués « traité » (dossier, pas personne),
       * dont la fenêtre « sans changement matériel » tient toujours au moment
       * de la lecture. `undefined` chez `create`/`updateStatus` (mission qui
       * vient d'être écrite, jamais lue) : ne filtre alors RIEN, même garde
       * que `requiresPo`/`owner_id` — un silence n'est jamais un risque résolu.
       */
      resolvedRisks?: ReadonlySet<MissionRisk>
      /**
       * #2411.6 (reste, épopée #2881) — le mois courant de facturation de
       * CETTE mission est-il `blocked` (`InvoiceReadinessService.list`).
       * `undefined` chez `create`/`updateStatus` (mission qui vient d'être
       * écrite, jamais relue) et sans `finance:read` : ne déclenche alors
       * RIEN, même garde que `requiresPo`/`owner_id`.
       */
      invoiceBlocked?: boolean
      /** #2408 — voir {@link missionBillingAlert}. `undefined` sans `finance:read` et chez `create`/`updateStatus`. */
      billingAlert?: MissionBillingAlert | null
      /**
       * #2414.34/.40 — la demande marché des consultants affectés, résumée en
       * un lot par `marketDemandByConsultant`/`summariseMarketDemand`.
       * `undefined` chez `create`/`updateStatus` (mission qui vient d'être
       * écrite, affectés non relus dans ce lot) — même garde que `assignees`.
       */
      marketDemand?: MarketDemandSignal
      /**
       * #2414.35 — la rareté du profil des consultants affectés, résumée en
       * un lot par `profileScarcityByConsultant`/`summariseProfileScarcity`.
       * `undefined` chez `create`/`updateStatus`, même garde que `marketDemand`.
       */
      profileScarcity?: ProfileScarcitySignal
      /** #2414.41/.42 — besoins ouverts compatibles des affectés, par lot. */
      openNeeds?: OpenNeedsSignal
      /** #2414.44/.45 — partenaires et relations du compte client, par lot. */
      partners?: AccountRepositionSignal
      relations?: AccountRepositionSignal
      /** #2414.37/.43 — contraintes déclarées des affectés, mémoire marché du client. */
      constraints?: ConsultantRepositionSignal
      /** #2986 — le texte des contraintes déclarées (affiché tel que saisi). */
      constraintDetails?: RepositionConstraint[]
      marketMemory?: ConsultantRepositionSignal
      /** #2414.48 — historique de présentation récent des affectés, tous besoins confondus. */
      presentationHistory?: ConsultantRepositionSignal
    } = { accountName: null, assignees: null, loadedDailyCostCents: null },
  ): MissionView {
    // À PLAT : l'écran lit `label`, `status` et `ends_on` directement sur
    // l'élément. Les champs calculés viennent à côté, jamais au-dessus.
    const withCost = {
      ...mission,
      loadedDailyCostCents: lookups.loadedDailyCostCents,
      requiresPo: lookups.requiresPo,
      poNumber: lookups.poNumber,
      invoiceBlocked: lookups.invoiceBlocked,
      // #2408.3/.16/.17/.20/.21 — `undefined` = non lu, chaque exception reste muette.
      satisfaction: lookups.exceptionSignals?.satisfaction,
      lastAccountContactAt: lookups.exceptionSignals?.lastAccountContactAt,
      assigneeOnProlongedAbsence: lookups.exceptionSignals?.assigneeOnProlongedAbsence,
      assigneeWithoutNextPlacement: lookups.exceptionSignals?.assigneeWithoutNextPlacement,
      ownerlessOpenAction: lookups.exceptionSignals?.ownerlessOpenAction,
    }
    /**
     * La rédaction financière passe par `redactFinance` et par lui seul (D45) :
     * `marginPercent` est mis à `null`, PRÉSENT et vide, jamais retiré et jamais
     * à zéro — un zéro se lirait comme une marge nulle, ce qui est une
     * information fausse plutôt qu'une absence d'information.
     *
     * Le coût vient des conditions commerciales (D43), jamais de
     * `missions.daily_cost`, que rien dans l'application n'écrit.
     *
     * ⚠️ Les deux risques de MARGE suivent le même droit que la marge, et eux
     * ne passent pas par `redactFinance` : ce n'est pas un champ à vider, c'est
     * un axe à ne pas évaluer.
     *
     * `margin_at_risk` dit « cette mission perd de l'argent » : c'est la marge,
     * réduite à son signe, et la retirer d'un côté pour la laisser sortir de
     * l'autre ne garderait rien. Et `margin_unknown` affirmé à quelqu'un qui
     * n'a pas le droit de lire le coût serait FAUX — la marge est peut-être
     * parfaitement mesurée ; c'est LUI qui ne la voit pas. « Un verdict ne se
     * conclut pas d'un silence », surtout d'un silence qu'on a soi-même imposé.
     */
    // La fenêtre est calculée UNE fois : la prochaine action en dérive, et
    // deux appels pourraient tomber de part et d'autre de minuit.
    // #2195.8 — l'échelle de l'espace, ou celle du produit quand il n'a rien
    // réglé. Elle est RÉSOLUE ici pour que la fenêtre et son nombre de jours
    // sortent de la même lecture : deux résolutions pourraient diverger.
    const scale = resolveRenewalWindowDays(lookups.renewalWindowDays ?? DEFAULT_RENEWAL_WINDOW_DAYS)
    const renewal = renewalWindow(mission.ends_on, new Date(), scale)
    // #2413 — même garde que `marginPercent` juste en dessous (D45) : la
    // marge ne sort dans le facteur moteur QUE si l'appelant a `finance:read`,
    // sinon elle fuirait hors de `redactFinance`, qui n'agit que sur les clés
    // de premier niveau et ne verrait jamais l'intérieur de ce tableau.
    const marginPercentForFactors = canReadFinance ? dailyMarginPercent(withCost) : null
    const noticePeriodDays = lookups.noticePeriodDays ?? null
    const engineTier = renewalEngineTier({
      endsOn: mission.ends_on,
      startedOn: mission.started_on,
      noticePeriodDays,
    })
    return redactFinance(
      {
        ...mission,
        renewal,
        renewalBoundDays: renewalWindowBoundDays(renewal, scale),
        // #1354, #1355, #1357 — l'alerte porte désormais sa porte de sortie.
        nextAction: activeMissionNextAction(renewal),
        marginPercent: dailyMarginPercent(withCost),
        // #2413.1 à .48 — le moteur de cadence, dérivé, jamais persisté (voir
        // `mission-renewal-engine.ts`).
        renewalEngineTier: engineTier,
        renewalEngineFactors: renewalEngineFactors({
          noticePeriodDays,
          hasPurchaseOrder: lookups.poNumber === undefined ? null : lookups.poNumber !== null,
          hasActiveConsultant: lookups.assignees === null ? null : lookups.assignees.length > 0,
          marginPercent: marginPercentForFactors,
          openNeeds: lookups.openNeeds,
        }),
        renewalEngineState: deriveRenewalEngineState({
          renewalStatus: mission.renewal_status,
          clientRail: mission.renewal_client_rail,
          consultantRail: mission.renewal_consultant_rail,
          tier: engineTier,
        }),
        // #2414.34 à .48 — même palier, même statut : aucune troisième lecture.
        // #2414.34/.40 — `lookups.marketDemand` est `undefined` chez `create`/
        // `updateStatus` : `repositionTrigger` se comporte alors exactement
        // comme avant cette tranche (compat prouvée par `mission-reposition-
        // trigger.test.ts`).
        repositionTrigger: repositionTrigger({
          renewalStatus: mission.renewal_status,
          tier: engineTier,
          marketDemand: lookups.marketDemand,
          profileScarcity: lookups.profileScarcity,
          openNeeds: lookups.openNeeds,
          partners: lookups.partners,
          relations: lookups.relations,
          constraints: lookups.constraints,
          marketMemory: lookups.marketMemory,
          presentationHistory: lookups.presentationHistory,
        }),
        repositionReasons: repositionReasons({
          renewalStatus: mission.renewal_status,
          tier: engineTier,
          marketDemand: lookups.marketDemand,
          profileScarcity: lookups.profileScarcity,
          openNeeds: lookups.openNeeds,
          partners: lookups.partners,
          relations: lookups.relations,
          constraints: lookups.constraints,
          marketMemory: lookups.marketMemory,
          presentationHistory: lookups.presentationHistory,
        }),
        repositionConstraints: lookups.constraintDetails ?? [],
        billingAlert: lookups.billingAlert,
        risks: (canReadFinance
          ? missionRisks(withCost, timesheets)
          : missionRisks(withCost, timesheets).filter(risk => !FINANCE_GATED_RISKS.has(risk))
        ).filter(risk => !lookups.resolvedRisks?.has(risk)),
        accountName: lookups.accountName,
        // `?? null` et non `lookups.accountLogoUrl` nu : les appelants qui
        // décorent une mission qu'ils viennent d'écrire ne passent pas ces
        // clés, et `undefined` sortirait du JSON — l'écran lirait alors une
        // absence de CLÉ là où il attend une absence de VALEUR.
        accountLogoUrl: lookups.accountLogoUrl ?? null,
        accountWebsite: lookups.accountWebsite ?? null,
        // #2194.22 — même repli : absent chez `create`/`updateStatus`.
        businessUnitId: lookups.businessUnitId ?? null,
        businessUnitName: lookups.businessUnitName ?? null,
        // #2195.13 — `?? null` : absent chez `create`/`updateStatus`, qui
        // n'ont pas chargé le lot — « pas lu » est la vérité, jamais un UUID.
        ownerName: lookups.ownerName ?? null,
        // #2195.12 — même repli : absent chez `create`/`updateStatus`, jamais
        // un nom deviné.
        managerName: lookups.managerName ?? null,
        // #2953 (#2193.6 / .59) — même repli : absent chez `create`/`updateStatus`.
        clientManagerName: lookups.clientManagerName ?? null,
        clientManagerContactId: lookups.clientManagerContactId ?? null,
        // #2930 — même repli : absent chez `create`/`updateStatus`, jamais un
        // UUID nu.
        opportunityLabel: lookups.opportunityLabel ?? null,
        // #2953 (#2193.48) — même repli : absent chez `create`/`updateStatus`.
        submissionLabel: lookups.submissionLabel ?? null,
        assignees: lookups.assignees,
        // #2194.26 — `?? null` : absent chez `create`/`updateStatus`, « pas
        // lu » est la vérité, jamais un tableau vide qui se lirait « aucune
        // compétence portée ».
        assignedSkills: lookups.assignedSkills ?? null,
        // #2408.52, #2408.62 — `undefined` chez `create`/`updateStatus`, ou
        // sans `finance:read` : même repli que `poNumber`/`requiresPo`, jamais
        // un canal deviné.
        channel: lookups.channel,
        // #2408.53 — même repli qu'au-dessus, mais `undefined` reste
        // `undefined` (jamais forcé à `null`) : c'est ce qui distingue « pas
        // lu » (sans `finance:read`, ou `create`/`updateStatus`) de « lu et
        // non renseignée ».
        currency: lookups.currency,
        // #2408.33/.51 — absent quand non lu, jamais un niveau deviné.
        ...(lookups.exceptionSignals?.satisfaction ? { satisfaction: lookups.exceptionSignals.satisfaction } : {}),
        // #2408.40 — même garde : absent quand non lu.
        ...(lookups.exceptionSignals ? { legalEntityName: lookups.exceptionSignals.legalEntityName ?? null } : {}),
      },
      canReadFinance,
    )
  }
  /**
   * Déplacer une carte du board (PDF 5 §3).
   *
   * Le board reste une PROJECTION : ce geste n'écrit jamais l'état du board, il
   * écrit celui de l'objet d'origine. La colonne d'arrivée dit quel statut de
   * mission poser ; les colonnes amont, elles, appartiennent au projet et se
   * déplacent sur l'écran des Projets — la carte porte son état d'origine
   * précisément pour dire lequel.
   *
   * `acceptedActions` est RENDU tel quel : le service ne le déduit pas. Ce qui
   * en est FAIT se décide dans le contrôleur, qui est la couche où un geste
   * utilisateur traverse plusieurs domaines (§3.2, GA-07). Le service rend donc
   * aussi la MISSION — le contrôleur en a besoin pour écarter le compte ou
   * poser un point d'agenda, et la relire une seconde fois serait une requête
   * de plus pour une donnée qu'on vient de charger.
   *
   * ⚠️ Rendre `acceptedActions` sans que personne ne l'exécute était le défaut
   * corrigé le 26/08/2026 : vingt cases qu'on cochait et qui ne faisaient rien.
   */
  async moveBoardCard(
    workspaceId: string | null,
    userId: string,
    cardId: string,
    input: MoveBoardCard,
  ): Promise<
    | { status: string; movedAt: string; acceptedActions: string[]; mission: MissionEntity }
    | 'not_found'
    | 'reason_required'
    | 'transition_refused'
    | 'backward_reason_required'
  > {
    if (input.to === 'perdue' && !input.reason?.trim()) return 'reason_required'

    const missionId = cardId.startsWith('mission:') ? cardId.slice('mission:'.length) : cardId
    const status = missionStatusForColumn(input.to)
    // Les six colonnes amont appartiennent au projet : les traiter ici
    // écrirait un statut de mission sur une affaire qui n'en a pas encore.
    if (!status) return 'not_found'

    // #2671 — la borne d'espace est DANS la lecture. L'ancienne forme lisait la
    // mission par id seul puis vérifiait `workspaceId && mission.workspace_id
    // !== workspaceId` : un prédicat qui s'effondre quand `workspaceId` vaut
    // `null` (premier terme falsy), devant un geste qui ÉCRIT. Sans espace
    // résolu on ne déplace RIEN — l'appelant réel en passe toujours un.
    if (!workspaceId) return 'not_found'
    const mission = await this.missions.findOne({ where: { id: missionId, workspace_id: workspaceId } })
    if (!mission) return 'not_found'

    const previous = mission.status
    // #2407.5 — la table STRICTE des transitions (decisions §9) vaut aussi pour
    // le tableau : un saut d'étape ou deux fins qui s'échangent sont refusés,
    // un retour arrière exige son motif (journalisé plus bas).
    const known = missionStatusSchema.safeParse(previous)
    const move = known.success ? missionStatusMove(known.data, status) : 'forward'
    if (move === 'refused') return 'transition_refused'
    if (move === 'backward' && !input.reason?.trim()) return 'backward_reason_required'
    // #2338 / #2409 — « Gagnée » → « En cours » est un passage au démarrage :
    // même porte que `POST …/status` (409, manques nommés).
    if (move === 'forward' && known.success) {
      await assertMissionStartGate(this.missions.manager, workspaceId, mission.id, known.data, status)
    }
    const movedAt = new Date()
    await this.missions.update(
      { id: missionId },
      {
        status,
        // La date d'entrée dans l'état ne bouge QUE si l'état change : la
        // remettre à zéro sur un déplacement vers la même colonne effacerait
        // l'ancienneté qui déclenche l'alerte de séjour.
        ...(previous === status ? {} : { stage_entered_at: movedAt }),
      },
    )

    await this.traceMove(workspaceId, userId, mission, previous, status, input.reason ?? null)
    if (move !== 'same') {
      // #2407.5 — le journal des transitions, best-effort comme la trace.
      await journalStatusTransition(this.missions.manager, {
        workspaceId,
        missionId: mission.id,
        assignmentId: null,
        from: previous,
        to: status,
        direction: move === 'backward' ? 'backward' : 'forward',
        reason: input.reason?.trim() || null,
        actorId: userId,
      }).catch((error: unknown) =>
        this.logger.error('Transition de statut non journalisée', { error, tags: { mission: mission.id } }),
      )
    }
    return { status, movedAt: movedAt.toISOString(), acceptedActions: input.acceptedActions, mission }
  }

  /**
   * La trace d'un déplacement.
   *
   * Best-effort : perdre la trace dégrade l'historique, la faire échouer
   * empêcherait de bouger une carte. Mais l'échec est journalisé — un silence
   * ici se lirait comme « rien ne s'est passé ».
   */
  private async traceMove(
    workspaceId: string | null,
    userId: string,
    mission: MissionEntity,
    from: string,
    to: string,
    reason: string | null,
  ): Promise<void> {
    if (!workspaceId) return
    try {
      await this.missions.manager.query(
        `INSERT INTO record_field_audit (workspace_id, entity_type, entity_id, field, old_value, new_value, source, actor_id)
         VALUES ($1, 'mission', $2, 'status', $3, $4, 'human', $5)`,
        [workspaceId, mission.id, from, to, userId],
      )
      if (reason) {
        await this.missions.manager.query(
          `INSERT INTO record_field_audit (workspace_id, entity_type, entity_id, field, old_value, new_value, source, actor_id)
           VALUES ($1, 'mission', $2, 'move_reason', NULL, $3, 'human', $4)`,
          [workspaceId, mission.id, reason, userId],
        )
      }
    } catch (error) {
      this.logger.error('Trace de déplacement de mission non écrite', { error, tags: { mission: mission.id } })
    }
  }
}

/**
 * Pourquoi ce compte mérite une visite maintenant. Toujours une phrase : un
 * score sans explication n'a jamais fait décrocher un téléphone.
 *
 * ⚠️ Chaque phrase n'affirme QUE ce que son chiffre porte. La phrase de repli
 * disait « un expert sur place voit ce qu'aucune recherche web ne verra » sur
 * TOUT compte ayant une mission — y compris ceux où personne n'est affecté :
 * elle promettait un interlocuteur terrain que personne ne pouvait appeler.
 * Depuis que `expertsOnSite` est compté sur les affectations et non sur les
 * missions, la promesse peut être tenue quand elle est faite, et retirée
 * quand elle ne l'est pas.
 */
function expansionReason(activeMissions: number, endingSoon: number, expertsOnSite: number): string {
  if (endingSoon > 0) {
    return `${endingSoon} mission(s) se termine(nt) dans les deux mois — la conversation est déjà ouverte.`
  }
  if (expertsOnSite > 1) {
    return `${expertsOnSite} personnes en poste chez ce client — autant de sources sur ce qui s’y prépare.`
  }
  if (expertsOnSite === 1) {
    return 'Une personne en poste chez ce client — elle voit ce qu’aucune recherche web ne verra.'
  }
  if (activeMissions > 1) {
    return `${activeMissions} missions en cours : la relation porte, même sans affectation enregistrée.`
  }
  return 'Une mission en cours, aucune affectation enregistrée — la relation existe, le terrain reste à couvrir.'
}

/**
 * Anomalies détectées sur un relevé. La liste vide veut dire « rien détecté »,
 * pas « rien à signaler » — c'est pourquoi le champ n'est jamais absent.
 *
 * Le seuil haut se calcule sur le MOIS déclaré et non sur un 23 en dur. Un
 * chiffre unique se trompe des deux côtés : il laisse passer 22 jours en
 * février, qui n'en compte que 20, et il alerte à tort sur un mois de 23 jours
 * ouvrés. `expectedWorkingDays` rend le compte réel ; sans période lisible, on
 * ne compare rien plutôt que de comparer à une moyenne.
 *
 * Ce qui n'est PAS une anomalie : déclarer MOINS que le mois n'en compte. Des
 * congés, un jour férié local, un temps partiel — c'est le cas ordinaire, et
 * l'alerter noierait les vrais écarts.
 *
 * `crossChecks` porte les DEUX signaux qui ne se lisent pas sur `days` seul —
 * ils viennent d'ailleurs dans l'espace, `submitTimesheet` les résout avant
 * d'appeler cette fonction pour qu'elle reste PURE (D575). Un troisième
 * signal existait dans la demande d'origine — un jour férié compté comme
 * travaillé — et n'est PAS ici : `expectedWorkingDaysInWindow` accepte déjà
 * une liste de jours fériés en paramètre, mais aucun calendrier de jours
 * fériés n'existe dans ce dépôt, et un calendrier français codé en dur serait
 * une donnée fictive pour toute mission hors de France (D576). Voir le
 * rapport de livraison pour ce qu'il faudrait pour l'ajouter honnêtement.
 */
function detectAnomalies(
  days: number,
  expected: number | null,
  crossChecks: {
    /** L'autre mission qui occupe ce consultant sur le même mois, s'il y en a une. */
    overlappingMission: {
      missionLabel: string | null
      consultantName: string | null
      from: string
      to: string | null
    } | null
    /** Un autre relevé, sur cette même mission et ce même mois, déjà validé par le client. */
    duplicateValidated: { consultantName: string | null; validatedAt: string | null } | null
  },
): string[] {
  // Les anomalies d'ÉCART viennent du contrat, pas d'ici : ce sont exactement
  // celles qu'une explication d'écart répond, et `computeInvoiceBlockers` doit
  // les reconnaître dans l'archive pour cesser de bloquer. Deux copies de ces
  // phrases divergeraient au premier mot changé — et le lecteur cesserait, en
  // silence, de reconnaître ce que l'écrivain a écrit.
  //
  // Le cas qui manquait, et c'est celui qui coûte : un relevé à 12 jours sur un
  // mois à 23 passait « prêt à facturer ». Onze jours qu'on ne facture pas, et
  // rien à l'écran pour le dire.
  const anomalies: string[] = [...gapAnomalyMessages(days, expected)]
  // Un quart de journée n'existe pas dans la plupart des contrats : c'est presque
  // toujours une faute de frappe sur une demi-journée.
  if (days % 0.5 !== 0) anomalies.push('Fraction de journée inhabituelle — les demi-journées sont la maille usuelle.')
  // Un mois à cheval sur deux missions : le relevé porte sur UNE mission, mais
  // ce consultant en a AUSSI une autre sur la même période — les jours ont pu
  // se partager entre les deux relevés sans que rien ne le dise jusqu'ici.
  if (crossChecks.overlappingMission) {
    const { missionLabel, consultantName, from, to } = crossChecks.overlappingMission
    anomalies.push(
      `${consultantName ?? 'Ce consultant'} est aussi affecté à «${missionLabel ?? 'une autre mission'}» sur cette période (${from} → ${to ?? 'en cours'}) — vérifier que les jours ne sont pas partagés entre les deux relevés.`,
    )
  }
  // Le doublon qui passait aujourd'hui : un relevé déposé APRÈS qu'un autre a
  // déjà été validé sur la même mission et le même mois, sous un consultant
  // différent — indistinguable, sans ce signal, d'un second consultant
  // légitimement staffé sur la mission.
  if (crossChecks.duplicateValidated) {
    const { consultantName, validatedAt } = crossChecks.duplicateValidated
    anomalies.push(
      `Un autre relevé sur cette mission pour ce mois a déjà été validé (${consultantName ?? 'consultant non renseigné'}${validatedAt ? `, le ${validatedAt}` : ''}) — vérifier qu’il ne s’agit pas d’un doublon.`,
    )
  }
  return anomalies
}

/** Aujourd'hui au format `YYYY-MM-DD`, pour comparer à une colonne `date`. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// #2411.6 — `ownerDisplayName` vit désormais dans `owner-display-name.ts`
// (fichier neutre, zéro import) : ce fichier importe l'injection de
// `InvoiceReadinessService`, qui se résout AU CHARGEMENT de la classe, tandis
// qu'`invoice-readiness.service.ts` n'utilisait `ownerDisplayName` que
// PARESSEUSEMENT (dans un corps de méthode) — les deux réunis dans le même
// fichier fermaient un cycle réel. Ré-exportée ici pour que
// `accounts.service.ts`/`partners.service.ts` n'aient rien à changer.
export { ownerDisplayName } from './owner-display-name'
