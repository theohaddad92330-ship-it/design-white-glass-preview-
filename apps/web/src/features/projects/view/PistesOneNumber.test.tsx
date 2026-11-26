import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import type { ReactNode } from 'react'
import { i18n } from '@/i18n'

/**
 * #4191 (recette 3, F1) — LE MOT « PISTE » PORTE UN SEUL CHIFFRE. Le compteur `pistes_to_review`
 * est mocké à 7 : l'en-tête de `/projects/pistes`, la ligne « N pistes à revoir → Pistes » du Pipe
 * et la tuile de `/pilotage` doivent tous afficher 7. Toute autre population garde son chiffre
 * mais pas ce mot.
 */
const SEVEN = 7
vi.mock('@/features/crm-counters/useCrmCounters', () => ({
  useCrmCounters: () => ({
    data: { counters: { pistes_to_review: { value: SEVEN, measured: true, definition_key: 'pistes_to_review' } } },
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
}))

const { PistesCount } = await import('./PistesCount')
const { PipelineDetectionsLink } = await import('../pipeline-detections/view/PipelineDetectionsLink')
const { pistesToReviewOf } = await import('@/features/crm-counters/usePistesToReview')

afterEach(cleanup)

describe('F1 — les trois écrans affichent le même nombre de pistes', () => {
  it('en-tête de /projects/pistes, ligne du Pipe : 7 et 7', async () => {
    await i18n.loadNamespaces('projects')
    render(
      <I18nextProvider i18n={i18n}>
        <PistesCount />
        <PipelineDetectionsLink />
      </I18nextProvider>,
    )
    expect(screen.getByTestId('pistes-count')).toHaveTextContent('7 pistes à revoir')
    // Théo C Q7 (22/10/2026) — la ligne du Pipe ouvre le tiroir « Pistes de Laura » (elle ne quitte plus l'écran) ;
    // le même nombre, le même libellé.
    expect(screen.getByRole('button', { name: /7 pistes à revoir/ })).toBeInTheDocument()
  })

  it('la tuile de /pilotage lit le même nombre, sous le même libellé « pistes à revoir »', async () => {
    await i18n.loadNamespaces('pilotage')
    const label = i18n.getFixedT('fr', 'pilotage')('decisions.needs', {
      count: pistesToReviewOf({ pistes_to_review: { value: SEVEN, measured: true, definition_key: 'x' } }),
    })
    expect(label).toBe('7 pistes à revoir')
  })
})
