import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { MatchResult } from '@bellum/contracts'
import { CompareTable } from './CompareTable'

/**
 * #2176.51/.52/.54 — le tableau de comparaison ne montrait que les scores
 * (axes + correspondance/poussable) : les PREUVES, les ÉCARTS et les RISQUES
 * existaient déjà dans `MatchResult` (`skills[].proof`, `gaps`,
 * `exclusions`/`flags`) mais seule la carte les affichait — jamais la
 * comparaison.
 */
function result(over: Partial<MatchResult> & Pick<MatchResult, 'consultantId'>): MatchResult {
  return {
    axes: [{ axis: 'must_have', score: 90, weight: 25, detail: 'Spark prouvé', evidence: [] }],
    correspondenceScore: 84,
    pushableScore: 71,
    bucket: 'recommended',
    exclusions: [],
    skills: [],
    gaps: [],
    adjacency: [],
    questionsToValidate: [],
    flags: [],
    ...over,
  }
}

const nameOf = (id: string) => (id === 'c-1' ? 'Alice Martin' : 'Bob Dupont')

describe('CompareTable — preuves, écarts et risques (#2176.51/.52/.54)', () => {
  it('affiche la preuve des compétences prouvées, par profil', () => {
    render(
      <CompareTable
        results={[
          result({
            consultantId: 'c-1',
            skills: [
              {
                term: 'spark',
                label: 'Spark',
                required: true,
                status: 'matched',
                coverage: 1,
                level: 'senior',
                source: 'cv',
                proof: '3 ans chez Renault, pipeline Spark Streaming',
                levelUnknown: false,
              },
            ],
          }),
          result({ consultantId: 'c-2' }),
        ]}
        nameOf={nameOf}
      />,
    )
    expect(screen.getByText(/3 ans chez Renault, pipeline Spark Streaming/)).not.toBeNull()
  })

  it('affiche les écarts (`gaps`), par profil', () => {
    render(
      <CompareTable
        results={[result({ consultantId: 'c-1', gaps: ['Kubernetes non prouvé'] }), result({ consultantId: 'c-2' })]}
        nameOf={nameOf}
      />,
    )
    expect(screen.getByText('Kubernetes non prouvé')).not.toBeNull()
  })

  it('affiche les risques (exclusions + drapeaux), par profil', () => {
    render(
      <CompareTable
        results={[
          result({
            consultantId: 'c-1',
            exclusions: [{ reason: 'rate_out_of_range', severity: 'blocking', detail: 'TJM cible hors budget' }],
            flags: [{ kind: 'previously_rejected_by_client', detail: 'Déjà refusé chez ce client', at: null }],
          }),
          result({ consultantId: 'c-2' }),
        ]}
        nameOf={nameOf}
      />,
    )
    expect(screen.getByText('TJM cible hors budget')).not.toBeNull()
    expect(screen.getByText('Déjà refusé chez ce client')).not.toBeNull()
  })
})

/**
 * #2968 (#2336.13) — un besoin qui heurte une préférence DÉCLARÉE par le
 * consultant (type de contrat voulu, notamment) se voit sur SA propre ligne,
 * nommée « Préférence du consultant heurtée » — jamais fondu dans la ligne
 * générique « Risques » aux côtés d'un refus client ou d'un consentement
 * expiré : c'était encore une NOTE, alors que `matching.service.ts`
 * transmettait déjà le drapeau (`preferenceWarnings` → `flags`,
 * `kind: 'preference_warning'`, `MATCH_FLAG_TONES` déjà 'warning').
 */
describe('CompareTable — préférence du consultant heurtée, nommée (#2968, #2336.13)', () => {
  it('rend le drapeau `preference_warning` sur SA PROPRE ligne, pas dans « Risques »', () => {
    render(
      <CompareTable
        results={[
          result({
            consultantId: 'c-1',
            flags: [
              {
                kind: 'preference_warning',
                detail: 'la mission est en régie, hors des types de contrat qu’il a déclaré vouloir',
                at: null,
              },
            ],
          }),
          result({ consultantId: 'c-2' }),
        ]}
        nameOf={nameOf}
      />,
    )
    const warningRow = screen.getByText('Préférence du consultant heurtée').closest('tr')
    expect(warningRow).not.toBeNull()
    expect(
      within(warningRow as HTMLElement).getByText(
        'la mission est en régie, hors des types de contrat qu’il a déclaré vouloir',
      ),
    ).not.toBeNull()

    // La ligne « Risques » ne le répète pas — sinon le même fait apparaîtrait
    // deux fois, une note ET un avertissement.
    const risksRow = screen.getByText('Risques').closest('tr')
    expect(risksRow).not.toBeNull()
    expect(
      within(risksRow as HTMLElement).queryByText(
        'la mission est en régie, hors des types de contrat qu’il a déclaré vouloir',
      ),
    ).toBeNull()
  })

  it('dit « Aucune » quand aucune préférence n’est heurtée pour ce profil', () => {
    render(
      <CompareTable results={[result({ consultantId: 'c-1' }), result({ consultantId: 'c-2' })]} nameOf={nameOf} />,
    )
    const warningRow = screen.getByText('Préférence du consultant heurtée').closest('tr')
    expect(within(warningRow as HTMLElement).getAllByText('Aucune')).toHaveLength(2)
  })

  it('un autre drapeau (refus client) reste dans « Risques », jamais dans la ligne préférence', () => {
    render(
      <CompareTable
        results={[
          result({
            consultantId: 'c-1',
            flags: [{ kind: 'previously_rejected_by_client', detail: 'Déjà refusé chez ce client', at: null }],
          }),
          result({ consultantId: 'c-2' }),
        ]}
        nameOf={nameOf}
      />,
    )
    const warningRow = screen.getByText('Préférence du consultant heurtée').closest('tr')
    expect(within(warningRow as HTMLElement).queryByText('Déjà refusé chez ce client')).toBeNull()
    const risksRow = screen.getByText('Risques').closest('tr')
    expect(within(risksRow as HTMLElement).getByText('Déjà refusé chez ce client')).not.toBeNull()
  })
})

describe('CompareTable — conditions (#2176.53)', () => {
  it('affiche le TJM, la disponibilité et le lieu quand ils sont connus', () => {
    render(
      <CompareTable
        results={[result({ consultantId: 'c-1' }), result({ consultantId: 'c-2' })]}
        nameOf={nameOf}
        identities={
          new Map([
            ['c-1', { dailyRateCents: 65000, availableFrom: '2026-10-15', location: 'Lyon' }],
            ['c-2', { dailyRateCents: null, availableFrom: null, location: null }],
          ])
        }
      />,
    )
    expect(screen.getByText('650 €/j')).not.toBeNull()
    expect(screen.getByText(/Disponible dès le/)).not.toBeNull()
    expect(screen.getByText('Lyon')).not.toBeNull()
  })

  it("dit « Non renseignées » quand aucune condition n'est connue pour ce profil", () => {
    render(
      <CompareTable
        results={[result({ consultantId: 'c-1' }), result({ consultantId: 'c-2' })]}
        nameOf={nameOf}
        identities={new Map([['c-1', { dailyRateCents: null, availableFrom: null, location: null }]])}
      />,
    )
    expect(screen.getAllByText('Non renseignées').length).toBeGreaterThan(0)
  })

  it('sans `identities` du tout, ne fabrique aucune condition (jamais de donnée fictive)', () => {
    render(
      <CompareTable results={[result({ consultantId: 'c-1' }), result({ consultantId: 'c-2' })]} nameOf={nameOf} />,
    )
    expect(screen.getAllByText('Non renseignées').length).toBe(2)
  })
})

/**
 * #2176.55 — coût et marge, SELON LES DROITS. L'API ne pose `finance` sur une
 * identité que sous `finance:read` (`compare-cost-margin.spec.ts`) : l'écran
 * suit cette présence — sans elle, la ligne n'existe pas.
 */
describe('CompareTable — coût et marge selon le droit finance (#2176.55)', () => {
  const pair = [result({ consultantId: 'c-1' }), result({ consultantId: 'c-2' })]

  it('AVEC le droit : une ligne « Coût / marge » par profil, une marge absente nommée, jamais 0', () => {
    const identities = new Map([
      ['c-1', { dailyRateCents: 62000, finance: { costCents: 41000, marginCents: 21000 } }],
      ['c-2', { dailyRateCents: 65000, finance: { costCents: null, marginCents: null } }],
    ])
    render(<CompareTable results={pair} nameOf={nameOf} identities={identities} />)
    const row = screen.getByText('Coût / marge').closest('tr') as HTMLElement
    expect(row).not.toBeNull()
    expect(within(row).getByText('Coût 410 €/j')).not.toBeNull()
    expect(within(row).getByText('Marge 210 €/j')).not.toBeNull()
    expect(within(row).getByText('Coût non renseigné')).not.toBeNull()
    expect(within(row).queryByText(/Marge 0/)).toBeNull()
  })

  it('SANS le droit (aucune identité ne porte `finance`) : la ligne n’existe pas', () => {
    const identities = new Map([
      ['c-1', { dailyRateCents: 62000 }],
      ['c-2', { dailyRateCents: 65000 }],
    ])
    render(<CompareTable results={pair} nameOf={nameOf} identities={identities} />)
    expect(screen.queryByText('Coût / marge')).toBeNull()
  })
})
