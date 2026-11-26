import type { ContactApolloDetails, ContactPreflightInput, FieldSource } from '@bellum/contracts'
import { buildEntityScoreContext, employerDifference, isHumanEnteredContact } from '../analysis/contact-score'
import { filterEligibleContacts, type EligibilityRow } from './contact-eligibility'

/**
 * #3219 (#190.2 côté CONTACT, décision Louis 11/10/2026) — les FAITS du
 * contrôle avant action d'un contact, lus avec les portes qui existent déjà.
 *
 * Pure — `ContactsService.preflight` fait les lectures (le contact, les
 * contacts du compte, le compte, les fiches marquées incorrectes, la
 * provenance par champ) et les passe ici. Ce fichier n'importe aucun service
 * (GA-07) ; il ne décide rien non plus :
 *
 *  - le PÉRIMÈTRE DU COMPTE est le verdict de `filterEligibleContacts`, la
 *    porte même qui écarte ce contact du classement — rejouée sur les mêmes
 *    entrées, jamais une seconde règle « hors périmètre » ;
 *  - l'EMPLOYEUR rapporté est celui de `contact-score.ts` (`employerDifference`,
 *    même détecteur que le badge RISQUE / CONFLIT de la liste) ;
 *  - le POSTE rapporté est relu tel quel ; la comparaison vit dans le
 *    compilateur partagé (`titlesDiffer`, `@bellum/contracts`).
 *
 * Ce qui n'a pas pu être évalué se NOMME (`state: 'unknown'`) : un contact
 * sans compte, un compte sans cartographie d'entités, un contact sans entité
 * déclarée ne sont jamais « dans le périmètre » par défaut.
 */

export type PreflightContactRow = EligibilityRow & {
  title: string | null
  source: string | null
  raw_data: Record<string, unknown> | null
  account_id: string | null
}

type PreflightFacts = Pick<ContactPreflightInput, 'accountScope' | 'employer' | 'title'>

/** Même lecture que `cleanEntity` côté écran (lot R22) : un import qui n'a rien
 *  trouvé écrit parfois du bruit littéral plutôt qu'un `null` propre. */
const ENTITY_NOISE = new Set(['n/a', 'non identifié', 'non identifie', '-'])
function usableEntity(entity: string | null): string | null {
  const trimmed = entity?.trim() ?? ''
  return trimmed && !ENTITY_NOISE.has(trimmed.toLowerCase()) ? trimmed : null
}

function apolloDetailsOf(row: PreflightContactRow): ContactApolloDetails | null {
  const details = (row.raw_data as { apolloDetails?: ContactApolloDetails } | null)?.apolloDetails
  return details && typeof details === 'object' ? details : null
}

export function contactPreflightFacts(input: {
  contact: PreflightContactRow
  /** Le compte du contact, borné à l'espace. `null` = aucun compte rattaché. */
  account: { company_name: string | null; raw_analysis: Record<string, unknown> | null } | null
  /** TOUS les contacts du compte (homonymes) — le contact lui-même inclus. */
  accountContacts: readonly PreflightContactRow[]
  flaggedIncorrectContactIds: ReadonlySet<string>
  /** `ProvenanceService.currentSources('contact', id)` — qui a écrit chaque champ. */
  fieldSources: Partial<Record<string, FieldSource>>
}): PreflightFacts {
  const { contact, account, fieldSources } = input
  const entity = usableEntity(contact.entity)
  const rawAnalysis = account?.raw_analysis ?? null

  let accountScope: PreflightFacts['accountScope']
  if (!contact.account_id || !account) {
    accountScope = { state: 'unknown', reason: 'no_account' }
  } else {
    const rows = input.accountContacts.some(row => row.id === contact.id)
      ? input.accountContacts
      : [...input.accountContacts, contact]
    const { excluded } = filterEligibleContacts(rows, rawAnalysis, input.flaggedIncorrectContactIds)
    const exclusion = excluded.find(entry => entry.contact_id === contact.id)?.reason ?? null
    if (exclusion) accountScope = { state: 'evaluated', exclusion, entity }
    else if (buildEntityScoreContext(rawAnalysis).size === 0)
      accountScope = { state: 'unknown', reason: 'no_account_scope_mapped' }
    else if (!entity) accountScope = { state: 'unknown', reason: 'no_contact_entity' }
    else accountScope = { state: 'evaluated', exclusion: null, entity }
  }

  const details = apolloDetailsOf(contact)
  const companyName = account?.company_name?.trim() || null
  const humanRow = isHumanEnteredContact(contact.source)

  const difference = companyName ? employerDifference(contact.source, details, companyName, contact.entity) : null
  const employer = difference
    ? {
        recordValue: entity ?? companyName,
        sourceValue: difference.detectedEmployer,
        recordKeptByHuman: difference.recordKeptByHuman || fieldSources.entity === 'human',
      }
    : null

  const sourceTitle = details?.employmentHistory?.find(entry => entry?.current)?.title?.trim() || null
  const title = sourceTitle
    ? {
        recordValue: contact.title?.trim() || null,
        sourceValue: sourceTitle,
        recordKeptByHuman: humanRow || fieldSources.title === 'human',
      }
    : null

  return { accountScope, employer, title }
}
