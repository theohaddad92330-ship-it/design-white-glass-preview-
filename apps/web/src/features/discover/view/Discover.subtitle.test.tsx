import { screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import discoverEn from '@/i18n/locales/en/discover.json'
import discoverFr from '@/i18n/locales/fr/discover.json'
import { Discover } from './Discover'

// Même mock que Discover.test.tsx : le module de route bouclerait sinon.
vi.mock('@/routes/discover/index', () => ({ Route: { useSearch: () => ({}) } }))

/**
 * #2467 — ouvre le rail de recherche, replié à l'arrivée depuis le 16/09/2026.
 * Sans clic, son contenu n'est pas seulement masqué : il n'est pas dans le DOM
 * (`CollapsedSection` ne monte rien tant qu'il est fermé).
 */
async function ouvrirLeRail() {
  const entete = await screen.findByRole('button', { name: /^explorer$/i })
  if (entete.getAttribute('aria-expanded') === 'false') fireEvent.click(entete)
}

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        const Rendered = ({ children, ...props }: any) => {
          const Component = prop as string
          return <Component {...props}>{children}</Component>
        }
        return Rendered
      },
    },
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useInView: () => true,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

/**
 * #2165.3 (16/09/2026) — « Sous-titre personnalisé nommant les cinq axes ».
 *
 * ⚠️ Contradiction de doctrine relevée au registre (16/09/2026, point 1) :
 * le retour demandait de nommer « la mémoire BellumAI » — NOTRE moteur, que
 * GA-44 (`no-vendor-names-in-app.test.ts`) interdit d'écrire à l'écran.
 * Tranché par Louis (15/09, « prends-les tous, ne me redemande rien ») avec
 * pour instruction de suivre la doctrine déjà écrite : on nomme la CAPACITÉ,
 * jamais le moteur — ici, les cinq axes RÉELS que le rail croise déjà
 * aujourd'hui (secteur #2165.21, taille #2165.22, territoire #2165.20,
 * signaux d'activité #2165.31, accessibilité #2165.32 — tous marqués
 * « déjà là » au registre du 15/09). Composer ces cinq-là plutôt qu'en
 * inventer respecte « JAMAIS de données fictives ».
 *
 * ⚠️ Ce n'est PAS le paragraphe d'introduction retiré le 01/09 (#2165.2,
 * écarté) : une ligne, sous la barre d'actions, jamais avant — l'écran
 * continue de s'ouvrir sur ses COMMANDES.
 */
// #4493 (décision Louis 24/10) — revient sur #2165.3 : le sous-titre est celui de la maquette V22.
describe('#4493 — le sous-titre de la maquette V22, jamais notre moteur', () => {
  it('porte le texte exact en français', () => {
    expect(discoverFr.subtitle).toBe(
      'Trouve les comptes à travailler, les bons interlocuteurs et un vrai sujet d’approche.',
    )
  })

  it('porte le texte exact en anglais', () => {
    expect(discoverEn.subtitle).toBe('Find the accounts to work, the right contacts and a real reason to reach out.')
  })

  it('ne nomme JAMAIS notre moteur (« mémoire », « bellum », « IA ») — GA-44', () => {
    for (const text of [discoverFr.subtitle, discoverEn.subtitle]) {
      expect(text.toLowerCase()).not.toMatch(/mémoire|memory|bellum/)
    }
  })

  it('est rendu sur /discover', async () => {
    renderWithRouter(<Discover />)
    // #2467 — le rail de recherche ouvre REPLIÉ depuis le 16/09/2026. Les
    // tests qui visent son CONTENU l'ouvrent d'abord, d'un clic sur son
    // en-tête : exactement le geste de l'utilisateur.
    await ouvrirLeRail()
    await screen.findByRole('button', { name: /^explorer$/i })
    expect(screen.getByText(discoverFr.subtitle)).toBeInTheDocument()
  })
})
