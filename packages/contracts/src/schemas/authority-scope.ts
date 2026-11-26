/**
 * D3 — décision Louis, 18/09/2026 (`.claude/notes/decisions-louis-18-09-
 * apresmidi.md`) : le périmètre d'autorité collecté au questionnaire
 * (#2033.2-.8) cadre ce que Laura PROPOSE, jamais ce que l'API AUTORISE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE MODULE N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce n'est PAS un guard, ce n'est PAS une permission, et il n'importe ni
 * `WorkspacePermission` ni `can()`. `apps/api/src/modules/workspace/
 * workspace-permission.guard.ts` reste la SEULE autorité sur ce qui est
 * AUTORISÉ (GA-26) — deux endroits qui décideraient des droits
 * divergeraient en trois semaines. `isProposalWithinDeclaredAuthority` ne
 * rend qu'un verdict de PROPOSITION (`withinScope`) et une phrase à dire,
 * jamais un rôle, une permission ni un accès élargi — un champ de
 * formulaire n'est jamais un vecteur d'élévation de privilège (#2033.8,
 * `registre-2026-09-15-onboarding-questionnaire.md`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ABSENCE NE RESTREINT RIEN (#2033.10, GA-18/GA-19)
 * ─────────────────────────────────────────────────────────────────────────────
 * « Non mesuré » n'est jamais une valeur basse. Un périmètre NON renseigné
 * (`undefined`/`null`, ou une valeur hors du catalogue fermé — p. ex. un
 * intitulé de poste mal rangé ici) laisse Laura tout proposer : on ne devine
 * jamais un refus depuis un silence, ni depuis un mot comme « directeur ».
 * Seule la valeur EXACTE `"Je n'ai pas cette responsabilité"` — persistée
 * verbatim par le questionnaire (`AUTHORITY_SCALE_CHOICES[2]`) — fait sortir
 * une catégorie du périmètre proposé.
 */

/**
 * Les trois valeurs d'échelle persistées verbatim par les quatre questions de
 * responsabilité (#2033.5-.8) — `ESN_ANSWER_OPTIONS.recruitment_accounts_authority`
 * / `.staffing_authority` / `.margin_billing_authority` / `.invite_authority`
 * (`onboarding.ts`) citent CE catalogue (GA-26, un seul endroit).
 */
export const AUTHORITY_SCALE_CHOICES = [
  'Je décide seul',
  'Je dois faire valider',
  "Je n'ai pas cette responsabilité",
] as const
type AuthorityScaleAnswer = (typeof AUTHORITY_SCALE_CHOICES)[number]

/**
 * Les quatre catégories d'action que #2033.9 nomme comme pouvant être
 * « réservées au dirigeant » — exactement les quatre axes de responsabilité
 * collectés (#2033.5-.8). `decisions_alone`/`decisions_to_validate`
 * (#2033.2/.3) et `people_managed` (#2033.4) restent de la COLLECTE pure : un
 * catalogue ouvert de libellés ne fournit pas une clé stable pour gater une
 * action, contrairement à ces quatre échelles fermées.
 */
export const AUTHORITY_CATEGORIES = ['recruitment_accounts', 'staffing', 'margin_billing', 'invite_workspace'] as const
export type AuthorityCategory = (typeof AUTHORITY_CATEGORIES)[number]

/** Les quatre réponses d'échelle, telles que résolues pour LA personne qui parle à Laura (jamais un canonique d'espace). */
export type DeclaredAuthorityScope = {
  recruitmentAccountsAuthority?: string | null
  staffingAuthority?: string | null
  marginBillingAuthority?: string | null
  inviteAuthority?: string | null
}

const CATEGORY_FIELD: Record<AuthorityCategory, keyof DeclaredAuthorityScope> = {
  recruitment_accounts: 'recruitmentAccountsAuthority',
  staffing: 'staffingAuthority',
  margin_billing: 'marginBillingAuthority',
  invite_workspace: 'inviteAuthority',
}

/** Le libellé français d'une catégorie, pour la phrase que Laura dit (#2033.9). */
const CATEGORY_LABEL_FR: Record<AuthorityCategory, string> = {
  recruitment_accounts: 'recruter un nouveau compte',
  staffing: 'décider un staffing',
  margin_billing: 'décider de la marge ou de la facturation',
  invite_workspace: "inviter quelqu'un dans l'espace",
}

export type ProposalAuthorityResult = {
  /** Laura peut proposer cette action à cette personne. */
  withinScope: boolean
  /** Présente seulement quand `withinScope` est `false` — ce que Laura DIT au lieu de proposer (#2033.9). */
  declineReasonFr?: string
  /** Présente seulement sur "Je dois faire valider" — dans le périmètre, mais Laura nomme la réserve. */
  cautionReasonFr?: string
}

/**
 * Le verdict de PROPOSITION pour une catégorie donnée — jamais un verdict
 * d'AUTORISATION. Voir l'en-tête du module.
 */
export function isProposalWithinDeclaredAuthority(
  category: AuthorityCategory,
  scope: DeclaredAuthorityScope,
): ProposalAuthorityResult {
  const declared = scope[CATEGORY_FIELD[category]]
  const label = CATEGORY_LABEL_FR[category]

  // #2033.10 (Piège 2) — non renseigné, ou une valeur hors du catalogue fermé
  // (jamais devinée depuis un intitulé de poste comme « directeur ») :
  // aucune restriction, Laura propose tout.
  if (declared !== AUTHORITY_SCALE_CHOICES[1] && declared !== AUTHORITY_SCALE_CHOICES[2]) {
    return { withinScope: true }
  }

  if (declared === AUTHORITY_SCALE_CHOICES[2]) {
    return {
      withinScope: false,
      declineReasonFr: `Ça sort de ce que tu m'as dit : tu m'as dit ne pas avoir la responsabilité de ${label}, donc je ne te la propose pas.`,
    }
  }

  // "Je dois faire valider" — reste dans le périmètre proposé, avec une réserve nommée.
  return {
    withinScope: true,
    cautionReasonFr: `Tu m'as dit devoir faire valider ce type de décision (${label}) — je te la propose, à faire confirmer avant d'agir.`,
  }
}
