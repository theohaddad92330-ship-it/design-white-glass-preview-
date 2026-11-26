import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RagDocument } from '@/features/rag/api'
import { AccountAttachedDocumentsCard } from './AccountAttachedDocumentsCard'

/**
 * #3623.4 (recette prod 09/10, écriture) — « après le lancement, la pièce
 * jointe disparaît de l'écran : la fiche du compte analysé (onglet
 * documents/sources) doit lister le CSV joint avec "Rattachée à <compte>" ».
 */
let docs: RagDocument[] = []
let runs: { id: string; created_at: string; completed_at: string | null }[] = []
vi.mock('@/features/accounts/hooks/useAccountRuns', () => ({
  useAccountRuns: () => ({ data: runs }),
}))
vi.mock('@/features/rag/hooks/useRagDocuments', () => ({
  useRagDocuments: () => ({ data: docs, isLoading: false }),
}))

function makeDoc(overrides: Partial<RagDocument> = {}): RagDocument {
  return {
    id: 'doc-1',
    title: 'recherches-decathlon.csv',
    category: 'Autre',
    created_at: '2026-10-09T00:00:00.000Z',
    user_id: 'u1',
    scope: 'account',
    account_id: 'acc-decathlon',
    ...overrides,
  }
}

describe('#3623.4 — AccountAttachedDocumentsCard', () => {
  beforeEach(() => {
    runs = []
  })

  it('liste un document rattaché à CE compte avec « Rattachée à <compte> »', () => {
    docs = [makeDoc()]
    render(<AccountAttachedDocumentsCard accountId="acc-decathlon" companyName="decathlon" />)
    expect(screen.getByText('recherches-decathlon.csv')).toBeInTheDocument()
    // `capitalize` sur le nom du compte, comme le reste de l'écran.
    expect(screen.getByText('Rattachée à Decathlon')).toBeInTheDocument()
  })

  it('ne liste PAS un document rattaché à un AUTRE compte', () => {
    docs = [makeDoc({ account_id: 'acc-autre-compte' })]
    render(<AccountAttachedDocumentsCard accountId="acc-decathlon" companyName="decathlon" />)
    expect(screen.queryByText('recherches-decathlon.csv')).not.toBeInTheDocument()
  })

  it('ne liste PAS un document de portée `workspace` ou `personal`', () => {
    docs = [makeDoc({ scope: 'workspace' }), makeDoc({ id: 'doc-2', scope: 'personal' })]
    render(<AccountAttachedDocumentsCard accountId="acc-decathlon" companyName="decathlon" />)
    expect(screen.queryByText('recherches-decathlon.csv')).not.toBeInTheDocument()
  })

  it('⚠️ SAIT DIRE NON — aucun document rattaché : rien ne se rend (jamais une carte vide)', () => {
    docs = []
    const { container } = render(<AccountAttachedDocumentsCard accountId="acc-decathlon" companyName="decathlon" />)
    expect(container).toBeEmptyDOMElement()
  })
})

// #4294.2 (décision de Louis, 29/10/2026) — le rattachement tardif se joue côté serveur, invisible du navigateur :
// « l'écran le DIT ». Une pièce finie d'être envoyée APRÈS le lancement porte « Ajoutée après le lancement » + son heure.
describe('#4294.2 — une pièce ajoutée après le lancement le dit, avec son heure', () => {
  const LAUNCH = '2026-10-29T09:00:00.000Z'

  it('pièce créée après le lancement de l’analyse en cours : « Ajoutée après le lancement » et l’heure', () => {
    runs = [{ id: 'run-1', created_at: LAUNCH, completed_at: null }]
    docs = [makeDoc({ created_at: '2026-10-29T09:00:42.000Z' })]
    render(<AccountAttachedDocumentsCard accountId="acc-decathlon" companyName="decathlon" />)
    const line = screen.getByTestId('attached-late')
    expect(line).toHaveTextContent(/^Ajoutée après le lancement · \d{2}:\d{2}$/)
  })

  it('SAIT DIRE NON — pièce créée avant le lancement : aucune mention', () => {
    runs = [{ id: 'run-1', created_at: LAUNCH, completed_at: null }]
    docs = [makeDoc({ created_at: '2026-10-29T08:59:30.000Z' })]
    render(<AccountAttachedDocumentsCard accountId="acc-decathlon" companyName="decathlon" />)
    expect(screen.queryByTestId('attached-late')).toBeNull()
  })

  it('SAIT DIRE NON — pièce créée après la FIN de l’analyse : pas un rattachement tardif', () => {
    runs = [{ id: 'run-1', created_at: LAUNCH, completed_at: '2026-10-29T09:10:00.000Z' }]
    docs = [makeDoc({ created_at: '2026-10-29T11:00:00.000Z' })]
    render(<AccountAttachedDocumentsCard accountId="acc-decathlon" companyName="decathlon" />)
    expect(screen.queryByTestId('attached-late')).toBeNull()
  })

  it('SAIT DIRE NON — aucune analyse connue : rien n’est affirmé', () => {
    runs = []
    docs = [makeDoc({ created_at: '2026-10-29T09:00:42.000Z' })]
    render(<AccountAttachedDocumentsCard accountId="acc-decathlon" companyName="decathlon" />)
    expect(screen.queryByTestId('attached-late')).toBeNull()
  })
})
