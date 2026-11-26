import {
  ACCOUNT_JOB_OFFERS_MAX,
  demoAccountJobOffers,
  toAccountJobOffer,
  type AccountJobOffer,
  type AccountJobOffers,
} from '@bellum/contracts'

type SearchOffers = (input: {
  company: string
  term: string
  website: string | null
  siren: string | null
}) => Promise<{ offers: unknown[]; searched: boolean }>

/**
 * Louis 30/10 — les offres d'un compte DÉJÀ ouvert par la porte d'appartenance, pour le métier saisi
 * (vide : tous métiers), au plus 50. En démo : les offres semées du dossier, jamais une collecte.
 */
export async function loadAccountJobOffers(
  search: SearchOffers,
  account: { company_name: string | null; raw_analysis: unknown; website?: string | null; siren?: string | null },
  term: string,
  demo: boolean,
): Promise<AccountJobOffers> {
  if (demo) {
    const raw = (account.raw_analysis ?? {}) as Record<string, unknown>
    return demoAccountJobOffers(raw['it_job_signals'], term)
  }
  const { offers, searched } = await search({
    company: account.company_name ?? '',
    term,
    website: account.website ?? null,
    siren: account.siren ?? null,
  })
  return {
    term,
    searched,
    offers: offers
      .map(toAccountJobOffer)
      .filter((o): o is AccountJobOffer => o !== null)
      .slice(0, ACCOUNT_JOB_OFFERS_MAX),
  }
}
