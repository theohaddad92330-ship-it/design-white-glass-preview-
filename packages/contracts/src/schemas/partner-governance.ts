import { z } from 'zod'
import type { PartnerStage } from './partner-pipeline.js'

/**
 * #3270 (BEL-SC-241) — LA GOUVERNANCE RANG 2, SUR L'OBJET `Partenaire` EXISTANT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ICI, ET PAS UN QUATRIÈME OBJET
 * ─────────────────────────────────────────────────────────────────────────────
 * L'instruction commune (#3249, règle 4) refuse un second objet métier
 * concurrent. `partner-pipeline.ts` documente déjà TROIS objets qui portent le
 * mot « partenaire » — `account_partners`, `esn_directory`, `partner_relations`
 * — et prévient que les confondre serait la faute de conception du chantier.
 * Le rang 2 GOUVERNÉ (« porte d'entrée détenue », marge plancher, non-
 * contournement, interlocuteur de chaque côté…) décrit MA relation avec une
 * ESN, privée à mon espace : c'est exactement `partner_relations`, jamais
 * `account_partners` (qui note une ESN en place CHEZ un compte client) ni
 * `esn_directory` (l'entité partagée entre espaces). Ce fichier n'ajoute donc
 * QUE des colonnes et des fonctions pures sur l'objet déjà là.
 *
 * `non_circumvention` n'a pas de champ propre : c'est la clause de
 * non-sollicitation déjà portée par `partner_relations.non_solicitation`
 * (migration `1790700003003-PartnerNonSolicitation`) — un réglage vit à un
 * seul endroit (GA-26), et « non-contournement » est le même fait que « clause
 * de non-sollicitation des clients finaux ».
 */

export const PARTNER_GOVERNANCE_STATUSES = [
  'observed',
  'to_qualify',
  'qualified',
  'rules_missing',
  'active',
  'paused',
  'blocked',
  'historical',
] as const
export const partnerGovernanceStatusSchema = z.enum(PARTNER_GOVERNANCE_STATUSES)
export type PartnerGovernanceStatus = (typeof PARTNER_GOVERNANCE_STATUSES)[number]

/**
 * Les dix-huit dimensions du « CADRE À STRUCTURER » de #3270, dans l'ordre du
 * retour. `counterpart_contacts` couvre à elle seule « interlocuteur de chaque
 * côté » (deux personnes, une dimension) ; `non_circumvention` lit
 * `non_solicitation`, sans colonne propre (raison ci-dessus).
 */
export const PARTNER_GOVERNANCE_DIMENSIONS = [
  'entry_door',
  'accounts_accessible',
  'accounts_forbidden',
  'profiles_sought',
  'domains_covered',
  'margin_floor',
  'margin_share',
  'account_ownership',
  'action_ownership',
  'non_circumvention',
  'presentation_terms',
  'payment_terms',
  'delays',
  'counterpart_contacts',
  'duration',
  'exit_conditions',
  'referencing_proof',
  'confidentiality',
] as const
export const partnerGovernanceDimensionSchema = z.enum(PARTNER_GOVERNANCE_DIMENSIONS)
export type PartnerGovernanceDimension = (typeof PARTNER_GOVERNANCE_DIMENSIONS)[number]

/**
 * Les trois dimensions qui arment le NO-GO de #3270 (« je ne recommande pas
 * d'envoyer un profil avant d'avoir cadré ces deux points » — l'exemple du
 * retour cite le périmètre et la marge ; le non-contournement est la seconde
 * garde dure déjà écrite pour `partnerRelationScore.rank1Blocked`). Tant que
 * l'un des trois manque, le risque est BLOQUANT — jamais une moyenne : un
 * cadre à 15/18 sur les trois axes qui protègent un envoi de CV n'est pas 83 %
 * prêt, il est bloqué.
 */
const HARD_GOVERNANCE_DIMENSIONS: readonly PartnerGovernanceDimension[] = [
  'accounts_accessible',
  'margin_floor',
  'non_circumvention',
]

export const accountOwnershipSchema = z.enum(['ours', 'partner', 'shared'])
export type AccountOwnership = z.infer<typeof accountOwnershipSchema>

export const partnerConfidentialitySchema = z.enum(['public', 'restricted', 'confidential'])
export type PartnerConfidentiality = z.infer<typeof partnerConfidentialitySchema>

/** Les dix-sept champs qui, avec `non_solicitation` (déjà sur l'objet), portent
 *  les dix-huit dimensions. Tous nullable : `null` = « personne ne l'a cadré »,
 *  jamais une valeur devinée (deploy-skew comme le reste de l'objet). */
export const partnerGovernanceFieldsSchema = z.object({
  entryDoorScope: z.string().nullable(),
  accountsAccessible: z.array(z.string()).nullable(),
  accountsForbidden: z.array(z.string()).nullable(),
  profilesSought: z.array(z.string()).nullable(),
  domainsCovered: z.array(z.string()).nullable(),
  marginFloorPercent: z.number().nullable(),
  marginSharePercent: z.number().nullable(),
  accountOwnership: accountOwnershipSchema.nullable(),
  actionOwnership: accountOwnershipSchema.nullable(),
  presentationTerms: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  delayTerms: z.string().nullable(),
  ourContactName: z.string().nullable(),
  ourContactEmail: z.string().nullable(),
  durationTerms: z.string().nullable(),
  exitConditions: z.string().nullable(),
  referencingProof: z.string().nullable(),
  confidentialityLevel: partnerConfidentialitySchema.nullable(),
})
export type PartnerGovernanceFields = z.infer<typeof partnerGovernanceFieldsSchema>

/** Le même formulaire générique (doctrine c75), en écriture : chaque clé
 *  `undefined` laisse le champ intact, `null` l'efface, une valeur le pose —
 *  même geste que {@link qualifyAccountPartnerSchema} pour le rang 2 compte. */
export const updatePartnerGovernanceSchema = partnerGovernanceFieldsSchema.partial().extend({
  /** `null` lève une pause déjà posée ; une chaîne non vide la pose. Réutilise
   *  le motif obligatoire déjà posé par `invoice_cancel_reason_check`. */
  pausedReason: z.string().trim().max(500).nullable().optional(),
  blockedReason: z.string().trim().max(500).nullable().optional(),
})
export type UpdatePartnerGovernance = z.infer<typeof updatePartnerGovernanceSchema>

export type PartnerGovernanceRisk = 'none' | 'attention' | 'blocking'

export interface PartnerGovernanceReadiness {
  framed: PartnerGovernanceDimension[]
  /** Nommées, jamais silencieuses — doctrine « on n'affiche pas ce qu'on n'a
   *  pas » appliquée à l'envers : ici, l'absence EST l'information affichée. */
  missing: PartnerGovernanceDimension[]
  risk: PartnerGovernanceRisk
  accountsConcerned: string[]
  profilesConcerned: string[]
  /** La prochaine dimension à cadrer, la plus critique d'abord ; `null` quand
   *  les dix-huit sont posées. */
  nextValidation: PartnerGovernanceDimension | null
}

function isFramed(
  dimension: PartnerGovernanceDimension,
  fields: PartnerGovernanceFields,
  nonSolicitation: boolean | null,
  partnerContactName: string | null,
): boolean {
  switch (dimension) {
    case 'entry_door':
      return fields.entryDoorScope !== null
    case 'accounts_accessible':
      return fields.accountsAccessible !== null
    case 'accounts_forbidden':
      return fields.accountsForbidden !== null
    case 'profiles_sought':
      return fields.profilesSought !== null
    case 'domains_covered':
      return fields.domainsCovered !== null
    case 'margin_floor':
      return fields.marginFloorPercent !== null
    case 'margin_share':
      return fields.marginSharePercent !== null
    case 'account_ownership':
      return fields.accountOwnership !== null
    case 'action_ownership':
      return fields.actionOwnership !== null
    case 'non_circumvention':
      return nonSolicitation !== null
    case 'presentation_terms':
      return fields.presentationTerms !== null
    case 'payment_terms':
      return fields.paymentTerms !== null
    case 'delays':
      return fields.delayTerms !== null
    case 'counterpart_contacts':
      return fields.ourContactName !== null && partnerContactName !== null
    case 'duration':
      return fields.durationTerms !== null
    case 'exit_conditions':
      return fields.exitConditions !== null
    case 'referencing_proof':
      return fields.referencingProof !== null
    case 'confidentiality':
      return fields.confidentialityLevel !== null
  }
}

/**
 * PARTNER READINESS (#3270) — ce qui est cadré, ce qui manque, le risque, les
 * comptes et profils concernés, la prochaine validation. Pure : aucun accès
 * base, testable seule — le même style que `qualifyRank2` et
 * `partnerRelationScore` sur les deux objets voisins.
 */
export function partnerGovernanceReadiness(input: {
  fields: PartnerGovernanceFields
  nonSolicitation: boolean | null
  /** Le contact CÔTÉ PARTENAIRE, déjà porté par `partner_relations.contactName`
   *  — jamais dupliqué ici (GA-26). */
  partnerContactName: string | null
}): PartnerGovernanceReadiness {
  const framed: PartnerGovernanceDimension[] = []
  const missing: PartnerGovernanceDimension[] = []
  for (const dimension of PARTNER_GOVERNANCE_DIMENSIONS) {
    if (isFramed(dimension, input.fields, input.nonSolicitation, input.partnerContactName)) framed.push(dimension)
    else missing.push(dimension)
  }

  const missingHard = HARD_GOVERNANCE_DIMENSIONS.filter(dimension => missing.includes(dimension))
  const risk: PartnerGovernanceRisk = missingHard.length > 0 ? 'blocking' : missing.length > 0 ? 'attention' : 'none'

  const nextValidation: PartnerGovernanceDimension | null =
    missingHard[0] ?? missing.find(dimension => !HARD_GOVERNANCE_DIMENSIONS.includes(dimension)) ?? null

  return {
    framed,
    missing,
    risk,
    accountsConcerned: input.fields.accountsAccessible ?? [],
    profilesConcerned: input.fields.profilesSought ?? [],
    nextValidation,
  }
}

/**
 * STATUTS PARTENAIRE (#3270) — dérivé, jamais un second champ stocké à côté de
 * `stage` : la donnée qui arme chaque état est déjà là (`stage`, la pause/le
 * blocage explicites, `partnerGovernanceReadiness`). Un réglage vit à un seul
 * endroit (GA-26) ; en stocker un second qui pourrait diverger de celui-ci
 * serait exactement le défaut que la règle interdit.
 *
 * Ordre des gardes, la plus explicite (un geste humain daté) d'abord :
 * historique > bloqué > pausé > observé (rien engagé, rien cadré) > règles
 * manquantes (risque bloquant) > actif (risque nul, flux engagé) > qualifié
 * (risque nul, flux pas encore engagé) > à qualifier (le reste).
 */
export function deriveGovernanceStatus(input: {
  stage: PartnerStage
  pausedAt: string | null
  blockedAt: string | null
  readiness: PartnerGovernanceReadiness
}): PartnerGovernanceStatus {
  if (input.stage === 'retire') return 'historical'
  if (input.blockedAt !== null) return 'blocked'
  if (input.pausedAt !== null) return 'paused'
  if (input.stage === 'identifie' && input.readiness.framed.length === 0) return 'observed'
  if (input.readiness.risk === 'blocking') return 'rules_missing'
  if (input.readiness.risk === 'none')
    return input.stage === 'flux_actif' || input.stage === 'cadre_signe' ? 'active' : 'qualified'
  return 'to_qualify'
}
