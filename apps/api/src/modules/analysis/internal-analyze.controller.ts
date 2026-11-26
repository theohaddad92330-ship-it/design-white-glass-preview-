import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common'
import { z } from 'zod'
import { analysisContextSchema } from '@bellum/contracts'
import { unwrap } from '@bellum/utils'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AnalysisService, type AnalysisFailure } from './analysis.service'
import type { StartAnalysisDto } from './dto/start-analysis.dto'

// The owner attributed to operator-launched analyses. ``accounts.user_id`` has a
// real FK to ``auth.users`` (a synthetic random id would violate it), so this
// MUST be an existing user. Configured via env so prod points it at a dedicated
// service/operator account; in dev it's the local user. Read from process.env
// directly (not the typed env config) to avoid widening the shared env schema.
function operatorUserId(): string {
  return process.env.DASHBOARD_OPERATOR_USER_ID ?? ''
}

const launchSchema = z.object({
  company: z.string().min(1),
  // A structured preset (one of the analysisContextSchema variants) OR free
  // text. ``start`` renders the structured shape down to a string for the TEXT
  // column and forwards the typed shape to the worker/IA untouched.
  userContext: z.union([analysisContextSchema, z.string().min(1)]).optional(),
  // Optional ESN profile to condition the analysis (offers/sectors/personas/…).
  // When omitted the run is profile-neutral. Lets an operator launch (and a
  // reproducible demo) run the SAME company under different ESN profiles and get
  // different synergies/angles/priority — the profile really drives the output.
  profileData: z.record(z.string(), z.unknown()).optional(),
  // Default true: dashboard launches want a genuinely fresh run. ``force`` makes
  // ``start`` skip the C1 result cache and the per-user hourly quota so the
  // operator always gets a new run that lands in the monitoring as analyzing.
  fresh: z.boolean().optional(),
})

function throwAnalysisFailure(problem: AnalysisFailure): never {
  const { code, message } = problem
  switch (code) {
    case 'not_found':
      throw new NotFoundException(message)
    case 'create_failed':
      throw new InternalServerErrorException(message)
    case 'quota_exceeded':
      throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS)
    case 'demo_workspace':
      // Not reachable on the operator path in practice (``fresh``/force launches
      // bypass the demo guard), but the switch stays exhaustive.
      throw new HttpException(message, HttpStatus.FORBIDDEN)
    case 'identity_mismatch':
      // GA-96. Comme `demo_workspace`, peu atteignable ici (un lancement
      // opérateur passe en `force`, qui court-circuite la recherche de dossier à
      // relancer) — mais l'exhaustivité du switch est ce qui garantit qu'un code
      // d'échec neuf ne sorte jamais en 500 muet.
      throw new HttpException(message, HttpStatus.CONFLICT)
    case 'not_cancellable':
      // Audit H1 — propre à l'annulation utilisateur ; couvert pour l'exhaustivité.
      throw new HttpException(message, HttpStatus.CONFLICT)
    case 'budget_exceeded':
      // #2975 — pas atteignable sur le lancement opérateur (`force` saute
      // `consumeAnalysisSlot`, donc la porte de coût par espace n'est jamais
      // interrogée ici) ; couvert pour la même raison que les deux ci-dessus.
      throw new HttpException(message, HttpStatus.PAYMENT_REQUIRED)
    case 'no_entity_question':
    case 'invalid_entity_answer':
      // #2164.17 — propres à la question d'identité utilisateur ; couverts
      // pour l'exhaustivité (jamais rendus par un lancement opérateur).
      throw new HttpException(message, HttpStatus.CONFLICT)
    default: {
      const _exhaustive: never = code
      throw new InternalServerErrorException(`Unknown analysis failure code: ${String(_exhaustive)}`)
    }
  }
}

/**
 * Operator-triggered analysis launch for the monitoring dashboard.
 *
 * Unlike the IA-only test harness (dashboard ``/api/analyze`` → FastAPI phases,
 * never persisted), this enqueues the REAL BullMQ worker job: the account row is
 * created immediately (status ``analyzing``) and the dashboard's Monitoring shows
 * it live, then ``completed`` with full per-phase telemetry once the worker finishes.
 *
 * Not user-scoped at the HTTP layer — exposed only behind ``InternalSecretGuard``
 * (header secret, no end-user JWT), same trust boundary as the telemetry endpoints.
 * The analysis itself is attributed to the configured operator user.
 */
@Controller('internal/analyze')
@UseGuards(InternalSecretGuard)
export class InternalAnalyzeController {
  constructor(private readonly analysis: AnalysisService) {}

  @Post()
  async launch(@Body() raw: unknown) {
    const userId = operatorUserId()
    if (!userId) {
      throw new InternalServerErrorException(
        'DASHBOARD_OPERATOR_USER_ID non configuré — impossible d’attribuer l’analyse à un utilisateur.',
      )
    }
    const body = launchSchema.parse(raw)
    const fresh = body.fresh ?? true

    const dto = {
      company_name: body.company,
      ...(body.userContext ? { user_context: body.userContext } : {}),
      ...(body.profileData ? { profile_data: body.profileData } : {}),
    } as StartAnalysisDto

    const started = unwrap(await this.analysis.start(dto, userId, { force: fresh }), throwAnalysisFailure)
    return { ...started, fresh }
  }
}
