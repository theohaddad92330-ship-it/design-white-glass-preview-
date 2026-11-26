import type { AccountIntelligenceContextView, CommercialBrief } from '@bellum/contracts'
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { useTranslation } from 'react-i18next'
import { PresentEsnList } from './PresentEsnList'

const useAccountIntelligenceContext = vi.hoisted(() => vi.fn())
const useAccountMarketContext = vi.hoisted(() => vi.fn())
vi.mock('@/features/accounts/hooks/useAccountIntelligenceContext', () => ({ useAccountIntelligenceContext }))
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({ useAccountMarketContext }))

/**
 * K.2 / #4323 — UNE SEULE liste des ESN présentes : le brief, l'ESN en place et l'historique observé
 * fusionnés par nom, chaque ligne avec son niveau de preuve en mots et sa date.
 */
const BRIEF_ESN: CommercialBrief['esn'] = [
  { name: 'Sopra Steria', evidence_level: 'confirmed', proof: 'Contrat cadre 2024', reliability: 'high' },
  { name: 'Alten', evidence_level: 'hint', proof: 'Cité dans un appel d’offres', reliability: 'low' },
] as CommercialBrief['esn']

const INTELLIGENCE = {
  incumbentEsn: {
    state: 'known',
    value: [{ name: 'Sopra  Steria', contractType: null, strengths: 'Ancrage local', weaknesses: null }],
    provenance: { source: 'human_correction', observedAt: '2026-10-10T00:00:00.000Z' },
  },
} as unknown as AccountIntelligenceContextView

function mount(over: { intelligence?: unknown; market?: unknown; exEsnProfilesNote?: boolean } = {}) {
  useAccountIntelligenceContext.mockReturnValue({ data: over.intelligence ?? INTELLIGENCE })
  useAccountMarketContext.mockReturnValue({
    data: over.market ?? {
      paths_observed: 12,
      esn_observed: 2,
      esn_observed_detail: [
        { esnName: 'sopra steria', persons: 7, certainty: 'forte' },
        { esnName: 'Capgemini', persons: 3, certainty: 'forte' },
      ],
    },
  })
  return renderWithRouter(
    <PresentEsnList
      accountId="acc-1"
      esn={BRIEF_ESN}
      generatedAt="2026-10-01T08:00:00.000Z"
      exEsnProfilesNote={over.exEsnProfilesNote}
    />,
  )
}

describe('PresentEsnList (#4323)', () => {
  it('rend UNE ligne par société, avec la preuve en mots et la date', async () => {
    mount()
    const list = await screen.findByTestId('present-esn')
    // Sopra Steria, Alten, Capgemini : trois sociétés, pas quatre lignes.
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(within(list).getAllByText('Sopra Steria')).toHaveLength(1)
    // La preuve la plus forte (déclaré, corrigé par l'humain) et la date la plus récente (10/10).
    const sopra = within(list).getByTestId('present-esn-sopra steria')
    expect(sopra).toHaveTextContent(/déclaré/i)
    expect(sopra).toHaveTextContent(/10\/10\/2026|10 oct/i)
    expect(sopra).toHaveTextContent('Ancrage local')
    expect(within(list).getByTestId('present-esn-alten')).toHaveTextContent(/déduit/i)
    expect(within(list).getByTestId('present-esn-capgemini')).toHaveTextContent(/observé/i)
  })

  it('nomme une date inconnue au lieu de l’inventer, et ne nomme aucun fournisseur', async () => {
    mount()
    const capgemini = await screen.findByTestId('present-esn-capgemini')
    expect(capgemini).toHaveTextContent(/date inconnue/i)
    expect(screen.getByTestId('present-esn').textContent).not.toMatch(/dataforge|apollo|pappers|firecrawl/i)
  })

  it('sait dire NON : sans aucune société, la rubrique ne rend rien', () => {
    useAccountIntelligenceContext.mockReturnValue({ data: undefined })
    useAccountMarketContext.mockReturnValue({ data: undefined })
    const { container } = renderWithRouter(
      <PresentEsnList accountId="acc-1" esn={[]} generatedAt="2026-10-01T08:00:00.000Z" />,
    )
    expect(container.querySelector('[data-testid="present-esn"]')).toBeNull()
  })

  // #4323.2 — le nombre annoncé est le nombre de lignes affichables, ou « 8 affichées sur 17 » avec le geste pour le reste.
  describe('17 sociétés, 8 montrées (#4323.2)', () => {
    const BIG_BRIEF = [
      { name: 'Declared A', evidence_level: 'confirmed', proof: 'Contrat', reliability: 'high' },
      { name: 'Declared B', evidence_level: 'confirmed', proof: 'Contrat', reliability: 'high' },
      ...Array.from({ length: 6 }, (_, i) => ({
        name: `Observed ${i}`,
        evidence_level: 'observed',
        proof: 'Offres',
        reliability: 'medium',
      })),
      ...Array.from({ length: 9 }, (_, i) => ({
        name: `Hint ${i}`,
        evidence_level: 'hint',
        proof: 'Indice',
        reliability: 'low',
      })),
    ] as CommercialBrief['esn']

    function Harness() {
      const { t } = useTranslation('accounts', { keyPrefix: 'commercialBrief' })
      return <PresentEsnList accountId="acc-1" esn={BIG_BRIEF} generatedAt="2026-10-01T08:00:00.000Z" showMoreT={t} />
    }

    it('dit « 8 affichés sur 17 » et offre le geste pour voir le reste — jamais une clé brute', async () => {
      useAccountIntelligenceContext.mockReturnValue({ data: undefined })
      useAccountMarketContext.mockReturnValue({ data: undefined })
      renderWithRouter(<Harness />)
      const list = await screen.findByTestId('present-esn')
      expect(within(list).getAllByRole('listitem')).toHaveLength(8)
      expect(list).toHaveTextContent('8 affichés sur 17')
      expect(within(list).getByTestId('present-esn-more')).toHaveTextContent('Voir 9 de plus')
      expect(list.textContent).not.toMatch(/showMore\./)
    })

    it('la synthèse lit les MÊMES lignes que la liste : 2 déclarées, 6 observées, 9 déduites', async () => {
      useAccountIntelligenceContext.mockReturnValue({ data: undefined })
      useAccountMarketContext.mockReturnValue({ data: undefined })
      renderWithRouter(<Harness />)
      const summary = await screen.findByTestId('present-esn-summary')
      expect(summary).toHaveTextContent('2 déclarées')
      expect(summary).toHaveTextContent('6 observées')
      expect(summary).toHaveTextContent('9 déduites')
    })

    it('sans société d’un niveau de preuve, ce niveau n’est pas écrit (jamais « 0 déclarée »)', async () => {
      mount()
      const summary = await screen.findByTestId('present-esn-summary')
      expect(summary).not.toHaveTextContent(/\b0\b/)
    })
  })

  // #4323.1 — le compteur de l'en-tête ne change pas de valeur en route : absent tant qu'une lecture charge.
  it('n’annonce aucun total tant que les autres sources chargent, puis le total complet', async () => {
    useAccountIntelligenceContext.mockReturnValue({ data: undefined, isLoading: true })
    useAccountMarketContext.mockReturnValue({ data: undefined, isLoading: true })
    const { unmount } = renderWithRouter(
      <PresentEsnList accountId="acc-1" esn={BRIEF_ESN} generatedAt="2026-10-01T08:00:00.000Z" />,
    )
    const title = (await screen.findByTestId('present-esn')).querySelector('summary')
    expect(title?.textContent).not.toMatch(/\d/)
    unmount()
    mount()
    expect((await screen.findByTestId('present-esn')).querySelector('summary')?.textContent).toMatch(/3/)
  })

  it('#4323.4 — dit le lien entre N ESN (sociétés) et « N profils ex-ESN » (personnes) quand une rubrique cite ces profils', async () => {
    mount({ exEsnProfilesNote: true })
    expect(await screen.findByTestId('present-esn-unit-note')).toHaveTextContent(/profils ex-ESN/i)
    expect(screen.getByTestId('present-esn-unit-note')).toHaveTextContent(/personnes/i)
  })

  it('#4323.4 — sans rubrique qui cite les profils ex-ESN, aucune note (une absence ne fait aucune ligne)', async () => {
    mount()
    await screen.findByTestId('present-esn')
    expect(screen.queryByTestId('present-esn-unit-note')).toBeNull()
  })

  // #4323.1 (recette prod 28/10) — « ESN présentes 11 » nu, sans un nom : replié, le compteur porte sa ventilation
  // par niveau de preuve ; seul un nombre accompagné de ce qu'il compte passe.
  it('le compteur replié n’est jamais nu : il porte sa ventilation par preuve', async () => {
    mount()
    const summary = (await screen.findByTestId('present-esn')).querySelector('summary')
    expect(summary).toHaveTextContent('3')
    expect(summary).toHaveTextContent(/déclarée/)
    expect(summary).toHaveTextContent(/déduite|observée/)
  })
})
