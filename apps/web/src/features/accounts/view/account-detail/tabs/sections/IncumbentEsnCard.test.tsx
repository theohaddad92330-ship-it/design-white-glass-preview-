import type { AccountIntelligenceContextView } from '@bellum/contracts'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { IncumbentEsnCard } from './IncumbentEsnCard'

// #2116.10 — `IncumbentEsnCard` lit désormais l'ESN en place au contexte
// canonique (`useAccountIntelligenceContext`), jamais recalculée depuis
// `raw_analysis` : ce fichier mocke la façade, pas `raw_analysis`.
const useAccountIntelligenceContext = vi.hoisted(() => vi.fn())
vi.mock('@/features/accounts/hooks/useAccountIntelligenceContext', () => ({ useAccountIntelligenceContext }))

// `IncumbentEsnCard` appelle aussi `useAccountMarketContext` (pour corroborer
// un nom par la mémoire marché) — voir `IncumbentEsnCard.marketMemory.test.tsx`
// pour les tests de la corroboration elle-même. Désactivé ici : c'est le
// contexte canonique qui est sous test.
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: undefined }),
}))

function context(
  incumbentEsn: AccountIntelligenceContextView['incumbentEsn'] = { state: 'unknown' },
): AccountIntelligenceContextView {
  return {
    accountId: 'acc-1',
    // #3219 (#190.1) — aucune contradiction de champ ouverte sur ce compte.
    conflicts: [],
    // #2116.3 / .6 / .7 — l'identité et la mémoire marché font partie de la vue
    // depuis ce lot ; ce fichier ne les teste pas, il les déclare INCONNUES
    // plutôt que de les inventer.
    companyName: { state: 'unknown' },
    sector: { state: 'unknown' },
    headquarters: { state: 'unknown' },
    marketMemory: {
      provenance: { source: 'market_memory', observedAt: null },
      read: { status: 'unavailable', reason: 'hors sujet de ce test' },
    },
    incumbentEsn,
    technologies: { state: 'unknown' },
    entryPaths: { state: 'unknown' },
    recommendations: [],
  }
}

describe('IncumbentEsnCard', () => {
  // #3711.17 (décision Louis 17/10, recette R41 EDF : « non mesuré — aucune ESN nommée » hors score) : une absence
  // ne fait AUCUNE ligne — la carte n'existe pas sans ESN en place établie, quelle que soit la raison de l'inconnu.
  it.each([undefined, 'never_analyzed', 'no_esn_named'])(
    '#3711.17 — contexte sans ESN (raison %s) ⇒ aucune carte, ni « non mesuré » ni sa raison',
    reason => {
      useAccountIntelligenceContext.mockReturnValue({
        data: context(reason ? { state: 'unknown', reason } : { state: 'unknown' }),
      })
      const { container } = renderWithRouter(<IncumbentEsnCard accountId="acc-1" />)
      expect(container.textContent).toBe('')
    },
  )

  it('se TAIT quand la façade n’a pas répondu — une lecture indisponible n’est pas un constat', () => {
    useAccountIntelligenceContext.mockReturnValue({ data: undefined })
    const { container } = renderWithRouter(<IncumbentEsnCard accountId="acc-1" />)
    expect(container.textContent).toBe('')
  })

  /**
   * Le motif de ce chantier : `strengths` / `weaknesses` partaient à l'export
   * PDF et n'apparaissaient sur AUCUN écran. C'est pourtant ce qui dit par où
   * un titulaire installé se déloge.
   */
  it('shows the strengths and weaknesses of each incumbent', async () => {
    useAccountIntelligenceContext.mockReturnValue({
      data: context({
        state: 'known',
        value: [
          {
            name: 'Capgemini',
            contractType: 'Transformation, cloud, data',
            strengths: 'Taille, expertise bancaire',
            weaknesses: 'Coût, faible agilité sur des missions courtes',
          },
        ],
        provenance: { source: 'public_sources', observedAt: null },
      } as const),
    })
    renderWithRouter(<IncumbentEsnCard accountId="acc-1" />)
    expect(await screen.findByText('Capgemini')).toBeInTheDocument()
    expect(screen.getByText(/Transformation, cloud, data/)).toBeInTheDocument()
    expect(screen.getByText(/Taille, expertise bancaire/)).toBeInTheDocument()
    expect(screen.getByText(/Coût, faible agilité sur des missions courtes/)).toBeInTheDocument()
  })

  /**
   * Un concurrent sans forces saisies ne rend pas une case vide : l'absence se
   * DIT. Sinon « pas de faiblesse écrite » se lirait « pas de faiblesse ».
   */
  // #2613 — une force ou une faiblesse non renseignée ne fait plus de ligne :
  // le trait disparaît, pas seulement sa valeur (voir `Trait` dans le
  // composant). Le périmètre, hors de ce lot, reste nommé.
  it('drops the strengths/weaknesses traits instead of naming them absent', async () => {
    useAccountIntelligenceContext.mockReturnValue({
      data: context({
        state: 'known',
        value: [{ name: 'Sopra Steria', contractType: null, strengths: null, weaknesses: null }],
        provenance: { source: 'public_sources', observedAt: null },
      }),
    })
    renderWithRouter(<IncumbentEsnCard accountId="acc-1" />)
    expect(await screen.findByText('Périmètre non précisé')).toBeInTheDocument()
    expect(screen.queryByText('Forces non renseignées')).not.toBeInTheDocument()
    expect(screen.queryByText('Faiblesses non renseignées')).not.toBeInTheDocument()
    expect(screen.queryByText('Forces')).not.toBeInTheDocument()
    expect(screen.queryByText('Faiblesses')).not.toBeInTheDocument()
  })

  it('carries the REAL provenance of the fact, never a hardcoded source', async () => {
    useAccountIntelligenceContext.mockReturnValue({
      data: context({
        state: 'known',
        value: [{ name: 'Capgemini', contractType: null, strengths: null, weaknesses: null }],
        provenance: { source: 'public_sources', observedAt: '2026-08-30T09:00:00.000Z' },
      }),
    })
    renderWithRouter(<IncumbentEsnCard accountId="acc-1" />)
    expect(await screen.findByText(/sources publiques actuelles/)).toBeInTheDocument()
    // R15-10 — le format de date est celui de la primitive `Provenance`, seule
    // à le décider depuis qu'elle formate elle-même (« 30 août 2026 »). Avant,
    // cette carte le refaisait de son côté et rendait « 30/08/2026 » : deux
    // formats pour la même métadonnée, dans le même dossier.
    expect(screen.getByText(/30 août 2026/)).toBeInTheDocument()
  })
})
