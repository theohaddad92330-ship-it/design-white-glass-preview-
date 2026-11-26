import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common'
import type {
  ChooseEntryStrategyInput,
  CorrectProfileContextFieldInput,
  ProfileContextResponse,
  ProfileContextRevision,
  ProfileContextRevisionSummary,
  RecordAuditMoveDecisionInput,
} from '@bellum/contracts'
import {
  chooseEntryStrategySchema,
  correctProfileContextFieldInputSchema,
  recordAuditMoveDecisionSchema,
} from '@bellum/contracts'
import { unwrap } from '@bellum/utils'
import { ZodValidationPipe } from 'nestjs-zod'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { ProfileContextService, type ValidateFailure } from './profile-context.service'
import { ProfileContextRevisionService, type RevisionFailure } from './profile-context-revision.service'

function throwRevisionFailure(failure: RevisionFailure): never {
  const { code, message } = failure
  switch (code) {
    case 'revision_not_found':
      throw new NotFoundException(message)
    default: {
      const _exhaustive: never = code
      throw new NotFoundException(`Unknown revision failure code: ${String(_exhaustive)}`)
    }
  }
}

function throwValidateFailure(failure: ValidateFailure): never {
  const { code, message } = failure
  switch (code) {
    case 'no_profile_context':
      throw new ConflictException(message)
    default: {
      const _exhaustive: never = code
      throw new ConflictException(`Unknown validate failure code: ${String(_exhaustive)}`)
    }
  }
}

/**
 * GA-05 (intégration de la vague 21, 16/09/2026) : chaque route de ce contrôleur
 * est appelée avec `@CurrentUser()` et n'opère que sur la ligne de CETTE
 * identité — `profiles` et `profile_context_revisions` filtrés par `user_id`
 * (`getMe`, `validate`, `chooseEntryStrategy`, `list`/`get`/`restore`). Aucun
 * autre membre de l'espace ne voit quoi que ce soit par ces routes. Même cas que
 * `onboarding.controller.ts` le 15/09 : une ABSENCE devenue DÉCLARATION.
 */
@PersonalScope()
@Controller('profile-context')
@UseGuards(JwtGuard)
export class ProfileContextController {
  constructor(
    private readonly profileContext: ProfileContextService,
    private readonly revisions: ProfileContextRevisionService,
  ) {}

  @Get('me')
  async getMe(@CurrentUser() user: CurrentUserPayload): Promise<ProfileContextResponse> {
    const snapshot = await this.profileContext.getMe(user.userId)
    return snapshot
  }

  // #2075.B — D9 (décision Louis 14/09/2026, valider le contexte commercial) :
  // câblé. L'appelant est le bouton « Valider » de
  // `apps/web/src/features/commercial-audit/components/ValidateContextStatus.tsx`
  // (monté par `AuditHero.tsx`, sur `/settings/profile/audit`) via
  // `useValidateProfileContext()`. Le clic EST la décision (geste utilisateur
  // = auto-approuvé) : aucune confirmation avant l'appel.
  //
  // La lecture distingue désormais `validated` : `ProfileContextService.getMe`
  // expose `validatedAt`, l'écran affiche « Validé le … par … », et
  // `triggerGeneration` bloque la régénération automatique tant que rien n'est
  // réédité (voir son docblock). Laura cite le contexte comme validé via
  // `AnalysisProfileData.profileContextValidatedAt`
  // (`esn-profile-workspace.resolver.ts` → `bellum_advisor.py::seller_block`).
  @Post('validate')
  @HttpCode(200)
  async validate(@CurrentUser() user: CurrentUserPayload): Promise<ProfileContextResponse> {
    return unwrap(await this.profileContext.validate(user.userId), throwValidateFailure)
  }

  // #2073.8 — « Choisir cette stratégie ». L'appelant est
  // `AuditStrategyOptions.tsx` (`useChooseEntryStrategy()`), sur
  // `/settings/profile/audit`. Le clic EST la décision (geste utilisateur =
  // auto-approuvé) : aucune confirmation avant l'appel, même précédent que
  // `validate` juste au-dessus.
  @Post('entry-strategy')
  @HttpCode(200)
  async chooseEntryStrategy(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(chooseEntryStrategySchema)) body: ChooseEntryStrategyInput,
  ): Promise<ProfileContextResponse> {
    return this.profileContext.chooseEntryStrategy(user.userId, body.entryStrategy)
  }

  // #2074.16 — « L'utilisateur VALIDE ou MODIFIE avant création dans Actions » :
  // Valider / Modifier / Écarter UN mouvement d'audit proposé (`AuditMove`,
  // verrouillé). L'appelant est `AuditFirstMoves.tsx`
  // (`useRecordAuditMoveDecision()`), sur `/settings/profile/audit`. Même
  // précédent que `entry-strategy` juste au-dessus : le clic EST la
  // décision, auto-approuvé.
  @Post('audit-move-decision')
  @HttpCode(200)
  async recordAuditMoveDecision(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(recordAuditMoveDecisionSchema)) body: RecordAuditMoveDecisionInput,
  ): Promise<ProfileContextResponse> {
    // #2074.16 — l'objet montré devient la tâche dans Actions (Valider/Modifier).
    return this.profileContext.recordAuditMoveDecision(user.userId, body.ruleId, body.status, {
      subject: body.subject,
      reason: body.reason,
      expectedResult: body.expectedResult,
    })
  }

  // #2908 (#2010.4) — « Corriger ce champ ». Le clic EST la décision (geste
  // utilisateur = auto-approuvé) : pas de confirmation avant cet appel, même
  // précédent que `entry-strategy`/`audit-move-decision` juste au-dessus.
  @Post('corrections')
  @HttpCode(200)
  async correctField(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(correctProfileContextFieldInputSchema)) body: CorrectProfileContextFieldInput,
  ): Promise<ProfileContextResponse> {
    return this.profileContext.correctField(user.userId, body.field, body.value)
  }

  @Get('revisions')
  async listRevisions(@CurrentUser() user: CurrentUserPayload): Promise<ProfileContextRevisionSummary[]> {
    return this.revisions.list(user.userId)
  }

  @Get('revisions/:version')
  async getRevision(
    @CurrentUser() user: CurrentUserPayload,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<ProfileContextRevision> {
    return unwrap(await this.revisions.get(user.userId, version), throwRevisionFailure)
  }

  @Post('revisions/:version/restore')
  @HttpCode(200)
  async restoreRevision(
    @CurrentUser() user: CurrentUserPayload,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<ProfileContextRevision> {
    return unwrap(await this.revisions.restore(user.userId, version), throwRevisionFailure)
  }
}
