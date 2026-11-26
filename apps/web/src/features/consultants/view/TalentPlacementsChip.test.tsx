import { missionsOfConsultant, propagated } from '@bellum/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { index } = vi.hoisted(() => ({ index: vi.fn() }))
vi.mock('@/features/propagation/hooks', () => ({ useConsultantPlacementsIndex: () => index() }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => (
    <a href="/missions" {...rest}>
      {children}
    </a>
  ),
}))

const { TalentPlacementsChip } = await import('./TalentPlacementsChip')

const CONSULTANT = '22222222-2222-4222-8222-222222222222'

function placed(count: number) {
  return new Map([
    [CONSULTANT, propagated({ consultantId: CONSULTANT, placements: count }, missionsOfConsultant(CONSULTANT))],
  ])
}

beforeEach(() => index.mockReset().mockReturnValue(new Map()))
afterEach(cleanup)

/**
 * « PLACÉ N FOIS » — des PLACEMENTS, jamais des positionnements.
 *
 * Le vivier comptait déjà des positionnements (« N positionnements en cours sur
 * M »), et son libellé était juste. Ce qui manquait était l'autre moitié de la
 * comparaison : le nombre de missions réellement DÉMARRÉES.
 */
describe('le compteur compte des missions démarrées', () => {
  it('affiche « Placé 4 fois » et mène aux missions de ce consultant (§4.4)', () => {
    index.mockReturnValue(placed(4))
    render(<TalentPlacementsChip consultantId={CONSULTANT} />)
    expect(screen.getByRole('link').textContent).toContain('Placé 4 fois')
  })

  it('lit son consultant par CLÉ — un placement ne change pas de personne', () => {
    index.mockReturnValue(placed(4))
    const { container } = render(<TalentPlacementsChip consultantId="99999999-9999-4999-8999-999999999999" />)
    expect(container.textContent).toBe('')
  })
})

describe('jamais « placé 0 fois »', () => {
  it('un consultant jamais placé n’affiche RIEN', () => {
    // `placements` est un `positive()` au contrat, et le serveur ne rend aucune
    // ligne à zéro. Un « placé 0 fois » collerait un constat d'échec sur
    // quelqu'un qui vient peut-être d'arriver.
    const { container } = render(<TalentPlacementsChip consultantId={CONSULTANT} />)
    expect(container.textContent).toBe('')
  })
})

describe('il ne s’édite pas', () => {
  it('ne rend ni champ ni bouton', () => {
    index.mockReturnValue(placed(2))
    const { container } = render(<TalentPlacementsChip consultantId={CONSULTANT} />)
    expect(container.querySelectorAll('input, textarea, select, button')).toHaveLength(0)
  })
})
