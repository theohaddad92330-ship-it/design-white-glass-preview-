import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common'
import type {
  NoReplyFollowUpDryRun,
  RoutineContentView,
  RoutineObservation,
  RoutineRunNowResult,
  RoutineRunView,
  RoutineView,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { UpdateRoutineContentDto, UpdateRoutineDto } from './dto/routines.dto'
import { RoutinesService } from './routines.service'

/**
 * Réglages › Routines — la surface qui rend les automatisations « visibles,
 * modifiables, désactivables » comme l'exige le rapport.
 */
@Controller('routines')
@UseGuards(JwtGuard)
// ⚠️ `@PersonalScope` sur la CLASSE (posé le 23/09/2026 avec #2205.49-52/.62) :
// les quatre routes de ce contrôleur servent, sans exception, la donnée de
// CELUI QUI APPELLE — ses routines (`user.userId`), leur historique
// (`listRuns`, la nouveauté du jour), leur activation/désactivation, leur
// déclenchement manuel. Aucun autre membre de l'espace ne voit quoi que ce
// soit grâce à elles. GA-05 comptait ces routes comme nues (`listRuns` a fait
// passer le cliquet de routes de 348 à 349) ; elles étaient DÉCLARABLES, pas
// oubliées — même nature que les réglages de notification (#1938.4).
@PersonalScope()
export class RoutinesController {
  constructor(private readonly routines: RoutinesService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload): Promise<RoutineView[]> {
    return this.routines.list(user.userId)
  }

  /**
   * #2205.49-52/.62 — l'historique d'une routine (au-delà du dernier résultat
   * que `list` expose déjà) : « logs audités » du critère de recette.
   */
  @Get(':key/runs')
  listRuns(@CurrentUser() user: CurrentUserPayload, @Param('key') key: string): Promise<RoutineRunView[]> {
    return this.routines.listRuns(user.userId, key)
  }

  /** #2843.18 (lot L13) — trente jours d'exécutions réelles, sans coût ni durée. */
  @Get(':key/observation')
  observation(@CurrentUser() user: CurrentUserPayload, @Param('key') key: string): Promise<RoutineObservation> {
    return this.routines.observation(user.userId, key)
  }

  @Patch(':key')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('key') key: string,
    @Body() dto: UpdateRoutineDto,
  ): Promise<RoutineView> {
    return this.routines.update(user.userId, key, dto)
  }

  /**
   * Déclenche maintenant les routines dues.
   *
   * Existe pour une raison très concrète : sans ce bouton, vérifier qu'une
   * routine marche demande d'attendre le lendemain matin. L'idempotence est la
   * même que celle du balayeur — appuyer deux fois ne poste pas deux fois.
   */
  /**
   * #2843.30 — le contenu (gabarit) d'une routine, réglé pour l'ESPACE de l'appelant :
   * mêmes droits que les autres réglages de routine. `DELETE` revient au défaut.
   */
  @Get(':key/content')
  content(@CurrentUser() user: CurrentUserPayload, @Param('key') key: string): Promise<RoutineContentView> {
    return this.routines.content(user.userId, key)
  }

  @Put(':key/content')
  setContent(
    @CurrentUser() user: CurrentUserPayload,
    @Param('key') key: string,
    @Body() dto: UpdateRoutineContentDto,
  ): Promise<RoutineContentView> {
    return this.routines.setContent(user.userId, key, dto)
  }

  @Delete(':key/content')
  resetContent(@CurrentUser() user: CurrentUserPayload, @Param('key') key: string): Promise<RoutineContentView> {
    return this.routines.resetContent(user.userId, key)
  }

  @Post('run-due')
  async runDue(@CurrentUser() user: CurrentUserPayload): Promise<{ executed: number }> {
    return { executed: await this.routines.runDueFor(user.userId) }
  }

  /**
   * #2843.10 (lot L13) — « lancer maintenant » UNE routine, hors horaire, depuis
   * sa fiche. Même moteur que le balayeur (réservation, trace, reprise) ; deux
   * clics dans la même minute n'exécutent qu'une fois.
   */
  @Post(':key/run-now')
  runNow(@CurrentUser() user: CurrentUserPayload, @Param('key') key: string): Promise<RoutineRunNowResult> {
    return this.routines.runNow(user.userId, key)
  }

  /**
   * #2398.13/#2205.38 — « Test (dry-run avant activation) », pour la seule
   * routine `no_reply_follow_up` (voir `RoutinesService.dryRunNoReplyFollowUp`).
   */
  @Get('no-reply-follow-up/dry-run')
  dryRunNoReplyFollowUp(@CurrentUser() user: CurrentUserPayload): Promise<NoReplyFollowUpDryRun> {
    return this.routines.dryRunNoReplyFollowUp(user.userId)
  }
}
