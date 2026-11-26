import {
  BadRequestException,
  ConflictException,
  Body,
  Controller,
  Get,
  HttpException,
  Logger,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { createZodDto, ZodValidationPipe } from 'nestjs-zod'
import { z } from 'zod'
import {
  can,
  createMissionRequestSchema,
  financeScopeKindSchema,
  missionBoardFiltersSchema,
  moveBoardCardSchema,
  setMissionRiskResolutionRequestSchema,
  setRenewalStatusRequestSchema,
  setRenewalWindowsRequestSchema,
  setRenewalClientRailRequestSchema,
  setRenewalConsultantRailRequestSchema,
  splitBoardActions,
  submitTimesheetRequestSchema,
  updateMissionRequestSchema,
  createMissionFeedbackSchema,
  PROPAGATION_FILTER_KEYS,
  type BoardMoveOutcome,
  type CreateMissionFeedbackInput,
  type CreateMissionRequest,
  type SetMissionRiskResolutionRequest,
  type SetRenewalClientRailRequest,
  type SetRenewalConsultantRailRequest,
  type SetRenewalStatusRequest,
  type SetRenewalWindowsRequest,
  type SubmitTimesheetRequest,
  type UpdateMissionRequest,
} from '@bellum/contracts'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { AccountGateService } from '../account-gate/account-gate.service'
import { AgendaService } from '../agenda/agenda.service'
import { AccountMissionsService } from './account-missions.service'
import { MissionDriftService } from './mission-drift.service'
import { MissionFeedbackService } from './mission-feedback.service'
import { MissionCrmReprisalService } from './mission-crm-reprisal.service'
import { MissionOdooSalesService } from './mission-odoo-sales.service'
import {
  DeliveryService,
  type ClientStacksResolver,
  type MissionListFilters,
  type MissionListScope,
} from './delivery.service'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { MissionBoardService } from './mission-board.service'
import { PropagationService } from './propagation.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/** #2561/#2562 — les ventes Odoo choisies (identifiants Odoo, entiers). */
const odooSalesSelectionSchema = z.object({
  saleIds: z.array(z.number().int().positive()).min(1).max(100),
})
/** … et l'empreinte de la prévisualisation qu'on a VUE. */
const odooSalesImportSchema = odooSalesSelectionSchema.extend({
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
})

/**
 * Delivery OS côté HTTP (addendum final p71-72).
 *
 * `renewals` est déclarée avant les routes dynamiques et c'est la porte d'entrée
 * réelle du module : la liste complète sert à consulter, celle-là sert à AGIR.
 *
 * Aucune route d'émission de facture, délibérément — voir la note du service.
 */
export class MoveBoardCardDto extends createZodDto(moveBoardCardSchema) {}

/** Les filtres arrivent en query : `?withoutEndDate=true`. Une valeur absente
 *  ne filtre rien, une valeur abîmée non plus. */
function readFilters(query: Record<string, string | undefined>): Record<string, unknown> {
  const filters: Record<string, unknown> = {}
  for (const key of ['accountId', 'consultantId', 'ownerId', 'endsBefore', 'source'] as const) {
    if (query[key]) filters[key] = query[key]
  }
  for (const key of ['withoutEndDate', 'lateTimesheet', 'notInvoiceable'] as const) {
    if (query[key] === 'true') filters[key] = true
  }
  return filters
}

/**
 * Les filtres qu'un LIEN DE SOURCE a le droit de porter sur la LISTE (§4.4).
 *
 * ⚠️ `readFilters` juste au-dessus n'a qu'un appelant : `@Get('board')`. La
 * route que `/missions?accountId=…` ouvre réellement est celle-ci, et elle ne
 * prenait AUCUN paramètre de requête — le lien du bandeau « ce client vous a
 * rapporté X € » rendait donc la liste ENTIÈRE des missions de l'espace.
 *
 * Deux choses tiennent la lecture à UN seul endroit : les clés viennent de
 * `PROPAGATION_FILTER_KEYS` (le contrat décide de ce qu'un lien peut porter), et
 * leur forme vient de `missionBoardFiltersSchema` (la même règle d'identifiant
 * que le board). Une liste recopiée ici dériverait du jour où une troisième clé
 * arrive.
 *
 * Chaque clé est parsée SÉPARÉMENT : un `accountId` abîmé ne doit pas emporter
 * un `consultantId` valide. Et une clé illisible ne filtre rien plutôt que de
 * refuser — un lien collé de travers doit montrer quelque chose ; c'est
 * l'écran, lui, qui n'annonce alors aucun périmètre.
 */
/**
 * `?id=` — UNE mission par son identité, ce que lit son DOSSIER (D200).
 *
 * ⚠️ Elle est lue À CÔTÉ de `PROPAGATION_FILTER_KEYS` et non dedans : cette
 * liste est FIGÉE à deux entrées par `propagation-source-link.spec.ts`, et elle
 * dit ce qu'un lien de SOURCE a le droit de resserrer — un objet PORTEUR (un
 * compte, un consultant), jamais la ligne elle-même. Les y mélanger casserait
 * une garde qui protège une autre règle.
 *
 * La FORME vient du contrat plutôt que d'être réécrite ici : un identifiant de
 * mission obéit à la même règle que celui d'un compte, et une seconde
 * définition dériverait le jour où l'une des deux change.
 */
const missionIdSchema = missionBoardFiltersSchema.shape.accountId

/**
 * `?businessUnitId=` — même forme qu'un identifiant de compte (les deux sont
 * des UUID de l'espace), lue À CÔTÉ de `PROPAGATION_FILTER_KEYS` pour la MÊME
 * raison que `?id=` juste au-dessus : une BU n'est pas un objet qu'un lien de
 * SOURCE a le droit de porter (§4.4), c'est un resserrement de l'écran.
 */
const businessUnitIdSchema = missionBoardFiltersSchema.shape.accountId

/**
 * `?skill=` — une compétence CANONIQUE (`consultant_skills.skill`), même
 * validation que `talent.ts` (`skills: z.array(z.string().trim().min(1).max(120))`)
 * ramenée à UN seul filtre scalaire : Planning ne propose qu'un choix à la
 * fois, comme `?consultantId=`.
 */
const missionSkillSchema = z.string().trim().min(1).max(120).optional()

function readPropagationFilters(query: Record<string, string | undefined>): MissionListFilters {
  const filters: MissionListFilters = {}
  for (const key of PROPAGATION_FILTER_KEYS) {
    const parsed = missionBoardFiltersSchema.shape[key].safeParse(query[key] || undefined)
    if (parsed.success && parsed.data) filters[key] = parsed.data
  }
  /**
   * Illisible ⇒ AUCUN filtre, comme les deux autres : la route rend alors la
   * liste entière plutôt que de refuser, et un lien collé de travers montre
   * quelque chose. ⚠️ C'est le DOSSIER qui doit alors dire « introuvable » :
   * il RETROUVE sa mission par son identité dans la réponse et ne prend jamais
   * la première ligne venue — sinon un identifiant abîmé afficherait la
   * mission d'un autre sous le titre de celle qu'on cherchait.
   */
  const id = missionIdSchema.safeParse(query['id'] || undefined)
  if (id.success && id.data) filters.id = id.data
  // #2194.22 / #2194.26 — même parti pris qu'`id` : illisible ⇒ pas de filtre,
  // jamais un refus de toute la route pour un paramètre secondaire abîmé.
  const businessUnitId = businessUnitIdSchema.safeParse(query['businessUnitId'] || undefined)
  if (businessUnitId.success && businessUnitId.data) filters.businessUnitId = businessUnitId.data
  const skill = missionSkillSchema.safeParse(query['skill'] || undefined)
  if (skill.success && skill.data) filters.skill = skill.data
  return filters
}

/**
 * Le périmètre que l'appelant DEMANDE sur la liste (`?scope=own|workspace`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE PORTÉE, ET PAS UNE TROISIÈME CLÉ DE FILTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le cockpit affiche « **Mes** missions en cours » et appelait cette route SANS
 * aucun paramètre : il rendait les missions de l'ESPACE. Sur une ESN à cinq
 * commerciaux, les cinq voyaient la même liste sous cinq « mes ».
 *
 * La route ne devient pas personnelle pour autant — l'écran `/missions` liste
 * l'espace, c'est son objet, et le pont du copilote aussi. C'est donc l'APPELANT
 * qui dit ce qu'il demande, exactement comme `?accountId=` (§4.4).
 *
 * ⚠️ Mais PAS via `PROPAGATION_FILTER_KEYS` : un filtre est ce qu'un lien collé
 * a le droit de porter, et « le portefeuille d'un tel » n'est pas un lien de
 * source. La portée n'a d'ailleurs pas d'identifiant à porter — `own` veut dire
 * « celui qui appelle », et rien d'autre n'est demandable.
 *
 * La forme vient de `financeScopeKindSchema` : les deux portées du dépôt sont
 * nommées une seule fois. Une valeur illisible rend « l'espace » plutôt que de
 * refuser, et c'est la réponse — qui porte `scope.kind` — qui empêche l'écran de
 * mentir sur ce qu'il a reçu.
 *
 * ⚠️ Aucun droit à vérifier : `own` est strictement plus ÉTROIT que ce que
 * l'appelant obtenait déjà sans paramètre.
 */
function readListScope(query: Record<string, string | undefined>, userId: string): MissionListScope {
  const parsed = financeScopeKindSchema.safeParse(query['scope'])
  return parsed.success && parsed.data === 'own' ? { kind: 'own', userId } : { kind: 'workspace' }
}

@Controller('delivery')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class DeliveryController {
  private readonly logger = new Logger(DeliveryController.name)

  constructor(
    private readonly delivery: DeliveryService,
    private readonly board: MissionBoardService,
    private readonly propagation: PropagationService,
    /** Les cinq blocs de l'onglet Missions d'un dossier de compte (BEL-BO-006). */
    private readonly accountMissionsService: AccountMissionsService,
    /** Le détecteur de dérive (PDF 5 §7.2) — cinq signaux, deux minimum. */
    private readonly drift: MissionDriftService,
    /** #2562 — la proposition de reprise depuis le CRM connecté. */
    private readonly crmReprisal: MissionCrmReprisalService,
    /** #2412 — le double pouls de satisfaction (client/consultant). */
    private readonly missionFeedback: MissionFeedbackService,
    private readonly workspaceContext: WorkspaceContextService,
    // Les deux gestes que le serveur exécute au déplacement d'une carte.
    // `@Optional()` : les retirer doit dégrader l'action, jamais empêcher de
    // bouger une carte.
    @Optional() private readonly accountGate?: AccountGateService,
    @Optional() private readonly agenda?: AgendaService,
    /** #2414.43 — la mémoire marché du client, lue ICI (le contrôleur est la couche qui croise
     *  les domaines, §3.2) et passée au service sous forme de fonction. Optionnelle : sans
     *  elle, le signal reste NON MESURÉ. */
    @Optional() private readonly marketMemory?: MarketMemoryService,
    /** #2561/#2562 — les ventes de l'outil de gestion branché (Odoo) et leur
     *  reprise en missions. Toujours fourni par le module ; `@Optional()` pour
     *  que les constructions positionnelles des tests restent valides. */
    @Optional() private readonly odooSales?: MissionOdooSalesService,
  ) {}

  private requireOdooSales(): MissionOdooSalesService {
    if (!this.odooSales) throw new HttpException('Lecture des ventes indisponible.', 503)
    return this.odooSales
  }

  /** #2414.43 — les technos que la mémoire marché observe chez chaque compte (`null` = non couvert). */
  private readonly clientStacks: ClientStacksResolver = async accounts => {
    const result = new Map<string, readonly string[] | null>()
    if (!this.marketMemory || accounts.length === 0) return result
    const read = await this.marketMemory.observedStacksFor(
      accounts.map(account => ({ ref: account.id, name: account.name, website: account.website })),
    )
    if (read.status !== 'ok') return result
    for (const account of accounts) result.set(account.id, read.stacks.get(account.id) ?? null)
    return result
  }

  /**
   * Le board à douze colonnes — une VUE au-dessus des Projets et des Missions.
   *
   * La vue ne possède AUCUN état : chaque carte porte celui de son objet
   * d'origine (une étape de projet, un statut de mission). On peut y déplacer
   * une carte — l'écriture retombe alors sur cet objet, jamais sur une
   * troisième série d'états qui divergerait des deux autres.
   */
  @Get('board')
  async missionBoard(@CurrentUser() user: CurrentUserPayload, @Query() query: Record<string, string | undefined>) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const filters = missionBoardFiltersSchema.safeParse(readFilters(query))
    return this.board.board(workspaceId, {
      canReadFinance: can(role, [], 'finance:read'),
      // Un filtre mal formé ouvre le board ENTIER plutôt que de refuser : un
      // lien collé avec un paramètre abîmé doit montrer quelque chose.
      filters: filters.success ? filters.data : {},
    })
  }

  /**
   * Déplacer une carte du board (§3).
   *
   * Le board reste une PROJECTION : ce geste n'écrit jamais « la carte est en
   * colonne 9 », il écrit sur l'objet d'origine. C'est ce qui préserve la
   * décision D2 tout en rendant le board utilisable.
   *
   * Le motif est REFUSÉ vide vers « Perdue » — c'est le seul moment où on
   * l'obtient, et une perte sans raison n'apprend rien à personne.
   */
  @Post('missions/:id/move')
  @RequirePermission('records:write')
  async moveCard(@Param('id') id: string, @Body() body: MoveBoardCardDto, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const outcome = await this.delivery.moveBoardCard(workspaceId, user.userId, id, body)
    if (outcome === 'not_found') throw new NotFoundException('Cette carte est introuvable dans cet espace')
    if (outcome === 'reason_required') {
      throw new BadRequestException('Une perte se déclare avec son motif — c’est le seul moment où on l’obtient.')
    }
    // #2407.5 — la table STRICTE des transitions (decisions §9).
    if (outcome === 'transition_refused') {
      throw new ConflictException(
        'Ce déplacement saute une étape ou échange deux fins : la table des transitions de statut le refuse.',
      )
    }
    if (outcome === 'backward_reason_required') {
      throw new BadRequestException('Un retour arrière de statut se déclare avec son motif — il est journalisé.')
    }
    const actions = await this.applyBoardActions(workspaceId, user.userId, outcome.mission, outcome.acceptedActions, {
      reason: body.reason ?? null,
    })
    return { status: outcome.status, movedAt: outcome.movedAt, actions }
  }

  /**
   * Exécute ce que l'utilisateur a coché, et REND le reste.
   *
   * Le défaut corrigé le 26/08/2026 : `acceptedActions` était renvoyé tel quel
   * et n'était lu par personne. Vingt cases qu'on cochait et qui ne faisaient
   * rien — le même défaut que le pipe des Projets avait corrigé un mois plus
   * tôt, et que ce board n'avait jamais corrigé.
   *
   * On n'exécute que ce que le produit sait faire sans rien inventer. Un REX
   * exige un résumé écrit par un humain ; le fabriquer produirait la phrase que
   * ce dépôt s'interdit. Tout le reste ressort en RAPPEL — un rappel affiché
   * est honnête, une case qui ne fait rien ne l'est pas.
   *
   * Le déplacement est DÉJÀ écrit quand on arrive ici : une action qui échoue ne
   * le défait pas, elle se dit.
   */
  private async applyBoardActions(
    workspaceId: string,
    userId: string,
    mission: { id: string; account_id: string; label: string; started_on: string | null },
    accepted: readonly string[],
    context: { reason: string | null },
  ): Promise<BoardMoveOutcome> {
    const { server, pending } = splitBoardActions(accepted)
    const performed: string[] = []
    const failed: Array<{ key: string; reason: string }> = []

    for (const key of server) {
      try {
        if (key === 'park_account') {
          if (!this.accountGate) {
            failed.push({ key, reason: 'unavailable' })
            continue
          }
          // Le motif de la perte devient le motif de l'écartement : c'est la
          // seule raison qu'on ait, et en redemander une ici la ferait remplir
          // n'importe comment.
          await this.accountGate.decide(workspaceId, mission.account_id, 'parked', context.reason)
          performed.push(key)
        } else if (key === 'plan_j30_review') {
          if (!this.agenda) {
            failed.push({ key, reason: 'unavailable' })
            continue
          }
          const startsAt = thirtyDaysAfterStart(mission.started_on)
          if (!startsAt) {
            // Sans date de démarrage, « J+30 » ne désigne rien. Poser le point
            // à trente jours d'aujourd'hui inventerait une échéance, et
            // quelqu'un s'y fierait.
            failed.push({ key, reason: 'no_start_date' })
            continue
          }
          await this.agenda.createEvent(userId, {
            summary: 'Point à J+30',
            accountName: mission.label,
            startsAt: startsAt.toISOString(),
            endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000).toISOString(),
            attendees: [],
            addConferencing: true,
            reminderMinutes: 60,
            inviteSelf: false,
            timeZone: 'Europe/Paris',
          })
          performed.push(key)
        }
      } catch (error) {
        this.logger.error('action de déplacement de carte en échec', {
          error,
          tags: { action: key, mission: mission.id },
        })
        failed.push({ key, reason: error instanceof HttpException ? error.message : 'failed' })
      }
    }
    return { performed, pending, failed }
  }

  /**
   * Les missions de l'espace — ou celles du lecteur, s'il les demande
   * (`?scope=own`, cf. `readListScope`). Le défaut reste l'espace : c'est ce que
   * l'écran `/missions` et le pont du copilote lisaient déjà, et un défaut
   * restreint aurait changé leur réponse sans que personne ne l'ait décidé.
   *
   * ⚠️ La réponse porte `scope` À CÔTÉ de `canReadFinance`, et les deux ne se
   * remplacent pas : « je n'ai pas le droit de voir la marge » et « rien ne m'est
   * rattaché » appellent des gestes opposés — demander un accès, ou réclamer son
   * portefeuille. C'est la même distinction que `marginForbidden` /
   * `marginNotMeasured`, un cran plus haut.
   *
   * ⚠️ La marge n'en sort que pour qui a `finance:read` — sinon elle vaut
   * `null`, PRÉSENTE et vide (D45, 28/08/2026), jamais retirée et jamais mise à
   * zéro. Cette route servait `marginPercent` à tout membre, y compris un
   * `viewer` ou un `recruiter`, pendant que le board et le vivier la gardaient
   * scrupuleusement. Elle n'a pas de `@RequirePermission` parce que la LISTE,
   * elle, est légitime pour tout le monde : c'est le champ financier qui se
   * garde, pas la lecture.
   *
   * ⚠️ La réponse porte aussi `canReadFinance` : depuis que le champ vaut
   * `null` dans les deux cas, c'est le seul moyen pour l'écran de dire « pas
   * ton périmètre » plutôt que « coût chargé non renseigné ».
   *
   * `extraPermissionsOf` et non `can(role, [], …)` : les permissions accordées
   * membre par membre comptent, sinon la moitié du RBAC est ignorée.
   */
  @Get('missions')
  async list(@CurrentUser() user: CurrentUserPayload, @Query() query: Record<string, string | undefined>) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, user.userId)
    // ⚠️ Le filtre est SERVEUR, et il doit l'être : cette liste est PLAFONNÉE à
    // 200 lignes sans pagination. La filtrer dans le navigateur trierait ces
    // 200-là et rendrait « 3 missions » là où le compte en a douze — un
    // sous-ensemble faux sous un lien qui promet la source.
    return this.delivery.list(user.userId, {
      canReadFinance: can(role, extra, 'finance:read'),
      filters: readPropagationFilters(query),
      scope: readListScope(query, user.userId),
      clientStacks: this.clientStacks,
    })
  }

  /**
   * #2562 — y a-t-il une reprise à PROPOSER ? Route à part de `missions`
   * (2 segments : `missions/crm-reprisal-candidates`, jamais capturée par une
   * route `missions/:id/...` qui en compte 3 — même garde-fou que
   * `mission-drift` juste en dessous).
   *
   * Ouverte à tout membre, comme `missions` juste au-dessus : c'est une simple
   * proposition à VOIR, rien n'y est encore écrit.
   */
  // #2562 — la lecture est CLOISONNÉE à l'espace actif, comme sa voisine
  // `@Get('missions')` : c'est une proposition à VOIR, rien n'y est écrit.
  // Le dire avec `@WorkspaceRead()` plutôt que de laisser la route nue —
  // GA-05 compte à la maille ROUTE, et une route nue de plus desserre la
  // garde pour tout le monde.
  @WorkspaceRead()
  @Get('missions/crm-reprisal-candidates')
  async crmReprisalCandidates(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.crmReprisal.candidates(workspaceId)
  }

  /**
   * #2561/#2562 — les VENTES de l'outil de gestion branché (Odoo), lues en
   * direct et en lecture seule, chacune marquée « déjà une mission » ou « à
   * reprendre ». Route à UN segment (`odoo-sales`), jamais capturée par
   * `missions/:id/...`. Ouverte à tout membre, comme `missions` : rien n'y
   * est écrit. Le mode démo se tranche ICI (GA-07), le service ne reçoit
   * qu'un espace et un booléen.
   */
  @WorkspaceRead()
  @Get('odoo-sales')
  async odooSalesList(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const isDemo = await this.workspaceContext.isDemoWorkspace(user.userId)
    return this.requireOdooSales().list(workspaceId, isDemo)
  }

  /** #2562 — la PRÉVISUALISATION FIGÉE : exactement ce qui sera créé, et son
   *  empreinte. N'écrit rien, mais prépare une écriture : `records:write`. */
  @Post('odoo-sales/preview')
  @RequirePermission('records:write')
  async odooSalesPreview(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(odooSalesSelectionSchema)) body: z.infer<typeof odooSalesSelectionSchema>,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const isDemo = await this.workspaceContext.isDemoWorkspace(user.userId)
    return this.requireOdooSales().preview(workspaceId, isDemo, body.saleIds)
  }

  /**
   * #2562 — la REPRISE validée : le service relit l'outil, refuse (409) si la
   * prévisualisation a changé, puis chaque mission naît du geste ORDINAIRE
   * `this.delivery.create` — appelé ICI, dans une route HTTP (garde
   * `mission-creation-is-a-human-gesture`). Jamais d'écriture dans Odoo.
   */
  @Post('odoo-sales/import')
  @RequirePermission('records:write')
  async odooSalesImport(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(odooSalesImportSchema)) body: z.infer<typeof odooSalesImportSchema>,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const isDemo = await this.workspaceContext.isDemoWorkspace(user.userId)
    return this.requireOdooSales().importSales(workspaceId, isDemo, body.saleIds, body.fingerprint, (input, origin) =>
      this.delivery.create(user.userId, input, origin),
    )
  }

  /**
   * Les missions qui DÉRAPENT — PDF 5 §7.2.
   *
   * À ne pas confondre avec `renewals` juste en dessous : celui-là regarde la
   * FIN de la mission (J-60, J-30) ; celui-ci regarde sa DÉGRADATION. Une
   * mission qui se creuse depuis mars est toujours « active », sa fin est
   * lointaine, et elle n'apparaît donc dans aucune des alertes existantes.
   *
   * ⚠️ La route s'appelle `mission-drift` et NON `missions/drift`, et ce n'est
   * pas une préférence : `StaffingController` porte le préfixe
   * `delivery/missions/:id` et y déclare une route de collection nue.
   * `delivery/missions/drift` serait donc capturable par
   * `delivery/missions/:id` — Nest ordonne par
   * module et par déclaration, jamais par spécificité, et la route ne tiendrait
   * que par l'ordre du tableau `controllers`. Le défaut est déjà connu du
   * dépôt : un 500 en production, invisible en test.
   */
  @Get('mission-drift')
  @WorkspaceRead()
  async missionDrift(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.drift.forWorkspace(workspaceId)
  }

  /** Ce qui demande une action maintenant : J-60, J-30, imminent, en retard, ou
   *  sans date de fin — cette dernière ne serait jamais relancée à temps.
   *  #2195.50 — ET les échéances AU-DELÀ de soixante jours (`includeFar:
   *  true`) : l'écran de décision les groupe dans leur propre fenêtre, APRÈS
   *  « Sans date de fin », pour que cet ordre ait un « lointain » à précéder. */
  @Get('renewals')
  async renewals(@CurrentUser() user: CurrentUserPayload) {
    /**
     * #1365 — LE DROIT FINANCIER VOYAGE AUSSI SUR CETTE ROUTE.
     *
     * La lentille « Renouvellements » rendait des cartes portant la seule
     * échéance ; elle rend désormais le même tableau que « En cours », colonne
     * « Marge » comprise. Sans ce calcul, `renewalsToAct` gardait son
     * `canReadFinance: false` en dur et la colonne disait « pas ton périmètre »
     * à tout le monde — un droit refusé par une constante et non par un rôle,
     * exactement le défaut que D45 corrige un cran plus haut.
     *
     * Le calcul est le MÊME que celui de `list` juste au-dessus, `extra`
     * compris : les permissions accordées membre par membre comptent, sinon la
     * moitié du RBAC est ignorée.
     */
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, user.userId)
    return this.delivery.renewalsToAct(
      user.userId,
      undefined,
      undefined,
      can(role, extra, 'finance:read'),
      true,
      this.clientStacks,
    )
  }

  /**
   * ⚠️ `@WorkspaceRead` posé le 01/09/2026 : cette route n'était pas nue par
   * oubli, elle était nue par MASQUAGE. GA-05 découpe les routes d'un `@Get(`
   * au suivant en lisant le fichier ENTIER — le docblock de la route SUIVANTE
   * tombait donc dans le segment de celle-ci, et il citait `@WorkspaceRead`.
   * Une lecture d'agrégat d'espace était ainsi exemptée par la prose d'une
   * autre route. Même cas que les six lectures d'`accounts.controller.ts` (D39).
   */
  @Get('expansion')
  @WorkspaceRead()
  expansion(@CurrentUser() user: CurrentUserPayload) {
    return this.delivery.expansionMap(user.userId)
  }

  /**
   * CE QUE LE BANDEAU DU PORTEFEUILLE AFFICHE : missions actives, personnes en
   * poste, et de quoi savoir si le second chiffre est lisible (31/08/2026).
   *
   * `@WorkspaceRead()` et non `@RequirePermission` : trois dénombrements de
   * l'espace, aucune écriture, aucun montant — ni TJM, ni marge, ni coût. Le
   * dépôt n'a pas de `records:read`, et exiger `records:write` fermerait la
   * porte au `viewer`, qui voit déjà la liste des missions.
   *
   * Ce n'est PAS `GET /delivery/expansion` sous un autre nom : celle-là rend
   * une ligne PAR COMPTE, et sommer ses `expertsOnSite` compterait deux fois
   * une personne partagée entre deux clients. Le `DISTINCT` d'espace ne se
   * dérive pas d'un agrégat par compte, il se calcule.
   */
  @Get('staffing-headline')
  @WorkspaceRead()
  staffingHeadline(@CurrentUser() user: CurrentUserPayload) {
    return this.delivery.staffingHeadline(user.userId)
  }

  /**
   * Les agrégats de propagation qui ne portent AUCUN montant gardé (§4.3).
   *
   * Trois listes, groupées par compte, par contact et par consultant : le
   * « sur N missions » du bandeau, le tarif vendu moyen, le badge « a signé 2
   * missions », et « placé 4 fois ». Le CA cumulé et la marge moyenne ne sont
   * PAS ici — ils vivent sous droit financier (`GET /delivery/finance/propagation`).
   *
   * ⚠️ Une seule réponse pour tout l'espace, jamais une requête par fiche
   * ouverte : la colonne « montant du pipe par compte » du portefeuille lit la
   * MÊME réponse que le bandeau d'une fiche, et un appel par ligne rendrait la
   * liste inutilisable à trois cents comptes.
   *
   * `@WorkspaceRead` (D39) : c'est une lecture de l'espace, et `ROLE_PERMISSIONS`
   * ne porte aucune permission de lecture — exiger `records:write` ou
   * `data:export` fermerait la porte à `viewer` et `tech_admin` sur des chiffres
   * qu'ils ont le droit de voir.
   */
  @Get('propagation')
  @WorkspaceRead()
  async propagationDigest(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.propagation.digest(workspaceId)
  }

  /**
   * L'onglet Missions du dossier de compte — les cinq blocs (PDF 4 §3.3).
   *
   * Aucune route ne rendait les missions d'un COMPTE : le board, la liste, les
   * renouvellements et l'expansion se lisent tous à l'échelle de l'espace, et
   * `expansionMap` ne regarde que `active|onboarding` — donc jamais
   * l'historique, qui est la moitié de ce que cet onglet sert à montrer.
   *
   * Ici et non dans `accounts` : tout ce qu'elle rend se CALCULE sur les
   * missions, et §4.4 dit qu'un bloc propagé se corrige là où il se calcule. La
   * poser dans `accounts` aurait forcé à y recopier le droit financier et le
   * noyau de marge — c'est-à-dire à créer la seconde vérité que la règle existe
   * pour empêcher.
   *
   * ⚠️ `@WorkspaceRead` (D39) et AUCUNE permission, pour la raison écrite sur
   * `GET /delivery/missions` : « la LISTE est légitime pour tout le monde ;
   * c'est le champ financier qui se garde, pas la lecture ». La marge sort
   * `null` sans `finance:read` — présente et vide (D45) — et `canReadFinance`
   * voyage avec la réponse pour que l'écran dise « pas ton périmètre » plutôt
   * que « coût chargé non renseigné ». Exiger `records:write` ou `data:export`
   * fermerait la porte à `viewer` et `tech_admin` sur un dossier de compte
   * qu'ils lisent déjà entièrement.
   *
   * `extraPermissionsOf` et non `can(role, [], …)` : les permissions accordées
   * membre par membre comptent, sinon la moitié du RBAC est ignorée.
   */
  @Get('accounts/:accountId/missions')
  @WorkspaceRead()
  async accountMissions(@CurrentUser() user: CurrentUserPayload, @Param('accountId', ParseUUIDPipe) accountId: string) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, user.userId)
    return this.accountMissionsService.ofAccount(workspaceId, accountId, {
      canReadFinance: can(role, extra, 'finance:read'),
    })
  }

  /**
   * Créer une mission.
   *
   * ⚠️ Cette route n'avait AUCUNE permission déclarée : un siège `viewer`,
   * `tech_admin` ou `finance` pouvait créer une mission — c'est-à-dire l'objet
   * qui porte le chiffre d'affaires signé, la marge et la préparation de
   * facturation. Le siège Finance, dont le contrat dit en toutes lettres
   * « AUCUN droit d'écriture sur les fiches », y écrivait.
   *
   * `records:write`, comme la route sœur `missions/:id/move` : ce sont les
   * mêmes gens qui déplacent une mission et qui la créent.
   */
  @Post('missions')
  @RequirePermission('records:write')
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(createMissionRequestSchema)) body: CreateMissionRequest,
  ) {
    return this.delivery.create(user.userId, body)
  }

  /**
   * RÉPARER une fiche : contact de facturation, dates, TJM vendu.
   *
   * `records:write`, comme la création et le déplacement — ce sont les mêmes
   * gens qui créent une mission et qui complètent sa fiche. Le TJM VENDU n'est
   * pas gardé par `finance:read` : c'est un prix de vente, lisible et saisi par
   * tout l'espace, là où le coût CHARGÉ reste dans les conditions commerciales.
   */
  @Patch('missions/:id')
  @RequirePermission('records:write')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMissionRequestSchema)) body: UpdateMissionRequest,
  ) {
    return this.delivery.updateMission(user.userId, id, body)
  }

  /**
   * #2195.22 à .29 — OÙ EN EST LA RECONDUCTION, posé à la main.
   *
   * `records:write`, comme la fiche : c'est le même geste commercial, sur la
   * même ligne, par les mêmes gens. Une permission neuve aurait créé un droit
   * que personne n'attribue, et le bouton aurait été gris pour tout l'espace.
   *
   * ⚠️ Route À PART de `PATCH missions/:id`, qui répare une FICHE. Celle-ci
   * enregistre une DÉCISION : elle horodate et attribue, l'autre non.
   */
  /**
   * #2195.8 — CE QUE L'ESPACE A RÉGLÉ COMME FENÊTRES, ET SI C'EST LUI.
   *
   * `@WorkspaceRead()` : c'est un réglage d'espace, pas une donnée de personne
   * ni un chiffre financier. Tout membre qui ouvre la lentille des
   * renouvellements en a besoin — l'écran écrit « Sous 20 jours » à partir de
   * ce nombre, et sans lui il devrait deviner.
   */
  @Get('renewal-windows')
  @WorkspaceRead()
  renewalWindows(@CurrentUser() user: CurrentUserPayload) {
    return this.delivery.renewalWindows(user.userId)
  }

  /**
   * Régler les fenêtres. `{ days: null }` REND l'échelle du produit.
   *
   * `records:write`, comme le statut de renouvellement juste en dessous, et pour
   * la même raison écrite là-bas : une permission NEUVE aurait créé un droit que
   * personne n'attribue, et le formulaire aurait été gris pour tout l'espace. Le
   * modèle est `PATCH finance/margin-threshold`, qui règle lui aussi un seuil
   * d'espace sous la permission d'ÉCRITURE de son domaine.
   *
   * Les trois garde-fous (plancher à quinze jours, bornes strictement
   * croissantes, « sans date de fin » irretirable) sont refusés par le contrat,
   * pas ici — une seconde règle écrite dans le contrôleur divergerait (GA-26).
   */
  @Patch('renewal-windows')
  @RequirePermission('records:write')
  setRenewalWindows(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(setRenewalWindowsRequestSchema)) body: SetRenewalWindowsRequest,
  ) {
    return this.delivery.setRenewalWindows(user.userId, body.days === null ? null : [...body.days])
  }

  @Patch('missions/:id/renewal-status')
  @RequirePermission('records:write')
  setRenewalStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setRenewalStatusRequestSchema)) body: SetRenewalStatusRequest,
  ) {
    return this.delivery.setRenewalStatus(user.userId, id, body)
  }

  /** #2413.49 à .52 — poser le rail CLIENT du dual track de renouvellement. */
  @Patch('missions/:id/renewal-rails/client')
  @RequirePermission('records:write')
  setRenewalClientRail(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setRenewalClientRailRequestSchema)) body: SetRenewalClientRailRequest,
  ) {
    return this.delivery.setRenewalClientRail(user.userId, id, body)
  }

  /** #2413.53 à .56 — poser le rail CONSULTANT, symétrique du rail client. */
  @Patch('missions/:id/renewal-rails/consultant')
  @RequirePermission('records:write')
  setRenewalConsultantRail(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setRenewalConsultantRailRequestSchema)) body: SetRenewalConsultantRailRequest,
  ) {
    return this.delivery.setRenewalConsultantRail(user.userId, id, body)
  }

  /**
   * #2411.11 (reste, épopée #2881) — « Marquer comme traité » / « Ré-ouvrir »
   * un risque déjà CALCULÉ (`missionRisks()`). Le risque lui-même n'est jamais
   * saisi ici — `risk` ne fait que DÉSIGNER lequel, la validation vit dans le
   * service (`missionRiskSchema`), pas dans un pipe de route qui dupliquerait
   * l'énumération du contrat.
   */
  @Patch('missions/:id/risks/:risk')
  @RequirePermission('records:write')
  setMissionRiskResolution(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('risk') risk: string,
    @Body(new ZodValidationPipe(setMissionRiskResolutionRequestSchema)) body: SetMissionRiskResolutionRequest,
  ) {
    return this.delivery.setMissionRiskResolution(user.userId, id, risk, body)
  }

  /** Déposer un relevé d'activité. Même trou que la création ci-dessus : un
   *  relevé décide de ce qui devient facturable, et se déposait sans droit. */
  @Post('missions/:id/timesheets')
  @RequirePermission('records:write')
  submitTimesheet(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submitTimesheetRequestSchema)) body: SubmitTimesheetRequest,
  ) {
    return this.delivery.submitTimesheet(user.userId, id, body)
  }

  /**
   * #2412 — les deux rails de satisfaction d'une mission, déjà séparés
   * (jamais un tableau plat à re-trier à l'écran). Une entrée `private` est
   * filtrée pour tout lecteur qui n'en est pas l'auteur.
   */
  @Get('missions/:id/feedback')
  @WorkspaceRead()
  async missionFeedbackRails(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.missionFeedback.rails(workspaceId, id, user.userId)
  }

  /** Déposer une entrée de feedback — toujours `source: human` (#2412.7 : une
   *  lecture automatique de sentiment n'écrit jamais ici en son propre nom). */
  @Post('missions/:id/feedback')
  @RequirePermission('records:write')
  async submitMissionFeedback(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createMissionFeedbackSchema)) body: CreateMissionFeedbackInput,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.missionFeedback.create(workspaceId, user.userId, id, body)
  }
}

/**
 * Trente jours après le démarrage, à 10 h locales.
 *
 * `null` quand la mission n'a pas de date de démarrage : « J+30 » ne désigne
 * alors rien, et le poser à trente jours d'AUJOURD'HUI inventerait une échéance
 * à laquelle quelqu'un se fierait. Une date illisible vaut `null` pour la même
 * raison — un point d'agenda posé sur une date fausse est pire qu'aucun point.
 */
function thirtyDaysAfterStart(startedOn: string | null): Date | null {
  if (!startedOn) return null
  const start = new Date(startedOn)
  if (Number.isNaN(start.getTime())) return null
  const at = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000)
  at.setHours(10, 0, 0, 0)
  return at
}
