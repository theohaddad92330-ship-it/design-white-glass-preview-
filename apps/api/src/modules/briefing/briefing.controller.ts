import { BadRequestException, Body, Controller, Get, Header, Logger, Post, Query, UseGuards } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import {
  DISCOVER_ALERT_EVENT_SOURCE_KINDS,
  briefingRoleFitFeedbackRequestSchema,
  briefingCardDispositionRequestSchema,
  firstOpenTodayRequestSchema,
  agendaSlotProposalPreviewRequestSchema,
  agendaSlotProposalConfirmRequestSchema,
  agendaSlotProposalRejectRequestSchema,
  confirmFocusPlanBlockRequestSchema,
  cancelFocusPlanBlockRequestSchema,
  setFocusPlanBlockOutcomeRequestSchema,
  type AgendaSlotProposalPreview,
  type BellumCreatedEventIdsResponse,
  type SlotProposalPriorityAccount,
  type BriefingAction,
  type ContactAccessPath,
  type DailyBriefing,
  type DiscoverAlertEvent,
  type FirstOpenTodayResponse,
  type FocusPlanBlockOutcomeRead,
  type SinceLastVisitDigest,
} from '@bellum/contracts'
import type { AgendaCreateResult } from '../agenda/agenda-backend'
import { AccountEntity } from '../../database/entities/account.entity'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { JwtGuard } from '../auth/jwt.guard'
import { ContactsService } from '../contacts/contacts.service'
import type { MarketCompanyLookup } from '../market-memory/market-memory.service'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { rankAccountsToWatchByMarket, reorderAccountActions } from './accounts-to-watch-market-rank'
import { DiscoverAlertEventService } from '../notifications/discover-alerts/discover-alert-event.service'
import { BriefingService } from './briefing.service'
import { parseReadAs } from './briefing-role-order'
import { DailyBriefMarkerService } from './daily-brief-marker.service'

/** Le brief du jour — agenda, messagerie et comptes qui ont bougé, en une lecture. */
@Controller('briefing')
// #2770 — WorkspacePermissionGuard est fail-open par défaut (une route sans
// permission déclarée passe intacte) : les routes historiques de ce
// contrôleur, aucune n'en déclare, restent inchangées. Seules les trois
// routes `slot-proposals/*` (`records:write`) sont désormais réellement gardées.
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class BriefingController {
  private readonly logger = new Logger(BriefingController.name)

  /**
   * `MarketMemoryService` et `AccountEntity` sont injectés ICI, pas dans
   * `BriefingService` (#1637).
   *
   * ⚠️ GA-07 n'a plus qu'un slot au 09/09/2026 : un service qui va chercher
   * celui d'un module voisin dans un fichier qui n'en importait aucun consomme
   * le dernier. Un contrôleur est HORS PÉRIMÈTRE de cette garde — « c'est par
   * là que passe une orchestration nouvelle » — et c'est exactement ce que fait
   * `today()` : il lit le brief déjà construit, puis réordonne UNE liste selon
   * un critère qui n'a rien à voir avec la construction du brief lui-même.
   *
   * `WorkspaceContextService` est injecté pour la MÊME raison (#1936, lot 7A) :
   * `firstOpenToday()` a besoin de savoir si l'espace est une salle de
   * démonstration AVANT de toucher `DailyBriefMarkerService`, et coder cette
   * question une seconde fois dans le service marqueur en ferait une SECONDE
   * définition de « cet espace est-il une démo ? ». `WorkspaceModule` est déjà
   * importé par `BriefingModule` pour `BriefingService` : aucun câblage de plus.
   */
  constructor(
    private readonly briefing: BriefingService,
    private readonly marketMemory: MarketMemoryService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly dailyBriefMarker: DailyBriefMarkerService,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    // #2151.23 / #2151.61 — les alertes de Découvrir jugées urgentes. Injecté
    // ICI et non dans `BriefingService` pour la MÊME raison que
    // `MarketMemoryService` juste au-dessus : c'est une orchestration nouvelle,
    // posée sur un brief déjà construit, et GA-07 est un cliquet AU PLAFOND.
    private readonly discoverAlerts: DiscoverAlertEventService,
    // #2107.42 — même raison que `MarketMemoryService`/`DiscoverAlertEventService`
    // juste au-dessus : une orchestration posée sur un brief déjà construit,
    // hors du périmètre de GA-07 (contrôleur).
    private readonly contacts: ContactsService,
  ) {}

  /**
   * #1637 — LA MÉMOIRE MARCHÉ DÉPARTAGE « COMPTES À SURVEILLER », ELLE NE
   * FABRIQUE JAMAIS D'URGENCE.
   *
   * Chaque entrée de `accountsToWatch` porte déjà un signal RÉEL — c'est le
   * critère qui l'a fait entrer, décidé dans `BriefingService.buildAccountsToWatch`,
   * inchangé par ce lot. La mémoire marché n'intervient qu'APRÈS : elle
   * réordonne la liste déjà décidée, elle n'en ajoute et n'en retire aucune
   * ligne. Voir `rankAccountsToWatchByMarket` (GA-262) pour le détail de
   * l'ordre, et `market-memory-never-creates-urgency.spec.ts` pour la garde.
   *
   * ⚠️ Un échec de lecture — indisponibilité ou exception — n'efface PAS le
   * tri : `rankAccountsToWatchByMarket` reçoit alors une carte VIDE, donc
   * chaque compte y vaut `accountsToWatchMarketRank(null)` = 0 — la clé de
   * marché s'efface d'elle-même et seule reste la clé d'urgence (exactitude
   * puis date du signal). Un « 0 » sur une panne serait un mensonge si c'était
   * affiché comme une mesure ; ici ce n'est qu'un DÉPART NEUTRE d'un critère
   * qui départage, jamais un chiffre montré.
   */
  // #3386 — « Actualiser » doit relire : jamais un brief (ni son horodatage) servi par un cache HTTP.
  @Header('Cache-Control', 'no-store')
  @Get('today')
  async today(
    @CurrentUser() user: CurrentUserPayload,
    // ⚠️ Optionnel, et SANS changer le comportement quand il est absent
    // (`BriefingService.build` retombe alors sur son fuseau par défaut) —
    // voir `time-zone-input.ts`. Le fuseau navigateur est déjà envoyé à
    // d'autres routes (`appContext.ts`, `AgendaBoard.tsx`) ; l'accepter ici
    // prépare le jour où l'écran l'enverra aussi, sans le lui imposer.
    @Query('timeZone') timeZone?: string,
    // #3414 — « lire comme » (salle de démo ; dans le produit : rôles qui ENCADRENT, décision Louis 12/10 ; ignoré ailleurs par le
    // service) : un rôle inconnu est ignoré, jamais une erreur.
    @Query('readAs') readAs?: string,
  ): Promise<DailyBriefing> {
    // Perf 29/09/2026 (`GET /briefing/today` 8,5 s en prod) — les alertes de
    // Découvrir ne dépendent pas du brief : elles se lisent avec lui, en
    // parallèle, et AVANT le retour anticipé (un espace sans compte à
    // surveiller peut très bien avoir une alerte de Découvrir, #2151.23 /
    // #2151.61 : le raccourci d'en dessous la ferait disparaître).
    const [briefing, discover] = await Promise.all([
      this.briefing.build(user.userId, undefined, timeZone, parseReadAs(readAs)),
      this.discoverAlertsFor(user.userId),
    ])
    if (briefing.accountsToWatch.length === 0) return { ...briefing, ...discover }

    // `accessPathsFor` ne dépend que de l'ENSEMBLE des comptes (le tri par la
    // mémoire marché n'en ajoute ni n'en retire) : elle part avec la lecture du
    // marché au lieu d'attendre le tri.
    const [marketPaths, accessPaths] = await Promise.all([
      this.marketPathsFor(briefing),
      this.accessPathsFor(
        user.userId,
        briefing.accountsToWatch.map(entry => entry.accountId),
      ),
    ])

    // #1637 — les DEUX blocs suivent le même ordre. « À faire maintenant » est
    // construit dans le service, à partir de la liste d'AVANT le tri : sans ce
    // second geste, le même écran afficherait les mêmes comptes dans deux
    // ordres différents. Les cartes gardent leurs EMPLACEMENTS — un compte ne
    // remonte jamais au-dessus d'une réunion à préparer.
    const ranked = rankAccountsToWatchByMarket(briefing.accountsToWatch, marketPaths)
    // #2107.40 — la MÊME lecture (`marketPaths`) qui départage le tri
    // (`rankAccountsToWatchByMarket`, GA-262 : une PRÉSENCE, jamais un volume)
    // voyage désormais aussi jusqu'à la carte, comme un COMPTE affiché — pas
    // une seconde lecture, seulement un second usage de celle déjà faite.
    const accountsToWatch = ranked.map(entry => ({
      ...entry,
      structuralPotentialPaths: marketPaths.get(entry.accountId) ?? null,
      accessPath: accessPaths.get(entry.accountId) ?? null,
    }))
    return {
      ...briefing,
      accountsToWatch,
      actions: reorderAccountActions(briefing.actions, accountsToWatch),
      ...discover,
    }
  }

  /** La mémoire marché des comptes à surveiller — `null` par compte non couvert,
   *  carte VIDE si la lecture casse (voir le docblock de `today`). */
  private async marketPathsFor(briefing: DailyBriefing): Promise<ReadonlyMap<string, number | null>> {
    let marketPaths: ReadonlyMap<string, number | null> = new Map()
    try {
      const rows = await this.accounts.find({
        where: { id: In(briefing.accountsToWatch.map(entry => entry.accountId)) },
        // #1617.4 — `workspace_id` est lu ICI plutôt que résolu par un service
        // de plus : les comptes du brief appartiennent tous à l'espace de la
        // personne, et la ligne le porte déjà. Une injection supplémentaire
        // pour une valeur qu'on a sous la main serait un chemin en double.
        select: ['id', 'website', 'registry_country', 'workspace_id'],
      })
      const byId = new Map(rows.map(row => [row.id, row]))
      // Aucun compte lu ⇒ aucune correction à chercher : `null` fait retomber
      // la lecture sur le calcul seul, qui est le chemin d'avant ce lot.
      const workspaceId = rows[0]?.workspace_id ?? null
      const lookups: MarketCompanyLookup[] = briefing.accountsToWatch.map(entry => ({
        ref: entry.accountId,
        name: entry.companyName,
        website: byId.get(entry.accountId)?.website ?? null,
        // #1617 — le pays départage deux homonymes du corpus. Absent ⇒ on ne
        // devine pas, et l'ambiguïté reste une ambiguïté.
        country: byId.get(entry.accountId)?.registry_country ?? null,
      }))

      const read = await this.marketMemory.pathsFor(lookups, { workspaceId })
      if (read.status === 'ok') marketPaths = read.paths
    } catch (error) {
      this.logger.warn(`Briefing accountsToWatch: marché indisponible — ${(error as Error).message}`)
    }
    return marketPaths
  }

  /**
   * #2107.42 — la voie d'accès du contact le mieux classé de chaque compte,
   * MÊME classement que l'onglet Contacts (`ContactsService.rankForAccount`,
   * `PriorityPathSection.tsx`) — jamais une seconde règle de priorisation
   * (GA-26). Aucun périmètre/sujet/offre choisi : le même point de départ que
   * la fiche compte avant tout geste du commercial.
   *
   * UNE lecture pour tous les comptes (`ContactsService.topAccessPaths`, perf
   * 29/09/2026 : avant, `rankForAccount` par compte — ≥ 6 requêtes chacun, la
   * cause principale des 8,5 s). La liste vient de `accountsToWatch`, déjà
   * bornée par le brief, jamais le portefeuille. Un compte dont le classement
   * casse n'empêche pas les autres — `null`, jamais un accès deviné ; une
   * lecture qui casse en bloc rend une carte vide (même résilience que
   * `marketPaths`).
   */
  private async accessPathsFor(
    userId: string,
    accountIds: string[],
  ): Promise<ReadonlyMap<string, ContactAccessPath | null>> {
    try {
      return await this.contacts.topAccessPaths(accountIds, userId)
    } catch (error) {
      this.logger.warn(`Briefing accountsToWatch: classement des contacts indisponible — ${(error as Error).message}`)
      return new Map()
    }
  }

  /**
   * #2107 (Centre d'actions) — TOUTES LES ACTIONS CANDIDATES, JAMAIS
   * PLAFONNÉES.
   *
   * `GET /briefing/today` classe le même ensemble mais le TRONQUE à
   * `BRIEFING_ACTIONS_MAX` (recette écran #2107.4/#2107.8/#2107.14, 25/09/2026 :
   * un jour ordinaire suffit à évincer les genres de priorité basse, qui ne
   * sont alors visibles NULLE PART). Le Centre d'actions (`/actions`) appelle
   * cette route pour lister l'ENSEMBLE, trié par priorité — voir
   * `BriefingService.allActions` pour le détail de la dérivation (LA MÊME que
   * `today()`, jamais recopiée).
   *
   * Bornée par les mêmes limites SQL raisonnables que `today()` — aucune
   * borne supplémentaire n'est ajoutée ici, l'ajouter recréerait le défaut
   * que cette route corrige.
   */
  @Get('actions')
  async allActions(@CurrentUser() user: CurrentUserPayload): Promise<{ actions: BriefingAction[] }> {
    return { actions: await this.briefing.allActions(user.userId) }
  }

  /**
   * #2151.23 / #2151.61 — CE QUI APPARAÎT DANS AUJOURD'HUI.
   *
   * ⚠️ Arrêt §10 — le cloisonnement : sans `workspace_id`, on ne lit RIEN. Un
   * repli « alors on lit tout » ferait voir à une ESN les événements d'une
   * autre ; un repli « alors on rend la liste vide » est le bon, et il se lit
   * comme un vide honnête (« aucun déclenchement »).
   *
   * ⚠️ Un échec de lecture n'efface pas le brief : la liste redevient vide et
   * la DATE redevient `null`, ce qui fait dire à l'écran « aucun déclenchement
   * depuis qu'on surveille » — jamais « 0 alerte », qui affirmerait quelque
   * chose du marché.
   */
  private async discoverAlertsFor(
    userId: string,
  ): Promise<{ discoverAlerts: DiscoverAlertEvent[]; discoverAlertsLastEventAt: string | null }> {
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      if (!workspaceId) return { discoverAlerts: [], discoverAlertsLastEventAt: null }
      const [events, lastAt] = await Promise.all([
        this.discoverAlerts.forToday(workspaceId),
        this.discoverAlerts.lastOccurredAt(workspaceId),
      ])
      // #2097.21 (correctif) — LE LOGO/SITE DU COMPTE, quand le sujet EN EST
      // un. Seul `new_signal` (le genre urgent produit par
      // `WatchlistRefreshWorker`) porte un `subject_id` d'`accounts` — les
      // deux autres genres urgents (`new_confirmed_need`, `mission_ended`)
      // pointent un besoin ou une mission, sans logo ni site (même doctrine
      // que `businessObject.logoUrl` pour une mission). Une lecture ciblée,
      // jamais une jointure sur des sujets dont on ne sait pas que ce sont
      // des comptes.
      const accountSubjectIds = [
        ...new Set(
          events
            .filter((e): e is typeof e & { subject_id: string } => e.kind === 'new_signal' && e.subject_id !== null)
            .map(e => e.subject_id),
        ),
      ]
      const accountsById = accountSubjectIds.length
        ? new Map(
            (
              await this.accounts.find({
                where: { id: In(accountSubjectIds) },
                select: ['id', 'logo_url', 'website'],
              })
            ).map(account => [account.id, account]),
          )
        : new Map<string, Pick<AccountEntity, 'id' | 'logo_url' | 'website'>>()
      return {
        discoverAlerts: events.map(event => {
          const account =
            event.kind === 'new_signal' && event.subject_id !== null ? accountsById.get(event.subject_id) : undefined
          return {
            id: event.id,
            kind: event.kind,
            subjectId: event.subject_id,
            subjectLabel: event.subject_label,
            // La NATURE de la source, lue à SON seul endroit : recopier la
            // table ici la ferait diverger au premier genre ajouté.
            sourceKind: DISCOVER_ALERT_EVENT_SOURCE_KINDS[event.kind],
            occurredAt: new Date(event.occurred_at).toISOString(),
            // Toutes ces lignes sont nées `today` — c'est le critère de lecture.
            surface: 'today' as const,
            savedViewId: event.saved_view_id,
            // #2151.24 — le détail vit sur l'OBJET, quand l'objet a un écran.
            href: hrefForDiscoverAlert(event.kind, event.subject_id),
            logoUrl: account?.logo_url ?? null,
            website: account?.website ?? null,
          }
        }),
        discoverAlertsLastEventAt: lastAt ? lastAt.toISOString() : null,
      }
    } catch (error) {
      this.logger.warn(`Briefing discoverAlerts: lecture indisponible — ${(error as Error).message}`)
      return { discoverAlerts: [], discoverAlertsLastEventAt: null }
    }
  }

  /**
   * LE SIGNAL « PREMIÈRE OUVERTURE DU JOUR » (#1936, lot 7A).
   *
   * Décision de Louis du 12/09/2026 : la 1re ouverture de Laura dans la
   * journée EST le brief du matin. Cette route ne rend AUCUN contenu de
   * brief — elle répond, en la CONSOMMANT, à une seule question : est-ce la
   * première fois qu'on ouvre Laura aujourd'hui ?
   *
   * ⚠️ Appelée UNIQUEMENT par l'amorce de Laura, jamais par l'affichage de
   * `GET /briefing/today` — sinon ouvrir cet écran le matin volerait la
   * primeur à Laura avant qu'elle n'ait pu parler la première.
   *
   * Salle de démonstration : une salle est louée 30 minutes
   * (`DEMO_LEASE_TTL_MINUTES`) à un visiteur différent à chaque fois, donc
   * « premier du jour » n'a pas de sens pour un compte que personne ne
   * possède plus d'une demi-heure. La route rend toujours `true` SANS
   * toucher `user_daily_brief` — voir `demo-coverage.ts` pour la décision
   * écrite.
   *
   * Le corps est validé souplement : un fuseau absent ou illisible ne fait
   * JAMAIS échouer la requête (400) — il retombe sur le fuseau par défaut du
   * produit, côté service. Refuser la requête pour un fuseau mal formé
   * bloquerait l'amorce de Laura pour un détail que l'utilisateur ne peut
   * pas corriger lui-même.
   */
  @Post('first-open-today')
  async firstOpenToday(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ): Promise<FirstOpenTodayResponse> {
    const parsed = firstOpenTodayRequestSchema.safeParse(body ?? {})
    const timeZone = parsed.success ? parsed.data.timeZone : undefined

    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      return { isFirstOpenToday: true }
    }

    const isFirstOpenToday = await this.dailyBriefMarker.consumeFirstOpenToday(user.userId, timeZone)
    return { isFirstOpenToday }
  }

  /**
   * Les quatre lignes typées de « ce qui a bougé depuis ta dernière visite ».
   *
   * `since` est PASSÉ par le client et non relu ici : le repère vit dans
   * `POST /actions/mark-seen`, qui LIT ET ÉCRIT dans le même appel. Le rejouer
   * à chaque rafraîchissement du brief ferait avancer la fenêtre sous les yeux
   * de celui qui la lit — le client le fige pour sa session (`staleTime:
   * Infinity`) et le transmet.
   *
   * Une date illisible est REFUSÉE, jamais remplacée par un défaut. « Depuis
   * hier » à la place d'un repère qu'on n'a pas su lire annoncerait la mauvaise
   * fenêtre avec l'aplomb de la bonne.
   *
   * `@WorkspaceRead` (D39) : cette route LIT la donnée de l'espace et n'écrit
   * rien, ne dépense aucun crédit et ne sort pas de l'espace — la matrice
   * `ROLE_PERMISSIONS` n'a aucune permission de lecture à lui donner, et lui
   * poser une permission d'écriture fermerait la porte à `viewer` sur un
   * compteur. L'espace est résolu SERVER-SIDE depuis l'identité de l'appelant.
   */
  @Get('since-last-visit')
  @WorkspaceRead()
  sinceLastVisit(
    @CurrentUser() user: CurrentUserPayload,
    @Query('since') since?: string,
  ): Promise<SinceLastVisitDigest> {
    const parsed = since ? new Date(since) : null
    if (!parsed || Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('since must be an ISO 8601 datetime')
    }
    return this.briefing.sinceLastVisit(user.userId, parsed)
  }

  /**
   * #2397.7 — le geste « ceci correspond à mon rôle » (ou son retrait), posé
   * sur un GENRE de carte, jamais une carte précise (le brief est recalculé à
   * chaque ouverture, aucune carte ne survit d'un jour à l'autre). Corps validé
   * STRICT (`briefingRoleFitFeedbackRequestSchema`, contrat partagé avec
   * `buildBriefingActions`) : un genre hors énumération est un défaut de
   * l'appelant, refusé en 400, jamais deviné.
   *
   * Ne débite aucun crédit, n'appelle aucun fournisseur externe — une simple
   * préférence personnelle (`user_preferences`), au même titre que le fuseau
   * ou la langue.
   */
  @Post('role-fit')
  async setRoleFit(@CurrentUser() user: CurrentUserPayload, @Body() body: unknown): Promise<{ engaged: boolean }> {
    const parsed = briefingRoleFitFeedbackRequestSchema.safeParse(body)
    if (!parsed.success) {
      throw new BadRequestException('kind (BriefingActionKind) et engaged (boolean) sont requis')
    }
    await this.briefing.setRoleFit(user.userId, parsed.data.kind, parsed.data.engaged)
    return { engaged: parsed.data.engaged }
  }

  /**
   * #2099.17-.32 (épopée #2767) — Reporter / Pas pertinent / Déjà traité, posé
   * sur UNE carte par son lecteur. Corps validé STRICT : un refus sans motif
   * ou un report sans date est un défaut de l'appelant, refusé en 400.
   * Aucun crédit, aucun fournisseur, aucune écriture sur l'objet source.
   */
  @Post('card-disposition')
  async setCardDisposition(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ): Promise<{ recorded: true }> {
    const parsed = briefingCardDispositionRequestSchema.safeParse(body)
    if (!parsed.success) {
      throw new BadRequestException('actionId et disposition requis (motif pour un refus, date pour un report)')
    }
    await this.briefing.setCardDisposition(user.userId, parsed.data)
    return { recorded: true }
  }

  /**
   * #2770 (#2101.19/.21/.22/.30/.37/.40) — LA PORTE D'ÉCRITURE D'UN CRÉNEAU
   * PROPOSÉ POUR UN COMPTE.
   *
   * Trois routes, une seule porte : `preview` ne calcule ni n'écrit rien de
   * plus qu'une prévisualisation FIGÉE (et suspend tout calcul si un refus
   * est déjà posé aujourd'hui pour ce compte, #2101.40) ; `confirm` écrit
   * EXACTEMENT ce qui a été montré, sur un geste explicite — jamais seule ;
   * `reject` mémorise le refus, sans toucher à l'agenda. Voir
   * `BriefingService.previewSlotProposal` pour la raison de ce périmètre
   * face à l'épopée #2770.
   */
  @Post('slot-proposals/preview')
  // #2770 — même permission que `confirm`/`reject` : prévisualiser n'a de
  // sens que pour qui peut ensuite écrire, et la matrice n'a pas de
  // permission de lecture dédiée (`ROLE_PERMISSIONS` ne porte que des
  // familles d'actions MUTANTES, `viewer` n'en détient aucune).
  @RequirePermission('records:write')
  async previewSlotProposal(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ): Promise<AgendaSlotProposalPreview> {
    const parsed = agendaSlotProposalPreviewRequestSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('accountId requis, durationMinutes entre 15 et 240')
    return this.briefing.previewSlotProposal(user.userId, parsed.data.accountId, parsed.data.durationMinutes)
  }

  @Post('slot-proposals/confirm')
  // #2770 — écrit réellement un événement sur l'agenda de l'appelant : même
  // permission que les gestes de carte de Laura (`action-os.controller.ts`),
  // une écriture de RECORD tenue par un geste explicite.
  @RequirePermission('records:write')
  async confirmSlotProposal(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ): Promise<AgendaCreateResult> {
    const parsed = agendaSlotProposalConfirmRequestSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('accountId, title, start et end sont requis')
    return this.briefing.confirmSlotProposal(user.userId, {
      accountId: parsed.data.accountId,
      summary: parsed.data.title,
      start: parsed.data.start,
      end: parsed.data.end,
    })
  }

  @Post('slot-proposals/reject')
  // #2770 — même permission que `confirm` juste au-dessus : mémoriser un
  // refus est une écriture (`user_preferences`), pas une simple lecture.
  @RequirePermission('records:write')
  async rejectSlotProposal(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ): Promise<{ rejected: true }> {
    const parsed = agendaSlotProposalRejectRequestSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('accountId requis')
    await this.briefing.rejectSlotProposal(user.userId, parsed.data.accountId)
    return { rejected: true }
  }

  /**
   * #2770.49/.50/.51 — LA PORTE D'ÉCRITURE D'UN BLOC DE PLAN DE JOURNÉE.
   * `propose_focus_plan` (#2391) n'écrit rien ; ce geste explicite écrit
   * EXACTEMENT le titre et les horaires que la carte de chat a montrés, sur
   * UN bloc RÉELLEMENT placé (jamais un `deferred_blocks`, qui n'a pas
   * d'horaires). Voir `BriefingService.confirmFocusPlanBlock`.
   */
  @Post('focus-plan/confirm-block')
  // #2770.49/.50/.51 — même permission que `slot-proposals/confirm` : une
  // écriture de RECORD tenue par un geste explicite.
  @RequirePermission('records:write')
  async confirmFocusPlanBlock(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ): Promise<AgendaCreateResult> {
    const parsed = confirmFocusPlanBlockRequestSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('type, title, start_iso et end_iso sont requis')
    return this.briefing.confirmFocusPlanBlock(user.userId, {
      title: parsed.data.title,
      start: parsed.data.start_iso,
      end: parsed.data.end_iso,
    })
  }

  /**
   * #2770.52 — annule un bloc de plan de journée RÉELLEMENT créé, sur le seul
   * identifiant que `confirm-block` ci-dessus a rendu. Voir
   * `BriefingService.cancelFocusPlanBlock`.
   */
  @Post('focus-plan/cancel-block')
  // #2770.52 — même permission que `confirm-block` : annuler une écriture
  // d'agenda EST une écriture.
  @RequirePermission('records:write')
  async cancelFocusPlanBlock(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ): Promise<{ cancelled: true }> {
    const parsed = cancelFocusPlanBlockRequestSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('event_id requis')
    await this.briefing.cancelFocusPlanBlock(user.userId, parsed.data.event_id)
    return { cancelled: true }
  }

  /**
   * #2770.63/.64/.65 (#2391.51/.52/.53) — LA MESURE POST-BLOC : réalisé,
   * interrompu ou reporté, un CLIC déclaré sur le seul identifiant que
   * `confirm-block` a rendu. Voir `BriefingService.setFocusPlanBlockOutcome`.
   */
  @Post('focus-plan/block-outcome')
  // #2770.63/.64/.65 — même permission que `confirm-block`/`cancel-block` :
  // marquer un bloc EST une écriture de RECORD.
  @RequirePermission('records:write')
  async setFocusPlanBlockOutcome(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    const parsed = setFocusPlanBlockOutcomeRequestSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('event_id et outcome sont requis')
    await this.briefing.setFocusPlanBlockOutcome(user.userId, parsed.data.event_id, parsed.data.outcome, {
      note: parsed.data.note,
      actualMinutes: parsed.data.actual_minutes,
    })
    return { ok: true }
  }

  /**
   * #2391.54 / #2391.55 — RELIRE le résultat et la durée réelle déclarés des
   * blocs du plan de journée. `event_ids` (séparés par des virgules) borne la
   * lecture aux blocs que l'écran montre : sans identifiant, rien n'est lu —
   * jamais tout l'historique. `@WorkspaceRead` (D39) : une lecture des blocs
   * de la PERSONNE elle-même, aucune écriture.
   */
  @Get('focus-plan/block-outcomes')
  @WorkspaceRead()
  async focusPlanBlockOutcomes(
    @CurrentUser() user: CurrentUserPayload,
    @Query('event_ids') eventIds?: string,
  ): Promise<FocusPlanBlockOutcomeRead[]> {
    const ids = (eventIds ?? '')
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0)
      .slice(0, 50)
    if (ids.length === 0) return []
    return this.briefing.listFocusPlanBlockOutcomes(user.userId, ids)
  }

  /**
   * #2770 (#2101.14) — LE CLASSEMENT PAR PRIORITÉ, pour choisir à qui
   * proposer un créneau en premier. `@WorkspaceRead` (D39), même raison que
   * `since-last-visit` ci-dessus : une LECTURE de portefeuille, aucune
   * écriture, aucun crédit dépensé — la matrice n'a aucune permission de
   * lecture à lui donner.
   */
  @Get('slot-proposal-priority-accounts')
  @WorkspaceRead()
  slotProposalPriorityAccounts(@CurrentUser() user: CurrentUserPayload): Promise<SlotProposalPriorityAccount[]> {
    return this.briefing.topAccountsForSlotProposal(user.userId)
  }

  /**
   * #2770 (#2101.19/.21/.22/.37) — les identifiants que la grille/le
   * plateau d'agenda partagés (`AgendaGrid`/`AgendaBoard`) croisent avec
   * `event.id` pour poser `AgendaEvent.createdByBellum`. `@WorkspaceRead`
   * (D39), même raison que les deux routes de lecture ci-dessus.
   */
  @Get('bellum-created-event-ids')
  @WorkspaceRead()
  async bellumCreatedEventIds(@CurrentUser() user: CurrentUserPayload): Promise<BellumCreatedEventIdsResponse> {
    return { eventIds: await this.briefing.listBellumCreatedEventIds(user.userId) }
  }
}

/**
 * #2151.24 — OÙ VIT LE DÉTAIL : sur l'objet, quand l'objet a un écran.
 *
 * `null` quand il n'y en a pas — une action sans destination s'affiche comme un
 * CONSTAT, ce qu'elle est. Une route devinée ouvrirait « Page introuvable », et
 * une route vers l'écran qu'on lit déjà ne ferait rien au clic : les deux se
 * lisent comme une panne.
 */
function hrefForDiscoverAlert(kind: DiscoverAlertEvent['kind'], subjectId: string | null): string | null {
  if (!subjectId) return null
  switch (kind) {
    case 'new_signal':
    case 'analysis_refreshed':
    case 'new_matching_company':
    case 'new_relationship':
    case 'new_access_path':
      return `/accounts/${subjectId}`
    case 'new_confirmed_need':
      return `/projects/${subjectId}`
    case 'mission_ended':
      return `/missions/${subjectId}`
  }
}
