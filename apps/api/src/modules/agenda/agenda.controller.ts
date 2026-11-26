import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common'
import type {
  AgendaCalendars,
  AgendaConflict,
  AgendaDuplicateEvent,
  AgendaOwnerUnavailableConflict,
  AgendaProximityConflict,
  AgendaRescheduleResult,
  AgendaStatus,
  AgendaTravelConflict,
  AgendaWindow,
  FreeSlot,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import type { AgendaCreateResult } from './agenda-backend'
import { AgendaService } from './agenda.service'
import {
  AgendaCalendarRefDto,
  AgendaEventDraftDto,
  AgendaRangeQueryDto,
  AgendaRescheduleDto,
  AgendaSelectionDto,
  FreeSlotsQueryDto,
} from './dto/agenda.dto'

/**
 * « Ton agenda » — capacité provider-agnostique (Google Calendar ou Outlook).
 *
 * `@PersonalScope` : chaque route de ce contrôleur lit ou écrit l'agenda de
 * CELUI QUI APPELLE, avec sa propre connexion OAuth — depuis le 22/08, une
 * connexion d'agenda est personnelle et non partagée. Aucun autre membre de
 * l'espace ne peut voir quoi que ce soit par ici : la question que pose le
 * décorateur a donc une réponse claire, et une permission d'espace n'aurait
 * rien gardé de plus.
 */
@Controller('agenda')
@PersonalScope()
@UseGuards(JwtGuard)
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Get('status')
  status(@CurrentUser() user: CurrentUserPayload): Promise<AgendaStatus> {
    return this.agenda.status(user.userId)
  }

  /** Les agendas lisibles, tous fournisseurs connectés confondus, + celui qui est lu. */
  @Get('calendars')
  calendars(@CurrentUser() user: CurrentUserPayload): Promise<AgendaCalendars> {
    return this.agenda.listCalendars(user.userId)
  }

  /** Choisir l'agenda lu — par l'écran comme par le brief du jour. */
  @Put('calendar')
  selectCalendar(@CurrentUser() user: CurrentUserPayload, @Body() dto: AgendaCalendarRefDto): Promise<AgendaCalendars> {
    return this.agenda.selectCalendar(user.userId, dto)
  }

  /**
   * Choisir PLUSIEURS agendas.
   *
   * Le corps porte la liste entière et non un ajout : deux écrans ouverts en
   * même temps finiraient sinon par se contredire, et c'est l'utilisateur qui
   * découvrirait la divergence en cherchant un rendez-vous absent.
   */
  @Put('calendars')
  selectCalendars(@CurrentUser() user: CurrentUserPayload, @Body() dto: AgendaSelectionDto): Promise<AgendaCalendars> {
    return this.agenda.selectCalendars(user.userId, dto.calendars)
  }

  /**
   * Tout lire, plutôt que de choisir.
   *
   * Un commercial sous Workspace a couramment cinq agendas — le sien, celui de
   * l'équipe, un agenda de rendez-vous clients — et son prochain rendez-vous
   * peut être dans n'importe lequel. Lui faire désigner LE bon, c'est lui
   * demander de deviner.
   */
  @Put('calendars/all')
  selectAllCalendars(@CurrentUser() user: CurrentUserPayload): Promise<AgendaCalendars> {
    return this.agenda.selectAllCalendars(user.userId)
  }

  /** Revenir à l'agenda par défaut du compte. */
  @Delete('calendar')
  async clearCalendar(@CurrentUser() user: CurrentUserPayload): Promise<{ cleared: true }> {
    await this.agenda.clearSelectedCalendar(user.userId)
    return { cleared: true }
  }

  /**
   * La fenêtre demandée — évènements ET sources muettes.
   *
   * L'écran reçoit les deux parce qu'ils ne se déduisent pas l'un de l'autre :
   * une journée vide se lit « rien de prévu », et c'est faux quand l'agenda qui
   * la remplissait n'a pas répondu.
   */
  @Get('events')
  events(@CurrentUser() user: CurrentUserPayload, @Query() query: AgendaRangeQueryDto): Promise<AgendaWindow> {
    return this.agenda.listEventsDetailed(user.userId, query)
  }

  @Get('free-slots')
  freeSlots(@CurrentUser() user: CurrentUserPayload, @Query() query: FreeSlotsQueryDto): Promise<FreeSlot[]> {
    return this.agenda.freeSlots(user.userId, query)
  }

  @Get('conflicts')
  conflicts(@CurrentUser() user: CurrentUserPayload, @Query() query: AgendaRangeQueryDto): Promise<AgendaConflict[]> {
    return this.agenda.conflicts(user.userId, query)
  }

  /** #2390.5 — enchaînements trop serrés (moins de 15 minutes de battement),
   *  distincts d'un chevauchement d'horaire. */
  @Get('conflicts/proximity')
  proximityConflicts(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: AgendaRangeQueryDto,
  ): Promise<AgendaProximityConflict[]> {
    return this.agenda.proximityConflicts(user.userId, query)
  }

  /** #2390.7 — même créneau, même titre, deux identifiants différents. */
  @Get('conflicts/duplicates')
  duplicateEvents(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: AgendaRangeQueryDto,
  ): Promise<AgendaDuplicateEvent[]> {
    return this.agenda.duplicateEvents(user.userId, query)
  }

  /** #2390.3 — temps de déplacement impossible : deux rendez-vous en
   *  présentiel, à des lieux différents, sans le moindre battement entre eux. */
  @Get('conflicts/travel')
  travelConflicts(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: AgendaRangeQueryDto,
  ): Promise<AgendaTravelConflict[]> {
    return this.agenda.travelConflicts(user.userId, query)
  }

  /** #2390.6 — un rendez-vous qui tombe sur un bloc où son propriétaire s'est
   *  déclaré indisponible (`outOfOffice` Google, `showAs: oof` Microsoft). */
  @Get('conflicts/owner-unavailable')
  ownerUnavailableConflicts(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: AgendaRangeQueryDto,
  ): Promise<AgendaOwnerUnavailableConflict[]> {
    return this.agenda.ownerUnavailableConflicts(user.userId, query)
  }

  @Post('events')
  createEvent(@CurrentUser() user: CurrentUserPayload, @Body() dto: AgendaEventDraftDto): Promise<AgendaCreateResult> {
    return this.agenda.createEvent(user.userId, dto)
  }

  /**
   * Déplacer un rendez-vous. `PATCH` et non `PUT` : on ne remplace pas
   * l'évènement, on n'en change QUE les bornes — tout le reste appartient à
   * l'organisateur et peut avoir changé depuis qu'on l'a lu.
   */
  @Patch('events/:id')
  rescheduleEvent(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: AgendaRescheduleDto,
  ): Promise<AgendaRescheduleResult> {
    // L'identifiant vient du CHEMIN, jamais du corps : deux sources pour la
    // même chose finissent par diverger, et ici la divergence déplacerait le
    // mauvais rendez-vous.
    return this.agenda.rescheduleEvent(user.userId, { ...dto, eventId: id })
  }
}
