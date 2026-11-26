import { describe, expect, it } from 'vitest'
import { findConfrontationPairs, type CrmConfrontationContact } from './crm-confrontation.js'

/**
 * #2120.48 — décision Louis 18/09/2026 : on PROPOSE une fusion de doublons
 * entre ce que le CRM connaît déjà et ce que Bellum a trouvé, jamais on ne
 * fusionne. Ces tests savent dire NON :
 *   1. deux fiches CÔTÉ CRM (ou deux fiches côté Bellum) ne sont jamais
 *      rapprochées entre elles — seule une paire CRM↔Bellum compte ;
 *   2. deux homonymes sans aucune adresse commune restent proposés (le nom
 *      suffit dans le périmètre d'UN compte), mais à confiance plus basse
 *      que l'adresse ;
 *   3. une fiche sans nom NI adresse n'est comparée à rien.
 */
describe('#2120.48 — findConfrontationPairs', () => {
  const crm = (id: string, fullName: string | null, email: string | null): CrmConfrontationContact => ({
    id,
    fullName,
    email,
  })
  const bellum = crm

  it('rapproche par adresse, confiance haute', () => {
    const pairs = findConfrontationPairs(
      [crm('crm-1', 'S. Pata', 'Sandrine.Pata@Example.com')],
      [bellum('b-1', 'Sandrine Pata', 'sandrine.pata@example.com')],
    )
    expect(pairs).toEqual([
      {
        crmContact: { id: 'crm-1', fullName: 'S. Pata', email: 'Sandrine.Pata@Example.com' },
        bellumContact: { id: 'b-1', fullName: 'Sandrine Pata', email: 'sandrine.pata@example.com' },
        reason: 'same_email',
        confidence: 0.95,
      },
    ])
  })

  it('rapproche par nom (accents et casse pliés) quand aucune adresse ne matche', () => {
    const pairs = findConfrontationPairs([crm('crm-1', 'sandrine pàta', null)], [bellum('b-1', 'Sandrine Pata', null)])
    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toMatchObject({ reason: 'same_name', confidence: 0.7 })
  })

  it('SAIT DIRE NON — deux fiches du MÊME côté (CRM↔CRM) ne sont jamais rapprochées', () => {
    const pairs = findConfrontationPairs(
      [
        crm('crm-1', 'Sandrine Pata', 'sandrine.pata@example.com'),
        crm('crm-2', 'Sandrine Pata', 'sandrine.pata@example.com'),
      ],
      [],
    )
    expect(pairs).toEqual([])
  })

  it('SAIT DIRE NON — deux fiches du MÊME côté (Bellum↔Bellum) ne sont jamais rapprochées', () => {
    const pairs = findConfrontationPairs(
      [],
      [
        bellum('b-1', 'Sandrine Pata', 'sandrine.pata@example.com'),
        bellum('b-2', 'Sandrine Pata', 'sandrine.pata@example.com'),
      ],
    )
    expect(pairs).toEqual([])
  })

  it("N'ATTRAPE PAS CE QU'ELLE NE VISE PAS — un homonyme partiel n'est pas un doublon", () => {
    const pairs = findConfrontationPairs([crm('crm-1', 'Sandrine Patat', null)], [bellum('b-1', 'Sandrine Pata', null)])
    expect(pairs).toEqual([])
  })

  it('SAIT DIRE NON — une fiche sans nom ni adresse ne rapproche jamais rien', () => {
    const pairs = findConfrontationPairs([crm('crm-1', null, null)], [bellum('b-1', null, null)])
    expect(pairs).toEqual([])
  })

  it('trie par confiance décroissante et respecte la limite', () => {
    const pairs = findConfrontationPairs(
      [crm('crm-1', 'Sandrine Pata', null), crm('crm-2', 'Marc Dupont', 'marc.dupont@example.com')],
      [bellum('b-1', 'Sandrine Pata', null), bellum('b-2', 'Marc Dupont', 'marc.dupont@example.com')],
      1,
    )
    expect(pairs).toHaveLength(1)
    expect(pairs[0]?.reason).toBe('same_email')
  })
})
