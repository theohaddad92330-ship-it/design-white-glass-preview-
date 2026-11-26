import type { SessionUser } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2567.K2 — « CE QUI ATTEND TA DÉCISION », PROMU HORS DE « MON ACTIVITÉ ».
 *
 * Retour client (François Thomas, 17/09/2026) : sans intention de prospecter,
 * rien sur `/briefing` ne donne de raison d'ouvrir l'outil. La file
 * d'interventions (suivi de mission, CRA, facturation, besoins…) existait
 * déjà — `MyActivityBlock`, bloc 5, « Ce qui m'attend » — mais en position 9,
 * sous un titre de tableau de bord financier. Ces trois tests reprennent tels
 * quels ceux de l'ancien bloc 3 de `MyActivityBlock.test.tsx` : le moteur
 * (`myQueue`, `interventionHref`, l'ordre du serveur) ne change pas, seul
 * l'ENDROIT où il se lit change.
 */
const interventions = vi.fn()

vi.mock('@/features/playbooks/api', () => ({ useInterventions: () => interventions() }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to ?? '#'}>{children}</a>,
}))

const { useCurrentUserStore } = await import('@/stores/currentUserStore')
const { DailyGesturesBlock } = await import('./DailyGesturesBlock')

const ME: SessionUser = {
  id: 'moi',
  email: 'commercial@exemple.fr',
  created_at: '2026-01-01T00:00:00.000Z',
  roles: ['customer'],
}

const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false, error: null })
const loading = () => ({ data: undefined, isLoading: true, isError: false, error: null })
const broken = () => ({ data: undefined, isLoading: false, isError: true, error: { status: 500 } })

const intervention = (id: string, ownerId: string | null, kind = 'renewal_at_risk') => ({
  id,
  kind,
  subjectType: 'mission',
  subjectId: `s-${id}`,
  subjectLabel: null,
  ownerId,
  ownerName: null,
  detail: `Ligne ${id} : fin prévue dans 12 jours, aucun renouvellement ouvert.`,
  state: 'open',
  openedAt: '2026-08-20T08:00:00.000Z',
  resolvedAt: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  useCurrentUserStore.setState({ currentUser: ME })
})

describe('DailyGesturesBlock', () => {
  it('ne montre QUE mes lignes, cinq au plus, et annonce ce qu’elle replie', () => {
    const mine = Array.from({ length: 8 }, (_, index) => intervention(`i${index}`, 'moi'))
    interventions.mockReturnValue(ok([...mine, intervention('voisin', 'quelqu-un-dautre')]))
    render(<DailyGesturesBlock />)
    expect(screen.getAllByText(/Ligne i\d/)).toHaveLength(5)
    expect(screen.queryByText(/Ligne voisin/)).not.toBeInTheDocument()
    expect(screen.getByText('et 3 autres')).toBeInTheDocument()
  })

  it('PRÉSERVE l’ordre du serveur — le classement gravité × âge ne se refait pas ici', () => {
    interventions.mockReturnValue(
      ok([intervention('zzz', 'moi'), intervention('aaa', 'moi'), intervention('mmm', 'moi')]),
    )
    render(<DailyGesturesBlock />)
    const rendered = screen.getAllByText(/Ligne \w+ :/).map(node => node.textContent)
    expect(rendered[0]).toContain('zzz')
    expect(rendered[1]).toContain('aaa')
    expect(rendered[2]).toContain('mmm')
  })

  it('dit qu’il n’y a rien plutôt que de rester vide', () => {
    interventions.mockReturnValue(ok([]))
    render(<DailyGesturesBlock />)
    expect(screen.getByText(/Rien n’attend de décision/)).toBeInTheDocument()
  })

  it('une lecture en panne le DIT, jamais un vide muet', () => {
    interventions.mockReturnValue(broken())
    render(<DailyGesturesBlock />)
    expect(screen.getByText('Indisponible')).toBeInTheDocument()
  })

  it('pendant le chargement, ne conclut ni au vide ni à la panne', () => {
    interventions.mockReturnValue(loading())
    render(<DailyGesturesBlock />)
    expect(screen.queryByText(/Rien n’attend de décision/)).not.toBeInTheDocument()
    expect(screen.queryByText('Indisponible')).not.toBeInTheDocument()
  })
})
