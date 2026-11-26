import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common'
import { ZodValidationException } from 'nestjs-zod'
import type { ZodError, ZodIssue } from 'zod'
import type { Response } from 'express'

const MAX_NAMED_ISSUES = 5

/**
 * #4833 — le message NOMME le champ refusé et la règle enfreinte : un client qui affiche `message` tel quel
 * (« Enregistrement impossible : … ») ne dit plus « Validation failed » nu. Sans détail de champ, la phrase
 * historique reste. Le détail complet voyage toujours dans `errors`.
 */
function describeIssues(issues: readonly ZodIssue[]): string {
  const named = issues.filter(issue => issue.path.length > 0)
  if (named.length === 0) return 'Validation failed'
  const shown = named.slice(0, MAX_NAMED_ISSUES).map(issue => `${issue.path.join('.')} : ${issue.message}`)
  const rest = named.length - shown.length
  return `Validation failed — ${shown.join(' ; ')}${rest > 0 ? ` (+ ${rest} autres champs)` : ''}`
}

/**
 * Catches the `ZodValidationException` that nestjs-zod throws on body/query
 * validation failures and replies with the structured issue list. Without
 * this filter, NestJS serializes the exception as `{ statusCode: 400,
 * message: "Validation failed" }` with no field-level detail — which makes
 * it impossible to tell which field was rejected and why.
 */
@Catch(ZodValidationException)
export class ZodValidationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ZodValidationExceptionFilter.name)

  catch(exception: ZodValidationException, host: ArgumentsHost) {
    const zodError = exception.getZodError() as ZodError
    const issues: ZodIssue[] = zodError?.issues ?? []

    // Full diagnostic dump so we can see what the exception actually contains.
    this.logger.warn(
      `zod validation failed:\n` +
        `  exception.class = ${exception?.constructor?.name}\n` +
        `  exception.message = ${JSON.stringify(exception?.message)}\n` +
        `  exception.getResponse() = ${JSON.stringify(exception?.getResponse?.())}\n` +
        `  zodError.class = ${zodError?.constructor?.name}\n` +
        `  zodError.issues = ${JSON.stringify(issues)}\n` +
        `  zodError keys = ${zodError ? Object.keys(zodError).join(',') : '<null>'}`,
    )

    const response = host.switchToHttp().getResponse<Response>()
    response.status(400).json({
      statusCode: 400,
      message: describeIssues(issues),
      errors: issues,
    })
  }
}
