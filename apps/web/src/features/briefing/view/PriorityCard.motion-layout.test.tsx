import type { BriefingAction } from '@bellum/contracts'
import { LAYOUT_TRANSITION } from '@bellum/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PriorityCard } from './PriorityCard'

/**
 * #2097.36 — MOTION « ÇA A CHANGÉ DE PLACE » (M6 `settle`, via `layout` +
 * `LAYOUT_TRANSITION`, même patron que `AccountContent.tsx`, GA-26).
 *
 * La grammaire de mouvement du dépôt (`packages/ui/src/motion.ts`) prévoit un
 * mouvement pour « réorganisation de journée » (M6, un ressort doux, jamais
 * un rebond). Rien ne le câblait sur la liste des cartes de priorité : quand
 * le classement serveur change (un geste « prioritaire pour moi », une carte
 * qui expire), les cartes retombaient sans transition à leur nouvelle place.
 *
 * Ce fichier mocke `framer-motion` pour espionner les props passées au
 * conteneur de la carte — `PriorityCard.test.tsx` garde volontairement le
 * VRAI framer-motion (il vérifie l'état `initial` posé en style inline), les
 * deux mocks ne peuvent pas cohabiter dans le même fichier.
 */

vi.mock('@/features/briefing/hooks/useAccountLastOutcome', () => ({ useAccountLastOutcome: vi.fn(() => null) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}))

const divProps: Array<Record<string, unknown>> = []

// #3265.13 (épopée #3287) — `PriorityCard` lit `usePlanItems` (dernier
// résultat déclaré du compte), qui exige une session ; ce fichier monte un
// `QueryClientProvider` mais aucune session, même besoin que le mock
// `framer-motion` juste au-dessus pour rester sur son propre invariant.
vi.mock('@/features/actions/hooks/usePlanItems', () => ({
  usePlanItems: () => ({ items: [] }),
}))

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        return ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => {
          if (prop === 'div') divProps.push(props)
          return createElement(prop === 'span' ? 'span' : 'div', {}, children)
        }
      },
    },
  ),
  useReducedMotion: () => false,
}))

function card(partial: Partial<BriefingAction> & Pick<BriefingAction, 'id'>): BriefingAction {
  return {
    labelKey: 'briefing.actions.followUp',
    labelVars: { counterpart: 'jean@acme.com', days: 9, subject: 'Proposition' },
    href: '/mailbox?intent=no_reply&thread=t1',
    kind: 'follow_up',
    priority: 4,
    fact: null,
    context: null,
    preparedArtifacts: [],
    expiresAt: null,
    businessObject: null,
    verdict: null,
    consequence: null,
    confidence: null,
    estimatedMinutes: null,
    rankingAxes: [],
    processingState: 'suggested',
    owner: null,
    permission: null,
    ...partial,
  }
}

describe('PriorityCard — #2097.36 la carte anime son changement de rang (motion M6 « settle »)', () => {
  it('porte `layout` et rejoue LAYOUT_TRANSITION, la même grammaire que la liste de comptes', () => {
    divProps.length = 0
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    render(
      <QueryClientProvider client={client}>
        <PriorityCard action={card({ id: 'a1' })} rank={2} />
      </QueryClientProvider>,
    )
    const cardContainerProps = divProps.find(props => props.role === 'article')
    expect(cardContainerProps?.layout).toBe(true)
    expect(cardContainerProps?.transition).toMatchObject({ layout: LAYOUT_TRANSITION })
  })
})
