import type { Contact } from '@bellum/contracts'
import { useMemo, useState } from 'react'
import { useAccountSignalLines } from '@/features/accounts/hooks/useAccountSignalLines'
import { useAccountRawAnalysis } from '@/features/accounts/hooks/useAccountRawAnalysis'
import { useApproachAccount } from './approach-api'
import { defaultGroundingIds, groundingFacts, groundingPayload, type GroundingChoice } from './approach-grounding'

/**
 * #4524 — tout ce que les onglets E-mail, LinkedIn et Appel partagent pour « Sur quoi {copilote} s'appuie » : les faits
 * lus de la fiche, le choix du commercial (par défaut les deux meilleurs signaux), ce qui part au moteur, et le nom du
 * COMPTE. `homonymDoubt` (#4524.9) : la fiche a un doute d'identité non levé. Un seul endroit : les trois onglets ne recalculent rien chacun de leur côté.
 */
export function useApproachGrounding(contact: Contact, homonymDoubt = false, preferOffers = false) {
  const rawAnalysis = useAccountRawAnalysis(contact.account_id)
  const account = useApproachAccount(contact.account_id)
  // #4977.1 — l'appel part de l'offre RÉCENTE que l'onglet « Signaux & besoins » montre : lue seulement pour l'appel.
  const signalLines = useAccountSignalLines(preferOffers ? (contact.account_id ?? '') : '').data?.lines
  const facts = useMemo(
    () => groundingFacts({ rawAnalysis, contact, homonymDoubt, accountWebsite: account.website, signalLines }),
    [rawAnalysis, contact, homonymDoubt, account.website, signalLines],
  )
  const [picked, setPicked] = useState<GroundingChoice | null>(null)
  const hasFacts = facts.account.length + facts.contact.length > 0
  const choice = useMemo<GroundingChoice | null>(
    () => picked ?? (hasFacts ? { mode: 'facts', ids: defaultGroundingIds(facts, { preferOffers }) } : null),
    [picked, hasFacts, facts, preferOffers],
  )
  const grounding = useMemo(() => groundingPayload(choice, facts), [choice, facts])
  return { rawAnalysis, facts, choice, setChoice: setPicked, grounding, account }
}
