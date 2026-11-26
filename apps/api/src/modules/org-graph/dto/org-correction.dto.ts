import { BadRequestException } from '@nestjs/common'
import {
  orgCorrectionRequestSchema,
  orgCorrectionRevertRequestSchema,
  type OrgCorrectionRequest,
  type OrgCorrectionRevertRequest,
} from '@bellum/contracts'

/**
 * La validation d'entrée du tiroir de correction.
 *
 * Le contrat zod est la SEULE définition — pas de miroir en décorateurs
 * `class-validator`, qui divergerait au premier ajout de champ. C'est aussi lui
 * qui porte les deux refus qui comptent : une écriture sans
 * `expectedGraphVersion`, et une preuve d'identité présentée comme preuve de
 * relation.
 *
 * ⚠️ Le message d'erreur cite les chemins zod : « claims.0.evidence.claim ». Un
 * 400 muet obligerait le front à deviner lequel de cinq champs est en cause.
 */
export function parseOrgCorrectionRequest(body: unknown): OrgCorrectionRequest {
  const parsed = orgCorrectionRequestSchema.safeParse(body)
  if (!parsed.success) throw new BadRequestException(issuesOf(parsed.error.issues))
  return parsed.data
}

export function parseOrgCorrectionRevertRequest(body: unknown): OrgCorrectionRevertRequest {
  const parsed = orgCorrectionRevertRequestSchema.safeParse(body)
  if (!parsed.success) throw new BadRequestException(issuesOf(parsed.error.issues))
  return parsed.data
}

function issuesOf(issues: readonly { path: PropertyKey[]; message: string }[]): string[] {
  return issues.map(issue => `${issue.path.join('.') || 'body'} : ${issue.message}`)
}
