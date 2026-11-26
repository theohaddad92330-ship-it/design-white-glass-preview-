import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { GroupEntity } from '@/features/accounts/api'
import { GroupEntitiesCard } from './GroupEntitiesCard'

/**
 * #4158.60 / .61 / .62 (EX-03, arbitrage Louis 15/10/2026) — « une fiche par entité ».
 *
 * La carte NOMME les autres entités du groupe, chacune avec son responsable et ses
 * compteurs à elle (jamais ceux du groupe). Elle ne donne aucun droit : l'API ne renvoie
 * que les entités du périmètre du lecteur.
 */

const state = vi.hoisted(() => ({ data: undefined as GroupEntity[] | undefined, pending: false }))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: state.data, isPending: state.pending }),
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({
    data: [{ userId: 'u-lea', email: 'lea@exemple.test', fullName: 'Léa Marchand', role: 'sales', isSelf: false }],
  }),
}))
vi.mock('@/features/team-guardrails/components/EntityCoverage', () => ({ EntityCoverage: () => null }))
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

const entity = (over: Partial<GroupEntity> = {}): GroupEntity => ({
  id: 'a-2',
  companyName: 'Orange France',
  role: 'filiale',
  ownerUserId: 'u-lea',
  openActions: 2,
  notes: 1,
  ...over,
})

describe('GroupEntitiesCard — une fiche par entité du groupe (#4158.60-.62)', () => {
  it('n’affiche RIEN tant que la réponse n’est pas arrivée', () => {
    state.data = undefined
    const { container } = render(<GroupEntitiesCard accountId="a-1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('n’affiche RIEN quand le compte n’a aucune autre entité visible (une absence ne fait aucune ligne)', () => {
    state.data = []
    const { container } = render(<GroupEntitiesCard accountId="a-1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('nomme chaque entité, son responsable en clair et ses propres compteurs', () => {
    state.data = [entity()]
    render(<GroupEntitiesCard accountId="a-1" />)
    expect(screen.getByRole('link', { name: /Orange France/ })).toBeInTheDocument()
    expect(screen.getByText(/Léa Marchand/)).toBeInTheDocument()
    expect(screen.getByText(/2 actions ouvertes/)).toBeInTheDocument()
    expect(screen.getByText(/1 note/)).toBeInTheDocument()
  })

  it('une entité sans responsable le DIT, elle n’invente pas de nom', () => {
    state.data = [entity({ ownerUserId: null })]
    render(<GroupEntitiesCard accountId="a-1" />)
    expect(screen.getByText(/Sans responsable/)).toBeInTheDocument()
  })

  it('un responsable inconnu de l’espace n’est pas affiché sous un identifiant brut', () => {
    state.data = [entity({ ownerUserId: 'u-inconnu' })]
    render(<GroupEntitiesCard accountId="a-1" />)
    expect(screen.queryByText(/u-inconnu/)).not.toBeInTheDocument()
    expect(screen.getByText(/Sans responsable/)).toBeInTheDocument()
  })
})
