import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountKnownMovements } from '@bellum/contracts'

/**
 * #2556 — SUR UN COMPTE DÉJÀ CONNU, UN FAIT NEUF DATÉ ET SOURCÉ — OU L'AVEU
 * HONNÊTE QU'IL N'Y EN A PAS.
 *
 * Le motif que cette suite vise en premier : sur un compte NON connu, cette
 * carte ne rend RIEN — pas un panneau vide, pas une phrase creuse. Produire
 * quelque chose à tout prix sur un compte que la déduction ne reconnaît pas
 * est exactement le risque nommé par le client (François Thomas, 17/09/2026).
 */

type QueryState = { data?: AccountKnownMovements; isPending: boolean; isError: boolean }

const state: { current: QueryState } = {
  current: { data: undefined, isPending: true, isError: false },
}

vi.mock('@/features/accounts/hooks/useAccountKnownMovements', () => ({
  useAccountKnownMovements: () => state.current,
}))

const { AccountKnownMovementsCard } = await import('./AccountKnownMovementsCard')

const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'

beforeEach(() => {
  state.current = { data: undefined, isPending: true, isError: false }
})
afterEach(cleanup)

describe('#2556.1 — compte NON connu : rien ne se rend, jamais un panneau vide', () => {
  it('known:false → aucune trace de la carte dans le DOM', () => {
    state.current = {
      data: { known: false, since: null, lines: [] },
      isPending: false,
      isError: false,
    }
    const { container } = render(<AccountKnownMovementsCard accountId={ACCOUNT_ID} />)
    expect(container).toBeEmptyDOMElement()
  })

  // Témoin — même si `lines` portait des données (ce que le contrat interdit
  // normalement), la carte ne doit JAMAIS les lire avant d'avoir vérifié
  // `known`. Une carte qui inverserait l'ordre afficherait un mouvement sur un
  // compte que la déduction ne reconnaît pas.
  it('témoin — known:false avec des lignes quand même présentes → toujours rien', () => {
    state.current = {
      data: {
        known: false,
        since: null,
        lines: [{ kind: 'job_changes', state: 'ready', reason: null, count: 3, scope: null }],
      },
      isPending: false,
      isError: false,
    }
    const { container } = render(<AccountKnownMovementsCard accountId={ACCOUNT_ID} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('lecture en cours — pas de verdict prématuré', () => {
  it('isPending → rien encore', () => {
    const { container } = render(<AccountKnownMovementsCard accountId={ACCOUNT_ID} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('panne — jamais racontée comme « rien de neuf »', () => {
  it('isError → le titre ET l’aveu de panne, jamais le silence', () => {
    state.current = { data: undefined, isPending: false, isError: true }
    render(<AccountKnownMovementsCard accountId={ACCOUNT_ID} />)
    expect(screen.getByText('Compte déjà connu')).toBeInTheDocument()
    expect(
      screen.getByText(
        "Je n'ai pas pu lire ce qui a bougé. Ce n'est pas « il ne s'est rien passé » — c'est la lecture qui a échoué.",
      ),
    ).toBeInTheDocument()
  })
})

describe('#2556.2 — compte connu : au moins un fait daté/sourcé, ou l’aveu honnête', () => {
  it('rien de neuf → « Tu es à jour », avec la date de la fenêtre', () => {
    state.current = {
      data: {
        known: true,
        since: '2026-08-19T09:00:00.000Z',
        lines: [
          { kind: 'job_changes', state: 'ready', reason: null, count: 0, scope: null },
          { kind: 'missions_moving', state: 'ready', reason: null, count: 0, scope: null },
        ],
      },
      isPending: false,
      isError: false,
    }
    render(<AccountKnownMovementsCard accountId={ACCOUNT_ID} />)
    expect(screen.getByText(/Tu es à jour/)).toBeInTheDocument()
  })

  it('un mouvement mesuré → sa phrase, réutilisée du Brief (GA-26), pas un texte inventé', () => {
    state.current = {
      data: {
        known: true,
        since: '2026-08-19T09:00:00.000Z',
        lines: [
          { kind: 'job_changes', state: 'ready', reason: null, count: 1, scope: null },
          { kind: 'missions_moving', state: 'ready', reason: null, count: 0, scope: null },
        ],
      },
      isPending: false,
      isError: false,
    }
    render(<AccountKnownMovementsCard accountId={ACCOUNT_ID} />)
    expect(screen.getByText("1 contact a changé d'entreprise — une porte neuve")).toBeInTheDocument()
    // La ligne à zéro ne parle pas (`sinceLastVisitLineSpeaks`) : elle n'ajoute
    // pas un « 0 mission » creux à côté du vrai mouvement.
    expect(screen.queryByText(/passe sous/)).not.toBeInTheDocument()
  })

  it('une ligne non mesurable garde sa phrase de silence, jamais un compte inventé', () => {
    state.current = {
      data: {
        known: true,
        since: '2026-08-19T09:00:00.000Z',
        lines: [
          {
            kind: 'job_changes',
            state: 'unavailable',
            reason: 'account_job_changes_unavailable',
            count: null,
            scope: null,
          },
          { kind: 'missions_moving', state: 'ready', reason: null, count: 0, scope: null },
        ],
      },
      isPending: false,
      isError: false,
    }
    render(<AccountKnownMovementsCard accountId={ACCOUNT_ID} />)
    expect(
      screen.getByText("Les changements de poste n'ont pas pu être lus. Ce n'est pas « personne n'a bougé »."),
    ).toBeInTheDocument()
  })
})
