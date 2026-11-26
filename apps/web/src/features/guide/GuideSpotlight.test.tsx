import { forwardRef, type ElementType, type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GuideSpotlight } from './GuideSpotlight'

/**
 * Recette 07/10 — la bulle « Ton audit est prêt » recouvrait la zone de
 * saisie qu'elle désignait. `guide-spotlight-geometry.test.ts` prouve que
 * `placeGuideBubble` est juste pour LA HAUTEUR QU'ON LUI DONNE ; ce test
 * prouve que le composant lui donne la hauteur RÉELLE, pas l'estimation
 * (`BUBBLE.height`), une fois la bulle rendue.
 *
 * jsdom rend `offsetHeight` à 0 par défaut (voir `GuideHost.test.tsx`) : on le
 * simule ici pour reproduire un corps plus long que l'estimation.
 */
type MotionMockProps = { children?: ReactNode } & Record<string, unknown>

// Même proxy que `Chat.mobile-composer.test.tsx` : chaque `motion.xxx` rend sa
// balise réelle, sans animation ni ref forwarding spécial à simuler.
const motionComponents = new Map<string, unknown>()
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          // `forwardRef` : `GuideSpotlight` pose `ref={bubbleRef}` sur `motion.div`
          // pour MESURER la bulle rendue — un simple composant fonction perdrait
          // cette ref et le test ne prouverait plus rien.
          const Rendered = forwardRef<HTMLElement, MotionMockProps>(({ children, ...props }, ref) => {
            const Component = prop as ElementType
            return (
              <Component ref={ref} {...props}>
                {children}
              </Component>
            )
          })
          motionComponents.set(prop, Rendered)
          return Rendered
        }
      },
    },
  ),
  useReducedMotion: () => false,
}))

const GAP = 12
const REAL_BUBBLE_HEIGHT = 260

function stubOffsetHeight(height: number): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => height,
  })
  return () => {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', descriptor)
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('recette 07/10 — la bulle ne recouvre jamais sa cible, même plus haute qu’estimé', () => {
  it('recalcule sa position avec la hauteur RÉELLE mesurée, pas l’estimation', () => {
    const restore = stubOffsetHeight(REAL_BUBBLE_HEIGHT)
    try {
      // Peu de place EN DESSOUS (le composeur occupe le bas de l'écran) : la
      // bulle se pose AU-DESSUS (`side: 'top'`), là où une hauteur sous-estimée
      // la fait déborder PAR LE BAS, dans la cible.
      const target = { top: 150, left: 20, width: 300, height: 40 }
      const viewport = { width: 360, height: 220, stickyTopInset: 0, stickyBottomInset: 0 }

      render(
        <GuideSpotlight
          target={target}
          viewport={viewport}
          title="Ton audit est prêt — à toi de jouer"
          body="Demande à Laura : « prépare mon premier message »."
          step={{ current: 1, total: 1 }}
          mode="intervention-proactive"
          onNext={() => {}}
          onPrevious={() => {}}
          onClose={() => {}}
          onSelectAction={() => {}}
        />,
      )

      const bubble = screen.getByRole('dialog')
      const top = Number.parseFloat(bubble.style.top)

      // L'INVARIANT du produit (#2212.20) : la bulle est TOUJOURS hors de la
      // cible. Avec la hauteur RÉELLE (260), son bord bas ne doit jamais
      // dépasser `target.top - GAP` — l'estimation (168) le laisserait déborder
      // de 92 px dans la cible.
      expect(top + REAL_BUBBLE_HEIGHT).toBeLessThanOrEqual(target.top - GAP)
    } finally {
      restore()
    }
  })
})
