import type { PartnerEvidenceOrigin } from '@bellum/contracts'
import { applyDeclaredSubcontracting } from './declared-subcontracting'

const normalize = (name: string): string => name.trim().toLowerCase()

describe('applyDeclaredSubcontracting — #1624.7', () => {
  it('ajoute declared_subcontracting quand le référentiel dit "oui"', () => {
    const partners = [{ name: 'Nordiq', evidence_origins: ['market_observation'] as PartnerEvidenceOrigin[] }]
    const facts = new Map([['nordiq', { openToSubcontracting: 'oui' }]])

    const result = applyDeclaredSubcontracting(partners, facts, normalize)

    expect(result[0]?.evidence_origins).toEqual(['market_observation', 'declared_subcontracting'])
  })

  it('n’ajoute RIEN quand le référentiel dit "non"', () => {
    const partners = [{ name: 'Nordiq', evidence_origins: [] as PartnerEvidenceOrigin[] }]
    const facts = new Map([['nordiq', { openToSubcontracting: 'non' }]])

    const result = applyDeclaredSubcontracting(partners, facts, normalize)

    expect(result[0]?.evidence_origins).toEqual([])
  })

  it('n’ajoute RIEN quand le référentiel ne connaît pas cette ESN — une absence n’est jamais un « non »', () => {
    const partners = [{ name: 'ESN Inconnue', evidence_origins: [] as PartnerEvidenceOrigin[] }]
    const facts = new Map<string, { openToSubcontracting: string }>()

    const result = applyDeclaredSubcontracting(partners, facts, normalize)

    expect(result[0]?.evidence_origins).toEqual([])
  })

  it('n’ajoute RIEN quand le référentiel dit "inconnu"', () => {
    const partners = [{ name: 'Nordiq', evidence_origins: [] as PartnerEvidenceOrigin[] }]
    const facts = new Map([['nordiq', { openToSubcontracting: 'inconnu' }]])

    const result = applyDeclaredSubcontracting(partners, facts, normalize)

    expect(result[0]?.evidence_origins).toEqual([])
  })

  it('ne double pas l’origine si elle est déjà présente', () => {
    const partners = [{ name: 'Nordiq', evidence_origins: ['declared_subcontracting'] as PartnerEvidenceOrigin[] }]
    const facts = new Map([['nordiq', { openToSubcontracting: 'oui' }]])

    const result = applyDeclaredSubcontracting(partners, facts, normalize)

    expect(result[0]?.evidence_origins).toEqual(['declared_subcontracting'])
  })

  it('passe la normalisation FOURNIE, jamais une comparaison brute — "SG" et "Société Générale" ne se confondent pas', () => {
    const partners = [{ name: 'Nordiq SAS', evidence_origins: [] as PartnerEvidenceOrigin[] }]
    const facts = new Map([['nordiq', { openToSubcontracting: 'oui' }]])
    // Une normalisation triviale (trim + minuscule) NE retire pas "sas" : le
    // rapprochement échoue, ce qui prouve que la fonction ne rapproche pas
    // elle-même — elle délègue entièrement à ce qu'on lui passe.
    const result = applyDeclaredSubcontracting(partners, facts, normalize)
    expect(result[0]?.evidence_origins).toEqual([])
  })
})
