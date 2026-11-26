import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Put,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common'
import { framingOrientationIdSchema, type OnboardingReformulateResponse } from '@bellum/contracts'
import { HttpError, HttpTimeoutError } from '@bellum/errors'
import { unwrap } from '@bellum/utils'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { journeyError } from '../../common/journey-error'
import { JwtGuard } from '../auth/jwt.guard'
import { demoOnboardingReformulate } from '../demo/demo-scripts'
import { IaClient } from '../ia/ia.client'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ActivationService } from './activation.service'
import { AdvanceStageDto } from './dto/advance-stage.dto'
import { SaveFramingDecisionDto, ValidateFramingDto } from './dto/framing.dto'
import { ReformulateAnswerDto } from './dto/reformulate-answer.dto'
import { FramingService } from './framing.service'
import { SaveAnswersDto } from './dto/save-answers.dto'
import { OnboardingService, type OnboardingFailure } from './onboarding.service'

/** Walk an error's `cause` chain looking for the first match. `HttpClient`
 *  nests two deep on a single-attempt call that still counts as retryable
 *  (`TechnicalError` → `HttpRetriesExhaustedError` → `HttpError`/
 *  `HttpTimeoutError`) — same helper as `contacts/enrichment-failure.ts`.
 *  Bounded, cycle-safe via the visited set. */
function findInCauseChain<T>(err: unknown, pick: (e: unknown) => T | undefined): T | undefined {
  const seen = new Set<unknown>()
  let current: unknown = err
  while (current && !seen.has(current)) {
    seen.add(current)
    const hit = pick(current)
    if (hit !== undefined) return hit
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}

function throwOnboardingFailure(failure: OnboardingFailure): never {
  const { code, message, cause, journey, missing } = failure
  switch (code) {
    case 'incomplete':
      // #4817 — le corps porte `code` + `missing` : sans eux le client ne savait que dire « il manque quelque chose ».
      throw new BadRequestException(
        { statusCode: 400, error: 'Bad Request', message, code, missing: missing ?? [] },
        { cause },
      )
    case 'unknown_stage':
    case 'invalid_transition':
      throw new BadRequestException(message, { cause })
    case 'persist_failed':
      // #2084.4/.7/.16-.20 — ce n'est pas la requête du client qui est
      // fautive : 503, pas 400. Le corps EST la forme commune (ce qui s'est
      // passé, ce qui reste, ce qui n'a pas été fait, l'action possible, et
      // si la reprise automatique est sûre) — jamais un message nu.
      throw new ServiceUnavailableException(
        journey ??
          journeyError({
            code: 'save_failed',
            whatHappened: message,
            notDone: message,
            nextAction: 'Réessaie dans un instant.',
            retryable: false,
          }),
      )
    default: {
      const _exhaustive: never = code
      throw new BadRequestException(`Unknown onboarding failure code: ${String(_exhaustive)}`)
    }
  }
}

/**
 * GA-05 — chaque route ici est appelée avec `@CurrentUser()` et n'opère que
 * sur CETTE identité (`user.userId`) : progression d'onboarding, ses propres
 * réponses, son propre complément de profil. `PUT /onboarding/answers` peut,
 * en interne, promouvoir un champ vers le profil CANONIQUE du workspace —
 * mais cette promotion reste gardée par `context.canManageCompany`
 * (`EsnProfileService.upsertAnswers`), indépendamment de cette déclaration :
 * `@PersonalScope` ne remplace ni n'affaiblit ce contrôle, il ne fait que
 * documenter, pour ce cliquet, qu'aucune route d'ici ne sert la donnée d'un
 * AUTRE utilisateur derrière `user.userId`.
 */
@PersonalScope()
@Controller('onboarding')
@UseGuards(JwtGuard)
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name)

  constructor(
    private readonly onboarding: OnboardingService,
    private readonly activation: ActivationService,
    private readonly ia: IaClient,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly framing: FramingService,
  ) {}

  @Get('state')
  async getState(@CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.onboarding.getState(user.userId), throwOnboardingFailure)
  }

  /** The 5-milestone activation checklist, derived from real data (see
   *  {@link ActivationService}) — strictly scoped to the requesting user. */
  @Get('activation')
  async getActivation(@CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.activation.getActivation(user.userId), throwOnboardingFailure)
  }

  @Put('state')
  async advanceStage(@CurrentUser() user: CurrentUserPayload, @Body() dto: AdvanceStageDto) {
    return unwrap(await this.onboarding.advanceStage(user.userId, dto.stage_code), throwOnboardingFailure)
  }

  @Put('answers')
  async saveAnswers(@CurrentUser() user: CurrentUserPayload, @Body() dto: SaveAnswersDto) {
    return unwrap(await this.onboarding.saveAnswers(user.userId, dto), throwOnboardingFailure)
  }

  /**
   * #2060.9 — « Laura reformule, l'utilisateur valide avant enregistrement ».
   *
   * Geste EXPLICITE (un bouton « Reformuler avec Laura » sur une réponse
   * libre) : jamais appelée à la frappe ni à la sortie du champ. ÉCRIT RIEN —
   * elle propose une reformulation, `PUT /onboarding/answers` (au-dessus)
   * persiste ensuite ce que l'utilisateur a CHOISI (sa version ou celle de
   * Laura), jamais celle-ci écrasée en silence.
   *
   * Onboarding gratuit de bout en bout (#2084.40-.45,
   * `onboarding-is-free.spec.ts`) : cette route ne débite rien, comme le reste
   * du module.
   *
   * En démonstration, AUCUN appel modèle ne part depuis un lien public
   * (`demo-model-calls.spec.ts`) : `demoOnboardingReformulate` reformate le
   * texte que le visiteur a tapé, sans y ajouter un mot — voir sa doc pour la
   * raison pour laquelle ce n'est pas une donnée inventée.
   *
   * Un échec du modèle rend une ERREUR HTTP claire — jamais une reformulation
   * inventée côté serveur pour compenser (§ « échec »). 503 quand aucune clé
   * de modèle n'est posée ou que l'appel expire (« non abouti » — jamais
   * rejoué seul par ce endpoint), 502 pour tout autre échec du fournisseur.
   */
  @Post('reformulate-answer')
  @HttpCode(200)
  async reformulateAnswer(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ReformulateAnswerDto,
  ): Promise<OnboardingReformulateResponse> {
    try {
      if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
        return demoOnboardingReformulate(dto.answerText)
      }
      return await this.ia.reformulateOnboardingAnswer({
        questionLabel: dto.questionLabel,
        answerText: dto.answerText,
        locale: dto.locale,
      })
    } catch (err) {
      // Jamais le contenu de la réponse tapée dans le journal — voir la même
      // règle sur `apps/ia/app/routers/onboarding_reformulate.py`.
      this.logger.error('Reformulation onboarding échouée', {
        error: err,
        tags: { 'reformulate.error': 'ia_unavailable' },
        user: { id: user.userId },
      })
      // Sans clé de modèle (503 côté IA) ou timeout : « non abouti », pas une
      // panne du proxy — l'utilisateur peut retenter le même bouton, ce
      // endpoint ne le fait jamais tout seul.
      const timeout = findInCauseChain(err, e => (e instanceof HttpTimeoutError ? e : undefined))
      const httpError = findInCauseChain(err, e => (e instanceof HttpError ? e : undefined))
      if (timeout || httpError?.status === 503) {
        throw new ServiceUnavailableException('reformulation_unavailable')
      }
      throw new BadGatewayException('reformulation_failed')
    }
  }

  @Post('complete')
  @HttpCode(200)
  async complete(@CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.onboarding.complete(user.userId), throwOnboardingFailure)
  }

  /**
   * « Plus tard » sur le questionnaire du Temps 1 (recette finale §13).
   *
   * La seule sortie hors complétion, et elle est explicite. Elle existe pour
   * remplacer une déduction qui coûtait cher — « ce compte a une offre, donc il
   * a répondu » — qui faisait sauter l'onboarding à tout compte bêta
   * provisionné avant d'avoir répondu à la première question.
   *
   * Conséquence assumée et affichée : les analyses lancées ensuite sont
   * marquées GÉNÉRIQUES. Reprendre le questionnaire efface le report.
   */
  @Post('skip')
  @HttpCode(200)
  async skip(@CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.onboarding.skipQuestionnaire(user.userId), throwOnboardingFailure)
  }

  /**
   * #2004.10 — geste EXPLICITE de l'utilisateur demandant à reconfigurer un
   * onboarding déjà COMMENCÉ (#2021, 27/09/2026 : plus seulement un onboarding
   * terminé — voir le docblock de `ONBOARDING_TRANSITIONS`). Voir le docblock
   * de `OnboardingService.requestRefresh` pour la raison du choix
   * (conservateur : jamais une horloge, jamais une déduction).
   */
  @Post('refresh')
  @HttpCode(200)
  async requestRefresh(@CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.onboarding.requestRefresh(user.userId), throwOnboardingFailure)
  }

  /* ------------------------------------------------------------------ */
  /*  Temps 2 — le complément de profil (jamais bloquant)                */
  /* ------------------------------------------------------------------ */

  /** Whether the complement may be proposed right now, and how much of it is
   *  already answered. Answers themselves travel on `GET /onboarding/state`. */
  @Get('complement')
  async getComplement(@CurrentUser() user: CurrentUserPayload) {
    return this.onboarding.getComplementState(user.userId)
  }

  /** « Plus tard » — comes back in a few days. */
  @Post('complement/snooze')
  @HttpCode(200)
  async snoozeComplement(@CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.onboarding.snoozeComplement(user.userId), throwOnboardingFailure)
  }

  /** « Ne plus me le proposer » — definitive, answers kept. */
  @Post('complement/dismiss')
  @HttpCode(200)
  async dismissComplement(@CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.onboarding.dismissComplement(user.userId), throwOnboardingFailure)
  }

  /** The rep reached the end of the complement (skipped questions included). */
  @Post('complement/complete')
  @HttpCode(200)
  async completeComplement(@CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.onboarding.completeComplement(user.userId), throwOnboardingFailure)
  }

  /* ------------------------------------------------------------------ */
  /*  Théo O onboarding-relecture.N1/N2 — décisions et validation du cadrage */
  /* ------------------------------------------------------------------ */

  /** Les décisions prises sur les orientations et la validation du cadrage (vide quand rien n'est décidé). */
  @Get('framing')
  async getFraming(@CurrentUser() user: CurrentUserPayload) {
    return this.framing.getState(user.userId)
  }

  /** Retenir · plus tard · ne pas retenir — une décision par orientation, la dernière gagne. */
  @Put('framing/decisions/:orientation')
  async saveFramingDecision(
    @CurrentUser() user: CurrentUserPayload,
    @Param('orientation') orientation: string,
    @Body() dto: SaveFramingDecisionDto,
  ) {
    const parsed = framingOrientationIdSchema.safeParse(orientation)
    if (!parsed.success) throw new BadRequestException('Orientation inconnue.')
    return this.framing.saveDecision(user.userId, parsed.data, dto.decision)
  }

  /** La validation explicite du cadrage. N'autorise ni accès, ni dépense, ni envoi — elle ne fait que l'écrire. */
  @Post('framing/validate')
  @HttpCode(200)
  async validateFraming(@CurrentUser() user: CurrentUserPayload, @Body() dto: ValidateFramingDto) {
    return this.framing.validate(user.userId, dto.digest)
  }

  /* ------------------------------------------------------------------ */
  /*  #2897 (#2091.36/.37) — bannière « BellumAI a été repensé »          */
  /* ------------------------------------------------------------------ */

  /** Visible pour un compte dont l'onboarding s'est terminé AVANT la
   *  refonte de l'écran Welcome, et qui ne l'a pas déjà fermée. */
  @Get('redesign-banner')
  async getRedesignBanner(@CurrentUser() user: CurrentUserPayload) {
    return this.onboarding.getRedesignBannerState(user.userId)
  }

  /** Fermeture définitive — pas de report. */
  @Post('redesign-banner/dismiss')
  @HttpCode(200)
  async dismissRedesignBanner(@CurrentUser() user: CurrentUserPayload) {
    return unwrap(await this.onboarding.dismissRedesignBanner(user.userId), throwOnboardingFailure)
  }
}
