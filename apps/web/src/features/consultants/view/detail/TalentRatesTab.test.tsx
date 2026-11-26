import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Consultant } from '@bellum/contracts'
import { TalentRatesTab } from './TalentRatesTab'
import { useTalentRateHistory } from '../../hooks'
import { useConsultantMargin } from '@/features/propagation/hooks'

vi.mock('../../hooks', () => ({
  useTalentRateHistory: vi.fn(),
}))
vi.mock('@/features/propagation/hooks', () => ({
  useConsultantMargin: vi.fn(),
}))

vi.mocked(useTalentRateHistory).mockReturnValue({
  data: [],
  isError: false,
} as unknown as ReturnType<typeof useTalentRateHistory>)
vi.mocked(useConsultantMargin).mockReturnValue({
  margin: undefined,
  denied: false,
  failed: false,
  canReadFinance: true,
})

const TALENT_ID = '11111111-1111-4111-8111-111111111111'

function baseTalent(overrides: Partial<Consultant> = {}): Consultant {
  return {
    id: TALENT_ID,
    kind: 'consultant',
    engagement_kind: 'freelance',
    finance_visible: true,
    tjm: 620,
    min_tjm_cents: null,
    cost_rate_cents: null,
    purchase_tjm_cents: null,
    tjm_metadata: null,
    ...overrides,
  } as unknown as Consultant
}

/**
 * #2948 (#2329.12-.16, #2329.42/.44) — `tjm_metadata` était calculé, testé et
 * seedé (`ee93d99a`, `4156cf6959`) mais AUCUN écran ne le relisait — le motif
 * qui revient dans tout ce chantier : « du code juste, calculé, testé, que
 * personne n'appelle ». Ces tests protègent l'appelant, pas seulement le calcul.
 */
describe('TalentRatesTab — tjm_metadata (#2329.12-.16)', () => {
  it('affiche devise, source, contexte, date et confidentialité quand ils sont renseignés', () => {
    render(
      <TalentRatesTab
        talent={baseTalent({
          tjm_metadata: {
            currency: 'EUR',
            source: 'Déclaré par le consultant',
            context: 'Dernière mission chez un assureur',
            observed_at: '2026-08-01',
            confidential: true,
          },
        })}
      />,
    )
    expect(screen.getByText('EUR')).toBeInTheDocument()
    expect(screen.getByText('Déclaré par le consultant')).toBeInTheDocument()
    expect(screen.getByText('Dernière mission chez un assureur')).toBeInTheDocument()
    // #4191 D2 — la date passe par formatDate, jamais l'ISO brut.
    expect(screen.getByText('1 août 2026')).toBeInTheDocument()
    expect(screen.queryByText('2026-08-01')).not.toBeInTheDocument()
    expect(screen.getByText('Confidentiel')).toBeInTheDocument()
  })

  it('dit « non renseigné » quand aucune métadonnée n’a été saisie — jamais un blanc', () => {
    render(<TalentRatesTab talent={baseTalent({ tjm_metadata: null })} />)
    expect(screen.getAllByText('Non renseigné').length).toBeGreaterThanOrEqual(4)
  })

  it('retire le bloc entier quand `finance:read` manque — pas de fuite via un onglet différent', () => {
    render(<TalentRatesTab talent={baseTalent({ finance_visible: false, tjm_metadata: null })} />)
    expect(screen.queryByText('Ce que porte le TJM')).not.toBeInTheDocument()
  })
})

/**
 * #2948 (#2329.42/.44) — un TJM d'une ANCIENNE mission est un contexte
 * historique, jamais la condition actuelle.
 */
describe('TalentRatesTab — fraîcheur du TJM (#2329.42/.44)', () => {
  it('lève un badge « contexte historique » sur un TJM observé loin dans le passé', () => {
    render(
      <TalentRatesTab
        talent={baseTalent({
          tjm_metadata: {
            currency: 'EUR',
            source: null,
            context: null,
            observed_at: '2020-01-01',
            confidential: false,
          },
        })}
      />,
    )
    expect(screen.getByText('Contexte historique — pas la condition actuelle')).toBeInTheDocument()
  })

  it('NE lève AUCUN badge sur un TJM récent — c’est le test qui dit NON', () => {
    const recent = new Date().toISOString().slice(0, 10)
    render(
      <TalentRatesTab
        talent={baseTalent({
          tjm_metadata: { currency: 'EUR', source: null, context: null, observed_at: recent, confidential: false },
        })}
      />,
    )
    expect(screen.queryByText('Contexte historique — pas la condition actuelle')).not.toBeInTheDocument()
  })

  it('ne lève aucun badge quand la date est inconnue — non daté n’est pas historique', () => {
    render(
      <TalentRatesTab
        talent={baseTalent({
          tjm_metadata: { currency: 'EUR', source: null, context: null, observed_at: null, confidential: false },
        })}
      />,
    )
    expect(screen.queryByText('Contexte historique — pas la condition actuelle')).not.toBeInTheDocument()
  })
})

/**
 * #2948 (#2329.53) — Laura PRÉPARE un brouillon de revalidation quand le TJM
 * est historique. Elle ne l'envoie jamais : `onPrepareRevalidation` ne fait
 * que transmettre le texte suggéré, la personne le relit avant d'agir
 * (`TalentPrepareMessageDialog`, hors de ce composant).
 */
describe('TalentRatesTab — préparer une revalidation (#2329.53)', () => {
  it('propose l’action UNIQUEMENT quand le TJM est historique', () => {
    render(
      <TalentRatesTab
        talent={baseTalent({
          tjm_metadata: {
            currency: 'EUR',
            source: null,
            context: null,
            observed_at: '2020-01-01',
            confidential: false,
          },
        })}
        onPrepareRevalidation={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Préparer une revalidation' })).toBeInTheDocument()
  })

  it('ne propose RIEN — c’est le test qui dit NON — sur un TJM récent', () => {
    const recent = new Date().toISOString().slice(0, 10)
    render(
      <TalentRatesTab
        talent={baseTalent({
          tjm_metadata: { currency: 'EUR', source: null, context: null, observed_at: recent, confidential: false },
        })}
        onPrepareRevalidation={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Préparer une revalidation' })).not.toBeInTheDocument()
  })

  it('transmet un brouillon nommant le talent — jamais envoyé depuis ce composant', () => {
    const onPrepareRevalidation = vi.fn()
    render(
      <TalentRatesTab
        talent={baseTalent({
          full_name: 'Antoine Rivière',
          tjm_metadata: {
            currency: 'EUR',
            source: null,
            context: null,
            observed_at: '2020-01-01',
            confidential: false,
          },
        })}
        onPrepareRevalidation={onPrepareRevalidation}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Préparer une revalidation' }))
    expect(onPrepareRevalidation).toHaveBeenCalledTimes(1)
    expect(onPrepareRevalidation.mock.calls[0]?.[0]).toContain('Antoine Rivière')
  })
})
