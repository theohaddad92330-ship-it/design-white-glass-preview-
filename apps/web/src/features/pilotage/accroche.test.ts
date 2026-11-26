import { describe, expect, it } from 'vitest'
import { evaluatePilotageChain, type PilotageInputs } from '@bellum/contracts'
import { pilotageHeadline } from './accroche'

/**
 * #2108.21 → .25 / #2208.29 — L'ACCROCHE, ET CE QU'ELLE NE DIT PAS.
 *
 * La lecture vit sur `/pilotage` ; la page d'arrivée n'en porte que l'accroche.
 * Ce que cette suite tient : les trois seaux s'ADDITIONNENT (« non mesuré » est
 * un seau nommé, pas un zéro fondu dans les autres), et une chaîne non lue ne
 * rend PAS trois zéros — « je n'ai pas lu » n'est pas « tout va bien ».
 */
const INPUTS: PilotageInputs = {
  contactsTargeted: 40,
  signals: 12,
  profilesPushed: 3,
  emailsSent: 20,
  replied: 6,
  meetings: 3,
  needsQualified: 4,
  needsTriaged: 10,
  needsDecided: 3,
  benchAvailable: 8,
  conversions: 2,
  marginBand: null,
  activeClients: 5,
  rejectedItems: 1,
  totalContacts: 120,
}

describe('pilotageHeadline — trois seaux qui s’additionnent', () => {
  it('compte les maillons par état, et le total est la somme', () => {
    const headline = pilotageHeadline(evaluatePilotageChain(INPUTS))

    expect(headline).not.toBeNull()
    const { alerting, unmeasured, healthy, total } = headline as NonNullable<typeof headline>
    expect(alerting + unmeasured + healthy).toBe(total)
    // La chaîne réelle du contrat : huit maillons, et l'économie n'est pas
    // captée — elle est NOMMÉE non mesurée, pas comptée à zéro dans « tient ».
    expect(total).toBe(8)
    expect(unmeasured).toBeGreaterThan(0)
  })

  it('n’affirme RIEN sur une chaîne non lue — pas trois zéros', () => {
    expect(pilotageHeadline(undefined)).toBeNull()
    expect(pilotageHeadline(null)).toBeNull()
  })

  it('ne rend rien non plus sur une chaîne VIDE — un total de 0 n’est pas une lecture', () => {
    expect(pilotageHeadline({ levels: [] } as never)).toBeNull()
  })

  it('un espace neuf, lu ENTIÈREMENT, n’est pas une chaîne non lue (témoin)', () => {
    // Tout est à zéro et tout a été lu : l'accroche existe, et elle le dit.
    const zeroes = pilotageHeadline(
      evaluatePilotageChain({
        contactsTargeted: 0,
        signals: 0,
        profilesPushed: 0,
        emailsSent: 0,
        replied: 0,
        meetings: 0,
        needsQualified: 0,
        needsTriaged: 0,
        needsDecided: 0,
        benchAvailable: 0,
        conversions: 0,
        marginBand: null,
        activeClients: 0,
        rejectedItems: 0,
        totalContacts: 0,
      }),
    )
    expect(zeroes).not.toBeNull()
    expect(zeroes?.total).toBe(8)
  })
})
