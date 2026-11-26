import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Put,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common'
import { SkipThrottle, Throttle } from '@nestjs/throttler'
import { unwrap } from '@bellum/utils'
import {
  contactCrmExportProviderSchema,
  contactPerimeterQuerySchema,
  contactPreflightActionSchema,
  engagementDraftChannelSchema,
} from '@bellum/contracts'
import type { ContactBadgeCounters, ContactFollowUpStats, PersonErasureResult } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { DataExit } from '../workspace/data-exit.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ContactEnrichmentService } from './contact-enrichment.service'
import { EnrichmentDurationService } from '../analytics/enrichment-duration.service'
import { EmploymentRecheckRequester } from './employment-recheck.requester'
import { ContactsService, type ContactFailure } from './contacts.service'
import { DiscoverCallListDto } from './dto/discover-call-list.dto'
import { ContactRankingQueryDto } from './dto/contact-ranking-query.dto'
import { ContactSolicitationsQueryDto } from './dto/contact-solicitations-query.dto'
import { EnrichContactDto } from './dto/enrich-contact.dto'
import { ListContactsDto } from './dto/list-contacts.dto'
import { SearchPeopleByNameDto } from './dto/search-people-by-name.dto'
import { SendBulkEmailDto } from './dto/send-bulk-email.dto'
import { SendContactEmailDto } from './dto/send-contact-email.dto'
import { SendResolutionDto } from './dto/send-resolution.dto'
import { DeclareSentDto } from './dto/declare-sent.dto'
import { UpdateContactDto } from './dto/update-contact.dto'
import { UpdateContactHiddenDto } from './dto/update-contact-hidden.dto'
import { UpdateContactNoteDto } from './dto/update-contact-note.dto'
import { SaveContactEmailDraftDto } from './dto/save-contact-email-draft.dto'
import { RecordContactCrmExportDto } from './dto/record-contact-crm-export.dto'
import { SaveEngagementDraftDto } from './dto/save-engagement-draft.dto'
import { ExcludeContactDto } from './dto/exclude-contact.dto'
import { ExcludeEntityContactsDto, RestoreEntityContactsDto } from './dto/exclude-entity-contacts.dto'
import { AuthorizeContactRecommendationDto } from './dto/authorize-contact-recommendation.dto'
import { BulkVerifyContactsDto } from './dto/bulk-verify-contacts.dto'
import { ErasePersonDto } from './dto/erase-person.dto'
import { PersonErasureService } from './person-erasure.service'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { FieldConflictService } from '../crm-core/field-conflict.service'
import { ContactDuplicateDecisionsService, type DuplicateDecision } from './contact-duplicate-decisions.service'

/** Exportée pour être testée : la correspondance échec métier → statut HTTP est
 *  une décision produit (que dit-on à l'utilisateur, et avec quel code ?), pas
 *  un détail d'implémentation du contrôleur. */
export function throwContactFailure(failure: ContactFailure): never {
  const { code, message } = failure
  switch (code) {
    case 'not_found':
      throw new NotFoundException(message)
    case 'update_failed':
      throw new InternalServerErrorException(message)
    case 'invalid':
      // 400 — la requête est refusée AVANT toute écriture. Distinct du 422 :
      // ce n'est pas l'état du contact qui empêche, c'est ce qu'on a envoyé.
      throw new HttpException(message, HttpStatus.BAD_REQUEST)
    case 'insufficient_credits':
      // 402 Payment Required — semantically the right code for "out of credit"
      // and distinct from the 429 throttle so the UI can render a different toast.
      // #3400 — l'essai terminé porte son code : le client ne dit pas « épuisés ».
      throw new HttpException(
        failure.refusal ? { message, code: failure.refusal } : message,
        HttpStatus.PAYMENT_REQUIRED,
      )
    // Les échecs d'envoi portent leur `code` machine dans le corps (en plus du
    // `message` FR) : le front les traduit au lieu d'afficher un texte serveur
    // non localisé — et « désinscrit » ne doit jamais être deviné côté client.
    case 'no_email':
    case 'no_draft':
      // 422 — the contact isn't in a state that can be sent (no address / no draft).
      throw new HttpException({ message, code }, HttpStatus.UNPROCESSABLE_ENTITY)
    case 'enrichment_unchanged':
      // 409 — même famille que `already_sent` : l'état du contact rend l'action
      // sans objet (déjà tenté, rien de neuf côté fournisseur). Distinct du 402
      // pour que l'UI explique au lieu de pousser à l'achat de crédits.
      //
      // Le corps porte désormais le SORT DU CRÉDIT et la DATE DE REPRISE
      // (recette finale §46). Le rapport montre ce 409 affiché nu — « le serveur
      // a échoué sans indiquer de raison » — alors que les deux questions de
      // l'utilisateur sont « est-ce que ça m'a coûté un crédit ? » et « quand
      // puis-je réessayer ? ». Y répondre côté client obligerait à recopier une
      // règle de facturation dans l'interface ; c'est le serveur qui sait.
      // `message` reste à la racine : l'UI d'enrichissement lit `error.message`.
      throw new HttpException(
        { message, code, credit: failure.credit ?? 'not_debited', retryAt: failure.retryAt ?? null },
        HttpStatus.CONFLICT,
      )
    case 'enrichment_unavailable':
      // 502 — le fournisseur n'a pas répondu. Le corps porte le `reason` machine
      // (vocabulaire DegradeReason) EN PLUS du message FR : « clé refusée »,
      // « quota épuisé » et « fournisseur injoignable » mènent à des actions
      // différentes, et aucune n'est « API error ». Distinct du 402 (crédits
      // Bellum épuisés) : ici l'utilisateur n'a rien à acheter, et rien payé.
      throw new HttpException(
        { message, code: failure.reason ?? 'upstream_error', credit: failure.credit ?? 'not_debited' },
        HttpStatus.BAD_GATEWAY,
      )
    // #3699.4/.5 — tentative en cours, tentative incertaine (vérifier avant de
    // renvoyer), canal « boîte connectée » indisponible (choix explicite à
    // faire), démonstration : l'état rend l'envoi sans objet, pas une panne.
    case 'already_sent':
    case 'suppressed':
    case 'send_in_progress':
    case 'send_uncertain':
    case 'mailbox_unavailable':
    case 'demo_send_blocked':
    case 'attachment_refused':
      // #3699.6 — `attachment_refused` : une pièce choisie ne peut pas partir, rien n'est parti.
      // 409 — the send is blocked by contact state (already sent, or opted out).
      throw new HttpException({ message, code }, HttpStatus.CONFLICT)
    case 'send_failed':
      // 502 — the upstream mail provider (Resend) rejected the send.
      throw new HttpException({ message, code }, HttpStatus.BAD_GATEWAY)
    // #2297.41/.49/.42/.50 — 403 : ce n'est pas un état transitoire (409) ni
    // une ressource absente (404), c'est une permission refusée — un contact
    // écarté/masqué, ou une personne qui a demandé qu'on cesse.
    // #2297.16 — même sémantique : un pays non vérifié ou non couvert refuse
    // l'appel fournisseur payant, ce n'est ni un état transitoire ni une
    // ressource absente.
    case 'permission_denied':
    case 'opt_out':
    case 'country_not_supported':
      throw new HttpException({ message, code }, HttpStatus.FORBIDDEN)
    default: {
      const _exhaustive: never = code
      throw new InternalServerErrorException(`Unknown contact failure code: ${String(_exhaustive)}`)
    }
  }
}

@Controller('contacts')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class ContactsController {
  constructor(
    private readonly contactsService: ContactsService,
    private readonly enrichmentJobs: ContactEnrichmentService,
    /**
     * LE CLOISONNEMENT DE PÉRIMÈTRE (BU / agence) — revue sécurité 15/09/2026.
     *
     * ⚠️ Il se résout ICI, au bord, et DESCEND en paramètre : `ContactsService`
     * n'importe pas `BusinessUnitService`. GA-07 (`module-boundaries.spec.ts`)
     * refuse un import service → service et dit où va l'orchestration : « dans
     * le contrôleur — c'est là que vit un geste utilisateur ». Le cliquet des
     * imports service → service n'a donc pas bougé.
     *
     * `@Optional()` et en DERNIÈRE position : des specs construisent ce
     * contrôleur POSITIONNELLEMENT. Optionnel pour le CONSTRUCTEUR, jamais pour
     * la RÈGLE — absent, `resolveBusinessUnitScope` LÈVE.
     */
    @Optional() private readonly workspaceContext?: WorkspaceContextService,
    @Optional() private readonly businessUnits?: BusinessUnitService,
    // #2120.57 / #2297.23 — la durée d'un enrichissement se mesure. Exportée
    // `@Global` par `AnalyticsModule` en production ; `@Optional()` pour les
    // specs qui construisent ce contrôleur positionnellement.
    @Optional() private readonly enrichmentDuration?: EnrichmentDurationService,
    /** #2297 — l'effacement d'une personne. `@Optional()` pour les specs qui
     *  construisent ce contrôleur positionnellement ; jamais pour la RÈGLE :
     *  absent, la route LÈVE plutôt que de répondre « effacé ». */
    @Optional() private readonly personErasure?: PersonErasureService,
    /** #3219 (#190.2 côté contact) — le MÊME détecteur de contradiction que la
     *  fiche compte (`CrmCoreModule` l'exporte, `ContactsModule` l'importe déjà).
     *  Un CONTRÔLEUR peut le tenir (GA-07 ne compte que service → service) ; le
     *  service le reçoit en fonction. `@Optional()` et en DERNIER : des specs
     *  construisent ce contrôleur positionnellement — absent, le journal est
     *  dit illisible, jamais « aucune contradiction ». */
    @Optional() private readonly fieldConflicts?: FieldConflictService,
    /** #4286.13 — l'ouverture d'une fiche demande la relecture de l'employeur (asynchrone, jamais attendue). `@Optional()` et en DERNIER : des specs construisent ce contrôleur positionnellement. */
    @Optional() private readonly employmentRecheck?: EmploymentRecheckRequester,
    /** #4114.4 — la décision humaine sur une paire de doublons proposée. `@Optional()` et en DERNIER (specs positionnelles) : absent, la lecture rend les propositions brutes, l'écriture LÈVE. */
    @Optional() private readonly duplicateDecisions?: ContactDuplicateDecisionsService,
  ) {}

  /**
   * Le périmètre de l'appelant, pour les LECTURES de ce contrôleur.
   *
   * ⚠️ Les ÉCRITURES (exclure, noter, masquer, envoyer, changer un statut) ne
   * passent pas par ici : elles sont bornées `{ id, user_id }` dans le service,
   * strictement PLUS étroit qu'un périmètre. Leur ajouter cette clause
   * donnerait l'illusion d'un contrôle là où il y en a déjà un meilleur.
   */
  private async businessUnitScopeOf(userId: string) {
    if (!this.workspaceContext) {
      throw new ServiceUnavailableException('business_unit_scope_unavailable')
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return resolveBusinessUnitScope(this.businessUnits, workspaceId, userId)
  }

  @SkipThrottle()
  @Get()
  async findAll(@CurrentUser() user: CurrentUserPayload, @Query() query: ListContactsDto) {
    // #4475 — `account_id` (snake_case) est le même filtre qu'`accountId`, jamais une clé ignorée.
    const { account_id: accountIdSnake, ...filters } = query
    const accountId = filters.accountId ?? accountIdSnake
    return this.contactsService.findAllForUser(
      user.userId,
      accountId ? { ...filters, accountId } : filters,
      await this.businessUnitScopeOf(user.userId),
    )
  }

  /**
   * #2159.26 — les étiquettes EN USAGE sur les contacts de l'espace, pour le
   * filtre de liste. Segment LITTÉRAL déclaré avant `:id`, qui l'avalerait.
   */
  @Get('tags')
  @WorkspaceRead()
  async listTags(@CurrentUser() user: CurrentUserPayload): Promise<string[]> {
    return this.contactsService.listTags(user.userId)
  }

  /**
   * #2727 — « je tape un nom, je vois les homonymes, je choisis ». Recherche
   * GRATUITE (tier Apollo People-Search) : AUCUN crédit débité ici, le reveal
   * (`:id/enrich` ci-dessous) reste le geste payant et séparé sur l'homonyme
   * CHOISI. Route littérale déclarée avant `:id`, qui l'avalerait sinon.
   */
  @Get('search-by-name')
  @RequirePermission('contacts:enrich')
  async searchByName(@CurrentUser() user: CurrentUserPayload, @Query() dto: SearchPeopleByNameDto) {
    return this.contactsService.searchPeopleByName(user.userId, dto.fullName, dto.organizationName)
  }

  @Get('stats')
  async getStats(@CurrentUser() user: CurrentUserPayload) {
    return this.contactsService.getStats(user.userId, await this.businessUnitScopeOf(user.userId))
  }

  /**
   * #2384.5 — la délivrabilité, DISTINCTE du taux d'envoi : bounce/raisons
   * mesurés sur `email_bounced_at` (#2733, webhook fournisseur seul écrivain).
   * `domainReputation`/`complaints` restent `null`, aucun connecteur ne les
   * mesure aujourd'hui (GA-18/19, jamais 0 sur du non-mesuré).
   */
  @Get('deliverability')
  async getDeliverability(@CurrentUser() user: CurrentUserPayload) {
    return this.contactsService.getDeliverability(user.userId, await this.businessUnitScopeOf(user.userId))
  }

  /**
   * #2842 (reste, 26/09) — `contactFollowUps` de l'audit commercial
   * (`/settings/profile/audit`).
   */
  @Get('follow-up-stats')
  @WorkspaceRead()
  async getFollowUpStats(@CurrentUser() user: CurrentUserPayload): Promise<ContactFollowUpStats> {
    return this.contactsService.getFollowUpStats(user.userId, await this.businessUnitScopeOf(user.userId))
  }

  /**
   * #2120.57 / #2297.23 — ce que `EnrichConfirmDialog` lit pour annoncer une
   * durée. Une latence du PRODUIT, jamais une donnée d'espace : aucun
   * `@RequirePermission`, aucun périmètre BU — la médiane agrège tous les
   * espaces, elle ne révèle rien d'aucun. `null` sous 5 mesures (GA-18/19) ;
   * `null` aussi si le service n'est pas câblé (`@Optional()`, mêmes garanties
   * que ci-dessus) plutôt qu'une 500.
   */
  @SkipThrottle()
  @Get('enrichment-duration-estimate')
  async getEnrichmentDurationEstimate(): Promise<{ estimate: { medianMs: number; sampleSize: number } | null }> {
    const estimate = (await this.enrichmentDuration?.estimate()) ?? null
    return { estimate }
  }

  /**
   * #2155.24/.25 — le badge de navigation « Contacts ». `readyToProcess` est
   * OMIS (pas `0`) quand la mesure échoue ou que la population est vide : le
   * rendu de la barre latérale ne montre alors rien, jamais un « 0 » qui
   * prétendrait avoir compté (`ContactsService.countReadyToProcess`).
   */
  @Get('counts/ready-to-process')
  @WorkspaceRead()
  async getBadgeCounters(@CurrentUser() user: CurrentUserPayload): Promise<ContactBadgeCounters> {
    const readyToProcess = await this.contactsService.countReadyToProcess(
      user.userId,
      await this.businessUnitScopeOf(user.userId),
    )
    return readyToProcess === undefined ? {} : { readyToProcess }
  }

  // LOT 4 (perf) — `findByAccountForHttp` PROJETTE la sortie de `findByAccount`
  // pour le fil HTTP (six champs mesurés inutiles retirés ici, la méthode
  // interne reste complète pour ses 8 autres appelants). Voir
  // `AccountContactView` dans `contacts.service.ts`.
  @Get('account/:accountId')
  async findByAccount(
    @Param('accountId') accountId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('perimeter') perimeter?: string,
  ) {
    // #4996 L4 — avec `?perimeter=`, la réponse porte aussi le compteur « hors périmètre » ; sans, le tableau d'avant.
    if (perimeter !== undefined) {
      const parsed = contactPerimeterQuerySchema.safeParse({ perimeter })
      if (!parsed.success || !parsed.data.perimeter) throw new BadRequestException('invalid_perimeter')
      return this.contactsService.findByAccountInPerimeter(
        accountId,
        user.userId,
        parsed.data.perimeter,
        await this.businessUnitScopeOf(user.userId),
      )
    }
    return this.contactsService.findByAccountForHttp(
      accountId,
      user.userId,
      await this.businessUnitScopeOf(user.userId),
    )
  }

  /**
   * #2120.48 — « Confronter avec mon CRM », sur le dernier instantané déjà en
   * base (décision Louis 18/09/2026). Lecture pure : aucun appel au CRM,
   * aucune écriture — `ContactsService.crmConfrontation` le détaille.
   * GA-05 : lecture d'espace (aucune écriture, aucun crédit, borné à
   * `workspace_id` via `businessUnitScopeOf`), donc déclarée — même patron que
   * `account/:accountId/ranking` ci-dessous.
   */
  @Get('account/:accountId/crm-confrontation')
  @WorkspaceRead()
  async crmConfrontation(@Param('accountId') accountId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.contactsService.crmConfrontation(accountId, user.userId, await this.businessUnitScopeOf(user.userId))
  }

  /**
   * #4114 — doublons PROBABLES de personnes d'un compte : des PROPOSITIONS (paires
   * + raisons), jamais une fusion. GA-05 : lecture d'espace (aucune écriture,
   * aucun crédit, borné à `workspace_id` + périmètre BU), donc déclarée.
   */
  @Get('account/:accountId/duplicate-proposals')
  @WorkspaceRead()
  async duplicateProposals(@Param('accountId') accountId: string, @CurrentUser() user: CurrentUserPayload) {
    const raw = await this.contactsService.duplicateProposals(
      accountId,
      user.userId,
      await this.businessUnitScopeOf(user.userId),
    )
    // #4114.4 — les paires écartées (« pas les mêmes ») ne reviennent pas ; une paire confirmée porte `decision: 'same'`.
    if (!this.duplicateDecisions || !this.workspaceContext || raw.pairs.length === 0) return raw
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { ...raw, pairs: await this.duplicateDecisions.overlay(workspaceId, accountId, raw.pairs) }
  }

  /**
   * #4114.4 — « ce sont les mêmes » / « pas les mêmes » sur une paire PROPOSÉE. On enregistre la décision, on ne
   * fusionne JAMAIS (aucune porte de fusion de personnes n'existe : la confirmation attend le geste humain).
   * Mêmes droits que la lecture des propositions (espace + périmètre BU) : une paire que l'appelant ne voit pas → 404.
   */
  @Post('account/:accountId/duplicate-proposals/decision')
  @RequirePermission('records:write')
  @HttpCode(HttpStatus.OK)
  async decideDuplicate(
    @Param('accountId') accountId: string,
    @Body() body: { leftId?: string; rightId?: string; decision?: DuplicateDecision },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { leftId, rightId, decision } = body ?? {}
    if (!leftId || !rightId || leftId === rightId || (decision !== 'same' && decision !== 'not_same')) {
      throw new BadRequestException('leftId, rightId et decision (same | not_same) sont requis')
    }
    if (!this.duplicateDecisions || !this.workspaceContext) {
      throw new ServiceUnavailableException('Décision de doublon indisponible')
    }
    const raw = await this.contactsService.duplicateProposals(
      accountId,
      user.userId,
      await this.businessUnitScopeOf(user.userId),
    )
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.duplicateDecisions.record(workspaceId, user.userId, accountId, raw.pairs, leftId, rightId, decision)
  }

  // #2120.30-38 — le chemin recommandé du compte, classé ICI sur neuf axes
  // nommés et les trois choix du commercial (périmètre, sujet, offre). Route à
  // part : la liste complète ci-dessus reste allégée (LOT 4 perf), et le
  // classement ne rend que dix personnes.
  // GA-05 : lecture d'espace (aucune écriture, aucun crédit, rien ne sort de
  // l'espace actif — `rankForAccount` borne à `workspace_id`), donc déclarée.
  @Get('account/:accountId/ranking')
  @WorkspaceRead()
  async rankByAccount(
    @Param('accountId') accountId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ContactRankingQueryDto,
  ) {
    return this.contactsService.rankForAccount(
      accountId,
      user.userId,
      query,
      await this.businessUnitScopeOf(user.userId),
    )
  }

  /**
   * LUDOVIC-C LC.1 (b) — « Remettre les contacts à jour avec les règles actuelles » sur UN
   * compte : les homonymes déjà au dossier sont ARCHIVÉS avec leur raison, sans recollecte ni
   * crédit, jamais un contact corrigé par un humain. Écriture d'espace (le siège qui travaille
   * le compte), bornée à l'espace et au périmètre BU. Segment littéral, déclaré avant `:id`.
   */
  @Post('account/:accountId/apply-current-rules')
  @RequirePermission('records:write')
  @HttpCode(HttpStatus.OK)
  async applyCurrentRules(@Param('accountId') accountId: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(
      await this.contactsService.applyCurrentContactRules(
        accountId,
        user.userId,
        await this.businessUnitScopeOf(user.userId),
      ),
      throwContactFailure,
    )
  }

  /**
   * #4928.5 — « Écarter les contacts de cette entité » (« Boulanger » ramenait des boulangeries). Écriture d'espace
   * comme `:id/exclude` : `records:write`, compte borné à l'espace ET au périmètre BU. On archive (réversible par
   * `DELETE :id/exclude`), on ne supprime pas. Segment littéral, déclaré avant `:id`.
   */
  @Post('account/:accountId/exclude-entity')
  @RequirePermission('records:write')
  @HttpCode(HttpStatus.OK)
  async excludeEntity(
    @Param('accountId') accountId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ExcludeEntityContactsDto,
  ) {
    return unwrap(
      await this.contactsService.excludeEntityContacts(
        accountId,
        user.userId,
        dto.entity,
        dto.reason,
        await this.businessUnitScopeOf(user.userId),
      ),
      throwContactFailure,
    )
  }

  /** #4928.5 — le geste inverse : réintègre les contacts écartés avec l'entité (mêmes droits, même cloisonnement). */
  @Post('account/:accountId/restore-entity')
  @RequirePermission('records:write')
  @HttpCode(HttpStatus.OK)
  async restoreEntity(
    @Param('accountId') accountId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RestoreEntityContactsDto,
  ) {
    return unwrap(
      await this.contactsService.restoreEntityContacts(
        accountId,
        user.userId,
        dto.entity,
        await this.businessUnitScopeOf(user.userId),
      ),
      throwContactFailure,
    )
  }

  /**
   * #2545 / #2546 / #3819 (démo Ludovic 08/10) — la liste d'appels de
   * Découvrir : pour chaque entreprise de la recherche qui est un compte de
   * l'espace, ses dix contacts CLASSÉS (coordonnées en clair) et ses signaux
   * historisés. La source UNIQUE de l'onglet Contacts et de la liste d'appels.
   * GA-05 : lecture d'espace (aucune écriture, aucun crédit, bornée à
   * l'espace et au périmètre BU). `POST` : la liste dépasse une query string.
   * Segment littéral déclaré AVANT `:id`.
   */
  @Post('call-list')
  @WorkspaceRead()
  @HttpCode(HttpStatus.OK)
  async callList(@CurrentUser() user: CurrentUserPayload, @Body() dto: DiscoverCallListDto) {
    return this.contactsService.callList(user.userId, dto, await this.businessUnitScopeOf(user.userId))
  }

  /**
   * #2386.6 — la collision de sollicitation (#2128.17), pour PLUSIEURS
   * contacts en un aller-retour. Déclarée AVANT `:id` (segment littéral,
   * sinon `:id` l'avalerait). `POST`, pas `GET` : la liste d'ids dépasse ce
   * qu'une query string devrait porter, même plafonnée à 50.
   */
  @Post('solicitations')
  @WorkspaceRead()
  async solicitations(@CurrentUser() user: CurrentUserPayload, @Body() dto: ContactSolicitationsQueryDto) {
    return this.contactsService.resolveContactsSolicitations(user.userId, dto.contact_ids)
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const contact = unwrap(
      await this.contactsService.findOne(id, user.userId, await this.businessUnitScopeOf(user.userId)),
      throwContactFailure,
    )
    // #4286.13 — « on relit le contact quand on va dessus sur sa fiche au bout d'un mois » : enfilé, jamais attendu.
    // `requestIfDue` ne lève jamais ; le résultat arrive par le refetch habituel de la fiche.
    void this.employmentRecheck?.requestIfDue(contact.workspace_id ?? '', contact)
    return contact
  }

  // Moteur de cadence multi-touch (Drive #8) : le calendrier de relance du
  // contact (J+1 → J+3 → J+6 → J+9) + la prochaine action.
  @Get(':id/cadence')
  async getCadence(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(
      await this.contactsService.getCadence(id, user.userId, await this.businessUnitScopeOf(user.userId)),
      throwContactFailure,
    )
  }

  /**
   * #3219 (#190.2 côté CONTACT, décision Louis 11/10/2026) — le contrôle AVANT
   * une action (préparer un message, ajouter à une séquence, exporter vers le
   * CRM) : ce qui diffère selon la source ou le périmètre du compte. Une
   * LECTURE qui ne tranche rien — `ContactsService.preflight`. `?action=` ne
   * change que le cadre de la phrase, jamais les lignes ; une action hors
   * vocabulaire est refusée plutôt qu'ignorée.
   */
  @Get(':id/preflight')
  @WorkspaceRead()
  async getPreflight(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('action') action: string | undefined,
  ) {
    const parsedAction = action === undefined ? null : contactPreflightActionSchema.safeParse(action)
    if (parsedAction && !parsedAction.success) throw new BadRequestException('invalid_preflight_action')
    return unwrap(
      await this.contactsService.preflight(id, user.userId, {
        action: parsedAction ? parsedAction.data : null,
        readConflicts: (workspaceId, contactId) =>
          this.fieldConflicts
            ? this.fieldConflicts.openConflicts(workspaceId, 'contact', contactId, { includeSettled: true })
            : Promise.reject(new Error('field_conflicts_unavailable')),
        businessUnitScope: await this.businessUnitScopeOf(user.userId),
      }),
      throwContactFailure,
    )
  }

  // #3712 — les dossiers associés à la personne (compte, entité, projets, besoins, missions).
  @Get(':id/associations')
  @WorkspaceRead()
  async getAssociations(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(
      await this.contactsService.getAssociations(id, user.userId, await this.businessUnitScopeOf(user.userId)),
      throwContactFailure,
    )
  }

  // #3719.4 — où et quand cette personne a été exportée vers un CRM : l'état
  // survit au rechargement. Lecture seule, aucune donnée du CRM lui-même.
  @Get(':id/crm-exports')
  @WorkspaceRead()
  async getCrmExports(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(
      await this.contactsService.getCrmExports(id, user.userId, await this.businessUnitScopeOf(user.userId)),
      throwContactFailure,
    )
  }

  // #3719.4 — consigne un export RÉUSSI (appelé par la carte après la réponse du
  // CRM). Même droit et même règle de sortie que l'export lui-même : ne laisse
  // pas écrire l'état d'une sortie qu'on n'aurait pas le droit de faire.
  @Put(':id/crm-exports/:provider')
  @DataExit()
  @RequirePermission('data:export')
  async recordCrmExport(
    @Param('id') id: string,
    @Param('provider') provider: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RecordContactCrmExportDto,
  ) {
    const parsed = contactCrmExportProviderSchema.safeParse(provider)
    if (!parsed.success) throw new BadRequestException('Destination d’export inconnue')
    return unwrap(
      await this.contactsService.recordCrmExport(
        id,
        user.userId,
        parsed.data,
        dto,
        await this.businessUnitScopeOf(user.userId),
      ),
      throwContactFailure,
    )
  }

  // #3694.7 — le brief confirmé (objectif, relation, angle, paramètres) et le
  // fil qui le porte : lecture seule, bornée à SON auteur (un brouillon n'est
  // jamais partagé entre deux commerciaux sur le même contact).
  @Get(':id/engagement-draft/:channel')
  @WorkspaceRead()
  async getEngagementDraft(
    @Param('id') id: string,
    @Param('channel') channel: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const parsed = engagementDraftChannelSchema.safeParse(channel)
    if (!parsed.success) throw new BadRequestException('Canal de brouillon inconnu')
    return unwrap(
      await this.contactsService.getEngagementDraft(
        id,
        user.userId,
        parsed.data,
        await this.businessUnitScopeOf(user.userId),
      ),
      throwContactFailure,
    )
  }

  // #3694.7 — enregistre le cliché courant (debounced côté client) : pas un
  // historique, l'état du brouillon qui survit au rechargement.
  @Put(':id/engagement-draft/:channel')
  @RequirePermission('records:write')
  async putEngagementDraft(
    @Param('id') id: string,
    @Param('channel') channel: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SaveEngagementDraftDto,
  ) {
    const parsed = engagementDraftChannelSchema.safeParse(channel)
    if (!parsed.success) throw new BadRequestException('Canal de brouillon inconnu')
    return unwrap(
      await this.contactsService.putEngagementDraft(
        id,
        user.userId,
        parsed.data,
        dto,
        await this.businessUnitScopeOf(user.userId),
      ),
      throwContactFailure,
    )
  }

  // « Puis-je envoyer un email à ce contact ? » — consulté par le module
  // d'approche pour désactiver « Envoyer » AVANT la rédaction (l'opt-out vit
  // dans `email_suppression`, le client ne peut pas le déduire). Lecture seule :
  // n'autorise aucun envoi, `deliverDraft` reste seul juge.
  @Get(':id/sendability')
  async getSendability(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(
      await this.contactsService.getSendability(
        id,
        user.userId,
        await this.businessUnitScopeOf(user.userId),
        user.email,
      ),
      throwContactFailure,
    )
  }

  // Contact lifecycle journal (P0 « états + providers ») — l'état persisté +
  // l'historique des passages (détecté le … / vérifié le … / enrichi le …),
  // chaque ligne avec sa source et sa date réelle.
  @Get(':id/lifecycle')
  async getLifecycle(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(
      await this.contactsService.getLifecycleHistory(id, user.userId, await this.businessUnitScopeOf(user.userId)),
      throwContactFailure,
    )
  }

  /**
   * Lance l'enrichissement et REND LA MAIN (202) — la cascade fournisseur dure
   * couramment 30 à 50 s, et jusqu'à ~85 s quand elle va au bout de ses sources.
   * La tenir dans cette requête faisait dépendre un résultat payé de tout ce qui
   * peut couper entre le navigateur et nous (proxy, redéploiement, onglet en
   * veille) ; le client suit désormais `GET :id/enrichment`.
   *
   * Les refus connus d'avance (contact inconnu, cooldown, crédits épuisés)
   * sortent ici, en statut HTTP, exactement comme avant.
   */
  @Post(':id/enrich')
  @RequirePermission('contacts:enrich')
  @HttpCode(HttpStatus.ACCEPTED)
  async enrichContact(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Body() dto: EnrichContactDto) {
    return unwrap(await this.enrichmentJobs.enqueue(id, user.userId, dto), throwContactFailure)
  }

  /**
   * État de l'enrichissement en cours sur ce contact (`queued` / `running` /
   * `done` + résultat). Un ÉCHEC n'est pas un état : il est rejoué en statut HTTP
   * (402, 409, 502…) par `throwContactFailure`, si bien que le client garde le
   * seul chemin d'erreur qu'il avait quand l'appel était synchrone.
   *
   * `@SkipThrottle` : c'est un endpoint de polling (une lecture Redis), pas une
   * action — le compter comme telle grillerait le quota de l'utilisateur pendant
   * sa propre attente.
   */
  /** #AM.39 — les enrichissements en cours de l'utilisateur (un index pour la liste, pas une sonde par fiche). */
  @SkipThrottle()
  @Get('enrichment/in-flight')
  @RequirePermission('contacts:enrich')
  async enrichmentInFlight(@CurrentUser() user: CurrentUserPayload) {
    return { contacts: await this.enrichmentJobs.inFlight(user.userId) }
  }

  @SkipThrottle()
  @Get(':id/enrichment')
  @RequirePermission('contacts:enrich')
  async enrichmentStatus(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.enrichmentJobs.status(id, user.userId), throwContactFailure)
  }

  /**
   * VÉRIFICATION EN MASSE (#2296.38 à .41, épopée #2964) — jusqu'à cinquante
   * contacts, un job d'enrichissement par contact (même file, même
   * idempotence que `:id/enrich`), un statut PAR CONTACT en retour. Jamais un
   * 4xx global sur le lot : un contact introuvable ou en cooldown n'empêche
   * pas les autres d'être mis en file — le corps 200 le dit ligne par ligne.
   */
  @Post('bulk-verify')
  @RequirePermission('contacts:enrich')
  async bulkVerifyContacts(@Body() dto: BulkVerifyContactsDto, @CurrentUser() user: CurrentUserPayload) {
    return { outcomes: await this.enrichmentJobs.enqueueBulk(dto.contact_ids, user.userId) }
  }

  /**
   * Écarter un contact, avec son motif (PDF 2, items 82-83).
   *
   * Tout siège peut le faire : celui qui découvre qu'un contact a quitté
   * l'entreprise est celui qui travaille dessus. Les séquences en cours
   * s'arrêtent — continuer d'écrire à quelqu'un qu'on vient d'exclure est la
   * faute la plus visible d'un outil de prospection.
   */
  @Post(':id/exclude')
  @RequirePermission('records:write')
  async exclude(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Body() dto: ExcludeContactDto) {
    return unwrap(await this.contactsService.excludeContact(id, user.userId, dto.reason), throwContactFailure)
  }

  @Delete(':id/exclude')
  @RequirePermission('records:write')
  async restore(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.contactsService.restoreContact(id, user.userId), throwContactFailure)
  }

  /**
   * #3871.1 (lot V11, 07/10) — l'utilisateur DÉCLARE qu'un contact a quitté
   * l'entreprise, déclenché par la carte que Laura propose dans la
   * conversation (`propose_contact_departure`) : LE CLIC EST LA DÉCISION,
   * même doctrine que `/exclude` juste au-dessus. On ARCHIVE (`historique`),
   * jamais de suppression ; les séquences en cours s'arrêtent.
   */
  @Post(':id/departed')
  @RequirePermission('records:write')
  async markDeparted(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.contactsService.declareContactDeparted(id, user.userId), throwContactFailure)
  }

  /**
   * #4418.1 — « Marquer envoyé » d'un message préparé au plan d'un contact : planifie J+3/J+6/J+9 comme
   * un envoi Bellum, mais reste DÉCLARATIF (aucune preuve d'envoi écrite sur la fiche).
   */
  @Post(':id/declared-touch')
  @RequirePermission('messages:send')
  @HttpCode(HttpStatus.OK)
  async declareTouch(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.contactsService.scheduleFollowUpsForDeclaredTouch(id, user.userId), throwContactFailure)
  }

  /**
   * #2297 — EFFACER CETTE PERSONNE (RGPD art. 17, décision Louis 19/09/2026).
   *
   * La seule suppression RÉELLE du produit (doctrine c67) : la fiche et tout ce
   * qui la nomme partent, une trace sans donnée personnelle reste pour qu'elle
   * ne soit jamais recollectée. `records:write` écarte les sièges en lecture
   * seule au bord ; QUI peut effacer QUELLE fiche (administrateur, ou porteur
   * de la fiche) se décide dans le service, sur la fiche chargée. Le rôle et
   * les accords en propre se résolvent ICI, au bord (GA-07).
   */
  @Post(':id/erasure')
  @RequirePermission('records:write')
  @HttpCode(HttpStatus.OK)
  // Plus serré que le plafond global : un geste irréversible, rare par nature.
  @Throttle({ 'default-1m': { limit: 10, ttl: 60_000 } })
  async erasePerson(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    // Lu pour sa VALIDATION (`confirm: true`, sinon 400) — pas pour sa valeur.
    @Body() _dto: ErasePersonDto,
  ): Promise<PersonErasureResult> {
    if (!this.workspaceContext || !this.personErasure) {
      throw new ServiceUnavailableException('person_erasure_unavailable')
    }
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const extraPermissions = await this.workspaceContext.extraPermissionsOf(workspaceId, user.userId)
    return this.personErasure.erase({ contactId: id, userId: user.userId, workspaceId, role, extraPermissions })
  }

  // #2084.24 — le cloisonnement vaut aussi en écriture. Ces trois routes-ci ne
  // fuyaient NI entre espaces NI entre unités (elles sont bornées par `user_id`
  // dans le service) : ce qui leur manquait était le SIÈGE. `WorkspacePermissionGuard`
  // est fail-open par conception, donc une écriture sans annotation s'offrait au
  // rôle `viewer` — « strictly read-only … refused on every mutation ».
  @Patch(':id/status')
  @RequirePermission('records:write')
  async updateStatus(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateContactDto) {
    return unwrap(
      await this.contactsService.updateStatus(id, user.userId, dto.user_status || 'new'),
      throwContactFailure,
    )
  }

  // Palier 1 — envoi en masse (« envoie à tous ces gens »). Déclaré AVANT
  // `:id/send-email` pour que `:id` ne capture pas le segment `send-email`.
  @Post('send-email/bulk')
  @RequirePermission('messages:send')
  async sendEmailBulk(@CurrentUser() user: CurrentUserPayload, @Body() dto: SendBulkEmailDto) {
    return unwrap(
      await this.contactsService.sendEmailBulk(dto.contact_ids, user.userId, user.email),
      throwContactFailure,
    )
  }

  // Palier 1 « Envoie l'email » : envoie le brouillon du contact à son adresse,
  // avec l'email du commercial en Reply-To. `dto.draft` (optionnel) = le
  // brouillon relu à l'écran dans le module d'approche — il prime sur
  // `email_message` pour que le commercial envoie exactement ce qu'il a lu.
  @Post(':id/send-email')
  @RequirePermission('messages:send')
  async sendEmail(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Body() dto: SendContactEmailDto) {
    return unwrap(
      await this.contactsService.sendEmail(
        id,
        user.userId,
        user.email,
        dto?.draft,
        dto?.channel,
        dto?.attachment_asset_ids ?? [],
        dto?.sender_connection_id,
      ),
      throwContactFailure,
    )
  }

  // #3699.5 — la personne a vérifié sa boîte d'envoi après une tentative INCERTAINE :
  // `not_sent` rouvre l'envoi, `sent` consigne (déclaratif) que le message y est.
  @Post(':id/send-resolution')
  @RequirePermission('messages:send')
  async resolveSendAttempt(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SendResolutionDto,
  ) {
    return unwrap(await this.contactsService.resolveSendAttempt(id, user.userId, dto.outcome), throwContactFailure)
  }

  // #4418.1 — « Marquer envoyé » : le commercial a envoyé lui-même (déclaratif, aucune preuve d'envoi) ;
  // planifie les relances J+3/J+6/J+9 comme un envoi Bellum.
  @Post(':id/declare-sent')
  @RequirePermission('messages:send')
  async declareSent(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Body() dto: DeclareSentDto) {
    return unwrap(
      await this.contactsService.declareSent(id, user.userId, dto.channel, dto.sent_on),
      throwContactFailure,
    )
  }

  // #2084.24 — le cloisonnement vaut aussi en écriture : même raison qu'au-dessus.
  @Patch(':id/note')
  @RequirePermission('records:write')
  async updateNote(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateContactNoteDto,
  ) {
    return unwrap(await this.contactsService.updateNote(id, user.userId, dto.note), throwContactFailure)
  }

  // #3942.2 — « Préparer un e-mail par personne » : écrit `email_message`
  // SANS envoyer (statut préparé, jamais envoyé). Même garde de cloisonnement
  // que `:id/note`.
  @Patch(':id/email-draft')
  @RequirePermission('records:write')
  async saveEmailDraft(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SaveContactEmailDraftDto,
  ) {
    return unwrap(await this.contactsService.saveEmailDraft(id, user.userId, dto), throwContactFailure)
  }

  // #2160.58 — la confirmation POSITIVE « bon contact », distincte du refus
  // (`POST /contacts/:id/stop`). Aucun corps : une déclaration, pas un patch.
  @Post(':id/identity-confirmed')
  @RequirePermission('records:write')
  async confirmIdentity(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.contactsService.confirmIdentity(id, user.userId), throwContactFailure)
  }

  // #2160.60 — « Autoriser la recommandation » : lève un doute d'identité
  // (`homonym_conflict` / `entity_mismatch`, seules valeurs acceptées par le
  // DTO) à la porte d'éligibilité du classement. Réversible via le DELETE
  // symétrique, même paire de routes que `:id/exclude`.
  @Post(':id/recommendation-authorization')
  @RequirePermission('records:write')
  async authorizeRecommendation(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: AuthorizeContactRecommendationDto,
  ) {
    return unwrap(await this.contactsService.authorizeRecommendation(id, user.userId, dto.reason), throwContactFailure)
  }

  @Delete(':id/recommendation-authorization')
  @RequirePermission('records:write')
  async revokeRecommendationAuthorization(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.contactsService.revokeRecommendationAuthorization(id, user.userId), throwContactFailure)
  }

  // #2084.24 — le cloisonnement vaut aussi en écriture : même raison qu'au-dessus.
  // Masquer un contact le retire de l'écran de tous ceux qui lisent ce compte.
  @Patch(':id/hidden')
  @RequirePermission('records:write')
  async setHidden(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateContactHiddenDto,
  ) {
    return unwrap(await this.contactsService.setHidden(id, user.userId, dto.hidden), throwContactFailure)
  }
}
