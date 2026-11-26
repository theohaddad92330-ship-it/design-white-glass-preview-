import {
  accountDomainsFrom,
  HOMONYM_EXCLUSION_REASON,
  isHomonymEmail,
  selectHomonymsToArchive,
} from './contact-employer'
import { availabilityPatchAfterSearch, mergeSeedAvailability, seedCoordinateAvailability } from './contact-availability'
import {
  contactZoneStatus,
  accountSize,
  sellerFocusFrom,
  sellerFocusTiers,
  withAccountSize,
  zoneSort,
  ZONE_CITY_SELECT_SQL,
  ZONE_DEPARTMENT_SELECT_SQL,
  ZONE_REGION_SQL,
} from './contact-seller-focus'
import type { SellerFocus } from './contact-seller-focus'
import { profileOfferTokens, sellerScoringContextFrom } from './contact-score-seller'
import type {
  AccountContactsPerimeterResponse,
  AnalysisProfileData,
  ContactPerimeter,
  ContactReachability,
  SellerScoringContext,
} from '@bellum/contracts'
import { applyContactPerimeter } from './contact-perimeter'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import {
  type EntityManager,
  type FindOptionsWhere,
  In,
  IsNull,
  Not,
  Repository,
  type SelectQueryBuilder,
  Raw,
  type FindOperator,
} from 'typeorm'
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import type {
  ActionType,
  ConflictedField,
  ContactPreflight,
  ContactPreflightAction,
  FieldSource,
  AnalysisContactMessage,
  AnalysisContactSeed,
  AnalysisEnrichedContact,
  ApolloContactProfile,
  ApolloEnrichmentData,
  PhoneNature,
  PhoneNatureSource,
  BulkImportContact,
  BulkImportContactsResponse,
  ClassifyContactInput,
  ClassifyContactsResponse,
  ContactAccessPath,
  ContactActivity,
  ContactCadence,
  ContactFieldConfidence,
  ContactLifecycleHistory,
  ContactLifecycleState,
  ContactLifecycleTally,
  ContactLifecycleTransition,
  ContactListItem,
  ContactListQuery,
  ContactListResponse,
  ContactChannelTally,
  ContactPreCreationExclusions,
  ContactRecommendedTally,
  EnrichmentCoordinate,
  OfferDomain,
  ContactSendability,
  ContactStats,
  ContactDeliverability,
  ContactFollowUpStats,
  ContactSendChannel,
  CreateContactFromCrmInput,
  CreateContactFromCrmResult,
  MarketLocale,
  CrmConfrontationContact,
  CrmConfrontationResult,
  EnrichContactResponse,
  SearchPeopleByNameResult,
  SprintEvent,
} from '@bellum/contracts'
import {
  contactCoordinates,
  contactStatusSchema,
  effectiveContactSendState,
  applyFieldUpdates,
  contradictsConfirmedFact,
  type FieldContradiction,
  normalizeTag,
  pickRepresentativeTags,
  tagKey,
  computeContactLifecycleState,
  computeContactReachability,
  computeContactScore,
  computeContactScoreBreakdown,
  computeHierarchyLevel,
  findConfrontationPairs,
  hasPermission,
  isPlausiblePhoneNumber,
  MON_CRM_SOURCES,
  isKnownContactSource,
  IMPORT_SOURCE_VALUE,
  MON_CRM_SOURCE_FILTER,
  toE164,
  discoveryTitlesFor,
  type HierarchyLevel,
  settleStalePendingCoordinates,
} from '@bellum/contracts'
import {
  classifyCardFact,
  discoverSignalTypeOfKind,
  creditCostOf,
  enrichmentCooldown,
  foldEnrichmentCoordinateStates,
  newlyFoundCoordinates,
  type ContactEnrichmentTrace,
  type ContactAvailability,
  type EnrichmentCoordinateStates,
  type EnrichmentSourceAttempt,
  missingEnrichmentChannels,
  withoutForbiddenEnrichmentFields,
  type EnrichmentAttemptResult,
} from '@bellum/contracts'
import {
  ANALYSIS_SCOPE_MODE_LABELS,
  pipelineFieldScopeClaim,
  usablePhotoUrl,
  readRecentSignals,
  type ContactRankingResponse,
} from '@bellum/contracts'
import { signalHistoryKey } from '../signal-history/signal-history.projection'
import { employmentLeftFromHistory, employmentLeftOf } from './employment-left'
import { contactPlaceOf, type ContactPlaceView } from './contact-place'
import type { ContactRecommendationAuthorizableReason, ContactRelationBadge } from '@bellum/contracts'
import type { ContactEmailDraftMailbox, MailboxProvider, SaveContactEmailDraft } from '@bellum/contracts'
import type { DormantReactivationScoreInput } from '@bellum/contracts'
import { normalizeScopeLabel, taskStillOpenSql } from '@bellum/contracts'
import {
  DISCOVER_CALL_LIST_SIGNALS_PER_COMPANY,
  type DiscoverCallListRequest,
  type DiscoverCallListResponse,
  type DiscoverCallListSignal,
} from '@bellum/contracts'
import {
  buildCallListContacts,
  CALL_LIST_CONTACT_COLUMNS,
  matchCallListAccounts,
  toCallListSignal,
  type CallListContactSourceRow,
} from './contact-call-list'
import {
  interactionActivityKindsSql,
  type ContactAssociations,
  type ContactCrmExports,
  type RecordContactCrmExport,
} from '@bellum/contracts'
import { loadContactAssociations } from './contact-associations'
import { loadContactCrmExports, recordContactCrmExport } from './contact-crm-exports'
import { loadEngagementDraft, saveEngagementDraft } from './engagement-drafts'
import { MEMORY_POLICY_DEFAULTS, type ContactSolicitation } from '@bellum/contracts'
import type { OutreachSequenceStopEvent } from '@bellum/contracts'
import type { ContactApolloDetails } from '@bellum/contracts'
import type { AnalysisScopeSelection } from '@bellum/contracts'
import type { EngagementDraftChannel, EngagementDraftSnapshot } from '@bellum/contracts'
import { isOutsideGeoPerimeter } from '../analysis/analysis-scope'
import { failure, isFailure, isSuccess, success, type Result } from '@bellum/utils'
import { compileContactPreflight } from '@bellum/contracts'
import { SHARED_BASE_CONTACT_SOURCE, sharedCompanyKey } from '@bellum/contracts'
import { sharedCoordinatesForPerson } from '../shared-base/shared-company-facts-writes'
import { contactCacheTtlSeconds } from './person-contact-cache'
import { contactPreflightFacts } from './contact-preflight'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ContactLifecycleTransitionEntity } from '../../database/entities/contact-lifecycle-transition.entity'
import { ContactMergeEntity } from '../../database/entities/contact-merge.entity'
import { PersonErasureEntity } from '../../database/entities/person-erasure.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import {
  buildContactScoreContext,
  buildContactScoreInput,
  contactSourceTag,
  employerConflict,
  enrichmentPositionTitle,
  sourceTagForRow,
} from '../analysis/contact-score'
import { ProvenanceService } from '../crm-core/provenance.service'
import {
  CONTACT_FIELD_COLUMNS,
  CONTACT_PIPELINE_FIELD_COLUMNS,
  toColumnPatch,
  toFieldView,
} from '../crm-core/record-fields'
import { shouldSuggestReplan } from '../analysis/replan-trigger'
import { PERIMETER_SCOPED_CONTACT_FIELDS } from '../crm-core/record-fields'
import { classifyContacts } from './contact-classifier'
import { crossFieldTokensClause, nameTokensClause } from './contact-name-search'
import { filterEligibleContacts } from './contact-eligibility'
import { CommercialOutcomesService } from '../outcomes/commercial-outcomes.service'
import { rankAccountContacts, type ContactAccessStatus, type ContactRankingParams } from './contact-ranking'
import { duplicateIdsToHideFromPath } from './contact-duplicate-path'
import { ContactDuplicateDecisionsService } from './contact-duplicate-decisions.service'
import { prepareTargetPersonas, type PreparedTargetPersonas } from './target-persona-match'
import { EsnTargetPersonaEntity } from '../../database/entities/esn-target-persona.entity'
import { foldForEmailMatch, foldForNameMatch, MIN_FOLDED_NAME_LENGTH } from './contact-name-match'
import {
  contactIdentityKeys,
  isIdentifiablePerson,
  normalizeFullName,
  pickRicher,
  pickRicherName,
  sortByUsableIdentity,
} from './contact-identity'
import { orgChartSourceLabel, planOrgChartContacts } from './org-chart-contacts'
import { isErasedPerson, personErasureFingerprints } from './person-erasure-fingerprint'
import { isPersonErasureKeyConfigured, PersonErasureKeyUnavailableError } from '../../common/person-erasure-hmac'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { CadenceService } from './cadence.service'
import { DropcontactClient } from './dropcontact.client'
import {
  CascadeLedger,
  NOOP_EMAIL_VERIFIER,
  emailPatternCandidates,
  readCostCeiling,
  servableFreeEmail,
} from './enrichment-cascade'
import { SMTP_MAX_CANDIDATES_PER_CONTACT, sharedEmailVerifier } from './smtp-email-verifier'
import { EnrichmentProviders, type EnrichmentReport } from './enrichment-providers'
import { ContactPhoneRevealService } from './contact-phone-reveal.service'
import { isEnrichmentCountryAllowed, resolveAllowedEnrichmentCountries } from './enrichment-country-gate'
import {
  classifyEnrichmentFailure,
  isApolloDry,
  ENRICHMENT_FAILURE_MESSAGES,
  type EnrichmentFailureReason,
} from './enrichment-failure'
import {
  EMAIL_ATTACHMENTS,
  ENRICHMENT_OUTAGE_ALERT,
  INDIVIDUAL_MAILBOX_SENDER,
  type EmailAttachments,
  type EnrichmentOutageAlert,
  type IndividualMailboxSender,
  type ResolvedEmailAttachment,
} from './module-tokens'
import { classifyTransportFailure } from './send-transport-outcome'
import { CreditsService } from '../credits/credits.service'
import { demoApolloProfile, demoContactRelations, demoLocation } from '../demo/demo-contact-profile'
import {
  demoEnrichment,
  demoEnrichmentCoordinatesAllFound,
  isDemoAmbiguousProviderMatch,
} from '../demo/demo-enrichment'
import { IA_COST_HEADER, IaClient } from '../ia/ia.client'
import { MailerService } from '../mailer/mailer.service'
import { SuppressionService } from '../mailer/suppression.service'
import { signUnsubscribeToken } from '../mailer/unsubscribe-token'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { applyWorkspaceScope, workspaceScopeWhere } from '../workspace/workspace-scoping'
import { contactGestureWhere } from './contact-gesture-scope'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { readContactRelationBadge } from './contact-relation-badge'
import { searchDemoContactsByName } from './person-name-search-demo'
import { ACCOUNT_HYGIENE_PREDICATES, LAST_ANALYZED_SQL } from '../accounts/account-hygiene.sql'
import { ShortTtlCache } from '../../common/short-ttl-cache'
import { ProductAnalyticsService } from '../analytics/product-analytics.service'
import { ProviderCostService } from '../analytics/provider-cost.service'
import { EnrichmentDurationService } from '../analytics/enrichment-duration.service'
import { missingContactDetailsSql, recordedPhoneSql } from './contact-completeness'
import { importedContactSql, monCrmContactSql } from './contact-crm-origin'
import { providerPhoneNature } from './contact-phone-nature'
import { normalizeWhyContact, WHY_CONTACT_SHARED_MIN_OTHERS } from './why-contact-shared'
import { returnedRows } from '../../database/returned-rows'
import { SprintProgressionBus } from '../sprints/sprint-progression.bus'
// #2297.41/.42/.49/.50 — la table de la porte PERSONNE (« cette personne
// a-t-elle demandé qu'on cesse ? »), lue directement plutôt que d'importer le
// SERVICE d'un autre module (GA-07 — ce dernier n'accepte aucun import
// service-à-service de plus qu'aujourd'hui) : même table que
// `ContactStopService.verdict`, ni logique dupliquée ni frontière franchie.
import { ContactStopEntity } from '../../database/entities/contact-stop.entity'
import { ContactIntakeExclusionEntity } from '../../database/entities/contact-intake-exclusion.entity'
import { WorkspaceBrandService } from '../workspace/workspace-brand.service'
import { type BusinessUnitScopeClause, businessUnitScopeClause } from '../accounts/business-unit-scope.clause'
import {
  type ContactDuplicateProposal,
  findSharedEmailGroups,
  proposeContactDuplicates,
  type SharedEmailGroup,
} from './contact-duplicate-proposals'
import { displayedContactEmail, displayedContactName, isNameDerivedFromEmail } from './contact-display-name'
import {
  isPlaceholderEmail,
  placeholderEmailSqlPattern,
  recordedEmailSql,
  refusePlaceholderEmail,
} from './placeholder-email'
import { SOFT_BRAKE_MESSAGE } from '../credits/soft-brake'

/**
 * Expression SQL de l'état du cycle de vie d'un contact, pour l'agrégat des
 * pastilles de `/contacts`.
 *
 * `contacts.lifecycle_state` est la colonne persistée (écrite par
 * `syncContactLifecycle` et à l'insert, backfillée par la migration
 * 1785600000000-ContactLifecycle). Le COALESCE n'est PAS décoratif : une ligne
 * insérée par un chemin qui n'aurait pas posé la colonne resterait NULL et
 * disparaîtrait de tous les buckets — les pastilles ne sommeraient alors plus au
 * total affiché, c'est-à-dire exactement le bug qu'on corrige. Le CASE est le
 * miroir de `computeContactLifecycleState` (@bellum/contracts) et de la clause de
 * backfill de cette migration : les trois doivent rester alignés.
 */
const LIFECYCLE_IDENTITY_SQL = `(
  cardinality(array_remove(regexp_split_to_array(btrim(coalesce(contact.full_name, '')), '\\s+'), '')) >= 2
  AND (
    coalesce(btrim(contact.title), '') <> ''
    OR coalesce(btrim(contact.entity), '') <> ''
    OR coalesce(contact.linkedin_url, '') <> ''
  )
)`
const LIFECYCLE_ROLE_KNOWN_SQL = `(
  lower(coalesce(contact.decision_role, '')) IN (
    'economic', 'technical', 'user', 'champion',
    'procurement', 'purchasing', 'influencer', 'blocker', 'sponsor'
  )
)`
const LIFECYCLE_REACHABLE_SQL = `(coalesce(contact.email, '') <> '' OR coalesce(contact.phone, '') <> '' OR coalesce(contact.linkedin_url, '') <> '')`
const LIFECYCLE_ENRICHED_SQL = `(coalesce(contact.email, '') <> '' OR coalesce(contact.phone, '') <> '')`

const LIFECYCLE_STATE_SQL = `COALESCE(contact.lifecycle_state, CASE
  WHEN ${LIFECYCLE_IDENTITY_SQL} AND ${LIFECYCLE_ROLE_KNOWN_SQL} AND ${LIFECYCLE_REACHABLE_SQL} THEN 'actionnable'
  WHEN ${LIFECYCLE_IDENTITY_SQL} AND ${LIFECYCLE_ROLE_KNOWN_SQL} THEN 'qualifie'
  WHEN ${LIFECYCLE_ENRICHED_SQL} THEN 'enrichi'
  WHEN ${LIFECYCLE_IDENTITY_SQL} THEN 'identite_verifiee'
  ELSE 'detecte'
END)`

/**
 * #3871 — la portée « Recommandés » s'applique-t-elle à CETTE requête ? Les pastilles
 * d'état comptent SANS la portée ; le chemin recommandé ne contient jamais un contact
 * parti ou écarté. Choisir explicitement un état de SORTIE lève donc la portée : sinon
 * « Historique 1 » surmontait « Aucun contact ne correspond aux filtres » (recette
 * prod 10/10). Un seul prédicat pour la liste ET le compte (GA-26).
 */
function recommendedScopeApplies(filters: {
  recommendedScope?: string
  state?: string
  q?: string
  userStatus?: string
  unassigned?: boolean
  source?: string
  importJob?: string
}): boolean {
  if (filters.recommendedScope !== 'recommended') return false
  // #4660 — un contact SANS compte n'a pas de chemin recommandé (la recommandation est par compte) : « À rattacher »
  // lève la portée, comme un état de sortie. Sinon la tuile disait 0 là où `q=@` (qui lève la portée) en trouvait 964.
  if (filters.unassigned) return false
  // #4660 (jumeaux) — « HubSpot » / « Importés » / « voir les N contacts de CET import » : ces fiches n'ont presque jamais de
  // compte, donc jamais de chemin recommandé. Même règle que « À rattacher » : choisir la puce lève la portée.
  if (filters.importJob || filters.source === MON_CRM_SOURCE_FILTER || filters.source === IMPORT_SOURCE_VALUE)
    return false
  // #3718 — une recherche nommée (`q=Perrin`) ou le filtre « Répondu » cherchent une PERSONNE
  // précise : la restreindre au chemin recommandé la rendait introuvable (recette démo 10/10).
  if (filters.q?.trim() || filters.userStatus) return false
  return filters.state !== 'historique' && filters.state !== 'rejete'
}

/**
 * L'employeur COURANT selon le dernier enrichissement Apollo, en scalaire SQL.
 *
 * GA-26 — vivait en dur, une seule fois, dans la projection de liste
 * (`findAllForUser`) ; #2834 (#2106.24) lui trouve un second appelant
 * (`narrowToSourceTag`, qui a besoin de la MÊME valeur pour rejouer
 * `contactSourceTag` par contact candidat). Deux copies du même extrait JSON
 * auraient divergé au premier changement de forme d'`apolloDetails`.
 */
const APOLLO_CURRENT_ORG_SQL = `COALESCE(
             (SELECT e->>'organization'
                FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(contact.raw_data->'apolloDetails'->'employmentHistory') = 'array'
                       THEN contact.raw_data->'apolloDetails'->'employmentHistory'
                       ELSE '[]'::jsonb END
                ) e
               WHERE e->>'current' = 'true'
               LIMIT 1),
             contact.raw_data->'apolloDetails'->>'organization'
           )`

/**
 * #3911.1 — la recherche qui a trouvé ce contact avait-elle une ancre EXACTE
 * (id Apollo / domaine du compte), ou seulement le nom en texte libre (deux
 * entités homonymes le passent toutes les deux) ? Même raison d'être un
 * extrait scalaire que `APOLLO_CURRENT_ORG_SQL` juste au-dessus : traîner
 * `raw_data` entier coûterait des kilo-octets par ligne pour un seul champ.
 * Absent/NULL = ancre exacte (comportement historique) — `COALESCE … false`.
 */
const APOLLO_EMPLOYER_UNVERIFIED_SQL = `COALESCE(
             (contact.raw_data->'apolloDetails'->>'employerUnverified')::boolean,
             false
           )`

/**
 * #3098 — LA PROCHAINE TOUCHE DE CADENCE, en scalaire SQL.
 *
 * Le moteur de cadence (`CadenceService.buildCadence`) matérialise chaque
 * relance/preuve sociale/close-loop en `action_plan_items` datés
 * (`contact_id`, `cadence_step`, `due_date`) — c'est déjà ce que lit le cron
 * « Rappels de relance ». Le Kanban de prospection (colonnes par
 * `user_status`) a besoin de la MÊME date sur chaque carte, sans rejouer le
 * moteur (compte + scénario + pattern) pour chaque ligne d'une liste paginée.
 * `MIN(due_date)` sur les touches encore ouvertes (`cadence_step IS NOT NULL
 * AND done = false`) est cette date, indexée (`action_plan_items_contact_cadence_idx`
 * sur `contact_id`). `NULL` = aucune touche planifiée — jamais une date
 * inventée.
 */
const NEXT_RELANCE_SQL = `(SELECT MIN(api.due_date)
             FROM action_plan_items api
            WHERE api.contact_id = contact.id
              AND api.cadence_step IS NOT NULL
              AND api.done = false)`

/** Budget d'un agrégat SECONDAIRE de la 1re page (raisons d'exclusion) : la liste ne l'attend pas au-delà. */
const SECONDARY_TALLY_BUDGET_MS = 3_000

/** Rend `undefined` (« on ne sait pas », jamais 0) si `work` dépasse `ms`. */
async function withinBudget<T>(
  work: Promise<T | undefined>,
  ms: number,
  logger: { warn: (msg: string, meta?: unknown) => void },
): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<undefined>(resolve => {
    timer = setTimeout(() => {
      logger.warn('secondary contacts tally exceeded its budget', { ms })
      resolve(undefined)
    }, ms)
  })
  try {
    return await Promise.race([work, late])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * #2159.61 — LA VRAIE PROCHAINE ACTION PLANIFIÉE, PAS SEULEMENT LA CADENCE.
 *
 * `NEXT_RELANCE_SQL` ci-dessus ne voit QUE les touches du moteur de cadence
 * (`cadence_step IS NOT NULL`) — exact pour la carte Kanban, qui affiche
 * littéralement « prochaine relance ». Mais un rappel posé à la main
 * (`schedule_reminder_for_contact`, `ActionPlanItemsService.createManual`)
 * écrit la MÊME table avec `cadence_step: null` : un contact qui en porte un
 * était compté « sans prochaine action » alors qu'un geste humain en avait
 * bien posé une — le défaut exact que #2159.61 nomme (« réservé à la
 * cadence, non représentatif pour la plupart des contacts », la plupart des
 * fiches n'entrant jamais dans une séquence de cadence).
 *
 * Cette dérivation NE FILTRE PAS sur `cadence_step` : toute touche encore
 * ouverte compte, cadence ou manuelle. Sert UNIQUEMENT le filtre
 * `withoutNextAction` (#2158.14) — la carte Kanban garde `NEXT_RELANCE_SQL`,
 * qui répond à une question différente (« quand la prochaine RELANCE »),
 * jamais la même donnée sous deux noms (GA-26 : deux QUESTIONS, deux
 * dérivations, chacune juste pour la sienne).
 */
const NEXT_ACTION_SQL = `(SELECT MIN(api.due_date)
             FROM action_plan_items api
            WHERE api.contact_id = contact.id
              AND api.done = false)`

/**
 * Assemble les QUATRE moments du script téléphone (annexe méthodo p11) en un
 * script lisible, stocké dans la colonne TEXT `phone_script` déjà affichée.
 *
 * Le produit ne générait que l'ouverture. « Le cold call doit qualifier un
 * signal, un besoin, un interlocuteur ou un processus » restait donc un slogan :
 * sans questions de découverte, l'appel ne qualifie rien, et sans sortie il ne
 * se termine sur aucun next step daté ni aucun NO-GO assumé — le commercial
 * raccroche sans savoir s'il doit rappeler.
 *
 * Rétro-compatible par construction : un dossier antérieur ne porte que
 * `phoneOpener` et produit exactement la chaîne d'avant, sans titre de section.
 */
export function composePhoneScript(m: AnalysisContactMessage): string | undefined {
  const opener = m.phoneOpener?.trim()
  const tenSeconds = m.phoneTenSeconds?.trim()
  const discovery = (m.phoneDiscovery ?? []).map(q => q.trim()).filter(Boolean)
  const exit = m.phoneExit?.trim()

  // Aucun des trois moments ajoutés : on rend l'ouverture telle quelle, pour que
  // les dossiers déjà en base ne changent pas d'apparence.
  if (!tenSeconds && discovery.length === 0 && !exit) return opener || undefined

  const sections: string[] = []
  if (opener) sections.push(`OUVERTURE\n${opener}`)
  if (tenSeconds) sections.push(`LES 10 PREMIÈRES SECONDES\n${tenSeconds}`)
  if (discovery.length > 0) sections.push(`DÉCOUVERTE\n${discovery.map(q => `- ${q}`).join('\n')}`)
  if (exit) sections.push(`SORTIE\n${exit}`)
  return sections.length > 0 ? sections.join('\n\n') : undefined
}

/** Tally à zéro — la base sur laquelle l'agrégat SQL est replié. */
const emptyLifecycleTally = (): ContactLifecycleTally => ({
  detecte: 0,
  identite_verifiee: 0,
  qualifie: 0,
  enrichi: 0,
  actionnable: 0,
  historique: 0,
  rejete: 0,
})

type ContactFailureCode =
  | 'not_found'
  | 'invalid' //      la requête est refusée AVANT toute écriture (motif absent…)
  | 'update_failed'
  | 'insufficient_credits'
  | 'enrichment_unchanged' // la dernière tentative n'a rien donné et rien n'a changé depuis
  | 'enrichment_unavailable' // le fournisseur n'a pas répondu — panne, pas absence
  | 'no_email' //     contact has no email address to send to
  | 'no_draft' //     no drafted email_message to send
  | 'already_sent' // the drafted email was already sent (idempotency guard)
  | 'send_failed' //  the mail transport (Resend) rejected the send
  // #3699.4/.5 — canal « boîte connectée » demandé mais indisponible (jamais de
  // bascule silencieuse), tentative déjà en cours, tentative incertaine à
  // vérifier avant de renvoyer, salle de démonstration (rien ne part).
  | 'mailbox_unavailable'
  | 'send_in_progress'
  | 'send_uncertain'
  | 'demo_send_blocked'
  // #3699.6 — une pièce jointe choisie ne peut pas partir (droit d'usage,
  // type, taille, fichier illisible) : l'envoi entier est refusé, jamais sans elle.
  | 'attachment_refused'
  | 'suppressed' //   the contact opted out (on the suppression list)
  // #2297.41/.49 — même vocabulaire que `contact-eligibility.ts:66` : un
  // contact écarté (excluded_at) ou masqué (hidden) à la main.
  | 'permission_denied'
  // #2297.42/.50 — la personne a demandé qu'on cesse (`ContactStopService`),
  // vérifié AVANT l'appel fournisseur payant, pas seulement à l'envoi.
  | 'opt_out'
  // #2297.16 — pays non vérifié ou non couvert par la cascade, vérifié AVANT
  // l'appel fournisseur payant. `country_not_supported` no-op tant que
  // `ENRICHMENT_ALLOWED_COUNTRIES` n'est pas posée (doctrine CLAUDE.md).
  | 'country_not_supported'

type DuplicateContactView = {
  id: string
  fullName: string | null
  email: string | null
  phone: string | null
  title: string | null
}

type DuplicateProposalView = {
  left: DuplicateContactView
  right: DuplicateContactView
  score: number
  reasons: string[]
}

/** #4600 — UNE adresse partagée = UN bloc (« N fiches partagent cette adresse »), jamais N(N-1)/2 propositions. */
type SharedEmailGroupView = {
  email: string
  reason: SharedEmailGroup['reason']
  contacts: DuplicateContactView[]
}

export type ContactFailure = {
  code: ContactFailureCode
  message: string
  /** Machine-readable provider cause, `DegradeReason` vocabulary. Set only for
   *  `enrichment_unavailable`: « clé refusée », « quota épuisé » and « fournisseur
   *  injoignable » are three different repairs, so the client localises on this
   *  rather than echoing a server sentence. */
  reason?: EnrichmentFailureReason
  /**
   * Le sort du crédit, dit par le serveur (recette finale §39/§46 — P0-05).
   *
   * Le rapport montre un 409 affiché nu : « Le serveur a échoué sans indiquer de
   * raison (erreur 409) ». La question que se pose alors l'utilisateur n'est pas
   * technique, elle est comptable — « est-ce que ça m'a coûté un crédit ? ». Y
   * répondre côté client demanderait de déduire le débit du code d'erreur, donc
   * de recopier une règle de facturation dans l'interface. C'est le serveur qui
   * sait, c'est lui qui le dit.
   *
   * `not_debited` : rien n'a été consommé. `refunded` : un crédit avait été pris
   * et a été rendu. `debited` : le crédit est consommé et le résultat est acquis.
   */
  credit?: 'not_debited' | 'refunded' | 'debited'
  /** #3400 — `insufficient_credits` refusé alors que le solde n'est pas vide :
   *  la fenêtre d'essai est fermée. Le client dit la vraie cause, pas « épuisés ». */
  refusal?: 'trial_ended'
  /**
   * Quand une nouvelle tentative vaudra de nouveau la peine (ISO). Renseigné sur
   * `enrichment_unchanged` : un refus qui ne dit pas quand réessayer se lit
   * comme un refus définitif, et le contact est abandonné pour de bon.
   */
  retryAt?: string
}

/** Le brouillon relu à l'écran par le commercial, envoyé tel quel (voir
 *  `sendContactEmailSchema` / `deliverDraft`). */
/** #4616 — les lectures de `bulkInsert` faites AVANT la transaction de l'appelant (`prepareBulkInsert`). */
type BulkInsertContext = { workspaceId: string; erased: ReadonlySet<string> }

type ReviewedDraft = { subject?: string; body: string }

// Result of POST /contacts/:id/send-email (Palier 1). Kept local — the
// controller returns the inferred success shape.
type SendContactEmailResult = {
  contact_id: string
  sent_to: string
  email_sent_at: string
  /** #3699 — par où le message est parti et depuis quelle adresse : lu à la source de l'envoi. */
  channel: ContactSendChannel
  sent_from: string | null
  /** #3699.5 — « pris en charge » : le transport a accepté. Jamais « livré » ni « lu ». */
  state: 'handed_off'
  /** #3699.6 — les pièces parties avec le message : nom, taille, empreinte. Jamais le contenu. */
  attachments: SentAttachmentProof[]
}

/** #3699.6 — la preuve d'une pièce partie : de quoi la reconnaître, jamais ses octets. */
type SentAttachmentProof = { name: string; byte_size: number; sha256: string }

// Result of the MCP `prepare_email` (#2375.10) — UN IDENTIFIANT, jamais un
// contenu (ni destinataire, ni objet, ni corps) : le corps d'un message ne
// sort jamais vers un humain ni vers le modèle.
type PreparedEmailResult = {
  contact_id: string
}

// Result of POST /contacts/send-email/bulk — per-contact outcome so the UI can
// show what went out and why some were skipped (opted out, already sent, …).
type BulkSendResult = {
  sent: { contact_id: string; sent_to: string }[]
  skipped: { contact_id: string; reason: ContactFailureCode }[]
}

/**
 * Les statuts de contact qui SONT une issue commerciale, et l'événement qu'ils
 * laissent au journal d'activité.
 *
 * Ce tableau est le seul endroit où la correspondance vit. Les deux vérités —
 * « où en est ce contact ? » (`contacts.user_status`, lu par l'entonnoir du
 * cockpit d'équipe `/manager/team-stats` et par le pilotage — l'entonnoir du
 * tableau de bord, `GET /dashboard/roi`, est parti avec l'onglet « Équipe » de
 * `/dashboard` le 04/09/2026, #1457) et « qu'a produit la semaine ? »
 * (`user_actions`, lu par les statistiques et les KPIs d'équipe) — naissent
 * ainsi du même geste, au lieu d'être saisies deux fois et de diverger.
 *
 * `refused` et `silence` n'y figurent pas : ce sont des issues, mais aucun
 * compteur ne les lit aujourd'hui, et écrire un événement que personne ne
 * consomme est exactement le défaut que ce lot corrige.
 *
 * `sprintEvent` (m13) : la MÊME issue fait aussi basculer le board de sprints
 * du compte (`SprintsService.applyEvent`, tome 5) — `applyEvent` existait,
 * testé, et sans appelant. Le garder dans CETTE table plutôt qu'une seconde
 * map évite que les deux dérivations d'un même geste divergent.
 */
const CONTACT_STATUS_OUTCOMES: Readonly<
  Record<string, { actionType: ActionType; label: string; sprintEvent: SprintEvent } | undefined>
> = {
  replied: { actionType: 'response_received', label: 'Réponse reçue', sprintEvent: 'positive_reply' },
  meeting: { actionType: 'rdv_obtained', label: 'Rendez-vous décroché', sprintEvent: 'meeting_booked' },
}

// Cap on a single bulk request — bounds the work + protects sending reputation.
const BULK_SEND_MAX = 50

// Merges chain (A→B, then B→C) but never deeply. The cap only exists so a
// cycle introduced by a bad backfill degrades into a logged warning instead of
// an infinite loop on a request thread.
const MAX_MERGE_HOPS = 8

/**
 * Match a contact by name the way {@link contactIdentityKeys} does: accent-,
 * case- and punctuation-insensitive.
 *
 * The Phase 3/4 write-backs used `LOWER(full_name) = LOWER(:fullName)`, which
 * folds case but NOT accents. The Claude prompts (`bellum_contacts.py`,
 * `bellum_messages.py`) are written in unaccented French and a model imitates
 * the orthography it is given, so it answers "Sebastien Chauffray" for a contact
 * stored as "Sébastien Chauffray". The UPDATE then matched zero rows and the
 * entire enrichment — decision role, priority, summary, whyContact, email,
 * phone, and the ready-to-send messages — was dropped in silence, with only the
 * hit-rate log to show for it.
 *
 * `bellum_normalize_name` is the IMMUTABLE function created by migration
 * 1786623491782 and is exactly what the unique index is built on, so this
 * predicate is index-backed rather than a sequential scan.
 */
function nameMatchPredicate(alias = ''): string {
  const col = alias ? `${alias}.` : ''
  return `${col}account_id = :accountId AND bellum_normalize_name(${col}full_name) = bellum_normalize_name(:fullName)`
}

/** Match on the Apollo person id stored in ``raw_data.apolloId``.
 *
 *  The only key that survives Apollo's search tier masking a last name: the row
 *  reads "Severine", the People-Match reveals "Severine Mondy", and a name
 *  predicate would match neither. */
function apolloMatchPredicate(alias = ''): string {
  const col = alias ? `${alias}.` : ''
  return `${col}account_id = :accountId AND ${col}raw_data->>'apolloId' = :apolloId`
}

/** Champs dont l'arrivée justifie de débiter un crédit d'enrichissement. La
 *  photo, le profil Apollo, la séniorité et la localisation en sont volontairement
 *  absents : ce sont des champs GRATUITS du même appel, ils ne doivent jamais
 *  déclencher un débit à eux seuls. */
// Only fields whose arrival the UI reports to the seller as a WIN can bill:
//   - `email` / `phone` — the reveal-gated reachability the credit actually pays
//     for (the confirm dialog's headline deliverable), and
//   - `full_name` — a genuine identity completion, folded ONLY when the contact
//     was a placeholder (`foldIdentity` gates on `wasIncomplete`), which the web
//     surfaces as « Identité complétée ».
//
// `linkedin_url` and `title` were HERE and caused the production billing bug: on
// a plan that matches people but cannot reveal contact info (Apollo Basic —
// People-Match returns the public linkedin_url/title but NO email/phone), a
// match on an already-named contact set `updates.linkedin_url`/`title`, flipped
// `matched` true, and DEBITED — while the web, seeing no email/phone and no
// identity change, showed « Aucune personne trouvée · Crédit non consommé ». The
// balance dropped under a toast that promised it wouldn't. They are still folded
// and persisted (present-only, like the photo), but never bill on their own.
const BILLABLE_ENRICHMENT_FIELDS = ['email', 'phone', 'full_name'] as const

/** E1 (#3698) — une révélation du mobile demandée il y a moins d'une heure
 *  attend encore sa livraison (« plusieurs minutes » chez Apollo) : on ne la
 *  remplace pas. */
const PHONE_REVEAL_REUSE_MS = 3_600_000

/**
 * #2120.68 — la confiance de l'e-mail, dérivée du statut que le fournisseur a
 * LUI-MÊME calculé (`email_status`, déjà reçu, jusqu'ici réduit au seul
 * booléen `email_verified`). Vocabulaire réemployé de
 * `PROJECT_CONFIDENCE_LEVELS` (@bellum/contracts) : une échelle NOMMÉE,
 * jamais une probabilité. `unknown` (ou toute valeur non listée) rend
 * `undefined` — la confiance reste non mesurée plutôt que devinée.
 */
const EMAIL_CONFIDENCE_BY_STATUS: Partial<Record<string, ContactFieldConfidence>> = {
  verified: 'high',
  unverified: 'medium',
  guessed: 'low',
}

/** Le provider apporte-t-il vraiment du neuf sur ce champ ? Re-recevoir la
 *  valeur déjà stockée ne vaut pas un crédit — c'est ce qui faisait payer un
 *  second passage sur un contact déjà enrichi. */
function isNewEnrichmentValue(current: string | null | undefined, next: string | undefined): boolean {
  const incoming = (next ?? '').trim()
  if (!incoming) return false
  return incoming.toLowerCase() !== (current ?? '').trim().toLowerCase()
}

/** Allowed values for `contacts.source` per the DB `contacts_source_check`
 *  constraint. Kept in sync with the migrations (see the drift guard in
 *  `contacts.service.spec.ts`, which fails if a value here is not DB-accepted). */
export const ALLOWED_SOURCES = new Set([
  'linkedin_apify',
  'apollo',
  'ai_generated',
  'brave_search',
  'ia_reconstruction',
  'pappers',
  'manual',
  // Env-gated RGPD-safe enrichment fallback (see DropcontactClient). Keeps the
  // provenance honest when Dropcontact resolves a contact Apollo could not.
  'dropcontact',
  // #1995 — une fiche créée depuis une ligne du CRM connecté. Ni saisie à la
  // main (`manual`) ni reprise en masse (`import`) : elle vient d'un outil que
  // le client tient à jour, et le journal de cycle de vie doit le DIRE plutôt
  // que de retomber sur `ai_generated`.
  'crm',
  // #3989 (Louis 11/10/2026, c94) — une fiche RECOPIÉE depuis la base commune
  // (`AnalysisPersistenceService.saveContacts`) : sa provenance se dit « base
  // commune », jamais `ai_generated` (contrainte élargie par 1796439898901).
  'shared_base',
  // SIG-B (11/10/2026) — un recruteur nommé par une offre d'emploi publiée et
  // gardée pour le compte. Contrainte élargie AVANT par 1796438093817.
  'job_posting',
])

// Decision roles the DB CHECK admits. The LLM (BELLUM-CONTACTS) can emit a value
// off the enum (e.g. "gatekeeper" from the prompt wording) — writing it raw makes
// the whole classify batch fail the CHECK and errors the run. Normalise it: map
// known aliases, else null (leave decision_role NULL, like normaliseSource).
// Exported so the drift guard (contacts.service.spec.ts) can assert every value
// here is admitted by the DB `contacts_decision_role_check` constraint.
export const ALLOWED_DECISION_ROLES = new Set([
  'technical',
  'economic',
  'procurement',
  'user',
  'champion',
  'sponsor',
  'operational',
  'influencer',
  'blocker',
])

function normaliseDecisionRole(raw: string | null | undefined): string | null {
  const r = (raw ?? '').trim().toLowerCase()
  if (!r || r === 'unknown') return null
  if (ALLOWED_DECISION_ROLES.has(r)) return r
  if (r === 'gatekeeper') return 'blocker'
  if (r === 'purchasing') return 'procurement' // legacy alias → canonical
  return null
}

/** Coerce an IA-supplied source string into one the DB will accept. Unknown
 *  values fall back to ``'ai_generated'`` rather than failing the whole batch
 *  insert — better to lose source attribution than to drop a row. */
function normaliseSource(raw: string): string {
  if (raw && ALLOWED_SOURCES.has(raw)) return raw
  return 'ai_generated'
}

/**
 * #4479 — un second apport pour une fiche déjà là : on n'en garde que la SOURCE, additivement
 * (`raw_data.alsoSeenFrom`). Aucune colonne n'est touchée : une correction humaine gagne toujours.
 * Rend `true` si la fiche a changé (sinon pas d'UPDATE inutile).
 */
function attachSecondSource(row: ContactEntity, source: string): boolean {
  const raw = (row.raw_data ?? {}) as Record<string, unknown>
  const seen = Array.isArray(raw.alsoSeenFrom) ? (raw.alsoSeenFrom as string[]) : []
  if (source === row.source || seen.includes(source)) return false
  row.raw_data = { ...raw, alsoSeenFrom: [...seen, source] }
  return true
}

/** Postgres unique-violation. Driver-agnostic: TypeORM surfaces the pg error
 *  code on `.code`, sometimes only on the wrapped `.driverError`. */
function isUniqueViolation(cause: unknown): boolean {
  const err = cause as { code?: string; driverError?: { code?: string } }
  return err?.code === '23505' || err?.driverError?.code === '23505'
}

/** #2297 — ce que dit un enrichissement refusé parce que la personne a exercé
 *  son droit à l'effacement. Le code `suppressed` (409) est celui d'une
 *  personne qui a demandé qu'on cesse : l'écran le sait déjà. */
const ERASED_PERSON_MESSAGE =
  "Cette personne a demandé l'effacement de ses données : elle n'est plus collectée ni enrichie."

/** Apollo extras (photo, city, country, apolloId + the rich People-Search
 *  detail: seniority, departments, functions, career path) go in ``raw_data`` so
 *  the dashboard shows the maximum per contact — no migration needed. ``null``
 *  when the seed carries none of them. */
function buildSeedRawData(seed: AnalysisContactSeed): Record<string, unknown> | null {
  const rawData: Record<string, unknown> = {}
  const seedPhoto = usablePhotoUrl(seed.photoUrl)
  if (seedPhoto) rawData.photoUrl = seedPhoto
  if (seed.city) rawData.city = seed.city
  if (seed.country) rawData.country = seed.country
  if (seed.apolloDetails) rawData.apolloDetails = seed.apolloDetails
  // Apollo person id — the strongest key for the on-demand « Enrichir » button
  // (reveals a search-tier-obfuscated contact BY ID). Persisted here so the
  // enrich path can forward it without a fresh org+title search.
  if (seed.apolloId) rawData.apolloId = seed.apolloId
  // Masked last name as Apollo sends it ("Mo***y"). The UI renders "Severine M."
  // from it — an honest partial identity — instead of a bare first name. Never a
  // reconstruction: only the initial Apollo itself published is shown.
  if (seed.lastNameObfuscated) rawData.lastNameObfuscated = seed.lastNameObfuscated
  // #2290.4-.9 — par quel chemin CE contact a été trouvé (famille, terme
  // direct, synonyme/acronyme/association sectorielle, élargi ou non).
  // Absent sur une recherche non thématisée : non mesuré, jamais un 0 inventé.
  if (seed.matchProvenance) rawData.matchProvenance = seed.matchProvenance
  // #3989 — la ligne commune dont cette fiche est la copie : c'est par elle que
  // l'effacement RGPD d'une personne retrouve ses copies dans les autres espaces.
  if (seed.sharedFactId) rawData.sharedFactId = seed.sharedFactId
  // SIG-B — la PREUVE d'un recruteur : l'offre publiée qui le nomme (intitulé,
  // URL, date de publication). Additive au pliage comme le reste de raw_data.
  if (seed.jobPosting) rawData.jobPosting = seed.jobPosting
  return Object.keys(rawData).length ? rawData : null
}

/** Apollo person id stored on an existing row (``raw_data.apolloId``).
 *
 *  `raw_data` is untyped jsonb, so read defensively: a row seeded before the
 *  Apollo id existed, or one whose jsonb holds something else entirely, must
 *  yield `undefined` rather than throw inside the dedup loop. */
/**
 * #4421.16 — un nom est INCOMPLET quand il n'identifie personne : un prénom seul, ou un nom de famille que la
 * source a masqué (« Inès D. », « Séverine Mo***y »). L'enrichissement le remplace par le nom réel qu'il trouve ;
 * un nom complet n'est jamais écrasé.
 */
export function isIncompleteContactName(name: string | null | undefined): boolean {
  const tokens = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return true
  const last = tokens[tokens.length - 1] ?? ''
  return last.includes('*') || /^\p{L}\.?$/u.test(last)
}

function storedApolloId(row: ContactEntity): string | undefined {
  const raw = row.raw_data as Record<string, unknown> | null | undefined
  const id = raw?.apolloId
  return typeof id === 'string' && id.trim() ? id : undefined
}

/** Trim and collapse empty/whitespace-only cells to ``null`` so a blank CSV
 *  column stores as NULL (UI renders "—") rather than an empty string. */
function nullifyBlank(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * #3850.1 (lot V04, 08/10) — LA GARDE AU POINT D'ÉCRITURE, partagée par TOUS
 * les chemins de ce module qui posent `contacts.phone` depuis une donnée
 * externe (CSV import, fournisseur). Mesuré en prod le 08/10 : un code postal
 * brésilien « 90480-000 » a été ENREGISTRÉ comme téléphone sur une fiche
 * réelle — aucun des chemins d'écriture ne vérifiait la FORME de la valeur
 * avant de la persister. `isPlausiblePhoneNumber` (E.164 plausible ou format
 * local français — `@bellum/contracts`, GA-26) rejette un motif qui n'a ni
 * indicatif ni la forme locale FR, jamais un numéro qu'on a simplement du mal
 * à lire. Une valeur rejetée devient `null` — jamais une donnée fictive à sa
 * place (doctrine). Une valeur ACCEPTÉE est normalisée en E.164 COMPACT
 * (`toE164`, #3850.4) — stockage sans espace, l'affichage international
 * lisible se recalcule à la lecture (`formatPhoneForDisplay`).
 */
function nullifyImplausiblePhone(value: string | null | undefined): string | null {
  const trimmed = nullifyBlank(value)
  return trimmed && isPlausiblePhoneNumber(trimmed) ? toE164(trimmed) : null
}

/** Registrable domain from a stored website URL (`https://www.tf1.fr/pub` →
 *  `tf1.fr`) — the clean Apollo `q_organization_domains_list` anchor when the
 *  account has no persisted Apollo `domain`. Returns `undefined` for blank/junk
 *  input rather than a guess. */
export function extractDomain(website: string | null | undefined): string | undefined {
  const raw = (website ?? '').trim().toLowerCase()
  if (!raw) return undefined
  const host = raw
    .replace(/^[a-z]+:\/\//, '') // strip scheme
    .replace(/^www\./, '') // strip leading www.
    .split(/[/?#]/)[0] // drop path/query/fragment
    ?.trim()
  // A real domain has a dot and no spaces; otherwise it's not usable as an anchor.
  if (!host || host.includes(' ') || !host.includes('.')) return undefined
  return host
}

/** Pick the rich, factual profile fields out of an Apollo enrichment payload —
 *  present-only (a null/empty field is dropped, never persisted as a noisy
 *  null). Returns null when Apollo returned no profile at all, so we never write
 *  an empty `{}` onto the contact. This is the SAME paid payload as the
 *  email/phone — extracting it costs nothing extra. */
function buildApolloContactProfile(data: ApolloEnrichmentData): ApolloContactProfile | null {
  const profile: ApolloContactProfile = {}
  const str = (key: keyof ApolloContactProfile, value: string | null | undefined): void => {
    const trimmed = (value ?? '').trim()
    if (trimmed) (profile[key] as string) = trimmed
  }
  str('headline', data.headline)
  str('seniority', data.seniority)
  str('city', data.city)
  str('state', data.state)
  str('country', data.country)
  str('linkedin_url', data.linkedin_url)
  str('twitter_url', data.twitter_url)
  str('github_url', data.github_url)
  str('facebook_url', data.facebook_url)
  if (data.departments?.length) profile.departments = data.departments
  if (data.subdepartments?.length) profile.subdepartments = data.subdepartments
  if (data.functions?.length) profile.functions = data.functions
  if (data.employment_history?.length) profile.employment_history = data.employment_history
  if (data.education?.length) profile.education = data.education
  if (data.personal_emails?.length) profile.personal_emails = data.personal_emails
  if (data.phone_numbers?.length) profile.phone_numbers = data.phone_numbers
  return Object.keys(profile).length > 0 ? profile : null
}

/** "City, Country" from Apollo's location fields — present-only, either part
 *  optional. Empty when Apollo gave neither. */
function composeApolloLocation(city: string | null | undefined, country: string | null | undefined): string | null {
  const parts = [city, country].map(p => (p ?? '').trim()).filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

/** #4287.11 — un contact avec la date de sa dernière interaction (geste du journal). */
interface RecentlyActedContact {
  id: string
  account_id: string | null
  company_name: string | null
  full_name: string
  title: string | null
  decision_role: string | null
  email: string | null
  phone: string | null
  location: string | null
  linkedin_url: string | null
  user_status: string
  last_action_at: string
}

/** #3282 — les gestes du commercial (jamais un événement système) qui font une « dernière action ». */
const CONTACT_GESTURE_ACTION_TYPES = [
  'message_copied',
  'message_sent',
  'response_received',
  'rdv_obtained',
  'plan_action_completed',
  'plan_action_opened',
  'plan_action_contact_opened',
  'plan_action_message_generated',
  'plan_action_message_copied',
  'plan_action_message_sent',
  'plan_action_call_prepared',
  'plan_action_call_logged',
  'plan_action_linkedin_opened',
  'plan_action_enrichment_requested',
] as const

/** Le plus récent de deux instants ISO, ou `null` quand aucun n'existe. */
/** #4928.5 — la clé de comparaison d'une entité : casse, accents et espaces ne distinguent pas deux écritures. */
function entityKey(value: string): string {
  return normalizeScopeLabel(value).replace(/\s+/g, ' ').trim()
}

/** #4984.2 — `{ account_size }` quand l'effectif est lisible, sinon RIEN (le champ est absent, pas à zéro). */
function accountSizeField(employees: string | null | undefined): {
  account_size?: ReturnType<typeof accountSize> & {}
} {
  const size = accountSize(employees)
  return size ? { account_size: size } : {}
}

function latestIso(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b
}

function mergeContactActivity(tracked: ContactActivity[], existing: ContactActivity[] | null): ContactActivity[] {
  return [...tracked, ...(existing ?? [])].slice(0, 30)
}

function actionToContactActivity(action: UserActionEntity): ContactActivity {
  return {
    label: metadataString(action.metadata, 'label') || actionLabel(action.action_type),
    detail: metadataString(action.metadata, 'detail') || actionDetail(action),
    status: metadataString(action.metadata, 'status') || actionStatus(action.action_type),
    at: action.created_at.toISOString(),
  }
}

function actionLabel(actionType: string): string {
  const labels: Record<string, string> = {
    plan_action_added: 'Action ajoutée au plan',
    plan_action_completed: 'Action marquée comme faite',
    plan_action_uncompleted: 'Action remise à faire',
    plan_action_skipped: 'Action ignorée',
    plan_action_rescheduled: 'Action replanifiée',
    plan_action_opened: 'Action consultée',
    plan_action_contact_opened: 'Fiche contact ouverte',
    plan_action_message_generated: 'Message généré',
    plan_action_message_copied: 'Message copié',
    plan_action_message_sent: 'Message envoyé',
    plan_action_call_prepared: 'Pitch d’appel préparé',
    plan_action_call_logged: 'Appel renseigné',
    plan_action_linkedin_opened: 'Profil LinkedIn ouvert',
    plan_action_enrichment_requested: 'Enrichissement demandé',
  }
  return labels[actionType] ?? 'Action enregistrée'
}

function actionDetail(action: UserActionEntity): string | null {
  const channel = action.channel ? channelLabel(action.channel) : null
  const source = metadataString(action.metadata, 'source_label')
  return [channel, source].filter((value): value is string => Boolean(value)).join(' · ') || null
}

function actionStatus(actionType: string): string | null {
  if (actionType === 'plan_action_completed') return 'Fait'
  // #2715.1 — `message_sent` (e-mail VÉRIFIÉ, `recordEmailSent`/`via: 'bellum'`)
  // portait le même geste que `plan_action_message_sent` (LinkedIn DÉCLARÉ)
  // sans le même statut : le badge « Succès » n'apparaissait que pour
  // LinkedIn. Les deux canaux affichent désormais le même statut — leur
  // NATURE (vérifié / déclaré) reste distincte ailleurs, dans
  // `message-send-provenance.ts`, jamais ici.
  if (
    actionType === 'message_sent' ||
    actionType === 'plan_action_message_sent' ||
    actionType === 'plan_action_call_logged'
  )
    return 'Succès'
  if (actionType === 'plan_action_skipped') return 'Ignoré'
  if (actionType === 'plan_action_rescheduled') return 'Replanifié'
  return null
}

function channelLabel(channel: string): string {
  if (channel === 'linkedin') return 'LinkedIn'
  if (channel === 'email') return 'Email'
  if (channel === 'phone') return 'Téléphone'
  if (channel === 'meeting') return 'Rendez-vous'
  return 'Plan'
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value : null
}

/** Ce que `scoreContacts` ajoute à `ContactEntity`, à la lecture — jamais des
 *  colonnes. `ContactEntity` seul ne le dit pas ; ce type nomme l'écart plutôt
 *  que de laisser `findByAccount`/`findOne` mentir sur leur propre sortie. */
type ScoredContactEntity = ContactEntity & {
  contact_score: number
  contact_score_breakdown: NonNullable<ContactEntity['contact_score_breakdown']>
  /** Lot 758 — la pastille de joignabilité, hors score ; `null` : aucun canal connu. */
  contact_reachability: ContactReachability | null
  source_tag: string
}

/** #2799 — le contexte rendu par {@link ContactsService.dormantReactivationSignals}, le
 *  sous-ensemble de {@link DormantReactivationScoreInput} que `findAllForUser` ne porte pas.
 *  Non exporté : seul ce fichier le nomme, le contrôleur reçoit le type INFÉRÉ de la méthode
 *  (`pnpm lint:exports:types` refuse un type exporté qui ne sert qu'à son propre fichier). */
type DormantReactivationSignalsRow = Pick<
  DormantReactivationScoreInput,
  | 'signals'
  | 'accountPriorityScore'
  | 'accountAssignedTo'
  | 'pastActivityCount'
  | 'lastActivitySubject'
  | 'monthsSinceLastActivity'
>

/**
 * La forme envoyée SUR LE FIL par `findByAccountForHttp` (LOT 4 perf,
 * GA-297/298 — mesuré en prod le 12/09/2026, `apps/api` seul, `findByAccount`
 * n'est pas modifiée). `ScoredContactEntity` moins SIX champs dont la mesure
 * a montré qu'aucun consommateur de CETTE route ne les lit :
 *
 *  - `user_id` / `workspace_id` : CONSTANTS sur toute la réponse (le porteur
 *    de la ligne et l'espace de travail de l'appelant, tous deux déjà connus
 *    sans relire le contact) — 225 Ko sur 2 027 lignes (THALES), zéro lecture
 *    côté web hors un placeholder de test qui documente explicitement ne
 *    jamais lire la valeur (`toEngagementContact.ts`).
 *  - `contact_score` / `contact_score_breakdown` : le score /100 EXPLIQUÉ
 *    n'est affiché QUE sur la fiche contact (`GET /contacts/:id` → `findOne`,
 *    qui le recalcule indépendamment, AVEC son propre appel à
 *    `scoreContacts`) — 1 048 Ko (25 % du poids mesuré) qu'aucun écran de
 *    cette route n'affiche. La doctrine « un score n'est jamais nu » ne
 *    s'applique pas ici : elle protège un score AFFICHÉ, et celui-ci ne l'est
 *    par aucun consommateur de `findByAccountForHttp` (onglet Contacts,
 *    mémoire de relation, brief de réunion, export PDF — aucun ne lit
 *    `contact_score` ni `contact_score_breakdown`).
 *  - `raw_data` (282 Ko) : le seul sous-champ que le front y lisait
 *    (`lastNameObfuscated`, pour la fiche masquée « Séverine M. ») voyage
 *    désormais PROJETÉ — voir `last_name_obfuscated` ci-dessous, même motif
 *    que `findAllForUser` (`raw_data->>'lastNameObfuscated' AS
 *    last_name_obfuscated`, plus bas dans ce fichier).
 *  - `created_at` : jamais lu par un consommateur de cette route
 *    (`updated_at`, gardé, l'est par `RelationshipMemoryCard` et le brief de
 *    réunion).
 *
 * `account_id` RESTE, lui, bien que sa VALEUR soit constante (déjà dans
 * l'URL) : `ContactOutcomeSubmenu`, `EngagementPanel`, `toEngagementContact`
 * et plusieurs hooks de cache (`useEnrichContact`, `useHideContact`,
 * `useSendContactEmail`…) lisent `contact.account_id` sur CHAQUE ligne — le
 * CHAMP n'est pas redondant pour ces appelants, seule sa valeur l'est.
 */
type AccountContactView = Omit<
  ScoredContactEntity,
  | 'user_id'
  | 'workspace_id'
  | 'contact_score'
  | 'contact_score_breakdown'
  // Lot 758 — la pastille de joignabilité suit le score : cette route ne rend pas le score, et
  // ses lignes affichent déjà leurs canaux (`CompactContactRow`). GA-297 tient le compte.
  | 'contact_reachability'
  | 'raw_data'
  | 'created_at'
  // perf P6 — aucun lecteur sur cette route : web (seul `toEngagementContact`
  // les force à null), IA, pont copilote (il choisit ses champs). Lus ailleurs
  // sur l'ENTITÉ (`cadence.service.ts`), donc `findByAccount` reste intacte.
  | 'cadence_messages'
  | 'followup_message'
> & {
  last_name_obfuscated: string | null
  /** #4044 — pays / ville / employeur de la collecte, pour juger le périmètre géographique côté écran. */
  place: ContactPlaceView | null
  /** #4055.8 — la preuve datée d'un départ (autre employeur observé), projetée hors de `raw_data` ; `null` sans preuve. */
  employment_left: { organization: string; at: string } | null
  /** #4016 L4.1 — date de vérification quand l'adresse est ESTIMÉE (posée par `findByAccount`) ; absente sinon. */
  email_estimated_at?: string | null
}

/** Même règle que la liste (`EMPLOYMENT_LEFT_PROOF_SQL`) : `left` SEULEMENT avec un employeur observé ET une date. */
function extractEmploymentLeft(
  rawData: Record<string, unknown> | null,
  employer: string | null = null,
): { organization: string; at: string } | null {
  const check = rawData?.['employmentCheck']
  if (typeof check === 'object' && check !== null) {
    const { state, organization, at } = check as Record<string, unknown>
    if (state === 'left' && typeof at === 'string' && typeof organization === 'string') {
      const trimmed = organization.trim()
      if (trimmed) return { organization: trimmed, at }
    }
  }
  // #4465.2 — pas de relecture d'annuaire qui le prouve : le parcours (expérience chez l'employeur du compte, datée de fin).
  return employmentLeftFromHistory(rawData, employer)
}

/** Même lecture que `findAllForUser` (`raw_data->>'lastNameObfuscated'`), en
 *  mémoire plutôt qu'en SQL : la ligne est déjà chargée pour le score, une
 *  seconde requête ne se justifierait pas pour une seule clé. */
function extractLastNameObfuscated(rawData: Record<string, unknown> | null): string | null {
  const value = rawData?.['lastNameObfuscated']
  return typeof value === 'string' ? value : null
}

/** Projette une ligne scorée vers la forme HTTP de `findByAccountForHttp` —
 *  voir {@link AccountContactView} pour le détail des six champs retirés. */
function toAccountContactView(row: ScoredContactEntity, employer: string | null = null): AccountContactView {
  const {
    user_id: _user_id,
    workspace_id: _workspace_id,
    contact_score: _contact_score,
    contact_score_breakdown: _contact_score_breakdown,
    contact_reachability: _contact_reachability,
    raw_data,
    created_at: _created_at,
    cadence_messages: _cadence_messages,
    followup_message: _followup_message,
    ...rest
  } = row
  return {
    ...rest,
    last_name_obfuscated: extractLastNameObfuscated(raw_data),
    place: contactPlaceOf(raw_data),
    employment_left: extractEmploymentLeft(raw_data, employer),
  }
}

const isSendChannel = (value: string | null | undefined): value is ContactSendChannel =>
  value === 'workspace' || value === 'mailbox'

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name)

  /**
   * #3942.5 — LE CHEMIN RECOMMANDÉ D'UN COMPTE, EN MÉMOIRE, COURT.
   *
   * Incident prod 05/10 (CPU API saturé) : `/contacts` en portée Recommandés
   * reclassait TOUS les comptes candidats à CHAQUE requête (`rankAccountContacts`
   * sur chacun) — sur un espace de 41 304 contacts / 2 203 sur un seul compte,
   * un simple défilement de page rejouait le même classement coûteux. Même
   * convention que le reste du dépôt (`short-ttl-cache.ts`, en-tête : « même
   * précédent que `market-memory.service.ts`/`tool-registry.service.ts` ») :
   * un TTL court (60 s, aucune nouvelle convention), clé `workspaceId:accountId`
   * — jamais `accountId` seul, deux espaces ne partagent jamais un classement.
   *
   * Invalidée explicitement (`invalidateRecommendedPath` ci-dessous) partout où
   * CE service écrit en MASSE les contacts d'un compte (enrichissement,
   * import, org chart, CRM, exclusion, masquage) — les écritures UNITAIRES
   * interactives (note, statut, confirmation d'identité…) restent sous le
   * seul TTL : une fenêtre de 60 s sur un geste isolé est le même compromis
   * que `cockpit-perspective.service.ts`/`market-memory.service.ts`, qui n'
   * invalident jamais du tout. Nommé, pas tranché en silence.
   */
  private readonly recommendedPathCache = new ShortTtlCache<readonly string[]>(60_000)

  constructor(
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(UserActionEntity)
    private readonly userActions: Repository<UserActionEntity>,
    private readonly ia: IaClient,
    private readonly credits: CreditsService,
    // Multi-user Phase 2: resolves the caller's active workspace so contact-table
    // reads scope by `workspace_id` (team-shared) instead of `user_id`, and new
    // rows are stamped with it. Callers keep passing `userId` (the created-by);
    // resolution happens here so external entry points (analysis pipeline,
    // dashboard, accounts CSV import) need no signature change.
    private readonly workspaceContext: WorkspaceContextService,
    // Palier 1 « Envoie l'email » : envoie le brouillon `email_message` au
    // contact via le transport Resend (inline, pour remonter succès/échec dans
    // la réponse HTTP).
    private readonly mailer: MailerService,
    // Opt-out list — checked before every send (garde-fou RGPD).
    private readonly suppression: SuppressionService,
    private readonly config: ConfigService,
    // Moteur de cadence multi-touch (Drive #8) : programme la séquence de relance
    // (items datés → cron « Rappels de relance ») dès le premier email envoyé.
    private readonly cadence: CadenceService,
    // Read-only: the account's `raw_analysis` cartography (entities/perimeters +
    // angles) feeds the deterministic /100 contact score (Théo 03_BUSINESS_RULES
    // §3) so the sales rep sees the SAME grid as the operator dashboard.
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    // Append-only lifecycle journal (P0 « states + providers ») — one row per
    // passage détecté → … → actionnable, with the driving provider + real date.
    @InjectRepository(ContactLifecycleTransitionEntity)
    private readonly lifecycleTransitions: Repository<ContactLifecycleTransitionEntity>,
    // RGPD-safe enrichment fallback (env-gated on DROPCONTACT_API_KEY). No key →
    // `isEnabled()` is false → never called → Apollo stays the sole provider,
    // behaviour unchanged. Only ever runs after Apollo returns no match.
    private readonly dropcontact: DropcontactClient,
    private readonly extraEnrichers: EnrichmentProviders,
    // Merge log: old contact id → the row it was folded into. Read on the
    // detail path so a link shared before a dedup keeps resolving instead of
    // answering « Contact introuvable » for someone who still exists.
    @InjectRepository(ContactMergeEntity)
    private readonly merges: Repository<ContactMergeEntity>,
    private readonly brands: WorkspaceBrandService,
    // Product analytics — best-effort, `@Optional()` so the direct-`new` specs
    // don't need to pass an analytics stub.
    @Optional() private readonly analytics?: ProductAnalyticsService,
    // Coûts fournisseurs (D19) — optionnel comme ci-dessus : sans lui,
    // l'enrichissement marche pareil, il n'est simplement pas mesuré.
    @Optional() private readonly providerCosts?: ProviderCostService,
    // Arbitre de provenance (socle CRM T0). `@Optional()` pour les specs qui
    // construisent le service directement : sans lui, l'enrichissement applique
    // la MÊME règle (un blanc n'écrase pas une valeur), il ne peut simplement
    // pas savoir qu'un champ a été corrigé à la main.
    @Optional() private readonly provenance?: ProvenanceService,
    // Board de sprints (tome 5, m13 ; événement depuis m18). `@Optional()` comme
    // ci-dessus — sans lui, l'issue se consigne toujours au journal d'activité,
    // elle ne fait simplement pas basculer le board. `ContactsModule` importe
    // `SprintsModule` pour que la production le reçoive toujours.
    //
    // ⚠️ m18 : ceci n'est PLUS `SprintsService` — GA-07 (§3.2, les frontières
    // de modules) a fait tomber l'import direct de 239 à 240. Le contact
    // ÉMET sur ce bus (« l'issue d'un contact a été enregistrée ») ; le module
    // sprints ÉCOUTE et appelle son propre `SprintsService.applyEvent` — voir
    // `SprintProgressionListener`. `ContactsService` n'importe plus rien du
    // module sprints qui porte « service » dans son nom.
    @Optional() private readonly sprintBus?: SprintProgressionBus,
    // #2120.48 — « tous les fournisseurs » (décision Louis 18/09/2026) : cette
    // table SEULE dit si un CRM est branché sur l'espace, quel qu'il soit
    // (`crm.controller.ts#status` reste, lui, câblé hubspot-only et ne suffirait
    // pas). `@Optional()` comme les dépendances ci-dessus : sans elle, la
    // confrontation répond `connected: false` — un défaut sûr, jamais un
    // `true` supposé.
    @Optional()
    @InjectRepository(CrmConnectionEntity)
    private readonly crmConnections?: Repository<CrmConnectionEntity>,
    // #2120.57 / #2297.23 — la durée d'un enrichissement se mesure.
    // `@Optional()` comme les dépendances ci-dessus : sans lui, l'enrichissement
    // marche pareil, il n'est simplement pas mesuré.
    @Optional() private readonly enrichmentDuration?: EnrichmentDurationService,
    // #2297 — les empreintes des personnes EFFACÉES (RGPD art. 17), vérifiées à
    // l'entrée de la collecte et de l'enrichissement. SANS `@Optional()`, à
    // dessein : Nest refuse de démarrer si le dépôt n'est pas déclaré — une
    // vérification qui se tairait laisserait revenir une personne effacée.
    // Optionnel pour TypeScript seulement (specs qui construisent par position).
    @InjectRepository(PersonErasureEntity)
    private readonly personErasures?: Repository<PersonErasureEntity>,
    // #2297.41/.42/.49/.50 — la porte PERSONNE, vérifiée avant l'appel
    // fournisseur payant. `@Optional()` : sans lui, l'enrichissement marche
    // pareil, il ne vérifie simplement pas l'opt-out.
    @Optional()
    @InjectRepository(ContactStopEntity)
    private readonly contactStops?: Repository<ContactStopEntity>,
    // #2126.56/.58 (épopée #2787) — les fiches marquées `incorrect_contact`
    // (`commercial-outcome.ts`), écartées du classement ET des recommandations
    // (même porte, `contact-eligibility.ts`). `@Optional()` comme ci-dessus :
    // sans lui, le classement marche pareil, il n'exclut simplement rien de
    // plus que ce que la porte excluait déjà.
    @Optional() private readonly outcomes?: CommercialOutcomesService,
    // #2309.16/.19 — le journal des candidats jamais devenus une fiche.
    // `@Optional()` : sans lui, le refus de création marche pareil, il n'est
    // simplement pas compté dans le funnel.
    @Optional()
    @InjectRepository(ContactIntakeExclusionEntity)
    private readonly intakeExclusions?: Repository<ContactIntakeExclusionEntity>,
    // #3754 — les postes cibles de l'ESN et leur niveau décideur, qui ORDONNENT
    // le chemin recommandé (jamais ne le filtrent). `@Optional()` : sans lui, le
    // classement est celui d'avant, à l'octet.
    @Optional()
    @InjectRepository(EsnTargetPersonaEntity)
    private readonly targetPersonas?: Repository<EsnTargetPersonaEntity>,
    // #3698.6 — prévient l'équipe d'une panne d'enrichissement côté service.
    // `@Optional()` : sans lui, l'enrichissement répond pareil, personne n'est prévenu.
    @Optional()
    @Inject(ENRICHMENT_OUTAGE_ALERT)
    private readonly outageAlert?: EnrichmentOutageAlert,
    // #3699.4 — la boîte connectée du commercial, pour l'envoi individuel. `@Optional()` :
    // sans lui, seul l'expéditeur de l'espace existe, et le serveur refuse `channel: 'mailbox'`.
    @Optional()
    @Inject(INDIVIDUAL_MAILBOX_SENDER)
    private readonly mailboxSender?: IndividualMailboxSender,
    // E1 (#3698) — la révélation du mobile Apollo (webhook signé), dernier
    // maillon de la cascade. `@Optional()` : sans lui, la cascade s'arrête à
    // FullEnrich, l'état par coordonnée reste écrit.
    @Optional() private readonly phoneReveal?: ContactPhoneRevealService,
    // #3699.6 — les pièces jointes choisies par le commercial. `@Optional()` : sans
    // lui, aucune pièce n'est proposée et toute demande de pièce est refusée.
    @Optional()
    @Inject(EMAIL_ATTACHMENTS)
    private readonly emailAttachments?: EmailAttachments,
    // LUDOVIC-C LC.1 — le profil de l'espace (pack, zones) réordonne le chemin À LA LECTURE.
    // `@Optional()` : sans lui, le classement est exactement celui d'avant.
    @Optional() private readonly profileReader?: EsnProfileReader,
    // Théo B C5.R2 — le badge relationnel dérivé de la fiche lit `activities`. `@Optional()` : sans lui, pas de badge.
    @Optional() @InjectRepository(ActivityEntity) private readonly activityRows?: Repository<ActivityEntity>,
    // Le chemin prioritaire respecte le refus humain d'une paire (« pas les mêmes »). `@Optional()` : sans lui, aucun refus connu.
    @Optional() private readonly duplicateDecisionsReader?: ContactDuplicateDecisionsService,
  ) {}

  /** Le profil de `userId`, lu UNE fois par requête ; illisible ⇒ `null`, jamais bloquant. */
  private async profileDataOf(userId: string): Promise<AnalysisProfileData | null> {
    if (!this.profileReader) return null
    try {
      return (await this.profileReader.resolveProfileData(userId)) ?? null
    } catch {
      return null
    }
  }

  /** Lot 758 — l'offre déclarée du profil de `userId`, pour le score de pertinence ;
   *  illisible ou vide ⇒ `undefined` (la grille d'avant), jamais bloquant. */
  private async sellerScoringOf(userId: string): Promise<SellerScoringContext | undefined> {
    return sellerScoringContextFrom(await this.profileDataOf(userId))
  }

  /** E1 — la trace INTERNE d'enrichissement (`select: false` sur l'entité). */
  private async loadEnrichmentTrace(contact: {
    id: string
    workspace_id?: string | null
  }): Promise<ContactEnrichmentTrace | null> {
    // #2671.5 — la borne d'espace DANS la requête.
    const row = await this.contacts.findOne({
      where: { id: contact.id, workspace_id: contact.workspace_id ?? IsNull() },
      select: ['id', 'enrichment_trace'],
    })
    return (row?.enrichment_trace ?? null) as ContactEnrichmentTrace | null
  }

  /**
   * #3754 — les postes cibles de l'espace, prêts à rapprocher. Aucun poste (ou
   * dépôt absent) → `undefined` : le classement ignore alors tout le sujet.
   */
  /**
   * #4271 (18/10) — le statut d'accès du compte, lu sur ce que le produit sait DÉJÀ (mêmes tables
   * que `AccountAccessService`) : un rang 1 en place CHEZ NOUS (`account_partners.rank = rank1`,
   * voie « ESN référencée ») → `referenced` ; sinon un rang 1 installé ailleurs
   * (`account_entities.rank1_incumbent = yes`) → `to_build`. #4802 : un état posé à la main (`access_facts`,
   * `access_status`) passe AVANT ces deux lectures. Aucun fait → `undefined` : l'ordre
   * reste celui d'avant, jamais un statut deviné. Best-effort : une lecture qui échoue ne casse pas le rang.
   */
  private async loadAccessStatus(workspaceId: string, accountId: string): Promise<ContactAccessStatus | undefined> {
    try {
      // #4802 — l'état posé À LA MAIN prime sur tout calcul, quelle que soit sa date (une correction humaine
      // gagne toujours) ; « inconnu » posé = ordre inchangé.
      const declared = (await this.contacts.query(
        `SELECT value FROM access_facts
          WHERE workspace_id = $1 AND account_id = $2 AND kind = 'access_status' AND provenance = 'human'
            AND value IN ('referenced','to_build','inconnu')
          ORDER BY observed_at DESC NULLS LAST, created_at DESC LIMIT 1`,
        [workspaceId, accountId],
      )) as Array<{ value: string }>
      if (declared[0]) return declared[0].value === 'inconnu' ? undefined : (declared[0].value as ContactAccessStatus)
      const partners = (await this.contacts.query(
        `SELECT 1 FROM account_partners
          WHERE workspace_id = $1 AND account_id = $2 AND dismissed_at IS NULL AND rank = 'rank1' LIMIT 1`,
        [workspaceId, accountId],
      )) as unknown[]
      if (partners.length > 0) return 'referenced'
      const entities = (await this.contacts.query(
        `SELECT 1 FROM account_entities
          WHERE workspace_id = $1 AND account_id = $2 AND rank1_incumbent = 'yes' LIMIT 1`,
        [workspaceId, accountId],
      )) as unknown[]
      return entities.length > 0 ? 'to_build' : undefined
    } catch {
      return undefined
    }
  }

  /**
   * #4292.11 — {@link loadAccessStatus} pour TOUS les comptes d'un lot, en deux lectures (jamais deux par compte) :
   * les classements en masse (chemin d'accès, décideur de tête, contacts recommandés) appliquent le MÊME statut
   * d'accès que la fiche compte (#4271), sinon deux écrans nomment deux interlocuteurs de tête pour un même compte.
   * Un compte sans fait absent de la map : l'ordre reste celui d'avant.
   */
  private async loadAccessStatuses(
    workspaceId: string,
    accountIds: readonly string[],
  ): Promise<Map<string, ContactAccessStatus>> {
    const statuses = new Map<string, ContactAccessStatus>()
    if (accountIds.length === 0) return statuses
    try {
      const incumbents = (await this.contacts.query(
        `SELECT DISTINCT account_id FROM account_entities
          WHERE workspace_id = $1 AND account_id = ANY($2::uuid[]) AND rank1_incumbent = 'yes'`,
        [workspaceId, [...accountIds]],
      )) as Array<{ account_id: string }>
      for (const row of incumbents) statuses.set(row.account_id, 'to_build')
      const partners = (await this.contacts.query(
        `SELECT DISTINCT account_id FROM account_partners
          WHERE workspace_id = $1 AND account_id = ANY($2::uuid[]) AND dismissed_at IS NULL AND rank = 'rank1'`,
        [workspaceId, [...accountIds]],
      )) as Array<{ account_id: string }>
      // L'ESN référencée prime sur un rang 1 installé ailleurs — même priorité que `loadAccessStatus`.
      for (const row of partners) statuses.set(row.account_id, 'referenced')
      // #4802 — l'état posé à la main prime sur le calcul (même règle que `loadAccessStatus`).
      const declared = (await this.contacts.query(
        `SELECT DISTINCT ON (account_id) account_id, value FROM access_facts
          WHERE workspace_id = $1 AND account_id = ANY($2::uuid[]) AND kind = 'access_status' AND provenance = 'human'
            AND value IN ('referenced','to_build','inconnu')
          ORDER BY account_id, observed_at DESC NULLS LAST, created_at DESC`,
        [workspaceId, [...accountIds]],
      )) as Array<{ account_id: string; value: string }>
      for (const row of declared) {
        if (row.value === 'inconnu') statuses.delete(row.account_id)
        else statuses.set(row.account_id, row.value as ContactAccessStatus)
      }
    } catch {
      return new Map()
    }
    return statuses
  }

  private async loadTargetPersonas(workspaceId: string): Promise<PreparedTargetPersonas | undefined> {
    if (!this.targetPersonas) return undefined
    const rows = await this.targetPersonas.find({
      where: { workspace_id: workspaceId },
      select: ['title', 'decision_level'],
    })
    return rows.length > 0 ? prepareTargetPersonas(rows) : undefined
  }

  /**
   * Échec d'enrichissement « fournisseur indisponible » : la panne s'écrit par coordonnée (état
   * `unknown`) et la réponse dit qu'aucun crédit n'a été débité. Rendu seulement quand AUCUNE
   * source n'a pris le relais d'Apollo.
   */
  private async failEnrichmentOutage(
    reason: EnrichmentFailureReason,
    contact: ContactEntity,
    contactId: string,
    userId: string,
    dto: { only?: EnrichmentCoordinate },
  ): Promise<Result<never, ContactFailure>> {
    // #3822.2 — la panne se NOMME, par coordonnée, pour que la liste puisse
    // la distinguer d'un « recherché sans résultat » après reload. Best-
    // effort et ISOLÉ : cette écriture ne doit jamais faire échouer la
    // réponse d'échec déjà décidée ci-dessous — une panne qui ne peut même
    // pas s'écrire reste une panne, jamais un second type d'erreur à gérer.
    // Intégration J1 : la panne s'écrit dans l'état PAR COORDONNÉE d'E1
    // (`enrichment_coordinates`, état `unknown` — « un timeout n'est pas un
    // échec », jamais `not_found`), une seule source d'état, pas de colonne
    // en double. Une coordonnée déjà renseignée garde son état.
    const erroredChannels: EnrichmentCoordinate[] = dto.only ? [dto.only] : ['email', 'phone']
    const outageAt = new Date().toISOString()
    const coordinatesAfterOutage: EnrichmentCoordinateStates = {
      ...((contact.enrichment_coordinates ?? {}) as EnrichmentCoordinateStates),
    }
    for (const channel of erroredChannels) {
      if ((contact[channel] ?? '').trim()) continue
      coordinatesAfterOutage[channel] = { state: 'unknown', sources_queried: 0, at: outageAt }
    }
    await this.contacts
      .createQueryBuilder()
      .update(ContactEntity)
      .set({ enrichment_coordinates: coordinatesAfterOutage })
      .where('id = :id', { id: contactId })
      .execute()
      .catch(persistError =>
        this.logger.error('enrichContact: trace de panne non écrite', { persistError, contactId, userId }),
      )
    return failure({
      code: 'enrichment_unavailable',
      message: ENRICHMENT_FAILURE_MESSAGES[reason],
      reason,
      // Une panne amont ne coûte rien : le débit n'intervient qu'après un
      // résultat. Le dire explicitement évite que l'utilisateur compte un
      // crédit perdu à chaque incident fournisseur — et évite au support de
      // devoir le rassurer un par un.
      credit: 'not_debited',
    })
  }

  /**
   * #3698.6 — l'équipe est prévenue quand l'échec vient de NOTRE côté (clé,
   * quota ou budget Bellum, fournisseur en erreur, réseau). Jamais pour un
   * `rate_limited` : un ralentissement passager n'est pas une panne. Best-effort :
   * ne bloque pas la réponse et ne lève jamais.
   */
  private notifyEnrichmentOutage(reason: EnrichmentFailureReason): void {
    if (!this.outageAlert || reason === 'rate_limited') return
    void this.outageAlert(reason).catch((error: unknown) =>
      this.logger.warn(`enrichment outage alert failed: ${error instanceof Error ? error.message : String(error)}`),
    )
  }

  /**
   * #2297 — les empreintes effacées de l'espace. Une trace SANS donnée de la
   * personne (`person_erasures`) : la collecte et l'enrichissement la lisent
   * pour ne jamais recréer quelqu'un qui a exercé son droit à l'effacement.
   */
  private async erasedFingerprints(workspaceId: string | null | undefined): Promise<ReadonlySet<string>> {
    if (!this.personErasures || !workspaceId) return new Set()
    const rows = await this.personErasures.find({
      where: { workspace_id: workspaceId },
      select: { fingerprints: true },
    })
    const erased = new Set(rows.flatMap(row => row.fingerprints ?? []))
    // #2297.51 — l'espace A des effacements mais la clé d'empreinte manque : on
    // ne peut plus reconnaître la personne. La collecte et l'enrichissement
    // s'arrêtent (503) plutôt que de la laisser revenir sans vérification. Un
    // espace sans effacement ne calcule rien et n'a pas besoin de la clé.
    if (erased.size > 0 && !isPersonErasureKeyConfigured()) throw new PersonErasureKeyUnavailableError()
    return erased
  }

  /** #2297 — la fiche, avec ce que l'enrichissement s'apprête à y plier,
   *  désigne-t-elle une personne effacée ? */
  private async isErasedIdentity(
    contact: ContactEntity,
    incoming: { full_name?: string; email?: string; linkedin_url?: string },
  ): Promise<boolean> {
    const erased = await this.erasedFingerprints(contact.workspace_id)
    if (erased.size === 0) return false
    const rawApolloId = (contact.raw_data as { apolloId?: unknown } | null)?.apolloId
    const current = personErasureFingerprints(contact.workspace_id ?? '', {
      fullName: contact.full_name,
      email: contact.email,
      linkedinUrl: contact.linkedin_url,
      apolloId: typeof rawApolloId === 'string' ? rawApolloId : null,
      accountId: contact.account_id,
    })
    const found = personErasureFingerprints(contact.workspace_id ?? '', {
      fullName: incoming.full_name,
      email: incoming.email,
      linkedinUrl: incoming.linkedin_url,
      accountId: contact.account_id,
    })
    return isErasedPerson([...current, ...found], erased)
  }

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * LE PÉRIMÈTRE D'UN CONTACT — celui de SON COMPTE, et rien d'autre
   * ───────────────────────────────────────────────────────────────────────────
   * La table `contacts` ne porte PAS de `business_unit_id`, et c'est délibéré :
   * un contact n'appartient pas à une agence, il appartient à un COMPTE, qui
   * lui en a une. Dupliquer la colonne créerait deux vérités à synchroniser, et
   * le jour où elles divergent c'est le cloisonnement qui perd.
   *
   * ⚠️ Un contact SANS compte (`account_id IS NULL`) reste visible. C'est la
   * même moitié de règle que « OU rattaché à aucun périmètre » côté comptes :
   * ce que personne ne porte ne disparaît pour personne le jour du déploiement.
   *
   * ⚠️ Les ÉCRITURES de ce service (exclure, noter, masquer, changer un statut)
   * sont bornées à l'ESPACE de l'appelant (`contactGestureWhere`, #4731) : elles
   * n'ont pas besoin de cette clause de périmètre. Les ENVOIS gardent `{ id,
   * user_id }` — ils parlent au nom de l'appelant.
   */
  /**
   * La clause « le compte de ce contact est dans le périmètre », en fragment de
   * `where` d'un `find`. La FORME vient de `businessUnitScopeClause` — un seul
   * endroit pour les trois dialectes (QueryBuilder, SQL brut, `Raw`).
   */
  private contactBusinessUnitWhere(scope: BusinessUnitScopeClause): { account_id?: FindOperator<string> } {
    const clause = businessUnitScopeClause(scope, 'bu_acc.business_unit_id', ':...businessUnitIds')
    if (!clause) return {}
    const params = scope && scope.businessUnitIds.length ? { businessUnitIds: [...scope.businessUnitIds] } : {}
    return {
      account_id: Raw(
        alias => `(${alias} IS NULL OR ${alias} IN (SELECT bu_acc.id FROM accounts bu_acc WHERE ${clause}))`,
        params,
      ),
    }
  }

  /**
   * « Ce compte est-il dans le périmètre de l'appelant ? » — pour les lectures
   * qui prennent un `accountId` et dont la réponse est une LISTE : hors
   * périmètre, la liste est vide, ce qui est la réponse d'un compte qu'on ne
   * voit pas. Jamais un refus explicite, qui confirmerait qu'il existe.
   */
  private async accountIsInScope(
    accountId: string,
    workspaceId: string,
    scope: BusinessUnitScopeClause,
  ): Promise<boolean> {
    if (!scope) return true
    const qb = this.accounts
      .createQueryBuilder('bu_acc')
      .where('bu_acc.id = :accountId', { accountId })
      // ⚠️ La borne d'ESPACE survit — la clause de périmètre s'AJOUTE.
      .andWhere('bu_acc.workspace_id = :workspaceId', { workspaceId })
    const clause = businessUnitScopeClause(scope, 'bu_acc.business_unit_id', ':...businessUnitIds')
    if (clause) {
      qb.andWhere(clause, scope.businessUnitIds.length ? { businessUnitIds: [...scope.businessUnitIds] } : {})
    }
    return (await qb.getCount()) > 0
  }

  /**
   * #2727 — « je tape un nom, je vois les homonymes, je choisis ». Pure
   * délégation à l'IA : aucune écriture, aucun crédit débité ici — le reveal
   * (`:id/enrich` ci-dessus) reste le geste payant et séparé, sur l'homonyme
   * CHOISI.
   *
   * #4386 — Découvrir passe par la CASCADE multi-sources (base de contacts →
   * registre des dirigeants → recherche web) : « Theo Haddad » + « Bellum »
   * rendait « Aucun homonyme » parce qu'une seule source était interrogée, une
   * seule fois.
   *
   * Espace de démonstration (craft rule n°9) : AUCUN appel fournisseur (le lien
   * de démo est envoyé à des inconnus) — la recherche porte sur les personnes
   * DU JEU DE DÉMO seedées dans l'espace, jamais sur un homonyme inventé.
   */
  async searchPeopleByName(
    userId: string,
    fullName: string,
    organizationName?: string,
  ): Promise<SearchPeopleByNameResult> {
    if (await this.isDemoWorkspace(userId)) {
      return this.searchPeopleByNameInDemo(userId, fullName, organizationName)
    }
    return this.ia.searchPersonByNameCascade({ fullName, organizationName })
  }

  /** Voir `searchPeopleByName` — jamais appelé hors espace de démonstration. */
  private async searchPeopleByNameInDemo(
    userId: string,
    fullName: string,
    organizationName?: string,
  ): Promise<SearchPeopleByNameResult> {
    if (!fullName.trim()) return searchDemoContactsByName([], fullName)
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.contacts.find({
      where: { deleted_at: IsNull(), hidden: false, ...workspaceScopeWhere(workspaceId) },
      select: ['id', 'full_name', 'title', 'linkedin_url', 'location', 'account_id'],
    })
    const accountIds = [...new Set(rows.map(row => row.account_id).filter((id): id is string => Boolean(id)))]
    const accounts = accountIds.length
      ? await this.accounts.find({ where: { id: In(accountIds) }, select: ['id', 'company_name'] })
      : []
    const companyById = new Map(accounts.map(account => [account.id, account.company_name]))
    return searchDemoContactsByName(
      rows.map(row => ({
        id: row.id,
        full_name: row.full_name ?? '',
        title: row.title ?? null,
        linkedin_url: row.linkedin_url ?? null,
        location: row.location ?? null,
        company: (row.account_id && companyById.get(row.account_id)) || null,
      })),
      fullName,
      organizationName,
    )
  }

  /**
   * #2120.48 — « Confronter avec mon CRM », sur le DERNIER INSTANTANÉ déjà en
   * base (décision Louis 18/09/2026). Aucun appel live : `crm_connections` dit
   * si un CRM est branché (tous fournisseurs confondus), et les contacts du
   * compte disent ce qu'un précédent rapprochement (`CrmSyncService`, ou une
   * fiche créée depuis le CRM, `source: 'crm'`) a déjà écrit.
   *
   * Une confrontation est une LECTURE : elle PROPOSE des paires CRM↔Bellum
   * probablement dupliquées (`findConfrontationPairs`), elle n'écrit jamais
   * rien — aucun champ n'est donc jamais écrasé, et une correction humaine
   * survit par construction, pas par un contrôle ajouté ici.
   */
  async crmConfrontation(
    accountId: string,
    userId: string,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<CrmConfrontationResult> {
    const empty: CrmConfrontationResult = { connected: false, snapshotAt: null, pairs: [] }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    // Même règle que `findByAccount` : hors périmètre, une réponse VIDE — pas
    // un refus, qui confirmerait que le compte existe.
    if (!(await this.accountIsInScope(accountId, workspaceId, businessUnitScope))) {
      return empty
    }
    const connection = this.crmConnections
      ? await this.crmConnections.findOne({ where: { workspace_id: workspaceId } })
      : null

    const rows = await this.contacts.find({
      where: {
        account_id: accountId,
        deleted_at: IsNull(),
        hidden: false,
        ...workspaceScopeWhere(workspaceId),
      },
      select: ['id', 'full_name', 'email', 'source', 'crm_synced_at'],
    })

    let snapshotAt: string | null = null
    const crmContacts: CrmConfrontationContact[] = []
    const bellumContacts: CrmConfrontationContact[] = []
    for (const row of rows) {
      if (row.crm_synced_at) {
        const iso = row.crm_synced_at.toISOString()
        if (!snapshotAt || iso > snapshotAt) snapshotAt = iso
      }
      const view: CrmConfrontationContact = { id: row.id, fullName: row.full_name, email: row.email }
      // #4680 — un contact venu d'un import est du côté CRM, comme une ligne du CRM branché (`isKnownContactSource`).
      if (isKnownContactSource(row.source)) crmContacts.push(view)
      else bellumContacts.push(view)
    }

    if (connection) {
      return { connected: true, snapshotAt, pairs: findConfrontationPairs(crmContacts, bellumContacts) }
    }
    // #4680 — AUCUN connecteur, mais un instantané IMPORTÉ est déjà en base : on confronte CET instantané et on dit
    // sa date (celle de l'import, `record_import_marks`), ou rien — jamais une date devinée. Ni connecteur ni
    // contact importé : la réponse vide d'avant, mot pour mot. `connected` reste faux : aucun CRM n'est branché.
    if (crmContacts.length === 0) return empty
    const importedAt = await this.importedAtOf(
      workspaceId,
      rows.filter(row => isKnownContactSource(row.source)).map(row => row.id),
    )
    return {
      connected: false,
      imported: true,
      snapshotAt: importedAt ?? snapshotAt,
      pairs: findConfrontationPairs(crmContacts, bellumContacts),
    }
  }

  /** #4680 — la date de l'import le plus récent parmi ces contacts (`record_import_marks`) ; `null` si aucune trace. */
  private async importedAtOf(workspaceId: string, contactIds: readonly string[]): Promise<string | null> {
    if (contactIds.length === 0) return null
    const rows = (await this.contacts.manager.query(
      `SELECT MAX(imported_at) AS imported_at FROM record_import_marks
        WHERE workspace_id = $1 AND entity_type = 'contact' AND entity_id = ANY($2::uuid[])`,
      [workspaceId, contactIds],
    )) as Array<{ imported_at: Date | string | null }>
    const value = rows?.[0]?.imported_at
    if (!value) return null
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  /**
   * #4114 — « ces deux fiches sont-elles la même personne ? » sur un compte.
   *
   * LECTURE PURE : `proposeContactDuplicates` PROPOSE des paires avec leurs
   * raisons, ce service ne fusionne ni n'écrit rien — l'humain tranche (doctrine
   * « on propose, on ne fusionne jamais »). Mêmes bornes que `crmConfrontation` :
   * hors périmètre BU, réponse vide, jamais un refus. Les coordonnées sont rendues
   * en clair. Aucun mécanisme de refus de paire de contacts n'existe encore : rien
   * n'est donc filtré ici (option conservatrice — une paire refusée sera reproposée
   * tant qu'une table de refus n'existe pas ; voir `rejectedPairs`).
   */
  async duplicateProposals(
    accountId: string,
    userId: string,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<{ pairs: DuplicateProposalView[]; shared_email_groups: SharedEmailGroupView[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    if (!(await this.accountIsInScope(accountId, workspaceId, businessUnitScope))) {
      return { pairs: [], shared_email_groups: [] }
    }
    const rows = await this.contacts.find({
      where: { account_id: accountId, deleted_at: IsNull(), hidden: false, ...workspaceScopeWhere(workspaceId) },
      select: ['id', 'account_id', 'full_name', 'email', 'email_verified', 'phone', 'linkedin_url', 'title'],
    })
    const byId = new Map(rows.map(row => [row.id, row]))
    const view = (id: string): DuplicateContactView => {
      const row = byId.get(id)
      return {
        id,
        fullName: row?.full_name ?? null,
        email: row?.email ?? null,
        phone: row?.phone ?? null,
        title: row?.title ?? null,
      }
    }
    const candidates = rows.map(row => ({
      id: row.id,
      accountId: row.account_id,
      fullName: row.full_name,
      email: row.email,
      emailVerified: row.email_verified,
      phone: row.phone,
      linkedinUrl: row.linkedin_url,
      title: row.title,
    }))
    const proposals = proposeContactDuplicates(candidates)
    return {
      shared_email_groups: findSharedEmailGroups(candidates).map(group => ({
        email: group.email,
        reason: group.reason,
        contacts: group.contactIds.map(view),
      })),
      pairs: proposals.map((p: ContactDuplicateProposal) => ({
        left: view(p.leftId),
        right: view(p.rightId),
        score: p.score,
        reasons: p.reasons,
      })),
    }
  }

  /**
   * Follow the merge log from an id that no longer exists to the row that
   * absorbed it. Merges can chain (A→B, then B→C), so this walks rather than
   * doing one hop; the cap stops a cycle (which a correct merge cannot create,
   * but a bad backfill could) from spinning forever.
   */
  private async resolveMergedContactId(id: string): Promise<string | null> {
    let current = id
    for (let hop = 0; hop < MAX_MERGE_HOPS; hop++) {
      const alias = await this.merges.findOne({ where: { loser_id: current } })
      if (!alias) return hop === 0 ? null : current
      current = alias.winner_id
    }
    this.logger.warn(`resolveMergedContactId: chaîne de fusion trop longue depuis ${id}`)
    return current
  }

  // ── Contact lifecycle persistence (P0 « états + providers ») ────────────────
  // The state machine (détecté → identité vérifiée → qualifié → enrichi →
  // actionnable) is COMPUTED by the single canonical `computeContactLifecycleState`
  // (packages/contracts) — we never duplicate that logic here, we only persist its
  // result and journal each passage (source + real date).

  /**
   * Adapt a contact row to the contracts lifecycle input shape.
   *
   * #2296.5 à .11, .29 — `employerMismatch` (le signal qui fait basculer l'état
   * TERMINAL `historique`, `computeContactLifecycleState`) n'était JAMAIS
   * alimenté ici : la colonne persistée `lifecycle_state` ne pouvait donc
   * jamais s'écrire `historique` — seul le badge `RISQUE` (calculé à la
   * LECTURE, `contactSourceTag`) le montrait, sans jamais le PERSISTER. Même
   * calcul que le badge et le score (déjà la règle ailleurs dans ce fichier,
   * ligne ~1902) : un contact sans compte connu (`companyName` absent) ne
   * peut pas être comparé, et ne bascule donc jamais historique par ce biais
   * — pas de donnée inventée sur un signal qu'on n'a pas.
   */
  private lifecycleInput(
    c: ContactEntity,
    companyName?: string | null,
  ): Parameters<typeof computeContactLifecycleState>[0] {
    const apolloDetails = ((c.raw_data ?? {}) as { apolloDetails?: ContactApolloDetails }).apolloDetails ?? null
    return {
      fullName: c.full_name,
      title: c.title,
      entity: c.entity,
      role: c.decision_role,
      email: c.email,
      emailVerified: c.email_verified,
      phone: c.phone,
      linkedinUrl: c.linkedin_url,
      source: c.source,
      employerMismatch: companyName
        ? contactSourceTag(c.source ?? null, apolloDetails, companyName, c.entity ?? null) === 'RISQUE'
        : undefined,
    }
  }

  /** The canonical lifecycle state for a row (single source of truth). */
  private computeLifecycle(c: ContactEntity, companyName?: string | null): ContactLifecycleState {
    return computeContactLifecycleState(this.lifecycleInput(c, companyName))
  }

  /**
   * Recompute the contact's lifecycle state from its current fields and, when it
   * changed (or was never set), persist the new state AND append an immutable
   * transition row (from → to, source, real now() date). Mutates `contact` in
   * place so callers keep a consistent view. The state UPDATE is awaited
   * (reliable — the mission requires it); the journal INSERT is best-effort (a
   * log failure must never block enrichment). Returns the resulting state.
   *
   * #2296.31 — une transition VERS `historique` (l'employeur détecté ne
   * correspond plus au compte) arrête aussi les séquences outreach actives/en
   * pause de ce contact, cause `company_changed` (#2381, enum déjà réservée à
   * cet effet dans `outreach-sequence-events.ts` — jamais appelée jusqu'ici,
   * mesuré au grep). Même geste, même raison que `autoStopOutreachSequences`
   * sur réponse/rebond : `assertNotHistoricalContact` (`outreach.service.ts`)
   * ne fait que REFUSER de prolonger une séquence déjà arrêtée — sans cet
   * appel, une séquence restait `active` en base tout en étant bloquée à
   * chaque étape suivante, ce qui n'est pas la même chose qu'arrêtée.
   */
  private async syncContactLifecycle(
    contact: ContactEntity,
    opts: { source?: string | null; actor?: string | null; companyName?: string | null } = {},
    manager?: EntityManager,
  ): Promise<ContactLifecycleState> {
    const next = this.computeLifecycle(contact, opts.companyName)
    const prev = (contact.lifecycle_state as ContactLifecycleState | null) ?? null
    if (prev === next) return next

    const repo = manager ? manager.getRepository(ContactEntity) : this.contacts
    await repo.update(contact.id, { lifecycle_state: next })
    contact.lifecycle_state = next

    await this.journalTransition(
      { contactId: contact.id, from: prev, to: next, source: opts.source ?? contact.source, actor: opts.actor ?? null },
      manager,
    )
    // `prev !== next` est déjà garanti par le retour anticipé ci-dessus : si
    // `next` vaut `historique`, `prev` ne le valait pas déjà.
    if (next === 'historique') {
      await this.autoStopOutreachSequences(contact.id, contact.user_id, 'company_changed')
    }
    return next
  }

  /**
   * Best-effort append to the lifecycle journal. `source` is normalised to a
   * known provider so the column stays within `contactSource`. A failure here is
   * swallowed (logged) — the state UPDATE already committed the important part.
   */
  private async journalTransition(
    t: {
      contactId: string
      from: ContactLifecycleState | null
      to: ContactLifecycleState
      source: string | null
      actor: string | null
    },
    manager?: EntityManager,
  ): Promise<void> {
    try {
      const repo = manager ? manager.getRepository(ContactLifecycleTransitionEntity) : this.lifecycleTransitions
      await repo.insert({
        contact_id: t.contactId,
        from_state: t.from,
        to_state: t.to,
        // `occurred_at` is left to the DB default (now()) — the real transition time.
        source: t.source ? normaliseSource(t.source) : null,
        actor: t.actor,
      })
    } catch (cause) {
      this.logger.warn('contact lifecycle journal failed (state already persisted)', {
        error: cause instanceof Error ? cause.message : String(cause),
        tags: { contactId: t.contactId, to: t.to },
      })
    }
  }

  /**
   * Journal the initial "detection" passage (from_state null → computed state)
   * for a batch of freshly-created contacts. Their `lifecycle_state` is already
   * set inline on insert, so this only appends the journal rows. Best-effort in
   * one insert; uses the caller's `manager` so the FK sees the just-inserted
   * (same-tx) contacts.
   */
  private async journalInitialTransitions(rows: ContactEntity[], manager?: EntityManager): Promise<void> {
    if (rows.length === 0) return
    try {
      const repo = manager ? manager.getRepository(ContactLifecycleTransitionEntity) : this.lifecycleTransitions
      await repo.insert(
        rows.map(c => ({
          contact_id: c.id,
          from_state: null,
          to_state: (c.lifecycle_state as ContactLifecycleState | null) ?? this.computeLifecycle(c),
          source: c.source ? normaliseSource(c.source) : null,
          actor: c.user_id ?? null,
        })),
      )
    } catch (cause) {
      this.logger.warn('contact lifecycle initial journal failed (states already persisted)', {
        error: cause instanceof Error ? cause.message : String(cause),
        tags: { count: rows.length },
      })
    }
  }

  /**
   * The contact's current persisted lifecycle state + its full transition history
   * (chronological). Workspace-scoped read (like {@link findOne}). Falls back to
   * the deterministic computation for a row that predates the backfill.
   */
  async getLifecycleHistory(
    id: string,
    userId: string,
    /** Le périmètre (BU) de l'appelant, RÉSOLU PAR LE CONTRÔLEUR. `null` = tout
     *  l'espace : c'est le défaut historique, et le chemin des appelants
     *  internes (pipeline d'analyse, tableau de bord) reste byte-identique. */
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<Result<ContactLifecycleHistory, ContactFailure>> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const row = await this.contacts.findOne({
      where: {
        id,
        deleted_at: IsNull(),
        ...workspaceScopeWhere(workspaceId),
        // Le périmètre du COMPTE de ce contact — revue sécurité 15/09/2026.
        ...this.contactBusinessUnitWhere(businessUnitScope),
      },
    })
    if (!row) {
      return failure({ code: 'not_found', message: `Contact ${id} introuvable` })
    }
    const rows = await this.lifecycleTransitions.find({
      where: { contact_id: id },
      order: { occurred_at: 'ASC' },
    })
    const transitions: ContactLifecycleTransition[] = rows.map(t => ({
      id: t.id,
      contact_id: t.contact_id,
      from_state: (t.from_state as ContactLifecycleState | null) ?? null,
      to_state: t.to_state as ContactLifecycleState,
      source: t.source as ContactLifecycleTransition['source'],
      occurred_at: t.occurred_at.toISOString(),
      actor: t.actor,
    }))
    const state = (row.lifecycle_state as ContactLifecycleState | null) ?? this.computeLifecycle(row)
    return success({ contact_id: id, state, transitions })
  }

  /**
   * #3712 — les dossiers associés à la personne (compte, entité, projets,
   * besoins, missions), par identité d'objet. Lecture de l'espace actif, avec le
   * même périmètre (BU) que la fiche : un contact que l'appelant ne peut pas
   * ouvrir n'expose aucun de ses dossiers.
   */
  async getAssociations(
    id: string,
    userId: string,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<Result<ContactAssociations, ContactFailure>> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const row = await this.contacts.findOne({
      where: {
        id,
        deleted_at: IsNull(),
        ...workspaceScopeWhere(workspaceId),
        ...this.contactBusinessUnitWhere(businessUnitScope),
      },
    })
    if (!row) {
      return failure({ code: 'not_found', message: `Contact ${id} introuvable` })
    }
    // #4158.34 — un objet privé ne se voit que par son porteur ou qui gère l'équipe.
    const viewer = { userId, canSeePrivate: hasPermission(role, 'team:manage') }
    return success(await loadContactAssociations(this.contacts.manager, row, workspaceId, viewer))
  }

  /** #3719.4 — où et quand cette personne a été exportée (survit au rechargement). */
  async getCrmExports(
    id: string,
    userId: string,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<Result<ContactCrmExports, ContactFailure>> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const row = await this.findScopedContact(id, workspaceId, businessUnitScope)
    if (!row) return failure({ code: 'not_found', message: `Contact ${id} introuvable` })
    return success({ contact_id: id, items: await loadContactCrmExports(this.contacts.manager, id, workspaceId) })
  }

  /** #3719.4 — consigne un export RÉUSSI (une ligne par contact et destination). */
  async recordCrmExport(
    id: string,
    userId: string,
    provider: string,
    body: RecordContactCrmExport,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<Result<ContactCrmExports, ContactFailure>> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const row = await this.findScopedContact(id, workspaceId, businessUnitScope)
    if (!row) return failure({ code: 'not_found', message: `Contact ${id} introuvable` })
    await recordContactCrmExport(this.contacts.manager, { contactId: id, workspaceId, userId, provider, ...body })
    return success({ contact_id: id, items: await loadContactCrmExports(this.contacts.manager, id, workspaceId) })
  }

  /** #3694.7 — le brief confirmé et le fil qui le porte, relus à la réouverture (y compris après rechargement). */
  async getEngagementDraft(
    id: string,
    userId: string,
    channel: EngagementDraftChannel,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<Result<EngagementDraftSnapshot | null, ContactFailure>> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const row = await this.findScopedContact(id, workspaceId, businessUnitScope)
    if (!row) return failure({ code: 'not_found', message: `Contact ${id} introuvable` })
    return success(await loadEngagementDraft(this.contacts.manager, { contactId: id, workspaceId, userId, channel }))
  }

  /** #3694.7 — enregistre le cliché courant (fil, contexte, paramètres) : pas un historique, l'état du brouillon. */
  async putEngagementDraft(
    id: string,
    userId: string,
    channel: EngagementDraftChannel,
    snapshot: EngagementDraftSnapshot,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<Result<null, ContactFailure>> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const row = await this.findScopedContact(id, workspaceId, businessUnitScope)
    if (!row) return failure({ code: 'not_found', message: `Contact ${id} introuvable` })
    await saveEngagementDraft(this.contacts.manager, { contactId: id, workspaceId, userId, channel, ...snapshot })
    return success(null)
  }

  private findScopedContact(id: string, workspaceId: string, businessUnitScope: BusinessUnitScopeClause) {
    return this.contacts.findOne({
      where: {
        id,
        deleted_at: IsNull(),
        ...workspaceScopeWhere(workspaceId),
        ...this.contactBusinessUnitWhere(businessUnitScope),
      },
    })
  }

  /**
   * #3219 (#190.2 côté CONTACT, décision Louis 11/10/2026) — LE CONTRÔLE AVANT
   * ACTION : avant de préparer un message, d'ajouter à une séquence ou
   * d'exporter vers le CRM, ce qui diffère selon la source ou le périmètre.
   *
   * Une LECTURE, qui ne tranche rien (`compileContactPreflight`). Les
   * contradictions viennent du MÊME `FieldConflictService` que la fiche compte,
   * passé par l'appelant (`readConflicts`) : ce service n'importe pas celui de
   * `crm-core` (GA-07) — les deux contrôleurs qui l'exposent (écran, pont de
   * Laura) l'ont déjà en main. Chaque lecture qui échoue devient une section
   * NOMMÉE comme illisible, jamais « rien à signaler ».
   */
  async preflight(
    id: string,
    userId: string,
    options: {
      action: ContactPreflightAction | null
      readConflicts: (workspaceId: string, contactId: string) => Promise<readonly ConflictedField[]>
      businessUnitScope?: BusinessUnitScopeClause
    },
  ): Promise<Result<ContactPreflight, ContactFailure>> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const row = await this.findScopedContact(id, workspaceId, options.businessUnitScope ?? null)
    if (!row) return failure({ code: 'not_found', message: `Contact ${id} introuvable` })

    const [conflicts, accountPart, fieldSources] = await Promise.all([
      options.readConflicts(workspaceId, row.id).catch((error: unknown) => {
        this.logger.error('preflight: journal des champs illisible', { error })
        return null
      }),
      this.preflightAccountPart(row.account_id, workspaceId).catch((error: unknown) => {
        this.logger.error('preflight: compte illisible', { error })
        return null
      }),
      (this.provenance?.currentSources('contact', row.id) ?? Promise.resolve({})).catch(
        (): Partial<Record<string, FieldSource>> => ({}),
      ),
    ])

    const facts = contactPreflightFacts({
      contact: row,
      account: accountPart?.account ?? null,
      accountContacts: accountPart?.contacts ?? [],
      flaggedIncorrectContactIds: accountPart?.flagged ?? new Set(),
      fieldSources,
    })
    return success(
      compileContactPreflight({
        contactId: row.id,
        action: options.action,
        conflicts,
        ...facts,
        // Un compte rattaché mais illisible n'est jamais « sans compte ».
        ...(row.account_id && !accountPart ? { accountScope: { state: 'unknown', reason: 'unreadable' } } : {}),
      }),
    )
  }

  /** Le compte du contact et ses contacts (homonymes), bornés à l'espace — les
   *  mêmes entrées que la porte d'éligibilité de `rankForAccount`. */
  private async preflightAccountPart(accountId: string | null, workspaceId: string) {
    if (!accountId) return { account: null, contacts: [] as ContactEntity[], flagged: new Set<string>() }
    const [account, contacts, flagged] = await Promise.all([
      this.accounts.findOne({ where: { id: accountId, ...workspaceScopeWhere(workspaceId) } }),
      this.contacts.find({
        where: { account_id: accountId, deleted_at: IsNull(), ...workspaceScopeWhere(workspaceId) },
      }),
      this.outcomes?.incorrectContactIds(workspaceId),
    ])
    return {
      account: account
        ? {
            company_name: account.company_name ?? null,
            raw_analysis: (account.raw_analysis ?? null) as Record<string, unknown> | null,
          }
        : null,
      contacts,
      flagged: flagged ?? new Set<string>(),
    }
  }

  /** Stamp each contact with the deterministic Contact Priority Score /100
   *  (Théo 03_BUSINESS_RULES §3, `computeContactScore`) — rôle décisionnel /30 +
   *  proximité périmètre /20 + hiérarchie /15 + accès/source /15 + fit angle /10
   *  + fraîcheur /10. The proximité + fit-angle context comes from the account's
   *  `raw_analysis` (loaded once per account), so a P1-perimeter decision-maker
   *  outscores a secondary or out-of-sector contact — identical to the operator
   *  telemetry view. Overwrites the legacy null `contact_score` column.
   *
   *  The BREAKDOWN travels with the score. Before, only the number did, and the web
   *  re-derived its own explanation from the contact row alone — which has neither
   *  the perimeter tier nor the angles — so the fiche showed a header score and a
   *  "6 criteria" card that disagreed (79 vs 69: the card scored proximité as
   *  "périmètre non rattaché" 10/20 on a contact the server had placed in P1 at
   *  20/20). One computation, one number, one explanation. */
  private async scoreContacts<T extends ContactEntity>(
    rows: T[],
    accountId: string | null,
    /** Lot 758 — l'offre déclarée de l'ESN (`sellerScoringContextFrom`) ; absente ⇒ la grille d'avant. */
    seller?: SellerScoringContext,
  ): Promise<T[]> {
    if (rows.length === 0) return rows
    // #1473 — un contact à qualifier n'a pas de compte d'où tirer le contexte de
    // score. `null` produit le MÊME contexte qu'un compte illisible (analyse
    // vide, nom vide) : le score reste décomposé, et les axes qui dépendent du
    // compte sortent en « non évalué » plutôt que de compter zéro.
    // #2671.5 — le compte se lit SOUS la borne d'espace des contacts à scorer.
    // Les deux appelants (`findByAccount`, `findOne`) ont lu ces lignes sous
    // `workspaceScopeWhere` : leur `workspace_id` EST l'espace de l'appelant, et
    // un `account_id` pointant un autre espace ne prête plus sa cartographie.
    const account = accountId
      ? await this.accounts.findOne({
          where: { id: accountId, workspace_id: rows[0]?.workspace_id ?? IsNull() },
        })
      : null
    const rawAnalysis = (account?.raw_analysis ?? null) as Record<string, unknown> | null
    const ctx = buildContactScoreContext(rawAnalysis, account?.company_name ?? '')
    // #4016 L4.1 — les adresses ESTIMÉES de ce lot, en une requête : chaque
    // écran qui montre l'adresse doit pouvoir la badger « estimé ».
    const estimatedEmails = this.provenance
      ? await this.provenance.estimatedAmong(
          'contact',
          rows.filter(row => row.email).map(row => row.id),
          'email',
        )
      : new Map<string, string>()
    return rows.map(row => {
      const input = buildContactScoreInput(row, ctx)
      return {
        ...row,
        // #4586 — jumeau de la liste paginée : même lecture, même règle.
        full_name: displayedContactName(row.full_name, row.email),
        email: displayedContactEmail(row.email),
        email_estimated_at: estimatedEmails.get(row.id) ?? null,
        // Lot 758 — la PERTINENCE, jugée contre l'offre de l'ESN ; la joignabilité n'y entre plus.
        contact_score: computeContactScore(input, seller),
        contact_score_breakdown: computeContactScoreBreakdown(input, seller),
        contact_reachability: computeContactReachability({
          email: row.email,
          emailVerified: row.email_verified,
          phone: row.phone,
          linkedinUrl: row.linkedin_url,
        }),
        // L'étiquette de source voyage avec le score, et pour la même raison :
        // le calcul de `RISQUE` existait depuis longtemps et n'atteignait que
        // le back-office. Le commercial voyait un contact ordinaire et lui
        // écrivait, alors que l'employeur détecté disait qu'il était parti.
        source_tag: sourceTagForRow(row, ctx),
      }
    })
  }

  /** La ligne telle que `scoreContacts` la rend : `ContactEntity` + les trois
   *  champs qu'elle calcule à la lecture (score /100, sa décomposition,
   *  l'étiquette de source). `ContactEntity` seul ne le dit pas — cette
   *  annotation corrige la déclaration sans changer une ligne de logique. */
  async findByAccount(
    accountId: string,
    userId: string,
    /** Le périmètre (BU) de l'appelant, RÉSOLU PAR LE CONTRÔLEUR. `null` = tout
     *  l'espace : c'est le défaut historique, et le chemin des appelants
     *  internes (pipeline d'analyse, tableau de bord) reste byte-identique. */
    businessUnitScope: BusinessUnitScopeClause = null,
    /** `scored: false` (P5, 29/09) — pour l'appelant qui n'utilise NI le score
     *  NI sa décomposition (le planificateur d'enrichissement) : saute la relecture
     *  du compte et le calcul. Même tri, mêmes lignes ; les trois champs calculés
     *  sont alors ABSENTS (jamais un score inventé). Défaut : scoré, comme avant. */
    options: { scored?: boolean } = {},
  ): Promise<ScoredContactEntity[]> {
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      // ⚠️ Le PÉRIMÈTRE du compte, pas seulement son espace — revue sécurité
      // 15/09/2026. Un dossier de compte cloisonné dont les contacts ne le sont
      // pas ne cloisonne rien. Hors périmètre : la liste est VIDE, jamais un
      // refus — un refus confirmerait que ce compte existe.
      if (!(await this.accountIsInScope(accountId, workspaceId, businessUnitScope))) {
        return []
      }
      const rows = await this.contacts.find({
        where: { account_id: accountId, deleted_at: IsNull(), ...workspaceScopeWhere(workspaceId) },
        order: { priority: 'ASC' },
      })
      const scored =
        options.scored === false ? rows : await this.scoreContacts(rows, accountId, await this.sellerScoringOf(userId))
      // Une identité INCOMPLÈTE ne passe plus devant une fiche exploitable.
      // Mesuré sur un run réel : les douze premiers contacts d'un dossier
      // étaient des prénoms seuls (« Willy — Chief Information Officer »), parce
      // que le tri lisait la priorité et le score sans jamais regarder si le nom
      // permettait d'agir. On ne les CACHE pas — ils restent au dossier, plus
      // bas — parce qu'un prénom + un titre reste une piste, juste pas la
      // première chose à montrer.
      return sortByUsableIdentity(scored) as ScoredContactEntity[]
    } catch (err) {
      this.logger.error('findByAccount error', { error: err })
      return []
    }
  }

  /**
   * `GET /contacts/account/:id` — LOT 4 (perf), mesuré en prod le 12/09/2026 :
   * cette route rendait la sortie COMPLÈTE de {@link findByAccount} — 59 champs
   * par contact, 4,1 Mo décompressés sur 2 027 contacts (THALES) — alors que
   * l'onglet Contacts, la mémoire de relation, le brief de réunion et l'export
   * PDF n'en lisent qu'une quinzaine (recette du lot, tableau champ par champ).
   *
   * `findByAccount` reste elle-même INCHANGÉE : 8 appelants internes (analyse,
   * contexte du chat, MCP, export de documents) en ont besoin en entier. Cette
   * méthode ne fait QUE projeter sa sortie pour LE FIL HTTP — retirer un champ
   * ici ne retire rien pour ces appelants. Voir {@link toAccountContactView}
   * pour le détail des six champs retirés et la raison de chacun.
   */
  async findByAccountForHttp(
    accountId: string,
    userId: string,
    /** Le périmètre (BU) de l'appelant, RÉSOLU PAR LE CONTRÔLEUR. `null` = tout
     *  l'espace : c'est le défaut historique, et le chemin des appelants
     *  internes (pipeline d'analyse, tableau de bord) reste byte-identique. */
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<AccountContactView[]> {
    const rows = await this.findByAccount(accountId, userId, businessUnitScope)
    // #4465.2 — l'employeur du compte : « a quitté » se lit sur l'expérience qui y est terminée.
    // #2671.5 — sous la borne d'espace des lignes déjà lues (leur `workspace_id` EST celui de l'appelant).
    const account =
      rows.length > 0
        ? await this.accounts.findOne({
            where: { id: accountId, workspace_id: rows[0]?.workspace_id ?? IsNull() },
            select: ['id', 'company_name'],
          })
        : null
    return rows.map(row => toAccountContactView(row, account?.company_name ?? null))
  }

  /**
   * #4996 L4 — `GET /contacts/account/:id?perimeter=mine|all`. La liste HTTP du compte, filtrée (`mine`) ou
   * ordonnée « ma zone d'abord » (`all`) par les zones D'ENTITÉ du LECTEUR sur ce compte (`account_team_scopes`,
   * bornées à son espace, zones archivées et texte libre exclus : le texte libre ne filtre jamais). Sans zone :
   * aucun filtre, aucun compteur. Lecture seule : le périmètre ne borne aucun geste (c76).
   */
  async findByAccountInPerimeter(
    accountId: string,
    userId: string,
    mode: ContactPerimeter,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<AccountContactsPerimeterResponse<AccountContactView>> {
    const rows = await this.findByAccountForHttp(accountId, userId, businessUnitScope)
    // Liste vide = compte hors périmètre ou sans contact : aucune zone à lire, rien à compter.
    if (rows.length === 0) return { contacts: [], outside_perimeter_count: null }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const [zones, defaults] = await Promise.all([
      this.contacts.manager.query(
        `SELECT DISTINCT entity_id FROM account_team_scopes
          WHERE workspace_id = $1 AND account_id = $2 AND user_id = $3 AND removed_at IS NULL AND entity_id IS NOT NULL`,
        [workspaceId, accountId, userId],
      ) as Promise<Array<{ entity_id: string }>>,
      this.contacts.manager.query(`SELECT id FROM account_entities WHERE account_id = $1 AND is_default = true`, [
        accountId,
      ]) as Promise<Array<{ id: string }>>,
    ])
    return applyContactPerimeter(rows, {
      mode,
      zoneEntityIds: zones.map(zone => zone.entity_id),
      defaultEntityIds: defaults.map(entity => entity.id),
    })
  }

  /**
   * #2120.30-38 / #2295.2-.5 — `GET /contacts/account/:id/ranking`. Le chemin
   * recommandé : une porte d'éligibilité ({@link filterEligibleContacts},
   * #2295.3) PUIS le noyau pur {@link rankAccountContacts} sur les contacts qui
   * l'ont passée.
   *
   * Portée : les contacts de l'ESPACE actif. Le compte n'est lu qu'une fois ces
   * lignes trouvées — un compte hors de l'espace ne prête jamais sa cartographie.
   * Un contact écarté (permission), hors entité, ou homonyme non résolu n'est
   * pas recommandé : il reste au dossier, et `excluded` dit pourquoi.
   */
  async rankForAccount(
    accountId: string,
    userId: string,
    params: ContactRankingParams,
    /** Le périmètre (BU) de l'appelant, RÉSOLU PAR LE CONTRÔLEUR. */
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<ContactRankingResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    // PERF (P5, 29/09 — `ranking` mesuré à 4,9 s) : la garde de périmètre, les
    // contacts et les fiches « contact incorrect » sont trois lectures
    // INDÉPENDANTES qui s'enchaînaient avec la lecture du compte (4 aller-retours
    // en série). Les trois premières partent ensemble ; le compte ne se lit
    // TOUJOURS que s'il y a des contacts (sa cartographie ne fuit pas). Hors
    // périmètre, le classement reste VIDE, comme avant.
    const [inScope, allRows, flagged, targetPersonas, accessStatus, profile] = await Promise.all([
      // ⚠️ Même garde que `findByAccount` (revue sécurité 15/09/2026) : le
      // classement des contacts d'un compte hors périmètre est un classement vide.
      this.accountIsInScope(accountId, workspaceId, businessUnitScope),
      this.contacts.find({
        where: { account_id: accountId, deleted_at: IsNull(), ...workspaceScopeWhere(workspaceId) },
      }),
      // #2126.56/.58 — les fiches marquées `incorrect_contact` sortent du
      // classement (et donc des recommandations) avant l'éligibilité. `?? new
      // Set()` : sans le service (specs qui construisent directement), aucune
      // exclusion supplémentaire — comportement identique à avant #2787.
      this.outcomes?.incorrectContactIds(workspaceId),
      this.loadTargetPersonas(workspaceId),
      this.loadAccessStatus(workspaceId, accountId),
      this.profileDataOf(userId),
    ])
    // LUDOVIC-C LC.1 — pack + zones du profil ; lot 758 — et son offre déclarée.
    const profileFocus = sellerFocusFrom(profile)
    const rows = inScope ? allRows : []
    // #2671.5 — lecture du compte bornée à l'espace actif, comme ses contacts.
    const account =
      rows.length > 0
        ? await this.accounts.findOne({ where: { id: accountId, ...workspaceScopeWhere(workspaceId) } })
        : null
    const rawAnalysis = (account?.raw_analysis ?? null) as Record<string, unknown> | null
    // #4984.1 — le niveau ciblé suit la taille du compte (effectif inconnu : l'ordre d'avant). Ordre seulement.
    const sellerFocus = withAccountSize(profileFocus, account?.employees)
    const flaggedIncorrectContactIds = flagged ?? new Set<string>()
    // #2295.3 — l'éligibilité se décide avant le rang.
    const { eligible: eligibleAll, excluded } = filterEligibleContacts(rows, rawAnalysis, flaggedIncorrectContactIds)
    // Une même personne PROBABLE (groupe de doublon proposé, refus humain respecté) ne fait qu'UNE carte du chemin :
    // la fiche la plus complète. Rien n'est fusionné ni supprimé — les autres fiches restent dans l'onglet Contacts.
    const rejectedPairs = await this.duplicateDecisionsReader?.rejectedPairKeys(workspaceId, accountId)
    const duplicateHidden = duplicateIdsToHideFromPath(eligibleAll, rejectedPairs)
    const eligible = duplicateHidden.size > 0 ? eligibleAll.filter(row => !duplicateHidden.has(row.id)) : eligibleAll
    // #4271 — le statut d'accès réordonne le chemin (jamais le contenu).
    // LUDOVIC-C LC.1 — la zone et les métiers du profil passent devant, existants inclus.
    // Lot 758 — sans offre CHOISIE, l'axe `offer` lit l'offre DÉCLARÉE de l'ESN (jamais devinée).
    const ranking = rankAccountContacts(
      eligible,
      rawAnalysis,
      { ...params, profileOfferTokens: profileOfferTokens(profile) },
      undefined,
      targetPersonas,
      accessStatus,
      sellerFocusTiers(eligible, sellerFocus),
    )
    // #3282.19 — la prochaine action planifiée, jointe PAR IDENTIFIANT de contact (jamais par nom).
    const rankedIds = ranking.ranked.map(item => item.contact_id)
    const zoneByContact = new Map(eligible.map(row => [row.id, contactZoneStatus(row, sellerFocus)] as const))
    // #3282 — la date se lit sur TOUS les contacts éligibles (une requête) : `ranked` n'en rend que dix.
    const nextDue = await this.nextActionDueByContact(eligible.map(row => row.id))
    const rankedSet = new Set(rankedIds)
    const scheduledOutsidePath = [...nextDue.entries()]
      .filter(([contactId]) => !rankedSet.has(contactId))
      .map(([contact_id, next_action_due_date]) => ({ contact_id, next_action_due_date }))
    // #3282 — la dernière action : e-mail envoyé OU geste du journal, le plus récent.
    const lastGesture = await this.lastGestureByContact(rankedIds)
    return {
      ...ranking,
      ranked: ranking.ranked.map(item => ({
        ...item,
        // #4432.4 — la zone du profil nommée sur le contact (`null` : aucune zone déclarée).
        zone_status: zoneByContact.get(item.contact_id) ?? null,
        // #4556.4 — la zone NOMMÉE (jamais « Hors zone » sans dire de quoi) ; `null` = aucune zone nommable.
        zone_label: sellerFocus?.zoneLabel ?? null,
        next_action_due_date: nextDue.get(item.contact_id) ?? null,
        last_action_at: latestIso(item.last_interaction_at, lastGesture.get(item.contact_id) ?? null),
      })),
      scheduled_actions: scheduledOutsidePath,
      excluded,
      // #4984.2 — le palier qui a servi à l'ordre, lu par l'écran (jamais recodé côté web).
      ...accountSizeField(account?.employees),
    }
  }

  /**
   * #2545 / #2546 / #3819 (démo Ludovic 08/10) — `POST /contacts/call-list`. Pour
   * les entreprises d'une recherche Découvrir : le compte de l'espace qui
   * correspond (id, SIREN, nom), ses dix contacts CLASSÉS par le même noyau que
   * le chemin recommandé (coordonnées en clair), et ses signaux historisés
   * datés. La source UNIQUE de l'onglet Contacts et de la liste d'appels —
   * avant, les deux joignaient les 50 DERNIERS contacts de l'espace.
   * Lecture seule, aucun crédit ; bornée à l'espace ET au périmètre (BU) : un
   * compte hors périmètre ne correspond à rien. Noyau pur : `contact-call-list.ts`.
   */
  async callList(
    userId: string,
    request: DiscoverCallListRequest,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<DiscoverCallListResponse> {
    if (request.companies.length === 0) return { companies: [] }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const accountsQb = this.accounts
      .createQueryBuilder('cl_acc')
      .select(['cl_acc.id', 'cl_acc.siren', 'cl_acc.company_name'])
      .where('cl_acc.workspace_id = :workspaceId', { workspaceId })
    const buClause = businessUnitScopeClause(businessUnitScope, 'cl_acc.business_unit_id', ':...businessUnitIds')
    if (buClause && businessUnitScope) {
      accountsQb.andWhere(
        buClause,
        businessUnitScope.businessUnitIds.length ? { businessUnitIds: [...businessUnitScope.businessUnitIds] } : {},
      )
    }
    const accounts = (await accountsQb.getMany()) ?? []
    const matched = matchCallListAccounts(request.companies, accounts)
    const accountIds = [...new Set(matched.values())]
    const nameById = new Map(accounts.map(a => [a.id, a.company_name]))

    const [rows, signals, flagged, personas, profile] = accountIds.length
      ? await Promise.all([
          this.contacts.find({
            where: { account_id: In(accountIds), deleted_at: IsNull(), ...workspaceScopeWhere(workspaceId) },
            select: CALL_LIST_CONTACT_COLUMNS,
          }),
          this.callListSignals(accountIds),
          this.outcomes?.incorrectContactIds(workspaceId),
          this.loadTargetPersonas(workspaceId),
          this.profileDataOf(userId),
        ])
      : [[] as ContactEntity[], new Map<string, DiscoverCallListSignal[]>(), undefined, undefined, null]
    const sellerFocus = sellerFocusFrom(profile)
    // Lot 758 — la liste d'appels lit l'offre déclarée comme le chemin recommandé (même noyau).
    const offerTokens = profileOfferTokens(profile)

    const rowsByAccount = new Map<string, CallListContactSourceRow[]>()
    for (const row of rows ?? []) {
      if (!row.account_id) continue
      const bucket = rowsByAccount.get(row.account_id) ?? []
      bucket.push(row as unknown as CallListContactSourceRow)
      rowsByAccount.set(row.account_id, bucket)
    }

    return {
      companies: request.companies.map(company => {
        const accountId = matched.get(company.key) ?? null
        if (!accountId) return { key: company.key, accountId: null, contactsTotal: null, contacts: [], signals: [] }
        const { total, contacts } = buildCallListContacts(
          rowsByAccount.get(accountId) ?? [],
          flagged ?? new Set<string>(),
          personas,
          nameById.get(accountId) ?? null,
          sellerFocus,
          offerTokens,
        )
        return { key: company.key, accountId, contactsTotal: total, contacts, signals: signals.get(accountId) ?? [] }
      }),
    }
  }

  /** #2545 — signaux ACTIFS historisés, les plus récents d'abord, dix par compte.
   *  Les identifiants viennent de comptes déjà bornés à l'espace. */
  private async callListSignals(accountIds: string[]): Promise<Map<string, DiscoverCallListSignal[]>> {
    const map = new Map<string, DiscoverCallListSignal[]>()
    const rows =
      (await this.contacts.manager.query<
        Array<{
          account_id: string
          label: string
          signal_type: string | null
          source: string | null
          signal_date: string | null
          first_detected_at: Date | string
          first_detection_exact: boolean
          freshness: string | null
        }>
      >(
        `SELECT sh.account_id, sh.label, sh.signal_type, sh.source, sh.signal_date,
                sh.first_detected_at, sh.first_detection_exact, sh.freshness
           FROM signal_history sh
          WHERE sh.account_id = ANY($1::uuid[])
            AND sh.status = 'active'
          ORDER BY sh.last_seen_at DESC`,
        [accountIds],
      )) ?? []
    // #4045.1 — l'URL vit sur le blob `accounts.recent_signals`, pas dans `signal_history` :
    // jointure par la MÊME identité (libellé normalisé) que l'historique.
    const urlsByAccount = await this.callListSignalUrls(accountIds)
    const now = new Date()
    for (const row of rows) {
      const signal = toCallListSignal(row, urlsByAccount.get(row.account_id)?.get(signalHistoryKey(row.label)))
      if (!signal) continue
      // #4068 — avant le plafond de dix : un acte administratif, un titre vide ou
      // un stage ne prend plus la place d'un recrutement (LATECOERE, 13/10).
      // Historique de l'espace : l'âge ne l'écarte pas (`fromSpace`).
      const verdict = classifyCardFact(
        { type: discoverSignalTypeOfKind(signal.kind), label: signal.label, date: signal.date, fromSpace: true },
        { now },
      )
      if (verdict.tier === 'off') continue
      const bucket = map.get(row.account_id) ?? []
      bucket.push(signal)
      map.set(row.account_id, bucket)
    }
    for (const [accountId, list] of map) {
      list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      map.set(accountId, list.slice(0, DISCOVER_CALL_LIST_SIGNALS_PER_COMPANY))
    }
    return map
  }

  /** #4045.1 — compte → (libellé normalisé → URL vérifiable) lu sur `recent_signals`. */
  private async callListSignalUrls(accountIds: string[]): Promise<Map<string, Map<string, string>>> {
    const byAccount = new Map<string, Map<string, string>>()
    const accounts =
      (await this.contacts.manager.query<Array<{ id: string; recent_signals: unknown }>>(
        `SELECT a.id, a.recent_signals FROM accounts a WHERE a.id = ANY($1::uuid[])`,
        [accountIds],
      )) ?? []
    for (const account of accounts) {
      const urls = new Map<string, string>()
      for (const signal of readRecentSignals(account.recent_signals)) {
        if (signal.source_url) urls.set(signalHistoryKey(signal.label), signal.source_url)
      }
      if (urls.size > 0) byAccount.set(account.id, urls)
    }
    return byAccount
  }

  /**
   * #3282 — l'instant du dernier GESTE du commercial sur chaque contact, lu au
   * journal (`user_actions`). Les événements SYSTÈME (score, profil, statut,
   * analyse, export) n'en sont pas : ils ne disent rien d'une action menée.
   */
  private async lastGestureByContact(contactIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    if (contactIds.length === 0) return map
    const rows =
      (await this.contacts.manager.query<Array<{ contact_id: string; last_at: Date | string | null }>>(
        `SELECT ua.contact_id AS contact_id, MAX(ua.created_at) AS last_at
           FROM user_actions ua
          WHERE ua.contact_id = ANY($1::uuid[])
            AND ua.action_type = ANY($2::text[])
          GROUP BY ua.contact_id`,
        [contactIds, [...CONTACT_GESTURE_ACTION_TYPES]],
      )) ?? []
    for (const row of rows) {
      if (row.last_at)
        map.set(row.contact_id, row.last_at instanceof Date ? row.last_at.toISOString() : String(row.last_at))
    }
    return map
  }

  /**
   * #4287.11 — LES N DERNIERS CONTACTS : classés par la date de leur dernière interaction (geste du journal),
   * bornés à l'espace actif ET au périmètre (BU) de l'appelant. Un contact sans interaction datée n'y figure
   * pas — il ne passe jamais devant un contact daté.
   */
  async recentlyActedContacts(
    userId: string,
    limit: number,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<RecentlyActedContact[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    // Marge : le filtre de périmètre peut écarter des lignes après la lecture.
    const rows =
      (await this.contacts.manager.query<
        Array<Omit<RecentlyActedContact, 'last_action_at'> & { last_at: Date | string }>
      >(
        `SELECT c.id AS id, c.account_id AS account_id, a.company_name AS company_name, c.full_name AS full_name,
                c.title AS title, c.decision_role AS decision_role, c.email AS email, c.phone AS phone,
                c.location AS location, c.linkedin_url AS linkedin_url, c.user_status AS user_status,
                MAX(ua.created_at) AS last_at
           FROM user_actions ua
           JOIN contacts c ON c.id = ua.contact_id
           LEFT JOIN accounts a ON a.id = c.account_id
          WHERE c.workspace_id = $1
            AND c.deleted_at IS NULL
            AND ua.action_type = ANY($2::text[])
          GROUP BY c.id, a.company_name
          ORDER BY last_at DESC
          LIMIT $3`,
        [workspaceId, [...CONTACT_GESTURE_ACTION_TYPES], Math.min(limit * 4, 100)],
      )) ?? []
    const inScope = new Map<string, boolean>()
    const kept: RecentlyActedContact[] = []
    for (const row of rows) {
      if (kept.length >= limit) break
      if (row.account_id) {
        if (!inScope.has(row.account_id)) {
          inScope.set(row.account_id, await this.accountIsInScope(row.account_id, workspaceId, businessUnitScope))
        }
        if (!inScope.get(row.account_id)) continue
      }
      const { last_at, ...rest } = row
      kept.push({ ...rest, last_action_at: last_at instanceof Date ? last_at.toISOString() : String(last_at) })
    }
    return kept
  }

  /** La date de la prochaine action non faite de chaque contact (une requête). */
  // Les identifiants viennent des contacts DÉJÀ scopés à l'espace : la requête n'élargit rien.
  private async nextActionDueByContact(contactIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    if (contactIds.length === 0) return map
    const rows =
      (await this.contacts.manager.query<Array<{ contact_id: string; next_due: Date | string | null }>>(
        `SELECT u.contact_id AS contact_id, MIN(u.due) AS next_due
           FROM (
             SELECT api.contact_id AS contact_id, api.due_date AS due
               FROM action_plan_items api
              WHERE api.contact_id = ANY($1::uuid[])
                AND api.done = false AND api.due_date IS NOT NULL
             UNION ALL
             SELECT t.contact_id AS contact_id, t.due_on AS due
               FROM tasks t
              WHERE t.contact_id = ANY($1::uuid[])
                AND ${taskStillOpenSql('t')} AND t.due_on IS NOT NULL
           ) u
          GROUP BY u.contact_id`,
        [contactIds],
      )) ?? []
    for (const row of rows) {
      if (row.next_due)
        map.set(row.contact_id, row.next_due instanceof Date ? row.next_due.toISOString() : String(row.next_due))
    }
    return map
  }

  /**
   * PERF 29/09/2026 — LA VOIE D'ACCÈS DU CONTACT LE MIEUX CLASSÉ, POUR PLUSIEURS
   * COMPTES EN UNE LECTURE.
   *
   * `GET /briefing/today` (8,5 s en prod) appelait {@link rankForAccount} une
   * fois par compte à surveiller : résolution de l'espace, contacts, compte,
   * fiches signalées — ≥ 6 requêtes par compte, en parallèle sur un pool de 10.
   * Ici : l'espace est résolu UNE fois, les fiches signalées UNE fois, les
   * contacts et les cartographies (`raw_analysis`, seule colonne du compte que
   * le classement lit) en UNE requête chacun (`IN`) — 2 lectures de table, quel
   * que soit le nombre de comptes.
   *
   * MÊME règle que `rankForAccount(accountId, userId, {})` : mêmes lignes
   * (contacts non supprimés de l'espace, compte lu sous la borne d'espace),
   * mêmes portes d'éligibilité, même noyau {@link rankAccountContacts} — jamais
   * une seconde définition du rang (GA-26). Sans périmètre BU (le brief n'en
   * pose pas), donc pas de `accountIsInScope`. Un compte sans contact
   * classable, ou dont le classement casse, vaut `null` : jamais une voie
   * devinée, et un compte ne fait pas tomber les autres.
   *
   * #3749 — les postes cibles de l'ESN (`loadTargetPersonas`) manquaient ici :
   * `rankForAccount` les lisait déjà (#3754), mais ce chemin BULK appelait
   * `rankAccountContacts(eligible, rawAnalysis, {})` sans son 5ᵉ argument — la
   * voie d'accès du briefing du jour ignorait le niveau décideur que la fiche
   * compte, elle, applique. Une seule lecture de plus (clé = l'espace, pas le
   * compte) : le budget de requêtes ne grossit pas avec le nombre de comptes.
   */
  async topAccessPaths(accountIds: readonly string[], userId: string): Promise<Map<string, ContactAccessPath | null>> {
    const result = new Map<string, ContactAccessPath | null>()
    const ids = [...new Set(accountIds)]
    if (!ids.length) return result
    for (const id of ids) result.set(id, null)

    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const [rows, flaggedIncorrectContactIds, targetPersonas, accessStatuses] = await Promise.all([
      this.contacts.find({
        where: { account_id: In(ids), deleted_at: IsNull(), ...workspaceScopeWhere(workspaceId) },
      }),
      this.outcomes?.incorrectContactIds(workspaceId) ?? Promise.resolve(new Set<string>()),
      // #3749 — la MÊME lecture que `rankForAccount` (ligne ~1690), une fois
      // pour tous les comptes du lot (clé = l'espace, pas le compte) : le
      // niveau décideur ORDONNE le chemin retenu ici aussi, jamais ne le filtre.
      this.loadTargetPersonas(workspaceId),
      // #4292.11 — le statut d'accès ordonne le chemin ici comme sur la fiche compte (#4271).
      this.loadAccessStatuses(workspaceId, ids),
    ])
    const rowsByAccount = new Map<string, ContactEntity[]>()
    for (const row of rows) {
      if (!row.account_id) continue
      const bucket = rowsByAccount.get(row.account_id)
      if (bucket) bucket.push(row)
      else rowsByAccount.set(row.account_id, [row])
    }
    // Comme `rankForAccount` : un compte SANS contact dans l'espace n'est jamais
    // lu — sa cartographie ne fuit pas.
    const withContacts = [...rowsByAccount.keys()]
    const accountRows = withContacts.length
      ? await this.accounts.find({
          where: { id: In(withContacts), ...workspaceScopeWhere(workspaceId) },
          select: ['id', 'raw_analysis'],
        })
      : []
    const rawAnalysisById = new Map(accountRows.map(row => [row.id, row.raw_analysis]))

    for (const [accountId, accountContacts] of rowsByAccount) {
      try {
        const rawAnalysis = (rawAnalysisById.get(accountId) ?? null) as Record<string, unknown> | null
        const { eligible } = filterEligibleContacts(accountContacts, rawAnalysis, flaggedIncorrectContactIds)
        const { ranked } = rankAccountContacts(
          eligible,
          rawAnalysis,
          {},
          undefined,
          targetPersonas,
          accessStatuses.get(accountId),
        )
        result.set(accountId, ranked[0]?.access_path ?? null)
      } catch (error) {
        this.logger.warn(`topAccessPaths: classement indisponible (${accountId}) — ${(error as Error).message}`)
      }
    }
    return result
  }

  /**
   * #4088.2 — « QUI ÇA CONCERNE » dans la Veille : le contact EN TÊTE du chemin
   * recommandé de chaque compte (nom + intitulé de poste, en clair).
   *
   * Le rang n'est pas recalculé ici : c'est {@link recommendedPathsForAccounts}
   * (cache 60 s par compte, `rankAccountContacts`, éligibilité, postes cibles de
   * l'ESN) — la MÊME définition que l'onglet Contacts du dossier et le filtre
   * « recommandés » de `/contacts` (GA-26). Aucun critère protégé n'y entre (c58).
   * Deux lectures au total, quel que soit le nombre de comptes : les chemins, puis
   * les lignes des seuls contacts de tête. Un compte sans contact classable vaut
   * `null` — jamais un nom deviné.
   */
  async topDecisionMakers(
    accountIds: readonly string[],
    userId: string,
  ): Promise<Map<string, { contact_id: string; name: string; title: string | null } | null>> {
    const result = new Map<string, { contact_id: string; name: string; title: string | null } | null>()
    const ids = [...new Set(accountIds)]
    for (const id of ids) result.set(id, null)
    if (ids.length === 0) return result

    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const paths = await this.recommendedPathsForAccounts(ids, workspaceId)
    const headByAccount = new Map<string, string>()
    for (const [accountId, path] of paths) {
      const head = path[0]
      if (head) headByAccount.set(accountId, head)
    }
    if (headByAccount.size === 0) return result

    const rows = await this.contacts.find({
      where: { id: In([...headByAccount.values()]), deleted_at: IsNull(), ...workspaceScopeWhere(workspaceId) },
      select: ['id', 'full_name', 'title'],
    })
    const rowById = new Map(rows.map(row => [row.id, row]))
    for (const [accountId, contactId] of headByAccount) {
      const row = rowById.get(contactId)
      const name = row?.full_name?.trim()
      if (row && name) result.set(accountId, { contact_id: row.id, name, title: row.title?.trim() || null })
    }
    return result
  }

  /**
   * #3942.2 — recette prod 09/10 (#3942, PARTIEL) : LES CONTACTS RECOMMANDÉS
   * DE `/contacts`, CÔTÉ SERVEUR.
   *
   * `useRecommendedContactIds` (web) classait déjà ce même noyau, mais
   * seulement pour les comptes représentés sur la PAGE chargée — sur un
   * espace de 41 304 contacts, le chemin recommandé d'un compte pouvait
   * tomber hors de la page 1, qui annonçait alors « aucun recommandé parmi
   * ceux chargés ». Même patron que {@link topAccessPaths} (classement PAR
   * COMPTE, même porte d'éligibilité {@link filterEligibleContacts}, même
   * {@link rankAccountContacts}) mais le résultat recherché est le CHEMIN
   * RECOMMANDÉ complet (≤ `RECOMMENDED_PATH_MAX`), pas seulement son premier
   * contact — la MÊME définition que l'onglet Contacts du dossier compte
   * ({@link rankForAccount}/`useContactRanking`), jamais une seconde règle
   * qui pourrait diverger (GA-26).
   *
   * `qb` porte déjà tous les AUTRES filtres (recherche, rôle, société,
   * périmètre BU/espace…) : les comptes candidats sont ceux qui ont AU MOINS
   * un contact sous CES filtres — mais le classement tourne sur TOUS les
   * contacts du compte (comme `rankForAccount`), pour ne jamais produire un
   * rang tronqué par un filtre qui ne porte que sur la liste.
   *
   * #3942.5 — rend le CHEMIN ORDONNÉ (rang 1..N, l'ordre de `ranked`), pas
   * seulement l'ensemble : {@link narrowToRecommendedScope} en a besoin pour
   * grouper PAR COMPTE puis par rang. Chaque compte passe par
   * {@link recommendedPathCache} (clé `workspaceId:accountId`) — un compte
   * déjà chaud ne relit AUCUNE ligne et ne relance AUCUN classement ; seuls
   * les comptes manquants du cache sont lus, EN UNE SEULE requête groupée
   * (`In(toCompute)`), jamais une par compte.
   */
  private async recommendedAccountPaths(
    qb: SelectQueryBuilder<ContactEntity>,
    workspaceId: string,
  ): Promise<Map<string, readonly string[]>> {
    const candidates = await qb
      .clone()
      .select(['contact.id AS id', 'contact.account_id AS account_id'])
      .getRawMany<{ id: string; account_id: string | null }>()
    // #3942.2 — un contact sans compte (file « à qualifier ») n'est jamais
    // recommandé, même s'il figure par ailleurs dans l'ensemble candidat.
    const accountIds = [...new Set(candidates.filter(row => row.account_id).map(row => row.account_id as string))]
    return this.recommendedPathsForAccounts(accountIds, workspaceId)
  }

  /**
   * Le chemin recommandé ORDONNÉ de chaque compte donné (cache 60 s par compte).
   * Extrait de {@link recommendedAccountPaths} pour #4088.2 : la Veille lit le
   * premier de chaque chemin (`topDecisionMakers`) — le MÊME classement, jamais
   * une seconde définition du rang (GA-26).
   */
  private async recommendedPathsForAccounts(
    accountIds: readonly string[],
    workspaceId: string,
  ): Promise<Map<string, readonly string[]>> {
    if (accountIds.length === 0) return new Map()

    const paths = new Map<string, readonly string[]>()
    const toCompute: string[] = []
    for (const accountId of accountIds) {
      const cached = this.recommendedPathCache.peek(`${workspaceId}:${accountId}`)
      if (cached) paths.set(accountId, await cached)
      else toCompute.push(accountId)
    }
    if (toCompute.length === 0) return paths

    const [rows, flagged, targetPersonas, accessStatuses] = await Promise.all([
      this.contacts.find({
        where: { account_id: In(toCompute), deleted_at: IsNull(), ...workspaceScopeWhere(workspaceId) },
      }),
      this.outcomes?.incorrectContactIds(workspaceId) ?? Promise.resolve(new Set<string>()),
      this.loadTargetPersonas(workspaceId),
      // #4292.11 — le MÊME statut d'accès que la fiche compte (#4271) : un seul chemin recommandé par compte.
      this.loadAccessStatuses(workspaceId, toCompute),
    ])
    const rowsByAccount = new Map<string, ContactEntity[]>()
    for (const row of rows) {
      if (!row.account_id) continue
      const bucket = rowsByAccount.get(row.account_id)
      if (bucket) bucket.push(row)
      else rowsByAccount.set(row.account_id, [row])
    }
    const accountRows = rowsByAccount.size
      ? await this.accounts.find({
          where: { id: In([...rowsByAccount.keys()]), ...workspaceScopeWhere(workspaceId) },
          select: ['id', 'raw_analysis'],
        })
      : []
    const rawAnalysisById = new Map(accountRows.map(row => [row.id, row.raw_analysis]))

    await Promise.all(
      toCompute.map(async accountId => {
        const path = await this.recommendedPathCache.getOrLoad(`${workspaceId}:${accountId}`, async () => {
          try {
            const accountContacts = rowsByAccount.get(accountId) ?? []
            const rawAnalysis = (rawAnalysisById.get(accountId) ?? null) as Record<string, unknown> | null
            const { eligible } = filterEligibleContacts(accountContacts, rawAnalysis, flagged)
            const { ranked } = rankAccountContacts(
              eligible,
              rawAnalysis,
              {},
              undefined,
              targetPersonas,
              accessStatuses.get(accountId),
            )
            return ranked.map(item => item.contact_id)
          } catch (error) {
            this.logger.warn(
              `recommendedAccountPaths: classement indisponible (${accountId}) — ${(error as Error).message}`,
            )
            return []
          }
        })
        paths.set(accountId, path)
      }),
    )
    return paths
  }

  /**
   * Une écriture en MASSE sur les contacts d'un compte périme son chemin
   * recommandé — voir le docblock de {@link recommendedPathCache}. Sans
   * objet (jamais appelée) si le compte n'a jamais été classé : `invalidate`
   * sur une clé absente est un no-op.
   */
  private invalidateRecommendedPath(workspaceId: string, accountId: string): void {
    this.recommendedPathCache.invalidate(`${workspaceId}:${accountId}`)
  }

  /**
   * Referme `qb` sur le chemin recommandé — même patron que
   * {@link narrowToHierarchyLevel}/{@link narrowToSourceTag} plus bas : un
   * `1 = 0` plutôt qu'un `IN` vide (SQL invalide) quand l'espace, sous les
   * filtres actifs, n'a VRAIMENT aucun recommandé. Rend l'ensemble retenu :
   * l'appelant s'en sert aussi pour le compteur (`recommendedTally`), sans
   * payer un second classement (GA-26).
   *
   * #3942.5 — ORDRE (décision Louis 09/10) : la portée n'est plus seulement
   * un filtre, c'est aussi un TRI — par compte, à la même priorité que
   * `/accounts` par défaut (`LAST_ANALYZED_SQL DESC NULLS LAST`, départagé par
   * `account.id ASC` — EXACTEMENT `SORT_MAP.date_desc`, `accounts.service.ts`,
   * GA-26 : une seconde expression de tri aurait pu diverger de celle qu'elle
   * prétend reproduire), PUIS par rang DANS le chemin recommandé du compte
   * (N°1, N°2… l'ordre de {@link recommendedAccountPaths}). `array_position`
   * sur la liste ordonnée complète pose les deux en une seule passe, sans
   * second aller-retour : la requête qui lit les contacts N'EST PAS rejouée,
   * seul son `ORDER BY` change. `options.order: false` (compteurs) laisse
   * l'ordre par défaut en place — un compte n'a besoin d'aucun tri pour être
   * compté.
   */
  private async narrowToRecommendedScope(
    qb: SelectQueryBuilder<ContactEntity>,
    workspaceId: string,
    options: { order?: boolean } = {},
  ): Promise<{
    ids: Set<string>
    /** Rang 1-based DANS le chemin recommandé de son compte. */
    rankByContact: Map<string, number>
    /** Taille du chemin recommandé, PAR COMPTE — le « vrai nombre » d'un
     *  éventuel en-tête de groupe (brief F05, point 2). */
    pathSizeByAccount: Map<string, number>
  }> {
    const pathsByAccount = await this.recommendedAccountPaths(qb, workspaceId)
    const ids = new Set<string>()
    for (const path of pathsByAccount.values()) for (const contactId of path) ids.add(contactId)

    if (ids.size === 0) {
      qb.andWhere('1 = 0')
      return { ids, rankByContact: new Map(), pathSizeByAccount: new Map() }
    }
    qb.andWhere('contact.id IN (:...recommendedScopeIds)', { recommendedScopeIds: [...ids] })

    const rankByContact = new Map<string, number>()
    const pathSizeByAccount = new Map<string, number>()
    for (const [accountId, path] of pathsByAccount) pathSizeByAccount.set(accountId, path.length)

    if (options.order === false) return { ids, rankByContact, pathSizeByAccount }

    // La MÊME priorité que `/accounts` par défaut, lue pour les seuls comptes
    // candidats — jamais un second classement, juste l'ORDRE des comptes déjà
    // retenus ci-dessus.
    const accountOrder = await this.accounts
      .createQueryBuilder('account')
      .select('account.id', 'id')
      .where('account.id IN (:...accountIds)', { accountIds: [...pathsByAccount.keys()] })
      .andWhere('account.workspace_id = :recommendedOrderWorkspaceId', { recommendedOrderWorkspaceId: workspaceId })
      .orderBy(LAST_ANALYZED_SQL, 'DESC', 'NULLS LAST')
      .addOrderBy('account.id', 'ASC')
      .getRawMany<{ id: string }>()

    const orderedIds: string[] = []
    for (const { id: accountId } of accountOrder) {
      const path = pathsByAccount.get(accountId) ?? []
      path.forEach((contactId, index) => {
        orderedIds.push(contactId)
        rankByContact.set(contactId, index + 1)
      })
    }
    qb.orderBy('array_position(:recommendedOrderIds::uuid[], contact.id)', 'ASC').setParameter(
      'recommendedOrderIds',
      orderedIds,
    )

    return { ids, rankByContact, pathSizeByAccount }
  }

  /**
   * #2202.12 — les ids des contacts qu'un filtre de liste ramène dans CET espace : la source « vue
   * enregistrée » d'une audience. RÉUTILISE `applyContactListFiltersExceptState` (GA-26) — jamais
   * un second interpréteur de filtres. L'espace est une valeur passée par l'appelant, déjà résolue.
   */
  async contactIdsForFilters(workspaceId: string, filters: ContactListQuery, limit: number): Promise<string[]> {
    const qb = await this.applyContactListFiltersExceptState(
      this.contacts.createQueryBuilder('contact').leftJoin('accounts', 'account', 'account.id = contact.account_id'),
      workspaceId,
      filters,
    )
    const rows = await qb
      .select('contact.id', 'id')
      .orderBy('contact.full_name', 'ASC')
      .limit(limit)
      .getRawMany<{ id: string }>()
    return rows.map(row => row.id)
  }

  /**
   * Laura compte avant de proposer (décision Louis, 15/09/2026) — le WHERE
   * filtré de `/contacts`, extrait pour que `countForUser` ne puisse JAMAIS
   * diverger de `findAllForUser` (GA-26, « une dérivation vit à un seul
   * endroit ») : deux chemins qui refont le même filtre finissent par
   * diverger au premier oubli.
   *
   * `state` N'EST PAS appliqué ici : `findAllForUser` a besoin d'un qb SANS
   * lui pour les pastilles (`tallyQb`, clonées avant), et l'applique lui-même
   * après. `countForUser` l'applique à son tour, juste après cet appel.
   */
  private async applyContactListFiltersExceptState(
    qb: SelectQueryBuilder<ContactEntity>,
    workspaceId: string,
    filters: ContactListQuery,
    /** Le périmètre (BU) de l'appelant — `null` = tout l'espace, le défaut
     *  historique. Le troisième dialecte de la MÊME clause. */
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<SelectQueryBuilder<ContactEntity>> {
    applyWorkspaceScope(qb, 'contact', workspaceId)
    // ⚠️ `andWhere`, jamais `where` : la borne d'espace posée juste au-dessus
    // SURVIT. Un `where` ici l'écraserait et ouvrirait toutes les ESN d'un coup.
    const businessUnitClause = businessUnitScopeClause(
      businessUnitScope,
      'bu_acc.business_unit_id',
      ':...businessUnitIds',
    )
    if (businessUnitClause) {
      qb.andWhere(
        `(contact.account_id IS NULL OR contact.account_id IN (SELECT bu_acc.id FROM accounts bu_acc WHERE ${businessUnitClause}))`,
        businessUnitScope && businessUnitScope.businessUnitIds.length
          ? { businessUnitIds: [...businessUnitScope.businessUnitIds] }
          : {},
      )
    }

    // Soft-hidden contacts stay out of the default list (still reachable by
    // id via findOne). The column is NOT NULL DEFAULT false so this is safe.
    qb.andWhere('contact.hidden = false')
    // Suppression réversible (T0) : un contact supprimé sort de toutes les
    // listes mais garde son historique — un effacement définitif emporterait
    // les activités et les positionnements qui le citent.
    qb.andWhere('contact.deleted_at IS NULL')
    // Un contact ÉCARTÉ sort des listes — c'est le but du geste. Il reste
    // trouvable à la demande : quelqu'un doit pouvoir relire pourquoi, et le
    // réintégrer si le motif ne tient plus.
    if (!filters.includeExcluded) qb.andWhere('contact.excluded_at IS NULL')

    if (filters.q) {
      // #2158.51 — `contact.phone` rejoint le même OR : un commercial qui
      // retape un numéro griffonné doit retrouver la fiche, pas seulement le
      // nom/titre/email/société.
      // #2158.54 — la CIBLE rejoint le même OR : même jointure que le filtre
      // `targetListId` (#2158.68), `workspace_id` reposé pareillement,
      // `removed_at IS NULL` pareillement (un élément retiré n'y compte plus).
      // #2158.55 — LE NOM DU PORTEUR rejoint le même OR : `assignedTo`
      // (#2158.65) filtre déjà par identifiant exact, rien ne permettait de
      // le retrouver par son NOM depuis la recherche libre. `profiles` n'a
      // aucun `workspace_id` (table d'identité globale) : seule la jointure
      // par `contact.assigned_to` scope le résultat, déjà cloisonné par
      // `applyWorkspaceScope` juste au-dessus sur `contact`.
      // #3278 (recette 14/10, > 30 s) — la cible et le porteur sont des sous-requêtes NON corrélées
      // (`IN (SELECT …)`) : un EXISTS corrélé au sein d'un OR se rejoue pour CHAQUE contact lu, dans
      // chacune des cinq requêtes de la 1re page.
      // #3489 — le NOM se cherche aussi PAR MOTS, sans accent ni ordre
      // (« SOUSSIN Armelle » retrouve « Armelle Soussin »).
      const nameTokens = nameTokensClause('contact.full_name', filters.q)
      // #4386.2 — « theo haddad bellum » : chaque mot dans le nom OU l'entreprise (suffixes SAS/SA/Group écartés).
      const personCompanyTokens = crossFieldTokensClause(['contact.full_name', 'account.company_name'], filters.q)
      // #3710.6 — le TITRE aussi, par mots plié : « directeur d'information » retrouve
      // « Directeur des systèmes d’information groupe » (apostrophe ’, mots non contigus).
      const titleTokens = nameTokensClause('contact.title', filters.q, 'qt')
      // #4057 / #4058 (recette R15) — une EXPERTISE (« cyber GRC ») n'est pas un intitulé : les
      // intitulés de son catalogue (RSSI, CISO…, même source que la découverte) rejoignent le OR,
      // sinon un RSSI déjà en base restait introuvable parce que son titre ne dit ni « cyber » ni « GRC ».
      const expertiseClauses = (discoveryTitlesFor({ expertise: filters.q }) ?? [])
        .map((title, index) => nameTokensClause('contact.title', title, `qe${index}_`))
        .filter((clause): clause is NonNullable<typeof clause> => clause !== null)
      const expertiseSql = expertiseClauses.map(clause => ` OR ${clause.sql}`).join('')
      const expertiseParams = Object.assign({}, ...expertiseClauses.map(clause => clause.params))
      qb.andWhere(
        `(contact.full_name ILIKE :q${nameTokens ? ` OR ${nameTokens.sql}` : ''}${personCompanyTokens ? ` OR ${personCompanyTokens.sql}` : ''} OR contact.title ILIKE :q${titleTokens ? ` OR ${titleTokens.sql}` : ''}${expertiseSql} OR contact.email ILIKE :q OR contact.phone ILIKE :q
          OR account.company_name ILIKE :q
          OR contact.id = ANY (
               SELECT tli.contact_id FROM target_list_items tli
               JOIN target_lists tl ON tl.id = tli.target_list_id
                WHERE tli.workspace_id = :qWorkspaceId
                  AND tli.removed_at IS NULL
                  AND tl.name ILIKE :q
             )
          OR contact.assigned_to IN (
               SELECT owner_p.user_id FROM profiles owner_p
                WHERE (COALESCE(owner_p.first_name, '') || ' ' || COALESCE(owner_p.last_name, '')) ILIKE :q
             ))`,
        {
          q: `%${filters.q}%`,
          qWorkspaceId: workspaceId,
          ...(nameTokens?.params ?? {}),
          ...(personCompanyTokens?.params ?? {}),
          ...(titleTokens?.params ?? {}),
          ...expertiseParams,
        },
      )
    }
    if (filters.role && filters.role !== 'all') {
      qb.andWhere('contact.decision_role = :role', { role: filters.role })
    }
    // #2158.60 — même geste que `role` : égalité EXACTE sur une taxonomie
    // fermée (`contactFamilySchema`), `'all'` traité comme « pas de filtre ».
    if (filters.family && filters.family !== 'all') {
      qb.andWhere('contact.family = :family', { family: filters.family })
    }
    // #2158.66 — même geste que `family` : égalité EXACTE sur une taxonomie
    // fermée (`contactSourceSchema`), `'all'` traité comme « pas de filtre ».
    // Le fournisseur reste dans la clause SQL, jamais affiché — l'écran ne
    // rend que le libellé anonymisé de `contactSourceLabel`.
    if (filters.source === MON_CRM_SOURCE_FILTER) {
      // #4526.4 — la puce « Mon CRM », lue, jamais réécrite. ⚠️ #4597.2 : `crm` SEUL depuis le 26/10 (renversement
      // de « crm + import ») — les fichiers importés ont leur puce, `source = 'import'`.
      // #4526.1 — l'origine CRM est une facette distincte du statut d'analyse : `crm` OU un lien de connecteur.
      qb.andWhere(monCrmContactSql('contact'))
    } else if (filters.source && filters.source !== 'all') {
      qb.andWhere('contact.source = :source', { source: filters.source })
    }
    // #4597.3 — « voir les N contacts de CET import » : l'identifiant du job, jamais sa date. Un AND de plus ;
    // l'espace est déjà posé par la même méthode, un identifiant d'un autre espace ne rend rien.
    if (filters.importJob) {
      qb.andWhere('contact.import_job_id = :importJob', { importJob: filters.importJob })
    }
    if (filters.company) {
      qb.andWhere('account.company_name ILIKE :company', { company: `%${filters.company}%` })
    }
    // #1903.15 — le compte discuté en conversation. Égalité EXACTE, jamais un
    // ILIKE comme `company` : deux comptes homonymes ne doivent pas se
    // confondre quand Laura pointe un identifiant précis.
    if (filters.accountId) {
      qb.andWhere('contact.account_id = :accountId', { accountId: filters.accountId })
    }
    // #2158.61 — même geste que `company` : ILIKE, ville/pays uniquement
    // (doctrine c58, seule exception nommée à l'interdit des critères
    // protégés). `contact.location` voyage déjà jusqu'à la liste (#2165.38).
    if (filters.location) {
      qb.andWhere('contact.location ILIKE :location', { location: `%${filters.location}%` })
    }
    // #2158.57 — même geste que `location` : ILIKE sur un texte libre,
    // `contact.entity` est déjà projeté (colonne « Entité » du tableau).
    if (filters.entity) {
      qb.andWhere('contact.entity ILIKE :entity', { entity: `%${filters.entity}%` })
    }
    // #2158.58 — même geste : ILIKE seul sur `contact.title`, distinct de la
    // recherche libre `q` qui porte aussi sur le nom/email/société/téléphone.
    if (filters.title) {
      qb.andWhere('contact.title ILIKE :title', { title: `%${filters.title}%` })
    }
    // #2294.2 — le secteur du COMPTE. `account` est déjà joint (pour
    // `company_name`) : aucune jointure nouvelle, un `andWhere` de plus.
    if (filters.sector) {
      qb.andWhere('account.sector ILIKE :sector', { sector: `%${filters.sector}%` })
    }
    // #2294.2 — groupe ou filiale (`accounts.group_role`). Égalité EXACTE :
    // deux valeurs fermées, jamais un texte cherché.
    if (filters.groupRole) {
      qb.andWhere('account.group_role = :groupRole', { groupRole: filters.groupRole })
    }
    // #2294.2 — fraîcheur min : `accounts.contacts_collected_at` posé il y a
    // au plus N mois. Un compte jamais collecté (`NULL`) ne correspond à
    // AUCUNE fraîcheur — il n'est pas datable, donc jamais compté comme frais.
    if (filters.contactsFreshWithinMonths) {
      qb.andWhere(
        `account.contacts_collected_at IS NOT NULL AND account.contacts_collected_at >= now() - (:contactsFreshWithinMonths || ' months')::interval`,
        { contactsFreshWithinMonths: filters.contactsFreshWithinMonths },
      )
    }
    // #2158.65 — le porteur du contact. Égalité EXACTE : `assigned_to` est un
    // identifiant de membre, pas un texte cherché.
    if (filters.assignedTo) {
      qb.andWhere('contact.assigned_to = :assignedTo', { assignedTo: filters.assignedTo })
    }
    // #2158.67 — la fraîcheur de LA FICHE (`contact.updated_at`), distincte de
    // `dormantMonths` (dernier échange) et de `contactsFreshWithinMonths`
    // (collecte du compte). `updated_at` est requis sur `contactSchema` :
    // aucune exclusion « jamais datable » n'est nécessaire ici.
    if (filters.updatedWithinMonths) {
      qb.andWhere(`contact.updated_at >= now() - (:updatedWithinMonths || ' months')::interval`, {
        updatedWithinMonths: filters.updatedWithinMonths,
      })
    }
    // #2158.68 — LA CIBLE (`target_list_items.contact_id`) : la jointure que
    // le message de l'épopée #2997 cite comme absente. `workspace_id` est
    // reposé ICI (déjà porté par `target_list_items`, migration
    // `1793700400000`) — même prudence que partout ailleurs dans cette
    // méthode, jamais une confiance transitoire sur la portée de la liste
    // elle-même. `removed_at IS NULL` : un élément RETIRÉ d'une liste n'y
    // compte plus (on archive, on ne supprime pas — la ligne reste, datée).
    if (filters.targetListId) {
      qb.andWhere(
        `EXISTS (
           SELECT 1 FROM target_list_items tli
            WHERE tli.contact_id = contact.id
              AND tli.target_list_id = :targetListId
              AND tli.workspace_id = :targetListWorkspaceId
              AND tli.removed_at IS NULL
         )`,
        { targetListId: filters.targetListId, targetListWorkspaceId: workspaceId },
      )
    }
    // #2159.26 — graphie de la première saisie (décision Louis 19/09) : les
    // étiquettes ne sont plus stockées en minuscules, donc le filtre compare
    // par CLÉ (`tagKey`, insensible à la casse), pas par containment `@>`
    // exact — « SAP » tapé à l'écran retrouve « sap » posé par l'import.
    const tag = filters.tag ? normalizeTag(filters.tag) : null
    if (tag) {
      qb.andWhere('EXISTS (SELECT 1 FROM unnest(contact.tags) AS ft(tag) WHERE lower(ft.tag) = :tagKey)', {
        tagKey: tagKey(tag),
      })
    }
    if (filters.dormantMonths) {
      // Le RÉSEAU DORMANT (tome 1 §11.4). Aucune donnée nouvelle n'est
      // collectée : on relit `activities`, déjà en base.
      //
      // Trois exclusions, chacune pour une raison précise :
      //  - un contact ÉCARTÉ est déjà retiré plus haut ;
      //  - un contact en OPT-OUT ne remonte jamais, quelle que soit
      //    l'ancienneté du silence : relancer quelqu'un qui a demandé le
      //    silence est la faute la plus visible d'un outil de prospection ;
      //  - un contact SANS coordonnée n'est pas dormant, il est
      //    inatteignable. Le proposer produirait une liste sur laquelle on ne
      //    peut rien faire.
      //
      // Le CORPS des messages n'entre pas dans le calcul : seule la DATE de
      // la dernière activité compte.
      qb.andWhere(
        `NOT EXISTS (
           SELECT 1 FROM activities act
            WHERE act.contact_id = contact.id
              AND act.occurred_at >= now() - (:dormantMonths || ' months')::interval
         )`,
        { dormantMonths: filters.dormantMonths },
      )
      qb.andWhere('(contact.email IS NOT NULL OR contact.linkedin_url IS NOT NULL)')
      qb.andWhere(
        `NOT EXISTS (
           SELECT 1 FROM email_suppressions sup
            WHERE lower(sup.email) = lower(contact.email)
         )`,
      )
    }
    if (filters.channel) {
      if (filters.channel === 'with_email') {
        qb.andWhere(recordedEmailSql('contact'))
      } else if (filters.channel === 'with_linkedin') {
        qb.andWhere('contact.linkedin_url IS NOT NULL')
      } else if (filters.channel === 'missing_details') {
        // MÊME prédicat que le compteur « coordonnées à compléter »
        // (`getStats.toEnrich`) : un filtre qui ne rendrait pas exactement le
        // nombre annoncé par la tuile serait pire que pas de filtre du tout.
        qb.andWhere(missingContactDetailsSql('contact'))
      } else if (filters.channel === 'with_phone') {
        // #2167.51 — recette E2E « cinq contacts avec email ET téléphone » :
        // un canal direct, comme with_email/with_linkedin, pas une combinaison.
        // #3821 — seulement les numéros ENREGISTRÉS, jamais un texte dans la colonne.
        qb.andWhere(recordedPhoneSql('contact'))
      } else {
        qb.andWhere('contact.email IS NOT NULL AND contact.linkedin_url IS NOT NULL')
      }
    }
    // #1473 — la file « à qualifier ». L'index partiel
    // `idx_contacts_unassigned_account` est posé exactement pour ce
    // prédicat : sans lui, un `IS NULL` sur une colonne presque toujours
    // pleine balaie la table.
    if (filters.unassigned) {
      qb.andWhere('contact.account_id IS NULL')
    }
    // #4599 — les adresses GABARIT (« prenom.nom@… ») en base : un COMPTE exact (`total`) là où l'écran ne montre que 25
    // lignes sur 67 224. Le motif vient de la garde d'écriture (une seule liste de mots, GA-26).
    if (filters.placeholderEmail) {
      qb.andWhere('contact.email ~* :placeholderEmailPattern', {
        placeholderEmailPattern: placeholderEmailSqlPattern(),
      })
    }
    // #2834 (#2106.24) — « a changé d'employeur ». `await` ici, pas dans
    // `findAllForUser`/`countForUser` : c'est ce qui garantit que les deux ne
    // peuvent PAS diverger sur ce filtre, la même garantie que le reste de
    // cette méthode (GA-26, voir le commentaire de tête).
    if (filters.sourceTag) {
      await this.narrowToSourceTag(qb, filters.sourceTag)
    }
    // #2158.59 — même geste que `sourceTag` juste au-dessus : `await` ICI, pas
    // dans `findAllForUser`/`countForUser`, pour que les deux ne puissent PAS
    // diverger (GA-26).
    if (filters.hierarchyLevel && filters.hierarchyLevel !== 'all') {
      await this.narrowToHierarchyLevel(qb, filters.hierarchyLevel)
    }
    // #2158.14 (#2997) / #2159.61 — la vue « Sans prochaine action », posée
    // en FILTRE. `NEXT_ACTION_SQL` (pas `NEXT_RELANCE_SQL`, réservé à la
    // carte Kanban) : `IS NULL` dessus dit « aucune touche OUVERTE du tout »,
    // cadence ou manuelle — jamais « aucune touche de CADENCE », un champ
    // réservé à un moteur que la plupart des fiches n'utilisent jamais.
    if (filters.withoutNextAction) {
      qb.andWhere(`${NEXT_ACTION_SQL} IS NULL`)
    }
    // #2158.69 (#2997) — la NATURE de la dernière activité ÉCHANGÉE, distincte
    // de `dormantMonths` (l'ancienneté). `act.occurred_at = MAX(...)` referme
    // sur la ligne la plus récente PARMI les échanges (`interactionActivityKindsSql`,
    // même périmètre que le réseau dormant, GA-26 : une seule liste, jamais
    // une seconde copie de « ce qui compte comme un échange »).
    if (filters.lastActivityKind) {
      qb.andWhere(
        `EXISTS (
           SELECT 1 FROM activities act
            WHERE act.contact_id = contact.id
              AND act.kind = :lastActivityKind
              AND act.occurred_at = (
                SELECT MAX(act2.occurred_at) FROM activities act2
                 WHERE act2.contact_id = contact.id
                   AND act2.kind IN ${interactionActivityKindsSql()}
              )
         )`,
        { lastActivityKind: filters.lastActivityKind },
      )
    }
    // #3718 — le statut déclaré (`user_status`) : le filtre « Répondu » de /contacts.
    if (filters.userStatus) {
      qb.andWhere('contact.user_status = :userStatusFilter', { userStatusFilter: filters.userStatus })
    }
    return qb
  }

  /**
   * #2834 (#2106.24) — LES CONTACTS EN RISQUE, POUR UN FILTRE DE LISTE.
   *
   * `source_tag` (`contactSourceTag`) n'est ni une colonne SQL ni un critère
   * de requête existant : il se CALCULE ligne par ligne, à la lecture — la
   * fiche, la télémétrie, les séquences, le score, et le digest « depuis ta
   * dernière visite » (`since-last-visit.ts`) l'appellent déjà tous les
   * quatre. Le réécrire en SQL ici en aurait fait une CINQUIÈME copie de la
   * même règle de correspondance floue (légal, diacritiques, sous-chaînes),
   * condamnée à diverger de `contactSourceTag` au premier ajustement — c'est
   * exactement ce que GA-26 refuse.
   *
   * On appelle donc `contactSourceTag` UNE fois par contact CANDIDAT — sous
   * les mêmes filtres que la liste (recherche, rôle, société…), avant
   * pagination — puis on referme la requête sur les identifiants qu'il
   * retient. Le coût est un aller-retour de plus, accepté ici pour la même
   * raison que `lifecycleTally` un peu plus bas : sur cet écran, un total
   * exact vaut la requête qu'il coûte.
   *
   * `sourceTag` ne porte qu'une seule valeur au contrat (`RISQUE`) : c'est la
   * seule notion que l'épopée #2834 demande de rendre cliquable depuis le
   * brief. `ARRIVEE` n'a aucun appelant qui la demande — l'ajouter sans lui
   * serait le code juste, calculé, testé, que personne n'appelle (CLAUDE.md).
   */
  private async narrowToSourceTag(
    qb: SelectQueryBuilder<ContactEntity>,
    sourceTag: NonNullable<ContactListQuery['sourceTag']>,
  ): Promise<void> {
    const candidates = await qb
      .clone()
      .select([
        'contact.id AS id',
        'contact.source AS source',
        'contact.entity AS entity',
        'account.company_name AS company_name',
        `${APOLLO_CURRENT_ORG_SQL} AS apollo_current_org`,
      ])
      .getRawMany<{
        id: string
        source: string | null
        entity: string | null
        company_name: string | null
        apollo_current_org: string | null
      }>()

    const ids = candidates
      .filter(
        row =>
          contactSourceTag(
            row.source ?? null,
            row.apollo_current_org ? { organization: row.apollo_current_org } : null,
            row.company_name ?? '',
            row.entity ?? null,
          ) === sourceTag,
      )
      .map(row => row.id)

    // `contact.id IN ()` est un SQL invalide — `1 = 0` dit honnêtement
    // « aucun contact » plutôt que de faire échouer toute la requête.
    if (ids.length === 0) {
      qb.andWhere('1 = 0')
    } else {
      qb.andWhere('contact.id IN (:...sourceTagIds)', { sourceTagIds: ids })
    }
  }

  /**
   * #2158.59 (épopée #2997) — LE FILTRE « NIVEAU ».
   *
   * `computeHierarchyLevel` (`@bellum/contracts`) classe déjà `contact.title`
   * pour AFFICHAGE seul (`ContactTableRow.tsx`) — du code juste, calculé,
   * jamais lu par un filtre. Même geste que {@link narrowToSourceTag} juste
   * au-dessus : les motifs regex de la classification ne se réécrivent PAS en
   * SQL (deux dialectes de regex différents — POSIX vs PCRE — condamneraient
   * ce filtre à diverger silencieusement de la colonne affichée à l'écran).
   * On appelle donc la MÊME fonction PURE, une fois par contact CANDIDAT sous
   * les mêmes filtres que la liste, puis on referme la requête sur les
   * identifiants qu'elle retient.
   */
  private async narrowToHierarchyLevel(
    qb: SelectQueryBuilder<ContactEntity>,
    hierarchyLevel: HierarchyLevel,
  ): Promise<void> {
    const candidates = await qb
      .clone()
      .select(['contact.id AS id', 'contact.title AS title'])
      .getRawMany<{ id: string; title: string | null }>()

    const ids = candidates.filter(row => computeHierarchyLevel(row.title) === hierarchyLevel).map(row => row.id)

    if (ids.length === 0) {
      qb.andWhere('1 = 0')
    } else {
      qb.andWhere('contact.id IN (:...hierarchyLevelIds)', { hierarchyLevelIds: ids })
    }
  }

  /**
   * Returns the user's contacts, joined with their account's
   * `company_name` and optionally filtered server-side.
   *  - `q`    → ILIKE on `full_name`, `title`, `email`, `phone`, `account.company_name`
   *  - `role` → `decision_role` equality (`'all'` ≡ no filter)
   */
  /**
   * #2159.26 — les étiquettes EN USAGE sur les contacts vivants de l'espace,
   * pour le filtre de liste : l'écran ne propose que des valeurs réelles.
   *
   * Graphie de la première saisie (décision Louis 19/09) : deux contacts
   * peuvent porter la MÊME étiquette sous deux graphies (« SAP » / « sap »).
   * La requête rend une ligne par (contact, étiquette) — PAS `DISTINCT` —
   * dans l'ordre de création des contacts, et `pickRepresentativeTags`
   * regroupe par clé insensible à la casse en gardant la graphie la plus
   * fréquente, à égalité la première rencontrée. `LIMIT` élargie
   * (occurrences, pas clés distinctes) pour rester une bonne approximation
   * de facette.
   */
  async listTags(userId: string): Promise<string[]> {
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const rows = await this.contacts.query(
        `SELECT t.tag
           FROM contacts c
          CROSS JOIN LATERAL unnest(c.tags) AS t(tag)
          WHERE c.workspace_id = $1 AND c.deleted_at IS NULL
            AND cardinality(c.tags) > 0
          ORDER BY c.created_at ASC
          LIMIT 5000`,
        [workspaceId],
      )
      return pickRepresentativeTags((rows as { tag: string }[]).map(r => r.tag))
    } catch (err) {
      this.logger.error('listTags error', { error: err })
      return []
    }
  }

  /**
   * #4982.3 — « répartis mes contacts par région » : des COMPTES sur tout le portefeuille (jamais 200 lignes lues).
   * Même population que `findAllForUser` (mêmes filtres, même borne d'espace + périmètre BU, `applyContactListFiltersExceptState`)
   * et même zone que le tri « Trier par zone » (`ZONE_REGION_SQL` / `ZONE_DEPARTMENT_SELECT_SQL`, GA-26).
   * Lieu inconnu (aucun département de métropole lisible) : COMPTÉ à part, jamais deviné ni rangé dans une zone.
   */
  async zoneBreakdown(
    userId: string,
    filters: ContactListQuery = {},
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<{
    zones: { region: string; department: string | null; count: number }[]
    unknown_zone: number
    total: number
  }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const qb = this.contacts
      .createQueryBuilder('contact')
      .leftJoin('accounts', 'account', 'account.id = contact.account_id')
    await this.applyContactListFiltersExceptState(qb, workspaceId, filters, businessUnitScope)
    const rows = await qb
      .select(ZONE_REGION_SQL, 'region')
      .addSelect(ZONE_DEPARTMENT_SELECT_SQL, 'department')
      .addSelect('COUNT(*)', 'count')
      .groupBy(`${ZONE_REGION_SQL}, ${ZONE_DEPARTMENT_SELECT_SQL}`)
      .getRawMany<{ region: string | null; department: string | null; count: string }>()
    const zones: { region: string; department: string | null; count: number }[] = []
    let unknown = 0
    for (const row of rows) {
      const count = Number(row.count) || 0
      // #4982.3b — une région connue compte même sans département (lue au nom ou à la ville) ; seul l'inconnu va à part.
      if (row.region) zones.push({ region: row.region, department: row.department ?? null, count })
      else unknown += count
    }
    zones.sort(
      (a, b) =>
        b.count - a.count || a.region.localeCompare(b.region) || (a.department ?? '').localeCompare(b.department ?? ''),
    )
    return { zones, unknown_zone: unknown, total: zones.reduce((n, z) => n + z.count, unknown) }
  }

  async findAllForUser(
    userId: string,
    filters: ContactListQuery = {},
    /** Le périmètre (BU) de l'appelant, RÉSOLU PAR LE CONTRÔLEUR. `null` = tout
     *  l'espace : c'est le défaut historique, et le chemin des appelants
     *  internes (pipeline d'analyse, tableau de bord) reste byte-identique. */
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<ContactListResponse> {
    try {
      const offset = filters.offset ?? 0
      const limit = filters.limit ?? 25
      // Phase 2: list the whole team's contacts; the row scope is workspace_id.
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const qb = this.contacts
        .createQueryBuilder('contact')
        // ⚠️ #1473 — LEFT, jamais INNER. La portée de la liste est posée par
        // `applyWorkspaceScope` sur `contact` juste en dessous : cette jointure
        // ne sert QU'À rapporter `company_name`. En INNER, elle faisait
        // DISPARAÎTRE de la liste tout contact sans compte, sans erreur, sans
        // trace — le commercial aurait cru sa saisie perdue.
        .leftJoin('accounts', 'account', 'account.id = contact.account_id')
        .orderBy('contact.created_at', 'DESC')
        .addOrderBy('contact.id', 'DESC')
        .select([
          'contact.id AS id',
          'contact.account_id AS account_id',
          'contact.full_name AS full_name',
          'contact.title AS title',
          'contact.entity AS entity',
          'contact.decision_role AS decision_role',
          // #219.8 (#3231, lot X50) — la relation personne↔entreprise DÉCLARÉE, que la
          // recherche de Laura relaie (preuve exigée) ; `null` = jamais déclarée.
          'contact.declared_person_company_relation AS declared_person_company_relation',
          'contact.priority AS priority',
          'contact.email AS email',
          'contact.phone AS phone',
          'contact.linkedin_url AS linkedin_url',
          'contact.photo_url AS photo_url',
          // Masked surname of a not-yet-revealed Apollo hit ("Mo***y"). Selected
          // as a scalar rather than dragging the whole raw_data jsonb into the
          // list query — it is what lets the row read "Séverine M." instead of a
          // bare first name.
          "contact.raw_data->>'lastNameObfuscated' AS last_name_obfuscated",
          // #4586.5 — le marqueur de déduction, lu en texte (même raison : pas tout le jsonb dans la liste).
          "contact.raw_data->>'nameDerivedFromEmail' AS name_derived_from_email",
          'contact.why_contact AS why_contact',
          'contact.user_status AS user_status',
          'contact.source AS source',
          // #2158.60 — la famille métier, pour le filtre du même nom. La
          // colonne existe depuis la migration `1782000000000` et est peuplée
          // par le classifieur d'import ; cette projection la jetait.
          'contact.family AS family',
          // Porteur du contact (`contacts.assigned_to`) — l'écran Contacts
          // attribue une SÉLECTION à un membre ; sans cette colonne le panneau ne
          // pourrait pas dire qui porte déjà quoi.
          'contact.assigned_to AS assigned_to',
          // Provenance (Théo p.16) : date de collecte + dernière mise à jour,
          // affichées dans la colonne « Date » de la table contacts.
          'contact.created_at AS created_at',
          'contact.updated_at AS updated_at',
          // La date du dernier enrichissement — le moment où un fournisseur a
          // dit où travaille cette personne. C'est la date que le badge RISQUE
          // affiche ; sans elle il dirait « probablement partie » sans dire
          // depuis quand.
          'contact.last_enrichment_at AS last_enrichment_at',
          // #2297.26 (30/09/2026, recette RÉFUTÉ) — cette projection jetait déjà
          // `last_enrichment_result`/`last_enrichment_missing` : `enrichmentCooldown`
          // (contact-enrichment.ts) exige `last_enrichment_result === 'no_new_data'`
          // pour reconnaître un contact sous délai de protection, mais cette liste
          // ne sélectionnait que `last_enrichment_at` — `bulkEnrichmentExclusionReason`
          // recevait donc TOUJOURS `last_enrichment_result: undefined` et ne rendait
          // jamais `on_cooldown`, quel que soit le contact seedé ou réel en cooldown.
          'contact.last_enrichment_result AS last_enrichment_result',
          'contact.last_enrichment_missing AS last_enrichment_missing',
          // #3822 / E1 — l'état PAR COORDONNÉE (trouvé · introuvable chez N
          // sources · en attente · inconnu/panne) : sans lui, la liste ne peut
          // distinguer un canal dont l'APPEL a échoué d'un « rien trouvé ».
          'contact.enrichment_coordinates AS enrichment_coordinates',
          // R22 a4 — la disponibilité annoncée par champ (« E-mail disponible » / « Tél. disponible »).
          'contact.email_availability AS email_availability',
          'contact.phone_availability AS phone_availability',
          // #2165.38 — le LIEU DE TRAVAIL déclaré, la colonne que l'enrichissement
          // remplit déjà (`contactSchema.location`) et que cette projection
          // jetait. Sans elle, le filtre « Localisation » de Découvrir n'avait
          // rien à lire et se déclarait inconditionnellement inconnu. Aucun
          // repli sur le siège du compte : le siège est un fait sur
          // l'organisation, pas sur la personne.
          'contact.location AS location',
          // L'employeur COURANT selon le dernier enrichissement, extrait en
          // scalaire — comme le nom masqué juste au-dessus, et pour la même
          // raison : traîner tout `raw_data` dans une liste paginée coûterait
          // plusieurs kilo-octets par ligne pour un seul champ. `jsonb_typeof`
          // garde l'expression : un `employmentHistory` absent ou non-tableau
          // ferait échouer `jsonb_array_elements` sur TOUTE la requête.
          `${APOLLO_CURRENT_ORG_SQL} AS apollo_current_org`,
          // #3911.1 — l'ancre qui a trouvé cet employeur courant était-elle
          // exacte (id/domaine) ou seulement un nom en texte libre ?
          `${APOLLO_EMPLOYER_UNVERIFIED_SQL} AS employer_unverified`,
          // #4290.12 — la relecture d'employeur (petit objet : état, date, employeur), pas tout `raw_data`.
          "contact.raw_data->'employmentCheck' AS employment_check",
          'account.company_name AS company_name',
          // #4503 — le siège du COMPTE (la colonne « Compte » en tire la ville) : un fait sur l'organisation, sous son
          // propre nom — jamais versé dans `location`, le lieu de travail de la personne.
          'account.headquarters AS account_headquarters',
          // L'exclusion voyage avec son MOTIF : une ligne écartée sans raison
          // affichée oblige à ouvrir la fiche pour comprendre, et personne ne
          // le fait.
          'contact.excluded_at AS excluded_at',
          'contact.exclusion_reason AS exclusion_reason',
          // #2159.26 — les étiquettes, pour la colonne et le filtre de liste.
          'contact.tags AS tags',
          // #2733 — la vérité de LIVRAISON, distincte de `email_sent_at`
          // (qui ne prouve que l'acceptation par Resend). Sans elle,
          // `ContactTableRow` n'a aucun moyen de savoir qu'un e-mail affiché
          // « envoyé » n'est en fait jamais arrivé.
          'contact.email_bounced_at AS email_bounced_at',
          // V4-CORRECTIFS 4290.12 — l'état « a quitté l'entreprise » (preuve datée), sans traîner `raw_data`.
          // #3098 — la prochaine touche de cadence planifiée, pour la carte du
          // Kanban de prospection (« prochaine relance »).
          `${NEXT_RELANCE_SQL} AS next_relance_due_date`,
        ])
      await this.applyContactListFiltersExceptState(
        qb,
        workspaceId,
        filters,
        // Le périmètre (BU) de l'appelant — même population que la liste de
        // comptes, sinon la liste de contacts annoncerait des comptes qu'il
        // ne peut pas ouvrir (revue sécurité 15/09/2026).
        businessUnitScope,
      )

      // Snapshot AVANT le filtre `state` : les pastilles doivent annoncer le
      // volume de CHAQUE état sous les filtres courants (recherche, rôle, …),
      // pas seulement celui de l'état sélectionné — sinon cliquer une pastille
      // ferait tomber les cinq autres à zéro.
      // #4770.4 — Louis 31/10 : « compte de l'ESPACE seulement ». `qb` porte déjà le périmètre d'espace
      // (`applyWorkspaceScope`, dans `applyContactListFiltersExceptState`) : « Tous » ne compte jamais un référentiel partagé.
      const tallyQb = qb.clone()

      // #3942.2 — même raisonnement que `state` juste au-dessus (et même
      // commentaire de tête, ligne ~2090) : la portée N'EST PAS appliquée
      // dans `applyContactListFiltersExceptState`, pour que `tallyQb` (et
      // donc le compteur « Tous » de `recommendedTally`) reste SANS elle.
      // `narrowToRecommendedScope` referme `qb` AVANT pagination — c'est
      // cette clause SQL qui garantit que le chemin recommandé atterrit en
      // page 1, quelle que soit la page où il serait tombé sans elle.
      let recommendedTally: ContactRecommendedTally | undefined
      // #3942.5 — le rang (« N° k ») et la taille du chemin de son compte,
      // posés sur CHAQUE ligne rendue — `narrowToRecommendedScope` les connaît
      // déjà (même classement, GA-26), jamais un second calcul côté web.
      let recommendedRankByContact = new Map<string, number>()
      let recommendedPathSizeByAccount = new Map<string, number>()
      if (recommendedScopeApplies(filters)) {
        const recommended = await this.narrowToRecommendedScope(qb, workspaceId)
        recommendedRankByContact = recommended.rankByContact
        recommendedPathSizeByAccount = recommended.pathSizeByAccount
        // Compteur UNIQUEMENT sur la 1re page, même convention que
        // `lifecycleTally` : le scroll infini ne le repaie pas.
        if (offset === 0) {
          recommendedTally = { recommended: recommended.ids.size, all: await tallyQb.clone().getCount() }
        }
      }

      // #4982.1/.2 — tri « zone » EN SQL (palier, puis ville pour des groupes contigus, puis l'ordre d'avant) ; la ville
      // du groupe voyage sur chaque ligne. Sans `sort`, l'ordre d'avant reste byte-identique.
      if (filters.sort === 'zone') {
        const zone = zoneSort(sellerFocusFrom(await this.profileDataOf(userId)))
        qb.addSelect(ZONE_CITY_SELECT_SQL, 'zone_city')
        // #4982 — région d'abord (Louis 31/10) : palier, puis région (inconnue en dernier), puis ville.
        qb.addSelect(ZONE_DEPARTMENT_SELECT_SQL, 'zone_department')
        qb.orderBy(zone.tier, 'ASC')
          .addOrderBy(zone.region, 'ASC', 'NULLS LAST')
          .addOrderBy(`${zone.city}`, 'ASC', 'NULLS LAST')
          .addOrderBy('contact.created_at', 'DESC')
          .addOrderBy('contact.id', 'DESC')
        for (const [name, value] of Object.entries(zone.params)) qb.setParameter(name, value)
      }
      if (filters.state) {
        qb.andWhere(`${LIFECYCLE_STATE_SQL} = :state`, { state: filters.state })
      }

      // PERF (P5, 29/09) — le total, la page et les quatre agrégats de la 1re
      // page sont INDÉPENDANTS : ils partaient en série (6 aller-retours pour
      // une liste à 5,8 s en prod). Ils partent maintenant ensemble ; les
      // réponses, elles, ne changent pas d'une virgule.
      const totalPromise = qb.clone().getCount()
      qb.offset(offset).limit(limit)
      const rowsPromise = qb.getRawMany<{
        id: string
        account_id: string
        full_name: string
        title: string | null
        entity: string | null
        decision_role: string | null
        declared_person_company_relation: string | null
        priority: number | null
        email: string | null
        phone: string | null
        linkedin_url: string | null
        photo_url: string | null
        why_contact: string | null
        user_status: string
        source: string | null
        name_derived_from_email?: string | null
        // #2158.60 — la famille métier (`contacts.family`).
        family: string | null
        // Raw timestamptz — the pg driver yields `Date` in getRawMany; older
        // mocks/fixtures may already hold ISO strings.
        created_at: Date | string
        updated_at: Date | string
        last_enrichment_at: Date | string | null
        last_enrichment_result: EnrichmentAttemptResult | null
        last_enrichment_missing: string[] | null
        enrichment_coordinates: EnrichmentCoordinateStates | null
        email_availability: ContactAvailability | null
        phone_availability: ContactAvailability | null
        // #2165.38 — `null` quand la colonne est vide : INCONNU, jamais une
        // chaîne vide qui s'afficherait comme un lieu.
        location: string | null
        // #4503 — `null` sans compte ou sans siège connu.
        account_headquarters: string | null
        apollo_current_org: string | null
        employer_unverified: boolean | null
        employment_check: unknown
        company_name: string
        excluded_at: Date | string | null
        exclusion_reason: string | null
        tags?: string[] | null
        email_bounced_at: Date | string | null
        next_relance_due_date: Date | string | null
      }>()
      // Un SEUL agrégat GROUP BY, et uniquement sur la 1re page (le scroll
      // infini ne le repaie pas). Les agrégats SECONDAIRES sont bornés
      // (`withinBudget`) : la liste ne les attend jamais au-delà du budget.
      const tailPromise = Promise.all([
        offset === 0 ? this.lifecycleTally(tallyQb) : undefined,
        offset === 0 ? this.lifecycleWeeklyNet(tallyQb) : undefined,
        // #4456 — le décompte des raisons d'exclusion n'est plus calculé ici (timeout + « Slow DB Query » sur
        // cette route, pour un champ qu'aucun écran ne lit depuis #3933). Voir contacts.service.spec.ts.
        offset === 0
          ? withinBudget(this.preCreationExclusionsTally(workspaceId), SECONDARY_TALLY_BUDGET_MS, this.logger)
          : undefined,
        // #4527.1 — dernier de la liste : les lectures voisines gardent leur ordre.
        offset === 0
          ? this.channelTally(workspaceId, filters, businessUnitScope, recommendedScopeApplies(filters))
          : undefined,
      ])
      // Si la page échoue avant que la queue soit attendue, son rejet ne doit
      // pas devenir un « unhandledRejection » : l'erreur est déjà rendue par
      // le `catch` global.
      tailPromise.catch(() => undefined)
      totalPromise.catch(() => undefined)
      rowsPromise.catch(() => undefined)
      const rows = await rowsPromise
      // #4016 L4.1 — les adresses ESTIMÉES de la page, en une requête : la liste les badge.
      const estimatedEmails = this.provenance
        ? await this.provenance.estimatedAmong(
            'contact',
            rows.filter(row => row.email).map(row => row.id),
            'email',
          )
        : new Map<string, string>()
      const toIso = (value: Date | string): string => (value instanceof Date ? value.toISOString() : value)
      const data: ContactListItem[] = rows.map(
        ({ apollo_current_org, employer_unverified, employment_check, name_derived_from_email, ...row }) => {
          // #3911.1 — le MÊME extrait sert les deux calculs juste en dessous
          // (GA-26) : un rattachement sans ancre exacte ne doit pas se
          // présenter avec la même confiance qu'un rattachement vérifié.
          const apolloDetails = apollo_current_org
            ? { organization: apollo_current_org, employerUnverified: employer_unverified ?? undefined }
            : null
          return {
            ...row,
            // #4106/#3698 — une recherche de mobile a une FIN : « en recherche » trop vieux se lit « introuvable » (ou « inconnu » si personne n'a répondu).
            enrichment_coordinates: settleStalePendingCoordinates(row.enrichment_coordinates, Date.now()),
            // #4586 — jamais une adresse pour nom : les fiches créées avant la garde d'écriture se lisent par leur partie locale.
            full_name: displayedContactName(row.full_name, row.email),
            email: displayedContactEmail(row.email),
            // #4586.5 — l'APPELANT de `nameDerivedFromEmail` : la liste sait dire qu'un nom est une déduction.
            name_derived_from_email: isNameDerivedFromEmail(row.full_name, row.email, name_derived_from_email),
            decision_role: row.decision_role as ContactListItem['decision_role'],
            user_status: row.user_status as ContactListItem['user_status'],
            // #2158.60 — `contacts.family` est un TEXT libre (migration `1782000000000`,
            // sans CHECK) rempli UNIQUEMENT par le classifieur déterministe
            // (`contact-classifier.ts`), qui n'émet que les valeurs de
            // `contactFamilySchema` — même confiance que `decision_role`/`user_status`
            // ci-dessus, deux autres colonnes texte alimentées par du code interne.
            family: row.family as ContactListItem['family'],
            created_at: toIso(row.created_at),
            updated_at: toIso(row.updated_at),
            last_enrichment_at: row.last_enrichment_at ? toIso(row.last_enrichment_at) : null,
            // L'étiquette de source, avec le MÊME calcul que le score — un seul,
            // pour que le badge et la note ne puissent pas se contredire.
            source_tag: contactSourceTag(
              row.source ?? null,
              apolloDetails,
              row.company_name,
              row.entity ?? null,
            ) as ContactListItem['source_tag'],
            // #2296.10/.36/.37 — la correction humaine gagne toujours (le badge
            // ci-dessus ne bascule jamais RISQUE sur une ligne humaine), mais le
            // désaccord entre les deux sources est NOMMÉ plutôt que tu.
            employer_conflict:
              employerConflict(row.source ?? null, apolloDetails, row.company_name, row.entity ?? null) ?? undefined,
            // #4290.12 — `null` = aucune preuve de départ.
            employment_left: employmentLeftOf(employment_check),
            excluded_at: row.excluded_at ? toIso(row.excluded_at) : null,
            // #2159.26 — `[]` = aucune étiquette posée, jamais `null` à l'écran.
            tags: Array.isArray(row.tags) ? row.tags : [],
            // #2733 — `null` = aucun rebond connu, jamais une date inventée.
            email_bounced_at: row.email_bounced_at ? toIso(row.email_bounced_at) : null,
            // #4016 L4.1 — `null` = adresse non estimée ; sinon la date de sa vérification.
            email_estimated_at: estimatedEmails.get(row.id) ?? null,
            // #3098 — `null` = aucune touche de cadence planifiée, jamais une date
            // inventée (la carte du Kanban n'affiche alors aucune ligne « relance »).
            next_relance_due_date: row.next_relance_due_date ? toIso(row.next_relance_due_date) : null,
            // #3942.5 — absent hors portée Recommandés (jamais un rang inventé
            // pour une ligne qui n'en a pas). `recommended_rank` existe dès que
            // la MAP le connaît ; `undefined` sur un contact sans compte, qui
            // n'a jamais pu entrer dans un chemin recommandé.
            ...(recommendedRankByContact.size > 0
              ? {
                  recommended_rank: recommendedRankByContact.get(row.id),
                  recommended_path_size: row.account_id ? recommendedPathSizeByAccount.get(row.account_id) : undefined,
                }
              : {}),
          }
        },
      )
      const total = await totalPromise
      const [lifecycleTally, lifecycleWeeklyNet, preCreationExclusions, channelTally] = await tailPromise

      const current = Math.floor(offset / limit) + 1
      const totalPages = total === 0 ? 0 : Math.ceil(total / limit)
      return {
        data,
        ...(lifecycleTally ? { lifecycleTally } : {}),
        ...(lifecycleWeeklyNet === undefined ? {} : { lifecycleWeeklyNet }),
        ...(preCreationExclusions && Object.keys(preCreationExclusions).length > 0 ? { preCreationExclusions } : {}),
        ...(recommendedTally ? { recommendedTally } : {}),
        ...(channelTally ? { channelTally } : {}),
        pagination: {
          currentPage: current,
          size: limit,
          totalItems: total,
          totalPages,
          hasNext: current < totalPages,
          hasPrev: current > 1,
        },
      }
    } catch (err) {
      this.logger.error('findAllForUser error', { error: err })
      return {
        data: [],
        pagination: {
          currentPage: 1,
          size: filters.limit ?? 25,
          totalItems: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      }
    }
  }

  /**
   * #2799 (épopée) / #2374.16-17 — le CONTEXTE des sept axes du score de
   * réactivation dormante (`computeDormantReactivationScore`, `@bellum/
   * contracts`) que `findAllForUser` ne porte pas déjà : les signaux, le
   * score et le porteur du COMPTE, et un résumé de l'historique d'activité
   * (nombre + dernier sujet) TOUTE PÉRIODE confondue — contrairement au
   * filtre `dormantMonths`, qui ne regarde que la fenêtre récente.
   *
   * `contactIds` vient déjà d'un appel scopé (`findAllForUser`) ; le filtre
   * `contact.workspace_id` ici est une DÉFENSE EN PROFONDEUR, jamais la seule
   * frontière. SQL brut (`manager.query`), comme `cancelOutreachSequences`
   * plus haut dans ce fichier : le agrégat (compte + dernier sujet en une
   * passe via `ARRAY_AGG ... ORDER BY`) n'a pas d'équivalent simple dans le
   * query builder TypeORM.
   */
  async dormantReactivationSignals(
    contactIds: string[],
    workspaceId: string,
  ): Promise<Map<string, DormantReactivationSignalsRow>> {
    const map = new Map<string, DormantReactivationSignalsRow>()
    if (contactIds.length === 0) return map

    const rows = await this.contacts.manager.query<
      Array<{
        id: string
        signals: DormantReactivationSignalsRow['signals']
        account_priority_score: number | null
        account_assigned_to: string | null
        activity_count: string
        last_activity_subject: string | null
        last_activity_at: Date | string | null
      }>
    >(
      `SELECT
         contact.id AS id,
         contact.signals AS signals,
         account.priority_score AS account_priority_score,
         account.assigned_to AS account_assigned_to,
         COALESCE(activity_stats.cnt, 0) AS activity_count,
         activity_stats.last_subject AS last_activity_subject,
         activity_stats.last_occurred_at AS last_activity_at
       FROM contacts contact
       LEFT JOIN accounts account ON account.id = contact.account_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS cnt,
                (ARRAY_AGG(act.subject ORDER BY act.occurred_at DESC))[1] AS last_subject,
                MAX(act.occurred_at) AS last_occurred_at
         FROM activities act
         WHERE act.contact_id = contact.id
       ) activity_stats ON true
       WHERE contact.id = ANY($1::uuid[]) AND contact.workspace_id = $2`,
      [contactIds, workspaceId],
    )

    for (const row of rows) {
      const lastActivityAt = row.last_activity_at
        ? row.last_activity_at instanceof Date
          ? row.last_activity_at
          : new Date(row.last_activity_at)
        : null
      const monthsSinceLastActivity = lastActivityAt
        ? Math.floor((Date.now() - lastActivityAt.getTime()) / (30 * 24 * 60 * 60 * 1000))
        : null
      map.set(row.id, {
        signals: Array.isArray(row.signals) ? row.signals : null,
        accountPriorityScore: row.account_priority_score,
        accountAssignedTo: row.account_assigned_to,
        pastActivityCount: Number(row.activity_count),
        lastActivitySubject: row.last_activity_subject,
        monthsSinceLastActivity,
      })
    }
    return map
  }

  /**
   * Laura compte avant de proposer (décision Louis, 15/09/2026) — combien de
   * contacts correspondraient à CE filtre, avant qu'elle propose le lien
   * (`POST /internal/copilot/contacts/count`, `copilot-bridge.controller.ts`).
   * RÉUTILISE le même WHERE que `findAllForUser`
   * (`applyContactListFiltersExceptState`, GA-26) : deux chemins qui le
   * referaient chacun de leur côté finiraient par diverger au premier filtre
   * oublié.
   *
   * Contrairement à `findAllForUser`, une erreur ici N'EST PAS avalée en un
   * `0` de repli : elle REMONTE à l'appelant. « Non mesuré » n'est jamais
   * « 0 » (CLAUDE.md, doctrine) — un `0` né d'une panne ferait taire un lien
   * par ailleurs parfaitement valide. Le pont copilote traduit cette
   * exception en réponse non-2xx, que le service IA lit déjà comme « je n'ai
   * pas pu compter », jamais comme un filtre vide.
   */
  async countForUser(
    userId: string,
    filters: ContactListQuery = {},
    /** Le périmètre (BU) de l'appelant, RÉSOLU PAR LE CONTRÔLEUR. `null` = tout
     *  l'espace : c'est le défaut historique, et le chemin des appelants
     *  internes (pipeline d'analyse, tableau de bord) reste byte-identique. */
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<number> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const qb = await this.applyContactListFiltersExceptState(
      this.contacts.createQueryBuilder('contact').leftJoin('accounts', 'account', 'account.id = contact.account_id'),
      workspaceId,
      filters,
      // ⚠️ Le compte et la liste comptent la MÊME population : un compteur qui
      // annoncerait plus de contacts que la liste n'en montre laisserait deux
      // nombres vrais et personne pour savoir lequel croire.
      businessUnitScope,
    )
    // #3942.2 — même filtre que `findAllForUser` (GA-26) : un compteur qui
    // ignorerait la portée « Recommandés » annoncerait un total qui ne
    // correspond plus à ce que la liste montre sous ce même geste.
    // #3942.5 — `order: false` : compter n'a besoin d'aucun tri, la requête
    // d'ordre des comptes (`LAST_ANALYZED_SQL`) ne se paie donc pas ici.
    if (recommendedScopeApplies(filters)) {
      await this.narrowToRecommendedScope(qb, workspaceId, { order: false })
    }
    if (filters.state) {
      qb.andWhere(`${LIFECYCLE_STATE_SQL} = :state`, { state: filters.state })
    }
    return qb.getCount()
  }

  /**
   * Compte les contacts par état du cycle de vie sur l'ENSEMBLE du jeu filtré.
   *
   * `qb` est le query builder de la liste, cloné avant pagination ET avant le
   * filtre `state`. On y substitue la projection par un GROUP BY : l'ORDER BY de
   * la liste est retiré (Postgres refuse d'ordonner sur une colonne absente du
   * regroupement) et le LIMIT/OFFSET n'a jamais été posé sur ce clone.
   *
   * Échec ⇒ `undefined`, jamais un tally partiel : mieux vaut que l'écran
   * n'affiche aucun compteur qu'un chiffre faux.
   */
  /**
   * #4527.1/.2 — les chiffres des tuiles « Avec e-mail · Avec téléphone · À rattacher » et de la
   * puce « Mon CRM » : UNE requête, côté serveur, sur la population de la liste (recherche, vue,
   * compte, filtres, état) SANS les filtres que les puces posent elles-mêmes (`channel`,
   * `unassigned`, `source`) — chaque chiffre est le nombre de lignes que sa puce afficherait.
   * Les prédicats sont CEUX du filtre de liste (`recordedPhoneSql`, GA-26) : « a un
   * téléphone » n'a qu'une définition (#4527.4). Borne d'espace posée par le même
   * `applyContactListFiltersExceptState` que la liste.
   *
   * ⚠️ Échec ou réponse incomplète ⇒ `undefined`, jamais `0` (GA-18/19, garde 549f2b2753).
   */
  private async channelTally(
    workspaceId: string,
    filters: ContactListQuery,
    businessUnitScope: BusinessUnitScopeClause,
    recommended: boolean,
  ): Promise<ContactChannelTally | undefined> {
    try {
      const { channel: _channel, unassigned: _unassigned, source: _source, ...shared } = filters
      const qb = await this.applyContactListFiltersExceptState(
        this.contacts.createQueryBuilder('contact').leftJoin('accounts', 'account', 'account.id = contact.account_id'),
        workspaceId,
        shared,
        businessUnitScope,
      )
      if (recommended) await this.narrowToRecommendedScope(qb, workspaceId, { order: false })
      if (filters.state) qb.andWhere(`${LIFECYCLE_STATE_SQL} = :state`, { state: filters.state })
      // #4660 — « À rattacher », « HubSpot » et « Importés » se comptent HORS portée « Recommandés » : leur geste la lève
      // (recommendedScopeApplies), donc la population qu'ils affichent est celle du répertoire filtré, pas celle du chemin
      // recommandé (où ces fiches, sans compte, valent toujours 0 — un sous-ensemble plus grand que l'ensemble).
      let wideRow: Record<'unattached' | 'mon_crm' | 'imported', number | string | undefined> | undefined
      if (recommended) {
        const wide = await this.applyContactListFiltersExceptState(
          this.contacts
            .createQueryBuilder('contact')
            .leftJoin('accounts', 'account', 'account.id = contact.account_id'),
          workspaceId,
          shared,
          businessUnitScope,
        )
        if (filters.state) wide.andWhere(`${LIFECYCLE_STATE_SQL} = :state`, { state: filters.state })
        wideRow = await wide
          .orderBy()
          .select('COUNT(*) FILTER (WHERE contact.account_id IS NULL)::int', 'unattached')
          .addSelect(
            `COUNT(*) FILTER (WHERE contact.source IN (${MON_CRM_SOURCES.map(s => `'${s}'`).join(', ')}))::int`,
            'mon_crm',
          )
          .addSelect(`COUNT(*) FILTER (WHERE contact.source = 'import')::int`, 'imported')
          .getRawOne<Record<'unattached' | 'mon_crm' | 'imported', number | string | undefined>>()
      }
      const row = await qb
        .orderBy()
        .select(`COUNT(*) FILTER (WHERE ${recordedEmailSql('contact')})::int`, 'with_email')
        .addSelect(`COUNT(*) FILTER (WHERE ${recordedPhoneSql('contact')})::int`, 'with_phone')
        .addSelect('COUNT(*) FILTER (WHERE contact.account_id IS NULL)::int', 'unattached')
        .addSelect(`COUNT(*) FILTER (WHERE ${monCrmContactSql('contact')})::int`, 'mon_crm')
        // #4597.1 — « Importés » : les fiches `source = 'import'`, la MÊME définition que le filtre `source=import`.
        .addSelect(`COUNT(*) FILTER (WHERE ${importedContactSql('contact')})::int`, 'imported')
        .getRawOne<
          Record<'with_email' | 'with_phone' | 'unattached' | 'mon_crm' | 'imported', number | string | undefined>
        >()
      const read = (value: number | string | undefined): number | undefined => {
        const n = value === undefined || value === null ? NaN : Number(value)
        return Number.isInteger(n) && n >= 0 ? n : undefined
      }
      const withEmail = read(row?.with_email)
      const withPhone = read(row?.with_phone)
      const unattached = read((wideRow ?? row)?.unattached)
      const monCrm = read((wideRow ?? row)?.mon_crm)
      if (withEmail === undefined || withPhone === undefined || unattached === undefined || monCrm === undefined) {
        return undefined
      }
      // Illisible ⇒ la clé manque (la puce se tait), sans emporter les autres chiffres.
      const imported = read((wideRow ?? row)?.imported)
      return { withEmail, withPhone, unattached, monCrm, ...(imported === undefined ? {} : { imported }) }
    } catch (err) {
      this.logger.error('channelTally error', { error: err })
      return undefined
    }
  }

  private async lifecycleTally(qb: SelectQueryBuilder<ContactEntity>): Promise<ContactLifecycleTally | undefined> {
    try {
      // `clone()` : le qb partagé sert AUSSI aux trois autres agrégats, lancés en
      // parallèle (P5) — le muter ici leur ferait hériter du GROUP BY.
      const rows = await qb
        .clone()
        .orderBy()
        .select(LIFECYCLE_STATE_SQL, 'state')
        .addSelect('COUNT(*)::int', 'count')
        .groupBy(LIFECYCLE_STATE_SQL)
        .getRawMany<{ state: string; count: number | string }>()

      const tally = emptyLifecycleTally()
      for (const row of rows) {
        const state = row?.state as ContactLifecycleState
        if (state in tally) tally[state] = Number(row.count) || 0
      }
      return tally
    } catch (err) {
      this.logger.error('lifecycleTally error', { error: err })
      return undefined
    }
  }

  /**
   * Combien de contacts de CETTE population ont été créés depuis sept jours.
   *
   * Le même `tallyQb` que le funnel — donc les mêmes filtres, la même
   * recherche, la même portée d'espace. C'est tout l'intérêt : le nombre
   * s'affiche SOUS le funnel, et deux nombres voisins qui comptent des
   * populations différentes se contredisent (« 254 détectés » surmonté de
   * « +255 cette semaine », mesuré sur la démonstration le 28/08).
   *
   * ⚠️ Un échec de lecture rend `undefined`, jamais `0` : « on n'a pas pu
   * compter » n'est pas « personne n'est arrivé ».
   */
  private async lifecycleWeeklyNet(qb: SelectQueryBuilder<ContactEntity>): Promise<number | undefined> {
    try {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000)
      const row = await qb
        .clone()
        .orderBy()
        .select('COUNT(*)::int', 'count')
        .andWhere('contact.created_at >= :weeklyFrom', { weeklyFrom: weekAgo })
        .getRawOne<{ count: number | string }>()
      const count = Number(row?.count)
      return Number.isFinite(count) ? count : undefined
    } catch (err) {
      this.logger.error('lifecycleWeeklyNet error', { error: err })
      return undefined
    }
  }

  /**
   * #2309.16/.19 — POURQUOI un candidat n'est jamais devenu une fiche, sur cet
   * espace. Lit `contact_intake_exclusions` (voir la migration pour la raison
   * de la table séparée) plutôt que de recompter depuis `contacts` — ces
   * candidats n'y ont jamais eu de ligne.
   *
   * Une raison à zéro est ABSENTE de l'objet rendu : « on n'affiche pas ce
   * qu'on n'a pas ».
   */
  private async preCreationExclusionsTally(workspaceId: string): Promise<ContactPreCreationExclusions | undefined> {
    if (!this.intakeExclusions) return undefined
    try {
      const rows = await this.intakeExclusions
        .createQueryBuilder('exclusion')
        .select('exclusion.reason', 'reason')
        .addSelect('COUNT(*)::int', 'count')
        .where('exclusion.workspace_id = :workspaceId', { workspaceId })
        .groupBy('exclusion.reason')
        .getRawMany<{ reason: string; count: number | string }>()
      const tally: ContactPreCreationExclusions = {}
      for (const row of rows) {
        const count = Number(row.count) || 0
        if (count > 0 && (row.reason === 'ambiguous_identity' || row.reason === 'duplicate_identity')) {
          tally[row.reason] = count
        }
      }
      return tally
    } catch (err) {
      this.logger.error('preCreationExclusionsTally error', { error: err })
      return undefined
    }
  }

  /** Journalise `count` candidat(s) qui ne deviendront JAMAIS une fiche —
   *  appelé par les seuls points qui refusent une création AVANT toute
   *  écriture dans `contacts` (voir la migration `ContactIntakeExclusions`
   *  pour la raison). Best-effort : une panne d'écriture de ce journal ne
   *  doit jamais faire échouer le refus de création lui-même. `count <= 0` ⇒
   *  aucune écriture. */
  private async recordIntakeExclusions(
    workspaceId: string,
    accountId: string,
    reason: 'ambiguous_identity' | 'duplicate_identity',
    count: number,
  ): Promise<void> {
    if (!this.intakeExclusions || count <= 0) return
    try {
      await this.intakeExclusions.insert(
        Array.from({ length: count }, () => ({ workspace_id: workspaceId, account_id: accountId, reason })),
      )
    } catch (err) {
      this.logger.error('recordIntakeExclusions error', { error: err })
    }
  }

  async findOne(
    id: string,
    userId: string,
    /** Le périmètre (BU) de l'appelant, RÉSOLU PAR LE CONTRÔLEUR. `null` = tout
     *  l'espace : c'est le défaut historique, et le chemin des appelants
     *  internes (pipeline d'analyse, tableau de bord) reste byte-identique. */
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<
    Result<
      ContactEntity & {
        merged_from?: string
        owner: { user_id: string; name: string } | null
        solicitation: { colleague: { user_id: string; name: string }; lastTouchOn: string; withinDays: number } | null
        /** Théo B C5.R2 — le badge relationnel dérivé + le statut déclaré ; absent sans dépôt d'activités. */
        relation_badge?: ContactRelationBadge
        /** #4016.L13 — les contradictions qui tiennent ; absent = aucune. */
        field_contradictions?: FieldContradiction[]
      },
      ContactFailure
    >
  > {
    // Phase 2: view any contact in the caller's workspace. Activity feed stays
    // personal (its own user_actions).
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    let row = await this.contacts.findOne({
      where: {
        id,
        deleted_at: IsNull(),
        ...workspaceScopeWhere(workspaceId),
        // Le périmètre du COMPTE de ce contact — revue sécurité 15/09/2026.
        ...this.contactBusinessUnitWhere(businessUnitScope),
      },
    })

    // Not found may mean "merged away", not "never existed". Resolve the alias
    // and re-read through the SAME workspace scope — the merge log must never
    // become a way to reach another tenant's row.
    let mergedFrom: string | undefined
    if (!row) {
      const survivorId = await this.resolveMergedContactId(id)
      if (survivorId) {
        row = await this.contacts.findOne({
          where: { id: survivorId, deleted_at: IsNull(), ...workspaceScopeWhere(workspaceId) },
        })
        if (row) mergedFrom = id
      }
    }

    if (!row) {
      return failure({ code: 'not_found', message: `Contact ${id} not found` })
    }
    const activity = await this.findContactActivity(row.id, userId)
    const [contact] = await this.scoreContacts(
      [{ ...row, activity: mergeContactActivity(activity, row.activity) }],
      row.account_id,
      await this.sellerScoringOf(userId),
    )
    // #2160.9 — le porteur nommé, pour la tête de fiche.
    const owner = await this.resolveContactOwner(row.assigned_to)
    // #2128.17 — collision de sollicitation sur CE contact précis.
    const solicitation = await this.resolveContactSolicitation(workspaceId, row.id, userId)
    // #2988 (#2161) — provenance PAR CHAMP (source + date), sur la fiche.
    // `@Optional()` en amont : sans le dépôt, ce champ est simplement absent.
    const fieldProvenance = this.provenance ? await this.provenance.currentSourcesDetailed('contact', row.id) : {}
    // #4016.L13 — le fait confirmé reste affiché ; la source qui le contredit se nomme à côté.
    const fieldContradictions = this.provenance
      ? await this.provenance.contradictionsFor(workspaceId, 'contact', row.id)
      : []
    // #3692.7 — le motif est-il le même sur tout le parc ?
    const whyContactShared = await this.isWhyContactShared(workspaceId, row.id, row.why_contact)
    // `merged_from` is only present when the caller asked for a retired id. The
    // front uses it to rewrite the address bar to the canonical URL.
    // Théo B C5.R2 — « Échange engagé » dérivé de l'historique ; la déclaration humaine (`user_status`) gagne.
    const relationBadge = await readContactRelationBadge(
      this.activityRows,
      workspaceScopeWhere(workspaceId),
      row.id,
      contactStatusSchema.safeParse(row.user_status).data,
    )
    const detail = {
      ...contact,
      owner,
      solicitation,
      ...(relationBadge ? { relation_badge: relationBadge } : {}),
      field_provenance: fieldProvenance,
      ...(fieldContradictions.length > 0 ? { field_contradictions: fieldContradictions } : {}),
    }
    return success(
      mergedFrom
        ? { ...detail, merged_from: mergedFrom, why_contact_shared: whyContactShared }
        : { ...detail, why_contact_shared: whyContactShared },
    )
  }

  /**
   * #3692.7 — le `why_contact` de ce contact est-il IDENTIQUE à celui d'au moins
   * deux autres contacts de l'espace ? Comparaison normalisée (casse, espaces,
   * ponctuation finale). Un échec de lecture ne retire rien : `false`, le texte
   * reste affiché — on ne cache pas une donnée sur une panne.
   */
  private async isWhyContactShared(
    workspaceId: string,
    contactId: string,
    whyContact: string | null,
  ): Promise<boolean> {
    const normalized = normalizeWhyContact(whyContact)
    if (!normalized) return false
    try {
      // QueryBuilder, pas de lecture SQL brute de plus (GA-405).
      const others = await this.contacts
        .createQueryBuilder('c')
        .where('c.workspace_id = :workspaceId AND c.deleted_at IS NULL AND c.id <> :contactId', {
          workspaceId,
          contactId,
        })
        .andWhere("regexp_replace(lower(btrim(c.why_contact)), '[\\s.!?;:]+$', '') = :normalized", { normalized })
        .getCount()
      return others >= WHY_CONTACT_SHARED_MIN_OTHERS
    } catch (err) {
      this.logger.error('isWhyContactShared error', { error: err })
      return false
    }
  }

  /**
   * #2128.17 — CE CONTACT PRÉCIS a-t-il déjà été sollicité par un collègue
   * récemment ? Même fenêtre que la collision de prospection au niveau du
   * compte (`workspace-memory-crossings.service.ts` G4,
   * `MEMORY_POLICY_DEFAULTS.ownerPriorityDays` — le réglage vit à un seul
   * endroit, LU ici plutôt que réécrit, GA-26), mais bornée au CONTACT
   * (`user_actions.contact_id`) plutôt qu'au compte entier — lue via
   * `userActions.query` (jamais `this.contacts.query`, pour ne rien mélanger
   * avec la résolution du porteur ci-dessus). `ORDER BY … DESC LIMIT 1` rend
   * le collègue le plus RÉCENT, pas le plus actif — on ne classe pas les
   * pairs entre eux.
   */
  private async resolveContactSolicitation(
    workspaceId: string,
    contactId: string,
    userId: string,
  ): Promise<{ colleague: { user_id: string; name: string }; lastTouchOn: string; withinDays: number } | null> {
    const withinDays = MEMORY_POLICY_DEFAULTS.ownerPriorityDays
    try {
      const rows = await this.userActions.query<
        { userId: string; lastTouch: Date; firstName: string | null; lastName: string | null }[]
      >(
        `SELECT ua.user_id AS "userId", MAX(ua.created_at) AS "lastTouch",
                p.first_name AS "firstName", p.last_name AS "lastName"
         FROM user_actions ua
         LEFT JOIN profiles p ON p.user_id = ua.user_id
         WHERE ua.workspace_id = $1
           AND ua.contact_id = $2
           AND ua.user_id <> $3
           AND ua.created_at >= now() - make_interval(days => $4::int)
         GROUP BY ua.user_id, p.first_name, p.last_name
         ORDER BY "lastTouch" DESC
         LIMIT 1`,
        [workspaceId, contactId, userId, withinDays],
      )
      const row = rows[0]
      if (!row) return null
      const name = [row.firstName, row.lastName].filter(Boolean).join(' ').trim()
      if (!name) return null
      return {
        colleague: { user_id: row.userId, name },
        lastTouchOn: new Date(row.lastTouch).toISOString().slice(0, 10),
        withinDays,
      }
    } catch (err) {
      // La collision est un CONFORT d'affichage : son absence ne doit jamais
      // priver le commercial de sa fiche.
      this.logger.error('resolveContactSolicitation error', { error: err })
      return null
    }
  }

  /**
   * #2386.6 — la MÊME collision (#2128.17), pour PLUSIEURS contacts en un
   * aller-retour : la session de prospection (`prospecting-session.ts`)
   * construit sa liste SANS appel réseau supplémentaire — nommer une
   * collision par contact ne doit pas en coûter UN PAR CONTACT.
   *
   * Un id demandé qui n'appartient pas à cet espace (ou n'existe plus) est
   * ABSENT de la réponse — jamais un `null` deviné pour un id qu'on n'a pas
   * vérifié (GA-18/19), et jamais un oracle d'existence sur un autre tenant.
   */
  async resolveContactsSolicitations(
    userId: string,
    contactIds: readonly string[],
  ): Promise<Record<string, ContactSolicitation>> {
    const result: Record<string, ContactSolicitation> = {}
    if (contactIds.length === 0) return result

    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const owned = await this.contacts.find({
      where: { id: In([...new Set(contactIds)]), deleted_at: IsNull(), ...workspaceScopeWhere(workspaceId) },
      select: ['id'],
    })
    if (owned.length === 0) return result
    for (const row of owned) result[row.id] = null

    const withinDays = MEMORY_POLICY_DEFAULTS.ownerPriorityDays
    try {
      const rows = await this.userActions.query<
        {
          contactId: string
          userId: string
          lastTouch: Date
          firstName: string | null
          lastName: string | null
        }[]
      >(
        `SELECT contact_id AS "contactId", user_id AS "userId", "lastTouch", "firstName", "lastName" FROM (
           SELECT ua.contact_id AS contact_id, ua.user_id AS user_id, MAX(ua.created_at) AS "lastTouch",
                  p.first_name AS "firstName", p.last_name AS "lastName",
                  ROW_NUMBER() OVER (PARTITION BY ua.contact_id ORDER BY MAX(ua.created_at) DESC) AS rn
           FROM user_actions ua
           LEFT JOIN profiles p ON p.user_id = ua.user_id
           WHERE ua.workspace_id = $1
             AND ua.contact_id = ANY($2)
             AND ua.user_id <> $3
             AND ua.created_at >= now() - make_interval(days => $4::int)
           GROUP BY ua.contact_id, ua.user_id, p.first_name, p.last_name
         ) ranked
         WHERE rn = 1`,
        [workspaceId, owned.map(row => row.id), userId, withinDays],
      )
      for (const row of rows) {
        const name = [row.firstName, row.lastName].filter(Boolean).join(' ').trim()
        if (!name) continue
        result[row.contactId] = {
          colleague: { user_id: row.userId, name },
          lastTouchOn: new Date(row.lastTouch).toISOString().slice(0, 10),
          withinDays,
        }
      }
    } catch (err) {
      // Même garde que la version unitaire : un CONFORT d'affichage, son
      // absence ne doit jamais priver le commercial de sa session.
      this.logger.error('resolveContactsSolicitations error', { error: err })
    }
    return result
  }

  /**
   * #2160.9 — LE PORTEUR NOMMÉ d'UN contact, pour la tête de fiche.
   *
   * Même dérivation que `AccountsService.resolveOwner` (prénom + nom, à défaut
   * l'email ; absent = profil illisible → `null`, jamais deviné). Copiée plutôt
   * qu'injectée : `AccountsModule` importe déjà `ContactsModule` (un compte
   * liste ses contacts) — l'inverse créerait un cycle de modules Nest. Si cette
   * dérivation bouge un jour, la faire bouger aux DEUX endroits (GA-26) plutôt
   * que de la extraire à moitié.
   */
  private async resolveContactOwner(assignedTo: string | null): Promise<{ user_id: string; name: string } | null> {
    if (!assignedTo) return null
    try {
      const rows = await this.contacts.query<
        { userId: string; firstName: string | null; lastName: string | null; email: string | null }[]
      >(
        `SELECT user_id AS "userId", first_name AS "firstName", last_name AS "lastName", email AS "email"
         FROM profiles WHERE user_id = $1`,
        [assignedTo],
      )
      const row = rows[0]
      if (!row) return null
      const name = [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || (row.email ?? '')
      return name ? { user_id: row.userId, name } : null
    } catch (err) {
      // Le porteur est un CONFORT d'affichage : son absence ne doit jamais
      // priver le commercial de sa fiche.
      this.logger.error('resolveContactOwner error', { error: err })
      return null
    }
  }

  /** #4731 / #4803 — la clé d'un geste sur un contact vit dans `contact-gesture-scope.ts` (GA-26). */
  private async contactGestureTarget(
    id: string | string[],
    userId: string,
  ): Promise<FindOptionsWhere<ContactEntity>[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return contactGestureWhere(workspaceId, userId, id)
  }

  /** #4731 — même clé pour le COMPTE d'un contact (pays d'enrichissement, ancrage Apollo). */
  private async accountOfContactGestureWhere(
    accountId: string,
    userId: string,
  ): Promise<FindOptionsWhere<AccountEntity>[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return [
      { id: accountId, ...workspaceScopeWhere(workspaceId) },
      { id: accountId, workspace_id: IsNull(), user_id: userId },
    ]
  }

  /**
   * Resolve a contact the caller OWNS (strict `user_id` scope) for an MCP
   * write-action (e.g. `log_to_crm`). Mirrors {@link sendEmail}'s ownership
   * guard so an `mcp:act` token can only ever act on the rep's own contacts —
   * never a teammate's, never cross-tenant. Returns the raw entity (the CRM
   * mapper needs the underlying fields, not the enriched list projection).
   */
  async findOwnedForAction(id: string, userId: string): Promise<Result<ContactEntity, ContactFailure>> {
    const contact = await this.contacts.findOne({ where: await this.contactGestureTarget(id, userId) })
    if (!contact) return failure({ code: 'not_found', message: `Contact ${id} introuvable` })
    return success(contact)
  }

  /**
   * #4418.1 / #4418.3 — « Marquer envoyé » sur un message préparé depuis le plan d'un contact : le même
   * geste déclaratif que celui du pas de séquence (`OutreachController.scheduleFollowUpsForManualTouch`),
   * donc les MÊMES relances J+3/J+6/J+9 (`CadenceService.scheduleForContact`), ancrées sur le jour du geste.
   * Rien n'est écrit sur la fiche : ni `email_sent_at` ni aucune preuve d'envoi — « Fait » n'est jamais
   * « Envoyé » vérifié. Idempotent (une cadence déjà posée n'est jamais doublée) ; une réponse reçue rend
   * ces relances caduques par le chemin #4181.
   */
  async scheduleFollowUpsForDeclaredTouch(
    contactId: string,
    userId: string,
  ): Promise<Result<{ contact_id: string }, ContactFailure>> {
    const contact = await this.contacts.findOne({ where: await this.contactGestureTarget(contactId, userId) })
    if (!contact) return failure({ code: 'not_found', message: `Contact ${contactId} introuvable` })
    await this.cadence.scheduleForContact(contact, userId, new Date())
    return success({ contact_id: contactId })
  }

  /**
   * Écarter un contact (PDF 2, items 82-83 — décision de Louis du 21/08).
   *
   * ───────────────────────────────────────────────────────────────────────────
   * LES DEUX QUESTIONS QUE LE TRACKER LAISSAIT OUVERTES
   * ───────────────────────────────────────────────────────────────────────────
   * **Qui peut ?** Tout siège. Celui qui découvre qu'un contact a quitté
   * l'entreprise est celui qui travaille dessus ; passer par un responsable
   * ferait vivre l'information dans la tête de quelqu'un pendant trois jours.
   *
   * **Que devient une séquence en cours ?** Elle s'ARRÊTE, immédiatement.
   * Continuer d'écrire à quelqu'un qu'on vient d'exclure est la faute la plus
   * visible qu'un outil de prospection puisse commettre — et elle serait
   * commise par l'outil, pas par l'utilisateur qui l'a exclu.
   *
   * Le motif est OBLIGATOIRE. C'est le seul apprentissage que produit un
   * « non » : sans lui, on relit dans six mois une liste de contacts disparus
   * sans savoir lesquels sont partis de l'entreprise et lesquels ont demandé
   * qu'on les laisse tranquilles.
   */
  async excludeContact(
    contactId: string,
    userId: string,
    reason: string,
  ): Promise<Result<{ contact_id: string; excluded_at: string; cancelled_sequences: number }, ContactFailure>> {
    const trimmed = reason.trim()
    if (!trimmed) return failure({ code: 'invalid', message: 'Un motif est obligatoire pour écarter un contact.' })

    const contact = await this.contacts.findOne({ where: await this.contactGestureTarget(contactId, userId) })
    if (!contact) return failure({ code: 'not_found', message: `Contact ${contactId} not found` })

    const now = new Date()
    await this.contacts.update({ id: contactId }, { excluded_at: now, exclusion_reason: trimmed })
    // #3942.5 — un contact écarté sort de l'éligibilité : son compte peut
    // perdre une place du chemin recommandé, le cache périmé devine autrement.
    if (contact.account_id && contact.workspace_id) {
      this.invalidateRecommendedPath(contact.workspace_id, contact.account_id)
    }

    // Les séquences EN COURS s'arrêtent. L'ordre compte : on marque d'abord le
    // contact, puis on annule — l'inverse laisserait une fenêtre où une relance
    // peut partir sur un contact déjà écarté.
    // #4293.3 — l'arrêt sur EXCLUSION est codé ICI, dans le moteur : une séquence en pause s'arrête aussi (elle
    // reprendrait sur un geste « Reprendre »), ses étapes à venir sont sautées et la cause est journalisée —
    // `contact_removed`, la cause « contact écarté » du contrat, que la fiche séquence nomme.
    const cancelled = returnedRows<{ id: string; workspace_id: string | null; previous_status: string }>(
      await this.contacts.manager.query(
        `WITH previous AS (
           SELECT id, workspace_id, status FROM outreach_sequences
            WHERE contact_id = $1 AND status IN ('active', 'paused')
         ), updated AS (
           UPDATE outreach_sequences s SET status = 'cancelled'
             FROM previous WHERE s.id = previous.id
         )
         SELECT id, workspace_id, status AS previous_status FROM previous`,
        [contactId],
      ),
    )
    if (cancelled.length > 0) {
      await this.contacts.manager.query(
        `UPDATE outreach_sequence_steps SET status = 'skipped'
          WHERE sequence_id = ANY($1::uuid[]) AND status = 'pending'`,
        [cancelled.map(row => row.id)],
      )
      for (const row of cancelled) {
        await this.contacts.manager.query(
          `INSERT INTO outreach_transitions
             (workspace_id, user_id, subject_kind, subject_id, from_state, to_state, actor, actor_kind, cause, result)
           VALUES ($1, $2, 'sequence', $3, $4, 'cancelled', $2, 'user', $5, 'applied')`,
          [row.workspace_id ?? null, userId, row.id, row.previous_status ?? null, 'contact_removed'],
        )
      }
    }

    return success({
      contact_id: contactId,
      excluded_at: now.toISOString(),
      cancelled_sequences: cancelled.length,
    })
  }

  /**
   * #3871.1 (lot V11, 07/10, recette prod 2e passe) — l'utilisateur DÉCLARE
   * qu'un contact a quitté l'entreprise, dans la conversation Laura
   * (`propose_contact_departure`, geste utilisateur auto-approuvé).
   *
   * Une correction humaine gagne toujours sur le signal CALCULÉ
   * (`employerMismatch`/`contactSourceTag`, ligne ~1372) : l'état visé est
   * directement `historique`, jamais recalculé contre l'ancien signal. On
   * ARCHIVE, on ne supprime jamais — `rejete` reste un terminal distinct et
   * plus fort (écartement EXPLICITE via `excludeContact`, motif obligatoire) :
   * une déclaration de départ ne l'écrase pas s'il est déjà posé.
   *
   * Même geste que `syncContactLifecycle` quand la transition CALCULÉE
   * atteint `historique` : les séquences outreach actives de ce contact
   * s'arrêtent (`autoStopOutreachSequences`, cause `company_changed`) — la
   * demande #3871 ("revoir les approches concernées") est tenue par le même
   * appel, jamais recodée ici.
   */
  async declareContactDeparted(
    contactId: string,
    userId: string,
  ): Promise<Result<{ contact_id: string; lifecycle_state: ContactLifecycleState }, ContactFailure>> {
    const contact = await this.contacts.findOne({ where: await this.contactGestureTarget(contactId, userId) })
    if (!contact) return failure({ code: 'not_found', message: `Contact ${contactId} introuvable` })

    const prev = (contact.lifecycle_state as ContactLifecycleState | null) ?? null
    if (prev === 'historique' || prev === 'rejete') {
      return success({ contact_id: contactId, lifecycle_state: prev })
    }

    await this.contacts.update(contactId, { lifecycle_state: 'historique' })
    await this.journalTransition({ contactId, from: prev, to: 'historique', source: 'manual', actor: userId })
    await this.autoStopOutreachSequences(contactId, userId, 'company_changed')

    return success({ contact_id: contactId, lifecycle_state: 'historique' })
  }

  /**
   * #4928.5 — « Écarter les contacts de cette entité ». Les contacts d'UN compte rattachés à l'entité nommée sont
   * ÉCARTÉS un à un par `excludeContact` (motif posé, séquences arrêtées) : on archive, on ne supprime pas, réversible
   * par `restoreContact`. UNE correction humaine gagne : seul `restoreContact` lève `excluded_at`, aucune
   * collecte ne le fait — un contact écarté à la main ne se re-rattache pas au passage suivant.
   *
   * Droits : `records:write` (le contrôleur) ; le compte se lit borné à l'espace ACTIF et au périmètre BU de
   * l'appelant, sinon `not_found` sans rien lire ni écrire (le cloisonnement existant, non modifié). Entité ou motif
   * vide ⇒ `invalid` : jamais « écarter tout le compte ».
   */
  async excludeEntityContacts(
    accountId: string,
    userId: string,
    entity: string,
    reason: string,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<Result<{ account_id: string; excluded: number; contact_ids: string[] }, ContactFailure>> {
    const key = entityKey(entity)
    const trimmedReason = reason.trim()
    if (!key) return failure({ code: 'invalid', message: 'Une entité est obligatoire pour écarter ses contacts.' })
    if (!trimmedReason)
      return failure({ code: 'invalid', message: 'Un motif est obligatoire pour écarter des contacts.' })
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const account = (await this.accountIsInScope(accountId, workspaceId, businessUnitScope))
      ? await this.accounts.findOne({ where: { id: accountId, ...workspaceScopeWhere(workspaceId) } })
      : null
    if (!account) return failure({ code: 'not_found', message: `Account ${accountId} not found` })
    const rows = await this.contacts.find({
      where: {
        account_id: accountId,
        deleted_at: IsNull(),
        excluded_at: IsNull(),
        ...workspaceScopeWhere(workspaceId),
      },
      select: { id: true, entity: true },
    })
    const ids = rows.filter(row => entityKey(row.entity ?? '') === key).map(row => row.id)
    for (const id of ids) {
      const done = await this.excludeContact(id, userId, `entité écartée (${entity.trim()}) : ${trimmedReason}`)
      if (isFailure(done)) return done
    }
    return success({ account_id: accountId, excluded: ids.length, contact_ids: ids })
  }

  /**
   * #4928.5 — le geste INVERSE de `excludeEntityContacts` : réintègre les contacts de cette entité écartés AVEC
   * l'entité (motif « entité écartée (…) »). Un contact écarté à la main pour une autre raison n'est jamais
   * retouché : une correction humaine gagne. Mêmes droits et même cloisonnement que l'écartement.
   */
  async restoreEntityContacts(
    accountId: string,
    userId: string,
    entity: string,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<Result<{ account_id: string; restored: number; contact_ids: string[] }, ContactFailure>> {
    const key = entityKey(entity)
    if (!key) return failure({ code: 'invalid', message: 'Une entité est obligatoire pour réintégrer ses contacts.' })
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const account = (await this.accountIsInScope(accountId, workspaceId, businessUnitScope))
      ? await this.accounts.findOne({ where: { id: accountId, ...workspaceScopeWhere(workspaceId) } })
      : null
    if (!account) return failure({ code: 'not_found', message: `Account ${accountId} not found` })
    const rows = await this.contacts.find({
      where: {
        account_id: accountId,
        deleted_at: IsNull(),
        excluded_at: Not(IsNull()),
        ...workspaceScopeWhere(workspaceId),
      },
      select: { id: true, entity: true, exclusion_reason: true },
    })
    const prefix = `entité écartée (${entity.trim()}) :`
    const ids = rows
      .filter(row => entityKey(row.entity ?? '') === key && (row.exclusion_reason ?? '').startsWith(prefix))
      .map(row => row.id)
    for (const id of ids) {
      const done = await this.restoreContact(id, userId)
      if (isFailure(done)) return done
    }
    return success({ account_id: accountId, restored: ids.length, contact_ids: ids })
  }

  /**
   * LUDB.5 — purge CIBLÉE des contacts d'HOMONYMES : ceux déjà rattachés au
   * compte dont le domaine d'e-mail n'est ni celui du compte ni celui de son
   * groupe (« stillfront.com » sur STILL). On ÉCARTE (`excluded_at` + motif
   * « homonyme »), on ne supprime pas — réversible par `restoreContact`. Une
   * correction humaine gagne : identité confirmée ou déjà écarté ⇒ jamais retouché.
   * Sans domaine de compte connu, rien n'est comparé (une absence ne rejette pas).
   */
  async excludeHomonymContacts(
    accountId: string,
    website: string | null | undefined,
    groupDomains: readonly string[] = [],
    workspaceId?: string | null,
  ): Promise<number> {
    // CEDRIC-FIX C.2 — même source du domaine de groupe que la remise aux règles actuelles.
    // GA-380 — le compte se lit borné à l'espace du job ; sans espace, pas de domaine de groupe.
    const account =
      groupDomains.length || !workspaceId
        ? null
        : await this.accounts.findOne({
            where: { id: accountId, workspace_id: workspaceId },
            select: { id: true, workspace_id: true, siren: true, group_head_siren: true },
          })
    const domains = accountDomainsFrom(website, account ? await this.groupDomainsOf(account) : groupDomains)
    if (domains.length === 0) return 0
    const rows = await this.contacts.find({
      where: { account_id: accountId, deleted_at: IsNull(), excluded_at: IsNull(), identity_confirmed_at: IsNull() },
      select: { id: true, email: true },
    })
    const ids = rows.filter(row => isHomonymEmail(row.email, domains)).map(row => row.id)
    if (!ids.length) return 0
    await this.contacts.update({ id: In(ids) }, { excluded_at: new Date(), exclusion_reason: HOMONYM_EXCLUSION_REASON })
    return ids.length
  }

  /**
   * CEDRIC-FIX C.2 — les domaines du GROUPE du compte : le site des autres comptes de l'espace
   * rattachés à la MÊME tête capitalistique DÉCLARÉE (`group_head_siren`, jamais deviné), tête
   * comprise. Un grand groupe écrit ses e-mails sur le domaine du groupe, pas sur celui de
   * l'entité : sans cette lecture, « Remettre aux règles actuelles » archivait ses propres
   * salariés en « homonymes » (SAFRAN AIRCRAFT ENGINES : 18 → 14). Pas de tête déclarée ⇒ aucune
   * lecture, aucun domaine ajouté (une absence ne rejette ni n'élargit).
   */
  private async groupDomainsOf(account: {
    id: string
    workspace_id: string | null
    siren: string | null
    group_head_siren: string | null
  }): Promise<string[]> {
    const head = account.group_head_siren
    if (!head || !account.workspace_id) return []
    const siblings = await this.accounts.find({
      where: [
        { workspace_id: account.workspace_id, group_head_siren: head },
        { workspace_id: account.workspace_id, siren: head },
      ],
      select: { id: true, website: true },
    })
    return siblings.filter(row => row.id !== account.id && row.website).map(row => row.website as string)
  }

  /**
   * LUDOVIC-C LC.1 (b) — « Remettre les contacts à jour avec les règles actuelles » : le
   * RATTRAPAGE CIBLÉ du segment contacts d'UN compte, sans recollecte ni crédit. Les homonymes
   * CERTAINS déjà au dossier (`selectHomonymsToArchive`) sont ARCHIVÉS avec leur raison
   * (`excluded_at` + motif, réversible par `restoreContact`) ; jamais supprimés, jamais un
   * contact corrigé ou apporté par un humain. La date de la remise est posée sur le compte
   * (`contacts_rules_applied_at`) — jamais `contacts_collected_at` : rien n'a été collecté.
   * `simulation` : compte et nomme, n'écrit rien (le script opérateur part en simulation).
   * Le classement par zone/métiers, lui, s'applique déjà à la lecture (`rankForAccount`).
   */
  async applyCurrentContactRules(
    accountId: string,
    userId: string,
    businessUnitScope: BusinessUnitScopeClause = null,
    options: { simulation?: boolean } = {},
  ): Promise<
    Result<
      { account_id: string; archived: number; names: string[]; simulation: boolean; applied_at: string | null },
      ContactFailure
    >
  > {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const account = (await this.accountIsInScope(accountId, workspaceId, businessUnitScope))
      ? await this.accounts.findOne({ where: { id: accountId, ...workspaceScopeWhere(workspaceId) } })
      : null
    if (!account) return failure({ code: 'not_found', message: `Account ${accountId} not found` })
    const rows = await this.contacts.find({
      where: { account_id: accountId, deleted_at: IsNull(), excluded_at: IsNull() },
      select: { id: true, full_name: true, email: true, source: true, identity_confirmed_at: true, excluded_at: true },
    })
    const ids = selectHomonymsToArchive(rows, accountDomainsFrom(account.website, await this.groupDomainsOf(account)))
    const names = rows.filter(row => ids.includes(row.id)).map(row => row.full_name ?? '')
    const simulation = options.simulation === true
    if (simulation) return success({ account_id: accountId, archived: ids.length, names, simulation, applied_at: null })
    const now = new Date()
    if (ids.length) {
      await this.contacts.update({ id: In(ids) }, { excluded_at: now, exclusion_reason: HOMONYM_EXCLUSION_REASON })
      await this.contacts.manager.query(
        `UPDATE outreach_sequences SET status = 'cancelled' WHERE contact_id = ANY($1::uuid[]) AND status = 'active'`,
        [ids],
      )
      if (account.workspace_id) this.invalidateRecommendedPath(account.workspace_id, accountId)
    }
    await this.accounts.update({ id: accountId }, { contacts_rules_applied_at: now })
    return success({ account_id: accountId, archived: ids.length, names, simulation, applied_at: now.toISOString() })
  }

  /**
   * #3742 / #3744 — rattrape les contacts DÉJÀ au dossier quand le commercial
   * relance l'analyse avec un périmètre géographique. Le filtre de collecte
   * (`applyScopeToContactSeeds`) n'écarte que les NOUVEAUX arrivants ; une
   * relance fusionne dans le stock existant, donc les profils d'Espagne ou d'Inde
   * d'une première analyse restaient listés sous un périmètre « France ».
   *
   * On ÉCARTE (`excluded_at` + motif), on ne supprime pas : réversible par
   * `restoreContact`. Une correction humaine gagne toujours — un contact dont
   * l'identité a été confirmée à la main, ou déjà écarté, n'est jamais retouché.
   * Pays inconnu ⇒ gardé (`isOutsideGeoPerimeter`). Rend le nombre écarté.
   *
   * #3820 — même rattrapage pour un périmètre SITE (`geo_perimeter: 'city'`) :
   * sans ville saisie dans `geo_areas`, rien à comparer, donc rien n'est relu.
   */
  async excludeOutsideGeoPerimeter(accountId: string, selection: AnalysisScopeSelection | undefined): Promise<number> {
    const perimeter = selection?.geo_perimeter
    const isCity = perimeter === 'city' && (selection?.geo_areas?.length ?? 0) > 0
    if (perimeter !== 'france' && perimeter !== 'europe' && !isCity) return 0
    const rows = await this.contacts.find({
      where: { account_id: accountId, deleted_at: IsNull(), excluded_at: IsNull(), identity_confirmed_at: IsNull() },
      select: { id: true, location: true, raw_data: true, title: true },
    })
    const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)
    const ids = rows
      .filter(row =>
        isOutsideGeoPerimeter(
          {
            country: text(row.raw_data?.['country']),
            city: text(row.raw_data?.['city']),
            location: row.location,
            // #3742 — la zone dite par le titre (« VP Nordics ») ou l'employeur (Alcampo).
            title: row.title,
            organization: text(
              (row.raw_data?.['apolloDetails'] as { organization?: unknown } | undefined)?.organization,
            ),
          },
          selection,
        ),
      )
      .map(row => row.id)
    if (!ids.length) return 0
    const reason = isCity
      ? `hors site (${selection?.geo_areas?.join(', ')})`
      : `Hors du périmètre géographique choisi (${perimeter === 'france' ? 'France' : 'Europe'})`
    await this.contacts.update({ id: In(ids) }, { excluded_at: new Date(), exclusion_reason: reason })
    await this.contacts.manager.query(
      `UPDATE outreach_sequences SET status = 'cancelled' WHERE contact_id = ANY($1::uuid[]) AND status = 'active'`,
      [ids],
    )
    return ids.length
  }

  /** #3742/#3820 — les noms des contacts ÉCARTÉS par le périmètre géographique
   *  (motif posé par `excludeOutsideGeoPerimeter`, pays OU site). Lecture par
   *  l'entité, pas en SQL brut (GA-405). */
  async geoExcludedNames(accountId: string): Promise<string[]> {
    const rows = await this.contacts.find({
      where: {
        account_id: accountId,
        deleted_at: IsNull(),
        excluded_at: Not(IsNull()),
        exclusion_reason: Raw(
          alias => `(${alias} LIKE 'Hors du périmètre géographique%' OR ${alias} LIKE 'hors site (%')`,
        ),
      },
      select: { id: true, full_name: true },
    })
    return rows.map(row => row.full_name ?? '').filter(Boolean)
  }

  /** Réintègre un contact écarté — le motif disparaît AVEC l'exclusion : le
   *  garder ferait croire qu'il vaut encore. */
  async restoreContact(contactId: string, userId: string): Promise<Result<{ contact_id: string }, ContactFailure>> {
    const contact = await this.contacts.findOne({ where: await this.contactGestureTarget(contactId, userId) })
    if (!contact) return failure({ code: 'not_found', message: `Contact ${contactId} not found` })
    await this.contacts.update({ id: contactId }, { excluded_at: null, exclusion_reason: null })
    // #3942.5 — symétrique de `excludeContact` : réintégré, ce contact peut
    // reprendre une place dans le chemin recommandé de son compte.
    if (contact.account_id && contact.workspace_id) {
      this.invalidateRecommendedPath(contact.workspace_id, contact.account_id)
    }
    return success({ contact_id: contactId })
  }

  private async findContactActivity(contactId: string, userId: string): Promise<ContactActivity[]> {
    // #4731 — l'historique d'un contact est celui de l'ESPACE (les lectures y passent),
    // pas seulement les gestes de l'appelant ; l'ancien (`workspace_id` NULL) reste à son auteur.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.userActions.find({
      where: [
        { contact_id: contactId, ...workspaceScopeWhere(workspaceId) },
        { contact_id: contactId, workspace_id: IsNull(), user_id: userId },
      ],
      order: { created_at: 'DESC' },
      take: 20,
    })
    return rows.map(actionToContactActivity)
  }

  /**
   * #4609.3 — LECTURE seule : ce contact est-il visible de `userId` ? La portée est l'ESPACE ACTIF (comme la
   * liste des contacts), pas `user_id` : le contact d'un collègue s'ouvre à l'écran, son suivi aussi. Les
   * ÉCRITURES (enrichir, noter…) ont leur propre porte d'espace (`contactGestureWhere`, #4731) ; l'appelant paie ses crédits.
   */
  async canReadContact(contactId: string, userId: string): Promise<boolean> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const found = await this.contacts.findOne({
      where: { id: contactId, deleted_at: IsNull(), ...workspaceScopeWhere(workspaceId) },
      select: { id: true },
    })
    return found !== null
  }

  /**
   * Tout ce qu'on peut refuser SANS appeler un fournisseur : contact inconnu,
   * cooldown d'idempotence, crédits épuisés. Rend le contact chargé quand la voie
   * est libre.
   *
   * Extrait pour n'exister qu'en un seul exemplaire : la mise en file
   * (`ContactEnrichmentService`) doit refuser exactement ce que refuse
   * `enrichContact`, sinon un clic serait accepté puis mourrait dans un job — un
   * « oui » suivi d'un « non » quinze secondes plus tard.
   */
  async preflightEnrichment(
    contactId: string,
    userId: string,
    opts: { force?: boolean; free?: boolean } = {},
  ): Promise<Result<ContactEntity, ContactFailure>> {
    const contact = await this.contacts.findOne({ where: await this.contactGestureTarget(contactId, userId) })
    if (!contact) {
      return failure({ code: 'not_found', message: `Contact ${contactId} not found` })
    }

    // #2297 — cette fiche EST une personne effacée (recréée à la main, par un
    // import) : l'enrichissement ne va pas lui rechercher des coordonnées. Avant
    // tout appel fournisseur, donc rien n'est débité.
    if (await this.isErasedIdentity(contact, {})) {
      return failure({ code: 'suppressed', message: ERASED_PERSON_MESSAGE })
    }

    // #2297.41/.49 — un contact écarté (excluded_at) ou masqué (hidden) à la
    // main n'est pas mal enrichi, il n'est PAS enrichi — même vocabulaire que
    // la porte de classement (`contact-eligibility.ts:66`, `permission_denied`).
    // Avant tout appel fournisseur, donc rien n'est débité.
    if (contact.hidden || contact.excluded_at) {
      return failure({
        code: 'permission_denied',
        message: 'Ce contact a été écarté ou masqué — aucun enrichissement.',
      })
    }

    // #2297.42/.50 — la personne a demandé qu'on cesse : la table de la porte
    // PERSONNE (même table que `ContactStopService.verdict`, GA-07 : lue
    // directement plutôt que d'importer son service) est vérifiée ICI, avant
    // l'appel fournisseur payant — pas seulement au moment de l'envoi.
    // `@Optional()` : sans le dépôt, ce contrôle est simplement absent.
    if (this.contactStops && contact.workspace_id) {
      const stop = await this.contactStops.findOne({
        where: { workspace_id: contact.workspace_id, contact_id: contact.id },
      })
      if (stop) {
        return failure({
          code: 'opt_out',
          message: `Ce contact a demandé qu'on cesse de le contacter (${stop.reason}) — aucun enrichissement.`,
        })
      }
    }

    // Idempotence (règle partagée avec le web — `enrichmentCooldown`) : la
    // dernière tentative n'a rien donné, elle est récente ET les canaux manquants
    // n'ont pas bougé ⇒ on sait que ce clic ne rapporterait rien. On refuse AVANT
    // l'appel provider : pas de coût fournisseur, pas de débit, et surtout pas
    // d'action reproposée en boucle. `force` = « réessayer quand même » assumé
    // par le commercial (l'UI lui a annoncé le coût).
    const cooldown = opts.force ? null : enrichmentCooldown(contact)
    if (cooldown) {
      return failure({
        code: 'enrichment_unchanged',
        message: `Déjà enrichi le ${cooldown.lastAttemptAt} — aucune information supplémentaire n'était disponible.`,
        // Les deux questions que se pose l'utilisateur devant un refus, et
        // auxquelles un code d'erreur nu ne répond pas : est-ce que ça m'a
        // coûté quelque chose, et quand puis-je réessayer ? On refuse AVANT
        // tout appel fournisseur, donc rien n'est débité — et la porte se
        // rouvre d'elle-même à cette date.
        credit: 'not_debited',
        retryAt: cooldown.retryAvailableAt,
      })
    }

    // Espace de démonstration : on laisse passer, mais SANS le pré-contrôle de
    // crédits — une démo ne doit pas pouvoir se retrouver « à court ». Le
    // remplissage fictif lui-même appartient à `enrichContact` : ce pré-contrôle
    // est appelé aussi par la mise en file (`ContactEnrichmentService.enqueue`),
    // où enrichir tout de suite ferait le travail deux fois.
    if (await this.isDemoWorkspace(userId)) {
      return success(contact)
    }

    // #2297.16 — jamais d'appel fournisseur payant pour un pays non vérifié ou
    // non couvert. `ENRICHMENT_ALLOWED_COUNTRIES` absente = garde OUVERTE (no-op
    // strict, doctrine CLAUDE.md) : la requête ci-dessous ne part que si le
    // réglage a été posé, donc zéro coût côté base pour tout espace qui ne l'a
    // pas réglé.
    const allowedCountries = resolveAllowedEnrichmentCountries(this.config.get<string>('ENRICHMENT_ALLOWED_COUNTRIES'))
    if (allowedCountries !== null) {
      const account = contact.account_id
        ? await this.accounts.findOne({
            where: await this.accountOfContactGestureWhere(contact.account_id, userId),
            select: ['registry_country'],
          })
        : null
      if (!isEnrichmentCountryAllowed(account?.registry_country, allowedCountries)) {
        return failure({
          code: 'country_not_supported',
          message:
            "Le pays de ce compte n'est pas vérifié ou n'est pas couvert par l'enrichissement — aucun appel fournisseur n'a été tenté.",
        })
      }
    }

    // Pre-check: surface "insufficient_credits" before paying for the Apollo
    // call. The decrement below is the source of truth (atomic) — a race that
    // sneaks past this guard is still caught there.
    // #3549 — `free` (rattrapage d'opérateur) : à NOTRE charge, jamais au client ;
    // un espace sans crédit est rattrapé quand même.
    if (!opts.free && !(await this.credits.hasEnrichmentCredit(userId))) {
      // #3400 — la cause réelle (essai terminé, indisponibilité) quand elle existe ;
      // « épuisés » seulement si le solde l'est vraiment.
      const refusal = await this.credits.enrichmentRefusal?.(userId)
      if (refusal?.kind === 'unavailable') {
        this.notifyEnrichmentOutage('quota_exceeded')
        return failure({
          code: 'enrichment_unavailable',
          message: refusal.message,
          reason: 'upstream_error',
          credit: 'not_debited',
        })
      }
      return failure({
        code: 'insufficient_credits',
        message: refusal?.message ?? SOFT_BRAKE_MESSAGE,
        ...(refusal?.kind === 'trial_ended' ? { refusal: 'trial_ended' as const } : {}),
      })
    }

    return success(contact)
  }

  async enrichContact(
    contactId: string,
    userId: string,
    dto: {
      first_name: string
      last_name?: string
      organization_name: string
      force?: boolean
      /** #2988 — voir `foldReachability` plus bas : la coordonnée non demandée
       *  n'est ni écrite ni facturée, même quand le même appel fournisseur l'a
       *  rendue. */
      only?: EnrichmentCoordinate
      /** #3549 — rattrapage d'opérateur : ni pré-contrôle de crédits, ni débit,
       *  ni coût inscrit sur la fiche. Seul `ContactReachabilityCatchupService` le pose. */
      free?: boolean
    },
  ): Promise<
    Result<
      ContactEntity & { enrichment: ApolloEnrichmentData; credits_remaining: number; credits_debited: number },
      ContactFailure
    >
  > {
    const preflight = await this.preflightEnrichment(contactId, userId, { force: dto.force, free: dto.free })
    if (isFailure(preflight)) return preflight
    const contact = preflight.output

    // Espace de démonstration : le bouton doit MONTRER la mécanique, pas la
    // payer. Le lien de démo est envoyé à des inconnus — laisser passer le vrai
    // enrichissement ferait partir un appel Apollo/SalesQL/Dropcontact à chaque
    // clic de chaque visiteur (coût réel), et surtout ferait atterrir les
    // coordonnées PERSONNELLES d'une vraie personne dans un espace partagé.
    //
    // Ce court-circuit était placé dans le PRÉ-CONTRÔLE, dont le résultat n'est
    // pas terminal ici : la fiche recevait bien ses coordonnées fictives, puis
    // l'exécution repartait dans le vrai chemin fournisseur juste en dessous.
    // La garantie « aucun appel réseau en démo » n'en était donc pas une. Elle
    // tient maintenant, parce que la sortie est ICI, avant le moindre appel.
    if (await this.isDemoWorkspace(userId)) {
      return this.enrichContactInDemo(contact)
    }

    // Clean org anchors from the ACCOUNT — the P0 unblock (retour Théo). The web
    // sends the messy contact entity label (« TF1 PUB », « Groupe TF1 »…) as
    // `organization_name`; Apollo can't scope a role search on that. Load the
    // account and prefer its Apollo org id (exact) + registrable domain + its
    // CANONICAL company name, so People-Search actually returns the real person.
    const account = contact.account_id
      ? await this.accounts.findOne({ where: await this.accountOfContactGestureWhere(contact.account_id, userId) })
      : null
    const orgId = account?.apollo_enrichment?.organizationId ?? undefined
    const orgDomain = account?.apollo_enrichment?.domain ?? extractDomain(account?.website) ?? undefined
    // Canonical account name beats the entity sub-label; the dto label is only a
    // last resort (e.g. a contact without an account).
    const organizationName = account?.company_name?.trim() || dto.organization_name

    // #2297.15 — vérifier l'entité utile avant l'appel payant. Le web désactive
    // déjà le bouton quand `!contact.entity && !accountId` (`ContactEnrichButton.tsx`),
    // mais c'est une COURTOISIE côté client : rien ne l'imposait côté serveur. Un
    // compte posé (`account_id`) sans `company_name` (import partiel, compte pas
    // encore enrichi) passait le bouton (accountId est vrai) puis atterrissait ici
    // avec un nom d'organisation VIDE — Apollo payé pour chercher sur rien, et le
    // provider répondant sans `data` faisait crasher l'appel (`TypeError` lu en
    // intégration). Posé ici UNE fois (GA-26), avant tout appel fournisseur et
    // avant tout débit de crédit.
    if (!organizationName?.trim()) {
      return failure({
        code: 'invalid',
        message: "Impossible de déterminer l'organisation du contact (requis pour l'enrichissement).",
      })
    }

    // #4268.b (Louis 19/10/2026) — la base commune AVANT tout appel payant : une coordonnée pro
    // que Bellum a déjà trouvée (dans n'importe quel espace) se pose sans fournisseur ni crédit.
    // Tout servi ⇒ on s'arrête ici ; en partie ⇒ la cascade ne cherche plus que le reste.
    const fromCommon = await this.fillFromSharedBase(contact, account, dto.only)
    if (fromCommon.served.length > 0) {
      const wanted: EnrichmentCoordinate[] = dto.only ? [dto.only] : ['email', 'phone']
      const remaining = wanted.filter(coordinate => !(contact[coordinate] ?? '').trim())
      if (remaining.length === 0) {
        const remainingCredits = await this.credits
          .getCredits(userId)
          .then(c => c.credits_remaining)
          .catch(() => 0)
        return success({
          ...contact,
          enrichment: { email: contact.email ?? null, phone: contact.phone ?? null } as ApolloEnrichmentData,
          credits_remaining: remainingCredits,
          credits_debited: 0,
        })
      }
      dto = { ...dto, only: remaining[0] }
    }

    // Apollo person id persisted at seed time (raw_data.apolloId) — the strongest
    // People-Match key. Present only on Apollo-sourced contacts; when present it
    // reveals the real record BY ID directly, skipping the org+title fresh search.
    const rawApolloId = (contact.raw_data as { apolloId?: unknown } | null)?.apolloId
    const apolloId = typeof rawApolloId === 'string' && rawApolloId.trim() ? rawApolloId : undefined

    // The provider call is the one step that can fail for a reason that is NOT
    // about this contact. Letting it throw used to produce a bare 500 whose body
    // carried no message, which the web rendered as « API error » — the absence
    // of information presented as information. It is now translated into a typed
    // reason, BEFORE any persistence and long before any credit decrement: a
    // failed lookup must never cost the seller anything, and must never leave a
    // « rien trouvé » trace that the idempotence cooldown would later honour.
    let costHeader: string | null = null
    let result: EnrichContactResponse
    // #2120.57 / #2297.23 — la durée d'un enrichissement se MESURE. Bornée au
    // seul appel fournisseur (le pré-contrôle et la persistance ci-dessous ne
    // sont pas de l'attente fournisseur) ; enregistrée seulement si l'appel
    // N'A PAS levé — un timeout ou une 5xx sort par le `catch` juste en
    // dessous et ne mesure rien : sa durée ne dit rien de ce qu'un
    // utilisateur qui OBTIENT une réponse attend réellement.
    const enrichmentStartedAt = Date.now()
    // Apollo à sec (crédits, plan) : la panne est journalisée et alertée, mais les autres sources
    // configurées prennent le relais ; l'échec n'est rendu que si elles ne trouvent rien non plus.
    let apolloOutage: { reason: EnrichmentFailureReason } | null = null
    try {
      result = await this.ia.enrichContact(
        {
          apolloId,
          firstName: dto.first_name,
          lastName: dto.last_name,
          organizationName,
          // Exact org scope (Apollo org id) + employer domain — the strong anchors
          // that make the role People-Search return the real person. Present-only.
          organizationId: orgId,
          organizationDomain: orgDomain,
          // Apollo's most reliable match key. Forwarded only when we already
          // have it (search step or a previous enrich) — otherwise Apollo
          // falls back to fuzzy name + org matching.
          linkedinUrl: contact.linkedin_url ?? undefined,
          // Role/persona → lets the IA resolve an « identité incomplète » contact by
          // searching the org for the real person holding that title (People-Search
          // fallback) when the name alone can't match.
          title: contact.title ?? undefined,
        },
        // Ce que cette cascade a coûté chez chaque fournisseur (D19).
        { responseHeaderName: IA_COST_HEADER, onResponseHeader: (_name, value) => (costHeader = value) },
      )
    } catch (error) {
      const { reason, detail } = classifyEnrichmentFailure(error)
      // The upstream sentence goes to the operator, never to the seller: the
      // seller gets a localized sentence keyed on `reason`.
      this.logger.error(`enrichContact provider failure (${reason}): ${detail ?? 'no detail'}`, {
        error,
        contactId,
        userId,
        tags: { provider: 'apollo', reason },
      })
      this.notifyEnrichmentOutage(reason)
      if (isApolloDry({ reason, detail }) && this.extraEnrichers.isEnabled()) {
        apolloOutage = { reason }
        result = { data: { matched: false } } as EnrichContactResponse
      } else {
        return await this.failEnrichmentOutage(reason, contact, contactId, userId, dto)
      }
    }
    // #2120.57 (b) — la durée est capturée ICI (bornée au seul appel
    // fournisseur, comme avant) mais `record()` est APPELÉ plus bas, une fois
    // `enrichData` connu : la médiane doit répondre à « combien de temps
    // vais-je attendre un résultat UTILE ? », pas mélanger un « rien trouvé »
    // quasi instantané avec un enrichissement qui aboutit (30-85 s,
    // `contacts.module.ts`) — les deux tiraient la même médiane vers le bas,
    // au point d'afficher « environ 0 s » (mesuré en prod le 20/09).
    const providerDurationMs = Date.now() - enrichmentStartedAt
    // #2297.54 — le catalogue des champs interdits est retiré À L'ENTRÉE, avant
    // tout pliage : ni l'UPDATE, ni le profil recopié, ni la réponse ne le voient.
    let enrichData: ApolloEnrichmentData = withoutForbiddenEnrichmentFields(result.data)
    // Succès — comme « rien trouvé » : les deux sont des RÉPONSES du
    // fournisseur, pas un incident (ni l'un ni l'autre ne lève, on ne passe
    // par ce point qu'après un appel qui a répondu). `record()` ne lève
    // jamais (best-effort). `found` = le fournisseur a rendu une coordonnée
    // exploitable (email / téléphone / LinkedIn) sur CET appel — le même
    // signal que `foldReachability` ci-dessous, lu ici pour ne pas retarder
    // la mesure derrière les fournisseurs de secours (Dropcontact, Hunter…)
    // dont la latence n'est pas celle que cet appel a mesurée.
    const providerFoundData = Boolean(enrichData.email || enrichData.phone || enrichData.linkedin_url)
    if (!apolloOutage) await this.enrichmentDuration?.record(providerDurationMs, providerFoundData)

    // Provider label for lifecycle journalling — Apollo by default, flips to
    // 'dropcontact' only when the fallback below is the one that resolved.
    let provider = 'apollo'
    const updates: {
      email?: string
      email_verified?: boolean
      phone?: string
      linkedin_url?: string
      title?: string
      source?: string
      photo_url?: string
      full_name?: string
      seniority?: string
      location?: string
      apollo_enrichment?: ApolloContactProfile
      last_enrichment_at?: Date
      last_enrichment_provider?: string
      last_enrichment_result?: EnrichmentAttemptResult
      last_enrichment_missing?: string[]
      // #2159.62 — quand l'emploi (titre, entité) a été reconfirmé pour la
      // dernière fois par un MATCH fournisseur.
      employment_verified_at?: Date
      // #2120.68 / #2120.70 — provenance par champ : confiance et coût.
      email_confidence?: ContactFieldConfidence
      phone_confidence?: ContactFieldConfidence
      email_cost_credits?: number
      phone_cost_credits?: number
      // #4178.1 — la nature du numéro écrit, jamais « pro » par déduction.
      phone_nature?: PhoneNature
      phone_nature_source?: PhoneNatureSource
    } = {}
    // Both providers emit the same ApolloEnrichmentData shape — fold the reachable
    // fields (email/phone/linkedin) into `updates` the same way for either.
    // #2988 — la coordonnée NON demandée n'entre jamais dans `updates`, même
    // quand le même appel fournisseur l'a rendue (Apollo répond souvent
    // email+téléphone d'un coup) : elle n'est donc ni écrite (le `SET` plus bas
    // ne la porte pas), ni comptée dans `matched` (aucun débit), ni affichée
    // avec une confiance/un coût qu'elle n'a pas gagnés. LinkedIn reste un champ
    // libre du même appel (comme la photo/le profil plus bas) — il n'est pas
    // une des deux coordonnées de l'énumération.
    const wantsEmail = dto.only !== 'phone'
    const wantsPhone = dto.only !== 'email'
    // LOT (15/10) DATA-A point 6 — la coordonnée NON demandée mais DÉJÀ rendue (et payée) par le même
    // appel se GARDE au lieu d'être jetée : écrite sur la fiche, mais ni comptée dans `matched`, ni
    // débitée, ni affichée avec une confiance/un coût qu'elle n'a pas gagnés (#2988 maintenu). Elle
    // ne remplace jamais une valeur de la fiche (correction humaine gagne).
    const kept: { email?: string; phone?: string } = {}
    const foldReachability = (data: ApolloEnrichmentData): void => {
      if (!wantsEmail && data.email && !contact.email) kept.email = data.email
      if (!wantsPhone && data.phone && !contact.phone && isPlausiblePhoneNumber(data.phone)) {
        kept.phone = toE164(data.phone)
      }
      // #4599 — un fournisseur qui rend un gabarit n'a rien trouvé : jamais écrit, jamais « vérifié ».
      if (wantsEmail && data.email && !isPlaceholderEmail(data.email)) updates.email = data.email
      if (wantsEmail && updates.email && data.email_status === 'verified') updates.email_verified = true
      // #3850.1 — Apollo (et Dropcontact, même shape) est un POINT D'ÉCRITURE :
      // un numéro qui n'a pas la forme d'un téléphone (code postal, date,
      // identifiant) n'est jamais persisté, quelle que soit la source.
      if (wantsPhone && data.phone && isPlausiblePhoneNumber(data.phone)) {
        updates.phone = toE164(data.phone)
        // #4178.1 — la nature vient du type de ligne DÉCLARÉ par le fournisseur ;
        // une correction humaine déjà posée n'est jamais écrasée.
        if (contact.phone_nature_source !== 'human') {
          updates.phone_nature = providerPhoneNature(data.phone, data.phone_numbers)
          updates.phone_nature_source = 'provider'
        }
      }
      if (data.linkedin_url) updates.linkedin_url = data.linkedin_url
    }
    // Complete an « identité incomplète » (prénom-seul / role-persona placeholder)
    // with the REAL name the People-Search fallback resolved. Only overwrites when
    // the current name is incomplete (< 2 tokens) — never clobbers a good full
    // name — and never invents: requires a real first + last from Apollo. This is
    // what makes the badge disappear + unblocks message generation.
    const foldIdentity = (data: ApolloEnrichmentData): void => {
      const first = data.first_name?.trim()
      const last = data.last_name?.trim()
      if (!first || !last) return
      const resolvedFull = `${first} ${last}`.trim()
      const currentName = (contact.full_name ?? '').trim()
      // #4421.16 — un nom masqué par la source (« Inès D. ») est incomplet, comme un prénom seul.
      const wasIncomplete = isIncompleteContactName(currentName)
      if (wasIncomplete && resolvedFull.toLowerCase() !== currentName.toLowerCase()) {
        updates.full_name = resolvedFull
      }
    }
    foldReachability(enrichData)
    foldIdentity(enrichData)

    // E1 (#3698, #3822) — ce que chaque source a répondu, PAR COORDONNÉE : il
    // fait l'état « introuvable chez N sources » de la fiche et la mesure de
    // couverture. Apollo (via le service IA) est interrogé sur les trois. Une
    // cascade tronquée par son budget n'a pas fini : ce qu'elle n'a pas trouvé
    // est « inconnu », jamais « introuvable » (un timeout n'est pas un échec).
    const sourceAttempts: EnrichmentSourceAttempt[] = []
    let priorTrace: ContactEnrichmentTrace | null | undefined
    const enrichmentTrace = async (): Promise<ContactEnrichmentTrace | null> => {
      if (priorTrace === undefined) priorTrace = await this.loadEnrichmentTrace(contact)
      return priorTrace
    }
    for (const coordinate of ['email', 'phone', 'linkedin'] as const) {
      if (coordinate === 'email' && !wantsEmail) continue
      if (coordinate === 'phone' && !wantsPhone) continue
      const value = coordinate === 'linkedin' ? enrichData.linkedin_url : enrichData[coordinate]
      sourceAttempts.push({
        source: 'apollo',
        coordinate,
        outcome: apolloOutage ? 'error' : value ? 'found' : enrichData.truncated === true ? 'unknown' : 'not_found',
      })
    }

    // #3022 (retour bêta Louis) — « le téléphone n'arrive presque jamais ».
    // Avant ce correctif, CE bloc et celui de l'`extraEnrichers` plus bas ne se
    // déclenchaient QUE quand Apollo(+SalesQL) n'avait RIEN résolu
    // (`Object.keys(updates).length === 0`). Or Apollo demande le reveal EMAIL
    // (`reveal_personal_emails=true`, `apps/ia/app/services/apollo.py`
    // `_build_enrich_payload`) mais jamais le reveal TÉLÉPHONE (« requires an
    // async webhook callback flow that is out of scope » — même fichier) : Apollo
    // revient donc presque toujours avec un email et QUASIMENT JAMAIS avec un
    // téléphone. Avec l'ancienne garde, dès qu'un email arrivait, `updates`
    // n'était plus vide et TOUT le reste de la cascade (Dropcontact, puis
    // Hunter/Lusha) était sauté — alors que le téléphone, lui, manquait
    // toujours. Le repli doit continuer tant que le téléphone manque, pas
    // seulement quand tout manque. `!contact.phone` évite de rappeler un
    // fournisseur payant pour un numéro déjà connu de la fiche.
    const stillNeedsAFallbackLeg = (): boolean =>
      Object.keys(updates).length === 0 || (!updates.phone && !contact.phone)
    // #4106 — plafond de coût PAR contact + journal INTERNE des essais (`tried`, `served_by`,
    // écrits dans `enrichment_trace`, colonne jamais sélectionnée : rien n'en sort à l'écran).
    // Apollo(+SalesQL) est l'étape déjà jouée, au coût imputé par le service IA (D19).
    const cascadeLedger = new CascadeLedger(readCostCeiling())
    cascadeLedger.record('apollo', apolloOutage ? 'error' : providerFoundData ? 'hit' : 'miss')
    // Étape GRATUITE : patterns d'e-mail sur le domaine du compte. Des CANDIDATS seulement —
    // sans vérification (SMTP, #4107, pas livrée : vérificateur no-op) rien n'est servi, jamais
    // de donnée inventée. Ils servent d'indice au journal si un fournisseur rend la même adresse.
    const emailCandidates =
      wantsEmail && !updates.email && !contact.email
        ? emailPatternCandidates({ firstName: dto.first_name, lastName: dto.last_name, domain: orgDomain })
        : []
    if (emailCandidates.length > 0) {
      // #4107 — vérification SMTP (flag off / non configuré ⇒ NOOP : aucun appel réseau, chemin
      // inchangé). Seul `valid` sert ; unknown / invalid ⇒ la cascade continue vers les payants.
      const verifier = sharedEmailVerifier()
      const smtp = verifier !== NOOP_EMAIL_VERIFIER
      const free = await servableFreeEmail(
        emailCandidates,
        verifier,
        smtp ? { limit: SMTP_MAX_CANDIDATES_PER_CONTACT } : {},
      )
      cascadeLedger.record('email_pattern', free.email ? 'hit' : 'miss')
      if (smtp) cascadeLedger.record('smtp_check', free.email ? 'hit' : 'miss')
      if (free.email) {
        updates.email = free.email
        updates.email_verified = true
      }
    }
    // Fallback (additive, env-gated): Apollo(+SalesQL) found nothing, OR the
    // phone is still missing, AND a Dropcontact key is configured → try the
    // RGPD-safe algorithmic resolver. No key → `isEnabled()` is false →
    // Dropcontact is never called (zero network) and this whole branch is a
    // no-op, so Apollo stays the sole/default provider unchanged.
    // #2988 — Dropcontact ne rend JAMAIS de téléphone (dernier fallback email
    // FR) : l'appeler pour `only: 'phone'` serait un appel fournisseur pour une
    // question qu'il ne peut structurellement pas répondre. Coordonnée non
    // demandée = aucun appel fournisseur, pas seulement aucun débit.
    if (
      stillNeedsAFallbackLeg() &&
      dto.only !== 'phone' &&
      this.dropcontact.isEnabled() &&
      cascadeLedger.gate('dropcontact', ['email'])
    ) {
      // #2297.54 — même filtre à l'entrée, quel que soit le fournisseur.
      const dc = withoutForbiddenEnrichmentFields(
        await this.dropcontact.enrich({
          firstName: dto.first_name,
          lastName: dto.last_name,
          // Canonical account name (not the messy entity label) — better match rate.
          organizationName,
          linkedinUrl: contact.linkedin_url ?? undefined,
          // LOT (15/10) DATA-A point 8 — le domaine du compte affine la résolution de l'e-mail pro.
          ...(orgDomain ? { website: orgDomain } : {}),
          // CACHE-API (15/10) — le cache d'une coordonnée achetée est PAR ESPACE.
          ...(contact.workspace_id ? { workspaceId: contact.workspace_id } : {}),
        }),
      )
      // E1 — Dropcontact ne cherche que l'e-mail.
      sourceAttempts.push({
        source: 'dropcontact',
        coordinate: 'email',
        outcome: dc?.matched && dc.email ? 'found' : dc ? 'not_found' : 'error',
      })
      cascadeLedger.record('dropcontact', dc?.matched && dc.email ? 'hit' : dc ? 'miss' : 'error', {
        fields: ['email'],
      })
      // Only accept it as a match if it actually produced reachable data — no
      // match ⇒ nothing folded ⇒ no persistence, no credit charged.
      if (dc?.matched) {
        foldReachability(dc)
        if (Object.keys(updates).length > 0) {
          enrichData = dc
          provider = 'dropcontact'
          updates.source = 'dropcontact'
          // Dropcontact resolves the poste (job) — persist it when the contact
          // had none, without ever overwriting an existing title.
          if (dc.title && !contact.title) updates.title = dc.title
        }
      }
    }

    // Dernier recours : les enrichisseurs à API officielle (Hunter, Lusha).
    // Même discipline que Dropcontact ci-dessus, et le MÊME correctif #3022 :
    // `stillNeedsAFallbackLeg()` (définie plus haut) est réévaluée ici — pas
    // réutilisée telle quelle — car `updates` a pu changer depuis (le repli
    // Dropcontact vient peut-être de lui ajouter un champ). Sans clé,
    // `isEnabled()` est faux, aucun appel réseau ne part, et la cascade est
    // byte-identique. On n'y arrive que si tout le reste a échoué à trouver le
    // téléphone : ces fournisseurs facturent à la recherche aboutie, il serait
    // absurde de les interroger quand Apollo a déjà tout rendu.
    // E1 (#3698, décision Louis 07/10) — FullEnrich passe aussi quand c'est
    // l'E-MAIL qui manque encore (téléphone déjà connu), pas seulement le
    // téléphone : « Apollo match → FullEnrich si téléphone OU e-mail manquant ».
    let extraEmailStatus: string | undefined
    const emailStillMissing = (): boolean => wantsEmail && !updates.email && !contact.email
    const enrichmentReport: EnrichmentReport = { attempts: [], ledger: cascadeLedger }
    if ((stillNeedsAFallbackLeg() || emailStillMissing()) && this.extraEnrichers.isEnabled()) {
      const pendingLookup = (await enrichmentTrace())?.async_lookup?.id
      const hit = await this.extraEnrichers.enrich(
        {
          firstName: dto.first_name,
          lastName: dto.last_name,
          organizationName,
          domain: orgDomain,
          linkedinUrl: contact.linkedin_url ?? undefined,
          // CACHE-API (15/10) — le cache d'une coordonnée achetée est PAR ESPACE.
          ...(contact.workspace_id ? { workspaceId: contact.workspace_id } : {}),
          // #2988 — relayé jusqu'au bout : `EnrichmentProviders.enrich` saute
          // Hunter (email seul) pour `only: 'phone'` et ne rend jamais la
          // coordonnée non demandée, même si un fournisseur tolérant l'a trouvée.
          ...(dto.only ? { only: dto.only } : {}),
          ...(emailCandidates.length > 0 ? { emailCandidates } : {}),
          // E1 — ce qui est déjà connu n'est jamais redemandé (ni repayé).
          have: { email: Boolean(updates.email || contact.email), phone: Boolean(updates.phone || contact.phone) },
          ...(pendingLookup ? { asyncLookupId: pendingLookup } : {}),
        },
        enrichmentReport,
      )
      sourceAttempts.push(...enrichmentReport.attempts)
      // LOT (15/10) DATA-A point 1 — une coordonnée déjà trouvée (Apollo, Dropcontact…) n'est jamais écrasée.
      if (hit?.email && !contact.email && !updates.email && wantsEmail) {
        updates.email = hit.email
        // LOT (15/10) DATA-A point 8 — la vérification lue chez la source (Hunter) donne la confiance.
        if (hit.emailStatus) extraEmailStatus = hit.emailStatus === 'verified' ? 'verified' : 'unverified'
        if (hit.emailStatus === 'verified') updates.email_verified = true
      }
      // #3850.1 — Lusha lit son champ documenté sans vérifier sa FORME
      // (`enrichment-providers.ts`) : même garde qu'Apollo ci-dessus.
      if (hit?.phone && !contact.phone && !updates.phone && wantsPhone && isPlausiblePhoneNumber(hit.phone)) {
        updates.phone = toE164(hit.phone)
        // #4178.1 — ce fournisseur ne type pas la ligne : « nature non vérifiée ».
        if (contact.phone_nature_source !== 'human') {
          updates.phone_nature = 'unknown'
          updates.phone_nature_source = 'provider'
        }
      }
      // E1 (point 3) — le profil professionnel rendu par N'IMPORTE QUELLE
      // source se garde quand la fiche n'en a pas ; jamais il n'en écrase un.
      if (hit?.linkedinUrl && !contact.linkedin_url && !updates.linkedin_url) updates.linkedin_url = hit.linkedinUrl
      if (hit && Object.keys(updates).length > 0) {
        provider = hit.provider
        updates.source = hit.provider
      }
    }

    // Apollo à sec ET aucune autre source n'a rien trouvé : le comportement d'avant (panne nommée,
    // aucun débit). Si une source a trouvé, on poursuit comme un succès normal.
    if (apolloOutage && Object.keys(updates).length === 0 && !kept.email && !kept.phone) {
      return await this.failEnrichmentOutage(apolloOutage.reason, contact, contactId, userId, dto)
    }

    // ⚠️ #2120.61 — IDENTITÉ AMBIGUË, avant tout le reste.
    //
    // Le nom qu'on s'apprête à retenir — celui déjà sur la fiche, ou celui que
    // le People-Search vient de résoudre pour un rôle-persona — correspond à
    // UNE AUTRE fiche active du même compte. On ne sait pas laquelle des deux
    // personnes réelles le fournisseur a trouvée : deux « Jean Dupont » chez le
    // même client sont deux humains distincts tant que rien ne prouve le
    // contraire, et choisir serait une fusion silencieuse (doctrine : « on
    // PROPOSE une fusion de doublons, on ne fusionne JAMAIS »). Rien n'est
    // écrit sur CETTE fiche — ni les coordonnées trouvées, ni l'arbitre plus
    // bas, ni le débit — et le résultat le DIT plutôt que de choisir ou de se
    // taire.
    // #2297 — le fournisseur a peut-être rendu l'identité d'une personne
    // EFFACÉE (son adresse, son profil) sur une fiche qui ne l'était pas : rien
    // n'est plié dans la fiche, rien n'est débité.
    if (await this.isErasedIdentity(contact, { ...updates, ...(kept.email ? { email: kept.email } : {}) })) {
      return failure({ code: 'suppressed', message: ERASED_PERSON_MESSAGE })
    }

    const candidateFullName = (updates.full_name ?? contact.full_name ?? '').trim()
    const candidateTokens = normalizeFullName(candidateFullName).split(' ').filter(Boolean)
    if (contact.account_id && candidateTokens.length >= 2) {
      const accountContacts = await this.contacts.find({
        // #4479 — la clé de la base est `(account_id, nom normalisé)` : tout le COMPTE, fiches écartées
        // comprises. Filtrer sur l'appelant ou sur `deleted_at` laissait passer le rebaptême qu'elle refuse.
        where: { account_id: contact.account_id },
        select: ['id', 'full_name'],
      })
      const homonymFound = accountContacts.some(
        other => other.id !== contact.id && normalizeFullName(other.full_name) === normalizeFullName(candidateFullName),
      )
      if (homonymFound) {
        const ambiguousUpdates = {
          last_enrichment_at: new Date(),
          last_enrichment_provider: provider,
          last_enrichment_result: 'ambiguous' as EnrichmentAttemptResult,
          last_enrichment_missing: missingEnrichmentChannels(contact),
        }
        await this.contacts
          .createQueryBuilder()
          .update(ContactEntity)
          .set(ambiguousUpdates)
          .where('id = :id', { id: contactId })
          .execute()
        await this.providerCosts?.record(this.providerCosts.parseHeader(costHeader), {
          workspaceId: contact.workspace_id ?? null,
          userId,
          accountId: contact.account_id ?? null,
          feature: 'enrichment',
        })
        // #3822.3 — rien de débité ici (identité ambiguë), mais « rien débité »
        // n'est pas « solde à zéro » : le solde RÉEL (même source que le
        // compteur latéral, GA-26) évite le « 0 crédit restant » mensonger.
        const remainingOnAmbiguous = await this.credits
          .getCredits(userId)
          .then(c => c.credits_remaining)
          .catch(() => 0)
        return success({
          ...contact,
          ...ambiguousUpdates,
          enrichment: enrichData,
          credits_remaining: remainingOnAmbiguous,
          credits_debited: 0,
        })
      }
    }

    // ⚠️ L'ARBITRE PASSE ICI, et sa place est la moitié du correctif (D380).
    //
    // Il doit agir AVANT `matched`, qui décide du débit : un champ que l'arbitre
    // refuse n'atterrit pas sur la fiche, donc il n'apporte aucune information
    // nouvelle, donc il ne se facture pas. L'arbitrer après aurait débité un
    // crédit pour une adresse qu'on venait de ne pas écrire — exactement le bug
    // de facturation que le commentaire ci-dessous raconte, sous une autre forme.
    //
    // #2120.64 — son verdict `rejected` est aussi ce qui distingue
    // `newer_data_exists` d'un simple `no_new_data` plus bas : un champ refusé
    // n'est pas un champ que le fournisseur n'a pas trouvé, c'est un champ
    // protégé par une source de plus haute autorité (une correction humaine
    // gagne toujours, quelle que soit sa date).
    // #4465 — la FONCTION est l'expérience EN COURS chez l'employeur du compte, jamais l'avant-dernier poste. Posée
    // AVANT l'arbitre : une fonction corrigée à la main (ou une ligne `manual`/`crm`) la refuse, une correction humaine
    // gagne toujours. Ne compte pas dans `matched` (ni coordonnée, ni débit).
    const positionTitle = enrichmentPositionTitle({
      source: contact.source ?? null,
      currentTitle: contact.title ?? null,
      history: enrichData.employment_history,
      employerNames: [account?.company_name, contact.entity],
    })
    if (positionTitle) updates.title = positionTitle
    const { rejected: protectedFields } = await this.arbitrateEnrichment(contact, updates as Record<string, unknown>)

    // Charge only on NEW information. Historiquement `matched` valait « le
    // provider a renvoyé quelque chose », si bien qu'un second passage sur un
    // contact déjà enrichi re-recevait le même email et redébitait un crédit
    // pour zéro gain (bug de facturation constaté en prod). On compare donc
    // chaque champ facturable à ce qui est DÉJÀ stocké : re-recevoir l'existant
    // ne vaut rien, une valeur réellement différente vaut le crédit.
    // `matched` reste décidé AVANT de replier la photo et le profil : ce sont
    // des champs gratuits du même appel, ils ne doivent jamais déclencher le
    // débit à eux seuls (garantie existante préservée).
    const matched = BILLABLE_ENRICHMENT_FIELDS.some(field => isNewEnrichmentValue(contact[field], updates[field]))
    // E1 (#3698, décision Louis 07/10, point 4) — LE DÉBIT : seulement si au
    // moins une coordonnée MANQUANTE (e-mail, téléphone) vient d'être trouvée.
    // `matched` garde son sens (le résultat de la tentative, le cycle de vie) ;
    // il ne décide plus du crédit : rafraîchir une valeur présente ou compléter
    // seulement un nom ne se facture plus. Introuvable partout ⇒ aucun débit.
    const newlyFound = newlyFoundCoordinates(contact, updates)
    const billable = newlyFound.length > 0
    // #2120.68 / #2120.70 — provenance par champ, sur les seuls champs qui
    // viennent de FOURNIR une valeur NEUVE et FACTURÉE. Un champ hérité d'un
    // enrichissement précédent, ou jamais payé (saisie manuelle, import CRM),
    // n'affiche ni confiance ni coût — « non mesuré » n'est jamais 0 (GA-18/19).
    const emailIsNewThisRound = isNewEnrichmentValue(contact.email, updates.email)
    const phoneIsNewThisRound = isNewEnrichmentValue(contact.phone, updates.phone)
    if (emailIsNewThisRound) {
      // Le SEUL signal de confiance disponible : le statut que le fournisseur a
      // LUI-MÊME calculé pour cette adresse (déjà reçu, jusqu'ici réduit au
      // seul booléen `email_verified`). Lu, jamais deviné depuis une URL ou un
      // mot-clé.
      const emailStatus = extraEmailStatus ?? enrichData.email_status
      const confidence = emailStatus ? EMAIL_CONFIDENCE_BY_STATUS[emailStatus] : undefined
      if (confidence) updates.email_confidence = confidence
      if (!dto.free && newlyFound.includes('email')) updates.email_cost_credits = creditCostOf('contact_enrichment')
    }
    if (phoneIsNewThisRound && !dto.free && newlyFound.includes('phone')) {
      // Aucun statut équivalent à `email_status` n'existe pour le numéro
      // principal au 18/09/2026 : la confiance reste non mesurée plutôt que
      // devinée — seul le coût, lui, est connu.
      updates.phone_cost_credits = creditCostOf('contact_enrichment')
    }
    // LOT (15/10) DATA-A point 6 — APRÈS le calcul de `matched` / du coût : la coordonnée gardée ne
    // déclenche aucun débit. Source = celle du match ; aucune confiance ni coût (« non mesuré »).
    if (kept.email && !updates.email) updates.email = kept.email
    if (kept.phone && !updates.phone) updates.phone = kept.phone
    // `usablePhotoUrl` : le fournisseur rend la silhouette générique du réseau
    // professionnel quand la personne n'a PAS de photo. Stockée, elle s'affiche
    // comme une photo et rien ne la distingue d'un visage — c'est le retour bêta
    // « il manque les photos de profil ». Une silhouette vaut donc « pas de
    // photo », et l'avatar montre l'initiale.
    //
    // Et la photo se RAFRAÎCHIT : la condition était « seulement si la colonne
    // est vide », or ces URL sont SIGNÉES et expirent chez le fournisseur. Une
    // photo collectée il y a des mois répond 403 aujourd'hui — l'écran affiche
    // l'initiale, le commercial clique « Enrichir », le même appel payant rend
    // une URL fraîche… qu'on jetait parce que la colonne n'était pas vide. C'est
    // l'autre moitié du « même quand je clique sur Enrichir » du retour bêta.
    // On n'écrase jamais une vraie photo par une silhouette : dans ce cas
    // `usablePhotoUrl` rend `null` et rien ne bouge.
    const enrichedPhoto = usablePhotoUrl(enrichData.photo_url)
    if (enrichedPhoto && enrichedPhoto !== usablePhotoUrl(contact.photo_url)) {
      updates.photo_url = enrichedPhoto
    }
    // Rich factual profile from the SAME paid call (career path, education,
    // social links, seniority…). Like the photo, it is a free field of the match
    // — folded AFTER `matched` so a profile-only response never triggers the
    // credit charge on its own, yet is always persisted when Apollo returned it.
    // Present-only. `seniority`/`location` mirror it into their columns when
    // empty (never clobbering a value classify already set).
    const profile = buildApolloContactProfile(enrichData)
    if (profile) updates.apollo_enrichment = profile
    if (enrichData.seniority && !contact.seniority) updates.seniority = enrichData.seniority
    const apolloLocation = composeApolloLocation(enrichData.city, enrichData.country)
    if (apolloLocation && !contact.location) updates.location = apolloLocation

    // Trace de la tentative — écrite MÊME quand rien n'a été trouvé : c'est
    // précisément le cas vide qu'il faut mémoriser pour ne pas reproposer (et
    // refacturer) le même clic stérile. Les canaux enregistrés sont ceux encore
    // vides APRÈS fusion, ce qui permet de rouvrir la porte dès qu'ils changent.
    const mergedContact = { ...contact, ...updates }
    // Une cascade TRONQUÉE (budget de temps épuisé côté IA avant d'avoir épuisé
    // les sources) n'a pas fini de chercher. L'écrire `no_new_data` armerait
    // l'idempotence — ENRICHMENT_RETRY_COOLDOWN_DAYS jours pendant lesquels le
    // bouton se refuse — sur une question qu'on n'a jamais posée en entier. On ne
    // journalise donc la tentative que si elle a abouti, ou si elle est allée au
    // bout de ses sources. Le champ est optionnel côté contrat : un service IA
    // plus ancien ne l'envoie pas ⇒ comportement inchangé.
    // #3850.2 (lot V04, 08/10) — un FullEnrich resté `unknown` (sonde bornée
    // expirée AVANT la fin) laisse un `async_lookup` à REPRENDRE au prochain
    // passage, exactement comme une cascade tronquée par budget : la question
    // n'a pas été posée jusqu'au bout. Mesuré en prod le 08/10 : sans ça,
    // 18 recherches sur 19 armaient le cooldown de 30 jours sur un FullEnrich
    // qui n'avait pourtant pas fini de répondre — l'identifiant à reprendre
    // n'était alors plus jamais consommé.
    const cascadeTruncated = enrichData.truncated === true || Boolean(enrichmentReport.asyncLookup)
    // #2120.64 — le fournisseur A renvoyé quelque chose, mais l'arbitre l'a
    // refusé : une source de plus haute autorité (correction humaine,
    // connecteur) protège la valeur déjà en base. Ce n'est pas un « rien
    // trouvé » ordinaire — le résultat le distingue, et RIEN n'a été écrasé.
    const newerDataProtected = !matched && protectedFields.length > 0
    if (matched || newerDataProtected || !cascadeTruncated) {
      updates.last_enrichment_at = new Date()
      updates.last_enrichment_provider = provider
      updates.last_enrichment_result = matched ? 'matched' : newerDataProtected ? 'newer_data_exists' : 'no_new_data'
      updates.last_enrichment_missing = missingEnrichmentChannels(mergedContact)
      // #2159.62 — un MATCH reconfirme l'emploi (le fournisseur retrouve la
      // personne à SON organisation) : un `no_new_data`/`newer_data_exists` ne
      // vérifie rien sur l'employeur, la date n'avance donc pas dessus.
      if (matched) updates.employment_verified_at = new Date()
    } else {
      this.logger.warn('enrichContact: cascade tronquée (budget) — aucune trace écrite, la porte reste ouverte', {
        contactId,
        userId,
        tags: { provider, truncated: true },
      })
    }

    // Sans trace ni champ résolu (le seul cas : cascade tronquée qui n'a rien
    // ramené), il n'y a littéralement rien à écrire — et un `SET` vide serait une
    // erreur SQL.
    //
    // Ce write est le DERNIER point pouvant échouer avant le débit, et il tombe
    // dans la même classe de bug : une contrainte CHECK refusée (cf. la cause
    // racine « Erreur/SSE tronqué ») ou une colonne absente sortait en 500 nu,
    // que le web rendait « API error ». On le nomme, et le crédit reste intact
    // puisque le débit vit après.
    // E1 (#3698, décision Louis 07/10, point 2) — DERNIER maillon : le mobile
    // manque toujours après Apollo et FullEnrich ⇒ Apollo le révèle, livré plus
    // tard sur le webhook signé. Le webhook sait si CETTE tentative débite
    // (`debited`) : jamais deux crédits pour une même recherche.
    const willDebit = billable && !dto.free
    if (wantsPhone && !(updates.phone ?? contact.phone ?? '').trim() && this.phoneReveal?.isConfigured()) {
      const pendingReveal = (await enrichmentTrace())?.phone_reveal
      const requestedAt = pendingReveal ? Date.parse(pendingReveal.requested_at) : Number.NaN
      if (Number.isFinite(requestedAt) && Date.now() - requestedAt < PHONE_REVEAL_REUSE_MS) {
        // Une demande récente attend encore sa livraison : la remplacer
        // invaliderait son nonce, et le mobile payé chez Apollo serait perdu.
        sourceAttempts.push({ source: 'apollo', coordinate: 'phone', outcome: 'pending' })
      } else {
        const linkedinKey = updates.linkedin_url ?? contact.linkedin_url
        const reveal = await this.phoneReveal.request(
          { id: contactId, workspace_id: contact.workspace_id ?? null },
          {
            ...(apolloId ? { apolloId } : {}),
            ...(linkedinKey ? { linkedinUrl: linkedinKey } : {}),
            firstName: dto.first_name,
            ...(dto.last_name ? { lastName: dto.last_name } : {}),
            organizationName,
          },
          { debited: willDebit, free: Boolean(dto.free) },
        )
        if (reveal.state === 'pending' || reveal.state === 'error') {
          sourceAttempts.push({ source: 'apollo', coordinate: 'phone', outcome: reveal.state })
        }
      }
    }

    // E1 (#3698, #3822) — l'état PAR COORDONNÉE (« introuvable chez N sources »,
    // « en attente »…) et la trace interne, dans la MÊME écriture que la fiche.
    // Les sources n'y sont que comptées ; leur nom reste dans la trace interne.
    const attemptedAt = new Date().toISOString()
    const coordinates: EnrichmentCoordinateStates = {
      ...((contact.enrichment_coordinates ?? {}) as EnrichmentCoordinateStates),
      ...foldEnrichmentCoordinateStates(sourceAttempts, { ...contact, ...updates }, attemptedAt),
    }
    // #3850.2 — un `async_lookup` à reprendre se persiste même quand AUCUN
    // champ n'a été résolu cette fois : sans ça, l'identifiant de la sonde
    // FullEnrich (et l'état « en attente » affiché à l'écran) se perdaient
    // silencieusement, et le passage suivant repartait d'une recherche
    // neuve — payée une seconde fois — plutôt que de reprendre celle-ci.
    const hasSomethingToRecord = Object.keys(updates).length > 0 || Boolean(enrichmentReport.asyncLookup)
    try {
      if (hasSomethingToRecord) {
        await this.contacts
          .createQueryBuilder()
          .update(ContactEntity)
          .set({
            ...updates,
            enrichment_coordinates: coordinates,
            // R22 a4 — le verdict de la tentative met à jour la disponibilité du champ visé.
            ...availabilityPatchAfterSearch(
              {
                email_availability: contact.email_availability ?? null,
                phone_availability: contact.phone_availability ?? null,
              },
              coordinates,
            ),
            enrichment_trace: () => `COALESCE(enrichment_trace, '{}'::jsonb) || CAST(:tracePatch AS jsonb)`,
          })
          .where('id = :id', { id: contactId })
          .setParameter(
            'tracePatch',
            JSON.stringify({
              attempts: sourceAttempts.map(attempt => ({ ...attempt, at: attemptedAt })),
              // #4106 — journal INTERNE de la cascade (jamais exposé : `enrichment_trace` est
              // `select: false`, aucun écran ne le lit).
              cascade: cascadeLedger.toTrace(matched ? provider : null),
              async_lookup: enrichmentReport.asyncLookup
                ? { id: enrichmentReport.asyncLookup.id, requested_at: attemptedAt }
                : null,
            }),
          )
          .execute()
        contact.enrichment_coordinates = coordinates
      }
    } catch (error) {
      this.logger.error('enrichContact persistence failed — no credit charged', {
        error,
        contactId,
        userId,
        tags: { provider, stage: 'persist' },
      })
      return failure({
        code: 'update_failed',
        message: "Le contact n'a pas pu être mis à jour après l'enrichissement. Rien n'a été consommé — réessaie.",
      })
    }
    // #2988 (#2161) — provenance PAR CHAMP (source + date), sur les mêmes
    // trois champs que la fiche affiche déjà (email/téléphone/LinkedIn).
    // `field_provenance` porte déjà `observed_at` par (entité, champ) — cette
    // écriture manquait sur CE chemin (le contact unique) : seul le lot phase 3
    // (`writeEnrichment`, plus bas dans ce fichier) la posait. Snapshot AVANT
    // `Object.assign` juste en dessous, qui remplace `contact.email`/`.phone` par
    // leur valeur neuve — sinon `oldValue` recopierait `newValue`.
    if (this.provenance) {
      const provenanceChanges = (['email', 'phone', 'linkedin_url'] as const)
        .filter(field => field in updates)
        .map(field => ({ field, oldValue: contact[field], newValue: updates[field] }))
      if (provenanceChanges.length > 0) {
        await this.provenance.commit({
          workspaceId: contact.workspace_id,
          entityType: 'contact',
          entityId: contact.id,
          source: 'pipeline',
          actorId: null,
          changes: provenanceChanges,
        })
      }
    }

    // A successful enrichment (email/phone/linkedin) can advance the lifecycle
    // (→ enrichi / actionnable) — recompute + journal the passage with the
    // resolving provider, actor = the rep who triggered it. A photo-only
    // update never moves the ladder, so skip the sync in that case.
    Object.assign(contact, updates)
    if (matched) {
      // #2296.5 à .11, .29, .31 — `companyName` alimente le signal
      // `employerMismatch` : sans lui, un contact ne bascule jamais
      // `historique` (voir `lifecycleInput`, ci-dessus dans ce fichier).
      await this.syncContactLifecycle(contact, {
        source: provider,
        actor: userId,
        companyName: account?.company_name ?? null,
      })
    }

    // Ce que la cascade a coûté chez chaque fournisseur (D19). Enregistré même
    // quand rien n'a matché : un enrichissement infructueux ne débite PAS le
    // client, mais il nous a bel et bien coûté des appels — c'est justement ce
    // qu'aucun compteur ne voyait.
    await this.providerCosts?.record(this.providerCosts.parseHeader(costHeader), {
      workspaceId: contact.workspace_id ?? null,
      userId,
      accountId: contact.account_id ?? null,
      feature: 'enrichment',
    })

    let creditsRemaining = 0
    // #1931 L2 (D3 / I4) — ce que CETTE recherche a débité, rapporté à l'appelant
    // (routeur, worker). Il valait implicitement l'estimation côté Action OS : un
    // enrichissement « fait » qui ne trouvait rien comptait 1 crédit dépensé.
    let creditsDebited = 0
    if (billable && !dto.free) {
      const consume = await this.credits.consumeEnrichmentCredit(userId, {
        reason: `enrichissement: ${contact.full_name ?? contactId}`,
        accountId: contact.account_id ?? undefined,
      })
      if (!consume.ok) {
        // Race lost (concurrent enrich exhausted the quota first), OU la porte
        // de coût par espace a bloqué (#2975) — `consume.reason` porte alors le
        // message de `WorkspaceBudgetService.checkGate`, qui NOMME la limite
        // dépassée, jamais un « crédits épuisés » générique. The contact has
        // been updated; we still surface the error so the UI can show the
        // depleted balance — the provider cost is on us this time.
        this.logger.warn('enrichContact race lost — credit decrement returned 0 affected', {
          userId,
          contactId,
          reason: consume.reason,
        })
        if (consume.refusal === 'unavailable') {
          this.notifyEnrichmentOutage('quota_exceeded')
          return failure({
            code: 'enrichment_unavailable',
            message: consume.reason ?? "L'enrichissement est momentanément indisponible. Rien n'a été consommé.",
            reason: 'upstream_error',
            credit: 'not_debited',
          })
        }
        return failure({
          code: 'insufficient_credits',
          message: consume.reason ?? SOFT_BRAKE_MESSAGE,
          ...(consume.refusal === 'trial_ended' ? { refusal: 'trial_ended' as const } : {}),
        })
      }
      creditsRemaining = consume.remaining
      // Le débit gardé a TOUCHÉ une ligne (`ok`) hors démo (sortie plus haut) :
      // il a débité le poids de la grille, que `consumeEnrichmentCredit` résout
      // par défaut (`resolveEnrichmentCost('contact')` = `contact_enrichment`).
      creditsDebited = creditCostOf('contact_enrichment')
      // Best-effort product event — a provider matched + a credit was burned.
      // `workspaceId` scopes the row for the team activity journal (Théo p.21).
      void this.analytics?.track('contact_enriched', {
        userId,
        workspaceId: contact.workspace_id ?? null,
        properties: {
          contactId,
          accountId: contact.account_id ?? null,
          provider,
          gotEmail: Boolean(updates.email),
          gotPhone: Boolean(updates.phone),
        },
      })
    } else {
      // #3822.3 (recette prod 08/10, W 5b4b10d2f3) — rien de facturable (pas de
      // match, ou `dto.free`) laissait `creditsRemaining` à son 0 d'init : le
      // récapitulatif d'un lot disait « 0 crédit restant » à côté d'un compteur
      // latéral à 484. Rien débité n'est pas solde à zéro : on lit le solde
      // RÉEL, la même source que le compteur latéral (`CreditsService.getCredits`,
      // GA-26 — une seule source de solde).
      creditsRemaining = await this.credits
        .getCredits(userId)
        .then(c => c.credits_remaining)
        .catch(() => 0)
    }

    // E1 (point 7) — la mesure de couverture, lisible dans les journaux : une
    // ligne par source et par coordonnée, jamais une valeur.
    for (const attempt of sourceAttempts) {
      this.logger.log(
        `[E1-couverture] source=${attempt.source} coordinate=${attempt.coordinate} outcome=${attempt.outcome}`,
        { contactId },
      )
    }

    return success({
      ...contact,
      ...updates,
      enrichment: enrichData,
      credits_remaining: creditsRemaining,
      credits_debited: creditsDebited,
    })
  }

  /**
   * Retire du lot d'enrichissement les colonnes de fiche qu'une main a écrites.
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * POURQUOI CE CHEMIN N'ARBITRAIT PAS — un oubli, avec une excuse plausible
   * ─────────────────────────────────────────────────────────────────────────────
   * Les deux autres writers du fichier arbitrent : la fusion de lot (`mergeSeedInto`)
   * et la phase 3 (`applyEnrichment`). Tous deux tournent dans le RUN d'analyse,
   * et c'est là qu'on a cherché le danger. Celui-ci part d'un CLIC — le bouton
   * « Enrichir » — et le clic a été rangé, par réflexe, du côté de « geste
   * d'utilisateur = auto-approuvé ». Cette règle-là existe, mais elle porte sur
   * les PORTES d'écriture vers un CRM ou un ERP : elle dit qu'un utilisateur n'a
   * pas à confirmer deux fois ce qu'il vient de demander. Elle ne dit rien de
   * l'AUTORITÉ de la valeur. Ici, l'utilisateur ordonne de CHERCHER ; ce qui
   * revient vient d'Apollo, de Dropcontact ou de Hunter, c'est-à-dire du
   * pipeline, et le pipeline ne passe pas devant un humain. Confondre l'auteur
   * du geste avec l'auteur de la valeur est ce qui a laissé ce trou ouvert.
   *
   * Une intention voisine était pourtant bien là et se voit dans le code : les
   * champs secondaires ne se posent que dans un TROU (`if (dc.title && !contact.title)`,
   * `if (enrichData.seniority && !contact.seniority)`). Les trois canaux du cœur
   * — e-mail, téléphone, lien professionnel — en étaient exclus à dessein, pour
   * que « Enrichir » puisse RAFRAÎCHIR une coordonnée périmée. C'est juste, et
   * l'arbitre le préserve tel quel : il ne compare pas des dates, il compare des
   * autorités, et `pipeline ≥ pipeline` écrit. Ce qui change est le seul cas qui
   * devait changer : `pipeline` ne passe plus devant `human` ni `connector`.
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * CE QUE LA LECTURE SUPPLÉMENTAIRE COÛTE
   * ─────────────────────────────────────────────────────────────────────────────
   * Zéro quand il n'y a rien à protéger : si le lot ne touche AUCUNE colonne de
   * fiche — une cascade vide qui n'écrit qu'une trace, une réponse qui n'apporte
   * qu'une photo —, on sort avant la moindre requête. Sinon, un `SELECT` sur
   * `field_provenance` par (`entity_type`, `entity_id`), servi par l'index unique
   * de la table, derrière un appel fournisseur payant de plusieurs secondes. La
   * ligne courante, elle, est déjà chargée : contrairement au correctif des
   * comptes, il n'y a pas de second `findOne` à éviter.
   *
   * ⚠️ `email_verified` n'est pas une colonne de fiche mais il n'a de sens
   * qu'attaché à SON adresse : quand l'adresse est refusée, il part avec elle —
   * sinon la fiche déclarerait « vérifié » à propos d'une autre adresse que celle
   * qui a été vérifiée. Une adresse INCHANGÉE, elle, le garde : c'est bien la
   * même qui vient d'être vérifiée.
   */
  /**
   * Rend `rejected` — les champs qu'une main a écrits et que le pipeline ne
   * peut donc pas écraser. #2120.64 : c'est CE verdict qui distingue
   * `newer_data_exists` (le fournisseur a bien renvoyé quelque chose, mais une
   * source de plus haute autorité protège la valeur déjà en base) d'un simple
   * `no_new_data` (le fournisseur n'a rien apporté du tout).
   */
  /**
   * #4268.b / #4268.d — pose sur la fiche les coordonnées PRO que la base commune connaît déjà
   * pour cette personne, fraîches selon la règle du cache commun (`CACHE_TTL_CONTACT_S`, 30 j).
   * Ne remplit qu'un champ VIDE, et jamais un champ qu'une main de l'espace a retiré : la
   * correction de l'espace gagne chez lui, le commun ne l'écrase pas. Aucun débit, aucun coût
   * inscrit (« non mesuré »). Best-effort : une lecture en échec laisse la cascade partir.
   * Mute `contact` avec ce qui a été écrit ; rend les coordonnées servies.
   */
  private async fillFromSharedBase(
    contact: ContactEntity,
    account: AccountEntity | null,
    only: EnrichmentCoordinate | undefined,
  ): Promise<{ served: EnrichmentCoordinate[] }> {
    const companyKey = account ? sharedCompanyKey(account) : null
    if (!companyKey || !contact.workspace_id) return { served: [] }
    const wanted = (only ? [only] : (['email', 'phone'] as const)).filter(c => !(contact[c] ?? '').trim())
    if (wanted.length === 0) return { served: [] }
    try {
      const common = await sharedCoordinatesForPerson(
        this.contacts.manager,
        'live',
        companyKey,
        {
          fullName: contact.full_name,
          linkedinUrl: contact.linkedin_url,
          apolloId: (contact.raw_data as { apolloId?: string } | null)?.apolloId ?? null,
        },
        contactCacheTtlSeconds(),
      )
      if (!common) return { served: [] }
      const currentSources = this.provenance ? await this.provenance.currentSources('contact', contact.id) : {}
      const incoming: Record<string, unknown> = {}
      for (const coordinate of wanted) {
        // #4268.d — un champ vidé À LA MAIN reste vide : l'arbitre laisserait une source faible
        // « remplir le trou », or ce trou-là est une correction de l'espace.
        if (currentSources[coordinate] === 'human') continue
        const value =
          coordinate === 'phone'
            ? common.phone && isPlausiblePhoneNumber(common.phone)
              ? toE164(common.phone)
              : null
            : common.email
        if (value) incoming[coordinate] = value
      }
      const { accepted } = applyFieldUpdates({
        incoming,
        incomingSource: 'pipeline',
        current: toFieldView(contact as unknown as Record<string, unknown>, CONTACT_FIELD_COLUMNS),
        currentSources,
      })
      const patch = toColumnPatch(accepted, CONTACT_FIELD_COLUMNS) as Partial<Record<EnrichmentCoordinate, string>>
      const served = wanted.filter(coordinate => Boolean(patch[coordinate]))
      if (served.length === 0) return { served: [] }
      const trace = {
        last_enrichment_at: new Date(),
        last_enrichment_provider: SHARED_BASE_CONTACT_SOURCE,
        last_enrichment_result: 'matched' as EnrichmentAttemptResult,
        last_enrichment_missing: missingEnrichmentChannels({ ...contact, ...patch }),
      }
      await this.contacts
        .createQueryBuilder()
        .update(ContactEntity)
        .set({ ...patch, ...trace })
        .where('id = :id AND workspace_id = :workspaceId', { id: contact.id, workspaceId: contact.workspace_id })
        .execute()
      const changes = served.map(field => ({ field, oldValue: contact[field] ?? null, newValue: patch[field] }))
      Object.assign(contact, patch, trace)
      await this.provenance
        ?.commit({
          workspaceId: contact.workspace_id,
          entityType: 'contact',
          entityId: contact.id,
          source: 'pipeline',
          actorId: null,
          changes,
        })
        .catch(error =>
          this.logger.warn('enrichContact: provenance du commun non écrite', { error, contactId: contact.id }),
        )
      return { served }
    } catch (error) {
      this.logger.warn('enrichContact: base commune illisible — la cascade part', { error, contactId: contact.id })
      return { served: [] }
    }
  }

  private async arbitrateEnrichment(
    contact: ContactEntity,
    updates: Record<string, unknown>,
  ): Promise<{ rejected: { field: string; reason: string }[] }> {
    if (!this.provenance) return { rejected: [] }

    const incoming: Record<string, unknown> = {}
    for (const [field, column] of Object.entries(CONTACT_FIELD_COLUMNS)) {
      if (column in updates) incoming[field] = updates[column]
    }
    // Rien d'arbitrable dans ce lot : aucune lecture, chemin inchangé.
    if (Object.keys(incoming).length === 0) return { rejected: [] }

    const currentSources = await this.provenance.currentSources('contact', contact.id)
    const currentView = toFieldView(contact as unknown as Record<string, unknown>, CONTACT_FIELD_COLUMNS)
    const { rejected } = applyFieldUpdates({
      incoming,
      incomingSource: 'pipeline',
      current: currentView,
      currentSources,
    })
    if (rejected.length === 0) return { rejected: [] }

    // #4016.L13 — « fait confirmé jusqu'à preuve contraire » : le refus n'est plus muet. Ce que le
    // fournisseur a dit contre un fait confirmé à la main est tracé pour être NOMMÉ à côté, jamais
    // écrit à sa place. Best-effort : un blip du journal ne casse pas l'enrichissement.
    const at = new Date().toISOString()
    const contradictions = rejected.flatMap(({ field }) => {
      const value = incoming[field]
      return typeof value === 'string' &&
        contradictsConfirmedFact({
          field,
          currentValue: currentView[field],
          currentSource: currentSources[field] ?? null,
          currentObservedAt: at,
          incomingValue: value,
          incomingSource: 'pipeline',
          incomingAt: at,
        })
        ? [{ field, value: value.trim() }]
        : []
    })
    if (contradictions.length > 0) {
      await this.provenance
        .recordContradictions({
          workspaceId: contact.workspace_id ?? null,
          entityType: 'contact',
          entityId: contact.id,
          source: 'pipeline',
          contradictions,
        })
        .catch((error: unknown) => this.logger.warn('enrichContact : contradiction non tracée', { error }))
    }

    for (const { field } of rejected) {
      delete updates[CONTACT_FIELD_COLUMNS[field as keyof typeof CONTACT_FIELD_COLUMNS]]
      if (field === 'email') delete updates['email_verified']
    }
    this.logger.log(`enrichContact : ${rejected.length} champ(s) de contact préservés — corrigés à la main`, {
      contactId: contact.id,
      fields: rejected.map(r => r.field),
    })
    return { rejected }
  }

  /** Vrai quand l'espace actif du caller est une démo. Échoue en « non », pour
   *  qu'un incident de résolution ne bascule jamais un vrai compte sur le
   *  chemin fictif. */
  private async isDemoWorkspace(userId: string): Promise<boolean> {
    try {
      return await this.workspaceContext.isDemoWorkspace(userId)
    } catch {
      return false
    }
  }

  /**
   * Le chemin d'enrichissement d'un espace de démonstration : coordonnées
   * fictives (voir {@link demoEnrichment}), persistées comme les vraies pour
   * que l'écran se comporte exactement pareil — mais AUCUN appel fournisseur
   * et AUCUN débit.
   *
   * Volontairement à part du chemin réel plutôt qu'un drapeau porté sur 150
   * lignes : le chemin qui facture reste ainsi byte-identique.
   */
  private async enrichContactInDemo(
    contact: ContactEntity,
  ): Promise<
    Result<
      ContactEntity & { enrichment: ApolloEnrichmentData; credits_remaining: number; credits_debited: number },
      ContactFailure
    >
  > {
    // Les AUTRES fiches du même compte : c'est avec elles qu'on reconstruit
    // l'entourage de la personne. Chaque relation porte donc l'identifiant d'une
    // fiche qui existe — l'onglet « Relations » cesse d'être vide ET ses liens
    // « Voir la fiche » mènent quelque part. Chargées EN PREMIER (avant tout
    // profil fictif) : c'est aussi la liste où se cherche un homonyme, juste
    // en dessous.
    const siblings = contact.account_id
      ? await this.contacts.find({
          where: { account_id: contact.account_id, user_id: contact.user_id, deleted_at: IsNull() },
          select: ['id', 'full_name', 'title', 'entity', 'decision_role', 'priority'],
          order: { priority: 'ASC' },
        })
      : []

    // #2297.18 (27/09/2026) — MÊME porte qu'en réel (`enrichContact`, ligne
    // ~2990) : une identité AMBIGUË rend `ambiguous` avant même de construire
    // un profil fictif — jamais une identité choisie à sa place. En réel,
    // l'ambiguïté vient du FOURNISSEUR (il rend plusieurs personnes pour un
    // même nom dans la même société) — PAS de deux fiches du même compte :
    // l'index unique `idx_contacts_account_normalized_name` interdit
    // justement ça, en démo comme en réel. Comparer ce contact à ses
    // `siblings` (comme le fait `enrichContact` en réel) ne peut donc JAMAIS
    // trouver de doublon ici — ce serait vérifier une contrainte que la base
    // tient déjà. La démonstration simule à la place le même ÉVÉNEMENT que le
    // fournisseur produirait, sur un nom+société connus à l'avance et
    // déterministes (`isDemoAmbiguousProviderMatch`, `demo-enrichment.ts`).
    if (isDemoAmbiguousProviderMatch(contact.full_name, contact.entity)) {
      const ambiguousUpdates = {
        last_enrichment_at: new Date(),
        last_enrichment_provider: 'demo',
        last_enrichment_result: 'ambiguous' as EnrichmentAttemptResult,
        last_enrichment_missing: missingEnrichmentChannels(contact),
      }
      await this.contacts
        .createQueryBuilder()
        .update(ContactEntity)
        .set(ambiguousUpdates)
        .where('id = :id', { id: contact.id })
        .execute()
      const remaining = await this.credits
        .getCredits(contact.user_id)
        .then(c => c.credits_remaining)
        .catch(() => 0)
      return success({
        ...contact,
        ...ambiguousUpdates,
        enrichment: demoEnrichment(contact),
        credits_remaining: remaining,
        credits_debited: 0,
      })
    }

    // Le dossier qui porte le contact : il donne la ville, le secteur et les
    // signaux dont le profil enrichi est dérivé. Absent (cas théorique d'un
    // contact orphelin) ⇒ on retombe sur les coordonnées seules, jamais sur une
    // erreur : une démonstration ne doit pas casser sur un cas de bord.
    // #2671.5 — le dossier se lit sous la borne d'espace du contact : un
    // `account_id` qui pointe un autre espace retombe sur « pas de dossier ».
    const account = contact.account_id
      ? await this.accounts.findOne({
          where: { id: contact.account_id, workspace_id: contact.workspace_id ?? IsNull() },
        })
      : null
    const dossier = account
      ? {
          company_name: account.company_name ?? '',
          sector: account.sector ?? '',
          headquarters: account.headquarters ?? '',
          recent_signals: account.recent_signals ?? [],
        }
      : null
    const seed = dossier
      ? {
          full_name: contact.full_name ?? '',
          title: contact.title ?? '',
          entity: contact.entity ?? '',
          family: contact.family ?? '',
          decision_role: contact.decision_role ?? '',
          priority: contact.priority ?? 3,
          seniority: contact.seniority ?? 'inconnu',
          key_points: contact.key_points ?? [],
          why_contact: contact.why_contact ?? '',
        }
      : null
    // #2297.54 — la démonstration est un fournisseur comme un autre : même filtre.
    const profile = seed && dossier ? withoutForbiddenEnrichmentFields(demoApolloProfile(seed, dossier)) : undefined
    const enrichment = demoEnrichment(contact, profile)

    const updates = {
      email: enrichment.email ?? undefined,
      email_verified: enrichment.email_status === 'verified',
      phone: enrichment.phone ?? undefined,
      linkedin_url: enrichment.linkedin_url ?? undefined,
      // Ce que le clic « Enrichir » ramène GRATUITEMENT avec les coordonnées sur
      // le vrai chemin (parcours, formation, ville, départements) — voir
      // `enrichContact`. Sans lui, la démonstration montrait un enrichissement
      // qui ne remplissait que trois lignes.
      ...(profile ? { apollo_enrichment: profile } : {}),
      ...(profile?.seniority && !contact.seniority ? { seniority: profile.seniority } : {}),
      ...(seed && dossier && !contact.location ? { location: demoLocation(seed, dossier) } : {}),
      ...(siblings.length > 1
        ? {
            relations: demoContactRelations(
              { id: contact.id, entity: contact.entity, priority: contact.priority },
              siblings,
            ),
          }
        : {}),
      // #2120.68 / #2120.70 — provenance par champ, au MÊME clic « Enrichir »
      // qu'en réel : sans ce bloc, la salle de démo n'aurait aucun écran pour
      // montrer les deux points. `email_status` vaut toujours `null` en démo
      // (aucune adresse `.example` ne délivre par construction, voir plus
      // bas) : la confiance reflète honnêtement CETTE réalité — le même degré
      // qu'un e-mail réel `unverified` (trouvé, pas confirmé), jamais `high`
      // ni devinée. Le téléphone n'a aucun signal de confiance fiable, en
      // démo comme en réel : `phone_confidence` reste absent (non mesurée).
      // Le coût, lui, est le VRAI poids crédit de l'action — un enrichissement
      // réel du même type coûterait exactement cela.
      ...(enrichment.email
        ? { email_confidence: 'medium' as const, email_cost_credits: creditCostOf('contact_enrichment') }
        : {}),
      ...(enrichment.phone ? { phone_cost_credits: creditCostOf('contact_enrichment') } : {}),
      // Le tampon de provenance existant pour les données de démo (migration
      // 1785950000000) : ces coordonnées ne doivent jamais passer pour réelles.
      source: 'demo',
      last_enrichment_at: new Date(),
      last_enrichment_provider: 'demo',
      last_enrichment_result: 'matched',
      last_enrichment_missing: [] as string[],
      // E1 (#3698, #3822) — MÊME état par coordonnée qu'en réel : les trois
      // coordonnées fictives sont posées, donc « trouvées » (parité démo).
      enrichment_coordinates: demoEnrichmentCoordinatesAllFound(new Date().toISOString()),
      // #2159.62 — MÊME porte qu'en réel (`enrichContact`, ligne ~3317) : un
      // MATCH reconfirme l'emploi. Ce clic est toujours `matched` (la
      // démonstration n'a ni `no_new_data` ni `newer_data_exists`), donc la
      // date avance à chaque fois — comme en réel sur un contact jamais
      // protégé par une correction humaine ou un connecteur.
      employment_verified_at: new Date(),
    }

    try {
      await this.contacts
        .createQueryBuilder()
        .update(ContactEntity)
        .set(updates)
        .where('id = :id', { id: contact.id })
        .execute()
    } catch (error) {
      this.logger.error('enrichContact (demo) persistence failed', { error, contactId: contact.id })
      return failure({
        code: 'update_failed',
        message: "Le contact n'a pas pu être mis à jour. Réessaie.",
      })
    }

    Object.assign(contact, updates)
    // `credits_remaining: 0` mentirait sur un compteur ; en démo les crédits ne
    // bougent pas, donc on rend le solde tel qu'il est.
    const remaining = await this.credits
      .getCredits(contact.user_id)
      .then(c => c.credits_remaining)
      .catch(() => 0)
    // I6 — une salle de démonstration ne débite jamais.
    return success({ ...contact, enrichment, credits_remaining: remaining, credits_debited: 0 })
  }

  async updateStatus(id: string, userId: string, userStatus: string): Promise<Result<ContactEntity, ContactFailure>> {
    const existing = await this.contacts.findOne({ where: await this.contactGestureTarget(id, userId) })
    if (!existing) {
      return failure({ code: 'not_found', message: `Contact ${id} introuvable` })
    }
    const previousStatus = existing.user_status
    try {
      existing.user_status = userStatus
      const saved = await this.contacts.save(existing)
      // « Le plan se replanifie après chaque réponse » (annexe méthodo p27) : un
      // événement contact périme le plan → on pose un repère sur le compte pour
      // afficher un nudge. On NE re-lance PAS la phase 4 (coût) — c'est le clic
      // de l'utilisateur qui replanifie (règle « on prépare, l'utilisateur
      // déclenche »). Best-effort, raw SQL (évite un import circulaire) et scopé.
      if (shouldSuggestReplan(previousStatus, userStatus)) {
        try {
          await this.contacts.query(
            `UPDATE accounts SET replan_suggested_at = now()
             WHERE id = $1 AND replan_suggested_at IS NULL
               AND (workspace_id = $2 OR (workspace_id IS NULL AND user_id = $3))`,
            [existing.account_id, (await this.workspaceContext.resolveActiveWorkspace(userId)).workspaceId, userId],
          )
        } catch (cause) {
          this.logger.warn('replan-suggested flag failed', { error: cause, contactId: id })
        }
      }
      // #2381.1/.6 (LAU-FINAL-095) — le contact a répondu / un RDV est pris →
      // ses séquences ACTIVES et EN PAUSE s'ARRÊTENT (jamais un simple
      // pause) : « pas d'étape suivante pour être sûr » (doctrine, issue
      // #2381). Best-effort, factorisé dans `autoStopOutreachSequences` —
      // même geste que #2733/#2378.3 sur un rebond confirmé, voir plus bas.
      if (userStatus === 'replied' || userStatus === 'meeting') {
        const event: OutreachSequenceStopEvent = userStatus === 'meeting' ? 'meeting_booked' : 'reply_received'
        await this.autoStopOutreachSequences(id, userId, event)
      }
      // L'issue passe AUSSI au journal d'activité (`user_actions`), d'où la
      // sortent les compteurs hebdomadaires et les KPIs d'équipe.
      //
      // Écrit ICI, et pas depuis le web, pour que les deux vérités ne puissent
      // pas diverger : le statut du contact et sa trace au journal naissent du
      // MÊME geste. Un second appel côté client aurait pu échouer seul, et deux
      // écrans auraient alors raconté deux histoires du même après-midi.
      await this.recordOutcomeAction(saved, userId, previousStatus, userStatus)
      return success(saved)
    } catch (cause) {
      this.logger.error('updateStatus error', { error: cause })
      return failure({ code: 'update_failed', message: 'Impossible de mettre à jour le statut' })
    }
  }

  /**
   * Consigne au journal d'activité l'issue déclarée par le commercial.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CETTE MÉTHODE EXISTE
   * ─────────────────────────────────────────────────────────────────────────
   * `response_received` et `rdv_obtained` étaient LUS par la production — les
   * statistiques de la semaine, les KPIs d'équipe, le flux d'activité — et
   * écrits par PERSONNE. Aucun geste du produit ne les produisait, si bien que
   * « taux de réponse 0 % » ne mesurait pas une contre-performance : il mesurait
   * une absence de moyen.
   *
   * Le geste manquant est le changement de statut du contact, dont l'endpoint
   * existait déjà et qu'aucun écran n'appelait. Il est désormais atteignable, et
   * c'est LUI qui écrit la trace.
   *
   * UNIQUEMENT sur une transition RÉELLE (`previous !== next`) : re-choisir le
   * statut déjà porté n'est pas un nouvel événement, et laisser un double-clic
   * fabriquer deux réponses rendrait le compteur auto-gonflable.
   *
   * Best-effort : le statut est déjà persisté quand on arrive ici. Un journal
   * qui échoue ne doit pas défaire un geste que l'utilisateur a vu réussir.
   *
   * m13 : la MÊME issue fait aussi basculer le board de sprints du compte,
   * ELLE AUSSI best-effort — le geste de l'utilisateur prime sur tout effet
   * secondaire, ici comme pour l'auto-pause des séquences ci-dessus. `saved.id`
   * (l'id de la ligne `user_actions` qu'on vient d'écrire) sert de référence de
   * cause : c'est elle qui porte l'idempotence côté `SprintsService`. Sans
   * trace écrite (le premier bloc a échoué), il n'y a pas de référence à
   * porter, et on n'y va pas.
   *
   * m18 : la bascule ne passe plus par un appel direct à `SprintsService`
   * (GA-07 l'a refusé — un service qui va chercher le service d'un autre
   * module). `ContactsService` ÉMET sur `SprintProgressionBus` (« l'issue d'un
   * contact a été enregistrée » : l'espace, le compte, l'événement de sprint,
   * la référence de cause) ; `SprintProgressionListener`, dans le module
   * sprints, ÉCOUTE et appelle `SprintsService.applyEvent` à sa place. `emit`
   * attend son écouteur (comme `EventEmitter2.emitAsync`), donc ce bloc reste
   * best-effort exactement comme avant : le try/catch protège l'émission, et
   * l'écouteur protège déjà son propre appel.
   */
  private async recordOutcomeAction(
    contact: ContactEntity,
    userId: string,
    previousStatus: string | null,
    nextStatus: string,
  ): Promise<void> {
    const outcome = CONTACT_STATUS_OUTCOMES[nextStatus]
    if (!outcome || previousStatus === nextStatus) return
    let workspaceId: string
    let saved: UserActionEntity
    try {
      ;({ workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId))
      saved = await this.userActions.save(
        this.userActions.create({
          user_id: userId,
          workspace_id: workspaceId,
          account_id: contact.account_id,
          contact_id: contact.id,
          action_type: outcome.actionType,
          channel: null,
          metadata: {
            label: outcome.label,
            detail: contact.full_name ?? '',
            contact_name: contact.full_name,
            contact_title: contact.title,
            // La nature de la trace, comme pour les envois : ceci est une
            // DÉCLARATION du commercial, pas une lecture de sa boîte mail.
            via: 'declaration',
            declared: true,
            previous_status: previousStatus,
          },
        }),
      )
    } catch (cause) {
      this.logger.error('outcome action-log error', { error: cause, tags: { contactId: contact.id } })
      return
    }

    // Un contact sans compte rattaché ne fait rien basculer — il n'y a rien à
    // faire basculer. (`contacts.account_id` est NOT NULL en base ; ce garde
    // reste une défense en profondeur.)
    if (!contact.account_id) return

    try {
      await this.sprintBus?.emit({
        workspaceId,
        accountId: contact.account_id,
        event: outcome.sprintEvent,
        sourceRef: saved.id,
      })
    } catch (cause) {
      this.logger.warn('sprint switch failed', {
        error: cause,
        tags: { contactId: contact.id, accountId: contact.account_id },
      })
    }
  }

  /** Set/clear the free-form commercial note. A blank/whitespace-only value
   *  collapses to NULL so the UI renders an empty editor rather than spaces. */
  async updateNote(id: string, userId: string, note: string | null): Promise<Result<ContactEntity, ContactFailure>> {
    const existing = await this.contacts.findOne({ where: await this.contactGestureTarget(id, userId) })
    if (!existing) {
      return failure({ code: 'not_found', message: `Contact ${id} introuvable` })
    }
    try {
      existing.note = nullifyBlank(note)
      const saved = await this.contacts.save(existing)
      return success(saved)
    } catch (cause) {
      this.logger.error('updateNote error', { error: cause })
      return failure({ code: 'update_failed', message: 'Impossible de mettre à jour la note' })
    }
  }

  /**
   * #3942.2 — « Préparer un e-mail par personne » (spec Louis #3942, 08/10) :
   * écrit `email_message` SANS envoyer, ni toucher `email_sent_at` /
   * `email_send_state`. Le geste qui valide un brouillon personnalisé, un
   * contact à la fois, dans l'écran de revue — « statut préparé, jamais
   * envoyé » (doctrine : le copilote prépare, le commercial envoie).
   *
   * Même ownership strict (`user_id`) que `updateNote`/`sendEmail` : un
   * brouillon se prépare sur SES contacts, jamais sur ceux d'un collègue.
   */
  async saveEmailDraft(
    id: string,
    userId: string,
    draft: SaveContactEmailDraft,
  ): Promise<Result<ContactEntity & { mailbox_draft: ContactEmailDraftMailbox }, ContactFailure>> {
    const existing = await this.contacts.findOne({ where: await this.contactGestureTarget(id, userId) })
    if (!existing) {
      return failure({ code: 'not_found', message: `Contact ${id} introuvable` })
    }
    try {
      existing.email_message = draft.subject ? { subject: draft.subject, body: draft.body } : { body: draft.body }
      const saved = await this.contacts.save(existing)
      // #4412 — le brouillon Bellum est écrit ; on tente AUSSI le vrai brouillon dans la boîte.
      const mailbox_draft = await this.draftInMailbox(userId, saved, draft)
      return success(Object.assign(saved, { mailbox_draft }))
    } catch (cause) {
      this.logger.error('saveEmailDraft error', { error: cause })
      return failure({ code: 'update_failed', message: 'Impossible d’enregistrer le brouillon' })
    }
  }

  /**
   * #4412 — dépose le brouillon chez le fournisseur par le service mailbox (un seul
   * chemin d'écriture). Jamais un envoi. Un échec ne défait PAS le brouillon Bellum :
   * il est RENDU avec sa raison, jamais avalé en faux succès.
   */
  private async draftInMailbox(
    userId: string,
    contact: ContactEntity,
    draft: SaveContactEmailDraft,
  ): Promise<ContactEmailDraftMailbox> {
    if (!this.mailboxSender) return { status: 'not_connected' }
    let provider: MailboxProvider | null = null
    try {
      // #4546.5 — la boîte désignée se lit parmi SES boîtes ; celle d'un autre « n'est pas connectée » pour lui.
      const mailbox = draft.sender_connection_id
        ? await this.mailboxSender.status(userId, draft.sender_connection_id)
        : await this.mailboxSender.status(userId)
      if (!mailbox.connected) return { status: 'not_connected' }
      provider = mailbox.provider
      if (!contact.email) return { status: 'failed', provider, reason: 'Ce contact n’a pas d’adresse e-mail.' }
      // Jamais d'objet inventé : sans objet, le fournisseur n'est pas appelé et on le DIT.
      if (!draft.subject) return { status: 'failed', provider, reason: 'Le brouillon n’a pas d’objet.' }
      const result = await this.mailboxSender.draft(userId, {
        contactId: contact.id,
        to: contact.email,
        subject: draft.subject,
        body: draft.body,
        ...(draft.sender_connection_id ? { senderConnectionId: draft.sender_connection_id } : {}),
      })
      return { status: 'created', provider: result.provider }
    } catch (cause) {
      const reason = cause instanceof Error && cause.message ? cause.message : 'Le fournisseur a refusé le brouillon.'
      this.logger.warn('saveEmailDraft mailbox error', { error: cause })
      return { status: 'failed', provider, reason }
    }
  }

  /**
   * #2160.60 — « Autoriser la recommandation », sur la FICHE CONTACT : lève un
   * doute d'IDENTITÉ (`homonym_conflict` / `entity_mismatch` uniquement — le
   * DTO zod refuse tout le reste) à la porte d'éligibilité du classement
   * (`contact-eligibility.ts`). Une CORRECTION HUMAINE stockée (qui, quand,
   * quelle raison), jamais un recalcul.
   *
   * Périmètre : l'ESPACE actif, pas `user_id` — tout membre de l'espace peut
   * poser ou retirer cette autorisation (décision produit #2160.60, distincte
   * du périmètre plus étroit `{ id, user_id }` des corrections voisines) ; un
   * contact d'un autre espace répond 404, sans écriture.
   */
  async authorizeRecommendation(
    id: string,
    userId: string,
    reason: ContactRecommendationAuthorizableReason,
  ): Promise<Result<ContactEntity, ContactFailure>> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const existing = await this.contacts.findOne({
      where: { id, deleted_at: IsNull(), ...workspaceScopeWhere(workspaceId) },
    })
    if (!existing) {
      return failure({ code: 'not_found', message: `Contact ${id} introuvable` })
    }
    try {
      existing.recommendation_authorized_at = new Date()
      existing.recommendation_authorized_by = userId
      existing.recommendation_authorized_reason = reason
      const saved = await this.contacts.save(existing)
      return success(saved)
    } catch (cause) {
      this.logger.error('authorizeRecommendation error', { error: cause })
      return failure({ code: 'update_failed', message: 'Impossible d’autoriser la recommandation de ce contact' })
    }
  }

  /** #2160.60 — retire l'autorisation : réversible, remet les trois colonnes à
   *  `NULL` plutôt que de poser un second statut (doctrine — aucun cinquième
   *  état, même esprit que #2650.2). Même périmètre ESPACE que la pose. */
  async revokeRecommendationAuthorization(id: string, userId: string): Promise<Result<ContactEntity, ContactFailure>> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const existing = await this.contacts.findOne({
      where: { id, deleted_at: IsNull(), ...workspaceScopeWhere(workspaceId) },
    })
    if (!existing) {
      return failure({ code: 'not_found', message: `Contact ${id} introuvable` })
    }
    try {
      existing.recommendation_authorized_at = null
      existing.recommendation_authorized_by = null
      existing.recommendation_authorized_reason = null
      const saved = await this.contacts.save(existing)
      return success(saved)
    } catch (cause) {
      this.logger.error('revokeRecommendationAuthorization error', { error: cause })
      return failure({ code: 'update_failed', message: "Impossible de retirer l'autorisation de ce contact" })
    }
  }

  /**
   * #2160.58 — la confirmation POSITIVE « bon contact », symétrique du refus
   * (`contact_stops` `confirmed_wrong_contact`). Idempotent, jamais de levée
   * exposée ici : c'est une déclaration, pas un bouton à bascule — même esprit
   * que `contact_stops` (D351), sans le geste irréversible.
   */
  async confirmIdentity(id: string, userId: string): Promise<Result<ContactEntity, ContactFailure>> {
    const existing = await this.contacts.findOne({ where: await this.contactGestureTarget(id, userId) })
    if (!existing) {
      return failure({ code: 'not_found', message: `Contact ${id} introuvable` })
    }
    try {
      existing.identity_confirmed_at = new Date()
      existing.identity_confirmed_by = userId
      const saved = await this.contacts.save(existing)
      return success(saved)
    } catch (cause) {
      this.logger.error('confirmIdentity error', { error: cause })
      return failure({ code: 'update_failed', message: "Impossible de confirmer l'identité du contact" })
    }
  }

  /**
   * #4418.1 — « Marquer envoyé » sur le brouillon d'un contact : le commercial a envoyé LUI-MÊME.
   * DÉCLARATIF (`via: 'declaration'`, c81) : on journalise le geste et on planifie la MÊME cadence
   * qu'un envoi Bellum (J+3/J+6/J+9, ancrée sur le jour DÉCLARÉ, sinon aujourd'hui) — jamais `email_sent_at`, jamais une
   * preuve d'envoi. Idempotent (la cadence déjà posée n'est pas doublée) ; la planification est
   * best-effort : le « fait » est déjà consigné.
   */
  async declareSent(
    id: string,
    userId: string,
    channel: 'email' | 'linkedin',
    sentOn?: string,
  ): Promise<Result<{ contact_id: string; declared: true }, ContactFailure>> {
    // #4418 — la cadence part de la date DÉCLARÉE (midi UTC = le même jour à Paris). Une date
    // illisible ou future est refusée AVANT toute écriture : on ne planifie pas depuis l'avenir.
    const anchor = sentOn ? new Date(`${sentOn}T12:00:00Z`) : new Date()
    if (sentOn && (Number.isNaN(anchor.getTime()) || sentOn > new Date().toISOString().slice(0, 10))) {
      return failure({ code: 'invalid', message: "La date d'envoi déclarée est invalide ou dans le futur" })
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const contact = await this.contacts.findOne({
      where: { id, deleted_at: IsNull(), ...workspaceScopeWhere(workspaceId) },
    })
    if (!contact) {
      return failure({ code: 'not_found', message: `Contact ${id} introuvable` })
    }
    try {
      await this.userActions.save(
        this.userActions.create({
          user_id: userId,
          workspace_id: workspaceId,
          account_id: contact.account_id ?? null,
          contact_id: contact.id,
          action_type: 'plan_action_message_sent',
          channel,
          metadata: {
            label: 'Message envoyé',
            detail: channel === 'email' ? 'Déclaré envoyé par email' : 'Déclaré envoyé sur LinkedIn',
            source: 'engagement_panel',
            contact_name: contact.full_name,
            via: 'declaration',
            declared: true,
            ...(sentOn ? { declared_sent_on: sentOn } : {}),
          },
        }),
      )
    } catch (cause) {
      this.logger.error('declareSent action-log error', { error: cause, tags: { contactId: contact.id } })
      return failure({ code: 'update_failed', message: "Impossible d'enregistrer le message comme envoyé" })
    }
    try {
      await this.cadence.scheduleForContact(contact, userId, anchor)
    } catch (cause) {
      this.logger.warn('declareSent cadence scheduling failed (declaration already logged)', {
        error: cause instanceof Error ? cause.message : String(cause),
        tags: { contactId: contact.id },
      })
    }
    return success({ contact_id: contact.id, declared: true })
  }

  /** Soft-hide (or un-hide) a contact. Hidden contacts drop out of the default
   *  list but stay reachable by id. */
  async setHidden(id: string, userId: string, hidden: boolean): Promise<Result<ContactEntity, ContactFailure>> {
    const existing = await this.contacts.findOne({ where: await this.contactGestureTarget(id, userId) })
    if (!existing) {
      return failure({ code: 'not_found', message: `Contact ${id} introuvable` })
    }
    try {
      existing.hidden = hidden
      const saved = await this.contacts.save(existing)
      // #3942.5 — `hidden` gate directement l'éligibilité (`filterEligibleContacts`) :
      // un contact masqué ou démasqué peut changer le chemin recommandé de son compte.
      if (saved.account_id && saved.workspace_id) {
        this.invalidateRecommendedPath(saved.workspace_id, saved.account_id)
      }
      return success(saved)
    } catch (cause) {
      this.logger.error('setHidden error', { error: cause })
      return failure({ code: 'update_failed', message: 'Impossible de masquer le contact' })
    }
  }

  /**
   * Palier 1 « Envoie l'email » — envoie le brouillon `email_message` du contact
   * à son adresse email, via le transport Resend, et enregistre l'envoi.
   *
   * Garde-fous : ownership strict (`user_id`), email + brouillon présents, envoi
   * idempotent (un contact déjà envoyé ne peut pas être ré-envoyé — `already_sent`).
   * `replyToEmail` = l'email du commercial pour que les réponses lui reviennent
   * (ignoré s'il n'est pas une adresse valide). L'action réelle est loguée dans
   * `user_actions` (`message_sent` / canal `email`) — plus de log déclaratif.
   *
   * `reviewedDraft` = le brouillon RELU à l'écran (module d'approche). Le panneau
   * génère son brouillon à la volée sans le persister : sans ce paramètre on
   * enverrait `email_message` (écrit par l'analyse), donc un texte différent de
   * celui que le commercial vient de relire. Fourni, il devient le contenu envoyé
   * ET l'état persisté du contact — jamais un relais de texte libre : le
   * destinataire reste `contact.email` et toutes les gardes ci-dessous tiennent.
   */
  async sendEmail(
    id: string,
    userId: string,
    replyToEmail?: string,
    reviewedDraft?: ReviewedDraft,
    channel: ContactSendChannel = 'workspace',
    /** #3699.6 — les documents choisis par le commercial (identifiants d'assets). */
    attachmentAssetIds: readonly string[] = [],
    /** #4546.5 — la boîte désignée parmi SES boîtes (canal `mailbox` seulement) ; absent = la boîte par défaut. */
    senderConnectionId?: string,
  ): Promise<Result<SendContactEmailResult, ContactFailure>> {
    const contact = await this.contacts.findOne({ where: await this.contactGestureTarget(id, userId) })
    if (!contact) {
      return failure({ code: 'not_found', message: `Contact ${id} introuvable` })
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return this.deliverDraft(
      contact,
      userId,
      workspaceId,
      replyToEmail,
      reviewedDraft,
      channel,
      attachmentAssetIds,
      senderConnectionId,
    )
  }

  /**
   * #3699.5 — la personne a VÉRIFIÉ sa boîte d'envoi après une tentative
   * incertaine. `not_sent` rouvre l'envoi (l'état redevient `failed`) ; `sent`
   * consigne que le message y est — un geste DÉCLARATIF, jamais une preuve
   * d'envoi (doctrine) : pas d'événement `message_sent`, pas de cadence, la
   * date posée est celle de la déclaration.
   */
  async resolveSendAttempt(
    id: string,
    userId: string,
    outcome: 'not_sent' | 'sent',
  ): Promise<Result<{ contact_id: string; state: 'failed' | 'handed_off' }, ContactFailure>> {
    const contact = await this.contacts.findOne({ where: await this.contactGestureTarget(id, userId) })
    if (!contact) return failure({ code: 'not_found', message: `Contact ${id} introuvable` })
    if (effectiveContactSendState(contact) !== 'uncertain') {
      return failure({ code: 'invalid', message: "Aucune tentative d'envoi incertaine à lever pour ce contact." })
    }
    if (outcome === 'not_sent') {
      await this.contacts.update({ id: contact.id }, { email_send_state: 'failed' })
      return success({ contact_id: contact.id, state: 'failed' })
    }
    await this.contacts.update({ id: contact.id }, { email_send_state: 'handed_off', email_sent_at: new Date() })
    return success({ contact_id: contact.id, state: 'handed_off' })
  }

  /**
   * #2375.10 — DÉCISION LOUIS 21/09/2026 (doctrine `c82_copilote_prepare_le_
   * commercial_envoie`) : la surface MCP ne fait plus partir de message. Elle
   * PRÉPARE, exactement comme le reste du produit — même résolution que
   * `deliverDraft` (`resolveSendableDraft`, ci-dessous : ownership déjà
   * vérifiée par l'appelant, puis `no_email` → `no_draft` → `already_sent` →
   * `suppressed`) — mais elle s'arrête AVANT `MailerService.sendOutreachEmail`
   * et avant de stamper `email_sent_at`. Rien n'est envoyé, rien de nouveau
   * n'est écrit : le brouillon `email_message` existant (celui que l'écran
   * afficherait) est simplement CONFIRMÉ prêt.
   *
   * Rend un IDENTIFIANT, jamais un contenu (doctrine : le corps d'un message
   * ne sort jamais vers un humain ni vers le modèle) — `contact_id`, pour que
   * l'appelant MCP sache quelle fiche montrer au commercial. L'envoi reste un
   * geste fait DANS le produit, par un clic.
   */
  async prepareEmail(id: string, userId: string): Promise<Result<PreparedEmailResult, ContactFailure>> {
    const contact = await this.contacts.findOne({ where: await this.contactGestureTarget(id, userId) })
    if (!contact) {
      return failure({ code: 'not_found', message: `Contact ${id} introuvable` })
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const resolved = await this.resolveSendableDraft(contact, workspaceId)
    if (isFailure(resolved)) return resolved
    return success({ contact_id: contact.id })
  }

  /**
   * Palier 1 — envoi en masse. Envoie le brouillon à plusieurs contacts d'un
   * coup (« envoie à tous ces gens »). Chaque contact est traité indépendamment :
   * un échec (opt-out, déjà envoyé, pas d'email…) ne bloque pas les autres, il
   * apparaît dans `skipped` avec sa raison. Plafonné à BULK_SEND_MAX.
   */
  async sendEmailBulk(
    ids: string[],
    userId: string,
    replyToEmail?: string,
  ): Promise<Result<BulkSendResult, ContactFailure>> {
    const unique = [...new Set(ids)].slice(0, BULK_SEND_MAX)
    if (ids.length > BULK_SEND_MAX) {
      this.logger.warn(`sendEmailBulk capped: ${ids.length} requested, ${BULK_SEND_MAX} max`)
    }
    if (unique.length === 0) return success({ sent: [], skipped: [] })

    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const sent: BulkSendResult['sent'] = []
    const skipped: BulkSendResult['skipped'] = []

    // UN SEUL SELECT pour toute la sélection (bornée à BULK_SEND_MAX = 50) au
    // lieu d'un `findOne` par identifiant : le compte de requêtes suivait N,
    // il est maintenant fixe — cliquet `contacts.service.query-ratchet.spec.ts`
    // (GA-313). L'envoi lui-même (`deliverDraft`, ci-dessous) reste
    // SÉQUENTIEL par contact : paralléliser des envois vers un tiers
    // risquerait son quota, et le dépôt refuse de toute façon qu'un système
    // accélère un geste qui reste humain, un par un.
    const found = await this.contacts.find({ where: await this.contactGestureTarget(unique, userId) })
    const byId = new Map(found.map(contact => [contact.id, contact]))

    for (const id of unique) {
      const contact = byId.get(id)
      if (!contact) {
        skipped.push({ contact_id: id, reason: 'not_found' })
        continue
      }
      const result = await this.deliverDraft(contact, userId, workspaceId, replyToEmail)
      if (isSuccess(result)) {
        sent.push({ contact_id: id, sent_to: result.output.sent_to })
      } else {
        skipped.push({ contact_id: id, reason: result.problem.code })
      }
    }

    return success({ sent, skipped })
  }

  /**
   * Résolution PARTAGÉE entre l'envoi réel (`deliverDraft`) et la préparation
   * MCP (`prepareEmail`, #2375.10) : mêmes gardes, MÊME ORDRE — `no_email` →
   * `no_draft` → `already_sent` → `suppressed` — sur la MÊME source (le
   * brouillon relu à l'écran s'il est fourni, sinon `contact.email_message`
   * écrit par l'analyse). Ownership déjà vérifiée par l'appelant (contact
   * chargé avec `user_id = userId`). Ne fait AUCUNE écriture, AUCUN envoi —
   * GA-26 : une seule résolution, pas une par appelant.
   */
  private async resolveSendableDraft(
    contact: ContactEntity,
    workspaceId: string | null,
    reviewedDraft?: ReviewedDraft,
  ): Promise<Result<{ to: string; subject: string; body: string; reviewedBody?: string }, ContactFailure>> {
    const to = contactCoordinates(contact).has_email ? contact.email?.trim() : undefined
    if (!to) {
      return failure({ code: 'no_email', message: "Ce contact n'a pas d'adresse email." })
    }

    const reviewedBody = reviewedDraft?.body?.trim()
    const draft = reviewedBody ? { subject: reviewedDraft?.subject, body: reviewedBody } : contact.email_message
    const body = draft?.body?.trim()
    if (!body) {
      return failure({ code: 'no_draft', message: 'Aucun email préparé à envoyer pour ce contact.' })
    }

    if (contact.email_sent_at) {
      return failure({ code: 'already_sent', message: 'Un email a déjà été envoyé à ce contact.' })
    }

    if (workspaceId && (await this.suppression.isSuppressed(workspaceId, to))) {
      return failure({ code: 'suppressed', message: 'Ce contact s’est désabonné et ne peut pas être recontacté.' })
    }

    const subject = draft?.subject?.trim() || `Prise de contact — ${contact.full_name}`
    return success({ to, subject, body, reviewedBody })
  }

  /**
   * Core send used by both single + bulk. Assumes ownership is already checked
   * (contact loaded with `user_id = userId`). On success, sends via Resend with
   * a List-Unsubscribe footer/headers, stamps `email_sent_at`, and logs the
   * action. Les gardes elles-mêmes vivent dans `resolveSendableDraft`
   * (partagée avec `prepareEmail`, #2375.10) — ce qui reste ici est ce qui ne
   * l'est PAS : le transport réel et ses effets persistés.
   *
   * `reviewedDraft` (le texte relu à l'écran) prend le pas sur `email_message`
   * et n'est persisté QUE dans le `save` qui suit un envoi réussi — un envoi
   * refusé (déjà envoyé, désinscrit…) ou échoué laisse le brouillon stocké
   * intact, et un envoi réussi garantit `email_message` == ce qui est parti.
   */
  private async deliverDraft(
    contact: ContactEntity,
    userId: string,
    workspaceId: string | null,
    replyToEmail?: string,
    reviewedDraft?: ReviewedDraft,
    channel: ContactSendChannel = 'workspace',
    attachmentAssetIds: readonly string[] = [],
    senderConnectionId?: string,
  ): Promise<Result<SendContactEmailResult, ContactFailure>> {
    const resolved = await this.resolveSendableDraft(contact, workspaceId, reviewedDraft)
    if (isFailure(resolved)) return resolved
    const { to, subject, body, reviewedBody } = resolved.output
    // « Démo : n'envoie rien » — une salle de démonstration montre le dialogue,
    // jamais un message réel vers un tiers (et jamais une preuve d'envoi inventée).
    if (await this.isDemoWorkspace(userId)) {
      return failure({
        code: 'demo_send_blocked',
        message: "En démonstration, aucun message ne part : rien n'a été envoyé.",
      })
    }
    // #3699.5 — une tentative en cours ou incertaine se règle AVANT toute réexpédition.
    const sendState = effectiveContactSendState(contact)
    if (sendState === 'claimed') {
      return failure({ code: 'send_in_progress', message: 'Un envoi est déjà en cours pour ce contact.' })
    }
    if (sendState === 'uncertain') {
      return failure({
        code: 'send_uncertain',
        message:
          "La dernière tentative d'envoi est incertaine : vérifie ta boîte d'envoi avant de renvoyer, pour ne pas écrire deux fois à cette personne.",
      })
    }
    const replyTo = replyToEmail?.includes('@') ? replyToEmail : undefined
    const unsubscribeUrl = workspaceId ? this.buildUnsubscribeUrl(workspaceId, to) : undefined
    /*
     * L'expéditeur de l'ESPACE — marque blanche, 01/09/2026.
     *
     * ⚠️ C'est l'e-mail qui part vers un PROSPECT du client. Il portait notre
     * domaine dans son en-tête `From`, c'est-à-dire à l'endroit le plus visible
     * qui soit : la ligne d'expéditeur dans la boîte de réception.
     *
     * `null` quand l'espace n'a rien déclaré, et le mailer retombe alors sur
     * l'adresse d'environnement — choix de DÉLIVRABILITÉ : une adresse dont le
     * domaine n'est pas authentifié (SPF, DKIM) part en indésirable.
     */
    const from = workspaceId ? await this.brands.getSendingAddress(workspaceId) : null

    // #3699.4 — le canal DEMANDÉ est le canal UTILISÉ : une boîte connectée
    // demandée mais indisponible refuse net, elle ne bascule jamais en silence
    // sur l'adresse de l'espace. « Expéditeur affiché = expéditeur utilisé ».
    let sentFrom: string | null
    if (channel === 'mailbox') {
      // #4546.5 — la boîte désignée se lit parmi SES boîtes : une boîte absente de la liste n'est pas la sienne.
      const mailbox = senderConnectionId
        ? await this.mailboxSender?.status(userId, senderConnectionId)
        : await this.mailboxSender?.status(userId)
      if (!mailbox?.can_send) {
        return failure({
          code: 'mailbox_unavailable',
          message: mailbox?.connected
            ? "Ta messagerie connectée n'a pas le droit d'envoyer pour l'instant. Reconnecte-la, ou choisis explicitement l'envoi depuis l'adresse de l'espace."
            : senderConnectionId
              ? "Cette boîte n'est pas l'une des tiennes : rien n'est parti. Choisis une de tes boîtes connectées."
              : "Aucune messagerie n'est connectée. Connecte-la, ou choisis explicitement l'envoi depuis l'adresse de l'espace.",
        })
      }
      sentFrom = mailbox.address
    } else {
      sentFrom = this.mailer.resolveSenderAddress(from)
    }

    // #3699.6 — les pièces choisies sont RELUES et VÉRIFIÉES avant toute
    // réservation : une pièce qui ne passe pas refuse l'envoi entier (rien ne
    // part, rien n'est réservé) — jamais un e-mail sans la pièce vue cochée.
    let attachments: ResolvedEmailAttachment[] = []
    if (attachmentAssetIds.length > 0) {
      if (!this.emailAttachments || !workspaceId) {
        return failure({
          code: 'attachment_refused',
          message: "Les pièces jointes ne sont pas disponibles ici : rien n'est parti.",
        })
      }
      const picked = await this.emailAttachments.resolveForSend(workspaceId, contact.id, attachmentAssetIds)
      if (isFailure(picked)) return failure({ code: 'attachment_refused', message: picked.problem.message })
      attachments = picked.output
    }
    const outgoing = attachments.map(({ fileName, contentType, contentBase64 }) => ({
      fileName,
      contentType,
      contentBase64,
    }))
    const attachmentProof: SentAttachmentProof[] = attachments.map(attachment => ({
      name: attachment.fileName,
      byte_size: attachment.byteSize,
      sha256: attachment.sha256,
    }))

    // #3699.3/.5 — la tentative est RÉSERVÉE avant d'appeler le transport : un
    // double clic ou une reprise concurrente ne passe pas deux fois (une seule
    // des deux mises à jour touche une ligne).
    const attemptedAt = new Date()
    const claim = {
      email_send_state: 'claimed',
      email_send_channel: channel,
      email_send_from: sentFrom,
      email_send_attempted_at: attemptedAt,
      // #3699.6 — la preuve des pièces TENTÉES, posée avec la réservation : une
      // tentative incertaine dit aussi ce qu'elle emportait.
      email_send_attachments: attachmentProof.length ? attachmentProof : null,
    }
    const fresh = await this.contacts.update(
      { id: contact.id, email_sent_at: IsNull(), email_send_state: IsNull() },
      claim,
    )
    const retry = fresh?.affected
      ? fresh
      : await this.contacts.update({ id: contact.id, email_sent_at: IsNull(), email_send_state: 'failed' }, claim)
    if (!retry?.affected) {
      return failure({ code: 'send_in_progress', message: 'Un envoi est déjà en cours pour ce contact.' })
    }

    let providerId: string | undefined
    try {
      if (channel === 'mailbox') {
        await this.mailboxSender?.send(userId, {
          to,
          subject,
          body,
          ...(outgoing.length ? { attachments: outgoing } : {}),
          ...(senderConnectionId ? { senderConnectionId } : {}),
        })
      } else {
        const sent = await this.mailer.sendOutreachEmail({
          to,
          subject,
          body,
          replyTo,
          unsubscribeUrl,
          from,
          ...(outgoing.length ? { attachments: outgoing } : {}),
        })
        providerId = sent.providerId
      }
    } catch (cause) {
      const outcome = classifyTransportFailure(cause)
      this.logger.error('sendEmail transport error', { error: cause, tags: { contactId: contact.id, outcome } })
      await this.contacts.update({ id: contact.id }, { email_send_state: outcome })
      if (outcome === 'uncertain') {
        return failure({
          code: 'send_uncertain',
          message:
            "L'envoi n'a pas répondu : le message est peut-être parti. Vérifie ta boîte d'envoi avant de renvoyer.",
        })
      }
      return failure({ code: 'send_failed', message: "L'envoi de l'email a échoué. Réessayez plus tard." })
    }

    const sentAt = new Date()
    contact.email_sent_at = sentAt
    // #2733 — la seule clé qui reliera un futur rebond Resend (webhook
    // `email.bounced`) à CE contact précis. `undefined` sur Mailpit (dev) :
    // rien à suivre, la colonne reste NULL, exactement comme avant ce lot.
    contact.email_provider_message_id = providerId ?? null
    contact.email_send_state = 'handed_off'
    contact.email_send_channel = channel
    contact.email_send_from = sentFrom
    contact.email_send_attachments = attachmentProof.length ? attachmentProof : null
    // Le contact doit refléter ce qui est RÉELLEMENT parti : quand l'envoi part
    // du brouillon relu à l'écran, on le persiste dans le même write que le
    // timestamp (pas de fenêtre où `email_message` ≠ email envoyé).
    if (reviewedBody) contact.email_message = { subject, body }
    await this.contacts.save(contact)
    await this.recordEmailSent(contact, userId, workspaceId, subject, {
      channel,
      from: sentFrom,
      providerId,
      attachments: attachmentProof,
    })

    // Moteur de cadence multi-touch (Drive #8) : le premier email « ouvre » la
    // séquence — on programme les relances datées (J+3/J+6/J+9). Best-effort :
    // l'email est déjà parti, un échec de planification ne doit pas le faire
    // échouer (le contact reste re-planifiable, la programmation est idempotente).
    try {
      await this.cadence.scheduleForContact(contact, userId)
    } catch (cause) {
      this.logger.warn('sendEmail cadence scheduling failed (email already sent)', {
        error: cause instanceof Error ? cause.message : String(cause),
        tags: { contactId: contact.id },
      })
    }

    // #2396.3 — l'envoi VÉRIFIÉ complète les actions ouvertes qui visaient ce
    // contact. Best-effort : l'email est déjà parti, cette écriture ne doit
    // jamais le faire échouer.
    try {
      await this.cadence.completeOpenItemsByProof(contact.id)
    } catch (cause) {
      this.logger.warn('sendEmail proof-completion failed (email already sent)', {
        error: cause instanceof Error ? cause.message : String(cause),
        tags: { contactId: contact.id },
      })
    }

    return success({
      contact_id: contact.id,
      sent_to: to,
      email_sent_at: sentAt.toISOString(),
      channel,
      sent_from: sentFrom,
      state: 'handed_off',
      attachments: attachmentProof,
    })
  }

  /**
   * #2733 (SKAIZen Group, 22/09/2026) — appelée par `ResendWebhookController`
   * quand Resend confirme un rebond (`email.bounced`). `email_sent_at` n'est
   * JAMAIS effacé (on archive, on ne supprime pas) — c'est `email_bounced_at`
   * qui devient la vérité de livraison, et c'est lui que les écrans doivent
   * lire avant d'afficher « envoyé ».
   *
   * Cherche par `email_provider_message_id`, la SEULE clé qui relie
   * l'événement webhook (qui ne connaît ni notre espace ni notre contact_id)
   * à un contact précis. Introuvable (identifiant inconnu, contact supprimé,
   * envoi antérieur à #2733) → `null`, sans lever : un webhook qui ne
   * correspond à rien n'est pas une erreur de NOTRE côté.
   */
  async applyEmailBounce(providerId: string, reason: string | null): Promise<{ contactId: string } | null> {
    const contact = await this.contacts.findOne({ where: { email_provider_message_id: providerId } })
    if (!contact) return null

    contact.email_bounced_at = new Date()
    contact.email_bounce_reason = reason
    await this.contacts.save(contact)
    await this.cadence.cancelPendingForBounce(contact.id)
    // #2378.3 — le webhook Resend est un signal de rebond plus FIABLE que la
    // classification d'un message entrant (`mailbox.service.ts::stopSequencesForContact`,
    // #2381.1) : il vient directement du fournisseur, pas d'une notification
    // qui peut ne jamais arriver en boîte. Avant ce lot, seul l'ancien moteur
    // `cadence` (ligne au-dessus) s'arrêtait sur rebond — les séquences
    // `outreach` vivantes continuaient de programmer des relances sur une
    // adresse morte tant qu'aucun message de bounce ne remontait en boîte.
    await this.autoStopOutreachSequences(contact.id, contact.user_id, 'hard_bounce')

    return { contactId: contact.id }
  }

  /**
   * #2381.1/.6 (LAU-FINAL-095) + #2378.3 — ARRÊTE (jamais une simple pause)
   * les séquences ACTIVES et EN PAUSE de ce contact, cause journalisée
   * (`outreach_transitions`, #2366.8, subject_kind='sequence' — pas un second
   * moteur, GA-26). Factorisée depuis `updateStatus` (réponse/RDV) pour que
   * `applyEmailBounce` (rebond webhook) applique EXACTEMENT le même geste,
   * sans dupliquer une troisième fois le CTE.
   *
   * Best-effort : un échec ici ne doit jamais faire échouer l'appelant (statut
   * déjà persisté, ou rebond déjà posé sur le contact). Raw SQL + CTE
   * volontaire — évite un import circulaire contacts ↔ outreach ; le scope
   * (contact_id + user_id) reste strict. Le CTE capture l'état PRÉCÉDENT et
   * arrête en une seule requête : un simple UPDATE avec clause de retour ne
   * rend jamais l'ancien état, seulement le nouveau.
   */
  private async autoStopOutreachSequences(
    contactId: string,
    userId: string,
    event: OutreachSequenceStopEvent,
  ): Promise<void> {
    try {
      const stopped = await this.contacts.query<{ id: string; workspace_id: string | null; previous_status: string }[]>(
        `WITH previous AS (
           SELECT id, workspace_id, status FROM outreach_sequences
            WHERE contact_id = $1 AND user_id = $2 AND status IN ('active', 'paused')
         ), updated AS (
           UPDATE outreach_sequences s SET status = 'cancelled'
             FROM previous WHERE s.id = previous.id
         )
         SELECT id, workspace_id, status AS previous_status FROM previous`,
        [contactId, userId],
      )
      if (stopped.length > 0) {
        const ids = stopped.map(row => row.id)
        await this.contacts.query(
          `UPDATE outreach_sequence_steps SET status = 'skipped'
            WHERE sequence_id = ANY($1::uuid[]) AND status = 'pending'`,
          [ids],
        )
        for (const row of stopped) {
          await this.contacts.query(
            `INSERT INTO outreach_transitions
               (workspace_id, user_id, subject_kind, subject_id, from_state, to_state, actor, actor_kind, cause, result)
             VALUES ($1, $2, 'sequence', $3, $4, 'cancelled', $2, 'system', $5, 'applied')`,
            [row.workspace_id, userId, row.id, row.previous_status, event],
          )
        }
      }
    } catch (cause) {
      this.logger.warn('auto-stop outreach sequences failed', { error: cause, contactId })
    }
  }

  /**
   * Moteur de cadence multi-touch (Drive #8) — le calendrier de relance d'un
   * contact (J+1 initial → J+3 relance → J+6 preuve sociale → J+9 close-loop) +
   * la prochaine action. Ownership : le contact est résolu dans le workspace du
   * caller (comme `findOne`) avant de construire la cadence.
   */
  async getCadence(
    id: string,
    userId: string,
    /** Le périmètre (BU) de l'appelant, RÉSOLU PAR LE CONTRÔLEUR. `null` = tout
     *  l'espace : c'est le défaut historique, et le chemin des appelants
     *  internes (pipeline d'analyse, tableau de bord) reste byte-identique. */
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<Result<ContactCadence, ContactFailure>> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const contact = await this.contacts.findOne({
      where: {
        id,
        deleted_at: IsNull(),
        ...workspaceScopeWhere(workspaceId),
        // Le périmètre du COMPTE de ce contact — revue sécurité 15/09/2026.
        ...this.contactBusinessUnitWhere(businessUnitScope),
      },
    })
    if (!contact) {
      return failure({ code: 'not_found', message: `Contact ${id} introuvable` })
    }
    return success(await this.cadence.buildCadence(contact))
  }

  /**
   * « Puis-je envoyer un email à ce contact, maintenant ? » — répondu AVANT que
   * le commercial ne rédige, pour ne pas lui faire peaufiner un brouillon
   * destiné à quelqu'un qui ne peut pas le recevoir.
   *
   * Mêmes gardes, même ordre que `deliverDraft` (pas d'email → déjà envoyé →
   * désinscrit) : cet endpoint ne fait que *prédire* ce que l'envoi ferait, il
   * n'autorise rien. `deliverDraft` reste seul juge au moment de l'envoi.
   *
   * Divulgation minimale : un contact par appel, résolu dans le workspace de
   * l'appelant, et la réponse ne contient PAS l'email (le client l'a déjà).
   */
  async getSendability(
    id: string,
    userId: string,
    /** Le périmètre (BU) de l'appelant, RÉSOLU PAR LE CONTRÔLEUR. `null` = tout
     *  l'espace : c'est le défaut historique, et le chemin des appelants
     *  internes (pipeline d'analyse, tableau de bord) reste byte-identique. */
    businessUnitScope: BusinessUnitScopeClause = null,
    /** L'e-mail du commercial : l'adresse de réponse que `sendEmail` posera. */
    replyToEmail?: string,
  ): Promise<Result<ContactSendability, ContactFailure>> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const contact = await this.contacts.findOne({
      where: {
        id,
        deleted_at: IsNull(),
        ...workspaceScopeWhere(workspaceId),
        // Le périmètre du COMPTE de ce contact — revue sécurité 15/09/2026.
        ...this.contactBusinessUnitWhere(businessUnitScope),
      },
    })
    if (!contact) {
      return failure({ code: 'not_found', message: `Contact ${id} introuvable` })
    }

    const to = contactCoordinates(contact).has_email ? contact.email?.trim() : undefined
    if (!to) return success({ contact_id: contact.id, can_send: false, reason: 'no_email' })
    // #3699.5 — la dernière tentative, dite telle qu'on la sait. Une tentative
    // en cours ou incertaine BLOQUE le renvoi (vérifier avant de proposer de
    // renvoyer) ; un échec franc le laisse ouvert.
    const sendState = effectiveContactSendState(contact)
    const lastSend = sendState
      ? {
          state: sendState,
          channel: isSendChannel(contact.email_send_channel) ? contact.email_send_channel : null,
          from: contact.email_send_from ?? null,
          at: contact.email_send_attempted_at ? new Date(contact.email_send_attempted_at).toISOString() : null,
          ...(contact.email_send_attachments?.length ? { attachments: contact.email_send_attachments } : {}),
          // #4179.2 — dit seulement si la boîte l'a MONTRÉ.
          ...(contact.email_sent_observed_at
            ? { observed_at: new Date(contact.email_sent_observed_at).toISOString() }
            : {}),
        }
      : null
    if (contact.email_sent_at) {
      // Le compte rendu d'un envoi plus ancien relit d'ici le canal et l'expéditeur réels.
      return success({
        contact_id: contact.id,
        can_send: false,
        reason: 'already_sent',
        ...(lastSend ? { last_send: lastSend } : {}),
      })
    }
    if (workspaceId && (await this.suppression.isSuppressed(workspaceId, to))) {
      return success({ contact_id: contact.id, can_send: false, reason: 'suppressed' })
    }
    if (sendState === 'claimed' || sendState === 'uncertain') {
      return success({
        contact_id: contact.id,
        can_send: false,
        reason: sendState === 'claimed' ? 'send_in_progress' : 'send_uncertain',
        last_send: lastSend,
      })
    }
    // #3699.1 — l'expéditeur montré est résolu par la MÊME chaîne que l'envoi
    // (`deliverDraft` : adresse de l'espace → mailer → environnement).
    const ownFrom = workspaceId ? await this.brands.getSendingAddress(workspaceId) : null
    // #3699.4 — la boîte connectée, dite telle quelle (connectée, adresse, droit
    // d'envoi). Lecture seule : ne bloque pas la lecture, ne choisit pas à la place de la personne.
    const mailbox = this.mailboxSender ? await this.mailboxSender.status(userId) : undefined
    return success({
      contact_id: contact.id,
      can_send: true,
      reason: null,
      sender: this.mailer.resolveSenderAddress(ownFrom),
      reply_to: replyToEmail?.includes('@') ? replyToEmail : null,
      ...(mailbox ? { mailbox } : {}),
      ...(lastSend ? { last_send: lastSend } : {}),
      // #3699.6 — les documents que la personne PEUT choisir de joindre ; rien n'est coché d'office.
      ...(this.emailAttachments && workspaceId
        ? { attachable_documents: await this.emailAttachments.attachableFor(workspaceId, contact.id) }
        : {}),
      ...((await this.isDemoWorkspace(userId)) ? { demo: true } : {}),
    })
  }

  /** Signed, non-expiring one-click unsubscribe URL for the outreach footer +
   *  List-Unsubscribe header. Returns undefined if the public URL isn't set. */
  private buildUnsubscribeUrl(workspaceId: string, email: string): string | undefined {
    const secret = this.config.get<string>('internalApiSecret') ?? ''
    const base = this.config.get<string>('apiPublicUrl')
    if (!secret || !base) return undefined
    const token = signUnsubscribeToken({ workspaceId, email }, secret)
    return `${base.replace(/\/$/, '')}/emails/unsubscribe?token=${encodeURIComponent(token)}`
  }

  // Logs the send in `user_actions` as a real (non-declarative) event so the
  // contact activity feed + weekly "messages_sent" stat reflect an actual send.
  // Best-effort: a logging failure must not fail an email that already left.
  private async recordEmailSent(
    contact: ContactEntity,
    userId: string,
    workspaceId: string | null,
    subject: string,
    sent: {
      channel: ContactSendChannel
      from: string | null
      providerId?: string
      attachments?: readonly SentAttachmentProof[]
    },
  ): Promise<void> {
    try {
      await this.userActions.save(
        this.userActions.create({
          user_id: userId,
          workspace_id: workspaceId,
          account_id: contact.account_id,
          contact_id: contact.id,
          action_type: 'message_sent',
          channel: 'email',
          // #3699.5 — la trace dit d'où, par où, et donne de quoi RETROUVER le
          // message (l'identifiant du transport ; pour la boîte connectée, il vit
          // dans ses Éléments envoyés). « Pris en charge », jamais « livré ».
          metadata: {
            label: 'Email envoyé',
            subject,
            via: sent.channel === 'mailbox' ? 'mailbox' : 'bellum',
            channel: sent.channel,
            from: sent.from,
            ...(sent.providerId ? { provider_message_id: sent.providerId } : {}),
            // #3699.6 — les pièces parties : nom, taille, empreinte. Jamais le contenu.
            ...(sent.attachments?.length ? { attachments: sent.attachments } : {}),
          },
        }),
      )
    } catch (cause) {
      this.logger.error('sendEmail action-log error', { error: cause, tags: { contactId: contact.id } })
    }
    // Also emit the product event (the user_actions row above is the CRM feed;
    // this is the analytics stream). Best-effort, outside the try so a feed-log
    // failure doesn't skip it.
    void this.analytics?.track('message_sent', {
      userId,
      workspaceId,
      properties: { channel: 'email', contactId: contact.id, accountId: contact.account_id ?? null },
    })
  }

  /**
   * Bulk-insert contact seeds (Phase 1 Pappers dirigeants, Phase 2 Claude
   * findings…). Idempotent against the account, and MERGE-aware.
   *
   * Two behaviours changed here, both of which the user could see:
   *
   * 1. Identity used to be `full_name.trim().toLowerCase()`, which is blind to
   *    accents — "Sébastien Chauffray" (web search) and "Sebastien Chauffray"
   *    (Apollo) were two rows on the same account. It now goes through
   *    {@link contactIdentityKeys}: accent/punctuation-insensitive name, name
   *    with tokens sorted (Pappers emits "NOM Prénom"), LinkedIn URL and email.
   *
   * 2. A seed matching an existing contact used to be DROPPED whole, so the
   *    first source to land owned `title` / `linkedin_url` / `raw_data`
   *    forever. Since Pappers runs before Apollo, contacts kept their legal
   *    registry role and lost Apollo's operational title, profile URL, photo
   *    and apolloId. Matching seeds now enrich the stored row (never downgrade).
   *
   * Returns the newly-created rows; merges are applied in place.
   */
  /**
   * #4421.16 (décision Louis 25/10) — la personne que Laura a trouvée HORS de l'espace, révélée au clic, devient
   * un contact du compte par la MÊME porte que la collecte ({@link bulkInsert}) : retrouvée avant d'être insérée
   * (référence de la source, nom normalisé — #4479, jamais deux lignes pour une personne), refusée si elle a été
   * effacée (RGPD). Rend la ligne, créée ou retrouvée, que l'enrichissement existant prend ensuite.
   */
  async ensureOutsidePerson(
    accountId: string,
    userId: string,
    person: { fullName: string; title?: string; linkedinUrl?: string; apolloId: string },
  ): Promise<Result<ContactEntity, ContactFailure>> {
    await this.bulkInsert(accountId, userId, [
      {
        fullName: person.fullName,
        title: person.title ?? '',
        linkedinUrl: person.linkedinUrl ?? '',
        city: '',
        country: '',
        source: 'apollo',
        apolloId: person.apolloId,
      },
    ])
    const rows = await this.contacts.find({ where: { account_id: accountId, deleted_at: IsNull() } })
    const row = rows.find(r => storedApolloId(r) === person.apolloId)
    // Absente après la porte : la collecte l'a écartée (personne effacée). Rien n'est créé, rien ne sera enrichi.
    return row ? success(row) : failure({ code: 'suppressed', message: ERASED_PERSON_MESSAGE })
  }

  /**
   * #4616 — ce que `bulkInsert` lit HORS de la fiche : l'espace actif du lanceur et les empreintes effacées
   * de cet espace. Un appelant qui ouvre une transaction l'appelle AVANT (comme `saveResearch` résout déjà
   * l'espace avant la sienne) : lues dedans, ces deux lectures prenaient une deuxième connexion du pool
   * pendant que la transaction tenait la première — l'attente circulaire qui saturait le pool.
   */
  async prepareBulkInsert(userId: string): Promise<BulkInsertContext> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return { workspaceId, erased: await this.erasedFingerprints(workspaceId) }
  }

  async bulkInsert(
    accountId: string,
    userId: string,
    items: AnalysisContactSeed[],
    manager?: EntityManager,
    prepared?: BulkInsertContext,
  ): Promise<ContactEntity[]> {
    if (!items.length) return []
    const repo = manager ? manager.getRepository(ContactEntity) : this.contacts
    // Phase 2: stamp the run owner's active workspace so pipeline-seeded contacts
    // remain visible to the workspace-scoped reads. Resolution uses the
    // WorkspaceContext repos (outside any passed `manager` tx) — the workspace
    // row is long-committed, so reading it there is safe. `user_id` = created-by.
    // #4616 — sous transaction, l'appelant la passe déjà résolue (`prepareBulkInsert`).
    const { workspaceId } = prepared ?? (await this.workspaceContext.resolveActiveWorkspace(userId))
    // Full rows (not just `full_name`): merging needs the current title,
    // linkedin_url, email, photo_url and raw_data to decide what the seed adds.
    const existing = await repo.find({ where: { account_id: accountId } })

    // identity key → the row that owns it. Rows created in this batch are
    // registered too, so accent variants inside one payload also collapse.
    const byIdentity = new Map<string, ContactEntity>()
    const register = (row: ContactEntity): void => {
      for (const key of contactIdentityKeys({
        fullName: row.full_name,
        email: row.email,
        linkedinUrl: row.linkedin_url,
        // Stored Apollo id (raw_data.apolloId) — the key a re-run cites for a
        // contact whose last name the search tier obfuscated. Without it the
        // second run would re-create the row (its thin name publishes no key).
        apolloId: storedApolloId(row),
      })) {
        if (!byIdentity.has(key)) byIdentity.set(key, row)
      }
    }
    for (const row of existing) register(row)
    // #4479 — la clé de la BASE (`idx_contacts_account_normalized_name`), distincte des clés d'identité :
    // un prénom seul d'Apollo ne publie pas de clé de nom, mais la base le refuse quand même.
    const byName = new Map<string, ContactEntity>()
    for (const row of existing) {
      const key = normalizeFullName(row.full_name)
      if (key && !row.deleted_at && !byName.has(key)) byName.set(key, row)
    }

    // #2297 — une personne EFFACÉE (RGPD art. 17) ne revient pas par une
    // analyse : ni créée, ni fusionnée dans une fiche existante. Vérifié à
    // l'ENTRÉE, par empreinte — le registre la rend par son nom, le
    // fournisseur par son identifiant, et les deux se reconnaissent.
    const erased = prepared?.erased ?? (await this.erasedFingerprints(workspaceId))
    let refusedErased = 0

    const created: ContactEntity[] = []
    const updated = new Map<string, ContactEntity>()

    // #2297 — décision Louis 19/09/2026 (QCM, point 2) : le catalogue des champs
    // interdits (`ENRICHMENT_FORBIDDEN_FIELDS`) s'applique AUSSI à la collecte
    // d'une analyse. Retiré À L'ENTRÉE, à toute profondeur, avant création ou
    // fusion : ni `raw_data`, ni la fiche, ni un pliage dans une fiche existante
    // ne le voient. Le même filtre que l'enrichissement — UN seul endroit
    // (GA-26) ; le service IA l'applique déjà en sortie de phase 2 par son
    // miroir gardé (`enrichment_compliance.py`), celui-ci tient la base quoi
    // qu'on lui envoie.
    const seeds = items.map(item => withoutForbiddenEnrichmentFields(item))

    for (const seed of seeds) {
      const fullName = seed.fullName?.trim()
      if (!fullName) continue
      if (
        erased.size > 0 &&
        isErasedPerson(
          personErasureFingerprints(workspaceId, {
            fullName,
            linkedinUrl: seed.linkedinUrl,
            apolloId: seed.apolloId,
            accountId,
          }),
          erased,
        )
      ) {
        refusedErased += 1
        continue
      }
      // A seed whose whole name is one token ("Frederic", "Gerard") and that
      // carries no email, LinkedIn or Apollo id identifies nobody. Such rows exist
      // in production and cannot be repaired afterwards without guessing which
      // full name they belong to — so they are refused at the door rather than
      // stored and merged on a hunch later.
      const identity = { fullName, linkedinUrl: seed.linkedinUrl, apolloId: seed.apolloId }
      if (!isIdentifiablePerson(identity)) {
        this.logger.warn(`bulkInsert: seed ignoré, identité insuffisante ("${fullName}") sur ${accountId}`)
        continue
      }
      const keys = contactIdentityKeys(identity)
      if (!keys.length) continue

      const match = keys.map(k => byIdentity.get(k)).find((r): r is ContactEntity => r !== undefined)
      if (match) {
        if ((await this.mergeSeedInto(match, seed, manager)) && match.id) updated.set(match.id, match)
        // The seed may carry an identifier the stored row lacked (e.g. a LinkedIn
        // URL): index it so a later seed citing only that URL finds this row.
        for (const key of keys) if (!byIdentity.has(key)) byIdentity.set(key, match)
        continue
      }

      const source = normaliseSource(seed.source)
      // #4479 — le nom est déjà porté sur ce compte : on se RATTACHE (jamais de fusion, jamais de
      // seconde ligne, aucune valeur écrasée) et on garde la source du second apport.
      const nameKey = normalizeFullName(fullName)
      const holder = nameKey ? byName.get(nameKey) : undefined
      if (holder) {
        if (attachSecondSource(holder, source) && holder.id) updated.set(holder.id, holder)
        for (const key of keys) if (!byIdentity.has(key)) byIdentity.set(key, holder)
        continue
      }
      const row = repo.create({
        account_id: accountId,
        user_id: userId,
        workspace_id: workspaceId,
        full_name: fullName,
        title: seed.title ?? null,
        linkedin_url: seed.linkedinUrl ?? null,
        // Real Apollo photo, promoted to its own column so every avatar
        // (lists, organigramme, fiche) reads it without digging raw_data.
        photo_url: usablePhotoUrl(seed.photoUrl),
        source,
        // Persist the initial lifecycle state at detection (détecté /
        // identité vérifiée depending on the seed) — computed by the single
        // canonical function, never a duplicated rule.
        lifecycle_state: computeContactLifecycleState({
          fullName,
          title: seed.title ?? null,
          linkedinUrl: seed.linkedinUrl ?? null,
          source,
        }),
        raw_data: buildSeedRawData(seed),
        // R22 a4 — ce que la recherche gratuite annonce (e-mail / tél. existe, non livré).
        ...seedCoordinateAvailability(seed),
        // #3989.7 (Louis 15/10/2026) — la coordonnée PRO déjà trouvée dans un autre espace
        // est réutilisée ici : la donnée seule, aucun crédit débité.
        ...(seed.sharedCoordinates
          ? { email: seed.sharedCoordinates.email ?? null, phone: seed.sharedCoordinates.phone ?? null }
          : {}),
      })
      created.push(row)
      for (const key of keys) byIdentity.set(key, row)
    }

    if (refusedErased > 0) {
      // Un nombre, jamais un nom : la trace ne dit rien de qui a été écarté.
      this.logger.log(`bulkInsert: ${refusedErased} personne(s) effacée(s) écartée(s) de la collecte sur ${accountId}`)
    }
    if (updated.size) {
      this.logger.log(`bulkInsert: ${created.length} créé(s), ${updated.size} fusionné(s) sur ${accountId}`)
      await repo.save([...updated.values()])
    }
    // #3942.5 — une création OU une fusion change les contacts de ce compte :
    // son chemin recommandé en cache ne vaut plus rien, même sans aucune
    // création (un run qui ne fait QUE fusionner reste une écriture en masse).
    if (created.length > 0 || updated.size > 0) this.invalidateRecommendedPath(workspaceId, accountId)
    if (!created.length) return []

    // Le repli ligne par ligne doit s'exécuter sous POINT DE REPRISE, et c'est
    // tout le sujet. Postgres avorte la transaction ENTIÈRE dès qu'un ordre
    // échoue : sans point de reprise, la première violation d'unicité empoisonne
    // la transaction et chaque tentative suivante répond « current transaction is
    // aborted ». Le repli existait déjà — il ne pouvait simplement jamais
    // aboutir, et un dossier complet mourait à l'enregistrement des contacts
    // (RATP, run réel du 10/08/2026 : 1 079 contacts, analyse perdue).
    //
    // Pourquoi la collision arrive alors qu'on dédoublonne déjà : l'index unique
    // porte sur le nom NORMALISÉ, tandis que la déduplication applicative refuse
    // délibérément de fusionner deux prénoms seuls (« Willy », « Séverine » —
    // Apollo masque le nom de famille en offre de recherche). Les deux ont
    // raison : on ne veut pas fusionner deux personnes distinctes, et on ne veut
    // pas non plus deux lignes identiques. Le perdant est donc ÉCARTÉ, pas
    // fusionné — et il est journalisé, parce qu'une ligne qui disparaît en
    // silence se lit plus tard comme « le run n'a rien trouvé ».
    const saved = await this.insertToleratingDuplicates(repo, created, accountId, manager)
    // Journal the detection passage (null → initial state) for each new contact.
    await this.journalInitialTransitions(saved, manager)
    return saved
  }

  /**
   * Insère un lot en tolérant les doublons, chaque tentative isolée par un POINT
   * DE REPRISE.
   *
   * Sans cette isolation, le premier conflit avorte la transaction et tout ce qui
   * suit échoue — y compris le repli censé rattraper le conflit. TypeORM ouvre un
   * `SAVEPOINT` quand on imbrique une transaction dans une transaction ouverte,
   * ce qui donne exactement la portée voulue : le retour arrière ne défait que
   * la ligne fautive.
   *
   * Hors transaction (appel direct), chaque `save` est déjà autonome : on garde
   * le même chemin, il n'y a simplement rien à isoler.
   */
  private async insertToleratingDuplicates(
    repo: Repository<ContactEntity>,
    rows: ContactEntity[],
    accountId: string,
    manager?: EntityManager,
  ): Promise<ContactEntity[]> {
    const attempt = async <T>(run: (m: EntityManager | undefined) => Promise<T>): Promise<T> =>
      manager ? manager.transaction(inner => run(inner)) : run(undefined)

    try {
      // Chemin nominal : un seul ordre pour tout le lot.
      return await attempt(async inner => (inner ? inner.getRepository(ContactEntity).save(rows) : repo.save(rows)))
    } catch (cause) {
      if (!isUniqueViolation(cause)) throw cause
    }

    this.logger.warn(`bulkInsert: conflit d'unicité sur ${accountId} — insertion ligne par ligne`)
    const saved: ContactEntity[] = []
    let skipped = 0
    for (const row of rows) {
      try {
        saved.push(
          await attempt(async inner => (inner ? inner.getRepository(ContactEntity).save(row) : repo.save(row))),
        )
      } catch (rowCause) {
        if (!isUniqueViolation(rowCause)) throw rowCause
        skipped += 1
      }
    }
    if (skipped > 0) {
      // Dire COMBIEN et sur quel compte : c'est la seule trace de ce que le
      // dossier ne contient pas.
      this.logger.warn(`bulkInsert: ${skipped} contact(s) écarté(s) pour doublon de nom sur ${accountId}`)
    }
    return saved
  }

  /**
   * Fold a seed into an existing contact. Only ever ADDS information: a blank or
   * placeholder incoming value never clears a stored one, and between two real
   * values the more specific wins (see {@link pickRicher}).
   *
   * Returns whether anything actually changed, so an inert seed does not
   * generate a pointless UPDATE.
   *
   * ⚠️ Ce qui manquait : l'ARBITRE DE PROVENANCE. La phase 3 le consultait, pas
   * la phase 2 — qui écrivait `row[champ] = pickRicher(…)` puis sauvait la
   * ligne. Or `pickRicher` préfère la valeur la plus LONGUE, sans rien savoir de
   * qui a écrit l'autre : un poste corrigé à la main en « DSI » perdait contre
   * n'importe quel intitulé fournisseur plus bavard, à chaque run, sans un mot.
   * La doctrine est pourtant sans réserve — « une correction humaine gagne
   * toujours, quelle que soit sa date ; toute écriture de champ passe par
   * `applyFieldUpdates` ».
   *
   * L'ordre est donc : PROPOSER (pickRicher, qui décide ce qui est le plus
   * riche), puis ARBITRER (qui décide si on a le droit de l'écrire). La lecture
   * de provenance n'a lieu que si quelque chose bougerait vraiment — sur un
   * relancement où rien ne change, l'arbitrage ne coûte pas une requête.
   */
  private async mergeSeedInto(
    row: ContactEntity,
    seed: AnalysisContactSeed,
    manager?: EntityManager,
  ): Promise<boolean> {
    let changed = false

    // Ce que le lot PROPOSE, en noms de champ d'API. Rien n'est encore écrit.
    // `?? null` on the incumbent: an unset column reads as `undefined` on a
    // freshly-selected row, and normalising undefined → null is not a change
    // worth an UPDATE round-trip.
    const proposed: Record<string, unknown> = {}
    const propose = (
      field: 'fullName' | 'title' | 'linkedinUrl' | 'email' | 'phone',
      column: keyof ContactEntity,
      next: unknown,
    ): void => {
      if (next === (row[column] ?? null)) return
      proposed[field] = next
    }

    // The name itself is merge-able. It used to be frozen at whatever the FIRST
    // source stored, so a de-accented Apollo seed landing before the accented
    // one locked "Sebastien Chauffray" in place for good. `pickRicherName` only
    // ever swaps between two spellings of the SAME normalised name, so a match
    // made on email or LinkedIn can never relabel the contact as someone else.
    const betterName = pickRicherName(row.full_name, seed.fullName)
    if (betterName) propose('fullName', 'full_name', betterName)
    propose('title', 'title', pickRicher(row.title, seed.title))
    propose('linkedinUrl', 'linkedin_url', pickRicher(row.linkedin_url, seed.linkedinUrl))
    // #3989.7 — une coordonnée trouvée ailleurs COMPLÈTE une fiche qui n'en a pas ; elle ne
    // remplace jamais celle de l'espace, et passe par l'arbitre (une correction humaine gagne).
    if (!row.email && seed.sharedCoordinates?.email) propose('email', 'email', seed.sharedCoordinates.email)
    if (!row.phone && seed.sharedCoordinates?.phone) propose('phone', 'phone', seed.sharedCoordinates.phone)

    if (Object.keys(proposed).length > 0) {
      // Une ligne créée dans CE lot n'est pas encore en base : elle n'a ni id ni
      // provenance, donc rien à protéger.
      // #4616 — sur la connexion de la transaction de l'appelant, jamais une deuxième du pool.
      const currentSources =
        row.id && this.provenance ? await this.provenance.currentSources('contact', row.id, manager) : {}
      // #4268.d — une coordonnée vidée À LA MAIN dans l'espace reste vide : le commun ne la remet pas.
      for (const field of ['email', 'phone'] as const) {
        if (
          field in proposed &&
          proposed[field] === seed.sharedCoordinates?.[field] &&
          currentSources[field] === 'human'
        )
          delete proposed[field]
      }
      const { accepted, rejected } = applyFieldUpdates({
        incoming: proposed,
        incomingSource: 'pipeline',
        current: toFieldView(row as unknown as Record<string, unknown>, CONTACT_FIELD_COLUMNS),
        currentSources,
      })
      for (const [column, value] of Object.entries(toColumnPatch(accepted, CONTACT_FIELD_COLUMNS))) {
        ;(row as unknown as Record<string, unknown>)[column] = value
        changed = true
      }
      if (rejected.length > 0) {
        this.logger.log(`bulkInsert : ${rejected.length} champ(s) de contact préservés — corrigés à la main`, {
          contactId: row.id,
          fields: rejected.map(r => r.field),
        })
      }
    }

    // La photo n'est pas une colonne de FICHE : elle ne figure pas dans
    // `CONTACT_FIELD_COLUMNS` parce qu'aucun écran ne la fait saisir. Il n'y a
    // donc aucune correction humaine à lui opposer, et la régler par l'arbitre
    // demanderait de lui inventer une provenance.
    const photo = pickRicher(row.photo_url, usablePhotoUrl(seed.photoUrl))
    if (photo !== (row.photo_url ?? null)) {
      row.photo_url = photo
      changed = true
    }

    // raw_data is additive: Apollo's photo/city/country/apolloId/detail block
    // enriches whatever the earlier source stored without clobbering it.
    const incoming = buildSeedRawData(seed)
    if (incoming) {
      const merged = { ...(row.raw_data ?? {}) }
      let rawChanged = false
      for (const [key, value] of Object.entries(incoming)) {
        if (merged[key] === undefined || merged[key] === null) {
          merged[key] = value
          rawChanged = true
        }
      }
      if (rawChanged) {
        row.raw_data = merged
        changed = true
      }
    }

    // R22 a4 — la collecte plus récente annonce une coordonnée : on monte, on ne dégrade jamais.
    const availabilityPatch = mergeSeedAvailability(
      { email_availability: row.email_availability ?? null, phone_availability: row.phone_availability ?? null },
      seedCoordinateAvailability(seed),
    )
    if (Object.keys(availabilityPatch).length > 0) {
      Object.assign(row, availabilityPatch)
      changed = true
    }

    return changed
  }

  /**
   * "Ingestion liste perso" (Drive backlog #10) — deterministically clean +
   * classify a pasted/imported contact list into the family / decision-level
   * taxonomy, score each row 1-5, and flag (never drop) low-value rows. Pure and
   * free: no DB write, no LLM call. Ownership of ``accountId`` is enforced by the
   * caller (AccountsController) before this runs; the classified rows are returned
   * for the rep to review, then imported (selectively) via ``bulkImportManual``.
   */
  classifyImportedContacts(items: ClassifyContactInput[], sellerDomain?: OfferDomain | null): ClassifyContactsResponse {
    return classifyContacts(items, sellerDomain)
  }

  /**
   * Manual CSV import: insert user-supplied contact rows onto an account.
   * The caller (AccountsController) has already verified the account belongs
   * to ``userId`` — this method only persists. Idempotent against the account
   * — like ``bulkInsert``, through {@link contactIdentityKeys} — on the SAME
   * identity engine, not a second one: a row already known by its email, its
   * phone (#2380.45) or its LinkedIn URL is a duplicate even under a different
   * spelling of the name (or repeats within the batch). A plain name match
   * still catches everything it used to. Blank optional cells become NULL.
   * Source is tagged ``'manual'``. When the row carries a reviewed
   * classification (``family`` / ``priority`` / ``entity`` from the "liste
   * perso" preview) those are persisted too; otherwise they stay NULL.
   */
  async bulkImportManual(
    accountId: string,
    userId: string,
    items: BulkImportContact[],
  ): Promise<BulkImportContactsResponse> {
    const total = items.length
    // #2159.63 — "Voir les exceptions" a besoin de la raison RÉELLE de chaque
    // ligne écartée, jamais d'un statut redevinable après coup. Les deux seuls
    // branchements qui suivent sont les deux seules raisons possibles.
    const skippedDetails: BulkImportContactsResponse['skipped_details'] = []
    const cleaned = items
      .map(item => ({
        full_name: item.full_name.trim(),
        title: nullifyBlank(item.title),
        email: refusePlaceholderEmail(nullifyBlank(item.email)).email,
        phone: nullifyImplausiblePhone(item.phone),
        linkedin_url: nullifyBlank(item.linkedin_url),
        entity: nullifyBlank(item.entity),
        family: item.family ?? null,
        // Clamp to the 1-5 scale the classifier emits; anything else → NULL.
        priority: typeof item.priority === 'number' && item.priority >= 1 && item.priority <= 5 ? item.priority : null,
      }))
      .filter(item => {
        if (item.full_name.length > 0) return true
        skippedDetails.push({ full_name: item.full_name, reason: 'blank_name' })
        return false
      })
    if (cleaned.length === 0) return { created: 0, skipped: total, skipped_details: skippedDetails }

    // Phase 2: stamp the caller's active workspace on every new row so it stays
    // visible to the (now workspace-scoped) reads. `user_id` stays as created-by.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const existing = await this.contacts.find({
      where: { account_id: accountId, deleted_at: IsNull() },
      select: ['full_name', 'email', 'phone', 'linkedin_url'],
    })
    // identity key → seen. Rows created earlier in this batch register too, so
    // two rows of the SAME import that only share a phone or an email also
    // collapse — not only a repeated name.
    const knownKeys = new Set<string>()
    for (const row of existing) {
      for (const key of contactIdentityKeys({
        fullName: row.full_name,
        email: row.email,
        phone: row.phone,
        linkedinUrl: row.linkedin_url,
      })) {
        knownKeys.add(key)
      }
    }
    const rows = cleaned
      .filter(item => {
        const keys = contactIdentityKeys({
          fullName: item.full_name,
          email: item.email,
          phone: item.phone,
          linkedinUrl: item.linkedin_url,
        })
        if (keys.some(key => knownKeys.has(key))) {
          skippedDetails.push({ full_name: item.full_name, reason: 'duplicate' })
          return false
        }
        for (const key of keys) knownKeys.add(key)
        return true
      })
      .map(item =>
        this.contacts.create({
          account_id: accountId,
          user_id: userId,
          workspace_id: workspaceId,
          full_name: item.full_name,
          title: item.title,
          email: item.email,
          phone: item.phone,
          linkedin_url: item.linkedin_url,
          entity: item.entity,
          family: item.family,
          priority: item.priority,
          source: 'manual',
          // A manually-imported row may already carry coordinates (email/phone),
          // so it can land past "détecté" — persist the computed initial state.
          lifecycle_state: computeContactLifecycleState({
            fullName: item.full_name,
            title: item.title,
            entity: item.entity,
            email: item.email,
            phone: item.phone,
            linkedinUrl: item.linkedin_url,
            source: 'manual',
          }),
        }),
      )
    // #4479 — la clé du nom normalisé : un conflit écarte la ligne fautive, jamais le lot entier.
    const saved = await this.insertToleratingDuplicates(this.contacts, rows, accountId)
    await this.journalInitialTransitions(saved)
    // #3942.5 — un import qui crée au moins une fiche change le chemin
    // recommandé de ce compte.
    if (saved.length > 0) this.invalidateRecommendedPath(workspaceId, accountId)
    // #2309.19 — chaque ligne écartée pour doublon À L'IMPORT ne deviendra
    // JAMAIS une fiche : le seul endroit qui peut encore le dire.
    const duplicateSkips = skippedDetails.filter(detail => detail.reason === 'duplicate').length
    await this.recordIntakeExclusions(workspaceId, accountId, 'duplicate_identity', duplicateSkips)
    return { created: saved.length, skipped: total - saved.length, skipped_details: skippedDetails }
  }

  /**
   * #2553 / #3740 — un organigramme importé devient des CONTACTS du compte.
   *
   * Chaque personne NOUVELLE est créée (nom, fonction, entité), `source` =
   * « organigramme importé (AAAA) » et `employment_verified_at` = date du
   * DOCUMENT : la donnée dit son âge. Une personne qui correspond à un contact
   * existant s'y LIE — rien n'est écrasé (une correction humaine gagne) et rien
   * n'est fusionné. Idempotent : réimporter le même document ne crée rien.
   * L'appartenance du compte est vérifiée par l'appelant.
   */
  async importOrgChartPeople(
    accountId: string,
    userId: string,
    people: ReadonlyArray<{ fullName: string; title?: string; entityName?: string; linkedinUrl?: string }>,
    documentDate?: string,
  ): Promise<{
    created: number
    contacts: Array<{ fullName: string; contactId: string; status: 'created' | 'linked' }>
  }> {
    const existing = await this.contacts.find({
      where: { account_id: accountId, deleted_at: IsNull() },
      select: ['id', 'full_name', 'email', 'phone', 'linkedin_url'],
    })
    const plan = planOrgChartContacts(existing, people)
    const outcome: Array<{ fullName: string; contactId: string; status: 'created' | 'linked' }> = plan.linked.map(
      link => ({ fullName: link.fullName, contactId: link.contactId, status: 'linked' as const }),
    )
    // Résolu TÔT (pas seulement dans la branche `toCreate`) : la boucle
    // d'écriture inverse juste en dessous peut, elle aussi, changer des
    // contacts de ce compte sans créer aucune ligne.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    let wroteBack = false

    // #3740.3 — « écriture inverse » : le LinkedIn du fichier
    // complète un contact lié qui n'en a aucun. `planOrgChartContacts` ne porte
    // `linkedinUrl` sur l'entrée `linked` que si le contact n'en avait pas déjà
    // un (present-only) : jamais un champ déjà renseigné n'est écrasé ici.
    // GA-131 : la colonne de fiche passe par l'arbitre de provenance
    // (`arbitrateEnrichment`, source `pipeline`) — une valeur posée à la main
    // ou par un connecteur n'est jamais écrasée par un fichier.
    for (const link of plan.linked) {
      const contact = existing.find(c => c.id === link.contactId)
      if (!link.linkedinUrl || !contact) continue
      const updates: Record<string, unknown> = { linkedin_url: link.linkedinUrl }
      const { rejected } = await this.arbitrateEnrichment(contact, updates)
      if (rejected.length > 0) continue
      await this.contacts.update({ id: link.contactId }, updates)
      wroteBack = true
    }

    if (plan.toCreate.length === 0) {
      // #3942.5 — l'écriture inverse plus haut peut avoir changé un contact de
      // ce compte sans qu'aucune ligne ne soit créée.
      if (wroteBack) this.invalidateRecommendedPath(workspaceId, accountId)
      return { created: 0, contacts: outcome }
    }

    const source = orgChartSourceLabel(documentDate)
    const verifiedAt = documentDate && /^\d{4}-\d{2}-\d{2}$/.test(documentDate) ? new Date(documentDate) : null
    const rows = plan.toCreate.map(person =>
      this.contacts.create({
        account_id: accountId,
        user_id: userId,
        workspace_id: workspaceId,
        full_name: person.fullName.trim(),
        title: nullifyBlank(person.title),
        entity: nullifyBlank(person.entityName),
        source,
        employment_verified_at: verifiedAt,
        lifecycle_state: computeContactLifecycleState({
          fullName: person.fullName,
          title: nullifyBlank(person.title),
          entity: nullifyBlank(person.entityName),
          email: null,
          phone: null,
          linkedinUrl: null,
          source,
        }),
      }),
    )
    // #4479 — deux noms de l'organigramme qui se normalisent pareil : la 2e ligne est écartée, pas le lot.
    const saved = await this.insertToleratingDuplicates(this.contacts, rows, accountId)
    await this.journalInitialTransitions(saved)
    for (const row of saved) outcome.push({ fullName: row.full_name, contactId: row.id, status: 'created' })
    this.invalidateRecommendedPath(workspaceId, accountId)
    return { created: saved.length, contacts: outcome }
  }

  /**
   * #1995 — LA FICHE D'UNE PERSONNE QUE SEUL LE CRM CONNECTÉ CONNAÎT.
   *
   * Mesuré en production le 14/09/2026 : Sandrine Pata est citée par le CRM
   * connecté sur THALES, le compte porte 2 027 fiches Bellum et aucune
   * « Pata ». Laura annonçait « fiche Bellum absente » puis renvoyait vers une
   * fiche qui n'existe pas ; le rappel restait impossible, puisque
   * `schedule_reminder_for_contact` exige un `contact_id` d'une VRAIE ligne.
   *
   * Création UNITAIRE, et c'est le point : `bulkImportManual` juste au-dessus
   * importe une LISTE (dédoublonnage par nom seul, `source: 'manual'`, aucune
   * provenance par champ). Une personne lue dans le CRM n'est ni saisie à la
   * main ni importée en masse — elle vient d'un outil que le client tient à
   * jour, donc `source: 'crm'` sur la ligne et `connector` sur ses champs :
   * une correction humaine passera devant à tous les imports suivants.
   *
   * ⚠️ RIEN N'EST FUSIONNÉ. Le critère de doublon est celui de
   * `resolveCrmContactToBellum` — e-mail normalisé d'abord, puis nom plié
   * (casse ET accents) — pour que la création refuse exactement ce que la
   * lecture aurait su relier. Deux fiches qui répondent au même critère
   * rendent `ambiguous` : on le DIT, on ne choisit pas à la place de
   * quelqu'un (« on PROPOSE une fusion de doublons, on ne fusionne JAMAIS »).
   *
   * L'appartenance du compte est vérifiée par l'appelant
   * (`AccountsController.createContactFromCrm`, `findOneForWorkspace`) ; ici on
   * persiste, scopé `workspace_id` / `user_id` comme ses voisines.
   */
  async createFromCrmPresence(
    accountId: string,
    userId: string,
    input: CreateContactFromCrmInput,
    /**
     * #2861 (#2437.2, niveau ESPACE) — la langue du marché de l'espace,
     * RÉSOLUE PAR L'APPELANT (`AccountsController`, comme `businessUnitScope`
     * juste au-dessus). Sert de DÉFAUT au contact créé, jamais un défaut
     * deviné ici : absente (service optionnel manquant), `locale` reste
     * `null` — comportement byte-identique à avant ce lot.
     */
    defaultLocale?: MarketLocale,
  ): Promise<CreateContactFromCrmResult> {
    const fullName = input.full_name.trim()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const existing = await this.contacts.find({
      where: { account_id: accountId, deleted_at: IsNull() },
      select: ['id', 'full_name', 'email'],
    })

    const email = foldForEmailMatch(input.email)
    if (email) {
      const byEmail = existing.filter(c => foldForEmailMatch(c.email) === email)
      if (byEmail.length > 1) {
        await this.recordIntakeExclusions(workspaceId, accountId, 'ambiguous_identity', 1)
        return { status: 'ambiguous', matches: byEmail.length }
      }
      if (byEmail.length === 1) {
        await this.recordIntakeExclusions(workspaceId, accountId, 'duplicate_identity', 1)
        return { status: 'duplicate', contact_id: byEmail[0].id }
      }
    }
    const folded = foldForNameMatch(fullName)
    if (folded.length >= MIN_FOLDED_NAME_LENGTH) {
      const byName = existing.filter(c => foldForNameMatch((c.full_name ?? '').trim()) === folded)
      if (byName.length > 1) {
        await this.recordIntakeExclusions(workspaceId, accountId, 'ambiguous_identity', 1)
        return { status: 'ambiguous', matches: byName.length }
      }
      if (byName.length === 1) {
        await this.recordIntakeExclusions(workspaceId, accountId, 'duplicate_identity', 1)
        return { status: 'duplicate', contact_id: byName[0].id }
      }
    }

    const title = nullifyBlank(input.title)
    const contactEmail = refusePlaceholderEmail(nullifyBlank(input.email)).email
    const crmReference = nullifyBlank(input.crm_reference)
    // #4479 — `foldForNameMatch` (ci-dessus) n'est pas la clé de la base : un nom que SEULE la clé
    // `idx_contacts_account_normalized_name` reconnaît rend la fiche qui le porte, jamais un 500.
    const dbKey = normalizeFullName(fullName)
    const holder = dbKey ? existing.find(c => normalizeFullName(c.full_name) === dbKey) : undefined
    if (holder) {
      await this.recordIntakeExclusions(workspaceId, accountId, 'duplicate_identity', 1)
      return { status: 'duplicate', contact_id: holder.id }
    }
    const saved = await this.contacts.save(
      this.contacts.create({
        account_id: accountId,
        user_id: userId,
        workspace_id: workspaceId,
        full_name: fullName,
        title,
        email: contactEmail,
        // #2861 (#2437.2, niveau ESPACE) — sert de défaut, jamais posé sur une
        // fiche déjà là : cette écriture n'a lieu qu'à la CRÉATION.
        locale: defaultLocale ?? null,
        source: 'crm',
        // La TRACE de la ligne d'origine, jamais un identifiant Bellum : le CRM
        // externe n'en connaît pas. Absente quand le CRM n'en a pas donné —
        // « non mesuré » n'est pas une chaîne vide inventée.
        raw_data: crmReference ? { crm_reference: crmReference } : null,
        lifecycle_state: computeContactLifecycleState({
          fullName,
          title,
          entity: null,
          email: contactEmail,
          phone: null,
          linkedinUrl: null,
          source: 'crm',
        }),
      }),
    )
    await this.journalInitialTransitions([saved])
    // La provenance `connector` place ces valeurs SOUS `human` dans l'arbitre :
    // la première correction faite à la main survit à tout ce qui suit. Le
    // gabarit est celui de `CrmImportService` — un seul arbitre pour un seul
    // type d'origine.
    if (this.provenance) {
      const changes = [
        { field: 'full_name', oldValue: null, newValue: fullName },
        ...(title ? [{ field: 'title', oldValue: null, newValue: title }] : []),
        ...(contactEmail ? [{ field: 'email', oldValue: null, newValue: contactEmail }] : []),
      ]
      await this.provenance.commit({
        workspaceId,
        entityType: 'contact',
        entityId: saved.id,
        source: 'connector',
        actorId: userId,
        changes,
      })
    }
    return { status: 'created', contact_id: saved.id }
  }

  /**
   * Apply the Phase 3 classification (Claude role/priority + Apollo
   * email/phone) to existing contacts. Returns the number of rows actually
   * updated so the caller can log a hit-rate.
   *
   * Matched by Apollo person id first, by case-insensitive ``full_name``
   * otherwise. The id matters because phase 3 REVEALS identities: phase 2 stored
   * an Apollo search hit as "Severine" (the search tier masks the last name) and
   * the People-Match returns "Severine Mondy". On a name-only match that update
   * hits nothing — the paid-for email is discarded for precisely the top deciders
   * the credit was spent on. The name predicate stays as the fallback for rows
   * seeded before the id was persisted, and for every non-Apollo source.
   */
  async applyEnrichment(
    accountId: string,
    items: AnalysisEnrichedContact[],
    manager?: EntityManager,
    /** #3219 (#190.2) — le périmètre que CE run a DÉCLARÉ (`analysis_runs.scope_mode`) ; absent = aucune portée écrite. */
    scopeMode?: string | null,
  ): Promise<number> {
    const repo = manager ? manager.getRepository(ContactEntity) : this.contacts
    let matched = 0
    let skipped = 0
    // #3942.5 — pas de `userId` ici pour résoudre l'espace : repris sur la
    // première ligne RÉELLEMENT écrite (`target.workspace_id`), la même colonne
    // que partout ailleurs dans ce service.
    let enrichedWorkspaceId: string | null = null
    for (const c of items) {
      const fullName = c.fullName.trim()
      if (!fullName) continue
      const apolloId = (c.apolloId ?? '').trim()
      // Only persist fields Claude actually filled. Skipping null/empty/
      // "unknown" lets the column stay NULL in DB so the UI shows "—"
      // instead of a fake "unknown" badge — that was visible to the user
      // when Phase 3 partially classified a list of contacts and Pydantic
      // back-filled empty entries with defaults.
      const role = normaliseDecisionRole(c.role)
      const priority = typeof c.priority === 'number' && c.priority >= 1 && c.priority <= 5 ? c.priority : null

      /**
       * Ce que la phase 3 PROPOSE, en noms de champ d'API. Rien n'est encore
       * écrit : chaque valeur doit d'abord passer l'arbitre de provenance.
       *
       * C'est ici que se jouait un effacement silencieux : `email: c.email`
       * partait tel quel dans l'`UPDATE`, donc un fournisseur qui ne trouvait
       * rien (`null`) effaçait l'adresse qu'un commercial avait mis dix minutes
       * à trouver — sans message, sans trace, et sans que personne ne fasse le
       * lien avec le run de la nuit.
       */
      const proposed: Record<string, unknown> = {
        entity: c.entity || null,
        family: c.family || null,
        decisionRole: role,
        priority,
        profileSummary: c.summary || null,
        whyContact: c.whyContact || null,
        // #4599 — un gabarit (« prenom.nom@… ») n'entre jamais : refusé, le contact reste sans e-mail.
        email: refusePlaceholderEmail(c.email).email ?? '',
        phone: c.phone,
        careerLevers: c.careerLevers?.length ? c.careerLevers : null,
        implicitFears: c.implicitFears?.length ? c.implicitFears : null,
      }

      const nameParams = { accountId, fullName }
      const idParams = { accountId, apolloId }
      // Id first, name as the fallback — an account seeded before the id was
      // persisted must keep being enriched.
      let predicate = apolloId ? apolloMatchPredicate('c') : nameMatchPredicate('c')
      let params: Record<string, unknown> = apolloId ? idParams : nameParams
      let target = await repo.createQueryBuilder('c').where(predicate, params).getOne()
      let matchedById = Boolean(apolloId) && Boolean(target)
      if (!target && apolloId) {
        predicate = nameMatchPredicate('c')
        params = nameParams
        matchedById = false
        target = await repo.createQueryBuilder('c').where(predicate, params).getOne()
      }
      if (!target) continue

      /**
       * Le nom révélé est-il DÉJÀ porté par une autre ligne du compte ?
       *
       * Sur un match par id Apollo, la phase 3 réécrivait le nom masqué
       * (« Bruno ») avec le nom révélé (« Bruno Vaquette »). Quand ce nom
       * existait déjà, l'écriture violait l'unique
       * `idx_contacts_account_normalized_name` : le 23505 abortait la
       * transaction de la phase, remontait au worker en `UnrecoverableError`,
       * et faisait tomber le RUN ENTIER — crédits débités, dossier jamais
       * livré. Constaté en production sur EMERIA.
       *
       * La ligne qui porte déjà le nom complet est la même personne : c'est
       * ELLE qu'on enrichit, et le nom n'a plus à bouger. L'index garantit
       * qu'il ne peut y en avoir qu'une.
       */
      let renameTo: string | null = null
      if (matchedById && fullName && fullName !== target.full_name) {
        const holder = await repo
          .createQueryBuilder('c')
          .where(nameMatchPredicate('c'), { accountId, fullName })
          .andWhere('c.id != :targetId', { targetId: target.id })
          .getOne()
        if (holder) {
          this.logger.warn(
            `applyEnrichment : « ${fullName} » est déjà porté par une autre ligne du compte — enrichissement reporté sur elle, sans renommage`,
            { accountId, from: target.id, into: holder.id },
          )
          target = holder
        } else {
          renameTo = fullName
        }
      }

      // LUDB.5 bis — l'IA a marqué ce contact comme celui d'un HOMONYME : on l'écarte avec sa
      // raison (réversible par `restoreContact`), on n'écrit RIEN de ce qu'elle propose sur la
      // ligne. Une identité confirmée à la main ou un contact déjà écarté n'est jamais retouché.
      if (c.excluded === true) {
        if (!target.excluded_at && !target.identity_confirmed_at) {
          await repo.update(
            { id: target.id },
            { excluded_at: new Date(), exclusion_reason: c.exclusionReason?.trim() || HOMONYM_EXCLUSION_REASON },
          )
        }
        continue
      }

      // #4616 — sous la transaction de la phase 3, la provenance se lit sur SA connexion.
      const currentSources = this.provenance ? await this.provenance.currentSources('contact', target.id, manager) : {}
      const { accepted } = applyFieldUpdates({
        incoming: proposed,
        incomingSource: 'pipeline',
        current: toFieldView(target as unknown as Record<string, unknown>, CONTACT_PIPELINE_FIELD_COLUMNS),
        currentSources,
      })

      const fields: QueryDeepPartialEntity<ContactEntity> = toColumnPatch(accepted, CONTACT_PIPELINE_FIELD_COLUMNS)

      // `email_verified` n'a de sens qu'attaché à SON adresse : le poser quand
      // l'adresse proposée a été refusée déclarerait « vérifié » à propos d'une
      // autre adresse que celle qui a été vérifiée.
      if ('email' in accepted || (c.email && !isPlaceholderEmail(c.email) && c.email === target.email)) {
        ;(fields as Record<string, unknown>).email_verified = c.emailVerified
      }

      // Sur un match par id Apollo, la ligne est la même personne par
      // construction : le nom révélé remplace le nom masqué. JAMAIS sur un
      // match par nom — là, le nom EST la clé, et le réécrire pourrait
      // rebaptiser un contact en quelqu'un d'autre. Et jamais non plus quand
      // le nom est déjà pris (voir la résolution ci-dessus).
      if (renameTo) {
        ;(fields as Record<string, unknown>).full_name = renameTo
        accepted.fullName = renameTo
      }

      if (Object.keys(fields).length === 0) continue

      /**
       * Un contact ne fait JAMAIS tomber le run.
       *
       * L'écriture vit dans la transaction de la phase 3. En PostgreSQL, une
       * instruction qui échoue abort la transaction entière : un seul contact
       * refusé emportait donc les autres, le point de reprise de la phase, et
       * le run — après débit des crédits. Le point de sauvegarde borne le
       * dégât à la ligne fautive ; ce qui a été refusé est journalisé en
       * `error` (donc remonté), jamais avalé.
       */
      const savepoint = `contact_enrich_${matched}_${skipped}`
      if (manager) await manager.query(`SAVEPOINT ${savepoint}`)
      let written = false
      try {
        written = await this.writeEnrichment({ repo, manager, target, fields, accepted, scopeMode })
      } catch (error) {
        if (!manager) throw error
        await manager.query(`ROLLBACK TO SAVEPOINT ${savepoint}`)
        skipped++
        this.logger.error("applyEnrichment : contact ignoré après un échec d'écriture — le run continue", {
          error,
          accountId,
          contactId: target.id,
          fullName,
        })
        continue
      }
      if (manager) await manager.query(`RELEASE SAVEPOINT ${savepoint}`)
      if (written) {
        matched++
        enrichedWorkspaceId ??= target.workspace_id ?? null
      }
    }
    if (skipped > 0) {
      this.logger.warn(`applyEnrichment : ${skipped} contact(s) ignoré(s) sur ${items.length}`, { accountId })
    }
    // #3942.5 — le pipeline d'analyse est LA voie par laquelle les contacts
    // d'un compte changent en masse ; son chemin recommandé en cache ne vaut
    // plus rien dès qu'une ligne a réellement été écrite.
    if (matched > 0 && enrichedWorkspaceId) this.invalidateRecommendedPath(enrichedWorkspaceId, accountId)
    return matched
  }

  /** L'écriture elle-même — extraite pour tenir dans un point de sauvegarde. */
  private async writeEnrichment(args: {
    repo: Repository<ContactEntity>
    manager?: EntityManager
    target: ContactEntity
    fields: QueryDeepPartialEntity<ContactEntity>
    accepted: Record<string, unknown>
    scopeMode?: string | null
  }): Promise<boolean> {
    const { repo, manager, target, fields, accepted, scopeMode } = args
    {
      // L'écriture vise la ligne DÉJÀ résolue, par son id.
      //
      // Elle rejouait le prédicat de recherche — `c.account_id = …` — sur un
      // `createQueryBuilder()` SANS alias : un `UPDATE contacts` n'a pas de
      // table `c`, donc PostgreSQL refusait la requête (« missing FROM-clause
      // entry for table "c" ») et faisait tomber la phase classify entière,
      // après que les crédits du run aient été débités. Viser l'id supprime la
      // question de l'alias, et supprime en prime le risque qu'un prédicat par
      // nom écrive sur plusieurs lignes homonymes.
      const res = await repo
        .createQueryBuilder()
        .update(ContactEntity)
        .set(fields)
        .where('id = :targetId', { targetId: target.id })
        .execute()
      if ((res.affected ?? 0) === 0) return false

      if (this.provenance) {
        const currentView = toFieldView(target as unknown as Record<string, unknown>, CONTACT_PIPELINE_FIELD_COLUMNS)
        // #4616 — même connexion que l'écriture qu'elle décrit : ni deuxième connexion, ni provenance qui
        // survit au rollback de la ligne.
        const changeSet: Parameters<ProvenanceService['commit']>[0] = {
          workspaceId: target.workspace_id,
          entityType: 'contact',
          entityId: target.id,
          source: 'pipeline',
          actorId: null,
          changes: Object.keys(accepted).map(field => {
            const oldValue = currentView[field]
            const newValue = accepted[field]
            // #3219 (#190.2) — la portée n'est écrite que sur les champs qui
            // DÉPENDENT du périmètre, et seulement quand le run en a déclaré un :
            // l'e-mail ou le téléphone d'une personne ne changent pas avec le
            // périmètre, leur donner une portée masquerait une vraie contradiction.
            const claim =
              PERIMETER_SCOPED_CONTACT_FIELDS.has(field) && typeof newValue === 'string'
                ? pipelineFieldScopeClaim({
                    previousValue: typeof oldValue === 'string' ? oldValue : null,
                    newValue,
                    scopeMode,
                    scopeLabels: ANALYSIS_SCOPE_MODE_LABELS,
                  })
                : null
            return { field, oldValue, newValue, ...(claim ? { scope: claim.scope } : {}) }
          }),
        }
        await (manager ? this.provenance.commit(changeSet, manager) : this.provenance.commit(changeSet))
      }

      // Phase 3 (Claude role + Apollo email/phone) can advance the lifecycle
      // (→ qualifié / enrichi / actionnable). Reload the merged row so the
      // canonical computation sees the new fields, then persist + journal the
      // passage. Provider = the contact's own source; system actor (null).
      const updated = await repo.createQueryBuilder('c').where('c.id = :targetId', { targetId: target.id }).getOne()
      if (updated) await this.syncContactLifecycle(updated, { source: updated.source, actor: null }, manager)
    }
    return true
  }

  /**
   * Apply the Phase 4 ready-to-send messages (bellum_messages) to existing
   * contacts, matching by case-insensitive ``full_name``. Only sets the channels
   * the model actually filled. Returns the number of contacts updated.
   *
   * Le script téléphone est ASSEMBLÉ depuis les quatre moments p11 (voir
   * `composePhoneScript`) : le produit ne générait que l'ouverture, donc l'appel
   * ne qualifiait rien et ne se terminait sur aucun next step daté.
   */
  async applyMessages(accountId: string, items: AnalysisContactMessage[], manager?: EntityManager): Promise<number> {
    const repo = manager ? manager.getRepository(ContactEntity) : this.contacts
    let matched = 0
    for (const m of items) {
      const fullName = (m.contactName ?? '').trim()
      if (!fullName) continue
      const set: QueryDeepPartialEntity<ContactEntity> = {}
      if (m.linkedinMessage?.trim()) set.linkedin_message = m.linkedinMessage.trim()
      const phoneScript = composePhoneScript(m)
      if (phoneScript) set.phone_script = phoneScript
      // Contenu de cadence par touche (p12) — persisté tel quel, non vide
      // seulement. La carte de cadence l'affichera sous chaque échéance.
      const cadence = m.cadence
      if (cadence && (cadence.relance?.trim() || cadence.preuveSociale?.trim() || cadence.closeLoop?.trim())) {
        set.cadence_messages = {
          ...(cadence.relance?.trim() ? { relance: cadence.relance.trim() } : {}),
          ...(cadence.preuveSociale?.trim() ? { preuveSociale: cadence.preuveSociale.trim() } : {}),
          ...(cadence.closeLoop?.trim() ? { closeLoop: cadence.closeLoop.trim() } : {}),
        }
      }
      if (m.emailBody?.trim()) {
        set.email_message = { subject: m.emailSubject?.trim() || undefined, body: m.emailBody.trim(), channel: 'email' }
      }
      if (Object.keys(set).length === 0) continue
      const result = await repo
        .createQueryBuilder()
        .update(ContactEntity)
        .set(set)
        .where(nameMatchPredicate(), { accountId, fullName })
        .execute()
      if (result.affected && result.affected > 0) matched++
    }
    return matched
  }

  async countByUserSince(userId: string, since?: Date): Promise<number> {
    try {
      // Phase 2: count the whole workspace's contacts (dashboard aggregate).
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      if (!since) {
        return await this.contacts.count({ where: { deleted_at: IsNull(), ...workspaceScopeWhere(workspaceId) } })
      }
      const qb = this.contacts
        .createQueryBuilder('contact')
        .andWhere('contact.deleted_at IS NULL')
        .andWhere('contact.created_at >= :since', { since })
      return await applyWorkspaceScope(qb, 'contact', workspaceId).getCount()
    } catch (err) {
      this.logger.error('countByUserSince error', { error: err })
      return 0
    }
  }

  /**
   * Les fiches à compléter de l'espace — le compteur « Contacts à enrichir ».
   *
   * ⚠️ Le `deleted_at IS NULL` n'est pas une précaution : il manquait, et ce
   * compteur s'affiche À CÔTÉ de `countByUserSince`, qui, lui, l'a toujours
   * eu. Deux populations sous un seul bandeau — c'est ce qui donnait
   * « 254 détectés » au-dessus de « +255 cette semaine », deux chiffres qui ne
   * pouvaient pas être vrais ensemble. Une fiche supprimée n'est pas une fiche
   * à enrichir.
   *
   * Le prédicat de complétude vient de `contact-completeness.ts` — la liste, le
   * compteur et l'agrégat lisent LA même définition (il était recopié ici).
   */
  async countToEnrichByUser(userId: string): Promise<number> {
    try {
      // Phase 2: workspace-scoped "to enrich" count for the dashboard.
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const qb = this.contacts
        .createQueryBuilder('contact')
        .andWhere('contact.deleted_at IS NULL')
        .andWhere(missingContactDetailsSql('contact'))
      return await applyWorkspaceScope(qb, 'contact', workspaceId).getCount()
    } catch (err) {
      this.logger.error('countToEnrichByUser error', { error: err })
      return 0
    }
  }

  /**
   * #2155.24/.25 — le badge de navigation « Contacts ».
   *
   * « Prêt à traiter » (QCM tranché par Louis le 15/09/2026) : une coordonnée
   * VÉRIFIÉE, rattachée à un compte du PORTEFEUILLE, sans AUCUNE action
   * ouverte le concernant. Les trois prédicats sont lus, jamais recopiés :
   *  - portefeuille = `ACCOUNT_HYGIENE_PREDICATES.followedAccounts`, la MÊME
   *    définition que le compteur `followed` de `/accounts` (GA-53) ;
   *  - action ouverte = `taskStillOpenSql`, la même que `noUpcomingTask` —
   *    `tasks.contact_id` est la table canonique de « prochaine action »,
   *    pas `action_plan_items` (propre aux plans de compte).
   *
   * ⚠️ `undefined` sur erreur, JAMAIS `0` : un badge de nav absent (mesure
   * ratée OU population vide) ne s'affiche pas, mais les deux ne sont pas la
   * même phrase — voir `contactBadgeCountersSchema`.
   *
   * Le périmètre (BU) — même sécurité que `getStats` : un membre cloisonné ne
   * doit pas voir un chiffre qui compte des fiches d'une autre agence, qu'il
   * ne pourra de toute façon pas ouvrir.
   */
  async countReadyToProcess(
    userId: string,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<number | undefined> {
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const qb = this.contacts
        .createQueryBuilder('contact')
        .andWhere('contact.deleted_at IS NULL')
        .andWhere('contact.email_verified = true')
        // PERF (P5, 29/09 — `counts/ready-to-process` mesuré à 3,2 s) : le sous-select
        // `IN (SELECT a.id FROM accounts …)` n'était PAS corrélé — il balayait les
        // comptes suivis de TOUS les espaces avant de joindre. Corrélé par la clé
        // primaire, il ne lit que le compte de chaque contact vérifié. Même population.
        .andWhere(
          `EXISTS (SELECT 1 FROM accounts a WHERE a.id = contact.account_id AND ${ACCOUNT_HYGIENE_PREDICATES.followedAccounts})`,
        )
        .andWhere(`NOT EXISTS (SELECT 1 FROM tasks t WHERE t.contact_id = contact.id AND ${taskStillOpenSql('t')})`)
      applyWorkspaceScope(qb, 'contact', workspaceId)
      const businessUnitClause = businessUnitScopeClause(
        businessUnitScope,
        'bu_acc.business_unit_id',
        ':...businessUnitIds',
      )
      if (businessUnitClause) {
        qb.andWhere(
          `contact.account_id IN (SELECT bu_acc.id FROM accounts bu_acc WHERE ${businessUnitClause})`,
          businessUnitScope && businessUnitScope.businessUnitIds.length
            ? { businessUnitIds: [...businessUnitScope.businessUnitIds] }
            : {},
        )
      }
      return await qb.getCount()
    } catch (err) {
      this.logger.error('countReadyToProcess error', { error: err })
      return undefined
    }
  }

  async getStats(
    userId: string,
    /** Le périmètre (BU) de l'appelant, RÉSOLU PAR LE CONTRÔLEUR. `null` = tout
     *  l'espace : c'est le défaut historique, et le chemin des appelants
     *  internes (pipeline d'analyse, tableau de bord) reste byte-identique. */
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<ContactStats> {
    try {
      const now = new Date()
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000)
      const weekAgo = new Date(startOfToday.getTime() - 7 * 86_400_000)
      const twoWeeksAgo = new Date(startOfToday.getTime() - 14 * 86_400_000)

      // Phase 2: dashboard stats over the whole workspace (created-by kept per row).
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      // ⚠️ Les compteurs comptent la MÊME population que la liste — revue
      // sécurité 15/09/2026. Un total qui inclurait les contacts d'une autre
      // agence annoncerait au membre cloisonné des fiches qu'il ne peut pas
      // ouvrir. Sixième paramètre positionnel, ajouté SEULEMENT s'il y a un
      // périmètre à appliquer : sans lui, la requête est byte-identique.
      const businessUnitClause = businessUnitScopeClause(
        businessUnitScope,
        'bu_acc.business_unit_id',
        'SELECT unnest($6::uuid[])',
      )
      const statsParams: unknown[] = [workspaceId, weekAgo, twoWeeksAgo, startOfToday, startOfYesterday]
      if (businessUnitScope && businessUnitScope.businessUnitIds.length > 0) {
        statsParams.push([...businessUnitScope.businessUnitIds])
      }
      const [row] = await this.contacts.query<ContactStats[]>(
        `SELECT
          COUNT(*)::int                                                                         AS "total",
          COUNT(*) FILTER (WHERE ${missingContactDetailsSql()})::int                          AS "toEnrich",
          COUNT(*) FILTER (WHERE created_at >= $2)::int                                        AS "savedThisWeek",
          COUNT(*) FILTER (WHERE created_at >= $3 AND created_at < $2)::int                    AS "savedLastWeek",
          COUNT(*) FILTER (WHERE email IS NOT NULL AND updated_at >= $4)::int                  AS "enrichedToday",
          COUNT(*) FILTER (WHERE email IS NOT NULL AND updated_at >= $5 AND updated_at < $4)::int AS "enrichedYesterday"
        FROM contacts
        WHERE workspace_id = $1${
          businessUnitClause
            ? `\n          AND (account_id IS NULL OR account_id IN (SELECT bu_acc.id FROM accounts bu_acc WHERE ${businessUnitClause}))`
            : ''
        }`,
        statsParams,
      )

      return row
    } catch (err) {
      this.logger.error('getStats error', { error: err })
      return { total: 0, toEnrich: 0, savedThisWeek: 0, savedLastWeek: 0, enrichedToday: 0, enrichedYesterday: 0 }
    }
  }

  /**
   * #2384.5 — la délivrabilité, DISTINCTE du taux d'envoi : « combien de ce
   * qui est parti a réellement atteint la boîte », pas seulement « combien
   * est parti ». Posée sur `email_bounced_at`/`email_bounce_reason`, écrits
   * par le SEUL webhook fournisseur (#2733, `applyEmailBounce`) — jamais une
   * donnée devinée.
   *
   * `domainReputation`/`complaints` restent `null` : aucun connecteur ne les
   * mesure aujourd'hui (pas de webhook plainte, pas de score de réputation de
   * domaine branché). Nommés et non `0` — doctrine GA-18/19, « non mesuré
   * n'est jamais 0 » — l'écran les rend avec `UnknownValue`.
   *
   * Même cloisonnement BU que `getStats` juste au-dessus (revue sécurité
   * 15/09/2026) : un total qui inclurait les contacts d'une autre agence
   * annoncerait au membre cloisonné des fiches qu'il ne peut pas ouvrir.
   */
  async getDeliverability(
    userId: string,
    /** Le périmètre (BU) de l'appelant, RÉSOLU PAR LE CONTRÔLEUR. `null` = tout l'espace. */
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<ContactDeliverability> {
    const empty: ContactDeliverability = {
      sent: 0,
      bounced: 0,
      bounceRate: null,
      bounceReasons: [],
      domainReputation: null,
      complaints: null,
    }
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const businessUnitClause = businessUnitScopeClause(
        businessUnitScope,
        'bu_acc.business_unit_id',
        'SELECT unnest($2::uuid[])',
      )
      const params: unknown[] = [workspaceId]
      if (businessUnitScope && businessUnitScope.businessUnitIds.length > 0) {
        params.push([...businessUnitScope.businessUnitIds])
      }
      const scopeSql = businessUnitClause
        ? `\n          AND (account_id IS NULL OR account_id IN (SELECT bu_acc.id FROM accounts bu_acc WHERE ${businessUnitClause}))`
        : ''

      const [counts] = await this.contacts.query<{ sent: number; bounced: number }[]>(
        `SELECT
          COUNT(*) FILTER (WHERE email_sent_at IS NOT NULL)::int    AS "sent",
          COUNT(*) FILTER (WHERE email_bounced_at IS NOT NULL)::int AS "bounced"
        FROM contacts
        WHERE workspace_id = $1${scopeSql}`,
        params,
      )
      const reasons = await this.contacts.query<{ reason: string; count: number }[]>(
        `SELECT email_bounce_reason AS "reason", COUNT(*)::int AS "count"
        FROM contacts
        WHERE workspace_id = $1${scopeSql}
          AND email_bounced_at IS NOT NULL AND email_bounce_reason IS NOT NULL
        GROUP BY email_bounce_reason
        ORDER BY count DESC, reason ASC`,
        params,
      )

      const sent = counts?.sent ?? 0
      const bounced = counts?.bounced ?? 0
      return {
        sent,
        bounced,
        bounceRate: sent > 0 ? bounced / sent : null,
        bounceReasons: reasons ?? [],
        domainReputation: null,
        complaints: null,
      }
    } catch (err) {
      this.logger.error('getDeliverability error', { error: err })
      return empty
    }
  }

  /**
   * #2842 (reste, 26/09) — épopée #2074.13-.19, tranché sans Louis :
   * `contactFollowUps` de l'audit commercial (`/settings/profile/audit`).
   *
   * `total` = les contacts PRIS — même fait, même colonne que
   * `getDeliverability().sent` (`email_sent_at IS NOT NULL`, GA-26).
   * `withNextStepDate` = ceux qui portent encore au moins une touche de
   * cadence OUVERTE (`action_plan_items.cadence_step IS NOT NULL AND done =
   * false`, matérialisées par `CadenceService.scheduleForContact`) — la date
   * de reprise que `detectContactWithoutFollowUpDate` réclame.
   */
  async getFollowUpStats(
    userId: string,
    /** Le périmètre (BU) de l'appelant, RÉSOLU PAR LE CONTRÔLEUR. `null` = tout l'espace. */
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<ContactFollowUpStats> {
    const empty: ContactFollowUpStats = { total: 0, withNextStepDate: 0 }
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const businessUnitClause = businessUnitScopeClause(
        businessUnitScope,
        'bu_acc.business_unit_id',
        'SELECT unnest($2::uuid[])',
      )
      const params: unknown[] = [workspaceId]
      if (businessUnitScope && businessUnitScope.businessUnitIds.length > 0) {
        params.push([...businessUnitScope.businessUnitIds])
      }
      const scopeSql = businessUnitClause
        ? `\n          AND (account_id IS NULL OR account_id IN (SELECT bu_acc.id FROM accounts bu_acc WHERE ${businessUnitClause}))`
        : ''

      const [row] = await this.contacts.query<ContactFollowUpStats[]>(
        `SELECT
          COUNT(*) FILTER (WHERE email_sent_at IS NOT NULL)::int AS "total",
          COUNT(*) FILTER (WHERE email_sent_at IS NOT NULL AND EXISTS (
            SELECT 1 FROM action_plan_items api
            WHERE api.contact_id = contacts.id AND api.cadence_step IS NOT NULL AND api.done = false
          ))::int AS "withNextStepDate"
        FROM contacts
        WHERE workspace_id = $1${scopeSql}`,
        params,
      )
      return row ?? empty
    } catch (err) {
      this.logger.error('getFollowUpStats error', { error: err })
      return empty
    }
  }
}
