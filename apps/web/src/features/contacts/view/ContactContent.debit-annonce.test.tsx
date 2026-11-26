import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'
import { ContactContent } from './ContactContent'

/**
 * « Le coût s'annonce AVANT le clic », appliqué au panneau de sélection.
 *
 * Ce que ces tests tiennent, et pourquoi ils existent : `handleQuickAction`
 * lançait, pour une action de canal (« Générer message LinkedIn »), un
 * enrichissement sur TOUS les contacts à qui ce canal manquait — sans
 * confirmation, sans coût affiché, et sans que rien à l'écran n'ait nommé un
 * crédit. Un débit partait donc d'un bouton dont le libellé parlait de
 * rédaction de message.
 *
 * Les trois propriétés vérifiées ici sont celles de la règle :
 *  1. aucun appel d'enrichissement ne part avant qu'un écran ait nommé le coût ;
 *  2. l'ensemble ANNONCÉ est exactement l'ensemble ENVOYÉ — le prédicat de
 *     facturation (`bulkEnrichmentCost`, contrat) décide QUI part, et le nombre
 *     affiché MESURE ce qu'il a retenu ;
 *  3. quand rien n'est facturable, l'écran ne dit pas « 0 crédit » comme s'il
 *     allait débiter zéro : il dit qu'il n'y a rien à acheter.
 */

const enrichMutateAsync = vi.fn()
const openEngagement = vi.fn()

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
  useReducedMotion: () => false,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext', () => ({
  useContactEngagement: () => ({ openEngagement }),
  useOptionalContactEngagement: () => ({ openEngagement }),
}))

vi.mock('@/features/contacts/hooks/useEnrichContact', () => ({
  useEnrichContact: () => ({ mutateAsync: enrichMutateAsync, mutate: vi.fn(), isPending: false }),
  enrichErrorDescription: () => null,
}))

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
}))

function makeContact(overrides: Partial<GlobalContact> = {}): GlobalContact {
  return {
    id: 'c1',
    account_id: 'a1',
    full_name: 'Alice Martin',
    title: 'DSI',
    entity: null,
    decision_role: null,
    priority: 5,
    email: null,
    phone: null,
    linkedin_url: null,
    why_contact: null,
    user_status: 'new',
    source: 'apollo',
    created_at: '2026-07-01T10:00:00.000Z',
    updated_at: '2026-07-10T10:00:00.000Z',
    company_name: 'Corp',
    ...overrides,
  }
}

const baseProps = {
  totalContacts: 0,
  lifecycleTally: undefined,
  stateFilter: undefined,
  onLifecycleFilterChange: () => {},
  // #2158.72 — le défaut de `ContactContent` est désormais « à contacter »,
  // pas « Toutes » : ce fichier teste la facturation d'enrichissement sur des
  // contacts délibérément SANS canal (donc hors « à contacter »), la vue est
  // épinglée sur « Toutes » pour rester découplée de ce défaut.
  viewFilter: 'all' as const,
  loading: false,
  query: '',
  onQueryChange: () => {},
  activeFilters: [],
  onFiltersChange: () => {},
  onAddFilter: () => {},
  unassignedFilter: undefined,
  onScopeChange: () => {},
  onClearFilters: () => {},
  isFilterActive: false,
}

async function renderAndSelectAll(contacts: GlobalContact[]) {
  renderWithRouter(<ContactContent {...baseProps} contacts={contacts} totalContacts={contacts.length} />)
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Tout sélectionner' }))
  // Théo B c1-repertoire.R13 — la sélection montre la barre ; « Plus » ouvre le panneau.
  await userEvent.click(await screen.findByRole('button', { name: 'Plus' }))
  // Le panneau de sélection n'apparaît qu'une fois au moins une ligne cochée.
  // #2518 — deux titres portent ce texte depuis que le panneau vit dans une
  // fenêtre (`SheetTitle`, `sr-only`, exigé par Radix, + l'entête propre du
  // panneau) : `findAllByRole` plutôt que `findByRole`, qui échouerait sur
  // l'ambiguïté.
  await screen.findAllByRole('heading', { name: /contacts? sélectionné/i })
}

/**
 * L'action rapide « Générer message LinkedIn » du panneau de sélection.
 *
 * ⚠️ Elle se rend DÉSACTIVÉE quand aucun contact sélectionné n'a de LinkedIn
 * (`buildQuickActions`). Une sélection entièrement dépourvue du canal ne
 * reproduit donc rien : le clic ne part pas. Chaque cas ci-dessous embarque
 * pour cette raison un contact DÉJÀ pourvu du canal — c'est lui qui ouvre la
 * porte, et c'est exactement la situation où le débit non annoncé se produit.
 * L'assertion `toBeEnabled` rend cette dépendance visible plutôt que muette.
 */
async function clickLinkedinQuickAction() {
  const button = await screen.findByRole('button', { name: /Générer message LinkedIn/ })
  expect(button).toBeEnabled()
  await userEvent.click(button)
}

/** Un contact qui a DÉJÀ le canal LinkedIn : il rend l'action rapide cliquable. */
function readyForLinkedin(): GlobalContact {
  return makeContact({
    id: 'deja-sur-le-canal',
    full_name: 'Chloé Prêt',
    linkedin_url: 'https://example.org/in/chloe',
  })
}

beforeEach(() => {
  enrichMutateAsync.mockReset()
  enrichMutateAsync.mockResolvedValue({ id: 'c1', email: null, phone: null, linkedin_url: null })
  openEngagement.mockReset()
})

describe('ContactContent — aucun débit ne part sans avoir été annoncé (action « ouvrir un canal »)', () => {
  it("n'enrichit RIEN tant que le coût n'a pas été annoncé et accepté", async () => {
    // « Sans coordonnée, identité résolue » ⇒ facturable au sens du contrat. Le
    // canal LinkedIn lui manque, donc l'ancien code l'envoyait à
    // l'enrichissement sur-le-champ, sans rien afficher.
    await renderAndSelectAll([readyForLinkedin(), makeContact({ id: 'facturable', full_name: 'Alice Martin' })])

    await clickLinkedinQuickAction()

    expect(enrichMutateAsync).not.toHaveBeenCalled()
    expect(await screen.findByText(/via nos sources d'enrichissement/)).toBeInTheDocument()
  })

  it("n'envoie QUE ce qu'il a annoncé — le prédicat de facturation est la seule porte", async () => {
    await renderAndSelectAll([
      readyForLinkedin(),
      // Facturable : aucune coordonnée, identité résolue.
      makeContact({ id: 'facturable', full_name: 'Alice Martin' }),
      // NON facturable : le contrat exclut du compte un contact déjà pourvu
      // d'une coordonnée. L'ancien code l'enrichissait quand même — un crédit
      // possible pour un contact que l'écran n'avait jamais compté.
      makeContact({ id: 'deja-pourvu', full_name: 'Bob Durand', email: 'bob@corp.co' }),
    ])

    await clickLinkedinQuickAction()

    // Un seul contact annoncé…
    expect(await screen.findByText(/via nos sources d'enrichissement/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Enrichir$/ }))

    // …et exactement celui-là envoyé.
    await waitFor(() => expect(enrichMutateAsync).toHaveBeenCalledTimes(1))
    expect(enrichMutateAsync.mock.calls[0]?.[0]?.contact?.id).toBe('facturable')
  })

  it("n'annonce pas « 0 crédit » quand il n'y a rien à acheter, et ne débite rien", async () => {
    // Les deux raisons de n'être pas facturable, côte à côte : une coordonnée
    // déjà connue, et une identité non résolue. Aucune des deux n'ouvre un
    // achat — et « 0 crédit » se lirait « je vais débiter zéro », ce qui n'est
    // pas le sujet : il n'y a rien à acheter.
    await renderAndSelectAll([
      readyForLinkedin(),
      makeContact({ id: 'deja-pourvu', full_name: 'Bob Durand', phone: '+33100000000' }),
      makeContact({ id: 'identite-inconnue', full_name: '' }),
    ])

    await clickLinkedinQuickAction()

    await waitFor(() => expect(openEngagement).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/0 crédit/)).not.toBeInTheDocument()
    expect(enrichMutateAsync).not.toHaveBeenCalled()
    // Le canal s'ouvre quand même, avec ce qui est déjà en main — gratuitement.
    expect(openEngagement.mock.calls[0]?.[0]?.map((c: { id: string }) => c.id)).toEqual(['deja-sur-le-canal'])
  })

  it('renonce au débit quand la confirmation est refusée, et ouvre ce qui est gratuit', async () => {
    await renderAndSelectAll([readyForLinkedin(), makeContact({ id: 'facturable', full_name: 'Alice Martin' })])

    await clickLinkedinQuickAction()
    await screen.findByText(/via nos sources d'enrichissement/)
    await userEvent.click(screen.getByRole('button', { name: /Ouvrir sans enrichir/ }))

    await waitFor(() => expect(openEngagement).toHaveBeenCalledTimes(1))
    expect(enrichMutateAsync).not.toHaveBeenCalled()
    expect(openEngagement.mock.calls[0]?.[0]?.map((c: { id: string }) => c.id)).toEqual(['deja-sur-le-canal'])
  })
})

describe('ContactContent — « Enrichir maintenant » annonce ce que le contrat facture', () => {
  it('ne compte que les contacts que le contrat facture, pas ceux à qui il manque un canal', async () => {
    await renderAndSelectAll([
      makeContact({ id: 'facturable', full_name: 'Alice Martin' }),
      // A un e-mail mais ni téléphone ni LinkedIn : incomplet à l'œil,
      // NON facturable au contrat. C'est l'écart « 3 annoncés / 2 débités ».
      makeContact({ id: 'deja-pourvu', full_name: 'Bob Durand', email: 'bob@corp.co' }),
    ])

    await userEvent.click(await screen.findByRole('button', { name: /Enrichir maintenant/ }))

    expect(await screen.findByText(/via nos sources d'enrichissement/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Enrichir$/ }))
    await waitFor(() => expect(enrichMutateAsync).toHaveBeenCalledTimes(1))
    expect(enrichMutateAsync.mock.calls[0]?.[0]?.contact?.id).toBe('facturable')
  })
})

/**
 * #2484 — RETIRÉ le 17/09/2026 par #2518.
 *
 * Le panneau de sélection vivait en COLONNE empilée à côté du tableau
 * (`PAGE_GUTTER_MX`, `lg:sticky lg:w-[340px]`) : #2484 y avait corrigé un
 * débordement de 20 px (`mr-5 w-full`). #2518 a retiré la colonne elle-même —
 * le panneau s'ouvre désormais dans une fenêtre superposée (`Sheet`), dont la
 * largeur et la position (`inset-y-3 right-3 w-3/4 sm:max-w-sm`) sont celles,
 * déjà établies, du composant partagé. Il n'y a plus de colonne à mesurer :
 * ce test vérifiait un mécanisme qui n'existe plus. L'enveloppe est désormais
 * couverte par `ContactContent.selection-panel-window.test.tsx` (#2518).
 */
