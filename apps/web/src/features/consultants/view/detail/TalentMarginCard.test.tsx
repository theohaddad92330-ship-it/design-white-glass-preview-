import { measurability, missionsOfConsultant, propagated } from '@bellum/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { margin } = vi.hoisted(() => ({ margin: vi.fn() }))
vi.mock('@/features/propagation/hooks', () => ({ useConsultantMargin: () => margin() }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => (
    <a href="/missions" {...rest}>
      {children}
    </a>
  ),
}))

const { TalentMarginCard } = await import('./TalentMarginCard')

const CONSULTANT = '22222222-2222-4222-8222-222222222222'

function aMargin(over: Partial<{ marginPercent: number | null; measured: number; unmeasured: number }> = {}) {
  const measured = over.measured ?? 6
  return {
    margin: propagated(
      {
        consultantId: CONSULTANT,
        marginPercent: 31.4,
        measured,
        unmeasured: 0,
        measurability: measurability(measured, 5),
        ...over,
      },
      missionsOfConsultant(CONSULTANT),
    ),
    denied: false,
    failed: false,
    canReadFinance: true,
  }
}

beforeEach(() => margin.mockReset().mockReturnValue(aMargin()))
afterEach(cleanup)

describe('la marge mesurée', () => {
  it('affiche le pourcentage et mène aux missions du consultant (§4.4)', () => {
    render(<TalentMarginCard talentId={CONSULTANT} />)
    expect(screen.getByRole('link').textContent).toContain('31 % de marge moyenne')
  })

  it('compte ce qui SORT du calcul plutôt que de le fondre', () => {
    margin.mockReturnValue(aMargin({ unmeasured: 2 }))
    render(<TalentMarginCard talentId={CONSULTANT} />)
    expect(screen.getByText(/2 missions sortent du calcul/)).toBeTruthy()
  })

  it('montre une marge NÉGATIVE — un consultant à perte doit se voir', () => {
    margin.mockReturnValue(aMargin({ marginPercent: -12 }))
    render(<TalentMarginCard talentId={CONSULTANT} />)
    expect(screen.getByRole('link').textContent).toContain('-12 %')
  })
})

describe('cinq états, et aucun ne vaut 0 %', () => {
  it('sans droit financier → « pas ton périmètre », jamais un vide muet', () => {
    // ⚠️ `recruiter` est le rôle qui ouvre cette fiche et n'a AUCUN droit
    // financier : ce cas est le plus fréquent, pas le plus rare.
    margin.mockReturnValue({ margin: undefined, denied: true, failed: false, canReadFinance: false })
    const { container } = render(<TalentMarginCard talentId={CONSULTANT} />)
    expect(screen.getByText(/c’est un droit que ton rôle n’a pas/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/0\s*%/)
  })

  it('portée restreinte (`finance:read:own`) → la marge d’équipe reste hors périmètre', () => {
    // La marge décrit l'ÉQUIPE : un consultant n'a pas de propriétaire
    // commercial. Le serveur la rédige (`marginPercent: null`, clé PRÉSENTE),
    // et sans `canReadFinance` l'écran ne saurait pas si c'est « pas le droit »
    // ou « pas mesuré » — c'est le défaut que D45 a corrigé.
    margin.mockReturnValue({
      margin: propagated(
        {
          consultantId: CONSULTANT,
          marginPercent: null,
          measured: 6,
          unmeasured: 0,
          measurability: measurability(6, 5),
        },
        missionsOfConsultant(CONSULTANT),
      ),
      denied: false,
      failed: false,
      canReadFinance: false,
    })
    render(<TalentMarginCard talentId={CONSULTANT} />)
    expect(screen.getByText(/c’est un droit que ton rôle n’a pas/)).toBeTruthy()
  })

  it('lecture en échec → « cassé » ne se lit pas « pas de marge »', () => {
    margin.mockReturnValue({ margin: undefined, denied: false, failed: true, canReadFinance: true })
    render(<TalentMarginCard talentId={CONSULTANT} />)
    expect(screen.getByText(/n’a pas pu être chargée/)).toBeTruthy()
  })

  it('non mesurable → dit COMBIEN il manque, plutôt que de se taire ou d’inventer', () => {
    // Un écran muet fait chercher une panne ; un pourcentage sur deux missions
    // a l'autorité d'une moyenne sans en être une.
    margin.mockReturnValue(aMargin({ measured: 2 }))
    const { container } = render(<TalentMarginCard talentId={CONSULTANT} />)
    expect(screen.getByText(/2 mission sur les 5 nécessaires/)).toBeTruthy()
    expect(container.querySelector('a')).toBeNull()
  })

  it('jamais affecté → aucune ligne, et ce n’est pas « 0 % »', () => {
    margin.mockReturnValue({ margin: undefined, denied: false, failed: false, canReadFinance: true })
    const { container } = render(<TalentMarginCard talentId={CONSULTANT} />)
    expect(screen.getByText(/Marge moyenne non mesurée/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/\b0\s*%/)
  })
})

describe('la marge ne s’édite pas ici', () => {
  it('ne rend ni champ ni bouton — le coût chargé se saisit sur la MISSION', () => {
    const { container } = render(<TalentMarginCard talentId={CONSULTANT} />)
    expect(container.querySelectorAll('input, textarea, select, button')).toHaveLength(0)
  })
})
