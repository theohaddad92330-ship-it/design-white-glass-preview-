import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Optional,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { creditCostOf, type WriteSource } from '@bellum/contracts'
import { isSuccess, unwrap } from '@bellum/utils'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { ReplyFeedbackService } from '../account-feedback/reply-feedback.service'
import { AccountsService, type AccountFailure } from '../accounts/accounts.service'
import { ListAccountsDto } from '../accounts/dto/list-accounts.dto'
import { ActionPlanItemsService } from '../actions/action-plan-items.service'
import { AnalysisService, type AnalysisFailure } from '../analysis/analysis.service'
import { ContactsService, type ContactFailure } from '../contacts/contacts.service'
import { CreditsService } from '../credits/credits.service'
import { SOFT_BRAKE_MESSAGE } from '../credits/soft-brake'
import { contactToCrmInput, splitName } from '../crm/contact-crm-mapper'
import { CrmService } from '../crm/crm.service'
import { IaClient } from '../ia/ia.client'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { ChatContextService } from '../ia-proxy/chat-context.service'
import { MemoryReplyUsesService } from '../memory/memory-reply-uses.service'
import { WorkspaceBrandService } from '../workspace/workspace-brand.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { machineReplyText } from '../../common/reply-plain-text'
import { ApiAuthGuard } from './api-auth.guard'
import {
  McpAskDto,
  McpCreateActionDto,
  McpDueActionsQueryDto,
  McpEnrichContactDto,
  McpSignalsQueryDto,
  McpStartAnalysisDto,
  McpUpdatePlanItemDto,
} from './dto/mcp-tools.dto'
import { McpSignalsService } from './mcp-signals.service'
import { McpScopeGuard, RequireMcpScope } from './mcp-scope.guard'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'

function throwAccountFailure(failure: AccountFailure): never {
  const { code, message } = failure
  if (code === 'not_found') throw new NotFoundException(message)
  throw new InternalServerErrorException(message)
}

function throwAnalysisFailure(failure: AnalysisFailure): never {
  const { code, message } = failure
  if (code === 'not_found') throw new NotFoundException(message)
  if (code === 'quota_exceeded') throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS)
  throw new InternalServerErrorException(message)
}

/** Map a contact-service failure to the HTTP status the MCP client should see —
 *  identical semantics to the JWT `/contacts` controller so both surfaces agree. */
function throwContactFailure(failure: ContactFailure): never {
  const { code, message } = failure
  switch (code) {
    case 'not_found':
      throw new NotFoundException(message)
    case 'no_email':
    case 'no_draft':
      throw new HttpException(message, HttpStatus.UNPROCESSABLE_ENTITY)
    // `enrichment_unchanged` = déjà tenté récemment sans résultat : comme les
    // deux au-dessus, l'action est sans objet en l'état, d'où le même 409.
    case 'already_sent':
    case 'suppressed':
    case 'enrichment_unchanged':
    case 'send_in_progress':
    case 'send_uncertain':
    case 'mailbox_unavailable':
    case 'demo_send_blocked':
    case 'attachment_refused':
      throw new HttpException(message, HttpStatus.CONFLICT)
    case 'send_failed':
      throw new HttpException(message, HttpStatus.BAD_GATEWAY)
    // Le fournisseur d'enrichissement n'a pas répondu. 502 comme `send_failed` :
    // une panne amont, pas une erreur de l'appelant — et surtout pas un 402, qui
    // dirait à tort que l'utilisateur doit acheter des crédits. Le `reason` part
    // dans le corps pour que l'assistant IA distingue « clé refusée » de
    // « quota épuisé », exactement comme le fait l'UI web.
    case 'enrichment_unavailable':
      throw new HttpException({ message, code: failure.reason ?? 'upstream_error' }, HttpStatus.BAD_GATEWAY)
    case 'insufficient_credits':
      throw new HttpException(message, HttpStatus.PAYMENT_REQUIRED)
    case 'update_failed':
      throw new InternalServerErrorException(message)
    case 'invalid':
      // La requête est refusée avant toute écriture. 400 côté MCP comme côté
      // web : ce n'est pas l'état du contact qui empêche, c'est l'appel.
      throw new HttpException(message, HttpStatus.BAD_REQUEST)
    // #2297.41/.49/.42/.50 — même sémantique que le contrôleur JWT `/contacts` :
    // une permission refusée (contact écarté/masqué, ou opt-out), pas un état
    // transitoire ni une ressource absente.
    // #2297.16 — même sémantique : un pays non vérifié ou non couvert refuse
    // l'appel fournisseur payant, ce n'est ni un état transitoire ni une
    // ressource absente.
    case 'permission_denied':
    case 'opt_out':
    case 'country_not_supported':
      throw new HttpException(message, HttpStatus.FORBIDDEN)
    default: {
      const _exhaustive: never = code
      throw new InternalServerErrorException(`Unknown contact failure code: ${String(_exhaustive)}`)
    }
  }
}

/**
 * The MCP-facing API surface. This controller — and ONLY this controller — is
 * guarded by {@link ApiAuthGuard}, which accepts an MCP OAuth access token. It
 * re-exposes exactly the read/trigger operations the MCP tools proxy, delegating
 * to the existing feature services (no business logic here). A leaked MCP token
 * therefore cannot reach anything outside `/mcp/*` (billing, deletion, admin).
 *
 * Every route resolves the caller's workspace/user from the authenticated
 * principal — the MCP server never passes a workspace id.
 */
@Controller('mcp')
// Brancher son assistant IA sur Bellum est une feature de palier : l'annotation
// est posée sur la CLASSE, donc chaque outil MCP la demande — y compris ceux
// ajoutés plus tard.
@RequireFeature('mcp_assistant')
@UseGuards(ApiAuthGuard, McpScopeGuard, PlanFeatureGuard)
export class McpApiController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly contacts: ContactsService,
    private readonly analysis: AnalysisService,
    private readonly credits: CreditsService,
    private readonly planItems: ActionPlanItemsService,
    private readonly crm: CrmService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly chatContext: ChatContextService,
    private readonly ia: IaClient,
    // #1960.20 — la marque de l'espace, en FIN de constructeur et optionnelle :
    // absente = marque du produit.
    @Optional() private readonly brands?: WorkspaceBrandService,
    // #1916.24 — la trace des éléments de mémoire envoyés, EN DERNIER et
    // optionnelle : absente, `ask_bellum` répond comme avant.
    @Optional() private readonly replyMemoryUses?: MemoryReplyUsesService,
    // #1919.15 — les retours de la personne sur les réponses de Laura, relus
    // comme sur la route du chat. `@Optional()` et EN DERNIER (après `brands`) :
    // absent, `ask_bellum` part sans ce bloc, et aucune suite qui construit par
    // position ne se décale.
    @Optional() private readonly replyFeedback?: ReplyFeedbackService,
    /**
     * LE CLOISONNEMENT DE PÉRIMÈTRE (BU / agence) — revue sécurité 15/09/2026.
     * MCP est une surface PAR PERSONNE (jeton OAuth d'un utilisateur), donc elle
     * porte le même périmètre que le navigateur : sans cela, un membre cloisonné
     * rouvrait par MCP ce que l'écran lui cache. `@Optional()` au constructeur,
     * jamais pour la RÈGLE.
     */
    @Optional() private readonly businessUnits?: BusinessUnitService,
    // Signaux → opportunités (find_opportunities, get_market_signals). EN DERNIER
    // et optionnel : absent, ces deux routes répondent 404 et le reste ne bouge pas.
    @Optional() private readonly signals?: McpSignalsService,
  ) {}

  /** Search/list the workspace's accounts (mcp:read). */
  @Get('accounts')
  async listAccounts(@CurrentUser() user: CurrentUserPayload, @Query() query: ListAccountsDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.accounts.findAccountsByWorkspace(workspaceId, query)
  }

  /** Full dossier for one account (mcp:read). */
  @Get('accounts/:id')
  async getAccount(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const account = unwrap(
      await this.accounts.findOneForWorkspace(
        id,
        workspaceId,
        await resolveBusinessUnitScope(this.businessUnits, workspaceId, user.userId),
      ),
      throwAccountFailure,
    )
    return { ...account, age_days: this.accounts.computeAgeDays(account.updated_at) }
  }

  /** Real contacts + decision roles + ready-to-send messages (mcp:read). */
  @Get('accounts/:id/contacts')
  async getContacts(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.contacts.findByAccount(id, user.userId)
  }

  /** Interactive action-plan checklist (mcp:read). */
  @Get('accounts/:id/plan-items')
  async getPlanItems(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.planItems.listForAccount(user.userId, id)
  }

  /**
   * `find_opportunities` — les entreprises qui montrent des signaux d'achat,
   * classées (mcp:read, gratuit, lecture seule). Portefeuille de l'espace
   * (cloisonné) + mémoire marché ; aucune identité de personne ni date de
   * corpus ne sort, et rien n'est écrit dans `accounts`.
   */
  @Get('signals')
  async findOpportunities(@CurrentUser() user: CurrentUserPayload, @Query() query: McpSignalsQueryDto) {
    const signals = this.requireSignals()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return signals.findOpportunities(await this.signalsContext(workspaceId, user.userId), {
      q: query.q,
      skills: query.skills,
      inPortfolio: query.in_portfolio,
      limit: query.limit,
    })
  }

  /** `get_market_signals` — signaux marché d'une entreprise, même hors portefeuille (mcp:read). */
  @Get('market/:companyKeyOrName')
  async getMarketSignals(@Param('companyKeyOrName') companyKeyOrName: string, @CurrentUser() user: CurrentUserPayload) {
    const signals = this.requireSignals()
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    let name = companyKeyOrName
    try {
      name = decodeURIComponent(companyKeyOrName)
    } catch {
      // Un « % » nu : on garde la saisie telle quelle plutôt que de refuser.
    }
    return signals.marketSignals(await this.signalsContext(workspaceId, user.userId), name)
  }

  /** `list_due_actions` — mes actions du plan dues aujourd'hui ou en retard, tous comptes de l'espace (mcp:read). */
  @Get('actions/due')
  async listDueActions(@CurrentUser() user: CurrentUserPayload, @Query() query: McpDueActionsQueryDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const rows = await this.planItems.listOpenForUser(user.userId, workspaceId, query.limit ?? 50, false, true)
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
    return {
      items: rows.map(row => ({
        id: row.id,
        account_id: row.account_id,
        company_name: row.company_name,
        label: row.label,
        due_date: row.due_date,
        overdue: row.due_date !== null && row.due_date < today,
        execution_status: row.execution_status,
      })),
    }
  }

  /**
   * `update_plan_item` — fait / à faire et/ou nouvelle échéance d'une étape du
   * plan (mcp:act). L'appartenance à l'espace est vérifiée AVANT toute écriture :
   * l'écriture elle-même ne borne que par personne, pas par espace.
   */
  @Post('plan-items/:id')
  @RequireMcpScope('mcp:act')
  async updatePlanItem(
    @Param('id') id: string,
    @Body() dto: McpUpdatePlanItemDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    if (!(await this.planItems.itemInWorkspace(id, workspaceId))) {
      throw new NotFoundException('Étape du plan introuvable.')
    }
    const item = await this.planItems.update(user.userId, id, {
      ...(dto.done !== undefined ? { done: dto.done } : {}),
      ...(dto.due_date !== undefined ? { due_date: dto.due_date } : {}),
      ...(dto.outcome !== undefined ? { outcome: dto.outcome } : {}),
    })
    return {
      id: item.id,
      account_id: item.account_id,
      label: item.label,
      done: item.done,
      execution_status: item.execution_status,
      due_date: item.due_date,
    }
  }

  /** Le portefeuille cloisonné, lu ICI : l'orchestration vit dans le contrôleur (GA-07). */
  private async signalsContext(workspaceId: string, userId: string) {
    const businessUnitScope = await resolveBusinessUnitScope(this.businessUnits, workspaceId, userId)
    return {
      workspaceId,
      businessUnitScope,
      listPortfolio: (filters: { q?: string; limit: number }) =>
        this.accounts.findAccountsByWorkspace(workspaceId, filters, null, undefined, businessUnitScope),
    }
  }

  private requireSignals(): McpSignalsService {
    if (!this.signals) throw new NotFoundException('Signaux indisponibles.')
    return this.signals
  }

  /** Remaining analysis quota (mcp:read) — lets the assistant check before spending. */
  @Get('credits')
  async getCredits(@CurrentUser() user: CurrentUserPayload) {
    return this.credits.getCredits(user.userId)
  }

  /**
   * Launch a new analysis (mcp:analysis — spends 1 credit). CREDIT HANDSHAKE:
   * without `confirm: true` this returns a quote — cost, current balance,
   * estimated duration, `requires_confirmation: true` — WITHOUT launching
   * anything. The assistant surfaces it to the rep; a second call with
   * `confirm: true` actually starts (returns { jobId, accountId }). A zero
   * balance answers 402 so the assistant never asks a confirmation it cannot
   * honour. Server-side enforced — the MCP proxy cannot bypass it.
   */
  @Post('analysis')
  @RequireMcpScope('mcp:analysis')
  async startAnalysis(@Body() dto: McpStartAnalysisDto, @CurrentUser() user: CurrentUserPayload) {
    if (dto.confirm !== true) {
      const credits = await this.credits.getCredits(user.userId)
      const remaining = Math.max(0, credits.accounts_limit - credits.accounts_used)
      // ⚠️ Le prix VIENT du contrat, il ne se recopie pas. Cette ligne disait
      // « 1 crédit » pendant qu'une analyse en débite HUIT : un agent demandait
      // au commercial de confirmer une dépense, et huit fois cette dépense
      // partait. Un chiffre faux sur une surface d'agent est pire que sur un
      // écran — personne ne le relit.
      const analysisCost = creditCostOf('account_analysis')
      // Et le quota se mesure CONTRE CE PRIX. « Il te reste au moins un crédit »
      // ne dit rien quand le geste en coûte huit : MCP répondait « confirme »,
      // puis `start` échouait en `quota_exceeded` après la confirmation.
      if (remaining < analysisCost || credits.trial_expired) {
        throw new HttpException(
          `Quota d'analyses épuisé (${credits.accounts_used}/${credits.accounts_limit}). Passe à un plan supérieur pour continuer.`,
          HttpStatus.PAYMENT_REQUIRED,
        )
      }
      return {
        requires_confirmation: true,
        action: 'start_analysis',
        company_name: dto.company_name,
        cost: { credits: analysisCost, kind: 'analysis' },
        balance: {
          analyses_remaining: remaining,
          analyses_used: credits.accounts_used,
          analyses_limit: credits.accounts_limit,
        },
        estimated_duration: '3-6 minutes',
        note: 'Si un dossier récent (< 30 jours) existe déjà pour cette entreprise, il sera réutilisé sans coût.',
        next_step:
          "Demandez la confirmation explicite du commercial, puis rappelez start_analysis avec les mêmes arguments et confirm: true pour lancer l'analyse.",
      }
    }
    return unwrap(await this.analysis.start(dto, user.userId), throwAnalysisFailure)
  }

  /** Poll a running analysis (mcp:read). */
  @Get('analysis/:accountId/status')
  async analysisStatus(@Param('accountId') accountId: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.analysis.getStatus(accountId, user.userId), throwAnalysisFailure)
  }

  /**
   * `ask_bellum` — Q&A over ONE account dossier (mcp:read, free — no credit).
   * Reuses the EXACT advisor pipeline the in-app Copilote uses: the context
   * (ESN profile, account, contacts, plan digest, memory, CRM state) is resolved
   * server-side by ChatContextService, then the IA chat endpoint answers from
   * the dossier — never from invented data. Stateless: the team chat thread is
   * NOT written to. 404 when the account isn't in the caller's workspace.
   */
  @Post('accounts/:id/ask')
  async askAccount(@Param('id') id: string, @Body() dto: McpAskDto, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    unwrap(
      await this.accounts.findOneForWorkspace(
        id,
        workspaceId,
        await resolveBusinessUnitScope(this.businessUnits, workspaceId, user.userId),
      ),
      throwAccountFailure,
    )
    const ctx = await this.chatContext.build({ userId: user.userId, workspaceId, accountId: id })
    // #1960.20 — même pipeline que le copilote : en marque blanche, aucune
    // adresse Bellum dans la réponse. Lecture ratée = marque du produit.
    const whiteLabel = this.brands
      ? await this.brands.getForWorkspace(workspaceId).then(
          brand => brand.isCustom === true,
          () => false,
        )
      : false
    // #1919.15 — les retours de CETTE personne ; `memoryFor` rend '' sans retour
    // (ou sur une lecture ratée), donc `null` et clé omise côté service IA.
    const replyFeedback = (await this.replyFeedback?.memoryFor({ workspaceId, userId: user.userId })) || null
    const envelope = await this.ia.chat({
      whiteLabel,
      userId: user.userId,
      // Grounding RAG d'équipe : le copilote cite les documents de l'ESN.
      workspaceId,
      message: dto.question,
      accountId: id,
      accountData: ctx.accountData,
      contactsSummary: ctx.contactsSummary,
      planSummary: ctx.planSummary,
      accountsSummary: ctx.accountsSummary,
      profileData: ctx.profileData,
      pinnedFacts: ctx.pinnedFacts,
      userPreferences: ctx.userPreferences,
      conversationSummary: ctx.conversationSummary,
      crmConnected: ctx.crmConnected,
      crmProvider: ctx.crmProvider,
      crmPresence: ctx.crmPresence,
      accountFeedback: ctx.accountFeedback,
      lostDealRexContext: ctx.lostDealRexContext,
      commercialMethodContext: ctx.commercialMethodContext,
      replyFeedback,
    })
    const raw = typeof envelope?.data?.['reply'] === 'string' ? (envelope.data['reply'] as string) : ''
    // #1914 — le client MCP est un MODÈLE, pas l'écran `/chat` : une carte
    // (`bellum-block`) lui part en texte, jamais en clôture ni en JSON.
    const reply = machineReplyText(raw)
    if (!envelope?.success || !reply.trim()) {
      throw new BadGatewayException("L'assistant Bellum n'a pas pu répondre — réessayez dans un instant.")
    }
    // #1916.24 — la MÊME capture que le chat : les éléments de mémoire envoyés
    // pour cette réponse. Elle n'est pas un message de fil, donc tracée sous
    // `externalAssistant` sans message — comptée pour la personne qui a posé la
    // question, sans conversation à ouvrir. Le contrat MCP ne change pas, et une
    // trace ratée ne fait jamais tomber la réponse.
    if (this.replyMemoryUses && ctx.pinnedFactIds.length > 0) {
      await this.replyMemoryUses
        .captureTurn({
          userId: user.userId,
          workspaceId,
          surface: 'externalAssistant',
          factIds: ctx.pinnedFactIds,
        })
        .catch(() => null)
    }
    return { account_id: id, question: dto.question, reply }
  }

  /**
   * `create_action` — add a MANUAL action to the account's plan checklist
   * (mcp:act — writes in the rep's name, free, non-destructive). The account is
   * resolved in the caller's workspace first; an optional `contact_id` must be
   * one of the rep's own contacts on THAT account. Due-dated items feed the
   * relance reminders like any other plan item.
   */
  @Post('accounts/:id/actions')
  @RequireMcpScope('mcp:act')
  async createAction(
    @Param('id') id: string,
    @Body() dto: McpCreateActionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    unwrap(
      await this.accounts.findOneForWorkspace(
        id,
        workspaceId,
        await resolveBusinessUnitScope(this.businessUnits, workspaceId, user.userId),
      ),
      throwAccountFailure,
    )
    if (dto.contact_id) {
      const contact = unwrap(await this.contacts.findOwnedForAction(dto.contact_id, user.userId), throwContactFailure)
      if (contact.account_id !== id) {
        throw new BadRequestException('Le contact indiqué n’appartient pas à ce compte.')
      }
    }
    return this.planItems.createManual(user.userId, id, {
      label: dto.title,
      dueDate: dto.due_date ?? null,
      contactId: dto.contact_id ?? null,
    })
  }

  /**
   * `enrich_contact` — resolve a contact's professional email/phone/LinkedIn
   * via the enrichment providers (mcp:analysis — spends 1 enrichment credit on
   * a MATCH; nothing is charged when no data is found). SAME CREDIT HANDSHAKE
   * as start_analysis: without `confirm: true` this returns a quote (cost +
   * balance + requires_confirmation) WITHOUT calling any provider; 402 when the
   * enrichment balance is zero. Ownership is strict — only the rep's own
   * contact. The identity sent to the provider (name + organisation) is derived
   * SERVER-SIDE from the stored contact, never from the MCP client.
   */
  @Post('contacts/:id/enrich')
  @RequireMcpScope('mcp:analysis')
  async enrichContact(
    @Param('id') id: string,
    @Body() dto: McpEnrichContactDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const contact = unwrap(await this.contacts.findOwnedForAction(id, user.userId), throwContactFailure)

    if (dto.confirm !== true) {
      const credits = await this.credits.getCredits(user.userId)
      if (credits.enrichment_credits <= 0 || credits.trial_expired) {
        // #4464 — crédits implicites : le refus garde son code 402, le texte ne parle pas de crédits.
        throw new HttpException(SOFT_BRAKE_MESSAGE, HttpStatus.PAYMENT_REQUIRED)
      }
      return {
        requires_confirmation: true,
        action: 'enrich_contact',
        contact: { id: contact.id, full_name: contact.full_name ?? null },
        cost: { credits: creditCostOf('contact_enrichment'), kind: 'enrichment' },
        balance: { enrichment_credits_remaining: credits.enrichment_credits },
        note: 'Le crédit n’est débité que si l’enrichissement trouve des données réelles (email/téléphone/LinkedIn) — aucun match, aucun débit.',
        next_step:
          'Demandez la confirmation explicite du commercial, puis rappelez enrich_contact avec confirm: true pour lancer l’enrichissement.',
      }
    }

    const { firstName, lastName } = splitName(contact.full_name ?? '')
    if (!firstName) {
      throw new HttpException(
        'Ce contact n’a pas de nom exploitable pour un enrichissement.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      )
    }
    let organization = contact.entity?.trim() ?? ''
    if (!organization && contact.account_id) {
      const account = await this.accounts.findOne(contact.account_id, user.userId)
      if (isSuccess(account)) organization = account.output.company_name?.trim() ?? ''
    }
    if (!organization) {
      throw new HttpException(
        'Impossible de déterminer l’organisation du contact (requis pour l’enrichissement).',
        HttpStatus.UNPROCESSABLE_ENTITY,
      )
    }
    return unwrap(
      await this.contacts.enrichContact(id, user.userId, {
        first_name: firstName,
        last_name: lastName,
        organization_name: organization,
      }),
      throwContactFailure,
    )
  }

  /**
   * // #2375.10 — MCP prépare, l'envoi reste un geste humain.
   *
   * ACTION — PREPARE the contact's already-drafted email (mcp:act); it does
   * NOT send it. DÉCISION LOUIS 21/09/2026 (doctrine `c82_copilote_prepare_le_
   * commercial_envoie`) : GA-375 (`aucun-envoi-sans-clic.spec.ts`) trouva cette
   * route en train d'appeler `ContactsService.sendEmail` — un troisième chemin
   * d'envoi que « l'écran prépare et attend le clic » ne décrivait pas. Elle
   * appelle désormais `ContactsService.prepareEmail`, qui résout le MÊME
   * brouillon par les MÊMES gardes (`resolveSendableDraft`, partagée avec
   * l'envoi réel : `no_email` → `no_draft` → `already_sent` → `suppressed`)
   * mais ne déclenche jamais Resend et ne stampe jamais `email_sent_at`. La
   * réponse est un IDENTIFIANT (`contact_id`), jamais un contenu — le corps
   * d'un message ne sort jamais vers un humain ni vers le modèle. L'appelant
   * MCP sait ainsi QUELLE fiche montrer ; envoyer reste un clic fait DANS le
   * produit, par le commercial.
   */
  @Post('contacts/:id/prepare-email')
  @RequireMcpScope('mcp:act')
  async prepareContactEmail(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.contacts.prepareEmail(id, user.userId), throwContactFailure)
  }

  /**
   * // #2375.10 — MCP prépare, l'envoi reste un geste humain.
   *
   * COMPATIBILITÉ — ancien nom, gardé pour un client MCP déjà déployé qui
   * l'appellerait encore. Le NOM ment (« send » qui prépare est le piège que
   * le produit vient d'apprendre à coûter, cf. `En faire une action`) : cette
   * route ne fait donc plus rien d'autre que `prepare-email` ci-dessus, à
   * l'identique — même méthode, même réponse, même absence d'envoi.
   */
  @Post('contacts/:id/send-email')
  @RequireMcpScope('mcp:act')
  async sendContactEmail(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.contacts.prepareEmail(id, user.userId), throwContactFailure)
  }

  /**
   * ACTION — export/upsert the contact into the connected CRM (mcp:act). The
   * contact is resolved with strict `user_id` ownership FIRST, then mapped to the
   * CRM shape server-side — the MCP client never supplies the contact's fields,
   * so it can neither reach a teammate's contact nor inject arbitrary CRM data.
   */
  @Post('contacts/:id/log-crm')
  @RequireMcpScope('mcp:act')
  async logContactToCrm(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const contact = unwrap(await this.contacts.findOwnedForAction(id, user.userId), throwContactFailure)
    // #2855 — un client MCP externe compose cette écriture, jamais un clic
    // direct dans l'app : la provenance le nomme, sans nommer LEQUEL (nos
    // fournisseurs/clients ne se nomment jamais).
    const source: WriteSource = { kind: 'mcp' }
    // `origin: 'user'` — comportement inchangé (aucune porte n'était passée
    // avant #2855) : le scope `mcp:act` est déjà le consentement explicite.
    return this.crm.exportContact(user.userId, contactToCrmInput(contact), { origin: 'user', source })
  }
}
