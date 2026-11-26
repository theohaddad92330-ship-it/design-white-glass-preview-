import type { CrmDealAccountLinkBasis } from '@bellum/contracts'
import { domainFromWebsite } from './crm-presence'

/**
 * #3918.a (lot M01, 09/10/2026) — la jointure deal CRM → compte.
 *
 * `crm_deal_facts` ne portait aucun lien vers `accounts` : les signaux CRM
 * (`affaire_perdue` / `affaire_dormante` / `affaire_renouvellement`) avaient
 * pour seul sujet le deal, et aucun écran ne pouvait les montrer sous le bon
 * compte. Rattacher par le NOM de la société serait un rapprochement par
 * homonymie (doctrine, entity-resolution #2284.28 : « le nom seul ne résout
 * jamais »). Trois clés, dans cet ordre, et seulement elles :
 *
 *  1. `crm_company_id` — l'id société CHEZ LE FOURNISSEUR (HubSpot company
 *     id, Salesforce AccountId), retrouvé dans `sync_links` (`entity_type =
 *     'account'`) : le lien que l'import CRM a lui-même posé.
 *  2. `siren` — le SIREN de la société côté CRM, égal à `accounts.siren`.
 *  3. `domain` — le domaine de la société côté CRM, égal au domaine du site
 *     du compte (`domainFromWebsite`, même normalisation que la présence CRM).
 *
 *  4. `name` (lot 762 P5, décision Louis 31/10) — DERNIER RECOURS, quand le deal n'a aucune des trois clés :
 *     le nom normalisé (casse, accents, ponctuation — jamais un suffixe retiré ni un sigle deviné) de la société
 *     CRM, retenu UNIQUEMENT s'il désigne UN seul compte de l'espace. Ambigu ⇒ non rattaché : on propose,
 *     on ne fusionne jamais. (Cela relève la règle « le nom seul ne résout jamais » pour ce seul cas.)
 *
 * Deux comptes du même espace pour la même clé : ambigu, AUCUN rattachement
 * (jamais un choix arbitraire). Pure : le balayage lui passe ce qu'il a lu.
 */

type DealAccountLink = { accountId: string; basis: CrmDealAccountLinkBasis }

/** Ce que le deal sait de sa société chez le fournisseur. `name` et
 *  `company_name` sont acceptés pour que l'appelant passe la ligne telle
 *  quelle — ils ne sont JAMAIS lus pour joindre. */
export type DealCompanyKeys = {
  name?: string | null
  company_name?: string | null
  company_external_id: string | null
  company_siren: string | null
  company_domain: string | null
  /** Lot 762 P5 — la raison sociale CRM : lue SEULEMENT en dernier recours, jamais `name` (qui est le nom du DEAL). */
  company_label?: string | null
}

export type DealAccountCandidate = {
  id: string
  company_name?: string | null
  siren: string | null
  website: string | null
}

/** Un SIREN : exactement neuf chiffres, espaces tolérés. Tout le reste n'est pas une clé. */
export function normalizeSiren(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\s+/g, '')
  return /^\d{9}$/.test(digits) ? digits : null
}

function single(ids: readonly string[]): string | null {
  const distinct = [...new Set(ids)]
  return distinct.length === 1 ? distinct[0] : null
}

/**
 * Nom comparable : sans accents, sans ponctuation, en minuscules — JAMAIS de suffixe juridique retiré ni de sigle deviné.
 * Local à ce fichier : `crm-duplicates.ts` importe déjà `normalizeSiren` d'ici, l'importer en retour ferait un cycle.
 */
function companyLabelKey(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function resolveDealAccount(
  deal: DealCompanyKeys,
  context: { companyLinks: ReadonlyMap<string, string>; accounts: readonly DealAccountCandidate[] },
): DealAccountLink | null {
  const externalId = deal.company_external_id?.trim()
  if (externalId) {
    const accountId = context.companyLinks.get(externalId)
    if (accountId) return { accountId, basis: 'crm_company_id' }
  }

  const siren = normalizeSiren(deal.company_siren)
  if (siren) {
    const accountId = single(context.accounts.filter(a => normalizeSiren(a.siren) === siren).map(a => a.id))
    if (accountId) return { accountId, basis: 'siren' }
  }

  const domain = domainFromWebsite(deal.company_domain)
  if (domain) {
    const accountId = single(context.accounts.filter(a => domainFromWebsite(a.website) === domain).map(a => a.id))
    if (accountId) return { accountId, basis: 'domain' }
  }

  // Dernier recours : le nom, univoque ou rien. Les trois clés ci-dessus l'emportent toujours.
  const label = companyLabelKey(deal.company_label)
  if (label.length >= 3) {
    const accountId = single(context.accounts.filter(a => companyLabelKey(a.company_name) === label).map(a => a.id))
    if (accountId) return { accountId, basis: 'name' }
  }

  return null
}
