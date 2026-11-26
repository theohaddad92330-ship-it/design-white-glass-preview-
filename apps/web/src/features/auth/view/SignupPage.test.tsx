import { screen } from '@testing-library/react'
import { vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { SignupPage } from './SignupPage'

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

// NOTE: assertions are async (`findBy*`). TanStack Router resolves the initial
// route on a microtask, so the component isn't in the DOM on the synchronous
// tick `render()` returns — `findBy*` polls until the router settles.
describe('SignupPage', () => {
  it('renders the heading', async () => {
    renderWithRouter(<SignupPage />)
    expect(await screen.findByRole('heading', { name: 'Créer un compte' })).toBeInTheDocument()
  })

  it('renders a dedicated first-name field (ENG-145 split)', async () => {
    renderWithRouter(<SignupPage />)
    expect(await screen.findByPlaceholderText('Jean')).toBeInTheDocument()
  })

  it('renders a dedicated last-name field (ENG-145 split)', async () => {
    renderWithRouter(<SignupPage />)
    expect(await screen.findByPlaceholderText('Dupont')).toBeInTheDocument()
  })

  it('renders the email field', async () => {
    renderWithRouter(<SignupPage />)
    expect(await screen.findByPlaceholderText('tu@entreprise.com')).toBeInTheDocument()
  })

  it('disables submit until the form is valid', async () => {
    renderWithRouter(<SignupPage />)
    expect(await screen.findByRole('button', { name: /Créer mon compte/i })).toBeDisabled()
  })

  it('links back to the login page for existing accounts', async () => {
    renderWithRouter(<SignupPage />)
    expect(await screen.findByRole('link', { name: 'Se connecter' })).toBeInTheDocument()
  })
})
