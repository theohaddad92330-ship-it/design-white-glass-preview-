import { withoutHomonymResearchFacts } from './research-homonym-facts'
import { IMPLANTATION_PLACES_SQL, implantationPlaces } from './account-site-places'
import { randomUUID } from 'node:crypto'
import { archiveFailedShells, FAILED_SHELL_SQL, type ArchiveFailedShellsOutcome } from './account-failed-shells'
import { listGroupEntities, type GroupEntityView } from './account-group-entities'
import type {
  AccountRecentHires,
  AccountRegistryAnnouncements,
  DiscoverOriginCriteria,
  RegistryAnnouncement,
} from '@bellum/contracts'
import {
  REGISTRY_ANNOUNCEMENTS_MAX,
  REGISTRY_ANNOUNCEMENTS_SQL,
  toAccountRegistryAnnouncements,
  toRegistryAnnouncement,
} from './registry-announcements'
import { readListScore25 } from './account-list-score'
import { loadAccountRecentHires, recentHireContactsReader } from './recent-hires'
import { awardSignalItems } from './award-signals'
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  Optional,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  type EntityManager,
  type FindOptionsWhere,
  ILike,
  In,
  IsNull,
  Not,
  Repository,
  type SelectQueryBuilder,
} from 'typeorm'
import { type QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import type {
  AccountActiveAnalysis,
  AccountListHeadlineFilter,
  AccountListItem,
  AccountOwner,
  AccountListQuery,
  AccountListResponse,
  AccountNeedsRow,
  AccountSignalItem,
  AccountPlanMutationResponse,
  AccountSortKey,
  CommercialLifecycle,
  CommercialStatusWriteOrigin,
  Completeness,
  ContactsOutOfScope,
  AnalysisPlanData,
  AnalysisProfileData,
  AnalysisResearchData,
  CompanySuggestion,
  DashboardAccountInsight,
  DeclareAccountSignalsRequest,
  DeclaredSignal,
  RecentSignal,
  SimilarAccountSuggestion,
  UserAttackAngle,
  OrgDeclaredPerson,
} from '@bellum/contracts'
import {
  dedupeNearIdenticalSignals,
  ACCOUNT_SCORE_GO_MIN,
  ACCOUNT_SCORE_PRUDENT_MIN,
  ANALYSIS_SCOPE_MODE_LABELS,
  COMMERCIAL_OPPORTUNITY_SCORE_MIN,
  type AccountListCounters,
  applyFieldUpdates,
  pipelineFieldScopeClaim,
  buildIdentityMismatchMessage,
  commercialStatusWriteRefusal,
  companyDomainKey,
  countActiveSignals,
  deriveCommercialStatusOnComplete,
  detectedPartnersFrom,
  interactionActivityKindsSql,
  isSameRegistryIdentity,
  lockFactFromAwards,
  noGoMessageRefusal,
  normalizeTag,
  orgGraphSchema,
  pickDominantRecentSignal,
  pickRepresentativeTags,
  readRecentSignals,
  readReferenceArchive,
  readSignalLayers,
  type ReadSignalLayers,
  withoutHomonymSignals,
  dropInternshipRows,
  guardAgainstCorrectedSignals,
  preserveNotConfirmedPeople,
  summarizeSignalFreshness,
  tagKey,
  portfolioScopeClause,
  type AddToPortfolioInput,
  type FieldSource,
  type RelationshipMemory,
} from '@bellum/contracts'
import { failure, isFailure, success, type Result } from '@bellum/utils'
import { toSnakeCaseKeys } from '../../common/util/snake-case'
import { buildAccountChangeDigest } from './account-change-digest'
import { buildWorkingCopyFields } from './account-working-copy'
import { resolveOwnerNames as resolveOwnerNamesShared } from './account-owner.util'
import { derivePortfolioPriorities, pickInterlocutor, whyNowOf, type PortfolioPriorities } from './portfolio-priorities'
import { ACCOUNT_FACTS_READER, type AccountFactsReader } from '../account-facts/module-tokens'
import type { CommercialLoadCapacity } from './commercial-load-capacity'
import type { EffortBudget } from './effort-budget'
import { graftDeclaredSignals } from './declared-signals'
import { ownerDisplayName } from '../delivery/delivery.service'
import { type BusinessUnitScopeClause, businessUnitScopeClause } from './business-unit-scope.clause'
import { computePathOrigin } from '../org-graph/org-graph-path'
import {
  COMMITTEE_ENTRY_LEVELS,
  type AccountChangeDigest,
  type BetProfileRow,
  type CommitteeEntryLevel,
  type SetBetProfileRequest,
  type SetCommitteeEntryLevelRequest,
} from '@bellum/contracts'
import { ACCOUNT_STALE_AFTER_DAYS, asList, normalizeCompanyNameKey } from '@bellum/contracts'
import type { AccountJobOffers } from '@bellum/contracts'
import { loadAccountJobOffers } from './job-offers'
import { AccountEntity } from '../../database/entities/account.entity'
import { ACCOUNT_FIELD_COLUMNS, toFieldView } from '../crm-core/record-fields'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { IaClient } from '../ia/ia.client'
import { watchCadenceFor } from '../watchlist-refresh/watchlist-refresh.queue'
import { activeFollowExists } from '../account-follows/account-follow.entity'
import { SignalHistoryService } from '../signal-history/signal-history.service'
import { resolveWorkspaceAuthors, type WorkspaceAuthor } from '../../common/workspace-authors'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import { CreateAccountDto } from './dto/create-account.dto'
import {
  ACCOUNT_HYGIENE_PREDICATES,
  ACCOUNT_HYGIENE_SCAN_LIMIT,
  accountsWithoutNextActionSql,
  contactsWithoutEmailByAccountSql,
  LAST_ANALYZED_SQL,
  type AccountHygieneByAccount,
} from './account-hygiene.sql'
import { normalizeRegistryRef } from './registry-id.util'
import { decisiveSignalKinds, orderSignalsByDecisiveKinds } from './signal-relevance'
import { rankSimilarCandidates, sharedWithReference, SIMILAR_SCORE_MAX, spreadAcrossSeeds } from './similar-scoring'
import { firstReturnedRow, returnedRows } from '../../database/returned-rows'
import { applyDeclaredPeople } from '../org-graph/org-graph-declare'
// Fonctions PURES d'un module voisin — pas des services : rien de ce que GA-07
// compte, et rien qui crée une dépendance de module.
import { replayCorrections, type ReplayableCorrection } from '../org-graph/org-graph-correction'
import { auditDuplicateAccounts, type DuplicateAudit } from './account-duplicate-audit'
import { planAbsorb, refuseAbsorb, type AbsorbAccount, type AbsorbPlan, type AbsorbRefusal } from './account-absorb'
import { planDetach, refuseDetach, type DetachAccount, type DetachPlan, type DetachRefusal } from './account-detach'
import { AccessFactEntity } from '../../database/entities/access-fact.entity'
import { FieldProvenanceEntity } from '../../database/entities/field-provenance.entity'
import { AccountFeedbackEntity } from '../../database/entities/account-feedback.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { AccountPartnerEntity } from '../../database/entities/account-partner.entity'
import { killSwitchCut } from '../../common/kill-switches'
// #2150.14/.18 — le favori de compte, rétabli (revirement assumé de #1800).
// La CONSTANTE, pas le service du module voisin (GA-07) : la table est un
// schéma partagé, exactement comme `UserFavoriteEntity` le documente.
import { CRM_LINKED_ACCOUNT_PREDICATE, IMPORTED_ACCOUNT_PREDICATE } from './account-crm-linked'
import { UserFavoriteEntity, USER_FAVORITES_TABLE } from '../favorites/user-favorite.entity'
// #2127.37 — « Masquer cette suggestion », persistant et par personne. Le
// REPOSITORY, pas un service dédié : l'upsert et le filtre sont deux requêtes
// simples, il n'y a rien à aller chercher dans un autre module (GA-07).
import { SimilarAccountDismissalEntity } from '../../database/entities/similar-account-dismissal.entity'
// #2151.59 — la reprise des notes de terrain écrites sur le candidat
// Découvrir (même SIREN), au moment où il devient ce compte. GA-07
// (18/09/2026) : `AccountClaimBus` seulement, jamais `DiscoverCandidateNotesService`
// — voir le docblock de `account-claim.bus.ts` (module `discover-notes`).
import { AccountClaimBus } from '../discover-notes/account-claim.bus'
import { normalizeSiren } from '../crm/crm-deal-account-link'
import { pickSameCompanyAccount, sameCompanyPrefilterToken, type SameCompanyCandidate } from './same-company-account'

/** Maps the `${field}_${dir}` sort key to TypeORM `orderBy` arguments. */
const SORT_MAP: Record<AccountSortKey, { expression: string; direction: 'ASC' | 'DESC' }> = {
  name_asc: { expression: 'account.company_name', direction: 'ASC' },
  name_desc: { expression: 'account.company_name', direction: 'DESC' },
  date_asc: { expression: LAST_ANALYZED_SQL, direction: 'ASC' },
  date_desc: { expression: LAST_ANALYZED_SQL, direction: 'DESC' },
  // #2627.1 — trier par VERDICT (GO en tête sur `score_desc`) : `priority_score`
  // est le nombre dont `accountVerdictFromScore` dérive GO/PRUDENT/NO-GO, même
  // grille que le filtre `score=high/medium/low` déjà branché plus bas.
  score_asc: { expression: 'account.priority_score', direction: 'ASC' },
  score_desc: { expression: 'account.priority_score', direction: 'DESC' },
}

/**
 * SIMON-FIX S.19 — le /25 que la liste AFFICHE (`readListScore25` : trois places, la première qui porte un nombre,
 * arrondi, borné 0–25), en SQL. Recette Simon 20/10 : `?sort=score_asc` rendait 10,15,15,17,17,17,18,17 — le tri
 * lisait `priority_score` (/10), la liste montrait le /25 : deux nombres différents sur une même colonne.
 * Un dossier sans /25 lisible rend NULL (rangé en fin, jamais un « 0 »).
 */
const NUMERIC_TEXT_SQL = (path: string) =>
  `CASE WHEN ${path} ~ '^\\s*-?[0-9]+(\\.[0-9]+)?\\s*$' THEN (${path})::numeric END`
const LIST_SCORE_25_SQL = `LEAST(25, GREATEST(0, ROUND(COALESCE(${[
  NUMERIC_TEXT_SQL("account.raw_analysis -> 'evaluation' ->> 'score'"),
  NUMERIC_TEXT_SQL("account.raw_analysis -> 'plan' -> 'evaluation' ->> 'score'"),
  NUMERIC_TEXT_SQL("account.raw_analysis -> 'evaluation_compte' ->> 'score'"),
].join(', ')}))))`

const DELETED_ACCOUNT_STATUS = 'deleted'

/**
 * Combien de chiffres il faut pour qu'une saisie soit une recherche
 * d'IDENTIFIANT et non un nom.
 *
 * TROIS. En dessous, la saisie est trop peu discriminante : « 42 » se retrouve
 * dans la moitié des SIREN d'un espace, et la liste répondrait à peu près tout.
 * Au-dessus, elle deviendrait inutilisable pour chercher un début de numéro,
 * qui est exactement ce qu'on tape quand on lit une facture de travers.
 */
const IDENTIFIER_MIN_DIGITS = 3

/**
 * La saisie vue comme un IDENTIFIANT LÉGAL, ou `null` si ce n'en est pas une.
 *
 * Les séparateurs d'affichage (espaces, points, tirets) sont retirés : un SIREN
 * se lit « 420 624 777 » sur un document et se stocke sans espaces, et une
 * recherche qui ne trouve qu'une des deux graphies est cassée pour la moitié
 * des gens.
 *
 * ⚠️ Ce qui reste doit être ENTIÈREMENT numérique. « TF1 » n'est pas un numéro,
 * et le traiter comme tel ferait remonter tous les comptes dont un SIREN
 * contient « 1 » — des faux positifs qu'aucun `OR` ne rattrape.
 */
function identifierQuery(raw: string): string | null {
  const stripped = raw.replace(/[\s.-]+/g, '')
  if (!/^[0-9]+$/.test(stripped)) return null
  return stripped.length >= IDENTIFIER_MIN_DIGITS ? stripped : null
}
const DISCOVERY_SEED_STATUSES = new Set(['completed', 'archived'])

/** Combien de « mes comptes » le cockpit CHARGE — il en affiche huit, et la
 *  liste sert aussi à composer les priorités. Une borne d'affichage, jamais un
 *  compte : c'est {@link AccountsService.countPersonalAccounts} qui compte. */
const PERSONAL_ACCOUNTS_LIST_LIMIT = 200

/** Terminal-failure analysis statuses. An account in one of these that never
 *  produced ANY artefact (no contact / attack angle / action plan / completed
 *  run) is an EMPTY SHELL — a « compte fantôme score - » the user must never see
 *  in the default portfolio list (Louis : « les erreurs ne sont jamais
 *  sauvegardées, ou au pire ça se stack »). The shell stays in base for
 *  idempotence / relance but is hidden by default. */
/** Statuts dont la LIGNE de compte est réutilisable en place par une nouvelle
 *  analyse — c'est ce qui garantit « un seul compte par (workspace, entreprise) ».
 *  `error`/`canceled` = un run terminé en échec ; `prospect` = un compte ajouté au
 *  portefeuille depuis Découvrir, jamais analysé. Sans `prospect` ici, lancer
 *  l'analyse d'un compte de son portefeuille créerait un DOUBLON de ce compte. */
const REUSABLE_SHELL_STATUSES = ['error', 'canceled', 'prospect'] as const

/**
 * SQL predicate (TRUE ⇒ keep the row) that hides EMPTY errored/canceled shells
 * from the default account list while keeping every row carrying the slightest
 * data. Deliberately byte-consistent with the purge migration
 * `PurgeEmptyDuplicateAccounts`' `has_data` definition (contacts / attack_angles
 * / action_plans / completed analysis_runs) so the runtime hides EXACTLY what the
 * migration would purge — the migration cleans the existing stock, this clause
 * prevents the recurrence in the UI. The leading `keep-non-empty-failed` marker
 * lets the in-memory test repository recognise the clause.
 */
// #4621.3 — la règle vit à UN endroit (`FAILED_SHELL_SQL`) : la liste la masque, l'archivage par lot l'applique.
const KEEP_NON_EMPTY_FAILED_SQL = `/* keep-non-empty-failed */ NOT (
  ${FAILED_SHELL_SQL}
)`

/* ── Les compteurs de tête du portefeuille (PDF-04 §1.3) ───────────────────────
 *
 * Quatre prédicats, posés sur l'alias `account` de la requête de LISTE, donc
 * combinables avec tous ses filtres par un simple `andWhere` sur un clone.
 *
 * ⚠️ Les deux premiers n'écrivent PAS leur règle : ils interpolent celle du
 * cockpit (`ACCOUNT_HYGIENE_PREDICATES`), qui est écrite sur l'alias `a`. La
 * sous-requête existe pour ça — elle garde l'alias du prédicat intact, là où
 * une réécriture de `a.` en `account.` serait la copie que GA-53 refuse. Une
 * retouche de la règle vaut donc du même coup pour le cockpit, pour la pastille
 * de ligne et pour ce compteur.
 */
const FOLLOWED_ACCOUNTS_PREDICATE = `account.id IN (
  SELECT a.id FROM accounts a WHERE ${ACCOUNT_HYGIENE_PREDICATES.followedAccounts}
)`

const FOLLOWED_WITHOUT_NEXT_ACTION_PREDICATE = `account.id IN (
  SELECT a.id FROM accounts a
   WHERE ${ACCOUNT_HYGIENE_PREDICATES.followedAccounts}
     AND ${ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask}
)`

/** Refonte Théo — « Relations actives » : un compte client, ou dont l'ouverture est engagée. */
const ACTIVE_RELATIONS_PREDICATE = `COALESCE(account.commercial_status, 'inbox') IN ('customer', 'opening')`

/**
 * Un signal APPARU dans les sept derniers jours.
 *
 * ⚠️ `first_detection_exact` est la condition qui empêche le chiffre de mentir :
 * une ligne issue du backfill dit seulement que le signal était DÉJÀ là à cette
 * date, jamais qu'il vient d'apparaître. Sans ce filtre, une reprise
 * d'historique se lirait comme une semaine d'actualité.
 *
 * ⚠️ On ne filtre PAS sur `status = 'active'` : un signal détecté mardi et
 * disparu vendredi est quand même apparu cette semaine, et la question posée
 * est « qu'est-ce qui a bougé ? », pas « qu'est-ce qui bouge encore ? ».
 */
const NEW_SIGNAL_LAST_7_DAYS_PREDICATE = `EXISTS (
  SELECT 1 FROM signal_history sh
   WHERE sh.account_id = account.id
     AND sh.first_detection_exact = true
     AND sh.first_detected_at >= now() - interval '7 days'
)`

/**
 * La classe d'accès A ou B — « les ouverts probables ».
 *
 * Elle vit dans la barrière d'accès de l'analyse, sous ses deux graphies
 * historiques (`access_barrier` / `accessBarrier`) : c'est la MÊME lecture que
 * l'onglet Accès (`account-access.service.ts`), qui essaie les deux dans cet
 * ordre.
 *
 * ⚠️ Un compte jamais évalué n'est dans AUCUNE classe : `->>'…'` rend `NULL`,
 * `IN` rend `NULL`, et la ligne n'est pas comptée. Elle n'est surtout pas
 * rangée en D par défaut — « non mesuré » n'est pas « mal classé ».
 */
const ACCESS_CLASS_A_OR_B_PREDICATE = `COALESCE(
  account.raw_analysis->'access_barrier'->>'access_class',
  account.raw_analysis->'accessBarrier'->>'access_class'
) IN ('A', 'B')`

/**
 * #1580 — LE BANDEAU DE TÊTE DEVIENT UN FILTRE.
 *
 * Les trois métriques DÉCISIONNELLES du bandeau (`AccountsCountersBand`) se
 * cliquent désormais, et le clic doit filtrer la POPULATION SERVEUR complète —
 * jamais seulement la page déjà chargée (même défaut déjà payé sur les
 * pastilles de `/contacts`). Le prédicat appliqué est EXACTEMENT celui qui
 * COMPTE la métrique dans `headlineCounters` juste au-dessus : une dérivation
 * vit à un seul endroit, deux chemins qui la refont divergent.
 *
 * `followed` n'a pas d'entrée ici — cliquer ce chiffre-là ne filtre pas, il
 * RAMÈNE au portefeuille complet (voir `accountListQuerySchema.headline`).
 */
const HEADLINE_FILTER_PREDICATE: Record<AccountListHeadlineFilter, string> = {
  withoutNextAction: FOLLOWED_WITHOUT_NEXT_ACTION_PREDICATE,
  newSignals7d: NEW_SIGNAL_LAST_7_DAYS_PREDICATE,
  accessClassAB: ACCESS_CLASS_A_OR_B_PREDICATE,
  // Refonte Théo — « À reprendre » = suivis MOINS sans prochaine action : les deux prédicats qui le comptent.
  toResume: `${FOLLOWED_ACCOUNTS_PREDICATE} AND NOT (${FOLLOWED_WITHOUT_NEXT_ACTION_PREDICATE})`,
  activeRelations: ACTIVE_RELATIONS_PREDICATE,
}

/**
 * Un `COUNT(...)` de Postgres, lu comme un entier.
 *
 * Le pilote rend les agrégats en CHAÎNE (`bigint` ne tient pas dans un `number`
 * JS, donc `node-postgres` ne devine pas à notre place). Un `Number(undefined)`
 * vaut `NaN` et un `NaN` posé dans un comptage se propage en silence : le
 * repli est `0` ici, et UNIQUEMENT ici, parce que ce qu'on lit est un
 * dénombrement dont l'absence de ligne est traitée à l'appelant — c'est là
 * qu'elle devient `null`, jamais zéro.
 */
function toCount(raw: string | number | null | undefined): number {
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0
}

/** Neuf chiffres, et rien d'autre — un SIREN tapé tel quel, jamais un nom. */
function isBareSiren(value: string): boolean {
  return /^\d{9}$/.test(value)
}

function normalizeDiscoverySeed(value: string | null | undefined): string | null {
  if (!value) return null
  const cleaned = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
  if (cleaned.length < 2) return null
  return cleaned.split(/\s+/).slice(0, 4).join(' ')
}

function buildSuggestionDescription(city: string, sector: string, fallbackSeed: string): string {
  return [city || null, sector || null, !city && !sector ? fallbackSeed : null].filter(Boolean).join(' · ')
}

// NAF division (2-digit) → a high-recall NAME token for "comptes similaires"
// (Théo p.41). Pappers ANDs the free-text `q` with the `code_naf` filter, so the
// naf-LABEL as `q` ("Autres intermédiations monétaires") matches no company NAME
// and returns nothing. A sector-appropriate token ("banque") + the naf filter
// returns real same-sector companies. Uncovered divisions fall back to the
// sector-text seed.
const NAF_DIVISION_SEED: Record<string, string> = {
  '64': 'banque',
  '65': 'assurance',
  '66': 'finance', // finance
  '62': 'informatique',
  '63': 'informatique', // IT / services info
  '41': 'batiment',
  '42': 'batiment',
  '43': 'batiment', // BTP
  '86': 'sante',
  '87': 'sante',
  '21': 'sante', // santé / pharma
  '35': 'energie',
  '19': 'energie',
  '06': 'energie', // énergie
  '49': 'transport',
  '50': 'transport',
  '51': 'transport',
  '52': 'logistique',
  '53': 'transport',
  '46': 'commerce',
  '47': 'commerce', // négoce / retail
  '68': 'immobilier',
  '01': 'agricole',
  '02': 'agricole',
  '03': 'agricole',
  '10': 'agroalimentaire',
  '11': 'boissons',
  '61': 'telecom',
  '25': 'industrie',
  '26': 'industrie',
  '27': 'industrie',
  '28': 'industrie',
  '29': 'industrie', // manufacture
}

/** High-recall discovery seed from a NAF/APE code's 2-digit division, or null. */
function nafSeedToken(nafCode: string | null | undefined): string | null {
  if (!nafCode) return null
  const division = nafCode.replace(/[^0-9]/g, '').slice(0, 2)
  return NAF_DIVISION_SEED[division] ?? null
}

/**
 * #2284.20 — le domaine racine de `account.website`, en SQL, pour qu'il se
 * compare à `companyDomainKey` (`@bellum/contracts`) : schéma, `www.` et chemin
 * retirés, casse abaissée. `https://www.thalesgroup.com/fr` → `thalesgroup.com`.
 */
const WEBSITE_ROOT_DOMAIN_SQL =
  "regexp_replace(regexp_replace(LOWER(TRIM(account.website)), '^https?://', ''), '^www\\.|[/?#:].*$', '', 'g')"

type AccountFailureCode =
  | 'not_found'
  | 'invalid_input'
  | 'create_failed'
  | 'archive_failed'
  | 'delete_failed'
  // #1111 — le rattachement d'un doublon a échoué EN ÉCRITURE. Distinct des
  // quatre refus, qui sont des `invalid_input` : « on ne peut pas » et « on n'a
  // pas réussi » appellent deux gestes différents.
  | 'absorb_failed'
  // #1111 — le DÉTACHEMENT a échoué en écriture. Même distinction que ci-dessus :
  // les deux refus du détachement sont des `invalid_input`.
  | 'detach_failed'

type DashboardAccountRow = Omit<DashboardAccountInsight, 'primary_signal' | 'recent_signals_count'> & {
  recent_signals: unknown
}

function scoreFields25(raw: Parameters<typeof readListScore25>[0]): { score_25?: number } {
  const score25 = readListScore25(raw)
  return score25 === null ? {} : { score_25: score25 }
}

type AccountPeople = NonNullable<AccountListItem['people']>

type AccountListRow = Omit<AccountListItem, 'primary_signal' | 'owner' | 'tags' | 'score_25' | 'people'> & {
  recent_signals: unknown
  /** #4016.91 — le /25 de l'évaluation, lu aux trois places où un dossier le range (texte brut, parsé ensuite). */
  site_places?: unknown
  eval_score_root?: string | null
  eval_score_plan?: string | null
  eval_score_compte?: string | null
  assigned_to: string | null
  /** #2159.26 — `text[]`, `NOT NULL DEFAULT '{}'` ; `null` toléré pour une
   *  projection qui ne l'aurait pas (mock, réponse antérieure). */
  tags?: string[] | null
  /** #4267.1 — un suivi EXPLICITE actif existe sur ce compte : la veille quotidienne le relit. */
  is_followed?: boolean | null
}

type AccountSignalRow = Pick<AccountListItem, 'id' | 'company_name' | 'sector' | 'priority_score' | 'created_at'> & {
  recent_signals: unknown
  // #1423 — de quoi reconnaître l'entreprise dans le flux. Les deux colonnes
  // existent depuis des mois ; seule la requête du flux les ignorait.
  logo_url?: string | null
  website?: string | null
  // #3922.3 — la date de collecte du segment signaux, pour dire « collecte antérieure au lien ».
  signals_collected_at?: Date | string | null
  // #3915.decp — le SIREN, pour y joindre les marchés publics attribués lus en continu.
  siren?: string | null
}

/**
 * Les trois faits privés d'un compte que le copilote reçoit (#1581.1 / #1573.1).
 *
 * ⚠️ `lastInteractionAt` à `null` = aucun échange ENREGISTRÉ. L'appelant doit
 * l'écrire ainsi : « aucun échange » serait une affirmation sur le passé, celle-ci
 * n'en est une que sur notre journal.
 */
export type CopilotAccountFacts = {
  /** Suivi, et rien de programmé dessus — le prédicat du bandeau, pas une copie. */
  withoutNextAction: boolean
  lastInteractionAt: string | null
  /** Un signal est APPARU dans les sept derniers jours. Sans son libellé, à dessein. */
  hasRecentSignal: boolean
}

export type AccountFailure = {
  code: AccountFailureCode
  message: string
}

/**
 * #4497.b (PR 12C) — le SUJET d'un compte, tel que la carte l'affiche (son signal dominant), se CHERCHE : les
 * libellés lus par `readRecentSignals` (`signal`, `title`, `label`, `description`, `summary`). Le garde
 * `jsonb_typeof` évite qu'une colonne non-tableau (donnée ancienne) fasse échouer TOUTE la liste.
 */
const SIGNAL_SUBJECT_MATCH_SQL = `EXISTS (
  SELECT 1 FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(account.recent_signals) = 'array' THEN account.recent_signals ELSE '[]'::jsonb END
  ) s
  WHERE s ->> 'signal' ILIKE :q OR s ->> 'title' ILIKE :q OR s ->> 'label' ILIKE :q
     OR s ->> 'description' ILIKE :q OR s ->> 'summary' ILIKE :q
)`

/** #4498.a — les valeurs d'un axe multi, sans « Tous » : `[]` = pas de filtre sur cet axe. */
function pickedValues<T extends string>(value: T | readonly T[] | undefined): T[] {
  return asList<T>(value).filter(v => v !== 'all')
}

/** #3928.a — le libellé lu par le lecteur UNIQUE (`signal` d'abord, comme la veille et l'historique). */
function readSignalLabel(signal: unknown): string | null {
  return readRecentSignals([signal])[0]?.label ?? null
}

export function readSignalPreview(signal: unknown): AccountListItem['signal_preview'] {
  if (!signal || typeof signal !== 'object') return null
  const record = signal as Record<string, unknown>
  const label = readSignalLabel(signal)
  if (!label) return null
  return {
    label,
    source: typeof record['source'] === 'string' ? record['source'] : null,
    type: typeof record['type'] === 'string' ? record['type'] : null,
    date: typeof record['date'] === 'string' ? record['date'] : null,
    // #3682 — la fraîcheur estampillée par l'analyse ; une valeur inconnue = `null`, jamais devinée.
    freshness: readKnownFreshness(signal),
  }
}

function readKnownFreshness(signal: unknown): 'current' | 'archive' | 'undated' | null {
  const f = readSignalFreshness(signal)
  return f === 'current' || f === 'archive' || f === 'undated' ? f : null
}

/**
 * #3682.1 — le signal DOMINANT : le premier fait actuel, à défaut le premier non ancien (pertinence
 * avant chronologie, mais un fait de 2024 ne passe pas pour l'actualité). S'il
 * n'y en a aucun, le premier de la liste : on garde le contexte historique, on
 * ne cache pas le compte et on n'invente rien.
 */
export function pickDominantSignal(signals: unknown, offerDomain?: string | null): unknown {
  if (!Array.isArray(signals)) return null
  // LUDB.7 bis — hors espace IT (le pack est PASSÉ, jamais deviné), un signal purement IT (`tech`) n'est
  // jamais le dominant. Espace IT ou pack inconnu : le choix d'avant, à l'octet près.
  const offIt = !!offerDomain && offerDomain !== 'esn_it'
  const usable = signals
    .filter(signal => readSignalLabel(signal) !== null)
    .filter(signal => !offIt || !isTechSignal(signal))
    .map(signal => ({ signal, freshness: readSignalFreshness(signal) }))
  return pickDominantRecentSignal(usable)?.signal ?? null
}

function isTechSignal(signal: unknown): boolean {
  const type = (signal as { type?: unknown } | null)?.type
  return typeof type === 'string' && type.trim().toLowerCase() === 'tech'
}

/** #3682.3 — la lecture UNIQUE « dernière vérification / dernier événement utile » (liste ET dossier). */
export function signalFreshnessOf(recentSignals: unknown, verifiedAt: string | null, offerDomain?: string | null) {
  return summarizeSignalFreshness({
    dominant: readSignalPreview(pickDominantSignal(recentSignals, offerDomain)),
    verifiedAt,
  })
}

/**
 * Read the IA-stamped freshness off a raw signal (current | archive | undated).
 *
 * Exported (25/09) pour la recette #2317.14 (épopée #2923, « signal périmé ») :
 * une fonction PURE déjà appelée en prod, désormais aussi la preuve directe du
 * scénario, plutôt qu'une seconde fonction qui referait la même lecture (GA-26).
 */
export function readSignalFreshness(signal: unknown): string | null {
  if (!signal || typeof signal !== 'object') return null
  const f = (signal as Record<string, unknown>)['freshness']
  return typeof f === 'string' ? f : null
}

function toAccountSignalItems(row: AccountSignalRow): AccountSignalItem[] {
  // #3928.a — le lecteur UNIQUE de `recent_signals` (même lecture que la veille
  // d'un compte, la cloche et l'historique) ; ici seulement la projection
  // portefeuille (compte, score, logo).
  // LUDOVIC-D LC.2 — un signal d'homonyme déjà stocké n'entre pas au flux (Mes cibles, Laura) : masqué, jamais supprimé.
  return withoutHomonymSignals(readRecentSignals(row.recent_signals), row.website).map(signal => ({
    id: `${row.id}-signal-${signal.index}`,
    account_id: row.id,
    account_created_at: row.created_at,
    account_score: row.priority_score,
    company_name: row.company_name,
    date: signal.date,
    label: signal.label,
    sector: row.sector,
    source: signal.source,
    type: signal.type,
    // #3922.2 — l'URL de la source, ou `null` : jamais devinée.
    source_url: signal.source_url,
    source_kind: signal.source_kind,
    // #4182.5 — le demandeur d'une offre, tel que la collecte l'a lu (jamais recomposé ici).
    requester: signal.requester,
    // #4437.5 — son rattachement (compétence, famille, type de fait) ou `null` : jamais recomposé ici.
    offer_attachment: signal.offer_attachment,
    // #4756 — le lieu de l'offre (filtre « zone » de l'Historique), ou `null` : jamais deviné.
    location: signal.location,
    freshness: signal.freshness,
    // #1424 / #1423 — la lecture commerciale et de quoi reconnaître l'entreprise.
    sales_implication: signal.sales_implication,
    impact: signal.impact,
    logo_url: row.logo_url ?? null,
    website: row.website ?? null,
    signals_collected_at: row.signals_collected_at ? toIsoString(row.signals_collected_at) : null,
  }))
}

/** `timestamptz` → ISO string. The pg driver hands back a `Date` (or a string
 *  depending on the parser); anything unparseable becomes `null` rather than an
 *  "Invalid Date" the UI would have to guess about. */
function toIsoString(value: Date | string | null): string | null {
  if (value === null) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** Le `priority_score` lu en SQL brut, ou `null` quand il n'est pas lisible.
 *
 *  « Non mesuré » n'est pas « mesuré à zéro » : c'est `null` qui traverse, et
 *  la dérivation le traite exactement comme le faisait `priority_score >= …`
 *  sur un NULL SQL — le CASE tombait dans son ELSE, donc « à suivre ». */
function priorityScoreOf(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function compareAccountSignals(left: AccountSignalItem, right: AccountSignalItem): number {
  const scoreDifference = (right.account_score ?? -1) - (left.account_score ?? -1)
  if (scoreDifference !== 0) return scoreDifference
  return Date.parse(right.date ?? right.account_created_at) - Date.parse(left.date ?? left.account_created_at)
}

function toDashboardAccountInsight(row: DashboardAccountRow): DashboardAccountInsight {
  // #4044 — une offre de stage n'est jamais un signal : ni compté, ni « signal principal ».
  const signals = dropInternshipRows(row.recent_signals, { jobsOnly: true })
  return {
    id: row.id,
    company_name: row.company_name,
    sector: row.sector,
    employees: row.employees,
    priority_score: row.priority_score,
    priority_justification: row.priority_justification,
    status: row.status,
    created_at: row.created_at,
    // Logo réel Apollo + site (pour le favicon fallback d'affichage).
    logo_url: row.logo_url ?? null,
    website: row.website ?? null,
    // Count only ACTIVE (non-archived) signals so the Cockpit "nouveaux signaux"
    // matches the Veille and never counts a 2021 archive (Théo p.35/p.40).
    recent_signals_count: countActiveSignals(
      signals.map(s => ({ freshness: readSignalFreshness(s), date: readSignalPreview(s)?.date ?? null })),
      Date.now(),
    ),
    primary_signal: readSignalLabel(signals[0]),
  }
}

/** Stable sentinel value written into ``error_message`` when an analysis is
 *  cancelled by the user. The web layer matches on this exact string to render
 *  a "cancelled" banner instead of the generic "errored" banner. Re-uses the
 *  ``'error'`` status to dodge an enum migration. */
export const ANALYSIS_CANCELLED_MESSAGE = "Analyse annulée par l'utilisateur."

/** Stable sentinel written into ``error_message`` by the stuck-analysis reaper
 *  when a run is flipped to ``error`` because it stayed ``analyzing`` past the
 *  worker's job ceiling with no active BullMQ job (worker died mid-run: Redis
 *  eviction / Railway redeploy). The web layer matches this exact string to show
 *  a localized "analyse interrompue, relancez" banner (FR/EN) with a resume CTA
 *  instead of the generic failure copy. */
export const ANALYSIS_INTERRUPTED_MESSAGE = 'Analyse interrompue (délai dépassé). Relancez-la.'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

/**
 * Les clés de `raw_analysis` qu'un HUMAIN écrit, et que rien dans le pipeline
 * ne reproduit.
 *
 * Elles sont deux, et c'est un inventaire, pas un échantillon : `raw_analysis`
 * est le blob du pipeline, et tout ce qui vient d'une main a été hissé hors de
 * lui au fil du temps (`org_declared_people`, `org_rejected_items`,
 * `account_vocabulary`, `account_feedback`, `account_partners`) précisément
 * parce que chaque run réécrit le blob. Ces deux-là ne l'ont pas été.
 *
 * Écrites en snake_case parce que c'est la forme RÉELLEMENT stockée : tout le
 * blob traverse `toSnakeCaseKeys` avant d'atteindre la colonne.
 *
 * Le type de {@link AccountsService.appendRawAnalysisItem} en dérive : une clé
 * ajoutée ici est protégée sans que personne ait à y penser.
 */
const USER_AUTHORED_ANALYSIS_KEYS = ['user_plan_actions', 'user_attack_angles'] as const
type UserAuthoredAnalysisKey = (typeof USER_AUTHORED_ANALYSIS_KEYS)[number]

/** Default freshness window for the per-company result cache (C1). A completed
 *  dossier younger than this is served from cache instead of re-paying the full
 *  Brave + Firecrawl + Pappers + Claude run.
 *
 *  MUST stay strictly older than `TTL_FIRMO` (`apps/ia/app/services/provider_cache.py`,
 *  30 days), by an explicit margin — not just `> 30`. The guarantee this constant
 *  carries (agent_docs/caching.md §6.2) is that a forced re-run, triggered because
 *  this window expired, ALWAYS hits a provider cache that has already expired too —
 *  never one that is coincidentally as fresh (or as stale) as the dossier being
 *  refreshed. The two constants live in different languages that never import each
 *  other, so a bare `> TTL_FIRMO` here would silently start lying again the next time
 *  either side rounds its own number by a day. 37 = 30 + a full week (the cadence of
 *  `TTL_SIGNALS`, the next tier down in provider_cache.py) — enforced by
 *  `apps/ia/tests/test_cache_freshness_guarantee.py`, which reads BOTH constants and
 *  fails if the margin ever drops below 7 days. */
const CACHE_MAX_AGE_DAYS = 37

/** Ce que le rattachement fera — rendu tel quel avant ET après l'écriture. */
type AbsorbPreview = {
  absorbedName: string
  keptName: string
  movedContacts: number
  keptContacts: Array<{ id: string; fullName: string; reason: 'already_there' }>
  entityName: string
}

/** Chaque refus a sa phrase : un refus muet sur un geste irréversible fait
 *  recommencer. */
const ABSORB_REFUSAL_MESSAGES: Record<AbsorbRefusal, string> = {
  same_account: 'Un dossier ne peut pas être rattaché à lui-même.',
  already_merged: 'Ce dossier a déjà été rattaché à un autre — ce n’est plus un doublon.',
  target_merged: 'Le dossier visé a lui-même été rattaché ailleurs. Choisis le dossier qui a été gardé.',
  target_archived: 'On ne rattache pas à un dossier archivé : les deux se retrouveraient rangés.',
}

/** Ce que le détachement fera — rendu tel quel avant ET après l'écriture. */
type DetachPreview = {
  detachedName: string
  keptName: string
  returnedContacts: number
  keptContacts: Array<{ id: string; fullName: string; reason: 'name_taken' }>
}

/** Chaque refus a sa phrase. Celui du lien trop ancien EXPLIQUE : sans ça, un
 *  bouton grisé sans raison se lit comme une panne. */
const DETACH_REFUSAL_MESSAGES: Record<DetachRefusal, string> = {
  not_linked: 'Ce dossier n’est rattaché à aucun autre.',
  link_predates_reversal:
    'Ce rattachement est antérieur à l’enregistrement de l’état d’avant : le dossier ne peut pas être rendu à son statut sans l’inventer.',
}

/**
 * Un dossier vu depuis un lien de même groupe — l'un des deux bouts.
 *
 * `linkedAt` est `null` sur les liens posés avant la migration
 * `1790280000001` : la date est INCONNUE, jamais remplacée par celle de la
 * ligne ni par aujourd'hui, qui feraient passer un lien ancien pour récent.
 */
type LinkedAccountView = {
  id: string
  companyName: string
  status: string
  linkedAt: string | null
}

/**
 * Les deux sens du lien pour un compte, plus ce que le détachement autorise.
 *
 * `mergedInto` : le dossier auquel CELUI-CI a été rattaché.
 * `linked` : les dossiers rattachés à celui-ci.
 *
 * `detachRefusal` est calculé ICI et non côté écran : la règle du retour
 * arrière vit à UN seul endroit, sinon les deux chemins divergent au premier
 * ajustement.
 */
type AccountLinksView = {
  mergedInto: LinkedAccountView | null
  linked: LinkedAccountView[]
  detachRefusal: DetachRefusal | null
  detachRefusalMessage: string | null
}

type SignalHistoryRows = Awaited<ReturnType<SignalHistoryService['listForWorkspace']>>

/**
 * #3219 (#190.2, lot P02 07/10) — ce que `AccountsService.applyResearch` rend
 * à journaliser au titre d'une PORTÉE déclarée (`pipelineFieldScopeClaim`).
 * `employeesScopeClaim` absente = rien à journaliser (pas de `scopeMode`
 * déclaré pour ce run, ou valeur inchangée) — jamais une claim inventée.
 */
type ApplyResearchResult = {
  employeesScopeClaim?: { oldValue: string | null; newValue: string; scope: string }
}

/** #4616 — la réponse de `IaClient.groupAffiliation`, lue avant la transaction. */
type GroupAffiliation = NonNullable<Awaited<ReturnType<IaClient['groupAffiliation']>>>

@Injectable()
export class AccountsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AccountsService.name)

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly ia: IaClient,
    private readonly workspaceContext: WorkspaceContextService,
    // Scoring hybride « comptes similaires » (addendum Théo) : le profil vendeur
    // est résolu server-side — le front n'envoie jamais le profil.
    private readonly esnProfile: EsnProfileReader,
    // Historique de signal (V2 §11). `@Optional()` : le module signal-history est
    // autonome (règle #7) — sans lui la Veille liste toujours les signaux, sans
    // les dates « détecté le … ».
    @Optional() private readonly signalHistory?: SignalHistoryService,
    // Les ESN détectées par l'analyse (tome 1 §14). On injecte le REPOSITORY et
    // non `PartnersService` : la règle de mapping est pure et vit dans
    // `@bellum/contracts` (`detectedPartnersFrom`), donc il n'y a rien à aller
    // chercher dans l'autre module — et GA-07 ne monte pas.
    @Optional()
    @InjectRepository(AccountPartnerEntity)
    private readonly accountPartners?: Repository<AccountPartnerEntity>,
    // Les faits d'accès déduits de la commande publique. Même raisonnement que
    // ci-dessus : le REPOSITORY, pas le service du module `account-access` —
    // la règle de déduction est pure (`lockFactFromAwards`), il n'y a rien à
    // aller chercher ailleurs.
    @Optional()
    @InjectRepository(AccessFactEntity)
    private readonly accessFacts?: Repository<AccessFactEntity>,
    // La provenance des champs de fiche. Même raisonnement que les deux
    // injections ci-dessus : le REPOSITORY et non `ProvenanceService`, parce que
    // la règle d'arbitrage est PURE et vit dans `@bellum/contracts`
    // (`applyFieldUpdates`) — il n'y a rien à aller chercher dans l'autre
    // module, et GA-07 ne monte pas.
    //
    // `@Optional()` est sans danger ici : sans cette table, aucune correction
    // humaine n'est ENREGISTRÉE, donc il n'y a rien à protéger.
    @Optional()
    @InjectRepository(FieldProvenanceEntity)
    private readonly fieldProvenance?: Repository<FieldProvenanceEntity>,
    // Le journal d'activité, pour y consigner « affaire signée » au passage d'un
    // compte en client. `UserActionEntity` est DÉJÀ déclaré au `forFeature` du
    // module (la timeline unifiée le lit) : l'injection est donc réellement
    // servie au boot, et non silencieusement `undefined` — c'est la condition
    // que GA-20 vérifie. `@Optional()` et en DERNIER pour la même raison que les
    // repositories ci-dessus : les specs qui construisent le service par `new`
    // n'ont pas à changer, et son absence ne fait perdre qu'une trace.
    @Optional()
    @InjectRepository(UserActionEntity)
    private readonly userActions?: Repository<UserActionEntity>,
    /**
     * #2150.14/.18 — LE FAVORI DE COMPTE, RÉTABLI (revirement assumé de #1800).
     *
     * `@Optional()` et en DERNIÈRE position, pour la même raison que les
     * repositories ci-dessus : une vingtaine de specs construisent ce service
     * par `new`, positionnellement, et son absence ne doit leur coûter qu'un
     * favori qui ne se pose plus — jamais un plantage au boot.
     */
    @Optional()
    @InjectRepository(UserFavoriteEntity)
    private readonly userFavorites?: Repository<UserFavoriteEntity>,
    /**
     * #2127.37 — LE REPOSITORY DES SUGGESTIONS MASQUÉES.
     *
     * `@Optional()` et en DERNIÈRE position, même raison que les repositories
     * ci-dessus : les specs qui construisent ce service par `new` n'ont pas à
     * changer, et son absence ne fait perdre que le filtre — `listSimilarToAccount`
     * rend alors exactement ce qu'il rendait avant ce lot, jamais une erreur.
     */
    @Optional()
    @InjectRepository(SimilarAccountDismissalEntity)
    private readonly similarAccountDismissals?: Repository<SimilarAccountDismissalEntity>,
    /**
     * #2151.59 — la reprise des notes candidat à la conversion. `@Optional()`
     * et en DERNIÈRE position, même raison que ci-dessus : son absence ne
     * coûte qu'une note qui reste sur le candidat au lieu de suivre le
     * compte — jamais un plantage à la création. GA-07 (18/09/2026) : émet
     * sur `AccountClaimBus`, ne connaît plus `DiscoverCandidateNotesService`.
     */
    @Optional() private readonly accountClaims?: AccountClaimBus,
    /**
     * #3671 — les retours « faux » / « obsolète » du dossier, lus à
     * l'actualisation pour qu'un fait corrigé ne revienne pas tel quel.
     * `@Optional()` et en DERNIÈRE position : sans lui, `applyResearch` écrit
     * exactement ce qu'il écrivait avant (no-op strict).
     */
    @Optional()
    @InjectRepository(AccountFeedbackEntity)
    private readonly accountFeedback?: Repository<AccountFeedbackEntity>,
    /**
     * #4070.1 — le lecteur unique des faits du compte (porte `ACCOUNT_FACTS_READER`, GA-07) : « pourquoi
     * maintenant » des comptes de « maintenant » lit l'historique décoté. `@Optional()` et en DERNIÈRE
     * position : sans lui, la répartition est byte-identique à avant.
     */
    @Optional() @Inject(ACCOUNT_FACTS_READER) private readonly accountFacts?: AccountFactsReader,
  ) {}

  /**
   * Reprend les dossiers déjà analysés au démarrage, une fois.
   *
   * En arrière-plan et sans jamais retarder le boot : une reprise de données ne
   * doit pas pouvoir empêcher l'API de répondre. Kill-switch
   * `PARTNERS_BACKFILL_DISABLED=true` — le geste d'urgence si la reprise devait
   * peser sur une base bien plus grande que celles d'aujourd'hui.
   */
  onApplicationBootstrap(): void {
    if (killSwitchCut('accounts.partners_backfill')) return
    void this.backfillDetectedPartners().catch(error => this.logger.warn('backfillDetectedPartners failed', { error }))
  }

  /**
   * Returns the workspace's accounts, optionally filtered/sorted server-side.
   * Multi-user Phase 2: the browser-facing portfolio list is a team-scoped read
   * — scoped by `workspace_id` (resolved by the controller from the caller's JWT
   * via {@link WorkspaceContextService}) instead of `user_id`, so every member
   * sees the whole team's accounts. Identical to the old per-user scoping today
   * (1 user = 1 workspace, `workspace_id` backfilled 1:1 from the owner). Each
   * row keeps `user_id` as created-by attribution. See
   * `agent_docs/multi-user-workspaces.md`.
   * - `q` → ILIKE on `company_name` **ou** `sector` (#1316.3 — « banque » est
   *   affiché dans la liste ET filtrable à part, mais la barre ne le cherchait
   *   pas), **ou** le SIREN / SIRET d'une des entités du compte (31/08/2026 —
   *   la barre annonçait « SIREN… » et ne cherchait que le nom, donc rendait
   *   zéro résultat sur un numéro de facture)
   * - `entityKind` → le compte porte-t-il une entité de ce type ? (`EXISTS`)
   * - `status` → equality (`'all'` ≡ no filter)
   * - `sort` → `${field}_${dir}` mapped via `SORT_MAP` (default `date_desc`)
   *
   * The `q` ILIKE is fast at our scale (< 10k rows/workspace); a `pg_trgm`
   * index on `company_name` accelerates it further (cf. migration
   * `1779004800000-FilterIndexes`).
   */
  /**
   * #1633 / #1635 — LE PORTEFEUILLE, RÉDUIT À CE QUI SERT À LE RAPPROCHER DU CORPUS.
   *
   * ⚠️ MÊME POPULATION QUE `findAccountsByWorkspace`, ET C'EST LE POINT.
   *
   * C'est la leçon de #1408, mot pour mot : « Mes comptes » filtrait sur le
   * CRÉATEUR pendant que `/comptes` filtrait sur le RESPONSABLE — deux
   * populations, deux vérités, et le même mot pour les deux. Un agrégat qui
   * annoncerait « 62 comptes » quand la liste en montre 58 refait la faute d'un
   * cran plus haut, et personne ne saurait lequel des deux nombres croire.
   *
   * D'où : le MÊME `workspace_id`, le MÊME cloisonnement `scope`, la MÊME
   * exclusion des supprimés. Ce qui change est la PROJECTION — quatre colonnes
   * au lieu de quarante — et l'absence de pagination : un agrégat porte sur
   * tout le portefeuille, ou il ne porte sur rien.
   */
  /**
   * LE CLOISONNEMENT DE PÉRIMÈTRE, appliqué à la requête — et à UN seul endroit.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * TROIS PROPRIÉTÉS, ET CE QUE CHACUNE ÉVITE
   * ─────────────────────────────────────────────────────────────────────────
   * 1. `andWhere`, jamais `where` : la borne d'espace posée plus haut SURVIT.
   *    Un `where` ici l'écraserait et ouvrirait tous les espaces d'un coup —
   *    c'est le risque n°1 nommé au brief du lot.
   * 2. `OR business_unit_id IS NULL` : un compte sans BU reste visible. Sans
   *    cette moitié, tout le portefeuille historique disparaîtrait pour chaque
   *    membre cloisonné le jour du déploiement.
   * 3. Une liste VIDE ne rend pas la clause muette : elle la rend
   *    `business_unit_id IS NULL`. « Il ne porte aucun périmètre » n'est pas
   *    « il voit tout » — et `IN (:...ids)` sur un tableau vide lève de toute
   *    façon côté TypeORM, ce qui aurait transformé la faute en 500.
   *
   * Une seule méthode pour les deux requêtes : la liste et l'agrégat ne peuvent
   * pas diverger, ce qui est exactement la faute déjà payée entre `/comptes` et
   * ses compteurs.
   */
  private applyBusinessUnitScope(
    qb: { andWhere: (clause: string, params?: Record<string, unknown>) => unknown },
    businessUnitScope: BusinessUnitScopeClause,
  ): void {
    // ⚠️ La FORME de la clause ne s'écrit plus ici : elle vit dans
    // `business-unit-scope.clause.ts`, parce que le DÉTAIL d'un compte
    // l'applique aussi, en SQL brut. Deux écritures de la même règle, c'est la
    // garantie qu'un jour l'une perdra son « OU sans périmètre » (GA-26).
    const clause = businessUnitScopeClause(businessUnitScope, 'account.business_unit_id', ':...businessUnitIds')
    if (!clause) return
    const ids = businessUnitScope?.businessUnitIds ?? []
    if (ids.length === 0) {
      qb.andWhere(clause)
      return
    }
    qb.andWhere(clause, { businessUnitIds: [...ids] })
  }

  /**
   * RATTACHER un compte à un périmètre, ou l'en DÉTACHER (#2081.10).
   *
   * ⚠️ Le `UPDATE` porte les DEUX bornes — `id` ET `workspace_id`. Sans la
   * seconde, un identifiant de compte deviné réattribuerait un compte d'un
   * autre espace, et l'appelant ne verrait qu'un « ok ». Le compte de lignes
   * touchées est LU (`affected`), parce qu'un `UPDATE` qui ne touche rien est
   * un succès pour Postgres et une erreur pour l'utilisateur.
   *
   * ⚠️ L'appartenance du PÉRIMÈTRE à l'espace se vérifie chez l'appelant
   * (`BusinessUnitService.findInWorkspace`) : ce service ne connaît pas la
   * table des BU, et GA-07 interdit qu'il aille la chercher.
   */
  async assignBusinessUnit(workspaceId: string, accountId: string, businessUnitId: string | null): Promise<void> {
    if (!workspaceId || !accountId) {
      throw new Error('assignBusinessUnit: workspaceId et accountId sont requis')
    }
    const result = await this.accounts
      .createQueryBuilder()
      .update()
      .set({ business_unit_id: businessUnitId })
      .where('id = :accountId', { accountId })
      .andWhere('workspace_id = :workspaceId', { workspaceId })
      .execute()
    if (!result.affected) throw new NotFoundException('account_not_found')
  }

  /**
   * #2259.32 — LE NOMBRE DE COMPTES RATTACHÉS À UNE BU, un COMPTE, jamais une
   * liste (DÉCISION Louis 17/09 après-midi : la BU est un CONTEXTE pour
   * Laura, elle ne filtre rien).
   *
   * ⚠️ Les DEUX bornes, comme `assignBusinessUnit` ci-dessus : `workspace_id`
   * ET `business_unit_id`. Sans la première, une BU devinée d'un autre espace
   * compterait des comptes qui n'y appartiennent pas.
   *
   * `0` est une MESURE réelle (une BU peut réellement n'avoir aucun compte) —
   * à ne jamais confondre avec l'absence de rattachement (consultants,
   * références : #2259.33/.34, aucune colonne de BU n'existe pour eux, donc
   * l'appelant y met `null`, jamais `0`).
   */
  async countByBusinessUnit(workspaceId: string, businessUnitId: string): Promise<number> {
    return this.accounts.count({ where: { workspace_id: workspaceId, business_unit_id: businessUnitId } })
  }

  async listPortfolioLookups(
    workspaceId: string,
    scope: { ownerId: string; includeUnassigned: true } | null = null,
    /** Même cloisonnement que la liste, pour la même raison : un agrégat qui
     *  compterait plus de comptes que la liste n'en montre laisserait deux
     *  nombres vrais et personne pour savoir lequel croire. */
    businessUnitScope: { businessUnitIds: readonly string[]; includeUnassigned: true } | null = null,
  ): Promise<{ id: string; company_name: string; website: string | null; registry_country: string | null }[]> {
    const qb = this.accounts
      .createQueryBuilder('account')
      .select([
        'account.id AS id',
        'account.company_name AS company_name',
        'account.website AS website',
        'account.registry_country AS registry_country',
      ])
      .where('account.workspace_id = :workspaceId', { workspaceId })
      .andWhere('account.status <> :deletedStatus', { deletedStatus: DELETED_ACCOUNT_STATUS })

    if (scope) {
      // « Ce que je porte, OU ce que personne ne porte, OU dont je suis
      // co-équipier » — `portfolioScopeClause`, la même que la liste (un compte
      // libre que personne ne voit est un compte que personne ne travaille).
      qb.andWhere(portfolioScopeClause('account'), { ownerId: scope.ownerId })
    }

    this.applyBusinessUnitScope(qb, businessUnitScope)

    return qb.getRawMany<{
      id: string
      company_name: string
      website: string | null
      registry_country: string | null
    }>()
  }

  /**
   * #2145.9 / #2100.9 — le job d'analyse EN COURS, mis en avant sur Aujourd'hui.
   *
   * Même cloisonnement que {@link listPortfolioLookups} : ce que je porte, ou ce
   * que personne ne porte. `updated_at` marque le passage à `analyzing`
   * (`accounts.service.ts`, transition gardée) — c'est DEPUIS QUAND le job
   * tourne, jamais une estimation de fin (aucune probabilité, doctrine).
   * Bornée à 3 : Aujourd'hui met en avant, il ne liste pas un second Portefeuille.
   */
  async listActiveAnalysisRuns(
    workspaceId: string,
    scope: { ownerId: string; includeUnassigned: true } | null = null,
    businessUnitScope: { businessUnitIds: readonly string[]; includeUnassigned: true } | null = null,
  ): Promise<{ id: string; company_name: string; started_at: string }[]> {
    const qb = this.accounts
      .createQueryBuilder('account')
      .select(['account.id AS id', 'account.company_name AS company_name', 'account.updated_at AS started_at'])
      .where('account.workspace_id = :workspaceId', { workspaceId })
      .andWhere('account.status = :status', { status: 'analyzing' })

    if (scope) {
      qb.andWhere(portfolioScopeClause('account'), { ownerId: scope.ownerId })
    }
    this.applyBusinessUnitScope(qb, businessUnitScope)

    return qb.orderBy('account.updated_at', 'ASC').limit(3).getRawMany<{
      id: string
      company_name: string
      started_at: string
    }>()
  }

  async findAccountsByWorkspace(
    workspaceId: string,
    filters: AccountListQuery = {},
    /**
     * Le cloisonnement de portefeuille (décision D5), calculé par la fonction
     * pure `portfolioScopeFor`. `null` = tout l'espace, le défaut historique.
     *
     * Passé en paramètre plutôt que relu ici : la règle de visibilité se
     * décide UNE fois, au bord, et une requête de quarante lignes n'est pas un
     * endroit où l'on peut vérifier à l'œil qui voit quoi.
     */
    scope: { ownerId: string; includeUnassigned: true } | null = null,
    /**
     * #1575.1 — LES COMPTES COUVERTS PAR LA MÉMOIRE MARCHÉ, DÉJÀ RÉSOLUS.
     *
     * La couverture n'est pas une expression SQL : c'est l'arbitrage
     * `resolveMarketCompany`, en TypeScript, sur les tables d'un AUTRE module
     * (GA-07 est au plafond). Ce service ne peut donc pas la calculer — il la
     * reçoit du contrôleur, qui compose les deux modules.
     *
     * ⚠️ `[]` n'est PAS « pas de filtre » : c'est « aucun compte n'est couvert »,
     * et la réponse juste est alors zéro ligne. `undefined` avec
     * `filters.marketCovered === 'covered'` est une ERREUR d'appelant, pas un
     * défaut : servir tout le portefeuille sous un libellé qui promet le
     * contraire est pire qu'une erreur visible. Les deux autres appelants de
     * cette méthode (API publique, MCP) ne savent rien de la mémoire marché ;
     * c'est cette exception qui les empêche de la promettre en silence.
     */
    marketCoveredIds: readonly string[] | undefined = undefined,
    /**
     * LE CLOISONNEMENT DE PÉRIMÈTRE (BU / agence), calculé par la fonction pure
     * `businessUnitScopeFor` (#2005.9, #2005.12, #2081.17, #2081.20).
     *
     * `null` = tout l'espace, le défaut historique et celui de toute ligne
     * `workspace_members` après la migration `1793710000000-BusinessUnits`.
     *
     * ⚠️ Il s'AJOUTE à la borne d'espace, il ne la remplace jamais. Le `where`
     * ci-dessus reste `account.workspace_id = :workspaceId` en toutes
     * circonstances ; c'est ce que `business-unit-scope.spec.ts` mesure, parce
     * qu'une jointure qui aurait remplacé la borne aurait l'air juste à
     * l'écran tout en ouvrant l'espace entier.
     *
     * Avant-dernier paramètre, et optionnel : les appelants qui ne le passent
     * pas (API publique, MCP) conservent une requête BYTE-IDENTIQUE.
     */
    businessUnitScope: { businessUnitIds: readonly string[]; includeUnassigned: true } | null = null,
    /**
     * #2150.14/.15/.18 — L'IDENTITÉ DE L'APPELANT, POUR DEUX FILTRES PERSONNELS.
     *
     * `favorite: 'mine'` et `ownership: 'teammate'` répondent tous les deux à
     * une question qui dépend de QUI regarde — le premier « est-ce MON
     * favori ? », le second « est-ce le compte de QUELQU'UN D'AUTRE que
     * moi ? ». Ni l'un ni l'autre ne se calcule sans cette identité, y compris
     * quand `scope` est `null` (visibilité `'open'`, où le portefeuille
     * n'exclut personne). Passé en dernier et optionnel pour la même raison
     * que `marketCoveredIds` plus haut : les deux autres appelants de cette
     * méthode (API publique, MCP) ne le fournissent pas aujourd'hui.
     */
    currentUserId?: string,
  ): Promise<AccountListResponse> {
    if (filters.marketCovered === 'covered' && marketCoveredIds === undefined) {
      throw new Error(
        'findAccountsByWorkspace: `marketCovered: "covered"` exige la liste des comptes couverts — ' +
          'ce service ne sait pas la calculer (mémoire marché, autre module).',
      )
    }
    if (filters.favorite === 'mine' && !currentUserId) {
      throw new Error(
        "findAccountsByWorkspace: `favorite: 'mine'` exige l'identifiant de l'appelant — " +
          'ce filtre est personnel et ne peut pas se calculer sans lui.',
      )
    }
    if (filters.ownership === 'teammate' && !currentUserId) {
      throw new Error(
        "findAccountsByWorkspace: `ownership: 'teammate'` exige l'identifiant de l'appelant — " +
          'ce filtre exclut SES PROPRES comptes et ne peut pas se calculer sans lui.',
      )
    }
    if (filters.ownership === 'mine' && !currentUserId) {
      throw new Error(
        "findAccountsByWorkspace: `ownership: 'mine'` exige l'identifiant de l'appelant — " +
          'ce filtre dit « mes comptes » et ne peut pas se calculer sans lui.',
      )
    }
    try {
      const sort = SORT_MAP[filters.sort ?? 'date_desc']

      const qb = this.accounts
        .createQueryBuilder('account')
        .where('account.workspace_id = :workspaceId', { workspaceId })

      if (scope) {
        // « Ce que je porte, OU ce que personne ne porte, OU dont je suis co-équipier
        // actif » (`portfolioScopeClause`, une seule définition). La seconde moitié
        // n'est pas une largesse : sans elle, les comptes libres disparaissent
        // pour tout le monde sauf les responsables, et un compte que personne
        // ne voit est un compte que personne ne travaille.
        qb.andWhere(portfolioScopeClause('account'), { ownerId: scope.ownerId })
      }

      this.applyBusinessUnitScope(qb, businessUnitScope)

      // #3666.3 (recette prod 09/10, écriture) — un compte EN COURS D'ANALYSE
      // n'a, lui non plus, aucune date de fin : `NULLS LAST` l'envoyait donc à
      // la fin de la liste, hors de la première page — alors qu'il n'est pas
      // « sans actualité », son actualité est justement EN COURS. Seul le tri
      // PAR DÉFAUT (aucun `sort` explicite demandé) le fait remonter en tête ;
      // un tri explicite par date/score/nom reste celui que la personne a choisi.
      const isDefaultSort = (filters.sort ?? 'date_desc') === 'date_desc'
      if (isDefaultSort) {
        qb.orderBy(`(account.status = 'analyzing')`, 'DESC').addOrderBy(sort.expression, sort.direction, 'NULLS LAST')
      } else if (filters.sort === 'score_asc' || filters.sort === 'score_desc') {
        // SIMON-FIX S.19 — le nombre AFFICHÉ (/25) d'abord ; `priority_score` (/10) puis l'id départagent.
        qb.orderBy(LIST_SCORE_25_SQL, sort.direction, 'NULLS LAST').addOrderBy(
          sort.expression,
          sort.direction,
          'NULLS LAST',
        )
      } else {
        qb.orderBy(sort.expression, sort.direction, 'NULLS LAST')
      }
      qb
        // `NULLS LAST` dans LES DEUX sens : un compte sans analyse terminée
        // affiche « — ». Le remonter en tête d'un tri croissant reviendrait à
        // le déclarer « le plus ancien », alors qu'il n'a simplement pas de
        // date. Non datable se range à la fin, pas au début.
        //
        // #4054.2 — les comptes SANS date d'analyse (importés, jamais analysés)
        // restent entre eux du plus récent au plus ancien : un import du jour
        // est en tête de ce groupe, pas enfoui au hasard de l'id.
        .addOrderBy('account.created_at', 'DESC')
        // Départage stable : sans lui, deux comptes de même date peuvent
        // permuter entre deux pages et l'un d'eux disparaît du défilement.
        .addOrderBy('account.id', 'ASC')

      // #4498.a — chaque axe se coche à plusieurs ; `[]` (ou « Tous ») = pas de filtre sur l'axe.
      const statuses = pickedValues(filters.status)
      const lifecycles = pickedValues(filters.lifecycle)
      if (!statuses.includes(DELETED_ACCOUNT_STATUS)) {
        qb.andWhere('account.status <> :deletedStatus', { deletedStatus: DELETED_ACCOUNT_STATUS })
      }
      // #4053 — un compte rangé (import annulé, doublon écarté) n'est pas listé,
      // recherche `q` comprise ; seul un filtre « Archivés » explicite le ramène.
      if (!statuses.includes('archived') && !lifecycles.includes('archived')) {
        qb.andWhere("account.status <> 'archived'")
      }
      if (filters.q) {
        // ─────────────────────────────────────────────────────────────────────
        // CHERCHER PAR IDENTIFIANT LÉGAL, PAS SEULEMENT PAR NOM (31/08/2026)
        // ─────────────────────────────────────────────────────────────────────
        // La maquette met « SIREN… » dans le placeholder du champ, et la barre
        // ne cherchait que `company_name` : taper le SIREN d'un client rendait
        // ZÉRO résultat, ce qui se lit « ce client n'existe pas » et pousse à
        // le recréer en double. C'est le geste d'un ops qui a une facture sous
        // les yeux — il a le numéro, pas l'orthographe du groupe.
        //
        // Les identifiants vivent sur `account_entities` (une facture part à
        // une personne morale, pas à un périmètre commercial), d'où un EXISTS
        // plutôt qu'une jointure : un compte à trois filiales ne doit pas
        // apparaître trois fois, et un `DISTINCT` sur la liste entière casserait
        // le tri par score.
        //
        // ⚠️ Les séparateurs de saisie sont retirés du CÔTÉ COLONNE comme du
        // côté requête : « 420 624 777 » et « 420624777 » désignent le même
        // SIREN, et une recherche qui ne trouve que l'une des deux graphies est
        // une recherche cassée pour la moitié des gens. Le SIREN est stocké
        // libre (une entité étrangère n'en a pas), donc c'est ici qu'on
        // normalise — le SIRET, lui, est déjà normalisé à l'écriture.
        //
        // ⚠️ QUAND la branche « identifiant » s'ouvre, et pourquoi pas toujours :
        // la saisie doit être ENTIÈREMENT numérique une fois ses séparateurs
        // retirés, et compter au moins trois chiffres. « TF1 » n'est pas une
        // recherche de SIREN — l'ouvrir sur n'importe quelle saisie contenant un
        // chiffre ferait remonter, en plus du bon compte, tous ceux dont un
        // SIREN contient « 1 ». Un OR n'enlève jamais de résultat, il en AJOUTE
        // de faux, et une liste qui répond trop est aussi inutile qu'une liste
        // qui ne répond pas.
        const digits = identifierQuery(filters.q)
        if (digits) {
          qb.andWhere(
            `(account.company_name ILIKE :q OR EXISTS (
                SELECT 1 FROM account_entities ae
                 WHERE ae.account_id = account.id
                   AND (
                     regexp_replace(COALESCE(ae.siren, ''), '[^0-9]', '', 'g') LIKE :digitsLike
                     OR COALESCE(ae.siret, '') LIKE :digitsLike
                   )
              ))`,
            { q: `%${filters.q}%`, digitsLike: `%${digits}%` },
          )
        } else {
          // #1316.3 — « Rechercher un compte, un secteur ou un mot-clé ».
          //
          // La barre ne cherchait que le NOM. Taper « banque » ne rendait rien
          // alors que le secteur est une colonne de la liste et un filtre à
          // part entière : l'utilisateur voit le mot à l'écran, le tape, et
          // obtient zéro résultat. Le secteur rejoint donc le nom — c'est la
          // même correction que celle du 31/08 sur le SIREN, où la barre
          // annonçait ce qu'elle ne cherchait pas.
          //
          // ⚠️ Le secteur, PAS un plein texte : un OR n'enlève jamais de
          // résultat, il en ajoute de faux, et une liste qui répond trop est
          // aussi inutile qu'une liste qui ne répond pas.
          qb.andWhere(`(account.company_name ILIKE :q OR account.sector ILIKE :q OR ${SIGNAL_SUBJECT_MATCH_SQL})`, {
            q: `%${filters.q}%`,
          })
        }
      }
      const entityKinds = pickedValues(filters.entityKind)
      if (entityKinds.length > 0) {
        // LE TYPE D'ORGANISATION de la maquette, dit dans NOTRE vocabulaire : un
        // compte n'a pas de type, ses entités en ont un. Un compte est retenu
        // dès qu'UNE de ses entités porte le type demandé — sinon un groupe
        // disparaîtrait de « filiales » parce que sa seconde division est une BU.
        qb.andWhere(
          `EXISTS (SELECT 1 FROM account_entities ae
                    WHERE ae.account_id = account.id AND ae.kind IN (:...entityKinds))`,
          { entityKinds },
        )
      }
      if (statuses.length > 0) {
        qb.andWhere('account.status IN (:...statuses)', { statuses })
      }
      if (filters.reusableOnly) {
        // #3184.1 (recette prod 30/09) — « déjà connu » ≠ « terminé » : un
        // compte dont l'analyse s'est interrompue porte déjà ses contacts
        // (`saveContacts` écrit avant que `savePlan` ne bascule `status` à
        // `completed`, `analysis.worker.ts`) — l'exclure répondrait « aucun
        // compte ni contact » pour une donnée qui existe réellement.
        qb.andWhere(
          `(account.status = 'completed' OR EXISTS (
              SELECT 1 FROM contacts c WHERE c.account_id = account.id
            ))`,
        )
      }
      if (lifecycles.length > 0) {
        // Onglets « À suivre » / « Opportunités » (Théo p.39) : tri COMMERCIAL,
        // distinct du `status` d'analyse. Legacy rows sans colonne = NULL →
        // traités comme 'inbox' via COALESCE. On exclut les comptes retirés du
        // pipe (analyse archived/deleted, ex. doublon SIREN auto-archivé) sauf
        // sur l'onglet « Écartés » lui-même, pour qu'un doublon archivé ne
        // ré-apparaisse pas dans « Opportunités ».
        qb.andWhere("COALESCE(account.commercial_status, 'inbox') IN (:...lifecycles)", { lifecycles })
        if (!lifecycles.includes('archived')) {
          qb.andWhere("account.status NOT IN ('archived', 'deleted')")
        } else if (lifecycles.length > 1) {
          // « Écartés » + une autre relation : l'écarté vient avec son statut, les autres sans les retirés du pipe.
          qb.andWhere(
            "(COALESCE(account.commercial_status, 'inbox') = 'archived' OR account.status NOT IN ('archived', 'deleted'))",
          )
        }
      }
      const gates = pickedValues(filters.gate)
      if (gates.length > 0) {
        // La porte de PRIORITÉ (G1), axe distinct du cycle commercial juste
        // au-dessus : un client peut être mis en veille sans cesser d'être
        // client. C'est ce filtre qui rend enfin lisible « ce que j'ai écarté,
        // et pourquoi » — le motif et la date étaient en base depuis le 19/08
        // et ne se lisaient sur aucun écran.
        // `pending` couvre aussi les comptes jamais soumis à la porte : NULL
        // n'est pas un état décidé, et le ranger ailleurs ferait croire que
        // quelqu'un a tranché.
        const decidedGates = gates.filter(gate => gate !== 'pending')
        const pendingClause = "COALESCE(account.priority_gate, 'pending') = 'pending'"
        if (decidedGates.length === 0) {
          qb.andWhere(pendingClause)
        } else if (decidedGates.length === gates.length) {
          qb.andWhere('account.priority_gate IN (:...gates)', { gates: decidedGates })
        } else {
          qb.andWhere(`(${pendingClause} OR account.priority_gate IN (:...gates))`, { gates: decidedGates })
        }
      }
      const sectors = pickedValues(filters.sector).map(sector => `%${sector}%`)
      if (sectors.length > 0) {
        qb.andWhere('account.sector ILIKE ANY (CAST(:sectors AS text[]))', { sectors })
      }
      // #2159.26 — graphie de la première saisie (décision Louis 19/09) : les
      // étiquettes ne sont plus stockées en minuscules, donc le filtre compare
      // par CLÉ (`tagKey`, insensible à la casse), pas par containment `@>`
      // exact — « SAP » tapé à l'écran retrouve « sap » posé par l'import.
      const tagKeys = pickedValues(filters.tag)
        .map(raw => normalizeTag(raw))
        .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag))
        .map(tag => tagKey(tag))
      if (tagKeys.length > 0) {
        qb.andWhere(
          'EXISTS (SELECT 1 FROM unnest(account.tags) AS ft(tag) WHERE lower(ft.tag) = ANY (CAST(:tagKeys AS text[])))',
          { tagKeys },
        )
      }
      const scores = pickedValues(filters.score)
      if (scores.length > 0) {
        // Mapping `priority_score` → bucket. Les NULL sont exclus de tous
        // les buckets (pas de score connu = on ne sait pas le classer).
        //
        // Les coupures viennent du contrat (GA-56) : c'est la MÊME bande que le
        // badge GO / PRUDENT / NO-GO. Filtrer « chaud » sur une coupure et
        // colorer sur une autre rendrait une liste dont les pilules démentent
        // le filtre qui vient de la produire.
        const bands = scores.map(score => {
          if (score === 'high') return `account.priority_score >= ${ACCOUNT_SCORE_GO_MIN}`
          if (score === 'medium')
            return `(account.priority_score >= ${ACCOUNT_SCORE_PRUDENT_MIN} AND account.priority_score < ${ACCOUNT_SCORE_GO_MIN})`
          return `account.priority_score < ${ACCOUNT_SCORE_PRUDENT_MIN}`
        })
        // Plusieurs paliers = en OU. Les coupures sont des constantes du contrat (nombres), jamais une saisie.
        qb.andWhere(bands.length === 1 ? (bands[0] ?? '1 = 0') : `(${bands.join(' OR ')})`)
      }
      // #1580 — le clic sur une métrique DÉCISIONNELLE du bandeau de tête
      // filtre la liste, sur le MÊME prédicat que celui qui la compte.
      if (filters.headline) {
        qb.andWhere(HEADLINE_FILTER_PREDICATE[filters.headline])
      }
      // #4498.c — les preuves du compte, TOUJOURS bornées au même espace que le compte.
      if (filters.documentedHistory === 'with' || filters.documentedHistory === 'without') {
        qb.andWhere(
          `${filters.documentedHistory === 'without' ? 'NOT ' : ''}EXISTS (SELECT 1 FROM proofs pr WHERE pr.account_id = account.id AND pr.workspace_id = account.workspace_id)`,
        )
      }
      if (filters.authorizedReferences === 'only') {
        qb.andWhere(
          'EXISTS (SELECT 1 FROM proofs pr WHERE pr.account_id = account.id AND pr.workspace_id = account.workspace_id AND pr.citation_allowed = true)',
        )
      }
      // #2150.13 — la vue « À actualiser ». La MÊME date que la colonne affichée
      // (`LAST_ANALYZED_SQL`) et le MÊME seuil que la pastille de ligne, qui
      // s'allume quand `floor(jours) > ACCOUNT_STALE_AFTER_DAYS`, soit au moins
      // N + 1 jours pleins. Un compte non daté rend NULL et n'entre pas :
      // « non daté » n'est pas « périmé ».
      if (filters.freshness === 'stale') {
        qb.andWhere(`${LAST_ANALYZED_SQL} <= NOW() - make_interval(days => ${ACCOUNT_STALE_AFTER_DAYS + 1})`)
      }
      // #2150.14/.18 — « MES FAVORIS » : restreint aux comptes que L'APPELANT a
      // personnellement mis en favori (table `user_favorites`, revirement
      // assumé de #1800 — retour bêta #2150, Louis 15/09/2026). Le prédicat
      // porte sur `currentUserId`, jamais sur le workspace : deux membres
      // d'une même ESN ne voient jamais les favoris l'un de l'autre — voir
      // `UserFavoriteEntity`. Le paramètre est lié dès que `currentUserId` est
      // connu (pas seulement quand ce filtre est demandé) : la colonne
      // `is_favorite` du SELECT, plus bas, en a besoin pour CHAQUE ligne.
      if (currentUserId) {
        qb.setParameter('favoriteUserId', currentUserId)
      }
      // #4526.2 — « MON CRM » : un AND de plus sur la requête, qui garde espace et visibilité. Calculé à la
      // lecture ; `origin` n'est jamais écrit (garde `account.entity.ts`, « origine rétroactive »).
      if (filters.crm === 'only') {
        qb.andWhere(CRM_LINKED_ACCOUNT_PREDICATE)
      }
      // #4597.1 — « IMPORTÉS » : la vue des comptes venus d'un fichier. Un AND de plus, jamais un retrait du portefeuille.
      if (filters.imported === 'only') {
        qb.andWhere(IMPORTED_ACCOUNT_PREDICATE)
      }
      // #4597.3 — « voir les N comptes de CET import » : l'identifiant du job, jamais sa date. L'espace est déjà posé.
      if (filters.importJob) {
        qb.andWhere('account.import_job_id = :importJob', { importJob: filters.importJob })
      }
      if (filters.favorite === 'mine') {
        qb.andWhere(
          `EXISTS (SELECT 1 FROM ${USER_FAVORITES_TABLE} f
                    WHERE f.entity_type = 'account' AND f.entity_id = account.id AND f.user_id = :favoriteUserId)`,
        )
      }
      // #2150.15 — « PARTAGÉS AVEC MON ÉQUIPE » : les comptes PORTÉS PAR UN
      // COLLÈGUE — un responsable renseigné, différent de l'appelant. Un
      // compte LIBRE (`assigned_to IS NULL`) n'est porté par personne : il
      // n'entre pas ici, ce filtre ne remplace pas la file des non-attribués
      // (`portfolioScopeFor`, `includeUnassigned`). « Membre du même espace »
      // est déjà garanti par le `workspace_id` posé tout en haut de cette
      // requête — ce filtre ne fait qu'exclure le portefeuille de l'appelant.
      if (filters.ownership === 'teammate') {
        qb.andWhere('account.assigned_to IS NOT NULL AND account.assigned_to <> :currentOwnerId', {
          currentOwnerId: currentUserId,
        })
      }
      // #4158.25 — « MES COMPTES » : responsable OU co-équipier ACTIF (ajout seul : un
      // retrait pose `removed_at`). Un angle de plus sur le même portefeuille, pas une
      // visibilité — tout l'espace voit déjà tout.
      if (filters.ownership === 'mine') {
        qb.andWhere(
          `(account.assigned_to = :mineUserId OR EXISTS (SELECT 1 FROM account_team_members atm
                    WHERE atm.account_id = account.id AND atm.user_id = :mineUserId AND atm.removed_at IS NULL))`,
          { mineUserId: currentUserId },
        )
      }
      // #1575.1 — le CINQUIÈME compteur. Pas un prédicat : une liste
      // d'identifiants, arbitrée par la mémoire marché et passée par le
      // contrôleur. Une liste vide dit « aucun compte n'est couvert » — donc
      // zéro ligne, jamais tout le portefeuille (et jamais un `IN ()`, qui ne
      // s'écrit pas en SQL).
      if (filters.marketCovered === 'covered' && marketCoveredIds !== undefined) {
        if (marketCoveredIds.length === 0) {
          qb.andWhere('1 = 0')
        } else {
          qb.andWhere('account.id IN (:...marketCoveredIds)', { marketCoveredIds: [...marketCoveredIds] })
        }
      }
      // Anti-parasite (Louis) : les coquilles errored/canceled VIDES ne polluent
      // JAMAIS la vue par défaut « Tous les comptes ». Elles restent en base
      // (idempotence / relance — cf. `findReusableFailedByUserAndCompany`) mais
      // invisibles, SAUF quand l'utilisateur demande explicitement les échecs
      // (`status=error|canceled` → filtre « Échecs », où l'on veut les voir pour
      // les reprendre). Un compte errored PORTANT des données reste visible
      // partout (reprise depuis la bannière « Analyse échouée · Reprendre »).
      const viewingFailures = statuses.includes('error') || statuses.includes('canceled')
      if (!viewingFailures) {
        qb.andWhere(KEEP_NON_EMPTY_FAILED_SQL)
      }
      const limit = filters.limit ?? 25
      const offset = filters.offset ?? 0
      // LOT 7 / correctif A — le total de pagination et les quatre compteurs
      // de tête (ci-dessous) ne dépendent l'un de l'autre en RIEN : aucune
      // borne, aucun court-circuit sur `total`, et `headlineCounters` ne lit
      // que `offset`. Les lancer en deux vagues séquentielles (`await total`
      // PUIS `await headlineCounters`) double pour rien l'aller-retour réseau
      // vers Postgres, avant même le SELECT des lignes qui suit. Les deux
      // promesses sont donc créées ICI, dans le MÊME tour synchrone, et
      // attendues ensemble.
      const totalPromise = qb.clone().getCount()
      // Les compteurs de tête (PDF-04 §1.3), sur l'ENSEMBLE du filtre et
      // seulement sur la 1re page : le tally ne dépend pas de l'offset, donc le
      // défilement infini ne le repaie pas.
      // #4581 — ces compteurs sont des TOTAUX D'ESPACE (« Comptes dans l'espace », « Favoris »…), pas le
      // résultat du filtre : ils partent de l'espace visible, jamais de `qb` (qui porte q, statut, « Mon CRM »…).
      const countersPromise =
        offset === 0
          ? this.headlineCounters(this.spaceCountersBase(workspaceId, scope, businessUnitScope), currentUserId)
          : Promise.resolve(undefined)
      const [total, counters] = await Promise.all([totalPromise, countersPromise])
      const rows = await qb
        .select([
          'account.id AS id',
          'account.company_name AS company_name',
          'account.sector AS sector',
          // #4497.a — le siège du registre ; la ligne en tire la ville (absent = aucun texte).
          'account.headquarters AS headquarters',
          // #4989.2 — villes d'implantation (registre + sites de l'analyse), pour le filtre « Zone » du portefeuille.
          `${IMPLANTATION_PLACES_SQL} AS site_places`,
          'account.employees AS employees',
          'account.priority_score AS priority_score',
          // D10 (Louis 05/10) — palier de score posé, non arbitré : la liste le dit.
          "COALESCE(account.raw_analysis ->> 'score_unarbitrated' = 'true', FALSE) AS score_unarbitrated",
          // #4016.91 (18/10) — le /25 de la fiche, aux mêmes trois places qu'elle (`readAccountScore25`).
          "account.raw_analysis -> 'evaluation' ->> 'score' AS eval_score_root",
          "account.raw_analysis -> 'plan' -> 'evaluation' ->> 'score' AS eval_score_plan",
          "account.raw_analysis -> 'evaluation_compte' ->> 'score' AS eval_score_compte",
          'account.status AS status',
          "COALESCE(account.commercial_status, 'inbox') AS commercial_status",
          'account.created_at AS created_at',
          'account.recent_signals AS recent_signals',
          'account.logo_url AS logo_url',
          'account.website AS website',
          'account.assigned_to AS assigned_to',
          // Le motif et la date de l'écartement voyagent avec la ligne : un
          // « Écarté » sans motif est invérifiable, et c'est précisément ce que
          // la vue « ce que j'ai écarté » doit rendre lisible.
          'account.priority_gate AS priority_gate',
          'account.gate_reason AS gate_reason',
          'account.gate_decided_at AS gate_decided_at',
          // #3407.1 — le niveau d'effort du board (`sprint.ts`), sa raison et
          // sa date de revue : jusqu'ici réservés à `GET /sprints` (le board),
          // la liste n'en disait rien. Colonnes déjà en base depuis
          // `1796373242104-SprintPortfolioDecision.ts`.
          'account.sprint AS sprint',
          'account.sprint_reason AS sprint_reason',
          'account.sprint_review_at AS sprint_review_at',
          // #3407.4 — la dernière action tracée et la première action du plan :
          // les MÊMES lectures que `portfolioPriorities` (#3209), sélectionnées
          // ici pour que la liste ne les laisse plus au seul copilote. Une
          // sous-requête corrélée (un index `account_id`), jamais une jointure
          // qui multiplierait les lignes.
          `(SELECT to_char(MAX(ua.created_at), 'YYYY-MM-DD') FROM user_actions ua
             WHERE ua.account_id = account.id AND ua.workspace_id = account.workspace_id) AS last_action_at`,
          "account.raw_analysis -> 'plan' -> 'nextActions' -> 0 ->> 'label' AS next_action_label",
          "account.raw_analysis -> 'plan' -> 'nextActions' -> 0 ->> 'horizon' AS next_action_horizon",
          // #4584 — « À reprendre » : le prédicat de la bande, posé sur chaque ligne (une définition, GA-26).
          `(${HEADLINE_FILTER_PREDICATE.toResume}) AS to_resume`,
          // #2159.26 — les étiquettes, pour la colonne et le filtre de liste.
          'account.tags AS tags',
          // #2809 (#2293.3) — le SIREN de la ligne, pour lancer un lot
          // d'analyse (`POST /analysis-batches`, source `portfolio`) sans
          // ré-résoudre le nom par recherche.
          'account.siren AS siren',
          // #2265.14 (épopée #2851) — le NAF, pour dériver `isIntermediaryActor`
          // côté écran (GA-26 : une seule fonction, `@bellum/contracts`), sans
          // rappeler l'IA pour un fait déjà collecté (Pappers) et déjà en base.
          'account.naf_code AS naf_code',
          // #2150.14/.18 — l'étoile de la ligne. `:favoriteUserId` est déjà lié
          // plus haut dès que `currentUserId` est connu ; sans lui, personne à
          // qui demander « est-ce ton favori » — FALSE, jamais un favori
          // deviné.
          currentUserId
            ? `EXISTS (SELECT 1 FROM ${USER_FAVORITES_TABLE} f
                        WHERE f.entity_type = 'account' AND f.entity_id = account.id AND f.user_id = :favoriteUserId) AS is_favorite`
            : 'FALSE AS is_favorite',
          // #4267.1 — la cadence affichée suit le SUIVI EXPLICITE, plus le statut commercial.
          `${activeFollowExists('account')} AS is_followed`,
        ])
        .offset(offset)
        .limit(limit)
        .getRawMany<AccountListRow>()
      // Real « dernière analyse » date, batched for the whole page (one query,
      // absent for accounts with no completed run — never a created_at proxy here).
      const lastAnalyzed = await this.resolveLastAnalyzedByAccount(rows.map(r => r.id))
      // Qui porte chaque compte, NOMMÉ (restitution V2 §4/§10). Une seule requête
      // pour la page ; un porteur inconnu (membre parti) ne rend aucun badge
      // plutôt qu'un uuid.
      const owners = await this.resolveOwnerNames(rows.map(r => r.assigned_to))
      const people = await this.resolvePeopleByAccount(rows.map(r => r.id))
      // LUDB.7 bis — le pack de l'espace de celui qui regarde, lu UNE fois pour la page.
      const offerDomain = await this.offerDomainOf(currentUserId)
      const accounts: AccountListItem[] = rows.map(row => ({
        id: row.id,
        company_name: row.company_name,
        sector: row.sector,
        headquarters: row.headquarters ?? null,
        ...(implantationPlaces(row.site_places) ? { sites: implantationPlaces(row.site_places) } : {}),
        employees: row.employees,
        priority_score: row.priority_score,
        // D10 — absent plutôt que `false` : rien à dire sur un score arbitré.
        ...(row.score_unarbitrated === true ? { score_unarbitrated: true } : {}),
        // #4016.91 — absent plutôt que 0 : un dossier sans /25 lisible n'en invente pas.
        ...scoreFields25({
          root: row.eval_score_root,
          plan: row.eval_score_plan,
          compte: row.eval_score_compte,
        }),
        status: row.status,
        commercial_status: row.commercial_status,
        created_at: row.created_at,
        last_analyzed_at: lastAnalyzed.get(row.id) ?? null,
        // Logo réel Apollo + site (pour le favicon fallback d'affichage).
        logo_url: row.logo_url,
        website: row.website,
        // #4044 — la liste des comptes lit les signaux SANS les offres de stage.
        primary_signal: readSignalLabel(
          pickDominantSignal(dropInternshipRows(row.recent_signals, { jobsOnly: true }), offerDomain),
        ),
        signal_preview: readSignalPreview(
          pickDominantSignal(dropInternshipRows(row.recent_signals, { jobsOnly: true }), offerDomain),
        ),
        // #3682.3 — dernière vérification et dernier événement utile, séparés (une seule lecture, contracts).
        signal_freshness: signalFreshnessOf(
          dropInternshipRows(row.recent_signals, { jobsOnly: true }),
          lastAnalyzed.get(row.id) ?? null,
          offerDomain,
        ),
        watch_cadence: watchCadenceFor(row.is_followed === true),
        owner: row.assigned_to ? (owners.get(row.assigned_to) ?? null) : null,
        is_favorite: row.is_favorite === true,
        // #2159.26 — `[]` = aucune étiquette posée, jamais `null` à l'écran.
        tags: Array.isArray(row.tags) ? row.tags : [],
        siren: row.siren,
        // #2265.14 (épopée #2851) — voir le commentaire du `.select()` plus haut.
        naf_code: row.naf_code ?? null,
        // #3407.1 — voir le commentaire du `.select()` plus haut.
        sprint: row.sprint,
        sprint_reason: row.sprint_reason,
        sprint_review_at: row.sprint_review_at,
        // #3407.4 — voir le commentaire du `.select()` plus haut.
        last_action_at: row.last_action_at ?? null,
        next_action_label: row.next_action_label ?? null,
        next_action_horizon: row.next_action_horizon ?? null,
        to_resume: row.to_resume === true,
        // Refonte Théo — la colonne « Personnes » ; absent quand la lecture a échoué.
        ...(people.has(row.id) ? { people: people.get(row.id) } : {}),
      }))
      const current = Math.floor(offset / limit) + 1
      const totalPages = total === 0 ? 0 : Math.ceil(total / limit)
      return {
        data: accounts,
        ...(counters ? { counters } : {}),
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
      this.logger.error('findAll error', { error: err })
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
   * #2150.14/.18 — LE FAVORI DE COMPTE, RÉTABLI. Revirement ASSUMÉ de #1800
   * (09/09/2026, « tu peux supprimer la notion de favori ») : retour bêta
   * #2150, Louis 15/09/2026. La table et sa contrainte n'ont jamais bougé
   * (« on archive, on ne supprime pas ») — voir `UserFavoriteEntity`.
   *
   * PERSONNEL, comme la table le documente : la clé primaire commence par
   * `user_id`, aucune colonne `workspace_id`. Idempotent dans les deux sens
   * (`ON CONFLICT DO NOTHING` / delete sans 404) — un double-clic ne doit ni
   * planter, ni faire remonter le favori en tête d'une liste qu'il n'a pas
   * (`created_at` n'est jamais réécrit).
   */
  async setAccountFavorite(userId: string, accountId: string, isFavorite: boolean): Promise<boolean> {
    if (!this.userFavorites) return false
    if (isFavorite) {
      await this.userFavorites.query(
        `INSERT INTO ${USER_FAVORITES_TABLE} (user_id, entity_type, entity_id)
         VALUES ($1, 'account', $2)
         ON CONFLICT (user_id, entity_type, entity_id) DO NOTHING`,
        [userId, accountId],
      )
      return true
    }
    await this.userFavorites.delete({ user_id: userId, entity_type: 'account', entity_id: accountId })
    return false
  }

  /**
   * LES COMPTEURS DE TÊTE DU PORTEFEUILLE (PDF-04 §1.3).
   *
   * ───────────────────────────────────────────────────────────────────────────
   * POURQUOI DES CLONES DE LA REQUÊTE, ET PAS UN SQL ÉCRIT À CÔTÉ
   * ───────────────────────────────────────────────────────────────────────────
   * `base` est le constructeur de la LISTE, déjà porteur de la portée d'espace,
   * du cloisonnement de portefeuille, de la recherche et de tous les filtres.
   * Chaque compteur en part, si bien qu'il porte EXACTEMENT le même périmètre
   * que le tableau qu'il surmonte. Un SQL rédigé à côté finirait par diverger
   * d'une condition, et le compteur dirait alors autre chose que la liste — le
   * genre de désaccord qui se lit parfaitement bien et qu'on ne remarque pas.
   * C'est le même arbitrage que les cinq compteurs de `/projects/needs`.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * POURQUOI DES SOUS-REQUÊTES POUR LES DEUX PREMIERS
   * ───────────────────────────────────────────────────────────────────────────
   * `ACCOUNT_HYGIENE_PREDICATES` est écrit sur l'alias `a`, et le constructeur
   * de la liste sur l'alias `account`. Réécrire l'alias à la main serait
   * précisément la COPIE que GA-53 refuse. Le prédicat est donc réutilisé
   * VERBATIM, dans une sous-requête qui garde son propre alias : « ce compte
   * est-il dans l'ensemble que le cockpit désigne ? ». Une retouche du prédicat
   * vaut du même coup pour le cockpit, la pastille de ligne et ce compteur.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * POURQUOI CHACUN ÉCHOUE SÉPARÉMENT
   * ───────────────────────────────────────────────────────────────────────────
   * `Promise.all` ferait disparaître les quatre parce qu'un seul a raté. Un
   * compteur illisible vaut `undefined` — l'écran n'affiche alors RIEN pour
   * lui. Jamais `0` : « je n'ai pas pu compter » et « il n'y en a aucun » sont
   * deux phrases différentes, et la seconde soulagerait à tort.
   */
  /**
   * L'ESPACE que les compteurs de tête comptent : mêmes bornes que la liste (espace, visibilité, périmètre BU,
   * ni supprimés, ni rangés, ni coquilles d'échec vides) et AUCUN filtre de vue — c'est ce qui fait d'un total
   * un total (#4581). Le paramètre `favoriteUserId` est lié par `headlineCounters` quand il est connu.
   */
  private spaceCountersBase(
    workspaceId: string,
    scope: { ownerId: string } | null,
    businessUnitScope: BusinessUnitScopeClause,
  ): SelectQueryBuilder<AccountEntity> {
    const space = this.accounts
      .createQueryBuilder('account')
      .where('account.workspace_id = :workspaceId', { workspaceId })
    if (scope) space.andWhere(portfolioScopeClause('account'), { ownerId: scope.ownerId })
    this.applyBusinessUnitScope(space, businessUnitScope)
    return space
      .andWhere('account.status <> :deletedStatus', { deletedStatus: DELETED_ACCOUNT_STATUS })
      .andWhere("account.status <> 'archived'")
      .andWhere(KEEP_NON_EMPTY_FAILED_SQL)
  }

  private async headlineCounters(
    base: SelectQueryBuilder<AccountEntity>,
    currentUserId?: string,
  ): Promise<AccountListCounters | undefined> {
    if (currentUserId) base.setParameter('favoriteUserId', currentUserId)
    const count = async (label: string, predicate: string): Promise<number | undefined> => {
      try {
        // `orderBy()` nu retire le tri de la liste : `COUNT(*)` n'a pas besoin
        // d'ordonner, et l'expression de tri porte une sous-requête qu'il est
        // inutile d'exécuter une fois par compteur.
        return await base.clone().orderBy().andWhere(predicate).getCount()
      } catch (error) {
        this.logger.error('Compteur de tête du portefeuille illisible', {
          error,
          tags: { counter: label },
        })
        return undefined
      }
    }

    const [followed, withoutNextAction, newSignals7d, accessClassAB, total, activeRelations, favorites, crm, imported] =
      await Promise.all([
        count('followed', FOLLOWED_ACCOUNTS_PREDICATE),
        count('withoutNextAction', FOLLOWED_WITHOUT_NEXT_ACTION_PREDICATE),
        count('newSignals7d', NEW_SIGNAL_LAST_7_DAYS_PREDICATE),
        count('accessClassAB', ACCESS_CLASS_A_OR_B_PREDICATE),
        count('total', 'TRUE'),
        count('activeRelations', ACTIVE_RELATIONS_PREDICATE),
        currentUserId
          ? count(
              'favorites',
              `EXISTS (SELECT 1 FROM ${USER_FAVORITES_TABLE} cf
                      WHERE cf.entity_type = 'account' AND cf.entity_id = account.id AND cf.user_id = :favoriteUserId)`,
            )
          : Promise.resolve(undefined),
        // #4526.5 — « Mon CRM » : le MÊME prédicat que le filtre `crm`.
        count('crm', CRM_LINKED_ACCOUNT_PREDICATE),
        // #4597.1 — « Importés » : le MÊME prédicat que le filtre `imported`.
        count('imported', IMPORTED_ACCOUNT_PREDICATE),
      ])

    const counters: AccountListCounters = {
      ...(followed === undefined ? {} : { followed }),
      ...(withoutNextAction === undefined ? {} : { withoutNextAction }),
      ...(newSignals7d === undefined ? {} : { newSignals7d }),
      ...(accessClassAB === undefined ? {} : { accessClassAB }),
      ...(total === undefined ? {} : { total }),
      ...(activeRelations === undefined ? {} : { activeRelations }),
      ...(favorites === undefined ? {} : { favorites }),
      ...(crm === undefined ? {} : { crm }),
      ...(imported === undefined ? {} : { imported }),
    }
    // Les quatre ont raté : rien à dire, et surtout pas un objet de zéros.
    return Object.keys(counters).length > 0 ? counters : undefined
  }

  /**
   * Buy-signal feed for the whole workspace (Phase 2: team-scoped read).
   *
   * Each signal is enriched with its HISTORY when one has been materialized
   * (V2 §11): when Bellum first saw it, how many times it changed, when it was
   * last seen, whether it has since disappeared. `recent_signals` alone can't
   * answer that — it's rewritten whole by every analysis.
   */
  async listAccountSignals(
    workspaceId: string,
    userId?: string,
    businessUnitScope: BusinessUnitScopeClause = null,
    // #3919 — restreint à UN compte (« qu'est-ce qui bouge chez CE compte ? »),
    // jamais un second moteur : même requête, même historique, même tri de
    // pertinence que la Veille du portefeuille (GA-26).
    accountId?: string,
  ): Promise<AccountSignalItem[]> {
    // #2040.17 — le profil vendeur, résolu server-side comme pour les comptes
    // similaires. Échec ou absence = profil vide : `decisiveSignalKinds` rend
    // alors un ensemble vide, et la liste garde exactement son ordre d'avant.
    // Jamais bloquant — une Veille muette vaut moins qu'une Veille non triée.
    // PERF (P5, 29/09 — `GET /accounts/signals` mesuré à 1,4-1,8 s) : le profil
    // vendeur, la lecture des comptes et l'historique des signaux (qui avale ses
    // propres erreurs) sont trois lectures INDÉPENDANTES qui s'enchaînaient ; elles
    // partent ensemble. Le profil ne bloque jamais (repli = profil vide).
    const profilePromise: Promise<AnalysisProfileData> = userId
      ? this.esnProfile.resolveProfileData(userId).catch((err: unknown) => {
          this.logger.warn('listAccountSignals: seller profile resolution failed', { error: err, userId })
          return {} as AnalysisProfileData
        })
      : Promise.resolve({})
    const historyPromise: Promise<SignalHistoryRows> = this.signalHistory
      ? this.signalHistory.listForWorkspace(workspaceId)
      : Promise.resolve([])
    const signalsQb = this.accounts
      .createQueryBuilder('account')
      .select([
        'account.id AS id',
        'account.company_name AS company_name',
        'account.sector AS sector',
        'account.priority_score AS priority_score',
        'account.created_at AS created_at',
        'account.recent_signals AS recent_signals',
        // #1423 — les deux colonnes du logo. `CompanyAvatar` sait les lire ; la
        // Veille montrait une colonne d'initiales faute qu'elles voyagent.
        'account.logo_url AS logo_url',
        'account.website AS website',
        'account.signals_collected_at AS signals_collected_at',
        'account.siren AS siren',
      ])
      .where('account.workspace_id = :workspaceId', { workspaceId })
      .andWhere('account.status <> :deletedStatus', { deletedStatus: DELETED_ACCOUNT_STATUS })
      // #3915.decp — un compte dont le seul signal est un marché public attribué lu en
      // continu (table partagée, par SIREN) a quelque chose à dire, lui aussi.
      .andWhere(
        `(jsonb_array_length(COALESCE(account.recent_signals, :emptySignals::jsonb)) > 0
          OR EXISTS (SELECT 1 FROM public_registry_announcements r
                      WHERE r.siren = account.siren AND r.source = 'decp'))`,
        { emptySignals: '[]' },
      )
    // #2084.24 — la Veille NOMME les comptes, ligne à ligne : sans cette clause,
    // elle rendait à un membre cloisonné exactement les comptes que sa liste
    // venait de lui cacher, avec leur raison sociale et leur logo.
    this.applyBusinessUnitScope(signalsQb, businessUnitScope)
    if (accountId) {
      signalsQb.andWhere('account.id = :accountId', { accountId })
    }
    const [rows, profile, history] = await Promise.all([
      signalsQb.orderBy('account.updated_at', 'DESC').getRawMany<AccountSignalRow>(),
      profilePromise,
      historyPromise,
    ])

    // #2040.17 — les natures de signal que LES RÉPONSES rendent décisives
    // remontent en tête ; l'ordre historique (score du compte, puis date) tient
    // à l'intérieur de chaque groupe. Rien n'est retiré de la liste.
    // #3915.decp — les marchés publics attribués des SIREN du lot, une lecture bornée.
    // Best-effort : une lecture en échec rend la Veille d'avant, jamais une erreur.
    const awards = await this.registryAnnouncementsBySiren(rows.map(row => row.siren ?? '')).catch(
      () => new Map<string, RegistryAnnouncement[]>(),
    )
    const nowMs = Date.now()
    const items = orderSignalsByDecisiveKinds(
      rows
        .flatMap(row => [
          ...toAccountSignalItems(row),
          ...awardSignalItems(
            {
              ...row,
              created_at: String(row.created_at),
              signals_collected_at: row.signals_collected_at ? toIsoString(row.signals_collected_at) : null,
            },
            awards.get((row.siren ?? '').replace(/\D/g, '')) ?? [],
            nowMs,
          ),
        ])
        .sort(compareAccountSignals),
      decisiveSignalKinds(profile),
    )
    return this.withSignalHistory(items, history)
  }

  /** Attaches the persisted history to each projected signal, matched on the
   *  SAME identity the materialization uses (account + normalized label). A
   *  signal with no history row is returned untouched — never a guessed date. */
  private withSignalHistory(items: AccountSignalItem[], history: SignalHistoryRows): AccountSignalItem[] {
    if (items.length === 0 || history.length === 0) return items

    const byKey = new Map(history.map(row => [`${row.account_id}|${row.signal_key}`, row]))
    return items.map(item => {
      const row = byKey.get(SignalHistoryService.indexKey(item.account_id, item.label))
      if (!row) return item
      return {
        ...item,
        // Théo L1 — sélecteur avancé — l'identité de la ligne, par laquelle une
        // offre d'emploi se désigne comme périmètre de Laura (`job_offer`).
        // Absente d'une ligne lue sans elle : rien n'est écrit, jamais deviné.
        ...(row.id ? { history_id: row.id } : {}),
        first_detected_at: toIsoString(row.first_detected_at),
        first_detection_exact: row.first_detection_exact,
        last_seen_at: toIsoString(row.last_seen_at),
        last_changed_at: toIsoString(row.last_changed_at),
        change_count: row.change_count,
        history_status: row.status,
        resolved_at: toIsoString(row.resolved_at),
        // V2 §20 — l'objet `Signal` : sa pondération dérivée et l'action qu'il a
        // déclenchée. `null` de part et d'autre = rien à dire, pas une valeur
        // devinée (l'écran n'affiche alors ni badge ni « a déclenché »).
        importance: row.importance ?? null,
        action_id: row.action_id ?? null,
        action_label: row.action_label ?? null,
        // #3206.2 (partiel, épopée #3240) — `null` tant que personne n'a cliqué
        // « Marquer vérifié » sur ce signal.
        last_verified_at: toIsoString(row.last_verified_at),
      }
    })
  }

  /**
   * "Besoins" feed for the whole workspace — one row per account carrying ONLY
   * the need-bearing slices of its analysis. Every value is already stored: the
   * pains / programmes / angles live in ``raw_analysis``, ``it_challenges`` is
   * its own column. Nothing is recomputed and no IA call is made, so the page
   * works on dossiers analysed long ago.
   *
   * The JSONB sub-keys are projected **inside Postgres** (same concern as
   * ``findOne`` stripping ``branches``): a portfolio-wide read must never drag
   * whole ``raw_analysis`` blobs through the API process.
   *
   * Accounts whose analysis carries no need signal at all are filtered out in
   * SQL — the page lists what HAS a need, not the whole portfolio.
   */
  /**
   * Les comptes qui ATTENDENT une décision ou une action (requêtes 157 et 158
   * du PDF 6).
   *
   * Deux questions distinctes, une seule lecture, et surtout deux RAISONS
   * séparées — les fondre produirait une liste qu'on ne saurait pas trier :
   *
   * - `awaiting_decision` : la porte G1 n'est pas franchie. Le compte a été
   *   analysé, personne n'a dit s'il fallait le travailler.
   * - `no_recent_action` : le compte est SUIVI (`watching` / `opportunity`) et
   *   rien n'a été journalisé dessus depuis la fenêtre. « Sans prochaine
   *   action » se mesure sur ce qui a été FAIT, faute de champ « prochaine
   *   action » dans le dépôt — et le dire est plus honnête que d'inventer une
   *   colonne vide.
   *
   * Les comptes ÉCARTÉS (`parked`) n'y figurent jamais : quelqu'un a déjà
   * répondu à la question, la reposer effacerait sa décision.
   */
  async accountsAwaitingAction(
    workspaceId: string,
    staleDays = 30,
    limit = 20,
  ): Promise<
    { id: string; companyName: string; reason: 'awaiting_decision' | 'no_recent_action'; lastActionAt: string | null }[]
  > {
    const rows = await this.accounts.manager.query<
      { id: string; company_name: string; reason: string; last_action_at: string | null }[]
    >(
      `WITH last_actions AS (
         SELECT account_id, MAX(created_at) AS last_action_at
           FROM user_actions
          WHERE workspace_id = $1 AND account_id IS NOT NULL
          GROUP BY account_id
       )
       SELECT a.id, a.company_name,
              CASE WHEN a.priority_gate = 'pending' THEN 'awaiting_decision'
                   ELSE 'no_recent_action' END AS reason,
              to_char(la.last_action_at, 'YYYY-MM-DD') AS last_action_at
         FROM accounts a
         LEFT JOIN last_actions la ON la.account_id = a.id
        WHERE a.workspace_id = $1
          AND a.priority_gate <> 'parked'
          AND a.status = 'completed'
          AND (
            a.priority_gate = 'pending'
            OR (
              a.commercial_status IN ('watching', 'opportunity', 'opening')
              AND (la.last_action_at IS NULL OR la.last_action_at < now() - ($2 || ' days')::interval)
            )
          )
        -- #3212.5 — l identifiant départage en dernier : un ordre TOTAL, le même premier compte à données égales.
        ORDER BY a.priority_score DESC NULLS LAST, a.updated_at DESC, a.id
        LIMIT $3`,
      [workspaceId, staleDays, limit],
    )
    return rows.map(row => ({
      id: row.id,
      companyName: row.company_name,
      reason: row.reason === 'awaiting_decision' ? 'awaiting_decision' : 'no_recent_action',
      lastActionAt: row.last_action_at,
    }))
  }

  /**
   * #3209 (LAU-FINAL-215, beta 28/09/2026) — « parmi tout ce que je pourrais
   * faire, où dois-je investir mon temps cette semaine ? ». La règle de
   * répartition (quatre catégories, plafond, diversité par groupe) vit dans
   * `derivePortfolioPriorities` (`portfolio-priorities.ts`, testée seule) :
   * cette méthode ne fait que lire les colonnes réelles du portefeuille,
   * MÊME requête de base que `accountsAwaitingAction` (jointure sur la
   * dernière action) — un dossier fusionné (`merged_into_id`) n'y figure
   * jamais, ce n'est plus un compte à part entière.
   */
  async portfolioPriorities(workspaceId: string, userId?: string): Promise<PortfolioPriorities> {
    const rows = await this.accounts.manager.query<
      {
        id: string
        company_name: string
        sprint: string | null
        sprint_exit_reason: string | null
        priority_gate: string
        priority_score: number | null
        priority_justification: string | null
        commercial_status: string
        group_head_siren: string | null
        last_action_at: string | null
        movement_rationale: string | null
        first_action_label: string | null
        first_action_horizon: string | null
        bet_horizon: string | null
        bet_size: string | null
        bet_access: string | null
        bet_resource: string | null
        headquarters: string | null
        imported: boolean
        interlocutor_candidates: { name: string | null; role: string | null; scope: string | null }[]
      }[]
    >(
      `WITH last_actions AS (
         SELECT account_id, MAX(created_at) AS last_action_at
           FROM user_actions
          WHERE workspace_id = $1 AND account_id IS NOT NULL
          GROUP BY account_id
       )
       SELECT a.id, a.company_name, a.sprint, a.sprint_exit_reason, a.priority_gate,
              a.priority_score, a.priority_justification, a.commercial_status,
              a.group_head_siren, a.headquarters, (a.status = 'imported') AS imported,
              a.bet_horizon, a.bet_size, a.bet_access, a.bet_resource,
              to_char(la.last_action_at, 'YYYY-MM-DD') AS last_action_at,
              a.raw_analysis -> 'plan' -> 'recommendedMovement' ->> 'rationale' AS movement_rationale,
              a.raw_analysis -> 'plan' -> 'nextActions' -> 0 ->> 'label' AS first_action_label,
              a.raw_analysis -> 'plan' -> 'nextActions' -> 0 ->> 'horizon' AS first_action_horizon,
              ic.candidates AS interlocutor_candidates
         FROM accounts a
         LEFT JOIN last_actions la ON la.account_id = a.id
         LEFT JOIN LATERAL (
           -- #3399 — les cinq contacts visibles les mieux notés ; pickInterlocutor choisit (jamais deviné).
           SELECT COALESCE(jsonb_agg(jsonb_build_object('name', t.full_name, 'role', COALESCE(t.decision_role, t.title), 'scope', COALESCE(t.scope, t.entity)) ORDER BY t.rn), '[]'::jsonb) AS candidates
             FROM (
               SELECT c.full_name, c.decision_role, c.title, c.scope, c.entity,
                      ROW_NUMBER() OVER (ORDER BY c.contact_score DESC NULLS LAST, c.priority ASC NULLS LAST, c.full_name, c.id) AS rn
                 FROM contacts c
                WHERE c.account_id = a.id
                  AND c.hidden = false
                  AND c.deleted_at IS NULL
                ORDER BY c.contact_score DESC NULLS LAST, c.priority ASC NULLS LAST, c.full_name, c.id
                LIMIT 5
             ) t
         ) ic ON true
        WHERE a.workspace_id = $1
          -- #4054.1 — la base importée (status imported) fait partie du portefeuille à travailler.
          AND a.status IN ('completed', 'imported')
          AND a.merged_into_id IS NULL
        -- #3212.5 — départage final par identifiant (homonymes de contacts compris, ci-dessus).
        ORDER BY a.priority_score DESC NULLS LAST, a.updated_at DESC, a.id`,
      [workspaceId],
    )
    const priorities = derivePortfolioPriorities(
      rows.map(row => ({
        id: row.id,
        companyName: row.company_name,
        sprint: row.sprint,
        sprintExitReason: row.sprint_exit_reason,
        priorityGate: row.priority_gate,
        priorityScore: row.priority_score,
        priorityJustification: row.priority_justification,
        commercialStatus: row.commercial_status,
        groupHeadSiren: row.group_head_siren,
        lastActionAt: row.last_action_at,
        // #3245 (reste de #3209.5) — les mêmes clés que `get_account_briefing`
        // (`raw_analysis.plan.recommendedMovement.rationale` / `nextActions[0]`),
        // extraites en SQL comme le reste de ce fichier (jamais le blob entier
        // dans le process API, cf. commentaire ligne ~1612).
        movementRationale: row.movement_rationale,
        firstActionLabel: row.first_action_label,
        firstActionHorizon: row.first_action_horizon,
        betHorizon: row.bet_horizon,
        betSize: row.bet_size,
        betAccess: row.bet_access,
        betResource: row.bet_resource,
        headquarters: row.headquarters,
        interlocutor: pickInterlocutor(row.interlocutor_candidates ?? []),
        // #4054.1 — la liste des contacts connus (jamais seulement le premier) et la provenance import.
        knownContacts: row.interlocutor_candidates ?? [],
        imported: row.imported === true,
      })),
    )
    await this.attachWhyNow(priorities, workspaceId, userId)
    return priorities
  }

  /**
   * #4070.1 — « pourquoi maintenant » = les faits DÉCOTÉS du compte (lecteur unique), pour les seuls comptes de
   * « maintenant » (plafonnés par `capacityCap`). Sans lecteur ni utilisateur, ou sur une lecture qui échoue, le
   * compte garde sa raison d'avant : jamais un fait deviné.
   */
  private async attachWhyNow(priorities: PortfolioPriorities, workspaceId: string, userId?: string): Promise<void> {
    const reader = this.accountFacts
    if (!reader || !userId) return
    await Promise.all(
      priorities.now.map(async item => {
        try {
          const read = await reader.forAccount({ workspaceId, userId, accountId: item.id })
          const whyNow = whyNowOf(read?.facts ?? [])
          if (whyNow.length > 0) item.whyNow = whyNow
        } catch (error) {
          this.logger.warn(`priorités du portefeuille : faits illisibles — ${(error as Error).message}`)
        }
      }),
    )
  }

  /**
   * #3245 (reste de #3209.3) — le budget d'effort réel, cinq mesures RÉELLES
   * (voir `effort-budget.ts` pour le détail de chaque source et pour la
   * sixième mesure, « capacité de suivi », volontairement absente faute de
   * donnée à lire). Quatre lectures indépendantes, jamais un JOIN qui
   * mélangerait des granularités différentes (actions, crédits, comptes,
   * contacts).
   *
   * `priorities` : passer le résultat déjà lu de `portfolioPriorities` quand
   * l'appelant l'a DÉJÀ (`CopilotBridgeController.accountsPortfolioPriorities`,
   * qui rend les deux sur la même réponse) — jamais une deuxième lecture du
   * même portefeuille dans le même appel.
   */
  async effortBudget(workspaceId: string, priorities?: PortfolioPriorities): Promise<EffortBudget> {
    const settingsRows = await this.accounts.manager.query<{ weekly_available_hours: number | null }[]>(
      `SELECT weekly_available_hours FROM workspace_commercial_load_settings WHERE workspace_id = $1`,
      [workspaceId],
    )
    const callRows = await this.accounts.manager.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM user_actions
        WHERE workspace_id = $1 AND action_type = 'plan_action_call_logged'
          AND created_at >= now() - interval '7 days'`,
      [workspaceId],
    )
    const analysisRows = await this.accounts.manager.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM credit_ledger
        WHERE workspace_id = $1 AND kind = 'consume_analysis'
          AND created_at >= now() - interval '7 days'`,
      [workspaceId],
    )
    const contactRows = await this.accounts.manager.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM contacts WHERE workspace_id = $1`,
      [workspaceId],
    )
    const resolvedPriorities = priorities ?? (await this.portfolioPriorities(workspaceId))

    return {
      weeklyAvailableHours: settingsRows[0]?.weekly_available_hours ?? null,
      callsLast7Days: Number(callRows[0]?.count ?? 0),
      paidAnalysesLast7Days: Number(analysisRows[0]?.count ?? 0),
      workableAccounts:
        resolvedPriorities.now.length + resolvedPriorities.toVerify.length + resolvedPriorities.toWatch.length,
      contactsVolume: Number(contactRows[0]?.count ?? 0),
    }
  }

  /**
   * #3182.2 (épopée #3248, reste « disponibilité de l'équipe commerciale ») —
   * LE MODÈLE D'ÉQUIPE MINIMAL (voir `commercial-load-capacity.ts`) : la
   * charge DÉJÀ déclarée par l'espace (Réglages › Charge commerciale,
   * `workspace_commercial_load_settings`), jamais recalculée, croisée avec
   * le compte RÉEL de dossiers suivis (`accounts.assigned_to`) par le
   * commercial qui s'apprête à ouvrir ce compte. `get_account_preflight`
   * (`_team_scope_section`, apps/ia) lit le résultat pour nommer ce qui
   * manque avant d'ouvrir le compte — jamais un modèle d'équipe
   * multi-utilisateur, qui n'existe pas dans ce produit (RLS mono-utilisateur).
   */
  async commercialLoadCapacity(workspaceId: string, userId: string): Promise<CommercialLoadCapacity> {
    const settingsRows = await this.accounts.manager.query<
      { max_tracked_accounts: number | null; weekly_available_hours: number | null }[]
    >(
      `SELECT max_tracked_accounts, weekly_available_hours FROM workspace_commercial_load_settings
        WHERE workspace_id = $1`,
      [workspaceId],
    )
    const trackedRows = await this.accounts.manager.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM accounts WHERE workspace_id = $1 AND assigned_to = $2`,
      [workspaceId, userId],
    )
    const consultant = await this.resolveOwner(userId)

    return {
      consultant,
      maxTrackedAccounts: settingsRows[0]?.max_tracked_accounts ?? null,
      trackedAccountsCount: Number(trackedRows[0]?.count ?? 0),
      weeklyAvailableHours: settingsRows[0]?.weekly_available_hours ?? null,
    }
  }

  /**
   * Les contrôles de qualité, RENDUS COMPTE PAR COMPTE.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * CE QUE ÇA AJOUTE AU COCKPIT, ET POURQUOI ÇA NE LE REMPLACE PAS
   * ───────────────────────────────────────────────────────────────────────────
   * Le cockpit COMPTE : « 7 comptes suivis sans prochaine action ». Il reste la
   * source de ce chiffre. Ce qu'il ne peut pas dire, c'est si la ligne qu'un
   * commercial a sous les yeux est l'une des sept — et c'est sur cette ligne que
   * le geste se fait. Cette lecture DÉSIGNE, avec les prédicats du cockpit au
   * caractère près (`account-hygiene.sql.ts`, garde GA-53).
   *
   * ───────────────────────────────────────────────────────────────────────────
   * `null` PLUTÔT QU'UNE LISTE VIDE, LECTURE PAR LECTURE
   * ───────────────────────────────────────────────────────────────────────────
   * Une liste vide se lit « tout est propre ». Une lecture en échec doit se lire
   * « je n'ai pas pu regarder ». Les deux requêtes échouent séparément : un
   * `Promise.all` ferait disparaître les deux réponses parce qu'une seule a
   * raté — le même arbitrage, ligne par ligne, que le cockpit.
   */
  async hygieneByAccount(
    workspaceId: string,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<AccountHygieneByAccount> {
    // #2084.24 — LES DEUX lectures portent le périmètre, pas une seule. N'en
    // borner qu'une laisserait la moitié de la fuite, et la moitié restante
    // compte les CONTACTS de comptes d'une autre unité.
    const [withoutNextAction, contactsWithoutEmail] = await Promise.all([
      this.readAccountsWithoutNextAction(workspaceId, businessUnitScope),
      this.readContactsWithoutEmailByAccount(workspaceId, businessUnitScope),
    ])
    return { withoutNextAction, contactsWithoutEmail }
  }

  /**
   * #4294.9 — l'audit des doublons du portefeuille : SIMULATION, aucune écriture.
   *
   * Cloisonné par l'ESPACE (`workspace_id = $1`) et par le périmètre d'unité, comme `hygiene` : les
   * espaces sont des ESN concurrentes, un doublon ne traverse jamais deux espaces. Les coquilles
   * vides en erreur sont lues avec LE prédicat de la liste (`KEEP_NON_EMPTY_FAILED_SQL`), jamais
   * une seconde définition (GA-26).
   */
  async auditDuplicates(
    workspaceId: string,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<DuplicateAudit & { truncated: boolean }> {
    const clause = businessUnitScopeClause(businessUnitScope, 'account.business_unit_id', 'SELECT unnest($3::uuid[])')
    const rows = await this.accounts.manager.query<
      {
        id: string
        company_name: string | null
        siren: string | null
        status: string | null
        merged_into_id: string | null
        keep: boolean
        has_contacts: boolean
        created_at: Date | string
      }[]
    >(
      `SELECT account.id, account.company_name, account.siren, account.status, account.merged_into_id,
              ${KEEP_NON_EMPTY_FAILED_SQL} AS keep,
              EXISTS (SELECT 1 FROM contacts c WHERE c.account_id = account.id) AS has_contacts,
              account.created_at
         FROM accounts account
        WHERE account.workspace_id = $1${clause ? `\n          AND ${clause}` : ''}
        ORDER BY account.created_at ASC
        LIMIT $2`,
      this.hygieneParams(workspaceId, businessUnitScope),
    )
    const failed = (status: string | null) => status === 'error' || status === 'canceled'
    const audit = auditDuplicateAccounts(
      rows.map(r => ({
        id: r.id,
        companyName: r.company_name ?? '',
        siren: r.siren ?? null,
        status: r.status ?? '',
        mergedIntoId: r.merged_into_id ?? null,
        hasData: failed(r.status) ? r.keep : r.has_contacts,
        createdAt: new Date(r.created_at).toISOString(),
      })),
    )
    return { ...audit, truncated: rows.length >= ACCOUNT_HYGIENE_SCAN_LIMIT }
  }

  /**
   * Les paramètres d'une lecture d'hygiène : l'espace, la limite de balayage,
   * et le tableau d'identifiants d'unités quand il y en a un. Un seul endroit,
   * pour que les deux lectures ne puissent pas diverger sur leur `$3`.
   */
  private hygieneParams(workspaceId: string, businessUnitScope: BusinessUnitScopeClause): unknown[] {
    const params: unknown[] = [workspaceId, ACCOUNT_HYGIENE_SCAN_LIMIT]
    if (businessUnitScope && businessUnitScope.businessUnitIds.length > 0) {
      params.push([...businessUnitScope.businessUnitIds])
    }
    return params
  }

  private async readAccountsWithoutNextAction(
    workspaceId: string,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<AccountHygieneByAccount['withoutNextAction']> {
    try {
      const clause = businessUnitScopeClause(businessUnitScope, 'a.business_unit_id', 'SELECT unnest($3::uuid[])')
      const rows = await this.accounts.manager.query<{ id: string }[]>(
        accountsWithoutNextActionSql(clause),
        this.hygieneParams(workspaceId, businessUnitScope),
      )
      return {
        ids: rows.map(row => row.id),
        truncated: rows.length >= ACCOUNT_HYGIENE_SCAN_LIMIT,
      }
    } catch (error) {
      // `error` et non `warn` : comme au cockpit, une lecture d'hygiène qui
      // échoue n'est pas un état dégradé mais un BUG, et l'écran affichera
      // « non mesuré » pour toujours sans que personne aille vérifier.
      this.logger.error('Hygiène par compte — comptes sans prochaine action illisibles', {
        error,
        tags: { hygiene: 'accounts_without_next_action' },
      })
      return null
    }
  }

  private async readContactsWithoutEmailByAccount(
    workspaceId: string,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<AccountHygieneByAccount['contactsWithoutEmail']> {
    try {
      // `contacts` ne porte pas la colonne d'unité : la clause s'applique au
      // COMPTE du contact, dans l'`EXISTS` corrélé de la requête.
      const clause = businessUnitScopeClause(businessUnitScope, 'a.business_unit_id', 'SELECT unnest($3::uuid[])')
      const rows = await this.accounts.manager.query<{ id: string | null; n: number; total: number }[]>(
        contactsWithoutEmailByAccountSql(clause),
        this.hygieneParams(workspaceId, businessUnitScope),
      )
      const byAccount: Record<string, { count: number; total: number }> = {}
      for (const row of rows) {
        // Un contact sans compte rattaché existe (import libre) : il ne marque
        // aucune ligne, il n'a donc rien à faire dans cette table.
        if (!row.id) continue
        byAccount[row.id] = { count: Number(row.n), total: Number(row.total) }
      }
      return { byAccount, truncated: rows.length >= ACCOUNT_HYGIENE_SCAN_LIMIT }
    } catch (error) {
      this.logger.error('Hygiène par compte — contacts sans adresse illisibles', {
        error,
        tags: { hygiene: 'contacts_without_email' },
      })
      return null
    }
  }

  async listAccountNeeds(
    workspaceId: string,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<AccountNeedsRow[]> {
    try {
      // #2084.24 — le cloisonnement, dialecte POSITIONNEL. ⚠️ La clause
      // s'AJOUTE : `a.workspace_id = $1` SURVIT.
      const clause = businessUnitScopeClause(businessUnitScope, 'a.business_unit_id', 'SELECT unnest($2::uuid[])')
      const params: unknown[] = [workspaceId]
      if (businessUnitScope && businessUnitScope.businessUnitIds.length > 0) {
        params.push([...businessUnitScope.businessUnitIds])
      }
      return await this.accounts.manager.query<AccountNeedsRow[]>(
        `
        SELECT
          a.id                                            AS account_id,
          a.company_name                                  AS company_name,
          a.sector                                        AS sector,
          a.priority_score                                AS score,
          a.updated_at                                    AS updated_at,
          NULLIF(a.raw_analysis ->> 'it_implications_for_esn', '') AS it_implications,
          COALESCE(a.raw_analysis -> 'pains', '[]'::jsonb)         AS pains,
          COALESCE(a.it_challenges, '[]'::jsonb)                   AS it_challenges,
          COALESCE(a.raw_analysis -> 'program_names', '[]'::jsonb)  AS programs,
          COALESCE(a.raw_analysis -> 'angles', '[]'::jsonb)         AS angles,
          -- 5ᵉ nature du graphe (§6) : le signal d'achat. Servi ici pour que
          -- l'écran Besoins montre besoin ET signal côte à côte, chacun sous son
          -- étiquette — jamais fondus dans le même compteur.
          COALESCE(a.recent_signals, '[]'::jsonb)                   AS signals
        FROM accounts a
        WHERE a.workspace_id = $1
          AND a.status <> 'deleted'
          AND (
            (jsonb_typeof(a.raw_analysis -> 'pains') = 'array' AND jsonb_array_length(a.raw_analysis -> 'pains') > 0)
            OR (jsonb_typeof(a.it_challenges) = 'array' AND jsonb_array_length(a.it_challenges) > 0)
            OR COALESCE(a.raw_analysis ->> 'it_implications_for_esn', '') <> ''
            OR (jsonb_typeof(a.recent_signals) = 'array' AND jsonb_array_length(a.recent_signals) > 0)
          )${clause ? `\n          AND ${clause}` : ''}
        ORDER BY a.priority_score DESC NULLS LAST, a.updated_at DESC
        `,
        params,
      )
    } catch (err) {
      this.logger.error('listAccountNeeds error', { error: err })
      return []
    }
  }

  /**
   * Detail GET for an account. ``raw_analysis.branches`` is stripped from
   * the JSONB blob *inside Postgres* (``- 'branches'`` operator) — Pappers
   * can dump 1000+ établissements for large groups, and the only consumer
   * (``SitesFranceCard``) fetches them page-by-page via the dedicated
   * ``GET /accounts/:id/branches`` endpoint. The blob never crosses the
   * wire from Postgres to the API process here.
   */
  /**
   * Enregistre la mémoire de relation (bloc « Mémoire » couche zéro, annexe p8).
   * Fusion present-only : un champ absent du patch n'écrase rien. Renvoie la
   * mémoire fusionnée. Scopé user.
   */
  async setRelationshipMemory(
    id: string,
    userId: string,
    patch: RelationshipMemory,
  ): Promise<Record<string, unknown> | null> {
    const result = await this.accounts.manager.query(
      `UPDATE accounts
       SET relationship_memory = COALESCE(relationship_memory, '{}'::jsonb) || $3::jsonb
       WHERE id = $1 AND user_id = $2 AND status <> 'deleted'
       RETURNING relationship_memory`,
      [id, userId, JSON.stringify(patch)],
    )
    // Un UPDATE rend `[lignes, nombre]` : `const [row] = …` prenait le TABLEAU
    // des lignes, donc `row.relationship_memory` valait `undefined` et cette
    // méthode rendait TOUJOURS `null`, même sur une écriture réussie.
    const row = firstReturnedRow<{ relationship_memory: Record<string, unknown> | null }>(result)
    return row?.relationship_memory ?? null
  }

  /** Efface le repère « le plan mérite une actualisation » (annexe méthodo p27)
   *  — appelé après un replan. Best-effort, scopé user. */
  async clearReplanSuggested(id: string, userId: string): Promise<void> {
    await this.accounts.manager.query(`UPDATE accounts SET replan_suggested_at = NULL WHERE id = $1 AND user_id = $2`, [
      id,
      userId,
    ])
  }

  async findOne(id: string, userId: string): Promise<Result<AccountEntity, AccountFailure>> {
    const rows = await this.accounts.manager.query<AccountEntity[]>(
      `
      SELECT
        a.*,
        COALESCE(a.raw_analysis - 'branches', a.raw_analysis) AS raw_analysis
      FROM accounts a
      WHERE a.id = $1 AND a.user_id = $2
        AND a.status <> 'deleted'
      LIMIT 1
      `,
      [id, userId],
    )
    const row = rows[0]
    if (!row) {
      return failure({ code: 'not_found', message: `Account ${id} not found` })
    }
    return success(row)
  }

  /**
   * #3405.3 — LA GARDE NO-GO DES APPELANTS QUI RÉDIGENT, côté compte.
   *
   * Phrase de refus (`noGoMessageRefusal`, `@bellum/contracts`) quand le contact
   * appartient à un compte de CET espace placé en NO-GO, sinon `null` — un
   * contact sans compte, inconnu ou d'un autre espace ne refuse rien ici (la
   * propriété du contact reste vérifiée par le moteur IA).
   */
  async messageRefusalForContact(contactId: string, workspaceId: string): Promise<string | null> {
    const rows = await this.accounts.manager.query<{ sprint: string | null; sprint_reason: string | null }[]>(
      `SELECT a.sprint, a.sprint_reason
         FROM contacts c
         JOIN accounts a ON a.id = c.account_id
        WHERE c.id = $1 AND a.workspace_id = $2
        LIMIT 1`,
      [contactId, workspaceId],
    )
    return noGoMessageRefusal(rows[0]?.sprint, rows[0]?.sprint_reason)
  }

  /**
   * Workspace-scoped twin of {@link findOne} for the browser-facing controller
   * (multi-user Phase 2). Any member of the workspace can open the dossier of an
   * account the team owns; scoping switches from `user_id` to `workspace_id`.
   * Identical to per-user scoping today (1 user = 1 workspace, backfilled 1:1).
   * `branches` is stripped inside Postgres just like `findOne` — the dedicated
   * `GET /accounts/:id/branches` endpoint is the only consumer of that payload.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * ⚠️ LE PÉRIMÈTRE (BU), ET POURQUOI 404 PLUTÔT QUE 403
   * ─────────────────────────────────────────────────────────────────────────
   * Cette méthode est le POINT DE PASSAGE de toutes les routes qui ouvrent un
   * compte — le dossier, mais aussi `:id/timeline`, `:id/runs`, `:id/changes`,
   * `:id/cost`, `:id/market-context`, les documents, les comptes rendus. Jusqu'au
   * 15/09/2026 elle ne portait QUE la borne d'espace : la liste cachait les
   * comptes d'une autre agence, et le détail les servait à qui connaissait
   * l'UUID — `raw_analysis` comprise (revue de sécurité, défaut n°3).
   *
   * Hors périmètre, la réponse est « introuvable », JAMAIS « interdit » : un 403
   * confirmerait que l'objet existe, c'est-à-dire qu'il y a bien un compte
   * derrière cet identifiant chez cette ESN. C'est la même réponse que
   * `BusinessUnitService.findInWorkspace` donne pour un périmètre d'un autre
   * espace, et pour la même raison.
   *
   * ⚠️ Effet de bord ASSUMÉ (décision Louis, 15/09/2026) : un lien de compte
   * partagé entre deux commerciaux de BU différentes cesse de fonctionner.
   *
   * Le défaut du paramètre est `null` — aucun filtre, chemin byte-identique à
   * ce qu'il était. Qui a un appelant SANS membre (clé d'API d'espace) n'a pas
   * de périmètre à lire, et c'est la seule raison de ne rien passer.
   */
  async findOneForWorkspace(
    id: string,
    workspaceId: string,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<Result<AccountEntity, AccountFailure>> {
    // R15N-16 — LE PÉRIMÈTRE BU TIENT AUSSI SUR LA FICHE.
    //
    // Le défaut mesuré le 15/09/2026 : le périmètre était résolu pour la LISTE
    // et pour l'agrégat de portefeuille, et nulle part ailleurs. Un membre
    // cloisonné ne voyait pas un compte hors de ses périmètres dans sa liste,
    // mais l'OUVRAIT par son URL directe — un cloisonnement qui tient sur la
    // liste et tombe sur la fiche donne la sensation d'être protégé, ce qui est
    // pire que pas de cloisonnement du tout.
    //
    // ⚠️ La clause s'AJOUTE au `WHERE` : `a.workspace_id = $2` SURVIT. Un
    // second `WHERE` ouvrirait toutes les ESN d'un coup.
    // `unnest($3::uuid[])` : le dialecte POSITIONNEL du SQL brut. La forme de la
    // règle, elle, est celle des listes — au caractère près.
    const clause = businessUnitScopeClause(businessUnitScope, 'a.business_unit_id', 'SELECT unnest($3::uuid[])')
    const params: unknown[] = [id, workspaceId]
    if (businessUnitScope && businessUnitScope.businessUnitIds.length > 0) {
      params.push([...businessUnitScope.businessUnitIds])
    }
    const rows = await this.accounts.manager.query<AccountEntity[]>(
      `
      SELECT
        a.*,
        COALESCE(a.raw_analysis - 'branches', a.raw_analysis) AS raw_analysis
      FROM accounts a
      WHERE a.id = $1 AND a.workspace_id = $2
        AND a.status <> 'deleted'${clause ? `\n        AND ${clause}` : ''}
      LIMIT 1
      `,
      params,
    )
    const row = rows[0]
    if (!row) {
      // ⚠️ `not_found`, jamais `forbidden` : on SUIT la convention de cette
      // méthode hors espace. « Ce compte existe mais tu n'y as pas droit » est
      // déjà une fuite d'information.
      return failure({ code: 'not_found', message: `Account ${id} not found` })
    }
    return success(this.withDeclaredSignals(row))
  }

  /**
   * #2634.1 — LinkedIn comme source de signaux d'achat, UNIQUEMENT par une
   * voie autorisée : saisie manuelle par le commercial, ou import d'un export
   * que le client possède déjà. Jamais un scraping — le serveur n'appelle
   * jamais LinkedIn ici, il valide et stocke ce que le client a déjà transmis.
   *
   * `declaredAt`/`declaredBy`/`declaredByName` sont posés PAR LE SERVEUR,
   * jamais fournis par le client (même règle que `PartnersService.create` /
   * `declared_by`) : une date d'origine cliente se règle, et un auteur choisi
   * par l'appelant n'est pas un auteur. L'UPDATE est scopée `id AND
   * workspace_id` en une seule requête atomique — 0 ligne retournée = compte
   * hors de l'espace du demandeur, jamais une fuite d'écriture inter-tenant.
   */
  async declareSignals(
    accountId: string,
    workspaceId: string,
    userId: string,
    input: DeclareAccountSignalsRequest,
  ): Promise<Result<{ added: number }, AccountFailure>> {
    const declaredByName = await this.resolveDeclaredByName(userId)
    const declaredAt = new Date().toISOString()
    const additions: DeclaredSignal[] = input.signals.map(item => ({
      ...item,
      id: randomUUID(),
      source: input.source,
      entryKind: input.entryKind,
      declaredAt,
      declaredBy: userId,
      declaredByName,
    }))

    // Un UPDATE … RETURNING rend `[lignes, nombre]` chez TypeORM/Postgres : lire
    // `.length` sur la réponse BRUTE vaut toujours 2, jamais 0, et le not_found
    // ne se déclenche jamais — même défaut que `setRelationshipMemory` plus
    // haut, réparé ici par `returnedRows` (rouge de fusion vague 15,
    // `returned-rows.spec.ts`).
    const rows = returnedRows<{ id: string }>(
      await this.accounts.manager.query<Array<{ id: string }>>(
        `
      UPDATE accounts
      SET declared_signals = COALESCE(declared_signals, '[]'::jsonb) || $3::jsonb
      WHERE id = $1 AND workspace_id = $2 AND status <> 'deleted'
      RETURNING id
      `,
        [accountId, workspaceId, JSON.stringify(additions)],
      ),
    )
    if (rows.length === 0) {
      return failure({ code: 'not_found', message: `Account ${accountId} not found` })
    }
    return success({ added: additions.length })
  }

  /**
   * Le nom d'affichage de l'auteur d'une déclaration, résolu à l'ÉCRITURE
   * (jamais à la lecture — voir `declared-signals.ts`) : même geste que
   * `PartnersService.declaredByNamesOf`. Une table `profiles` illisible ne
   * doit pas faire échouer la déclaration — le nom manque, la déclaration
   * reste (`null`, jamais un nom deviné).
   */
  private async resolveDeclaredByName(userId: string): Promise<string | null> {
    try {
      const rows = await this.accounts.manager.query<
        Array<{ first_name: string | null; last_name: string | null; email: string | null }>
      >(`SELECT first_name, last_name, email FROM profiles WHERE user_id = $1 LIMIT 1`, [userId])
      const row = rows[0]
      return row ? ownerDisplayName(row.first_name, row.last_name, row.email) : null
    } catch (err) {
      this.logger.warn('Auteur de signal déclaré introuvable — la déclaration continue sans nom', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  /**
   * #2634.1 — greffe les signaux DÉCLARÉS (`declared_signals`, saisie manuelle
   * ou import — jamais un scraping) en tête de `raw_analysis.recent_signals`,
   * À LA LECTURE. Jamais persisté : `declared_signals` reste la SEULE colonne
   * qui les porte, pour qu'ils survivent à toute ré-analyse (voir
   * `declared-signals.ts`). Sans signal déclaré, `row` ressort inchangé — à
   * l'octet près, comportement d'avant ce lot.
   */
  private withDeclaredSignals(row: AccountEntity): AccountEntity {
    const declared = (row as { declared_signals?: unknown }).declared_signals
    if (!Array.isArray(declared) || declared.length === 0) return row
    const rawAnalysis = (row.raw_analysis ?? {}) as Record<string, unknown>
    const detected = Array.isArray(rawAnalysis['recent_signals'])
      ? (rawAnalysis['recent_signals'] as RecentSignal[])
      : []
    // ⚠️ `unknown` d'abord, à dessein : le JSON stocké porte `recent_signals`
    // (snake_case, écrit par la phase 1 et lu tel quel par le web), quand le
    // type hérité `AnalysisResearchData` déclare `recentSignals`. Les deux
    // formes ne se recouvrent pas pour TypeScript ; c'est la forme STOCKÉE qui
    // fait foi ici (fusion de la vague 15, 22/09/2026).
    return {
      ...row,
      raw_analysis: {
        ...rawAnalysis,
        recent_signals: graftDeclaredSignals(detected, declared as DeclaredSignal[]),
      } as unknown as AccountEntity['raw_analysis'],
    }
  }

  /**
   * Verser un candidat de Découvrir dans SON portefeuille — le geste qui
   * ATTRIBUE vraiment (décision produit D6, 24/07).
   *
   * Avant, « Suivre » n'était qu'une liste locale (localStorage) : rien côté
   * serveur, donc ni portefeuille, ni couverture manager, ni rien à transmettre
   * quand le commercial part. Ici le compte existe pour de bon et porte son
   * responsable (`assigned_to`).
   *
   * Trois garde-fous :
   *  - **Aucun crédit débité** : le quota se consomme à l'ANALYSE
   *    (`consumeAnalysisSlot`), pas à la mise au portefeuille. Explorer reste
   *    gratuit, comme l'écran le promet.
   *  - **Aucun dossier fabriqué** : le compte naît en `prospect`, un état qui
   *    dit « jamais analysé ». On n'invente pas un dossier vide qui ressemblerait
   *    à une analyse.
   *  - **Pas de doublon** : un même SIREN (à défaut le nom) déjà présent dans
   *    l'espace est RÉATTRIBUÉ, jamais dupliqué.
   */
  async addToPortfolio(
    userId: string,
    input: AddToPortfolioInput,
  ): Promise<Result<{ account: AccountEntity; created: boolean }, AccountFailure>> {
    let workspaceId: string
    try {
      workspaceId = (await this.workspaceContext.resolveActiveWorkspace(userId)).workspaceId
    } catch (err) {
      this.logger.error('addToPortfolio: could not resolve an active workspace', { error: err, userId })
      return failure({ code: 'create_failed', message: 'Impossible de résoudre votre espace de travail' })
    }

    try {
      const existing = await this.findPortfolioCandidate(workspaceId, input)
      if (existing) {
        // Déjà connu de l'espace : on (ré)attribue, on ne duplique pas. Un compte
        // supprimé revient à la vie plutôt que de créer un homonyme.
        existing.assigned_to = userId
        if (existing.status === 'deleted') {
          existing.status = 'prospect'
          // #3666.2 — un compte supprimé peut porter le score d'une analyse
          // RÉELLE antérieure à sa suppression ; `prospect` veut dire « jamais
          // analysé », donc ce score ne doit pas survivre à la résurrection,
          // sous peine d'afficher un score inventé sur un compte que son
          // propre statut dit n'avoir jamais analysé.
          existing.priority_score = null
          existing.priority_justification = null
        }
        const saved = await this.accounts.save(existing)
        // #2151.59 — même candidat retrouvé : reprend les notes déjà écrites
        // dessus si ce n'est pas déjà fait (idempotent — `UPDATE` sans ligne
        // à retaguer ne fait rien).
        await this.accountClaims?.emit({ workspaceId, siren: input.siren ?? null, accountId: saved.id })
        return success({ account: saved, created: false })
      }

      const entity = this.accounts.create({
        user_id: userId,
        workspace_id: workspaceId,
        company_name: input.company_name,
        siren: input.siren ?? null,
        sector: input.sector ?? null,
        website: input.website ?? null,
        // Jamais analysé, et ça se voit : aucun dossier n'est fabriqué.
        status: 'prospect',
        // Au portefeuille = sous surveillance active, pas dans l'inbox à trier.
        commercial_status: 'watching',
        assigned_to: userId,
      })
      const saved = await this.accounts.save(entity)
      // #2151.59 — « reprise quand le candidat devient un dossier de compte » :
      // les notes de terrain déjà écrites sur ce SIREN suivent le compte,
      // même ligne, jamais une copie.
      await this.accountClaims?.emit({ workspaceId, siren: input.siren ?? null, accountId: saved.id })
      return success({ account: saved, created: true })
    } catch (cause) {
      this.logger.error('addToPortfolio error', { error: cause, userId })
      return failure({ code: 'create_failed', message: 'Impossible d’ajouter ce compte au portefeuille' })
    }
  }

  /**
   * Retirer un compte de son portefeuille.
   *
   * Deux cas, parce qu'ils ne se valent pas :
   *  - le compte est encore `prospect` (jamais analysé, aucune donnée) → il n'a
   *    jamais rien été d'autre qu'une mise de côté : on le supprime (soft
   *    delete, la liste l'exclut déjà) plutôt que de laisser une coquille sans
   *    responsable polluer « Comptes sans responsable » du cockpit ;
   *  - le compte a une histoire (analysé) → on RELÂCHE seulement le
   *    responsable. Détruire un dossier réel parce qu'on décoche une carte
   *    serait une perte de données.
   */
  async removeFromPortfolio(userId: string, siren: string): Promise<Result<{ removed: boolean }, AccountFailure>> {
    let workspaceId: string
    try {
      workspaceId = (await this.workspaceContext.resolveActiveWorkspace(userId)).workspaceId
    } catch (err) {
      this.logger.error('removeFromPortfolio: could not resolve an active workspace', { error: err, userId })
      return failure({ code: 'create_failed', message: 'Impossible de résoudre votre espace de travail' })
    }
    try {
      const account = await this.accounts.findOne({ where: { workspace_id: workspaceId, siren } })
      if (!account) return success({ removed: false })
      if (account.status === 'prospect') account.status = 'deleted'
      account.assigned_to = null
      await this.accounts.save(account)
      return success({ removed: true })
    } catch (cause) {
      this.logger.error('removeFromPortfolio error', { error: cause, userId })
      return failure({ code: 'create_failed', message: 'Impossible de retirer ce compte du portefeuille' })
    }
  }

  /** Le compte déjà connu de l'espace pour ce candidat : par SIREN quand il est
   *  fourni (clé forte), sinon par nom exact — jamais un rapprochement flou, qui
   *  attribuerait le mauvais compte. */
  /**
   * #4421.16 — le compte d'une personne que Laura propose hors de l'espace, RETROUVÉ dans l'espace actif avant
   * toute création : le SIREN d'abord, puis le nom NORMALISÉ (formes juridiques neutralisées, accents et
   * ponctuation ignorés — la même clé que Découvrir, `normalizeCompanyNameKey`, GA-26). Seule une clé identique
   * joint : jamais un rapprochement approximatif. Un compte vivant passe avant un compte supprimé.
   */
  async findInWorkspaceForOutsidePerson(
    workspaceId: string,
    input: { siren?: string; company_name: string },
  ): Promise<AccountEntity | null> {
    if (input.siren) {
      const bySiren = await this.accounts.findOne({ where: { workspace_id: workspaceId, siren: input.siren } })
      if (bySiren) return bySiren
    }
    const key = normalizeCompanyNameKey(input.company_name)
    // La clé ne garde que [a-z0-9 ] : son mot le plus long sert de sonde, sans caractère spécial pour ILIKE.
    const probe = key.split(' ').sort((a, b) => b.length - a.length)[0]
    if (!probe) return null
    const candidates = await this.accounts.find({
      where: { workspace_id: workspaceId, company_name: ILike(`%${probe}%`) },
      take: 50,
    })
    const same = candidates.filter(a => normalizeCompanyNameKey(a.company_name ?? '') === key)
    return same.find(a => a.status !== 'deleted') ?? same[0] ?? null
  }

  private async findPortfolioCandidate(workspaceId: string, input: AddToPortfolioInput): Promise<AccountEntity | null> {
    if (input.siren) {
      const bySiren = await this.accounts.findOne({ where: { workspace_id: workspaceId, siren: input.siren } })
      if (bySiren) return bySiren
    }
    return this.accounts.findOne({ where: { workspace_id: workspaceId, company_name: input.company_name } })
  }

  async create(userId: string, dto: CreateAccountDto): Promise<Result<AccountEntity, AccountFailure>> {
    // Multi-user Phase 2 write-path: stamp `workspace_id` on every new account so
    // it shows up in the workspace-scoped reads (list / detail / filters). Resolved
    // from the creator's active workspace — done HERE (not in the controller) so it
    // covers BOTH the browser `POST /accounts` and the analysis pipeline's own
    // `create()`. `workspace_id` is NOT NULL (migration 1784500000000), so we FAIL
    // CLOSED rather than insert an unscoped row: every user is guaranteed a
    // workspace (Phase-1 backfill + the `on_auth_user_created_workspace` trigger),
    // so a resolution failure means something is genuinely broken. `user_id` is
    // kept as the created-by attribution. Both callers handle the failure Result
    // (controller → HTTP error; analysis pipeline → refund slot + fail).
    let workspaceId: string
    try {
      workspaceId = (await this.workspaceContext.resolveActiveWorkspace(userId)).workspaceId
    } catch (err) {
      this.logger.error('create: could not resolve an active workspace for the user', {
        error: err,
        userId,
      })
      return failure({ code: 'create_failed', message: 'Impossible de créer le compte' })
    }
    // #3084 — un SIREN tapé directement dans la barre de recherche (sans passer
    // par l'autocomplétion, dont le clic pose `siren`) partait tel quel comme
    // `company_name` : le dossier gardait les 9 chiffres pour nom, jamais la
    // raison sociale. Résolu ICI, le seul point de création que tout appelant
    // traverse (barre d'analyse, MCP, API directe) — pas dans un seul écran.
    // Échoue OUVERT (Pappers indisponible, aucun match) : le typé reste le nom,
    // comme avant ce correctif — jamais un nom deviné.
    let companyName = dto.company_name
    let siren = dto.siren ?? null
    if (!siren && isBareSiren(companyName)) {
      const resolvedName = await this.resolveCompanyNameFromSiren(companyName)
      if (resolvedName) {
        companyName = resolvedName
        siren = dto.company_name
      }
    }

    const entity = this.accounts.create({
      user_id: userId,
      workspace_id: workspaceId,
      company_name: companyName,
      user_context: dto.user_context || null,
      // Scope lock (Théo p.10) : SIREN de l'entité choisie dans le sélecteur de
      // périmètre, persisté dès la création pour ancrer le run + la dedup.
      siren,
      status: 'analyzing',
      // D'où vient ce compte. Le navigateur envoyait déjà « discover:<siren> »
      // dans `POST /analysis/start`, le contrat disait que c'était « pour tracer
      // l'origine du run », et aucune colonne ne le recevait : le jeton était
      // émis puis jeté. C'est pourtant la seule attribution HONNÊTE dont le
      // bloc « ce que Bellum a contribué » a besoin.
      // `undefined` reste `undefined` : une origine inconnue n'est pas une
      // recherche, et la deviner fabriquerait l'histoire du compte.
      origin: dto.origin ?? null,
      // #3914 — la raison CALCULÉE côté Découvrir, pour que l'analyse puisse
      // plus tard citer sur quoi Découvrir l'avait fait remonter. Jamais posée
      // hors `origin: 'discover'` (le contrat ne l'accepte qu'avec elle).
      discover_origin_reason: dto.discover_origin_reason ?? null,
      // #3819 (lot RBB) — les critères de Découvrir posés ET satisfaits.
      // Absents = `null` (rien à nommer), jamais un objet vide inventé.
      discover_origin_criteria: dto.discover_origin_criteria ?? null,
      // #1408 — ANALYSER UN COMPTE, C'EST LE PRENDRE.
      //
      // Cette ligne manquait, et son absence produisait la contradiction du
      // lot 7 : « Mes comptes » du cockpit filtrait sur le CRÉATEUR pendant que
      // `/comptes` filtrait sur le RESPONSABLE, deux populations sous un seul
      // mot. La cause n'était pourtant ni l'un ni l'autre écran — c'était ce
      // chemin-ci, qui créait un compte que PERSONNE ne portait. Seul « Ajouter
      // au portefeuille » posait `assigned_to` ; lancer une analyse, non.
      //
      // Deux conséquences se règlent d'un coup :
      //  · le cockpit peut lire le portefeuille (`assigned_to`) sans se vider ;
      //  · le manager cesse de compter comme « zone blanche » (#1460) des
      //    comptes qu'un commercial travaille visiblement depuis des semaines.
      //
      // Le stock existant est repris par `BackfillAccountAssignedTo`.
      assigned_to: userId,
    })
    try {
      const saved = await this.accounts.save(entity)
      if (!saved) {
        return failure({ code: 'invalid_input', message: 'Données manquantes lors de la création' })
      }
      // #2151.59 — « reprise quand le candidat devient un dossier de compte » :
      // les notes de terrain déjà écrites sur ce SIREN (rail Découvrir)
      // suivent le compte, même ligne, jamais une copie.
      await this.accountClaims?.emit({ workspaceId, siren: entity.siren, accountId: saved.id })
      return success(saved)
    } catch (cause) {
      this.logger.error('create error', { error: cause })
      return failure({ code: 'create_failed', message: 'Impossible de créer le compte' })
    }
  }

  /** #3084 — la raison sociale d'un SIREN nu, résolue au même registre que
   *  l'autocomplétion (`this.ia.searchCompanies`, back par Pappers). Échoue
   *  OUVERT : Pappers indisponible ou aucun match → `null`, l'appelant garde
   *  le SIREN tapé comme nom plutôt que d'en deviner un. */
  private async resolveCompanyNameFromSiren(siren: string): Promise<string | null> {
    try {
      const { suggestions } = await this.ia.searchCompanies(siren, 1)
      return suggestions.find(s => s.siren === siren)?.name ?? null
    } catch (error) {
      this.logger.warn('resolveCompanyNameFromSiren: registry lookup failed — keeping the typed SIREN as name', {
        error,
        siren,
      })
      return null
    }
  }

  /** "Companies similar to your portfolio" seeds — Phase 2: computed from the
   *  whole workspace's accounts (team-scoped read).
   *
   *  Hybrid ranking (addendum Théo p.5/18) : la découverte reste SEMÉE par NAF
   *  (même secteur registre), puis les candidats sont re-classés contre le
   *  profil vendeur server-side (`userId` → EsnProfileReader) : secteurs cibles
   *  (poids 3) + géographie dept/région (poids 2) + taille effectifs (poids 2).
   *  Déterministe, sans LLM — voir `similar-scoring.ts`. Sans `userId` ou sans
   *  profil, l'ordre de découverte est conservé à l'identique. */
  async listSimilarCompaniesToExplore(workspaceId: string, userId?: string): Promise<SimilarAccountSuggestion[]> {
    // Profil vendeur — résolu server-side ; échec ou absence = profil vide
    // (aucun critère ne matche, l'ordre Pappers est conservé). Jamais bloquant.
    let profile: AnalysisProfileData = {}
    if (userId) {
      try {
        profile = await this.esnProfile.resolveProfileData(userId)
      } catch (err) {
        this.logger.warn('listSimilarCompaniesToExplore: seller profile resolution failed', { error: err, userId })
      }
    }
    const accounts = await this.accounts.find({
      where: workspaceScopeWhere(workspaceId),
      // #1576 — `id` en plus : la raison NOMME le compte d'amorce, et le
      // contrôleur a besoin de son identifiant pour savoir si une mission y a
      // été signée. Sans lui, il faudrait rapprocher par NOM, ce qui est
      // précisément la jointure fragile déjà payée sur cet écran (#1632).
      select: ['id', 'company_name', 'status', 'sector', 'naf_code'],
      order: { created_at: 'DESC' },
      take: 10,
    })
    // #1576 — L'EXCLUSION SE LIT SUR TOUT LE PORTEFEUILLE, ET SUR DEUX CLÉS.
    //
    // ⚠️ Deux défauts trouvés à la recette du 08/09/2026, et le second est le
    // JUMEAU non corrigé de celui que #1632 avait réglé sur `listSimilarToAccount`
    // deux heures plus tôt — une règle écrite pour un cas et pas pour son voisin.
    //
    //  1. La liste ci-dessus est bornée à DIX comptes parce qu'elle sert à
    //     AMORCER. S'en servir aussi pour exclure laissait un onzième compte du
    //     portefeuille se proposer comme découverte.
    //  2. L'exclusion se faisait sur le nom d'AFFICHAGE. Le portefeuille porte
    //     « SNCF » (ce que le commercial a tapé), le registre rend « SOCIETE
    //     NATIONALE SNCF » (la raison sociale) : les deux ne se rencontrent
    //     jamais, et le compte se proposait LUI-MÊME. Mesuré en production, deux
    //     fois, sur le même SIREN 552049447. L'identité d'une entreprise est son
    //     SIREN ; le nom n'en est qu'une étiquette.
    //
    // ⚠️ Les SIREN VIDES n'entrent pas : une entreprise étrangère n'en a pas, et
    // un `null` accueilli ici exclurait toute suggestion hors de France dès qu'un
    // seul compte du portefeuille n'en porte pas.
    const portfolio = await this.accounts.find({
      where: workspaceScopeWhere(workspaceId),
      select: ['company_name', 'status', 'siren'],
    })
    const living = portfolio.filter(account => account.status !== DELETED_ACCOUNT_STATUS)
    const existingNames = new Set(living.map(account => account.company_name.trim().toLowerCase()))
    const existingSirens = new Set(living.map(account => account.siren?.trim()).filter((s): s is string => Boolean(s)))
    // Seed from the portfolio's most recent analysable accounts, ONE per distinct
    // NAF sector (dedup so 3 banks don't all seed "banque"), and keep each seed's
    // NAF code so discovery filters on the registry sector — the same precision as
    // the per-account "Comptes du même secteur" (Théo p.41). The old path seeded a
    // fuzzy sector-LABEL text with NO NAF filter, which surfaced off-sector
    // companies (hébergement social / affaires étrangères for a bank portfolio).
    const seedAccounts: { seed: string; nafCode: string | null; accountId: string; accountName: string }[] = []
    const seenSectors = new Set<string>()
    for (const account of accounts) {
      if (!DISCOVERY_SEED_STATUSES.has(account.status)) continue
      const seed =
        nafSeedToken(account.naf_code) ||
        normalizeDiscoverySeed(account.sector) ||
        normalizeDiscoverySeed(account.company_name)
      if (!seed) continue
      const dedupeKey = account.naf_code ?? seed
      if (seenSectors.has(dedupeKey)) continue
      seenSectors.add(dedupeKey)
      seedAccounts.push({
        seed,
        nafCode: account.naf_code ?? null,
        accountId: account.id,
        accountName: account.company_name,
      })
      if (seedAccounts.length >= 3) break
    }

    if (seedAccounts.length === 0) return []

    const results = await Promise.allSettled(
      seedAccounts.map(({ seed, nafCode }) =>
        this.ia.discoverCompanies(seed, 6, { timeoutMs: 12_000, maxAttempts: 1, nafCode: nafCode ?? undefined }),
      ),
    )

    const seenNames = new Set(existingNames)
    const seenSirens = new Set(existingSirens)
    const candidates: {
      suggestion: CompanySuggestion
      seed: string
      seedAccountId: string
      seedAccountName: string
    }[] = []

    results.forEach((result, index) => {
      const { seed, accountId, accountName } = seedAccounts[index]!
      if (result.status !== 'fulfilled') {
        this.logger.warn('listSimilarCompaniesToExplore discovery failed', {
          error: result.reason,
          seed,
          workspaceId,
        })
        return
      }

      for (const item of result.value.suggestions ?? []) {
        const normalizedName = item.name.trim().toLowerCase()
        if (!normalizedName || seenNames.has(normalizedName)) continue
        // #1576 — la deuxième clé. Un SIREN vide ne rapproche personne : seul un
        // SIREN RENSEIGNÉ et déjà connu du portefeuille exclut.
        const normalizedSiren = item.siren?.trim()
        if (normalizedSiren && seenSirens.has(normalizedSiren)) continue
        seenNames.add(normalizedName)
        if (normalizedSiren) seenSirens.add(normalizedSiren)
        candidates.push({ suggestion: item, seed, seedAccountId: accountId, seedAccountName: accountName })
      }
    })

    // Re-classement hybride déterministe contre le profil vendeur (secteur 3 /
    // géo 2 / taille 2) — profil vide ⇒ ordre de découverte inchangé. Le score
    // normalisé (0..1) n'est exposé que quand au moins un critère a matché.
    // #1576 — une place par amorce AVANT d'en resservir une. Sans cette ligne,
    // un profil vide laisse les six résultats de la première amorce occuper les
    // quatre cartes : mesuré en production le 08/09/2026, `seed_count: 3` et
    // quatre transporteurs issus d'un seul compte. Le classement ne bouge pas —
    // voir `spreadAcrossSeeds`.
    return spreadAcrossSeeds(
      rankSimilarCandidates(candidates, profile),
      4,
      // Le compte d'amorce, par son identifiant. Repli sur le jeton de semence
      // pour les lignes anciennes lues sans `id` : la déduplication ci-dessus
      // garantit déjà un jeton par compte, donc la règle tient dans les deux cas.
      candidate => candidate.seedAccountId || candidate.seed,
    ).map(({ suggestion, seed, score, reasons, confidence, unevaluated, seedAccountName }) => ({
      id: suggestion.siren,
      company_name: suggestion.name,
      sector: suggestion.sector || seed,
      // #1415 — la ville, à part. Elle entrait DÉJÀ dans `description`
      // (ci-dessous) collée au secteur : l'écran affichait donc le secteur en
      // pastille ET dans la phrase, et la ville se perdait entre les deux.
      // `description` ne bouge pas — trois autres écrans la lisent telle
      // quelle. Vide ⇒ `null`, jamais une chaîne vide qui se peindrait comme
      // une ville sans nom.
      city: suggestion.city?.trim() || null,
      description: buildSuggestionDescription(suggestion.city, suggestion.sector, seed),
      // #2040.18 — LE SCORE N'EST PUBLIÉ QUE QUAND SES TROIS AXES ÉTAIENT
      // ÉVALUABLES. Sous ce seuil, le scalaire ne mesurerait pas la proximité du
      // compte mais la complétude du questionnaire : un vendeur qui n'a pas dit
      // sa zone ni sa taille de client cible verrait tous ses candidats à 3/7,
      // c'est-à-dire « moyennement proches », alors que rien ne les en éloigne.
      // La carte garde ses critères matchés (`similarity_reasons`) et reçoit ce
      // qui n'a pas pu être jugé (`similarity_unevaluated`).
      ...(confidence === 'etayee' && score > 0 ? { score_similarity: score / SIMILAR_SCORE_MAX } : {}),
      similarity_confidence: confidence,
      ...(unevaluated.length > 0 ? { similarity_unevaluated: unevaluated } : {}),
      // Sur combien de comptes analysés la proposition est bâtie (D24). Un
      // seul suffisait à remplir la carte : ce n'est alors pas un voisinage
      // de portefeuille mais le prolongement d'un seul compte, et l'écran le
      // DIT plutôt que de laisser le titre le promettre.
      seed_count: seedAccounts.length,
      // #1576 — LA RAISON PRINCIPALE, ET LE COMPTE QU'ELLE NOMME.
      //
      // Le service pose le niveau le plus faible et le seul qu'il puisse
      // connaître seul : la PROVENANCE. Cette suggestion a été découverte à
      // partir du secteur registre de ce compte-là — ce n'est pas une
      // approximation, c'est le fait qui l'a fait exister.
      //
      // Le contrôleur la remonte ensuite à `twin` (une mission signée sur ce
      // compte) ou `tech` (technologies communes discriminantes) : les deux
      // demandent des lectures qui vivent dans d'autres modules, et GA-07
      // interdit qu'un service en importe un autre.
      similarity_headline: { kind: 'sector' as const, referenceAccount: seedAccountName },
      // Les critères RÉELLEMENT matchés, pas seulement leur somme (SIM-01).
      // Trois critères écrasés dans un scalaire donnaient la même phrase à un
      // compte qui en coche trois et à un compte qui n'en coche aucun ; une
      // recommandation qu'on ne peut pas justifier décrédibilise aussi celles
      // qui sont justes. Omis quand la liste est vide : l'écran distingue
      // alors « rien ne t'en rapproche » de « on ne t'a rien dit ».
      ...(reasons.length > 0 ? { similarity_reasons: reasons } : {}),
    }))
  }

  /**
   * Compact portfolio digest for the Copilote when NO single account is active
   * (Théo §13 : « le chat reçoit le workspace + les comptes server-side »). Lets
   * the shared thread answer "quels comptes prioriser ?" or "résume BNP" from the
   * portfolio instead of replying "profil vide". Completed accounts only, most
   * recently touched first, capped — name · sector · score.
   */
  /**
   * Le portefeuille tel que le copilote le voit.
   *
   * Rend AUSSI le total, et c'est le point : la liste est bornée, donc elle est
   * parfois partielle — et une troncature muette produit un mensonge. Vu sur un
   * compte réel le 04/08 : 19 comptes en portefeuille, borne à 15, et le
   * copilote a répondu « Dassault Aviation n'apparaît pas dans les comptes déjà
   * analysés de ton portefeuille » en énumérant sa liste comme si elle était
   * exhaustive. Le compte était là, à l'écran, et jusque dans le panneau de
   * contexte de la conversation. Le modèle ne mentait pas : on lui avait donné
   * une vue partielle sans lui dire qu'elle l'était.
   *
   * La borne existe parce que ces lignes entrent dans un prompt. Elle passe de
   * 15 à 40 — un portefeuille de commercial y tient — et ce qui dépasse est
   * ANNONCÉ par l'appelant plutôt que perdu.
   */
  async listAccountsDigest(
    workspaceId: string,
    limit = 40,
  ): Promise<{
    rows: { id: string; company_name: string; sector: string | null; priority_score: number | null }[]
    total: number
  }> {
    const [rows, total] = await this.accounts.findAndCount({
      where: { ...workspaceScopeWhere(workspaceId), status: 'completed' },
      // `id` is needed so the copilote can pull a named account's full analysis
      // (chat-context resolveAccountByName) — not just show its digest line.
      select: ['id', 'company_name', 'sector', 'priority_score'],
      order: { updated_at: 'DESC' },
      take: limit,
    })
    return {
      rows: rows.map(r => ({
        id: r.id,
        company_name: r.company_name,
        sector: r.sector ?? null,
        priority_score: r.priority_score ?? null,
      })),
      total,
    }
  }

  /**
   * #1581.1 / #1573.1 — CE QUE LE COPILOTE DOIT SAVOIR D'UN COMPTE, EN PLUS DE SON NOM.
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * LE DÉFAUT QUE ÇA CORRIGE
   * ─────────────────────────────────────────────────────────────────────────────
   * Les deux retours demandent la même chose vue de deux écrans : « Laura doit
   * croiser les données privées de l'espace, les signaux actuels, la mémoire
   * marché, et dire ce qu'elle ne sait pas ». Ce qui lui parvenait était
   * « Nom — Secteur — Score/10 », c'est-à-dire aucune des quatre couches. Un
   * modèle à qui on ne donne pas le silence d'un compte ne peut pas répondre
   * « quels comptes ai-je négligés » — il peut seulement en avoir l'air.
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * TROIS FAITS, ET AUCUN N'EST UN JUGEMENT
   * ─────────────────────────────────────────────────────────────────────────────
   *  · le compte est-il SUIVI SANS prochaine action — le prédicat est celui du
   *    bandeau et du cockpit (`FOLLOWED_WITHOUT_NEXT_ACTION_PREDICATE`, qui
   *    interpole lui-même celui du cockpit), jamais une copie : GA-53 a déjà
   *    payé la divergence entre deux écritures de cette règle ;
   *  · la date du dernier ÉCHANGE — une note prise pour soi n'en est pas un,
   *    d'où `interactionActivityKindsSql()` et non « toute activité » ;
   *  · un signal est-il APPARU dans les sept derniers jours — le prédicat du
   *    compteur `newSignals7d`, lui aussi réutilisé verbatim.
   *
   * ⚠️ Le signal se rend en OUI/NON, sans son libellé, et c'est délibéré. Nommer
   * « le » signal supposerait d'en choisir un, donc d'inventer un tri qui n'existe
   * nulle part ailleurs ; et le prédicat partagé ne filtre pas `status = 'active'`
   * (« qu'est-ce qui a bougé cette semaine » n'est pas « qu'est-ce qui bouge
   * encore »), si bien que le dernier libellé lu pourrait désigner un signal déjà
   * retombé. Le copilote a besoin de savoir qu'il y a de quoi regarder — le
   * détail est sur le dossier du compte, à un clic.
   *
   * ⚠️ `lastInteractionAt` à `null` veut dire « aucun échange ENREGISTRÉ », pas
   * « aucun échange ». L'appelant doit l'écrire ainsi : c'est la même règle que
   * partout ailleurs — non mesuré n'est pas mesuré à zéro.
   *
   * La lecture porte sur les comptes DÉJÀ sélectionnés et bornés par
   * `listAccountsDigest` : une requête, jamais une par compte.
   */
  async listCopilotAccountFacts(workspaceId: string, ids: string[]): Promise<Map<string, CopilotAccountFacts>> {
    const facts = new Map<string, CopilotAccountFacts>()
    if (ids.length === 0) return facts
    const rows = await this.accounts.query<
      { id: string; without_next_action: boolean; last_interaction: Date | null; recent_signal: boolean }[]
    >(
      // ⚠️ L'alias est `account` et non `a` : c'est celui sur lequel les deux
      // prédicats partagés sont écrits, et les réécrire serait la COPIE que
      // GA-53 refuse. Leurs sous-requêtes internes gardent leur propre alias.
      `SELECT account.id,
              (${FOLLOWED_WITHOUT_NEXT_ACTION_PREDICATE}) AS "without_next_action",
              (${NEW_SIGNAL_LAST_7_DAYS_PREDICATE}) AS "recent_signal",
              (SELECT MAX(ac.occurred_at) FROM activities ac
                WHERE ac.account_id = account.id AND ac.kind IN ${interactionActivityKindsSql()}) AS "last_interaction"
         FROM accounts account
        WHERE account.workspace_id = $1 AND account.id = ANY($2::uuid[])`,
      [workspaceId, ids],
    )
    for (const row of rows) {
      const at = row.last_interaction
      facts.set(row.id, {
        withoutNextAction: Boolean(row.without_next_action),
        lastInteractionAt: at ? new Date(at).toISOString() : null,
        hasRecentSignal: Boolean(row.recent_signal),
      })
    }
    return facts
  }

  /**
   * #3892.1 (ADD-SANOFI-06, retour bêta Sanofi 08/10/2026) — les NOMS des
   * comptes visés par des éléments de mémoire épinglés, pour que
   * `ChatContextService.loadMemory` étiquette un fait borné à UN compte
   * plutôt que de le laisser se lire comme une règle générale de l'ESN.
   * Batché : une seule requête pour TOUS les comptes visés, jamais une par
   * élément — même discipline que `listCopilotAccountFacts` juste au-dessus.
   *
   * Bornée à l'espace (GA-43) : un identifiant d'un AUTRE espace ne rend
   * rien — ni fuite, ni erreur, juste un nom absent, et l'appelant omet alors
   * l'étiquette plutôt que d'en inventer une.
   */
  async namesForAccounts(workspaceId: string, ids: string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>()
    if (ids.length === 0) return names
    const rows = await this.accounts.find({
      where: { id: In(ids), ...workspaceScopeWhere(workspaceId) },
      select: ['id', 'company_name'],
    })
    for (const row of rows) {
      if (row.company_name) names.set(row.id, row.company_name)
    }
    return names
  }

  /**
   * "Comptes similaires à CE compte" (Théo p.41) — per-account, seeded by the
   * account's own NAF code so the results are genuinely same-sector (a precise
   * registry-code filter), not a fuzzy text match. Falls back to a sector/name
   * text seed when the account has no NAF code (legacy / non-French). Excludes
   * the account itself and any company already tracked in the workspace.
   */
  async listSimilarToAccount(id: string, workspaceId: string, userId?: string): Promise<SimilarAccountSuggestion[]> {
    const account = await this.accounts.findOne({
      where: { id, ...workspaceScopeWhere(workspaceId) },
      // #2127.26 / .27 — le siège et l'effectif, pour dire ce qu'un candidat PARTAGE avec ce compte.
      select: ['id', 'company_name', 'sector', 'naf_code', 'headquarters', 'employees'],
    })
    if (!account) return []
    // With a NAF code, seed `q` with a sector-appropriate name token (the naf
    // filter does the precision); otherwise fall back to the sector/name text.
    const seed =
      nafSeedToken(account.naf_code) ||
      normalizeDiscoverySeed(account.sector) ||
      normalizeDiscoverySeed(account.company_name)
    if (!seed) return []

    // Exclude the account itself + everything already in the workspace pipe.
    //
    // #1632 — SUR DEUX CLÉS, PAS UNE. Le nom d'affichage est celui que le
    // commercial a tapé (« SNCF ») ; celui que le registre rend est la raison
    // sociale complète (« SOCIETE NATIONALE SNCF »). Les deux ne se
    // rencontrent jamais, si bien qu'un compte se proposait LUI-MÊME en tête
    // de ses propres « comptes du même secteur » — mesuré en production le
    // 08/09/2026 sur le SIREN 552049447, des deux côtés. L'identité d'une
    // entreprise est son SIREN ; le nom n'en est qu'une étiquette.
    const workspaceAccounts = await this.accounts.find({
      where: workspaceScopeWhere(workspaceId),
      select: ['company_name', 'status', 'siren'],
    })
    const livingAccounts = workspaceAccounts.filter(a => a.status !== DELETED_ACCOUNT_STATUS)
    const seenNames = new Set(livingAccounts.map(a => a.company_name.trim().toLowerCase()))
    // ⚠️ Les SIREN VIDES n'entrent pas : une entreprise étrangère n'a pas de
    // SIREN, et un `null` accueilli ici exclurait toutes les suggestions hors
    // de France dès qu'un seul compte du portefeuille n'en a pas.
    const seenSirens = new Set(livingAccounts.map(a => a.siren?.trim()).filter((s): s is string => Boolean(s)))

    // #2127.37 — LES SUGGESTIONS QUE CETTE PERSONNE A MASQUÉES SUR CE COMPTE.
    //
    // Lu à CHAQUE réponse, jamais mis en cache : c'est ce qui fait qu'un
    // recalcul (nouvelle découverte Pappers) ne fait jamais revenir ce qui a
    // été masqué — la doctrine « une correction humaine gagne toujours, quelle
    // que soit sa date ». `@Optional()` : sans le repository (specs qui
    // construisent le service par `new` sans le dernier paramètre), personne
    // n'est filtré — comportement identique à avant ce lot.
    const dismissedSirens =
      this.similarAccountDismissals && userId
        ? new Set(
            (
              await this.similarAccountDismissals.find({
                where: { workspace_id: workspaceId, user_id: userId, account_id: id, dismissed_at: Not(IsNull()) },
                select: ['candidate_siren'],
              })
            ).map(row => row.candidate_siren),
          )
        : new Set<string>()

    const discovered = await this.ia
      .discoverCompanies(seed, 6, { timeoutMs: 12_000, maxAttempts: 1, nafCode: account.naf_code ?? undefined })
      .then(res => res.suggestions ?? [])
      .catch(cause => {
        this.logger.warn('listSimilarToAccount discovery failed', { error: cause, id, workspaceId })
        return []
      })

    const suggestions: SimilarAccountSuggestion[] = []
    for (const item of discovered) {
      const normalizedName = item.name.trim().toLowerCase()
      if (!normalizedName || seenNames.has(normalizedName)) continue
      // #1632 — la deuxième clé. Un SIREN vide ne rapproche personne (cf. le
      // témoin de la garde) : seul un SIREN RENSEIGNÉ et déjà connu exclut.
      const normalizedSiren = item.siren?.trim()
      if (normalizedSiren && seenSirens.has(normalizedSiren)) continue
      // #2127.37 — masquée par CETTE personne : elle ne réapparaît pas, mais
      // elle ne bloque pas non plus le NOM/SIREN pour une future découverte
      // différente (contrairement à `seenNames`/`seenSirens`, qui excluent le
      // portefeuille pour de bon).
      if (normalizedSiren && dismissedSirens.has(normalizedSiren)) continue
      seenNames.add(normalizedName)
      if (normalizedSiren) seenSirens.add(normalizedSiren)
      // #2127.26 / .27 — la zone et la taille partagées avec CE compte, vérifiées des deux
      // côtés. Rien de vérifié → pas de champ : un tableau vide se lirait « rien en commun ».
      const shared = sharedWithReference(account, item)
      suggestions.push({
        id: item.siren,
        company_name: item.name,
        sector: item.sector || account.sector || seed,
        description: buildSuggestionDescription(item.city, item.sector, seed),
        // #1632 — le compte de référence est CE compte : c'est son secteur
        // registre qui a produit la suggestion. Le contrôleur peut ensuite
        // remonter la raison à `tech` ; il n'y a pas de `twin` ici, la question
        // « as-tu gagné chez lui » n'a pas de sens sur son propre dossier.
        similarity_headline: { kind: 'sector' as const, referenceAccount: account.company_name },
        ...(shared.length > 0 ? { reference_shared: shared } : {}),
      })
      if (suggestions.length >= 6) break
    }
    return suggestions
  }

  /**
   * #2127.37 — MASQUE une suggestion « compte similaire », pour CETTE personne
   * sur CE compte. `upsert` sur la clé composite : un second masquage de la
   * même suggestion ne crée pas une seconde ligne, il rafraîchit `dismissed_at`.
   *
   * `@Optional()` sans le repository (déploiement antérieur au lot, ou spec qui
   * ne l'a pas branché) : NO-OP silencieux, jamais une erreur — la carte garde
   * son comportement d'avant ce lot.
   */
  async dismissSimilarSuggestion(
    workspaceId: string,
    userId: string,
    accountId: string,
    candidateSiren: string,
  ): Promise<void> {
    if (!this.similarAccountDismissals) return
    await this.similarAccountDismissals.upsert(
      {
        workspace_id: workspaceId,
        user_id: userId,
        account_id: accountId,
        candidate_siren: candidateSiren,
        dismissed_at: new Date(),
      },
      ['workspace_id', 'user_id', 'account_id', 'candidate_siren'],
    )
  }

  /**
   * #2127.37 — DÉMASQUE une suggestion déjà masquée. La ligne n'est jamais
   * supprimée (doctrine « on archive, on ne supprime pas ») : `dismissed_at`
   * repasse à `NULL`, et c'est cette colonne — jamais l'existence de la ligne
   * — que `listSimilarToAccount` interroge.
   */
  async restoreSimilarSuggestion(
    workspaceId: string,
    userId: string,
    accountId: string,
    candidateSiren: string,
  ): Promise<void> {
    if (!this.similarAccountDismissals) return
    await this.similarAccountDismissals.upsert(
      {
        workspace_id: workspaceId,
        user_id: userId,
        account_id: accountId,
        candidate_siren: candidateSiren,
        dismissed_at: null,
      },
      ['workspace_id', 'user_id', 'account_id', 'candidate_siren'],
    )
  }

  /**
   * #4731 — LA CLÉ D'UN GESTE SUR UN COMPTE : l'ESPACE de l'appelant, jamais son
   * rôle de propriétaire. `user_id` désigne qui a LANCÉ l'analyse ; un filtre
   * dessus rendait au coéquipier un geste à zéro ligne (doctrine c76 : le rôle
   * change l'ordre, jamais le contenu). On ouvre à l'espace, jamais au-delà.
   */
  private async accountGestureWhere(id: string, userId: string): Promise<FindOptionsWhere<AccountEntity>[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    // Un OU : une ligne ANCIENNE (`workspace_id` NULL) garde son geste pour son propriétaire —
    // ce que personne ne porte ne disparaît pour personne. Un autre espace reste refusé.
    return [
      { id, ...workspaceScopeWhere(workspaceId) },
      { id, workspace_id: IsNull(), user_id: userId },
    ]
  }

  async delete(id: string, userId: string): Promise<Result<{ deleted: true }, AccountFailure>> {
    try {
      await this.accounts.update(await this.accountGestureWhere(id, userId), {
        status: DELETED_ACCOUNT_STATUS,
        error_message: null,
      })
      return success({ deleted: true })
    } catch (cause) {
      this.logger.error('delete error', { error: cause })
      return failure({ code: 'delete_failed', message: 'Impossible de supprimer le compte' })
    }
  }

  async archive(id: string, userId: string): Promise<Result<{ archived: true }, AccountFailure>> {
    try {
      // Archive = état d'analyse ET tri commercial (Théo p.39) — le compte quitte
      // le pipe. Garde les deux colonnes cohérentes avec l'onglet « Écartés ».
      await this.accounts.update(await this.accountGestureWhere(id, userId), {
        status: 'archived',
        commercial_status: 'archived',
        error_message: null,
      })
      return success({ archived: true })
    } catch (cause) {
      this.logger.error('archive error', { error: cause })
      return failure({ code: 'archive_failed', message: "Impossible d'archiver le compte" })
    }
  }

  /**
   * #4621.3 — archive les coquilles d'analyses échouées VIDES d'UN jour de création, dans UN espace (lot daté).
   * Voir `account-failed-shells.ts` : on archive, on ne supprime pas, jamais le parc entier.
   */
  async archiveFailedShells(
    workspaceId: string,
    opts: { createdOn: string; expected?: number; dryRun?: boolean },
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<Result<ArchiveFailedShellsOutcome, AccountFailure>> {
    try {
      return await archiveFailedShells(this.accounts.manager, workspaceId, { ...opts, businessUnitScope })
    } catch (cause) {
      this.logger.error('archive failed shells error', { error: cause })
      return failure({ code: 'archive_failed', message: "Impossible d'archiver ce lot de coquilles" })
    }
  }

  /**
   * Théo A comptes-fiche-reference.A2 — « Créer une copie de travail » d'un dossier
   * de référence (archive figée). L'archive reste intacte ; la copie en reprend le
   * contenu ET les notes (décision Louis 22/10 : la copie hérite des notes) et
   * s'actualise comme un compte ordinaire. Idempotent : une copie déjà ouverte
   * est rendue telle quelle, jamais dupliquée.
   */
  async createWorkingCopy(
    archiveId: string,
    userId: string,
  ): Promise<Result<{ id: string; created: boolean }, AccountFailure>> {
    try {
      const archive = await this.accounts.findOne({ where: { id: archiveId } })
      if (!archive) return failure({ code: 'not_found', message: 'Compte introuvable' })
      if (!readReferenceArchive(archive.raw_analysis)) {
        return failure({
          code: 'invalid_input',
          message: "Ce dossier n'est pas une archive : il s'actualise directement.",
        })
      }

      const existing = await this.accounts.manager.query<Array<{ id: string }>>(
        `SELECT id FROM accounts
          WHERE workspace_id = $1 AND raw_analysis->>'working_copy_of' = $2
            AND status NOT IN ('deleted', 'archived')
          LIMIT 1`,
        [archive.workspace_id, archive.id],
      )
      if (existing[0]) return success({ id: existing[0].id, created: false })

      const copyId = await this.accounts.manager.transaction(async runner => {
        const repo = runner.getRepository(AccountEntity)
        const saved = await repo.save(repo.create({ ...buildWorkingCopyFields(archive), user_id: userId }))
        await runner.query(
          `INSERT INTO notes (workspace_id, user_id, entity_type, entity_id, body, pinned, also_applies_to_account_ids)
           SELECT workspace_id, user_id, entity_type, $2, body, pinned, '{}'
             FROM notes
            WHERE entity_type = 'account' AND entity_id = $1 AND workspace_id IS NOT DISTINCT FROM $3`,
          [archive.id, saved.id, archive.workspace_id],
        )
        return saved.id
      })
      return success({ id: copyId, created: true })
    } catch (cause) {
      this.logger.error('createWorkingCopy error', { error: cause })
      return failure({ code: 'create_failed', message: 'Impossible de créer la copie de travail' })
    }
  }

  /**
   * « Rattacher ce dossier à un autre » (#1111) — ce que le geste fera.
   *
   * Calculé AVANT d'écrire et rendu tel quel à l'écran : c'est la même fonction
   * pure que l'écriture applique, donc la prévisualisation ne peut pas
   * diverger. Même discipline que la simulation de l'assistant d'import.
   */
  async previewAbsorb(
    absorbedId: string,
    keptId: string,
    userId: string,
  ): Promise<Result<AbsorbPreview, AccountFailure>> {
    const loaded = await this.loadAbsorbPair(absorbedId, keptId, userId)
    if (isFailure(loaded)) return loaded
    const { absorbed, kept, plan } = loaded.output
    return success({
      absorbedName: absorbed.companyName,
      keptName: kept.companyName,
      movedContacts: plan.movedContactIds.length,
      keptContacts: plan.keptContacts,
      entityName: plan.entity.name,
    })
  }

  /**
   * Rattacher un dossier en double à celui qu'on garde (#1111).
   *
   * Le dossier absorbé n'est PAS supprimé : il devient une entité du compte
   * gardé, ses contacts le rejoignent, et lui-même passe en `archived` avec un
   * pointeur vers son nouveau parent. Tout le reste — signaux, projets, plan,
   * historique — RESTE sur le dossier archivé, qui demeure lisible. Rien n'est
   * perdu, et l'écran le dit avant le clic.
   *
   * Une seule transaction : un rattachement à moitié fait laisserait des
   * contacts sur un compte que plus rien ne désigne.
   */
  async absorbAccount(
    absorbedId: string,
    keptId: string,
    userId: string,
  ): Promise<Result<AbsorbPreview, AccountFailure>> {
    const loaded = await this.loadAbsorbPair(absorbedId, keptId, userId)
    if (isFailure(loaded)) return loaded
    const { absorbed, kept, plan } = loaded.output

    try {
      await this.accounts.manager.transaction(async runner => {
        // 1. L'entité d'accueil. `subsidiary` : le clic EST l'affirmation que ce
        //    dossier est une subdivision de l'autre.
        const created = await runner.query(
          `
          INSERT INTO account_entities (workspace_id, account_id, name, kind, siren, domain)
          SELECT a.workspace_id, $1, $2, $3, $4, $5 FROM accounts a WHERE a.id = $1
          RETURNING id
          `,
          [keptId, plan.entity.name, plan.entity.kind, plan.entity.siren, plan.entity.domain],
        )
        const entityId = firstReturnedRow<{ id: string }>(created)?.id ?? null

        // 2. Les contacts qui peuvent bouger, rattachés à cette entité. Ceux qui
        //    restent ont été écartés par le plan — jamais écrasés : la fiche la
        //    plus renseignée des deux survit.
        if (plan.movedContactIds.length > 0) {
          await runner.query(`UPDATE contacts SET account_id = $1, entity_id = $2 WHERE id = ANY($3::uuid[])`, [
            keptId,
            entityId,
            plan.movedContactIds,
          ])
        }

        // 3. Le dossier absorbé est RANGÉ, pas effacé — et il dit où il est
        //    parti, sinon un compte archivé n'a aucune explication à l'écran.
        //
        //    Il garde AUSSI ce qu'il était juste avant, et de quand date le
        //    geste. `status`/`commercial_status` sont écrasés par 'archived'
        //    dans le même UPDATE : sans cette copie, l'état d'avant ne
        //    survivrait nulle part et le détachement devrait INVENTER un
        //    statut de retour. Ces colonnes sont lues par `account-detach.ts`.
        //
        //    ⚠️ En SQL, toutes les expressions du SET lisent la ligne AVANT la
        //    mise à jour : `COALESCE(merged_previous_status, status)` capture
        //    donc bien l'ancien statut, pas 'archived'. Le COALESCE protège un
        //    second passage — un dossier ne se rattache pas deux fois, mais il
        //    coûte moins cher qu'une reprise.
        await runner.query(
          `UPDATE accounts
             SET merged_previous_status = COALESCE(merged_previous_status, status),
                 merged_previous_commercial_status = COALESCE(merged_previous_commercial_status, commercial_status),
                 status = 'archived',
                 commercial_status = 'archived',
                 merged_into_id = $2,
                 merged_at = now(),
                 merged_by = $3,
                 merged_entity_id = $4
           WHERE id = $1`,
          [absorbedId, keptId, userId, entityId],
        )
      })
    } catch (cause) {
      this.logger.error('absorb account failed', { error: cause, absorbedId, keptId })
      return failure({ code: 'absorb_failed', message: 'Le rattachement n’a pas pu être enregistré.' })
    }

    this.logger.log('Account absorbed', {
      absorbedId,
      keptId,
      movedContacts: plan.movedContactIds.length,
      leftBehind: plan.keptContacts.length,
    })
    return success({
      absorbedName: absorbed.companyName,
      keptName: kept.companyName,
      movedContacts: plan.movedContactIds.length,
      keptContacts: plan.keptContacts,
      entityName: plan.entity.name,
    })
  }

  /** Les deux dossiers, leurs contacts et le plan — la lecture commune à la
   *  prévisualisation et à l'écriture, pour qu'elles ne puissent pas diverger. */
  private async loadAbsorbPair(
    absorbedId: string,
    keptId: string,
    userId: string,
  ): Promise<Result<{ absorbed: AbsorbAccount; kept: AbsorbAccount; plan: AbsorbPlan }, AccountFailure>> {
    const [absorbedRow, keptRow] = await Promise.all([this.findOne(absorbedId, userId), this.findOne(keptId, userId)])
    if (isFailure(absorbedRow)) return absorbedRow
    if (isFailure(keptRow)) return keptRow

    const toAbsorb = (row: AccountEntity): AbsorbAccount => ({
      id: row.id,
      companyName: row.company_name ?? '',
      siren: row.siren ?? null,
      website: row.website ?? null,
      status: row.status ?? '',
      mergedIntoId: row.merged_into_id ?? null,
    })
    const absorbed = toAbsorb(absorbedRow.output)
    const kept = toAbsorb(keptRow.output)

    const refusal = refuseAbsorb(absorbed, kept)
    if (refusal) {
      // Le refus est NOMMÉ : un refus muet sur un geste irréversible fait
      // recommencer.
      return failure({ code: 'invalid_input', message: ABSORB_REFUSAL_MESSAGES[refusal] })
    }

    const contacts = await this.contactsOfAccounts([absorbedId, keptId])
    const plan = planAbsorb({
      absorbed,
      absorbedContacts: contacts
        .filter(c => c.account_id === absorbedId)
        .map(c => ({ id: c.id, fullName: c.full_name ?? '' })),
      keptContacts: contacts.filter(c => c.account_id === keptId).map(c => ({ id: c.id, fullName: c.full_name ?? '' })),
    })
    return success({ absorbed, kept, plan })
  }

  /**
   * #4158 EX-03 — les AUTRES entités du groupe de ce compte (une fiche par entité),
   * cloisonnées par le même périmètre BU que le reste. Voir `account-group-entities.ts`.
   */
  async getGroupEntities(
    id: string,
    workspaceId: string,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<GroupEntityView[]> {
    return listGroupEntities(this.accounts.manager, id, workspaceId, businessUnitScope)
  }

  /**
   * Les deux sens du lien « même groupe » pour un compte (#1111).
   *
   * ⚠️ Ce bloc documentait `getAccountLinks` mais flottait au-dessus de
   * `getGroupEntities`, qui a sa propre en-tête : il est redescendu sur la
   * méthode qu'il décrit (#4786).
   *
   * Raison d'être : `merged_into_id` était ÉCRITE et jamais relue. La migration
   * qui l'a créée disait pourtant sa raison en toutes lettres — « dire à
   * l'écran : ce dossier a été rattaché à KLESIA, au lieu de laisser un compte
   * archivé sans explication ». Personne n'appelait cette donnée ; c'est ce que
   * cette lecture répare.
   *
   * Les deux bouts passent par `findOneForWorkspace`, qui filtre déjà
   * l'appartenance : un lien ne peut donc pas traverser deux espaces. Les
   * espaces sont des ESN, donc des concurrents.
   *
   * ⚠️ #4786 (arbitrage Louis, 29/10/2026) — ILS PASSENT AUSSI PAR LE PÉRIMÈTRE BU.
   *
   * Cette lecture appelait `findOneForWorkspace(accountId, workspaceId)` — deux
   * arguments, donc sans périmètre — et retombait sur `findOne(accountId, userId)`
   * quand aucun espace n'était passé. GA-336 le signalait depuis le 28/10 ; la
   * réponse apportée avait été d'INSCRIRE l'appel au registre de dette en
   * s'autorisant d'une « EXCEPTION DATÉE (Louis, 28/10/2026) » qui n'a jamais
   * existé — l'issue qui la cite est née le 29/10 à 07:06, la ligne a été écrite
   * à 08:31. Une garde protège une règle, elle ne l'invente pas.
   *
   * Ce que la fuite donnait : « fusionné dans » nomme une RAISON SOCIALE. Un
   * membre d'une agence ouvrait un compte de la sienne et lisait le nom du
   * compte d'une AUTRE agence auquel il avait été rattaché — la même fuite que
   * GA-367 a fermée pour les six agrégats qui nommaient des comptes. Le repli
   * `user_id` est retiré : `workspaceId` est désormais obligatoire, et le seul
   * appelant (`GET :id/links`) le résout déjà en amont.
   */
  async getAccountLinks(
    id: string,
    workspaceId: string,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<Result<AccountLinksView, AccountFailure>> {
    // #4609.3 — la liste des comptes est lue PAR ESPACE : le compte d'un collègue s'ouvre et ses liens se
    // lisent (`user_id` seul rendait un 404). #4786 — et par PÉRIMÈTRE : hors de l'un ou de l'autre,
    // toujours `not_found`, jamais « interdit » (on ne révèle pas l'existence d'un compte qu'on ne sert pas).
    const read = (accountId: string) => this.findOneForWorkspace(accountId, workspaceId, businessUnitScope)
    const own = await read(id)
    if (isFailure(own)) return own
    const account = own.output

    // Le dossier auquel CELUI-CI est rattaché. Relu par `findOne` : si la cible
    // sort du périmètre du lecteur, on ne la nomme pas — on ne fuite pas un nom
    // de compte par un pointeur.
    let mergedInto: LinkedAccountView | null = null
    if (account.merged_into_id) {
      const target = await read(account.merged_into_id)
      if (!isFailure(target)) {
        mergedInto = {
          id: target.output.id,
          companyName: target.output.company_name ?? '',
          status: target.output.status ?? '',
          // La date du LIEN, pas celle de la ligne cible.
          linkedAt: account.merged_at ? new Date(account.merged_at).toISOString() : null,
        }
      }
    }

    // Les dossiers rattachés à celui-ci, dans le même espace que lui.
    //
    // #4786 — et dans le même PÉRIMÈTRE : cette liste NOMME des comptes (raison
    // sociale et statut), c'est donc exactement ce que GA-367 a descendu dans la
    // requête pour les agrégats. La FORME de la règle vient de
    // `businessUnitScopeClause` (GA-26) ; seul le dialecte est à nous —
    // `unnest($2::uuid[])`, positionnel, parce que c'est du SQL brut.
    // ⚠️ La clause s'AJOUTE : la borne d'espace du `WHERE` SURVIT.
    const scopeClause = businessUnitScopeClause(businessUnitScope, 'a.business_unit_id', 'SELECT unnest($2::uuid[])')
    const linkedParams: unknown[] = [id]
    if (businessUnitScope && businessUnitScope.businessUnitIds.length > 0) {
      linkedParams.push([...businessUnitScope.businessUnitIds])
    }
    const rows = await this.accounts.manager.query(
      `SELECT a.id, a.company_name, a.status, a.merged_at
         FROM accounts a
        WHERE a.merged_into_id = $1
          AND a.workspace_id IS NOT DISTINCT FROM (SELECT workspace_id FROM accounts WHERE id = $1)
          ${scopeClause ? `AND ${scopeClause}` : ''}
        ORDER BY a.merged_at DESC NULLS LAST, a.company_name ASC`,
      linkedParams,
    )
    const linked = returnedRows<{
      id: string
      company_name: string | null
      status: string | null
      merged_at: Date | string | null
    }>(rows).map(row => ({
      id: row.id,
      companyName: row.company_name ?? '',
      status: row.status ?? '',
      linkedAt: row.merged_at ? new Date(row.merged_at).toISOString() : null,
    }))

    const refusal = refuseDetach(this.toDetachAccount(account))
    return success({
      mergedInto,
      linked,
      detachRefusal: refusal,
      detachRefusalMessage: refusal ? DETACH_REFUSAL_MESSAGES[refusal] : null,
    })
  }

  /** La vue « détachement » d'une ligne de compte — une dérivation, à UN seul
   *  endroit, pour que la prévisualisation et l'écriture lisent la même chose. */
  private toDetachAccount(row: AccountEntity): DetachAccount {
    return {
      id: row.id,
      mergedIntoId: row.merged_into_id ?? null,
      previousStatus: row.merged_previous_status ?? null,
      previousCommercialStatus: row.merged_previous_commercial_status ?? null,
      hostEntityId: row.merged_entity_id ?? null,
    }
  }

  /** Ce que le détachement FERA — un GET, il n'écrit rien. Même fonction pure
   *  que l'écriture applique, donc les deux ne peuvent pas diverger. */
  async previewDetach(id: string, userId: string): Promise<Result<DetachPreview, AccountFailure>> {
    const loaded = await this.loadDetachPair(id, userId)
    if (isFailure(loaded)) return loaded
    const { detached, kept, plan } = loaded.output
    return success({
      detachedName: detached.company_name ?? '',
      keptName: kept?.company_name ?? '',
      returnedContacts: plan.returnedContactIds.length,
      keptContacts: plan.keptContacts,
    })
  }

  /**
   * Détacher un dossier de celui auquel il avait été rattaché (#1111).
   *
   * DÉFAIT le geste, ne fabrique rien : le dossier retrouve le statut qu'il
   * avait — celui qui a été ENREGISTRÉ, jamais un statut choisi —, ses contacts
   * reviennent, et le lien est effacé.
   *
   * L'entité d'accueil n'est retirée que si plus aucun contact ne s'y rattache :
   * quelqu'un a pu y ranger un contact depuis, et « on archive, on ne supprime
   * pas » vaut aussi pour une subdivision que le produit avait créée.
   */
  async detachAccount(id: string, userId: string): Promise<Result<DetachPreview, AccountFailure>> {
    const loaded = await this.loadDetachPair(id, userId)
    if (isFailure(loaded)) return loaded
    const { detached, kept, plan, view } = loaded.output

    try {
      await this.accounts.manager.transaction(async runner => {
        // 1. Les contacts qui reviennent. Ceux qui restent ont été écartés par
        //    le plan — jamais écrasés.
        if (plan.returnedContactIds.length > 0) {
          await runner.query(`UPDATE contacts SET account_id = $1, entity_id = NULL WHERE id = ANY($2::uuid[])`, [
            id,
            plan.returnedContactIds,
          ])
        }

        // 2. L'entité d'accueil, si elle est devenue vide. Un DELETE conditionné
        //    par l'absence de contact : si quelqu'un y a rangé quelque chose, la
        //    subdivision a pris une vie propre et on la laisse.
        if (view.hostEntityId) {
          await runner.query(
            `DELETE FROM account_entities e
              WHERE e.id = $1
                AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.entity_id = e.id)`,
            [view.hostEntityId],
          )
        }

        // 3. Le dossier retrouve son état d'avant, et le lien disparaît.
        //    `merged_previous_*` repasse à NULL : le lien n'existe plus, donc
        //    l'état d'avant ce lien n'a plus de sens à porter.
        await runner.query(
          `UPDATE accounts
             SET status = $2,
                 commercial_status = $3,
                 merged_into_id = NULL,
                 merged_at = NULL,
                 merged_by = NULL,
                 merged_previous_status = NULL,
                 merged_previous_commercial_status = NULL,
                 merged_entity_id = NULL
           WHERE id = $1`,
          [id, plan.restoredStatus, plan.restoredCommercialStatus],
        )
      })
    } catch (cause) {
      this.logger.error('detach account failed', { error: cause, accountId: id })
      return failure({ code: 'detach_failed', message: 'Le détachement n’a pas pu être enregistré.' })
    }

    this.logger.log('Account detached', {
      accountId: id,
      keptId: view.mergedIntoId,
      returnedContacts: plan.returnedContactIds.length,
      leftBehind: plan.keptContacts.length,
      detachedBy: userId,
    })
    return success({
      detachedName: detached.company_name ?? '',
      keptName: kept?.company_name ?? '',
      returnedContacts: plan.returnedContactIds.length,
      keptContacts: plan.keptContacts,
    })
  }

  /** Le dossier, celui auquel il est rattaché, et le plan — la lecture commune
   *  à la prévisualisation et à l'écriture, pour qu'elles ne divergent pas. */
  private async loadDetachPair(
    id: string,
    userId: string,
  ): Promise<
    Result<
      { detached: AccountEntity; kept: AccountEntity | null; plan: DetachPlan; view: DetachAccount },
      AccountFailure
    >
  > {
    const own = await this.findOne(id, userId)
    if (isFailure(own)) return own
    const detached = own.output
    const view = this.toDetachAccount(detached)

    const refusal = refuseDetach(view)
    if (refusal) {
      // Le refus est NOMMÉ. Celui du lien trop ancien explique POURQUOI : un
      // bouton grisé sans raison se lit comme une panne.
      return failure({ code: 'invalid_input', message: DETACH_REFUSAL_MESSAGES[refusal] })
    }

    // `mergedIntoId` est garanti non nul par `refuseDetach`.
    const keptRow = view.mergedIntoId ? await this.findOne(view.mergedIntoId, userId) : null
    const kept = keptRow && !isFailure(keptRow) ? keptRow.output : null

    // Les contacts que l'entité d'accueil porte, et ceux déjà présents sur le
    // dossier rendu. Sans entité d'accueil, aucun contact n'est identifiable :
    // le détachement rend son statut au dossier, et le dit.
    const hostedRows = view.hostEntityId
      ? await this.accounts.manager.query(`SELECT id, full_name FROM contacts WHERE entity_id = $1`, [
          view.hostEntityId,
        ])
      : []
    const homeRows = await this.accounts.manager.query(`SELECT id, full_name FROM contacts WHERE account_id = $1`, [id])
    const toContact = (row: { id: string; full_name: string | null }) => ({ id: row.id, fullName: row.full_name ?? '' })

    const plan = planDetach({
      account: view,
      hostedContacts: returnedRows<{ id: string; full_name: string | null }>(hostedRows).map(toContact),
      homeContacts: returnedRows<{ id: string; full_name: string | null }>(homeRows).map(toContact),
    })
    return success({ detached, kept, plan, view })
  }

  /**
   * Paginated slice of ``raw_analysis.branches`` for an account — the only
   * endpoint that exposes the branches payload. ``findOne`` strips
   * ``branches`` so this is the sole consumer; Pappers dumps 1000+
   * établissements on large groups so we slice *inside Postgres* via
   * ``jsonb_array_elements ... WITH ORDINALITY`` rather than loading the
   * full blob into Node memory just to ``.slice()`` in JS.
   */
  async getBranchesForWorkspace(
    id: string,
    workspaceId: string,
    offset: number,
    limit: number,
  ): Promise<
    Result<
      {
        data: unknown[]
        pagination: {
          currentPage: number
          size: number
          totalItems: number
          totalPages: number
          hasNext: boolean
          hasPrev: boolean
        }
      },
      AccountFailure
    >
  > {
    const row = await this.accounts.findOne({
      where: { id, ...workspaceScopeWhere(workspaceId) },
      select: ['id', 'raw_analysis'],
    })
    if (!row) {
      return failure({ code: 'not_found', message: `Account ${id} not found` })
    }
    const raw = (row.raw_analysis ?? {}) as Record<string, unknown>
    const all = Array.isArray(raw['branches']) ? (raw['branches'] as unknown[]) : []
    const items = all.slice(offset, offset + limit)
    const current = Math.floor(offset / limit) + 1
    const totalPages = all.length === 0 ? 0 : Math.ceil(all.length / limit)
    return success({
      data: items,
      pagination: {
        currentPage: current,
        size: limit,
        totalItems: all.length,
        totalPages,
        hasNext: current < totalPages,
        hasPrev: current > 1,
      },
    })
  }

  /** Persist the Phase 1 research payload onto an account.
   *  ``raw_analysis`` is normalized to snake_case so the JSONB blob matches
   *  the rest of the Postgres schema + ``@bellum/contracts`` types.
   *
   *  The Pappers ``siren`` is lifted out of the blob onto its own column (only
   *  when present) so the per-company result cache (C1) can key on a stable id
   *  instead of free-text. We never write ``siren: null`` over an existing
   *  value when a later research pass happens to omit it.
   *
   *  Same lift for the cross-border pivot: a non-FR run whose country pack
   *  resolved a national registry identity carries ``registryId`` /
   *  ``registryCountry`` — persisted canonicalised on ``registry_id`` /
   *  ``registry_country`` with the same newest-run-wins dedup as the SIREN.
   */
  /**
   * Reflète `esnPresence` dans `account_partners`, en `source = 'analysis'`.
   *
   * Trois règles, chacune pour un accident précis :
   *
   * 1. **Une ligne DÉCLARÉE n'est jamais touchée.** Le commercial qui a saisi
   *    « Sopra, rang 1, on travaille avec eux » en sait plus que le pipeline ;
   *    l'écraser à chaque run lui reprendrait son travail toutes les semaines.
   * 2. **Une ligne ÉCARTÉE n'est jamais ressuscitée.** C'est tout l'objet du
   *    bouton « Ce n'est pas exact » : sans cette clause, la correction serait
   *    défaite par l'analyse suivante.
   * 3. **Ni le rang ni la relation ne sont devinés.** Une ESN détectée arrive
   *    en `unknown`/`unknown` — « concurrencer ou solliciter en rang 2 » est la
   *    décision de l'utilisateur, pas une déduction du pipeline.
   *
   * Best-effort : une analyse ne tombe pas parce que le paysage concurrentiel
   * n'a pas pu s'écrire. Le dossier, lui, est la livraison.
   */
  /**
   * Écrit ce que la commande publique dit du verrouillage d'un compte.
   *
   * Une seule déduction, et elle est PURE (`lockFactFromAwards`) : un marché
   * attribué veut dire qu'un prestataire est en place, pas que le panel est
   * fermé — DECP ne publie pas l'échéance ici. Sans attribution, rien n'est
   * écrit : déduire « ouvert » d'un silence serait promettre une porte que
   * personne n'a vue, et une entreprise privée n'apparaît dans aucun registre
   * de marchés publics.
   *
   * L'index unique partiel côté base fait l'idempotence : un compte réanalysé
   * douze fois ne porte pas douze fois le même constat.
   */
  private async seedAccessFacts(accountId: string, data: AnalysisResearchData, manager?: EntityManager): Promise<void> {
    if (!manager && !this.accessFacts) return
    const awards = (data as unknown as { awardedContracts?: unknown }).awardedContracts
    const lock = lockFactFromAwards(Array.isArray(awards) ? awards : [])
    if (!lock) return
    try {
      await this.optionalWrite(manager, async m => {
        const repo = m ? m.getRepository(AccessFactEntity) : this.accessFacts
        if (!repo) return
        const account = await (m ? m.getRepository(AccountEntity) : this.accounts).findOne({
          where: { id: accountId },
          select: { id: true, workspace_id: true },
        })
        if (!account?.workspace_id) return
        // Le pipeline n'a qu'UNE conclusion courante. Depuis que l'échéance est
        // lue (tome 2 §14), sa valeur CHANGE d'une analyse à l'autre — « il y a
        // une porte » devient « verrouillé jusqu'au 12/03/2029 » — et l'ancienne
        // ligne resterait à côté de la nouvelle, avec la même provenance et la
        // même date d'observation : `bestAccessFact` les départagerait dans
        // l'ordre où la base les rend. Une correction HUMAINE, elle, n'est jamais
        // balayée : c'est toute la promesse de « Ce n'est pas exact ».
        await repo.query(
          `DELETE FROM access_facts
          WHERE account_id = $1 AND kind = 'lock' AND provenance = 'pipeline' AND value <> $2`,
          [accountId, lock.value],
        )
        await repo.query(
          `INSERT INTO access_facts
           (workspace_id, account_id, kind, value, detail, source, provenance, observed_at, reopens_on)
         VALUES ($1, $2, 'lock', $3, $4, $5, 'pipeline', $6, $7)
         ON CONFLICT (account_id, kind, value) WHERE provenance = 'pipeline'
         DO UPDATE SET detail = EXCLUDED.detail, observed_at = EXCLUDED.observed_at, reopens_on = EXCLUDED.reopens_on`,
          [account.workspace_id, accountId, lock.value, lock.detail, lock.source, lock.observedAt, lock.reopensOn],
        )
      })
    } catch (error) {
      this.logger.warn('seedAccessFacts failed', { error, accountId })
    }
  }

  private async seedDetectedPartners(
    accountId: string,
    data: AnalysisResearchData,
    manager?: EntityManager,
  ): Promise<void> {
    if (!manager && !this.accountPartners) return
    const raw = (data as unknown as { esnPresence?: unknown }).esnPresence
    const detected = detectedPartnersFrom(Array.isArray(raw) ? raw : [])
    if (detected.length === 0) return
    try {
      await this.optionalWrite(manager, async m => {
        const repo = m ? m.getRepository(AccountPartnerEntity) : this.accountPartners
        if (!repo) return
        const account = await (m ? m.getRepository(AccountEntity) : this.accounts).findOne({
          where: { id: accountId },
          select: { id: true, workspace_id: true },
        })
        if (!account?.workspace_id) return
        for (const partner of detected) {
          await repo.query(
            `INSERT INTO account_partners
             (workspace_id, account_id, name, rank, relationship, note, source, placements, certainty, scope, detected_at)
           VALUES ($1, $2, $3, 'unknown', 'unknown', $4, 'analysis', 0, $5, $6, $7)
           ON CONFLICT (account_id, lower(name)) DO UPDATE SET
             note        = EXCLUDED.note,
             certainty   = EXCLUDED.certainty,
             scope       = EXCLUDED.scope,
             detected_at = EXCLUDED.detected_at
           WHERE account_partners.source = 'analysis'
             AND account_partners.dismissed_at IS NULL`,
            [
              account.workspace_id,
              accountId,
              partner.name,
              partner.note,
              partner.certainty,
              partner.scope,
              partner.detectedAt,
            ],
          )
        }
      })
    } catch (error) {
      this.logger.warn('seedDetectedPartners failed', { error, accountId })
    }
  }

  /**
   * Incident 24/09 — une écriture FACULTATIVE s'isole dans un SAVEPOINT.
   *
   * En Postgres, une requête en erreur ABANDONNE toute la transaction : attraper
   * l'erreur et avertir ne suffit pas, la requête suivante de `saveResearch`
   * rend « current transaction is aborted » et l'analyse échoue. Un
   * `manager.transaction` imbriqué pose un SAVEPOINT (TypeORM, `transactionDepth`)
   * et son échec se replie sur lui seul. Hors transaction, rien à isoler.
   */
  private optionalWrite(
    manager: EntityManager | undefined,
    work: (m: EntityManager | undefined) => Promise<void>,
  ): Promise<void> {
    return manager ? manager.transaction(inner => work(inner)) : work(undefined)
  }

  /**
   * Reprise des dossiers déjà analysés (recette live du tome 1).
   *
   * `seedDetectedPartners` ne tourne qu'au moment où une analyse SE TERMINE. Les
   * dossiers analysés AVANT ce déploiement portent pourtant leur `esnPresence`
   * dans `raw_analysis` depuis le 06/07 : la donnée est là, l'écran est prêt, et
   * l'onglet Partenaires reste vide jusqu'à ce que quelqu'un repaie une analyse.
   * C'est la demande n°3 du bêta testeur, invisible pour une raison de calendrier.
   *
   * Trois bornes :
   *
   * - un compte qui porte DÉJÀ une ligne `source = 'analysis'` est sauté — y
   *   compris quand elle a été écartée (pierre tombale `dismissed_at`) : une
   *   reprise qui ressusciterait un « ce n'est pas exact » serait pire que rien ;
   * - la reprise est BORNÉE (`limit`) — un espace à dix mille comptes ne doit pas
   *   allonger un démarrage ; ce qui reste sera repris au démarrage suivant ;
   * - un compte qui échoue n'arrête pas les autres, et l'échec se journalise.
   *
   * Idempotente par construction : l'écriture porte `ON CONFLICT`, et la
   * sélection ne rend que ce qui manque.
   */
  async backfillDetectedPartners(limit = 200): Promise<{ scanned: number; seeded: number }> {
    if (!this.accountPartners) return { scanned: 0, seeded: 0 }
    const rows = (await this.accounts.query(
      `SELECT a.id AS id, a.raw_analysis -> 'esn_presence' AS presence
         FROM accounts a
        WHERE a.workspace_id IS NOT NULL
          AND jsonb_typeof(a.raw_analysis -> 'esn_presence') = 'array'
          AND jsonb_array_length(a.raw_analysis -> 'esn_presence') > 0
          AND NOT EXISTS (
                SELECT 1 FROM account_partners p
                 WHERE p.account_id = a.id AND p.source = 'analysis')
        ORDER BY a.updated_at DESC
        LIMIT $1`,
      [limit],
    )) as Array<{ id: string; presence: unknown }>
    let seeded = 0
    for (const row of rows) {
      try {
        await this.seedDetectedPartners(row.id, { esnPresence: row.presence } as unknown as AnalysisResearchData)
        seeded += 1
      } catch (error) {
        this.logger.warn('backfillDetectedPartners failed', { error, accountId: row.id })
      }
    }
    if (rows.length > 0) {
      this.logger.log(`backfillDetectedPartners: ${seeded}/${rows.length} dossiers repris`)
    }
    return { scanned: rows.length, seeded }
  }

  /**
   * #3219 (#190.2, lot P02 07/10) — ce que `applyResearch` a trouvé à
   * journaliser au titre d'une PORTÉE déclarée, pour son appelant
   * (`AnalysisPersistenceService`, seul à pouvoir joindre `ProvenanceService`
   * sans faire monter GA-07 depuis CE module — même raison que `fieldProvenance`
   * est un REPOSITORY ici, pas le service). `applyResearch` ne commit rien
   * lui-même : il REND la claim, pure, calculée par `pipelineFieldScopeClaim`
   * (`@bellum/contracts`).
   */
  /**
   * #4616 — le lien capitalistique lu AVANT la transaction de l'appelant (`saveResearch`), puis passé à
   * `applyResearch` en `opts.groupAffiliation` : jamais un appel HTTP sous une connexion tenue.
   */
  async groupAffiliationFor(siren: string | null | undefined): Promise<GroupAffiliation | null> {
    return siren ? this.ia.groupAffiliation(siren) : null
  }

  async applyResearch(
    id: string,
    data: AnalysisResearchData,
    manager?: EntityManager,
    // #2671 — `workspaceId` scope les deux lectures ci-dessous
    // (`refuseIdentityRewrite`, `arbitrate`). Optionnel pour ne pas casser un
    // appelant hors périmètre de ce lot (tests directs, ancien appelant non
    // encore audité) ; les DEUX chemins de production connus (`saveResearch`,
    // `refreshResearch`) le passent désormais explicitement.
    // #4616 — `groupAffiliation` : la réponse de l'IA déjà lue par l'appelant AVANT sa transaction (`null` =
    // lue, rien d'exploitable). Absente : appel ici, chemin historique des appelants hors transaction.
    opts: { writePriority?: boolean; workspaceId?: string | null; groupAffiliation?: GroupAffiliation | null } = {},
  ): Promise<ApplyResearchResult> {
    const repo = manager ? manager.getRepository(AccountEntity) : this.accounts
    // GA-96 — un dossier ne change JAMAIS de société.
    //
    // AVANT toute écriture, y compris celles qui ne touchent pas la colonne
    // `siren` : si la recherche rend une identité de registre DIFFÉRENTE de
    // celle que le dossier porte déjà, ce n'est pas un rafraîchissement, c'est
    // un autre compte. Le refus est TOTAL et il est posé ICI parce que
    // `applyResearch` est le dernier point de passage commun à TOUS les chemins
    // de rafraîchissement — relance depuis la fiche, depuis la liste, reprise
    // d'un run interrompu, rafraîchissement par dimension, MCP, `force`
    // opérateur. Une garde posée plus haut n'en couvrirait qu'un.
    //
    // Refuser « juste la colonne SIREN » serait le même défaut en plus discret :
    // le dossier garderait son identité pendant que le secteur, les signaux,
    // l'organigramme et les contacts d'une AUTRE société s'y déverseraient. Le
    // `throw` remonte au worker, qui le classe en `UnrecoverableError` et
    // marque le run en erreur avec ce message ; à l'intérieur d'une transaction
    // (le chemin du pipeline), il ANNULE tout ce qui précède — le dossier
    // ressort byte-identique à ce qu'il était.
    await this.refuseIdentityRewrite(id, data, repo, opts.workspaceId ?? null)
    data = await this.withoutCorrectedSignals(id, data, opts.workspaceId ?? null, manager)
    // #4294.6 — un fait dit deux fois (titre quasi identique, même source ou date proche) ne s'écrit qu'une fois.
    data = { ...data, recentSignals: dedupeNearIdenticalSignals(data.recentSignals) }
    // LUDOVIC-D LC.2 — un signal d'HOMONYME n'entre pas (même décision que les contacts).
    data = withoutHomonymResearchFacts(data).data
    // #3219 (#190.2, lot P02 07/10) — le premier écrivain RÉEL de `scope` :
    // seulement quand CE run a déclaré un périmètre (`data.scopeMode`), on lit
    // l'effectif ACTUEL avant l'écriture — un seul `SELECT` de plus, jamais
    // posé pour l'immense majorité des runs (sans `scopeMode`, comportement
    // byte-identique à avant ce lot).
    const previousEmployees =
      data.scopeMode && data.employees
        ? ((await repo.findOne({ where: { id }, select: ['employees'] }))?.employees ?? null)
        : null
    const patch: QueryDeepPartialEntity<AccountEntity> = {
      sector: data.sector,
      employees: data.employees,
      revenue: data.revenue,
      headquarters: data.headquarters,
      website: data.website,
      subsidiaries: data.subsidiaries,
      it_challenges: data.itChallenges,
      recent_signals: data.recentSignals,
    }
    // Les ESN détectées deviennent des lignes de l'onglet Partenaires. Sans ce
    // pont, `esnPresence` était généré à chaque analyse, stocké dans
    // `raw_analysis`, et n'atteignait que l'outil interne : l'écran affichait
    // déjà un badge « détecté » pour une valeur que rien n'écrivait.
    await this.seedDetectedPartners(id, data, manager)
    await this.seedAccessFacts(id, data, manager)
    // The phase-1 /10 priorityScore is a PROVISIONAL score, overwritten by the
    // canonical /25-derived value in ``applyPlan``. A research-only refresh (C2)
    // does NOT re-run phase 4, so it must NOT downgrade the reconciled column
    // back to the phase-1 /10 (audit: the refresh silently reverted the fix).
    if (opts.writePriority !== false) {
      patch.priority_score = data.priorityScore
      patch.priority_justification = data.priorityJustification
    }
    if (data.siren) {
      // Canonical account = the newest run. Before stamping this SIREN, archive any
      // OTHER active account that already resolved to it in the SAME workspace, so a
      // re-analysis of SNCF collapses to one row instead of stacking duplicates
      // (Théo p.18) and the (workspace_id, siren) unique index is satisfied.
      // Fires only on a genuine collision (same non-null workspace + same siren).
      await repo.manager.query(
        `UPDATE accounts a
           SET status = 'archived', commercial_status = 'archived'
          FROM accounts self
         WHERE self.id = $2
           AND self.workspace_id IS NOT NULL
           AND a.workspace_id = self.workspace_id
           AND a.siren = $1
           AND a.id <> self.id
           AND a.status NOT IN ('deleted', 'archived')`,
        [data.siren, id],
      )
      patch.siren = data.siren
      // #2165.24 / #2166.3 / #2165.16 — dérivé du même graphe capitalistique
      // que la recherche Phase 1 a déjà chargé côté IA (cache global par
      // SIREN, coût supplémentaire nul dans l'immense majorité des cas).
      // Best-effort, comme `apollo_enrichment`/`logo_url` plus haut : on
      // n'efface JAMAIS un lien déjà connu pour une réponse qui n'en apporte
      // pas de nouveau (IA muette, panne source, aucun lien exploitable).
      // #4616 — sous transaction, l'appelant l'a lue avant : un appel HTTP ici tiendrait la connexion jusqu'à 5 s.
      const groupAffiliation =
        opts.groupAffiliation !== undefined ? opts.groupAffiliation : await this.ia.groupAffiliation(data.siren)
      if (groupAffiliation) {
        patch.group_head_siren = groupAffiliation.headSiren
        patch.group_role = groupAffiliation.role
        patch.group_link_source = 'pappers'
        patch.group_link_observed_at = new Date()
      }
    }
    if (data.nafCode) {
      // NAF/APE code for the "comptes similaires" NAF seed (Théo p.41).
      patch.naf_code = data.nafCode
    }
    if (data.actorType) {
      // #2265.14 — même jugement que /discover, calculé sur ce même NAF.
      patch.actor_type = data.actorType
      patch.is_intermediary = data.isIntermediary ?? false
    }
    // Apollo Organizations Enrich (factual firmographics + real logo). Persisted
    // only when the run actually carried it — a later research pass without the
    // block (no Apollo key, unknown domain, Apollo miss) never erases the stored
    // enrichment. The dedicated `logo_url` column ONLY ever gets Apollo's real
    // logo — never the derived `companyLogoUrl` fallback of the blob.
    if (data.apolloEnrichment && Object.keys(data.apolloEnrichment).length > 0) {
      patch.apollo_enrichment = data.apolloEnrichment
      if (data.apolloEnrichment.logoUrl) {
        patch.logo_url = data.apolloEnrichment.logoUrl
      }
    }
    // Cross-border canonical account — the non-FR twin of the SIREN block above.
    // When the run's country pack resolved a national registry identity (CIK US /
    // corp id CA / UID CH / BCE BE / RCS LU), canonicalise it and stamp it like
    // the SIREN is, archiving any OTHER active account of the same workspace
    // already carrying the same (registry_country, registry_id) — newest run wins,
    // satisfying the accounts_workspace_registry_active_uniq unique index.
    // ``normalizeRegistryRef`` returns null on FR / missing / malformed input, so
    // the French path (which never carries registryId) is a strict no-op here.
    const registryRef = normalizeRegistryRef(data.registryCountry, data.registryId)
    if (registryRef) {
      await repo.manager.query(
        `UPDATE accounts a
           SET status = 'archived', commercial_status = 'archived'
          FROM accounts self
         WHERE self.id = $3
           AND self.workspace_id IS NOT NULL
           AND a.workspace_id = self.workspace_id
           AND a.registry_country = $1
           AND a.registry_id = $2
           AND a.id <> self.id
           AND a.status NOT IN ('deleted', 'archived')`,
        [registryRef.country, registryRef.id, id],
      )
      patch.registry_id = registryRef.id
      patch.registry_country = registryRef.country
    }
    const arbitrated = await this.arbitrate(id, patch, repo, opts.workspaceId ?? null)
    await repo.update({ id }, arbitrated)
    await this.mergeRawAnalysis(id, toSnakeCaseKeys(data), repo)
    // #2543.7 — la date de CETTE collecte de recherche (Phase 1), que le
    // ciblage du rattrapage (#2543) comparera à une future capacité datée sur
    // ce segment. `applyResearch` est le dernier point de passage commun à
    // TOUS les chemins de rafraîchissement (voir le docblock de la méthode) —
    // stampée ICI, elle l'est pour chacun d'eux sans rien réécrire ailleurs.
    // Inconditionnel comme `applyContactsCollectedAt` : cette méthode n'est
    // jamais appelée sur des données absentes.
    await this.applySignalsCollectedAt(id, new Date(), manager)
    // #3219 (#190.2, lot P02 07/10) — la claim de portée, calculée sur la
    // valeur RÉELLEMENT écrite (`arbitrated.employees` — l'arbitre a pu
    // REJETER `data.employees` au profit d'une correction humaine en place ;
    // journaliser `data.employees` quand même aurait raconté une écriture qui
    // n'a jamais eu lieu). Absente du patch arbitré ⇒ rien n'a changé pour ce
    // champ ⇒ aucune claim (même lecture que `pipelineFieldScopeClaim` sur une
    // valeur inchangée).
    const writtenEmployees = typeof arbitrated.employees === 'string' ? arbitrated.employees : null
    const employeesScopeClaim = writtenEmployees
      ? (pipelineFieldScopeClaim({
          previousValue: previousEmployees,
          newValue: writtenEmployees,
          scopeMode: data.scopeMode,
          scopeLabels: ANALYSIS_SCOPE_MODE_LABELS,
        }) ?? undefined)
      : undefined
    return { employeesScopeClaim }
  }

  /**
   * Écrit le blob d'analyse par FUSION, jamais par remplacement.
   *
   * Il partait en `UPDATE … SET raw_analysis = $1`, qui remplace la colonne
   * JSONB ENTIÈRE. Or deux choses vivent dans ce blob que la phase 1 ne
   * reproduit pas :
   *
   *  - les objets que l'UTILISATEUR crée de sa main — un angle d'attaque, une
   *    action ajoutée au plan ({@link appendRawAnalysisItem}). Ils n'ont aucun
   *    autre domicile : les personnes déclarées à l'organigramme et l'ardoise
   *    des rejets ont été hissées dans leurs propres colonnes exactement pour
   *    cette raison, ces deux-là ne l'ont pas été. Chaque « Actualiser
   *    l'analyse » les effaçait, sans un mot ;
   *  - ce que les phases SUIVANTES ont écrit (`plan`, `org`, `judge`,
   *    `run_cost`…). « Actualiser l'analyse » ne rejoue que la phase 1 et
   *    promet que « le plan reste intact » — il vidait l'onglet Plan.
   *
   * D'où trois opérandes, et leur ORDRE est la moitié du correctif : en SQL
   * `a || b` donne la priorité à `b`.
   *   1. le blob stocké — il ne doit pas gagner sur du frais ;
   *   2. la recherche fraîche — elle écrase ce qu'elle produit, elle seule ;
   *   3. les clés d'origine HUMAINE — au-dessus de tout, sinon le pipeline les
   *      réécrirait et rien ne serait corrigé.
   *
   * Conséquence assumée, et c'est déjà la règle du dossier (cf.
   * `apollo_enrichment` ci-dessus, « on archive, on ne supprime pas ») : une
   * passe qui ne rapporte PAS un bloc n'efface pas celui qu'on avait. Un fait
   * qu'une source n'a pas re-rendu reste ce qu'on sait de plus récent.
   *
   * ⚠️ C'est aussi ICI que la version PRÉCÉDENTE est mise de côté (D213), et
   * c'est le seul endroit possible : ce `UPDATE` est l'unique entonnoir par
   * lequel le dossier est réécrit. Le faire ailleurs garantirait de rater un
   * chemin, et le tiroir « ce qui a changé » comparerait alors une version à
   * elle-même.
   *
   * Deux précautions dans le SQL, chacune payée par un défaut connu :
   *  - le `CASE WHEN raw_analysis IS NULL` — une PREMIÈRE analyse n'a rien à
   *    archiver, et écrire `null` dans `previous_raw_analysis` effacerait la
   *    version d'avant si ce chemin repassait sur un dossier vidé ;
   *  - l'archivage et la fusion sont dans le MÊME `UPDATE`, donc atomiques :
   *    en deux instructions, une erreur entre les deux laisserait une version
   *    précédente identique à la courante, et le tiroir dirait « rien n'a
   *    changé » — une affirmation fausse, pire qu'une absence.
   */
  /**
   * Le tiroir « ce qui a changé » de ce compte, ou `null` (D213).
   *
   * `null` veut dire « on n'a pas de quoi comparer » — un dossier analysé une
   * seule fois, ou antérieur au chantier. JAMAIS « rien n'a changé » : ce
   * serait affirmer une vérification qui n'a pas eu lieu.
   */
  async changeDigest(id: string, workspaceId: string): Promise<AccountChangeDigest | null> {
    const account = await this.accounts.findOne({
      where: { id, workspace_id: workspaceId },
      select: ['id', 'raw_analysis', 'previous_raw_analysis', 'previous_analysis_at'],
    })
    if (!account) return null
    return buildAccountChangeDigest(account.previous_raw_analysis, account.raw_analysis, new Date(), {
      // La date de la version précédente sert à DATER ce qui a disparu — « on
      // archive, on ne supprime pas ». Absente, la fonction le dit plutôt que
      // d'inventer un « quand ».
      previousAt: account.previous_analysis_at?.toISOString().slice(0, 10) ?? null,
    })
  }

  private async mergeRawAnalysis(id: string, fresh: unknown, repo: Repository<AccountEntity>): Promise<void> {
    await repo.manager.query(
      `
      UPDATE accounts
      SET raw_analysis = COALESCE(raw_analysis, '{}'::jsonb)
            || $2::jsonb
            || COALESCE(
                 (SELECT jsonb_object_agg(kept.name, kept.content)
                    FROM jsonb_each(COALESCE(accounts.raw_analysis, '{}'::jsonb)) AS kept(name, content)
                   WHERE kept.name = ANY($3::text[])),
                 '{}'::jsonb),
          -- Toutes les expressions d'un meme SET lisent l'ANCIENNE ligne, quel
          -- que soit leur ordre : raw_analysis designe bien ici la version
          -- d'AVANT la fusion ecrite juste au-dessus.
          previous_raw_analysis = CASE
            WHEN raw_analysis IS NULL THEN previous_raw_analysis
            ELSE raw_analysis
          END,
          previous_analysis_at = CASE
            WHEN raw_analysis IS NULL THEN previous_analysis_at
            ELSE now()
          END
      WHERE id = $1
      `,
      [id, JSON.stringify(fresh), [...USER_AUTHORED_ANALYSIS_KEYS]],
    )
  }

  /**
   * Retire du patch les champs de fiche qu'un HUMAIN a corrigés.
   *
   * Le pipeline écrivait ces colonnes en direct : un commercial qui corrigeait
   * un effectif ou un secteur voyait sa saisie disparaître à la réanalyse
   * suivante, sans un mot. Les CONTACTS passaient déjà par l'arbitre ; les
   * COMPTES, non — et le contrat de `applyFieldUpdates` affirmait pourtant
   * qu'un `UPDATE` direct était interdit.
   *
   * La lecture supplémentaire ne coûte que s'il y a quelque chose à protéger :
   * sans provenance enregistrée, aucune correction humaine n'existe, et le
   * patch part inchangé.
   */
  /**
   * GA-96 — le refus qui empêche un dossier de changer de société.
   *
   * ## Ce qu'il compare
   *
   * L'identité de REGISTRE du dossier telle qu'elle est en base, contre celle
   * que la phase 1 vient de résoudre. Deux couples, traités identiquement :
   * `siren` (France) et `registry_country` + `registry_id` (le pivot
   * transfrontalier — CIK US, corp id CA, UID CH, BCE BE, RCS LU).
   *
   * ## Les trois cas, et pourquoi seul le troisième est un refus
   *
   * 1. **Le dossier n'a pas encore d'identité** (compte créé à la main, société
   *    étrangère, première analyse) → on POSE. Le refus porte sur le
   *    REMPLACEMENT d'une identité, jamais sur sa pose ; sans cette distinction
   *    aucun compte neuf ne pourrait plus jamais être analysé.
   * 2. **Le run n'a rien résolu** (`data.siren` absent) → rien à comparer, rien
   *    à refuser. La colonne existante est déjà protégée en aval par le
   *    `if (data.siren)`, qui n'écrit jamais `null` par-dessus une valeur.
   * 3. **Les deux existent et diffèrent** → REFUS. C'est le cas ROCHE /
   *    ROCHE BOBOIS du 30/08/2026.
   *
   * ## Ce qu'il ne fait PAS, délibérément
   *
   * Il ne « corrige » pas l'identité entrante, il ne choisit pas la plus
   * récente, il ne fusionne rien. Deux SIREN différents sont deux sociétés :
   * aucune règle automatique ne peut trancher laquelle l'utilisateur voulait, et
   * en trancher une au hasard est exactement le défaut qu'on répare. On refuse,
   * on NOMME les deux identités, et l'utilisateur décide.
   *
   * ## La lecture supplémentaire
   *
   * Un `findOne` par phase de recherche, et seulement quand le run a résolu une
   * identité. C'est le prix d'un dossier qui ne change pas de société.
   */
  private async refuseIdentityRewrite(
    id: string,
    data: AnalysisResearchData,
    repo: Repository<AccountEntity>,
    workspaceId: string | null,
  ): Promise<void> {
    const incomingRegistry = normalizeRegistryRef(data.registryCountry, data.registryId)
    // Rien n'a été résolu par ce run : il n'y a aucune identité à opposer.
    if (!data.siren && !incomingRegistry) return

    // #2671 — la lecture de compte porte sa borne d'espace : sans elle, un
    // appelant qui se tromperait d'id lirait le dossier d'une AUTRE ESN.
    // `IsNull()` : TypeORM refuse un littéral `null` dans un `where` typé.
    const current = await repo.findOne({ where: { id, workspace_id: workspaceId ?? IsNull() } })
    // Un dossier introuvable n'est pas notre affaire ici — l'`update` qui suit
    // sera un no-op, et inventer un refus sur une ligne absente masquerait la
    // vraie cause.
    if (!current) return

    // France. `isSameRegistryIdentity` compare les CHIFFRES seuls : « 552 012 031 »
    // et « 552012031 » sont la même société, et un refus qui se déclencherait sur
    // une mise en forme perdrait en un jour toute la confiance qu'on lui accorde.
    if (data.siren && current.siren && !isSameRegistryIdentity(current.siren, data.siren)) {
      throw new Error(buildIdentityMismatchMessage({ expected: current.siren, resolved: data.siren }))
    }

    // Hors France — même règle, sur le couple (pays, identifiant). Le pays fait
    // partie de l'identité : un `12345` suisse et un `12345` belge ne sont pas
    // la même société, et les comparer sur le seul numéro les confondrait.
    if (incomingRegistry && current.registry_id && current.registry_country) {
      const sameCountry = isSameRegistryIdentity(current.registry_country, incomingRegistry.country)
      const sameId = isSameRegistryIdentity(current.registry_id, incomingRegistry.id)
      if (!sameCountry || !sameId) {
        throw new Error(
          buildIdentityMismatchMessage({
            expected: `${current.registry_country}:${current.registry_id}`,
            resolved: `${incomingRegistry.country}:${incomingRegistry.id}`,
          }),
        )
      }
    }
  }

  /**
   * #3671 — un fait corrigé (« faux » / « obsolète ») ne revient pas tel quel à
   * l'actualisation ; revenu avec une date postérieure, il reste « à confirmer ».
   * Un retour « inutile » (préférence) ne retire rien. Borné à l'espace ET au
   * dossier : aucune correction d'une autre ESN n'est lue. Sans dépôt, sans
   * correction ou sur une lecture en échec : `data` rendu tel quel.
   */
  private async withoutCorrectedSignals(
    id: string,
    data: AnalysisResearchData,
    workspaceId: string | null,
    manager?: EntityManager,
  ): Promise<AnalysisResearchData> {
    if (!this.accountFeedback || !workspaceId || !Array.isArray(data.recentSignals)) return data
    // #4616 — sous transaction, sur SA connexion : le dépôt global en prendrait une deuxième.
    const feedback = manager ? manager.getRepository(AccountFeedbackEntity) : this.accountFeedback
    try {
      const rows = await feedback.find({
        where: { account_id: id, workspace_id: workspaceId, target: 'signal' },
        order: { created_at: 'DESC' },
        take: 200,
      })
      const { kept, suppressed } = guardAgainstCorrectedSignals(
        data.recentSignals as unknown as Array<Record<string, unknown>>,
        rows.map(row => ({
          target: row.target,
          targetRef: row.target_ref ?? '',
          verdict: row.verdict,
          at: row.created_at.toISOString(),
        })),
      )
      if (suppressed.length === 0 && kept.every((signal, index) => signal === data.recentSignals[index])) return data
      this.logger.log(`applyResearch : ${suppressed.length} signal(aux) corrigé(s) non reproduit(s)`, { accountId: id })
      return { ...data, recentSignals: kept as unknown as AnalysisResearchData['recentSignals'] }
    } catch (error) {
      this.logger.warn('withoutCorrectedSignals failed — signals written as received', { error, accountId: id })
      return data
    }
  }

  private async arbitrate(
    id: string,
    patch: QueryDeepPartialEntity<AccountEntity>,
    repo: Repository<AccountEntity>,
    workspaceId: string | null,
  ): Promise<QueryDeepPartialEntity<AccountEntity>> {
    if (!this.fieldProvenance) return patch

    const rows = await this.fieldProvenance.find({ where: { entity_type: 'account', entity_id: id } })
    const sources: Partial<Record<string, FieldSource>> = {}
    for (const row of rows) sources[row.field] = row.source
    const humanFields = rows.filter(r => r.source === 'human' && r.field in ACCOUNT_FIELD_COLUMNS)
    if (humanFields.length === 0) return patch

    // #2671 — la lecture de compte porte sa borne d'espace (même raison que
    // `refuseIdentityRewrite` ci-dessus).
    const current = await repo.findOne({ where: { id, workspace_id: workspaceId ?? IsNull() } })
    if (!current) return patch

    // Seuls les champs corrigeables à la main sont soumis à l'arbitre. Le reste
    // du patch (blob d'analyse, signaux, score de priorité) n'a pas d'auteur
    // humain : le soumettre ne protégerait rien et ferait dépendre le pipeline
    // d'une table de provenance vide.
    const incoming: Record<string, unknown> = {}
    for (const [field, column] of Object.entries(ACCOUNT_FIELD_COLUMNS)) {
      if (column in patch) incoming[field] = (patch as Record<string, unknown>)[column]
    }
    if (Object.keys(incoming).length === 0) return patch

    const { accepted, rejected } = applyFieldUpdates({
      incoming,
      incomingSource: 'pipeline',
      current: toFieldView(current as unknown as Record<string, unknown>, ACCOUNT_FIELD_COLUMNS),
      currentSources: sources,
    })
    if (rejected.length === 0) return patch

    const arbitrated: Record<string, unknown> = { ...(patch as Record<string, unknown>) }
    for (const [field, column] of Object.entries(ACCOUNT_FIELD_COLUMNS)) {
      if (column in arbitrated && !(field in accepted)) delete arbitrated[column]
    }
    this.logger.log(`applyResearch : ${rejected.length} champ(s) de compte préservés — corrigés à la main`, {
      accountId: id,
      fields: rejected.map(r => r.field),
    })
    return arbitrated as QueryDeepPartialEntity<AccountEntity>
  }

  /**
   * Targeted Phase-1 refresh (C2). Re-persists fresh research onto an existing
   * account and bumps ``updated_at`` (our ``refreshed_at``) by re-flipping the
   * status to ``completed``. Cheaper than the full pipeline — only the
   * research step ran. Status is left ``completed`` because the contacts / plan
   * already exist; we only refreshed the company facts.
   */
  async refreshResearch(id: string, data: AnalysisResearchData, workspaceId: string | null): Promise<void> {
    // Research-only refresh: keep the reconciled /25-derived priority_score from
    // the last full run (phase 4 didn't re-run), so a refresh can't reintroduce
    // the phase-1 /10 vs /25 divergence.
    await this.applyResearch(id, data, undefined, { writePriority: false, workspaceId })
    await this.markCompleted(id)
  }

  /** The account's current priority score (`null` when never scored). Read
   *  before a (re)analysis writes the new one so the Historique can journal a
   *  real MOVEMENT (§8 `account_score_changed`) — never a first score. */
  async getPriorityScore(id: string, workspaceId: string | null): Promise<number | null> {
    // #2671 — la lecture de compte porte sa borne d'espace.
    const row = await this.accounts.findOne({
      where: { id, workspace_id: workspaceId ?? IsNull() },
      select: ['priority_score'],
    })
    return row?.priority_score ?? null
  }

  /** Merge the Phase 4 plan into ``raw_analysis.plan`` so the web Plan tab —
   *  which reads ``account.raw_analysis.plan`` (actionPlan + evaluation +
   *  offersToPropose + messages) — populates instead of showing the empty
   *  state. A JSONB shallow-merge (``||``) preserves the Phase 1 research blob
   *  already stored under ``raw_analysis``.
   *
   *  Unlike ``applyResearch`` the payload is stored AS-IS (camelCase), because
   *  that's the exact casing ``TabPlan`` reads — snake-casing it here would
   *  leave the tab blank. The runtime object carries the full plan
   *  (evaluation / offers / messages), wider than the ``actionPlan``-only
   *  type, and all of it rides into the JSONB blob.
   */
  async applyPlan(id: string, plan: AnalysisPlanData, manager?: EntityManager): Promise<void> {
    const runner = manager ?? this.accounts.manager
    // The plan's evaluation is the canonical /25 account verdict (§1). Phase 4
    // derives a reconciled /10 ``priorityScore`` from it, so we overwrite the
    // column the account bucket (chaud/moyen/froid) reads — otherwise the
    // phase-1 /10 (a separate scorer) contradicts the /25 shown in the plan
    // (Vinci: column said 4/froid while the verdict was 17/25 PRUDENT).
    const reconciledScore = typeof plan.priorityScore === 'number' ? plan.priorityScore : null
    // Self-consistency A1: hoist the plan's ``selfConsistency`` block to the ROOT
    // of raw_analysis (like ``judge``) so the dossier/chat read it at
    // ``raw_analysis.selfConsistency`` — not buried under the plan blob. Additive:
    // the CASE merges nothing when the plan carries no block (kill-switch on /
    // older IA), so existing payloads are byte-identical.
    await runner.query(
      `
      UPDATE accounts
      SET raw_analysis = COALESCE(raw_analysis, '{}'::jsonb)
            || jsonb_build_object('plan', $1::jsonb)
            || CASE WHEN ($1::jsonb) ? 'selfConsistency'
                 THEN jsonb_build_object('selfConsistency', ($1::jsonb) -> 'selfConsistency')
                 ELSE '{}'::jsonb END,
          priority_score = COALESCE($3, priority_score),
          priority_justification = COALESCE($4, priority_justification)
      WHERE id = $2
      `,
      [JSON.stringify(plan), id, reconciledScore, plan.priorityJustification ?? null],
    )
  }

  // #2123.46 — `appendUserPlanAction` est RETIRÉE : ses cinq appelants web (le
  // formulaire du plan, la veille, la fiche contact, le panneau besoin, l'ajout
  // en masse) écrivent la ligne canonique par `ActionPlanItemsService
  // .createFromPlan`. `raw_analysis.user_plan_actions` n'est plus écrit, il
  // reste LU comme historique et préservé à la ré-analyse
  // (`USER_AUTHORED_ANALYSIS_KEYS`).

  appendUserAttackAngle(
    id: string,
    userId: string,
    angle: UserAttackAngle,
  ): Promise<AccountPlanMutationResponse | null> {
    return this.appendRawAnalysisItem(id, userId, 'user_attack_angles', angle)
  }

  /**
   * Append idempotent d'un élément « ajouté par l'utilisateur » dans
   * `raw_analysis` (action de plan / angle d'attaque).
   *
   * L'idempotence tient au containment JSONB (`@>`), qui est aussi ce qui rend
   * l'opération OBSERVABLE : la garde est remontée dans le `WHERE`, donc
   * « 0 ligne » signifie soit « déjà présent », soit « pas ton compte ». Une
   * seconde requête — payée UNIQUEMENT dans ce cas, jamais sur le chemin
   * heureux — tranche entre les deux et permet à un appelant en masse d'annoncer
   * « N ajoutés, M ignorés (déjà au plan) » sans inventer de compteur.
   */
  private async appendRawAnalysisItem(
    id: string,
    userId: string,
    key: UserAuthoredAnalysisKey,
    item: UserAttackAngle,
  ): Promise<AccountPlanMutationResponse | null> {
    const rows = (await this.accounts.manager.query(
      `
      UPDATE accounts
      SET raw_analysis = jsonb_set(
        COALESCE(raw_analysis, '{}'::jsonb),
        '{${key}}',
        COALESCE(raw_analysis -> '${key}', '[]'::jsonb) || jsonb_build_array($1::jsonb),
        true
      ),
      updated_at = NOW()
      WHERE id = $2 AND user_id = $3 AND status != $4
        AND NOT (COALESCE(raw_analysis -> '${key}', '[]'::jsonb) @> jsonb_build_array($1::jsonb))
      RETURNING raw_analysis
      `,
      [JSON.stringify(item), id, userId, DELETED_ACCOUNT_STATUS],
    )) as unknown
    // Idem : sur un UPDATE, `rows[0]` était le tableau des lignes — « truthy »
    // même quand la clause `NOT (… @> …)` avait écarté un doublon, et
    // `raw_analysis` valait `undefined` dans la réponse.
    const updated = firstReturnedRow<{ raw_analysis: Record<string, unknown> }>(rows)
    if (updated) return { raw_analysis: updated.raw_analysis, added: true }

    // Rien écrit : soit l'élément y était déjà, soit le compte n'est pas au
    // demandeur. La relecture est scopée par les MÊMES prédicats de propriété —
    // jamais un lookup par id seul.
    const existing = (await this.accounts.manager.query(
      `
      SELECT raw_analysis
      FROM accounts
      WHERE id = $1 AND user_id = $2 AND status != $3
      `,
      [id, userId, DELETED_ACCOUNT_STATUS],
    )) as Array<{ raw_analysis: Record<string, unknown> | null }>
    if (!existing[0]) return null
    return { raw_analysis: existing[0].raw_analysis ?? {}, added: false }
  }

  /** Merge the Phase 3 org graph (decisionChain / uncoveredZones /
   *  stakeholderMap / approachOrder / organigramme) into ``raw_analysis.org``.
   *  It was dropped in ``saveEnriched`` (only per-contact fields survived), so
   *  the decision-cycle, political map and "zones blanches" never reached the
   *  dossier. Same JSONB shallow-merge as ``applyPlan`` — preserves the research
   *  and plan blobs already under ``raw_analysis``. */
  /**
   * Regreffe l'ardoise des personnes déclarées (#1103) sur le graphe qu'un run
   * vient de produire. Rend `org` inchangé dès que quoi que ce soit manque —
   * aucune déclaration, aucun graphe typé, greffe qui ne passerait pas le
   * contrat. Une personne saisie à la main ne doit jamais faire échouer une
   * analyse qui a abouti.
   */
  private async regraftDeclaredPeople(
    id: string,
    org: Record<string, unknown>,
    runner: EntityManager,
  ): Promise<Record<string, unknown>> {
    try {
      const raw = (org as { orgGraph?: unknown }).orgGraph
      if (!raw || typeof raw !== 'object') return org
      const rows = await runner.query(`SELECT org_declared_people FROM accounts WHERE id = $1`, [id])
      const declared =
        returnedRows<{ org_declared_people: OrgDeclaredPerson[] | null }>(rows)[0]?.org_declared_people ?? []
      if (declared.length === 0) return org
      const parsed = orgGraphSchema.safeParse(raw)
      if (!parsed.success) return org
      const grafted = applyDeclaredPeople(parsed.data, declared)
      return grafted ? { ...org, orgGraph: grafted } : org
    } catch (err) {
      this.logger.warn('Re-grafting declared people failed — org chart saved as the run wrote it', {
        accountId: id,
        error: err instanceof Error ? err.message : String(err),
      })
      return org
    }
  }

  /**
   * Rejoue les CORRECTIONS humaines encore actives sur le graphe qu'un run vient
   * de produire (OrgGraph FINAL §7, critère d'acceptation n°10 : « une
   * correction titre/entité/niveau/rôle/N+1 survit à un nouveau run »).
   *
   * Symétrique exact de {@link regraftDeclaredPeople}, et pour la même raison :
   * chaque run réécrit `raw_analysis.org.orgGraph` à neuf. Sans ce rejeu, le
   * ledger ne serait qu'une archive — l'historique dirait qu'on a corrigé, et
   * l'organigramme afficherait de nouveau la valeur d'avant.
   *
   * Best-effort de bout en bout : une lecture qui échoue laisse le dossier
   * exactement tel que le run l'a écrit. Un rejeu ne doit jamais faire tomber
   * une analyse qui a abouti.
   */
  private async replayOrgCorrections(
    id: string,
    org: Record<string, unknown>,
    runner: EntityManager,
  ): Promise<Record<string, unknown>> {
    try {
      const raw = (org as { orgGraph?: unknown }).orgGraph
      if (!raw || typeof raw !== 'object') return org
      const rows = returnedRows<{
        object_type: ReplayableCorrection['objectType']
        object_id: string
        field: ReplayableCorrection['field']
        new_value: ReplayableCorrection['newValue']
        reason: string
        evidence: ReplayableCorrection['evidence']
        created_at: string | Date
      }>(
        await runner.query(
          `SELECT object_type, object_id, field, new_value, reason, evidence, created_at
             FROM org_graph_corrections
            WHERE account_id = $1 AND reverted_at IS NULL
              -- #2126.44 — orgCorrectionHoldsField : jamais une ligne personnelle,
              -- jamais un motif qui ne réécrit ni ne confirme.
              AND scope <> 'personal' AND motive IN ('corrected', 'obsolete', 'confirmed')
            ORDER BY created_at ASC`,
          [id],
        ),
      )
      if (rows.length === 0) return org
      const parsed = orgGraphSchema.safeParse(raw)
      if (!parsed.success) return org
      const replayed = replayCorrections(
        parsed.data,
        rows.map(row => ({
          objectType: row.object_type,
          objectId: row.object_id,
          field: row.field,
          newValue: row.new_value ?? null,
          reason: row.reason,
          evidence: row.evidence,
          at: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
        })),
      )
      return replayed ? { ...org, orgGraph: replayed } : org
    } catch (err) {
      this.logger.warn('Replaying org corrections failed — org chart saved as the run wrote it', {
        accountId: id,
        error: err instanceof Error ? err.message : String(err),
      })
      return org
    }
  }

  /**
   * #2554.1 / #2554.2 — RE-VÉRIFIE l'organigramme existant au lieu de le
   * laisser vieillir en silence : lit le graphe STOCKÉ, le compare à celui que
   * ce run vient de produire, et rend un graphe où personne n'a disparu sans
   * un mot — une personne stockée absente du résultat est réinjectée, nommée
   * « non confirmée » avec la date de CE run (jamais « partie », jamais
   * présentée comme à jour). Le diff nommé (revérifiée / poste changé /
   * nouvelle / non confirmée) est posé sur `org.peopleRefreshDiff` pour
   * l'écran.
   *
   * Rend `org` inchangé sur un premier peuplement (rien de stocké — voir
   * #2502, organigramme ABSENT, distinct de ce chantier) ou sur le moindre
   * doute (graphe stocké/entrant illisible) : cette étape ne doit jamais
   * faire tomber une analyse qui a abouti.
   */
  private async withNotConfirmedPeople(
    id: string,
    org: Record<string, unknown>,
    runner: EntityManager,
  ): Promise<Record<string, unknown>> {
    try {
      const raw = (org as { orgGraph?: unknown }).orgGraph
      if (!raw || typeof raw !== 'object') return org
      const incoming = orgGraphSchema.safeParse(raw)
      if (!incoming.success) return org

      const rows = returnedRows<{ raw_analysis: Record<string, unknown> | null }>(
        await runner.query(`SELECT raw_analysis FROM accounts WHERE id = $1`, [id]),
      )
      const storedOrgGraph = (rows[0]?.raw_analysis?.['org'] as Record<string, unknown> | undefined)?.['orgGraph']
      const current = orgGraphSchema.safeParse(storedOrgGraph)
      if (!current.success) return org

      const result = preserveNotConfirmedPeople({
        current: current.data,
        incoming: incoming.data,
        asOf: new Date().toISOString(),
      })
      // `null` = premier peuplement (aucune personne stockée) : rien à revérifier.
      if (!result) return org
      return { ...org, orgGraph: result.orgGraph, peopleRefreshDiff: result.diff }
    } catch (err) {
      this.logger.warn('Re-verifying the org chart failed — org chart saved as the run wrote it', {
        accountId: id,
        error: err instanceof Error ? err.message : String(err),
      })
      return org
    }
  }

  /**
   * Pose `orgGraph.pathOrigin` — la forme du chemin et l'âge de la relation —
   * sur le graphe qu'un run vient de produire.
   *
   * `computePathOrigin` est une fonction PURE d'un module voisin, comme
   * `regraftDeclaredPeople` juste au-dessus : rien de ce que GA-07 interdit.
   *
   * Best-effort dans les deux sens : un graphe illisible ou une mémoire de
   * relation absente laissent le dossier EXACTEMENT tel que le run l'a écrit.
   * Une origine ratée doit se lire « pas calculée » — c'est-à-dire le silence
   * de l'écran — jamais « entrée froide », qui serait une affirmation.
   */
  private async withPathOrigin(
    id: string,
    org: Record<string, unknown>,
    runner: EntityManager,
  ): Promise<Record<string, unknown>> {
    const emitted = (org as { orgGraph?: unknown }).orgGraph
    const parsed = orgGraphSchema.safeParse(emitted)
    if (!parsed.success || !emitted || typeof emitted !== 'object') return org

    const rows = (await runner.query(`SELECT relationship_memory FROM accounts WHERE id = $1`, [id])) as Array<{
      relationship_memory: RelationshipMemory | null
    }>

    const pathOrigin = computePathOrigin(parsed.data, {
      memory: rows[0]?.relationship_memory ?? null,
      now: new Date(),
    })
    // Aucune cible dans le chemin : il n'y a pas de forme à écrire. On laisse le
    // blob intact plutôt que d'y poser une clé qui affirmerait une mesure.
    if (!pathOrigin) return org
    // ⚠️ On repart du graphe ÉMIS, pas du graphe parsé : `parse` remplit les
    // défauts (des tableaux vides pour chaque bloc absent) et réécrirait donc
    // le blob stocké au-delà de ce qu'on voulait changer. Le parsé sert à
    // CALCULER, l'émis reste ce qu'on ÉCRIT — une seule clé de plus.
    return { ...org, orgGraph: { ...(emitted as Record<string, unknown>), pathOrigin } }
  }

  async applyOrgChart(id: string, org: Record<string, unknown>, manager?: EntityManager): Promise<void> {
    const runner = manager ?? this.accounts.manager
    // Annexe Organigramme §5 : la version et l'ardoise des rejets doivent
    // SURVIVRE au blob (que chaque run réécrit), sinon une correction est perdue
    // au run suivant et un contact écarté revient. On les hisse donc du graphe
    // émis vers leurs colonnes. GREATEST empêche toute régression de version, et
    // l'ardoise est FUSIONNÉE (jamais remplacée), dédoublonnée par `sourceId` en
    // gardant la 1re occurrence : même une IA qui n'aurait pas reçu la mémoire ne
    // peut pas l'effacer. Un graphe sans ces clés — ou un dossier antérieur —
    // laisse les deux colonnes intactes.
    // #1103 — les personnes DÉCLARÉES à la main sont regreffées ICI, avant que
    // le blob ne parte en base. C'est la moitié qui rend la saisie durable :
    // chaque run réécrit `raw_analysis.org.orgGraph` à neuf, si bien qu'une
    // personne saisie tiendrait jusqu'à la réanalyse suivante puis
    // disparaîtrait sans un mot. Symétrique de l'ardoise des rejets qu'on hisse
    // deux lignes plus bas : l'une mémorise ce qu'un run ne doit jamais
    // réinjecter, l'autre ce qu'il ne doit jamais perdre.
    //
    // Fonction PURE importée d'un module voisin — pas un service : rien de ce
    // que GA-07 interdit. Best-effort : une regreffe qui échoue laisse le
    // dossier exactement tel que le run l'a écrit.
    org = await this.regraftDeclaredPeople(id, org, runner)
    // Et les CORRECTIONS de champ, juste après — même raison, même endroit :
    // sans ce rejeu, le ledger dirait qu'on a corrigé et l'écran afficherait de
    // nouveau la valeur d'avant. L'ordre compte : la greffe crée les personnes
    // déclarées, la correction peut ensuite porter sur elles.
    org = await this.replayOrgCorrections(id, org, runner)
    // #2554.1/#2554.2 — RE-VÉRIFIE l'organigramme au lieu de le laisser
    // vieillir en silence : une personne stockée absente de ce run est
    // réinjectée, nommée non confirmée, jamais supprimée.
    org = await this.withNotConfirmedPeople(id, org, runner)
    // D'OÙ part le chemin (`T5.md:815-831`), posé ICI et pas seulement sur le
    // bouton « Recalculer le chemin ». Sans cette ligne, un dossier fraîchement
    // analysé n'aurait aucune forme de chemin tant que personne n'aurait
    // cliqué — la capacité serait livrée et invisible, ce qui est le défaut que
    // ce chantier corrige justement ailleurs.
    org = await this.withPathOrigin(id, org, runner)
    const graph = (org as { orgGraph?: { graphVersion?: unknown; rejectedItems?: unknown } }).orgGraph
    const graphVersion = typeof graph?.graphVersion === 'number' ? graph.graphVersion : null
    const rejectedItems = Array.isArray(graph?.rejectedItems) ? JSON.stringify(graph.rejectedItems) : null
    await runner.query(
      `
      UPDATE accounts
      SET raw_analysis = COALESCE(raw_analysis, '{}'::jsonb) || jsonb_build_object('org', $1::jsonb),
          org_graph_version = GREATEST(COALESCE(org_graph_version, 1), COALESCE($3, 1)),
          org_rejected_items = CASE
            WHEN $4::jsonb IS NULL THEN org_rejected_items
            ELSE (
              SELECT COALESCE(jsonb_agg(item ORDER BY ord), '[]'::jsonb)
              FROM (
                SELECT DISTINCT ON (item ->> 'sourceId') item, ord
                FROM jsonb_array_elements(
                       COALESCE(org_rejected_items, '[]'::jsonb) || $4::jsonb
                     ) WITH ORDINALITY AS elements(item, ord)
                ORDER BY item ->> 'sourceId', ord
              ) deduped
            )
          END
      WHERE id = $2
      `,
      [JSON.stringify(org), id, graphVersion, rejectedItems],
    )
  }

  /** Merge the « X écartés (hors périmètre) » block into
   *  ``raw_analysis.contacts_out_of_scope`` ({dropped, entities[]}).
   *
   *  Phase 2 removes the contacts of an out-of-perimeter entity and, until now,
   *  only said so in a log line — the rep saw the stock shrink with no reason
   *  given. Same JSONB shallow-merge as ``applyJudge``: no migration, and the
   *  research / plan / org blobs already stored are preserved. The count belongs
   *  to ONE analysis, which is why it rides ``raw_analysis`` and not a workspace
   *  aggregate. */
  async applyContactsOutOfScope(id: string, block: ContactsOutOfScope, manager?: EntityManager): Promise<void> {
    const runner = manager ?? this.accounts.manager
    await runner.query(
      `
      UPDATE accounts
      SET raw_analysis = COALESCE(raw_analysis, '{}'::jsonb) || jsonb_build_object('contacts_out_of_scope', $1::jsonb)
      WHERE id = $2
      `,
      [JSON.stringify(block), id],
    )
  }

  /**
   * #AF.2 (18/09/2026) — stampe `contacts_collected_at`, la date de la
   * dernière collecte RÉELLE du segment contacts (pipeline complet Phase 2 OU
   * rafraîchissement ciblé). Distincte de `contacts_refreshed_at` (geste
   * « Rafraîchir » seul) — voir le docblock de la colonne, migration
   * `1795670000000`. Seul appelant : `AnalysisPersistenceService.saveContacts`,
   * inconditionnellement à chaque appel — une collecte qui ne trouve rien
   * reste une mesure faite.
   */
  async applyContactsCollectedAt(id: string, at: Date, manager?: EntityManager): Promise<void> {
    const runner = manager ?? this.accounts.manager
    await runner.query(`UPDATE accounts SET contacts_collected_at = $1 WHERE id = $2`, [at, id])
  }

  /**
   * #2543.7 (18/09/2026) — miroir de `applyContactsCollectedAt` pour le
   * segment signaux (Phase 1 recherche). Seul appelant : `applyResearch`
   * lui-même, dernier point de passage commun à TOUS les chemins de
   * rafraîchissement de la recherche (pipeline complet, « Actualiser »,
   * relance, reprise — voir le docblock de `applyResearch`). Migration
   * `1795712345678`.
   */
  async applySignalsCollectedAt(id: string, at: Date, manager?: EntityManager): Promise<void> {
    const runner = manager ?? this.accounts.manager
    await runner.query(`UPDATE accounts SET signals_collected_at = $1 WHERE id = $2`, [at, id])
  }

  /**
   * #2543.7 (18/09/2026) — miroir de `applyContactsCollectedAt` pour le
   * segment entités (Phase 3 organigramme). Seul appelant :
   * `AnalysisPersistenceService.saveOrgChart`, inconditionnellement à chaque
   * graphe réellement écrit (pipeline complet OU « Enrichir organigramme »).
   * Migration `1795712345678`.
   */
  async applyEntitiesCollectedAt(id: string, at: Date, manager?: EntityManager): Promise<void> {
    const runner = manager ?? this.accounts.manager
    await runner.query(`UPDATE accounts SET entities_collected_at = $1 WHERE id = $2`, [at, id])
  }

  /**
   * #2543.7 (18/09/2026) — miroir de `applyContactsCollectedAt` pour le
   * segment stratégie (Phase 4 plan). Seul appelant :
   * `AnalysisPersistenceService.savePlan`, inconditionnellement à chaque plan
   * réellement écrit (pipeline complet OU « Changer de stratégie »).
   * Migration `1795712345678`.
   */
  async applyStrategyCollectedAt(id: string, at: Date, manager?: EntityManager): Promise<void> {
    const runner = manager ?? this.accounts.manager
    await runner.query(`UPDATE accounts SET strategy_collected_at = $1 WHERE id = $2`, [at, id])
  }

  /**
   * #2118.51 (18/09/2026) — miroir de `applyStrategyCollectedAt` pour le
   * CINQUIÈME segment : la lecture du dossier en sept axes (#2118). Seul
   * appelant : `AnalysisPersistenceService.savePlan`, inconditionnellement à
   * chaque plan réellement écrit (pipeline complet OU rattrapage ciblé) — au
   * MÊME point que `applyStrategyCollectedAt`, parce que c'est le SEUL
   * endroit où Phase 4 écrit réellement `evaluation.dossier_read`. Migration
   * `1795713579246`.
   */
  async applyDossierReadCollectedAt(id: string, at: Date, manager?: EntityManager): Promise<void> {
    const runner = manager ?? this.accounts.manager
    await runner.query(`UPDATE accounts SET dossier_read_collected_at = $1 WHERE id = $2`, [at, id])
  }

  /**
   * #2298.4 (19/09/2026, lot I3) — le REJEU GRATUIT de l'axe relation seul,
   * écrit en une requête : `raw_analysis.addressability` (fusion JSONB, même
   * idiome que `applyContactsOutOfScope`) ET `addressability_relation_collected_at`
   * — TOUJOURS ensemble, jamais l'un sans l'autre, pour qu'un axe recalculé ne
   * reste jamais sans sa date (le bandeau « à revérifier » lirait alors un
   * calcul frais comme périmé). Seul appelant :
   * `AnalysisOnDemandService.recalculateRelationAxis`. Migration
   * `1795716734279` (voir son docblock : pourquoi une colonne DISTINCTE de
   * `signals_collected_at`).
   */
  async applyAddressabilityRelationRecalc(
    id: string,
    addressability: Record<string, unknown>,
    at: Date,
    manager?: EntityManager,
  ): Promise<void> {
    const runner = manager ?? this.accounts.manager
    await runner.query(
      `UPDATE accounts
          SET raw_analysis = COALESCE(raw_analysis, '{}'::jsonb) || jsonb_build_object('addressability', $1::jsonb),
              addressability_relation_collected_at = $2
        WHERE id = $3`,
      [JSON.stringify(addressability), at, id],
    )
  }

  /**
   * #3916.b — TOUTES les annonces de registre public (BODACC, ouvertures Sirene)
   * lues en continu pour un SIREN, avec la date de la dernière lecture. Lecture
   * seule, sur la table partagée : l'appartenance du compte à l'espace a déjà
   * été vérifiée par l'appelant, et la table ne dit jamais QUI regarde.
   */
  /**
   * #3970 (lot P07) — les recrutements récents d'un compte DÉJÀ ouvert par la
   * porte d'appartenance, rapprochés des personas et des métiers placés de
   * l'espace. Un profil illisible n'empêche pas la lecture : la pertinence
   * devient alors « non évaluable », jamais une pénalité.
   */
  async recentHires(
    workspaceId: string,
    userId: string,
    account: Pick<AccountEntity, 'id' | 'company_name'>,
  ): Promise<AccountRecentHires> {
    const answers = await this.esnProfile.getAnswers(userId).catch(() => null)
    return loadAccountRecentHires(recentHireContactsReader(this.accounts.manager), {
      workspaceId,
      accountId: account.id,
      companyName: account.company_name ?? '',
      profile: {
        personas: answers?.decision_maker_personas ?? [],
        placedRoles: answers?.placed_roles ?? [],
      },
    })
  }

  /** Louis 30/10 — les offres du compte pour le métier saisi (`job-offers.ts`). */
  async jobOffers(
    account: Pick<AccountEntity, 'company_name' | 'raw_analysis' | 'website' | 'siren'>,
    term: string,
    demo: boolean,
  ): Promise<AccountJobOffers> {
    return loadAccountJobOffers(input => this.ia.accountJobOffers(input), account, term, demo)
  }

  async registryAnnouncements(siren: string | null): Promise<AccountRegistryAnnouncements> {
    const clean = (siren ?? '').replace(/\D/g, '')
    if (clean.length !== 9) return toAccountRegistryAnnouncements([], null)
    const rows = await this.accounts.manager.query(REGISTRY_ANNOUNCEMENTS_SQL, [[clean], REGISTRY_ANNOUNCEMENTS_MAX])
    const state = await this.accounts.manager.query<{ checked_at: string | null; truncated: boolean | null }[]>(
      `SELECT GREATEST(bodacc_checked_at, sirene_checked_at) AS checked_at, bodacc_truncated AS truncated
         FROM public_registry_watch_state WHERE siren = $1`,
      [clean],
    )
    return toAccountRegistryAnnouncements(rows, state[0] ?? null)
  }

  /**
   * #3916.b — les annonces de registre de PLUSIEURS SIREN d'un coup, pour
   * « Pourquoi maintenant » de Découvrir. Une seule requête, bornée.
   */
  async registryAnnouncementsBySiren(sirens: readonly string[]): Promise<Map<string, RegistryAnnouncement[]>> {
    const clean = [...new Set(sirens.map(s => (s ?? '').replace(/\D/g, '')).filter(s => s.length === 9))]
    const out = new Map<string, RegistryAnnouncement[]>()
    if (clean.length === 0) return out
    const rows = await this.accounts.manager.query<Parameters<typeof toRegistryAnnouncement>[0][]>(
      REGISTRY_ANNOUNCEMENTS_SQL,
      [clean, REGISTRY_ANNOUNCEMENTS_MAX],
    )
    for (const row of rows ?? []) {
      const announcement = toRegistryAnnouncement(row)
      if (!announcement) continue
      out.set(row.siren, [...(out.get(row.siren) ?? []), announcement])
    }
    return out
  }

  /**
   * Les offres d'emploi IT que le dossier porte (`raw_analysis.it_job_signals`).
   *
   * Lecture pure, tolérante : une clé absente ou d'un autre type rend `[]`
   * plutôt que de lever. Les propositions de besoins ne valent pas qu'une
   * lecture fasse tomber quoi que ce soit.
   */
  async readJobSignals(id: string): Promise<Record<string, unknown>[]> {
    const rows = await this.accounts.manager.query<{ signals: unknown }[]>(
      `SELECT COALESCE(raw_analysis -> 'it_job_signals', '[]'::jsonb) AS signals FROM accounts WHERE id = $1`,
      [id],
    )
    // #4044 — les offres de stage ne sont jamais un signal : ni lues ici, ni proposées comme besoin.
    return dropInternshipRows(rows[0]?.signals).filter(
      (entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object',
    )
  }

  /**
   * #4760 — les besoins HISTORIQUES du dossier (`raw_analysis.signal_layers`) : les signaux et
   * les offres d'emploi que la fenêtre de fraîcheur a rangés en archive, nommés avec leur date.
   * La couche était calculée par l'IA et n'avait aucun lecteur. Lecture pure, tolérante :
   * une clé absente rend `historicalCount: null` (non mesuré), jamais 0.
   */
  async readSignalLayers(id: string): Promise<ReadSignalLayers> {
    const rows = await this.accounts.manager.query<{ layers: unknown }[]>(
      `SELECT raw_analysis -> 'signal_layers' AS layers FROM accounts WHERE id = $1`,
      [id],
    )
    return readSignalLayers({ signal_layers: rows[0]?.layers })
  }

  /** Merge the anti-hallucination Judge verdict into ``raw_analysis.judge``
   *  (issues / confidence / passed / verdict / checks / researchConfidence).
   *  Advisory output of the always-on Judge node, surfaced in the dossier so a
   *  flagged run is visible. Same JSONB shallow-merge as ``applyOrgChart`` — no
   *  migration, preserves the research / plan / org blobs already stored. */
  async applyJudge(id: string, verdict: Record<string, unknown>, manager?: EntityManager): Promise<void> {
    const runner = manager ?? this.accounts.manager
    await runner.query(
      `
      UPDATE accounts
      SET raw_analysis = COALESCE(raw_analysis, '{}'::jsonb) || jsonb_build_object('judge', $1::jsonb)
      WHERE id = $2
      `,
      [JSON.stringify(verdict), id],
    )
  }

  /** Per-phase audit telemetry — merged into raw_analysis under
   *  ``phase_telemetry`` (same JSONB-merge pattern as the plan; no migration).
   *  Operator drill-down only. */
  /** Persist the per-provider cost/latency breakdown of a run under
   *  ``raw_analysis.run_cost`` — same JSONB-merge pattern as the phase
   *  telemetry, so no migration and no schema coupling to a shape the IA
   *  service still iterates on. Operator/billing drill-down: it answers "where
   *  did the money and the minutes go" per analysis, which the single
   *  ``api_cost_euros`` figure cannot. */
  async applyRunCostBreakdown(id: string, breakdown: unknown, manager?: EntityManager): Promise<void> {
    const runner = manager ?? this.accounts.manager
    await runner.query(
      `
      UPDATE accounts
      SET raw_analysis = COALESCE(raw_analysis, '{}'::jsonb) || jsonb_build_object('run_cost', $1::jsonb)
      WHERE id = $2
      `,
      [JSON.stringify(breakdown), id],
    )
  }

  async applyPhaseTelemetry(id: string, telemetry: unknown[], manager?: EntityManager): Promise<void> {
    const runner = manager ?? this.accounts.manager
    await runner.query(
      `
      UPDATE accounts
      SET raw_analysis = COALESCE(raw_analysis, '{}'::jsonb) || jsonb_build_object('phase_telemetry', $1::jsonb)
      WHERE id = $2
      `,
      [JSON.stringify(telemetry), id],
    )
  }

  /** Mark the account as completed (Phase 4 success). Accepts an optional
   *  ``manager`` so the caller can wrap the status flip + outbox event in
   *  one transaction (see ``AnalysisPersistenceService.savePlan``). */
  async markCompleted(id: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(AccountEntity) : this.accounts
    // ⚠️ D44 · 26/08 avait LIÉ la coupure en paramètre pour qu'elle cesse de
    // dériver ; D53 · 26/08 va plus loin et la retire d'ici tout à fait.
    // La bande de score vit dans `deriveCommercialStatusOnComplete` et NULLE
    // PART AILLEURS (D53). Elle était recopiée ici en SQL, et les deux copies
    // avaient fini par ne plus dire la même chose — personne ne pouvait le
    // voir, rien n'exerçant la fonction.
    //
    // ⚠️ La lecture passe par le MÊME `manager` que l'écriture, jamais par
    // `getPriorityScore` : `priority_score` vient d'être écrit par `applyPlan`
    // DANS cette transaction, et une lecture hors transaction rendrait la
    // valeur d'avant le run.
    const rows = await repo.manager.query<{ priority_score: number | string | null }[]>(
      `SELECT priority_score FROM accounts WHERE id = $1`,
      [id],
    )
    const derived = deriveCommercialStatusOnComplete('inbox', priorityScoreOf(rows[0]?.priority_score))

    // Flip analysis status → completed ET pré-classement commercial (Théo p.39).
    //
    // ⚠️ La GARDE « seulement depuis l'inbox » reste ICI, sous le verrou de
    // ligne de l'UPDATE, et ne remonte pas dans le TypeScript : une correction
    // humaine gagne toujours. Si le commercial déplace le compte entre la
    // lecture ci-dessus et cette écriture, c'est SON geste qui tient. C'est
    // aussi pourquoi la dérivation est appelée avec `'inbox'` : le seul cas où
    // sa valeur est écrite est celui où le compte y est encore.
    await repo.manager.query(
      `UPDATE accounts
          SET status = 'completed',
              commercial_status = CASE
                WHEN COALESCE(commercial_status, 'inbox') = 'inbox'
                THEN $2::text
                ELSE commercial_status
              END
        WHERE id = $1`,
      [id, derived],
    )
  }

  /**
   * Tri commercial manuel (Théo p.39) — le commercial déplace un compte entre
   * « À qualifier / En observation / À potentiel / En cours d'ouverture /
   * Client actif / Hors priorité / En veille ». Scoped par `user_id`
   * (cross-tenant safe). `'archived'` aligne aussi le `status` d'analyse pour
   * rester cohérent avec le bouton « Archiver » existant ; toute autre valeur
   * réactive un compte archivé (status → 'completed').
   *
   * #2117.21 — `origin` dit QUI demande l'écriture, et son défaut est `system`,
   * du côté FERMÉ : un appelant qui ne se déclare pas ne peut pas poser
   * « En veille ». Le refus est calculé par `commercialStatusWriteRefusal`, qui
   * vit dans `@bellum/contracts` avec la règle (GA-26) — l'écran lit la MÊME
   * fonction, donc la porte ne peut pas dire deux choses différentes.
   */
  async setCommercialStatus(
    id: string,
    userId: string,
    status: CommercialLifecycle,
    reason?: string,
    origin: CommercialStatusWriteOrigin = 'system',
  ): Promise<void> {
    // #2117.21 — AVANT toute lecture et toute écriture : un chemin système qui
    // tente « En veille » repart sans avoir touché la base, et sans avoir
    // laissé d'entrée d'historique qui laisserait croire au geste.
    const refusal = commercialStatusWriteRefusal(status, origin, reason)
    if (refusal === 'human_only') {
      throw new BadRequestException(
        'commercial_status_human_only: « En veille » ne se pose que par un geste humain motivé',
      )
    }
    if (refusal === 'reason_required') {
      throw new BadRequestException('commercial_status_reason_required')
    }
    // L'état PRÉCÉDENT est lu avant l'écriture : sans lui, on ne peut pas
    // distinguer « ce compte vient de signer » de « ce compte était déjà client
    // et quelqu'un a recliqué ». Le journal ne doit consigner que le passage.
    const gestureWhere = await this.accountGestureWhere(id, userId)
    const before = await this.accounts.findOne({
      where: gestureWhere,
      select: { id: true, status: true, commercial_status: true, company_name: true },
    })
    const patch: Partial<AccountEntity> = { commercial_status: status }
    if (status === 'archived') {
      patch.status = 'archived'
    } else if (before?.status === 'archived') {
      // #3490 — sortir un dossier de « Écartés » le RENDOUBLE : sans cela le tri
      // commercial changeait mais `status` restait `archived`, et la fiche
      // restait hors des listes et hors du balayage des doublons.
      patch.status = 'completed'
    }
    await this.accounts.update(gestureWhere, patch)
    if (before && before.commercial_status !== status) {
      await this.recordCommercialStatusChange(before, userId, status, reason)
      await this.recordDealSigned(before, userId, status)
    }
  }

  /**
   * #2165.13 — marquer/démarquer CE compte comme la meilleure référence pour
   * le preset « Proches de mes meilleures références » de Découvrir.
   *
   * Scopé WORKSPACE (pas `user_id`) : une référence est un fait de
   * l'ESPACE, pas d'un seul commercial — `listBestReferenceSectors` doit la
   * retrouver quel que soit qui l'a marquée. L'appelant (contrôleur) a déjà
   * vérifié l'accès via `findOneForWorkspace` avant d'appeler ceci.
   */
  async setBestReference(id: string, workspaceId: string, value: boolean): Promise<void> {
    await this.accounts.update({ id, workspace_id: workspaceId }, { is_best_reference: value })
  }

  /** #3245 (#3209.6) — le profil déclaré, `null` partout quand rien ne l'est. */
  async getBetProfile(id: string, workspaceId: string): Promise<Required<SetBetProfileRequest>> {
    const row = await this.accounts.findOne({
      where: { id, workspace_id: workspaceId },
      select: { id: true, bet_horizon: true, bet_size: true, bet_access: true, bet_resource: true },
    })
    return {
      horizon: (row?.bet_horizon as SetBetProfileRequest['horizon']) ?? null,
      size: (row?.bet_size as SetBetProfileRequest['size']) ?? null,
      access: (row?.bet_access as SetBetProfileRequest['access']) ?? null,
      resource: row?.bet_resource ?? null,
    }
  }

  /**
   * #3282 / #3263.30 — le niveau d'entrée du comité d'achat, DÉCLARÉ par le
   * commercial (liste fermée). `null` = non déclaré, ou valeur hors liste
   * (jamais un échelon deviné) : sans niveau, rien n'est signalé « trop haut ».
   */
  async getCommitteeEntryLevel(id: string, workspaceId: string): Promise<{ level: CommitteeEntryLevel | null }> {
    const row = await this.accounts.findOne({
      where: { id, workspace_id: workspaceId },
      select: { id: true, committee_entry_level: true },
    })
    const stored = row?.committee_entry_level
    const level = COMMITTEE_ENTRY_LEVELS.find(candidate => candidate === stored) ?? null
    return { level }
  }

  /** #3282 — déclare (ou retire, avec `null`) le niveau d'entrée. Scopé workspace :
   *  l'appelant a déjà vérifié l'accès (`findOneForWorkspace`). */
  async setCommitteeEntryLevel(id: string, workspaceId: string, request: SetCommitteeEntryLevelRequest): Promise<void> {
    await this.accounts.update({ id, workspace_id: workspaceId }, { committee_entry_level: request.level })
  }

  /**
   * #3245 (recette prod 02/10) — « aucune UI de déclaration » : la liste des
   * dossiers avec ce qui en est DÉCLARÉ, pour l'écran Réglages › Charge
   * commerciale. Les dossiers déjà déclarés d'abord (ce qu'on règle en
   * premier), puis par nom ; `null` reste « non déclaré ». Cloisonnée par unité
   * comme `listBestReferenceSectors` (même clause, GA-26).
   */
  async listBetProfiles(
    workspaceId: string,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<BetProfileRow[]> {
    const qb = this.accounts
      .createQueryBuilder('account')
      .select([
        'account.id AS id',
        'account.company_name AS company_name',
        'account.bet_horizon AS bet_horizon',
        'account.bet_size AS bet_size',
        'account.bet_access AS bet_access',
        'account.bet_resource AS bet_resource',
      ])
      .where('account.workspace_id = :workspaceId', { workspaceId })
      .andWhere("account.status != 'deleted'")
    this.applyBusinessUnitScope(qb, businessUnitScope)
    const rows = await qb
      .orderBy(
        '(account.bet_horizon IS NOT NULL OR account.bet_size IS NOT NULL OR account.bet_access IS NOT NULL OR account.bet_resource IS NOT NULL)',
        'DESC',
      )
      .addOrderBy('account.company_name', 'ASC')
      .limit(100)
      .getRawMany<{
        id: string
        company_name: string
        bet_horizon: BetProfileRow['horizon']
        bet_size: BetProfileRow['size']
        bet_access: BetProfileRow['access']
        bet_resource: string | null
      }>()
    return rows.map(row => ({
      id: row.id,
      name: row.company_name,
      horizon: row.bet_horizon ?? null,
      size: row.bet_size ?? null,
      access: row.bet_access ?? null,
      resource: row.bet_resource ?? null,
    }))
  }

  /**
   * #3245 (#3209.6) — déclare (ou retire, avec `null`) le profil de pari d'un
   * compte. Un champ ABSENT de `profile` reste tel quel. Scopé workspace :
   * l'appelant a déjà vérifié l'accès (`findOneForWorkspace`).
   */
  async setBetProfile(id: string, workspaceId: string, profile: SetBetProfileRequest): Promise<void> {
    const patch: Partial<Record<'bet_horizon' | 'bet_size' | 'bet_access' | 'bet_resource', string | null>> = {}
    if (profile.horizon !== undefined) patch.bet_horizon = profile.horizon
    if (profile.size !== undefined) patch.bet_size = profile.size
    if (profile.access !== undefined) patch.bet_access = profile.access
    if (profile.resource !== undefined) patch.bet_resource = profile.resource?.trim() || null
    await this.accounts.update({ id, workspace_id: workspaceId }, patch)
  }

  /**
   * #2165.13 — les secteurs (bruts, pas encore normalisés) des comptes
   * marqués « meilleure référence » sur cet espace. Le NORMALISEUR
   * (`matchApplicationSectors`) vit côté web — le MÊME que lit déjà l'ICP
   * pour #2165.12, pas un second qui divergerait (GA-26).
   *
   * `sector: null` n'est PAS filtré ici : c'est à l'appelant de dire
   * « référence marquée, secteur inconnu » plutôt que de la faire disparaître
   * en silence.
   */
  async listBestReferenceSectors(
    workspaceId: string,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<{ id: string; name: string; sector: string | null }[]> {
    // #2084.24 — écrite en QueryBuilder et non plus en `find({ where })` : le
    // cloisonnement s'exprime en SQL (`IN (…) OR IS NULL`), et le traduire en
    // objet TypeORM aurait été une SECONDE écriture de la même règle (GA-26) —
    // celle qui perd sa seconde moitié le jour où quelqu'un la « simplifie ».
    const qb = this.accounts
      .createQueryBuilder('account')
      .select(['account.id AS id', 'account.company_name AS company_name', 'account.sector AS sector'])
      .where('account.workspace_id = :workspaceId', { workspaceId })
      .andWhere('account.is_best_reference = true')
    this.applyBusinessUnitScope(qb, businessUnitScope)
    const rows = await qb.limit(50).getRawMany<{ id: string; company_name: string; sector: string | null }>()
    return rows.map(row => ({ id: row.id, name: row.company_name, sector: row.sector }))
  }

  /**
   * #2117.24 — CHAQUE transition du statut commercial au journal : qui
   * (`user_id`), de → vers, et le motif quand il y en a un (#2117.23).
   *
   * Seul le passage en client laissait une trace (`deal_signed`, ci-dessous) ;
   * l'info-bulle du statut disait donc, honnêtement, « l'historique complet
   * n'est pas encore journalisé ». Même discipline que `recordDealSigned` :
   * best-effort, APRÈS l'écriture du statut — un journal en échec ne refuse pas
   * au commercial le geste qu'il a demandé. La contrainte
   * `user_actions_action_type_check` connaît la valeur depuis
   * `1793700310000-CommercialStatusChangedActionType`, AVANT ce code (GA-11/12).
   */
  private async recordCommercialStatusChange(
    account: Pick<AccountEntity, 'id' | 'commercial_status' | 'company_name'>,
    userId: string,
    status: CommercialLifecycle,
    reason: string | undefined,
  ): Promise<void> {
    if (!this.userActions) return
    const motif = reason?.trim() || null
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      await this.userActions.save(
        this.userActions.create({
          user_id: userId,
          workspace_id: workspaceId,
          account_id: account.id,
          contact_id: null,
          action_type: 'commercial_status_changed',
          channel: null,
          metadata: {
            label: 'Statut commercial modifié',
            detail: motif,
            from: account.commercial_status ?? null,
            to: status,
            reason: motif,
            via: 'declaration',
          },
        }),
      )
    } catch (cause) {
      this.logger.error('commercial-status-changed action-log error', {
        error: cause,
        tags: { accountId: account.id },
      })
    }
  }

  /**
   * « Affaire signée » au journal d'activité, sur le passage d'un compte en
   * client.
   *
   * `deal_signed` était LU par les KPIs d'équipe et écrit par PERSONNE : le
   * compteur affichait zéro affaire pour des espaces qui en signaient. Le geste
   * existait pourtant déjà — le commercial déplace le compte en « Client » — il
   * ne laissait simplement aucune trace.
   *
   * Sur la TRANSITION seulement : un compte déjà client qu'on re-marque client
   * n'a pas signé deux fois.
   *
   * Best-effort, et volontairement APRÈS l'écriture du statut : le déplacement
   * du compte est le geste que l'utilisateur a demandé, un journal en échec ne
   * doit pas le lui refuser.
   */
  private async recordDealSigned(
    account: Pick<AccountEntity, 'id' | 'commercial_status' | 'company_name'>,
    userId: string,
    status: CommercialLifecycle,
  ): Promise<void> {
    if (status !== 'customer' || !this.userActions) return
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      await this.userActions.save(
        this.userActions.create({
          user_id: userId,
          workspace_id: workspaceId,
          account_id: account.id,
          contact_id: null,
          action_type: 'deal_signed',
          channel: null,
          metadata: {
            label: 'Affaire signée',
            detail: account.company_name ?? '',
            // Déclaration du commercial : Bellum ne lit aucun contrat et ne
            // déduit rien d'un CRM. La nature de la trace est donc explicite.
            via: 'declaration',
            declared: true,
            previous_status: account.commercial_status ?? null,
          },
        }),
      )
    } catch (cause) {
      this.logger.error('deal-signed action-log error', { error: cause, tags: { accountId: account.id } })
    }
  }

  /** Persist the accumulated LLM cost of an analysis (B1 telemetry). Stored on
   *  the legacy-named ``api_cost_euros`` column as a USD figure — Anthropic
   *  bills in USD; the column predates the unit decision. Feeds the telemetry
   *  endpoint + monitoring dashboard. */
  async setApiCost(id: string, costUsd: number, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(AccountEntity) : this.accounts
    await repo.update({ id }, { api_cost_euros: costUsd.toFixed(6) })
  }

  /** Flip an errored/cancelled account back to ``analyzing`` so the UI
   *  shows the progress card again. Called by the resume flow before
   *  re-enqueueing the BullMQ job. Scoped by the caller's WORKSPACE (#4731) so a cross-tenant
   *  request can't flip someone else's account. */
  async markAnalyzing(id: string, userId: string): Promise<void> {
    await this.accounts.update(await this.accountGestureWhere(id, userId), { status: 'analyzing', error_message: null })
  }

  /** Mark the account as errored (terminal worker failure). Stores `error_message`
   *  so the UI can show what went wrong instead of a generic banner. */
  async markErrored(id: string, errorMessage?: string): Promise<void> {
    await this.accounts.update({ id }, { status: 'error', error_message: errorMessage ?? null })
  }

  /**
   * Bascule un run FANTÔME (`analyzing` sans job vivant) vers `error`, via une
   * transition GARDÉE sur `status='analyzing'`, et dit si l'appelant a gagné la
   * course. Trois chemins peuvent réparer le même compte — le worker, la
   * réparation à la lecture (`AnalysisService.getStatus`) et le faucheur
   * périodique (`StuckAnalysisReaper`) — et chacun doit rendre le crédit
   * d'analyse. La garde fait que **exactement un** d'entre eux voit `true`,
   * donc le crédit est remboursé une fois et une seule (le `markErrored` non
   * gardé ci-dessus ne permettait pas de trancher, d'où le double
   * remboursement possible si on l'avait réutilisé tel quel).
   */
  async markInterrupted(id: string, errorMessage: string): Promise<boolean> {
    const result = await this.accounts.update(
      { id, status: 'analyzing' },
      { status: 'error', error_message: errorMessage },
    )
    return (result.affected ?? 0) > 0
  }

  /** Mark the account as cancelled by the user. Uses the dedicated
   *  ``'canceled'`` status so reads/writes can branch on status alone.
   *
   *  Scoped by ``user_id`` so a cross-tenant request can't mark someone
   *  else's account as cancelled. */
  async markCancelled(id: string, userId: string): Promise<void> {
    await this.accounts.update(await this.accountGestureWhere(id, userId), {
      status: 'canceled',
      error_message: ANALYSIS_CANCELLED_MESSAGE,
    })
  }

  /** Cross-tenant lookup by id — NO ``user_id`` scope. Operator/admin backoffice
   *  only (the super-admin monitoring surface behind ``InternalSecretGuard``): it
   *  needs the owner ``user_id`` + ``company_name`` + ``siren`` to reconstruct the
   *  analysis jobId when stopping an arbitrary user's run. Never reachable from an
   *  end-user JWT path — those go through the ``user_id``-scoped ``findOne``.
   *  Returns ``null`` when the account doesn't exist. */
  async findByIdUnscoped(id: string): Promise<AccountEntity | null> {
    return this.accounts.findOne({ where: { id } })
  }

  /**
   * Distinct sector strings observed in the workspace — alphabetically sorted,
   * NULL/empty filtered out. Used by the FilterBar's "Sector" dropdown so the
   * user only sees sectors that actually exist in the team's data (Phase 2:
   * team-scoped read).
   */
  async listSectors(workspaceId: string, businessUnitScope: BusinessUnitScopeClause = null): Promise<string[]> {
    try {
      const qb = this.accounts
        .createQueryBuilder('account')
        .select('DISTINCT account.sector', 'sector')
        .where('account.workspace_id = :workspaceId', { workspaceId })
        .andWhere('account.status <> :deletedStatus', { deletedStatus: DELETED_ACCOUNT_STATUS })
        .andWhere("account.sector IS NOT NULL AND account.sector <> ''")
      // #2084.24 — le cloisonnement vaut aussi sur les FACETTES de la liste.
      // La même méthode que la liste elle-même : deux écritures de la règle
      // divergeraient (GA-26), et une facette qui déborde dessine en creux le
      // portefeuille qu'on vient de cacher.
      this.applyBusinessUnitScope(qb, businessUnitScope)
      const rows = await qb.orderBy('sector', 'ASC').getRawMany<{ sector: string }>()
      return rows.map(r => r.sector)
    } catch (err) {
      this.logger.error('listSectors error', { error: err })
      return []
    }
  }

  /**
   * #2159.26 — les étiquettes EN USAGE sur les comptes de l'espace, pour le
   * filtre de liste. Comme `listSectors` : l'écran ne propose que des valeurs
   * réelles, jamais une étiquette qu'aucun compte ne porte.
   *
   * Graphie de la première saisie (décision Louis 19/09) : deux comptes
   * peuvent porter la MÊME étiquette sous deux graphies (« SAP » / « sap »).
   * La requête rend une ligne par (compte, étiquette) — PAS `DISTINCT` — dans
   * l'ordre de création des comptes, et `pickRepresentativeTags` regroupe par
   * clé insensible à la casse en gardant la graphie la plus fréquente, à
   * égalité la première rencontrée. `LIMIT` élargie (occurrences, pas clés
   * distinctes) pour rester une bonne approximation de facette.
   */
  async listTags(workspaceId: string, businessUnitScope: BusinessUnitScopeClause = null): Promise<string[]> {
    try {
      // #2084.24 — le cloisonnement, dans le dialecte POSITIONNEL du SQL brut.
      // ⚠️ La clause s'AJOUTE : `a.workspace_id = $1` SURVIT. C'est la famille
      // de requêtes qui avait déjà échappé au cloisonnement une première fois
      // (le détail d'un compte, R15N-16) — parce qu'elle ne passe pas par le
      // QueryBuilder, donc pas par `applyBusinessUnitScope`. La FORME de la
      // règle, elle, reste celle des listes, au caractère près.
      const clause = businessUnitScopeClause(businessUnitScope, 'a.business_unit_id', 'SELECT unnest($3::uuid[])')
      const params: unknown[] = [workspaceId, DELETED_ACCOUNT_STATUS]
      if (businessUnitScope && businessUnitScope.businessUnitIds.length > 0) {
        params.push([...businessUnitScope.businessUnitIds])
      }
      const rows = await this.accounts.query(
        `SELECT t.tag
           FROM accounts a
          CROSS JOIN LATERAL unnest(a.tags) AS t(tag)
          WHERE a.workspace_id = $1 AND a.status <> $2${clause ? `\n            AND ${clause}` : ''}
            AND cardinality(a.tags) > 0
          ORDER BY a.created_at ASC
          LIMIT 5000`,
        params,
      )
      return pickRepresentativeTags((rows as { tag: string }[]).map(r => r.tag))
    } catch (err) {
      this.logger.error('listTags error', { error: err })
      return []
    }
  }

  /** Distinct company names in the workspace, sorted alphabetically (Phase 2:
   *  team-scoped read). */
  async listCompanies(workspaceId: string, businessUnitScope: BusinessUnitScopeClause = null): Promise<string[]> {
    try {
      const qb = this.accounts
        .createQueryBuilder('account')
        .select('DISTINCT account.company_name', 'company_name')
        .where('account.workspace_id = :workspaceId', { workspaceId })
        .andWhere('account.status <> :deletedStatus', { deletedStatus: DELETED_ACCOUNT_STATUS })
      // #2084.24 — la facette la plus nommable : sans cette clause, un membre
      // cloisonné lisait ici les RAISONS SOCIALES des comptes que sa propre
      // liste venait de lui cacher.
      this.applyBusinessUnitScope(qb, businessUnitScope)
      const rows = await qb.orderBy('company_name', 'ASC').getRawMany<{ company_name: string }>()
      return rows.map(r => r.company_name)
    } catch (err) {
      this.logger.error('listCompanies error', { error: err })
      return []
    }
  }

  async listDashboardAccounts(userId: string): Promise<DashboardAccountInsight[]> {
    try {
      const rows = await this.accounts
        .createQueryBuilder('account')
        .select([
          'account.id AS id',
          'account.company_name AS company_name',
          'account.sector AS sector',
          'account.employees AS employees',
          'account.priority_score AS priority_score',
          'account.priority_justification AS priority_justification',
          'account.recent_signals AS recent_signals',
          'account.status AS status',
          'account.created_at AS created_at',
          // Logo réel Apollo + site (favicon de secours) — mêmes colonnes que la
          // liste des comptes, même requête : le Cockpit affichait l'initiale
          // alors que la donnée était déjà là.
          'account.logo_url AS logo_url',
          'account.website AS website',
          'account.assigned_to AS assigned_to',
        ])
        .where('account.user_id = :userId', { userId })
        .andWhere('account.status <> :deletedStatus', { deletedStatus: DELETED_ACCOUNT_STATUS })
        .orderBy('account.created_at', 'DESC')
        .limit(200)
        .getRawMany<DashboardAccountRow>()
      return rows.map(toDashboardAccountInsight)
    } catch (err) {
      this.logger.error('listDashboardAccounts error', { error: err })
      return []
    }
  }

  /**
   * "Mes comptes" for the personal cockpit (roadmap §5 — seat value). STRICTLY
   * scoped to the caller: accounts they created (`user_id`) *inside their active
   * workspace* (`workspace_id`) — never a teammate's rows. There is no
   * account→commercial assignment concept, so ownership is the account creator.
   * Ordered by priority score (hottest first, NULLs last) then most recent, so
   * the rep sees their own top targets. Fails soft to `[]` on a DB blip.
   */
  async listPersonalAccounts(userId: string, workspaceId: string): Promise<DashboardAccountInsight[]> {
    try {
      const rows = await this.personalAccountsScope(userId, workspaceId)
        .select([
          'account.id AS id',
          'account.company_name AS company_name',
          'account.sector AS sector',
          'account.employees AS employees',
          'account.priority_score AS priority_score',
          'account.priority_justification AS priority_justification',
          'account.recent_signals AS recent_signals',
          'account.status AS status',
          'account.created_at AS created_at',
          // Logo réel Apollo + site (favicon de secours) — mêmes colonnes que la
          // liste des comptes, même requête : le Cockpit affichait l'initiale
          // alors que la donnée était déjà là.
          'account.logo_url AS logo_url',
          'account.website AS website',
          'account.assigned_to AS assigned_to',
        ])
        .orderBy('account.priority_score', 'DESC', 'NULLS LAST')
        .addOrderBy('account.created_at', 'DESC')
        .limit(PERSONAL_ACCOUNTS_LIST_LIMIT)
        .getRawMany<DashboardAccountRow>()
      return rows.map(toDashboardAccountInsight)
    } catch (err) {
      this.logger.error('listPersonalAccounts error', { error: err })
      return []
    }
  }

  /**
   * La PORTÉE de « mes comptes » — écrite une fois, lue par la liste ET par le
   * compteur.
   *
   * ⚠️ Deux requêtes qui refont le même filtre divergent ; c'est le motif que
   * la recette du 29/08/2026 a payé sur un autre couple (« 27 comptes suivis »
   * contre « 23 suivis »). Ici la portée ne peut plus diverger : il n'y en a
   * qu'une.
   */
  private personalAccountsScope(userId: string, workspaceId: string) {
    return (
      this.accounts
        .createQueryBuilder('account')
        // #1408 — le RESPONSABLE, plus le créateur. Le mot « mon portefeuille » ne
        // désigne plus qu'une seule population dans tout le produit ; il en
        // désignait deux, et le cockpit et `/comptes` répondaient chacun la
        // sienne. La bascule n'est tenable que parce que `create()` pose
        // désormais `assigned_to` et que le stock a été repris — sans ça, elle
        // aurait vidé le cockpit de tout compte né d'une analyse.
        .where('account.assigned_to = :userId', { userId })
        .andWhere('account.workspace_id = :workspaceId', { workspaceId })
        .andWhere('account.status <> :deletedStatus', { deletedStatus: DELETED_ACCOUNT_STATUS })
    )
  }

  /**
   * #3094 — LES COMPTES D'UN MEMBRE NOMMÉ, pour Laura (« quels sont les
   * comptes de <membre> ? »). Réutilise {@link personalAccountsScope} : c'est
   * exactement le même filtre que « mes comptes », pour un `memberUserId`
   * arbitraire plutôt que l'appelant — un filtre ne se réécrit pas (GA-26).
   */
  async accountsAssignedTo(
    memberUserId: string,
    workspaceId: string,
    limit: number,
  ): Promise<{ id: string; company_name: string; sector: string | null }[]> {
    return this.personalAccountsScope(memberUserId, workspaceId)
      .select(['account.id AS id', 'account.company_name AS company_name', 'account.sector AS sector'])
      .orderBy('account.company_name', 'ASC')
      .limit(limit)
      .getRawMany()
  }

  /**
   * COMBIEN de comptes j'ai créés dans cet espace — par une requête de comptage.
   *
   * ⚠️ Le cockpit lisait `listPersonalAccounts(...).length`, et cette liste est
   * bornée à {@link PERSONAL_ACCOUNTS_LIST_LIMIT}. Au-delà, le KPI se serait
   * figé sur la borne sans que rien ne le signale — un plafond qui a l'air d'un
   * chiffre. La liste sert à AFFICHER, le compte à COMPTER.
   *
   * Ce n'est PAS la population « comptes suivis » de `/accounts`, qui a sa
   * propre définition (`ACCOUNT_HYGIENE_PREDICATES.followedAccounts`) et son
   * propre libellé : ici on compte ce qu'on a créé, là-bas ce qu'on suit.
   */
  async countPersonalAccounts(userId: string, workspaceId: string): Promise<number> {
    // ⚠️ L'échec REMONTE, il ne se tait pas à zéro. Ce compte alimente une tuile
    // du cockpit ; une requête cassée qui rendait `0` s'affichait « 0 compte »,
    // indiscernable d'un portefeuille réellement vide. « Non mesuré » n'est
    // jamais « 0 » (GA-18/GA-19), et le seul appelant — `PersonalCockpitService`
    // — sait désormais montrer un état d'échec plutôt que des tuiles à zéro.
    return this.personalAccountsScope(userId, workspaceId).getCount()
  }

  /**
   * La moyenne des scores de priorité — ET la population sur laquelle elle est
   * calculée (tome 7, loi 2, élément n°6 : « calculé sur … »).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QUI CHANGE, ET CE QUI NE CHANGE PAS
   * ─────────────────────────────────────────────────────────────────────────
   * La moyenne est BYTE-IDENTIQUE à celle d'avant : `AVG` ignore déjà les
   * `NULL`, la clause `priority_score IS NOT NULL` était donc redondante et son
   * retrait ne déplace pas un chiffre. Ce qui est neuf est le DÉNOMINATEUR.
   *
   * L'exclusion elle-même est juste et ancienne — un dossier non noté n'a pas un
   * score de zéro, il sort du calcul. Elle était SILENCIEUSE : l'écran d'accueil
   * affichait « 7/10 » sans dire que douze dossiers sur quarante-trois avaient
   * été mis de côté, et un chiffre nu se lit comme une mesure complète. C'est le
   * même raisonnement que « un axe non évaluable sort du dénominateur, sinon le
   * score mesure la complétude de nos données », appliqué à la POPULATION.
   *
   * `COUNT(account.priority_score)` compte les lignes NON NULLES de la colonne,
   * `COUNT(*)` compte toutes les lignes du périmètre : les deux dans la MÊME
   * requête, donc jamais deux photos prises à deux instants différents.
   *
   * ⚠️ Sur exception, `total` vaut `null` et non `0`. « Je n'ai pas pu compter »
   * n'est pas « il n'y a rien » — c'est l'invariant du pilotage, repris ici.
   */
  async averagePriorityScore(userId: string): Promise<{ average: number; scope: Completeness }> {
    try {
      const row = await this.accounts
        .createQueryBuilder('account')
        .select('AVG(account.priority_score)', 'avg')
        .addSelect('COUNT(account.priority_score)', 'scored')
        .addSelect('COUNT(*)', 'total')
        .where('account.user_id = :userId', { userId })
        .andWhere('account.status <> :deletedStatus', { deletedStatus: DELETED_ACCOUNT_STATUS })
        .getRawOne<{ avg: string | null; scored: string | null; total: string | null }>()
      return {
        average: Math.round(Number(row?.avg ?? 0)),
        scope: {
          counted: toCount(row?.scored),
          // Une ligne absente n'est pas un comptage à zéro : sans réponse, on ne
          // sait pas combien de dossiers existent.
          total: row ? toCount(row.total) : null,
        },
      }
    } catch (err) {
      this.logger.error('averagePriorityScore error', { error: err })
      return { average: 0, scope: { counted: 0, total: null } }
    }
  }
  /**
   * Look up an account currently being analyzed for the caller's WORKSPACE and
   * this canonical company. Second idempotency check in the analysis start flow
   * on top of the BullMQ deterministic jobId — closes the race where two
   * concurrent `POST /analysis/start` requests both pass `getJob(jobId) === null`
   * and each call `create()`, leaving an orphan `analyzing` row.
   *
   * WORKSPACE-scoped (not per-user) so the canonical guarantee holds for the whole
   * team: if a teammate already has this company in flight, we hand that row back
   * instead of stacking a second `analyzing` account (« un seul compte par
   * (workspace, entreprise canonique) »). Named `…ByUserAndCompany` for symmetry
   * with {@link findCompletedByUserAndCompany}, which is likewise scoped by the
   * user's active workspace.
   *
   * Canonical key: an exact `siren` match wins when a SIREN is known (stable id,
   * casse/nom-insensible — test « re-search par SIREN ») ; otherwise a
   * case-insensitive `LOWER(TRIM(company_name))` match (free-text form).
   *
   * Fails open (`null`) on a DB / workspace-resolution blip so a transient error
   * never blocks a legitimate launch.
   */
  async findAnalyzingByUserAndCompany(
    userId: string,
    companyName: string,
    opts: { siren?: string } = {},
  ): Promise<AccountEntity | null> {
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const qb = this.accounts
        .createQueryBuilder('account')
        .where('account.workspace_id = :workspaceId', { workspaceId })
        .andWhere('account.status = :status', { status: 'analyzing' })
      const domain = opts.siren ? null : companyDomainKey(companyName)
      if (opts.siren) {
        qb.andWhere('(LOWER(TRIM(account.company_name)) = LOWER(TRIM(:companyName)) OR account.siren = :siren)', {
          companyName,
          siren: opts.siren,
        })
      } else if (domain) {
        // #2284.20 / #2284.1 — le DOMAINE comme clé de résolution, AVANT la
        // création : « thalesgroup.com » retrouve le compte dont c'est le site.
        qb.andWhere(
          `(LOWER(TRIM(account.company_name)) = LOWER(TRIM(:companyName)) OR ${WEBSITE_ROOT_DOMAIN_SQL} = :domain)`,
          { companyName, domain },
        )
      } else {
        qb.andWhere('LOWER(TRIM(account.company_name)) = LOWER(TRIM(:companyName))', { companyName })
      }
      return await qb.orderBy('account.created_at', 'DESC').getOne()
    } catch (err) {
      this.logger.error('findAnalyzingByUserAndCompany error', { error: err })
      // Fail open: better to potentially create a duplicate than to block a
      // legitimate retry because of a transient DB blip.
      return null
    }
  }

  /**
   * #2704.1 — QUI a lancé un run qu'on rejoint, pour que l'écran de la
   * SECONDE personne le NOMME au lieu de rester muet (Bedros/Adel, Apricot
   * Labs, 22/09/2026 : « il faut qu'on se relaie »). Même règle d'auteur que
   * le fil de Laura (#1940.4) : un PRÉNOM et un AVATAR, résolus parmi les
   * membres de l'espace LU, jamais l'e-mail ni l'identifiant.
   *
   * `null` = rien à nommer — pas d'identifiant, auteur hors de l'espace,
   * prénom vide ou lecture en échec (`resolveWorkspaceAuthors` avale déjà
   * l'erreur) — l'appelant garde alors son message générique, jamais un nom
   * deviné.
   */
  async workspaceAuthorOf(workspaceId: string, userId: string | null): Promise<WorkspaceAuthor | null> {
    if (!userId) return null
    const authors = await resolveWorkspaceAuthors(this.accounts.manager, workspaceId, [userId], 'analyse en vol')
    return authors.get(userId) ?? null
  }

  /**
   * Result-cache lookup (C1): the most recent **completed** account for this
   * (user, company) within a freshness window, else ``null``.
   *
   * Re-analyzing a company that was already fully analyzed re-pays Brave +
   * Firecrawl + Pappers + Claude (~$0.65). When a fresh completed dossier
   * already exists we hand it back instead of launching a new run.
   *
   * - **Always** scoped by ``user_id`` — never returns another tenant's row.
   * - Prefers an exact ``siren`` match when one is known (stable id); otherwise
   *   falls back to a case-insensitive ``company_name`` match (free-text form).
   * - Freshness is measured on ``updated_at`` (reused as ``refreshed_at`` — the
   *   ``accounts_updated_at`` trigger bumps it on every write, and the last
   *   write of a successful run is the ``status = 'completed'`` flip).
   *
   * Fails open (``null``) on a DB error so a transient blip never blocks a
   * legitimate fresh analysis.
   */
  async findCompletedByUserAndCompany(
    userId: string,
    companyName: string,
    opts: { siren?: string; maxAgeDays?: number } = {},
  ): Promise<AccountEntity | null> {
    const maxAgeDays = opts.maxAgeDays ?? CACHE_MAX_AGE_DAYS
    const cutoff = new Date(Date.now() - maxAgeDays * ONE_DAY_MS)
    try {
      // Scoped by WORKSPACE, not user (Louis: le cache doit servir toute l'ESN) —
      // a teammate who already analysed this company hands back the fresh dossier
      // instead of re-running the whole ~$0.65 pipeline + re-spending Pappers.
      // Never crosses a workspace boundary. Mirrors findAccountsByWorkspace.
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const qb = this.accounts
        .createQueryBuilder('account')
        .where('account.workspace_id = :workspaceId', { workspaceId })
        .andWhere('account.status = :status', { status: 'completed' })
      const domain = opts.siren ? null : companyDomainKey(companyName)
      if (opts.siren) {
        qb.andWhere('account.siren = :siren', { siren: opts.siren })
      } else if (domain) {
        // #2284.20 / #2284.1 — même clé que ci-dessus : une saisie qui EST un
        // domaine se résout aussi par le site du compte, jamais un nom.
        qb.andWhere(`(LOWER(account.company_name) = LOWER(:companyName) OR ${WEBSITE_ROOT_DOMAIN_SQL} = :domain)`, {
          companyName,
          domain,
        })
      } else {
        qb.andWhere('LOWER(account.company_name) = LOWER(:companyName)', { companyName })
      }
      return await qb
        .andWhere('account.updated_at >= :cutoff', { cutoff })
        .orderBy('account.updated_at', 'DESC')
        .getOne()
    } catch (err) {
      this.logger.error('findCompletedByUserAndCompany error', { error: err })
      // Fail open: a cache miss just means we run a fresh analysis.
      return null
    }
  }

  /**
   * Les dossiers complets de l'espace, pour le REJEU d'une démo (mode démo C1).
   *
   * Quand un visiteur tape un nom d'entreprise qui ne correspond à aucun dossier
   * seedé, la démo lui montre l'un de ces dossiers d'exemple plutôt que de
   * fabriquer des données sur l'entreprise qu'il a tapée. Ordre STABLE
   * (`created_at ASC`) : c'est ce qui rend le choix reproductible d'une
   * connexion à l'autre — la même saisie tombe toujours sur le même dossier.
   *
   * Échoue à vide (jamais d'exception) : un espace démo sans dossier doit se
   * dire, pas planter le clic.
   */
  async listCompletedForDemoReplay(userId: string): Promise<AccountEntity[]> {
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      return await this.accounts.find({
        where: { ...workspaceScopeWhere(workspaceId), status: 'completed' },
        order: { created_at: 'ASC' },
      })
    } catch (err) {
      this.logger.error('listCompletedForDemoReplay error', { error: err })
      return []
    }
  }

  /**
   * Relance après échec (bug « 7× Decathlon ») : le compte le plus récent en
   * statut ``error`` / ``canceled`` pour ce (user, entreprise), destiné à être
   * RÉUTILISÉ par ``AnalysisService.start`` au lieu de créer une nouvelle ligne
   * à chaque retry. Sans ce chemin, un compte échoué ne matche ni
   * {@link findAnalyzingByUserAndCompany} (il n'est plus ``analyzing``) ni
   * {@link findCompletedByUserAndCompany} (il n'est pas ``completed``) — chaque
   * relance appelait donc ``create()`` et empilait un doublon dans /accounts.
   *
   * - **WORKSPACE-scopé** (comme {@link findCompletedByUserAndCompany}) — jamais
   *   la ligne d'un autre tenant, MAIS la coquille échouée d'un COÉQUIPIER du même
   *   workspace est réutilisée plutôt que dupliquée (« un seul compte par
   *   (workspace, entreprise canonique) »). Le nom `…ByUserAndCompany` désigne le
   *   workspace ACTIF du caller.
   * - Statuts réutilisables : ``error`` + ``canceled`` + ``prospect`` (compte du
   *   portefeuille jamais analysé — cf. `REUSABLE_SHELL_STATUSES`). ``analyzing``
   *   est géré en amont (idempotence layer 2), ``completed`` par le result
   *   cache / la relance en place, ``archived`` a été écarté volontairement
   *   (dedup SIREN / tri commercial) et ``deleted`` est invisible.
   * - Clé de dédup CANONIQUE (#494), pas juste `lower(name)` :
   *     • ``LOWER(TRIM(company_name))`` — « Decathlon » et «  DECATHLON  »
   *       retombent sur la même ligne ;
   *     • OU ``siren`` (pivot FR stable — match insensible à la casse/au nom) ;
   *     • OU ``(registry_id, registry_country)`` (jumeau international #494 —
   *       CIK US / BCE BE / UID CH…) quand l'appelant les connaît.
   *   Un identifiant registre matche l'entité MÊME si le nom tapé diffère
   *   légèrement (« re-search par SIREN/registry_id → match »).
   *
   * Fail open (``null``) sur erreur DB / résolution workspace : un blip ne bloque
   * jamais une relance — au pire on crée un doublon, que la purge migration ramasse.
   */
  async findReusableFailedByUserAndCompany(
    userId: string,
    companyName: string,
    opts: { siren?: string; registryId?: string; registryCountry?: string } = {},
  ): Promise<AccountEntity | null> {
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const qb = this.accounts
        .createQueryBuilder('account')
        .where('account.workspace_id = :workspaceId', { workspaceId })
        .andWhere('account.status IN (:...statuses)', { statuses: [...REUSABLE_SHELL_STATUSES] })

      // Canonical key = normalized name OR a stable registry identifier. Every
      // registry clause is ANDed on its OWN column pair so a null id never matches
      // another null id (SQL `x = NULL` is already never true, but the guards make
      // intent explicit and dodge accidental broad matches).
      const keyClauses = ['LOWER(TRIM(account.company_name)) = LOWER(TRIM(:companyName))']
      const params: Record<string, unknown> = { companyName }
      if (opts.siren) {
        keyClauses.push('account.siren = :siren')
        params['siren'] = opts.siren
      }
      if (opts.registryId && opts.registryCountry) {
        keyClauses.push('(account.registry_id = :registryId AND account.registry_country = :registryCountry)')
        params['registryId'] = opts.registryId
        params['registryCountry'] = opts.registryCountry
      }
      qb.andWhere(`(${keyClauses.join(' OR ')})`, params)

      return await qb.orderBy('account.updated_at', 'DESC').getOne()
    } catch (err) {
      this.logger.error('findReusableFailedByUserAndCompany error', { error: err })
      return null
    }
  }

  /**
   * #4603 — le compte de la MÊME société dans l'espace actif, QUEL QUE SOIT son
   * statut et son chemin d'entrée (CRM, import, Découvrir), ou `null`.
   *
   * Complète {@link findReusableFailedByUserAndCompany} (relance après échec,
   * « 7× Decathlon ») là où il ne pouvait pas voir : la fiche venue du CRM.
   * La décision est `pickSameCompanyAccount` (SIREN d'abord, puis la clé
   * partagée `marketMatchKey` — GA-26) ; ce SQL ne fait que RÉTRÉCIR les
   * candidats (SIREN égal, ou mot le plus long de la clé dans le nom replié),
   * toujours dans l'espace (`workspace_id`), jamais un compte rattaché ailleurs
   * (`merged_into_id`). Fail open (`null`) comme sa voisine : un blip crée au
   * pire un doublon, que le rattrapage ciblé (`AccountCrmFusionService`) ramasse.
   */
  async findSameCompanyAccount(
    userId: string,
    companyName: string,
    opts: { siren?: string } = {},
  ): Promise<AccountEntity | null> {
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const siren = normalizeSiren(opts.siren)
      const token = sameCompanyPrefilterToken(companyName)
      if (!siren && !token) return null
      const rows = await this.accounts.manager.query<SameCompanyCandidate[]>(
        `SELECT a.id, a.company_name, a.siren, a.status, a.updated_at,
                EXISTS (SELECT 1 FROM analysis_runs r WHERE r.account_id = a.id) AS has_runs
           FROM accounts a
          WHERE a.workspace_id = $1
            AND a.merged_into_id IS NULL
            AND a.status <> 'deleted'
            AND (($2::text IS NOT NULL AND a.siren = $2::text)
                 OR ($3::text IS NOT NULL AND bellum_normalize_name(a.company_name) LIKE '%' || $3::text || '%'))
          LIMIT 50`,
        [workspaceId, siren, token],
      )
      const pick = pickSameCompanyAccount(rows ?? [], { companyName, siren })
      if (!pick) return null
      this.logger.log('Same company account found — reused instead of a second row (#4603)', {
        accountId: pick.account.id,
        basis: pick.basis,
        userId,
      })
      return await this.accounts.findOne({ where: { id: pick.account.id, workspace_id: workspaceId } })
    } catch (err) {
      this.logger.error('findSameCompanyAccount error', { error: err })
      return null
    }
  }

  /**
   * Prépare un compte EXISTANT pour un nouveau run EN PLACE (jamais une 2ᵉ ligne) :
   *  - une coquille ``error``/``canceled`` trouvée par
   *    {@link findReusableFailedByUserAndCompany} (relance après échec), ou
   *  - un dossier ``completed`` que l'utilisateur RELANCE explicitement
   *    (`relaunch` — rafraîchissement du dossier).
   *
   * Effet : statut → ``analyzing`` (l'UI raccroche la carte de progression),
   * ``error_message`` purgé, ``user_context`` remplacé par celui de la relance
   * (miroir exact de ce que ``create()`` aurait persisté). Le ``siren`` n'est
   * écrit QUE s'il est fourni — on n'écrase jamais un SIREN connu par ``null``
   * (même règle que ``applyResearch``).
   *
   * GA-96 — et il n'écrase jamais non plus un SIREN connu par un AUTRE. La
   * relance ne RE-IDENTIFIE pas : elle rafraîchit un dossier dont l'identité est
   * déjà acquise. `AnalysisService.start` refuse déjà une relance qui demande
   * une autre société, avant même le débit ; la condition SQL ci-dessous est la
   * seconde serrure, celle qui tient même si un appelant futur oublie la
   * première. Écrire l'identité seulement `WHERE siren IS NULL` rend le
   * remplacement STRUCTURELLEMENT impossible, plutôt que simplement interdit —
   * et « retirer le moyen, pas seulement la permission » est ce qui distingue
   * une garantie d'une convention.
   *
   * Scopé par ``id`` seul : l'appartenance au workspace du caller a DÉJÀ été
   * vérifiée par le lookup workspace-scopé qui a fourni cet ``id`` (le compte
   * peut appartenir — created-by — à un coéquipier du même workspace, cas légitime
   * de la dédup canonique d'équipe). ``userId`` est journalisé pour l'audit.
   */
  async reuseForRelaunch(
    id: string,
    userId: string,
    patch: { userContext: string | null; siren?: string; discoverOriginCriteria?: DiscoverOriginCriteria },
  ): Promise<void> {
    await this.accounts.update({ id }, { status: 'analyzing', error_message: null, user_context: patch.userContext })
    // #4642 — le cadrage d'une conversation avec Laura (jsonb existant : aucune migration, aucune ligne retirée).
    if (patch.discoverOriginCriteria) {
      await this.accounts.update({ id }, { discover_origin_criteria: patch.discoverOriginCriteria })
    }
    // L'identité se POSE, elle ne se REMPLACE pas (GA-96). `WHERE siren IS NULL`
    // porte toute la règle : sur un dossier qui connaît déjà sa société, cette
    // écriture ne touche aucune ligne — silencieusement, et c'est voulu, car le
    // seul appelant légitime lui passe déjà l'identité du dossier lui-même.
    if (patch.siren) {
      await this.accounts.update({ id, siren: IsNull() }, { siren: patch.siren })
    }
    this.logger.log('Account recycled in place for relaunch (no duplicate row)', { accountId: id, userId })
  }

  /** Whole days elapsed since the analysis last completed (``refreshed_at`` ≡
   *  ``updated_at``). Returns ``null`` when no timestamp is available. Surfaced
   *  on the account detail payload so the UI can flag stale dossiers. */
  computeAgeDays(refreshedAt: Date | string | null | undefined): number | null {
    if (!refreshedAt) return null
    const ts = refreshedAt instanceof Date ? refreshedAt.getTime() : Date.parse(refreshedAt)
    if (Number.isNaN(ts)) return null
    return Math.floor((Date.now() - ts) / ONE_DAY_MS)
  }

  /**
   * LUDB.7 bis — le domaine d'offre de l'espace de `userId` (`esn_it`, `industrial_engineering`…), ou
   * `undefined` quand on ne sait pas : un profil illisible ne bloque jamais la liste, qui garde alors
   * le choix d'avant.
   */
  private async offerDomainOf(userId: string | undefined): Promise<string | undefined> {
    if (!userId) return undefined
    try {
      return (await this.esnProfile.resolveProfileData(userId)).offerDomain || undefined
    } catch {
      return undefined
    }
  }

  /**
   * Real « last analysed » timestamp per account = ``MAX(analysis_runs.completed_at)``
   * over its **completed** runs.
   *
   * This is the honest answer the list + detail used to lack. They showed
   * ``accounts.created_at`` — the moment the account row was first created —
   * under a « Dernière analyse » label, so a dossier re-analysed today still
   * read « il y a 5 jours » and invited a credit-costing re-run. The account's
   * ``updated_at`` is no better: it is bumped by ANY write (a note, a commercial
   * status), so it drifts to « last touched ».
   *
   * ``analysis_runs`` is the record of what actually happened. Two guards keep
   * this from ever inventing a date:
   *  - ``completed_at IS NOT NULL`` — a run still in flight has no completion
   *    time and MUST NOT count as the last analysis.
   *  - ``status = 'completed'`` — an errored/canceled run did not analyse anything.
   *
   * Returns a map with an entry ONLY for accounts that have such a run. An
   * account absent from the map has no known analysis date — the caller decides
   * how to present that (a legacy ``completed`` account can fall back to
   * ``created_at``; anything else shows nothing). This method never falls back to
   * ``created_at`` itself: conflating creation with analysis at the data layer is
   * the exact bug being removed.
   */
  /**
   * Nom d'affichage des porteurs de comptes d'une page de liste.
   *
   * Batché : une requête pour toute la page, jamais une par ligne. Un id sans
   * profil lisible (membre supprimé) est simplement absent de la Map — l'écran
   * n'affiche alors pas de badge, plutôt qu'un uuid ou un « inconnu ».
   *
   * Délègue à `account-owner.util.ts` (#3257.7a) : le board d'effort
   * (`SprintsController`) pose la MÊME étiquette sans pouvoir importer ce
   * service (cycle de modules via `ContactsModule` + GA-07) — la dérivation
   * vit donc dans une fonction partagée, cette méthode n'en est qu'un appelant.
   */
  private async resolveOwnerNames(ids: (string | null)[]): Promise<Map<string, AccountOwner>> {
    return resolveOwnerNamesShared(this.accounts, ids)
  }

  /**
   * #2128.1 — LE PORTEUR D'UN SEUL COMPTE, pour le dossier.
   *
   * La porte publique de {@link resolveOwnerNames}, et elle se contente de
   * l'appeler : « prénom + nom, à défaut l'email » est une DÉRIVATION, et une
   * dérivation vit à un seul endroit (GA-26). La réécrire ici pour un id unique
   * aurait produit deux libellés pour la même personne le jour où l'une des deux
   * copies aurait changé — exactement le défaut que le dossier et la liste
   * doivent éviter, puisqu'ils nomment le MÊME collègue.
   *
   * `null` a un sens précis et un seul : **la lecture a eu lieu, personne ne
   * porte ce compte** (ou le profil du porteur n'est plus lisible — membre
   * parti). Ce n'est pas « on ne sait pas » : l'écran le DIT plutôt que de
   * laisser une ligne vide (GA-18/GA-19).
   */
  async resolveOwner(assignedTo: string | null): Promise<AccountOwner | null> {
    if (!assignedTo) return null
    const owners = await this.resolveOwnerNames([assignedTo])
    return owners.get(assignedTo) ?? null
  }

  /**
   * #2128.19 — UN COLLÈGUE a-t-il DÉJÀ une analyse `analyzing` en cours sur ce
   * compte ? Deux commerciaux du même espace peuvent relancer la MÊME
   * entreprise sans le savoir — l'un paie un run que l'autre a déjà lancé.
   *
   * Bornée à `workspace_id` (jamais inter-espaces, GA-43) et à `user_id <> $3`
   * : une analyse qu'on a SOI-MÊME lancée n'est pas un chevauchement, c'est le
   * cours normal des choses (l'écran de progression le montre déjà ailleurs).
   * `ORDER BY started_at DESC LIMIT 1` rend le run le plus RÉCENT — jamais un
   * classement de collègues par volume (§24 Red Team).
   *
   * Best-effort : une lecture qui échoue rend `null`, jamais une exception —
   * le chevauchement est un CONFORT d'affichage, son absence ne doit jamais
   * priver le commercial de son dossier.
   */
  async resolveActiveAnalysisByColleague(
    accountId: string,
    workspaceId: string,
    userId: string,
  ): Promise<AccountActiveAnalysis | null> {
    try {
      const rows = await this.accounts.query<
        { userId: string; startedAt: Date; firstName: string | null; lastName: string | null; email: string | null }[]
      >(
        `SELECT r.user_id AS "userId", r.created_at AS "startedAt",
                p.first_name AS "firstName", p.last_name AS "lastName", p.email AS "email"
         FROM analysis_runs r
         LEFT JOIN profiles p ON p.user_id = r.user_id
         WHERE r.account_id = $1
           AND r.workspace_id = $2
           AND r.user_id <> $3
           AND r.status = 'analyzing'
         ORDER BY r.created_at DESC
         LIMIT 1`,
        [accountId, workspaceId, userId],
      )
      const row = rows[0]
      if (!row) return null
      const name = ownerDisplayName(row.firstName, row.lastName, row.email) ?? ''
      if (!name) return null
      return {
        colleague: { user_id: row.userId, name },
        started_at: new Date(row.startedAt).toISOString(),
      }
    } catch (err) {
      this.logger.error('resolveActiveAnalysisByColleague error', { error: err })
      return null
    }
  }

  async resolveLastAnalyzedByAccount(accountIds: string[]): Promise<ReadonlyMap<string, string>> {
    if (accountIds.length === 0) return new Map()
    try {
      const rows = await this.accounts.manager.query<Array<{ account_id: string; last_analyzed_at: Date | string }>>(
        `SELECT account_id, MAX(completed_at) AS last_analyzed_at
           FROM analysis_runs
          WHERE account_id = ANY($1) AND completed_at IS NOT NULL AND status = 'completed'
          GROUP BY account_id`,
        [accountIds],
      )
      const out = new Map<string, string>()
      for (const r of rows) {
        const ts = r.last_analyzed_at instanceof Date ? r.last_analyzed_at.getTime() : Date.parse(r.last_analyzed_at)
        if (!Number.isNaN(ts)) out.set(r.account_id, new Date(ts).toISOString())
      }
      return out
    } catch (error) {
      // Best-effort: a lookup failure omits the date (caller shows the fallback
      // or nothing), never a fabricated one.
      this.logger.warn('Could not resolve last-analyzed dates — omitting rather than guessing', {
        error: error instanceof Error ? error.message : String(error),
      })
      return new Map()
    }
  }

  /**
   * Refonte Théo (comptes-liste) — LES PERSONNES de chaque compte de la page, en UNE requête.
   *
   * Décideur = rôle décisionnel technique ou économique (la taxonomie MEDDIC du produit). Les deux visages
   * montrés sont les mieux placés : décideurs d'abord, puis la priorité du contact. Un compte sans contact
   * n'a pas d'entrée — l'écran n'écrit alors rien, jamais « 0 personne ». Un échec de lecture vaut une
   * carte vide : la colonne se tait plutôt que d'inventer.
   */
  async resolvePeopleByAccount(accountIds: string[]): Promise<ReadonlyMap<string, AccountPeople>> {
    const out = new Map<string, AccountPeople>()
    if (accountIds.length === 0) return out
    try {
      // GA-405 — même lecture que l'absorption (`contactsOfAccounts`), triée ici : pas un SQL brut de plus.
      const isDecider = (role: string | null): boolean => role === 'technical' || role === 'economic'
      const rows = [...(await this.contactsOfAccounts(accountIds))].sort(
        (a, b) =>
          Number(isDecider(b.decision_role ?? null)) - Number(isDecider(a.decision_role ?? null)) ||
          (a.priority ?? Number.POSITIVE_INFINITY) - (b.priority ?? Number.POSITIVE_INFINITY) ||
          (a.full_name ?? '').localeCompare(b.full_name ?? ''),
      )
      for (const r of rows) {
        const decider = isDecider(r.decision_role ?? null)
        const cur = out.get(r.account_id) ?? { count: 0, has_decider: false, top: [] }
        cur.count += 1
        if (decider) cur.has_decider = true
        if (cur.top.length < 2) cur.top.push({ name: r.full_name ?? '', is_decider: decider })
        out.set(r.account_id, cur)
      }
      return out
    } catch (error) {
      this.logger.warn('Could not resolve account people — omitting rather than guessing', {
        error: error instanceof Error ? error.message : String(error),
      })
      return new Map()
    }
  }

  /**
   * Les contacts d'un lot de comptes — UNE seule lecture brute de `contacts` pour l'absorption de doublon
   * et la colonne « Personnes » de la liste (GA-405 : un site de lecture de plus = un site à corriger le
   * jour où la portée du contact arrive).
   */
  private async contactsOfAccounts(accountIds: readonly string[]): Promise<
    ReadonlyArray<{
      id: string
      account_id: string
      full_name: string | null
      decision_role?: string | null
      priority?: number | null
    }>
  > {
    const rows = await this.accounts.manager.query(
      `SELECT id, account_id, full_name, decision_role, priority FROM contacts WHERE account_id = ANY($1::uuid[])`,
      [accountIds],
    )
    return returnedRows<{
      id: string
      account_id: string
      full_name: string | null
      decision_role?: string | null
      priority?: number | null
    }>(rows)
  }

  /** #4267.1 — un suivi EXPLICITE actif existe-t-il sur ce compte (la veille quotidienne le relit-elle) ? */
  async isFollowed(accountId: string): Promise<boolean> {
    const rows: Array<{ followed: boolean }> = await this.accounts.query(
      `SELECT ${activeFollowExists('account')} AS followed FROM accounts account WHERE account.id = $1`,
      [accountId],
    )
    return rows[0]?.followed === true
  }

  /** Single-account convenience over {@link resolveLastAnalyzedByAccount}. */
  async resolveLastAnalyzedAt(accountId: string): Promise<string | null> {
    return (await this.resolveLastAnalyzedByAccount([accountId])).get(accountId) ?? null
  }
}
