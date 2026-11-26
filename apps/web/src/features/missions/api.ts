import type {
  ActiveMissionRow,
  AssignmentInput,
  BoardMoveOutcome,
  FinanceScopeInfo,
  CapacityForecast,
  CreateMissionExpenseInput,
  CreateMissionRequest,
  CreateSupplierInvoiceInput,
  DsoResult,
  FieldSource,
  Forecast,
  MissionBoardCard,
  MissionBoardColumnSummary,
  CreateMissionFeedbackRequest,
  MissionExpense,
  MissionFeedbackRails,
  MissionScore,
  RevenueBreakdown,
  InvoiceReadiness,
  ReadinessSummary,
  Mission,
  MissionAssignment,
  MissionChannel,
  MissionCommercialTerms,
  MissionMarginComputation,
  MissionMarginScenario,
  MissionMarginScenarioResult,
  MissionRisk,
  RenewalStatus,
  RenewalWindow,
  SetSupplierInvoiceStatusInput,
  SupplierInvoice,
  MarkTimesheetNotApplicableInput,
  TimesheetNotApplicable,
  TimesheetReview,
  TimesheetStatus,
  UpdateMissionExpenseInput,
  UpdateSupplierInvoiceInput,
  UpsertCommercialTermsInput,
  MissionDriftReport,
  MissionStartCheckInput,
  MissionStartDeclaredKey,
  MissionStartReadiness,
  MissionAmendmentView,
  ProposeMissionAmendmentInput,
  EndMissionInput,
  ExtendMissionInput,
  MissionLifecycleResult,
  RenewalClientRail,
  RenewalConsultantRail,
  RenewalEngineFactor,
  RenewalEngineState,
  RenewalEngineTier,
  RepositionTrigger,
  RepositionTriggerReason,
  MissionEndCheckInput,
  MissionEndCheckKey,
  MissionEndChecklist,
  MissionEndReasonInput,
  MissionInterruption,
  DeclareMissionDeliveryMilestoneInput,
  MissionDeliveryMilestoneStatus,
  MissionInterruptionInput,
  MissionDocument,
  CreateMissionDocumentInput,
  MissionDocumentStatus,
  MissionBillingAlert,
  MissionSatisfaction,
} from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useMeetingPrepAction } from '@/features/agenda/meeting-prep-proposal'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { queryKeys } from '@/lib/api/query-keys'

/**
 * Ce que le backend rend pour une mission, enrichi côté service.
 *
 * ⚠️ `marginPercent` vaut `null` dans DEUX cas depuis D45 (28/08/2026) : quand
 * l'appelant n'a pas `finance:read`, et quand le coût chargé n'est pas
 * renseigné. La clé est désormais toujours PRÉSENTE — avant, elle disparaissait
 * du JSON dans le premier cas, et la forme du champ portait la distinction.
 * Elle ne la porte plus : c'est `canReadFinance`, rendu À CÔTÉ de la liste, qui
 * dit lequel des deux on tient. Les deux se lisent différemment à l'écran —
 * « pas ton périmètre » n'est pas « pas mesurable » — et il ne faut jamais les
 * replier l'un sur l'autre, ni écrire `marginPercent ?? 0`.
 *
 * ⚠️ `assignees` vaut `[]` quand PERSONNE n'est affecté (une alerte) et `null`
 * quand la lecture a échoué (on ne sait pas). Cause racine « cassé et non
 * mesurable se ressemblent ».
 */
export type MissionView = Mission & {
  /** `null` = compte hors périmètre. Envoyé depuis le 28/08 seulement : il
   *  était déclaré ici et jamais rendu par le service. */
  accountName?: string | null
  /** #2408 — le badge de facturation de la ligne (absent sans `finance:read`). */
  billingAlert?: MissionBillingAlert | null
  /** De quoi DESSINER le compte. `null` = rien d'exploitable, on retombe sur
   *  l'initiale. Envoyés depuis le 03/09 : `CompanyAvatar` existait et servait
   *  déjà sur `/accounts`, mais la requête des missions ne SÉLECTIONNAIT pas
   *  ces deux colonnes — un composant juste que personne ne nourrit rend
   *  exactement la même chose qu'un composant absent. */
  accountLogoUrl?: string | null
  accountWebsite?: string | null
  /**
   * #2195.13 — le nom du PORTEUR (`owner_id`), résolu côté serveur.
   *
   * L'API ne rendait qu'un UUID nu, refusé en colonne (`columns.ts`) — une
   * colonne d'identifiant ne fait décider personne. `null` = aucun porteur,
   * OU lecture illisible côté serveur : les deux se lisent pareil ici, jamais
   * un UUID de repli.
   */
  ownerName?: string | null
  /**
   * #2195.12 — le nom du/des MANAGER(S) des consultants affectés, résolu
   * côté serveur (`DeliveryService.managersOf`).
   *
   * L'API ne rendait AUCUN manager de mission — ni colonne, ni jointure.
   * `null` = aucun consultant affecté n'a de manager renseigné, OU lecture
   * illisible côté serveur : les deux se lisent pareil ici, « non renseigné »,
   * jamais un nom deviné. Plusieurs consultants affectés avec des managers
   * DISTINCTS rendent les deux noms, séparés par une virgule.
   */
  managerName?: string | null
  /**
   * #2953 (#2193.6) — le nom du MANAGER CLIENT (le contact, CHEZ LE CLIENT,
   * qui encadre le consultant — #2836), résolu côté serveur
   * (`DeliveryService.clientManagersOf`).
   *
   * `null` = non désigné, contact disparu, contact d'un autre compte, OU
   * lecture illisible côté serveur : les quatre se lisent pareil ici, jamais
   * un nom deviné.
   */
  clientManagerName?: string | null
  /**
   * #2953 (#2193.59) — l'ID du contact derrière `clientManagerName`, pour en
   * faire un LIEN vers sa fiche (`/contacts/$id`) plutôt qu'un texte inerte —
   * même geste que le consultant et le compte, déjà cliquables sur ce hero.
   * `null` exactement quand `clientManagerName` l'est.
   */
  clientManagerContactId?: string | null
  /**
   * #2930 (point couvert #2191.38) — le libellé du BESOIN D'ORIGINE
   * (`opportunity_id`), résolu côté serveur (`DeliveryService.opportunitiesOf`).
   *
   * L'API ne rendait qu'un UUID nu, refusé à l'écran (`MissionDetailTabs.tsx`)
   * — un identifiant nu ne fait décider personne. `null` = aucun besoin lié,
   * besoin introuvable, OU lecture illisible côté serveur : les trois se
   * lisent pareil ici, jamais un UUID de repli.
   */
  opportunityLabel?: string | null
  /**
   * #2953 (#2193.48) — le libellé du POSITIONNEMENT D'ORIGINE (`submission_id`),
   * résolu côté serveur (`DeliveryService.submissionsOf`) — même patron que
   * `opportunityLabel` juste au-dessus. `null` = aucun positionnement lié,
   * positionnement introuvable, OU lecture illisible : les trois se lisent
   * pareil ici, jamais un UUID de repli.
   */
  submissionLabel?: string | null
  renewal?: RenewalWindow
  /**
   * #2195.8 — le NOMBRE DE JOURS de la fenêtre, puisque c'est lui qui s'affiche.
   *
   * `renewal` reste l'identifiant de position, gelé par GA-08 ; le libellé se
   * calcule depuis ce nombre (`renewalWindowLabel`). `null` sur les fenêtres
   * qui ne se règlent pas — jamais `0`, qui se lirait « à 0 jour ».
   */
  renewalBoundDays?: number | null
  risks?: MissionRisk[]
  /**
   * CE QU'IL RESTE À FAIRE, et l'écran qui le fait (#1354, #1355, #1357).
   *
   * Dérivée côté SERVEUR par `activeMissionNextAction`, la même fonction que
   * l'onglet Missions d'un dossier de compte — jamais recalculée ici. Un écran
   * qui referait la dérivation en fabriquerait une seconde, qui divergerait au
   * premier ajout (GA-26), et le retour #1357 l'interdit en toutes lettres :
   * « la valeur doit provenir de l'action existante, jamais être inventée
   * localement ».
   *
   * ⚠️ OPTIONNELLE, et c'est délibéré : le web se déploie une dizaine de
   * minutes avant l'API, et pendant cette fenêtre le champ n'est pas encore
   * renvoyé. Absente ⇒ la cellule dit « non mesuré » avec sa raison, jamais
   * « rien à faire » — ce qui serait un verdict conclu d'un silence.
   */
  nextAction?: ActiveMissionRow['nextAction']
  /**
   * OÙ EN EST LA RECONDUCTION — #2195.20, .22 à .29.
   *
   * ⚠️ TROIS états, et les replier serait le défaut que cet écran existe pour
   * éviter. La clé ABSENTE dit « une API plus ancienne que ce code » (le web se
   * déploie une dizaine de minutes avant l'API, mesuré le 04/09/2026 sur un
   * autre champ de ce même type) ; `null` dit « personne n'a encore ouvert
   * cette ligne » ; une valeur dit le constat qu'un humain a posé.
   *
   * `null` n'est donc PAS `non_engage`, qui est un constat, pas un silence.
   *
   * ⚠️ Jamais dérivé ici de la fenêtre ni des risques : le déduire fabriquerait
   * le pronostic que la doctrine refuse (`c26_probabilite`, #2195.25).
   */
  renewal_status?: RenewalStatus | null
  /** QUAND le statut a été posé. Sans elle, « Feedback demandé » ne dit pas
   *  depuis combien de temps on attend. */
  renewal_status_at?: string | null
  /**
   * #2413.49 à .52 — LE RAIL CLIENT (dual track, épopée #2965).
   *
   * `null` = jamais ouvert, à distinguer de `{ intent: 'non_demande', … }` —
   * un rail ouvert sans encore de réponse fermée. Absente (`undefined`) = une
   * API plus ancienne que ce code, même raison que `renewal_status` juste
   * au-dessus.
   */
  renewal_client_rail?: RenewalClientRail | null
  /** #2413.53 à .56 — LE RAIL CONSULTANT, symétrique du rail client. */
  renewal_consultant_rail?: RenewalConsultantRail | null
  /**
   * #2413.1, .2, .6, .25, .26 — LE PALIER DU MOTEUR DE CADENCE (épopée #2965).
   *
   * `optional` : une API plus ancienne que ce champ ne le renvoie pas encore,
   * même raison que `renewal_status` au-dessus. Distinct de `renewal`
   * (fenêtre `j15`…`j60`, réglable par espace) : voir
   * `mission-renewal-engine.ts` côté contrat pour la raison des deux échelles.
   */
  renewalEngineTier?: RenewalEngineTier | 'not_due' | 'unknown'
  /** #2413.28 à .35 — les 8 facteurs moteur, chacun nommé, jamais fabriqué. */
  renewalEngineFactors?: readonly RenewalEngineFactor[]
  /** #2413.36 à .48 — l'état nommé, dérivé, jamais persisté en base. */
  renewalEngineState?: RenewalEngineState
  /**
   * #2414.34 à .48 (épopée #2986) — QUAND le moteur de repositionnement doit
   * commencer, croisant le palier de cadence ci-dessus (qui porte déjà le
   * préavis) et la confiance sur le renouvellement. `optional` : même raison
   * que `renewal_status` au-dessus, une API plus ancienne que ce champ.
   */
  repositionTrigger?: RepositionTrigger
  /** Toutes les raisons qui tiennent (la première est celle du déclencheur). */
  repositionReasons?: readonly RepositionTriggerReason[]
  /** #2986 — les contraintes déclarées des affectés, TEXTE de la fiche (jamais un libellé générique). */
  repositionConstraints?: readonly { consultantName: string; kind: 'mobility' | 'conditions'; text: string }[]
  /** Toujours présent. `null` = pas le droit OU pas mesuré — voir
   *  `canReadFinance` sur la réponse pour savoir lequel. Jamais `0`. */
  marginPercent: number | null
  assignees?: RawAssignee[] | null
  /**
   * #2194.22 — l'unité d'affaires (BU/agence) de la mission : celle du
   * transfert (`missions.business_unit_id`, #3413) sinon celle du COMPTE
   * porteur, résolue côté serveur (`DeliveryService.list`). `null` = aucune BU
   * connue, ou absente (forme d'avant).
   */
  businessUnitId?: string | null
  businessUnitName?: string | null
  /**
   * #2194.26 — les compétences CANONIQUES des affectés ACTIFS, résolues côté
   * serveur (`DeliveryService.skillsByMission`). `null` = lecture illisible,
   * `[]` = lu, aucune compétence déclarée sur les affectés actifs, absente =
   * forme d'avant (même tolérance que `assignees`).
   */
  assignedSkills?: string[] | null
  /**
   * #2408.52, #2408.62 — le CHEMIN par lequel la mission est arrivée (`direct`
   * / `partner` / `subcontracting` / `portage` / `unknown`), résolu côté
   * serveur (`mission_commercial_terms.channel`).
   *
   * `undefined` = sans `finance:read`, OU la mission n'a aucune ligne de
   * conditions commerciales — les deux se lisent pareil ici : rien à
   * afficher, jamais un canal deviné à « direct ».
   */
  channel?: MissionChannel
  /**
   * #2408.53 — la DEVISE du TJM et du contrat (ISO 4217), résolue côté
   * serveur (`mission_commercial_terms.currency`) — même table, même porte
   * que `channel` juste au-dessus.
   *
   * ⚠️ `undefined` et `null` ne disent PAS la même chose : `undefined` =
   * sans `finance:read`, ou aucune ligne de conditions commerciales ;
   * `null` = ligne lue, devise non renseignée. Un filtre ne propose que les
   * missions dont la devise est CONNUE (`currencyCounts`, `filters.ts`).
   */
  currency?: string | null
  /**
   * #2408.33 / #2408.51 — le dernier niveau DÉCLARÉ de chaque rail, jamais
   * fusionnés (`missionSatisfactionOf`). `null` sur un rail = « non mesuré » ;
   * clé absente = API antérieure ou chemin d'écriture (pas lu).
   */
  satisfaction?: MissionSatisfaction
  /**
   * #2408.40 — la société de l'ESN qui porte la mission (`legal_entities`),
   * résolue en nom côté serveur. `null` = non renseignée ; absente = pas lue.
   */
  legalEntityName?: string | null
}

/**
 * #2407.3 — D'OÙ VIENT LA VALEUR COURANTE D'UN CHAMP PRINCIPAL de la mission.
 *
 * Miroir du `MissionFieldSources` de `mission-status.service.ts` (API) : pas
 * de schéma partagé dans `@bellum/contracts` pour cette réponse, comme
 * d'autres petites formes de ce module (`ReadinessPage`, le retour de
 * `moveBoardCard`…) — voir le patron déjà en place plus bas.
 *
 * `null` = jamais tracée, JAMAIS une source devinée. `lieu`/`remote` de
 * l'issue #2407 n'y figurent pas : ce sont des champs de l'AFFECTATION
 * (`mission_assignments`, #2407.4, déjà livré), pas de la mission.
 */
export type MissionFieldSources = {
  accountId: { source: FieldSource; at: string } | null
  label: { source: FieldSource; at: string } | null
  startedOn: { source: FieldSource; at: string } | null
  endsOn: { source: FieldSource; at: string } | null
  dailyRate: { source: FieldSource; at: string } | null
}

/**
 * QUI est sur une mission — l'identité, pas seulement le nom (#1350, #1363).
 *
 * Le champ rendait `string[]`. Les deux retours demandent un avatar ET une
 * porte vers le profil du consultant : le premier a besoin de la photo, le
 * second de l'`id` — un nom ouvrirait la fiche du premier homonyme du vivier.
 *
 * ⚠️ La forme a CHANGÉ plutôt que d'être doublée d'un second champ. Deux formes
 * de la même chose dans le même fil divergent au premier ajout : c'est la cause
 * racine « même nom, forme différente » du dépôt.
 *
 * ⚠️ `photoUrl` est un critère PROTÉGÉ. Il se DESSINE, il ne classe personne —
 * et il ne monte jamais dans un prompt : le pont du copilote le retire
 * (`assignee-photos.ts`, garde `copilot-bridge-hides-photos.spec.ts`).
 */
type MissionAssignee = {
  /** `null` = l'API n'a pas encore envoyé l'identité (forme d'avant le
   *  04/09/2026). Le nom s'affiche, le lien vers le profil non — on n'ouvre pas
   *  la fiche d'un homonyme deviné. */
  id: string | null
  fullName: string
  /** `null` = aucune photo déposée. Jamais une chaîne vide, qui se lirait
   *  comme une photo qui n'a pas chargé. */
  photoUrl: string | null
  /** #2194.39 — la charge de CETTE affectation, 1 à 100. Absent ou `null` =
   *  l'API n'a pas encore envoyé ce champ (même fenêtre de déploiement
   *  qu'`id`/`photoUrl` ci-dessus, ou forme la plus ancienne — chaîne nue) :
   *  jamais compté comme 0, qui se lirait « affectation vide ». Optionnel,
   *  et non `number | null` comme `id`/`photoUrl` : ce champ est apparu
   *  APRÈS eux, donc un objet valide et déjà en circulation peut ne pas le
   *  porter du tout — {@link assigneesOf} lit `person.loadPercent ?? null`. */
  loadPercent?: number | null
}

/**
 * CE QUE LE SERVEUR PEUT ENCORE ENVOYER — la forme d'AVANT, tolérée.
 *
 * ⚠️ Le web se déploie une dizaine de minutes AVANT l'API, et ce n'est pas une
 * hypothèse : mesuré en recette le 04/09/2026, à 12h20, sur ce champ exact.
 * Pendant cette fenêtre l'API rendait encore `['Julien Roussel']` là où l'écran
 * lisait `person.fullName` — la colonne « Consultant » affichait « ? » sur
 * toutes les lignes, c'est-à-dire MOINS que ce qu'elle montrait la veille.
 *
 * Le champ se soigne à la lecture, une fois, plutôt que dans chacun des six
 * lecteurs. La règle qui a manqué est déjà écrite ailleurs dans ce fichier, sur
 * `nextAction` : « OPTIONNELLE, et c'est délibéré — le web se déploie une
 * dizaine de minutes avant l'API ». Elle valait pour ce champ-ci aussi.
 */
type RawAssignee = string | MissionAssignee

/**
 * Une personne en poste, quelle que soit la forme reçue.
 *
 * ⚠️ Une chaîne n'a pas d'identité : on rend `id: null` et non un identifiant
 * inventé. La cellule le lit et n'attache PAS de lien — envoyer vers la fiche
 * du premier homonyme serait pire que ne pas l'offrir. Le nom, lui, s'affiche :
 * c'est l'information qui compte, et elle est là dans les deux formes.
 */
export function assigneesOf(mission: { assignees?: RawAssignee[] | null }): MissionAssignee[] {
  return (mission.assignees ?? []).map(person =>
    typeof person === 'string' ? { id: null, fullName: person, photoUrl: null, loadPercent: null } : person,
  )
}

/**
 * Les NOMS des personnes en poste — pour une recherche, jamais pour un rendu.
 *
 * Trois écrans construisent une botte de foin de recherche à partir des
 * affectations. Depuis que le champ porte des objets, `...(m.assignees ?? [])`
 * y injecterait `[object Object]` : la recherche ne trouverait plus personne,
 * en silence et sans rougir un seul test de type.
 */
export function assigneeNames(mission: { assignees?: RawAssignee[] | null }): string[] {
  return assigneesOf(mission).map(person => person.fullName)
}

/**
 * La liste des missions, et le DROIT financier de celui qui la lit.
 *
 * `canReadFinance` n'est pas décoratif : sans lui, un `marginPercent: null` ne
 * se distingue plus d'un coût chargé non renseigné, et l'écran afficherait le
 * même vide pour « tu n'as pas ce droit » et « personne n'a saisi le coût ».
 */
type MissionListPage = {
  missions: MissionView[]
  canReadFinance: boolean
  /**
   * #2194.7 / #2194.43 — le vivier entier, jamais borné aux missions de cette
   * page : combien de consultants ACTIFS n'ont, aujourd'hui, aucune mission en
   * cours (`DeliveryService.intercontractCount`, un COMPTE, toujours un vrai
   * nombre côté serveur). OPTIONNELLE ici : une API plus ancienne que ce code
   * ne l'envoie pas encore — même tolérance de déploiement que `nextAction`,
   * `renewal_status` plus haut dans ce fichier. L'appelant lit `?? 0`, un
   * repli légitime sur un COMPTEUR (même exemption que documentée par la
   * garde GA-19).
   */
  intercontractCount?: number
}

type MissionTerms = {
  /** Voyage avec la réponse : sans lui, l'écran ne saurait pas distinguer
   *  « pas le droit » de « pas renseigné », et afficherait le même vide. */
  canReadFinance: boolean
  terms: MissionCommercialTerms | null
  /** La marge JOURNALIÈRE — le NOYAU, inchangé depuis toujours. Elle est HORS
   *  FRAIS : elle ne l'a jamais dit avant ce lot parce qu'elle n'avait rien à
   *  côté d'elle qui les compte. `marginWithExpenses` est cette vue-là. */
  margin: { amountCents: number; percent: number } | null
  /** La somme des lignes de frais (30/08/2026), en centimes. `0` sur une
   *  mission sans ligne — un fait vrai, jamais un « non mesuré » déguisé.
   *  `null` = pas le droit (D45), à distinguer via `canReadFinance`. */
  expensesTotalCents: number | null
  /** La somme des factures fournisseur (30/08/2026), toutes en centimes —
   *  `disputed` comprise (« on archive, on ne supprime pas »). Même régime
   *  `null`/`0` que `expensesTotalCents`. */
  supplierInvoicesTotalCents: number | null
  /** La marge nette des frais ET des factures fournisseur, amortis ENSEMBLE
   *  sur la durée écoulée de la mission. `null` dans trois cas bien
   *  distincts : la marge de base est déjà inconnue, aucun coût additionnel
   *  n'a été saisi, ou des coûts existent sans date de début pour les
   *  amortir — l'écran ne les confond jamais entre eux. */
  marginWithExpenses: { amountCents: number; percent: number } | null
  /** #2420 — le calcul complet du moteur de marge : trois niveaux, ses
   *  sources, sa période, ses exclusions, son état, ses alertes. `null` sans
   *  `finance:read` ; ABSENT d'une réponse d'avant le moteur. */
  marginEngine?: MissionMarginComputation | null
}

/**
 * ⚠️ `canReadFinance` voyage AVEC la page (D45) : depuis que les montants
 * valent `null` aussi bien pour « pas le droit » que pour « pas chiffrable »,
 * c'est le seul champ qui permette à l'écran de dire lequel des deux — et les
 * deux appellent des gestes opposés : demander un accès, ou aller chercher un
 * relevé.
 */
type ReadinessPage = {
  items: InvoiceReadiness[]
  summary: ReadinessSummary
  month: string
  canReadFinance: boolean
}

/** Ce que rend `GET /delivery/finance/margin` : l'agrégat pondéré par les JOURS
 *  (une mission d'un jour ne pèse pas comme une mission d'un an), plus le seuil
 *  d'alerte de l'espace et les missions qui passent dessous. */
/** La marge par CANAL et le coût de l'intermédiation. `intermediationCost` est
 *  `null` dès qu'un des deux termes manque — un chantier de référencement ne se
 *  lance pas sur un écart calculé contre une valeur absente. */
type MarginByChannelResponse = {
  periodMonth: string
  byChannel: Array<{ channel: string; marginPercent: number | null; missions: number; unmeasured: number }>
  intermediationCost: number | null
}

type AggregateMarginResponse = {
  marginPercent: number | null
  measured: number
  unmeasured: number
  /**
   * ⚠️ La MESURABILITÉ de l'agrégat — le champ voyageait depuis le 26/08 et
   * n'était même pas DÉCLARÉ ici, donc lu par personne.
   *
   * Contrairement au délai de paiement, `marginPercent` ne s'annule PAS sous le
   * seuil : « sous le seuil, le chiffre reste calculé ». Sans ce champ, une
   * marge tirée de deux missions se compare à la cible « 25-40 % » avec toute
   * l'autorité d'un pourcentage d'espace.
   *
   * OPTIONNEL : le chemin d'erreur du serveur rend l'agrégat sans lui, et le web
   * se déploie dix minutes avant l'API. Absent ⇒ on ne bloque pas la
   * comparaison, on ne la fabrique pas non plus.
   */
  measurability?: { measurable: boolean; observed: number; required: number; missing: number }
  threshold: number | null
  alerts: Array<{ missionId: string; label: string | null; margin: number }>
}

/** Le board à douze colonnes, ses agrégats et ses cartes. */
type BoardPage = {
  cards: MissionBoardCard[]
  columns: MissionBoardColumnSummary[]
  intakeCount: number
  /** Le DROIT financier du lecteur. Depuis D45, `card.marginPercent: null` ne
   *  dit plus à lui seul si c'est « pas le droit » ou « pas mesuré ». */
  canReadFinance: boolean
}

/** Une ligne du relevé d'activité, telle que l'API la rend. */
export type TimesheetLine = {
  /** L'identifiant du RELEVÉ — `null` quand rien n'a été déposé. C'est lui que
   *  visent « expliquer l'écart » et « valider côté client ». */
  timesheetId: string | null
  missionId: string
  missionLabel: string | null
  accountName: string | null
  consultantId: string | null
  consultantName: string | null
  periodMonth: string
  /** ⚠️ La TAXONOMIE du contrat, pas `string` : le tiroir de validation dérive
   *  ce que le serveur autorise encore (`timesheetDecisionLock`) à partir de ce
   *  champ, et un `string` laisserait passer un statut qui n'existe pas. */
  status: TimesheetStatus
  days: number | null
  expectedDays: number | null
  gap: number | null
  gapKind: 'none' | 'unknown' | 'under' | 'over'
  gapExplanation: string | null
  blocksInvoicing: boolean
  validatedByClientAt: string | null
  /** #2196.16 — celui qui a ENREGISTRÉ la validation client, jamais le
   *  contact client lui-même. `null` tant que rien n'a été validé. */
  approverName: string | null
  anomalies: string[]
  remindersSent: number
  lastReminderAt: string | null
  /** Quand le relevé a été rejeté, et POURQUOI. La trace SURVIT au redépôt :
   *  on archive, on ne supprime pas. */
  rejectedAt: string | null
  rejectionReason: string | null
  /** #2415.7 — COMBIEN de jours posent problème, et PAR QUAND corriger.
   *  Conservées comme le motif : `null` tant qu'aucun rejet n'existe, jamais
   *  effacées par un redépôt (même régime que `rejectedAt`/`rejectionReason`). */
  contestedDays: number | null
  correctionDeadline: string | null
  /** #2415.5 — QUI a déclaré, distinct de `consultantName` (DE QUI c'est le
   *  mois) : un ops peut déclarer un mois pour un autre consultant. `null`
   *  sur une ligne historique, d'avant cette trace. */
  submittedByName: string | null
  /** #2415.6 — la revue INTERNE, distincte de `validatedByClientAt` : un geste
   *  séparé, posé avant la validation client. `null` tant qu'aucune revue
   *  n'a été posée. */
  internalReviewedAt: string | null
  internalReviewedByName: string | null
  /** #2196.31 — l'exception « non applicable » ACTIVE (qui, quand, pourquoi),
   *  ou `null`. Présente même quand un relevé déposé l'a rendue sans effet. */
  notApplicable: TimesheetNotApplicable | null
  /** #2196.33/#2196.34 — un rappel AVANT l'échéance (mois en cours, rien
   *  déposé), distinct du retard : il ne consomme aucun rang de relance. */
  preDeadlineReminder: { kind: 'before'; daysRemaining: number } | { kind: 'dueToday' } | null
}

type TimesheetPage = {
  month: string
  items: TimesheetLine[]
  summary: {
    total: number
    /** Le mois court ENCORE (`expected`/`draft`). Voir `late` pour le mois clos. */
    awaiting: number
    /** #2196.6 — le mois est CLOS et rien n'est arrivé (`missing`). Sorti
     *  d'`awaiting` le 17/09/2026 : les deux appellent un regard différent. */
    late: number
    submitted: number
    validated: number
    disputed: number
    /** Les relevés RENVOYÉS à leur auteur, motif à l'appui. Compté à part :
     *  « personne n'a déposé » et « on a refusé » appellent deux gestes
     *  différents — relancer, ou corriger. */
    rejected: number
    /** #2196.24 — la relance a atteint son troisième rang sans dépôt : le
     *  sujet a besoin d'un humain, pas d'une quatrième relance. */
    escalated: number
    notRequired: number
    blocking: number
    declaredDays: number | null
  }
}

/**
 * Ce qu'un LIEN DE SOURCE resserre sur la liste (§4.4).
 *
 * Les deux clés sont celles que `missionsOfAccount` / `missionsOfConsultant`
 * posent dans leur `href`. Le filtre voyage jusqu'au SERVEUR : `GET
 * /delivery/missions` plafonne à 200 lignes sans pagination, et filtrer ces
 * 200-là dans le navigateur rendrait un sous-ensemble faux sous un lien qui
 * promet la source.
 */
type MissionListFilters = {
  accountId?: string
  consultantId?: string
  /** UNE mission par son identité — ce que lit son DOSSIER. Voir {@link useMission}. */
  id?: string
  /**
   * La PORTÉE demandée (D880). `own` = le portefeuille du lecteur ; absente =
   * l'espace, ce que le serveur rend quand personne ne demande rien.
   *
   * ⚠️ Elle manquait ici alors que le serveur la lisait DÉJÀ
   * (`delivery.controller.ts:146-149`, `readListScope`). Le bloc « Mes missions
   * en cours » du cockpit rendait donc les missions de tout l'espace sous un
   * titre qui promet celles du lecteur — motif « paramètre déclaré, jamais
   * passé », et jumeau exact du défaut « Mon pipe ».
   */
  scope?: FinanceScopeRequest
}

/**
 * La portée qu'un appelant DEMANDE — à ne pas confondre avec {@link FinanceScopeInfo},
 * la portée que le serveur dit avoir APPLIQUÉE.
 *
 * Une seule valeur existe : `own`. Il n'y a pas de `workspace` explicite, parce
 * que le serveur n'en connaît pas — l'espace est ce qu'il rend quand on ne
 * demande rien. Inventer la valeur ferait partir un paramètre que personne ne
 * lit, ce qui est exactement le défaut inverse de celui qu'on répare.
 */
type FinanceScopeRequest = 'own'

/**
 * #2562 — un deal candidat à la reprise, miroir EXACT du type API
 * (`mission-crm-reprisal.service.ts`, local à son fichier — voir la note sur
 * `LinkedCrmDeal` dans `mission-panel.api.ts` pour la même convention).
 */
export type CrmReprisalCandidateDeal = {
  dealId: string
  name: string | null
  stage: string | null
  stageLabel: string | null
  amount: string | null
  isClosed: boolean
  isWon: boolean | null
}

export type CrmReprisalCandidates = {
  available: boolean
  /** L'identifiant technique SEUL — jamais un nom : `clientToolName` le résout. */
  provider: string | null
  deals: CrmReprisalCandidateDeal[]
}

export const missionKeys = {
  /**
   * ⚠️ Les filtres entrent dans la CLÉ. Sans eux, la liste du compte A et celle
   * du compte B partagent le même cache : le second lien de source rendrait la
   * réponse du premier — un écran filtré qui montre les missions d'ailleurs.
   */
  list: (filters?: MissionListFilters) =>
    // ⚠️ `id` entre dans la clé au même titre que les deux autres. Sans lui, la
    // réponse à UNE mission (le dossier) et la liste entière partageraient une
    // entrée de cache : le premier écran ouvert déciderait de ce que le second
    // affiche — ici, un tableau qui ne montre qu'une ligne, ou un dossier qui
    // se croit chargé.
    // ⚠️ La PORTÉE entre dans la clé au même titre qu'un filtre (D880) : le
    // cockpit demande `own`, `/missions` demande l'espace. Sans elle, le
    // premier des deux écrans ouvert déciderait de ce que l'autre affiche.
    [
      'missions',
      filters?.accountId ?? 'all',
      filters?.consultantId ?? 'all',
      filters?.id ?? 'all',
      filters?.scope ?? 'workspace',
    ] as const,
  board: (filters?: string) => ['missions', 'board', filters ?? 'all'] as const,
  timesheets: (month?: string) => ['missions', 'timesheets', month ?? 'default'] as const,
  renewals: () => ['missions', 'renewals'] as const,
  /** La dérive de mission (PDF 5 §7.2) — un verdict par mission en cours. */
  drift: () => ['missions', 'drift'] as const,
  /** #2562 — la proposition de reprise depuis le CRM connecté. */
  crmReprisalCandidates: () => ['missions', 'crm-reprisal-candidates'] as const,
  /**
   * ⚠️ La PORTÉE entre dans la clé, au même titre qu'un filtre. Le cockpit
   * demande le chiffre du lecteur, `/pilotage` celui de l'espace : sans la
   * portée dans la clé, les deux écrans partagent une entrée et le premier
   * ouvert décide de ce que le second affiche — « Mon chiffre d'affaires »
   * rendrait alors celui de l'ESN, ce que ce lot répare précisément.
   */
  revenue: (month?: string, scope?: FinanceScopeRequest) =>
    ['missions', 'revenue', month ?? 'default', scope ?? 'workspace'] as const,
  forecast: (scope?: FinanceScopeRequest) => ['missions', 'forecast', scope ?? 'workspace'] as const,
  capacity: (month?: string) => ['missions', 'capacity', month ?? 'default'] as const,
  margin: (month?: string, scope?: FinanceScopeRequest) =>
    ['missions', 'margin', month ?? 'default', scope ?? 'workspace'] as const,
  dso: () => ['missions', 'dso'] as const,
  marginChannels: (month?: string) => ['missions', 'margin-channels', month ?? 'default'] as const,
  scores: (id: string) => ['missions', id, 'scores'] as const,
  readiness: (month?: string) => ['missions', 'readiness', month ?? 'default'] as const,
  assignments: (id: string) => ['missions', id, 'assignments'] as const,
  terms: (id: string) => ['missions', id, 'terms'] as const,
  /** #2407.3 — la provenance des champs principaux, par mission. */
  fieldSources: (id: string) => ['missions', id, 'field-sources'] as const,
  /** #2338 / #2409 — le double accord et la checklist de démarrage. */
  startReadiness: (id: string) => ['missions', id, 'start-readiness'] as const,
  /** #2414 (LAU-FINAL-128) / épopée #2986 — la checklist de sortie. */
  endChecklist: (id: string) => ['missions', id, 'end-checklist'] as const,
  /** #2414.54-59 — l'interruption déclarée, si elle existe. */
  interruption: (id: string) => ['missions', id, 'interruption'] as const,
  expenses: (id: string) => ['missions', id, 'expenses'] as const,
  /** #2412 — le double pouls de satisfaction, deux rails. */
  feedback: (id: string) => ['missions', id, 'feedback'] as const,
  supplierInvoices: (id: string) => ['missions', id, 'supplier-invoices'] as const,
  /** #2419.9 — les paiements CONSTATÉS (#2419.1), pour le seau « non rapproché ». */
  payments: () => ['missions', 'payments'] as const,
  /** #2193.51 (épopée #2953) — les documents suivis au niveau de la mission. */
  documents: (id: string) => ['missions', id, 'documents'] as const,
  /** #3269 (BEL-SC-240) / #3291 — les dix-sept jalons de delivery. */
  deliveryMilestones: (id: string) => ['missions', id, 'delivery-milestones'] as const,
}

export const missionsApi = {
  list(filters: MissionListFilters = {}): Promise<MissionListPage> {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value)
    }
    const query = params.toString()
    return apiFetch<MissionListPage>({ path: query ? `/delivery/missions?${query}` : '/delivery/missions' })
  },
  /**
   * ⚠️ `canReadFinance` VOYAGE désormais (#1365).
   *
   * La route lisait avec `canReadFinance: false` EN DUR, au motif qu'« un
   * renouvellement ne montre aucun montant ». C'était vrai des cartes que la
   * lentille rendait ; ce ne l'est plus depuis qu'elle rend le même tableau que
   * « En cours ». La colonne « Marge » y disait « pas ton périmètre » à tout le
   * monde — un droit refusé par une constante, pas par un rôle.
   */
  renewals(): Promise<{ missions: MissionView[]; canReadFinance: boolean }> {
    return apiFetch<{ missions: MissionView[]; canReadFinance: boolean }>({ path: '/delivery/renewals' })
  },
  /**
   * ⚠️ `/delivery/mission-drift` et NON `/delivery/missions/drift` : le second
   * serait capturable par le préfixe `delivery/missions/:id` d'un AUTRE
   * contrôleur, qui y déclare une route de collection nue.
   */
  drift(): Promise<MissionDriftReport[]> {
    return apiFetch<MissionDriftReport[]>({ path: '/delivery/mission-drift' })
  },
  /** #2562 — y a-t-il une reprise à PROPOSER ? Miroir de
   *  `CrmReprisalCandidates` côté API (`mission-crm-reprisal.service.ts`). */
  crmReprisalCandidates(): Promise<CrmReprisalCandidates> {
    return apiFetch<CrmReprisalCandidates>({ path: '/delivery/missions/crm-reprisal-candidates' })
  },
  /**
   * #2560 — la vraie création de `MissionEntity`, jusqu'ici SANS appelant web
   * (seul l'outil interne `create_mission` du copilote l'appelait). Câblée
   * pour le dialogue « Créer depuis un document » de `TabMissions.tsx` :
   * l'écran corrige les champs proposés, ce POST est le geste qui écrit.
   *
   * Le geste ORDINAIRE de création — le même que sert #2562 : le clic EST la
   * décision, `crmDealId` facultatif rattache la mission à sa reprise.
   */
  create(input: CreateMissionRequest): Promise<MissionView> {
    return apiFetch<MissionView, CreateMissionRequest>({
      path: '/delivery/missions',
      method: 'POST',
      body: input,
    })
  },
  /** #4196 — terminer une mission : statut, motif, consultants libérés. */
  end(id: string, input: EndMissionInput): Promise<MissionLifecycleResult> {
    return apiFetch<MissionLifecycleResult, EndMissionInput>({
      path: `/delivery/missions/${id}/end`,
      method: 'POST',
      body: input,
    })
  },
  /** #4196 — prolonger une mission : avenant accepté, échéance, consultants repoussés. */
  extend(id: string, input: ExtendMissionInput): Promise<MissionLifecycleResult> {
    return apiFetch<MissionLifecycleResult, ExtendMissionInput>({
      path: `/delivery/missions/${id}/extend`,
      method: 'POST',
      body: input,
    })
  },
  assignments(id: string): Promise<{ items: MissionAssignment[] }> {
    return apiFetch<{ items: MissionAssignment[] }>({ path: `/delivery/missions/${id}/assignments` })
  },
  assign(id: string, input: AssignmentInput): Promise<MissionAssignment> {
    return apiFetch<MissionAssignment, AssignmentInput>({
      path: `/delivery/missions/${id}/assignments`,
      method: 'PUT',
      body: input,
    })
  },
  unassign(id: string, assignmentId: string): Promise<void> {
    return apiFetch<void>({ path: `/delivery/missions/${id}/assignments/${assignmentId}`, method: 'DELETE' })
  },
  terms(id: string): Promise<MissionTerms> {
    return apiFetch<MissionTerms>({ path: `/delivery/missions/${id}/terms` })
  },
  /**
   * #2407.3 — RÉFUTÉ en prod le 23/09 : `GET …/field-sources` existait côté
   * API depuis le 22/09 soir SANS AUCUN appelant web. Câblée sur la fiche
   * mission (`MissionDossierPage.tsx`).
   */
  fieldSources(id: string): Promise<MissionFieldSources> {
    return apiFetch<MissionFieldSources>({ path: `/delivery/missions/${id}/field-sources` })
  },
  /** #2338 / #2409 — les deux accords et les prérequis de démarrage, avec le verdict. */
  startReadiness(id: string): Promise<MissionStartReadiness> {
    return apiFetch<MissionStartReadiness>({ path: `/delivery/missions/${id}/start-readiness` })
  },
  /** #2338 / #2409.7 — un geste humain, avec sa preuve. */
  confirmStartCheck(id: string, input: MissionStartCheckInput): Promise<MissionStartReadiness> {
    return apiFetch<MissionStartReadiness, MissionStartCheckInput>({
      path: `/delivery/missions/${id}/start-checks`,
      method: 'POST',
      body: input,
    })
  },
  /** Retirer un geste : archivé côté serveur, jamais supprimé. */
  withdrawStartCheck(id: string, item: MissionStartDeclaredKey): Promise<MissionStartReadiness> {
    return apiFetch<MissionStartReadiness>({
      path: `/delivery/missions/${id}/start-checks/${item}/withdraw`,
      method: 'POST',
    })
  },
  /** #2414.11-33 — la checklist de sortie (client / consultant / interne), avec son verdict. */
  endChecklist(id: string): Promise<MissionEndChecklist> {
    return apiFetch<MissionEndChecklist>({ path: `/delivery/missions/${id}/end-checklist` })
  },
  confirmEndCheck(id: string, input: MissionEndCheckInput): Promise<MissionEndChecklist> {
    return apiFetch<MissionEndChecklist, MissionEndCheckInput>({
      path: `/delivery/missions/${id}/end-checks`,
      method: 'POST',
      body: input,
    })
  },
  withdrawEndCheck(id: string, item: MissionEndCheckKey): Promise<MissionEndChecklist> {
    return apiFetch<MissionEndChecklist>({
      path: `/delivery/missions/${id}/end-checks/${item}/withdraw`,
      method: 'POST',
    })
  },
  /** #3269 (BEL-SC-240) / #3291 — les dix-sept jalons, déclarés ou projetés depuis leur maison canonique. */
  deliveryMilestones(id: string): Promise<MissionDeliveryMilestoneStatus[]> {
    return apiFetch<MissionDeliveryMilestoneStatus[]>({ path: `/delivery/missions/${id}/delivery-milestones` })
  },
  declareDeliveryMilestone(
    id: string,
    input: DeclareMissionDeliveryMilestoneInput,
  ): Promise<MissionDeliveryMilestoneStatus[]> {
    return apiFetch<MissionDeliveryMilestoneStatus[], DeclareMissionDeliveryMilestoneInput>({
      path: `/delivery/missions/${id}/delivery-milestones`,
      method: 'POST',
      body: input,
    })
  },
  /** #2414.1-8 — le motif de fin, typé. */
  setEndReason(id: string, input: MissionEndReasonInput): Promise<void> {
    return apiFetch<void, MissionEndReasonInput>({
      path: `/delivery/missions/${id}/end-reason`,
      method: 'POST',
      body: input,
    })
  },
  /** #2414.54-59 — l'interruption déclarée pour cette mission, ou `null`. */
  interruption(id: string): Promise<MissionInterruption | null> {
    return apiFetch<MissionInterruption | null>({ path: `/delivery/missions/${id}/interruption` })
  },
  /** #2414.54-58 — déclarer une interruption (NO-GO : ne rend jamais le consultant disponible). */
  declareInterruption(id: string, input: MissionInterruptionInput): Promise<void> {
    return apiFetch<void, MissionInterruptionInput>({
      path: `/delivery/missions/${id}/interruption`,
      method: 'POST',
      body: input,
    })
  },
  /** #2414.59, NO-GO — le seul geste qui revalide la disponibilité après une interruption. */
  confirmAvailability(id: string): Promise<void> {
    return apiFetch<void>({ path: `/delivery/missions/${id}/interruption/confirm-availability`, method: 'POST' })
  },
  /** #2193.51 (épopée #2953) — les documents (contrat signé, avenant, NDA)
   *  suivis au niveau de la MISSION, distincts de `project-document.ts` (l'affaire). */
  listDocuments(id: string): Promise<{ items: MissionDocument[] }> {
    return apiFetch<{ items: MissionDocument[] }>({ path: `/delivery/missions/${id}/documents` })
  },
  createDocument(id: string, input: CreateMissionDocumentInput): Promise<MissionDocument> {
    return apiFetch<MissionDocument, CreateMissionDocumentInput>({
      path: `/delivery/missions/${id}/documents`,
      method: 'POST',
      body: input,
    })
  },
  updateDocumentStatus(id: string, documentId: string, status: MissionDocumentStatus): Promise<MissionDocument> {
    return apiFetch<MissionDocument, { status: MissionDocumentStatus }>({
      path: `/delivery/missions/${id}/documents/${documentId}/status`,
      method: 'PATCH',
      body: { status },
    })
  },
  /**
   * #2423.9 — LE CLIC DE LA CARTE LAURA (`PendingActions.tsx`) : la MÊME porte
   * que le dossier de la mission (`records:write`, espace vérifié côté
   * serveur). L'avenant reste `proposed` — l'accepter/l'activer est un geste
   * distinct, posé dans le dossier de la mission.
   */
  proposeAmendment(id: string, input: ProposeMissionAmendmentInput): Promise<MissionAmendmentView> {
    return apiFetch<MissionAmendmentView, ProposeMissionAmendmentInput>({
      path: `/delivery/missions/${id}/amendments`,
      method: 'POST',
      body: input,
    })
  },
  /** #2420.14 — un scénario de marge. Ne touche à rien côté serveur. */
  marginScenario(id: string, input: MissionMarginScenario): Promise<MissionMarginScenarioResult> {
    return apiFetch<MissionMarginScenarioResult, MissionMarginScenario>({
      path: `/delivery/missions/${id}/terms/scenario`,
      method: 'POST',
      body: input,
    })
  },
  setTerms(id: string, input: UpsertCommercialTermsInput): Promise<MissionCommercialTerms> {
    return apiFetch<MissionCommercialTerms, UpsertCommercialTermsInput>({
      path: `/delivery/missions/${id}/terms`,
      method: 'PUT',
      body: input,
    })
  },
  /** Les frais (30/08/2026) — réservés à `finance:read`, comme le coût chargé
   *  qu'ils complètent. */
  expenses(id: string): Promise<{ items: MissionExpense[] }> {
    return apiFetch<{ items: MissionExpense[] }>({ path: `/delivery/missions/${id}/expenses` })
  },
  createExpense(id: string, input: CreateMissionExpenseInput): Promise<MissionExpense> {
    return apiFetch<MissionExpense, CreateMissionExpenseInput>({
      path: `/delivery/missions/${id}/expenses`,
      method: 'POST',
      body: input,
    })
  },
  updateExpense(id: string, expenseId: string, input: UpdateMissionExpenseInput): Promise<MissionExpense> {
    return apiFetch<MissionExpense, UpdateMissionExpenseInput>({
      path: `/delivery/missions/${id}/expenses/${expenseId}`,
      method: 'PATCH',
      body: input,
    })
  },
  /** #2412 — les deux rails de satisfaction, déjà séparés côté serveur. */
  feedback(id: string): Promise<MissionFeedbackRails> {
    return apiFetch<MissionFeedbackRails>({ path: `/delivery/missions/${id}/feedback` })
  },
  submitFeedback(id: string, input: CreateMissionFeedbackRequest): Promise<unknown> {
    return apiFetch<unknown, CreateMissionFeedbackRequest>({
      path: `/delivery/missions/${id}/feedback`,
      method: 'POST',
      body: input,
    })
  },
  /** Les factures fournisseur (30/08/2026) — distinctes de la facturation
   *  CLIENT, réservées à `finance:read` comme les frais. */
  supplierInvoices(id: string): Promise<{ items: SupplierInvoice[] }> {
    return apiFetch<{ items: SupplierInvoice[] }>({ path: `/delivery/missions/${id}/supplier-invoices` })
  },
  createSupplierInvoice(id: string, input: CreateSupplierInvoiceInput): Promise<SupplierInvoice> {
    return apiFetch<SupplierInvoice, CreateSupplierInvoiceInput>({
      path: `/delivery/missions/${id}/supplier-invoices`,
      method: 'POST',
      body: input,
    })
  },
  updateSupplierInvoice(id: string, invoiceId: string, input: UpdateSupplierInvoiceInput): Promise<SupplierInvoice> {
    return apiFetch<SupplierInvoice, UpdateSupplierInvoiceInput>({
      path: `/delivery/missions/${id}/supplier-invoices/${invoiceId}`,
      method: 'PATCH',
      body: input,
    })
  },
  /** Fait avancer le cycle de vie — « devons-nous payer », `finance:write`
   *  côté serveur, comme les gestes équivalents de la facturation client. */
  setSupplierInvoiceStatus(
    id: string,
    invoiceId: string,
    input: SetSupplierInvoiceStatusInput,
  ): Promise<SupplierInvoice> {
    return apiFetch<SupplierInvoice, SetSupplierInvoiceStatusInput>({
      path: `/delivery/missions/${id}/supplier-invoices/${invoiceId}/status`,
      method: 'POST',
      body: input,
    })
  },
}

export const missionBoardApi = {
  board(filters: Record<string, string | boolean | undefined> = {}): Promise<BoardPage> {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === '' || value === false) continue
      params.set(key, String(value))
    }
    const query = params.toString()
    return apiFetch<BoardPage>({ path: query ? `/delivery/board?${query}` : '/delivery/board' })
  },
  move(
    missionId: string,
    body: { to: string; reason?: string; acceptedActions: string[] },
  ): Promise<{ status: string; movedAt: string; actions: BoardMoveOutcome }> {
    return apiFetch<{ status: string; movedAt: string; actions: BoardMoveOutcome }, typeof body>({
      path: `/delivery/missions/${missionId}/move`,
      method: 'POST',
      body,
    })
  },
}

export const timesheetsApi = {
  month(month?: string, blockingOnly = false): Promise<TimesheetPage> {
    const params = new URLSearchParams()
    if (month) params.set('month', month)
    if (blockingOnly) params.set('blockingOnly', 'true')
    const query = params.toString()
    return apiFetch<TimesheetPage>({ path: query ? `/delivery/timesheets?${query}` : '/delivery/timesheets' })
  },
  explainGap(id: string, explanation: string) {
    return apiFetch<{ id: string; gapExplanation: string }, { explanation: string }>({
      path: `/delivery/timesheets/${id}/explain-gap`,
      method: 'POST',
      body: { explanation },
    })
  },
  /**
   * Rejette un relevé. Le MOTIF, la quantité CONTESTÉE et la DEADLINE de
   * correction partent tous les trois dans le corps — et le serveur les
   * exige tous les trois : `rejectTimesheetSchema` est `.strict()` et refuse
   * un rejet incomplet (#2415.7), donc ce n'est pas le bouton grisé qui tient
   * la règle.
   */
  reject(id: string, input: { reason: string; contestedDays: number; correctionDeadline: string }) {
    return apiFetch<
      {
        id: string
        status: string
        rejectedAt: string
        rejectionReason: string
        contestedDays: number
        correctionDeadline: string
      },
      { reason: string; contestedDays: number; correctionDeadline: string }
    >({
      path: `/delivery/timesheets/${id}/reject`,
      method: 'POST',
      body: input,
    })
  },
  /**
   * #2196.31 — MARQUE un mois « non applicable ». La maille part dans le CORPS
   * (un mois sans dépôt n'a pas d'identifiant de relevé) ; le motif est exigé
   * par le serveur (`markTimesheetNotApplicableSchema`, `.strict()`).
   */
  markNotApplicable(body: MarkTimesheetNotApplicableInput) {
    return apiFetch<{ id: string }, MarkTimesheetNotApplicableInput>({
      path: '/delivery/timesheets/not-applicable',
      method: 'POST',
      body,
    })
  },
  /** #2196.31 — ANNULE l'exception : révoquée, jamais supprimée. */
  revokeNotApplicable(exceptionId: string) {
    return apiFetch<{ id: string }, Record<string, never>>({
      path: `/delivery/timesheets/not-applicable/${exceptionId}/revoke`,
      method: 'POST',
      body: {},
    })
  },
  validateByClient(id: string) {
    return apiFetch<{ id: string; at: string }, Record<string, never>>({
      path: `/delivery/timesheets/${id}/client-validation`,
      method: 'POST',
      body: {},
    })
  },
  /** #2415.6 — geste SÉPARÉ de `validateByClient` : la revue interne. */
  reviewInternally(id: string) {
    return apiFetch<{ id: string; at: string }, Record<string, never>>({
      path: `/delivery/timesheets/${id}/internal-review`,
      method: 'POST',
      body: {},
    })
  },
  /**
   * Le DOSSIER d'un relevé, pour le tiroir de validation.
   *
   * ⚠️ La maille est (mission × mois × consultant) et non l'identifiant du
   * relevé : un mois sans dépôt n'a pas d'identifiant, et c'est justement le
   * mois qu'il faut pouvoir ouvrir — c'est celui qui coûte.
   */
  review(missionId: string, month: string, consultantId: string | null): Promise<TimesheetReview> {
    const params = new URLSearchParams({ missionId, month })
    if (consultantId) params.set('consultantId', consultantId)
    return apiFetch<TimesheetReview>({ path: `/delivery/timesheets/review?${params.toString()}` })
  },
  open(month: string) {
    return apiFetch<{ created: number }, { month: string }>({
      path: '/delivery/timesheets/open',
      method: 'POST',
      body: { month },
    })
  },
  /**
   * #2196.30 — les relances DUES, et par quel canal. Le calcul (`dueReminders`,
   * `timesheets.service.ts`) existait déjà, testé, depuis l'origine de la
   * cadence [5, 12, 20] — sans AUCUN appelant web, exactement le défaut que
   * `PaymentReminderDue` a réparé côté encaissements (item #87).
   *
   * ⚠️ `line` n'est PAS retypé en `TimesheetLine` complet : cette lecture ne
   * sert qu'à RAPPROCHER la relance due de la ligne déjà chargée par
   * `useTimesheetMonth` (mission × consultant), jamais à la remplacer — deux
   * lectures de la même ligne pourraient tomber de part et d'autre d'une
   * frappe.
   */
  reminders(month?: string): Promise<DueTimesheetReminders> {
    const params = month ? `?month=${encodeURIComponent(month)}` : ''
    return apiFetch<DueTimesheetReminders>({ path: `/delivery/timesheets/reminders${params}` })
  },
  /** Enregistre qu'une relance de RELEVÉ est PARTIE. Distinct de
   *  `invoiceReadinessApi.recordReminder` : deux cadences, deux compteurs,
   *  deux routes. */
  recordReminder(id: string) {
    return apiFetch<{ remindersSent: number }, Record<string, never>>({
      path: `/delivery/timesheets/${id}/reminder`,
      method: 'POST',
      body: {},
    })
  },
  /**
   * #2972 — les relevés ESCALADÉS, et vers quel PORTEUR de mission le sujet
   * remonte (`dueEscalations`, `timesheets.service.ts`). Jamais un envoi :
   * Laura prépare, un humain agit.
   */
  escalations(month?: string): Promise<DueTimesheetEscalations> {
    const params = month ? `?month=${encodeURIComponent(month)}` : ''
    return apiFetch<DueTimesheetEscalations>({ path: `/delivery/timesheets/escalations${params}` })
  },
}

/** La forme minimale dont l'écran a besoin pour RAPPROCHER une relance due
 *  d'une ligne déjà chargée — voir `timesheetsApi.reminders`. */
export type DueTimesheetReminders = {
  items: Array<{
    line: { missionId: string; consultantId: string | null; timesheetId: string | null }
    index: number
    overdueDays: number
    tone: 'neutral' | 'firm' | 'escalate'
  }>
}

/** #2972 — la forme minimale pour RAPPROCHER une escalade d'une ligne déjà
 *  chargée — voir `timesheetsApi.escalations`. */
export type DueTimesheetEscalations = Array<{
  line: { missionId: string; consultantId: string | null; timesheetId: string | null }
  ownerId: string | null
  ownerName: string | null
  clientManagerId: string | null
  clientManagerName: string | null
  /** #2972 — l'ADV (le contact de facturation), le partenaire du consultant
   *  en sous-traitance et le niveau d'escalade : `null` tant que la source
   *  n'en porte pas. */
  advContactId?: string | null
  advName?: string | null
  partnerName?: string | null
  level?: number
  channel: { channel: 'mail_draft' | 'chat_message' | 'crm_task' | 'in_app'; actionLabelKey: string }
  delayDays: number | null
}>

/**
 * Les trois lectures qui portent une PORTÉE (D1 · 26/08/2026).
 *
 * Le serveur dit sur quel périmètre il a compté. Sans cette information, un
 * commercial dont rien n'est attribué lirait « 0 € » et en conclurait qu'il n'a
 * rien vendu — alors que la vérité est « rien ne m'est rattaché ».
 */
type Scoped<T> = T & { scope?: FinanceScopeInfo }

/**
 * Construit la requête d'une lecture PORTÉE.
 *
 * Un seul endroit fabrique cette URL : quatre routes acceptent `?scope=own` et
 * quatre appelants la recopiaient à la main, ce qui est la façon dont un
 * paramètre finit par manquer sur le troisième.
 */
function scopedPath(route: string, month?: string, scope?: FinanceScopeRequest): string {
  const params = new URLSearchParams()
  if (month) params.set('month', month)
  if (scope) params.set('scope', scope)
  const query = params.toString()
  return query ? `${route}?${query}` : route
}

export const financeApi = {
  revenue(month?: string, scope?: FinanceScopeRequest): Promise<Scoped<RevenueBreakdown>> {
    return apiFetch<Scoped<RevenueBreakdown>>({ path: scopedPath('/delivery/finance/revenue', month, scope) })
  },
  forecast(scope?: FinanceScopeRequest): Promise<Scoped<Forecast>> {
    return apiFetch<Scoped<Forecast>>({ path: scopedPath('/delivery/finance/forecast', undefined, scope) })
  },
  capacity(month?: string): Promise<CapacityForecast> {
    return apiFetch<CapacityForecast>({
      path: month ? `/delivery/finance/capacity?month=${month}` : '/delivery/finance/capacity',
    })
  },
  margin(month?: string, scope?: FinanceScopeRequest): Promise<Scoped<AggregateMarginResponse>> {
    return apiFetch<Scoped<AggregateMarginResponse>>({ path: scopedPath('/delivery/finance/margin', month, scope) })
  },
  marginByChannel(month?: string): Promise<MarginByChannelResponse> {
    return apiFetch<MarginByChannelResponse>({
      path: month ? `/delivery/finance/margin-by-channel?month=${month}` : '/delivery/finance/margin-by-channel',
    })
  },
  dso(): Promise<DsoResult> {
    return apiFetch<DsoResult>({ path: '/delivery/finance/dso' })
  },
  scores(id: string): Promise<{ risk: MissionScore | null; opportunity: MissionScore | null }> {
    return apiFetch<{ risk: MissionScore | null; opportunity: MissionScore | null }>({
      path: `/delivery/finance/missions/${id}/scores`,
    })
  },
}

export const invoiceReadinessApi = {
  list(month?: string): Promise<ReadinessPage> {
    const params = new URLSearchParams()
    if (month) params.set('month', month)
    const query = params.toString()
    return apiFetch<ReadinessPage>({
      path: query ? `/delivery/invoice-readiness?${query}` : '/delivery/invoice-readiness',
    })
  },
  /** La fenêtre d'encaissements (plusieurs mois) en UN appel — `useCollectionsWindow`. */
  collections(months: readonly string[]): Promise<{ items: InvoiceReadiness[]; canReadFinance: boolean }> {
    return apiFetch<{ items: InvoiceReadiness[]; canReadFinance: boolean }>({
      path: `/delivery/invoice-readiness/collections?months=${months.join(',')}`,
    })
  },
  /**
   * Marquer un mois comme facturé AILLEURS.
   *
   * La référence, le montant réel et l'échéance voyagent avec : sans eux,
   * « facturé » est une case cochée que rien ne relie au document réel, et
   * aucun retard n'est calculable.
   */
  markInvoiced(
    missionId: string,
    month: string,
    input: { reference?: string; amountCents?: number; dueOn?: string; invoicedAt?: string } = {},
  ): Promise<InvoiceReadiness> {
    return apiFetch<InvoiceReadiness, typeof input>({
      path: `/delivery/invoice-readiness/${missionId}/invoiced?month=${month}`,
      method: 'POST',
      body: input,
    })
  },
  /**
   * L'export du mois, récupéré par le client authentifié.
   *
   * Une balise `<a href>` nue partirait SANS cookie de session et rendrait un
   * 401 que l'utilisateur ouvrirait comme un fichier vide.
   */
  exportCsv(month?: string): Promise<string> {
    const path = month
      ? `/delivery/invoice-readiness/export.csv?month=${month}`
      : '/delivery/invoice-readiness/export.csv'
    return apiFetch<string>({ path, responseType: 'text' })
  },

  /**
   * #2198.45 — l'export de l'écran « encaissements ». `months` est la fenêtre
   * DÉJÀ calculée par `collectionMonths` (collections.ts) : le serveur la
   * reparcourt telle quelle, jamais une fenêtre recalculée séparément.
   */
  exportCollectionsCsv(months: readonly string[]): Promise<string> {
    return apiFetch<string>({
      path: `/delivery/invoice-readiness/collections-export.csv?months=${months.join(',')}`,
      responseType: 'text',
    })
  },

  /**
   * Enregistrer un ENCAISSEMENT (I-77).
   *
   * Les trois routes qui suivent existaient côté serveur, avec leurs colonnes,
   * leurs permissions et leurs tests — et **aucun appelant** : le client web
   * n'exposait que `list`, `markInvoiced` et `exportCsv`. Toute la moitié
   * « l'argent est-il rentré ? » était donc injoignable.
   *
   * `amountCents` reste FACULTATIF et n'est jamais déduit du montant facturé :
   * un paiement partiel est le cas normal d'un litige, et le recopier ferait
   * disparaître l'écart qu'on cherche justement à voir.
   */
  recordPayment(
    missionId: string,
    month: string,
    input: { paidAt?: string; amountCents?: number } = {},
  ): Promise<InvoiceReadiness> {
    return apiFetch<InvoiceReadiness, typeof input>({
      path: `/delivery/invoice-readiness/${missionId}/paid?month=${month}`,
      method: 'POST',
      body: input,
    })
  },

  /**
   * Annuler un « marqué comme facturé » posé par erreur.
   *
   * Le geste était un ALLER SIMPLE : un mois marqué par erreur sortait
   * définitivement des relances — le client ne paie pas, personne ne le
   * relance, et rien ne le dit. Le motif est OBLIGATOIRE côté serveur.
   */
  cancelInvoiced(missionId: string, month: string, reason: string): Promise<InvoiceReadiness> {
    // ⚠️ Le mois voyage dans l'URL, pas dans le corps. La route le lit en
    // `@Query('month')` et son corps est `.strict()` : l'y glisser faisait
    // refuser la requête ENTIÈRE par la validation, et le mois arrivait de
    // toute façon `undefined` côté serveur. Le bouton « Annuler facturé »
    // ne pouvait donc pas fonctionner.
    return apiFetch<InvoiceReadiness, { reason: string }>({
      path: `/delivery/invoice-readiness/${missionId}/invoiced/cancel?month=${month}`,
      method: 'POST',
      body: { reason },
    })
  },

  /**
   * DÉCLARER UN LITIGE sur la facture d'un mois — BEL-MIS-011.
   *
   * **Le litige n'est pas un retard.** Tant que ce geste n'existait pas, une
   * contestation se traitait en annulant le « facturé » : le mois repartait
   * dans les relances, et son délai gonflait le délai de paiement du
   * portefeuille entier. Le motif est OBLIGATOIRE côté serveur.
   */
  openDispute(missionId: string, month: string, reason: string): Promise<InvoiceReadiness> {
    return apiFetch<InvoiceReadiness, { reason: string }>({
      path: `/delivery/invoice-readiness/${missionId}/dispute?month=${month}`,
      method: 'POST',
      body: { reason },
    })
  },

  /** LEVER le litige : la contestation est réglée, les relances reprennent. La
   *  trace du litige, elle, reste — c'est elle qui explique le délai. */
  resolveDispute(missionId: string, month: string): Promise<InvoiceReadiness> {
    return apiFetch<InvoiceReadiness, Record<string, never>>({
      path: `/delivery/invoice-readiness/${missionId}/dispute/resolve?month=${month}`,
      method: 'POST',
      body: {},
    })
  },

  /** Consigner une relance envoyée — c'est ce qui fait exister le compteur. */
  recordReminder(missionId: string, month: string, blockers: string[] = []): Promise<InvoiceReadiness> {
    return apiFetch<InvoiceReadiness, { month: string; blockers: string[] }>({
      path: `/delivery/invoice-readiness/${missionId}/reminder`,
      method: 'POST',
      body: { month, blockers },
    })
  },
}

/**
 * perf P6 — le mois que le SERVEUR lit quand on n'en donne pas : le précédent,
 * en UTC (`previousMonth` d'`invoice-readiness.service.ts` et de
 * `finance.controller.ts`). Nommé côté client, une lecture « sans mois » et la
 * même lecture « du mois précédent » partagent UNE clé de cache et UN appel —
 * `/missions/suivi` en partait sinon deux fois (13 appels au lieu de 12 sur
 * `invoice-readiness`, 7 au lieu de 6 sur `finance/margin`).
 */
export function serverDefaultMonth(now: Date = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  date.setUTCMonth(date.getUTCMonth() - 1)
  return date.toISOString().slice(0, 7)
}

/**
 * perf P6 — le mois que `GET /finance/capacity` lit sans paramètre : le mois
 * COURANT (`currentMonth` de `finance.controller.ts`), contrairement aux autres
 * lectures financières qui prennent le précédent — d'où un nom à part.
 */
export function serverDefaultCapacityMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7)
}

export function useInvoiceReadiness(rawMonth?: string) {
  const month = rawMonth ?? serverDefaultMonth()
  return useQuery({
    queryKey: missionKeys.readiness(month),
    queryFn: () => invoiceReadinessApi.list(month),
    // Même raison que la timeline : un CRA validé ce matin doit sortir des
    // bloqueurs ce matin, pas dans cinq minutes.
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

/** Ce que rend `GET /delivery/payments` — les paiements CONSTATÉS (#2419.1)
 *  qu'aucun humain n'a encore rattachés à une facture. Seul le champ que ce
 *  module lit (`amountCents`) est typé ici : `overpaid` et les candidats de
 *  rapprochement n'ont encore aucun écran (`demo-coverage.ts`, invoice_payments). */
type UnmatchedPayment = { amountCents: number }
type PaymentsView = { unmatched: UnmatchedPayment[] }

export const invoicePaymentsApi = {
  /** #2419.9 — la SEULE lecture qui alimente le seau « non rapproché ». */
  list(): Promise<PaymentsView> {
    return apiFetch<PaymentsView>({ path: '/delivery/payments' })
  },
}

export function useInvoicePayments() {
  return useQuery({
    queryKey: missionKeys.payments(),
    queryFn: () => invoicePaymentsApi.list(),
    // Même raison que `useInvoiceReadiness` : un paiement saisi à l'instant
    // doit sortir du seau « non rapproché » dès qu'il est rattaché.
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

/**
 * LA FENÊTRE D'ENCAISSEMENT — plusieurs mois, une seule réponse composée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI PLUSIEURS REQUÊTES ET PAS UNE ROUTE DE PLUS
 * ─────────────────────────────────────────────────────────────────────────
 * `GET /delivery/invoice-readiness` est MENSUEL, et c'est juste pour ce qu'il
 * sert d'abord : « qu'est-ce qui bloque le mois qu'on devrait avoir facturé ».
 * L'encaissement, lui, ne tient pas dans un mois — une facture émise pour juin
 * part le 5 juillet, échoit fin août et se relance en septembre. Un écran de
 * trésorerie limité au mois précédent ne montrerait QUE des factures qui
 * viennent de partir : jamais un retard, jamais un encaissement.
 *
 * L'écran compose donc la route existante sur sa fenêtre. Chaque mois garde SA
 * clé de cache — la même que celle de l'écran de facturation, donc partagée —
 * et toute mutation qui invalide `['missions']` les rafraîchit tous.
 *
 * ⚠️ `isLoading` est vrai tant qu'UN mois n'a pas répondu : des totaux
 * partiels affichés comme définitifs seraient faux, et « 0 € encaissé »
 * pendant le chargement est exactement le zéro qui ment.
 *
 * ⚠️ `failedMonths` n'est pas décoratif : si trois mois sur douze échouent, les
 * quatre compteurs sont PARTIELS. L'écran doit le dire — un total dont on
 * ignore l'assiette est un total faux.
 *
 * ⚠️ `canReadFinance` est en défaut FERMÉ, comme sur la liste : une réponse
 * d'API plus ancienne que ce code ne porte pas le champ, et un défaut ouvert
 * afficherait les montants à tout le monde pendant la fenêtre de déploiement.
 */
export function useCollectionsWindow(months: readonly string[]): {
  items: InvoiceReadiness[]
  canReadFinance: boolean
  isLoading: boolean
  failedMonths: number
} {
  // UN appel pour toute la fenêtre (douze `GET` par mois en rafale auparavant). La clé reste sous
  // `['missions', 'readiness']` : les gestes qui invalident ce préfixe rafraîchissent la fenêtre.
  const { data, isPending, isError } = useQuery({
    queryKey: [...missionKeys.readiness('window'), months.join(',')],
    queryFn: () => invoiceReadinessApi.collections(months),
    enabled: months.length > 0,
    staleTime: 0,
    refetchOnMount: 'always',
  })
  return {
    items: data?.items ?? [],
    canReadFinance: data?.canReadFinance === true,
    isLoading: months.length > 0 && isPending,
    // Lecture groupée : elle réussit ou échoue d'un bloc — tous les mois sont alors à dire manquants.
    failedMonths: isError ? months.length : 0,
  }
}

export function useMarkInvoiced() {
  const qc = useQueryClient()
  return useMutation<
    InvoiceReadiness,
    Error,
    { missionId: string; month: string; reference?: string; amountCents?: number; dueOn?: string; invoicedAt?: string }
  >({
    mutationFn: ({ missionId, month, ...input }) => invoiceReadinessApi.markInvoiced(missionId, month, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      toast.success(i18n.t('missions:toast.invoicedMarked'))
    },
    onError: () => toast.error(i18n.t('missions:toast.invoicedError')),
  })
}

/**
 * #2195.8 — L'ÉCHELLE DE FENÊTRES DE L'ESPACE, lue à un seul endroit.
 *
 * Elle sert à ÉCRIRE les libellés (« Sous 20 jours »), pas à classer les
 * missions : le classement, lui, est fait par le serveur, qui lit la même
 * échelle. Deux calculs de fenêtre — un serveur, un navigateur — divergeraient
 * au premier changement de réglage.
 *
 * `staleTime` long : un réglage d'espace change quelques fois par an, et le
 * relire à chaque montage d'écran ferait une requête pour rien.
 */
export const renewalWindowKeys = { all: ['delivery', 'renewal-windows'] as const }

export function useRenewalWindows() {
  return useQuery<{ days: number[]; isWorkspaceSetting: boolean }>({
    queryKey: renewalWindowKeys.all,
    queryFn: () => apiFetch<{ days: number[]; isWorkspaceSetting: boolean }>({ path: '/delivery/renewal-windows' }),
    staleTime: 5 * 60_000,
  })
}

export function useMissions(filters: MissionListFilters = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: missionKeys.list(filters),
    queryFn: () => missionsApi.list(filters),
    // #2319.33 — le brief ne lit les missions d'un compte qu'une fois le compte
    // RATTACHÉ : sans `accountId`, la même requête rendrait celles de l'espace.
    enabled: options.enabled ?? true,
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

/**
 * UNE mission, par son identité — ce que lit son DOSSIER (D200, 30/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELLE LIT LA MÊME LIGNE QUE LA LISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /delivery/missions?id=…`, c'est-à-dire le même `SELECT`, la même
 * décoration : la fenêtre de renouvellement, la marge RÉDIGÉE selon le droit du
 * lecteur, les risques calculés, le nom du compte. Une seconde route serveur
 * aurait fabriqué la seconde vérité — deux écrans qui ne disent pas la même
 * chose de la même mission, et personne pour trancher lequel a raison. C'est le
 * précédent de `useOpenNeed`, mot pour mot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ ELLE RETROUVE SA MISSION, ELLE NE PREND PAS LA PREMIÈRE LIGNE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le serveur IGNORE un `?id=` illisible et rend alors la liste entière — c'est
 * son arbitrage, et il est bon : un lien collé de travers doit montrer quelque
 * chose. Mais lire `missions[0]` ici afficherait la mission d'un AUTRE sous le
 * titre de celle qu'on croyait ouvrir. Le `find` est donc la moitié qui rend
 * l'arbitrage du serveur tenable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ TROIS ÉTATS, PAS DEUX
 * ─────────────────────────────────────────────────────────────────────────────
 * `isPending` — on ne sait pas encore. `notFound` — la lecture a ABOUTI et
 * cette mission n'est pas dans cet espace : c'est une vraie réponse, et elle
 * envoie chercher ailleurs. `isError` — la lecture a échoué, et celle-là envoie
 * réessayer. « Cassé » et « introuvable » se ressemblent trop pour partager une
 * phrase.
 */
export function useMission(id: string) {
  const filters: MissionListFilters = { id }
  const result = useQuery({
    queryKey: missionKeys.list(filters),
    queryFn: () => missionsApi.list(filters),
    enabled: id.length > 0,
    // Même raison que la liste : une condition enregistrée à l'instant doit se
    // relire à l'instant, pas dans cinq minutes.
    staleTime: 0,
    refetchOnMount: 'always',
  })
  const mission = result.data?.missions.find(row => row.id === id)
  return {
    mission,
    /** Le DROIT financier du lecteur, rendu à côté de la ligne — sans lui, un
     *  `marginPercent: null` ne se distingue plus d'un coût non saisi. */
    canReadFinance: result.data?.canReadFinance ?? false,
    isPending: result.isPending,
    isError: result.isError,
    refetch: result.refetch,
    notFound: result.isSuccess && mission === undefined,
  }
}

export function useMissionAssignments(id: string | undefined) {
  return useQuery({
    queryKey: missionKeys.assignments(id ?? 'none'),
    queryFn: () => missionsApi.assignments(id as string),
    enabled: Boolean(id),
    select: response => response.items,
    staleTime: 0,
  })
}

/**
 * #2193.51 (épopée #2953) — Section « Documents » du dossier mission —
 * LECTURE. Même patron que `useProjectDocuments` (#2171.24) : suivi au
 * niveau de la MISSION, aucun fichier joint dans cette tranche.
 */
export function useMissionDocuments(missionId: string) {
  const query = useQuery({
    queryKey: missionKeys.documents(missionId),
    queryFn: () => missionsApi.listDocuments(missionId),
    enabled: missionId.length > 0,
  })
  return {
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

/** Suit un document neuf, en brouillon. */
export function useCreateMissionDocument(missionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateMissionDocumentInput) => missionsApi.createDocument(missionId, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: missionKeys.documents(missionId) }),
    onError: (error: Error) => toast.error(error.message || i18n.t('missions:documents.createError')),
  })
}

/** Fait avancer un document : envoyé, en attente, signé, refusé. */
export function useUpdateMissionDocumentStatus(missionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ documentId, status }: { documentId: string; status: MissionDocumentStatus }) =>
      missionsApi.updateDocumentStatus(missionId, documentId, status),
    onSuccess: () => void qc.invalidateQueries({ queryKey: missionKeys.documents(missionId) }),
    onError: (error: Error) => toast.error(error.message || i18n.t('missions:documents.updateError')),
  })
}

export function useAssign(id: string) {
  const qc = useQueryClient()
  return useMutation<MissionAssignment, Error, AssignmentInput>({
    mutationFn: input => missionsApi.assign(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: missionKeys.assignments(id) })
      // La disponibilité du vivier se DÉDUIT des affectations : ne pas
      // rafraîchir laisserait un consultant « disponible » alors qu'il vient
      // d'être staffé.
      qc.invalidateQueries({ queryKey: ['consultants'] })
      qc.invalidateQueries({ queryKey: ['talents'] })
      toast.success(i18n.t('missions:toast.assigned'))
    },
    onError: error => toast.error(error.message || i18n.t('missions:toast.assignError')),
  })
}

/**
 * #2194.36 — le retrait, SEUL utile pour composer « modifier une affectation »
 * (retirer, puis `useAssign` recrée avec les valeurs éditées : il n'existe
 * aucune route de MISE À JOUR d'une affectation, `PUT assignments` insère
 * toujours une ligne). Silencieux : ce n'est jamais le geste final que
 * l'utilisateur voit — c'est `useAssign`, à la fin de la composition, qui
 * porte le toast (même précédent que `useSetRenewalStatus`).
 */
export function useUnassign(id: string) {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: assignmentId => missionsApi.unassign(id, assignmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: missionKeys.assignments(id) })
      qc.invalidateQueries({ queryKey: ['consultants'] })
      qc.invalidateQueries({ queryKey: ['talents'] })
    },
  })
}

export function useMissionTerms(id: string | undefined) {
  return useQuery({
    queryKey: missionKeys.terms(id ?? 'none'),
    queryFn: () => missionsApi.terms(id as string),
    enabled: Boolean(id),
    staleTime: 0,
  })
}

/** #2407.3 — la provenance des champs principaux de la fiche mission. */
export function useMissionFieldSources(id: string | undefined) {
  return useQuery({
    queryKey: missionKeys.fieldSources(id ?? 'none'),
    queryFn: () => missionsApi.fieldSources(id as string),
    enabled: Boolean(id),
  })
}

/** #2338 / #2409 — l'état de démarrage d'une mission (fiche mission). */
export function useMissionStartReadiness(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: missionKeys.startReadiness(id ?? 'none'),
    queryFn: () => missionsApi.startReadiness(id as string),
    enabled: Boolean(id) && enabled,
  })
}

/** #2338 / #2409 — confirmer ou retirer un prérequis ; le serveur rend le nouvel état. */
export function useMissionStartCheck(id: string) {
  const qc = useQueryClient()
  return useMutation<
    MissionStartReadiness,
    Error,
    { action: 'confirm'; input: MissionStartCheckInput } | { action: 'withdraw'; item: MissionStartDeclaredKey }
  >({
    mutationFn: vars =>
      vars.action === 'confirm'
        ? missionsApi.confirmStartCheck(id, vars.input)
        : missionsApi.withdrawStartCheck(id, vars.item),
    onSuccess: data => {
      qc.setQueryData(missionKeys.startReadiness(id), data)
      toast.success(i18n.t('missions:startReadiness.saved'))
    },
    onError: () => toast.error(i18n.t('missions:startReadiness.saveError')),
  })
}

/** #2414.11-33 — la checklist de sortie d'une mission (fiche mission). */
export function useMissionEndChecklist(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: missionKeys.endChecklist(id ?? 'none'),
    queryFn: () => missionsApi.endChecklist(id as string),
    enabled: Boolean(id) && enabled,
  })
}

/** Cocher ou retirer un item de la checklist de sortie ; le serveur rend le nouvel état. */
export function useMissionEndCheck(id: string) {
  const qc = useQueryClient()
  return useMutation<
    MissionEndChecklist,
    Error,
    { action: 'confirm'; input: MissionEndCheckInput } | { action: 'withdraw'; item: MissionEndCheckKey }
  >({
    mutationFn: vars =>
      vars.action === 'confirm'
        ? missionsApi.confirmEndCheck(id, vars.input)
        : missionsApi.withdrawEndCheck(id, vars.item),
    onSuccess: data => {
      qc.setQueryData(missionKeys.endChecklist(id), data)
      toast.success(i18n.t('missions:endChecklist.saved'))
    },
    onError: () => toast.error(i18n.t('missions:endChecklist.saveError')),
  })
}

/** #3269 (BEL-SC-240) / #3291 — les dix-sept jalons de delivery (fiche mission). */
export function useMissionDeliveryMilestones(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: missionKeys.deliveryMilestones(id ?? 'none'),
    queryFn: () => missionsApi.deliveryMilestones(id as string),
    enabled: Boolean(id) && enabled,
  })
}

/** Déclarer l'un des six jalons humains ; le serveur rend les dix-sept statuts. */
export function useDeclareMissionDeliveryMilestone(id: string) {
  const qc = useQueryClient()
  return useMutation<MissionDeliveryMilestoneStatus[], Error, DeclareMissionDeliveryMilestoneInput>({
    mutationFn: input => missionsApi.declareDeliveryMilestone(id, input),
    onSuccess: data => {
      qc.setQueryData(missionKeys.deliveryMilestones(id), data)
      toast.success(i18n.t('missions:deliveryMilestones.saved'))
    },
    onError: () => toast.error(i18n.t('missions:deliveryMilestones.saveError')),
  })
}

/** #2414.1-8 — poser le motif de fin, typé. */
export function useSetMissionEndReason(id: string) {
  const qc = useQueryClient()
  return useMutation<void, Error, MissionEndReasonInput>({
    mutationFn: input => missionsApi.setEndReason(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: missionKeys.list({ id }) })
      toast.success(i18n.t('missions:endReason.saved'))
    },
    onError: () => toast.error(i18n.t('missions:endReason.saveError')),
  })
}

/** #2414.54-59 — l'interruption déclarée pour cette mission, ou `null`. */
export function useMissionInterruption(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: missionKeys.interruption(id ?? 'none'),
    queryFn: () => missionsApi.interruption(id as string),
    enabled: Boolean(id) && enabled,
  })
}

/** #2414.54-59 — déclarer une interruption, ou revalider la disponibilité (NO-GO, deux gestes distincts). */
export function useMissionInterruptionAction(id: string) {
  const qc = useQueryClient()
  return useMutation<
    void,
    Error,
    { action: 'declare'; input: MissionInterruptionInput } | { action: 'confirm_availability' }
  >({
    mutationFn: vars =>
      vars.action === 'declare' ? missionsApi.declareInterruption(id, vars.input) : missionsApi.confirmAvailability(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: missionKeys.endChecklist(id) })
      qc.invalidateQueries({ queryKey: missionKeys.interruption(id) })
      qc.invalidateQueries({ queryKey: missionKeys.list({ id }) })
      toast.success(i18n.t('missions:interruption.saved'))
    },
    onError: () => toast.error(i18n.t('missions:interruption.saveError')),
  })
}

export function useSetMissionTerms(id: string) {
  const qc = useQueryClient()
  return useMutation<MissionCommercialTerms, Error, UpsertCommercialTermsInput>({
    mutationFn: input => missionsApi.setTerms(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: missionKeys.terms(id) })
      toast.success(i18n.t('missions:toast.termsSaved'))
    },
    onError: () => toast.error(i18n.t('missions:toast.termsError')),
  })
}

/**
 * #2420.14 — simuler un scénario de marge. Une MUTATION parce que le calcul
 * part d'une saisie ; il n'invalide rien, puisqu'il n'écrit rien.
 */
export function useMissionMarginScenario(id: string) {
  return useMutation<MissionMarginScenarioResult, Error, MissionMarginScenario>({
    mutationFn: input => missionsApi.marginScenario(id, input),
  })
}

/** Les lignes de frais d'une mission (30/08/2026). */
export function useMissionExpenses(id: string | undefined) {
  return useQuery({
    queryKey: missionKeys.expenses(id ?? 'none'),
    queryFn: () => missionsApi.expenses(id as string),
    enabled: Boolean(id),
    select: response => response.items,
    staleTime: 0,
  })
}

/**
 * Ajoute une ligne. Invalide aussi `terms` : c'est là que vit
 * `expensesTotalCents` et `marginWithExpenses`, calculés sur les MÊMES lignes
 * — les laisser périmées afficherait une marge nette qui ne compte pas la
 * ligne qu'on vient d'ajouter.
 */
/**
 * #2560 — crée la mission depuis les champs revus par l'utilisateur. Invalide
 * la liste ET l'onglet Missions du compte : c'est de là qu'on arrive
 * (`TabMissions.tsx`, `accountId` du contexte). Pour le geste depuis la
 * reprise CRM, hors contexte de compte, voir `useCreateMissionFromCrmReprisal`
 * (#2562).
 */
export function useCreateMission(accountId: string) {
  const qc = useQueryClient()
  const prepAction = useMeetingPrepAction()
  return useMutation<MissionView, Error, CreateMissionRequest>({
    mutationFn: input => missionsApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.accounts.missions(accountId) })
      // #4196 — « Nouvelle mission » : la liste « En cours » doit la montrer sans rechargement.
      qc.invalidateQueries({ queryKey: ['missions'] })
      // #4424.6 — la création PROPOSE « Préparer le RDV » ; rien ne part seul.
      toast.success(i18n.t('missions:toast.missionCreated'), { action: prepAction(accountId) })
    },
    onError: () => toast.error(i18n.t('missions:toast.missionCreateError')),
  })
}

/**
 * #4196 — « Terminer » et « Prolonger » changent la mission ET la fiche du
 * consultant (disponibilité) : on invalide les deux familles, sinon le vivier
 * continue d'afficher « en mission » une fois la mission finie.
 */
function invalidateAfterLifecycle(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['missions'] })
  void qc.invalidateQueries({ queryKey: ['consultants'] })
  void qc.invalidateQueries({ queryKey: ['talents'] })
}

export function useEndMission(id: string) {
  const qc = useQueryClient()
  return useMutation<MissionLifecycleResult, Error, EndMissionInput>({
    mutationFn: input => missionsApi.end(id, input),
    onSuccess: () => {
      invalidateAfterLifecycle(qc)
      toast.success(i18n.t('missions:lifecycle.ended'))
    },
    onError: (error: Error) => toast.error(error.message || i18n.t('missions:lifecycle.error')),
  })
}

export function useExtendMission(id: string) {
  const qc = useQueryClient()
  return useMutation<MissionLifecycleResult, Error, ExtendMissionInput>({
    mutationFn: input => missionsApi.extend(id, input),
    onSuccess: () => {
      invalidateAfterLifecycle(qc)
      toast.success(i18n.t('missions:lifecycle.extended'))
    },
    onError: (error: Error) => toast.error(error.message || i18n.t('missions:lifecycle.error')),
  })
}

export function useCreateMissionExpense(id: string) {
  const qc = useQueryClient()
  return useMutation<MissionExpense, Error, CreateMissionExpenseInput>({
    mutationFn: input => missionsApi.createExpense(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: missionKeys.expenses(id) })
      qc.invalidateQueries({ queryKey: missionKeys.terms(id) })
      toast.success(i18n.t('missions:toast.expenseSaved'))
    },
    onError: () => toast.error(i18n.t('missions:toast.expenseError')),
  })
}

export function useUpdateMissionExpense(id: string) {
  const qc = useQueryClient()
  return useMutation<MissionExpense, Error, { expenseId: string; input: UpdateMissionExpenseInput }>({
    mutationFn: ({ expenseId, input }) => missionsApi.updateExpense(id, expenseId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: missionKeys.expenses(id) })
      qc.invalidateQueries({ queryKey: missionKeys.terms(id) })
      toast.success(i18n.t('missions:toast.expenseSaved'))
    },
    onError: () => toast.error(i18n.t('missions:toast.expenseError')),
  })
}

/** #2412 — les deux rails de satisfaction d'une mission. */
export function useMissionFeedback(id: string | undefined) {
  return useQuery({
    queryKey: missionKeys.feedback(id ?? 'none'),
    queryFn: () => missionsApi.feedback(id as string),
    enabled: Boolean(id),
  })
}

export function useSubmitMissionFeedback(id: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, CreateMissionFeedbackRequest>({
    mutationFn: input => missionsApi.submitFeedback(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: missionKeys.feedback(id) })
      toast.success(i18n.t('missions:toast.feedbackSaved'))
    },
    onError: () => toast.error(i18n.t('missions:toast.feedbackError')),
  })
}

/** Les factures fournisseur d'une mission (30/08/2026). */
export function useSupplierInvoices(id: string | undefined) {
  return useQuery({
    queryKey: missionKeys.supplierInvoices(id ?? 'none'),
    queryFn: () => missionsApi.supplierInvoices(id as string),
    enabled: Boolean(id),
    select: response => response.items,
    staleTime: 0,
  })
}

/** Invalide aussi `terms` : c'est là que vit `supplierInvoicesTotalCents`,
 *  calculé sur les MÊMES factures. */
export function useCreateSupplierInvoice(id: string) {
  const qc = useQueryClient()
  return useMutation<SupplierInvoice, Error, CreateSupplierInvoiceInput>({
    mutationFn: input => missionsApi.createSupplierInvoice(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: missionKeys.supplierInvoices(id) })
      qc.invalidateQueries({ queryKey: missionKeys.terms(id) })
      toast.success(i18n.t('missions:toast.supplierInvoiceSaved'))
    },
    onError: () => toast.error(i18n.t('missions:toast.supplierInvoiceError')),
  })
}

export function useUpdateSupplierInvoice(id: string) {
  const qc = useQueryClient()
  return useMutation<SupplierInvoice, Error, { invoiceId: string; input: UpdateSupplierInvoiceInput }>({
    mutationFn: ({ invoiceId, input }) => missionsApi.updateSupplierInvoice(id, invoiceId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: missionKeys.supplierInvoices(id) })
      qc.invalidateQueries({ queryKey: missionKeys.terms(id) })
      toast.success(i18n.t('missions:toast.supplierInvoiceSaved'))
    },
    onError: () => toast.error(i18n.t('missions:toast.supplierInvoiceError')),
  })
}

export function useSetSupplierInvoiceStatus(id: string) {
  const qc = useQueryClient()
  return useMutation<SupplierInvoice, Error, { invoiceId: string; status: SetSupplierInvoiceStatusInput['status'] }>({
    mutationFn: ({ invoiceId, status }) => missionsApi.setSupplierInvoiceStatus(id, invoiceId, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: missionKeys.supplierInvoices(id) })
      qc.invalidateQueries({ queryKey: missionKeys.terms(id) })
      toast.success(i18n.t('missions:toast.supplierInvoiceStatusSaved'))
    },
    onError: () => toast.error(i18n.t('missions:toast.supplierInvoiceError')),
  })
}

/**
 * Les deux scores d'une mission — risque ET opportunité.
 *
 * ⚠️ `financeApi.scores` était déclaré ici et n'avait AUCUN appelant : la route
 * `/delivery/finance/missions/:id/scores` servait, le service calculait, et
 * rien ne l'affichait. C'est le motif habituel du dépôt — du code juste que
 * personne n'appelle — et c'est la fiche de mission qui le branche.
 *
 * Deux scores et jamais un seul : « risque élevé, opportunité élevée » est une
 * mission à travailler d'urgence, « risque élevé, opportunité faible » une
 * mission à laisser partir. Un chiffre unique dirait la même chose des deux.
 *
 * `retry: false` : sans `finance:read` le serveur répond 403, et le rejouer
 * trois fois ne fait que retarder le message.
 */
export function useMissionScores(id: string | undefined) {
  return useQuery({
    queryKey: missionKeys.scores(id ?? 'none'),
    queryFn: () => financeApi.scores(id as string),
    enabled: Boolean(id),
    retry: false,
  })
}

export function useMissionBoard(filters: Record<string, string | boolean | undefined> = {}) {
  const key = JSON.stringify(filters)
  return useQuery({
    queryKey: missionKeys.board(key),
    queryFn: () => missionBoardApi.board(filters),
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

/**
 * Ce qu'on dit après un déplacement.
 *
 * `undefined` quand rien n'a été coché : ajouter « 0 action » à un toast serait
 * du bruit. Un échec est TOUJOURS nommé, même à côté d'une réussite — c'est le
 * seul moment où l'utilisateur peut le rattraper.
 */
function moveDescription(performed: number, pending: number, failed: number): string | undefined {
  const parts: string[] = []
  if (performed > 0) parts.push(i18n.t('missions:toast.movePerformed', { count: performed }))
  if (pending > 0) parts.push(i18n.t('missions:toast.movePending', { count: pending }))
  if (failed > 0) parts.push(i18n.t('missions:toast.moveFailed', { count: failed }))
  return parts.length > 0 ? parts.join(' · ') : undefined
}

export function useMoveBoardCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      missionId,
      ...body
    }: {
      missionId: string
      to: string
      reason?: string
      acceptedActions: string[]
    }) => missionBoardApi.move(missionId, body),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      // Le board projette AUSSI les projets : ne pas les rafraîchir laisserait
      // deux écrans qui racontent deux états du même objet.
      qc.invalidateQueries({ queryKey: ['projects'] })
      // Le message DIT ce qui a été fait et ce qui reste. « Carte déplacée »
      // tout court était exact et incomplet : l'utilisateur venait de cocher
      // des cases, et rien ne lui disait ce qu'elles avaient produit.
      const { performed, pending, failed } = result.actions
      toast.success(i18n.t('missions:toast.moved'), {
        description: moveDescription(performed.length, pending.length, failed.length),
      })
    },
    onError: (error: Error) => toast.error(error.message || i18n.t('missions:toast.moveError')),
  })
}

export function useTimesheetMonth(month?: string, blockingOnly = false) {
  return useQuery({
    queryKey: [...missionKeys.timesheets(month), blockingOnly],
    queryFn: () => timesheetsApi.month(month, blockingOnly),
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

/**
 * Le dossier d'un relevé — chargé SEULEMENT quand le tiroir s'ouvre.
 *
 * `enabled` sur la présence de la cible : sans lui, chaque ligne de la liste
 * déclencherait une lecture croisée que personne ne regarde.
 */
export function useTimesheetReview(target: { missionId: string; month: string; consultantId: string | null } | null) {
  return useQuery({
    queryKey: [
      'missions',
      'timesheet-review',
      target?.missionId ?? 'none',
      target?.month ?? 'none',
      target?.consultantId ?? 'none',
    ],
    queryFn: () => timesheetsApi.review(target!.missionId, target!.month, target!.consultantId),
    enabled: target !== null,
    // Les contrôles se REFONT à chaque ouverture : un doublon apparu depuis le
    // dernier rendu doit se voir, sinon le tiroir affiche une garantie périmée.
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

export function useExplainGap() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, explanation }: { id: string; explanation: string }) => timesheetsApi.explainGap(id, explanation),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      toast.success(i18n.t('missions:toast.gapExplained'))
    },
    onError: (error: Error) => toast.error(error.message || i18n.t('missions:toast.gapError')),
  })
}

export function useRejectTimesheet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      reason,
      contestedDays,
      correctionDeadline,
    }: {
      id: string
      reason: string
      contestedDays: number
      correctionDeadline: string
    }) => timesheetsApi.reject(id, { reason, contestedDays, correctionDeadline }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      toast.success(i18n.t('missions:toast.timesheetRejected'))
    },
    onError: (error: Error) => toast.error(error.message || i18n.t('missions:toast.timesheetRejectError')),
  })
}

/** #2196.31 — marquer un mois « non applicable ». */
export function useMarkTimesheetNotApplicable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: MarkTimesheetNotApplicableInput) => timesheetsApi.markNotApplicable(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      toast.success(i18n.t('missions:toast.timesheetNotApplicable'))
    },
    onError: (error: Error) => toast.error(error.message || i18n.t('missions:toast.timesheetNotApplicableError')),
  })
}

/** #2196.31 — annuler l'exception : la déduction du contrat reprend. */
export function useRevokeTimesheetNotApplicable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (exceptionId: string) => timesheetsApi.revokeNotApplicable(exceptionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      toast.success(i18n.t('missions:toast.timesheetNotApplicableRevoked'))
    },
    onError: (error: Error) => toast.error(error.message || i18n.t('missions:toast.timesheetNotApplicableRevokeError')),
  })
}

export function useValidateByClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => timesheetsApi.validateByClient(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      toast.success(i18n.t('missions:toast.clientValidated'))
    },
    onError: (error: Error) => toast.error(error.message || i18n.t('missions:toast.clientValidationError')),
  })
}

/** #2415.6 — geste SÉPARÉ de `useValidateByClient` : la revue interne. */
export function useReviewInternally() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => timesheetsApi.reviewInternally(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      toast.success(i18n.t('missions:toast.internalReviewed'))
    },
    onError: (error: Error) => toast.error(error.message || i18n.t('missions:toast.internalReviewError')),
  })
}

export function useOpenTimesheets() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (month: string) => timesheetsApi.open(month),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      toast.success(i18n.t('missions:toast.timesheetsOpened', { count: result.created }))
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

/** #2196.30 — voir `timesheetsApi.reminders`. */
export function useDueTimesheetReminders(month?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['missions', 'timesheet-reminders', month ?? 'current'],
    queryFn: () => timesheetsApi.reminders(month),
    staleTime: 0,
    enabled: options?.enabled ?? true,
  })
}

/** #2972 — voir `timesheetsApi.escalations`. */
export function useDueTimesheetEscalations(month?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['missions', 'timesheet-escalations', month ?? 'current'],
    queryFn: () => timesheetsApi.escalations(month),
    staleTime: 0,
    enabled: options?.enabled ?? true,
  })
}

/** Enregistre qu'une relance de RELEVÉ est PARTIE — le produit PRÉPARE, il
 *  n'envoie jamais : le clic est celui d'un humain qui vient d'envoyer,
 *  ailleurs, et vient consigner le geste. */
export function useRecordTimesheetReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => timesheetsApi.recordReminder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      toast.success(i18n.t('missions:toast.timesheetReminderRecorded'))
    },
    onError: (error: Error) => toast.error(error.message || i18n.t('missions:toast.timesheetReminderError')),
  })
}

/**
 * Les renouvellements à traiter.
 *
 * `missionsApi.renewals()` existait depuis des mois et n'avait AUCUN appelant :
 * la route servait, et rien ne l'affichait.
 */
/**
 * LES MISSIONS QUI DÉRAPENT (PDF 5 §7.2).
 *
 * À ne pas confondre avec `useRenewals` juste en dessous : celui-là regarde la
 * FIN de la mission, celui-ci sa DÉGRADATION. Une mission qui se creuse depuis
 * mars est toujours « active » et n'apparaît dans aucune alerte existante.
 */
export function useMissionDrift() {
  return useQuery({
    queryKey: missionKeys.drift(),
    queryFn: missionsApi.drift,
    retry: false,
  })
}

/**
 * #2562 — y a-t-il une reprise à PROPOSER ? Lue par l'état vide de
 * « Missions › En cours » (`MissionsEmptyState`) : `available` ne vaut
 * jamais `true` sur un espace qui a déjà des missions, donc le geste normal
 * de liste ne la déclenche pas inutilement — `enabled` la réserve à l'écran
 * qui a une raison de la poser.
 */
export function useCrmReprisalCandidates(enabled: boolean) {
  return useQuery({
    queryKey: missionKeys.crmReprisalCandidates(),
    queryFn: missionsApi.crmReprisalCandidates,
    enabled,
    retry: false,
  })
}

/**
 * Le geste ORDINAIRE de création de mission depuis la reprise CRM — le clic
 * EST la décision (aucune approbation à attendre, comme
 * `exportContact`/`createTask` côté CRM). #2562 s'en sert pour la reprise,
 * `crmDealId` en plus : rien de spécifique n'est inventé pour ce cas, c'est
 * la MÊME écriture que `useCreateMission` (#2560) — nommée distinctement
 * parce que son invalidation est globale (`['missions']`), pas scopée à un
 * compte.
 */
export function useCreateMissionFromCrmReprisal() {
  const qc = useQueryClient()
  return useMutation<MissionView, Error, CreateMissionRequest>({
    mutationFn: missionsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] })
    },
    onError: (error: Error) => toast.error(error.message || i18n.t('missions:crmReprisal.createError')),
  })
}

/**
 * LES RENOUVELLEMENTS, ET LE DROIT FINANCIER DE CELUI QUI LES LIT (#1365).
 *
 * ⚠️ Le `select` ne réduit plus la réponse aux seules missions : la lentille
 * rend désormais le même tableau que « En cours », colonne « Marge » comprise,
 * et cette colonne a besoin de savoir si un `marginPercent: null` veut dire
 * « pas ton périmètre » ou « coût chargé non saisi » (D45). Jeter le drapeau
 * ici forcerait l'écran à conclure l'un des deux d'un silence.
 */
export function useRenewals() {
  return useQuery({
    queryKey: missionKeys.renewals(),
    queryFn: missionsApi.renewals,
    staleTime: 0,
  })
}

export function useRevenue(rawMonth?: string, scope?: FinanceScopeRequest) {
  // perf P6 — même famille que `useAggregateMargin` : « sans mois » et « mois
  // précédent » partagent une clé, donc un seul appel.
  const month = rawMonth ?? serverDefaultMonth()
  return useQuery({
    queryKey: missionKeys.revenue(month, scope),
    queryFn: () => financeApi.revenue(month, scope),
    staleTime: 0,
  })
}

/**
 * Les cinq lectures financières, tentées pour TOUT LE MONDE.
 *
 * Sans `finance:read` le serveur répond 403, et le panneau dit « pas ton
 * périmètre » — même parti pris que l'historique des taux d'un consultant.
 * Cacher le bloc côté navigateur ferait croire que ces chiffres n'existent pas ;
 * afficher une liste vide se lirait « il n'y a rien ».
 *
 * `retry: false` : un 403 n'est pas un incident réseau, le rejouer trois fois
 * ne fait que retarder l'affichage du message.
 */
export function useCapacity(rawMonth?: string) {
  const month = rawMonth ?? serverDefaultCapacityMonth()
  return useQuery({
    queryKey: missionKeys.capacity(month),
    queryFn: () => financeApi.capacity(month),
    retry: false,
  })
}

export function useAggregateMargin(rawMonth?: string, scope?: FinanceScopeRequest) {
  // perf P6 — même mois nommé que la fenêtre de tendance (`useMarginTrend`) :
  // une seule requête pour le mois précédent, voir `serverDefaultMonth`.
  const month = rawMonth ?? serverDefaultMonth()
  return useQuery({
    queryKey: missionKeys.margin(month, scope),
    queryFn: () => financeApi.margin(month, scope),
    retry: false,
  })
}

export function useMarginByChannel(rawMonth?: string) {
  const month = rawMonth ?? serverDefaultMonth()
  return useQuery({
    queryKey: missionKeys.marginChannels(month),
    queryFn: () => financeApi.marginByChannel(month),
    retry: false,
  })
}

export function useDso() {
  return useQuery({ queryKey: missionKeys.dso(), queryFn: financeApi.dso, retry: false })
}

export function useForecast(scope?: FinanceScopeRequest) {
  return useQuery({
    queryKey: missionKeys.forecast(scope),
    queryFn: () => financeApi.forecast(scope),
    staleTime: 0,
  })
}

/**
 * Les trois gestes d'encaissement (I-77).
 *
 * Ils invalident la MÊME clé que la liste : un paiement enregistré doit faire
 * disparaître la ligne de la file des impayés dans la seconde, sinon
 * l'utilisateur le refait.
 */
export function useRecordPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      missionId,
      month,
      ...input
    }: {
      missionId: string
      month: string
      paidAt?: string
      amountCents?: number
    }) => invoiceReadinessApi.recordPayment(missionId, month, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      toast.success(i18n.t('missions:readiness.paymentRecorded'))
    },
    onError: (error: Error) => toast.error(error.message || i18n.t('missions:readiness.paymentFailed')),
  })
}

export function useCancelInvoiced() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ missionId, month, reason }: { missionId: string; month: string; reason: string }) =>
      invoiceReadinessApi.cancelInvoiced(missionId, month, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      toast.success(i18n.t('missions:readiness.invoiceCancelled'))
    },
    onError: (error: Error) => toast.error(error.message || i18n.t('missions:readiness.cancelFailed')),
  })
}

/**
 * Les deux gestes de LITIGE (BEL-MIS-011).
 *
 * Ils invalident la même clé que la liste : déclarer un litige doit faire
 * apparaître le badge tout de suite, sinon on le déclare deux fois.
 */
export function useOpenDispute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ missionId, month, reason }: { missionId: string; month: string; reason: string }) =>
      invoiceReadinessApi.openDispute(missionId, month, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      toast.success(i18n.t('missions:readiness.disputeOpened'))
    },
    onError: (error: Error) => toast.error(error.message || i18n.t('missions:readiness.disputeFailed')),
  })
}

export function useResolveDispute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ missionId, month }: { missionId: string; month: string }) =>
      invoiceReadinessApi.resolveDispute(missionId, month),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      toast.success(i18n.t('missions:readiness.disputeResolved'))
    },
    onError: (error: Error) => toast.error(error.message || i18n.t('missions:readiness.resolveDisputeFailed')),
  })
}

export function useRecordReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ missionId, month, blockers }: { missionId: string; month: string; blockers?: string[] }) =>
      invoiceReadinessApi.recordReminder(missionId, month, blockers ?? []),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      toast.success(i18n.t('missions:readiness.reminderRecorded'))
    },
    onError: (error: Error) => toast.error(error.message || i18n.t('missions:readiness.reminderFailed')),
  })
}

/**
 * LE GESTE GROUPÉ « Relancer la saisie/validation CRA » — la sélection
 * multiple de `/missions/facturation` (31/08/2026, maquette PDF-22 §6).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PAS `POST /mailbox/batch`
 * ─────────────────────────────────────────────────────────────────────────
 * Un mécanisme d'envoi gouverné existe déjà pour un LOT de courriers
 * (`mailboxApi.sendBatch`, `apps/web/src/features/mailbox/api.ts`). Il a été
 * regardé avant d'écrire ceci, et il ne convient pas ici : cet écran ne
 * PRÉPARE ni n'ENVOIE aucun message — `PaymentReminderDue` le dit déjà en toutes
 * lettres (« rien ne part tout seul, la relance se consigne une fois
 * envoyée ») et aucune capacité de messagerie n'atteint ce module. Le geste
 * qui existe déjà ligne par ligne (`useRecordReminder`) ne fait QUE consigner
 * qu'une relance a eu lieu, ailleurs — ce lot le rend possible en LOT, sur le
 * même verbe, plutôt que d'inventer un second mécanisme d'envoi qui promettrait
 * un message que rien ne prépare.
 *
 * Une seule invalidation et un seul toast RÉSUMÉ, plutôt que N appels à
 * `useRecordReminder` qui empileraient N toasts identiques.
 */
export function useBulkRecordReminder() {
  const qc = useQueryClient()
  return useMutation<
    { done: number; failed: number },
    Error,
    { items: readonly { missionId: string; month: string; blockers: string[] }[] }
  >({
    mutationFn: async ({ items }) => {
      const results = await Promise.allSettled(
        items.map(item => invoiceReadinessApi.recordReminder(item.missionId, item.month, item.blockers)),
      )
      const done = results.filter(result => result.status === 'fulfilled').length
      return { done, failed: results.length - done }
    },
    onSuccess: ({ done, failed }) => {
      qc.invalidateQueries({ queryKey: ['missions'] })
      if (done === 0) {
        toast.error(i18n.t('missions:readiness.reminderFailed'))
      } else if (failed > 0) {
        toast.success(i18n.t('missions:readiness.bulk.remindPartial', { done, skipped: failed }))
      } else {
        toast.success(i18n.t('missions:readiness.bulk.remindConfirm', { count: done }))
      }
    },
    onError: () => toast.error(i18n.t('missions:readiness.reminderFailed')),
  })
}
