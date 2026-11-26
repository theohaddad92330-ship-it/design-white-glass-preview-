import { BadRequestException, HttpException, Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  agendaEventDraftSchema,
  agendaRescheduleSchema,
  freeSlotsRequestSchema,
  type AgendaCalendar,
  type AgendaCalendarRef,
  type AgendaCalendars,
  type AgendaConflict,
  type AgendaDuplicateEvent,
  type AgendaEvent,
  type AgendaEventDraft,
  type AgendaOwnerUnavailableConflict,
  type AgendaProvider,
  type AgendaProximityConflict,
  type AgendaRangeRequest,
  type AgendaReschedule,
  type AgendaRescheduleResult,
  type AgendaStatus,
  type AgendaTravelConflict,
  type FreeSlot,
  type FreeSlotsRequest,
} from '@bellum/contracts'
import { classifyProviderError, connectorFailure, connectorMessage } from '../../common/connector-error'
import { ShortTtlCache } from '../../common/short-ttl-cache'
import { mapWithConcurrency } from '../../common/util/concurrency'

/** Lectures d'agenda simultanées : « Tous mes agendas » peut en compter vingt. */
const CALENDAR_READ_CONCURRENCY = 5
import { ProfileEntity } from '../../database/entities/profile.entity'
import { demoAgendaCalendarListing, demoAgendaWindow } from '../demo/demo-agenda'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { AGENDA_BACKENDS, type AgendaBackend, type AgendaCreateResult, type AgendaReadScope } from './agenda-backend'
import {
  computeFreeSlots,
  detectConflicts,
  detectDuplicateEvents,
  detectOwnerUnavailableConflicts,
  detectProximityConflicts,
  detectTravelConflicts,
} from './free-slots'

/**
 * Le titre d'un évènement : « Société — sujet » (garde-fou n°17).
 *
 * Le préfixe est sauté quand le titre nomme DÉJÀ la société : « ACME — ACME :
 * cadrage » serait pire que pas de préfixe du tout. Exporté pour être testé
 * sans réseau.
 */
export function titleFor(draft: { summary: string; accountName?: string }): string {
  const account = draft.accountName?.trim()
  if (!account) return draft.summary
  const normalized = (value: string) => value.toLowerCase().replace(/\s+/g, ' ')
  if (normalized(draft.summary).includes(normalized(account))) return draft.summary
  return `${account} — ${draft.summary}`
}

/** Fenêtre par défaut quand l'appelant n'en donne pas : la semaine qui vient. */
const DEFAULT_WINDOW_DAYS = 7

/** Un fournisseur branché qui n'a pas répondu, et pourquoi. */
type AgendaUnavailable = { provider: AgendaProvider; reason: string; calendarName: string | null }

/** `provider:id` — un identifiant d'agenda n'est unique que chez son fournisseur. */
export function calendarKey(ref: { provider: string; calendarId: string }): string {
  return `${ref.provider}:${ref.calendarId}`
}

/**
 * Une paire (fournisseur, identifiant) venue de la base, rendue sûre.
 *
 * Le fournisseur est une énumération FERMÉE côté code mais une colonne libre
 * côté base : une valeur inconnue ne doit pas se retrouver envoyée à un
 * backend qui n'existe pas, elle doit disparaître de la préférence.
 */
function toCalendarRef(provider: unknown, calendarId: unknown): AgendaCalendarRef | null {
  if (typeof provider !== 'string' || typeof calendarId !== 'string' || !calendarId) return null
  if (provider !== 'google' && provider !== 'microsoft') return null
  return { provider, calendarId }
}

/** Le même agenda coché deux fois ne doit pas être LU deux fois. */
function dedupeRefs(refs: AgendaCalendarRef[]): AgendaCalendarRef[] {
  const seen = new Set<string>()
  return refs.filter(ref => {
    const key = calendarKey(ref)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Ce que rend une lecture d'agenda quand on veut aussi savoir ce qui manque. */
type AgendaReadResult = { events: AgendaEvent[]; unavailable: AgendaUnavailable[] }

/**
 * L'API du fournisseur est-elle simplement ÉTEINTE côté administrateur ?
 *
 * Le cas s'est produit en production et a coûté des jours : le compte était
 * connecté, les portées accordées, le statut disait « lecture : oui » — et
 * chaque lecture rendait un 500 opaque parce que l'API Agenda n'avait jamais
 * été activée sur le projet. Un « erreur interne » envoie chercher un bug dans
 * le code ; le fournisseur, lui, dit la vérité en clair. On la relaie.
 */
// La détection vit désormais dans `common/connector-error` : elle servait à
// l'agenda seul alors que le même message peut sortir de n'importe quelle API
// Google éteinte — Drive et Sheets compris.

/**
 * L'échec d'une lecture d'agenda, dit à l'utilisateur.
 *
 * Deux choses ne doivent pas sortir d'ici : une trace technique (elle appartient
 * aux logs) et le nom de l'éditeur (règle produit : l'app nomme la CAPACITÉ,
 * seul Réglages › Intégrations nomme l'outil). Ce qui doit sortir, c'est la
 * seule information actionnable : est-ce à réessayer, ou est-ce un accès à
 * rouvrir ?
 */
export function agendaReadFailure(error: unknown): HttpException {
  const code = classifyProviderError(error)
  return connectorFailure({
    code,
    // L'agenda est une CAPACITÉ à deux fournisseurs possibles ; le champ dit
    // lequel a échoué sans que le message ne le nomme jamais.
    provider: 'agenda',
    capability: 'calendar',
    message:
      code === 'provider_api_disabled'
        ? "L'accès à ton agenda est éteint côté fournisseur : l'API Agenda n'est pas activée pour le compte connecté. Rouvre cet accès, puis réessaie."
        : connectorMessage(code, 'ton agenda'),
  })
}

/** Ce que rendent les fournisseurs — sans la préférence, qui se relit toujours. */
type ProviderListing = Pick<AgendaCalendars, 'calendars' | 'unavailable'>

/**
 * « Ton agenda » — une capacité, deux fournisseurs possibles, un seul contrat.
 *
 * Le service ne fait que trois choses : choisir l'agenda connecté, borner la
 * fenêtre demandée, et laisser les calculs purs (créneaux, conflits) opérer sur
 * ce que le fournisseur a rendu. Tout ce qui ressemble à une règle métier —
 * ce qu'est un jour ouvré, ce qu'est un conflit — est dans `free-slots.ts`,
 * testable sans réseau.
 */
@Injectable()
export class AgendaService {
  private readonly logger = new Logger(AgendaService.name)
  private readonly listingCache = new ShortTtlCache<ProviderListing>(60_000)

  constructor(
    @Inject(AGENDA_BACKENDS) private readonly backends: AgendaBackend[],
    @InjectRepository(ProfileEntity) private readonly profiles: Repository<ProfileEntity>,
    /**
     * Optionnel À DESSEIN : le module agenda reste autonome (règle #7) et ses
     * tests le construisent sans espace de travail. Absent, il ne se passe
     * rien de plus qu'avant — aucun chemin de démonstration ne s'ouvre.
     */
    @Optional() private readonly workspaceContext?: WorkspaceContextService,
  ) {}

  /** Sommes-nous dans une salle de démonstration ? Une panne de cette lecture
   *  répond « non » : servir un jeu fictif à un vrai compte serait pire que
   *  tout ce qu'une erreur peut coûter. */
  private async isDemo(userId: string): Promise<boolean> {
    if (!this.workspaceContext) return false
    try {
      return await this.workspaceContext.isDemoWorkspace(userId)
    } catch (error) {
      this.logger.warn(`Demo workspace probe failed: ${(error as Error).message}`)
      return false
    }
  }

  async status(userId: string): Promise<AgendaStatus> {
    // En salle de démonstration l'agenda est SERVI mais en lecture seule : un
    // visiteur ne branche pas l'agenda de son entreprise sur un lien qu'on lui
    // a envoyé, et rien de ce qu'il fait ne doit atterrir dans un vrai agenda.
    if (await this.isDemo(userId)) {
      return { connected: true, provider: 'google', capabilities: { read: true, write: false } }
    }
    const connected = await this.connectedBackend(userId)
    return connected?.status ?? { connected: false, provider: null, capabilities: { read: false, write: false } }
  }

  /**
   * Le backend à lire.
   *
   * `provider` explicite d'abord (l'appelant sait ce qu'il veut), le
   * fournisseur choisi ensuite, sinon le premier connecté. Un fournisseur
   * demandé mais non connecté est une ERREUR et non un repli silencieux sur
   * l'autre : rendre l'agenda Google à qui a demandé Outlook, c'est répondre à
   * côté sans le dire.
   *
   * #3973 — un fournisseur décoché pour ce fil (`excluded`, « Outils et
   * sources ») n'est jamais servi : il compte comme non connecté.
   */
  private async connectedBackend(
    userId: string,
    provider?: AgendaProvider,
    excluded: ReadonlySet<AgendaProvider> = new Set(),
  ): Promise<{ backend: AgendaBackend; status: AgendaStatus } | null> {
    const connected: Array<{ backend: AgendaBackend; status: AgendaStatus }> = []
    for (const backend of this.backends) {
      try {
        const status = await backend.status(userId)
        if (status?.connected && !(status.provider && excluded.has(status.provider))) {
          connected.push({ backend, status })
        }
      } catch (error) {
        this.logger.warn(`Agenda status probe failed: ${(error as Error).message}`)
      }
    }
    if (!connected.length) return null
    if (provider) return connected.find(entry => entry.status.provider === provider) ?? null
    return connected[0] ?? null
  }

  /**
   * Ce que l'utilisateur a choisi de lire : une liste d'agendas, tous, ou rien
   * (auquel cas on lit l'agenda par défaut du compte, comme avant).
   *
   * Les colonnes historiques (`agenda_provider` + `agenda_calendar_id`) sont
   * encore lues en REPLI. La migration les a reprises dans la liste, mais un
   * profil créé entre-temps par un autre chemin — ou une reprise qui n'aurait
   * pas tourné — ne doit pas faire perdre son agenda à quelqu'un en silence.
   */
  private async readPreference(userId: string): Promise<{ refs: AgendaCalendarRef[]; readsAll: boolean }> {
    const profile = await this.profiles.findOne({
      where: { user_id: userId },
      select: ['id', 'user_id', 'agenda_provider', 'agenda_calendar_id', 'agenda_calendar_ids', 'agenda_read_all'],
    })
    const readsAll = Boolean(profile?.agenda_read_all)

    const stored = Array.isArray(profile?.agenda_calendar_ids) ? profile.agenda_calendar_ids : []
    const refs = stored.flatMap(entry => {
      const ref = toCalendarRef(entry?.provider, entry?.calendarId)
      return ref ? [ref] : []
    })
    if (refs.length) return { refs: dedupeRefs(refs), readsAll }

    const legacy = toCalendarRef(profile?.agenda_provider, profile?.agenda_calendar_id)
    return { refs: legacy ? [legacy] : [], readsAll }
  }

  /**
   * Tous les agendas lisibles, tous fournisseurs connectés confondus.
   *
   * Un fournisseur qui échoue n'en fait pas tomber un autre, et surtout il est
   * NOMMÉ dans `unavailable` : une liste courte parce qu'un appel a raté se lit
   * « je n'ai qu'un agenda », ce qui est faux.
   */
  async listCalendars(userId: string, options: { fresh?: boolean } = {}): Promise<AgendaCalendars> {
    // Perf 29/09/2026 (`GET /agenda/calendars` 1,5-2,4 s en prod) : la préférence
    // (une lecture SQL), le test « démo » (deux SQL) et les fournisseurs
    // (appels SORTANTS) étaient en série ; ils partent ensemble. Un appel perdu
    // (salle de démonstration) vaut mieux qu'un aller-retour de plus, et
    // `readProviderListing` ne lève jamais : une panne d'un fournisseur se dit
    // dans `unavailable`, elle ne casse pas les deux autres lectures.
    const [preference, demo, listing] = await Promise.all([
      this.readPreference(userId),
      this.isDemo(userId),
      this.readProviderListing(userId, options.fresh === true),
    ])
    if (demo) {
      // Plusieurs agendas, dont un « Jours fériés » : la démonstration doit
      // montrer qu'on CHOISIT ceux qu'on lit, et l'agenda qu'on ne veut pas
      // voir est le meilleur argument de la fonctionnalité.
      return { ...demoAgendaCalendarListing(), selectedCalendars: preference.refs, readsAll: preference.readsAll }
    }
    const result: AgendaCalendars = {
      calendars: [...listing.calendars],
      selectedCalendars: preference.refs,
      readsAll: preference.readsAll,
      unavailable: [...listing.unavailable],
    }

    // Un choix qui ne correspond à aucun agenda RENDU n'est pas effacé : le
    // fournisseur peut simplement n'avoir pas répondu ce coup-ci, et oublier le
    // choix de l'utilisateur pour une panne passagère serait pire que de le
    // garder.
    return result
  }

  /**
   * Les agendas de CHAQUE fournisseur connecté, interrogés ENSEMBLE.
   *
   * Retenue 60 s par personne (`u:<userId>`) — une liste de fournisseurs change
   * quand on connecte ou déconnecte un compte, pas d'une seconde à l'autre — et
   * JAMAIS quand l'un d'eux n'a pas répondu : une liste courte pour cause de
   * panne ne doit pas se figer une minute. `fresh` (choix d'un agenda) contourne
   * la mémoire : accepter ou refuser un choix sur une liste périmée serait faux.
   * Le fournisseur reste NOMMÉ dans `unavailable` (jamais « un seul agenda »).
   */
  private readProviderListing(userId: string, fresh: boolean): Promise<ProviderListing> {
    const key = `u:${userId}`
    if (fresh) this.listingCache.invalidate(key)
    return this.listingCache.getOrLoad(
      key,
      () => this.loadProviderListing(userId),
      listing => listing.unavailable.length === 0,
    )
  }

  private async loadProviderListing(userId: string): Promise<ProviderListing> {
    const perBackend = await Promise.all(
      this.backends.map(async (backend): Promise<ProviderListing> => {
        let status: AgendaStatus | null = null
        try {
          status = await backend.status(userId)
        } catch (error) {
          this.logger.warn(`Agenda status probe failed: ${(error as Error).message}`)
          return { calendars: [], unavailable: [] }
        }
        if (!status?.connected || !status.capabilities.read || !status.provider) {
          return { calendars: [], unavailable: [] }
        }
        try {
          return { calendars: await backend.listCalendars(userId), unavailable: [] }
        } catch (error) {
          this.logger.error(`Agenda list calendars failed (${status.provider}): ${(error as Error).message}`)
          return {
            calendars: [],
            unavailable: [{ provider: status.provider, reason: 'calendars_unavailable', calendarName: null }],
          }
        }
      }),
    )
    // L'ordre des fournisseurs (`this.backends`) est conservé : `Promise.all`
    // rend dans l'ordre des entrées, quel que soit celui des réponses.
    return {
      calendars: perBackend.flatMap(entry => entry.calendars),
      unavailable: perBackend.flatMap(entry => entry.unavailable),
    }
  }

  /**
   * Choisir l'agenda lu.
   *
   * La référence est vérifiée contre ce que le fournisseur liste RÉELLEMENT :
   * accepter un identifiant qu'on n'a jamais vu produirait un écran vide et
   * durable, sans rien pour le diagnostiquer.
   */
  async selectCalendar(userId: string, ref: AgendaCalendarRef): Promise<AgendaCalendars> {
    return this.selectCalendars(userId, [ref])
  }

  /**
   * Choisir LES agendas lus.
   *
   * Chaque référence est vérifiée contre ce que les fournisseurs listent
   * RÉELLEMENT, et une seule inconnue fait échouer tout le choix. Accepter les
   * bonnes en silence et jeter la mauvaise produirait une journée amputée d'un
   * agenda que l'utilisateur croit coché — le pire des deux mondes, parce que
   * rien à l'écran ne le dirait.
   */
  async selectCalendars(userId: string, refs: AgendaCalendarRef[]): Promise<AgendaCalendars> {
    const wanted = dedupeRefs(refs)
    if (!wanted.length) throw new BadRequestException('Choisis au moins un agenda.')

    const available = await this.listCalendars(userId, { fresh: true })
    const known = new Set(available.calendars.map(calendar => calendarKey({ ...calendar, calendarId: calendar.id })))
    const unknown = wanted.filter(ref => !known.has(calendarKey(ref)))
    if (unknown.length) {
      // Un agenda absent de la liste PARCE QUE son fournisseur n'a pas répondu
      // n'est pas un mauvais choix, c'est une panne — et refuser sans le dire
      // enverrait chercher l'erreur du mauvais côté.
      throw new BadRequestException(
        available.unavailable.length
          ? "Un de tes agendas n'a pas répondu : ce choix n'a pas pu être vérifié. Réessaie dans un moment."
          : "Cet agenda n'est pas dans la liste de tes agendas lisibles.",
      )
    }

    // `agenda_read_all` retombe : cocher trois agendas et en lire dix seraient
    // deux réponses contradictoires à la même question. Les colonnes
    // historiques sont vidées pour la même raison.
    await this.profiles.update(
      { user_id: userId },
      {
        agenda_provider: null,
        agenda_calendar_id: null,
        agenda_calendar_ids: wanted,
        agenda_read_all: false,
      },
    )
    return { ...available, selectedCalendars: wanted, readsAll: false }
  }

  /**
   * Lire TOUS les agendas lisibles.
   *
   * Le choix d'un agenda unique est effacé : le garder « au cas où » ferait
   * réapparaître un jour une journée amputée sans que personne ne se souvienne
   * pourquoi.
   */
  async selectAllCalendars(userId: string): Promise<AgendaCalendars> {
    await this.profiles.update(
      { user_id: userId },
      { agenda_provider: null, agenda_calendar_id: null, agenda_calendar_ids: null, agenda_read_all: true },
    )
    const available = await this.listCalendars(userId)
    return { ...available, selectedCalendars: [], readsAll: true }
  }

  /** Revenir à l'agenda par défaut du compte. */
  async clearSelectedCalendar(userId: string): Promise<void> {
    await this.profiles.update(
      { user_id: userId },
      { agenda_provider: null, agenda_calendar_id: null, agenda_calendar_ids: null, agenda_read_all: false },
    )
  }

  /** Borne la fenêtre demandée, avec des défauts utiles plutôt qu'une erreur. */
  private resolveWindow(request: AgendaRangeRequest): { from: Date; to: Date } {
    const from = request.from ? new Date(request.from) : new Date()
    const to = request.to ? new Date(request.to) : new Date(from.getTime() + DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Fenêtre de dates invalide.')
    }
    if (to <= from) throw new BadRequestException('La fin de la fenêtre doit être postérieure à son début.')
    return { from, to }
  }

  /**
   * Les évènements de la fenêtre — et ce qu'on n'a PAS pu lire.
   *
   * Les deux voyagent ensemble parce qu'ils ne se déduisent pas l'un de
   * l'autre : une liste vide peut vouloir dire « journée calme » ou « l'agenda
   * qui la remplissait n'a pas répondu », et seul l'appelant qui a les deux
   * peut le dire honnêtement à l'écran.
   *
   * #3973 — `scope.excludedProviders` : les agendas décochés pour ce fil
   * (« Outils et sources »). Aucun chemin ne les lit — ni le défaut, ni un choix
   * enregistré chez eux (qui cède alors la place au suivant branché), ni « tous »,
   * ni le repli — et ils ne sont pas nommés indisponibles : ils sont hors sujet.
   */
  async listEventsDetailed(
    userId: string,
    request: AgendaRangeRequest,
    scope: AgendaReadScope = {},
  ): Promise<AgendaReadResult> {
    const excluded: ReadonlySet<AgendaProvider> = new Set(scope.excludedProviders ?? [])
    // La demande explicite prime sur la préférence enregistrée ; la préférence
    // prime sur le défaut du compte. L'ordre compte : sans lui, l'écran qui
    // demande un agenda précis se verrait servir celui du profil.
    const explicit = Boolean(request.calendarId ?? request.provider)
    const preference = explicit ? { refs: [], readsAll: false } : await this.readPreference(userId)

    if (await this.isDemo(userId)) {
      const window = this.resolveWindow(request)
      const chosen = preference.readsAll || !preference.refs.length ? null : preference.refs.map(ref => ref.calendarId)
      return {
        events: demoAgendaWindow({ now: new Date(), from: window.from, to: window.to, calendarIds: chosen }).slice(
          0,
          request.limit,
        ),
        unavailable: [],
      }
    }

    const readsAll = request.allCalendars ?? preference.readsAll
    if (readsAll) return this.readEveryCalendar(userId, request, excluded)
    const refs = preference.refs.filter(ref => !excluded.has(ref.provider))
    // Plusieurs agendas cochés : la journée est leur UNION. Un seul coché passe
    // par le chemin historique — il n'a pas besoin de lister les agendas du
    // compte pour lire celui qu'on lui a désigné.
    if (refs.length > 1) return this.readSelectedCalendars(userId, request, refs, excluded)

    const stored = refs[0]
    const provider = request.provider ?? stored?.provider
    const calendarId = request.calendarId ?? stored?.calendarId

    const connected = await this.connectedBackend(userId, provider, excluded)
    if (!connected) {
      throw new BadRequestException(
        provider ? "Cet agenda n'est plus connecté. Reconnecte-le depuis Intégrations." : 'Aucun agenda connecté.',
      )
    }
    if (!connected.status.capabilities.read) {
      throw new BadRequestException(
        "L'agenda connecté ne donne pas accès à la lecture. Reconnecte-le pour activer cette fonction.",
      )
    }
    const window = this.resolveWindow(request)
    // L'identifiant part sans risque de croisement : quand un fournisseur est
    // demandé, `connectedBackend` a déjà refusé de servir l'autre — un
    // identifiant Google envoyé à Graph produirait un 404 illisible.
    const read = (backend: AgendaBackend, id?: string) =>
      backend.listEvents(userId, {
        from: window.from.toISOString(),
        to: window.to.toISOString(),
        limit: request.limit,
        ...(request.query ? { query: request.query } : {}),
        ...(id ? { calendarId: id } : {}),
      })

    try {
      return { events: await read(connected.backend, calendarId), unavailable: [] }
    } catch (error) {
      // Un fournisseur DEMANDÉ qui échoue reste un échec : basculer sur l'autre
      // reviendrait à répondre à côté sans le dire.
      if (provider) throw agendaReadFailure(error)

      // Personne n'a rien choisi : le premier fournisseur de la liste n'est pas
      // un choix de l'utilisateur, c'est un ordre de déclaration. Le voir tomber
      // et afficher « agenda indisponible » alors qu'un AUTRE agenda connecté
      // répond, c'est vider la journée de quelqu'un pour une raison qui ne le
      // concerne pas. Constaté en production : l'API Calendar du premier
      // fournisseur était désactivée, le second marchait, le brief est resté
      // vide des jours.
      this.logger.error(
        `Agenda read failed (${connected.status.provider}), trying the next connected one: ${(error as Error).message}`,
        { error, tags: { 'agenda.provider': String(connected.status.provider) } },
      )
      const failed: AgendaUnavailable[] = connected.status.provider
        ? [{ provider: connected.status.provider, reason: 'events_unavailable', calendarName: null }]
        : []
      const fallback = await this.nextReadableBackend(userId, connected.status.provider, excluded)
      if (!fallback) throw agendaReadFailure(error)
      // Le repli RÉPOND, mais il ne répond pas la même chose : c'est la journée
      // d'un AUTRE agenda. Elle est servie, et l'agenda muet est nommé — sans
      // quoi « aucun rendez-vous » se lirait « rien de prévu » alors que la
      // journée est peut-être pleine, ailleurs.
      return { events: await read(fallback.backend), unavailable: failed }
    }
  }

  /** L'API historique : les évènements seuls, pour les appelants qui n'ont rien
   *  à dire d'une source manquante (créneaux libres, conflits, copilote). */
  async listEvents(userId: string, request: AgendaRangeRequest, scope: AgendaReadScope = {}): Promise<AgendaEvent[]> {
    return (await this.listEventsDetailed(userId, request, scope)).events
  }

  /**
   * TOUS les agendas lisibles, d'un coup.
   *
   * Trois règles portent l'honnêteté de cette lecture. Un agenda qui tombe ne
   * fait pas tomber les autres, mais il est NOMMÉ. Le même évènement vu depuis
   * deux agendas (celui de l'équipe et le sien) n'est compté qu'une fois —
   * sinon la journée paraît deux fois plus chargée qu'elle ne l'est. Et si
   * AUCUN agenda ne répond, on lève : rendre une liste vide ferait passer une
   * panne totale pour une journée calme.
   */
  private async readEveryCalendar(
    userId: string,
    request: AgendaRangeRequest,
    excluded: ReadonlySet<AgendaProvider>,
  ): Promise<AgendaReadResult> {
    const listing = await this.listCalendars(userId)
    return this.readCalendarSet(
      userId,
      request,
      listing.calendars.filter(calendar => !excluded.has(calendar.provider)),
      listing.unavailable.filter(entry => !excluded.has(entry.provider)),
    )
  }

  /**
   * Les agendas COCHÉS, et eux seuls.
   *
   * Un agenda coché qui a disparu de la liste (partage retiré, agenda
   * supprimé) n'est pas une erreur qui doit vider la journée : les autres sont
   * lus et celui-là est NOMMÉ dans `unavailable`. Le contraire — tomber sur
   * l'agenda manquant — punirait l'utilisateur pour une décision prise par
   * quelqu'un d'autre.
   */
  private async readSelectedCalendars(
    userId: string,
    request: AgendaRangeRequest,
    refs: AgendaCalendarRef[],
    excluded: ReadonlySet<AgendaProvider>,
  ): Promise<AgendaReadResult> {
    const listing = await this.listCalendars(userId)
    const known = new Map(
      listing.calendars.map(calendar => [calendarKey({ ...calendar, calendarId: calendar.id }), calendar]),
    )
    const unavailable: AgendaUnavailable[] = listing.unavailable.filter(entry => !excluded.has(entry.provider))
    const chosen: AgendaCalendar[] = []

    for (const ref of refs) {
      const calendar = known.get(calendarKey(ref))
      if (calendar) {
        chosen.push(calendar)
        continue
      }
      // Le fournisseur a peut-être simplement échoué à lister ses agendas :
      // dans ce cas il est déjà dans `unavailable`, ne l'y mettons pas deux
      // fois sous une autre raison.
      if (unavailable.some(entry => entry.provider === ref.provider)) continue
      unavailable.push({ provider: ref.provider, reason: 'calendar_missing', calendarName: null })
    }

    if (!chosen.length) {
      if (unavailable.length) throw agendaReadFailure(new Error('every selected calendar is unreadable'))
      throw new BadRequestException("Aucun de tes agendas choisis n'est lisible. Choisis-en un autre.")
    }
    return this.readCalendarSet(userId, request, chosen, unavailable)
  }

  /** La lecture parallèle d'un ensemble d'agendas — celui de « tous » comme
   *  celui des agendas cochés : une seule définition de « union honnête ». */
  private async readCalendarSet(
    userId: string,
    request: AgendaRangeRequest,
    calendars: AgendaCalendar[],
    knownUnavailable: AgendaUnavailable[],
  ): Promise<AgendaReadResult> {
    const window = this.resolveWindow(request)
    const unavailable: AgendaUnavailable[] = [...knownUnavailable]

    if (!calendars.length) {
      if (unavailable.length) throw agendaReadFailure(new Error('every calendar source failed'))
      throw new BadRequestException('Aucun agenda connecté.')
    }

    const byProvider = new Map<AgendaProvider, AgendaBackend>()
    for (const backend of this.backends) {
      try {
        const status = await backend.status(userId)
        if (status?.connected && status.capabilities.read && status.provider) {
          byProvider.set(status.provider, backend)
        }
      } catch {
        // Déjà signalé par `listCalendars` : un fournisseur qui ne sait pas dire
        // s'il est branché est sorti de la liste, pas compté deux fois.
      }
    }

    // Borné : « Tous mes agendas » peut en compter vingt, et vingt lectures
    // simultanées sur le même compte se font refuser pour débit — l'erreur
    // sortirait alors comme « agenda indisponible » sur des agendas qui vont
    // très bien.
    const reads = await mapWithConcurrency(calendars, CALENDAR_READ_CONCURRENCY, async calendar => {
      const backend = byProvider.get(calendar.provider)
      if (!backend) return null
      try {
        return await backend.listEvents(userId, {
          from: window.from.toISOString(),
          to: window.to.toISOString(),
          limit: request.limit,
          ...(request.query ? { query: request.query } : {}),
          calendarId: calendar.id,
        })
      } catch (error) {
        this.logger.error(`Agenda read failed for one calendar (${calendar.provider}): ${(error as Error).message}`, {
          error,
          tags: { 'agenda.provider': calendar.provider },
        })
        unavailable.push({
          provider: calendar.provider,
          reason: 'events_unavailable',
          calendarName: calendar.name,
        })
        return null
      }
    })

    const answered = reads.filter((events): events is AgendaEvent[] => events !== null)
    if (!answered.length) throw agendaReadFailure(new Error('every calendar source failed'))

    const seen = new Set<string>()
    const events: AgendaEvent[] = []
    for (const event of answered.flat()) {
      if (seen.has(event.id)) continue
      seen.add(event.id)
      events.push(event)
    }
    // Un évènement sans date exploitable passe en fin de liste plutôt que d'être
    // jeté : il existe, on ne sait juste pas quand.
    const startOf = (event: AgendaEvent) => (event.start ? Date.parse(event.start) : Number.POSITIVE_INFINITY)
    events.sort((first, second) => {
      const a = startOf(first)
      const b = startOf(second)
      return Number.isNaN(a) || Number.isNaN(b) ? 0 : a - b
    })

    return { events: events.slice(0, request.limit), unavailable }
  }

  /** Le prochain agenda connecté et lisible, autre que celui qui vient d'échouer. */
  private async nextReadableBackend(
    userId: string,
    failedProvider: AgendaProvider | null,
    excluded: ReadonlySet<AgendaProvider>,
  ): Promise<{ backend: AgendaBackend; status: AgendaStatus } | null> {
    for (const backend of this.backends) {
      try {
        const status = await backend.status(userId)
        if (!status?.connected || !status.capabilities.read) continue
        if (status.provider === failedProvider) continue
        // #3973 — un agenda décoché pour ce fil n'est pas un repli.
        if (status.provider && excluded.has(status.provider)) continue
        return { backend, status }
      } catch {
        // Un fournisseur qui ne sait même pas dire s'il est branché n'est pas un
        // repli : on passe au suivant.
      }
    }
    return null
  }

  /**
   * Les créneaux libres.
   *
   * Le calcul lit TOUS les évènements de la fenêtre, y compris ceux qui n'ont
   * rien à voir avec le compte cherché : un créneau n'est pas libre parce que ce
   * qui l'occupe est hors sujet. C'est pour ça que la recherche plein texte
   * n'est pas propagée ici.
   */
  async freeSlots(userId: string, input: FreeSlotsRequest, scope: AgendaReadScope = {}): Promise<FreeSlot[]> {
    const request = freeSlotsRequestSchema.parse(input)
    const window = this.resolveWindow({ ...request, limit: 250 } as AgendaRangeRequest)
    const events = await this.listEvents(
      userId,
      { from: window.from.toISOString(), to: window.to.toISOString(), limit: 250 },
      scope,
    )
    return computeFreeSlots(events, window, request)
  }

  async conflicts(userId: string, request: AgendaRangeRequest): Promise<AgendaConflict[]> {
    const events = await this.listEvents(userId, request)
    return detectConflicts(events)
  }

  /**
   * Les enchaînements trop serrés — #2390.5. Une route SÉPARÉE de
   * `conflicts()` : un type de retour distinct (`AgendaProximityConflict`,
   * pas `AgendaConflict`), pour ne jamais faire dire « se chevauchent » à deux
   * évènements qui, justement, ne se chevauchent pas.
   */
  async proximityConflicts(userId: string, request: AgendaRangeRequest): Promise<AgendaProximityConflict[]> {
    const events = await this.listEvents(userId, request)
    return detectProximityConflicts(events)
  }

  /** Les évènements en double — #2390.7. */
  async duplicateEvents(userId: string, request: AgendaRangeRequest): Promise<AgendaDuplicateEvent[]> {
    const events = await this.listEvents(userId, request)
    return detectDuplicateEvents(events)
  }

  /** Les temps de déplacement impossibles — #2390.3. */
  async travelConflicts(userId: string, request: AgendaRangeRequest): Promise<AgendaTravelConflict[]> {
    const events = await this.listEvents(userId, request)
    return detectTravelConflicts(events)
  }

  /** Les rendez-vous qui tombent sur un bloc d'indisponibilité du propriétaire — #2390.6. */
  async ownerUnavailableConflicts(
    userId: string,
    request: AgendaRangeRequest,
  ): Promise<AgendaOwnerUnavailableConflict[]> {
    const events = await this.listEvents(userId, request)
    return detectOwnerUnavailableConflicts(events)
  }

  /**
   * Crée un évènement.
   *
   * Les deux garde-fous non négociables (ne pas s'auto-inviter, poser un lien
   * visio) vivent dans les backends, au plus près de l'API qui les applique —
   * pas ici, où un appelant pourrait les contourner en passant par le service
   * d'à côté.
   *
   * La création reste sur l'agenda PAR DÉFAUT du compte, même quand la lecture
   * suit un autre agenda : déposer un rendez-vous dans l'agenda partagé d'une
   * équipe parce qu'on était en train de le consulter n'est pas rattrapable
   * discrètement — tout le monde reçoit l'invitation.
   */
  async createEvent(userId: string, input: AgendaEventDraft): Promise<AgendaCreateResult> {
    // En salle de démonstration, rien ne part : l'agenda y est LU, jamais
    // écrit. Un évènement créé depuis une démo atterrirait dans l'agenda de
    // l'opérateur, avec les invités que le visiteur aurait tapés.
    if (await this.isDemo(userId)) {
      throw new BadRequestException("Cet espace est une démonstration : l'agenda s'y consulte, il ne s'y écrit pas.")
    }
    const draft = agendaEventDraftSchema.parse(input)
    if (Date.parse(draft.endsAt) <= Date.parse(draft.startsAt)) {
      throw new BadRequestException("La fin de l'évènement doit être postérieure à son début.")
    }
    const connected = await this.connectedBackend(userId)
    if (!connected) throw new BadRequestException('Aucun agenda connecté.')
    if (!connected.status.capabilities.write) {
      throw new BadRequestException(
        "L'agenda connecté n'autorise pas la création d'évènements. Reconnecte-le pour activer cette fonction.",
      )
    }
    // #2101.26 — un contrat que le fournisseur connecté ne sait pas honorer
    // n'est jamais relayé en silence : le rendez-vous se créerait unique,
    // sans que personne ne le sache. Absente, la capacité se lit « pas
    // honoré », le cas prudent (même motif que `customReminder`).
    if (draft.recurrence && connected.status.capabilities.recurrence !== true) {
      throw new BadRequestException(
        "L'agenda connecté ne sait pas créer d'évènement récurrent. Crée un évènement unique, ou choisis un agenda qui le permet.",
      )
    }
    // #2101.27 — un calendrier cible n'est jamais deviné : il doit exister
    // dans ce que le fournisseur RENDT réellement, et accepter l'écriture.
    if (draft.calendarId) {
      const calendars = await connected.backend.listCalendars(userId)
      const target = calendars.find(entry => entry.id === draft.calendarId)
      if (!target) {
        throw new BadRequestException("Cet agenda n'est pas dans la liste de tes agendas lisibles.")
      }
      if (!target.canWrite) {
        throw new BadRequestException('Cet agenda est en lecture seule : choisis-en un autre pour créer un évènement.')
      }
    }
    return connected.backend.createEvent(userId, { ...draft, summary: titleFor(draft) })
  }

  /**
   * Déplacer un rendez-vous existant.
   *
   * C'est le geste le plus lourd de conséquences de tout l'agenda : il modifie
   * quelque chose que d'AUTRES personnes ont déjà, et selon le fournisseur il
   * leur envoie un courrier. D'où les quatre refus explicites ci-dessous —
   * chacun vaut mieux qu'un déplacement qui part et qu'on ne peut pas reprendre.
   *
   * La réponse porte `guestsNotified`, c'est-à-dire ce qui s'est RÉELLEMENT
   * passé et non ce qui a été demandé : un fournisseur qui prévient toujours le
   * dit ici, et l'écran peut l'annoncer au lieu de laisser croire à une
   * discrétion qui n'a pas eu lieu.
   */
  async rescheduleEvent(userId: string, input: AgendaReschedule): Promise<AgendaRescheduleResult> {
    // Même règle que la création : en démonstration, l'agenda se consulte. Un
    // déplacement toucherait l'agenda de l'opérateur et préviendrait ses
    // invités — de vraies personnes, depuis un espace partagé.
    if (await this.isDemo(userId)) {
      throw new BadRequestException("Cet espace est une démonstration : l'agenda s'y consulte, il ne s'y écrit pas.")
    }
    const move = agendaRescheduleSchema.parse(input)
    if (Date.parse(move.endsAt) <= Date.parse(move.startsAt)) {
      throw new BadRequestException("La fin de l'évènement doit être postérieure à son début.")
    }
    const connected = await this.connectedBackend(userId)
    if (!connected) throw new BadRequestException('Aucun agenda connecté.')
    if (!connected.status.capabilities.write) {
      throw new BadRequestException(
        "L'agenda connecté n'autorise pas la modification d'évènements. Reconnecte-le pour activer cette fonction.",
      )
    }
    return connected.backend.rescheduleEvent(userId, move)
  }

  /**
   * Annuler un évènement — #2770.52.
   *
   * Même garde que `createEvent`/`rescheduleEvent` : en démonstration,
   * l'agenda se consulte, il ne s'y écrit pas (et une annulation EST une
   * écriture). L'identifiant n'est jamais vérifié contre un compte ou un bloc
   * précis ici : c'est à l'appelant (`BriefingService.cancelFocusPlanBlock`)
   * de ne transmettre que l'identifiant qu'IL a lui-même écrit.
   */
  async deleteEvent(userId: string, eventId: string): Promise<void> {
    if (await this.isDemo(userId)) {
      throw new BadRequestException("Cet espace est une démonstration : l'agenda s'y consulte, il ne s'y écrit pas.")
    }
    const connected = await this.connectedBackend(userId)
    if (!connected) throw new BadRequestException('Aucun agenda connecté.')
    if (!connected.status.capabilities.write) {
      throw new BadRequestException(
        "L'agenda connecté n'autorise pas l'annulation d'évènements. Reconnecte-le pour activer cette fonction.",
      )
    }
    await connected.backend.deleteEvent(userId, eventId)
  }
}
