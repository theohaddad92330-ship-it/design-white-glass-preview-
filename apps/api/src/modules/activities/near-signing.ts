import { NEAR_SIGNING_STAGES } from '@bellum/contracts'

/**
 * #3904 — DÉCISION LOUIS 09/10 : « proche de signer » = une opportunité au
 * stade PROPOSITION ou NÉGOCIATION, lue dans Bellum OU dans le CRM branché.
 * Un STADE déclaré par quelqu'un, jamais une probabilité ni un pourcentage
 * (refusé six fois) ; la source lue se nomme, un CRM absent se nomme.
 */

/** Bellum : « Profils présentés » EST la proposition d'une ESN, puis la
 *  négociation. Les stades suivants (`won`/`lost`) sont déjà clos. */
export const BELLUM_NEAR_SIGNING_STAGES = NEAR_SIGNING_STAGES

/**
 * CRM : le stade est un texte LIBRE propre à l'outil du client (libellé ou
 * identifiant interne). Seuls les mots qui DISENT proposition, devis, contrat
 * envoyé ou négociation le classent — un stade muet n'est jamais deviné.
 */
const CRM_NEAR_SIGNING_PATTERN = /propos|devis|quote|contract\s*sent|contractsent|n[ée]goc|negotiat/i

export function isNearSigningCrmStage(stage: string | null, stageLabel: string | null): boolean {
  return [stageLabel, stage].some(text => typeof text === 'string' && CRM_NEAR_SIGNING_PATTERN.test(text))
}

/** Une opportunité Bellum proche de signer. */
export type NearSigningBellumRow = {
  accountId: string
  companyName: string
  opportunityId: string
  label: string
  stage: (typeof BELLUM_NEAR_SIGNING_STAGES)[number]
}

/** Une affaire CRM proche de signer, rattachée à un compte (#3918.a). */
export type NearSigningCrmRow = {
  accountId: string
  companyName: string
  dealName: string | null
  stageLabel: string | null
}
