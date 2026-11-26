import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import { AccountCrmProvenanceProvider } from '@/features/crm/hooks/useAccountCrmProvenance'
import { apiFetch } from '@/lib/api'
import { TabAccess } from './TabAccess'

vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))

/**
 * #4680 — l'axe RELATION non évalué ne dit plus « ton CRM n'est pas connecté » quand le compte porte déjà des
 * contacts de provenance connue (import / CRM) : la phrase serait fausse à dix centimètres du bandeau « N dans ton CRM ».
 * Sans contact connu, l'écran dit EXACTEMENT ce qu'il disait.
 */
const apiFetchMock = vi.mocked(apiFetch)
const ACCOUNT = { id: 'acc-1', status: 'completed', last_analyzed_at: '2026-08-20T09:00:00.000Z' } as Account

const LANDSCAPE = {
  lock: { state: 'inconnu', fact: null },
  modes: [],
  cost: null,
  facts: [],
  entities: [],
  avoidGroupEntry: false,
  warning: null,
  community: null,
  question: null,
  barrier: null,
  addressability: { score: 9, max: 11, unmeasured: ['relation'], factors: [] },
}

const NO_CRM_CLAIM =
  'Relation — aucun rapprochement possible : ton CRM n’est pas connecté, ou il n’a rien retrouvé sur ce compte.'

function serve(provenance: unknown) {
  apiFetchMock.mockImplementation((...args: Parameters<typeof apiFetch>) => {
    const first: unknown = args[0]
    const path = typeof first === 'string' ? first : ((first as { path?: string } | undefined)?.path ?? '')
    return Promise.resolve(path.includes('provenance') ? provenance : LANDSCAPE)
  })
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <AccountCrmProvenanceProvider accountId="acc-1">
        <TabAccess account={ACCOUNT} />
      </AccountCrmProvenanceProvider>
    </QueryClientProvider>,
  )
}

describe('TabAccess — contacts connus et axe relation (#4680)', () => {
  beforeEach(() => apiFetchMock.mockReset())
  afterEach(cleanup)

  it('un contact importé rattaché au compte : la raison ne prétend PAS que le CRM n’est pas connecté', async () => {
    serve({ accountFromCrm: true, contacts: [], knownContacts: { count: 1, importedAt: null } })
    mount()
    expect(await screen.findByText(/1 contact connu de ton équipe est déjà rattaché à ce compte/)).toBeInTheDocument()
    expect(screen.queryByText(NO_CRM_CLAIM)).toBeNull()
  })

  it('plusieurs contacts connus : le pluriel est dit', async () => {
    serve({ accountFromCrm: true, contacts: [], knownContacts: { count: 3, importedAt: null } })
    mount()
    expect(
      await screen.findByText(/3 contacts connus de ton équipe sont déjà rattachés à ce compte/),
    ).toBeInTheDocument()
  })

  it('SAIT DIRE NON — aucun contact connu : la phrase d’avant, mot pour mot', async () => {
    serve({ accountFromCrm: false, contacts: [] })
    mount()
    expect(await screen.findByText(NO_CRM_CLAIM)).toBeInTheDocument()
  })
})
