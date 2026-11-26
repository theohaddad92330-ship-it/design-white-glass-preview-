import { z } from 'zod'
import { PROFILE_ANSWER_MAX_MULTI } from './limits.js'

/**
 * #2033.2-.8 — le périmètre d'autorité DÉCLARÉ par la personne : ce qu'elle
 * décide seule, ce qu'elle doit faire valider, qui elle manage, et sa
 * responsabilité sur quatre axes (recrutement/comptes, staffing, marge et
 * facturation, outils et droit d'inviter).
 *
 * ⚠️ D3 (décision Louis, 18/09/2026, `.claude/notes/decisions-louis-18-09-
 * apresmidi.md`) — ces réponses **n'entrent NULLE PART dans les droits**.
 * `workspace-permission.guard.ts` reste la SEULE autorité sur ce qui est
 * autorisé (GA-26) : ce fichier ne déclare que des FORMES de collecte, jamais
 * une permission. Ce qu'elles changent : ce que Laura PROPOSE (voir
 * `packages/contracts/src/schemas/authority-scope.ts`), jamais ce que l'API
 * accepte.
 *
 * Clés PERSONNELLES (le périmètre d'un Business Manager n'est pas celui de
 * son associé) — voir `PROFILE_PERSONAL_ANSWER_KEYS` dans `../onboarding.ts`
 * et son miroir Python `_PERSONAL_PROFILE_COLUMNS` (`seller_context.py`).
 *
 * Les quatre champs d'échelle (`recruitment_accounts_authority`,
 * `staffing_authority`, `margin_billing_authority`, `invite_authority`)
 * persistent l'une des trois valeurs de `AUTHORITY_SCALE_CHOICES`
 * (`@bellum/contracts/schemas/authority-scope`) — c'est CETTE valeur exacte
 * que la fonction pure de gate lit, jamais une déduction depuis `user_role`.
 */
export const AUTORITE_ANSWER_FIELDS = {
  // #2033.2 — décisions prises seul, sans avoir à demander.
  decisions_alone: z.array(z.string()).max(PROFILE_ANSWER_MAX_MULTI).optional(),
  // #2033.3 — décisions qui doivent être validées par quelqu'un d'autre.
  decisions_to_validate: z.array(z.string()).max(PROFILE_ANSWER_MAX_MULTI).optional(),
  // #2033.4 — les personnes managées, par FONCTION (jamais un nom propre :
  // aucun critère protégé, et un tiers non consentant ne se nomme pas ici).
  people_managed: z.array(z.string()).max(PROFILE_ANSWER_MAX_MULTI).optional(),
  // #2033.5 — responsabilité sur le recrutement de nouveaux comptes clients.
  recruitment_accounts_authority: z.string().nullable().optional(),
  // #2033.6 — responsabilité sur le staffing (affecter un consultant).
  staffing_authority: z.string().nullable().optional(),
  // #2033.7 — responsabilité sur la marge et la facturation.
  margin_billing_authority: z.string().nullable().optional(),
  // #2033.8 (1/2) — les outils auxquels la personne a accès. Informationnel :
  // ne gate rien (contrairement aux quatre échelles ci-dessus).
  tools_access: z.array(z.string()).max(PROFILE_ANSWER_MAX_MULTI).optional(),
  // #2033.8 (2/2) — la possibilité d'inviter quelqu'un dans l'espace.
  invite_authority: z.string().nullable().optional(),
}
