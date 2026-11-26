import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { AccountLinks } from '@/features/accounts/api'
import { LinkedAccountsCard } from './LinkedAccountsCard'

/**
 * #1111 — le lien « même groupe » se VOIT et se DÉFAIT.
 *
 * Ce que ces tests protègent : `merged_into_id` était écrite en base et jamais
 * relue. Un dossier archivé par un rattachement quittait la liste sans que rien
 * ne dise où il était parti. Ces assertions échouent si la carte cesse de le
 * dire, ou si elle se met à afficher une date qu'elle n'a pas.
 */

const links = vi.hoisted(() => ({ current: null as AccountLinks | null, pending: false, failed: false }))
const detachMutate = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: links.current, isPending: links.pending, isError: links.failed }),
}))
vi.mock('@/features/accounts/hooks/useDetachAccount', () => ({
  useDetachAccount: () => ({ mutate: detachMutate, isPending: false }),
}))
/**
 * ⚠️ Ce faux `Link` JETAIT tous les autres attributs.
 *
 * Il ne gardait que `children` et `params` : `aria-label`, `className` et
 * `onClick` disparaissaient avant d'atteindre le `<a>`. Tant que la carte
 * écrivait le nom en clair dans le lien, personne ne pouvait s'en apercevoir —
 * le nom accessible tombait sur le contenu et les assertions passaient. Le jour
 * où la mention a porté un `aria-label`, le test a échoué en accusant le
 * composant d'un défaut qui était dans son propre mock.
 *
 * Un mock qui jette ses arguments ne teste pas le composant : il teste le mock.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    to: _to,
    ...rest
  }: {
    children: React.ReactNode
    params?: { id: string }
    to?: string
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={`/accounts/${params?.id ?? ''}`} {...rest}>
      {children}
    </a>
  ),
}))

const base = (over: Partial<AccountLinks> = {}): AccountLinks => ({
  mergedInto: null,
  linked: [],
  detachRefusal: null,
  detachRefusalMessage: null,
  ...over,
})

describe('LinkedAccountsCard — dire de quel groupe un dossier fait partie (#1111)', () => {
  it('n’affiche RIEN quand le dossier n’a aucun lien', () => {
    // « Aucun dossier lié » n'est pas « 0 lien mesuré » : une carte vide sur
    // tout le portefeuille apprendrait à ne plus la regarder.
    links.current = base()
    const { container } = render(<LinkedAccountsCard accountId="a-1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('n’affirme rien tant que la réponse n’est pas arrivée', () => {
    links.current = null
    const { container } = render(<LinkedAccountsCard accountId="a-1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('dit à quel dossier celui-ci est rattaché, et y mène', () => {
    links.current = base({
      mergedInto: { id: 'a-klesia', companyName: 'KLESIA', status: 'completed', linkedAt: '2026-08-27T09:30:00.000Z' },
    })
    render(<LinkedAccountsCard accountId="a-adp" />)
    // Le nom accessible dit l'ACTION depuis que la mention passe par
    // `ObjectMention` (F1 du tome 7) : « Ouvrir KLESIA », pas « KLESIA ».
    const link = screen.getByRole('link', { name: 'Ouvrir KLESIA' })
    expect(link).toHaveAttribute('href', '/accounts/a-klesia')
  })

  it('affiche la PROVENANCE du lien — sa date', () => {
    links.current = base({
      mergedInto: { id: 'a-klesia', companyName: 'KLESIA', status: 'completed', linkedAt: '2026-08-27T09:30:00.000Z' },
    })
    render(<LinkedAccountsCard accountId="a-adp" />)
    expect(screen.getByText(/rattaché le/)).toBeInTheDocument()
  })

  it('dit que la date est inconnue plutôt que d’afficher celle du jour', () => {
    // Un lien posé avant l'enregistrement de la provenance : sans date. La
    // remplacer par aujourd'hui ferait passer un lien ancien pour récent.
    links.current = base({
      mergedInto: { id: 'a-klesia', companyName: 'KLESIA', status: 'completed', linkedAt: null },
    })
    render(<LinkedAccountsCard accountId="a-adp" />)
    expect(screen.getByText(/avant que la date du geste soit enregistrée/)).toBeInTheDocument()
    expect(screen.queryByText(/rattaché le/)).not.toBeInTheDocument()
  })

  it('liste les dossiers rattachés au compte gardé, et y mène', () => {
    links.current = base({
      linked: [
        { id: 'a-adp', companyName: 'KLESIA ADP', status: 'archived', linkedAt: '2026-08-27T09:30:00.000Z' },
        { id: 'a-mut', companyName: 'KLESIA MUT', status: 'archived', linkedAt: null },
      ],
    })
    render(<LinkedAccountsCard accountId="a-klesia" />)
    expect(screen.getByRole('link', { name: 'Ouvrir KLESIA ADP' })).toHaveAttribute('href', '/accounts/a-adp')
    expect(screen.getByRole('link', { name: 'Ouvrir KLESIA MUT' })).toHaveAttribute('href', '/accounts/a-mut')
  })

  it('offre de détacher — le lien est RÉVERSIBLE d’un clic', () => {
    links.current = base({
      mergedInto: { id: 'a-klesia', companyName: 'KLESIA', status: 'completed', linkedAt: null },
    })
    render(<LinkedAccountsCard accountId="a-adp" />)
    const button = screen.getByRole('button', { name: /Détacher/ })
    button.click()
    expect(detachMutate).toHaveBeenCalledWith({ accountId: 'a-adp' })
  })

  it('remplace le bouton par la RAISON quand le détachement est refusé', () => {
    // Un bouton grisé sans raison se lit comme une panne.
    links.current = base({
      mergedInto: { id: 'a-klesia', companyName: 'KLESIA', status: 'completed', linkedAt: null },
      detachRefusal: 'link_predates_reversal',
      detachRefusalMessage: 'Ce rattachement est antérieur à l’enregistrement de l’état d’avant.',
    })
    render(<LinkedAccountsCard accountId="a-adp" />)
    expect(screen.queryByRole('button', { name: /Détacher/ })).not.toBeInTheDocument()
    expect(screen.getByText(/antérieur à l’enregistrement de l’état d’avant/)).toBeInTheDocument()
  })

  // #3161 — ce composant est désormais monté SEUL, directement dans
  // `account-context-row` (`flex lg:flex-nowrap`, `AccountDetail.tsx`), au
  // lieu d'être fusionné à l'intérieur d'`AccountContextBand` (qui portait le
  // `min-w-0` pour tous). Sans son propre `min-w-0`, ce cadre ne peut plus
  // rétrécir dans la ligne et pousse ses voisins à la ligne suivante (#2351).
  it('porte son propre min-w-0 — nécessaire pour rétrécir dans la ligne compacte du dossier', () => {
    links.current = base({
      mergedInto: { id: 'a-klesia', companyName: 'KLESIA', status: 'completed', linkedAt: '2026-08-27T09:30:00.000Z' },
    })
    const { container } = render(<LinkedAccountsCard accountId="a-adp" />)
    expect(container.querySelector('.min-w-0.border')).toBeTruthy()
  })
})

// #3465 — la carte arrivait APRÈS le premier rendu et décalait la barre
// d'onglets du dossier. Pendant la lecture, sa place est réservée ; une fois
// lue et vide, elle se libère (jamais un cadre vide).
describe('#3465 — la place est réservée pendant la lecture', () => {
  it('réserve un emplacement invisible et inerte tant que la lecture est en cours', () => {
    links.current = null
    links.pending = true
    render(<LinkedAccountsCard accountId="a1" />)
    const slot = screen.getByTestId('linked-accounts-slot')
    expect(slot).toHaveAttribute('aria-hidden', 'true')
    expect(slot.className).toContain('invisible')
  })

  it('ne réserve rien une fois lue et vide', () => {
    links.current = base()
    links.pending = false
    const { container } = render(<LinkedAccountsCard accountId="a1" />)
    expect(container).toBeEmptyDOMElement()
  })
})

// #4805 — une lecture en ÉCHEC n'est ni « aucun lien » ni un bandeau qui disparaît : on dit de réessayer.
describe('#4805 — une lecture en échec se dit', () => {
  it('rend l’erreur de lecture, pas un cadre vide', () => {
    links.current = null
    links.pending = false
    links.failed = true
    render(<LinkedAccountsCard accountId="a1" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    links.failed = false
  })
})
