import { fireEvent, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { DashboardPage } from './DashboardPage'

/**
 * ⚠️ Le Proxy MÉMORISE ses composants.
 *
 * Sans ce cache, chaque accès à `motion.div` rend une closure NEUVE : React voit
 * un type différent d'un rendu à l'autre, démonte tout le sous-arbre et le
 * remonte — l'état local des enfants part avec, et le test devient aveugle à
 * toute interaction qui change un état. Mesuré le 03/09 : un clic passait, le
 * `setState` était bien appelé, et l'écran entier disparaissait du DOM.
 */
const motionComponents = new Map<string, unknown>()

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          const Rendered = ({ children, ...props }: any) => {
            const Component = prop
            return <Component {...props}>{children}</Component>
          }
          motionComponents.set(prop, Rendered)
          return Rendered
        }
      },
    },
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useInView: () => true,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

describe('DashboardPage', () => {
  it('rend le cockpit personnel, et lui seul', async () => {
    renderWithRouter(<DashboardPage />)
    // Seat value: the dashboard lands on the rep's own space (roadmap §5).
    // ⚠️ « Ta trajectoire commerciale » depuis #2113.19 : l'écran s'adresse à
    // l'utilisateur, il ne parle pas à sa place — le tutoiement appliqué au
    // dépôt entier, avec la copie exacte du retour (l'ancien « Ton cockpit »
    // ne disait rien de ce que l'écran mesure).
    expect(await screen.findByText(/Ta trajectoire commerciale/i)).toBeInTheDocument()

    // #1813 — « Mes priorités » vit désormais dans une section repliée par
    // défaut (`CollapsedSection`, GA-26) ; on l'ouvre avant de la chercher.
    // ⚠️ #1409 rouvert (16/09/2026) : la section ne s'appelle plus « Mes
    // priorités & relances ». Les relances ont rejoint le Centre d'actions, et
    // un titre qui les promettait encore ferait chercher une liste absente.
    fireEvent.click(screen.getByRole('button', { name: 'Mes prochaines étapes' }))

    // Les deux sections d'ACTION restent. « Mes comptes » et « Mes messages
    // récents » sont parties : #1408 et #1409 les remplacent par la couverture
    // et la dynamique, qui ne re-listent pas ce que Comptes et Messagerie
    // portent déjà. Sans session, le recul n'est pas servi — donc pas rendu.
    expect(screen.getByText('Mes priorités')).toBeInTheDocument()
    expect(screen.queryByText('Mes relances à faire')).not.toBeInTheDocument()
    expect(screen.queryByText('Mes messages récents')).not.toBeInTheDocument()
  })

  it('n’offre plus de bascule « Moi » / « Équipe » (#1457)', async () => {
    renderWithRouter(<DashboardPage />)
    await screen.findByText(/Ta trajectoire commerciale/i)
    // Le cockpit d'équipe vit sur `/team`, derrière `team:manage`. Le second
    // cockpit qui vivait ici n'était gardé par rien — voir GA-254.
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Équipe' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Moi' })).toBeNull()
  })
})
