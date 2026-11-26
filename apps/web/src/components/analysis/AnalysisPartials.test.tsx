/**
 * #2630.2 — CE QU'ON VOIT PENDANT QU'UNE ANALYSE TOURNE.
 *
 * Avant ce lot, un commercial regardait une barre avancer pendant trois à six
 * minutes sans jamais savoir si quelque chose avait été trouvé. La matière était
 * pourtant déjà sur le fil.
 *
 * Ce que ce fichier tient : la carte MONTRE les trouvailles, elle n'en fabrique
 * aucune, et elle ne dit jamais « rien trouvé » — une absence ne fait aucune
 * ligne.
 */
import { render, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { AnalysisPartial } from '@bellum/contracts'
import { AnalysisProgressCard } from './AnalysisProgressCard'

const mockUseAnalysisRun = vi.fn()

const motionComponents = new Map<string, unknown>()
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          const Rendered = ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
            createElement(prop, props, children)
          motionComponents.set(prop, Rendered)
          return Rendered
        }
      },
    },
  ),
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))

vi.mock('@/stores/analysisStore', () => ({
  STEP_KEYS: ['scope', 'crosscheck', 'account_sheet', 'decision_makers', 'orga_chain', 'classification', 'messages'],
  useAnalysisRun: (...args: unknown[]) => mockUseAnalysisRun(...args),
}))

function runWith(partials: AnalysisPartial[]) {
  return {
    phase: 'Identification des décideurs',
    percent: 70,
    completedSteps: [],
    currentStep: null,
    warnings: [],
    sourceHealth: {},
    events: [],
    partials,
  }
}

function renderCard() {
  return render(<AnalysisProgressCard companyName="Acme" phase="En cours" accountId="acct-1" />)
}

describe('#2630.2 — la carte de progression montre ce qui est DÉJÀ trouvé', () => {
  it('compte et NOMME ce qu’une phase a ramené, et dit quelle étape l’a trouvé', () => {
    mockUseAnalysisRun.mockReturnValue(
      runWith([
        {
          phase: 'contacts_complete',
          at: 1_758_000_000_000,
          findings: [{ kind: 'contacts', count: 4, samples: ['Claire Roggeman', 'Marc Oberlé'] }],
        },
      ]),
    )
    const { container } = renderCard()

    expect(screen.getByText('Déjà trouvé')).toBeInTheDocument()
    expect(container.textContent).toContain('4 contacts')
    expect(container.textContent).toContain('Claire Roggeman')
    // L'étape qui l'a produit, avec son vrai libellé — pas la clé brute.
    expect(container.textContent).toContain('Contacts et rôles')
    expect(container.textContent).not.toContain('contacts_complete')
  })

  it('accorde le singulier — « 1 contact », jamais « 1 contacts »', () => {
    mockUseAnalysisRun.mockReturnValue(
      runWith([
        {
          phase: 'contacts_complete',
          at: 1,
          findings: [{ kind: 'contacts', count: 1, samples: ['Claire Roggeman'] }],
        },
      ]),
    )
    const { container } = renderCard()
    expect(container.textContent).toContain('1 contact')
    expect(container.textContent).not.toContain('1 contacts')
  })

  it('une trouvaille sans libellé lisible est COMPTÉE, jamais nommée à vide', () => {
    mockUseAnalysisRun.mockReturnValue(
      runWith([{ phase: 'research_complete', at: 1, findings: [{ kind: 'angles', count: 2, samples: [] }] }]),
    )
    const { container } = renderCard()
    expect(container.textContent).toContain('2 angles')
    // Pas d'amorce « dont … » laissée orpheline.
    expect(container.textContent).not.toContain('dont')
  })
})

describe('#2630.2 — la carte n’invente rien, et ne dit jamais « rien trouvé »', () => {
  it('sans trouvaille, AUCUNE section — une absence ne fait pas une ligne', () => {
    mockUseAnalysisRun.mockReturnValue(runWith([]))
    const { container } = renderCard()
    expect(screen.queryByText('Déjà trouvé')).toBeNull()
    expect(container.textContent).not.toMatch(/rien trouvé|aucun contact/i)
  })

  it('une course d’avant ce déploiement n’a pas le champ — la carte n’explose pas', () => {
    const { partials, ...legacy } = runWith([])
    void partials
    mockUseAnalysisRun.mockReturnValue(legacy)
    expect(() => renderCard()).not.toThrow()
    expect(screen.queryByText('Déjà trouvé')).toBeNull()
  })

  it('aucun ZÉRO ne s’affiche dans la section — le contrat ne peut en produire', () => {
    mockUseAnalysisRun.mockReturnValue(
      runWith([
        {
          phase: 'contacts_complete',
          at: 1,
          findings: [{ kind: 'contacts', count: 3, samples: ['Claire Roggeman'] }],
        },
      ]),
    )
    const { container } = renderCard()
    const section = container.querySelector('[data-testid="analysis-partials"]')
    expect(section).not.toBeNull()
    expect(section?.textContent).not.toMatch(/\b0\b/)
  })
})
